// Helpers for the architecture tests (A2). Not a test file itself.
import { createContext } from '../js/core/ctx.js';
import { planBuilding } from '../js/arch/index.js';
import { LOT_KINDS } from '../js/core/vocab.js';

/** A lot maker numbering from `start`: id, position, rotation and seed all follow the number, so a lot is the same lot whichever list it is built in. */
function lotMaker(start) {
  let n = start;
  const lots = [];
  const mk = (kind, w, d, floors, extra = {}) => {
    const i = n++;
    lots.push({
      id: 'T' + String(i).padStart(2, '0'), name: `Prueba ${i}`, kind, x: (i % 8) * 30 - 105, y: 0, z: Math.floor(i / 8) * 30 - 60, rotY: [0, 0.5, -0.9, 1.57, 3.1][i % 5], w, d, floors, fh: 2.8,
      front: 'S0', entrance: { side: 'front', u: 0 }, party: { left: false, right: false, back: false }, style: {}, seed: 4000 + i * 17, roofAccess: false, ...extra,
    });
  };
  return { lots, mk };
}

/** Test lots: every LOT_KIND plus size / floor / party / roof variations. Positions are spread out; terrain is flat with a plinth. */
export function testLots() {
  const { lots, mk } = lotMaker(0);
  mk('house', 6, 10, 2); mk('house', 5, 11, 3, { roofAccess: true }); mk('house', 7, 12, 2, { party: { left: true, right: true, back: false }, roofAccess: true });
  mk('house', 6, 8, 1); mk('house', 8, 9, 3, { roofAccess: true, style: { roof: 'tile' } }); mk('house', 5.5, 7.4, 2); mk('house', 9, 13, 4, { party: { left: true, right: false, back: true } });
  mk('rowhouse', 4.5, 9, 2, { party: { left: true, right: true, back: true } }); mk('rowhouse', 4.2, 10, 3, { party: { left: true, right: true, back: false }, roofAccess: true });
  mk('shophouse', 7, 11, 2, { shop: 'tienda' }); mk('shophouse', 6.4, 12, 3, { shop: 'panaderia', roofAccess: true, party: { left: true, right: false, back: false } });
  mk('shophouse', 8, 10, 1, { shop: 'peluqueria' }); mk('shophouse', 5.2, 9.2, 2, { shop: 'fruver' });
  mk('cornerstore', 7, 10, 2, { shop: 'tienda', roofAccess: true }); mk('cornerstore', 6, 9, 3, { shop: 'drogueria' });
  mk('apartments', 12, 12, 5, { roofAccess: true }); mk('apartments', 11, 13, 4, { party: { left: true, right: true, back: false } }); mk('apartments', 10, 11, 3);
  mk('unfinished', 6, 10, 3); mk('unfinished', 7, 9, 2, { roofAccess: true }); mk('unfinished', 5, 9, 4);
  for (const k of LOT_KINDS) if (!['house', 'rowhouse', 'apartments', 'shophouse', 'cornerstore', 'unfinished'].includes(k)) {
    // the chapel is the page's own size (11 x 14, one tall storey); a two-storey chapel would fall back to the house plan
    mk(k, k === 'kiosk' ? 3.5 : k === 'school' ? 16 : k === 'chapel' ? 11 : 10, k === 'kiosk' ? 3.5 : k === 'school' ? 14 : k === 'chapel' ? 14 : 11, k === 'school' ? 2 : k === 'tenement' ? 3 : k === 'kiosk' || k === 'chapel' ? 1 : 2,
      { shop: k === 'workshop' ? 'taller' : undefined, ...(k === 'chapel' ? { fh: 4.2 } : {}) });
  }
  // patio houses (appended: the ids above stay put): the barrio's own sizes (L35 9 x 11 with the door far right, L39 9 x 10), a party wall on either side of the stair,
  // three storeys, one storey, and a wide lot that grows a side room
  mk('courtyard', 9, 11, 2, { party: { left: true, right: false, back: false }, roofAccess: true, entrance: { side: 'front', u: 3.15 } });
  mk('courtyard', 9, 10, 2, { entrance: { side: 'front', u: 0.98 } });
  mk('courtyard', 9.5, 12, 3, { party: { left: false, right: true, back: false }, entrance: { side: 'front', u: -1.5 } });
  mk('courtyard', 8, 10.5, 1);
  mk('courtyard', 14, 12, 2, { roofAccess: true });
  // tenements (appended): L34 and L38 of the barrio (the door off the corridor's reach), four storeys against a party wall, a wide lot with a party wall behind,
  // one storey with and without a stair to the roof
  mk('tenement', 10, 11, 3, { roofAccess: true, entrance: { side: 'front', u: -1.11 } });
  mk('tenement', 10, 10, 3, { roofAccess: true, entrance: { side: 'front', u: 2.31 } });
  mk('tenement', 9, 12, 4, { party: { left: true, right: false, back: false } });
  mk('tenement', 12.5, 14, 3, { party: { left: false, right: true, back: true }, roofAccess: true });
  mk('tenement', 10, 9, 1);
  mk('tenement', 10, 9, 1, { roofAccess: true });
  // schools (appended): L00 of the barrio (14 x 15, fh 3.2), a party wall on the stair side, three storeys with the door off to one side and a stair to the roof,
  // one storey, and the narrowest lot that still takes the plan
  mk('school', 14, 15, 2, { fh: 3.2, entrance: { side: 'front', u: 0.02 } });
  mk('school', 12, 13.5, 2, { fh: 3.2, party: { left: true, right: false, back: false } });
  mk('school', 14, 15, 3, { fh: 3.2, roofAccess: true, entrance: { side: 'front', u: -3 } });
  mk('school', 13, 13, 1, { fh: 3.2 });
  mk('school', 11.5, 16, 2, { fh: 3.2, party: { left: false, right: true, back: true } });
  // clinics (appended): L09 of the barrio (party walls both sides, the door on the west), a party wall with the door on the far side, three storeys with a stair to
  // the roof, one storey with and without a stair to the roof, and a wide lot (three consulting rooms a floor)
  mk('clinic', 9, 10, 2, { fh: 3.0, party: { left: true, right: true, back: false }, entrance: { side: 'front', u: -2.68 } });
  mk('clinic', 9, 10, 2, { fh: 3.0, party: { left: true, right: false, back: false }, entrance: { side: 'front', u: 2.68 } });
  mk('clinic', 12, 12, 3, { fh: 3.0, party: { left: false, right: true, back: false }, roofAccess: true, entrance: { side: 'front', u: 0.6 } });
  mk('clinic', 10, 9, 1, { fh: 3.0 });
  mk('clinic', 9, 10, 1, { fh: 3.0, roofAccess: true });
  mk('clinic', 14, 13, 2, { fh: 3.0 });
  // halls (appended): L10 of the barrio (party wall right, the door on the east, a stair to the roof), the mirror image, three storeys with the door on the axis,
  // one storey without a stair (a dressing room behind the stage) and one with a stair to the roof
  mk('hall', 10, 10, 2, { fh: 3.4, party: { left: false, right: true, back: false }, roofAccess: true, entrance: { side: 'front', u: 3.02 } });
  mk('hall', 10, 10, 2, { fh: 3.4, party: { left: true, right: false, back: false }, entrance: { side: 'front', u: -3.02 } });
  mk('hall', 12, 14, 3, { fh: 3.4, roofAccess: true });
  mk('hall', 9, 11, 1, { fh: 3.4 });
  mk('hall', 10, 12, 1, { fh: 3.4, roofAccess: true, party: { left: true, right: true, back: false } });
  // more schools (appended): the standard plan (street door, entrance hall, the stair 1.4 m wide, upper hall, classrooms) needs about 13 m x 13.9 m with a stair, so the
  // lots above that are 12 x 13.5, 13 x 13 and 11.5 x 16 keep exercising the fall-back to a house; these are the ones that take the plan: a party wall on the stair side with the door
  // far off to one side, three storeys against a party wall, one storey (the staff room where the stair would be), and a wide lot (two rooms under the upper strip)
  mk('school', 15, 16, 2, { fh: 3.2, party: { left: true, right: false, back: false }, entrance: { side: 'front', u: 4 } });
  mk('school', 14, 14.5, 3, { fh: 3.2, party: { left: false, right: true, back: false }, entrance: { side: 'front', u: -2 } });
  mk('school', 14, 15, 1, { fh: 3.2 });
  mk('school', 18, 15, 2, { fh: 3.2, entrance: { side: 'front', u: -5 } });
  // blocks of flats on the barrio's own lots (appended): a narrow lot takes ONE flat a floor beside the hall and stair column (7 x 10 with a party wall on the stair side, 8 x 10 with the
  // door off to the far side, 7.5 x 9 between two party walls, 7 x 9 free-standing), a wide one takes two (9 x 10 against a party wall, 9.5 x 10 between two), and 5.5 x 10 is too narrow for a flat
  mk('apartments', 7, 10, 4, { party: { left: false, right: true, back: false }, entrance: { side: 'front', u: 1.97 } });
  mk('apartments', 8, 10, 3, { party: { left: true, right: false, back: false }, entrance: { side: 'front', u: 2 } });
  mk('apartments', 7.5, 9, 4, { party: { left: true, right: true, back: false } });
  mk('apartments', 7, 9, 3);
  mk('apartments', 9, 10, 4, { party: { left: true, right: false, back: false } });
  mk('apartments', 9.5, 10, 4, { party: { left: true, right: true, back: false } });
  mk('apartments', 5.5, 10, 3);
  return lots;
}

