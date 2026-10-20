// "Draw on screen instead": a finger-painting canvas whose result goes through the same cutout pipeline.
import {PLAYER_COLORS} from '../../shared/protocol';
import {h, icons, svg} from './ui';

const SIZE = 720; // internal canvas resolution
const BRUSH = 24;
const COLORS = ['#1F2A44', ...PLAYER_COLORS];

interface Stroke {
  color: string;
  points: [number, number][];
}

export function drawPad(onDone: (img: ImageData) => void, onBack: () => void): {el: HTMLElement; destroy(): void} {
  const canvas = h('canvas', {class: 'pad', width: SIZE, height: SIZE, 'aria-label': 'Drawing area: draw your champion with your finger'});
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  const strokes: Stroke[] = [];
  let color = COLORS[0];
  const live = new Map<number, Stroke>();

  const paint = (s: Stroke, from = 0) => {
    ctx.strokeStyle = ctx.fillStyle = s.color;
    ctx.lineWidth = BRUSH;
    ctx.lineCap = ctx.lineJoin = 'round';
    const p = s.points;
    if (p.length === 1) {
      ctx.beginPath();
      ctx.arc(p[0][0], p[0][1], BRUSH / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(...p[Math.max(0, from - 1)]);
    for (let i = Math.max(1, from); i < p.length; i++) ctx.lineTo(...p[i]);
    ctx.stroke();
  };
  const redraw = () => {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, SIZE, SIZE);
    strokes.forEach((s) => paint(s));
    done.disabled = undo.disabled = strokes.length === 0;
  };
  const pos = (e: PointerEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * SIZE, ((e.clientY - r.top) / r.height) * SIZE];
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const s: Stroke = {color, points: [pos(e)]};
    strokes.push(s);
    live.set(e.pointerId, s);
    paint(s);
    done.disabled = undo.disabled = false;
  });
  canvas.addEventListener('pointermove', (e) => {
    const s = live.get(e.pointerId);
    if (!s) return;
    const from = s.points.length;
    for (const ce of e.getCoalescedEvents?.() ?? [e]) s.points.push(pos(ce));
    paint(s, from);
  });
  const end = (e: PointerEvent) => live.delete(e.pointerId);
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const swatches = h('div', {class: 'swatches', role: 'group', 'aria-label': 'Crayon colours'});
  COLORS.forEach((c, i) => {
    const b = h('button', {type: 'button', 'aria-label': `Colour ${i + 1}`, 'aria-pressed': String(i === 0)});
    b.style.setProperty('--c', c);
    b.addEventListener('click', () => {
      color = c;
      swatches.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    });
    swatches.append(b);
  });

  const undo = h('button', {type: 'button', class: 'btn secondary', onclick: () => (strokes.pop(), redraw())}, 'Undo');
  const clear = h('button', {type: 'button', class: 'btn secondary', onclick: () => ((strokes.length = 0), redraw())}, 'Clear');
  const done = h(
    'button',
    {type: 'button', class: 'btn go', onclick: () => onDone(ctx.getImageData(0, 0, SIZE, SIZE))},
    svg(icons.sparkle),
    'Use my drawing',
  );
  redraw();

  const el = h(
    'section',
    {class: 'screen'},
    h('h1', {tabindex: '-1'}, 'Draw your champion!'),
    h('p', {class: 'note'}, 'One big creature. Close the outline!'),
    h('div', {class: 'pad-wrap'}, canvas),
    swatches,
    h('div', {class: 'tools'}, undo, clear),
    done,
    h('button', {type: 'button', class: 'link-btn', onclick: onBack}, 'Use the camera instead'),
  );
  return {el, destroy() {}};
}
