// Where the Sketchlings party server runs.
// - Vega Virtual Device: 10.0.2.2 is the Mac running the emulator (default).
// - Real Fire TV: set HOST to the Mac's LAN IP, e.g. '192.168.1.3:8787' (same Wi-Fi as the TV and phones),
//   then rebuild. Phones get their join URL from the server, so only the TV needs this.
export const HOST = '10.0.2.2:8787';
export const HTTP_BASE = `http://${HOST}`;
export const WS_URL = `ws://${HOST}/ws`;

// Creature voices + narrator (src/audio.ts). The Vega Virtual Device has no audio service, so it is always silent
// there; set false to mute on a real Fire TV during automated runs.
export const SOUND = true;
