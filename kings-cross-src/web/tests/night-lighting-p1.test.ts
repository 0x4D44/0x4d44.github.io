import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { skyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { squeezeGlslText } from '../../vite.config.ts';
import { midlandGrandPlan } from '../../core/landmarks.ts';
import type { MidlandPlan } from '../../core/landmarks.ts';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createAtmosphere, REFERENCE } from '../src/atmosphere.ts';
import type { AtmosphereState } from '../src/atmosphere.ts';
import { COVER_GLSL } from '../src/cover.ts';
import { withBuildingNightMaterial } from '../src/materials.ts';
import { createNightLightingPilot } from '../src/night-lighting-p1.ts';
import { createStreetLights, headOf } from '../src/streetlights.ts';
import { CLEAR_STATE, FORCED_NAMES, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Value } from './glsl.ts';

const spot: LampSpot = { x: -62.073, y: .752, z: 108.657, height: 10, yaw: -.998739, kind: LAMP_KIND.sodium, slope: [0, 0] };
const other = { ...spot, x: -81, z: 135 };
const head = new THREE.Vector3(...headOf(spot));
const across = new THREE.Vector3(Math.cos(spot.yaw), 0, -Math.sin(spot.yaw));
const along = new THREE.Vector3(across.z, 0, -across.x);
const up = [0, 1, 0];
const sample = (offset: number, chainage = 0) => head.clone().addScaledVector(across, offset).addScaledVector(along, chainage).setY(spot.y).toArray();

function compile(m: THREE.Material, squeeze = false) {
  const shader = { ...THREE.ShaderLib.lambert, uniforms: {} as Record<string, THREE.IUniform> };
  if (squeeze) {
    shader.fragmentShader = squeezeGlslText(shader.fragmentShader) ?? shader.fragmentShader;
    shader.vertexShader = squeezeGlslText(shader.vertexShader) ?? shader.vertexShader;
  }
  m.onBeforeCompile(shader as never, undefined as never);
  return shader;
}
function signature(m: THREE.Material) {
  const shader = compile(m);
  return [m.customProgramCacheKey(), shader.vertexShader, shader.fragmentShader, Object.keys(shader.uniforms)];
}
function frame(elevationDeg: number, weather = CLEAR_STATE): AtmosphereState {
  const rig = skyRig(elevationDeg, 0, { cloud: weather.cloud, rain: weather.rain, snow: weather.snow, visibilityM: weather.visibilityM }, REFERENCE);
  return { timeMs: 0, sun: { ...solarPosition(0), elevationDeg, azimuthDeg: 0 }, weather, rig };
}

function fixture(enabled = true, plan: MidlandPlan | null = null, lamps = [spot, other]) {
  const scene = new THREE.Scene();
  const pilot = enabled ? createNightLightingPilot(scene) : undefined;
  const nightLayer = createStreetLights(lamps, {
    poolSegments: 12, luminairePools: true, localSodiumScaleAt: () => 1,
    coreSize: 2, weatherEffects: true,
    receiverPoolAt: enabled ? s => s === spot : undefined,
  });
  scene.add(nightLayer.group);
  const day = new THREE.MeshLambertMaterial();
  const road = new THREE.Mesh(new THREE.PlaneGeometry(), day);
  road.name = 'city-asphalt';
  const masonry = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshLambertMaterial());
  masonry.name = 'landmarks-brickRed';
  masonry.material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec2 vMidlandNight;');
  };
  masonry.material.customProgramCacheKey = () => 'masonry-fixture';
  scene.add(road, masonry);
  const weather = createAtmosphere({ scene, world: addWorld(scene, { grid: false }), sites: null, nightLightingPilot: pilot });
  pilot?.register(lamps, plan, nightLayer);
  weather.rescan();
  nightLayer.setLevel(1);
  const select = (displayed = scene, state = frame(-20)) => pilot?.setFrame(displayed, state);
  const close = () => { pilot?.dispose(); weather.dispose(); nightLayer.dispose(); };
  return { scene, pilot, nightLayer, road, masonry, day, weather, select, close };
}

