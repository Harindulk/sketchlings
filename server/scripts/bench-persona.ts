// Persona benchmark: `bun scripts/bench-persona.ts [runs per drawing = 5] [raw.json]`, run from server/ so Bun loads
// server/.env the way the server does. Calls the real path (makeClaude + generatePersona) one call at a time on every
// drawing it finds: the scans in data/sprites that Claude already saw (hall.json source claude, deduplicated), the
// doodle-cutout example cut-outs, and the six fake-phone sample drawings (listed separately). Costs real money: it
// estimates the total from the first 5 calls' tokens and stops if that would pass MAX_USD. Results go to
// notes/bench-persona.md by hand.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join, relative} from 'node:path';
import {MOVES} from '../src/ability';
import {cleanEyes} from '../src/eyes';
import {analyze, cleanText, generatePersona, makeClaude, offlinePersona, sanitizePersona, type Persona} from '../src/persona';
import {readPngSize} from '../src/png';

const ROOT = join(import.meta.dir, '../..');
const MAX_USD = 3;
const PRICE = {in: 4, out: 20}; // $ per MTok, Opus 5.5 list price (same as persona.ts logs)
const runs = Number(process.argv[2]) || 5;
const rawOut = process.argv[3];

const env = process.env;
const claude = makeClaude({apiKey: env.ANTHROPIC_API_KEY, model: env.SKETCHLINGS_MODEL, baseURL: env.SKETCHLINGS_ANTHROPIC_BASE_URL, workspaceId: env.ANTHROPIC_WORKSPACE_ID});
if (!claude) {
  console.error('No ANTHROPIC_API_KEY: run from server/ with server/.env in place.');
  process.exit(1);
}

// ---------- inputs ----------

const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
const pngs = (dir: string, keep = (_: string) => true) =>
  existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.png') && keep(f)).sort().map(f => join(dir, f)) : [];

const SAMPLES = ['dino', 'star', 'hedgehog', 'cloud', 'frog', 'potato'].map(n => join(ROOT, 'tv/src/assets/art', `${n}.png`)); // tv/scripts/fake-phones.mjs
const sampleHashes = new Set(SAMPLES.map(p => sha(readFileSync(p))));
const seen = new Set<string>(sampleHashes);
const inputs: {path: string; group: 'scan' | 'library' | 'sample'; png: Uint8Array}[] = [];
const add = (path: string, group: 'scan' | 'library' | 'sample') => {
  const png = new Uint8Array(readFileSync(path));
  const h = sha(png);
  if (group !== 'sample' && seen.has(h)) return; // a fake-phone upload or a repeat of the same file
  seen.add(h);
  inputs.push({path, group, png});
};
// Only drawings Claude already saw: a room with AI personas off (source offline) or an orphan sprite never reaches the API here.
const hallPath = join(ROOT, 'server/data/hall.json');
const sent = new Set(existsSync(hallPath) ? (JSON.parse(readFileSync(hallPath, 'utf8')) as {id: string; source?: string}[]).filter(s => s.source === 'claude').map(s => `${s.id}.png`) : []);
pngs(join(ROOT, 'server/data/sprites'), f => sent.has(f)).forEach(p => add(p, 'scan'));
pngs(join(ROOT, 'packages/doodle-cutout/examples'), f => f.endsWith('-sprite.png')).forEach(p => add(p, 'library'));
SAMPLES.forEach(p => add(p, 'sample'));

// ---------- one call ----------

interface Row {
  file: string;
  group: string;
  run: number;
  source: string;
  ms: number; // generatePersona wall time: image analysis + offline persona + Claude
  apiMs?: number; // the messages.create call alone
  model?: string;
  inTok?: number;
  outTok?: number;
  usd?: number;
  name: string;
  move: string;
  feature: string;
  offlineMove: string;
  eyesReturned: number; // eyes in Claude's raw JSON
  eyesKept: number; // after cleanEyes
  drewEyes: boolean;
  unsafe: string[]; // fields the word guard replaced
  fallbacks: string[]; // fields that fell back to the offline persona's value
  rebalanced: boolean; // stats changed by balanceStats
  error?: string;
}

