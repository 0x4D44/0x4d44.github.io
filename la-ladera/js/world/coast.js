// THE COAST (A5): the beach and the sea south of the plot (dev/FEATURE-BEACH.md). PURE DATA: no THREE, no DOM, runs under node.
//
//   createCoast({ seed, edge }) -> coast
//     edge(x)                    the plot's ground at its south edge (z = Z0): the deck rises from it, so the plot and the beach meet without a step
//     coast.heightAt(x, z)       the ground for z >= Z0: deck, sea wall, accesses, sand, foreshore, seabed (the physics ground; the plan hands over to it)
//     coast.meshHeight(x, z)     the same without the wall ramp and the accesses (the mesh draws those as parts of their own)
//     coast.ground(x, z, land)   the far ground: the beach profile sheared along the curving shore, `land` (the old far land) inland of it, headlands on top
//     coast.depthAt(x, z)        metres of water over the ground (negative on land), still water
//     coast.surfaceAt(x, z)      'deck' | 'stairs' | 'ramp' | 'sand' | 'wetsand' | 'shallow' | 'wade' | 'swim'  (kinds the SurfaceMap and the audio know)
//     coast.limit(x, z)          { x, z, soft, hard } where the player may go (soft = 0..1 resistance, hard = true when clamped at the sea's end)
//     coast.rails / .accesses / .nav / .lanes / .climbs / .pois / .areas / .landmarks   data for the walls, the mesh, the people and the map
// The profile is a straight shore (z = SHORE0) between the walls (|x| <= BAY_X) and then curves south, so the plot sits at the middle of a bay whose horns point
// away from it; the seabed is that profile SHEARED along the curve. Sea level is SEA on the plot's datum.
import { clamp, lerp, ss, vnoise } from './geom.js';

export const SEA = -1.2;                 // sea level, plot datum
export const Z0 = 100;                   // the plot's south edge: plan.heightAt hands over to the coast here
export const XW = 99.4;                  // the east and west walls (the player stays inside them)
export const DECK = 0.2, DECK_Z = 108, WALL_Z = 108.8;      // the promenade deck (z Z0..DECK_Z), the sea wall (DECK_Z..WALL_Z, a 0.75 m drop)
export const SHORE0 = 144.2, BAY_X = 100, SHEAR = 0.0035;    // the waterline at the middle of the bay, where it starts to curve, and by how much (z grows with (|x| - BAY_X)^2)
export const SOFT_Z = 204, BUOY_Z = 210, STOP_Z = 220, KERNEL_Z = 221;   // resistance starts, the buoy line, the player's hard stop, the physics safety wall

// the seabed under a straight shore (z' -> y): sea wall toe, dry sand, foreshore 1:16, shallows 1:22, swim zone 1:25, the soft and the hard stop, the open bay
const KN = [[WALL_Z, -0.55], [138, -0.80], [152, -1.70], [190, -3.40], [210, -4.20], [220, -4.60], [500, -15.0]];
const DEEP_SLOPE = (KN[6][1] - KN[5][1]) / (KN[6][0] - KN[5][0]);
export const TOE = KN[0][1];
function bed(zp) {
  if (zp <= KN[0][0]) return KN[0][1];
  for (let i = 1; i < KN.length; i++) if (zp <= KN[i][0]) { const a = KN[i - 1], b = KN[i]; return a[1] + (b[1] - a[1]) * ((zp - a[0]) / (b[0] - a[0])); }
  return Math.max(-40, KN[6][1] + DEEP_SLOPE * (zp - 500));
}

// five stairs (5 steps of 0.154 m, 0.28 m deep: the oracle's flight gradient 0.55) and one ramp (1:12). The axis stair, at the Paseo's x, is the grand one.
export const STAIR_FLIGHT = [DECK_Z, DECK_Z + 1.4];
export const STAIRS = Object.freeze([
  { id: 'S17', x: -90, w: 3 }, { id: 'S18', x: -56, w: 3 }, { id: 'S19', x: -6.5, w: 10 }, { id: 'S20', x: 30, w: 3 }, { id: 'S21', x: 70, w: 3 },
].map((s) => Object.freeze({ kind: 'stair', ...s })));
export const RAMP = Object.freeze({ kind: 'ramp', id: 'S22', x: 2.2, w: 2.2, slope: 1 / 12 });
const ACCESSES = [...STAIRS, RAMP];
const SIDE = 0.35;                                           // the soft shoulder where a corridor meets the sea wall

const FOOT = bed(STAIR_FLIGHT[1]);                         // the stair's foot lies on the sand
const RAMP_END = (() => {                                  // where the 1:12 ramp, falling from the deck edge, meets the sand
  let z = DECK_Z; while (z < 140 && DECK - RAMP.slope * (z - DECK_Z) > bed(z)) z += 0.01;
  return +z.toFixed(2);
})();
export const RAMP_END_Z = RAMP_END;

