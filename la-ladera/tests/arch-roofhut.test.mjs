// A2: the stair-head hut on a walkable roof (the caseta, roof.js): four thin walls round the stair head, a metal door onto the terrace, a slab over it. It must be a CLOSED box:
// the outer face of every wall runs corner to corner and from the roof to the slab, round the door frame on both sides, and nothing of the frame hangs past the corner.
//  * Arthur's playtest, L08 Droguería La Salud: "the hut's wall to the LEFT of the door frame does not meet the door frame" (the beige stair and a barred window show through, the corner shows
//    a sliver). A caseta's north and south walls take the corners (their runs reach the hut's outer corners); its west and east walls stand between them (their runs are the stair's own
//    length). shell.js `outerFace` drew the outer face of all four over that run, so the west and east faces stopped one wall thickness (0.14 m) short of each corner: a slot 2.45 m
//    high through the end of the north or south wall, at all four corners of every hut. The landing is the end of the stair, so a door in the west or east wall stands at the end of its
//    wall: its frame was the last thing on the face, and the wall just past it was the slot.
//  * The same check over every other door, shutter and arch of the barrio's and the test lots' exterior walls, and every window (a one-off scan, 2,900 openings: none was short of its
//    corner), is not repeated here: the plan gives each of those walls the full width.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-roofhut.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, localTris, coveredBy } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { OUT } from '../js/arch/mb.js';
import { CASETA_H } from '../js/arch/roof.js';

const real = await buildData({ furnish: false });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);

/** Every hut of the barrio and of the test lots, with its building's triangles in building-local coordinates. */
const HUTS = [];
for (const [tag, ctx, bps] of [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]]) {
  for (const bp of bps) {
    const cas = bp.shell.roofLayer?.caseta;
    if (cas) HUTS.push({ tag, ctx, bp, cas, S: bp.shell, tris: localTris(ctx, bp), yk: bp.shell.F * bp.shell.fh });
  }
}

/** The four outer faces of a hut: the plane of each, which way it looks, its run from corner to corner of the hut (`cas.outer`), and the triangles that lie in it. */
function outerFaces({ cas, tris }) {
  const q = cas.outer;
  return cas.walls.map((w) => {
    const s = OUT[w.side], plane = w.at + s * w.t / 2, ip = w.dir === 'x' ? 2 : 0, [lo, hi] = w.dir === 'x' ? [q.x0, q.x1] : [q.z0, q.z1];
    return { w, s, plane, lo, hi, sub: tris.filter(({ v }) => v.every((p) => Math.abs(p[ip] - plane) < 2e-3)) };
  });
}
const inHole = (w, yk, u, y) => w.openings.some((o) => u > o.u0 - 1e-6 && u < o.u1 + 1e-6 && y > yk + o.y0 - 1e-6 && y < yk + o.y1 + 1e-6);
/**
 * The runs [from, to] of u in [a, b] where the outer face `f` is missing, at any of the heights `ys` over the roof (openings excepted), sampled every centimetre. The last millimetre before `b` is
 * not sampled: the triangles' positions are float32 in world space, so a face's last edge can stand a micron short of the corner it was built to reach.
 */
function gaps(f, yk, a, b, ys) {
  const runs = [];
  let run = null;
  for (let u = a + 0.005; u < b - 0.001; u += 0.01) {
    const missing = ys.some((y) => !inHole(f.w, yk, u, yk + y) && !coveredBy(f.sub, f.w.dir, f.plane, f.s, null, u, yk + y));
    if (missing) { if (run) run[1] = u; else runs.push(run = [u, u]); } else run = null;
  }
  return runs;
}
const show = (runs) => runs.map(([a, b]) => `${a.toFixed(2)}..${b.toFixed(2)}`).join(', ');

test('a roof hut is closed: the outer face of each of its four walls runs from corner to corner and from the roof to the slab, but for the door', () => {
  const bad = [];
  for (const hut of HUTS) {
    for (const f of outerFaces(hut)) {
      const g = gaps(f, hut.yk, f.lo, f.hi, [0.05, 0.5, 1.0, 1.5, 2.0, 2.3, CASETA_H - 0.05]);
      if (g.length) bad.push(`${hut.tag} ${hut.bp.id} ${f.w.id} (${f.w.side}): no wall on the outside for u ${show(g)} of the face ${f.lo.toFixed(2)}..${f.hi.toFixed(2)}`);
    }
  }
  assert.ok(HUTS.length >= 60 && HUTS.some((h) => h.tag === 'real') && HUTS.some((h) => h.tag === 'test'), `${HUTS.length} roof huts to look at`);
  assert.deepEqual(bad, []);
});

test('a roof door has wall on both sides of its frame all the way to the hut\'s corner, and its casing stands on that wall (L08 Droguería La Salud)', () => {
  const bad = [], sides = new Map();
  let doors = 0;
  for (const hut of HUTS) {
    const { tag, bp, tris, yk } = hut, faces = outerFaces(hut);
    for (const d of bp.doors.filter((q) => q.roof)) {
      const f = faces.find((q) => q.w.openings.some((o) => o.ref === d.id)), name = `${tag} ${bp.id} ${d.id}`;
      if (!f) { bad.push(`${name}: the roof door is in no wall of the hut`); continue; }
      const o = f.w.openings.find((q) => q.ref === d.id), ys = [0.05, 0.9, o.y1 - 0.05, o.y1 + 0.05, CASETA_H - 0.05];
      doors++; sides.set(f.w.side, (sides.get(f.w.side) ?? 0) + 1);
      for (const [a, b, where] of [[o.u1, f.hi, 'beyond the high-u jamb'], [f.lo, o.u0, 'before the low-u jamb']]) {
        const g = gaps(f, yk, a, b, ys);
        if (g.length) bad.push(`${name} (${f.w.side} wall, door u ${o.u0.toFixed(2)}..${o.u1.toFixed(2)}): no wall ${where} for u ${show(g)} (the corner is at ${(a === o.u1 ? f.hi : f.lo).toFixed(2)})`);
      }
      // the casing: the 16 mm bands of frame_paint that stand on the outer face round the door (shellwin.js `buildDoorFrames`); none may reach past the corner of the hut
      const proud = tris.filter(({ k, v }) => k === 'frame_paint' && v.every((p) => {
        const off = (f.w.dir === 'x' ? p[2] : p[0]) - f.plane, u = f.w.dir === 'x' ? p[0] : p[2];
        return off * f.s > 0.005 && off * f.s < 0.03 && u > o.u0 - 0.3 && u < o.u1 + 0.3 && p[1] > yk - 0.01 && p[1] < yk + o.y1 + 0.15;
      }));
      const us = proud.flatMap(({ v }) => v.map((p) => (f.w.dir === 'x' ? p[0] : p[2])));
      if (!proud.length) bad.push(`${name}: no casing on the outside of the door`);
      else if (Math.min(...us) < f.lo - 1e-3 || Math.max(...us) > f.hi + 1e-3) bad.push(`${name}: the casing runs u ${Math.min(...us).toFixed(2)}..${Math.max(...us).toFixed(2)}, past the hut's corners ${f.lo.toFixed(2)}..${f.hi.toFixed(2)}`);
    }
  }
  assert.ok(doors >= 60, `${doors} roof doors to look at`);
  assert.ok(sides.get('east') >= 10 && sides.get('west') >= 10 && (sides.get('north') ?? 0) + (sides.get('south') ?? 0) >= 5, `doors in the huts' walls: ${[...sides].map(([k, n]) => `${k} ${n}`).join(', ')}`);
  assert.deepEqual(bad, []);
});
