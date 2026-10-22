# Sketchlings demo video kit

Everything to cut the under-3-minute demo video. The middle of the video is the kids' playtest of 23 Oct.
`./build.sh` turns footage, narration, cards and music into a 1080p30 H.264 MP4 at -14 LUFS. Every clip in `edl.json`
is a named footage slot; a slot without its file becomes a labelled placeholder, so a draft always builds.

```
video/
  build.sh, build.mjs   the edit: edl.json -> out/*.mp4   (./build.sh --slots lists the footage slots)
  edl.json              the timeline: segments (slots), overlays, captions, cues, music
  capture.sh            records the Vega Virtual Device screen to clips/<name>.webm
  cards/                cards and overlays as HTML (one shared style.css) + rendered PNGs, cards/render.sh
  clips/                footage, one file per slot (not in git)
  vo/                   your narration (not in git)
  voice/                creature voice clips from the server, only for the muted fallback (not in git)
  music/                CC0 tracks + CREDITS.md
  out/                  renders, out/cache (rendered captions, tags, slates) (not in git)
```

Needs ffmpeg/ffprobe, node and a headless Chrome. `cards/render.sh` uses Playwright's `chrome-headless-shell` when it
is installed (it is on this Mac: about 0.4 s a shot, exits clean, same PNGs as Chrome). It falls back to the full
Google Chrome app, which leaked about 1.4 GB per launch here: then render few cards at a time. `CHROME=...` overrides.

## Tomorrow's edit in 5 steps

For Fri 23 Oct, 3-7 pm. Mac muted while scrubbing (house rule); listen to the draft on headphones.

1. **Drop the footage into its slots.** `./build.sh --slots` lists every slot: its file, what it must show, its in
   point, and `ok`, `MISSING` or `optional`. For each slot, trim the camera file to the slot (QuickTime: Edit > Trim,
   save as `clips/<slot file>`; `.mov` works as well as `.mp4`), or point the slot's `src` at the whole file and put
   the in point in `ss`. VVD recordings from `capture.sh` already carry their slot names; one recording can feed
   several slots (`kids-r1-race1`: the race and its podium). Frame at time T, to find in points:
   `ffmpeg -ss T -i clips/<file> -frames:v 1 /tmp/f.png`.
2. **Set the numbers in `edl.json`.** `ss` per slot; both `ss` of `kids-race` (Syncing below), then `ss` of
   `kids-results` and `kids-again` (the podium, the OK on Play again: same recording); `crop` for `open-race` and
   `ab-*` if the creature is small; `speed` of `open-card` (its guide has the formula; the build writes "Sped up Nx"
   on screen by itself); `audioLag` once for all VVD segments (Race sound below).
