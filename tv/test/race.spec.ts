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

describe('abilities (what you draw changes how you play)', () => {
  const blotAhead = (race: ReturnType<typeof createRace>, i: number) => {
    race.runners[i].x = race.blots[i][0] - 5;
    race.runners[i].nextBlot = 0;
  };

  it('fly floats over ink blots, hop springs over them, walk gets stunned', () => {
    const race = createRace(
      [
        {id: 'f', stats, ability: 'fly'},
        {id: 'h', stats, ability: 'hop'},
        {id: 'w', stats, ability: 'walk'},
      ],
      5,
    );
    [0, 1, 2].forEach((i) => blotAhead(race, i));
    input(race, 'h', 'jump');
    step(race, 0.2);
    const [f, h, w] = race.runners;
    expect(f.stunT).toBe(0);
    expect(f.saves).toBe(1);
    expect(h.stunT).toBe(0);
    expect(h.saves).toBe(1);
    expect(w.stunT).toBeGreaterThan(0);
  });

  it('hop jumps are higher and longer', () => {
    const race = createRace([{id: 'h', stats, ability: 'hop'}, {id: 'w', stats}], 6);
    race.blots = [[], []];
    input(race, 'h', 'jump');
    input(race, 'w', 'jump');
    step(race, 0.8); // a plain jump (0.75 s) has landed, the hop is still up
    expect(jumpY(race.runners[0])).toBeGreaterThan(20);
    expect(jumpY(race.runners[1])).toBe(0);
  });

  it('walk ROAR knocks the ink blots just ahead out of its lane', () => {
    const race = createRace([{id: 'w', stats, ability: 'walk'}, {id: 'r', stats, ability: 'roll'}], 7);
    const first = race.blots[0][0];
    race.runners[0].x = first - 100;
    const before = race.blots[0].length;
    input(race, 'w', 'shout');
    expect(race.blots[0]).not.toContain(first);
    expect(race.blots[0].length).toBeLessThan(before);
    expect(race.runners[0].saves).toBe(1);
  });

  it('roll zooms after a stretch of flat ground', () => {
    const race = createRace([{id: 'r', stats, ability: 'roll'}, {id: 'w', stats}], 8);
    race.blots = [[], []];
    step(race, 1);
    const [r, w] = race.runners;
    expect(r.v).toBeCloseTo(w.v, 5);
    step(race, 1);
    expect(r.v).toBeGreaterThan(w.v * 1.05);
    expect(r.saves).toBe(1);
  });

  it('is balanced: every kind wins a fair share of equal bot races', () => {
    const kinds = ['fly', 'roll', 'hop', 'walk'] as const;
    const wins: Record<string, number> = {fly: 0, roll: 0, hop: 0, walk: 0};
    const N = 200;
    for (let seed = 1; seed <= N; seed++) {
      const race = createRace(
        kinds.map((_, i) => {
          const k = kinds[(i + seed) % 4]; // rotate lanes so one lane's blots don't favour a kind
          return {id: k, stats, bot: true, ability: k};
        }),
        seed,
      );
      run(race, 120);
      wins[placements(race)[0]]++;
    }
    for (const k of kinds) {
      expect(wins[k] / N).toBeGreaterThan(0.15);
      expect(wins[k] / N).toBeLessThan(0.36);
    }
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