function opticalProbe(material: THREE.Material) {
  const shader = compile(material);
  const start = shader.fragmentShader.indexOf('uniform float uEustonP1Level;');
  if (start < 0) return () => [0, 0, 0];
  const end = shader.fragmentShader.indexOf('uniform vec4 uRoofShade;', start);
  assert.ok(end > start && shader.fragmentShader.includes('reflectedLight.directDiffuse += eustonP1 * material.diffuseColor;'));
  const program = new Glsl(COVER_GLSL + shader.fragmentShader.slice(start, end));
  const read = (p: number[], n: number[], roof = 0) => {
    const vars: Record<string, Value> = {};
    for (const [name, { value }] of Object.entries(shader.uniforms)) {
      if (name.startsWith('uEustonP1')) vars[name] = toValue(value);
    }
    Object.assign(vars, { uCoverRect: [-200, -200, .002, .002], uCoverScale: 1, uCoverMap: 0, uCoverSoft: 1 });
    return program.call('eustonP1At', [p, n], { vars, fns: { texture2D: (sampler, _uv) => sampler === 0 ? [roof, 0, 0, 0] : [roof > 0 ? 1 : 0, 0, 0, 0] } }) as number[];
  };
  return read;
}

test('the receiver makes a warm pool elongated along Euston Road with a shorter pavement skirt', () => {
  const f = fixture();
  try {
    f.select();
    const light = opticalProbe(f.road.material);
    const peak = light(sample(4), up);
    assert.ok(peak[0]! > 1 && peak[0]! > peak[1]! && peak[1]! > peak[2]!, 'warm road centre');
    const squeezed = compile(f.road.material, true).fragmentShader;
    assert.ok(squeezed.includes('vec3 eustonP1At(') && squeezed.includes('reflectedLight.directDiffuse += eustonP1 * material.diffuseColor;'));
    assert.ok(squeezed.indexOf('float coverGroundAt(') < squeezed.indexOf('vec3 eustonP1At('));
    assert.ok(light(sample(4, 10), up)[0]! > light(sample(14), up)[0]!, 'long along the road and short across it');
    assert.ok(light(sample(4, 15), up)[0]! > 0 && light(sample(-4), up)[0]! > 0, 'shoulder and station-side pavement');
    assert.deepEqual(light(sample(4, 30), up), [0, 0, 0]);
  } finally { f.close(); }
});

test('brick facing the fitting takes warm high-angle light, with cover and the wall plane rejecting recesses', () => {
  const f = fixture();
  try {
    f.select();
    const light = opticalProbe(f.masonry.material);
    const n = across.toArray();
    const front = head.clone().addScaledVector(across, -8.98).add(new THREE.Vector3(0, -2, 0));
    const brick = light(front.toArray(), n);
    assert.ok(brick[0]! > .5 && brick[0]! > brick[1]! && brick[1]! > brick[2]!, 'lit exterior brick');
    assert.deepEqual(light(front.toArray(), n.map(x => -x)), [0, 0, 0], 'reverse-facing wall');
    assert.deepEqual(light(front.clone().addScaledVector(across, -.15).toArray(), n), [0, 0, 0], 'recess behind the plane');
    assert.deepEqual(light(front.toArray(), n, .1), [0, 0, 0], 'open-facing fragment below a roof');
  } finally { f.close(); }
});

test('flag off preserves both original programs and pools, while the pilot submits one fewer quad', () => {
  const baseline = fixture(false);
  const f = fixture();
  try {
    const original = f.nightLayer.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const weather = f.nightLayer.group.getObjectByName('street-lamp-weather')!;
    const originalWeather = weather.children.map(o => ({ object: o, material: (o as THREE.Mesh).material, geometry: (o as THREE.Mesh).geometry }));
    assert.deepEqual(signature(f.road.material), signature(baseline.road.material));
    assert.deepEqual(f.nightLayer.counts(), baseline.nightLayer.counts());
    assert.ok(original.visible);
    f.select();
    const compact = f.nightLayer.group.getObjectByName('street-lamp-pools-euston-p1') as THREE.InstancedMesh;
    assert.ok(compact?.visible && !original.visible);
    assert.equal(f.nightLayer.counts().triangles, baseline.nightLayer.counts().triangles - 288);
    assert.equal(f.nightLayer.counts().draws, baseline.nightLayer.counts().draws);
    assert.deepEqual(compact.instanceMatrix.array, original.instanceMatrix.array.slice(16));
    assert.deepEqual(compact.instanceColor!.array, original.instanceColor!.array.slice(3));
    assert.equal(compact.geometry.getAttribute('poolLocalScale').getX(0), original.geometry.getAttribute('poolLocalScale').getX(1));
    assert.deepEqual(weather.children.map(o => ({ object: o, material: (o as THREE.Mesh).material, geometry: (o as THREE.Mesh).geometry })), originalWeather);
    f.select(f.scene, frame(20));
    assert.ok(original.visible && !compact.visible);
    assert.strictEqual(f.road.material, f.day);
  } finally { baseline.close(); f.close(); }
});

