// Live view of the headless VVD for playtests: `bun scripts/live-view.ts`, then open http://localhost:8799/ (notes/tv.md).
// Read-only: streams frames from the emulator's gRPC streamScreenshot (raw RGB888, pushed on every new frame) to the
// page over a WebSocket; the page draws them with WebGL. Never sends keys. The only thing it may change on the VVD is
// switching on its token-protected, localhost-only gRPC endpoint (console `grpc 8554`) when that is off; no adb used.
import http2 from "node:http2";
import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import type { ServerWebSocket } from "bun";

const PORT = 8799, CONSOLE = 5554, GRPC = 8554;
const RUNNING = `${homedir()}/Library/Caches/TemporaryItems/avd/running`; // where the emulator advertises its gRPC port

// gRPC port + token of the live emulator on console port 5554 (pid_<pid>.ini appears once gRPC is on).
function discover() {
  let files: string[] = [];
  try { files = readdirSync(RUNNING).filter((f) => /^pid_\d+\.ini$/.test(f)); } catch {}
  for (const f of files) {
    const ini = readFileSync(`${RUNNING}/${f}`, "utf8");
    const get = (k: string) => ini.match(new RegExp(`^${k.replace(".", "\\.")}=(.*)$`, "m"))?.[1].trim();
    if (get("port.serial") !== String(CONSOLE) || !get("grpc.port") || !get("grpc.token")) continue;
    try { process.kill(+f.slice(4, -4), 0); } catch { continue; } // stale file of an emulator that is gone
    return { port: get("grpc.port")!, token: get("grpc.token")! };
  }
}

// The VVD starts without gRPC; the emulator console can switch it on (127.0.0.1 only, needs the token above).
async function enableGrpc() {
  const auth = readFileSync(`${homedir()}/.emulator_console_auth_token`, "utf8").trim();
  let out = "";
  await new Promise<void>((resolve, reject) => {
    Bun.connect({ hostname: "127.0.0.1", port: CONSOLE, socket: {
      open(s) { s.write(`auth ${auth}\ngrpc ${GRPC}\nquit\n`); },
      data(_s, d) { out += d; },
      close() { resolve(); },
      error(_s, e) { reject(e); },
    } }).catch(reject);
    setTimeout(resolve, 3000);
  });
  console.log("emulator console:", out.match(/(OK|KO): gRPC[^\r\n]*/)?.[0] ?? out.trim().split("\n").at(-1));
}

// Minimal protobuf reader: field number -> varint (number) or bytes (Buffer). Enough for android.emulation.control.Image.
function fields(b: Buffer) {
  const o: Record<number, number | Buffer> = {};
  let p = 0;
  const varint = () => { let v = 0, s = 0, c; do { c = b[p++]; v += (c & 127) * 2 ** s; s += 7; } while (c > 127); return v; };
  while (p < b.length) {
    const key = varint(), wt = key & 7;
    if (wt === 0) o[key >>> 3] = varint();
    else if (wt === 2) { const n = varint(); o[key >>> 3] = b.subarray(p, p + n); p += n; }
    else if (wt === 1) p += 8;
    else if (wt === 5) p += 4;
    else throw new Error(`protobuf wire type ${wt}`);
  }
  return o;
}
{ // self-check: Image{format{width 2, height 1}, image "abcdef", timestampUs 1700000000000000}
  const img = fields(Buffer.from("0a04180220012206616263646566308080f9c0c1c48203", "hex")), f = fields(img[1] as Buffer);
  if (f[3] !== 2 || f[4] !== 1 || `${img[4]}` !== "abcdef" || img[6] !== 1700000000000000) throw new Error("protobuf self-check failed");
}

const clients = new Set<ServerWebSocket<unknown>>();
let lastFrame: [string, Buffer] | null = null, lastStatus = "Connecting to the VVD…", stop = () => {}, running = false;
let n = 0, ageSum = 0;

