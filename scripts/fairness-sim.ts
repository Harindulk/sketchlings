// Fairness simulation for "the youngest can really win": `bun scripts/fairness-sim.ts [races per scenario]` (default 2000).
// Drives the real race engine (tv/src/game/race.ts: age boost, Doodle Boost, abilities, ink blots, ROAR) headless at
// 60 steps a second. Only the players are modelled, and every number in BANDS is an assumption (docs/FAIRNESS.md).
// This is a simulation with assumed inputs, not a playtest. Seeded: the same arguments print the same table.
import assert from "node:assert/strict";
import { AGE_BOOST, type AgeGroup, type MoveStyle, type Stats } from "../shared/protocol";
import { createRace, input, makeRng, placements, step, type Race } from "../tv/src/game/race";

// How each age band plays. tap: taps a second (mean, spread between players); miss: chance of not jumping at an ink
// blot at all; aimSd: timing error (s) of the jumps they do make; roarWait: mean seconds before pressing a ready ROAR.
interface Band { tap: number; tapSd: number; miss: number; aimSd: number; roarWait: number }
export const BANDS: Record<AgeGroup, Band> = {
  little: { tap: 4, tapSd: 1, miss: 0.3, aimSd: 0.25, roarWait: 5 },
  big: { tap: 5.5, tapSd: 1, miss: 0.15, aimSd: 0.15, roarWait: 2.5 },
  grownup: { tap: 7, tapSd: 1, miss: 0.05, aimSd: 0.08, roarWait: 1 }, // a grown-up who is trying to win
};
export const AIM = 0.35; // s before reaching a blot that a player aims to jump; a plain jump clears it from about 0.05 to 0.7 s
export const TAP_JITTER = 0.15; // each tap interval varies by this fraction: tapping is rhythmic, not random
export const DT = 1 / 60;
export const KINDS: MoveStyle[] = ["fly", "roll", "hop", "walk"];
export const SEED = 20261022;

const SCENARIOS: { name: string; ages: AgeGroup[] }[] = [
  { name: "Little kid vs grown-up", ages: ["little", "grownup"] },
  { name: "Family of four (little, big, 2 grown-ups)", ages: ["little", "big", "grownup", "grownup"] },
  { name: "Six-lane party (little, 2 big, 3 grown-ups)", ages: ["little", "big", "big", "grownup", "grownup", "grownup"] },
];

type Rnd = () => number;
export const gauss = (rnd: Rnd) => Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(2 * Math.PI * rnd());

// makeRng's first draws barely change between neighbouring seeds (race n and n+1 got almost the same first dice), so
// each race number is scrambled first (murmur3's fmix32). Stream 0 seeds the engine's track, stream 1 the players' dice.
export function seedOf(race: number, stream: number) {
  let h = race * 4 + stream;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (((h ^ (h >>> 16)) >>> 0) % 2147483646) + 1;
}

// Claude's persona prompt asks for stats of 1 to 5 adding up to 7 to 11 (server/src/persona.ts).
export function randomStats(rnd: Rnd): Stats {
  for (;;) {
    const s = { speed: 1 + Math.floor(rnd() * 5), jump: 1 + Math.floor(rnd() * 5), power: 1 + Math.floor(rnd() * 5) };
    const sum = s.speed + s.jump + s.power;
    if (sum >= 7 && sum <= 11) return s;
  }
}

interface Player { id: string; age: AgeGroup; band: Band; rate: number; nextTap: number; blot: number; lead: number | null }

function act(race: Race, p: Player, rnd: Rnd) {
  const r = race.runners.find((q) => q.id === p.id)!;
  if (r.finishedAt >= 0) return;
  while (race.t >= p.nextTap) {
    input(race, p.id, "tap");
    p.nextTap += Math.max(0.03, (1 / p.rate) * (1 + TAP_JITTER * gauss(rnd)));
  }
  const blot = race.blots[r.lane][r.nextBlot];
  if (blot !== undefined && blot !== p.blot) {
    p.blot = blot; // a new ink blot ahead: decide now whether and when to jump it
    p.lead = rnd() < p.band.miss ? null : AIM + p.band.aimSd * gauss(rnd);
  }
  if (p.lead !== null && r.v > 0 && (blot - r.x) / r.v <= p.lead) {
    input(race, p.id, "jump");
    p.lead = null;
  }
  if (r.roarCd <= 0 && r.stunT <= 0 && rnd() < DT / p.band.roarWait) input(race, p.id, "shout");
}

interface Outcome { winner: AgeGroup; gap: number } // gap: youngest's finish time minus the best grown-up's (s)

