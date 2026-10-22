# Playtest run-sheet: Friday 23 October 2026

**Plan from the evening of 22 October 2026:** 3 or 4 children aged 4 to 10 (ideally one aged 4-6, one 7-8 and one 9-10) play Sketchlings for real, about 1 to 3 pm, run by teachers Harindu knows. First the teachers do the adult cold test as first-time adults ([`cold-test.md`](cold-test.md), "Friday: the teachers"). The camera films hands, phones, paper and the screen; a face or a voice only with a parent's written OK. The TV picture is the Vega Virtual Device (VVD) shown full screen through the live view, on a real TV over HDMI if there is one. **One command runs the Mac all day: `scripts/session.sh`.** It starts the VVD and the app, the server with its HTTPS link (phones join over it, or over the same Wi-Fi with `--lan`), the live view, and a recording of everything the TV shows. Nothing else is started by hand. The video is cut from 3 pm.

If the start moves, shift every time below by the same amount. The order and the lengths stay.

| File | Use |
|---|---|
| [`morning-check.md`](morning-check.md) | Harindu's 20-minute check at home, about 9 am, with his own phone |
| [`consent.html`](consent.html) / [`consent.md`](consent.md) | Page 1: the parent's OK, one per family, before the child plays. Page 2: the adult tester OK, one per teacher, before their cold test |
| [`cold-test.md`](cold-test.md) | The teachers' 10 minutes: what to say, what to record |
| [`results-sheet.html`](results-sheet.html) / [`results-sheet.md`](results-sheet.md) | The children's session: print and fill with a pen, type up after |
| [`card.html`](card.html) | How-to-play card. **Not on the table** (we want to see whether they get it alone). Give it to parents at the end if they like |
| `../../scripts/session.sh` | The day's one command (3.2). `scripts/session.sh take <name>` films one unbroken clip of the TV for the video (up to 180 s, until the next take); `scripts/session.sh stop` or Ctrl-C in its tab ends it |
| `../../scripts/preflight.sh` | Read-only PASS/FAIL check of the Mac, server, VVD and builds. The session runs it when it starts |

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

Open 2 tabs in Terminal. In **both** paste:

```sh
cd ~/Desktop/Sketchlings && source ~/vega/env && L=notes/playtest-$(date +%Y%m%d).log
key() { tv/scripts/remote.sh "$@"; }   # key select | up | down | left | right | back | menu | playpause
```

