import React, {useEffect, useRef, useState} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';
import type {Sketchling} from '../../../shared/protocol';
import {PLAYER_COLORS} from '../../../shared/protocol';
import {Bubble, fitFont, MoveIdle, StatBars, Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite} from '../components/Sprite';
import {SAMPLE_SKETCHLINGS} from '../game/demo';
import {fetchHall} from '../game/party';
import {C, F} from '../theme';

type Load = {list: Sketchling[]; offline: boolean} | null;
const COLS = 3;
const ROW_H = 196; // card 172 + margin 24

/** OK on a card = "Race again": the creature joins the next party as a guest racer (OK again takes it back). */
export function HallOfFame({
  guests,
  onToggle,
}: {
  guests: string[]; // Sketchling ids picked for the next party
  onToggle: (s: Sketchling) => void;
}) {
  const [data, setData] = useState<Load>(null);
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchHall()
      .then((list) => alive && setData({list, offline: false}))
      .catch(() => alive && setData({list: SAMPLE_SKETCHLINGS, offline: true}));
    return () => {
      alive = false;
    };
  }, []);

  const list = data?.list ?? [];
  const sel = list[Math.min(focused, list.length - 1)];
  // focus-follow scroll: keep the focused row on screen with one native translateY (no ScrollView needed)
  const scroll = useRef(new Animated.Value(0)).current;
  const row = Math.floor(focused / COLS);
  useEffect(() => {
    Animated.spring(scroll, {
      toValue: -Math.max(0, row - 1) * ROW_H,
      friction: 8,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [row, scroll]);
  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Image
          source={require('../assets/art/icon_trophy.png')}
          style={styles.trophy}
        />
        <View>
          <Title size={44}>Hall of Fame</Title>
          <Text style={styles.sub}>
            {data === null
              ? 'Opening the scrapbook…'
              : data.offline
              ? 'Server offline: showing our sample Sketchlings'
              : `${list.length} Sketchling${
                  list.length === 1 ? '' : 's'
                } drawn in this house`}
          </Text>
        </View>
      </View>

      {data && list.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            No Sketchlings yet. Start a party and draw the first one!
          </Text>
        </View>
      )}

      <View style={styles.grid}>
        <Animated.View
          style={[styles.gridContent, {transform: [{translateY: scroll}]}]}>
          {list.map((s, i) => {
            const picked = guests.includes(s.id);
            return (
              <FocusButton
                key={s.id}
                label={
                  picked ? `${s.name}, racing next` : `Race again with ${s.name}`
                }
                preferred={i === 0}
                color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
                tilt={[-3, 2, -1, 3, -2, 1][i % 6]}
                onFocus={() => setFocused(i)}
                onPress={() => {
                  setFocused(i);
                  onToggle(s);
                }}
                style={styles.card}>
                <Sprite s={s} size={104} still />
                <Text style={styles.cardName} numberOfLines={1}>
                  {s.name}
                </Text>
                {picked && (
                  <View style={styles.ribbon}>
                    <Text style={styles.ribbonText}>Racing next!</Text>
                  </View>
                )}
              </FocusButton>
            );
          })}
        </Animated.View>
      </View>

      {sel && (
        <Details
          key={sel.id}
          s={sel}
          picked={guests.includes(sel.id)}
          count={guests.length}
        />
      )}
    </View>
  );
}

function Details({
  s,
  picked,
  count,
}: {
  s: Sketchling;
  picked: boolean;
  count: number;
}) {
  return (
    <View style={styles.details}>
      <View style={styles.detailSprite}>
        <MoveIdle move={s.move}>
          <Sprite s={s} size={116} />
        </MoveIdle>
      </View>
      <View style={styles.tape} />
      <Text
        style={[styles.detailName, {fontSize: fitFont(s.name, 308, 34)}]}
        numberOfLines={1}>
        {s.name}
      </Text>
      <Text style={styles.detailTitle}>{s.title}</Text>
      {s.artist ? <Text style={styles.artist}>Drawn by {s.artist}</Text> : null}
      <StatBars stats={s.stats} width={300} />
      <Bubble
        text={`“${s.catchphrase}”`}
        tail="none"
        size={20}
        style={{marginTop: 2}}
      />
      <View style={[styles.again, picked && styles.againOn]}>
        <Text style={styles.againText}>
          {picked ? '✓ In your next party' : 'OK: Race again!'}
        </Text>
      </View>
      <Text style={styles.againHint} numberOfLines={1}>
        {count
          ? `${count} picked · Back, then start a party`
          : 'Bring a champion back for one more race'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {
    position: 'absolute',
    left: 92,
    top: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trophy: {width: 70, height: 70, marginRight: 12},
  sub: {fontFamily: F.semi, fontSize: 19, color: C.inkSoft, marginTop: -8},
  grid: {
    position: 'absolute',
    left: 70,
    top: 104,
    width: 500,
    bottom: 0,
    overflow: 'hidden',
  },
  gridContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 18,
    paddingBottom: 30,
    paddingLeft: 12,
  },
  card: {width: 140, height: 172, marginRight: 18, marginBottom: 24},
  cardName: {
    fontFamily: F.bold,
    fontSize: 19,
    color: C.ink,
    marginTop: 2,
    paddingHorizontal: 6,
  },
  empty: {position: 'absolute', left: 92, top: 220, width: 480},
  emptyText: {fontFamily: F.semi, fontSize: 26, color: C.inkSoft},
  details: {
    position: 'absolute',
    right: 36,
    top: 24,
    width: 340,
    bottom: 24,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: C.ink,
    borderRadius: 24,
    padding: 16,
  },
  detailSprite: {alignItems: 'center', height: 124, justifyContent: 'center'},
  detailName: {fontFamily: F.bold, fontSize: 34, lineHeight: 42, color: C.ink},
  tape: {
    position: 'absolute',
    top: -10,
    alignSelf: 'center',
    width: 90,
    height: 24,
    backgroundColor: '#ffc531',
    opacity: 0.6,
    transform: [{rotate: '-3deg'}],
  },
  detailTitle: {fontFamily: F.semi, fontSize: 21, color: C.ink, marginTop: -4},
  artist: {fontFamily: F.semi, fontSize: 18, color: C.inkSoft, marginBottom: 6},
  ribbon: {
    position: 'absolute',
    top: 6,
    right: 4,
    backgroundColor: '#3ddc84',
    borderWidth: 2,
    borderColor: C.ink,
    borderRadius: 8,
    paddingHorizontal: 6,
    transform: [{rotate: '6deg'}],
  },
  ribbonText: {fontFamily: F.bold, fontSize: 16, lineHeight: 22, color: C.ink},
  again: {
    marginTop: 8,
    alignSelf: 'flex-start',
    backgroundColor: '#ffc531',
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  againOn: {backgroundColor: '#3ddc84'},
  againText: {fontFamily: F.bold, fontSize: 20, lineHeight: 30, color: C.ink},
  againHint: {fontFamily: F.semi, fontSize: 16, color: C.inkSoft, marginTop: 4},
});
