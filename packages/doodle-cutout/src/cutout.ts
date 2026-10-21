import {
  boxBlur,
  closeMask,
  edt,
  fillHoles,
  grayClose,
  grayOpen,
  hysteresis,
  paraClose,
  invert,
  label,
  otsu,
  percentiles,
  selectComponents,
  type Mask,
} from './ops.js';

/** Any RGBA image: browser `ImageData`, a decoded PNG, a canvas buffer... */
export interface ImageLike {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}

export interface CutoutOptions {
  /** Longest side of the working image; larger inputs are area-downscaled first. Default 1024. */
  maxSize?: number;
  /** Radius (working px) of the paper/lighting estimate. Must exceed your thickest stroke. Default 12% of the long side. */
  backgroundRadius?: number;
  /** Ink score threshold 0..1, or 'auto' (Otsu, clamped to 0.12..0.4 and above the paper noise). Default 'auto'. */
  threshold?: number | 'auto';
  /** How much colourfulness counts as ink (so yellow crayon is found). Default 0.9. */
  chromaWeight?: number;
  /** Ink blobs smaller than this many working px are specks. Default 0.01% of the image (min 6). */
  minSpeckArea?: number;
  /** Disk radius (working px) that bridges small gaps in outlines. 0 disables. Default 0.7% of the long side (min 2). */
  closeRadius?: number;
  /** Make regions enclosed by an outline solid. Default true. */
  fillHoles?: boolean;
  /** Drop ink touching the photo edge (table, fingers, paper edge), unless that would leave nothing. Default true. */
  removeBorderBlobs?: boolean;
  /** Keep the largest shape plus any shape at least this fraction of its area. Default 0.15. */
  keepRatio?: number;
  /** Transparent margin (working px) around the sprite. Default 4. */
  padding?: number;
  /** Width (px) of the soft alpha edge, 0.5..2.5. Default 1.25. */
  feather?: number;
  /** Width (working px) of a "sticker" outline around the drawing. 0 = none. Default 0. */
  outline?: number;
  /** Sticker outline colour. Default '#ffffff'. */
  outlineColor?: string;
  /** 0..1, how much paper showing inside the drawing is cleaned towards white. Default 0.6. */
  whiten?: number;
  /** >= 1, saturation/depth boost applied to ink. 1 = off. Default 1.3. */
  inkBoost?: number;
  /** Max number of palette colours. Default 5. */
  paletteSize?: number;
  /** Return intermediate buffers in `result.debug`. Default false. */
  debug?: boolean;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Intermediate buffers at working resolution. Masks are 0/255 grayscale. */
export interface CutoutDebug {
  width: number;
  height: number;
  threshold: number;
  weakThreshold: number;
  /** RGBA photo after lighting correction (paper = white). */
  flattened: Uint8ClampedArray;
  /** Ink score 0..255. */
  score: Uint8Array;
  ink: Uint8Array;
  cleaned: Uint8Array;
  closed: Uint8Array;
  filled: Uint8Array;
  mask: Uint8Array;
}

export interface CutoutResult {
  /** RGBA sprite (not premultiplied). Empty (0x0) when no drawing was found. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Bounds of the drawing in input-image pixels (without padding/outline). */
  bbox: BBox;
  /** Dominant ink colours, most common first, as '#rrggbb'. */
  palette: string[];
  /** Fraction (0..1) of the cut-out shape that is ink rather than paper. Low = outline drawing, high = coloured in. */
  inkCoverage: number;
  debug?: CutoutDebug;
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const lum = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;
const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a || 1e-6), 0, 1);
  return t * t * (3 - 2 * t);
};

function inkScore(r: number, g: number, b: number, chromaWeight: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return Math.max(1 - lum(r, g, b), chromaWeight * (mx - mn));
}

function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new RangeError(`cutout: bad colour "${hex}"`);
  const s = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16) / 255) as [number, number, number];
}

const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');

