// A retaining box stops at a building's outline (R1-203, js/world/walls.js quadOutside / clipOutside): a rough-stone face, a concrete coping and a strip of earth ran on through bathroom L23.f0.r5 and 18 other rooms
// in 10 buildings (37 triangles, no collider), because the ramp of a box reaches into a neighbouring lot where two structures stand close and the stretch was drawn whole.
// What it guards: the clip keeps exactly the part of a quad outside a footprint (areas, orientation, no piece inside, nothing touched is redrawn differently), and no triangle of the real barrio's retaining walls lies in
// a room's clear volume. Each check that can go vacuous has a TEETH line: the same measure on a build without the clip finds the intruders.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-walls-lots.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quadOut } from '../js/world/mk.js';
import { footprint, pointInPoly } from '../js/world/geom.js';
import { clipOutside, quadOutside, findWallRuns, findCorners, buildRetaining } from '../js/world/walls.js';
import { makePlan } from './world-lib.mjs';
import { buildData } from './headless.mjs';

const FP = footprint({ x: 0.4, z: -0.2, w: 4, d: 3, rotY: 0.4 }, 0);                       // a lot, turned
const area3 = (pc) => {                                                                    // the area of a planar 3D polygon: half the length of its Newell vector
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pc.length; i++) { const a = pc[i], c = pc[(i + 1) % pc.length]; nx += (a[1] - c[1]) * (a[2] + c[2]); ny += (a[2] - c[2]) * (a[0] + c[0]); nz += (a[0] - c[0]) * (a[1] + c[1]); }
  return Math.hypot(nx, ny, nz) / 2;
};
const centroid = (pc) => [0, 1, 2].map((k) => pc.reduce((s, v) => s + v[k], 0) / pc.length);
const recorder = () => { const calls = []; return { calls, quad: (...a) => calls.push(['quad', ...a]), tri: (...a) => calls.push(['tri', ...a]) }; };

test('a vertical face through a footprint is cut at the outline: what is left is the face minus the chord, none of it inside', () => {
  const face = [[-6, 0, 0.3], [6, 0, 0.3], [6, 2, 0.3], [-6, 2, 0.3]];
  let chord = 0; const N = 24000;
  for (let i = 0; i < N; i++) { const x = -6 + (12 * (i + 0.5)) / N; if (pointInPoly(FP, x, 0.3)) chord += 12 / N; }
  assert.ok(chord > 2.5 && chord < 5, `TEETH: the line runs ${chord.toFixed(2)} m through the footprint`);
  const pieces = clipOutside(face, FP);
  assert.ok(pieces.length >= 2, 'the face is cut in at least two: the stretch before the building and the stretch after');
  assert.ok(Math.abs(pieces.reduce((s, p) => s + area3(p), 0) - 2 * (12 - chord)) < 0.01, `area ${pieces.map(area3)} vs ${2 * (12 - chord)}`);
  for (const p of pieces) { const [cx, , cz] = centroid(p); assert.ok(!pointInPoly(FP, cx, cz), 'a piece lies inside the footprint'); }
  for (const p of pieces) for (const v of p) assert.ok([0, 2].includes(v[1]) && Math.abs(v[2] - 0.3) < 1e-9, 'the cut corners keep the face\'s own height and line');
});

test('a cap across a corner of the footprint keeps the area outside it, in convex pieces that tile it', () => {
  const cap = [[-3, 1, -0.5], [3, 1, -0.5], [3, 1, 2.5], [-3, 1, 2.5]];                   // 6 x 3 m, over the footprint's corner
  let inside = 0; const N = 700, dx = 6 / N, dz = 3 / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (pointInPoly(FP, -3 + (i + 0.5) * dx, -0.5 + (j + 0.5) * dz)) inside += dx * dz;
  assert.ok(inside > 2 && inside < 16, `TEETH: ${inside.toFixed(2)} m2 of the quad is inside the footprint`);
  const pieces = clipOutside(cap, FP);
  assert.ok(pieces.length >= 1);
  assert.ok(Math.abs(pieces.reduce((s, p) => s + area3(p), 0) - (18 - inside)) < 0.06, `outside ${pieces.map(area3)} vs ${18 - inside}`);
  for (const p of pieces) { const [cx, , cz] = centroid(p); assert.ok(!pointInPoly(FP, cx, cz), 'a piece lies inside the footprint'); assert.ok(p.every((v) => v[1] === 1), 'the cap stays level'); }
});

