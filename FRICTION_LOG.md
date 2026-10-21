# Friction log: building Sketchlings on Vega

Real problems hit while building a React Native for Vega app, worst first. Every entry has the same fields: tool and version, task attempted, steps taken, expected vs actual, severity, workaround and suggestion. Snags with tools outside the Amazon ecosystem are in a short appendix.

**Setup:** MacBook (Apple silicon, 16 GB), macOS 27.0.1, Node 26.12, npm 11.20.0, Vega SDK 0.24.12112, Vega CLI 1.4.5, Vega Perf CLI 0.24.0, Vega Virtual Device (VVD) with the bundled Android emulator 34.1.15, `@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0. All testing was on the VVD. No Fire TV hardware was used.

**Severity:** **Critical** = the app hangs for good and the platform does not report it correctly. **High** = you can't see the app, or it hangs or crashes. **Medium** = blocks a task until you find an undocumented workaround. **Low** = an annoyance with an easy workaround.

| # | Problem | Tool | Severity |
|---|---|---|---|
| 1 | **Race-start freeze: an ABBA deadlock inside Vega's JS-thread watchdog**, root-caused from the ACR core dump | React Native for Vega runtime (`KeplerScriptThreadMonitor`, `libasync`), on the VVD | Critical |
| 2 | VVD window crashes on boot on macOS 27 | Vega Virtual Device | High |
| 3 | The headless VVD's own hang detector kills it when the host stalls for 15 s | Vega Virtual Device (headless) | High |
| 4 | `requestAnimationFrame` fires about 7,600 times a second on the headless VVD | Vega Virtual Device (headless) | High |
| 5 | Audio work stalls or hangs the JS thread on the VVD | `react-native-w3cmedia`, on the VVD | High |
| 6 | The VVD renderer stops redrawing after a rotated view appears in a rounded, clipped card; the app gets no error | Vega Virtual Device renderer | Medium |
| 7 | The build fails when the project path contains a space | Vega SDK build (`kepler-compatibility-metro-config`) | Medium |
| 8 | The `.npmrc` step in the qrcode-svg docs removes the `build-vega` command | Vega docs, `react-native-qrcode-svg` | Medium |
| 9 | w3cmedia needs eight manifest services for a 2-second clip; missing ones fail quietly | `react-native-w3cmedia` | Medium |
| 10 | No `vega` command or docs page for screenshots or recording; the SDK's `vda` can't do it | Vega Virtual Device, Vega CLI | Medium |
| 11 | ADBT `symbolicate_acr` fails on the VVD ("Failed to copy acr_libraries.txt") | Amazon Devices Builder Tools MCP | Medium |
| 12 | ADBT `init-context` ignores its own Node 24 requirement | Amazon Devices Builder Tools MCP | Medium |
| 13 | Remote keys on a headless VVD: no `vega` command, and the docs' developer-mode step didn't match | `inputd-cli`, Vega CLI | Low |
| 14 | Building in place rewrites the source `manifest.toml` | Vega SDK build | Low |
| 15 | `loggingctl` shows no `console.log` output from release builds | `loggingctl` | Low |
| 16 | KPI Visualizer fails validation when the app makes no network calls at launch (`-1 != -1`) | Vega Perf CLI (`kpi-visualizer`) | Low |
| 17 | The Vega skills depend on the ADBT MCP server and add little without it | Amazon Devices Builder Tools skills | Low |
| 18 | The VVD clock ran about 2 h 11 min behind the Mac | Vega Virtual Device | Low |
| 19 | `adjustsFontSizeToFit` does nothing on Vega | React Native for Vega (`Text`) | Low |
| 20 | qrcode-svg needs a `TextEncoder` polyfill in the app | `react-native-qrcode-svg` | Low |
| 21 | Custom fonts on RN 0.83: `expo-font` lists only RN 0.72, and `fontFamily` must be the file name | `@amazon-devices/expo-font` docs, React Native for Vega | Low |
| 22 | Installer: no telemetry opt-out at install, scripted mode undocumented | Vega SDK installer | Low |
| 23 | The headless VVD renders in software and keeps ~7 host cores busy while an app animates | Vega Virtual Device 0.24 | Medium-high |
| 24 | KPI Visualizer can't measure warm start (Fire TV launcher hard-coded) or memory and UI fluidity (Appium required) on the VVD; ADBT `analyze_perfetto_traces` can't find the Perf CLI | Vega Perf CLI (`kpi-visualizer`), Amazon Devices Builder Tools MCP | Medium |

---

## 1. Race-start freeze: an ABBA deadlock inside Vega's JS-thread watchdog

- **Tool / version:** React Native for Vega runtime (`@amazon-devices/react-native-kepler` 4.0.1+rn0.83.0, `libkeplerscript-4.so.4`), its JS-thread watchdog (`KeplerScriptThreadMonitor`, `libframework-thread-monitor.so`, `libasync.so.0`), on the Vega Virtual Device (headless), Vega SDK 0.24.12112.
- **Task attempted:** start a Doodle Dash race: a 3-2-1-GO countdown, then up to six racers moved by `Animated` values on the native driver.
- **Steps taken:**
  1. On 19-20 Oct, played Demo party and live parties with simulated phones (`tv/scripts/fake-phones.mjs`). At that time race start meant one long mount commit, about 40 zero-duration native "attach" animations with completion callbacks, a frame loop of three JS tasks per frame (`requestAnimationFrame`, `setTimeout(0)` and a pacing timeout) and narrator audio through w3cmedia.
  2. When a race froze, pressed Back and pulled the crash reports with `vega device copy-logs -a SYSTEM_TOMBSTONE/acr`.
  3. The ACR's `<minidump_stackwalk>` section only unwinds the main thread. But every ACR also carries `<coredump_lz4_base64>`: an ELF core dump with every thread's registers and stack. We read the core dump's thread stacks with symbol names from the device libraries (pulled with `adb pull /usr/lib/...`), using a small script that is now in the repo and works on any ACR: [`tv/scripts/acr-stacks.py`](tv/scripts/acr-stacks.py).
  4. On 21 Oct, tried to reproduce the freeze on purpose on a healthy VVD with a stress screen, to rule out app-level causes.
- **Expected:** the race starts. If the JS thread ever stalls, the watchdog raises its own "Thread Monitor" ANR that names the stuck thread.
- **Actual:**
  - About 1 race start in 4 (before any mitigation; more often with audio playing) stuck on "3". Nothing JS-driven moved. After Back, the lifecycle manager killed the app: `CrashReason: AppNotResponding`, `LCM_ANR_REASON: Lifecycle Callback`, `JSThread thread ID: 18`, "No JavaScript code is currently being executed".
  - All 5 "Lifecycle Callback" ACRs from 20 Oct (09:15 to 13:43 UTC) show the same three stuck threads:

    | Thread | Stack, innermost first |
    |---|---|
    | JS thread (tid 18) | `send()` ← `aceAsync_triggerSend` ← `aceAsync_deferredRemove` ← `AsyncHandler::cancel` ← `orpheus::framework::utils::ThreadMonitor::stopTimer` ← `ThreadMonitor::resetTimer` ← `volta::react::KeplerScriptThreadMonitor::sendHeartbeat` ← a RuntimeScheduler task |
    | Watchdog loop thread (tid 20, from `libframework-thread-monitor.so`) | `pthread_mutex_lock` ← `aceAsync_deferredPoll` ← `aceAsyncLoop_run` |
    | Main thread | `pthread_mutex_lock` ← `KeplerScriptThreadMonitor::appMovedToBackground` ← `onBackground` (the Back press). The heartbeat timer thread waits on the same mutex in `requestHeartbeat`. |

  - **Root cause.** The JS thread is not running JavaScript (hence "No JavaScript code is currently being executed"). It is blocked in a `send()` on the watchdog's local wake-up socket, made from inside `aceAsync_deferredRemove` while it holds the loop's deferred-work mutex. The only thread that drains that socket is the watchdog's loop thread, and it is waiting for that same mutex in `aceAsync_deferredPoll` before it reads. Neither can move: a permanent ABBA deadlock. The send blocks once the loop thread falls behind by a full socket buffer (`wmem_default` is 212,992 bytes on the VVD, a few hundred queued wake-ups), which is easy when the JS thread churns many small tasks, because watchdog timers are posted and cancelled around JS work and each post or cancel sends a wake-up. The watchdog can't report the hang, because its own loop is one of the deadlocked threads. So the app hangs until a lifecycle callback (Back) needs the `KeplerScriptThreadMonitor` mutex, and the lifecycle manager kills it.
  - Race start was the worst moment: many tiny JS tasks at once, on a VVD whose virtual CPUs stall when the Mac is loaded. The 20 Oct freezes happened with the Mac under heavy load (on 21 Oct the 16 GB Mac had 16 of 17 GB swap in use and a load average over 30).
  - **What did not reproduce it** (21 Oct, healthy VVD): a 7,600/s `requestAnimationFrame` chain; a 7,500/s `setTimeout(0)` chain, also with 240 native-animated views spinning; 470/s native `Animated` listener events; a listener that calls `setValue` on another value; single long JS tasks of 0.5, 2 and 5 s. All kept running. A 10 s task was killed correctly by the watchdog after about 8 s ("Thread 'JSReactThread' (18) detected to be unresponsive"). So the trigger needs the watchdog's loop thread to be starved while the JS thread churns tasks.
  - A 6th ACR from 20 Oct (13:22, `LCM_ANR_REASON: Thread Monitor`) is a different hang inside the media library: see #5.
- **Severity:** Critical. The app hangs for good, the family loses the game, and the watchdog built to catch hangs misses it. The app can make it unlikely but can't rule it out.
- **Workaround:** starve the bug of wake-ups instead of patching symptoms (`tv/src/screens/Race.tsx`, 21 Oct):
  - the frame loop is exactly one `setTimeout` task per frame (see #4);
  - race values are native from birth (`new Animated.Value(v, {useNativeDriver: true})`), so the ~40 attach animations and their callbacks at race start are gone;
  - the race is silent: no w3cmedia work during the race, and a creature line still queued when the race mounts is dropped. Captions carry every line.

  Soak test since the fix (`tv/scripts/soak.mjs` checks screenshots at +4.5 s and +6 s after each race start for a stuck countdown or a still screen):

  | Build | Party | Race starts | Frozen |
  |---|---|---|---|
  | Fix step 1: one task per frame, silent race | Demo | 12 | 0 |
  | + native-from-birth values, abilities | Demo | 10 | 0 |
  | Final (commit `afdb370`), sound on outside the race | Demo | 10 | 0 |
  | Final, 4 simulated phones | Live | 10 | 0 |
  | 6 lanes (Hall of Fame guests), before the blot fix | Demo | 7 | **3** |
  | + ink blots mount one lane per 300 ms during 3-2-1, 20 Hz loop until GO | Demo, 6 lanes | 10 | 0 |
  | **Total since the fix** (4-6 lanes) | | **59** | **3**, all on the 6-lane build before the blot fix |

  With 6 lanes the freeze came back (3 of 7 starts, 21 Oct, Mac at load 14-20 with 11-14 GB swap in use; this time no ACR was written and Back did not kill the app). A 6-lane build without the ink-blot images ran 8 of 8, so the trigger was ~66 blot images mounting in the same instant as the race (81 image loads within 0.3 ms in the log): a burst of native-to-JS callbacks, each one a watchdog message, on an already starved host (#23). Spreading the blots over the countdown (one lane every 300 ms) and running the loop at 20 Hz until GO ran 10 of 10 six-lane starts clean on the same loaded Mac.

  Honest caveat: the 20 Oct build without the fix also passed 12 race starts on 21 Oct, on a quieter Mac. A clean soak alone doesn't prove the fix. The evidence is the mechanism in the stacks, plus removing most of the app's watchdog traffic at race start.
- **Suggestion:**
  - Don't hold the deferred-work mutex across `send()`.
  - Make the wake-up non-blocking and coalescing: one pending wake-up is enough (an `eventfd`, or `MSG_DONTWAIT` that ignores `EAGAIN`).
  - Don't post and cancel a watchdog timer for every JS task. Stamp an atomic on the JS thread and check it from a periodic timer.
  - Unwind every thread in the ACR's `<minidump_stackwalk>`. The data is already in the core dump, and with it this bug is visible in minutes.
  - Make `symbolicate_acr` work on the VVD (#11).

## 2. Vega Virtual Device window crashes on boot (macOS 27)

- **Tool / version:** Vega Virtual Device (Vega SDK 0.24.12112, bundled Android emulator 34.1.15), Vega CLI 1.4.5, macOS 27.0.1 on Apple silicon.
- **Task attempted:** start the VVD to run the helloWorld template.
- **Steps taken:** `source ~/vega/env`, then `vega virtual-device start --timeout 240`.
- **Expected:** the VVD window opens and the CLI prints "Virtual device ready".
- **Actual:** "Deadline reached (240s) but virtual device unresponsive." `vega virtual-device status` reports `{"running":false}`. `virtual_device.err` ends with a crashpad `UniversalExceptionRaise: (os/kern) failure (5)` after many `sPrepareTexImage2D ... failed validation` lines and "running without ARB/KHR robustness in place may crash". The bundled emulator warns that it doesn't support features such as `Vulkan`, `HVF`, `TvRemote` and `ScreenRecording`.
- **Severity:** High. You can't see your app. It also removes the on-screen remote (#13) and the window's own capture menu (#10).
- **Workaround:** `vega virtual-device start --no-gui --timeout 300` boots headless in about 10 s. View the screen with `adb -s emulator-5554 emu screenrecord screenshot <dir>` (#10) and press keys with `inputd-cli` (#13).
- **Suggestion:** surface the emulator crash instead of a generic timeout. Offer a software-GPU fallback on macOS (`--no-gl-accel` is Linux-only today) or update the bundled emulator. Publish a macOS version support matrix.

## 3. The headless VVD's own hang detector kills it when the host stalls

- **Tool / version:** Vega Virtual Device, headless (`--no-gui`), bundled Android emulator 34.1.15, Vega CLI 1.4.5, macOS 27.0.1, 16 GB Mac.
- **Task attempted:** keep the headless VVD up through a day of builds, soak tests and recordings.
- **Steps taken:** `vega virtual-device start --no-gui --timeout 300`, then normal development, while the Mac also ran builds and other jobs.
- **Expected:** the VVD slows down when the host is busy, and keeps running.
- **Actual:** it dies with the same crashpad `UniversalExceptionRaise: (os/kern) failure (5)` as #2. On 20 Oct after about 2 hours. On 21 Oct 4 times in 12 minutes, even idle with no app running. Each time `virtual_device.err` first logs `ERROR | detected a hanging thread 'QEMU2 main loop'. No response for 15015 ms` (and the same for every vCPU thread). Twice it was preceded by `coreaudio: Could not initialize record ... kAudioHardwareIllegalOperationError`: the emulator opens the Mac's microphone (`hw.audioInput = yes` in the instance's `hardware-qemu.ini`). The Mac had 16 of 17 GB swap in use and a load average over 30. The emulator's own hang detector aborts it when the host swaps it out.
- **Severity:** High. The device disappears mid-test, the app has to be reinstalled, and a soak run or a recording is lost.
- **Workaround:** reboot with `vega virtual-device start --no-gui --timeout 300` (about 10 s) and reinstall. Keep memory free while testing. `tv/scripts/soak.mjs` waits for a restarted VVD and reinstalls before it continues, and counts those sessions as "failed to start", never as passes.
- **Suggestion:** make the hang detector tolerate host stalls, or log "host stalled for 15 s" and carry on instead of aborting. Add `--no-audio` (no speaker, no microphone) to `vega virtual-device start`.

## 4. `requestAnimationFrame` fires about 7,600 times a second on the headless VVD

- **Tool / version:** Vega Virtual Device, headless (`--no-gui`), Vega SDK 0.24.12112; React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** run the race loop once per display frame.
- **Steps taken:** drove the race simulation from `requestAnimationFrame`, one step per callback, and counted callbacks. On 21 Oct measured again with a bare `requestAnimationFrame` chain and nothing else running.
- **Expected:** about 60 callbacks a second, in step with the display.
- **Actual:** a bare chain fires about **7,600 times a second** (21 Oct). Inside the busier race build on 20 Oct it was about 1,250 a second. The race ran about 10 times too fast and starved JS timers, so the countdown never advanced. A bare `setTimeout(0)` chain runs about 7,500 times a second, so it is no frame clock either.
- **Severity:** High. The game was unplayable until worked around, and nothing in the logs points at the cause.
- **Workaround:** no `requestAnimationFrame` in the race. The loop is one `setTimeout` per frame that subtracts the frame's own work: `setTimeout(tick, Math.max(1, 16 - spent))`. It also keeps the JS task count low, which matters for #1. The in-app overlay read 57 to 65 frames a second with 0.1 to 1.2 ms of JS per frame on 20 Oct. The loop is not vsync-aligned, so we will move back to `requestAnimationFrame` once it is tested on Fire TV hardware.
- **Suggestion:** tie `requestAnimationFrame` to a virtual vsync in headless mode, or document the difference. Expose the display refresh rate to apps. We could not check the VVD window (#2) or hardware.

## 5. Audio work stalls or hangs the JS thread on the VVD

- **Tool / version:** `@amazon-devices/react-native-w3cmedia` 2.3.2 (`AudioPlayer`, Media Source Extensions), `libW3CMedia.so`, `libkepler_media_player.so`, on the Vega Virtual Device (headless), Vega SDK 0.24.12112.
- **Task attempted:** play creature voice lines (up to about 5 s) and narrator lines during the reveal and the race.
- **Steps taken:** one `AudioPlayer` for all clips. While a 5 s clip was playing, the next clip replaced the player's `srcObject` with a new `MediaSource`. Pulled ACRs with `vega device copy-logs` after each hang and read their thread stacks as in #1.
- **Expected:** the new clip plays and the game keeps running at full speed.
- **Actual:**
  - While the long clip played and another replaced it, the game dropped to 0 to 15 frames a second and the countdown stalled. `ended` never fired for the replaced clip.
  - An ACR from 20 Oct (13:22, `LCM_ANR_REASON: Thread Monitor`) shows the JS thread blocked on a mutex inside `libW3CMedia.so`, with a JS frame in the w3cmedia bundle: audio can hang the JS thread by itself.
  - An ACR from a soak on 21 Oct (18:55 UTC) is a SIGSEGV inside `libkepler_media_player.so` on the media thread. During another hang (#6), w3cmedia kept logging "No Time update even in Playing state: 0.951" every 250 ms: a player stuck mid-clip.
  - Race starts with narration playing froze more often in #1.
  - On 21 Oct, with sound on (build `4c25958`), three ACRs are a SIGSEGV at `libW3CMedia.so + 0x63e844` on thread 0: one while pressing Next through the Reveal cards every 1.4 s, two as Results opened (the narrator's "winner is", then the creature's win line). The app drops to the launcher. None with `MUTE=1`.
  - **Root cause of the SIGSEGV (21 Oct, F13 in `notes/tv.md`):** each clip assigned a new `MediaSource` to the player's `srcObject`, and the next queued line started straight from the `ended` handler. That detaches the old source and its SourceBuffer while the old pipeline is still finishing; a long-lived libW3CMedia thread then dereferences it. Five ACRs (three from the morning, two from a repro) share the same 6-frame stack, read from the core dumps' thread stacks with symbol names, and the device log shows `ended` → source swap → `DetachMediaSource` → the old pipeline still posting → SIGSEGV within 120 ms. **Fix:** one `AudioPlayer`, one `MediaSource` and one SourceBuffer for the whole session; each clip is appended after the last and played from its start, paused when it ends; `hush()` also stops a playing clip so the race stays silent. Repro on the old code: 5 crashes in 216 clips; after the fix 0 in 193 clips, and 0 crashes over 73 Reveal/Results screens with 0 race-start freezes in 35 starts (sound on). **Suggestion:** reassigning `srcObject` while the previous source is draining must not crash the native player; document a supported pattern for short sequential clips (or ship a sound-effect/voice API that doesn't need MSE).
- **Severity:** High. It can hang or crash the app, and the cause isn't obvious.
- **Workaround:**
  - Never interrupt a playing clip: lines are queued, and a narrator line is dropped while a creature voice plays. A safety cap clears the "busy" state if `ended` never arrives (`tv/src/audio.ts`).
  - Since 21 Oct the race plays no audio at all. Voices play only on Reveal and Results, one clip at a time, and every voiced line is also on screen as a caption.
  - Build with `MUTE=1` (`tv/scripts/vbuild.sh`) for automated runs.
  - We don't know whether Fire TV hardware is affected.
- **Suggestion:** never block the JS thread on a media-library mutex. Fire `ended` (or an abort event) for a replaced clip. Document how to switch clips safely. Add a short sound-effect API for games, so a game doesn't need a full media pipeline for a 1-second "ROAR".

## 6. The VVD renderer stops redrawing after a rotated view appears in a rounded, clipped card

- **Tool / version:** Vega Virtual Device renderer (bundled emulator 34.1.15), React Native for Vega 4.0.1+rn0.83.0, Vega SDK 0.24.12112.
- **Task attempted:** show a "Racing next!" tag on a Hall of Fame card when the player picks that creature for the next race.
- **Steps taken:** added a tag with `transform: [{rotate: '6deg'}]` inside the card's rounded, clipped box, with a "✓" glyph that comes from a fallback font. Picked a creature with OK.
- **Expected:** the tag appears.
- **Actual:** the picture stopped updating: two stale frames alternated and parts of the screen went blank. JS kept running: Back really went Home, but nothing redrew until the app went to the background and came back. `virtual_device.err` filled with `sPrepareTexImage2D ... failed validation`. The app got no error and nothing in the app's logs.
- **Severity:** Medium. The screen freezes with no error anywhere, so it looks like an app hang. Once found, it is easy to avoid.
- **Workaround:** a straight tag placed inside the corners, and no "✓" glyph (commit `afdb370`). A pick and three focus moves after it redraw fine. We did not isolate which of the two caused it, and did not check hardware.
- **Suggestion:** fix or document the clip path for transformed children of rounded, clipped views. Report renderer validation failures somewhere an app developer will see them.

## 7. The build fails when the project path contains a space

- **Tool / version:** Vega SDK 0.24.12112 build (`npm run build:release`, which runs `react-native build-vega`), `@amazon-devices/kepler-compatibility-metro-config` 0.0.7, Node 26.12.
- **Task attempted:** build the TV app from a project folder under `~/Library/Application Support/...`.
- **Steps taken:** `cd tv && npm run build:release`.
- **Expected:** the build succeeds, or fails with a clear message about the path.
- **Actual:** `kepler-compatibility-metro-config` runs the manifest builder through `execSync` without quoting the path. The build fails with `/bin/sh: /Users/.../Library/Application: No such file or directory` and "Unable to generate a manifest".
- **Severity:** Medium. It blocks the build completely, the error looks like a missing file, not a quoting bug, and `~/Library/Application Support` is a common macOS path.
- **Workaround:** `tv/scripts/vbuild.sh` rsyncs `tv/` and `shared/` to a folder without spaces, builds there and copies the `.vpkg` back. Or clone the repo to a path without spaces.
- **Suggestion:** quote the path, or use `execFileSync` with an argument array. Add a CI build with a space in the project path. Until it is fixed, check for spaces at the start of the build and print a clear message.

## 8. The `.npmrc` step in the qrcode-svg docs removes the `build-vega` command

- **Tool / version:** Vega API docs page for `react-native-qrcode-svg` (0.24), `@amazon-devices/react-native-qrcode-svg` 3.0.0+6.3.15, React Native for Vega 4.0.1+rn0.83.0, npm 11.20.0.
- **Task attempted:** add the join QR code to the Lobby screen, following the docs.
- **Steps taken:** added the package, then followed the install step that says "Due to a known issue with React Native dependencies, you must apply the following workaround": `legacy-peer-deps=true` in `tv/.npmrc`. Ran `npm install`, then `npm run build:release`. The step sits after the per-version tabs, so it reads as applying to RN 0.83 too.
- **Expected:** the build still works.
- **Actual:** `error: unknown command 'build-vega'` (`Cannot find module '@react-native-community/cli-tools'`). Nothing points at the `.npmrc` as the cause.
- **Severity:** Medium. It breaks the build with an error that looks unrelated to the QR package.
- **Workaround:** don't add the `.npmrc`. A plain `npm install` resolves qrcode-svg 3.0.0 and its dependencies fine on RN 0.83.
- **Suggestion:** limit the `.npmrc` step to the versions that need it, or fix the peer dependencies so it isn't needed. If `legacy-peer-deps` stays, warn that it can drop the Vega CLI plugin's dependencies.

## 9. w3cmedia needs eight manifest services for a 2-second clip; missing ones fail quietly

- **Tool / version:** `@amazon-devices/react-native-w3cmedia` 2.3.2, Vega SDK 0.24.12112, `manifest.toml` schema-version 1, on the Vega Virtual Device.
- **Task attempted:** play short creature voice lines and narrator lines (AAC-LC in fragmented MP4, 0.5 to 5 s each).
- **Steps taken:** followed the Vega media player setup docs. Declared media services under `[wants]` in `manifest.toml`. Created `AudioPlayer(CONTENT_TYPE_SPEECH, USAGE_GAME)`, called `initialize()`, attached a `MediaSource`, appended the whole clip to one `SourceBuffer` (`audio/mp4; codecs="mp4a.40.2"`), called `endOfStream()` and `play()`.
- **Expected:** the clip plays, or an error names what is missing.
- **Actual:**
  - Without `com.amazon.audio.system` in `[wants]` the log shows "Unable connect to 'com.amazon.audio.system'. Missing the permissions". The media docs say missing `[wants]` services give silent failures.
  - Eight services are needed in the end, even for a 2-second clip: `mediametrics.service`, `mediabuffer.service`, `mediatransform.service`, `audio.stream`, `audio.control`, `audio.system`, `media.server` and `media.playersession.service` (all `com.amazon.*`).
  - With all eight, `MediaSource.isTypeSupported` returns true, and `appendBuffer`, `endOfStream` and `play()` succeed for bundled and server clips. Narrator clips fire `ended`.
  - On 21 Oct we confirmed the VVD's audio reaches the Mac: while the app plays clips, macOS `coreaudiod` holds an "audio-out BuiltInSpeakerDevice" assertion created for the VVD's process (`pmset -g assertions`). We could not prove the samples are non-silent: nothing on the Mac could capture the VVD's output, and `screenrecord` has no audio track (#10).
- **Severity:** Medium. Voices are a core feature, and failures are quiet.
- **Workaround:** declare all eight services (`tv/manifest.toml`). The app loads w3cmedia lazily, logs `isTypeSupported`, falls back from MSE to URL mode if appending throws (never needed on the VVD), and turns sound off for the session on the first failure so the game never blocks. Narrator clips are bundled as base64 strings in a TypeScript module, so they play without reading binary assets from the package.
- **Suggestion:** a build-time check that warns when w3cmedia is a dependency but its services are missing from `[wants]`. A runtime error that names the missing service. A short "play a sound effect" recipe for games. State clearly whether the VVD supports audio output, and how to hear or capture it.

## 10. No `vega` command or docs page for screenshots or recording; the SDK's `vda` can't do it

- **Tool / version:** Vega Virtual Device (bundled emulator 34.1.15), Vega CLI 1.4.5, Vega SDK 0.24.12112 with Vega Device Adapter (`vda`) 2.6.
- **Task attempted:** capture screenshots and a full-length video of the app for the hackathon demo.
- **Steps taken:** looked for a `vega` command (`vega device --help` lists none for capture) and checked the docs. No page in the Vega 0.24 docs index has screenshots or screen recording in its title or summary. Then used the emulator console through `adb` from Android SDK platform-tools: `adb -s emulator-5554 emu screenrecord screenshot <dir>`, and `... emu screenrecord start <file.webm>` / `stop`. We did not try the Appium route the docs describe for UI tests.
- **Expected:** a `vega` command for screenshots and recording.
- **Actual:** the docs only mention "Dump Render Tree" and "Dump Rendered Text" in the window's context menu, which doesn't exist headless (#2). The bundled emulator warns that it doesn't support `ScreenRecording`, yet `adb emu screenrecord` works, including a full-HD recording, but the recording has no audio track. The SDK ships its own adb-like tool, `vda`, but `vda help` lists no `emu` (emulator console) command, so a separate `adb` is needed.
- **Severity:** Medium. Video is required for the submission, and the working route is undocumented.
- **Workaround:** install Android SDK platform-tools for `adb`. `tv/scripts/remote.sh shot <out.png>` wraps the screenshot command. For sound, record the room's speakers separately.
- **Suggestion:** add `vega device screenshot` and `vega device record` (with audio), or add `emu` to `vda` and document the `screenrecord` route.

## 11. ADBT `symbolicate_acr` fails on the VVD

- **Tool / version:** Amazon Devices Builder Tools MCP (`@amazon-devices/amazon-devices-buildertools-mcp@latest` through `npx`, 21 Oct), `symbolicate_acr` tool in gdb mode, Claude Code CLI, Vega Virtual Device `emulator-5554`.
- **Task attempted:** symbolicate the race-freeze ACRs (#1) to see what every thread was doing.
- **Steps taken:** connected the ADBT MCP server in Claude Code, then called `symbolicate_acr` (gdb mode, `deviceId: emulator-5554`) on an ACR pulled with `vega device copy-logs -a SYSTEM_TOMBSTONE/acr`.
- **Expected:** symbolicated stacks for the ACR's threads.
- **Actual:** "Failed to copy .../temp_acr_debugFs/acr_libraries.txt to emulator-5554". No stacks.
- **Severity:** Medium. The one tool built for this job failed on the only device we had, on the most serious bug of the project.
- **Workaround:** [`tv/scripts/acr-stacks.py`](tv/scripts/acr-stacks.py): decode the ACR's embedded core dump, walk each thread's frame-pointer chain, and name frames with the exported symbols of the device's own libraries pulled with `adb`. It needs the `lz4` CLI and Xcode's `llvm-objdump`.
- **Suggestion:** make `symbolicate_acr` work against the VVD, or say which devices it supports. Report which copy step failed and why. Return every thread's stack, not only the crashed thread's.

## 12. ADBT `init-context` ignores its own Node 24 requirement

- **Tool / version:** Amazon Devices Builder Tools MCP (`@amazon-devices/amazon-devices-buildertools-mcp@latest`; 1.0.17 in the local npx cache), Claude Code CLI, Node 24 (Homebrew `node@24`) next to a default Node 26.12.
- **Task attempted:** set up ADBT for Claude Code on a Mac whose default Node is 26.
- **Steps taken:** `brew install node@24`, then `PATH=/opt/homebrew/opt/node@24/bin:$PATH npx -y @amazon-devices/amazon-devices-buildertools-mcp@latest init-context --agent claude-code-cli --force`.
- **Expected:** the MCP entry it writes keeps using Node 24. The docs say Node 26 fails with an SQLite3 bindings error.
- **Actual:** it registers `"command": "npx"` in `~/.claude.json`, which resolves to the default Node 26 at runtime, so the server would hit the documented SQLite error. `check-status` then reports "Partially configured" with no hint why. The Prerequisites snippet inside the installed Vega skills also uses a plain `"command": "npx"`.
- **Severity:** Medium. A silent misconfiguration on the newest Node.
- **Workaround:** edit the entry by hand: `"command": "/opt/homebrew/opt/node@24/bin/npx"` plus `"env": {"PATH": "/opt/homebrew/opt/node@24/bin:/opt/homebrew/bin:/usr/bin:/bin"}`.
- **Suggestion:** have `init-context` write the absolute path of the Node that ran it, or check `node -v` and warn on 26 and later. Make `check-status` say which part is missing.

## 13. Remote keys on a headless VVD: no `vega` command, and the docs' developer-mode step didn't match

- **Tool / version:** `inputd-cli` on the Vega Virtual Device (headless), Vega CLI 1.4.5, Vega SDK 0.24.12112; Vega docs page "Simulate Device Input with inputd-cli" (0.24).
- **Task attempted:** navigate the TV app (D-pad, OK, Back, Menu, Play/Pause) with no VVD window, for testing and for recording the demo.
- **Steps taken:** the remote control is part of the VVD window, which crashes on macOS 27 (#2). `vega device --help` has no key-press command. Used `inputd-cli` through `adb`: `adb -s emulator-5554 shell inputd-cli button_press KEY_ENTER` (also `KEY_UP`, `KEY_DOWN`, `KEY_LEFT`, `KEY_RIGHT`, `KEY_BACK`, `KEY_MENU`, `KEY_PLAYPAUSE`).
- **Expected:** one documented `vega` command to send remote keys to a VVD or a dev-mode device.
- **Actual:** it works through `adb shell`, with no `vsm developer-mode enable`. The docs describe a different route, `vega exec inputd-cli button_press KEY_BACK` over a VDA connection, and say a VVD needs `vsm developer-mode enable` first, with only the `get_*` commands available without it. So there are two routes, and the docs and the VVD disagree on developer mode. We did not try the documented `vega exec` route. In JS, `KEY_PLAYPAUSE` arrives as `eventType: 'play'`, not `'playpause'`.
- **Severity:** Low. It works once you find the `inputd-cli` page.
- **Workaround:** `tv/scripts/remote.sh up|down|left|right|select|back|menu|playpause [count]`.
- **Suggestion:** add `vega device press <key>`, or at least point to `inputd-cli` from `vega device --help`. Say whether `adb shell` is a supported route and when a VVD really needs developer mode.

## 14. Building in place rewrites the source `manifest.toml`

- **Tool / version:** Vega SDK 0.24.12112 build (`npm run build:release`, which runs `react-native build-vega`).
- **Task attempted:** build the TV app in place in `tv/` (possible once the repo moved to a path without spaces, #7).
- **Steps taken:** `cd tv && npm run build:release`, then `git status`.
- **Expected:** the source `manifest.toml` stays as written.
- **Actual:** the build appends five `[[needs.module]]` entries (`kepler_media_controls`, `keplermediadescriptor`, `keplerscript_4`, `svg_3`, `w3cmedia_2`) to the source `manifest.toml`, so every build leaves a diff in version control.
- **Severity:** Low. Noise in every commit, and easy to commit by accident.
- **Workaround:** keep building through `tv/scripts/vbuild.sh`, which builds in a mirror folder.
- **Suggestion:** write the generated manifest to `build/`.

## 15. `loggingctl` shows no `console.log` output from release builds

- **Tool / version:** `loggingctl` on the Vega Virtual Device, Vega SDK 0.24.12112, release build (`npm run build:release`) of the TV app.
- **Task attempted:** read the app's own `console.log` lines while debugging the race freeze (#1) and audio (#5, #9).
- **Steps taken:** `loggingctl log -v <package>`.
- **Expected:** the app's JS console output next to the native logs.
- **Actual:** native logs and fatal JS errors (`[KeplerScript-JavaScript]` with a stack) only. No `console.log` output from the release build. We only ran release builds, so we don't know whether a debug build shows it.
- **Severity:** Low. JS-side state was invisible in the logs.
- **Workaround:** an in-app performance overlay (Menu key in the race) showing loop rate, JS time per frame, input latency and audio state, captured with screenshots (#10).
- **Suggestion:** document whether release builds drop `console` output and how to keep it (for example a build flag), or route it to `loggingctl` in release builds too.

## 16. KPI Visualizer fails validation when the app makes no network calls at launch (`-1 != -1`)

- **Tool / version:** `vega exec perf kpi-visualizer` (Perf CLI 0.24.0), Vega SDK 0.24.12112, headless VVD (firmware `vvrp-tv-arm64-user OS 1.2`).
- **Task attempted:** measure cool-start latency (time to first frame and time to fully drawn).
- **Steps taken:** called `useReportFullyDrawn` on Home's first frame, then ran `vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main --kpi cool-start-latency --iterations 3`.
- **Expected:** the latency report and a pass against the targets (TTFF under 1.5 s, TTFD under 8 s).
- **Actual:** the report prints TTFF mean 408.1 ms (min 191.5, max 553.0), TTFD mean 408.5 ms and JS bundle load 17.6 ms. "Network calls time" has n = 0 and null values, because the app makes no network calls at launch. The run then ends with "FAILED TARGETS -- [-1 != Network calls time P100] [-1 != -1]" and "VALUE VALIDATION FAILED".
- **Severity:** Low. The numbers are in the report, but the run reads as a failure, and `-1 != -1` doesn't explain why.
- **Workaround:** read the latency rows and ignore the network-calls validation.
- **Suggestion:** treat a KPI with no samples as "not applicable" instead of a failed target, and make the message say which value is missing.

## 17. The Vega skills depend on the ADBT MCP server and add little without it

- **Tool / version:** Amazon Devices Builder Tools Vega skills (`amazon-devices-vega-media-player` 1.0.0 and `amazon-devices-vega-app-performance`), ADBT MCP 1.0.17.
- **Task attempted:** use the media-player and performance skills in the agent session that built the TV app.
- **Steps taken:** loaded the skills. Their Workflow sections are calls to the MCP server's `read_document`, `list_documents` and `search_documentation` tools.
- **Expected:** the skills give the setup facts needed, or say clearly that the server is missing and how to fix it.
- **Actual:** the MCP server was not connected in that session (the skill install does not set it up, see #12), so the workflow steps couldn't run. The skill body has general rules (for example, that missing `[wants]` services cause silent playback failures) but not the list of services needed for audio (#9). The performance skill's router also needs the server, so the race freeze was debugged from ACR core dumps instead (#1).
- **Severity:** Low. The docs are on the website, but the skills add little without the server.
- **Workaround:** read the docs on developer.amazon.com and the package typings in `node_modules`.
- **Suggestion:** put the key facts (such as the `[wants]` services for audio-only playback) in the skill body, so a skill is useful without the server. Have each skill check for the server and say how to connect it.

## 18. The VVD clock ran about 2 h 11 min behind the Mac

- **Tool / version:** Vega Virtual Device, headless, Vega SDK 0.24.12112, macOS 27.0.1.
- **Task attempted:** measure phone-to-TV input latency. Phones stamp each input with `at: Date.now()`, and the TV compares it with its own receive time.
- **Steps taken:** ran simulated phones (`tv/scripts/fake-phones.mjs`) and the server on the Mac, and logged `recv - at` in the TV app on the VVD.
- **Expected:** the VVD clock matches the host's within a few milliseconds, so `recv - at` is the delivery time.
- **Actual:** raw `recv - at` was -7,869,824 ms: the VVD clock was about 2 h 11 min behind the Mac. That is not a whole number of hours, so it isn't a time-zone setting. We did not check whether the offset drifts.
- **Severity:** Low. It blocks one measurement, and the cause is easy to miss.
- **Workaround:** report what cancels the offset: delivery jitter above the best observed delivery (+1 ms median) and the TV-side receive-to-applied time (7 ms median).
- **Suggestion:** sync the VVD clock to the host at boot, and show the clock offset in `vega virtual-device status`.

## 19. `adjustsFontSizeToFit` does nothing on Vega

- **Tool / version:** React Native for Vega 4.0.1+rn0.83.0 (`Text`), on the Vega Virtual Device.
- **Task attempted:** fit long creature names such as "Little Marshmallow" on the Reveal card and the Hall of Fame cards.
- **Steps taken:** `<Text numberOfLines={1} adjustsFontSizeToFit>` with a fixed width.
- **Expected:** the font shrinks until the name fits, as on iOS.
- **Actual:** no effect. Long names were cut off with "...".
- **Severity:** Low. Easy to work around once you notice.
- **Workaround:** `fitFont(text, width, max)` in `tv/src/components/Bits.tsx` picks the size from the text length (Baloo 2 bold is about 0.54 em per character).
- **Suggestion:** implement `adjustsFontSizeToFit`, or list it as unsupported in the Vega docs.

## 20. qrcode-svg needs a `TextEncoder` polyfill in the app

- **Tool / version:** `@amazon-devices/react-native-qrcode-svg` 3.0.0+6.3.15 with `@amazon-devices/react-native-svg` 3.0.x, React Native for Vega 4.0.1+rn0.83.0; Vega API docs page for `react-native-qrcode-svg` (0.24).
- **Task attempted:** show the join QR code on the Lobby screen.
- **Steps taken:** added both packages and rendered `<QRCode value={joinUrl} />`.
- **Expected:** it renders with no extra setup. The package README says it "works seamlessly" with React Native 0.75 and above; its metro transform (`textEncodingTransformation.js`) is only for older versions.
- **Actual:** the Vega page's Known issues section says "Your app might crash" when the library imports `TextEncoder`, and the app has to add `fast-text-encoding` itself. The package already depends on `text-encoding`, but that doesn't cover it. The app has imported the polyfill since the Lobby screen's first commit, as the known-issues section says, so we have no crash message of our own.
- **Severity:** Low. A one-line fix, and it is documented.
- **Workaround:** add `fast-text-encoding` and import it before the QR component (`import 'fast-text-encoding'` at the top of `tv/src/screens/Lobby.tsx`).
- **Suggestion:** provide `TextEncoder` in the Vega JS runtime, or make the Vega build of the package import its own polyfill so it works with no app-side setup.

## 21. Custom fonts on RN 0.83: `expo-font` lists only RN 0.72, and `fontFamily` must be the file name

- **Tool / version:** Vega API docs page for `@amazon-devices/expo-font` (0.24), React Native for Vega 4.0.1+rn0.83.0.
- **Task attempted:** use bundled Baloo 2 fonts (OFL) on the TV.
- **Steps taken:** checked the `expo-font` page: its Supported versions table lists only React Native 0.72 (Vega SDK 0.23 and earlier). Put the `.ttf` files in `tv/assets/fonts/` without `expo-font` and set `fontFamily`.
- **Expected:** a documented way to use custom fonts on RN 0.83, with `fontFamily` set to the font's family name.
- **Actual:** no documented route for RN 0.83. Plain `assets/fonts/` works, but only when `fontFamily` is the file name (for example `Baloo2-ExtraBold`); the family name did not work.
- **Severity:** Low. A quick fix once you know it.
- **Workaround:** `fontFamily: '<file name without extension>'`.
- **Suggestion:** document custom fonts for RN 0.83 (folder, naming rule, `fontFamily` value), or list `expo-font` for 0.83.

## 22. Installer: no telemetry opt-out at install, scripted mode undocumented

- **Tool / version:** Vega SDK installer (SDK 0.24.12112, CLI 1.4.5), macOS 27.0.1.
- **Task attempted:** a scripted install (for an agent or CI) with telemetry off.
- **Steps taken:** read the install script to find its options, then ran it with `NONINTERACTIVE=true`.
- **Expected:** documented install options, including one to turn telemetry off.
- **Actual:** the install page only shows the interactive `curl | bash`. The script supports `NONINTERACTIVE`, `SKIP_SDK_INSTALL` and `VEGA_SDK_VERSION`, but you only learn that by reading it. Even with `NONINTERACTIVE=true` it writes `~/vega/telemetry/config.json` with `"optIn": true`, and the docs only describe editing that file after install.
- **Severity:** Low.
- **Workaround:** `jq '.optIn=false'` on `~/vega/telemetry/config.json` after install.
- **Suggestion:** document the installer variables on the install page. Add an installer flag or variable (for example `VEGA_TELEMETRY=0`) and a `vega telemetry off` command.

---

## 23. The headless VVD renders in software and keeps ~7 host cores busy while an app animates

- **Tool and version:** Vega Virtual Device (SDK 0.24.12112), headless (`--no-gui`), Apple-silicon Mac with 16 GB, macOS 27.
- **Task:** soak-test and film the app on the headless VVD.
- **Steps:** ran Sketchlings on Home, Results, Hall of Fame and in races; sampled `ps -o pcpu` of the `vega-virtual-device` process (21 Oct); read the instance's `hardware-qemu.ini`.
- **Expected vs actual:** expected a mostly idle TV UI to cost little host CPU. Actual: `hw.gpu.mode = swangle_indirect` (ANGLE on SwiftShader, i.e. GPU work on the host CPU). With the app in the foreground the VVD uses 590-760 % CPU on Home, Results and Hall of Fame (focus wobble, blinking googly eyes) and in a race, 150-320 % on the mostly still How to play screen, and 15-20 % with the app terminated. On a Mac also running other apps (load 14-20, 11-14 GB of swap in use) this is the host starvation behind #3 and the starved watchdog thread in #1, and every timing measured on the VVD is pessimistic.
- **Severity:** Medium-high.
- **Workaround:** quit other apps before soaks and filming; keep heavy animation off screens that sit idle.
- **Suggestion:** document the VVD's GPU mode and its CPU cost, and offer a working host-GPU (Metal) mode for the headless VVD on Apple silicon, or a frame-rate cap for the headless renderer.

## 24. KPI Visualizer can't measure warm start, memory or UI fluidity on the VVD; ADBT can't find the Perf CLI

- **Tool / version:** `vega exec perf kpi-visualizer` (Perf CLI 0.24.0), Vega SDK 0.24.12112, Vega Virtual Device (headless); Amazon Devices Builder Tools MCP (`@amazon-devices/amazon-devices-buildertools-mcp@latest` through `npx`, 21 Oct), `analyze_perfetto_traces` tool, Claude Code CLI.
- **Task attempted:** measure every Vega KPI with a target (cool and warm start, foreground memory, UI fluidity, focus response) on the only device we had, and analyse the cool-start traces.
- **Steps taken:** on 21 Oct ran `vega exec perf kpi-visualizer --app-name com.starfungames.sketchlings.main` with `--kpi cool-start-latency --iterations 10`, then `--kpi warm-start-latency`, `--kpi memory`, `--kpi foreground-memory` and `--kpi ui-fluidity`, with no `--test-scenario`. Called ADBT `analyze_perfetto_traces` on the cool-start traces (`iter_*_vs_trace`).
- **Expected:** each KPI runs on the VVD, or the tool says up front which KPIs need hardware or extra software and how to get it.
- **Actual:**
  - Cool start worked: 10 of 10 runs, 665 ms to first frame and to fully drawn.
  - Warm start: 0 of 5 iterations. Its prep step backgrounds the app with `vmsgr send pkg://com.amazon.smplighthouse.launcher.main`, the Fire TV launcher. The VVD's launcher is `com.amazon.keplerlauncherapp.main`, so every prep fails ("CLI Send Error ... Failed to send message, remote error", 5 retries per iteration).
  - `--kpi memory`, `--kpi foreground-memory` and `--kpi ui-fluidity` stop with "Appium server is not found in the platform", even with no custom scenario. The SDK install has no Appium, and `kpi-visualizer --help` doesn't mention it. Focus response needs an Appium-driven scenario too.
  - `analyze_perfetto_traces` failed: "Unable to locate trace processor binary ... Vega Performance CLI path is not available", although `vega exec perf` worked in the same shell. The MCP server doesn't see the SDK.
