// A2: door leaves (js/arch/doors.js, leafbake.js) and the chapel's front (shellfacade.js `chapelPortal`).
//  * Review R4-010 "doors are flat slabs": street doors are glazed-topped, panelled or plank doors, room doors flush or panelled, metal doors pressed steel; every
//    leaf is a finite, door-sized mesh with real relief on both faces.
//  * Draw-call budget: closed leaves are drawn from a few static chunks (leafbake.js), the live leaf shows only while a door moves or stands open, and the geometry is
//    the same either way. (240 live exterior leaves were 240 draw calls at the spawn view.)
//  * Review R1-009 "chapel L48": a double door at least 1.6 m wide under an arch, a statue niche each side, the parish name painted on the wall, a rose window, no
//    shop board and no air-conditioner.
// The tick tests share the worlds, so the order of the tests below matters: the look tests read live leaves before the first tick bakes them.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-doors.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { testLots, planAll, localTris, coveredBy } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { LEAF_STYLES, leafStyle, SWING_T } from '../js/arch/doors.js';
import { pivotsOf } from '../js/arch/leafbake.js';
import { archRise } from '../js/arch/shellwin.js';
import { OUT as OUT_OF } from '../js/arch/mb.js';
import { paintedItems, parishLines, PARISH_W, PARISH_H } from '../js/arch/signs.js';

const real = await buildData({ furnish: false });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

const swingDoors = (bps) => bps.flatMap((bp) => bp.doors.filter((d) => d.kind === 'exterior' || d.kind === 'interior'));
const meshesOf = (st) => { const out = []; for (const pv of pivotsOf(st)) pv.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
/** Every triangle of the meshes as { a, b, c, n (unit normal), area }. */
function* triangles(meshes) {
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (const m of meshes) {
    const p = m.geometry.attributes.position, ix = m.geometry.index.array;
    for (let i = 0; i < ix.length; i += 3) {
      A.fromBufferAttribute(p, ix[i]); B.fromBufferAttribute(p, ix[i + 1]); C.fromBufferAttribute(p, ix[i + 2]);
      const n = e1.subVectors(B, A).cross(e2.subVectors(C, A)), l = n.length();
      if (l > 1e-12) yield { a: A, b: B, c: C, n: n.clone().divideScalar(l), area: l / 2 };
    }
  }
}
/** The leaf in its own frame (hinge at x = 0): the box round the vertices of the meshes (of one material, or all). */
function leafBox(meshes, matKey) {
  const box = new THREE.Box3();
  for (const m of meshes) if (!matKey || m.userData.matKey === matKey) { m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox); }
  return box;
}
const leavesOf = (st) => pivotsOf(st).map((pv) => { const out = []; pv.traverse((o) => { if (o.isMesh) out.push(o); }); return out; });
const wallLeafWidth = (d) => (d.double ? d.w / 2 : d.w);

// ---- the looks ----------------------------------------------------------------------------------------------------------------------------------
test('the barrio has every look of door: street doors glazed, panelled and plank, room doors flush and panelled, steel doors pressed steel (R4-010: no more flat slabs)', () => {
  const seen = { ext: new Map(), int: new Map() };
  for (const bp of real.buildings) for (const d of swingDoors([bp])) {
    const s = leafStyle(d), side = seen[d.ext ? 'ext' : 'int'];
    assert.ok(LEAF_STYLES.includes(s), `${d.id}: unknown style ${s}`);
    side.set(s, (side.get(s) ?? 0) + 1);
  }
  const show = (m) => [...m].map(([k, n]) => `${k}:${n}`).join(' ');
  for (const s of ['glazed', 'panels', 'planks']) assert.ok((seen.ext.get(s) ?? 0) >= 5, `street doors: ${show(seen.ext)}`);
  for (const s of ['flush', 'panels', 'metal']) assert.ok((seen.int.get(s) ?? 0) >= 5, `room doors: ${show(seen.int)}`);
  assert.ok(!seen.ext.has('flush') && !seen.int.has('glazed') && !seen.int.has('planks'), `a street look indoors or a room look outside: ext ${show(seen.ext)} int ${show(seen.int)}`);
  for (const s of LEAF_STYLES) assert.ok((seen.ext.get(s) ?? 0) + (seen.int.get(s) ?? 0) > 0, `style ${s} never used`);
  // a look is a property of the door, not of the order they are built in
  const d = swingDoors(real.buildings)[7];
  assert.equal(leafStyle(d), leafStyle({ ...d }));
  assert.equal(leafStyle({ ...d, double: true, mat: 'door_wood' }), 'panels', 'a double door is always panelled');
  assert.equal(leafStyle({ ...d, mat: 'door_metal' }), 'metal');
});

