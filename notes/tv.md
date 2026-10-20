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

## Build, run, drive (exact commands)

```sh
source ~/vega/env
cd tv && npm install                       # once (no .npmrc legacy-peer-deps: it breaks the CLI plugin, see F2)
tv/scripts/vbuild.sh release --run         # build + install + launch on the VVD (works around F1: spaces in path)
MUTE=1 tv/scripts/vbuild.sh release --run  # same, sound off (use for automated runs and screen recording)
tv/scripts/remote.sh right|left|up|down|select|back|menu|playpause [n]   # D-pad / remote keys
tv/scripts/remote.sh shot out.png          # 1920x1080 screenshot (adb emu screenrecord screenshot)
node tv/scripts/fake-phones.mjs <ROOM> [count] # simulated phones: join, upload a drawing, tap/jump/shout in the race
cd tv && npx jest && npx tsc --noEmit -p . # race-sim + narrator-decoder tests, typecheck
```

- Keys: `adb -s emulator-5554 shell inputd-cli button_press KEY_DOWN` (dev-mode `inputd-cli` exists on the VVD; no
  `vsm developer-mode enable` needed). Codes used: KEY_UP/DOWN/LEFT/RIGHT/ENTER/BACK/MENU/PLAYPAUSE.
- If Unity is open, set `ADB=/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb`
  before `remote.sh` (see F6).
- Server: `src/config.ts` `HOST = '10.0.2.2:8787'` (VVD -> Mac). Real Fire TV: the Mac's LAN IP, rebuild.
- In a race, **Menu** toggles the perf overlay: fps, JS ms/frame, loop restarts, input latency, audio state.
- Demo party: the remote plays for player 1 (OK = run, Up = jump, Play/Pause = ROAR); other lanes are bots.

## What is built (all verified on the VVD with screenshots in notes/shots/)

Home (tiles, focus scale+glow+wobble, `hasTVPreferredFocus`, `TVFocusGuideView`, aria-labels, "Running on Fire TV ·
Vega OS"), Lobby (QR via `@amazon-devices/react-native-qrcode-svg`, room code, chips with scan status + age boost
badge), Reveal (paper tear, overshoot pop, name/title/"Drawn by", stat bars, intro bubble, voice), Doodle Dash
(parallax notebook, lanes, move styles walk/hop/fly/roll, googly eyes with physics, ink blots + stun, Doodle Boost,
age boost, ROAR with shake, 3-2-1-GO, finish caption, medals), Results (podium, crown, confetti, winLine bubble +
voice), Hall of Fame (server list, focus-follow scroll, details panel), How to play, Demo party (offline, bundled art).
Fonts: Baloo 2 (OFL, `tv/assets/fonts`, `fontFamily` = file name). Art: our own SVGs (`tv/art-src/make-art.mjs`).
Amazon skills used: `amazon-devices-vega-media-player` (audio setup/manifest), `amazon-devices-vega-app-performance`
(KPI Visualizer). Their MCP server (`amazon-devices-buildertools-mcp`) was not connected in this session, so the
docs were read on developer.amazon.com and from the package typings instead.

## Measured on VVD (Vega Virtual Device, headless, macOS 27, Apple silicon)