/**
 * Homes above a shop, ONE storey above it, numbered on from the last of `testLots` (T67 to T79) but kept out of it: the door and facade tests size their chunk counts by how far the test
 * lots spread, so a longer list would move their bounds. The barrio's 17 had a living room, a kitchen and a bathroom and nowhere to sleep. By plan: a rest column deep enough for two rooms
 * (kitchen, then the bedroom, 5 x 10, 4.5 x 10 and 5.5 x 10), a front band split into living room and bedroom (6 x 9, 5 x 9, 6 x 7 and the cornerstore and the two workshops), and the one
 * that is a studio (5 x 7: the front band is the bedroom).
 */
export function shopHomeLots() {
  const { lots, mk } = lotMaker(67);
  mk('shophouse', 6, 9, 2, { shop: 'tienda', party: { left: true, right: false, back: false } });
  mk('shophouse', 5, 9, 2, { shop: 'fruver', party: { left: true, right: true, back: false } });
  mk('shophouse', 6, 7, 2, { shop: 'tienda', party: { left: true, right: true, back: false } });
  mk('shophouse', 5, 7, 2, { shop: 'tienda', party: { left: true, right: false, back: false } });
  mk('shophouse', 5, 10, 2, { shop: 'panaderia' });
  mk('shophouse', 4.5, 10, 2, { shop: 'tienda', party: { left: true, right: false, back: false } });
  mk('shophouse', 5.5, 10, 2, { shop: 'peluqueria', party: { left: true, right: true, back: false } });
  mk('cornerstore', 7, 7, 2, { shop: 'tienda', party: { left: true, right: true, back: false } });
  mk('workshop', 9, 7, 2, { shop: 'taller', party: { left: false, right: true, back: false } });
  mk('workshop', 8, 9, 2, { shop: 'taller' });
  mk('shophouse', 5, 10, 2, { shop: 'tienda', party: { left: true, right: true, back: true } });     // party walls all round: only the street wall can light the bedroom, so it is in the front band
  mk('shophouse', 4.3, 9, 2, { shop: 'tienda' });          // too narrow to cut the front band in two (the half beside the stair would be 1.4 m wide): the whole band is the bedroom
  mk('shophouse', 4.2, 11, 2, { shop: 'tienda' });         // deep enough for a rest column, too narrow to put a bedroom in it (1.6 m): the whole front band is the bedroom here too
  return lots;
}

