// The viewpoint tower's dressing (R1-D27: "a plain, unweathered block with a zigzag stair, none of the barrio's weathering"): the weathered stair, the iron railing along its outer side,
// a small tiled roof over the deck with a lit lantern and a flag, the fixed ladder out of reach on the core's east face, a hazard band and a chain at the stair's foot, tags and a bill.
// world-mesh.test.mjs holds the tower's physics and the weathering of its core; this file holds what the dressing must not break (the headroom under the roof, the stair's lanes, the
// ladder's clearance, the budget) and what it must show. Every number a check reads comes from `towerPlan` / `towerDress` (the pure data the mesh is built from), and every check also
// reads the BUILT triangles. Each check that can silently go vacuous has a TEETH line next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-tower.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { towerPlan, towerDress, TOWER } from '../js/world/tower.js';
import { pointInPoly, segDist } from '../js/world/geom.js';
import { Glow } from '../js/engine/glow.js';
import { SEED } from './world-lib.mjs';

async function build(glow = null) {
  const ctx = createContext({ seed: SEED, headless: true });
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  if (glow) ctx.glow = glow;                                       // the engine's glow registry, which headless contexts do not have: a recorder
  await buildWorld(ctx);
  await buildProps(ctx);
  ctx.batch.flushAll();
  return ctx;
}
const glowLog = { list: [], add(g) { this.list.push(g); return g; } };
const A = await build(glowLog), B = await build();
const T = A.world.tower, P = towerPlan(T.x, T.z, T.y0), D = T.dress, { c, R, deckY: dy } = P;
const BASE_TRIANGLES = 3212;                                       // what the tower's own meshes held before the dressing (counted the same way: `tris` over MATS)
const MATS = ['concrete_formwork', 'concrete_bare', 'plaster_rough#e3d9c6', 'iron_black', 'rusty_iron', 'wood_dark', 'roof_tile_clay', 'glass', 'lamp_glow', 'plaster_a', 'world_sign'];

const cache = new Map();
/** The triangles of one material in the tower's own meshes (centre within 1.2 m of the stair's outline): { p: three [x, y, z] corners in world space, c: three [r, g, b] vertex colours }. */
function tris(key, ctx = A) {
  const id = `${ctx === A ? 'A' : 'B'}:${key}`;
  if (cache.has(id)) return cache.get(id);
  const mat = ctx.mat(key), V = new ctx.THREE.Vector3(), out = [];
  ctx.scene.updateMatrixWorld(true);
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    const pos = o.geometry.getAttribute('position'), col = o.geometry.getAttribute('color'), ix = o.geometry.index, n = ix ? ix.count : pos.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const ids = ix ? [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)] : [i, i + 1, i + 2];
      const p = ids.map((k) => V.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld).toArray());
      const x = (p[0][0] + p[1][0] + p[2][0]) / 3, z = (p[0][2] + p[1][2] + p[2][2]) / 3;
      if (Math.abs(x - T.x) > R + 1.2 || Math.abs(z - T.z) > R + 1.2) continue;
      out.push({ p, c: ids.map((k) => (col ? [col.getX(k), col.getY(k), col.getZ(k)] : [1, 1, 1])) });
    }
  });
  cache.set(id, out);
  return out;
}
const verts = (key, ctx = A) => tris(key, ctx).flatMap((t) => t.p.map((q, i) => ({ x: q[0], y: q[1], z: q[2], c: t.c[i] })));
const lum = (k) => 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2];
const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
const sd = (a) => Math.sqrt(mean(a.map((x) => (x - mean(a)) ** 2)));
/** The height of the stair, a landing or the deck under (x, z) (the plane the physics walks on), null off them. */
const floorAt = (x, z) => {
  let best = null;
  for (const f of P.floors) if (pointInPoly(f.pts, x, z)) { const y = f.y + f.a * (x - f.px) + f.b * (z - f.pz); if (best === null || y > best) best = y; }
  return best;
};
/** The highest a walker's feet can be at (x, z) on the stair or the ground: the plane the physics walks on plus a riser (the tread's nosing stands a riser over it). The deck is not counted: the ladder is meant to be reached from there. */
const feetAt = (x, z) => {
  let best = A.plan.heightAt(x, z);
  for (const f of P.floors) if (f.id !== 'tower.deck' && pointInPoly(f.pts, x, z)) best = Math.max(best, f.y + f.a * (x - f.px) + f.b * (z - f.pz) + P.F / 13);
  return best;
};
const route = () => P.route.slice(0, -1).map((q, i) => [q, P.route[i + 1]]);
const laneDist = (x, z) => Math.min(...route().map(([a, b]) => segDist(x, z, a, b)));
/** A vertex that stands in a walker's way: within his 0.3 m of the route a walker takes, and between a step over the floor there and his crown. */
const inLane = (v) => {
  if (laneDist(v.x, v.z) >= 0.3) return false;
  const g = floorAt(v.x, v.z);
  return g !== null && v.y > g + 0.25 && v.y < g + 1.9;
};

