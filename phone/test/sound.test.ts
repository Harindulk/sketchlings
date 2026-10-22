import {expect, test} from 'bun:test';
import {limiter} from '../src/sound';

test('limiter lets one call through per window', () => {
  const ok = limiter(70);
  expect([0, 30, 69, 70, 100, 140, 141].map(ok)).toEqual([true, false, false, true, false, true, false]);
});

test('each limiter keeps its own window', () => {
  const a = limiter(100);
  const b = limiter(100);
  expect(a(0)).toBe(true);
  expect(b(10)).toBe(true);
  expect(a(50)).toBe(false);
});
