// "What you draw changes how you play": how each ability looks on the TV. The rules live in race.ts.
import type {ImageSourcePropType} from 'react-native';
import type {MoveStyle, Sketchling} from '../../../shared/protocol';

export const ABILITY: Record<
  MoveStyle,
  {label: string; feature: string; pop: string; icon: ImageSourcePropType}
> = {
  // label/feature defaults match the server's (server/src/ability.ts) for creatures saved before abilities existed
  fly: {
    label: 'Flies over ink blots!',
    feature: 'wide wings',
    pop: 'WINGS!',
    icon: require('../assets/art/ab_fly.png'),
  },
  roll: {
    label: 'Zooms fast on flat ground!',
    feature: 'round body',
    pop: 'WHEELS!',
    icon: require('../assets/art/ab_roll.png'),
  },
  hop: {
    label: 'Jumps extra high and far!',
    feature: 'long legs',
    pop: 'SPRINGS!',
    icon: require('../assets/art/ab_hop.png'),
  },
  walk: {
    label: 'ROAR knocks back ink blots!',
    feature: 'big strong body',
    pop: 'BIG ROAR!',
    icon: require('../assets/art/ab_walk.png'),
  },
};

/** The Sketchling's ability; older Hall of Fame entries have none, so it follows from how they move. */
export function abilityOf(s: Sketchling): Sketchling['ability'] {
  const a = s.ability as Sketchling['ability'] | undefined;
  if (a && ABILITY[a.kind]) return a;
  const kind = ABILITY[s.move] ? s.move : 'walk';
  return {kind, feature: ABILITY[kind].feature, label: ABILITY[kind].label};
}

/** What drawing does, told before anyone draws (same rules as the server's persona prompt). */
export const ABILITY_TIP =
  'Draw wings to fly over ink, wheels to roll, long legs to hop, a big body to ROAR!';
