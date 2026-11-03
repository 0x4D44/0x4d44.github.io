// Flat geometry for the layout tests (A5; world-beachfront and world-beachsea): oriented rectangles and circles in the world's XZ plane, the way kit.js and physics.js build their colliders.
//   shapeOf(s)      a collider record as a shape: a post { kind: 'post', x, z, r }, a rect { kind: 'rect', x, z, w, d, ry } or a wall { x1, z1, x2, z2, t } (a thin rectangle along its length)
//   box(x0, z0, x1, z1)   an axis-aligned rectangle
//   overlaps(a, b)  true when two shapes (a circle { c, r } or a rectangle { c, hw, hd, ry }) cross
//   segDist(x, z, w)      the distance from a point to a wall's centre line
export function shapeOf(s) {
  if (s.kind === 'post') return { c: [s.x, s.z], r: s.r };
  if (s.kind === 'rect') return { c: [s.x, s.z], hw: s.w / 2, hd: s.d / 2, ry: s.ry };
  const dx = s.x2 - s.x1, dz = s.z2 - s.z1, len = Math.hypot(dx, dz);        // a segment is a thin rectangle along its length
  return { c: [(s.x1 + s.x2) / 2, (s.z1 + s.z2) / 2], hw: len / 2 + s.t, hd: s.t, ry: -Math.atan2(dz, dx) };
}
const toLocal = (sh, p) => { const c = Math.cos(sh.ry), s = Math.sin(sh.ry), dx = p[0] - sh.c[0], dz = p[1] - sh.c[1]; return [dx * c - dz * s, dx * s + dz * c]; };   // (kit.js rect: x' = x c + z s ... inverse of the world rotation)
const corners = (sh) => { const c = Math.cos(sh.ry), s = Math.sin(sh.ry); return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [sh.c[0] + a * sh.hw * c + b * sh.hd * s, sh.c[1] - a * sh.hw * s + b * sh.hd * c]); };
export function overlaps(a, b) {
  if (a.r !== undefined && b.r !== undefined) return Math.hypot(a.c[0] - b.c[0], a.c[1] - b.c[1]) < a.r + b.r;
  if (a.r !== undefined || b.r !== undefined) {
    const [circle, box] = a.r !== undefined ? [a, b] : [b, a], p = toLocal(box, circle.c);
    const q = [Math.max(-box.hw, Math.min(box.hw, p[0])), Math.max(-box.hd, Math.min(box.hd, p[1]))];
    return Math.hypot(p[0] - q[0], p[1] - q[1]) < circle.r;
  }
  const axes = [[Math.cos(a.ry), -Math.sin(a.ry)], [Math.sin(a.ry), Math.cos(a.ry)], [Math.cos(b.ry), -Math.sin(b.ry)], [Math.sin(b.ry), Math.cos(b.ry)]];
  const ca = corners(a), cb = corners(b);
  for (const [ax, az] of axes) {
    const pa = ca.map((p) => p[0] * ax + p[1] * az), pb = cb.map((p) => p[0] * ax + p[1] * az);
    if (Math.max(...pa) <= Math.min(...pb) + 1e-6 || Math.max(...pb) <= Math.min(...pa) + 1e-6) return false;
  }
  return true;
}
export const box = (x0, z0, x1, z1) => ({ c: [(x0 + x1) / 2, (z0 + z1) / 2], hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, ry: 0 });
export function segDist(x, z, w) {
  const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz, t = l2 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
  return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz));
}