/** The height of the triangle `q` over the point (x, z), or null when the point is not under or over it (a vertical triangle covers no point). */
function heightAt(q, x, z) {
  const [a, b, d] = q, den = (b[2] - d[2]) * (a[0] - d[0]) + (d[0] - b[0]) * (a[2] - d[2]);
  if (Math.abs(den) < 1e-9) return null;
  const l1 = ((b[2] - d[2]) * (x - d[0]) + (d[0] - b[0]) * (z - d[2])) / den, l2 = ((d[2] - a[2]) * (x - d[0]) + (a[0] - d[0]) * (z - d[2])) / den, l3 = 1 - l1 - l2;
  return l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9 ? null : l1 * a[1] + l2 * b[1] + l3 * d[1];
}
/** Where a walker's centre can be at deck level (the deck and the stair's top landing): over a floor at that height, a wall's half thickness and his 0.3 m radius clear of every wall that stands higher than the deck. */
function deckSpots(step = 0.1) {
  const floors = P.floors.filter((f) => Math.abs(f.y - dy) < 0.01), tall = P.walls.filter((w) => w.y1 > dy + 0.5), out = [];
  for (let x = T.x - R; x <= T.x + c; x += step) for (let z = T.z - c; z <= T.z + c; z += step) {
    if (!floors.some((f) => pointInPoly(f.pts, x, z))) continue;
    if (tall.some((w) => segDist(x, z, [w.x1, w.z1], [w.x2, w.z2]) < w.t + 0.3)) continue;
    out.push([x, z]);
  }
  return out;
}
/** The lowest thing from `list` that stands over (x, z) above a walker's feet at deck level, as a height over the deck (Infinity: open sky). */
const headroom = (list, x, z) => list.reduce((lo, t) => { const y = heightAt(t.p, x, z); return y !== null && y > dy + 0.2 ? Math.min(lo, y - dy) : lo; }, Infinity);
const overhead = () => MATS.flatMap((k) => tris(k)).filter((t) => Math.max(t.p[0][1], t.p[1][1], t.p[2][1]) > dy + 0.3);

test('the dressed tower builds clean and the same every time: no module error, no unknown material, no collider but the plan\'s, one tower vertex for vertex per seed (no Math.random)', () => {
  assert.deepEqual(A.errors, []);
  assert.deepEqual(B.errors, [], 'a world with no glow registry builds as well');
  assert.equal(A.matlib?.missing?.size ?? 0, 0, `unknown materials: ${[...(A.matlib?.missing ?? [])].join(', ')}`);
  assert.ok(T && B.world.tower && B.world.tower.x === T.x && B.world.tower.z === T.z, 'both worlds built the tower on the same site');
  assert.deepEqual(D, towerDress(T.x, T.z, T.y0, A.plan.heightAt), 'the dress the mesh was built from is a pure function of the site');
  const same = (a, b) => ['x1', 'z1', 'x2', 'z2', 't', 'y0', 'y1'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);
  const inRing = (x, z) => Math.abs(x - T.x) < R + 0.6 && Math.abs(z - T.z) < R + 0.6;
  const strays = A.physics.walls.filter((w) => (inRing(w.x1, w.z1) || inRing(w.x2, w.z2)) && !P.walls.some((p) => same(p, w)));
  assert.deepEqual(strays.map((w) => `${w.id} (${w.x1.toFixed(2)}, ${w.z1.toFixed(2)})`), [], 'the dressing adds no collider: the stair has the walls of its plan and no others');
  const digest = (ctx) => MATS.map((k) => {
    let s = 0; const ts = tris(k, ctx);
    for (const t of ts) for (let i = 0; i < 3; i++) s += t.p[i][0] * 1.3 + t.p[i][1] * 2.1 + t.p[i][2] * 3.7 + t.c[i][0] * 11 + t.c[i][1] * 13 + t.c[i][2] * 17;
    return `${k} ${ts.length} ${s.toFixed(3)}`;
  });
  assert.deepEqual(digest(B), digest(A), 'two builds of the one seed give the same tower, vertex for vertex');
  assert.ok(digest(A).every((line) => !/ 0 /.test(line)), `every material of the tower holds triangles: ${digest(A).map((l) => l.split(' ').slice(0, 2).join(' ')).join(', ')}`);
});

