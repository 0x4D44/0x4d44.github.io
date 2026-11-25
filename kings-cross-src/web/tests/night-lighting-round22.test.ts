import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { addRoofShade } from '../src/lighting.ts';
import { createWaverleyWeather, lightPerthNight, lightWaverleyNight } from '../src/station-weather.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import waverleyData from '../src/data/waverley-scene.json' with { type: 'json' };
import { Glsl, Sampler, type Env } from './glsl.ts';

type RGB = [number, number, number];
type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const facadeName = 'waverley-balmoral-facade';
const structureName = 'waverley-frontage-structure';
const roofName = 'waverley-mapped-roofs';
const towerName = 'waverley-balmoral-tower';
const castleName = 'waverley-city-monuments';
const luma = ([r, g, b]: RGB) => .2126*r + .7152*g + .0722*b;
const glsl = new Glsl('');

function named(scene: THREE.Object3D, name: string): Mesh {
  const mesh = scene.getObjectByName(name) as Mesh | undefined;
  assert.ok(mesh?.isMesh, name);
  return mesh;
}

function shader(material: Mesh['material']) {
  const { vertexShader, fragmentShader } = THREE.ShaderLib.lambert!;
  const result = { vertexShader, fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  material.onBeforeCompile(result as never, undefined as never);
  return result;
}

function block(source: string, tag: string) {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n', start), source.indexOf(`// ${tag}-end`, start)).replace(/^\s*#.*$/gm, '');
}

function signature(material: Mesh['material']) {
  const { vertexShader, fragmentShader } = shader(material);
  return createHash('sha256').update(vertexShader).update(fragmentShader)
    .update(JSON.stringify(material.defines ?? {})).digest('hex');
}

const built = buildWaverleyScene({ lighting: false });
const base = built.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
const undoWindows = lightWaverleyNight(built.group, .60);
const glow = createWaverleyGlow(built.group);
glow.setLevel(1);
after(() => { glow.dispose(); undoWindows(); built.dispose(); });

test('Balmoral floodlight picks out the built courses without losing the lower wash or room contrast', () => {
  const wall = named(built.group, facadeName);
  const source = shader(wall.material).fragmentShader;
  const code = ['balmoral-facade-wash', 'balmoral-bands', 'balmoral-body-uplight'].map(tag => block(source, tag)).join('\n');
  function sample(height: number, albedo: RGB = [.44, .34, .24]): RGB {
    const env = { vars: {
      vStationLampWorld: [58, base + height, -122], diffuseColor: [...albedo, 1],
      uStationLampLevel: 1, totalEmissiveRadiance: [0, 0, 0],
    }};
    glsl.run(code, env);
    return env.vars.totalEmissiveRadiance as RGB;
  }
  const ground = sample(4), lower = sample(10.3), between = sample(15.6), upper = sample(21);
  const sill = sample(16.65), underCornice = sample(24.3), glass = sample(15.6, [.022, .025, .031]);
  const windowLight = new Glsl(source.slice(source.indexOf('vec3 winLight('), source.indexOf('vec3 winMean(')))
    .call('winLight', [[.26, .8, .3, .4], 1, .60, .12, .1], { vars: {} }) as RGB;
  const roomCode = block(source, 'balmoral-room-contrast');
  function room(emission: RGB): RGB {
    const env = { vars: { balmoralStoneEmission: glass, totalEmissiveRadiance: glass.map((channel, i) => channel + emission[i]!) } };
    glsl.run(roomCode, env);
    return env.vars.totalEmissiveRadiance as RGB;
  }
  const window = room(windowLight.map(channel => channel*Number(wall.material.defines!.WIN_GAIN)) as RGB);
  const litWallContrast = luma(window) - luma(between);
  console.log('Balmoral facade emission', {ground, lower, between, upper, sill, underCornice, litWallContrast});
  assert.ok(luma(sill) - luma(between) > .023 && luma(sill) > 1.8*luma(between), 'the third-storey sill stands out from the wall');
  assert.ok(luma(underCornice) > .12 && luma(underCornice) > 4*luma(upper), 'the frieze is bright against the upper storey');
  assert.ok(luma(ground) > .040 && luma(lower) > .062 && luma(between) > .022 && luma(upper) > .014, 'all storeys keep visible fill');
  assert.ok(between[0]/between[1] > 2.8 && litWallContrast > .385 && luma(glass) < .09*luma(between),
    'orange-gold stone sets off occupied rooms and allows empty windows to stay dark');
  assert.deepEqual(room([0, 0, 0]), glass);
  assert.deepEqual(room([.75, .65, .55]), glass.map((channel, i) => channel + [.75, .65, .55][i]!));
  assert.ok(source.indexOf('vec3 balmoralStoneEmission') < source.indexOf('totalEmissiveRadiance += ( WIN_GAIN')
    && source.indexOf('totalEmissiveRadiance += ( WIN_GAIN') < source.indexOf('vec3 roomEmission'));
});

test('Balmoral crown takes a violet wash above the clock stage and leaves the bridge alone', () => {
  const source = shader(named(built.group, structureName).material).fragmentShader;
  function sample(x: number, y: number, z: number): RGB {
    const env = { vars: { vStationLampWorld: [x, y, z], uStationLampLevel: 1, totalEmissiveRadiance: [0, 0, 0] } };
    glsl.run(block(source, 'balmoral-crown'), env);
    return env.vars.totalEmissiveRadiance as RGB;
  }
  const cap = sample(55, base + 54, -126);
  console.log('Balmoral cap emission', cap);
  const env = { vars: {
    vStationLampWorld: [74, base + 24.9, -136], vStationLampNormal: [1, 0, 0],
    diffuseColor: [.5, .5, .5, 1], uStationLampLevel: 1, totalEmissiveRadiance: [0, 0, 0],
  }};
  glsl.run(block(source, 'balmoral-trim'), env);
  const cornice = env.vars.totalEmissiveRadiance as RGB;
  console.log('Balmoral projected cornice face emission', cornice);
  assert.ok(cap[2] > cap[0] && cap[1] < .035 && luma(cap) > .060361);
  assert.deepEqual(sample(55, base + 48, -126), [0, 0, 0]);
  assert.deepEqual(sample(130, 15, 30), [0, 0, 0]);
  assert.ok(cornice[0] > .38 && cornice[0] > 3*cornice[1]);
});

test('North Bridge glazing has dark cassette bars and distinct glints at the actual pendant rows', () => {
  const { fragmentShader, uniforms } = shader(named(built.group, roofName).material);
  const code = block(fragmentShader, 'station-light') + block(fragmentShader, 'waverley-roof-transmission');
  const map = uniforms.uWaverleyRoofLight!.value as THREE.DataTexture;
  const rect = uniforms.uWaverleyRoofRect!.value as THREE.Vector4;
  const { width, height } = map.image;
  const data = map.image.data as Uint8Array;
  function sample(x: number, z: number, albedo: number, snow = 0) {
    const vars = {
      vStationLampWorld: [x, 9, z], vStationLampNormal: [.37, 1, 0], cameraPosition: [x+34, 16.73, z],
      diffuseColor: [albedo*.30, albedo*.30, albedo*.30, 1],
      uStationLampLevel: 1, uStationLampSnow: snow, uStationLampFog: 0, uWaverleyRoofWet: 0, sampledDiffuseColor: [albedo, albedo, albedo, 1],
      uWaverleyRoofRect: rect.toArray(), uWaverleyRoofLight: new Sampler(null), totalEmissiveRadiance: [0, 0, 0],
    };
    const env: Env = { vars, fns: { texture2D: (_sampler, uv) => {
      const [u, v] = uv as [number, number];
      const i = THREE.MathUtils.clamp(Math.floor(u*width), 0, width-1);
      const j = THREE.MathUtils.clamp(Math.floor(v*height), 0, height-1);
      return [Number(data[j*width+i])/255, 0, 0, 1];
    }}};
    glsl.run(code, env);
    return { emitted: luma(vars.totalEmissiveRadiance as RGB), diffuse: vars.diffuseColor[0]! };
  }
  // Use a real pendant under the eastern shed, then move along the same strip.
  const heads = built.group.getObjectByName('waverley-roof')!.userData.platformLampHeads as number[];
  const [x, , z] = heads.slice(0, 3) as RGB;
  const glint = sample(x, z, .20), edge = sample(x, z, .33), bar = sample(x, z, .57);
  const shoulder = sample(x, z + 11, .20), snow = sample(x, z, .57, 1);
  console.log('Waverley cassette samples', {glint, edge, bar, shoulder, snow});
  assert.ok(glint.emitted > .44 && glint.emitted > shoulder.emitted + .13);
  assert.ok(edge.emitted < .67*glint.emitted && bar.diffuse < .07 && bar.emitted < .04);
  assert.equal(snow.emitted, 0);
  assert.equal(snow.diffuse, .57*.30);
});

test('Waverley roof and Balmoral retain nearby contrast in fog and the distant Castle reaches the fog colour', () => {
  function retained(name: string, tag: string, depth: number, y: number, fog = 1, x = 55, z = -126) {
    const env = { vars: {
      vStationLampWorld: [x, y, z], vStationLampNormal: [.37, 1, 0], uStationLampLevel: 1, uStationLampFog: fog,
      fogNear: -17, fogFar: 220, vFogDepth: depth, fogColor: [0, 0, 0], gl_FragColor: [1, 1, 1, 1],
      diffuseColor: [.5, .5, .5, 1], totalEmissiveRadiance: [0, 0, 0],
    }};
    const source = shader(named(built.group, name).material).fragmentShader;
    const preceding = name === castleName ? block(source, 'castle-wash') : '';
    glsl.run(preceding + block(source, tag), env);
    return env.vars.gl_FragColor[0]!;
  }
  const roof = [20, 65, 145, 210].map(d => {
    const sceneContrast = 1 - THREE.MathUtils.smoothstep(d, -17, 220);
    return sceneContrast * retained(roofName, 'waverley-roof-fog', d, 12);
  });
  const facade = [20, 65, 125].map(d => retained(facadeName, 'balmoral-facade-fog', d, base + 16));
  const hotel = [28, 36, 48, 54].map(h => retained(towerName, 'balmoral-tower-fog', 125, base + h));
  const castle = retained(castleName, 'castle-fog-colour', 1150, 85, 1, -640, 350);
  console.log('Waverley local fog contrast multipliers', {roof, facade, hotel, castle});
  assert.ok(roof[0]! > .92 && roof[1]! < .65 && roof[2]! < .16 && roof[3]! < .005);
  assert.ok(facade[0]! > .99 && facade[1]! < .93 && facade[2]! < facade[1]!);
  assert.ok(hotel[0]! > hotel[1]! && hotel[1]! > hotel[2]! && hotel[2]! > hotel[3]! && hotel[3]! > .44);
  assert.equal(castle, 0);
  assert.equal(retained(castleName, 'castle-fog-colour', 1150, 85, 0, -640, 350), 1);
  assert.equal(retained(castleName, 'castle-fog-colour', 1150, 85, 1, -500, 350), 1);
});

test('the live Waverley night variants return to the exact main daylight programs and keep Perth material identity', async () => {
  const model = buildWaverleyScene({ lighting: false });
  const view = await loadWaverleyScene({
    modelLoader: async () => ({ buildWaverleyScene: () => model }), geometryLoader: async () => ({ default: waverleyData }),
  });
  const climate = createWaverleyWeather(view, { mode: 'forced', forced: 'clear' });
  const perth = new THREE.Group(), stone = new THREE.MeshLambertMaterial({ map: new THREE.Texture() });
  addRoofShade(stone);
  const perthWall = new THREE.Mesh(new THREE.BoxGeometry(), stone);
  perthWall.name = 'perth-city-walls';
  perth.add(perthWall);
  const undoPerth = lightPerthNight(perth);
  const perthKey = stone.customProgramCacheKey();
  const camera = new THREE.PerspectiveCamera(), target = new THREE.Vector3();
  camera.position.set(130, 20, 40);
  const at = (time: string, wallMs: number) => climate.update({ camera, target, timeMs: Date.parse(time), wallMs });
  const day = '2026-11-20T12:00:00Z';
  const meshes = [facadeName, roofName, structureName, towerName, castleName].map(name => named(view.scene, name));
  const materials = meshes.map(mesh => mesh.material), geometries = meshes.map(mesh => mesh.geometry);
  const topology = () => meshes.map(mesh => [mesh.geometry.index!.count, mesh.geometry.groups.length, mesh.renderOrder]);
  try {
    at(day, 0);
    const signatures = materials.map(signature), keys = materials.map(m => m.customProgramCacheKey()), counts = topology();
    console.log('Waverley daylight shader hashes', signatures);
    assert.deepEqual(signatures, [
      '6b15ceb045deebc589e82b2f9d7399f0401f22b6521ac9cc05f805722aa94b27',
      'e8b4cedbcac1ba8810ac0663590e941c2ba4b157e54130045bef156305838e07',
      '7785ec87a1c71d5c200526f75f770d53c1c552f254b0eb3f0288c2faed83c2c4',
      '7885d4083f1069c7b17b25cf6dd3bd2f79492e72b75e9428b678f43e0c4a1ed2',
      'a95c24c25bd578363c7398c3cd01f8a8825a73e10792b3deb808dd0d4dd68619',
    ]);
    at('2026-11-20T22:30:00Z', 1000);
    assert.ok(meshes.every((mesh, i) => mesh.material === materials[i] && mesh.geometry === geometries[i]));
    assert.deepEqual(topology(), counts);
    const nightKeys = materials.map(m => m.customProgramCacheKey());
    const nightSignatures = materials.map(signature);
    at(day, 2000);
    assert.deepEqual(materials.map(signature), signatures);
    assert.deepEqual(materials.map(m => m.customProgramCacheKey()), keys);
    assert.ok(meshes.every((mesh, i) => mesh.material === materials[i] && mesh.geometry === geometries[i]));
    assert.deepEqual(topology(), counts);
    assert.ok(perthWall.material === stone);
    assert.equal(signature(stone), '946ecfbf5b66096fbbab475265a39e7ee20196fa3948de773784dc443db5d017');
    assert.equal(stone.customProgramCacheKey(), perthKey);
    assert.ok(nightKeys.every((key, i) => key !== keys[i] && nightSignatures[i] !== signatures[i]),
      'each changed material selects a distinct program through the real weather entry point');
  } finally {
    climate.dispose(); view.dispose(); undoPerth(); perthWall.geometry.dispose(); stone.map!.dispose(); stone.dispose();
  }
});
