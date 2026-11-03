// The coast (A5, js/world/coast.js, dev/FEATURE-BEACH.md 1.7): the beach and sea south of the plot are ground the plan, the physics kernel and the nav graph can trust.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-coast.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of interiors-content.test.mjs):
//   seam    the beach's ground sits 0.3 m off the plot's edge     notch  a 0.6 m step in the seabed at z = 150     island  a bar above the sea at (20, 170)
//   gap     the axis stair loses its link down to the sand        ramp   the ramp climbs at 1:6                    leak    no rails and a gentle sea wall: a walker can step off the deck
//   fewpois the beach keeps 12 of its points of interest          random a build that is not a function of the seed     gate    the south gate is built open
//   norails the stairs lose their cheeks and the ramp its side rails (a walker steps into a cheek and off the ramp's edge)
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import { createContext } from '../js/core/ctx.js';
import { Physics } from '../js/core/physics.js';
import { walkable } from '../js/world/nav.js';
import { generatePlan } from '../js/world/plan.js';
import { buildPerimeter } from '../js/world/terrain.js';
import { createCoast, coastColliders, setGate, SEA, Z0, XW, DECK, DECK_Z, WALL_Z, BUOY_Z, STOP_Z, KERNEL_Z, SOFT_Z, STAIR_FLIGHT, RAMP_END_Z } from '../js/world/coast.js';
import { pointInPoly } from '../js/world/geom.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;

const ctx = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx);
const real = plan.coast;

/** The coast the checks look at: the real one, or a broken copy when C_SABOTAGE asks. */
function broken(c) {
  const o = { ...c };
  if (on('seam')) o.heightAt = (x, z) => c.heightAt(x, z) + (z > Z0 ? 0.3 : 0);
  if (on('notch')) { const h = o.heightAt; o.heightAt = (x, z) => h(x, z) - (z > 150 ? 0.6 : 0); }
  if (on('island')) { const h = o.heightAt; o.heightAt = (x, z) => h(x, z) + 4.2 * Math.max(0, 1 - Math.hypot(x - 20, z - 170) / 4); }
  if (on('ramp')) { const h = o.heightAt, r = c.ramp; o.heightAt = (x, z) => (Math.abs(x - r.x) < r.w / 2 && z > DECK_Z && z < 118 ? Math.max(c.sandy(x, z), DECK - (z - DECK_Z) / 6) : h(x, z)); }
  if (on('leak')) { const h = o.heightAt; o.heightAt = (x, z) => (z >= DECK_Z && z < WALL_Z ? h(x, WALL_Z + 0.001) + (DECK - h(x, WALL_Z + 0.001)) * (1 - (z - DECK_Z) / 1.6) * 0.4 : h(x, z)); o.rails = []; }
  if (on('gap')) { const a = c.stairs[2], ids = c.nav.nodes.filter((n) => n.kind === 'stair' && Math.abs(n.x - a.x) < 0.01), mid = ids.find((n) => n.z === 108.7), foot = ids.find((n) => n.z > 110); o.nav = { nodes: c.nav.nodes, edges: c.nav.edges.filter(([p, q]) => !((p === mid.id && q === foot.id) || (q === mid.id && p === foot.id))) }; }
  if (on('fewpois')) o.pois = c.pois.slice(0, 12);
  if (on('norails')) { o.cheeks = []; o.rampRails = []; }
  return o;
}
const C = broken(real);
const slopeOf = (c, x, z, e = 0.25) => Math.max(Math.abs(c.heightAt(x + e, z) - c.heightAt(x - e, z)), Math.abs(c.heightAt(x, z + e) - c.heightAt(x, z - e))) / (2 * e);
const accessZone = (c, x, z) => c.accesses.some((a) => Math.abs(x - a.x) <= a.w / 2 + 0.8 && z < RAMP_END_Z + 0.8);
const waterline = (c, x) => { for (let z = 120; z < 200; z += 0.05) if (c.heightAt(x, z) <= SEA) return z; return NaN; };

