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
phone wakes (`visibilitychange`), pings every 10 s, and shows a "Reconnecting..." pill (details under Real-phone readiness). Errors: `no_room` → "We can't find
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
- Kid-proofing: Clear in the drawing pad has no "are you sure?", but Undo brings the drawing back.
- Old browsers without `color-mix()` (Safari < 16.2, Chrome < 111) lose a few decorative tints; everything else works.

## Real-phone readiness (2026-10-21)

Review of the phone app for the first on-camera session with real phones. Only `phone/src` was changed. I checked
everything in the built-in browser (Chrome engine) at 360-390 px portrait and 780/844×340 landscape. Tests ran against
the built app on the mock, and against a throwaway real server (`PORT=8791`, offline personas, nothing uploaded)
driven by a fake TV script.

**Fixed**
- **Screen stays on.** The page takes a Wake Lock on join and on rejoin. It asks again whenever the page comes back
  (camera, lock) and on the next tap. This only works on HTTPS (the tunnel) and localhost: the plain-HTTP LAN page
  has no such API, so set the phone itself (checklist below).
- **Dead sockets.** The page pings every 10 s. If nothing arrives for 22 s while the page is visible, it reconnects
  and the pill shows. Measured: with the mock frozen (`kill -STOP`) the pill appeared after 27 s; after `kill -CONT`
  the page was back in under 1 s and JUMP reached the server. A socket stuck connecting for 8 s is retried. On every
  return to the page it sends hello again and reconnects if there is no answer within 3 s. That hello also takes the
  player back from a second tab opened by rescanning the QR. Checked on the real server: the stale tab picked up the
  race and its JUMP reached the TV.
- **Players not in the race.** A player missing from `racers` gets "Look at the TV! Cheer them on!" instead of a dead
  TAP pad.
- **Race layout.**
  - ROAR used to run 8 px off a 360 px screen. It now ends 27 px from the edge, clear of Android's back-swipe zone.
  - A 48 px empty strip keeps JUMP and ROAR away from Safari's bottom bar.
  - In landscape, JUMP and ROAR sit beside the pad. Before, they were cut off.
  - On every screen: no long-press image menu, no text selection, no pull-to-refresh. One Back press stays on the page.
- **Scan screen.**
  - New tips: "Get the whole sheet in the photo", "Plain white paper, no lines" and "Leave white space around it".
    The illustration is now plain paper, not ruled.
  - The Snap button is on the first screen at 390×664. At 375×553 it is partly visible.
  - "Keep <name>" undoes "Draw a new one".
  - "Pick a photo you took" uses a file input without `capture`.
  - If the page reloaded during the camera hand-off, a note explains what happened.
- **Preview.** "Wrong way up? Turn it" turns the cut-out a quarter turn. The turned PNG is what gets uploaded.
- **Join.**
  - The labels now say "Player's first name" and "How old is the player?".
  - A previous user's name and age are no longer pre-filled.
  - "Not <name>? Switch player" is on the lobby and on the card during the draw phase. It asks for confirmation, and
    the old player stays in the room.
- **Server restart.** A joined phone keeps retrying `no_room` for 30 s while the TV recreates the room. It then takes
  its new player id and drops the old champion. The code box is pre-filled.
- **Mic.** Shouting stays on from one race to the next. The AudioContext is resumed, or the button says "Tap to wake
  the mic". A denied permission now shows "Mic blocked".
- **EXIF and size.** A JPEG stored sideways with Orientation=6 comes out upright. Decode + cutout on this Mac takes
  1.6 s for a 4000×3000 JPEG and 0.6 s for a 900×1200 one. Expect 3-6 s on a mid-range Android.

**Not fixed (outside `phone/`)**
- **Cutout** (`packages/doodle-cutout`, step 4):
  - A stroke that touches the photo edge, or a dark table at the paper edge, deletes the whole outline, so only the
    eyes are left.
  - Ruled or squared paper becomes the whole page.
  - Only the new tips and plain paper on a light table protect against this.
- **Server:**
  - A replaced socket is never closed. The phone now recovers on its own.
  - Ghost players still count toward the 6-player limit.
  - The tunnel preflight doesn't check `/health` or the WebSocket upgrade.

**Needs a real device to test.** None of this can be checked in the browser pane:
- whether the wake lock actually holds (the pane refuses it)
- the `capture` camera sheet, and EXIF from a real camera
- Android killing Chrome during the camera hand-off
- haptics and real mic levels
- Safari's bottom bar and back swipe, Android gesture navigation, landscape on a real phone
- speed on a phone

### Thursday morning: 2-minute check on each phone

1. **Settings.** iPhone: Auto-Lock to Never and Low Power Mode off. Android: Screen timeout to 10 min and Battery
   Saver off. Android: close all other apps.
2. **Join.** If anyone tested on this phone, clear the site data for the tunnel host or restart the tunnel. Then scan
   the TV's QR over the family Wi-Fi. The join screen should show an empty name and no age picked.
3. **Scan.** Use plain paper on a light table, with the whole sheet in the photo. The preview should show the whole
   drawing the right way up; tap "Turn it" once to check it works. Send it and wait for the card.
4. **Idle.** Leave the phone on the card for 2 min without touching it. The screen should stay on with no
   "Reconnecting...".
5. **Lock.** Lock and unlock the phone. "Reconnecting..." should last a few seconds at most, and the card should
   still be there.
6. **Race.**
   - TAP, swipe up, JUMP and ROAR all move the creature on the TV. The Android phone buzzes.
   - Swipe in from the right edge and press Back: the pad stays.
   - Turn the phone sideways: JUMP and ROAR are still on screen.
7. **Mic (tunnel only).** Tap "Enable shouting", allow the mic, then shout: the meter moves and the creature roars.
   On the next race the mic should still be on with no new prompt.
8. **Who plays where.** Decide which child plays on which phone before joining. Use "Switch player" only before
   drawing.
