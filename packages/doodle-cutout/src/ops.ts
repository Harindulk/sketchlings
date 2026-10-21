// Low-level image operations on single-channel buffers (row-major, width w, height h).
// All of them are O(width * height) regardless of radius.

/** Binary mask: 1 = set, 0 = empty. */
export type Mask = Uint8Array;

/**
 * Sliding-window max or min along rows (horizontal) or columns, window [i - r, i + r]
 * clipped to the image. Monotonic deque, so the cost does not depend on r.
 */
export function slide(
  src: Float32Array,
  w: number,
  h: number,
  r: number,
  horizontal: boolean,
  max: boolean,
  out: Float32Array,
): Float32Array {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  const lineStep = horizontal ? w : 1;
  const dq = new Int32Array(len);
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let head = 0;
    let tail = 0;
    let next = 0;
    for (let i = 0; i < len; i++) {
      const hi = Math.min(len - 1, i + r);
      while (next <= hi) {
        const v = src[base + next * step];
        if (max) while (tail > head && src[base + dq[tail - 1] * step] <= v) tail--;
        else while (tail > head && src[base + dq[tail - 1] * step] >= v) tail--;
        dq[tail++] = next++;
      }
      while (dq[head] < i - r) head++;
      out[base + i * step] = src[base + dq[head] * step];
    }
  }
  return out;
}

/** Grayscale morphological closing (max filter, then min filter) with a (2r+1) square. */
export function grayClose(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(src.length);
  const b = new Float32Array(src.length);
  slide(src, w, h, r, true, true, a);
  slide(a, w, h, r, false, true, b);
  slide(b, w, h, r, true, false, a);
  slide(a, w, h, r, false, false, b);
  return b;
}

/** Grayscale morphological opening (min filter, then max filter) with a (2r+1) square. */
export function grayOpen(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = new Float32Array(src.length);
  const b = new Float32Array(src.length);
  slide(src, w, h, r, true, false, a);
  slide(a, w, h, r, false, false, b);
  slide(b, w, h, r, true, true, a);
  slide(a, w, h, r, false, true, b);
  return b;
}

/** Area-average downscale by an integer factor `f`; edge blocks average the pixels they have. */
export function shrink(src: Float32Array, w: number, h: number, f: number): {data: Float32Array; w: number; h: number} {
  const sw = Math.ceil(w / f);
  const sh = Math.ceil(h / f);
  const sum = new Float32Array(sw * sh);
  const cnt = new Float32Array(sw * sh);
  for (let y = 0; y < h; y++) {
    const row = Math.floor(y / f) * sw;
    for (let x = 0; x < w; x++) {
      const c = row + Math.floor(x / f);
      sum[c] += src[y * w + x];
      cnt[c]++;
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] /= cnt[i];
  return {data: sum, w: sw, h: sh};
}

/** Bilinear upscale of a `shrink(…, f)` result back to w x h. */
export function enlarge(src: Float32Array, sw: number, sh: number, f: number, w: number, h: number): Float32Array {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) / f - 0.5));
    const r0 = Math.floor(fy) * sw;
    const r1 = Math.min(sh - 1, Math.floor(fy) + 1) * sw;
    const ty = fy - Math.floor(fy);
    for (let x = 0; x < w; x++) {
      const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) / f - 0.5));
      const c0 = Math.floor(fx);
      const c1 = Math.min(sw - 1, c0 + 1);
      const tx = fx - c0;
      const a = src[r0 + c0] + (src[r0 + c1] - src[r0 + c0]) * tx;
      const b = src[r1 + c0] + (src[r1 + c1] - src[r1 + c0]) * tx;
      out[y * w + x] = a + (b - a) * ty;
    }
  }
  return out;
}

function blur1d(src: Float32Array, dst: Float32Array, w: number, h: number, r: number, horizontal: boolean): void {
  const len = horizontal ? w : h;
  const lines = horizontal ? h : w;
  const step = horizontal ? 1 : w;
  const lineStep = horizontal ? w : 1;
  for (let l = 0; l < lines; l++) {
    const base = l * lineStep;
    let sum = 0;
    let cnt = 0;
    const hi0 = Math.min(r, len - 1);
    for (let j = 0; j <= hi0; j++) {
      sum += src[base + j * step];
      cnt++;
    }
    for (let i = 0; i < len; i++) {
      dst[base + i * step] = sum / cnt;
      const add = i + r + 1;
      const rem = i - r;
      if (add < len) {
        sum += src[base + add * step];
        cnt++;
      }
      if (rem >= 0) {
        sum -= src[base + rem * step];
        cnt--;
      }
    }
  }
}