Tab 1: the session (leave it running; the server's lines show up there). Tab 2: everything else: takes, log marks, `key`, preflight.

### 3.2 The session (tab 1, 12:32)

Read the forms first (3.7). On school Wi-Fi, first open any https page in Safari on the Mac (it clears a Wi-Fi login page). If every form says Yes to AI:

```sh
scripts/session.sh
```

If **any** form says No to AI, add `--no-ai`, so no drawing that day goes to Claude:

```sh
scripts/session.sh --no-ai
```

`--no-ai` holds for every later start too, with or without the flag, so a restart can't bring Claude back. Only after the children have gone does `rm video/clips/.no-ai` undo it (section 8).

In about a minute it keeps the Mac awake, boots the VVD if it is down, launches the installed app, starts the server with its HTTPS link, opens the live view in its own Chrome window, starts recording the TV, and runs preflight. Use the build you checked this morning. Don't build anything at the venue.

**Never run `video/capture.sh`, `scripts/tunnel.sh` or `scripts/live-view.ts` by hand while the session runs.** They clash with it (`capture.sh` refuses to start anyway).

### 3.3 What tab 1 must say (12:35)

- `Phones join at https://<words>.trycloudflare.com/j/<CODE>` (HTTPS, so "Enable shouting" works),
- `Personas: Claude (claude-opus-5-5), offline fallback on any error`, or `Personas: offline generator` with `--no-ai`,
- `Voices: Kokoro-82M on this Mac`,
- at the end, the status block: Session, Join, TV, AI, REC. The AI line says OFF with `--no-ai`.

`Tunnel did not start` or `has no connection`, then `ERROR the server stopped`: this Wi-Fi blocks the tunnel. Put the Mac on the phone hotspot and run the same line again. The tunnel stops nothing when it fails. No internet at all: section 7, "No internet".

The link changes every time the session restarts. The TV's QR shows the current one after Home, then Start party. **After every restart of the session, every phone closes the game's tab and scans the TV's new QR**: the old link is dead for good, and a phone left on it shows "Reconnecting..." forever. The logs are git-ignored, and the numbers come from them later.

### 3.4 The TV picture and Grown-ups (12:38)

1. HDMI from the Mac to the TV, TV on that input. Mac: System Settings, Displays: use the TV as an **extended** display, not a mirror. Terminal stays on the Mac's own screen, so the children never see it.
2. The session opened the live view (http://localhost:8799/) in its own Chrome window. Drag it onto the TV if it isn't there, and click it once: full screen.
3. **The Mac keyboard is the remote** while Chrome is the front app: arrows, Enter = OK, Backspace = Back, Space = Play/Pause (ROAR), M = Menu. To get back to Chrome after Terminal, press **Cmd+Tab**: a click on the picture leaves full screen. Use Backspace for Back, not Esc (Esc also leaves full screen).
4. Sound: System Settings, Sound, Output: the TV (louder) or the Mac. Volume high.
5. Check from where the children will sit: the room code and the creatures are readable.
6. **AI personas** (you, as the grown-up): on the TV's Home, open **Grown-ups**, pass its parent gate, and turn AI personas **on**. Then back to Home. The app keeps them off until a grown-up does this. If any form says No to AI, leave them off (the session runs with `--no-ai` as well). Check again after any reinstall or relaunch of the app (section 7).

No TV: the Mac's own screen is the TV. Click the live view once for full screen, and sit the children close to it.

### 3.5 Phones (12:42)

- Each game phone: charged, brightness up, Do Not Disturb on, auto-lock off for the afternoon, volume up. **iPhone: ring switch off silent**, or the race sounds may not play. On mobile data or the hotspot.
- TV: Enter on **Start party**. Each phone scans the QR with its Camera app, joins as "Test", and shows up in the Lobby. Tab 1 must not show `[consent] room …: AI personas off` (if it does and every form says Yes: Grown-ups, 3.4 step 6). Then Backspace twice on the TV (the first only asks): Home, and that party ends. Close the game's tab on every phone. The children's party gets a new link, so no name is filled in for them.
- Leave each phone unlocked on its home screen with the Camera app one tap away.

### 3.6 Cameras (12:47)

- **Room camera** on its tripod behind where the children sit, above shoulder height, looking down past them: paper, hands, phones and the TV in one frame. Landscape, 1080p30 (or 4K30), HDR video off, focus and exposure locked on the TV. Plugged in.
- Sound check: TV Home, arrow Right to **Demo party**, Enter, Enter (Start the show): a Reveal card speaks. Record 20 s on the room camera and play it back: you must hear the creature's voice. Backspace to Home.

### 3.7 Forms (12:50)

- One form per child: signed, or a written reply with all four choices. **No form, no play.** Ask the teacher to message that parent now.
- Copy each child's ticks into the Children table of the results sheet (name shown, AI, voice, face). Any No to AI: the session must run with `--no-ai` (3.2), and tab 1's status block says AI OFF.
- The teachers each sign page 2.

### 3.8 Last checks (12:55)

1. Tab 2: `scripts/preflight.sh`. Expected FAIL: the Hall of Fame line (it holds earlier creatures, that's fine). With `--no-ai` its Claude line checks for "offline" instead and passes. Fix any other FAIL with the hint it prints.
2. TV on **Home**, focus on Start party. On the table: our two drawings, blank paper, a marker, two phones. Nothing else: no card, no notes.
3. Tab 2, mark the log for the teachers:
   ```sh
   M="Teachers"; echo "=== $M start $(date +%T)" >> "$L"
   ```
4. The room camera rolls only if both teachers ticked filming.

---

## 4. Teachers' cold test (13:00-13:10)

Follow [`cold-test.md`](cold-test.md), section "Friday: the teachers". In short: both teachers together, one phone each, our two drawings on the table. Say the remote line ("This laptop is the TV. The arrow keys, Enter and Backspace are the remote.", or with a real TV: "The arrow keys, Enter and Backspace on this laptop are the remote."), then **"Get two creatures into a race."** and nothing else. Stop at 8 minutes. After the first race, the two questions about each creature, word for word. Then "Race them again" if there is time.

At 13:10, reset: TV Backspace to Home (twice on the Lobby: the first only asks), close the game's tab on both phones, our two drawings off the table. Close the teachers' part of the log (tab 2) and start the children's part:

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
| **Tech** | Harindu | The Mac: the remote keys, the takes (`scripts/session.sh take ...` in tab 2), the log; fixes anything that breaks; the handheld camera when free |

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
| 13:25-13:30 | Join (QR, name, age group) and snap (Snap my drawing, Bring it to life!) | Quiet; help only if stuck. **The age group is picked by an adult** (not counted as help): at that question, tap the right one with the child (Little kid up to 7, Big kid 8 to 12), then check the badge on "You're in": "+40% boost!" for a Little kid, "+20% boost!" for a Big kid. Wrong: before the snap only, tap "Not <name>? Switch player" and the child joins again. Only adults use Switch player. After the snap it can't be changed: let it race | Per child: joined alone? snapped alone? re-snaps, help given. Age group and badge checked by an adult; a wrong one that raced: write it | Watch tab 1 for `[scan]` lines and errors. Each TV Lobby chip shows the same boost as the child's phone |
| 13:30 | All creatures ready in the Lobby | | | **Wait for the voices:** "Start the show!" appears with the first ready creature, but wait until tab 1 shows one `[scan] … upload->voices … ms` line per child (up to a minute when 4 scanned together). The voices are made one after another; without the wait the last Reveal cards are silent. Then tab 2: `scripts/session.sh take kids-r1-reveal`; when it says "Recording", Cmd+Tab, Enter (Start the show!). A child may press Enter |
| 13:30-13:32 | Reveal cards with voices; Enter for Next, then Race | | Each creature's name and power sticker; voice heard? | On the last Reveal card, before Race: tab 2 `scripts/session.sh take kids-r1-race1`; when it says "Recording", Cmd+Tab, Enter on Race |
| 13:32-13:40 | 2 or 3 races: race, Results, Enter (Play again), race ... | Quiet. Cheers the same for all | One Races row per race: racers, powers, winner, 2nd, youngest won, youngest needed help, controls seen; "again!" tally | Race 1 is recording (row above). Let Results run 8 s (podium, winner's line). Then, before each next race: tab 2 `scripts/session.sh take kids-r1-race2` (race3 ...), "Recording", Cmd+Tab, Enter on Results (Play again). A take ends at the next take or after 180 s: nothing to stop. Handheld: hands tapping |
| 13:40-13:45 | Questions 1 and 2, one child at a time | Asks | Exact words | Room camera keeps rolling |

### 5.4 Round 2, same party, nothing restarted (13:45-14:15)

| Time | What happens | Lead | Notes | Tech and cameras |
|---|---|---|---|---|
| 13:45 | TV back to the Lobby | "Now draw another one!" | Clock time | Backspace **once** from Results (or its Lobby button): the same party's Lobby. Phones stay joined. No Backspace on the Lobby: twice there ends the party (Remote keys, at the end) |
| 13:45-13:53 | Draw a new creature | | | Handheld: drawing from above |
| 13:53-13:57 | On the phone, **Draw a new one**, snap, Bring it to life! | Quiet; help only if stuck | Per child: found "Draw a new one" alone? snapped alone? re-snaps | Nothing restarted: no session, app or VVD restart, no page reloads by us. If something had to be, Notes writes what |
| 13:57-13:59 | Reveal | | Names, power stickers; voice heard? | Wait for the voices as in round 1 (one `upload->voices` line per child in tab 1). Tab 2 `scripts/session.sh take kids-r2-reveal`, "Recording", Cmd+Tab, Enter (Start the show!). On the last Reveal card: `scripts/session.sh take kids-r2-race1`, then Race |
| 13:59-14:08 | 2 or 3 races | Quiet | Races rows, "again!" tally | Before each next race: `scripts/session.sh take kids-r2-race2` and so on, as in round 1 |
| 14:08-14:15 | Questions 1, 2 and 3, one child at a time | Asks | Exact words | |

### 5.5 Free play (14:15-14:30), then the end

- Children choose: more races (Play again), or the **Hall of Fame**: TV Backspace to the Lobby, then twice more (the party ends) to Home. Tab 2 `scripts/session.sh take vvd-hall`, then arrow to Hall of Fame, Enter on a creature = "Race again" (it joins the next party as a guest). Then Home, Start party: the phones scan the new QR and snap again ("Draw on screen instead" is quickest).
- Teachers may race with the children now. Notes keeps the "again!" tally and quotes.
- If the morning check showed the Hall of Fame freezing on a second visit, Tech reinstalls the app first (section 7).
- 14:30: thank the children; the paper drawings go home with them. Ask the teachers: **"What surprised you?"** and **"What would stop you using this with a class or at home?"** Notes writes the exact words.

---

## 6. Filming: who films what, from where

| Camera | Where | What | When |
|---|---|---|---|
| Room camera (a phone on a tripod) | Behind the children, above shoulder height, looking down past them | Paper, hands, phones and the TV in one frame; the room's sound with the creature voices | Rolling 13:15-14:30, plugged in. Faces never in frame unless that child has a "Face" tick: tilt lower |
| Handheld (Harindu; Notes if Harindu is busy) | Above the table, or over a shoulder | Hands drawing, from above; the phone screen at the snap and "Bring it to life!"; hands tapping in a race; a hand pointing at its creature on the TV | When free. Never in front of a face |
| TV picture (`scripts/session.sh`, tab 1) | The Mac | Everything the TV shows, with the app's sound, 1920x1080, in 2-minute files all session long | Always on. Tech starts a take (tab 2) before each Reveal and race, so each one is a single file. Files go to `video/clips/session-<date>-<time>/`; each take is also `video/clips/<take>.webm` (kids-r1-reveal, kids-r1-race1 ...), the names the video build looks for |

Must get, for the video (twice if possible): a child's drawing coming alive (hands on paper, the snap, the Reveal with its voice); a race wide shot with hands on phones and the TV; a power moment with the child's creature (WINGS!, WHEELS!, SPRINGS! or BIG ROAR!); the podium with hands in the air; the Hall of Fame with the children's creatures. Children's voices only from children with a "Voice" tick: Notes writes the clock time of anything a child without one says on camera, so the edit can mute it.

---

## 7. If something breaks

Write what broke, when, and for how long on the sheet. Never more than 2 minutes with the children waiting: give them paper to draw while you fix it.

| Symptom | Do this |
|---|---|
| **A phone won't join** (camera ignores the QR, or the page won't load) | Move closer so the QR fills about a third of the phone's screen. Android: Google Lens if the camera ignores it. Check the phone has internet (open any website). "No room called ...": the TV left the party; Start party again and rescan. Still nothing: give that child another phone that joined at setup |
| **QR opens the wrong address** (a `192.168...` link when you meant the tunnel, or an old `trycloudflare` link) | The session was started with `--lan`, or it restarted. Tab 1: Ctrl-C, wait for "Stopped", run the 3.2 line again. Then TV Backspace to Home (twice on the Lobby) and Start party: the new QR has the new link. Phones rescan; their creatures from this party must be snapped again (earlier ones are in the Hall of Fame) |
| **Server down** (phones say "Reconnecting...", tab 1 says `the server stopped`) | Tab 1: Ctrl-C, wait for "Stopped", run the 3.2 line again (AI stays off if it was). TV Home, Start party, phones rescan and re-snap. Write the time: round 2 then did not run "without restarting" |
| **VVD frozen** (countdown stuck on "3", or keys do nothing) | First check: a still screen is not a freeze (F in the live view shows the fps; it reads 0 when nothing moves). Press Backspace. Still stuck: tab 2, `vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice` (reinstalls and launches). VVD gone (`vega virtual-device status` says `"running":false`): `vega virtual-device start --no-gui --timeout 300`, then the run-app line. The live view and the recording pick up again by themselves. Then Grown-ups: AI personas still on (3.4 step 6)? Then Start party, phones rescan and re-snap |
| **Live view black or stuck, game fine** | Reload the page (Cmd+R), click once for full screen. The recording is not affected. Still black: tab 1, Ctrl-C, wait for "Stopped", run the 3.2 line again; phones rescan |
| **Keys do nothing** | Cmd+Tab to Chrome (a click on the picture leaves full screen). Still nothing: tab 2, `key select` works without the page. Unity's adb fighting (preflight's Unity line FAILs): quit Unity, `adb kill-server && adb start-server` |
| **No internet: offline personas** | Tab 1: Ctrl-C, wait for "Stopped", then `scripts/session.sh --lan --no-ai`. With no internet there is no Claude anyway, and the empty key skips its 12 s wait before every fallback. AI then stays off for the day (section 8 brings it back). Phones join the same Wi-Fi as the Mac (the room's, or the hotspot's); the QR shows the Mac's address. First check one phone opens `http://<that address>:8787/health`: guest Wi-Fi often blocks phones from the Mac, and then only the hotspot works. No "Enable shouting" (the ROAR button still works). Write "offline" on the sheet. TV Home, Start party |
| **A creature took over 12 s, or the log says `using offline persona`** | Claude fell back to the offline generator. Mark "offline" in that drawing's row and carry on |
| **"Hmm, I can't see a drawing" or a messy cut-out** | The child retakes. If stuck: "Hold it flat" or "a bit closer" (that's help: write it). A cut-out of only a sun or a star means the creature ran off the photo: retake from farther back, with the whole page and a strip of table in the photo. Last resort: "Draw on screen instead". Count the re-snaps |
| **No creature voice** | Check the sound output and volume (HDMI often moves the sound to the TV). Carry on and write it down; never fake it in the edit |
| **Hall of Fame freezes** (seen on a second visit in one app run, `notes/tv.md` F11) | Reinstall and launch the app (the run-app line), then go straight to the Hall of Fame |
| **A child is upset or wants to stop** | They stop. No questions. Their creature would keep racing under their name, so: finish the race on screen, then Backspace to the Lobby and twice more to Home, and Start party. Every phone rescans and snaps again (Draw on screen instead is quickest), and the child is in no later race. Notes marks the takes with that child's creature "not usable" until the parent says otherwise. Ask the parent or teacher whether their creature stays in the results |
| **A parent asks to delete their child's creature** | Say yes, and do it after the session, never with children waiting: section 8, "Deleting one child's creature" |
| **Everything else: demo party, remote only** | TV Home, arrow Right to Demo party, Enter, Enter (Start the show), Enter through the Reveal cards. The remote plays player 1 (Enter = run, Up = jump, Space = ROAR) and bots race the Hall of Fame's creatures. Children take turns on the Mac keyboard. Write "demo party" on the sheet: it is not a phone race |

---

## 8. After the session (14:45, at the venue)

1. Tab 2: close the children's part of the log and print it, then copy the lines onto the results sheet's "Server log lines" (or photograph the screen):
   ```sh
   echo "=== $M end $(date +%T)" >> "$L"
   sed -n "/=== Kids start/,/=== Kids end/p" "$L" | grep -E '^\[[a-z]+\]'
   sed -n "/=== Teachers start/,/=== Teachers end/p" "$L" | grep -E '^\[[a-z]+\]'
   ```
2. Creatures made today, with their powers and eye counts:
   ```sh
   curl -s localhost:8787/api/hall-of-fame | python3 -c 'import json,sys; h=json.load(sys.stdin); print(len(h), "creatures"); [print(s.get("artist","?"), "|", s["name"], "|", s["ability"]["feature"], "->", s["ability"]["kind"], "| eyes:", len(s.get("eyes") or [])) for s in h]'
   ```
3. Stop the session: Ctrl-C in tab 1. Wait for "Stopped": it finishes the last recording and lists the files.
4. Signed forms in the folder. Copy the phone footage and the TV recordings to `~/Desktop/sketchlings-footage/`, and back it up. Forms and footage never go in the repo.
   ```sh
   mkdir -p ~/Desktop/sketchlings-footage && cp -R video/clips/session-$(date +%Y%m%d)-* ~/Desktop/sketchlings-footage/ && cp video/clips/kids-*.webm ~/Desktop/sketchlings-footage/
   ```
5. If the session ran with `--no-ai`: once the children have gone, `rm video/clips/.no-ai`, so later filming has Claude again.
6. Pack.

### Deleting one child's creature

Only with the session stopped: the server keeps the Hall of Fame in memory and would write the entry back. Tab 2, list the creatures with their ids:

```sh
python3 -c 'import json; [print(s["id"], "|", s.get("artist", "?"), "|", s["name"]) for s in json.load(open("server/data/hall.json"))]'
```

For each id of that child's creatures, paste the id after `ID=`:

```sh
ID=paste-the-id-here; python3 -c 'import json,sys; p="server/data/hall.json"; h=json.load(open(p)); json.dump([s for s in h if s["id"] != sys.argv[1]], open(p, "w"))' "$ID" && rm -f "server/data/sprites/$ID.png" && rm -rf "server/data/voice/$ID"
```

Then `rm -rf server/data/voice/cache` (it holds every clip once more, and the server makes it again). Delete the takes and session files that show their creature (`video/clips/<take>.webm` and the files in `video/clips/session-*/`, also in the footage folder), and their first name from `notes/playtest-*.log`, `notes/tunnel-run.log` and `video/clips/session-*/server.log`. Write on the results sheet that it was deleted, and when.

Same evening: type the results into [`results-sheet.md`](results-sheet.md) and the teachers' into [`cold-test.md`](cold-test.md), with names replaced (Child A to D, Tester 1 and 2). Make the one design change the children caused, commit it, and write it in both. Give the video editor the best clips per shot (file name, clock time). Before the upload, watch every frame against the forms.

---

## Remote keys

| Live view (Chrome in front) | Tab 2 | Does |
|---|---|---|
| Enter | `key select` | OK: press the focused button; in the demo race, run |
| Arrows | `key up` / `down` / `left` / `right` | Move focus; in the demo race, Up = jump |
| Backspace | `key back` | Back (from Reveal, race or Results in a party: to the Lobby). **On the Lobby of a party with players, the first press only asks** ("Press Back again to end the party"); a second press ends the party: the phones are not told, and every child rescans and snaps again. Never while children are playing, except on purpose (5.5, section 7) |
| Space | `key playpause` | In the demo race: ROAR |
| M | `key menu` | In a race: perf overlay on or off |
| F | | Live view only: fps readout |

TV path: Home tiles left to right are Start party, Demo party, Hall of Fame, How to play (focus starts on Start party). Grown-ups, the parent-gated settings (3.4 step 6), is a separate button on Home. Lobby: "Start the show!" once a drawing is ready. Reveal: "Next", then "Race" on the last card. Results: "Play again" (focused) and "Lobby" in a party (the party stays; "Home" in the Demo party).