function status(s: string) {
  if (s === lastStatus) return;
  lastStatus = s; lastFrame = null; console.log(s);
  for (const ws of clients) ws.send(JSON.stringify({ status: s }));
}

function frame(m: Buffer) {
  const img = fields(m), fmt = img[1] ? fields(img[1] as Buffer) : {}, px = img[4] as Buffer | undefined;
  if (!px?.length) return; // the emulator sends an empty image while the display is off
  const t = (img[6] as number) / 1000, meta = JSON.stringify({ w: fmt[3], h: fmt[4], t });
  lastFrame = [meta, px]; lastStatus = ""; n++; ageSum += Date.now() - t;
  // Drop frames for a viewer that is still busy with the previous one, so latency never builds up.
  for (const ws of clients) if (ws.getBufferedAmount() === 0) { ws.send(meta); ws.send(px); }
}

// One streamScreenshot call; resolves when it ends (emulator gone, or no viewers left).
function stream({ port, token }: { port: string; token: string }) {
  return new Promise<void>((resolve) => {
    const s = http2.connect(`http://127.0.0.1:${port}`);
    const done = (why?: string) => { if (why && clients.size) status(`Waiting for the VVD (${why})`); s.destroy(); resolve(); };
    s.on("error", (e) => done(e.message));
    s.on("close", () => done());
    const req = s.request({ ":method": "POST", ":path": "/android.emulation.control.EmulatorController/streamScreenshot",
      "content-type": "application/grpc", te: "trailers", authorization: `Bearer ${token}` });
    // gRPC messages: 1 byte flag + 4 byte length + protobuf. Chunks are joined once per 6 MB frame (joining on every
    // 16 KB chunk cut the rate to ~4 fps).
    let parts: Buffer[] = [], have = 0, need = -1;
    req.on("data", (d: Buffer) => {
      parts.push(d); have += d.length;
      for (;;) {
        if (need < 0) { if (have < 5) break; parts = [Buffer.concat(parts, have)]; need = 5 + parts[0].readUInt32BE(1); }
        if (have < need) break;
        const all = parts.length === 1 ? parts[0] : Buffer.concat(parts, have), rest = all.subarray(need);
        frame(all.subarray(5, need));
        parts = rest.length ? [rest] : []; have = rest.length; need = -1;
      }
    });
    req.on("trailers", (h) => { if (h["grpc-status"] !== "0") done(`gRPC ${h["grpc-status"]} ${h["grpc-message"] ?? ""}`); });
    req.on("error", (e) => done(e.message));
    req.on("end", () => done());
    req.end(Buffer.from([0, 0, 0, 0, 2, 0x08, 0x02])); // ImageFormat{format: RGB888}, full 1920x1080
    stop = () => done();
  });
}

async function run() {
  if (running || !clients.size) return;
  running = true;
  try {
    let d = discover();
    if (!d) { await enableGrpc(); d = discover(); }
    if (d) await stream(d); else status("Waiting for the VVD (is it running? `vega virtual-device status`)");
  } catch (e) { status(`Waiting for the VVD (${(e as Error).message})`); }
  running = false;
  if (clients.size) setTimeout(run, 2000);
}

Bun.serve({
  hostname: "127.0.0.1", port: PORT,
  fetch(req, server) {
    if (server.upgrade(req)) return;
    return new Response(Bun.file(`${import.meta.dir}/live-view.html`));
  },
  websocket: {
    open(ws) {
      clients.add(ws);
      if (lastFrame) { ws.send(lastFrame[0]); ws.send(lastFrame[1]); } // a still screen sends no new frames
      else ws.send(JSON.stringify({ status: lastStatus }));
      run();
    },
    message() {},
    close(ws) { clients.delete(ws); if (!clients.size) stop(); },
  },
});
setInterval(() => { if (n) console.log(`${n / 5} fps from the VVD, frame age at send ${Math.round(ageSum / n)} ms, ${clients.size} viewer(s)`); n = ageSum = 0; }, 5000);
console.log(`Live view: http://localhost:${PORT}/  (Ctrl+C to stop)`);
