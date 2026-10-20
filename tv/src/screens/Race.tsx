import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, Image, StyleSheet, Text, View} from 'react-native';
import {useTVEventHandler} from '@amazon-devices/react-native-kepler';
import type {Player} from '../../../shared/protocol';
import {AgeBadge, Bubble} from '../components/Bits';
import {Sprite, spriteBox} from '../components/Sprite';
import type {InputListener} from '../game/party';
import {
  createRace,
  input,
  jumpHeight,
  jumpY,
  placements,
  Race as RaceSim,
  step,
  TRACK,
} from '../game/race';
import {C, F, W} from '../theme';
import {audioStatus, hush} from '../audio';

interface Props {
  racers: Player[];
  bots: boolean; // demo party: everyone is a bot (the remote can take over player 1)
  onInput: (l: InputListener) => () => void;
  onFinish: (placements: string[]) => void;
}

const TOP = 72;
const BOTTOM = 526;
const START_X = 250; // screen x of the start line when the camera is at 0
const LEADER_AT = 640; // camera keeps the leader around here
const FINISH_REST = 770; // ...and stops when the finish line reaches this screen x
const TRAIL_MIN = 250; // keep the last runner right of this screen x if possible
const LEADER_MAX = W - 80; // but never lose the leader off the right edge
const TILE = W; // doodle + lane tiles are 960 dp wide

// googly-eye physics (normalised pupil units)
const EYE_K = 70,
  EYE_DAMP = 7,
  EYE_GRAV = 26,
  EYE_GAIN = 0.012;

interface Viz {
  x: Animated.Value;
  y: Animated.Value;
  rot: Animated.Value;
  shadow: Animated.Value;
  px: Animated.Value;
  py: Animated.Value;
  boost: Animated.Value;
  stun: Animated.Value;
  roar: Animated.Value;
}

// eslint-disable-next-line no-undef
const perf = (globalThis as {performance?: {now(): number}}).performance;
const nowMs = () => (perf ? perf.now() : Date.now());

/** Values the game loop writes every frame. Native from birth, so setValue goes straight to the native animated
 *  graph (no React render, no JS style diffing) and no attach animations or completion callbacks are needed. */
const nativeValue = (v: number) => new Animated.Value(v, {useNativeDriver: true});

