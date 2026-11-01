// Where the animals are put (js/animals/habitat.js): on the places a barrio has them, never in a wall, a prop or on a door, clear of each other and of the barrio's own living props, the same on
// every load; and the hours they rest. A small hand-made barrio: one street, doors with houses behind them, a shop, a building site, a chapel, three squares with the shrine, a terrace roof.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/animals-habitat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { floorRect, wallsRect } from '../js/core/physics.js';
import { NavGraph } from '../js/people/nav.js';
import { planAnimals, ROLES, HABIT, restsAt, roostsAt } from '../js/animals/habitat.js';
import { SPECIES } from '../js/animals/library.js';

const META = {
  dog: { radius: 0.2, height: 0.85 }, cat: { radius: 0.13, height: 0.65 }, pigeon: { radius: 0.1, height: 0.34 }, hen: { radius: 0.18, height: 0.58 }, mule: { radius: 0.34, height: 1.95 },
  parrot_caged: { radius: 0.38, height: 1.9, caged: true }, canary_caged: { radius: 0.3, height: 1.7, caged: true },
};
const bank = new Map(SPECIES.map((key) => [key, { meta: META[key] }]));
const KINDS = ['house', 'cornerstore', 'house', 'unfinished', 'house', 'house', 'shophouse', 'house', 'house', 'house', 'house', 'house'];
const SHOP = ['cornerstore', 'shophouse', 'kiosk'];

/** A street along z = 0 (a node every 2 m, x 0..110, a lane from x 64 to 80), a door every 8 m with a lot behind it (walls from z 4 to 12; the door's node joins the street node straight
 * in front of it, as the real plan's anchors do), three squares and the chapel's at the east end, a terrace roof on lot 4. */
function barrio({ doors = true, squares = true, roof = true, len = 110, high = 20, streets = false, seed = 71 } = {}) {
  const ctx = createContext({ headless: true, seed }), ph = ctx.physics; ph.setTerrain(() => 0);
  const nav = new NavGraph(), lots = [], street = [];
  for (let x = 0; x <= len; x += 2) { const i = nav.add(x, 0, 0, x >= 64 && x <= 80 ? 'alley' : 'street', { w: 2.5 }); if (street.length) nav.link(street.at(-1), i); street.push(i); }
  if (doors) KINDS.forEach((kind, k) => {
    const x = 10 + k * 8, lot = { id: 'L' + k, kind, front: 'S1', x, z: 8, w: 7, d: 8, rotY: 0, y: 0, entrance: { outside: [x, 0, 2.4] } };
    lots.push(lot); ph.addWalls(wallsRect(x, 8, 7, 8, 0, -1, 7.0));
    nav.link(nav.add(x, 0, 2.4, 'door'), street[x / 2]);
  });
  lots.push({ id: 'CH', kind: 'chapel', front: 'P4', x: 60, z: -30, w: 8, d: 10, rotY: 0, y: 0, entrance: { outside: [60, 0, -24] } });
  const plazas = [], grid = (id, x0, z0) => {
    const ids = [];
    for (let a = 0; a < 3; a++) for (let b = 0; b < 2; b++) { const i = nav.add(x0 + a * 4.5, 0, z0 + b * 4.5, 'plaza'); ids.push(i); if (a) nav.link(i, i - 2); if (b) nav.link(i, i - 1); }
    nav.link(ids[0], street[Math.round(Math.max(0, x0 - 6) / 2)]);
    plazas.push({ id, kind: 'plaza', poly: [[x0 - 1.2, z0 - 1.2], [x0 + 10.2, z0 - 1.2], [x0 + 10.2, z0 + 5.7], [x0 - 1.2, z0 + 5.7]], cx: x0 + 4.5, cz: z0 + 2.25 });
  };
  if (squares) { grid('P1', 96, -14); grid('P4', 50, -18); grid('P2', 74, -14); }
  const buildings = new Map();
  if (roof) {
    const L = lots[4]; buildings.set(L.id, { roof: { walkable: true, poly: [[L.x - 3.5, 4], [L.x + 3.5, 4], [L.x + 3.5, 12], [L.x - 3.5, 12]], y: 7, style: 'terrace' } }); ph.addFloor(floorRect(L.x, 8, 7, 8, 0, 7));
    if (high) nav.add(L.x, high, -6, 'street', { w: 2.5 });                                // the street up the hill (`high` m up; the terrace is at 7): from there it is in view over the parapet, from the street below it is not
  }
  ctx.plan = { spawn: { x: 0, z: 0 }, lots, plazas, ...(streets ? { streets: [{ id: 'S1', kind: 'road', width: 8, sidewalk: true, pts: [[0, 0], [len, 0]] }, { id: 'S9', kind: 'alley', width: 3.4, sidewalk: false, pts: [[40, -30], [40, 30]] }] } : {}) }; ctx.buildings = buildings;
  ctx.world = { shrine: squares ? { x: 96, y: 0, z: -14, front: [98, -12], plaza: 'P1' } : undefined, extra: [{ id: 'perro', x: 20, z: 1 }, { id: 'gallinas', x: 45, z: 1 }] };
  return { ctx, world: { nav, physics: ph, inMain: () => true }, lots, ph };
}
const plan = (f) => planAnimals(f.ctx, f.world, bank);
const byRole = (placed) => ROLES.map((role, i) => placed.find((p) => p.id === 'animal:' + role.key + ':' + i));

