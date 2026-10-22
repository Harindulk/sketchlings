// The TV's side of the party: one WebSocket to the server (live) or a scripted fake party (demo).
// Lobby state lives in React state (changes a few times a minute); race inputs bypass React entirely
// and go straight to listeners so taps never trigger re-renders.
import {useCallback, useEffect, useRef, useState} from 'react';
import {
  AsyncStorage,
  useKeplerAppStateManager,
} from '@amazon-devices/react-native-kepler';
import type {
  HelloTv,
  InputKind,
  Phase,
  Player,
  ServerMsg,
  Sketchling,
} from '../../../shared/protocol';
import {MAX_PLAYERS, PLAYER_COLORS} from '../../../shared/protocol';
import {HOST, HTTP_BASE, WS_URL} from '../config';
import {demoPlayers} from './demo';

export type PartyMode = 'live' | 'demo';
export type ScanStatus = 'processing' | 'ready' | 'failed';
/** at = phone timestamp from the InputMsg, recv = TV receive time (Date.now()) */
export type InputListener = (
  playerId: string,
  kind: InputKind,
  at?: number,
  recv?: number,
) => void;

export interface PartyState {
  conn: 'connecting' | 'open' | 'offline';
  code?: string;
  joinUrl?: string;
  players: Player[];
  sketchlings: Record<string, Sketchling>;
  scans: Record<string, ScanStatus>;
}

const EMPTY: PartyState = {
  conn: 'connecting',
  players: [],
  sketchlings: {},
  scans: {},
};

/** Players whose Sketchling is ready, with the Sketchling attached. */
export const racersOf = (s: PartyState): Player[] =>
  s.players
    .map((p) => ({...p, sketchling: p.sketchling ?? s.sketchlings[p.id]}))
    .filter((p) => p.sketchling);

/** GET /api/hall-of-fame (newest first); rejects when the server is unreachable within `ms`. */
export function fetchHall(ms = 3000): Promise<Sketchling[]> {
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), ms);
  return fetch(`${HTTP_BASE}/api/hall-of-fame`, {signal: ctrl.signal})
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((list: unknown) => {
      if (!Array.isArray(list)) throw new Error('bad hall of fame');
      return list.filter((s) => s && s.id && s.spriteUrl) as Sketchling[];
    })
    .finally(() => clearTimeout(timeout));
}

export const isGuest = (p: Player) => p.id.startsWith('guest-');

// The grown-ups' "AI personas" choice (Grown-ups screen): off until a grown-up turns it on, kept across launches
// (Vega's AsyncStorage, SQLite-backed). Read at every hello, so a live party picks it up on its next connect.
export const consent = {aiPersonas: false};
const CONSENT_KEY = 'sketchlings.aiPersonas';
export function loadConsent() {
  try {
    AsyncStorage.getItem(CONSENT_KEY).then(
      (v) => (consent.aiPersonas = v === 'on'),
      () => {},
    );
  } catch {
    // no storage module: the choice lasts until the app closes
  }
}
export function setAiPersonas(on: boolean) {
  consent.aiPersonas = on;
  try {
    AsyncStorage.setItem(CONSENT_KEY, on ? 'on' : 'off').catch(() => {});
  } catch {
    // as above
  }
}

/** Every TV hello carries aiPersonas: a server restart recreates the room, and an absent flag means on. */
function tvHello(room?: string) {
  const hello: HelloTv = {
    t: 'hello',
    role: 'tv',
    aiPersonas: consent.aiPersonas,
    ...(room ? {room} : {}),
  };
  return JSON.stringify(hello);
}

/** Grown-ups screen: delete the server's Hall of Fame. Home has no socket, so this opens one and says hello as the
 *  TV (a throwaway room the server purges later). Resolves with how many creatures went. */
export function clearHall(ms = 8000): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = new WebSocket(WS_URL);
    const end = () => {
      clearTimeout(timer);
      sock.onclose = null; // settled: our own close is not a failure
      sock.close();
    };
    const fail = (why: string) => {
      end();
      reject(new Error(why));
    };
    const timer = setTimeout(
      () => fail(`Can't reach the party server at ${HOST}.`),
      ms,
    );
    sock.onopen = () => sock.send(tvHello());
    sock.onmessage = (ev) => {
      let msg: ServerMsg;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.t === 'room') sock.send('{"t":"clearHall"}');
      else if (msg.t === 'error') fail(msg.message);
      else if (msg.t === 'hallCleared') {
        end();
        resolve(msg.removed);
      }
    };
    sock.onerror = () => {}; // onclose follows
    sock.onclose = () => fail(`Can't reach the party server at ${HOST}.`);
  });
}

/** Hall of Fame creatures picked for "Race again" join the party as bot-run guest racers (up to MAX_PLAYERS). */
export function withGuests(s: PartyState, guests: Sketchling[]): PartyState {
  if (!guests.length) return s;
  const players = [...s.players];
  const racing = new Set(racersOf(s).map((p) => p.sketchling!.id));
  for (const g of guests) {
    if (players.length >= MAX_PLAYERS || racing.has(g.id)) continue;
    const used = new Set(players.map((p) => p.color));
    const id = `guest-${g.id}`;
    players.push({
      id,
      name: g.artist || g.name,
      ageGroup: g.artistAge ?? 'grownup', // the artist's boost; older hall entries race as grown-ups
      color: PLAYER_COLORS.find((c) => !used.has(c)) ?? PLAYER_COLORS[0],
      connected: true,
      sketchling: {...g, playerId: id},
    });
  }
  return {...s, players};
}

