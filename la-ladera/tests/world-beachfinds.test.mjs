// The beach's discoveries as data (A5, js/world/beachfinds.js, dev/FEATURE-BEACH.md 1.6, round 7 phase 2c): eight things a walker finds by going up to them, each bound to something that is really there, three of them
// on the seabed and found by DIVING, not by swimming over them. Pure: the coast plan, the front and the sea's set pieces in, plain records out; the depth rules run through the REAL Discoveries class
// (core/registries.js), so what is tested is what the page does when the player's feet reach a place, and one build of the page's world (the beach live) shows what is registered and where.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachfinds.test.mjs
// Every check has a deliberately broken input selected by BFIND_SABOTAGE=<id>|all, and each must then FAIL:
//   few      the cooperative's board is no find              kind     a find of a kind discover.js does not know         english  a find whose Spanish name is its English line
//   short    an English line of ten letters                  bounds   a find outside the walls                           surface  the moped is found by a swimmer at the surface
//   fat      the anchor's window reaches the surface         pierwet  the pier's end is found from the water under it    unbound  the logbook is thirty metres from the tower
//   nodrift  the bottle is far from any driftwood            shallow  the moped is lifted a metre off the seabed         nocoast  the page's world is built without a beach
//   inwall   the page's logbook is registered inside a wall   dup     two finds share an id
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { Discoveries } from '../js/core/registries.js';
import { generatePlan } from '../js/world/plan.js';
import { SEA, PIER, RAFT, XW, Z0 } from '../js/world/coast.js';
import { planFront } from '../js/world/beachfront.js';
import { planSea } from '../js/world/beachsea.js';
import { planBeachFinds, buildBeachFinds, SURFACE_Y, DIVE_ABOVE } from '../js/world/beachfinds.js';
import { KINDS } from '../js/world/discover.js';
import { shapeOf, overlaps } from './geom2d.mjs';
import { buildData } from './headless.mjs';

const SAB = process.env.BFIND_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;
const IDS = ['muelle', 'balsa', 'libro', 'pizarra', 'botella', 'moto', 'ancla', 'coral'];

const ctx0 = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx0), coast = plan.coast, front = planFront(coast), sea = planSea(coast);
const pick = (list, id) => list.find((d) => d.id === id);

/** The finds the checks look at: the real plan, or a broken copy when BFIND_SABOTAGE asks. */
function finds() {
  let f = planBeachFinds(coast, front, sea).map((d) => ({ ...d }));
  const by = (id) => pick(f, id);
  if (on('few')) f = f.filter((d) => d.id !== 'pizarra');
  if (on('kind')) by('botella').kind = 'poi';
  if (on('english')) by('balsa').name = by('balsa').en;
  if (on('short')) by('libro').en = 'A logbook.';
  if (on('bounds')) by('muelle').x = XW + 5;
  if (on('surface')) by('moto').y = SURFACE_Y;
  if (on('fat')) by('ancla').dy = 3;
  if (on('pierwet')) by('muelle').y = SURFACE_Y;
  if (on('unbound')) by('libro').x += 30;
  if (on('nodrift')) { const b = by('botella'); b.x = 0; b.z = 106; }                     // (on the promenade's deck: no driftwood is washed up there)
  if (on('shallow')) by('moto').y += 1;
  if (on('dup')) f.push({ ...by('balsa') });
  return f;
}

test('eight finds: unique ids, a Spanish name and an English line of their own, a kind discover.js knows, a place the player can reach inside the walls', () => {
  const f = finds();
  assert.deepEqual(f.map((d) => d.id).sort(), [...IDS].sort(), 'the eight, by id');
  assert.equal(new Set(f.map((d) => d.id)).size, f.length, 'no id twice');
  assert.equal(new Set(f.map((d) => d.name)).size, f.length, 'no name twice');
  for (const d of f) {
    assert.ok(KINDS.includes(d.kind), `${d.id}: kind '${d.kind}' is not one discover.js knows (${KINDS.join(', ')})`);
    assert.match(d.name, /^(El|La|Los|Las) \p{L}{3,}/u, `${d.id}: a Spanish name with its article`);
    assert.ok(d.en.length >= 25 && /^[A-Z]/.test(d.en) && d.en !== d.name, `${d.id}: an English line of its own (${d.en.length} letters)`);
    assert.ok([d.x, d.y, d.z, d.radius, d.dy].every(Number.isFinite) && d.radius >= 2 && d.radius <= 5 && d.dy > 0 && d.dy <= 3, `${d.id}: a radius of 2 to 5 m and a window of 0 to 3 m`);
    const lim = coast.limit(d.x, d.z);
    assert.ok(Math.abs(d.x) <= XW && d.z > Z0 && !lim.hard && Math.hypot(lim.x - d.x, lim.z - d.z) < 1e-6, `${d.id}: inside the walls and the sea's end, where the player can really go`);
  }
});

