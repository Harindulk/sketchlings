<!-- DRAFT. Final location: repo root FRICTION_LOG.md (replaces the 5-entry log). Merged from /Users/harindu/Desktop/Sketchlings/FRICTION_LOG.md
     (entries 1-5), the code comments in tv/ and the notes in notes/*.md. Resolve every "TODO(" before submitting. -->

# Friction log: building Sketchlings on Vega

Real problems hit while building a React Native for Vega app, ordered by severity. Each entry has the tool and version, the task, the steps, expected vs actual, severity, the workaround and a suggestion.

**Setup:** MacBook (Apple silicon, 16 GB), macOS 27.0.1, Node 26.12, Vega SDK 0.24.12112, Vega CLI 1.4.5, Vega Virtual Device with the bundled Android emulator 34.1.15, `@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0. No Fire TV hardware was used.

**Severity:** **High** = you can't see the app, or it hangs. **Medium** = blocks a task until you find an undocumented workaround. **Low** = an annoyance with an easy workaround.

| # | Problem | Tool | Severity |
|---|---|---|---|
| 1 | VVD window crashes on boot on macOS 27 | Vega Virtual Device | High |
| 2 | JS thread freezes when React commits overlap native-driver animation updates | React Native for Vega, on the VVD | High |
| 3 | `requestAnimationFrame` fires about 1250 times a second on the headless VVD | Vega Virtual Device (headless) | High |
| 4 | The build fails when the project path contains a space | Vega SDK build | Medium |
| 5 | No documented way to screenshot or record the VVD; the SDK's `vda` can't do it | Vega Virtual Device, Vega CLI | Medium |
| 6 | No documented way to press remote keys on a headless VVD | Vega Virtual Device, Vega CLI | Medium |
| 7 | w3cmedia: missing manifest services fail quietly; VVD audio unclear | `react-native-w3cmedia` | Medium |
| 8 | ADBT `init-context` ignores its own Node 24 requirement | Amazon Devices Builder Tools MCP | Medium |
| 9 | qrcode-svg needs a `TextEncoder` polyfill | `react-native-qrcode-svg` | Low |
| 10 | Installer: no telemetry opt-out at install, scripted mode undocumented | Vega SDK installer | Low |

---

## 1. Vega Virtual Device window crashes on boot (macOS 27)

- **Tool / version:** Vega Virtual Device (Vega SDK 0.24.12112, bundled Android emulator 34.1.15), Vega CLI 1.4.5, macOS 27.0.1 on Apple silicon.
- **Task attempted:** start the VVD to run the helloWorld template.
- **Steps taken:** `source ~/vega/env`, then `vega virtual-device start --timeout 240`.
- **Expected:** the VVD window opens and the CLI prints "Virtual device ready."
- **Actual:** "Deadline reached (240s) but virtual device unresponsive." `vega virtual-device status` reports `{"running":false}`. `virtual_device.err` ends with a crashpad `UniversalExceptionRaise: (os/kern) failure (5)` after many `sPrepareTexImage2D ... failed validation` lines and "running without ARB/KHR robustness in place may crash". The bundled emulator warns that it doesn't support features such as `Vulkan`, `HVF`, `TvRemote` and `ScreenRecording`.
- **Severity:** High. You can't see your app. It also removes the on-screen remote (#6) and the window's own capture menu (#5).
- **Workaround:** `vega virtual-device start --no-gui --timeout 300` boots fine headless. View the screen with `adb -s emulator-5554 emu screenrecord screenshot <dir>`.
- **Suggestion:** surface the emulator crash instead of a generic timeout. Offer a software-GPU fallback on macOS (`--no-gl-accel` is Linux-only today) or update the bundled emulator. Publish a macOS version support matrix.

## 2. JS thread freezes when React commits overlap native-driver animation updates

- **Tool / version:** React Native for Vega (`@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0), `Animated` with `useNativeDriver: true`, on the Vega Virtual Device (headless), Vega SDK 0.24.12112.
- **Task attempted:** run the Doodle Dash race at 60 fps with up to six animated creatures while React updates the countdown and the placings.
- **Steps taken:** a game loop calls `Animated.Value.setValue()` every frame on values driven by the native driver. React state changes during the race (the 3-2-1 countdown, finish places). Some `Animated` interpolation nodes were rebuilt when the component re-rendered.
- **Expected:** native-driver values keep updating while React renders, or a JS error if the usage is wrong.
- **Actual:** three different hangs on the VVD:
  1. At race start, `setValue()` racing zero-length native animations sometimes froze the JS thread.
  2. A React commit landing while the loop streamed native-animated updates sometimes parked the JS thread for good. The watchdog raised an ACR: AppNotResponding, "No JavaScript code is currently being executed".
  3. Rebuilding `Animated` nodes on a re-render while the loop set their parent froze the JS thread with "updateNodeIfNecessary called for released parent".
- **Severity:** High. The app hangs mid-race, and the family loses the game.
- **Workaround:** (a) attach every value to the native driver first (a zero-length `Animated.timing` per value) and start the loop only when that has finished; (b) a "commit fence": after any React update in the race, skip `setValue()` for 90 ms, then resend; (c) build `Animated` graphs once with `useMemo`; (d) send a value only when it changed. See `tv/src/screens/Race.tsx`.
- **Suggestion:** make the native animated module tolerate a commit during `setValue()`, or throw a JS error instead of hanging. Document a safe pattern for per-frame game loops on Vega. Include the last native animated error in the ACR report. TODO(measure: try to reproduce on Fire TV hardware, and attach the ACR log.)

## 3. `requestAnimationFrame` fires about 1250 times a second on the headless VVD

- **Tool / version:** Vega Virtual Device, headless (`--no-gui`), Vega SDK 0.24.12112; React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** run the race loop once per display frame.
- **Steps taken:** drive the race simulation from `requestAnimationFrame`, one step per callback, and check the loop rate.
- **Expected:** about 60 callbacks a second, in step with the display.
- **Actual:** about 1250 callbacks a second. The race ran about 10 times too fast, and JS timers were starved.
- **Severity:** High. The game was unplayable until worked around, and nothing in the logs points at the cause.
- **Workaround:** pace the loop in JavaScript. If less than 13 ms has passed since the last frame, wait with `setTimeout` until 15 ms. Always yield with `setTimeout(0)` before asking for the next `requestAnimationFrame`. See `tv/src/screens/Race.tsx`.
- **Suggestion:** tie `requestAnimationFrame` to a virtual vsync in headless mode, or document the difference. Expose the display refresh rate to apps. TODO(measure: does it also happen with the VVD window, or on hardware? The window can't be tested on macOS 27.)

## 4. The build fails when the project path contains a space

- **Tool / version:** Vega SDK 0.24.12112 build (`npm run build:release`, which runs `react-native build-vega`), `kepler-compatibility-metro-config`, Node 26.12.
- **Task attempted:** build the TV app from a project folder under `~/Library/Application Support/...`.
- **Steps taken:** `cd tv && npm run build:release`.
- **Expected:** the build succeeds, or fails with a clear message about the path.
- **Actual:** `kepler-compatibility-metro-config` runs a shell command through `execSync` without quoting the path, and the build fails with `/bin/sh: /Users/.../Library/Application: No such file or directory`.
- **Severity:** Medium. It blocks the build completely, and the error looks like a missing file, not a quoting bug.
- **Workaround:** `tv/scripts/vbuild.sh` rsyncs `tv/` and `shared/` to a folder without spaces, builds there and copies the `.vpkg` back. Or clone the repo to a path without spaces.
- **Suggestion:** quote the path, or use `execFile` with an argument array. Add a CI build with a space in the project path. Until it is fixed, check for spaces at the start of the build and print a clear message.

## 5. No documented way to screenshot or record the VVD; the SDK's `vda` can't do it

- **Tool / version:** Vega Virtual Device (bundled emulator 34.1.15), Vega CLI 1.4.5, Vega SDK 0.24.12112 with Vega Device Adapter (`vda`) 2.6.
- **Task attempted:** capture screenshots and a full-length video of the app for the hackathon demo.
- **Steps taken:** looked for a `vega` command (`vega device --help` lists none for capture) and checked the docs. Then used the emulator console through `adb` from Android SDK platform-tools: `adb -s emulator-5554 emu screenrecord screenshot <dir>`, and `... emu screenrecord start <file.webm>` / `stop`.
- **Expected:** a `vega` command for screenshots and recording.
- **Actual:** the docs only mention "Dump Render Tree" and "Dump Rendered Text" in the window's context menu, which doesn't exist headless (#1). The bundled emulator even warns that it doesn't support `ScreenRecording`, yet `adb emu screenrecord` works, including a full-HD recording. The SDK ships its own adb-like tool, `vda`, but `vda help` lists no `emu` (emulator console) command, so a separate `adb` is needed.
- **Severity:** Medium. Video is required for the submission, and the working route is undocumented.
- **Workaround:** install Android SDK platform-tools for `adb`. `tv/scripts/remote.sh shot <out.png>` wraps the screenshot command.
- **Suggestion:** add `vega device screenshot` and `vega device record`, or add `emu` to `vda` and document the `screenrecord` route. TODO(measure: does the recording include audio?)

## 6. No documented way to press remote keys on a headless VVD

- **Tool / version:** Vega Virtual Device, headless, Vega CLI 1.4.5, Vega SDK 0.24.12112.
- **Task attempted:** navigate the TV app (D-pad, OK, Back, Menu, Play/Pause) with no VVD window, for testing and for recording the demo.
- **Steps taken:** the remote control is part of the VVD window, which crashes on macOS 27 (#1). The route that worked was the dev-mode `inputd-cli` on the device, through `adb`: `adb -s emulator-5554 shell inputd-cli button_press KEY_ENTER` (also `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_BACK`, `KEY_MENU`, `KEY_PLAYPAUSE`). TODO(confirm: where `inputd-cli` was found: docs, ADBT, or trial and error.)
- **Expected:** a documented `vega` command, or a headless remote, to send remote keys.
- **Actual:** `vega device --help` has no key-press command. Keys need a dev-mode tool on the device, reached through a shell. `vega device run-cmd` and `vda shell` should reach `inputd-cli` too, without a separate `adb`. TODO(verify: `vega device run-cmd --command 'inputd-cli button_press KEY_ENTER'` on the VVD.)
- **Severity:** Medium. Without it you can't use the app at all in headless mode.
- **Workaround:** `tv/scripts/remote.sh up|down|left|right|select|back|menu|playpause [count]`.
- **Suggestion:** add `vega device press <key>` that works on a headless VVD and on dev-mode hardware, and document the key names.

## 7. w3cmedia audio: missing manifest services fail quietly, and VVD audio is unclear

- **Tool / version:** `@amazon-devices/react-native-w3cmedia` 2.3.2, Vega SDK 0.24.12112, `manifest.toml` schema-version 1, on the Vega Virtual Device.
- **Task attempted:** play short creature voice lines and narrator lines (AAC-LC in fragmented MP4, 0.5 to 5 s each).
- **Steps taken:** followed the Vega media player setup docs. Declared media services under `[wants]` in `manifest.toml`. Created `AudioPlayer(CONTENT_TYPE_SPEECH, USAGE_GAME)`, called `initialize()`, attached a `MediaSource`, appended the whole clip to one `SourceBuffer`, called `endOfStream()` and `play()`.
- **Expected:** the clip plays, or an error names what is missing.
- **Actual:** without `com.amazon.audio.system` in `[wants]` the log shows "Unable connect to 'com.amazon.audio.system'. Missing the permissions". The media docs say missing `[wants]` services give silent failures. Eight services are needed in the end, even for a 2-second clip: `mediametrics.service`, `mediabuffer.service`, `mediatransform.service`, `audio.stream`, `audio.control`, `audio.system`, `media.server` and `media.playersession.service` (all `com.amazon.*`). Whether the VVD plays audio at all is unclear: TODO(measure: play a creature line on the VVD and note the overlay's audio state. One code comment says the VVD has no audio service; a build script says it plays through the Mac's speakers.)
- **Severity:** Medium. Voices are a core feature, and failures are quiet.
- **Workaround:** declare all eight services. The app loads w3cmedia lazily, logs `MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')`, falls back from MSE to URL mode, and turns sound off for the session on the first failure so the game never blocks. Narrator clips are bundled as base64 strings in a TypeScript module, so they play without reading binary assets from the package.
- **Suggestion:** a build-time check that warns when w3cmedia is a dependency but its services are missing from `[wants]`. A runtime error that names the missing service. A short "play a sound effect" recipe or API for games. State clearly whether the VVD supports audio output.

## 8. ADBT `init-context` ignores its own Node 24 requirement

- **Tool / version:** Amazon Devices Builder Tools MCP (`@amazon-devices/amazon-devices-buildertools-mcp@latest`; 1.0.17 in the local npx cache), Claude Code CLI, Node 24 (Homebrew `node@24`) next to a default Node 26.12.
- **Task attempted:** set up ADBT for Claude Code on a Mac whose default Node is 26.
- **Steps taken:** `brew install node@24`, then `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`.
- **Expected:** the MCP entry it writes keeps using Node 24. The docs say Node 26 fails with an SQLite3 bindings error.
- **Actual:** it registers `"command": "npx"` in `~/.claude.json`, which resolves to the default Node 26 at runtime, so the server would hit the documented SQLite error. `check-status` then reports "Partially configured" with no hint why.
- **Severity:** Medium. A silent misconfiguration on the newest Node.
- **Workaround:** edit the entry by hand: `"command": "/opt/homebrew/opt/node@24/bin/npx"` plus `"env": {"PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin"}`.
- **Suggestion:** have `init-context` write the absolute path of the Node that ran it, or check `node -v` and warn on 26 and later. Make `check-status` say which part is missing.

## 9. qrcode-svg needs a `TextEncoder` polyfill

- **Tool / version:** `@amazon-devices/react-native-qrcode-svg` 3.0.0+6.3.15 with `@amazon-devices/react-native-svg` 3.0.x, React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** show the join QR code on the Lobby screen.
- **Steps taken:** added both packages and rendered `<QRCode value={joinUrl} />`.
- **Expected:** it renders with no extra setup.
- **Actual:** it needs `TextEncoder`, which the app had to supply. The code comment calls this a documented known issue. TODO(paste the exact error message.) The package already lists `text-encoding` as a dependency and ships a `textEncodingTransformation.js`, yet the app still needed its own polyfill. TODO(confirm whether a documented Babel step was missed.)
- **Severity:** Low. A one-line fix once you know it.
- **Workaround:** add `fast-text-encoding` and import it before the QR component (`import 'fast-text-encoding'` at the top of `tv/src/screens/Lobby.tsx`).
- **Suggestion:** provide `TextEncoder` in the Vega JS runtime, or make the Vega build of the package import its own polyfill so it works with no app-side setup.

## 10. Installer: no telemetry opt-out at install, scripted mode undocumented

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
- `useReportFullyDrawn` reports Time to Fully Drawn with one hook.
- ADBT: one command installed the steering doc, the MCP config and 18 Vega skills into Claude Code.
