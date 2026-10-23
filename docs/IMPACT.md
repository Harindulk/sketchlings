# Sketchlings: launch memo

Sketchlings is for one household type: kids aged about 4 to 10, their siblings, and the adults on the couch with them. Today it runs on the Vega Virtual Device with a relay on a Mac. This memo is the plan for turning it into a Fire TV Appstore game: who it serves, what a creature costs, how it pays for itself, how it keeps kids safe, and what is still missing. Numbers are measured unless they say "estimate". No Fire TV hardware performance has been measured: the app timings in the README are engineering observations on the Vega Virtual Device, which Amazon's docs list as "Not supported for performance testing".

## What does a family need in the living room?

| | Today (hackathon build) | At launch (plan) |
|---|---|---|
| TV | Vega Virtual Device (no Fire TV hardware tested yet) | A Fire TV running Vega OS |
| Relay | A Mac on the same Wi-Fi running Bun, the Kokoro voice model and ffmpeg (`server/`) | Nothing at home: a cloud relay (below) |
| Phones | One phone or tablet browser per racer; nothing to install | Same |
| Without phones | Demo party: the remote plays one racer, the rest are bots | Same |

The game itself needs no account and no key: without a Claude key every creature gets an offline persona built from the drawing.

## Who it is for, and why they come back

- **Kids create, and race older siblings with a visible boost** (its effect is simulated, not yet playtested; see below). Their drawing becomes the character, with a name, a voice and stats that match what they drew. What they draw changes how they play: wings fly over ink blots, wheels roll faster on flat ground, long legs jump higher, a big body ROARs the blots away. Little kids get a visible "+40% boost", big kids "+20%", and whoever falls behind gets a Doodle Boost.
- **Parents get screen time that starts with crayons.** Every round begins on paper. The race gets hands and voices going. No accounts, no ads, no chat.
- **Reasons to come back:** the household Hall of Fame keeps the newest 200 creatures with the artist's first name; **Race again** puts a saved creature back in the next race; every new drawing is a new character, and each creature keeps its voice.
- **Phone access.** Each racer joins from a browser by scanning the TV's QR code. A family with fewer phones than kids can take turns between parties, or play Demo party with the remote; two players on one phone isn't built. The tap pad counts every finger, so a small child can drum it with both hands, and a child who can't tap fast can hold a finger down: the race counts a hold as 4 taps a second, the faster of the two when they also tap.

## Evidence: a children's session and a cold test

Plan from the evening of 22 Oct: 3 or 4 children aged 4 to 10 play on 23 Oct, about 1 to 3 pm, run by teachers, each with a parent's written OK; the camera films hands, phones, paper and the screen, and a face or voice only where a parent ticked it ([`playtest/runsheet.md`](playtest/runsheet.md), [`playtest/consent.md`](playtest/consent.md)). First the teachers do the adult cold test ([`playtest/cold-test.md`](playtest/cold-test.md)).

No children's playtest or cold test has run yet; results will be added here, and the kit is in [docs/playtest/](playtest/).

Not tested yet, because no child has played: races won by the youngest, whether a little kid can play without help, and kids' reactions. The cold test runs on the Vega Virtual Device on a laptop, with the keyboard as the remote, so it says nothing about race smoothness or speed.

**Fairness, simulated, not playtested** ([FAIRNESS.md](FAIRNESS.md)): the real race engine with assumed tap rates, 2,000 races per row (rerun 23 Oct). A little kid beats a grown-up who is trying in about 1 race in 4 with the +40% boost (27%), and in fewer than 1 in 100 without it (0.4%). In a family of four the youngest wins 11.7% (a fair share is 25%) and grown-ups still win 61%. The result depends most on how fast little kids really tap; since 23 Oct the relay logs every player's real rate per race, so the first real party measures it. The age boost stays at 1.4 until then.

## Unit economics

**Cost per creature, measured.** One Claude call per drawing: 60 calls on 22 Oct (`claude-opus-5-5`, effort low; 12 test images of 9 drawings, none by a child; `notes/bench-persona.md`), 2.4k to 2.7k tokens in and 210 to 280 out, so **about $0.016 per creature** (median $0.0159, $0.014 to $0.016) at the Claude API list price for Opus 5.5 ($4 / $20 per million input / output tokens, Oct 2026). The benchmark sent no taken names. Four live calls on 23 Oct (fake phones), which send the room's names and recent Hall of Fame names, took 2,649-3,424 tokens in and cost $0.015-0.019. Latency: median 4.7 s (3.7 to 8.3 s, p90 5.9 s; the first call 8.0 s). Voices are made locally with Kokoro-82M on the home relay (a Mac today), not on the TV and not in the cloud; the TV only plays the clips. A creature's three lines take 4-7 s on an M5 MacBook, no fee.

