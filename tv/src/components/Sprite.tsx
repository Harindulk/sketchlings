import React, {useEffect, useMemo, useRef} from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native';
import type {Sketchling} from '../../../shared/protocol';
import {spriteSource} from '../game/demo';
import {C} from '../theme';

const DEFAULT_EYES = [
  {x: 0.4, y: 0.32, r: 0.065},
  {x: 0.6, y: 0.32, r: 0.065},
];

/** Pupil offsets in -1..1 (fraction of how far a pupil can roll inside its eye). */
export interface Pupils {
  x: Animated.Value;
  y: Animated.Value;
}

interface Props {
  s: Sketchling;
  size: number; // longest side in dp
  pupils?: Pupils; // driven by the race physics; otherwise the eyes idle and look around on their own
  style?: StyleProp<ViewStyle>;
  still?: boolean; // no idle eye motion: for small thumbnails, keeps the renderer quiet
}

export const spriteBox = (s: Sketchling, size: number) => {
  const w = s.width || 1,
    h = s.height || 1;
  return w >= h ? {w: size, h: (size * h) / w} : {w: (size * w) / h, h: size};
};

/** A Sketchling drawing with living googly eyes stuck on top (where the server found its eyes). */
export const Sprite = React.memo(({s, size, pupils, style, still}: Props) => {
  const box = spriteBox(s, size);
  const eyes = s.eyes?.length ? s.eyes : DEFAULT_EYES;
  const idle = useIdlePupils(!pupils && !still);
  const p = pupils ?? idle;
  const blink = useBlink(!still);
  // a new Sketchling frame (its voice arrived) must not rebuild the eye nodes
  const eyesKey = JSON.stringify(eyes);
  const eyeViews = useMemo(
    () =>
      eyes.map((e) => {
        const r = Math.max(4, e.r * box.w * 1.18); // slightly bigger than the drawn eye so it covers it
        const pr = r * 0.5;
        const bw = Math.max(1.5, r * 0.12);
        const room = r - pr - bw;
        return {
          r,
          pr,
          bw,
          left: e.x * box.w - r,
          top: e.y * box.h - r,
          tx: Animated.multiply(p.x, room),
          ty: Animated.multiply(p.y, room),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eyesKey, box.w, box.h, p],
  );
  return (
    <View style={[{width: box.w, height: box.h}, style]}>
      <Image
        source={spriteSource(s)}
        style={{width: box.w, height: box.h}}
        resizeMode="contain"
      />
      {eyeViews.map((e, i) => (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            left: e.left,
            top: e.top,
            width: e.r * 2,
            height: e.r * 2,
            borderRadius: e.r,
            backgroundColor: C.white,
            borderWidth: e.bw,
            borderColor: C.ink,
            alignItems: 'center',
            justifyContent: 'center',
            transform: [{scaleY: blink}],
          }}>
          <Animated.View
            style={{
              width: e.pr * 2,
              height: e.pr * 2,
              borderRadius: e.pr,
              backgroundColor: C.ink,
              transform: [{translateX: e.tx}, {translateY: e.ty}],
            }}>
            <View
              style={{
                position: 'absolute',
                left: e.pr * 0.45,
                top: e.pr * 0.3,
                width: e.pr * 0.55,
                height: e.pr * 0.55,
                borderRadius: e.pr,
                backgroundColor: C.white,
              }}
            />
          </Animated.View>
        </Animated.View>
      ))}
    </View>
  );
});

/** Eyes that dart around and settle with a wobble (native driver). */
function useIdlePupils(active: boolean): Pupils {
  const v = useMemo(
    () => ({x: new Animated.Value(0.3), y: new Animated.Value(0.25)}),
    [],
  );
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let anim: Animated.CompositeAnimation | null = null;
    const next = () => {
      if (stopped) return;
      const a = Math.random() * Math.PI * 2;
      const d = 0.35 + Math.random() * 0.65;
      const spring = (val: Animated.Value, toValue: number) =>
        Animated.spring(val, {
          toValue,
          friction: 3,
          tension: 120,
          useNativeDriver: true,
        });
      anim = Animated.sequence([
        Animated.parallel([
          spring(v.x, Math.cos(a) * d),
          spring(v.y, Math.sin(a) * d * 0.8 + 0.15),
        ]),
        Animated.delay(500 + Math.random() * 1600),
      ]);
      anim.start(({finished}) => finished && next());
    };
    next();
    return () => {
      stopped = true;
      anim?.stop();
    };
  }, [active, v]);
  return v;
}

/** An occasional blink: squash the whole eye for a moment. */
function useBlink(active: boolean) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200 + Math.random() * 2600),
        Animated.timing(v, {
          toValue: 0.08,
          duration: 70,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(v, {
          toValue: 1,
          duration: 110,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, active]);
  return v;
}
