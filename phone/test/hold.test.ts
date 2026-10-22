import {afterEach, beforeEach, expect, jest, test} from 'bun:test';
import {HOLD_MS, holdTracker} from '../src/hold';

let log: string[];
let t: ReturnType<typeof holdTracker>;
beforeEach(() => {
  jest.useFakeTimers();
  log = [];
  t = holdTracker(
    () => log.push('hold'),
    () => log.push('release'),
  );
});
afterEach(() => jest.useRealTimers());

test('a quick tap never holds', () => {
  t.down(1);
  jest.advanceTimersByTime(HOLD_MS - 1);
  t.up(1);
  jest.advanceTimersByTime(HOLD_MS);
  expect(log).toEqual([]);
});

test('a finger kept down holds until it lifts', () => {
  t.down(1);
  jest.advanceTimersByTime(HOLD_MS);
  expect(log).toEqual(['hold']);
  t.up(1);
  t.up(1);
  expect(log).toEqual(['hold', 'release']);
});

test('two held fingers hold once and release when the last one lifts', () => {
  t.down(1);
  t.down(2);
  jest.advanceTimersByTime(HOLD_MS);
  t.up(1);
  expect(log).toEqual(['hold']);
  t.down(3); // a quick tap with another finger meanwhile
  t.up(3);
  t.up(2);
  expect(log).toEqual(['hold', 'release']);
});

test('clear releases a hold and cancels pending ones', () => {
  t.down(1);
  jest.advanceTimersByTime(HOLD_MS);
  t.down(2);
  t.clear();
  jest.advanceTimersByTime(HOLD_MS);
  expect(log).toEqual(['hold', 'release']);
});
