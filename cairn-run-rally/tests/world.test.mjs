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
import { deriveRenderEnvironment } from '../src/renderer.js';
import { buildStage } from '../src/stage.js';
import { RallyWorld, deriveWeatherParticleProfile, isRouteChunkVisible, planBarrierVisuals, planCarVisual, planColliderVisuals, planWorldVisuals, routeAheadForView, terrainWidths } from '../src/world.js';

const kestrel = buildStage(KESTREL_STAGE);
const aurora = buildStage(AURORA_STAGE);
const expansionStages = EXPANSION_STAGES.map(stage => buildStage(stage));

function fakeRenderer() {
  const renderer = {
    deleted: [],
    createMesh(builder) { return { data: [...builder.data], triangles: builder.triangleCount }; },
    deleteMesh(mesh) { renderer.deleted.push(mesh); },
    draw() {},
    drawParticles() {},
    setEnvironment(environment) { renderer.environment = environment; }
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

test('authored weather derives distinct render conditions and particle materials', () => {
  const palette = { sky: [.34, .48, .52], farGrass: [.28, .35, .24], water: [.16, .3, .34] };
  const dry = deriveRenderEnvironment(palette, {
    id: 'clear-noon', precipitation: 'none', roadWetness: 0, wind: .08,
    timeOfDay: 'day', visibilityM: 2600
  });
  const storm = deriveRenderEnvironment(palette, {
    id: 'coastal-storm', precipitation: 'storm', roadWetness: .92, wind: .94,
    timeOfDay: 'dusk', visibilityM: 520
  });
  assert.notDeepEqual(dry.skyTop, storm.skyTop);
  assert.notDeepEqual(dry.fogColor, storm.fogColor);
  assert.notDeepEqual(dry.sunDirection, storm.sunDirection);
  assert.ok(storm.fogFar < dry.fogFar);
  assert.ok(storm.visibilityM < dry.visibilityM);

  const hexPalette = deriveRenderEnvironment({ sky: '#ff0000', terrain: '#00ff00', water: '#0000ff' });
  assert.ok(hexPalette.skyTop[0] > hexPalette.skyTop[1]);

  const profiles = [
    deriveWeatherParticleProfile({ precipitation: 'storm', roadWetness: .9 }, 'wet-tarmac'),
    deriveWeatherParticleProfile({ precipitation: 'snow', roadWetness: .2 }, 'snow'),
    deriveWeatherParticleProfile({ precipitation: 'none', roadWetness: 0 }, 'ice'),
    deriveWeatherParticleProfile({ precipitation: 'none', roadWetness: .7 }, 'mud'),
    deriveWeatherParticleProfile({ precipitation: 'none', roadWetness: 0 }, 'compact')
  ];
  assert.deepEqual(profiles.map(profile => profile.kind), ['spray', 'snow', 'ice', 'mud', 'dust']);
  assert.equal(new Set(profiles.map(profile => JSON.stringify(profile.color))).size, profiles.length);
});

test('RallyWorld forwards its authored environment to the renderer seam', () => {
  const renderer = fakeRenderer();
  const world = new RallyWorld(renderer, expansionStages[1], 'low', {
    region: EXPANSION_REGIONS[1], weather: { ...EXPANSION_WEATHER[1], visibilityM: 610 }
  });
  assert.equal(renderer.environment.weatherId, EXPANSION_WEATHER[1].id);
  assert.equal(renderer.environment.visibilityM, 610);
  assert.deepEqual(renderer.environment.palette, world.colors);
  world.dispose();
});

test('distant overhead route chunks cannot become floating terrain ribbons', () => {
  const camera = { position: { x: 0, y: 52, z: 0 } };
  const limits = { maxSq: 850 ** 2, routeBehind: 460, routeAhead: 660 };
  assert.equal(isRouteChunkVisible({ s0: 2460, s1: 2580, x: 90, y: 88, z: 40 }, camera, 2140, limits), false);
  assert.equal(isRouteChunkVisible({ s0: 2230, s1: 2350, x: 90, y: 88, z: 40 }, camera, 2140, limits), true);
  assert.equal(isRouteChunkVisible({ s0: 2460, s1: 2580, x: 90, y: 64, z: 40 }, camera, 2140, limits), true);
});

test('terrain bands narrow through hairpins instead of folding over the road', () => {
  const straight = terrainWidths({ curvature: 0 }, 100, 1);
  const hairpin = terrainWidths({ curvature: -0.021 }, 100, 1);
  assert.ok(hairpin.far < straight.far * 0.25);
  assert.ok(hairpin.near <= 10);
  assert.ok(hairpin.near < hairpin.far);
  assert.ok(hairpin.far >= 11);
});

test('camera route look-ahead contracts before a hairpin', () => {
  const rift = expansionStages[0];
  assert.ok(routeAheadForView(rift, 2142, 660) < 300);
  assert.equal(routeAheadForView(rift, 400, 660), 660);
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
