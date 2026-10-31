// Frontage aprons (js/world/aprons.js, drawn by surfaces.js): the paving between a street's back edge of pavement and the facades along it. R1-D11 found bare earth ("a gravel
// strip") in that 0.6 m gap along every shopfront. What it guards: every lot that fronts a street has an apron; the cells close the whole gap, from the pavement edge to the
// lot's front line, and no more (no cell on a carriageway, a plaza, another street, another lot or another apron); the built mesh lies flush with the sidewalk, face up, one
// layer deep, with a skirt on every loose end. Each check that can go vacuous has a TEETH test.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-aprons.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan, SIDEWALK } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { frontageAprons, APRON } from '../js/world/aprons.js';
import { yDense } from '../js/world/surfaces.js';
import { footprint, pointInPoly, project } from '../js/world/geom.js';
import { SEED } from './world-lib.mjs';

const ctx = createContext({ seed: SEED, headless: true });
ctx.plan = generatePlan(ctx);
ctx.physics.setTerrain(ctx.plan.heightAt);
await buildWorld(ctx);
ctx.batch.flushAll();
const plan = ctx.plan, W = ctx.world, byId = new Map(plan.streets.map((s) => [s.id, s]));
const aprons = frontageAprons(plan), byLot = new Map(aprons.map((a) => [a.lot, a]));
const fronting = plan.lots.filter((l) => { const st = byId.get(l.front); return st && st.kind !== 'stair' && st.surface !== 'dirt'; });

const cellPoly = (q) => [q.a0, q.a1, q.b1, q.b0];
const inAny = (ap, x, z) => ap.cells.some((q) => pointInPoly(cellPoly(q), x, z));
/** Local frame of a lot: lx along its front line, lz out of the facade, from a world point. */
const local = (lot, x, z) => { const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY), dx = x - lot.x, dz = z - lot.z; return [dx * c - dz * s, dx * s + dz * c]; };
const world = (lot, lx, lz) => { const c = Math.cos(lot.rotY), s = Math.sin(lot.rotY); return [lot.x + lx * c + lz * s, lot.z - lx * s + lz * c]; };

/** Lots whose gap is not closed: a point 5 cm in front of the facade and one 5 cm beyond the pavement edge, every half metre along the front, must lie in a cell, except where
 *  a side street opens (the sidewalk is dropped there, surfaces.js inMouth, and its apron with it). */
function uncovered(list, mouths = { n: 0, samples: 0 }) {
  const by = new Map(list.map((a) => [a.lot, a])), bad = [];
  for (const lot of fronting) {
    const st = byId.get(lot.front), hw = st.width / 2, ap = by.get(lot.id), joiners = plan._joiners.get(st.id) ?? [];
    for (let lx = -lot.w / 2 + 0.25; lx <= lot.w / 2 - 0.2; lx += 0.5) {
      const [fx, fz] = world(lot, lx, lot.d / 2 + 0.05), pr = project(st._d.pts, st._d.cum, fx, fz), k = (hw + 0.05) / pr.d;
      mouths.samples++;
      if (joiners.some((j) => project(j._d.pts, j._d.cum, pr.x, pr.z).d <= j.width / 2 + 0.5)) { mouths.n++; continue; }
      const ex = pr.x + (fx - pr.x) * k, ez = pr.z + (fz - pr.z) * k;
      if (!ap || !inAny(ap, fx, fz) || !inAny(ap, ex, ez)) { bad.push(lot.id); break; }
    }
  }
  return bad;
}

test('every lot that fronts a street with a surface has an apron, the cells close the gap from the pavement edge to the facade, and the build reports them', () => {
  assert.ok(fronting.length >= 100, `${fronting.length} lots front a street`);
  assert.deepEqual(fronting.filter((l) => !byLot.has(l.id)).map((l) => l.id), [], 'a lot without an apron');
  const mouths = { n: 0, samples: 0 };
  assert.deepEqual(uncovered(aprons, mouths), [], 'a gap left open');
  assert.ok(mouths.n <= 0.05 * mouths.samples, `${mouths.n} of ${mouths.samples} samples sit in a mouth: few enough that the exemption cannot hide a missing apron`);
  assert.equal(W.aprons.lots, aprons.length, 'the build reports every apron'); assert.equal(W.aprons.cells, aprons.reduce((n, a) => n + a.cells.length, 0));
  assert.ok(W.aprons.metres > 0.8 * fronting.reduce((m, l) => m + l.w, 0), `${W.aprons.metres} m of apron for ${fronting.reduce((m, l) => m + l.w, 0).toFixed(0)} m of frontage`);
});

