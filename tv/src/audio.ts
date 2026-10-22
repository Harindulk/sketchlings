// Creature voices + narrator through Vega's W3C media stack (notes/audio.md): AAC-LC in fragmented MP4. Creature
// lines come from the server (/voice/<id>/<line>.m4a), narrator clips are bundled. Never throws, never blocks the UI.
// The race plays only short narrator clips: 3-2-1-GO, ROAR and a photo finish.
//
// One AudioPlayer, one MediaSource and one SourceBuffer for the whole session (notes/tv.md F13): each clip is
// appended after the previous one and played from its start, then paused. The player's source is never swapped:
// a new MediaSource per clip (a srcObject swap) crashed libW3CMedia.so (SIGSEGV) about 1 in 8 Reveal/Results screens.
import {HTTP_BASE, SOUND} from './config';

const MIME = 'audio/mp4; codecs="mp4a.40.2"';

export const sound = {enabled: SOUND};
/** Last playback state, shown in the race perf overlay (Menu key) to check audio on a silent device. */
export const audioStatus = {
  state: SOUND ? 'idle' : 'muted',
  ended: 0, // clips that played to the end (or were stopped by hush)
  voices: 0, // ...of which were creature voices fetched from the server
  last: '',
  mode: '', // 'MSE'
};

type W3C = typeof import('@amazon-devices/react-native-w3cmedia');
let player: InstanceType<W3C['AudioPlayer']> | null = null;
let sb: ReturnType<InstanceType<W3C['MediaSource']>['addSourceBuffer']> | null = null;
let ready: Promise<void> | null = null;
let appended = 0; // end of everything appended so far (s): the next clip goes there
let seq = 0;
let broken = false;
const clips = new Map<string, Promise<Uint8Array | null>>();

/** Start downloading a creature line early (they are small), so the reveal never waits on the network. */
export function prefetch(path?: string) {
  if (!path || !sound.enabled || clips.has(path)) return;
  clips.set(
    path,
    fetch(HTTP_BASE + path)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((b) => (b ? new Uint8Array(b) : null))
      .catch(() => null),
  );
}

// Clips never interrupt each other (F7): a clip plays to its end; a newer creature line waits for it (latest wins);
// narrator lines are simply dropped while a clip plays. Only hush() cuts a clip short.
let busyUntil = 0; // safety cap in case the end timer never runs
let pendingVoice: string | undefined;
let endTimer = 0;
let until = 0; // end of the clip that is playing (s), 0 when none
let heard = false; // 'playing' arrived for that clip
const busy = () => Date.now() < busyUntil;

/** Play a server-relative creature line, e.g. sketchling.voice.intro. */
export async function say(path?: string) {
  if (!path || !sound.enabled) return;
  prefetch(path);
  if (busy()) {
    pendingVoice = path;
    return;
  }
  const my = ++seq;
  const bytes = await clips.get(path);
  if (bytes && my === seq && !busy()) await play(bytes, my, true);
}

/** Bundled narrator clip: three two one go roar photo-finish winner-is meet-sketchlings doodle-boost ... */
export async function narrator(id: string) {
  if (!sound.enabled || busy()) return;
  const my = ++seq;
  const b64 = require('./assets/narrator').NARRATOR[id] as string | undefined;
  if (b64) await play(decode64(b64), my, false);
}

/** Leaving a screen or the race mounting: forget queued lines and stop the one playing (a pause is safe, F13). */
export function hush() {
  seq++;
  pendingVoice = undefined;
  finished();
}

/** Set the player up before the Reveal, so the first line isn't late (a cold setup took up to 3.7 s on the VVD). */
export function warm() {
  if (!sound.enabled || broken || ready) return;
  ready = setup();
  ready.catch(() => {}); // play() sees the same rejection and turns sound off
}

async function setup() {
  // loaded lazily so the media stack costs nothing at launch (TTFD) or when sound is off
  const lib = require('@amazon-devices/react-native-w3cmedia') as W3C;
  const p = new lib.AudioPlayer(
    lib.AudioContentType.CONTENT_TYPE_SPEECH,
    lib.AudioUsageType.USAGE_GAME,
  );
  await p.initialize();
  p.addEventListener('playing', () => {
    audioStatus.state = 'playing';
    heard = !!until;
  });
  // No endOfStream, so no 'ended': the clip has run out of data when 'waiting' follows 'playing' (it comes ~0.1 s
  // before the last samples are heard), so pause a little later.
  p.addEventListener('waiting', () => {
    if (!until || !heard) return;
    clearTimeout(endTimer);
    endTimer = setTimeout(finished, 400);
  });
  p.addEventListener('error', () => (audioStatus.state = `error ${p.error?.code ?? ''}`));
  const ms = new lib.MediaSource();
  await new Promise<void>((resolve) => {
    ms.onsourceopen = () => resolve();
    p.srcObject = ms; // once per session
  });
  sb = ms.addSourceBuffer(MIME);
  player = p;
  audioStatus.mode = 'MSE';
}

function append(bytes: Uint8Array) {
  return new Promise<void>((resolve) => {
    const done = () => {
      sb!.removeEventListener('updateend', done);
      resolve();
    };
    sb!.addEventListener('updateend', done);
    sb!.appendBuffer(bytes); // whole clip = init segment + one fragment
  });
}

function finished() {
  if (!until) return;
  until = 0;
  clearTimeout(endTimer);
  player?.pause();
  audioStatus.state = 'ended';
  audioStatus.ended++;
  if (audioStatus.last === 'voice') audioStatus.voices++;
  busyUntil = 0;
  const next = pendingVoice;
  pendingVoice = undefined;
  if (next) say(next);
}

async function play(bytes: Uint8Array, my: number, voice: boolean) {
  if (!sound.enabled || broken) return;
  try {
    ready ??= setup();
    await ready;
    if (my !== seq || !player || !sb || busy()) return;
    busyUntil = Date.now() + 5000;
    audioStatus.last = voice ? 'voice' : 'narrator';
    const start = appended;
    sb.timestampOffset = start;
    await append(bytes);
    const b = sb.buffered;
    appended = b.length ? b.end(b.length - 1) : start;
    const ms = (appended - start) * 1000;
    if (my !== seq || ms <= 0) {
      busyUntil = 0; // hushed while appending: the clip stays in the buffer unplayed
      return;
    }
    busyUntil = Date.now() + ms + 2000;
    player.currentTime = start;
    until = appended;
    heard = false;
    endTimer = setTimeout(finished, ms + 1500); // in case 'waiting' never comes
    await player.play();
    audioStatus.state = 'play() ok';
  } catch (e) {
    // shortcut: the first failure (e.g. the Virtual Device has no audio service) turns sound off for the session
    console.log('[audio] disabled:', String(e));
    audioStatus.state = `off: ${String(e).slice(0, 40)}`;
    broken = true;
    busyUntil = 0;
  }
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const LOOKUP = new Uint8Array(128);
for (let i = 0; i < B64.length; i++) LOOKUP[B64.charCodeAt(i)] = i;

export function decode64(s: string): Uint8Array {
  const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  const out = new Uint8Array((s.length / 4) * 3 - pad);
  for (let i = 0, o = 0; i < s.length; i += 4) {
    const n =
      (LOOKUP[s.charCodeAt(i)] << 18) |
      (LOOKUP[s.charCodeAt(i + 1)] << 12) |
      (LOOKUP[s.charCodeAt(i + 2)] << 6) |
      LOOKUP[s.charCodeAt(i + 3)];
    if (o < out.length) out[o++] = n >> 16;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}
