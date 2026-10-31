// Which materials never cast into the sun's shadow map (owner: A1). Pure node, no browser.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-shadowpolicy.test.mjs
// The browser half (the real scene: the terrain tiles, the floors, the witnesses that must still cast) is in engine-render.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MeshBuilder, Batcher } from '../js/core/mesh.js';
import { NO_CAST, castsShadow, baseKey, groupCasts } from '../js/core/shadowpolicy.js';
import engineDefs from '../js/engine/matdefs.js';
import worldDefs from '../js/world/matdefs.js';
import archDefs from '../js/arch/matdefs.js';
import interiorDefs from '../js/interiors/matdefs.js';

const DEFS = { ...engineDefs, ...worldDefs, ...archDefs, ...interiorDefs };
// The floors and screed the policy was measured on (.scratch/a1/shadow_exp2.mjs): pinned here so a rename or a new floor is a decision, not an accident.
const FLOORS = ['cement_screed', 'tile_ceramic_checker', 'floor_tile_checker', 'floor_tile_terracotta', 'floor_tile_ceramic', 'floor_cement', 'floor_cement_red', 'floor_pine', 'floor_laminate', 'floor_vinyl', 'floor_concrete_raw'];
// What the same measurement showed must keep casting (each one, switched off, changed hundreds to thousands of pixels of a 320 x 180 frame: a room without its ceiling is lit
// by the sun, a street without its walls loses its shade, a window without its frame loses the bars on the sill). Never add one of these to NO_CAST without measuring again.
// (ground_dirt is here for the earth banks and terraces of walls.js / hill.js: only the terrain TILES are switched off, by their group, in world/terrain.js.)
const MUST_CAST = ['ceiling_white', 'ceiling_pine', 'ceiling_concrete', 'wall_paint', 'wall_paint_worn', 'wall_tile', 'wall_gloss', 'wall_cement_raw', 'paint_peeling_soft', 'plaster_a', 'plaster_rough', 'concrete_bare',
  'concrete_formwork', 'brick_clay_hollow', 'brick_red_solid', 'stone_wall', 'glass', 'glass_dark', 'window_lit', 'frame_paint', 'rail_metal', 'grille_iron', 'roof_terrace', 'roof_tile_clay', 'corrugated_zinc', 'ground_dirt'];

test('the policy: every floor and screed material is off, every wall, ceiling, glass, frame, roof and prop that shades something is on', () => {
  assert.deepEqual([...NO_CAST].sort(), [...FLOORS].sort(), 'NO_CAST is exactly the measured floor set');
  for (const k of FLOORS) assert.equal(castsShadow(k), false, `${k} does not cast`);
  for (const k of MUST_CAST) assert.equal(castsShadow(k), true, `${k} casts`);
});

test('a tinted variant of a material (key#hex) follows its base material, and an unknown or empty key casts (the safe default)', () => {
  assert.equal(baseKey('plaster_a#9fc4e8'), 'plaster_a'); assert.equal(baseKey('floor_pine'), 'floor_pine'); assert.equal(baseKey('a#b#c'), 'a');
  assert.equal(castsShadow('floor_pine#aabbcc'), false); assert.equal(castsShadow('cement_screed#808080'), false);
  assert.equal(castsShadow('plaster_a#9fc4e8'), true); assert.equal(castsShadow('ceiling_white#ffffff'), true);
  for (const k of [undefined, null, '', 'no_such_material', 'floor', 'floor_']) assert.equal(castsShadow(k), true, `${JSON.stringify(k)} casts`);
});

test('guard: every NO_CAST key and every MUST_CAST witness is a material that exists, so a rename cannot switch the policy off (or a check go vacuous) in silence', () => {
  for (const k of NO_CAST) assert.ok(DEFS[k], `${k} is defined in a matdefs.js`);
  assert.deepEqual(MUST_CAST.filter((k) => !DEFS[k]), [], 'every witness is a real material');
});

const ctxOf = (opts) => ({ mat: () => new THREE.MeshBasicMaterial(), opts });
const built = (opts, o) => {
  const b = new MeshBuilder();
  for (const k of ['cement_screed', 'floor_pine#c0a070', 'wall_paint', 'ceiling_white', 'plaster_a#9fc4e8']) b.box(k, 0, 0, 0, 1, 1, 1);
  const parent = new THREE.Group(), meshes = b.flush(parent, ctxOf(opts), o);
  return Object.fromEntries(meshes.map((m) => [m.userData.matKey, m.castShadow]));
};