test('TEETH: the gap check finds a lot with no apron, one with half of it, and a cell pulled back from the facade', () => {
  assert.deepEqual(uncovered(aprons.slice(1)), [aprons[0].lot], 'the first apron removed');
  const half = aprons.map((a, i) => (i ? a : { ...a, cells: a.cells.slice(0, Math.max(1, a.cells.length - 1)) }));
  const lot0 = plan.lots.find((l) => l.id === aprons[0].lot), long = aprons[0].cells.length > 1 || lot0.w > 0;
  assert.ok(long);
  if (aprons[0].cells.length > 1) assert.deepEqual(uncovered(half), [aprons[0].lot], 'the last cell removed');
  const short = aprons.map((a, i) => (i ? a : { ...a, cells: a.cells.map((q) => ({ ...q, b0: q.a0, b1: q.a1 })) }));          // collapsed onto the pavement edge: nothing reaches the wall
  assert.deepEqual(uncovered(short), [aprons[0].lot], 'cells that stop at the pavement edge');
});

test('a cell runs from the back edge of the pavement (offset half the street width) to the lot\'s front line, tucked 4 cm under the facade, and never folds', () => {
  for (const ap of aprons) {
    const st = byId.get(ap.street), lot = plan.lots.find((l) => l.id === ap.lot), hw = st.width / 2, d = st._d;
    for (const q of ap.cells) {
      for (const p of [q.a0, q.a1]) assert.ok(Math.abs(project(d.pts, d.cum, p[0], p[1]).d - hw) < 0.03, `${ap.lot}: an edge point ${project(d.pts, d.cum, p[0], p[1]).d.toFixed(3)} m from the axis of ${st.id}, which is ${hw} m wide`);
      for (const p of [q.b0, q.b1]) {
        const [lx, lz] = local(lot, p[0], p[1]);
        assert.ok(Math.abs(lz - (lot.d / 2 - APRON.tuck)) < 0.001 && Math.abs(lx) <= lot.w / 2 + 0.001, `${ap.lot}: a facade point at local ${lx.toFixed(3)}, ${lz.toFixed(3)}`);
      }
      assert.ok(q.o0 > hw + 0.05 && q.o1 > hw + 0.05, `${ap.lot}: the cell is ${(q.o0 - hw).toFixed(2)} and ${(q.o1 - hw).toFixed(2)} m deep`);
      assert.ok(Math.abs(q.s1 - q.s0) <= APRON.step + 1e-6 && Math.abs(q.s1 - q.s0) > 0.01, `${ap.lot}: a cell ${Math.abs(q.s1 - q.s0)} m long`);
    }
    assert.ok(ap.side === project(d.pts, d.cum, lot.x, lot.z).side, `${ap.lot}: on the lot's side of the street`);
  }
  const gaps = aprons.flatMap((a) => a.cells.map((q) => Math.min(q.o0, q.o1) - a.hw)), deep = Math.max(...aprons.flatMap((a) => a.cells.map((q) => Math.max(q.o0, q.o1) - a.hw)));
  assert.ok(Math.min(...gaps) > 0.5 && deep < 1.2, `the gaps run from ${Math.min(...gaps).toFixed(2)} to ${deep.toFixed(2)} m`);
});

