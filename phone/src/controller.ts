// Race controller: giant multi-touch TAP pad, swipe up / JUMP, ROAR button and optional mic shouting.
import {AGE_BOOST, type AgeGroup, type InputKind} from '../../shared/protocol';
import {holdTracker} from './hold';
import * as sound from './sound';
import {buzz, h, icons, svg} from './ui';

export interface Racer {
  name: string;
  color: string;
  ageGroup: AgeGroup;
  spriteUrl?: string;
}

const SWIPE_PX = 45;
const SWIPE_MS = 450;
const SHOUT_COOLDOWN_MS = 1500;
const ROAR_MS = 4000; // the TV takes one ROAR every 4 s (ROAR_COOLDOWN in tv/src/game/race.ts)

export function boostLabel(age: AgeGroup): string {
  const pct = Math.round((AGE_BOOST[age] - 1) * 100);
  return pct > 0 ? `+${pct}% boost!` : 'No boost';
}

const splatSvg = `<svg viewBox="0 0 70 70"><path d="M35 8c5 0 6 9 11 10s9-6 13-2-3 10-1 14 11 4 10 9-10 3-12 7 4 11-1 13-8-6-13-5-6 9-11 7 0-10-4-13-11-1-12-6 8-6 8-11-8-8-5-12 9 1 12-2 1-9 5-9z" fill="currentColor" stroke="#1F2A44" stroke-width="3" stroke-linejoin="round"/></svg>`;

