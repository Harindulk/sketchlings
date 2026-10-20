// Contract between server, phone and TV. Keep the server, phone and TV in step when changing it.
// All WebSocket frames are JSON objects with a `t` discriminator. Server endpoint: ws://<host>:8787/ws

export type Phase = 'lobby' | 'draw' | 'reveal' | 'race' | 'results';

export type MoveStyle = 'walk' | 'hop' | 'fly' | 'roll';

export interface Stats {
  speed: number; // 1-5
  jump: number; // 1-5
  power: number; // 1-5
}

export interface Sketchling {
  id: string;
  playerId: string;
  name: string; // "Sir Wobbleton"
  title: string; // "the Brave Potato"
  personality: string; // one short sentence
  catchphrase: string; // <= 8 words
  intro: string; // host line for the reveal, <= 20 words
  winLine: string; // said when it wins, <= 12 words
  stats: Stats;
  move: MoveStyle;
  colors: string[]; // dominant ink colours, '#rrggbb'
  spriteUrl: string; // absolute path on the server, e.g. '/sprites/<id>.png'
  width: number; // sprite pixel size
  height: number;
  source: 'claude' | 'offline';
}

export interface Player {
  id: string;
  name: string;
  color: string; // player colour '#rrggbb'
  connected: boolean;
  sketchling?: Sketchling;
}

export type InputKind = 'tap' | 'jump' | 'hold' | 'release';

// ---------- client -> server ----------
export type HelloTv = {t: 'hello'; role: 'tv'; room?: string}; // room: rejoin an existing room after reconnect
export type HelloPhone = {t: 'hello'; role: 'phone'; room: string; name: string; playerId?: string};
export type PhaseMsg = {t: 'phase'; phase: Phase; data?: Record<string, unknown>}; // tv -> server -> phones
export type InputMsg = {t: 'input'; kind: InputKind; at: number}; // phone -> server -> tv; `at` = phone ms timestamp
export type ClientMsg = HelloTv | HelloPhone | PhaseMsg | InputMsg | {t: 'ping'};

// ---------- server -> client ----------
export type RoomMsg = {t: 'room'; code: string; joinUrl: string}; // to tv after hello
export type JoinedMsg = {t: 'joined'; playerId: string; color: string; room: string; phase: Phase}; // to phone
export type PlayersMsg = {t: 'players'; players: Player[]}; // to tv + phones on any change
export type SketchlingMsg = {t: 'sketchling'; sketchling: Sketchling}; // to tv + owning phone when a scan is processed
export type ScanStatusMsg = {t: 'scan'; playerId: string; status: 'processing' | 'ready' | 'failed'; message?: string}; // to tv + phone
export type RelayedInputMsg = {t: 'input'; playerId: string; kind: InputKind; at: number}; // to tv
export type ErrorMsg = {t: 'error'; code: 'no_room' | 'room_full' | 'bad_message'; message: string};
export type ServerMsg =
  | RoomMsg
  | JoinedMsg
  | PlayersMsg
  | SketchlingMsg
  | ScanStatusMsg
  | RelayedInputMsg
  | PhaseMsg
  | ErrorMsg
  | {t: 'pong'};

// ---------- HTTP ----------
// GET  /j/:room                          phone web app (join page for that room)
// POST /api/rooms/:room/players/:playerId/sketch
//      body: image/png (cutout with alpha, max 1024 px). Response 202; result arrives as `scan` + `sketchling` WS frames.
// GET  /sprites/:id.png                  cutout sprite
// GET  /api/hall-of-fame                 Sketchling[] saved across sessions (newest first)
// GET  /health                           {ok: true}

export const MAX_PLAYERS = 6;
export const PLAYER_COLORS = ['#ff5a5f', '#2bb3ff', '#ffc531', '#3ddc84', '#b06cff', '#ff8a3d'];
