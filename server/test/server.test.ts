import {afterAll, describe, expect, spyOn, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Sketchling} from '../../shared/protocol';
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
async function party(app: ReturnType<typeof startTestServer>, hello: Record<string, unknown> = {}) {
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
  test('aiPersonas false -> offline personas, no Claude call, logged once; absent -> Claude as before', async () => {
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

    const on = await party(app); // today's TV: no flag
    expect((await on.scan()).source).toBe('claude');
    expect(fake.calls).toBe(1);
    await Promise.all([off.close(), on.close()]);
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
    const voiced = (await p.tv.next('sketchling')).sketchling as Sketchling;
    expect(voiced.voice?.intro).toBe(`/voice/${sk.id}/intro.m4a`);
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
