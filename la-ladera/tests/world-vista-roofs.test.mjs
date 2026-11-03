// R1-D20, round 6 ("the vista hills are box houses ... flat-windowed boxes of identical form"): part of the far houses wear a pitched roof (a gable with its front to the street, a hip, or a mono-pitch shed)
// on a plain lid, and half of the roof huts of the flat ones are rooms set back from the front, with a terrace before them; the far city costs no more triangles than it did. The pure functions (roofHat,
// hatFaces, houseParts) are walked here, and so is the mesh the world builds from them. Each check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vista-roofs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { HALF } from '../js/world/field.js';
import { farHouses, houseParts, roofHat, hatFaces, ROOFS, HAT_SHARE, DETAIL } from '../js/world/vista.js';
import { SEED } from './world-lib.mjs';

/** What the far city costs on this seed, in triangles of the world.vista meshes: it is not to cost more now. Round 7 (the bay): the valley city's 1,453 houses are gone (51,982 triangles at HEAD 7254a04), the far village and the flanks cost this (433 houses). */
const BEFORE = 22288;

const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx); ctx.physics.setTerrain(ctx.plan.heightAt);
await buildWorld(ctx); await buildProps(ctx); ctx.batch.flushAll();
const plan = ctx.plan, houses = farHouses(plan), gap = (h) => Math.max(Math.abs(h.x), Math.abs(h.z)) - HALF;
const hats = houses.map((h) => [h, roofHat(plan, h)]).filter(([, t]) => t);
const meshOf = (name) => { let m = null; ctx.scene.traverse((o) => { if (o.isMesh && o.name === 'world.vista:' + name) m = o; }); return m; };
const local = (h, p) => { const c = Math.cos(h.ry), s = Math.sin(h.ry), dx = p[0] - h.x, dz = p[2] - h.z; return [dx * c - dz * s, p[1], dx * s + dz * c]; };    // the house's frame: x along the row, z to the front

/** The unit normal of a face of 3 or 4 corners, as MeshBuilder.tri / quad derive it from the winding. */
function faceNormal(q) {
  const s = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]], x = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const n = q.length === 4 ? x(s(q[2], q[0]), s(q[3], q[1])) : x(s(q[1], q[0]), s(q[2], q[0])), l = Math.hypot(...n) || 1;
  return n.map((v) => v / l);
}
/** What is wrong with the way a face of a house's roof looks: a slope must lean up, and a vertical face (an end, a gable, the back) must face away from the house's middle. */
function facing(h, q) {
  const n = faceNormal(q), cx = q.reduce((a, p) => a + p[0], 0) / q.length, cz = q.reduce((a, p) => a + p[2], 0) / q.length;
  if (Math.abs(n[1]) < 1e-6) return n[0] * (cx - h.x) + n[2] * (cz - h.z) > 0 ? null : 'a vertical face looks into the house';
  return n[1] > 0.15 ? null : `a slope that leans ${n[1].toFixed(2)}`;
}

/** A lookup of a mesh's vertices by place: has(p) is true when a vertex lies within 2 mm of p. */
function vertices(mesh) {
  const P = mesh.geometry.attributes.position, cells = new Map(), key = (x, z) => `${Math.floor(x)},${Math.floor(z)}`;
  for (let i = 0; i < P.count; i++) { const k = key(P.getX(i), P.getZ(i)); (cells.get(k) ?? cells.set(k, []).get(k)).push([P.getX(i), P.getY(i), P.getZ(i)]); }
  return { has: (p) => { for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const v of cells.get(key(p[0] + a, p[2] + b)) ?? []) if (Math.hypot(v[0] - p[0], v[1] - p[1], v[2] - p[2]) < 2e-3) return true; return false; } };
}

