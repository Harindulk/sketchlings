// The TV's side of the party: one WebSocket to the server (live) or a scripted fake party (demo).
// Lobby state lives in React state (changes a few times a minute); race inputs bypass React entirely
// and go straight to listeners so taps never trigger re-renders.
import {useCallback, useEffect, useRef, useState} from 'react';
import type {
  InputKind,
  Phase,
  Player,
  ServerMsg,
  Sketchling,
} from '../../../shared/protocol';
import {WS_URL} from '../config';
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

export function useParty(mode: PartyMode | null) {
  const [state, setState] = useState<PartyState>(EMPTY);
  const ws = useRef<WebSocket | null>(null);
  const listeners = useRef(new Set<InputListener>());
  const code = useRef<string | undefined>(undefined);

  useEffect(() => {
    setState(EMPTY);
    code.current = undefined;
    if (mode === 'demo') return runDemoLobby(setState);
    if (mode !== 'live') return;

    let closed = false;
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
        sock.send(
          JSON.stringify({
            t: 'hello',
            role: 'tv',
            ...(code.current ? {room: code.current} : {}),
          }),
        );
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
        if (closed) return;
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
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      clearInterval(ping);
      ws.current?.close();
      ws.current = null;
    };
  }, [mode]);

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

/** Scripted lobby: four players join, draw, and come alive one after another. */
function runDemoLobby(setState: (f: (s: PartyState) => PartyState) => void) {
  const players = demoPlayers();
  const timers: ReturnType<typeof setTimeout>[] = [];
  const at = (ms: number, f: (s: PartyState) => PartyState) =>
    timers.push(setTimeout(() => setState(f), ms));
  at(300, (s) => ({
    ...s,
    conn: 'open',
    code: 'DEMO',
    joinUrl: 'https://github.com/starfungames/sketchlings',
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