test('the plan hands over to the coast: heightAt is the plot north of z = 100 and the beach south of it, with no step at the seam', () => {
  assert.ok(real && typeof real.heightAt === 'function', 'plan.coast exists');
  let worst = 0;
  for (let x = -99; x <= 99; x += 1) worst = Math.max(worst, Math.abs(C.heightAt(x, Z0 + 0.01) - plan.heightAt(x, Z0 - 0.01)));
  assert.ok(worst <= 0.05, `the seam is ${worst.toFixed(3)} m (limit 0.05)`);
  for (const [x, z] of [[0, 110], [-40, 150], [55, 190], [-99, 105]]) assert.equal(plan.heightAt(x, z), real.heightAt(x, z), `plan.heightAt (${x}, ${z}) is the coast's`);
  for (const [x, z] of [[0, 60], [-50, 95], [100.5, 120], [-100.5, 130]]) assert.ok(Number.isFinite(plan.heightAt(x, z)), `plan.heightAt (${x}, ${z}) is finite`);
});

test('slopes: no gradient over 0.10 on the sand and foreshore or 0.08 in the water, and no step over 0.12 m in 0.25 m outside the wall and the accesses', () => {
  let worstSand = 0, worstWater = 0, worstStep = 0, at = '';
  for (let x = -98; x <= 98; x += 1.3) for (let z = WALL_Z + 0.4; z <= STOP_Z - 1; z += 0.5) {
    if (accessZone(C, x, z)) continue;
    const g = slopeOf(C, x, z), wet = C.heightAt(x, z) < SEA - 0.01;
    if (wet) worstWater = Math.max(worstWater, g); else worstSand = Math.max(worstSand, g);
    const st = Math.max(Math.abs(C.heightAt(x, z + 0.25) - C.heightAt(x, z)), Math.abs(C.heightAt(x + 0.25, z) - C.heightAt(x, z)));
    if (st > worstStep) { worstStep = st; at = `(${x.toFixed(1)}, ${z})`; }
  }
  assert.ok(worstSand <= 0.10, `sand and foreshore gradient ${worstSand.toFixed(3)} > 0.10`);
  assert.ok(worstWater <= 0.08, `water gradient ${worstWater.toFixed(3)} > 0.08`);
  assert.ok(worstStep <= 0.12, `a step of ${worstStep.toFixed(2)} m in 0.25 m at ${at}`);
});

test('profile: the waterline lies at z 140-150, the buoy line is 2.4-3.6 m deep, and no bar breaks the sea between the waterline and the hard stop', () => {
  for (let x = -95; x <= 95; x += 5) { const z = waterline(C, x); assert.ok(z >= 140 && z <= 150, `waterline at x ${x} is z ${z}`); }
  for (let x = -95; x <= 95; x += 10) { const d = SEA - C.heightAt(x, BUOY_Z); assert.ok(d >= 2.4 && d <= 3.6, `depth at the buoy line, x ${x}: ${d.toFixed(2)} m`); }
  for (let x = -98; x <= 98; x += 3) {
    const wl = waterline(C, x);
    for (let z = wl + 0.5; z <= STOP_Z; z += 0.5) assert.ok(C.heightAt(x, z) < SEA, `a bar over the sea at (${x}, ${z}): ${C.heightAt(x, z).toFixed(2)}`);
    for (let z = WALL_Z + 1; z < wl - 0.5; z += 1) if (!accessZone(C, x, z)) assert.ok(C.heightAt(x, z) >= SEA, `a pool on the sand at (${x}, ${z})`);
  }
});