/**
 * Terrain: flat at y=0 except a plinth (lot.y - 0.3) under every footprint (+0.3 margin), as A5 promises.
 * `drop` (env ARCH_DROP) sinks the street below the floors, so the entry steps (steps.js) are exercised by every walk test.
 * `field(x, z, out)`, if given, is added to the street outside the pockets (a street that rolls: climbs along a facade, across a door; a curb a few decimetres out): `out` is
 * the distance beyond the nearest pocket's edge, along the axis it is farthest out on.
 */
export function makeHeightAt(lots, drop = Number(process.env.ARCH_DROP ?? 0), margin = 0.3, field = null) {
  const boxes = lots.map((l) => ({ x: l.x, z: l.z, c: Math.cos(l.rotY), s: Math.sin(l.rotY), hw: l.w / 2 + margin, hd: l.d / 2 + margin, y: l.y - 0.3 }));
  return (x, z) => {
    let out = Infinity;
    for (const b of boxes) {
      const dx = x - b.x, dz = z - b.z, lx = dx * b.c - dz * b.s, lz = dx * b.s + dz * b.c;
      if (Math.abs(lx) <= b.hw && Math.abs(lz) <= b.hd) return b.y;
      if (field) out = Math.min(out, Math.max(Math.abs(lx) - b.hw, Math.abs(lz) - b.hd));
    }
    return -drop + (field ? field(x, z, out) : 0);
  };
}

