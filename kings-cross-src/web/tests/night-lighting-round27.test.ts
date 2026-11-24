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
import { buildingNightMaterialsOf } from '../src/materials.ts';
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

function towerStone() {
  const source = shader(mesh(built.group, tower).material).fragmentShader;
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
  return stone;
}

test('the Balmoral clock stage is violet above a dark shaft and leaves the white dial alone', () => {
  const stone = towerStone();
  const stage = stone(45), band = stone(41), shaft = stone(36);
  console.log('Balmoral tower display RGB', { shaft, stage, band });
  assert.ok(stage[2]! > stage[0]! + 45 && stage[0]! > stage[1]! + 12);
  assert.ok(luma(stage) < .75*luma(band) && luma(shaft) < .73*luma(stone(32.4)));
  const dialShader = shader(mesh(built.group, dial).material).fragmentShader;
  assert.equal(mesh(built.group, dial).material.defines?.FLOOD_COLOUR, 'vec3( 1.0, 0.94, 0.8 )');
  assert.equal(block(dialShader, 'balmoral-tower-grade'), '');
});

test('the Balmoral shaft and clock-stage base have sharp luma steps at the built stone courses', () => {
  const stone = towerStone();
  const step = (bottom: number, top: number) => {
    const rows = Array.from({length:11}, (_, i) => luma(stone(bottom+(top-bottom)*i/10)));
    return Math.max(...rows.slice(1).map((row, i) => Math.abs(row-rows[i]!)));
  };
  const shaft = step(31.9,33), stage = step(41,42.5);
  console.log('Balmoral course adjacent luma steps', { shaft, stage });
  assert.ok(shaft > 45 && stage > 40);
});

test('the Balmoral crown moves toward the blue-violet of the photographed crown', () => {
  const source = shader(mesh(built.group, structure).material).fragmentShader;
  const cap = (height: number) => {
    const vars = { vStationLampWorld: [55, base+height, -126], totalEmissiveRadiance: [.012, .012, .014], uStationLampLevel: 1 };
    glsl.run(block(source, 'balmoral-crown'), { vars });
    return display(vars.totalEmissiveRadiance);
  };
  const rgb = cap(54);
  console.log('Balmoral crown display RGB', rgb);
  assert.ok(rgb[2]! > rgb[0]! + 60 && rgb[0]! > rgb[1]! + 55 && rgb[1]! < 86);
  assert.deepEqual(cap(48), display([.012, .012, .014]));
});

