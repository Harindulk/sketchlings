// Writes before/after PNGs for the README into examples/.  Run: bun scripts/demo.ts
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {cutout, type CutoutResult} from '../src';
import {encodePNG, type RGBAImage} from '../test/helpers/png';
import {blobPhoto, monsterPhoto, ruledPhoto} from './photos';

const OUT = join(import.meta.dir, '..', 'examples');
mkdirSync(OUT, {recursive: true});

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
