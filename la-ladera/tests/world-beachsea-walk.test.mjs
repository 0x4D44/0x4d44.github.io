// The sea's colliders, walked with the player's own kernel (A5, js/world/beachsea.js seaColliders, dev/FEATURE-BEACH.md phase 2b): a walker is put on the pier, on the sand beside it, on the seabed under it
// and on the raft, and made to walk. Pure Node: the physics world holds the coast's ground and its own colliders and the sea's, nothing else (the whole-world sweeps are tests/stuck.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-beachsea-walk.test.mjs
// Every check has a deliberately broken input selected by BW_SABOTAGE=<id>|all, and each must then FAIL:
//   nofloor  the pier has no deck to stand on        norail  the pier has no rails              low      the rails are 0.3 m high           nopile   the piles have no colliders
//   shut     the head's gap is shut                  noraft  the raft has no skirt              nohull   the moored boats have no hull      noroom   the pier's deck is 1.4 m over the sand and not 0.2
//   nocap    nothing closes the underside's south end                                          noskirt  nothing closes the underside's edges
import './nice.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { Physics } from '../js/core/physics.js';
import { PIER, RAFT, coastColliders } from '../js/world/coast.js';
import { planSea, seaColliders, RAIL } from '../js/world/beachsea.js';

const SAB = process.env.BW_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029, CONF = { radius: 0.3, height: 1.78, stepUp: 0.5 };

const ctx = createContext({ seed: SEED, headless: true });
const plan = generatePlan(ctx), coast = plan.coast, H = coast.heightAt;

/** The physics world the checks walk in: the coast's ground and colliders, and the sea's (broken, when BW_SABOTAGE asks). `bare`: without the pier's rails, whose feet (0.4 m under the deck) stop a wader
 *  at the pier's sides by themselves where the head is higher than that: the skirt's own work is seen in a world that has none. */
function world(bare = false) {
  const s = planSea(coast);
  if (bare) s.walls = s.walls.filter((w) => w.id !== 'pier.rail');
  if (on('nofloor')) s.floors = s.floors.filter((f) => f.id !== 'pier.deck');
  if (on('norail')) s.walls = s.walls.filter((w) => w.id !== 'pier.rail');
  if (on('low')) for (const w of s.walls) if (w.id === 'pier.rail') w.y1 = PIER.top + 0.3;
  if (on('nopile')) s.walls = s.walls.filter((w) => w.id !== 'pier.pile');
  if (on('shut')) s.walls.push({ id: 'pier.rail', x1: PIER.x - 0.6, z1: PIER.z1 - RAIL.inset, x2: PIER.x + 0.6, z2: PIER.z1 - RAIL.inset, t: RAIL.t, y0: PIER.top - 0.4, y1: PIER.top + RAIL.h });
  if (on('noraft')) s.walls = s.walls.filter((w) => w.id !== 'raft.skirt');
  if (on('nohull')) s.walls = s.walls.filter((w) => w.id !== 'boat.moored');
  if (on('noroom')) for (const f of s.floors) if (f.id === 'pier.deck') f.y = PIER.top + 1.2;
  if (on('nocap')) s.walls = s.walls.filter((w) => !(w.id === 'pier.skirt' && w.z1 === w.z2));
  if (on('noskirt')) s.walls = s.walls.filter((w) => !(w.id === 'pier.skirt' && w.x1 === w.x2));
  const p = new Physics();
  p.setTerrain(plan.heightAt);
  coastColliders(p, coast);
  seaColliders(p, s);
  return p;
}
const physics = world(), bare = world(true);

const walker = (x, z, y = H(x, z)) => ({ x, y, z, vy: 0, onGround: true });
/** Walk `metres` along (ux, uz) in steps of 5 cm, one kernel frame each. Returns the state: where it ends is the evidence (the kernel slides along a wall and pushes out of one; `blocked` is only for a dead end). */
function walk(s, ux, uz, metres, ph = physics) {
  for (let i = 0; i < Math.round(metres / 0.05); i++) ph.move(s, ux * 0.05, uz * 0.05, 1 / 60, CONF);
  return s;
}

test('the pier is a way: from the stair\'s top a walker goes straight to the head on the deck, at the deck\'s height all the way, and out through the gap in the rail', () => {
  const s = walker(PIER.x, 105.5);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 2400 && s.z < PIER.z1 + 0.6; i++) {
    physics.move(s, 0, 0.05, 1 / 60, CONF);
    if (s.z > PIER.z0 + 1 && s.z < PIER.z1 - 0.3) { lo = Math.min(lo, s.y); hi = Math.max(hi, s.y); }
    if (s.blocked) break;
  }
  assert.ok(s.z > PIER.z1 + 0.5, `the walker got to ${s.z.toFixed(2)} (the pier ends at ${PIER.z1}): through the gap in the head's rail`);
  assert.ok(lo > PIER.top - 0.01 && hi < PIER.top + 0.01, `and on the deck all the way (feet ${lo.toFixed(3)} to ${hi.toFixed(3)}; the deck is ${PIER.top})`);
});

