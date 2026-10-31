// R2-V-17: the look of the smoke fog (style.css `.fx-smoke`). A flat grey veil with dark corners read as "screen dimmed"; smoke is soft, uneven and slowly moving.
// The texture is made once, in a small canvas, so there is no asset to load and nothing to fetch on a bad connection. Pure maths first (Node can test it), canvas second.

const OCTAVES = [[3, 0.42], [6, 0.28], [12, 0.18], [24, 0.12]];   // [cells across the tile, weight]; the weights add up to 1

/**
 * Density 0..1 of a `size` x `size` tile of cloud noise: smooth value noise in four octaves (big billows, then finer wisps). The lattice wraps at the edges, so the tile repeats
 * without a seam. Deterministic: the same puffs on every run.
 */
export function cloudPixels(size = 128, seed = 20261029) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const lat = OCTAVES.map(([n, w]) => ({ n, w, a: Float32Array.from({ length: n * n }, rnd) }));
  const out = new Float32Array(size * size), sm = (t) => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const { n, w, a } of lat) {
        const fx = (x / size) * n, fy = (y / size) * n, ix = Math.floor(fx), iy = Math.floor(fy), tx = sm(fx - ix), ty = sm(fy - iy), x1 = (ix + 1) % n, y1 = (iy + 1) % n;
        const top = a[iy * n + ix] * (1 - tx) + a[iy * n + x1] * tx, bot = a[y1 * n + ix] * (1 - tx) + a[y1 * n + x1] * tx;
        v += w * (top * (1 - ty) + bot * ty);
      }
      out[y * size + x] = v;
    }
  }
  return out;
}

/** The tile as a `data:` URL (opaque smoke greys, dark pockets to light billows), or '' where a canvas is not available. JPEG: a tile this smooth hides it, and noise as a PNG is ten times the size. */
export function smokeTexture(size = 128) {
  const d = cloudPixels(size);
  let lo = 1, hi = 0; for (const v of d) { if (v < lo) lo = v; if (v > hi) hi = v; }
  try {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const cx = cv.getContext('2d'); if (!cx) return '';
    const img = cx.createImageData(size, size), px = img.data;
    for (let i = 0; i < d.length; i++) {
      const t = (d[i] - lo) / (hi - lo || 1), k = i * 4;                        // stretched to the full range: the tile's own contrast is the puffs
      px[k] = 92 + 132 * t; px[k + 1] = 100 + 128 * t; px[k + 2] = 116 + 118 * t; px[k + 3] = 255;
    }
    cx.putImageData(img, 0, 0);
    return cv.toDataURL('image/jpeg', 0.78);
  } catch { return ''; }
}
