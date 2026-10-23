# How Sketchlings came to be

Dated notes and files from the week.

| When (IST) | What happened | Evidence |
|---|---|---|
| Mon 19 Oct | Read the rules, mapped the tracks, wrote a first concept: **MoveNight**, a family movement game with a phone as the TV camera. | `2026-10-19-movenight-spec.md` |
| Tue 20 Oct, morning | Installed the Vega SDK 0.24 on macOS 27. The Vega Virtual Device window crashed on boot, so we run it headless (`--no-gui`) and capture the screen with `adb emu screenrecord`. Hello World ran first try. | `2026-10-20-vega-hello-world-on-vvd.png`, `../../FRICTION_LOG.md` #2, #10 |
| Tue 20 Oct, morning | Network probe: can a Vega app talk to a server on the Mac? Yes — HTTP and WebSocket work via `10.0.2.2`, the Mac's LAN IP, and `vega device start-port-forwarding`. | `2026-10-20-vega-network-probe/` |
| Tue 20 Oct, midday | Looked through the 186 public Fire TV entries we found on GitHub. Movement/fitness was crowded (several phone-as-camera coaches, one near-clone of MoveNight). Nobody turned a child's drawing into a playable character. **Pivoted to Sketchlings.** | `../../SPEC.md` |
| Tue 20 Oct, evening | First full-HD recording straight from the headless Vega Virtual Device — the path the demo video uses. | `2026-10-20-first-recording-from-headless-vvd.png` |
| Tue 20 - Fri 23 Oct | Built Sketchlings: server, phone app, the open-source `doodle-cutout` library, creature voices, and the React Native for Vega TV app. | git history |
| Wed 21 Oct | Root-caused the race-start freeze: a deadlock inside Vega's JS-thread watchdog, read from the crash reports' core dumps. Fixed the app's side; 42 race starts, 0 freezes that day (later totals: FRICTION_LOG #1). | `../../tv/scripts/acr-stacks.py`, `../../FRICTION_LOG.md` #1 |
