# Cold test: adults who have never seen the game

3 to 5 adults who have never seen Sketchlings each get one instruction and nothing else. It shows whether someone new can set up a race on their own, and where they get stuck. Then they race a second time without us restarting anything, and after each race they say in their own words what their creature's power did. We time every scan from the phone's shutter to the creature speaking on the TV, and check that a locked phone stays in the party. No children take part in this test: the children's session has its own plan and sheet ([`runsheet.md`](runsheet.md), [`results-sheet.md`](results-sheet.md)). Each tester signs the adult OK first ([`consent.html`](consent.html), page 2).

## Who

- Adults who have never seen the game, its video or its screenshots, and did not help make it. Relatives and friends are fine; say so in the report.
- One tester at a time, about 30 minutes each. The others wait out of sight, and nobody tells the next one what happened.

## Friday 23 October: the teachers (10 minutes)

On Friday the testers are the teachers who then run the children's session ([`runsheet.md`](runsheet.md) section 4). There are only 10 minutes, so it is a short version:

- **Both teachers together**, one phone each. Write them as Tester 1 and Tester 2, "together", and report them as one pair, not two cold tests.
- Before: each signs page 2 of the consent form. They may have read the parents' form, which says what the game is but not how to play: that's fine, write it down. Nothing else beforehand: no card, no run-sheet, no demo.
- **Same setup and same words.** With the picture on a real TV, the first line is "The arrow keys, Enter and Backspace on this laptop are the remote." Then **"Get two creatures into a race."**
- **8 minutes** to the first race instead of 15. The 2-minute hint rule stays.
- After the first race: the two questions about each creature, word for word (one creature per teacher).
- **"Race them again"** only if the stopwatch shows under 8:00; give it 2 minutes. Otherwise write "not asked (time)".
- Then the last question, "What was the most confusing moment?", to each.
- **Skipped on Friday**, write "skipped (Friday)": the Grown-ups screen, the reconnect check and the timing pass.
- Mark the log with `M="Teachers"` and copy their lines in the evening (runsheet section 8). Fill rows 1 and 2 of the Results tables.

## Setup (before every tester)

- **The laptop is the TV.** VVD running (runsheet 3.2), `bun scripts/live-view.ts`, Chrome on http://localhost:8799/, click once for full screen. The page's keyboard is the Fire TV remote: arrows, Enter = OK, Backspace = Back, Space = Play/Pause, M = Menu. The app is on **Home**, focus on Start party. Mac volume up: the creatures' voices are timed.
- **Server.** `scripts/tunnel.sh` (runsheet 3.3) is the default: the QR gives an HTTPS link that works on any network, mobile data included, and "Enable shouting" works. Without it (`cd server && bun run start`), both phones must be on the Mac's Wi-Fi before the clock starts, and there is no shouting. Write which one in the table. Over the tunnel, a phone's round trip goes phone, Cloudflare, Mac. For the Wi-Fi round trip, run at least one tester on Wi-Fi only.
- **Phones.** Two phones on the table, unlocked, on the home screen, no game tab open (ideally one iPhone and one Android). If a tester would rather use their own phone, let them and write it down.
- **On the table.** Our two drawings (one with big wings, one with wheels or long legs), blank white paper and a thick marker. Nothing else: no how-to-play card, no notes.
- **Observer.** The clock phone as a stopwatch with laps, the tables below printed, a pen. Keep a lap log on paper: each lap's number and two words as you press it ("7 chip B"). The tables are filled from it afterwards. The laptop is the TV, so notes go on paper.
- **Mark the server log.** The server's lines carry no clock time, so mark where each tester starts. In tab 3, with the tester's number:
  ```sh
  M="Tester 1"; L=notes/playtest-$(date +%Y%m%d).log; echo "=== $M start $(date +%T)" >> "$L"
  ```
- **Room camera** only if the tester ticked filming (hands, phones and screen, no face).
- **Between testers.** Copy the tester's log lines first ("After each tester" below). App back to Home (Backspace until Home), close the game's tab on both phones, put our two drawings back, fresh paper. Restart tab 2 (Ctrl-C, then the runsheet 3.3 line): the phones remember the last name typed for each link, and a new link starts them clean. On Wi-Fi only, clear the phones' website data for the Mac's address instead.

## What you say

First the same line for everyone, because the laptop stands in for a Fire TV and its remote:

> "This laptop is the TV. The arrow keys, Enter and Backspace are the remote."

Then the instruction. Start the stopwatch on its last word:

> **"Get two creatures into a race."**

Nothing else. No pointing, no nodding, no "nearly".

- **They ask a question:** say "Do whatever you'd do at home." Write the question down. It counts as asking for help, not as help.
- **Stuck for 2 minutes, or the same question twice:** give the smallest hint that unblocks them and write it down word for word. From then on this tester is "with help".
- **Something breaks** (freeze, crash, tunnel down): pause the stopwatch, fix it (runsheet section 7), write what broke and for how long, then resume. Breakages are reported, never hidden.
- **15 minutes and no race:** stop. Write "not done in 15 min".

**Done** = a 3-2-1 countdown starts with two creatures the tester made in this test (from paper, or "Draw on screen instead"). Two phones, or one phone with "Switch player", both count; write which. Demo party bots and Hall of Fame creatures don't count: if they stop there, it is the 2-minute rule.

While they scan, Lap at each shutter tap on the phone's camera, when that creature's picture appears in its Lobby chip, at "Start the show", and at each creature's first word on its Reveal card (its own voice, not the narrator). During the Reveal, write each creature's sticker (for example "Wide wings → Flies over ink blots!").

### After each race: two questions

When the Results screen shows, Lap and say "Before you go on, two questions." Ask about each creature they made, one at a time, in these words:

> 1. **"Did its power help it in that race, or not? Why?"**
> 2. **"Does that power match what you drew?"**

Write the answers word for word. Don't explain the power, don't say whether they are right, and ask nothing more. "I don't know" is an answer: write it.

### The second race

After the first two questions, say:

> **"Race them again."**

Lap on its last word. The same rules as the first race: questions, the 2-minute hint, breakages.

**Done** = a second 3-2-1 with their creatures, with nothing restarted by us: no server, tunnel, app or VVD restart, and we reload nothing on the phones. Play again, Back to the Lobby, or Home, Hall of Fame and "Race again" all count; write which. If the tester reloads a phone page or scans the QR again themselves, that counts too; write it down. If we had to fix something (runsheet section 7), write what: that tester did not get there "without restarting anything". 5 minutes and no second race: stop, write "not done in 5 min".

If they press Play again before you ask the questions, let the race run. Write "on their own", time it from the first Results screen, and after the second race ask the questions about both races.

After the second race, ask the same two questions again.

### Grown-ups screen (only if this build has one)

Say:

> **"Find the settings a parent would use."**

Lap on its last word. **Done** = the Grown-ups screen is open, past its gate. Count each wrong try at the gate and write what they asked. Same hint rule; 3 minutes and not there: stop, write "not found in 3 min". If the build has no Grown-ups screen, skip this and write "not in this build".

### Last question

**"What was the most confusing moment?"** Write the answer word for word. That is the quote, unless they said something better during the test. Stop the stopwatch.

### Reconnect check (you lead it)

1. TV on the Lobby with both phones' chips. From Results, Backspace goes to the same party's Lobby. If they left the party (Home), Start party and let both phones join again first.
2. Ask the tester to lock phone 1 with its side button (their own phone: they unlock it too). Reset the stopwatch and start it as the screen goes dark.
3. At 0:20, unlock it. Don't touch the page. Lap when its chip on the TV is back to full colour (a phone the server has lost shows a pale chip).
4. **Still in** = the same chip, name, colour and creature; the phone didn't ask for a name or a photo again; no second chip. Write Y or N and what you saw.

## What to record per tester

Times are from the instruction, on the stopwatch, in m:ss, unless the row says otherwise.