test('pitched roofs are dealt by the house alone: a share of the tile and zinc ones, none on concrete, on a tall block or beyond reach; all three forms; none by chance of another seed', () => {
  assert.ok(houses.length > 300, `${houses.length} far houses`);                      // the valley city is gone (round 7, the bay): 433 stand on the headland and the flanks, not 1,855
  const tally = { roof_tile_clay: [0, 0], corrugated_zinc: [0, 0] }, forms = {};
  for (const h of houses) {
    const mat = ROOFS[h.roof][0], hat = roofHat(plan, h);
    assert.deepEqual(roofHat(plan, h), hat, 'a hash of the house, so the same every time');
    if (mat === 'concrete_bare' || h.floors >= 6 || gap(h) > 450) { assert.equal(hat, null, `house ${h.i},${h.j} (${mat}, ${h.floors} floors, ${gap(h).toFixed(0)} m out) keeps its flat roof`); continue; }
    tally[mat][1]++;
    if (!hat) continue;
    tally[mat][0]++; forms[hat.form] = (forms[hat.form] ?? 0) + 1;
    assert.ok(['gable', 'hip', 'shed'].includes(hat.form) && Number.isFinite(hat.rise) && hat.rise >= 0.8 && hat.rise <= 2.2, `${JSON.stringify(hat)}: a roof 0.8 to 2.2 m high`);
    assert.equal(hat.lift, gap(h) > DETAIL ? 0 : 0.25, 'the lid is the slab within DETAIL and the top face beyond it');
  }
  for (const [mat, [n, of]] of Object.entries(tally)) assert.ok(of > 90 && Math.abs(n / of - HAT_SHARE[mat]) < 0.1, `${mat}: ${n} of ${of} wear a pitched roof (the share is ${HAT_SHARE[mat]})`);       // 0.07 of 400 houses a material, 0.1 of 130: the same two sigma
  for (const f of ['gable', 'hip', 'shed']) assert.ok(forms[f] >= 30, `${f}: ${forms[f]} roofs`);
  assert.ok(hats.length >= 120 && hats.length <= 0.6 * houses.length, `${hats.length} of ${houses.length} houses have a pitched roof`);
  const moved = houses.filter((h) => JSON.stringify(roofHat({ ...plan, seed: plan.seed + 1 }, h)) !== JSON.stringify(roofHat(plan, h))).length;       // TEETH: the roof is the seed's
  assert.ok(moved > 0.3 * hats.length, `another seed deals ${moved} of them differently`);
  for (const f of ['gable', 'hip', 'shed']) assert.ok(hats.some(([h, t]) => gap(h) <= 80 && t.form === f), `the first streets of the far hillside show a ${f}`);
});

