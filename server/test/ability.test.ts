import {describe, expect, test} from 'bun:test';
import type {Sketchling} from '../../shared/protocol';
import {ABILITY_LABEL, GENERIC_FEATURE, shapeKind, withAbility} from '../src/ability';
import {analyze, offlinePersona} from '../src/persona';
import type {Rgba} from '../src/png';
import {encodePng} from './helpers';

type Shape = (x: number, y: number) => boolean;
const ellipse = (cx: number, cy: number, rx: number, ry: number): Shape => (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1;
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

/** Opaque ink-coloured silhouette (union of shapes) on a transparent background. */
function sprite(W: number, H: number, ...shapes: Shape[]): Rgba {
  const data = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (shapes.some(s => s(x + 0.5, y + 0.5))) data.set([90, 60, 200, 255], (y * W + x) * 4);
  return {width: W, height: H, data};
}

const SHAPES = {
  roll: sprite(120, 120, ellipse(60, 60, 55, 55)),
  // round body with two thin legs below: tall, two separate runs at the bottom
  hop: sprite(120, 200, ellipse(60, 60, 50, 50), rect(35, 100, 45, 195), rect(75, 100, 85, 195)),
  // small body with wide wings sticking out sideways
  fly: sprite(240, 100, ellipse(120, 50, 40, 45), ellipse(55, 40, 55, 14), ellipse(185, 40, 55, 14)),
  // chunky block and a long caterpillar are neither round, winged nor leggy
  walkBlock: sprite(140, 130, rect(5, 5, 135, 125)),
  walkLong: sprite(240, 90, ellipse(120, 45, 115, 40)),
};

describe('offline ability from the silhouette', () => {
  test('round -> roll, legs -> hop, wings -> fly, chunky -> walk', () => {
    expect(shapeKind(SHAPES.roll)).toBe('roll');
    expect(shapeKind(SHAPES.hop)).toBe('hop');
    expect(shapeKind(SHAPES.fly)).toBe('fly');
    expect(shapeKind(SHAPES.walkBlock)).toBe('walk');
    expect(shapeKind(SHAPES.walkLong)).toBe('walk');
    expect(shapeKind(null)).toBe('walk');
    expect(shapeKind({width: 4, height: 4, data: new Uint8Array(64)})).toBe('walk'); // empty sprite
  });

  test('offline persona: move = ability.kind from the shape, generic feature, fixed label, deterministic', () => {
    for (const [name, img] of Object.entries(SHAPES)) {
      const png = encodePng(img.width, img.height, img.data);
      const f = analyze(png, {width: img.width, height: img.height});
      const p = offlinePersona(f);
      const kind = name.startsWith('walk') ? 'walk' : name;
      expect(p.move).toBe(kind as Sketchling['move']);
      expect(p.ability).toEqual({kind: p.move, feature: GENERIC_FEATURE[p.move], label: ABILITY_LABEL[p.move]});
      expect(offlinePersona(analyze(png.slice(), {width: img.width, height: img.height}))).toEqual(p);
    }
  });

  test('labels and generic features fit the protocol limits', () => {
    for (const k of ['walk', 'hop', 'fly', 'roll'] as const) {
      expect(ABILITY_LABEL[k].split(' ').length).toBeLessThanOrEqual(6);
      expect(GENERIC_FEATURE[k].split(' ').length).toBeLessThanOrEqual(4);
    }
  });

  test('old hall entries without an ability get one matching their move', () => {
    const old = {move: 'hop', name: 'Pip'} as unknown as Sketchling;
    expect(withAbility(old).ability).toEqual({kind: 'hop', feature: GENERIC_FEATURE.hop, label: ABILITY_LABEL.hop});
    expect(withAbility({move: 'zoom'} as unknown as Sketchling).ability.kind).toBe('walk');
    const current = {move: 'fly', ability: {kind: 'fly', feature: 'big wings', label: ABILITY_LABEL.fly}} as Sketchling;
    expect(withAbility(current)).toBe(current);
  });
});
