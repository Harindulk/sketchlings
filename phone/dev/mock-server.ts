// Mock Sketchlings server + fake TV for phone development. Room ABCD only, offline-style personas.
//   bun dev/mock-server.ts            (PORT=8787, serves ../dist too, so a built app works at /j/ABCD)
//   MOCK_AUTO=0  no scripted phases (drive them from http://localhost:8787/mock)
//   MOCK_DELAY=2500  fake persona processing time in ms
import type {ServerWebSocket} from 'bun';
import {existsSync} from 'node:fs';
import {join, normalize} from 'node:path';
import {
  PLAYER_COLORS,
  type AgeGroup,
  type ClientMsg,
  type MoveStyle,
  type Phase,
  type Player,
  type ServerMsg,
  type Sketchling,
} from '../../shared/protocol';

const PORT = Number(process.env.PORT ?? 8787);
const AUTO = process.env.MOCK_AUTO !== '0';
const DELAY = Number(process.env.MOCK_DELAY ?? 2500);
const ROOM = 'ABCD';
const DIST = join(import.meta.dir, '..', 'dist');
const BOT_SPRITE = join(import.meta.dir, '..', '..', 'packages', 'doodle-cutout', 'examples', 'monster-sprite.png');

type Sock = ServerWebSocket<{playerId?: string}>;
interface MockPlayer extends Player {
  ws?: Sock;
  taps: number;
}

const players = new Map<string, MockPlayer>();
const sprites = new Map<string, Uint8Array<ArrayBuffer>>();
let phase: Phase = 'lobby';
let phaseData: Record<string, unknown> | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const publicPlayer = ({ws: _ws, taps: _t, ...p}: MockPlayer): Player => p;
function send(ws: Sock | undefined, msg: ServerMsg) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
}
function broadcast(msg: ServerMsg) {
  for (const p of players.values()) send(p.ws, msg);
}
const broadcastPlayers = () => broadcast({t: 'players', players: [...players.values()].map(publicPlayer)});

function setPhase(next: Phase, data?: Record<string, unknown>) {
  clearTimeout(timer);
  phase = next;
  phaseData = data;
  console.log(`[mock] phase -> ${next}`, data ? JSON.stringify(data) : '');
  broadcast({t: 'phase', phase: next, data});
  if (!AUTO) return;
  if (next === 'reveal') timer = setTimeout(() => setPhase('race'), 6000);
  if (next === 'race') {
    for (const p of players.values()) p.taps = p.ws ? 0 : 60 + Math.floor(Math.random() * 60);
    timer = setTimeout(finishRace, 20000);
  }
}

function finishRace() {
  const ranking = [...players.values()].sort((a, b) => b.taps - a.taps);
  setPhase('results', {placements: ranking.map((p, i) => ({playerId: p.id, place: i + 1}))});
}

function maybeReveal() {
  const humans = [...players.values()].filter((p) => p.ws);
  if (AUTO && phase === 'draw' && humans.length && humans.every((p) => p.sketchling)) {
    clearTimeout(timer);
    timer = setTimeout(() => setPhase('reveal'), 3000);
  }
}

const NAMES = ['Sir Wobbleton', 'Captain Squiggle', 'Princess Noodle', 'Professor Blob', 'Zippy McDoodle', 'Lady Scribbles'];
const TITLES = ['the Brave Potato', 'the Speedy Sock', 'Queen of Crayons', 'the Giggling Cloud', 'the Mighty Muffin'];
const PHRASES = ['Wobble wobble, here I come!', 'Crayons up, let us go!', 'I run on giggles!', 'Nobody out-scribbles me!'];

function persona(p: MockPlayer, id: string, png: Uint8Array): Sketchling {
  const dv = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return {
    id,
    playerId: p.id,
    name: pick(NAMES),
    title: pick(TITLES),
    personality: 'Loves racing and sharing snacks with friends.',
    catchphrase: pick(PHRASES),
    intro: `Here comes a brand new champion drawn by ${p.name}!`,
    winLine: 'Hooray, scribbles win the day!',
    stats: {speed: 1 + Math.floor(Math.random() * 5), jump: 1 + Math.floor(Math.random() * 5), power: 1 + Math.floor(Math.random() * 5)},
    move: pick<MoveStyle>(['walk', 'hop', 'fly', 'roll']),
    colors: [p.color],
    spriteUrl: `/sprites/${id}.png`,
    eyes: [],
    width: dv.getUint32(16),
    height: dv.getUint32(20),
    source: 'offline',
    artist: p.name,
  };
}

function addBot(name: string, ageGroup: AgeGroup) {
  const id = crypto.randomUUID();
  players.set(id, {id, name, ageGroup, color: PLAYER_COLORS[players.size % PLAYER_COLORS.length], connected: true, taps: 0});
}
addBot('Mia', 'little');
addBot('Dad', 'grownup');

async function giveBotsSketchlings() {
  if (!existsSync(BOT_SPRITE)) return;
  const png = new Uint8Array(await Bun.file(BOT_SPRITE).arrayBuffer());
  for (const p of players.values()) {
    if (p.ws || p.sketchling) continue;
    const id = crypto.randomUUID();
    sprites.set(id, png);
    p.sketchling = persona(p, id, png);
  }
  broadcastPlayers();
}

const json = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Access-Control-Allow-Origin': '*'}});

