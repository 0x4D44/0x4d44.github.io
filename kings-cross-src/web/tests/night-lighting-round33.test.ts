import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { createMaterials } from '../src/kxcentral.ts';
import { WIN_NIGHT_GLSL } from '../src/materials.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow, WAVERLEY_WALL_WINDOWS } from '../src/waverley-night.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, type Value } from './glsl.ts';
import receipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';
import cameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };

const city = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(city.group, .60);
const glow = createWaverleyGlow(city.group);
const facade = 'waverley-balmoral-facade';
const walls = 'waverley-building-walls';
const ashlar = 'waverley-building-ashlar';
const tops = 'waverley-building-tops';
const monuments = 'waverley-city-monuments';
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: readonly number[]) => toSrgb(acesFilmic(rgb as V3, 2.3)).map(c => c*255);
after(() => { glow.dispose(); undo(); city.dispose(); });

function mesh(name: string): THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial> {
  const found = city.group.getObjectByName(name);
  assert.ok(found instanceof THREE.Mesh, name);
  return found;
}
function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
function fingerprint(material: THREE.Material) {
  const { vertexShader, fragmentShader } = shader(material);
  return hash(vertexShader + fragmentShader + JSON.stringify(material.defines ?? {}));
}
function block(source: string, tag: string) {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n', start), source.indexOf(`// ${tag}-end`, start)).replace(/^\s*#.*$/gm, '');
}
function evaluate(name: string, tag: string, vars: Record<string, Value>, span = [.03, .025]) {
  const source = shader(mesh(name).material).fragmentShader;
  const declarations = source.split('#include <common>')[1]!.split('#include')[0]!.replace(/^\s*#.*$/gm, '');
  const env = { vars: { totalEmissiveRadiance: [0, 0, 0], uStationLampLevel: 1, ...vars }, fns: { fwidth: () => span } };
  new Glsl(declarations).run(block(source, tag), env);
  return env.vars.totalEmissiveRadiance as number[];
}

test('Balmoral east-end patch has about half amber panes across five storeys and occupied ground arches', () => {
  glow.setLevel(1);
  const rows = [6.25, 10.50, 14.20, 17.80, 21.30];
  const base = new Glsl(WIN_NIGHT_GLSL);
  const material = mesh(facade).material;
  const hasRooms = !!block(shader(material).fragmentShader, 'balmoral-amber-rooms');
  function pane(bay: number, height: number, light = 1, u = .45) {
    if (!hasRooms) {
      const intensity = Number(material.defines!.WIN_GAIN);
      if (height < 8.7) return [0, 0, 0];
      return (base.call('winTile', [[bay+u, (height-8.7)/3.65], [.03, .025], .5, light,
        [.32,.68,.17,.77], [.60,0,.12,.1], 1], { vars: {} }) as number[]).map(value => value*intensity);
    }
    return evaluate(facade, 'balmoral-amber-rooms', {
      hotelHeight: height, vMapUv: [bay+u, (height+18)/43.5], uWinNight: light,
      sampledDiffuseColor: [.025,.032,.042,1],
    });
  }
  const patch = rows.map(height => [52,53,54,55].map(bay => pane(bay,height)));
  const lit = patch.flat().filter(rgb => luma(rgb) > .08);
  assert.ok(lit.length >= 9 && lit.length <= 11, `${lit.length}/20 windows`);
  assert.ok(patch.every(row => row.some(rgb => luma(rgb) > .08) && row.some(rgb => luma(rgb) < .005)));
  assert.ok(new Set(patch.map(row => row.map(rgb => + (luma(rgb) > .08)).join(''))).size >= 4);
  for (const rgb of lit.map(display)) {
    assert.ok(rgb[0]! - rgb[1]! > 12 && rgb[1]! - rgb[2]! > 22 && luma(rgb) < 235, rgb.join(', '));
  }
  assert.ok([52,53,54,55].some(bay => luma(pane(bay,2.15)) > .08));
  assert.deepEqual(pane(52,8.5), [0,0,0]);
  assert.deepEqual(pane(53,17.8,0), [0,0,0]);
  assert.deepEqual(pane(53,17.8,1,.78), [0,0,0]);
  assert.ok(patch[4]!.filter(rgb => luma(rgb) > .08).length >= 2, 'top floor has an occupied bay away from the corner');
});

test('the existing Calton landmark batches pick out gold masonry with shaded returns and sparse spill', () => {
  glow.setLevel(1);
  for (const name of [walls,ashlar,tops,monuments]) {
    const geometry = mesh(name).geometry;
    const tag = geometry.getAttribute('waverleyLandmarkWash');
    assert.equal(tag?.count, geometry.getAttribute('position').count, name);
    assert.ok(tag.array.some(value => value > 0), name);
    const v = {
      vWaverleyLandmarkWash: 1, vStationLampWorld: [-155,48,172],
      vWaverleyLandmarkProfile: [0,0],
      vStationLampNormal: [.52,0,-.85], diffuseColor: [.23,.23,.20,1],
      uStationLampFog: 0, vFogDepth: 710, fogNear: 100, fogFar: 2200,
    };
    const front = evaluate(name, 'calton-landmark-wash', v);
    const back = evaluate(name, 'calton-landmark-wash', { ...v, vStationLampNormal: [-.52,0,.85] });
    assert.ok(luma(front) > .16 && front[0]! > front[1]! && front[1]! > front[2]!, name);
    assert.ok(luma(back) < luma(front)*.6, name);
    assert.deepEqual(evaluate(name, 'calton-landmark-wash', { ...v, vWaverleyLandmarkWash: 0 }), [0,0,0]);
    assert.deepEqual(evaluate(name, 'calton-landmark-wash', { ...v, uStationLampFog: 1, fogFar: 220 }), [0,0,0]);
    const alreadyLit = [.43,.37,.26];
    assert.deepEqual(evaluate(name, 'calton-landmark-wash', { ...v, totalEmissiveRadiance: alreadyLit }), alreadyLit);
  }
});

const balmoralGold = [182,129,71];
const caltonAir = { uStationLampFog: 0, fogNear: 100, fogFar: 2200 };
const caltonHotels = [
  { name: 'Carlton', gain: 205/255, x: 197, z: 107, normal: [.985,0,-.173], depth: 381 },
  { name: 'Scotsman', gain: 195/255, x: 114, z: 85, normal: [.964,0,-.267], depth: 440 },
];
function caltonColour(vars: Record<string, Value>, depth: number) {
  const emission = evaluate(walls, 'calton-landmark-wash', { ...caltonAir, ...vars, vFogDepth: depth,
    diffuseColor: [.23,.23,.20,1],
  });
  const haze = THREE.MathUtils.smoothstep(depth, 100, 2200);
  return display(emission.map((c,i) => c+[.004,.006,.009][i]!)).map((c,i) => THREE.MathUtils.lerp(c,[14,22,38][i]!,haze));
}
function hotelRows(hotel: typeof caltonHotels[number]) {
  return [.87,.67,.47,.27].map(height => caltonColour({
    vWaverleyLandmarkWash: hotel.gain, vWaverleyLandmarkProfile: [1,height],
    vStationLampWorld: [hotel.x,12+height*38,hotel.z], vStationLampNormal: hotel.normal,
  },hotel.depth));
}

for (const hotel of caltonHotels) {
  test(`${hotel.name} uplight falls away by storey`, () => {
    glow.setLevel(1);
    const rows = hotelRows(hotel).map(luma);
    assert.ok(rows.every((value,i) => i === 0 || value >= rows[i-1]!+8), rows.join(', '));
  });
  test(`${hotel.name} gold stays below the Balmoral's brightness`, () => {
    glow.setLevel(1);
    const brightest = hotelRows(hotel).at(-1)!;
    const [r,g,b] = brightest as [number,number,number];
    assert.ok(luma(brightest) < luma(balmoralGold)-6 && r > g+24 && g > b+24, brightest.join(', '));
  });
}

for (const [name,x,y] of [['Carlton',65,676],['Scotsman',270,640],['Scotsman corner',253,609]] as const) {
  test(`${name} wall seen from the Balmoral keeps the main night material response`, () => {
    glow.setLevel(1);
    const spec = cameras['wv-balmoral-east-end'];
    const camera = new THREE.PerspectiveCamera(spec.fov, 1.6, .1, 20000);
    camera.position.fromArray(spec.pos);
    camera.lookAt(new THREE.Vector3().fromArray(spec.target));
    camera.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x+.5)/640-1,1-(y+.5)/400),camera);
    const hit = ray.intersectObject(mesh(walls),false)[0]!;
    const geometry = mesh(walls).geometry;
    const tag = geometry.getAttribute('waverleyLandmarkWash');
    const i = hit.face!.a;
    const win = geometry.getAttribute('wallWindowData');
    const vars = {
      ...caltonAir, vFogDepth: -hit.point.clone().applyMatrix4(camera.matrixWorldInverse).z,
      vWaverleyLandmarkWash: tag.getX(i),
      vWaverleyLandmarkProfile: [tag.getY(i),.5],
      vStationLampWorld: hit.point.toArray(), vStationLampNormal: hit.normal!.toArray(),
      diffuseColor: [.23,.23,.20,1], uWinNight: 1, WALL_TILE: [1,1],
      vWallWindowData: [win.getX(i),win.getY(i)], vMapUv: [hit.uv!.x/3,hit.uv!.y/3.6],
    };
    // The generic occupied panes already present on main are the starting emission.
    const mainsGrid = new Glsl(WIN_NIGHT_GLSL+WAVERLEY_WALL_WINDOWS.profile.fragment);
    const original = mainsGrid.call('waverleyWindowLight', [vars.vMapUv,[.13,.07],vars.vWallWindowData,vars.vFogDepth,1], { vars: {} }) as number[];
    const ridge = evaluate(walls, 'calton-ridge-windows', { ...vars,totalEmissiveRadiance: original }, [.13,.07]);
    const wash = evaluate(walls, 'calton-landmark-wash', { ...vars,totalEmissiveRadiance: ridge }, [.13,.07]);
    assert.deepEqual(wash, original);
  });
}

