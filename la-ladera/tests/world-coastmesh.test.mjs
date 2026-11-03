// The beach strip's mesh (A5, js/world/coastmesh.js, dev/FEATURE-BEACH.md 1.8 and 3.1): the ground between the plot's walls (x -100..100), z 100 to 300, is drawn from the physics ground,
// the sea wall, its rail, the stairs and the ramp stand where the physics has them, and the far land (periphery.js) meets the strip without a seam, a gap or an overlap.
// Each check that can go vacuous has a TEETH next to it; the checks that compare the mesh with a function are proved by breaking the source (see the handoff notes).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-coastmesh.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { buildFarTerrain } from '../js/world/periphery.js';
import { COAST_TERRAIN, COAST_DECK } from '../js/world/coastmesh.js';
import { SEA, DECK, DECK_Z, TOE, RAMP_END_Z, GATE, CHEEK, rampY } from '../js/world/coast.js';
import { SEED } from './world-lib.mjs';

const ctx = createContext({ seed: SEED, headless: true, coast: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
await buildWorld(ctx); await buildProps(ctx); ctx.batch.flushAll();
const plan = ctx.plan, C = plan.coast, W = ctx.world;
const terrain = ctx.batch.groups.get(COAST_TERRAIN).meshes, deck = ctx.batch.groups.get(COAST_DECK).meshes;
const byMat = (list, key) => list.find((m) => m.userData.matKey === key);

/** Every triangle of a mesh as { v: [[x, y, z] x3], n: unit normal, area, c: centroid }, from the positions and the winding alone. */
function triangles(mesh) {
  const P = mesh.geometry.attributes.position, I = mesh.geometry.index, out = [];
  for (let t = 0; t < I.count; t += 3) {
    const v = [0, 1, 2].map((k) => { const i = I.getX(t + k); return [P.getX(i), P.getY(i), P.getZ(i)]; });
    const a = [0, 1, 2].map((k) => v[1][k] - v[0][k]), b = [0, 1, 2].map((k) => v[2][k] - v[0][k]);
    const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...n) || 1;
    out.push({ v, n: n.map((q) => q / l), area: l / 2, c: [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k]) / 3) });
  }
  return out;
}
const up = (t) => t.n[1] > 0.5;                                              // a face that looks up (the ground), as against a skirt or a wall
const onWall = (t) => Math.abs(Math.abs(t.n[2]) - 1) < 1e-6 && t.v.every((p) => Math.abs(p[2] - DECK_Z) < 1e-9);       // a triangle in the plane of the sea wall's face
const planArea = (t) => Math.abs((t.v[1][0] - t.v[0][0]) * (t.v[2][2] - t.v[0][2]) - (t.v[2][0] - t.v[0][0]) * (t.v[1][2] - t.v[0][2])) / 2;
const inTri = (t, x, z) => {
  const [a, b, c] = t.v, d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
  const u = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d, w = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
  return u >= 0 && w >= 0 && u + w <= 1;
};

test('the strip is drawn as three materials and a deck group, inside its triangle budgets, and the ground casts no shadow', () => {
  assert.deepEqual(terrain.map((m) => m.userData.matKey).sort(), ['promenade_pavers', 'sand_dry', 'seabed_sand']);
  assert.ok(terrain.every((m) => m.castShadow === false), 'the ground casts no shadow');
  const tris = terrain.reduce((n, m) => n + m.geometry.index.count / 3, 0), deckTris = deck.reduce((n, m) => n + m.geometry.index.count / 3, 0);
  assert.equal(W.beach.tris, tris, 'the published count is the mesh');
  assert.equal(W.beach.deckTris, deckTris);
  assert.ok(tris >= 12000 && tris <= 16000, `${tris} terrain triangles (the budget is 16,000)`);
  assert.ok(deckTris >= 800 && deckTris <= 3000, `${deckTris} sea wall, rail, stair and ramp triangles`);
  assert.equal(W.beach.live, true, 'the world was built with the coast live: its colliders and the gate stand');
  assert.deepEqual(ctx.errors, []);
});

