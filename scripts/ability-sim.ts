// Ability simulation for "what you draw changes how you race": `bun scripts/ability-sim.ts [races per row]` (default 2000).
// Drives the real race engine (tv/src/game/race.ts) headless at 60 steps a second with the assumed players of
// scripts/fairness-sim.ts (BANDS). Each race is replayed with identical recorded inputs and only one creature's ability
// swapped. This is a simulation with assumed inputs, not a playtest (docs/FAIRNESS.md). Seeded: same arguments, same tables.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGE_BOOST, type AgeGroup, type MoveStyle } from "../shared/protocol";
import * as game from "../tv/src/game/race";
import { AIM, BANDS, DT, KINDS, SEED, TAP_JITTER, gauss, randomStats, seedOf } from "./fairness-sim";

type Engine = typeof game;
type Rnd = () => number;
// none: a plain creature with no ability. The game can't make one (no ability means walk), so the sim passes a kind
// the engine doesn't know, which none of its ability checks match.
type Ability = MoveStyle | "none";
const ABILITIES: Ability[] = ["none", ...KINDS];
const MAX_T = 300; // s; timing only: a runner keeps going after the race ends until it crosses
const FAMILY: AgeGroup[] = ["little", "big", "grownup", "grownup"];

// The game has no switch for the Doodle Boost, so "off" (and the what-ifs at the end) load a temp copy of the engine
// with one constant changed. Nothing else in the copy differs; the game itself is untouched.
const src = readFileSync(join(import.meta.dir, "../tv/src/game/race.ts"), "utf8");
const protocol = JSON.stringify(join(import.meta.dir, "../shared/protocol.ts"));
async function engineWith(from: string, to: string): Promise<Engine> {
  assert.equal(src.split(from).length, 2, `the engine no longer has "${from}": update ability-sim.ts`);
  const file = join(tmpdir(), `sketchlings-race-${to.replace(/\W+/g, "-")}.ts`);
  writeFileSync(file, src.replace(from, to).replaceAll("'../../../shared/protocol'", protocol));
  return import(file);
}
const noDoodle = await engineWith("const DOODLE_BOOST_GAP = 150;", "const DOODLE_BOOST_GAP = Infinity;");

// One player's recorded inputs. Taps and ROAR presses are timestamps, replayed as they are. A jump is recorded per ink
// blot (whether they jump it, and how many seconds before reaching it), because a faster creature reaches each blot at
// a different moment. A press that lands during a stun or the ROAR cooldown is lost, as on the real phone.
interface Player { id: string; taps: number[]; roars: number[]; jumps: Map<number, number | null>; tap: number; roar: number; jumped: number }

function record(id: string, age: AgeGroup, rnd: Rnd, blots: number[], tapDelta: number): Player {
  const band = BANDS[age];
  const rate = Math.max(1, band.tap + tapDelta + band.tapSd * gauss(rnd));
  const roars: number[] = [];
  const wait = () => -band.roarWait * Math.log(1 - rnd());
  for (let t = wait(); t < MAX_T; t += game.ROAR_COOLDOWN + wait()) roars.push(t);
  const jumps = new Map<number, number | null>();
  for (const x of blots) jumps.set(x, rnd() < band.miss ? null : AIM + band.aimSd * gauss(rnd));
  const taps: number[] = []; // last, so a faster tapper's extra taps don't shift the other dice
  for (let t = rnd() * 0.3; t < MAX_T; t += Math.max(0.03, (1 / rate) * (1 + TAP_JITTER * gauss(rnd)))) taps.push(t);
  return { id, taps, roars, jumps, tap: 0, roar: 0, jumped: NaN };
}

function act(E: Engine, race: game.Race, p: Player) {
  const r = race.runners.find((q) => q.id === p.id)!;
  if (r.finishedAt >= 0) return;
  for (; p.tap < p.taps.length && p.taps[p.tap] <= race.t; p.tap++) E.input(race, p.id, "tap");
  for (; p.roar < p.roars.length && p.roars[p.roar] <= race.t; p.roar++) E.input(race, p.id, "shout");
  const blot = race.blots[r.lane][r.nextBlot]; // keyed by position: a walker's ROAR removes blots from the list
  const lead = p.jumps.get(blot);
  if (lead != null && blot !== p.jumped && r.v > 0 && (blot - r.x) / r.v <= lead) {
    E.input(race, p.id, "jump");
    p.jumped = blot;
  }
}

