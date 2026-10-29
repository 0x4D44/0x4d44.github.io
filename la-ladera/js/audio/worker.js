// Sound worker (owner: A1): renders library samples off the main thread so building them never costs a frame.
// Protocol: postMessage({ id, key }) -> { id, key, data: Float32Array (transferred) } or { id, key, error }.
import { render } from './library.js';

self.onmessage = (e) => {
  const { id, key } = e.data ?? {};
  try { const data = render(key); self.postMessage({ id, key, data }, [data.buffer]); }
  catch (err) { self.postMessage({ id, key, error: String(err?.message ?? err) }); }
};