test('the ground is the physics ground: every vertex stands at meshHeight (a skirt 1.5 m below it), none is NaN, every normal is a unit vector, none lies outside the strip', () => {
  let worst = 0, skirts = 0, verts = 0;
  for (const m of terrain) {
    const P = m.geometry.attributes.position, N = m.geometry.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      const x = P.getX(i), y = P.getY(i), z = P.getZ(i), h = C.meshHeight(x, m.userData.matKey === 'promenade_pavers' ? Math.min(z, DECK_Z - 1e-4) : z);       // the deck is flat to its edge (its last row is the deck's height, the wall's drop is the wall face's)
      assert.ok(Number.isFinite(x + y + z) && Number.isFinite(h), `a finite vertex ${i} of ${m.name}`);
      assert.ok(x >= -100 - 1e-6 && x <= 100 + 1e-6 && z >= 100 - 1e-6 && z <= 300 + 1e-6, `vertex ${x},${z} lies in the strip`);
      const e = Math.min(Math.abs(y - h), Math.abs(y - (h - 1.5)));
      worst = Math.max(worst, e); if (Math.abs(y - (h - 1.5)) < 2e-3 && Math.abs(y - h) > 2e-3) skirts++;
      assert.ok(Math.abs(Math.hypot(N.getX(i), N.getY(i), N.getZ(i)) - 1) < 2e-3, `a unit normal at vertex ${i} of ${m.name}`);
      verts++;
    }
  }
  assert.ok(worst < 2e-3, `the mesh is ${worst.toFixed(4)} m off meshHeight at worst (Float32 storage allows 2 mm)`);
  assert.ok(skirts > 400 && skirts < verts * 0.2, `${skirts} skirt vertices of ${verts}: an apron on each side and the far end, and the ground itself is not one`);
  const y0 = C.meshHeight(0, 105), y1 = C.meshHeight(0, 200);
  assert.ok(Math.abs(y0 - DECK) < 0.01 && y1 < SEA - 1, `meshHeight is the deck at the plot's edge (${y0.toFixed(2)}) and open water at z 200 (${y1.toFixed(2)}): the check has a ground to differ from`);
});

/** The sample points where the up-facing triangles do not cover the strip exactly once (a lattice that keeps off the cell edges and their diagonals). */
function coverProblems(tris) {
  const bad = [];
  for (let x = -98.713; x < 100; x += 5.3) for (let z = 101.371; z < 300; z += 4.7) {
    let n = 0; for (const t of tris) if (inTri(t, x, z)) n++;
    if (n !== 1) bad.push(`${x.toFixed(1)},${z.toFixed(1)} is covered ${n} times`);
  }
  return bad;
}

test('the strip is covered once: its up-facing triangles tile the 200 x 200 m rectangle, with no gap and no overlap (TEETH: a hole and a doubled patch are each found)', () => {
  const tris = terrain.flatMap((m) => triangles(m)).filter(up);
  const area = tris.reduce((s, t) => s + planArea(t), 0);
  assert.ok(Math.abs(area - 40000) < 0.01, `${area.toFixed(3)} m2 seen from above, 40,000 wanted`);
  assert.deepEqual(coverProblems(tris).slice(0, 5), []);
  const near = (t) => Math.hypot(t.c[0] - 13.1, t.c[2] - 143.6) < 6;
  assert.ok(tris.filter(near).length >= 4, 'TEETH: a patch of triangles stands at the test point');
  assert.ok(coverProblems(tris.filter((t) => !near(t))).length > 0, 'TEETH: a hole in the ground is found');
  assert.ok(coverProblems([...tris, ...tris.filter(near)]).length > 0, 'TEETH: a patch drawn twice is found');
});