test('a quad outside the footprint is returned as it came; one inside it is dropped, one just inside its outline too and one just outside it is kept whole', () => {
  const far = [[10, 0, 10], [12, 0, 10], [12, 2, 10], [10, 2, 10]];
  const out = clipOutside(far, FP);
  assert.equal(out.length, 1); assert.equal(out[0], far, 'the same polygon, not a copy');
  assert.equal(clipOutside([[0.4, 0, -0.2], [0.8, 0, -0.2], [0.8, 2, -0.2], [0.4, 2, -0.2]], FP).length, 0, 'a face wholly inside is dropped');
  const c = FP[0], d = FP[1], ex = d[0] - c[0], ez = d[1] - c[1], l = Math.hypot(ex, ez), nx = -ez / l, nz = ex / l;   // one edge of the footprint and its normal (which way is out depends on the winding)
  const mid = [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2], toward = pointInPoly(FP, mid[0] + nx * 0.05, mid[1] + nz * 0.05) ? 1 : -1;
  const along = (off) => [[c[0] + nx * off, 0, c[1] + nz * off], [d[0] + nx * off, 0, d[1] + nz * off], [d[0] + nx * off, 2, d[1] + nz * off], [c[0] + nx * off, 2, c[1] + nz * off]];
  const skin = (off) => clipOutside(along(toward * off), FP).reduce((s, p) => s + area3(p), 0);                // off > 0: that far INSIDE the outline
  assert.ok(skin(0.02) < 1e-6, 'a face 2 cm inside the outline is dropped');
  assert.ok(Math.abs(skin(-0.02) - 2 * l) < 1e-6, `a face 2 cm outside it is kept whole (${skin(-0.02)} of ${2 * l})`);
});

test('quadOutside: a quad no footprint touches goes to quadOut untouched; a cut one is a fan of triangles facing away from the centre, covering what is outside', () => {
  const draw = quadOutside([FP]);
  const far = [[10, 0, 10], [12, 0, 10], [12, 2, 10], [10, 2, 10]], ctr = [11, 1, 12];
  const a = recorder(), b = recorder();
  draw(a, 'stone_wall', ...far, ctr, { col: [1, 1, 1] }); quadOut(b, 'stone_wall', ...far, ctr, { col: [1, 1, 1] });
  assert.deepEqual(a.calls, b.calls, 'an untouched quad is drawn exactly as before');
  assert.equal(draw.cut, 0);
  const face = [[-6, 0, 0.3], [6, 0, 0.3], [6, 2, 0.3], [-6, 2, 0.3]], behind = [0, 1, 5];                // the centre is on the +z side: the face looks toward -z
  const r = recorder(); draw(r, 'stone_wall', ...face, behind, { col: [1, 1, 1] });
  assert.equal(draw.cut, 1);
  assert.ok(r.calls.length >= 4 && r.calls.every((c) => c[0] === 'tri'), `${r.calls.length} calls, ${new Set(r.calls.map((c) => c[0]))}`);
  let tot = 0;
  for (const [, , p0, p1, p2] of r.calls) {
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    tot += Math.hypot(...n) / 2;
    const m = centroid([p0, p1, p2]);
    assert.ok(n[0] * (m[0] - behind[0]) + n[1] * (m[1] - behind[1]) + n[2] * (m[2] - behind[2]) > 0, 'a triangle faces the centre');
  }
  const pieces = clipOutside(face, FP);
  assert.ok(Math.abs(tot - pieces.reduce((s, p) => s + area3(p), 0)) < 1e-6, `${tot} vs ${pieces.map(area3)}`);
  const uv = recorder(), strip = [[-3, 1, -0.5], [3, 1, -0.5], [3, 1, 2.5], [-3, 1, 2.5]];
  draw(uv, 'ground_dirt', ...strip, [0, -4, 1], { col: [1, 1, 1], uv: [0, 0, 0, 0, 0, 0, 0, 0] });
  assert.ok(uv.calls.length >= 2 && uv.calls.every((c) => c[0] === 'tri' && c[5].uv.length === 6 && c[5].uv[0] === c[2][0] && c[5].uv[1] === c[2][2]), 'an explicit uv is rebuilt per corner from the plan position');
});

