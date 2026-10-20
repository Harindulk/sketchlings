# Audio notes (creature voices + narrator)

Owner: server. Code: `server/src/voice.ts`, `server/src/tts-worker.ts`, `server/scripts/`. Setup and licences:
`server/README.md` (section "Creature voices") and `server/CREDITS.md`.

## What the TV gets

1. `sketchling` frame as before, **without** `voice` (never delayed by audio).
2. 4-7 s later (normal load), a **second `sketchling` frame with the same id**, identical except for
   `voice: {intro, catchphrase, winLine}`: server-relative URLs like `/voice/<id>/intro.m4a`. Prefix the server base
   (`http://10.0.2.2:8787` on the VVD), like sprite URLs. Replace the stored Sketchling by id. Any line can be missing
   if it failed; no second frame at all means no voice (no model on that Mac, or every line failed).
3. `players` frames sent after that carry the voiced Sketchling too, and so does `GET /api/hall-of-fame`.
4. If a player re-scans before the voice is ready, the old Sketchling's second frame is not sent (the hall entry is
   still updated).

## Format

AAC-LC, mono, 44.1 kHz, ~80 kbps, fragmented MP4: boxes `ftyp moov(mvex) moof mdat`, no `mfra` trailer, one fragment
per clip. MSE type `audio/mp4; codecs="mp4a.40.2"`. Loudness -18 LUFS integrated, true peak <= -1.5 dBTP (measured
-17.8 to -19.7 LUFS across clips), leading/trailing silence trimmed to 30/60 ms so "Three! Two! One!" can be timed.
`GET /voice/:id/:line.m4a`: `Content-Type: audio/mp4`, `Content-Length`, `Accept-Ranges: bytes`, `Range` -> 206 with
`Content-Range`, 416 when out of range, `Access-Control-Allow-Origin: *`, `Cache-Control: immutable`.

## Narrator clips for the TV bundle

`server/assets/narrator/`: `three two one go doodle-boost roar photo-finish winner-is meet-sketchlings scan-drawing
everybody-ready` `.m4a` (12-20 KB each, 0.55-1.4 s) + `manifest.json` (`id`, `text`, `file`, `durationMs`, `mimeType`).
Regenerate with `cd server && bun run gen:narrator`. Voice: Kokoro `af_heart`, natural pitch, speed 1.05.
They are not served over HTTP; if reading bundled binary assets is awkward on Vega, a one-line `/narrator/:id.m4a`
route in `server.ts` would do it.

## Playing on Vega (untested on device here; based on `@amazon-devices/react-native-w3cmedia` 2.3.2 typings + README)

```ts
import {AudioPlayer, MediaSource, AudioContentType, AudioUsageType} from '@amazon-devices/react-native-w3cmedia';
const MIME = 'audio/mp4; codecs="mp4a.40.2"';

const player = new AudioPlayer(AudioContentType.CONTENT_TYPE_SPEECH, AudioUsageType.USAGE_GAME);
await player.initialize(); // once; deinitialize() on unmount

async function play(bytes: ArrayBuffer) {
  const ms = new MediaSource();
  player.src = URL.createObjectURL(ms);
  ms.addEventListener('sourceopen', () => {
    const sb = ms.addSourceBuffer(MIME);
    sb.addEventListener('updateend', () => ms.endOfStream());
    sb.appendBuffer(new Uint8Array(bytes)); // the whole clip is one init segment + one fragment
  });
  await player.play();
}
// creature line: play(await (await fetch(`${SERVER}${sketchling.voice.intro}`)).arrayBuffer())
```

- Check `MediaSource.isTypeSupported(MIME)` once at startup and log it.
- Fetch clips as soon as the second frame arrives (they are small), so the reveal plays without a network wait.
- If MSE appends fail, try URL mode (`player.src = absoluteClipUrl`): the files are valid MP4 too (ffprobe reads them).
- The TV manifest already has a comment about media services for w3cmedia; missing `[wants]` media services give
  silent failures (per the Vega media docs).

## How voices are picked

`pickVoice` in `voice.ts`, deterministic from name + title + personality + stats (same drawing -> same voice):
size words (name/title count double) + `(power - speed) / 2` -> `tiny` +4.5 st, `buddy` +2 st, `big` -2.5 st and 5%
slower; +-0.6 st jitter from a name hash; honorifics (Sir, Lady, Professor, Duke, King...) -> British voices; gender
words (Lady/Queen/she vs Sir/King/he) -> female/male base voice, otherwise a hash. Over 400 offline personas: 40% big,
35% tiny, 25% buddy, and all ten base voices get used. Pitch range is -3.1..+5.1 st, speed 0.87..1.08.

## Checks done

- **Intelligibility (dev-only):** Whisper small.en (transformers.js, run in a scratch folder, not shipped) transcribed
  every test clip exactly, including the extremes (+5.1 st on `af_heart`/`am_puck`, -3.1 st on `am_fenrir`,
  `am_michael`, `af_heart`) and all 11 narrator clips ("Two!" comes back as "to"). Nothing was played on the speakers.
- **Timings** on this M5 MacBook with load average ~23 (VVD, builds and other tests running): model load + warm-up
  2.5 s; intro (~5 s of speech) median 3.6 s, max 4.7 s; catchphrase median 1.6 s; winLine median 1.8 s. On a quieter
  moment: 4.3 s for all three lines end-to-end. Cache hit (same drawing scanned again): ~12 ms. Narrator lines:
  0.5-2.1 s each. fp32 was faster than q8 here (3.7 s vs 4.9 s for the same intro).
- **Smoke test** on my own instance (port 8791, scratch data dir, stopped afterwards): first frame 12-23 ms after
  upload, second frame 4.3 s later, curl Range/HEAD/OPTIONS headers as above, ffprobe: `aac LC 44100 Hz mono`.
- `bun test`: 45 pass (2 of them need the model and skip without it), `bun run typecheck` clean.

## Known limits

- One clip at a time: with six scans at once the last voice lands ~30-40 s later.
- The text+voice cache in `server/data/voice/cache/` is never pruned (shortcut, ~20-60 KB a clip).
- Kokoro runs in a child process because Bun 1.4 aborts on exit once onnxruntime is loaded; the worker SIGKILLs
  itself when the server goes away. A clip that times out (20 s) kills the worker; the next clip starts a new one.
- The live 8787 instance was not restarted: it gets voices only after someone restarts it (and runs
  `bun run tts:download` first, which is already done on this Mac: `server/models/` exists).
