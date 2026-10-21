// HTTP routes + WebSocket wiring. createServer() is used by index.ts and by the tests (port 0).
import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {networkInterfaces} from 'node:os';
import {join, resolve, sep} from 'node:path';
import type {Sketchling} from '../../shared/protocol';
import {withAbility} from './ability';
import {generatePersona, type Claude} from './persona';
import {MAX_SIDE, readPngSize, type PngInfo} from './png';
import {createHub, type Room, type Slot, type WsData} from './rooms';
import {createVoices, type Tts} from './voice';

export const MAX_UPLOAD = 5 * 1024 * 1024;
const HALL_CAP = 200;

export interface ServerConfig {
  port: number;
  hostname?: string;
  dataDir: string;
  phoneDist: string;
  publicUrl?: string;
  claude: Claude | null;
  tts?: () => Promise<Tts | null>; // creature voices; omitted = off (tests)
}

export function lanIp(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) if (a.family === 'IPv4' && !a.internal && !a.address.startsWith('169.254.')) return a.address;
  }
  return 'localhost';
}

const json = (body: unknown, status = 200) => Response.json(body, {status});
const html = (body: string, status = 200) => new Response(body, {status, headers: {'Content-Type': 'text/html; charset=utf-8'}});
const isFile = (p: string) => !!statSync(p, {throwIfNoEntry: false})?.isFile();