/** Box blur with radius r (window clipped and renormalised at the edges). */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  blur1d(src, tmp, w, h, r, true);
  blur1d(tmp, out, w, h, r, false);
  return out;
}

function dt1d(f: Float64Array, n: number, d: Float64Array, v: Int32Array, z: Float64Array): void {
  let k = 0;
  v[0] = 0;
  z[0] = -Infinity;
  z[1] = Infinity;
  for (let q = 1; q < n; q++) {
    let s: number;
    for (;;) {
      const p = v[k];
      s = (f[q] + q * q - (f[p] + p * p)) / (2 * q - 2 * p);
      if (s > z[k]) break;
      k--;
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = Infinity;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

/** In place: g(x) = min_y g(y) + |x - y|^2 over the whole image (separable lower envelope of parabolas). */
function envelope(grid: Float64Array, w: number, h: number): void {
  const m = Math.max(w, h);
  const f = new Float64Array(m);
  const d = new Float64Array(m);
  const z = new Float64Array(m + 1);
  const v = new Int32Array(m);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
    dt1d(f, h, d, v, z);
    for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
  }
  for (let y = 0; y < h; y++) {
    const off = y * w;
    for (let x = 0; x < w; x++) f[x] = grid[off + x];
    dt1d(f, w, d, v, z);
    for (let x = 0; x < w; x++) grid[off + x] = d[x];
  }
}

/**
 * Exact squared Euclidean distance from every pixel to the nearest set pixel of `mask`
 * (Felzenszwalb & Huttenlocher 2012). Pixels with no set pixel anywhere get ~1e20.
 */
export function edt(mask: Mask, w: number, h: number): Float64Array {
  const grid = new Float64Array(w * h);
  for (let i = 0; i < grid.length; i++) grid[i] = mask[i] ? 0 : 1e20;
  envelope(grid, w, h);
  return grid;
}

/**
 * Grayscale closing with a paraboloid structuring element -k*|d|^2 ("rolling ball").
 * Unlike a flat window it leaves any background whose curvature is below k untouched,
 * so soft round shadows are followed exactly. Same O(n) envelope as the distance transform.
 */
export function paraClose(src: Float32Array, w: number, h: number, k: number): Float32Array {
  const g = new Float64Array(src.length);
  for (let i = 0; i < g.length; i++) g[i] = -src[i] / k;
  envelope(g, w, h); // dilation = -k * g
  for (let i = 0; i < g.length; i++) g[i] = -g[i];
  envelope(g, w, h); // erosion of the dilation = k * g
  const out = new Float32Array(src.length);
  for (let i = 0; i < g.length; i++) out[i] = k * g[i];
  return out;
}

export function invert(mask: Mask): Mask {
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mask[i] ? 0 : 1;
  return out;
}

/** Binary closing with a disk of radius r: bridges gaps up to ~2r wide. */
export function closeMask(mask: Mask, w: number, h: number, r: number): Mask {
  const r2 = r * r;
  const toInk = edt(mask, w, h);
  const dil = new Uint8Array(mask.length);
  for (let i = 0; i < dil.length; i++) dil[i] = toInk[i] <= r2 ? 1 : 0;
  const toEmpty = edt(invert(dil), w, h);
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < out.length; i++) out[i] = toEmpty[i] > r2 ? 1 : 0;
  return out;
}

/** Fill every empty region that cannot be reached from the image border (4-connected). */
export function fillHoles(mask: Mask, w: number, h: number): Mask {
  const n = w * h;
  const reached = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  const seed = (i: number) => {
    if (!mask[i] && !reached[i]) {
      reached[i] = 1;
      stack[sp++] = i;
    }
  };
  for (let x = 0; x < w; x++) {
    seed(x);
    seed((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    seed(y * w);
    seed(y * w + w - 1);
  }
  while (sp > 0) {
    const q = stack[--sp];
    const x = q % w;
    if (x > 0) seed(q - 1);
    if (x < w - 1) seed(q + 1);
    if (q >= w) seed(q - w);
    if (q < n - w) seed(q + w);
  }
  const out = new Uint8Array(n);
  for (let i = 0; i < n; i++) out[i] = reached[i] ? 0 : 1;
  return out;
}

export interface Components {
  /** 0 = background, 1..count = component id. */
  labels: Int32Array;
  count: number;
  /** Indexed by id (index 0 unused). */
  area: number[];
  touchesBorder: boolean[];
}

/** 8-connected component labelling. */
export function label(mask: Mask, w: number, h: number): Components {
  const n = w * h;
  const labels = new Int32Array(n);
  const stack = new Int32Array(n);
  const area = [0];
  const touchesBorder = [false];
  for (let p = 0; p < n; p++) {
    if (!mask[p] || labels[p]) continue;
    const id = area.length;
    let a = 0;
    let border = false;
    let sp = 0;
    labels[p] = id;
    stack[sp++] = p;
    while (sp > 0) {
      const q = stack[--sp];
      a++;
      const x = q % w;
      const y = (q - x) / w;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) border = true;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const r = yy * w + xx;
          if (mask[r] && !labels[r]) {
            labels[r] = id;
            stack[sp++] = r;
          }
        }
      }
    }
    area.push(a);
    touchesBorder.push(border);
  }
  return {labels, count: area.length - 1, area, touchesBorder};
}

