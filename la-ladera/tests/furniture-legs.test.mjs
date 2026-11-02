// A chair is one piece, not a seat with four sticks hanging under it. Playtest: the yellow chair on the roof of L08 (chair_plastic, the one every terrace, balcony and
// patio sets beside its table_plastic) had four legs that stopped 3.5 cm under the seat and leant outward past its edge, so each leg floated beside the rim under the seat.
// This holds every chair, stool and table to one rule, in both of the ways the game draws it:
//   the stand-ins (js/interiors/standins.js: boxes, drawn when a model is missing), and
//   the shipped Blender models (assets/models/furniture and heroes: the library and the hero set that overrides it).
// A LEG is a slim, upright solid that stands on the floor. A leg is CARRIED when its top reaches the seat (or the tabletop) and its axis there is inside that slab's footprint (a leg that runs up
// through the seat as a back post counts too), or, for a table, when its axis runs into a part under the top that touches the top (an apron, a rim). A model's leg is a lathe with an open top
// end, often leaning, so it must run REACH up into the slab (its open end hidden there); a stand-in's leg is a box with exact faces, so touching the underside is enough.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Matrix4, Quaternion, Vector3 } from 'three';
import { parseGlb, MODELS } from '../tools/blender/furn_validate.mjs';
import { CATALOG } from '../js/interiors/catalog.js';
import { STANDINS } from '../js/interiors/standins.js';

const REACH = 0.003;                     // a model's leg runs at least this far up into the slab it carries (m)
const EDGE = 0.004;                      // and its axis stays at least this far inside the slab's footprint
const TOUCH = 0.0025;                    // two parts touch when their boxes come this close (a stand-in's faces are exact, a model's are rounded)

// ------------------------------------------------------------------------------------------------ solids and the rule
/** A solid = the corner points of one closed piece. */
function solid(points) {
  const s = { points };
  s.lo = [0, 1, 2].map((d) => Math.min(...points.map((p) => p[d]))); s.hi = [0, 1, 2].map((d) => Math.max(...points.map((p) => p[d])));
  return s;
}
const isLeg = (s) => s.lo[1] <= 0.02 && s.hi[1] - s.lo[1] >= 0.12 && s.hi[0] - s.lo[0] <= 0.14 && s.hi[2] - s.lo[2] <= 0.14;
const centre = (points) => [0, 1, 2].map((d) => (Math.min(...points.map((p) => p[d])) + Math.max(...points.map((p) => p[d]))) / 2);
/** The axis of a leg: the middle of its lowest ring to the middle of its top ring (a leg may lean, so the rings are not above each other). */
function axisOf(leg) {
  const foot = leg.points.filter((p) => p[1] <= leg.lo[1] + 0.004), top = leg.points.filter((p) => p[1] >= leg.hi[1] - 0.004);
  return { c0: centre(foot), c1: centre(top) };
}
const at = ({ c0, c1 }, y) => { const t = (y - c0[1]) / (c1[1] - c0[1]); return [c0[0] + (c1[0] - c0[0]) * t, y, c0[2] + (c1[2] - c0[2]) * t]; };
const inFootprint = (p, s, margin) => p[0] >= s.lo[0] + margin && p[0] <= s.hi[0] - margin && p[2] >= s.lo[2] + margin && p[2] <= s.hi[2] - margin;
const insideBox = (p, s, tol) => [0, 1, 2].every((d) => p[d] >= s.lo[d] - tol && p[d] <= s.hi[d] + tol);
const touching = (a, b) => [0, 1, 2].every((d) => Math.min(a.hi[d], b.hi[d]) - Math.max(a.lo[d], b.lo[d]) >= -TOUCH);
const area = (s) => (s.hi[0] - s.lo[0]) * (s.hi[2] - s.lo[2]);

/**
 * What is wrong with the legs of one piece (empty list: nothing). `y` = a height inside the slab the legs should carry (sh - 0.01 for a chair or stool, H - 0.02 for a table); `table` lets a leg
 * end in an apron, a rim or a column plate that touches the slab instead of in the slab itself; `reach` = how far up into the slab a leg must run (0: touching its underside is enough).
 */
