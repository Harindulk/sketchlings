import {describe, expect, test} from 'bun:test';
import {decodePng, readPngSize} from '../src/png';
import {drawBlob, encodePng} from './helpers';

describe('png', () => {
  const w = 37, h = 23; // odd sizes catch stride bugs
  const rgba = drawBlob(w, h, [220, 40, 60], 7);
  for (let i = 0; i < rgba.length; i += 4) rgba[i + 3] = rgba[i + 3] ? (i * 7) & 255 : 0; // varied alpha

  test('reads IHDR size', () => {
    expect(readPngSize(encodePng(w, h, rgba))).toEqual({width: w, height: h});
  });

  test('decodes RGBA with every filter type', () => {
    const img = decodePng(encodePng(w, h, rgba))!;
    expect(img.width).toBe(w);
    expect(img.height).toBe(h);
    expect(Buffer.from(img.data).equals(Buffer.from(rgba))).toBe(true);
  });

  test('decodes RGB as opaque RGBA', () => {
    const img = decodePng(encodePng(w, h, rgba, 2))!;
    for (let i = 0; i < rgba.length; i += 4) {
      expect([...img.data.subarray(i, i + 4)]).toEqual([rgba[i]!, rgba[i + 1]!, rgba[i + 2]!, 255]);
    }
  });

  test('rejects non-PNG, truncated, interlaced and corrupt input without throwing', () => {
    const png = encodePng(w, h, rgba);
    expect(readPngSize(new TextEncoder().encode('definitely not a png, just text'))).toBeNull();
    expect(readPngSize(png.subarray(0, 20))).toBeNull();
    expect(decodePng(png.subarray(0, png.length - 40))).toBeNull();
    expect(decodePng(encodePng(w, h, rgba, 6, 1))).toBeNull();
    const corrupt = png.slice();
    corrupt.fill(7, 45, 80); // stomp on the IDAT data
    expect(decodePng(corrupt)).toBeNull();
    expect(readPngSize(corrupt)).toEqual({width: w, height: h});
  });
});
