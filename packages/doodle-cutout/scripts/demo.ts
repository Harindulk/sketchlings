// Writes before/after PNGs for the README into examples/.  Run: bun scripts/demo.ts
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cutout, type CutoutResult} from '../src';
import {encodePNG, type RGBAImage} from '../test/helpers/png';
import {RED_CRAYON, Scene, YELLOW_CRAYON, type RGB} from '../test/helpers/synth';

const OUT = join(import.meta.dir, '..', 'examples');
mkdirSync(OUT, {recursive: true});

const TEAL: RGB = [0.2, 0.72, 0.68];
const PINK: RGB = [0.95, 0.45, 0.65];

/** A kid-style monster: wobbly body, googly eyes, antennae, legs, a signature and some eraser crumbs. */
function monsterPhoto(): RGBAImage {
  const W = 900;
  const H = 675;
  const s = new Scene(W, H).table({x: 0, y: 48, w: 860, h: 675}, [0.42, 0.3, 0.2]);
  const cx = 450;
  const cy = 360;
  const R = (t: number) => 175 * (1 + 0.07 * Math.sin(3 * t + 0.4) + 0.04 * Math.sin(5 * t + 1.3));
  const body: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const t = (i / 120) * Math.PI * 2;
    body.push([cx + R(t) * Math.cos(t) * 1.1, cy + R(t) * Math.sin(t) * 0.85]);
  }
  const insideBody = (x: number, y: number) => {
    const t = Math.atan2((y - cy) / 0.85, (x - cx) / 1.1);
    return Math.hypot((x - cx) / 1.1, (y - cy) / 0.85) <= R(t) - 6;
  };
  // Crayon belly patch and cheeks, then the marker lines on top.
  s.fill((x, y) => insideBody(x, y) && y > cy + 20, [cx - 220, cy, cx + 220, cy + 170], TEAL, 0.7, 3);
  s.fillEllipse(cx - 95, cy + 5, 26, 16, PINK, 0.7, 4).fillEllipse(cx + 95, cy + 5, 26, 16, PINK, 0.7, 5);
  // Legs and feet.
  s.stroke([[cx - 70, cy + 140], [cx - 80, cy + 225], [cx - 125, cy + 232]], 11);
  s.stroke([[cx + 70, cy + 140], [cx + 82, cy + 225], [cx + 128, cy + 230]], 11);
  // Arms waving.
  s.stroke([[cx - 185, cy - 10], [cx - 255, cy - 70], [cx - 262, cy - 115]], 10);
  s.stroke([[cx + 185, cy + 10], [cx + 262, cy - 30], [cx + 300, cy - 60]], 10);
  // Antennae with crayon pom-poms.
  s.stroke([[cx - 50, cy - 140], [cx - 75, cy - 215], [cx - 95, cy - 245]], 9);
  s.stroke([[cx + 50, cy - 140], [cx + 72, cy - 220], [cx + 100, cy - 240]], 9);
  s.fillEllipse(cx - 100, cy - 255, 22, 22, YELLOW_CRAYON, 0.9, 6).strokeEllipse(cx - 100, cy - 255, 22, 22, 7);
  s.fillEllipse(cx + 105, cy - 250, 22, 22, RED_CRAYON, 0.85, 7).strokeEllipse(cx + 105, cy - 250, 22, 22, 7);
  s.stroke(body, 12);
  // Googly eyes and a toothy grin.
  for (const ex of [cx - 60, cx + 55]) s.strokeEllipse(ex, cy - 55, 38, 42, 7).disc(ex + 10, cy - 48, 15);
  const smile: [number, number][] = [];
  for (let i = 0; i <= 20; i++) {
    const t = Math.PI * (0.15 + 0.7 * (i / 20));
    smile.push([cx + 80 * Math.cos(t), cy + 25 + 45 * Math.sin(t)]);
  }
  s.stroke(smile, 9).stroke([[cx - 15, cy + 69], [cx - 10, cy + 90], [cx + 5, cy + 70]], 6);
  // Signature "MIA" in the corner and a few eraser crumbs: both should be dropped.
  const sig = (pts: number[][]) => s.stroke(pts.map(([x, y]) => [700 + x * 3.2, 590 + y * 3.2] as [number, number]), 5);
  sig([[0, 10], [0, 0], [4, 6], [8, 0], [8, 10]]);
  sig([[11, 0], [11, 10]]);
  sig([[14, 10], [17, 0], [20, 10]]);
  sig([[15.5, 6], [18.5, 6]]);
  for (const [x, y] of [[130, 160], [760, 200], [180, 560], [640, 140], [300, 620]]) s.disc(x, y, 2.2, [0.3, 0.3, 0.35]);
  return s.render({shadow: 0.38, angle: 0.5, blobShadow: 0.32, noise: 0.02, seed: 11});
}

