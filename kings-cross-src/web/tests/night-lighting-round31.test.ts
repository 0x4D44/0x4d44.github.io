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
const timber = central.officesAtNight.get('timber')!;
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

function readFloor(sample: ReturnType<typeof officeSample>, along: number, floor: number, bays: number, tint?: readonly number[]) {
  const timberBays = tint ? 1 : 2;
  const pane = (bay: number, u: number, v: number) =>
    displayLuma(sample(timberBays * (bay + u), floor + v, along, tint));
  const centres = range(bays).map(bay => pane(bay, .5, .57));
  return {
    lit: centres.filter(value => value > 120).length,
    peak: Math.max(...range(bays).flatMap(bay => [.08, .25, .5, .75, .92].flatMap(u =>
      [.26, .49, .72, .91].map(v => pane(bay, u, v))))),
    mullion: Math.max(...range(bays).map(bay => pane(bay, 0, .57))),
  };
}

test('Platform 37 lights two additional storeys across the overview and shed-interior faces', () => {
  const overview = officeSample(timber, [.32, .16]);
  const shed = officeSample(timber, [.13, .034]);
  const groups = [[18, 7], [54, 7], [90, 7], [127.5, 9], [166.5, 9], [205.5, 9], [241.5, 11], [274, 11]] as const;
  const floors = groups.flatMap(([along, storeys]) => range(storeys).map(floor => readFloor(overview, along, floor, 12)));
  const whole = floors.filter(row => row.lit >= 9).length;
  const shedRows = [4, 5].map(floor => readFloor(shed, 54, floor, 12));
  console.log('Platform 37 whole storeys, shed-side pane counts and peak luma', whole, shedRows.map(row => row.lit),
    Math.max(...floors.map(row => row.peak), ...shedRows.map(row => row.peak)));
  assert.equal(whole, 41);
  assert.ok(shedRows.every(row => row.lit >= 9));
  assert.ok([...floors, ...shedRows].every(row => row.peak < 245 && row.mullion < 70));
});

test('Platform 37 carries a dark pair and the three lit rows above it across the lower-left join', () => {
  const sample = officeSample(timber, [.32, .16]);
  const along = [55, 65, 72, 80, 90];
  const joinRows = [2, 3, 4, 5, 6].map(floor => along.map(metres => readFloor(sample, metres, floor, 12).lit));
  console.log('Platform 37 pane counts across the join, storeys 2 to 6', joinRows);
  assert.ok(joinRows.slice(0, 2).flat().every(lit => lit === 0));
  assert.ok(joinRows.slice(2).flat().every(lit => lit >= 9));
});

test('the east curtain wall carries four full-width lit floors and an upper dark floor with the existing night material', () => {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, kingsCrossNightFog: true });
  const geometry = new THREE.PlaneGeometry();
  const offices = [
    withBuildingNightMaterial(new THREE.Mesh(geometry, timberDay), timber),
    withBuildingNightMaterial(new THREE.Mesh(geometry, cityDay), cityNight),
  ];
  scene.add(...offices);

  const camera = new THREE.PerspectiveCamera(50, 1.6, .1, 20000);
  camera.position.set(10, 20, 50);
  const weather = weatherState(forcedObservation('clear'));
  const update = (hour: string, wallMs: number) => atmosphere.update({
    camera, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00:00Z`), wallMs, weather,
  });
  const dayMaterials = [timberDay, cityDay];
  const dayHashes = [
    '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65',
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
    assert.equal(offices[1]!.material, cityNight);
    assert.ok(windowNight.value > .99);
    const sample = officeSample(offices[1]!.material, [.40, .20]);
    const east = facadeTint(375735261);
    const rows = range(6).map(floor => readFloor(sample, 0, floor + 2, 22, east));
    const pancras = range(6).map(floor => readFloor(sample, 0, floor + 5, 22, facadeTint(265720685)));
    assert.deepEqual(sample(.5, 6.57, 0, east, .003), [0, 0, 0]);
    update('12', 2000);
    assert.ok(offices.every((office, i) => office.material === dayMaterials[i] && office.geometry === geometry));
    assert.deepEqual(offices.map(office => fingerprint(office.material)), scannedDay);
    for (const station of ['pt', 'wv'] as const) {
      for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
        assert.equal(hash(JSON.stringify(remoteWeatherSnapshot(station, state, true))), weatherReceipts[`${station}/${state}`]);
      }
    }
    console.log('East office and 6 Pancras Square pane counts, peak luma', rows.map(row => row.lit),
      pancras.map(row => row.lit), Math.max(...rows.map(row => row.peak)));
    assert.deepEqual(rows.map(row => row.lit >= 17), [false, true, true, true, false, true]);
    assert.ok(rows.filter((_, i) => i === 0 || i === 4).every(row => row.lit === 0));
    assert.deepEqual(pancras.map(row => row.lit >= 17), [false, true, false, true, true, true]);
    assert.ok([...rows, ...pancras].every(row => row.peak < 245 && row.mullion < 70));
  } finally {
    atmosphere.dispose();
    geometry.dispose();
  }
});
