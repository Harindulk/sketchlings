import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {BackHandler, Dimensions, StyleSheet, View} from 'react-native';
import type {Player, ResultsData, Sketchling} from '../../shared/protocol';
import {hush, prefetch} from './audio';
import {ScreenIn} from './components/Bits';
import {Paper} from './components/Paper';
import type {PartyMode} from './game/party';
import {racersOf, useParty, withGuests} from './game/party';
import {HallOfFame} from './screens/HallOfFame';
import {Home, HomeChoice} from './screens/Home';
import {HowTo} from './screens/HowTo';
import {Lobby} from './screens/Lobby';
import {Race} from './screens/Race';
import {Results} from './screens/Results';
import {Reveal} from './screens/Reveal';
import {C, H, W} from './theme';

type Screen =
  | 'home'
  | 'lobby'
  | 'reveal'
  | 'race'
  | 'results'
  | 'hof'
  | 'howto';

// Layout is authored for Vega's 960x540 dp canvas; scale if a device reports something else.
const {width: DW, height: DH} = Dimensions.get('window');
const K = Math.min(DW / W, DH / H) || 1;

export const App = () => {
  const [screen, setScreen] = useState<Screen>('home');
  const [mode, setMode] = useState<PartyMode | null>(null);
  const [racers, setRacers] = useState<Player[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [round, setRound] = useState(0);
  const [guests, setGuests] = useState<Sketchling[]>([]); // Hall of Fame "Race again" picks for the next party
  const [lastTile, setLastTile] = useState<HomeChoice>('start'); // focus returns to it on Home
  const party = useParty(mode);
  const {sendPhase} = party;
  const partyState = useMemo(
    () => withGuests(party.state, guests),
    [party.state, guests],
  );
  const liveRoom =
    mode === 'live' && party.state.conn === 'open' && !!party.state.code;

  // Reveal/Results read the newest Sketchling frames (voices arrive in a second frame after the race list is frozen)
  const sketchlings = party.state.sketchlings;
  useEffect(() => {
    Object.values(sketchlings).forEach(
      (sk) => sk.voice && Object.values(sk.voice).forEach(prefetch),
    );
  }, [sketchlings]);
  const liveRacers = useMemo(
    () =>
      racers.map((p) => ({
        ...p,
        sketchling: sketchlings[p.id] ?? p.sketchling,
      })),
    [racers, sketchlings],
  );

  const goHome = useCallback(() => {
    hush();
    if (mode) setGuests([]); // the guests raced in this party (leaving the Hall of Fame keeps them)
    setMode(null);
    setScreen('home');
  }, [mode]);
  const goLobby = useCallback(() => {
    hush();
    setScreen('lobby');
  }, []);

  // Phones follow the TV: tell them which screen we're on (server relays `phase`, see notes/tv.md).
  useEffect(() => {
    if (!liveRoom) return;
    if (screen === 'lobby') sendPhase('draw');
    if (screen === 'reveal')
      sendPhase('reveal', {order: racers.map((p) => p.id)});
    if (screen === 'race')
      sendPhase('race', {
        countdownMs: 2700,
        racers: racers.map((p) => p.id),
        round,
      });
    if (screen === 'results') {
      const data: ResultsData = {
        placements: order.map((playerId, i) => ({playerId, place: i + 1})),
      };
      sendPhase('results', {...data});
    }
  }, [screen, liveRoom, sendPhase, racers, order, round]);

  // Back: up one level; on Home let the system close the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (screen === 'home') return false;
      if (
        (screen === 'reveal' || screen === 'race' || screen === 'results') &&
        mode === 'live'
      )
        goLobby();
      else goHome();
      return true;
    });
    return () => sub.remove();
  }, [screen, mode, goHome, goLobby]);

  const choose = (c: HomeChoice) => {
    setLastTile(c);
    if (c === 'start' || c === 'demo') {
      setMode(c === 'start' ? 'live' : 'demo');
      setScreen('lobby');
    } else setScreen(c);
  };
  const start = (rs: Player[]) => {
    setRacers(rs);
    setScreen('reveal');
  };
  const toRace = useCallback(() => setScreen('race'), []);
  const finish = useCallback((o: string[]) => {
    setOrder(o);
    setScreen('results');
  }, []);
  const again = () => {
    // pick up anyone who finished a drawing meanwhile
    const now = racersOf(partyState);
    if (now.length >= racers.length) setRacers(now);
    setRound((r) => r + 1);
    setScreen('race');
  };

  let body: React.ReactNode;
  switch (screen) {
    case 'lobby':
      body = (
        <Lobby
          mode={mode ?? 'live'}
          state={partyState}
          onStart={start}
          onDemo={() => {
            setMode('demo');
          }}
        />
      );
      break;
    case 'reveal':
      body = <Reveal racers={liveRacers} onDone={toRace} />;
      break;
    case 'race':
      body = (
        <Race
          key={round}
          racers={racers}
          bots={mode === 'demo'}
          onInput={party.onInput}
          onFinish={finish}
        />
      );
      break;
    case 'results':
      body = (
        <Results
          racers={liveRacers}
          order={order}
          onAgain={again}
          onHome={goHome}
        />
      );
      break;
    case 'hof':
      body = (
        <HallOfFame
          guests={guests.map((g) => g.id)}
          onToggle={(s) =>
            setGuests((gs) =>
              gs.some((g) => g.id === s.id)
                ? gs.filter((g) => g.id !== s.id)
                : [...gs, s],
            )
          }
        />
      );
      break;
    case 'howto':
      body = <HowTo onDone={goHome} />;
      break;
    default:
      body = <Home onChoose={choose} initial={lastTile} />;
  }

  return (
    <View style={styles.root}>
      <View style={[styles.canvas, K !== 1 && {transform: [{scale: K}]}]}>
        <Paper />
        <ScreenIn key={`${screen}-${mode}-${round}`}>{body}</ScreenIn>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.paper,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  canvas: {width: W, height: H, overflow: 'hidden'},
});