function blobPhoto(): RGBAImage {
  return new Scene(600, 450)
    .table({x: 40, y: 30, w: 520, h: 390})
    .fillEllipse(300, 220, 150, 110, RED_CRAYON, 0.75, 9)
    .fillEllipse(250, 190, 40, 30, YELLOW_CRAYON, 0.9, 10)
    .render({shadow: 0.45, angle: 2.4, noise: 0.02, seed: 5});
}

/** The hard case: lined notebook paper on a table, the sheet's shadow, and legs drawn right down to the paper's edge. */
function ruledPhoto(): RGBAImage {
  const W = 600;
  const H = 800;
  const sheet = {x: 34, y: 40, w: 530, h: 728}; // bottom edge at y = 768
  const s = new Scene(W, H);
  for (let y = sheet.y + 34; y < sheet.y + sheet.h; y += 24) s.stroke([[sheet.x, y], [sheet.x + sheet.w, y]], 1.6, [0.55, 0.72, 0.92]);
  s.stroke([[sheet.x + 56, sheet.y], [sheet.x + 56, sheet.y + sheet.h]], 1.6, [0.92, 0.55, 0.55]);
  s.table(sheet, [0.42, 0.3, 0.2]).stroke([[567, 46], [567, 771], [40, 771]], 7, [0.5, 0.5, 0.5]);
  const cx = 300;
  const cy = 330;
  const body: [number, number][] = [];
  for (let i = 0; i <= 100; i++) {
    const t = (i / 100) * Math.PI * 2;
    const R = 150 * (1 + 0.06 * Math.sin(4 * t + 0.7));
    body.push([cx + R * Math.cos(t), cy + R * Math.sin(t) * 1.1]);
  }
  s.fill((x, y) => Math.hypot(x - cx, (y - cy) / 1.1) < 128 && y > cy + 30, [cx - 140, cy, cx + 140, cy + 160], PINK, 0.75, 8);
  s.stroke(body, 10);
  s.stroke([[cx - 60, cy + 160], [cx - 70, 766]], 10).stroke([[cx + 60, cy + 160], [cx + 72, 766]], 10); // legs to the edge
  s.stroke([[cx - 160, cy], [cx - 220, cy - 70]], 9).stroke([[cx + 160, cy], [cx + 225, cy - 60]], 9);
  for (const ex of [cx - 50, cx + 50]) s.strokeEllipse(ex, cy - 50, 26, 30, 6).disc(ex + 6, cy - 45, 11);
  s.stroke([[cx - 55, cy + 40], [cx, cy + 75], [cx + 55, cy + 40]], 8);
  return s.render({shadow: 0.4, angle: 0.8, blobShadow: 0.3, noise: 0.02, seed: 21});
}

