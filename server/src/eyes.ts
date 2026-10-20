// Offline eye finder for the TV's googly eyes. Precision over recall: it only reports a convincing PAIR of round dark
// pupils (or filled-circle eyes) sitting inside the body in its upper 60%; anything less certain returns [].
// Pupils are found as thick dark blobs (distance transform), so a pupil touching its eye's rim still counts. When a
// pupil sits in a small enclosed white (a drawn googly eye), the eye is that white circle, so the TV's eye covers it.
import type {Sketchling} from '../../shared/protocol';
import type {Rgba} from './png';

export type Eye = Sketchling['eyes'][number];

const round3 = (v: number) => Math.round(v * 1000) / 1000;

type Comp = {area: number; sx: number; sy: number; x0: number; x1: number; y0: number; y1: number; peak: number; outside: boolean};

export function findEyes(img: Rgba): Eye[] {
  const {width: W, height: H, data: d} = img;
  const n = W * H;
  const dark = new Uint8Array(n);
  let top = H, bottom = -1, left = W, right = -1;
  for (let i = 0; i < n; i++) {
    if (d[i * 4 + 3]! < 128) continue;
    const x = i % W, y = (i / W) | 0;
    if (y < top) top = y;
    if (y > bottom) bottom = y;
    if (x < left) left = x;
    if (x > right) right = x;
    if (0.299 * d[i * 4]! + 0.587 * d[i * 4 + 1]! + 0.114 * d[i * 4 + 2]! < 90) dark[i] = 1;
  }
  if (bottom < 0) return [];
  const bodyH = bottom - top + 1;
  const S = Math.max(right - left + 1, bodyH);

  const dt = new Uint16Array(n);
  const stack = new Int32Array(n);
  /** Connected components of `mask` with their stats; `outside` = touches the image edge or transparency. */
  const label = (mask: Uint8Array, eight: boolean) => {
    const ids = new Int32Array(n);
    const comps: Comp[] = [];
    for (let s = 0; s < n; s++) {
      if (!mask[s] || ids[s]) continue;
      const c: Comp = {area: 0, sx: 0, sy: 0, x0: W, x1: -1, y0: H, y1: -1, peak: 0, outside: false};
      comps.push(c);
      let sp = 0;
      stack[sp++] = s;
      ids[s] = comps.length;
      while (sp) {
        const i = stack[--sp]!;
        const x = i % W, y = (i / W) | 0;
        c.area++, (c.sx += x), (c.sy += y);
        if (x < c.x0) c.x0 = x;
        if (x > c.x1) c.x1 = x;
        if (y < c.y0) c.y0 = y;
        if (y > c.y1) c.y1 = y;
        if (dt[i]! > c.peak) c.peak = dt[i]!;
        if (!x || !y || x === W - 1 || y === H - 1 || d[i * 4 + 3]! < 128) c.outside = true;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!eight && dx && dy) continue;
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
            const j = ny * W + nx;
            if (mask[j] && !ids[j]) (ids[j] = comps.length), (stack[sp++] = j);
          }
        }
      }
    }
    return {ids, comps};
  };

  // Regions of everything that isn't dark ink (paper, crayon, transparency), split by the ink lines.
  const {ids: regionOf, comps: regions} = label(dark.map(v => 1 - v), false);
  // Fill tiny enclosed specks of paper (a pupil's highlight) so they don't break up the pupil.
  for (let i = 0; i < n; i++) {
    const g = regions[regionOf[i]! - 1];
    if (g && !g.outside && Math.max(g.x1 - g.x0, g.y1 - g.y0) < 0.03 * S) dark[i] = 1;
  }

  // Chamfer (3-4) distance from each dark pixel to the nearest non-dark one; 3 = 1 px.
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : dt[y * W + x]!);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (dark[y * W + x]) dt[y * W + x] = Math.min(at(x - 1, y) + 3, at(x, y - 1) + 3, at(x - 1, y - 1) + 4, at(x + 1, y - 1) + 4);
  for (let y = H - 1; y >= 0; y--)
    for (let x = W - 1; x >= 0; x--)
      if (dark[y * W + x]) dt[y * W + x] = Math.min(dt[y * W + x]!, at(x + 1, y) + 3, at(x, y + 1) + 3, at(x + 1, y + 1) + 4, at(x - 1, y + 1) + 4);

  // Typical stroke half-width: for a line of half-width h, distances spread evenly over 1..h, so h ~ 2 x median - 1.
  const hist = new Uint32Array(65536);
  let darkN = 0;
  for (let i = 0; i < n; i++) if (dark[i]) hist[dt[i]!]!++, darkN++;
  if (!darkN) return [];
  let med = 0;
  for (let acc = 0; acc * 2 < darkN; ) acc += hist[++med]!;
  const half = Math.max(1, (2 * med) / 3 - 1); // px

  /** Look around a circle: fractions that are outside the drawing / dark ink, and the enclosed paper region seen most. */
  const look = (cx: number, cy: number, rad: number) => {
    const N = 64;
    let out = 0, ink = 0;
    const seen = new Map<number, number>();
    for (let k = 0; k < N; k++) {
      const x = Math.floor(cx + rad * Math.cos((2 * Math.PI * k) / N)), y = Math.floor(cy + rad * Math.sin((2 * Math.PI * k) / N));
      if (x < 0 || y < 0 || x >= W || y >= H) {
        out++;
        continue;
      }
      const i = y * W + x;
      if (dark[i]) ink++;
      else if (regions[regionOf[i]! - 1]!.outside) out++;
      else seen.set(regionOf[i]!, (seen.get(regionOf[i]!) ?? 0) + 1);
    }
    let region = 0;
    for (const [id, c] of seen) if (c > (seen.get(region) ?? 0)) region = id;
    return {out: out / N, ink: ink / N, region};
  };

  // Pupils: dark blobs clearly thicker than the pen strokes (strokes, rims and outlines fall away).
  const k = Math.round(3 * (half + 0.5));
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (dt[i]! > k) core[i] = 1;
  const cands: {D: number; cx: number; cy: number; r: number}[] = [];
  for (const c of label(core, true).comps) {
    const R = c.peak / 3; // radius of the biggest dark disc in the blob
    const cx = c.sx / c.area + 0.5, cy = c.sy / c.area + 0.5;
    const w = c.x1 - c.x0 + 1 + (2 * k) / 3, h = c.y1 - c.y0 + 1 + (2 * k) / 3;
    if (2 * R < Math.max(3, 0.012 * S) || 2 * R > 0.15 * S || c.peak < k + 3) continue; // speck, big shape or barely thicker than a stroke
    if (Math.max(w, h) / Math.min(w, h) > 2 || c.area < 0.25 * (c.x1 - c.x0 + 1) * (c.y1 - c.y0 + 1)) continue; // a thick line or ring, not a dot
    if (cy > top + 0.6 * bodyH) continue; // eyes live in the upper 60%
    // A small, round, enclosed white right around the pupil is a drawn eye: the TV's eye should cover all of it.
    const white = look(cx, cy, R + Math.max(1.5, 0.25 * R)).region;
    const g = white ? regions[white - 1]! : null;
    const gw = g ? g.x1 - g.x0 + 1 : 0, gh = g ? g.y1 - g.y0 + 1 : 0;
    const ex = g ? (g.x0 + g.x1 + 1) / 2 : 0, ey = g ? (g.y0 + g.y1 + 1) / 2 : 0, er = Math.max(gw, gh) / 2;
    const drawn = g && g.area <= 30 * Math.PI * R * R && er <= 0.8 * Math.min(gw, gh) && er <= 0.15 * S && Math.hypot(cx - ex, cy - ey) < er;
    // Just outside the blob: paper inside the drawing, not transparency (the outline) or more thick ink (a junction).
    // A lone dot must stand clear; a pupil in a drawn eye may lean on its rim.
    const ring = look(cx, cy, R + Math.max(2, 0.5 * R));
    if (ring.out > 0 || ring.ink > (drawn ? 0.6 : 0.15)) continue;
    if (drawn) cands.push({D: 2 * R, cx: ex, cy: ey, r: er + half});
    else cands.push({D: 2 * R, cx, cy, r: 1.5 * R}); // r covers the drawn pupil plus a rim, so the googly eye hides the dot
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
      // D = pupil size; positions are the eyes', so two dots in one small shape (nostrils) collapse and fail dx
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
    .map(e => ({x: round3(e.cx / W), y: round3(e.cy / H), r: round3(Math.min(0.25, Math.max(0.015, e.r / W)))}));
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