export function Race({racers, bots, onInput, onFinish}: Props) {
  const n = racers.length;
  const laneH = (BOTTOM - TOP) / n;
  const size = Math.min(laneH * 0.66, 100); // leaves headroom so a jump stays inside its own lane band
  const race = useRef<RaceSim>(
    createRace(
      racers.map((p) => ({
        id: p.id,
        stats: p.sketchling!.stats,
        ageGroup: p.ageGroup,
        bot: bots,
      })),
    ),
  ).current;
  const viz = useMemo<Viz[]>(
    () =>
      racers.map(() => ({
        x: nativeValue(START_X),
        y: nativeValue(0),
        rot: nativeValue(0),
        shadow: nativeValue(1),
        px: nativeValue(0),
        py: nativeValue(0.3),
        boost: nativeValue(0),
        stun: nativeValue(0),
        roar: nativeValue(0),
      })),
    [racers],
  );
  const cam = useRef(nativeValue(0)).current;
  const shake = useRef(nativeValue(0)).current;
  const [count, setCount] = useState<number | 'GO!' | null>(3);
  const [places, setPlaces] = useState<Record<string, number>>({});
  const [over, setOver] = useState(false);
  const [showFps, setShowFps] = useState(false);
  const running = useRef(false);
  const remoteAt = useRef(-99);
  const placesRef = useRef<Record<string, number>>({});

  // phones -> sim (no React state involved)
  useEffect(
    () =>
      onInput((id, kind, at, recv) => {
        if (!running.current) return;
        input(race, id, kind);
        if (at && recv) lat.add(recv - at, recv);
      }),
    [onInput, race],
  );

  // demo party: the remote can play for player 1 (OK = run, Up = jump, Play/Pause = ROAR)
  useTVEventHandler((e) => {
    if (e.eventType === 'menu' && e.eventKeyAction === 0)
      setShowFps((f) => !f); // Menu: perf overlay
    if (!bots || !running.current || e.eventKeyAction !== 0) return;
    const kind =
      e.eventType === 'select'
        ? 'tap'
        : e.eventType === 'up'
        ? 'jump'
        : e.eventType === 'playpause' || e.eventType === 'play' // the VVD's KEY_PLAYPAUSE arrives as 'play'
        ? 'shout'
        : null;
    if (!kind) return;
    remoteAt.current = race.t;
    input(race, racers[0].id, kind);
  });

  // the game loop
  useEffect(() => {
    let alive = true;
    hush(); // the race is silent: drop a Reveal line still queued (one already playing ends on its own)
    const eyes = racers.map(() => ({
      ox: 0,
      oy: 0.3,
      vx: 0,
      vy: 0,
      bx: 0,
      by: 0,
      bvx: 0,
      bvy: 0,
    }));
    const flags = racers.map(() => ({boost: false, stun: false, roar: false}));
    let camX = 0;
    lat.raw.length = lat.apply.length = lat.pending.length = 0; // stats are per race
    // headroom above each sprite inside its lane band: jumps, hops and flying are clamped to it
    const rooms = racers.map((p) =>
      Math.max(8, laneH - 16 - spriteBox(p.sketchling!, size).h),
    );
    let last = 0;
    let clock = 0;
    let overAt = 0; // results follow 2.2 s after the finish, timed by the frame loop
    const pulse = (v: Animated.Value, on: boolean) =>
      Animated.timing(v, {
        toValue: on ? 1 : 0,
        duration: 160,
        useNativeDriver: true,
      }).start();

    let frames = 0;
    let dbgAt = nowMs();
    let dbgFrames = 0;
    let work = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Exactly one JS task per frame. Vega's JS-thread watchdog sends IPC messages for every JS task, and a
    // backlog of them deadlocks the JS thread (notes/tv.md F4), so: no requestAnimationFrame (it free-runs
    // at ~7.6 kHz on the headless VVD anyway), no extra setTimeout(0) yields, no side timers.
    const tick = () => {
      if (!alive) return;
      const now = nowMs();
      frame(now);
      const spent = nowMs() - now;
      work += spent;
      timer = setTimeout(tick, Math.max(1, 16 - spent));
    };
    // 3-2-1-GO runs off the frame clock
    let startedAt = 0;
    let goFired = false;
    let shownCount: number | 'GO!' | null | undefined;
    const countdown = (now: number) => {
      if (!startedAt) startedAt = now;
      const e = now - startedAt;
      const c =
        e < 900 ? 3 : e < 1800 ? 2 : e < 2700 ? 1 : e < 3600 ? 'GO!' : null;
      // by elapsed time, not by the 'GO!' transition: sparse frames can skip the GO window entirely
      if (!goFired && e >= 2700) {
        goFired = true;
        running.current = true;
      }
      if (c === shownCount) return;
      shownCount = c;
      setCount(c); // no narration: the race is silent (audio work on the VVD slowed JS, notes/tv.md F7)
    };
    // only cross to native when a value really moved (idle runners, countdown, finished racers cost nothing)
    const sent = new Map<Animated.Value, number>();
    const put = (v: Animated.Value, x: number) => {
      const prev = sent.get(v);
      if (prev === undefined || Math.abs(prev - x) > 0.01) {
        sent.set(v, x);
        v.setValue(x);
      }
    };
    const frame = (now: number) => {
      frames++;
      if (now - dbgAt > 1000) {
        dbg.fps = Math.round(((frames - dbgFrames) * 1000) / (now - dbgAt));
        dbg.ms = Math.round((work / Math.max(1, frames - dbgFrames)) * 10) / 10;
        work = 0;
        dbgAt = now;
        dbgFrames = frames;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      clock += dt;
      countdown(now);
      if (overAt && now - overAt > 2200) {
        overAt = 0;
        onFinish(placements(race));
      }
      if (running.current) {
        if (bots) race.runners[0].bot = race.t - remoteAt.current > 2.5;
        step(race, dt);
        lat.applied(Date.now());
      }
      const xs = race.runners.map((r) => r.x);
      const leader = Math.max(...xs);
      // follow the leader, but pull back so the last runner stays clear of the name tags when we can
      let target = Math.max(leader + START_X - LEADER_AT, 0);
      target = Math.min(target, Math.min(...xs) + START_X - TRAIL_MIN);
      target = Math.max(target, leader + START_X - LEADER_MAX);
      target = Math.min(Math.max(0, target), TRACK + START_X - FINISH_REST);
      camX += (target - camX) * Math.min(1, dt * 4);
      put(cam, camX);

      race.runners.forEach((r, i) => {
        const v = viz[i];
        const s = racers[i].sketchling!;
        const sx = Math.max(54, START_X + r.x - camX);
        let bob = 0,
          rot = 0;
        switch (s.move) {
          case 'hop': {
            const p = (r.x % 130) / 130;
            bob = -4 * 30 * p * (1 - p);
            rot = (0.5 - p) * 12;
            break;
          }
          case 'fly':
            bob = -12 + Math.sin(clock * 3.2 + i) * 6;
            rot = Math.sin(clock * 3.2 + i + 1) * 6;
            break;
          case 'roll':
            rot = ((r.x / (size * 0.45)) * 57.3) % 360;
            break;
          default: {
            const ph = r.x / 34;
            bob = -Math.abs(Math.sin(ph)) * 8;
            rot = Math.sin(ph) * 8;
          }
        }
        if (r.stunT > 0) rot += Math.sin(clock * 28) * 12;
        const room = rooms[i];
        const jy = jumpY(r) * Math.min(1, room / jumpHeight(r));
        const y = Math.max(bob * Math.min(1, room / 30) - jy, -room);
        put(v.x, sx);
        put(v.y, y);
        put(v.rot, rot);
        put(v.shadow, Math.max(0.45, 1 - (0.55 * jy) / room));

        // googly pupils: pushed by the body's acceleration, pulled down by gravity, held by a spring
        const e = eyes[i];
        const bvx = (r.x - e.bx) / dt,
          bvy = (y - e.by) / dt;
        const ax = Math.max(-4000, Math.min(4000, (bvx - e.bvx) / dt));
        const ay = Math.max(-4000, Math.min(4000, (bvy - e.bvy) / dt));
        e.bx = r.x;
        e.by = y;
        e.bvx = bvx;
        e.bvy = bvy;
        e.vx += (-ax * EYE_GAIN - EYE_K * e.ox - EYE_DAMP * e.vx) * dt;
        e.vy +=
          (-ay * EYE_GAIN + EYE_GRAV - EYE_K * e.oy - EYE_DAMP * e.vy) * dt;
        e.ox += e.vx * dt;
        e.oy += e.vy * dt;
        const d = Math.hypot(e.ox, e.oy);
        if (d > 1) {
          e.ox /= d;
          e.oy /= d;
          e.vx *= -0.4;
          e.vy *= -0.4;
        }
        put(v.px, e.ox);
        put(v.py, e.oy);

        const f = flags[i];
        const boosting = r.boost > 1.12;
        if (boosting !== f.boost) pulse(v.boost, (f.boost = boosting));
        const stunned = r.stunT > 0;
        if (stunned !== f.stun) pulse(v.stun, (f.stun = stunned));
        const roaring = r.roarT > 0;
        if (roaring && !f.roar) {
          v.roar.setValue(0);
          Animated.sequence([
            Animated.spring(v.roar, {
              toValue: 1,
              friction: 3,
              tension: 160,
              useNativeDriver: true,
            }),
            Animated.delay(600),
            Animated.timing(v.roar, {
              toValue: 0,
              duration: 250,
              useNativeDriver: true,
            }),
          ]).start();
          Animated.sequence(
            [10, -9, 7, -5, 3, 0].map((toValue) =>
              Animated.timing(shake, {
                toValue,
                duration: 45,
                useNativeDriver: true,
              }),
            ),
          ).start();
        }
        f.roar = roaring;
      });

      if (race.finishOrder.length !== Object.keys(placesRef.current).length) {
        const next: Record<string, number> = {};
        race.finishOrder.forEach((id, k) => (next[id] = k + 1));
        placesRef.current = next;
        setPlaces(next);
      }
      if (race.over && running.current) {
        running.current = false;
        setOver(true); // the winner's catchphrase is a caption here; Results plays its voice
        overAt = now;
      }
    };
    timer = setTimeout(tick, 0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
    // the loop owns its own state; it runs once per mounted race
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Animated graphs are built once: re-creating nodes on a re-render while the loop setValue()s their parent
  // froze the JS thread on the VVD ("updateNodeIfNecessary called for released parent").
  const layers = useMemo(() => {
    const scroll = (factor: number) => ({
      transform: [
        {
          translateX: Animated.multiply(
            Animated.modulo(Animated.multiply(cam, factor), TILE),
            -1,
          ),
        },
      ],
    });
    return {
      doodles: scroll(0.35),
      lane: scroll(1),
      world: {transform: [{translateX: Animated.multiply(cam, -1)}]},
    };
  }, [cam]);

  return (
    <View style={styles.root}>
      <Animated.View
        style={[StyleSheet.absoluteFill, {transform: [{translateX: shake}]}]}>
        <Animated.View style={[styles.tileRow, layers.doodles]}>
          <Image
            source={require('../assets/art/doodles.png')}
            style={styles.doodles}
          />
          <Image
            source={require('../assets/art/doodles.png')}
            style={styles.doodles}
          />
        </Animated.View>

        {racers.map((p, i) => {
          const top = TOP + i * laneH;
          return (
            <View key={p.id} style={[styles.lane, {top, height: laneH}]}>
              <View
                style={[
                  StyleSheet.absoluteFill,
                  {backgroundColor: p.color, opacity: i % 2 ? 0.07 : 0.12},
                ]}
              />
              <Animated.View
                style={[styles.tileRow, {top: laneH - 30}, layers.lane]}>
                <Image
                  source={require('../assets/art/lane.png')}
                  style={styles.laneImg}
                />
                <Image
                  source={require('../assets/art/lane.png')}
                  style={styles.laneImg}
                />
              </Animated.View>
            </View>
          );
        })}

        {/* world layer: start line, ink blots, finish banner (one native translate for all of them) */}
        <Animated.View style={[StyleSheet.absoluteFill, layers.world]}>
          <View
            style={[
              styles.startLine,
              {left: START_X - 3, top: TOP, height: BOTTOM - TOP},
            ]}
          />
          {race.blots.map((xs, lane) =>
            xs.map((bx) => {
              const b = Math.min(64, laneH * 0.55);
              return (
                <Image
                  key={`${lane}-${bx}`}
                  source={require('../assets/art/blot.png')}
                  style={{
                    position: 'absolute',
                    left: START_X + bx - b / 2,
                    top: TOP + (lane + 1) * laneH - b - 6,
                    width: b,
                    height: b,
                  }}
                />
              );
            }),
          )}
          <Image
            source={require('../assets/art/finish.png')}
            style={[styles.finish, {left: START_X + TRACK - 26}]}
          />
        </Animated.View>

        {racers.map((p, i) => (
          <View
            key={p.id}
            style={[styles.tag, {top: TOP + i * laneH + 4}]}
            pointerEvents="none">
            <View style={[styles.tagPill, {backgroundColor: p.color}]}>
              <Text style={styles.tagText} numberOfLines={1}>
                {p.name}
              </Text>
            </View>
            <AgeBadge age={p.ageGroup} style={styles.tagBadge} />
          </View>
        ))}

        {racers.map((p, i) => (
          <RunnerView
            key={p.id}
            p={p}
            v={viz[i]}
            top={TOP + i * laneH}
            laneH={laneH}
            size={size}
            place={places[p.id]}
          />
        ))}
      </Animated.View>

      <View style={styles.hud}>
        <Timer
          race={race}
          showFps={showFps}
          hint={
            bots
              ? 'Remote: OK run · Up jump · Play ROAR'
              : 'Tap to run · Swipe up to jump · Shout to ROAR!'
          }
        />
      </View>

      {count !== null && (
        <View style={styles.countTitleWrap} pointerEvents="none">
          <Text style={styles.countTitle}>Doodle Dash!</Text>
        </View>
      )}
      {count !== null && <Countdown key={String(count)} value={count} />}
      {over && (
        <FinishBanner
          winner={racers.find((p) => p.id === placements(race)[0])}
        />
      )}
    </View>
  );
}

const dbg = {fps: 0, ms: 0}; // game-loop frame rate + JS work per frame, shown with the Menu key

// Phone -> TV input latency. `at` is the phone's clock, so raw = recv - at includes the clock offset: it is
// absolute only when clocks agree (simulated phones on the same Mac; NTP-synced phones are usually within
// tens of ms). min(raw) estimates offset + best-case path, so p50 - min is the queueing/jitter part.
// "apply" = WebSocket receive -> the game-loop frame that applied the input (TV-side, same clock).
const median = (a: number[]) =>
  a.length ? [...a].sort((x, y) => x - y)[a.length >> 1] : 0;
const lat = {
  raw: [] as number[],
  apply: [] as number[],
  pending: [] as number[],
  add(raw: number, recv: number) {
    this.raw.push(raw);
    this.pending.push(recv);
    if (this.raw.length > 300) this.raw.shift();
  },
  applied(now: number) {
    for (const r of this.pending) this.apply.push(now - r);
    this.pending.length = 0;
    if (this.apply.length > 300) this.apply.splice(0, this.apply.length - 300);
  },
  summary() {
    if (!this.raw.length) return 'n/a';
    const p50 = median(this.raw);
    const best = Math.min(...this.raw);
    // phone->TV above the best observed delivery (clock offset cancels out), and receive->applied on the TV
    return `+${Math.round(p50 - best)}ms jitter, apply ${Math.round(
      median(this.apply),
    )}ms (n=${this.raw.length})`;
  },
};
const PLACE = ['', '1st!', '2nd!', '3rd!', '4th', '5th', '6th'];

const RunnerView = React.memo(
  ({
    p,
    v,
    top,
    laneH,
    size,
    place,
  }: {
    p: Player;
    v: Viz;
    top: number;
    laneH: number;
    size: number;
    place?: number;
  }) => {
    const s = p.sketchling!;
    const box = spriteBox(s, size);
    const ground = top + laneH - 12;
    const spin = useRef(new Animated.Value(0)).current;
    useEffect(() => {
      const loop = Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: 700,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      );
      loop.start();
      return () => loop.stop();
    }, [spin]);
    const anim = useMemo(
      () => ({
        rot: v.rot.interpolate({
          inputRange: [-360, 360],
          outputRange: ['-360deg', '360deg'],
        }),
        spin: spin.interpolate({
          inputRange: [0, 1],
          outputRange: ['0deg', '360deg'],
        }),
        pupils: {x: v.px, y: v.py},
      }),
      [v, spin],
    );
    return (
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -box.w / 2,
          top: ground - box.h,
          width: box.w,
          height: box.h,
          transform: [{translateX: v.x}],
        }}>
        <Animated.View
          style={[
            styles.shadow,
            {
              left: box.w * 0.15,
              top: box.h - 9,
              width: box.w * 0.7,
              transform: [{scaleX: v.shadow}, {scaleY: v.shadow}],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.boost,
            {right: box.w * 0.62, top: box.h * 0.3, opacity: v.boost},
          ]}>
          {[0, 1, 2].map((k) => (
            <View
              key={k}
              style={[
                styles.speedLine,
                {
                  width: 34 - k * 6,
                  backgroundColor: p.color,
                  marginLeft: k * 8,
                },
              ]}
            />
          ))}
        </Animated.View>
        <Animated.Text
          style={[
            styles.boostText,
            {opacity: v.boost, right: box.w * 0.62, top: box.h * 0.74},
          ]}>
          Doodle Boost!
        </Animated.Text>
        <Animated.View
          style={{
            transform: [{translateY: v.y}, {rotate: anim.rot}],
          }}>
          <View
            style={[
              styles.ring,
              {
                borderColor: p.color,
                backgroundColor: p.color + '33',
                width: Math.max(box.w, box.h) * 1.08,
                height: Math.max(box.w, box.h) * 1.08,
                borderRadius: Math.max(box.w, box.h),
                left: (box.w - Math.max(box.w, box.h) * 1.08) / 2,
                top: (box.h - Math.max(box.w, box.h) * 1.08) / 2,
              },
            ]}
          />
          <Sprite s={s} size={size} pupils={anim.pupils} />
        </Animated.View>
        <Animated.View
          style={[
            styles.dizzy,
            {
              left: box.w / 2 - 26,
              opacity: v.stun,
              transform: [{rotate: anim.spin}],
            },
          ]}>
          {[0, 1, 2].map((k) => (
            <View
              key={k}
              style={[
                styles.star,
                {transform: [{rotate: `${k * 120}deg`}, {translateX: 20}]},
              ]}
            />
          ))}
        </Animated.View>
        <Animated.View
          style={[
            styles.roar,
            {
              left: box.w * 0.62, // beside the head, so the top lane's pill isn't hidden under the HUD
              top: box.h * 0.05,
              backgroundColor: p.color,
              opacity: v.roar,
              transform: [{scale: v.roar}, {rotate: '-8deg'}],
            },
          ]}>
          <Text style={styles.roarText}>ROAR!</Text>
        </Animated.View>
        {place ? <Medal place={place} color={p.color} /> : null}
      </Animated.View>
    );
  },
);

function Medal({place, color}: {place: number; color: string}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, {
      toValue: 1,
      friction: 3.5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        styles.medal,
        {
          backgroundColor: place === 1 ? '#ffc531' : color,
          transform: [{scale: v}],
        },
      ]}>
      <Text style={styles.medalText}>{PLACE[place] ?? `${place}th`}</Text>
    </Animated.View>
  );
}

