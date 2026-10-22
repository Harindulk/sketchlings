# TV app notes (React Native for Vega, SDK 0.24, RN 0.83)

## Performance (measured on VVD)

Measured on the Vega Virtual Device, headless, Apple-silicon host (10 cores, 16 GB), 21 Oct 2026 09:02-09:39 IST,
release build with sound on (cool start: commit 8864823; the rest: the #19/#20 build, 4c25958). Host load: 1-min load average 20.6 at the start of the cool-start run and 15.1 at its end,
9-14 during the memory runs and the soak; 11.7-13.7 GB of 13-14 GB swap in use; Unity open (~170 % CPU); the VVD
process itself at 700-810 % CPU with the app in the foreground (software rendering, F12). Every timing here is
pessimistic for real hardware. Raw reports: KPI Visualizer `output/2026-10-21_09-02-34` (cool start).

| KPI | Vega target | Measured | How |
|---|---|---|---|
| Time to first frame, cool start | < 1.5 s | **665 ms** mean (min 631, max 719, sd 27, CI ±16) | KPI Visualizer `--kpi cool-start-latency --iterations 10` (10 of 10 completed) |
| Time to fully drawn, cool start | < 8 s | **665 ms** mean (min 631, max 719) | same run; `useReportFullyDrawn` on Home's first frame |
| JS bundle load | none | 8.5 ms mean (6.0-12.5) | same run |
| Time to first frame, warm start | < 0.5 s | **not measurable on the VVD** (0 of 5 iterations) | `--kpi warm-start-latency`: its prep step backgrounds the app with `vmsgr send pkg://com.amazon.smplighthouse.launcher.main`, the Fire TV launcher. The VVD's launcher is `com.amazon.keplerlauncherapp.main`, so every prep fails ("CLI Send Error ... Failed to send message, remote error", 5 retries per iteration) |
| Foreground memory (KPI Visualizer) | < 400 MiB | **not measurable without Appium** | `--kpi memory` and `--kpi foreground-memory` stop with "Appium server is not found in the platform" (no custom scenario given) |
| App memory, `vega exec perf activity-monitor` (no Appium) | < 400 MiB (foreground) | **124-126 MiB** on Home; 133-144 MiB Lobby + Reveal; 204-219 MiB in the first 4-lane race; **233 MiB** peak after 3 races; 283-284 MiB after a Hall of Fame visit and 6 six-lane races | activity monitor "Memory Application" column, ~0.5 s samples (380 from a fresh launch, 188 in a 6-lane race) |
| UI fluidity | > 99 % | **not measured** | `--kpi ui-fluidity` needs an Appium server even without `--test-scenario` (same error) |
| Focus response | < 200 ms | **not measured** | needs an Appium-driven scenario (same) |
| Race loop, 6 lanes | 60 Hz | **55-62 Hz**, JS 0.3-0.5 ms per frame | in-app overlay (Menu), read in 18 screenshots of one demo race with the activity monitor running |
| Race-start freezes, 6 lanes | 0 | **0 in 10** on this build | `soak.mjs 10 --guests 3 --rounds 5` |

- Cool start ended with the same "[-1 != -1]" network-calls validation failure as before (FRICTION_LOG #16).
- ADBT `analyze_perfetto_traces` on the cool-start traces (`iter_*_vs_trace`) failed: "Unable to locate trace processor
  binary ... Vega Performance CLI path is not available", although `vega exec perf` works in the same shell (the MCP
  server doesn't see the SDK). ADBT `search_documentation` gave the warm-start targets (TTFF 0.5 s, TTFD 1.5 s).
- Memory grows with each race but levels off (+11 MiB race 2, +3 MiB race 3); the Hall of Fame (no virtualisation,
  backlog #22) adds ~50 MiB. Both far under 400 MiB.

## Protocol notes

None. The TV implements `shared/protocol.ts` as written (incl. eyes, ageGroup/AGE_BOOST, `shout`, artist, voice,
`ResultsData`). Phase frames the TV sends (phones may rely on these `data` shapes; they are extra, not contract):

| when | frame |
|---|---|
| Lobby shown | `{t:'phase', phase:'draw'}` |
| Reveal starts | `{phase:'reveal', data:{order: playerId[]}}` |
| Race mounts (countdown starts) | `{phase:'race', data:{countdownMs: 2700, racers: playerId[], round}}` |
| Results | `{phase:'results', data: ResultsData}` = `{placements:[{playerId, place}]}` |

`racers` / `placements` can include `guest-<sketchlingId>` ids: Hall of Fame creatures picked with "Race again" that
run as bots for their artist. No phone owns them.

## Build, run, drive (exact commands)

```sh
source ~/vega/env
cd tv && npm install                       # once (no .npmrc legacy-peer-deps: it breaks the CLI plugin, see F2)
tv/scripts/vbuild.sh release --run         # build in a mirror dir + install + launch on the VVD (see F1, F9)
MUTE=1 tv/scripts/vbuild.sh release --run  # same, sound off (use for automated runs and screen recording)
tv/scripts/remote.sh right|left|up|down|select|back|menu|playpause [n]   # D-pad / remote keys
tv/scripts/remote.sh shot out.png          # 1920x1080 screenshot (adb emu screenrecord screenshot)
node tv/scripts/fake-phones.mjs <ROOM> [count] # simulated phones: join, upload a drawing, tap/jump/shout in the race
node tv/scripts/soak.mjs 20 [--live 4 --room CODE]  # race-start soak (demo or fake phones), flags a frozen countdown
python3 -I tv/scripts/acr-stacks.py <acr> <libs/>  # every thread's native stack from an ACR's core dump (see F4)
cd tv && npx jest && npx tsc --noEmit -p . # race sim + abilities balance + guests/demo + narrator tests, typecheck
```

- Keys: `adb -s emulator-5554 shell inputd-cli button_press KEY_DOWN` (dev-mode `inputd-cli` exists on the VVD; no
  `vsm developer-mode enable` needed). Codes used: KEY_UP/DOWN/LEFT/RIGHT/ENTER/BACK/MENU/PLAYPAUSE. In JS,
  KEY_PLAYPAUSE arrives as `eventType: 'play'` (not `'playpause'`); the race accepts both.
- `soak.mjs` reads the screen with macOS Vision (`scripts/ocr.swift`, compiled on first use). Vision's `.accurate`
  mode hung or crashed on this Mac; `.fast` takes 0.4 s but can't read the tilted room-code tiles, so live soaks use a
  throwaway build whose first `hello` asks for a fixed room (`room: code.current ?? 'BNDR'` in a mirror copy of
  `game/party.ts`) and pass `--room BNDR`.
- If Unity is open, set `ADB=/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb`
  before `remote.sh` (see F6).
- Server: `src/config.ts` `HOST = '10.0.2.2:8787'` (VVD -> Mac). Real Fire TV: the Mac's LAN IP, rebuild.
- In a race, **Menu** toggles the perf overlay: fps, JS ms/frame, input latency, audio state.
- Demo party: the remote plays for player 1 (OK = run, Up = jump, Play/Pause = ROAR); other lanes are bots.

## Live view for playtests

The headless VVD has no window, so this puts its screen in a browser for the TV (HDMI or AirPlay from the Mac):

```sh
bun scripts/live-view.ts   # then open http://localhost:8799/ in Chrome, click once = full screen, F = fps readout
```

- How: switches on the emulator's gRPC endpoint through its console if it is off (`grpc 8554`; 127.0.0.1 only,
  token in `~/Library/Caches/TemporaryItems/avd/running/pid_<pid>.ini`; stays on until the VVD stops, and the script
  switches it on again after a VVD restart), then reads `EmulatorController/streamScreenshot` as raw RGB888
  1920x1080 frames and pushes them over a WebSocket to a WebGL page. Read-only: no keys, no adb (so no F6 clash). A
  slow viewer skips frames instead of falling behind; the page reconnects by itself; the script retries every 2 s.
- The emulator only sends a frame when the screen changes, so a still screen reads **0 fps**: that is not a freeze.
- Measured 21 Oct (Mac load ~20, VVD using 4-7 cores for other tests): **25-33 fps drawn, which was every
  frame the VVD drew; 40-50 ms** from the VVD's frame timestamp to the screen in Chrome (54-59 ms in a
  WebKit pane). CPU: the script ~6-9 % of one core, Chrome ~36 %.
- Other routes measured: `adb emu screenrecord screenshot` loop 0.1 s per PNG when the Mac is idle (~10 fps), but
  0.25-0.58 s under load (2-4 fps); a persistent console socket without adb was no faster (2.9 fps, 321 ms). gRPC
  `getScreenshot` in a loop 21-66 fps, 12-33 ms. gRPC `streamScreenshot` as PNG: 4.8 fps, 184 ms; as RGB888: 37.5 fps
  with no dropped frames, 27 ms (the one used). On-device `screenshooter` (weston) failed ("creating a buffer file
  for 8294400 B failed: Permission denied") after hanging 89 s, and `adb shell` then answered "No running instances
  of com.amazon.dev.shell.service" for about a minute: don't use it. Recording chunks and replaying them was not built:
  seconds of lag, and it would need `screenrecord`, which filming uses.

## What is built (all verified on the VVD with screenshots in notes/shots/)

Home (tiles, focus scale+glow+wobble, `hasTVPreferredFocus`, `TVFocusGuideView`, aria-labels, "Running on Fire TV ·
Vega OS"), Lobby (QR via `@amazon-devices/react-native-qrcode-svg`, room code, chips with scan status + age boost
badge), Reveal (paper tear, overshoot pop, name/title/"Drawn by", stat bars, intro bubble, voice), Doodle Dash
(parallax notebook, lanes, move styles walk/hop/fly/roll, googly eyes with physics, ink blots + stun, Doodle Boost,
age boost, ROAR with shake, 3-2-1-GO, finish caption, medals), Results (podium, crown, confetti, winLine bubble +
voice), Hall of Fame (server list, focus-follow scroll, details panel, **Race again**), How to play, Demo party.
**Abilities** ("what you draw changes how you play", `Sketchling.ability`, rules in `src/game/race.ts`): fly floats
over ink blots (never stunned, small wing-flap lift), roll gets +10% after 1.5 s of flat ground, hop jumps 1.3x higher,
1.45x longer and 7% faster in the air, walk's ROAR knocks the ink blots within 420 dp ahead out of its lane.
Balanced by a 200-race bot test (each kind wins 15-36% with equal stats; fly 30 / roll 23 / hop 22 / walk 25 % in
400 races). Shown as a sticker on the Reveal card ("Wide wings → Flies over ink blots!"), an icon on each Lobby chip
and a WINGS! / WHEELS! / SPRINGS! / BIG ROAR! pop in the race when it helps. Entries without `ability` (older Hall of
Fame) get one from `move` (`src/game/ability.ts`, same defaults as the server).
**Race again**: OK on a focused Hall of Fame card puts that creature in the next party as a bot-run guest racer for its
artist (OK again removes it; aria-label "Race again with <name>" / "<name>, racing next"; "Next race!" tag). The
guests join whichever party starts next (live or demo, up to 6 players) and stay for "Play again"; leaving the party
clears them. **Demo party** uses the newest Hall of Fame creatures (one per name, credited to their artists) when the
hall has 2+, topped up with the bundled samples; offline it uses the samples.
Fonts: Baloo 2 (OFL, `tv/assets/fonts`, `fontFamily` = file name). Art: our own SVGs (`tv/art-src/make-art.mjs`).
Amazon skills used: `amazon-devices-vega-media-player` (audio setup/manifest), `amazon-devices-vega-app-performance`
(KPI Visualizer; on 21 Oct for the freeze, but its router needs the `amazon-devices-buildertools-mcp` server, which
was not connected, so the freeze was debugged from ACR core dumps instead). Docs were read on developer.amazon.com and
from the package typings.

## Measured on VVD (Vega Virtual Device, headless, macOS 27, Apple silicon)

- **Cool start** (`vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main --kpi cool-start-latency
  --iterations 3`): TTFF mean **408 ms** (min 192, max 553), TTFD mean **409 ms** (we call `useReportFullyDrawn` on
  Home's first frame), JS bundle load 17.6 ms. Targets: TTFF < 1.5 s, TTFD < 8 s.
- **Race loop**: 57-65 fps, **0.1-1.2 ms JS per frame** (4-6 lanes), read from the in-app overlay (20 Oct). Since
  21 Oct the loop is one `setTimeout` per frame (was rAF + 2 timeouts); fps not re-measured since.
- **`requestAnimationFrame` on the headless VVD** fires ~7,600 times a second (measured 21 Oct with a bare rAF chain;
  F3 saw ~1,250). A bare `setTimeout(0)` chain runs ~7,500/s.
- **Input latency** (simulated phones on the Mac, server on the Mac): receive -> applied in the sim **7 ms** median;
  phone->TV delivery **+1 ms** median above the best observed delivery (jitter). The absolute phone->TV figure is not
  measurable from the TV alone: the VVD clock was **~2 h 11 min behind** the Mac (raw `recv - at` = -7,869,824 ms), so
  we report jitter over best + apply time. On real hardware use NTP-synced phones or a ping/pong offset estimate.
- Superseded on 21 Oct by "Performance (measured on VVD)" at the top (cool start re-run with 10 iterations, memory;
  warm start, UI fluidity and focus response can't run on the VVD without Appium or with the VVD's launcher).

## Audio outcome on the VVD

- Setup (since 21 Oct midday, F13): `@amazon-devices/react-native-w3cmedia` 2.3.2, one
  `AudioPlayer(CONTENT_TYPE_SPEECH, USAGE_GAME)`, one `MediaSource` (set as `srcObject` once) and one
  `addSourceBuffer('audio/mp4; codecs="mp4a.40.2"')` for the whole session. Each clip is appended whole at
  `timestampOffset` = the end of what is already buffered, the player seeks to its start and plays, and pauses 400 ms
  after `waiting` follows `playing` (no `endOfStream`, so no `ended`). Never a source swap, no URL fallback. Before
  that: a new MediaSource per clip + `endOfStream()` + `ended`, which crashed libW3CMedia (F13). Manifest `[wants]`: mediametrics, mediabuffer, mediatransform,
  audio.stream, audio.control, **audio.system** (without it the log says "Unable connect to 'com.amazon.audio.system'.
  Missing the permissions"), media.server, media.playersession. Narrator clips bundled as base64
  (`tv/scripts/bundle-narrator.mjs`), creature voices fetched + prefetched from `/voice/<id>/<line>.m4a`.
- Result (19-20 Oct): `MediaSource.isTypeSupported` true; for both bundled narrator clips and server voice clips
  `appendBuffer`, `endOfStream` and `play()` succeed (overlay: "audio MSE play() ok"); narrator clips fired `ended`.
- Proven on 21 Oct: **the VVD's audio reaches the Mac's speakers.** While the app plays clips, macOS `coreaudiod`
  holds `PreventUserIdleSystemSleep ... "audio-out BuiltInSpeakerDevice", Created for PID <vega-virtual-device>`
  (`pmset -g assertions`); during a soak with Reveal/Results clips it was re-created (age back to 0 s) every 7-23 s.
  Not checked: whether it also appears with the app silent (`MUTE=1`). The
  instance config has `hw.audioOutput = true` / `hw.audioInput = yes` (`~/vega/sdk/.../vvd/instances/*/
  hardware-qemu.ini`), so the emulator also opens the **Mac microphone** ("audio-in BuiltInMicrophoneDevice" for the same
  PID). Correction (22 Oct): `adb emu screenrecord` does record the VVD's audio. Its webm has a Vorbis 44.1 kHz
  stereo track, and the countdown clips are in it, in sync with the picture (see "22 Oct, evening" below). Still not
  heard on a real Fire TV.
- The race was silent from 21 to 22 Oct. Since 22 Oct it plays short bundled narrator clips again: "Three!", "Two!",
  "One!", "Go!" on the countdown, "ROAR!" when a ROAR starts, "Photo finish!" when the first two finish within 0.5 s
  (see "22 Oct, evening"). Creature voices still play only on Reveal and Results, one clip at a time. When the race
  mounts, `hush()` drops a queued Reveal line and pauses the one playing, so the countdown starts on a quiet player.
  Every voiced line has an on-screen caption: Reveal intro = speech bubble, narrator "meet the Sketchlings" = header,
  "winner is" = "<name> wins!" title, winLine = Results bubble, 3-2-1-GO = the big numbers, ROAR = the ROAR! pill,
  photo finish = the FINISH! banner; the finish catchphrase is a caption only.
- `MUTE=1` (sets `SOUND = false`, no media stack at all) is still there for silent recordings; since the F13 fix the
  sound-on build passed the crash and race-start soaks (F13), so it is no longer needed for stability.

## Friction log (Vega SDK snags hit while building the TV app)

**F1. Build fails when the project path contains spaces.** (The repo moved to `~/Desktop/Sketchlings` on 21 Oct, so a
direct `npm run build:release` in `tv/` works now, but see F9.) Task: `npm run build:release` in
`~/Library/Application Support/.../tv`. Expected: build. Actual: `/bin/sh: /Users/harindu/Library/Application: No such
file or directory` / "Unable to generate a manifest": `kepler-compatibility-metro-config` runs the manifest builder via
`execSync` with an unquoted path. Severity: high (common macOS paths). Workaround: `tv/scripts/vbuild.sh` rsyncs the
project to a space-free temp dir and builds there. Suggestion: quote paths / use `execFileSync`.

**F2. `.npmrc legacy-peer-deps=true` (as the qrcode-svg docs advise) removes the `build-vega` command.** Actual:
`error: unknown command 'build-vega'` (`Cannot find module '@react-native-community/cli-tools'`). Severity: high,
confusing. Workaround: don't add the .npmrc; plain `npm install` resolves fine. Suggestion: fix the docs or the peer deps.

**F3. `requestAnimationFrame` free-runs at ~1250 Hz on the headless VVD** (not vsync). A rAF-driven game loop ran the
race ~10x too fast and starved JS timers (countdown never advanced). Workaround: pace frames to ~60 Hz with
`setTimeout` and yield between frames. Severity: high for games. Suggestion: tie rAF to the compositor even headless.

**F4. Race-start freeze = a deadlock inside Vega's JS-thread watchdog (root-caused 21 Oct).** Symptom (19-20 Oct,
about 1 race in 4 before mitigations, more with audio): the countdown sticks on "3", nothing JS-driven moves; after
Back the LCM kills the app: ACR `CrashReason: AppNotResponding`, `LCM_ANR_REASON: Lifecycle Callback`, `JSThread
thread ID: 18 / No JavaScript code is currently being executed`.

*Evidence.* The ACR's `<minidump_stackwalk>` only unwinds the main thread, but every ACR also carries
`<coredump_lz4_base64>`: an ELF core with all threads' registers and stacks. `tv/scripts/acr-stacks.py` decodes it,
walks each thread's frame-pointer chain and names frames from the device's own libraries (`adb pull /usr/lib/...`).
All 5 "Lifecycle Callback" ACRs from 20 Oct (09:15-13:43 UTC) show the same three threads:
- JS thread (tid 18): `send()` ← `aceAsync_triggerSend` ← `aceAsync_deferredRemove` ← `AsyncHandler::cancel` ←
  `orpheus::framework::utils::ThreadMonitor::stopTimer` ← `ThreadMonitor::resetTimer` ←
  `volta::react::KeplerScriptThreadMonitor::sendHeartbeat` ← a RuntimeScheduler task. It is not running JS (hence "No
  JavaScript code is currently being executed"), it is blocked in a syscall.
- The watchdog's own loop thread (tid 20, spawned by `libframework-thread-monitor.so`): `pthread_mutex_lock` ←
  `aceAsync_deferredPoll` ← `aceAsyncLoop_run`.
- Main thread: `pthread_mutex_lock` ← `KeplerScriptThreadMonitor::appMovedToBackground` ← `onBackground` (the Back
  press); the heartbeat timer thread is parked on the same mutex in `requestHeartbeat`.
Disassembly of `libasync.so.0` (VVD build): `aceAsync_triggerInit` makes the wake-up channel with
`socketpair(AF_UNIX, SOCK_DGRAM, 0)` (blocking); `aceAsync_triggerSend` is a blocking `send(fd, msg, 16, 0)`;
`aceAsync_deferredRemove` calls it **between `pthread_mutex_lock` and `unlock` of the loop's deferred-work mutex**;
the loop reads one 16-byte message per `epoll_wait` and must take that same mutex in `aceAsync_deferredPoll`. In
`libkeplerscript-4.so.4`, `MessageQueue` wraps every JS task in `KeplerScriptThreadMonitor::startTimer()/stopTimer()`,
which call the orpheus `ThreadMonitor` (vtable slots `startTimer`/`stopTimer`) → `AsyncHandler::post/cancel` → one
wake-up message each; heartbeats call `resetTimer` (cancel + post).

*Root cause.* When the watchdog loop thread falls behind the JS thread by the socket's send buffer (`wmem_default`
212,992 bytes on the VVD = a few hundred queued 16-byte datagrams), the JS thread's next `send()` blocks **while
holding the deferred mutex**; the only thread that could drain the socket then blocks on that mutex before it reads:
a permanent ABBA deadlock. The JS thread never runs again; the watchdog can't fire its own "Thread Monitor" ANR because
its loop is one of the deadlocked threads, so the app just hangs until a lifecycle callback (Back) needs the
`KeplerScriptThreadMonitor` mutex and the LCM kills it. It is a platform bug; the app can only avoid feeding it.
Race start was the worst moment: one long mount commit, ~40 zero-duration native "attach" animations with completion
callbacks, a frame loop of 3 JS tasks per frame (rAF + `setTimeout(0)` + a pacing timeout), w3cmedia narration, all
on a VVD whose vCPUs stall when the Mac is loaded (on 21 Oct the Mac had 16 GB RAM, 16 of 17 GB swap in use, load
30+). The 6th ACR (13:22, `LCM_ANR_REASON: Thread Monitor`) is a different hang: JS thread blocked on a mutex inside
`libW3CMedia.so` (that is F7).

*What could not be reproduced on purpose* (a stress screen, 21 Oct, healthy VVD): a 7,600/s rAF chain, a 7,500/s
`setTimeout(0)` chain (also with 240 native-animated views spinning), 470/s native `Animated` listener events, a
listener that calls `setValue` on another value, and single long JS tasks of 0.5, 2 and 5 s all kept running. A 10 s
task is killed correctly by the watchdog after ~8 s ("Thread 'JSReactThread' (18) detected to be unresponsive"). The
20 Oct note that "calling `setValue` from an Animated listener froze JS deterministically": setting the *same* value
from its own listener recurses ("RangeError: Maximum call stack size exceeded", fatal) - a crash, not this freeze.
So the trigger needs the watchdog thread to be starved while the JS thread churns tasks, which we could only see at
race start on a loaded Mac.

*Fix (Race.tsx, 21 Oct).* Starve the bug of messages instead of working around symptoms: the frame loop is exactly
one `setTimeout` task per frame; race values are native from birth (`new Animated.Value(v, {useNativeDriver: true})`),
so the ~40 attach animations and their callbacks at race start are gone; the race is silent (no w3cmedia work, queued
voice lines dropped at mount; since 22 Oct it plays short narrator clips again, soaked clean, see "22 Oct,
evening"). Removed the 20 Oct workarounds that targeted a wrong theory (commit fence, loop "kick" restarts: a blocked
JS thread runs nothing, so they could never help). Soak: see "Soak record" below.
Severity: critical (an app hangs for good and the watchdog misses it). Suggestion to Amazon: don't hold the deferred
mutex across `send()`, make the trigger non-blocking and coalescing (one pending wake-up is enough, e.g. an eventfd
or `MSG_DONTWAIT`), and don't post/cancel a watchdog timer for every JS task (stamp an atomic and check it from a
periodic timer). Also: unwind all threads in `<minidump_stackwalk>`; the data is already in the ACR.

**F5. Headless VVD crashes** with crashpad `UniversalExceptionRaise: (os/kern) failure (5)` (as the GUI mode,
FRICTION_LOG #1). 20 Oct: after ~2 h. 21 Oct: 4 times in 12 minutes, even idle with no app running, each time right
after `ERROR | detected a hanging thread 'QEMU2 main loop'. No response for 15015 ms` (and every vCPU thread) in
`vvd/instances/*/virtual_device.err`; twice preceded by `coreaudio: Could not initialize record ...
kAudioHardwareIllegalOperationError` (the emulator opens the Mac microphone). The Mac (16 GB) had 16 of 17 GB swap in
use and load 30+ from other jobs: the emulator's own hang detector aborts it when the host swaps it out. Workaround:
`vega virtual-device start --no-gui --timeout 300` (boots in ~10 s), reinstall, and keep memory free while testing.
Suggestion: make the hang detector tolerate host stalls (or say "host stalled 15 s" instead of crashing); allow
`--no-audio` on `vega virtual-device start`.

**F6. Two adb versions fight.** `vega` / Homebrew adb 37.0.1 vs Unity Editor's adb 36.0.0 (Unity running `-adb2`
restarts its server): every switch kills the other's server ("daemon not running; starting now", "device offline"),
dropping key presses mid-test. Workaround: use the same adb as Unity (`ADB=...` above) while Unity is open.
Suggestion: `vega` could use its own adb port or report the version clash.

**F7. Audio activity degrades JS scheduling on the VVD.** While the w3cmedia AudioPlayer plays a 5 s clip and another
clip replaces the `srcObject`, frames drop to 0-15 fps and the countdown stalls; `ended` never fires for the replaced
clip. Workaround: never interrupt a playing clip; build with `MUTE=1` for recordings. Unknown if real hardware is affected.
The 13:22 ACR on 20 Oct (`LCM_ANR_REASON: Thread Monitor`) shows the JS thread blocked on a mutex inside
`libW3CMedia.so` with a JS frame in the w3cmedia bundle: another way audio can hang JS. From 21 to 22 Oct the race
played no audio. Since 22 Oct it plays ~0.6 s narrator clips on the one-MediaSource player (F13: a pause and a seek,
never a source swap); 30 race starts with them, 0 frozen (one checked late, see the soak table and "22 Oct,
evening").

**F8. Docs/tooling gaps.** `expo-font` is "not supported" for RN 0.83, but plain `assets/fonts/*.ttf` +
`fontFamily: '<file name>'` works (the family name does not). `loggingctl log -v <pkg>` shows native logs and fatal
JS errors (`[KeplerScript-JavaScript]` with a stack) but no `console.log` output from release builds. The Amazon Devices Builder Tools skills need an MCP server that is not set up
by the skill install. `vega exec perf kpi-visualizer` fails "Network calls time" validation when an app makes no
network calls at launch ("-1 != -1"). 21 Oct: with the MCP connected, `symbolicate_acr` (gdb mode, `deviceId:
emulator-5554`) failed with "Failed to copy .../temp_acr_debugFs/acr_libraries.txt to emulator-5554", so
`tv/scripts/acr-stacks.py` remains the way to read an ACR's threads.

**F9. Building in place rewrites `manifest.toml`.** `npm run build:release` in `tv/` appends five `[[needs.module]]`
entries (kepler_media_controls, keplermediadescriptor, keplerscript_4, svg_3, w3cmedia_2) to the source
`manifest.toml`, so every build leaves a diff. Workaround: keep building through `tv/scripts/vbuild.sh` (mirror dir).
Suggestion: write the generated manifest to `build/`.

**F10. `adjustsFontSizeToFit` does nothing on Vega**, so long creature names ("Little Marshmallow") were cut off with
"..." on Reveal and in the Hall of Fame. Workaround: `fitFont(text, width, max)` in `components/Bits.tsx` (Baloo 2
bold ≈ 0.54 em per character). Suggestion: implement it or document it as unsupported.

**F11. The VVD's renderer froze after a rotated tag in a rounded clipped card (and a ✓ glyph) appeared.** After
picking a creature in the Hall of Fame the picture stopped updating (two stale frames alternating, parts of the
screen blank) while JS kept running: Back really went Home, but nothing redrew until the app went to the background
and came back. The new view was a `rotate: '6deg'` "Racing next!" tag inside the card's rounded, clipped box (plus a
"✓" glyph from a fallback font). A straight tag inside the corners and no ✓ fixed it (a pick and three focus moves after
it redraw fine; which of the two did it was not isolated). `virtual_device.err` is full of `sPrepareTexImage2D ...
failed validation`. Not checked on real hardware. Suggestion: fix or document the clip path; the app gets no error at all.
*22 Oct: the "second visit" freeze (dress rehearsal) is a different hang: F4.* Repro: sound-on release build, server
running (74 Hall of Fame entries), `adb emu screenrecord` running (as when filming), then Home -> Hall of Fame -> Right
-> Down -> Back, repeated. It froze on the 4th visit of one run and the 9th of another (2 of 13 visits); without
screenrecord, 0 of 11 visits froze (two app sessions, up to 9 visits in one, one of them after a race). Frozen state:
the screen alternates two stale frames (only the details sprite differs, as in the first F11 picture) and
Right/Down/Back/OK change nothing. The JS thread is stopped, not just the picture: the native
`MountingManager::SurfaceTelemetryLogger` line (every 5 s) kept `mutations=43510 transactions=416` for over 2
minutes, and Back + OK, which on a live app opens the Hall of Fame again and fetches `/api/hall-of-fame`, sent no
request (a logging proxy in front of the server saw one fetch per visit up to the frozen one, none after). After the
first freeze the Home key and a `launch-app` gave a cold start (the old process was gone, no ACR). After the second
the Home key left the frozen app in the background, and reinstalling the app ~3 min later wrote `crash_1792683444`
(AppNotResponding, `LCM_ANR_REASON: Lifecycle Callback`, "No JavaScript code is currently being executed").
`acr-stacks.py` on it shows exactly the F4 three-thread deadlock: the JS thread (tid 18) in `send()` <-
`aceAsync_triggerSend` <- `aceAsync_deferredRemove` <- `AsyncHandler::cancel` <- `ThreadMonitor::stopTimer` <-
`resetTimer` <- `KeplerScriptThreadMonitor::sendHeartbeat`; the watchdog loop (tid 20) in `pthread_mutex_lock` <-
`aceAsync_deferredPoll`; the main thread in `pthread_mutex_lock` <- `appMovedToBackground` <- `onBackground`. The
likely trigger (the fix below stopped it) is the Hall of Fame mounting all 74 cards at once: 74 network images plus
each card's `FocusButton` animated nodes in one commit, like the 66 ink blots at race start. Fix (`HallOfFame.tsx`):
mount only the rows down to two below the focused one (9 cards at first, 3 more per row of scrolling; never
unmounted). Tilted cards with rounded
clipped corners, the "…" and curly-quote glyphs and the idle eyes all stay, so the only change is how much mounts at
once. With it: **27 visits, 0 frozen**, same screenrecord setup (3 runs of 9, load average 17-19). At the old rate
(2 in 13), 27 clean visits in a row has p = (11/13)^27 = 0.01. Also 5 race starts after a Hall of Fame visit
(`soak.mjs 5 --guests 3`) on this build, 0 frozen.
The rehearsal advice (film the Hall of Fame soon after an app restart) should no longer be needed with this build, but
F4 itself is a platform bug the app can only starve, so keep the Mac quiet when filming.

## Soak record (race starts on the VVD, `tv/scripts/soak.mjs`)

| build | party | race starts | frozen |
|---|---|---|---|
| 20 Oct final (before the fix), sound on | demo | 12 (run on 21 Oct) | 0 |
| fix step 1 (1 task/frame, silent race, no fence/kick) | demo | 12 | 0 |
| + native-from-birth values + abilities (21 Oct, ~00:00) | demo | 10 | 0 |
| **final** (21 Oct, commit afdb370), sound on | demo | **10** | **0** |
| **final** + fixed room code (soak-only) | live, 4 fake phones (10 rounds) | **10** | **0** |
| 6 lanes before the blot fix (21 Oct afternoon) | demo + 2 guests | 7 | **3** |
| + blot fix, 2ee4b14 | demo, 6 lanes | 10 | 0 |
| + #19 callouts, #20 layout (21 Oct morning, 4c25958), sound on | demo, 6 lanes | **10** | **0** |
| same build, sound on, final soak | demo, 6 lanes | 11 | 0 (2 sessions ended by a libW3CMedia SIGSEGV at Results, see below) |
| same build, `MUTE=1` (the filming setup) | demo, 6 lanes | **10** | **0** |
| F13 one-MediaSource audio, sound on, `--screens 44` (21 Oct 05:34-05:58 UTC) | demo, 5 lanes | 21 | 1 (first start: a 6 s Reveal voice played into the countdown) |
| + `hush()` pauses the playing clip at race mount (d301384), sound on | demo, 6 lanes | **10** | **0** |
| same build, sound on, `--screens 44 --guests 3` | demo, 4-6 lanes | **25** | **0** (0 crashes over 51 Reveal/Results screens) |
| race audio (3-2-1-GO, ROAR, photo finish; 22 Oct), sound on, `--guests 2` | demo, 5 lanes | **10** | **0** |
| same, `--guests 3` | demo, 6 lanes | **10** (1 checked on a Reveal card after an OCR misread, see 22 Oct; its race was seen running in the wait shots) | **0** |
| same + fixed room (soak-only), `--live 6 --room BNDR` | live, 6 fake phones | **5** | **0** |
| + Hall of Fame row window (final build, 22 Oct), `--guests 3` | demo, 6 lanes | **5** | **0** |
| 23 Oct final build (Grown-ups, hold lease, FLY 1.0, chip fix), sound on, `--guests 2 --rounds 4` | demo, 6 lanes | **20** | **0** (0 crashes over 30 Reveal cards + 20 Results) |
| same build, `--guests 1 --rounds 4` | demo, 5 lanes | **20** | **0** (0 crashes over 25 Reveal cards + 20 Results) |

Final build: 20 race starts, 0 frozen; 42 since the fix. Sessions that lost keys to adb restarts (F6) or hit a VVD
crash (F5) never reached a race and are not counted. Shots of every race (+4.5 s and +6 s) were checked by the soak
for a stuck countdown and for a still screen.

The old build also passed on 21 Oct, so a clean soak alone doesn't prove the fix; the proof is the mechanism (F4)
plus removing the app's share of the watchdog traffic at race start. Freezes on 20 Oct happened with the Mac under
heavy load; the VVD itself kept crashing under the same load on 21 Oct (F5).

## Open issues

- F4 is a platform deadlock; the app now gives it far less to chew on but cannot rule it out. Soak on a real Fire TV
  before filming there; on the VVD film with `MUTE=1` and keep the Mac's memory free (F5).
- Audio: the countdown clips are in the VVD's screenrecord audio track, in sync (22 Oct); not yet heard on a real
  Fire TV. "Photo finish!" is not verified on the VVD (no recording of a finish within 0.5 s yet).
- The Hall of Fame on the server is full of test creatures (fake-phone uploads: 41 entries, mostly "Little
  Marshmallow" / "Professor Tumble"); the Demo party now shows them. Clear `server/data` before filming.
- Audio on the VVD is fragile beyond F7: an ACR from a soak on 21 Oct (18:55 UTC) is a SIGSEGV inside
  `libkepler_media_player.so` (media thread), and while the Hall of Fame picture was frozen (F11) w3cmedia kept
  logging "No Time update even in Playing state: 0.951" every 250 ms (a player stuck mid-clip). Another reason to
  film on the VVD with `MUTE=1`. (All of these were seen with the old per-clip source swap; since F13 the player's
  source never changes. Sound-on now passes the soaks in F13, but `MUTE=1` remains the zero-media option.)
- Unity's `-adb2` asset worker kept restarting the adb server on 21 Oct (F6), so soak sessions sometimes lost keys
  and failed to reach a race; those are counted as "failed to start", never as passes.
- After the live soaks the Hall of Fame's newest creatures are all fake-phone uploads that the server gave the `walk`
  ability, so the Demo party currently shows four walkers (only BIG ROAR pops). Clear `server/data` before filming
  (or check the server's shape detection); with the bundled samples the demo has walk, hop, fly and roll.
- The offline eye finder put a second pair of googly eyes above some fake-phone drawings (server side, seen on the
  star "Little Marshmallow").

## 21 Oct, afternoon: 6-lane live run, the freeze with 6 lanes, F12

**Live run, real Claude personas:** 6 fake phones, lobby → reveals → 2 races → results → Hall of Fame → Race again with 2 picks → demo party with guests, end to end. Fixed: 6-lane finish medals wrapped ("1s/t!"); Doodle Boost text contrast now 5.6:1.

**Measured on VVD (headless, Apple-silicon host under load 10-20 with 11-14 GB swap in use; no Fire TV hardware):**

| Metric | Value |
|---|---|
| Race loop, 6 live lanes (31 one-second overlay samples) | 52 / 56 / 61 Hz (min / median / max) |
| JS time per frame in the race | 0.3 ms median, 0.6 ms max |
| Phone input received → applied in the sim | 6-9 ms, jitter +2 ms (n = 300) |
| Cool start (20 Oct) | TTFF 408 ms, TTFD 409 ms |
| KPI Visualizer warm start, memory, UI fluidity, focus response | not measured yet (custom fluidity scenarios need Appium, not installed) |

**The race-start freeze with 6 lanes.** 6 lanes: 3 of 7 starts froze (stuck on "3", no ACR written, Back did not kill it; terminated by hand). 4 lanes: 0 of 7 today, 49 clean counting earlier soaks. A build without the ink-blot images ran 8/8 six-lane starts, so the likely trigger is ~66 blot images mounting at once at race start (81 image loads in 0.3 ms in the log) feeding the F4 watchdog deadlock on a starved host. Candidate fix under soak: blots mount one lane every 300 ms during 3-2-1, loop at 20 Hz until GO (20 Hz alone did not stop a freeze). Until the soak passes: film with 4-5 players, quit other apps first.

**F12. The VVD renders in software, and an animating app keeps ~7 host cores busy.** Task: soak and film on the headless VVD on a 16 GB Mac. Expected: an idle-ish TV app costs little host CPU. Actual: `hw.gpu.mode = swangle_indirect` in the instance's `hardware-qemu.ini` (ANGLE on SwiftShader, on the host CPU). With Sketchlings in the foreground the `vega-virtual-device` process uses 590-760 % CPU on Home, Results and Hall of Fame (focus wobble, blinking googly eyes) and in a race, 150-320 % on the mostly still How to play screen, and 15-20 % with the app terminated (`ps -o pcpu`, 21 Oct). On a Mac also running other apps that is the host starvation behind F5 and the starved watchdog thread in F4. Severity: medium-high. Workaround: quit other apps before soaks and filming. Suggestion: document the GPU mode, and offer a working host-GPU mode for the headless VVD on Apple silicon.

**Other changes today:** app icon (512 px PNG in the manifest; shows on the VVD "Your apps" tile titled Sketchlings), focus returns to the last Home tile, background/active handling with `useKeplerAppStateManager` (hush audio, close the socket, rejoin the same room; resume after the Home key not yet verified), Lobby Start not focusable until a drawing is ready, `soak.mjs --guests N` for 6-lane demo parties.

**Amazon Devices Builder Tools used:** `read_document` and `search_documentation` (Vega KPI docs and the manifest icon format).

## 21 Oct, 09:00-10:20 IST: KPIs, #19/#20 polish, final soaks

- **KPIs:** "Performance (measured on VVD)" at the top. Cool start re-run (665 ms, 10 runs, loaded host); app memory
  from `activity-monitor`; warm start, the KPI Visualizer's memory KPIs, UI fluidity and focus response can't run on the
  VVD (Fire TV launcher hard-coded in the warm-start prep; Appium required). Ready for FRICTION_LOG: the warm-start launcher, Appium for memory, and ADBT `analyze_perfetto_traces` not finding the Perf CLI.
- **#20 layout fixes (22fa1b2):** How to play text clears the Got it! glow (cards 256 tall, button 30 dp lower),
  Results places 4-6 in a row under the podium (podium floor 462 when there are 4+ racers) and the crown rides in the
  winner's MoveIdle, seated from the sprite box, Reveal bubble has no tail and no progress dot for a single creature,
  Lobby shows "Waiting for a drawing…" as a dashed status like the empty slots (no dead button). Shots 07c, 02h, 03f, 05d.
- **#19 race callouts (4c25958):** Doodle Boost! is a white ink-bordered pill above the runner ring (bottom 10 dp into
  the ring, right edge at 30 % of the sprite box, behind the creature); dizzy stars are one hand-drawn PNG
  (`art-src` `dizzy`, three stars on a ring) mounted 150 + 300 x lane ms after race mount, between the ink-blot steps;
  the WINGS!/SPRINGS! pill is a wide absolute wrapper with the pill shrink-wrapped by `alignItems` (absolute views wrap
  at their parent's width on Vega); fixed slots from the ground: ability pop at box bottom - 22, ROAR! (24 px font,
  -4 deg) 8 dp above it, 1st! in the same band as ROAR! but left of it. Shots 04k, 04l, 04m. Soak: 10 of 10 clean.
- **Docs and cards (211a1e2, 2aa23fe):** no KPI placeholders left in README, the Devpost text, PRODUCT_FEEDBACK; kpi.png and
  deadlock.png re-rendered (52 race starts, 0 freezes on the fixed builds); tv-overview.png recaptured.
- **Tests:** `npx jest` 14 of 14 (2 suites), `tsc --noEmit` clean.
- **New, important: libW3CMedia SIGSEGV with sound on.** Three ACRs on this build, all `SIGSEGV` at
  `libW3CMedia.so + 0x63e844` on thread 0: 04:13:17 UTC while pressing Next through the Reveal cards every 1.4 s, 04:28:29
  and 04:35:14 UTC as Results opened (narrator "winner is" then the winLine voice). The app drops to "Your apps"; the
  last one was counted as "frozen" by `soak.mjs` (the launcher is a still screen) although the race itself was over.
  None in the first 10-start soak this morning, none with `MUTE=1` (no media stack). Not caused by #19/#20 (no audio
  code touched). Film on the VVD with `MUTE=1` (the build installed on the VVD now); with sound on, expect a crash about
  1 in 8 Reveal/Results screens on this VVD today. ACRs on the VVD: `crash_1792555997`, `crash_1792556909`, `crash_1792557314` (`vega device copy-logs -a SYSTEM_TOMBSTONE/acr`); F7 territory.
  **Root-caused and fixed later that morning: F13** (a per-clip source swap; `src/audio.ts` now never swaps).
- **Open:** the raised Doodle Boost! pill can cover the end of a straggler's lane tag (name and "+40% boost") when that
  runner is at the left edge (seen as "Gran" hidden in a 4-lane demo at 0:31); backlog #21 (boost badge folded into the
  name pill) would shorten the tags. The crown is centred on the sprite box, so on a creature whose head is off-centre
  (the dino) it sits over the neck. One more fake-phone creature in the Hall of Fame ("Dippy Doodlesaur" by Noah, from
  the one-player Reveal test), now first in the Demo party; the hall shows 68.


**Live view keyboard remote (21 Oct).** The live-view page forwards keys to the VVD as `inputd-cli` button presses over Unity's adb (override with `ADB=`), one at a time and in order: arrows, Enter (OK), Backspace/Esc (Back), Space (Play/Pause = ROAR), M (Menu); any other key is ignored. The server listens on 127.0.0.1 only. Checked with a fake adb that logged the exact presses, then on the live VVD: Down on Results moved focus from Play again to Home.

## 21 Oct, 10:20-12:10 IST: F13, the libW3CMedia SIGSEGV with sound on, root-caused and fixed

**F13. libW3CMedia crashes the app when the AudioPlayer's source is swapped for the next clip.**
Tool: `@amazon-devices/react-native-w3cmedia` 2.3.2 (`libW3CMedia.so`, `libkeplerscript-w3cmedia-lib-1.so.1`), VVD
headless, Vega SDK 0.24.12112. Task: creature voices and narrator lines on Reveal and Results, one clip at a time. Old
pattern: one `AudioPlayer` for the session and per clip a new `MediaSource` set as `srcObject`, `addSourceBuffer`,
append the whole fMP4 clip, `endOfStream()`, `play()`; a line queued behind a playing clip started from the `ended`
handler. Expected: every clip plays. Actual: about 1 in 8 Reveal/Results screens the app dropped to "Your apps"
(ACRs `crash_1792555997`, `crash_1792556909`, `crash_1792557314`, SIGSEGV at `libW3CMedia.so + 0x63e844`).
Severity: high (the party dies mid-game, and voices are a core feature).

*Steps.*
1. Read every thread's stack in the 3 ACRs' core dumps, with symbol names from the device libraries
   (`tv/scripts/acr-stacks.py`; `libW3CMedia.so`, `libkeplerscript-w3cmedia-lib-1.so.1`, `libKeplerMedia*.so`,
   `libkepler_media_player.so` pulled with `adb pull /usr/lib/...`).
2. Built a fast repro that needs no races: `AUDIOSOAK=1 tv/scripts/vbuild.sh release --run` builds
   `src/AudioSoak.tsx` instead of the game (the Reveal pattern: narrator, then an intro every 1.4 s; then the Results
   pattern: narrator, winLine 1.8 s later; on a loop, through the real `src/audio.ts`, voices from the Hall of Fame).
   `node tv/scripts/audio-soak.mjs 15` relaunches it after each crash and reads the clip counter off the screen;
   `adb shell loggingctl log -f -o short_precise` captured the w3cmedia log (its JS layer logs every call) around each
   crash.
3. Changed one thing at a time and re-ran the same soak, then the real game: `soak.mjs --screens 44` (now counts app
   crashes and Reveal/Results screens; a crash is never counted as a freeze) and the race-start soak.

*Evidence.* The 3 morning ACRs and both repro ACRs (`crash_1792558908`, `crash_1792559212`) have the identical
6-frame stack on the crashing thread (`libW3CMedia.so +0x64da44 / +0x64d9fc / +0x653e30 / +0x65449c / +0x6125a4 /
+0x613a6c` from the core dump; internal functions, no exported names), a long-lived libW3CMedia thread started with the
player; the crash log names it `COMM:JSThread`, but it is not the React Native JS thread (tid 18). The per-clip
pipeline threads (`ignite::BlockingCommandThread::_command_loop`, `Executor` task threads in
`libkepler_media_player.so`) are fresh in every ACR (one set, high tids): each clip builds a new pipeline. The React
Native JS thread at the moment of the crash: in 3 of 5 inside the next clip's `MediaSource.addSourceBuffer` (twice
in `isTypeSupported` -> `KeplerMediaDescriptor.queryMediaCapabilitiesSync`, once constructing the new
`ignite::media::SourceBufferStateImpl`, which builds a new `GstPipelineImpl`), in 1 releasing a `shared_ptr` inside a
w3cmedia TurboModule call, in 1 in a timer callback. The repro's device log, within 120 ms: `ended` -> our handler starts the queued line -> `MediaSource[55]` constructed -> `setting
srcObject` -> `load` -> `MediaSource[54]:+resetMediaElementHandle` -> `removeSourceBuffer 53` -> `DetachMediaSource` ->
the old pipeline (same `GstPipelineImpl` address) still posts duration and render-timing messages 80-100 ms later ->
new source attached -> `addSourceBuffer` -> SIGSEGV.

*Root cause.* A source change (`srcObject = new MediaSource`, which is also what `src = URL.createObjectURL(ms)` does
inside the library) detaches the old MediaSource and removes its SourceBuffer on the JS thread while the old pipeline
is still winding down from end-of-stream; libW3CMedia's own long-lived thread then crashes, consistent with it using
the removed source/buffer context. Starting the next clip from the `ended` handler made that overlap as large as
possible. No JS error, nothing of ours runs on that thread. (Also seen: the library keeps every MediaSource in
`GlobalMediaSources` and every SourceBuffer in its event router when `srcObject` is set directly, a small leak per clip.)

*Workaround / fix (`tv/src/audio.ts`, d301384): never swap the source.* One AudioPlayer, one MediaSource, one SourceBuffer for the
session. Each clip is appended at `timestampOffset` = the end of what is buffered, the player seeks to the clip's start
and plays, and pauses 400 ms after `waiting` follows `playing` (the clip ran out of data; `waiting` comes ~0.1 s before
the last samples are heard). `timeupdate` was no use as an end signal (with "position within 50 ms of the buffered end"
as the test, every clip in the first build ended on the fallback timer instead). A fallback timer ends a clip at its
length + 1.5 s. The library evicts old samples by itself (`DemuxerImpl::evict_coded_frames`). `hush()` (race mount, leaving a screen, app in background) now also pauses the
clip that is playing, so the race has no media events at all: the first sound-on soak of the fix had one race start
stuck on "3" while a 6 s Reveal voice played into the countdown (JS logged nothing after the blots mounted, the F4
picture). Unit test: `tv/test/audio.spec.ts` (fake w3cmedia: one `srcObject` for three clips, appends at 0, 1, 2).

| run (VVD, sound on) | clips / screens | crashes | race starts | frozen |
|---|---|---|---|---|
| repro, old `audio.ts` (15 min) | 216 clips | **5** detected (2 confirmed by ACR + log; 3 after the log stream dropped, no ACR) | - | - |
| repro, one MediaSource (15 min) | 193 clips | **0** (1 false detection: app still playing, no crash in the log) | - | - |
| game, one MediaSource, `--screens 44 --guests 2` | 24 Reveal cards + 20 Results | **0** | 21 | 1 (see above) |
| game, + `hush()` pauses, `soak.mjs 10 --guests 3 --rounds 5` | 12 Reveal cards + 10 Results | **0** | **10** | **0** |
| game, + `hush()` pauses, `--screens 44 --guests 3 --rounds 5` (06:11-06:43 UTC) | 26 Reveal cards + 25 Results | **0** | **25** (4-6 lanes) | **0** |
| **final build (d301384), total** | **38 Reveal cards + 35 Results = 73 screens** | **0** | **35** | **0** |

Morning, old code: 3 crashes, about 1 in 8 Reveal/Results screens; at that rate 73 clean screens in a row would
happen by chance with p = (7/8)^73 = 0.00006. No new Sketchlings ACR on the VVD after the repro's two (copy-logs at
06:45 UTC). The repro's crash detector first
trusted one `is-app-running` answer and counted an adb hiccup as a crash; both soak scripts now need "not running"
twice, 3 s apart.

Installed on the VVD now: the sound-on release build of d301384 (`tv/build/sketchlings_aarch64.vpkg`).

*What is audible now (sound-on build):* Reveal: the narrator's "Let's meet our Sketchlings!", then each creature's intro
as its card shows (a newer intro waits for the one playing; the latest wins; with fast Next presses some intros are
skipped). Results: the narrator's "And the winner is...", then the winner's win line. The race was silent until
22 Oct (now: 3-2-1-GO, ROAR, photo finish); a Reveal line still playing when the race mounts is cut off. Every line is
also a caption.

*Suggestion to Amazon:* make a source change safe at any time (stop the old pipeline's event delivery before freeing
its MediaSource/SourceBuffer contexts), fire `emptied`/`abort` for the old source, and document how to play many short
clips on one AudioPlayer (the README shows one MediaSource per player and never a second one; nothing says a swap is
risky). A short sound-effect API for games would avoid all of this. Unwinding every thread in `<minidump_stackwalk>`
would again have shown this in minutes.

*Tools.* Skill: `amazon-devices-vega-media-player`. Amazon Devices Builder Tools
MCP: `read_document` (`react_native_for_vega_get_started.md`, `react_native_for_vega_media_player.md`,
`react_native_for_vega_media_troubleshooting.md`; the w3cmedia README URL came back as navigation only) and
`search_documentation` (AudioPlayer + MediaSource: one snippet, the README's single-MediaSource example).
`symbolicate_acr` (gdb mode, `deviceId: emulator-5554`) on `crash_1792558908` failed again: "Failed to copy
.../temp_acr_debugFs/acr_libraries.txt to emulator-5554" (F8), so `acr-stacks.py` read the stacks. The package's own
README and JS (`node_modules/@amazon-devices/react-native-w3cmedia/dist`) showed what a
`srcObject` change does.

## 22 Oct, evening (20:00-21:25 IST): race audio back on, Hall of Fame freeze fixed

Setup for everything below: VVD headless, sound-on release builds through `vbuild.sh`, Mac output muted for the whole
run (and restored after), server on the Mac with offline personas (no API key; `server/data` restored from a copy
afterwards, so the live soak's 6 fake-phone creatures are gone again), Unity closed. The host was busy with
other jobs: load average 15-22, 9.7-9.9 of 10-11 GB swap in use, the VVD at ~530 % CPU. These are VVD numbers, not
Fire TV numbers (the VVD is not a performance test device, F12).

**Race audio (`Race.tsx`).** The countdown plays the bundled narrator clips "Three!", "Two!", "One!", "Go!" (~0.6 s
each, counts 0.9 s apart); each count calls `hush()` first, which pauses the one before on the one-MediaSource player
(F13: a pause and a seek, never a source swap). A ROAR start plays "ROAR!" and the second finisher crossing within
0.5 s of the first plays "Photo finish!"; both are dropped while another clip plays, so they never pile up. Race mount
still hushes a queued Reveal line. The frame loop is unchanged (one `setTimeout` per frame, 20 Hz until GO): audio
calls happen only on a count change, a ROAR start and the second finish, never per frame, with no extra React render.
Unit test `test/audio.spec.ts`: a ROAR while a clip plays is dropped; hush + the next count plays at once.

| check | silent race (HEAD de25070) | race audio |
|---|---|---|
| loop Hz, 5-lane demo race, overlay read ~1/s (seconds 2-24) | 23-58, median 49.5 (n 22) | 28-58, median 51 (n 23) |
| loop Hz, 6-lane demo race | 49-59, median 53 (n 23) | 47-59, median 53 (n 23) |
| JS ms/frame, 6 lanes | 0.3-0.8, median 0.4 | 0.3-1.5, median 0.4 |
| race starts soaked (soak table) | - | **30, 0 frozen, 0 app crashes** (25 + 5 on the final build; 1 checked late, below) |
| new ACR files on the VVD | - | none during the race soaks (16 before and after); the evening's one new ACR is the Hall of Fame freeze (F11) |

Both builds were measured the same way within 35 minutes of each other, so the A/B is fair; both are below the
55-62 Hz of 21 Oct because the host was busier. In one 5-lane race the overlay's clip counter (session total) went
7 -> 11 -> 16 between ~3 s and ~20 s.

*Audible in a recording.* `adb emu screenrecord start --time-limit 20 --fps 30` over Results -> Play again -> the
countdown. The webm has a Vorbis 44.1 kHz stereo track. Loudness per 50 ms: four ~0.5 s bursts starting at 3.60,
4.55, 5.55 and 6.40 s, silence between; the picture (frames read at 5 fps) shows 3 at 3.4 s, 2 at 4.4 s, 1 at 5.4 s and
GO! at 6.4 s, so sound and picture agree within ~0.2 s. Matching log-band spectrograms against the bundled clips puts
"three" at 3.60 s (r 0.64), "one" at 5.56 s (0.74) and "go" at 6.41 s (0.55); the second burst matches all four
weakly (0.33-0.35). Then three ROAR-length bursts at 10.0, 13.5 and 16.7 s. (Scripts and files in a temp folder, not kept.)

*Soak runs.* `soak.mjs 10 --guests 2` (5 lanes): 10 of 10. `--guests 3` (6 lanes): 10 of 10, but the first session's
lobby count was misread by Vision ("showl (6)"), so the soak pressed 4 of 6 Reveal cards and checked that start on a
Reveal card; the race then started on its own and its clock was seen running in the wait shots (`soak.mjs` now
accepts the misread and reads twice). Live with 6 fake phones (`ROOM=BNDR` build, `--live 6 --room BNDR`): 5 of 5,
6 lanes confirmed on screen. 0 app crashes over all Reveal cards and Results screens.

**Hall of Fame freeze (F11, second part).** Reproduced with screenrecord running (2 of 13 visits), root-caused from
an ACR as the F4 watchdog deadlock, fixed by mounting only the rows near the focus; 27 visits clean. Details in F11.

## 23 Oct, 01:00-03:45 IST: final check before the kids' session

Setup: VVD headless, sound-on release builds through `vbuild.sh`, Mac muted throughout. Server from `server/` with
`.env` (Claude) and `SKETCHLINGS_FAIL_EVERY=4`; `server/data` backed up first and restored after (hall.json sha
unchanged, 68 entries). Host busy: load 12-16, 11-11.5 of 12 GB swap in use, a Unity build running.
These are VVD observations, not Fire TV numbers.

**Fixed tonight (tv/):**
- *AI personas choice is not saved.* Legacy `AsyncStorage` (react-native-kepler) said `setItem` worked, but `getItem`
  read back `null` after a relaunch, whether the app was force-stopped or closed with Back (checked with an on-screen
  debug line). The storage code is gone: the choice is off at every launch, and Grown-ups says "Until the app closes."
  The run sheet already has the grown-up turn it on after each launch.
- *Lobby chip stuck grey or stuck bright.* A phone that dropped and rejoined (same playerId; the server's players
  frame said `connected: true`) stayed greyed on the TV, and a drop did not grey it. A debug overlay showed every
  players frame arriving in order; the `opacity` on the chip's `Animated.View` (native-driven scale) was simply not
  redrawn. Moved to a plain wrapper View: drop greys it, rejoin brightens it (checked on the VVD).
- *Long creature names cut off.* "Whooshy Lemon" showed as "Whooshy Lem..." on the Reveal. `fitFont` now assumes
  0.62 em a character (was 0.54); short names keep 60 dp.
- Grown-ups cards: buttons moved down 10 dp so the focus scale no longer covers the last line of text.
- `vbuild.sh` `ROOM=` hook follows `tvHello(code.current)`.

**Grown-ups (D-pad only):** Up from any Home tile reaches the button; Down returns to Start party. Focus starts on a
wrong answer; a wrong answer and Back both go Home with focus on Grown-ups. Right answer opens it; the switch flips
and the Lobby shows "AI personas: on" / "off. Grown-ups can turn them on."; the server logs `[consent] room …: AI
personas off` only for off. Clear Hall of Fame: Keep returns focus to Clear; Delete all said "Done: 68 creatures
deleted." (server: `[hall] cleared by the TV: 68 creatures`), then the empty hall shows "No Sketchlings yet". Data
restored from the copy.

**D-pad/Back audit:** Home, How to play (Got it! and Back), Grown-ups, Lobby (live and demo), Reveal, Race, Results,
Hall of Fame, Demo party: focus visible on every screen, first focus on the main action, no traps. Back: Reveal,
Race and Results in a live party go to the Lobby (room kept, same code); the first Back on a live Lobby with players
shows "Press Back again to end the party" for 4 s; demo screens go Home. Right from Grown-ups does nothing (nothing
there); Down leaves.

**Two rounds, fake phones** (copy of fake-phones.mjs: one ability change, one drop and rejoin in the Lobby, one
held pad): room GCNT, 4 phones: Claude personas 4.8-5.2 s, 1 injected failure fell back to offline in 29 ms,
upload->voices 13.3-13.5 s with 3 at once; the ability change came back `chosenBy: artist` and the Reveal said
"Zoe's pick →"; the rejoin kept the same playerId. Race 1, Play again, race 2, Lobby (same code), Back twice, Hall of
Fame "Race again" pick, new room with 3 phones + the guest: Reveal, race 3, Results. Server lines per race:
`[net] race rtt ms` (0-1 ms median, localhost) and `[race] inputs` (4.5-4.9 taps/s, hold 7.0 s for the held pad).

**Real phone page** (phone/dist from the server, chrome-headless-shell with `--mute-audio`, 390x844 mobile, 3
phones, LAN join URL read from the TV's QR): name, age, photo through the file input (the sample marker-drawing photo
plus two crayon drawings photographed on paper, made in a canvas), preview, card, one ability change ("You picked"),
one page reload in the Lobby (card back, chip bright), Reveal, two races (taps, a 3 s hold, jumps, ROAR), Results
on every phone. All checks pass, twice (AI on, and AI off after the new doodle-cutout went into phone/dist). Shots in
a temp folder (`phones/`, `phones2/`). Not a real phone, not real Wi-Fi.

**Soak, race audio on:** 40 race starts (20 at 6 lanes, 20 at 5), 0 frozen, 0 app crashes, 0 new ACRs (17 before
and after). Loop 54-59 Hz, median 59, JS 0.2-0.3 ms/frame (4-lane demo race, overlay read 8 times). Hall of Fame:
15 visits (OK, Right, Down, Down, Back) with `adb emu screenrecord` running, 0 flagged. The race narration stays.

**`scripts/session.sh --lan`, once for real:** start (VVD found, app launched, server, live view at 25-29 fps, chunk
recording), `take zz-test-take` (chunk ended, take started, `video/clips/zz-test-take.webm` link made; VP9 + Vorbis),
stop (server, live view and its Chrome window gone; 8 s + 13 s files listed). Test files deleted.

