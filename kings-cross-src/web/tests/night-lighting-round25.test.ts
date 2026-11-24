import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import track from '../src/data/kx-track.json' with { type: 'json' };
import waverleyData from '../src/data/waverley-scene.json' with { type: 'json' };
import cameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import { createMaterials } from '../src/kxcentral.ts';
import { addLandmarks, type Landmarks } from '../src/landmarks.ts';
import { buildingNightMaterialsOf, cityMaterial, cityOfficeAtNight, FACADE_GLASS } from '../src/materials.ts';
import { createWaverleyWeather, lightWaverleyNight } from '../src/station-weather.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, Mat } from './glsl.ts';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import expectedWeather from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };

const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: V3) => toSrgb(acesFilmic(rgb, 2.3)).map(c => c*255);
const glsl = new Glsl('');
const matrix = new Mat(4, new THREE.Matrix4().toArray());
const digest = (data: string) => createHash('sha256').update(data).digest('hex');
const built = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(built.group, .60);
const glow = createWaverleyGlow(built.group);
glow.setLevel(1);
after(() => { glow.dispose(); undo(); built.dispose(); });

function mesh(root: THREE.Object3D, name: string): THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  const object = root.getObjectByName(name);
  assert.ok(object instanceof THREE.Mesh && !Array.isArray(object.material), name);
  return object;
}
function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshBasicMaterial ? THREE.ShaderLib.basic
    : material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const { vertexShader, fragmentShader } = lib;
  const source = { vertexShader, fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
function block(source: string, tag: string) {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n', start), source.indexOf(`// ${tag}-end`, start)).replace(/^\s*#.*$/gm, '');
}
function fingerprint(material: THREE.Material) {
  const { vertexShader, fragmentShader } = shader(material);
  return digest(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
}

const facade = 'waverley-balmoral-facade';
const roof = 'waverley-mapped-roofs';
const structure = 'waverley-frontage-structure';
const castle = 'waverley-city-monuments';

test('Balmoral stone falls into warm shadow between the balcony and top cornice while occupied panes keep their light', () => {
  const source = shader(mesh(built.group, facade).material).fragmentShader;
  const base = built.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
  function grade(height: number, albedo: V3, room: V3 = [0, 0, 0]) {
    const vars = {
      vStationLampWorld: [58, base + height, -132], diffuseColor: [...albedo, 1], hotelHeight: height,
      uStationLampLevel: 1, uWinNight: 1, totalEmissiveRadiance: [0, 0, 0],
      direct: albedo.map(c => c*.10), indirect: albedo.map(c => c*.12),
      balmoralBuiltFlood: albedo.map((c, i) => c*[1, .82, .5][i]!* .08*(.5+.5*Math.exp(-(height+18)/30))),
    };
    glsl.run(['balmoral-facade-wash', 'balmoral-bands', 'balmoral-body-uplight'].map(tag => block(source, tag)).join('\n'), { vars });
    const stone = [...vars.totalEmissiveRadiance];
    Object.assign(vars, {
      balmoralStoneEmission: stone, totalEmissiveRadiance: stone.map((c, i) => c+room[i]!),
    });
    const grade = block(source, 'balmoral-stone-grade') + block(source, 'balmoral-stone-diffuse');
    glsl.run(block(source, 'balmoral-room-contrast') + grade.replaceAll('reflectedLight.directDiffuse', 'direct')
      .replaceAll('reflectedLight.indirectDiffuse', 'indirect'), { vars });
    const channel = (i: number) => vars.totalEmissiveRadiance[i]! + vars.direct[i]! + vars.indirect[i]! + vars.balmoralBuiltFlood[i]!;
    return display([channel(0), channel(1), channel(2)]);
  }
  const albedo: V3 = [.41, .30, .21];
  const ground = grade(3.4, albedo), first = grade(8.7, albedo), body = grade(15.6, albedo);
  const texture = grade(15.6, [.33, .24, .16]), upper = grade(21.2, albedo), top = grade(24.3, albedo);
  const room = grade(15.6, [.022, .025, .031], [.36, .31, .24]);
  console.log('Balmoral estimated display luma', [ground, first, body, texture, upper, top, room].map(luma), 'body RGB', body);
  assert.ok(luma(body) < .63*luma(first) && luma(upper) < .60*luma(top));
  assert.ok(luma(body) > luma(texture)+5 && body[0]! > body[1]! && body[1]! > body[2]!);
  assert.ok(luma(room) > luma(body)+90);
});

test('the Balmoral crown adds its own violet above the clock stage', () => {
  const source = shader(mesh(built.group, structure).material).fragmentShader;
  const base = built.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
  function cap(height: number) {
    const vars = { vStationLampWorld: [55, base+height, -126], totalEmissiveRadiance: [0, 0, 0], uStationLampLevel: 1 };
    glsl.run(block(source, 'balmoral-crown'), { vars });
    return vars.totalEmissiveRadiance;
  }
  const rgb = cap(54);
  console.log('Balmoral crown linear RGB', rgb);
  assert.ok(rgb[2]! > 1.55*rgb[0]! && luma(rgb) > .060361);
  assert.deepEqual(cap(48), [0, 0, 0]);
});

test('Castle masonry reads above Calton’s skyline while dense fog still extinguishes the wash', () => {
  const source = shader(mesh(built.group, castle).material).fragmentShader;
  function wash(x: number, z: number, fog = 0) {
    const vars = {
      vStationLampWorld: [x, 86, z], vStationLampNormal: [.64, -.15, -.75],
      diffuseColor: [.27, .25, .20, 1], totalEmissiveRadiance: [0, 0, 0],
      uStationLampLevel: 1, uStationLampFog: fog, fogNear: -17, fogFar: fog ? 220 : 2200, vFogDepth: 1160,
    };
    glsl.run(block(source, 'castle-wash'), { vars });
    return vars.totalEmissiveRadiance;
  }
  const stone = wash(-579, 380);
  console.log('Castle linear emission', stone, luma(stone));
  assert.ok(luma(stone) > .32 && stone[2]! > .70*stone[0]!);
  assert.deepEqual(wash(-579, 380, 1), [0, 0, 0]);
  assert.deepEqual(wash(-500, 380), [0, 0, 0]);
});

async function weather(forced: 'clear' | 'fog') {
  const model = buildWaverleyScene({ lighting: false });
  const view = await loadWaverleyScene({
    modelLoader: async () => ({ buildWaverleyScene: () => model }), geometryLoader: async () => ({ default: waverleyData }),
  });
  const climate = createWaverleyWeather(view, { mode: 'forced', forced });
  const sky = view.scene.children.find(o => o instanceof THREE.Mesh && o.geometry.type === 'SphereGeometry') as THREE.Mesh;
  const update = (camera: THREE.PerspectiveCamera, hour: string, wallMs: number) =>
    climate.update({ camera, target: new THREE.Vector3(), timeMs: Date.parse(`2026-11-20T${hour}:00Z`), wallMs });
  return { view, sky, update, dispose() { climate.dispose(); view.dispose(); } };
}

function camera(view: keyof typeof cameras) {
  const spec = cameras[view];
  const cam = new THREE.PerspectiveCamera('fov' in spec ? spec.fov : 50, 1.6, .5, 9000);
  cam.position.fromArray(spec.pos);
  cam.lookAt(new THREE.Vector3().fromArray(spec.target));
  cam.updateMatrixWorld();
  return cam;
}

test('North Bridge and Calton see scattered interior roof light only along the unoccluded length of the fog ray', async () => {
  const local = await weather('fog');
  const bridge = camera('wv-roof-from-north-bridge'), hill = camera('wv-calton-hill-panorama');
  try {
    local.update(bridge, '22:30', 0);
    const source = shader(local.sky.material as THREE.Material).fragmentShader;
    const code = new Glsl(block(source, 'waverley-roof-air-functions'));
    function probe(cam: THREE.PerspectiveCamera, x: number, y: number, depth: number) {
      const ray = new THREE.Vector3((x+.5)/640-1, 1-(y+.5)/400, .5).unproject(cam).sub(cam.position).normalize();
      const vars = {
        cameraPosition: cam.position.toArray(),
        vWaverleyRoofAirWorld: ray.multiplyScalar(depth).add(cam.position).toArray(),
        uWaverleyRoofAir: 1, gl_FragColor: [.24, .21, .18, 1],
      };
      code.run(block(source, 'waverley-roof-air'), { vars });
      return 255*(luma(vars.gl_FragColor)-luma([.24, .21, .18]));
    }
    const north = probe(bridge, 635, 367, 498);
    const northSky = probe(bridge, 545, 310, 5200);
    const hillRoof = probe(hill, 388, 469, 393);
    const near = probe(bridge, 913, 519, 38);
    const occluded = probe(hill, 388, 469, 160);
    const hillSky = probe(hill, 675, 350, 5200);
    console.log('Projected fog glow display luma', { north, hillRoof, near, occluded, northSky, hillSky });
    assert.ok(north > 9 && hillRoof > 7);
    assert.ok(near < 1 && occluded < .1 && northSky < 1 && hillSky < 1);
    assert.ok(shader(mesh(local.view.scene, roof).material).fragmentShader.includes('waverley-roof-air-begin'));
  } finally { local.dispose(); }
});

test('Waverley roof fog switches on and off through weather while Waverley and London daylight fingerprints and Perth receipts match main', async () => {
  const local = await weather('fog');
  const cam = camera('wv-roof-from-north-bridge');
  const main = new THREE.Scene();
  const kx = addLandmarks(main, track as KxData);
  const original = [local.sky.material as THREE.Material, ...[facade, structure, roof, castle].map(n => mesh(local.view.scene, n).material)];
  const materials = () => [local.sky.material as THREE.Material, ...[facade, structure, roof, castle].map(n => mesh(local.view.scene, n).material)];
  const london = [mesh(kx.group, 'landmarks-brickRed').material, cityMaterial('glass')];
  try {
    local.update(cam, '12:00', 0);
    const day = original.map(fingerprint), keys = original.map(m => m.customProgramCacheKey());
    const londonDay = london.map(fingerprint);
    assert.deepEqual(day, [
      '88bfc7b244a2892a7870c19f817280831533a634374bb5e26674a3d6738bf9ef',
      '8a4f97f10b89bc08bf9c9e181a3253b61a629c6bdae3af2b6a7b36f230a9a16f',
      'f92538cda46ae5ab2d78488388cc0c6bdc7869225dc436973ac498feedb84f33',
      '82399ff22b82e531c947b625b989134649f909b3246fd0b406e8c6ac55b66ce1',
      '8203f3c3668172f16676d671ac6728cdd59dc94713d52beb2d91d85863c120f7',
    ]);
    assert.deepEqual(londonDay, [
      '92c1407c78636c8b3a721d9865a1d6c56c4f9eabe55f948799cdded1e5f6bf42',
      'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99',
    ]);
    local.update(cam, '22:30', 1000);
    const fogKey = original[0]!.customProgramCacheKey();
    assert.ok(materials().every((m, i) => m === original[i]));
    local.update(cam, '12:00', 2000);
    assert.deepEqual(materials().map(fingerprint), day);
    assert.deepEqual(materials().map(m => m.customProgramCacheKey()), keys);
    assert.deepEqual(london.map(fingerprint), londonDay);
    for (const state of ['clear', 'rain', 'fog', 'snow'] as const) {
      assert.equal(digest(JSON.stringify(remoteWeatherSnapshot('pt', state, true))), expectedWeather[`pt/${state}`]);
    }
    assert.notEqual(fogKey, keys[0], 'the original sky selects the dense-night-fog program');
  } finally { local.dispose(); kx.dispose(); }
});

function midlandMasonry(built: Landmarks, opts: { h: number; field?: number; stage?: number; world?: number[] }) {
  const brick = mesh(built.group, 'landmarks-brickRed');
  const { night } = buildingNightMaterialsOf(brick)!;
  const source = shader(night).fragmentShader;
  const code = source.slice(source.indexOf('// midland-night-begin'), source.indexOf('// midland-lamp-wash-end'))
    .replaceAll('reflectedLight.directDiffuse', 'direct').replaceAll('reflectedLight.indirectDiffuse', 'indirect')
    .replace(/\bFLOOD\b/g, String(night.defines!.FLOOD));
  const vars = {
    vMidlandNight: [1, 0], vMidlandHeight: opts.h, vMidlandBrickBody: opts.h < 35 ? 1 : 0,
    vMidlandFacadeDetail: [0,0,0],
    vMidlandClockStage: opts.stage ?? 0, vMidlandGableField: opts.field ?? 0,
    uMidlandNight: 1, uMidlandLandmarkNight: 1,
    vViewPosition: [0, 0, 0], cameraPosition: opts.world ?? [-90, opts.h, 100], viewMatrix: matrix,
    diffuseColor: [.35, .12, .06, 1], direct: [.0245, .0084, .0042], indirect: [.0245, .0084, .0042],
    totalEmissiveRadiance: [.01575, .0054, .0027],
  };
  glsl.run(code, { vars });
  const channel = (i: number) => vars.direct[i]! + vars.indirect[i]! + vars.totalEmissiveRadiance[i]!;
  return luma(display([channel(0), channel(1), channel(2)]));
}

test('Midland brick gables stay subdued away from the local falloff around the clock dials', () => {
  const built = addLandmarks(new THREE.Scene(), track as KxData);
  try {
    const [dial] = built.group.userData.clockDials as { centre: V3; normal: V3 }[];
    const offset = (metres: number): number[] => dial!.centre.map((c, i) =>
      c - .14*dial!.normal[i]! + metres*[dial!.normal[2], 0, -dial!.normal[0]][i]!);
    const shaft = midlandMasonry(built, { h: 38 });
    const top = midlandMasonry(built, { h: 54, stage: 1 });
    const halo = midlandMasonry(built, { h: dial!.centre[1], stage: 1, world: offset(2.7) });
    const outer = midlandMasonry(built, { h: dial!.centre[1], stage: 1, world: offset(5.3) });
    const middle = midlandMasonry(built, { h: 15 });
    const gable = midlandMasonry(built, { h: 23.5, field: 1 });
    console.log('Midland estimated display luma', {shaft, top, halo, outer, middle, gable});
    assert.ok(top <= 1.23*shaft && halo > outer+6);
    assert.ok(gable <= middle && gable > 3);
    const faces = mesh(built.group, 'landmarks-brickRed').geometry.getAttribute('midlandGableField');
    assert.ok(Array.from(faces.array).some(x => x === 1), 'the existing triangle faces supply the night mask');
  } finally { built.dispose(); }
});

test('the Crick breaks up its lower floors and the east offices regain two continuous cool-white rows', () => {
  const city = cityOfficeAtNight(cityMaterial('glass') as THREE.MeshPhongMaterial);
  const central = createMaterials();
  function counts(material: THREE.Material, seed: number, fs: number[], rect: number[]) {
    const source = shader(material).fragmentShader;
    const from = source.indexOf('float winHash('), to = source.indexOf('float gk =', from);
    const end = source.indexOf('#include', source.indexOf('vec3 winOffice(', from));
    const code = new Glsl(source.slice(from, to > 0 ? Math.min(to, end) : end).replace(/^\s*#.*$/gm, ''));
    return fs.map(f => Array.from({ length: 18 }, (_, x) => code.call('winOffice',
      [[x+.5, f+.55], [.30, .13], seed, 1, rect, .44, .9, 420], { vars: {uOfficeFog: 0} }) as number[])
      .filter(c => luma(c) > .30).length);
  }
  try {
    const crick = counts(central.officesAtNight.get('curtain')!, 2.98, [0,1,2,3,4], [.03125,.96875,.2375,.975]);
    const east = counts(city, 183.992, [2,3,4,5,6,7], [...FACADE_GLASS.glass]);
    const next = counts(city, 198.094, [3,4,5], [...FACADE_GLASS.glass]);
    console.log('Office lit bay counts, out of 18', {crick, east, next});
    assert.ok(crick[3] === 0 && crick[2]! >= 14 && crick[4]! >= 14);
    assert.ok(east[2]! >= 15 && east[3]! >= 15 && next[1]! >= 15);
  } finally { city.dispose(); central.owned.forEach(m => m.dispose()); }
});
