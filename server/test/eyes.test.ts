import {describe, expect, test} from 'bun:test';
import {findEyes} from '../src/eyes';
import {analyze, offlinePersona} from '../src/persona';
import type {Rgba} from '../src/png';
import {encodePng} from './helpers';

type Dot = {x: number; y: number; r: number; ring?: boolean}; // pixels; ring = hollow circle outline

/** Paper-white creature body with a thin dark outline, plus dark dots, on a transparent background. */
function creature(W: number, H: number, dots: Dot[]): Rgba {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x + 0.5 - W / 2) / (W / 2 - 2);
      const dy = (y + 0.5 - H / 2) / (H / 2 - 2);
      const e = Math.sqrt(dx * dx + dy * dy);
      if (e > 1) continue;
      let c = e > 0.95 ? [25, 25, 35] : [250, 247, 238];
      for (const d of dots) {
        const dist = Math.hypot(x + 0.5 - d.x, y + 0.5 - d.y);
        if (d.ring ? Math.abs(dist - d.r) < 1.5 : dist <= d.r) c = [15, 15, 20];
      }
      data.set([...c, 255], (y * W + x) * 4);
    }
  }
  return {width: W, height: H, data};
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
    const img = creature(1024, 1024, [{x: 400, y: 350, r: 20}, {x: 624, y: 350, r: 20}]);
    const t = performance.now();
    expect(findEyes(img)).toHaveLength(2);
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
