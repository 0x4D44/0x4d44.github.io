// The east and west boundary walls dressed as the back of the barrio (R1-D21; js/world/edgewall.js) under node. The plain wall is a 2.4 to 2.7 m screen with nothing beyond it: here 30 to 60 %
// of each wall is raised, in stretches of 6 to 14 m between plain wall, to the two-storey rear wall of a house, with high windows, a drainpipe, a painting or a tag, a creeper and a roofline.
// What it guards: where the stretches go (clear of the corners, the gate, stairs, streets and points of interest), the windows (height, spacing), the tops that follow the slope, that nothing
// stands further out than the 0.15 m the perimeter collider leaves, that no collider is added and nothing else moves, determinism, the triangle and draw-call budget, the glow at night, and the
// materials. Each check that can silently go vacuous has a TEETH line next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-edgewall.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { EDGE, HUES, BLOCKING, planEdge, zOf } from '../js/world/edgewall.js';
import { muralKeys, edgeMuralKeys, signKeys } from '../js/world/signs.js';
import { SEED, makePlan, badAttributes } from './world-lib.mjs';

const glowLog = { list: [], add(g) { this.list.push(g); return g; } };      // the engine's glow registry, which headless contexts do not have: a recorder
async function build(seed, { glow = null, ...opts } = {}) {
  const ctx = createContext({ seed, headless: true, ...opts });
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  if (glow) ctx.glow = glow;
  await buildWorld(ctx);
  await buildProps(ctx);
  ctx.batch.flushAll();
  return ctx;
}
const A = await build(SEED, { glow: glowLog }), A2 = await build(SEED), OFF = await build(SEED, { edgewall: false });
const REC = A.world.edge, P = EDGE.PANELS, SIDES = ['e', 'w'];