test('the nav graph the beach adds: land or shallow water only, one component, short slopes, and every access joins the promenade to the sand on its own', () => {
  const { nodes, edges } = C.nav, byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) assert.ok(SEA - C.heightAt(n.x, n.z) <= 0.5 + 1e-6, `${n.id} (${n.kind} ${n.x},${n.z}) is ${(SEA - C.heightAt(n.x, n.z)).toFixed(2)} m under water`);
  for (const n of nodes) assert.ok(Math.abs(n.y - real.heightAt(n.x, n.z)) <= 0.45, `${n.id} stands ${n.y} but the ground is ${real.heightAt(n.x, n.z).toFixed(2)}`);
  const comp = (ns, es) => {
    const adj = new Map(ns.map((n) => [n.id, []])); for (const [a, b] of es) { adj.get(a)?.push(b); adj.get(b)?.push(a); }
    const seen = new Set(), out = []; for (const n of ns) { if (seen.has(n.id)) continue; const q = [n.id]; seen.add(n.id); let k = 0; while (q.length) { const v = q.pop(); k++; for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); q.push(w); } } out.push(k); }
    return { out, adj };
  };
  assert.equal(comp(nodes, edges).out.length, 1, `the beach graph is ${comp(nodes, edges).out.length} pieces`);
  for (const [a, b] of edges) { const p = byId.get(a), q = byId.get(b), d = Math.hypot(p.x - q.x, p.z - q.z); assert.ok(d <= 10, `edge ${a}-${b} is ${d.toFixed(1)} m long`); }
  for (const a of C.accesses) {
    const keep = nodes.filter((n) => n.kind !== 'stair' || Math.abs(n.x - a.x) <= a.w / 2 + 3.1), ids = new Set(keep.map((n) => n.id));
    const { adj } = comp(keep, edges.filter(([p, q]) => ids.has(p) && ids.has(q)));
    const near = (x, z, ok) => keep.filter(ok).reduce((b, n) => (Math.hypot(n.x - x, n.z - z) < Math.hypot(b.x - x, b.z - z) ? n : b));
    const top = near(a.x, DECK_Z, (n) => n.y > 0.1), foot = near(a.x, a.kind === 'ramp' ? RAMP_END_Z : STAIR_FLIGHT[1], (n) => n.y < -0.5);
    assert.ok(Math.hypot(top.x - a.x, top.z - DECK_Z) <= 1.5 && top.y > 0.1, `${a.id}: no deck node within 1.5 m of the head of the ${a.kind} (${top.id} ${top.x},${top.z})`);
    assert.ok(Math.hypot(foot.x - a.x, foot.z - (a.kind === 'ramp' ? RAMP_END_Z : STAIR_FLIGHT[1])) <= 1.5 && foot.y < 0, `${a.id}: no sand node within 1.5 m of the foot of the ${a.kind} (${foot.id} ${foot.x},${foot.z})`);
    const seen = new Set([top.id]), q = [top.id]; while (q.length) { const v = q.pop(); for (const w of adj.get(v)) if (!seen.has(w)) { seen.add(w); q.push(w); } }
    assert.ok(seen.has(foot.id), `${a.id}: on its own the ${a.kind} does not join the promenade to the sand`);
  }
  let steep = 0; for (let z = DECK_Z; z <= RAMP_END_Z; z += 0.25) steep = Math.max(steep, Math.abs(C.heightAt(real.ramp.x, z + 0.25) - C.heightAt(real.ramp.x, z)) / 0.25);
  assert.ok(steep <= 0.09, `the ramp climbs at ${steep.toFixed(3)} (1:12 is 0.083, limit 0.09)`);
});

function kernel() {
  const phys = new Physics(); phys.setTerrain(plan.heightAt);
  coastColliders(phys, C);                                                         // the walls the page builds: the rail, the cheeks and the ramp's rails
  return phys;
}
const at = (x, z) => ({ x, z, y: plan.heightAt(x, z) });

test('walk: the kernel takes a walker down every stair and the ramp, over the sand to the waterline and out to 1.5 m of water, and the rail stops it between them', () => {
  for (const a of real.accesses) {
    const wl = waterline(real, a.x), d15 = (() => { for (let z = wl; z < 215; z += 0.1) if (SEA - real.heightAt(a.x, z) >= 1.5) return z; return NaN; })();
    const phys = kernel(), legs = [at(a.x, 103), at(a.x, 114), at(a.x, 130), at(a.x, wl + 0.3), at(a.x, d15)];
    for (let i = 1; i < legs.length; i++) assert.ok(walkable(phys, legs[i - 1], legs[i]), `${a.id}: the kernel could not walk (${a.x}, ${legs[i - 1].z}) -> (${a.x}, ${legs[i].z.toFixed(1)})`);
  }
  for (const x of [-75, -30, 14, 50, 88]) assert.ok(!walkable(kernel(), at(x, 103), at(x, 114)), `a walker went off the promenade's edge at x ${x} between accesses`);
});

