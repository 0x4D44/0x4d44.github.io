// VISTA (A5): the city the plot looks onto. Boxes for the houses of the far land (the valley to the south, the opposite hillside, the flanks), a church,
// four towers, a TV mast on the northern ridge, and a glow point for every lit window and every beacon (ctx.glow extras, one Points draw call in all). Part of the houses stand under a
// pitched roof (roofHat / hatFaces: gable, hip or shed) and half the roof huts of the flat ones are set-back rooms (houseParts), so the far hills are not one box repeated (R1-D20).
// vistaSites() / farHouses() / vistaLights() are pure functions of the plan: they run under node and are tested there. buildVista() only draws them.
// Group world.vista: no shadows, a handful of draw calls (one per material).
// The modelled vista kit (vista-kit.js + vista-plan.js, Codex's GLB terraces, instanced with distance LODs) is built BEFORE this file: where it stands, farHouses keeps off it (kitZones),
// and where the kit is absent (headless, ?vista=0, a failed load) every row of this file is built as before.
import { ss, vnoise, hash2, project, gapBetween } from './geom.js';
import { HALF } from './field.js';
import { urbanDensity, makeFarHeight } from './periphery.js';
import { SEA, Z0 as COAST_Z0 } from './coast.js';

const h01 = (i, j, s) => (hash2(i, j, s) + 1) / 2;
const farOf = (plan) => plan._far ?? (plan._far = makeFarHeight(plan));
const slopeAt = (far, x, z) => { const e = 3, gx = (far(x + e, z) - far(x - e, z)) / (2 * e), gz = (far(x, z + e) - far(x, z - e)) / (2 * e); return { gx, gz, g: Math.hypot(gx, gz) }; };

/** The nearest ground to (x, z) that is gentle enough for a big building: rings of 6 m up to 70 m. */
function flatNear(far, x, z, gmax = 0.1) {
  for (let r = 0; r <= 70; r += 6) {
    const n = r === 0 ? 1 : Math.round(r / 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (slopeAt(far, px, pz).g <= gmax && slopeAt(far, px + 14, pz).g <= gmax * 1.6 && slopeAt(far, px, pz + 14).g <= gmax * 1.6) return [px, pz];
    }
  }
  return [x, z];
}

/** Where the landmarks stand: the church on the west headland's crown, four towers on the flanks that frame the bay, the lighthouse on the east headland's crown, the mast. Every one has { x, z, y } = the ground there. */
export function vistaSites(plan) {
  const far = farOf(plan), faceOrigin = (x, z) => Math.atan2(-x, -z), hl = plan.coast.headlands;
  let mast = null;                                                    // the highest ground of the northern ridge (300 m off), leaning to the middle so the barrio sees it
  for (let z = -310; z <= -250; z += 10) for (let x = -280; x <= 280; x += 10) {
    const y = far(x, z), score = y - 0.06 * Math.abs(x);
    if (!mast || score > mast.score) mast = { x, z, y, score };
  }
  const west = hl.find((k) => k.x < 0), east = hl.find((k) => k.x > 0);
  const [cx, cz] = flatNear(far, west.x, west.z), church = { x: cx, z: cz, y: far(cx, cz), ry: faceOrigin(cx, cz), r: 27 };
  const [lx, lz] = flatNear(far, east.x, east.z), lighthouse = { x: lx, z: lz, y: far(lx, lz), h: 24, r: 22 };
  const towers = [[240, 40, 14, 19, 14], [-235, 66, 18, 22, 15], [205, 118, 12, 18, 14], [-200, 132, 15, 20, 16]].map(([tx, tz, floors, w, d]) => {
    const [x, z] = flatNear(far, tx, tz);
    return { x, z, y: far(x, z), floors, w, d, h: floors * 3, ry: faceOrigin(x, z), r: 30 };
  });
  return { mast: { x: mast.x, z: mast.z, y: mast.y, h: 62 }, church, towers, lighthouse };
}

const WALLS = [[0.86, 0.78, 0.62], [0.82, 0.52, 0.38], [0.58, 0.64, 0.72], [0.78, 0.72, 0.82], [0.64, 0.72, 0.56], [0.86, 0.62, 0.64], [0.72, 0.70, 0.66], [0.92, 0.86, 0.72],
  [0.50, 0.58, 0.78], [0.84, 0.68, 0.38], [0.70, 0.40, 0.30], [0.62, 0.62, 0.60],        // paint, raw brick and bare concrete: what a hillside barrio is made of
  [0.28, 0.46, 0.74], [0.30, 0.62, 0.46], [0.92, 0.62, 0.20], [0.82, 0.30, 0.34], [0.94, 0.84, 0.30], [0.56, 0.36, 0.66]];   // and the bolder coats of the near streets: blue, green, orange, red, yellow, violet
export const ROOFS = [['roof_tile_clay', [0.95, 0.80, 0.72]], ['corrugated_zinc', [0.80, 0.82, 0.84]], ['concrete_bare', [0.62, 0.62, 0.60]], ['corrugated_zinc', [0.70, 0.46, 0.38]], ['concrete_bare', [0.35, 0.50, 0.72]]];

/**
 * The houses of the far land (R1-D15: "dice thrown on a lawn"): ROWS of houses that follow the contours, wall to wall, the way a hillside barrio is built. A row starts where
 * urbanDensity says the land is built up (thinned by a slow "quarter" noise) and runs along the contour with the fronts looking downhill, each house touching the last
 * (a party wall; a step forward or back, up to 3 m, keeps each on the contour, the way a terrace steps), their floors varying by one or two along the row; it ends where the land is
 * too steep, too thin, taken, bent away from the contour, or near the rim, the road or a landmark. A row of fewer
 * than three houses is dropped, so no block stands alone. Each row claims its footprints and a lane 4 m wide in front, so the next row keeps a street between. Each house:
 * { x, z, y (lowest ground under it), w, d, h, floors, ry, wall, roof, tone, i, j (hash keys), row, k (place in the row), party: { left, right } }.
 * `density` is the built-up map (the tests swap in a flat 1 to prove the rim and road rules hold wherever the map says "build").
 */
