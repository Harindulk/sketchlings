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

**Cost per creature, measured.** One Claude call per drawing: over 11 real scans on 21 Oct (`claude-opus-5-5`, effort low), 2.4k to 2.7k tokens in and 210 to 255 out, so **about $0.015 per creature** ($0.014 to $0.016) at the Claude API list price for Opus 5.5 ($4 / $20 per million input / output tokens, Oct 2026). Latency: median about 4.3 s (3.7 to 5.3 s; the first, cold call 7.2 s). Voices are made locally with Kokoro-82M: about 4.3 s for a creature's three lines on an M5 MacBook, no fee.

| Family | AI creatures a month | Claude cost a month |
|---|---|---|
| Light | 10 | about $0.15 |
| Heavy | 40 | about $0.60 |

**Why not a one-time unlock.** A $4.99 lifetime unlock nets about $3.49 after the store's standard 30% share, which pays for about 230 AI creatures. (A developer under $1 million a year is enrolled automatically in Amazon's Small Business Accelerator Program and gets 80/20 instead, about $3.99; the numbers here use the standard 70/30 to stay conservative.) A heavy family passes that in six months, and from then on every creature loses money.

**The price model: free game, plus a yearly Family Pass.**
- **Free:** the whole game with offline personas (name, title, stats, ability and voice made from the drawing's shape and colours, no AI). Its running cost is the relay, voices and storage only, about 2 cents a household a month at 10,000 households (estimate, below).
- **Family Pass, $4.99 a year,** bought through Amazon In-App Purchasing behind a parent gate: Claude personas for up to 200 creatures a year (about 4 a week). After that the game falls back to offline personas until renewal, or a grown-up buys **50 more for $1.99**.
- **Why it holds:** at full use the pass costs about $3.00 in Claude calls plus about $0.25 a year of infrastructure at 10,000 households, under its $3.49 net. A light family (120 a year) costs about $2.05. The top-up nets about $1.39 against $0.75 of Claude calls. At 1,000 households the infrastructure share is about $1.15 a year, so a pass used to its limit costs about $4.15 and loses money until there are more households (a light family still fits, at about $2.95). Estimate (list prices, Oct 2026).
- **Cost lever:** a smaller Claude model would cut the main cost (Claude Haiku 5.5 lists at $0.10 / $0.50 per million tokens for prompts up to 100K, a fortieth of Opus 5.5). We haven't switched, because eye placement and ability quality would need re-checking.

## Launch architecture (plan, not built)

| Part | Today | At launch |
|---|---|---|
| Relay (rooms, WebSockets, uploads) | Bun process on a Mac | The same Bun relay in a container on **AWS Fargate** behind a load balancer. API Gateway WebSockets was the alternative, but it would mean rewriting room state into a database; Fargate runs the relay as it is. |
| Personas | Claude API, or offline | **Claude through Amazon Bedrock**, offline generator as fallback |
| Voices | Kokoro-82M + ffmpeg on the Mac | Kokoro-82M on CPU workers (Amazon Polly is the simpler alternative: neural voices are $16 per million characters, so about $0.0024 a creature for three lines of about 150 characters, more than Kokoro on CPU) |
| Sprites and voice clips | `server/data/` on the Mac | **S3 with a 24-hour lifetime**; the TV keeps its Hall of Fame copy |
| Finding the relay | `HOST = '10.0.2.2:8787'` hard-coded in `tv/src/config.ts` | The TV connects to the cloud relay's address; no Mac on the LAN |

**Monthly cost estimate.** Assumes 20 AI creatures per household a month (between light and heavy; to be replaced with playtest numbers), Claude Opus 5.5 on Bedrock through global cross-region inference, which lists at the same $4 / $20 per million tokens as the Claude API (a regional endpoint costs 10% more, $4.40 / $22), and AWS list prices for US East (N. Virginia): Graviton Fargate $0.03238 per vCPU-hour and $0.00356 per GB-hour, an Application Load Balancer $0.0225 an hour plus $0.008 per capacity-unit-hour, public IPv4 addresses $0.005 an hour each, S3 $0.005 per 1,000 writes, and data out to the internet free for the first 100 GB a month, then $0.09 per GB. Estimate (list prices, Oct 2026), not measured: check before launch.

| Item | 1,000 households | 10,000 households |
|---|---|---|
| Claude personas (20,000 / 200,000 creatures at $0.015) | $300 | $3,000 |
| Relay: 2 / 4 Fargate tasks (0.5 vCPU, 1 GB), always on | about $30 | about $60 |
| Voices: Kokoro workers (1 vCPU, 2 GB), scaled for the evening peak | about $30 | about $90 |
| Load balancer for WebSockets, plus public IPv4 addresses (two for the load balancer, one per task) | about $35 | about $55 |
| S3 storage and requests (sprite and three clips per creature); data out stays under the free 100 GB | about $1 | about $5 |
| **Total** | **about $400 ($0.40 a household)** | **about $3,200 ($0.32 a household)** |

Claude is about three-quarters of the cost at 1,000 households and over 90% at 10,000. Free households don't call Claude, so they cost only the infrastructure share.

## Kids' safety and privacy

**Correct privacy line (today):** With an API key, the cut-out drawing goes to Anthropic for the persona. With the HTTPS tunnel (`scripts/tunnel.sh`), phone traffic passes through Cloudflare. In offline mode nothing leaves the home network.

What that means in detail:
- **What leaves the phone:** the cut-out drawing (a PNG, at most 1024 px a side; the room photo never leaves the phone), a first name, an age band (little kid, big kid, grown-up) and race taps.
- **What goes to Claude:** the cut-out drawing, a short note of its shape and main colours, and the creature names already taken in the room, so names don't repeat. No child's name, age or taps.
- **The microphone** (only on an HTTPS page, only after a tap on "Enable shouting") is analysed on the phone for loudness. Nothing is recorded or sent except a "shout" event.

**Plan for launch (COPPA and the Appstore):**
- **Collect almost nothing.** A first name or nickname and an age band, no accounts, no persistent identifiers (a random player id per room, kept on the phone), no ads, no third-party analytics, no chat between players.
- **A grown-up consent step** on the TV before any drawing goes to Claude, behind a parent gate. Without consent the game runs on offline personas, and nothing leaves the home network.
- **Fire TV Appstore kids plan:** list in the kids and family category, support Amazon Kids profiles, a privacy policy, a parent gate on every purchase. Amazon's Child-Directed App (COPPA) policy (checked Oct 2026) covers children under 13 (under 16 in the EU, Australia and Japan) and asks for age-appropriate content, COPPA compliance with verifiable parental consent before collecting a child's personal information, no Amazon Advertising or Associates, and only child-suitable SDKs. The category, Amazon Kids support and the parent gate are our own choices: we found no Appstore page that requires them.
- **Delete early.** In the cloud version drawings and voice clips are deleted by the relay itself as soon as the TV has fetched them (at most 24 hours later); an S3 lifecycle rule (whole-day granularity, asynchronous) is only the backstop. The Hall of Fame lives on the Fire TV. A parent **Clear Hall of Fame** button deletes it.
- **Known risk: handwriting.** A child may write their full name on the drawing. It would be in the cut-out, sent to Claude (the prompt tells it to ignore any writing) and shown on the TV. Mitigations: "Don't write your name" on the draw screen, and blurring text on the phone before upload (not built).
- **Kind-only content.** The prompt allows only kind, playful text: never mock a drawing; nothing scary, violent, gross, sad or romantic; no weapons, real people, characters or brands. Every answer is checked against a schema and clamped. A refusal, timeout or bad answer gives the offline persona, built from curated word lists.
- **Room codes in the cloud.** A 4-letter code is guessable on a public server. The QR will carry a long random join token, the TV shows everyone who joins, and a grown-up can remove a player. Codes already avoid vowels, so they never spell words.

## Missing before launch

- [ ] Test on Fire TV hardware running Vega OS; soak the race start there (FRICTION_LOG.md #1), and move the race loop to vsync-aligned `requestAnimationFrame` if it is sane on hardware (#4).
- [ ] Cloud relay (above), with the TV connecting to it instead of `10.0.2.2`.
- [ ] Grown-up consent step and parent gate; Family Pass through Amazon In-App Purchasing.
- [ ] Privacy policy and a children's-privacy review.
- [ ] Parent "Clear Hall of Fame" button; long join tokens for cloud rooms.
- [ ] "Hold to run" on the phone controller (the race engine already supports it).
- [ ] Voices in parallel: with six scans at once, the last creature's voice can take 30 to 40 s today.
- [ ] Creature voices and real mic shouting heard on a real Fire TV and real phones.
- [ ] User-generated content safeguards per the Appstore content policy: moderate each drawing before it is shown (Claude already describes it; add an explicit unsafe-content check), a way to report a creature, and a parent-only Hall of Fame delete.

## Sources (prices checked 21 Oct 2026)

- Measured tokens and latency: `notes/server.md` (11 real scans, 21 Oct 2026).
- Claude API prices (Opus 5.5 $4 / $20, Haiku 5.5 $0.10 / $0.50; regional Bedrock endpoints +10%): https://platform.claude.com/docs/en/about-claude/pricing
- Amazon Bedrock (Claude Opus 5.5: global $4 / $20, in-region $4.40 / $22 in us-east-1): https://aws.amazon.com/bedrock/pricing/ and the AWS Price List API (`AmazonBedrockFoundationModels`, us-east-1, published 12 Oct 2026)
- AWS Fargate (Graviton): https://aws.amazon.com/fargate/pricing/
- Elastic Load Balancing: https://aws.amazon.com/elasticloadbalancing/pricing/
- Public IPv4 addresses: https://aws.amazon.com/vpc/pricing/
- Amazon S3 and data transfer: https://aws.amazon.com/s3/pricing/
- Amazon Polly: https://aws.amazon.com/polly/pricing/
- Appstore revenue share (70/30 standard, 80/20 under $1 million a year): https://developer.amazon.com/docs/reports-promo/small-business-accelerator.html
- In-App Purchasing item types, annual subscriptions and price range: https://developer.amazon.com/docs/in-app-purchasing/iap-create-and-submit-iap-items.html
- Child-Directed App (COPPA) policy: https://developer.amazon.com/docs/policy-center/privacy-children.html
