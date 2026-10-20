// Creature voices + narrator through Vega's W3C media stack (notes/audio.md): AAC-LC in fragmented MP4, appended
// whole to an AudioPlayer through MSE. Creature lines come from the server (/voice/<id>/<line>.m4a), narrator clips
// are bundled. One clip at a time: a newer call interrupts the current one. Never throws, never blocks the UI.
import {HTTP_BASE, SOUND} from './config';

const MIME = 'audio/mp4; codecs="mp4a.40.2"';

export const sound = {enabled: SOUND};
/** Last playback state, shown in the race perf overlay (Menu key) to check audio on a silent device. */
export const audioStatus = {
  state: SOUND ? 'idle' : 'muted',
  ended: 0, // clips that played to the end ('ended' event)
  voices: 0, // ...of which were creature voices fetched from the server
  last: '',
  mode: '', // 'MSE' or 'URL' (fallback)
};

type W3C = typeof import('@amazon-devices/react-native-w3cmedia');
let lib: W3C | null = null;
let player: InstanceType<W3C['AudioPlayer']> | null = null;
let ready: Promise<void> | null = null;
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

// Clips never interrupt each other: on the VVD, swapping the source of a playing AudioPlayer (a reveal skip, or
// countdown narration over a creature voice) left the app's timers/rAF starved (notes/tv.md). A clip plays to its
// end; a newer creature line waits for it (latest wins); narrator lines are simply dropped while a clip plays.
let busyUntil = 0; // safety cap in case 'ended' never arrives
let pendingVoice: string | undefined;
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
  if (bytes && my === seq && !busy()) await play(bytes, my, HTTP_BASE + path);
}

/** Bundled narrator clip: three two one go roar photo-finish winner-is meet-sketchlings doodle-boost ... */
export async function narrator(id: string) {
  if (!sound.enabled || busy()) return;
  const my = ++seq;
  const b64 = require('./assets/narrator').NARRATOR[id] as string | undefined;
  if (b64) await play(decode64(b64), my);
}

/** Leaving a screen: forget queued lines (the playing clip finishes on its own; it is at most a few seconds). */
export function hush() {
  seq++;
  pendingVoice = undefined;
}

async function play(bytes: Uint8Array, my: number, url?: string) {
  if (!sound.enabled || broken) return;
  try {
    if (!ready) {
      // loaded lazily so the media stack costs nothing at launch (TTFD) or when sound is off
      lib = require('@amazon-devices/react-native-w3cmedia') as W3C;
      console.log(
        '[audio] MSE',
        MIME,
        'supported:',
        lib.MediaSource.isTypeSupported(MIME),
      );
      player = new lib.AudioPlayer(
        lib.AudioContentType.CONTENT_TYPE_SPEECH,
        lib.AudioUsageType.USAGE_GAME,
      );
      ready = player.initialize();
      player.addEventListener('ended', () => {
        audioStatus.state = 'ended';
        audioStatus.ended++;
        if (audioStatus.last === 'voice') audioStatus.voices++;
        busyUntil = 0;
        const next = pendingVoice;
        pendingVoice = undefined;
        if (next) say(next);
      });
      player.addEventListener('playing', () => (audioStatus.state = 'playing'));
      player.addEventListener(
        'error',
        () => (audioStatus.state = `error ${player?.error?.code ?? ''}`),
      );
    }
    await ready;
    if (my !== seq || !player || !lib || busy()) return;
    busyUntil = Date.now() + 7000;
    audioStatus.last = url ? 'voice' : 'narrator';
    try {
      const ms = new lib.MediaSource();
      await new Promise<void>((resolve) => {
        ms.onsourceopen = () => resolve();
        player!.srcObject = ms;
      });
      const sb = ms.addSourceBuffer(MIME);
      await new Promise<void>((resolve) => {
        sb.onupdateend = () => resolve();
        sb.appendBuffer(bytes); // whole clip = init segment + one fragment
      });
      ms.endOfStream();
      audioStatus.state = 'appended';
      audioStatus.mode = 'MSE';
    } catch (e) {
      if (!url) throw e;
      player.src = url; // MSE append failed: the clips are valid MP4 files, try URL mode
      audioStatus.mode = 'URL';
    }
    if (my === seq) {
      await player.play();
      if (audioStatus.state === 'appended') audioStatus.state = 'play() ok';
    }
  } catch (e) {
    // shortcut: the first failure (e.g. the Virtual Device has no audio service) turns sound off for the session
    console.log('[audio] disabled:', String(e));
    audioStatus.state = `off: ${String(e).slice(0, 40)}`;
    broken = true;
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
