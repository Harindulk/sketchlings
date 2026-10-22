import {expect, test} from 'bun:test';
import {cleanName} from '../src/name';

// Expected values are what the server's cleanName returns for the same input ('' where the server says "Artist").
test('first word, letters only, at most 12', () => {
  const cases: [string, string][] = [
    ['  mia  rose', 'mia'],
    ['Mary-Jane Smith', 'Mary-Jane'],
    ["O'Brien", "O'Brien"],
    ['O’Neil', 'O’Neil'],
    ['Mia-', 'Mia'],
    ["'Mia", 'Mia'],
    ['Mi1a', 'Mi'],
    ['😀Mia', 'Mia'],
    ['Bartholomew-Alexander', 'Bartholomew'],
    ['a'.repeat(20), 'a'.repeat(12)],
    ['123', ''],
    ['- Mia', ''],
    ['   ', ''],
  ];
  expect(cases.map(([n]) => cleanName(n))).toEqual(cases.map(([, want]) => want));
});

test('keeps the joiners Sinhala and Tamil names need', () => {
  expect(cleanName('ශ්‍රියානි perera')).toBe('ශ්‍රියානි'); // U+200D inside
  expect(cleanName('அருண்')).toBe('அருண்');
  expect(cleanName('‍Mia​')).toBe('Mia'); // a joiner at the edge and a zero-width space go
});