/** The triangles of the retaining-wall group that lie in some room's clear volume (the room's plan rect shrunk 5 cm, its floor + 5 cm up to its ceiling - 5 cm). */
function intruders(ctx, buildings) {
  const g = ctx.batch.groups.get('world.walls'), rooms = [], by = {}, hit = new Set(); let n = 0;
  for (const bp of buildings) {
    const L = bp.lot, c = Math.cos(L.rotY), s = Math.sin(L.rotY);
    for (const r of bp.rooms) if (!r.outdoor) rooms.push({ id: r.id, L, c, s, rect: r.rect, y0: L.y + r.y + 0.05, y1: L.y + r.y + r.h - 0.05 });
  }
  for (const m of g.meshes) {
    const p = m.geometry.attributes.position, ix = m.geometry.index.array, key = m.userData.matKey;
    for (let i = 0; i < ix.length; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let j = 0; j < 3; j++) { const k = ix[i + j]; cx += p.getX(k) / 3; cy += p.getY(k) / 3; cz += p.getZ(k) / 3; }
      for (const r of rooms) {
        if (cy <= r.y0 || cy >= r.y1) continue;
        const dx = cx - r.L.x, dz = cz - r.L.z, lx = dx * r.c - dz * r.s, lz = dx * r.s + dz * r.c;
        if (lx > r.rect.x0 + 0.05 && lx < r.rect.x1 - 0.05 && lz > r.rect.z0 + 0.05 && lz < r.rect.z1 - 0.05) { n++; by[key] = (by[key] ?? 0) + 1; hit.add(r.id); break; }
      }
    }
  }
  return { n, by, rooms: [...hit] };
}

test('no retaining-wall triangle of the barrio lies inside a room (R1-203; TEETH: the same build without the clip has the intruders, L23.f0.r5 among them)', async () => {
  const { ctx, buildings } = await buildData({ world: true, furnish: false, colliders: false, clutter: false, vehicles: false });
  const W = ctx.world.walls;
  assert.ok(W.clipped > 20, `${W.clipped} quads were cut or dropped at a footprint: the clip fires`);
  const got = intruders(ctx, buildings);
  assert.deepEqual(got, { n: 0, by: {}, rooms: [] }, `${got.n} wall triangles inside rooms ${got.rooms.slice(0, 8)}`);
  // the same plan, the same runs, no lots to clip against: the walls as they were drawn
  const { ctx: raw, plan } = makePlan(); raw.physics.setTerrain(plan.heightAt);
  const runs = findWallRuns(plan);
  buildRetaining(raw, { ...plan, lots: [] }, runs, findCorners(runs));
  const was = intruders(raw, buildings);
  assert.ok(was.n > 20 && was.rooms.includes('L23.f0.r5'), `TEETH: unclipped, ${was.n} triangles in ${was.rooms.length} rooms: ${was.rooms.slice(0, 6)}`);
  assert.ok(was.by.stone_wall > 0 && was.by.concrete_bare > 0, `TEETH: the face and the coping both run through: ${JSON.stringify(was.by)}`);
});
