// Minimal PNG reader: IHDR size + decode of 8-bit RGB/RGBA non-interlaced images (what the phone sends).
import {inflateSync} from 'node:zlib';

const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
export const MAX_SIDE = 2048;

export interface PngInfo {
  width: number;
  height: number;
}

export interface Rgba extends PngInfo {
  data: Uint8Array; // width * height * 4
}

const u32 = (b: Uint8Array, o: number) => ((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0;
const type = (b: Uint8Array, o: number) => String.fromCharCode(b[o]!, b[o + 1]!, b[o + 2]!, b[o + 3]!);

/** Width/height from the IHDR chunk, or null if this is not a PNG. */
export function readPngSize(b: Uint8Array): PngInfo | null {
  if (b.length < 33 || SIG.some((v, i) => b[i] !== v)) return null;
  if (u32(b, 8) !== 13 || type(b, 12) !== 'IHDR') return null;
  const width = u32(b, 16);
  const height = u32(b, 20);
  return width > 0 && height > 0 ? {width, height} : null;
}

/** Decode to RGBA. Returns null for anything unsupported or corrupt. */
export function decodePng(b: Uint8Array): Rgba | null {
  try {
    const size = readPngSize(b);
    if (!size || size.width > MAX_SIDE || size.height > MAX_SIDE) return null;
    const {width, height} = size;
    const [depth, color, , , interlace] = b.subarray(24, 29);
    const bpp = color === 6 ? 4 : color === 2 ? 3 : 0;
    if (depth !== 8 || !bpp || interlace !== 0) return null;

    const idat: Uint8Array[] = [];
    for (let o = 8; o + 12 <= b.length; ) {
      const len = u32(b, o);
      const t = type(b, o + 4);
      if (t === 'IDAT') idat.push(b.subarray(o + 8, o + 8 + len));
      if (t === 'IEND') break;
      o += 12 + len;
    }
    const stride = width * bpp;
    const expected = height * (stride + 1);
    const raw = inflateSync(Buffer.concat(idat), {maxOutputLength: expected});
    if (raw.length < expected) return null;

    const px = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const row = y * stride;
      for (let x = 0; x < stride; x++) {
        const a = x >= bpp ? px[row + x - bpp]! : 0;
        const up = y ? px[row - stride + x]! : 0;
        const c = x >= bpp && y ? px[row - stride + x - bpp]! : 0;
        let p: number;
        if (filter === 0) p = 0;
        else if (filter === 1) p = a;
        else if (filter === 2) p = up;
        else if (filter === 3) p = (a + up) >> 1;
        else if (filter === 4) {
          const pa = Math.abs(up - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + up - 2 * c);
          p = pa <= pb && pa <= pc ? a : pb <= pc ? up : c;
        } else return null;
        px[row + x] = (raw[src + x]! + p) & 255;
      }
    }
    if (bpp === 4) return {width, height, data: px};
    const data = new Uint8Array(width * height * 4);
    for (let i = 0, j = 0; i < px.length; i += 3, j += 4) {
      data[j] = px[i]!;
      data[j + 1] = px[i + 1]!;
      data[j + 2] = px[i + 2]!;
      data[j + 3] = 255;
    }
    return {width, height, data};
  } catch {
    return null;
  }
}
