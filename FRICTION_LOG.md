# Friction log — Vega SDK on macOS 27 (Apple silicon)

Setup: MacBook (Apple silicon, 16 GB), macOS 27.0.1, Node 26.12, Vega SDK 0.24.12112, Vega CLI 1.4.5.

## 1. Vega Virtual Device window crashes on boot (macOS 27)
- **Task:** start the VVD to run the helloWorld template.
- **Steps:** `vega virtual-device start --timeout 240`
- **Expected:** VVD window opens, prints "Virtual device ready."
- **Actual:** "Deadline reached (240s) but virtual device unresponsive." `status` reports `{"running":false}`. `virtual_device.err` ends with crashpad `UniversalExceptionRaise: (os/kern) failure (5)` after many `sPrepareTexImage2D ... failed validation` lines and "running without ARB/KHR robustness in place may crash". The bundled emulator is 34.1.15 and warns it doesn't support features like `Vulkan`, `HVF`, `TvRemote`, `ScreenRecording`.
- **Severity:** High (you can't see your app).
- **Workaround:** `vega virtual-device start --no-gui --timeout 300` boots fine headless; view the screen with `adb -s emulator-5554 emu screenrecord screenshot <dir>` (adb from any Android SDK).
- **Suggestion:** surface the emulator crash instead of a generic timeout; offer a software-GPU fallback (`--no-gl-accel` is Linux-only today) or update the bundled emulator; publish a macOS version support matrix.

## 2. No documented way to screenshot or record the VVD
- **Task:** capture screenshots and video for the hackathon demo.
- **Expected:** a `vega` command for screenshots/recording.
- **Actual:** docs only mention "Dump Render Tree" / "Dump Rendered Text" in the window's context menu (which is unavailable headless).
- **Severity:** Medium.
- **Workaround:** the VVD is an Android emulator underneath, so `adb emu screenrecord screenshot|start|stop` works.
- **Suggestion:** add `vega device screenshot` / `vega device record`, or document the adb route.

## 3. Telemetry can't be turned off at install time
- **Task:** install the SDK with telemetry off.
- **Actual:** the installer (even with `NONINTERACTIVE=true`) writes `~/vega/telemetry/config.json` with `"optIn": true`; docs only describe editing it after install.
- **Severity:** Low.
- **Workaround:** `jq '.optIn=false'` on the file after install.
- **Suggestion:** an installer flag / env var (`VEGA_TELEMETRY=0`) and a `vega telemetry off` command.

## 4. `NONINTERACTIVE=true` installer mode is undocumented
- **Task:** scripted install (agent / CI).
- **Actual:** the install page only shows the interactive `curl | bash`; the script supports `NONINTERACTIVE`, `SKIP_SDK_INSTALL`, `VEGA_SDK_VERSION`, but you only learn that by reading it.
- **Severity:** Low. **Suggestion:** document these variables on the install page.

## What worked well
- One-line installer; SDK + VVD in ~10 min (5.4 GB). helloWorld template builds on Node 26 first try (`npm run build:release`, ~1 min after a 1-min `npm install`).
- `vega run-app` installs and launches in seconds; `vega device start-port-forwarding` exists for reaching a host server.
