// In-memory rooms + the WebSocket relay between one TV and its phones.
import type {ServerWebSocket} from 'bun';
import type {AgeGroup, ClientMsg, ErrorMsg, HelloPhone, InputKind, MoveStyle, Phase, PhaseMsg, Player, ServerMsg, Sketchling} from '../../shared/protocol';
import {MAX_PLAYERS, PLAYER_COLORS} from '../../shared/protocol';
import {abilityFor, MOVES} from './ability';
import {UNSAFE_NAME} from './persona';

export type WsData = {role?: 'tv' | 'phone'; room?: string; playerId?: string; tunnel?: boolean}; // tunnel: came through the public link
type Ws = ServerWebSocket<WsData>;

export interface Slot {
  player: Player;
  ws?: Ws;
  scanning?: boolean;
  dropTimer?: ReturnType<typeof setTimeout>;
  rtt?: number[]; // WebSocket ping->pong times (ms) the server measured to this phone during the current race
  key?: string; // the secret from the phone's first hello; a reconnect must send it to take this player back
  inputs?: {taps: number; jumps: number; roars: number; holdMs: number; holdFrom?: number}; // this player's inputs in the current race
}

export interface Room {
  code: string;
  tv?: Ws;
  phase: Phase;
  lastPhase?: PhaseMsg; // replayed to phones that (re)join mid-game
  slots: Map<string, Slot>;
  touched: number;
  aiPersonas?: boolean; // false: the TV's grown-ups said no, so this room's drawings never go to Claude
  pinger?: ReturnType<typeof setInterval>; // during a race: measures each phone's Wi-Fi round trip
  raceFrom?: number; // when the TV entered the current race (server ms)
  removed?: Set<string>; // playerIds the TV took out: a hello with one of them is refused
}

export interface HubHooks {
  clearHall?: () => number; // deletes the Hall of Fame, returns how many creatures went
  sketchlingChanged?: (s: Sketchling) => void; // the artist changed its ability
  deleteCreatures?: (match: (s: Sketchling) => boolean) => number; // deletes the hall entries it matches, returns how many
}

