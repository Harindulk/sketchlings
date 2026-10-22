# Playtest run-sheet: Friday 23 October 2026

**Plan from the evening of 22 October 2026:** 3 or 4 children aged 4 to 10 (ideally one aged 4-6, one 7-8 and one 9-10) play Sketchlings for real, about 1 to 3 pm, run by teachers Harindu knows. First the teachers do the adult cold test as first-time adults ([`cold-test.md`](cold-test.md), "Friday: the teachers"). The camera films hands, phones, paper and the screen; a face or a voice only with a parent's written OK. The TV picture is the Vega Virtual Device (VVD) shown full screen through the live view (`scripts/live-view.ts`), on a real TV over HDMI if there is one. Phones join over the HTTPS tunnel (`scripts/tunnel.sh`) or the same Wi-Fi. The video is cut from 3 pm.

If the start moves, shift every time below by the same amount. The order and the lengths stay.

| File | Use |
|---|---|
| [`morning-check.md`](morning-check.md) | Harindu's 20-minute check at home, about 9 am, with his own phone |
| [`consent.html`](consent.html) / [`consent.md`](consent.md) | Page 1: the parent's OK, one per family, before the child plays. Page 2: the adult tester OK, one per teacher, before their cold test |
| [`cold-test.md`](cold-test.md) | The teachers' 10 minutes: what to say, what to record |
| [`results-sheet.html`](results-sheet.html) / [`results-sheet.md`](results-sheet.md) | The children's session: print and fill with a pen, type up after |
| [`card.html`](card.html) | How-to-play card. **Not on the table** (we want to see whether they get it alone). Give it to parents at the end if they like |
| `../../scripts/preflight.sh` | Read-only PASS/FAIL check of the Mac, server, VVD and build |
| `../../video/capture.sh` | Records the TV picture with the app's sound: `video/capture.sh <name> <seconds>` (1-180 s; Ctrl-C stops early) |

**Rules for the day**
1. **No form, no play.** One signed form (or a written reply with all four choices) per child, before they touch a phone. The teachers sign page 2 before their cold test.
2. **Camera:** hands, phones, paper and the screen. A child's face only with their "Face" tick, their voice only with "Voice" (otherwise it is cut or muted in the edit). Teachers: as they ticked, never a face.
3. **First names only**, on the phones and on paper. Names go on the back of drawings.
4. **Don't help unless stuck. Never coach abilities.** Section 5.2.
5. **Never invent results.** Write what happened, breakages included. Exact words for quotes. A blank stays blank.
6. **Real audio only.** Voices come from the TV or Mac speakers; add no sounds the app doesn't play.
7. **No more than 2 minutes of fixing** while the children wait: section 7, then move on.
8. **A child can stop at any time.** No one is made to play or to answer.

---

## 1. The day at a glance

| Time | What | Who |
|---|---|---|
| Thu evening | Send the parents' form to the teachers: [`consent.html`](consent.html) page 1 (PDF or print), or part 1 of [`consent.md`](consent.md) as a message. Fill in your contact and the place first | Harindu |
| 9:00-9:20 | Morning check at home ([`morning-check.md`](morning-check.md)). Send back anything odd by 10:00 | Harindu |
| by 12:00 | Pack (section 2). The teachers collect the parents' forms (a photo of the signed page, or the parent's message, is fine) | Harindu, teachers |
| 12:30-13:00 | Setup (section 3) | Harindu |
| 13:00-13:10 | Teachers' cold test (section 4) | Teachers play, Harindu observes |
| 13:10-13:15 | Brief the teachers (section 5), reset | All |
| 13:15-13:45 | Round 1: draw 10, join and snap 5, Reveal and 2-3 races 10, questions 5 (section 5.3) | Children |
| 13:45-14:15 | Round 2, same party, nothing restarted: draw 8, snap and Reveal 5, 2-3 races 10, questions 7 (section 5.4) | Children |
| 14:15-14:30 | Free play, and spare time for delays (section 5.5) | Children, teachers |
| 14:30-14:45 | Thank you, drawings go home, two questions to the teachers | All |
| 14:45-15:00 | Copy the log lines, pack (section 8) | Harindu |