function shuffle<T>(rnd: Rnd, a: T[]) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Opts {
  E: Engine;
  ages: AgeGroup[]; // player 0 is the one whose ability, taps or boost a row changes
  ability?: Ability; // player 0's; the others keep the random creature drawn for this seed
  oneOfEach?: boolean; // four racers with one of each kind, in random order
  tapDelta?: number; // player 0 taps this much faster (taps a second)
  noBoost?: boolean; // player 0 races without its age boost
  flat?: boolean; // ink blots removed
}
interface Outcome { winner: number; abilities: Ability[]; time: number; stuns: number } // time and stuns: player 0's

function raceOnce(o: Opts, seed: number): Outcome {
  const rnd = game.makeRng(seedOf(seed, 1)); // the players' dice, drawn in the same order in every row
  const n = o.ages.length;
  const lanes = shuffle(rnd, [...Array(n).keys()]);
  const stats = o.ages.map(() => randomStats(rnd));
  const abilities: Ability[] = o.ages.map(() => KINDS[Math.floor(rnd() * KINDS.length)]);
  const each = shuffle(rnd, [...KINDS]);
  const dice = o.ages.map(() => game.makeRng(1 + Math.floor(rnd() * 2147483645))); // each player's own
  if (o.oneOfEach) abilities.splice(0, n, ...each);
  if (o.ability) abilities[0] = o.ability;
  const race = o.E.createRace(
    lanes.map((i) => ({
      id: `p${i}`,
      stats: stats[i],
      ability: abilities[i] as MoveStyle,
      ageGroup: i === 0 && o.noBoost ? "grownup" : o.ages[i],
    })),
    seedOf(seed, 0),
  );
  const lane = (i: number) => race.runners.find((r) => r.id === `p${i}`)!.lane;
  const players = o.ages.map((age, i) => record(`p${i}`, age, dice[i], race.blots[lane(i)], i === 0 ? (o.tapDelta ?? 0) : 0));
  if (o.flat) race.blots = race.blots.map(() => []);
  const me = race.runners[lane(0)];
  let stuns = 0;
  const tick = () => {
    for (const p of players) act(o.E, race, p);
    const was = me.stunT > 0;
    o.E.step(race, DT);
    if (!was && me.stunT > 0) stuns++;
  };
  while (!race.over) tick();
  const winner = Number(o.E.placements(race)[0].slice(1));
  // Timing only: if player 0 had not crossed when the race ended, it keeps running in the same engine until it does.
  while (me.finishedAt < 0 && race.t < MAX_T) {
    race.over = false;
    tick();
  }
  assert.ok(me.finishedAt >= 0, "player 0 must cross the line");
  return { winner, abilities, time: me.finishedAt, stuns };
}

// Every row uses the same seeds, so rows differ only in what the row changes (paired comparisons).
const series = (o: Opts, n: number) => Array.from({ length: n }, (_, i) => raceOnce(o, SEED + i + 1));

// Mean of paired differences and its 95% margin.
function paired(a: number[], b: number[]) {
  const d = a.map((x, i) => x - b[i]);
  const m = d.reduce((s, x) => s + x, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, d.length - 1));
  return { m, ci: (1.96 * sd) / Math.sqrt(d.length), same: d.every((x) => x === 0) };
}
const signed = (v: number, digits: number) => {
  const s = v.toFixed(digits);
  return Number(s) === 0 ? (0).toFixed(digits) : v > 0 ? `+${s}` : s;
};
const delta = (a: number[], b: number[], digits: number, unit = "") => {
  const p = paired(a, b);
  return p.same ? "same" : `${signed(p.m, digits)}${unit} ±${p.ci.toFixed(digits)}`;
};
const pct = (k: number, n: number) => `${((100 * k) / n).toFixed(1)}% ±${(196 * Math.sqrt((k / n) * (1 - k / n) / n)).toFixed(1)}`;
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;