/** Area-average downscale to fit maxSize, compositing any transparency onto white. Channels 0..1. */
function toWorking(src: ImageLike['data'], W: number, H: number, maxSize: number) {
  const s = Math.min(1, maxSize / Math.max(W, H));
  const w = Math.max(1, Math.round(W * s));
  const h = Math.max(1, Math.round(H * s));
  const r = new Float32Array(w * h);
  const g = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  for (let oy = 0; oy < h; oy++) {
    const y0 = Math.floor((oy * H) / h);
    const y1 = Math.max(y0 + 1, Math.floor(((oy + 1) * H) / h));
    for (let ox = 0; ox < w; ox++) {
      const x0 = Math.floor((ox * W) / w);
      const x1 = Math.max(x0 + 1, Math.floor(((ox + 1) * W) / w));
      let sr = 0;
      let sg = 0;
      let sb = 0;
      let cnt = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const p = (y * W + x) * 4;
          const a = src[p + 3] / 255;
          const pad = 255 * (1 - a);
          sr += src[p] * a + pad;
          sg += src[p + 1] * a + pad;
          sb += src[p + 2] * a + pad;
          cnt++;
        }
      }
      const i = oy * w + ox;
      r[i] = sr / (cnt * 255);
      g[i] = sg / (cnt * 255);
      b[i] = sb / (cnt * 255);
    }
  }
  return {rgb: [r, g, b], w, h};
}

/** Paper colour under the drawing, interpolated from the paper around it (normalised convolution). */
function repairBackground(bg: Float32Array[], mask: Mask, w: number, h: number, radius: number): Float32Array[] {
  const n = w * h;
  let weight: Float32Array = new Float32Array(n);
  for (let i = 0; i < n; i++) weight[i] = mask[i] ? 0 : 1;
  const vals = bg.map((ch) => {
    const v = new Float32Array(n);
    for (let i = 0; i < n; i++) v[i] = mask[i] ? 0 : ch[i];
    return v;
  });
  const r = Math.max(2, Math.round(radius / 2));
  let blurredVals: Float32Array[] = vals;
  for (let k = 0; k < 3; k++) {
    weight = boxBlur(weight, w, h, r);
    blurredVals = blurredVals.map((v) => boxBlur(v, w, h, r));
  }
  // Fallback when the drawing covers the photo: mean paper colour.
  const mean = bg.map((ch) => {
    let s = 0;
    let c = 0;
    for (let i = 0; i < n; i++) {
      if (!mask[i]) {
        s += ch[i];
        c++;
      }
    }
    return c ? s / c : 1;
  });
  return bg.map((ch, k) => {
    const out = ch.slice();
    for (let i = 0; i < n; i++) {
      if (!mask[i]) continue;
      out[i] = weight[i] > 1e-3 ? blurredVals[k][i] / weight[i] : mean[k];
    }
    return out;
  });
}

/** Median over `tile`-sized tiles of each tile's 99th percentile of `v` (0..1): a level found all over the page. */
function pageTexture(v: Float32Array, w: number, h: number, tile: number): number {
  const bins = 256;
  const tops: number[] = [];
  const hist = new Uint32Array(bins);
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      hist.fill(0);
      let count = 0;
      for (let y = ty; y < Math.min(h, ty + tile); y++) {
        for (let x = tx; x < Math.min(w, tx + tile); x++) {
          const t = v[y * w + x];
          hist[t <= 0 ? 0 : t >= 1 ? bins - 1 : (t * bins) | 0]++;
          count++;
        }
      }
      let acc = 0;
      let b = 0;
      while (b < bins - 1 && (acc += hist[b]) < count * 0.99) b++;
      tops.push((b + 1) / bins);
    }
  }
  tops.sort((a, b) => a - b);
  return tops[tops.length >> 1];
}

/**
 * The ink that belongs to the drawing, without what surrounds the sheet. Thick ink touching the photo
 * edge (a table, a cloth, fingers) is cut away pixel by pixel, with any ink joined to it or to the photo
 * edge within a 2 * `thick` margin (a thin strip of table, the paper's edge and its shadow), so a stroke
 * that touches it is trimmed rather than lost with it. What is left touching the cut (a margin line, a
 * strip of shadow) is dropped unless it reaches `depth` px into the photo, which strokes joined to a
 * drawing do. Specks go too.
 */
