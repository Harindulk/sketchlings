import {describe, expect, test} from 'bun:test';
import type {Sketchling} from '../../shared/protocol';
import {ABILITY_LABEL, GENERIC_FEATURE} from '../src/ability';
import {analyze, balanceStats, generatePersona, offlinePersona, sanitizePersona, type Claude, type Persona} from '../src/persona';
import {readPngSize} from '../src/png';
import {drawBlob, encodePng} from './helpers';

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

function expectValid(p: Persona) {
  for (const k of ['name', 'title', 'personality', 'catchphrase', 'intro', 'winLine'] as const) {
    expect(typeof p[k]).toBe('string');
    expect(p[k].length).toBeGreaterThan(0);
    expect(p[k]).not.toMatch(/[\n\r\t]/);
  }
  expect(words(p.catchphrase)).toBeLessThanOrEqual(8);
  expect(words(p.intro)).toBeLessThanOrEqual(20);
  expect(words(p.winLine)).toBeLessThanOrEqual(12);
  const {speed, jump, power} = p.stats;
  for (const s of [speed, jump, power]) {
    expect(Number.isInteger(s)).toBe(true);
    expect(s).toBeGreaterThanOrEqual(1);
    expect(s).toBeLessThanOrEqual(5);
  }
  expect(speed + jump + power).toBeGreaterThanOrEqual(7);
  expect(speed + jump + power).toBeLessThanOrEqual(11);
  expect(['walk', 'hop', 'fly', 'roll']).toContain(p.move);
  expect(p.ability.kind).toBe(p.move);
  expect(p.ability.label).toBe(ABILITY_LABEL[p.move]);
  expect(words(p.ability.feature)).toBeGreaterThan(0);
  expect(words(p.ability.feature)).toBeLessThanOrEqual(4);
  expect(p.colors.length).toBeGreaterThan(0);
  for (const c of p.colors) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  expect(p.eyes.length).toBeLessThanOrEqual(4);
  for (const e of p.eyes) {
    for (const v of [e.x, e.y]) expect(v >= 0 && v <= 1).toBe(true);
    expect(e.r > 0 && e.r <= 0.25).toBe(true);
  }
}

const png = (w: number, h: number, fill: [number, number, number], seed = 0) => encodePng(w, h, drawBlob(w, h, fill, seed));
const persona = (b: Uint8Array) => offlinePersona(analyze(b, readPngSize(b)!));

describe('offline persona', () => {
  test('is deterministic for the same image', () => {
    const b = png(64, 48, [40, 160, 60]);
    expect(persona(b)).toEqual(persona(b.slice()));
    expect(persona(b).source).toBe('offline');
  });

  test('differs between drawings and fills every field within limits', () => {
    const names = new Set<string>();
    for (let i = 0; i < 12; i++) {
      const p = persona(png(40 + i * 3, 30 + i * 5, [(i * 50) % 256, (i * 90) % 256, (i * 130) % 256], i));
      expectValid(p);
      names.add(`${p.name} ${p.title}`);
    }
    expect(names.size).toBeGreaterThan(8);
  });

  test('picks up the dominant ink colours, ignoring transparency', () => {
    const f = analyze(png(80, 80, [230, 30, 40]), {width: 80, height: 80});
    expect(f.family).toBe('red');
    const [r, g, b] = [1, 3, 5].map(i => parseInt(f.colors[0]!.slice(i, i + 2), 16));
    expect(r!).toBeGreaterThan(180);
    expect(g!).toBeLessThan(80);
    expect(b!).toBeLessThan(80);
    expect(f.colors.some(c => parseInt(c.slice(1, 3), 16) < 60)).toBe(true); // the dark outline
  });

  test('shape drives the creature: tall vs wide', () => {
    expect(persona(png(30, 90, [50, 90, 230])).title).toMatch(/Giraffe|Rocket|Penguin|Llama|Beanstalk|Lighthouse|Flamingo|Cactus/);
    expect(persona(png(90, 30, [50, 90, 230])).title).toMatch(/Whale|Turtle|Caterpillar|Snail|Walrus|Hedgehog|Seal|Ladybug/);
  });

  test('stays within limits for thousands of random features', () => {
    for (let seed = 1; seed < 3000; seed++) {
      const p = offlinePersona({seed, colors: ['#123456'], family: 'blue', aspect: (seed % 40) / 10 + 0.1, ink: (seed % 100) / 100, eyes: [], kind: (['walk', 'hop', 'fly', 'roll'] as const)[seed % 4]!});
      expectValid(p);
    }
  });

  test('still works when the PNG body cannot be decoded', () => {
    const b = png(50, 50, [255, 200, 0]);
    b.fill(1, 45, b.length - 12);
    expectValid(persona(b));
  });
});