test('the roof leaves 2.45 m of headroom over every spot a walker can stand on at deck level, the stair\'s way in included (TEETH: a piece hung at 2.3 m over the deck is found, and so is a roof 0.4 m lower)', () => {
  const spots = deckSpots(), list = overhead(), entry = spots.filter(([x]) => x < T.x - c - 0.05);
  assert.ok(spots.length > 200 && entry.length >= 10, `${spots.length} spots on the deck, ${entry.length} of them on the stair's top landing`);
  assert.ok(list.length > 150, `${list.length} triangles overhead (the roof, its plate and rafters, the lantern, the mast and the flag)`);
  const low = spots.map(([x, z]) => ({ x: +(x - T.x).toFixed(2), z: +(z - T.z).toFixed(2), h: +headroom(list, x, z).toFixed(2) })).filter((s) => s.h < 2.45);
  assert.deepEqual(low.slice(0, 3), [], `${low.length} spots with less than 2.45 m over them`);
  const centre = headroom(list, T.x, T.z);
  assert.ok(Number.isFinite(centre) && centre > 2.45, `a roof stands over the middle of the deck, ${centre.toFixed(2)} m up`);
  assert.ok(entry.every(([x, z]) => headroom(list, x, z) >= 2.45), 'the way in from the stair is clear');
  const hung = [...list, { p: [[T.x - 1, dy + 2.3, T.z - 1], [T.x + 1, dy + 2.3, T.z - 1], [T.x, dy + 2.3, T.z + 1]], c: [] }];
  assert.ok(headroom(hung, T.x, T.z - 0.5) < 2.45, 'TEETH: a piece at 2.3 m over the deck is found');
  assert.equal(headroom([], T.x, T.z), Infinity, 'TEETH: with nothing overhead the check reads open sky');
  const lowRoof = list.map((t) => ({ ...t, p: t.p.map(([x, y, z]) => [x, y - 0.4, z]) }));
  assert.ok(spots.some(([x, z]) => headroom(lowRoof, x, z) < 2.45), 'TEETH: the same roof 0.4 m lower is found');
  const RF = D.roof;
  assert.ok(RF.eaveY - dy >= 2.5 && RF.apexY > RF.eaveY + 1 && RF.half > c, `the roof: its eave ${(RF.eaveY - dy).toFixed(2)} m over the deck, its apex ${(RF.apexY - dy).toFixed(2)}, reaching ${RF.half.toFixed(2)} m from the centre`);
  assert.equal(RF.posts.length, 4, 'four slender posts carry it');
  assert.ok(RF.posts.every(([x, z]) => Math.abs(x - T.x) >= c - 0.2 && Math.abs(z - T.z) >= c - 0.2), 'they stand at the corners of the deck');
  for (const [x, z] of RF.posts) assert.ok(spots.every(([sx, sz]) => Math.hypot(sx - x, sz - z) > 0.3), `no spot a walker can stand on lies within his own width of the post at (${(x - T.x).toFixed(2)}, ${(z - T.z).toFixed(2)})`);
  const tile = tris('roof_tile_clay').filter((t) => Math.min(...t.p.map((q) => q[1])) > dy + 2.5);
  assert.ok(tile.length >= 12 && tile.every((t) => t.p.every((q) => Math.abs(q[0] - T.x) <= RF.half + 0.1 && Math.abs(q[2] - T.z) <= RF.half + 0.1)), `${tile.length} roof tiles over the deck, none reaching past the eave (the hip ridge caps overhang a corner by their half width)`);
});

