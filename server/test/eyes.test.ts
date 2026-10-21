import {describe, expect, test} from 'bun:test';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {findEyes, scanEyes, type Eye} from '../src/eyes';
import {analyze, offlinePersona} from '../src/persona';
import {decodePng, type Rgba} from '../src/png';
import {encodePng} from './helpers';

// Pixels. ring = hollow circle outline (true = 3 px, or its thickness); ry = oval; light = paper-white (a highlight);
// to = a thick line from (x,y) to there, r = half its width.
type Dot = {x: number; y: number; r: number; ring?: boolean | number; ry?: number; light?: boolean; to?: [number, number]};

const segDist = (px: number, py: number, d: Dot) => {
  const [x2, y2] = d.to!, vx = x2 - d.x, vy = y2 - d.y;
  const t = Math.max(0, Math.min(1, ((px - d.x) * vx + (py - d.y) * vy) / (vx * vx + vy * vy)));
  return Math.hypot(px - d.x - t * vx, py - d.y - t * vy);
};

/** Paper-white creature body with a dark outline (thin, or `outline` px), plus dark dots, on a transparent background. */
function creature(W: number, H: number, dots: Dot[], outline = 0): Rgba {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2 - 2);
      const dy = (y + 0.5 - H / 2) / (H / 2 - 2);
      const e = Math.sqrt(dx * dx + dy * dy);
      if (e > 1) continue;
      let c = (outline ? (1 - e) * Math.min(W / 2 - 2, H / 2 - 2) < outline : e > 0.95) ? [25, 25, 35] : [250, 247, 238];
      for (const d of dots) {
        const dist = d.to ? segDist(x + 0.5, y + 0.5, d) : Math.hypot(x + 0.5 - d.x, (y + 0.5 - d.y) * (d.ry ? d.r / d.ry : 1));
        if (d.ring ? Math.abs(dist - d.r) < (d.ring === true ? 3 : d.ring) / 2 : dist <= d.r) c = d.light ? [250, 250, 250] : [15, 15, 20];
      }
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return {width: W, height: H, data};
}

/** Googly eye: a rim of thickness t around (x,y) radius R, and a pupil of radius pr moved by (px,py). */
const googly = (x: number, y: number, R: number, px: number, py: number, pr: number, t = 4): Dot[] => [
  {x, y, r: R, ring: t},
  {x: x + px, y: y + py, r: pr},
];

/** Each found eye sits on a different expected eye [x, y, r] (pixels): centre within 0.6 r, radius 0.8-1.6x. */
function expectEyes(eyes: Eye[], img: Rgba, want: [number, number, number][], name: string) {
  const got = eyes.map(e => [e.x * img.width, e.y * img.height, e.r * img.width]);
  const ok = got.length === want.length && want.every(([x, y, r], i) => Math.hypot(got[i]![0]! - x, got[i]![1]! - y) <= 0.6 * r && got[i]![2]! >= 0.8 * r && got[i]![2]! <= 1.6 * r);
  expect({name, ok, got}).toEqual({name, ok: true, got});
}

