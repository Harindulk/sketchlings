# Devpost gallery images

Eleven PNGs for the Devpost gallery, the YouTube thumbnail and the two GitHub social previews. Each one is an HTML page
in [`src/`](src) rendered at its exact size (deviceScaleFactor 1). Only real screenshots and recordings are used; the
TV's colours (`tv/src/theme.ts`) and fonts (Baloo 2, Patrick Hand, OFL, copied into `src/fonts/`).

| File | What it shows |
|---|---|
| `hero-1920x1080.png` | "Draw it. Snap it. Race it." with Captain Bleep's Reveal on the TV (VVD recording) and the phone race controller. |
| `flow-1920x1080.png` | The strip: paper photo, phone cut-out, TV Reveal, race. |
| `abilities-1920x1080.png` | "What you draw changes how you race": the four abilities with the TV's own icons, pop words and labels, plus real TV crops (Reveal ability sticker, WINGS!, BIG ROAR!). |
| `phone-1920x1080.png` | The phone: join with first name and age group, the creature card, the race controller. |
| `race-1920x1080.png` | A 6-lane race with the +40% / +20% age-boost badges and Doodle Boost, explained, plus the simulated fairness numbers. |
| `architecture-1920x1080.png` | Phone web app, Bun relay on a Mac, Vega TV app, Kokoro on the Mac, Claude in the cloud only with an API key; 149 tests. |
| `engineering-1920x1080.png` | "Vega Virtual Device observations": the two root-caused Vega bugs (watchdog deadlock, libW3CMedia crash), with 105 race starts and 42 Hall of Fame visits since the fixes, 0 frozen. |
| `privacy-1920x1080.png` | Only the cut-out leaves the phone, no accounts, the word guard, the grown-ups' AI switch (off at every launch, parent gate), and a plain-words footer. |
| `youtube-thumbnail-1280x720.png` | "Draw it. Race it! on the Fire TV" with Captain Bleep from the Reveal. |
| `social-sketchlings-1280x640.png` | GitHub preview for `Harindulk/sketchlings`. |
| `social-doodle-cutout-1280x640.png` | GitHub preview for `Harindulk/doodle-cutout`: photo to sticker, 42 tests, MIT. |

## Re-render

```sh
mkdir -p /tmp/gallery-render && cd /tmp/gallery-render
npm init -y && npm i playwright-core && npx playwright-core install chromium-headless-shell
cp <repo>/docs/gallery/src/render.mjs . && GALLERY=<repo>/docs/gallery node render.mjs
```

`render.mjs` launches chromium-headless-shell once, renders every `src/<name>-<W>x<H>.html` to `<name>-<W>x<H>.png`
and reports broken images. Never point it at the Google Chrome app (it leaks a 1.4 GB temp clone per launch on this Mac).
The pages load screenshots straight from the repo (`notes/shots`, `phone/docs/screens`, `tv/src/assets/art`,
`packages/doodle-cutout/examples`) through relative paths, so keep `src/` where it is.

## Pictures and where they come from

- **`src/img/vvd-reveal-captain-bleep.png`**: one frame (7.5 s) of a VVD screen recording,
  a recording of the TV app on the Vega Virtual Device. That file is not in git. Captain Bleep is a real
  `source: "claude"` persona; "Drawn by Leo" is a simulated player.
- **TV screenshots**: `notes/shots/04k-race-callout-pills-6-lanes.png` (race, flow) and `04h-race-roar-big-roar-springs.png` (BIG ROAR! crop). Both from the VVD, Demo party.
- **Phone screenshots**: `phone/docs/screens/00-join.jpg`, `03-preview.jpg`, `05-card-real-server.jpg`, `06-race.jpg`. The phone app was run in a desktop browser at phone size (README, Known limits), and the image says so.
- **The paper photo** (`packages/doodle-cutout/examples/monster-photo.png`) is **synthetic**: drawn by `packages/doodle-cutout/scripts/photos.ts`. Both images that show it label it "a synthetic test photo".
- **Icons**: `tv/src/assets/art/ab_fly.png`, `ab_roll.png`, `ab_hop.png`, `ab_walk.png`, `icon_phone.png`, `icon_crayon.png`, `icon_trophy.png`, `star.png`.

## Facts and numbers, with sources