function legProblems(solids, y, { table = false, reach = REACH } = {}) {
  const legs = solids.filter(isLeg), rest = solids.filter((s) => !legs.includes(s));
  const slab = rest.filter((s) => s.lo[1] <= y && s.hi[1] >= y).sort((a, b) => area(b) - area(a))[0];
  if (!legs.length) return ['no legs found'];
  if (!slab) return [`nothing at the seat/top height ${y.toFixed(3)} m`];
  const carried = new Set([slab]);
  if (table) for (let grown = true; grown;) { grown = false; for (const s of rest) if (!carried.has(s) && [...carried].some((c) => touching(c, s))) { carried.add(s); grown = true; } }
  const problems = [], enter = slab.lo[1] + reach;
  for (const leg of legs) {
    const axis = axisOf(leg), where = `leg at x ${axis.c1[0].toFixed(3)}, z ${axis.c1[2].toFixed(3)}`;
    if (table) {
      const top = leg.hi[1], hit = [...carried].some((s) => { for (let k = 0; k <= 12; k++) if (insideBox(at(axis, top - (0.06 * k) / 12), s, 0.001)) return true; return false; });
      if (!hit) problems.push(`${where} stops at ${top.toFixed(3)} m and its axis meets nothing under the top (the top starts at ${slab.lo[1].toFixed(3)} m)`);
    } else if (leg.hi[1] < enter - (reach ? 0 : TOUCH)) problems.push(`${where} stops ${(slab.lo[1] - leg.hi[1]).toFixed(3)} m under the seat (it must ${reach ? `run ${reach} m into it` : 'reach it'})`);
    else if (!inFootprint(at(axis, enter), slab, EDGE)) problems.push(`${where} is outside the seat's footprint where it meets it (${at(axis, enter).map((v) => v.toFixed(3)).slice(0, 3).join(', ')})`);
  }
  return problems;
}

// ------------------------------------------------------------------------------------------------ the rule itself
test('the rule: legs that stop short, leave the seat or float beside it are found; a carried chair has no problem', () => {
  const box = (x, y, z, w, h, d) => solid([-1, 1].flatMap((i) => [-1, 1].flatMap((j) => [0, 1].map((k) => [x + i * w / 2, y + k * h, z + j * d / 2]))));
  const seat = box(0, 0.415, 0, 0.44, 0.035, 0.46), chair = (leg) => [seat, ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => leg(sx, sz)))];
  const straight = (top, zOut = 0.19) => (sx, sz) => box(sx * 0.18, 0, sz * zOut, 0.03, top, 0.03);
  assert.deepEqual(legProblems(chair(straight(0.43)), 0.44), [], 'legs that run 15 mm up into the seat');
  assert.match(legProblems(chair(straight(0.38)), 0.44).join('\n'), /stops 0\.035 m under the seat/, 'legs that stop 3.5 cm short (the roof-terrace chair)');
  assert.match(legProblems(chair(straight(0.415)), 0.44).join('\n'), /stops 0\.000 m under the seat/, 'a model leg that only touches the underside');
  assert.deepEqual(legProblems(chair(straight(0.415)), 0.44, { reach: 0 }), [], 'a box leg that touches the underside is carried');
  assert.match(legProblems(chair(straight(0.38)), 0.44, { reach: 0 }).join('\n'), /stops 0\.035 m under the seat \(it must reach it\)/, 'but a box leg 3.5 cm short is not');
  assert.match(legProblems(chair(straight(0.43, 0.25)), 0.44).join('\n'), /outside the seat's footprint/, 'legs past the seat edge');
  assert.equal(legProblems(chair((sx, sz) => (sx > 0 && sz > 0 ? box(0.18, 0, 0.3, 0.03, 0.43, 0.03) : box(sx * 0.18, 0, sz * 0.19, 0.03, 0.43, 0.03))), 0.44).length, 1, 'one leg out of four');
  // a leg that leans: its foot is outside the seat's footprint and its top ring inside it (carried), or the other way round (it leaves the seat: not carried)
  const lean = (foot, top) => (sx, sz) => solid([[sx * foot, 0, sz * foot], [sx * foot + 0.03, 0, sz * foot], [sx * top, 0.43, sz * top], [sx * top + 0.03, 0.43, sz * top]]);
  assert.deepEqual(legProblems(chair(lean(0.2, 0.17)), 0.44), []);
  assert.match(legProblems(chair(lean(0.17, 0.215)), 0.44).join('\n'), /outside the seat's footprint/, 'legs that lean out past the seat edge');
  assert.deepEqual(legProblems([seat], 0.44), ['no legs found']);
  assert.match(legProblems(chair(straight(0.43)), 0.6).join('\n'), /nothing at the seat\/top height/);
  // a table: its legs may end in an apron that touches the top
  const table = (legTop) => [box(0, 0.695, 0, 0.85, 0.035, 0.85), box(0, 0.645, 0, 0.73, 0.05, 0.73), ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => box(sx * 0.355, 0, sz * 0.355, 0.07, legTop, 0.07)))];
  assert.deepEqual(legProblems(table(0.66), 0.71, { table: true }), []);
  assert.match(legProblems(table(0.6), 0.71, { table: true }).join('\n'), /axis meets nothing under the top/, 'table legs that end under the apron');
});

