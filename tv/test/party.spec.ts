import {MAX_PLAYERS} from '../../shared/protocol';
import {demoPlayers, SAMPLE_SKETCHLINGS} from '../src/game/demo';
import type {PartyState} from '../src/game/party';
import {
  clearHall,
  isGuest,
  racersOf,
  setAiPersonas,
  withGuests,
} from '../src/game/party';

const [potato, frog, cloud, hedgehog, dino, star] = SAMPLE_SKETCHLINGS;
const party = (n: number): PartyState => ({
  conn: 'open',
  players: demoPlayers().slice(0, n),
  sketchlings: {},
  scans: {},
});

describe('Hall of Fame guests ("Race again")', () => {
  it('adds picked creatures as bot-run guests with free colours', () => {
    const s = withGuests(party(2), [dino, star]);
    const guests = racersOf(s).filter(isGuest);
    expect(guests.map((p) => p.sketchling!.id)).toEqual([dino.id, star.id]);
    expect(guests[0].name).toBe('Noah'); // the artist races it
    expect(guests[0].sketchling!.playerId).toBe(guests[0].id);
    expect(new Set(s.players.map((p) => p.color)).size).toBe(4);
  });

  it('skips creatures already racing and stops at the player limit', () => {
    expect(withGuests(party(2), [potato]).players).toHaveLength(2); // potato is demo player 1
    const full = withGuests(party(4), [dino, star, cloud, hedgehog, frog]);
    expect(full.players).toHaveLength(MAX_PLAYERS);
  });
});

describe('Demo party', () => {
  it('uses one of each Hall of Fame creature when there are at least two, topped up with samples', () => {
    const hall = [{...dino, id: 'h1'}, {...dino, id: 'h2'}, {...star, id: 'h3'}];
    const ps = demoPlayers(hall);
    expect(ps.map((p) => p.sketchling!.id)).toEqual(['h1', 'h3', potato.id, frog.id]);
    expect(ps[0].name).toBe('Noah');
    expect(ps.every((p) => p.sketchling!.playerId === p.id)).toBe(true);
  });

  it("gives each artist one lane and the artist's own age boost (legacy entries race as grown-ups)", () => {
    const hall = [
      {...hedgehog, id: 'h1', name: 'Spiky', artist: 'Dad', artistAge: 'grownup' as const},
      {...frog, id: 'h2', name: 'Hoppy', artist: 'Dad', artistAge: 'grownup' as const},
      {...cloud, id: 'h3', name: 'Puff', artist: 'Lily', artistAge: 'little' as const},
      {...star, id: 'h4', name: 'Old Star', artist: 'Omar', artistAge: undefined},
    ];
    const ps = demoPlayers(hall);
    expect(ps.map((p) => p.sketchling!.id)).toEqual(['h1', 'h3', 'h4', potato.id]);
    expect(ps.map((p) => p.ageGroup)).toEqual(['grownup', 'little', 'grownup', 'little']);
    expect(ps.map((p) => p.name)).toEqual(['Dad', 'Lily', 'Omar', 'Mia']);
  });

  it('keeps the samples when the hall has fewer than two', () => {
    expect(demoPlayers([dino]).map((p) => p.sketchling!.id)).toEqual(
      SAMPLE_SKETCHLINGS.slice(0, 4).map((s) => s.id),
    );
  });
});

/* global globalThis */ // the RN eslint env predates it
describe('Grown-ups: Clear Hall of Fame', () => {
  const sent: string[] = [];
  const realWs = globalThis.WebSocket;
  // the server's side of clearHall: room after hello, then hallCleared (or an error)
  const fakeServer = (answer: object) =>
    class {
      onopen?: () => void;
      onmessage?: (e: {data: string}) => void;
      onclose?: () => void;
      onerror?: () => void;
      constructor() {
        setTimeout(() => this.onopen?.(), 0);
      }
      send(s: string) {
        sent.push(s);
        const t = JSON.parse(s).t;
        const reply = t === 'hello' ? {t: 'room', code: 'BCDF', joinUrl: 'x'} : answer;
        setTimeout(() => this.onmessage?.({data: JSON.stringify(reply)}), 0);
      }
      close() {
        this.onclose?.();
      }
    };
  afterEach(() => {
    globalThis.WebSocket = realWs;
    sent.length = 0;
  });

  it('says hello as the TV with the consent flag, then clears', async () => {
    globalThis.WebSocket = fakeServer({t: 'hallCleared', removed: 3}) as any;
    setAiPersonas(true);
    await expect(clearHall()).resolves.toBe(3);
    expect(JSON.parse(sent[0])).toEqual({t: 'hello', role: 'tv', aiPersonas: true});
    expect(sent[1]).toBe('{"t":"clearHall"}');
    setAiPersonas(false);
  });

  it("passes the server's error on", async () => {
    globalThis.WebSocket = fakeServer({t: 'error', code: 'bad_message', message: 'Could not clear'}) as any;
    await expect(clearHall()).rejects.toThrow('Could not clear');
    expect(JSON.parse(sent[0]).aiPersonas).toBe(false);
  });
});
