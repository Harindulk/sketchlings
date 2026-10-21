import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import type {Player} from '../../../shared/protocol';
import {Bubble, Confetti, MoveIdle, Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite, spriteBox} from '../components/Sprite';
import {C, F} from '../theme';
import {narrator, say} from '../audio';

interface Props {
  racers: Player[];
  order: string[]; // player ids, winner first
  onAgain: () => void;
  onHome: () => void;
}

// podium slots: [place, centre x, block height, sprite size]
const PODIUM: [number, number, number, number][] = [
  [2, 250, 110, 120],
  [1, 420, 160, 150],
  [3, 590, 80, 110],
];
const BLOCK_W = 160;
const BLOCK_COLORS = ['', '#ffc531', '#CFE3F5', '#ff8a3d'];

export function Results({racers, order, onAgain, onHome}: Props) {
  const ranked = useMemo(
    () => order.map((id) => racers.find((p) => p.id === id)!).filter(Boolean),
    [order, racers],
  );
  const winner = ranked[0];
  const rises = useMemo(() => PODIUM.map(() => new Animated.Value(0)), []);
  const riseY = useMemo(
    () =>
      rises.map((v) =>
        v.interpolate({inputRange: [0, 1], outputRange: [160, 0]}),
      ),
    [rises],
  );
  const bubble = useRef(new Animated.Value(0)).current;
  const winLine = winner?.sketchling?.voice?.winLine;
  useEffect(() => {
    narrator('winner-is');
    const t = setTimeout(() => say(winLine), 1800);
    return () => clearTimeout(t);
  }, [winLine]);
  useEffect(() => {
    // 3rd, then 2nd, then the winner
    Animated.sequence([
      ...[2, 0, 1].map((k) =>
        Animated.spring(rises[k], {
          toValue: 1,
          friction: 5,
          tension: 80,
          useNativeDriver: true,
        }),
      ),
      Animated.spring(bubble, {
        toValue: 1,
        friction: 4,
        tension: 90,
        useNativeDriver: true,
      }),
    ]).start();
  }, [rises, bubble]);
  if (!winner?.sketchling) return null;
  const rest = ranked.slice(3);
  const floor = rest.length ? 462 : 520; // places 4-6 get a row under the podium

  return (
    <View style={styles.root}>
      <Confetti />
      <View style={styles.titleWrap}>
        <Title size={52} style={[styles.titleShadow]}>
          {winner.sketchling.name} wins!
        </Title>
        <Title size={52} color={winner.color}>
          {winner.sketchling.name} wins!
        </Title>
        <Text style={styles.sub}>
          Drawn by {winner.sketchling.artist || winner.name} ·{' '}
          {winner.sketchling.title}
        </Text>
      </View>

      {PODIUM.map(([place, cx, h, size], k) => {
        const p = ranked[place - 1];
        if (!p?.sketchling) return null;
        const v = rises[k];
        return (
          <Animated.View
            key={place}
            style={[
              styles.slot,
              {left: cx - BLOCK_W / 2, top: floor - h - size - 10},
              {
                opacity: v,
                transform: [
                  {
                    translateY: riseY[k],
                  },
                ],
              },
            ]}>
            <View
              style={{
                height: size + 10,
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}>
              <MoveIdle
                move={place === 1 ? 'hop' : p.sketchling.move}
                amp={place === 1 ? 1 : 0.6}>
                <Sprite s={p.sketchling} size={size} />
                {place === 1 && (
                  // seated on the drawing's own box and hops with it
                  <Image
                    source={require('../assets/art/crown.png')}
                    style={[
                      styles.crown,
                      {
                        left: (spriteBox(p.sketchling, size).w - 80) / 2,
                        top: -54 + spriteBox(p.sketchling, size).h * 0.08,
                      },
                    ]}
                  />
                )}
              </MoveIdle>
            </View>
            <View
              style={[
                styles.block,
                {height: h, backgroundColor: BLOCK_COLORS[place]},
              ]}>
              <Text style={styles.blockNum}>{place}</Text>
              <Text style={styles.blockName} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          </Animated.View>
        );
      })}

      {rest.length > 0 && (
        <View style={[styles.rest, {top: floor + 8}]}>
          {rest.map((p, i) => (
            <View key={p.id} style={styles.restRow}>
              <Text style={styles.restPlace}>{i + 4}</Text>
              <Sprite s={p.sketchling!} size={46} still />
              <Text style={styles.restName} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
          ))}
        </View>
      )}

      <Animated.View
        style={[
          styles.bubble,
          {opacity: bubble, transform: [{scale: bubble}]},
        ]}>
        <Bubble text={winner.sketchling.winLine} tail="left" size={24} />
      </Animated.View>

      <TVFocusGuideView autoFocus style={styles.buttons}>
        <FocusButton
          label="Play again"
          preferred
          color="#3ddc84"
          onPress={onAgain}
          style={styles.btn}
          cardStyle={{backgroundColor: '#3ddc84'}}>
          <Text style={styles.btnText}>Play again</Text>
        </FocusButton>
        <FocusButton
          label="Home"
          color="#2bb3ff"
          onPress={onHome}
          style={styles.btn}>
          <Text style={styles.btnText}>Home</Text>
        </FocusButton>
      </TVFocusGuideView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  titleWrap: {position: 'absolute', top: 18, left: 92, right: 48},
  titleShadow: {position: 'absolute', left: 3, top: 4},
  sub: {fontFamily: F.semi, fontSize: 22, color: C.inkSoft, marginTop: -6},
  slot: {position: 'absolute', width: BLOCK_W, alignItems: 'center'},
  crown: {
    position: 'absolute',
    width: 80,
    height: 62,
    transform: [{rotate: '-8deg'}],
  },
  block: {
    width: BLOCK_W,
    borderWidth: 4,
    borderColor: C.ink,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    alignItems: 'center',
  },
  blockNum: {fontFamily: F.bold, fontSize: 48, lineHeight: 58, color: C.ink},
  blockName: {
    fontFamily: F.bold,
    fontSize: 20,
    lineHeight: 24,
    color: C.ink,
    marginTop: -6,
  },
  rest: {
    position: 'absolute',
    left: 170, // under the podium blocks (170..670)
    width: 500,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  restRow: {flexDirection: 'row', alignItems: 'center', marginHorizontal: 10},
  restPlace: {fontFamily: F.bold, fontSize: 24, color: C.inkSoft, marginRight: 4},
  restName: {
    fontFamily: F.semi,
    fontSize: 20,
    color: C.ink,
    marginLeft: 6,
    maxWidth: 90,
  },
  bubble: {position: 'absolute', left: 520, top: 140, width: 260},
  buttons: {position: 'absolute', right: 48, bottom: 40, width: 190},
  btn: {width: 190, height: 62, marginTop: 18},
  btnText: {fontFamily: F.bold, fontSize: 26, color: C.ink},
});
