import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import cameraSpecs from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import { createAtmosphere } from '../src/atmosphere.ts';
import track from '../src/data/kx-track.json' with { type: 'json' };
import waverleyData from '../src/data/waverley-scene.json' with { type: 'json' };
import { addKxCentral, createMaterials } from '../src/kxcentral.ts';
import { buildingNightMaterialsOf, cityMaterial, cityOfficeAtNight, FACADE_GLASS } from '../src/materials.ts';
import { createWaverleyWeather, lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import { forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, Sampler } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: number[]) => toSrgb(acesFilmic(rgb as unknown as V3, 2.3)).map(c => +(255*c).toFixed(2));
const glsl = new Glsl('');
const built = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(built.group, .60);
const glow = createWaverleyGlow(built.group);
const frontage = built.group.getObjectByName('waverley-frontage')!.userData.frontage;
const base = frontage.P as number;
glow.setLevel(1);
after(() => { glow.dispose(); undo(); built.dispose(); });

function mesh(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  assert.ok(object instanceof THREE.Mesh && !Array.isArray(object.material), name);
  return object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}
function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshBasicMaterial ? THREE.ShaderLib.basic
    : material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
function block(source: string, tag: string) {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n', start), source.indexOf(`// ${tag}-end`, start)).replace(/^\s*#.*$/gm, '');
}
function fingerprint(material: THREE.Material) {
  const { vertexShader, fragmentShader } = shader(material);
  return hash(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
}

const tower = 'waverley-balmoral-tower';
const roof = 'waverley-mapped-roofs';
const structure = 'waverley-frontage-structure';
const dial = 'waverley-balmoral-clock-dials';

test('the Balmoral shaft and clock stage fall into shadow while lit bands and the clock dial hold', () => {
  const source = shader(mesh(built.group, tower).material).fragmentShader;
  const dialShader = shader(mesh(built.group, dial).material).fragmentShader;
  function stone(height: number) {
    const albedo = [.42, .34, .24];
    const builtFlood = albedo.map((c, i) => c*[1,.82,.5][i]!*.02*(.5+.5*Math.exp(-(height-25.5)/30)));
    const vars = {
      vStationLampWorld: [55, base+height, -126], vStationLampNormal: [0, 0, -1], vBalmoralTowerU: .42,
      diffuseColor: [...albedo, 1], uStationLampLevel: 1, uWinNight: 1, totalEmissiveRadiance: [0, 0, 0],
      direct: albedo.map(c => c*.10), indirect: albedo.map(c => c*.12),
    };
    const grade = block(source, 'balmoral-tower-grade');
    glsl.run(block(source, 'balmoral-tower-wash') + grade + block(source, 'balmoral-tower-diffuse').replaceAll('reflectedLight.directDiffuse', 'direct')
      .replaceAll('reflectedLight.indirectDiffuse', 'indirect'), { vars: Object.assign(vars, {towerBuiltFlood: builtFlood}) });
    return display(vars.totalEmissiveRadiance.map((c, i) => c + vars.direct[i]! + vars.indirect[i]! + builtFlood[i]!));
  }
  const lower = stone(29), upper = stone(36), stage = stone(45);
  const lowerCourse = stone(26.25), middleCourse = stone(32.4), stageBand = stone(41.0);
  console.log('Balmoral tower display RGB', { lower, upper, stage, lowerCourse, middleCourse, stageBand });
  assert.ok(luma(lower) < .78*luma(lowerCourse) && luma(upper) < .73*luma(middleCourse));
  assert.ok(luma(stage) < .70*luma(stageBand) && luma(stage) > 24);
  assert.equal(mesh(built.group, dial).material.defines?.FLOOD_COLOUR, 'vec3( 1.0, 0.94, 0.8 )');
  assert.equal(block(dialShader, 'balmoral-tower-grade'), '');
});

test('the Balmoral crown reads violet after tone mapping, with blue clearly above red', () => {
  const source = shader(mesh(built.group, structure).material).fragmentShader;
  const cap = (height: number) => {
    const vars = { vStationLampWorld: [55, base+height, -126], totalEmissiveRadiance: [.012, .012, .014], uStationLampLevel: 1 };
    glsl.run(block(source, 'balmoral-crown'), { vars });
    return display(vars.totalEmissiveRadiance);
  };
  const rgb = cap(54);
  console.log('Balmoral crown display RGB', rgb);
  assert.ok(rgb[2]! > rgb[0]! + 32 && rgb[0]! > rgb[1]! + 25 && rgb[0]! > 90);
  assert.deepEqual(cap(48), display([.012, .012, .014]));
});

test('North Bridge clear-night glazing picks up a warm glint above the pendants with dark bars, distant panes and snow', () => {
  const { fragmentShader, uniforms } = shader(mesh(built.group, roof).material);
  const rect = uniforms.uWaverleyRoofRect!.value as THREE.Vector4;
  const map = uniforms.uWaverleyRoofLight!.value as THREE.DataTexture;
  const data = map.image.data as Uint8Array;
  const { width, height } = map.image;
  const heads = built.group.getObjectByName('waverley-roof')!.userData.platformLampHeads as number[];
  const [x,,z] = heads.slice(0,3) as [number, number, number];
  function sample(zOffset: number, albedo = .20, fog = 0, snow = 0, slope = .37, wet = 0) {
    const vars = {
      vStationLampWorld: [x, 9, z+zOffset], vStationLampNormal: [slope, 1, 0], cameraPosition: [x+34, 16.73, z],
      diffuseColor: [.062, .062, .062, 1], sampledDiffuseColor: [albedo, albedo, albedo, 1],
      uStationLampLevel: 1, uStationLampSnow: snow, uStationLampFog: fog, uWaverleyRoofRect: rect.toArray(),
      uWaverleyRoofLight: new Sampler(null), uWaverleyRoofWet: wet, totalEmissiveRadiance: [0, 0, 0],
    };
    glsl.run(block(fragmentShader, 'station-light') + block(fragmentShader, 'waverley-roof-transmission'), {
      vars, fns: { texture2D: (_sampler, uv) => {
        const [u, v] = uv as [number, number];
        const i = THREE.MathUtils.clamp(Math.floor(u*width), 0, width-1);
        const j = THREE.MathUtils.clamp(Math.floor(v*height), 0, height-1);
        return [data[j*width+i]!/255, 0, 0, 1];
      }},
    });
    return display(vars.totalEmissiveRadiance);
  }
  const glint = sample(0), shoulder = sample(11), bar = sample(0,.57);
  const fogGlint = sample(0,.20,1), snow = sample(0,.20,0,1), flat = sample(0,.20,0,0,0);
  console.log('Roof display RGB', { glint, shoulder, bar, fogGlint, snow, flat });
  assert.ok(luma(glint) > luma(fogGlint)+5 && luma(glint) < 247);
  assert.ok(glint[0]! >= glint[2]!+6 && shoulder[2]! > shoulder[0]!);
  assert.ok(luma(glint)-luma(shoulder) > 45 && luma(bar) < .15*luma(glint));
  assert.deepEqual(sample(0,.20,0,0,.37,1), fogGlint);
  assert.deepEqual(snow, [0, 0, 0]);
  assert.ok(luma(flat) < .12*luma(glint));
});

function officeShader(material: THREE.Material) {
  const source = shader(material).fragmentShader;
  const from = source.indexOf('float winHash(');
  const end = source.indexOf('#include', source.indexOf('vec3 winOffice(', from));
  const tile = source.indexOf('float gk =', from);
  return new Glsl(source.slice(from, tile > 0 ? Math.min(tile,end) : end).replace(/^\s*#.*$/gm, ''));
}

test('the Crick has joined runs of occupied floors, partial suites and a double dark gap', () => {
  const central = createMaterials();
  try {
    const code = officeShader(central.officesAtNight.get('curtain')!);
    const rows = Array.from({length: 11}, (_, floor) => Array.from({length: 80}, (_, bay) => {
      const rgb = code.call('winOffice', [[bay+.5, floor+.55], [.30,.13], 2.98, 1, [.03125,.96875,.2375,.975], .44, .9, 420], { vars: { uOfficeFog: 0 } });
      return luma(rgb as number[]) > .30;
    }));
    const counts = rows.map(row => row.filter(Boolean).length);
    console.log('Crick lit bays by floor out of 80', counts);
    assert.ok(counts[1]! >= 64 && counts[2]! >= 64 && counts[3] === 0 && counts[4]! >= 64);
    assert.ok(counts[5]! > 20 && counts[5]! < 60 && counts[6]! >= 64 && counts[7] === 0);
    const suite = rows[5]!;
    assert.ok(suite.slice(0,-5).some((_, i) => suite.slice(i,i+6).every(v => !v)));
    assert.ok(counts[9] === 0 && counts[10] === 0);
  } finally { central.owned.forEach(m => m.dispose()); }
});

test('the overview office east of the tracks groups two occupied floors with dark floors on either side', () => {
  const eastOffice = cityOfficeAtNight(cityMaterial('glass') as THREE.MeshPhongMaterial);
  try {
    const code = officeShader(eastOffice);
    // The four rows sampled on this curtain wall in the frozen overview.
    const counts = [2,3,4,5].map(floor => Array.from({length:18}, (_, bay) =>
      code.call('winOffice', [[bay+.5,floor+.55], [.30,.13], 198.094, 1, [...FACADE_GLASS.glass], .44, .9, 420],
        {vars:{uOfficeFog:0}}) as number[]).filter(rgb => luma(rgb) > .30).length);
    console.log('East of tracks lit bays by floor out of 18', counts);
    assert.ok(counts[0] === 0 && counts[1]! >= 14 && counts[2]! >= 14 && counts[3] === 0);
  } finally { eastOffice.dispose(); }
});

function camera(view: 'wv-roof-from-north-bridge' | 'wv-calton-hill-panorama') {
  const spec = cameraSpecs[view];
  const result = new THREE.PerspectiveCamera(spec.fov, 1.6, .5, 9000);
  result.position.fromArray(spec.pos);
  result.lookAt(new THREE.Vector3().fromArray(spec.target));
  result.updateMatrixWorld();
  return result;
}
async function waverleyWeather(forced: 'clear' | 'fog') {
  const model = buildWaverleyScene({ lighting: false });
  const view = await loadWaverleyScene({
    modelLoader: async () => ({ buildWaverleyScene: () => model }),
    geometryLoader: async () => ({ default: waverleyData }),
  });
  const climate = createWaverleyWeather(view, { mode: 'forced', forced });
  const sky = view.scene.children.find(o => o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
  const update = (cam: THREE.PerspectiveCamera, hour: string, wallMs: number) =>
    climate.update({ camera: cam, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00Z`), wallMs });
  return { scene: view.scene, sky, update, dispose() { climate.dispose(); view.dispose(); } };
}

test('Calton roof glow warms and tapers its shoulders while North Bridge keeps its original graded fog', async () => {
  const local = await waverleyWeather('fog');
  const bridge = camera('wv-roof-from-north-bridge'), hill = camera('wv-calton-hill-panorama');
  try {
    local.update(hill, '22:30', 0);
    const source = shader(local.sky.material).fragmentShader;
    const code = new Glsl(block(source, 'waverley-roof-air-functions'));
    const before = [.24, .21, .18];
    function probe(cam: THREE.PerspectiveCamera, x: number, y: number, depth: number) {
      const ray = new THREE.Vector3((x+.5)/640-1, 1-(y+.5)/400, .5).unproject(cam).sub(cam.position).normalize();
      const vars = {
        cameraPosition: cam.position.toArray(),
        vWaverleyRoofAirWorld: ray.multiplyScalar(depth).add(cam.position).toArray(),
        uWaverleyRoofAir: 1, gl_FragColor: [...before, 1],
      };
      code.run(block(source, 'waverley-roof-air'), { vars });
      return before.map((c, i) => +(255*(vars.gl_FragColor[i]!-c)).toFixed(2));
    }
    const centre = probe(hill, 388, 469, 500);
    const left = probe(hill, 185, 469, 500), right = probe(hill, 513, 469, 500);
    const north = probe(bridge, 635, 367, 498), near = probe(bridge, 913, 519, 38), occluded = probe(hill, 388, 469, 160);
    console.log('Roof air added display RGB', { centre, left, right, north, near, occluded });
    assert.ok(centre[0]! > centre[2]!+8 && luma(centre) > 10);
    assert.ok(luma(left) < .50*luma(centre) && luma(right) < .52*luma(centre));
    assert.ok(luma(north) > 17 && luma(north) < 21 && north[0]! < north[2]!);
    assert.deepEqual(occluded, [0, 0, 0]);
    assert.deepEqual(near, [0, 0, 0]);
  } finally { local.dispose(); }
});

test('the new night programs preserve main day-clear fingerprints, material identity and all Perth weather receipts', async () => {
  const local = await waverleyWeather('clear');
  const cam = camera('wv-roof-from-north-bridge');
  const kx = new THREE.Scene(), world = addWorld(kx, { grid: false });
  const central = addKxCentral(kx, track as KxData);
  const atmosphere = createAtmosphere({ scene: kx, world, sites: null, kingsCrossNightFog: true });
  const crick = mesh(kx, 'kxcentral-curtain');
  const {day: crickDay, night: crickNight} = buildingNightMaterialsOf(crick)!;
  const wv = [tower, structure, roof, dial].map(name => mesh(local.scene, name));
  const originals = wv.map(m => m.material);
  const daylight = () => [...originals, local.sky.material, crick.material].map(fingerprint);
  const clear = weatherState(forcedObservation('clear'));
  try {
    local.update(cam, '12:00', 0);
    const day = daylight(), keys = originals.map(m => m.customProgramCacheKey());
    assert.deepEqual(day, [
      '5de39593a09c7b64480aed2c6f87504a64e886160299fbd0208c4fb950842c5f',
      'b61dd30623d4a1cac9b4adb97f2fb19aed17e5a2522a97c0a07eeee767df2998',
      '50233f3beea235ea36f5193ebd8e4a8105674052b352cfc5ff9c593d544ae60a',
      '4f465cfe5d56d3fde702909ebdf6684fe81bd5f3db6d89e37a0e5ec759aec1a4',
      '88bfc7b244a2892a7870c19f817280831533a634374bb5e26674a3d6738bf9ef',
      '2f34f2a6011d30e26949695b680ada384190ca1092ed72a5e4830fb4c941f74a',
    ]);
    const kxAt = (hour: string, wallMs: number) => atmosphere.update({
      camera: cam, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00Z`), wallMs, weather: clear,
    });
    kxAt('22:30', 1000);
    assert.ok(crick.material === crickNight);
    kxAt('12:00', 2000);
    assert.ok(crick.material === crickDay);
    local.update(cam, '22:30', 1000);
    const changed = shader(originals[0]!).fragmentShader;
    local.update(cam, '12:00', 2000);
    assert.ok(wv.every((m, i) => m.material === originals[i]));
    assert.deepEqual(daylight(), day);
    assert.deepEqual(originals.map(m => m.customProgramCacheKey()), keys);
    for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
      assert.equal(hash(JSON.stringify(remoteWeatherSnapshot('pt', state, true))), expectedWeather[`pt/${state}`]);
    }
    assert.ok(changed.includes('balmoral-tower-grade-begin') && !shader(originals[0]!).fragmentShader.includes('balmoral-tower-grade-begin'));
  } finally { atmosphere.dispose(); central.dispose(); local.dispose(); }
});
