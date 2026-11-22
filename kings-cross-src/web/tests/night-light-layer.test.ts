import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildLightField, LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE } from '../../core/light-field.ts';
import type { LightField } from '../../core/light-field.ts';
import { registerLights } from '../../core/light-sources.ts';
import { testRoadLight as light } from '../../core/tests/light-field-fixture.ts';
import { skyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { squeezeGlslText } from '../../vite.config.ts';
import { REFERENCE } from '../src/atmosphere.ts';
import { addRoofShade } from '../src/lighting.ts';
import { createNightLightLayer, nightLightGLSL } from '../src/night-light-layer.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { CLEAR_STATE } from '../src/weather.ts';
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
    snow: (snow: number, facing: number) => program.call('nightSnowReceipt', [snow, facing], { vars, fns }) as number,
  };
}

test('P1 road lobe, backward reach, smooth carriageway join, inverse square and cutoff run in GLSL', t => {
  const at = probe(buildLightField([light()], LIGHT_GRID_DESKTOP)).at;
  const peak = at([4, 0, 0]);
  assert.ok(peak[0]! > 1.5 && peak[0]! > peak[1]! && peak[1]! > peak[2]!, JSON.stringify(peak));
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
    assert.ok(bright > 1);
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
    assert.ok(single > 1 && Math.abs(capped / single - spec.cap) < 1e-8, String(capped));
  }
});

test('facade spill stays close to each fitting and snow suppresses grazing lamp contrast', t => {
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
  assert.equal(p.snow(0, .015), 1);
  assert.ok(p.snow(1, .015) <= .12 && p.snow(1, .5) > .5);
  t.diagnostic(JSON.stringify({ near, between, acrossRoadLit, acrossRoadDark, snowGrazing: p.snow(1, .015), snowOblique: p.snow(1, .5) }));
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
    assert.equal(pools.visible, false);
    assert.deepEqual(street.counts(), { lamps: 2, draws: total.draws - 1, triangles: total.triangles - 2 * 288 });
    layer.setFrame(perth, frame(-20));
    assert.ok(ground.every(m => m.material === original) && pools.visible);
    assert.deepEqual(raw.uniforms.uNightLightLevels!.value.toArray(), [0, 0]);
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
