import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createPlatformLamps,urbanLampOptions} from '../src/station-lamps.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {createWaverleyGlow} from '../src/waverley-night.ts';
import {addCity} from '../src/city.ts';
import {Glsl} from './glsl.ts';
const named=<T extends THREE.Object3D>(root:THREE.Object3D,name:string):T=>{const o=root.getObjectByName(name);assert.ok(o,name);return o as T;};
function shader(m:THREE.Material,kind='basic') {const lib=THREE.ShaderLib[kind]!;const s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,name:string){const b=s.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(b,`${name} executes in the rendered shader`);return b;}
const read=(n:string)=>JSON.parse(readFileSync(new URL(`../src/data/${n}.json`,import.meta.url),'utf8'));

test('urban wet footprints retain true mirror points 12–55 m from a head and reject remote tangent planes',()=>{
 const made=createStreetLights([{x:36,y:0,z:18,height:10,yaw:0,kind:LAMP_KIND.cool,slope:[0,0]}],urbanLampOptions());
 try {const r=named<THREE.InstancedMesh>(made.group,'street-lamp-reflections'),s=shader(r.material as THREE.Material),reach=s.uniforms.uReflectionReach!.value;
  for(const distance of [12,18,35,55,458]){const e={vars:{vReflectionWorld:[distance,0,0],vReflectionAnchor:[0,0,0],uReflectionReach:reach,reflectionOpen:1}};new Glsl('').run(block(s.fragmentShader,'reflection-footprint'),e);if(distance<56)assert.ok(Number(e.vars.reflectionOpen)>.6,'valid mirror points must survive the finite source footprint');else assert.equal(e.vars.reflectionOpen,0);}
 }finally{made.dispose();}
});

test('urban rain streaks are long and narrowly stretched on the ground, with soft irregular breaks per head',()=>{
 const made=createStreetLights([{x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.sodium,slope:[0,0]}],urbanLampOptions());
 try {const s=shader(named<THREE.InstancedMesh>(made.group,'street-lamp-reflections').material as THREE.Material);
  const b=block(s.vertexShader,'reflection-urban-shape');const shape={vars:{streakLength:10,lampHeight:10,cameraPosition:[0,2,50],reflectionCentre:[0,0,40],streakWidth:1}};new Glsl('').run(b,shape);assert.ok(Number(shape.vars.streakLength)>=20);assert.ok(Number(shape.vars.streakWidth)<=.6);
  const rough=block(s.fragmentShader,'reflection-breakup'),samples=[];
  for(let i=0;i<20;i++){const e={vars:{vReflectionUv:[0,-.8+i*.08],vReflectionAnchor:[12,0,4],gl_FragColor:[1,1,1,1]}};new Glsl('').run(rough,e);samples.push((e.vars.gl_FragColor as number[])[3]!);}
  assert.ok(Math.max(...samples)-Math.min(...samples)>.3);assert.ok(Math.min(...samples)>.02,'broken puddle streaks have soft joins');
 }finally{made.dispose();}
});

test('KX sodium pools conform to the physical road instead of disappearing below the drawn paving',()=>{
 const made=addCity(new THREE.Scene(),read('kx-track'),read('kx-city'),{nightEffects:true,trees:false});
 try {const s=shader(named<THREE.InstancedMesh>(made.lights!.group,'street-lamp-pools').material as THREE.Material);
  assert.ok(s.uniforms.uLampSurface);const body=block(s.vertexShader,'pool-receiver');
  const e={vars:{vPoolWorld:[10,-1,20]},fns:{lampReceiver:()=>[3,1]}};new Glsl('').run(body,e);assert.ok((e.vars.vPoolWorld as number[])[1]!>3);
  assert.ok(s.fragmentShader.includes('pool-receiver-mask-begin'),'a draped pool cannot bleed beyond the road mask');
 }finally{made.dispose();}
});

test('KX platform pools broaden their lit centre and physical reach while retaining the existing peak ceiling',()=>{
 const made=createPlatformLamps([0,8,0,0,8,30],[[[-15,-15],[15,-15],[15,45],[-15,45]]],.9);
 try {const p=named<THREE.InstancedMesh>(made.group,'street-lamp-pools'),m=new THREE.Matrix4();p.getMatrixAt(0,m);assert.ok(m.elements[0]!/2>8);
  const c=new THREE.Color();p.getColorAt(0,c);assert.ok(Math.max(c.r,c.g,c.b)<=.2);
  const e={vars:{vPoolUv:[.75,.5],gl_FragColor:[1,1,1,1]}};new Glsl('').run(block(shader(p.material as THREE.Material).fragmentShader,'pool-profile'),e);assert.ok((e.vars.gl_FragColor as number[])[3]!>.5);
 }finally{made.dispose();}
});