test('the Bank on the Mound is the brightest white-gold landmark in Calton', () => {
  glow.setLevel(1);
  const bank = caltonColour({
    vWaverleyLandmarkWash: 1, vWaverleyLandmarkProfile: [.5,0],
    vStationLampWorld: [-148,41.5,159], vStationLampNormal: [-.308,0,-.951],
  },689);
  const [r,g,b] = bank as [number,number,number];
  assert.ok(luma(bank) > 180 && r < 242 && r > g && g > b+8 && g < b+26, bank.join(', '));
});

test('distant Castle stone lifts toward pale grey and still dissolves in dense fog', () => {
  glow.setLevel(1);
  const v = {
    vStationLampWorld: [-640,86,356], vStationLampNormal: [.65,0,-.75],
    diffuseColor: [.23,.20,.17,1], uStationLampFog: 0,
    vFogDepth: 1135, fogNear: 100, fogFar: 2200,
  };
  const far = evaluate(monuments, 'castle-wash', v);
  const near = evaluate(monuments, 'castle-wash', { ...v, vFogDepth: 275 });
  assert.ok(luma(far) > 1.38*luma(near), `${luma(near)} -> ${luma(far)}`);
  const rgb = display(far);
  assert.ok(Math.max(...rgb) - Math.min(...rgb) < 21 && luma(rgb) < 245, rgb.join(', '));
  assert.deepEqual(evaluate(monuments, 'castle-wash', { ...v, uStationLampFog: 1, fogFar: 220 }), [0,0,0]);
  const snippet = new Glsl('').snippet(block(shader(mesh(monuments).material).fragmentShader, 'castle-clear-contrast'));
  function veiled(fog: number, depth: number, zone = 1) {
    const vars = { ...v, uStationLampLevel: 1, uStationLampFog: fog, vFogDepth: depth,
      castleZone: zone, gl_FragColor: [.45,.46,.48,1], fogColor: [.06,.08,.13] };
    snippet({ vars });
    return luma(vars.gl_FragColor);
  }
  const unlit = luma([.45,.46,.48]);
  assert.ok(veiled(0,1135) > unlit+.09);
  assert.ok(veiled(0,275) < unlit+.01);
  assert.equal(veiled(1,1135), unlit);
  assert.equal(veiled(0,1135,0), unlit);
});

