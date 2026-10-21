# Sketchlings demo video kit

Everything to cut the under-3-minute demo video.
`./build.sh` turns real footage, voice clips, narration, cards and music into a 1080p30 H.264 MP4 at -14 LUFS.
Anything not filmed yet becomes a labelled placeholder, so the pipeline runs end to end today.

```
video/
  build.sh, build.mjs   the edit: edl.json -> out/*.mp4
  edl.json              the timeline (segments, overlays, cues, music)
  capture.sh            records the Vega Virtual Device screen to clips/<name>.webm
  cards/                cards and overlays as HTML (one shared style.css) + rendered PNGs, cards/render.sh
  clips/                drop footage here (not in git)
  voice/                creature voice clips from the server (not in git)
  vo/                   your narration (not in git)
  music/                CC0 tracks + CREDITS.md
  out/                  renders (not in git)
```

Needs ffmpeg/ffprobe, node and Google Chrome (cards and placeholder slates are rendered with headless Chrome).

## Build

```sh
cd video
./build.sh out/draft.mp4        # placeholders + macOS "say" for missing narration: a timing draft
FINAL=1 ./build.sh              # out/sketchlings.mp4; refuses to run while anything is missing
KEEP=1 ./build.sh               # keeps out/tmp (per-segment clips, the mix) to debug
```

It prints the timeline with each segment's status (`footage`, `card`, `PLACEHOLDER`, `TTS ...`), the list of files
still to drop in, and the result: duration, codec, integrated loudness, size. It fails if the timeline or the output
is longer than `maxDuration` (174.5 s). One build takes about 2 minutes; `out/tmp` is deleted afterwards
(about 100 MB with placeholders, a few hundred MB with real footage).

What it does: one clip per segment (footage scaled to cover 1920x1080, a short clip holds its last frame), split
screens for the two unbroken takes (family left, VVD right, running clock), overlays with short fades, cuts and 0.4 s
crossfades as `edl.json` says, voice/VO cues placed on the timeline, music beds ducked about 8 dB under anything
spoken (room audio and cues), then a two-pass `loudnorm` to -14 LUFS / -1 dBTP and AAC 192k.

`out/draft-placeholder.mp4` is the all-placeholder draft from 21 Oct (2:50.5, -14.0 LUFS); `out/draft-vvd.mp4` is the
21 Oct dress rehearsal with real VVD clips (family/phone shots still placeholders), frames in `out/frames/`.

## Capture the VVD

```sh
./capture.sh takeB-vvd 60      # -> clips/takeB-vvd.webm, 1920x1080 VP9 30 fps; Ctrl-C stops early
```

It runs `adb -s emulator-5554 emu screenrecord start --time-limit N --fps 30 <abs path>` with Unity's adb (the one
`notes/tv.md` F6 says to use while Unity is open; override with `ADB=...`, `SERIAL=...`), waits for the file and
prints its length. The recording also carries an audio track; the build ignores it unless the segment sets `liveDb`.

Before filming on the VVD (from `notes/tv.md`): build the TV app with `MUTE=1` (F7), keep the Mac's memory free (F5),
and clear `server/data` so the Hall of Fame and the demo party show real creatures, not soak-test ones. Use a build
from commit 647a6f0 or later (no "Alexa, select" line on Home, "press ROAR" instead of "shout").

**Dress rehearsal, 21 Oct** (demo party, remote only, sound-on build d301384). Whole sessions were recorded with
`adb emu screenrecord` and the named clips cut out with `ffmpeg -ss <t> -i in.webm -t <d> -c copy` (keyframes every
~0.44 s); each segment's `ss` in `edl.json` picks the window. What it showed:
- **The race doesn't fit take B.** GO to the first finisher took ~53 s on the app's race clock (~60 s wall), and takeB
  is 33 s, so the VVD side shows the last 33 s (from ~0:28) and no countdown. Faster phone tapping helps, but decide
  before Thursday: start take B mid-race (same moment in both files) or give it more time. The app's clock (0:41)
  then disagrees with the edit's take clock (0:15), and it runs ~12 % slow under VVD load.