export function useParty(mode: PartyMode | null) {
  const [state, setState] = useState<PartyState>(EMPTY);
  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<InputListener>());
  const code = useRef<string | undefined>(undefined);
  const appState = useKeplerAppStateManager(); // memoized per root tag: stable across renders

  useEffect(() => {
    setState(EMPTY);
    code.current = undefined;
    if (mode === 'demo') return runDemoLobby(setState);
    if (mode !== 'live') return;

    let closed = false;
    let away = false; // backgrounded: socket closed on purpose, reopened (same room) when active again
    let retry: ReturnType<typeof setTimeout> | undefined;
    let failures = 0;
    const ping = setInterval(
      () => ws.current?.readyState === 1 && ws.current.send('{"t":"ping"}'),
      20000,
    );

    const connect = () => {
      const sock = new WebSocket(WS_URL);
      ws.current = sock;
      sock.onopen = () => {
        failures = 0;
        sock.send(tvHello(code.current));
      };
      sock.onmessage = (ev) => {
        let msg: ServerMsg;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.t === 'input') {
          const recv = Date.now();
          listeners.current.forEach((l) =>
            l(msg.playerId, msg.kind, msg.at, recv),
          );
          return;
        }
        setState((s) => reduce(s, msg));
        if (msg.t === 'room') code.current = msg.code;
      };
      sock.onclose = () => {
        if (closed || away) return;
        failures++;
        setState((s) => ({
          ...s,
          conn: failures > 1 ? 'offline' : 'connecting',
        }));
        retry = setTimeout(connect, Math.min(4000, 800 * failures));
      };
      sock.onerror = () => {}; // onclose follows and handles the retry
    };
    connect();
    const life = appState.addAppStateListener('change', (st) => {
      if (st === 'background' && !away) {
        away = true;
        if (retry) clearTimeout(retry);
        ws.current?.close();
      } else if (st === 'active' && away) {
        away = false;
        connect(); // hello carries code.current, so the TV rejoins its room and the phones stay in it
      }
    });
    return () => {
      life.remove();
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(ping);
      ws.current?.close();
      ws.current = null;
    };
  }, [mode, appState]);

  const sendPhase = useCallback(
    (phase: Phase, data?: Record<string, unknown>) => {
      if (ws.current?.readyState === 1)
        ws.current.send(
          JSON.stringify({t: 'phase', phase, ...(data ? {data} : {})}),
        );
    },
    [],
  );

  const onInput = useCallback((l: InputListener) => {
    listeners.current.add(l);
    return () => void listeners.current.delete(l);
  }, []);

  return {state, sendPhase, onInput};
}

export type Party = ReturnType<typeof useParty>;

function reduce(s: PartyState, msg: ServerMsg): PartyState {
  switch (msg.t) {
    case 'room':
      return {...s, conn: 'open', code: msg.code, joinUrl: msg.joinUrl};
    case 'players':
      return {...s, conn: 'open', players: msg.players};
    case 'sketchling':
      return {
        ...s,
        sketchlings: {
          ...s.sketchlings,
          [msg.sketchling.playerId]: msg.sketchling,
        },
        scans: {...s.scans, [msg.sketchling.playerId]: 'ready'},
      };
    case 'scan':
      // a 'ready' scan without its sketchling yet stays 'processing' until the sketchling frame lands
      return {
        ...s,
        scans: {
          ...s.scans,
          [msg.playerId]:
            msg.status === 'ready' && !s.sketchlings[msg.playerId]
              ? 'processing'
              : msg.status,
        },
      };
    default:
      return s;
  }
}

/** Scripted lobby: four players join, draw, and come alive one after another. Uses this house's Hall of Fame
 *  creatures when it has at least two (the server is optional: offline it uses our bundled samples). */
function runDemoLobby(setState: (f: (s: PartyState) => PartyState) => void) {
  let stopped = false;
  let stop = () => {};
  fetchHall(1500)
    .catch(() => [])
    .then((hall) => {
      if (!stopped) stop = scriptDemo(setState, demoPlayers(hall));
    });
  return () => {
    stopped = true;
    stop();
  };
}

function scriptDemo(
  setState: (f: (s: PartyState) => PartyState) => void,
  players: Player[],
) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, f: (s: PartyState) => PartyState) =>
    timers.push(setTimeout(() => setState(f), ms));
  at(300, (s) => ({
    ...s,
    conn: 'open',
    code: 'DEMO',
    joinUrl: 'https://github.com/Harindulk/sketchlings',
  }));
  players.forEach((p, i) => {
    const t = 900 + i * 900;
    at(t, (s) => ({
      ...s,
      players: [...s.players, {...p, sketchling: undefined}],
    }));
    at(t + 1300, (s) => ({...s, scans: {...s.scans, [p.id]: 'processing'}}));
    at(t + 2900, (s) => ({
      ...s,
      sketchlings: {...s.sketchlings, [p.id]: p.sketchling!},
      scans: {...s.scans, [p.id]: 'ready'},
    }));
  });
  return () => timers.forEach(clearTimeout);
}
