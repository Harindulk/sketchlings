import {afterAll, describe, expect, test} from 'bun:test';
import {existsSync, mkdirSync, mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {Sketchling} from '../../shared/protocol';
import {createQueue, createVoices, encodeM4a, FFMPEG, hasModel, kokoro, pickVoice, trimSilence, type Tts} from '../src/voice';
import {connect, drawBlob, encodePng, startTestServer} from './helpers';

const persona = (o: Partial<Sketchling>): Sketchling => ({
  id: crypto.randomUUID(),
  playerId: 'p',
  name: 'Captain Squiggle',
  title: 'the Moon Jelly',
  personality: 'A cheerful friend who loves pancakes.',
  catchphrase: 'Hold on to your crayons!',
  intro: 'Here comes Captain Squiggle!',
  winLine: 'High fives for everyone!',
  stats: {speed: 3, jump: 3, power: 3},
  move: 'walk',
  ability: {kind: 'walk', feature: 'big strong body', label: 'ROAR knocks back ink blots!'},
  colors: ['#2bb3ff'],
  spriteUrl: '/sprites/x.png',
  eyes: [],
  width: 10,
  height: 10,
  source: 'offline',
  ...o,
});

describe('voice selection', () => {
  test('deterministic, and follows size words, stats and honorifics', () => {
    const big = persona({name: 'King Rumble', title: 'the Grumpy Whale', personality: 'A big sleepy giant.', stats: {speed: 1, jump: 2, power: 5}});
    const tiny = persona({name: 'Little Pip', title: 'the Bubblegum Bunny', personality: 'A tiny, giggly friend.', stats: {speed: 5, jump: 4, power: 1}});
    expect(pickVoice(big)).toEqual(pickVoice(persona({...big, id: 'other'}))); // same creature, same voice
    expect(pickVoice(big)).toMatchObject({kind: 'big'});
    expect(pickVoice(big).semitones).toBeLessThan(0);
    expect(pickVoice(big).voice).toMatch(/^bm_/); // King: fancy and male
    expect(pickVoice(tiny)).toMatchObject({kind: 'tiny'});
    expect(pickVoice(tiny).semitones).toBeGreaterThan(3);
    expect(pickVoice(tiny).speed).toBeGreaterThan(pickVoice(big).speed);
    expect(pickVoice(persona({name: 'Lady Waffles'})).voice).toMatch(/^bf_/);
    expect(pickVoice(persona({name: 'Mister Zoom', title: 'the Ocean Seal'})).voice).toMatch(/^am_/);
    expect(pickVoice(persona({personality: 'She hums silly songs.'})).voice).toMatch(/^af_/);
    for (let i = 0; i < 50; i++) {
      const v = pickVoice(persona({name: `Zig ${i}`, stats: {speed: (i % 5) + 1, jump: 3, power: ((i * 3) % 5) + 1}}));
      expect(v.semitones).toBeGreaterThanOrEqual(-3.1); // intelligible range, checked with Whisper
      expect(v.semitones).toBeLessThanOrEqual(5.1);
      expect(v.speed).toBeGreaterThanOrEqual(0.87);
      expect(v.speed).toBeLessThanOrEqual(1.08);
    }
  });

  test('trimSilence keeps the speech plus a short margin', () => {
    const pcm = new Float32Array(24000);
    pcm.fill(0.5, 10000, 12000);
    const out = trimSilence(pcm, 24000);
    expect(out.length).toBe(2000 + 720 + 1440);
    expect(out[720]).toBe(0.5);
  });
});

describe('queue', () => {
  test('one job at a time; a hung job times out and the queue moves on', async () => {
    const enqueue = createQueue(80);
    let running = 0;
    let most = 0;
    const job = (v: number) => async () => {
      most = Math.max(most, ++running);
      await Bun.sleep(10);
      running--;
      return v;
    };
    let aborted = false;
    const results = await Promise.allSettled([
      enqueue(job(1)),
      enqueue(signal => new Promise(() => signal.addEventListener('abort', () => (aborted = true)))),
      enqueue(job(3)),
      enqueue(async () => {
        throw new Error('boom');
      }),
      enqueue(job(5)),
    ]);
    expect(results.map(r => (r.status === 'fulfilled' ? r.value : (r.reason as Error).message))).toEqual([1, 'timed out after 80 ms', 3, 'boom', 5]);
    expect(most).toBe(1);
    expect(aborted).toBe(true);
  });

  test('speak gives no voice when TTS is missing, hangs or fails', async () => {
    const s = persona({});
    const dir = mkdtempSync(join(tmpdir(), 'sketchlings-voice-'));
    expect(await createVoices(dir, async () => null).speak(s)).toBeUndefined();
    const hang: Tts = {clip: () => new Promise(() => {})};
    const started = Date.now();
    expect(await createVoices(dir, async () => hang, 50).speak(s)).toBeUndefined();
    expect(Date.now() - started).toBeLessThan(1000); // 3 lines x 50 ms
    const fail: Tts = {clip: async () => Promise.reject(new Error('model exploded'))};
    expect(await createVoices(dir, async () => fail).speak(s)).toBeUndefined();
  });

  test.skipIf(!existsSync(FFMPEG))('encodes fMP4 AAC clips and caches by text + voice', async () => {
    let calls = 0;
    const tone: Tts = {
      async clip(_text, v, out) {
        calls++;
        return encodeM4a(Float32Array.from({length: 12000}, (_, i) => 0.3 * Math.sin(i / 8)), 24000, v.semitones, out);
      },
    };
    const dir = mkdtempSync(join(tmpdir(), 'sketchlings-voice-'));
    const voices = createVoices(dir, async () => tone);
    const a = persona({intro: 'Same words', catchphrase: 'Same words', winLine: 'Other words'});
    expect(await voices.speak(a)).toEqual({intro: `/voice/${a.id}/intro.m4a`, catchphrase: `/voice/${a.id}/catchphrase.m4a`, winLine: `/voice/${a.id}/winLine.m4a`});
    expect(calls).toBe(2); // intro and catchphrase share one clip
    const m4a = new Uint8Array(await Bun.file(join(dir, a.id, 'intro.m4a')).arrayBuffer());
    const boxes = new TextDecoder('latin1').decode(m4a);
    expect(boxes.slice(4, 8)).toBe('ftyp');
    for (const box of ['moov', 'mvex', 'mp4a', 'moof', 'mdat']) expect(boxes).toContain(box);
    expect(boxes).not.toContain('mfra');
    await voices.speak({...a, id: crypto.randomUUID()}); // same creature again: all cached
    expect(calls).toBe(2);
  });
});

describe('GET /voice/:id/:line.m4a', () => {
  const app = startTestServer();
  afterAll(() => app.stop());
  const id = crypto.randomUUID();
  const bytes = Uint8Array.from({length: 1000}, (_, i) => i % 251);
  mkdirSync(join(app.dataDir, 'voice', id), {recursive: true});
  writeFileSync(join(app.dataDir, 'voice', id, 'intro.m4a'), bytes);

  test('serves the clip with audio/mp4, Content-Length, Range and CORS', async () => {
    const url = `${app.http}/voice/${id}/intro.m4a`;
    const full = await fetch(url);
    expect(full.status).toBe(200);
    expect(full.headers.get('content-type')).toBe('audio/mp4');
    expect(full.headers.get('content-length')).toBe('1000');
    expect(full.headers.get('accept-ranges')).toBe('bytes');
    expect(full.headers.get('access-control-allow-origin')).toBe('*');
    expect(new Uint8Array(await full.arrayBuffer())).toEqual(bytes);

    const part = await fetch(url, {headers: {Range: 'bytes=100-199'}});
    expect(part.status).toBe(206);
    expect(part.headers.get('content-range')).toBe('bytes 100-199/1000');
    expect(part.headers.get('content-length')).toBe('100');
    expect(part.headers.get('content-type')).toBe('audio/mp4');
    expect(part.headers.get('access-control-allow-origin')).toBe('*');
    expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(100, 200));

    const tail = await fetch(url, {headers: {Range: 'bytes=-10'}});
    expect(tail.status).toBe(206);
    expect(new Uint8Array(await tail.arrayBuffer())).toEqual(bytes.slice(990));
    expect((await fetch(url, {headers: {Range: 'bytes=5000-'}})).status).toBe(416);
    const head = await fetch(url, {method: 'HEAD'});
    expect(head.headers.get('content-length')).toBe('1000');
  });

  test('404 for unknown clips and odd paths', async () => {
    for (const p of [`/voice/${id}/winLine.m4a`, `/voice/${id}/hall.m4a`, `/voice/${crypto.randomUUID()}/intro.m4a`, `/voice/..%2F..%2Fhall.json/intro.m4a`]) {
      expect((await fetch(app.http + p)).status).toBe(404);
    }
  });
});

