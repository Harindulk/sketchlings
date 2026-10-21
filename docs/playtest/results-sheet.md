# Sketchlings playtest results

Print version for pen on the day: [`results-sheet.html`](results-sheet.html) (A4 landscape, 3 pages). Type the results into this file the same evening, then copy the headline numbers into the "Evidence: family playtest" table in `docs/drafts/IMPACT.md` and the playtest TODOs in `docs/drafts/DEVPOST.md`.

Rules: first names only. Write the exact words for quotes, never tidied up. Write the clock time (HH:MM) next to every race, scan and quote so the footage can be found later. Never round numbers up.

## Session

| | |
|---|---|
| Date | |
| Start and end time | |
| "Start party" pressed at (HH:MM:SS) | |
| First race started at (HH:MM:SS, the 3-2-1) | |
| Persona source (Claude model, or offline) | |
| TV build (sound on, or `MUTE=1`) | |
| How the family saw the TV | |
| Who filled this sheet | |

## Players

Age groups on the phone: Little kid (7 or under, +40% boost), Big kid (8 to 12, +20%), Grown-up (no boost). Check each child picked the right one.

| # | First name | Age | Age group | Boost | Colour on TV | Filming consent (hands + voice / voice muted / none) |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |

Youngest player: ______

## Races

Abilities: fly (wings), roll (wheels or round body), hop (long legs), walk (big body, ROAR).

| Race | Time | Racers | Abilities in this race | Winner | 2nd | Youngest won? | Youngest needed help? | Problems or notes | VVD clip |
|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | |
| 2 | | | | | | | | | |
| 3 | | | | | | | | | |
| 4 | | | | | | | | | |
| 5 | | | | | | | | | |
| 6 | | | | | | | | | |
| 7 | | | | | | | | | |
| 8 | | | | | | | | | |

## Scans

Stopwatch on a spare phone: start when the photo is taken, Lap when the child taps "Bring it to life!", stop when the creature shows as ready on the TV (its picture appears in the Lobby chip). "Snap to TV" is what the family feels. The server log gives the machine time per scan (the `[scan] ... upload->sketchling <ms>` line) and whether Claude or the offline generator answered.

- **Re-snaps:** how many extra photos this drawing needed (0 if the first one worked).
- **Eyes right?** Y if the googly eyes sit on the drawn eyes (or on a sensible face spot when none were drawn), N if they float off the body or there are too many.
- **Ability matches?** Y if the ability's feature is really in the drawing (wings drawn and it got "fly", for example).

| # | Time | Child | Snap to TV (s) | Bring to life to TV (s) | Server ms (`[scan]` log) | Claude or offline | Re-snaps | Eyes right? | Creature name | Ability (feature) | Ability matches? | Voice heard? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | |
| 6 | | | | | | | | | | | | | |
| 7 | | | | | | | | | | | | | |
| 8 | | | | | | | | | | | | | |

## Quotes (exact words)

| Time | Who (first name, age) | What they said |
|---|---|---|
| | | |
| | | |
| | | |
| | | |
| | | |
| | | |

## Observations

- Where they got stuck or confused:
- What they loved:
- Unprompted "again!" requests (tally):
- Did the youngest play without adult help? How did they hold the phone?
- Controls they used (tap, swipe-up jump, ROAR button, real shouting):
- Did the kids keep the AI's name for their creature, or use their own?
- Did anyone notice their creature's power (WINGS!, WHEELS!, SPRINGS!, BIG ROAR!)?
- What the parent said (would they have it on their TV, any worry):
- Anything else:

## One change the kids caused

| What we saw | What we changed (commit) | Did it help? |
|---|---|---|
| | | |

## Headline numbers (fill after the session)

| # | Measure | Result |
|---|---|---|
| 1 | Time from "Start party" to the first race start | ___ min ___ s |
| 2 | Median snap-to-creature time, server log (`[scan]` lines) | ___ s over ___ scans |
| 3 | Average snap to TV, stopwatch (what the family felt) | ___ s (fastest ___, slowest ___) |
| 4 | Re-snaps needed | ___ over ___ drawings |
| 5 | Googly eyes placed correctly | ___ of ___ |
| 6 | Ability matched the drawn feature | ___ of ___ |
| 7 | Races played | |
| 8 | **Youngest won, with the boost** | **___ of ___** (fair share without a boost: 1 in ___) |
| 9 | Youngest played without adult help? | |
| 10 | Unprompted "again!" requests | |
| 11 | One kid quote (exact) | |
| 12 | One parent quote (exact) | |
| 13 | **One design change the kids caused** | |
| 14 | Persona source, cost per creature (log) | |
| 15 | Creature voices heard in the room? | |
| 16 | Creatures made | |
