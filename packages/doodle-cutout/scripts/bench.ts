// Runs the benchmark set (scripts/photos.ts) and prints a markdown table.
//   bun scripts/bench.ts                          this version only
//   bun scripts/bench.ts --baseline ../old/src    before (that copy of src/) vs after (this one), with mask IoU
//   bun scripts/bench.ts --out dir photo.png ...  also save each sprite, and add your own PNG photos
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, join, resolve} from 'node:path';
import {cutout as current, type CutoutResult} from '../src';
import {decodePNG, encodePNG, type RGBAImage} from '../test/helpers/png';
import {BENCH} from './photos';

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i < 0 ? undefined : args.splice(i, 2)[1];
};
const baselineDir = flag('--baseline');
const outDir = flag('--out');
const before: typeof current | undefined = baselineDir ? (await import(resolve(baselineDir, 'index.ts'))).cutout : undefined;
if (outDir) mkdirSync(outDir, {recursive: true});

const cases = [...BENCH, ...args.map((p) => ({name: `photo: ${basename(p)}`, photo: (): RGBAImage => decodePNG(readFileSync(p))}))];
const OPTIONS = {outline: 8}; // what the Sketchlings phone uses

function run(fn: typeof current, photo: RGBAImage) {
  fn(photo, OPTIONS); // warm-up
  const times: number[] = [];
  let r!: CutoutResult;
  for (let k = 0; k < 3; k++) {
    const t0 = performance.now();
    r = fn(photo, OPTIONS);
    times.push(performance.now() - t0);
  }
  const mask = fn(photo, {...OPTIONS, debug: true}).debug!.mask;
  return {r, mask, ms: times.sort((a, b) => a - b)[1]};
}

/** Opaque share of the photo, from the working-size mask. */
const share = (m: Uint8Array) => m.reduce((s, v) => s + (v ? 1 : 0), 0) / m.length;
const cell = (x: ReturnType<typeof run>) =>
  x.r.width ? `${x.r.bbox.width}×${x.r.bbox.height} at ${x.r.bbox.x},${x.r.bbox.y}, ${(share(x.mask) * 100).toFixed(1)}%` : 'nothing found';
function iou(a: Uint8Array, b: Uint8Array): string {
  let both = 0;
  let any = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) both++;
    if (a[i] || b[i]) any++;
  }
  return any ? (both / any).toFixed(3) : '1 (both empty)';
}

console.log(before ? '| Case | Size | Before | After | Mask IoU | ms before | ms after |' : '| Case | Size | Result | ms |');
console.log(before ? '|---|---|---|---|---|---|---|' : '|---|---|---|---|');
for (const c of cases) {
  const photo = c.photo();
  const after = run(current, photo);
  const size = `${photo.width}×${photo.height}`;
  if (outDir && after.r.width) writeFileSync(join(outDir, c.name.replace(/[^a-z0-9]+/gi, '-') + '.png'), encodePNG(after.r));
  if (!before) {
    console.log(`| ${c.name} | ${size} | ${cell(after)} | ${after.ms.toFixed(0)} |`);
    continue;
  }
  const old = run(before, photo);
  console.log(`| ${c.name} | ${size} | ${cell(old)} | ${cell(after)} | ${iou(old.mask, after.mask)} | ${old.ms.toFixed(0)} | ${after.ms.toFixed(0)} |`);
}