// the headlands that cap the bay's horns: x, z, radius of the foot, height they add
const HEADLANDS = Object.freeze([{ id: 'oeste', x: -300, z: 330, r: 110, h: 34 }, { id: 'este', x: 330, z: 370, r: 100, h: 42 }]);
const CROWN = 0.22;                                          // the headland's summit is level out to this share of its radius (a church and a lighthouse stand on a pad, not on a point)
const bump = (d, r) => { if (d >= r) return 0; const t = Math.max(CROWN, d / r), k = 1 - t * t; return k * k; };

/** The beach's gate: the plot's south wall (terrain.js buildPerimeter) stays shut until the beach is built; whoever builds it opens it (physics: the `on` flag of the walls with this id). */
export const GATE = 'coast.gate';
export function setGate(physics, open) { let n = 0; for (const w of physics.walls) if (w.id === GATE) { w.on = !open; n++; } return n; }

/** The sea wall's rail as physics walls (a wall blocks when its top is over 0.4 m above the walker's feet): the deck's edge is closed except at the accesses. Called by the page and by the headless build. */
export function coastColliders(physics, coast) {
  for (const r of coast.rails) physics.addWall({ x1: r.x1, z1: r.z, x2: r.x2, z2: r.z, t: 0.06, y0: DECK, y1: DECK + 0.9, id: 'coast.rail' });
  return coast.rails.length;
}

