// Renders HTML pages to PNG with Playwright's chromium-headless-shell, one browser launch for all pages.
//   node render.mjs                       every docs/gallery/src/<name>-<W>x<H>.html -> docs/gallery/<name>-<W>x<H>.png
//   node render.mjs page.html out.png 1920x1080 [...]   explicit triples
import {chromium} from 'playwright-core';
import {readdirSync} from 'node:fs';
import {join, resolve} from 'node:path';

const GALLERY = process.env.GALLERY || new URL('..', import.meta.url).pathname.replace(/\/$/, ''); // docs/gallery
let jobs = [];
const args = process.argv.slice(2);
if (args.length) {
  for (let i = 0; i < args.length; i += 3) {
    const [w, h] = args[i + 2].split('x').map(Number);
    jobs.push({src: resolve(args[i]), out: resolve(args[i + 1]), w, h});
  }
} else {
  for (const f of readdirSync(join(GALLERY, 'src'))) {
    const m = f.match(/^(.+-(\d+)x(\d+))\.html$/);
    if (m) jobs.push({src: join(GALLERY, 'src', f), out: join(GALLERY, m[1] + '.png'), w: +m[2], h: +m[3]});
  }
}
const browser = await chromium.launch({headless: true}); // headless => chromium-headless-shell
try {
  for (const j of jobs) {
    const page = await browser.newPage({viewport: {width: j.w, height: j.h}, deviceScaleFactor: 1});
    await page.goto('file://' + j.src, {waitUntil: 'load'});
    await page.evaluate(() => document.fonts.ready);
    const broken = await page.evaluate(() =>
      [...document.images].filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.src));
    // overflow check: elements whose text is wider/taller than their box
    const clipped = await page.evaluate(() =>
      [...document.querySelectorAll('[data-fit]')].filter((e) => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map((e) => e.textContent.slice(0, 40)));
    await page.screenshot({path: j.out, clip: {x: 0, y: 0, width: j.w, height: j.h}});
    console.log(j.out, broken.length ? 'BROKEN: ' + broken.join(', ') : 'ok', clipped.length ? 'CLIPPED: ' + clipped.join(' | ') : '');
    await page.close();
  }
} finally {
  await browser.close();
}