// ------------------------------------------------------------------------------------------------ the shipped models
/** The solids of one asset of a parsed GLB, in the asset-local frame (the runtime drops the root transform): triangles welded by position, one solid per connected piece. */
function modelSolids(glb, node) {
  const { json: g, accessor } = glb, roots = g.scenes[g.scene ?? 0].nodes, root = roots.find((i) => g.nodes[i].name === node);
  assert.ok(root !== undefined, `${glb.label}: no scene root '${node}'`);
  const matrixOf = (n) => (n.matrix ? new Matrix4().fromArray(n.matrix) : new Matrix4().compose(new Vector3(...(n.translation ?? [0, 0, 0])), new Quaternion(...(n.rotation ?? [0, 0, 0, 1])), new Vector3(...(n.scale ?? [1, 1, 1]))));
  const out = [], point = new Vector3();
  const visit = (ni, parent) => {
    const n = g.nodes[ni], m = parent.clone().multiply(matrixOf(n));
    if (n.mesh != null) for (const prim of g.meshes[n.mesh].primitives) {
      const pos = accessor(prim.attributes.POSITION).values, idx = prim.indices == null ? null : accessor(prim.indices).values, count = idx ? idx.length : pos.length / 3;
      const world = []; for (let i = 0; i < pos.length; i += 3) world.push(point.set(pos[i], pos[i + 1], pos[i + 2]).applyMatrix4(m).toArray());
      const first = new Map(), canon = world.map((p, i) => { const k = p.map((v) => Math.round(v * 2e4)).join(','); if (!first.has(k)) first.set(k, i); return first.get(k); });
      const parentOf = canon.map((_, i) => i), find = (x) => { while (parentOf[x] !== x) { parentOf[x] = parentOf[parentOf[x]]; x = parentOf[x]; } return x; };
      const tri = (i) => [0, 1, 2].map((k) => canon[idx ? idx[i + k] : i + k]);
      for (let i = 0; i < count; i += 3) { const [a, b, c] = tri(i); parentOf[find(b)] = find(a); parentOf[find(c)] = find(a); }
      const groups = new Map();
      for (let i = 0; i < count; i += 3) for (const v of tri(i)) { const r = find(v); if (!groups.has(r)) groups.set(r, new Set()); groups.get(r).add(v); }
      for (const set of groups.values()) out.push(solid([...set].map((v) => world[v])));
    }
    for (const c of n.children ?? []) visit(c, m);
  };
  if (g.nodes[root].mesh != null) visit(root, matrixOf(g.nodes[root]).invert()); else for (const c of g.nodes[root].children ?? []) visit(c, new Matrix4());
  return out;
}