export const LANE = 4;                                              // the street in front of a row, m
const REAR = 0.6;                                                   // the strip kept free behind a row, m
export const DRY = 1.8;                                               // a far house stands at least this far above the sea (the bay's shore, coast.js)
const SEEDING = 0.62;                                               // how often a lattice cell of built-up land starts a stack of terraces (up to 2.4 times that within 40 m of the rim, where the eye lands)
export function farHouses(plan, { cell = 15, reach = 700, max = 2600, margin = 12, roadClear = 16, dry = DRY, density = urbanDensity, taken = [] } = {}) {
  const far = farOf(plan), seed = plan.seed, sites = vistaSites(plan), keep = [sites.church, sites.lighthouse, ...sites.towers], road = far.road, out = [], n = Math.ceil(reach / cell);
  const placed = new Map(), BK = 32, bk = (a, b) => a * 4096 + b;      // the ground each accepted house keeps for itself, in 32 m buckets
  const allowed = (x, z) => {
    if (x * x + z * z > reach * reach || Math.max(Math.abs(x) - HALF, Math.abs(z) - HALF) < margin) return false;
    if (road && project(road.pts, road.cum, x, z).d < roadClear) return false;                       // the road runs along the promenade and up the east flank now, so its clearance holds everywhere
    if (z > COAST_Z0 - 3 && far(x, z) < SEA + dry) return false;                                   // the beach, the sea and the foot of the headlands: a house stands on dry ground
    return !keep.some((s) => Math.hypot(s.x - x, s.z - z) < s.r);
  };
  const corners = (x, z, w, d, c, s) => [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]].map(([u, v]) => [x + (u * (w / 2 - 0.4) * c + v * (d / 2 - 0.4) * s), z + (-u * (w / 2 - 0.4) * s + v * (d / 2 - 0.4) * c)]);
  const zone = (x, z, w, d, c, s) => [[-w / 2, -d / 2 - REAR], [w / 2, -d / 2 - REAR], [w / 2, d / 2 + LANE], [-w / 2, d / 2 + LANE]].map(([u, v]) => [x + u * c + v * s, z - u * s + v * c]);   // the footprint, a strip behind it and the lane in front
  const clash = (poly, x, z) => {
    for (let a = Math.floor((x - 24) / BK); a <= Math.floor((x + 24) / BK); a++) for (let b = Math.floor((z - 24) / BK); b <= Math.floor((z + 24) / BK); b++) {
      for (const q of placed.get(bk(a, b)) ?? []) if (gapBetween(poly, q) <= 0) return true;
    }
    return false;
  };
  const claim = (h) => {
    const key = bk(Math.floor(h.x / BK), Math.floor(h.z / BK)), list = placed.get(key) ?? placed.set(key, []).get(key);
    list.push(zone(h.x, h.z, h.w, h.d, Math.cos(h.ry), Math.sin(h.ry)));
  };
  for (const q of taken) {                                            // ground that something else was built on first (the vista kit's terraces, see kitZones): no row of ours touches it
    const cx = q.reduce((s, p) => s + p[0], 0) / q.length, cz = q.reduce((s, p) => s + p[1], 0) / q.length, key = bk(Math.floor(cx / BK), Math.floor(cz / BK));
    (placed.get(key) ?? placed.set(key, []).get(key)).push(q);
  }
  /** One row from (x0, z0), in the frame ry0 (null: the front looks downhill there) and the depth d0 (null: its own): its houses, or null when fewer than three would stand. (i, j) key its hashes. */
  const trace = (i, j, x0, z0, ry0, d0) => {
    const dens = density(plan, x0, z0), H0 = far(x0, z0), want = 3 + Math.floor(h01(i, j, seed + 112) * 8), depth = d0 ?? 6.5 + 2.5 * h01(i, j, seed + 113), base = 1 + h01(i, j, seed + 114) ** 1.6 * 3.6, row = [];
    let p = [x0, z0], prev = null, ry = ry0;
    for (let k = 0; k < want; k++) {
      const w = 5.5 + 5 * h01(i * 64 + k, j, seed + 104);
      if (ry == null) { const s0 = slopeAt(far, x0, z0); ry = s0.g > 0.03 ? Math.atan2(-s0.gx, -s0.gz) : Math.atan2(-x0, -z0); }          // the front of the row looks downhill; every house of it keeps that frame
      const c = Math.cos(ry), s = Math.sin(ry);
      if (prev) {
        p = [prev.x + c * (prev.w + w) / 2, prev.z - s * (prev.w + w) / 2];                              // along the contour, wall to wall with the last house
        const fall = -(slopeAt(far, p[0], p[1]).gx * s + slopeAt(far, p[0], p[1]).gz * c);              // how fast the ground drops towards the front
        if (fall > 0.03) { const m = Math.max(-3, Math.min(3, (far(p[0], p[1]) - H0) / fall)); p = [p[0] + s * m, p[1] + c * m]; }   // a step forward or back keeps the party wall and the contour
        if (Math.abs(far(p[0], p[1]) - H0) > 2) break;                                                   // the contour has bent away from the row
      }
      const [x, z] = p, { g } = slopeAt(far, x, z);
      if (g > 0.65 || !allowed(x, z) || !(density(plan, x, z) > 0.04)) break;
      if (corners(x, z, w, depth, c, s).some(([qx, qz]) => !allowed(qx, qz)) || clash(zone(x, z, w, depth, c, s), x, z)) break;
      let lo = Infinity;
      for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) lo = Math.min(lo, far(x + (u * w * c + v * depth * s) / 2, z + (-u * w * s + v * depth * c) / 2));
      const near = Math.max(Math.abs(x), Math.abs(z)) - HALF < 120;                                                              // the first streets of the far hillside are two storeys at least
      const floors = Math.max(near ? 2 : 1, Math.min(6, Math.round(base + (h01(i * 64 + k, j, seed + 106) - 0.5) * 2.6 + (dens > 0.5 && h01(i * 64 + k, j, seed + 107) > 0.8 ? 1 : 0))));
      row.push(prev = { x, z, y: lo, w, d: depth, h: 2.7 * floors + 0.5, floors, ry, wall: Math.floor(h01(i * 64 + k, j, seed + 109) * WALLS.length) % WALLS.length, tone: 0.92 + 0.13 * h01(i * 64 + k, j, seed + 110), roof: Math.floor(h01(i * 64 + k, j, seed + 111) ** 1.3 * ROOFS.length) % ROOFS.length, i: i * 64 + k, j, row: `${i},${j}`, k, party: { left: k > 0, right: false } });
    }
    if (row.length < 3 || out.length + row.length > max) return null;                               // a block that would stand alone is not built
    row.forEach((h, k) => { h.party.right = k < row.length - 1; claim(h); });
    out.push(...row);
    return row;
  };
  for (let j = -n; j < n && out.length < max; j++) for (let i = -n; i < n && out.length < max; i++) {
    const cx = (i + 0.5) * cell, cz = (j + 0.5) * cell;
    if (cx * cx + cz * cz > reach * reach) continue;
    const dens = density(plan, cx, cz);
    if (!(dens > 0.04)) continue;
    const quarter = 0.35 + 0.65 * ss(-0.2, 0.5, vnoise(cx, cz, 70, seed + 9));
    const rimward = 1 - ss(40, 260, Math.max(Math.abs(cx), Math.abs(cz)) - HALF);                       // 1 at the rim, 0 from 260 m out
    if (h01(i, j, seed + 101) > Math.min(0.97, dens * quarter * SEEDING * (1 + 1.4 * rimward))) continue;
    let at = [cx + (h01(i, j, seed + 102) - 0.5) * cell * 0.5, cz + (h01(i, j, seed + 103) - 0.5) * cell * 0.5], ry0 = null, d0 = null;
    for (let t = 0, tiers = 1 + Math.floor(h01(i, j, seed + 115) * (3 + 2 * rimward)); t < tiers; t++) {            // terraces: the next row stands uphill of this one, its own lane between
      const row = trace(i, j + 1000 * t, at[0], at[1], ry0, d0);
      if (!row) break;
      const f = row[0], c = Math.cos(f.ry), s = Math.sin(f.ry), back = f.d + LANE + REAR + 0.5, slide = (h01(i, j + 1000 * t, seed + 116) - 0.5) * 14;
      at = [f.x - s * back + c * slide, f.z - c * back - s * slide]; ry0 = f.ry; d0 = f.d;
    }
  }
  return out;
}

