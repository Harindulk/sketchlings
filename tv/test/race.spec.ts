import {createRace, input, jumpY, placements, step, TRACK} from '../src/game/race';

const stats = {speed: 3, jump: 3, power: 3};
const run = (race: ReturnType<typeof createRace>, secs: number) => {
  for (let i = 0; i < secs * 60 && !race.over; i++) step(race, 1 / 60);
};

describe('Doodle Dash sim', () => {
  it('bot race finishes in a party-sized time with everyone placed', () => {
    const race = createRace(
      [
        {id: 'a', stats, ageGroup: 'little', bot: true},
        {id: 'b', stats, ageGroup: 'big', bot: true},
        {id: 'c', stats, ageGroup: 'grownup', bot: true},
        {id: 'd', stats: {speed: 5, jump: 1, power: 3}, ageGroup: 'little', bot: true},
      ],
      42,
    );
    run(race, 120);
    expect(race.over).toBe(true);
    expect(race.t).toBeGreaterThan(25);
    expect(race.t).toBeLessThan(76);
    expect(placements(race).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(race.finishOrder.length).toBeGreaterThan(0);
  });

  it('an ink blot stuns a runner that does not jump, and a jump clears it', () => {
    const race = createRace([{id: 'a', stats}, {id: 'b', stats}], 1);
    const blot = race.blots[0][0];
    race.runners[0].x = blot - 5;
    race.runners[1].x = race.blots[1][0] - 5;
    input(race, 'b', 'jump');
    for (let i = 0; i < 10; i++) step(race, 1 / 60); // b is airborne by now
    input(race, 'a', 'tap');
    step(race, 0.2);
    expect(race.runners[0].stunT).toBeGreaterThan(0);
    expect(race.runners[1].stunT).toBe(0);
    expect(jumpY(race.runners[1])).toBeGreaterThan(20);
  });

  it('age boost and ROAR make a runner faster; ROAR has a cooldown', () => {
    const race = createRace([{id: 'kid', stats, ageGroup: 'little'}, {id: 'mum', stats, ageGroup: 'grownup'}], 3);
    race.blots = [[], []];
    step(race, 1);
    const [kid, mum] = race.runners;
    expect(kid.x).toBeCloseTo(mum.x * 1.4, 0);
    input(race, 'mum', 'shout');
    const cd = mum.roarCd;
    input(race, 'mum', 'shout'); // ignored during cooldown
    expect(mum.roarCd).toBe(cd);
    const before = mum.x;
    step(race, 0.5);
    expect(mum.x - before).toBeGreaterThan(kid.v * 0.5 * 0); // moved
    expect(mum.v).toBeGreaterThan(kid.v);
    expect(TRACK).toBeGreaterThan(0);
  });
});

import {decode64} from '../src/audio';
import {NARRATOR} from '../src/assets/narrator';

declare const Buffer: {from(x: unknown, enc?: string): {equals(o: unknown): boolean; toString(): string}};

describe('narrator bundle', () => {
  it('decodes base64 clips byte-exact (fMP4 starts with an ftyp box)', () => {
    for (const b64 of Object.values(NARRATOR)) {
      const bytes = decode64(b64);
      expect(Buffer.from(bytes).equals(Buffer.from(b64, 'base64'))).toBe(true);
      expect(Buffer.from(bytes.slice(4, 8)).toString()).toBe('ftyp');
    }
    expect(Object.keys(NARRATOR)).toEqual(expect.arrayContaining(['three', 'two', 'one', 'go', 'roar', 'winner-is']));
  });
});