describe('persona validation', () => {
  const fallback = persona(png(60, 60, [120, 60, 200]));

  test('balanceStats clamps and keeps the total in 7-11', () => {
    expect(balanceStats({speed: 5, jump: 5, power: 5})).toEqual({speed: 3, jump: 4, power: 4});
    expect(balanceStats({speed: 1, jump: 1, power: 1})).toEqual({speed: 3, jump: 2, power: 2});
    expect(balanceStats({speed: 99, jump: -4, power: NaN})).toEqual({speed: 5, jump: 1, power: 3});
    expect(balanceStats({speed: 2.6, jump: 2.4, power: 3})).toEqual({speed: 3, jump: 2, power: 3});
  });

  test('garbage model output falls back field by field', () => {
    for (const raw of [null, 42, 'nope', [], {}, {stats: 'fast', move: 'teleport', colors: 'red'}]) {
      const p = {...sanitizePersona(raw, fallback), source: 'claude' as const};
      expectValid(p);
      expect(p.name).toBe(fallback.name);
      expect(p.move).toBe(fallback.move);
      expect(p.colors).toEqual(fallback.colors);
      expect(p.eyes).toEqual(fallback.eyes);
    }
  });

  test('clamps lengths, strips emoji/control chars, coerces stats, filters colours', () => {
    const p = sanitizePersona(
      {
        name: '  Sir\nWobbleton 🐸  ',
        title: 'the Brave Potato',
        personality: 'Loves naps. '.repeat(30),
        catchphrase: 'one two three four five six seven eight nine ten',
        intro: Array(40).fill('word').join(' '),
        winLine: 'I won!\u0000​',
        stats: {speed: '5', jump: 9, power: 4.6},
        move: 'hop',
        colors: ['#FF00AA', 'red', '#12345', 7, '#00ff00', '#ff00aa', '#0000ff', '#ffffff'],
        eyes: [{x: 0.3, y: 0.25, r: 0.05}, {x: 1.02, y: -0.01, r: 0.9}, {x: 340, y: 120, r: 12}, {x: '0.5', y: 0.5, r: 0.1}, null, {x: 0.7, y: 0.25, r: 0.001}, {x: 0.5, y: 0.6, r: 0.04}, {x: 0.1, y: 0.1, r: 0.1}, {x: 0.2, y: 0.2, r: 0.1}],
      },
      fallback,
    );
    expectValid({...p, source: 'claude'});
    expect(p.name).toBe('Sir Wobbleton');
    expect(p.title).toBe('the Brave Potato');
    expect(p.personality.length).toBeLessThanOrEqual(120);
    expect(words(p.catchphrase)).toBe(8);
    expect(words(p.intro)).toBe(20);
    expect(p.winLine).toBe('I won!');
    expect(p.stats.speed + p.stats.jump + p.stats.power).toBeLessThanOrEqual(11);
    expect(p.move).toBe('hop');
    expect(p.colors).toEqual(['#ff00aa', '#00ff00', '#0000ff']);
    // pixel coords, strings and r > 0.5 dropped; slightly-out values clamped; max 4
    expect(p.eyes).toEqual([{x: 0.3, y: 0.25, r: 0.05}, {x: 0.7, y: 0.25, r: 0.01}, {x: 0.5, y: 0.6, r: 0.04}, {x: 0.1, y: 0.1, r: 0.1}]);
    expect(sanitizePersona({eyes: []}, fallback).eyes).toEqual([]); // model says none: trust it
    expect(sanitizePersona({eyes: [{x: 1.02, y: -0.01, r: 0.3}]}, fallback).eyes).toEqual([{x: 1, y: 0, r: 0.25}]);
  });
});