test('ridge windows form warm clusters in previously dark bays with dark gaps and dense-fog extinction', () => {
  glow.setLevel(1);
  const v = {
    WALL_TILE: [1,1], WIN_GAIN: 1, vWallWindowData: [.53,0], uWinNight: 1,
    vStationLampWorld: [-84,45,210], vStationLampNormal: [.52,0,-.85],
    vWaverleyLandmarkProfile: [0,0],
    uStationLampFog: 0, vFogDepth: 660, fogNear: 100, fogFar: 2200,
  };
  const grid = new Glsl(WIN_NIGHT_GLSL + WAVERLEY_WALL_WINDOWS.profile.fragment);
  const rows = Array.from({length: 4}, (_, row) => Array.from({length: 15}, (_, bay) => {
    const uv = [bay+.5,row+.56];
    const before = grid.call('waverleyWindowLight', [uv,[.28,.20],v.vWallWindowData,660,1], { vars: {} }) as number[];
    const gain = evaluate(walls,'calton-ridge-windows',{...v,vMapUv:uv},[.28,.20]);
    if (luma(before) > .03) assert.deepEqual(gain,[0,0,0]);
    if (luma(gain) > .035) assert.ok(gain[0]! > gain[1]! && gain[1]! > gain[2]!);
    return gain;
  }));
  const on = (rgb: number[]) => luma(rgb) > .035;
  const lit = rows.flat().filter(on).length;
  assert.ok(lit >= 7 && lit <= 25 && rows.some(row => row.some((rgb, index) => index > 0 && on(rgb) && on(row[index-1]!))), `${lit}/60 new panes`);
  for (let bay = 0; bay < 15; bay++) {
    const uv = [bay+.5,1.56];
    assert.deepEqual(evaluate(walls,'calton-ridge-windows',{...v,vMapUv:uv,vStationLampWorld:[230,45,-210]}),[0,0,0]);
    assert.deepEqual(evaluate(walls,'calton-ridge-windows',{...v,vMapUv:uv,uStationLampFog:1,fogFar:220}),[0,0,0]);
  }
});