const clone = (o) => JSON.parse(JSON.stringify(o));
const edgeMeshes = (ctx) => { const out = []; ctx.scene.traverse((o) => { if (o.isMesh && /^props\.boundary\.edge/.test(o.name)) out.push(o); }); return out; };
const triCount = (m) => (m.geometry.index?.count ?? m.geometry.attributes.position.count) / 3;
const trisOf = (ctx, re) => { let n = 0; ctx.scene.traverse((o) => { if (o.isMesh && re.test(o.name)) n += triCount(o); }); return n; };
function* verts(mesh) { const p = mesh.geometry.attributes.position; for (let i = 0; i < p.count; i++) yield [p.getX(i), p.getY(i), p.getZ(i)]; }
const rectGap = (a, b) => Math.hypot(Math.max(0, a.z0 - b.z1, b.z0 - a.z1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
const pilasters = (() => { const out = []; for (let k = 0; k <= P; k++) if (Math.round(zOf(k) / 2) % 2 === 0) out.push(zOf(k)); return out; })();      // periphery.js: a 0.34 m pilaster every 4 m
const groundAt = (sg, z) => A.plan.heightAt(sg * (EDGE.FACE - EDGE.VEN), z);

// ------------------------------------------------------------------------------------------------------------------------------------------------ where the stretches go
/** What is wrong with one wall's plan: too few or too many stretches, one too short or too long, two without plain wall between, one in a corner or beside the gate (the arch on the south wall). */
function stretchProblems(side, gate) {
  const out = [], st = side.stretches, raised = st.reduce((s, q) => s + q.n, 0), share = raised / P;
  if (st.length < 5) out.push(`${side.id}: ${st.length} stretches`);
  if (!(share >= 0.3 && share <= 0.6)) out.push(`${side.id}: ${(share * 100).toFixed(0)} % of the wall is raised`);
  st.forEach((q, i) => {
    if (q.len < 6 - 1e-6 || q.len > 14 + 1e-6) out.push(`${q.id}: ${q.len} m long`);
    if (i && q.k0 - (st[i - 1].k1 + 1) < 3) out.push(`${q.id}: ${q.k0 - st[i - 1].k1 - 1} panels of plain wall after ${st[i - 1].id}`);
    if (q.k0 < EDGE.MARGIN || q.k1 > P - 1 - EDGE.MARGIN) out.push(`${q.id}: in a corner`);
    const dx = Math.max(0, gate.x - gate.half - (side.sg * EDGE.FACE + 0.5), side.sg * EDGE.FACE - 0.5 - (gate.x + gate.half)), dz = Math.max(0, gate.z - 1 - q.z1, q.z0 - (gate.z + 1));
    if (Math.hypot(dx, dz) < 2 * EDGE.MARGIN) out.push(`${q.id}: ${Math.hypot(dx, dz).toFixed(1)} m from the gate`);
  });
  return out;
}

test('R1-D21: both side walls are raised in stretches of 6 to 14 m, 30 to 60 % of their length, with plain wall between, clear of the corners and the gate (TEETH: no stretch, a long one, two touching and a gate beside one are each found)', () => {
  const gate = A.world.gate;
  assert.ok(gate && gate.half > 5, 'the gate is built before the walls are judged');
  for (const id of SIDES) {
    const side = REC.plan.sides[id];
    assert.deepEqual(stretchProblems(side, gate), []);
    assert.equal(REC.raised[id], side.stretches.reduce((s, q) => s + q.n, 0), `the panels of side ${id} that were built are the panels that were planned`);
  }
  const e = REC.plan.sides.e, q0 = e.stretches[0];
  assert.ok(stretchProblems({ ...e, stretches: [] }, gate).some((m) => /% of the wall/.test(m)), 'TEETH: a wall with no stretch is found');
  assert.ok(stretchProblems({ ...e, stretches: [{ ...q0, len: 20 }, ...e.stretches.slice(1)] }, gate).some((m) => /20 m long/.test(m)), 'TEETH: a 20 m stretch is found');
  assert.ok(stretchProblems({ ...e, stretches: [q0, { ...e.stretches[1], k0: q0.k1 + 1 }, ...e.stretches.slice(2)] }, gate).some((m) => /panels of plain wall after/.test(m)), 'TEETH: two stretches with no plain wall between are found');
  assert.ok(stretchProblems(e, { x: e.sg * 99, z: q0.z1, half: 5.4 }).some((m) => /from the gate/.test(m)), 'TEETH: a gate beside a stretch is found');
  assert.ok(stretchProblems({ ...e, stretches: [{ ...q0, k0: 0 }, ...e.stretches.slice(1)] }, gate).some((m) => /in a corner/.test(m)), 'TEETH: a stretch in the corner is found');
});

/** A stretch stays off whatever the plan or the occupancy grid keeps for something else: a street, stair, plaza, lot, door or nav route under it, a point of interest or landmark beside it. */
function claimProblems(rec, occ, spots) {
  const out = [], free = (sg, k) => { for (const dd of [0.6, 1.6, 3.0]) for (const t of [0, 1, 2]) if (!occ.clear(sg * (EDGE.FACE - dd), zOf(k) + t, 0.3, BLOCKING)) return false; return true; };
  const near = (sg, z0, z1) => spots.find((p) => Math.abs(p.x - sg * EDGE.FACE) < 4 && p.z > z0 - 3 && p.z < z1 + 3);
  for (const id of SIDES) {
    const side = rec.plan.sides[id];
    for (const q of side.stretches) {
      for (let k = q.k0; k <= q.k1; k++) if (!free(side.sg, k)) out.push(`${q.id}: panel ${k} stands on a street, stair, plaza, building, door or path`);
      const p = near(side.sg, q.z0, q.z1); if (p) out.push(`${q.id}: ${p.id} stands beside it`);
    }
    for (const g of side.gaps) {
      const ks = g.kind === 'door' ? [g.k] : g.kind === 'meters' ? [g.k - 1, g.k] : Array.from({ length: g.kb - g.ka + 1 }, (_, i) => g.ka + i);
      for (const k of ks) if (!free(side.sg, k)) out.push(`${id} ${g.kind} at panel ${k} stands on a street, stair, plaza, building, door or path`);
      const p = near(side.sg, zOf(Math.min(...ks)), zOf(Math.max(...ks)) + 2); if (p) out.push(`${id} ${g.kind}: ${p.id} stands beside it`);
    }
  }
  return out;
}

test('R1-D21: no stretch, door, meter board or footing stands on a street, stair, plaza or building, or beside a point of interest, and the planner moves off a street and a point of interest put in its way (TEETH: an occupied grid and a point of interest are each found; the plan made without them stands on them)', () => {
  const spots = [...A.plan.pois, ...A.plan.landmarks].filter((p) => Math.abs(p.x) > 60);
  assert.ok(spots.length >= 10, `${spots.length} points of interest in the outer fifth of the plot`);
  assert.deepEqual(claimProblems(REC, A.world.occ, spots), []);
  assert.ok(claimProblems(REC, { clear: () => false }, spots).length >= 20, 'TEETH: a grid that is occupied everywhere stops every stretch');
  const q = REC.plan.sides.w.stretches[1];
  assert.ok(claimProblems(REC, A.world.occ, [...spots, { id: 'poi.fake', x: -EDGE.FACE + 2, z: (q.z0 + q.z1) / 2 }]).some((m) => /poi\.fake/.test(m)), 'TEETH: a point of interest beside a stretch is found');
  assert.ok(REC.plan.sides.e.gaps.length >= 3 && REC.plan.sides.w.gaps.length >= 3, 'the plain stretches between got their doors, meters and footings');
  // nothing on the real rim is in the planner's way (the points of interest stop 14 m short of it), so the planner is tried where something is: a street meeting the east wall under one
  // stretch, another under a door, and a point of interest beside a third stretch
  const H = A.plan.heightAt, plain = planEdge({ seed: SEED, H }), pe = plain.sides.e, s1 = pe.stretches[1], s3 = pe.stretches[3], gd = pe.gaps.find((g) => g.kind === 'door');
  const streets = [[s1.z0 + 0.5, s1.z0 + 3.5], [zOf(gd.k) + 0.5, zOf(gd.k) + 1.5]];
  const fakeOcc = { clear: (x, z) => !(x > 0 && streets.some(([a, c]) => z >= a && z <= c)) }, fakePoi = { id: 'poi.fake', x: EDGE.FACE - 1, z: (s3.z0 + s3.z1) / 2, r: 3 };
  const guarded = planEdge({ seed: SEED, H, occ: fakeOcc, avoid: [fakePoi] });
  assert.ok(claimProblems({ plan: plain }, fakeOcc, [fakePoi]).length >= 3, 'TEETH: the plan made without them does stand on both streets and beside the point of interest');
  assert.deepEqual(claimProblems({ plan: guarded }, fakeOcc, [fakePoi]), [], 'the plan made with them keeps off them');
  assert.ok(guarded.sides.e.stretches.length >= 4, 'the east wall is still dressed round them');
  assert.equal(JSON.stringify(guarded.sides.w), JSON.stringify(plain.sides.w), 'and the west wall, which they do not touch, is the same');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------ the windows
/** What is wrong with the windows of one wall: a sill under 2.2 m over the ground, a window within 0.5 m of a pilaster or of any other feature (the creeper is leaves: 0.3 m). */
function windowProblems(side, ground) {
  const out = [];
  for (const q of side.stretches) for (const w of q.windows) {
    let g = -Infinity; for (let z = w.z0; z <= w.z1 + 1e-9; z += 0.1) g = Math.max(g, ground(side.sg, z));
    if (w.sill - g < 2.2 - 1e-6) out.push(`${q.id}: a sill ${(w.sill - g).toFixed(2)} m over the ground`);
    if (w.z1 - w.z0 < 0.6 - 1e-6 || w.z1 - w.z0 > 0.9 + 1e-6) out.push(`${q.id}: a window ${(w.z1 - w.z0).toFixed(2)} m wide`);
    for (const zp of pilasters) { const gap = Math.max(0, zp - 0.17 - w.z1, w.z0 - (zp + 0.17)); if (gap < 0.5 - 1e-6) out.push(`${q.id}: a window ${gap.toFixed(2)} m from the pilaster at ${zp.toFixed(1)}`); }
    const pane = { z0: w.z0, z1: w.z1, y0: w.sill, y1: w.sill + w.h };
    for (const f of q.feats) {
      if (f.kind === 'window' && Math.abs(f.z0 - (w.z0 - 0.1)) < 1e-6 && Math.abs(f.y0 - (w.sill - 0.14)) < 1e-6) continue;             // its own frame and sill
      const gap = rectGap(pane, f), need = f.kind === 'creeper' ? EDGE.SOFT_GAP : 0.5;
      if (gap < need - 1e-6) out.push(`${q.id}: a window ${gap.toFixed(2)} m from a ${f.kind}`);
    }
  }
  return out;
}
/** The dark panes of the built walls: { x, z0, z1, y0, y1 } (a quad each, two triangles). */
function panes(ctx) {
  const out = [];
  for (const m of edgeMeshes(ctx)) {
    if (!m.name.endsWith(':glass_dark')) continue;
    const p = m.geometry.attributes.position, I = m.geometry.index;
    for (let t = 0; t < I.count; t += 6) {
      const q = [...new Set([0, 1, 2, 3, 4, 5].map((k) => I.getX(t + k)))].map((i) => [p.getX(i), p.getY(i), p.getZ(i)]);
      out.push({ x: q[0][0], z0: Math.min(...q.map((v) => v[2])), z1: Math.max(...q.map((v) => v[2])), y0: Math.min(...q.map((v) => v[1])), y1: Math.max(...q.map((v) => v[1])) });
    }
  }
  return out;
}

test('R1-D21: every window sill is 2.2 m or more over the ground, every window 0.5 m clear of the pilasters and every other feature, and the dark panes built are the windows planned (TEETH: a low sill, a window on a pilaster and a feature beside one are each found)', () => {
  let n = 0;
  for (const id of SIDES) { const side = REC.plan.sides[id]; assert.deepEqual(windowProblems(side, groundAt), []); n += side.stretches.reduce((s, q) => s + q.windows.length, 0); }
  assert.ok(n >= 24, `${n} windows on the two walls`);
  const built = panes(A);
  assert.equal(built.length, n, 'one dark pane for every window planned');
  for (const p of built) {                                                                                  // read off the mesh itself: the planner's numbers are not the proof
    const sg = Math.sign(p.x); let g = -Infinity; for (let z = p.z0; z <= p.z1 + 1e-9; z += 0.1) g = Math.max(g, groundAt(sg, z));
    assert.ok(p.y0 - g >= 2.2 - 1e-6, `a pane ${(p.y0 - g).toFixed(2)} m over the ground at z ${p.z0.toFixed(1)}`);
    assert.ok(Math.abs(Math.abs(p.x) - (EDGE.FACE - 0.128)) < 1e-6, 'the pane lies in front of the skin');
  }
  const order = (a, b) => a[0] - b[0] || a[1] - b[1];
  const planned = SIDES.flatMap((id) => REC.plan.sides[id].stretches.flatMap((q) => q.windows.map((w) => [REC.plan.sides[id].sg, w.z0, w.z1, w.sill]))).sort(order);
  const placed = built.map((p) => [Math.sign(p.x), p.z0, p.z1, p.y0]).sort(order);
  placed.forEach((p, i) => assert.ok(p.every((v, j) => Math.abs(v - planned[i][j]) < 2e-3), `pane ${i} is at ${p.map((v) => v.toFixed(3))}, the plan has ${planned[i].map((v) => v.toFixed(3))}`));
  const e = REC.plan.sides.e, low = clone(e); low.stretches[0].windows[0].sill -= 1.5;
  assert.ok(windowProblems(low, groundAt).some((m) => /over the ground/.test(m)), 'TEETH: a low sill is found');
  const onPilaster = clone(e), w0 = onPilaster.stretches[0].windows[0], zp = pilasters.find((z) => z > w0.z1), width = w0.z1 - w0.z0;
  w0.z0 = zp - 0.3; w0.z1 = zp - 0.3 + width;
  assert.ok(windowProblems(onPilaster, groundAt).some((m) => /pilaster/.test(m)), 'TEETH: a window at a pilaster is found');
  const crowded = clone(e), w1 = crowded.stretches[0].windows[0];
  crowded.stretches[0].feats.push({ kind: 'pipe', z0: w1.z1 + 0.2, z1: w1.z1 + 0.3, y0: w1.sill - 1, y1: w1.sill + 1 });
  assert.ok(windowProblems(crowded, groundAt).some((m) => /from a pipe/.test(m)), 'TEETH: a pipe beside a window is found');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------ the tops follow the slope
/** The top of the skin over the middle of each panel, read off the built mesh: Map 'e12' -> y (the top row of the skin: the cap sits 0.1 m above it). */
function panelTops(ctx) {
  const out = new Map();
  for (const m of edgeMeshes(ctx)) for (const [x, y, z] of verts(m)) {
    if (Math.abs(Math.abs(x) - (EDGE.FACE - EDGE.VEN)) > 1e-3) continue;
    const f = (z - EDGE.S0) / 2, k = Math.floor(f);
    if (Math.abs(f - k - 0.5) > 1e-3) continue;
    const key = (x > 0 ? 'e' : 'w') + k; out.set(key, Math.max(out.get(key) ?? -Infinity, y));
  }
  return out;
}
/** What is wrong with the tops of the raised panels (the recorded ones): over the plain wall's own top, 4.2 to 5.0 m over the ground, and rising and falling with the ground inside one house. */
function topProblems(rec) {
  const out = [];
  for (const id of SIDES) {
    const side = rec.plan.sides[id], tops = rec.tops[id];
    for (const q of side.stretches) for (let k = q.k0; k <= q.k1; k++) {
      const t = tops[k]; if (!t) { out.push(`${id}${k}: no top`); continue; }
      const rel = t.top - side.hi[k];
      if (!(rel >= 4.2 - 1e-6 && rel <= 5.0 + 1e-6)) out.push(`${id}${k}: ${rel.toFixed(2)} m over the highest ground of its panel`);
      if (!(t.top >= t.plain + 1.5)) out.push(`${id}${k}: ${t.top.toFixed(2)} is not well over the plain wall's ${t.plain.toFixed(2)}`);
      const same = k > q.k0 && q.bays.some((b) => k - 1 >= b.k0 && k <= b.k1);
      if (same && Math.abs(t.top - tops[k - 1].top - (side.hi[k] - side.hi[k - 1])) > 1e-6) out.push(`${id}${k}: the top does not follow the ground inside one house`);
    }
  }
  return out;
}
/** The recorded tops against the mesh: every raised panel has its skin, ending where the plan says. */
function skinProblems(ctx, rec) {
  const out = [], got = panelTops(ctx);
  for (const id of SIDES) for (const q of rec.plan.sides[id].stretches) for (let k = q.k0; k <= q.k1; k++) {
    const y = got.get(id + k), want = rec.tops[id][k].top - 0.1;
    if (y === undefined) out.push(`${id}${k}: no skin in the mesh`);
    else if (Math.abs(y - want) > 1e-3) out.push(`${id}${k}: the skin ends at ${y.toFixed(2)}, the plan says ${want.toFixed(2)}`);
  }
  return out;
}

test('R1-D21: a raised wall steps with the slope like the plain wall and never ends under it, and the mesh ends where the plan says (TEETH: a flat top, a low top and a world without the dressing are each found)', () => {
  assert.deepEqual(topProblems(REC), []);
  assert.deepEqual(skinProblems(A, REC), []);
  const steps = new Set(); for (const id of SIDES) for (let k = 1; k < P; k++) if (REC.tops[id][k] && REC.tops[id][k - 1]) steps.add(Math.round((REC.tops[id][k].top - REC.tops[id][k - 1].top) * 100));
  assert.ok(steps.size >= 8, `${steps.size} different steps between neighbouring panels: the top rises and falls with the ground`);
  const flat = { ...REC, tops: { e: REC.tops.e.map(() => ({ top: 85, plain: 0 })), w: REC.tops.w.map(() => ({ top: 85, plain: 0 })) } };
  assert.ok(topProblems(flat).length >= 40, 'TEETH: a flat top does not follow the ground');
  const low = { ...REC, tops: { e: REC.tops.e.map((t) => ({ top: t.plain + 0.5, plain: t.plain })), w: REC.tops.w } };
  assert.ok(topProblems(low).some((m) => /not well over the plain wall/.test(m)), 'TEETH: a top under the plain wall is found');
  assert.ok(skinProblems(OFF, REC).length === REC.raised.e + REC.raised.w, 'TEETH: a world built without the dressing has no skin on any raised panel');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------ reach, colliders, determinism
const faceOf = (ctx) => { const w = ctx.physics.walls.find((q) => q.id === 'perimeter' && q.x1 === q.x2 && q.x1 > 0); return w.x1 - w.t / 2; };      // the east perimeter collider's face toward the plot
const overReach = (xs, reach) => xs.filter((x) => EDGE.FACE - Math.abs(x) > reach + 1e-5).length;                    // the positions are float32: 4 micrometres at 99 m

test('R1-D21: nothing on the face stands further out than the perimeter collider leaves (0.15 m), nothing is built inside the plot, and the roof items stay within 1.5 m behind the wall (TEETH: a vertex 5 cm too far out is found)', () => {
  const reach = EDGE.FACE - faceOf(A), xs = [], ys = [];
  assert.ok(Math.abs(reach - EDGE.REACH) < 1e-9, `the collider leaves ${reach} m, the constants say ${EDGE.REACH}`);
  for (const m of edgeMeshes(A)) for (const [x, y, z] of verts(m)) { xs.push(x); ys.push([x, y, z]); }
  assert.ok(xs.length > 10000, `${xs.length} vertices`);
  assert.equal(overReach(xs, reach), 0, `something stands out ${Math.max(...xs.map((x) => EDGE.FACE - Math.abs(x))).toFixed(3)} m, the collider leaves ${reach.toFixed(3)} m`);
  const out = Math.max(...xs.map((x) => EDGE.FACE - Math.abs(x)));
  assert.ok(out >= 0.12, `TEETH: the sills, bars and piers do stand out (${out.toFixed(3)} m): a measure that finds nothing is not measuring`);
  assert.equal(overReach([...xs, 99.35 - reach - 0.05], reach), 1, 'TEETH: a vertex 5 cm too far out is found');
  const back = Math.max(...xs.map((x) => Math.abs(x) - (EDGE.AT + 0.2))), zMax = Math.max(...ys.map((v) => Math.abs(v[2])));
  assert.ok(back <= 1.5 + 1e-6, `the roofline reaches ${back.toFixed(2)} m behind the outer face of the wall (1.5 m is the limit)`);
  assert.ok(back >= 0.9, `TEETH: the tanks, dishes and lean-tos do stand behind the wall (${back.toFixed(2)} m)`);
  assert.ok(zMax <= 100.25, `a vertex at z ${zMax.toFixed(2)}: nothing reaches past the corners, where the gate wall and its arch are`);
  assert.ok(ys.every(([x, y, z]) => Math.abs(x) > 98 && y > groundAt(Math.sign(x), z) - 1.5 && y < groundAt(Math.sign(x), z) + 14), 'every vertex lies on the side walls (none on the plot, none on the south wall), from the ground to 14 m over it');
});

const wallDigest = (ctx) => ctx.physics.walls.map((w) => [w.x1, w.z1, w.x2, w.z2, w.t, w.y0, w.y1, w.id, w.door].join(',')).join('|');
// what follows `crests` (which the dressing thins: a raised panel leaves it) is left out: the foliage cards (the bougainvillea hangs from the new top) and the rim walk's crest dressing (rimwalk.js, props.rimtop: on the plain panels only)
const sizesOf = (ctx) => { const m = []; ctx.scene.traverse((o) => { if (o.isMesh && !/^props\.boundary\.edge/.test(o.name) && !/floralow/.test(o.name) && !/^props\.rimtop/.test(o.name)) m.push([o.name, triCount(o)]); }); return m; };

test('R1-D21: the dressing adds no collider and moves nothing else: the same walls, the same colliders, the same meshes with or without it (TEETH: one more wall, and the world with the hook off, are told apart)', () => {
  assert.equal(A.physics.walls.length, OFF.physics.walls.length, 'the number of colliders');
  assert.equal(wallDigest(A), wallDigest(OFF), 'every collider, in order');
  assert.deepEqual(sizesOf(A), sizesOf(OFF), 'every mesh but the dressing and the foliage cards is the size it was');
  assert.equal(edgeMeshes(OFF).length, 0, 'the world built with edgewall off has none of the dressing');
  assert.ok(edgeMeshes(A).length === 4 && !OFF.world.edge, `the world built with it has four meshes and a record (${edgeMeshes(A).length})`);
  assert.notEqual(wallDigest({ physics: { walls: [...A.physics.walls, { x1: 98, z1: 0, x2: 98, z2: 4, t: 0.1, id: 'prop' }] } }), wallDigest(OFF), 'TEETH: one more collider changes the digest');
  assert.ok(A.physics.walls.filter((w) => w.id === 'perimeter').length === 4, 'the four perimeter colliders are the only ones on the rim');
});

const digest = (ctx) => {
  let h = 2166136261;
  for (const m of edgeMeshes(ctx)) for (const a of ['position', 'color', 'uv']) { const arr = m.geometry.attributes[a]?.array; if (arr) for (const v of arr) h = Math.imul(h ^ Math.round(v * 1e4), 16777619); }
  return (h >>> 0).toString(16);
};

test('R1-D21: the dressing is the same every time for one seed and another for another (TEETH: another seed gives other stretches; Math.random is never asked)', () => {
  assert.equal(JSON.stringify(A2.world.edge.plan), JSON.stringify(REC.plan), 'the same plan from a second build');
  assert.equal(digest(A2), digest(A), 'the same vertices, colours and coordinates from a second build');
  const H = A.plan.heightAt, one = planEdge({ seed: SEED, H }), two = planEdge({ seed: SEED, H });
  assert.equal(JSON.stringify(one), JSON.stringify(two));
  const other = planEdge({ seed: SEED + 1, H: makePlan(SEED + 1).plan.heightAt }), where = (p) => p.sides.e.stretches.map((q) => `${q.k0}:${q.n}`).join(',');
  assert.notEqual(where(other), where(one), 'TEETH: another seed puts the stretches elsewhere');
  assert.notEqual(JSON.stringify(other.sides.w.stretches.map((q) => q.bays)), JSON.stringify(one.sides.w.stretches.map((q) => q.bays)), 'TEETH: and paints them otherwise');
  const real = Math.random; Math.random = () => { throw new Error('Math.random'); };
  try { assert.equal(JSON.stringify(planEdge({ seed: SEED, H })), JSON.stringify(one)); } finally { Math.random = real; }
  assert.throws(() => { Math.random = () => { throw new Error('Math.random'); }; try { Math.random(); } finally { Math.random = real; } }, /Math.random/, 'TEETH: the guard does throw');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------ what is on the walls
test('R1-D21: the walls differ stretch from stretch: hues, roof items, windows, paintings in the atlas, drainpipes, creepers, doors, meter boards and footings (TEETH: a one-colour wall is found)', () => {
  const hueRuns = (side) => { const bad = []; let last = -1; for (const q of side.stretches) for (const b of q.bays) { if (b.hue === last) bad.push(`${q.id}: two neighbouring houses are both ${HUES[b.hue].name}`); last = b.hue; } return bad; };
  const roofRuns = (side) => side.stretches.flatMap((q, i) => (i && q.roof.pkg === side.stretches[i - 1].roof.pkg ? [`${q.id}: the same roof package as its neighbour`] : []));
  const keys = new Set([...muralKeys(), ...edgeMuralKeys(), ...signKeys(A.plan)]);
  for (const id of SIDES) {
    const side = REC.plan.sides[id], st = side.stretches;
    assert.deepEqual(hueRuns(side), []); assert.deepEqual(roofRuns(side), []);
    assert.ok(new Set(st.flatMap((q) => q.bays.map((b) => b.hue))).size >= 5, `side ${id}: at least five hues`);
    assert.ok(new Set(st.map((q) => q.roof.pkg)).size >= 4, `side ${id}: at least four roof packages`);
    assert.ok(st.every((q) => q.windows.length >= 1 && q.windows.length <= 4), `side ${id}: every stretch has windows`);
    assert.ok(st.every((q) => q.roof.items.length >= 1), `side ${id}: every stretch has something on its roof`);
    assert.ok(st.filter((q) => q.art).length >= 1 && st.filter((q) => q.art).length <= Math.ceil(st.length / 2), `side ${id}: a painting or tag on every third stretch or so`);
    assert.ok(st.filter((q) => q.art).every((q) => keys.has(q.art.key)), `side ${id}: every painting and tag is in the atlas`);
    assert.ok(st.filter((q) => q.pipe).length >= Math.floor(st.length / 2), `side ${id}: drainpipes on most stretches`);
    assert.ok(st.filter((q) => q.creeper).length >= 2, `side ${id}: creepers`);
    assert.ok(side.gaps.filter((g) => g.kind === 'door').length >= 2 && side.gaps.filter((g) => g.kind === 'meters').length >= 2 && side.gaps.filter((g) => g.kind === 'footing').length >= 2, `side ${id}: doors, meter boards and footings between`);
    assert.ok(side.gaps.every((g, i) => !i || g.kind !== side.gaps[i - 1].kind), `side ${id}: no two plain stretches in a row get the same detail`);
  }
  assert.ok(REC.murals >= 3 && REC.tags >= 1 && REC.doors >= 3 && REC.meters >= 3 && REC.footings >= 3, JSON.stringify({ m: REC.murals, t: REC.tags, d: REC.doors, me: REC.meters, f: REC.footings }));
  const tris = trisOf(A, /^props\.boundary\.edgeart:world_mural/);
  assert.ok(tris >= REC.murals * 4, `${tris} triangles of paintings for ${REC.murals} paintings`);
  assert.ok(hueRuns({ stretches: [{ id: 'x', bays: [{ hue: 2 }, { hue: 2 }] }] }).length === 1, 'TEETH: two neighbouring houses of one hue are found');
  assert.ok(roofRuns({ stretches: [{ roof: { pkg: 'dish' } }, { id: 'y', roof: { pkg: 'dish' } }] }).length === 1, 'TEETH: two neighbouring roofs alike are found');
});

/** What is wrong with the paintings of one wall, in the order they hang: a discovery mural (those hang once, on their street walls), a stranger, two neighbours alike, one hung twice while all four are on offer. */
const paintingProblems = (keys) => keys.flatMap((k, i) => [
  muralKeys().includes(k) ? `${k} is a discovery mural, hung again as filler` : null,
  !edgeMuralKeys().includes(k) && !muralKeys().includes(k) ? `${k} is not one of the wall's paintings` : null,
  i && keys[i - 1] === k ? `${k} twice in a row` : null,
  keys.indexOf(k) !== i && keys.length <= edgeMuralKeys().length ? `${k} hung twice with only ${keys.length} paintings on the wall` : null,
]).filter(Boolean);

test('R1-106: the perimeter wall hangs paintings of its own, never a discovery mural again, and none twice in a row (TEETH: the old three-mural deck, a twin and a repeat are each found)', () => {
  const seen = [];
  for (const id of SIDES) {
    const keys = REC.plan.sides[id].stretches.filter((q) => q.art?.kind === 'mural').map((q) => q.art.key);
    assert.ok(keys.length >= 1, `side ${id}: at least one painting`);
    assert.deepEqual(paintingProblems(keys), [], `side ${id}: ${keys}`);
    seen.push(keys);
  }
  assert.notEqual(seen[0][0], seen[1][0], 'the two walls do not start with the same painting');
  assert.ok(new Set(seen.flat()).size >= 3, `${new Set(seen.flat()).size} different paintings on the two walls: ${seen.flat()}`);
  const hung = REC.features.filter((f) => f.kind === 'mural').map((f) => f.key);                            // what the build really hung (and found a region for: a throw would have left the wall plain)
  assert.equal(hung.length, REC.murals);
  assert.deepEqual(hung.filter((k) => !edgeMuralKeys().includes(k)), [], 'the walls hang only their own paintings');
  assert.deepEqual(A.errors ?? [], []);
  assert.equal(paintingProblems(['mural.condor', 'mural.fiesta', 'mural.cerro']).length, 3, 'TEETH: the old deck, three discovery murals, is found');
  assert.ok(paintingProblems(['edge.cafe', 'edge.cafe']).length >= 1, 'TEETH: two alike in a row are found');
  assert.equal(paintingProblems(['edge.cafe', 'edge.cable', 'edge.cafe']).length, 1, 'TEETH: one hung twice with fewer than four on the wall is found');
  assert.deepEqual(paintingProblems(['edge.cafe', 'edge.cable', 'edge.cancha', 'edge.colibri', 'edge.cafe']), [], 'a fifth painting may bring the first one back');
});

test('R1-D21: some windows are lit at night: one glow in each lit window, switching on at different times (TEETH: a glow outside a window is found)', () => {
  const mine = glowLog.list.filter((g) => Math.abs(Math.abs(g.x) - (EDGE.FACE - 0.22)) < 1e-6);
  const lit = SIDES.flatMap((id) => REC.plan.sides[id].stretches.flatMap((q) => q.windows.filter((w) => w.lit).map((w) => ({ sg: REC.plan.sides[id].sg, w }))));
  assert.ok(lit.length >= 8, `${lit.length} lit windows on the two walls`);
  assert.equal(mine.length, lit.length, 'one glow for each lit window');
  assert.equal(REC.glows, lit.length);
  assert.equal(glowLog.list.filter((g) => g.src === 'edgewall').length, mine.length, 'each one says who asked for it, so the vista tests can count their own lights apart from these');
  const inside = (g) => lit.some(({ sg, w }) => Math.sign(g.x) === sg && g.z >= w.z0 && g.z <= w.z1 && g.y >= w.sill && g.y <= w.sill + w.h);
  assert.ok(mine.every(inside), 'every glow is in the window it lights');
  assert.ok(!inside({ x: 99.13, y: 0.5, z: lit[0].w.z0 + 0.1 }), 'TEETH: a glow at the foot of the wall is outside every window');
  assert.ok(new Set(mine.map((g) => g.on.toFixed(3))).size >= 6, 'the lights come on one after another, not all at dusk');
  assert.ok(mine.every((g) => g.intensity > 0 && g.size > 0 && Number.isFinite(g.color)), 'a real glow: a colour, a size, an intensity');
});

test('R1-D21: the dressing is four meshes of four materials, none casting a shadow, with clean attributes (TEETH: a stray caster and a broken attribute are each found)', () => {
  const ms = edgeMeshes(A), names = ms.map((m) => m.name).sort();
  assert.deepEqual(names, ['props.boundary.edge:glass_dark', 'props.boundary.edge:plaster_rough', 'props.boundary.edgeart:world_mural', 'props.boundary.edgeart:world_sign']);
  assert.ok(ms.every((m) => m.castShadow === false), 'cast: false everywhere: no shadow-pass draw call is added');
  const root = (list) => ({ traverse: (f) => list.forEach(f) });
  assert.deepEqual(badAttributes(root(ms)), []);
  const broken = { name: 'x', geometry: { attributes: { position: { count: 1, itemSize: 3, array: new Float32Array([0, NaN, 0]) } } } };
  assert.equal(badAttributes(root([broken])).length, 1, 'TEETH: a NaN is found');
  const caster = { ...ms[0], castShadow: true };
  assert.equal([...ms.slice(1), caster].every((m) => m.castShadow === false), false, 'TEETH: a caster is found');
});

// ------------------------------------------------------------------------------------------------------------------------------------------------ budget (last: merging fuses the meshes it counts)
test('R1-D21: the dressing stays in budget: 30000 triangles, 4 draw calls, well under 150 ms (TEETH: the world without it adds none of them)', () => {
  const added = trisOf(A, /^props\.boundary\./) - trisOf(OFF, /^props\.boundary\./), cards = REC.leafTris;
  assert.ok(added + cards <= 30000, `${added} triangles of walls and ${cards} of foliage cards`);
  assert.ok(added >= 8000, `TEETH: ${added} triangles: the dressing is really there to be counted`);
  assert.equal(trisOf(OFF, /^props\.boundary\.edge/), 0);
  const dt = A.world.propTimes.boundary - OFF.world.propTimes.boundary;
  assert.ok(dt < 500, `the boundary step took ${dt} ms longer (150 ms is the aim; this bound only catches a slip of an order of magnitude)`);
  const withIt = A.batch.mergeStatic(), without = OFF.batch.mergeStatic();
  assert.ok(withIt.after - without.after <= 4, `${withIt.after - without.after} draw calls added (${without.after} -> ${withIt.after})`);
  assert.ok(withIt.after - without.after >= 2, 'TEETH: the draw calls it adds are counted');
});
