import React, {useEffect, useMemo, useState} from 'react';
import {Animated, Image, StyleSheet, Text, View} from 'react-native';
import {TVFocusGuideView} from '@amazon-devices/react-native-kepler';
import {useReportFullyDrawn} from '@amazon-devices/kepler-performance-api';
import {PLAYER_COLORS} from '../../../shared/protocol';
import {FocusButton} from '../components/FocusButton';
import {MoveIdle} from '../components/Bits';
import {Sprite} from '../components/Sprite';
import {SAMPLE_SKETCHLINGS} from '../game/demo';
import {C, F, W} from '../theme';

export type HomeChoice = 'start' | 'demo' | 'hof' | 'howto';

const TILES: {
  id: HomeChoice;
  label: string;
  blurb: string;
  icon: any;
  color: string;
  tilt: number;
}[] = [
  {
    id: 'start',
    label: 'Start party',
    blurb: 'Phones join with a QR code. Draw, snap, race!',
    icon: require('../assets/art/icon_phone.png'),
    color: PLAYER_COLORS[0],
    tilt: -3,
  },
  {
    id: 'demo',
    label: 'Demo party',
    blurb: 'No phones? Watch four sample Sketchlings race.',
    icon: require('../assets/art/icon_dice.png'),
    color: PLAYER_COLORS[1],
    tilt: 2,
  },
  {
    id: 'hof',
    label: 'Hall of Fame',
    blurb: 'Every Sketchling ever drawn in this house.',
    icon: require('../assets/art/icon_trophy.png'),
    color: PLAYER_COLORS[2],
    tilt: -2,
  },
  {
    id: 'howto',
    label: 'How to play',
    blurb: 'Crayons, a phone and a lot of tapping.',
    icon: require('../assets/art/icon_crayon.png'),
    color: PLAYER_COLORS[3],
    tilt: 3,
  },
];

export function Home({onChoose}: {onChoose: (c: HomeChoice) => void}) {
  const [focused, setFocused] = useState<HomeChoice>('start');
  const reportFullyDrawn = useReportFullyDrawn();
  useEffect(() => {
    // first meaningful frame is up: lets Vega measure Time To Fully Drawn
    const t = setTimeout(reportFullyDrawn, 0);
    return () => clearTimeout(t);
  }, [reportFullyDrawn]);

  return (
    <View style={styles.root}>
      <Logo />
      <Text style={styles.tagline}>Draw it. Snap it. Watch it race!</Text>

      <TVFocusGuideView autoFocus style={styles.row}>
        {TILES.map((t) => (
          <FocusButton
            key={t.id}
            label={t.label}
            testID={`tile-${t.id}`}
            preferred={t.id === 'start'}
            color={t.color}
            tilt={t.tilt}
            onFocus={() => setFocused(t.id)}
            onPress={() => onChoose(t.id)}
            style={styles.tile}>
            <View style={[styles.tape, {backgroundColor: t.color}]} />
            <Image source={t.icon} style={styles.icon} resizeMode="contain" />
            <Text style={styles.tileLabel}>{t.label}</Text>
          </FocusButton>
        ))}
      </TVFocusGuideView>

      <Text style={styles.blurb}>
        {TILES.find((t) => t.id === focused)?.blurb}
      </Text>
      <View style={styles.platform}>
        <Text style={styles.platformText}>Running on Fire TV · Vega OS</Text>
      </View>
      <Text style={styles.hint}>
        Use the arrows and OK on the remote · phones join with the QR code
      </Text>

      <View style={styles.peekLeft} pointerEvents="none">
        <MoveIdle move="walk">
          <Sprite s={SAMPLE_SKETCHLINGS[0]} size={150} />
        </MoveIdle>
      </View>
      <View style={styles.peekRight} pointerEvents="none">
        <MoveIdle move="hop">
          <Sprite s={SAMPLE_SKETCHLINGS[1]} size={130} />
        </MoveIdle>
      </View>
    </View>
  );
}

const LETTERS = 'Sketchlings'.split('');

// memo: Home re-renders on every focus change; the logo's animated nodes must not be rebuilt
const Logo = React.memo(function Logo() {
  const drops = useMemo(() => LETTERS.map(() => new Animated.Value(0)), []);
  const dropY = useMemo(
    () =>
      drops.map((v) =>
        v.interpolate({inputRange: [0, 1], outputRange: [-120, 0]}),
      ),
    [drops],
  );
  useEffect(() => {
    Animated.stagger(
      55,
      drops.map((v) =>
        Animated.spring(v, {
          toValue: 1,
          friction: 4,
          tension: 90,
          useNativeDriver: true,
        }),
      ),
    ).start();
  }, [drops]);
  return (
    <View style={styles.logo} aria-label="Sketchlings">
      {LETTERS.map((ch, i) => (
        <Animated.View
          key={i}
          style={{
            opacity: drops[i],
            transform: [
              {
                translateY: dropY[i],
              },
              {rotate: `${i % 2 ? 4 : -4}deg`},
            ],
          }}>
          <Text style={[styles.letter, styles.letterShadow]}>{ch}</Text>
          <Text
            style={[
              styles.letter,
              {color: PLAYER_COLORS[i % PLAYER_COLORS.length]},
            ]}>
            {ch}
          </Text>
        </Animated.View>
      ))}
    </View>
  );
});

const TILE_W = 178;
const styles = StyleSheet.create({
  platform: {
    position: 'absolute',
    top: 18,
    right: 48,
    borderWidth: 2,
    borderColor: C.inkSoft,
    borderRadius: 12,
    paddingHorizontal: 10,
    transform: [{rotate: '2deg'}],
  },
  platformText: {
    fontFamily: F.semi,
    fontSize: 16,
    lineHeight: 26,
    color: C.inkSoft,
  },
  root: {flex: 1, alignItems: 'center'},
  logo: {flexDirection: 'row', marginTop: 28, height: 112},
  letter: {
    fontFamily: F.bold,
    fontSize: 96,
    lineHeight: 112,
    color: C.ink,
    marginHorizontal: -1,
  },
  letterShadow: {position: 'absolute', left: 4, top: 5, color: C.ink},
  tagline: {fontFamily: F.semi, fontSize: 26, color: C.inkSoft, marginTop: -4},
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginTop: 26,
    width: W,
    height: 220,
    alignItems: 'center',
  },
  tile: {width: TILE_W, height: 196, marginHorizontal: 16},
  tape: {
    position: 'absolute',
    top: -6,
    width: 70,
    height: 22,
    opacity: 0.55,
    transform: [{rotate: '-4deg'}],
  },
  icon: {width: 104, height: 104, marginTop: 8},
  tileLabel: {fontFamily: F.bold, fontSize: 26, color: C.ink, marginTop: 6},
  blurb: {fontFamily: F.semi, fontSize: 22, color: C.ink, marginTop: 14},
  hint: {fontFamily: F.semi, fontSize: 17, color: C.inkSoft, marginTop: 6},
  peekLeft: {position: 'absolute', left: 52, bottom: -26},
  peekRight: {position: 'absolute', right: 40, bottom: -10},
});
