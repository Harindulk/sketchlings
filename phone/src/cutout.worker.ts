import {cutout} from '../../packages/doodle-cutout/src/index';

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent) => void) | null;
  postMessage(msg: unknown, transfer?: Transferable[]): void;
};

ctx.onmessage = (e) => {
  const {id, image, options} = e.data;
  try {
    const result = cutout(image, options);
    ctx.postMessage({id, result}, [result.data.buffer]);
  } catch (err) {
    ctx.postMessage({id, error: err instanceof Error ? err.message : String(err)});
  }
};