describe('generatePersona', () => {
  const b = png(64, 64, [30, 120, 220]);
  const size = readPngSize(b)!;
  const fake = (create: () => Promise<unknown>) => ({model: 'test-model', client: {beta: {messages: {create}}}}) as unknown as Claude;
  const reply = (text: string, stop_reason = 'end_turn') => async () => ({stop_reason, content: [{type: 'thinking', thinking: ''}, {type: 'text', text}]});

  test('no key -> offline', async () => {
    expect((await generatePersona(b, size, null)).source).toBe('offline');
  });

  test('API error, bad JSON or refusal -> offline, never throws', async () => {
    const cases = [
      async () => {
        throw new Error('timeout');
      },
      reply('not json'),
      reply('{}', 'refusal'),
      reply('{"name": "cut off', 'max_tokens'),
    ];
    for (const create of cases) {
      const p = await generatePersona(b, size, fake(create));
      expect(p).toEqual(await generatePersona(b, size, null));
    }
  });

  test('model output is clamped and marked as claude', async () => {
    const p = await generatePersona(
      b,
      size,
      fake(reply(JSON.stringify({name: 'Captain Squiggle', title: 'the Moon Jelly', stats: {speed: 5, jump: 5, power: 5}, move: 'fly', colors: ['#3366ff']}))),
    );
    expectValid(p);
    expect(p.source).toBe('claude');
    expect(p.name).toBe('Captain Squiggle');
    expect(p.stats.speed + p.stats.jump + p.stats.power).toBe(11);
    expect(p.colors).toEqual(['#3366ff']);
    expect(p.ability).toEqual({kind: 'fly', feature: GENERIC_FEATURE.fly, label: ABILITY_LABEL.fly}); // no feature given
    const s: Omit<Sketchling, 'id' | 'playerId' | 'spriteUrl' | 'width' | 'height'> = p; // type matches the protocol
    expect(s).toBeTruthy();
  });

  test('asks the model for a move earned by a visible feature', async () => {
    let params: any;
    await generatePersona(b, size, fake(async (p?: unknown) => ((params = p), {stop_reason: 'end_turn', content: [{type: 'text', text: '{}'}]})) as never);
    expect(params.output_config.format.schema.required).toContain('ability');
    expect(params.output_config.format.schema.properties.ability.properties.feature.type).toBe('string');
    expect(params.system).toMatch(/FEATURE YOU CAN SEE/);
    expect(params.system).toMatch(/fly: wings/);
  });

  test('ability follows the model move: feature clamped, kind = move, label fixed', async () => {
    const ask = async (o: object) => generatePersona(b, size, fake(reply(JSON.stringify(o))));
    const offline = await generatePersona(b, size, null);

    const a = await ask({move: 'fly', ability: {kind: 'roll', feature: '  Big sparkly 🦋 wings that flap a lot ', label: 'Can do anything!'}});
    expect(a.move).toBe('fly');
    expect(a.ability).toEqual({kind: 'fly', feature: 'Big sparkly wings that', label: ABILITY_LABEL.fly});
    expectValid(a);

    const h = await ask({move: 'hop', ability: {feature: 42}});
    expect(h.ability).toEqual({kind: 'hop', feature: GENERIC_FEATURE.hop, label: ABILITY_LABEL.hop});

    // no valid move from the model: move and ability both come from the offline guess, never a mismatched pair
    const c = await ask({move: 'teleport', ability: {feature: 'rocket boots'}});
    expect(c.move).toBe(offline.move);
    expect(c.ability).toEqual(offline.ability);
  });
});
