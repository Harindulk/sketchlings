// Offline eye finder for the TV's googly eyes. Precision over recall: it only reports a convincing PAIR of small,
// round, dark dots sitting inside the body in its upper half (kids' pupils); anything less certain returns [].
import type {Sketchling} from '../../shared/protocol';
import type {Rgba} from './png';

export type Eye = Sketchling['eyes'][number];

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function findEyes(img: Rgba): Eye[] {
  const {width: W, height: H, data: d} = img;
  const n = W * H;
  const opaque = new Uint8Array(n);
  const dark = new Uint8Array(n);
  let top = H, bottom = -1, left = W, right = -1;
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3]! < 128) continue;
    opaque[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
    if (0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]! < 90) dark[i] = 1;
  }
  if (bottom < 0) return [];
  const bodyH = bottom - top + 1;
  const bodyW = right - left + 1;
  const S = Math.max(bodyW, bodyH);

  // 8-connected components of dark ink
  const label = new Int32Array(n);
  const stack = new Int32Array(n);
  const cands: {cx: number; cy: number; D: number}[] = [];
  let next = 0;
  for (let s = 0; s < n; s++) {
    if (!dark[s] || label[s]) continue;
    const id = ++next;
    let sp = 0, area = 0, sx = 0, sy = 0, x0 = W, x1 = -1, y0 = H, y1 = -1;
    stack[sp++] = s;
    label[s] = id;
    while (sp) {
      const i = stack[--sp]!;
      const x = i % W, y = (i / W) | 0;
      area++;
      sx += x;
      sy += y;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const j = ny * W + nx;
          if (dark[j] && !label[j]) {
            label[j] = id;
            stack[sp++] = j;
          }
        }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1, D = Math.max(w, h);
    const cy = sy / area;
    if (D < Math.max(3, 0.012 * S) || D > 0.15 * S) continue; // speck or big shape
    if (Math.max(w, h) / Math.min(w, h) > 2 || area / (w * h) < 0.5) continue; // not a round filled dot
    if (cy > top + 0.55 * bodyH) continue; // eyes live in the upper half
    // The dot must sit inside the body, surrounded by lighter ink or paper (not touching the outline).
    const m = Math.max(2, Math.round(D * 0.5));
    let total = 0, inBody = 0, otherDark = 0;
    for (let y = y0 - m; y <= y1 + m; y++) {
      for (let x = x0 - m; x <= x1 + m; x++) {
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) continue;
        total++;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const j = y * W + x;
        if (opaque[j]) inBody++;
        if (dark[j] && label[j] !== id) otherDark++;
      }
    }
    if (inBody / total < 0.9 || otherDark / total > 0.15) continue;
    cands.push({cx: sx / area + 0.5, cy: cy + 0.5, D});
  }
  if (cands.length < 2 || cands.length > 4) return []; // one dot could be a nose; many could be spots

  let best: [number, number] | null = null;
  let bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    for (let j = i + 1; j < cands.length; j++) {
      const a = cands[i]!, b = cands[j]!;
      const avgD = (a.D + b.D) / 2;
      const ratio = Math.max(a.D, b.D) / Math.min(a.D, b.D);
      const dx = Math.abs(a.cx - b.cx), dy = Math.abs(a.cy - b.cy);
      if (ratio > 1.8 || dy > Math.max(avgD, 0.06 * bodyH) || dx < 1.2 * avgD || dx > 8 * avgD) continue;
      const score = dy / avgD + Math.log(ratio);
      if (score < bestScore) {
        bestScore = score;
        best = [i, j];
      }
    }
  }
  if (!best) return [];
  return best
    .map(k => cands[k]!)
    .sort((a, b) => a.cx - b.cx)
    // r covers the drawn pupil plus a rim, so the googly eye hides the original dot
    .map(c => ({x: round3(c.cx / W), y: round3(c.cy / H), r: round3(Math.min(0.15, Math.max(0.015, (c.D / 2) * 1.5) / W))}));
}

/** Validate untrusted eyes (model output): 0-4 entries, x/y in 0..1, r in 0.01..0.25. Null if not an array. */
export function cleanEyes(v: unknown): Eye[] | null {
  if (!Array.isArray(v)) return null;
  const out: Eye[] = [];
  for (const e of v) {
    if (!e || typeof e !== 'object') continue;
    const {x, y, r} = e as Record<string, unknown>;
    if (![x, y, r].every(k => typeof k === 'number' && Number.isFinite(k))) continue;
    const [ex, ey, er] = [x, y, r] as number[];
    if (ex! < -0.05 || ex! > 1.05 || ey! < -0.05 || ey! > 1.05 || er! <= 0 || er! > 0.5) continue; // pixels or nonsense: drop
    const clamp = (v: number, lo: number, hi: number) => round3(Math.min(hi, Math.max(lo, v)));
    out.push({x: clamp(ex!, 0, 1), y: clamp(ey!, 0, 1), r: clamp(er!, 0.01, 0.25)});
    if (out.length === 4) break;
  }
  return out;
}