test('every leaf is a finite, door-sized mesh hinged at x = 0, thin, with the hardware on both faces', () => {
  const problems = [];
  for (const [label, ctx, bps] of SETS) for (const d of swingDoors(bps)) {
    const st = ctx.archDoors.get(d.id);
    if (!st) { problems.push(`${label} ${d.id}: no live door`); continue; }
    const w = wallLeafWidth(d);
    for (const meshes of leavesOf(st)) {
      if (!meshes.length) { problems.push(`${label} ${d.id}: a leaf without meshes`); continue; }
      for (const m of meshes) for (const v of m.geometry.attributes.position.array) if (!Number.isFinite(v)) { problems.push(`${label} ${d.id}: NaN in a leaf`); break; }
      const b = leafBox(meshes), tris = meshes.reduce((n, m) => n + m.geometry.index.count / 3, 0);
      const tag = `${label} ${d.id} (${leafStyle(d)})`;
      if (b.min.x < -0.02 || b.max.x > w + 0.02 || b.max.x < w - 0.08) problems.push(`${tag}: x ${b.min.x.toFixed(2)}..${b.max.x.toFixed(2)} for a ${w} m leaf`);
      if (b.min.y < -0.01 || b.max.y > d.h + 0.01 || b.max.y < d.h - 0.02) problems.push(`${tag}: y ${b.min.y.toFixed(2)}..${b.max.y.toFixed(2)} for a ${d.h} m door`);
      if (b.max.z > 0.075 || b.min.z < -0.075 || b.max.z < 0.05 || b.min.z > -0.05) problems.push(`${tag}: z ${b.min.z.toFixed(3)}..${b.max.z.toFixed(3)} (hardware stands out on both faces, nothing past 7.5 cm)`);
      if (tris < 60 || tris > 600) problems.push(`${tag}: ${tris} triangles`);
      if (meshes.length > 2) problems.push(`${tag}: ${meshes.length} meshes (one for the wood or steel, one for glass)`);
    }
  }
  assert.deepEqual(problems, []);
});

test('a leaf has relief on both faces: panels, routed rectangles and glazing bars stand proud of the slab, plank doors have their V-grooves, and only glazed doors have glass', () => {
  const problems = [], per = new Map();
  for (const [label, ctx, bps] of SETS) for (const d of swingDoors(bps)) {
    const st = ctx.archDoors.get(d.id), style = leafStyle(d), w = wallLeafWidth(d);
    for (const meshes of leavesOf(st)) {
      const tag = `${label} ${d.id} (${style})`, face = w * d.h, raised = { 1: 0, [-1]: 0 }, grooves = { 1: 0, [-1]: 0 };
      for (const t of triangles(meshes.filter((m) => m.userData.matKey !== 'glass'))) {
        if (Math.abs(t.n.z) < 0.99) continue;
        const side = Math.sign(t.n.z), z = Math.abs((t.a.z + t.b.z + t.c.z) / 3);
        if (side * (t.a.z + t.b.z + t.c.z) < 0) continue;                                    // a face that looks in but stands on the far side
        if (z >= 0.0345 && z <= 0.05) raised[side] += t.area;
        if (z > 0.0245 && z < 0.0285 && Math.max(t.a.x, t.b.x, t.c.x) - Math.min(t.a.x, t.b.x, t.c.x) < 0.012) grooves[side] += 1;
      }
      const glass = leafBox(meshes, 'glass'), hasGlass = meshes.some((m) => m.userData.matKey === 'glass');
      per.set(style, (per.get(style) ?? 0) + 1);
      if (style === 'planks') {
        const want = 2 * (Math.max(3, Math.round(w / 0.14)) - 1);
        for (const s of [1, -1]) if (grooves[s] < want) problems.push(`${tag}: ${grooves[s]} groove triangles on the ${s > 0 ? 'front' : 'back'}, want ${want}`);
      } else for (const s of [1, -1]) if (raised[s] < 0.3 * face) problems.push(`${tag}: ${raised[s].toFixed(2)} m2 raised on the ${s > 0 ? 'front' : 'back'} of a ${face.toFixed(2)} m2 leaf`);
      if (style === 'glazed') {
        if (!hasGlass) problems.push(`${tag}: no glass`);
        else if (glass.min.x < 0.05 || glass.max.x > w - 0.05 || glass.min.y < d.h * 0.45 || glass.max.y > d.h - 0.1 || (glass.max.x - glass.min.x) * (glass.max.y - glass.min.y) < 0.12)
          problems.push(`${tag}: glass ${glass.min.x.toFixed(2)},${glass.min.y.toFixed(2)} .. ${glass.max.x.toFixed(2)},${glass.max.y.toFixed(2)} in a ${w} x ${d.h} leaf`);
      } else if (hasGlass) problems.push(`${tag}: glass in a ${style} leaf`);
    }
  }
  assert.deepEqual(problems, []);
  assert.deepEqual([...per.keys()].sort(), [...LEAF_STYLES].sort(), 'every look was checked');
});