function dropSurroundings(ink: Mask, w: number, h: number, thick: number, depth: number, minArea: number): Mask {
  const n = w * h;
  const cut = 2 * thick;
  // Thick ink = the part that survives eroding by a disk of radius `thick` (later dilated back).
  const toPaper = edt(invert(ink), w, h);
  const core = new Uint8Array(n);
  for (let i = 0; i < n; i++) core[i] = toPaper[i] > thick * thick ? 1 : 0;
  const cores = label(core, w, h);
  const outside = selectComponents(cores, (id) => cores.touchesBorder[id]);
  const toOutside = outside.includes(1) ? edt(outside, w, h) : null;
  // Distance to the photo edge or to the thick ink touching it.
  const dist = new Float32Array(n);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
      dist[i] = toOutside ? Math.min(edge, Math.sqrt(toOutside[i]) - thick) : edge;
    }
  }
  // Flood from the ink on the photo edge through the ink within the margin: that is what gets cut.
  const zone = new Float32Array(n);
  for (let i = 0; i < n; i++) if (ink[i]) zone[i] = dist[i] < 1 ? 2 : dist[i] <= cut ? 1 : 0;
  const removed = hysteresis(zone, w, h, 2, 1);
  const kept = new Uint8Array(n);
  for (let i = 0; i < n; i++) kept[i] = ink[i] && !removed[i] ? 1 : 0;
  const parts = label(kept, w, h);
  const reach = new Float32Array(parts.count + 1);
  const touches = new Uint8Array(parts.count + 1);
  for (let i = 0; i < n; i++) {
    const id = parts.labels[i];
    if (!id) continue;
    if (dist[i] > reach[id]) reach[id] = dist[i];
    const x = i % w;
    if ((x > 0 && removed[i - 1]) || (x < w - 1 && removed[i + 1]) || (i >= w && removed[i - w]) || (i < n - w && removed[i + w])) touches[id] = 1;
  }
  return selectComponents(parts, (id) => parts.area[id] >= minArea && (!touches[id] || reach[id] >= depth));
}

function buildPalette(cols: Float32Array, count: number, size: number): string[] {
  if (count === 0 || size <= 0) return [];
  const bins = 4096;
  const n = new Uint32Array(bins);
  const sum = new Float64Array(bins * 3);
  for (let i = 0; i < count; i++) {
    const r = cols[i * 3];
    const g = cols[i * 3 + 1];
    const b = cols[i * 3 + 2];
    const k = (Math.min(15, (r * 16) | 0) << 8) | (Math.min(15, (g * 16) | 0) << 4) | Math.min(15, (b * 16) | 0);
    n[k]++;
    sum[k * 3] += r;
    sum[k * 3 + 1] += g;
    sum[k * 3 + 2] += b;
  }
  const order = [...n.keys()].filter((k) => n[k] > 0).sort((a, b) => n[b] - n[a]);
  const picked: number[][] = [];
  for (const k of order) {
    if (n[k] < count * 0.02 || picked.length >= size) break;
    const c = [sum[k * 3] / n[k], sum[k * 3 + 1] / n[k], sum[k * 3 + 2] / n[k]];
    if (lum(c[0], c[1], c[2]) > 0.9 && Math.max(...c) - Math.min(...c) < 0.1) continue;
    if (picked.some((p) => Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]) < 0.2)) continue;
    picked.push(c);
  }
  return picked.map((c) => toHex(c[0], c[1], c[2]));
}

const to255 = (m: Mask) => m.map((v) => (v ? 255 : 0));

/**
 * Cut a drawing out of a photo of paper. Returns an RGBA sprite of the drawing on transparency.
 *
 * Pipeline: downscale -> paper/lighting estimate (grayscale closing) -> flatten -> ink score
 * (darkness + colourfulness) -> hysteresis threshold -> drop specks and edge blobs -> close gaps
 * -> fill enclosed regions -> keep main shapes -> recolour, soft edge, optional sticker outline.
 */