test('every role gets its place: a doorstep, a shop front, the shrine square, a lane, a site, the chapel square, a terrace roof', () => {
  const f = barrio(), placed = plan(f), [cat, parrot, dog, pigeon, hen, mule, canary, cat2, roofDog, pigeon2] = byRole(placed);
  assert.equal(placed.length, ROLES.length); assert.deepEqual(new Set(placed.map((p) => p.key)), new Set(SPECIES));
  const doorOf = (p, pick) => f.lots.filter(pick).map((l) => Math.hypot(l.entrance.outside[0] - p.position.x, l.entrance.outside[2] - p.position.z)).sort((a, b) => a - b)[0];
  for (const [p, shop] of [[cat, false], [canary, false], [parrot, true]]) {
    const d = doorOf(p, (l) => (shop ? SHOP.includes(l.kind) : !SHOP.includes(l.kind) && l.kind !== 'chapel'));
    assert.ok(d >= 1.0 && d <= 3.2, `${p.id} stands ${d.toFixed(2)} m from its door: beside it, not on it`);
    assert.equal(p.habitat, shop ? 'shopfront' : 'doorstep');
  }
  const facade = f.lots[0].z - f.lots[0].d / 2;                                  // the front wall of the lots (z 4): a cage on its stand is put against it, as close as its own width allows
  for (const p of [parrot, canary]) assert.ok(facade - p.position.z >= 0.3 && facade - p.position.z <= 0.9, `${p.id} stands ${(facade - p.position.z).toFixed(2)} m off the facade: against it, not out in the street`);
  assert.equal(dog.habitat, 'street'); assert.ok(Math.abs(dog.position.z) >= 0.95 && Math.abs(dog.position.z) <= 2.4, 'the dog lies at the kerb, off the line the residents walk (1.0 to 2.3 m beside it)');
  assert.equal(hen.habitat, 'alley'); assert.ok(hen.position.x >= 60 && hen.position.x <= 84, 'the hen is in the lane');
  assert.equal(mule.habitat, 'site'); assert.ok(doorOf(mule, (l) => l.kind === 'unfinished') < 4 && mule.position.z > 0, `the mule is at the kerb on the site's side (${doorOf(mule, (l) => l.kind === 'unfinished').toFixed(2)} m from its door, z ${mule.position.z.toFixed(2)})`);
  assert.equal(pigeon.habitat, 'shrine'); assert.ok(pigeon.position.x > 95 && pigeon.position.z < -9, 'the pigeon is in the shrine square');
  assert.equal(cat2.habitat, 'chapel'); assert.ok(cat2.position.x > 48 && cat2.position.x < 62 && cat2.position.z < -11, 'the second cat is on the chapel square');
  assert.equal(roofDog.habitat, 'roof'); assert.equal(roofDog.fixed, true); assert.ok(Math.abs(roofDog.position.y - 7) < 0.05, 'the dog is on the terrace, not the street below');
  assert.ok(Math.abs(roofDog.position.x - f.lots[4].x) < 3.5 && roofDog.position.z > 4 && roofDog.position.z < 12);
  assert.equal(pigeon2.habitat, 'plaza'); assert.ok(pigeon2.position.x > 72 && pigeon2.position.x < 86 && pigeon2.position.z < -9, 'the last pigeon is on the third square');
  assert.ok(placed.filter((p) => p.meta.caged).every((p) => p.fixed) && placed.filter((p) => !p.meta.caged && p.habitat !== 'roof').every((p) => !p.fixed));
});

