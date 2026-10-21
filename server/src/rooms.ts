// In-memory rooms + the WebSocket relay between one TV and its phones.
import type {ServerWebSocket} from 'bun';
import type {AgeGroup, ClientMsg, ErrorMsg, HelloPhone, InputKind, Phase, PhaseMsg, Player, ServerMsg} from '../../shared/protocol';
import {MAX_PLAYERS, PLAYER_COLORS} from '../../shared/protocol';

export type WsData = {role?: 'tv' | 'phone'; room?: string; playerId?: string};
type Ws = ServerWebSocket<WsData>;

export interface Slot {
  player: Player;
  ws?: Ws;
  scanning?: boolean;
  dropTimer?: ReturnType<typeof setTimeout>;
}

export interface Room {
  code: string;
  tv?: Ws;
  phase: Phase;
  lastPhase?: PhaseMsg; // replayed to phones that (re)join mid-game
  slots: Map<string, Slot>;
  touched: number;
}

// No vowels (so codes never spell words) and none of I/L/O/Q that read like 1 or 0.
export const CODE_ALPHABET = 'BCDFGHJKMNPRSTVWXZ';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{4}$`);
const PHASES: Phase[] = ['lobby', 'draw', 'reveal', 'race', 'results'];
const KINDS: InputKind[] = ['tap', 'jump', 'hold', 'release', 'shout'];
const AGE_GROUPS: AgeGroup[] = ['little', 'big', 'grownup'];
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const optStr = (v: unknown) => v === undefined || typeof v === 'string';

/** Parse + validate one client frame. Returns the message or an error string. */
export function parseClientMsg(raw: string | Buffer): ClientMsg | string {
  if (typeof raw !== 'string') return 'frames must be JSON text';
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return 'invalid JSON';
  }
  if (!isObj(m) || typeof m.t !== 'string') return 'frame must be an object with a string `t`';
  switch (m.t) {
    case 'ping':
      return {t: 'ping'};
    case 'hello':
      if (m.role === 'tv') return optStr(m.room) ? {t: 'hello', role: 'tv', room: m.room as string | undefined} : 'room must be a string';
      if (m.role === 'phone') {
        if (typeof m.room !== 'string' || typeof m.name !== 'string' || !optStr(m.playerId)) return 'phone hello needs room, name and optional playerId strings';
        if (m.ageGroup !== undefined && !AGE_GROUPS.includes(m.ageGroup as AgeGroup)) return `ageGroup must be one of ${AGE_GROUPS.join(', ')}`;
        // ageGroup is optional on the wire for older phone builds; default 'big'
        return {t: 'hello', role: 'phone', room: m.room, name: m.name, ageGroup: (m.ageGroup as AgeGroup) ?? 'big', playerId: m.playerId as string | undefined};
      }
      return 'role must be "tv" or "phone"';
    case 'phase':
      if (!PHASES.includes(m.phase as Phase)) return `phase must be one of ${PHASES.join(', ')}`;
      if (m.data !== undefined && !isObj(m.data)) return 'data must be an object';
      return {t: 'phase', phase: m.phase as Phase, ...(m.data ? {data: m.data} : {})};
    case 'input':
      if (!KINDS.includes(m.kind as InputKind)) return `kind must be one of ${KINDS.join(', ')}`;
      if (typeof m.at !== 'number' || !Number.isFinite(m.at)) return 'at must be a number';
      return {t: 'input', kind: m.kind as InputKind, at: m.at};
    default:
      return `unknown message type "${m.t}"`;
  }
}

/** First name only: printable, single line, max 16 chars. */
export function cleanName(name: string): string {
  return name
    .replace(/[\p{Cc}\p{Cf}<>]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16)
    .trim();
}

/** graceMs: how long a disconnected player without a sketchling keeps their slot. */
export function createHub(joinUrl: (code: string) => string, graceMs = 2 * 60_000) {
  const rooms = new Map<string, Room>();

  const send = (ws: Ws | undefined, msg: ServerMsg): void => void ws?.send(JSON.stringify(msg));
  const fail = (ws: Ws, code: ErrorMsg['code'], message: string) => send(ws, {t: 'error', code, message});

  function newCode(): string {
    for (;;) {
      let c = '';
      for (let i = 0; i < 4; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
      if (!rooms.has(c)) return c;
    }
  }

  function createRoom(code = newCode()): Room {
    const now = Date.now();
    // shortcut: stale rooms are purged only when a new one is made; fine for a LAN party server.
    for (const [c, r] of rooms) {
      if (!r.tv && ![...r.slots.values()].some(s => s.ws) && now - r.touched > ROOM_TTL_MS) rooms.delete(c);
    }
    const room: Room = {code, phase: 'lobby', slots: new Map(), touched: now};
    rooms.set(code, room);
    return room;
  }

  /** Send to the TV and every connected phone. */
  function toAll(room: Room, msg: ServerMsg) {
    send(room.tv, msg);
    for (const s of room.slots.values()) send(s.ws, msg);
  }

  /** Send to the TV and one player's phone. */
  function toTvAndPlayer(room: Room, playerId: string, msg: ServerMsg) {
    send(room.tv, msg);
    send(room.slots.get(playerId)?.ws, msg);
  }

  const broadcastPlayers = (room: Room) => toAll(room, {t: 'players', players: [...room.slots.values()].map(s => s.player)});

  /** Forget whatever this socket was attached to (on close, or before a second hello). */
  function detach(ws: Ws) {
    const {role, room: code, playerId} = ws.data;
    ws.data = {};
    const room = code ? rooms.get(code) : undefined;
    if (!room) return;
    room.touched = Date.now();
    if (role === 'tv' && room.tv === ws) room.tv = undefined;
    const slot = role === 'phone' && playerId ? room.slots.get(playerId) : undefined;
    if (slot && slot.ws === ws) {
      slot.ws = undefined;
      slot.player.connected = false;
      broadcastPlayers(room);
      // Gone for good without a creature: free the slot. Players with a sketchling stay (connected: false) for races and the hall.
      // shortcut: a scan still running when this fires keeps the slot even if it then fails; fine for a party.
      slot.dropTimer = setTimeout(() => {
        if (slot.ws || slot.player.sketchling || slot.scanning) return;
        room.slots.delete(slot.player.id);
        broadcastPlayers(room);
      }, graceMs);
    }
  }

  function helloTv(ws: Ws, wanted?: string) {
    const code = wanted?.trim().toUpperCase();
    // Reattach to the room; if the server restarted, recreate it under the same code so the TV's QR stays valid.
    const room = (code && rooms.get(code)) || createRoom(code && CODE_RE.test(code) && !rooms.has(code) ? code : undefined);
    room.tv = ws; // newest TV wins; frames from a replaced TV socket are ignored
    room.touched = Date.now();
    ws.data = {role: 'tv', room: room.code};
    send(ws, {t: 'room', code: room.code, joinUrl: joinUrl(room.code)});
    send(ws, {t: 'players', players: [...room.slots.values()].map(s => s.player)});
  }

  function helloPhone(ws: Ws, msg: HelloPhone) {
    const room = rooms.get(msg.room.trim().toUpperCase());
    if (!room) return fail(ws, 'no_room', `No room called ${msg.room.trim().toUpperCase().slice(0, 8)}. Check the code on the TV.`);
    let slot = msg.playerId ? room.slots.get(msg.playerId) : undefined;
    if (!slot) {
      const name = cleanName(msg.name);
      if (!name) return fail(ws, 'bad_message', 'Please type your first name.');
      if (room.slots.size >= MAX_PLAYERS) return fail(ws, 'room_full', `This party already has ${MAX_PLAYERS} players.`);
      const used = new Set([...room.slots.values()].map(s => s.player.color));
      const player: Player = {id: crypto.randomUUID(), name, ageGroup: msg.ageGroup, color: PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[0]!, connected: true};
      slot = {player};
      room.slots.set(player.id, slot);
    }
    clearTimeout(slot.dropTimer);
    if (slot.ws && slot.ws !== ws) {
      slot.ws.data = {}; // so the older socket's close event can't mark the live player disconnected
      slot.ws.close(1000, 'replaced');
    }
    slot.ws = ws;
    slot.player.connected = true;
    room.touched = Date.now();
    ws.data = {role: 'phone', room: room.code, playerId: slot.player.id};
    send(ws, {t: 'joined', playerId: slot.player.id, color: slot.player.color, room: room.code, phase: room.phase});
    if (room.lastPhase) send(ws, room.lastPhase);
    broadcastPlayers(room);
  }

  function message(ws: Ws, raw: string | Buffer) {
    const msg = parseClientMsg(raw);
    if (typeof msg === 'string') return fail(ws, 'bad_message', msg);
    const room = ws.data.room ? rooms.get(ws.data.room) : undefined;
    switch (msg.t) {
      case 'ping':
        return send(ws, {t: 'pong'});
      case 'hello':
        detach(ws);
        return msg.role === 'tv' ? helloTv(ws, msg.room) : helloPhone(ws, msg);
      case 'phase': {
        if (ws.data.role !== 'tv' || !room || room.tv !== ws) return fail(ws, 'bad_message', 'only the TV can change the phase (send hello as tv first)');
        room.phase = msg.phase;
        room.lastPhase = msg;
        room.touched = Date.now();
        for (const s of room.slots.values()) send(s.ws, msg);
        return;
      }
      case 'input': {
        const playerId = ws.data.playerId;
        if (ws.data.role !== 'phone' || !room || !playerId || room.slots.get(playerId)?.ws !== ws) return fail(ws, 'bad_message', 'send hello as phone before input');
        return send(room.tv, {t: 'input', playerId, kind: msg.kind, at: msg.at});
      }
    }
  }

  return {
    rooms,
    toTvAndPlayer,
    broadcastPlayers,
    websocket: {
      message,
      close: detach,
      maxPayloadLength: 64 * 1024,
    },
  };
}

export type Hub = ReturnType<typeof createHub>;