test('no cell lies on a carriageway or pavement, in a plaza, inside another lot, or over another apron', () => {
  const pts = (q) => { const m = [0, 1].map((k) => (q.a0[k] + q.a1[k] + q.b0[k] + q.b1[k]) / 4), inset = (p) => [m[0] + (p[0] - m[0]) * 0.9, m[1] + (p[1] - m[1]) * 0.9]; return [m, inset(q.a0), inset(q.a1), inset(q.b0), inset(q.b1)]; };
  const feet = new Map(plan.lots.map((l) => [l.id, footprint(l)]));
  const bad = [];
  for (const ap of aprons) for (const q of ap.cells) for (const [x, z] of pts(q)) {
    for (const st of plan.streets) {
      if (x < st._bb[0] - st.width || x > st._bb[2] + st.width || z < st._bb[1] - st.width || z > st._bb[3] + st.width) continue;
      const d = project(st._d.pts, st._d.cum, x, z).d, lim = st.id === ap.street ? st.width / 2 - 0.03 : st.width / 2 + 0.03;
      if (d < lim) bad.push(`${ap.lot}: ${d.toFixed(2)} m from ${st.id}`);
    }
    for (const pl of plan.plazas) if (pointInPoly(pl.poly, x, z)) bad.push(`${ap.lot}: in plaza ${pl.id}`);
    for (const [id, fp] of feet) if (id !== ap.lot && pointInPoly(fp, x, z)) bad.push(`${ap.lot}: inside ${id}`);
    for (const o of aprons) if (o.lot !== ap.lot && inAny(o, x, z)) bad.push(`${ap.lot}: over the apron of ${o.lot}`);
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} overlaps`);
});

// ---------------------------------------------------------------------------------------------------- the mesh
/** Up-facing and vertical triangles of every mesh with material `mat`: { y: height at (x, z) is found by `top`, n: normal.y, p: corners }. */
function triangles(mat) {
  const T = ctx.THREE, out = [], a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), e1 = new T.Vector3(), e2 = new T.Vector3();
  ctx.scene.updateMatrixWorld(true);
  ctx.scene.traverse((o) => {
    if (!o.isMesh || o.material !== mat) return;
    const p = o.geometry.getAttribute('position'), uv = o.geometry.getAttribute('uv'), ix = o.geometry.index, n = ix ? ix.count : p.count;
    for (let i = 0; i + 2 < n; i += 3) {
      const [i0, i1, i2] = ix ? [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)] : [i, i + 1, i + 2];
      a.fromBufferAttribute(p, i0).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(p, i1).applyMatrix4(o.matrixWorld); c.fromBufferAttribute(p, i2).applyMatrix4(o.matrixWorld);
      e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2).normalize();
      out.push({ n: e1.toArray(), p: [a.toArray(), b.toArray(), c.toArray()], uv: [i0, i1, i2].map((k) => [uv.getX(k), uv.getY(k)]) });
    }
  });
  return out;
}
/** Index of the up-facing triangles of a material: at(x, z) = [{ y, uv }] for the distinct heights (5 mm apart or more) of the triangles that cover (x, z): more than one = two layers there. */
function surface(mat) {
  const grid = new Map(), K = 4, key = (i, j) => i * 4096 + j;
  for (const t of triangles(mat)) {
    if (t.n[1] < 0.5) continue;
    const xs = t.p.map((q) => q[0]), zs = t.p.map((q) => q[2]);
    for (let i = Math.floor(Math.min(...xs) / K); i <= Math.floor(Math.max(...xs) / K); i++) for (let j = Math.floor(Math.min(...zs) / K); j <= Math.floor(Math.max(...zs) / K); j++) { const k = key(i, j); (grid.get(k) ?? grid.set(k, []).get(k)).push(t); }
  }
  return (x, z) => {
    const out = [];
    for (const t of grid.get(key(Math.floor(x / K), Math.floor(z / K))) ?? []) {
      const [A, B, C] = t.p, d = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]);
      const u = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / d, v = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / d, w = 1 - u - v;
      if (u >= -1e-6 && v >= -1e-6 && w >= -1e-6) {                                        // a point on the diagonal of a quad is in both its triangles: one layer
        const y = u * A[1] + v * B[1] + w * C[1];
        if (!out.some((o) => Math.abs(o.y - y) < 0.005)) out.push({ y, uv: [0, 1].map((k) => u * t.uv[0][k] + v * t.uv[1][k] + w * t.uv[2][k]) });
      }
    }
    return out;
  };
}
const SLAB = ctx.mat('sidewalk_slab'), CONC = ctx.mat('street_concrete'), BARE = ctx.mat('concrete_bare');
const tops = { sidewalk_slab: surface(SLAB), street_concrete: surface(CONC) };

test('the built apron is one layer of paving face up, flush with the sidewalk (or the street, where there is none) at the same station, with its slab pattern running on', () => {
  const bad = []; let checked = 0, slab = 0;
  for (const ap of aprons) {
    const st = byId.get(ap.street), d = st._d, kind = st.sidewalk ? 'sidewalk_slab' : 'street_concrete', top = tops[kind];
    for (const q of ap.cells) {
      const m = [0, 1].map((k) => (q.a0[k] + q.a1[k] + q.b0[k] + q.b1[k]) / 4), h = top(m[0], m[1]);
      const s = (q.s0 + q.s1) / 2, pr = project(d.pts, d.cum, m[0], m[1]), n = [(m[0] - pr.x) / pr.d, (m[1] - pr.z) / pr.d];
      const inner = top(pr.x + n[0] * (ap.hw - 0.3), pr.z + n[1] * (ap.hw - 0.3));          // the sidewalk 30 cm inside its back edge (the street surface, where there is no sidewalk)
      checked++; if (st.sidewalk) slab++;
      if (h.length !== 1) { bad.push(`${ap.lot}: ${h.length} layers of ${kind} at ${m.map((v) => v.toFixed(1))}`); continue; }
      if (inner.length < 1) { bad.push(`${ap.lot}: no ${kind} inside the edge`); continue; }
      const level = Math.max(...inner.map((i) => i.y));
      if (Math.abs(h[0].y - level) > 0.02) bad.push(`${ap.lot}: apron at ${h[0].y.toFixed(3)}, pavement at ${level.toFixed(3)} (s ${s.toFixed(1)})`);
      const want = yDense(d, s) + (st.kind === 'road' ? 0.020 : st.kind === 'street' ? 0.016 : 0.012) + (st.sidewalk ? SIDEWALK.lift : 0);
      if (Math.abs(h[0].y - want) > 0.05) bad.push(`${ap.lot}: apron at ${h[0].y.toFixed(3)}, the street level plus its lift is ${want.toFixed(3)}`);
      // the texture runs on: u is the signed distance from the axis, v the arc length, as on the strips of the sidewalk
      const [u, v] = h[0].uv, [ui, vi] = inner[0].uv;
      if (Math.abs(u - ap.side * pr.d) > 0.05 || Math.abs(v - pr.s) > 0.6) bad.push(`${ap.lot}: apron uv ${u.toFixed(2)}, ${v.toFixed(2)} where the axis offset is ${(ap.side * pr.d).toFixed(2)} and s ${pr.s.toFixed(2)}`);
      if (Math.abs(ui - ap.side * (ap.hw - 0.3)) > 0.05) bad.push(`${ap.lot}: the pavement beside it has u ${ui.toFixed(2)}, not its offset ${(ap.side * (ap.hw - 0.3)).toFixed(2)}`);
    }
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} cells off`);
  assert.ok(checked > 150 && slab > 100, `${checked} cells checked, ${slab} beside a sidewalk`);
});

