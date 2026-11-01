// Additional parked vehicle types use the actual library dimensions. No rescaling to squeeze a bus into an alley.
import { OCC } from './occupancy.js';
import { pointAt, project } from './geom.js';
import { inSpawnFan } from './kit.js';

const FORBIDDEN = OCC.DOOR | OCC.STAIR | OCC.PLAZA | OCC.LOT | OCC.STEEP | OCC.NAV;
const PARKED = [
  { key: 'vehicle_pickup', kind: 'pickup', minWidth: 7, count: 1 },
  { key: 'vehicle_colectivo', kind: 'colectivo', minWidth: 7, count: 1 },
  { key: 'vehicle_tricycle', kind: 'tricycle', minWidth: 4.4, count: 1 },
  { key: 'vehicle_handcart', kind: 'handcart', minWidth: 4.4, count: 1 },
  { key: 'vehicle_rubbish_cart', kind: 'rubbish_cart', minWidth: 4.4, count: 1 },
];

/** Whole footprint is checked on a <=0.35 m grid, including both edges, against streets, doors and nav clearance. */
export function vehicleSpace(K, street, x, z, yaw, footprint, height = 2) {
  const [width, depth] = footprint, c = Math.cos(yaw), s = Math.sin(yaw);
  if (!(street.width >= width + 2.4) || inSpawnFan(K.plan, x, z, Math.hypot(width, depth) / 2)) return false;
  const nx = Math.ceil(width / .35), nz = Math.ceil(depth / .35);
  const nearbyStreets = K.plan.streets.filter((st) => st !== street && st.kind !== 'stair');
  for (let i = 0; i <= nx; i++) for (let j = 0; j <= nz; j++) {
    const lx = (i / nx - .5) * width, lz = (j / nz - .5) * depth;
    const px = x + c * lx + s * lz, pz = z - s * lx + c * lz;
    if (!K.occ.clear(px, pz, .12, FORBIDDEN) || K.occ.navDist(px, pz) < .9) return false;
    const at = project(street._d.pts, street._d.cum, px, pz);
    if (at.d > street.width / 2 - .15) return false;
    if (nearbyStreets.some((st) => project(st._d.pts, st._d.cum, px, pz).d < st.width / 2 + .45)) return false;
    // Check actual walls as well as occupancy: boundary hardware and retaining walls may not be on the occupancy grid.
    const ground = K.H(px, pz);
    if (K.ctx.physics._overlaps?.(px, pz, ground + .05, .16, height)) return false;
  }
  // The whole long body must avoid previously reserved poles, cars and street furniture.
  const steps = Math.max(1, Math.ceil((depth - width) / .4));
  for (let i = 0; i <= steps; i++) {
    const along = (i / steps - .5) * Math.max(0, depth - width);
    if (K.occ.overlaps(x + s * along, z + c * along, width / 2 + .15)) return false;
  }
  return K.occ.slope(x, z) <= .2;
}

export function buildParkedLibrary(K, { pitchOf, rec }) {
  const library = K.ctx.vehicleLibrary;
  if (!library) return null;
  const result = {};
  for (const spec of PARKED) {
    const meta = library.meta(spec.key);
    if (!meta) { result[spec.kind] = 0; continue; }
    const [width, depth] = meta.footprint;
    // Cargo cycles and carts favour the shopping streets; motor vehicles stay on the eight-metre road.
    const streets = K.plan.streets.filter((st) => (st.kind === 'road' || st.kind === 'street') && st.width >= spec.minWidth)
      .sort((a, b) => spec.minWidth < 7 ? a.width - b.width : a.id.localeCompare(b.id));
    let placed = 0;
    for (const street of streets) {
      if (placed >= spec.count) break;
      const d = street._d, rng = K.rng('vehicle-library:' + spec.key + ':' + street.id);
      const start = Math.max(8, depth / 2 + 2), end = street.len - start;
      for (let attempt = 0; attempt < 220 && placed < spec.count; attempt++) {
        const along = attempt < 160 ? rng.range(start, end) : start + (end - start) * ((attempt - 160) / 60);
        const p = pointAt(d.pts, d.cum, along), side = attempt % 2 ? -1 : 1;
        const lane = street.width / 2 - width / 2 - .32;
        const x = p.x - p.tz * lane * side, z = p.z + p.tx * lane * side;
        const yaw = Math.atan2(p.tx, p.tz) + (side > 0 ? 0 : Math.PI);
        const pitch = pitchOf(x, z, yaw);
        // Pitch shifts a tall roof beyond its floor rectangle; keep a symmetric conservative envelope about the origin.
        const clearance = [width, Math.abs(Math.cos(pitch)) * depth + 2 * Math.abs(Math.sin(pitch)) * meta.size[1]];
        if (!vehicleSpace(K, street, x, z, yaw, clearance, meta.size[1])) continue;
        const reserveRadius = Math.hypot(...clearance) / 2 + .15;
        if (K.occ.overlaps(x, z, reserveRadius)) continue;
        const y = K.H(x, z) + .025;
        if (!library.place(spec.key, x, y, z, yaw, pitch, { source: 'addition', street: street.id })) continue;
        K.rect(x, z, ...clearance, yaw, meta.size[1], y, .05, true);
        // Reserve the entire envelope once: take() refuses overlapping discs, so a chain of them would leave gaps.
        K.occ.take(x, z, reserveRadius);
        rec(spec.kind, x, z, yaw, { model: spec.key, street: street.id, footprint: [...meta.footprint] });
        placed++;
      }
    }
    result[spec.kind] = placed;
  }
  return result;
}
