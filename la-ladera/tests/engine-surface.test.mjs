// What the player walks on (A1, js/engine/surface.js SurfaceMap, and Player._place which asks it), with the beach's ground: round 7, A5's ask (a). South of the plot's edge the coast answers
// (plan.coast.surfaceAt: promenade, stairs, ramp, sand, wet sand, the shallows, wading depth, the pier's and the raft's planks), and the audio plays the footstep of what it says
// (audio/foley.js SURFACES). Nothing north of the edge, outside the bay's walls, indoors, or on a plan without a coast changes: that is held here too.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-surface.test.mjs
// Every check has a deliberately broken input selected by C_SABOTAGE=<id>|all, and each must then FAIL (the pattern of core-sea.test.mjs):
//   kinds  wet sand sounds as dry sand         zone  the coast answers outside the bay's walls          order  a floor patch beats the coast        noy  the feet's height is not passed (the pier is the shallows)
//   scope  the coast answers on the plot's own side of its edge          indoors  the coast beats a room
import test from 'node:test';
import assert from 'node:assert/strict';
import './nice.mjs';
import * as THREE from 'three';
import { Physics } from '../js/core/physics.js';
import { Player } from '../js/engine/player.js';
import { SurfaceMap, COAST_KIND } from '../js/engine/surface.js';
import { SURFACES } from '../js/audio/foley.js';
import { createCoast, PIER, RAFT, BAY_X, Z0 } from '../js/world/coast.js';

const SAB = process.env.C_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);

/** The real SurfaceMap, or one with a deliberate fault when C_SABOTAGE asks. */
class Map_ extends SurfaceMap {
  coast(x, z, y) {
    if (on('noy')) y = undefined;
    if (on('zone') && Math.abs(x) > BAY_X && Math.abs(x) < BAY_X + 30) return super.coast(Math.sign(x) * BAY_X, z, y);
    if (on('scope') && z > Z0 - 6 && z <= Z0) return super.coast(x, Z0 + 1, y);
    const k = super.coast(x, z, y);
    return on('kinds') && k === 'wetsand' ? 'sand' : k;
  }
  kind(x, z, o = {}) {
    if (on('order') && o.onFloorPatch && !o.indoors) return 'concrete';
    if (on('indoors') && o.indoors) { const c = this.coast(x, z, o.y); if (c) return c; }
    return super.kind(x, z, o);
  }
}

const coast = createCoast({ seed: 1, edge: () => 0.1 });
const STREETS = [{ pts: [[0, 0], [30, 0]], width: 4, surface: 'asphalt' }, { pts: [[0, 60], [30, 60]], width: 3, kind: 'stair' }];
const PLAZAS = [{ poly: [[40, -5], [50, -5], [50, 5], [40, 5]], kind: 'plaza' }];
const withCoast = () => new Map_({ streets: STREETS, plazas: PLAZAS, coast });
const kindAt = (m, x, z, y, o = {}) => m.kind(x, z, { y, ...o });

test('the coast names what is underfoot, as the audio\'s footstep surfaces: the promenade is paved, the flights are stairs, the ramp is poured, then sand, wet sand, an ankle, a knee, the open water, the planks', () => {
  const m = withCoast();
  const want = [
    ['the promenade', 20, 104, undefined, 'cobble'], ['the promenade by the plot\'s edge', 0, 100.5, undefined, 'cobble'],
    ['a flight, on the sea wall', -90, 108.4, 0.1, 'stairs'], ['the axis flight, beside the pier', -9, 108.4, 0.1, 'stairs'],
    ['the ramp, on the sea wall', 2.2, 108.4, 0.1, 'concrete'], ['the ramp, down on the sand', 2.2, 112, -0.13, 'concrete'],
    ['dry sand', 50, 120, undefined, 'sand'], ['dry sand at the bay\'s east wall', 99.5, 130, undefined, 'sand'], ['dry sand at its west wall', -99.5, 130, undefined, 'sand'],
    ['wet sand', 0, 143, undefined, 'wetsand'], ['an ankle of water', 0, 148, undefined, 'shallow'], ['a knee of water', 0, 160, undefined, 'wade'],
    ['open water (the deepest a walker\'s feet can get: it sounds as wading does)', 0, 185, undefined, 'wade'], ['the swimming area', 0, 200, undefined, 'wade'],
    ['the pier\'s planks, feet on the deck', PIER.x, 150, PIER.top, 'jetty'], ['the pier\'s head', PIER.x + 1.9, PIER.z1 - 1, PIER.top, 'jetty'], ['the pier\'s foot, by the sea wall', PIER.x, 109, PIER.top, 'jetty'],
    ['the raft\'s planks', RAFT.x, RAFT.z, RAFT.top, 'jetty'], ['the raft\'s corner', RAFT.x + 1.4, RAFT.z - 1.4, RAFT.top, 'jetty'],
    ['under the pier, up to the knee: the ground answers, not the planks', PIER.x, 150, -1.0, 'shallow'], ['under the pier with no height given', PIER.x, 150, undefined, 'shallow'],
    ['under the raft, in the open water', RAFT.x, RAFT.z, -3, 'wade'], ['beside the pier, in the water', PIER.x + 3, 150, PIER.top, 'shallow'],
  ];
  for (const [what, x, z, y, kind] of want) assert.equal(kindAt(m, x, z, y), kind, `${what} (${x}, ${z}${y === undefined ? '' : ', feet at ' + y})`);
});

