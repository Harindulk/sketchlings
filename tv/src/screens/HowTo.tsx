import React from 'react';
import {Image, StyleSheet, Text, View} from 'react-native';
import {PLAYER_COLORS} from '../../../shared/protocol';
import {Title} from '../components/Bits';
import {FocusButton} from '../components/FocusButton';
import {Sprite} from '../components/Sprite';
import {SAMPLE_SKETCHLINGS} from '../game/demo';
import {C, F} from '../theme';

const STEPS = [
  {
    title: 'Draw',
    text: 'Draw a creature on paper with a thick marker.',
    icon: require('../assets/art/icon_crayon.png'),
  },
  {
    title: 'Snap',
    text: 'Scan the QR code, then take a photo of your drawing.',
    icon: require('../assets/art/icon_phone.png'),
  },
  {
    title: 'Meet',
    text: 'Your drawing comes alive with a name and a voice.',
    sprite: true,
  },
  {
    title: 'Race',
    text: 'Tap to run, swipe up to jump, shout to ROAR!',
    icon: require('../assets/art/icon_trophy.png'),
  },
];

export function HowTo({onDone}: {onDone: () => void}) {
  return (
    <View style={styles.root}>
      <Title size={48} style={styles.title}>
        How to play
      </Title>
      <View style={styles.row}>
        {STEPS.map((s, i) => (
          <View
            key={s.title}
            style={[
              styles.card,
              {transform: [{rotate: `${i % 2 ? 2 : -2}deg`}]},
            ]}>
            <View style={[styles.num, {backgroundColor: PLAYER_COLORS[i]}]}>
              <Text style={styles.numText}>{i + 1}</Text>
            </View>
            {s.sprite ? (
              <Sprite s={SAMPLE_SKETCHLINGS[2]} size={110} />
            ) : (
              <Image source={s.icon} style={styles.icon} />
            )}
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardText}>{s.text}</Text>
          </View>
        ))}
      </View>
      <Text style={styles.fair}>
        Little kids get a speed boost, and anyone falling behind gets a Doodle
        Boost. Everyone has a chance!
      </Text>
      <FocusButton
        label="Got it"
        preferred
        color="#3ddc84"
        onPress={onDone}
        style={styles.btn}
        cardStyle={{backgroundColor: '#3ddc84'}}>
        <Text style={styles.btnText}>Got it!</Text>
      </FocusButton>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, alignItems: 'center'},
  title: {marginTop: 24},
  row: {flexDirection: 'row', marginTop: 16},
  card: {
    width: 184,
    height: 270,
    marginHorizontal: 10,
    backgroundColor: C.white,
    borderWidth: 4,
    borderColor: C.ink,
    borderRadius: 22,
    alignItems: 'center',
    padding: 12,
  },
  num: {
    position: 'absolute',
    top: -14,
    left: -10,
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  numText: {fontFamily: F.bold, fontSize: 24, lineHeight: 32, color: C.ink},
  icon: {width: 110, height: 110},
  cardTitle: {
    fontFamily: F.bold,
    fontSize: 30,
    lineHeight: 36,
    color: C.ink,
    marginTop: 4,
  },
  cardText: {
    fontFamily: F.semi,
    fontSize: 18,
    lineHeight: 22,
    color: C.ink,
    textAlign: 'center',
  },
  fair: {
    fontFamily: F.semi,
    fontSize: 20,
    color: C.inkSoft,
    marginTop: 22,
    width: 760,
    textAlign: 'center',
  },
  btn: {width: 200, height: 62, marginTop: 16},
  btnText: {fontFamily: F.bold, fontSize: 28, color: C.ink},
});