test('nobody is put in a wall or a prop, on a door, on top of another animal, by the arrival point or beside the barrio\'s own dog and hens', () => {
  const f = barrio();
  f.ph.addWalls(wallsRect(40, 0.9, 14, 0.5, 0, -1, 1.2)); f.ph.addWalls(wallsRect(40, -0.9, 14, 0.5, 0, -1, 1.2));      // planters along both kerbs where a street dog would be put (x 33..47)
  const placed = plan(f);
  assert.equal(placed.length, ROLES.length);
  for (const p of placed) {
    const { x, y, z } = p.position, m = p.meta;
    assert.ok(!f.ph._overlaps(x, z, y, m.radius, m.height), `${p.id} is inside a collider`);
    if (p.habitat !== 'roof') for (const l of f.lots) assert.ok(!(Math.abs(x - l.x) < l.w / 2 && Math.abs(z - l.z) < l.d / 2), `${p.id} is inside lot ${l.id}`);
    for (const l of f.lots) assert.ok(Math.hypot(x - l.entrance.outside[0], z - l.entrance.outside[2]) > 0.9, `${p.id} stands in the doorway of ${l.id}`);
    assert.ok(Math.hypot(x, z) >= 6, p.id + ' is within 6 m of the arrival point');
    assert.ok(Math.hypot(x - 20, z - 1) >= 6 && Math.hypot(x - 45, z - 1) >= 6, p.id + ' is beside the barrio\'s own dog or hens');
  }
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(Math.hypot(placed[i].position.x - placed[j].position.x, placed[i].position.z - placed[j].position.z) >= 4, `${placed[i].id} and ${placed[j].id} are on top of each other`);
});

test('a terrace nobody can see into gets no dog: with no street up the hill, or a wall across the view, the dog goes to a square instead', () => {
  const roofDog = (f) => { const placed = plan(f); assert.equal(placed.length, ROLES.length); return byRole(placed)[8]; };
  assert.equal(roofDog(barrio()).habitat, 'roof');
  assert.equal(roofDog(barrio({ high: false })).habitat, 'plaza', 'the parapet hides a dog from the street below');
  assert.equal(roofDog(barrio({ high: 9 })).habitat, 'plaza', 'a street only 2 m above the terrace does not see over its 1.2 m parapet');
  const walled = barrio(); walled.ph.addWalls(wallsRect(walled.lots[4].x, -2, 24, 0.5, 0, -1, 40));       // a tall wall between the street up the hill and the terrace
  assert.equal(roofDog(walled).habitat, 'plaza', 'no line of sight to the terrace');
});