test('the lantern: four panes of glass round a lit bulb, a tiny roof of its own and a finial over it, the mast and the flag clear of the roof; one warm street lamp in it, registered once, which the engine\'s glow turns into its halo (TEETH: without the lamp in the registry there is no halo, and the tower adds nothing to ctx.glow)', () => {
  const lamp = D.lamp, near = (g) => Math.hypot(g.x - T.x, g.z - T.z) < R + 2, LN = D.roof.lantern;
  for (const ctx of [A, B]) {                                                                                    // with a glow registry (A) and without one (B: a headless world has none)
    const lit = ctx.lights.list.filter(near), name = ctx === A ? 'A' : 'B';
    assert.equal(lit.length, 1, `one light near the tower in ${name}, ${lit.length} found`);
    const L = lit[0], r = (L.color >> 16) & 255, g = (L.color >> 8) & 255, bl = L.color & 255;
    assert.ok(L.kind === 'street' && L.on !== false && [L.x, L.y, L.z].every((v, i) => v === [lamp.x, lamp.y, lamp.z][i]), `a street lamp hangs where the lantern stands (${name})`);
    assert.ok(r >= g && g > bl && r > 200 && L.intensity >= 8 && L.distance >= 6 && L.distance <= 14, `a warm light (0x${L.color.toString(16)}) that reaches the deck under the roof: ${L.intensity} cd over ${L.distance} m`);
  }
  assert.equal(glowLog.list.filter(near).length, 0, 'the tower adds nothing to ctx.glow: the vista test counts every entry of that registry as a lit window of the far city');
  assert.ok(B.glow === undefined && glowLog.list.length > 800, 'TEETH: the recorder holds the far city\'s windows, so an entry of the tower would have shown above');
  const finalize = (list) => { const gl = new Glow({ lights: { list }, scene: { add() {}, remove() {} }, plan: A.plan }); gl.finalize({}); return gl; };
  const halo = finalize(A.lights.list), pos = halo.points.geometry.attributes.position;
  assert.equal(halo.street.filter(near).length, 1, 'the engine\'s glow takes the lantern for a street lamp: one sprite for it');
  assert.ok(Array.from({ length: pos.count }, (_, i) => Math.hypot(pos.getX(i) - lamp.x, pos.getY(i) - lamp.y, pos.getZ(i) - lamp.z)).some((d) => d < 1e-4), 'and it sits in the lantern');
  assert.equal(finalize(A.lights.list.filter((l) => !near(l))).street.filter(near).length, 0, 'TEETH: without the lantern\'s lamp in the registry the glow has no sprite there');
  assert.ok(lamp.y > D.roof.apexY && lamp.y - dy > 3.9, `the lamp is over the roof's apex, ${(lamp.y - dy).toFixed(2)} m over the deck`);
  const bulb = verts('lamp_glow').filter((v) => Math.hypot(v.x - lamp.x, v.z - lamp.z) < 0.2 && Math.abs(v.y - lamp.y) < 0.2);
  assert.ok(bulb.length >= 8 && verts('lamp_glow').length === bulb.length, `the one emissive bulb stands in the lantern (${bulb.length} vertices)`);
  const panes = tris('glass').filter((t) => t.p.every((q) => q[1] > LN.y && q[1] < LN.y + LN.h + 0.1));
  assert.equal(panes.length, 8, 'four panes of glass, two triangles each');
  assert.ok(panes.every((t) => t.p.every((q) => Math.abs(q[0] - T.x) <= LN.half + 0.001 && Math.abs(q[2] - T.z) <= LN.half + 0.001)), 'round the lamp, inside the posts');
  const tiny = tris('roof_tile_clay').filter((t) => Math.min(...t.p.map((q) => q[1])) >= LN.y + LN.h - 0.01);
  assert.ok(tiny.length === 4 && tiny.every((t) => t.p.every((q) => Math.hypot(q[0] - T.x, q[2] - T.z) <= 0.57)), 'the lantern has a roof of its own: four small tiled facets over the glass');
  const apexTiny = Math.max(...tiny.flatMap((t) => t.p.map((q) => q[1])));
  const finial = verts('iron_black').filter((v) => Math.hypot(v.x - T.x, v.z - T.z) < 0.06 && v.y > apexTiny - 0.05 && v.y < apexTiny + 0.3);
  assert.ok(finial.length >= 12, `a finial over it (${finial.length} vertices)`);
  const mast = verts('iron_black').filter((v) => Math.hypot(v.x - T.x, v.z - T.z) < 0.03 && v.y > apexTiny + 0.3);
  const flag = verts('plaster_a').filter((v) => v.y > apexTiny + 0.2);
  assert.ok(mast.length >= 6 && Math.max(...mast.map((v) => v.y)) - dy > 5.5, `a mast (${mast.length} vertices) ${(Math.max(...mast.map((v) => v.y)) - dy).toFixed(2)} m over the deck`);
  assert.ok(flag.length >= 72 && Math.min(...flag.map((v) => v.y)) > apexTiny + 0.5, `the flag (three bands, ${flag.length} vertices) flies clear over the lantern's roof`);
  assert.ok(flag.every((v) => Math.max(...mast.map((m) => m.y)) - v.y < 0.6), 'at the head of the mast');
});

