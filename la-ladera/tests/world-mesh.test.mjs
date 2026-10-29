// The built world under node: terrain + retaining walls + every prop module (flora, poles, vehicles, dress, signs, hill, life) on plan P1.
// What it guards: a clean build, the discovery list (>= 24, the lead's gate), the closed perimeter, every nav edge walkable WITH the prop colliders,
// determinism, and a draw budget. Each check that can silently go vacuous has a TEETH test next to it.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-mesh.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { Physics } from '../js/core/physics.js';
import { generatePlan } from '../js/world/plan.js';
import { buildWorld } from '../js/world/terrain.js';
import { buildProps } from '../js/world/props.js';
import { HALF } from '../js/world/field.js';
import { footprint, pointInPoly } from '../js/world/geom.js';
import { lotWalls, walk, SEED } from './world-lib.mjs';

async function build(seed = SEED) {
  const ctx = createContext({ seed, headless: true });
  ctx.plan = generatePlan(ctx);
  ctx.physics.setTerrain(ctx.plan.heightAt);
  await buildWorld(ctx);
  await buildProps(ctx);
  ctx.batch.flushAll();
  return ctx;
}
const A = await build(), B = await build();
const W = A.world, plan = A.plan;

/** Real kernel over the plan: terrain, the lot blocks the shells will add, and every collider the world and the props built (optionally minus some ids). */
function physicsOf(ctx, { skip = [] } = {}) {
  const ph = new Physics();
  ph.setTerrain(ctx.plan.heightAt);
  ph.addWalls(lotWalls(ctx.plan));
  for (const w of ctx.physics.walls) if (!skip.includes(w.id)) ph.addWall(w);
  return ph;
}
const pushedBy = (ph, x, z, y = plan.heightAt(x, z)) => {
  const s = { x, y, z, vy: 0, onGround: true };
  ph.move(s, 0.001, 0, 1 / 60);
  return Math.hypot(s.x - x, s.z - z);
};

test('the build is clean: no module error, no unknown material, every group flushed', () => {
  assert.deepEqual(A.errors, []);
  assert.equal(A.matlib?.missing?.size ?? 0, 0, `unknown materials: ${[...(A.matlib?.missing ?? [])].join(', ')}`);
  for (const k of ['signs', 'hill', 'life', 'poles', 'flora', 'dress', 'vehicles', 'boundary']) assert.ok(k in (W.propTimes ?? {}), `props step ${k} ran`);
});

const REQUIRED = [
  'cruz', 'mirador', 'telescopio', 'telefono', 'virgen', 'escalinata', 'cancha', 'parada', 'faroles', 'almendros', 'capilla', 'eucaliptos', 'cables', 'carrito',   // the first 14
  'condor', 'fiesta', 'cerro', 'arco', 'placas', 'rayuela',                                                                                                  // signs.js
  'huerta', 'espantapajaros', 'cruzcamino',                                                                                                                   // hill.js
  'palomas', 'perro', 'guardian', 'gallinas', 'columpio', 'cometa', 'balon', 'soldadura',                                                                    // life.js
];

test('discoveries: at least 24 (the lead\'s gate), each with Spanish name, English line, valid kind and a spot inside the plot', () => {
  const items = [...A.discover.items.values()];
  assert.ok(items.length >= 24, `${items.length} discoveries registered, the gate is 24`);
  assert.equal(new Set(items.map((d) => d.id)).size, items.length, 'ids are unique');
  const KINDS = ['vista', 'mirador', 'shrine', 'object', 'story', 'nature', 'mural', 'hidden'], bad = [];
  for (const d of items) {
    if (!d.name || !d.en || d.name === d.en || d.en.length < 25) bad.push(`${d.id}: needs a Spanish name and an English line`);
    if (!KINDS.includes(d.kind)) bad.push(`${d.id}: kind ${d.kind}`);
    if (![d.x, d.y, d.z, d.radius].every(Number.isFinite) || Math.abs(d.x) > HALF - 1 || Math.abs(d.z) > HALF - 1) bad.push(`${d.id}: bad position ${d.x},${d.z}`);
    else if (Math.abs(d.y - plan.heightAt(d.x, d.z)) > 4.5) bad.push(`${d.id}: y ${d.y} is ${(d.y - plan.heightAt(d.x, d.z)).toFixed(1)} m from the ground`);
  }
  assert.deepEqual(bad, []);
  const have = new Set(items.map((d) => d.id));
  assert.deepEqual(REQUIRED.filter((id) => !have.has('w.' + id)), [], 'every planned discovery exists');
});

test('discoveries the world placed itself stand on free ground: outside every lot, not inside a collider', () => {
  const ph = physicsOf(A), fps = plan.lots.map((l) => footprint(l, 0.1)), bad = [];
  for (const d of W.extra) {
    const id = 'w.' + d.id, it = A.discover.items.get(id);
    if (!it) { bad.push(`${id} was not registered`); continue; }
    if (fps.some((f) => pointInPoly(f, it.x, it.z))) bad.push(`${id} lies inside a lot`);
    const p = pushedBy(ph, it.x, it.z, it.y);
    if (p > 0.2) bad.push(`${id} at ${it.x},${it.z} is pushed ${p.toFixed(2)} m by a collider`);
  }
  assert.deepEqual(bad, []);
});

test('TEETH: a point on a lot wall counts as "pushed by a collider"', () => {
  const lot = plan.lots[3], x = lot.x + (lot.d / 2) * Math.sin(lot.rotY), z = lot.z + (lot.d / 2) * Math.cos(lot.rotY);
  assert.ok(pushedBy(physicsOf(A), x, z, plan.heightAt(x, z) + 0.3) > 0.2);
});