test('the materials follow the ground: the promenade is the deck, sand is dry, the seabed is under the water, and the sand ends where the physics water begins', () => {
  const pav = triangles(byMat(terrain, 'promenade_pavers')).filter(up), sand = triangles(byMat(terrain, 'sand_dry')).filter(up), bed = triangles(byMat(terrain, 'seabed_sand')).filter(up);
  assert.ok(pav.length >= 400 && sand.length >= 1500 && bed.length >= 4000, `${pav.length} paving, ${sand.length} sand, ${bed.length} seabed triangles`);
  for (const t of pav) assert.ok(t.c[2] <= DECK_Z + 1e-6 && (t.c[2] < 103.5 || Math.abs(t.c[1] - DECK) < 0.02), `paving at ${t.c[0].toFixed(1)},${t.c[2].toFixed(1)} is the deck (the first 3.5 m rise to it from the plot's edge)`);
  for (const t of sand) assert.ok(t.c[1] > SEA - 0.3, `sand at ${t.c[0].toFixed(1)},${t.c[2].toFixed(1)} stands ${t.c[1].toFixed(2)} m: that is under the water`);
  for (const t of bed) assert.ok(t.c[1] < SEA + 0.3, `seabed at ${t.c[0].toFixed(1)},${t.c[2].toFixed(1)} stands ${t.c[1].toFixed(2)} m: that is dry land`);
  for (const x of [-60, -20, 0, 45, 80]) {                                    // along each line the last sand triangle and the first seabed one are the waterline of the physics ground, to a cell
    const col = (list) => list.filter((t) => Math.abs(t.c[0] - x) < 1.01).map((t) => t.c[2]);
    const lastSand = Math.max(...col(sand)), firstBed = Math.min(...col(bed).filter((z) => z > 120));
    let line = NaN; for (let z = 120; z < 200; z += 0.05) if (C.heightAt(x, z) <= SEA) { line = z; break; }
    assert.ok(Number.isFinite(line) && lastSand <= line + 2.5 && firstBed >= line - 2.5, `x ${x}: the physics waterline is at z ${line.toFixed(1)}, the sand ends at ${lastSand.toFixed(1)} and the seabed starts at ${firstBed.toFixed(1)}`);
  }
});

test('the sea wall stands where the physics has it: its face covers the deck edge except the stairs and the ramp (200 - 24.2 m), and nothing of it stands in an access', () => {
  const face = triangles(byMat(deck, 'seawall_concrete')).filter(onWall), height = DECK - (TOE - 0.25);       // (the cheeks and the ramp's sides are in the same concrete: they are the next test's)
  assert.ok(face.length >= 40, `${face.length} triangles of wall face`);
  const area = face.reduce((s, t) => s + t.area, 0), gaps = C.accesses.map((a) => [a.x - a.w / 2, a.x + a.w / 2]), open = gaps.reduce((s, g) => s + g[1] - g[0], 0);
  assert.equal(C.accesses.length, 6, 'five stairs and a ramp');
  assert.ok(Math.abs(open - 24.2) < 1e-9, `the accesses are ${open.toFixed(3)} m wide`);
  assert.ok(face.every((t) => t.n[2] > 1 - 1e-6), 'a plane of its own along the deck edge, looking at the sea (no face of a cheek lies back to back with it)');
  assert.ok(Math.abs(area / height - (200 - open)) < 1e-3, `${(area / height).toFixed(3)} m of wall face, ${(200 - open).toFixed(1)} wanted`);
  for (const t of face) for (const [g0, g1] of gaps) assert.ok(t.c[0] < g0 + 1e-6 || t.c[0] > g1 - 1e-6, `wall at x ${t.c[0].toFixed(2)} stands in the access ${g0}..${g1}`);
  const top = Math.max(...face.flatMap((t) => t.v.map((p) => p[1]))), low = Math.min(...face.flatMap((t) => t.v.map((p) => p[1])));
  assert.ok(Math.abs(top - DECK) < 1e-6 && low < TOE - 0.2, `the face runs from the deck (${top.toFixed(2)}) to under the sand (${low.toFixed(2)})`);
  const rails = triangles(byMat(deck, 'iron_black'));
  for (const r of C.rails) assert.ok(rails.some((t) => t.v.every((p) => Math.abs(p[2] - r.z) < 0.1 && p[0] >= r.x1 - 0.1 && p[0] <= r.x2 + 0.1) && Math.max(...t.v.map((p) => p[1])) > DECK + 0.9), `the rail from ${r.x1} to ${r.x2} is drawn at its post height`);
  const gate = ctx.physics.walls.filter((w) => w.id === GATE);
  assert.ok(gate.length >= 1 && gate.every((w) => w.on === false), `the south gate is built and open: the beach is walkable (${gate.length} walls)`);
});