- Results: Play again sits above Home (Down/Up moves focus), and OK on Results is Play again, so pressing OK at the
  finish skips the Results screen. `vvd-results.webm` is one recording: podium (`results`, ss 1.4), then a cut to the
  Hall of Fame further in (`hall`, ss 20).
- The recordings carry the app's audio, with timestamp glitches and ~1.5 s of latency: keep the voice cues.
- The Hall of Fame froze on the second visit of a session (picture and keys, `notes/tv.md` F11): film it soon after
  an app restart.

## Where footage goes

Names are what `edl.json` expects; another extension works too (`.mov`, `.mp4`, `.webm`, `.wav`, `.m4a` ...).
Phones: landscape, 1080p or 4K at 30 fps, **HDR video off** (iPhone: Settings > Camera > Record Video > HDR Video), or
the colours wash out in the H.264 export. Keep the room sound on.

| File | What to film | Sound |
|---|---|---|
| `clips/hook.mp4` | Close-up: a child's hand finishes a crayon creature, holds it up to the camera | the child's own words (name, why it's the best), not scripted |
| `clips/snap.mp4` | Over the shoulder: the phone snaps the paper | room |
| `clips/vvd-alive.webm` | VVD: the creature peels off the page, eyes land, blink (`./capture.sh vvd-alive 15`) | `voice/hero-intro.m4a` |
| `clips/vvd-home.webm` | VVD: Home, focus moving across the tiles | VO hook |
| `clips/who.mp4` | You on camera (or the StarFun logo over the playtest couch) | your voice, live (or `vo/who.m4a`) |
| `clips/takeA-family.mp4` + `clips/takeA-vvd.webm` | **Take A, unbroken**: wide static couch shot; a kid scans a drawing; processing; reveal card | room + creature voice |
| `clips/takeB-family.mp4` + `clips/takeB-vvd.webm` | **Take B, unbroken**: countdown to finish; phones in kids' hands; tap, jump, ROAR; boosts; the youngest wins | room (the race itself is silent in the app) |
| `clips/vvd-results.webm` | VVD: podium, then the Hall of Fame | `clips/react.mp4` audio, if any |
| `clips/react.mp4` | optional: the kids reacting (only its sound is used) | room |
| `clips/remote.mp4` | Close-up of the remote, D-pad presses | VO modes |
| `clips/vvd-playagain.webm` | VVD: D-pad focus across Results to Play again | |
| `clips/vvd-demo.webm` | VVD: Demo party, remote only, no phones | |

**Syncing a take.** Camera and VVD are recorded separately. At the start of each take, press a remote button in the
camera's view so the TV reacts on the same frame. Find that moment in both files and set the offsets in `edl.json`:
`"left": {"ss": 3.2}`, `"right": {"ss": 1.0}` (seconds to skip at the start of each file); `clockStart` shifts the
on-screen clock. Each take stays one unbroken piece of both recordings.

## Voice clips and narration

Creature voices are the app's own clips. Find the creature and copy its files:

```sh
curl -s http://localhost:8787/api/hall-of-fame | jq -r '.[] | [.id, .name, .artist, .source] | @tsv'
cp ../server/data/voice/<id>/intro.m4a   voice/hero-intro.m4a     # the 0:06 wow moment
cp ../server/data/voice/<id>/intro.m4a   voice/takeA-intro.m4a    # Take A reveal (optional)
cp ../server/data/voice/<id>/winLine.m4a voice/winner-win.m4a     # Results podium, the winner of Take B (optional)
```

Because the VVD is filmed muted, these are laid in during the edit, so the build shows a small note while they play:
"The app's own voice clip, synced in the edit (VVD filmed muted)" (`cards/note-synced.png`). Set each cue's `at` in
`edl.json` to the frame where the app starts the line. If the room audio already has the voice, delete the cue.

Narration: record each line as `vo/<name>.m4a` (or `.wav`), any quiet room, phone close to your mouth. Missing lines
are read by macOS `say` in drafts (marked `TTS` in the build output). Lines must fit their segment:

| File | Segment | Line |
|---|---|---|
| `vo/hook.m4a` | title + Home (9 s) | Kids' drawings end up on the fridge. In Sketchlings they walk onto the TV, talk, and race the whole family. And the youngest can actually win. |
| `vo/who.m4a` | who (8 s, only if not said on camera) | I'm a solo developer at StarFun Games in Sri Lanka. I built this so our screen time starts with crayons. |
| `vo/modes.m4a` | remote (4.5 s) | Remote for menus, phones for racing, paper for creating. |
| `vo/arch.m4a` | architecture (7 s) | Phones run a web app. A small Bun relay links them to the TV app, built with React Native for Vega. |
| `vo/cutout.m4a` | doodle-cutout (7.5 s) | Our open-source library, doodle-cutout, turns a phone photo into a clean sticker. |
| `vo/claude.m4a` | Claude (7 s) | Claude reads the drawing and decides how it plays: a name, stats, an ability, and where the eyes go. |
| `vo/kpi.m4a` | KPI (7.5 s) | On the Vega Virtual Device it starts in under half a second, and the race loop needs about a millisecond per frame. |
| `vo/deadlock.m4a` | deadlock (9 s) | Races sometimes froze at the start. The crash dump's thread stacks showed a watchdog deadlock. One task per frame, ink loaded during the countdown: fifty-two starts, zero freezes. |
| `vo/impact.m4a` | impact (14 s) | It's for families with kids from four to ten. Screen time that starts with crayons, and the youngest can really win. About one and a half cents per creature. First names only, no accounts. |

## Shot list against the blueprint

Times are the built video's (2:50.5 total); "bp" is the blueprint's slot.

| Video | bp | Segment | Picture | Sound |
|---|---|---|---|---|
| 0:00-0:06 | 0:00-0:06 | hook | kid finishes and holds up the drawing | the kid's own words |
| 0:06-0:07.6 | 0:06-0:08 | snap | phone snaps the paper (hard cut) | room |
| 0:07.6-0:13.4 | 0:08-0:12 | alive | VVD: peel off, eyes, blink + "Real capture" badge | creature intro (synced, noted) |
| 0:13.0-0:16.0 | 0:12-0:15 | title | title card | VO hook, music in |
| 0:15.6-0:22.2 | 0:15-0:22 | home | VVD Home + lower third "Running on Fire TV · Vega OS / Vega Virtual Device · React Native for Vega" | VO hook |
| 0:22.2-0:30.2 | 0:22-0:30 | who | you on camera | your voice, music ducked |
| 0:29.8-0:54.8 | 0:30-0:55 | takeA | split screen, clock: scan, processing, reveal | room + creature voice |
| 0:54.8-1:27.8 | 0:55-1:30 | takeB | split screen, clock: race to the finish (33 s), youngest wins | room (the race is silent in the app) |
| 1:27.8-1:36.8 | 1:30-1:40 | results, hall | podium; cut to the Hall of Fame, caption "Saved. Still here tomorrow night." | winner's line (noted), kids react, music |
| 1:36.8-1:51.3 | 1:40-1:55 | remote, playagain, demo | remote close-up, D-pad to Play again, demo party (no Alexa beat) | VO modes, music |
| 1:50.9-1:57.9 | 1:55-2:02 | arch | architecture card with the Vega packages | VO |
| 1:57.5-2:05.0 | 2:02-2:10 | cutout | doodle-cutout steps, open source, MIT, 25 tests | VO |
| 2:04.6-2:11.6 | 2:10-2:17 | claude | Claude's real JSON over the sprite, eyes landing | VO |
| 2:11.2-2:18.7 | 2:17-2:25 | kpi | KPI card, measured on the VVD, TBD where unmeasured | VO |
| 2:18.3-2:27.3 | (panel) | deadlock | ACR, three thread stacks, the fix, 52 starts / 0 freezes | VO |
| 2:26.9-2:40.9 | 2:25-2:42 | impact | who it's for, youngest wins, Appstore, cost, privacy | VO |
| 2:40.5-2:50.5 | 2:42-2:55 | end | joke, wordmark, repo, doodle-cutout (MIT), StarFun Games, music credit | CC0 sting |

## Cards

Edit the HTML in `cards/`, then `cards/render.sh <name>` (or no name for all). Each card is one HTML file sharing
`cards/style.css` (notebook paper, Baloo 2 and Patrick Hand, both OFL, licences in `cards/fonts/`).
Transparent overlays: `lower-third`, `badge-vvd`, `caption-saved`, `note-synced`, `split-frame`, `clock`.

Still to fill before the final render (they say **TBD** on screen):
- `kpi.html`: UI fluidity, foreground memory, focus response, end-to-end input latency (edit the `KPI` array).
  The race value is the JS game-loop rate (57-65 Hz) measured on 20 Oct, before the 21 Oct loop change; re-measure.
- `impact.html`: playtest result ("youngest won X of Y races") and the price model.
- `claude.html`: shows Captain Bleep, a real `source: "claude"` persona (walk / big round tummy). For the panel's
  "big wings, move fly" beat, paste a real flyer's JSON from the hall of fame into `P`, copy its sprite to `cards/img/`
  and set `SPRITE`. Never type a persona by hand.

## Honesty rules for the edit

- Each take is one unbroken recording; any cut is visible. No faked pipeline steps.
- No Alexa beat (not working on the VVD), no sports or film clips, no Alexa+ logo, no third-party logos.
- No sound the app doesn't make: the race is silent in the app, so no added race sound effects.
- Audio laid in during the edit gets the on-screen note (any cue with `"note": true`).
- Music is CC0 only (`music/CREDITS.md`). `music/HappyClappyLoop.wav` is not in git: re-download it from the URL there.

## YouTube

**Title:** Sketchlings: kids' drawings come alive and race on Fire TV (Vega OS)

**Description:**

> Sketchlings turns a child's crayon drawing into a talking racer on the TV. Draw on paper, snap it with a phone,
> and watch it peel off the page on Fire TV, get a name, stats and an ability from Claude vision, speak in its own
> voice, and race the whole family. The youngest can win.
>
> Built for Fire TV on Vega OS with React Native for Vega; shown running on the Vega Virtual Device. Phones join with a
> QR code and race with taps, jumps and ROAR; the remote runs the menus.
>
> How it works: a phone web app cuts the drawing out with doodle-cutout (our open-source MIT library), a small Bun
> relay links the phones and the TV over WebSocket, Claude vision writes each creature's persona and Kokoro gives it
> a voice. Privacy: first names only, no accounts; drawings are sent to Claude only to create the character.
>
> Code: https://github.com/Harindulk/sketchlings
> doodle-cutout: https://github.com/Harindulk/doodle-cutout
> Made by StarFun Games.
> Music (CC0, via OpenGameArt.org): "Happy Clappy Loop" by OwlishMedia, "Happy Beat" by burabotti.
>
> 0:00 Draw it
> 0:13 Sketchlings on Fire TV
> 0:30 Scan and reveal (one take)
> 0:55 The race (one take)
> 1:28 Hall of Fame, remote and phones
> 1:51 How it works: doodle-cutout and Claude
> 2:11 Measured on the Vega Virtual Device, and the race-start freeze
> 2:27 Who it's for

Chapters follow the current timeline (YouTube needs each one to be at least 10 s); update them if segment lengths
change. Upload as Public, in English (contest rules).
