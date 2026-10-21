// "What you draw changes how you play": each Sketchling's ability comes from a feature of its drawing.
import type {MoveStyle, Sketchling} from '../../shared/protocol';
import type {Rgba} from './png';

export type Ability = Sketchling['ability'];

export const MOVES: MoveStyle[] = ['walk', 'hop', 'fly', 'roll'];

// Fixed per kind (never model-written) so the TV can rely on the exact text.
export const ABILITY_LABEL: Record<MoveStyle, string> = {
  fly: 'Flies over ink blots!',
  roll: 'Zooms fast on flat ground!',
  hop: 'Jumps extra high and far!',
  walk: 'ROAR knocks back ink blots!',
};

// Used offline, and when the model's feature text is unusable. Names only what the silhouette proves
// (a star's points also read as `fly`, so no "wings").
export const GENERIC_FEATURE: Record<MoveStyle, string> = {
  fly: 'wide stretchy shape',
  roll: 'round shape',
  hop: 'long legs',
  walk: 'big strong body',
};

export const abilityFor = (kind: MoveStyle, feature: string = GENERIC_FEATURE[kind]): Ability => ({kind, feature, label: ABILITY_LABEL[kind]});

/** Older hall-of-fame entries were saved before abilities existed. */
export function withAbility(s: Sketchling): Sketchling {
  if (s.ability && MOVES.includes(s.ability.kind)) return s;
  return {...s, ability: abilityFor(MOVES.includes(s.move) ? s.move : 'walk')};
}

/**
 * Deterministic guess of the move from the cut-out silhouette (alpha):
 * tall with thin separate lower protrusions (legs) -> hop; wide with a few rows sticking far out sideways
 * (wings/arms) -> fly; near-circular -> roll; anything else -> walk.
 */
export function shapeKind(img: Rgba | null): MoveStyle {
  if (!img) return 'walk';
  const {width: W, height: H, data} = img;
  const solid = (x: number, y: number) => data[(y * W + x) * 4 + 3]! >= 128;
  let x0 = W, x1 = -1, y0 = H, y1 = -1, area = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!solid(x, y)) continue;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return 'walk';
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
  if (bw < 8 || bh < 8) return 'walk';
  const count = new Float64Array(bh); // solid pixels per row
  const runs = new Float64Array(bh); // separate solid runs per row
  for (let y = y0; y <= y1; y++) {
    let inRun = false;
    for (let x = x0; x <= x1; x++) {
      const s = solid(x, y);
      if (s) count[y - y0]!++;
      if (s && !inRun) runs[y - y0]!++;
      inRun = s;
    }
  }
  const band = (arr: Float64Array, a: number, b: number) => {
    const from = Math.floor(a * bh), to = Math.max(from + 1, Math.ceil(b * bh));
    let sum = 0;
    for (let i = from; i < to; i++) sum += arr[i]!;
    return sum / (to - from);
  };
  const aspect = bh / bw;
  const fill = area / (bw * bh);

  if (aspect >= 1.15 && band(runs, 0.8, 1) >= 1.6 && band(count, 0.8, 1) < 0.6 * band(count, 0.3, 0.7)) return 'hop';

  const sorted = [...count].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1]! / bw;
  let widest = 0;
  for (let i = 1; i < bh; i++) if (count[i]! > count[widest]!) widest = i;
  if (aspect <= 0.9 && count[widest]! / bw >= 0.85 && median <= 0.55 && widest < 0.75 * bh) return 'fly';

  if (aspect >= 0.8 && aspect <= 1.25 && fill >= 0.7 && fill <= 0.86 && band(runs, 0, 1) <= 1.15) return 'roll';
  return 'walk';
}