/**
 * The ground the vista kit's terraces use (vista-plan.js planVista, drawn by vista-kit.js), as polygons for farHouses({ taken }): each kit house's footprint, 2 m of party wall either
 * side (the end of a terrace has its stair there), the strip behind and the lane in front. The kit is built first, so the rows of this file only fill the land it leaves.
 */
export function kitZones(planned) {
  return (planned?.houses ?? []).map((h) => {
    const c = Math.cos(h.ry), s = Math.sin(h.ry), w = h.width / 2 + 2, d = h.depth / 2;
    return [[-w, -d - REAR], [w, -d - REAR], [w, d + LANE], [-w, d + LANE]].map(([u, v]) => [h.x + u * c + v * s, h.z - u * s + v * c]);
  });
}

// What a far house wears beyond its plain box (R1-D03: windowless boxes at 40 to 150 m): windows on all four faces, a door or a shop shutter, and a roof with a tank,
// a stair hut, a parapet or the rebar of a floor not yet poured. All pure, in the house's own frame, so the node tests walk the very numbers buildVista draws.
export const FLOOR = 2.7, DETAIL = 200;                              // a floor of a far house is 2.7 m; beyond DETAIL m of the plot's rim a window is two pixels and a roof tank one (and the vista keeps its triangles)
const WIN = { w: 0.95, h: 1.2, sill: 0.95, lift: 0.2 }, gap = (h) => Math.max(Math.abs(h.x), Math.abs(h.z)) - HALF;

/** The four faces of a house: the outward normal (nx, nz), the unit vector to the right of a viewer facing it (tx, tz), the length of the face and its distance from the centre. Front first. */
export function houseFaces(h) {
  const c = Math.cos(h.ry), s = Math.sin(h.ry);
  return [{ nx: s, nz: c, len: h.w, half: h.d / 2 }, { nx: c, nz: -s, len: h.d, half: h.w / 2 }, { nx: -s, nz: -c, len: h.w, half: h.d / 2 }, { nx: -c, nz: s, len: h.d, half: h.w / 2 }].map((f) => ({ ...f, tx: f.nz, tz: -f.nx }));
}
const bays = (len) => Math.max(1, Math.round((len - 1.6) / 2.3));
const bayAt = (len, n, k) => ((k + 0.5) / n - 0.5) * (len - 0.8);      // the centre of bay k of n along a face of this length

/** The corners of a quad `w` x `h` centred on (x, y, z) that faces (nx, nz): counter-clockwise from the front, as MeshBuilder.quad wants them. */
export function windowCorners({ x, y, z, nx, nz, w, h }) {
  const tx = nz, tz = -nx, a = w / 2, b = h / 2;
  return [[x - tx * a, y - b, z - tz * a], [x + tx * a, y - b, z + tz * a], [x + tx * a, y + b, z + tz * a], [x - tx * a, y + b, z - tz * a]];
}

