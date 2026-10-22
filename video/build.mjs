// Builds the Sketchlings demo video from edl.json: one clip per segment (footage, cards, split-screen takes,
// overlays), joined with cuts and crossfades; voice/VO cues on the timeline; music ducked under speech;
// two-pass loudnorm to -14 LUFS; 1080p30 H.264 + AAC. Missing footage becomes a placeholder slate so the whole
// pipeline runs today. Run it through ./build.sh [out.mp4] (FINAL=1 refuses placeholders, KEEP=1 keeps out/tmp);
// ./build.sh --slots lists every footage slot and whether its file is there.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {existsSync, mkdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import {dirname, extname, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

process.chdir(dirname(fileURLToPath(import.meta.url)));
const FINAL = process.env.FINAL === '1';
const KEEP = process.env.KEEP === '1';
const SLOTS = process.argv[2] === '--slots';
const OUT = (!SLOTS && process.argv[2]) || 'out/sketchlings.mp4';
const E = JSON.parse(readFileSync(process.env.EDL || 'edl.json', 'utf8')); // EDL=edl-backup.json ./build.sh builds another timeline
const {fps: FPS, width: W, height: H} = E;
const TMP = 'out/tmp';
const CACHE = 'out/cache'; // rendered slates, captions and tags, reused by later builds
const fr = s => Math.round(s * FPS) / FPS; // whole frames, so cuts and crossfades land on frame boundaries
const XF = fr(E.fade);
const AFMT = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
// Footage sound: VVD recordings have timestamp gaps, which made a segment's sound up to 8 % short (and -shortest then
// cut the video's end); async fills the gaps with silence, so it stays in sync and full length.
const LIVE_AFMT = AFMT.replace('aresample=48000', 'aresample=48000:async=1:first_pts=0');

// ---------- helpers ----------

function run(cmd, args) {
  const r = spawnSync(cmd, args, {encoding: 'utf8', maxBuffer: 64 << 20});
  if (r.status !== 0) throw new Error(`${cmd} failed (${r.status}):\n${(r.stderr || r.error || '').toString().slice(-3000)}`);
  return r;
}
const ff = args => run('ffmpeg', ['-hide_banner', '-nostdin', '-loglevel', 'error', '-y', ...args]);
const probe = (file, args) => run('ffprobe', ['-v', 'error', ...args, '-of', 'default=nw=1:nk=1', file]).stdout.trim();
const durationOf = file => parseFloat(probe(file, ['-show_entries', 'format=duration']));
const hasAudio = file => probe(file, ['-select_streams', 'a', '-show_entries', 'stream=index']) !== '';

// A dropped file may use another extension than edl.json says (vo/hook.wav for vo/hook.m4a): accept those too.
const ALT = ['.m4a', '.wav', '.mp3', '.aiff', '.aac', '.ogg', '.mp4', '.mov', '.webm', '.mkv', '.png'];
function find(src) {
  const ok = p => existsSync(p) && statSync(p).size > 0;
  if (ok(src)) return src;
  const base = src.slice(0, -extname(src).length);
  return ALT.map(e => base + e).find(ok) ?? null;
}
// A card is rendered again when its .html is newer than its .png, so an edit without cards/render.sh never ships old.
// shortcut: only the card's own .html counts; after a style.css or img/ change, run cards/render.sh by hand.
function card(png) {
  const html = png.replace(/\.png$/, '.html');
  if (!existsSync(png) || (existsSync(html) && statSync(html).mtimeMs > statSync(png).mtimeMs)) run('cards/render.sh', [basename(png, '.png')]);
  return png;
}
// A page that takes its text from the URL hash, rendered once per text and size into out/cache.
function page(html, text, w, h) {
  const key = createHash('sha1').update([text, w, h, readFileSync(`cards/${html}`), readFileSync('cards/style.css')].join('\0')).digest('hex');
  const out = `${CACHE}/${basename(html, '.html')}-${key.slice(0, 16)}.png`;
  if (!existsSync(out)) run('cards/render.sh', ['--hash', html, text, `${w},${h}`, out]);
  return out;
}
const slate = (label, src, w, h) => page('placeholder.html', `${label}|${src}`, w, h);
// Overlays: {png} a card, {say, who} a spoken line burned in at the bottom, {tag} a label at the top right.
const overlayPng = o => (o.png ? card(o.png) : page('text.html', o.tag !== undefined ? `tag||${o.tag}` : `${o.low ? 'low' : 'say'}|${o.who ?? ''}|${o.say}`, W, H));
const mmss = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

