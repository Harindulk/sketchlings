// Demo party: bundled sample Sketchlings (our own drawings in art-src/) and fake players, so the whole
// flow runs offline — for judges without phones, and for testing before the server exists.
import type {ImageSourcePropType} from 'react-native';
import type {AgeGroup, Player, Sketchling} from '../../../shared/protocol';
import {PLAYER_COLORS} from '../../../shared/protocol';
import {HTTP_BASE} from '../config';

const DEMO_SPRITES: Record<string, ImageSourcePropType> = {
  'demo:potato': require('../assets/art/potato.png'),
  'demo:frog': require('../assets/art/frog.png'),
  'demo:cloud': require('../assets/art/cloud.png'),
  'demo:hedgehog': require('../assets/art/hedgehog.png'),
  'demo:dino': require('../assets/art/dino.png'),
  'demo:star': require('../assets/art/star.png'),
};

export const spriteSource = (s: Sketchling): ImageSourcePropType =>
  DEMO_SPRITES[s.spriteUrl] ?? {uri: HTTP_BASE + s.spriteUrl};

const base = {width: 512, height: 512, source: 'offline' as const};

export const SAMPLE_SKETCHLINGS: Sketchling[] = [
  {
    ...base,
    id: 'demo-potato',
    playerId: 'demo-1',
    name: 'Sir Wobbleton',
    title: 'the Brave Potato',
    personality: 'A tiny knight who is scared of nothing except salad.',
    catchphrase: 'For crunch and glory!',
    intro:
      'Here comes a hero made of pure potato power, sword held high and cape flapping!',
    winLine: 'Mash-ter of the race, at your service!',
    stats: {speed: 3, jump: 2, power: 5},
    move: 'walk',
    colors: ['#d9a066', '#ff5a5f'],
    spriteUrl: 'demo:potato',
    eyes: [
      {x: 0.422, y: 0.434, r: 0.066},
      {x: 0.59, y: 0.418, r: 0.078},
    ],
    artist: 'Mia',
  },
  {
    ...base,
    id: 'demo-frog',
    playerId: 'demo-2',
    name: 'Bouncy Bea',
    title: 'the Springiest Frog',
    personality: 'Bea never walks anywhere when she can boing instead.',
    catchphrase: 'Boing boing, here I go!',
    intro:
      'Spring legs, star crown and a smile as wide as a lily pad. Make some noise for Bea!',
    winLine: 'Hop, hop, hooray for me!',
    stats: {speed: 3, jump: 5, power: 2},
    move: 'hop',
    colors: ['#57c26b', '#ffc531'],
    spriteUrl: 'demo:frog',
    eyes: [
      {x: 0.391, y: 0.293, r: 0.0625},
      {x: 0.617, y: 0.293, r: 0.0625},
    ],
    artist: 'Leo',
  },
  {
    ...base,
    id: 'demo-cloud',
    playerId: 'demo-3',
    name: 'Captain Fluff',
    title: 'the Cloud Pilot',
    personality: 'A fluffy flyer who loves loop-the-loops and soft landings.',
    catchphrase: 'Goggles on, let us float!',
    intro:
      'Clear the skies! Captain Fluff floats in with goggles on and a scarf full of wind.',
    winLine: 'Cloud nine? More like cloud number ONE!',
    stats: {speed: 4, jump: 3, power: 2},
    move: 'fly',
    colors: ['#c9b5ff', '#ff8a3d'],
    spriteUrl: 'demo:cloud',
    eyes: [
      {x: 0.477, y: 0.555, r: 0.059},
      {x: 0.617, y: 0.543, r: 0.07},
    ],
    artist: 'Ava',
  },
  {
    ...base,
    id: 'demo-hedgehog',
    playerId: 'demo-4',
    name: 'Rolo',
    title: 'the Spiky Snowball',
    personality: 'Rolls everywhere and says sorry to every pebble.',
    catchphrase: 'Roll with it!',
    intro:
      'Watch out, here rolls Rolo! Spiky on the outside, super soft in the middle.',
    winLine: 'I rolled all the way to the top!',
    stats: {speed: 5, jump: 1, power: 3},
    move: 'roll',
    colors: ['#ff8a3d', '#ffd8a8'],
    spriteUrl: 'demo:hedgehog',
    eyes: [
      {x: 0.418, y: 0.461, r: 0.059},
      {x: 0.586, y: 0.461, r: 0.059},
    ],
    artist: 'Sam',
  },
  {
    ...base,
    id: 'demo-dino',
    playerId: 'demo-5',
    name: 'Noodle Rex',
    title: 'the Gentle Giant',
    personality: 'A very tall dinosaur who gives the best hugs.',
    catchphrase: 'Big steps, big hugs!',
    intro: 'Long neck, yellow spikes, enormous heart. Say hello to Noodle Rex!',
    winLine: 'Rawr means thank you in dinosaur!',
    stats: {speed: 2, jump: 3, power: 4},
    move: 'walk',
    colors: ['#2bb3ff', '#ffc531'],
    spriteUrl: 'demo:dino',
    eyes: [{x: 0.777, y: 0.203, r: 0.043}],
    artist: 'Noah',
  },
  {
    ...base,
    id: 'demo-star',
    playerId: 'demo-6',
    name: 'Zippy',
    title: 'the Shooting Star',
    personality: 'Zippy makes a wish every time somebody smiles.',
    catchphrase: 'Make a wish and zoom!',
    intro: 'Straight from the night sky with a rainbow tail, it is Zippy!',
    winLine: 'Wish granted: first place!',
    stats: {speed: 4, jump: 4, power: 1},
    move: 'fly',
    colors: ['#ffe066', '#ff5a5f'],
    spriteUrl: 'demo:star',
    eyes: [
      {x: 0.477, y: 0.492, r: 0.055},
      {x: 0.621, y: 0.492, r: 0.055},
    ],
    artist: 'Zoe',
  },
];

export const DEMO_NAMES = ['Mia', 'Leo', 'Ava', 'Sam'];
const DEMO_AGES: AgeGroup[] = ['little', 'big', 'grownup', 'little'];

/** The 4 demo players, with their Sketchlings attached. */
export function demoPlayers(): Player[] {
  return DEMO_NAMES.map((name, i) => ({
    id: `demo-${i + 1}`,
    name,
    ageGroup: DEMO_AGES[i],
    color: PLAYER_COLORS[i],
    connected: true,
    sketchling: SAMPLE_SKETCHLINGS[i],
  }));
}
