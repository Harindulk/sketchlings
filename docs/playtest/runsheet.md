# Thursday playtest and filming run-sheet

**Thursday 22 October 2026, at home. 2 to 3 kids (ideally different ages) and a parent, 30 to 45 minutes of play.**
This session gives the video its opening (a real child's drawing coming alive) and gives the write-up its proof: real users and real numbers. 

| File | Use |
|---|---|
| [`consent.html`](consent.html) / [`consent.md`](consent.md) | Parental consent, one A4 page. Signed before any camera rolls. |
| [`card.html`](card.html) | How-to-play card for the table (A4). |
| [`results-sheet.html`](results-sheet.html) / [`results-sheet.md`](results-sheet.md) | Fill the print copy by pen on the day; type it into the .md the same evening. |
| `../../scripts/preflight.sh` | Read-only PASS/FAIL check. Run it last, right before the family plays. |
| `../../video/capture.sh` | The video engineer's capture script. If it is in the repo on Thursday, use it instead of `vrec`/`vstop` below (its usage is at the top of the file). |

**Rules for the whole day**
1. Consent first. No camera rolls until the form is signed, and only for the children ticked.
2. **No faces.** Film hands, paper, phones and the TV. Frame from the shoulders down or from behind the couch.
3. First names only, on the phones and on the sheet. Names go on the back of drawings, not the front.
4. Real audio only. Creature voices play from the Mac speakers and the room camera records them. Add no sounds the app doesn't play. If a clip is ever synced in the edit, say so on screen.
5. Record every segment twice (two takes, or the same moment from two cameras).
6. Never troubleshoot on camera for more than 2 minutes. Use section 6 and move on.

---

## 1. Wednesday evening (the day before)

- [ ] **Print** in Chrome (Cmd+P): `consent.html` x2 (A4, Margins Default), `card.html` x2 (A4, Margins None, **Background graphics ON**), `results-sheet.html` x1 (A4 **Landscape**). Open them from Finder; the card's creature pictures load from `tv/src/assets/art/`.
- [ ] **Give the parent the consent form tonight** (photo or paper) so they can read it calmly. Tell them: no faces, first names only, the video is public on YouTube.
- [ ] Check the 2026 hackathon rules for anything about minors in videos (open item from the playbook).
- [ ] **Settle the live picture** (section 1.1). This is the one blocker.
- [ ] **Restart the Mac** (frees swap and disk). After the restart, do not open Unity, Blender, Docker or a second VVD. No soaks on the VVD on Thursday.
- [ ] Charge: Mac (keep it plugged in), the room-camera phone, your handheld phone, the clock phone, the kids' controller phones. Free 10 GB on each filming phone.
- [ ] Camera settings on the filming phones: 1080p (or 4K if space), **30 fps**, landscape. Lock focus and exposure on the TV once framed.
- [ ] Pack: white A4 paper (20 sheets), thick black markers (one per kid), crayons, tape, a tripod or a stack of books for the room camera, a second stand for the clock phone, the printouts, two pens.

### 1.1 The live picture (blocker: the family must see the race on a screen)

The VVD runs headless (`--no-gui`), so nothing on the Mac shows the game live today: `remote.sh shot` and `screenrecord` only write files. Pick the first option that works on Wednesday night:

| Option | How | Status |
|---|---|---|
| A. Live view in `video/capture.sh` | Ask the video engineer whether `capture.sh` has a live preview window. Put it full screen on the TV (HDMI or AirPlay from the Mac). | Ask first. |
| B. VVD window | `vega virtual-device stop`, then `vega virtual-device start --timeout 300` (no `--no-gui`). If the window opens, mirror the Mac to the TV over HDMI and make the window full screen. | Crashed on boot on 20 Oct (`FRICTION_LOG.md` #1). Try once after the restart. If it says "Deadline reached", go back to `--no-gui`. |
| C. Screenshot slideshow | The emulator writes a 1920x1080 screenshot in about 0.11 s (10 in 1.13 s, measured 21 Oct), so a page that keeps showing the newest one gives a live picture of roughly 5 to 8 fps. Choppy but playable for a party race. | Not built. An agent can add it to `video/capture.sh` in about 30 min; test it alongside `screenrecord`. |

If nothing works by Wednesday night, the family can't play the race live. Note it before Thursday morning.

---

## 2. Thursday morning: setup (start 2 hours before the family arrives)

### 2.1 Terminal tabs

Open 4 tabs in Terminal. In **every** tab paste:

```sh
cd ~/Desktop/Sketchlings && source ~/vega/env
key()   { tv/scripts/remote.sh "$@"; }   # key select | up | down | left | right | back | menu | playpause [count]
vrec()  { mkdir -p ~/Desktop/sketchlings-footage/vvd && adb -s emulator-5554 emu screenrecord start --fps 30 --bit-rate 8M ~/Desktop/sketchlings-footage/vvd/"${1:-take}"-$(date +%H%M%S).webm && echo "REC ${1:-take}: stops by itself after 3 min"; }
vstop() { adb -s emulator-5554 emu screenrecord stop; ls -t ~/Desktop/sketchlings-footage/vvd | head -1; }
```

- Tab 1: VVD and builds. Tab 2: server (leave it running). Tab 3: keys and recording. Tab 4: `caffeinate -dis` (keeps the Mac and screen awake; Ctrl-C at the end).
- **There is no physical remote on the VVD.** You are the remote: `key select` is OK, `key back` is Back. Never film a fake remote.
- `adb emu screenrecord` stops by itself after **180 s** and records no sound. Start one clip per segment: one per scan-to-reveal, one per race (a race plus Results fits in 3 minutes).

### 2.2 VVD (tab 1)

```sh
vega virtual-device status                      # {"running":true,...} means it is up
vega virtual-device start --no-gui --timeout 300 # only if it is not running (boots in about 10 s)
adb devices                                     # must list: emulator-5554  device
```

### 2.3 Final builds (tab 1), only after the last TV commit of the morning

A backup copy with sound off (for backup race takes only), then the real build with sound on, installed and launched:

```sh
MUTE=1 tv/scripts/vbuild.sh release && cp tv/build/sketchlings_aarch64.vpkg ~/Desktop/sketchlings-footage/sketchlings-MUTE.vpkg
tv/scripts/vbuild.sh release --run
```

To switch builds later (each command installs and launches):

```sh
vega run-app ~/Desktop/sketchlings-footage/sketchlings-MUTE.vpkg com.starfungames.sketchlings.main -d VirtualDevice   # sound off
vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice                      # sound on (the playtest build)
```

### 2.4 Server with the HTTPS link (tab 2)

```sh
scripts/tunnel.sh 2>&1 | tee -a notes/playtest-$(date +%Y%m%d).log
```

Check the output says all three:
- `Phones join at https://<words>.trycloudflare.com/j/<CODE>` (phones get HTTPS, so "Enable shouting" works),
- `Personas: Claude (claude-opus-5-5), offline fallback on any error` (if it says "offline generator", the key is missing from `server/.env`),
- `Voices: Kokoro-82M on this Mac`.

The log file is git-ignored (`*.log`) and is where the scan times come from later. The link changes every time the tunnel restarts; the TV's QR code shows the current one after Home, then Start party.

### 2.5 Live picture

Set up the option chosen in 1.1. Check from the couch: the creatures and the room code are readable.

### 2.6 Real-phone smoke test (one iPhone and one Android, about 30 min)

The phone app has never run on a real phone. Do this before the kids arrive. On the TV: `key select` on Start party.

| # | Test | iPhone | Android |
|---|---|---|---|
| 1 | Scan the QR on the TV: the join page opens over **https**, name + age group, you appear in the Lobby | ☐ | ☐ |
| 2 | "Snap my drawing" opens the camera sheet (camera, not only the photo library) | ☐ | ☐ |
| 3 | **Portrait** photo of a paper drawing: the cut-out preview is upright, not on its side | ☐ | ☐ |
| 4 | Snap a crayon drawing in **living-room light** where the kids will sit: clean cut-out, no shadow blob | ☐ | ☐ |
| 5 | Time it: photo to creature ready on the TV, ___ s / ___ s | ☐ | ☐ |
| 6 | Start the show, race: tap runs, swipe up jumps, ROAR works; **"Enable shouting"** appears, the mic prompt appears, a loud ROAR triggers it | ☐ | ☐ |
| 7 | The creature's intro voice comes out of the Mac speakers on the Reveal | ☐ | ☐ |

If the cut-out is sideways (test 3), fix it now: the fix goes in `phone/src/scan.ts` (apply the EXIF orientation before the cutout), about 20 minutes, then rebuild the phone app (`cd phone && npm run build`) and restart tab 2.

### 2.7 Backup takes before the family (twice each)

These protect the video if the live session goes wrong. Fake phones join, upload a drawing and race (`tv/scripts/fake-phones.mjs`):

1. TV: `key back` until Home, `key select` (Start party). Read the 4-letter room code from the TV.
2. Tab 3: `node tv/scripts/fake-phones.mjs <CODE> 3`. Wait until the Lobby shows 3 creatures ready.
3. `vrec backup-race`, then `key select` (Start the show), `key select` per Reveal card, race, Results. `vstop`.
4. `key select` on Play again for the second take (`vrec backup-race` first).
5. Switch to the MUTE build (2.3), repeat steps 1 to 4 once, then switch back to the sound build.
6. Check the clips play: `open -a "Google Chrome" ~/Desktop/sketchlings-footage/vvd/<file>.webm` (QuickTime can't play webm).

### 2.8 Cameras and sound

- **Room camera** (static, on the tripod, runs the whole session): behind or beside the couch, so it sees hands, phones and the TV, and **no faces**. Close enough to the Mac to hear the creature voices clearly. Mac volume high, output = Mac speakers (not AirPods).
- **Clock phone**: a spare phone in stopwatch mode, propped next to the TV inside the room camera's frame. It is the visible clock for the scan-to-reveal take and the timer for every scan (start, Lap, stop).
- **Handheld** (your phone): close-ups of hands, paper and phones.
- Test: play a Reveal (any creature), record 20 s on the room camera, listen back. You must hear the creature's voice.

### 2.9 Last: reset the Hall of Fame (only after the last soak or test, right before the family plays)

The server keeps the hall in memory, so stop it first:

1. Tab 2: **Ctrl-C** (stops the tunnel and the server).
2. Tab 1:
   ```sh
   lsof -tiTCP:8787 -sTCP:LISTEN >/dev/null && echo "Server still running: Ctrl-C it first" || mv server/data server/data.bak-$(date +%Y%m%d-%H%M)
   ```
   Nothing is deleted; to undo, stop the server and `mv` the folder back. `server/data.bak-*` is **not** git-ignored, so never `git add -A` or `git add .` while it is there.
3. Tab 2: start the server again (the 2.4 line). New link.
4. VVD-only takes, twice each (they don't add creatures to the hall):
   - `vrec dpad`, then on Home: `key right`, `key right`, `key left`, `key left` (focus glow moving across the tiles), `key right`, `key select` (Demo party), `key select` (Start the show), `key select` through the Reveal cards, then let the race run (in the race `key select` = run for player 1, `key up` = jump, `key playpause` = ROAR). `vstop`.
   - **3 s of the perf overlay**: in a demo race, `vrec overlay`, `key menu`, wait 3 seconds, `key menu`, `vstop`. (Film this only once the relabelled overlay, judge-panel item #10, is in the build.)
5. TV: `key back` until Home. Leave it on Home.
6. Tab 1: `scripts/preflight.sh` must end with **ALL PASS**. Fix any FAIL with the hint it prints, then run it again.

---

## 3. The session (30 to 45 minutes)

Your jobs: the Mac (keys and `vrec`), the handheld camera, the results sheet. Ask the parent to jot down good quotes, and to race as a Grown-up.

What to tell the kids, once: "Draw the most amazing creature you can imagine. Make it big and use the thick marker. Then your phone brings it to life on the TV, and you race it!" After that, don't coach the controls. Watching what they figure out is part of the test.

| Clock | What happens | TV (tab 3) | Record |
|---|---|---|---|
| 0:00 | Hello, consent form read together and signed. Ask each child if they're happy to be filmed. Write names, ages and ticks on the sheet. | Home | Nothing yet |
| 0:05 | **Drawing.** Card on the table. Each kid draws **two** creatures; the second waits face-down for round 2. Names on the back. | Home | Handheld: hands drawing (shots 1, 2) |
| 0:15 | Write the time, **Start party**. Everyone scans the QR, types a first name, picks the age group (check each one), parent joins as Grown-up. | `key select` | Room camera rolling from here to the end |
| 0:17 | **Scans.** The other kids snap first (time each one). The youngest (or hero) kid snaps last, for the unbroken take. | Lobby | `vrec scan-1` before the hero snaps (shot 4) |
| 0:21 | **Start the show**, Reveal each creature (voices play), race 1, Results. Write the first-race time. | `key select` per card | `vstop`, then `vrec race-1` at the last card |
| 0:25 | **Races 2 to 4**: Play again goes straight into a new race with the same creatures. Fill the race row while Results shows. | `key select` on Play again | `vrec race-N` before each, `vstop` after Results |
| 0:32 | **Round 2**: Back to the Lobby. Each kid taps "Draw a new one" on their phone and snaps their second drawing. Second take of the scan-to-reveal. | `key back` | `vrec scan-2` (shot 4, take 2) |
| 0:35 | **Races 5 to 7**, same as above. | `key select` | `vrec race-N` |
| 0:42 | **Hall of Fame tour**, then 3 questions: "What's the best part?", "What was hard?", "Do you want to play again tomorrow?" Parent: "Would you have this on your TV? Anything that worried you?" | `key back` to Home, `key right` x2, `key select` | `vrec hall` (shot 9), room camera for the answers (voices, no faces) |

Five or more races in about 30 minutes works because: the drawing happens before Start party; all scans happen in one batch; Play again skips the Lobby and the Reveal; new drawings come in only once (round 2); the parent and the sheet never hold up the next race; any problem gets 2 minutes, then section 6.

---

## 4. Shot list (no faces in any shot; get each one twice)

| # | Shot | Video slot (playbook 6) | Camera | Twice by |
|---|---|---|---|---|
| 1 | Hands finishing a creature, close-up from above, thick marker | 0:00-0:06 | Handheld | Two kids, or two angles |
| 2 | The drawing held up at chest height, framed from the shoulders down; the child says what it's called and why it's the best (ask, don't script) | 0:00-0:06 | Handheld | Ask again for the round-2 drawing |
| 3 | Over the shoulder: the phone screen and the paper as the photo is taken, then "Bring it to life!" | 0:06-0:12 | Handheld behind the child | Every scan is a chance |
| 4 | **MUST: one unbroken scan-to-reveal take, clock phone visible, the wait left in**: snap, processing, ready in the Lobby, Reveal with the creature's voice from the Mac | 0:30-0:55 (Take A) | Room camera + `vrec scan-N` | Round 1 and round 2 |
| 5 | **MUST: "drew wings, WINGS! floats over the blot"**: a winged creature's race with the WINGS! pop | Race section | `vrec race-N` + room camera | Two races with that creature |
| 6 | The race wide: phones in hands, tapping and swiping, TV in frame, boost badges visible | 0:55-1:30 (Take B) | Room camera + `vrec race-N` | Every race |
| 7 | **MUST: the youngest winning** | 0:55-1:30 | Room camera + `vrec race-N` | Every race is recorded; mark the wins on the sheet |
| 8 | Reactions: hands in the air, cheering, the podium and winner's voice line | 1:30-1:40 | Room camera, handheld on hands | Several races |
| 9 | Hall of Fame: D-pad across the kids' creatures ("Saved. Still here tomorrow night.") | 1:30-1:40 | `vrec hall` | End of session, and Friday (section 8) |
| 10 | **MUST: remote-only D-pad on Home, then Demo party** | 1:40-1:55 | `vrec dpad` (VVD only) | Done in setup 2.9, twice |
| 11 | **MUST: 3 s of the honest perf overlay** | Tech section | `vrec overlay` (VVD only) | Done in setup 2.9, twice |

The VVD clips have no sound. The creature voices in the video come from the room camera, which heard the Mac speakers.

---

## 5. What to measure and where to write it

| Measure | How | Results sheet |
|---|---|---|
| Time from Start party to the first race | Clock time when you press Start party and when the first 3-2-1 starts (drawings are already done, so say "with drawings ready") | Session, headline 1 |
| Median snap-to-creature | Server log `[scan] ... upload->sketchling <ms>` lines, command in section 7 | Scans, headline 2 |
| Snap to TV as the family felt it | Clock phone: start at the photo, Lap at "Bring it to life!", stop when the creature's picture appears in its Lobby chip | Scans, headline 3 |
| Re-snaps needed | Count extra photos per drawing | Scans, headline 4 |
| Eyes placed correctly, X of Y | Look at each Reveal card: googly eyes on the drawn eyes, none floating off | Scans, headline 5 |
| Ability matched the drawing, X of Y | The Reveal sticker (for example "Wide wings → Flies over ink blots!") against the paper | Scans, headline 6 |
| Races, winner, youngest won with the boost | Fill the row while Results shows | Races, headlines 7 and 8 |
| Youngest played without adult help | Watch the youngest's hands: did a grown-up hold or tap their phone? | Races, headline 9 |
| Unprompted "again!" | A tally mark each time a kid asks to play again without being asked | Observations, headline 10 |
| Quotes | Exact words and the clock time (one kid, one parent at least) | Quotes, headlines 11 and 12 |
| One design change the kids caused | Watch for the thing that trips them up most (a control they can't find, text too small, a wait that feels long). Fix that one thing tonight, commit it, write what you saw and what changed | One change, headline 13 |

---

## 6. If something breaks

| Symptom | Do this |
|---|---|
| Countdown stuck on "3", nothing moves (the platform freeze, `notes/tv.md` F4) | Note the time on the sheet. `key back` (the system closes the app), then reinstall and launch: `vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice`. Home, Start party: new room, so the phones scan the QR again and re-snap their drawings. |
| VVD gone (`key` or `vrec` fail, `vega virtual-device status` says `"running":false`) | `vega virtual-device start --no-gui --timeout 300` (about 10 s), then the `vega run-app` line above. Run `scripts/preflight.sh` to see if the Mac is short of memory. |
| Key presses don't arrive | Unity's adb (F6): quit Unity, `adb kill-server && adb start-server`, `adb devices`. |
| Phones can't open the page | Look at tab 2. If the tunnel died: Ctrl-C, run the 2.4 line again, TV Home, Start party (new QR), phones rejoin. |
| No internet at all | Tab 2: Ctrl-C, then `cd server && bun run start 2>&1 \| tee -a ../notes/playtest-$(date +%Y%m%d).log`. Phones must be on the same Wi-Fi; the QR shows the Mac's LAN address. No shouting (the ROAR button still works) and offline personas only: fine for playing, but don't use offline creatures in the video. |
| "Hmm, I can't see a drawing" or a messy cut-out | Re-snap closer, flat, in better light; go over thin lines with the marker. Count the re-snap. Last resort: "Draw on screen instead". |
| A creature took over 12 s, or the log says `using offline persona` | It fell back to the offline generator. Mark "offline" in the scan row and keep playing; keep that creature out of the video. |
| No creature voice from the Mac | Check the Mac volume and output device. Keep playing and note it; never fake it in the edit. |
| Everything else broken: **demo party, remote only** | TV Home, `key right`, `key select` (Demo party), `key select` (Start the show), `key select` through the Reveal cards. The remote plays for player 1 (OK = run, Up = jump, Play/Pause = ROAR); the other lanes are bots, and once the hall has 2 or more creatures they are the kids' own. Kids take turns on the Mac keyboard with the loop below (Space = run, w = jump, r = ROAR, a/d = left/right, b = back, q = quit). |

Keyboard loop for the demo party (tab 3; about 50 ms per key press):

```sh
bash -c 'cd ~/Desktop/Sketchlings; echo "SPACE=run  w=jump  r=ROAR  a/d=left/right  b=back  q=quit"; while IFS= read -rsn1 k; do case "$k" in " ") tv/scripts/remote.sh select;; w) tv/scripts/remote.sh up;; r) tv/scripts/remote.sh playpause;; a) tv/scripts/remote.sh left;; d) tv/scripts/remote.sh right;; b) tv/scripts/remote.sh back;; q) break;; esac; done'
```

---

## 7. After the session (same evening)

1. `vstop` if a clip is running. **Don't reset the hall**: the kids' creatures are needed for Friday's shot. Leave the server running or stop it with Ctrl-C; the hall survives either way.
2. Copy the phone footage to `~/Desktop/sketchlings-footage/phone/` (AirDrop) and back up the whole `~/Desktop/sketchlings-footage/` folder to a second drive. Footage and photos of signed forms never go in the repo.
3. Numbers from the server log (tab 1):
   ```sh
   L=$(ls -t notes/playtest-*.log | head -1)
   grep '\[scan\]' "$L"     # one line per scan: machine time and claude/offline
   awk '/\[scan\].*upload/ { if (match($0, /[0-9]+ ?ms/)) print substr($0, RSTART, RLENGTH) + 0 }' "$L" | sort -n | awk '{a[NR]=$1} END { if (NR) printf "%d scans, median %.1f s (fastest %.1f, slowest %.1f)\n", NR, (NR%2 ? a[(NR+1)/2] : (a[NR/2]+a[NR/2+1])/2)/1000, a[1]/1000, a[NR]/1000 }'
   grep -oE 'answered in [0-9]+ ms' "$L" | awk '{s+=$3; n++} END { if (n) printf "%d Claude answers, average %.1f s\n", n, s/n/1000 }'
   grep -oE '≈ \$[0-9.]+' "$L" | awk -F'$' '{s+=$2; n++} END { if (n) printf "%d scans, $%.3f total, $%.4f per creature\n", n, s, s/n }'
   grep -c 'using offline persona' "$L"   # how many fell back to offline
   ```
   The `[scan]` lines are being added to the server separately; if your log has none, use the stopwatch column.
4. Creatures made, with ability and eye count:
   ```sh
   curl -s localhost:8787/api/hall-of-fame | python3 -c 'import json,sys; h=json.load(sys.stdin); print(len(h), "creatures"); [print(s.get("artist","?"), "|", s["name"], "|", s["ability"]["feature"], "->", s["ability"]["kind"], "| eyes:", len(s.get("eyes") or [])) for s in h]'
   ```
5. Type the paper sheet into `results-sheet.md`. Copy the headline numbers into `docs/IMPACT.md` ("Evidence: family playtest") and the playtest TODOs in `docs/DEVPOST.md`. "The youngest won X of Y races" goes on the video's Impact card.
6. Make the one design change, commit it, and fill "One change the kids caused".
7. For the video engineer: a list of the best takes per shot (shot number, file name, clock time).
8. Before the upload: watch every frame for faces (cut or blur), and check every child against their consent tick (voice muted, or out entirely).

---

## 8. Friday morning: "Still here tomorrow" (shot 9, take 2)

```sh
vega virtual-device status                                                                  # {"running":false}? then:
vega virtual-device start --no-gui --timeout 300
scripts/tunnel.sh 2>&1 | tee -a notes/playtest-$(date +%Y%m%d).log                          # tab 2
vega run-app tv/build/sketchlings_aarch64.vpkg com.starfungames.sketchlings.main -d VirtualDevice
```

Then `vrec hall-friday`, Home, `key right` x2, `key select`, move across the kids' creatures with `key right` a few times, `vstop`. Twice. The server was restarted and the creatures are still there: that is the point of the shot.

---

## Remote keys (tab 3)

| Key | Command | Does |
|---|---|---|
| OK | `key select` | Press the focused button; in the demo race, run |
| Arrows | `key up` / `key down` / `key left` / `key right` | Move focus; in the demo race, Up = jump |
| Back | `key back` | Back (from Reveal, race or Results in a party: to the Lobby) |
| Menu | `key menu` | In a race: perf overlay on or off |
| Play/Pause | `key playpause` | In the demo race: ROAR |
| Screenshot | `key shot ~/Desktop/sketchlings-footage/check.png` | 1920x1080 still |

TV path: Home tiles left to right are Start party, Demo party, Hall of Fame, How to play (focus starts on Start party). Lobby: "Start the show!" once a drawing is ready. Reveal: "Next", then "Race" on the last card. Results: "Play again" (focused) and "Home".