// ---- the chapel ---------------------------------------------------------------------------------------------------------------------------------
const chapels = SETS.flatMap(([label, ctx, bps]) => bps.filter((bp) => bp.lot.kind === 'chapel').map((bp) => [`${label} ${bp.id}`, ctx, bp]));

test('the chapel has a double door at least 1.6 m wide, an arch round it, a statue niche each side, the parish name above, a rose window, no shop board and no air-conditioner (R1-009)', () => {
  assert.ok(chapels.length >= 2 && chapels.some(([l]) => l.startsWith('real')), 'a chapel in the barrio and one in the test lots');
  for (const [tag, , bp] of chapels) {
    const d = bp.doors.find((q) => q.entrance === 'main'), S = bp.shell, F = bp.facade, of = (k) => F.filter((r) => r.kind === k);
    assert.ok(d && d.double === true && d.w >= 1.6 && d.w <= 2.0 && d.h >= 2.3 && d.h <= 2.6 && d.side === 'front', `${tag}: main door ${d?.w}x${d?.h} double=${d?.double}`);
    assert.equal(of('portal').length, 1, `${tag}: the arch`);
    assert.equal(of('niche').length, 2, `${tag}: a niche each side of the door`);
    assert.equal(of('name').length, 1, `${tag}: the painted name`);
    assert.equal(of('rose').length, 1, `${tag}: the rose window`);
    assert.deepEqual([of('sign').length, of('ac').length, of('blade').length], [0, 0, 0], `${tag}: no shop board, air-conditioner or blade sign on a chapel`);
    const [portal] = of('portal'), [name] = of('name'), [rose] = of('rose'), niches = of('niche').sort((a, b) => a.u0 - b.u0);
    assert.ok(portal.u0 <= d.x - d.w / 2 - 0.2 && portal.u1 >= d.x + d.w / 2 + 0.2 && portal.y0 <= 0.01 && portal.y1 >= d.h + 0.5, `${tag}: the arch frames the door (u ${portal.u0}..${portal.u1}, y ..${portal.y1})`);
    assert.ok(Math.abs((name.u0 + name.u1) / 2 - d.x) < 0.01 && name.y0 >= portal.y1 - 0.01 && name.y1 <= rose.y0 + 0.01, `${tag}: the name is centred over the arch and under the rose window (y ${name.y0}..${name.y1} between ${portal.y1} and ${rose.y0})`);
    assert.ok(name.u0 >= -S.W / 2 && name.u1 <= S.W / 2, `${tag}: the name fits the wall`);
    // the niches mirror each other round the door, stay clear of the arch, and are on the wall
    assert.ok(Math.abs((niches[0].u0 + niches[0].u1) / 2 + (niches[1].u0 + niches[1].u1) / 2 - 2 * d.x) < 0.01, `${tag}: niches mirror round the door`);
    assert.ok(niches[0].u1 <= portal.u0 + 1e-6 && niches[1].u0 >= portal.u1 - 1e-6, `${tag}: niches clear of the arch`);
    for (const n of niches) {
      assert.ok(n.u0 >= -S.W / 2 && n.u1 <= S.W / 2 && n.y0 >= 0.8 && n.y1 <= d.h + 0.2, `${tag}: niche on the wall (u ${n.u0}..${n.u1}, y ${n.y0}..${n.y1})`);
      for (const w of bp.windows) if (w.side === 'front' && w.floor === 0) assert.ok(Math.abs(w.x - (n.u0 + n.u1) / 2) >= (w.w + (n.u1 - n.u0)) / 2, `${tag}: niche on window ${w.id}`);
    }
    // the entry steps are as wide as the door and a bit more (the test lots stand 0.4 m above the street, so they have them)
    const steps = S.steps.filter((s) => s.door === d.id), wide = (s) => Math.max(s.rect.x1 - s.rect.x0, s.rect.z1 - s.rect.z0);
    if (tag.startsWith('test')) assert.ok(steps.length >= 1, `${tag}: a step in front of the chapel door`);
    for (const s of steps) assert.ok(wide(s) >= d.w + 0.3, `${tag}: a step ${wide(s).toFixed(2)} m wide for a ${d.w} m door`);
  }
});