test('the stair\'s iron railing: a post about every metre, every one on the outer line, a top rail and a mid rail on every run, a pier at each corner and at the foot, nothing of it in a walker\'s lane (TEETH: a piece put on the route is found)', () => {
  const nodes = D.rail.nodes, posts = nodes.filter((n) => n.kind === 'post'), newels = nodes.filter((n) => n.kind === 'newel'), e = R - D.rail.inset;
  assert.ok(posts.length >= 18 && newels.length === 5 && nodes.filter((n) => n.kind === 'end').length === 1, `${posts.length} posts, ${newels.length} piers`);
  for (const n of [...posts, ...newels]) {
    const lx = n.x - T.x, lz = n.z - T.z;
    assert.ok(Math.abs(Math.max(Math.abs(lx), Math.abs(lz)) - e) < 1e-6, `the post at (${lx.toFixed(2)}, ${lz.toFixed(2)}) stands on the outer line, ${e.toFixed(2)} m from the centre`);
  }
  for (let i = 0; i + 1 < nodes.length; i++) { const d = Math.hypot(nodes[i + 1].x - nodes[i].x, nodes[i + 1].z - nodes[i].z); assert.ok(d > 0.9 && d < 1.3, `posts ${i} and ${i + 1} stand ${d.toFixed(2)} m apart`); }
  const iron = verts('iron_black'), paint = verts('plaster_rough#e3d9c6');
  for (const n of posts) {
    const mine = iron.filter((v) => Math.abs(v.x - n.x) < 0.05 && Math.abs(v.z - n.z) < 0.05);
    assert.ok(mine.length >= 8 && Math.max(...mine.map((v) => v.y)) >= n.y + D.rail.top && Math.min(...mine.map((v) => v.y)) <= n.y + D.rail.cap, `an iron post stands at (${(n.x - T.x).toFixed(2)}, ${(n.z - T.z).toFixed(2)}), from the wall-cap to the top rail`);
  }
  for (const n of newels) assert.ok(paint.some((v) => Math.abs(v.x - n.x) < 0.12 && Math.abs(v.z - n.z) < 0.12 && v.y >= n.y + 1.0), `a stucco pier stands at (${(n.x - T.x).toFixed(2)}, ${(n.z - T.z).toFixed(2)})`);
  for (const r of D.rail.runs) for (const h of [D.rail.top, D.rail.mid]) for (const [x, y, z] of [[r.x0, r.y0, r.z0], [r.x1, r.y1, r.z1]]) {
    assert.ok(iron.some((v) => Math.hypot(v.x - x, v.z - z) < 0.07 && Math.abs(v.y - (y + h)) < 0.04), `a rail ${h} m over the stair ends at (${(x - T.x).toFixed(2)}, ${(z - T.z).toFixed(2)})`);
  }
  const deckRail = iron.filter((v) => Math.abs(v.x - T.x) < c && Math.abs(v.z - T.z) < c && v.y > dy + 0.9 && v.y < dy + 1.1);
  assert.ok(deckRail.length >= 48, `the deck's own handrail is the one the stair's matches (${deckRail.length} vertices of top rail)`);
  const inTheWay = (vs) => vs.filter(inLane);
  assert.deepEqual(inTheWay(iron).slice(0, 3), [], 'no iron of the railing, the roof or the deck reaches into the 0.3 m round the route a walker takes');
  assert.deepEqual(inTheWay(paint).slice(0, 3), [], 'no stucco of the rail, its piers or the pillars does either');
  const g = floorAt(P.route[3][0], P.route[3][1]), onRoute = [...iron, { x: P.route[3][0], y: g + 0.5, z: P.route[3][1], c: [0, 0, 0] }];
  assert.equal(inTheWay(onRoute).length, inTheWay(iron).length + 1, 'TEETH: a piece of railing put on the route is found');
  assert.ok(P.route.length === 15 && iron.filter((v) => laneDist(v.x, v.z) < 0.5).length > 0, 'the check has the real route, and railing within reach of it to measure');
});

