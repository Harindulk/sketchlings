// Hold to run, for the littlest: a finger kept on the TAP pad becomes 'hold' (the TV counts it as 4 taps a second)
// until the last held finger lifts. Quick taps never reach HOLD_MS, so they work exactly as before.
export const HOLD_MS = 300;

export function holdTracker(start: () => void, stop: () => void) {
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  const held = new Set<number>();
  const up = (id: number) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    if (held.delete(id) && !held.size) stop();
  };
  return {
    down(id: number) {
      up(id);
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          held.add(id);
          if (held.size === 1) start();
        }, HOLD_MS),
      );
    },
    up,
    /** Lift every finger: the race screen is going away. */
    clear: () => [...timers.keys(), ...held].forEach(up),
  };
}
