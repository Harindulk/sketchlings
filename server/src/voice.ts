// Creature voices: Kokoro-82M (local, Apache-2.0) speaks each Sketchling's lines, ffmpeg pitch-shifts them into a
// creature voice and encodes AAC-LC in fragmented MP4 (.m4a), the format the Vega TV plays through MSE.
// The model runs in a child process (tts-worker.ts): onnxruntime aborts Bun at exit, and a native crash or hang
// there must never take the game server down with it.
import {createHash} from 'node:crypto';
import {existsSync, linkSync, mkdirSync, renameSync, rmSync, statSync} from 'node:fs';
import {join} from 'node:path';
import type {Sketchling} from '../../shared/protocol';

export const MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const LINES = ['intro', 'catchphrase', 'winLine'] as const;
export type Line = (typeof LINES)[number];
export const FFMPEG = Bun.which('ffmpeg') ?? '/opt/homebrew/bin/ffmpeg';

export interface Tts {
  /** Speak `text` in voice `v`, write the finished .m4a to `out`, resolve to its length in ms. */
  clip(text: string, v: VoiceProfile, out: string, signal?: AbortSignal): Promise<number>;
}
export interface VoiceProfile {
  kind: 'tiny' | 'buddy' | 'big';
  voice: string; // Kokoro voice id
  semitones: number; // pitch shift applied by ffmpeg
  speed: number; // Kokoro speaking speed
}

// ---------- voice selection (deterministic from the persona) ----------

const BIG = /\b(big|giant|huge|mighty|strong|tough|grumpy|king|queen|duke|admiral|boss|whale|walrus|bear|dino|dinosaur|dragon|monster|troll|elephant|hippo|rhino|gorilla|moose|giraffe|lighthouse|beanstalk|rocket|boulder|thunder|rumble|stomp|stomps|roar|roars|chunky)\b/gi;
const SMALL = /\b(little|tiny|baby|small|mini|wee|teeny|cute|sweet|giggly|squeaky|fluffy|bunny|kitten|mouse|bean|gumdrop|ladybug|snail|puffball|muffin|bubbles|sprinkles|pip|bee|chick|duckling|butterfly|fairy|pixie)\b/gi;
const FEMALE = /\b(lady|princess|queen|miss|auntie|granny|duchess|she|her)\b/i;
const MALE = /\b(sir|prince|king|mister|uncle|duke|grandpa|he|his)\b/i;
const FANCY = /\b(sir|lady|professor|duke|duchess|prince|princess|king|queen|admiral|lord|baron)\b/i;
// Only Kokoro's better-graded voices (VOICES.md grades A to C).
const VOICES = {us: {f: ['af_heart', 'af_bella', 'af_sarah'], m: ['am_puck', 'am_michael', 'am_fenrir']}, uk: {f: ['bf_emma', 'bf_isabella'], m: ['bm_george', 'bm_fable']}};
const PITCH = {tiny: 4.5, buddy: 2, big: -2.5};

/** Small/cute creatures get a higher, quicker voice, big/grumpy ones a lower, slower one. Same name -> same voice. */
export function pickVoice(s: Pick<Sketchling, 'name' | 'title' | 'personality' | 'stats'>): VoiceProfile {
  const words = `${s.name} ${s.title} ${s.personality}`;
  const score = (text: string) => (text.match(BIG)?.length ?? 0) - (text.match(SMALL)?.length ?? 0);
  // Name and title count double: "Little Waffles" stays little even after "a big bowl of noodles".
  const size = 2 * score(`${s.name} ${s.title}`) + score(s.personality) + (s.stats.power - s.stats.speed) / 2;
  const kind = size >= 1 ? 'big' : size <= -1 ? 'tiny' : 'buddy';
  const h = createHash('sha256').update(s.name).digest().readUInt32BE(0);
  const female = FEMALE.test(words) && !MALE.test(s.name) ? true : MALE.test(words) ? false : h % 2 === 0;
  const list = VOICES[FANCY.test(s.name) ? 'uk' : 'us'][female ? 'f' : 'm'];
  const jitter = ((h >>> 8) % 5 - 2) * 0.3; // +-0.6 semitones so two tiny creatures don't sound identical
  return {
    kind,
    voice: list[(h >>> 4) % list.length]!,
    semitones: Math.round((PITCH[kind] + jitter) * 10) / 10,
    speed: Math.round((0.92 + 0.04 * (s.stats.speed - 1)) * (kind === 'big' ? 0.95 : 1) * 100) / 100,
  };
}

// ---------- audio ----------