test('Waverley night programs restore the original day materials and KX and Perth keep their main receipts', () => {
  const targets = [facade,walls,ashlar,tops,monuments].map(mesh);
  const materials = targets.map(target => target.material);
  glow.setLevel(0);
  const day = materials.map(fingerprint);
  assert.deepEqual(day, [
    '3b5095bbe90dd8c8b35f7010fb3ecabc553bd1fede29d7f4b409ac2583354ede',
    '0aab669a9be27bf6ec5380851048a71bbec6478f17471fafbcdeaf66a8d26bf9',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
    '3f984952ca2cf4844e5731727c152c6db8e69bf97036121dc638569362e7f4ba',
  ]);
  glow.setLevel(1);
  assert.match(shader(materials[0]!).fragmentShader, /balmoral-amber-rooms-begin/);
  assert.match(shader(materials[1]!).fragmentShader, /calton-ridge-windows-begin/);
  glow.setLevel(0);
  assert.ok(targets.every((target,i) => target.material === materials[i]));
  assert.deepEqual(materials.map(fingerprint), day);
  const kx = createMaterials();
  try {
    const material = kx.table.timber;
    assert.equal(fingerprint(material), '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65');
  } finally { kx.owned.forEach(material => material.dispose()); }
  for (const state of ['clear','rain','fog','snow'] as const) {
    assert.equal(hash(JSON.stringify(remoteWeatherSnapshot('pt',state,true))), receipts[`pt/${state}`]);
  }
});
