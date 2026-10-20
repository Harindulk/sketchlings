import {afterAll, describe, expect, test} from 'bun:test';
import {MAX_PLAYERS, PLAYER_COLORS} from '../../shared/protocol';
import {CODE_ALPHABET, cleanName, parseClientMsg} from '../src/rooms';
import {connect, startTestServer} from './helpers';

describe('frame validation', () => {
  test('accepts every protocol message', () => {
    expect(parseClientMsg('{"t":"ping"}')).toEqual({t: 'ping'});
    expect(parseClientMsg('{"t":"hello","role":"tv"}')).toEqual({t: 'hello', role: 'tv', room: undefined});
    expect(parseClientMsg('{"t":"hello","role":"tv","room":"BCDF"}')).toEqual({t: 'hello', role: 'tv', room: 'BCDF'});
    expect(parseClientMsg('{"t":"hello","role":"phone","room":"BCDF","name":"Mia","playerId":"x"}')).toEqual({
      t: 'hello',
      role: 'phone',
      room: 'BCDF',
      name: 'Mia',
      ageGroup: 'big', // omitted -> default, not rejected
      playerId: 'x',
    });
    for (const ageGroup of ['little', 'big', 'grownup']) {
      expect(parseClientMsg(JSON.stringify({t: 'hello', role: 'phone', room: 'BCDF', name: 'Mia', ageGroup}))).toMatchObject({ageGroup});
    }
    expect(parseClientMsg('{"t":"input","kind":"shout","at":5}')).toEqual({t: 'input', kind: 'shout', at: 5});
    expect(parseClientMsg('{"t":"phase","phase":"race","data":{"track":2}}')).toEqual({t: 'phase', phase: 'race', data: {track: 2}});
    expect(parseClientMsg('{"t":"input","kind":"jump","at":123.5,"extra":1}')).toEqual({t: 'input', kind: 'jump', at: 123.5});
  });

  test('rejects malformed frames with a reason', () => {
    for (const bad of [
      'not json',
      '[]',
      'null',
      '"hi"',
      '{}',
      '{"t":5}',
      '{"t":"nope"}',
      '{"t":"hello"}',
      '{"t":"hello","role":"admin"}',
      '{"t":"hello","role":"tv","room":5}',
      '{"t":"hello","role":"phone","room":"BCDF"}',
      '{"t":"hello","role":"phone","room":"BCDF","name":"A","playerId":1}',
      '{"t":"phase","phase":"party"}',
      '{"t":"phase","phase":"race","data":[1]}',
      '{"t":"input","kind":"kick","at":1}',
      '{"t":"hello","role":"phone","room":"BCDF","name":"A","ageGroup":"baby"}',
      '{"t":"hello","role":"phone","room":"BCDF","name":"A","ageGroup":7}',
      '{"t":"input","kind":"tap"}',
      '{"t":"input","kind":"tap","at":"now"}',
    ]) {
      expect(typeof parseClientMsg(bad)).toBe('string');
    }
    expect(typeof parseClientMsg(Buffer.from('{"t":"ping"}'))).toBe('string');
  });

  test('cleans player names', () => {
    expect(cleanName('  Mia\n\u0000 <b>Rose</b> the Great Explorer ')).toBe('Mia bRose/b the');
    expect(cleanName(' ​ ')).toBe('');
  });
});

