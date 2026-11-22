import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildLightField, LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE } from '../../core/light-field.ts';
import type { LightField } from '../../core/light-field.ts';
import { lightSourcesFor, registerLights } from '../../core/light-sources.ts';
import { testRoadLight as light } from '../../core/tests/light-field-fixture.ts';
import { skyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { squeezeGlslText } from '../../vite.config.ts';
import { REFERENCE } from '../src/atmosphere.ts';
import { addCity } from '../src/city.ts';
import { addRoofShade } from '../src/lighting.ts';
import { createNightLightLayer, nightLightGLSL } from '../src/night-light-layer.ts';
import { EUSTON_P1_ROW } from '../src/night-lighting-p1.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { Glsl, Sampler } from './glsl.ts';
import type { Value } from './glsl.ts';

const up = [0, 1, 0];
const zero = [0, 0, 0];
function probe(field: LightField, cap = field.spec.cap, roof = 0, level = 1) {
  const program = new Glsl('float coverGroundAt(vec3 p) { return ' + roof.toFixed(3) + '; }\n' + nightLightGLSL(cap));
  const vars: Record<string, Value> = {
    uNightLightLevels: [level, 0],
    uNightLightGridRect: [...field.origin, field.columns, field.rows],
    uNightLightCellM: field.spec.cellM,
    uNightLightData: new Sampler(field.data), uNightLightDataWidth: field.dataWidth,
    uNightLightGrid: new Sampler(field.grid), uNightLightGridWidth: field.gridWidth,
  };
  const fns = { texelFetch: (sampler: Value, ij: Value, lod: Value) => {
    assert.equal(lod, 0);
    assert.ok(sampler instanceof Sampler && Array.isArray(ij));
    const data = sampler.data as Float32Array | Uint8Array;
    const stride = data instanceof Float32Array ? field.dataWidth : field.gridWidth;
    const offset = 4 * (ij[1]! * stride + ij[0]!);
    assert.ok(offset >= 0 && offset + 4 <= data.length);
    return [...data.subarray(offset, offset + 4)].map(v => data instanceof Uint8Array ? v / 255 : v);
  } };
  return {
    at: (p: number[], n = up, facade = false) => program.call('nightLightAt', [p, n, facade, [0, 0, 0]], { vars, fns }) as number[],
    ground: (p: number[], albedo: number[], state = weatherFrame('clear'), facing = .5) => {
      const env = { vars: { ...vars, nightP: p, nightN: up, diffuse: albedo, normal: up,
        vViewPosition: [0, facing, Math.sqrt(1 - facing ** 2)],
        uNightLightLevels: [level, state.weather.snowCover],
        uNightLightWeather: [state.weather.wet, state.rig.fogAmount] }, fns };
      return program.evaluate(groundReceipt(), env) as number[];
    },
  };
}

test('P1 road lobe, backward reach, smooth carriageway join, inverse square and cutoff run in GLSL', t => {
  const at = probe(buildLightField([light()], LIGHT_GRID_DESKTOP)).at;
  const peak = at([4, 0, 0]);
  assert.ok(peak[0]! > .75 && peak[0]! < .85 && peak[0]! > peak[1]! && peak[1]! > peak[2]!, JSON.stringify(peak));
  const high = at([2, 5.075, 0])[0]!;
  assert.ok(Math.abs(high / peak[0]! - 4) < .001, 'doubling distance quarters irradiance');
  assert.ok(at([4, 0, 10])[0]! > at([14, 0, 0])[0]!);
  const join = [-2.99, -3, -3.01, -6, -12].map(x => at([x, 0, 0])[0]!);
  assert.ok(join.every(v => v > .05) && Math.abs(join[0]! - join[2]!) < .01, String(join));
  assert.deepEqual(at([4, 0, 35]), zero);
  assert.deepEqual(at([4, 0, 0], [0, -1, 0]), zero);
  t.diagnostic(JSON.stringify({ peak, high, join }));
});

test('open and under-roof lights use complementary cover and daylight has no field contribution', () => {
  for (const cover of ['open', 'under-roof'] as const) {
    const field = buildLightField([{ ...light(), cover }], LIGHT_GRID_DESKTOP);
    const p = [4, 0, 0], bright = probe(field, 16, cover === 'open' ? 0 : 1).at(p)[0]!;
    assert.ok(bright > .75 && bright < .85);
    assert.deepEqual(probe(field, 16, cover === 'open' ? 1 : 0).at(p), zero);
    assert.ok(Math.abs(probe(field, 16, .25).at(p)[0]! / bright - (cover === 'open' ? .75 : .25)) < 1e-8);
    assert.deepEqual(probe(field, 16, 0, 0).at(p), zero);
  }
});

test('the GLSL loop caps candidate reads even if the cell header advertises more', () => {
  for (const spec of [LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE]) {
    const sources = Array.from({ length: spec.cap + 3 }, (_, i) => light(String(i)));
    const field = buildLightField(sources, { ...spec, cap: sources.length });
    const p = [4, 0, 0];
    const single = probe(buildLightField(sources.slice(0, 1), spec)).at(p)[0]!;
    const capped = probe(field, spec.cap).at(p)[0]!;
    assert.ok(single > .75 && single < .85 && Math.abs(capped / single - spec.cap) < 1e-8, String(capped));
  }
});

test('facade spill stays close to each fitting and winter ground scatter is independent of view angle', t => {
  const a = { ...light('a'), halfSpace: { normal: [1, 0, 0] as const, offset: -8 } };
  const p = probe(buildLightField([a, light('b', [0, 10.15, 32])], LIGHT_GRID_DESKTOP));
  const normal = [1, 0, 0];
  const acrossRoad = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const acrossRoadLit = acrossRoad.at([-25, 6, 0], normal, true)[0]!;
  const acrossRoadDark = acrossRoad.at([-25, 6, 13], normal, true)[0]!;
  assert.ok(acrossRoadLit > .2 && acrossRoadDark === 0, JSON.stringify({ acrossRoadLit, acrossRoadDark }));
  const near = p.at([-7.99, 8, 0], normal, true)[0]!;
  const between = p.at([-7.99, 8, 16], normal, true)[0]!;
  assert.ok(near > .65 && between < near * .15, JSON.stringify({ near, between }));
  assert.deepEqual(p.at([-8.1, 8, 0], normal, true), zero);
  assert.deepEqual(p.at([-7.99, 8, 0], [-1, 0, 0], true), zero);
  const road = [4, 0, 0];
  const ground = [.078, .078, .078];
  const lightAtRoad = p.at(road)[0]!;
  assert.equal(p.ground(road, ground)[0], lightAtRoad * ground[0]!);
  const winter = weatherFrame('snow');
  const snowGrazing = p.ground(road, ground, winter, .015)[0]!;
  const snowOblique = p.ground(road, ground, winter, .5)[0]!;
  assert.ok(Math.abs(snowGrazing / lightAtRoad - .0474825) < 1e-10 && snowGrazing === snowOblique);
  t.diagnostic(JSON.stringify({ near, between, acrossRoadLit, acrossRoadDark, snowGrazing, snowOblique }));
});

function frame(elevationDeg: number, snowCover = 0) {
  return { timeMs: 0, sun: { ...solarPosition(0), elevationDeg },
    weather: { ...CLEAR_STATE, snowCover },
    rig: { ...skyRig(elevationDeg, 0, CLEAR_STATE, REFERENCE), lampLevel: 1 } };
}
function compile(material: THREE.Material, squeezed = false) {
  const shader = { ...THREE.ShaderLib.lambert, uniforms: {} as Record<string, THREE.IUniform> };
  if (squeezed) shader.fragmentShader = squeezeGlslText(shader.fragmentShader) ?? shader.fragmentShader;
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

// Evaluate the expression installed on the actual ground receiver, supplying
// the linear albedo that the preceding texture and weather stages produce.
let receipt: string | undefined;
function groundReceipt(): string {
  if (receipt) return receipt;
  const scene = new THREE.Scene();
  const material = new THREE.MeshLambertMaterial();
  addRoofShade(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  mesh.name = 'city-asphalt';
  scene.add(mesh);
  const street = createStreetLights([]);
  const unregister = registerLights(scene, [light()]);
  const layer = createNightLightLayer(scene, LIGHT_GRID_DESKTOP);
  try {
    layer.register(street, null);
    layer.scan();
    layer.setFrame(scene, frame(-20));
    const shader = compile(mesh.material).fragmentShader;
    const contribution = shader.match(/reflectedLight\.directDiffuse \+= (nightLightAt[^;]+);/);
    assert.ok(contribution);
    receipt = contribution[1]!.replace('material.diffuseColor', 'diffuse');
    return receipt;
  } finally {
    layer.dispose();
    unregister();
    street.dispose();
    material.dispose();
    mesh.geometry.dispose();
  }
}

function weatherFrame(name: string) {
  const weather = weatherState(forcedObservation(name));
  return { ...frame(-20), weather, rig: skyRig(-20, 0, weather, REFERENCE) };
}

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../src/data/kx-${name}.json`, import.meta.url), 'utf8')) as T;
}

let cityLights: ReturnType<typeof lightSourcesFor> | undefined;
function kingsCrossLights() {
  if (cityLights) return cityLights;
  const scene = new THREE.Scene();
  const terrain = createTerrain(readFixture<TerrainFile>('terrain'));
  const city = addCity(scene, readFixture<KxData>('track'), readFixture<CityData>('city'), { terrain, nightEffects: true });
  cityLights = lightSourcesFor(scene).filter(source => source.tags.includes('road') || source.tags.includes('mast'));
  city.dispose();
  return cityLights;
}

test('forecourt masts light the foot softly and equally in every horizontal direction', t => {
  const mast = kingsCrossLights().find(source => source.tags.includes('mast'))!;
  const meter = probe(buildLightField([mast], LIGHT_GRID_DESKTOP));
  const [x, , z] = mast.pos, y = mast.footY;
  const samples = [[x, y, z], [x + 3, y, z], [x - 3, y, z], [x, y, z + 3], [x, y, z - 3]];
  const paving = [['clear', .40], ['rain', .27], ['fog', .36], ['snow', .66]] as const;
  const byWeather = Object.fromEntries(paving.map(([weather, albedo]) => [weather, samples.map(p =>
    meter.ground(p, [albedo, albedo, albedo], weatherFrame(weather))[0]!)]));
  t.diagnostic(JSON.stringify({ mast: mast.pos, byWeather }));
  for (const readings of Object.values(byWeather)) {
    const [foot, ...around] = readings;
    assert.ok(foot! > .001 && foot! < .11, String(readings));
    assert.ok(around.every(v => v > .75 * foot! && v < foot! && Math.abs(v - around[0]!) < 1e-5), String(readings));
  }
});

test('Euston Road has bounded warm pools and a dark gap on the actual lamp row', t => {
  const sources = kingsCrossLights();
  const desktop = buildLightField(sources, LIGHT_GRID_DESKTOP);
  const mobile = buildLightField(sources, LIGHT_GRID_MOBILE);
  const meter = probe(desktop);
  const [post, nextPost] = EUSTON_P1_ROW;
  const a = sources.find(source => source.id === post.id)!;
  const b = sources.find(source => source.id === nextPost.id)!;
  const at = (x: number, z: number, y: number) => meter.ground([x, y, z], [.078, .078, .078]);
  const inRoad = (source: typeof a) => [source.pos[0] + Math.cos(source.yaw) * 4, source.pos[2] - Math.sin(source.yaw) * 4];
  const [ax, az] = inRoad(a), [bx, bz] = inRoad(b);
  const foot = at(post.x, post.z, a.footY);
  const underHead = at(a.pos[0], a.pos[2], a.footY);
  const pool = at(ax!, az!, a.footY);
  const gap = at((ax! + bx!) / 2, (az! + bz!) / 2, (a.footY + b.footY) / 2);
  const surrounding = sources.filter(source => Math.hypot(source.pos[0] - (ax! + bx!) / 2, source.pos[2] - (az! + bz!) / 2) < 32);
  const contributions = surrounding.map(source => ({ id: source.id, pos: source.pos, yaw: source.yaw, optic: source.optic, gap:
    probe(buildLightField([source], LIGHT_GRID_DESKTOP)).ground([(ax! + bx!) / 2, (a.footY + b.footY) / 2, (az! + bz!) / 2], [.078, .078, .078])[0] }));
  const grids = [desktop, mobile].map(f => ({ width: f.gridWidth, height: f.gridHeight, peak: f.maxCandidates, overflow: f.overflowingCells }));
  t.diagnostic(JSON.stringify({ foot, underHead, pool, gap, contributions, grids }));
  assert.ok(pool[0]! > .04 && pool[0]! < .12 && foot[0]! < .12);
  assert.ok(gap[0]! < .35 * pool[0]!);
  assert.ok(pool[0]! > pool[1]! && pool[1]! > pool[2]! && pool[2]! > .14 * pool[0]!);
});

test('wet weather reduces the ground field beyond the usual albedo darkening', t => {
  const meter = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const p = [4, 0, 0], asphalt = [.078, .078, .078];
  const dry = meter.ground(p, asphalt)[0]!;
  const wet = weatherFrame('rain');
  const wetScale = meter.ground(p, asphalt, wet)[0]! / dry;
  t.diagnostic(JSON.stringify({ wetness: wet.weather.wet, wetScale }));
  assert.ok(wetScale > .12 && wetScale < .4, String(wetScale));
});

test('the scene fog amount veils the local ground pools before camera fog is applied', t => {
  const meter = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const p = [4, 0, 0], asphalt = [.078, .078, .078];
  const dry = meter.ground(p, asphalt)[0]!;
  const fog = weatherFrame('fog');
  // Hold the wetness constant to isolate the in-scattered fog from damp paving.
  fog.weather = { ...fog.weather, wet: 0 };
  const fogScale = meter.ground(p, asphalt, fog)[0]! / dry;
  t.diagnostic(JSON.stringify({ fogAmount: fog.rig.fogAmount, fogScale }));
  assert.ok(fogScale > .25 && fogScale < .45, String(fogScale));
});

test('winter field light crosses the tyre, kerb and pavement without copying their hard albedo bands', t => {
  const meter = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const snow = weatherFrame('snow');
  const p = [4, 0, 0];
  // Approximate the range after the road's skinny tyre and kerb snow masks
  // and the pavement's much higher snow retention. Hold geometry constant.
  const bands = [.06, .09, .23, .65];
  const grazing = bands.map(a => meter.ground(p, [a, a, a], snow, .015)[0]!);
  const overview = bands.map(a => meter.ground(p, [a, a, a], snow, .5)[0]!);
  t.diagnostic(JSON.stringify({ cover: snow.weather.snowCover, grazing, overview }));
  assert.ok(Math.max(...grazing, ...overview) / Math.min(...grazing, ...overview) < 1.10);
  assert.ok(grazing[0]! > .025 && overview[3]! < .11);
});

test('night receivers preserve prior hooks and the squeezed anchors, hide all decals and restore original programs in daylight and Perth', () => {
  const scene = new THREE.Scene(), perth = new THREE.Scene();
  const original = new THREE.MeshLambertMaterial();
  original.customProgramCacheKey = () => 'fixture';
  addRoofShade(original);
  const ground = ['city-asphalt', 'city-pavement', 'city-plaza', 'terrain-ground'].map(name => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), original);
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  });
  const sharedInPerth = new THREE.Mesh(ground[0]!.geometry, original);
  perth.add(sharedInPerth);
  const street = createStreetLights([{ x: 0, y: 0, z: 0, height: 10, yaw: 0, kind: 0, slope: [0, 0] },
    { x: 10, y: 0, z: 0, height: 10, yaw: 0, kind: 0, slope: [0, 0] }], { poolSegments: 12, receiverPoolAt: () => true });
  const pools = street.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const unregister = registerLights(scene, [light('kx/street/0'), light('kx/euston-north/0', [10, 10.15, 0])]);
  const layer = createNightLightLayer(scene, LIGHT_GRID_DESKTOP);
  try {
    layer.register(street, null);
    layer.scan();
    const source = compile(original), sourceKey = original.customProgramCacheKey();
    street.setLevel(1);
    const total = street.counts();
    layer.setFrame(scene, frame(20, 1));
    assert.ok(ground.every(m => m.material === original) && pools.visible, 'gloom or snow by day uses the original path');
    layer.setFrame(scene, frame(-20, 1));
    assert.ok(ground.every(m => m.material !== original));
    assert.equal(sharedInPerth.material, original);
    const night = ground[0]!.material;
    const raw = compile(night), squeezed = compile(night, true);
    for (const shader of [raw, squeezed]) {
      assert.ok(shader.fragmentShader.indexOf('float coverGroundAt') < shader.fragmentShader.indexOf('vec3 nightLightAt'));
      assert.match(shader.fragmentShader, /reflectedLight.directDiffuse \+= nightLightAt/);
      assert.ok(shader.fragmentShader.indexOf('reflectedLight.directDiffuse *= roofK.a') <
        shader.fragmentShader.indexOf('reflectedLight.directDiffuse += nightLightAt'));
      assert.doesNotMatch(shader.fragmentShader, /uEustonP1/);
      assert.ok(shader.uniforms.uNightLightGrid && shader.uniforms.uNightLightData);
      assert.deepEqual([...shader.fragmentShader.matchAll(/uniform sampler2D (u\w+);/g)].map(m => m[1]),
        ['uCoverMap', 'uCoverSoft', 'uCoverRooms', 'uNightLightData', 'uNightLightGrid']);
    }
    assert.ok(night.customProgramCacheKey().startsWith(sourceKey) && night.customProgramCacheKey() !== sourceKey);
    const fog = weatherFrame('fog');
    layer.setFrame(scene, fog);
    assert.equal(ground[0]!.material, night);
    assert.deepEqual(raw.uniforms.uNightLightWeather!.value.toArray(), [fog.weather.wet, fog.rig.fogAmount]);
    assert.equal(pools.visible, false);
    assert.deepEqual(street.counts(), { lamps: 2, draws: total.draws - 1, triangles: total.triangles - 2 * 288 });
    layer.setFrame(perth, frame(-20));
    assert.ok(ground.every(m => m.material === original) && pools.visible);
    assert.deepEqual(raw.uniforms.uNightLightLevels!.value.toArray(), [0, 0]);
    assert.deepEqual(raw.uniforms.uNightLightWeather!.value.toArray(), [0, 0]);
    assert.equal(raw.uniforms.uNightLightGrid!.value, null);
    layer.setFrame(scene, frame(-20));
    assert.equal(ground[0]!.material, night);
    assert.ok(raw.uniforms.uNightLightGrid!.value);
    layer.setFrame(scene, frame(20, 1));
    assert.ok(ground.every(m => m.material === original) && pools.visible);
    assert.deepEqual(compile(original), source);
    assert.equal(original.customProgramCacheKey(), sourceKey);
  } finally {
    layer.dispose();
    unregister();
    street.dispose();
  }
});