## 2. Bring

- [ ] Mac and its charger, plus an extension lead
- [ ] HDMI cable, and a USB-C to HDMI adapter if the Mac has no HDMI port
- [ ] 3 to 4 game phones, charged, with chargers or a power bank (ideally an iPhone and an Android among them)
- [ ] A phone hotspot with data on (for the Mac and any phone without data)
- [ ] Room camera: a phone with 10 GB free, its charger, a tripod or a stack of books
- [ ] White A4 paper (20 sheets), thick dark markers (one per child, plus spares), crayons
- [ ] Our two drawings for the teachers: one with big wings, one with wheels or long legs
- [ ] Printed (Chrome, Cmd+P, A4, Margins Default): [`consent.html`](consent.html) page 1 (one per family, plus 2 spare) and page 2 (one per teacher); [`results-sheet.html`](results-sheet.html), all 3 pages, **Landscape**; the `cold-test.md` Results tables for 2 testers; section 5 of this sheet, one per teacher
- [ ] Pens, a clipboard, a folder for the signed forms

## 3. Setup (12:30-13:00)

### 3.1 Terminal tabs (12:30)

Open 4 tabs in Terminal. In **every** tab paste:

```sh
cd ~/Desktop/Sketchlings && source ~/vega/env && L=notes/playtest-$(date +%Y%m%d).log && export ADB=$(command -v adb)
key() { tv/scripts/remote.sh "$@"; }   # key select | up | down | left | right | back | menu | playpause
```

Tab 1: VVD and commands. Tab 2: server (leave it running). Tab 3: log marks and `capture.sh`. Tab 4: live view.

### 3.2 VVD and app (tab 1, 12:32)

```sh
vega virtual-device status                       # {"running":true,...} means it is up
vega virtual-device start --no-gui --timeout 300 # only if it is not running (boots in about 10 s)
adb devices                                      # must list: emulator-5554  device
vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice
```

Use the build you checked this morning. Don't build anything at the venue.

### 3.3 Server with the HTTPS link (tab 2, 12:35)

Read the forms first (3.7). If every form says Yes to AI:

```sh
scripts/tunnel.sh 2>&1 | tee -a "$L" notes/tunnel-run.log
```

If **any** form says No to AI, start it with the key empty, so no drawing that day goes to Claude:

```sh
ANTHROPIC_API_KEY= scripts/tunnel.sh 2>&1 | tee -a "$L" notes/tunnel-run.log
```

Check the output says:
- `Phones join at https://<words>.trycloudflare.com/j/<CODE>` (HTTPS, so "Enable shouting" works),
- `Personas: Claude (claude-opus-5-5), offline fallback on any error`, or `Personas: offline generator` when the key is empty on purpose,
- `Voices: Kokoro-82M on this Mac`.

The link changes every time the tunnel restarts. The TV's QR shows the current one after Home, then Start party. The log file is git-ignored, and the numbers come from it later.

### 3.4 The TV picture (tab 4, 12:38)

```sh
caffeinate -dis bun scripts/live-view.ts   # keeps the Mac awake while the live view runs
```

1. HDMI from the Mac to the TV, TV on that input. Mac: System Settings, Displays: use the TV as an **extended** display.
2. Open http://localhost:8799/ in Chrome, drag the window onto the TV, click it once: full screen. Terminal stays on the Mac's own screen.
3. **The Mac keyboard is the remote** while Chrome is the front app: arrows, Enter = OK, Backspace = Back, Space = Play/Pause (ROAR), M = Menu. To get back to Chrome after Terminal, press **Cmd+Tab**: a click on the picture leaves full screen. Use Backspace for Back, not Esc (Esc also leaves full screen).
4. Sound: System Settings, Sound, Output: the TV (louder) or the Mac. Volume high.
5. Check from where the children will sit: the room code and the creatures are readable.

No TV: the Mac's own screen is the TV. Sit the children close to it.

### 3.5 Phones (12:42)