test('depth is the rule: the three on the seabed are found by a diver and not by a swimmer at the surface, the pier\'s end on its deck and not from the water under it, the raft on its deck and from the water beside it', () => {
  const f = finds(), D = new Discoveries({ events: { emit() {} } });
  for (const d of f) D.register({ ...d });
  const found = (x, y, z) => { D.found.clear(); D.check(x, y, z); return [...D.found]; };
  const beds = { moto: pick(sea.sunken, 'moped').y, ancla: pick(sea.sunken, 'anchor').y, coral: sea.reef.y };
  for (const [id, bed] of Object.entries(beds)) {
    const d = pick(f, id);
    assert.deepEqual(found(d.x, SURFACE_Y, d.z), [], `${id}: a swimmer at the surface right above it finds nothing`);
    assert.deepEqual(found(d.x, bed + 0.3, d.z), [id], `${id}: a diver on the seabed beside it does (the controller dives to the seabed + 0.3 m)`);
    assert.deepEqual(found(d.x + d.radius + 0.5, bed + 0.3, d.z), [], `${id}: and only up close`);
  }
  const pier = pick(f, 'muelle'), raft = pick(f, 'balsa');
  assert.deepEqual(found(pier.x, PIER.top, pier.z), ['muelle'], 'the end of the pier is found on its deck');
  assert.deepEqual(found(pier.x, SURFACE_Y, pier.z), [], 'and not from the water under it');
  assert.deepEqual(found(raft.x, RAFT.top, raft.z), ['balsa'], 'the raft is found on its deck');
  assert.deepEqual(found(raft.x + 2.5, SURFACE_Y, raft.z), ['balsa'], 'and from the water beside it');
  for (const id of ['libro', 'pizarra', 'botella']) {
    const d = pick(f, id), ground = coast.heightAt(d.x, d.z);
    assert.deepEqual(found(d.x, ground, d.z), [id], `${id}: a walker on the sand beside it finds it`);
    assert.deepEqual(found(d.x, ground + 6, d.z), [], `${id}: and not from a roof or a balcony above it`);
  }
  assert.deepEqual(found(plan.spawn.x, plan.spawn.y, plan.spawn.z), [], 'none is found at the spawn');
});

test('each is bound to something that is really there: the pier\'s end, the raft, the tower\'s step, the cooperative\'s board, a piece of driftwood, the sunken moped and anchor, the reef, at the depth the design names', () => {
  const f = finds(), at = (id) => pick(f, id), near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  assert.ok(Math.abs(at('muelle').x - PIER.x) < 0.01 && Math.abs(at('muelle').z - PIER.z1) <= 3 && at('muelle').y === PIER.top, 'the pier\'s end: on the head\'s deck, at the pier\'s last metres');
  assert.ok(near(at('balsa'), RAFT) < 0.5 && at('balsa').y === RAFT.top, 'the raft: on the raft, at its deck\'s height');
  const tower = front.items.find((i) => i.group === 'lifeguard_tower'), towerSolid = front.solids.find((s) => s.id.startsWith('solid.tower'));
  assert.ok(near(at('libro'), tower) > 2 && near(at('libro'), tower) < 4 && !overlaps({ c: [at('libro').x, at('libro').z], r: 0.3 }, shapeOf(towerSolid)), 'the logbook: on the tower\'s step, not inside the tower');
  const board = front.items.find((i) => i.name === 'sign_cooperativa');
  assert.ok(board && near(at('pizarra'), board) > 0.5 && near(at('pizarra'), board) < 1.5 && at('pizarra').z > board.z, 'the cooperative\'s board: a reader\'s step in front of its plaque');
  const wood = front.items.filter((i) => i.group === 'driftwood'), bottle = at('botella');
  assert.ok(wood.some((w) => near(bottle, w) < 1.5) && bottle.z < coast.shoreZ(bottle.x) - 1 && coast.heightAt(bottle.x, bottle.z) > SEA + 0.1, 'the bottle: wedged in a piece of driftwood on the dry sand');
  for (const id of ['libro', 'pizarra', 'botella']) {                                                      // (discover.js cannot move a find clear of a collider south of z 100: its occupancy grid ends there)
    const d = at(id), hit = front.solids.find((s) => overlaps({ c: [d.x, d.z], r: 0.3 }, shapeOf(s)));
    assert.ok(!hit, `${id}: a spot a walker can stand on, not inside ${hit?.id}`);
  }
  const moped = pick(sea.sunken, 'moped'), anchor = pick(sea.sunken, 'anchor'), reef = sea.reef;
  for (const [id, thing, lo, hi] of [['moto', moped, 2.8, 3.1], ['ancla', anchor, 2.0, 2.4], ['coral', reef, 2.8, 3.2]]) {
    const d = at(id), depth = coast.depthAt(thing.x, thing.z);
    assert.ok(near(d, thing) < 0.01, `${id}: over the thing itself`);
    assert.ok(depth >= lo && depth <= hi, `${id}: ${depth.toFixed(2)} m down (the design says ${lo} to ${hi})`);
    assert.ok(Math.abs(d.y - (thing.y + DIVE_ABOVE)) < 0.15, `${id}: at a diver's height beside it, ${DIVE_ABOVE} m over the seabed (${d.y} against ${thing.y})`);
  }
});

