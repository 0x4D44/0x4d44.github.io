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
function floorMasks(material: THREE.Material, floors: number[], bays: number[], seed: number, rect: readonly number[]) {
  const { fragmentShader: source } = shader(material);
  const start = source.indexOf('float winHash(');
  const end = source.indexOf('#include', source.indexOf('vec3 winOffice(', start));
  const gk = source.indexOf('float gk =', start);
  const code = new Glsl(source.slice(start, gk < 0 ? end : Math.min(end, gk)).replace(/^\s*#.*$/gm, ''));
  return floors.map(floor => bays.map(bay =>
    luma(code.call('winOffice', [[bay+.5, floor+.56], [.32,.16], seed, 1, [...rect], .44, .9, 420],
      { vars: {uOfficeFog:0} }) as number[]) > .30 ? '#' : '.').join(''));
}
const numbers = (start: number, count: number) => Array.from({length:count}, (_, i) => start+i);
const shares = (masks: string[]) => masks.map(row => row.replaceAll('.', '').length/row.length);
const gap = (row: string) => Math.max(...row.split('#').map(run => run.length));

test('Platform 37 distributes six bright floors alongside three closed floors and two partial floors', () => {
  const material = central.officesAtNight.get('timber')!;
  const rows = shares(floorMasks(material, numbers(0,11), numbers(0,56), 6.99, [.14,.86,1/4.2,.98]));
  console.log('Platform 37 fractions, lower to upper floors', rows);
  assert.deepEqual(rows.map(v => v === 0 ? 'off' : v >= .75 ? 'whole' : 'partial'),
    ['whole','off','whole','off','whole','whole','off','partial','whole','whole','partial']);
  assert.ok([7,10].every(i => rows[i]! >= .20 && rows[i]! <= .50));
});

test('Crick has wide dark suites on the occupied overview floors and a double blackout above', () => {
  const samples = floorMasks(central.officesAtNight.get('curtain')!, numbers(1,7), numbers(0,60),
    2.98, [.03125,.96875,.2375,.975]);
  const rows = shares(samples), gaps = samples.map(gap);
  console.log('Crick fractions and longest gaps', rows, gaps);
  assert.ok([0,1,3].every(i => gaps[i]! >= 13 && rows[i]! >= .60));
  assert.ok([2,5,6].every(i => rows[i] === 0));
  assert.equal(new Set([samples[0],samples[1],samples[3]]).size, 3);
});

test('the four visible London curtain walls use distinct whole-floor schedules', () => {
  const entries = [[265720685,5,6], [375735261,2,6], [260722156,1,5], [137827419,1,5]] as const;
  const states = entries.map(([id, first, count]) => {
    const seed = facadeTint(id).reduce((v, c, i) => v+c*[37.1,91.7,53.3][i]!, 0);
    const fractions = shares(floorMasks(cityNight, numbers(first,count), numbers(0,22), seed, FACADE_GLASS.glass));
    console.log('South front office fractions', id, fractions);
    assert.ok(fractions.every(f => f === 0 || f >= .75));
    return fractions.map(f => +!!f);
  });
  assert.deepEqual(states, [[0,1,0,1,1,0], [0,0,1,1,0,1], [1,0,1,1,0], [1,1,0,0,1]]);
});

test('Balmoral crown and stage share a blue-violet hue through the lower-right clock stage', () => {
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
  const vars = {vStationLampWorld:[58.55,base+50.53,-133.86],uStationLampLevel:1,totalEmissiveRadiance:[.025,.020,.016]};
  glsl.run(block(paint,'balmoral-crown'),{vars});
  const crown = display(vars.totalEmissiveRadiance);
  const stages = [41.16,41.53,43.27,45,48.8].map(stageAt);
  console.log('Balmoral display RGB', {crown, stages, shaft:stageAt(36)});
  assert.ok(crown[2]! >= 217 && crown[2]! <= 245);
  for (const colour of stages) {
    assert.ok(colour[2]! >= 210 && colour[2]! <= 245);
    assert.ok(hue(colour) >= 260 && hue(colour) <= 277 && Math.abs(hue(colour)-hue(crown)) <= 8);
  }
  assert.ok(stageAt(36)[0]! > stageAt(36)[2]!+35);
});

test('five North Bridge panes gain distinct warm cores and retain bars, snow and fog masking', () => {
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
  const sites = [[868,461],[895,461],[1042,483],[1090,521],[1110,494]] as const;
  const readings = sites.map(([x,y]) => {
    const core = sample(x,y), rims = [sample(x,y-6),sample(x,y+6)];
    assert.deepEqual(sample(x,y,1),sample(x,y,0,1));
    assert.deepEqual(sample(x,y,0,0,1),[0,0,0]);
    assert.ok(luma(sample(x,y,0,0,0,.57)) < luma(core)*.20);
    return {core,rims,contrast:luma(core)-(luma(rims[0]!)+luma(rims[1]!))/2};
  });
  console.log('North Bridge pane cores and neighbouring glass', readings);
  assert.ok(readings.every(({core,contrast}) => contrast >= 11 && core[0]! >= core[2]!+20 && luma(core) < 241));
});

test('day shader bytes, shared materials and Perth weather match the controls after the night variants run', () => {
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
    assert.ok(active.includes('paneSpot') && !dayRoof.includes('paneSpot'));
  } finally { glow.setLevel(1); }
});
