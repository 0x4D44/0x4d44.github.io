import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import type { CityData } from '../../core/city.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import type { AtmosphereOptions } from '../src/atmosphere.ts';
import { addWorld } from '../src/world.ts';
import { weatherState, forcedObservation } from '../src/weather.ts';
import { addCity } from '../src/city.ts';
import type { CityOptions } from '../src/city.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { loadWaverleyScene } from '../src/waverley.ts';
import { createWaverleyWeather, sceneWeatherOptions } from '../src/station-weather.ts';
import { waverleyOpenPlatformLamps, waverleyStationPlan, WAVERLEY_STRUCTURE } from '../src/waverley-station-structure.ts';
import { waverleyStationRoof, WAVERLEY_STATION_ROOF_ID, WAVERLEY_ROOF_CUTOUTS } from '../src/waverley-station.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { loadWaverleyLamps } from '../src/waverley-lamps.ts';

const read = (name:string) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
const kx:KxData=read('kx-track'), cityData:CityData=read('kx-city');
const data=unpackWaverleyScene(read('waverley-scene'));
const camera=new THREE.PerspectiveCamera();camera.position.set(0,3,20);
const frame=(time='2026-11-20T00:00:00Z',wallMs=1000)=>({timeMs:Date.parse(time),wallMs,camera,target:new THREE.Vector3()});
const named=<T extends THREE.Object3D>(root:THREE.Object3D,name:string):T=>{
  const object=root.getObjectByName(name);assert.ok(object,`${name} exists`);return object as T;
};
function shader(m:THREE.Material,kind='basic') {
  const lib=THREE.ShaderLib[kind]!;
  const s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
  m.onBeforeCompile(s as never,undefined as never);return s;
}
function london() {
  const scene=new THREE.Scene(),world=addWorld(scene,{grid:false});
  const opts={scene,world,sites:{platform:[0,5,0,0,5,12],shed:[0,12,24],concourse:[]},
    platformLampFloor:[[[-3,-5],[3,-5],[3,30],[-3,30]]],lampLayerSunGate:[0,6]} as AtmosphereOptions;
  return {scene,climate:createAtmosphere(opts)};
}

