import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import * as THREE from 'three';
import { createWaverleyWeather, lightPerthNight, lightWaverleyNight } from '../src/station-weather.ts';
import { addRoofShade } from '../src/lighting.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import waverleyData from '../src/data/waverley-scene.json' with {type:'json'};
import { Glsl, Sampler } from './glsl.ts';

type RGB = [number, number, number];
type Mesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
const luma = ([r,g,b]: RGB) => .2126*r + .7152*g + .0722*b;
const named = (group: THREE.Object3D, name: string) => {
  const mesh = group.getObjectByName(name) as Mesh | undefined;
  assert.ok(mesh?.isMesh, name);
  return mesh;
};
function shader(material: THREE.MeshLambertMaterial) {
  const {vertexShader, fragmentShader} = THREE.ShaderLib.lambert!;
  const result = {vertexShader, fragmentShader, uniforms: {} as Record<string, THREE.IUniform>};
  material.onBeforeCompile(result as never, undefined as never);
  return result;
}
function block(source: string, tag: string): string {
  const start = source.indexOf(`// ${tag}-begin`);
  return start < 0 ? '' : source.slice(source.indexOf('\n',start),source.indexOf(`// ${tag}-end`,start));
}
function signature(material: THREE.MeshLambertMaterial) {
  const {vertexShader, fragmentShader} = shader(material);
  return createHash('sha256').update(vertexShader).update(fragmentShader)
    .update(JSON.stringify(material.defines ?? {})).digest('hex');
}

test('Balmoral lower and middle masonry take an orange-gold wash with bright first-floor stone and dark unoccupied glass', () => {
  const {group, dispose} = buildWaverleyScene({lighting:false});
  const undo = lightWaverleyNight(group,.60);
  const glow = createWaverleyGlow(group);
  try {
    const wall = named(group,'waverley-balmoral-facade');
    const base = group.getObjectByName('waverley-frontage')!.userData.frontage.P;
    function sample(height: number, albedo: RGB = [.44,.34,.24], night = 1): RGB {
      const source = shader(wall.material).fragmentShader;
      const vars = {vStationLampWorld:[58,base+height,-122], diffuseColor:[...albedo,1],
        uStationLampLevel:night, totalEmissiveRadiance:[0,0,0]};
      const code = ['balmoral-facade-wash','balmoral-bands','balmoral-body-uplight'].map(tag=>block(source,tag)).join('\n');
      new Glsl('').run(code,{vars});
      return vars.totalEmissiveRadiance as RGB;
    }
    glow.setLevel(1);
    const bands = [4,10.3,16,21,24.9].map(y=>sample(y));
    const clearGlass = sample(10.3,[.022,.025,.031]);
    console.log('Balmoral architectural emission by height, linear RGB and luma',bands,bands.map(luma));
    assert.ok(luma(bands[0]!) > .040 && luma(bands[1]!) > .062 && luma(bands[2]!) > .022,
      'the amber light covers the lower and middle body at visible strength');
    assert.ok(luma(bands[1]!) > 1.8*luma(bands[2]!) && luma(bands[4]!) > 2*luma(bands[3]!));
    assert.ok(bands.every(([r,g,b])=>r > 2*g && g > 3*b));
    assert.ok(luma(clearGlass) < .085*luma(bands[1]!), 'unoccupied glass stays distinct from the flooded stone');
    assert.equal(wall.material.defines?.WIN_MODE,'vec4( 0.6, 0.0, 0.12, 0.1 )', 'the occupied-room schedule is preserved');
    assert.deepEqual(sample(10.3,undefined,0),[0,0,0]);
  } finally { glow.dispose(); undo(); dispose(); }
});

