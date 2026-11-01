// The far kit's houses look unlike one another (R1-D20, round 5: "clusters of the same red box houses"): each house is drawn in its own paint, height and step off the row, while the plan
// itself (Codex's vista-plan.js: layout, piece ids) is untouched. Each check that can go vacuous has a TEETH next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-vista-look.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { planVista } from '../js/world/vista-plan.js';
import { vistaSites } from '../js/world/vista.js';
import { clearLandmarks } from '../js/world/vista-kit.js';
import { kitLook, houseLooks, paintTint, hash32, PAINTS } from '../js/world/vista-look.js';
import { makePlan } from './world-lib.mjs';

const data = JSON.parse(await readFile(new URL('../assets/models/vista/placement.json', import.meta.url), 'utf8'));
const { plan } = makePlan(), sites = vistaSites(plan), planned = clearLandmarks(planVista(plan, data), [sites.church, ...sites.towers]);
const meta = new Map(data.pieces.map((p) => [p.id, p]));
// the kit's own beige: what a GLB's vertices average to when the paint is not told (the real averages are 0.1 to 0.45)
const baseOf = (p) => (/^brick/.test(p.key) ? [0.18, 0.08, 0.05] : p.category === 'roof' ? [0.25, 0.25, 0.24] : [0.34, 0.29, 0.2]);
const look = kitLook(planned, baseOf, plan.seed);
const chroma = (c) => Math.log(Math.max(0.02, c[2]) / Math.max(0.02, c[0]));       // blue over red: 0 for any grey, a spread for a paint box
const spread = (values) => { const m = values.reduce((a, b) => a + b, 0) / values.length; return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length); };

test('the plan is exactly the planner\'s: the same layout and the same piece ids as before this file (the look is applied when the pieces are drawn, never to the plan)', () => {
  const key = (p) => `${p.id}@${p.x.toFixed(1)},${p.z.toFixed(1)}`;
  const digest = hash32(planned.pieces.map(key).join('|'));
  assert.equal(planned.pieces.length, 2102, 'pieces');
  assert.equal(planned.houses.length, 540, 'houses');
  assert.equal(planned.clusters.length, 108, 'terraces');
  assert.equal(digest, 4002077181, `layout and ids digest ${digest}`);
  assert.equal(look.length, planned.pieces.length, 'a look for every piece, in order');
});

test('the same seed paints the same houses, another seed paints them differently (TEETH: the digest moves with the seed)', () => {
  const again = kitLook(planned, baseOf, plan.seed), other = kitLook(planned, baseOf, plan.seed + 1);
  assert.deepEqual(again, look);
  assert.notDeepEqual(other.map((l) => l.color), look.map((l) => l.color), 'a different seed is a different paint box');
  const a = houseLooks(planned, plan.seed), b = houseLooks(planned, plan.seed + 1);                 // the houses' own paint, not the walls and stairs (which take the seed too)
  const changed = [...a].filter(([id, L]) => L.paint.name !== b.get(id).paint.name).length;
  assert.ok(changed > 0.4 * a.size, `${changed} of ${a.size} houses are painted another colour by another seed`);
});

test('houses are painted in many colours: the spread of hue over the facades is wide (TEETH: the planner\'s own grey shade has none)', () => {
  const facades = planned.pieces.map((p, i) => [p, look[i]]).filter(([p]) => p.category === 'facade' && !/^brick/.test(p.key));
  const painted = spread(facades.map(([, l]) => chroma(l.color))), plain = spread(facades.map(([p]) => chroma([p.shade, p.shade, p.shade])));
  assert.ok(plain < 1e-9, `the planner's shade is grey (${plain})`);
  assert.ok(painted > 0.35, `hue spread ${painted.toFixed(2)}`);
  const names = new Set([...houseLooks(planned, plan.seed).values()].map((l) => l.paint.name));
  assert.ok(names.size >= PAINTS.length - 1, `${names.size} of ${PAINTS.length} paints are on a house of the plan`);
  const east = planned.clusters.filter((c) => c.region === 'east'), byHouse = houseLooks(planned, plan.seed);
  const inEast = new Set(east.flatMap((c) => c.houses.map((h) => byHouse.get(h).paint.name)));
  assert.ok(inEast.size >= 8, `the east hill alone shows ${inEast.size} paints`);
});

