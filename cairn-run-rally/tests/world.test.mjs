import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AURORA_FOREST,
  AURORA_STAGE,
  AURORA_WEATHER,
  CAIRN_R4,
  KESTREL_RIDGE,
  KESTREL_STAGE,
  LUMEN_F2,
  RIDGE_WEATHER
} from '../src/content.js';
import { EXPANSION_REGIONS, EXPANSION_STAGES, EXPANSION_WEATHER } from '../src/content-expansion.js';
import { buildStage } from '../src/stage.js';
import { RallyWorld, planBarrierVisuals, planCarVisual, planColliderVisuals, planWorldVisuals } from '../src/world.js';

const kestrel = buildStage(KESTREL_STAGE);
const aurora = buildStage(AURORA_STAGE);
const expansionStages = EXPANSION_STAGES.map(stage => buildStage(stage));

function fakeRenderer() {
  const renderer = {
    deleted: [],
    createMesh(builder) { return { data: [...builder.data], triangles: builder.triangleCount }; },
    deleteMesh(mesh) { renderer.deleted.push(mesh); },
    draw() {},
    drawParticles() {}
  };
  return renderer;
}

test('world planning follows region scenery and route metadata', () => {
  const kestrelPlan = planWorldVisuals(kestrel, KESTREL_RIDGE, RIDGE_WEATHER, 'low');
  const auroraPlan = planWorldVisuals(aurora, AURORA_FOREST, AURORA_WEATHER, 'low');
  assert.ok(kestrelPlan.ranges.some(range => range.type === 'stone-wall'));
  assert.ok(kestrelPlan.ranges.some(range => range.type === 'bridge'));
  assert.equal(auroraPlan.ranges.some(range => range.type === 'stone-wall' || range.type === 'bridge'), false);
  for (const type of ['lake', 'narrow-forest', 'jump-board', 'granite-outcrop']) {
    assert.ok(auroraPlan.ranges.some(range => range.type === type), `missing Aurora ${type}`);
  }
  for (const type of ['lakeside', 'narrow-spruce', 'jump', 'forest']) assert.ok(auroraPlan.landmarks.includes(type), `missing Aurora landmark ${type}`);
  assert.deepEqual(auroraPlan.barrierTypes, ['timber-fence', 'lake-fence', 'spruce-rail']);
  assert.ok(auroraPlan.visibilityM > kestrelPlan.visibilityM);
  assert.equal(auroraPlan.sceneryStride, 4);
  assert.equal(planWorldVisuals(aurora, AURORA_FOREST, AURORA_WEATHER, 'low').ranges.length, auroraPlan.ranges.length);
  const visible = planBarrierVisuals(aurora);
  assert.equal(visible.length, aurora.barriers.length);
  assert.deepEqual(visible.map(item => [item.id, item.type, item.s, item.x, item.z]), aurora.barriers.map(item => [item.id, item.type, item.s, item.x, item.z]));
  assert.ok(visible.every(item => item.visible && item.size.x > 0 && item.size.y > 0 && item.size.z > 0));
  assert.equal(planColliderVisuals(aurora).length, aurora.colliders.length);
});

test('selected car profile changes the pure visual shape', () => {
  const cairn = planCarVisual(CAIRN_R4);
  const lumen = planCarVisual(LUMEN_F2);
  assert.equal(cairn.silhouette, 'rally-hatch');
  assert.equal(lumen.silhouette, 'compact-hatch');
  assert.ok(cairn.length > lumen.length);
  assert.ok(cairn.wheelRadius > lumen.wheelRadius);
  assert.notDeepEqual(cairn.body, lumen.body);
  assert.notEqual(cairn.spoiler, lumen.spoiler);
});

test('every expansion silhouette has a distinct low-poly proportion recipe', () => {
  const silhouettes=['short-coupe','classic-coupe','long-sedan','widebody-special'];
  const plans=silhouettes.map(silhouette=>planCarVisual({...CAIRN_R4,id:silhouette,silhouette}));
  const fingerprints=plans.map(plan=>JSON.stringify([plan.length,plan.width,plan.bodyHeight,plan.roofHeight,plan.cabinStart,plan.cabinEnd,plan.spoiler]));
  assert.equal(new Set(fingerprints).size,silhouettes.length);
  assert.ok(plans.every(plan=>plan.silhouette!=='rally-hatch'));
});

