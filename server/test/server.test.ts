import {afterAll, describe, expect, spyOn, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Player, Sketchling} from '../../shared/protocol';
import {ABILITY_LABEL, MOVES} from '../src/ability';
import type {Claude} from '../src/persona';
import {ARTIST_FEATURE} from '../src/rooms';
import type {Tts} from '../src/voice';
import {drawBlob, encodePng, connect, startTestServer} from './helpers';

const cors = (r: Response) => expect(r.headers.get('access-control-allow-origin')).toBe('*');

describe('upload end-to-end (offline persona)', () => {
  const app = startTestServer();
  afterAll(() => app.stop());

  test('POST a sketch -> scan, sketchling, players, sprite, hall of fame', async () => {
    const tv = await connect(app.wsUrl);
    tv.send({t: 'hello', role: 'tv'});
    const {code} = await tv.next('room');
    const mia = await connect(app.wsUrl);
    mia.send({t: 'hello', role: 'phone', room: code, name: 'Mia', ageGroup: 'little'});
    const {playerId} = await mia.next('joined');
    const leo = await connect(app.wsUrl);
    leo.send({t: 'hello', role: 'phone', room: code, name: 'Leo'});
    await leo.next('joined');

    const png = encodePng(120, 90, drawBlob(120, 90, [60, 200, 90]));
    const res = await fetch(`${app.http}/api/rooms/${code}/players/${playerId}/sketch`, {method: 'POST', headers: {'Content-Type': 'image/png'}, body: png});
    expect(res.status).toBe(202);
    cors(res);
    const {id} = (await res.json()) as {id: string};

    for (const c of [tv, mia]) expect(await c.next('scan')).toEqual({t: 'scan', playerId, status: 'processing'});
    const sk: Sketchling = (await tv.next('sketchling')).sketchling;
    expect((await mia.next('sketchling')).sketchling).toEqual(sk);
    expect(sk).toMatchObject({id, playerId, spriteUrl: `/sprites/${id}.png`, width: 120, height: 90, source: 'offline', artist: 'Mia', artistAge: 'little'});
    expect(Array.isArray(sk.eyes)).toBe(true);
    expect(sk.ability.kind).toBe(sk.move);
    expect(typeof sk.ability.feature).toBe('string');
    expect(typeof sk.ability.label).toBe('string');
    expect(sk.name.length).toBeGreaterThan(0);
    for (const c of [tv, mia]) expect(await c.next('scan')).toEqual({t: 'scan', playerId, status: 'ready'});

    // players carry the sketchling; the other phone sees it via players, not a sketchling frame
    const withSketch = async (c: Awaited<ReturnType<typeof connect>>) => {
      for (;;) {
        const players = (await c.next('players')).players;
        const p = players.find((x: any) => x.id === playerId);
        if (p?.sketchling) return p.sketchling;
      }
    };
    expect(await withSketch(leo)).toEqual(sk);
    expect(await withSketch(tv)).toEqual(sk);
    expect(leo.queue.some(m => m.t === 'sketchling' || m.t === 'scan')).toBe(false);

    const sprite = await fetch(app.http + sk.spriteUrl);
    expect(sprite.status).toBe(200);
    expect(sprite.headers.get('content-type')).toBe('image/png');
    cors(sprite);
    expect(Buffer.from(await sprite.arrayBuffer()).equals(Buffer.from(png))).toBe(true);

    const hall = await fetch(`${app.http}/api/hall-of-fame`);
    cors(hall);
    expect(((await hall.json()) as Sketchling[])[0]).toEqual(sk);

    // a second server on the same data dir still has the hall of fame
    const again = startTestServer({dataDir: app.dataDir});
    expect(((await (await fetch(`${again.http}/api/hall-of-fame`)).json()) as Sketchling[])[0]).toEqual(sk);
    again.stop();

    await Promise.all([tv.close(), mia.close(), leo.close()]);
  });

  test('rejects unknown room/player, non-PNG and oversized bodies', async () => {
    const tv = await connect(app.wsUrl);
    tv.send({t: 'hello', role: 'tv'});
    const {code} = await tv.next('room');
    const p = await connect(app.wsUrl);
    p.send({t: 'hello', role: 'phone', room: code, name: 'Mia'});
    const {playerId} = await p.next('joined');
    const post = (path: string, body: Uint8Array | string) => fetch(`${app.http}/api/rooms/${path}/sketch`, {method: 'POST', headers: {'Content-Type': 'image/png'}, body});
    const png = encodePng(10, 10, drawBlob(10, 10, [1, 2, 3]));

    expect((await post(`QQQQ/players/${playerId}`, png)).status).toBe(404);
    expect((await post(`${code}/players/nobody`, png)).status).toBe(404);
    const notPng = await post(`${code}/players/${playerId}`, 'hello');
    expect(notPng.status).toBe(415);
    cors(notPng);
    const huge = await post(`${code}/players/${playerId}`, new Uint8Array(5 * 1024 * 1024 + 10));
    expect(huge.status).toBe(413);
    expect((await fetch(`${app.http}/api/rooms/${code}/players/${playerId}/sketch`)).status).toBe(405);
    expect(p.queue.some(m => m.t === 'scan')).toBe(false);
    await Promise.all([tv.close(), p.close()]);
  });

  test('health, CORS preflight, sprite 404', async () => {
    const h = await fetch(`${app.http}/health`);
    expect(await h.json()).toEqual({ok: true});
    cors(h);
    const pre = await fetch(`${app.http}/api/rooms/BCDF/players/x/sketch`, {method: 'OPTIONS'});
    expect(pre.status).toBe(204);
    cors(pre);
    expect((await fetch(`${app.http}/sprites/00000000-0000-0000-0000-000000000000.png`)).status).toBe(404);
    expect((await fetch(`${app.http}/sprites/..%2Fhall.json`)).status).toBe(404);
  });
});

