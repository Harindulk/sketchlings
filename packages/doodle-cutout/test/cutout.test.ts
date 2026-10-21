import {describe, expect, test} from 'bun:test';
import {cutout, type CutoutResult} from '../src';
import {alphaAt, MARKER, opaqueArea, RED_CRAYON, rgbAt, rng, Scene, YELLOW_CRAYON} from './helpers/synth';

const W = 400;
const H = 300;

/** Sprite pixel for an input-image pixel (scale 1): sprite origin = bbox - margin. */
const margin = (padding = 4, outline = 0) => padding + outline + 2;
const sp = (r: CutoutResult, x: number, y: number, m = margin()) => [x - r.bbox.x + m, y - r.bbox.y + m] as const;

function expectNear(actual: number, expected: number, tol: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tol);
}

function closedOutlinePhoto(seed = 1) {
  return new Scene(W, H).strokeEllipse(200, 150, 90, 70, 6).render({shadow: 0.45, angle: 0.6, noise: 0.025, seed});
}

describe('cutout', () => {
  test('closed outline becomes a solid sticker with a clean interior', () => {
    const r = cutout(closedOutlinePhoto());
    expectNear(r.bbox.x, 107, 3);
    expectNear(r.bbox.y, 77, 3);
    expectNear(r.bbox.width, 186, 6);
    expectNear(r.bbox.height, 146, 6);
    // Filled ellipse of radii (93, 73), not just the 6 px ring.
    expectNear(opaqueArea(r), Math.PI * 93 * 73, Math.PI * 93 * 73 * 0.08);
    const [cx, cy] = sp(r, 200, 150);
    expect(alphaAt(r, cx, cy)).toBe(255);
    for (const v of rgbAt(r, cx, cy)) expect(v).toBeGreaterThan(225); // paper inside is whitened
    expect(r.inkCoverage).toBeLessThan(0.3);
    expect(r.palette.length).toBeGreaterThan(0);
    // Corners of the sprite are transparent.
    expect(alphaAt(r, 0, 0)).toBe(0);
    expect(alphaAt(r, r.width - 1, r.height - 1)).toBe(0);
    expect(r.data.length).toBe(r.width * r.height * 4);
    expect(r.width).toBe(r.bbox.width + 2 * margin());
  });

  test('filled crayon blob comes out solid and keeps its colour', () => {
    const photo = new Scene(W, H).fillEllipse(200, 150, 80, 60, RED_CRAYON, 0.8).render({shadow: 0.3, noise: 0.02});
    const r = cutout(photo);
    expectNear(opaqueArea(r), Math.PI * 80 * 60, Math.PI * 80 * 60 * 0.1);
    const [cx, cy] = sp(r, 200, 150);
    expect(alphaAt(r, cx, cy)).toBe(255);
    const [pr, pg, pb] = [1, 3, 5].map((i) => parseInt(r.palette[0].slice(i, i + 2), 16));
    expect(pr).toBeGreaterThan(pg + 80);
    expect(pr).toBeGreaterThan(pb + 80);
    expect(r.inkCoverage).toBeGreaterThan(0.6);
  });

  test('a coloured area wider than the paper estimate window stays solid', () => {
    const photo = new Scene(W, H).fillEllipse(200, 150, 150, 110, RED_CRAYON, 0.75).render({shadow: 0.45, angle: 2.4});
    const r = cutout(photo);
    const [cx, cy] = sp(r, 200, 150);
    expect(alphaAt(r, cx, cy)).toBe(255);
    expectNear(opaqueArea(r), Math.PI * 150 * 110, Math.PI * 150 * 110 * 0.08);
  });

  test('light yellow crayon is found through its colour', () => {
    const photo = new Scene(W, H).fillEllipse(200, 150, 70, 50, YELLOW_CRAYON, 0.9).render({noise: 0.02});
    const r = cutout(photo);
    expectNear(opaqueArea(r), Math.PI * 70 * 50, Math.PI * 70 * 50 * 0.12);
  });

  test('a small gap in an outline is bridged; closeRadius 0 leaves it open', () => {
    // Gap of ~0.07 rad * 90 px = ~6 px on the right-hand side.
    const photo = new Scene(W, H).strokeEllipse(200, 150, 90, 70, 6, MARKER, [-0.035, 0.035]).render({shadow: 0.3});
    const bridged = cutout(photo);
    const [cx, cy] = sp(bridged, 200, 150);
    expect(alphaAt(bridged, cx, cy)).toBe(255);
    expectNear(opaqueArea(bridged), Math.PI * 93 * 73, Math.PI * 93 * 73 * 0.08);

    const open = cutout(photo, {closeRadius: 0});
    const [ox, oy] = sp(open, 200, 150);
    expect(alphaAt(open, ox, oy)).toBe(0);
    expect(opaqueArea(open)).toBeLessThan(opaqueArea(bridged) * 0.25);
  });

  test('specks and stray dots are removed', () => {
    const scene = new Scene(W, H).strokeEllipse(200, 150, 90, 70, 6);
    const rand = rng(99);
    let placed = 0;
    while (placed < 80) {
      const x = rand() * W;
      const y = rand() * H;
      if (((x - 200) / 115) ** 2 + ((y - 150) / 95) ** 2 < 1) continue; // keep clear of the drawing
      scene.disc(x, y, 0.6 + rand() * 1.2);
      placed++;
    }
    scene.disc(40, 260, 6); // a deliberate dot far away: below keepRatio
    const r = cutout(scene.render({shadow: 0.3, noise: 0.03}));
    expectNear(r.bbox.x, 107, 3);
    expectNear(r.bbox.y, 77, 3);
    expectNear(r.bbox.width, 186, 6);
    expectNear(r.bbox.height, 146, 6);
    expectNear(opaqueArea(r), Math.PI * 93 * 73, Math.PI * 93 * 73 * 0.08);
  });

  test('two separate drawings are both kept; keepRatio can limit to the largest', () => {
    const scene = new Scene(W, H)
      .fillEllipse(110, 150, 60, 50, RED_CRAYON, 0.85)
      .strokeEllipse(110, 150, 60, 50, 5)
      .strokeEllipse(295, 150, 50, 40, 5)
      .disc(380, 20, 4); // tiny extra, dropped by keepRatio
    const photo = scene.render({shadow: 0.35, noise: 0.02});
    const both = cutout(photo);
    expectNear(both.bbox.x, 47, 3);
    expectNear(both.bbox.x + both.bbox.width, 348, 4);
    const [rx, ry] = sp(both, 295, 150);
    expect(alphaAt(both, rx, ry)).toBe(255);

    const largest = cutout(photo, {keepRatio: 0.9});
    expectNear(largest.bbox.x, 47, 3);
    expectNear(largest.bbox.x + largest.bbox.width, 173, 4);
  });

  test('dark table around the sheet is ignored (narrow border)', () => {
    const photo = new Scene(W, H)
      .table({x: 30, y: 25, w: 340, h: 250})
      .strokeEllipse(200, 150, 70, 50, 6)
      .render({shadow: 0.3, noise: 0.02});
    const r = cutout(photo);
    expectNear(r.bbox.x, 127, 3);
    expectNear(r.bbox.y, 97, 3);
    expectNear(r.bbox.width, 146, 6);
    expectNear(r.bbox.height, 106, 6);
    expectNear(opaqueArea(r), Math.PI * 73 * 53, Math.PI * 73 * 53 * 0.1);
  });

  test('dark table around the sheet is ignored (wide border on one side)', () => {
    const photo = new Scene(W, H)
      .table({x: 150, y: 0, w: 250, h: 300})
      .strokeEllipse(270, 150, 70, 60, 6)
      .render({shadow: 0.2, angle: Math.PI, noise: 0.02});
    const r = cutout(photo);
    expectNear(r.bbox.x, 197, 3);
    expectNear(r.bbox.width, 146, 6);
    expectNear(opaqueArea(r), Math.PI * 73 * 63, Math.PI * 73 * 63 * 0.1);
  });

  test('a wide dark table all around the sheet does not turn the whole sheet into the cutout', () => {
    // Table wider than the paper estimate window on every side: the sheet edge is a hard step all the way round.
    const photo = new Scene(W, H)
      .table({x: 70, y: 60, w: 260, h: 180}, [0.15, 0.15, 0.16])
      .strokeEllipse(200, 150, 70, 50, 6)
      .render({shadow: 0.2, noise: 0.015});
    const r = cutout(photo);
    expectNear(r.bbox.x, 127, 3);
    expectNear(r.bbox.width, 146, 6);
    expectNear(opaqueArea(r), Math.PI * 73 * 53, Math.PI * 73 * 53 * 0.1);
  });

  test('the shadow a sheet casts on a wide light table is not part of the cutout', () => {
    const scene = new Scene(W, H).table({x: 70, y: 55, w: 260, h: 190}, [0.8, 0.79, 0.76]);
    scene.stroke([[334, 62], [334, 249], [78, 249]], 8, [0.45, 0.45, 0.45]); // the sheet's shadow, right and below
    const r = cutout(scene.strokeEllipse(200, 150, 70, 50, 6).render({shadow: 0.25, noise: 0.015}));
    expectNear(r.bbox.x, 127, 3);
    expectNear(r.bbox.width, 146, 6);
    expectNear(r.bbox.height, 106, 6);
    expectNear(opaqueArea(r), Math.PI * 73 * 53, Math.PI * 73 * 53 * 0.1);
  });

  // Repro from the phone review (768x1024 portrait, like a downscaled phone photo): a creature with legs.
  const creature = (s: Scene, legEnd: number) =>
    s
      .strokeEllipse(384, 450, 260, 320, 14)
      .stroke([[294, 760], [284, legEnd]], 14)
      .stroke([[474, 760], [484, legEnd]], 14)
      .disc(294, 350, 30)
      .disc(474, 350, 30);

  test('legs drawn to the edge of the paper: the table is cut away, the creature is kept', () => {
    const photo = creature(new Scene(768, 1024).table({x: 40, y: 40, w: 688, h: 944}), 990).render({shadow: 0.3, noise: 0.01});
    const r = cutout(photo);
    expectNear(r.bbox.x, 117, 4); // the body, not the eyes (264) and not the table (0)
    expectNear(r.bbox.width, 535, 8);
    expectNear(r.bbox.y, 123, 4);
    expect(r.bbox.y + r.bbox.height).toBeGreaterThan(940); // legs run down to the paper edge (984)
    expect(r.bbox.y + r.bbox.height).toBeLessThanOrEqual(984); // but no table
    const [cx, cy] = sp(r, 384, 450);
    expect(alphaAt(r, cx, cy)).toBe(255);
  });

  test('legs that run off the photo: the creature is kept', () => {
    const r = cutout(creature(new Scene(768, 1024), 1030).render({noise: 0.01}));
    expectNear(r.bbox.x, 117, 4);
    expectNear(r.bbox.width, 535, 8);
    expect(r.bbox.y + r.bbox.height).toBeGreaterThan(990);
    const [cx, cy] = sp(r, 384, 450);
    expect(alphaAt(r, cx, cy)).toBe(255);
  });

  test('a body outline cut off by the top and bottom of the photo is kept, not just the eyes', () => {
    const photo = new Scene(768, 1024).strokeEllipse(384, 540, 300, 520, 14).disc(294, 420, 30).disc(474, 420, 30).render({noise: 0.01});
    const r = cutout(photo);
    expectNear(r.bbox.x, 77, 4);
    expectNear(r.bbox.width, 615, 8);
    expect(r.bbox.height).toBeGreaterThan(900);
  });

  test('a single outline touching the table: neither the table nor the whole sheet is kept', () => {
    // No separate parts: once the table is gone the outline must survive on its own.
    const photo = new Scene(W, H)
      .table({x: 25, y: 20, w: 350, h: 260})
      .strokeEllipse(200, 150, 80, 60, 6)
      .stroke([[160, 205], [155, 280]], 6)
      .stroke([[240, 205], [245, 280]], 6)
      .render({shadow: 0.3, noise: 0.015});
    const r = cutout(photo);
    expectNear(r.bbox.x, 117, 3);
    expectNear(r.bbox.width, 166, 6);
    expect(r.bbox.y + r.bbox.height).toBeGreaterThan(265);
    expect(r.bbox.y + r.bbox.height).toBeLessThanOrEqual(280);
    expectNear(opaqueArea(r), Math.PI * 83 * 63, Math.PI * 83 * 63 * 0.12); // body + legs, no table frame
  });

  test('ruled school paper: the faint lines are not ink', () => {
    const scene = new Scene(W, H);
    for (let y = 20; y < H; y += 22) scene.stroke([[0, y], [W, y]], 1.5, [0.72, 0.84, 0.97]);
    scene.stroke([[50, 0], [50, H]], 2, [0.95, 0.62, 0.62]);
    const r = cutout(scene.strokeEllipse(200, 150, 90, 70, 6).render({shadow: 0.35, noise: 0.02}));
    expectNear(r.bbox.x, 107, 3);
    expectNear(r.bbox.width, 186, 6);
    expectNear(opaqueArea(r), Math.PI * 93 * 73, Math.PI * 93 * 73 * 0.08);
  });

  test('notebook paper (repro): blue lines and the red margin are not ink, even where they cross the drawing', () => {
    const s = new Scene(768, 1024);
    for (let y = 40; y < 1024; y += 32) s.stroke([[0, y], [768, y]], 2, [0.55, 0.72, 0.92]);
    s.stroke([[90, 0], [90, 1024]], 2, [0.92, 0.55, 0.55]);
    s.strokeEllipse(400, 500, 250, 300, 14).disc(320, 410, 28).disc(480, 410, 28);
    const r = cutout(s.render({noise: 0.01}));
    expectNear(r.bbox.x, 143, 4);
    expectNear(r.bbox.y, 193, 4);
    expectNear(r.bbox.width, 515, 8);
    expectNear(r.bbox.height, 615, 8);
    expectNear(opaqueArea(r), Math.PI * 257 * 307, Math.PI * 257 * 307 * 0.06);
  });

  test('darker, thicker, tilted grey lines and squared paper are not ink either', () => {
    for (const grid of [false, true]) {
      const s = new Scene(W, H);
      const a = 0.08; // the sheet is a little crooked in the photo
      const line = (u0: number, v0: number, u1: number, v1: number) =>
        s.stroke([[200 + u0 * Math.cos(a) - v0 * Math.sin(a), 150 + u0 * Math.sin(a) + v0 * Math.cos(a)], [200 + u1 * Math.cos(a) - v1 * Math.sin(a), 150 + u1 * Math.sin(a) + v1 * Math.cos(a)]], 2, [0.6, 0.6, 0.63]);
      for (let v = -250; v < 250; v += 13) {
        line(-260, v, 260, v);
        if (grid) line(v, -260, v, 260);
      }
      const r = cutout(s.strokeEllipse(200, 150, 90, 70, 6).render({shadow: 0.35, noise: 0.02}));
      expectNear(r.bbox.x, 107, 3);
      expectNear(r.bbox.width, 186, 6);
      expectNear(r.bbox.height, 146, 6);
      expectNear(opaqueArea(r), Math.PI * 93 * 73, Math.PI * 93 * 73 * 0.08);
    }
  });

  test('blank paper with heavy shadows yields an empty result', () => {
    const photo = new Scene(W, H).render({shadow: 0.6, blobShadow: 0.5, noise: 0.03});
    const r = cutout(photo);
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
    expect(r.data.length).toBe(0);
    expect(r.palette).toEqual([]);
  });

  test('a strong hand shadow does not leak into the cutout', () => {
    const photo = new Scene(W, H).strokeEllipse(150, 130, 70, 55, 6).render({shadow: 0.5, blobShadow: 0.55, noise: 0.025});
    const r = cutout(photo);
    expectNear(r.bbox.x, 77, 3);
    expectNear(r.bbox.width, 146, 6);
    expectNear(opaqueArea(r), Math.PI * 73 * 58, Math.PI * 73 * 58 * 0.1);
  });

  test('large photos are downscaled; bbox stays in input coordinates', () => {
    const photo = new Scene(2000, 1500).strokeEllipse(1000, 750, 450, 350, 30).render({shadow: 0.3});
    const r = cutout(photo);
    expect(Math.max(r.width, r.height)).toBeLessThanOrEqual(1024 + 2 * margin());
    expectNear(r.bbox.x, 535, 8);
    expectNear(r.bbox.y, 385, 8);
    expectNear(r.bbox.width, 930, 16);
  });

  test('sticker outline adds an opaque white border', () => {
    const photo = closedOutlinePhoto(3);
    const plain = cutout(photo);
    const sticker = cutout(photo, {outline: 6});
    expect(sticker.width).toBe(plain.width + 12);
    const m = margin(4, 6);
    // 3 px left of the drawing's leftmost point, on the centre line.
    const [x, y] = sp(sticker, sticker.bbox.x - 3, 150, m);
    expect(alphaAt(sticker, x, y)).toBe(255);
    for (const v of rgbAt(sticker, x, y)) expect(v).toBeGreaterThan(245);
    expect(opaqueArea(sticker)).toBeGreaterThan(opaqueArea(plain));
  });

  test('transparent input (finger drawing) is treated as white paper', () => {
    const img = {data: new Uint8ClampedArray(200 * 200 * 4), width: 200, height: 200};
    for (let y = 0; y < 200; y++) {
      for (let x = 0; x < 200; x++) {
        const d = Math.hypot(x - 100, y - 100);
        if (Math.abs(d - 60) < 4) img.data.set([40, 180, 255, 255], (y * 200 + x) * 4);
      }
    }
    const r = cutout(img);
    expectNear(opaqueArea(r), Math.PI * 64 * 64, Math.PI * 64 * 64 * 0.08);
    expect(r.palette[0]).toMatch(/^#[0-9a-f]{6}$/);
  });

  test('debug returns every intermediate buffer at working size', () => {
    const r = cutout(closedOutlinePhoto(), {debug: true});
    const d = r.debug!;
    expect(d.width).toBe(W);
    expect(d.height).toBe(H);
    for (const k of ['score', 'ink', 'cleaned', 'closed', 'filled', 'mask'] as const) expect(d[k].length).toBe(W * H);
    expect(d.flattened.length).toBe(W * H * 4);
    expect(d.threshold).toBeGreaterThan(d.weakThreshold - 1e-9);
    // Interior is not ink, but it is part of the final mask.
    expect(d.ink[150 * W + 200]).toBe(0);
    expect(d.mask[150 * W + 200]).toBe(255);
  });

  test('rejects malformed input', () => {
    expect(() => cutout({data: new Uint8ClampedArray(10), width: 10, height: 10})).toThrow(RangeError);
    expect(() => cutout({data: new Uint8ClampedArray(0), width: 0, height: 10})).toThrow(RangeError);
    expect(() => cutout(closedOutlinePhoto(), {outlineColor: 'pink'})).toThrow(RangeError);
  });
});