// The roofs of the far houses (R1-D20, round 6: "the houses are still flat-windowed boxes of identical form"). The flat slab is still the top of every house (the tests walk it); on part of the tile and zinc
// houses a pitched roof now stands on a plain lid instead: a gable with its front to the street, a hip, or a mono-pitch shed ("a una agua"). Pure and in the house's frame, like houseParts, so the node
// tests walk the very numbers buildVista draws. No random stream: a hash of the house.
export const HAT_FLOORS = 5;                                        // a block of six floors keeps its flat roof
export const HAT_REACH = 450;                                       // beyond this many metres from the plot's rim a roof is a pixel or two high, and the vista keeps its triangles
export const EAVE = 0.25;                                           // how far a pitched roof stands out over the front and the back wall, m
export const HAT_SHARE = { roof_tile_clay: 0.9, corrugated_zinc: 0.7 };   // the share of the houses of each roof material under a pitched roof (the concrete ones stay flat)
const SLOPE = { roof_tile_clay: [0.42, 0.56], corrugated_zinc: [0.2, 0.3] };   // the tangent of the pitch: 23 to 29 degrees for tile, 11 to 17 for zinc

/** The pitched roof of a far house, or null when it keeps its flat slab: { form: 'gable' | 'hip' | 'shed', rise (the ridge above the lid, m), lift (the lid above the wall's top: the slab's thickness within DETAIL, 0 beyond) }. */
export function roofHat(plan, h) {
  const g = gap(h), mat = ROOFS[h.roof][0], share = HAT_SHARE[mat];
  if (!share || g > HAT_REACH || h.floors > HAT_FLOORS) return null;
  const r = (a) => h01(h.i * 977 + a, h.j * 131 + 7, plan.seed + 340);
  if (r(1) >= share) return null;
  const tile = mat === 'roof_tile_clay', form = tile ? (r(2) < 0.62 ? 'gable' : 'hip') : (r(2) < 0.6 ? 'shed' : 'gable'), [t0, t1] = SLOPE[mat], tan = t0 + (t1 - t0) * r(3);
  const rise = form === 'shed' ? Math.min(1.7, (h.d + 2 * EAVE) * (0.12 + 0.12 * r(3))) : form === 'hip' ? Math.min(1.9, (Math.min(h.w, h.d) / 2 + EAVE) * tan) : Math.min(2.2, (h.w / 2) * tan);
  return { form, rise: +Math.max(0.8, rise).toFixed(3), lift: g > DETAIL ? 0 : 0.25 };      // (a low zinc roof on a narrow house is still 0.8 m at the ridge: under that it does not read)
}

/**
 * The faces of a house's pitched roof in world coordinates, standing on the lid at y = wall top + hat.lift: `roof` (in the roof's own material) and `wall` (a gable end or a back wall, in the house's paint). Three
 * corners are a triangle, four a quad, counter-clockwise from outside. Where a house shares a wall the roof stops at it (an open end stands out 15 cm), so two neighbours meet without a gap.
 */
export function hatFaces(h, hat) {
  const cs = Math.cos(h.ry), sn = Math.sin(h.ry), P = (x, y, z) => [h.x + x * cs + z * sn, y, h.z - x * sn + z * cs];
  const hw = h.w / 2, hd = h.d / 2, y = h.y + h.h + hat.lift, k = hat.rise, party = h.party ?? {};
  const xa = -hw - (party.left ? 0 : 0.15), xb = hw + (party.right ? 0 : 0.15), xm = (xa + xb) / 2, z0 = -hd - EAVE, z1 = hd + EAVE, roof = [], wall = [];
  if (hat.form === 'gable') {                                                                                         // ridge front to back
    roof.push([P(xa, y, z0), P(xa, y, z1), P(xm, y + k, z1), P(xm, y + k, z0)], [P(xb, y, z1), P(xb, y, z0), P(xm, y + k, z0), P(xm, y + k, z1)]);
    wall.push([P(-hw, y, hd), P(hw, y, hd), P(xm, y + k, hd)], [P(hw, y, -hd), P(-hw, y, -hd), P(xm, y + k, -hd)]);
  } else if (hat.form === 'shed') {                                                                                   // high at the back, falling to the front; the ends are closed in the roof's own sheet
    roof.push([P(xa, y, z1), P(xb, y, z1), P(xb, y + k, z0), P(xa, y + k, z0)], [P(xa, y, z0), P(xa, y, z1), P(xa, y + k, z0)], [P(xb, y, z1), P(xb, y, z0), P(xb, y + k, z0)]);
    wall.push([P(hw, y, -hd), P(-hw, y, -hd), P(-hw, y + k, -hd), P(hw, y + k, -hd)]);
  } else {                                                                                                            // hip: four slopes round a ridge along the longer side (a pyramid when the plan is nearly square)
    const W = xb - xa, D = z1 - z0, zm = (z0 + z1) / 2, rl = Math.abs(W - D) / 2;
    if (rl < 0.4) {
      const top = P(xm, y + k, zm);
      roof.push([P(xa, y, z1), P(xb, y, z1), top], [P(xb, y, z1), P(xb, y, z0), top], [P(xb, y, z0), P(xa, y, z0), top], [P(xa, y, z0), P(xa, y, z1), top]);
    } else if (W >= D) {
      const l = P(xm - rl, y + k, zm), r = P(xm + rl, y + k, zm);
      roof.push([P(xa, y, z1), P(xb, y, z1), r, l], [P(xb, y, z0), P(xa, y, z0), l, r], [P(xb, y, z1), P(xb, y, z0), r], [P(xa, y, z0), P(xa, y, z1), l]);
    } else {
      const f = P(xm, y + k, zm + rl), b = P(xm, y + k, zm - rl);
      roof.push([P(xa, y, z0), P(xa, y, z1), f, b], [P(xb, y, z1), P(xb, y, z0), b, f], [P(xa, y, z1), P(xb, y, z1), f], [P(xb, y, z0), P(xa, y, z0), b]);
    }
  }
  return { roof, wall };
}

