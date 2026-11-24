import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import data from '../src/data/kx-track.json' with { type: 'json' };
import { createMaterials } from '../src/kxcentral.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { buildingNightMaterialsOf, cityMaterial, cityOfficeAtNight, FACADE_GLASS } from '../src/materials.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb } from './aces.ts';
import type { V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const luma = ([r, g, b]: readonly number[]) => .2126 * r! + .7152 * g! + .0722 * b!;
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const display = (rgb: V3) => toSrgb(acesFilmic(rgb, 2.3)).map(c => Math.round(c * 255));
const identity = new Mat(4, new THREE.Matrix4().toArray());

function compile(material: THREE.Material) {
  const { vertexShader, fragmentShader } = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const shader = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

function digest(material: THREE.Material) {
  const shader = compile(material);
  return createHash('sha256').update(shader.vertexShader).update(shader.fragmentShader)
    .update(JSON.stringify(material.defines ?? {})).digest('hex');
}

function withMidland(run: (brick: THREE.Mesh, stone: THREE.Mesh) => void) {
  const built = addLandmarks(new THREE.Scene(), data as KxData);
  try {
    run(built.group.getObjectByName('landmarks-brickRed') as THREE.Mesh,
      built.group.getObjectByName('landmarks-stone') as THREE.Mesh);
  } finally { built.dispose(); }
}

function facadeProbe(mesh: THREE.Mesh, {
  height, albedo = [.35, .12, .06] as V3, body = 1, rake = 0, trim = 0, stage = 0, box = [0, 0, 0, 0],
}: { height: number; albedo?: V3; body?: number; rake?: number; trim?: number; stage?: number; box?: number[] }) {
  const { night } = buildingNightMaterialsOf(mesh)!;
  const source = compile(night).fragmentShader;
  const start = source.indexOf('// midland-night-begin');
  const end = source.indexOf('// midland-lamp-wash-end');
  assert.ok(start >= 0 && end > start);
  const grade = source.slice(start, end)
    .replaceAll('reflectedLight.directDiffuse', 'direct')
    .replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replace(/\bFLOOD\b/g, String(night.defines!.FLOOD));
  const vars = {
    vMidlandNight: [1, rake], vMidlandHeight: height, vMidlandBrickBody: body, vMidlandStoneBody: body,
    vMidlandFacadeDetail: [0,0,0],
    vMidlandTowerTrim: trim, vMidlandClockStage: stage, vMidlandGableField: 0, vMidlandPinnacle: box,
    uMidlandNight: 1, uMidlandLandmarkNight: 1,
    cameraPosition: [-90, height, 100], vViewPosition: [0, 0, 0], viewMatrix: identity,
    diffuseColor: [...albedo, 1], direct: albedo.map(c => c * .07), indirect: albedo.map(c => c * .07),
    totalEmissiveRadiance: albedo.map(c => c * .045),
  };
  new Glsl('').run(grade, { vars });
  const channel = (i: number) => vars.direct[i]! + vars.indirect[i]! + vars.totalEmissiveRadiance[i]!;
  return display([channel(0), channel(1), channel(2)]);
}

test('Midland mid-storey brick falls into brown shadow and keeps variations in its brick map', () => withMidland(brick => {
  const arcade = facadeProbe(brick, { height: 3 });
  const first = facadeProbe(brick, { height: 9 });
  const middle = facadeProbe(brick, { height: 14.5 });
  const mortar = facadeProbe(brick, { height: 14.5, albedo: [.22, .091, .05] });
  const end = facadeProbe(brick, { height: 14.5, body: 0 });
  console.log('Midland arcade, first floor, middle, mortar, end', arcade, first, middle, mortar, end);
  assert.ok(luma(middle) / luma(arcade) < .34 && luma(end) / luma(arcade) < .34);
  assert.ok(luma(middle) / luma(arcade) > .16 && luma(middle) > luma(mortar) + 3);
  assert.ok(luma(first) > 1.5 * luma(middle));
  assert.ok(middle[0]! > middle[1]! && middle[1]! > middle[2]!);
}));

test('the Midland clock stage has faint brick texture on the gable above the dial', () => withMidland(brick => {
  const field = facadeProbe(brick, { height: 52, body: 0 });
  const stage = facadeProbe(brick, { height: 52, body: 0, stage: 1 });
  const stageMortar = facadeProbe(brick, { height: 52, body: 0, stage: 1, albedo: [.22, .091, .05] });
  console.log('Midland upper tower field, clock gable, clock-gable mortar', field, stage, stageMortar);
  assert.ok(luma(stage) > luma(field) + 8 && luma(stage) < 34);
  assert.ok(luma(stage) > luma(stageMortar) + 3 && stage[0]! > stage[1]!);
  const mask = brick.geometry.getAttribute('midlandClockStage');
  const pos = brick.geometry.getAttribute('position');
  const tagged = Array.from({ length: pos.count }, (_, i) => pos.getY(i)).filter((_, i) => mask.getX(i) > 0);
  assert.ok(tagged.length && Math.min(...tagged) > 40 && Math.max(...tagged) > 53);
}));

test('pinnacle shafts and caps catch gold at the edges while the face stays in shade', () => withMidland((_, stone) => {
  const sample = (box: number[]) => facadeProbe(stone, {
    height: 52, body: 0, trim: 1, albedo: [.46, .39, .27], box,
  });
  const ring = sample([0, 0, 0, 0]);
  const shaftEdge = sample([.035, .85, .3, 1.7]), shaftFace = sample([.15, .85, .3, 1.7]);
  const capEdge = sample([.5, .035, 2.1, .25]), capFace = sample([.5, .125, 2.1, .25]);
  console.log('Midland clock ring, pinnacle shaft edge/face, cap edge/face', ring, shaftEdge, shaftFace, capEdge, capFace);
  assert.ok(luma(shaftEdge) > luma(shaftFace) + 32 && luma(capEdge) > luma(capFace) + 32);
  assert.ok(luma(shaftFace) < .65 * luma(ring) && luma(capFace) < .65 * luma(ring));
  assert.ok(shaftEdge[0]! > shaftEdge[1]! && shaftEdge[1]! > shaftEdge[2]! + 13);
  const sizes = stone.geometry.getAttribute('midlandPinnacleBox');
  const trim = stone.geometry.getAttribute('midlandTowerTrim');
  let shafts = 0, caps = 0, otherTrim = 0;
  for (let i = 0; i < sizes.count; i++) {
    const width = sizes.getX(i);
    if (width > 0) {
      assert.equal(trim.getX(i), 1);
      if (width < 1) shafts++;
      else caps++;
    } else if (trim.getX(i)) otherTrim++;
  }
  assert.ok(shafts > 0 && caps > 0 && otherTrim > 0);
}));

function floorProbe(material: THREE.Material, rect: readonly number[], seed: number, span: number[]) {
  const source = compile(material).fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  const code = new Glsl(source.slice(source.indexOf('float winHash(')));
  const pane = (x: number, y: number) => code.call('winOffice', [[x, y], span, seed, 1, [...rect], .44, .9, 210],
    { vars: { uOfficeFog: 0 } }) as number[];
  const rows = Array.from({ length: 10 }, (_, y) =>
    Array.from({ length: 18 }, (_, x) => pane(x + .5, y + .53)));
  const lit = (c: number[]) => luma(c) > .15;
  const bays = rows.map(row => row.filter(lit).length);
  const cool = rows.flat().filter(c => lit(c) && c[2] > c[0]);
  return {
    bays,
    whole: bays.filter(n => n >= 14).length,
    dark: bays.filter(n => n === 0).length,
    officeWhite: cool.length ? [0, 1, 2].map(i => mean(cool.map(c => c[i]! / c[2]))) : [],
    mullion: mean(rows.map((_, y) => luma(pane(.02, y + .53)))),
  };
}

function reflectedGlazing(material: THREE.Material, level: number) {
  const source = compile(material).fragmentShader;
  const map = source.split('#include <map_fragment>')[1]!.split('#include')[0]!;
  const grade = map.match(/float glassLuma = [^;]+;\s*diffuseColor\.rgb = [^;]+;/)?.[0] ?? '';
  const vars = { diffuseColor: [.08, .17, .40, 1], uWinNight: level };
  new Glsl('').run(grade, { vars });
  return vars.diffuseColor;
}

test('Euston Road curtain walls and the Crick carry almost complete cool-white floors beside dark ones', () => {
  const city = cityOfficeAtNight(cityMaterial('glass') as THREE.MeshPhongMaterial);
  const central = createMaterials();
  try {
    const crickMaterial = central.officesAtNight.get('curtain')!;
    const street = floorProbe(city, FACADE_GLASS.glass, 151, [.26, .14]);
    const crick = floorProbe(crickMaterial, [.03125, .96875, .2375, .975], 2.98, [.32, .18]);
    for (const material of [city, crickMaterial]) {
      const day = reflectedGlazing(material, 0), night = reflectedGlazing(material, 1);
      assert.deepEqual(day, [.08, .17, .40, 1]);
      assert.ok(night[2]! - night[0]! < .30 * (day[2]! - day[0]!));
      assert.ok(luma(night) < .75 * luma(day));
    }
    console.log('Euston Road and Crick CPU floor occupancy and neutral-white balance', { street, crick });
    for (const result of [street, crick]) {
      assert.ok(result.whole >= 4 && result.dark >= 3);
      assert.ok(result.bays.some((count, i) => count >= 14 && (result.bays[i - 1] === 0 || result.bays[i + 1] === 0)));
      assert.ok(result.officeWhite[0]! >= .90 && result.officeWhite[0]! < result.officeWhite[1]! && result.officeWhite[1]! < 1);
      assert.ok(result.mullion < .03);
    }
  } finally {
    city.dispose();
    central.owned.forEach(material => material.dispose());
  }
});

test('round 24 clock-stage shading is night-only and the day shaders and Perth weather receipts stay exact', () => {
  const scene = new THREE.Scene(), built = addLandmarks(scene, data as KxData);
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .5, 9000);
  camera.position.set(260, 220, 90);
  const sample = (hour: string, wallMs: number, fog = false) => atmosphere.update({
    camera, target: new THREE.Vector3(), wallMs, timeMs: Date.parse(`2026-11-20T${hour}:00Z`),
    weather: fog ? weatherState(forcedObservation('fog')) : CLEAR_STATE,
  });
  const brick = built.group.getObjectByName('landmarks-brickRed') as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  const stone = built.group.getObjectByName('landmarks-stone') as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  try {
    sample('12:00', 0);
    const day = [brick.material, stone.material];
    const dayHashes = [
      'bb444f7aa1f336ed15507286c1fa725682423f0ebc8a826b96c19dc3ec44ca19',
      '5d7a3c0e753d2b56d6de40d1529d246ee255134dd2fd7bc926e1d0201ecfadee',
    ];
    assert.deepEqual(day.map(digest), dayHashes);
    assert.equal(digest(cityMaterial('glass')), 'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99');
    let clockStageAtNight = true;
    for (const [i, fog] of [false, true].entries()) {
      sample('22:30', 1000 + i * 2000, fog);
      assert.equal(brick.material, buildingNightMaterialsOf(brick)!.night);
      assert.equal(stone.material, buildingNightMaterialsOf(stone)!.night);
      clockStageAtNight &&= compile(brick.material).fragmentShader.includes('vMidlandClockStage');
      sample('12:00', 2000 + i * 2000);
      assert.ok(brick.material === day[0] && stone.material === day[1]);
      assert.deepEqual(day.map(digest), dayHashes);
    }
    for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
      const perth = remoteWeatherSnapshot('pt', state, true);
      assert.equal(createHash('sha256').update(JSON.stringify(perth)).digest('hex'), expectedWeather[`pt/${state}`]);
    }
    assert.ok(clockStageAtNight, 'exercise the new night program while checking the original daylight programs');
  } finally { atmosphere.dispose(); built.dispose(); }
});