test('the cheeks and the ramp\'s rails are solid: a walker cannot walk into a cheek from the sand or off the ramp\'s edge, while the flights and the ramp stay open', () => {
  assert.equal(real.cheeks.length, 2 * real.stairs.length, 'two cheeks to a flight');
  assert.equal(real.rampRails.length, 2, 'a rail along each edge of the ramp');
  for (const c of real.cheeks) assert.ok(!walkable(kernel(), at(c.x, c.z2 + 2.5), at(c.x, (c.z1 + c.z2) / 2)), `a walker went into the cheek ${c.id} (x ${c.x}) from the sand`);
  const r = real.ramp;
  for (const s of [-1, 1]) for (const z of [110, 114, 117]) assert.ok(!walkable(kernel(), at(r.x, z), at(r.x + s * 2, z)), `a walker stepped off the ${s < 0 ? 'west' : 'east'} edge of the ramp at z ${z}`);
  for (const a of real.accesses) assert.ok(walkable(kernel(), at(a.x, 103), at(a.x, a.kind === 'ramp' ? RAMP_END_Z + 1 : STAIR_FLIGHT[1] + 1)), `${a.id} is shut by its own cheeks or rails`);
  for (const s of [-1, 1]) {
    const side = s < 0 ? 'west' : 'east';
    { const x = r.x + s * (r.w / 2 - 0.45); assert.ok(walkable(kernel(), at(x, 103), at(x, RAMP_END_Z + 1)), `the ramp is shut within 0.45 m of its ${side} edge`); }
    for (const a of real.stairs) {
      const x = a.x + s * (a.w / 2 - 0.45);
      assert.ok(walkable(kernel(), at(x, 103), at(x, STAIR_FLIGHT[1] + 1)), `${a.id}: the flight is shut within 0.45 m of its ${side} edge`);
      for (const z of [108.2, 108.9, 109.5]) {                                    // pushed into the cheek from the first tread, the middle and the foot (a walker on the first tread stands level with the deck, so the cheek must reach well over 0.4 m)
        const phys = kernel(), x0 = a.x + s * (a.w / 2 - 0.6), st = { x: x0, y: plan.heightAt(x0, z), z, vy: 0, onGround: true };
        for (let i = 0; i < 60; i++) phys.move(st, s * 0.03, 0, 1 / 60);
        assert.ok(s * (st.x - a.x) <= a.w / 2 - 0.3 + 0.05, `${a.id}: a walker pushed into the ${side} cheek at z ${z} got ${(s * (st.x - a.x)).toFixed(2)} m from the flight's axis (the cheek's face is at ${a.w / 2})`);
      }
    }
  }
});

test('the perimeter: the south gate is shut until the beach is built, the east and west walls run on to the sea\'s end and the kernel wall closes it', () => {
  const c2 = createContext({ seed: SEED, headless: true }); c2.plan = generatePlan(c2); c2.physics.setTerrain(c2.plan.heightAt);
  buildPerimeter(c2);
  if (on('gate')) setGate(c2.physics, true);
  const P = c2.physics, spawn = c2.plan.spawn, to = (x, z) => ({ x, z, y: c2.plan.heightAt(x, z) });
  assert.ok(!walkable(P, to(spawn.x, 95), to(spawn.x, 104)), 'a walker crossed the shut gate');
  assert.ok(setGate(P, true) >= 1, 'the gate has walls to open');
  assert.ok(walkable(P, to(spawn.x, 95), to(spawn.x, 104)), 'a walker could not pass the open gate');
  assert.ok(!walkable(P, to(50, 130), to(104, 130)), 'a walker left the beach by the east wall');
  assert.ok(!walkable(P, to(-50, 130), to(-104, 130)), 'a walker left the beach by the west wall');
  assert.ok(!walkable(P, to(0, 205), to(0, KERNEL_Z + 2)), 'a walker crossed the kernel wall at the sea\'s end');
  setGate(P, false); assert.ok(!walkable(P, to(spawn.x, 95), to(spawn.x, 104)), 'the gate shuts again');
});

