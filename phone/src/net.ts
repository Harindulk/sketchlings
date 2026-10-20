// WebSocket link to the server with automatic reconnect (exponential backoff + jitter).
import type {ClientMsg, HelloPhone, ServerMsg} from '../../shared/protocol';

export type LinkStatus = 'connecting' | 'open' | 'closed';

export class Link {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private retryTimer = 0;
  private pingTimer = 0;
  private stopped = true; // idle until connect()

  constructor(
    private hello: () => HelloPhone,
    private onMessage: (msg: ServerMsg) => void,
    private onStatus: (s: LinkStatus) => void,
  ) {
    // Phones suspend sockets when the screen locks: reconnect as soon as we're visible again.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && !this.stopped && this.ws?.readyState !== WebSocket.OPEN) this.connectNow();
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
    clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
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
    ws.onopen = () => {
      this.attempts = 0;
      ws.send(JSON.stringify(this.hello()));
      this.onStatus('open');
      clearInterval(this.pingTimer);
      this.pingTimer = window.setInterval(() => this.send({t: 'ping'}), 20_000);
    };
    ws.onmessage = (e) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(e.data));
      } catch {
        return;
      }
      if (msg && typeof msg === 'object' && 't' in msg) this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      clearInterval(this.pingTimer);
      this.ws = null;
      this.onStatus('closed');
      if (this.stopped) return;
      const delay = Math.min(8000, 500 * 2 ** this.attempts++) * (0.75 + Math.random() * 0.5);
      this.retryTimer = window.setTimeout(() => this.connectNow(), delay);
    };
  }
}
