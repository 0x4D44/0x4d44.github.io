import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { facadeTint } from '../../core/city.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { createMaterials } from '../src/kxcentral.ts';
import { cityMaterial, cityOfficeAtNight, withBuildingNightMaterial, windowNight } from '../src/materials.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb } from './aces.ts';
import weatherReceipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { Glsl } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const central = createMaterials();
const timberDay = central.table.timber;
const crickDay = central.table.curtain;
const timber = central.officesAtNight.get('timber')!;
const crick = central.officesAtNight.get('curtain')!;
const cityDay = cityMaterial('glass') as THREE.MeshPhongMaterial;
const cityNight = cityOfficeAtNight(cityDay);
after(() => { central.owned.forEach(material => material.dispose()); cityNight.dispose(); });

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const luma = ([red, green, blue]: readonly number[]) => .2126 * red! + .7152 * green! + .0722 * blue!;
const displayLuma = (rgb: readonly number[]) =>
  255 * luma(toSrgb(acesFilmic([rgb[0]! + .012, rgb[1]! + .014, rgb[2]! + .020], 2.3)));
const range = (length: number) => Array.from({ length }, (_, i) => i);

function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { fragmentShader: lib.fragmentShader, vertexShader: lib.vertexShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}

function fingerprint(material: THREE.Material) {
  const source = shader(material);
  return hash(source.vertexShader + source.fragmentShader + JSON.stringify(material.defines ?? {}));
}