/** One race. boost=false races everyone as a grown-up (no age boost); the Doodle Boost is always on, as in the game. */
function raceOnce(ages: AgeGroup[], boost: boolean, seed: number, littleTapDelta = 0): Outcome {
  const rnd = makeRng(seedOf(seed, 1)); // the players' dice; the engine has its own
  const players: Player[] = ages.map((age, i) => {
    const band = BANDS[age];
    const mean = band.tap + (age === "little" ? littleTapDelta : 0);
    return { id: `p${i}`, age, band, rate: Math.max(1, mean + band.tapSd * gauss(rnd)), nextTap: rnd() * 0.3, blot: NaN, lead: null };
  });
  const lanes = players.map((_, i) => i); // random lanes, so one lane's blots favour nobody
  for (let i = lanes.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
  }
  const race = createRace(
    lanes.map((i) => ({
      id: players[i].id,
      stats: randomStats(rnd),
      ability: KINDS[Math.floor(rnd() * KINDS.length)],
      ageGroup: boost ? players[i].age : "grownup",
    })),
    seedOf(seed, 0),
  );
  while (!race.over) {
    for (const p of players) act(race, p, rnd);
    step(race, DT);
  }
  const winner = players.find((p) => p.id === placements(race)[0])!.age;
  // Timing only: whoever had not crossed when the race ended keeps running in the same engine until they do.
  while (race.runners.some((r) => r.finishedAt < 0) && race.t < 200) {
    race.over = false;
    for (const p of players) act(race, p, rnd);
    step(race, DT);
  }
  const time = (p: Player) => {
    const f = race.runners.find((r) => r.id === p.id)!.finishedAt;
    return f < 0 ? Infinity : f;
  };
  const youngest = players.find((p) => p.age === "little")!;
  const bestGrownup = Math.min(...players.filter((p) => p.age === "grownup").map(time));
  return { winner, gap: time(youngest) - bestGrownup };
}

interface Row { scenario: string; boost: boolean; littleTap: number; n: number; wins: Record<AgeGroup, number>; youngestWinPct: number; grownupWinPct: number; medianGap: number; fairShare: number }

function run(s: (typeof SCENARIOS)[number], boost: boolean, n: number, littleTapDelta = 0): Row {
  const wins: Record<AgeGroup, number> = { little: 0, big: 0, grownup: 0 };
  const gaps: number[] = [];
  for (let i = 1; i <= n; i++) {
    const o = raceOnce(s.ages, boost, SEED + i, littleTapDelta); // same seeds for every row: paired comparisons
    wins[o.winner]++;
    gaps.push(o.gap);
  }
  gaps.sort((a, b) => a - b);
  const pct = (k: number) => Math.round((1000 * k) / n) / 10;
  return {
    scenario: s.name,
    boost,
    littleTap: BANDS.little.tap + littleTapDelta,
    n,
    wins,
    youngestWinPct: pct(wins.little),
    grownupWinPct: pct(wins.grownup),
    medianGap: Math.round(10 * gaps[Math.floor(n / 2)]) / 10,
    fairShare: Math.round(1000 / s.ages.length) / 10,
  };
}

function selfCheck() {
  const a = run(SCENARIOS[1], true, 40), b = run(SCENARIOS[1], true, 40);
  assert.deepEqual(a, b, "same seed must give the same result");
  assert.equal(a.wins.little + a.wins.big + a.wins.grownup, 40, "every race has exactly one winner");
  const c = run(SCENARIOS[0], false, 40);
  assert.equal(c.wins.little + c.wins.big + c.wins.grownup, 40, "every race has exactly one winner");
  const first = Array.from({ length: 2000 }, (_, i) => makeRng(seedOf(SEED + i + 1, 1))());
  assert.ok(Math.abs(first.reduce((s, x) => s + x, 0) / first.length - 0.5) < 0.02, "neighbouring races must get unrelated dice");
  const kid = createRace([{ id: "k", stats: { speed: 3, jump: 3, power: 3 }, ageGroup: "little" }], 1).runners[0];
  assert.equal(kid.age, AGE_BOOST.little, "the engine applies the little kids' boost from shared/protocol.ts");
}

// Runs only as a script: scripts/ability-sim.ts imports the players from here.
if (import.meta.main) {
  const n = Number(process.argv[2] ?? 2000);
  assert.ok(Number.isInteger(n) && n > 0, "races per scenario must be a positive whole number");
  selfCheck();
  console.log(`Self-check passed. ${n} races per row, seed ${SEED}. AGE_BOOST ${JSON.stringify(AGE_BOOST)}.\n`);
  const ci = (pct: number) => Math.round(196 * Math.sqrt((pct / 100) * (1 - pct / 100) / n) * 10) / 10; // 95% margin, points
  const rows: Row[] = [];
  for (const s of SCENARIOS) {
    rows.push(run(s, true, n), run(s, false, n), run(s, true, n, -1), run(s, true, n, 1));
  }
  console.log("| Scenario | Age boost | Little kid taps/s | Youngest wins | Fair share | A grown-up wins | Median gap (s) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.scenario} | ${r.boost ? "on" : "off"} | ${r.littleTap} | ${r.youngestWinPct}% ±${ci(r.youngestWinPct)} | ${r.fairShare}% | ${r.grownupWinPct}% ±${ci(r.grownupWinPct)} | ${r.medianGap > 0 ? "+" : ""}${r.medianGap.toFixed(1)} |`,
    );
  }
  console.log("\nMedian gap = youngest's finish time minus the fastest grown-up's; + means the grown-up crossed first.");

  // What-if only: other little-kid boosts, set in this process's copy of AGE_BOOST. The game's value is not changed.
  const real = AGE_BOOST.little;
  console.log("\nWhat if the little kids' boost were different? (little kid at 4 taps/s, big kids stay at 1.2)\n");
  console.log(`| Little kid boost | ${SCENARIOS.map((s) => `${s.name}: youngest / a grown-up`).join(" | ")} |`);
  console.log(`|---|${SCENARIOS.map(() => "---").join("|")}|`);
  for (const b of [1.5, 1.6, 1.7, 1.8]) {
    AGE_BOOST.little = b;
    console.log(`| ${b} | ${SCENARIOS.map((s) => run(s, true, n)).map((r) => `${r.youngestWinPct}% / ${r.grownupWinPct}%`).join(" | ")} |`);
  }
  AGE_BOOST.little = real;
}