function selfCheck() {
  const a = series({ E: game, ages: FAMILY, ability: "hop" }, 30);
  assert.deepEqual(a, series({ E: game, ages: FAMILY, ability: "hop" }, 30), "same seed must give the same result");
  const plain = game.createRace([{ id: "x", stats: { speed: 3, jump: 3, power: 3 }, ability: "none" as MoveStyle }], 1);
  assert.equal(plain.runners[0].ability, "none", "the engine must not turn the plain creature into a walker");
  // Hop and walk only act at ink blots, so on a flat track, with identical inputs, they must match none to the frame.
  const flat = (ability: Ability) => series({ E: game, ages: ["little"], ability, flat: true }, 30).map((r) => r.time);
  const none = flat("none");
  assert.deepEqual(flat("hop"), none, "on a flat track hop must change nothing");
  assert.deepEqual(flat("walk"), none, "on a flat track walk must change nothing");
  assert.ok(flat("roll").every((t, i) => t < none[i]), "roll must be faster on a flat track");
  assert.ok(series({ E: game, ages: FAMILY, ability: "fly" }, 30).every((r) => r.stuns === 0), "fly is never stunned");
  assert.ok(series({ E: game, ages: FAMILY, ability: "none" }, 30).some((r) => r.stuns > 0), "a plain creature gets stunned");
  const kinds = series({ E: game, ages: FAMILY, oneOfEach: true }, 30);
  assert.ok(kinds.every((r) => [...r.abilities].sort().join() === [...KINDS].sort().join()), "one of each kind");
  // A creature 1000 dp behind: the game's engine boosts it, the copy without the Doodle Boost doesn't.
  for (const [E, boosted] of [[game, true], [noDoodle, false]] as const) {
    const stats = { speed: 3, jump: 3, power: 3 };
    const race = E.createRace([{ id: "a", stats }, { id: "b", stats, ageGroup: "little" }], 1);
    race.runners[0].x = 1000;
    E.step(race, DT);
    assert.equal(race.runners[1].boost > 1, boosted, "the Doodle Boost must be on in the game and off in the copy");
    assert.equal(race.runners[1].age, AGE_BOOST.little, "both engines apply the age boost from shared/protocol.ts");
  }
}

const n = Number(process.argv[2] ?? 2000);
assert.ok(Number.isInteger(n) && n > 0, "races per row must be a positive whole number");
selfCheck();
console.log(`Self-check passed. ${n} races per row, seed ${SEED}. AGE_BOOST ${JSON.stringify(AGE_BOOST)}.\n`);

// A: one creature alone on the track (no rivals, so no Doodle Boost), on a flat track and on the real one.
const BANDS_A: [AgeGroup, string][] = [["little", "Little kid"], ["grownup", "Grown-up"]];
const times = (o: Opts) => series(o, n).map((r) => r.time);
const cells = new Map<string, string[]>();
for (const [age] of BANDS_A) {
  const solo = { E: game, ages: [age] };
  const baseFlat = times({ ...solo, ability: "none", flat: true });
  const baseRaw = series({ ...solo, ability: "none" }, n);
  const base = baseRaw.map((r) => r.time);
  const add = (label: string, c: string[]) => cells.set(label, [...(cells.get(label) ?? []), ...c]);
  add("none", [`${mean(baseFlat).toFixed(1)} s`, `${mean(base).toFixed(1)} s`, mean(baseRaw.map((r) => r.stuns)).toFixed(1)]);
  const row = (label: string, o: Partial<Opts>) => {
    const raw = series({ ...solo, ...o }, n);
    const flat = delta(times({ ...solo, ...o, flat: true }), baseFlat, 2, " s");
    add(label, [flat, delta(raw.map((r) => r.time), base, 2, " s"), mean(raw.map((r) => r.stuns)).toFixed(1)]);
  };
  for (const k of KINDS) row(k, { ability: k });
  row("none, 1 tap a second faster", { ability: "none", tapDelta: 1 });
  if (age === "grownup") add("none, no age boost", ["—", "—", "—"]); // a grown-up's boost is already 1.0
  else row("none, no age boost", { ability: "none", noBoost: true });
}
console.log("A. Alone on the track: average finish time (none) and the change from none, same inputs. Minus = faster.\n");
console.log(`| Creature | ${BANDS_A.map(([, b]) => `${b}: flat track | ${b}: with ink blots | ${b}: stuns a race`).join(" | ")} |`);
console.log(`|---|${BANDS_A.map(() => "---|---|---").join("|")}|`);
for (const [label, c] of cells) console.log(`| ${label} | ${c.join(" | ")} |`);

