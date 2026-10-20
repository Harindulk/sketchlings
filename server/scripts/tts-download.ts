// bun run tts:download -> Kokoro-82M (fp32 ONNX, ~330 MB) into server/models/. The server itself never downloads.
import {join} from 'node:path';
import {loadKokoro, MODEL_ID} from '../src/voice';

const dir = join(import.meta.dir, '../models');
await loadKokoro(dir, true);
console.log(`${MODEL_ID} ready in ${dir}`);
process.kill(process.pid, 'SIGKILL'); // a normal exit with onnxruntime loaded aborts Bun 1.4 with a crash report