function officeSample(material: THREE.Material, span: number[]) {
  const { fragmentShader } = shader(material);
  const declarations = fragmentShader.split('#include <common>')[1]!.split('#include')[0]!;
  const body = fragmentShader.split('#include <map_fragment>')[1]!.split('#include')[0]!.replace(/^\s*#.*$/gm, '');
  const defines = Object.fromEntries(Object.entries(material.defines ?? {}).filter(([key]) => key.startsWith('WIN_'))
    .map(([key, value]) => [key, String(value).startsWith('vec4') ? String(value).match(/[-.\d]+/g)!.slice(1).map(Number) : Number(value)]));
  const evaluate = new Glsl(declarations).snippet(body);
  return (u: number, v: number, along: number, tint: readonly number[] = [0, 0, 0], night = 1) => {
    const vars = {
      ...defines, uWinNight: night, uOfficeFog: 0, vMapUv: [u, v], vViewPosition: [0, 0, 420],
      vPlatform37Position: [-45.7 + .148665 * along, -163.3 - .988888 * along],
      vColor: [...tint], diffuseColor: [.04, .07, .09, 1], totalEmissiveRadiance: [0, 0, 0],
    };
    evaluate({ vars, fns: { fwidth: () => span } });
    return vars.totalEmissiveRadiance;
  };
}

function average(values: readonly number[]) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

test('occupied office floors keep their reading with irregular room-sized vacancies', () => {
  const p37 = officeSample(timber, [.32, .16]);
  const institute = officeSample(crick, [.46, .18]);
  const curtain = officeSample(cityNight, [.40, .20]);
  const west = facadeTint(265720685);
  const patterns = [4, 5, 6].map(floor =>
    range(30).map(bay => displayLuma(p37(2 * bay + 1, floor + .57, 80)) >= 120 ? '#' : '.').join(''));
  const platformVacancies = patterns.map(pattern => pattern.replaceAll('#', '').length);
  const crickRow = range(144).map(bay =>
    displayLuma(institute(bay + 80.5, 4.57, 0)) >= 120 ? '#' : '.').join('');
  const crickVacancies = crickRow.replaceAll('#', '').length;
  const crickScattered = crickRow.split('#').filter(run => run.length === 1).length;
  const westVacancies = [6, 8, 9, 10].reduce((sum, floor) => sum + range(32).filter(bay =>
    displayLuma(curtain(bay + .5, floor + .57, 0, west)) < 120).length, 0);
  console.log({ platformVacancies, crickVacancies, crickScattered, westVacancies });
  assert.ok(platformVacancies.every(n => n >= 5 && n <= 8));
  assert.equal(new Set(patterns).size, patterns.length);
  assert.ok(patterns.every(row => row.split('.').some(run => run.length >= 4)));
  assert.ok(crickVacancies >= 30 && crickVacancies <= 43 && crickScattered >= 4);
  assert.ok(westVacancies >= 10 && westVacancies <= 24);
});

test('KX office floors vary from warm to cool with separate brightness levels and dark mullions', () => {
  const sample = officeSample(timber, [.32, .16]);
  const rgb = (bare: number[]) =>
    toSrgb(acesFilmic([bare[0]! + .012, bare[1]! + .014, bare[2]! + .020], 2.3)).map(c => c * 255);
  const floors = [4, 5, 6].flatMap(floor => [54, 90].map(along =>
    range(24).map(bay => rgb(sample(2 * bay + 1, floor + .57, along))).filter(col => luma(col) >= 120)));
  const brightness = floors.map(row => average(row.map(luma)));
  const warm = floors.map(row => average(row.map(col => col[0]! - col[2]!)));
  const spread = (values: number[]) => Math.max(...values) - Math.min(...values);
  console.log({ brightness, warm });
  assert.ok(spread(brightness) >= 14);
  assert.ok(Math.min(...warm) < -3 && Math.max(...warm) > 16);
  assert.ok(floors.every(row => spread(row.map(luma)) >= 10 && row.every(col => luma(col) < 245)));
  assert.ok(range(24).every(bay => displayLuma(sample(2 * bay, 5.57, 54)) < 70));

  const institute = officeSample(crick, [.46, .18]);
  const curtain = officeSample(cityNight, [.40, .20]);
  const tint = facadeTint(265720685);
  for (const [storeys, at] of [
    [[1, 2, 4, 5, 6], (bay: number, v: number) => institute(bay + 80, v, 0)],
    [[6, 8, 9, 10], (bay: number, v: number) => curtain(bay, v, 0, tint)],
  ] as const) {
    const rows = storeys.map(floor => range(24).map(bay => rgb(at(bay + .5, floor + .57))).filter(col => luma(col) >= 120));
    const tones = rows.map(row => average(row.map(col => col[0]! - col[2]!)));
    assert.ok(Math.min(...tones) < 0 && Math.max(...tones) > 10);
    assert.ok(rows.every(row => spread(row.map(luma)) >= 8 && row.every(col => luma(col) < 245)));
    assert.ok(storeys.every(floor => range(24).every(bay => displayLuma(at(bay, floor + .57)) < 70)));
  }
});

test('the east curtain wall moves an occupied upper storey down with day material identity and remote weather receipts intact', () => {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const geometry = new THREE.PlaneGeometry();
  const offices = [
    withBuildingNightMaterial(new THREE.Mesh(geometry, timberDay), timber),
    withBuildingNightMaterial(new THREE.Mesh(geometry, crickDay), crick),
    withBuildingNightMaterial(new THREE.Mesh(geometry, cityDay), cityNight),
  ];
  scene.add(...offices);

  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000);
  camera.position.set(10, 20, 50);
  const weather = weatherState(forcedObservation('clear'));
  const update = (hour: string, wallMs: number) => atmosphere.update({
    camera, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00:00Z`), wallMs, weather,
  });
  const dayMaterials = [timberDay, crickDay, cityDay];
  const dayHashes = [
    '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65',
    '44bdef302b3378e39d95d5ac5f4a1d4a20b82795f2d0337c7c05e770255a3ea9',
    'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99',
  ];

  try {
    assert.deepEqual(offices.map(office => fingerprint(office.material)), dayHashes);
    atmosphere.rescan();
    update('12', 0);
    assert.ok(offices.every((office, i) => office.material === dayMaterials[i]));
    const scannedDay = offices.map(office => fingerprint(office.material));
    update('22', 1000);
    assert.equal(offices[0]!.material, timber);
    assert.equal(offices[1]!.material, crick);
    assert.equal(offices[2]!.material, cityNight);
    assert.ok(windowNight.value > .99);
    const sample = officeSample(offices[2]!.material, [.40, .20]);
    const east = facadeTint(375735261);
    const floors = range(6).map(storey => range(22).map(bay =>
      displayLuma(sample(bay + .5, storey + 2.57, 0, east))));
    const counts = floors.map(row => row.filter(value => value >= 120).length);
    assert.deepEqual(sample(.5, 3.57, 0, east, .003), [0, 0, 0]);
    update('12', 2000);
    assert.ok(offices.every((office, i) => office.material === dayMaterials[i] && office.geometry === geometry));
    assert.deepEqual(offices.map(office => fingerprint(office.material)), scannedDay);
    for (const station of ['pt', 'wv'] as const) {
      for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
        assert.equal(hash(JSON.stringify(remoteWeatherSnapshot(station, state, true))), weatherReceipts[`${station}/${state}`]);
      }
    }
    console.log('East office pane counts, storeys 2–7', counts);
    assert.deepEqual(counts.map(n => n >= 17), [false, true, true, true, false, true]);
    assert.equal(counts[0], 0);
    assert.equal(counts[4], 0);
    assert.ok(counts.reduce((sum, n) => sum + n, 0) >= 84);
    assert.ok(floors.flat().every(luma => luma < 245));
  } finally {
    atmosphere.dispose();
    geometry.dispose();
  }
});