test('the rails keep a walker on the deck and the sand off it: sideways it stops at the rail, from the sand beside the pier it cannot step on or go under the edge', () => {
  const east = walk(walker(PIER.x, 140, PIER.top), 1, 0, 5), west = walk(walker(PIER.x, 140, PIER.top), -1, 0, 5);
  assert.ok(east.x > PIER.x + 0.95 && east.x < PIER.x + 1.2, `east: stopped at ${(east.x - PIER.x).toFixed(2)} m from the axis (the rail is at 1.43; a walker's body is 0.3 m)`);
  assert.ok(west.x < PIER.x - 0.95 && west.x > PIER.x - 1.2, `west: stopped at ${(west.x - PIER.x).toFixed(2)} m from the axis`);
  assert.ok(Math.abs(east.y - PIER.top) < 0.01 && Math.abs(west.y - PIER.top) < 0.01, 'still on the deck');
  const sand = walk(walker(PIER.x - 4, 125), 1, 0, 4);
  assert.ok(sand.x < PIER.x - 1.5 && sand.x > PIER.x - 2.1, `from the sand: stopped at ${(sand.x - PIER.x).toFixed(2)} m from the axis, outside the deck's edge (1.5), not under it`);
  const wings = walk(walker(PIER.x + 1.0, 189.0, PIER.top), 0, 1, 3);
  assert.ok(wings.z < PIER.z1 - 0.3 && wings.z > PIER.z1 - 0.7, `the head's front rail stops a walker at ${wings.z.toFixed(2)} (the edge is ${PIER.z1})`);
});

test('under the pier: a diver on the seabed passes between the bents, under the deck, and is stopped by a pile', () => {
  const bed = (x, z) => H(x, z);
  const between = walk(walker(PIER.x - 3, 160, bed(PIER.x - 3, 160)), 1, 0, 6);
  assert.ok(between.x > PIER.x + 2, `between two bents (z 160) the diver goes under the deck and out the other side (${(between.x - PIER.x).toFixed(2)} m)`);
  const pile = walk(walker(PIER.x - 3, 162, bed(PIER.x - 3, 162)), 1, 0, 6);
  assert.ok(pile.x < PIER.x - 1.2 - 0.17 && pile.x > PIER.x - 1.2 - 0.17 - 0.45, `on a bent (z 162) a pile stops it at ${(pile.x - PIER.x).toFixed(2)} m from the axis (the pile is at -1.2)`);
});

test('the underside is closed where the eyes would be in the slab: from the south a wader stops at the cap, from the side at the skirt; beyond the cap the pier is open to walk under, and a walker on the deck is stopped by neither', () => {
  const zc = planSea(coast).walls.find((w) => w.id === 'pier.skirt' && w.z1 === w.z2).z1;
  const south = walk(walker(PIER.x, zc + 5), 0, -1, 6);
  assert.ok(south.z > zc + 0.3 && south.z < zc + 0.8, `from the south on the axis a wader stops at ${(south.z - zc).toFixed(2)} m from the cap (z ${zc}; its half is 0.05, the body 0.3)`);
  const side = walk(walker(PIER.x - 4, zc - 2), 1, 0, 8, bare);
  assert.ok(side.x < PIER.x - 1.5 && side.x > PIER.x - 2.1, `from the side, 2 m before the cap (where the head would just clear the deck; no rail to help): stopped at ${(side.x - PIER.x).toFixed(2)} m from the axis, outside the deck's edge (1.5), not under it`);
  const open = walk(walker(PIER.x - 4, zc + 3), 1, 0, 8, bare);
  assert.ok(open.x > PIER.x + 2, `2 m beyond the cap it goes under the deck and out the other side (${(open.x - PIER.x).toFixed(2)} m)`);
  const deck = walk(walker(PIER.x, zc, PIER.top), 0, 1, 3);
  assert.ok(deck.z > zc + 2.8 && Math.abs(deck.y - PIER.top) < 0.01, `on the deck, above the cap, a walker is not stopped by the skirt (z ${deck.z.toFixed(2)}, feet ${deck.y.toFixed(3)})`);
});

test('the raft: a walker on its deck stands at the deck\'s height and can walk off its edge; a diver on the seabed is stopped by the skirt and cannot go under it', () => {
  const deck = walker(RAFT.x - 1.2, RAFT.z, RAFT.top);
  walk(deck, 1, 0, 1.2);
  assert.ok(Math.abs(deck.y - RAFT.top) < 0.01, `on the raft's deck (${deck.y.toFixed(3)} of ${RAFT.top})`);
  walk(deck, 1, 0, 1.2);
  assert.ok(deck.x > RAFT.x + 1.1, `and it walks off the edge: the skirt does not stop a walker on the deck (x ${(deck.x - RAFT.x).toFixed(2)} from the centre)`);
  const diver = walk(walker(RAFT.x, RAFT.z + 6, H(RAFT.x, RAFT.z + 6)), 0, -1, 6);
  assert.ok(diver.z > RAFT.z + 1.5 + 0.05 && diver.z < RAFT.z + 1.5 + 0.05 + 0.45, `the diver is stopped at ${(diver.z - RAFT.z).toFixed(2)} m from the raft's centre (the edge is at 1.5), not under it`);
});

test('a moored boat is solid: a diver walking at the lancha\'s stern stops at its hull', () => {
  const diver = walk(walker(-3, 180, H(-3, 180)), 0, -1, 8);
  assert.ok(diver.z > 175.4 && diver.z < 176.1, `stopped at z ${diver.z.toFixed(2)} (the stern is at 175.5)`);
});
