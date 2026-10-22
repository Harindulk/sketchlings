# Persona benchmark (22 Oct 2026)

60 real Claude calls, one at a time, through the same code the server runs. It replaces the earlier sample of 11 scans (`notes/server.md`, 21 Oct). The ability verdicts for each drawing are in `docs/ABILITY_AUDIT.md`.

**No child's drawing is in this set.** The repo holds no photo or cut-out of a real child's drawing yet. Every input below is a test or demo picture. The "scan" group is real phone cut-outs (made by the phone's cut-out code and uploaded to the relay), but of synthetic test photos, not of paper drawings by children.

## Method

- **Script:** `server/scripts/bench-persona.ts`. Run from `server/`, so Bun loads `server/.env` (API key and workspace id) exactly as `bun src/index.ts` does: `cd server && bun scripts/bench-persona.ts 5 <raw.json>`.
- **Code path:** `makeClaude()` and `generatePersona()` from `server/src/persona.ts`, as in the working tree on 22 Oct (with the word guard). Nothing in `persona.ts` is changed. The script only wraps `messages.create` to read the token usage, the raw JSON and the time of the API call.
- **Model and settings:** `claude-opus-5-5`, effort low, JSON schema output, 12 s timeout, no retries, server-side fallback on. All 60 answers came from `claude-opus-5-5`.
- **Calls:** 12 images x 5 runs = 60 calls, sequential, round-robin (run 1 of every image, then run 2, and so on). `taken` (names already used in the room) is empty, so the model is never told to avoid a name.
- **Network:** this Mac's normal internet connection to `api.anthropic.com`, 22 Oct about 20:27-20:33 local time (UTC+5:30). The latency includes that round trip. It does not include the phone's cut-out, the upload, Kokoro voices or the TV.
- **Latency:** `generatePersona` wall time (image analysis + offline persona + Claude). The API call alone is also shown; the two differ by about 20-60 ms.
- **Cost:** tokens from the API's `usage` field, priced at the Opus 5.5 list price ($4 in / $20 out per million tokens), the same formula `persona.ts` logs. Budget guard: the script estimated the total from the first 5 calls ($0.91) and would have stopped above $3.
- **Ability consistency:** for each image, the share of runs that got its most common ability kind.
- **Eyes:** "returned" = a non-empty `eyes` list in Claude's raw JSON; `drewEyes` becomes the sketchling's `ownEyes`.
- **Word guard:** the `[persona] unsafe word in <field>` warnings during the call.
- **Schema fallbacks:** a field of Claude's JSON that `sanitizePersona` replaced with the offline value (bad text, bad move, bad colours, bad eyes, or a guard hit), plus stats that `balanceStats` changed.
- **Offline determinism:** for each image, `offlinePersona(analyze(png))` three times plus `generatePersona(png, size, null)`, compared as JSON. Same process only.

## Inputs

All 69 files in `server/data/sprites` were hashed (SHA-256). They hold 9 distinct images: 6 are byte-identical to the TV demo art that `tv/scripts/fake-phones.mjs` uploads, so they count once, in the "sample" group. That leaves 3 phone cut-outs.

| Group | Image | What it is |
|---|---|---|
| scan | `server/data/sprites/0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png` | Phone cut-out (21 Oct) of the phone's bundled sample photo `phone/src/samples/monster.jpg`, a synthetic picture of a felt-tip monster. 9 copies in the folder. |
| scan | `server/data/sprites/5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png` | Phone cut-out (20 Oct) of the same sample photo, from an earlier cut-out version. 2 copies. |
| scan | `server/data/sprites/a0e17710-85ce-409a-9292-30784c95c477.png` | Phone cut-out (21 Oct) of a red crayon oval with an orange patch. Same size as the library's crayon-blob cut-out (327x247), so most likely the phone was fed that synthetic test photo. 3 copies. |
| library | `packages/doodle-cutout/examples/crayon-blob-sprite.png` | doodle-cutout's cut-out of its synthetic crayon-blob photo. |
| library | `packages/doodle-cutout/examples/monster-sprite.png` | doodle-cutout's cut-out of the synthetic monster photo. |
| library | `packages/doodle-cutout/examples/ruled-sprite.png` | doodle-cutout's cut-out of a synthetic stick creature on lined paper. |
| sample | `tv/src/assets/art/{dino,star,hedgehog,cloud,frog,potato}.png` | TV demo art in a crayon style; the fake-phone script uploads these. Listed separately. |

So the 12 images are 9 different drawings: the monster appears as 3 cut-outs and the crayon blob as 2.

Not used: `docs/playtest`, `notes/shots` and `phone/docs/screens` hold screenshots, not cut-outs; a local backup of `server/data` holds copies of the same files.
## Results (22 Oct 2026, claude-opus-5-5, effort low)
- Calls: 60 (60 answered by Claude, 0 fell back to offline). Models that answered: claude-opus-5-5.
- Latency (generatePersona wall time, all Claude answers): median 4.7 s, p90 5.9 s, min 3.7 s, max 8.3 s. First call 8.0 s.
- API call alone (what the server logs as "answered in"): median 4.7 s, p90 5.8 s, min 3.7 s, max 8.3 s.
- Without the first call: median 4.7 s, p90 5.9 s.
- Tokens per creature: in 2368-2699 (median 2631), out 210-279 (median 262.5).
- Cost per creature at $4/$20 per MTok: median $0.0159, $0.0137-$0.0162. Total $0.9329.
- Ability kinds over all Claude answers: walk 27, hop 10, fly 5, roll 18.
  - scan: walk 10, hop 0, fly 0, roll 5.
  - library: walk 5, hop 5, fly 0, roll 5.
  - sample: walk 12, hop 5, fly 5, roll 8.
- Eyes returned (non-empty list): 50/60; drewEyes (ownEyes) true: 50/60; eye entries dropped by cleanEyes: 0.
- Word-guard hits: 0 (none).
- Schema fallbacks (a field replaced by the offline value): 0/60 calls (none); stats changed by balanceStats: 0/60.
- Offline persona identical across repeats for the same drawing: 12/12 drawings.

## Reading the numbers

- **Latency is higher than the 21 Oct sample.** Median 4.7 s over 60 calls, against "about 4.3 s" over 11 scans. Mean 4.9 s, standard deviation 0.9 s. 5 of 60 calls took over 6 s and 2 over 8 s (8.0 s on the first, cold call; 8.3 s on call 41). None came near the 12 s timeout. By group: scan 5.0 s, library 5.0 s, sample 4.6 s (medians).
- **Cost matches.** $0.0159 per creature (median), $0.014-0.016. The crayon blob is the cheapest: fewer input tokens and a shorter answer.
- **Abilities are stable for the same drawing.** 11 of 12 images got the same kind in all 5 runs. The star is the exception: roll 3, walk 2. Different cut-outs of the same drawing agreed: the 3 monster cut-outs were walk 15 of 15, the 2 crayon-blob cut-outs roll 10 of 10. The feature wording varies a little ("big round tummy", "chunky round tummy").
- **The kind mix leans to walk and roll.** walk 27, roll 18, hop 10, fly 5. This set has one winged drawing (the cloud) and no wheels, so it says little about how often fly or roll would come up on real drawings.
- **Claude and the offline silhouette guess agree on 6 of 12 images.** The offline guess said walk for 11 of them; Claude picked roll, hop or fly for 6 of those.
- **Eyes:** a non-empty eye list in 50 of 60 answers, and `drewEyes` true in the same 50. The 10 without eyes are all the crayon blob, which has no face. The dino, drawn side-on, got 1 eye every time. cleanEyes dropped no entries. Eye positions were not checked against the drawings.
- **Guard and schema:** 0 word-guard hits, 0 fields replaced, 0 stats changed by balanceStats, 0 offline fallbacks.
- **Offline persona:** the same JSON every time for all 12 images (same process).
- **Names repeat without the taken list.** With `taken` empty, the same drawing got 1 to 4 different names over 5 runs ("Twinkle Zoom" 5 of 5, "Peachy Bloop" 7 of 10 crayon-blob calls). The server sends the room's names and the recent Hall of Fame to avoid this; that path was not measured here.
- **Limits:** 9 distinct drawings, none drawn by a child; one network and one evening; 5 runs per image.

## Per drawing

| Drawing | Group | Runs | Ability kinds | Same kind | Features | Eyes returned | drewEyes | Offline move | Median s |
|---|---|---|---|---|---|---|---|---|---|
| server/data/sprites/0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | scan | 5 | walk 5 | 5/5 | "big round tummy" | 5/5 | 5/5 | walk | 4.7 |
| server/data/sprites/5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | scan | 5 | walk 5 | 5/5 | "big round tummy", "chunky round tummy", "round chunky tummy" | 5/5 | 5/5 | walk | 4.8 |
| server/data/sprites/a0e17710-85ce-409a-9292-30784c95c477.png | scan | 5 | roll 5 | 5/5 | "big round body", "round ball body", "round bouncy body" | 0/5 | 0/5 | walk | 5.8 |
| packages/doodle-cutout/examples/crayon-blob-sprite.png | library | 5 | roll 5 | 5/5 | "round ball body" | 0/5 | 0/5 | walk | 4.2 |
| packages/doodle-cutout/examples/monster-sprite.png | library | 5 | walk 5 | 5/5 | "big round tummy", "round chunky tummy", "chunky round tummy" | 5/5 | 5/5 | walk | 5.7 |
| packages/doodle-cutout/examples/ruled-sprite.png | library | 5 | hop 5 | 5/5 | "long stick legs" | 5/5 | 5/5 | hop | 5.1 |
| tv/src/assets/art/dino.png | sample | 5 | walk 5 | 5/5 | "chunky blue tummy", "big round tummy" | 5/5 | 5/5 | walk | 4.2 |
| tv/src/assets/art/star.png | sample | 5 | roll 3, walk 2 | 3/5 | "pointy star body", "pointy star arms", "zoomy star body" | 5/5 | 5/5 | walk | 5.1 |
| tv/src/assets/art/hedgehog.png | sample | 5 | roll 5 | 5/5 | "round spiky body", "round sunny body" | 5/5 | 5/5 | walk | 4.2 |
| tv/src/assets/art/cloud.png | sample | 5 | fly 5 | 5/5 | "little white wings", "pointy little wings", "pointy wing", "pointy wings" | 5/5 | 5/5 | walk | 5.1 |
| tv/src/assets/art/frog.png | sample | 5 | hop 5 | 5/5 | "springy legs", "springy spring legs" | 5/5 | 5/5 | walk | 4.2 |
| tv/src/assets/art/potato.png | sample | 5 | walk 5 | 5/5 | "chunky potato tummy" | 5/5 | 5/5 | walk | 4.7 |

Same-drawing consistency: the most common kind covers 97% of runs on average; 11/12 drawings got one kind every run.

## Every call

| # | Drawing | Run | Source | ms | API ms | In | Out | $ | Name | Kind | Feature | Eyes | drewEyes | Guard | Fallbacks |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | 1 | claude | 8003 | 7965 | 2699 | 267 | 0.0161 | Bobble Pop | walk | big round tummy | 2 | true |  |  |
| 2 | 5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | 1 | claude | 5137 | 5115 | 2698 | 260 | 0.0160 | Boppy Antenna | walk | big round tummy | 2 | true |  |  |
| 3 | a0e17710-85ce-409a-9292-30784c95c477.png | 1 | claude | 5990 | 5983 | 2368 | 212 | 0.0137 | Peachy Bloop | roll | big round body | 0 | false |  |  |
| 4 | crayon-blob-sprite.png | 1 | claude | 5005 | 4991 | 2368 | 222 | 0.0139 | Peachy Bloop | roll | round ball body | 0 | false |  |  |
| 5 | monster-sprite.png | 1 | claude | 4664 | 4639 | 2699 | 261 | 0.0160 | Bloop Bobble | walk | big round tummy | 2 | true |  |  |
| 6 | ruled-sprite.png | 1 | claude | 4901 | 4873 | 2674 | 252 | 0.0157 | Noodle Toes | hop | long stick legs | 2 | true |  |  |
| 7 | dino.png | 1 | claude | 4141 | 4103 | 2631 | 250 | 0.0155 | Noodle Neck | walk | chunky blue tummy | 1 | true |  |  |
| 8 | star.png | 1 | claude | 5093 | 5076 | 2628 | 267 | 0.0159 | Twinkle Zoom | roll | pointy star body | 2 | true |  |  |
| 9 | hedgehog.png | 1 | claude | 5866 | 5848 | 2632 | 265 | 0.0158 | Sunny Pop | roll | round spiky body | 2 | true |  |  |
| 10 | cloud.png | 1 | claude | 5105 | 5076 | 2631 | 266 | 0.0158 | Captain Puffle | fly | little white wings | 2 | true |  |  |
| 11 | frog.png | 1 | claude | 4394 | 4375 | 2630 | 271 | 0.0159 | Boingo Pickle | hop | springy legs | 2 | true |  |  |
| 12 | potato.png | 1 | claude | 4715 | 4696 | 2629 | 277 | 0.0161 | Sir Spudsworth | walk | chunky potato tummy | 2 | true |  |  |
| 13 | 0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | 2 | claude | 4486 | 4459 | 2699 | 257 | 0.0159 | Bobble Bean | walk | big round tummy | 2 | true |  |  |
| 14 | 5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | 2 | claude | 4286 | 4261 | 2698 | 268 | 0.0162 | Bobble Pip | walk | chunky round tummy | 2 | true |  |  |
| 15 | a0e17710-85ce-409a-9292-30784c95c477.png | 2 | claude | 6677 | 6672 | 2368 | 221 | 0.0139 | Peachy Bloop | roll | round ball body | 0 | false |  |  |
| 16 | crayon-blob-sprite.png | 2 | claude | 4210 | 4197 | 2368 | 217 | 0.0138 | Peachy Bloop | roll | round ball body | 0 | false |  |  |
| 17 | monster-sprite.png | 2 | claude | 5662 | 5599 | 2699 | 270 | 0.0162 | Bobble Pop | walk | round chunky tummy | 2 | true |  |  |
| 18 | ruled-sprite.png | 2 | claude | 5089 | 5069 | 2674 | 248 | 0.0157 | Professor Pogo | hop | long stick legs | 2 | true |  |  |
| 19 | dino.png | 2 | claude | 4139 | 4120 | 2631 | 259 | 0.0157 | Captain Noodleneck | walk | chunky blue tummy | 1 | true |  |  |
| 20 | star.png | 2 | claude | 4983 | 4963 | 2628 | 267 | 0.0159 | Twinkle Zoom | roll | pointy star body | 2 | true |  |  |
| 21 | hedgehog.png | 2 | claude | 4192 | 4166 | 2632 | 274 | 0.0160 | Sunny Sizzle | roll | round spiky body | 2 | true |  |  |
| 22 | cloud.png | 2 | claude | 4137 | 4120 | 2631 | 267 | 0.0159 | Goggle Puff | fly | little white wings | 2 | true |  |  |
| 23 | frog.png | 2 | claude | 4122 | 4102 | 2630 | 266 | 0.0158 | Boingo Pickle | hop | springy legs | 2 | true |  |  |
| 24 | potato.png | 2 | claude | 4630 | 4610 | 2629 | 269 | 0.0159 | Sir Spudly | walk | chunky potato tummy | 2 | true |  |  |
| 25 | 0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | 3 | claude | 4666 | 4643 | 2699 | 269 | 0.0162 | Bobble Bop | walk | big round tummy | 2 | true |  |  |
| 26 | 5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | 3 | claude | 4823 | 4800 | 2698 | 262 | 0.0160 | Bloop Boppy | walk | round chunky tummy | 2 | true |  |  |
| 27 | a0e17710-85ce-409a-9292-30784c95c477.png | 3 | claude | 3955 | 3949 | 2368 | 210 | 0.0137 | Peachy Pop | roll | round ball body | 0 | false |  |  |
| 28 | crayon-blob-sprite.png | 3 | claude | 3670 | 3659 | 2368 | 224 | 0.0140 | Peachy Bloop | roll | round ball body | 0 | false |  |  |
| 29 | monster-sprite.png | 3 | claude | 4963 | 4931 | 2699 | 269 | 0.0162 | Bobble Pop | walk | chunky round tummy | 2 | true |  |  |
| 30 | ruled-sprite.png | 3 | claude | 4117 | 4090 | 2674 | 250 | 0.0157 | Noodle Pip | hop | long stick legs | 2 | true |  |  |
| 31 | dino.png | 3 | claude | 4199 | 4180 | 2631 | 256 | 0.0156 | Noodle Neck | walk | chunky blue tummy | 1 | true |  |  |
| 32 | star.png | 3 | claude | 5168 | 5146 | 2628 | 279 | 0.0161 | Twinkle Zoom | walk | pointy star arms | 2 | true |  |  |
| 33 | hedgehog.png | 3 | claude | 4135 | 4119 | 2632 | 263 | 0.0158 | Sunny Pop | roll | round spiky body | 2 | true |  |  |
| 34 | cloud.png | 3 | claude | 5568 | 5550 | 2631 | 270 | 0.0159 | Captain Puffle | fly | pointy little wings | 2 | true |  |  |
| 35 | frog.png | 3 | claude | 4180 | 4162 | 2630 | 268 | 0.0159 | Boingo Pickle | hop | springy legs | 2 | true |  |  |
| 36 | potato.png | 3 | claude | 4731 | 4712 | 2629 | 268 | 0.0159 | Sir Spudly | walk | chunky potato tummy | 2 | true |  |  |
| 37 | 0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | 4 | claude | 4187 | 4164 | 2699 | 258 | 0.0160 | Bobble Bop | walk | big round tummy | 2 | true |  |  |
| 38 | 5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | 4 | claude | 5167 | 5136 | 2698 | 263 | 0.0161 | Zippy Bloop | walk | chunky round tummy | 2 | true |  |  |
| 39 | a0e17710-85ce-409a-9292-30784c95c477.png | 4 | claude | 5766 | 5760 | 2368 | 210 | 0.0137 | Peachy Bloop | roll | big round body | 0 | false |  |  |
| 40 | crayon-blob-sprite.png | 4 | claude | 3950 | 3945 | 2368 | 221 | 0.0139 | Peachy Pip | roll | round ball body | 0 | false |  |  |
| 41 | monster-sprite.png | 4 | claude | 8323 | 8304 | 2699 | 262 | 0.0160 | Bobble Pop | walk | chunky round tummy | 2 | true |  |  |
| 42 | ruled-sprite.png | 4 | claude | 5532 | 5510 | 2674 | 260 | 0.0159 | Professor Pogo | hop | long stick legs | 2 | true |  |  |
| 43 | dino.png | 4 | claude | 4704 | 4682 | 2631 | 246 | 0.0154 | Noodle Neck | walk | big round tummy | 1 | true |  |  |
| 44 | star.png | 4 | claude | 5184 | 5167 | 2628 | 272 | 0.0160 | Twinkle Zoom | roll | zoomy star body | 2 | true |  |  |
| 45 | hedgehog.png | 4 | claude | 4169 | 4145 | 2632 | 261 | 0.0157 | Sunny Pop | roll | round sunny body | 2 | true |  |  |
| 46 | cloud.png | 4 | claude | 4561 | 4536 | 2631 | 269 | 0.0159 | Professor Puffle | fly | pointy wing | 2 | true |  |  |
| 47 | frog.png | 4 | claude | 4290 | 4258 | 2630 | 265 | 0.0158 | Boingo Pickle | hop | springy spring legs | 2 | true |  |  |
| 48 | potato.png | 4 | claude | 4935 | 4864 | 2629 | 268 | 0.0159 | Sir Spudly | walk | chunky potato tummy | 2 | true |  |  |
| 49 | 0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png | 5 | claude | 6808 | 6785 | 2699 | 269 | 0.0162 | Bloopy Boo | walk | big round tummy | 2 | true |  |  |
| 50 | 5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png | 5 | claude | 4266 | 4221 | 2698 | 262 | 0.0160 | Zippy Bloop | walk | big round tummy | 2 | true |  |  |
| 51 | a0e17710-85ce-409a-9292-30784c95c477.png | 5 | claude | 4985 | 4980 | 2368 | 219 | 0.0139 | Peachy Pop | roll | round bouncy body | 0 | false |  |  |
| 52 | crayon-blob-sprite.png | 5 | claude | 4296 | 4287 | 2368 | 222 | 0.0139 | Peachy Bloop | roll | round ball body | 0 | false |  |  |
| 53 | monster-sprite.png | 5 | claude | 6121 | 6098 | 2699 | 268 | 0.0162 | Bobble Pip | walk | big round tummy | 2 | true |  |  |
| 54 | ruled-sprite.png | 5 | claude | 5142 | 5122 | 2674 | 250 | 0.0157 | Noodle Toes | hop | long stick legs | 2 | true |  |  |
| 55 | dino.png | 5 | claude | 4194 | 4171 | 2631 | 247 | 0.0155 | Noodle Neck | walk | chunky blue tummy | 1 | true |  |  |
| 56 | star.png | 5 | claude | 4750 | 4685 | 2628 | 259 | 0.0157 | Twinkle Zoom | walk | pointy star arms | 2 | true |  |  |
| 57 | hedgehog.png | 5 | claude | 4116 | 4094 | 2632 | 258 | 0.0157 | Sunny Flapjack | roll | round sunny body | 2 | true |  |  |
| 58 | cloud.png | 5 | claude | 5854 | 5834 | 2631 | 266 | 0.0158 | Captain Puffle | fly | pointy wings | 2 | true |  |  |
| 59 | frog.png | 5 | claude | 4192 | 4170 | 2630 | 269 | 0.0159 | Boingo Sprout | hop | springy legs | 2 | true |  |  |
| 60 | potato.png | 5 | claude | 4812 | 4781 | 2629 | 273 | 0.0160 | Sir Spudley | walk | chunky potato tummy | 2 | true |  |  |
