import 'fast-text-encoding'; // qrcode-svg needs TextEncoder on Vega (documented known issue)
import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, Easing, Image, StyleSheet, Text, View} from 'react-native';
import QRCode from '@amazon-devices/react-native-qrcode-svg';
import type {Player} from '../../../shared/protocol';
import {MAX_PLAYERS} from '../../../shared/protocol';
import {AgeBadge, Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite} from '../components/Sprite';
import type {PartyMode, PartyState, ScanStatus} from '../game/party';
import {ABILITY, ABILITY_TIP, abilityOf} from '../game/ability';
import {consent, isGuest, racersOf} from '../game/party';
import {HOST} from '../config';
import {C, F} from '../theme';

interface Props {
  mode: PartyMode;
  state: PartyState;
  onStart: (racers: Player[]) => void;
  onDemo: () => void;
  leaving?: boolean; // Back was pressed once in a live party: a second Back drops the room
}

export function Lobby({mode, state, onStart, onDemo, leaving}: Props) {
  const racers = racersOf(state);
  const ready = racers.length > 0;
  const offline = mode === 'live' && state.conn === 'offline';
  const slots = Array.from({length: MAX_PLAYERS}, (_, i) => state.players[i]);

  return (
    <View style={styles.root}>
      <Title size={44} style={styles.heading}>
        {mode === 'demo' ? 'Demo party!' : 'Join the party!'}
      </Title>

      <View style={styles.qrCard}>
        {state.joinUrl && !offline ? (
          <>
            <View style={styles.qrBox}>
              {mode === 'demo' ? (
                // no QR: a demo has nothing for a phone to join
                <View style={styles.demoNote}>
                  <Text style={styles.demoNoteText}>
                    No phones needed. In the race, the remote plays player 1.
                  </Text>
                </View>
              ) : (
                <QRCode
                  value={state.joinUrl}
                  size={176}
                  color={C.ink}
                  backgroundColor={C.white}
                  ecl="M"
                />
              )}
            </View>
            <Text style={styles.scan}>
              {mode !== 'demo'
                ? 'Scan with a phone camera'
                : ready && racers.length === state.players.length
                ? 'Everyone is ready!'
                : 'Demo players are joining…'}
            </Text>
            <Text style={styles.tip}>{ABILITY_TIP}</Text>
            <Text style={styles.codeLabel}>Room code</Text>
            <View style={styles.codeRow}>
              {(state.code ?? '').split('').map((ch, i) => (
                <View
                  key={i}
                  style={[
                    styles.codeBox,
                    {transform: [{rotate: `${i % 2 ? 3 : -3}deg`}]},
                  ]}>
                  <Text style={styles.codeChar}>{ch}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.waiting}>
            <Text style={styles.waitTitle}>
              {offline ? 'Server not found' : 'Connecting…'}
            </Text>
            <Text style={styles.waitText}>
              {!offline
                ? `Opening a room on ${HOST}`
                : state.players.length
                ? `Can't reach the party server at ${HOST}. Trying again…`
                : `Can't reach the party server at ${HOST}. Start it on your computer, or play a Demo party.`}
            </Text>
          </View>
        )}
      </View>

      <View style={styles.right}>
        <Text style={styles.playersTitle}>
          Players{' '}
          <Text style={styles.count}>
            {state.players.length}/{MAX_PLAYERS}
          </Text>
        </Text>
        {mode === 'live' && (
          <Text style={styles.ai}>
            {consent.aiPersonas
              ? 'AI personas: on'
              : 'AI personas: off.\nGrown-ups can turn them on.'}
          </Text>
        )}
        <View style={styles.grid}>
          {slots.map((p, i) => (
            <PlayerChip
              key={p?.id ?? `empty-${i}`}
              player={p}
              status={p ? state.scans[p.id] : undefined}
              racer={p && racers.find((r) => r.id === p.id)}
            />
          ))}
        </View>
        <View style={styles.actions}>
          {offline && !state.players.length && (
            // not with players: a server blip must not put focus (and the next OK) on a button that drops their room
            <FocusButton
              label="Demo party"
              color="#2bb3ff"
              preferred
              onPress={onDemo}
              style={styles.demoBtn}>
              <Text style={styles.btnText}>Demo party</Text>
            </FocusButton>
          )}
          {ready ? (
            // mounts when the first drawing is ready, so the preferred focus lands on it
            <FocusButton
              label="Start the show"
              color="#3ddc84"
              preferred={!offline}
              onPress={() => onStart(racers)}
              style={styles.startBtn}
              cardStyle={{backgroundColor: '#3ddc84'}}>
              <Text style={styles.btnText}>
                Start the show! ({racers.length})
              </Text>
            </FocusButton>
          ) : (
            // a status, not a button: dashed like the empty player slots
            <View style={[styles.startBtn, styles.chipEmpty, styles.waitPill]}>
              <Text style={styles.emptyText}>Waiting for a drawing…</Text>
            </View>
          )}
        </View>
      </View>
      {leaving && (
        <View style={styles.leave}>
          <Text style={styles.waitTitle}>Press Back again to end the party</Text>
          <Text style={styles.waitText}>
            Every phone will need to scan a new code.
          </Text>
        </View>
      )}
    </View>
  );
}

const STATUS: Record<ScanStatus | 'drawing', string> = {
  drawing: 'drawing…',
  processing: 'coming alive…',
  ready: 'ready!',
  failed: 'oops, snap again',
};

function PlayerChip({
  player,
  status,
  racer,
}: {
  player?: Player;
  status?: ScanStatus;
  racer?: Player;
}) {
  const pop = useRef(new Animated.Value(player ? 0 : 1)).current;
  const spin = useRef(new Animated.Value(0)).current;
  const spinDeg = useMemo(
    () =>
      spin.interpolate({inputRange: [0, 1], outputRange: ['0deg', '360deg']}),
    [spin],
  );
  useEffect(() => {
    if (player)
      Animated.spring(pop, {
        toValue: 1,
        friction: 4,
        tension: 120,
        useNativeDriver: true,
      }).start();
  }, [player, pop]);
  useEffect(() => {
    if (status !== 'processing') return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [status, spin]);

  if (!player) {
    return (
      <View style={[styles.chip, styles.chipEmpty]}>
        <Text style={styles.emptyText}>waiting…</Text>
      </View>
    );
  }
  const st = racer ? 'ready' : status ?? 'drawing';
  return (
    <Animated.View
      style={[
        styles.chip,
        {
          borderColor: C.ink,
          opacity: player.connected ? 1 : 0.5,
          transform: [{scale: pop}],
        },
      ]}>
      <View style={[styles.swatch, {backgroundColor: player.color}]}>
        {racer?.sketchling ? (
          <Sprite s={racer.sketchling} size={68} still />
        ) : (
          <Text style={styles.initial}>
            {player.name.slice(0, 1).toUpperCase()}
          </Text>
        )}
        {racer?.sketchling && (
          <Image
            source={ABILITY[abilityOf(racer.sketchling).kind].icon}
            style={styles.ability}
          />
        )}
      </View>
      <View style={styles.chipText}>
        <Text style={styles.name} numberOfLines={1}>
          {player.name}
        </Text>
        <View style={styles.statusRow}>
          {st === 'processing' && (
            <Animated.Text
              style={[
                styles.sparkle,
                {
                  transform: [
                    {
                      rotate: spinDeg,
                    },
                  ],
                },
              ]}>
              ✦
            </Animated.Text>
          )}
          <Text
            style={[
              styles.status,
              st === 'ready' && styles.statusReady,
              st === 'failed' && styles.statusFailed,
            ]}>
            {isGuest(player) ? 'Hall of Famer' : STATUS[st]}
          </Text>
        </View>
      </View>
      <AgeBadge age={player.ageGroup} style={styles.chipBadge} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  heading: {position: 'absolute', left: 92, top: 22},
  qrCard: {
    position: 'absolute',
    left: 92,
    top: 86,
    width: 300,
    height: 420,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: C.ink,
    borderRadius: 24,
    alignItems: 'center',
    paddingTop: 18,
    transform: [{rotate: '-2deg'}],
  },
  qrBox: {padding: 8, backgroundColor: C.white},
  demoNote: {width: 176, height: 176, justifyContent: 'center'},
  demoNoteText: {
    fontFamily: F.bold,
    fontSize: 22,
    lineHeight: 28,
    color: C.ink,
    textAlign: 'center',
  },
  scan: {fontFamily: F.semi, fontSize: 18, color: C.inkSoft, marginTop: 6},
  tip: {
    fontFamily: F.bold,
    fontSize: 16,
    lineHeight: 20,
    color: C.ink,
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 16,
  },
  codeLabel: {fontFamily: F.semi, fontSize: 18, color: C.inkSoft, marginTop: 8},
  codeRow: {flexDirection: 'row', marginTop: 2},
  codeBox: {
    width: 52,
    height: 60,
    marginHorizontal: 4,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: C.ink,
    backgroundColor: '#FFF4C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeChar: {fontFamily: F.bold, fontSize: 40, lineHeight: 50, color: C.ink},
  waiting: {flex: 1, justifyContent: 'center', paddingHorizontal: 22},
  waitTitle: {
    fontFamily: F.bold,
    fontSize: 32,
    color: C.ink,
    textAlign: 'center',
  },
  waitText: {
    fontFamily: F.semi,
    fontSize: 20,
    color: C.inkSoft,
    textAlign: 'center',
    marginTop: 10,
  },
  right: {position: 'absolute', left: 430, top: 24, right: 48, bottom: 24},
  playersTitle: {fontFamily: F.bold, fontSize: 32, color: C.ink},
  ai: {
    position: 'absolute',
    right: 0,
    top: 6,
    fontFamily: F.semi,
    fontSize: 16,
    lineHeight: 20,
    color: C.inkSoft,
    textAlign: 'right',
  },
  leave: {
    position: 'absolute',
    left: 200,
    right: 200,
    top: 180,
    padding: 20,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: '#D9363E',
    borderRadius: 24,
  },
  count: {fontFamily: F.semi, fontSize: 24, color: C.inkSoft},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  chip: {
    width: 232,
    height: 92,
    marginBottom: 18,
    borderRadius: 18,
    borderWidth: 3,
    backgroundColor: C.white,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  chipEmpty: {
    borderStyle: 'dashed',
    borderColor: '#B9C4D6',
    backgroundColor: 'rgba(255,255,255,0.5)',
    justifyContent: 'center',
  },
  emptyText: {fontFamily: F.semi, fontSize: 20, color: '#9AA6BC'},
  swatch: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 3,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {fontFamily: F.bold, fontSize: 36, lineHeight: 44, color: C.white},
  chipText: {flex: 1, marginLeft: 10},
  name: {fontFamily: F.bold, fontSize: 26, lineHeight: 32, color: C.ink},
  statusRow: {flexDirection: 'row', alignItems: 'center'},
  sparkle: {fontSize: 18, color: '#b06cff', marginRight: 4},
  status: {fontFamily: F.semi, fontSize: 18, color: C.inkSoft},
  statusReady: {color: '#1E9E57', fontFamily: F.bold},
  statusFailed: {color: '#D9363E'},
  chipBadge: {position: 'absolute', bottom: -13, right: 8},
  ability: {position: 'absolute', right: -12, bottom: -10, width: 34, height: 34},
  actions: {position: 'absolute', right: 0, bottom: 4, flexDirection: 'row'},
  startBtn: {width: 300, height: 66},
  waitPill: {borderWidth: 3, borderRadius: 22, alignItems: 'center'},
  demoBtn: {width: 190, height: 66, marginRight: 24},
  btnText: {fontFamily: F.bold, fontSize: 26, color: C.ink},
});
