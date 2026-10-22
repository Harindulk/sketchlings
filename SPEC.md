# Sketchlings — spec

Amazon "Build, Ship, Shape" hackathon, **Fire TV track (Vega OS)** + Open Source mini challenge.
Deadline Sat 24 Oct 00:30 IST. This is the planning spec, started 20 Oct.

## Pitch
Kids draw a creature on paper. A phone snaps it, and seconds later it walks onto the Fire TV with a name, a personality
and a voice, then races the rest of the family's drawings in a party game. Screen time that starts with crayons.

## What makes it different
- **Idea:** no visible rival turns a child's drawing into a character you play (186 public Fire TV entries checked on GitHub, 20 Oct; on 21-22 Oct we found Crayon Cinema and Doodle Theater, which make a drawing the star of a bedtime story on Fire OS where the remote picks what happens next — not a racer you control in real time). Movement/fitness,
  QR quiz and coach apps are crowded. Hits 4 priority categories: family entertainment, computer vision, AI, multi-modal UX
  (paper + phone camera/touch + remote D-pad + TV).
- **Tech:** native React Native for Vega app, smooth animation, solid D-pad focus, `aria-label`s plus the `kva` category for
  Alexa on-screen voice selection (declared; not testable on the VVD); computer vision cutout (our open-source library); Claude vision gives each drawing a persona.
- **Design:** one QR scan to join, no accounts, remote for menus, phone as camera + controller, big readable TV UI.
- **Impact:** StarFun Games ships it on the Fire TV Appstore; families, classrooms, kids' parties.
- **Video:** opens on a real child drawing and their creature walking onto the TV.

## Flow
1. **Home** (TV, D-pad): Start party · Hall of Fame · How to play.
2. **Lobby:** QR + 4-letter room code. Phones join with a first name and get a colour.
3. **Draw & scan:** "Draw your champion with a thick marker." Phone camera (file input `capture`, works on plain HTTP)
   → cutout on the phone (`doodle-cutout`) → preview → send. Fallback: draw with a finger on the phone.
4. **Reveal:** trading-card style intro on the TV: sprite pops out of paper, name, title, 3 stat bars, catchphrase.
5. **Doodle Dash** (main game): side-scrolling race. Phone: tap fast to run, swipe up to jump ink blots. Trailing
   players get a visible "Doodle Boost" so little kids can win.
6. **Results:** podium, AI host one-liners, Sketchlings saved to the household **Hall of Fame** (persists across nights).
7. Stretch: **Draw the Boss** — one player draws a boss; everyone else's Sketchlings team up to beat it.

## Architecture
| Dir | Stack | Job |
|---|---|---|
| `server/` | Bun + TypeScript, `@anthropic-ai/sdk` | Rooms + WebSocket relay, serves phone app + sprites, Claude persona (offline fallback) |
| `phone/` | Vite + TypeScript (no framework) | Join, capture, cutout, controller UI |
| `tv/` | React Native for Vega (RN 0.83, SDK 0.24) | All TV screens and games |
| `packages/doodle-cutout/` | TypeScript, zero deps, MIT | **Open-source piece:** photo of a paper drawing → clean transparent sprite (shadow flattening, ink mask, hole fill, largest blobs, sticker outline). Runs in browser and Node. Tests. |
| `shared/protocol.ts` | TS types | The contract between all three apps |

Ports: server `8787`. The VVD reaches the Mac at `10.0.2.2:8787`; phones reach it at the Mac's LAN IP.

## Rules for every piece
- Kid-safe: AI text is kind and playful, never mocks a drawing; no personal data beyond a first name and an age group. The room
  photo never leaves the phone. With a Claude key the cut-out drawing goes to Anthropic for the persona; with the HTTPS
  tunnel phone traffic passes through Cloudflare; in offline mode nothing leaves the home network.
- The Claude key lives only in `server/.env`. With no key the offline persona generator must still give a fun result.
- No copyrighted assets: our own art, CC0 audio, fonts with OFL licences. List them in `CREDITS.md`.
- Mute by default in automated tests.
