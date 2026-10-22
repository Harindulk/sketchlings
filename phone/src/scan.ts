// Photo -> decoded pixels -> doodle-cutout (in a Web Worker) -> PNG sprite ready to upload.
import type {CutoutOptions, CutoutResult} from '../../packages/doodle-cutout/src/index';
import sampleUrl from './samples/monster.jpg?url';

export const MAX_SIDE = 1024; // protocol: sprite PNG max 1024 px
const OPTIONS: CutoutOptions = {maxSize: MAX_SIDE, outline: 8};
// The drawpad is flat white, and its strokes often touch its edge: keep ink at the edge, no lighting estimate.
export const PAD_OPTIONS: CutoutOptions = {...OPTIONS, removeBorderBlobs: false, backgroundRadius: 720, threshold: 0.3};

export interface Sprite {
  blob: Blob;
  url: string; // object URL for previews
  width: number;
  height: number;
}

/** Decode a camera photo honouring EXIF orientation, downscaled to fit MAX_SIDE. */
export async function decodeImage(file: Blob): Promise<ImageData> {
  let src: ImageBitmap | HTMLImageElement;
  try {
    src = await createImageBitmap(file, {imageOrientation: 'from-image'});
  } catch {
    // Older browsers: <img> applies EXIF orientation by default too.
    const url = URL.createObjectURL(file);
    try {
      src = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('That file is not a picture we can read.'));
        img.src = url;
      });
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }
  const sw = src.width;
  const sh = src.height;
  const scale = Math.min(1, MAX_SIDE / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  if ('close' in src) src.close();
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, {resolve: (r: CutoutResult) => void; reject: (e: Error) => void}>();

function getWorker(): Worker {
  if (worker) return worker;
  const w = new Worker(new URL('./cutout.worker.ts', import.meta.url), {type: 'module'});
  w.onmessage = (e: MessageEvent<{id: number; result?: CutoutResult; error?: string}>) => {
    const p = pending.get(e.data.id);
    pending.delete(e.data.id);
    if (e.data.result) p?.resolve(e.data.result);
    else p?.reject(new Error(e.data.error ?? 'cutout failed'));
  };
  w.onerror = () => {
    for (const p of pending.values()) p.reject(new Error('worker crashed'));
    pending.clear();
    worker = null;
  };
  worker = w;
  return w;
}

export async function runCutout(img: ImageData, options = OPTIONS): Promise<CutoutResult> {
  const image = {data: img.data, width: img.width, height: img.height};
  try {
    const w = getWorker();
    return await new Promise<CutoutResult>((resolve, reject) => {
      const id = ++seq;
      pending.set(id, {resolve, reject});
      w.postMessage({id, image, options});
    });
  } catch {
    // No module workers (old Safari) or the worker failed to load: run on the main thread.
    const {cutout} = await import('../../packages/doodle-cutout/src/index');
    return cutout(image, options);
  }
}

/** Encode a cutout result as a PNG no larger than MAX_SIDE. Null when nothing was found. */
export async function toSprite(r: CutoutResult): Promise<Sprite | null> {
  if (!r.width || !r.height) return null;
  const src = document.createElement('canvas');
  src.width = r.width;
  src.height = r.height;
  src.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(r.data), r.width, r.height), 0, 0);
  const scale = Math.min(1, MAX_SIDE / Math.max(r.width, r.height));
  let out = src;
  if (scale < 1) {
    out = document.createElement('canvas');
    out.width = Math.round(r.width * scale);
    out.height = Math.round(r.height * scale);
    const ctx = out.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, out.width, out.height);
  }
  const blob = await new Promise<Blob | null>((res) => out.toBlob(res, 'image/png'));
  if (!blob) throw new Error('Could not save the picture.');
  return {blob, url: URL.createObjectURL(blob), width: out.width, height: out.height};
}

export async function processImage(img: ImageData, options = OPTIONS): Promise<Sprite | null> {
  const r = await runCutout(img, options);
  // A photo's cut-out as big as the whole frame is paper or table, not a creature: show the retake screen instead.
  if (options === OPTIONS && r.bbox.width >= img.width * 0.95 && r.bbox.height >= img.height * 0.95) return null;
  return toSprite(r);
}

/**
 * Test hook: `?debugImage=sample` (bundled sample photo) or `?debugImage=/same/origin.png`
 * replaces the camera, since automated browsers can't use one.
 */
export async function debugImage(): Promise<Blob | null> {
  const v = new URLSearchParams(location.search).get('debugImage');
  if (!v) return null;
  const url = v === 'sample' || v === '1' ? sampleUrl : v.startsWith('/') && !v.startsWith('//') ? v : null;
  if (!url) return null;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`debugImage ${res.status}`);
  return res.blob();
}

export async function upload(room: string, playerId: string, sprite: Sprite): Promise<Response> {
  return fetch(`/api/rooms/${encodeURIComponent(room)}/players/${encodeURIComponent(playerId)}/sketch`, {
    method: 'POST',
    headers: {'Content-Type': 'image/png'},
    body: sprite.blob,
  });
}
