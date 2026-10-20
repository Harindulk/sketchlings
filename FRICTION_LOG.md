<!-- Resolve every "TODO(" before submitting. -->

# Friction log: building Sketchlings on Vega

Real problems hit while building a React Native for Vega app, ordered by severity. Each entry has the tool and version, the task, the steps, expected vs actual, severity, the workaround and a suggestion. Problems with tools outside the Amazon ecosystem are in a short appendix.

**Setup:** MacBook (Apple silicon, 16 GB), macOS 27.0.1, Node 26.12, npm 11.20.0, Vega SDK 0.24.12112, Vega CLI 1.4.5, Vega Perf CLI 0.24.0, Vega Virtual Device with the bundled Android emulator 34.1.15, `@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0. No Fire TV hardware was used.

**Severity:** **High** = you can't see the app, or it hangs. **Medium** = blocks a task until you find an undocumented workaround. **Low** = an annoyance with an easy workaround.

| # | Problem | Tool | Severity |
|---|---|---|---|
| 1 | VVD window crashes on boot on macOS 27; headless mode crashes the same way after about 2 hours | Vega Virtual Device | High |
| 2 | JS thread freezes (AppNotResponding) when React commits overlap native-driver animation updates | React Native for Vega, on the VVD | High |
| 3 | `requestAnimationFrame` fires about 1250 times a second on the headless VVD | Vega Virtual Device (headless) | High |
| 4 | The build fails when the project path contains a space | Vega SDK build (`kepler-compatibility-metro-config`) | Medium |
| 5 | The `.npmrc` step in the qrcode-svg docs removes the `build-vega` command | Vega docs, `react-native-qrcode-svg` | Medium |
| 6 | Audio playback slows JS timers and frames to a crawl on the VVD | `react-native-w3cmedia`, on the VVD | Medium |
| 7 | w3cmedia needs eight manifest services for a 2-second clip; missing ones fail quietly | `react-native-w3cmedia` | Medium |
| 8 | No `vega` command or docs page for screenshots or recording; the SDK's `vda` can't do it | Vega Virtual Device, Vega CLI | Medium |
| 9 | ADBT `init-context` ignores its own Node 24 requirement | Amazon Devices Builder Tools MCP | Medium |
| 10 | Remote keys on a headless VVD: no `vega` command, and the docs' developer-mode step didn't match | `inputd-cli`, Vega CLI | Low |
| 11 | `loggingctl` shows no `console.log` output from release builds | `loggingctl` | Low |
| 12 | KPI Visualizer fails validation when the app makes no network calls at launch (`-1 != -1`) | Vega Perf CLI (`kpi-visualizer`) | Low |
| 13 | The Vega skills depend on the ADBT MCP server and add little without it | Amazon Devices Builder Tools skills | Low |
| 14 | The VVD clock ran about 2 h 11 min behind the Mac | Vega Virtual Device | Low |
| 15 | qrcode-svg needs a `TextEncoder` polyfill in the app | `react-native-qrcode-svg` | Low |
| 16 | Custom fonts on RN 0.83: `expo-font` lists only RN 0.72, and `fontFamily` must be the file name | `@amazon-devices/expo-font` docs, React Native for Vega | Low |
| 17 | Installer: no telemetry opt-out at install, scripted mode undocumented | Vega SDK installer | Low |

---

## 1. Vega Virtual Device window crashes on boot (macOS 27); headless crashes after about 2 hours

- **Tool / version:** Vega Virtual Device (Vega SDK 0.24.12112, bundled Android emulator 34.1.15), Vega CLI 1.4.5, macOS 27.0.1 on Apple silicon.
- **Task attempted:** start the VVD to run the helloWorld template, then keep it running through a day of development.
- **Steps taken:** `source ~/vega/env`, then `vega virtual-device start --timeout 240`. Later, the headless VVD (`--no-gui`) was left running for long test sessions.
- **Expected:** the VVD window opens and the CLI prints "Virtual device ready", and the VVD stays up.
- **Actual:** "Deadline reached (240s) but virtual device unresponsive." `vega virtual-device status` reports `{"running":false}`. `virtual_device.err` ends with a crashpad `UniversalExceptionRaise: (os/kern) failure (5)` after many `sPrepareTexImage2D ... failed validation` lines and "running without ARB/KHR robustness in place may crash". The bundled emulator warns that it doesn't support features such as `Vulkan`, `HVF`, `TvRemote` and `ScreenRecording`. Headless mode boots, but after about 2 hours it crashed with the same crashpad `UniversalExceptionRaise: (os/kern) failure (5)`.
- **Severity:** High. You can't see your app. It also removes the on-screen remote (#10) and the window's own capture menu (#8), and headless mode also crashed after about 2 hours.
- **Workaround:** `vega virtual-device start --no-gui --timeout 300` boots fine headless. View the screen with `adb -s emulator-5554 emu screenrecord screenshot <dir>`. After a headless crash the same command reboots it in about 8 s; then reinstall the app.
- **Suggestion:** surface the emulator crash instead of a generic timeout. Offer a software-GPU fallback on macOS (`--no-gl-accel` is Linux-only today) or update the bundled emulator. Publish a macOS version support matrix.

## 2. JS thread freezes (AppNotResponding) when React commits overlap native-driver animation updates

- **Tool / version:** React Native for Vega (`@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0), `Animated` with `useNativeDriver: true`, on the Vega Virtual Device (headless), Vega SDK 0.24.12112.
- **Task attempted:** run the Doodle Dash race at 60 fps with up to six racers (about 30 native-driven `Animated.Value`s) while React updates the countdown and the placings.
- **Steps taken:** a game loop calls `Animated.Value.setValue()` every frame on values driven by the native driver. React state changes during the race (the 3-2-1 countdown, finish places). Some `Animated` interpolation nodes were rebuilt when the component re-rendered. Run in Demo party and in live parties with simulated phones.
- **Expected:** native-driver values keep updating while React renders, or a JS error if the usage is wrong.
- **Actual:** about 1 race in 4 stuck on "3" (more often with audio playing, see #6). JS still handled some key events, but `setTimeout`, `requestAnimationFrame` and `Animated` completion callbacks stopped, and the Fabric mutation counter in the log froze. After Back, the lifecycle manager killed the app with an ACR (pulled with `vega device copy-logs -a SYSTEM_TOMBSTONE/acr`): `CrashReason: AppNotResponding`, `LCM_ANR_REASON: Lifecycle Callback`, JS thread "No JavaScript code is currently being executed", main thread parked in `libkeplerscript-4.so`. The log before a stall showed `[AnimatedNode] updateNodeIfNecessary called for released parent`, `Illegal node tag set as input for AnimatedNode` and `Volta: Slow frame threshold exceeded, ms: 568`. Three triggers were found:
  1. At race start, `setValue()` racing the zero-length animations that attach values to the native driver.
  2. A React commit landing while the loop streamed native-animated updates.
  3. `Animated` nodes rebuilt on a re-render while the loop set their parent ("released parent").

  Calling `setValue()` from inside an `Animated` value listener froze the JS thread every time.
- **Severity:** High. The app hangs mid-race, and the family loses the game.
- **Workaround:** (a) build every `Animated` node once with `useMemo`, never in render; (b) a "commit fence": after any React update in the race, skip `setValue()` for 90 ms, then resend; (c) start the frame loop only after the native-attach animations complete; (d) time the countdown and results from the frame loop, not separate timers; (e) remote or phone input restarts a loop that hasn't ticked for 500 ms; (f) send a value only when it changed, and never call `setValue()` from a value listener. With these, a 5-race soak was clean, and the final build ran 4 demo races plus replays clean, plus 1 on a freshly rebooted VVD. This is mitigated, not root-caused. See `tv/src/screens/Race.tsx`.
- **Suggestion:** investigate locking between the native animated module and Fabric commits on Vega, and throw a JS error instead of hanging. Include a JS stack and the last native animated error in the ACR. Document a safe pattern for per-frame game loops. TODO(measure: try to reproduce on Fire TV hardware.)

## 3. `requestAnimationFrame` fires about 1250 times a second on the headless VVD

- **Tool / version:** Vega Virtual Device, headless (`--no-gui`), Vega SDK 0.24.12112; React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** run the race loop once per display frame.
- **Steps taken:** drive the race simulation from `requestAnimationFrame`, one step per callback, and check the loop rate.
- **Expected:** about 60 callbacks a second, in step with the display.
- **Actual:** about 1250 callbacks a second. The race ran about 10 times too fast, and JS timers were starved, so the countdown never advanced.
- **Severity:** High. The game was unplayable until worked around, and nothing in the logs points at the cause.
- **Workaround:** pace the loop in JavaScript. If less than 13 ms has passed since the last frame, wait with `setTimeout` until 15 ms. Always yield with `setTimeout(0)` before asking for the next `requestAnimationFrame`. See `tv/src/screens/Race.tsx`.
- **Suggestion:** tie `requestAnimationFrame` to a virtual vsync in headless mode, or document the difference. Expose the display refresh rate to apps. TODO(measure: does it also happen with the VVD window, or on hardware? The window can't be tested on macOS 27.)

## 4. The build fails when the project path contains a space

- **Tool / version:** Vega SDK 0.24.12112 build (`npm run build:release`, which runs `react-native build-vega`), `@amazon-devices/kepler-compatibility-metro-config` 0.0.7, Node 26.12.
- **Task attempted:** build the TV app from a project folder under `~/Library/Application Support/...`.
- **Steps taken:** `cd tv && npm run build:release`.
- **Expected:** the build succeeds, or fails with a clear message about the path.
- **Actual:** `kepler-compatibility-metro-config` runs the manifest builder through `execSync` without quoting the path. The build fails with `/bin/sh: /Users/.../Library/Application: No such file or directory` and "Unable to generate a manifest".
- **Severity:** Medium. It blocks the build completely, the error looks like a missing file, not a quoting bug, and `~/Library/Application Support` is a common macOS path.
- **Workaround:** `tv/scripts/vbuild.sh` rsyncs `tv/` and `shared/` to a folder without spaces, builds there and copies the `.vpkg` back. Or clone the repo to a path without spaces.
- **Suggestion:** quote the path, or use `execFileSync` with an argument array. Add a CI build with a space in the project path. Until it is fixed, check for spaces at the start of the build and print a clear message.

## 5. The `.npmrc` step in the qrcode-svg docs removes the `build-vega` command

- **Tool / version:** Vega API docs page for `react-native-qrcode-svg` (0.24), `@amazon-devices/react-native-qrcode-svg` 3.0.0+6.3.15, React Native for Vega 4.0.1+rn0.83.0, npm 11.20.0.
- **Task attempted:** add the join QR code to the Lobby screen, following the docs.
- **Steps taken:** added the package, then followed the install step that says "Due to a known issue with React Native dependencies, you must apply the following workaround": `legacy-peer-deps=true` in `tv/.npmrc`. Ran `npm install`, then `npm run build:release`. The step sits after the per-version tabs, so it reads as applying to RN 0.83 too.
- **Expected:** the build still works.
- **Actual:** `error: unknown command 'build-vega'` (`Cannot find module '@react-native-community/cli-tools'`). Nothing points at the `.npmrc` as the cause.
- **Severity:** Medium. It breaks the build with an error that looks unrelated to the QR package.
- **Workaround:** don't add the `.npmrc`. A plain `npm install` resolves qrcode-svg 3.0.0 and its dependencies fine on RN 0.83.
- **Suggestion:** limit the `.npmrc` step to the versions that need it, or fix the peer dependencies so it isn't needed. If `legacy-peer-deps` stays, warn that it can drop the Vega CLI plugin's dependencies.

## 6. Audio playback slows JS timers and frames to a crawl on the VVD

- **Tool / version:** `@amazon-devices/react-native-w3cmedia` 2.3.2 (`AudioPlayer`, Media Source Extensions), on the Vega Virtual Device (headless), Vega SDK 0.24.12112.
- **Task attempted:** play creature voice lines (up to about 5 s) and narrator lines during the reveal and the race.
- **Steps taken:** one `AudioPlayer` for all clips. While a 5 s clip was playing, the next clip replaced the player's `srcObject` with a new `MediaSource`.
- **Expected:** the new clip plays and the game keeps running at full speed.
- **Actual:** while the long clip played and another replaced it, the game dropped to 0 to 15 fps and the countdown stalled. The `ended` event never fired for the replaced clip. More race-start stalls (#2) happened with audio playing.
- **Severity:** Medium. It makes the race stutter or stall, and the cause isn't obvious.
- **Workaround:** never interrupt a playing clip: lines are queued, and a narrator line is dropped while a creature voice plays. A safety cap clears the "busy" state if `ended` never arrives. For screen recordings, build with `MUTE=1` (`tv/scripts/vbuild.sh`) and dub the clips in the edit. See `tv/src/audio.ts`.
- **Suggestion:** investigate why replacing the source of a playing `AudioPlayer` starves the JS thread on the VVD, and fire `ended` (or an abort event) for the replaced clip. Document how to switch clips safely. TODO(measure: does it also happen on Fire TV hardware?)

## 7. w3cmedia needs eight manifest services for a 2-second clip; missing ones fail quietly

- **Tool / version:** `@amazon-devices/react-native-w3cmedia` 2.3.2, Vega SDK 0.24.12112, `manifest.toml` schema-version 1, on the Vega Virtual Device.
- **Task attempted:** play short creature voice lines and narrator lines (AAC-LC in fragmented MP4, 0.5 to 5 s each).
- **Steps taken:** followed the Vega media player setup docs. Declared media services under `[wants]` in `manifest.toml`. Created `AudioPlayer(CONTENT_TYPE_SPEECH, USAGE_GAME)`, called `initialize()`, attached a `MediaSource`, appended the whole clip to one `SourceBuffer` (`audio/mp4; codecs="mp4a.40.2"`), called `endOfStream()` and `play()`.
- **Expected:** the clip plays, or an error names what is missing.
- **Actual:** without `com.amazon.audio.system` in `[wants]` the log shows "Unable connect to 'com.amazon.audio.system'. Missing the permissions". The media docs say missing `[wants]` services give silent failures. Eight services are needed in the end, even for a 2-second clip: `mediametrics.service`, `mediabuffer.service`, `mediatransform.service`, `audio.stream`, `audio.control`, `audio.system`, `media.server` and `media.playersession.service` (all `com.amazon.*`). With all eight, `MediaSource.isTypeSupported` returns true, and `appendBuffer`, `endOfStream` and `play()` succeed for bundled and server clips; narrator clips fire `ended`. Whether sound actually comes out could not be checked: the headless VVD's audio can't be captured, and `screenrecord` records no audio (#8). TODO(verify: audible playback on a Fire TV or the VVD window.)
- **Severity:** Medium. Voices are a core feature, and failures are quiet.
- **Workaround:** declare all eight services. The app loads w3cmedia lazily, logs `isTypeSupported`, falls back from MSE to URL mode if appending throws (never needed on the VVD), and turns sound off for the session on the first failure so the game never blocks. Narrator clips are bundled as base64 strings in a TypeScript module, so they play without reading binary assets from the package.
- **Suggestion:** a build-time check that warns when w3cmedia is a dependency but its services are missing from `[wants]`. A runtime error that names the missing service. A short "play a sound effect" recipe or API for games. State clearly whether the VVD supports audio output.

## 8. No `vega` command or docs page for screenshots or recording; the SDK's `vda` can't do it

- **Tool / version:** Vega Virtual Device (bundled emulator 34.1.15), Vega CLI 1.4.5, Vega SDK 0.24.12112 with Vega Device Adapter (`vda`) 2.6.
- **Task attempted:** capture screenshots and a full-length video of the app for the hackathon demo.
- **Steps taken:** looked for a `vega` command (`vega device --help` lists none for capture) and checked the docs. No page in the Vega 0.24 docs index has screenshots or screen recording in its title or summary. Then used the emulator console through `adb` from Android SDK platform-tools: `adb -s emulator-5554 emu screenrecord screenshot <dir>`, and `... emu screenrecord start <file.webm>` / `stop`. We did not try the Appium route the docs describe for UI tests.
- **Expected:** a `vega` command for screenshots and recording.
- **Actual:** the docs only mention "Dump Render Tree" and "Dump Rendered Text" in the window's context menu, which doesn't exist headless (#1). The bundled emulator warns that it doesn't support `ScreenRecording`, yet `adb emu screenrecord` works, including a full-HD recording, but the recording has no audio. The SDK ships its own adb-like tool, `vda`, but `vda help` lists no `emu` (emulator console) command, so a separate `adb` is needed.
- **Severity:** Medium. Video is required for the submission, and the working route is undocumented.
- **Workaround:** install Android SDK platform-tools for `adb`. `tv/scripts/remote.sh shot <out.png>` wraps the screenshot command. Record with `MUTE=1` and add the audio clips in the edit.
- **Suggestion:** add `vega device screenshot` and `vega device record` (with audio), or add `emu` to `vda` and document the `screenrecord` route.

## 9. ADBT `init-context` ignores its own Node 24 requirement

- **Tool / version:** Amazon Devices Builder Tools MCP (`@amazon-devices/amazon-devices-buildertools-mcp@latest`; 1.0.17 in the local npx cache), Claude Code CLI, Node 24 (Homebrew `node@24`) next to a default Node 26.12.
- **Task attempted:** set up ADBT for Claude Code on a Mac whose default Node is 26.
- **Steps taken:** `brew install node@24`, then `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`.
- **Expected:** the MCP entry it writes keeps using Node 24. The docs say Node 26 fails with an SQLite3 bindings error.
- **Actual:** it registers `"command": "npx"` in `~/.claude.json`, which resolves to the default Node 26 at runtime, so the server would hit the documented SQLite error. `check-status` then reports "Partially configured" with no hint why. The Prerequisites snippet inside the installed Vega skills also uses a plain `"command": "npx"`.
- **Severity:** Medium. A silent misconfiguration on the newest Node.
- **Workaround:** edit the entry by hand: `"command": "/opt/homebrew/opt/node@24/bin/npx"` plus `"env": {"PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin"}`.
- **Suggestion:** have `init-context` write the absolute path of the Node that ran it, or check `node -v` and warn on 26 and later. Make `check-status` say which part is missing.

## 10. Remote keys on a headless VVD: no `vega` command, and the docs' developer-mode step didn't match

- **Tool / version:** `inputd-cli` on the Vega Virtual Device (headless), Vega CLI 1.4.5, Vega SDK 0.24.12112; Vega docs page "Simulate Device Input with inputd-cli" (0.24).
- **Task attempted:** navigate the TV app (D-pad, OK, Back, Menu, Play/Pause) with no VVD window, for testing and for recording the demo.
- **Steps taken:** the remote control is part of the VVD window, which crashes on macOS 27 (#1). `vega device --help` has no key-press command. Used `inputd-cli` through `adb`: `adb -s emulator-5554 shell inputd-cli button_press KEY_ENTER` (also `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_BACK`, `KEY_MENU`, `KEY_PLAYPAUSE`).
- **Expected:** one documented `vega` command to send remote keys to a VVD or a dev-mode device.
- **Actual:** it works through `adb shell` with no `vsm developer-mode enable`. The docs describe a different route, `vega exec inputd-cli button_press KEY_BACK` over a VDA connection, and say a VVD needs `vsm developer-mode enable` first, with only the `get_*` commands available without it. So there are two routes, and the docs and the VVD disagree on developer mode.
- **Severity:** Low. It works once you find the `inputd-cli` page.
- **Workaround:** `tv/scripts/remote.sh up|down|left|right|select|back|menu|playpause [count]`.
- **Suggestion:** add `vega device press <key>`, or at least point to `inputd-cli` from `vega device --help`. Say whether `adb shell` is a supported route and when a VVD really needs developer mode. TODO(verify: the documented `vega exec inputd-cli button_press KEY_ENTER` on the headless VVD, with and without developer mode.)

## 11. `loggingctl` shows no `console.log` output from release builds

- **Tool / version:** `loggingctl` on the Vega Virtual Device, Vega SDK 0.24.12112, release build (`npm run build:release`) of the TV app.
- **Task attempted:** read the app's own `console.log` lines while debugging the race stall (#2) and audio (#6, #7).
- **Steps taken:** `loggingctl log -v <package>`.
- **Expected:** the app's JS console output next to the native logs.
- **Actual:** native logs only (for example the `[AnimatedNode]` lines in #2). No `console.log` output from the release build.
- **Severity:** Low. JS-side state was invisible in the logs of the builds we ran.
- **Workaround:** an in-app performance overlay (Menu key in the race) that shows fps, JS time per frame, loop restarts, input latency and the audio state, captured with screenshots (#8).
- **Suggestion:** document whether release builds drop `console` output and how to keep it (for example a build flag), or route it to `loggingctl` in release builds too. TODO(check: does a debug build show `console.log` in `loggingctl`?)

## 12. KPI Visualizer fails validation when the app makes no network calls at launch (`-1 != -1`)

- **Tool / version:** `vega exec perf kpi-visualizer` (Perf CLI 0.24.0), Vega SDK 0.24.12112, headless VVD (firmware `vvrp-tv-arm64-user OS 1.2`).
- **Task attempted:** measure cool-start latency (time to first frame and time to fully drawn).
- **Steps taken:** called `useReportFullyDrawn` on Home's first frame, then ran `vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main --kpi cool-start-latency --iterations 3`.
- **Expected:** the latency report and a pass against the targets (TTFF under 1.5 s, TTFD under 8 s).
- **Actual:** the report prints TTFF mean 408.1 ms (min 191.5, max 553.0), TTFD mean 408.5 ms and JS bundle load 17.6 ms. "Network calls time" has n = 0 and null values, because the app makes no network calls at launch. The run then ends with "FAILED TARGETS -- [-1 != Network calls time P100] [-1 != -1]" and "VALUE VALIDATION FAILED".
- **Severity:** Low. The numbers are in the report, but the run reads as a failure, and `-1 != -1` doesn't explain why.
- **Workaround:** read the latency rows and ignore the network-calls validation.
- **Suggestion:** treat a KPI with no samples as "not applicable" instead of a failed target, and make the message say which value is missing.

## 13. The Vega skills depend on the ADBT MCP server and add little without it

- **Tool / version:** Amazon Devices Builder Tools Vega skills (`amazon-devices-vega-media-player` 1.0.0 and `amazon-devices-vega-app-performance`), ADBT MCP 1.0.17.
- **Task attempted:** use the media-player and performance skills in the agent session that built the TV app.
- **Steps taken:** loaded the skills. Their Workflow sections are calls to the MCP server's `read_document`, `list_documents` and `search_documentation` tools.
- **Expected:** the skills give the setup facts needed, or say clearly that the server is missing and how to fix it.
- **Actual:** the MCP server was not connected in that session (we did not find out why), so the workflow steps couldn't run. The skill body has general rules (for example, that missing `[wants]` services cause silent playback failures) but not the list of services needed for audio (#7).
- **Severity:** Low. The docs are on the website, but the skills add little without the server.
- **Workaround:** read the docs on developer.amazon.com and the package typings in `node_modules`.
- **Suggestion:** put the key facts (such as the `[wants]` services for audio-only playback) in the skill body, so a skill is useful without the server. Have each skill check for the server and say how to connect it.

## 14. The VVD clock ran about 2 h 11 min behind the Mac

- **Tool / version:** Vega Virtual Device, headless, Vega SDK 0.24.12112, macOS 27.0.1.
- **Task attempted:** measure phone-to-TV input latency. Phones stamp each input with `at: Date.now()`, and the TV compares it with its own receive time.
- **Steps taken:** ran simulated phones (`tv/scripts/fake-phones.mjs`) and the server on the Mac, and logged `recv - at` in the TV app on the VVD.
- **Expected:** the VVD clock matches the host's within a few milliseconds, so `recv - at` is the delivery time.
- **Actual:** raw `recv - at` was -7,869,824 ms: the VVD clock was about 2 h 11 min behind the Mac. That is not a whole number of hours, so it isn't a time-zone setting. We did not check whether the offset changes over time.
- **Severity:** Low. It blocks one measurement, and the cause is easy to miss.
- **Workaround:** report what cancels the offset: delivery jitter above the best observed delivery (+1 ms median) and the TV-side receive-to-applied time (7 ms median).
- **Suggestion:** sync the VVD clock to the host at boot, and show the clock offset in `vega virtual-device status`.

## 15. qrcode-svg needs a `TextEncoder` polyfill in the app

- **Tool / version:** `@amazon-devices/react-native-qrcode-svg` 3.0.0+6.3.15 with `@amazon-devices/react-native-svg` 3.0.x, React Native for Vega 4.0.1+rn0.83.0; Vega API docs page for `react-native-qrcode-svg` (0.24).
- **Task attempted:** show the join QR code on the Lobby screen.
- **Steps taken:** added both packages and rendered `<QRCode value={joinUrl} />`.
- **Expected:** it renders with no extra setup. The package README says it "works seamlessly" with React Native 0.75 and above; its metro transform (`textEncodingTransformation.js`) is only for older versions.
- **Actual:** the Vega page's Known issues section says "Your app might crash" when the library imports `TextEncoder`, and the app has to add `fast-text-encoding` itself. The package already depends on `text-encoding`, but that doesn't cover it. TODO(confirm: did the app crash without the polyfill, and with what error?)
- **Severity:** Low. A one-line fix, and it is documented.
- **Workaround:** add `fast-text-encoding` and import it before the QR component (`import 'fast-text-encoding'` at the top of `tv/src/screens/Lobby.tsx`), as the known-issues section says.
- **Suggestion:** provide `TextEncoder` in the Vega JS runtime, or make the Vega build of the package import its own polyfill so it works with no app-side setup.

## 16. Custom fonts on RN 0.83: `expo-font` lists only RN 0.72, and `fontFamily` must be the file name

- **Tool / version:** Vega API docs page for `@amazon-devices/expo-font` (0.24), React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** use bundled Baloo 2 fonts (OFL) on the TV.
- **Steps taken:** checked the `expo-font` page: its Supported versions table lists only React Native 0.72 (Vega SDK 0.23 and earlier). Put the `.ttf` files in `tv/assets/fonts/` without `expo-font` and set `fontFamily`.
- **Expected:** a documented way to use custom fonts on RN 0.83, with `fontFamily` set to the font's family name.
- **Actual:** no documented route for RN 0.83. Plain `assets/fonts/` works, but only when `fontFamily` is the file name (for example `Baloo2-ExtraBold`); the family name did not work.
- **Severity:** Low. A quick fix once you know it.
- **Workaround:** `fontFamily: '<file name without extension>'`.
- **Suggestion:** document custom fonts for RN 0.83 (folder, naming rule, `fontFamily` value), or list `expo-font` for 0.83.

## 17. Installer: no telemetry opt-out at install, scripted mode undocumented

- **Tool / version:** Vega SDK installer (SDK 0.24.12112, CLI 1.4.5), macOS 27.0.1.
- **Task attempted:** a scripted install (for an agent or CI) with telemetry off.
- **Steps taken:** read the install script to find its options, then ran it with `NONINTERACTIVE=true`.
- **Expected:** documented install options, including one to turn telemetry off.
- **Actual:** the install page only shows the interactive `curl | bash`. The script supports `NONINTERACTIVE`, `SKIP_SDK_INSTALL` and `VEGA_SDK_VERSION`, but you only learn that by reading it. Even with `NONINTERACTIVE=true` it writes `~/vega/telemetry/config.json` with `"optIn": true`, and the docs only describe editing that file after install.
- **Severity:** Low.
- **Workaround:** `jq '.optIn=false'` on `~/vega/telemetry/config.json` after install.
- **Suggestion:** document the installer variables on the install page. Add an installer flag or variable (for example `VEGA_TELEMETRY=0`) and a `vega telemetry off` command.

---

## What worked well

- One-line installer: the SDK and the VVD in about 10 minutes (5.4 GB).
- The helloWorld template built on Node 26 the first time (`npm install` about 1 minute, `npm run build:release` about 1 minute).
- `vega run-app` installs and launches in seconds.
- The headless VVD boots reliably, and because it is an Android emulator underneath, `adb` tools work on it, including full-HD recording.
- The app reaches the host at `10.0.2.2` over HTTP and WebSocket with no setup. `vega device start-port-forwarding` is there too.
- D-pad focus needed only stock components (`TVFocusGuideView`, `hasTVPreferredFocus`), and Alexa voice targets need only one `aria-label` per button.
- `useReportFullyDrawn` plus the KPI Visualizer measured cool start in one command: TTFF 408 ms mean on the VVD, against a 1.5 s target.
- w3cmedia accepts fragmented-MP4 AAC through standard Media Source Extensions calls.
- `vega device copy-logs -a SYSTEM_TOMBSTONE/acr` pulled the ACR for #2, with the state of the JS and main threads.
- ADBT: one command installed the steering doc, the MCP config and 18 Vega skills into Claude Code.

---

## Appendix: snags with tools outside the Amazon ecosystem

- **Bun 1.4.3.** It aborts with "panic: A C++ exception occurred" when a process that loaded onnxruntime exits, so the Kokoro voice model runs in a child process that kills itself when the server goes away. It loads `.env` only from the current folder, and shell variables win over `.env`. In `bun-types`, `ws.send()` returns a number, so a one-line arrow `websocket.message` handler fails the typecheck.
- **kokoro-js 1.2.1 / onnxruntime-node.** `bun install` reports two blocked postinstalls (onnxruntime-node, protobufjs); they can stay blocked. On an M5 MacBook, fp32 was faster than q8 (3.7 s vs 4.9 s for the same line).
- **Anthropic SDK.** It reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` from the environment by default; developer tooling on this Mac had set a local proxy, so the client sets `baseURL` and `authToken: null` explicitly. Structured outputs ignore `minimum`, `maximum` and `maxLength`, so stats are an integer enum and lengths are clamped on the server.
- **adb.** The Homebrew adb 37.0.1 we installed for #8 and #10 and the Unity Editor's adb 36.0.0 kill each other's server on every switch ("daemon not running; starting now", "device offline"), which dropped key presses mid-test. Workaround: point `remote.sh` at Unity's adb (`ADB=...`) while Unity is open.