test('Waverley has sodium approach rows with road pools that appear only after dark',async()=>{
 const built=buildWaverleyScene({lighting:false}),made=await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain),true,built.group);
 try {const rows=named<THREE.Group>(made.group,'waverley-approach-lamps'),p=named<THREE.InstancedMesh>(rows,'street-lamp-pools');assert.ok(p.count>=12);
  const heads=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('position');let bridge=0,market=0;for(let i=0;i<heads.count;i++){if(heads.getX(i)>90&&heads.getZ(i)>-90&&heads.getZ(i)<90)bridge++;if(heads.getX(i)<90&&heads.getZ(i)>70)market++;}assert.ok(bridge>=8&&market>=3);
  const c=new THREE.Color();p.getColorAt(0,c);assert.ok(c.r>c.b*2);made.setLevel(1);assert.ok(rows.visible);made.setLevel(0);assert.equal(rows.visible,false,'new post geometry changes no day-clear pixel');
 }finally{made.dispose();built.dispose();}
});

test('Waverley pays for approach rows by retaining distant head cores without allocating their invisible road pools',async()=>{
 const made=await loadWaverleyLamps(()=>0,true);
 try {const pools=named<THREE.InstancedMesh>(made.group,'street-lamp-pools'),cores=named<THREE.Points>(made.group,'street-lamp-cores');assert.ok(pools.count<cores.geometry.getAttribute('position').count-300);
  const m=new THREE.Matrix4();for(let i=0;i<pools.count;i++){pools.getMatrixAt(i,m);assert.ok(Math.hypot(m.elements[12]!,m.elements[14]!)<653);}
 }finally{made.dispose();}
});

function glowing(){const built=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(built.group);glow.setLevel(1);return {built,glow,dispose(){glow.dispose();built.dispose();}};}
test('Waverley platform night ambient falls between pendant pools while daytime lighting stays exact',()=>{
 const r=glowing();try {const m=named<THREE.Mesh>(r.built.group,'waverley-platform-surfaces').material as THREE.Material,s=shader(m,'lambert'),b=block(s.fragmentShader,'station-platform-ambient');
  assert.ok(b.includes('reflectedLight.indirectDiffuse'));
  for(const level of [0,1]){const e={vars:{uStationLampLevel:level,ambient:[1,1,1],direct:[1,1,1]}};new Glsl('').run(b.replaceAll('reflectedLight.indirectDiffuse','ambient').replaceAll('reflectedLight.directDiffuse','direct'),e);const value=e.vars.ambient[0]!;if(level===0)assert.equal(value,1);else assert.ok(value<=.3);}
 }finally{r.dispose();}
});

test('Balmoral facade has warm uplight bands with dark storeys between them, gated off by day',()=>{
 const r=glowing();try {const s=shader(named<THREE.Mesh>(r.built.group,'waverley-balmoral-facade').material as THREE.Material,'lambert');
  const b=block(s.fragmentShader,'balmoral-bands'),base=r.built.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
  const sample=(h:number,level=1)=>{const e={vars:{uStationLampLevel:level,vStationLampWorld:[50,base+h,-120],diffuseColor:[1,1,1,1],totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(b,e);return e.vars.totalEmissiveRadiance as number[];};
  assert.ok(sample(8.8)[0]!>sample(7)[0]!*2);assert.ok(sample(24.9)[0]!>sample(21)[0]!*2);assert.ok(sample(8.8)[0]!>sample(8.8)[2]!*2);assert.deepEqual(sample(8.8,0),[0,0,0]);
 }finally{r.dispose();}
});

test('Balmoral clock crown glows violet while the adjacent bridge remains unlit',()=>{
 const r=glowing();try {const s=shader(named<THREE.Mesh>(r.built.group,'waverley-frontage-structure').material as THREE.Material,'lambert'),base=r.built.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
  const b=block(s.fragmentShader,'balmoral-crown');const run=(p:number[],level=1)=>{const e={vars:{vStationLampWorld:p,uStationLampLevel:level,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(b,e);return e.vars.totalEmissiveRadiance as number[];};
  const cap=run([55,base+54,-126]);assert.ok(cap[0]!>.2&&cap[2]!>.1&&cap[1]!<cap[0]!*.3);assert.deepEqual(run([130,15,30]),[0,0,0]);assert.deepEqual(run([55,base+54,-126],0),[0,0,0]);
 }finally{r.dispose();}
});

test('Balmoral turret floodlight has a minimum stone response instead of a dark gradient on its lead cap',()=>{
 const r=glowing();try {const s=shader(named<THREE.Mesh>(r.built.group,'waverley-frontage-structure').material as THREE.Material,'lambert'),base=r.built.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
  const e={vars:{vStationLampWorld:[74,base+28.5,-136],vStationLampNormal:[0,1,0],diffuseColor:[.01,.02,.03,1],uStationLampLevel:1,totalEmissiveRadiance:[0,0,0]}};
  new Glsl('').run(block(s.fragmentShader,'balmoral-trim'),e);assert.ok((e.vars.totalEmissiveRadiance as number[])[0]!>.05);
 }finally{r.dispose();}
});