- **Cool start** (`vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main --kpi cool-start-latency
  --iterations 3`): TTFF mean **408 ms** (min 192, max 553), TTFD mean **409 ms** (we call `useReportFullyDrawn` on
  Home's first frame), JS bundle load 17.6 ms. Targets: TTFF < 1.5 s, TTFD < 8 s.
- **Race loop**: 57-65 fps, **0.1-1.2 ms JS per frame** (4-6 lanes), read from the in-app overlay.
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
- Result: `MediaSource.isTypeSupported` true; for both bundled narrator clips and server voice clips `appendBuffer`,
  `endOfStream` and `play()` succeed (overlay: "audio MSE play() ok"); narrator clips fired `ended` in demo mode.
  **Audibility could not be verified**: the headless VVD has no audio we can capture and `screenrecord` has no audio.
- While a long creature voice played, the VVD's JS timers/rAF slowed to a crawl (see F7). Clips now never interrupt
  each other (queue, narrator dropped while a voice plays). For screen recordings use `MUTE=1` and dub the server's
  .m4a clips in the edit; verify sound on a real Fire TV.

## Friction log (Vega SDK snags hit while building the TV app)

**F1. Build fails when the project path contains spaces.** Task: `npm run build:release` in
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

**F4. Intermittent JS stall at race start (AppNotResponding).** Steps: Demo party or live party, race mounts with ~30
native-driven `Animated.Value`s updated by `setValue` each frame. Expected: countdown. Actual (about 1 in 4 races, more
often with audio playing): stuck on "3"; JS still handles some key events, but `setTimeout`, rAF and Animated
completion callbacks stop; Fabric mutation counter frozen in the log; after Back the LCM kills the app: ACR
`CrashReason: AppNotResponding`, `LCM_ANR_REASON: Lifecycle Callback`, `JSThread ... No JavaScript code is currently
being executed`, main thread parked in `libkeplerscript-4.so` (pull with `vega device copy-logs -a SYSTEM_TOMBSTONE/acr`).
Log beforehand: `[AnimatedNode] updateNodeIfNecessary called for released parent`, `Illegal node tag set as input for
AnimatedNode`, `Volta: Slow frame threshold exceeded, ms: 568`. Mitigations that helped (5/5 clean soak): build every
Animated node once (`useMemo`, never in render), a "commit fence" (no `setValue` for 90 ms around each React update in
the race), start the frame loop only after the native-attach animations complete, countdown + results timed by the
frame loop, and remote/phone input re-kicks a loop that hasn't ticked for 500 ms. Calling `setValue` from inside an
`Animated` value listener froze JS deterministically (don't). Severity: critical for animation-heavy apps.
Suggestion: investigate native-animated vs Fabric commit locking on Vega; surface a JS stack in the ACR.

**F5. Headless VVD crashes after ~2 h** with the same crashpad `UniversalExceptionRaise: (os/kern) failure (5)` as the
GUI mode (FRICTION_LOG #1). `vega virtual-device start --no-gui --timeout 300` reboots in ~8 s; reinstall the app.

**F6. Two adb versions fight.** `vega` / Homebrew adb 37.0.1 vs Unity Editor's adb 36.0.0 (Unity running `-adb2`
restarts its server): every switch kills the other's server ("daemon not running; starting now", "device offline"),
dropping key presses mid-test. Workaround: use the same adb as Unity (`ADB=...` above) while Unity is open.
Suggestion: `vega` could use its own adb port or report the version clash.

**F7. Audio activity degrades JS scheduling on the VVD.** While the w3cmedia AudioPlayer plays a 5 s clip and another
clip replaces the `srcObject`, frames drop to 0-15 fps and the countdown stalls; `ended` never fires for the replaced
clip. Workaround: never interrupt a playing clip; build with `MUTE=1` for recordings. Unknown if real hardware is affected.

**F8. Docs/tooling gaps.** `expo-font` is "not supported" for RN 0.83, but plain `assets/fonts/*.ttf` +
`fontFamily: '<file name>'` works (the family name does not). `loggingctl log -v <pkg>` shows native logs but no
`console.log` output from release builds. The Amazon Devices Builder Tools skills need an MCP server that is not set up
by the skill install. `vega exec perf kpi-visualizer` fails "Network calls time" validation when an app makes no
network calls at launch ("-1 != -1").

## Open issues

- F4 is mitigated, not root-caused; soak on a real Fire TV before filming there. On the VVD, film with `MUTE=1`.
- Hall of Fame "race again" (retention loop) not built.
- Audio audibility unverified (VVD).
- Not visually re-verified after the last changes: the FINISH caption (winner's catchphrase bubble) and the ROAR pill's
  new position beside the head (it was verified at the old position, 04h). Lane clamp, colour rings and the 30 dp hint
  are verified (04b-04d). Shots 04f/04h predate the ring/lane change.
- Soak record for the final build: 4/4 demo races + replays clean, plus 1 on a freshly rebooted VVD.
