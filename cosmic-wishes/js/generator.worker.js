// Runs the heavy placement loop off the main thread so the page never freezes.
import { generateAll } from './wishgen.js';

self.onmessage = (e) => {
  const out = generateAll(e.data.count);
  self.postMessage(out, [out.x.buffer, out.y.buffer, out.size.buffer, out.t.buffer, out.cat.buffer]);
};