const PLACEHOLDER = (code: string) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sketchlings</title><body style="font-family:system-ui,sans-serif;text-align:center;padding:48px 16px;background:#fffaf0;color:#222">
<h1>Sketchlings</h1><p>The phone app isn't built yet${code ? ` (room <b>${code}</b>)` : ''}.</p>
<p>Run <code>cd phone &amp;&amp; npm run build</code>, then reload this page.</p></body>`;

export function createServer(cfg: ServerConfig) {
  const dataDir = resolve(cfg.dataDir);
  const spritesDir = join(dataDir, 'sprites');
  const voiceDir = join(dataDir, 'voice');
  const phoneDist = resolve(cfg.phoneDist);
  mkdirSync(spritesDir, {recursive: true});
  const voices = cfg.tts ? createVoices(voiceDir, cfg.tts) : null;

  // ---------- hall of fame (newest first) ----------
  const hallPath = join(dataDir, 'hall.json');
  let hall: Sketchling[] = [];
  if (existsSync(hallPath)) {
    try {
      const parsed = JSON.parse(readFileSync(hallPath, 'utf8'));
      if (!Array.isArray(parsed)) throw new Error('not an array');
      hall = parsed.filter(s => s && typeof s === 'object').map(withAbility);
    } catch (e) {
      const bad = `${hallPath}.bad-${Date.now()}`;
      console.error(`[hall] unreadable ${hallPath}, moved to ${bad}:`, e);
      renameSync(hallPath, bad);
    }
  }
  function addToHall(s: Sketchling) {
    hall.unshift(s);
    for (const old of hall.splice(HALL_CAP)) {
      try {
        unlinkSync(join(spritesDir, `${old.id}.png`)); // images stay on the host only as long as they're shown
      } catch {}
      if (/^[0-9a-f-]{36}$/.test(old.id)) rmSync(join(voiceDir, old.id), {recursive: true, force: true}); // ids come from hall.json
    }
    saveHall();
  }
  function updateHall(s: Sketchling) {
    const i = hall.findIndex(h => h.id === s.id);
    if (i < 0) return;
    hall[i] = s;
    saveHall();
  }
  function saveHall() {
    try {
      writeFileSync(`${hallPath}.tmp`, JSON.stringify(hall));
      renameSync(`${hallPath}.tmp`, hallPath); // atomic: a crash mid-write never leaves a torn file
    } catch (e) {
      console.error('[hall] save failed:', e);
    }
  }

  // ---------- rooms ----------
  const base = () => (cfg.publicUrl?.trim() || `http://${lanIp()}:${server.port}`).replace(/\/+$/, '');
  const hub = createHub(code => `${base()}/j/${code}`);

  async function processScan(room: Room, slot: Slot, id: string, png: Uint8Array, size: PngInfo, uploadAt: number) {
    const playerId = slot.player.id;
    hub.toTvAndPlayer(room, playerId, {t: 'scan', playerId, status: 'processing'});
    try {
      const taken = [...room.slots.values()].map(sl => sl.player.sketchling?.name).concat(hall.slice(0, 30).map(h => h.name));
      const persona = await generatePersona(png, size, cfg.claude, taken.filter((n): n is string => !!n));
      const sketchling: Sketchling = {id, playerId, ...persona, spriteUrl: `/sprites/${id}.png`, width: size.width, height: size.height, artist: slot.player.name, artistAge: slot.player.ageGroup};
      slot.player.sketchling = sketchling;
      hub.toTvAndPlayer(room, playerId, {t: 'sketchling', sketchling});
      // Playtest KPI: snap-to-reveal on the server side, one line per scan.
      console.log(`[scan] ${playerId} upload->sketchling ${Date.now() - uploadAt} ms source=${sketchling.source}`);
      hub.toTvAndPlayer(room, playerId, {t: 'scan', playerId, status: 'ready'});
      hub.broadcastPlayers(room);
      addToHall(sketchling);
      // Audio never holds up the reveal: a second `sketchling` frame (same id) adds `voice` when it's ready.
      void voices?.speak(sketchling).then(voice => {
        if (!voice) return;
        const voiced = {...sketchling, voice};
        updateHall(voiced);
        if (slot.player.sketchling?.id !== id) return; // the player has scanned something new since
        slot.player.sketchling = voiced;
        hub.toTvAndPlayer(room, playerId, {t: 'sketchling', sketchling: voiced});
      });
    } catch (e) {
      console.error('[scan] failed:', e);
      hub.toTvAndPlayer(room, playerId, {t: 'scan', playerId, status: 'failed', message: "Oops! Let's try that scan again."});
    } finally {
      slot.scanning = false;
    }
  }

  async function uploadSketch(req: Request, code: string, playerId: string): Promise<Response> {
    const uploadAt = Date.now();
    const room = hub.rooms.get(code.toUpperCase());
    const slot = room?.slots.get(playerId);
    if (!room || !slot) return json({error: 'unknown room or player'}, 404);
    if (Number(req.headers.get('content-length')) > MAX_UPLOAD) return json({error: 'image too large (max 5 MB)'}, 413);
    let png: Uint8Array;
    try {
      png = new Uint8Array(await req.arrayBuffer());
    } catch {
      return json({error: 'could not read upload'}, 400);
    }
    if (png.length > MAX_UPLOAD) return json({error: 'image too large (max 5 MB)'}, 413);
    const size = readPngSize(png);
    if (!size) return json({error: 'body must be a PNG image'}, 415);
    if (size.width > MAX_SIDE || size.height > MAX_SIDE) return json({error: `image too big (max ${MAX_SIDE} px per side)`}, 413);
    if (slot.scanning) return json({error: 'a scan is already being processed'}, 409);
    slot.scanning = true;
    const id = crypto.randomUUID();
    try {
      await Bun.write(join(spritesDir, `${id}.png`), png);
    } catch (e) {
      slot.scanning = false;
      console.error('[scan] could not save sprite:', e);
      return json({error: 'could not save image'}, 500);
    }
    void processScan(room, slot, id, png, size, uploadAt);
    return json({id}, 202);
  }

  function phonePage(code = ''): Response {
    const index = join(phoneDist, 'index.html');
    if (isFile(index)) return new Response(Bun.file(index), {headers: {'Cache-Control': 'no-cache'}});
    return html(PLACEHOLDER(/^[A-Za-z]{4}$/.test(code) ? code.toUpperCase() : ''), 503);
  }

  function staticFile(pathname: string): Response | null {
    let rel: string;
    try {
      rel = decodeURIComponent(pathname);
    } catch {
      return null;
    }
    const path = resolve(phoneDist, '.' + rel);
    if (!path.startsWith(phoneDist + sep) || !isFile(path)) return null;
    const immutable = rel.startsWith('/assets/'); // Vite puts content-hashed files there
    return new Response(Bun.file(path), {headers: {'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'}});
  }

  async function route(req: Request, url: URL): Promise<Response> {
    const p = url.pathname;
    if (req.method === 'OPTIONS') {
      return new Response(null, {status: 204, headers: {'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Range', 'Access-Control-Max-Age': '86400'}});
    }
    const sketch = p.match(/^\/api\/rooms\/([^/]+)\/players\/([^/]+)\/sketch$/);
    if (sketch) return req.method === 'POST' ? uploadSketch(req, sketch[1]!, sketch[2]!) : json({error: 'use POST'}, 405);
    if (req.method !== 'GET' && req.method !== 'HEAD') return json({error: 'method not allowed'}, 405);

    if (p === '/health') return json({ok: true});
    if (p === '/api/hall-of-fame') return json(hall);
    const sprite = p.match(/^\/sprites\/([0-9a-f-]{36})\.png$/);
    if (sprite) {
      const file = join(spritesDir, `${sprite[1]}.png`);
      return isFile(file)
        ? new Response(Bun.file(file), {headers: {'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable'}})
        : json({error: 'no such sprite'}, 404);
    }
    const voice = p.match(/^\/voice\/([0-9a-f-]{36})\/(intro|catchphrase|winLine)\.m4a$/);
    if (voice) {
      const file = join(voiceDir, voice[1]!, `${voice[2]}.m4a`);
      // Bun answers Range requests for a BunFile body itself (206 + Content-Range + Accept-Ranges, 416 when unsatisfiable).
      const headers = {
        'Content-Type': 'audio/mp4',
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
        ...(req.headers.has('range') ? {} : {'Accept-Ranges': 'bytes'}), // Bun adds it to 206s; don't send it twice
      };
      return isFile(file) ? new Response(Bun.file(file), {headers}) : json({error: 'no such clip'}, 404);
    }
    const join_ = p.match(/^\/j\/([^/]*)\/?$/);
    if (join_) return phonePage(join_[1]);
    if (p === '/' || p === '/index.html') return phonePage();
    // /j/assets/* too, in case the phone build uses a relative base ('./')
    return staticFile(p.replace(/^\/j\//, '/')) ?? json({error: 'not found'}, 404);
  }

  const server = Bun.serve({
    port: cfg.port,
    hostname: cfg.hostname ?? '0.0.0.0',
    maxRequestBodySize: MAX_UPLOAD,
    async fetch(req, srv) {
      const url = new URL(req.url);
      if (url.pathname === '/ws') {
        if (srv.upgrade(req, {data: {} as WsData})) return undefined;
        return json({error: 'expected a WebSocket upgrade'}, 400);
      }
      const res = await route(req, url);
      res.headers.set('Access-Control-Allow-Origin', '*');
      return res;
    },
    error(e) {
      console.error('[http]', e);
      return Response.json({error: 'internal error'}, {status: 500, headers: {'Access-Control-Allow-Origin': '*'}});
    },
    websocket: {data: {} as WsData, ...hub.websocket},
  });

  return {server, hub, url: `http://localhost:${server.port}`, joinBase: base, stop: () => server.stop(true)};
}
