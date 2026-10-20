// Race-start soak test on the headless Vega Virtual Device: drives the remote, reads the screen, flags freezes.
//   node tv/scripts/soak.mjs [races=20] [--live 3] [--rounds 4] [--out dir]
// Demo party by default; --live N runs a real party against the server with N fake phones (scripts/fake-phones.mjs);
// the room code is read off the screen, or given with --room CODE (Vision can't read the tilted code tiles reliably).
// Each session launches the app, goes Home -> lobby -> reveal -> race, then "Play again" for --rounds races.
// A race counts as frozen when, 6 s after it mounted, the countdown title is still up or the screen stopped moving.
// On a freeze it presses Back (the system then kills the hung app and writes an ACR) and copies the ACRs to --out.
// If the VVD itself died (notes/tv.md F5), it restarts it, reinstalls tv/build/sketchlings_aarch64.vpkg and goes on;
// those races don't count.
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const {PNG} = createRequire(import.meta.url)(join(HERE, '../node_modules/pngjs'));
const ADB = process.env.ADB || '/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb';
const DEV = process.env.DEV || 'emulator-5554';
const APP = 'com.starfungames.sketchlings.main';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const races = Number(args.find((a) => /^\d+$/.test(a)) ?? 20);
const live = Number(opt('--live', 0));
const rounds = Number(opt('--rounds', 4));
const room = opt('--room', '');
const out = opt('--out', join(process.env.TMPDIR || '/tmp', `sketchlings-soak-${Date.now()}`));
mkdirSync(out, {recursive: true});

