// Ground classification (owner: A1): what the player is walking on, for footsteps, audio and effects.
// Pure data in, string out: no DOM, no three.js (runs under Node in tests).
//   kinds: asphalt concrete cobble dirt grass stairs tile wood carpet, and on the beach sand wetsand shallow wade jetty (the audio's footstep surfaces: audio/foley.js SURFACES)
//   indoors the room's `finish.floor` material name decides; south of the plot's edge the coast does (plan.coast.surfaceAt, with the feet's height: the pier's planks are 'jetty' only up on the deck);
//   outdoors elsewhere the nearest street (its `surface`), a plaza, or bare terrain
import { Z0, BAY_X } from '../world/coast.js';
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

/**
 * plan.coast.surfaceAt's words -> the audio's footstep surfaces. The promenade is paved (cobble, what normalizeSurface makes of 'pavers'); a ramp is poured; the pier's and the raft's planks are
 * 'jetty'; 'swim' is the deepest answer a walker's feet can get (below it the player swims and there are no footsteps), so it sounds as the knee-deep water does. 'rock' is never produced.
 */
export const COAST_KIND = Object.freeze({ deck: 'cobble', stairs: 'stairs', ramp: 'concrete', jetty: 'jetty', sand: 'sand', wetsand: 'wetsand', shallow: 'shallow', wade: 'wade', swim: 'wade' });

export class SurfaceMap {
  /** @param plan the world plan ({ streets:[{pts,width,surface}], plazas:[{poly,kind}], coast }) - optional, may be filled later */
  constructor(plan = null) { this.setPlan(plan); }

  setPlan(plan) {
    this.plan = plan ?? null;
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
   * The beach's surface at (x, z) as an audio footstep surface, for feet at height `y` (optional): inside the bay's walls and south of the plot's edge the coast answers (promenade, stairs, ramp, sand,
   * wet sand, the shallows, the pier and the raft). null elsewhere, and where there is no coast (a plan without one, or `?skip=coast`, where nobody gets there).
   */
  coast(x, z, y) {
    const C = this.plan?.coast;
    if (!C || !(z > Z0) || !(Math.abs(x) <= BAY_X)) return null;
    return COAST_KIND[C.surfaceAt(x, z, y)] ?? null;
  }

  /**
   * @param o { indoors, room (Room with finish.floor), onFloorPatch (true when a collider floor, not terrain, is underfoot), y (the feet's height: only the pier's and the raft's planks need it) }
   */
  kind(x, z, o = {}) {
    if (o.indoors) return indoorKind(o.room?.finish?.floor);
    const c = this.coast(x, z, o.y);
    if (c) return c;                                            // the promenade, the sand, the shallows, the planks (the pier's deck is a floor patch too: the coast knows it better)
    if (o.onFloorPatch) return 'concrete';                      // terraces, roofs, balconies: poured slabs
    return this.outdoor(x, z);
  }
}
