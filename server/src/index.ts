import {join} from 'node:path';
import {makeClaude} from './persona';
import {createServer} from './server';
import {kokoro} from './voice';

const env = process.env;
const tts = kokoro(join(import.meta.dir, '../models'));
const claude = makeClaude({apiKey: env.ANTHROPIC_API_KEY, model: env.SKETCHLINGS_MODEL, baseURL: env.SKETCHLINGS_ANTHROPIC_BASE_URL, workspaceId: env.ANTHROPIC_WORKSPACE_ID});
const {server, joinBase} = createServer({
  port: Number(env.PORT) || 8787,
  hostname: '0.0.0.0',
  dataDir: join(import.meta.dir, '../data'),
  phoneDist: join(import.meta.dir, '../../phone/dist'),
  publicUrl: env.PUBLIC_URL,
  claude,
  tts,
});

console.log(`Sketchlings server on http://0.0.0.0:${server.port}  (ws: /ws)`);
console.log(`Phones join at ${joinBase()}/j/<CODE>`);
console.log(claude ? `Personas: Claude (${claude.model}), offline fallback on any error` : 'Personas: offline generator (no ANTHROPIC_API_KEY in server/.env)');
void tts().then(t => t && console.log('Voices: Kokoro-82M on this Mac, clips at /voice/<id>/<line>.m4a'));