test('nothing changes where the coast is not asked: north of the plot\'s edge, outside the bay\'s walls, and indoors', () => {
  const m = withCoast();
  assert.equal(kindAt(m, 5, 0), 'asphalt', 'a street of the plot: its own surface'); assert.equal(kindAt(m, 15, 60), 'stairs', 'a flight of the plot');
  assert.equal(kindAt(m, 45, 0), 'cobble', 'a plaza'); assert.equal(kindAt(m, 20, 50), 'dirt', 'bare ground');
  assert.equal(kindAt(m, 20, Z0), 'dirt', `z ${Z0} is the plot's own edge: the coast starts south of it`);
  assert.equal(kindAt(m, 20, Z0 - 3, 0.1), 'dirt', 'three metres inside the plot'); assert.equal(kindAt(m, -6.5, Z0 - 3, PIER.top), 'dirt', 'the pier does not begin before the sea wall');
  for (const x of [BAY_X + 0.5, -BAY_X - 0.5, 130, -250]) assert.equal(kindAt(m, x, 130), 'dirt', `outside the bay's walls at x ${x}: the old answer`);
  assert.equal(kindAt(m, BAY_X, 130), 'sand', 'the wall itself is in the bay');
  const room = { finish: { floor: 'floor_pine' } };
  assert.equal(kindAt(m, 0, 120, 0, { indoors: true, room }), 'wood', 'a room on the sand has its own floor (a beach hut)'); assert.equal(kindAt(m, 20, 104, 0, { indoors: true, room: { finish: { floor: 'floor_tile_ceramic' } } }), 'tile', 'and one on the promenade');
});

test('on the coast the coast wins over a floor patch (the pier and the promenade are collider floors too), and elsewhere a floor patch is still a poured slab', () => {
  const m = withCoast();
  assert.equal(kindAt(m, PIER.x, 150, PIER.top, { onFloorPatch: true }), 'jetty', 'the pier is a floor patch for the kernel and planks for the ear');
  assert.equal(kindAt(m, 20, 104, 0.2, { onFloorPatch: true }), 'cobble', 'the promenade');
  assert.equal(kindAt(m, 60, 128, 0, { onFloorPatch: true }), 'sand', 'a kiosk\'s slab, a court, a lounger on the sand: it is the sand\'s sound this round');
  assert.equal(kindAt(m, 20, 50, 3, { onFloorPatch: true }), 'concrete', 'a roof in the plot');
  assert.equal(kindAt(m, 130, 130, 0, { onFloorPatch: true }), 'concrete', 'outside the bay');
});

test('without a coast (a plan that has none, no plan at all, a plan whose beach is skipped) every answer is the old one and nothing throws', () => {
  for (const plan of [null, undefined, {}, { streets: STREETS, plazas: PLAZAS }, { streets: STREETS, plazas: PLAZAS, coast: null }]) {
    const m = new Map_(plan);
    assert.equal(m.coast(0, 150, 0), null, 'no coast: nothing to say'); assert.equal(kindAt(m, 0, 150, 0), 'dirt', 'the old outdoor answer');
    assert.equal(kindAt(m, 0, 150, 0, { onFloorPatch: true }), 'concrete', 'a floor patch');
    assert.equal(kindAt(m, 5, 0), plan?.streets ? 'asphalt' : 'dirt', 'streets still work');
  }
  const m = new Map_(null); m.setPlan({ streets: STREETS, plazas: PLAZAS, coast }); assert.equal(kindAt(m, 0, 143), 'wetsand', 'a plan set later (the player gets the plan when it exists) brings the coast with it');
});

