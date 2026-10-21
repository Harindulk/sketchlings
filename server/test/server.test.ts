import {afterAll, describe, expect, test} from 'bun:test';
import {mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Sketchling} from '../../shared/protocol';
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
    expect(hall[0]!.ability).toEqual({kind: 'roll', feature: 'round body', label: 'Zooms fast on flat ground!'});
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