test('the chapel windows have round heads (R1-D06b): the wall closes the corners above each arch on the street face and the room face, the reveal follows the curve, and the glass fills the arch', () => {
  let checked = 0;
  for (const [tag, ctx, bp] of chapels) {
    const S = bp.shell, tris = localTris(ctx, bp), room = (w) => bp.rooms.find((r) => r.id === w.room);
    for (const w of bp.windows) assert.equal(!!w.arch, room(w).type === 'chapel' && w.kind === 'fixed', `${tag}: ${w.id} (${room(w).type}, ${w.kind}) arch=${w.arch}`);
    for (const wl of S.walls) for (const o of wl.openings) {
      const w = bp.windows.find((q) => q.id === o.ref);
      if (o.kind !== 'window' || !w?.arch) continue;
      checked++;
      const dir = wl.dir, s = OUT_OF[wl.side], rise = archRise(w), yk = wl.floor * S.fh, yb = yk + o.y1, ys = yb - rise, uc = (o.u0 + o.u1) / 2, hw = (o.u1 - o.u0) / 2;
      const at = `${tag} ${w.id}`, outer = wl.at + s * wl.t / 2, inner = wl.at - s * wl.t / 2, pF = wl.at + s * (wl.t / 2 - 0.1);
      assert.ok(rise >= 0.3 && Math.abs(rise - Math.min(hw, w.h - 0.3)) < 1e-3 && ys > yk + o.y0, `${at}: rise ${rise} over a ${(2 * hw).toFixed(2)} x ${w.h} opening`);
      for (const [plane, face, name] of [[outer, s, 'street'], [inner, -s, 'room']]) {
        for (const u of [o.u0 + 0.02, o.u1 - 0.02]) assert.ok(coveredBy(tris, dir, plane, face, null, u, yb - 0.02), `${at}: no wall in the corner above the arch at u=${u.toFixed(2)} on the ${name} face`);
        for (const sg of [-1, 1]) {
          assert.ok(coveredBy(tris, dir, plane, face, null, uc + sg * hw * 0.8, ys + rise * 0.8), `${at}: the arc is not followed: no wall just outside it on the ${name} face`);
          assert.ok(!coveredBy(tris, dir, plane, face, null, uc + sg * hw * 0.6, ys + rise * 0.6), `${at}: wall inside the arch on the ${name} face`);
          assert.ok(!coveredBy(tris, dir, plane, face, null, uc + sg * (hw - 0.03), ys - 0.1), `${at}: wall across the opening below the springing on the ${name} face`);
        }
        assert.ok(!coveredBy(tris, dir, plane, face, null, uc, yb - 0.1), `${at}: wall across the top of the arch on the ${name} face`);
      }
      // the reveal: soffit strips tilted both along and up (a flat head has none), every vertex of them on the arch
      const iu = dir === 'x' ? 0 : 2, ip = dir === 'x' ? 2 : 0;
      let tilted = 0;
      for (const { k, v } of tris) {
        if (['frame_paint', 'glass', 'window_lit', 'grille_iron'].includes(k)) continue;                    // the window's own parts (the bent frame bars are tilted too)
        if (!v.every((q) => q[ip] >= Math.min(outer, inner) - 2e-3 && q[ip] <= Math.max(outer, inner) + 2e-3) || v.every((q) => Math.abs(q[ip] - v[0][ip]) < 2e-3)) continue;
        if (!v.every((q) => q[iu] >= o.u0 - 1e-3 && q[iu] <= o.u1 + 1e-3 && q[1] >= ys - 1e-3 && q[1] <= yb + 1e-3)) continue;
        const e = (p, q) => [q[0] - p[0], q[1] - p[1], q[2] - p[2]], A = e(v[0], v[1]), B = e(v[0], v[2]);
        const n = [A[1] * B[2] - A[2] * B[1], A[2] * B[0] - A[0] * B[2], A[0] * B[1] - A[1] * B[0]], l = Math.hypot(...n);
        if (Math.abs(n[ip]) / l > 0.01 || Math.abs(n[iu]) / l < 0.15 || Math.abs(n[1]) / l < 0.15) continue;
        tilted++;
        for (const q of v) assert.ok(Math.abs(Math.hypot((q[iu] - uc) / hw, (q[1] - ys) / rise) - 1) < 1e-3, `${at}: a soffit vertex off the arch (${q.map((x) => x.toFixed(3))})`);
      }
      assert.ok(tilted >= 16, `${at}: ${tilted} curved soffit triangles`);
      // the glass: the round head is glazed, the corners above it are not
      assert.ok(coveredBy(tris, dir, pF, 0, ['glass', 'window_lit'], uc, yb - 0.1), `${at}: no glass in the head of the arch`);
      assert.ok(coveredBy(tris, dir, pF, 0, ['glass', 'window_lit'], uc + hw * 0.5, ys + rise * 0.5), `${at}: no glass in the arch`);
      for (const u of [o.u0 + 0.06, o.u1 - 0.06]) assert.ok(!coveredBy(tris, dir, pF, 0, ['glass', 'window_lit'], u, yb - 0.04), `${at}: glass in the corner above the arch at u=${u.toFixed(2)}`);
    }
  }
  assert.ok(checked >= 12, `${checked} arched chapel windows checked`);
});

