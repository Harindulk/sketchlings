# Sketchlings phone app

Vite + TypeScript, no UI framework. Join a party, snap a drawing (cut out on the phone with
[`doodle-cutout`](../packages/doodle-cutout)), then use the phone as the race controller. The contract with the server
and the TV is [`../shared/protocol.ts`](../shared/protocol.ts).

```sh
npm install
bun dev/mock-server.ts    # mock server + fake TV on :8787, room ABCD (controls: http://localhost:8787/mock)
npm run dev               # http://localhost:5173/j/ABCD?debugImage=sample  (proxies /ws /api /sprites to :8787)
npm run build             # dist/, served by the real server at /j/:room and /assets/* (old hashed files stay, for phones already open)
npm test                  # bun test (test/)
```

`?debugImage=sample` swaps the camera for a bundled sample photo (handy in automated browsers). More details,
behaviour per phase and test notes: [`../notes/phone.md`](../notes/phone.md). Fonts and art: [CREDITS.md](CREDITS.md).

| File | |
|---|---|
| `src/main.ts` | state, server messages, all screens; the creature card lets the child pick another power before the race |
| `src/net.ts` | WebSocket with reconnect/backoff |
| `src/scan.ts`, `src/cutout.worker.ts` | photo decode (EXIF-aware) → cutout in a worker → PNG upload; the drawpad has its own cutout options, and a photo cut-out as big as the whole frame counts as no drawing |
| `src/drawpad.ts` | "Draw on screen instead" canvas |
| `src/name.ts` | first name only, by the server's rule, so the phone and the TV show the same name |
| `src/controller.ts` | race controller: TAP pad, swipe/JUMP, ROAR (once every 4 s, like the TV), mic shouting (secure pages only) |
| `src/hold.ts` | hold to run: a finger kept on the TAP pad 300 ms sends `hold`, the last one lifted sends `release` |
| `src/sound.ts` | race sounds synthesized with Web Audio (tick, boing, roar, results fanfare), speaker toggle state |
| `src/ui.ts`, `src/style.css` | DOM helper, hand-drawn SVG art, notebook-paper styling |
| `dev/mock-server.ts` | Bun mock of the server + scripted TV |