| Measure | How |
|---|---|
| Time to join | Lap when each phone's name chip appears in the TV Lobby (1st phone / 2nd phone) |
| Failed QR scans | Each time a phone pointed at the QR doesn't open the join page (camera ignores it, wrong app, link error) |
| Failed photos | Each photo that doesn't become a creature the first time (retake, "can't see a drawing", a cut-out they reject) |
| Asked for help | How many times, and a few words on what about each time |
| Controller mistakes | In the first race, each time they do something on the phone the game doesn't take the way they meant (swipe to steer, tilt, tap the TV picture, ROAR when they meant jump, phone pointed at the screen like a remote). Write the most common one |
| Time to the first race | Lap when the first 3-2-1 starts. This is the setup time |
| Shutter to speaking | Per creature, from its laps: the shutter tap, its picture in the Lobby chip, its first word on its Reveal card. For a re-snap, the shutter is the photo that became the creature. A drawing made on screen has no shutter: write "on screen". If the card ends before it speaks, write "silent"; if they skip the card first, "skipped" |
| Power answers | After each race, both questions for each creature, word for word, next to the sticker its Reveal card showed |
| Time to the second race | From the "Race them again" lap (or the first Results screen, if they started on their own) to the second 3-2-1. Write the path, and anything restarted or reloaded and by whom |
| Grown-ups screen | Only if the build has one: time to find it, wrong tries at the gate, passed or not |
| Reconnect | Seconds from unlock to the chip at full colour, and still in Y/N |
| One quote | Exact words, never tidied up |
| Without help? | Y if no hint was given, N if one was |
| Server log lines | After the tester, see below |

Testers are "Tester 1" to "Tester 5" here. Their names stay on the paper OKs.

## After each tester: server log lines

In tab 3 (`M` and `L` are still set from the Setup line), close the tester's part of the log and print it:

```sh
echo "=== $M end $(date +%T)" >> "$L"
sed -n "/=== $M start/,/=== $M end/p" "$L" | grep -E '^\[[a-z]+\]'
```

Copy every line, unedited, into "Server log lines" below, except one thing: `[net]` and `[race]` lines carry the first names typed on the phones, so replace each with "Tester N". What each one is:

| Line | What it is |
|---|---|
| `[scan] <player> upload->sketchling <ms> ms source=claude` | One per scan: from the upload reaching the server to the creature being ready, and who wrote the persona (`claude` or `offline`). It leaves out the phone's cut-out, the upload itself, the voice and the TV |
| `[persona] <model> answered in <ms> ms` | Claude's part of that time |
| `[persona] <model> failed after <ms> ms, using offline persona: <why>` | Claude failed and the offline generator made this creature |
| `[persona] unsafe word in <field> -> offline` | One field of Claude's text had a blocked word, so that field used the offline text |
| `[persona] tokens in=… out=… ≈ $…` | Claude's cost for that creature, from the token counts at the prices in `server/src/persona.ts` |
| `[voice] <voice> …: <s> s clip in <ms> ms` | One per voice clip made on the Mac (Kokoro), and how long it took |
| `[race] inputs …` | One per race: each player's taps a second, with their age group. If this build prints no such line, write "not logged" |
| `[net] race rtt …` | One per race: the round trips the server measured to each phone during that race. Over the tunnel that is phone, Cloudflare, Mac, not home Wi-Fi. If this build prints no such line, write "not logged" |
| `[scan] failed`, `[voice] … failed`, `[hall] …` | Breakages: put them in the breakages column too |

## Timing pass (you alone, after the last tester, about 10 minutes)

In the test, a creature speaks only on its Reveal card, after the tester presses Start the show, so "shutter to speaking" there includes however long the tester stayed in the Lobby. This pass takes that wait out: one creature per show, started the moment it is ready.

Mark the log first (`M="Timing pass"`, then the Setup line). Five scans, one phone, our two drawings in turn. For each:

1. TV: Home, Enter (Start party). Phone: scan the QR, type "Timer", pick Grown-up.
2. Snap my drawing. Start a fresh stopwatch on the camera's shutter tap. Confirm the photo ("Use Photo" or the tick) at once.
3. Tap "Bring it to life!" as soon as the cut-out shows. Lap.
4. Lap when the picture appears in the Lobby chip, and press Enter (Start the show!) at once.
5. Stop on the creature's first word (its own voice, not the narrator). If its card ends with no voice, write "silent".
6. Backspace twice (Lobby, then Home). Next scan.

Then close the log part and copy the lines as after a tester.

## Results

### Per tester

| Tester | Date, time | Build (commit) | Phones (model; own or ours) | Tunnel or Wi-Fi | Drawings (ours or own) | Two phones or Switch player | Time to join (1st / 2nd phone) | Failed QR scans | Failed photos | Asked for help (times) | Controller mistakes | Time to the first race | Without help? |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | | | | | | |
| 2 | | | | | | | | | | | | | |
| 3 | | | | | | | | | | | | | |
| 4 | | | | | | | | | | | | | |
| 5 | | | | | | | | | | | | | |

### What they asked, hints, breakages and quotes