test('the painted parish name is the saint of the lot name, in three lines (a small line, the name big, a notice), drawn letter by letter on the decal atlas; only chapels have one', () => {
  const lot = { id: 'L48', kind: 'chapel', name: 'Capilla de la Virgen del Carmen' };
  assert.deepEqual(parishLines(lot), { top: 'CAPILLA PARROQUIAL', main: 'VIRGEN DEL CARMEN', notice: 'MISA DOMINGOS 5 PM' });
  assert.equal(parishLines({ id: 'x', name: 'Capilla San Judas' }).main, 'SAN JUDAS');
  const items = paintedItems([lot, { id: 'L01', kind: 'house', name: 'Casa' }, { id: 'L02', kind: 'shophouse', name: 'Tienda' }, { id: 'L49', kind: 'chapel', name: 'Capilla del Señor de los Milagros' }]);
  assert.deepEqual(items.map((i) => [i.key, i.w, i.h]), [['parish:L48', PARISH_W, PARISH_H], ['parish:L49', PARISH_W, PARISH_H]]);
  const log = [];
  const g = new Proxy({}, { get: (_, k) => (k === 'measureText' ? () => ({ width: 10 }) : (...a) => { log.push([k, a]); }), set: () => true });
  items[0].paint(g, PARISH_W, PARISH_H);
  const t = parishLines(lot);
  assert.equal(log.filter(([k]) => k === 'fillText').map(([, a]) => a[0]).join(''), t.top + t.main + t.notice, 'every letter is drawn, in reading order');
  assert.ok(log.filter(([k]) => k === 'fillRect').length >= 6, 'rules and crosses');
  assert.equal(paintedItems([]).length + paintedItems(undefined).length, 0);
});

// ---- baked closed leaves --------------------------------------------------------------------------------------------------------------------------
/** The world matrix of an object from the local matrices alone (it leaves `matrixWorld` as the page left it: a bake must bring those up to date itself). */
function worldOf(o) {
  const M = new THREE.Matrix4();
  for (let p = o; p; p = p.parent) { if (p.matrixAutoUpdate) p.updateMatrix(); M.premultiply(p.matrix); }
  return M;
}
/** The world-space vertices of every live mesh of a door, grouped by material key, in traversal order: { matKey -> [{ pos, nor, uv, col }] }. */
function snapshot(st) {
  const out = new Map();
  for (const m of meshesOf(st)) {
    const g = m.geometry, n = g.attributes.position.count, W = worldOf(m), NM = new THREE.Matrix3().getNormalMatrix(W), v = new THREE.Vector3();
    const pos = new Float64Array(n * 3), nor = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(W); pos.set([v.x, v.y, v.z], i * 3);
      v.fromBufferAttribute(g.attributes.normal, i).applyNormalMatrix(NM).normalize(); nor.set([v.x, v.y, v.z], i * 3);
    }
    const k = m.userData.matKey, list = out.get(k) ?? out.set(k, []).get(k);
    list.push({ pos, nor, uv: Float32Array.from(g.attributes.uv.array), col: Float32Array.from(g.attributes.color.array), tris: g.index.count / 3 });
  }
  return out;
}
const drawn = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };

test('at the first tick every closed leaf is baked into a few static chunks: the live leaves hide, and the baked triangles are exactly the live ones, in world space', (t) => {
  for (const [label, ctx, bps] of SETS) {
    const snaps = new Map();
    for (const d of swingDoors(bps).concat(bps.flatMap((bp) => bp.doors.filter((q) => q.kind === 'shutter')))) snaps.set(d.id, snapshot(ctx.archDoors.get(d.id)));
    assert.equal(ctx.archBaked, undefined, `${label}: nothing is baked before the first tick`);
    const live = [...ctx.archDoors.values()].flatMap((st) => meshesOf(st)).length;
    ctx.systems.find((s) => s.name === 'arch-doors').fn(1 / 60);
    const problems = [];
    let ext = 0, int = 0;
    for (const st of ctx.archDoors.values()) {
      const tag = `${label} ${st.id}`;
      if (!st.bake?.length) { problems.push(`${tag}: not baked`); continue; }
      for (const pv of pivotsOf(st)) if (drawn(pv)) problems.push(`${tag}: the live leaf is still drawn`);
      assert.equal(st.bakeHidden, false);
      // street leaves share the barrio's chunks; a room door is baked under its own building's `.int` group, so the visibility budget hides it with the interior
      const home = st.d.ext || st.d.roof ? ctx.archBaked : ctx.batch.object(st.bid + '.int');
      if (st.bake.some((r) => r.mesh.parent !== home)) problems.push(`${tag}: baked into the wrong group (${st.bake.find((r) => r.mesh.parent !== home).mesh.parent?.name})`);
      // the baked vertices of this door, per material, in order, against the live ones
      const want = snaps.get(st.id), got = new Map();
      for (const r of st.bake) {
        const lo = Math.min(...r.index.array.subarray(r.from, r.to)), hi = Math.max(...r.index.array.subarray(r.from, r.to)), g = r.mesh.geometry, k = r.mesh.userData.matKey;
        const list = got.get(k) ?? got.set(k, []).get(k); list.push({ lo, hi, g, r });
        if (r.mesh.castShadow || !r.mesh.receiveShadow || !r.mesh.userData.noMerge) problems.push(`${tag}: baked mesh flags (cast ${r.mesh.castShadow}, receive ${r.mesh.receiveShadow}, noMerge ${r.mesh.userData.noMerge})`);
        (st.d.ext || st.d.roof ? ext++ : int++);
      }
      if (!want) { problems.push(`${tag}: no snapshot`); continue; }
      for (const [k, parts] of want) {
        const have = got.get(k);
        if (!have || have.length !== parts.length) { problems.push(`${tag}: ${k} baked in ${have?.length ?? 0} parts, live in ${parts.length}`); continue; }
        parts.forEach((p, j) => {
          const { lo, hi, g, r } = have[j], n = p.pos.length / 3;
          if (hi - lo + 1 !== n) { problems.push(`${tag}: ${k} part ${j} has ${hi - lo + 1} vertices, live ${n}`); return; }
          if ((r.to - r.from) / 3 !== p.tris) problems.push(`${tag}: ${k} part ${j} has ${(r.to - r.from) / 3} triangles, live ${p.tris}`);
          const P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv.array, C = g.attributes.color.array;
          let worst = 0;
          for (let i = 0; i < n; i++) {
            for (let c = 0; c < 3; c++) worst = Math.max(worst, Math.abs(P[(lo + i) * 3 + c] - p.pos[i * 3 + c]), Math.abs(N[(lo + i) * 3 + c] - p.nor[i * 3 + c]), Math.abs(C[(lo + i) * 3 + c] - p.col[i * 3 + c]));
            for (let c = 0; c < 2; c++) worst = Math.max(worst, Math.abs(U[(lo + i) * 2 + c] - p.uv[i * 2 + c]));
          }
          if (worst > 2e-4) problems.push(`${tag}: ${k} part ${j} differs from the live leaf by ${worst.toExponential(2)}`);
        });
      }
    }
    assert.deepEqual(problems.slice(0, 12), [], `${label}: ${problems.length} problems`);
    // the point of it: a handful of meshes instead of one per leaf
    const chunks = ctx.archBaked?.children.length ?? 0;
    let inner = 0; for (const bp of bps) ctx.batch.object(bp.id + '.int').traverse((o) => { if (o.isMesh && o.name.includes('.leaves.baked:')) inner++; });
    t.diagnostic(`${label}: ${live} live leaf meshes -> ${chunks} street chunks (${ext} leaf parts) + ${inner} room-door meshes (${int} leaf parts)`);
    // the barrio is dense (a street chunk takes ~10 leaf parts of one material); the sparse test lots (210 x 210 m for 60 buildings) fill fewer
    assert.ok(chunks >= 1 && chunks * (label === 'real' ? 8 : 2) <= ext && chunks <= 40, `${label}: ${chunks} street chunks for ${ext} leaf parts`);
    assert.ok(inner * 3 <= int, `${label}: ${inner} room-door meshes for ${int} leaf parts`);
    for (const m of ctx.archBaked.children) {
      m.geometry.computeBoundingBox();
      const b = m.geometry.boundingBox;
      assert.ok(b.max.x - b.min.x <= 128.5 && b.max.z - b.min.z <= 128.5 && m.geometry.attributes.position.count <= 60000, `${label}: chunk ${m.name} is too big`);
    }
  }
});