// ---------- plan: timeline, inputs, what is missing ----------

const sources = s => (s.type === 'split' ? [s.left, s.right] : s.type === 'clip' ? [s] : []);
if (SLOTS) {
  for (const s of E.segments) for (const v of sources(s)) {
    const state = find(v.src) ? 'ok      ' : s.optional ? 'optional' : 'MISSING ';
    console.log(`${state} ${s.id.padEnd(15)} ${v.src}\n         ${v.label}${(v.guide ?? s.guide) ? `\n         ${v.guide ?? s.guide}` : ''}`);
  }
  process.exit(0);
}
// An optional slot that was not filmed leaves the final cut (music must not start or end on one); drafts show its slate.
const segs = E.segments.filter(s => !(FINAL && s.optional && sources(s).some(v => !find(v.src)))).map(s => ({...s, dur: fr(s.dur)}));
let t = 0;
segs.forEach((s, i) => {
  s.start = i === 0 ? 0 : t - (s.in === 'fade' ? XF : 0);
  t = s.start + s.dur;
});
const TOTAL = t;
const startOf = id => segs.find(s => s.id === id)?.start ?? fail(`edl: no segment "${id}"`);
const endOf = id => {
  const s = segs.find(x => x.id === id) ?? fail(`edl: no segment "${id}"`);
  return s.start + s.dur;
};
function fail(msg) {
  console.error(msg);
  process.exit(1);
}
if (TOTAL > E.maxDuration) fail(`Timeline is ${TOTAL.toFixed(2)} s, over maxDuration ${E.maxDuration} s: shorten segments in edl.json.`);

const missing = [];
for (const s of segs) {
  for (const v of sources(s)) if (!find(v.src)) missing.push(`${s.id}: ${v.src}  (${v.label})${s.optional ? ' [optional]' : ''}`);
  for (const c of s.cues ?? []) if (!find(c.src) && !c.optional) missing.push(`${s.id}: ${c.src}  (cue${c.text ? `: "${c.text}"` : ''})`);
  for (const o of s.overlays ?? []) if (/TBD/.test(o.say ?? o.tag ?? '')) missing.push(`${s.id}: text to fill in: "${o.say ?? o.tag}"`);
  for (const p of [s.type === 'card' && s.src, ...(s.overlays ?? []).map(o => o.png)].filter(Boolean)) {
    const h = p.replace(/\.png$/, '.html');
    if (existsSync(h) && /<b>TBD<\/b>/.test(readFileSync(h, 'utf8'))) missing.push(`${s.id}: ${h} still says TBD`);
  }
}
for (const m of E.music) if (!find(m.src)) missing.push(`music: ${m.src}  (see music/CREDITS.md)`);
if (FINAL && missing.length) fail(`FINAL=1 but inputs are missing:\n  ${missing.join('\n  ')}`);

rmSync(TMP, {recursive: true, force: true});
mkdirSync(TMP, {recursive: true});
mkdirSync(CACHE, {recursive: true});
mkdirSync(dirname(OUT), {recursive: true});

// ---------- one clip per segment ----------

const report = [];
const cues = []; // {file, at (global s), db}
let tts = 0;

