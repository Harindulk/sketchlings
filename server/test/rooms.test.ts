import {afterAll, describe, expect, setSystemTime, spyOn, test} from 'bun:test';
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
    // optional additions; frames without them parse as before
    expect(parseClientMsg('{"t":"hello","role":"tv","aiPersonas":false}')).toEqual({t: 'hello', role: 'tv', room: undefined, aiPersonas: false});
    expect(parseClientMsg('{"t":"hello","role":"tv","room":"BCDF","aiPersonas":true}')).toEqual({t: 'hello', role: 'tv', room: 'BCDF', aiPersonas: true});
    expect(parseClientMsg('{"t":"ping","rtt":41.5}')).toEqual({t: 'ping'}); // an old phone's rtt is ignored, still a ping
    const key = 'k'.repeat(16);
    expect(parseClientMsg(JSON.stringify({t: 'hello', role: 'phone', room: 'BCDF', name: 'Mia', key}))).toMatchObject({key});
    for (const bad of ['short', 'k'.repeat(65), 5]) expect(typeof parseClientMsg(JSON.stringify({t: 'hello', role: 'phone', room: 'BCDF', name: 'Mia', key: bad}))).toBe('string');
    expect(parseClientMsg('{"t":"ability","kind":"fly"}')).toEqual({t: 'ability', kind: 'fly'});
    expect(parseClientMsg('{"t":"clearHall"}')).toEqual({t: 'clearHall'});
    expect(parseClientMsg('{"t":"removePlayer","playerId":"p1"}')).toEqual({t: 'removePlayer', playerId: 'p1'});
    expect(parseClientMsg('{"t":"deleteCreature","id":"c1","x":1}')).toEqual({t: 'deleteCreature', id: 'c1'});
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
      '{"t":"hello","role":"tv","aiPersonas":"no"}',
      '{"t":"ability"}',
      '{"t":"ability","kind":"swim"}',
      '{"t":"removePlayer"}',
      '{"t":"removePlayer","playerId":5}',
      '{"t":"deleteCreature"}',
      '{"t":"deleteCreature","id":null}',
    ]) {
      expect(typeof parseClientMsg(bad)).toBe('string');
    }
    expect(typeof parseClientMsg(Buffer.from('{"t":"ping"}'))).toBe('string');
  });

  test('cleans player names: first word, letters only, at most 12, word guard, "Artist" fallback', () => {
    const cases: [string, string][] = [
      ['  Mia\n\u0000 <b>Rose</b> the Great Explorer ', 'Mia'],
      ['mia rose', 'mia'],
      ['Anne-Marie', 'Anne-Marie'],
      ["O'Neil", "O'Neil"],
      ['D’Andre', 'D’Andre'],
      ['Zoe\u0308', 'Zoë'], // combining mark -> one letter
      ['සුනිල්', 'සුනිල්'], // Sinhala keeps its vowel signs
      ['\u0DC1\u0DCA\u200D\u0DBB\u0DD2\u0DBA\u0DCF\u0DB1\u0DD2', 'ශ්‍රියානි'], // and the ZWJ that joins ශ්‍ර
      ['க்\u200Cஷமா', 'க்\u200Cஷமா'], // an inner ZWNJ stays too
      ['\u200DMia\u200C \u200DLeo', 'Mia'], // joiners at a word's edge go
      ['Mi\u200Ba\u2066\u00AD', 'Mia'], // other format characters still go
      ['Maximilianu\u200Ds', 'Maximilianu'], // the cut at 12 leaves no dangling joiner
      ['Ki\u200Dll', 'Artist'], // a joiner can't hide a word from the guard
      ['小龙', '小龙'],
      ['Mia2', 'Mia'],
      ['-Mia-', 'Mia'],
      ['Maximilianus', 'Maximilianus'], // exactly 12
      ['Bartholomew-James', 'Bartholomew'], // cut at 12, no dangling hyphen
      ['Killian', 'Killian'], // whole words only
      ['Elsa', 'Elsa'], // brand and character words guard personas, not real first names
      ['Mario', 'Mario'],
      ['Stupid', 'Artist'],
      ['KILL', 'Artist'],
      ['123', 'Artist'],
      ['🦄', 'Artist'],
      ['<3', 'Artist'],
    ];
    for (const [raw, want] of cases) expect([raw, cleanName(raw)]).toEqual([raw, want]);
    for (const blank of [' ​ ', '', ' \n ', '\u0000', ' \u200D\u200C ']) expect(cleanName(blank)).toBe(''); // blank stays a "type your name" error
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

  test('logs each player\'s Wi-Fi round trip once per race (median/p90 of the server\'s WebSocket pings)', async () => {
    const log = spyOn(console, 'log');
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code, 'Mia');
    await mia.next('joined');
    const leo = await phone(code, 'Leo');
    await leo.next('joined');
    const net = () => log.mock.calls.map(c => String(c[0])).filter(l => l.startsWith('[net]'));
    const slots = () => [...app.hub.rooms.get(code)!.slots.values()];
    tv.send({t: 'phase', phase: 'race'}); // the first ping goes out at once; the clients answer it themselves
    await mia.next('phase');
    for (let i = 0; i < 40 && !slots().every(s => s.rtt?.length); i++) await Bun.sleep(25);
    tv.send({t: 'phase', phase: 'results'});
    await mia.next('phase');
    expect(net()).toHaveLength(1);
    expect(net()[0]).toMatch(/^\[net\] race rtt ms \(median\/p90\): Mia \d+\/\d+ n=1, Leo \d+\/\d+ n=1$/);
    await Bun.sleep(50);
    expect(net()).toHaveLength(1); // no pings outside a race
    log.mockRestore();
    await Promise.all([tv.close(), mia.close(), leo.close()]);
  });

  test('logs each player\'s inputs once per race: taps/s with a hold as 4 a second, hold time, jumps, roars', async () => {
    const log = spyOn(console, 'log');
    const {tv, code} = await tvAndRoom();
    const mia = await phone(code, 'Mia', undefined, 'little');
    await mia.next('joined');
    const dad = await phone(code, 'Dad', undefined, 'grownup');
    await dad.next('joined');
    const race = () => log.mock.calls.map(c => String(c[0])).filter(l => l.startsWith('[race]'));
    const input = async (p: typeof mia, kind: string) => {
      p.send({t: 'input', kind, at: 0});
      await tv.next('input'); // relayed, so the server has counted it
    };
    const t0 = Date.now();
    try {
      await input(mia, 'tap'); // before the race: not counted
      tv.send({t: 'phase', phase: 'race'});
      await mia.next('phase');
      for (let i = 0; i < 3; i++) await input(mia, 'tap');
      await input(mia, 'jump');
      await input(mia, 'shout');
      setSystemTime(t0 + 1000);
      await input(mia, 'hold');
      setSystemTime(t0 + 1500);
      await input(mia, 'hold'); // the phone repeats it every 0.5 s
      setSystemTime(t0 + 3000);
      await input(mia, 'release');
      await input(dad, 'tap');
      await input(dad, 'tap');
      await input(dad, 'shout');
      setSystemTime(t0 + 5000);
      await input(dad, 'hold'); // still holding when the race ends
      setSystemTime(t0 + 10_000);
      tv.send({t: 'phase', phase: 'results'});
      await mia.next('phase');
      expect(race()).toEqual([
        '[race] inputs over 10.0s: Mia little taps/s 1.1 hold 2.0s jumps 1 roars 1; Dad grownup taps/s 2.2 hold 5.0s jumps 0 roars 1',
      ]);
      await input(dad, 'tap'); // after the race: not counted, nothing more logged
      expect(race()).toHaveLength(1);
    } finally {
      setSystemTime();
      log.mockRestore();
    }
    await Promise.all([tv.close(), mia.close(), dad.close()]);
  });

  test('a known playerId takes its player back only with the key the player joined with', async () => {
    const {tv, code} = await tvAndRoom();
    const key = crypto.randomUUID();
    const mia = await connect(app.wsUrl);
    mia.send({t: 'hello', role: 'phone', room: code, name: 'Mia', key});
    const {playerId} = await mia.next('joined');
    await mia.close(); // Mia's phone drops; she has the id and the key, the thief only the id
    const thief = await connect(app.wsUrl);
    thief.send({t: 'hello', role: 'phone', room: code, name: 'x', playerId}); // the id from a players frame, no key
    expect((await thief.next('joined')).playerId).not.toBe(playerId);
    const back = await connect(app.wsUrl);
    back.send({t: 'hello', role: 'phone', room: code, name: 'Mia', playerId, key});
    expect((await back.next('joined')).playerId).toBe(playerId);
    await Promise.all([tv.close(), thief.close(), back.close()]);
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

describe('replaced sockets and ghost players', () => {
  const GRACE = 400;
  const app = startTestServer({ghostGraceMs: GRACE});
  afterAll(() => app.stop());
  const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

  async function setup() {
    const tv = await connect(app.wsUrl);
    tv.send({t: 'hello', role: 'tv'});
    const code = (await tv.next('room')).code as string;
    await tv.next('players');
    const mia = await connect(app.wsUrl);
    mia.send({t: 'hello', role: 'phone', room: code, name: 'Mia'});
    const {playerId} = await mia.next('joined');
    await tv.next('players');
    return {tv, code, mia, playerId: playerId as string};
  }

  test('a re-hello with the same playerId closes the old socket without a false disconnect', async () => {
    const {tv, code, mia, playerId} = await setup();
    const closed = new Promise<number>(r => (mia.ws.onclose = e => r(e.code)));
    const tab2 = await connect(app.wsUrl);
    tab2.send({t: 'hello', role: 'phone', room: code, name: 'Mia', playerId});
    expect((await tab2.next('joined')).playerId).toBe(playerId);
    expect(await closed).toBe(1000);
    expect((await tv.next('players')).players).toMatchObject([{id: playerId, connected: true}]);

    await wait(GRACE + 100); // past the grace period: the old socket's close must not have dropped or disconnected her
    expect(tv.queue.filter(m => m.t === 'players')).toHaveLength(0);
    tab2.send({t: 'input', kind: 'tap', at: 1});
    expect(await tv.next('input')).toMatchObject({playerId});
    await Promise.all([tv.close(), tab2.close()]);
  });

  test('a player who leaves without a sketchling is dropped after the grace period; one with a sketchling stays', async () => {
    const {tv, code, mia, playerId} = await setup();
    const leo = await connect(app.wsUrl);
    leo.send({t: 'hello', role: 'phone', room: code, name: 'Leo'});
    const leoId = (await leo.next('joined')).playerId;
    await tv.next('players');
    app.hub.rooms.get(code)!.slots.get(leoId)!.player.sketchling = {id: 'x', name: 'Blob'} as any;

    await Promise.all([mia.close(), leo.close()]);
    const offline = async () => (await tv.next('players')).players.map((p: any) => [p.name, p.connected]);
    expect(await offline()).toEqual([['Mia', false], ['Leo', true]]);
    expect(await offline()).toEqual([['Mia', false], ['Leo', false]]);
    expect(await offline()).toEqual([['Leo', false]]); // Mia is gone, Leo's creature stays
    expect(app.hub.rooms.get(code)!.slots.has(playerId)).toBe(false);

    // her old id now joins as a new player
    const back = await connect(app.wsUrl);
    back.send({t: 'hello', role: 'phone', room: code, name: 'Mia', playerId});
    expect((await back.next('joined')).playerId).not.toBe(playerId);
    await Promise.all([tv.close(), back.close()]);
  });

  test('a player who reconnects within the grace period keeps the slot', async () => {
    const {tv, code, mia, playerId} = await setup();
    const slots = app.hub.rooms.get(code)!.slots;
    await mia.close();
    expect((await tv.next('players')).players).toMatchObject([{id: playerId, connected: false}]);
    await wait(GRACE * 0.75);
    const again = await connect(app.wsUrl);
    again.send({t: 'hello', role: 'phone', room: code, name: 'Mia', playerId});
    expect((await again.next('joined')).playerId).toBe(playerId);
    expect((await tv.next('players')).players).toMatchObject([{id: playerId, connected: true}]);

    // leaves again: the first disconnect's timer must not drop her early
    await again.close();
    expect((await tv.next('players')).players).toMatchObject([{id: playerId, connected: false}]);
    await wait(GRACE * 0.5);
    expect(slots.has(playerId)).toBe(true);
    expect((await tv.next('players', GRACE * 2)).players).toEqual([]);
    await tv.close();
  });
});