/**
 * The windows, doors and roof items of one far house (empty beyond DETAIL m of the rim). windows/doors: { x, y, z, nx, nz, w, h, face, floor, col } (the centre of a quad 4 cm off the wall);
 * boxes: { mat, lx, lz, y, sx, sy, sz, col } in the house's frame, y the bottom; tanks: { lx, lz, y, r, h, col }. A window never sits lower than 25 cm above the ground outside it.
 * A house under a pitched roof (roofHat) has no roof items: a tank or a stair hut would stand in the air on a slope.
 */
export function houseParts(plan, h, far = farOf(plan)) {
  const out = { windows: [], doors: [], boxes: [], tanks: [] };
  if (gap(h) > DETAIL) return out;
  const seed = plan.seed, r = (a, b = 0) => h01(h.i * 977 + a, h.j * 131 + b, seed + 300), top = h.y + h.h, floor0 = h.y + WIN.lift;
  const cs = Math.cos(h.ry), sn = Math.sin(h.ry), at = (lx, lz) => [h.x + lx * cs + lz * sn, h.z - lx * sn + lz * cs];
  const glass = [0.4 + 0.14 * r(1), 0.48 + 0.14 * r(1), 0.6 + 0.14 * r(1)], front = houseFaces(h)[0], doorBay = Math.min(bays(front.len) - 1, Math.floor(r(2) * bays(front.len)));
  const shop = r(3) < 0.3, doorCol = shop ? [0.5, 0.52, 0.54] : [[0.34, 0.2, 0.12], [0.2, 0.3, 0.42], [0.16, 0.34, 0.26]][Math.floor(r(4) * 3) % 3];
  houseFaces(h).forEach((f, fi) => {
    if ((fi === 1 && h.party?.right) || (fi === 3 && h.party?.left)) return;                              // a party wall has no windows
    const n = bays(f.len), cx = h.x + f.nx * (f.half + 0.04), cz = h.z + f.nz * (f.half + 0.04);
    for (let fl = 0; fl < h.floors; fl++) for (let k = 0; k < n; k++) {
      const u = bayAt(f.len, n, k) + (r(10 + fi * 8 + k, fl) - 0.5) * 0.3, x = cx + f.tx * u, z = cz + f.tz * u;
      if (r(20 + fi * 8 + k, fl) < (fi === 2 ? 0.7 : 0.12)) continue;                                  // a shuttered or blank bay; the back, which faces the hill and not the plot, is plainer
      if (fi === 0 && fl === 0 && k === doorBay) {
        const dw = shop ? 2.2 : 1.0, dh = shop ? 2.2 : 2.05;
        if (Math.abs(far(x + f.nx * 0.5, z + f.nz * 0.5) - floor0) < 0.5) out.doors.push({ x, y: floor0 + dh / 2, z, nx: f.nx, nz: f.nz, w: dw, h: dh, face: fi, floor: 0, col: doorCol });
        continue;
      }
      const y = floor0 + fl * FLOOR + WIN.sill + WIN.h / 2;
      if (y - WIN.h / 2 < far(x + f.nx * 0.5, z + f.nz * 0.5) + 0.25) continue;                         // buried by the slope
      out.windows.push({ x, y, z, nx: f.nx, nz: f.nz, w: WIN.w, h: WIN.h, face: fi, floor: fl, col: glass });
    }
  });
  if (roofHat(plan, h)) return out;                                                                      // a pitched roof carries nothing on it
  const hw = (h.w + 0.3) / 2, hd = (h.d + 0.3) / 2, y0 = top + 0.25, paint = WALLS[h.wall].map((v) => Math.min(1, v * h.tone * 0.94)), flat = ROOFS[h.roof][0] === 'concrete_bare';
  const kind = r(30), sx = r(31) < 0.5 ? -1 : 1, sz = r(32) < 0.5 ? -1 : 1;
  if (r(33) < 0.55) out.tanks.push({ lx: sx * (hw - 0.9), lz: sz * (hd - 0.9), y: y0, r: 0.55, h: 1.15, col: r(34) < 0.6 ? [0.1, 0.1, 0.12] : [0.12, 0.26, 0.5] });
  const parapet = () => {                                                                                // (no parapet on a party side: the neighbour's roof is there)
    for (const [lx, lz, bx, bz] of [[0, -1, 2 * hw, 0.16], [0, 1, 2 * hw, 0.16], ...(h.party?.left ? [] : [[-1, 0, 0.16, 2 * hd - 0.32]]), ...(h.party?.right ? [] : [[1, 0, 0.16, 2 * hd - 0.32]])]) out.boxes.push({ mat: 'plaster_rough', lx: lx * (hw - 0.08), lz: lz * (hd - 0.08), y: y0, sx: bx, sy: 0.5, sz: bz, col: paint });
  };
  if (kind < 0.3 && flat) {                                                                              // an unfinished top: rebar at the corners and along the edges
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1]]) out.boxes.push({ mat: 'plaster_a', lx: u * (hw - 0.3), lz: v * (hd - 0.3), y: y0, sx: 0.07, sy: 0.9 + 0.9 * r(35 + (u + 1) * 2 + (v + 1) / 2), sz: 0.07, col: [0.44, 0.24, 0.13] });
  } else {
    if (kind < 0.62) {                                                                                   // a stair hut at the corner opposite the tank, or (half of them) a room: a floor set back from the front, with a terrace before it
      const room = r(36) < 0.5, hx = Math.min(hw - 0.2, room ? hw * (out.tanks.length ? 0.45 : 0.5 + 0.2 * r(37)) : 1.5), hz = Math.min(hd - 0.2, room ? hd * (0.4 + 0.2 * r(38)) : 1.5);
      out.boxes.push({ mat: 'plaster_rough', lx: -sx * (hw - hx - 0.2), lz: room ? -(hd - hz - 0.2) : -sz * (hd - hz - 0.2), y: y0, sx: 2 * hx, sy: room ? 2.7 : 2.45, sz: 2 * hz, col: paint });
    }
    if (flat) parapet();                                                                                 // and a low parapet round a flat roof
  }
  return out;
}

