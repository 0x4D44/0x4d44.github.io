/** Atlas colourways for later integration. No game module imports this tool.
 * The source root may share geometry with many other instances: clone only
 * affected geometries, preserve sharing inside the selected clone, and never
 * mutate its source. UV rectangles are bottom-origin glTF coordinates.
 */
export function applyWatersportsVariant(root, atlas, fromTile, toTile) {
  const from = atlas?.tiles?.[fromTile], to = atlas?.tiles?.[toTile];
  const rectangle = (r) => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite)
    && r[0] >= 0 && r[1] >= 0 && r[2] <= 1 && r[3] <= 1 && r[2] > r[0] && r[3] > r[1];
  if (!root || typeof root.traverse !== 'function' || !rectangle(from) || !rectangle(to))
    throw new TypeError('A traversable root and valid source/target atlas tiles are required');
  if (fromTile === toTile) return 0;
  const cache = new Map();
  let changed = 0;
  root.traverse((object) => {
    const source = object.geometry, uv = source?.getAttribute?.('uv');
    if (!uv) return;
    if (!cache.has(source)) {
      const selected = [];
      for (let i = 0; i < uv.count; i++) {
        const u = uv.getX(i), v = uv.getY(i);
        if (u >= from[0] - 1e-7 && u <= from[2] + 1e-7 && v >= from[1] - 1e-7 && v <= from[3] + 1e-7)
          selected.push(i);
      }
      if (!selected.length) cache.set(source, null);
      else {
        const copy = source.clone(), target = uv.clone();
        for (const i of selected) target.setXY(i,
          to[0] + (uv.getX(i) - from[0]) / (from[2] - from[0]) * (to[2] - to[0]),
          to[1] + (uv.getY(i) - from[1]) / (from[3] - from[1]) * (to[3] - to[1]));
        target.needsUpdate = true;
        copy.setAttribute('uv', target);
        cache.set(source, copy);
      }
    }
    const copy = cache.get(source);
    if (copy) { object.geometry = copy; changed++; }
  });
  return changed;
}