- Each game phone: charged, brightness up, Do Not Disturb on, auto-lock off for the afternoon, volume up. **iPhone: ring switch off silent**, or the race sounds may not play. On mobile data or the hotspot.
- TV: Enter on **Start party**. Each phone scans the QR with its Camera app, joins as "Test", and shows up in the Lobby. Then Backspace on the TV to Home (that party ends) and close the game's tab on every phone. The children's party gets a new link, so no name is filled in for them.
- Leave each phone unlocked on its home screen with the Camera app one tap away.

### 3.6 Cameras (12:47)

- **Room camera** on its tripod behind where the children sit, above shoulder height, looking down past them: paper, hands, phones and the TV in one frame. Landscape, 1080p30 (or 4K30), HDR video off, focus and exposure locked on the TV. Plugged in.
- Sound check: TV Home, arrow Right to **Demo party**, Enter, Enter (Start the show): a Reveal card speaks. Record 20 s on the room camera and play it back: you must hear the creature's voice. Backspace to Home.

### 3.7 Forms (12:50)

- One form per child: signed, or a written reply with all four choices. **No form, no play.** Ask the teacher to message that parent now.
- Copy each child's ticks into the Children table of the results sheet (name shown, AI, voice, face). Any No to AI: the server must have been started with the key empty (3.3).
- The teachers each sign page 2.

### 3.8 Last checks (12:55)