export function raceView(racer: () => Racer, send: (kind: InputKind) => void): {el: HTMLElement; update(): void; destroy(): void} {
  let taps = 0;
  const counter = h('span', {class: 'tap-count', 'aria-hidden': 'true'}, '0');
  const pad = h(
    'button',
    {type: 'button', class: 'tap-pad', 'aria-label': 'Tap fast or hold to run. Swipe up to jump.'},
    h('span', {class: 'tap-label'}, 'TAP!', h('small', null, 'tap or hold · swipe up to jump')),
    counter,
  );

  const flash = (text: string) => {
    const f = h('div', {class: 'flash', 'aria-hidden': 'true'}, text);
    document.body.append(f);
    f.addEventListener('animationend', () => f.remove());
  };
  const tap = (x?: number, y?: number) => {
    send('tap');
    tapped(x, y);
  };
  const tapped = (x?: number, y?: number) => {
    sfx(sound.tick);
    taps++;
    counter.textContent = String(taps);
    buzz(8);
    pad.classList.add('pressed');
    setTimeout(() => pad.classList.remove('pressed'), 70);
    if (x === undefined || y === undefined || pad.querySelectorAll('.splat').length > 6) return;
    const s = svg(splatSvg, 'splat');
    s.style.left = `${x}px`;
    s.style.top = `${y}px`;
    s.style.setProperty('--rot', `${Math.random() * 360}deg`);
    s.addEventListener('animationend', () => s.remove());
    pad.append(s);
  };
  const jump = () => {
    send('jump');
    sfx(sound.boing);
    buzz(25);
    flash('JUMP!');
  };
  // A ROAR the TV would ignore isn't sent or shown: the button greys and refills for 4 s instead.
  let roarAt = -ROAR_MS;
  const roar = () => {
    const now = performance.now();
    if (now - roarAt < ROAR_MS) return;
    roarAt = now;
    send('shout');
    sfx(sound.roar);
    buzz([30, 40, 30]);
    flash('ROAR!');
    roarBtn.classList.add('cooling');
    roarBtn.setAttribute('aria-disabled', 'true');
    setTimeout(() => {
      roarBtn.classList.remove('cooling');
      roarBtn.removeAttribute('aria-disabled');
    }, ROAR_MS);
  };

  // A finger kept down runs on its own; the pad ticks and counts 4 a second, as the TV does.
  let pulse = 0;
  const holds = holdTracker(
    () => {
      send('hold');
      pad.classList.add('holding');
      let beat = 0;
      pulse = window.setInterval(() => {
        if (++beat % 2 === 0) send('hold'); // again every 0.5 s: the TV drops input during 3-2-1, and a reconnect forgets it
        tapped();
      }, 250);
    },
    () => {
      send('release');
      pad.classList.remove('holding');
      clearInterval(pulse);
    },
  );

  // Every finger counts as a tap; a quick upward flick of any finger is a jump.
  const starts = new Map<number, {y: number; t: number; jumped: boolean}>();
  pad.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const r = pad.getBoundingClientRect();
    tap(e.clientX - r.left, e.clientY - r.top);
    starts.set(e.pointerId, {y: e.clientY, t: performance.now(), jumped: false});
    holds.down(e.pointerId);
  });
  pad.addEventListener('pointermove', (e) => {
    const s = starts.get(e.pointerId);
    if (!s || s.jumped) return;
    if (s.y - e.clientY > SWIPE_PX && performance.now() - s.t < SWIPE_MS) {
      s.jumped = true;
      jump();
    }
  });
  const lift = (e: PointerEvent) => {
    starts.delete(e.pointerId);
    holds.up(e.pointerId);
  };
  pad.addEventListener('pointerup', lift);
  pad.addEventListener('pointercancel', lift);
  pad.addEventListener('pointerleave', lift); // a mouse dragged off the pad never sends pointerup here
  const onHide = () => document.hidden && holds.clear(); // a backgrounded page may never get the finger's pointerup
  document.addEventListener('visibilitychange', onHide);
  pad.addEventListener('click', (e) => {
    if (e.detail === 0) tap(); // keyboard activation (Enter/Space) of the focused pad
  });
  pad.addEventListener('contextmenu', (e) => e.preventDefault());

  const actionBtn = (cls: string, icon: string, label: string, act: () => void) => {
    const b = h('button', {type: 'button', class: `btn ${cls}`}, svg(icon), label);
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      act();
    });
    b.addEventListener('click', (e) => {
      if (e.detail === 0) act();
    });
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    return b;
  };
  const roarBtn = actionBtn('roar', icons.roar, 'ROAR', roar);

  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || (e.target instanceof HTMLElement && e.target.closest('button'))) return;
    if (e.key === ' ') tap();
    else if (e.key === 'ArrowUp') jump();
    else if (e.key.toLowerCase() === 'r') roar();
    else return;
    e.preventDefault();
  };
  document.addEventListener('keydown', onKey);

  const mic = micControl(roar);

  const speaker = h('button', {type: 'button', class: 'sound-btn', 'aria-label': 'Sound', 'aria-pressed': String(sound.soundOn())}, svg(icons.speaker));
  speaker.addEventListener('click', () => {
    sound.setSound(!sound.soundOn());
    speaker.setAttribute('aria-pressed', String(sound.soundOn()));
    sfx(sound.tick);
  });

  const avatar = h('span', {class: 'avatar'});
  const who = h('span', {class: 'who'});
  const boost = h('span', {class: 'boost'});
  const update = () => {
    const r = racer();
    document.documentElement.style.setProperty('--me', r.color);
    who.textContent = r.name;
    boost.replaceChildren(svg(icons.bolt), boostLabel(r.ageGroup));
    avatar.replaceChildren(r.spriteUrl ? h('img', {src: r.spriteUrl, alt: ''}) : h('span', {class: 'swatch'}));
  };
  update();

  document.body.classList.add('racing');
  const el = h(
    'section',
    {class: 'screen controller'},
    h('h1', {class: 'sr-only', tabindex: '-1'}, 'Race! Tap to run'),
    h('div', {class: 'racer'}, avatar, who, boost),
    pad,
    h('div', {class: 'actions'}, actionBtn('jump', icons.up, 'JUMP', jump), roarBtn),
    h('div', {class: 'extras'}, speaker, mic.el),
  );
  return {
    el,
    update,
    destroy() {
      holds.clear();
      document.removeEventListener('visibilitychange', onHide);
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('racing');
      mic.stop();
    },
  };
}