const LIGHT = [0xffb45a, 0xffd9a0, 0xffe9c0, 0xcfe2ff];               // sodium, warm white, bulb, the blue of a television
const pickLight = (r) => LIGHT[r < 0.35 ? 0 : r < 0.75 ? 1 : r < 0.9 ? 2 : 3];

const facade = (x, z, d, ry, u, y, o) => ({ x: x + Math.sin(ry) * (d / 2 + 0.35) + Math.cos(ry) * u, y, z: z + Math.cos(ry) * (d / 2 + 0.35) - Math.sin(ry) * u, ...o });

/** One glow point per lit window of a list of houses { x, z, y, w, d, ry, floors, i, j } (the far rows here, and the vista kit's terraces through kitLights). */
export function houseLights(plan, houses) {
  const seed = plan.seed, out = [];
  for (const h of houses) {
    const nl = h01(h.i, h.j, seed + 120) < 0.7 ? (h01(h.i, h.j, seed + 121) < 0.45 ? 2 : 1) : 0;
    for (let k = 0; k < nl; k++) {
      const fl = Math.min(h.floors - 1, Math.floor(h01(h.i, h.j, seed + 130 + k) * h.floors)), nb = bays(h.w), u = bayAt(h.w, nb, Math.min(nb - 1, Math.floor(h01(h.i, h.j, seed + 140 + k) * nb)));
      out.push(facade(h.x, h.z, h.d, h.ry, u, h.y + WIN.lift + fl * FLOOR + WIN.sill + WIN.h / 2, { color: pickLight(h01(h.i, h.j, seed + 150 + k)), size: 1.7 + 0.8 * h01(h.i, h.j, seed + 160 + k), intensity: 1.2 + 1.0 * h01(h.i, h.j, seed + 170 + k), on: 0.08 + 0.85 * h01(h.i, h.j, seed + 180 + k) }));
    }
  }
  return out;
}

/** One glow point per lit window of the houses and the towers, the church's belfry and floodlight, and the red beacons of the mast. */
export function vistaLights(plan, houses, sites) {
  const seed = plan.seed, out = houseLights(plan, houses);
  sites.towers.forEach((t, ti) => {
    for (let f = 0; f < t.floors; f++) for (let c = 0; c < 6; c++) {
      const r = h01(ti * 100 + f, c, seed + 190);
      if (r > 0.5) continue;
      out.push(facade(t.x, t.z, t.d, t.ry, (c - 2.5) * (t.w / 6.4), t.y + 2.2 + f * 3, { color: pickLight(h01(f, c, seed + 191 + ti)), size: 1.9, intensity: 1.4 + 0.8 * r, on: 0.1 + 0.8 * h01(f, c, seed + 195 + ti) }));
    }
  });
  const ch = sites.church;                                            // the belfry window and the lantern over the tower door, on the tower's front face (local z 18.1)
  for (const [y, color, size, intensity, on] of [[29.5, 0xffd9a0, 2.6, 2.2, 0.2], [3.5, 0xffe9c0, 4.5, 2.6, 0.1]]) out.push(facade(ch.x, ch.z, 2 * 17.75, ch.ry, 0, ch.y + y, { color, size, intensity, on }));
  const m = sites.mast;
  [1, 0.64, 0.33].forEach((f, k) => out.push({ x: m.x, y: m.y + m.h * f + 0.8, z: m.z, color: 0xff2418, size: 11, intensity: 4.5, blink: 0.8, phase: k * 0.31, beacon: true }));
  const lh = sites.lighthouse;                                        // the east headland's light: its lantern, steady, and the flash that comes round every ten seconds
  out.push({ x: lh.x, y: lh.y + lh.h + 1.4, z: lh.z, color: 0xffe6a8, size: 6, intensity: 2.2 }, { x: lh.x, y: lh.y + lh.h + 1.4, z: lh.z, color: 0xfff0c8, size: 26, intensity: 6, blink: 0.1, phase: 0.2 });
  return out;
}

/** A gable roof over a w x d plan, ridge along local z, in the frame (cx, cz, ry): two sloped planes and two gable triangles. */
function gable(b, cx, y, cz, w, d, rise, ry, roofMat, wallMat, roofCol, wallCol) {
  const cs = Math.cos(ry), sn = Math.sin(ry), P = (x, yy, z) => [cx + x * cs + z * sn, yy, cz - x * sn + z * cs], hw = w / 2, hd = d / 2;
  b.quad(roofMat, P(-hw, y, -hd), P(-hw, y, hd), P(0, y + rise, hd), P(0, y + rise, -hd), { col: roofCol });
  b.quad(roofMat, P(hw, y, hd), P(hw, y, -hd), P(0, y + rise, -hd), P(0, y + rise, hd), { col: roofCol });
  b.tri(wallMat, P(-hw, y, hd), P(hw, y, hd), P(0, y + rise, hd), { col: wallCol });
  b.tri(wallMat, P(hw, y, -hd), P(-hw, y, -hd), P(0, y + rise, -hd), { col: wallCol });
}