const SETS = [['library', 'manifest.furniture.json'], ['heroes', 'manifest.heroes.json']].map(([name, file]) => {
  const manifest = JSON.parse(readFileSync(join(MODELS, file), 'utf8')), glbs = new Map(), where = new Map();
  for (const f of manifest.files) { glbs.set(f.glb, null); for (const key of Object.keys(f.assets)) where.set(key, f.glb); }
  return { name, where, glb: (path) => { if (!glbs.get(path)) glbs.set(path, parseGlb(readFileSync(join(MODELS, path)), path)); return glbs.get(path); } };
});
// the chairs and tables of a terrace, a balcony, a patio, a classroom and a bar: every one is held to the rule in the library, and in the heroes where there is a hero
// (table_foosball stood 4 cm above its legs. Not listed yet, because their legs still stop a little short: table_formica_4/6 by 1 cm and stool_plastic by 5 mm; chair_metal's legs butt against the seat's sides)
const MODELLED = ['chair_plastic', 'chair_plastic_arm', 'chair_wood', 'chair_wood_padded', 'table_plastic', 'table_wood_6', 'side_table', 'table_foosball'];

for (const key of MODELLED) {
  const c = CATALOG[key], table = c.arch === 'table', y = table ? c.size[1] - 0.02 : c.seat[0] - 0.01;
  for (const set of SETS) {
    const path = set.where.get(key); if (!path) continue;
    test(`${set.name} model ${key}: every leg is carried by the ${table ? 'top' : 'seat'}`, () => {
      const solids = modelSolids(set.glb(path), key);
      assert.deepEqual(legProblems(solids, y, { table }), [], `${path} :: ${key}`);
    });
  }
}
test('the hero set and the library both model the chair of the roof terrace (the test above is not vacuous)', () => {
  assert.ok(SETS.every((s) => s.where.has('chair_plastic') && s.where.has('table_plastic')), 'chair_plastic and table_plastic are in the library and the hero set');
  assert.equal(modelSolids(SETS[1].glb(SETS[1].where.get('chair_plastic')), 'chair_plastic').filter(isLeg).length, 4);
  assert.equal(modelSolids(SETS[0].glb(SETS[0].where.get('chair_plastic_arm')), 'chair_plastic_arm').filter(isLeg).length, 4);
});

// ------------------------------------------------------------------------------------------------ the stand-ins
/** A pen that only records the boxes (js/interiors/standins.js draws in item-local space: x right, y up from the base, z front). */
function drawn(key) {
  const c = CATALOG[key], boxes = [];
  const add = (lx, ly, lz, sx, sy, sz, ry = 0) => { if (sx > 0 && sy > 0 && sz > 0 && !ry) boxes.push(solid([-1, 1].flatMap((i) => [-1, 1].flatMap((j) => [0, 1].map((k) => [lx + i * sx / 2, ly + k * sy, lz + j * sz / 2]))))); };
  const P = {
    W: c.size[0], H: c.size[1], D: c.size[2], id: 'legs-test', r: { id: 'legs-test', name: key, kind: 'floor', flags: {} }, c,
    box: (mat, lx, ly, lz, sx, sy, sz, col, skip, ry) => add(lx, ly, lz, sx, sy, sz, ry), flat: (lx, ly, lz, sx, sy, sz, col, skip, ry) => add(lx, ly, lz, sx, sy, sz, ry),
    cyl: (mat, lx, ly, lz, rad, h) => { if (rad > 0 && h > 0) add(lx, ly, lz, 2 * rad, h, 2 * rad); },
    hcyl() {}, sphere() {}, model() {}, discZ() {}, quadUV() {}, mark: () => new Map(), since: () => [],
  };
  STANDINS[c.arch](P, c, undefined, P.r);
  return boxes;
}
const standinKeys = Object.keys(CATALOG).filter((k) => ['chair', 'stool', 'table'].includes(CATALOG[k].arch) && drawn(k).some(isLeg));
test('the stand-ins: the chairs, stools and tables that stand on legs are found (the loop below is not vacuous)', () => {
  for (const key of ['chair_plastic', 'chair_wood', 'chair_metal', 'stool_wood', 'table_plastic', 'table_formica_4', 'side_table', 'table_pingpong', 'table_foosball']) assert.ok(standinKeys.includes(key), `${key} has legs in its stand-in`);
});
for (const key of standinKeys) {
  const c = CATALOG[key], table = c.arch === 'table', y = table ? c.size[1] - 0.02 : c.seat[0] - 0.01;
  test(`stand-in ${key}: every leg runs into the ${table ? 'top' : 'seat'}`, () => assert.deepEqual(legProblems(drawn(key), y, { table, reach: 0 }), [], key));
}