test('the signage and the living props all got a place (counts, not just "no error")', () => {
  assert.equal(W.signs.murals, 3, 'three murals on straight tall walls');
  assert.equal(W.signs.boards, 2, 'both faces of the gate arch');
  assert.ok(W.signs.plaques >= 12, `${W.signs.plaques} of ${plan.streets.length} street plaques`);
  assert.equal(W.signs.hopscotch, 1);
  assert.ok(W.hill.beds === 4 && W.hill.rocks >= 40 && W.hill.cross === 1 && W.hill.lines >= 1, JSON.stringify(W.hill));
  assert.deepEqual(W.life, { pigeons: 7, crows: 3, dogs: 2, hens: 6, swing: 1, kite: 1, ball: 1, welding: 1 });
  assert.ok(W.huerta && W.scarecrow && W.roadCross && W.henPen && W.hopscotch, 'features recorded for the people / tests');
});

test('the murals hang on tall cut walls and the flora leaves those walls bare', () => {
  assert.equal(W.muralRuns.size, 3);
  for (const run of W.muralRuns) assert.ok(run.sign > 0 && run.tall >= 1.6 && /^(street|plaza)/.test(run.src), `mural wall ${run.src} tall ${run.tall}`);
});

test('determinism: two builds of one seed agree on vehicles, discoveries, cables and geometry; another seed differs', async () => {
  const sig = (c) => JSON.stringify([c.world.vehicleList, c.world.extra, c.world.cableSpans.length, c.world.poleList, c.batch.stats(), c.physics.stats()]);
  assert.equal(sig(A), sig(B));
  assert.ok(A.world.vehicleList.length > 40, 'a real vehicle list, not an empty one');
  const C = await build(SEED + 1);
  assert.notEqual(JSON.stringify(C.world.vehicleList), JSON.stringify(A.world.vehicleList), 'TEETH: a different seed must change the list');
});

test('perimeter: nobody walks out of the plot from any edge (TEETH: without the perimeter walls most walks do)', () => {
  const real = physicsOf(A), bare = physicsOf(A, { skip: ['perimeter'] });
  const out = (ph, x, z, dx, dz) => {
    const s = { x, y: plan.heightAt(x, z), z, vy: 0, onGround: true };
    for (let i = 0; i < 300; i++) ph.move(s, dx * 0.07, dz * 0.07, 1 / 60);
    return s;
  };
  let walks = 0, escapedBare = 0; const escaped = [];
  for (const [dx, dz] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    for (let k = 0; k < 24; k++) {
      const t = -88 + k * 7.65, x = dx ? (dx > 0 ? HALF - 3 : -HALF + 3) : t, z = dz ? (dz > 0 ? HALF - 3 : -HALF + 3) : t;
      walks++;
      const s = out(real, x, z, dx, dz);
      if (Math.abs(s.x) > HALF - 0.3 || Math.abs(s.z) > HALF - 0.3) escaped.push(`${x.toFixed(0)},${z.toFixed(0)} -> ${s.x.toFixed(1)},${s.z.toFixed(1)}`);
      const b = out(bare, x, z, dx, dz);
      if (Math.abs(b.x) > HALF + 0.5 || Math.abs(b.z) > HALF + 0.5) escapedBare++;
    }
  }
  assert.deepEqual(escaped, [], `${escaped.length} of ${walks} walks left the plot`);
  assert.ok(escapedBare >= walks * 0.5, `TEETH: only ${escapedBare} of ${walks} walks leave once the perimeter walls are removed`);
});

test('every nav edge can be walked both ways WITH the prop colliders (trees, poles, benches, dogs, hens, the swing tree, the huerta fence)', () => {
  const ph = physicsOf(A), byId = new Map(plan.nav.nodes.map((n) => [n.id, n])), bad = [];
  const props = A.physics.walls.filter((w) => w.id === 'prop').length;
  assert.ok(props > 300, `${props} prop colliders: the check would be vacuous without them`);
  for (const [ia, ib] of plan.nav.edges) {
    const a = byId.get(ia), b = byId.get(ib);
    for (const [p, q] of [[a, b], [b, a]]) { const r = walk(ph, p, q); if (!r.ok) bad.push(`${p.id}(${p.kind} ${p.x},${p.z}) -> ${q.id}(${q.kind} ${q.x},${q.z}): ${r.reason} at ${r.at}`); }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} blocked walks of ${plan.nav.edges.length * 2}`);
});

test('TEETH: a prop collider across a nav edge is found by the same walk', () => {
  const byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  const edge = plan.nav.edges.find(([a, b]) => byId.get(a).kind === 'street' && byId.get(b).kind === 'street' && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5);
  const a = byId.get(edge[0]), b = byId.get(edge[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ph = physicsOf(A);
  const nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz);
  ph.addWall({ x1: mx - (nx / l) * 3, z1: mz - (nz / l) * 3, x2: mx + (nx / l) * 3, z2: mz + (nz / l) * 3, t: 0.2, y0: -5, y1: 60, id: 'prop' });
  assert.equal(walk(ph, a, b).ok, false);
});

test('budget: the batched world stays inside the draw and triangle allowance', () => {
  const s = A.batch.stats();
  assert.ok(s.meshes < 1100, `${s.meshes} batched meshes (before the merge pass)`);
  assert.ok(s.tris < 900000, `${s.tris} triangles`);
});