/** The open mic, kept from one race to the next so the permission prompt comes once. Closed when the page goes away. */
let mic: {stream: MediaStream; ac: AudioContext; analyser: AnalyserNode} | null = null;
function closeMic() {
  mic?.stream.getTracks().forEach((t) => t.stop());
  void mic?.ac.close();
  mic = null;
}
addEventListener('pagehide', closeMic);

// The shouting mic hears the speaker (echo cancellation is off): stay quiet while it's open, or ticks would ROAR.
function sfx(play: () => void) {
  if (!mic) play();
}

/**
 * "Enable shouting": mic loudness spikes become shouts. Browsers only allow getUserMedia on
 * secure pages (HTTPS/localhost), so on a plain-HTTP LAN page this renders nothing and the
 * ROAR button is the way to shout.
 */
function micControl(onShout: () => void): {el: HTMLElement | null; stop(): void} {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) return {el: null, stop() {}};
  if (mic?.stream.getAudioTracks().every((t) => t.readyState === 'ended')) closeMic(); // the OS took it back (lock, call)
  let raf = 0;
  const fill = h('i');
  const meter = h('span', {class: 'meter', 'aria-hidden': 'true'}, fill);
  const btn = h('button', {type: 'button', class: 'link-btn'}, 'Enable shouting');
  const row = h('div', {class: 'mic'}, svg(icons.mic), btn);

  const listen = (m: NonNullable<typeof mic>) => {
    cancelAnimationFrame(raf);
    // A suspended context (Safari after the permission alert) reads pure silence: ask for one more tap.
    if (m.ac.state !== 'running') {
      btn.textContent = 'Tap to wake the mic';
      return;
    }
    const buf = new Float32Array(m.analyser.fftSize);
    let baseline = 0.02;
    let last = 0;
    btn.textContent = 'Shout to ROAR! (tap to stop)';
    row.append(meter);
    const tick = () => {
      m.analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) sum += v * v;
      const rms = Math.sqrt(sum / buf.length);
      fill.style.width = `${Math.min(100, (rms / 0.3) * 100)}%`;
      const now = performance.now();
      // A spike well above the room's own noise level, at most once per cooldown.
      if (rms > Math.max(0.1, baseline * 3.5) && now - last > SHOUT_COOLDOWN_MS) {
        last = now;
        onShout();
      }
      baseline = baseline * 0.98 + Math.min(rms, 0.15) * 0.02;
      raf = requestAnimationFrame(tick);
    };
    tick();
  };

  btn.addEventListener('click', async () => {
    if (mic && mic.ac.state !== 'running') {
      await mic.ac.resume().catch(() => {});
      return listen(mic);
    }
    if (mic) {
      cancelAnimationFrame(raf);
      closeMic();
      meter.remove();
      btn.textContent = 'Enable shouting';
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({audio: {echoCancellation: false, noiseSuppression: false, autoGainControl: false}});
    } catch (err) {
      const name = err instanceof Error ? err.name : String(err);
      console.warn('[sketchlings] mic:', name); // NotAllowedError (denied), NotReadableError (busy), NotFoundError (none)
      btn.textContent = name === 'NotAllowedError' ? 'Mic blocked: allow it in the browser settings' : 'No mic: use ROAR!';
      btn.disabled = true;
      return;
    }
    const ac = new AudioContext();
    await ac.resume().catch(() => {});
    const analyser = ac.createAnalyser();
    analyser.fftSize = 1024;
    ac.createMediaStreamSource(stream).connect(analyser);
    mic = {stream, ac, analyser};
    listen(mic);
  });
  if (mic) listen(mic); // still on from an earlier race
  return {el: row, stop: () => cancelAnimationFrame(raf)};
}
