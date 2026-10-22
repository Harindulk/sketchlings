# Sketchlings server

Bun + TypeScript. Rooms and the WebSocket relay between the TV and phones, the phone web app, sprites,
Claude-made personas for each drawing (with an offline generator when there is no key or anything fails), and a
spoken voice for every creature (local Kokoro TTS, no cloud).
The contract is `../shared/protocol.ts`.

## Run

```sh
cd server
bun install
cp .env.example .env     # then paste ANTHROPIC_API_KEY (optional)
bun run tts:download     # once: Kokoro-82M voice model (~330 MB) into server/models/ (optional, needs ffmpeg)
bun run dev              # watch mode;  bun run start  for a plain run
bun test                 # all tests, no network or API key needed
bun run typecheck
```

Listens on `0.0.0.0:8787`. The Vega Virtual Device reaches it at `http://10.0.2.2:8787`, phones at the Mac's LAN IP
(printed at startup). Run it from `server/` so Bun picks up `server/.env` (variables already set in the shell win).

## Environment

| Var | Default | Use |
|---|---|---|
| `ANTHROPIC_API_KEY` | empty | Claude key. Empty = offline personas only. |
| `ANTHROPIC_WORKSPACE_ID` | empty | Only for a key not scoped to a workspace (the API answers 400 "must include the anthropic-workspace-id header"). |
| `SKETCHLINGS_MODEL` | `claude-opus-5-5` | Vision model. Must support structured outputs and `effort`. |
| `PORT` | `8787` | Listen port (the TV and phones expect 8787). |
| `PUBLIC_URL` | `http://<first LAN IPv4>:8787` | Base of the `joinUrl` in the QR code. |
| `SKETCHLINGS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | API endpoint. The shell's `ANTHROPIC_BASE_URL` is deliberately ignored. |
| `SKETCHLINGS_FAIL_EVERY` | empty | Soak tests only: every Nth persona call fails on purpose, so the offline fallback runs (logged). |

## WebSocket `ws://<host>:8787/ws`

JSON frames with a `t` field, exactly as in `shared/protocol.ts`.