describe('hall of fame from older builds', () => {
  test('entries saved before abilities get one on load; junk entries are dropped', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sketchlings-hall-'));
    writeFileSync(join(dataDir, 'hall.json'), JSON.stringify([{id: 'a', name: 'Pip', move: 'roll'}, null, 'junk']));
    const app = startTestServer({dataDir});
    const hall = (await (await fetch(`${app.http}/api/hall-of-fame`)).json()) as Sketchling[];
    expect(hall).toHaveLength(1);
    expect(hall[0]!.ability).toEqual({kind: 'roll', feature: 'round shape', label: 'Zooms fast on flat ground!'});
    app.stop();
  });
});

describe('phone app static files', () => {
  test('placeholder when the phone app is not built', async () => {
    const app = startTestServer();
    const r = await fetch(`${app.http}/j/bcdf`);
    expect(r.status).toBe(503);
    const body = await r.text();
    expect(body).toContain("phone app isn't built yet");
    expect(body).toContain('BCDF');
    app.stop();
  });

  test('serves index.html for /j/:room and files from dist, never outside it', async () => {
    const dist = mkdtempSync(join(tmpdir(), 'sketchlings-dist-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<!doctype html><title>phone</title>');
    writeFileSync(join(dist, 'assets', 'app-123.js'), 'console.log(1)');
    writeFileSync(join(dist, 'icon.svg'), '<svg/>');
    const app = startTestServer({phoneDist: dist});
    for (const path of ['/j/BCDF', '/j/BCDF/', '/']) {
      const r = await fetch(app.http + path);
      expect(r.status).toBe(200);
      expect(await r.text()).toContain('<title>phone</title>');
    }
    const js = await fetch(`${app.http}/assets/app-123.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    expect(js.headers.get('cache-control')).toContain('immutable');
    expect((await fetch(`${app.http}/icon.svg`)).status).toBe(200);
    expect((await fetch(`${app.http}/j/assets/app-123.js`)).status).toBe(200);
    expect((await fetch(`${app.http}/assets/missing.js`)).status).toBe(404);
    expect((await fetch(`${app.http}/%2e%2e/%2e%2e/package.json`)).status).toBe(404);
    expect((await fetch(`${app.http}/%E0%A4%A`)).status).toBe(404);
    app.stop();
  });
});

/** A TV and one phone in a fresh room, and a way to scan a drawing for that phone and wait for its creature. */
async function party(app: ReturnType<typeof startTestServer>, hello: Record<string, unknown> = {aiPersonas: true}) {
  const tv = await connect(app.wsUrl);
  tv.send({t: 'hello', role: 'tv', ...hello});
  const {code} = await tv.next('room');
  const mia = await connect(app.wsUrl);
  mia.send({t: 'hello', role: 'phone', room: code, name: 'Mia'});
  const {playerId} = await mia.next('joined');
  const png = encodePng(120, 90, drawBlob(120, 90, [60, 200, 90]));
  const scan = async (): Promise<Sketchling> => {
    const res = await fetch(`${app.http}/api/rooms/${code}/players/${playerId}/sketch`, {method: 'POST', body: png});
    expect(res.status).toBe(202);
    const sk = (await tv.next('sketchling')).sketchling;
    await mia.next('sketchling');
    while ((await tv.next('scan')).status !== 'ready');
    return sk;
  };
  return {tv, mia, code: code as string, playerId: playerId as string, scan, close: () => Promise.all([tv.close(), mia.close()])};
}

/** Fake Claude that counts calls and answers `{}` (sanitized into a valid persona marked claude). */
function countingClaude() {
  const c = {calls: 0, claude: undefined as unknown as Claude};
  const create = async () => (c.calls++, {stop_reason: 'end_turn', content: [{type: 'text', text: '{}'}]});
  c.claude = {model: 'test-model', client: {beta: {messages: {create}}}} as unknown as Claude;
  return c;
}

describe('consent: AI personas off for a room', () => {
  test('aiPersonas false -> offline personas, no Claude call, logged once; absent -> offline too; true -> Claude', async () => {
    const fake = countingClaude();
    const app = startTestServer({claude: fake.claude});
    const log = spyOn(console, 'log');
    const off = await party(app, {aiPersonas: false});
    expect((await off.scan()).source).toBe('offline');
    off.tv.send({t: 'hello', role: 'tv', room: off.code, aiPersonas: false}); // the TV reconnects
    await off.tv.next('room');
    expect((await off.scan()).source).toBe('offline');
    expect(fake.calls).toBe(0);
    expect(log.mock.calls.map(c => String(c[0])).filter(l => l.startsWith('[consent]'))).toEqual([`[consent] room ${off.code}: AI personas off, no drawing from this room goes to Claude`]);
    log.mockRestore();

    const absent = await party(app, {}); // an older TV that sends no flag: no consent, so no Claude
    expect((await absent.scan()).source).toBe('offline');
    expect(fake.calls).toBe(0);
    const on = await party(app, {aiPersonas: true}); // a grown-up turned AI personas on
    expect((await on.scan()).source).toBe('claude');
    expect(fake.calls).toBe(1);
    await Promise.all([off.close(), absent.close(), on.close()]);
    app.stop();
  });
});

describe('failure injection (SKETCHLINGS_FAIL_EVERY)', () => {
  test('every Nth persona call fails into the offline fallback, and says so', async () => {
    const fake = countingClaude();
    const app = startTestServer({claude: fake.claude, failEvery: 2});
    const warn = spyOn(console, 'warn');
    const p = await party(app);
    const sources = [];
    for (let i = 0; i < 4; i++) sources.push((await p.scan()).source);
    expect(sources).toEqual(['claude', 'offline', 'claude', 'offline']);
    expect(fake.calls).toBe(2);
    const lines = warn.mock.calls.map(c => String(c[0]));
    expect(lines.filter(l => l.includes('injected failure on call'))).toEqual(['[persona] injected failure on call 2 (SKETCHLINGS_FAIL_EVERY=2)', '[persona] injected failure on call 4 (SKETCHLINGS_FAIL_EVERY=2)']);
    expect(lines.filter(l => l.includes('using offline persona'))).toHaveLength(2); // the real fallback path ran
    warn.mockRestore();
    await p.close();
    app.stop();
  });
});

describe('the artist changes the ability', () => {
  const app = startTestServer();
  afterAll(() => app.stop());

  test('before the race: validated, marked as the artist\'s, original kept, sent to TV + phone, saved in the hall', async () => {
    const p = await party(app);
    p.mia.send({t: 'ability', kind: 'fly'});
    expect((await p.mia.next('error')).message).toBe('Scan a drawing first.');
    const sk = await p.scan();
    const other = MOVES.find(k => k !== sk.move)!;
    const original = {kind: sk.ability.kind, feature: sk.ability.feature};

    p.mia.send({t: 'ability', kind: other});
    const changed = (await p.tv.next('sketchling')).sketchling;
    expect(changed).toEqual({...sk, move: other, ability: {kind: other, feature: ARTIST_FEATURE, label: ABILITY_LABEL[other], chosenBy: 'artist', original}});
    expect((await p.mia.next('sketchling')).sketchling).toEqual(changed);
    expect(((await (await fetch(`${app.http}/api/hall-of-fame`)).json()) as Sketchling[])[0]).toEqual(changed);

    p.mia.send({t: 'ability', kind: sk.move}); // back to the drawing's pick: the drawing's ability, not the artist's
    expect((await p.tv.next('sketchling')).sketchling.ability).toEqual(sk.ability);
    await p.mia.next('sketchling');

    p.mia.send({t: 'ability', kind: 'swim'});
    expect((await p.mia.next('error')).code).toBe('bad_message');
    p.tv.send({t: 'ability', kind: other});
    expect((await p.tv.next('error')).code).toBe('bad_message');
    p.tv.send({t: 'phase', phase: 'race'});
    await p.mia.next('phase');
    p.mia.send({t: 'ability', kind: other});
    expect((await p.mia.next('error')).message).toBe('Abilities can only change before the race.');
    expect(app.hub.rooms.get(p.code)!.slots.get(p.playerId)!.player.sketchling!.move).toBe(sk.move);
    await p.close();
  });
});

describe('clear Hall of Fame', () => {
  test('the TV deletes hall entries, sprites and voice clips (temporary data dir only); scan logs give both timings', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sketchlings-clear-'));
    expect(dataDir.startsWith(tmpdir())).toBe(true); // never the real server/data
    writeFileSync(join(dataDir, 'hall.json.bad-1'), '[{"artist":"Mia"}]'); // an old unreadable copy holds names too
    const fakeTts: Tts = {clip: async (_text, _v, out) => (writeFileSync(out, 'm4a'), 1000)};
    const app = startTestServer({dataDir, tts: async () => fakeTts});
    const log = spyOn(console, 'log');
    const p = await party(app);
    const sk = await p.scan();
    expect((await p.tv.next('sketchling')).sketchling.voice).toEqual({intro: `/voice/${sk.id}/intro.m4a`}); // the intro first
    const voiced = (await p.tv.next('sketchling')).sketchling as Sketchling;
    expect(voiced.voice?.winLine).toBe(`/voice/${sk.id}/winLine.m4a`);
    const scanLines = log.mock.calls.map(c => String(c[0])).filter(l => l.startsWith(`[scan] ${p.playerId}`));
    expect(scanLines).toHaveLength(2);
    expect(scanLines[0]).toMatch(/ upload->sketchling \d+ ms source=offline$/);
    expect(scanLines[1]).toMatch(/ upload->voices \d+ ms lines=3$/);
    log.mockRestore();
    expect(existsSync(join(dataDir, 'sprites', `${sk.id}.png`))).toBe(true);
    expect(readdirSync(join(dataDir, 'voice', 'cache')).length).toBeGreaterThan(0);
    const orphan = join(dataDir, 'sprites', `${crypto.randomUUID()}.png`); // a failed scan's drawing: no hall entry
    writeFileSync(orphan, 'png');

    p.mia.send({t: 'clearHall'}); // phones can't
    expect((await p.mia.next('error')).code).toBe('bad_message');
    p.tv.send({t: 'clearHall'});
    expect(await p.tv.next('hallCleared')).toEqual({t: 'hallCleared', removed: 1});
    expect(await (await fetch(`${app.http}/api/hall-of-fame`)).json()).toEqual([]);
    expect(JSON.parse(readFileSync(join(dataDir, 'hall.json'), 'utf8'))).toEqual([]);
    expect((await fetch(app.http + sk.spriteUrl)).status).toBe(404);
    expect((await fetch(app.http + voiced.voice!.intro!)).status).toBe(404);
    expect(existsSync(join(dataDir, 'voice', sk.id))).toBe(false);
    expect(readdirSync(join(dataDir, 'voice', 'cache'))).toEqual([]); // still there for new clips
    expect(existsSync(join(dataDir, 'hall.json.bad-1'))).toBe(false);
    expect(existsSync(orphan)).toBe(false);

    expect((await p.scan()).source).toBe('offline'); // the party carries on
    expect(((await (await fetch(`${app.http}/api/hall-of-fame`)).json()) as Sketchling[])).toHaveLength(1);
    await p.close();
    app.stop();
  });
});

const fakeTts: Tts = {clip: async (_text, _v, out) => (writeFileSync(out, 'm4a'), 1000)};
const hallOf = async (app: ReturnType<typeof startTestServer>) => (await (await fetch(`${app.http}/api/hall-of-fame`)).json()) as Sketchling[];
/** Scan, then wait for both voice frames (the intro alone, then every line) on the TV and the phone. */
const scanVoiced = async (p: Awaited<ReturnType<typeof party>>) => {
  const sk = await p.scan();
  for (let i = 0; i < 2; i++) await Promise.all([p.tv.next('sketchling'), p.mia.next('sketchling')]);
  return sk;
};
/** The next `players` frame that matches `ok` (earlier ones are dropped). */
const playersUntil = async (c: Awaited<ReturnType<typeof connect>>, ok: (players: Player[]) => boolean) => {
  for (;;) {
    const {players} = await c.next('players');
    if (ok(players)) return players as Player[];
  }
};

describe('the public tunnel (Cloudflare headers)', () => {
  const cf = {'cf-connecting-ip': '203.0.113.7', 'cf-ray': '8d1f2a3b4c5d6e7f-LHR'};

  test('no hall and no voices; sprites only for creatures in a live room. The LAN gets everything', async () => {
    const app = startTestServer({tts: async () => fakeTts});
    const p = await party(app);
    const old = await scanVoiced(p);
    const live = await scanVoiced(p); // a redraw: the first creature is now only in the hall
    const get = (path: string, headers?: Record<string, string>) => fetch(app.http + path, {headers}).then(r => r.status);

    expect(await hallOf(app)).toHaveLength(2);
    expect(await get('/api/hall-of-fame', cf)).toBe(404);
    expect(await get('/api/hall-of-fame', {'cf-ray': cf['cf-ray']})).toBe(404); // either header is enough
    expect(await get(live.spriteUrl, cf)).toBe(200); // the phone's own creature
    expect(await get(old.spriteUrl, cf)).toBe(404);
    expect(await get(old.spriteUrl)).toBe(200);
    expect(await get(`/voice/${live.id}/intro.m4a`, cf)).toBe(404);
    expect(await get(`/voice/${live.id}/intro.m4a`)).toBe(200);
    for (const path of ['/health', `/j/${p.code}`]) expect(await get(path, cf)).not.toBe(404); // phones still join

    // uploads through the tunnel still work
    const res = await fetch(`${app.http}/api/rooms/${p.code}/players/${p.playerId}/sketch`, {method: 'POST', headers: cf, body: encodePng(40, 40, drawBlob(40, 40, [200, 60, 60]))});
    expect(res.status).toBe(202);
    await p.tv.next('sketchling');
    await p.close();
    app.stop();
  });

  test('a TV hello through the tunnel is refused, even from a socket that joined as a phone first', async () => {
    const app = startTestServer();
    const tv = await connect(app.wsUrl);
    tv.send({t: 'hello', role: 'tv'});
    const {code} = await tv.next('room');
    const fakeTv = await connect(app.wsUrl, cf);
    fakeTv.send({t: 'hello', role: 'tv', room: code});
    expect(await fakeTv.next('error')).toMatchObject({code: 'bad_message', message: 'A TV must connect over the Wi-Fi, not the public link.'});
    const ph = await connect(app.wsUrl, cf);
    ph.send({t: 'hello', role: 'phone', room: code, name: 'Mia'});
    await ph.next('joined');
    ph.send({t: 'hello', role: 'tv', room: code});
    expect((await ph.next('error')).code).toBe('bad_message');
    ph.send({t: 'clearHall'});
    expect((await ph.next('error')).code).toBe('bad_message');
    expect(app.hub.rooms.get(code)!.tv).toBeDefined(); // the real TV kept its room
    tv.send({t: 'phase', phase: 'draw'}); // and still runs it
    expect((await ph.next('phase')).phase).toBe('draw');
    await Promise.all([tv.close(), fakeTv.close(), ph.close()]);
    app.stop();
  });
});

describe('the TV removes a player or deletes one creature', () => {
  test('removePlayer: the slot, the phone (it cannot come back as that player) and every creature they drew', async () => {
    const app = startTestServer({tts: async () => fakeTts});
    const log = spyOn(console, 'log');
    const p = await party(app);
    const first = await scanVoiced(p);
    const second = await scanVoiced(p);
    const leo = await connect(app.wsUrl);
    leo.send({t: 'hello', role: 'phone', room: p.code, name: 'Leo'});
    const {playerId: leoId} = await leo.next('joined');

    p.mia.send({t: 'removePlayer', playerId: leoId}); // phones can't
    expect((await p.mia.next('error')).code).toBe('bad_message');
    p.tv.send({t: 'removePlayer', playerId: 'nobody'});
    expect(await p.tv.next('error')).toMatchObject({code: 'bad_message', message: 'No such player in this party.'});

    const closed = new Promise<CloseEvent>(r => p.mia.ws.addEventListener('close', r));
    p.tv.send({t: 'removePlayer', playerId: p.playerId});
    expect(await p.mia.next('error')).toEqual({t: 'error', code: 'removed', message: "You've left this party. Thanks for playing!"});
    expect((await closed).reason).toBe('removed');
    await playersUntil(p.tv, ps => ps.length === 1 && ps[0]!.id === leoId);
    await playersUntil(leo, ps => ps.length === 1 && ps[0]!.id === leoId);
    expect(app.hub.rooms.get(p.code)!.slots.has(p.playerId)).toBe(false);
    expect(await hallOf(app)).toEqual([]);
    for (const sk of [first, second]) {
      expect((await fetch(app.http + sk.spriteUrl)).status).toBe(404);
      expect(existsSync(join(app.dataDir, 'voice', sk.id))).toBe(false);
    }
    const lines = log.mock.calls.map(c => String(c[0]));
    log.mockRestore();
    expect(lines).toContain(`[room] ${p.code}: the TV removed a player and their 2 creature(s)`);
    expect(lines.filter(l => l.startsWith('[room]')).join()).not.toContain('Mia'); // no name in the log

    const back = await connect(app.wsUrl); // the same phone reconnecting with its playerId
    back.send({t: 'hello', role: 'phone', room: p.code, name: 'Mia', playerId: p.playerId});
    expect((await back.next('error')).code).toBe('removed');
    const fresh = await connect(app.wsUrl); // a grown-up can still let them rejoin as someone new
    fresh.send({t: 'hello', role: 'phone', room: p.code, name: 'Mia'});
    expect((await fresh.next('joined')).playerId).not.toBe(p.playerId);
    await Promise.all([p.tv.close(), leo.close(), back.close(), fresh.close()]);
    app.stop();
  });

  test('removePlayer during a scan: the creature never reaches the hall and its drawing is deleted', async () => {
    let answer = () => {};
    const create = () => new Promise(r => (answer = () => r({stop_reason: 'end_turn', content: [{type: 'text', text: '{}'}]})));
    const app = startTestServer({claude: {model: 'test-model', client: {beta: {messages: {create}}}} as unknown as Claude});
    const p = await party(app);
    const res = await fetch(`${app.http}/api/rooms/${p.code}/players/${p.playerId}/sketch`, {method: 'POST', body: encodePng(40, 40, drawBlob(40, 40, [60, 60, 200]))});
    const {id} = (await res.json()) as {id: string};
    await p.tv.next('scan'); // processing
    expect(existsSync(join(app.dataDir, 'sprites', `${id}.png`))).toBe(true);
    p.tv.send({t: 'removePlayer', playerId: p.playerId});
    expect((await p.mia.next('error')).code).toBe('removed');
    answer();
    await Bun.sleep(50);
    expect(await hallOf(app)).toEqual([]);
    expect(existsSync(join(app.dataDir, 'sprites', `${id}.png`))).toBe(false);
    expect(p.tv.queue.filter(m => m.t === 'sketchling')).toEqual([]);
    await p.tv.close();
    app.stop();
  });

  test('deleteCreature: one hall entry with its sprite and voice; a live player who has it is left without a creature', async () => {
    const app = startTestServer({tts: async () => fakeTts});
    const p = await party(app);
    const old = await scanVoiced(p);
    const live = await scanVoiced(p);

    p.mia.send({t: 'deleteCreature', id: old.id}); // phones can't
    expect((await p.mia.next('error')).code).toBe('bad_message');
    p.tv.send({t: 'deleteCreature', id: old.id});
    expect(await p.tv.next('creatureDeleted')).toEqual({t: 'creatureDeleted', id: old.id, removed: 1});
    expect((await hallOf(app)).map(s => s.id)).toEqual([live.id]);
    expect((await fetch(app.http + old.spriteUrl)).status).toBe(404);
    expect(existsSync(join(app.dataDir, 'voice', old.id))).toBe(false);
    expect((await fetch(app.http + live.spriteUrl)).status).toBe(200);

    p.tv.send({t: 'deleteCreature', id: live.id});
    expect(await p.tv.next('creatureDeleted')).toEqual({t: 'creatureDeleted', id: live.id, removed: 1});
    const last: Player[] = p.tv.queue.filter(m => m.t === 'players').at(-1).players; // sent before the answer
    expect(last).toEqual([expect.objectContaining({id: p.playerId, connected: true})]);
    expect(last[0]!.sketchling).toBeUndefined();
    expect(await hallOf(app)).toEqual([]);
    p.tv.send({t: 'deleteCreature', id: live.id}); // already gone
    expect(await p.tv.next('creatureDeleted')).toEqual({t: 'creatureDeleted', id: live.id, removed: 0});

    expect((await p.scan()).source).toBe('offline'); // the player can draw again
    await p.close();
    app.stop();
  });
});

describe('ink-blot hits (tv -> one phone)', () => {
  test('the TV relays a hit to that phone only, during a race; phones, other phases and unknown players are dropped', async () => {
    const app = startTestServer({tts: async () => fakeTts});
    const p = await party(app);
    const leo = await connect(app.wsUrl);
    leo.send({t: 'hello', role: 'phone', room: p.code, name: 'Leo'});
    await leo.next('joined');
    p.tv.send({t: 'hit', playerId: p.playerId}); // not racing yet: dropped
    p.tv.send({t: 'phase', phase: 'race'});
    await p.mia.next('phase');
    await leo.next('phase');
    p.mia.send({t: 'hit', playerId: p.playerId}); // phones can't send it: dropped, no answer
    p.tv.send({t: 'hit', playerId: 'nobody'}); // unknown player: dropped
    p.tv.send({t: 'hit', playerId: p.playerId});
    expect(await p.mia.next('hit')).toEqual({t: 'hit'});
    p.tv.send({t: 'phase', phase: 'results'}); // a frame after the hit, so a stray second hit would show first
    expect((await p.mia.next('phase')).phase).toBe('results');
    const count = (c: {queue: any[]}, t: string) => c.queue.filter(m => m.t === t).length;
    expect(count(p.mia, 'hit')).toBe(0); // exactly the one hit (taken above), not the early or the unknown one
    expect(count(leo, 'hit')).toBe(0); // never broadcast
    expect(count(p.tv, 'error') + count(p.mia, 'error')).toBe(0); // dropped silently
    await Promise.all([p.close(), leo.close()]);
    app.stop();
  });
});