test('the street animals lie on the pavement, not in the carriageway; a fence that cuts a spot off from the graph rules it out', () => {
  const wide = plan(barrio({ doors: false, squares: false, roof: false, streets: true })).filter((p) => p.habitat === 'street');
  assert.ok(wide.length >= 2, 'the dog and the mule are on the street');
  for (const p of wide) {
    assert.ok(Math.abs(p.position.z) >= 3.4 && Math.abs(p.position.z) <= 4.5, `${p.id} lies ${Math.abs(p.position.z).toFixed(2)} m off the axis of an 8 m street: on its pavement (3.1 to 4.0 m) or the apron`);
    assert.ok(Math.abs(p.position.x - 40) >= 2.2, `${p.id} is in the mouth of the side street that crosses at x 40 (x ${p.position.x.toFixed(2)})`);
  }
  const f = barrio({ doors: false, squares: false, roof: false });
  f.ph.addWalls(wallsRect(55, 1.5, 100, 0.2, 0, -1, 2.5)); f.ph.addWalls(wallsRect(55, -1.5, 100, 0.2, 0, -1, 2.5));             // a fence along both kerbs: only the strip between them is the graph's side
  const placed = plan(f); assert.equal(placed.length, ROLES.length);
  for (const p of placed.filter((q) => !q.meta.caged)) {                                                                              // (a cage on its stand does not walk)
    const n = f.world.nav.nodes[p.node];
    assert.ok(n && !f.ph.segmentBlocked(p.position.x, p.position.z, n.x, n.z, p.position.y, 0.8), `${p.id} is cut off from the graph by the fence`);
    assert.ok(Math.abs(p.position.z) < 1.4, `${p.id} is on the far side of the fence`);
  }
});

test('a short street holds only as many animals as fit, never two closer than 4 m', () => {
  const placed = plan(barrio({ doors: false, squares: false, roof: false, len: 24 }));
  assert.ok(placed.length >= 2 && placed.length < ROLES.length, `${placed.length} animals on a 24 m street`);
  for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) assert.ok(Math.hypot(placed[i].position.x - placed[j].position.x, placed[i].position.z - placed[j].position.z) >= 4, `${placed[i].id} and ${placed[j].id} are on top of each other`);
});

test('nobody is put in a doorway, whatever the seed: a street spot in front of a door is not used', () => {
  let near = Infinity;
  for (let seed = 1; seed <= 40; seed++) {
    const f = barrio({ seed }), placed = plan(f); assert.equal(placed.length, ROLES.length, 'seed ' + seed);
    for (const p of placed) for (const l of f.lots) near = Math.min(near, Math.hypot(p.position.x - l.entrance.outside[0], p.position.z - l.entrance.outside[2]));
  }
  assert.ok(near >= 1.0, `an animal stands ${near.toFixed(2)} m from a door in one of 40 barrios`);
});

test('the arrival point stays clear: with the player arriving beside the shrine, the pigeon that belongs there sits farther off', () => {
  const f = barrio(); f.ctx.plan.spawn = { x: 98, z: -12 };
  const placed = plan(f); assert.equal(placed.length, ROLES.length);
  for (const p of placed) assert.ok(Math.hypot(p.position.x - 98, p.position.z + 12) >= 6, `${p.id} is within 6 m of the arrival point`);
});

test('the same barrio and seed give the same animals, and the placement draws from its own stream', () => {
  const a = plan(barrio()), b = plan(barrio());
  assert.deepEqual(a.map((p) => [p.id, p.habitat, p.position]), b.map((p) => [p.id, p.habitat, p.position]));
  const f = barrio(), seed = f.ctx.rng.s; plan(f); assert.equal(f.ctx.rng.s, seed, 'placement must not draw from the world\'s stream');
});

test('a barrio without doors, squares or terraces still gets its ten animals, on the street; with no ground under the graph, or no walkable graph, it gets none', () => {
  const placed = plan(barrio({ doors: false, squares: false, roof: false }));
  assert.equal(placed.length, ROLES.length); assert.ok(placed.every((p) => ['street', 'alley'].includes(p.habitat)), JSON.stringify(placed.map((p) => p.habitat)));
  assert.ok(placed.every((p) => !p.fixed || p.meta.caged), 'no roof without a roof');
  const flooded = barrio({ roof: false }); for (const n of flooded.world.nav.nodes) n.y = 40;                      // the graph says 40 m, the ground is at 0: nothing fits
  assert.deepEqual(plan(flooded), []);
  const lonely = barrio(); lonely.world.inMain = () => false; assert.deepEqual(plan(lonely), []);
});