test('North Bridge clear-night glazing carries warm glints above the pendants and dark bars', () => {
  const glazing = mesh(built.group, roof);
  const { fragmentShader, uniforms } = shader(glazing.material);
  const rect = uniforms.uWaverleyRoofRect!.value as THREE.Vector4;
  const map = uniforms.uWaverleyRoofLight!.value as THREE.DataTexture;
  const data = map.image.data as Uint8Array;
  const { width, height } = map.image;
  const heads = built.group.getObjectByName('waverley-roof')!.userData.platformLampHeads as number[];
  const [x,,z] = heads.slice(0,3) as [number, number, number];
  const code = block(fragmentShader, 'station-light') + block(fragmentShader, 'waverley-roof-transmission');
  function sample(point: number[], normal: number[], eye: number[], albedo = .20, fog = 0, snow = 0, wet = 0) {
    const vars = {
      vStationLampWorld: point, vStationLampNormal: normal, cameraPosition: eye,
      diffuseColor: [.062, .062, .062, 1], sampledDiffuseColor: [albedo, albedo, albedo, 1],
      uStationLampLevel: 1, uStationLampSnow: snow, uStationLampFog: fog, uWaverleyRoofRect: rect.toArray(),
      uWaverleyRoofLight: new Sampler(null), uWaverleyRoofWet: wet, totalEmissiveRadiance: [0, 0, 0],
    };
    glsl.run(code, {
      vars, fns: { texture2D: (_sampler, uv) => {
        const [u, v] = uv as [number, number];
        const px = u*width-.5, py = v*height-.5;
        const i = Math.floor(px), j = Math.floor(py);
        const texel = (a: number, b: number) => data[THREE.MathUtils.clamp(b,0,height-1)*width+THREE.MathUtils.clamp(a,0,width-1)]!/255;
        const lerp = THREE.MathUtils.lerp;
        return [lerp(lerp(texel(i,j),texel(i+1,j),px-i), lerp(texel(i,j+1),texel(i+1,j+1),px-i), py-j), 0, 0, 1];
      }},
    });
    return display(vars.totalEmissiveRadiance);
  }
  const overLamp = (zOffset: number, albedo = .20, fog = 0, snow = 0, slope = .37, wet = 0) =>
    sample([x,9,z+zOffset], [slope,1,0], [x+34,16.73,z], albedo, fog, snow, wet);
  const glint = overLamp(0), shoulder = overLamp(11), bar = overLamp(0,.57);
  const fogGlint = overLamp(0,.20,1), snow = overLamp(0,.20,0,1), flat = overLamp(0,.20,0,0,0);
  console.log('Roof display RGB', { glint, shoulder, bar, fogGlint, snow, flat });
  assert.ok(luma(glint) > luma(fogGlint)+5 && luma(glint) < 244);
  assert.ok(luma(glint)-luma(shoulder) > 45 && luma(bar) < .15*luma(glint));
  assert.deepEqual(overLamp(0,.20,0,0,.37,1), fogGlint);
  assert.deepEqual(snow, [0, 0, 0]);
  assert.ok(luma(flat) < .12*luma(glint));

  // Ray hits on midtone glass in the frozen 1280 × 800 North Bridge view.
  // Wet is the control here because it suppresses only the clear transmission term.
  const cam = camera('wv-roof-from-north-bridge');
  const ray = new THREE.Raycaster();
  built.group.updateMatrixWorld(true);
  const reads = [[1020,500],[1008,504],[1020,516],[1016,522],[818,534],[606,550]].map(([px,py]) => {
    ray.setFromCamera(new THREE.Vector2((px!+.5)/640-1,1-(py!+.5)/400), cam);
    const hit = ray.intersectObject(glazing, false)[0];
    assert.ok(hit?.normal && Math.abs(hit.normal.x) > .10);
    const p = hit.point.toArray(), n = hit.normal.toArray(), eye = cam.position.toArray();
    return { clear: sample(p,n,eye), wet: sample(p,n,eye,.20,0,0,1) };
  });
  console.log('North Bridge projected midtone display RGB', reads);
  assert.ok(glint[0]! >= glint[2]!+15 && shoulder[2]! > shoulder[0]!);
  assert.ok(reads.every(({ clear, wet }) => luma(clear) > luma(wet)+16 && clear[0]! > clear[2]!+22));
});