function buildSegment(s, i) {
  const d = s.dur;
  const args = [];
  const fl = [];
  let n = 0;
  let placeholder = false;
  const input = a => (args.push(...a), n++);
  const still = (png, dd = d) => input(['-loop', '1', '-framerate', String(FPS), '-t', String(dd), '-i', png]);
  const fit = (w, h) => `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${FPS}`;
  // Footage (or its placeholder slate) fitted to w x h, exactly d seconds (a short clip holds its last frame).
  // crop [x, y, w, h] zooms into the source first; speed > 1 plays it faster (silent, for a labelled time-compression).
  function visual(v, w, h, tag) {
    const p = find(v.src);
    if (!p) {
      placeholder = true;
      fl.push(`[${still(slate(v.label, v.src, w, h))}:v]${fit(w, h)},format=yuv420p[${tag}]`);
      return null;
    }
    const sp = v.speed ?? 1;
    const k = input(['-ss', String(v.ss ?? 0), '-t', String(d * sp), '-i', p]);
    const crop = v.crop ? `crop=${v.crop[2]}:${v.crop[3]}:${v.crop[0]}:${v.crop[1]},` : '';
    fl.push(`[${k}:v]setpts=(PTS-STARTPTS)/${sp},${crop}${fit(w, h)},tpad=stop_mode=clone:stop_duration=${d},trim=duration=${d},setpts=PTS-STARTPTS,format=yuv420p[${tag}]`);
    if (v.liveDb === undefined || sp !== 1 || !hasAudio(p)) return null;
    // The VVD recorder writes its sound late (README): audioLag reads the sound from that many seconds further in.
    return {k: v.audioLag ? input(['-ss', String((v.ss ?? 0) + v.audioLag), '-t', String(d), '-i', p]) : k, db: v.liveDb};
  }

  let live = [];
  // A card with narration shrinks into the top 88 %, so its caption sits in a band below and covers nothing.
  const band = s.type === 'card' && (s.cues ?? []).some(c => c.text);
  const even = x => Math.round(x / 2) * 2;
  const shrink = `,scale=${even(W * 0.88)}:${even(H * 0.88)},pad=${W}:${H}:(ow-iw)/2:0:color=0x1F2A44`;
  if (s.type === 'card') fl.push(`[${still(card(s.src))}:v]${fit(W, H)}${band ? shrink : ''},format=yuv420p[v0]`);
  else if (s.type === 'clip') live = [visual(s, W, H, 'v0')];
  else if (s.type === 'split') {
    const [lx, ly, lw, lh] = E.split.left;
    const [rx, ry, rw, rh] = E.split.right;
    fl.push(`color=c=0xFBF7EE:s=${W}x${H}:r=${FPS}:d=${d}[bg]`);
    live = [visual(s.left, lw, lh, 'l'), visual(s.right, rw, rh, 'r')]; // room sound and the VVD's own sound
    const fi = still(card('cards/split-frame.png'));
    fl.push(`[bg][l]overlay=${lx}:${ly}[sa]`, `[sa][r]overlay=${rx}:${ry}[sb]`, `[sb][${fi}:v]overlay=0:0[${s.clock ? 'sc' : 'v0'}]`);
    if (s.clock) {
      // cards/clock.png: 10 x 6 tiles, tile n shows 0:nn; pick tile floor(t) every frame.
      const [cx, cy, cw, ch] = E.split.clock;
      const c0 = s.clockStart ?? 0;
      const ci = still(card('cards/clock.png'));
      fl.push(`[${ci}:v]crop=w=${cw}:h=${ch}:x='mod(floor(t+${c0}),10)*${cw}':y='mod(floor((t+${c0})/10),6)*${ch}'[ck]`, `[sc][ck]overlay=${cx}:${cy}[v0]`);
    }
  } else fail(`edl: segment ${s.id} has unknown type "${s.type}"`);

  // Cues go on the global timeline; a cue with note: true also puts the "synced in the edit" note on screen.
  const overlays = [...(s.overlays ?? [])];
  if (s.type === 'clip' && (s.speed ?? 1) > 1) overlays.push({tag: `Sped up ${s.speed}x`, fade: 0}); // time compression is always on screen
  const status = [];
  for (const c of s.cues ?? []) {
    let file = find(c.src);
    if (!file && c.text && !(c.optional && !placeholder) && !FINAL) {
      file = `${TMP}/tts-${++tts}.aiff`; // shortcut: macOS 'say' as a draft voice; record the real VO before Friday
      run('say', ['-o', file, c.text]);
      status.push(`TTS ${c.src}`);
    }
    if (!file) {
      if (!c.optional) status.push(`MISSING ${c.src}`);
      continue;
    }
    if (!hasAudio(file)) {
      status.push(`NO AUDIO ${c.src}`);
      continue;
    }
    if (file === c.src || find(c.src)) status.push(`cue ${basename(file)}`);
    cues.push({file, at: s.start + c.at, db: c.db ?? 0});
    const end = Math.min(d, c.at + durationOf(file));
    if (c.text) overlays.push({say: c.text, who: c.who, from: c.at, to: end, low: band}); // every spoken line is burned in
    if (c.note) overlays.push({png: 'cards/note-synced.png', from: c.at, to: end});
  }

  let cur = 'v0';
  overlays.forEach((o, k) => {
    const from = o.from ?? 0;
    const to = Math.min(o.to ?? d, d);
    const fd = o.fade ?? 0.3; // 0: no fade, so a caption carries across a cut
    const oi = still(overlayPng(o));
    fl.push(
      `[${oi}:v]format=rgba${fd ? `,fade=t=in:st=${from}:d=${fd}:alpha=1,fade=t=out:st=${Math.max(from, to - fd)}:d=${fd}:alpha=1` : ''}[o${k}]`,
      `[${cur}][o${k}]overlay=0:0:enable='between(t,${from},${to})'[ov${k}]`,
    );
    cur = `ov${k}`;
  });
  fl.push(`[${cur}]format=yuv420p[vout]`);
  live = live.filter(Boolean);
  live.forEach((l, j) => fl.push(`[${l.k}:a]${LIVE_AFMT},volume=${l.db}dB,apad,atrim=duration=${d},asetpts=PTS-STARTPTS[la${j}]`));
  fl.push(
    live.length === 0 ? `anullsrc=r=48000:cl=stereo,atrim=duration=${d}[aout]`
      : live.length === 1 ? '[la0]anull[aout]'
      : `[la0][la1]amix=inputs=2:normalize=0[aout]`,
  );

  const out = `${TMP}/seg-${String(i).padStart(2, '0')}.mkv`;
  ff([...args, '-filter_complex', fl.join(';'), '-map', '[vout]', '-map', '[aout]', '-t', String(d),
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '16', '-pix_fmt', 'yuv420p', '-r', String(FPS),
    '-c:a', 'pcm_s16le', '-ar', '48000', out]);
  report.push({s, status: [placeholder ? 'PLACEHOLDER' : s.type === 'card' ? 'card' : 'footage', ...status].join(', ')});
  return out;
}