// Capture the response the real askClaude() gets, so tokens and raw JSON can be read without changing persona.ts.
type Res = {model: string; usage: {input_tokens: number; output_tokens: number}; content: {type: string; text?: string}[]} | null;
let lastRes: Res = null;
let lastApiMs: number | undefined;
const messages = claude.client.beta.messages;
const create = messages.create.bind(messages);
messages.create = (async (...args: Parameters<typeof create>) => {
  const t = performance.now();
  const res = await create(...args);
  lastApiMs = Math.round(performance.now() - t);
  lastRes = res as unknown as Res;
  return res;
}) as typeof create;

// Collect the [persona] warnings (word guard, Claude failure) while still printing them.
let warns: string[] = [];
let mute = false;
const warn = console.warn;
console.warn = (...a: unknown[]) => {
  if (mute) return;
  warns.push(a.map(String).join(' '));
  warn(...a);
};

const MARK = '\u0000fallback';
const TEXT = ['name', 'title', 'personality', 'catchphrase', 'intro', 'winLine'] as const;

function fallbacksOf(raw: Record<string, unknown>, offline: Persona): {fields: string[]; rebalanced: boolean} {
  const sentinel = {...offline, colors: [MARK], eyes: [], ability: {...offline.ability, feature: MARK}} as Persona;
  for (const k of TEXT) sentinel[k] = MARK;
  mute = true; // the guard already warned once during the real call
  const out = sanitizePersona(raw, sentinel);
  mute = false;
  const fields: string[] = TEXT.filter(k => out[k] === MARK);
  if (!MOVES.includes(raw.move as never)) fields.push('move');
  else if (out.ability.feature !== cleanText((raw.ability as Record<string, unknown> | undefined)?.feature, 4, 28)) fields.push('ability.feature');
  if (out.colors[0] === MARK) fields.push('colors');
  if (cleanEyes(raw.eyes) === null) fields.push('eyes');
  const st = (raw.stats ?? {}) as Record<string, unknown>;
  const rebalanced = (['speed', 'jump', 'power'] as const).some(k => st[k] !== out.stats[k]);
  return {fields, rebalanced};
}

async function bench(input: (typeof inputs)[number], run: number): Promise<Row> {
  const size = readPngSize(input.png)!;
  const offline = offlinePersona(analyze(input.png, size));
  lastRes = null;
  lastApiMs = undefined;
  warns = [];
  const started = performance.now();
  const p = await generatePersona(input.png, size, claude, []);
  const ms = Math.round(performance.now() - started);
  const res = lastRes as Res;
  const u = res?.usage;
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(res?.content.filter(b => b.type === 'text').at(-1)?.text ?? '{}');
  } catch {}
  const fb = p.source === 'claude' ? fallbacksOf(raw, offline) : {fields: ['all'], rebalanced: false};
  return {
    file: relative(ROOT, input.path),
    group: input.group,
    run,
    source: p.source,
    ms,
    apiMs: lastApiMs,
    model: res?.model,
    inTok: u?.input_tokens,
    outTok: u?.output_tokens,
    usd: u ? (u.input_tokens * PRICE.in + u.output_tokens * PRICE.out) / 1e6 : undefined,
    name: p.name,
    move: p.move,
    feature: p.ability.feature,
    offlineMove: offline.move,
    eyesReturned: Array.isArray(raw.eyes) ? raw.eyes.length : 0,
    eyesKept: p.source === 'claude' ? (cleanEyes(raw.eyes)?.length ?? 0) : 0,
    drewEyes: raw.drewEyes === true,
    unsafe: warns.map(w => w.match(/unsafe word in (\S+)/)?.[1]).filter((f): f is string => !!f),
    fallbacks: fb.fields,
    rebalanced: fb.rebalanced,
    error: warns.find(w => w.includes('failed after')),
  };
}

