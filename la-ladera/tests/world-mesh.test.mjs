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
import { fitNav } from '../js/world/navfit.js';
import { settle } from '../js/world/discover.js';
import { makeKit } from '../js/world/kit.js';
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
  assert.ok(W.vehicles.busetas === 1 && W.vehicleList.some((v) => v.kind === 'buseta'), 'the buseta found a stretch of road (the bus-stop story needs one)');
  assert.ok(W.vehicles.cars >= 5 && W.vehicles.motos >= 20 && W.vehicles.carts >= 1, JSON.stringify(W.vehicles));
});

test('the chalk hopscotch lies above the plaza paving (the paving tops out at plaza y + 0.02, its border band at + 0.028: chalk under it is invisible)', () => {
  const P2 = plan.plazas.find((q) => q.id === 'P2'), hop = W.hopscotch, sign = A.mat('world_sign'), ys = [];
  A.scene.updateMatrixWorld(true);
  A.scene.traverse((o) => {
    if (!o.isMesh || o.material !== sign) return;
    const p = o.geometry.getAttribute('position'), v = new A.THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x - hop.x) < 1.4 && Math.abs(v.z - hop.z) < 0.7 && Math.abs(v.y - P2.y) < 0.2) ys.push(v.y); }
  });
  assert.equal(ys.length, 4, 'the chalk quad is in the scene');
  assert.ok(Math.min(...ys) >= P2.y + 0.028 + 0.004, `chalk at y ${Math.min(...ys).toFixed(3)} over a plaza whose border band is at ${(P2.y + 0.028).toFixed(3)}`);
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

/** Connected components (as a count) over the nodes inside the perimeter, for a list of id-pair edges. */
function components(nodes, edges) {
  const lim = HALF - 0.6, inside = nodes.filter((n) => Math.max(Math.abs(n.x), Math.abs(n.z)) <= lim), parent = new Map(inside.map((n) => [n.id, n.id]));
  const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
  for (const [a, b] of edges) if (parent.has(a) && parent.has(b)) parent.set(find(a), find(b));
  return new Set(inside.map((n) => find(n.id))).size;
}

