import React, {useEffect, useRef, useState} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';
import type {Sketchling} from '../../../shared/protocol';
import {PLAYER_COLORS} from '../../../shared/protocol';
import {Bubble, MoveIdle, StatBars, Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite} from '../components/Sprite';
import {HTTP_BASE} from '../config';
import {SAMPLE_SKETCHLINGS} from '../game/demo';
import {C, F} from '../theme';

type Load = {list: Sketchling[]; offline: boolean} | null;
const COLS = 3;
const ROW_H = 196; // card 172 + margin 24

export function HallOfFame() {
  const [data, setData] = useState<Load>(null);
  const [focused, setFocused] = useState(0);
  useEffect(() => {
    let alive = true;
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 3000);
    fetch(`${HTTP_BASE}/api/hall-of-fame`, {signal: ctrl.signal})
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(String(r.status))),
      )
      .then((list: unknown) => {
        if (!Array.isArray(list)) throw new Error('bad hall of fame');
        alive &&
          setData({
            list: list.filter((s) => s && s.id && s.spriteUrl),
            offline: false,
          });
      })
      .catch(() => alive && setData({list: SAMPLE_SKETCHLINGS, offline: true}))
      .finally(() => clearTimeout(timeout));
    return () => {
      alive = false;
      ctrl.abort();
      clearTimeout(timeout);
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
          {list.map((s, i) => (
            <FocusButton
              key={s.id}
              label={s.name}
              preferred={i === 0}
              color={PLAYER_COLORS[i % PLAYER_COLORS.length]}
              tilt={[-3, 2, -1, 3, -2, 1][i % 6]}
              onFocus={() => setFocused(i)}
              onPress={() => setFocused(i)}
              style={styles.card}>
              <Sprite s={s} size={104} still />
              <Text style={styles.cardName} numberOfLines={1}>
                {s.name}
              </Text>
            </FocusButton>
          ))}
        </Animated.View>
      </View>

      {sel && <Details key={sel.id} s={sel} />}
    </View>
  );
}

function Details({s}: {s: Sketchling}) {
  return (
    <View style={styles.details}>
      <View style={styles.detailSprite}>
        <MoveIdle move={s.move}>
          <Sprite s={s} size={150} />
        </MoveIdle>
      </View>
      <View style={styles.tape} />
      <Text style={styles.detailName} numberOfLines={1} adjustsFontSizeToFit>
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
  detailSprite: {alignItems: 'center', height: 160, justifyContent: 'center'},
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
});