describe('offline eye finder', () => {
  test('finds a pair of pupils in the upper half', () => {
    const eyes = findEyes(creature(200, 160, [{x: 130, y: 55, r: 6}, {x: 70, y: 57, r: 6}]));
    expect(eyes).toHaveLength(2);
    expect(eyes[0]!.x).toBeCloseTo(70 / 200, 2);
    expect(eyes[0]!.y).toBeCloseTo(57 / 160, 2);
    expect(eyes[1]!.x).toBeCloseTo(130 / 200, 2);
    expect(eyes[1]!.y).toBeCloseTo(55 / 160, 2);
    for (const e of eyes) expect(e.r).toBeCloseTo((6.5 * 1.5) / 200, 1);
  });

  test('finds the pupils of circle-with-dot eyes', () => {
    const eyes = findEyes(creature(240, 240, [{x: 90, y: 80, r: 18, ring: true}, {x: 90, y: 80, r: 5}, {x: 150, y: 80, r: 18, ring: true}, {x: 150, y: 80, r: 5}]));
    expect(eyes.map(e => [e.x, e.y])).toEqual([
      [expect.closeTo(90 / 240, 2), expect.closeTo(80 / 240, 2)],
      [expect.closeTo(150 / 240, 2), expect.closeTo(80 / 240, 2)],
    ]);
  });

  test('returns [] when nothing is convincing', () => {
    const cases: Dot[][] = [
      [], // no eyes
      [{x: 100, y: 60, r: 6}], // a single dot might be a nose
      [{x: 70, y: 120, r: 6}, {x: 130, y: 120, r: 6}], // lower half: buttons, not eyes
      [{x: 70, y: 60, r: 3}, {x: 130, y: 60, r: 9}], // very different sizes
      [{x: 90, y: 40, r: 6}, {x: 110, y: 90, r: 6}], // not side by side
      [{x: 60, y: 50, r: 4}, {x: 85, y: 50, r: 4}, {x: 110, y: 50, r: 4}, {x: 135, y: 50, r: 4}, {x: 72, y: 70, r: 4}, {x: 122, y: 70, r: 4}], // spots
      [{x: 70, y: 60, r: 14, ring: true}, {x: 130, y: 60, r: 14, ring: true}], // hollow rings, no pupils
      [{x: 6, y: 80, r: 6}, {x: 194, y: 80, r: 6}], // stuck to the outline
    ];
    for (const dots of cases) expect(findEyes(creature(200, 160, dots))).toEqual([]);
    const thick: [string, Dot[]][] = [
      ['one googly eye', googly(150, 80, 26, 6, 4, 11)],
      ['cyclops and a nose', [...googly(150, 80, 30, 0, 0, 12), {x: 150, y: 140, r: 8}]],
      ['eyebrows only', [{x: 90, y: 80, r: 5, to: [130, 76]}, {x: 170, y: 76, r: 5, to: [210, 80]}]],
      ['thick crossing strokes', [{x: 80, y: 60, r: 6, to: [140, 120]}, {x: 140, y: 60, r: 6, to: [80, 120]}, {x: 170, y: 70, r: 6, to: [230, 70]}, {x: 200, y: 70, r: 6, to: [200, 120]}]],
      ['nostrils in a snout', [{x: 150, y: 100, r: 40, ry: 26, ring: 5}, {x: 135, y: 100, r: 7}, {x: 165, y: 100, r: 7}]],
      ['dots glued inside the outline', [{x: 16, y: 120, r: 10}, {x: 284, y: 120, r: 10}]],
      ['big dark patches', [{x: 95, y: 90, r: 45}, {x: 205, y: 90, r: 45}]],
    ];
    for (const [name, dots] of thick) expect({name, eyes: findEyes(creature(300, 260, dots, 6))}).toEqual({name, eyes: []});
  });

  test('ownEyes: 2-4 round dots in the top half that make no clean pair are still drawn eyes', () => {
    const own = (dots: Dot[]) => scanEyes(creature(200, 160, dots));
    expect(own([{x: 70, y: 60, r: 5}, {x: 130, y: 60, r: 10}])).toEqual({eyes: [], ownEyes: true}); // very different sizes
    expect(own([{x: 70, y: 35, r: 6}, {x: 130, y: 70, r: 6}])).toEqual({eyes: [], ownEyes: true}); // tilted pair
    expect(own([{x: 100, y: 60, r: 6}]).ownEyes).toBe(false); // one dot: maybe a nose
    expect(own([{x: 70, y: 120, r: 6}, {x: 130, y: 120, r: 6}]).ownEyes).toBe(false); // buttons
    expect(own([{x: 60, y: 50, r: 4}, {x: 85, y: 50, r: 4}, {x: 110, y: 50, r: 4}, {x: 135, y: 50, r: 4}, {x: 72, y: 70, r: 4}, {x: 122, y: 70, r: 4}]).ownEyes).toBe(false); // spots
    expect(own([]).ownEyes).toBe(false);
    expect(own([{x: 130, y: 55, r: 6}, {x: 70, y: 57, r: 6}]).ownEyes).toBe(true); // placed pair
  });

  // Hand-labelled eyes of the TV's demo drawings (tv/src/game/demo.ts) and the phone's sample monster (doodle-cutout output).
  test('finds the eyes in real drawings', () => {
    const root = join(import.meta.dir, '../..');
    const sprites: [string, [number, number, number][]][] = [
      ['packages/doodle-cutout/examples/monster-sprite.png', [[221 / 601, 240 / 548, 39 / 601], [336 / 601, 240 / 548, 39 / 601]]],
      ['tv/src/assets/art/cloud.png', [[0.477, 0.555, 0.059], [0.617, 0.543, 0.07]]],
      ['tv/src/assets/art/frog.png', [[0.391, 0.293, 0.0625], [0.617, 0.293, 0.0625]]],
      ['tv/src/assets/art/potato.png', [[0.422, 0.434, 0.066], [0.59, 0.418, 0.078]]],
      ['tv/src/assets/art/hedgehog.png', [[0.418, 0.461, 0.059], [0.586, 0.461, 0.059]]],
      ['tv/src/assets/art/star.png', [[0.477, 0.492, 0.055], [0.621, 0.492, 0.055]]],
      ['tv/src/assets/art/dino.png', []], // one eye in profile: the finder only trusts pairs
      ['packages/doodle-cutout/examples/crayon-blob-sprite.png', []], // no face
    ];
    for (const [file, want] of sprites) {
      const img = decodePng(new Uint8Array(readFileSync(join(root, file))))!;
      expectEyes(findEyes(img), img, want.map(([x, y, r]) => [x * img.width, y * img.height, r * img.width]), file);
    }
  });

  test('finds common kid eye styles', () => {
    const cases: [string, number, number, Dot[], number, [number, number, number][]][] = [
      ['googly, pupils on the rim', 300, 260, [...googly(110, 90, 26, 12, 8, 12), ...googly(190, 90, 26, 12, 8, 12)], 6, [[110, 90, 26], [190, 90, 26]]],
      ['googly, eyes touching, looking apart', 300, 260, [...googly(122, 100, 28, -10, 6, 11, 5), ...googly(178, 98, 28, 13, -4, 11, 5)], 6, [[122, 100, 28], [178, 98, 28]]],
      ['googly, pupil highlights', 300, 260, [...googly(110, 90, 26, 6, 4, 13), {x: 121, y: 88, r: 3, light: true}, ...googly(190, 90, 26, 6, 4, 13), {x: 201, y: 88, r: 3, light: true}], 6, [[110, 90, 26], [190, 90, 26]]],
      ['googly, one rim left open', 300, 260, [{x: 110, y: 90, r: 26, ring: 4}, {x: 136, y: 90, r: 6, light: true}, {x: 110, y: 94, r: 11}, ...googly(190, 90, 26, 0, 4, 11)], 6, [[110, 94, 11 * 1.5], [190, 90, 26]]],
      ['filled circles', 240, 220, [{x: 85, y: 80, r: 15}, {x: 155, y: 80, r: 15}], 0, [[85, 80, 15], [155, 80, 15]]],
      ['uneven sizes and heights', 260, 220, [{x: 90, y: 70, r: 7}, {x: 165, y: 82, r: 10}], 0, [[90, 70, 7], [165, 82, 10]]],
      ['low on the body (57%)', 240, 260, [{x: 85, y: 146, r: 9}, {x: 155, y: 148, r: 9}], 0, [[85, 146, 9], [155, 148, 9]]],
      ['thick marker dots', 400, 360, [{x: 145, y: 120, r: 11}, {x: 255, y: 122, r: 11}], 10, [[145, 120, 11], [255, 122, 11]]],
      ['oval dots', 260, 220, [{x: 95, y: 75, r: 6, ry: 9}, {x: 165, y: 75, r: 6, ry: 9}], 0, [[95, 75, 9], [165, 75, 9]]],
      ['with a nose and a mouth', 300, 260, [{x: 110, y: 90, r: 9}, {x: 190, y: 90, r: 9}, {x: 150, y: 125, r: 7}, {x: 110, y: 160, r: 3, to: [190, 160]}], 6, [[110, 90, 9], [190, 90, 9]]],
    ];
    for (const [name, W, H, dots, outline, want] of cases) {
      const drawn = creature(W, H, dots, outline);
      const img = decodePng(encodePng(W, H, drawn.data))!; // as uploaded
      expectEyes(findEyes(img), img, want, name);
    }
  });

  test('works through PNG decode, is deterministic, and feeds the offline persona', () => {
    const img = creature(300, 260, [{x: 110, y: 90, r: 9}, {x: 190, y: 92, r: 8}]);
    const png = encodePng(img.width, img.height, img.data);
    const f = analyze(png, {width: 300, height: 260});
    expect(f.eyes).toHaveLength(2);
    expect(analyze(png.slice(), {width: 300, height: 260}).eyes).toEqual(f.eyes);
    expect(offlinePersona(f).eyes).toEqual(f.eyes);
  });

  test('is fast enough on a 1024 px sprite', () => {
    for (const dots of [[{x: 400, y: 350, r: 20}, {x: 624, y: 350, r: 20}], [...googly(400, 330, 80, 20, 15, 35, 14), ...googly(624, 330, 80, 20, 15, 35, 14)]]) {
      const img = creature(1024, 1024, dots, 18);
      const t = performance.now();
      expect(findEyes(img)).toHaveLength(2);
      expect(performance.now() - t).toBeLessThan(1000);
    }
  });
});
