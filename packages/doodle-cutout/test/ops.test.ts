import {describe, expect, test} from 'bun:test';
import {closeMask, edt, enlarge, fillHoles, grayClose, grayOpen, hysteresis, label, otsu, shrink} from '../src/ops';
import {decodePNG, encodePNG} from './helpers/png';

const mask = (rows: string[]) => Uint8Array.from(rows.join(''), (c) => (c === '#' ? 1 : 0));

describe('ops', () => {
  test('edt gives exact squared distances', () => {
    const m = new Uint8Array(7 * 5);
    m[2 * 7 + 3] = 1;
    const d = edt(m, 7, 5);
    expect(d[2 * 7 + 3]).toBe(0);
    expect(d[2 * 7 + 6]).toBe(9);
    expect(d[0]).toBe(9 + 4);
  });

  test('fillHoles fills enclosed regions only', () => {
    const m = mask(['......', '.####.', '.#..#.', '.####.', '......']);
    const f = fillHoles(m, 6, 5);
    expect(f[2 * 6 + 2]).toBe(1);
    expect(f[0]).toBe(0);
    // An opening to the outside keeps the inside empty.
    const open = mask(['......', '.##.#.', '.#..#.', '.####.', '......']);
    expect(fillHoles(open, 6, 5)[2 * 6 + 2]).toBe(0);
  });

  test('label finds 8-connected components and border contact', () => {
    const m = mask(['#....', '.#...', '...##', '.....']);
    const c = label(m, 5, 4);
    expect(c.count).toBe(2);
    expect(c.area.slice(1).sort()).toEqual([2, 2]);
    expect(c.touchesBorder[c.labels[0]]).toBe(true);
  });

  test('closeMask bridges a gap narrower than 2r', () => {
    const m = mask(['..........', '.###..###.', '..........']);
    expect(closeMask(m, 10, 3, 2)[1 * 10 + 4]).toBe(1);
    expect(closeMask(m, 10, 3, 1)[1 * 10 + 4]).toBe(0);
  });

  test('grayClose removes thin dark lines but keeps wide steps', () => {
    const w = 40;
    const src = new Float32Array(w).fill(1);
    src[10] = 0.2; // thin line
    for (let i = 25; i < w; i++) src[i] = 0.3; // wide dark area
    const out = grayClose(src, w, 1, 4);
    expect(out[10]).toBe(1);
    expect(out[35]).toBeCloseTo(0.3);
    expect(out[24]).toBe(1);
  });

  test('grayOpen removes thin bright lines but keeps wide plateaus', () => {
    const w = 40;
    const src = new Float32Array(w);
    src[10] = 0.8; // thin line
    for (let i = 25; i < w; i++) src[i] = 0.6; // wide area
    const out = grayOpen(src, w, 1, 2);
    expect(out[10]).toBe(0);
    expect(out[30]).toBeCloseTo(0.6);
  });

  test('shrink area-averages and enlarge interpolates back', () => {
    const w = 9;
    const h = 5;
    const ramp = Float32Array.from({length: w * h}, (_, i) => (i % w) / 10);
    const s = shrink(ramp, w, h, 2);
    expect([s.w, s.h]).toEqual([5, 3]);
    expect(s.data[0]).toBeCloseTo(0.05); // mean of 0 and 0.1
    expect(s.data[4]).toBeCloseTo(0.8); // edge block averages the pixels it has
    const back = enlarge(s.data, s.w, s.h, 2, w, h);
    for (let x = 1; x < 7; x++) expect(back[2 * w + x]).toBeCloseTo(x / 10); // linear ramp survives inside
  });

  test('otsu splits a bimodal distribution', () => {
    const v = new Float32Array(1000);
    for (let i = 0; i < 1000; i++) v[i] = i < 900 ? 0.05 + (i % 10) * 0.002 : 0.7 + (i % 10) * 0.01;
    const t = otsu(v);
    expect(t).toBeGreaterThan(0.068); // low class tops out at 0.068
    expect(t).toBeLessThanOrEqual(0.7);
  });

  test('hysteresis keeps weak pixels connected to strong ones', () => {
    const s = Float32Array.from([0.9, 0.3, 0.3, 0, 0.3]);
    expect([...hysteresis(s, 5, 1, 0.5, 0.2)]).toEqual([1, 1, 1, 0, 0]);
  });

  test('PNG helper round-trips', () => {
    const img = {data: new Uint8ClampedArray(3 * 2 * 4).map((_, i) => (i * 37) % 256), width: 3, height: 2};
    const back = decodePNG(encodePNG(img));
    expect(back.width).toBe(3);
    expect([...back.data]).toEqual([...img.data]);
  });
});