test('the Plaza del Mar: the spawn stands on it, it is level with the deck, and the player\'s limit follows the sea', () => {
  const p6 = plan.plazas.find((p) => p.id === 'P6');
  assert.ok(p6 && p6.y === DECK, 'plaza P6 exists at the deck level');
  assert.ok(pointInPoly(p6.poly, plan.spawn.x, plan.spawn.z), 'the spawn is inside the plaza');
  assert.equal(plan.spawn.yaw, 0, 'the spawn still looks uphill');
  assert.ok(Math.abs(plan.heightAt(plan.spawn.x, plan.spawn.z) - DECK) < 1e-4, 'the spawn stands at the deck level');
  const l = real.limit(150, 230); assert.ok(l.hard && l.x < XW && l.z <= STOP_Z, `limit(150, 230) -> ${JSON.stringify(l)}`);
  assert.ok(real.limit(0, SOFT_Z + 8).soft > 0.3 && real.limit(0, SOFT_Z - 5).soft === 0 && real.limit(0, 100).soft === 0, 'the soft stop begins at the buoys');
  assert.equal(real.surfaceAt(0, 104), 'deck'); assert.equal(real.surfaceAt(0, 125), 'sand'); assert.equal(real.surfaceAt(0, 160), 'wade'); assert.equal(real.surfaceAt(0, 200), 'swim');
  assert.equal(real.surfaceAt(real.stairs[2].x, 108.5), 'stairs'); assert.equal(real.surfaceAt(real.ramp.x, 112), 'ramp');
});

test('data: the areas Playa and Mar, five landmarks and the points of interest for the people phase', () => {
  assert.deepEqual(C.areas.map((a) => a.id).sort(), ['mar', 'playa']);
  assert.deepEqual(C.landmarks.map((l) => l.id).sort(), ['balsa', 'malecon', 'muelle', 'playa', 'salvavidas']);
  const n = {}; for (const p of C.pois) n[p.kind] = (n[p.kind] ?? 0) + 1;
  assert.ok(C.pois.length >= 40, `${C.pois.length} beach points of interest (need 40)`);
  for (const [k, min] of Object.entries({ lie: 24, wade: 8, swim: 6, fish: 6, volley: 4, vend: 8, watch: 2, moor: 6, launch: 6 })) assert.ok((n[k] ?? 0) >= min, `${k}: ${n[k] ?? 0} < ${min}`);
  for (const p of C.pois) { assert.ok(Number.isFinite(p.x + p.y + p.z), `${p.id} has a position`); if (p.kind === 'lie' || p.kind === 'vend') assert.ok(real.heightAt(p.x, p.z) > SEA, `${p.id} lies on dry sand`); }
});

test('determinism: one seed gives one coast, and the dunes follow the seed', () => {
  const data = (c) => JSON.stringify({ p: c.pois, n: c.nav, l: c.landmarks, a: c.areas, h: [0, 1, 2, 3, 4, 5].map((i) => c.heightAt(-70 + i * 28, 120 + i * 9.3)) });
  const mk = (seed) => { const cc = createCoast({ seed, edge: () => 0.1 }); return on('random') ? { ...cc, pois: cc.pois.map((p) => ({ ...p, x: p.x + Math.random() * 1e-3 })) } : cc; };
  assert.equal(data(mk(7)), data(mk(7)), 'two builds with one seed differ');
  assert.notEqual(data(mk(7)), data(mk(8)), 'the seed changes nothing');
});

test('the far ground meets the beach: the same height at the walls, the bay\'s seabed under the sea, the headlands above it', () => {
  const land = (x, z) => 3 + 0.01 * z;
  for (const z of [101, 105, 120, 150, 190]) for (const x of [-100, -60, 0, 60, 100]) assert.ok(Math.abs(real.ground(x, z, land) - real.heightAt(x, z)) < 1e-9, `ground (${x}, ${z}) is not the beach height`);
  for (const [x, z] of [[0, 300], [0, 450], [150, 260]]) assert.ok(real.ground(x, z, land) < SEA - 2, `(${x}, ${z}) is not deep under the sea`);
  const w = real.headlands[0], e = real.headlands[1];
  assert.ok(real.ground(w.x, w.z, land) > SEA + 15 && real.ground(e.x, e.z, land) > SEA + 20, 'the headlands stand over the sea');
  assert.ok(real.ground(300, 100, land) > 3 && real.ground(-300, 100, land) > 3, 'inland of the shore the old land stays');
  let worst = 0; for (let z = 101; z < 330; z += 3) for (let x = 100; x < 330; x += 5) worst = Math.max(worst, Math.abs(real.ground(x + 0.5, z, land) - real.ground(x, z, land)));
  assert.ok(worst < 4.5, `a ${worst.toFixed(1)} m jump in 0.5 m on the far ground`);
});
