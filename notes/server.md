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
- A hello with a `playerId` that already has a live socket (a reconnect, or a second tab) closes the older socket with
  code 1000, reason `replaced`. Its close never marks the player disconnected.
- A disconnected player with no sketchling (and no scan in flight) is removed after 2 min (`ghostGraceMs`) and a
  `players` frame goes out, which frees the slot and colour. A player with a sketchling stays with `connected: false`.
  A reconnect within the 2 min keeps the slot; after that, the old `playerId` joins as a new player.
- A TV hello with `room` reattaches; if the room no longer exists the server recreates it under the same code, so the
  QR on screen stays valid. The newest TV socket wins; frames from a replaced TV socket get `bad_message`.
- Protocol update 2026-10-20 implemented: `HelloPhone.ageGroup` (omitted = `'big'`, an unknown value = `bad_message`;
  kept on reconnect like the name) is stored on `Player` and shows up in every `players` frame; input `kind: 'shout'`
  is relayed like the others; `Sketchling.artist` = uploader's first name; `Sketchling.eyes` from Claude (validated:
  up to 4, x/y in 0..1, r in 0.01..0.25, pixel-looking values dropped, `[]` trusted) or from the offline finder.
- Protocol update 2026-10-20 (abilities) implemented: `Sketchling.ability` with `kind === move`, a fixed label per
  kind (see the table in `server/README.md`; the TV can match on it), and `feature` from Claude (clamped to 4 words)
  or a generic offline one. The offline move is now deterministic from the silhouette (`shapeKind` in
  `src/ability.ts`) instead of a seeded random pick. Old `hall.json` entries are backfilled on load; non-object
  entries are dropped instead of making the whole file unreadable.
