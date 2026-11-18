import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { facadeTint } from '../../core/city.ts';
import { createMaterials } from '../src/kxcentral.ts';
import { buildingNightMaterialsOf, cityMaterial, cityOfficeAtNight, withBuildingNightMaterial } from '../src/materials.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl } from './glsl.ts';
import weatherReceipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const display = (rgb: number[]) => toSrgb(acesFilmic(rgb as unknown as V3, 2.3)).map(c => 255*c);
const mean = (v: number[]) => v.reduce((a,b) => a+b,0)/v.length;
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const numbers = (start: number, count: number) => Array.from({ length: count }, (_,i) => start+i);

const central = createMaterials();
const timber = central.officesAtNight.get('timber')!, crick = central.officesAtNight.get('curtain')!;
const cityDay = cityMaterial('glass') as THREE.MeshPhongMaterial;
const cityNight = cityOfficeAtNight(cityDay);
const wv = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(wv.group, .60);
const glow = createWaverleyGlow(wv.group);
const base = wv.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
glow.setLevel(1);
wv.group.updateMatrixWorld(true);
after(() => { central.owned.forEach(m => m.dispose()); cityNight.dispose(); glow.dispose(); undo(); wv.dispose(); });

function mesh(name: string) {
  const object = wv.group.getObjectByName(name);
  assert.ok(object instanceof THREE.Mesh && !Array.isArray(object.material), name);
  return object as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}
const tower = mesh('waverley-balmoral-tower');
const trim = mesh('waverley-frontage-structure');