test('KX platform and shed heads cast bounded separated pools clipped to the real platform, without a shared fill',()=>{
  const {scene,climate}=london();
  try {
    climate.update({...frame(),weather:weatherState(forcedObservation('clear',Date.now())!)});
    const layer=named<THREE.Group>(scene,'station-platform-lamps');
    const pools=named<THREE.InstancedMesh>(layer,'street-lamp-pools');
    assert.equal(pools.count,3);assert.ok(pools.visible);
    assert.equal((pools.material as THREE.Material).blending,THREE.NormalBlending);
    const c=new THREE.Color();pools.getColorAt(0,c);assert.ok(c.r<=.2&&c.g<=.2&&c.b<=.2);
    const m=new THREE.Matrix4();pools.getMatrixAt(0,m);
    assert.ok(m.elements[0]!/2<=.6*12,'pool reach stays below fixture spacing');
    assert.ok(Math.abs(m.elements[13]!-(.9+.004))<1e-6);
    const s=shader(pools.material as THREE.Material);
    assert.match(s.fragmentShader,/pool-profile-begin/);assert.match(s.fragmentShader,/texture2D\( uPoolFloorMap/);
    const map=s.uniforms.uPoolFloorMap!.value as THREE.DataTexture;
    assert.ok((map.image.data as Uint8Array).some(v=>v===255));assert.ok((map.image.data as Uint8Array).some(v=>v===0));
    assert.equal(scene.getObjectByName('lights-shed'),undefined,'no double oversized head halos');
  } finally {climate.dispose();}
});

test('KX lamp layers are fully off above six degrees in rain and snow, independently of the weather rig',()=>{
  for(const weather of ['rain','snow']) {
    const {climate}=london();let actual=-1;
    climate.nightLights!.attach({setLevel:l=>{actual=l;}});
    try {
      climate.update({...frame('2026-06-21T12:00:00Z'),weather:weatherState(forcedObservation(weather,Date.now())!)});
      assert.ok(climate.state()!.sun.elevationDeg>6);assert.equal(actual,0);
      assert.ok(climate.state()!.rig.lampLevel>.2,'window/train rig remains compatible');
    } finally {climate.dispose();}
  }
});

test('KX platform pools reuse continuous wet reflections and wider fog scatter at the same fixture heads',()=>{
  const {scene,climate}=london();
  try {
    const layer=named<THREE.Group>(scene,'station-platform-lamps');
    const reflection=named<THREE.InstancedMesh>(layer,'street-lamp-reflections');
    assert.equal(reflection.count,3);
    const s=shader(reflection.material as THREE.Material);
    assert.ok(s.fragmentShader.includes('smoothstep( 0.45, 0.85'));
    const alpha=s.fragmentShader.split('// reflection-alpha-begin')[1]!.split('// reflection-alpha-end')[0]!;
    assert.ok(!/sin\(/.test(alpha));assert.match(alpha,/exp\( -2.5/);
    const heads=named<THREE.Points>(layer,'street-lamp-halos');
    const h=shader(heads.material as THREE.Material,'points');
    assert.match(h.vertexShader,/16\.0/);assert.match(h.fragmentShader,/uLampFog/);
  } finally {climate.dispose();}
});

test('KX masts have narrow cool-white line pools and local wet optics instead of broad additive discs',()=>{
  const scene=new THREE.Scene(),made=addCity(scene,kx,{...cityData,roads:[],trees:[],areas:[],canals:[]},{nightEffects:true,trees:false} as CityOptions);
  try {
    const pools=named<THREE.InstancedMesh>(made.lights!.group,'street-lamp-pools');
    const m=new THREE.Matrix4();pools.getMatrixAt(0,m);
    assert.ok(m.elements[0]!/m.elements[10]!>4,'mast optic is a narrow rectangle');
    assert.equal(pools.geometry.getAttribute('poolLine').getX(0),1);
    const s=shader(pools.material as THREE.Material);assert.match(s.fragmentShader,/vPoolLine/);
    assert.ok(made.lights!.group.getObjectByName('street-lamp-reflections'));
    const c=new THREE.Color();pools.getColorAt(0,c);assert.ok(c.b>c.r,'LED cool pool');
  } finally {made.dispose();}
});

async function edinburgh() {
  const built=buildWaverleyScene({lighting:false});
  const view=await loadWaverleyScene({modelLoader:async()=>({buildWaverleyScene:()=>built}),geometryLoader:async()=>({default:read('waverley-scene')})});
  const climate=createWaverleyWeather(view,sceneWeatherOptions('rain',null));view.climate=climate;
  return {built,view,climate};
}

test('Waverley lights every physical canopy pendant at its own head and clips the pools to platform slabs',async()=>{
  const {view}=await edinburgh();
  try {
    const plan=waverleyStationPlan(data,waverleyStationRoof(data.roofs.find(r=>r.id===WAVERLEY_STATION_ROOF_ID)),WAVERLEY_ROOF_CUTOUTS);
    const layer=named<THREE.Group>(view.scene,'waverley-platform-lamps');
    const heads=named<THREE.Points>(layer,'street-lamp-halos').geometry.getAttribute('position');
    const covered=plan.lamps.map(p=>[p.x,.915+WAVERLEY_STRUCTURE.lampRim-.02,p.z]);
    const uncovered=waverleyOpenPlatformLamps(plan).map(p=>[p.x,p.y+p.height,p.z]);
    const sources=[...covered,...uncovered];
    assert.equal(heads.count,sources.length*2,'source and fog-scatter point per covered or uncovered head');
    for (const [i,p] of [...sources,...sources].entries()) {
      assert.ok(new THREE.Vector3().fromBufferAttribute(heads,i).distanceTo(new THREE.Vector3().fromArray(p))<.001);
    }
    const pools=named<THREE.InstancedMesh>(layer,'street-lamp-pools');
    assert.ok(shader(pools.material as THREE.Material).uniforms.uPoolFloorMap);
    assert.equal(named<THREE.InstancedMesh>(layer,'street-lamp-reflections').count,plan.lamps.length);
  } finally {view.dispose();}
});

test('Waverley pendant and roof light switch off in rainy daylight while the original sky rig remains unchanged',async()=>{
  const {view,climate}=await edinburgh();
  try {
    climate.update(frame());const layer=named<THREE.Group>(view.scene,'waverley-platform-lamps');
    const pools=named<THREE.InstancedMesh>(layer,'street-lamp-pools');assert.ok(pools.visible);
    const roof=named<THREE.Mesh>(view.scene,'waverley-mapped-roofs');
    const s=shader(roof.material as THREE.Material,'lambert');assert.equal(s.uniforms.uStationLampLevel!.value,1);
    climate.update(frame('2026-06-21T12:00:00Z',1300));
    assert.equal(pools.visible,false);assert.equal(s.uniforms.uStationLampLevel!.value,0);
    assert.ok(climate.atmosphere.state()!.rig.lampLevel>.2);
  } finally {view.dispose();}
});

test('Waverley roof emits cool light through its cassette texture and opaque snow suppresses the outer glow',async()=>{
  const {view}=await edinburgh();
  try {
    const roof=named<THREE.Mesh>(view.scene,'waverley-mapped-roofs');
    const s=shader(roof.material as THREE.Material,'lambert');
    assert.match(s.fragmentShader,/vec3\(0.11,0.17,0.24\) \* diffuseColor.rgb/);
    assert.match(s.fragmentShader,/1.0 - uStationLampSnow/);
    assert.ok(s.uniforms.uSnowCover,'existing snow material hook is preserved');
  } finally {view.dispose();}
});

test('Waverley Scott Monument and Balmoral cornices get warm floodlight without flooding bridge ribs',async()=>{
  const {view}=await edinburgh();
  try {
    const scott=named<THREE.Mesh>(view.scene,'waverley-scott-monument');
    assert.match(shader(scott.material as THREE.Material,'lambert').fragmentShader,/vec3\(1\.0,0\.68,0\.34\)/);
    const structure=named<THREE.Mesh>(view.scene,'waverley-frontage-structure');
    const s=shader(structure.material as THREE.Material,'lambert');
    const code=s.fragmentShader.split('// station-light-begin')[1]!;
    assert.match(code,/vStationLampWorld.x/);assert.match(code,/vStationLampWorld.z/);assert.match(code,/smoothstep\(/);
  } finally {view.dispose();}
});

test('Waverley city rows retain sodium heads with bounded pools and only station-local reflection geometry',async()=>{
  const made=await (loadWaverleyLamps as (g:(x:number,z:number)=>number,enhanced:boolean)=>ReturnType<typeof loadWaverleyLamps>)(()=>0,true);
  try {
    const pools=named<THREE.InstancedMesh>(made.group,'street-lamp-pools');
    assert.equal((pools.material as THREE.Material).blending,THREE.NormalBlending);
    const reflection=named<THREE.InstancedMesh>(made.group,'street-lamp-reflections');
    assert.ok(reflection.count>30&&reflection.count<pools.count,'distant heads allocate no wet quads');
    const c=new THREE.Color();pools.getColorAt(0,c);assert.ok(c.r>c.b,'older streets stay sodium/warm');
    const m=new THREE.Matrix4();for(let i=0;i<pools.count;i++){pools.getMatrixAt(i,m);assert.ok(m.elements[0]!<=16.001);}
  } finally {made.dispose();}
});

test('Waverley pays for new lamp optics by omitting only buried downward sleeper faces',()=>{
  const built=buildWaverleyScene({lighting:false});
  try {
    const sleepers=named<THREE.InstancedMesh>(built.group,'waverley-sleepers'),g=sleepers.geometry;
    assert.equal(g.index!.count/3,10);
    const n=g.getAttribute('normal');for(const i of g.index!.array)assert.ok(n.getY(i)>-.9,'top and four sides retained, buried underside omitted');
  } finally {built.dispose();}
});
