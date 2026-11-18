import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { facadeTint } from '../../core/city.ts';
import cameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
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
const warmth = ([r,,b]: readonly number[]) => r! - b!;
const violetHue = ([r,g,b]: readonly number[]) => 240 + 60*(r!-g!)/(b!-g!);
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
const dial = mesh('waverley-balmoral-clock-dials');

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

function towerSampler(view: 'wv-balmoral-east-end' | 'wv-calton-hill-panorama') {
  const { fov,pos,target } = cameras[view];
  const camera = new THREE.PerspectiveCamera(fov,1.6,.1,20000);
  camera.position.fromArray(pos);
  camera.lookAt(new THREE.Vector3().fromArray(target));
  camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const stone = shader(tower.material).fragmentShader;
  const paint = shader(trim.material).fragmentShader;
  const diffuse = (s: string) => block(s,'balmoral-tower-diffuse')
    .replaceAll('reflectedLight.directDiffuse','direct').replaceAll('reflectedLight.indirectDiffuse','indirect');
  const glsl = new Glsl('');
  const stoneLight = glsl.snippet(block(stone,'balmoral-tower-wash')+block(stone,'balmoral-tower-grade')+diffuse(stone));
  const paintLight = glsl.snippet(strip(paint.slice(paint.indexOf('// station-light-begin'),paint.indexOf('// north-bridge-wash-begin')))+diffuse(paint));
  return (x: number, y: number) => {
    ray.setFromCamera(new THREE.Vector2((x+.5)/640-1,1-(y+.5)/400),camera);
    const hit = ray.intersectObjects([tower,trim,dial],false)[0];
    if (!hit?.normal || hit.object === dial) return undefined;
    const albedo = [.42,.34,.24];
    if (hit.object === trim && hit.face && hit.barycoord) {
      const colours = trim.geometry.getAttribute('color');
      const { a,b,c } = hit.face;
      const { x,y,z } = hit.barycoord;
      for (let i=0; i<3; i++) albedo[i] = x*colours.getComponent(a,i)+y*colours.getComponent(b,i)+z*colours.getComponent(c,i);
    }
    const vars = {
      vStationLampWorld:hit.point.toArray(), vStationLampNormal:hit.normal.toArray(), vBalmoralTowerU:hit.uv?.x ?? .25,
      diffuseColor:[...albedo,1], uStationLampLevel:1, totalEmissiveRadiance:[0,0,0],
      towerBuiltFlood:albedo.map((c,i) => c*[1,.82,.5][i]!*.02),
      direct:albedo.map(c=>c*.10), indirect:albedo.map(c=>c*.12),
    };
    const height = hit.point.y-base;
    (hit.object === tower ? stoneLight : paintLight)({ vars });
    return { height, kind: hit.object === tower ? 'tower' : 'trim',
      rgb: display(vars.totalEmissiveRadiance.map((c,i) => c+(hit.object===tower?vars.towerBuiltFlood[i]!:0)
        +vars.direct[i]!+vars.indirect[i]!)) };
  };
}

test('Balmoral cornice reads as a warm course alongside a violet stage and crown', () => {
  const sample = towerSampler('wv-balmoral-east-end');
  const cornice = [[640,169],[652,173],[665,178],[678,183],[691,188],[704,193]].map(([x,y]) => sample(x!,y!)!);
  const field = [[640,181],[652,186],[665,191],[678,196],[691,201],[704,206]].map(([x,y]) => sample(x!,y!)!);
  const crown = sample(622,145)!;
  const calton = towerSampler('wv-calton-hill-panorama');
  const caltonCourse = [776,782,789,796,803,809].map(x => calton(x,354)!);
  const caltonField = [776,782,789,796,802,809].map(x => calton(x,357)!);
  const colourMean = (samples: typeof cornice) => [0,1,2].map(i => +mean(samples.map(s=>s.rgb[i]!)).toFixed(1));
  console.log('Balmoral projected display RGB', JSON.stringify({
    cornice:colourMean(cornice),field:colourMean(field),crown:crown.rgb,
    caltonCourse:colourMean(caltonCourse),caltonField:colourMean(caltonField),
  }));
  assert.ok(cornice.every(s => warmth(s.rgb) >= 28 && luma(s.rgb) < 230));
  assert.ok(mean(cornice.map(s=>luma(s.rgb))) - mean(field.map(s=>luma(s.rgb))) >= 15);
  assert.ok(field.every(s => Math.abs(violetHue(s.rgb)-violetHue(crown.rgb)) <= 7));
  assert.ok(caltonCourse.every(s => warmth(s.rgb) >= 28));
  assert.ok(caltonField.every(s => Math.abs(violetHue(s.rgb)-violetHue(crown.rgb)) <= 8));
  assert.ok(!shader(dial.material).fragmentShader.includes('towerVioletWash'));
  assert.equal(dial.material.defines?.FLOOD_COLOUR,'vec3( 1.0, 0.94, 0.8 )');
});

test('Balmoral corbel tops and the turret returns beside them read as warm stone', () => {
  const sample = towerSampler('wv-balmoral-east-end');
  // Separate real corbel/return hits from the stage still visible within
  // the rows of the perspective crop.
  const rows = [262,266,270,274,278,282].map(y => numbers(560,170).map(x => sample(x,y))
    .filter(s => s !== undefined));
  const corbel = rows.map(row => row.filter(s => s.height >= 39.55 && s.height <= 41.35));
  const countViolet = (row: typeof rows[number]) => row.filter(({rgb: [r,g,b]}) => b!-r! > 22 && r! > g! && b! >= 95).length;
  const purple = corbel.map(countViolet);
  const calton = towerSampler('wv-calton-hill-panorama');
  const caltonReturn = [789,793,797,801,805].map(x => calton(x,373)!);
  console.log('Balmoral violet pixels by projected row', JSON.stringify({
    corbelHits:corbel.map(row=>row.length), corbelViolet:purple, wholeRowViolet:rows.map(countViolet),
    caltonReturnWarmth:mean(caltonReturn.map(s=>warmth(s.rgb))),
  }));
  assert.ok(corbel.flat().length >= 80);
  assert.ok(purple.every(n => n === 0));
  assert.ok(mean(corbel.flat().map(s=>warmth(s.rgb))) >= 45);
  assert.ok(caltonReturn.every(s => warmth(s.rgb) >= 35));
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
    assert.ok(nightWv.includes('stageStoneCourse') && !shader(tower.material).fragmentShader.includes('stageStoneCourse'));
  } finally { glow.setLevel(1); }
});