function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createCoast({ seed = 1, edge = () => 0.1 } = {}) {
  const sd = seed | 0;
  const shoreZ = (x) => { const e = Math.max(0, Math.abs(x) - BAY_X); return SHORE0 + SHEAR * e * e; };
  const shift = (x) => shoreZ(x) - SHORE0;
  const dunes = (x, zp) => 0.06 * vnoise(x, zp, 8, sd + 71) * ss(118, 130, zp) * (1 - ss(130, 137, zp));
  const sandy = (x, z) => { const zp = z - shift(x); return bed(zp) + dunes(x, zp); };
  const deckAt = (x, z) => lerp(edge(clamp(x, -BAY_X, BAY_X)), DECK, ss(Z0, Z0 + 3, z));
  const accessAt = (x) => { for (const a of ACCESSES) if (Math.abs(x - a.x) <= a.w / 2 + SIDE) return a; return null; };

  /** The mesh's ground: deck, then the sheared sand and sea (the wall and the accesses are drawn as parts of their own). */
  const meshHeight = (x, z) => (z < DECK_Z ? deckAt(x, z) : sandy(x, z));

  const heightAt = (x, z) => {
    if (z <= Z0) return edge(clamp(x, -BAY_X, BAY_X));
    if (z < DECK_Z) return deckAt(x, z);
    let h = z < WALL_Z ? lerp(DECK, TOE, (z - DECK_Z) / (WALL_Z - DECK_Z)) : sandy(x, z);
    const a = accessAt(x);
    if (a) {
      const w = 1 - ss(a.w / 2, a.w / 2 + SIDE, Math.abs(x - a.x));
      if (a.kind === 'stair') { if (z < STAIR_FLIGHT[1]) h = lerp(h, lerp(DECK, FOOT, (z - STAIR_FLIGHT[0]) / (STAIR_FLIGHT[1] - STAIR_FLIGHT[0])), w); }
      else if (z < RAMP_END) h = lerp(h, Math.max(h, DECK - a.slope * (z - DECK_Z)), w);
    }
    return h;
  };

  const headland = (x, z) => { let h = 0; for (const k of HEADLANDS) h += k.h * bump(Math.hypot(x - k.x, z - k.z), k.r); return h; };
  /** The far ground south of the plot: the sheared beach profile at the waterline, the old far land inland of it, the headlands on top. */
  const ground = (x, z, land) => {
    const ax = Math.abs(x), landW = ss(BAY_X, BAY_X + 8, ax) * ss(0, 40, shoreZ(x) - z);
    const prof = z <= Z0 ? edge(clamp(x, -BAY_X, BAY_X)) : heightAt(x, z);
    return lerp(prof, land(x, z), landW) + headland(x, z);
  };

  const depthAt = (x, z) => SEA - heightAt(x, z);
  const surfaceAt = (x, z) => {
    if (z < Z0) return null;
    if (z < DECK_Z) return 'deck';
    if (z < WALL_Z) { const a = accessAt(x); return a ? (a.kind === 'ramp' ? 'ramp' : 'stairs') : 'deck'; }
    const a = accessAt(x);
    if (a && a.kind === 'ramp' && z < RAMP_END && Math.abs(x - a.x) <= a.w / 2) return 'ramp';
    const d = depthAt(x, z);
    if (d < -0.14) return 'sand';
    if (d <= 0) return 'wetsand';
    if (d < 0.45) return 'shallow';
    if (d < 1.3) return 'wade';
    return 'swim';
  };

  /** How much the sea holds the player back, 0..1, from SOFT_Z (speed x (1 - soft x 0.8)) to the hard stop. */
  const softAt = (z) => ss(SOFT_Z, STOP_Z - 5, z);
  const limit = (x, z) => {
    const out = { x: clamp(x, -(XW - 0.4), XW - 0.4), z, soft: 0, hard: false };
    if (z > Z0) { out.soft = softAt(z); if (z > STOP_Z - 0.5) { out.z = STOP_Z - 0.5; out.hard = true; } }
    if (out.x !== x) out.hard = true;
    return out;
  };

  // ---- the sea wall's rail: a wall of 0.9 m along the deck's edge, open where an access comes up (physics.js: a wall blocks when its top is over 0.4 m above the feet)
  const rails = (() => {
    const gaps = ACCESSES.map((a) => [a.x - a.w / 2 - 0.1, a.x + a.w / 2 + 0.1]).sort((p, q) => p[0] - q[0]), out = [];
    let x = -XW;
    for (const [g0, g1] of gaps) { if (g0 > x) out.push({ x1: x, x2: g0, z: DECK_Z - 0.08 }); x = Math.max(x, g1); }
    if (x < XW) out.push({ x1: x, x2: XW, z: DECK_Z - 0.08 });
    return out;
  })();

  // ---- people's data (dev/FEATURE-BEACH.md 1.4, 1.6): kept in plan.coast until the people phase merges it into plan.pois and plan.nav
  const R = mulberry(sd * 7 + 1331);
  const jit = (v, m) => v + (R() - 0.5) * 2 * m;
  const pois = [], addPoi = (kind, x, z, extra = {}) => pois.push({ id: `coast.${kind}.${pois.filter((p) => p.kind === kind).length}`, kind, x: +x.toFixed(2), y: +heightAt(x, z).toFixed(2), z: +z.toFixed(2), ry: 0, tags: ['coast'], ...extra });
  for (const z of [119, 125]) for (const x of [...Array.from({ length: 6 }, (_, i) => -34 + i * 6), ...Array.from({ length: 6 }, (_, i) => 52 + i * 6)]) addPoi('lie', jit(x, 0.4), jit(z, 0.5), { ry: Math.PI });   // 24 loungers and towels, facing the sea
  for (let i = 0; i < 8; i++) { const x = -84 + i * 24, z = SHORE0 + 1.2 + (i % 3) * 2.6; addPoi('wade', x, z); }
  for (let i = 0; i < 6; i++) addPoi('swim', -70 + i * 28, SHORE0 + 2.5);
  for (let i = 0; i < 6; i++) addPoi('fish', -6.5 + (i % 2 ? 1.2 : -1.2), 130 + i * 10);     // the pier (phase 2) is at x = -6.5
  for (let i = 0; i < 4; i++) addPoi('volley', -66 + (i % 2) * 8, 123 + Math.floor(i / 2) * 6);
  for (const x of [-80, -50, -22, 14, 40, 76]) addPoi('vend', x, 113.5, { ry: Math.PI });
  addPoi('vend', -60, 140); addPoi('vend', 60, 140);                                               // two walking vendors' beats
  addPoi('watch', 6, 128.5); addPoi('watch', 6, 118);
  for (let i = 0; i < 6; i++) addPoi('moor', -88 + i * 3, 131.5);
  for (let i = 0; i < 6; i++) addPoi('launch', -88 + i * 3, SHORE0 - 4);
  addPoi('raft', 34, 185);

  const areas = [
    { id: 'playa', name: 'La Playa', en: 'The Beach', poly: [[-XW, DECK_Z], [XW, DECK_Z], [XW, SHORE0 + 6], [-XW, SHORE0 + 6]] },
    { id: 'mar', name: 'El Mar', en: 'The Sea', poly: [[-XW, SHORE0 + 6], [XW, SHORE0 + 6], [XW, STOP_Z], [-XW, STOP_Z]] },
  ];
  const landmarks = [
    { id: 'malecon', name: 'Malecón de El Plan', en: 'El Plan Promenade', kind: 'promenade', x: 20, z: 104, radius: 12 },
    { id: 'muelle', name: 'Muelle de los Pescadores', en: 'Fishermen\'s Pier', kind: 'pier', x: -6.5, z: 160, radius: 12 },
    { id: 'playa', name: 'La Playa', en: 'The Beach', kind: 'beach', x: 40, z: 126, radius: 18 },
    { id: 'salvavidas', name: 'Torre del Salvavidas', en: 'Lifeguard Tower', kind: 'tower', x: 6, z: 128, radius: 6 },
    { id: 'balsa', name: 'La Balsa', en: 'The Raft', kind: 'raft', x: 34, z: 185, radius: 8 },
  ].map((l) => ({ ...l, y: +Math.max(heightAt(l.x, l.z), SEA).toFixed(2) }));

  // ---- the walking graph the beach adds (NOT in plan.nav yet): a deck chain, the accesses, a 7 m grid of sand, three wade lines at depth <= 0.5 m
  const nav = (() => {
    const nodes = [], edges = [], at = new Map(), key = (x, z) => `${x}|${z}`;
    const add = (x, z, kind) => { const k = key(x, z); if (at.has(k)) return at.get(k); const n = { id: 'c' + nodes.length, x: +x.toFixed(2), y: +heightAt(x, z).toFixed(2), z: +z.toFixed(2), kind }; nodes.push(n); at.set(k, n); return n; };
    const link = (a, b) => { if (a && b && a !== b) edges.push([a.id, b.id]); };
    const deckX = Array.from({ length: 49 }, (_, i) => -96 + i * 4);
    const deck = deckX.map((x) => add(x, 104, 'deck'));
    for (let i = 1; i < deck.length; i++) link(deck[i - 1], deck[i]);
    const sandX = Array.from({ length: 27 }, (_, i) => -91 + i * 7), rows = [114.5, 121.5, 128.5, 135.5, 142.5];
    const grid = rows.map((z) => sandX.map((x) => add(x, z, 'sand')));
    for (let r = 0; r < rows.length; r++) for (let c = 0; c < sandX.length; c++) {
      if (c + 1 < sandX.length) link(grid[r][c], grid[r][c + 1]);
      if (r + 1 < rows.length) { link(grid[r][c], grid[r + 1][c]); if (c + 1 < sandX.length) link(grid[r][c], grid[r + 1][c + 1]); if (c > 0) link(grid[r][c], grid[r + 1][c - 1]); }
    }
    const wadeRows = [146, 148.8, 151.4].map((z) => sandX.map((x) => add(x, z, 'wade')));
    for (let c = 0; c < sandX.length; c++) { link(grid[rows.length - 1][c], wadeRows[0][c]); for (let r = 0; r + 1 < wadeRows.length; r++) link(wadeRows[r][c], wadeRows[r + 1][c]); if (c > 0) for (const wr of wadeRows) link(wr[c - 1], wr[c]); }
    const nearest = (list, x) => list.reduce((b, n) => (Math.abs(n.x - x) < Math.abs(b.x - x) ? n : b));
    for (const a of ACCESSES) {
      const top = add(a.x, 107, 'stair'), mid = add(a.x, a.kind === 'ramp' ? 111 : 108.7, 'stair'), foot = add(a.x, a.kind === 'ramp' ? RAMP_END + 1.2 : STAIR_FLIGHT[1] + 1.1, 'stair');
      link(nearest(deck, a.x), top); link(top, mid); link(mid, foot);
      link(foot, nearest(grid[0], a.x));
      if (a.kind === 'stair' && a.w > 5) { const lo = add(a.x - 3, 107, 'stair'), hi = add(a.x + 3, 107, 'stair'); link(lo, top); link(top, hi); link(lo, nearest(deck, a.x - 3)); link(hi, nearest(deck, a.x + 3)); }
    }
    return { nodes, edges };
  })();

  // swim, paddle and ride routes are polylines, not graph nodes (the street people never wade out); phase 3 fills the courses in
  const lanes = [
    { id: 'swim.0', kind: 'swim', pts: [[-70, SHORE0 + 3], [-70, 200], [-20, 205], [30, 200], [30, SHORE0 + 3]] },
    { id: 'swim.raft', kind: 'swim', pts: [[10, SHORE0 + 3], [34, 176], [34, 183]] },
  ];
  const climbs = [{ id: 'raft.ladder', x: 34, z: 182.8, y: DECK - 1.1, top: -0.9, r: 0.8 }];

  return Object.freeze({
    seed: sd, sea: SEA, z0: Z0, shoreZ, shift, heightAt, meshHeight, ground, headland, depthAt, surfaceAt, softAt, limit, bed, sandy, deckAt,
    headlands: HEADLANDS, accesses: ACCESSES, stairs: STAIRS, ramp: RAMP, rampEnd: RAMP_END, stairFoot: FOOT, accessAt, rails,
    pois, areas, landmarks, nav, lanes, climbs,
    // the mesh and the far ground read these
    stats: { rails: rails.length, nodes: nav.nodes.length, edges: nav.edges.length, pois: pois.length },
  });
}
