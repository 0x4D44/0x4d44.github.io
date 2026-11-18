import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { after } from 'node:test';
import * as THREE from 'three';
import { facadeTint } from '../../core/city.ts';
import cameras from '../../tools/tests/frozen-waverley-cameras.json' with { type: 'json' };
import { createMaterials } from '../src/kxcentral.ts';
import { cityMaterial, cityOfficeAtNight, FACADE_GLASS } from '../src/materials.ts';
import { lightWaverleyNight } from '../src/station-weather.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { acesFilmic, toSrgb, type V3 } from './aces.ts';
import { Glsl, Sampler } from './glsl.ts';
import weatherReceipts from './fixtures/remote-weather-322a72a3.json' with { type: 'json' };
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

const luma = ([r, g, b]: readonly number[]) => .2126*r! + .7152*g! + .0722*b!;
const hue = ([r, g, b]: readonly number[]) => 240 + 60*(r!-g!)/(b!-Math.min(r!,g!));
const display = (rgb: number[]) => toSrgb(acesFilmic(rgb as unknown as V3, 2.3)).map(c => +(255*c).toFixed(1));
const digest = (s: string) => createHash('sha256').update(s).digest('hex');
const glsl = new Glsl('');
const central = createMaterials();
const cityDay = cityMaterial('glass') as THREE.MeshPhongMaterial;
const cityNight = cityOfficeAtNight(cityDay);
const wv = buildWaverleyScene({ lighting: false });
const undo = lightWaverleyNight(wv.group, .60);
const glow = createWaverleyGlow(wv.group);
const base = wv.group.getObjectByName('waverley-frontage')!.userData.frontage.P as number;
const tower = 'waverley-balmoral-tower', structure = 'waverley-frontage-structure', roof = 'waverley-mapped-roofs';
glow.setLevel(1);
wv.group.updateMatrixWorld(true);
after(() => { central.owned.forEach(m => m.dispose()); cityNight.dispose(); glow.dispose(); undo(); wv.dispose(); });