test('upper Waverley glazing is cool-white above mapped pendant rows and dim over dark areas, framing and snow', () => {
  const {group, dispose} = buildWaverleyScene({lighting:false});
  const glow = createWaverleyGlow(group);
  try {
    glow.setLevel(1);
    const roof = named(group,'waverley-mapped-roofs');
    const roofGroup = group.getObjectByName('waverley-roof')!;
    const heads = roofGroup.userData.platformLampHeads as number[];
    const s = shader(roof.material);
    const map = s.uniforms.uWaverleyRoofLight?.value as THREE.DataTexture | undefined;
    const rect = s.uniforms.uWaverleyRoofRect?.value as THREE.Vector4 | undefined;
    const code = block(s.fragmentShader,'station-light') + block(s.fragmentShader,'waverley-roof-transmission').replace(/^\s*#.*$/gm,'');
    function sample(x: number, z: number, pane = .20, slope = .37, snow = 0): RGB {
      const vars = {vStationLampWorld:[x,9,z], vStationLampNormal:[slope,1,0], diffuseColor:[.062,.062,.062,1],
        uStationLampLevel:1, uStationLampSnow:snow, sampledDiffuseColor:[pane,pane,pane,1],
        uWaverleyRoofRect:rect?.toArray() ?? [0,0,1,1], uWaverleyRoofLight:new Sampler(null),totalEmissiveRadiance:[0,0,0]};
      new Glsl('').run(code,{vars,fns:{texture2D:(_sampler,uv)=>{
        assert.ok(map);
        const {width,height} = map.image;
        const data = map.image.data as Uint8Array;
        const [u,v] = uv as number[];
        const ix = Math.max(0,Math.min(width-1,Math.floor(u!*width)));
        const iz = Math.max(0,Math.min(height-1,Math.floor(v!*height)));
        return [Number(data[iz*width+ix])/255,0,0,1];
      }}});
      return vars.totalEmissiveRadiance as RGB;
    }
    const [x,,z] = heads.slice(0,3) as RGB;
    const lit = sample(162.25,-2.1), dark = sample(151,-46.7); // Calton glazing probes, projected onto the east shed
    const frame = sample(x,z,.57), flat = sample(x,z,.20,0), snow = sample(x,z,.20,.37,1);
    console.log('Waverley roof linear RGB and luma',{lit,dark,frame,flat,snow,litLuma:luma(lit),darkLuma:luma(dark)});
    assert.ok(luma(lit) > .23 && luma(lit) > 4*luma(dark), 'covered pendant rows brighten the top slopes');
    assert.ok(lit[2] > lit[0] && lit[0] > .83*lit[2], 'the glazing reads cool white');
    assert.ok(luma(frame) < .2*luma(lit) && luma(flat) < .2*luma(lit),'opaque cassette bars and flat roofs retain their darker response');
    assert.deepEqual(snow,[0,0,0]);
    const bytes = map!.image.data as Uint8Array;
    assert.ok(bytes.some(v=>v===0) && bytes.some(v=>v>200),'actual fixture positions leave dark and bright roof areas');
  } finally { glow.dispose(); dispose(); }
});

test('Waverley full daylight and Perth preserve their material identity, shaders and draw topology through a night transition', async () => {
  const built = buildWaverleyScene({lighting:false});
  const view = await loadWaverleyScene({modelLoader:async()=>({buildWaverleyScene:()=>built}),geometryLoader:async()=>({default:waverleyData})});
  const climate = createWaverleyWeather(view,{mode:'forced',forced:'clear'});
  const perth = new THREE.Group(), stone = new THREE.MeshLambertMaterial({map:new THREE.Texture()});
  addRoofShade(stone);
  const perthWall = new THREE.Mesh(new THREE.BoxGeometry(),stone);
  perthWall.name='perth-city-walls'; perth.add(perthWall);
  const undoPerth = lightPerthNight(perth);
  const perthSignature = signature(stone), perthKey = stone.customProgramCacheKey();
  const camera = new THREE.PerspectiveCamera(), target = new THREE.Vector3();
  camera.position.set(130,20,40);
  const at = (time: string, wallMs: number) => climate.update({camera,target,timeMs:Date.parse(time),wallMs});
  const targets = ['waverley-balmoral-facade','waverley-mapped-roofs'].map(name=>named(view.scene,name));
  const materials = targets.map(mesh=>mesh.material), geometries = targets.map(mesh=>mesh.geometry);
  const topology = () => targets.map(mesh=>[mesh.geometry.index!.count,mesh.geometry.groups.length,mesh.renderOrder]);
  const day = '2026-11-20T12:00:00Z', night = '2026-11-20T22:30:00Z';
  try {
    at(day,0);
    const daySignatures = materials.map(signature), dayKeys = materials.map(m=>m.customProgramCacheKey());
    assert.deepEqual(daySignatures,[
      '86d6918fb7daa0cef0beea997d292d31a96b7eb43b7c101274d6fb854345d041',
      '3e57ef3033bbfb9031ec64e8dde71cce8d75f42fdd36aecad464bfbfe0e55166',
    ],'Waverley daylight programs match round 20');
    assert.equal(perthSignature,'4b8ae371289c9462a3b5e26b238120b13080ac0783b8eff941871b9c8cb8246b');
    const counts = topology();
    at(night,1000);
    assert.ok(targets.every((mesh,i)=>signature(mesh.material)!==daySignatures[i]),'both night contributions are active in the real weather entry point');
    assert.ok(materials.every((m,i)=>m.customProgramCacheKey()!==dayKeys[i]),'the renderer selects a distinct program at night');
    assert.ok(targets.every((mesh,i)=>mesh.material===materials[i]),'the night programs preserve the original render sort IDs');
    assert.deepEqual(topology(),counts);
    at(day,2000);
    assert.ok(targets.every((mesh,i)=>mesh.material===materials[i] && mesh.geometry===geometries[i]));
    assert.deepEqual(materials.map(signature),daySignatures);
    assert.deepEqual(materials.map(m=>m.customProgramCacheKey()),dayKeys);
    assert.deepEqual(topology(),counts);
    assert.ok(perthWall.material===stone);
    assert.equal(signature(stone),perthSignature);
    assert.equal(stone.customProgramCacheKey(),perthKey);
  } finally {
    climate.dispose(); view.dispose(); undoPerth(); perthWall.geometry.dispose(); stone.map!.dispose(); stone.dispose();
  }
});
