// Cut a drawing out of a PNG photo from the command line.  Run: bun examples/cutout-png.ts photo.png sprite.png
// (8-bit PNG in, PNG out. For JPEGs, convert first or decode with sharp / jpeg-js as in the README.)
import {readFileSync, writeFileSync} from 'node:fs';
import {cutout} from '../src';
import {decodePNG, encodePNG} from '../test/helpers/png';

const [input = 'examples/monster-photo.png', output = 'sprite.png'] = process.argv.slice(2);
const t0 = performance.now();
const r = cutout(decodePNG(readFileSync(input)), {outline: 8});
const ms = performance.now() - t0;
if (!r.width) {
  console.log(`${input}: no drawing found (${ms.toFixed(0)} ms)`);
  process.exit(1);
}
writeFileSync(output, encodePNG(r));
console.log(`${input} -> ${output}: ${r.width}x${r.height} in ${ms.toFixed(0)} ms, palette ${r.palette.join(' ')}, ink ${(r.inkCoverage * 100).toFixed(0)}%`);
