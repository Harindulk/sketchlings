// Synthetic phone photos for the README images (scripts/demo.ts) and the benchmark (scripts/bench.ts).
import type {RGBAImage} from '../test/helpers/png';
import {RED_CRAYON, Scene, YELLOW_CRAYON, type RGB} from '../test/helpers/synth';

const TEAL: RGB = [0.2, 0.72, 0.68];
const PINK: RGB = [0.95, 0.45, 0.65];

/** A kid-style monster: wobbly body, googly eyes, antennae, legs, a signature and some eraser crumbs. */
export function monsterPhoto(): RGBAImage {
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

export function blobPhoto(): RGBAImage {
  return new Scene(600, 450)
    .table({x: 40, y: 30, w: 520, h: 390})
    .fillEllipse(300, 220, 150, 110, RED_CRAYON, 0.75, 9)
    .fillEllipse(250, 190, 40, 30, YELLOW_CRAYON, 0.9, 10)
    .render({shadow: 0.45, angle: 2.4, noise: 0.02, seed: 5});
}

/** The hard case: lined notebook paper on a table, the sheet's shadow, and legs drawn right down to the paper's edge. */
export function ruledPhoto(): RGBAImage {
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


const BLUE_CRAYON: RGB = [0.25, 0.45, 0.85];
const LIGHT_PINK: RGB = [0.95, 0.55, 0.72];
const PENCIL: RGB = [0.55, 0.55, 0.58];
const RULE: RGB = [0.55, 0.72, 0.92];
const MARGIN: RGB = [0.92, 0.55, 0.55];

/** Notebook rules every 32 px and a red margin. */
function rule(s: Scene, x0 = 0, y0 = 0, x1 = s.width, y1 = s.height): Scene {
  for (let y = y0 + 40; y < y1; y += 32) s.stroke([[x0, y], [x1, y]], 2, RULE);
  return s.stroke([[x0 + 90, y0], [x0 + 90, y1]], 2, MARGIN);
}

/** A marker creature: outline body, two eyes, two legs. */
function creature(s: Scene, cx: number, cy: number, rx: number, ry: number, line = 12): Scene {
  return s
    .strokeEllipse(cx, cy, rx, ry, line)
    .disc(cx - rx * 0.35, cy - ry * 0.3, rx * 0.12)
    .disc(cx + rx * 0.35, cy - ry * 0.3, rx * 0.12)
    .stroke([[cx - rx * 0.4, cy + ry * 0.92], [cx - rx * 0.45, cy + ry * 1.25]], line)
    .stroke([[cx + rx * 0.4, cy + ry * 0.92], [cx + rx * 0.45, cy + ry * 1.25]], line);
}

/** A dark marker bug with thin, faint wings and antennae touching it (C4). */
export function wingsPhoto(lined: boolean, wing: RGB = LIGHT_PINK, thickness = 2): RGBAImage {
  const s = new Scene(768, 1024);
  if (lined) rule(s);
  s.strokeEllipse(384, 560, 150, 190, 14).disc(330, 500, 18).disc(438, 500, 18);
  s.strokeEllipse(190, 470, 80, 120, thickness, wing).strokeEllipse(578, 470, 80, 120, thickness, wing);
  s.stroke([[340, 380], [300, 250], [280, 200]], thickness, wing).stroke([[428, 380], [468, 250], [488, 200]], thickness, wing);
  return s.render({shadow: 0.3, noise: 0.02, seed: 4});
}

/** A creature coloured in with crayon over `fraction` of the frame (C2). */
export function bigFillPhoto(fraction: number, color: RGB = RED_CRAYON, lined = false): RGBAImage {
  const W = 768;
  const H = 1024;
  const s = new Scene(W, H);
  if (lined) rule(s);
  const ry = Math.sqrt((fraction * W * H) / Math.PI / 0.75);
  const rx = ry * 0.75;
  s.fillEllipse(W / 2, H / 2, rx, ry, color, 0.8, 12).strokeEllipse(W / 2, H / 2, rx, ry, 10);
  s.disc(W / 2 - rx * 0.35, H / 2 - ry * 0.3, 26).disc(W / 2 + rx * 0.35, H / 2 - ry * 0.3, 26);
  return s.render({shadow: 0.35, angle: 0.7, noise: 0.02, seed: 13});
}

/** A crayon creature running off the left edge of the photo, and a separate small doodle (C3). */
export function offEdgePhoto(): RGBAImage {
  const s = new Scene(1024, 768);
  s.fillEllipse(220, 384, 300, 220, BLUE_CRAYON, 0.8, 14).strokeEllipse(220, 384, 300, 220, 10).disc(330, 330, 22);
  s.strokeEllipse(800, 300, 90, 70, 8).disc(780, 290, 10);
  return s.render({shadow: 0.3, noise: 0.02, seed: 15});
}

/** The benchmark set: the README examples plus the hard cases. */
export const BENCH: {name: string; photo: () => RGBAImage}[] = [
  {name: 'example: monster', photo: monsterPhoto},
  {name: 'example: crayon blob', photo: blobPhoto},
  {name: 'example: ruled', photo: ruledPhoto},
  {name: 'blank page, heavy shadows', photo: () => new Scene(768, 1024).render({shadow: 0.6, blobShadow: 0.5, noise: 0.03})},
  {name: 'dark photo', photo: () => creature(new Scene(768, 1024), 384, 470, 220, 260).render({exposure: 0.35, shadow: 0.3, noise: 0.03, seed: 2})},
  {name: 'lined paper', photo: () => creature(rule(new Scene(768, 1024)), 400, 470, 230, 270, 14).render({noise: 0.015, seed: 3})},
  {name: 'coloured paper (yellow)', photo: () => creature(new Scene(768, 1024, [0.98, 0.88, 0.55]), 384, 470, 220, 260).fillEllipse(384, 560, 120, 80, RED_CRAYON, 0.8, 4).render({shadow: 0.3, noise: 0.02, seed: 5})},
  {name: 'coloured paper (light blue)', photo: () => creature(new Scene(768, 1024, [0.72, 0.84, 0.95]), 384, 470, 220, 260).render({shadow: 0.3, noise: 0.02, seed: 6})},
  {
    name: 'hard shadow across the page',
    photo: () => {
      const s = creature(new Scene(768, 1024), 384, 470, 220, 260);
      for (let y = 0; y < 1024; y++) for (let x = 0; x < 768; x++) {
        const f = 1 - 0.55 * Math.min(1, Math.max(0, (x - 420 - 0.3 * (y - 500)) / 3 + 0.5));
        for (let k = 0; k < 3; k++) s.albedo[(y * 768 + x) * 3 + k] *= f;
      }
      return s.render({noise: 0.02, seed: 7});
    },
  },
  {name: 'sheet on a table', photo: () => creature(new Scene(768, 1024).table({x: 60, y: 50, w: 640, h: 900}), 384, 450, 220, 250).render({shadow: 0.3, noise: 0.02, seed: 8})},
  {name: 'legs to the paper edge', photo: () => creature(new Scene(768, 1024).table({x: 40, y: 40, w: 688, h: 820}), 384, 420, 220, 330).render({shadow: 0.3, noise: 0.02, seed: 9})},
  {name: 'two drawings', photo: () => creature(creature(new Scene(1024, 768), 300, 330, 160, 190), 760, 380, 130, 150).render({shadow: 0.3, noise: 0.02, seed: 10})},
  {name: 'tiny 64 px', photo: () => new Scene(64, 48).strokeEllipse(32, 24, 18, 13, 2).disc(27, 21, 2).render({noise: 0.02, seed: 11})},
  {name: 'huge 6000 px', photo: () => creature(new Scene(6000, 4500), 3000, 2100, 1300, 1500, 80).render({shadow: 0.3, noise: 0.02, seed: 12})},
  {name: 'C4: faint wings, plain', photo: () => wingsPhoto(false)},
  {name: 'C4: pencil wings, plain', photo: () => wingsPhoto(false, PENCIL)},
  {name: 'C4: faint wings, lined', photo: () => wingsPhoto(true, LIGHT_PINK, 3)},
  {name: 'C4: pencil wings, lined', photo: () => wingsPhoto(true, PENCIL, 2)},
  {name: 'C2: coloured in, 50%', photo: () => bigFillPhoto(0.5)},
  {name: 'C2: coloured in, 65%', photo: () => bigFillPhoto(0.65, BLUE_CRAYON)},
  {name: 'C2: coloured in, 60%, lined', photo: () => bigFillPhoto(0.6, YELLOW_CRAYON, true)},
  {name: 'C3: off the photo edge + doodle', photo: offEdgePhoto},
];