console.log(`Building ${segs.length} segments, ${TOTAL.toFixed(1)} s ...`);
const files = segs.map(buildSegment);

// ---------- join, cues, music, ducking ----------

const args = [];
const fx = [];
files.forEach((f, i) => {
  args.push('-i', f);
  fx.push(`[${i}:v]fps=${FPS},settb=1/${FPS},setpts=PTS-STARTPTS[v${i}]`, `[${i}:a]asetpts=PTS-STARTPTS[a${i}]`);
});
let v = 'v0';
let a = 'a0';
for (let i = 1; i < segs.length; i++) {
  if (segs[i].in === 'fade') {
    fx.push(`[${v}][v${i}]xfade=transition=fade:duration=${XF}:offset=${segs[i].start.toFixed(4)}[vx${i}]`, `[${a}][a${i}]acrossfade=d=${XF}[ax${i}]`);
  } else {
    fx.push(`[${v}][v${i}]concat=n=2:v=1:a=0,settb=1/${FPS}[vx${i}]`, `[${a}][a${i}]concat=n=2:v=0:a=1[ax${i}]`);
  }
  v = `vx${i}`;
  a = `ax${i}`;
}
let k = files.length;
const bus = (labels, name) =>
  fx.push(
    labels.length === 0
      ? `anullsrc=r=48000:cl=stereo,atrim=duration=${TOTAL}[${name}]`
      : `${labels.map(l => `[${l}]`).join('')}${labels.length === 1 ? 'anull' : `amix=inputs=${labels.length}:normalize=0:duration=longest`},apad,atrim=duration=${TOTAL}[${name}]`,
  );