function officeShader(material: THREE.Material) {
  const source = shader(material).fragmentShader;
  const from = source.indexOf('float winHash(');
  const end = source.indexOf('#include', source.indexOf('vec3 winOffice(', from));
  const tile = source.indexOf('float gk =', from);
  return new Glsl(source.slice(from, tile > 0 ? Math.min(tile,end) : end).replace(/^\s*#.*$/gm, ''));
}

function bays(code: Glsl, floor: number, width: number, seed: number, rect: readonly number[], firstBay = 0) {
  return Array.from({length:width}, (_, bay) => {
    const rgb = code.call('winOffice', [[firstBay+bay+.5, floor+.55], [.30,.13], seed, 1, [...rect], .44, .9, 420],
      { vars: { uOfficeFog: 0 } });
    return luma(rgb as number[]) > .30;
  });
}
const row = (panes: boolean[]) => panes.map(lit => lit ? '#' : '.').join('');
const longestDark = (pattern: string) => Math.max(...pattern.split('#').map(run => run.length));

test('the Crick breaks each visible occupied floor into lit and dark suites', () => {
  const central = createMaterials();
  try {
    const code = officeShader(central.officesAtNight.get('curtain')!);
    const rows = [1,2,3,4,5,6,7].map(floor => row(bays(code, floor, 80, 2.98, [.03125,.96875,.2375,.975])));
    console.log('Crick bay masks on floors 1–7', rows);
    for (const index of [0,1,3,5]) {
      assert.ok(longestDark(rows[index]!) >= 14 && longestDark(rows[index]!) <= 19);
      assert.ok(rows[index]!.replaceAll('.', '').length >= 64);
    }
    assert.notEqual(rows[0], rows[1]);
    for (const index of [2,6]) assert.equal(rows[index], '.'.repeat(80));
  } finally { central.owned.forEach(m => m.dispose()); }
});

test('Platform 37 timber offices have adjacent occupied floors and a 50–60% occupancy share', () => {
  const central = createMaterials();
  try {
    const code = officeShader(central.officesAtNight.get('timber')!);
    const glass = [.14,.86,1/4.2,.98];
    const rows = Array.from({length:11}, (_, floor) => row(bays(code, floor, 18, 6.99, glass, 6*128)));
    const occupied = rows.map(pattern => pattern.replaceAll('.', '').length >= 14);
    console.log('Platform 37 bay masks', rows);
    assert.equal(occupied.filter(Boolean).length, 6);
    assert.ok(occupied.some((lit, index) => lit && occupied[index+1] && !occupied[index+2]));
    assert.equal(rows.filter(pattern => pattern === '.'.repeat(18)).length, 5);
    const acrossSectionBoundary = [5,6].flatMap(section => bays(code, 7, 9, 6.99, glass, section*128));
    assert.ok(acrossSectionBoundary.filter(Boolean).length > 0 && acrossSectionBoundary.filter(Boolean).length < 14);
  } finally { central.owned.forEach(m => m.dispose()); }
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

test('round 27 night programs keep the main day-clear fingerprints, material identities and Perth weather receipts', async () => {
  const local = await waverleyWeather('clear');
  const cam = camera('wv-roof-from-north-bridge');
  const kx = new THREE.Scene(), world = addWorld(kx, { grid: false });
  const central = addKxCentral(kx, track as KxData);
  const atmosphere = createAtmosphere({ scene: kx, world, sites: null, kingsCrossNightFog: true });
  const kxOffices = ['kxcentral-curtain', 'kxcentral-timber'].map(name => mesh(kx, name));
  const variants = kxOffices.map(office => buildingNightMaterialsOf(office)!);
  const wv = [tower, structure, roof, dial].map(name => mesh(local.scene, name));
  const originals = wv.map(m => m.material);
  const daylight = () => [...originals, local.sky.material, kxOffices[0]!.material].map(fingerprint);
  const clear = weatherState(forcedObservation('clear'));
  try {
    local.update(cam, '12:00', 0);
    const day = daylight(), keys = originals.map(m => m.customProgramCacheKey());
    const timberDay = fingerprint(kxOffices[1]!.material);
    assert.deepEqual(day, [
      'fe9748b2eb5af81537308feea7b4b3307db285ec929d894268b3dd45ad6f3a7b',
      'f92538cda46ae5ab2d78488388cc0c6bdc7869225dc436973ac498feedb84f33',
      '82399ff22b82e531c947b625b989134649f909b3246fd0b406e8c6ac55b66ce1',
      'eb8522a16180b0772ef3f762f02c4c7231043fbe17765960a9d22180aca41ea6',
      '88bfc7b244a2892a7870c19f817280831533a634374bb5e26674a3d6738bf9ef',
      '2f34f2a6011d30e26949695b680ada384190ca1092ed72a5e4830fb4c941f74a',
    ]);
    const kxAt = (hour: string, wallMs: number) => atmosphere.update({
      camera: cam, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00Z`), wallMs, weather: clear,
    });
    kxAt('22:30', 1000);
    assert.ok(kxOffices.every((office, i) => office.material === variants[i]!.night));
    kxAt('12:00', 2000);
    assert.ok(kxOffices.every((office, i) => office.material === variants[i]!.day));
    assert.equal(fingerprint(kxOffices[1]!.material), timberDay);
    local.update(cam, '22:30', 1000);
    const changed = shader(originals[0]!).fragmentShader;
    local.update(cam, '12:00', 2000);
    assert.ok(wv.every((m, i) => m.material === originals[i]));
    assert.deepEqual(daylight(), day);
    assert.deepEqual(originals.map(m => m.customProgramCacheKey()), keys);
    for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
      assert.equal(hash(JSON.stringify(remoteWeatherSnapshot('pt', state, true))), expectedWeather[`pt/${state}`]);
    }
    assert.ok(changed.includes('towerVioletWash') && !shader(originals[0]!).fragmentShader.includes('towerVioletWash'));
  } finally { atmosphere.dispose(); central.dispose(); local.dispose(); }
});