export function cutout(img: ImageLike, options: CutoutOptions = {}): CutoutResult {
  const {width: W, height: H, data} = img;
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 1 || H < 1) {
    throw new RangeError('cutout: width and height must be positive integers');
  }
  if (!data || data.length < W * H * 4) {
    throw new RangeError(`cutout: expected ${W * H * 4} bytes of RGBA data, got ${data ? data.length : 0}`);
  }

  const {rgb, w, h} = toWorking(data, W, H, Math.max(16, options.maxSize ?? 1024));
  const n = w * h;
  const long = Math.max(w, h);
  const o = {
    backgroundRadius: Math.max(4, Math.round(options.backgroundRadius ?? long * 0.12)),
    threshold: options.threshold ?? 'auto',
    chromaWeight: options.chromaWeight ?? 0.9,
    minSpeckArea: options.minSpeckArea ?? Math.max(6, Math.round(n * 1e-4)),
    closeRadius: Math.max(0, Math.round(options.closeRadius ?? Math.max(2, long * 0.007))),
    fillHoles: options.fillHoles ?? true,
    removeBorderBlobs: options.removeBorderBlobs ?? true,
    keepRatio: options.keepRatio ?? 0.15,
    padding: Math.max(0, Math.round(options.padding ?? 4)),
    feather: clamp(options.feather ?? 1.25, 0.5, 2.5),
    outline: Math.max(0, Math.round(options.outline ?? 0)),
    outlineColor: parseHex(options.outlineColor ?? '#ffffff'),
    whiten: clamp(options.whiten ?? 0.6, 0, 1),
    inkBoost: clamp(options.inkBoost ?? 1.3, 1, 3),
    paletteSize: options.paletteSize ?? 5,
  };

  // 1. Paper + lighting estimate on a lightly denoised copy. A flat closing removes everything darker
  //    than the paper that is narrower than its window and keeps hard steps (table edges) exact; a
  //    paraboloid closing follows soft round shadows exactly. Both only ever overestimate, so take the
  //    lower one. It must be the same copy that is scored below: a blurrier estimate is too bright on
  //    the dark side of a step, which draws a 1 px "ink" line round the sheet that fill-holes then fills.
  const soft = rgb.map((ch) => boxBlur(ch, w, h, 1));
  const k = 0.5 / (o.backgroundRadius * o.backgroundRadius);
  const bg = soft.map((ch) => {
    const flat = grayClose(ch, w, h, o.backgroundRadius);
    const para = paraClose(ch, w, h, k);
    for (let i = 0; i < n; i++) if (para[i] < flat[i]) flat[i] = para[i];
    return flat;
  });

  // 2. Flatten (divide by the paper) and score each pixel's "inkiness".
  //    Dividing by a dark background amplifies sensor noise, so the score is reduced by the
  //    expected extra noise there (sigma estimated from the green channel's high-pass MAD).
  const resid = new Float32Array(n);
  for (let i = 0; i < n; i++) resid[i] = Math.abs(rgb[1][i] - soft[1][i]);
  const sigmaSoft = (percentiles(resid, [0.5])[0] * 1.57) / 3;
  //    Saturation against the global paper tint does not depend on lighting at all, so it also
  //    catches coloured areas too big for the paper estimate (their middle looks like "paper" locally).
  const tint = bg.map((ch) => {
    const ratio = new Float32Array(n);
    for (let i = 0; i < n; i++) ratio[i] = ch[i] / Math.max(bg[0][i], bg[1][i], bg[2][i], 0.02);
    return Math.max(0.05, percentiles(ratio, [0.5])[0]);
  });
  const score = new Float32Array(n);
  const flattened = options.debug ? new Uint8ClampedArray(n * 4) : undefined;
  for (let i = 0; i < n; i++) {
    const r = Math.min(1, soft[0][i] / Math.max(bg[0][i], 0.02));
    const g = Math.min(1, soft[1][i] / Math.max(bg[1][i], 0.02));
    const b = Math.min(1, soft[2][i] / Math.max(bg[2][i], 0.02));
    const wr = soft[0][i] / tint[0];
    const wg = soft[1][i] / tint[1];
    const wb = soft[2][i] / tint[2];
    const wmax = Math.max(wr, wg, wb);
    const sat = (wmax - Math.min(wr, wg, wb)) / Math.max(wmax, 0.05);
    const paperLum = Math.max(0.02, lum(bg[0][i], bg[1][i], bg[2][i]));
    const s = Math.max(inkScore(r, g, b, o.chromaWeight), o.chromaWeight * (sat - 0.1));
    score[i] = Math.max(0, s - 4 * sigmaSoft * (1 / paperLum - 1));
    if (flattened) {
      flattened[i * 4] = r * 255;
      flattened[i * 4 + 1] = g * 255;
      flattened[i * 4 + 2] = b * 255;
      flattened[i * 4 + 3] = 255;
    }
  }

  // 2b. Ruled and squared paper. Printed lines are thin, faint and all over the page, and every one of
  //     them crosses the drawing, so hysteresis would grow faint ink along all of them. Measure how
  //     strong the thin structures found everywhere are (median over tiles of each tile's 99th
  //     percentile) and take that much off thin structures only: lines vanish, thick ink and strokes
  //     darker than the lines stay.
  const thin = grayOpen(score, w, h, Math.max(2, Math.round(long * 0.0025)));
  for (let i = 0; i < n; i++) thin[i] = score[i] - thin[i];
  const lines = 1.25 * pageTexture(thin, w, h, Math.max(16, Math.round(long / 8)));
  for (let i = 0; i < n; i++) score[i] -= Math.min(thin[i], lines);

  // 3. Threshold. Hysteresis keeps faint crayon that touches confident ink; the paper noise
  //    floor (median + 4 sigma of the score) stops grain from leaking in.
  const [p16, p50] = percentiles(score, [0.16, 0.5]);
  const noiseFloor = p50 + 4 * Math.max(0.005, p50 - p16);
  let t: number;
  if (o.threshold === 'auto') t = Math.max(clamp(otsu(score), 0.12, 0.4), noiseFloor + 0.05);
  else t = clamp(o.threshold, 0.01, 1);
  const weak = Math.min(t, Math.max(0.06, t * 0.5, noiseFloor));
  const ink = hysteresis(score, w, h, t, weak);

  // 4. Drop specks and what surrounds the sheet (table, fingers, the paper's edge), unless nothing is left.
  let cleaned = o.removeBorderBlobs ? dropSurroundings(ink, w, h, Math.max(2, Math.round(long * 0.012)), o.backgroundRadius, o.minSpeckArea) : null;
  if (!cleaned || !cleaned.includes(1)) {
    const inkParts = label(ink, w, h);
    cleaned = selectComponents(inkParts, (id) => inkParts.area[id] >= o.minSpeckArea);
  }

  // 5. Bridge small gaps, 6. fill enclosed regions, 7. keep the main shapes.
  const closed = o.closeRadius > 0 ? closeMask(cleaned, w, h, o.closeRadius) : cleaned;
  const filled = o.fillHoles ? fillHoles(closed, w, h) : closed;
  const shapes = label(filled, w, h);
  let largest = 0;
  for (let id = 1; id <= shapes.count; id++) largest = Math.max(largest, shapes.area[id]);
  const minKeep = Math.max(o.minSpeckArea, largest * o.keepRatio);
  const mask = selectComponents(shapes, (id) => shapes.area[id] >= minKeep);

  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!mask[y * w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }

  const debug: CutoutDebug | undefined = options.debug
    ? {
        width: w,
        height: h,
        threshold: t,
        weakThreshold: weak,
        flattened: flattened!,
        score: Uint8Array.from(score, (v) => Math.round(clamp(v, 0, 1) * 255)),
        ink: to255(ink),
        cleaned: to255(cleaned),
        closed: to255(closed),
        filled: to255(filled),
        mask: to255(mask),
      }
    : undefined;

  if (x1 < 0) {
    return {data: new Uint8ClampedArray(0), width: 0, height: 0, bbox: {x: 0, y: 0, width: 0, height: 0}, palette: [], inkCoverage: 0, debug};
  }

  // 8. Compose the sprite in its own canvas (it may extend past the photo for padding/outline).
  const paper = repairBackground(bg, mask, w, h, o.backgroundRadius);
  const m = o.padding + o.outline + 2;
  const sw = x1 - x0 + 1 + 2 * m;
  const sh = y1 - y0 + 1 + 2 * m;
  const ox = x0 - m;
  const oy = y0 - m;
  const sn = sw * sh;
  const sm = new Uint8Array(sn);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) if (mask[y * w + x]) sm[(y - oy) * sw + (x - ox)] = 1;
  }
  const dOut = edt(sm, sw, sh);
  const dIn = edt(invert(sm), sw, sh);

  const col = new Float32Array(sn * 3);
  const inkCols = new Float32Array(sn * 3);
  let inkCount = 0;
  let shapeCount = 0;
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const si = sy * sw + sx;
      if (!sm[si]) continue;
      const i = (sy + oy) * w + (sx + ox);
      let r = Math.min(1, rgb[0][i] / Math.max(paper[0][i], 0.02));
      let g = Math.min(1, rgb[1][i] / Math.max(paper[1][i], 0.02));
      let b = Math.min(1, rgb[2][i] / Math.max(paper[2][i], 0.02));
      const iw = smoothstep(weak, t, inkScore(r, g, b, o.chromaWeight) - Math.min(thin[i], lines)); // ruled lines count as paper
      const wh = o.whiten * (1 - iw);
      r += (1 - r) * wh;
      g += (1 - g) * wh;
      b += (1 - b) * wh;
      const k = 1 + (o.inkBoost - 1) * iw;
      const l = lum(r, g, b);
      const gamma = 1 + (o.inkBoost - 1) * iw * 0.6;
      r = clamp(l + (r - l) * k, 0, 1) ** gamma;
      g = clamp(l + (g - l) * k, 0, 1) ** gamma;
      b = clamp(l + (b - l) * k, 0, 1) ** gamma;
      col[si * 3] = r;
      col[si * 3 + 1] = g;
      col[si * 3 + 2] = b;
      shapeCount++;
      if (iw > 0.5) {
        inkCols[inkCount * 3] = r;
        inkCols[inkCount * 3 + 1] = g;
        inkCols[inkCount * 3 + 2] = b;
        inkCount++;
      }
    }
  }

  const out = new Uint8ClampedArray(sn * 4);
  const [orr, og, ob] = o.outlineColor;
  const f = o.feather;
  for (let sy = 0; sy < sh; sy++) {
    for (let sx = 0; sx < sw; sx++) {
      const si = sy * sw + sx;
      const inside = sm[si] === 1;
      const din = Math.sqrt(dIn[si]);
      const dout = Math.sqrt(dOut[si]);
      const ad = inside ? clamp(0.5 + (din - 0.5) / f, 0, 1) : clamp(0.5 - (dout - 0.5) / f, 0, 1);
      const ao = o.outline > 0 ? (inside ? 1 : clamp(o.outline + 1 - dout, 0, 1)) : 0;
      const A = ad + ao * (1 - ad);
      let cr = orr;
      let cg = og;
      let cb = ob;
      if (ad > 0) {
        let dr = 0;
        let dg = 0;
        let db = 0;
        if (inside) {
          dr = col[si * 3];
          dg = col[si * 3 + 1];
          db = col[si * 3 + 2];
        } else {
          // Soft fringe just outside the shape borrows the neighbouring drawing colour.
          let c = 0;
          for (let yy = Math.max(0, sy - 1); yy <= Math.min(sh - 1, sy + 1); yy++) {
            for (let xx = Math.max(0, sx - 1); xx <= Math.min(sw - 1, sx + 1); xx++) {
              const ni = yy * sw + xx;
              if (!sm[ni]) continue;
              dr += col[ni * 3];
              dg += col[ni * 3 + 1];
              db += col[ni * 3 + 2];
              c++;
            }
          }
          if (c) {
            dr /= c;
            dg /= c;
            db /= c;
          } else {
            dr = orr;
            dg = og;
            db = ob;
          }
        }
        const wo = ao * (1 - ad);
        cr = (dr * ad + orr * wo) / A;
        cg = (dg * ad + og * wo) / A;
        cb = (db * ad + ob * wo) / A;
      }
      out[si * 4] = Math.round(cr * 255);
      out[si * 4 + 1] = Math.round(cg * 255);
      out[si * 4 + 2] = Math.round(cb * 255);
      out[si * 4 + 3] = Math.round(A * 255);
    }
  }

  const sxScale = W / w;
  const syScale = H / h;
  const bx = Math.floor(x0 * sxScale);
  const by = Math.floor(y0 * syScale);
  return {
    data: out,
    width: sw,
    height: sh,
    bbox: {
      x: bx,
      y: by,
      width: Math.min(W, Math.ceil((x1 + 1) * sxScale)) - bx,
      height: Math.min(H, Math.ceil((y1 + 1) * syScale)) - by,
    },
    palette: buildPalette(inkCols, inkCount, o.paletteSize),
    inkCoverage: shapeCount ? inkCount / shapeCount : 0,
    debug,
  };
}