function Timer({
  race,
  showFps,
  hint,
}: {
  race: RaceSim;
  showFps: boolean;
  hint: string;
}) {
  const [secs, setSecs] = useState(0);
  const shown = useRef(0);
  useEffect(() => {
    const t = setInterval(() => {
      const n = Math.floor(race.t);
      if (n !== shown.current || showFps)
        setSecs((shown.current = n));
    }, 250);
    return () => clearInterval(t);
  }, [race, showFps]);
  const l = lat.summary();
  return (
    <>
      <View style={styles.timer}>
        <Text style={styles.timerText}>
          {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
        </Text>
      </View>
      <Text
        style={showFps ? styles.hudStats : styles.hudHint}
        numberOfLines={2}>
        {showFps
          ? `${dbg.fps}fps ${
              dbg.ms
            }ms/f · input ${l}\naudio ${
              audioStatus.mode
            } ${audioStatus.state} · voices ${audioStatus.voices} of ${
              audioStatus.ended
            } clips`
          : hint}
      </Text>
    </>
  );
}

function Countdown({value}: {value: number | 'GO!'}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.sequence([
      Animated.spring(v, {
        toValue: 1,
        friction: 4,
        tension: 140,
        useNativeDriver: true,
      }),
      Animated.timing(v, {
        toValue: 1.6,
        duration: 260,
        delay: 380,
        useNativeDriver: true,
      }),
    ]).start();
  }, [v]);
  const color =
    value === 'GO!'
      ? '#3ddc84'
      : ['#ff5a5f', '#ffc531', '#2bb3ff'][3 - (value as number)];
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View
        style={[
          styles.count,
          {
            backgroundColor: color,
            opacity: v.interpolate({
              inputRange: [0, 1, 1.6],
              outputRange: [0, 1, 0],
            }),
            transform: [
              {scale: v},
              {
                rotate: v.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-20deg', '0deg'],
                }),
              },
            ],
          },
        ]}>
        <Text style={[styles.countText, value === 'GO!' && {fontSize: 92}]}>
          {value}
        </Text>
      </Animated.View>
    </View>
  );
}

