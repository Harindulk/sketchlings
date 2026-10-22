// Doodle Dash rules as a pure simulation (no React): the Race screen steps it once per frame and copies
// positions into Animated values. Units: dp and seconds.
import type {AgeGroup, InputKind, MoveStyle, Stats} from '../../../shared/protocol';
import {AGE_BOOST} from '../../../shared/protocol';

export const TRACK = 8600; // start line at x=0, finish at x=TRACK
export const JUMP_TIME = 0.75;
export const ROAR_TIME = 1.2;
export const ROAR_COOLDOWN = 4;
const ROAR_SPEED = 140;
const TIME_LIMIT = 75;
const AFTER_FIRST = 10; // seconds the others get after the winner crosses
const DOODLE_BOOST_GAP = 150; // trailing by more than this (dp) starts the Doodle Boost
// Abilities (what you draw changes how you play), balanced in test/race.spec.ts so every kind can win:
const FLY_SPEED = 1.0; // fly: floats over ink blots (never stunned); 1.03 won 37% of one-of-each races (docs/FAIRNESS.md)
const ROLL_AFTER = 1.5; // roll: after this long on flat ground (no jump, no stun)...
const ROLL_SPEED = 1.1; // ...it zooms
const HOP_HEIGHT = 1.3; // hop: higher...
const HOP_TIME = 1.45; // ...and longer jumps, so a badly timed jump still clears a blot...
const HOP_SPEED = 1.07; // ...and covers more ground while in the air
const KNOCK_RANGE = 420; // walk: ROAR knocks the ink blots this far ahead out of its lane
const HOLD_LEASE = 1.5; // a hold the phone stops re-sending (every 0.5 s) ends, so a lost 'release' can't run a racer alone
const HOLD_AFTER_TAP = 0.25; // a hold counts only between taps: hold + taps = max(taps, 4/s), not the sum

export interface RunnerInit {
  id: string;
  stats: Stats;
  ageGroup?: AgeGroup;
  bot?: boolean;
  ability?: MoveStyle; // Sketchling.ability.kind; none = walk
}

export interface Runner {
  id: string;
  lane: number;
  stats: Stats;
  age: number; // AGE_BOOST multiplier, shown as a badge
  bot: boolean;
  x: number;
  v: number;
  energy: number; // tap energy, decays
  jumpT: number; // seconds into the jump, -1 when on the ground
  stunT: number; // seconds of stun left
  roarT: number; // seconds of ROAR left
  roarCd: number; // seconds until the next ROAR is allowed
  holding: boolean;
  holdAt: number; // race time of the last 'hold'
  lastTap: number; // race time of the last 'tap'
  boost: number; // Doodle Boost multiplier (1 = none)
  nextBlot: number;
  finishedAt: number; // race time, -1 while running
  ability: MoveStyle;
  flatT: number; // roll: seconds on flat ground
  saves: number; // times the ability saved or boosted this runner (the TV pops "WINGS!" etc.)
  savedAt: number; // race time of the last one
  // bot brain
  botRate: number;
  botDecided: number; // index of the blot the bot already decided about
}

export interface Race {
  t: number;
  runners: Runner[];
  blots: number[][]; // per lane, ascending x
  finishOrder: string[];
  over: boolean;
  rnd: () => number;
}

