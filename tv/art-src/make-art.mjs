// Generates the TV app's hand-drawn art as SVG (art-src/svg/*.svg) and renders PNGs (src/assets/art/*.png)
// with headless Chrome. All art is original (ours), kid-drawing style: wobbly marker outlines, crayon grain,
// white sticker border. Run: node art-src/make-art.mjs   (needs Google Chrome installed)
import {execFileSync} from 'node:child_process';
import {mkdirSync, writeFileSync, existsSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SVG_DIR = join(HERE, 'svg');
const OUT_DIR = join(HERE, '..', 'src', 'assets', 'art');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
mkdirSync(SVG_DIR, {recursive: true});
mkdirSync(OUT_DIR, {recursive: true});

const INK = '#2B2B3A';
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const r1 = (n) => Math.round(n * 10) / 10;

const DEFS = (wob = 7) => `<defs>
  <filter id="hand" x="-15%" y="-15%" width="130%" height="130%">
    <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="11" result="n"/>
    <feDisplacementMap in="SourceGraphic" in2="n" scale="${wob}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
  <filter id="crayon" x="0" y="0" width="100%" height="100%">
    <feTurbulence type="fractalNoise" baseFrequency="0.75 0.12" numOctaves="2" seed="3" result="g"/>
    <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  2.2 0 0 0 -1.15" result="speck"/>
    <feComposite in="speck" in2="SourceAlpha" operator="in" result="s"/>
    <feMerge><feMergeNode in="SourceGraphic"/><feMergeNode in="s"/></feMerge>
  </filter>
  <filter id="sticker" x="-20%" y="-20%" width="140%" height="140%">
    <feMorphology in="SourceAlpha" operator="dilate" radius="9" result="d"/>
    <feFlood flood-color="#ffffff"/>
    <feComposite in2="d" operator="in" result="w"/>
    <feMerge><feMergeNode in="w"/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

// Coloured "outside the lines" fill + marker outline, like a kid colouring in.
const shape = (d, fill, {dx = 5, dy = 4, sw = 10, close = true} = {}) =>
  `<path d="${d}" fill="${fill}" stroke="none" transform="translate(${dx} ${dy})" filter="url(#crayon)"/>` +
  `<path d="${d}" fill="${close ? 'none' : 'none'}" stroke="${INK}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const line = (d, sw = 10, color = INK) =>
  `<path d="${d}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
const blob = (cx, cy, rx, ry, fill, sw = 8) =>
  `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${INK}" stroke-width="${sw}"/>`;
const eye = (cx, cy, r, px = 0.35, py = 0.1) =>
  blob(cx, cy, r, r * 1.08, '#fff', 7) +
  `<circle cx="${r1(cx + r * px)}" cy="${r1(cy + r * py)}" r="${r1(r * 0.45)}" fill="${INK}"/>` +
  `<circle cx="${r1(cx + r * px + r * 0.15)}" cy="${r1(cy + r * py - r * 0.18)}" r="${r1(r * 0.14)}" fill="#fff"/>`;
const cheek = (cx, cy, r = 18) => `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.6}" fill="#FF8FA3" opacity="0.75"/>`;

const sprite = (body, wob = 7) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${DEFS(wob)}` +
  `<g filter="url(#sticker)"><g filter="url(#hand)">${body}</g></g></svg>`;

function spikyPath(cx, cy, rOut, rIn, n, jitter = 0.08) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = (i % 2 ? rIn : rOut) * (1 + (rnd() - 0.5) * jitter);
    pts.push(`${r1(cx + Math.cos(a) * r)} ${r1(cy + Math.sin(a) * r)}`);
  }
  return `M${pts.join(' L')} Z`;
}
function blobPath(cx, cy, r, n = 14, jitter = 0.35) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 + (rnd() - 0.5) * jitter);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  // smooth closed curve through points (Catmull-Rom -> cubic)
  let d = `M${r1(pts[0][0])} ${r1(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${r1(c1[0])} ${r1(c1[1])} ${r1(c2[0])} ${r1(c2[1])} ${r1(p2[0])} ${r1(p2[1])}`;
  }
  return d + ' Z';
}

const art = {};

// 1. Sir Wobbleton, the Brave Potato (walk)
art.potato = sprite(
  shape('M178 196 Q104 300 112 404 L238 368 Z', '#FF5A5F') + // cape
  line('M214 404 L204 452') + line('M296 404 L312 452') +
  blob(190, 460, 36, 17, '#1F2A44') + blob(326, 460, 36, 17, '#1F2A44') +
  shape('M256 108 C342 98 392 170 386 262 C380 352 330 420 250 418 C168 416 126 350 132 260 C138 170 180 114 256 108 Z', '#D9A066') +
  `<g fill="#A9743F"><ellipse cx="178" cy="336" rx="13" ry="8"/><ellipse cx="338" cy="356" rx="10" ry="7"/><ellipse cx="250" cy="150" rx="9" ry="6"/><ellipse cx="160" cy="250" rx="7" ry="5"/></g>` +
  line('M140 286 L92 254') + line('M380 282 L418 246') +
  shape('M414 238 L436 96 L456 100 L438 244 Z', '#DCE6F2', {dx: 3, dy: 3, sw: 8}) +
  line('M396 236 L452 254', 12) +
  eye(216, 222, 34, 0.4) + eye(302, 214, 40, 0.38) +
  line('M180 172 Q208 156 240 170', 9) + line('M272 160 Q304 146 336 162', 9) +
  shape('M206 296 Q256 352 312 290 Q258 312 206 296 Z', '#8C2F39', {dx: 2, dy: 2, sw: 8}) +
  `<rect x="248" y="300" width="18" height="15" rx="3" fill="#fff" stroke="${INK}" stroke-width="5"/>` +
  cheek(170, 286) + cheek(350, 276),
);

// 2. Bouncy Bea, the Springiest Frog (hop)
art.frog = sprite(
  line('M196 380 L176 396 L216 410 L176 424 L216 438 L196 452', 9) +
  line('M316 380 L296 396 L336 410 L296 424 L336 438 L316 452', 9) +
  blob(186, 462, 42, 16, '#3DDC84') + blob(330, 462, 42, 16, '#3DDC84') +
  shape('M138 384 C126 254 176 168 256 168 C336 168 388 254 376 384 Q256 414 138 384 Z', '#57C26B') +
  shape('M196 300 Q256 270 316 300 Q330 370 256 384 Q182 370 196 300 Z', '#BDF0A8', {dx: 3, dy: 3, sw: 7}) +
  shape('M150 170 A52 52 0 1 1 250 170 Q200 196 150 170 Z', '#57C26B') +
  shape('M266 170 A52 52 0 1 1 366 170 Q316 196 266 170 Z', '#57C26B') +
  eye(200, 150, 32, 0.38, 0.05) + eye(316, 150, 32, 0.38, 0.05) +
  line('M196 246 Q256 300 330 240', 10) +
  cheek(178, 236, 20) + cheek(346, 230, 20) +
  line('M142 300 L104 276') + line('M374 296 L414 264') +
  `<path d="M232 96 l10 -26 l10 26 l26 4 l-20 16 l6 26 l-22 -14 l-22 14 l6 -26 l-20 -16 z" fill="#FFC531" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>`,
);

// 3. Captain Fluff, the Cloud Pilot (fly)
art.cloud = sprite(
  shape('M160 250 Q90 200 60 236 Q100 250 92 286 Q130 270 160 290 Z', '#FFFFFF') + // back wing
  shape('M150 330 A62 62 0 0 1 178 228 A84 84 0 0 1 326 206 A72 72 0 0 1 398 300 A58 58 0 0 1 366 392 L176 392 A58 58 0 0 1 150 330 Z', '#C9B5FF') +
  shape('M150 262 Q96 300 120 344 Q150 320 170 330 Z', '#FF5A5F', {sw: 8}) + // scarf tail
  line('M198 392 L192 434') + line('M300 392 L306 434') +
  blob(186, 440, 22, 11, '#FF8A3D', 7) + blob(314, 440, 22, 11, '#FF8A3D', 7) +
  shape('M396 286 L452 304 L398 324 Z', '#FFB347', {dx: 3, dy: 2, sw: 8}) +
  line('M200 214 Q270 170 352 218', 12, '#8C6A3F') + // goggle strap
  blob(246, 196, 26, 22, '#8FD3FF', 8) + blob(304, 196, 26, 22, '#8FD3FF', 8) +
  eye(316, 278, 36, 0.42) + eye(244, 284, 30, 0.42) +
  line('M262 342 Q300 366 340 336', 9) +
  cheek(218, 328) + cheek(366, 324) +
  shape('M214 352 Q150 350 132 300 Q180 306 226 322 Z', '#FFFFFF', {sw: 8}), // front wing
);

// 4. Rolo, the Spiky Snowball (roll)
seed = 42;
art.hedgehog = sprite(
  shape(spikyPath(256, 262, 206, 160, 16), '#FF8A3D') +
  shape('M256 140 C330 140 372 200 370 262 C368 330 320 378 256 378 C192 378 142 330 142 262 C142 200 182 140 256 140 Z', '#FFD8A8') +
  eye(214, 236, 30, 0.35) + eye(300, 236, 30, 0.35) +
  `<ellipse cx="258" cy="282" rx="16" ry="11" fill="${INK}"/>` +
  shape('M216 312 Q258 358 302 312 Q258 326 216 312 Z', '#8C2F39', {dx: 2, dy: 2, sw: 8}) +
  `<ellipse cx="262" cy="334" rx="14" ry="9" fill="#FF8FA3"/>` +
  cheek(186, 296) + cheek(330, 296),
);

// 5. Noodle Rex, the Gentle Giant (walk)
art.dino = sprite(
  shape('M120 330 Q40 300 30 230 Q90 300 150 300 Z', '#2BB3FF') + // tail
  `<g fill="#FFC531" stroke="${INK}" stroke-width="7" stroke-linejoin="round"><path d="M170 250 l24 -46 l20 48 z"/><path d="M220 236 l26 -50 l20 52 z"/><path d="M272 236 l24 -44 l16 50 z"/></g>` +
  line('M188 380 L184 446') + line('M300 380 L306 446') +
  blob(176, 452, 32, 15, '#1F6FB3') + blob(318, 452, 32, 15, '#1F6FB3') +
  shape('M120 330 C120 260 180 236 250 238 C320 240 350 270 352 320 C354 380 300 396 236 396 C170 396 120 380 120 330 Z', '#2BB3FF') +
  shape('M310 270 C320 200 330 150 360 110 L410 120 C400 170 372 230 350 300 Z', '#2BB3FF') +
  shape('M346 70 C400 50 470 76 470 120 C470 160 420 170 380 160 C350 152 330 110 346 70 Z', '#2BB3FF') +
  eye(398, 104, 22, 0.4, 0.05) +
  line('M420 140 Q444 150 462 136', 8) +
  `<circle cx="458" cy="104" r="5" fill="${INK}"/>` +
  cheek(380, 140, 14) +
  shape('M190 300 Q240 280 300 300 Q300 360 240 370 Q190 360 190 300 Z', '#A8E1FF', {dx: 3, dy: 3, sw: 7}),
);

// 6. Zippy, the Shooting Star (fly)
seed = 99;
art.star = sprite(
  line('M70 330 Q120 300 160 300', 12, '#FFC531') + line('M60 270 Q110 260 150 262', 12, '#FF8A3D') + line('M80 390 Q130 352 170 340', 12, '#FF5A5F') +
  shape(spikyPath(276, 268, 196, 92, 5, 0.04), '#FFE066') +
  eye(244, 252, 28, 0.4) + eye(318, 252, 28, 0.4) +
  line('M246 314 Q282 344 320 312', 9) +
  cheek(216, 300) + cheek(348, 300),
);

// Ink blot obstacle (with grumpy eyes so kids know to jump it)
seed = 5;
art.blot = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${DEFS(5)}<g filter="url(#hand)">
  <path d="${blobPath(128, 150, 82, 16, 0.42)}" fill="#1F2A44"/>
  <circle cx="44" cy="96" r="12" fill="#1F2A44"/><circle cx="214" cy="110" r="9" fill="#1F2A44"/><circle cx="196" cy="64" r="6" fill="#1F2A44"/>
  <ellipse cx="102" cy="112" rx="22" ry="10" fill="#fff" opacity="0.35" transform="rotate(-20 102 112)"/>
  <ellipse cx="104" cy="150" rx="16" ry="18" fill="#fff"/><ellipse cx="152" cy="150" rx="16" ry="18" fill="#fff"/>
  <circle cx="110" cy="156" r="8" fill="#1F2A44"/><circle cx="146" cy="156" r="8" fill="#1F2A44"/>
  ${line('M84 126 L120 138', 8, '#fff')}${line('M172 126 L136 138', 8, '#fff')}
  ${line('M108 196 Q128 184 148 196', 7, '#fff')}
</g></svg>`;

// Crown for the winner
art.crown = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="200" viewBox="0 0 256 200">${DEFS(5)}<g filter="url(#sticker)"><g filter="url(#hand)">
  ${shape('M30 160 L22 50 L82 104 L128 30 L174 104 L234 50 L226 160 Z', '#FFC531')}
  <circle cx="128" cy="128" r="14" fill="#FF5A5F" stroke="${INK}" stroke-width="6"/>
  <circle cx="70" cy="132" r="10" fill="#2BB3FF" stroke="${INK}" stroke-width="6"/>
  <circle cx="186" cy="132" r="10" fill="#3DDC84" stroke="${INK}" stroke-width="6"/>
</g></g></svg>`;

// Menu icons
const icon = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">${DEFS(5)}<g filter="url(#sticker)"><g filter="url(#hand)">${body}</g></g></svg>`;
art.icon_phone = icon(
  shape('M70 30 L186 30 Q206 30 206 50 L206 210 Q206 228 186 228 L70 228 Q50 228 50 210 L50 50 Q50 30 70 30 Z', '#2BB3FF') +
  `<rect x="72" y="58" width="112" height="124" rx="8" fill="#fff" stroke="${INK}" stroke-width="7"/>` +
  `<g fill="${INK}"><rect x="84" y="70" width="30" height="30"/><rect x="142" y="70" width="30" height="30"/><rect x="84" y="140" width="30" height="30"/><rect x="128" y="120" width="14" height="14"/><rect x="150" y="146" width="22" height="22"/><rect x="124" y="156" width="12" height="12"/></g>` +
  `<circle cx="128" cy="206" r="9" fill="#fff" stroke="${INK}" stroke-width="5"/>` +
  line('M214 40 l22 -14 M222 70 l26 0 M214 100 l22 14', 8, '#FFC531'),
);
art.icon_trophy = icon(
  shape('M70 40 L186 40 Q190 130 128 150 Q66 130 70 40 Z', '#FFC531') +
  line('M70 60 Q30 60 36 96 Q42 124 82 122', 10) + line('M186 60 Q226 60 220 96 Q214 124 174 122', 10) +
  shape('M112 150 L144 150 L148 190 L108 190 Z', '#FFC531', {sw: 8}) +
  shape('M76 190 L180 190 L186 226 L70 226 Z', '#B06CFF') +
  `<path d="M128 66 l9 20 l22 2 l-17 14 l6 22 l-20 -12 l-20 12 l6 -22 l-17 -14 l22 -2 z" fill="#fff" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
);
art.icon_crayon = icon(
  `<g transform="rotate(-35 128 128)">` +
  shape('M60 100 L190 100 L190 156 L60 156 Z', '#FF5A5F') +
  shape('M190 100 L236 128 L190 156 Z', '#FFD8A8', {sw: 8}) +
  `<path d="M222 120 L236 128 L222 136 Z" fill="#FF5A5F" stroke="${INK}" stroke-width="5"/>` +
  line('M92 100 L92 156 M160 100 L160 156', 7) + `</g>` +
  line('M40 214 Q80 190 110 214 T180 214', 9, '#2BB3FF'),
);
art.icon_dice = icon(
  shape('M60 70 L170 50 L196 160 L86 182 Z', '#FFFFFF') +
  `<g fill="${INK}"><circle cx="100" cy="92" r="11"/><circle cx="128" cy="116" r="11"/><circle cx="156" cy="140" r="11"/></g>` +
  `<path d="M200 40 l8 18 l20 2 l-15 13 l5 20 l-18 -11 l-18 11 l5 -20 l-15 -13 l20 -2 z" fill="#FFC531" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
  `<path d="M46 196 l6 13 l14 1 l-11 9 l4 14 l-13 -8 l-13 8 l4 -14 l-11 -9 l14 -1 z" fill="#3DDC84" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`,
);

// Ability icons ("what you draw changes how you play"): wings, wheel, spring, roar burst
art.ab_fly = icon(
  shape('M122 134 Q70 50 18 84 Q38 104 26 124 Q56 136 44 158 Q86 172 122 150 Z', '#C9B5FF') +
  shape('M134 134 Q186 50 238 84 Q218 104 230 124 Q200 136 212 158 Q170 172 134 150 Z', '#C9B5FF') +
  line('M44 104 Q80 112 112 136 M50 140 Q84 144 112 146 M212 104 Q176 112 144 136 M206 140 Q172 144 144 146', 6) +
  blob(128, 144, 18, 30, '#FFC531', 8),
);
art.ab_roll = icon(
  line('M20 96 L58 96 M10 128 L50 128 M20 160 L58 160', 10, '#2BB3FF') +
  shape('M150 40 a88 88 0 1 0 0.1 0 Z', '#5A6480') +
  `<circle cx="150" cy="128" r="46" fill="#FFC531" stroke="${INK}" stroke-width="8"/>` +
  line('M150 82 L150 174 M104 128 L196 128 M118 96 L182 160 M182 96 L118 160', 7) +
  `<circle cx="150" cy="128" r="12" fill="#fff" stroke="${INK}" stroke-width="6"/>`,
);
art.ab_hop = icon(
  shape('M70 206 L186 206 L186 230 L70 230 Z', '#FF8A3D', {sw: 8}) +
  line('M92 196 L164 176 L92 156 L164 136 L92 116 L164 96 L92 76', 24) +
  line('M92 196 L164 176 L92 156 L164 136 L92 116 L164 96 L92 76', 12, '#3DDC84') +
  shape('M70 44 L186 44 L186 68 L70 68 Z', '#FF8A3D', {sw: 8}) +
  line('M206 60 Q226 40 216 18 M40 60 Q24 40 36 18', 8, '#2BB3FF'),
);
{
  const pts = [];
  for (let i = 0; i < 24; i++) {
    const a = (i * Math.PI) / 12 - Math.PI / 2, r = i % 2 ? 72 : 112;
    pts.push(`${r1(128 + Math.cos(a) * r)} ${r1(128 + Math.sin(a) * r)}`);
  }
  art.ab_walk = icon(
    shape(`M${pts.join(' L')} Z`, '#FF5A5F') +
    shape('M116 66 L140 66 L134 150 L122 150 Z', '#FFFFFF', {sw: 7, dx: 0, dy: 0}) +
    `<circle cx="128" cy="180" r="15" fill="#fff" stroke="${INK}" stroke-width="7"/>`,
  );
}

// Background doodles: faint blue ballpoint on a wide transparent tile (repeats horizontally)
seed = 1234;
{
  const W = 1920, H = 1080, parts = [];
  const pen = (d) => `<path d="${d}" fill="none" stroke="#9DB8D9" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`;
  const kinds = [
    (x, y, s) => pen(spikyPath(x, y, 34 * s, 15 * s, 5, 0.1)),
    (x, y, s) => pen(`M${x} ${y} m-30 0 a30 30 0 1 0 60 0 a22 22 0 1 0 -44 0 a14 14 0 1 0 28 0`),
    (x, y, s) => pen(`M${x} ${y + 20 * s} C${x - 40 * s} ${y - 10 * s} ${x - 20 * s} ${y - 40 * s} ${x} ${y - 14 * s} C${x + 20 * s} ${y - 40 * s} ${x + 40 * s} ${y - 10 * s} ${x} ${y + 20 * s} Z`),
    (x, y, s) => pen(`M${x - 50 * s} ${y} q20 -30 40 0 q20 -30 40 0 q20 -30 40 0`),
    (x, y, s) => pen(`M${x - 40 * s} ${y + 14 * s} a22 22 0 0 1 20 -30 a30 30 0 0 1 50 4 a18 18 0 0 1 10 26 Z`),
    (x, y, s) => pen(`M${x} ${y} m-18 0 a18 18 0 1 0 36 0 a18 18 0 1 0 -36 0`) + pen([0, 1, 2, 3, 4, 5, 6, 7].map((i) => { const a = (i * Math.PI) / 4; return `M${r1(x + Math.cos(a) * 28)} ${r1(y + Math.sin(a) * 28)} L${r1(x + Math.cos(a) * 42)} ${r1(y + Math.sin(a) * 42)}`; }).join(' ')),
  ];
  for (let i = 0; i < 26; i++) {
    const x = 60 + (i / 26) * (W - 120) + (rnd() - 0.5) * 60;
    const y = 120 + rnd() * (H - 200);
    parts.push(kinds[Math.floor(rnd() * kinds.length)](r1(x), r1(y), 0.8 + rnd() * 0.6));
  }
  art.doodles = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${DEFS(4)}<g filter="url(#hand)" opacity="0.8">${parts.join('')}</g></svg>`;
}

// Lane ground: pencil dashes + grass tufts (repeats horizontally)
seed = 77;
{
  const W = 1920, parts = [];
  for (let x = 10; x < W; x += 70 + Math.floor(rnd() * 30)) parts.push(`M${x} 30 l${40 + Math.floor(rnd() * 16)} ${Math.floor(rnd() * 4) - 2}`);
  const tufts = [];
  for (let i = 0; i < 9; i++) {
    const x = 100 + i * 210 + Math.floor(rnd() * 80);
    tufts.push(`M${x} 28 l-8 -16 M${x + 8} 28 l0 -20 M${x + 16} 28 l8 -16`);
  }
  art.lane = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="40" viewBox="0 0 ${W} 40">
    <path d="${parts.join(' ')}" stroke="#A39C8E" stroke-width="6" stroke-linecap="round" fill="none"/>
    <path d="${tufts.join(' ')}" stroke="#57C26B" stroke-width="5" stroke-linecap="round" fill="none"/></svg>`;
}

// Starburst (white; tinted with the player's colour in the app)
{
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2, a1 = a0 + Math.PI / 16;
    rays.push(`M400 400 L${r1(400 + Math.cos(a0) * 400)} ${r1(400 + Math.sin(a0) * 400)} L${r1(400 + Math.cos(a1) * 400)} ${r1(400 + Math.sin(a1) * 400)} Z`);
  }
  art.burst = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><radialGradient id="f"><stop offset="0.2" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
    <path d="${rays.join(' ')}" fill="url(#f)"/></svg>`;
}

// Torn-paper halves for the reveal (jagged edge down the middle)
seed = 3;
{
  const W = 520, H = 440, pts = [];
  for (let y = 0; y <= H; y += 22) pts.push([W / 2 + (rnd() - 0.5) * 34, y]);
  const edge = pts.map(([x, y]) => `L${r1(x)} ${y}`).join(' ');
  const edgeRev = [...pts].reverse().map(([x, y]) => `L${r1(x)} ${y}`).join(' ');
  const ruled = [];
  for (let y = 60; y < H; y += 40) ruled.push(`M0 ${y} L${W} ${y}`);
  const paper = (clip) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs><clipPath id="c"><path d="${clip}"/></clipPath></defs>
    <g clip-path="url(#c)"><rect width="${W}" height="${H}" fill="#FFFDF7"/>
    <path d="${ruled.join(' ')}" stroke="#CFE3F5" stroke-width="3"/><path d="M60 0 L60 ${H}" stroke="#F2A7A7" stroke-width="3"/>
    <text x="${W / 2}" y="${H / 2 + 30}" text-anchor="middle" font-family="Marker Felt, Comic Sans MS, sans-serif" font-size="120" fill="#1F2A44" opacity="0.85">?</text></g>
    <path d="${clip}" fill="none" stroke="#E4DCCB" stroke-width="4"/></svg>`;
  art.tear_left = paper(`M0 0 L${r1(pts[0][0])} 0 ${edge} L0 ${H} Z`);
  art.tear_right = paper(`M${W} 0 L${r1(pts[0][0])} 0 ${edge} L${W} ${H} Z`);
  void edgeRev;
}

// Finish banner: checkered strip with a flag on top
{
  const parts = [];
  for (let y = 0; y < 1000; y += 40) for (let x = 0; x < 2; x++) if ((x + y / 40) % 2 === 0) parts.push(`<rect x="${12 + x * 40}" y="${80 + y}" width="40" height="40" fill="#1F2A44"/>`);
  art.finish = `<svg xmlns="http://www.w3.org/2000/svg" width="104" height="1080" viewBox="0 0 104 1080">${DEFS(4)}<g filter="url(#hand)">
    <rect x="12" y="80" width="80" height="1000" fill="#fff" stroke="#1F2A44" stroke-width="6"/>${parts.join('')}
    ${line('M52 84 L52 6', 8)}${shape('M54 8 L100 26 L54 46 Z', '#FF5A5F', {sw: 6, dx: 2, dy: 2})}</g></svg>`;
}

for (const [name, svg] of Object.entries(art)) {
  writeFileSync(join(SVG_DIR, `${name}.svg`), svg);
}
const only = process.argv.slice(2);
for (const name of Object.keys(art)) {
  if (only.length && !only.includes(name)) continue;
  const svg = art[name];
  const [, w, h] = svg.match(/width="(\d+)" height="(\d+)"/);
  const out = join(OUT_DIR, `${name}.png`);
  execFileSync(CHROME, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${w},${h}`, '--default-background-color=00000000', `--screenshot=${out}`, `file://${join(SVG_DIR, name + '.svg')}`], {stdio: 'ignore'});
  console.log(existsSync(out) ? `ok ${name}.png ${w}x${h}` : `FAILED ${name}`);
}
