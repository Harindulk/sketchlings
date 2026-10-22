// The server's first-name rule (cleanName in server/src/rooms.ts), so the phone greets with the name the TV shows.
// The server also runs its word guard (a blocked name becomes "Artist"); the phone has no word list.

// A letter run; ZWNJ/ZWJ only between letters or marks, because Sinhala and Tamil spell with them (ශ්‍රියානි).
const RUN = String.raw`\p{L}(?:[\p{L}\p{M}]|[‌‍]+(?=[\p{L}\p{M}]))*`;
const LETTERS = new RegExp(`${RUN}(?:['’-]${RUN})*`, 'u');

/** The first word's letters (an inner hyphen, apostrophe, ZWNJ or ZWJ is fine), at most 12. '' when none are left. */
export function cleanName(name: string): string {
  const word = name
    .normalize('NFC')
    .replace(/(?![‌‍])\p{Cf}/gu, '')
    .split(/[\s\p{Cc}]+/u)
    .map((w) => w.replace(/^[‌‍]+|[‌‍]+$/g, ''))
    .find(Boolean);
  const letters = word?.match(LETTERS)?.[0] ?? '';
  return [...letters].slice(0, 12).join('').replace(/['’‌‍-]+$/u, '');
}