// B: the little kid in a family race; only the kid's creature, taps or boost change. The others keep theirs.
const ROWS_B: [string, Partial<Opts>][] = [
  ...ABILITIES.map((k): [string, Partial<Opts>] => [k, { ability: k }]),
  ["none, 1 tap a second faster", { ability: "none", tapDelta: 1 }],
  ["none, no age boost", { ability: "none", noBoost: true }],
];
const engines: [Engine, string][] = [[game, "Doodle Boost on (the game)"], [noDoodle, "Doodle Boost off"]];
const B = engines.map(([E]) => ROWS_B.map(([, o]) => series({ E, ages: FAMILY, ...o }, n)));
console.log("\nB. Family of four (little kid, big kid, 2 grown-ups): the little kid's creature changes, nothing else.\n");
console.log(`| Little kid's creature | ${engines.map(([, e]) => `${e}: youngest wins | change vs none (points) | kid's time vs none`).join(" | ")} |`);
console.log(`|---|${engines.map(() => "---|---|---").join("|")}|`);
const won = (rs: Outcome[]) => rs.map((r) => (r.winner === 0 ? 100 : 0)); // player 0 won, as 0 or 100
const winsOf = (rs: Outcome[], k: Ability) => rs.filter((r) => r.abilities[r.winner] === k).length;
ROWS_B.forEach(([label], row) => {
  const c = engines.map((_, e) => {
    const rs = B[e][row], base = B[e][0];
    const k = rs.filter((r) => r.winner === 0).length;
    return row === 0 ? `${pct(k, n)} | baseline | baseline` : `${pct(k, n)} | ${delta(won(rs), won(base), 1)} | ${delta(rs.map((r) => r.time), base.map((r) => r.time), 2, " s")}`;
  });
  console.log(`| ${label} | ${c.join(" | ")} |`);
});

// C: balance. Family of four with one of each ability, dealt at random: which ability wins?
console.log("\nC. Family of four, one of each ability dealt at random: share of wins by ability (fair share 25%).\n");
const C = engines.map(([E]) => series({ E, ages: FAMILY, oneOfEach: true }, n));
console.log(`| Ability | ${engines.map(([, e]) => e).join(" | ")} |`);
console.log(`|---|${engines.map(() => "---").join("|")}|`);
for (const k of KINDS) console.log(`| ${k} | ${C.map((rs) => pct(winsOf(rs, k), n)).join(" | ")} |`);
for (const rs of C) assert.equal(KINDS.reduce((s, k) => s + winsOf(rs, k), 0), n, "every race has one winner");

// D. What-if only: a slower fly, in a temp copy of the engine. The game keeps FLY_SPEED 1.0 (it was 1.03 until 23 Oct).
console.log("\nD. What if fly were slower? Doodle Boost on. What-if only: the game is unchanged (fly 1.0).\n");
console.log(`| Fly speed | ${KINDS.map((k) => `${k} wins (one of each)`).join(" | ")} | Little kid with fly: youngest wins | change vs none (points) |`);
console.log(`|---|${KINDS.map(() => "---").join("|")}|---|---|`);
for (const speed of ["1.03", "1", "0.97", "0.95"]) {
  const today = speed === "1"; // reuse B and C
  const E = today ? game : await engineWith("const FLY_SPEED = 1.0;", `const FLY_SPEED = ${speed};`);
  const each = today ? C[0] : series({ E, ages: FAMILY, oneOfEach: true }, n);
  const fly = today ? B[0][1] : series({ E, ages: FAMILY, ability: "fly" }, n);
  const none = today ? B[0][0] : series({ E, ages: FAMILY, ability: "none" }, n);
  const shares = KINDS.map((k) => pct(winsOf(each, k), n)).join(" | ");
  console.log(`| ${speed}${today ? " (today)" : ""} | ${shares} | ${pct(fly.filter((r) => r.winner === 0).length, n)} | ${delta(won(fly), won(none), 1)} |`);
}
