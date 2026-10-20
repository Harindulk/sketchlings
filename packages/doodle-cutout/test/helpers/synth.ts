// Synthetic "phone photos" of drawings on paper: paper albedo + ink/crayon + uneven lighting + sensor noise.
import type {RGBAImage} from './png';

export type RGB = [number, number, number]; // 0..1

export const PAPER: RGB = [0.97, 0.95, 0.9];
export const MARKER: RGB = [0.12, 0.13, 0.2];
export const RED_CRAYON: RGB = [0.9, 0.25, 0.22];
export const YELLOW_CRAYON: RGB = [0.98, 0.82, 0.18];
export const TABLE: RGB = [0.36, 0.24, 0.16];

export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Scene {
  readonly albedo: Float32Array;
  constructor(
    readonly width: number,
    readonly height: number,
    paper: RGB = PAPER,
  ) {
    this.albedo = new Float32Array(width * height * 3);
    for (let i = 0; i < width * height; i++) this.albedo.set(paper, i * 3);
  }

  /** Multiply-blend `color` into a pixel with coverage a (ink is subtractive). */
  ink(x: number, y: number, color: RGB, a: number): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height || a <= 0) return;
    const i = (y * this.width + x) * 3;
    for (let k = 0; k < 3; k++) this.albedo[i + k] *= 1 - a + a * color[k];
  }

  set(x: number, y: number, color: RGB): void {
    this.albedo.set(color, (y * this.width + x) * 3);
  }

  /** Paint `color` everywhere outside the paper rectangle (a table around the sheet). */
  table(paper: {x: number; y: number; w: number; h: number}, color: RGB = TABLE, seed = 7): this {
    const rand = rng(seed);
    for (let y = 0; y < this.height; y++) {
      const grain = 0.9 + 0.1 * Math.sin(y * 0.21 + rand() * 0.5);
      for (let x = 0; x < this.width; x++) {
        if (x >= paper.x && x < paper.x + paper.w && y >= paper.y && y < paper.y + paper.h) continue;
        this.set(x, y, [color[0] * grain, color[1] * grain, color[2] * grain]);
      }
    }
    return this;
  }

  /** Ellipse outline; `gap` = [fromAngle, toAngle] in radians left undrawn. */
  strokeEllipse(cx: number, cy: number, rx: number, ry: number, thickness: number, color: RGB = MARKER, gap?: [number, number]): this {
    const pad = thickness + 2;
    for (let y = Math.floor(cy - ry - pad); y <= cy + ry + pad; y++) {
      for (let x = Math.floor(cx - rx - pad); x <= cx + rx + pad; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (gap) {
          const ang = Math.atan2(dy / ry, dx / rx);
          if (ang >= gap[0] && ang <= gap[1]) continue;
        }
        const F = (dx / rx) ** 2 + (dy / ry) ** 2 - 1;
        const grad = 2 * Math.hypot(dx / (rx * rx), dy / (ry * ry));
        if (grad === 0) continue;
        const d = Math.abs(F) / grad;
        this.ink(x, y, color, Math.min(1, Math.max(0, thickness / 2 - d + 0.5)));
      }
    }
    return this;
  }

  /** Crayon fill of any shape: streaky, with paper showing through (coverage < 1). */
  fill(inside: (x: number, y: number) => boolean, box: [number, number, number, number], color: RGB, coverage = 0.8, seed = 1): this {
    const rand = rng(seed);
    const [x0, y0, x1, y1] = box.map(Math.round);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        if (!inside(x, y)) continue;
        const streak = 0.5 + 0.5 * Math.sin((x + y) * 0.9 + Math.sin(y * 0.13) * 3);
        const a = coverage * (0.55 + 0.45 * streak) * (0.75 + 0.25 * rand());
        this.ink(x, y, color, Math.min(1, a));
      }
    }
    return this;
  }

  fillEllipse(cx: number, cy: number, rx: number, ry: number, color: RGB, coverage = 0.8, seed = 1): this {
    const inside = (x: number, y: number) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
    return this.fill(inside, [cx - rx - 1, cy - ry - 1, cx + rx + 1, cy + ry + 1], color, coverage, seed);
  }

  disc(cx: number, cy: number, r: number, color: RGB = MARKER): this {
    for (let y = Math.floor(cy - r - 1); y <= cy + r + 1; y++) {
      for (let x = Math.floor(cx - r - 1); x <= cx + r + 1; x++) {
        this.ink(x, y, color, Math.min(1, Math.max(0, r - Math.hypot(x - cx, y - cy) + 0.5)));
      }
    }
    return this;
  }

  /** Round-capped polyline. */
  stroke(points: [number, number][], thickness: number, color: RGB = MARKER): this {
    const half = thickness / 2;
    const cover = new Float32Array(this.width * this.height);
    for (let s = 0; s < points.length - 1; s++) {
      const [ax, ay] = points[s];
      const [bx, by] = points[s + 1];
      const vx = bx - ax;
      const vy = by - ay;
      const len2 = vx * vx + vy * vy || 1;
      for (let y = Math.floor(Math.min(ay, by) - half - 1); y <= Math.max(ay, by) + half + 1; y++) {
        for (let x = Math.floor(Math.min(ax, bx) - half - 1); x <= Math.max(ax, bx) + half + 1; x++) {
          if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
          const t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / len2));
          const d = Math.hypot(x - ax - t * vx, y - ay - t * vy);
          const a = Math.min(1, Math.max(0, half - d + 0.5));
          const i = y * this.width + x;
          if (a > cover[i]) cover[i] = a;
        }
      }
    }
    for (let i = 0; i < cover.length; i++) {
      if (cover[i] > 0) this.ink(i % this.width, Math.floor(i / this.width), color, cover[i]);
    }
    return this;
  }

  /**
   * Photograph the scene: `shadow` darkens one side (0..1), `blobShadow` adds a soft round
   * shadow (like a hand or phone), plus exposure and Gaussian-ish sensor noise.
   */
  render(opts: {shadow?: number; angle?: number; blobShadow?: number; exposure?: number; noise?: number; seed?: number} = {}): RGBAImage {
    const {shadow = 0, angle = 0, blobShadow = 0, exposure = 1, noise = 0.02, seed = 42} = opts;
    const rand = rng(seed);
    const {width: w, height: h} = this;
    const data = new Uint8ClampedArray(w * h * 4);
    const ca = Math.cos(angle);
    const sa = Math.sin(angle);
    const diag = Math.hypot(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const along = ((x - w / 2) * ca + (y - h / 2) * sa) / diag + 0.5; // 0..1 across the photo
        let light = exposure * (1 - shadow * along);
        if (blobShadow) {
          const d = Math.hypot(x - w * 0.8, y - h * 0.85) / (0.35 * diag);
          light *= 1 - blobShadow * Math.max(0, 1 - d * d);
        }
        const i = y * w + x;
        for (let k = 0; k < 3; k++) {
          const n = (rand() + rand() + rand() - 1.5) * noise * 2;
          data[i * 4 + k] = Math.round((this.albedo[i * 3 + k] * light + n) * 255);
        }
        data[i * 4 + 3] = 255;
      }
    }
    return {data, width: w, height: h};
  }
}

/** Area of the sprite with alpha >= 128. */
export function opaqueArea(img: {data: Uint8ClampedArray}): number {
  let n = 0;
  for (let i = 3; i < img.data.length; i += 4) if (img.data[i] >= 128) n++;
  return n;
}

export function alphaAt(img: {data: Uint8ClampedArray; width: number}, x: number, y: number): number {
  return img.data[(Math.round(y) * img.width + Math.round(x)) * 4 + 3];
}

export function rgbAt(img: {data: Uint8ClampedArray; width: number}, x: number, y: number): [number, number, number] {
  const i = (Math.round(y) * img.width + Math.round(x)) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}