test('daytime gloom and both remote scenes keep original material identities and programs through a KX night swap and rescan', () => {
  const f = fixture();
  try {
    const original = signature(f.day);
    const remote = [new THREE.Scene(), new THREE.Scene()];
    const shared = remote.map(scene => {
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), f.day);
      scene.add(mesh);
      return mesh;
    });
    for (const name of FORCED_NAMES) {
      const daylight = frame(15, weatherState(forcedObservation(name)));
      if (name !== 'clear') assert.ok(daylight.rig.lampLevel > 0, name);
      f.select(f.scene, daylight);
      assert.strictEqual(f.road.material, f.day, name);
      assert.deepEqual(signature(f.road.material), original, name);
    }
    f.select(f.scene, frame(-.7, weatherState(forcedObservation('fog'))));
    assert.strictEqual(f.road.material, f.day, 'the apparent sun can still be above the horizon');
    for (const [i, scene] of remote.entries()) {
      f.select();
      assert.notStrictEqual(f.road.material, f.day, 'KX night must install a distinct variant');
      assert.notEqual(f.road.material.customProgramCacheKey(), original[0]);
      f.weather.rescan();
      f.select();
      assert.ok(compile(f.road.material).fragmentShader.includes('uEustonP1Level'));
      f.select(scene);
      assert.strictEqual(f.road.material, f.day);
      assert.strictEqual(shared[i]!.material, f.day);
      assert.deepEqual(signature(shared[i]!.material), original);
    }
    f.select();
    assert.notStrictEqual(f.road.material, f.day);
    f.select(f.scene, frame(15, weatherState(forcedObservation('rain'))));
    assert.strictEqual(f.road.material, f.day);
    assert.deepEqual(signature(f.road.material), original);
  } finally { f.close(); }
});

const midland = midlandGrandPlan(JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8')));
const west = { ...spot, x: -107.747, y: 1.583, z: 137.974, yaw: -1.00075 };
const east = { ...spot, x: 48.363, y: -.344, z: 31.919, yaw: -1.00362 };

test('the Midland pier is lit across the joint between its two modelled wall facets', () => {
  const f = fixture(true, midland);
  try {
    f.select();
    const light = opticalProbe(f.masonry.material);
    // Rays to the same brick receiver either side of the trapezoid in the frozen Midland frame.
    const left = light([-66.5049, 4.7722, 86.1767], [.4586, 0, .8886])[0]!;
    const middle = light([-65.3978, 4.4390, 85.6053], [.4586, 0, .8886])[0]!;
    const right = light([-64.2481, 2.7866, 85.1063], [.4209, 0, .9071])[0]!;
    assert.ok(middle > .24 && Math.abs(left - middle) < .06 && Math.abs(right - middle) < .09,
      `exterior brick falloff must be continuous across the facet joint: ${[left, middle, right]}`);
    assert.deepEqual(light([-65.3978, 4.4390, 85.4553], [.4586, 0, .8886]), [0, 0, 0]);
  } finally { f.close(); }
});

test('the central Midland bay has a weak overlap between the two lamps as their range tapers off', () => {
  const f = fixture(true, midland, [spot, west]);
  try {
    f.select();
    const light = opticalProbe(f.masonry.material);
    const middle = light([-97.9252, 5.6938, 101.8715], [.4458, 0, .8951])[0]!;
    assert.ok(middle > .01 && middle < .12, `central bay receives a faint tail: ${middle}`);
  } finally { f.close(); }
});

test('the Midland station-side shoulder reaches paving and exposed terrain up to the hotel foot', () => {
  const f = fixture(true, midland);
  try {
    const paving = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshLambertMaterial());
    paving.name = 'city-pavement';
    const terrain = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshLambertMaterial());
    terrain.name = 'terrain-ground';
    f.scene.add(paving, terrain);
    f.weather.rescan();
    f.select();
    const pavingLight = opticalProbe(paving.material);
    const terrainLight = opticalProbe(terrain.material);
    assert.ok(pavingLight([-61.5368, .6307, 98.9655], up)[0]! > .08, 'lamp spill reaches the hotel sidewalk');
    assert.ok(terrainLight([-66.2193, .4127, 94.7951], up)[0]! > .04, 'lamp spill crosses the mapped pavement gap');
    assert.deepEqual(terrainLight([-65, .4, 83], up), [0, 0, 0], 'the ground behind the facade stays dark');
  } finally { f.close(); }
});