test('nav fit: the edges a prop blocks are dropped without splitting the graph; every edge that remains walks both ways WITH the prop colliders', () => {
  const fit = W.navFit, nav = plan.nav, byId = new Map(nav.nodes.map((n) => [n.id, n]));
  const props = A.physics.walls.filter((w) => w.id === 'prop').length;
  assert.ok(props > 300, `${props} prop colliders: the check would be vacuous without them`);
  assert.ok(fit && fit.checked > 400 && fit.candidates > 20, `navfit looked at ${fit?.checked} edges, ${fit?.candidates} near a prop`);
  assert.deepEqual(fit.stranded, [], 'a blocked edge that is the only link is a defect: move the prop');
  assert.ok(fit.dropped.length >= 1 && fit.dropped.length <= 16, `${fit.dropped.length} edges dropped for a prop (more than a handful means a prop module ignores navDist)`);
  assert.ok(fit.outside.length <= 4, `${fit.outside.length} edges lead out of the plot`);
  assert.equal(components(nav.nodes, nav.edges), components(nav.nodes, [...nav.edges, ...fit.dropped]), 'dropping edges must not split the graph');
  const ph = physicsOf(A), bad = [];                                                                       // an independent kernel, built here
  for (const [ia, ib] of nav.edges) {
    const a = byId.get(ia), b = byId.get(ib);
    for (const [p, q] of [[a, b], [b, a]]) { const r = walk(ph, p, q); if (!r.ok) bad.push(`${p.id}(${p.kind} ${p.x},${p.z}) -> ${q.id}(${q.kind} ${q.x},${q.z}): ${r.reason} at ${r.at}`); }
  }
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} blocked walks of ${nav.edges.length * 2}`);
});

test('TEETH: a prop collider across a nav edge is found by the same walk', () => {
  const byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));
  const edge = plan.nav.edges.find(([a, b]) => byId.get(a).kind === 'street' && byId.get(b).kind === 'street' && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5);
  const a = byId.get(edge[0]), b = byId.get(edge[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ph = physicsOf(A);
  const nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz);
  ph.addWall({ x1: mx - (nx / l) * 3, z1: mz - (nz / l) * 3, x2: mx + (nx / l) * 3, z2: mz + (nz / l) * 3, t: 0.2, y0: -5, y1: 60, id: 'prop' });
  assert.equal(walk(ph, a, b).ok, false);
});

test('TEETH: fitNav drops a blocked edge that has another way round, and keeps (reports) one that is the only link', () => {
  const nodes = plan.nav.nodes, byId = new Map(nodes.map((n) => [n.id, n])), edges = plan.nav.edges;
  const deg = new Map(); for (const [a, b] of edges) { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); }
  const inside = ([a, b]) => [a, b].every((id) => Math.max(Math.abs(byId.get(id).x), Math.abs(byId.get(id).z)) < HALF - 3) && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5;
  const loop = edges.find((e) => inside(e) && deg.get(e[0]) >= 2 && deg.get(e[1]) >= 2 && components(nodes, edges.filter((x) => x !== e)) === components(nodes, edges));
  const leaf = edges.find((e) => inside(e) && (deg.get(e[0]) === 1 || deg.get(e[1]) === 1));
  assert.ok(loop && leaf, 'the plan has a loop edge and a dead-end edge to test with');
  const across = (e) => { const a = byId.get(e[0]), b = byId.get(e[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, nx = -(b.z - a.z), nz = b.x - a.x, l = Math.hypot(nx, nz); return { x1: mx - (nx / l) * 2.5, z1: mz - (nz / l) * 2.5, x2: mx + (nx / l) * 2.5, z2: mz + (nz / l) * 2.5, t: 0.2, y0: -50, y1: 90, id: 'prop' }; };
  const ctx = { plan: { ...plan, nav: { nodes, edges: edges.slice() } }, physics: { walls: [...A.physics.walls, across(loop), across(leaf)] } };
  const fit = fitNav(ctx);
  const has = (list, e) => list.some(([a, b]) => (a === e[0] && b === e[1]) || (a === e[1] && b === e[0]));
  assert.ok(has(fit.dropped, loop), 'the blocked loop edge is dropped');
  assert.ok(!has(ctx.plan.nav.edges, loop), '... and gone from plan.nav');
  assert.ok(has(fit.stranded, leaf) && has(ctx.plan.nav.edges, leaf), 'the blocked dead-end edge is reported and kept');
  assert.equal(components(nodes, ctx.plan.nav.edges), components(nodes, edges), 'the graph is still whole');
});

test('settle: a discovery that sits inside its own object is moved beside it (TEETH: the post itself is not a free spot)', () => {
  const K = makeKit(A, plan, W.occ), post = A.physics.walls.find((w) => w.id === 'prop' && w.x1 === w.x2 && w.z1 === w.z2 && w.t >= 0.1 && Math.abs(w.x1) < 80 && Math.abs(w.z1) < 80);
  assert.ok(post, 'a round prop collider (a post) to stand on');
  const ph = physicsOf(A);
  assert.ok(pushedBy(ph, post.x1, post.z1, plan.heightAt(post.x1, post.z1)) > 0.05, 'the post pushes a walker standing on it');
  const [x, z] = settle(K, post.x1, post.z1), d = Math.hypot(x - post.x1, z - post.z1);
  assert.ok(d > 0.3 && d <= 3.0, `moved ${d.toFixed(2)} m`);
  assert.ok(pushedBy(ph, x, z, plan.heightAt(x, z)) < 0.05, 'and the new spot is free');
});

test('budget: the batched world stays inside the draw and triangle allowance', () => {
  const s = A.batch.stats();
  assert.ok(s.meshes < 1100, `${s.meshes} batched meshes (before the merge pass)`);
  assert.ok(s.tris < 900000, `${s.tris} triangles`);
});