| Tester | What they asked (time, words) | Hint given (exact words, or none) | Most common controller mistake | Breakages (what, how long) | Quote (exact words) |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

### Second race

| Tester | On their own, before we asked? | Time to the second race | Path (Play again / Lobby / Hall of Fame) | Restarted or reloaded anything (who, what) | Hint given (exact words, or none) | Done in 5 min? |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

### Power answers (exact words)

What each power does in the race, from its Reveal sticker: fly (WINGS!) flies over ink blots, roll (WHEELS!) zooms fast on flat ground, hop (SPRINGS!) jumps extra high and far, walk (BIG ROAR!) ROAR knocks back ink blots. With two creatures, write A and B in each cell. The last two columns are our call, not the tester's.

| Tester | Race | Power the game gave (sticker) | "Did its power help it in that race, or not? Why?" | "Does that power match what you drew?" | Feature really in the drawing? (Y/N) | Explained the way the race works? (Y / partly / N / didn't know) |
|---|---|---|---|---|---|---|
| 1 | 1 | | | | | |
| 1 | 2 | | | | | |
| 2 | 1 | | | | | |
| 2 | 2 | | | | | |
| 3 | 1 | | | | | |
| 3 | 2 | | | | | |
| 4 | 1 | | | | | |
| 4 | 2 | | | | | |
| 5 | 1 | | | | | |
| 5 | 2 | | | | | |

### Shutter to speaking, in the test

A is the first creature made, B the second. Lap columns in m:ss.s from the lap log; the last columns in seconds. "Start the show" is the same for both creatures of a tester.

| Tester | Creature | Shutter (lap) | Picture in Lobby chip (lap) | Start the show (lap) | First word on TV (lap) | Shutter to chip (s) | Shutter to speaking (s) | Spoke? (Y / silent / skipped) | `[scan]` ms | Claude or offline |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | A | | | | | | | | | |
| 1 | B | | | | | | | | | |
| 2 | A | | | | | | | | | |
| 2 | B | | | | | | | | | |
| 3 | A | | | | | | | | | |
| 3 | B | | | | | | | | | |
| 4 | A | | | | | | | | | |
| 4 | B | | | | | | | | | |
| 5 | A | | | | | | | | | |
| 5 | B | | | | | | | | | |

### Timing pass

| Scan | Drawing (wings / wheels or legs) | Tunnel or Wi-Fi | Shutter to "Bring it to life!" (s) | Shutter to chip (s) | Shutter to speaking (s) | Spoke? (Y / silent) | `[scan]` ms | Claude or offline |
|---|---|---|---|---|---|---|---|---|
| 1 | | | | | | | | |
| 2 | | | | | | | | |
| 3 | | | | | | | | |
| 4 | | | | | | | | |
| 5 | | | | | | | | |

### Reconnect check

| Tester | Phone (model) | Tunnel or Wi-Fi | Chip went pale while locked? | Unlock to full colour (s) | Still in? (Y/N) | What you saw |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |

### Grown-ups screen (only if the build has one)

| Tester | In this build? | Time to find it | Wrong tries at the gate | Passed? | What they asked |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| 4 | | | | | |
| 5 | | | | | |

### Server log lines

Pasted unedited, one block per tester.

```text
=== Tester 1

=== Tester 2

=== Tester 3

=== Tester 4

=== Tester 5

=== Timing pass

```

### Summary (fill after the last tester)

| Measure | Result |
|---|---|
| Testers (who they were) | ___ adults, ___ |
| Got two creatures into a race without help | ___ of ___ |
| Got there with help | ___ of ___ |
| Not done in 15 min | ___ of ___ |
| Median time to the first race (setup time) | ___ (fastest ___, slowest ___), over the ___ who got there |
| Median time to join (1st phone) | ___ |
| Failed QR scans, all testers | ___ |
| Failed photos, all testers | ___ |
| Second race without us restarting anything | ___ of ___ (median time to it ___; Play again ___, Lobby ___, Hall of Fame ___) |
| Started the second race on their own, before we asked | ___ of ___ |
| Powers explained the way the race works (our call), race 1 / race 2 | ___ of ___ / ___ of ___ creatures |
| Tester said the power matched what they drew | ___ of ___ creatures (___ of them on our two table drawings) |
| Feature really in the drawing (our call) | ___ of ___ creatures |
| Shutter to speaking, timing pass | median ___ s over ___ scans (fastest ___, slowest ___); silent cards ___ |
| Shutter to speaking, in the test (includes the tester's time in the Lobby) | median ___ s over ___ scans |
| Upload to creature on the server (`[scan]` lines) | median ___ ms over ___ scans; Claude ___, offline ___ |
| Phone round trip during races (`[net] race rtt`) | median ___ ms, slowest ___ ms, over ___ races and ___ phones (tunnel ___ races, Wi-Fi ___ races) |
| Still in after 20 s locked in the Lobby | ___ of ___ phones (median ___ s from unlock to full colour) |
| Grown-ups screen found and passed | ___ of ___ (or "not in this build") |
| Most common question | |
| Most common controller mistake | |
| Breakages | |

### What we changed because of it

| What we saw (which testers) | What we changed (commit) | Testers after the change | Did it help? |
|---|---|---|---|
| | | | |

## How to report it honestly

- **"X of N got two creatures into a race without help."** N is everyone who started, including anyone who gave up or ran out of time. Never drop a tester, and never re-run one.
- **Small numbers stay small.** With 5 or fewer testers write "3 of 4", not "75%". It is a cold test, not a study.
- **Median setup time** with the fastest and slowest, and how many of those who got there had help.
- **Second race:** "X of N started a second race without us restarting anything." N is everyone who started the test. If we fixed anything between the races, that tester counts as no.
- **Power answers** are quoted exactly. "Explained the way the race works" and "feature really in the drawing" are our own calls against the Reveal sticker and the paper: say so, and give the number of creatures. "I don't know" is a no. Keep what the tester said apart from what we judged, and say which drawings: our two table drawings were drawn with wings and wheels or legs, so a match on them proves less than one on a tester's own drawing.
- **Shutter to speaking** is a hand stopwatch: give whole tenths of a second at most. Quote the timing pass as "from the phone's shutter to the creature speaking on the TV", with how many scans, tunnel or Wi-Fi, and that the TV was the VVD on a laptop. The in-test number includes the tester's time in the Lobby: label it that way or leave it out. Silent cards stay in the count.
- **Server log lines** are copied, never retyped or rounded. `[scan]` ms is only the server's part (upload to creature): never call it "snap to creature". Claude and offline scans both stay in; say how many fell back.
- **Round trips** from `[net] race rtt` are real phones in real races. Tunnel races measure phone, Cloudflare, Mac; only Wi-Fi-only races are the Wi-Fi round trip. Report them apart. Keep "6-9 ms inside the TV" as its own VVD figure: don't halve the round trip or add the two together. If no build printed the line, write "not measured".
- **Reconnect:** "X of N phones were still in after 20 s locked." One 20 s lock per tester is a spot check, not a soak; say which phones.
- **Grown-ups screen:** "X of N adults found it and passed its gate." Adults passing it says nothing about whether it keeps children out; never claim that.
- **Say who they were:** adults, relatives, friends or teachers who had never seen the game. Testers who worked as a pair are reported as a pair. Keep this test apart from the children's session (`results-sheet.md`): never pool the two.
- **Say what it ran on:** the Vega Virtual Device shown on a laptop, with the keyboard as the remote, not a Fire TV. Don't report race smoothness or speed from it: Amazon says the VVD is not for performance testing.
- **What we changed because of it:** one line per change, with its commit. If the game changed between testers, say which testers had which build; never pool before and after without saying so.
- **Quotes** are exact and credited as "Tester N, adult". No names.
- **Anything not measured stays `___`.** No estimates, no "about".

For `docs/IMPACT.md` and `docs/DEVPOST.md`, fill the blanks and keep the rest as is:

> Cold test: ___ adults who had never seen Sketchlings got one instruction, "Get two creatures into a race", and no other help. ___ of ___ did it without help; the median time from the instruction to the first race was ___ (fastest ___, slowest ___). The most common question was "___". Told "Race them again", ___ of ___ started a second race without us restarting anything. Asked whether their creature's power helped, they explained ___ of ___ powers the way the race works (our judgement; their exact words are in `docs/playtest/cold-test.md`). From the phone's shutter to the creature speaking on the TV took a median ___ s over ___ timed scans. Phone round trips during races: median ___ ms over ___ (Wi-Fi or the tunnel). A phone locked for 20 s in the Lobby was still in ___ of ___ times. Because of it we changed ___ (commit ___). It ran on the Vega Virtual Device on a laptop, with the keyboard as the remote.