test('the eastern lamp reaches the overview plaza and the south-front foreground with a weak open-side tail', () => {
  const f = fixture(true, midland, [east]);
  try {
    const plazaDay = new THREE.MeshLambertMaterial();
    const plaza = new THREE.Mesh(new THREE.PlaneGeometry(), plazaDay);
    plaza.name = 'city-plaza';
    f.scene.add(plaza);
    f.weather.rescan();
    assert.strictEqual(plaza.material, plazaDay);
    f.select();
    const light = opticalProbe(plaza.material);
    const byKerb = light([41.7347, -.0538, 22.0426], up)[0]!;
    const beyondCut = light([53.8959, -.1008, 13.3428], up)[0]!;
    const foreground = light([41.6026, -.0351, 21.3939], up)[0]!;
    assert.ok(byKerb > .04 && beyondCut > .015 && foreground > .04 && foreground < .30,
      `the spill crosses to plaza paving and reads as a tail: ${[byKerb, beyondCut, foreground]}`);
    assert.deepEqual(light([34, 0, 1], up), [0, 0, 0], 'no fill deep into the square');
    f.select(f.scene, frame(15, weatherState(forcedObservation('rain'))));
    assert.strictEqual(plaza.material, plazaDay);
  } finally { f.close(); }
});

test('the weak asphalt shoulder carries amber instead of feeding the blue ambient', () => {
  const f = fixture(true, midland);
  try {
    f.select();
    const [red, green, blue] = opticalProbe(f.road.material)([-71.1415, .9644, 120.0548], up);
    assert.ok(red! > .18 && green! >= .50 * red! && blue! <= .12 * red!,
      `sodium shoulder has a stronger green and smaller blue share: ${[red, green, blue]}`);
  } finally { f.close(); }
});

test('a direct KX night-to-day clock jump keeps the daylight masonry installed by the atmosphere', () => {
  const f = fixture();
  try {
    const original = f.masonry.material;
    const originalNight = original.clone();
    originalNight.onBeforeCompile = original.onBeforeCompile;
    withBuildingNightMaterial(f.masonry, originalNight);
    f.weather.rescan();
    const update = (utc: string, wallMs: number) => {
      f.weather.update({ timeMs: Date.parse(utc), wallMs, weather: CLEAR_STATE, target: new THREE.Vector3(), camera: new THREE.PerspectiveCamera() });
      f.select(f.scene, f.weather.state()!);
    };
    update('2026-11-20T22:30:00Z', 0);
    assert.notStrictEqual(f.masonry.material, originalNight);
    update('2026-11-20T12:00:00Z', 300);
    assert.ok(f.masonry.material === original, 'the pilot must not restore the old night material over the daylight material');
    assert.deepEqual(signature(f.masonry.material), signature(original));
  } finally { f.close(); }
});

test('the page tags original casters before installing pilot variants that inherit their shadow side', () => {
  const page = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  const tag = page.indexOf('sunShadow.tag()');
  const pilot = page.indexOf('nightLightingPilot?.setFrame(shown, sky)');
  assert.ok(tag >= 0 && tag < pilot && pilot < page.indexOf('renderer.render(shown, camera)'),
    'shadow tags must be on the source materials before the pilot clones them');
});