test('a pitched roof stands on its lid, within the house and its eaves, rises by its own height, faces outward, and stops at a shared wall', () => {
  let faces = 0;
  for (const [h, hat] of hats) {
    const F = hatFaces(h, hat), top = h.y + h.h + hat.lift, hw = h.w / 2, hd = h.d / 2, tag = `house ${h.i},${h.j} (${hat.form})`;
    assert.ok(F.roof.length >= 2 && F.roof.length <= 4, `${tag}: ${F.roof.length} roof faces`);
    let lo = Infinity, hi = -Infinity;
    for (const p of [...F.roof, ...F.wall].flat()) {
      const [lx, y, lz] = local(h, p);
      lo = Math.min(lo, y); hi = Math.max(hi, y);
      assert.ok(Math.abs(lx) <= hw + (lx > 0 ? (h.party.right ? 0 : 0.15) : (h.party.left ? 0 : 0.15)) + 1e-6, `${tag}: the roof reaches ${lx.toFixed(2)} m along the row (half width ${hw.toFixed(2)})`);
      assert.ok(Math.abs(lz) <= hd + 0.3 + 1e-6, `${tag}: the roof reaches ${lz.toFixed(2)} m to the front or back (half depth ${hd.toFixed(2)})`);
    }
    assert.ok(Math.abs(lo - top) < 1e-6 && Math.abs(hi - (top + hat.rise)) < 1e-6, `${tag}: from the lid ${top.toFixed(2)} to ${(top + hat.rise).toFixed(2)}, not ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
    for (const q of [...F.roof, ...F.wall]) { assert.ok(q.length === 3 || q.length === 4); assert.equal(facing(h, q), null, `${tag}: ${facing(h, q)}`); faces++; }
    if (hat.form === 'gable') assert.equal(F.wall.length, 2, `${tag}: a gable has its two ends in the house's paint`);
    if (hat.form !== 'gable') assert.ok(F.roof.some((q) => q.length === 3), `${tag}: a hip or a shed has its ends closed in the roof's own sheet`);
  }
  assert.ok(faces > 500, `${faces} faces walked`);
  // TEETH: each fault is seen by the same checks
  const [h0, t0] = hats.find(([h, t]) => t.form === 'gable' && h.party.left && h.party.right), reach = (F) => Math.max(...F.roof.flat().map((p) => Math.abs(local(h0, p)[0])));
  assert.ok(reach(hatFaces(h0, t0)) <= h0.w / 2 + 1e-6, 'a house between two others keeps its roof within its walls');
  assert.ok(reach(hatFaces({ ...h0, party: { left: false, right: false } }, t0)) > h0.w / 2 + 0.1, 'TEETH: the same house standing alone has eaves at its ends');
  assert.ok(Math.max(...hatFaces(h0, { ...t0, rise: t0.rise * 2 }).roof.flat().map((p) => p[1])) > h0.y + h0.h + 0.25 + t0.rise + 0.5, 'TEETH: a roof twice as high is higher than the one drawn');
  const [h1, t1] = hats.find(([, t]) => t.form === 'shed'), F1 = hatFaces(h1, t1);
  assert.notEqual(facing(h1, [...F1.roof[0]].reverse()), null, 'TEETH: a slope wound the wrong way round looks down');
  assert.notEqual(facing(h1, [...F1.roof[1]].reverse()), null, 'TEETH: an end wound the wrong way round looks into the house');
});

test('a pitched roof carries nothing: no tank, hut, parapet or rebar in the air on a slope; a flat one keeps them, and half the huts are rooms set back from the front', () => {
  let rooms = 0, flatItems = 0, onHats = 0;
  for (const h of houses) {
    const P = houseParts(plan, h), hat = roofHat(plan, h), hw = (h.w + 0.3) / 2, hd = (h.d + 0.3) / 2;
    if (hat) { if (gap(h) <= DETAIL) { onHats += P.boxes.length + P.tanks.length; assert.ok(P.windows.length > 0, 'a house with a pitched roof still has its windows'); } continue; }
    flatItems += P.boxes.length + P.tanks.length;
    for (const q of P.boxes.filter((b) => b.sy === 2.7)) {
      rooms++;
      assert.ok(Math.abs(q.lx) + q.sx / 2 <= hw - 0.19 && Math.abs(q.lz) + q.sz / 2 <= hd - 0.19, 'a room stands inside the parapet');
      assert.ok(q.lz + q.sz / 2 <= hd - 1.5, `a terrace of at least 1.5 m before the room (its front is ${(q.lz + q.sz / 2).toFixed(2)}, the roof's edge ${hd.toFixed(2)})`);
      assert.ok(q.sx * q.sz >= 4.5 && q.sx * q.sz <= 0.65 * (2 * hw) * (2 * hd), `a room of ${(q.sx * q.sz).toFixed(1)} m2`);
      for (const t of P.tanks) assert.ok(Math.hypot(Math.max(0, Math.abs(t.lx - q.lx) - q.sx / 2), Math.max(0, Math.abs(t.lz - q.lz) - q.sz / 2)) > t.r - 0.01, 'a room never swallows the tank');
    }
  }
  assert.equal(onHats, 0, 'a pitched roof carries nothing');
  assert.ok(rooms >= 30, `${rooms} rooms on flat roofs`);
  assert.ok(flatItems > 400, `${flatItems} items on the flat roofs`);
});

test('the world draws what the pure functions say: each pitched roof is in the mesh of its own material, the walls and the lid reach it, and a corner that is not there is not found', () => {
  const byMat = {}, wallV = vertices(meshOf('plaster_rough'));
  for (const [mat] of ROOFS) byMat[mat] ??= vertices(meshOf(mat));
  for (const [h, hat] of hats) {
    const mat = ROOFS[h.roof][0], F = hatFaces(h, hat), top = h.y + h.h + hat.lift, tag = `house ${h.i},${h.j} (${hat.form}, ${mat})`;
    for (const p of F.roof.flat()) assert.ok(byMat[mat].has(p), `${tag}: a roof corner ${p.map((v) => v.toFixed(2))} is not in the ${mat} mesh`);
    for (const p of F.wall.flat()) assert.ok(wallV.has(p), `${tag}: a gable or back-wall corner is not in the wall mesh`);
    const c = Math.cos(h.ry), s = Math.sin(h.ry);
    for (const [u, v] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {                                  // the walls go up to the lid (no slit between the wall and the roof), and the lid is as wide as the walls
      const lx = (u * h.w) / 2, lz = (v * h.d) / 2, corner = [h.x + lx * c + lz * s, top, h.z - lx * s + lz * c];
      assert.ok(wallV.has(corner), `${tag}: the wall does not reach the lid at ${top.toFixed(2)}`);
      assert.ok(byMat[mat].has(corner), `${tag}: the lid does not reach the wall's corner`);
    }
  }
  // the lid replaces the slab: no thin vertical face (the fascia of a 25 cm slab) is drawn round a house under a pitched roof, while a flat house within DETAIL has them
  const fascia = [];
  for (const mat of new Set(ROOFS.map((r) => r[0]))) {
    const P = meshOf(mat).geometry.attributes.position, I = meshOf(mat).geometry.index;
    for (let t = 0; t < I.count; t += 3) {
      const v = [0, 1, 2].map((k) => { const i = I.getX(t + k); return [P.getX(i), P.getY(i), P.getZ(i)]; }), ys = v.map((p) => p[1]);
      if (Math.max(...ys) - Math.min(...ys) > 0.26 || Math.max(...ys) - Math.min(...ys) < 0.2) continue;
      const n = faceNormal(v); if (Math.abs(n[1]) < 1e-6) fascia.push([v.reduce((a, p) => a + p[0] / 3, 0), v.reduce((a, p) => a + p[1] / 3, 0), v.reduce((a, p) => a + p[2] / 3, 0)]);
    }
  }
  const around = (h) => fascia.filter((p) => { const [lx, , lz] = local(h, p); return Math.abs(lx) <= h.w / 2 + 0.2 && Math.abs(lz) <= h.d / 2 + 0.2; }).length;
  for (const [h] of hats) if (gap(h) <= DETAIL) assert.equal(around(h), 0, `house ${h.i},${h.j}: a slab's fascia under a pitched roof`);
  const slabbed = houses.filter((h) => gap(h) <= DETAIL && !roofHat(plan, h));
  assert.ok(slabbed.length > 100 && slabbed.every((h) => around(h) >= 2), `TEETH: a flat house within DETAIL shows its slab's fascia (${slabbed.filter((h) => around(h) < 2).length} of ${slabbed.length} do not)`);
  assert.equal(wallV.has([0, 9999, 0]), false, 'TEETH: a corner that is nowhere is not found');
  const [h1, t1] = hats[0], p1 = hatFaces(h1, t1).roof[0][0];
  assert.equal(byMat[ROOFS[h1.roof][0]].has([p1[0] + 0.5, p1[1], p1[2]]), false, 'TEETH: a roof corner half a metre off is not found');
});

test('the far city costs no more triangles than before: the lid and the roof are cheaper than the slab, the tanks and the huts they replace', () => {
  let tris = 0; ctx.scene.traverse((o) => { if (o.isMesh && o.name.startsWith('world.vista:')) tris += o.geometry.index.count / 3; });
  assert.ok(tris <= BEFORE, `${tris} triangles in world.vista, ${BEFORE} before`);
  assert.ok(tris >= BEFORE * 0.9, `${tris} triangles: not so many fewer that the far city has lost something (${BEFORE} before)`);
  assert.equal(ctx.world.vista.houses, houses.length, 'the same houses');
  assert.deepEqual(ctx.errors, []);
});