test('the maintenance ladder: out of reach (its lowest rung 2.4 m over the highest step under it), clear of every flight, the core, the colliders and the board, up to the parapet, in a cage on its top 2.5 m (TEETH: a ladder at a walker\'s reach, or inside a flight, is found)', () => {
  const L = D.ladder, S = T.sign;
  const pieces = tris('rusty_iron').filter((t) => t.p.every((q) => q[0] > L.x - 0.001 && q[0] < L.x + 1.0 && q[2] > T.z + 0.6 && q[2] < T.z + 2.1 && q[1] > T.y0 + 5));
  const vs = pieces.flatMap((t) => t.p);
  assert.ok(pieces.length >= 250, `${pieces.length} triangles in the ladder (stiles, rungs, brackets, hoops)`);
  let ground = -Infinity;
  for (const dx of [0, 0.2, 0.4, 0.6]) for (const dz of [-0.3, -0.15, 0, 0.15, 0.3]) ground = Math.max(ground, feetAt(L.x + L.off + dx, L.z + dz));   // the highest step a walker's feet find under the ladder's foot
  const rung0 = Math.min(...L.rungs), lowest = Math.min(...vs.filter((q) => q[1] < dy - 0.5).map((q) => q[1]));
  assert.ok(ground > T.y0 + 3 && ground < T.y0 + 4, `the highest step under it is ${(ground - T.y0).toFixed(2)} m over the tower's foot`);
  assert.ok(rung0 - ground >= 2.4, `the lowest rung is ${(rung0 - ground).toFixed(2)} m over the highest step under it`);
  assert.ok(lowest - ground >= 2.4, `nothing of the ladder hangs lower: its lowest vertex is ${(lowest - ground).toFixed(2)} m over the step`);
  assert.ok(rung0 - 3.5 - ground < 2.4 && lowest - 0.5 - ground < 2.4, 'TEETH: the same ladder 3.5 m lower, or its stiles 0.5 m lower, is within a walker\'s reach and is found');
  assert.equal(L.rungs.length, 17, 'seventeen rungs');
  for (let k = 1; k < L.rungs.length; k++) assert.ok(Math.abs(L.rungs[k] - L.rungs[k - 1] - 0.3) < 1e-9, 'a rung every 0.3 m');
  for (const y of L.rungs) assert.ok(pieces.filter((t) => Math.abs((t.p[0][1] + t.p[1][1] + t.p[2][1]) / 3 - y) < 0.03 && t.p.every((q) => Math.abs(q[2] - L.z) <= L.w / 2 + 0.001)).length >= 8, `a rung stands at ${(y - T.y0).toFixed(2)} m, from stile to stile`);
  assert.ok(Math.max(...vs.map((q) => q[1])) >= dy + TOWER.parapet && L.rungs.at(-1) >= dy + 0.8, `it reaches the parapet (the top rung ${(L.rungs.at(-1) - dy).toFixed(2)} m over the deck, the stiles ${(Math.max(...vs.map((q) => q[1])) - dy).toFixed(2)} m)`);
  const cage = pieces.filter((t) => t.p.some((q) => q[0] > L.x + L.off + 0.3)), cy = cage.flatMap((t) => t.p.map((q) => q[1]));
  assert.ok(cage.length >= 100 && Math.min(...cy) >= L.cageTop - L.cage - 0.05 && Math.max(...cy) <= L.cageTop + 0.05, `a cage of ${cage.length} triangles hoops the top ${L.cage} m (${(Math.min(...cy) - T.y0).toFixed(2)} to ${(Math.max(...cy) - T.y0).toFixed(2)} m)`);
  // clear of the solid: no vertex inside a tread, a landing or the core, none inside a collider of the stair's rim or the deck's parapet
  const inBlock = (q) => P.landings.some((l) => q[0] > l.x0 + 1e-4 && q[0] < l.x1 - 1e-4 && q[2] > l.z0 + 1e-4 && q[2] < l.z1 - 1e-4 && q[1] < T.y0 + l.top) || P.flights.some((f) => {
    const dx = q[0] - (T.x + f.ax), dz = q[2] - (T.z + f.az), u = dx * f.ux + dz * f.uz, w = Math.abs(-dx * f.uz + dz * f.ux);
    return u > 0 && u < f.len && w < TOWER.arm / 2 - 1e-4 && q[1] < T.y0 + f.h0 + (Math.floor(u / (f.len / f.n)) + 1) * (f.rise / f.n);
  });
  assert.deepEqual(vs.filter(inBlock).slice(0, 3), [], 'no part of the ladder is inside a flight or a landing');
  const inCore = (x, y, z) => y < dy - 0.01 && Math.abs(x - T.x) < c - 1e-3 && Math.abs(z - T.z) < c - 1e-3;
  assert.deepEqual([...verts('rusty_iron'), ...verts('iron_black')].filter((v) => inCore(v.x, v.y, v.z)).slice(0, 3), [], 'nor inside the core: nothing of the dressing is');
  const colliders = P.walls.filter((w) => w.t > 0.06 || w.y1 > dy + 0.5);                                      // the stair's outer rim and the deck's parapet (the core's own walls are 0.05 thick: the ladder leans on one)
  const hit = vs.filter((q) => colliders.some((w) => q[1] > w.y0 && q[1] < w.y1 && segDist(q[0], q[2], [w.x1, w.z1], [w.x2, w.z2]) < w.t - 1e-6));
  assert.deepEqual(hit.slice(0, 3), [], 'no part of the ladder is inside a collider of the stair or the parapet');
  assert.ok(colliders.length >= 8 && P.walls.length === 13, 'the colliders the ladder is checked against are the plan\'s own');
  const board = vs.filter((q) => Math.abs(q[0] - S.x) < 0.4 && Math.abs(q[2] - S.z) < S.w / 2 + 0.1 && q[1] > S.y - 0.1 && q[1] < S.y + S.h + 0.1);
  assert.equal(board.length, 0, 'it does not cross the MIRADOR board');
  assert.ok(Math.abs(L.x - T.x - c) < 1e-9 && Math.sign(L.x - T.x) !== S.side && L.z - T.z > 0 && L.z - T.z < c, 'it climbs the face the plaza does not see, clear of the deck\'s way in on the west');
  const intruder = [...vs, [L.x + 0.5, T.y0 + 2, L.z]];
  assert.equal(intruder.filter(inBlock).length, 1, 'TEETH: a point put inside flight B is found by the same test');
  assert.ok(inCore(T.x, T.y0 + 7, T.z) && !inCore(L.x + L.off, T.y0 + 7, L.z) && !inCore(T.x, dy + 0.12, T.z), 'TEETH: a point inside the core is found, one on the ladder\'s side of its face and one over the deck are not');
});

