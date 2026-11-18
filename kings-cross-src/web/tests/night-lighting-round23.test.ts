import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import data from '../src/data/kx-track.json' with { type: 'json' };
import { createAtmosphere } from '../src/atmosphere.ts';
import { createMaterials } from '../src/kxcentral.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { addRoofShade } from '../src/lighting.ts';
import { buildingNightMaterialsOf, cityMaterial, cityOfficeAtNight, FACADE_GLASS } from '../src/materials.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb } from './aces.ts';
import type { V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const luma = (rgb: ArrayLike<number>) => .2126 * rgb[0]! + .7152 * rgb[1]! + .0722 * rgb[2]!;
const display = (rgb: V3) => toSrgb(acesFilmic(rgb, 2.3)).map(c => Math.round(c * 255));
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const identity = new Mat(4, new THREE.Matrix4().toArray());
const block = (source: string, name: string) => source.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0] ?? '';

function compile(material: THREE.Material, library: 'lambert' | 'phong' = 'lambert') {
  const { vertexShader, fragmentShader } = THREE.ShaderLib[library];
  const shader = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

function mesh(root: THREE.Object3D, key: string) {
  return root.getObjectByName(`landmarks-${key}`) as THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
}

function facadeSample(material: THREE.Material, height: number, scope = 1, body = 1, rake = 0, towerTrim = 0, night = 1) {
  const fragment = compile(material).fragmentShader;
  const code = ['midland-night', 'midland-brick-floor', 'midland-body-grade', 'midland-end-grade', 'midland-arcade-grade',
    'midland-landmark-grade', 'midland-lamp-wash']
    .map(name => block(fragment, name)).join('\n')
    .replaceAll('reflectedLight.directDiffuse', 'direct')
    .replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replace(/\bFLOOD\b/g, String(material.defines!.FLOOD));
  const vars = {
    vMidlandNight: [scope, rake], vMidlandHeight: height,
    vMidlandBrickBody: body, vMidlandStoneBody: body, vMidlandTowerTrim: towerTrim,
    vMidlandClockStage: 0, vMidlandPinnacle: [0, 0, 0, 0],
    uMidlandNight: night, uMidlandLandmarkNight: night,
    cameraPosition: [-90, height, 100], vViewPosition: [0, 0, 0], viewMatrix: identity,
    diffuseColor: [.35, .12, .06, 1], direct: [.025, .011, .006], indirect: [.025, .011, .006],
    totalEmissiveRadiance: [.015, .008, .004],
  };
  new Glsl('').run(code, { vars });
  const [r, g, b] = vars.direct.map((c, i) => c + vars.indirect[i]! + vars.totalEmissiveRadiance[i]!);
  return display([r!, g!, b!]);
}

test('Midland upper brick darkens against the arcade on both range and tower', () => {
  const built = addLandmarks(new THREE.Scene(), data as KxData);
  try {
    const brick = mesh(built.group, 'brickRed');
    const day = brick.material, night = buildingNightMaterialsOf(brick)?.night ?? day;
    addRoofShade(day);
    const sample = (m: THREE.Material) => ({
      arcade: facadeSample(m, 3),
      range: facadeSample(m, 15),
      tower: facadeSample(m, 36, 1, 0),
    });
    const old = sample(day), next = sample(night);
    console.log('Midland brick CPU sRGB', { old, next, rangeToArcade: [old, next].map(v => luma(v.range) / luma(v.arcade)) });
    assert.deepEqual(next.arcade, old.arcade);
    assert.deepEqual(facadeSample(night, 15, 0), facadeSample(day, 15, 0), 'brick outside Midland stays exact');
    assert.deepEqual(facadeSample(night, 15, 1, 1, 0, 0, 0), facadeSample(day, 15, 1, 1, 0, 0, 0));
    assert.ok(luma(next.range) < luma(old.range) - 12 && luma(next.tower) < luma(old.tower) - 12);
    assert.ok(next.range[0]! > next.range[1]! && next.range[1]! > next.range[2]!);
  } finally { built.dispose(); }
});

test('gold is concentrated on Midland gable rakes and modelled clock-tower trim', () => {
  const built = addLandmarks(new THREE.Scene(), data as KxData);
  try {
    const stone = mesh(built.group, 'stone');
    const day = stone.material, night = buildingNightMaterialsOf(stone)?.night ?? day;
    addRoofShade(day);
    const sample = (m: THREE.Material) => ({
      rake: facadeSample(m, 25, 1, 1, 1), adjacent: facadeSample(m, 25),
      clockTrim: facadeSample(m, 47, 1, 0, 0, 1), towerField: facadeSample(m, 47, 1, 0),
    });
    const old = sample(day), next = sample(night);
    console.log('Midland stone CPU sRGB', { old, next });
    assert.ok(luma(next.clockTrim) > luma(old.clockTrim) + 35);
    assert.ok(luma(next.rake) > luma(old.rake) + 8);
    assert.ok(next.clockTrim[0]! > next.clockTrim[1]! && next.clockTrim[1]! > next.clockTrim[2]!);
    assert.ok(luma(next.towerField) <= luma(old.towerField));
    assert.deepEqual(facadeSample(night, 25, 0), facadeSample(day, 25, 0), 'other landmarks are outside the mask');

    const accents = stone.geometry.getAttribute('midlandTowerTrim');
    const scope = stone.geometry.getAttribute('midlandNight');
    const mainGeometry = stone.geometry.getAttribute('position');
    assert.ok(accents && accents.count === scope.count);
    const lit = Array.from({ length: accents.count }, (_, i) => i).filter(i => accents.getX(i) > 0);
    assert.ok(lit.length > 100 && lit.length < accents.count * .05);
    assert.ok(lit.every(i => scope.getX(i) === 1 && mainGeometry.getY(i) > 20));
  } finally { built.dispose(); }
});

function officeSample(material: THREE.Material, library: 'lambert' | 'phong') {
  const source = compile(material, library).fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  const program = new Glsl(source.slice(source.indexOf('float winHash(')));
  const rect = [...FACADE_GLASS.glass];
  return (x: number, y: number, seed: number, depth = 110, fog = 0) =>
    program.call('winOffice', [[x, y], [.26, .14], seed, 1, rect, .44, .9, depth],
      { vars: { uOfficeFog: fog } }) as number[];
}

test('KX office floors read cool white across occupied bays and keep dark floors and reveals', () => {
  const city = cityOfficeAtNight(cityMaterial('glass') as THREE.MeshPhongMaterial);
  const central = createMaterials();
  try {
    const cityPane = officeSample(city, 'phong');
    const rows = Array.from({ length: 16 }, (_, b) => Array.from({ length: 14 }, (_, y) => {
      const seed = 131 + 1.37 * b;
      const panes = Array.from({ length: 18 }, (_, x) => cityPane(x + .5, y + .53, seed));
      return { panes, seed, y };
    })).flat();
    const lit = (rgb: number[]) => luma(rgb) > .07;
    const occupied = rows.filter(row => row.panes.some(lit));
    const coherent = occupied.filter(row => row.panes.filter(lit).length >= 11);
    const panes = occupied.flatMap(row => row.panes.filter(lit));
    const cool = (rgb: number[]) => rgb[2]! > rgb[0]!;
    const stats = { floorShare: occupied.length / rows.length, wholeFloorShare: coherent.length / rows.length,
      occupiedBays: mean(occupied.map(row => row.panes.filter(lit).length / row.panes.length)),
      coolShare: panes.filter(cool).length / panes.length, meanRgb: [0, 1, 2].map(i => mean(panes.map(rgb => rgb[i]!))) };
    console.log('KX city office CPU', stats);
    assert.ok(stats.coolShare > .80 && stats.coolShare < .96);
    assert.ok(stats.floorShare >= .50 && stats.floorShare <= .60);
    assert.ok(stats.occupiedBays >= .62);
    assert.ok(stats.wholeFloorShare >= .30);
    const row = occupied.find(row => lit(row.panes[0]!))!;
    const pane = cityPane(.5, row.y + .53, row.seed, 280);
    assert.ok(luma(cityPane(.02, row.y + .53, row.seed, 280)) < .3 * luma(pane));
    assert.ok(luma(cityPane(.5, row.y + .53, row.seed, 280, .9)) < .12 * luma(pane));
    for (const [kind, library] of [['curtain', 'phong'], ['timber', 'lambert']] as const) {
      const fn = officeSample(central.officesAtNight.get(kind)!, library);
      const modelled = Array.from({ length: 20 }, (_, y) => fn(.5, y + .53, 27)).filter(lit);
      console.log(`KX ${kind} office CPU cool panes`, modelled.filter(cool).length, modelled.length);
      assert.ok(modelled.length >= 4 && modelled.filter(cool).length / modelled.length >= .8);
    }
  } finally {
    city.dispose();
    central.owned.forEach(material => material.dispose());
  }
});

function signature(material: THREE.Material, library: 'lambert' | 'phong' = 'lambert') {
  const { vertexShader, fragmentShader } = compile(material, library);
  return createHash('sha256').update(vertexShader).update(fragmentShader)
    .update(JSON.stringify(material.defines ?? {})).digest('hex');
}

test('Midland keeps its original daylight material and shader through night, and Perth shaders stay exact', () => {
  const scene = new THREE.Scene();
  const built = addLandmarks(scene, data as KxData);
  const world = addWorld(scene, { grid: false });
  const sky = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const camera = new THREE.PerspectiveCamera(50, 1.6, .5, 9000);
  const target = new THREE.Vector3();
  camera.position.set(260, 220, 90);
  const day = (wallMs: number) => sky.update({ camera, target, timeMs: Date.parse('2026-11-20T12:00:00Z'), wallMs, weather: CLEAR_STATE });
  const candidates = ['brickRed', 'stone'].map(key => mesh(built.group, key));
  const digests = [
    '30cb039754b15671bf42901ea679fd6e67e3e159b09d388cc930440624b279b7',
    '3a3e9f7341bb0c076e6fe599967ce76e2f0ab3725c9a3bdfceb330f7481880cc',
  ];
  const glass = 'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99';
  try {
    day(0);
    const originals = candidates.map(item => item.material);
    assert.deepEqual(originals.map(item => signature(item)), digests);
    for (const state of ['clear', 'fog'] as const) {
      sky.update({ camera, target, timeMs: Date.parse('2026-11-20T22:30:00Z'), wallMs: 1000,
        weather: state === 'clear' ? CLEAR_STATE : weatherState(forcedObservation('fog')) });
      assert.ok(candidates.every((item, i) => item.material !== originals[i] && item.material === buildingNightMaterialsOf(item)?.night),
        'Midland uses the registered night material');
      day(2000);
      assert.ok(candidates.every((item, i) => item.material === originals[i]), 'exact material identity preserves day draw order');
      assert.deepEqual(originals.map(item => signature(item)), digests);
    }
    for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
      const perth = remoteWeatherSnapshot('pt', state, true);
      assert.equal(createHash('sha256').update(JSON.stringify(perth)).digest('hex'), expectedWeather[`pt/${state}`]);
    }
    assert.equal(signature(cityMaterial('glass'), 'phong'), glass);
  } finally { sky.dispose(); built.dispose(); }
});