const cueLabels = cues.map((c, j) => {
  args.push('-i', c.file);
  const ms = Math.round(c.at * 1000);
  fx.push(`[${k++}:a]${AFMT},volume=${c.db}dB,adelay=${ms}:all=1[c${j}]`);
  return `c${j}`;
});
bus(cueLabels, 'cues');
const musicLabels = [];
E.music.forEach((m, j) => {
  const file = find(m.src);
  if (!file) return console.warn(`  music missing, skipped: ${m.src}`);
  const start = startOf(m.from);
  const len = endOf(m.to) - start;
  args.push('-stream_loop', '-1', '-i', file);
  fx.push(
    `[${k++}:a]${AFMT},atrim=duration=${len},asetpts=PTS-STARTPTS,afade=t=in:d=${m.fadeIn ?? 0.5},` +
      `afade=t=out:st=${Math.max(0, len - (m.fadeOut ?? 1))}:d=${m.fadeOut ?? 1},volume=${m.db ?? -12}dB,adelay=${Math.round(start * 1000)}:all=1[m${j}]`,
  );
  musicLabels.push(`m${j}`);
});
bus(musicLabels, 'music');
// Music ducks under anything spoken: the room audio of the footage plus every voice/VO cue. Measured on a TTS line:
// music bed -29 LUFS alone, -37 under a -17 LUFS voice (about 8 dB of ducking).
fx.push(
  `[${a}]asplit=2[live1][live2]`,
  `[cues]asplit=2[cues1][cues2]`,
  `[live2][cues2]amix=inputs=2:normalize=0[key]`,
  `[music][key]sidechaincompress=threshold=0.05:ratio=3:attack=30:release=600:makeup=1[duck]`,
  `[live1][cues1][duck]amix=inputs=3:normalize=0:duration=first,atrim=duration=${TOTAL}[mix]`,
);
console.log('Joining, mixing ...');
ff([...args, '-filter_complex', fx.join(';'),
  '-map', `[${v}]`, '-an', '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-r', String(FPS), '-g', String(FPS * 2), `${TMP}/video.mp4`,
  '-map', '[mix]', '-c:a', 'pcm_s16le', '-ar', '48000', `${TMP}/mix.wav`]);

// ---------- loudness: two-pass loudnorm to the YouTube target ----------

const L = E.loudness;
const target = `I=${L.I}:TP=${L.TP}:LRA=${L.LRA}`;
const m1 = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', `${TMP}/mix.wav`, '-af', `loudnorm=${target}:print_format=json`, '-f', 'null', '-']).stderr;
const meas = JSON.parse(m1.slice(m1.lastIndexOf('{'), m1.lastIndexOf('}') + 1));
const af = Number.isFinite(parseFloat(meas.input_i))
  ? `loudnorm=${target}:measured_I=${meas.input_i}:measured_TP=${meas.input_tp}:measured_LRA=${meas.input_lra}:` +
    `measured_thresh=${meas.input_thresh}:offset=${meas.target_offset}:linear=true,aresample=48000`
  : 'anull'; // silent mix: nothing to normalise
ff(['-i', `${TMP}/video.mp4`, '-i', `${TMP}/mix.wav`, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-af', af,
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-shortest', OUT]);

// ---------- check the result ----------

const dur = durationOf(OUT);
const vinfo = probe(OUT, ['-select_streams', 'v', '-show_entries', 'stream=codec_name,width,height,r_frame_rate']).split('\n').join(' ');
const m2 = run('ffmpeg', ['-hide_banner', '-nostdin', '-i', OUT, '-map', '0:a', '-af', 'ebur128=framelog=quiet', '-f', 'null', '-']).stderr;
const lufs = (m2.match(/I:\s+(-?[\d.]+|-inf) LUFS/g) ?? []).pop() ?? 'I: ? LUFS';
if (!KEEP) rmSync(TMP, {recursive: true, force: true});

console.log('\n  start    dur   blueprint   segment     status');
for (const {s, status} of report.sort((x, y) => x.s.start - y.s.start)) {
  console.log(`  ${mmss(s.start).padStart(6)}  ${s.dur.toFixed(1).padStart(5)}   ${(s.bp ?? '').padEnd(10)}  ${s.id.padEnd(15)}  ${status}`);
}
if (missing.length) console.log(`\nStill to drop in (${missing.length}):\n  ${missing.join('\n  ')}`);
console.log(`\n${OUT}: ${dur.toFixed(2)} s (${mmss(dur)}), ${vinfo}, ${lufs.replace(/\s+/g, ' ')} integrated, ${(statSync(OUT).size / 1e6).toFixed(1)} MB`);
if (dur > E.maxDuration) fail(`Output is longer than maxDuration (${E.maxDuration} s)!`);
