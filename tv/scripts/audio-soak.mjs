// Audio crash soak (notes/tv.md F13): runs an AUDIOSOAK=1 build (src/AudioSoak.tsx plays the Reveal + Results
// audio patterns on a loop), relaunches it whenever it dies, and counts crashes against clips played.
//   AUDIOSOAK=1 tv/scripts/vbuild.sh release --run && node tv/scripts/audio-soak.mjs [minutes=15] [--out dir]
// Counters are read off the screen every 10 s, so a crashed session counts the clips of its last reading.
import {execFileSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';

const ADB = process.env.ADB || '/Applications/Unity/Hub/Editor/6000.6.0f1/PlaybackEngines/AndroidPlayer/SDK/platform-tools/adb';
const APP = 'com.starfungames.sketchlings.main';
const args = process.argv.slice(2);
const minutes = Number(args.find((a) => /^\d+$/.test(a)) ?? 15);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : join(process.env.TMPDIR || '/tmp', `audio-soak-${Date.now()}`);
mkdirSync(join(out, 'tmp'), {recursive: true});
const OCR = join(process.env.TMPDIR || '/tmp', 'sketchlings-ocr'); // built by soak.mjs
const sleep = (s) => new Promise((r) => setTimeout(r, s * 1000));
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);
const vega = (cmd) => execFileSync('bash', ['-c', `source ~/vega/env >/dev/null 2>&1; vega ${cmd}`], {stdio: 'pipe'}).toString();
// "not running" twice, 3 s apart: a failed vega/adb call or one odd answer is not a crash
const notRunning = () => {
  try {
    return /not running/i.test(vega(`device is-app-running -a ${APP}`));
  } catch {
    return false;
  }
};
const died = async () => notRunning() && (await sleep(3), notRunning());
function read() {
  const f = join(out, 'tmp', 'shot.png');
  try {
    const dir = join(out, 'tmp'); // absolute: the emulator writes relative paths to its own cwd
    execFileSync('bash', ['-c', `rm -f "${dir}"/*.png; "${ADB}" -s emulator-5554 emu screenrecord screenshot "${dir}" >/dev/null && mv "${dir}"/Screenshot_*.png "${f}"`]);
    const m = execFileSync(OCR, [f], {timeout: 15000}).toString().match(/screens (\d+) ended (\d+)/);
    return m && {screens: +m[1], ended: +m[2]};
  } catch {
    return null;
  }
}

const tot = {sessions: 0, crashes: 0, screens: 0, ended: 0};
const end = Date.now() + minutes * 60_000;
log(`audio soak for ${minutes} min -> ${out}`);
while (Date.now() < end) {
  try { vega(`device terminate-app -a ${APP}`); } catch {}
  await sleep(2);
  vega(`device launch-app -a ${APP}`);
  tot.sessions++;
  let last = {screens: 0, ended: 0};
  const t0 = Date.now();
  for (;;) {
    await sleep(10);
    const r = read();
    if (r) last = r;
    if (await died()) {
      tot.crashes++;
      log(`CRASH after ${((Date.now() - t0) / 1000).toFixed(0)} s: screens ${last.screens}, clips ended ${last.ended}`);
      break;
    }
    if (Date.now() > end) {
      log(`session ${tot.sessions} alive at the end: screens ${last.screens}, clips ended ${last.ended}`);
      break;
    }
  }
  tot.screens += last.screens;
  tot.ended += last.ended;
}
try { vega(`device copy-logs -a SYSTEM_TOMBSTONE/acr --dir "${join(out, 'acr')}"`); } catch {}
log(`DONE: ${tot.crashes} crashes in ${tot.sessions} sessions; ${tot.screens} screens, ${tot.ended} clips ended. ACRs: ${join(out, 'acr')}`);
