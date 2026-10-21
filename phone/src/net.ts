// WebSocket link to the server with automatic reconnect (exponential backoff + jitter).
import type {ClientMsg, HelloPhone, ServerMsg} from '../../shared/protocol';

export type LinkStatus = 'connecting' | 'open' | 'closed';

const PING_MS = 10_000;
const DEAD_MS = 22_000; // nothing heard for this long (two missed pongs): the socket is dead even if it still says OPEN
const CONNECT_MS = 8_000; // a socket started just before the phone slept can hang in CONNECTING
const PROBE_MS = 3_000;

export class Link {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  private lastRx = 0;
  private stopped = true; // idle until connect()

  constructor(
    private hello: () => HelloPhone,
    private onMessage: (msg: ServerMsg) => void,
    private onStatus: (s: LinkStatus) => void,
  ) {
    // Phones suspend sockets when the screen locks, and after a sleep or Wi-Fi blip a socket can stay
    // OPEN (or CONNECTING) while being dead. When we're visible again, reconnect or prove it's alive.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || this.stopped) return;
      const ws = this.ws;
      if (!ws) return this.connectNow();
      if (ws.readyState !== WebSocket.OPEN) return; // CONNECTING: its own timeout drops it if it's stuck
      // Hello again: takes the player back if another tab (a second QR scan) replaced this one,
      // and the server's answer proves the socket works. No playerId yet: a ping does the proving.
      const asked = Date.now();
      const hi = this.hello();
      this.send(hi.playerId ? hi : {t: 'ping'});
      setTimeout(() => this.lastRx < asked && this.drop(ws), PROBE_MS);
    });
  }

  connect(): void {
    this.stopped = false;
    this.connectNow();
  }

  /** Stop for good (e.g. the room doesn't exist). */
  stop(): void {
    this.stopped = true;
    clearTimeout(this.retryTimer);
    if (this.ws) this.drop(this.ws);
  }

  send(msg: ClientMsg): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(msg));
    return true;
  }

  private connectNow(): void {
    clearTimeout(this.retryTimer);
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.onStatus('connecting');
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    this.ws = ws;
    const timeout = setTimeout(() => ws.readyState === WebSocket.CONNECTING && this.drop(ws), CONNECT_MS);
    ws.onopen = () => {
      clearTimeout(timeout);
      this.attempts = 0;
      this.lastRx = Date.now();
      ws.send(JSON.stringify(this.hello()));
      this.onStatus('open');
      clearInterval(this.pingTimer);
      // Hidden pages get their timers throttled to once a minute: judge liveness only while visible.
      this.pingTimer = window.setInterval(() => {
        if (document.visibilityState === 'visible' && Date.now() - this.lastRx > DEAD_MS) this.drop(ws);
        else this.send({t: 'ping'});
      }, PING_MS);
    };
    ws.onmessage = (e) => {
      this.lastRx = Date.now();
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg && typeof msg === 'object' && 't' in msg) this.onMessage(msg);
    };
    ws.onclose = () => {
      clearTimeout(timeout);
      this.drop(ws);
    };
  }

  /** Forget a closed, stuck or dead socket and (unless stopped) retry with backoff. */
  private drop(ws: WebSocket): void {
    if (this.ws !== ws) return;
    ws.onopen = ws.onmessage = ws.onclose = null;
    ws.close();
    clearInterval(this.pingTimer);
    this.ws = null;
    this.onStatus('closed');
    if (this.stopped) return;
    const delay = Math.min(8000, 500 * 2 ** this.attempts++) * (0.75 + Math.random() * 0.5);
    this.retryTimer = window.setTimeout(() => this.connectNow(), delay);
  }
}
