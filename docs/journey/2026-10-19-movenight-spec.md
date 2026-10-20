# MoveNight — spec (working title)

Amazon "Build, Ship, Shape" hackathon entry. Track: **Fire TV** (Vega OS). Mini challenge: **Open Source**.
Deadline: Fri 23 Oct 12:00 PT = **Sat 24 Oct 00:30 IST**. Our target: submitted by **Fri 23 Oct 18:00 IST**.

## Pitch
Turn TV time into active family time. Prop any phone or laptop under the Fire TV, scan the QR code, and it becomes the TV's camera.
The whole family plays movement mini-games on the big screen. An AI coach measures everyone in a warm-up and scales each player's
targets, so a 7-year-old, a parent and grandma can race fairly. Seated mode for anyone who can't stand.

## Why it should win (judging criteria, equal weight)
- **Quality of idea:** the judges' own "creative" Fire TV example is a computer-vision fitness app using the TV camera. Most Fire TVs have no
  camera; we use the phone everyone already owns. Hits 4 priority categories: fitness, family entertainment, computer vision, multi-modal UX.
- **Tech implementation:** native Vega OS app (React Native for Vega, VVD), D-pad focus done right, real-time pose pipeline, Claude coach.
- **Design:** remote for menus, bodies for play, phone only as a camera. No accounts, one QR scan to start.
- **Potential impact:** StarFun Games ships it on the Fire TV Appstore after the hackathon. Inclusive by design (handicap scaling, seated mode).
- **Bonus (up to 10%):** friction log kept from day one in `FRICTION_LOG.md`.

## Pieces
| Piece | Stack | Job |
|---|---|---|
| `apps/tv` | React Native for Vega (RN 0.83 template), react-native-qrcode-svg, reanimated | TV screens, game rendering, D-pad UI |
| `apps/camera` | Vite + TypeScript + MediaPipe Pose Landmarker (in-browser, up to 4 people) | Turns camera frames into compact move events |
| `server` | Node + `ws` | Rooms by code, relays events, holds the Claude key, serves the camera page |
| `packages/couchlink` | TS, no deps besides a WebSocket | **Open-source piece:** TV-to-phone pairing (room code + QR + reconnect) for Vega, RN, web. Own MIT repo, with tests |

Players are identified left-to-right in the camera frame (lane 1..4), so one camera covers the family. A second phone can add a camera if needed.

## Game flow
1. **Home** (D-pad): Play, How it works, Settings (seated mode, sound).
2. **Pair:** QR + 4-letter room code. Camera page shows the live skeleton and "Player 1, 2…" tags.
3. **Warm-up (calibration):** 5 squats (or seated arm raises) + reach test. Coach sets per-player targets.
4. **Rocket Race:** squats or jumping jacks fuel each player's rocket. Targets scaled per player, so everyone can win.
5. **Mirror Me:** a pose silhouette appears; score = joint-angle similarity, hold for 2 s.
6. **Results:** podium, coach recap (Claude), "play again".

## Coach (Claude via the server)
- Session plan (which games, rounds, targets) from warm-up numbers; short hype lines between rounds; end-of-night recap.
- Model: latest Claude. Key in `server/.env` only. No key → deterministic offline coach (same targets, canned lines).

## Event protocol (camera → server → TV)
`{t:"hello", role:"tv"|"camera", room}` · `{t:"players", lanes:[1,2]}` · `{t:"rep", lane, move:"squat"|"jack"|"raise"}`
· `{t:"pose", lane, angles:{...}}` (5 Hz max) · TV → camera: `{t:"mode", game, seated}`

## Open questions to settle by testing
- Can an app in the Vega Virtual Device reach the host Mac's server (localhost / host IP)? If not, use the Mac's LAN IP.
- Phone camera needs HTTPS off-localhost: use the laptop camera on localhost for the demo; document a tunnel for phones.

## Timeline (IST)
- **Mon 19:** setup (Vega SDK, VVD), skeleton of all 4 pieces talking end to end.
- **Tue 20:** warm-up + Rocket Race playable on the VVD.
- **Wed 21:** Mirror Me, coach, polish, sound; couchlink repo + tests.
- **Thu 22:** README, friction log, product feedback; shot list; Harindu films ~1 min of movement.
- **Fri 23:** edit video, upload, submit by 18:00.

## Harindu's part (~1 hour total)
Approve installs · film ~1 min of squats/poses in front of the laptop camera · upload video to YouTube · submit on Devpost.