test('nobody is put on a crate or a chair of the street-clutter library (instanced, no collider); a pole\'s cross-arm or a canopy overhead is no reason to move', () => {
  const SIZE = { clutter_crate: [0.6, 0.4, 0.5], clutter_chair: [0.5, 0.9, 0.5], clutter_bench: [1.6, 0.5, 0.4], clutter_pole: [2.4, 8.6, 1.4], clutter_umbrella: [2.5, 2.4, 2.5] };
  const withClutter = (f, key, spots, yaw = 0.4, off = [0, 0]) => { f.ctx.clutter = { size: (k) => SIZE[k], records: spots.map((p) => ({ key, x: p.x + off[0], y: p.y, z: p.z + off[1], yaw, scale: [1, 1, 1] })) }; return f; };
  const base = plan(barrio()), spots = base.map((p) => p.position);
  assert.equal(base.length, ROLES.length);
  // a low piece on every spot the first plan chose (the bench: 0.7 m along its long axis from it, turned a quarter, so only a turned footprint covers the spot): all ten roles move off it, none is lost
  for (const [key, yaw, off] of [['clutter_crate', 0.4, [0, 0]], ['clutter_chair', 0.4, [0, 0]], ['clutter_bench', Math.PI / 2, [0, -0.7]]]) {
    const moved = plan(withClutter(barrio(), key, spots, yaw, off));
    assert.equal(moved.length, ROLES.length, key + ': every role still finds a place');
    for (const p of moved) {
      const r = p.meta.radius, [w, , d] = SIZE[key], c = Math.cos(yaw), s = Math.sin(yaw);
      for (const q of spots) {
        const dx = p.position.x - (q.x + off[0]), dz = p.position.z - (q.z + off[1]);
        assert.ok(Math.abs(c * dx - s * dz) >= w / 2 + r || Math.abs(s * dx + c * dz) >= d / 2 + r, `${p.id} stands on a ${key} (${dx.toFixed(2)}, ${dz.toFixed(2)} from its centre)`);
      }
    }
  }
  for (const key of ['clutter_pole', 'clutter_umbrella']) assert.deepEqual(plan(withClutter(barrio(), key, spots)).map((p) => [p.id, p.position]), base.map((p) => [p.id, p.position]), key + ' is overhead: nobody moves for it');
  const other = barrio(); other.ctx.clutter = { size: (k) => SIZE[k], records: spots.map((p) => ({ key: 'clutter_crate', x: p.x, y: p.y + 3, z: p.z, yaw: 0, scale: [1, 1, 1] })) };
  assert.deepEqual(plan(other).map((p) => p.position), base.map((p) => p.position), 'a crate on another storey is not in the way');
});

test('the hours of rest: the dogs sleep at night, the cats nap at noon, the pigeons and hens roost out of sight, the rest of the day nothing changes', () => {
  for (const [key, hour, rests] of [['dog', 23, true], ['dog', 3, true], ['dog', 22, true], ['dog', 6, false], ['dog', 12, false], ['cat', 13, true], ['cat', 11.9, false], ['cat', 16, false], ['cat', 2, false],
    ['pigeon', 20, true], ['pigeon', 5, true], ['pigeon', 5.5, false], ['pigeon', 12, false], ['hen', 19, true], ['hen', 18.9, false], ['mule', 0, true], ['mule', 9, false], ['parrot_caged', 21, true], ['parrot_caged', 8, false]])
    assert.equal(restsAt(key, hour), rests, `${key} at ${hour}`);
  assert.equal(restsAt('unicorn', 3), false); assert.equal(restsAt('dog', NaN), false); assert.equal(restsAt('dog', undefined), false);
  assert.equal(roostsAt('pigeon', 22), true); assert.equal(roostsAt('hen', 12), false); assert.equal(roostsAt('dog', 23), false);
  assert.deepEqual(Object.keys(HABIT).sort(), [...SPECIES].sort(), 'every species has its hours');
});
