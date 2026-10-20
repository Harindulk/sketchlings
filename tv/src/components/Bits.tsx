// Small shared pieces: speech bubble, stat bars, age badge, idle motion, confetti, screen fade-in.
import React, {useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  Easing,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import type {AgeGroup, MoveStyle, Stats} from '../../../shared/protocol';
import {AGE_BOOST, PLAYER_COLORS} from '../../../shared/protocol';
import {C, F, STAT_COLORS, W} from '../theme';

export function Bubble({
  text,
  style,
  tail = 'left',
  size = 20,
}: {
  text: string;
  style?: StyleProp<ViewStyle>;
  tail?: 'left' | 'down' | 'none';
  size?: number;
}) {
  return (
    <View style={style}>
      <View style={styles.bubble}>
        <Text
          style={[styles.bubbleText, {fontSize: size, lineHeight: size * 1.3}]}>
          {text}
        </Text>
      </View>
      {tail !== 'none' && (
        <View
          style={[
            styles.tail,
            tail === 'left' ? styles.tailLeft : styles.tailDown,
          ]}
        />
      )}
    </View>
  );
}

const STAT_ROWS: [keyof Stats, string][] = [
  ['speed', 'Speed'],
  ['jump', 'Jump'],
  ['power', 'Power'],
];

/** Three crayon bars that fill one after another (native translateX inside a clipped track). */
export function StatBars({
  stats,
  delay = 0,
  width = 300,
}: {
  stats: Stats;
  delay?: number;
  width?: number;
}) {
  const vals = useMemo(() => STAT_ROWS.map(() => new Animated.Value(0)), []);
  useEffect(() => {
    Animated.stagger(
      220,
      vals.map((v) =>
        Animated.timing(v, {
          toValue: 1,
          duration: 650,
          delay,
          easing: Easing.out(Easing.back(1.6)),
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [vals, delay]);
  const trackW = width - 96;
  const fills = useMemo(
    () =>
      STAT_ROWS.map(([k], i) => {
        const fillW = (trackW * Math.max(1, Math.min(5, stats[k] || 1))) / 5;
        return {
          fillW,
          tx: vals[i].interpolate({
            inputRange: [0, 1],
            outputRange: [-fillW, 0],
          }),
        };
      }),
    [stats, trackW, vals],
  );
  return (
    <View style={{width}}>
      {STAT_ROWS.map(([k, label], i) => {
        const {fillW, tx} = fills[i];
        return (
          <View key={k} style={styles.statRow}>
            <Text style={styles.statLabel}>{label}</Text>
            <View style={[styles.track, {width: trackW}]}>
              <Animated.View
                style={[
                  styles.fill,
                  {
                    width: fillW,
                    backgroundColor: STAT_COLORS[k],
                    transform: [{translateX: tx}],
                  },
                ]}
              />
              {[1, 2, 3, 4].map((t) => (
                <View key={t} style={[styles.tick, {left: (trackW * t) / 5}]} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function AgeBadge({
  age,
  style,
}: {
  age?: AgeGroup;
  style?: StyleProp<ViewStyle>;
}) {
  const boost = Math.round(((AGE_BOOST[age ?? 'grownup'] ?? 1) - 1) * 100);
  if (boost <= 0) return null;
  return (
    <View style={[styles.badge, style]}>
      <Text style={styles.badgeText}>+{boost}% boost</Text>
    </View>
  );
}

/** Looping idle motion that matches how the Sketchling moves (native driver). */
export function MoveIdle({
  move,
  children,
  amp = 1,
}: {
  move: MoveStyle;
  children: React.ReactNode;
  amp?: number;
}) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const dur = {walk: 700, hop: 650, fly: 2000, roll: 2400}[move] ?? 800;
    const loop = Animated.loop(
      Animated.timing(t, {
        toValue: 1,
        duration: dur,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [move, t]);
  const transform = useMemo(() => {
    const steps = [0, 0.25, 0.5, 0.75, 1];
    switch (move) {
      case 'hop':
        return [
          {
            translateY: t.interpolate({
              inputRange: [0, 0.15, 0.5, 0.85, 1],
              outputRange: [0, -2, -34 * amp, -2, 0],
            }),
          },
          {
            scaleY: t.interpolate({
              inputRange: [0, 0.08, 0.16, 0.9, 1],
              outputRange: [0.86, 1.08, 1, 1.02, 0.86],
            }),
          },
        ];
      case 'fly':
        return [
          {
            translateY: t.interpolate({
              inputRange: steps,
              outputRange: [-8, -20, -8, 4, -8].map((v) => v * amp),
            }),
          },
          {
            rotate: t.interpolate({
              inputRange: steps,
              outputRange: ['-4deg', '0deg', '4deg', '0deg', '-4deg'],
            }),
          },
        ];
      case 'roll':
        return [
          {
            rotate: t.interpolate({
              inputRange: steps,
              outputRange: ['0deg', '25deg', '0deg', '-25deg', '0deg'],
            }),
          },
        ];
      default:
        return [
          {
            translateY: t.interpolate({
              inputRange: steps,
              outputRange: [0, -7 * amp, 0, -7 * amp, 0],
            }),
          },
          {
            rotate: t.interpolate({
              inputRange: steps,
              outputRange: ['-5deg', '0deg', '5deg', '0deg', '-5deg'],
            }),
          },
        ];
    }
  }, [move, amp, t]);
  return <Animated.View style={{transform}}>{children}</Animated.View>;
}

/** Paper confetti raining forever (each piece is one native loop). */
export const Confetti = React.memo(({count = 36}: {count?: number}) => {
  const pieces = useMemo(
    () =>
      Array.from({length: count}, (_, i) => ({
        x: Math.random() * W,
        delay: Math.random() * 2600,
        dur: 2600 + Math.random() * 2200,
        drift: (Math.random() - 0.5) * 120,
        spin: 360 + Math.random() * 720,
        color: PLAYER_COLORS[i % PLAYER_COLORS.length],
        w: 8 + Math.random() * 8,
        h: 12 + Math.random() * 10,
        v: new Animated.Value(0),
      })),
    [count],
  );
  useEffect(() => {
    const loops = pieces.map((p) =>
      Animated.loop(
        Animated.timing(p.v, {
          toValue: 1,
          duration: p.dur,
          delay: p.delay,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [pieces]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: p.x,
            top: -30,
            width: p.w,
            height: p.h,
            borderRadius: 2,
            backgroundColor: p.color,
            transform: [
              {
                translateY: p.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 600],
                }),
              },
              {
                translateX: p.v.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, p.drift, 0],
                }),
              },
              {
                rotate: p.v.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', `${p.spin}deg`],
                }),
              },
            ],
          }}
        />
      ))}
    </View>
  );
});

/** Every screen springs in from slightly below. */
export function ScreenIn({children}: {children: React.ReactNode}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, {
      toValue: 1,
      friction: 7,
      tension: 70,
      useNativeDriver: true,
    }).start();
  }, [v]);
  const style = useMemo(
    () => [
      StyleSheet.absoluteFill,
      {
        opacity: v,
        transform: [
          {
            translateY: v.interpolate({
              inputRange: [0, 1],
              outputRange: [24, 0],
            }),
          },
        ],
      },
    ],
    [v],
  );
  return <Animated.View style={style}>{children}</Animated.View>;
}

export const Title = ({
  children,
  size = 44,
  color = C.ink,
  style,
}: {
  children: React.ReactNode;
  size?: number;
  color?: string;
  style?: any;
}) => (
  <Text
    style={[
      {fontFamily: F.bold, fontSize: size, lineHeight: size * 1.15, color},
      style,
    ]}>
    {children}
  </Text>
);

const styles = StyleSheet.create({
  bubble: {
    backgroundColor: C.white,
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleText: {fontFamily: F.semi, color: C.ink},
  tail: {
    position: 'absolute',
    width: 22,
    height: 22,
    backgroundColor: C.white,
    borderColor: C.ink,
    transform: [{rotate: '45deg'}],
  },
  tailLeft: {left: -10, top: 22, borderLeftWidth: 3, borderBottomWidth: 3},
  tailDown: {bottom: -10, left: 40, borderRightWidth: 3, borderBottomWidth: 3},
  statRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 8},
  statLabel: {width: 90, fontFamily: F.bold, fontSize: 20, color: C.ink},
  track: {
    height: 22,
    borderRadius: 11,
    borderWidth: 3,
    borderColor: C.ink,
    backgroundColor: C.white,
    overflow: 'hidden',
  },
  fill: {position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8},
  tick: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: 'rgba(31,42,68,0.25)',
  },
  badge: {
    backgroundColor: '#3ddc84',
    borderColor: C.ink,
    borderWidth: 2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 1,
    alignSelf: 'flex-start',
  },
  badgeText: {fontFamily: F.bold, fontSize: 16, color: C.ink},
});