test('RallyWorld accepts selected content and keeps old constructor compatibility', () => {
  const renderer = fakeRenderer();
  const auroraWorld = new RallyWorld(renderer, aurora, 'low', {
    region: AURORA_FOREST, weather: AURORA_WEATHER, car: LUMEN_F2
  });
  assert.equal(auroraWorld.region.id, AURORA_FOREST.id);
  assert.equal(auroraWorld.weather.id, AURORA_WEATHER.id);
  assert.equal(auroraWorld.carVisual.silhouette, LUMEN_F2.silhouette);
  assert.ok(auroraWorld.carBody.triangles > 0);
  assert.equal(auroraWorld.visualPlan.ranges.some(range => range.type === 'bridge'), false);

  const defaultWorld = new RallyWorld(renderer, kestrel, 'low');
  assert.equal(defaultWorld.region.id, 'kestrel-ridge');
  assert.equal(defaultWorld.weather.id, 'ridge-mist');
  assert.equal(defaultWorld.carVisual.silhouette, 'rally-hatch');
});

test('metadata fallback does not turn every lakeside route into Aurora', () => {
  const renderer = fakeRenderer();
  const genericLake = { ...aurora, id: 'generic-lake-stage', regionId: 'generic-lake-region' };
  const world = new RallyWorld(renderer, genericLake, 'low');
  assert.equal(world.region.id, 'generic-lake-region');
});

test('expansion scenery kits produce distinct metadata-driven landmark plans', () => {
  const expectedKits = [
    ['savannah', 'acacia', 'water-splash', 'washboard', 'rift-escarpment', 'finish-gate'],
    ['cedar-tunnel', 'retaining-wall', 'autumn-maple', 'mountain-stream', 'paper-lantern', 'pass-gate'],
    ['sea-cliff', 'village-square', 'stone-retaining-wall', 'olive-grove', 'safe-crowd-line', 'coastal-gate'],
    ['eucalyptus', 'red-gravel', 'cattle-grid', 'rough-verge', 'dust-bowl', 'storm-gate']
  ];
  const plans = expansionStages.map((stage, index) => planWorldVisuals(stage, EXPANSION_REGIONS[index], EXPANSION_WEATHER[index], 'low'));
  for (const [index, plan] of plans.entries()) {
    for (const kitId of expectedKits[index]) {
      assert.ok(plan.landmarks.includes(kitId), `missing planned landmark ${kitId}`);
      assert.ok(plan.ranges.some(range => range.type === kitId), `missing visible range ${kitId}`);
    }
  }
  const fingerprints = plans.map(plan => JSON.stringify({ kit: plan.kit, landmarks: plan.landmarks, ranges: plan.ranges.map(range => range.type) }));
  assert.equal(new Set(fingerprints).size, plans.length);
});

test('expansion worlds construct bounded, distinct landmark meshes', () => {
  const renderer = fakeRenderer();
  const fingerprints = [];
  for (const [index, stage] of expansionStages.entries()) {
    const world = new RallyWorld(renderer, stage, 'low', {
      region: EXPANSION_REGIONS[index],
      weather: EXPANSION_WEATHER[index]
    });
    assert.ok(world.visualPlan.landmarks.length >= 6);
    assert.ok(world.chunks.every(chunk => chunk.triangles > 0));
    fingerprints.push(JSON.stringify([world.visualPlan.landmarks, world.visualPlan.ranges.map(range => range.type), world.chunks.map(chunk => chunk.triangles)]));
    world.dispose();
  }
  assert.equal(new Set(fingerprints).size, expansionStages.length);
});

test('disposing a selected world releases every stage-specific mesh exactly once', () => {
  const renderer = fakeRenderer();
  const world = new RallyWorld(renderer, aurora, 'low', {
    region: AURORA_FOREST, weather: AURORA_WEATHER, car: LUMEN_F2
  });
  const expected = 5 + world.chunks.length;
  assert.equal(world.dispose(), expected);
  assert.equal(renderer.deleted.length, expected);
  assert.equal(new Set(renderer.deleted).size, expected);
  assert.equal(world.dispose(), 0);
  assert.equal(renderer.deleted.length, expected);
});