/** Cuts Kokoro's ~0.3 s lead-in and ~0.4 s tail (anything 50 dB under the peak), keeping a short margin. */
export function trimSilence(pcm: Float32Array, sampleRate: number): Float32Array {
  let peak = 0;
  for (const x of pcm) peak = Math.max(peak, Math.abs(x));
  let a = 0;
  let b = pcm.length;
  while (a < b && Math.abs(pcm[a]!) <= peak * 0.003) a++;
  while (b > a && Math.abs(pcm[b - 1]!) <= peak * 0.003) b--;
  return pcm.subarray(Math.max(0, a - Math.round(sampleRate * 0.03)), Math.min(pcm.length, b + Math.round(sampleRate * 0.06)));
}

/** Float PCM -> trimmed, pitch-shifted, loudness-normalised AAC-LC mono 44.1 kHz in fragmented MP4, written atomically
 * to `out`. Resolves to the clip length in ms. */
export async function encodeM4a(raw: Float32Array, sampleRate: number, semitones: number, out: string): Promise<number> {
  const pcm = trimSilence(raw, sampleRate);
  const p = 2 ** (semitones / 12);
  // asetrate moves pitch and formants together (the creature sound) but also speeds up; atempo restores the pace.
  const af = `asetrate=${Math.round(sampleRate * p)},atempo=${(1 / p).toFixed(5)},acompressor=threshold=-24dB:ratio=4:attack=3:release=60,loudnorm=I=-18:TP=-1.5:LRA=7`;
  const tmp = `${out}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  const proc = Bun.spawn(
    [FFMPEG, '-v', 'error', '-nostdin', '-y', '-f', 'f32le', '-ar', String(sampleRate), '-ac', '1', '-i', 'pipe:0', '-af', af,
      '-ar', '44100', '-ac', '1', '-c:a', 'aac', '-b:a', '80k',
      // skip_trailer: no mfra box after the fragments, which strict MSE parsers may reject
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof+skip_trailer', '-f', 'mp4', tmp],
    {stdin: new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength), stdout: 'ignore', stderr: 'pipe'},
  );
  const [code, err] = await Promise.all([proc.exited, new Response(proc.stderr).text()]);
  if (code !== 0) {
    rmSync(tmp, {force: true});
    throw new Error(`ffmpeg exited ${code}: ${err.trim().slice(0, 300)}`);
  }
  renameSync(tmp, out);
  return Math.round((pcm.length / sampleRate) * 1000); // the pitch shift keeps the length
}

export const hasModel = (modelsDir: string) => existsSync(join(modelsDir, MODEL_ID, 'onnx', 'model.onnx'));

/** In-process Kokoro (used by tts-worker.ts and tts:download). Only `download` lets it reach the network. */
export async function loadKokoro(modelsDir: string, download = false) {
  const {env} = await import('@huggingface/transformers');
  const {KokoroTTS} = await import('kokoro-js');
  env.cacheDir = modelsDir;
  env.allowRemoteModels = download;
  const model = await KokoroTTS.from_pretrained(MODEL_ID, {dtype: 'fp32', device: 'cpu'}); // fp32 beat q8 on Apple silicon
  await model.generate('Hi!', {voice: 'af_heart'}); // warm-up so the first real line is fast
  return {
    async clip(text: string, v: VoiceProfile, out: string) {
      const a = await model.generate(text, {voice: v.voice as 'af_heart', speed: v.speed});
      return encodeM4a(a.audio, a.sampling_rate, v.semitones, out);
    },
  } satisfies Tts;
}

/** Lazy Kokoro in a child process; resolves null (voices off) without a model. A killed or crashed worker is
 * replaced on the next call. */
export function kokoro(modelsDir: string): () => Promise<Tts | null> {
  let current: Promise<Tts | null> | undefined;
  return () => (current ??= hasModel(modelsDir) ? spawnWorker() : noModel());

  async function noModel() {
    console.warn(`[voice] no Kokoro model in ${modelsDir}; creature voices are off (run: bun run tts:download)`);
    return null;
  }
  function spawnWorker(): Promise<Tts | null> {
    const pending = new Map<number, {resolve: (ms: number) => void; reject: (e: Error) => void}>();
    let seq = 0;
    const me: Promise<Tts | null> = new Promise<Tts | null>(ready => {
      const forget = () => void (current === me && (current = undefined));
      const child = Bun.spawn([process.execPath, join(import.meta.dir, 'tts-worker.ts'), modelsDir], {
        stdio: ['ignore', 'inherit', 'inherit'],
        ipc(m: {ready?: boolean; id?: number; ms?: number; error?: string}) {
          if (m.ready !== undefined) {
            clearTimeout(slow);
            return ready(m.ready ? tts : null);
          }
          const p = pending.get(m.id!);
          pending.delete(m.id!);
          if (m.error) p?.reject(new Error(m.error));
          else p?.resolve(m.ms!);
        },
        onExit(_, code, signal) {
          for (const p of pending.values()) p.reject(new Error(`TTS worker exited (${signal ?? code})`));
          pending.clear();
          ready(null);
          forget();
        },
      });
      child.unref(); // never keeps the server or a test run alive
      const slow = setTimeout(() => child.kill(), 120_000); // model load stuck
      const tts: Tts = {
        clip: (text, v, out, signal) =>
          new Promise((resolve, reject) => {
            if (child.exitCode !== null || child.signalCode) return reject(new Error('TTS worker is gone'));
            const id = ++seq;
            pending.set(id, {resolve, reject});
            child.send({id, text, v, out});
            signal?.addEventListener('abort', () => (forget(), child.kill()), {once: true}); // hung: replace the worker
          }),
      };
    }).catch(e => {
      console.error('[voice] could not start the TTS worker; creature voices are off:', e);
      return null;
    });
    return me;
  }
}

// ---------- queue + per-sketchling clips ----------

/** Runs jobs one at a time, every waiting `first` job before the others; a job that takes longer than `timeoutMs` is
 * aborted and rejected so the queue moves on. */
export function createQueue(timeoutMs: number) {
  const waiting: [(() => Promise<void>)[], (() => Promise<void>)[]] = [[], []]; // [first, rest]
  let busy = false;
  async function pump() {
    if (busy) return;
    busy = true;
    for (let run; (run = waiting[0].shift() ?? waiting[1].shift()); ) await run();
    busy = false;
  }
  return <T>(job: (signal: AbortSignal) => Promise<T>, first = false): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiting[first ? 0 : 1].push(async () => {
        const ac = new AbortController();
        const timer = setTimeout(() => ac.abort(new Error(`timed out after ${timeoutMs} ms`)), timeoutMs);
        try {
          resolve(await Promise.race([job(ac.signal), new Promise<never>((_, no) => ac.signal.addEventListener('abort', () => no(ac.signal.reason)))]));
        } catch (e) {
          reject(e);
        } finally {
          clearTimeout(timer);
        }
      });
      void pump();
    });
}

const isFile = (p: string) => !!statSync(p, {throwIfNoEntry: false})?.isFile();

/** Clips live in `dir/<sketchling id>/<line>.m4a`, hard-linked from a text+voice cache in `dir/cache/`. */
export function createVoices(dir: string, tts: () => Promise<Tts | null>, timeoutMs = 20_000) {
  const cacheDir = join(dir, 'cache');
  mkdirSync(cacheDir, {recursive: true});
  const enqueue = createQueue(timeoutMs);

  // shortcut: the cache is never pruned (~40 KB a clip); add an LRU sweep if data/voice/cache ever gets big.
  async function clip(text: string, v: VoiceProfile, first: boolean): Promise<string> {
    const key = createHash('sha256').update(JSON.stringify([MODEL_ID, v.voice, v.speed, v.semitones, text])).digest('hex').slice(0, 32);
    const file = join(cacheDir, `${key}.m4a`);
    if (isFile(file)) return file;
    return enqueue(async signal => {
      if (isFile(file)) return file; // an earlier job in the queue made the same clip
      const engine = await tts();
      if (!engine) throw new Error('TTS is off');
      const started = performance.now();
      const ms = await engine.clip(text, v, file, signal);
      console.log(`[voice] ${v.voice} ${v.semitones > 0 ? '+' : ''}${v.semitones} st: ${(ms / 1000).toFixed(1)} s clip in ${Math.round(performance.now() - started)} ms`);
      return file;
    }, first);
  }

  /** The `voice` field for a sketchling, or undefined if no line could be made. Never throws. Intros jump the queue, so
   * with several scans at once every creature can introduce itself on the Reveal; `onIntro` gets the voice so far as
   * soon as the intro is ready. */
  async function speak(s: Sketchling, onIntro?: (voice: NonNullable<Sketchling['voice']>) => void): Promise<Sketchling['voice']> {
    if (!(await tts())) return undefined;
    const v = pickVoice(s);
    const voice: NonNullable<Sketchling['voice']> = {};
    mkdirSync(join(dir, s.id), {recursive: true});
    await Promise.all(
      LINES.map(async line => {
        try {
          const dest = join(dir, s.id, `${line}.m4a`);
          const src = await clip(s[line], v, line === 'intro');
          rmSync(dest, {force: true});
          linkSync(src, dest);
          voice[line] = `/voice/${s.id}/${line}.m4a`;
          if (line === 'intro') onIntro?.({...voice});
        } catch (e) {
          console.warn(`[voice] ${line} for ${s.id} failed:`, e instanceof Error ? e.message : e);
        }
      }),
    );
    return Object.keys(voice).length ? voice : undefined;
  }

  return {speak};
}

export type Voices = ReturnType<typeof createVoices>;
