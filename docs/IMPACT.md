# Sketchlings: launch memo

Sketchlings is for one household type: kids aged about 4 to 10, their siblings, and the adults on the couch with them. Today it runs on the Vega Virtual Device with a relay on a Mac. This memo is the plan for turning it into a Fire TV Appstore game: who it serves, what a creature costs, how it pays for itself, how it keeps kids safe, and what is still missing. Numbers are measured unless they say "estimate".

## What does a family need in the living room?

| | Today (hackathon build) | At launch (plan) |
|---|---|---|
| TV | Vega Virtual Device (no Fire TV hardware tested yet) | A Fire TV running Vega OS |
| Relay | A Mac on the same Wi-Fi running Bun, the Kokoro voice model and ffmpeg (`server/`) | Nothing at home: a cloud relay (below) |
| Phones | One phone or tablet browser per racer; nothing to install | Same |
| Without phones | Demo party: the remote plays one racer, the rest are bots | Same |

The game itself needs no account and no key: without a Claude key every creature gets an offline persona built from the drawing.

## Who it is for, and why they come back

- **Kids create, and can win.** Their drawing becomes the character, with a name, a voice and stats that match what they drew. What they draw changes how they play: wings fly over ink blots, wheels roll faster on flat ground, long legs jump higher, a big body ROARs the blots away. Little kids get a visible "+40% boost", big kids "+20%", and whoever falls behind gets a Doodle Boost.
- **Parents get screen time that starts with crayons.** Every round begins on paper. The race gets hands and voices going. No accounts, no ads, no chat.
- **Reasons to come back:** the household Hall of Fame keeps the newest 200 creatures with the artist's first name; **Race again** puts a saved creature back in the next race; every new drawing is a new character, and each creature keeps its voice.
- **Phone access.** Each racer joins from a browser by scanning the TV's QR code. A family with fewer phones than kids can take turns between parties, or play Demo party with the remote; two players on one phone isn't built. The tap pad counts every finger, so a small child can drum it with both hands. The race engine and the protocol already support a "hold to run" input (4 taps a second, for the littlest), but the phone controller doesn't send it yet (see the checklist).

## Evidence: family playtest

Playtest on Thursday 22 Oct. Kept as placeholders until it happens; never rounded up.

| Measure | Result |
|---|---|
| Players (first names or initials, ages) | TBD |
| Minutes played | TBD |
| Races played | TBD |
| Races won by the youngest player, with the boost | TBD |
| Did the youngest play without adult help? | TBD |
| Median time from snapping the photo to the creature on the TV | TBD |
| Persona source (Claude or offline) and median Claude time | TBD |
| Googly eyes placed correctly | TBD |
| Ability matched the drawn feature (wings, wheels, legs, big body) | TBD |
| Re-snaps needed | TBD |
| Unprompted "again!" requests | TBD |
| A kid's exact words | TBD |
| A parent's exact words | TBD |
| One design change the kids caused | TBD |

## Unit economics

**Cost per creature, measured.** One Claude call per drawing: over 11 real scans on 21 Oct (`claude-opus-5-5`, effort low), 2.4k to 2.7k tokens in and 210 to 255 out, so **about $0.015 per creature** at list price ($4 / $20 per million tokens). Latency: median about 4.3 s (3.7 to 5.3 s; the first, cold call 7.2 s). Voices are made locally with Kokoro-82M: about 4.3 s for a creature's three lines on an M5 MacBook, no fee.

| Family | AI creatures a month | Claude cost a month |
|---|---|---|
| Light | 10 | about $0.15 |
| Heavy | 40 | about $0.60 |

**Why not a one-time unlock.** A $4.99 lifetime unlock nets about $3.49 after the store's standard 30% share, which pays for about 230 AI creatures. A heavy family passes that in six months, and from then on every creature loses money.

