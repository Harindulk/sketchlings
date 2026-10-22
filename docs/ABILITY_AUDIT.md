# Ability audit: does the ability match what was drawn?

**Reviewed by an AI assistant (Claude), not by children or a human panel.** The verdicts below are one AI reviewer's judgement. Re-check them by hand: open each image and compare it with the row.

**No child's drawing is in this set.** The repo has no cut-out of a real child's drawing yet. These are the 12 images the persona benchmark used: 3 phone cut-outs of synthetic test photos, 3 doodle-cutout example cut-outs and the 6 TV demo drawings. They are 9 different drawings, because the monster appears as 3 cut-outs and the crayon blob as 2. The provenance of each image is in `notes/bench-persona.md`.

## How it was checked

- **Abilities:** 5 real Claude calls per image (`claude-opus-5-5`, effort low) through `generatePersona` in `server/src/persona.ts`, 22 Oct 2026. That is 60 calls in all. Raw results are in `notes/bench-persona.md`.
- **The rule each verdict is checked against** is the one in the persona prompt:
  - **fly:** wings;
  - **roll:** wheels, or a round ball-like body without legs;
  - **hop:** long legs, springy feet or a springy tail;
  - **walk:** a big, chunky or strong body, or nothing above stands out.

  The feature must be "really in the drawing".
- **Verdicts:**
  - **reasonable:** the kind follows from the rule and the feature is visible;
  - **debatable:** a fair reader could pick another kind, or the runs disagree;
  - **wrong:** the kind or the feature does not match the drawing.
- **The feature column** counts the wordings over the 5 runs.

## Results

| Drawing | What Claude said it saw (feature) | Ability across runs | Verdict | Why |
|---|---|---|---|---|
| `server/data/sprites/0c84fa1d-36f4-44a4-a2b2-e3cbc8d4f54d.png` (phone cut-out of the sample monster) | "big round tummy" x5 | walk 5/5 | reasonable | The body is a big round blob, and the legs are short sticks. "Big, chunky body" fits. The raised stick arms were never read as wings. |
| `server/data/sprites/5bca6bb8-2a12-4fb9-ab24-e9bcf581a400.png` (older phone cut-out, same monster) | "big round tummy" x2, "chunky round tummy" x2, "round chunky tummy" x1 | walk 5/5 | reasonable | Same drawing, same answer. The older cut-out made no difference. |
| `packages/doodle-cutout/examples/monster-sprite.png` (library cut-out, same monster) | "big round tummy" x2, "chunky round tummy" x2, "round chunky tummy" x1 | walk 5/5 | reasonable | Same as above. 3 cut-outs, 15 of 15 walk. |
| `server/data/sprites/a0e17710-85ce-409a-9292-30784c95c477.png` (phone cut-out of the crayon blob) | "round ball body" x2, "big round body" x2, "round bouncy body" x1 | roll 5/5 | reasonable | A plain oval with no legs is the prompt's "round ball-like body without legs". It returned no eyes, which is right: the orange patch is not an eye. It is hardly a creature, so a child might have meant something else. "Bouncy" hints at hop, but the kind stayed roll. |
| `packages/doodle-cutout/examples/crayon-blob-sprite.png` (library cut-out, same blob) | "round ball body" x5 | roll 5/5 | reasonable | Same drawing, same answer. 2 cut-outs, 10 of 10 roll. |
| `packages/doodle-cutout/examples/ruled-sprite.png` (stick creature on lined paper) | "long stick legs" x5 | hop 5/5 | reasonable | The legs are longer than the body. This is the clearest "long legs" case in the set. |
| `tv/src/assets/art/dino.png` | "chunky blue tummy" x4, "big round tummy" x1 | walk 5/5 | reasonable | It has a big body with a drawn belly patch and short legs. The long neck, back spikes and tail match no kind, so walk is the rule's default. The dino is drawn side-on, so 1 eye was returned every time, which is correct. |
| `tv/src/assets/art/star.png` | "pointy star body" x2, "pointy star arms" x2, "zoomy star body" x1 | roll 3/5, walk 2/5 | **debatable** | **The only image that changed kind between runs.** A star is not round, has no wheels and has no chunky body. The speed lines make "zooms on flat ground" (roll) a fair reading. "Pointy star arms" does not earn a ROAR. A child who drew a shooting star might expect fly. Re-scanning this drawing can change the ability. |
| `tv/src/assets/art/hedgehog.png` | "round spiky body" x3, "round sunny body" x2 | roll 5/5 | reasonable | A round face inside a ring of spikes, with no legs, is a round body without legs. The file is called hedgehog, but Claude read it as a sun ("Sunny ..." names), which is what it looks like. The ability is the same either way. |
| `tv/src/assets/art/cloud.png` | "little white wings" x2, "pointy little wings" x1, "pointy wing" x1, "pointy wings" x1 | fly 5/5 | reasonable | One white pointed wing is drawn on the side. It also has small legs and a beak, and Claude picked the wing every time. Minor: 4 of 5 runs say "wings", but only one wing is clearly drawn. |
| `tv/src/assets/art/frog.png` | "springy legs" x4, "springy spring legs" x1 | hop 5/5 | reasonable | The legs are drawn as coil springs, the textbook case for hop. |
| `tv/src/assets/art/potato.png` | "chunky potato tummy" x5 | walk 5/5 | reasonable | A big potato body on short legs. It holds up a stick that looks like a toy sword. That was never mentioned, so the word guard had nothing to catch. |

**Totals:**
- By image: 11 reasonable, 1 debatable (the star), 0 wrong.
- By call: 60 of 60 calls answered by Claude. There were no offline fallbacks, no word-guard hits and no schema fallbacks.

## Open questions this set can and cannot answer

- **Arms read as wings:** not seen. The monster (3 cut-outs), the stick creature, the potato and the frog all have raised or side stick arms, and 0 of 30 calls chose fly. The star's points were never read as wings either (0 of 5).
- **Several features in one drawing:**
  - cloud (wing, legs, beak): fly 5/5;
  - frog (spring legs, arms): hop 5/5;
  - potato (arms, legs, cape, stick): walk 5/5;
  - dino (neck, spikes, tail, legs): walk 5/5.

  Claude picked the same feature each time.
- **Thin wings lost in the cut-out:** untested. No image in the set has thin wings.
- **Wheels together with long legs:** untested. No image has wheels.
- **Eye positions:** whether the returned eyes sit on the drawn eyes was not checked.
- **Real children's drawings:** untested. This is the biggest gap. Scan real drawings and re-run `server/scripts/bench-persona.ts`, then repeat this audit on them.
- **Letting the child correct the ability on the phone:** not covered here.
