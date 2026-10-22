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
    chosenBy?: 'artist'; // the child changed it on the phone (AbilityMsg); absent = picked from the drawing
    original?: {kind: MoveStyle; feature: string}; // the pick from the drawing (Claude's or offline), kept when the artist changes it
  };
  colors: string[]; // dominant ink colours, '#rrggbb'
  spriteUrl: string; // absolute path on the server, e.g. '/sprites/<id>.png'
  // Where the drawing's eyes are, normalised to the sprite (x,y in 0..1 of width/height; r = radius as a fraction of width).
  // Used for animated googly eyes. Empty array = no placeable eyes: the TV adds a default pair in the upper part,
  // UNLESS `ownEyes` is true (the child drew eyes we couldn't place) — then the TV adds none (no four-eyed creatures).
  eyes: {x: number; y: number; r: number}[];
  ownEyes?: boolean;
  width: number; // sprite pixel size
  height: number;
  source: 'claude' | 'offline';
  artist?: string; // first name of the player who drew it (Hall of Fame credit)
  artistAge?: AgeGroup; // the artist's age group, so replays (demo party, race again) keep the right boost
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

// shout = phone mic loudness spike or the ROAR button. hold = a finger kept down, repeated every 0.5 s until release;
// the TV counts it as 4 taps a second. The server counts each player's inputs during a race for one log line.
export type InputKind = 'tap' | 'jump' | 'hold' | 'release' | 'shout';

// ---------- client -> server ----------
// room: rejoin an existing room after reconnect. aiPersonas: false = this room's drawings never go to Claude (offline
// personas only); absent = on. Send it in EVERY hello: a server restart recreates the room and an absent flag means on.
export type HelloTv = {t: 'hello'; role: 'tv'; room?: string; aiPersonas?: boolean};
// key: a random secret (16-64 chars) the phone makes once and sends in every hello with its playerId. A player who
// joined with a key can only be taken back with it; without one, anyone who knows the playerId can take the player over.
export type HelloPhone = {t: 'hello'; role: 'phone'; room: string; name: string; ageGroup: AgeGroup; playerId?: string; key?: string};
export type PhaseMsg = {t: 'phase'; phase: Phase; data?: Record<string, unknown>}; // tv -> server -> phones
// `data` for phase 'results' (place 1 = winner).
export interface ResultsData {
  placements: {playerId: string; place: number}[];
}
export type InputMsg = {t: 'input'; kind: InputKind; at: number}; // phone -> server -> tv; `at` = phone ms timestamp
export type PingMsg = {t: 'ping'}; // keeps the socket alive; the server measures race round trips itself (WebSocket pings)
// phone -> server: the artist changes their creature's ability, only before the race (phase lobby, draw or reveal).
// The server answers with the usual `sketchling` frame (same id) to the TV and the phone, or an error.
export type AbilityMsg = {t: 'ability'; kind: MoveStyle};
// tv -> server: delete the Hall of Fame (hall.json and every sprite and voice clip). Any client that sends hello as tv
// can send it (the server cannot tell a TV from a phone), so the TV's parent gate is the only guard. Answer: HallClearedMsg.
export type ClearHallMsg = {t: 'clearHall'};
export type ClientMsg = HelloTv | HelloPhone | PhaseMsg | InputMsg | PingMsg | AbilityMsg | ClearHallMsg;

// ---------- server -> client ----------
export type RoomMsg = {t: 'room'; code: string; joinUrl: string}; // to tv after hello
export type JoinedMsg = {t: 'joined'; playerId: string; color: string; room: string; phase: Phase}; // to phone
export type PlayersMsg = {t: 'players'; players: Player[]}; // to tv + phones on any change
export type SketchlingMsg = {t: 'sketchling'; sketchling: Sketchling}; // to tv + owning phone when a scan is processed
export type ScanStatusMsg = {t: 'scan'; playerId: string; status: 'processing' | 'ready' | 'failed'; message?: string}; // to tv + phone
export type RelayedInputMsg = {t: 'input'; playerId: string; kind: InputKind; at: number}; // to tv
export type HallClearedMsg = {t: 'hallCleared'; removed: number}; // to the TV that sent clearHall; removed = creatures deleted
export type ErrorMsg = {t: 'error'; code: 'no_room' | 'room_full' | 'bad_message'; message: string};
export type ServerMsg =
  | RoomMsg
  | JoinedMsg
  | PlayersMsg
  | SketchlingMsg
  | ScanStatusMsg
  | RelayedInputMsg
  | PhaseMsg
  | HallClearedMsg
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
