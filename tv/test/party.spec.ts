import {MAX_PLAYERS} from '../../shared/protocol';
import {demoPlayers, SAMPLE_SKETCHLINGS} from '../src/game/demo';
import type {PartyState} from '../src/game/party';
import {isGuest, racersOf, withGuests} from '../src/game/party';

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

  it('keeps the samples when the hall has fewer than two', () => {
    expect(demoPlayers([dino]).map((p) => p.sketchling!.id)).toEqual(
      SAMPLE_SKETCHLINGS.slice(0, 4).map((s) => s.id),
    );
  });
});