test('buildBeachFinds: a world without a live beach gets none; a live one gets the plan\'s finds in ctx.world.extra, which discover.js registers', () => {
  const dead = { ctx: { plan, world: { beach: { live: false }, beachFront: front, beachSea: null } } };
  assert.deepEqual(buildBeachFinds(dead), [], 'no beach, no finds');
  assert.equal(dead.ctx.world.extra, undefined, 'and nothing is added to the extras');
  const world = { beach: { live: true }, beachFront: front, beachSea: sea, extra: [{ id: 'other' }] }, live = { ctx: { plan, world } };
  const got = buildBeachFinds(live);
  assert.deepEqual(got.map((d) => d.id).sort(), [...IDS].sort(), 'a live beach: the eight');
  assert.deepEqual(world.extra.map((d) => d.id), ['other', ...got.map((d) => d.id)], 'they join what was there, in plan order');
});

test('the page\'s world (the beach live): all eight are registered as w.<id> discoveries, a walker\'s step from where they were planned, none inside a prop or a guard collider, none anywhere near the spawn', async () => {
  const { ctx } = await buildData({ world: true, coast: !on('nocoast') });
  const wallDist = (w, x, z) => {
    const dx = w.x2 - w.x1, dz = w.z2 - w.z1, l2 = dx * dx + dz * dz, t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - w.x1) * dx + (z - w.z1) * dz) / l2)) : 0;
    return Math.hypot(x - (w.x1 + t * dx), z - (w.z1 + t * dz)) - (w.t ?? 0);
  };
  const walls = ctx.physics.walls.filter((w) => w.id === 'prop' || w.id === 'guard'), planned = finds();
  const extra = ctx.world.extra ?? [];
  assert.equal(new Set(extra.map((d) => d.id)).size, extra.length, 'no extra is registered twice');
  if (on('inwall')) { const d = ctx.discover.items.get('w.libro'), w = walls.reduce((a, b) => (wallDist(a, d.x, d.z) < wallDist(b, d.x, d.z) ? a : b)); d.x = w.x1; d.z = w.z1; }   // (the logbook moved onto the tower's wall)
  for (const id of IDS) {
    const d = ctx.discover.items.get('w.' + id), p = pick(planned, id);
    assert.ok(d, `w.${id} is a registered discovery`);
    assert.equal(d.kind, p.kind, `${id}: its kind`);
    assert.ok(Math.hypot(d.x - p.x, d.z - p.z) <= 3.05, `${id}: settled ${Math.hypot(d.x - p.x, d.z - p.z).toFixed(2)} m from where it was planned`);
    assert.ok(walls.every((w) => wallDist(w, d.x, d.z) >= 0.3), `${id}: stands inside a prop's or a guard's collider`);
    assert.ok(Math.hypot(d.x - ctx.plan.spawn.x, d.z - ctx.plan.spawn.z) > 30, `${id}: within thirty metres of the spawn`);
  }
  assert.ok(['w.cruz', 'w.torre', 'w.mirador'].every((id) => ctx.discover.items.has(id)), 'and the barrio\'s own discoveries are still registered');
});
