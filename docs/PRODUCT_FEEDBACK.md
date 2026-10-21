# Product feedback

Every tool, SDK and API used to build Sketchlings, in the same five parts: what I used it for, what worked well, what needs work, onboarding, and whether I would build with it again. Details of each problem are in [FRICTION_LOG.md](../FRICTION_LOG.md); numbers like #4 point there.

Setup: MacBook (Apple silicon, 16 GB), macOS 27.0.1, Node 26.12, Bun 1.4.3, Vega SDK 0.24.12112, Vega CLI 1.4.5, Vega Perf CLI 0.24.0. All testing was on the Vega Virtual Device. No Fire TV hardware was used.

| Tool | Build with it again? |
|---|---|
| Vega SDK and Vega CLI | Yes |
| Vega Virtual Device | Yes, plus real hardware before release |
| Amazon Devices Builder Tools (MCP + Vega skills) | Yes, once the MCP setup and `symbolicate_acr` work out of the box |
| React Native for Vega and `@amazon-devices` packages | Yes |
| Vega performance tools | Yes |
| Claude API | Yes |

---

## 1. Vega SDK and Vega CLI (SDK 0.24.12112, CLI 1.4.5)

**What I used it for.** Installing the SDK and the Vega Virtual Device. Building the TV app (`npm run build:release`, which runs `react-native build-vega`). Installing and launching it (`vega run-app`). Starting and stopping the VVD (`vega virtual-device start|status|stop`). Pulling crash reports (`vega device copy-logs`).

**What worked well.**
- The one-line installer put the SDK and the VVD in place in about 10 minutes (5.4 GB).
- The helloWorld template built on Node 26 the first time: about 1 minute of `npm install`, then about 1 minute of `npm run build:release`.
- `vega run-app <vpkg> <appId> -d VirtualDevice` installs and launches in seconds.
- The template is on React Native 0.83 and React 19.2, so current React Native knowledge applies directly.
- `vega device start-port-forwarding` exists for reaching a server on the host.
- `vega device copy-logs -a SYSTEM_TOMBSTONE/acr` pulled the AppNotResponding reports for the race-start freeze, and every report carries a full core dump with every thread's stack. That is what made the watchdog deadlock in #1 findable.

