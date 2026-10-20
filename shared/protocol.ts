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
  // What you draw changes how you play. The ability comes from a visible feature of the drawing:
  // fly = wings -> floats over ink blots; roll = wheels/round body -> faster on flat ground;
  // hop = long legs/springy -> higher, longer jumps; walk = big/chunky -> ROAR knocks back nearby blots.
  ability: {
    kind: MoveStyle; // same as `move`
    feature: string; // the drawn feature it comes from, kid-readable, <= 4 words: "big wings", "round wheels"
    label: string; // the power, <= 6 words: "Flies over ink blots!"
  };
  colors: string[]; // dominant ink colours, '#rrggbb'
  spriteUrl: string; // absolute path on the server, e.g. '/sprites/<id>.png'
  // Where the drawing's eyes are, normalised to the sprite (x,y in 0..1 of width/height; r = radius as a fraction of width).
  // Empty array = no eyes found: the TV adds a default pair in the upper part. Used for animated googly eyes.
  eyes: {x: number; y: number; r: number}[];
  width: number; // sprite pixel size
  height: number;
  source: 'claude' | 'offline';
  artist?: string; // first name of the player who drew it (Hall of Fame credit)
  // Spoken lines in the creature's own voice: server-relative URLs to AAC audio in fragmented MP4 (.m4a), e.g. '/voice/<id>/intro.m4a'.
  // Absent while audio is still generating or if TTS failed; a later `sketchling` frame for the same id adds it.
  voice?: {intro?: string; catchphrase?: string; winLine?: string};
}

export type AgeGroup = 'little' | 'big' | 'grownup'; // little <= 7, big 8-12, grownup 13+

// Visible fairness: speed multiplier applied in races, shown on screen as a badge (e.g. "+40% boost").
export const AGE_BOOST: Record<AgeGroup, number> = {little: 1.4, big: 1.2, grownup: 1.0};

export interface Player {
  id: string;
  name: string;
  ageGroup: AgeGroup;
  color: string; // player colour '#rrggbb'
  connected: boolean;
  sketchling?: Sketchling;
}

export type InputKind = 'tap' | 'jump' | 'hold' | 'release' | 'shout'; // shout = phone mic loudness spike or the ROAR button

// ---------- client -> server ----------
export type HelloTv = {t: 'hello'; role: 'tv'; room?: string}; // room: rejoin an existing room after reconnect
export type HelloPhone = {t: 'hello'; role: 'phone'; room: string; name: string; ageGroup: AgeGroup; playerId?: string};
export type PhaseMsg = {t: 'phase'; phase: Phase; data?: Record<string, unknown>}; // tv -> server -> phones
// `data` for phase 'results' (place 1 = winner).
export interface ResultsData {
  placements: {playerId: string; place: number}[];
}
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
