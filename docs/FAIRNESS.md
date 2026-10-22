# Fairness simulation: can the youngest really win?

**This is a simulation with assumed inputs, not a playtest. No child played these races. Every number about how people tap, jump and ROAR is our assumption.**

We say "the youngest can really win". We have no playtest behind that yet. This page checks the claim the only way we can today: we run the game's own race engine thousands of times with modelled players and count who wins. A second simulation, [further down](#ability-simulation-does-what-you-draw-change-the-race), checks that the boosts don't drown out what the child drew.

## What was simulated

- **The real engine.** `scripts/fairness-sim.ts` imports `tv/src/game/race.ts`, the same code the TV runs, and steps it 60 times a second, like the TV's frame loop. No race rule is re-implemented. That covers:
  - the age boost from `shared/protocol.ts` (`AGE_BOOST`: little 1.4, big 1.2, grown-up 1.0);
  - the Doodle Boost (more than 150 dp behind the leader speeds you up, up to +70%);
  - ink blots and stuns;
  - the four abilities (wings, wheels, long legs, big body);
  - ROAR (+140 dp/s for 1.2 s, then a 4 s cooldown);
  - the end rule (10 s after the winner crosses, 75 s at most).
- **Only the players are modelled.** Each player taps, jumps at ink blots and presses ROAR through the engine's own `input()`, the same call the phones' messages reach.
- **Random creatures.** Each racer gets a random ability (all four equally likely) and random stats: each 1 to 5, adding up to 7 to 11, the rule in Claude's persona prompt (`server/src/persona.ts`). Lanes are shuffled every race.
- **Boost off** means everyone races at the grown-up multiplier (1.0). The Doodle Boost stays on in every row, because the game has no switch for it.
- **Scale.** 2,000 races per row, seed 20261022. Every row uses the same 2,000 seeds, so rows differ only in what the row changes.
- **Scenarios.** (a) one little kid against one grown-up; (b) a family of four: a little kid, a big kid and two grown-ups; (c) a six-lane party: a little kid, two big kids and three grown-ups. Each one runs with the boost on, with it off, and with the little kid tapping one a second slower and one a second faster.

## Assumptions

| Age band | Taps a second (mean, spread between players) | Doesn't jump an ink blot at all | Timing error of the jumps they make | Waits before pressing a ready ROAR (mean) |
|---|---|---|---|---|
| Little kid (4 to 7) | 4 ± 1 | 30% | 0.25 s | 5 s |
| Big kid (8 to 12) | 5.5 ± 1 | 15% | 0.15 s | 2.5 s |
| Grown-up, trying to win | 7 ± 1 | 5% | 0.08 s | 1 s |

- Everyone aims to jump 0.35 s before reaching a blot. In the engine a plain jump clears a blot if it starts about 0.05 to 0.7 s before. With these numbers a little kid with a plain jump gets stuck on about 4 blots in 10, a big kid on about 2 in 10 and a grown-up on about 1 in 20.
- Tapping is rhythmic: each gap between taps varies by about 15%.
- A grown-up "trying" never eases off to let a child win.

