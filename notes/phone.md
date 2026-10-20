# Phone notes

## Protocol notes

1. **Pin down the `results` phase data** (TV → phones). The phone shows "You won!" / "You came 3rd!" from
   `{placements: {playerId: string; place: number}[]}` (it also accepts `{ranking: string[]}`, playerIds best first).
   With neither it shows "Look at the TV!". Please add something like
   `export type ResultsData = {placements: {playerId: string; place: number}[]}` to `protocol.ts` so the TV sends exactly that.
2. Nothing else is needed. The phone implements the current file as is: `HelloPhone.ageGroup` is always sent,
   `input` kinds are `tap | jump | shout` with `at: Date.now()`, and `Sketchling.artist`/`eyes` are read but optional.

## What the phone does

`/j/<ROOM>` → Join (first name + age group: Little kid ≤7 / Big kid 8-12 / Grown-up) → Lobby (your colour blob, your
`AGE_BOOST` badge such as "+40% boost!", the players) → follows the server's `phase` frames:

| Phase | Phone |
|---|---|
| `lobby` | waiting screen, "grab paper and a thick marker" |
| `draw` | instructions → **Snap my drawing** (`<input type=file accept=image/* capture=environment>`, so it works on plain HTTP) → "Cutting it out..." (doodle-cutout in a Web Worker) → preview on a checkerboard with a wiggle → **Bring it to life!** (PNG `POST /api/rooms/:room/players/:id/sketch`) → "It's coming alive..." → character card on `sketchling`. Fallback: **Draw on screen instead** (finger canvas, 7 crayons, undo/clear, same pipeline). The card has "Draw a new one". |
| `reveal` | your card + "Look at the TV!" |
| `race` | controller: giant multi-touch TAP pad (one `tap` per finger down, haptic tick on Android), swipe up on the pad or JUMP → `jump`, ROAR → `shout`. Keyboard: Space / ↑ / R. Mic shouting (getUserMedia + AnalyserNode RMS spike over a rolling baseline, 1.5 s cooldown) appears **only** when `window.isSecureContext` and the player taps "Enable shouting"; on plain-HTTP LAN pages it's hidden and ROAR stays. |
| `results` | medal + your Sketchling + confetti (top 3) from `placements`; else "Look at the TV!" |

Other behaviour: the playerId is stored per room in localStorage (inside try/catch), along with the name and age group.
A reload rejoins straight away and restores the screen (the server re-sends the last `phase`, and `players` carries
your sketchling). WebSocket reconnect uses exponential backoff with jitter (0.5 s → 8 s), reconnects immediately when the
phone wakes (`visibilitychange`), pings every 20 s, and shows a "Reconnecting..." pill. Errors: `no_room` → "We can't find
room X" with a code box; `room_full` → "This party is full!". Upload errors (404/413/other, network) → "the magic
fizzled" with Try again / Retake. If no `sketchling` arrives within 30 s, "Send it again" appears.

## Run it

```sh
cd phone && npm install
bun dev/mock-server.ts        # mock server + fake TV on :8787 (room ABCD); controls at http://localhost:8787/mock
npm run dev                   # Vite on :5173 (also on the LAN), proxies /ws /api /sprites to :8787
open http://localhost:5173/j/ABCD?debugImage=sample
```

- The mock auto-runs a game: lobby → draw 3 s after you join → reveal 3 s after your sketchling → race (20 s) →
  results with `placements`. Two bots (Mia, Dad) get sprites in draw. `MOCK_AUTO=0` disables it; drive phases from `/mock`
  or `curl -X POST localhost:8787/mock/phase/race`. `MOCK_DELAY` = fake persona time (2500 ms). `PORT` to move it.
- `npm run build` → `phone/dist` (base `/`, everything under `/assets/`). The mock serves dist too (`/j/ABCD`).
- Use the real server instead: `cd server && bun run start`, then `npm run dev` (or `SKETCHLINGS_SERVER=http://localhost:8790 npm run dev`).
- **Test hook:** `?debugImage=sample` makes "Snap my drawing" use the bundled sample photo (`src/samples/monster.jpg`);
  `?debugImage=/some/same-origin.png` loads that instead. Automated browsers can't open a camera.
- `npm run typecheck`; the mock typechecks with `npx tsc -p dev/tsconfig.json`.

## Verified (2026-10-20, built-in browser, 375×812 mobile)

- Mock (room ABCD) and **real server** (`server/`, `PORT=8790`, offline personas, a throwaway fake-TV script driving
  phases): join → lobby → draw → snap (sample photo) → cutout preview → upload → card ("Princess Biscuit, the Cloudy
  Potato", "Drawn by Leo") → race (the TV received tap ×3, shout, jump; swipe-up jump also checked on the mock) →
  results "You won!" with the winLine.
- Reload mid-game rejoins as the same player and restores the results screen. Killing the server shows "Reconnecting...".
- Finger drawing → filled sticker. Unknown room → no_room screen. A non-image → "Hmm, I can't see a drawing".
- Decode + cutout of the 900×675 sample in the pane: under 0.4 s on this Mac (720×720 finger drawing: 291 ms). Expect 2-4× on a mid-range phone.
- Screenshots: `phone/docs/screens/` (00-join, 01-lobby, 02-draw, 03-preview, 04-alive, 05-card-real-server, 06-race,
  07-results-win, 08-drawpad(+preview), 09-no-room, 10-no-drawing).

Bugs found and fixed during the walkthrough: the socket connected before Join (visibilitychange fired on an idle Link);
`[hidden]` was overridden by `display:flex`; the snap button inherited the handwriting font; the mic icon was unsized;
the results screen missed the sketchling when `players` arrived after `phase`; the swatches wrapped on 375 px.

## Notes for the server and TV

- **Server / eyes:** for the sample monster (two white googly eyes with dark pupils, clearly drawn) the server's offline
  `findEyes` returned `[]`. Probably fine by its "precision over recall" design, but worth a look since the TV's googly
  eyes are a highlight. The sprite comes with an 8 px white sticker outline (doodle-cutout `outline: 8`), in case that
  affects the eye finder.
- My real-server test scan added one Hall of Fame entry ("Princess Biscuit", drawn by Leo) to `server/data/` (git-ignored).
- Sprites are uploaded with an 8 px white sticker outline and soft alpha, at most 1024 px a side.

## Not done / open

- Not tried on a physical iPhone/Android: EXIF rotation, the `capture` camera sheet, haptics and real mic shouting
  are untested (they need a device; on plain-HTTP LAN the mic is hidden anyway).
- Kid-proofing: no "are you sure?" on Clear in the drawing pad.
- Old browsers without `color-mix()` (Safari < 16.2, Chrome < 111) lose a few decorative tints; everything else works.
