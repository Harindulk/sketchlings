// Browser demo: bun examples/demo.html, then open the printed URL.
import {cutout} from '../src';

const file = document.getElementById('file') as HTMLInputElement;
const photo = document.getElementById('photo') as HTMLCanvasElement;
const sprite = document.getElementById('sprite') as HTMLCanvasElement;
const info = document.getElementById('info')!;

file.addEventListener('change', async () => {
  const f = file.files?.[0];
  if (!f) return;
  info.textContent = 'Working...';
  const bitmap = await createImageBitmap(f, {imageOrientation: 'from-image'}); // honours EXIF rotation
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  photo.width = Math.round(bitmap.width * scale);
  photo.height = Math.round(bitmap.height * scale);
  const ctx = photo.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(bitmap, 0, 0, photo.width, photo.height);
  bitmap.close();

  const t0 = performance.now();
  const r = cutout(ctx.getImageData(0, 0, photo.width, photo.height), {outline: 8});
  const ms = performance.now() - t0;
  if (!r.width) {
    sprite.width = sprite.height = 0;
    info.textContent = `No drawing found (${ms.toFixed(0)} ms). Try a darker pen, or less table in the photo.`;
    return;
  }
  sprite.width = r.width;
  sprite.height = r.height;
  sprite.getContext('2d')!.putImageData(new ImageData(r.data, r.width, r.height), 0, 0);
  info.innerHTML = `${r.width}×${r.height} in ${ms.toFixed(0)} ms · ink ${(r.inkCoverage * 100).toFixed(0)}% · ` + r.palette.map((c) => `<span class="swatch" style="background:${c}"></span>`).join('');
});