test('the stairs go down five treads to the sand and the ramp is a wedge no steeper than 1:12', () => {
  const treads = triangles(byMat(deck, 'stair_tread')).filter(up);
  assert.equal(treads.length, 2 * 5 * C.stairs.length, 'a quad on each of five treads of every flight');
  for (const a of C.stairs) {
    const mine = treads.filter((t) => Math.abs(t.c[0] - a.x) < a.w / 2), tops = [...new Set(mine.map((t) => +t.c[1].toFixed(3)))].sort((p, q) => q - p);
    assert.equal(tops.length, 5, `flight at x ${a.x}: five tread heights`);
    assert.ok(tops[0] < DECK && tops[0] > C.stairFoot && tops.at(-1) >= C.stairFoot - 1e-6, `flight at x ${a.x}: treads between the deck and the foot (${tops})`);
    assert.ok(tops.every((h, k) => k === 0 || tops[k - 1] - h > 0.05), `flight at x ${a.x}: every tread lower than the last`);
  }
  const ramp = triangles(byMat(deck, 'promenade_pavers')).filter(up), r = C.ramp, hs = ramp.flatMap((t) => t.v.map((p) => p[1])), zs = ramp.flatMap((t) => t.v.map((p) => p[2]));
  assert.ok(ramp.length >= 2 && Math.abs(Math.max(...hs) - DECK) < 1e-3 && Math.abs(Math.min(...zs) - DECK_Z) < 1e-3 && Math.abs(Math.max(...zs) - RAMP_END_Z) < 1e-3, 'a wedge from the deck edge to the end of the ramp');
  assert.ok(ramp.every((t) => t.c[0] > r.x - r.w / 2 - 1e-6 && t.c[0] < r.x + r.w / 2 + 1e-6), 'in its own access');
  const slope = (DECK - Math.min(...hs)) / (RAMP_END_Z - DECK_Z);
  assert.ok(slope <= 1 / 12 + 1e-6 && slope > 1 / 16, `the ramp falls ${slope.toFixed(4)} per metre (1:12 is the limit)`);
});

test('the cheeks and the ramp wear the sea wall\'s concrete and a rail, where the physics has them: two cheeks to a flight, flush with the deck, and a rail along each edge of the ramp', () => {
  const rest = triangles(byMat(deck, 'seawall_concrete')).filter((t) => !onWall(t)), rails = triangles(byMat(deck, 'iron_black')), coping = triangles(byMat(deck, 'concrete_bare')).filter(up);
  assert.equal(C.cheeks.length, 10, 'two cheeks to each of five flights');
  const inX = (t, x, h) => t.c[0] >= x - h - 1e-6 && t.c[0] <= x + h + 1e-6;
  for (const c of C.cheeks) {
    const mine = rest.filter((t) => inX(t, c.x, CHEEK.w / 2) && t.c[2] >= c.z1 - 1e-6 && t.c[2] <= c.z2 + 1e-6);
    assert.equal(mine.length, 6, `cheek ${c.id}: its two sides and its south end, in the sea wall's concrete (${mine.length} triangles)`);
    const top = Math.max(...mine.flatMap((t) => t.v.map((p) => p[1]))), low = Math.min(...mine.flatMap((t) => t.v.map((p) => p[1])));
    assert.ok(Math.abs(top - DECK) < 1e-6 && low < TOE - 0.2, `cheek ${c.id}: flush with the deck (${top.toFixed(2)}) and down under the sand (${low.toFixed(2)})`);
    const zs = mine.flatMap((t) => t.v.map((p) => p[2])), xs = mine.flatMap((t) => t.v.map((p) => p[0]));
    assert.ok(Math.abs(Math.min(...zs) - c.z1) < 1e-3 && Math.abs(Math.max(...zs) - c.z2) < 1e-3, `cheek ${c.id}: runs from z ${c.z1} to ${c.z2} (${Math.min(...zs).toFixed(2)} to ${Math.max(...zs).toFixed(2)})`);       // (positions are float32: a millimetre is the tolerance)
    assert.ok(Math.abs(Math.min(...xs) - (c.x - CHEEK.w / 2)) < 1e-3 && Math.abs(Math.max(...xs) - (c.x + CHEEK.w / 2)) < 1e-3, `cheek ${c.id}: ${CHEEK.w} m wide, centred on x ${c.x}`);
    assert.ok(coping.some((t) => inX(t, c.x, CHEEK.w / 2) && t.c[2] >= c.z1 && t.c[2] <= c.z2 && Math.abs(t.c[1] - DECK) < 1e-6), `cheek ${c.id}: a coping on its top`);
    assert.ok(rails.some((t) => t.v.every((p) => Math.abs(p[0] - c.x) < 0.1 && p[2] >= c.z1 && p[2] <= c.z2) && Math.max(...t.v.map((p) => p[1])) > DECK + 0.9), `cheek ${c.id}: a rail post at its full height`);
  }
  const r = C.ramp, sides = rest.filter((t) => Math.abs(Math.abs(t.n[0]) - 1) < 1e-6 && t.v.every((p) => Math.abs(Math.abs(p[0] - r.x) - r.w / 2) < 1e-6));
  assert.equal(sides.length, 2, 'the ramp\'s two side wedges, in the sea wall\'s concrete');
  assert.equal(rest.length, 6 * C.cheeks.length + 2, 'nothing else wears the sea wall\'s concrete but the wall, the cheeks and the ramp\'s sides');
  assert.equal(C.rampRails.length, 2, 'a rail along each edge of the ramp');
  const span = (t, k) => Math.max(...t.v.map((p) => p[k])) - Math.min(...t.v.map((p) => p[k]));
  for (const rr of C.rampRails) {
    const posts = rails.filter((t) => t.v.every((p) => Math.abs(p[0] - rr.x) < 0.1) && span(t, 2) < 0.1 && span(t, 1) > 0.5);                    // the sides of the posts along this edge
    assert.ok(new Set(posts.map((t) => Math.round(t.c[2]))).size >= 5,`the rail at x ${rr.x} has a post about every 2 m (${posts.length} post faces)`);
    for (const t of posts) assert.ok(Math.abs(Math.min(...t.v.map((p) => p[1])) - rampY(t.c[2])) < 0.06 && Math.abs(span(t, 1) - 0.95) < 0.01, `a post at z ${t.c[2].toFixed(2)} stands on the ramp's surface (${rampY(t.c[2]).toFixed(2)}) and is 0.95 m high`);
    assert.ok(rails.some((t) => t.v.every((p) => Math.abs(p[0] - rr.x) < 0.1) && span(t, 2) > rr.z2 - rr.z1 - 0.5), `the rail at x ${rr.x} has a bar along the whole edge`);
  }
});