export function makeCtx(lots, seed = 20261029, drop = undefined, margin = undefined, field = undefined) {
  const ctx = createContext({ seed, headless: true });
  ctx.plan = { heightAt: makeHeightAt(lots, drop, margin, field), lots };
  ctx.physics.setTerrain(ctx.plan.heightAt);
  return ctx;
}

export function planAll(lots, seed, colliders = true, drop = undefined, margin = undefined, field = undefined) {
  const ctx = makeCtx(lots, seed, drop, margin, field);
  const bps = lots.map((l) => planBuilding(ctx, l));
  if (colliders) for (const bp of bps) ctx.physics.add(bp.colliders);
  return { ctx, bps };
}

const P = { radius: 0.3, height: 1.78, stepUp: 0.5, maxSlope: 0.9, gravity: 9.8 };

/** Flood-fill walk with the real physics kernel. Returns { visited:[{x,y,z}], drops:[...] }. */
export function explore(ctx, bp, o = {}) {
  const ph = ctx.physics, step = o.step ?? 0.25, seen = new Map(), drops = [], queue = [];
  const key = (x, y, z) => `${Math.round(x / step)},${Math.round(z / step)},${Math.round(y / 0.35)}`;
  const start = o.start ?? bp.entrances[0].outside;
  const s0 = { x: start[0], z: start[2], y: start[1], vy: 0, onGround: true };
  ph.move(s0, 0, 0, 0.016, P);
  seen.set(key(s0.x, s0.y, s0.z), s0); queue.push(s0);
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const b = bp.bounds, pad = 3;
  let guard = 0;
  while (queue.length && guard++ < (o.max ?? 400000)) {
    const a = queue.pop();
    for (const [dx, dz] of dirs) {
      const s = { x: a.x, y: a.y, z: a.z, vy: 0, onGround: true };
      const mx = dx * step, mz = dz * step;
      ph.move(s, mx, mz, 1 / 60, P);
      if (s.blocked) continue;
      if (Math.hypot(s.x - (a.x + mx), s.z - (a.z + mz)) > 0.05) continue;
      for (let i = 0; i < 40 && !s.onGround; i++) ph.move(s, 0, 0, 1 / 60, P);
      if (s.y < a.y - 0.55) { drops.push({ from: [a.x, a.y, a.z], to: [s.x, s.y, s.z] }); continue; }
      if (s.x < b.x0 - pad || s.x > b.x1 + pad || s.z < b.z0 - pad || s.z > b.z1 + pad) continue;
      const k = key(s.x, s.y, s.z);
      if (seen.has(k)) continue;
      seen.set(k, s); queue.push(s);
    }
  }
  return { visited: [...seen.values()], drops, exhausted: guard >= (o.max ?? 400000) };
}