test('the dressing is weathered: the stair blocks streak, darken and moss at the foot, rust runs under every post and from the deck\'s, the rails peel (TEETH: a flat grey, a dry foot and grey concrete without moss are each found)', () => {
  const rim = verts('concrete_bare').filter((v) => Math.abs(Math.max(Math.abs(v.x - T.x), Math.abs(v.z - T.z)) - R) < 0.002 && v.y <= dy + 0.01).map((v) => ({ ...v, h: v.y - T.y0, t: lum(v.c) }));
  const problems = (vs) => {
    const up = vs.filter((v) => v.h > 4 && v.h < 9).map((v) => v.t), foot = vs.filter((v) => v.h > 0.1 && v.h < 1.0).map((v) => v.t), out = [];
    if (!(up.length > 20 && sd(up) > 0.04)) out.push(`the blocks between 4 and 9 m vary by only ${sd(up).toFixed(3)} (${up.length} vertices): a flat clean grey`);
    if (!(foot.length > 20 && mean(foot) < mean(up) * 0.88)) out.push(`the foot (${mean(foot).toFixed(2)}) is no darker than the block above it (${mean(up).toFixed(2)}): no damp`);
    return out;
  };
  assert.ok(rim.length > 500, `${rim.length} vertices on the stair blocks' outer faces`);
  assert.deepEqual(problems(rim), []);
  assert.equal(problems(rim.map((v) => ({ ...v, t: 0.9 }))).length, 2, 'TEETH: a flat grey stair fails on both counts');
  assert.equal(problems(rim.map((v) => ({ ...v, t: v.h < 1.0 ? v.t / 0.7 : v.t }))).length, 1, 'TEETH: a foot as bright as the block above it fails on the damp alone');
  const moss = (vs) => vs.filter((v) => v.c[1] > v.c[0] * 1.08 && v.c[1] > v.c[2] * 1.2);
  assert.ok(moss(rim).length >= 8 && moss(rim).every((v) => v.h < 3), `${moss(rim).length} mossy vertices on the blocks, all near the ground`);
  assert.equal(moss(rim.map((v) => ({ ...v, c: [v.t, v.t, v.t] }))).length, 0, 'TEETH: grey concrete has no moss');
  const rust = verts('rusty_iron'), isRust = (v) => v.c[0] > v.c[2] * 1.25 && v.c[0] >= v.c[1];
  const runs = D.rail.nodes.filter((n) => n.kind === 'post').map((n) => rust.filter((v) => Math.hypot(v.x - n.x, v.z - n.z) < 0.12 && v.y > n.y + 0.35 && v.y < n.y + 0.55 && isRust(v)).length);
  assert.ok(runs.length >= 18 && runs.every((k) => k >= 6), `a rust run under every one of the ${runs.length} posts, on both faces of the rail (three head vertices each): ${runs.join(' ')}`);
  assert.ok(rust.filter(isRust).length > rust.length * 0.9, 'the rust is rust-coloured, not grey');
  const boots = rust.filter((v) => v.y > dy + 0.1 && v.y < dy + 0.2 && Math.abs(v.x - T.x) < c + 0.2 && Math.abs(v.z - T.z) < c + 0.2);
  const down = rust.filter((v) => Math.abs(Math.max(Math.abs(v.x - T.x), Math.abs(v.z - T.z)) - c - 0.014) < 0.002 && v.y > dy - 4);
  assert.ok(boots.length >= 60 && down.length >= 24, `the deck's handrail posts stand in rust (${boots.length} vertices) that has run down the core's faces (${down.length})`);
  const rails = verts('plaster_rough#e3d9c6').filter((v) => v.y < dy + 1.3), ratio = rails.map((v) => v.c[2] / v.c[0]), tone = rails.map((v) => lum(v.c));
  assert.ok(rails.length > 300 && sd(ratio) > 0.02 && sd(tone) > 0.04, `the stucco rails vary in hue (sd ${sd(ratio).toFixed(3)}) and tone (sd ${sd(tone).toFixed(3)}): ochre bloom, grey mould, peeled paint`);
  assert.ok(tone.filter((x) => x < 0.75 * Math.max(...tone)).length >= 10, 'patches of bare render show through the paint');
  assert.ok(sd(rails.map(() => 0.95)) < 0.001 && sd(rails.map(() => 0.95)) < sd(tone) / 10, 'TEETH: a plain coat of paint has no spread to measure');
});