export function makeRng(seed: number) {
  let s = seed % 2147483647 || 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function createRace(inits: RunnerInit[], seed = Date.now()): Race {
  const rnd = makeRng(seed);
  const pattern: number[] = [];
  for (let x = 650; x < TRACK - 350; x += 520 + rnd() * 380) pattern.push(x);
  return {
    t: 0,
    rnd,
    finishOrder: [],
    over: false,
    blots: inits.map(() =>
      pattern.map((x) => Math.round(x + (rnd() - 0.5) * 120)),
    ),
    runners: inits.map((r, lane) => ({
      id: r.id,
      lane,
      stats: r.stats,
      age: AGE_BOOST[r.ageGroup ?? 'grownup'] ?? 1,
      bot: !!r.bot,
      x: 0,
      v: 0,
      energy: 0,
      jumpT: -1,
      stunT: 0,
      roarT: 0,
      roarCd: 0,
      holding: false,
      holdAt: -9,
      lastTap: -1,
      boost: 1,
      nextBlot: 0,
      finishedAt: -1,
      ability: r.ability ?? 'walk',
      flatT: 0,
      saves: 0,
      savedAt: -9,
      botRate: 3.6 + rnd() * 1.6,
      botDecided: -1,
    })),
  };
}

const clampStat = (n: number) => Math.max(1, Math.min(5, Math.round(n || 3)));
const tapPower = (r: Runner) => 19 + 2 * clampStat(r.stats.power);
const hop = (r: Runner) => r.ability === 'hop';
export const jumpHeight = (r: Runner) =>
  (62 + 9 * clampStat(r.stats.jump)) * (hop(r) ? HOP_HEIGHT : 1);
const jumpTime = (r: Runner) => JUMP_TIME * (hop(r) ? HOP_TIME : 1);
export const jumpY = (r: Runner) => {
  if (r.jumpT < 0) return 0;
  const p = r.jumpT / jumpTime(r);
  return 4 * jumpHeight(r) * p * (1 - p);
};
const saved = (race: Race, r: Runner) => {
  r.saves++;
  r.savedAt = race.t;
};

export function input(race: Race, id: string, kind: InputKind) {
  const r = race.runners.find((q) => q.id === id);
  if (!r || race.over || r.finishedAt >= 0) return;
  switch (kind) {
    case 'tap':
      r.energy = Math.min(160, r.energy + tapPower(r));
      r.lastTap = race.t;
      break;
    case 'jump':
      if (r.jumpT < 0 && r.stunT <= 0) r.jumpT = 0;
      break;
    case 'hold':
      r.holding = true;
      r.holdAt = race.t;
      break;
    case 'release':
      r.holding = false;
      break;
    case 'shout':
      if (r.roarCd <= 0 && r.stunT <= 0) {
        r.roarT = ROAR_TIME;
        r.roarCd = ROAR_COOLDOWN;
        if (r.ability === 'walk') {
          const lane = race.blots[r.lane];
          const near = lane.filter((x) => x >= r.x && x < r.x + KNOCK_RANGE);
          if (near.length) {
            race.blots[r.lane] = lane.filter((x) => !near.includes(x));
            r.nextBlot = race.blots[r.lane].findIndex((x) => x >= r.x);
            if (r.nextBlot < 0) r.nextBlot = race.blots[r.lane].length;
            saved(race, r);
          }
        }
      }
      break;
  }
}

export function step(race: Race, dt: number) {
  if (race.over) return;
  race.t += dt;
  const leaderX = Math.max(...race.runners.map((r) => r.x));
  for (const r of race.runners) {
    if (r.bot) botThink(race, r, dt);
    const held =
      r.holding &&
      race.t - r.holdAt < HOLD_LEASE &&
      race.t - r.lastTap > HOLD_AFTER_TAP;
    if (held) r.energy = Math.min(160, r.energy + tapPower(r) * 4 * dt); // holding = 4 taps/s, for the littlest
    r.energy *= Math.exp(-1.6 * dt);
    r.roarCd = Math.max(0, r.roarCd - dt);
    r.roarT = Math.max(0, r.roarT - dt);
    const gap = leaderX - r.x;
    r.boost =
      r.finishedAt < 0 && gap > DOODLE_BOOST_GAP
        ? 1 + Math.min(0.7, (gap - DOODLE_BOOST_GAP) / 600)
        : 1;

    if (r.stunT > 0) {
      r.stunT -= dt;
      r.v = 0;
    } else if (r.finishedAt >= 0) {
      r.v *= Math.exp(-2.5 * dt); // coast after the line
    } else {
      const base = 40 + 8 * clampStat(r.stats.speed);
      const flat = r.jumpT < 0 ? (r.flatT += dt) : (r.flatT = 0);
      if (r.ability === 'roll' && flat >= ROLL_AFTER && flat - dt < ROLL_AFTER)
        saved(race, r); // the wheels kick in
      const kind =
        r.ability === 'fly'
          ? FLY_SPEED
          : r.ability === 'roll' && flat >= ROLL_AFTER
          ? ROLL_SPEED
          : hop(r) && r.jumpT >= 0
          ? HOP_SPEED
          : 1;
      r.v =
        (base + r.energy) * kind * r.age * r.boost +
        (r.roarT > 0 ? ROAR_SPEED : 0);
    }
    r.x += r.v * dt;

    if (r.jumpT >= 0) {
      r.jumpT += dt;
      if (r.jumpT >= jumpTime(r)) r.jumpT = -1;
    }

    const blots = race.blots[r.lane];
    while (r.nextBlot < blots.length && r.x >= blots[r.nextBlot]) {
      if (r.finishedAt >= 0) {
        // past the line: blots don't matter
      } else if (jumpY(r) >= 20) {
        if (hop(r)) saved(race, r); // sprang over it
      } else if (r.ability === 'fly') {
        saved(race, r); // floats over it
      } else {
        r.stunT = 1.1 - 0.12 * clampStat(r.stats.power);
        r.energy *= 0.4;
        r.roarT = 0;
        r.flatT = 0;
      }
      r.nextBlot++;
    }

    if (r.finishedAt < 0 && r.x >= TRACK) {
      r.finishedAt = race.t;
      race.finishOrder.push(r.id);
    }
  }
  const first = race.runners.find((r) => r.id === race.finishOrder[0]);
  race.over =
    race.finishOrder.length === race.runners.length ||
    race.t > TIME_LIMIT ||
    (!!first && race.t - first.finishedAt > AFTER_FIRST);
}

function botThink(race: Race, r: Runner, dt: number) {
  if (r.finishedAt >= 0) return;
  const rnd = race.rnd;
  if (rnd() < r.botRate * dt) input(race, r.id, 'tap');
  const next = race.blots[r.lane][r.nextBlot];
  if (next !== undefined && r.botDecided !== r.nextBlot) {
    const dist = next - r.x;
    if (dist > 0 && dist < 30 + r.v * 0.28) {
      r.botDecided = r.nextBlot;
      if (rnd() < (hop(r) ? 0.95 : 0.78)) input(race, r.id, 'jump'); // springy legs: easy to time
    }
  }
  // ROAR now and then; walkers save theirs for when an ink blot is close (about as often overall)
  if (r.roarCd <= 0 && race.t > 3) {
    const near = next !== undefined && next - r.x < KNOCK_RANGE * 0.6;
    const rate = r.ability !== 'walk' ? 0.12 : near ? 1 : 0;
    if (rnd() < rate * dt) input(race, r.id, 'shout');
  }
}

/** Finish order first, then everyone else by distance. */
export function placements(race: Race): string[] {
  const rest = race.runners
    .filter((r) => r.finishedAt < 0)
    .sort((a, b) => b.x - a.x)
    .map((r) => r.id);
  return [...race.finishOrder, ...rest];
}
