// Main-thread wrapper: tries a module Web Worker first, falls back to running inline.
import { generateAll } from './wishgen.js';

export function generateInBackground(count) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const w = new Worker(new URL('./generator.worker.js', import.meta.url), { type: 'module' });
      w.onmessage = (e) => { finish(e.data); w.terminate(); };
      w.onerror = () => { w.terminate(); finish(generateAll(count)); };
      w.postMessage({ count });
    } catch (err) {
      finish(generateAll(count));
    }
  });
}