test('every word plan.coast.surfaceAt can answer, over the whole bay, has a footstep surface the audio plays, and every one of them is met', () => {
  const words = new Set(), kinds = new Set();
  for (let x = -BAY_X; x <= BAY_X; x += 0.5) for (let z = Z0 - 1; z <= 222; z += 0.25) for (const y of [undefined, PIER.top, RAFT.top]) {
    const w = coast.surfaceAt(x, z, y); if (w === null && z >= Z0) assert.fail(`no answer at (${x}, ${z})`);
    if (w === null) continue;
    words.add(w);
    assert.ok(Object.hasOwn(COAST_KIND, w), `surfaceAt says '${w}' at (${x}, ${z}) and COAST_KIND has no word for it`);
    kinds.add(COAST_KIND[w]);
  }
  assert.deepEqual([...words].sort(), ['deck', 'jetty', 'ramp', 'sand', 'shallow', 'stairs', 'swim', 'wade', 'wetsand'], 'all nine words were met: the walk covered the whole bay');
  for (const k of Object.values(COAST_KIND)) assert.ok(SURFACES.includes(k), `COAST_KIND names '${k}' and the audio has no footstep for it`);
  assert.deepEqual([...kinds].sort(), ['cobble', 'concrete', 'jetty', 'sand', 'shallow', 'stairs', 'wade', 'wetsand'], 'and the eight sounds of the beach');
  assert.ok(Object.isFrozen(COAST_KIND), 'the table is a constant');
  assert.ok(!Object.hasOwn(COAST_KIND, 'rock') && !Object.hasOwn(COAST_KIND, 'null'), 'no stray words');
});

// ---- the player asks with the feet's height ----------------------------------------------------------------------------------------------------------------------
function walker() {
  const physics = new Physics(); physics.setTerrain((x, z) => (z > Z0 ? coast.heightAt(x, z) : 0.1));
  const ctx = {
    physics, camera: new THREE.PerspectiveCamera(72, 16 / 9, 0.1, 900), settings: { v: {} }, buildings: new Map(), errors: [], running: true, plan: { streets: [], plazas: [], coast },
    events: { emit() {} }, ui: { toast() {}, prompt() {} }, interact: { update() {}, prompt: () => '', use() {} }, discover: { check() {} },
  };
  const p = new Player(ctx); ctx.player = p;
  p.surfaces = new Map_(null);
  if (on('noy')) { const kind = p.surfaces.kind.bind(p.surfaces); p.surfaces.kind = (x, z, o) => kind(x, z, { ...o, y: undefined }); }
  return p;
}

test('Player: the surface under the feet is the coast\'s, with the feet\'s own height: up on the pier it is planks, down in the water beside it the shallows, on the raft planks again', () => {
  const p = walker(), at = (x, z, y) => { p.teleport(x, z, { y }); return p.surface; };
  assert.equal(at(20, 104, 0.2), 'cobble', 'the promenade'); assert.equal(at(50, 120, -0.7), 'sand', 'the sand');
  assert.equal(at(0, 143, -1.1), 'wetsand', 'the wet sand'); assert.equal(at(0, 160, -2.0), 'wade', 'knee-deep');
  assert.equal(at(PIER.x, 150, PIER.top), 'jetty', 'on the pier\'s deck (its floor is a collider in the page: only the height tells it from the water under it)');
  assert.ok(Math.abs(p.s.y - PIER.top) < 0.05, `the premise: the feet stay up on the deck, at ${p.s.y}`);
  assert.equal(at(PIER.x, 150, -1.6), 'shallow', 'the same spot, down in the water'); assert.equal(at(RAFT.x, RAFT.z, RAFT.top), 'jetty', 'the raft'); assert.equal(at(RAFT.x + 4, RAFT.z, -3), 'wade', 'beside the raft');
  assert.equal(p.surfaces.plan.coast, coast, 'the player gave its map the plan it plays in');
});