const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const vega = (cmd) => execFileSync('bash', ['-c', `source ~/vega/env >/dev/null 2>&1; vega ${cmd}`], {stdio: 'pipe'}).toString();
const KEYS = {up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', ok: 'KEY_ENTER', back: 'KEY_BACK', menu: 'KEY_MENU', play: 'KEY_PLAYPAUSE'};
const key = (k) => execFileSync(ADB, ['-s', DEV, 'shell', 'inputd-cli', 'button_press', KEYS[k]]);
let n = 0;
function shot(tag) {
  const dir = join(out, 'tmp');
  mkdirSync(dir, {recursive: true});
  execFileSync('bash', ['-c', `rm -f "${dir}"/*.png; "${ADB}" -s ${DEV} emu screenrecord screenshot "${dir}" >/dev/null`]);
  const f = join(out, `${String(++n).padStart(4, '0')}-${tag}.png`);
  execFileSync('bash', ['-c', `mv "${dir}"/*.png "${f}"`]);
  return f;
}
const OCR = join(process.env.TMPDIR || '/tmp', 'sketchlings-ocr');
if (!existsSync(OCR)) execFileSync('swiftc', ['-O', join(HERE, 'ocr.swift'), '-o', OCR]);
const ocr = (f) => {
  try {
    return execFileSync(OCR, [f], {timeout: 15000}).toString();
  } catch {
    return '';
  }
};
/** Fraction of pixels that changed between two screenshots, below the HUD bar. */
function moved(a, b) {
  const A = PNG.sync.read(readFileSync(a)), B = PNG.sync.read(readFileSync(b));
  let diff = 0, all = 0;
  for (let y = 140; y < A.height; y += 2)
    for (let x = 0; x < A.width; x += 2) {
      const i = (y * A.width + x) * 4;
      all++;
      if (Math.abs(A.data[i] - B.data[i]) + Math.abs(A.data[i + 1] - B.data[i + 1]) + Math.abs(A.data[i + 2] - B.data[i + 2]) > 30) diff++;
    }
  return diff / all;
}
async function waitFor(re, secs, tag) {
  for (const end = Date.now() + secs * 1000; Date.now() < end; await sleep(1.5)) {
    const f = shot(tag);
    if (re.test(ocr(f))) return f;
  }
  return null;
}

const stats = {races: 0, frozen: 0, notStarted: 0, vvdCrashes: 0};
const vvdUp = () => {
  try {
    return /"running":true/.test(vega('virtual-device status'));
  } catch {
    return false;
  }
};
async function revive() {
  stats.vvdCrashes++;
  log('VVD is down (host stall, F5): restarting it');
  for (let i = 0; i < 3; i++) {
    try {
      if (!vvdUp()) vega('virtual-device start --no-gui --timeout 300');
      await sleep(10); // "ready" comes before `run-app` can see the device
      vega(`run-app "${join(HERE, '../build/sketchlings_aarch64.vpkg')}" ${APP} -d VirtualDevice`);
      return;
    } catch (e) {
      log(`restart failed: ${String(e.message).split('\n')[0]}`);
    }
  }
  throw new Error('VVD would not come back');
}
async function checkRace(label) {
  await sleep(4.5);
  const a = shot(`${label}-a`);
  await sleep(1.5);
  const b = shot(`${label}-b`);
  const text = ocr(b), m = moved(a, b);
  const countdown = /Doodle Dash/i.test(text);
  if ((countdown || m < 0.005) && !vvdUp()) throw new Error('VVD died');
  stats.races++;
  if (countdown || m < 0.005) {
    stats.frozen++;
    log(`FROZEN ${label}: countdown=${countdown} moved=${(m * 100).toFixed(2)}%  ${b}`);
    return false;
  }
  log(`ok ${label}: moved ${(m * 100).toFixed(1)}%`);
  return true;
}

async function session(s) {
  try { vega(`device terminate-app -a ${APP}`); } catch {}
  await sleep(2);
  vega(`device launch-app -a ${APP}`);
  await sleep(6);
  let phones = null, players = 4;
  if (live) {
    key('ok'); // Start party (preferred focus)
    const f = await waitFor(room ? /Join the party/i : /\b[BCDFGHJKMNPRSTVWXZ]{4}\b/, 20, `s${s}-lobby`); // room exists
    const code = room || (f && ocr(f).match(/\b([BCDFGHJKMNPRSTVWXZ]{4})\b/)?.[1]);
    if (!code) throw new Error('no room code on screen');
    log(`room ${code}, ${live} fake phones`);
    phones = spawn('node', [join(HERE, 'fake-phones.mjs'), code, String(live)], {stdio: 'ignore'});
    players = live;
    if (!(await waitFor(new RegExp(`Start the show! \\(${live}\\)`, 'i'), 90, `s${s}-joining`))) throw new Error('phones never got ready');
    await sleep(2);
  } else {
    key('right');
    await sleep(0.8);
    key('ok'); // Demo party
    if (!(await waitFor(/Start the show! \(4\)/i, 25, `s${s}-lobby`))) throw new Error('demo lobby never got ready');
  }
  key('ok'); // Start the show
  await sleep(2.5);
  for (let i = 0; i < players; i++) { key('ok'); await sleep(1.4); } // skip the reveal cards; the last one is "Race!"
  try {
    for (let r = 1; r <= rounds && stats.races < races; r++) {
      if (!(await checkRace(`s${s}r${r}`))) {
        key('back');
        await sleep(12);
        try { vega(`device copy-logs -a SYSTEM_TOMBSTONE/acr --dir "${join(out, 'acr')}"`); } catch {}
        return;
      }
      if (!(await waitFor(/Play again/i, 100, `s${s}r${r}-wait`))) throw new Error('results never showed');
      if (r < rounds && stats.races < races) key('ok'); // Play again
    }
  } finally {
    phones?.kill();
  }
}

log(`soak: ${races} race starts, ${live ? `live party with ${live} fake phones` : 'demo party'}, ${rounds} per session -> ${out}`);
for (let s = 1; stats.races < races; s++) {
  try {
    await session(s);
  } catch (e) {
    if (!vvdUp()) {
      await revive();
      continue;
    }
    stats.notStarted++;
    log(`session ${s}: ${e.message}`);
    if (stats.notStarted > 3) break;
  }
}
log(`DONE: ${stats.races} race starts, ${stats.frozen} frozen, ${stats.notStarted} sessions failed to reach a race, ${stats.vvdCrashes} VVD restarts. Shots: ${out}`);
process.exit(stats.frozen ? 1 : 0);
