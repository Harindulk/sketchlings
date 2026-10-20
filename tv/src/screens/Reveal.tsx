import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, StyleSheet, Text, View} from 'react-native';
import type {Player} from '../../../shared/protocol';
import {Bubble, MoveIdle, StatBars, Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite} from '../components/Sprite';
import {C, F} from '../theme';
import {narrator, say} from '../audio';

const CARD_MS = 6500;

/** One show-stopping intro per Sketchling; OK skips to the next. */
export function Reveal({
  racers,
  onDone,
}: {
  racers: Player[];
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  useEffect(() => void narrator('meet-sketchlings'), []);
  useEffect(() => {
    if (i >= racers.length) {
      onDone();
      return;
    }
    const t = setTimeout(() => setI((n) => n + 1), CARD_MS);
    return () => clearTimeout(t);
  }, [i, racers.length, onDone]);
  const p = racers[Math.min(i, racers.length - 1)];
  if (!p?.sketchling) return null;
  const last = i >= racers.length - 1;
  return (
    <View style={styles.root}>
      <Title size={30} style={styles.header}>
        Meet the Sketchlings!
      </Title>
      <View style={styles.dots}>
        {racers.map((r, k) => (
          <View
            key={r.id}
            style={[
              styles.dot,
              {backgroundColor: k <= i ? r.color : 'transparent'},
            ]}
          />
        ))}
      </View>
      <RevealCard key={p.id} p={p} />
      <FocusButton
        label={last ? 'Race' : 'Next'}
        preferred
        color={p.color}
        onPress={() => setI((n) => n + 1)}
        style={styles.next}>
        <Text style={styles.nextText}>{last ? 'Race!' : 'Next'}</Text>
      </FocusButton>
    </View>
  );
}

function RevealCard({p}: {p: Player}) {
  const s = p.sketchling!;
  const paper = useRef(new Animated.Value(0)).current;
  const tear = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(0)).current;
  const text = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.spring(paper, {
        toValue: 1,
        friction: 5,
        tension: 90,
        useNativeDriver: true,
      }),
      Animated.delay(250),
      Animated.parallel([
        Animated.timing(tear, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(pop, {
          toValue: 1,
          friction: 3.2,
          tension: 55,
          useNativeDriver: true,
        }),
        Animated.spring(text, {
          toValue: 1,
          friction: 6,
          tension: 60,
          delay: 250,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
    Animated.spring(bubble, {
      toValue: 1,
      friction: 4,
      tension: 90,
      delay: 1900,
      useNativeDriver: true,
    }).start();
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [paper, tear, pop, text, bubble, spin]);

  // the creature introduces itself as it pops out, or as soon as its voice arrives (~4 s after the drawing)
  const intro = s.voice?.intro;
  useEffect(() => {
    const t = setTimeout(() => say(intro), 900);
    return () => clearTimeout(t);
  }, [intro]);

  // built once per card (the card re-renders when the creature's voice arrives)
  const a = useMemo(() => {
    const half = (dir: -1 | 1) => ({
      opacity: tear.interpolate({
        inputRange: [0, 0.7, 1],
        outputRange: [1, 1, 0],
      }),
      transform: [
        {scale: paper.interpolate({inputRange: [0, 1], outputRange: [0.4, 1]})},
        {
          translateX: tear.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 230 * dir],
          }),
        },
        {
          translateY: tear.interpolate({
            inputRange: [0, 1],
            outputRange: [0, 60],
          }),
        },
        {
          rotate: tear.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', `${18 * dir}deg`],
          }),
        },
      ],
    });
    return {
      left: half(-1),
      right: half(1),
      burst: {
        opacity: pop.interpolate({
          inputRange: [0, 1],
          outputRange: [0, 0.9],
          extrapolate: 'clamp',
        }),
        transform: [
          {
            rotate: spin.interpolate({
              inputRange: [0, 1],
              outputRange: ['0deg', '360deg'],
            }),
          },
          {scale: pop},
        ],
      },
      sprite: {
        transform: [
          {scale: pop},
          {
            rotate: pop.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: ['-30deg', '10deg', '0deg'],
            }),
          },
        ],
      },
      info: {
        opacity: text,
        transform: [
          {
            translateX: text.interpolate({
              inputRange: [0, 1],
              outputRange: [120, 0],
            }),
          },
        ],
      },
    };
  }, [tear, paper, pop, spin, text]);

  return (
    <>
      <View style={styles.stage}>
        <Animated.Image
          source={require('../assets/art/burst.png')}
          style={[styles.burst, {tintColor: p.color}, a.burst]}
        />
        <Animated.View style={a.sprite}>
          <MoveIdle move={s.move}>
            <Sprite s={s} size={290} />
          </MoveIdle>
        </Animated.View>
        <Animated.Image
          source={require('../assets/art/tear_left.png')}
          style={[styles.paper, a.left]}
        />
        <Animated.Image
          source={require('../assets/art/tear_right.png')}
          style={[styles.paper, a.right]}
        />
      </View>

      <Animated.View style={[styles.info, a.info]}>
        <View style={[styles.artist, {backgroundColor: p.color}]}>
          <Text style={styles.artistText}>Drawn by {s.artist || p.name}</Text>
        </View>
        <View>
          <Text
            style={[styles.name, styles.nameShadow]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {s.name}
          </Text>
          <Text
            style={[styles.name, {color: p.color}]}
            numberOfLines={1}
            adjustsFontSizeToFit>
            {s.name}
          </Text>
        </View>
        <Text style={styles.title}>{s.title}</Text>
        <Text style={styles.catch}>“{s.catchphrase}”</Text>
        <StatBars stats={s.stats} delay={900} width={380} />
      </Animated.View>

      <Animated.View
        style={[
          styles.bubbleWrap,
          {opacity: bubble, transform: [{scale: bubble}]},
        ]}>
        <Bubble text={s.intro} tail="left" size={21} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1},
  header: {position: 'absolute', left: 92, top: 18},
  dots: {position: 'absolute', left: 96, top: 62, flexDirection: 'row'},
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: C.ink,
    marginRight: 8,
  },
  stage: {
    position: 'absolute',
    left: 60,
    top: 80,
    width: 420,
    height: 420,
    alignItems: 'center',
    justifyContent: 'center',
  },
  burst: {position: 'absolute', width: 520, height: 520},
  paper: {position: 'absolute', width: 300, height: 254},
  info: {position: 'absolute', left: 500, top: 30, width: 412},
  artist: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: C.ink,
    paddingHorizontal: 12,
    paddingVertical: 2,
    transform: [{rotate: '-2deg'}],
  },
  artistText: {fontFamily: F.bold, fontSize: 20, color: C.ink},
  name: {
    fontFamily: F.bold,
    fontSize: 60,
    lineHeight: 74,
    color: C.ink,
    marginTop: 2,
  },
  nameShadow: {position: 'absolute', left: 3, top: 4},
  title: {
    fontFamily: F.semi,
    fontSize: 28,
    lineHeight: 32,
    color: C.ink,
    marginTop: -6,
  },
  catch: {
    fontFamily: F.semi,
    fontSize: 20,
    color: C.inkSoft,
    marginVertical: 8,
  },
  bubbleWrap: {position: 'absolute', left: 476, top: 372, width: 330},
  next: {position: 'absolute', right: 48, bottom: 30, width: 128, height: 54},
  nextText: {fontFamily: F.bold, fontSize: 24, color: C.ink},
});