| Fact | Source |
|---|---|
| Abilities: wings, wheels, long legs, a big body; WINGS!, WHEELS!, SPRINGS!, BIG ROAR!; "Flies over ink blots!", "Zooms fast on flat ground!", "Jumps extra high and far!", "ROAR knocks back ink blots!" | `tv/src/game/ability.ts` (`ABILITY`, `ABILITY_TIP`) |
| Age boost = a speed multiplier, little 1.4, big 1.2, grown-up 1.0, shown as "+40% boost" / "+20% boost" | `shared/protocol.ts` (`AGE_BOOST`), `tv/src/game/race.ts` (`r.age` in the speed) |
| Age groups: Little kid up to 7, Big kid 8 to 12, Grown-up 13 and up | `phone/src/main.ts`, `shared/protocol.ts` |
| Doodle Boost: more than 150 dp behind the leader, up to +70% | `tv/src/game/race.ts` (`DOODLE_BOOST_GAP`, `Math.min(0.7, ...)`), `docs/FAIRNESS.md` |
| Simulated, not playtested: a little kid beats a trying grown-up in 27% of races with the boost, 0.4% without | `docs/FAIRNESS.md` Results table (rerun 23 Oct after the fly change); `README.md` rounds it to "about 1 race in 4" and "fewer than 1 in 100" |
| Architecture: phone web app (Vite + TypeScript), Bun relay on a Mac (HTTP + WebSocket), Vega TV app (React Native for Vega, SDK 0.24), Kokoro-82M + ffmpeg on the Mac, Claude only with an API key, `shared/protocol.ts` | `README.md` (Architecture) |
| 665 ms to first frame, cool start, measured on the Vega Virtual Device | `README.md` KPI table (mean of 10 runs, 21 Oct) |
| Claude: median 4.7 s, about $0.016 a creature, 60 calls (`claude-opus-5-5`), timed on the Mac relay | `notes/bench-persona.md` (median $0.0159), `README.md` |
| Voices: 4-7 s per creature on an M5 MacBook | `README.md` (speed table), `server/README.md` (Voices, Speed) |
| 149 tests: 79 relay, 42 doodle-cutout, 20 TV, 8 phone | `README.md` (Tests, run on 23 Oct); recounted in `server/test`, `packages/doodle-cutout/test`, `tv/test`, `phone/test` at 5d6086e |
| Race-start freeze: about 1 start in 4 froze on "3", AppNotResponding; JS thread blocked in `send()` while holding the watchdog loop's mutex; 6 lanes: about 66 blot images, 3 of 7 froze; fix; 105 race starts since the last fix, 0 freezes, 70 of them with race audio | `FRICTION_LOG.md` #1 (soak table), `README.md` |
| Hall of Fame form of the same deadlock: 42 visits since its fix, 0 frozen (2 of 13 before) | `FRICTION_LOG.md` #1, `README.md` KPI table |
| Media crash: SIGSEGV in libW3CMedia, a new MediaSource per clip, five crash reports with the same 6-frame stack, one long-lived source, 0 crashes over 168 Reveal/Results screens (73 on 21 Oct, 95 on 23 Oct), 5 crashes in 216 clips on the old code | `FRICTION_LOG.md` #5, `README.md` |
| Only the cut-out leaves the phone (Web Worker cutout, PNG at most 1024 px) | `phone/src/scan.ts`, `README.md` (Privacy) |
| The mic is read for loudness only, on the phone | `phone/src/controller.ts` (RMS of the analyser) |
| No accounts, ads, purchases or chat; first name and age group | `README.md` (Privacy), phone join screen |
| Room codes have no vowels | `server/src/rooms.ts` |
| Word guard on every line Claude writes, a hit swaps in the offline lines; first names checked too | `server/src/persona.ts` (`UNSAFE_WORDS`, `BRANDS`, `UNSAFE_NAME`), `server/src/rooms.ts` (`cleanName`) |
| AI switch: off at every launch until a grown-up turns it on behind a parent gate; `aiPersonas: false` means no drawing from the room goes to Claude | `README.md` (Privacy), `tv/src/screens/GrownUps.tsx`, `server/src/rooms.ts`, `server/src/server.ts` |
| With an API key and AI on the cut-out goes to Anthropic; the HTTPS tunnel goes through Cloudflare; with AI off and no tunnel, nothing leaves the home network | `README.md` (Privacy) |
| doodle-cutout: zero dependencies, TypeScript, browser / Web Worker / Node / Bun, MIT, 42 tests (0.2.0; the separate repo is synced) | `packages/doodle-cutout/README.md` |

## Where the docs disagree

- **Fairness:** the final `docs/FAIRNESS.md` table (rerun 23 Oct) says 27% with the boost and 0.4% without; its 22 Oct correction paragraph still says 0.6%. The image uses the table.
- **Race-start freezes:** 105 starts since the last fix, 0 frozen, but 1 in 209 across every fixed build since 21 Oct (an interim build, a Reveal voice in the countdown). The image says "since the last fix", as the docs do.

## Claims left out

- The phone card's ability line ("I saw ... → ...") is in `phone/src/main.ts`, but no screenshot shows it, so the phone image shows the card as screenshotted.
- Clear Hall of Fame (in `GrownUps.tsx`, committed) is not shown: no screenshot of the Grown-ups screen.
- The TV's "Running on Fire TV · Vega OS" badge wording: only the Vega Virtual Device has been tested.
- The 6-lane freeze is not shown as a separate bug: `FRICTION_LOG.md` documents it as the same root cause as #1. The Hall of Fame freeze is one line under the race-start freeze for the same reason.

## Not sure

- The hero, thumbnail and social card say "on the Fire TV" as the pitch (as the README does); every screenshot caption says Vega Virtual Device.
- The Captain Bleep frame comes from a video that is not in git.