test('every floor of a house takes the house\'s paint: the ground floor and the one above it are the same colour (a colour is the multiplier that reaches the target, not a fixed number)', () => {
  const byHouse = new Map();
  planned.pieces.forEach((p, i) => { if (p.category === 'facade' && !/^brick/.test(p.key)) (byHouse.get(p.house) ?? byHouse.set(p.house, []).get(p.house)).push([p, look[i]]); });
  let checked = 0;
  for (const [id, list] of byHouse) {
    const L = houseLooks(planned, plan.seed).get(id);
    if (!L.paint.c || list.length < 2) continue;
    const reached = list.map(([p, l]) => baseOf(p).map((b, k) => b * l.color[k] / p.shade));
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(reached[0][k] - reached[1][k]) < 0.04, `${id}: channel ${k} ${reached[0][k].toFixed(3)} vs ${reached[1][k].toFixed(3)}`);
    checked++;
  }
  assert.ok(checked >= 40, `${checked} painted houses with two plaster floors were compared`);
  assert.deepEqual(paintTint([0.3, 0.3, 0.3], [0.3, 0.3, 0.3]).map((v) => +v.toFixed(3)), [1, 1, 1], 'the paint a piece already wears changes nothing');
  assert.ok(paintTint([0.02, 0.02, 0.02], [0.9, 0.9, 0.9]).every((v) => v <= 3.2 * 0.9 + 0.1 + 1e-9), 'a very dark base is not blown out by a divide');
});

test('houses stand at different heights, and nothing of a house comes apart: the roof still sits on the top floor, the stair and the walls keep their ground', () => {
  const sy = planned.pieces.map((p, i) => [p, look[i]]).filter(([p]) => p.category === 'facade').map(([, l]) => l.sy);
  assert.ok(Math.min(...sy) < 0.92 && Math.max(...sy) > 1.08 && Math.min(...sy) >= 0.87 && Math.max(...sy) <= 1.15, `facade scale ${Math.min(...sy).toFixed(2)}..${Math.max(...sy).toFixed(2)}`);
  const houseOf = new Map(planned.houses.map((h) => [h.id, h]));
  const tops = new Map(), roofs = new Map();
  planned.pieces.forEach((p, i) => {
    const l = look[i];
    if (p.category === 'facade') { const m = meta.get(p.key), t = [p.y + m.stack.height * p.scale[1], l.y + m.stack.height * p.scale[1] * l.sy]; if (!tops.has(p.house) || tops.get(p.house)[0] < t[0]) tops.set(p.house, t); }
    if (p.category === 'roof') roofs.set(p.house, [p.y, l.y]);
  });
  let worst = 0, n = 0;
  for (const [id, [oldTop, newTop]] of tops) {
    const [oldRoof, newRoof] = roofs.get(id), was = Math.abs(oldRoof - oldTop), now = Math.abs(newRoof - newTop);
    worst = Math.max(worst, now - was * 1.15); n++;
    assert.ok(now <= was * 1.15 + 0.02, `${id}: the roof was ${was.toFixed(3)} m from the top floor and is ${now.toFixed(3)} m`);
  }
  assert.ok(n >= 500, `${n} houses compared`);
  planned.pieces.forEach((p, i) => {
    if (p.category === 'retaining') assert.equal(look[i].y, p.y, `${p.id}: a retaining wall keeps its own base`);
    if (p.category === 'stair') assert.deepEqual([look[i].y, look[i].dx, look[i].dz, look[i].sy], [p.y, 0, 0, 1], `${p.id}: a stair stays where it is`);
    if (!houseOf.has(p.house)) return;
    assert.ok(Math.hypot(look[i].dx, look[i].dz) <= 0.34 + 1e-9, `${p.id}: a house steps at most a third of a metre`);
  });
  assert.ok(planned.pieces.some((p, i) => p.category === 'roof' && look[i].dry === Math.PI) && planned.pieces.some((p, i) => p.category === 'roof' && look[i].dry === 0), 'some roofs turn, some do not');
  void worst;
});

test('all the pieces of one house step together, so a party wall is never opened (the same step for the floors, the roof, the balcony and the walls)', () => {
  const step = new Map();
  planned.pieces.forEach((p, i) => {
    if (!p.house) return;
    const s = [look[i].dx.toFixed(4), look[i].dz.toFixed(4)].join(',');
    if (!step.has(p.house)) step.set(p.house, s); else assert.equal(s, step.get(p.house), `${p.id}`);
  });
  assert.ok(step.size >= 500);
  assert.ok(new Set(step.values()).size >= 300, 'and the houses do not all step alike');
});
