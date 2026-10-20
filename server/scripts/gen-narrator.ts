// bun run gen:narrator -> assets/narrator/<id>.m4a + manifest.json: the game-show host lines the TV app bundles.
import {mkdirSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {kokoro} from '../src/voice';

const HOST = {kind: 'buddy', voice: 'af_heart', speed: 1.05, semitones: 0} as const; // Kokoro's best-graded voice, natural pitch: the grown-up in the room
const LINES: [id: string, text: string, say?: string][] = [
  ['three', 'Three!'],
  ['two', 'Two!'],
  ['one', 'One!'],
  ['go', 'Go!'],
  ['doodle-boost', 'Doodle Boost!'],
  ['roar', 'ROAR!', 'Roar!'], // all caps can get spelled out
  ['photo-finish', 'Photo finish!'],
  ['winner-is', 'And the winner is...'],
  ['meet-sketchlings', "Let's meet our Sketchlings!"],
  ['scan-drawing', 'Scan your drawing!'],
  ['everybody-ready', 'Everybody ready?'],
];

const out = join(import.meta.dir, '../assets/narrator');
const tts = await kokoro(join(import.meta.dir, '../models'))();
if (!tts) process.exit(1);
mkdirSync(out, {recursive: true});
const clips = [];
for (const [id, text, say] of LINES) {
  const started = performance.now();
  const durationMs = await tts.clip(say ?? text, HOST, join(out, `${id}.m4a`));
  clips.push({id, text, file: `${id}.m4a`, durationMs});
  console.log(`${id}.m4a  ${durationMs} ms of audio, made in ${Math.round(performance.now() - started)} ms`);
}
const manifest = {voice: `Kokoro-82M ${HOST.voice}`, mimeType: 'audio/mp4; codecs="mp4a.40.2"', clips};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${clips.length} clips + manifest.json to ${out}`);
