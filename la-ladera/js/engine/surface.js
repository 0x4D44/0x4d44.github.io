// Ground classification (owner: A1): what the player is walking on, for footsteps, audio and effects.
// Pure data in, string out: no DOM, no three.js (runs under Node in tests).
//   kinds: asphalt concrete cobble dirt grass stairs tile wood carpet
//   indoors the room's `finish.floor` material name decides; outdoors the nearest street (its `surface`), a plaza, or bare terrain
const IN_TILE = /tile|ceramic|vinyl|marble|terrazzo|checker/i, IN_WOOD = /wood|pine|plank|parquet|laminate|timber/i, IN_CARPET = /rug|carpet|mat\b|fabric/i;

function segDist2(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
  let t = l2 > 1e-9 ? ((px - ax) * vx + (pz - az) * vz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (ax + vx * t), dz = pz - (az + vz * t);
  return dx * dx + dz * dz;
}

function inPoly(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a[1] > z) !== (b[1] > z) && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) c = !c;
  }
  return c;
}

/** Map a street/plaza `surface` word onto our kinds. */
export function normalizeSurface(s) {
  switch (String(s ?? '').toLowerCase()) {
    case 'asphalt': case 'road': return 'asphalt';
    case 'cobble': case 'cobbles': case 'stone': case 'pavers': return 'cobble';
    case 'dirt': case 'earth': case 'gravel': case 'path': return 'dirt';
    case 'grass': return 'grass';
    case 'stairs': case 'stair': case 'steps': return 'stairs';
    default: return 'concrete';
  }
}

/** Material name of a room floor -> kind. */
export function indoorKind(material) {
  const m = String(material ?? '');
  if (IN_CARPET.test(m)) return 'carpet';
  if (IN_WOOD.test(m)) return 'wood';
  if (IN_TILE.test(m)) return 'tile';
  return 'concrete';
}

export class SurfaceMap {
  /** @param plan the world plan ({ streets:[{pts,width,surface}], plazas:[{poly,kind}] }) - optional, may be filled later */
  constructor(plan = null) { this.setPlan(plan); }

  setPlan(plan) {
    this.streets = (plan?.streets ?? []).filter((s) => s.pts?.length >= 2).map((s) => {
      const pts = s.pts, xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]), m = s.width / 2 + 0.35;
      return { pts, r2: m * m, m, surface: normalizeSurface(s.surface ?? (s.kind === 'stair' ? 'stairs' : 'concrete')), bb: [Math.min(...xs) - m, Math.min(...zs) - m, Math.max(...xs) + m, Math.max(...zs) + m] };
    });
    this.plazas = (plan?.plazas ?? []).filter((p) => p.poly?.length >= 3).map((p) => ({ poly: p.poly, surface: p.kind === 'yard' ? 'dirt' : p.kind === 'plaza' ? 'cobble' : 'concrete' }));
    return this;
  }

  /** Outdoor surface at (x,z). Stairs and streets win over plazas, which win over bare terrain. */
  outdoor(x, z) {
    let best = null, bd = Infinity;
    for (const s of this.streets) {
      if (x < s.bb[0] || x > s.bb[2] || z < s.bb[1] || z > s.bb[3]) continue;
      for (let i = 1; i < s.pts.length; i++) {
        const d = segDist2(x, z, s.pts[i - 1][0], s.pts[i - 1][1], s.pts[i][0], s.pts[i][1]);
        if (d < s.r2 && d < bd) { bd = d; best = s.surface; }
      }
    }
    if (best) return best;
    for (const p of this.plazas) if (inPoly(p.poly, x, z)) return p.surface;
    return 'dirt';
  }

  /**
   * @param o { indoors, room (Room with finish.floor), onFloorPatch (true when a collider floor, not terrain, is underfoot) }
   */
  kind(x, z, o = {}) {
    if (o.indoors) return indoorKind(o.room?.finish?.floor);
    if (o.onFloorPatch) return 'concrete';                      // terraces, roofs, balconies: poured slabs
    return this.outdoor(x, z);
  }
}