1. Tab 1: `scripts/preflight.sh`. Expected FAILs: the Hall of Fame line (it holds earlier creatures, that's fine), and the Claude lines if AI is off on purpose. Fix any other FAIL with the hint it prints.
2. TV on **Home**, focus on Start party. On the table: our two drawings, blank paper, a marker, two phones. Nothing else: no card, no notes.
3. Tab 3, mark the log for the teachers:
   ```sh
   M="Teachers"; echo "=== $M start $(date +%T)" >> "$L"
   ```
4. The room camera rolls only if both teachers ticked filming.

---

## 4. Teachers' cold test (13:00-13:10)

Follow [`cold-test.md`](cold-test.md), section "Friday: the teachers". In short: both teachers together, one phone each, our two drawings on the table. Say the remote line ("This laptop is the TV. The arrow keys, Enter and Backspace are the remote.", or with a real TV: "The arrow keys, Enter and Backspace on this laptop are the remote."), then **"Get two creatures into a race."** and nothing else. Stop at 8 minutes. After the first race, the two questions about each creature, word for word. Then "Race them again" if there is time.

At 13:10, reset: TV Backspace to Home, close the game's tab on both phones, our two drawings off the table. Close the teachers' part of the log (tab 3) and start the children's part:

```sh
echo "=== $M end $(date +%T)" >> "$L"
M="Kids"; echo "=== $M start $(date +%T)" >> "$L"
```

Copy the teachers' lines into `cold-test.md` later (section 8).

---

## 5. The children's session (for the teachers: give them this section after their cold test)

### 5.1 Roles

| Role | Who | Does |
|---|---|---|
| **Lead** | Teacher 1 | Talks to the children: the one sentence, paper, phones, the questions. Otherwise quiet |
| **Notes** | Teacher 2 (Harindu, if there is only one teacher) | The results sheet: a clock time (HH:MM) for every race, scan and quote; the "again!" tally |
| **Tech** | Harindu | The Mac: the remote keys, `capture.sh`, the log; fixes anything that breaks; the handheld camera when free |

### 5.2 What to say, and what not to do

Say this once, at the start, and nothing more about the game:

> **"Draw the most amazing creature you can imagine, as big as the paper, and it will come alive on the TV!"**

When the drawings are done, hand each child a phone: "Here's your phone." Round 2: "Now draw another one!"

**Stuck** = a child asks an adult, or nothing happens for 1 minute. Then give the smallest help that unblocks them: words first, then pointing, and touch the phone only if that fails. Notes writes the help word for word with the clock time. Typing a name for a child who can't write yet counts as help: write it down.

**Don't:**
- Don't show or explain the game first: no card, no demo, no "watch me".
- Don't help unless stuck. Don't take the phone; if you must, give it straight back.
- **Don't coach abilities**: no "draw wings and it flies", no "use your power", no "ROAR now!", no reading the power sticker out. Let the game do it.
- Don't say who is winning or tell anyone to tap faster. Cheer everyone the same.
- Don't ask leading questions ("Wasn't that fun?"). Ask the questions below as written.
- Don't correct what a child says about their creature or its power.
- Don't rush the youngest, and don't restart anything between rounds.

**The questions** (Lead, one child at a time, after the races; Notes writes the exact words):
1. **"Tell me about your creature."**
2. **"Did its power help it in the race, or not? Why?"**
3. Round 2 only: **"What would you change in the game?"**

"I don't know" is an answer: write it. Ask nothing more, don't explain, and a child who doesn't want to answer doesn't have to.

### 5.3 Round 1 (13:15-13:45)

| Time | What happens | Lead | Notes | Tech and cameras |
|---|---|---|---|---|
| 13:15 | Children sit facing the TV, room camera behind them | Says the one sentence; paper and markers out | Clock time; who sits where | Room camera rolling from now to 14:30. Check the frame: no face of a child without a "Face" tick. Handheld: drawing from above |
| 13:15-13:25 | Draw (stop at 10 min; a slow drawer finishes while the others join) | Writes a name on the back of a drawing if asked | Who is drawing what (a few words) | TV: Enter on **Start party**, so the QR is up |
| 13:25 | Phones handed out | "Here's your phone." | Clock time | Handheld: over a shoulder, the phone screen |
| 13:25-13:30 | Join (QR, name, age group) and snap (Snap my drawing, Bring it to life!) | Quiet; help only if stuck. Wrong age group: before the snap, helps with "Not <name>? Switch player" and the child joins again | Per child: joined alone? snapped alone? re-snaps, help given. Age group right? (the phone's "You're in" screen shows the boost: Little kid up to 7, Big kid 8 to 12) | Watch tab 2 for `[scan]` lines and errors |
| 13:30 | All creatures ready in the Lobby | | | Tab 3: `video/capture.sh kids-r1-reveal 120`, Cmd+Tab, Enter (Start the show!). A child may press Enter |
| 13:30-13:32 | Reveal cards with voices; Enter for Next, then Race | | Each creature's name and power sticker; voice heard? | On the last Reveal card, before Race: Ctrl-C in tab 3 and wait for its prompt, then `video/capture.sh kids-r1-race1 180`, Cmd+Tab, Enter on Race |
| 13:32-13:40 | 2 or 3 races: race, Results, Enter (Play again), race ... | Quiet. Cheers the same for all | One Races row per race: racers, powers, winner, 2nd, youngest won, youngest needed help, controls seen; "again!" tally | Race 1 is recording (row above). Before each next race: `video/capture.sh kids-r1-race2 180` (race3 ...); Ctrl-C in tab 3 after its Results stops it. Let Results run 8 s (podium, winner's line) before Enter: Enter on Results is Play again. Handheld: hands tapping |
| 13:40-13:45 | Questions 1 and 2, one child at a time | Asks | Exact words | Room camera keeps rolling |

### 5.4 Round 2, same party, nothing restarted (13:45-14:15)

| Time | What happens | Lead | Notes | Tech and cameras |
|---|---|---|---|---|
| 13:45 | TV back to the Lobby | "Now draw another one!" | Clock time | Backspace from Results: the same party's Lobby. Phones stay joined |
| 13:45-13:53 | Draw a new creature | | | Handheld: drawing from above |
| 13:53-13:57 | On the phone, **Draw a new one**, snap, Bring it to life! | Quiet; help only if stuck | Per child: found "Draw a new one" alone? snapped alone? re-snaps | Nothing restarted: no server, tunnel, app or VVD restart, no page reloads by us. If something had to be, Notes writes what |
| 13:57-13:59 | Reveal | | Names, power stickers; voice heard? | `video/capture.sh kids-r2-reveal 120`, Enter (Start the show!). Ctrl-C it on the last Reveal card, before kids-r2-race1 |
| 13:59-14:08 | 2 or 3 races | Quiet | Races rows, "again!" tally | `video/capture.sh kids-r2-race1 180` and so on, Ctrl-C after each Results |
| 14:08-14:15 | Questions 1, 2 and 3, one child at a time | Asks | Exact words | |

### 5.5 Free play (14:15-14:30), then the end

- Children choose: more races (Play again), or the **Hall of Fame**: TV Backspace to Home, arrow to Hall of Fame, Enter on a creature = "Race again" (it joins the next party as a guest). Then Home, Start party: the phones scan the new QR and snap again ("Draw on screen instead" is quickest).
- Teachers may race with the children now. Notes keeps the "again!" tally and quotes.
- If the morning check showed the Hall of Fame freezing on a second visit, Tech reinstalls the app first (section 7).
- 14:30: thank the children; the paper drawings go home with them. Ask the teachers: **"What surprised you?"** and **"What would stop you using this with a class or at home?"** Notes writes the exact words.

---

## 6. Filming: who films what, from where

| Camera | Where | What | When |
|---|---|---|---|
| Room camera (a phone on a tripod) | Behind the children, above shoulder height, looking down past them | Paper, hands, phones and the TV in one frame; the room's sound with the creature voices | Rolling 13:15-14:30, plugged in. Faces never in frame unless that child has a "Face" tick: tilt lower |
| Handheld (Harindu; Notes if Harindu is busy) | Above the table, or over a shoulder | Hands drawing, from above; the phone screen at the snap and "Bring it to life!"; hands tapping in a race; a hand pointing at its creature on the TV | When free. Never in front of a face |
| TV picture (`video/capture.sh`, tab 3) | The Mac | Each Reveal and each race, with the app's sound, 1920x1080 | Started by Tech before each Reveal and race. Clips go to `video/clips/kids-*.webm` |

Must get, for the video (twice if possible): a child's drawing coming alive (hands on paper, the snap, the Reveal with its voice); a race wide shot with hands on phones and the TV; a power moment with the child's creature (WINGS!, WHEELS!, SPRINGS! or BIG ROAR!); the podium with hands in the air; the Hall of Fame with the children's creatures. Children's voices only from children with a "Voice" tick: Notes writes the clock time of anything a child without one says on camera, so the edit can mute it.

---

## 7. If something breaks

Write what broke, when, and for how long on the sheet. Never more than 2 minutes with the children waiting: give them paper to draw while you fix it.

| Symptom | Do this |
|---|---|
| **A phone won't join** (camera ignores the QR, or the page won't load) | Move closer so the QR fills about a third of the phone's screen. Android: Google Lens if the camera ignores it. Check the phone has internet (open any website). "No room called ...": the TV left the party; Start party again and rescan. Still nothing: give that child another phone that joined at setup |
| **QR opens the wrong address** (a `192.168...` link when you meant the tunnel, or an old `trycloudflare` link) | The server was started without the tunnel, or the tunnel restarted. Tab 2: Ctrl-C, run the 3.3 line again, then TV Backspace to Home and Start party: the new QR has the new link. Phones rescan; their creatures from this party must be snapped again (earlier ones are in the Hall of Fame) |
| **Server down** (phones say "Reconnecting...", tab 2 shows an error or a prompt) | Tab 2: Ctrl-C if needed, run the 3.3 line again. TV Home, Start party, phones rescan and re-snap. Write the time: round 2 then did not run "without restarting" |
| **VVD frozen** (countdown stuck on "3", or keys do nothing) | First check: a still screen is not a freeze (F in the live view shows the fps; it reads 0 when nothing moves). Press Backspace. Still stuck: tab 1, `vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice` (reinstalls and launches). VVD gone (`vega virtual-device status` says `"running":false`): `vega virtual-device start --no-gui --timeout 300`, then the run-app line. The live view reconnects by itself. Then Start party, phones rescan and re-snap |
| **Live view black or stuck, game fine** | Tab 4 still running? Reload the page (Cmd+R), click once for full screen |
| **Keys do nothing** | Cmd+Tab to Chrome (a click on the picture leaves full screen). Still nothing: tab 3, `key select` works without the page. Unity's adb fighting: quit Unity, `adb kill-server && adb start-server` |
| **No internet: offline personas** | Tab 2: Ctrl-C, then `cd server && ANTHROPIC_API_KEY= bun run start 2>&1 \| tee -a ../$L`. The empty key skips Claude, which would otherwise wait 12 s before every fallback. Phones join the same Wi-Fi as the Mac (the room's, or the hotspot's); the QR shows the Mac's address. No "Enable shouting" (the ROAR button still works). Write "offline" on the sheet. TV Home, Start party |
| **A creature took over 12 s, or the log says `using offline persona`** | Claude fell back to the offline generator. Mark "offline" in that drawing's row and carry on |
| **"Hmm, I can't see a drawing" or a messy cut-out** | The child retakes. If stuck: "Hold it flat" or "a bit closer" (that's help: write it). Last resort: "Draw on screen instead". Count the re-snaps |
| **No creature voice** | Check the sound output and volume (HDMI often moves the sound to the TV). Carry on and write it down; never fake it in the edit |
| **Hall of Fame freezes** (seen on a second visit in one app run, `notes/tv.md` F11) | Reinstall and launch the app (the run-app line), then go straight to the Hall of Fame |
| **A child is upset or wants to stop** | They stop. No questions. Ask the parent or teacher whether their creature stays in the results |
| **Everything else: demo party, remote only** | TV Home, arrow Right to Demo party, Enter, Enter (Start the show), Enter through the Reveal cards. The remote plays player 1 (Enter = run, Up = jump, Space = ROAR) and bots race the Hall of Fame's creatures. Children take turns on the Mac keyboard. Write "demo party" on the sheet: it is not a phone race |

---

## 8. After the session (14:45, at the venue)

1. Tab 3: close the children's part of the log and print it, then copy the lines onto the results sheet's "Server log lines" (or photograph the screen):
   ```sh
   echo "=== $M end $(date +%T)" >> "$L"
   sed -n "/=== Kids start/,/=== Kids end/p" "$L" | grep -E '^\[[a-z]+\]'
   sed -n "/=== Teachers start/,/=== Teachers end/p" "$L" | grep -E '^\[[a-z]+\]'
   ```
2. Creatures made today, with their powers and eye counts:
   ```sh
   curl -s localhost:8787/api/hall-of-fame | python3 -c 'import json,sys; h=json.load(sys.stdin); print(len(h), "creatures"); [print(s.get("artist","?"), "|", s["name"], "|", s["ability"]["feature"], "->", s["ability"]["kind"], "| eyes:", len(s.get("eyes") or [])) for s in h]'
   ```
3. Signed forms in the folder. Copy the phone footage and `video/clips/kids-*.webm` to `~/Desktop/sketchlings-footage/`, and back it up. Forms and footage never go in the repo.
4. Pack. Ctrl-C tabs 2 and 4 last.

Same evening: type the results into [`results-sheet.md`](results-sheet.md) and the teachers' into [`cold-test.md`](cold-test.md), with names replaced (Child A to D, Tester 1 and 2). Make the one design change the children caused, commit it, and write it in both. Give the video editor the best clips per shot (file name, clock time). Before the upload, watch every frame against the forms.

---

## Remote keys

| Live view (Chrome in front) | Tab 3 | Does |
|---|---|---|
| Enter | `key select` | OK: press the focused button; in the demo race, run |
| Arrows | `key up` / `down` / `left` / `right` | Move focus; in the demo race, Up = jump |
| Backspace | `key back` | Back (from Reveal, race or Results in a party: to the Lobby) |
| Space | `key playpause` | In the demo race: ROAR |
| M | `key menu` | In a race: perf overlay on or off |
| F | | Live view only: fps readout |

TV path: Home tiles left to right are Start party, Demo party, Hall of Fame, How to play (focus starts on Start party). Lobby: "Start the show!" once a drawing is ready. Reveal: "Next", then "Race" on the last card. Results: "Play again" (focused) and "Home".