**Sources.**
- **Grown-ups.** In a smartphone tapping study where people tapped one finger as fast as they could, adults aged 50 to 70 averaged 5.2 taps a second, and adults aged 18 to 30 were faster with the index and middle fingers (Heimhofer et al., "Finger-specific effects of age on tapping speed and motor fatigability", *Frontiers in Human Neuroscience* 18:1427336, 2024, [doi:10.3389/fnhum.2024.1427336](https://doi.org/10.3389/fnhum.2024.1427336)). Our tap pad counts every finger, so we assume a grown-up drums with two thumbs at 7 a second over a race of about 40 s. That rate is our assumption, not a measurement.
- **Children.** We found no published taps-a-second figures for 4 to 7-year-olds on a phone. Children's tapping norms do exist, for example Knights and Moule, "Normative and reliability data on finger and foot tapping in children" (*Perceptual and Motor Skills*, 1967), and the timed 20 finger taps in Denckla's PANESS exam (Roeder et al., *Child Neuropsychology*, 2008). We could not read their figures, so the children's rates above are our assumption. An earlier search for this project found none either (`research_notes/Fire TV winning idea rethink/low_hassle_sketchlings.md`).
- **Jumps and ROAR.** The miss rates, timing errors and ROAR waits have no source. They are our guesses.

**A fact from the engine, not an assumption.** Each tap adds 19 + 2 × power energy, capped at 160, and energy fades by about four fifths every second. So above about 9 to 12 taps a second (depending on power), extra taps add nothing. This cap limits how far a very fast grown-up can pull away.

## Results

2,000 simulated races per row. "± points" is the 95% margin from the number of races, not from the assumptions. Percentages are rounded, so a pair can add up to 100.1%.

| Scenario | Age boost | Little kid taps/s | Youngest wins | Fair share | A grown-up wins | Median gap (s) |
|---|---|---|---|---|---|---|
| Little kid vs grown-up | on | 4 | 27.8% ±2 | 50% | 72.2% ±2 | +1.0 |
| Little kid vs grown-up | off | 4 | 0.6% ±0.3 | 50% | 99.5% ±0.3 | +3.0 |
| Little kid vs grown-up | on | 3 | 11.4% ±1.4 | 50% | 88.7% ±1.4 | +1.6 |
| Little kid vs grown-up | on | 5 | 48.9% ±2.2 | 50% | 51.2% ±2.2 | +0.1 |
| Family of four (little, big, 2 grown-ups) | on | 4 | 12.2% ±1.4 | 25% | 60.1% ±2.1 | +1.1 |
| Family of four (little, big, 2 grown-ups) | off | 4 | 0.1% ±0.1 | 25% | 95% ±1 | +3.6 |
| Family of four (little, big, 2 grown-ups) | on | 3 | 4.4% ±0.9 | 25% | 66.7% ±2.1 | +1.8 |
| Family of four (little, big, 2 grown-ups) | on | 5 | 30.4% ±2 | 25% | 47.3% ±2.2 | +0.5 |
| Six-lane party (little, 2 big, 3 grown-ups) | on | 4 | 8.2% ±1.2 | 16.7% | 57.5% ±2.2 | +1.2 |
| Six-lane party (little, 2 big, 3 grown-ups) | off | 4 | 0.2% ±0.2 | 16.7% | 95.5% ±0.9 | +4.0 |
| Six-lane party (little, 2 big, 3 grown-ups) | on | 3 | 1.8% ±0.6 | 16.7% | 61.6% ±2.1 | +1.9 |
| Six-lane party (little, 2 big, 3 grown-ups) | on | 5 | 22.3% ±1.8 | 16.7% | 48.8% ±2.2 | +0.7 |

- **Youngest wins:** the race's winner is the little kid. **Fair share:** what every racer would win if all were equal (1 in the number of racers).
- **A grown-up wins:** any grown-up in the race wins.
- **Median gap:** the little kid's finish time minus the fastest grown-up's. A plus sign means the grown-up crossed first. Runners who had not crossed when the race ended keep running in the same engine until they do, only to time this gap; who won is decided at the real end of the race.

**Correction (22 Oct).** The first version of this page seeded race n and race n+1 with almost the same first dice, which gave the little kid too wide a spread of tap rates and every race nearly the same first ink blots. The script now scrambles each race's seed and its self-check tests for this. Every number moved by 3.5 points or less. The biggest changes: the youngest's family-race wins went from 14.5% to 12.2%, and without the boost a little kid beats a grown-up in 0.6% of races, not 1.1%.

## What the numbers say

- **The boost is what makes the claim possible.** With it, a little kid who taps 4 times a second beats a trying grown-up in about 1 race in 4 (27.8%). Without it, fewer than 1 race in 100 (0.6%). In the family and party races the youngest wins 12.2% and 8.2% with the boost, and almost never without it.
- **The game is not rigged.** A grown-up who is trying still wins most races: 72% one on one, 60% in the family race and 58% in the party.
- **Races stay close.** With the boost the median gap is about 1 s. Without it, about 3 to 4 s.
- **The answer depends most on how fast little kids really tap.** One tap a second slower and the youngest wins 11% one on one. One tap faster and it is a coin flip (49%). That swing is about as big as raising the boost from 1.4 to 1.7 (below). It is the number a playtest must measure.

## Is the boost too weak or too strong?

On the weak side, under our assumptions: in the family and party races the youngest wins about half a fair share (12.2% of 25%, 8.2% of 16.7%), and one on one a little over half (27.8% of 50%).

What-if only: the same races with other little-kid boosts. The script sets these in its own copy of `AGE_BOOST`. The game is unchanged (1.4).

| Little kid boost | Little kid vs grown-up: youngest / a grown-up | Family of four: youngest / a grown-up | Six-lane party: youngest / a grown-up |
|---|---|---|---|
| 1.4 (today) | 27.8% / 72.2% | 12.2% / 60.1% | 8.2% / 57.5% |
| 1.5 | 40.3% / 59.7% | 22.8% / 53.2% | 15.9% / 52.7% |
| 1.6 | 53.3% / 46.8% | 34.8% / 44.5% | 26.6% / 46.6% |
| 1.7 | 63.9% / 36.1% | 46.8% / 36.3% | 38.5% / 38.3% |
| 1.8 | 74.3% / 25.8% | 58% / 27.8% | 51.9% / 29.5% |

**Recommendation.** Keep 1.4 until real tap rates are measured. If a playtest shows little kids tap about 4 times a second, raise the little-kid boost to **1.5**. That gives the youngest about a fair share in the family (23%) and party (16%) races and 40% one on one, while a trying grown-up still wins over half the races in every format. At 1.6 the little kid becomes the favourite one on one. At 1.7 the youngest wins about twice a fair share in the family and party races, which would make the game feel rigged against grown-ups. If little kids tap about 5 a second, 1.4 is already enough and should not go up: a coin flip one on one (48.9%), a little over a fair share in the family race (30.4%) and about one and a third fair shares in the party (22.3%).

The cheapest way to settle it: the TV already receives every tap, so count each player's taps a second in the next real race.

## What this does not model

- Kids stopping to watch the TV, cheer or look at a sibling.
- Tiring over a 40 s race.
- ROAR by shouting into the phone's mic.
- A grown-up saving a big-body ROAR for the moment a blot is close.
- Grown-ups going easy on purpose (here they always try).
- Abilities and stats that follow the drawing: here they are random.
- Network lag between phone and TV.
- Two kids sharing one phone, or "hold to run" (the engine supports it; the phone doesn't send it yet).

## How to quote this

"Simulated, not playtested: with assumed tap rates, a little kid beats a grown-up who is trying in about 1 race in 4 with the +40% boost, and in fewer than 1 in 100 without it."

## How to rerun

From the repo root (needs only Bun; the engine imports nothing but `shared/protocol.ts`):

```sh
bun scripts/fairness-sim.ts        # 2,000 races per row, about 80 s on our Mac
bun scripts/fairness-sim.ts 200    # a quick look
```

The script first runs a self-check with `node:assert`. Two runs with the same seed must give the same result, the win counts must add up to the number of races, neighbouring races must get unrelated dice, and the engine must apply the little-kid boost from `shared/protocol.ts`. The same arguments always print the same tables. To try other assumptions, edit `BANDS` at the top of the script.

## Ability simulation: does what you draw change the race?

**This is also a simulation with assumed inputs, not a playtest. No child played these races. The players are the same modelled players as above, with the same assumptions.**

Do the age boost and the catch-up Doodle Boost drown out the drawing? `scripts/ability-sim.ts` runs the same real engine with the same players, replays each race with identical inputs, and swaps only one creature's ability.

### How it works

- **Identical inputs.** Each player's taps and ROAR presses are recorded as timestamps and replayed unchanged. Jumps are recorded per ink blot (whether the player jumps it, and how early), because a faster creature reaches each blot at a different moment. A press during a stun or the ROAR cooldown is lost, as on the phone. Players don't change how they play to suit their creature.
- **Only the ability changes.** Every row uses the same 2,000 seeds: same track, same rivals, same stats, same inputs.
- **"none"** is a plain creature with no ability, as a baseline. The game can't make one (no ability means walk), so the sim gives the engine a kind it doesn't know, which none of its ability rules match.
- **Doodle Boost off.** The game has no switch for it, so the sim loads a temporary copy of the engine in which the boost never starts. That one constant is the only difference. The fly what-if at the end works the same way. The game is unchanged.

### Where each ability helps

One creature alone on the track, so no rivals and no Doodle Boost. "Flat track" is the same track with the ink blots removed. The `none` row is the average finish time; the other rows are the change from `none`, with the same inputs. Minus means faster. "±" is the 95% margin from the number of races.

| Creature | Little kid: flat track | Little kid: with ink blots | Little kid: stuns a race | Grown-up: flat track | Grown-up: with ink blots | Grown-up: stuns a race |
|---|---|---|---|---|---|---|
| none | 45.4 s | 49.7 s | 5.0 | 42.6 s | 43.3 s | 0.7 |
| fly | -1.19 s ±0.01 | -5.55 s ±0.08 | 0.0 | -1.04 s ±0.01 | -1.67 s ±0.04 | 0.0 |
| roll | -3.64 s ±0.03 | -1.67 s ±0.05 | 5.3 | -3.17 s ±0.02 | -1.25 s ±0.03 | 0.8 |
| hop | same | -0.99 s ±0.04 | 4.4 | same | -0.79 s ±0.02 | 0.6 |
| walk | same | -1.26 s ±0.05 | 3.9 | same | -0.26 s ±0.02 | 0.5 |
| none, 1 tap a second faster | -4.61 s ±0.06 | -4.60 s ±0.07 | 5.0 | -2.70 s ±0.04 | -2.74 s ±0.05 | 0.7 |
| none, no age boost | +15.62 s ±0.09 | +15.82 s ±0.11 | 5.1 | — | — | — |

- **Each ability works where it should.** Hop and walk only act at ink blots, so on a flat track they finish on exactly the same frame as `none`. With ink blots, a little kid saves about 1 s with hop (higher, longer jumps) and 1.3 s with walk (its ROAR knocks blots away).
- **Roll suits flat ground.** It saves 3.6 s on a flat track but only 1.7 s with ink blots: every jump and every stun stops its wheels until it has had 1.5 s of flat ground again. It also gets stuck a little more often (5.3 times a race, not 5.0), probably because its speed drops when it jumps, so it reaches the blot later than the player aimed.
- **Fly suits ink blots.** It saves a little kid 5.6 s, mostly because a little kid gets stuck about 5 times a race and wings never do. On a flat track it saves 1.2 s, from its 3% extra speed. A grown-up rarely gets stuck, so fly saves them 1.7 s.
- **No ability costs time overall.** Each one is a bonus over a plain creature.
- **For scale:** one tap a second faster saves a little kid 4.6 s; the age boost is worth almost 16 s.

### Does it change who wins?

A family of four: a little kid, a big kid and two grown-ups. Only the little kid's creature changes; the other three keep the random creature drawn for that race. The last two rows change the kid's taps or age boost instead, for comparison. "Change vs none" is the paired difference in percentage points.

| Little kid's creature | Doodle Boost on (the game): youngest wins | change vs none (points) | kid's time vs none | Doodle Boost off: youngest wins | change vs none (points) | kid's time vs none |
|---|---|---|---|---|---|---|
| none | 6.6% ±1.1 | baseline | baseline | 5.7% ±1.0 | baseline | baseline |
| fly | 24.6% ±1.9 | +18.1 ±1.7 | -1.51 s ±0.07 | 24.1% ±1.9 | +18.4 ±1.7 | -5.52 s ±0.08 |
| roll | 8.9% ±1.3 | +2.4 ±0.7 | -0.31 s ±0.02 | 8.3% ±1.2 | +2.5 ±0.8 | -1.61 s ±0.05 |
| hop | 9.0% ±1.3 | +2.4 ±0.7 | -0.25 s ±0.02 | 8.3% ±1.2 | +2.6 ±0.7 | -0.97 s ±0.04 |
| walk | 8.6% ±1.2 | +1.9 ±0.7 | -0.27 s ±0.02 | 8.2% ±1.2 | +2.5 ±0.7 | -1.25 s ±0.05 |
| none, 1 tap a second faster | 19.4% ±1.7 | +12.8 ±1.5 | -1.16 s ±0.05 | 16.9% ±1.6 | +11.2 ±1.4 | -4.61 s ±0.08 |
| none, no age boost | 0.0% ±0.0 | -6.6 ±1.1 | +5.12 s ±0.15 | 0.0% ±0.0 | -5.7 ±1.0 | +15.85 s ±0.11 |

- **The drawing changes who wins.** Wings almost quadruple the youngest's wins (6.6% to 24.6%), more than tapping one a second faster (+12.8 points). Wheels, long legs and a big body each add about 2 points (to about 9%), about what a fifth of a tap a second adds.
- **The age boost matters most.** Without it, the youngest with a plain creature didn't win once in 2,000 races. The boost lets a little kid compete; the creature then changes their chances.
- **The Doodle Boost does not wipe the ability out.** It shrinks the time an ability saves the kid to about a quarter (wings: 5.5 s to 1.5 s), but the change in wins is about the same with it on or off (wings +18.1 and +18.4 points; the others within 0.6 points). This fits the engine's rule: the Doodle Boost only works more than 150 dp behind the leader, so it pulls a runner who falls behind back towards the pack and then stops. Who crosses first is still decided by the racers.
- With a random creature, as in the fairness table, the youngest would win the average of the four ability rows, 12.8%. The fairness table gives 12.2% ±1.4.

### Is any ability too strong or useless?

The same family of four, but each racer gets a different ability, dealt at random every race. A fair share is 25%.

| Ability | Doodle Boost on (the game) | Doodle Boost off |
|---|---|---|
| fly | 37.0% ±2.1 | 36.6% ±2.1 |
| roll | 23.6% ±1.9 | 23.4% ±1.9 |
| hop | 21.3% ±1.8 | 21.9% ±1.8 |
| walk | 18.2% ±1.7 | 18.1% ±1.7 |

- **Fly is too strong.** It wins 37% of these races against a fair 25%, about twice as often as walk. It never gets stuck and is also 3% faster everywhere.
- **No ability is useless.** Walk is the weakest (18%), but it saves time at ink blots for every age and adds about 2 points to the youngest's wins, like hop and roll. Our players press ROAR at random moments; a walker who saves ROAR for a nearby blot, as the TV's bots do, would knock away more blots.
- Roll and hop are within 4 points of a fair share.

What-if only: fly at other speeds, in a temporary copy of the engine. Doodle Boost on. The game is unchanged (fly 1.03).

| Fly speed | fly wins (one of each) | roll wins (one of each) | hop wins (one of each) | walk wins (one of each) | Little kid with fly: youngest wins | change vs none (points) |
|---|---|---|---|---|---|---|
| 1.03 (today) | 37.0% ±2.1 | 23.6% ±1.9 | 21.3% ±1.8 | 18.2% ±1.7 | 24.6% ±1.9 | +18.1 ±1.7 |
| 1 | 29.9% ±2.0 | 26.3% ±1.9 | 23.2% ±1.8 | 20.6% ±1.8 | 20.5% ±1.8 | +13.3 ±1.5 |
| 0.97 | 24.1% ±1.9 | 28.5% ±2.0 | 25.1% ±1.9 | 22.4% ±1.8 | 15.8% ±1.6 | +7.8 ±1.2 |
| 0.95 | 19.0% ±1.7 | 30.5% ±2.0 | 26.6% ±1.9 | 23.9% ±1.9 | 13.2% ±1.5 | +4.7 ±1.0 |

**Recommendation.** One change: lower fly's speed (`FLY_SPEED` in `tv/src/game/race.ts`) from 1.03 to **1.0**. Wings would still float over every ink blot, but would no longer also be faster on the ground. In this model fly then wins 30% of the one-of-each races, every ability wins between 21% and 30%, and wings still give a little kid the biggest lift of any ability (+13 points). 0.97 is the most even (22% to 28.5%), but it makes wings slower than a plain creature on flat ground, and fly's value rests on how often little kids miss jumps, which is our guess (30%). Change nothing else. We have not changed the game; if `FLY_SPEED` changes, rerun the bot balance test in `tv/test/race.spec.ts`.

### What this does not model

- Players who play to their creature, such as a walker saving ROAR for a blot or a roller skipping a jump. The inputs are identical for every ability on purpose.
- Everything in the fairness list above: watching the TV, tiring, ROAR by shouting, network lag and so on.
- Stats that follow the drawing: they are random, and the same for every ability in a row.
- A child choosing or correcting the ability. Here it is dealt; in the game it comes from the drawing.

### How to quote this

"Simulated, not playtested: with identical inputs in the real race engine, the drawn ability lifts a little kid's wins in a family race from 7% with no ability to between 9% and 25%, and the catch-up boost does not cancel it."

### How to rerun

```sh
bun scripts/ability-sim.ts        # 2,000 races per row, about 2.5 min on our Mac
bun scripts/ability-sim.ts 200    # a quick look
```

It uses the players from `scripts/fairness-sim.ts`, so editing `BANDS` there changes both simulations. It first runs a self-check with `node:assert`: the same seed gives the same result; on a flat track hop and walk finish on exactly the same frame as a plain creature and roll is faster; fly is never stunned and a plain creature is; the engine keeps the plain creature plain; one-of-each races deal every kind once; the Doodle Boost is on in the game's engine and off in the copy; and both apply the age boost from `shared/protocol.ts`.
