// Race sounds, synthesized with Web Audio (no audio files). On by default; the choice is remembered on this phone.
import {store} from './ui';

const KEY = 'sketchlings.sound';
let on = store.get(KEY) !== 'off';
let ac: AudioContext | null = null;
let noise: AudioBuffer | null = null;

/** True at most once per `ms`, so drumming fingers tick instead of turning into a buzz. */
export function limiter(ms: number): (now: number) => boolean {
  let last = -Infinity;
  return (now) => {
    if (now - last < ms) return false;
    last = now;
    return true;
  };
}

export const soundOn = () => on;

export function setSound(value: boolean): void {
  on = value;
  store.set(KEY, value ? 'on' : 'off');
  unlock();
}

/** Create or wake the context. Only works inside a tap: iOS Safari starts (and restarts after a lock) audio there. */
export function unlock(): void {
  if (!on || ac?.state === 'running') return;
  try {
    ac ??= new AudioContext();
    void ac.resume().catch(() => {});
  } catch {
    /* no Web Audio */
  }
}

/** The running context, or null when muted or not woken by a tap yet. */
const live = () => (on && ac?.state === 'running' ? ac : null);

/** One oscillator gliding `from` -> `to` Hz: quick attack, held, then faded out by `at + dur`. */
function tone(a: AudioContext, type: OscillatorType, from: number, to: number, at: number, dur: number, vol: number): void {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(from, at);
  if (to !== from) o.frequency.exponentialRampToValueAtTime(to, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
  g.gain.setValueAtTime(vol, at + dur * 0.4);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(a.destination);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const tickGate = limiter(70);
export function tick(): void {
  const a = live();
  if (a && tickGate(performance.now())) tone(a, 'triangle', 1200, 800, a.currentTime, 0.04, 0.12);
}

export function boing(): void {
  const a = live();
  if (a) tone(a, 'triangle', 150, 700, a.currentTime, 0.28, 0.35);
}

const splatGate = limiter(600);
/** Our racer hit an ink blot (the TV says so): a short wet thud. */
export function splat(): void {
  const a = live();
  if (!a || !splatGate(performance.now())) return;
  tone(a, 'sine', 320, 70, a.currentTime, 0.22, 0.4);
  tone(a, 'square', 180, 90, a.currentTime, 0.09, 0.08);
}

const roarGate = limiter(250);
export function roar(): void {
  const a = live();
  if (!a || !roarGate(performance.now())) return;
  const t = a.currentTime;
  const dur = 0.6;
  if (!noise) {
    noise = a.createBuffer(1, Math.round(a.sampleRate * dur), a.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.5;
  }
  // A low sawtooth, its loudness shaken 30 times a second (the growl), plus breath noise, through a closing filter.
  const growl = a.createOscillator();
  growl.type = 'sawtooth';
  growl.frequency.setValueAtTime(120, t);
  growl.frequency.exponentialRampToValueAtTime(70, t + dur);
  const shake = a.createOscillator();
  shake.frequency.value = 30;
  const depth = a.createGain();
  depth.gain.value = 0.4;
  const amp = a.createGain();
  amp.gain.value = 0.6;
  const breath = a.createBufferSource();
  breath.buffer = noise;
  const filter = a.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1800, t);
  filter.frequency.exponentialRampToValueAtTime(400, t + dur);
  const env = a.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
  env.gain.setValueAtTime(0.5, t + dur * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  shake.connect(depth).connect(amp.gain);
  growl.connect(amp).connect(filter);
  breath.connect(filter).connect(env).connect(a.destination);
  for (const s of [growl, shake, breath]) {
    s.start(t);
    s.stop(t + dur + 0.02);
  }
}

/** A little "ta-da" when our place comes in; the winner's goes higher and rings longer. */
export function fanfare(won: boolean): void {
  const a = live();
  if (!a) return;
  const notes = won ? [523, 659, 784, 1047] : [392, 523, 659];
  notes.forEach((f, i) => {
    const last = i === notes.length - 1;
    tone(a, 'square', f, f, a.currentTime + i * 0.12, last ? (won ? 0.7 : 0.4) : 0.14, 0.08);
  });
}