/**
 * Can a player standing on a walkable roof (or an open top deck) JUMP OFF it over the fence? Runs real jumps with the physics kernel from five spots along each of
 * the four fences (spots inside a wall's push zone, e.g. beside the caseta, or over the stair hole are skipped), straight at the fence, at walk and sprint speed,
 * at 60 and at the page's 20 fps frame clamp (the slowest frame the player ever gets, so the highest jump), and keeps pushing forward after the landing.
 * Returns { tested, escapes }: one escape record per jump that ended below the roof.
 */
export function roofJumpEscapes(ctx, bp, jump = 3.6, speeds = [2.3, 5.0], fps = [60, 20]) {
  const S = bp.shell, ph = ctx.physics, escapes = [];
  let tested = 0;
  if (!bp.roof?.walkable) return { tested, escapes };
  const o = S.outer, yRoof = bp.roof.y, ax = (o.x0 + o.x1) / 2, az = (o.z0 + o.z1) / 2;
  const fences = [['front', 0, 1, 'z', o.z1], ['back', 0, -1, 'z', o.z0], ['left', -1, 0, 'x', o.x0], ['right', 1, 0, 'x', o.x1]];
  for (const [side, dx, dz, axis, edge] of fences) for (const along of [-0.4, -0.2, 0, 0.2, 0.4]) {
    const span = axis === 'z' ? o.x1 - o.x0 : o.z1 - o.z0, u = (axis === 'z' ? ax : az) + along * span;
    const lx = axis === 'z' ? u : edge - dx * 0.6, lz = axis === 'z' ? edge - dz * 0.6 : u;       // 0.6 m inside the fence: just outside its 0.375 m push zone
    const a = bp.frame.toWorld(lx, 0, lz), b = bp.frame.toWorld(lx + dx, 0, lz + dz), l = Math.hypot(b[0] - a[0], b[2] - a[2]), ux = (b[0] - a[0]) / l, uz = (b[2] - a[2]) / l;
    if (ph._overlaps(a[0], a[2], yRoof, P.radius, P.height)) continue;                              // inside a wall's push zone (the caseta, a roof unit): not a place to stand
    for (const speed of speeds) for (const f of fps) {
      const dt = 1 / f, s = { x: a[0], z: a[2], y: yRoof, vy: 0, onGround: true };
      for (let i = 0; i < 12 && !(s.onGround && i > 0); i++) ph.move(s, 0, 0, dt, P);
      if (!s.onGround || Math.abs(s.y - yRoof) > 0.05) continue;                                   // over the stair hole, not on the roof slab
      tested++;
      ph.move(s, ux * speed * dt, uz * speed * dt, dt, { ...P, jump });
      for (let i = 0; i < 100 && !s.onGround; i++) ph.move(s, ux * speed * dt, uz * speed * dt, dt, P);
      for (let i = 0; i < 40; i++) ph.move(s, ux * speed * dt, uz * speed * dt, dt, P);
      if (s.y < yRoof - 0.3) escapes.push({ id: bp.id, side, along, speed, fps: f, fell: +(yRoof - s.y).toFixed(2) });
    }
  }
  return { tested, escapes };
}