- **Severity:** Medium. Four of the six KPIs with a Vega target could not run in the KPI Visualizer on the VVD, and nothing says why before the run.
- **Workaround:** app memory from `vega exec perf activity-monitor` (its "Memory Application" column, about 2 samples a second, no Appium): 124-284 MiB. Race loop rate and input latency from the app's own overlay. Warm start, UI fluidity and focus response stay unmeasured until Fire TV hardware or an Appium setup; the traces were not analysed.
- **Suggestion:** read the launcher from the device (or take a `--launcher` flag), and fail at once with a clear message instead of retrying. Measure memory without Appium, as `activity-monitor` already does. If Appium is required, bundle it or list it as a prerequisite with an install step. Have `analyze_perfetto_traces` find the Perf CLI from the Vega SDK install (or accept its path).

## What worked well

- One-line installer: the SDK and the VVD in about 10 minutes (5.4 GB).
- The helloWorld template built on Node 26 the first time (`npm install` about 1 minute, `npm run build:release` about 1 minute).
- `vega run-app` installs and launches in seconds.
- The headless VVD boots in about 10 s, and because it is an Android emulator underneath, `adb` tools work on it, including full-HD recording.
- The app reaches the host at `10.0.2.2` over HTTP and WebSocket with no setup. `vega device start-port-forwarding` is there too.
- D-pad focus needed only stock components (`TVFocusGuideView`, `hasTVPreferredFocus`). Declaring Alexa on-screen voice targets takes one `aria-label` per button plus the `com.amazon.category.kva` category (we could not test voice on the VVD).
- `useReportFullyDrawn` plus the KPI Visualizer measured cool start in one command: TTFF 408 ms mean on the VVD, against a 1.5 s target.
- w3cmedia accepts fragmented-MP4 AAC through standard Media Source Extensions calls.
- **Every ACR carries a full core dump with every thread's stack.** `vega device copy-logs -a SYSTEM_TOMBSTONE/acr` pulled them, and that data is what made the deadlock in #1 findable from an app developer's desk.
- ADBT: one command installed the steering doc, the MCP config and 18 Vega skills into Claude Code.