function FinishBanner({winner}: {winner?: Player}) {
  const v = useRef(new Animated.Value(0)).current;
  const transform = useMemo(() => [{scale: v}, {rotate: '-4deg'}], [v]);
  useEffect(() => {
    Animated.spring(v, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }, [v]);
  const s = winner?.sketchling;
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.View style={[styles.banner, {transform}]}>
        <Text style={styles.bannerText}>FINISH!</Text>
      </Animated.View>
      {s ? (
        <Bubble
          text={`${s.name}: “${s.catchphrase}”`}
          tail="none"
          size={26}
          style={styles.finishCaption}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {flex: 1, overflow: 'hidden'},
  tileRow: {
    position: 'absolute',
    left: 0,
    top: 0,
    flexDirection: 'row',
    width: TILE * 2,
  },
  doodles: {width: TILE, height: 540},
  lane: {position: 'absolute', left: 0, right: 0, overflow: 'hidden'},
  laneImg: {width: TILE, height: 20},
  startLine: {
    position: 'absolute',
    width: 6,
    backgroundColor: C.ink,
    opacity: 0.25,
    borderRadius: 3,
  },
  finish: {
    position: 'absolute',
    top: TOP - 40,
    width: 52,
    height: BOTTOM - TOP + 40,
  },
  shadow: {
    position: 'absolute',
    height: 14,
    borderRadius: 7,
    backgroundColor: C.shadow,
  },
  boost: {position: 'absolute'},
  speedLine: {
    height: 7,
    borderRadius: 4,
    marginBottom: 7,
    borderWidth: 2,
    borderColor: C.ink,
  },
  boostText: {
    position: 'absolute',
    width: 130,
    textAlign: 'right',
    fontFamily: F.bold,
    fontSize: 17,
    color: '#1E9E57',
  },
  dizzy: {
    position: 'absolute',
    top: -14,
    width: 52,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  star: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: '#ffc531',
    borderWidth: 2,
    borderColor: C.ink,
  },
  roar: {
    position: 'absolute',
    width: 120,
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 3,
    borderColor: C.ink,
  },
  roarText: {fontFamily: F.bold, fontSize: 30, lineHeight: 38, color: C.ink},
  medal: {
    position: 'absolute',
    top: -16,
    right: -26,
    borderRadius: 16,
    borderWidth: 3,
    borderColor: C.ink,
    paddingHorizontal: 9,
  },
  medalText: {fontFamily: F.bold, fontSize: 22, lineHeight: 30, color: C.ink},
  tag: {
    position: 'absolute',
    left: 48,
    flexDirection: 'row',
    alignItems: 'center',
  },
  tagPill: {
    borderRadius: 12,
    borderWidth: 3,
    borderColor: C.ink,
    paddingHorizontal: 10,
    maxWidth: 130,
  },
  tagText: {fontFamily: F.bold, fontSize: 18, lineHeight: 26, color: C.ink},
  tagBadge: {marginLeft: 6, alignSelf: 'center'},
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 48,
    backgroundColor: 'rgba(251,247,238,0.92)',
    borderBottomWidth: 3,
    borderColor: C.ink,
  },
  hudHint: {
    flex: 1,
    fontFamily: F.bold,
    fontSize: 30,
    lineHeight: 40,
    color: C.ink,
    textAlign: 'right',
    marginLeft: 20,
  },
  hudStats: {
    flex: 1,
    fontFamily: F.semi,
    fontSize: 16,
    lineHeight: 22,
    color: C.ink,
    textAlign: 'right',
    marginLeft: 16,
  },
  countTitleWrap: {
    position: 'absolute',
    top: 90,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  countTitle: {fontFamily: F.bold, fontSize: 56, lineHeight: 66, color: C.ink},
  finishCaption: {marginTop: 18, maxWidth: 640},
  ring: {position: 'absolute', borderWidth: 4},
  timer: {
    backgroundColor: C.white,
    borderWidth: 3,
    borderColor: C.ink,
    borderRadius: 16,
    paddingHorizontal: 16,
  },
  timerText: {fontFamily: F.bold, fontSize: 30, lineHeight: 40, color: C.ink},
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 6,
    borderColor: C.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {fontFamily: F.bold, fontSize: 120, lineHeight: 150, color: C.ink},
  banner: {
    backgroundColor: '#ffc531',
    borderWidth: 6,
    borderColor: C.ink,
    borderRadius: 30,
    paddingHorizontal: 40,
  },
  bannerText: {fontFamily: F.bold, fontSize: 96, lineHeight: 124, color: C.ink},
});