/** Keep only the components for which `keep(id)` is true. */
export function selectComponents(c: Components, keep: (id: number) => boolean): Mask {
  const ok = new Uint8Array(c.count + 1);
  for (let id = 1; id <= c.count; id++) ok[id] = keep(id) ? 1 : 0;
  const out = new Uint8Array(c.labels.length);
  for (let i = 0; i < out.length; i++) out[i] = ok[c.labels[i]];
  return out;
}

/** Hysteresis threshold: pixels >= hi, plus pixels >= lo 8-connected to them. */
export function hysteresis(score: Float32Array, w: number, h: number, hi: number, lo: number): Mask {
  const n = w * h;
  const out = new Uint8Array(n);
  const stack = new Int32Array(n);
  let sp = 0;
  for (let i = 0; i < n; i++) {
    if (score[i] >= hi) {
      out[i] = 1;
      stack[sp++] = i;
    }
  }
  while (sp > 0) {
    const q = stack[--sp];
    const x = q % w;
    const y = (q - x) / w;
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= h) continue;
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= w) continue;
        const r = yy * w + xx;
        if (!out[r] && score[r] >= lo) {
          out[r] = 1;
          stack[sp++] = r;
        }
      }
    }
  }
  return out;
}

function histogram(values: Float32Array, bins: number): Uint32Array {
  const hist = new Uint32Array(bins);
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    hist[v <= 0 ? 0 : v >= 1 ? bins - 1 : Math.floor(v * bins)]++;
  }
  return hist;
}

/** Otsu's threshold for values in [0, 1]. Returns t such that `v >= t` is the bright class. */
export function otsu(values: Float32Array, bins = 256): number {
  const hist = histogram(values, bins);
  let total = 0;
  let sum = 0;
  for (let i = 0; i < bins; i++) {
    total += hist[i];
    sum += i * hist[i];
  }
  let sumB = 0;
  let wB = 0;
  let best = -1;
  let thr = 0;
  for (let i = 0; i < bins; i++) {
    wB += hist[i];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += i * hist[i];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) {
      best = between;
      thr = i;
    }
  }
  return (thr + 1) / bins;
}

/** Approximate percentiles (0..1) of values in [0, 1] from a 1024-bin histogram. */
export function percentiles(values: Float32Array, ps: number[]): number[] {
  const bins = 1024;
  const hist = histogram(values, bins);
  return ps.map((p) => {
    const target = p * values.length;
    let acc = 0;
    for (let i = 0; i < bins; i++) {
      acc += hist[i];
      if (acc >= target) return (i + 0.5) / bins;
    }
    return 1;
  });
}