function mesh(name: string) {
  const result = wv.group.getObjectByName(name);
  assert.ok(result instanceof THREE.Mesh && !Array.isArray(result.material), name);
  return result as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
}
function shader(material: THREE.Material) {
  const lib = material instanceof THREE.MeshPhongMaterial ? THREE.ShaderLib.phong : THREE.ShaderLib.lambert;
  const source = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} as Record<string, THREE.IUniform> };
  material.onBeforeCompile(source as never, undefined as never);
  return source;
}
function block(source: string, tag: string) {
  return source.split(`// ${tag}-begin`)[1]!.split(`// ${tag}-end`)[0]!.replace(/^.*\n/, '').replace(/^\s*#.*$/gm, '');
}
function officeLuma(material: THREE.Material, floors: number[], bays: number[], seed: number, rect: readonly number[]) {
  const { fragmentShader: source } = shader(material);
  const start = source.indexOf('float winHash(');
  const end = source.indexOf('#include', source.indexOf('vec3 winOffice(', start));
  const gk = source.indexOf('float gk =', start);
  const code = new Glsl(source.slice(start, gk < 0 ? end : Math.min(end, gk)).replace(/^\s*#.*$/gm, ''));
  return floors.map(floor => bays.map(bay =>
    luma(code.call('winOffice', [[bay+.5, floor+.56], [.32,.16], seed, 1, [...rect], .44, .9, 420],
      { vars: {uOfficeFog:0} }) as number[])));
}
const numbers = (start: number, count: number) => Array.from({length:count}, (_, i) => start+i);
const mean = (values: number[]) => values.reduce((a,b) => a+b,0)/values.length;
const timberGlass = [.14,.86,1/4.2,.98];
const curtainGlass = [.03125,.96875,.2375,.975];
const litShare = (row: number[]) => mean(row.map(v => Number(v > .30)));
const pattern = (row: number[]) => row.map(v => v > .30 ? '#' : '.').join('');
const darkRun = (row: number[]) => Math.max(...pattern([...row,...row]).split('#').map(s => s.length));

test('Platform 37 staggers coherent occupancy and double dark floors along the terraces', () => {
  const material = central.officesAtNight.get('timber')!;
  const groups = [7,7,7,9,9,9,11,11].map((height,group) =>
    officeLuma(material,numbers(0,height),numbers(128*group,24),6.99,timberGlass));
  const schedules = groups.map(floors => floors.map(row => litShare(row) >= .75 ? '#' : '.').join(''));
  const occupied = mean(groups.flat().map(row => Number(litShare(row) >= .75)));
  console.log('Platform 37 schedules from the ground up', schedules, 'occupied share', occupied,
    'lit pane share', mean(groups.flat().map(litShare)));
  assert.ok(new Set(schedules).size >= 7);
  assert.ok(schedules.every(row => row.includes('..') && row.includes('##')));
  assert.ok(occupied >= .50 && occupied <= .60);
  assert.ok(groups.flat().every(row => litShare(row) === 0 || litShare(row) >= .75));

  const source = shader(material).fragmentShader;
  const declarations = source.split('#include <common>')[1]!.split('#include')[0]!;
  const body = source.split('#include <map_fragment>')[1]!.split('#include')[0]!.replace(/^\s*#.*$/gm,'');
  const evaluate = new Glsl(declarations).snippet(body);
  const room = (distance: number, floor: number) => {
    const vars = {
      uWinNight:1, uOfficeFog:0, vMapUv:[1,floor+.56], vViewPosition:[0,0,420],
      vPlatform37Position:[-45.7+.148665*distance,-163.3-.988888*distance],
      totalEmissiveRadiance:[0,0,0],
    };
    evaluate({vars,fns:{fwidth:()=>[.32,.16]}});
    return luma(vars.totalEmissiveRadiance);
  };
  assert.ok(room(20,0) > .12 && room(120,0) === 0);
  assert.ok(room(20,3) === 0 && room(120,3) > .12);
});

test('Crick gains a coherent visible floor while retaining staggered full-width dark suites', () => {
  const rows = officeLuma(central.officesAtNight.get('curtain')!,numbers(0,11),numbers(0,72),2.98,curtainGlass);
  const shares = rows.map(litShare), gaps = rows.map(darkRun);
  console.log('Crick pane share and vacant suite length', shares,gaps,'lower facade lit pane share',mean(shares.slice(0,8)));
  assert.deepEqual(shares.slice(0,8).map(v => v >= .70), [false,true,true,false,true,true,true,false]);
  assert.ok([1,2,4,5,6].every(i => gaps[i]! >= 14 && gaps[i]! <= 19));
  assert.ok(new Set([1,2,4,5,6].map(i=>pattern(rows[i]!))).size === 5);
  assert.ok(shares.filter(v=>v>=.65).length === 6);
});

test('upper curtain walls recover lit coverage on distinct whole-floor schedules', () => {
  const blocks = [[265720685,5,6], [375735261,2,6], [260722156,1,5], [137827419,1,5]] as const;
  const rows = blocks.map(([id,first,count]) => {
    const seed = facadeTint(id).reduce((v,c,i) => v + c*[37.1,91.7,53.3][i]!,0);
    return officeLuma(cityNight,numbers(first,count),numbers(0,22),seed,FACADE_GLASS.glass);
  });
  const shares = rows.map(floors=>floors.map(litShare));
  const schedules = shares.map(floors=>floors.map(v=>v>=.75?'#':'.').join(''));
  const whole = shares.flat().filter(v=>v>=.75).length;
  const brightestFloorMeans = rows.flat().map(mean).filter(v=>v>.30);
  console.log('Curtain-wall schedules, pane shares and occupied-floor mean luma', schedules,shares,mean(brightestFloorMeans));
  assert.equal(whole,14);
  assert.ok(new Set(schedules).size === 4 && shares.flat().every(v=>v===0 || v>=.75));
  assert.ok(mean(brightestFloorMeans) >= .85);
});

test('Balmoral stage has a lifted blue-violet cornice and stops above the corbel', () => {
  const stone = shader(mesh(tower).material).fragmentShader;
  const paint = shader(mesh(structure).material).fragmentShader;
  const grade = block(stone,'balmoral-tower-wash') + block(stone,'balmoral-tower-grade')
    + block(stone,'balmoral-tower-diffuse').replaceAll('reflectedLight.directDiffuse','direct').replaceAll('reflectedLight.indirectDiffuse','indirect');
  const stageAt = (height: number) => {
    const albedo = [.42,.34,.24];
    const vars = {
      vStationLampWorld:[49.85,base+height,-130.78], vStationLampNormal:[-.27,0,-.96], vBalmoralTowerU:.25,
      diffuseColor:[...albedo,1], uStationLampLevel:1, totalEmissiveRadiance:[0,0,0],
      towerBuiltFlood:albedo.map((c,i) => c*[1,.82,.5][i]!*.02),
      direct:albedo.map(c=>c*.10), indirect:albedo.map(c=>c*.12),
    };
    glsl.run(grade,{vars});
    return display(vars.totalEmissiveRadiance.map((c,i) => c+vars.towerBuiltFlood[i]!+vars.direct[i]!+vars.indirect[i]!));
  };
  const paintAt = (height: number) => {
    const source = paint.slice(paint.indexOf('// station-light-begin'),paint.indexOf('// north-bridge-wash-begin'))
      .replace(/^\s*#.*$/gm,'');
    const vars = {
      vStationLampWorld:[49.85,base+height,-130.78], vStationLampNormal:[-.27,0,-.96],
      diffuseColor:[.42,.34,.24,1], uStationLampLevel:1, totalEmissiveRadiance:[0,0,0],
    };
    glsl.run(source,{vars});
    return display(vars.totalEmissiveRadiance);
  };
  const vars = {vStationLampWorld:[58.55,base+50.53,-133.86],uStationLampLevel:1,totalEmissiveRadiance:[.025,.020,.016]};
  glsl.run(block(paint,'balmoral-crown'),{vars});
  const crown = display(vars.totalEmissiveRadiance);
  const field = stageAt(47.7), course = stageAt(48.82), corbel = paintAt(40.99), paintCourse = paintAt(48.82);
  console.log('Balmoral display RGB', {crown,field,course,corbel,paintCourse,lowerStage:stageAt(41.25)});
  assert.ok(luma(course)-luma(field) >= 10);
  assert.ok(Math.abs(hue(field)-hue(course)) <= 4 && Math.abs(hue(course)-hue(crown)) <= 8);
  assert.ok(corbel[0]! >= corbel[2]!+35, 'corbel top remains warm');
  assert.ok(Math.abs(hue(paintCourse)-hue(crown)) <= 8);
  assert.ok(hue(stageAt(41.25)) >= 260 && hue(stageAt(41.25)) <= 277);
  const dial = shader(mesh('waverley-balmoral-clock-dials').material).fragmentShader;
  assert.ok(!dial.includes('towerVioletWash'));

});

test('five North Bridge glints follow cassette edges with bounded brightness', () => {
  const glazing = mesh(roof);
  const { fragmentShader, uniforms } = shader(glazing.material);
  const code = glsl.snippet(block(fragmentShader,'station-light') + block(fragmentShader,'waverley-roof-transmission'));
  const spec = cameras['wv-roof-from-north-bridge'];
  const camera = new THREE.PerspectiveCamera(spec.fov,1.6,.1,20000);
  camera.position.fromArray(spec.pos); camera.lookAt(new THREE.Vector3().fromArray(spec.target)); camera.updateMatrixWorld();
  const ray = new THREE.Raycaster();
  const rect = uniforms.uWaverleyRoofRect!.value as THREE.Vector4;
  const light = (uniforms.uWaverleyRoofLight!.value as THREE.DataTexture).image;
  const sample = (x:number, y:number, fog=0, wet=0, snow=0, albedo=.20) => {
    ray.setFromCamera(new THREE.Vector2((x+.5)/640-1,1-(y+.5)/400),camera);
    const hit = ray.intersectObject(glazing,false)[0];
    assert.ok(hit?.normal && Math.abs(hit.normal.x)>.10);
    const vars = {
      vStationLampWorld:hit.point.toArray(), vStationLampNormal:hit.normal.toArray(), cameraPosition:camera.position.toArray(),
      diffuseColor:[.062,.062,.062,1], sampledDiffuseColor:[albedo,albedo,albedo,1], uStationLampLevel:1,
      uStationLampSnow:snow,uStationLampFog:fog,uWaverleyRoofWet:wet,uWaverleyRoofRect:rect.toArray(),
      uWaverleyRoofLight:new Sampler(null),totalEmissiveRadiance:[0,0,0],
    };
    code({vars,fns:{texture2D:(_map,uv)=>{
      const [u,v] = uv as [number,number];
      const px=u*light.width-.5, py=v*light.height-.5;
      const i=Math.floor(px), j=Math.floor(py), clamp=THREE.MathUtils.clamp, lerp=THREE.MathUtils.lerp;
      const at=(xx:number,yy:number)=>(light.data as Uint8Array)[clamp(yy,0,light.height-1)*light.width+clamp(xx,0,light.width-1)]!/255;
      return [lerp(lerp(at(i,j),at(i+1,j),px-i),lerp(at(i,j+1),at(i+1,j+1),px-i),py-j),0,0,1];
    }}});
    return display(vars.totalEmissiveRadiance);
  };
  const sites = [
    [1081.1,480.4,1084,480.4,1086.5,480.3,1075,480.6],
    [1042.9,481.5,1045.8,481.4,1048.4,481.4,1036.6,481.7],
    [1065.2,499.2,1068.2,499.1,1070.9,499,1058.6,499.4],
    [1104.8,497.9,1107.8,497.8,1110.4,497.7,1098.4,498.1],
    [1058,519.7,1061.1,519.5,1064,519.4,1051.1,519.9],
  ] as const;
  const warmth = (rgb: number[]) => rgb[0]! - rgb[2]!;
  const readings = sites.map(([x,y,ix,iy,rx,ry,lx,ly]) => {
    const core = sample(x,y), inside = sample(ix,iy), outside = sample(rx,ry), otherSide = sample(lx,ly);
    return {core,inside,outside,otherSide,edge:warmth(inside)-warmth(outside),
      oppositeEdge:warmth(core)-warmth(otherSide)};
  });
  console.log('North Bridge glint colour steps', readings);
  assert.equal(readings.filter(r => r.edge >= 12 && r.oppositeEdge >= 12 && Math.max(...r.core) < 240).length,5);
  for (const [x,y] of sites) {
    assert.deepEqual(sample(x,y,1),sample(x,y,0,1));
    assert.deepEqual(sample(x,y,0,0,1),[0,0,0]);
    assert.ok(luma(sample(x,y,0,0,0,.57)) < luma(sample(x,y))*.20);
  }

});

test('round 29 runs in night variants and keeps published day shader and Perth control bytes', () => {
  const materials = [tower,structure,roof].map(name=>mesh(name).material);
  const joinedDay = [...materials, central.table.curtain, central.table.timber, cityDay];
  const day = () => joinedDay.map(material => {
    const result = shader(material);
    return digest(result.vertexShader+result.fragmentShader+JSON.stringify(material.defines??{}));
  });
  const active = shader(materials[2]!).fragmentShader;
  glow.setLevel(0);
  try {
    assert.deepEqual(day(),[
      '66b2eadefe7abaa37e7dc9cd62ae938c7d8a331abc23a000820efada78413e93',
      '4aeb4eb21d33b24a62859a04a74b833e236572ccd4d079703f9401e0c05466ec',
      'd119ec416dc7fc58a61ace2a7ca88b248dde00807226ced763cf378fae8503ad',
      '44bdef302b3378e39d95d5ac5f4a1d4a20b82795f2d0337c7c05e770255a3ea9',
      '996f504cb2d9e36754209f01a07f43891ba8a23888d566e0bd00cc5ce368aa65',
      'd11b29ab8dd58ec0e307156043b198a425cc281a4c30100c3dc5649f9a9ddf99',
    ]);
    assert.ok([tower,structure,roof].every((name,i)=>mesh(name).material===materials[i]));
    assert.equal(cityMaterial('glass'),cityDay);
    for (const kind of ['timber','curtain'] as const) {
      assert.ok(central.table[kind] !== central.officesAtNight.get(kind));
      assert.equal(shader(central.table[kind]).fragmentShader.includes('winOffice'),false);
    }
    for (const state of ['clear','rain','fog','snow'] as const) {
      assert.equal(digest(JSON.stringify(remoteWeatherSnapshot('pt',state,true))),weatherReceipts[`pt/${state}`]);
    }
    const dayRoof = shader(materials[2]!).fragmentShader;
    assert.ok(active.includes('roofPaneCell') && !dayRoof.includes('roofPaneCell'));
  } finally { glow.setLevel(1); }
});
