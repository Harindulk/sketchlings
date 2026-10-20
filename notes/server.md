# Server notes

## Protocol notes

None blocking. The server implements `shared/protocol.ts` as written. One optional request:

1. ~~`Sketchling.artist?: string`~~ Done (protocol update 2026-10-20): the server fills it from the uploader's name.

Behaviour other apps should know (all within the protocol):

- `POST .../sketch` answers `202 {id}` (id = the future `sketchling.id`). 409 if that player already has a scan
  in flight, 404/413/415 for bad room/player/size/type. The `scan processing` frame may arrive before the 202.
- After `joined`, a phone also gets the TV's last `phase` frame (with its `data`) if the TV has sent one, so a phone
  that reconnects mid-race can restore its UI.
- A phone hello with an unknown `playerId` (e.g. after a server restart) joins as a **new** player: always store the
  `playerId` from `joined`. A known `playerId` keeps name, colour and sketchling (the name in the hello is ignored).
- A TV hello with `room` reattaches; if the room no longer exists the server recreates it under the same code, so the
  QR on screen stays valid. The newest TV socket wins; frames from a replaced TV socket get `bad_message`.
- Protocol update 2026-10-20 implemented: `HelloPhone.ageGroup` (omitted = `'big'`, an unknown value = `bad_message`;
  kept on reconnect like the name) is stored on `Player` and shows up in every `players` frame; input `kind: 'shout'`
  is relayed like the others; `Sketchling.artist` = uploader's first name; `Sketchling.eyes` from Claude (validated:
  up to 4, x/y in 0..1, r in 0.01..0.25, pixel-looking values dropped, `[]` trusted) or from the offline finder.
- Offline eyes (`src/eyes.ts`): dark (luma < 90) 8-connected blobs that are round (aspect <= 2), filled (>= 50% of
  bbox), 1.2-15% of the body size, in the upper 55% of the body, and surrounded by >= 90% opaque, <= 15% other-dark
  pixels. Only a matching PAIR is returned (similar size, side by side); 0, 1 or > 4 candidates give `[]`.
  r = 1.5x the dot radius so the googly eye covers the drawn pupil. Hollow-ring eyes and dots on a dark body are
  missed on purpose (the TV then uses its default pair).
- `scan` frames go to the TV and the owning phone only; other phones learn about the sketchling via `players`.
- Static: `/j/:room` and `/` serve `phone/dist/index.html`; `/assets/*` (and `/j/assets/*`, in case Vite uses a
  relative base) serve from `phone/dist`.
- Sprite URLs are server-relative (`/sprites/<uuid>.png`); the TV must prefix its server base
  (`http://10.0.2.2:8787` on the VVD).

## Model choice

Default `claude-opus-5-5` (override with `SKETCHLINGS_MODEL`). It is the current default Claude model and the
strongest at image understanding, and reading a 6-year-old's scribble well is the whole feature. To keep it fast:
`output_config.effort: "low"` (thinking can't be turned off on Opus 5.5; effort is the control), a short JSON-only
answer, structured outputs (`output_config.format` json_schema), 12 s client timeout, `maxRetries: 0`.
Cost is roughly a cent per scan (about 1.5k image+prompt tokens in, a few hundred out at $4/$20 per MTok).
Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is on for Opus 5/5.5,
Sonnet 5.5 and Fable 5.1, as Anthropic's Claude API reference recommends; a refusal or anything else still ends in the offline persona.

**Not measured against the real API** (no key here). Each scan logs `[persona] <model> answered in N ms`. If real scans
take more than about 6-8 s, set `SKETCHLINGS_MODEL=claude-sonnet-5-5` (or `claude-haiku-5-5`, fastest).
The first request after a schema change pays a one-time schema compile (cached 24 h): do one test scan before a demo.

## Dev notes

- Layout: `src/png.ts` (IHDR + 8-bit RGB/RGBA non-interlaced decode with node:zlib, all five filters),
  `src/persona.ts` (features, offline generator, clamping, Claude call), `src/rooms.ts` (rooms, frame validation, relay),
  `src/server.ts` (HTTP + WS wiring, hall of fame), `src/index.ts` (env + start).
- Tests: 36 tests over real HTTP + WS on port 0 with temp data dirs and `claude: null`, so `bun test` never calls the
  API even when `server/.env` has a key. The Claude request shape (headers, `?beta=true`, body, no `Authorization`
  header, explicit base URL) and the 12 s timeout were checked once against a local mock API.
- Room codes use `BCDFGHJKMNPRSTVWXZ`: no vowels so codes never spell words, no I/L/O/Q.
- Rooms with nobody connected for 6 h are purged when a new room is created (no timers).
- `hall.json` is written to a temp file then renamed. An unreadable file is moved aside to `hall.json.bad-<ts>`,
  not overwritten.
- Offline stats lean on ink coverage (sparse outline = fast, heavily coloured = powerful), aspect ratio (tall = jumpy)
  and move style, then get balanced to a 7-11 total.

## Bun / SDK friction

- The shell has `ANTHROPIC_BASE_URL` set by developer tooling (a local proxy). The SDK reads it by default, so the
  client is built with an explicit `baseURL` (`SKETCHLINGS_ANTHROPIC_BASE_URL` or `https://api.anthropic.com`) and
  `authToken: null` so a stray `ANTHROPIC_AUTH_TOKEN` can't be sent either.
- Bun only loads `.env` from the **current directory**, and shell variables win over `.env`. Start from `server/`
  (the package scripts do).
- `bun-types`: `websocket.message` must return `void`; `ws.send()` returns a number, so a one-line arrow that returns
  it fails the typecheck. The socket data type is declared with `websocket: {data: {} as WsData}`.
- `bun add -d typescript` installs TypeScript 7; `tsc --noEmit` works with `module: Preserve` +
  `moduleResolution: bundler`.
- Structured outputs ignore `minimum`/`maximum`/`maxLength`, so stats use an integer `enum` and lengths are clamped
  server-side.
- 2026-10-20: port 8787 was held by an earlier network-probe echo server (`bun server.ts` in a temp folder
  `nettest/` folder, an echo server). The Sketchlings server fails loudly with EADDRINUSE in that case; stop the probe
  first. `PORT=8788 bun run start` was used for the smoke test (health, placeholder page, TV hello, ping, bad frame: all OK).