/** Is there a visited state within `r` (xz) of local point (lx,lz) at local floor height ly (+-0.35)? */
export function reached(bp, visited, lx, lz, ly, r = 0.5) {
  const p = bp.frame.toWorld(lx, ly, lz);
  return visited.some((s) => Math.hypot(s.x - p[0], s.z - p[2]) <= r && Math.abs(s.y - p[1]) <= 0.35);
}

export function openAllDoors(ctx, bp, open = true) { for (const d of bp.doors) if (d.kind !== 'arch') ctx.physics.setDoor(d.id, open); }

/** Every triangle of a building's exterior group in building-local coordinates: { k: material key, v: [a, b, c] }. (The group's positions are world space.) */
export function localTris(ctx, bp) {
  const out = [];
  for (const m of ctx.batch.groups.get(bp.id + '.ext').meshes) {
    if (m.userData.matKey === 'wall_decal') continue;
    const p = m.geometry.attributes.position, ix = m.geometry.index.array, L = (i) => bp.frame.toLocal(p.getX(ix[i]), p.getY(ix[i]), p.getZ(ix[i]));
    for (let i = 0; i < ix.length; i += 3) out.push({ k: m.userData.matKey, v: [L(i), L(i + 1), L(i + 2)] });
  }
  return out;
}
/** Is the point (u along the wall, y) covered by a triangle of material `mats` lying in the wall plane `plane` and looking along `face` (+1/-1 along the wall's normal; 0 = either way)? */
export function coveredBy(tris, dir, plane, face, mats, u, y) {
  const iu = dir === 'x' ? 0 : 2, ip = dir === 'x' ? 2 : 0;
  return tris.some(({ k, v }) => {
    if (mats && !mats.includes(k)) return false;
    if (!v.every((q) => Math.abs(q[ip] - plane) < 2e-3)) return false;                // (the nearest thing off the plane is the 14 mm trim; positions are float32 in world space)
    const [a, b, c] = v.map((q) => [q[iu], q[1]]), cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 1e-12) return false;
    const e = (p, q) => ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (u - p[0])) * Math.sign(cr);
    if (e(a, b) < -1e-9 || e(b, c) < -1e-9 || e(c, a) < -1e-9) return false;
    const n = dir === 'x' ? (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]) - (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) : (v[1][1] - v[0][1]) * (v[2][2] - v[0][2]) - (v[1][2] - v[0][2]) * (v[2][1] - v[0][1]);
    return !face || n * face > 0;                                                  // the sign of the triangle's normal along the plane's axis (x walls: z = a x b; z walls: x = a x b)
  });
}
/**
 * The same for a plane of any orientation: is the point (p, q) covered by a triangle of material `mats` lying in the plane `axis` (0 = x, 1 = y, 2 = z) = `plane` and looking along `face`
 * (+1/-1 along that axis; 0 = either way)? (p, q) are the other two coordinates in axis order: x-plane (y, z), y-plane (x, z), z-plane (x, y).
 */
export function coveredOn(tris, axis, plane, face, mats, p, q) {
  const [i, j] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
  return tris.some(({ k, v }) => {
    if (mats && !mats.includes(k)) return false;
    if (!v.every((r) => Math.abs(r[axis] - plane) < 2e-3)) return false;
    const [a, b, c] = v.map((r) => [r[i], r[j]]), cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 1e-12) return false;
    const e = (s, t) => ((t[0] - s[0]) * (q - s[1]) - (t[1] - s[1]) * (p - s[0])) * Math.sign(cr);
    if (e(a, b) < -1e-9 || e(b, c) < -1e-9 || e(c, a) < -1e-9) return false;
    const A = [v[1][0] - v[0][0], v[1][1] - v[0][1], v[1][2] - v[0][2]], B = [v[2][0] - v[0][0], v[2][1] - v[0][1], v[2][2] - v[0][2]];
    const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]][axis];
    return !face || n * face > 0;
  });
}
export { P as PLAYER, planBuilding };