- Offline eyes (`src/eyes.ts`, reworked 2026-10-20 after the phone's sample monster got `[]`): pupils are dark
  (luma < 90) blobs clearly thicker than the typical pen stroke (chamfer distance transform; stroke width = 2x the
  median ink distance), so a pupil touching its eye's rim still counts; tiny enclosed paper specks (highlights) are
  filled first. A blob must be round, 1.2-15% of the body size, in the upper 60% of the body, with no transparency or
  outline-connected paper just around it, and almost no other ink around it (a pupil inside a drawn eye may lean on
  its rim). If the pupil sits in a small, round, enclosed white (a drawn googly eye), the eye is that white circle
  (r = its radius + half a stroke) so the TV's eye covers the drawing; otherwise r = 1.5x the dot radius. Only a
  matching PAIR is returned (similar pupil size, side by side); 0, 1 or > 4 candidates, or two dots inside one small
  shape (nostrils), give `[]`. Hollow-ring eyes, single eyes and dots on a dark body are missed on purpose.
  Measured on a labelled set (8 real sprites: the TV demo art with its hand-placed eyes, the phone sample monster,
  the crayon blob; 8 rescaled copies; 30 synthetic kid styles and traps): precision 1.00 -> 1.00, recall 9/28 -> 27/28
  (the miss is the cloud shrunk to 256 px). Random fuzz: 400 eye drawings recall 0.58 -> 0.99 with no wrong pairs;
  1000 eye-free scribbles 20 -> 7 false pairs (the rest are thick rings with a pinhole, which do read as eyes).
  About 20-60 ms for a 1024 px sprite.
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
Cost: measured about $0.016 a creature (below).
Server-side refusal fallback (`fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) is on for Opus 5/5.5,
Sonnet 5.5 and Fable 5.1, as Anthropic's Claude API reference recommends; a refusal or anything else still ends in the offline persona.

Each scan logs `[persona] <model> answered in N ms`. Measured since (below): median 4.7 s, so Opus stays. If real
scans take more than about 6-8 s, set `SKETCHLINGS_MODEL=claude-sonnet-5-5` (or `claude-haiku-5-5`, fastest; eye and
ability quality not checked). The first request after a schema change pays a one-time schema compile (cached 24 h): do
one test scan before a demo.

## Dev notes

- Layout: `src/png.ts` (IHDR + 8-bit RGB/RGBA non-interlaced decode with node:zlib, all five filters),
  `src/persona.ts` (features, offline generator, clamping, Claude call), `src/rooms.ts` (rooms, frame validation, relay),
  `src/server.ts` (HTTP + WS wiring, hall of fame), `src/index.ts` (env + start).
- Tests: 79 tests in 7 files (23 Oct; 3 skip without ffmpeg or the voice model), over real HTTP + WS on port 0 with
  temp data dirs and `claude: null`, so `bun test` never calls the API even when `server/.env` has a key. The Claude request shape (headers, `?beta=true`, body, no `Authorization`
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
- 2026-10-20: port 8787 was held by an earlier network-probe echo server. The Sketchlings server fails loudly with
  EADDRINUSE in that case; stop the probe first. `PORT=8788 bun run start` was used for the smoke test (health, placeholder page, TV hello, ping, bad frame: all OK).

## Measured with the real Claude API (21 Oct 2026, claude-opus-5-5, effort low)
- Persona latency over 11 real scans: cold first call 7.2 s, then 3.7-5.3 s (median about 4.3 s). Voice clips ready 7-13 s after upload.
- Tokens per scan: 2.4-2.7k in, 210-255 out, about $0.014-0.016 per creature at list price ($4/$20 per MTok).
- Names were repetitive ("Bobble ..." x5) until the request listed names already taken in the room and recent hall of fame; after that: Zippy Sprinkle, Sunny Jellybean, Captain Bleep, Mister Fizzwhistle, Wiggle Muffin, Peachy Plum.
- Keys not scoped to a workspace need `ANTHROPIC_WORKSPACE_ID` in server/.env (400 "must include the anthropic-workspace-id header").

## Measured since (22-23 Oct)
- Persona benchmark, 22 Oct: 60 calls (12 test images, 9 drawings, none by a child), median 4.7 s (p90 5.9 s, 3.7-8.3 s,
  first call 8.0 s), median $0.0159 a creature ($0.014-0.016), 60 of 60 answered, 0 fallbacks, 0 word-guard hits.
  It replaces the 11-scan sample above. Details: `notes/bench-persona.md`, verdicts: `docs/ABILITY_AUDIT.md`.
- 23 Oct, on the VVD with fake phones and the real API: personas 4.8-5.2 s; an injected failure
  (`SKETCHLINGS_FAIL_EVERY=4`) fell back to offline in 29 ms; upload->voices 13.3-13.5 s with 3 scans at once.
- 23 Oct, Kokoro, intros first, 6 uploads at once (offline personas, load average about 9): intro frames 2.7-16.3 s
  after the uploads, full voices 18.4-27.7 s.
- `[net] race rtt ms` and `[race] inputs` lines have only been seen on localhost (0-1 ms median rtt; 4.5-4.9 taps/s
  from fake phones). Real phones over Wi-Fi: not measured yet.

## Added 22-23 Oct (details in `server/README.md`)
- Consent flag: TV hello `aiPersonas: false` means offline personas for that room, logged once as `[consent]`. The
  drawing still goes to this relay and into the Hall of Fame; only the Claude call stops.
- Names: first word, letters only (ZWNJ/ZWJ kept for Sinhala and Tamil), at most 12, word guard, else `Artist`.
- Persona text all-or-none: the six text lines come all from Claude or all from the offline persona.
- The 12 s Claude limit covers the response body too (`AbortSignal.timeout`).
- Voice queue: every waiting intro first, and a `sketchling` frame with `voice: {intro}` as soon as it is ready.
- Ability correction (`ability {kind}`, `chosenBy: 'artist'`), `clearHall`, `removePlayer`, `deleteCreature`. Only
  `clearHall` has a TV control (Grown-ups); the other two have no UI yet.
- Tunnel: requests with `Cf-Connecting-IP` or `Cf-Ray` get no Hall of Fame, no voice clips and only live rooms'
  sprites, and a TV hello through the tunnel is refused. Tested with fake headers, not through a real cloudflared.
- Logs per race: `[net] race rtt ms` (server-side WebSocket pings) and `[race] inputs` (taps a second per player).
- Failure injection for soaks: `SKETCHLINGS_FAIL_EVERY=N`.