| Family | AI creatures a month | Claude cost a month |
|---|---|---|
| Light | 10 | about $0.16 |
| Heavy | 40 | about $0.64 |

**Why not a one-time unlock.** A $4.99 lifetime unlock nets about $3.49 after the store's standard 30% share, which pays for about 220 AI creatures. (A developer under $1 million a year is enrolled automatically in Amazon's Small Business Accelerator Program and gets 80/20 instead, about $3.99; the numbers here use the standard 70/30 to stay conservative.) A heavy family passes that in under six months, and from then on every creature loses money.

**The price model: free game, plus a yearly Family Pass.**
- **Free:** the whole game with offline personas (name, title, stats, ability and voice made from the drawing's shape and colours, no AI). Its running cost is the relay, voices and storage only, about 2 cents a household a month at 10,000 households (estimate, below).
- **Family Pass, $4.99 a year,** bought through Amazon In-App Purchasing behind a parent gate: Claude personas for up to 200 creatures a year (about 4 a week). After that the game falls back to offline personas until renewal, or a grown-up buys **50 more for $1.99**.
- **What the Pass adds over the free game.** Claude reads the drawing itself: the name, personality and lines are about what was drawn, the googly eyes land on the drawn eyes, and the ability comes from a feature it can see ("big wings", "springy legs"). The free offline persona works from the silhouette and colours: names from word lists, the ability from the shape, and eyes only when its eye finder sees a clear pair of dots. Both play the same game.
- **What one Pass costs:** at full use about $3.18 in Claude calls plus about $0.25 a year of infrastructure at 10,000 households, so about $3.43 against its $3.49 net: break-even, not a profit. A light family (120 a year) costs about $2.16. The top-up nets about $1.39 against $0.80 of Claude calls. At 1,000 households the infrastructure share is about $1.15 a year, so a Pass used to its limit costs **$4.33 in total, a loss of about $0.84** (a light family still fits, at about $3.06). Estimate (list prices, Oct 2026).

**Free households have to be carried.** Each free household costs about $0.25 a year at 10,000 households, and the Passes pay for them. Gain or loss per paying household a year, at 10,000 households, by the share of households that buy a Pass (estimate):

| Households that pay | Pass used to its cap (200 a year) | Light use (120 a year) |
|---|---|---|
| All of them | +$0.06 | +$1.33 |
| 1 in 5 | -$0.94 | +$0.33 |
| 1 in 10 | -$2.19 | -$0.92 |
| 1 in 20 | -$4.69 | -$3.42 |

How it is worked out: $3.49 net, minus Claude ($0.0159 a creature), minus $0.25 for the payer's own household and for each free household it carries. Full use breaks even only if about 4 in 5 households pay; light use at about 1 in 6. At 1,000 households every row is worse by about $0.90 per household carried. So at a normal paying share the plan as priced loses money, and it needs a lever:

| Lever, at 1 in 10 paying and full use | Gain or loss per paying household a year |
|---|---|
| As above | -$2.19 |
| Claude Haiku 5.5 instead of Opus 5.5 (a fortieth of the price; eye and ability quality not checked) | about +$0.91 |
| A $9.99-a-year Pass ($6.99 net at 70/30) | about +$1.31 |
| The 80/20 share for small developers ($3.99 net) | about -$1.69 |

Claude Haiku 5.5 lists at $0.10 / $0.50 per million tokens for prompts up to 100K. We haven't switched, because eye placement and ability quality would need re-checking.

## Launch architecture (plan, not built)

| Part | Today | At launch |
|---|---|---|
| Relay (rooms, WebSockets, uploads) | Bun process on a Mac | The same Bun relay in a container on **AWS Fargate** behind a load balancer. API Gateway WebSockets was the alternative, but it would mean rewriting room state into a database; Fargate runs the relay as it is. |
| Personas | Claude API, or offline | **Claude through Amazon Bedrock**, offline generator as fallback |
| Voices | Kokoro-82M + ffmpeg on the Mac | Kokoro-82M on CPU workers (Amazon Polly is the simpler alternative: neural voices are $16 per million characters, so about $0.0024 a creature for three lines of about 150 characters, more than Kokoro on CPU) |
| Sprites and voice clips | `server/data/` on the Mac (the Hall of Fame lives there too; the TV stores nothing) | **S3 with a 24-hour lifetime**; the Hall of Fame moves to the Fire TV |
| Finding the relay | `HOST = '10.0.2.2:8787'` hard-coded in `tv/src/config.ts` | The TV connects to the cloud relay's address; no Mac on the LAN |

**Monthly cost estimate.** Assumes 20 AI creatures per household a month (between light and heavy; to be replaced with real usage numbers), Claude Opus 5.5 on Bedrock through global cross-region inference, which lists at the same $4 / $20 per million tokens as the Claude API (a regional endpoint costs 10% more, $4.40 / $22), and AWS list prices for US East (N. Virginia): Graviton Fargate $0.03238 per vCPU-hour and $0.00356 per GB-hour, an Application Load Balancer $0.0225 an hour plus $0.008 per capacity-unit-hour, public IPv4 addresses $0.005 an hour each, S3 $0.005 per 1,000 writes, and data out to the internet free for the first 100 GB a month, then $0.09 per GB. Estimate (list prices, Oct 2026), not measured: check before launch.

| Item | 1,000 households | 10,000 households |
|---|---|---|
| Claude personas (20,000 / 200,000 creatures at $0.0159) | about $320 | about $3,180 |
| Relay: 2 / 4 Fargate tasks (0.5 vCPU, 1 GB), always on | about $30 | about $60 |
| Voices: Kokoro workers (1 vCPU, 2 GB), scaled for the evening peak | about $30 | about $90 |
| Load balancer for WebSockets, plus public IPv4 addresses (two for the load balancer, one per task) | about $35 | about $55 |
| S3 storage and requests (sprite and three clips per creature); data out stays under the free 100 GB | about $1 | about $5 |
| **Total** | **about $410 ($0.41 a household)** | **about $3,390 ($0.34 a household)** |

Claude is about three-quarters of the cost at 1,000 households (77%) and over 90% at 10,000 (94%). Free households don't call Claude, so they cost only the infrastructure share.

## Kids' safety and privacy

**Correct privacy line (today):** With AI personas on and an API key set, the cut-out drawing goes to Anthropic for the persona. With the HTTPS tunnel (`scripts/tunnel.sh`), phone traffic passes through Cloudflare. With AI personas off and no tunnel, or in offline mode, nothing leaves the home network.

What that means in detail:
- **What leaves the phone:** of the photo, only the cut-out (a PNG, at most 1024 px a side): it keeps the drawing's pixels, and everything outside the drawing is transparent. Also a first name, an age band (little kid, big kid, grown-up) and race inputs.
- **What goes to Claude:** the cut-out drawing, a short note of its shape and main colours, and the creature names already taken in the room, so names don't repeat. No child's name, age or taps.
- **The microphone** (only on an HTTPS page, only after a tap on "Enable shouting") is analysed on the phone for loudness. Nothing is recorded or sent except a "shout" event.

**Built on 23 Oct:**
- **A parent gate and a Grown-ups screen** on the TV: a times-table question with four number buttons, focus on a wrong answer. Inside: the **AI personas** switch, off at every launch, and **Clear Hall of Fame**, which asks first and deletes every creature, picture and voice clip on the relay. AI personas off stops the Claude call only: the drawing still goes to the relay on the home network, gets an offline persona and is kept in the Hall of Fame until it is cleared.
- **Removing one child or one creature** works on the relay (`removePlayer`, `deleteCreature`), without a TV button yet.
- **Over the public tunnel** the relay serves no Hall of Fame and no voice clips, only live rooms' pictures, and refuses the TV's own messages.
- **Typed names** keep the first word, letters only, at most 12, and pass the word guard (without the brands); anything unusable becomes "Artist".

**Plan for launch (COPPA and the Appstore):**
- **Collect almost nothing.** A first name or nickname and an age band, no accounts, no persistent identifiers (a random player id per room, kept on the phone), no ads, no third-party analytics, no chat between players.
- **A grown-up consent step** on the TV before any drawing goes to Claude, behind a parent gate (built: the AI personas switch above). Without consent the game runs on offline personas, and no drawing goes to Claude. At launch the choice should be remembered per household, with a clear "on" badge.
- **Fire TV Appstore kids plan:** list in the kids and family category, support Amazon Kids profiles, a privacy policy, a parent gate on every purchase. Amazon's Child-Directed App (COPPA) policy (checked Oct 2026) covers children under 13 (under 16 in the EU, Australia and Japan) and asks for age-appropriate content, COPPA compliance with verifiable parental consent before collecting a child's personal information, no Amazon Advertising or Associates, and only child-suitable SDKs. The category, Amazon Kids support and the parent gate are our own choices: we found no Appstore page that requires them.
- **Delete early.** In the cloud version drawings and voice clips are deleted by the relay itself as soon as the TV has fetched them (at most 24 hours later); an S3 lifecycle rule (whole-day granularity, asynchronous) is only the backstop. At launch the Hall of Fame would live on the Fire TV; today it lives on the Mac relay. The parent **Clear Hall of Fame** button deletes it.
- **Known risk: handwriting.** A child may write their full name on the drawing. It would be in the cut-out, sent to Claude (the prompt tells it to ignore any writing) and shown on the TV. Mitigations: the draw screen says "no names on the paper!" (built), and blurring text on the phone before upload (not built).
- **Kind-only content.** The prompt allows only kind, playful text: never mock a drawing; nothing scary, violent, gross, sad or romantic; no weapons, real people, characters or brands. Every answer is checked against a schema and clamped. A refusal, timeout or bad answer gives the offline persona, built from curated word lists. **Built:** a word guard (`server/src/persona.ts`) checks every line Claude writes (name, title, personality, catchphrase, intro, win line, ability) against a short list of whole words in six groups: violence and death, weapons, sexual words, drugs and alcohol, insults and body-shaming, real brands and characters. A hit in the six text lines swaps all six for the offline version, so the name and lines still match, and logs one line. It is a backstop, not moderation: a fixed English list misses misspellings and other languages. Typed player names pass the same list, minus the brands.
- **Room codes in the cloud.** A 4-letter code is guessable on a public server. The QR will carry a long random join token, the TV shows everyone who joins, and a grown-up can remove a player. Codes already avoid vowels, so they never spell words.

## Missing before launch

- [ ] Test on Fire TV hardware running Vega OS and measure performance there (the VVD numbers are not hardware performance); soak the race start there (FRICTION_LOG.md #1), and move the race loop to vsync-aligned `requestAnimationFrame` if it is sane on hardware (#4).
- [ ] Cloud relay (above), with the TV connecting to it instead of `10.0.2.2`.
- [x] Parent gate and a grown-up AI personas switch on the TV (off at every launch; remembering it needs storage that works on Vega, FRICTION_LOG.md #25).
- [ ] Family Pass through Amazon In-App Purchasing (`@amazon-devices/keplerscript-appstore-iap-lib`, which the Vega docs say can be tested on the device and the VVD), and a price that covers the free households (see "Free households have to be carried").
- [ ] Privacy policy and a children's-privacy review.
- [x] Parent "Clear Hall of Fame" button behind the parent gate.
- [ ] TV buttons to remove one child or one creature (the relay supports both); long join tokens for cloud rooms.
- [ ] A playtest with children aged 4 to 10, counting little kids' real taps a second before tuning the age boost ([FAIRNESS.md](FAIRNESS.md)).
- [x] "Hold to run" on the phone controller.
- [x] Intros first: with several scans at once, every creature's intro is voiced before anyone's other lines (six at once: intros within about 16 s, everything within about 28 s, 23 Oct).
- [ ] Voices in parallel, so six scans at once take less than 28 s.
- [x] Reveal voices in step with their cards (`258959b`; on the VVD intros start 1.1-1.4 s into their card; before, 3.6-6 s late).
- [ ] Creature voices and real mic shouting heard on a real Fire TV and real phones.
- [x] A word guard on every line Claude writes and on typed first names (a backstop only; "Kind-only content" above says what it misses).
- [ ] User-generated content safeguards per the Appstore content policy: moderate each drawing before it is shown (Claude already describes it, and its text passes the word guard, but the drawing itself is not checked; add an explicit unsafe-content check), a moderation check for typed player names beyond the word list, and a way to report a creature.

## Sources (prices checked 21 Oct 2026)

- Measured tokens and latency: `notes/bench-persona.md` (60 calls on 12 test images, 22 Oct 2026; it replaces the 11-scan sample in `notes/server.md`).
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
- Vega In-App Purchasing (`@amazon-devices/keplerscript-appstore-iap-lib`; 2.12.2 and later can be tested on the device and the VVD): https://developer.amazon.com/docs/vega/0.24/vega-iap-overview.html
- VVD "Not supported for performance testing" (checked 22 Oct 2026): https://developer.amazon.com/docs/vega/0.24/run-apps-overview.html
