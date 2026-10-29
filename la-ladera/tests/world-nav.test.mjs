// Walks every edge of plan.nav with the real physics kernel (terrain = plan.heightAt, lots = solid blocks).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-nav.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wallsRect } from '../js/core/physics.js';
import { makePlan, makeWalker, walk, navComponents, SEED } from './world-lib.mjs';

const { plan } = makePlan(SEED);
const byId = new Map(plan.nav.nodes.map((n) => [n.id, n]));

function failures(phys, edges) {
  const bad = [];
  for (const [ia, ib] of edges) {
    const a = byId.get(ia), b = byId.get(ib);
    for (const [p, q] of [[a, b], [b, a]]) {
      const r = walk(phys, p, q);
      if (!r.ok) bad.push(`${p.id}(${p.kind} ${p.x},${p.z}) -> ${q.id}(${q.kind} ${q.x},${q.z}): ${r.reason} at ${r.at}`);
    }
  }
  return bad;
}

test('every nav node stands on ground that matches its y and is not inside a lot', () => {
  const phys = makeWalker(plan), bad = [];
  for (const n of plan.nav.nodes) {
    const g = phys.groundAt(n.x, n.z, n.y + 0.6);
    if (Math.abs(g - n.y) > 0.05) bad.push(`${n.id} ${n.kind} (${n.x},${n.z}): node y ${n.y} but ground ${g.toFixed(2)}`);
    const s = { x: n.x, y: n.y, z: n.z, vy: 0, onGround: true };
    phys.move(s, 0.001, 0, 1 / 60);
    if (Math.hypot(s.x - n.x, s.z - n.z) > 0.2) bad.push(`${n.id} (${n.x},${n.z}) is pushed ${Math.hypot(s.x - n.x, s.z - n.z).toFixed(2)} m by a wall`);
  }
  assert.deepEqual(bad.slice(0, 10), []);
});

test('the plan itself dropped no unwalkable nav edge', () => {
  assert.deepEqual(plan.warnings.filter((w) => w.startsWith('nav edge')), []);
});

test('every nav edge can be walked in both directions', () => {
  const bad = failures(makeWalker(plan), plan.nav.edges);
  assert.deepEqual(bad.slice(0, 12), [], `${bad.length} blocked walks of ${plan.nav.edges.length * 2}`);
});

test('the spawn reaches every door node by walking the nav graph (one component)', () => {
  const comps = navComponents(plan);
  assert.equal(comps.length, 1, `nav has ${comps.length} components: ${comps.map((c) => c.length).join('/')}`);
  const doors = plan.nav.nodes.filter((n) => n.kind === 'door').map((n) => n.lot);
  assert.equal(new Set(doors).size, plan.lots.length, 'a door node per lot');
});

test('TEETH: a wall across an edge is detected as blocked', () => {
  const edge = plan.nav.edges.find(([a, b]) => byId.get(a).kind === 'street' && byId.get(b).kind === 'street' && Math.hypot(byId.get(a).x - byId.get(b).x, byId.get(a).z - byId.get(b).z) > 2.5);
  const a = byId.get(edge[0]), b = byId.get(edge[1]), mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2, ry = Math.atan2(b.x - a.x, b.z - a.z) + Math.PI / 2;
  const phys = makeWalker(plan, { walls: wallsRect(mx, mz, 6, 0.1, ry, -5, 50, 0.06).slice(0, 1) });
  assert.ok(failures(phys, [edge]).length > 0, 'the blocked edge must fail');
});

test('TEETH: a node placed on a lot wall fails the "not pushed by a wall" check', () => {
  const lot = plan.lots[3], phys = makeWalker(plan), x = lot.x + (lot.d / 2) * Math.sin(lot.rotY), z = lot.z + (lot.d / 2) * Math.cos(lot.rotY);
  const s = { x, y: plan.heightAt(x, z) + 0.3, z, vy: 0, onGround: true };
  phys.move(s, 0.001, 0, 1 / 60);
  assert.ok(Math.hypot(s.x - x, s.z - z) > 0.2, 'a character standing on a lot wall is pushed out');
});