function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
const strip = (source: string) => source.replace(/^\s*#.*$/gm, '');
function block(source: string, tag: string) {
  return strip(source.split(`// ${tag}-begin`)[1]!.split(`// ${tag}-end`)[0]!.replace(/^.*\n/, ''));
}

function officeMap(material: THREE.Material, derivatives: number[]) {
  const source = shader(material).fragmentShader;
  const declarations = source.split('#include <common>')[1]!.split('#include')[0]!;
  const body = source.split('#include <map_fragment>')[1]!.split('#include')[0]!;
  const defines = Object.fromEntries(Object.entries(material.defines ?? {}).filter(([k]) => k.startsWith('WIN_'))
    .map(([k,v]) => [k, String(v).startsWith('vec4') ? String(v).match(/[-.\d]+/g)!.slice(1).map(Number) : Number(v)]));
  const evaluate = new Glsl(declarations).snippet(strip(body));
  return (u: number, y: number, along: number, tint: readonly number[] = [0,0,0], night = 1) => {
    const vars = {
      ...defines, uWinNight:night, uOfficeFog:0, vMapUv:[u,y], vViewPosition:[0,0,420],
      vPlatform37Position:[-45.7+.148665*along,-163.3-.988888*along],
      vColor:[...tint], diffuseColor:[.04,.07,.09,1], totalEmissiveRadiance:[0,0,0],
    };
    evaluate({ vars, fns: { fwidth: () => derivatives } });
    return vars.totalEmissiveRadiance;
  };
}

test('Platform 37 carries lit and dark floors across its joins and keeps grouped occupancy', () => {
  const at = officeMap(timber,[.32,.16]);
  const joins = [36,72,108,147,186,225,258];
  const rows = (along: number, height: number) => numbers(0,height).map(floor =>
    luma(at(1,floor+.56,along)) > .1 ? '#' : '.');
  const adjacent = joins.map(join => {
    const left = rows(join-1.5,7), right = rows(join+1.5,7);
    return {
      lit: left.filter((s,i) => s === '#' && right[i] === s).length,
      dark: left.filter((s,i) => s === '.' && right[i] === s).length,
    };
  });
  const heights = [7,7,7,9,9,9,11,11];
  const cores = [18,54,90,127.5,166.5,205.5,241.5,274].map((along,i) => rows(along,heights[i]!).join(''));
  const coreFloors = cores.join('');
  const share = coreFloors.split('#').length-1;
  const occupancy = share/coreFloors.length;
  console.log('P37 shared lit/dark floors per join and section-core schedules', adjacent, cores, occupancy);
  assert.ok(adjacent.every(j => j.lit >= 2 && j.dark >= 2));
  assert.ok(adjacent.reduce((n,j) => n+j.lit+j.dark,0) >= 41);
  assert.ok(cores.every(s => s.includes('..') && s.includes('##')));
  assert.ok(occupancy >= .50 && occupancy <= .60);
});

test('occupied London offices fill more of each pane above display luma 120', () => {
  const p37 = officeMap(timber,[.32,.16]), cr = officeMap(crick,[.46,.18]), city = officeMap(cityNight,[.40,.20]);
  // 2–3 px wide windows in overview and south-front. Sample pane edges
  // and centres on each occupied storey, including intentionally dark bays.
  function brightness(sample: (bay: number, u: number, v: number) => number[], bays: number, floors: number[]) {
    const colours = floors.flatMap(floor => numbers(0,bays).flatMap(bay =>
      [.14,.25,.5,.75,.86].flatMap(u => [.27,.49,.72,.94].map(v => {
        const rgb = sample(bay,u,floor+v);
        return display(rgb.map((c,i) => c+[.012,.014,.02][i]!));
      }))));
    return { fill: mean(colours.map(rgb => Number(luma(rgb)>120))), luma: mean(colours.map(luma)),
      peak: Math.max(...colours.flat()) };
  }
  const blocks = [[265720685,[6,8,9,10]], [375735261,[4,5,7]], [260722156,[1,3,4]], [137827419,[1,2,5]]] as const;
  const outputs = {
    platform37: brightness((b,u,v) => p37(2*(b+u),v,18),12,[0,1,5,6]),
    crick: brightness((b,u,v) => cr(b+u,v,0),72,[1,2,4,5,6]),
    officeBlocks: blocks.map(([id,rows]) => brightness((b,u,v) => city(b+u,v,0,facadeTint(id)),22,[...rows])),
  };
  console.log('London office occupied-floor display samples', JSON.stringify(outputs));
  assert.ok(outputs.platform37.fill >= .80);
  assert.ok(outputs.crick.fill >= .65);
  assert.ok(outputs.officeBlocks.every(r => r.fill >= .90));
  assert.ok([outputs.platform37,outputs.crick,...outputs.officeBlocks].every(r => r.peak < 250));
  assert.deepEqual([p37(1,3.51,18), cr(.5,3.51,0), city(.5,7.51,0,facadeTint(265720685))],
    [[0,0,0],[0,0,0],[0,0,0]]);
});

test('KX and Balmoral keep their day shader bytes and Perth keeps its weather receipts', () => {
  const materials = [tower.material,trim.material,central.table.curtain,central.table.timber,cityDay];
  const registered = [
    withBuildingNightMaterial(new THREE.Mesh(new THREE.BufferGeometry(),central.table.timber),timber),
    withBuildingNightMaterial(new THREE.Mesh(new THREE.BufferGeometry(),central.table.curtain),crick),
    withBuildingNightMaterial(new THREE.Mesh(new THREE.BufferGeometry(),cityDay),cityNight),
  ];
  const nightWv = shader(tower.material).fragmentShader;
  glow.setLevel(0);
  try {
    assert.deepEqual(materials.map(m => {
      const s = shader(m);
      return digest(s.vertexShader+s.fragmentShader+JSON.stringify(m.defines??{}));
    }),[
      '66b2eadefe7abaa37e7dc9cd62ae938c7d8a331abc23a000820efada78413e93',
      '4aeb4eb21d33b24a62859a04a74b833e236572ccd4d079703f9401e0c05466ec',
      '44bdef302b3378e39d95d5ac5f4a1d4a20b82795f2d0337c7c05e770255a3ea9',
      '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65',
      'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99',
    ]);
    for (const [i,object] of registered.entries()) {
      assert.equal(object.material,[central.table.timber,central.table.curtain,cityDay][i]);
      assert.equal(buildingNightMaterialsOf(object)?.night,[timber,crick,cityNight][i]);
      object.geometry.dispose();
    }
    for (const state of ['clear','rain','fog','snow'] as const) {
      assert.equal(digest(JSON.stringify(remoteWeatherSnapshot('pt',state,true))),weatherReceipts[`pt/${state}`]);
    }
    assert.equal(tower.material,materials[0]);
    assert.equal(trim.material,materials[1]);
    assert.deepEqual(officeMap(timber,[.32,.16])(1,.53,18,undefined,.003),[0,0,0]);
    assert.ok(nightWv.includes('towerVioletWash') && !shader(tower.material).fragmentShader.includes('towerVioletWash'));
  } finally { glow.setLevel(1); }
});