**What needs work.**
- The build fails when the project path contains a space, with an error that looks like a missing file (#7), and building in place rewrites the source `manifest.toml` (#14).
- When the VVD's emulator crashes, `vega virtual-device start` only reports a generic timeout (#2).
- There is no `vega` command for screenshots, screen recording or pressing remote keys (#10, #13).
- `loggingctl` showed no `console.log` output from release builds (#15).
- Telemetry is on by default with no install-time switch, and the installer's `NONINTERACTIVE`, `SKIP_SDK_INSTALL` and `VEGA_SDK_VERSION` variables are undocumented (#22).

**Onboarding (zero to hello world).** The SDK steps took about 12 minutes: 10 to install, 1 for `npm install`, 1 to build. Getting hello world on screen took the rest of the morning of 20 Oct, because the VVD window crashed on macOS 27 and had to be run headless.

**Would I build with it again?** Yes. The template makes a TV app feel like ordinary React Native work, and the CLI is small and easy to script. I'd like the space-in-path bug and the macOS 27 crash fixed first.

## 2. Vega Virtual Device (bundled emulator 34.1.15)

**What I used it for.** It was the only device. All development, every screenshot and the demo video ran on it, headless (`--no-gui`) because the window crashes on macOS 27.

**What worked well.**
- Headless mode (`vega virtual-device start --no-gui --timeout 300`) boots in about 10 s.
- It is an Android emulator underneath, so `adb emu screenrecord screenshot|start|stop` works, including a full-HD recording of the app.
- The app reaches the host at `10.0.2.2` over HTTP and WebSocket with no extra setup.
- Scripts can press remote keys through `inputd-cli` (`adb shell inputd-cli button_press KEY_ENTER`), so walkthroughs and soak tests can be automated without a window.

**What needs work.**
- The window crashes on boot on macOS 27 (#2). Headless, the emulator's own hang detector kills the VVD whenever the host stalls for 15 s, even with no app running (#3).
- On the headless VVD, `requestAnimationFrame` fires about 7,600 times a second instead of once per frame (#4).
- Audio work can stall the game or hang the JS thread (#5), and a rotated view in a rounded, clipped card froze the renderer with no error (#6).
- Screenshots and recording are undocumented. The SDK's own adb-like tool, `vda`, has no `emu` command, so you need `adb` from Android SDK platform-tools. The recording has no audio (#10).
- Remote keys: there is no `vega` command. The docs' `inputd-cli` page uses `vega exec` and says a VVD needs developer mode first, but `adb shell inputd-cli` worked without it (#13).
- The VVD clock ran about 2 h 11 min behind the Mac, so absolute phone-to-TV latency couldn't be measured (#18).
- Audio reaches the Mac's speakers (macOS shows an audio-out assertion for the VVD's process while clips play), but nothing on the Mac could record it, so we couldn't prove the output is non-silent (#9).

**Onboarding.** The first boot (`vega virtual-device start --timeout 240`) ended in "Deadline reached (240s) but virtual device unresponsive." The crash was only visible in `virtual_device.err`. The headless boot worked on the next try.

**Would I build with it again?** Yes, for day-to-day iteration. But I'd test on real hardware before release, because several of the worst problems (#3, #4, #6) may only exist on the emulator.

## 3. Amazon Devices Builder Tools: MCP server and Vega skills, with Claude Code

**What I used it for.** Vega guidance inside the coding agent while building the TV app. The skills used were `amazon-devices-vega-media-player` (audio setup and the manifest) and `amazon-devices-vega-app-performance` (the KPI Visualizer). The MCP server was not connected in the session that built the TV app, so the docs were read on developer.amazon.com and in the package typings there (#17). On 21 Oct, with the server connected, I tried its `symbolicate_acr` tool on the race-freeze crash reports (#11).

**What worked well.**
- One command (`init-context --agent claude-code-cli`) installed the steering doc, the MCP config and 18 Vega skills straight into Claude Code.
- The media-player skill names missing `[wants]` services as the cause of silent playback failures, which is where the audio setup went wrong (#9). The performance skill pointed to the KPI Visualizer, which gave the cool-start numbers in section 5.
- `symbolicate_acr` is exactly the right tool to have in an agent: the crash reports were the key to the hardest bug of the project.

**What needs work.**
- `symbolicate_acr` failed on the VVD with "Failed to copy .../temp_acr_debugFs/acr_libraries.txt to emulator-5554", so I wrote my own reader of the ACR core dump (`tv/scripts/acr-stacks.py`) (#11).
- `init-context` writes `"command": "npx"`, which runs on the default Node 26, even though the docs say the server needs Node 24 (Node 26 fails with an SQLite3 bindings error). The skills' own install snippet has the same plain `npx` (#12).
- `check-status` reports "Partially configured" without saying which part is missing (#12).
- Without the MCP server the skills add little: their workflow steps are calls to the server, and the skill body leaves out specifics such as the list of audio services (#17).

**Onboarding.** One command, plus a hand edit of `~/.claude.json` to pin Node 24.

**Would I build with it again?** Yes. Having the Vega docs, skills and crash tools inside the coding agent is the right idea; it needs the setup and `symbolicate_acr` to work out of the box on the VVD.

## 4. React Native for Vega and the `@amazon-devices` packages

### 4a. `@amazon-devices/react-native-kepler` 4.0.1 (RN 0.83): focus, remote, Back, Alexa labels

**What I used it for.** `hasTVPreferredFocus` on every screen and `TVFocusGuideView` (`autoFocus`) on Home and Results, `useTVEventHandler` for the remote in the race (OK, Up, Play/Pause, Menu), `BackHandler` for Back, `aria-label` on every button plus the `com.amazon.category.kva` manifest category for Alexa on-screen voice selection, and `Animated` on the native driver for focus effects and the race.

**What worked well.**
- D-pad focus needed only the stock pieces (`TVFocusGuideView`, `hasTVPreferredFocus`). Our own focus code is just the look (scale, glow and wobble) and a Hall of Fame list that scrolls to follow focus.
- Declaring Alexa voice targets takes one `aria-label` per button plus the `kva` category. Voice selection can't be tested on the VVD, so we haven't seen it work.
- Native-driver `Animated` values created with `useNativeDriver: true` from the start make a race with no React render per frame straightforward. The race ran at 57 to 65 loops a second with 0.1 to 1.2 ms of JS per frame for 4 to 6 lanes on the VVD (in-app overlay).
- Bundled OFL fonts work without `expo-font`. On Vega the `fontFamily` is the font file name (for example `Baloo2-ExtraBold`).

**What needs work.**
- The JS-thread watchdog can deadlock the JS thread when it churns many small tasks (#1). The fix is in the platform; app developers need to know to keep JS tasks per frame low until then.
- `adjustsFontSizeToFit` does nothing (#19).
- Custom fonts on RN 0.83 are undocumented: the `expo-font` page lists only RN 0.72, and the family name doesn't work as `fontFamily` (#21).

### 4b. `@amazon-devices/react-native-w3cmedia` 2.3.2: creature voices and narrator

**What I used it for.** Playing short voice clips (AAC-LC in fragmented MP4, 0.5 to 5 s) with `AudioPlayer` and Media Source Extensions, with a URL-mode fallback.

**What worked well.**
- A W3C-style API (`MediaSource`, `SourceBuffer`, `play()`) that web developers already know.
- On the VVD, `MediaSource.isTypeSupported('audio/mp4; codecs="mp4a.40.2"')` is true, and both bundled and downloaded clips append, `endOfStream()` and `play()` without errors; the URL-mode fallback was never needed.

**What needs work.**
- Even a 2-second clip needs eight `[wants]` services in `manifest.toml`. Without `com.amazon.audio.system` the log shows "Unable connect to 'com.amazon.audio.system'. Missing the permissions", and the media docs say missing services fail silently (#9).
- Replacing a playing clip slowed the game to 0 to 15 frames a second on the VVD, `ended` never fired for the replaced clip, one crash report shows the JS thread blocked on a mutex inside `libW3CMedia.so`, and another a SIGSEGV in `libkepler_media_player.so` (#5). Since then the race plays no audio at all.
- A short sound-effect API, or a documented recipe for short clips, would help games.

### 4c. `@amazon-devices/react-native-qrcode-svg` 3.0.0 with `@amazon-devices/react-native-svg`

**What I used it for.** The join QR code in the Lobby.

**What worked well.** It renders the join QR code on the TV with a single component, and the docs' known-issues section names the `TextEncoder` fix.

**What needs work.**
- The docs' `.npmrc` step (`legacy-peer-deps=true`) removed the `build-vega` command; a plain `npm install` works (#8).
- It needs a `TextEncoder` polyfill (`fast-text-encoding`) in the app (#20).

### 4d. `@amazon-devices/kepler-performance-api` 0.1.4

**What I used it for.** `useReportFullyDrawn()` on Home's first frame, so Vega can measure Time to Fully Drawn.

**What worked well.** One hook, one call. The KPI Visualizer picked it up: TTFD 409 ms mean on the VVD (665 ms over 10 runs on a loaded host on 21 Oct).

**What needs work.** Nothing found.

**Onboarding (React Native for Vega overall).** If you know React Native you are productive on the first day. The TV app went from the template to the full loop (Home, Lobby, Reveal, Race, Results, Hall of Fame, How to play) on 20 Oct, which the screenshots in `notes/shots/` show.

**Would I build with it again?** Yes. Focus, Back and voice labels work the way a React Native developer expects, and the Amazon packages cover what a TV game needs.

## 5. Vega performance tools (Perf CLI 0.24.0)

**What I used it for.** Cool-start latency with the KPI Visualizer (`vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main --kpi cool-start-latency --iterations 3`), with `useReportFullyDrawn` (above) marking fully drawn. A performance overlay of my own in the race (Menu key: loop rate, JS time per frame, input latency, audio state). On 21 Oct, measured on the Vega Virtual Device, headless, Apple-silicon host: cool start again with 10 runs (time to first frame 665 ms mean, min 631, max 719, on a loaded host), and attempts at warm start, memory, foreground memory and UI fluidity. Only cool start produced numbers; app memory came from `vega exec perf activity-monitor` instead (124 MiB on Home, 233 MiB at most after three races).

**What worked well.**
- One command gave a report with n, min, mean, max, standard deviation and confidence interval per KPI: on 20 Oct (3 runs) time to first frame 408 ms mean (min 192, max 553), time to fully drawn 409 ms mean, JS bundle load 17.6 ms; on 21 Oct (10 runs, loaded host) 665 ms, 665 ms and 8.5 ms. The targets are under 1.5 s and under 8 s.
- It installs what it needs on the device (`KSPTService`) by itself.

**What needs work.**
- An app that makes no network calls at launch fails validation with "[-1 != -1]" and "VALUE VALIDATION FAILED", even though the latency numbers are fine (#16).
- UI fluidity needs a `--test-scenario` script; a ready-made "D-pad through every focusable item" scenario would help.
- `--kpi memory`, `--kpi foreground-memory` and `--kpi ui-fluidity` all stop with "Appium server is not found in the platform", even with no `--test-scenario`. Memory doesn't need UI automation, and `activity-monitor` reads it without Appium, so the KPI could too.
- `--kpi warm-start-latency` can't run on the Vega Virtual Device: its prep step sends the app to the background with `vmsgr send pkg://com.amazon.smplighthouse.launcher.main`, the Fire TV launcher. The VVD's launcher is `com.amazon.keplerlauncherapp.main`, so every prep fails ("Failed to send message, remote error"), each iteration retries 5 times and the report ends with "iterations completed: 0" and doesn't say why. Pick the launcher from the device, or say why the prep failed.
- ADBT `analyze_perfetto_traces` couldn't read the cool-start traces: "Unable to locate trace processor binary ... Vega Performance CLI path is not available", while `vega exec perf` worked in the same shell.

**Onboarding.** Add one hook, run one command. The performance skill (section 3) pointed to it.

**Would I build with it again?** Yes. Holding an app to published KPI targets with one command is exactly what a TV platform should offer.

## 6. Claude API (Anthropic)

**What I used it for.** One call per drawing. The relay sends the cut-out image and gets back a persona as structured JSON: name, title, personality, three spoken lines, stats, move style, the drawn feature behind the creature's ability, colours and eye positions. Model `claude-opus-5-5` with `effort: low`, structured outputs (`json_schema`), a 12 s timeout, no retries, and the server-side refusal fallback beta. Any failure falls back to an offline generator.

**What worked well.**
- Structured outputs make the answer one JSON object that the relay validates against a schema, with no prompt tricks.
- Measured over 11 real scans on 21 Oct: median latency about 4.3 s (3.7 to 5.3 s; the first, cold call 7.2 s), 2.4k to 2.7k tokens in and 210 to 255 out, about $0.015 per creature at list price. Fast enough that a child is still holding the phone when the creature appears.
- Names were repetitive ("Bobble ..." five times) until the request listed the names already taken in the room and the recent Hall of Fame. After that: Zippy Sprinkle, Sunny Jellybean, Captain Bleep, Mister Fizzwhistle, Wiggle Muffin, Peachy Plum.

**What needs work.**
- Structured outputs ignore `minimum`, `maximum` and `maxLength`. Stats had to become an integer enum, and lengths are clamped on the server.
- When unsure where the drawn eyes are, the model returns no eye positions, which the TV first read as "no eyes" and covered with a default pair. The schema now also asks whether the child drew eyes at all.
- The SDK reads `ANTHROPIC_BASE_URL` (and `ANTHROPIC_AUTH_TOKEN`) from the environment by default. Developer tooling on this Mac had set a local proxy, so the client is built with an explicit `baseURL` and `authToken: null`.
- An API key that isn't scoped to a workspace needs an `anthropic-workspace-id` header, or the API answers 400.
- Thinking cannot be turned off on Opus 5.5. `effort` is the only latency control.

**Onboarding.** The request shape and the timeout were first checked against a local mock API, then worked against the real API once the workspace header was added.

**Would I build with it again?** Yes. A scan stays well under the 6 to 8 s I set as the limit for kids, and the cost per creature is low enough for a yearly family pass ([IMPACT.md](IMPACT.md)).

---

## Other tools (not Amazon)

- **Bun 1.4.3.** Ran the relay, its tests and the mock server with no build step. Snags: it loads `.env` only from the current folder, and shell variables win over `.env`; in the bundled types, `ws.send()` returns a number, so a one-line arrow handler fails the typecheck; it aborts with "panic: A C++ exception occurred" when a process that loaded onnxruntime exits, so the voice model runs in a child process.
- **Kokoro-82M via `kokoro-js` 1.2.1.** Fully offline after a one-time download of about 330 MB. Every test clip, including the most pitch-shifted ones, was transcribed correctly by a speech-to-text check. A creature's three lines take about 4.3 s on an M5 MacBook. `bun install` reports two blocked postinstalls (onnxruntime-node, protobufjs), which can stay blocked.
- **adb (Android SDK platform-tools 37.0.1).** Needed for VVD screenshots, recording and key presses. With the Unity Editor open, its adb 36.0.0 and ours kill each other's server, dropping key presses mid-test; using Unity's adb while it is open avoids it.
- **Vite and TypeScript.** No friction recorded.