const CONTROL = `<!doctype html><meta name=viewport content="width=device-width"><title>Mock TV</title>
<style>body{font:18px system-ui;margin:20px}button{font:inherit;margin:4px;padding:10px 16px}</style>
<h1>Mock TV (room ${ROOM})</h1><p>Phase: <b id=p></b> · auto: ${AUTO}</p>
${['lobby', 'draw', 'reveal', 'race', 'results'].map((p) => `<button onclick="go('${p}')">${p}</button>`).join('')}
<button onclick="go('results?place=1')">results (you win)</button>
<script>async function go(p){const r=await fetch('/mock/phase/'+p,{method:'POST'});document.getElementById('p').textContent=await r.text()}
fetch('/mock/phase').then(r=>r.text()).then(t=>document.getElementById('p').textContent=t)</script>`;

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/ws') return srv.upgrade(req, {data: {}}) ? undefined : new Response('upgrade failed', {status: 400});
    if (path === '/health') return json({ok: true});
    if (path === '/mock') return new Response(CONTROL, {headers: {'Content-Type': 'text/html'}});
    if (path === '/mock/phase') return new Response(phase);
    const mp = path.match(/^\/mock\/phase\/(lobby|draw|reveal|race|results)$/);
    if (mp && req.method === 'POST') {
      if (mp[1] === 'results') {
        const me = [...players.values()].find((p) => p.ws);
        if (url.searchParams.get('place') === '1' && me) me.taps = 1e6;
        finishRace();
      } else setPhase(mp[1] as Phase);
      if (mp[1] === 'draw') setTimeout(giveBotsSketchlings, 4000);
      return new Response(phase);
    }
    const sketch = path.match(/^\/api\/rooms\/([^/]+)\/players\/([^/]+)\/sketch$/);
    if (sketch && req.method === 'POST') {
      const p = players.get(sketch[2]);
      if (sketch[1].toUpperCase() !== ROOM || !p) return json({error: 'unknown room or player'}, 404);
      const png = new Uint8Array(await req.arrayBuffer());
      if (png[0] !== 0x89 || png[1] !== 0x50) return json({error: 'body must be a PNG image'}, 415);
      const id = crypto.randomUUID();
      sprites.set(id, png);
      console.log(`[mock] sketch from ${p.name}: ${png.length} bytes`);
      send(p.ws, {t: 'scan', playerId: p.id, status: 'processing'});
      setTimeout(() => {
        p.sketchling = persona(p, id, png);
        send(p.ws, {t: 'sketchling', sketchling: p.sketchling});
        send(p.ws, {t: 'scan', playerId: p.id, status: 'ready'});
        broadcastPlayers();
        maybeReveal();
      }, DELAY);
      return json({id}, 202);
    }
    const sp = path.match(/^\/sprites\/([\w-]+)\.png$/);
    if (sp && sprites.has(sp[1])) return new Response(sprites.get(sp[1])!, {headers: {'Content-Type': 'image/png'}});
    if (path === '/api/hall-of-fame') return json([...players.values()].flatMap((p) => (p.sketchling ? [p.sketchling] : [])));
    // Built phone app, served like the real server does.
    if (path === '/' || /^\/j\/[^/]+\/?$/.test(path)) {
      const index = join(DIST, 'index.html');
      return existsSync(index) ? new Response(Bun.file(index)) : new Response('Run `npm run build` (or use `npm run dev` on :5173).', {status: 404});
    }
    const file = normalize(join(DIST, path.replace(/^\/j\//, '/')));
    if (file.startsWith(DIST + '/') && existsSync(file)) return new Response(Bun.file(file));
    return new Response('not found', {status: 404});
  },
  websocket: {
    data: {} as {playerId?: string},
    message(ws, raw) {
      let msg: ClientMsg;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        send(ws, {t: 'error', code: 'bad_message', message: 'not JSON'});
        return;
      }
      if (msg.t === 'ping') {
        send(ws, {t: 'pong'});
        return;
      }
      if (msg.t === 'hello' && msg.role === 'phone') {
        if (msg.room.toUpperCase() !== ROOM) {
          send(ws, {t: 'error', code: 'no_room', message: `No room ${msg.room}`});
          return;
        }
        let p = msg.playerId ? players.get(msg.playerId) : undefined;
        if (!p) {
          if (players.size >= 6) {
            send(ws, {t: 'error', code: 'room_full', message: 'Room is full'});
            return;
          }
          const id = crypto.randomUUID();
          p = {id, name: msg.name, ageGroup: msg.ageGroup, color: PLAYER_COLORS[players.size % PLAYER_COLORS.length], connected: true, taps: 0};
          players.set(id, p);
        }
        p.ws = ws;
        p.connected = true;
        ws.data.playerId = p.id;
        console.log(`[mock] ${p.name} (${p.ageGroup}) joined`);
        send(ws, {t: 'joined', playerId: p.id, color: p.color, room: ROOM, phase});
        if (phaseData || phase !== 'lobby') send(ws, {t: 'phase', phase, data: phaseData});
        broadcastPlayers();
        if (AUTO && phase === 'lobby') {
          clearTimeout(timer);
          timer = setTimeout(() => {
            setPhase('draw');
            setTimeout(giveBotsSketchlings, 4000);
          }, 3000);
        }
        return;
      }
      if (msg.t === 'input') {
        const p = ws.data.playerId ? players.get(ws.data.playerId) : undefined;
        if (!p) return;
        if (msg.kind === 'tap') p.taps++;
        else console.log(`[mock] ${p.name}: ${msg.kind}`);
        return;
      }
      send(ws, {t: 'error', code: 'bad_message', message: `unexpected ${msg.t}`});
    },
    close(ws) {
      const p = ws.data.playerId ? players.get(ws.data.playerId) : undefined;
      if (p && p.ws === ws) {
        p.ws = undefined;
        p.connected = false;
        broadcastPlayers();
      }
    },
  },
});

console.log(`[mock] Sketchlings mock on http://localhost:${server.port}  (phone: /j/${ROOM}, controls: /mock, auto phases: ${AUTO})`);