---

## Appendix: snags with tools outside the Amazon ecosystem

- **Bun 1.4.3.** It aborts with "panic: A C++ exception occurred" when a process that loaded onnxruntime exits, so the Kokoro voice model runs in a child process that kills itself when the server goes away. It loads `.env` only from the current folder, and shell variables win over `.env`. In `bun-types`, `ws.send()` returns a number, so a one-line arrow `websocket.message` handler fails the typecheck.
- **kokoro-js 1.2.1 / onnxruntime-node.** `bun install` reports two blocked postinstalls (onnxruntime-node, protobufjs); they can stay blocked. On an M5 MacBook, fp32 was faster than q8 (3.7 s vs 4.9 s for the same line).
- **Anthropic SDK and API.** The SDK reads `ANTHROPIC_BASE_URL` and `ANTHROPIC_AUTH_TOKEN` from the environment by default; developer tooling on this Mac had set a local proxy, so the client sets `baseURL` and `authToken: null` explicitly. Structured outputs ignore `minimum`, `maximum` and `maxLength`, so stats are an integer enum and lengths are clamped on the server. An API key that isn't scoped to a workspace needs an `anthropic-workspace-id` header (`ANTHROPIC_WORKSPACE_ID` in `server/.env`), or the API answers 400.
- **adb.** The Homebrew adb 37.0.1 we installed for #10 and #13 and the Unity Editor's adb 36.0.0 kill each other's server on every switch ("daemon not running; starting now", "device offline"), which dropped key presses mid-test. Workaround: point `remote.sh` at Unity's adb (`ADB=...`) while Unity is open.