// ---- the far land meets the strip
const farMeshes = ctx.batch.groups.get('world.terrain.far').meshes;
const farTris = farMeshes.flatMap((m) => triangles(m));
const inHole = (t) => Math.abs(t.c[0]) < 100 - 1e-6 && t.c[2] > 100 + 1e-6 && t.c[2] < 300 - 1e-6;

test('no far triangle lies in the strip (TEETH: the same far land built without a coast covers it), and the far tiles stop at the strip\'s edge', () => {
  assert.ok(farTris.length > 30000, `${farTris.length} far triangles`);
  assert.equal(farTris.filter(inHole).length, 0, 'the far land leaves the strip to coastmesh.js');
  const noCoast = createContext({ seed: SEED, headless: true });
  buildFarTerrain(noCoast, { ...plan, coast: null });
  const solid = noCoast.batch.groups.get('world.terrain.far').meshes.flatMap((m) => triangles(m)).filter(inHole);
  assert.ok(solid.length > 1000, `TEETH: ${solid.length} far triangles stand in the strip when nothing leaves it out`);
  const edge = farTris.filter((t) => up(t) && t.v.some((p) => Math.abs(Math.abs(p[0]) - 100) < 1e-6) && t.c[2] > 108 && t.c[2] < 300);
  assert.ok(edge.length > 40, `${edge.length} far triangles along the strip's two sides`);
});

test('the far ground and the strip meet without a step: along x = -100 and x = 100, from the first row beyond the wall (z 112) out, the two surfaces are within 3 cm (TEETH: a lift of 40 cm is found)', () => {
  const far = plan._far, seam = (lift) => { let worst = 0; for (const x of [-100, 100]) for (let z = 112; z <= 298; z += 2.5) worst = Math.max(worst, Math.abs(far(x, z) + lift - C.meshHeight(x, z))); return worst; };
  assert.ok(seam(0) < 0.03, `the seam is ${seam(0).toFixed(3)} m at worst`);
  assert.ok(seam(0.4) > 0.3, 'TEETH: the far land lifted 40 cm shows a seam');
  // and the triangles themselves: every far vertex on a side of the strip stands within 3 cm of the strip's own surface at that z (the wall zone, z 108 to 110, is the sea wall's: the far land runs past it at the deck's height)
  let worst = 0, n = 0;
  for (const t of farTris) if (up(t)) for (const p of t.v) if (Math.abs(Math.abs(p[0]) - 100) < 1e-6 && p[2] > 110 && p[2] < 298) { worst = Math.max(worst, Math.abs(p[1] - C.meshHeight(p[0], p[2]))); n++; }
  assert.ok(n > 80, `${n} far vertices on the edge of the strip`);
  assert.ok(worst < 0.03, `a far vertex on the edge of the strip is ${worst.toFixed(3)} m off the strip's surface`);
});
