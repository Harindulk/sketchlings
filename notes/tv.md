# TV app notes (React Native for Vega, SDK 0.24, RN 0.83)

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
- Not measured: UI fluidity %, memory, focus response (the KPI Visualizer needs a `--test-scenario` script for fluidity;
  no time left).

## Audio outcome on the VVD

- Setup: `@amazon-devices/react-native-w3cmedia` 2.3.2, `AudioPlayer(CONTENT_TYPE_SPEECH, USAGE_GAME)`, MSE:
  `addSourceBuffer('audio/mp4; codecs="mp4a.40.2"')`, append whole clip, `endOfStream()`, `play()`. URL mode is the
  fallback if appending throws (never needed). Manifest `[wants]`: mediametrics, mediabuffer, mediatransform,
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
  PID). Not proven: that the samples are non-silent. Nothing on the Mac can capture the VVD's output (no loopback
  device installed, `screenrecord` has no audio track), so audibility still needs ears or a real Fire TV.
- The race is silent since 21 Oct (no countdown narration, no ROAR sound, no catchphrase at the finish; captions carry
  all of it). Voice and narrator play only on Reveal and Results, one clip at a time, never interrupted. A Reveal line
  still queued when the race mounts is dropped (`hush()`); one already playing finishes (at most a few seconds into the
  countdown). Every voiced line has an on-screen caption: Reveal intro = speech bubble, narrator "meet the Sketchlings"
  = header, "winner is" = "<name> wins!" title, winLine = Results bubble; the finish catchphrase is a caption only.
- For recordings and automated runs use `MUTE=1` (sets `SOUND = false`, no media stack at all); dub the server's .m4a
  clips in the edit.

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
voice lines dropped at mount). Removed the 20 Oct workarounds that targeted a wrong theory (commit fence, loop
"kick" restarts: a blocked JS thread runs nothing, so they could never help). Soak: see "Soak record" below.
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
`libW3CMedia.so` with a JS frame in the w3cmedia bundle: another way audio can hang JS. Since 21 Oct the race plays
no audio at all.

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

## Soak record (race starts on the VVD, `tv/scripts/soak.mjs`)

| build | party | race starts | frozen |
|---|---|---|---|
| 20 Oct final (before the fix), sound on | demo | 12 (run on 21 Oct) | 0 |
| fix step 1 (1 task/frame, silent race, no fence/kick) | demo | 12 | 0 |
| + native-from-birth values + abilities (21 Oct, ~00:00) | demo | 10 | 0 |
| **final** (21 Oct, commit afdb370), sound on | demo | **10** | **0** |
| **final** + fixed room code (soak-only) | live, 4 fake phones (10 rounds) | **10** | **0** |

Final build: 20 race starts, 0 frozen; 42 since the fix. Sessions that lost keys to adb restarts (F6) or hit a VVD
crash (F5) never reached a race and are not counted. Shots of every race (+4.5 s and +6 s) were checked by the soak
for a stuck countdown and for a still screen.

The old build also passed on 21 Oct, so a clean soak alone doesn't prove the fix; the proof is the mechanism (F4)
plus removing the app's share of the watchdog traffic at race start. Freezes on 20 Oct happened with the Mac under
heavy load; the VVD itself kept crashing under the same load on 21 Oct (F5).

## Open issues

- F4 is a platform deadlock; the app now gives it far less to chew on but cannot rule it out. Soak on a real Fire TV
  before filming there; on the VVD film with `MUTE=1` and keep the Mac's memory free (F5).
- Audio audibility unverified (the VVD's output reaches the Mac speakers, see Audio outcome, but nothing captured it).
- The Hall of Fame on the server is full of test creatures (fake-phone uploads: 41 entries, mostly "Little
  Marshmallow" / "Professor Tumble"); the Demo party now shows them. Clear `server/data` before filming.
- Audio on the VVD is fragile beyond F7: an ACR from a soak on 21 Oct (18:55 UTC) is a SIGSEGV inside
  `libkepler_media_player.so` (media thread), and while the Hall of Fame picture was frozen (F11) w3cmedia kept
  logging "No Time update even in Playing state: 0.951" every 250 ms (a player stuck mid-clip). Another reason to
  film on the VVD with `MUTE=1`.
- Unity's `-adb2` asset worker kept restarting the adb server on 21 Oct (F6), so soak sessions sometimes lost keys
  and failed to reach a race; those are counted as "failed to start", never as passes.
- After the live soaks the Hall of Fame's newest creatures are all fake-phone uploads that the server gave the `walk`
  ability, so the Demo party currently shows four walkers (only BIG ROAR pops). Clear `server/data` before filming
  (or check the server's shape detection); with the bundled samples the demo has walk, hop, fly and roll.
- The offline eye finder put a second pair of googly eyes above some fake-phone drawings (server side, seen on the
  star "Little Marshmallow").