const modelsDir = join(import.meta.dir, '../models');
const canSpeak = hasModel(modelsDir) && existsSync(FFMPEG);

describe('creature voices end-to-end', () => {
  // Needs the Kokoro model (bun run tts:download); skipped without it so CI stays green.
  test.skipIf(!canSpeak)(
    'upload -> sketchling without voice -> second sketchling frame with voice URLs + hall of fame',
    async () => {
      const app = startTestServer({tts: kokoro(modelsDir)});
      const tv = await connect(app.wsUrl);
      tv.send({t: 'hello', role: 'tv'});
      const {code} = await tv.next('room');
      const kid = await connect(app.wsUrl);
      kid.send({t: 'hello', role: 'phone', room: code, name: 'Mia'});
      const {playerId} = await kid.next('joined');
      const png = encodePng(120, 90, drawBlob(120, 90, [250, 120, 200]));
      const res = await fetch(`${app.http}/api/rooms/${code}/players/${playerId}/sketch`, {method: 'POST', body: png});
      const {id} = (await res.json()) as {id: string};

      const first: Sketchling = (await tv.next('sketchling')).sketchling;
      expect(first.id).toBe(id);
      expect(first.voice).toBeUndefined(); // the reveal never waits for audio
      const second: Sketchling = (await tv.next('sketchling', 60_000)).sketchling;
      expect(second).toEqual({...first, voice: {intro: `/voice/${id}/intro.m4a`, catchphrase: `/voice/${id}/catchphrase.m4a`, winLine: `/voice/${id}/winLine.m4a`}});
      expect((await kid.next('sketchling')).sketchling).toEqual(first);
      expect((await kid.next('sketchling')).sketchling).toEqual(second);

      for (const url of Object.values(second.voice!)) {
        const r = await fetch(app.http + url);
        expect(r.status).toBe(200);
        expect(r.headers.get('content-type')).toBe('audio/mp4');
        const body = new TextDecoder('latin1').decode(await r.arrayBuffer());
        expect(body.slice(4, 8)).toBe('ftyp');
        expect(body).toContain('moof');
        expect(body.length).toBeGreaterThan(4000); // a real second or more of speech
      }
      expect(((await (await fetch(`${app.http}/api/hall-of-fame`)).json()) as Sketchling[])[0]).toEqual(second);
      await Promise.all([tv.close(), kid.close()]);
      app.stop();
    },
    90_000,
  );

  test.skipIf(!canSpeak)(
    'a timed-out clip kills the worker; the next call gets a fresh one',
    async () => {
      const tts = kokoro(modelsDir);
      const dir = mkdtempSync(join(tmpdir(), 'sketchlings-voice-'));
      const v = pickVoice(persona({}));
      const first = (await tts())!;
      const ac = new AbortController();
      const hung = first.clip('Hello there, friends!', v, join(dir, 'a.m4a'), ac.signal);
      ac.abort();
      await expect(hung).rejects.toThrow('TTS worker exited');
      const second = (await tts())!;
      expect(second).not.toBe(first);
      expect(await second.clip('Hello there, friends!', v, join(dir, 'b.m4a'))).toBeGreaterThan(500);
    },
    90_000,
  );
});