3. **Type the words.** Every `TBD` in `edl.json`: the playtest tag on `kids-draw` (how many children, their ages) and
   each `say` line, with the exact words and an age ("age 6"), never a name. Delete a `say` line nobody spoke. Then
   the cards: `impact.html` ("Playtest with kids": a real result, or "not yet"), `claude.html` (the cold-open
   creature's real JSON from the Hall of Fame), `note-music.html` (`RACE_HAS_SOUND`); `cards/render.sh <name>` for
   each one you change. Record the narration into `vo/` (table below).
4. **Draft and watch.** `./build.sh out/draft.mp4` (about 3 minutes). It prints the timeline and what is still
   missing. Watch it once: each caption says what is heard, every shot of the VVD's picture has its label, the open
   shows one creature from paper to the ink blot. Fix and rebuild.
5. **Final.** `FINAL=1 ./build.sh` -> `out/sketchlings.mp4`. It refuses missing slots, draft voices and any text still
   saying TBD. A slot you could not film: add `"optional": true` to it and it drops out (`kids-adult`, `remote`,
   `grownups` and `who` already are). Check the printed length (2:54 with every slot, 2:37 without the optional ones;
   the limit is `maxDuration`, 176 s) and loudness (-14 LUFS), then upload (YouTube below).

## Build

```sh
cd video
./build.sh --slots              # every footage slot: file, what it must show, in point, ok / MISSING / optional
./build.sh out/draft.mp4        # placeholders + macOS "say" for missing narration: a timing draft
FINAL=1 ./build.sh              # out/sketchlings.mp4; refuses missing slots, draft voices, TBD text
KEEP=1 ./build.sh               # keeps out/tmp (per-segment clips, the mix) to debug
```

`out/draft-slots.mp4` is the 22 Oct placeholder draft of this timeline (2:54.4, -14 LUFS), every slot a slate.

Per segment: footage scaled to cover 1920x1080 (a short clip holds its last frame), `crop` into the source, `speed`
(silent, always labelled on screen), its own sound (`liveDb`) read `audioLag` seconds later, split screens for one-take
races, overlays, cuts and 0.4 s crossfades. Then narration cues on the timeline, music ducked about 8 dB under anything
heard, two-pass `loudnorm` to -14 LUFS / -1 dBTP, AAC 192k. `_doc` in `edl.json` has every field.

Text on screen comes in three kinds, all from `edl.json`:
- **Narration captions**: every cue with `text` is burned in at the bottom while it plays.
- **`say`** overlays: spoken lines from the footage (kids, teachers), bottom centre, with an optional `who` ("age 6").
- **`tag`** overlays: short labels at the top right ("Race 2: same party, no restart"). A clip with `speed` gets
  "Sped up Nx" automatically.

They render once per text through `cards/text.html` into `out/cache`, like the placeholder slates. A card with
narration shrinks into the top 88 % of the frame and its caption sits in the navy band below, so nothing on the card
is covered. Creature lines need no caption: the TV shows each one in its own speech bubble (Reveal) or on the podium
(Results).

## What the reviews asked for

| Review point | Where the video answers it |
|---|---|
| Open on the transformation, not a disclaimer | 0:00-0:10: the drawing, a real phone snap and cut-out, the ability card, a match-cut to the same creature on the VVD with its own voice, the wing + FLOATS icon, a thumb on the phone, the creature floating over an ink blot. |
| VVD label, a subtle lower-third the whole time | `badge-vvd` ("Running on Amazon's Vega Virtual Device", small, bottom right) on every shot of the VVD's picture, captures and the room TV alike; the split frame carries the same line. The big lower third ("the Fire TV simulator, on a Mac") shows once, on `kids-join`. Nothing claims Fire TV hardware. |
| Big icons, not sentences | Ability stickers are the TV's own icons with one word: FLOATS, ZOOMS, JUMPS, ROARS. |
| Burn in captions | Narration captions are automatic; kids' and teachers' words are `say` lines; creature lines show in the TV's bubble. |
| Time compression labelled | Any clip with `speed` gets "Sped up Nx" from the build; the open's other cuts are hard cuts between shots. |
| The remote in a hand | `remote` slot (optional): only a remote that really drives the VVD through the live view. |
| Metrics after the hook, labelled | KPI and deadlock cards at 2:13-2:32: "VVD observations", "Engineering observations on a simulator, not Fire TV hardware performance", loop rate in ticks/s ("timer-driven, not vsync"), input "Wi-Fi not included". |
| No children in the evidence | 0:10-1:26 is the 23 Oct playtest: join, snap, the ability card, Reveal with voices, race, Results, race 2 without a restart, their own words. |
| Silent race | The phones' race sounds are real (room camera). Music never passes for game sound. |
| Parent gate, AI consent | `grownups` slot (optional, if it ships tonight): AI personas on/off, Clear Hall of Fame. |
| Hold-to-run not sent | `open-input` and `kids-hold` show it. |
| "The youngest can really win" without evidence | Not claimed. The impact card shows the mechanism (+40% speed for 7 and under) and the playtest result only once it exists. |
| Economics | VO "Under two cents a creature"; card "~1.6 cents a creature ($0.0159)" from the 60-run benchmark; price model TBD (your call). |
| Where does Kokoro run? | Architecture card ("on the relay server, offline") and VO ("on our own server"). |
| AI output safety | Claude card ("Asked for 5-year-old-safe output; every field is checked and clamped") and VO. |

## Storyboard

Times with every slot filled (the build prints the real ones). Cold open: no music, real sound only.

| Video | Segment | Picture | On screen | Sound |
|---|---|---|---|---|
| 0:00.0 | open-draw | close-up: the wings drawing, a hand adds the last stroke | | room |
| 0:01.4 | open-snap | the phone snaps it, the cut-out appears | | room (shutter) |
| 0:02.9 | open-card | the phone, sped up: Bring it to life! -> "I saw big wings -> Flies over ink blots!" | "Sped up 4x" | none |
| 0:04.4 | open-reveal | match-cut: the same creature pops out on the VVD | VVD label | its own voice |
| 0:06.4 | open-input | a thumb holds TAP!, swipes up | | the phone's race sound |
| 0:07.4 | open-race | VVD race, zoomed: it floats over an ink blot (WINGS!) | wing + FLOATS, VVD label, caption | game sound -4 dB, VO "What you draw changes how you play." |
| 0:09.6 | kids-draw | kids' hands drawing | tag: the playtest (date, children, ages), caption | room -8 dB, VO hook, music |
| 0:16.6 | kids-join | room: phones scan the QR, names pop into the Lobby | big lower third | room, music |
| 0:21.6 | kids-snap | a child snaps; the cut-out and "Only this cut-out is sent" | "No app install. Cutout runs on the phone." | room, music |
| 0:25.6 | kids-card | phone: "I saw ... -> ..." | the child's words | room, music out |
| 0:29.1 | kids-reveal | room: the Reveal on the TV, its voice, the kids react | VVD label, the kids' words | room |
| 0:36.6 | kids-reveal-tv | VVD: another creature, clean | VVD label | its voice |
| 0:40.6 | kids-hold | a child's thumb holds TAP! | "Hold to run · race sounds from the phone" | phone sounds |
| 0:42.7 | kids-race | split, one take: kids' hands / VVD to the finish | split frame, music note | room + VVD, music -12 dB ducked |
| 1:01.7 | kids-results | VVD podium of that race | VVD label | the winner's line (+ room cheer, optional) |
| 1:06.7 | kids-words1, 2 | two children, their own words | their words, an age | room |
| 1:13.7 | kids-again | VVD: Play again, race 2 lines up | "Race 2: same party, no restart" | VVD |
| 1:18.2 | kids-race2 | room: race 2 | VVD label | room |
| 1:22.2 | kids-adult (optional) | a teacher's first go | their words | room |
| 1:25.7 | remote (optional) | a hand on a remote, the TV focus moves | "Remote keys reach the VVD through the live view" | room |
| 1:28.2 | hall | VVD Hall of Fame, today's creatures | "Saved. Still here tomorrow night.", VVD label | VO modes |
| 1:32.5 | grownups (optional) | VVD Grown-ups behind the parent gate | VVD label | VO |
| 1:38.0 | ab-fly, roll, hop, walk | VVD race moments, one per ability (3 s each) | icon + word, VVD label | VO, game sound -10 dB |
| 1:49.6 | arch, cutout, claude | cards | | VO, music |
| 2:12.9 | kpi, deadlock | cards: VVD engineering observations | | VO, music |
| 2:31.1 | who (optional) | you on camera, or the StarFun logo | | VO, music |
| 2:37.5 | impact | card | | VO, music |
| 2:47.4 | end | card | | CC0 sting |

Total 2:54.4; without the optional slots 2:36.5 (lengthen `kids-race` or `kids-reveal` if that feels short).

## Shot lists

The TV picture is the VVD. Players watch it in the live view (`bun scripts/live-view.ts`, then
http://localhost:8799/, full screen, on a real TV over HDMI if possible), whose keyboard is the remote: arrows, Enter
(OK), Backspace (Back), Space (ROAR). Clean TV footage comes from `./capture.sh <slot name> <seconds>` (max 180 s each,
it refuses a name that exists). Camera phones: landscape, 1080p30 or 4K30, **HDR video off**, focus and exposure
locked on the screen.

### Tonight, 22 Oct: you, your drawings, the VVD (no kids)

D1: a round body with two huge wings spread sideways, two big circle eyes. D2 wheels, D3 long legs, D4 a big chunky
body. Thick dark marker, crayon inside, one per sheet. Claude decides the ability: check each ability card, and never
put a sticker on a creature whose card disagrees.

1. **The open (D1).** Camera close over your shoulder, one recording: the last crayon strokes (`open-draw`), the snap
   and the cut-out (`open-snap`), Bring it to life! until the card shows (`open-card`). On the TV,
   `./capture.sh open-reveal 60` before Start the show (Ctrl-C once D1 has spoken: one recording at a time). Then
   `./capture.sh open-race 150` before Race!: race D1's
   phone with the camera on your thumb (`open-input`: hold to run, swipe up). Want: D1 floating over a blot (WINGS!).
   Measure `audioLag` on `open-reveal` (Race sound).
2. **Abilities (D1-D4).** Four phones (or "Not <name>? Switch player" on fewer), `./capture.sh vvd-races 170`, race;
   repeat as `vvd-races2` until there is a WINGS!, WHEELS!, SPRINGS! and BIG ROAR! (point an `ab-*` slot's `src` at
   the file that has it).
3. **Grown-ups**, if it ships tonight: `./capture.sh vvd-grownups 30`, the parent gate, then the two switches. Don't
   clear the Hall.
4. **Remote** (optional): only if a remote types arrow keys and Enter into the live view (a USB air-mouse remote does;
   check the focus moves). Film the hand and the TV focus moving in one shot. No Fire TV remote as a prop.
5. **You** (optional): `clips/who.mp4`, 7 s on camera without live sound, or the StarFun logo as `clips/who.png`.
6. **Narration** into `vo/` (table below).

### Tomorrow 1-3 pm: the kids' playtest

`docs/playtest/runsheet.md` runs the session (sections 5 and 6 say who films what, and its capture names are the
slots' file names). Its rules hold for the edit: hands, phones, paper and the screen; a child's face only with their
"Face" tick and their voice only with their "Voice" tick (Notes writes the clock time of anything else said on camera,
so it can be cut or muted). The room camera rolls 13:15-14:30; the handheld takes the close-ups. Copy both cameras'
files into `clips/` (or point slots at them).

| Moment (runsheet) | Slot | Source |
|---|---|---|
| Drawing, from above (5.3) | `kids-draw` | handheld |
| Phones scan the QR, names in the Lobby | `kids-join` | room camera |
| The snap, Bring it to life! (over a shoulder) | `kids-snap`, `kids-card` | handheld |
| Reveal: `video/capture.sh kids-r1-reveal 120`, Ctrl-C on the last card, before Race | `kids-reveal-tv` | VVD |
| Reveal with voices and reactions | `kids-reveal` | room camera |
| Each race: `video/capture.sh kids-r1-race1 180` (race2, ...), Ctrl-C after its Results | `kids-race` right, `kids-results`, `kids-again` (start of the next race's file) | VVD |
| Hands tapping in that race, one take | `kids-race` left (`clips/kids-race-cam.mp4`) | handheld |
| A thumb holding TAP!, the phone's sound | `kids-hold` | handheld, any race |
| Cheering at a podium (sound only, optional) | `clips/kids-react.mp4` | room camera |
| Another race | `kids-race2` | room camera |
| Questions 1 and 2 (5.2), only children with a Voice tick | `kids-words1`, `kids-words2` | handheld or room camera, no face |
| Teachers' cold test (4), optional | `kids-adult` | as they ticked |
| Hall of Fame in free play (5.5): `video/capture.sh vvd-hall 20` | `hall` | VVD |
| A child's creature that got wings (optional) | `open-*` instead of tonight's D1 | all three |

The Hall of Fame keeps earlier creatures (runsheet 3.8): move the focus onto the children's. Reinstall the app before
it if it froze on a second visit (runsheet 7, `notes/tv.md` F11).

## Race sound

The VVD recording's own sound is the TV's sound: VVD segments set `liveDb` and `audioLag`. The recorder writes the
sound about 1.5 s late (21 Oct rehearsal). Measure it once: the Reveal's "Meet the Sketchlings!" narrator line starts
on the Reveal's first frame, so

```sh
ffmpeg -i clips/open-reveal.webm -af silencedetect=n=-40dB:d=0.3 -f null - 2>&1 | grep silence_end
```

gives the sound's start; `audioLag` = that time minus the time of the Reveal's first frame. Set it on every VVD
segment. Check a recording carries sound without playing it:
`ffmpeg -i clips/<name>.webm -af ebur128 -f null - 2>&1 | grep ' I:'`.

- The phones make the race sounds (Web Audio, speaker toggle on). The room camera records them; segments with the
  phones in frame keep their sound (`liveDb`).
- The TV race plays the narrator's 3-2-1-GO, ROAR and photo-finish clips. `note-music` says "Race sounds are the
  app's own." while music plays under the race. If the TV's race is silent in the footage (`MUTE=1`), set
  `RACE_HAS_SOUND = false` in `cards/note-music.html` and render it.
- Sound-on build unstable on the VVD (`notes/tv.md` F7, F13): film with `MUTE=1`, drop `liveDb` from the VVD
  segments and lay the voices in as cues with `"note": true` (Voice clips below).

## Capture the VVD

```sh
./capture.sh kids-r1-race1 180   # -> clips/kids-r1-race1.webm, 1920x1080 VP9 30 fps; Ctrl-C stops early
```

It runs `adb -s emulator-5554 emu screenrecord start --time-limit N --fps 30 <abs path>` with Unity's adb (override
with `ADB=...`, `SERIAL=...`), waits for the file and prints its length. Before filming: keep the Mac's memory free
(`notes/tv.md` F5, F12: quit other apps) and use a build from d301384 or later.

What the 21 Oct dress rehearsal showed: the race (about 60 s) is longer than its split (19 s), so the split starts
mid-race at the same moment in both files; OK on Results is Play again, so OK at the finish skips Results; the
recordings carry the app's sound with timestamp gaps (the build fills them) and about 1.5 s of latency (`audioLag`).

**Syncing a split.** The camera and the VVD are recorded separately. Find one moment in both files (a ROAR press and
its ROAR! pop, or the GO and the first taps) and set `"left": {"ss": ...}`, `"right": {"ss": ...}` so both start at
the same moment, 17 s before the first finisher crosses. The split stays one unbroken piece of both recordings.

## Voice clips and narration

Creature voices are in the sound-on recordings. Only for the muted fallback, copy the app's own clips and lay them in:

```sh
curl -s http://localhost:8787/api/hall-of-fame | jq -r '.[] | [.id, .name, .artist, .source] | @tsv'
cp ../server/data/voice/<id>/intro.m4a   voice/<name>-intro.m4a
cp ../server/data/voice/<id>/winLine.m4a voice/winner-win.m4a     # the winner: the name on the podium
```

Add each as a cue with `"note": true` (the build shows "The app's own voice clip, synced in the edit (VVD filmed
muted)") at the frame where the app starts the line, with the line as its `text`.

Narration: record each line as `vo/<name>.m4a` (or `.wav`), any quiet room, phone close to your mouth. Missing lines
are read by macOS `say` in drafts (marked `TTS`). Each line fits its segment at `say`'s pace:

| File | Segment | Line |
|---|---|---|
| `vo/open.m4a` | open-race (2.3 s) | What you draw changes how you play. |
| `vo/hook.m4a` | kids-draw (5.8 s) | Kids draw on paper, and Sketchlings turns each drawing into a talking racer for the whole family. |
| `vo/modes.m4a` | hall (4.1 s) | Remote for menus, phones for racing, paper for creating. |
| `vo/grownups.m4a` | grownups (5.3 s) | Behind a parent gate, grown-ups can switch AI personas off or clear the Hall of Fame. |
| `vo/ab-fly.m4a` | ab-fly (2.9 s) | Draw wings, and it floats over the ink. |
| `vo/ab-roll.m4a` | ab-roll (2.9 s) | Draw wheels, and it zooms on flat ground. |
| `vo/ab-hop.m4a` | ab-hop (2.9 s) | Draw long legs, and it jumps higher. |
| `vo/ab-walk.m4a` | ab-walk (2.9 s) | Draw a big body, and its ROAR clears the ink. |
| `vo/arch.m4a` | arch (8.2 s) | Phones open a web page, no install. Our Bun relay links them to the TV and voices every creature with Kokoro, on our own server. |
| `vo/cutout.m4a` | cutout (6.7 s) | Our open-source library, doodle-cutout, turns a phone photo into a clean sticker, right in the phone's browser. |
| `vo/claude.m4a` | claude (8.7 s) | Claude reads the drawing and decides how it plays. Its prompt asks for five-year-old-safe answers, and every field is checked before the TV sees it. |
| `vo/kpi.m4a` | kpi (8.7 s) | Engineering observations on the virtual device, not Fire TV hardware: first frame in two thirds of a second, memory well under the limit. |
| `vo/deadlock.m4a` | deadlock (9.7 s) | Races sometimes froze at the start; the crash dump showed a watchdog deadlock. After the fix, fifty-two starts on the virtual device, zero freezes. |
| `vo/who.m4a` | who (6.5 s) | I'm a solo developer at StarFun Games in Sri Lanka. I built this so our screen time starts with crayons. |
| `vo/impact.m4a` | impact (9.9 s) | It's for families with kids four to ten. Little ones race with a visible speed boost. Under two cents a creature, first names only, no accounts. |

If a line changes, change the cue's `text` too: the caption is the `text`.

## Cards

Edit the HTML in `cards/`, then `cards/render.sh <name>` (or no name for all). Each card shares `cards/style.css`
(notebook paper, Baloo 2 and Patrick Hand, both OFL, licences in `cards/fonts/`; neither font has an arrow, so arrows
are drawn: `svg.to`). The build renders a card only when its PNG is missing; after editing one, render it yourself.

- Full cards: `architecture`, `cutout`, `claude`, `kpi`, `deadlock`, `impact`, `end`.
- Transparent overlays: `badge-vvd` (the VVD label), `lower-third`, `sticker-fly/roll/hop/walk` (the TV's ability
  icons from `tv/art-src/svg`, copied to `cards/img/`), `caption-phone`, `caption-saved`, `note-music`, `note-synced`,
  `split-frame`. Labels sit at the top, spoken captions at the bottom centre, the VVD label bottom right, notes bottom
  left.
- Built per text by the build: `text.html` (captions and tags), `placeholder.html` (slates).
- Not in the timeline: `title`, `super` (for a thumbnail), `caption-think`, `caption-offline`, `clock`.

Still to fill (they say **TBD** on screen):
- `impact.html`: "Playtest with kids: TBD" (a real result from tomorrow, or "not yet") and "Price model: TBD".
- `claude.html`: shows Captain Bleep, a real `source: "claude"` persona (walk). After tomorrow, paste the cold-open
  creature's real JSON from the Hall of Fame into `P`, copy its sprite to `cards/img/` and set `SPRITE`. Never type a
  persona by hand.
- `note-music.html`: `RACE_HAS_SOUND` (Race sound).

## Honesty rules for the edit

- Each split is one unbroken recording; every other cut is a visible cut. A sped-up shot says so (the build adds it).
  No faked pipeline steps.
- Children: hands, phones, paper and the screen; a face only with that child's "Face" tick, a voice only with their
  "Voice" tick (runsheet rule 2). In captions an age, never a name. Caption only words you heard clearly, as said.
- Every shot of the VVD's picture carries the VVD label; every device number on screen says it was measured on the
  Vega Virtual Device. Never call the VVD Fire TV hardware.
- A remote on screen must really drive the VVD (keys into the live view). Never a Fire TV remote as a prop.
- Guests are bot-run: never caption a bot lane as a child or say how many play unless every lane is a person.
- Playtest results only as measured (counts, ages, what happened); "not yet" beats a guess. Don't claim the youngest
  wins until a playtest shows it.
- No Alexa beat, no sports or film clips, no third-party logos.
- No sound the app doesn't make. Music is CC0 only (`music/CREDITS.md`), ducked under game sound, noted on screen while
  it plays under gameplay (`note-music`) and credited on the end card. `music/HappyClappyLoop.wav` is not in git:
  re-download it from the URL there.
- A clip copied from `server/data` is laid in, and gets the on-screen note (any cue with `"note": true`).

## YouTube

**Title:** Sketchlings: kids' drawings come alive and race on Fire TV (Vega OS)

**Description:**

> Sketchlings turns a child's crayon drawing into a talking racer on the TV. Draw on paper, snap it with a phone,
> and watch it peel off the page, get a name, stats and an ability from Claude vision, speak in its own voice, and race
> the whole family. What you draw changes how you play: wings float over ink, wheels zoom, long legs jump, a big body
> ROARs. Filmed at our playtest with TBD children aged TBD on 23 Oct 2026.
>
> Built for Fire TV on Vega OS with React Native for Vega; shown running on Amazon's Vega Virtual Device (the Fire TV
> simulator), not on Fire TV hardware. Phones join with a QR code, no app install, and race with taps, holds, jumps and
> ROAR; the remote runs the menus.
>
> How it works: a phone web app cuts the drawing out with doodle-cutout (our open-source MIT library), a small Bun
> relay links the phones and the TV over WebSocket, Claude vision writes each creature's persona (asked for
> 5-year-old-safe output, every field checked, an offline generator as the fallback) and Kokoro, running on our own
> server, gives it a voice. Privacy: first names only, no accounts; only the cut-out leaves the phone, and drawings go
> to Claude only to create the character.
>
> Code: https://github.com/Harindulk/sketchlings
> doodle-cutout: https://github.com/Harindulk/doodle-cutout
> Made by StarFun Games.
> Music (CC0, via OpenGameArt.org): "Happy Clappy Loop" by OwlishMedia, "Happy Beat" by burabotti.
>
> 0:00 Draw it, snap it, race it
> 0:10 Playtest with kids
> 1:38 What you draw changes how you play
> 1:50 How it works: doodle-cutout, Claude, Kokoro
> 2:13 On the Vega Virtual Device: observations and the race-start freeze
> 2:38 Who it's for

Chapters follow the timeline with every slot filled; take the times from the final build's printout (YouTube needs
each chapter to be at least 10 s). Fill both TBDs. Upload as Public, in English (contest rules).