// ---------- stats ----------

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  return s.length % 2 ? s[s.length >> 1]! : (s[s.length / 2 - 1]! + s[s.length / 2]!) / 2;
};
const pct = (a: number[], p: number) => [...a].sort((x, y) => x - y)[Math.max(0, Math.ceil((p / 100) * a.length) - 1)]!; // nearest rank
assert.equal(median([3, 1, 2]), 2);
assert.equal(median([4, 1, 3, 2]), 2.5);
assert.equal(pct([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 90), 9);
const s1 = (ms: number) => (ms / 1000).toFixed(1);
const usd = (n: number) => `$${n.toFixed(4)}`;

// ---------- run ----------

const total = inputs.length * runs;
console.log(`# ${inputs.length} drawings x ${runs} runs = ${total} calls, ${claude.model}, sequential`);
for (const i of inputs) console.log(`  ${i.group.padEnd(7)} ${relative(ROOT, i.path)}`);

const rows: Row[] = [];
outer: for (let run = 1; run <= runs; run++) {
  for (const input of inputs) {
    const r = await bench(input, run);
    rows.push(r);
    console.log(`${rows.length}/${total} ${r.file} run ${run}: ${r.source} ${r.ms} ms ${r.move} "${r.feature}" eyes ${r.eyesReturned} drewEyes ${r.drewEyes}${r.usd ? ` ${usd(r.usd)}` : ''}`);
    const spent = rows.reduce((s, x) => s + (x.usd ?? 0), 0);
    const priced = rows.filter(x => x.usd);
    if (priced.length === 5) {
      const est = (spent / 5) * total;
      console.log(`Estimated total from the first 5 calls: ${usd(est)} (limit $${MAX_USD})`);
      if (est > MAX_USD) {
        console.log('Stopping: the estimate is over the limit.');
        break outer;
      }
    }
    if (spent > MAX_USD) {
      console.log('Stopping: spent over the limit.');
      break outer;
    }
  }
}

// Offline persona: same drawing in, same persona out? (three analyses + the no-key path of generatePersona)
const offlineSame = await Promise.all(
  inputs.map(async i => {
    const size = readPngSize(i.png)!;
    const a = [0, 1, 2].map(() => JSON.stringify(offlinePersona(analyze(i.png, size))));
    a.push(JSON.stringify(await generatePersona(i.png, size, null)));
    return a.every(x => x === a[0]);
  }),
);

if (rawOut) writeFileSync(rawOut, JSON.stringify(rows, null, 2) + '\n');

// ---------- report (markdown) ----------

const ok = rows.filter(r => r.source === 'claude');
const ms = ok.map(r => r.ms);
const warm = ok.slice(1).map(r => r.ms);
const priced = rows.filter(r => r.usd !== undefined);
const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);
const range = (a: number[]) => `${Math.min(...a)}-${Math.max(...a)}`;
const out: string[] = [];
out.push(`\n## Summary (${new Date().toISOString().slice(0, 10)}, ${claude.model}, effort low)`);
out.push(`- Calls: ${rows.length} (${ok.length} answered by Claude, ${rows.length - ok.length} fell back to offline). Models that answered: ${[...new Set(ok.map(r => r.model))].join(', ')}.`);
if (ms.length) {
  out.push(`- Latency (generatePersona wall time, all Claude answers): median ${s1(median(ms))} s, p90 ${s1(pct(ms, 90))} s, min ${s1(Math.min(...ms))} s, max ${s1(Math.max(...ms))} s. First call ${s1(ms[0]!)} s.`);
  const api = ok.map(r => r.apiMs!).filter(Number.isFinite);
  out.push(`- API call alone (what the server logs as "answered in"): median ${s1(median(api))} s, p90 ${s1(pct(api, 90))} s, min ${s1(Math.min(...api))} s, max ${s1(Math.max(...api))} s.`);
  if (warm.length) out.push(`- Without the first call: median ${s1(median(warm))} s, p90 ${s1(pct(warm, 90))} s.`);
}
if (priced.length) {
  out.push(`- Tokens per creature: in ${range(priced.map(r => r.inTok!))} (median ${median(priced.map(r => r.inTok!))}), out ${range(priced.map(r => r.outTok!))} (median ${median(priced.map(r => r.outTok!))}).`);
  out.push(`- Cost per creature at $${PRICE.in}/$${PRICE.out} per MTok: median ${usd(median(priced.map(r => r.usd!)))}, ${usd(Math.min(...priced.map(r => r.usd!)))}-${usd(Math.max(...priced.map(r => r.usd!)))}. Total ${usd(sum(priced.map(r => r.usd!)))}.`);
}
const kinds = (rs: Row[]) => MOVES.map(m => `${m} ${rs.filter(r => r.move === m).length}`).join(', ');
out.push(`- Ability kinds over all Claude answers: ${kinds(ok)}.`);
for (const g of ['scan', 'library', 'sample']) out.push(`  - ${g}: ${kinds(ok.filter(r => r.group === g))}.`);
out.push(`- Eyes returned (non-empty list): ${ok.filter(r => r.eyesReturned).length}/${ok.length}; drewEyes (ownEyes) true: ${ok.filter(r => r.drewEyes).length}/${ok.length}; eye entries dropped by cleanEyes: ${sum(ok.map(r => r.eyesReturned - r.eyesKept))}.`);
out.push(`- Word-guard hits: ${sum(rows.map(r => r.unsafe.length))} (${rows.flatMap(r => r.unsafe.map(f => `${r.file.split('/').pop()} ${f}`)).join('; ') || 'none'}).`);
out.push(`- Schema fallbacks (a field replaced by the offline value): ${ok.filter(r => r.fallbacks.length).length}/${ok.length} calls (${ok.flatMap(r => r.fallbacks).join(', ') || 'none'}); stats changed by balanceStats: ${ok.filter(r => r.rebalanced).length}/${ok.length}.`);
out.push(`- Offline persona identical across repeats for the same drawing: ${offlineSame.filter(Boolean).length}/${inputs.length} drawings.`);