**The price model: free game, plus a yearly Family Pass.**
- **Free:** the whole game with offline personas (name, title, stats, ability and voice made from the drawing's shape and colours, no AI). Its running cost is the relay, voices and storage only, about 2 cents a household a month at 10,000 households (estimate, below).
- **Family Pass, $4.99 a year,** bought through Amazon In-App Purchasing behind a parent gate: Claude personas for up to 200 creatures a year (about 4 a week). After that the game falls back to offline personas until renewal, or a grown-up buys **50 more for $1.99**.
- **Why it holds:** at full use the pass costs about $3.00 in Claude calls plus about $0.25 a year of infrastructure, under its $3.49 net. A light family (120 a year) costs about $2.05. The top-up nets about $1.39 against $0.75 of Claude calls.
- **Cost lever:** a smaller Claude model would cut the main cost. We haven't switched, because eye placement and ability quality would need re-checking.

## Launch architecture (plan, not built)

| Part | Today | At launch |
|---|---|---|
| Relay (rooms, WebSockets, uploads) | Bun process on a Mac | The same Bun relay in a container on **AWS Fargate** behind a load balancer. API Gateway WebSockets was the alternative, but it would mean rewriting room state into a database; Fargate runs the relay as it is. |
| Personas | Claude API, or offline | **Claude through Amazon Bedrock**, offline generator as fallback |
| Voices | Kokoro-82M + ffmpeg on the Mac | Kokoro-82M on CPU workers (Amazon Polly is the simpler alternative; estimate about $0.0024 a creature for three neural lines, more than Kokoro on CPU) |
| Sprites and voice clips | `server/data/` on the Mac | **S3 with a 24-hour lifetime**; the TV keeps its Hall of Fame copy |
| Finding the relay | `HOST = '10.0.2.2:8787'` hard-coded in `tv/src/config.ts` | The TV connects to the cloud relay's address; no Mac on the LAN |

**Monthly cost estimate.** Assumes 20 AI creatures per household a month (between light and heavy; to be replaced with playtest numbers), Bedrock at the same per-token price as the measured API, and approximate AWS list prices (Graviton Fargate about $0.032 per vCPU-hour and $0.0036 per GB-hour). Not measured: check before launch.

| Item | 1,000 households | 10,000 households |
|---|---|---|
| Claude personas (20,000 / 200,000 creatures at $0.015) | $300 | $3,000 |
| Relay: 2 / 4 Fargate tasks (0.5 vCPU, 1 GB), always on | about $30 | about $60 |
| Voices: Kokoro workers (1 vCPU, 2 GB), scaled for the evening peak | about $30 | about $90 |
| Load balancer for WebSockets | about $20 | about $30 |
| S3 storage, requests and data out | about $2 | about $15 |
| **Total** | **about $380 ($0.38 a household)** | **about $3,200 ($0.32 a household)** |

Claude is over 80% of the cost. Free households don't call Claude, so they cost only the infrastructure share.

## Kids' safety and privacy

**Correct privacy line (today):** With an API key, the cut-out drawing goes to Anthropic for the persona. With the HTTPS tunnel (`scripts/tunnel.sh`), phone traffic passes through Cloudflare. In offline mode nothing leaves the home network.

What that means in detail:
- **What leaves the phone:** the cut-out drawing (a PNG, at most 1024 px a side; the room photo never leaves the phone), a first name, an age band (little kid, big kid, grown-up) and race taps.
- **What goes to Claude:** the cut-out drawing, a short note of its shape and main colours, and the creature names already taken in the room, so names don't repeat. No child's name, age or taps.
- **The microphone** (only on an HTTPS page, only after a tap on "Enable shouting") is analysed on the phone for loudness. Nothing is recorded or sent except a "shout" event.

**Plan for launch (COPPA and the Appstore):**
- **Collect almost nothing.** A first name or nickname and an age band, no accounts, no persistent identifiers (a random player id per room, kept on the phone), no ads, no third-party analytics, no chat between players.
- **A grown-up consent step** on the TV before any drawing goes to Claude, behind a parent gate. Without consent the game runs on offline personas, and nothing leaves the home network.
- **Fire TV Appstore kids rules:** list in the kids and family category, support Amazon Kids profiles, a privacy policy, a parent gate on every purchase. We still have to check the current Appstore requirements for apps directed at children.
- **Delete early.** In the cloud version drawings and voice clips live in S3 for 24 hours, long enough for the TV to fetch them. The Hall of Fame lives on the Fire TV. A parent **Clear Hall of Fame** button deletes it.
- **Known risk: handwriting.** A child may write their full name on the drawing. It would be in the cut-out, sent to Claude (the prompt tells it to ignore any writing) and shown on the TV. Mitigations: "Don't write your name" on the draw screen, and blurring text on the phone before upload (not built).
- **Kind-only content.** The prompt allows only kind, playful text: never mock a drawing; nothing scary, violent, gross, sad or romantic; no weapons, real people, characters or brands. Every answer is checked against a schema and clamped. A refusal, timeout or bad answer gives the offline persona, built from curated word lists.
- **Room codes in the cloud.** A 4-letter code is guessable on a public server. The QR will carry a long random join token, the TV shows everyone who joins, and a grown-up can remove a player. Codes already avoid vowels, so they never spell words.

## Missing before launch

- [ ] Test on Fire TV hardware running Vega OS; soak the race start there (FRICTION_LOG.md #1), and move the race loop to vsync-aligned `requestAnimationFrame` if it is sane on hardware (#4).
- [ ] Cloud relay (above), with the TV connecting to it instead of `10.0.2.2`.
- [ ] Grown-up consent step and parent gate; Family Pass through Amazon In-App Purchasing.
- [ ] Privacy policy and a children's-privacy review.
- [ ] Parent "Clear Hall of Fame" button; long join tokens for cloud rooms.
- [ ] App icon in `tv/manifest.toml`.
- [ ] App lifecycle handling: hush audio and close the socket when the app goes to the background, reconnect when it comes back.
- [ ] "Hold to run" on the phone controller (the race engine already supports it).
- [ ] Voices in parallel: with six scans at once, the last creature's voice can take 30 to 40 s today.
- [ ] Creature voices and real mic shouting heard on a real Fire TV and real phones.