- TV: `hello {role:'tv', room?, aiPersonas?}` gets `room {code, joinUrl}` and `players`. With `room` it rejoins that room; if the
  server restarted, the room is recreated under the same code (players then rejoin as new players).
  Only `aiPersonas: true` (the grown-ups' yes on the TV) lets a room's drawings go to Claude. `false` or absent means every
  upload gets the offline persona; the first explicit value is logged once, e.g. `[consent] room <code>: AI personas off`.
  Send it in every hello, because a server restart recreates the room without it. A TV hello through the public tunnel (see HTTP below) gets a
  `bad_message` error: the TV always comes over the LAN or 10.0.2.2.
- Phone: `hello {role:'phone', room, name, ageGroup, playerId?, key?}` gets `joined`, then the last `phase` frame if the TV
  sent one. `ageGroup` is `little|big|grownup`; if omitted it defaults to `big`, any other value is rejected.
  A known `playerId` reconnects to the same player (name, age group, colour, sketchling); an unknown one joins as a
  new player, so always store the `playerId` from `joined`. `players` frames carry each player's `ageGroup`.
  `players` frames also carry every `playerId`, so a phone should make a random `key` (16-64 characters) once and send
  it in every hello: a player who joined with a key is only taken back by a hello with the same key (otherwise that
  hello joins as a new player). A player who joined without one can be taken over by any phone that knows the id.
- Relay: phone `input` (`tap|jump|hold|release|shout`) goes to the TV as `{t:'input', playerId, kind, at}`; TV `phase` goes to every phone.
  `players` goes to the TV and all phones on any join, leave, reconnect or new sketchling. `ping` gets `pong`.
- Names: the server keeps the first word of a phone's `name`, letters only (plus an inner `-`, `'`, ZWNJ or ZWJ, which
  Sinhala and Tamil names need, e.g. ශ්‍රියානි), at most 12, through the persona word guard; anything unusable becomes
  `Artist`. A blank name is still an error.
- Wi-Fi latency: during a race the server sends each phone a WebSocket ping (a control frame the browser answers by
  itself) at the start and every 2 s, keeps the round trips per player and logs one line when the race ends:
  `[net] race rtt ms (median/p90): Mia 41/88 n=5, Leo 35/60 n=2`. Phones need no code for it.
- Tap rates: the server also counts each player's inputs while the TV is in `race` and logs one line when it leaves:
  `[race] inputs over 41.3s: Mia little taps/s 3.8 hold 2.1s jumps 9 roars 3; Dad grownup taps/s 6.2 hold 0.0s jumps 12 roars 5`.
  Name, age group, then taps a second over the whole race, including the 3-2-1 and any time after that player finished
  (a hold counts as 4 taps a second, as on the TV), hold time, jumps, and roars (every `shout`: ROAR button or mic).
  Players who sent nothing are left out. Compare with the assumed rates in docs/FAIRNESS.md (little kids 4 taps/s).
- Ability change: phone `ability {kind}` in phase lobby, draw or reveal changes that player's creature to `kind`
  (`move` too) with `chosenBy: 'artist'` and the drawing's pick in `ability.original`; `feature` becomes
  "artist's pick"; going back to the original kind restores the drawing's ability with no chosenBy. It goes out as the usual
  `sketchling` frame (same id) plus `players`, and the hall-of-fame entry is updated. In race or results: an error.
- Clear Hall of Fame: TV `clearHall` deletes every hall entry and every sprite and voice clip in server/data (plus the
  voice cache and any `hall.json.bad-*` copies) and answers `hallCleared {removed}`. Rooms keep their players, but their
  creatures' pictures and clips are gone, so offer it outside a party. If a delete fails, the hall is already empty on
  disk and the TV gets a `bad_message` error to try again.
- Remove a player: TV `removePlayer {playerId}` takes one child out of the room (they stop, or a parent withdraws them).
  The slot goes, their phone gets `{t:'error', code:'removed'}` and its socket is closed, a hello with that `playerId`
  is refused with `removed` from then on (a hello without it joins as a new player), and every Hall of Fame entry made
  under that `playerId` is deleted with its sprite and voice. A scan still running for them is dropped and its drawing
  deleted. Answer: the usual `players` frame without them. Logged as `[room] <code>: the TV removed a player and their
  <n> creature(s)`, with no name. An unknown `playerId` gets `bad_message`.
- Delete one creature: TV `deleteCreature {id}` (a Sketchling id) deletes that Hall of Fame entry with its sprite and
  voice and answers `creatureDeleted {id, removed}` (`removed: 0` if there was no such entry). A player in a live room
  who still has that creature is left without one (sent as `players`) and can scan again.
- `clearHall`, `removePlayer` and `deleteCreature` work only from the room's TV socket. The server refuses a TV hello
  through the tunnel, but cannot tell a TV from any other client on the Wi-Fi: the TV's parent gate is the real guard,
  for these and for `aiPersonas`. The TV UI for `removePlayer` and `deleteCreature` may come later.
- Every bad frame gets `{t:'error', code:'bad_message'|'no_room'|'room_full'|'removed', message}`; the socket stays open
  (except after `removed` from `removePlayer`).
  Max frame size 64 KB. Room codes are 4 letters with no vowels and no I/L/O/Q.

## HTTP (all responses send `Access-Control-Allow-Origin: *`)

| Route | |
|---|---|
| `POST /api/rooms/:room/players/:playerId/sketch` | Body: PNG (max 5 MB, max 2048 px a side). `202 {id}`, then WS `scan` processing, `sketchling` (TV + that phone), `scan` ready, `players`. Errors: 404 unknown room/player, 409 a scan is already running for that player, 413 too big, 415 not a PNG. |
| `GET /sprites/:id.png` | The uploaded sprite. Through the tunnel: only creatures someone has in a live room, else 404. |
| `GET /voice/:id/:line.m4a` | A creature's spoken line, `line` = `intro`, `catchphrase` or `winLine`. `audio/mp4` (AAC-LC in fragmented MP4), `Content-Length`, `Range` -> 206, immutable cache. Through the tunnel: 404. |
| `GET /api/hall-of-fame` | `Sketchling[]`, newest first, max 200 (`data/hall.json`). Through the tunnel: 404. |
| `GET /health` | `{ok: true}` |
| `GET /j/:room`, `GET /` | `../phone/dist/index.html` (a placeholder page if the phone app isn't built). |
| `GET /assets/*`, other files | Static files from `../phone/dist`. |

**The public tunnel.** `scripts/tunnel.sh` puts the server on a public trycloudflare URL so phones can join over
HTTPS, and anyone with that URL can reach it. Cloudflare adds `Cf-Connecting-IP` and `Cf-Ray` to every request it
passes on, so a request with either header counts as "through the tunnel". There, the server gives phones only what
they need: the phone app, joining, uploads and the sprites of creatures in a live room. The Hall of Fame (children's
first names and drawings) and the voice clips stay on the LAN, where the TV (10.0.2.2 on the VVD, the Mac's LAN IP on a
real Fire TV) and `localhost` scripts get everything. Don't use an IP allowlist instead: cloudflared and the VVD both
arrive from loopback.

## Personas

`src/persona.ts`. With a key, the sprite goes to Claude (12 s timeout for the whole response, body included; no
retries) with a kid-safe system prompt and a JSON schema; every field is validated and clamped (stats 1-5 with a total
of 7-11, word limits from the protocol, `move` enum, `#rrggbb` colours). The six text lines (name, title, personality,
catchphrase, intro, winLine) come all from Claude or all from the offline persona: if one is empty or hits the word
guard, all six are replaced, because the intro and winLine say the name. With no key or on any error (timeout,
refusal, bad JSON) the offline generator answers instead: deterministic from the image (dominant ink colours, shape, ink coverage, a hash) plus curated word lists.
Each Sketchling also carries `artist` (the uploader's first name) and `eyes` (`{x, y, r}` normalised to the sprite,
for the TV's googly eyes). Claude is asked to locate the eyes and to return `[]` when unsure, plus `drewEyes`; offline, `src/eyes.ts`
only reports a convincing pair of small round dark dots inside the upper half of the body, otherwise `[]`. `ownEyes`
(from `drewEyes`, or offline from 2-4 round dark dots in the top half) tells the TV the child drew eyes, so it adds no
default googly pair when `eyes` is empty.

**Abilities** (`src/ability.ts`): what you draw changes how you play. `ability.kind` always equals `move`;
`ability.label` is fixed per kind so the TV can rely on it:

| kind | drawn feature | label |
|---|---|---|
| `fly` | wings | Flies over ink blots! |
| `roll` | wheels / round body | Zooms fast on flat ground! |
| `hop` | long legs / springy | Jumps extra high and far! |
| `walk` | big, chunky body | ROAR knocks back ink blots! |

Claude picks `move` from a feature it can see and names it in `ability.feature` (1-4 kid words, clamped; a generic
feature if unusable; an invalid `move` falls back to the offline move *and* ability). Offline, the cut-out silhouette
decides: tall with two thin lower protrusions = hop ("long legs"), wide with a few rows sticking far out sideways =
fly ("wide wings"), near-circular = roll ("round body"), else walk ("big strong body"). Hall-of-fame entries saved
before abilities existed get one from their `move` when the server loads them.

Data lives in `server/data/` (git-ignored): `sprites/<id>.png`, `voice/` and `hall.json`. Every scan becomes a
hall-of-fame entry. Sprites that drop out of the hall of fame are deleted. The TV stores nothing: it fetches the
hall from the server each time, and its "Race again" picks live only in memory.

The scan log gives the full server-side chain per scan: `[scan] <playerId> upload->sketchling <ms> ms source=...`
(persona ready) and `[scan] <playerId> upload->voices <ms> ms lines=<n>` (voice clips ready).

## Creature voices

`src/voice.ts`, `src/tts-worker.ts`. After the first `sketchling` frame goes out (never delayed by audio), the server
speaks the creature's `intro`, `catchphrase` and `winLine`. As soon as the intro is ready it sends a **`sketchling`
frame with the same id** plus `voice: {intro}`, and when every line is done another one with `voice: {intro, catchphrase,
winLine}` (server-relative URLs), to the TV and the owning phone, and updates the hall-of-fame entry. A line that fails
is left out; if every line fails there is no voice frame. Without the model (or without ffmpeg) voices are simply off
and everything else works as before.

- **Engine:** [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0) via `kokoro-js` (fp32 ONNX on the CPU),
  in a child process so an onnxruntime crash or hang can't take the game server down. Fully offline once downloaded:
  the server never fetches the model (`allowRemoteModels = false`); only `bun run tts:download` does.
- **Voice per creature** (`pickVoice`, deterministic from name, title, personality and stats): size words ("Little",
  "Bunny", "tiny" vs "Big", "Whale", "grumpy"; name and title count double) plus `power - speed` give `tiny` (+4.5
  semitones), `buddy` (+2) or `big` (-2.5, a bit slower). Honorifics pick a British voice (Sir, Lady, Professor, Duke...)
  and a gender (Lady/Queen/she vs Sir/King/he, otherwise a hash). Base voices: `af_heart af_bella af_sarah am_puck
  am_michael am_fenrir bf_emma bf_isabella bm_george bm_fable`. A hash of the name adds +-0.6 semitones. The same
  drawing always gets the same voice.
- **Audio:** ffmpeg (`ffmpeg` on PATH, else `/opt/homebrew/bin/ffmpeg`) trims Kokoro's leading/trailing silence,
  pitch-shifts with `asetrate` + `atempo` (formants move too, which is the creature sound), compresses lightly,
  `loudnorm` to -18 LUFS / -1.5 dBTP, and encodes AAC-LC mono 44.1 kHz 80 kbps as fragmented MP4
  (`frag_keyframe+empty_moov+default_base_moof+skip_trailer`: `ftyp moov moof mdat`, no `mfra`). MSE type:
  `audio/mp4; codecs="mp4a.40.2"`.
- **Queue:** one clip at a time, every waiting intro before any other line, so with several scans at once every creature
  can introduce itself on the Reveal before anyone's catchphrase or winLine is made. 20 s timeout per clip (a hung
  worker is killed and replaced on the next clip). Clips are cached by model + voice + speed + pitch + text in `data/voice/cache/` and hard-linked to `data/voice/<id>/<line>.m4a`,
  so a re-scanned drawing (same persona, same voice) is voiced in ~10 ms. The per-id folder is deleted with the sprite
  when a Sketchling drops out of the hall of fame; the cache is never pruned (~20-60 KB a clip).
- **Speed** (M5 MacBook): model load + warm-up 1-2.5 s at startup. Per line: intro (~5 s of speech) 1.9-4.7 s,
  catchphrase 0.9-2.4 s, winLine 1.0-2.1 s; a whole creature is voiced 4-7 s after its first frame (the lower numbers on
  an idle Mac, the higher with the VVD and builds running). Six simultaneous scans queue up. With intros first
  (23 Oct, offline personas, load average about 9): the six intro frames came 2.7-16.3 s after the uploads, and the
  full voices 18.4-27.7 s. Before intros went first, the bug hunt measured the voices of six scans at 10-53 s, with
  nothing until each creature's last line.

### Narrator clips

`bun run gen:narrator` writes `assets/narrator/<id>.m4a` + `assets/narrator/manifest.json` (`id`, `text`, `file`,
`durationMs`, plus the MSE `mimeType`) for the TV to bundle: Three! Two! One! Go! Doodle Boost! ROAR! Photo finish!
And the winner is... Let's meet our Sketchlings! Scan your drawing! Everybody ready? Voice: Kokoro `af_heart` (its
best-graded voice), natural pitch, speed 1.05, same encoding as above. Clips are 0.55-1.4 s. Edit `LINES` in
`scripts/gen-narrator.ts` and re-run to change them.

### Setup notes

- `bun run tts:download` needs the internet once (Hugging Face, `onnx-community/Kokoro-82M-v1.0-ONNX`, fp32
  `onnx/model.onnx` ~326 MB plus config/tokenizer). Voice packs ship inside the `kokoro-js` npm package.
  `server/models/` is git-ignored. To install on another Mac offline, copy `server/models/` across.
- `bun install` reports two blocked postinstalls (onnxruntime-node, protobufjs). Leave them blocked: the macOS arm64
  onnxruntime binary is already in the package.
- Bun 1.4 aborts with "panic: A C++ exception occurred" when a process that loaded onnxruntime exits normally. That is
  why the model lives in `tts-worker.ts` (SIGKILLs itself when the server goes away) and why `tts:download` ends with
  SIGKILL. Harmless if you see it from a script.
- Tests: `bun test` covers voice selection, the queue and timeout, the ffmpeg encoding + cache (needs ffmpeg), the
  `/voice` endpoint with Range, and an end-to-end upload that waits for the intro frame and the full voice frame. The
  two tests that need the model skip themselves when `server/models/` is missing.
- Licences of everything used: `CREDITS.md`. Design notes and TV playback: `../notes/audio.md`.