/** Box-downscale by an integer factor. */
function shrink(img: RGBAImage, f: number): RGBAImage {
  const w = Math.floor(img.width / f);
  const h = Math.floor(img.height / f);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let k = 0; k < 4; k++) {
        let sum = 0;
        for (let yy = 0; yy < f; yy++) for (let xx = 0; xx < f; xx++) sum += img.data[((y * f + yy) * img.width + x * f + xx) * 4 + k];
        data[(y * w + x) * 4 + k] = sum / (f * f);
      }
    }
  }
  return {data, width: w, height: h};
}

/** Composite a sprite over a checkerboard, centred in a panel of the given size. */
function onChecker(sprite: CutoutResult, w: number, h: number): RGBAImage {
  const data = new Uint8ClampedArray(w * h * 4);
  const scale = Math.min(1, (w - 20) / sprite.width, (h - 20) / sprite.height);
  const ox = (w - sprite.width * scale) / 2;
  const oy = (h - sprite.height * scale) / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const bg = ((x >> 4) + (y >> 4)) % 2 ? 214 : 236;
      const sx = Math.floor((x - ox) / scale);
      const sy = Math.floor((y - oy) / scale);
      const i = (y * w + x) * 4;
      let r = bg;
      let g = bg;
      let b = bg;
      if (sx >= 0 && sy >= 0 && sx < sprite.width && sy < sprite.height) {
        const j = (sy * sprite.width + sx) * 4;
        const a = sprite.data[j + 3] / 255;
        r = sprite.data[j] * a + bg * (1 - a);
        g = sprite.data[j + 1] * a + bg * (1 - a);
        b = sprite.data[j + 2] * a + bg * (1 - a);
      }
      data.set([r, g, b, 255], i);
    }
  }
  return {data, width: w, height: h};
}

/** Side-by-side strip of equally sized panels with a 12 px gutter. */
function strip(panels: RGBAImage[]): RGBAImage {
  const gap = 12;
  const h = panels[0].height;
  const w = panels.reduce((s, p) => s + p.width, 0) + gap * (panels.length - 1);
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  let ox = 0;
  for (const p of panels) {
    for (let y = 0; y < h; y++) data.set(p.data.subarray(y * p.width * 4, (y + 1) * p.width * 4), (y * w + ox) * 4);
    ox += p.width + gap;
  }
  return {data, width: w, height: h};
}

const gray = (m: Uint8Array, w: number, h: number, invert = true): RGBAImage => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const v = invert ? 255 - m[i] : m[i];
    data.set([v, v, v, 255], i * 4);
  }
  return {data, width: w, height: h};
};

const save = (name: string, img: RGBAImage) => {
  writeFileSync(join(OUT, name), encodePNG(img));
  console.log(`  examples/${name}  ${img.width}x${img.height}`);
};

for (const [name, photo] of [['monster', monsterPhoto()], ['crayon-blob', blobPhoto()], ['ruled', ruledPhoto()]] as const) {
  const t0 = performance.now();
  const plain = cutout(photo, {debug: true});
  const ms = performance.now() - t0;
  const sticker = cutout(photo, {outline: 8});
  console.log(`${name}: ${photo.width}x${photo.height} -> ${plain.width}x${plain.height} sprite in ${ms.toFixed(0)} ms, palette ${plain.palette.join(' ')}, ink ${(plain.inkCoverage * 100).toFixed(0)}%`);
  save(`${name}-photo.png`, photo);
  save(`${name}-sprite.png`, sticker);
  const half = shrink(photo, 2);
  save(`${name}-before-after.png`, strip([half, onChecker(sticker, half.width, half.height)]));
  if (name === 'monster') {
    const d = plain.debug!;
    const f = 3;
    save(
      'monster-steps.png',
      strip([
        shrink(photo, f),
        shrink({data: d.flattened, width: d.width, height: d.height}, f),
        shrink(gray(d.score, d.width, d.height), f),
        shrink(gray(d.cleaned, d.width, d.height), f),
        shrink(gray(d.filled, d.width, d.height), f),
        shrink(gray(d.mask, d.width, d.height), f),
      ]),
    );
  }
}