test('every loose end of an apron has a skirt that faces away from it and reaches below the ground (TEETH: with no skirt the end hangs over the earth)', () => {
  const tri = triangles(BARE).filter((t) => Math.abs(t.n[1]) < 0.05), bad = [];
  const near = (m, r) => tri.filter((t) => { const c = [0, 1, 2].map((k) => (t.p[0][k] + t.p[1][k] + t.p[2][k]) / 3); return Math.hypot(c[0] - m[0], c[2] - m[2]) < r && Math.abs(c[1] - m[1]) < 0.3; });
  let ends = 0;
  for (const ap of aprons) {
    const st = byId.get(ap.street), d = st._d, dy = (st.kind === 'road' ? 0.020 : st.kind === 'street' ? 0.016 : 0.012) + (st.sidewalk ? SIDEWALK.lift : 0);
    ap.cells.forEach((q, i) => {
      for (const [open, a, b, s] of [[i === 0 || ap.cells[i - 1].s1 !== q.s0, q.a0, q.b0, q.s0], [i === ap.cells.length - 1 || ap.cells[i + 1].s0 !== q.s1, q.a1, q.b1, q.s1]]) {
        if (!open) continue;
        ends++;
        const mid = [(a[0] + b[0]) / 2, yDense(d, s) + dy - APRON.skirt / 2, (a[1] + b[1]) / 2], cell = [0, 1].map((k) => (q.a0[k] + q.a1[k] + q.b0[k] + q.b1[k]) / 4);
        const hit = near(mid, 0.2).filter((t) => t.n[0] * (mid[0] - cell[0]) + t.n[2] * (mid[2] - cell[1]) > 0);
        if (hit.length < 1) bad.push(`${ap.lot}: no skirt facing away at ${mid.map((v) => v.toFixed(1))}`);
      }
    });
  }
  assert.deepEqual(bad.slice(0, 8), [], `${bad.length} ends without a skirt`);
  assert.ok(ends >= 2 * aprons.length, `${ends} loose ends checked for ${aprons.length} aprons`);
  assert.ok(APRON.skirt >= 0.3, `a skirt ${APRON.skirt} m deep: the earth beside an apron lies up to 0.26 m below its top`);
});
