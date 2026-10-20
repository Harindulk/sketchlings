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
| `SKETCHLINGS_MODEL` | `claude-opus-5-5` | Vision model. Must support structured outputs and `effort`. |
| `PORT` | `8787` | Listen port (the TV and phones expect 8787). |
| `PUBLIC_URL` | `http://<first LAN IPv4>:8787` | Base of the `joinUrl` in the QR code. |
| `SKETCHLINGS_ANTHROPIC_BASE_URL` | `https://api.anthropic.com` | API endpoint. The shell's `ANTHROPIC_BASE_URL` is deliberately ignored. |

## WebSocket `ws://<host>:8787/ws`

JSON frames with a `t` field, exactly as in `shared/protocol.ts`.

- TV: `hello {role:'tv', room?}` gets `room {code, joinUrl}` and `players`. With `room` it rejoins that room; if the
  server restarted, the room is recreated under the same code (players then rejoin as new players).
- Phone: `hello {role:'phone', room, name, ageGroup, playerId?}` gets `joined`, then the last `phase` frame if the TV
  sent one. `ageGroup` is `little|big|grownup`; if omitted it defaults to `big`, any other value is rejected.
  A known `playerId` reconnects to the same player (name, age group, colour, sketchling); an unknown one joins as a
  new player, so always store the `playerId` from `joined`. `players` frames carry each player's `ageGroup`.
- Relay: phone `input` (`tap|jump|hold|release|shout`) goes to the TV as `{t:'input', playerId, kind, at}`; TV `phase` goes to every phone.
  `players` goes to the TV and all phones on any join, leave, reconnect or new sketchling. `ping` gets `pong`.
- Every bad frame gets `{t:'error', code:'bad_message'|'no_room'|'room_full', message}`; the socket stays open.
  Max frame size 64 KB. Room codes are 4 letters with no vowels and no I/L/O/Q.

## HTTP (all responses send `Access-Control-Allow-Origin: *`)

| Route | |
|---|---|
| `POST /api/rooms/:room/players/:playerId/sketch` | Body: PNG (max 5 MB, max 2048 px a side). `202 {id}`, then WS `scan` processing, `sketchling` (TV + that phone), `scan` ready, `players`. Errors: 404 unknown room/player, 409 a scan is already running for that player, 413 too big, 415 not a PNG. |
| `GET /sprites/:id.png` | The uploaded sprite. |
| `GET /voice/:id/:line.m4a` | A creature's spoken line, `line` = `intro`, `catchphrase` or `winLine`. `audio/mp4` (AAC-LC in fragmented MP4), `Content-Length`, `Range` -> 206, immutable cache. |
| `GET /api/hall-of-fame` | `Sketchling[]`, newest first, max 200 (`data/hall.json`). |
| `GET /health` | `{ok: true}` |
| `GET /j/:room`, `GET /` | `../phone/dist/index.html` (a placeholder page if the phone app isn't built). |
| `GET /assets/*`, other files | Static files from `../phone/dist`. |

## Personas

`src/persona.ts`. With a key, the sprite goes to Claude (12 s timeout, no retries) with a kid-safe system prompt and a
JSON schema; every field is validated and clamped (stats 1-5 with a total of 7-11, word limits from the protocol,
`move` enum, `#rrggbb` colours). With no key or on any error (timeout, refusal, bad JSON) the offline generator answers
instead: deterministic from the image (dominant ink colours, shape, ink coverage, a hash) plus curated word lists.
Each Sketchling also carries `artist` (the uploader's first name) and `eyes` (`{x, y, r}` normalised to the sprite,
for the TV's googly eyes). Claude is asked to locate the eyes and to return `[]` when unsure; offline, `src/eyes.ts`
only reports a convincing pair of small round dark dots inside the upper half of the body, otherwise `[]`.

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

Data lives in `server/data/` (git-ignored): `sprites/<id>.png` and `hall.json`. Sprites that drop out of the
hall of fame are deleted.

## Creature voices

`src/voice.ts`, `src/tts-worker.ts`. After the first `sketchling` frame goes out (never delayed by audio), the server
speaks the creature's `intro`, `catchphrase` and `winLine`, then sends a **second `sketchling` frame with the same id**
plus `voice: {intro, catchphrase, winLine}` (server-relative URLs) to the TV and the owning phone, and updates the
hall-of-fame entry. A line that fails is left out; if every line fails there is no second frame. Without the model
(or without ffmpeg) voices are simply off and everything else works as before.

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
- **Queue:** one clip at a time, 20 s timeout per clip (a hung worker is killed and replaced on the next clip). Clips are
  cached by model + voice + speed + pitch + text in `data/voice/cache/` and hard-linked to `data/voice/<id>/<line>.m4a`,
  so a re-scanned drawing (same persona, same voice) is voiced in ~10 ms. The per-id folder is deleted with the sprite
  when a Sketchling drops out of the hall of fame; the cache is never pruned (~20-60 KB a clip).
- **Speed** (M5 MacBook): model load + warm-up 1-2.5 s at startup. Per line: intro (~5 s of speech) 1.9-4.7 s,
  catchphrase 0.9-2.4 s, winLine 1.0-2.1 s; a whole creature is voiced 4-7 s after its first frame (the lower numbers on
  an idle Mac, the higher with the VVD and builds running). Six simultaneous scans queue up, so the last creature's
  voice can take ~30-40 s.

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
  `/voice` endpoint with Range, and an end-to-end upload that waits for the second frame. The two tests that need the
  model skip themselves when `server/models/` is missing.
- Licences of everything used: `CREDITS.md`. Design notes and TV playback: `../notes/audio.md`.