test('the baked leaves of a door give way to the live leaf while it moves or stands open, and come back when it has settled closed', () => {
  for (const [label, ctx, bps] of SETS) {
    const sys = ctx.systems.find((s) => s.name === 'arch-doors'), dt = 1 / 60;
    const picks = [bps.flatMap((bp) => bp.doors).find((d) => d.kind === 'exterior' && d.ext && !d.double), bps.flatMap((bp) => bp.doors).find((d) => d.kind === 'shutter'),
      bps.flatMap((bp) => bp.doors).find((d) => d.kind === 'interior'), bps.flatMap((bp) => bp.doors).find((d) => d.double)];
    for (const d of picks) {
      assert.ok(d, `${label}: a door to pick`);
      const st = ctx.archDoors.get(d.id), idx = st.bake.map((r) => Array.from(r.index.array.subarray(r.from, r.to)));
      assert.ok(idx.every((a) => a.some((v) => v !== 0)), `${d.id}: baked indices are non-trivial`);
      ctx.events.emit('door:request', { doorId: d.id, open: true, by: 'npc' });
      assert.ok(pivotsOf(st).every(drawn), `${d.id}: the live leaf shows the moment the door starts to open`);
      st.bake.forEach((r) => assert.ok(r.index.array.subarray(r.from, r.to).every((v) => v === 0), `${d.id}: the baked triangles are gone while it opens`));
      for (let i = 0; i < 40; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every(drawn) && st.bakeHidden === true, `${d.id}: stays live while open`);
      ctx.events.emit('door:request', { doorId: d.id, open: false, by: 'npc' });
      for (let i = 0; i < 12; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every(drawn), `${d.id}: still live while it swings shut`);
      for (let i = 0; i < 40; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every((pv) => !drawn(pv)), `${d.id}: hidden again once closed`);
      st.bake.forEach((r, i) => assert.deepEqual(Array.from(r.index.array.subarray(r.from, r.to)), idx[i], `${d.id}: the baked triangles are back, as they were`));
      assert.ok(Math.abs(st.pivot.rotation.y - st.phi0) < 1e-6 || st.rig, `${d.id}: the live leaf closed`);
      // a collider flipped by anyone else (A4's navigation) takes the same road
      ctx.physics.setDoor(d.id, true);
      sys.fn(dt);
      assert.ok(pivotsOf(st).every(drawn), `${d.id}: a flipped collider wakes the live leaf`);
      ctx.physics.setDoor(d.id, false);
      for (let i = 0; i < 60; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every((pv) => !drawn(pv)) && st.bakeHidden === false, `${d.id}: and it is baked again after`);
      // the player's E (and the push that calls the same function): interact -> toggle, one aim target on each side of the leaf
      const outside = ctx.interact.items.get(`door:${d.id}:out`), inside = ctx.interact.items.get(`door:${d.id}:in`);
      assert.ok(outside && inside, `${d.id}: both aim targets`);
      outside.use();
      assert.equal(ctx.physics.doorOpen(d.id), true, `${d.id}: E opens the collider`);
      assert.ok(pivotsOf(st).every(drawn), `${d.id}: E shows the live leaf at once, or the door would stay shut on screen while it is open underfoot`);
      st.bake.forEach((r) => assert.ok(r.index.array.subarray(r.from, r.to).every((v) => v === 0), `${d.id}: and E takes the baked triangles away`));
      for (let i = 0; i < 40; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every(drawn) && st.bakeHidden === true, `${d.id}: the live leaf stands open`);
      inside.use();
      assert.equal(ctx.physics.doorOpen(d.id), false, `${d.id}: E closes the collider from the other side`);
      assert.ok(pivotsOf(st).every(drawn), `${d.id}: the live leaf swings shut`);
      for (let i = 0; i < 60; i++) sys.fn(dt);
      assert.ok(pivotsOf(st).every((pv) => !drawn(pv)) && st.bakeHidden === false, `${d.id}: baked again once E has shut it`);
      st.bake.forEach((r, i) => assert.deepEqual(Array.from(r.index.array.subarray(r.from, r.to)), idx[i], `${d.id}: the baked triangles are back, as they were, after E`));
    }
  }
});

