import React, {useMemo, useRef} from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import {C} from '../theme';

interface Props {
  label: string; // aria-label: what Alexa on-screen voice navigation matches ("Alexa, select <label>")
  onPress: () => void;
  onFocus?: () => void;
  color?: string; // glow colour
  tilt?: number; // resting sticker tilt in degrees
  preferred?: boolean;
  disabled?: boolean; // not focusable (and no glow) until it can do something
  focusScale?: number;
  style?: StyleProp<ViewStyle>; // outer box (size/position)
  cardStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
  testID?: string;
}

/**
 * A sticker-style card for the D-pad: on focus it springs up (scale + lift), straightens, glows in its colour
 * and keeps a playful wobble going. All motion runs on the native driver.
 */
export function FocusButton({
  label,
  onPress,
  onFocus,
  color = '#2bb3ff',
  tilt = 0,
  preferred,
  disabled,
  focusScale = 1.1,
  style,
  cardStyle,
  children,
  testID,
}: Props) {
  const f = useRef(new Animated.Value(0)).current;
  const wob = useRef(new Animated.Value(0)).current;
  const loop = useRef<Animated.CompositeAnimation | null>(null);

  const focus = () => {
    Animated.spring(f, {
      toValue: 1,
      friction: 4,
      tension: 170,
      useNativeDriver: true,
    }).start();
    const swing = (toValue: number, duration: number) =>
      Animated.timing(wob, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      });
    loop.current = Animated.loop(
      Animated.sequence([
        swing(1, 220),
        swing(-1, 440),
        swing(0.5, 300),
        swing(0, 220),
        Animated.delay(900),
      ]),
    );
    loop.current.start();
    onFocus?.();
  };
  const blur = () => {
    loop.current?.stop();
    Animated.spring(f, {
      toValue: 0,
      friction: 6,
      tension: 140,
      useNativeDriver: true,
    }).start();
    Animated.timing(wob, {
      toValue: 0,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  // built once: re-creating Animated nodes on every parent re-render detaches them mid-animation
  const {rotate, scale, lift, glow, glowOuter} = useMemo(
    () => ({
      rotate: Animated.add(
        Animated.multiply(Animated.subtract(1, f), tilt),
        Animated.multiply(wob, 3.5),
      ).interpolate({
        inputRange: [-90, 90],
        outputRange: ['-90deg', '90deg'],
      }),
      scale: f.interpolate({inputRange: [0, 1], outputRange: [1, focusScale]}),
      lift: f.interpolate({inputRange: [0, 1], outputRange: [0, -6]}),
      glow: Animated.multiply(f, 0.45),
      glowOuter: Animated.multiply(f, 0.22),
    }),
    [f, wob, tilt, focusScale],
  );

  return (
    <Pressable
      style={style}
      onPress={onPress}
      onFocus={focus}
      onBlur={blur}
      hasTVPreferredFocus={preferred && !disabled}
      focusable={!disabled}
      disabled={disabled}
      aria-label={label}
      accessibilityRole="button"
      testID={testID}>
      <Animated.View
        style={[
          styles.fill,
          {transform: [{translateY: lift}, {scale}, {rotate}]},
        ]}>
        <Animated.View
          style={[
            styles.glow,
            styles.glowOuter,
            {backgroundColor: color, opacity: glowOuter},
          ]}
        />
        <Animated.View
          style={[styles.glow, {backgroundColor: color, opacity: glow}]}
        />
        <View style={styles.shadow} />
        <Animated.View style={[styles.card, cardStyle, {borderColor: C.ink}]}>
          {children}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const R = 22;
const styles = StyleSheet.create({
  fill: {flex: 1},
  glow: {
    position: 'absolute',
    top: -9,
    left: -9,
    right: -9,
    bottom: -9,
    borderRadius: R + 9,
  },
  glowOuter: {
    top: -18,
    left: -18,
    right: -18,
    bottom: -18,
    borderRadius: R + 18,
  },
  shadow: {
    position: 'absolute',
    top: 7,
    left: 6,
    right: -6,
    bottom: -7,
    borderRadius: R,
    backgroundColor: C.shadow,
  },
  card: {
    flex: 1,
    borderRadius: R,
    borderWidth: 4,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
