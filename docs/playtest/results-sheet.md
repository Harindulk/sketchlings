# Sketchlings playtest results: the children's session

Print version for pen on the day: [`results-sheet.html`](results-sheet.html) (A4 landscape, 3 pages). Type it into this file the same evening, then copy the headline numbers into `docs/IMPACT.md` and the Devpost page, worded the way "How to report it honestly" says. The teachers' cold test has its own sheet: [`cold-test.md`](cold-test.md). The plan: [`runsheet.md`](runsheet.md).

Rules:
- **On paper**, first names are fine. **In this typed copy**, children are Child A to D with their age, and teachers are Tester 1 and 2. No names anywhere in the repo.
- Write a clock time (HH:MM) next to every race, scan and quote, so the footage can be found later.
- Exact words for quotes, never tidied up. "I don't know" is an answer.
- Never round up. Anything not seen stays `___`.

## Session

| | |
|---|---|
| Date | |
| Start and end time | |
| Where (a kind of place, no address: "a classroom", "a living room") | |
| Lead / Notes / Tech | |
| Tunnel or Wi-Fi | |
| Personas: Claude (model), or offline (why: a No on a form, no internet) | |
| TV build (commit) | |
| How they saw the TV (a TV over HDMI, or the Mac's screen) | |
| Game phones (models) | |

## Children

Age groups on the phone: Little kid (up to 7, +40% speed), Big kid (8 to 12, +20%), Grown-up (13 and up, no boost). The form columns come from each child's form (Y/N): first name and age shown, AI, voice, face.

| Child | Age | Age group picked on the phone | Right group? | Colour on TV | Form: name / AI / voice / face |
|---|---|---|---|---|---|
| A | | | | | |
| B | | | | | |
| C | | | | | |
| D | | | | | |

Youngest: Child ___, age ___.

## Races

Powers (from the Reveal sticker): WINGS! flies over ink blots, WHEELS! zooms on flat ground, SPRINGS! jumps extra high and far, BIG ROAR! knocks back ink blots. Controls: tap, hold, swipe up (jump), ROAR button, real shouting.

| Race | Round | Time | Racers (child, age) | Powers in this race | Winner | 2nd | Youngest won? | Youngest needed help? (what, from whom) | Controls seen | Problems | Clip |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 1 | | | | | | | | | | |
| 2 | 1 | | | | | | | | | | |
| 3 | 1 | | | | | | | | | | |
| 4 | 2 | | | | | | | | | | |
| 5 | 2 | | | | | | | | | | |
| 6 | 2 | | | | | | | | | | |
| 7 | | | | | | | | | | | |
| 8 | | | | | | | | | | | |

## Each child, each round

- **Joined alone?** Round 1: scanned the QR, typed a name, picked an age group with no help (Y / help: what / N). Round 2: found "Draw a new one" alone.
- **Snapped alone?** From "Snap my drawing" to "Bring it to life!" with no help. **Re-snaps:** extra photos needed (0 if the first one worked).
- **Feature really in the drawing?** Our call: is the feature on the sticker ("I saw big wings") really on the paper? **Eyes right?** Y if the googly eyes sit on the drawn eyes (or a sensible face spot when none were drawn).
- **Explained the way the race works?** Our call against the sticker: Y / partly / N / didn't know.

| Child | Round | Joined alone? (time) | Snapped alone? | Re-snaps | Creature name | Power sticker ("I saw ... → ...") | Feature really in the drawing? | Eyes right? | Claude or offline | "Tell me about your creature." (exact words) | "Did its power help it in the race, or not? Why?" (exact words) | Explained the way the race works? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| A | 1 | | | | | | | | | | | |
| A | 2 | | | | | | | | | | | |
| B | 1 | | | | | | | | | | | |
| B | 2 | | | | | | | | | | | |
| C | 1 | | | | | | | | | | | |
| C | 2 | | | | | | | | | | | |
| D | 1 | | | | | | | | | | | |
| D | 2 | | | | | | | | | | | |

"What would you change in the game?" (round 2, exact words):

| Child | Answer |
|---|---|
| A | |
| B | |
| C | |
| D | |

## Quotes (exact words)

Anything said without being asked. The teachers' answers at the end go here too ("What surprised you?", "What would stop you using this with a class or at home?").

| Time | Who (Child A-D and age, or Tester 1-2) | What they said |
|---|---|---|
| | | |
| | | |
| | | |
| | | |
| | | |
| | | |

## "Again!"

Unprompted "again!", "one more!" or "can we play again?", with no adult asking. Tally with clock times: ______________________

Total: ___

## Observations

- Where they got stuck or confused:
- How the youngest held the phone, and what they did with it:
- Who used hold, swipe up, the ROAR button, real shouting:
- Did anyone mention their creature's power without being asked?
- Did they keep the creature's name, or give it their own?
- Anything that broke (what, when, how long):
- Anything else:

## One change the kids caused

One thing, from what was seen today: what tripped them up most or what they asked for.

| What we saw (which child, when) | What we changed (commit) | Did it help? (only if tested after) |
|---|---|---|
| | | |

## Server log lines (copy after the session)

In tab 2 (`runsheet.md` section 8), close the children's part of the log and print it:

```sh
echo "=== $M end $(date +%T)" >> "$L"
sed -n "/=== Kids start/,/=== Kids end/p" "$L" | grep -E '^\[[a-z]+\]'
```

Copy every line unedited, except one thing: `[net]` and `[race]` lines carry the first names typed on the phones, so in this typed copy replace each name with its Child letter (or Tester number). `[scan]` lines carry a player id instead: match them to children by order and by the clock times on the sheet. What each line is:

| Line | What it is |
|---|---|
| `[scan] <player> upload->sketchling <ms> ms source=claude` | One per drawing: from the upload reaching the server to the creature being ready, and who wrote the persona (`claude` or `offline`). It leaves out the phone's cut-out, the upload itself, the voice and the TV |
| `[scan] <player> upload->voices <ms> ms lines=<n>` | When that creature's voice clips were ready |
| `[persona] <model> answered in <ms> ms` | Claude's part of that time |
| `[persona] <model> failed after <ms> ms, using offline persona: <why>` | Claude failed and the offline generator made this creature |
| `[persona] tokens in=… out=… ≈ $…` | Claude's cost for that creature |
| `[consent] room <code>: AI personas off, …` | Only if the AI was switched off from the TV |
| `[race] inputs …` | One per race: each player's taps a second, with their age group. If this build prints no such line, write "not logged" |
| `[net] race rtt ms (median/p90): <name> <median>/<p90> n=<pings>, …` | One per race: each phone's round trip during that race. Over the tunnel that is phone, Cloudflare, Mac |
| `[scan] failed`, `[voice] … failed`, `[hall] …` | Breakages: add them to Observations too |

```text
=== Kids

```

Taps a second, from the `[race]` lines:

| Race | Child (age, group) | Taps a second |
|---|---|---|
| | | |
| | | |
| | | |
| | | |

## Headline numbers (fill after the session)

| # | Measure | Result |
|---|---|---|
| 1 | Children who played, and their ages | ___ children, aged ___ |
| 2 | Joined alone (QR, name, age group, no help) | ___ of ___ |
| 3 | Snapped their drawing alone, round 1 / round 2 | ___ of ___ / ___ of ___ |
| 4 | Round 2 in the same party, nothing restarted | yes / no (what was restarted) |
| 5 | Races played | ___ |
| 6 | **Youngest won** (fair share with no boost: 1 in ___ racers) | **___ of ___ races** |
| 7 | Youngest needed adult help during a race | ___ of ___ races |
| 8 | Power feature really in the drawing (our call) | ___ of ___ drawings |
| 9 | Googly eyes right | ___ of ___ |
| 10 | Explained the power the way the race works (our call) | ___ of ___ answers |
| 11 | Unprompted "again!" | ___ |
| 12 | Median upload-to-creature on the server (`[scan]`) | ___ ms over ___ scans; Claude ___, offline ___ |
| 13 | Taps a second by age group (`[race]`) | little ___, big ___, grown-up ___ (or "not logged") |
| 14 | Phone round trip during races (`[net]`) | median ___ ms, slowest p90 ___ ms, over ___ races (tunnel or Wi-Fi) |
| 15 | One child quote (exact, with age) | |
| 16 | One teacher quote (exact) | |
| 17 | **One design change the kids caused** | |
| 18 | Creature voices heard in the room? | |
| 19 | Creatures made | ___ |

## How to report it honestly

- **Say who:** "___ children aged ___, ___ and ___, in one session run by two teachers who know the developer." With 4 or fewer children write "2 of 3", never "67%". It is one session, not a study.
- **The youngest:** "won ___ of ___ races", with the fair share (1 in the number of racers). Never "the youngest wins". Say how many races the youngest needed help in.
- **Our calls** ("feature really in the drawing", "explained the way the race works", "eyes right") are our judgement against the sticker and the paper: say so, and give the number of drawings or answers. Keep what a child said apart from what we judged. "I don't know" is a no.
- **Quotes** are exact, credited "a 6-year-old" or "a teacher". Never a name.
- **Real drawings:** the persona benchmark used synthetic and demo art (`notes/bench-persona.md`); these are children's own drawings. Report every one, the ones that went wrong included.
- **Server numbers** are copied, never retyped or rounded. `[scan]` ms is only the server's part (upload to creature): never call it "snap to creature". Claude and offline scans both stay in; say how many fell back.
- **Taps a second** come from ___ races and ___ children: one session is not enough to set the age boost. If a boost changes because of it, say "after one session with ___ children".
- **Round trips** from `[net]`: tunnel races measure phone, Cloudflare, Mac; only Wi-Fi races are the Wi-Fi round trip. Report them apart, and keep "6-9 ms inside the TV" as its own VVD figure.
- **Say what it ran on:** the Vega Virtual Device on a Mac, shown on a TV over HDMI (if so), with the Mac keyboard as the remote, not a Fire TV. Don't report race smoothness or speed from it.
- **Keep it apart** from the teachers' cold test and from footage recorded the night before: never pool them.
- **What we changed:** one line with its commit. The children did not test the change unless they did.

For `docs/IMPACT.md`, fill the blanks and keep the rest as is:

> Playtest: ___ children aged ___ to ___ played in one session run by two teachers, on the Vega Virtual Device shown on a TV, with phones as controllers. ___ of ___ joined on their own and ___ of ___ snapped their drawing on their own. In ___ races the youngest (age ___) won ___ (fair share 1 in ___) and needed adult help in ___. Asked whether their creature's power helped, they explained ___ of ___ the way the race works (our judgement; their exact words are in `docs/playtest/results-sheet.md`). They asked to play again ___ times without being asked. Because of them we changed ___ (commit ___).