out.push('\n## Per drawing\n');
out.push('| Drawing | Group | Runs | Ability kinds | Same kind | Features | Eyes returned | drewEyes | Offline move | Median s |');
out.push('|---|---|---|---|---|---|---|---|---|---|');
let modalShare = 0;
for (const i of inputs) {
  const file = relative(ROOT, i.path);
  const rs = ok.filter(r => r.file === file);
  if (!rs.length) continue;
  const counts = MOVES.map(m => [m, rs.filter(r => r.move === m).length] as const).filter(([, n]) => n).sort((a, b) => b[1] - a[1]);
  modalShare += counts[0]![1] / rs.length;
  out.push(
    `| ${file} | ${i.group} | ${rs.length} | ${counts.map(([m, n]) => `${m} ${n}`).join(', ')} | ${counts[0]![1]}/${rs.length} | ${[...new Set(rs.map(r => r.feature))].map(f => `"${f}"`).join(', ')} | ${rs.filter(r => r.eyesReturned).length}/${rs.length} | ${rs.filter(r => r.drewEyes).length}/${rs.length} | ${rs[0]!.offlineMove} | ${s1(median(rs.map(r => r.ms)))} |`,
  );
}
const drawn = inputs.filter(i => ok.some(r => r.file === relative(ROOT, i.path))).length;
out.push(`\nSame-drawing consistency: the most common kind covers ${((modalShare / Math.max(1, drawn)) * 100).toFixed(0)}% of runs on average; ${inputs.filter(i => new Set(ok.filter(r => r.file === relative(ROOT, i.path)).map(r => r.move)).size === 1).length}/${inputs.length} drawings got one kind every run.`);

out.push('\n## Every call\n');
out.push('| # | Drawing | Run | Source | ms | API ms | In | Out | $ | Name | Kind | Feature | Eyes | drewEyes | Guard | Fallbacks |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
rows.forEach((r, n) =>
  out.push(`| ${n + 1} | ${r.file.split('/').pop()} | ${r.run} | ${r.source} | ${r.ms} | ${r.apiMs ?? ''} | ${r.inTok ?? ''} | ${r.outTok ?? ''} | ${r.usd?.toFixed(4) ?? ''} | ${r.name} | ${r.move} | ${r.feature} | ${r.eyesReturned} | ${r.drewEyes} | ${r.unsafe.join(' ')} | ${r.fallbacks.join(' ')}${r.rebalanced ? ' (stats rebalanced)' : ''} |`),
);
console.log(out.join('\n'));