// No vowels (so codes never spell words) and none of I/L/O/Q that read like 1 or 0.
export const CODE_ALPHABET = 'BCDFGHJKMNPRSTVWXZ';
const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{4}$`);
const PHASES: Phase[] = ['lobby', 'draw', 'reveal', 'race', 'results'];
const KINDS: InputKind[] = ['tap', 'jump', 'hold', 'release', 'shout'];
const AGE_GROUPS: AgeGroup[] = ['little', 'big', 'grownup'];
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const RTT_PING_MS = 2000; // during a race the server pings every phone this often
const MAX_RTT_SAMPLES = 500; // per player per race
export const ARTIST_FEATURE = "artist's pick"; // ability.feature when the child picked a kind the drawing didn't
const REMOVED = "You've left this party. Thanks for playing!";

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
    case 'ability':
      return MOVES.includes(m.kind as MoveStyle) ? {t: 'ability', kind: m.kind as MoveStyle} : `kind must be one of ${MOVES.join(', ')}`;
    case 'clearHall':
      return {t: 'clearHall'};
    case 'removePlayer':
      return typeof m.playerId === 'string' ? {t: 'removePlayer', playerId: m.playerId} : 'playerId must be a string';
    case 'deleteCreature':
      return typeof m.id === 'string' ? {t: 'deleteCreature', id: m.id} : 'id must be a string';
    case 'hello':
      if (m.role === 'tv') {
        if (!optStr(m.room)) return 'room must be a string';
        if (m.aiPersonas !== undefined && typeof m.aiPersonas !== 'boolean') return 'aiPersonas must be true or false';
        return {t: 'hello', role: 'tv', room: m.room as string | undefined, ...(m.aiPersonas !== undefined ? {aiPersonas: m.aiPersonas} : {})};
      }
      if (m.role === 'phone') {
        if (typeof m.room !== 'string' || typeof m.name !== 'string' || !optStr(m.playerId)) return 'phone hello needs room, name and optional playerId strings';
        if (m.key !== undefined && !(typeof m.key === 'string' && m.key.length >= 16 && m.key.length <= 64)) return 'key must be a string of 16-64 characters';
        if (m.ageGroup !== undefined && !AGE_GROUPS.includes(m.ageGroup as AgeGroup)) return `ageGroup must be one of ${AGE_GROUPS.join(', ')}`;
        // ageGroup is optional on the wire for older phone builds; default 'big'
        return {t: 'hello', role: 'phone', room: m.room, name: m.name, ageGroup: (m.ageGroup as AgeGroup) ?? 'big', playerId: m.playerId as string | undefined, ...(m.key !== undefined ? {key: m.key as string} : {})};
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

// A letter run; ZWNJ/ZWJ only between letters or marks, because Sinhala and Tamil spell with them (ශ්‍රියානි).
const RUN = String.raw`\p{L}(?:[\p{L}\p{M}]|[\u200C\u200D]+(?=[\p{L}\p{M}]))*`;
const LETTERS = new RegExp(`${RUN}(?:['’-]${RUN})*`, 'u');

/** First name only: the first word's letters (an inner hyphen, apostrophe, ZWNJ or ZWJ is fine), at most 12, through
 * the same word guard as personas. "Artist" when nothing suitable is left; '' (rejected) when the name is blank. */
export function cleanName(name: string): string {
  const word = name.normalize('NFC').replace(/(?![\u200C\u200D])\p{Cf}/gu, '').split(/[\s\p{Cc}]+/u).map(w => w.replace(/^[\u200C\u200D]+|[\u200C\u200D]+$/g, '')).find(Boolean);
  if (!word) return '';
  const letters = word.match(LETTERS)?.[0] ?? '';
  const short = [...letters].slice(0, 12).join('').replace(/['’\u200C\u200D-]+$/u, '');
  // the guard reads the name without joiners, so "Ki\u200Dll" is still caught
  return short && !UNSAFE_NAME.test(short.replace(/[\u200C\u200D]/g, '')) ? short : 'Artist';
}

/** During a race: count one input. A roar is any 'shout' (ROAR button or mic); the phone repeats 'hold' every 0.5 s. */
function countInput(slot: Slot, kind: InputKind) {
  const c = (slot.inputs ??= {taps: 0, jumps: 0, roars: 0, holdMs: 0});
  if (kind === 'tap') c.taps++;
  else if (kind === 'jump') c.jumps++;
  else if (kind === 'shout') c.roars++;
  else if (kind === 'hold') c.holdFrom ??= Date.now();
  else if (c.holdFrom !== undefined) {
    c.holdMs += Date.now() - c.holdFrom;
    c.holdFrom = undefined;
  }
}

/** Nearest-rank percentile of an ascending list. */
const pct = (sorted: number[], p: number) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]!;

/** graceMs: how long a disconnected player without a sketchling keeps their slot. */
export function createHub(joinUrl: (code: string) => string, graceMs = 2 * 60_000, hooks: HubHooks = {}) {
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
    const {role, room: code, playerId, tunnel} = ws.data;
    ws.data = {tunnel};
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

  function helloTv(ws: Ws, wanted?: string, aiPersonas?: boolean) {
    const code = wanted?.trim().toUpperCase();
    // Reattach to the room; if the server restarted, recreate it under the same code so the TV's QR stays valid.
    const room = (code && rooms.get(code)) || createRoom(code && CODE_RE.test(code) && !rooms.has(code) ? code : undefined);
    room.tv = ws; // newest TV wins; frames from a replaced TV socket are ignored
    room.touched = Date.now();
    if (aiPersonas !== undefined && aiPersonas !== room.aiPersonas) { // first word from this TV, or a change
      room.aiPersonas = aiPersonas;
      console.log(`[consent] room ${room.code}: AI personas ${aiPersonas ? 'on' : 'off, no drawing from this room goes to Claude'}`);
    }
    ws.data = {role: 'tv', room: room.code};
    send(ws, {t: 'room', code: room.code, joinUrl: joinUrl(room.code)});
    send(ws, {t: 'players', players: [...room.slots.values()].map(s => s.player)});
  }

  function helloPhone(ws: Ws, msg: HelloPhone) {
    const room = rooms.get(msg.room.trim().toUpperCase());
    if (!room) return fail(ws, 'no_room', `No room called ${msg.room.trim().toUpperCase().slice(0, 8)}. Check the code on the TV.`);
    if (msg.playerId && room.removed?.has(msg.playerId)) return fail(ws, 'removed', REMOVED);
    let slot = msg.playerId ? room.slots.get(msg.playerId) : undefined;
    // playerIds are in every `players` frame: without the first hello's key, a known id joins as a new player.
    if (slot?.key !== undefined && msg.key !== slot.key) slot = undefined;
    if (!slot) {
      const name = cleanName(msg.name);
      if (!name) return fail(ws, 'bad_message', 'Please type your first name.');
      if (room.slots.size >= MAX_PLAYERS) return fail(ws, 'room_full', `This party already has ${MAX_PLAYERS} players.`);
      const used = new Set([...room.slots.values()].map(s => s.player.color));
      const player: Player = {id: crypto.randomUUID(), name, ageGroup: msg.ageGroup, color: PLAYER_COLORS.find(c => !used.has(c)) ?? PLAYER_COLORS[0]!, connected: true};
      slot = {player, key: msg.key};
      room.slots.set(player.id, slot);
    }
    clearTimeout(slot.dropTimer);
    if (slot.ws && slot.ws !== ws) {
      slot.ws.data = {tunnel: slot.ws.data.tunnel}; // so the older socket's close event can't mark the live player disconnected
      slot.ws.close(1000, 'replaced');
    }
    slot.ws = ws;
    slot.player.connected = true;
    room.touched = Date.now();
    ws.data = {role: 'phone', room: room.code, playerId: slot.player.id, tunnel: ws.data.tunnel};
    send(ws, {t: 'joined', playerId: slot.player.id, color: slot.player.color, room: room.code, phase: room.phase});
    if (room.lastPhase) send(ws, room.lastPhase);
    broadcastPlayers(room);
  }

  /** One line per race: each player's Wi-Fi round trip (median/p90 of the server's pings to their phone). */
  function logRaceRtt(room: Room) {
    const parts: string[] = [];
    for (const s of room.slots.values()) {
      const r = s.rtt?.sort((a, b) => a - b);
      if (r?.length) parts.push(`${s.player.name} ${Math.round(pct(r, 0.5))}/${Math.round(pct(r, 0.9))} n=${r.length}`);
      s.rtt = undefined;
    }
    if (parts.length) console.log(`[net] race rtt ms (median/p90): ${parts.join(', ')}`);
  }

  /** One line per race: each player's age band, taps a second over the whole race (a hold counts as 4 a second, as on
   * the TV), hold time, jumps and roars. Real rates to check against the fairness simulation's assumptions. */
  function logRaceInputs(room: Room) {
    const now = Date.now();
    const secs = Math.max(1, now - (room.raceFrom ?? now)) / 1000;
    const parts: string[] = [];
    for (const s of room.slots.values()) {
      const c = s.inputs;
      s.inputs = undefined;
      if (!c) continue;
      const hold = (c.holdMs + (c.holdFrom === undefined ? 0 : now - c.holdFrom)) / 1000;
      const rate = (c.taps + 4 * hold) / secs;
      parts.push(`${s.player.name} ${s.player.ageGroup} taps/s ${rate.toFixed(1)} hold ${hold.toFixed(1)}s jumps ${c.jumps} roars ${c.roars}`);
    }
    if (parts.length) console.log(`[race] inputs over ${secs.toFixed(1)}s: ${parts.join('; ')}`);
  }

  /** The artist changes their creature's ability before the race; the drawing's own pick is kept in `original`. */
  function changeAbility(ws: Ws, room: Room | undefined, kind: MoveStyle) {
    const playerId = ws.data.playerId;
    const slot = playerId ? room?.slots.get(playerId) : undefined;
    if (ws.data.role !== 'phone' || !room || !slot || slot.ws !== ws) return fail(ws, 'bad_message', 'send hello as phone first');
    const s = slot.player.sketchling;
    if (!s) return fail(ws, 'bad_message', 'Scan a drawing first.');
    if (room.phase === 'race' || room.phase === 'results') return fail(ws, 'bad_message', 'Abilities can only change before the race.');
    const original = s.ability.original ?? {kind: s.ability.kind, feature: s.ability.feature};
    // Back to the drawing's own pick: the plain drawing ability again, so chosenBy means a real change.
    const ability = kind === original.kind ? abilityFor(kind, original.feature) : {...abilityFor(kind, ARTIST_FEATURE), chosenBy: 'artist' as const, original};
    const changed: Sketchling = {...s, move: kind, ability};
    slot.player.sketchling = changed;
    toTvAndPlayer(room, slot.player.id, {t: 'sketchling', sketchling: changed});
    broadcastPlayers(room);
    hooks.sketchlingChanged?.(changed);
  }

  /** During a race: a WebSocket ping (control frame) to every phone with the send time. Browsers answer it themselves. */
  function pingPhones(room: Room) {
    if (room.phase !== 'race' || rooms.get(room.code) !== room) return clearInterval(room.pinger);
    for (const s of room.slots.values()) s.ws?.ping(String(Date.now()));
  }

  /** The answer to pingPhones: one round trip for this race. Bun's own idle pings carry no time and are dropped. */
  function pong(ws: Ws, data: Buffer) {
    const room = ws.data.room ? rooms.get(ws.data.room) : undefined;
    const slot = ws.data.playerId ? room?.slots.get(ws.data.playerId) : undefined;
    const rtt = Date.now() - Number(data.toString());
    if (room?.phase === 'race' && slot?.ws === ws && rtt >= 0 && rtt <= 60_000 && (slot.rtt ??= []).length < MAX_RTT_SAMPLES) slot.rtt.push(rtt);
  }

  function message(ws: Ws, raw: string | Buffer) {
    const msg = parseClientMsg(raw);
    if (typeof msg === 'string') return fail(ws, 'bad_message', msg);
    const room = ws.data.room ? rooms.get(ws.data.room) : undefined;
    switch (msg.t) {
      case 'ping':
        return send(ws, {t: 'pong'});
      case 'hello':
        // The TV reaches the server over the LAN (or 10.0.2.2); a "TV" on the public link could delete the hall or take a room.
        if (msg.role === 'tv' && ws.data.tunnel) return fail(ws, 'bad_message', 'A TV must connect over the Wi-Fi, not the public link.');
        detach(ws);
        return msg.role === 'tv' ? helloTv(ws, msg.room, msg.aiPersonas) : helloPhone(ws, msg);
      case 'ability':
        return changeAbility(ws, room, msg.kind);
      case 'clearHall':
        if (ws.data.role !== 'tv' || !room || room.tv !== ws) return fail(ws, 'bad_message', 'only the TV can clear the Hall of Fame (send hello as tv first)');
        try {
          return send(ws, {t: 'hallCleared', removed: hooks.clearHall?.() ?? 0});
        } catch (e) {
          console.error('[hall] clear failed:', e);
          return fail(ws, 'bad_message', 'Could not clear the Hall of Fame. Please try again.');
        }
      case 'removePlayer': {
        if (ws.data.role !== 'tv' || !room || room.tv !== ws) return fail(ws, 'bad_message', 'only the TV can remove a player (send hello as tv first)');
        const slot = room.slots.get(msg.playerId);
        if (!slot) return fail(ws, 'bad_message', 'No such player in this party.');
        clearTimeout(slot.dropTimer);
        room.slots.delete(msg.playerId);
        (room.removed ??= new Set()).add(msg.playerId);
        if (slot.ws) {
          fail(slot.ws, 'removed', REMOVED);
          slot.ws.close(1000, 'removed');
        }
        const n = hooks.deleteCreatures?.(s => s.playerId === msg.playerId) ?? 0;
        console.log(`[room] ${room.code}: the TV removed a player and their ${n} creature(s)`); // no name: it may be a withdrawal
        return broadcastPlayers(room);
      }
      case 'deleteCreature': {
        if (ws.data.role !== 'tv' || !room || room.tv !== ws) return fail(ws, 'bad_message', 'only the TV can delete a creature (send hello as tv first)');
        const removed = hooks.deleteCreatures?.(s => s.id === msg.id) ?? 0;
        for (const r of rooms.values()) {
          for (const s of r.slots.values()) {
            if (s.player.sketchling?.id !== msg.id) continue;
            s.player.sketchling = undefined; // its sprite and voice are gone
            broadcastPlayers(r);
          }
        }
        return send(ws, {t: 'creatureDeleted', id: msg.id, removed});
      }
      case 'phase': {
        if (ws.data.role !== 'tv' || !room || room.tv !== ws) return fail(ws, 'bad_message', 'only the TV can change the phase (send hello as tv first)');
        if (room.phase === 'race' && msg.phase !== 'race') {
          logRaceRtt(room);
          logRaceInputs(room);
        }
        if (room.phase !== 'race' && msg.phase === 'race') {
          room.raceFrom = Date.now();
          for (const s of room.slots.values()) s.rtt = s.inputs = undefined;
        }
        room.phase = msg.phase;
        room.lastPhase = msg;
        room.touched = Date.now();
        for (const s of room.slots.values()) send(s.ws, msg);
        clearInterval(room.pinger);
        if (msg.phase === 'race') {
          room.pinger = setInterval(() => pingPhones(room), RTT_PING_MS);
          pingPhones(room);
        }
        return;
      }
      case 'input': {
        const playerId = ws.data.playerId;
        const slot = playerId ? room?.slots.get(playerId) : undefined;
        if (ws.data.role !== 'phone' || !room || !playerId || !slot || slot.ws !== ws) return fail(ws, 'bad_message', 'send hello as phone before input');
        if (room.phase === 'race') countInput(slot, msg.kind);
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
      pong,
      close: detach,
      maxPayloadLength: 64 * 1024,
    },
  };
}

export type Hub = ReturnType<typeof createHub>;