describe('rooms over WebSocket', () => {
  const app = startTestServer();
  afterAll(() => app.stop());

  async function tvAndRoom() {
    const tv = await connect(app.wsUrl);
    tv.send({t: 'hello', role: 'tv'});
    const room = await tv.next('room');
    await tv.next('players');
    return {tv, code: room.code as string, room};
  }

  async function phone(code: string, name: string, playerId?: string, ageGroup?: string) {
    const p = await connect(app.wsUrl);
    p.send({t: 'hello', role: 'phone', room: code, name, playerId, ageGroup});
    return p;
  }

  test('TV creates a room with a safe code and a join URL', async () => {
    const {tv, code, room} = await tvAndRoom();
    expect(code).toMatch(new RegExp(`^[${CODE_ALPHABET}]{4}$`));
    expect(CODE_ALPHABET).not.toMatch(/[AEIOULQ01]/);
    expect(room.joinUrl).toBe(`http://test.local:8787/j/${code}`);
    await tv.close();
  });

  test('phones join with colours, players broadcast to everyone, ping/pong', async () => {
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code.toLowerCase(), '  Mia ');
    const joined = await mia.next('joined');
    expect(joined).toMatchObject({room: code, color: PLAYER_COLORS[0], phase: 'lobby'});
    const players = (await tv.next('players')).players;
    expect(players).toEqual([{id: joined.playerId, name: 'Mia', ageGroup: 'big', color: PLAYER_COLORS[0], connected: true}]);
    expect((await mia.next('players')).players).toEqual(players);

    const leo = await phone(code, 'Leo', undefined, 'little');
    expect((await leo.next('joined')).color).toBe(PLAYER_COLORS[1]);
    const both = (await mia.next('players')).players;
    expect(both.map((p: any) => [p.name, p.ageGroup])).toEqual([['Mia', 'big'], ['Leo', 'little']]);
    expect((await tv.next('players')).players).toEqual(both);

    mia.send({t: 'ping'});
    expect(await mia.next('pong')).toEqual({t: 'pong'});
    await Promise.all([tv.close(), mia.close(), leo.close()]);
  });

  test('relays input to the TV and phase to the phones', async () => {
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code, 'Mia');
    const {playerId} = await mia.next('joined');
    const leo = await phone(code, 'Leo');
    await leo.next('joined');

    mia.send({t: 'input', kind: 'tap', at: 42});
    expect(await tv.next('input')).toEqual({t: 'input', playerId, kind: 'tap', at: 42});
    mia.send({t: 'input', kind: 'shout', at: 43});
    expect(await tv.next('input')).toEqual({t: 'input', playerId, kind: 'shout', at: 43});
    mia.send({t: 'input', kind: 'scream', at: 44});
    expect((await mia.next('error')).code).toBe('bad_message');

    tv.send({t: 'phase', phase: 'race', data: {laps: 1}});
    for (const p of [mia, leo]) expect(await p.next('phase')).toEqual({t: 'phase', phase: 'race', data: {laps: 1}});

    // wrong role for each message type
    mia.send({t: 'phase', phase: 'results'});
    expect((await mia.next('error')).code).toBe('bad_message');
    tv.send({t: 'input', kind: 'tap', at: 1});
    expect((await tv.next('error')).code).toBe('bad_message');
    expect(leo.queue.filter(m => m.t === 'phase')).toHaveLength(0);

    // a phone joining mid-game learns the phase
    const zoe = await phone(code, 'Zoe');
    expect((await zoe.next('joined')).phase).toBe('race');
    expect(await zoe.next('phase')).toEqual({t: 'phase', phase: 'race', data: {laps: 1}});
    await Promise.all([tv.close(), mia.close(), leo.close(), zoe.close()]);
  });

  test('bad frames get an error and the connection survives', async () => {
    const c = await connect(app.wsUrl);
    for (const bad of ['garbage', '{"t":"input","kind":"tap","at":1}', '{"t":"phase","phase":"race"}', '{"t":"hello","role":"phone","room":"QQQQ","name":"x"}']) {
      c.send(bad);
      const err = await c.next('error');
      expect(['bad_message', 'no_room']).toContain(err.code);
      expect(typeof err.message).toBe('string');
    }
    c.ws.send(new Uint8Array([1, 2, 3]));
    expect((await c.next('error')).code).toBe('bad_message');
    c.send({t: 'ping'});
    await c.next('pong');
    await c.close();
  });

  test('unknown room, empty name and full room', async () => {
    const {tv, code} = await tvAndRoom();
    const lost = await phone('QQQQ', 'Mia');
    expect((await lost.next('error')).code).toBe('no_room');
    const blank = await phone(code, ' \n ');
    expect((await blank.next('error')).code).toBe('bad_message');
    const phones = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = await phone(code, `Kid${i}`);
      expect((await p.next('joined')).color).toBe(PLAYER_COLORS[i]);
      phones.push(p);
    }
    const extra = await phone(code, 'Late');
    expect((await extra.next('error')).code).toBe('room_full');
    await Promise.all([tv, lost, blank, extra, ...phones].map(c => c.close()));
  });

  test('phone reconnects with its playerId and keeps its state', async () => {
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code, 'Mia', undefined, 'grownup');
    const first = await mia.next('joined');
    await tv.next('players');
    await mia.close();
    const offline = (await tv.next('players')).players;
    expect(offline[0]).toMatchObject({id: first.playerId, ageGroup: 'grownup', connected: false});

    const again = await phone(code, 'Mia', first.playerId);
    const second = await again.next('joined');
    expect(second).toMatchObject({playerId: first.playerId, color: first.color});
    expect((await tv.next('players')).players).toEqual([{...offline[0], connected: true}]);

    again.send({t: 'input', kind: 'jump', at: 7});
    expect(await tv.next('input')).toMatchObject({playerId: first.playerId});
    await Promise.all([tv.close(), again.close()]);
  });

  test('TV reconnects to its room (and recreates it after a server restart)', async () => {
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code, 'Mia');
    await mia.next('joined');
    await tv.close();

    const tv2 = await connect(app.wsUrl);
    tv2.send({t: 'hello', role: 'tv', room: code});
    expect((await tv2.next('room')).code).toBe(code);
    expect((await tv2.next('players')).players.map((p: any) => p.name)).toEqual(['Mia']);
    mia.send({t: 'input', kind: 'hold', at: 1});
    expect(await tv2.next('input')).toMatchObject({kind: 'hold'});

    app.hub.rooms.delete(code); // as if the server restarted
    const tv3 = await connect(app.wsUrl);
    tv3.send({t: 'hello', role: 'tv', room: code});
    expect((await tv3.next('room')).code).toBe(code);
    expect((await tv3.next('players')).players).toEqual([]);
    await Promise.all([tv2.close(), tv3.close(), mia.close()]);
  });
});