test('the stair\'s welcome and wear: a hazard band on the first step, a rusted chain on the entry wall, spalled corners with the rebar showing, two tags and a bill at hand height, and the MIRADOR board untouched', () => {
  const f0 = P.flights[0], nose = T.y0 + f0.rise / f0.n + 0.004;
  const band = verts('plaster_a').filter((v) => Math.abs(v.y - nose) < 0.003 && v.x < T.x - c + 0.2 && v.z > T.z + c - 0.001);
  assert.ok(band.length >= 48 && band.filter((v) => lum(v.c) < 0.2).length >= 12 && band.filter((v) => v.c[0] > 0.7 && v.c[2] < 0.4).length >= 12, `a band of warning stripes on the first nosing: ${band.length} vertices, black and yellow`);
  const chain = verts('rusty_iron').filter((v) => Math.abs(v.z - (T.z + c)) < 0.05 && v.x > T.x - c - TOWER.arm && v.x < T.x - c && v.y > T.y0 + 0.4 && v.y < T.y0 + 1.1);
  assert.ok(chain.length >= 150, `a chain hangs on the entry wall (${chain.length} vertices of rust iron there)`);
  const dark = verts('concrete_bare').filter((v) => v.c.every((k) => k > 0.25 && k < 0.32)), rim = verts('concrete_bare').filter((v) => v.c.every((k) => k > 0.6 && k < 0.7));
  assert.ok(dark.length >= 36 && rim.length >= 36, `three spalled corners: ${dark.length} vertices of dark chipped concrete, ${rim.length} of pale rim`);
  const stubs = verts('rusty_iron').filter((v) => v.c[0] > 0.65 && v.c[0] < 0.75 && v.c[1] > 0.4 && v.c[1] < 0.5 && v.c[2] < 0.35);
  assert.ok(stubs.length >= 40, `the rebar shows in them (${stubs.length} vertices of rust stubs)`);
  // tags and a bill: flat panels, each facing out of its wall, a hand's reach over the step or the ground in front
  const signs = tris('world_sign'), tags = D.tags.filter((t) => t.key.startsWith('tag.')), bills = D.tags.filter((t) => t.key.startsWith('poster.'));
  assert.ok(tags.length >= 2 && bills.length >= 1 && new Set(tags.map((t) => t.key)).size >= 2, `${tags.length} tags (${[...new Set(tags.map((t) => t.key))].join(', ')}) and ${bills.length} bill planned`);
  for (const t of D.tags) {
    const x = t.x + t.ox * 0.012, z = t.z + t.oz * 0.012, rx = t.oz, rz = -t.ox, hw = t.w / 2, lo = t.y + Math.min(0, t.tilt), hi = t.y + t.h + Math.max(0, t.tilt);
    const mine = signs.filter((s) => s.p.every((q) => Math.abs((q[0] - x) * t.ox + (q[2] - z) * t.oz) < 1e-4 && Math.abs((q[0] - x) * rx + (q[2] - z) * rz) <= hw + 1e-4 && q[1] >= lo - 1e-4 && q[1] <= hi + 1e-4));
    assert.equal(mine.length, 2, `${t.key} at (${(t.x - T.x).toFixed(2)}, ${(t.z - T.z).toFixed(2)}): one quad, two triangles`);
    const [a, b2, d] = mine[0].p, u = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], w = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    const n = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]], nl = Math.hypot(...n);
    const away = (n[0] * (t.x - T.x) + n[2] * (t.z - T.z)) / (nl * Math.hypot(t.x - T.x, t.z - T.z));          // the quad's normal against the way from the tower's centre to the panel
    assert.ok((n[0] * t.ox + n[2] * t.oz) / nl > 0.99 && away > 0.5, `${t.key} faces out of its wall, away from the tower (${away.toFixed(2)})`);
    const reach = t.y - feetAt(t.x + t.ox * 0.5, t.z + t.oz * 0.5);
    assert.ok(reach >= 0.8 && reach <= 1.5 && t.h <= 0.5, `${t.key} hangs ${reach.toFixed(2)} m over the step or the ground in front of it`);
  }
  const S = T.sign, board = signs.filter((s) => { const x = (s.p[0][0] + s.p[1][0] + s.p[2][0]) / 3, z = (s.p[0][2] + s.p[1][2] + s.p[2][2]) / 3; return Math.abs(x - S.x) < 0.3 && Math.abs(z - S.z) < 2; });
  assert.equal(board.length, 2, 'the MIRADOR board is still its one quad, with no tag or bill on it');
  assert.equal(signs.length, 2 * (D.tags.length + 1), 'the tower\'s sign triangles are the board, the tags and the bill, and nothing else');
});

test('budget: the dressing adds at most 4000 triangles to the tower\'s 3212, in no material the world does not already have', () => {
  const per = Object.fromEntries(MATS.map((k) => [k, tris(k).length])), total = Object.values(per).reduce((s, n) => s + n, 0);
  assert.ok(total > BASE_TRIANGLES && total - BASE_TRIANGLES <= 4000, `${total} triangles in the tower's meshes (+${total - BASE_TRIANGLES}): ${JSON.stringify(per)}`);
  assert.ok(MATS.every((k) => A.mat(k)) && (A.matlib?.missing?.size ?? 0) === 0, 'every material the tower names is in the library');
  assert.ok(Object.values(per).every((n) => n > 0), 'each of the tower\'s materials is in use');
});