export function buildVista(K) {
  const { ctx, plan } = K, b = ctx.batch.builder('world.vista', { cast: false }), sites = vistaSites(plan), taken = kitZones(ctx.world?.vistaKitPlan), houses = farHouses(plan, { taken }), lights = vistaLights(plan, houses, sites);
  const far = farOf(plan), seen = { windows: 0, doors: 0, boxes: 0, tanks: 0 };
  houses.forEach((h, hi) => {
    const dist = gap(h), mist = 0.4 * ss(120, 480, dist), haze = (v, k) => v + (k - v) * mist;                      // the far ones are lighter: more air between us and them
    const col = WALLS[h.wall].map((v, k) => haze(Math.min(1, v * h.tone), [0.8, 0.77, 0.74][k])), top = h.y + h.h, [rm, rc0] = ROOFS[h.roof], rc = rc0.map((v, k) => haze(v, [0.8, 0.77, 0.74][k]));
    const cs = Math.cos(h.ry), sn = Math.sin(h.ry), party = h.party ?? {}, x0 = -h.w / 2 - (party.left ? 0 : 0.15), x1 = h.w / 2 + (party.right ? 0 : 0.15), mx = (x0 + x1) / 2;
    const sides = [...(party.left ? ['nx'] : []), ...(party.right ? ['px'] : [])];
    const hat = roofHat(plan, h), lid = hat ? hat.lift : 0;                                                         // a pitched roof stands on a lid, and the wall goes up to it
    b.box('plaster_rough', h.x, (h.y - 1.6 + top + lid) / 2, h.z, h.w, top + lid - h.y + 1.6, h.d, { ry: h.ry, col, skip: ['ny', 'py', ...sides] });
    if (dist > DETAIL || hat) {                                                                                     // under a pixel of overhang out here: the roof is its top face alone (and a pitched roof stands on that face)
      const P = (lx, lz) => [h.x + lx * cs + lz * sn, top + lid, h.z - lx * sn + lz * cs];
      b.quad(rm, P(-h.w / 2, h.d / 2), P(h.w / 2, h.d / 2), P(h.w / 2, -h.d / 2), P(-h.w / 2, -h.d / 2), { col: rc });
    } else b.box(rm, h.x + mx * cs, top + 0.125, h.z - mx * sn, x1 - x0, 0.25, h.d + 0.3, { ry: h.ry, col: rc, skip: ['ny', ...sides] });          // no overhang and no edge on a party side: the two roofs meet
    if (hat) {                                                                                                      // the pitched roof itself (hatFaces: the numbers the tests walk)
      const faces = hatFaces(h, hat), put = (m, q, c) => (q.length === 4 ? b.quad(m, q[0], q[1], q[2], q[3], { col: c }) : b.tri(m, q[0], q[1], q[2], { col: c }));
      for (const q of faces.roof) put(rm, q, rc);
      for (const q of faces.wall) put('plaster_rough', q, col);
    }
    const slab = (g) => (g > DETAIL ? 0 : 0.25);                                                                    // the roof slab of a house: none beyond DETAIL
    for (const [e, nb] of [[1, party.right ? houses[hi + 1] : null], [-1, party.left ? houses[hi - 1] : null]]) {      // a party wall is the neighbour's too, but the part of it above the lower roof is still a wall
      const y0 = nb && nb.y + nb.h + slab(gap(nb)), y1 = top + slab(dist);
      if (!nb || y1 - y0 < 0.05) continue;
      const P = (lz, y) => [h.x + e * (h.w / 2) * cs + lz * sn, y, h.z - e * (h.w / 2) * sn + lz * cs], z = h.d / 2;
      b.quad('plaster_rough', ...(e > 0 ? [P(z, y0), P(-z, y0), P(-z, y1), P(z, y1)] : [P(-z, y0), P(z, y0), P(z, y1), P(-z, y1)]), { col });
    }
    // the lane in front of the row: a dark ribbon of beaten earth on the ground, the length of the house and 3 m wide (steps and dirt roads between the rows)
    const lane = (lx, lz) => { const lx0 = lx * cs + lz * sn, lz0 = -lx * sn + lz * cs, X = h.x + lx0, Z = h.z + lz0; return [X, far(X, Z) + 0.1, Z]; };
    b.quad('dirt_path', lane(-h.w / 2, h.d / 2 + 0.6), lane(-h.w / 2, h.d / 2 + 3.6), lane(h.w / 2, h.d / 2 + 3.6), lane(h.w / 2, h.d / 2 + 0.6), { col: [0.46, 0.4, 0.34].map((v, k) => haze(v, [0.7, 0.68, 0.66][k])) });
    const parts = houseParts(plan, h, far);
    for (const w of parts.windows) b.quad('glass_dark', ...windowCorners(w), { col: w.col });
    for (const d of parts.doors) b.quad('plaster_a', ...windowCorners(d), { col: d.col });
    for (const q of parts.boxes) b.box(q.mat, h.x + q.lx * cs + q.lz * sn, q.y + q.sy / 2, h.z - q.lx * sn + q.lz * cs, q.sx, q.sy, q.sz, { ry: h.ry, col: q.col, skip: ['ny', ...(q.sx * q.sz < 0.01 ? ['py'] : [])] });   // (the tip of a rebar is under a pixel)
    for (const t of parts.tanks) {                                                                                  // a six-sided drum with a lid (its foot is on the roof): 18 triangles
      const tx = h.x + t.lx * cs + t.lz * sn, tz = h.z - t.lx * sn + t.lz * cs, ty = t.y + t.h, ring = (k) => [tx + Math.cos((k * Math.PI) / 3) * t.r, ty, tz + Math.sin((k * Math.PI) / 3) * t.r];
      b.cyl('plaster_a', tx, t.y, tz, t.r, t.h, 6, { col: t.col, caps: false });
      for (let k = 0; k < 6; k++) b.tri('plaster_a', [tx, ty, tz], ring(k + 1), ring(k), { col: t.col });
    }
    for (const k of Object.keys(seen)) seen[k] += parts[k].length;
  });
  // the church: a nave with a gable roof, a bell tower with a slate spire and a cross
  const ch = sites.church, nave = { w: 11, d: 24, h: 9 }, cream = [0.93, 0.89, 0.8], P = (lx, lz) => [ch.x + lx * Math.cos(ch.ry) + lz * Math.sin(ch.ry), ch.z - lx * Math.sin(ch.ry) + lz * Math.cos(ch.ry)];
  b.box('plaster_rough', ch.x, ch.y + nave.h / 2 - 1, ch.z, nave.w, nave.h + 2, nave.d, { ry: ch.ry, col: cream, skip: ['ny', 'py'] });
  gable(b, ch.x, ch.y + nave.h, ch.z, nave.w + 0.6, nave.d + 0.6, 3.6, ch.ry, 'roof_tile_clay', 'plaster_rough', [0.95, 0.78, 0.7], cream);
  const [tx, tz] = P(0, nave.d / 2 + 2.5);
  b.box('plaster_rough', tx, ch.y + 13, tz, 6.4, 28, 6.4, { ry: ch.ry, col: cream, skip: ['ny'] });
  b.cyl('corrugated_zinc', tx, ch.y + 27, tz, 4.6, 11, 4, { r1: 0.1, caps: false, col: [0.45, 0.5, 0.58] });
  b.box('iron_black', tx, ch.y + 39.4, tz, 0.25, 2.4, 0.25); b.box('iron_black', tx, ch.y + 39.9, tz, 1.3, 0.25, 0.25);
  // the towers: a slab with a dark band of windows for every floor on the two faces that look at the plot (+z and +x of the tower's own frame)
  sites.towers.forEach((t, ti) => {
    const tone = [[0.86, 0.84, 0.78], [0.72, 0.78, 0.84], [0.88, 0.8, 0.7], [0.78, 0.8, 0.76]][ti % 4], cs = Math.cos(t.ry), sn = Math.sin(t.ry);
    b.box('plaster_rough', t.x, t.y + t.h / 2 - 1, t.z, t.w, t.h + 2, t.d, { ry: t.ry, col: tone, skip: ['ny'] });
    b.box('concrete_bare', t.x, t.y + t.h + 0.6, t.z, t.w * 0.55, 1.2, t.d * 0.5, { ry: t.ry, col: [0.5, 0.5, 0.5] });
    const faces = [{ nx: sn, nz: cs, half: t.d / 2, ax: cs, az: -sn, len: t.w * 0.82 }, { nx: cs, nz: -sn, half: t.w / 2, ax: -sn, az: -cs, len: t.d * 0.82 }];
    for (let f = 0; f < t.floors; f++) {
      const y = t.y + 1.4 + f * 3;
      for (const { nx, nz, half, ax, az, len } of faces) {
        const ox = t.x + nx * (half + 0.06), oz = t.z + nz * (half + 0.06), ex = (ax * len) / 2, ez = (az * len) / 2;
        b.quad('glass_dark', [ox - ex, y, oz - ez], [ox + ex, y, oz + ez], [ox + ex, y + 1.3, oz + ez], [ox - ex, y + 1.3, oz - ez], { col: [0.5, 0.58, 0.7] });
      }
    }
  });
  // the mast: red and white bands of a four-sided taper, a platform with dishes, a thin antenna
  const m = sites.mast, bandH = m.h / 6, rAt = (f) => 2.4 - 1.9 * f;
  for (let k = 0; k < 6; k++) b.cyl('concrete_bare', m.x, m.y - 1 + k * bandH, m.z, rAt(k / 6), bandH + 0.05, 4, { r1: rAt((k + 1) / 6), caps: false, col: k % 2 ? [0.95, 0.95, 0.95] : [0.9, 0.13, 0.1] });
  b.box('iron_black', m.x, m.y + m.h * 0.64, m.z, 4.4, 0.4, 4.4); b.box('iron_black', m.x + 1.8, m.y + m.h * 0.64 + 1.1, m.z, 1.4, 1.4, 0.3, { ry: 0.5 });
  b.cyl('iron_black', m.x, m.y + m.h, m.z, 0.22, 14, 6, { r1: 0.06 });
  // the lighthouse on the east headland's crown: a plinth sunk into the pad, a tapering round tower in white with a red band, a gallery, the lantern room under a dark cap
  const lh = sites.lighthouse, bands = 6, bh = lh.h / bands, lr = (f) => 3.3 - 1.1 * f;
  b.cyl('concrete_bare', lh.x, lh.y - 2, lh.z, 3.9, 2.6, 12, { r1: 3.4, col: [0.62, 0.62, 0.6] });
  for (let k = 0; k < bands; k++) b.cyl('plaster_rough', lh.x, lh.y + 0.6 + k * (lh.h - 0.6) / bands, lh.z, lr(k / bands), (lh.h - 0.6) / bands + 0.05, 12, { r1: lr((k + 1) / bands), caps: false, col: k === 2 || k === 3 ? [0.84, 0.16, 0.12] : [0.95, 0.94, 0.9] });
  b.cyl('concrete_bare', lh.x, lh.y + lh.h, lh.z, 3.0, 0.5, 12, { col: [0.62, 0.62, 0.6] });
  b.cyl('glass_dark', lh.x, lh.y + lh.h + 0.5, lh.z, 1.5, 2.2, 8, { caps: false, col: [0.6, 0.7, 0.8] });
  b.cyl('iron_black', lh.x, lh.y + lh.h + 2.7, lh.z, 1.9, 1.5, 8, { r1: 0.15, col: [0.2, 0.22, 0.26] });
  ctx.batch.flush('world.vista');
  for (const l of lights) ctx.glow?.add({ x: l.x, y: l.y, z: l.z, color: l.color, size: l.size, intensity: l.intensity, ...(l.blink ? { blink: l.blink, phase: l.phase } : { on: l.on }) });
  const stats = { houses: houses.length, towers: sites.towers.length, church: 1, lighthouse: 1, mast: sites.mast, lights: lights.length, beacons: lights.filter((l) => l.beacon).length, windows: seen.windows, doors: seen.doors, roofItems: seen.boxes + seen.tanks, keptOffKit: taken.length };
  if (ctx.world) ctx.world.vista = stats;
  return stats;
}
