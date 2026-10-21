import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateSync} from 'node:zlib';
import {createServer} from '../src/server';
import type {Tts} from '../src/voice';

/** Encode an 8-bit RGBA (colorType 6) or RGB (2) PNG, cycling through all five row filters. */
export function encodePng(width: number, height: number, rgba: Uint8Array, colorType: 2 | 6 = 6, interlace = 0): Uint8Array {
  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const px = new Uint8Array(height * stride);
  for (let i = 0, j = 0; i < rgba.length; i += 4) for (let c = 0; c < bpp; c++) px[j++] = rgba[i + c]!;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    const f = y % 5;
    raw[y * (stride + 1)] = f;
    for (let x = 0; x < stride; x++) {
      const cur = px[y * stride + x]!;
      const a = x >= bpp ? px[y * stride + x - bpp]! : 0;
      const b = y ? px[(y - 1) * stride + x]! : 0;
      const c = x >= bpp && y ? px[(y - 1) * stride + x - bpp]! : 0;
      const pa = Math.abs(b - c), pb = Math.abs(a - c), pc = Math.abs(a + b - 2 * c);
      const pred = [0, a, b, (a + b) >> 1, pa <= pb && pa <= pc ? a : pb <= pc ? b : c][f]!;
      raw[y * (stride + 1) + 1 + x] = (cur - pred) & 255;
    }
  }
  const chunk = (type: string, data: Uint8Array) => {
    const out = Buffer.alloc(12 + data.length);
    out.writeUInt32BE(data.length, 0);
    out.write(type, 4, 'latin1');
    Buffer.from(data).copy(out, 8);
    out.writeUInt32BE(Bun.hash.crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
    return out;
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, colorType, 0, 0, interlace], 8);
  return new Uint8Array(
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array())]),
  );
}

/** A test "drawing": transparent background, a filled ellipse of `fill` with a dark outline. */
export function drawBlob(width: number, height: number, fill: [number, number, number], seed = 0): Uint8Array {
  const d = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = (x - width / 2) / (width / 2 - 1);
      const dy = (y - height / 2) / (height / 2 - 1);
      const r = dx * dx + dy * dy;
      if (r > 1) continue;
      const i = (y * width + x) * 4;
      const c = r > 0.75 ? [20, 20, 30] : fill;
      d.set([c[0]!, c[1]!, (c[2]! + seed) & 255, 255], i);
    }
  }
  return d;
}

/** WebSocket client that queues JSON frames so tests can await a frame of a given type. */
export async function connect(url: string) {
  const ws = new WebSocket(url);
  const queue: any[] = [];
  let wake: (() => void) | undefined;
  ws.onmessage = e => {
    queue.push(JSON.parse(String(e.data)));
    wake?.();
  };
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  return {
    ws,
    queue,
    send: (m: unknown) => ws.send(typeof m === 'string' ? m : JSON.stringify(m)),
    async next(t: string, timeoutMs = 3000): Promise<any> {
      const end = Date.now() + timeoutMs;
      for (;;) {
        const i = queue.findIndex(m => m.t === t);
        if (i >= 0) return queue.splice(i, 1)[0];
        if (Date.now() > end) throw new Error(`timed out waiting for "${t}"; queue: ${JSON.stringify(queue)}`);
        await new Promise<void>(r => {
          wake = r;
          setTimeout(r, 50);
        });
      }
    },
    close: () =>
      new Promise<void>(r => {
        ws.onclose = () => r();
        ws.close();
      }),
  };
}

export function startTestServer(opts: {dataDir?: string; phoneDist?: string; tts?: () => Promise<Tts | null>; ghostGraceMs?: number} = {}) {
  const dataDir = opts.dataDir ?? mkdtempSync(join(tmpdir(), 'sketchlings-'));
  const app = createServer({
    port: 0,
    hostname: '127.0.0.1',
    dataDir,
    phoneDist: opts.phoneDist ?? join(dataDir, 'no-phone-dist'),
    publicUrl: 'http://test.local:8787',
    claude: null, // never call the API from tests, even if server/.env has a key
    tts: opts.tts, // voices stay off unless a test asks
    ghostGraceMs: opts.ghostGraceMs,
  });
  return {...app, dataDir, wsUrl: `ws://127.0.0.1:${app.server.port}/ws`, http: `http://127.0.0.1:${app.server.port}`};
}