test('MeshBuilder.flush: a floor mesh is made without a shadow, the rest with one; a group that said cast:false stays off, whatever the material', () => {
  assert.deepEqual(built({}, {}), { cement_screed: false, 'floor_pine#c0a070': false, wall_paint: true, ceiling_white: true, 'plaster_a#9fc4e8': true });
  assert.deepEqual(built({}, { cast: true }), { cement_screed: false, 'floor_pine#c0a070': false, wall_paint: true, ceiling_white: true, 'plaster_a#9fc4e8': true });
  assert.deepEqual(built({}, { cast: false }), { cement_screed: false, 'floor_pine#c0a070': false, wall_paint: false, ceiling_white: false, 'plaster_a#9fc4e8': false });
});

test('?castall: with ctx.opts.castAll every mesh of a casting group casts again (the "before" of a before / after), and cast:false still wins; no ctx.opts at all is fine', () => {
  const all = { cement_screed: true, 'floor_pine#c0a070': true, wall_paint: true, ceiling_white: true, 'plaster_a#9fc4e8': true };
  assert.deepEqual(built({ castAll: true }, {}), all);
  assert.deepEqual(built({ castAll: true }, { cast: false }), Object.fromEntries(Object.keys(all).map((k) => [k, false])));
  assert.doesNotThrow(() => built(undefined, {}));
  assert.deepEqual(built(undefined, {}), { cement_screed: false, 'floor_pine#c0a070': false, wall_paint: true, ceiling_white: true, 'plaster_a#9fc4e8': true });
});

test('the 64 terrain tiles are groups that do not cast; every other group (the shells, the walls and banks, the props, the far terrain by its own say-so) still does', () => {
  for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) assert.equal(groupCasts(`world.terrain.${i}.${j}`), false, `tile ${i}.${j}`);
  for (const id of ['world.terrain.far', 'world.terrain.', 'world.terrain.1', 'world.terrain.1.2.3', 'world.terrains.1.2', 'x.world.terrain.1.2', 'world.walls', 'world.stairs', 'b01.ext', 'b01.int', 'props.tree.1.2', 'merged', 'world.streets', '', undefined]) assert.equal(groupCasts(id), true, `${JSON.stringify(id)}`);
});

test('Batcher.group: a terrain tile is made with cast false, an explicit cast:true wins over the policy, ?castall restores the tile, and the group stays the way it was made', () => {
  const mk = (opts) => new Batcher({ scene: new THREE.Group(), opts, mat: () => new THREE.MeshBasicMaterial() });
  const a = mk({});
  assert.equal(a.group('world.terrain.3.4').cast, false); assert.equal(a.group('world.walls').cast, true); assert.equal(a.group('b01.ext').cast, true);
  assert.equal(a.group('world.terrain.0.0', { cast: true }).cast, true, 'an explicit say-so beats the policy');
  assert.equal(a.group('props.x', { cast: false }).cast, false);
  assert.equal(a.group('world.terrain.3.4', { cast: true }).cast, false, 'the group already exists: a later call does not change it');
  const c = mk({ castAll: true });
  assert.equal(c.group('world.terrain.3.4').cast, true, '?castall: the tile casts again'); assert.equal(c.group('world.streets', { cast: false }).cast, false, '... but a group that asked for cast:false still does not');
  const n = mk(undefined);
  assert.equal(n.group('world.terrain.3.4').cast, false, 'no opts at all'); assert.equal(n.group('world.walls').cast, true);
  // and what flush makes of it: the tile's meshes carry the group's choice (a wall material in a tile group is still off: the group decides)
  const b = mk({}); b.builder('world.terrain.2.2').box('wall_paint', 0, 0, 0, 1, 1, 1); b.builder('world.walls').box('wall_paint', 0, 0, 0, 1, 1, 1); b.builder('world.walls').box('floor_pine', 0, 0, 0, 1, 1, 1);
  const flat = (id) => b.flush(id).map((m) => [m.userData.matKey, m.castShadow]);
  assert.deepEqual(flat('world.terrain.2.2'), [['wall_paint', false]]); assert.deepEqual(flat('world.walls'), [['wall_paint', true], ['floor_pine', false]]);
});