test('the chapel double door: two leaves of half the opening, hinged at the two jambs, that open together to the same side a quarter turn', () => {
  for (const [tag, ctx, bp] of chapels) {
    const d = bp.doors.find((q) => q.entrance === 'main'), st = ctx.archDoors.get(d.id), sys = ctx.systems.find((s) => s.name === 'arch-doors'), pvs = pivotsOf(st);
    assert.equal(pvs.length, 2, `${tag}: two leaves`);
    const [A, B] = pvs, along = d.wall.dir === 'x' ? 'x' : 'z';
    assert.ok(Math.abs(A.position[along] - (((along === 'x' ? d.x : d.z)) - d.w / 2)) < 1e-6 && Math.abs(B.position[along] - ((along === 'x' ? d.x : d.z) + d.w / 2)) < 1e-6, `${tag}: hinged at the two jambs`);
    for (const pv of pvs) {
      const box = leafBox(meshesOf({ rig: { pivots: [pv] } }));
      assert.ok(Math.abs(box.max.x - d.w / 2) < 0.1 && box.min.x > -0.02, `${tag}: each leaf is half the opening wide (${box.min.x.toFixed(2)}..${box.max.x.toFixed(2)})`);
    }
    const tip = (pv) => { pv.updateWorldMatrix(true, false); return new THREE.Vector3(d.w / 2 - 0.02, 1, 0).applyMatrix4(pv.matrixWorld); };
    const closed = [tip(A), tip(B)], r0 = pvs.map((pv) => pv.rotation.y);
    assert.ok(closed[0].distanceTo(closed[1]) < 0.1, `${tag}: the free edges meet in the middle when closed`);
    const events = [];
    ctx.events.on('door:toggle', (e) => { if (e.doorId === d.id) events.push(e); });
    ctx.events.emit('door:request', { doorId: d.id, open: true, by: 'npc' });
    let ticks = 0;
    for (; ticks < 60 && !events.length; ticks++) sys.fn(1 / 60);
    assert.ok(Math.abs(ticks / 60 - SWING_T) < 0.06, `${tag}: both leaves settle together after ${ticks / 60} s`);
    const open = [tip(A), tip(B)], inner = bp.frame.toWorld(d.x + d.nx, 1, d.z + d.nz), outer = bp.frame.toWorld(d.x - d.nx, 1, d.z - d.nz), wall = bp.frame.toWorld(d.x, 1, d.z);
    const nrm = [inner[0] - outer[0], inner[2] - outer[2]], len = Math.hypot(...nrm), side = (p) => ((p.x - wall[0]) * nrm[0] + (p.z - wall[2]) * nrm[1]) / len;
    assert.ok(side(open[0]) > 0.7 && side(open[1]) > 0.7, `${tag}: both leaves swing into the nave (${side(open[0]).toFixed(2)}, ${side(open[1]).toFixed(2)} m in)`);
    assert.ok(Math.abs(open[0].distanceTo(open[1]) - d.w) < 0.1, `${tag}: the open leaves stand ${d.w} m apart`);
    const turns = pvs.map((pv, i) => pv.rotation.y - r0[i]);
    assert.ok(turns.every((q) => Math.abs(Math.abs(q) - Math.PI / 2) < 0.05) && turns[0] * turns[1] < 0, `${tag}: a quarter turn each, in opposite senses (${turns.map((q) => q.toFixed(2))})`);
    ctx.events.emit('door:request', { doorId: d.id, open: false, by: 'npc' });
    for (let i = 0; i < 40; i++) sys.fn(1 / 60);
    const shut = [tip(A), tip(B)];
    assert.ok(shut[0].distanceTo(closed[0]) < 1e-6 && shut[1].distanceTo(closed[1]) < 1e-6, `${tag}: closed again exactly where it was`);
  }
});
