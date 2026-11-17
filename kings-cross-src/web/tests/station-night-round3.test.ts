import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LAMP_KIND } from '../../core/streetlights.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { urbanLampOptions, createPlatformLamps } from '../src/station-lamps.ts';
import { buildWaverleyScene } from '../src/waverley-scene.ts';
import { createWaverleyGlow } from '../src/waverley-night.ts';
import { loadWaverleyLamps } from '../src/waverley-lamps.ts';
import { Glsl } from './glsl.ts';
const named=<T extends THREE.Object3D>(o:THREE.Object3D,n:string):T=>{const found=o.getObjectByName(n);assert.ok(found,n);return found as T;};
function shader(m:THREE.Material,kind='basic') { const lib=THREE.ShaderLib[kind]!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s; }
function block(s:string,n:string) {const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}
const spot={x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.sodium,slope:[0,0] as [number,number]};
function trim(){const b=buildWaverleyScene({lighting:false}),g=createWaverleyGlow(b.group);const s=shader(named<THREE.Mesh>(b.group,'waverley-frontage-structure').material as THREE.Material,'lambert'),base=b.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
 return {s,run(h:number,level=1){const e={vars:{vStationLampWorld:[74,base+h,-136],vStationLampNormal:[0,1,0],diffuseColor:[.5,.5,.5,1],uStationLampLevel:level,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(block(s.fragmentShader,'balmoral-trim'),e);return e.vars.totalEmissiveRadiance as number[];},dispose(){g.dispose();b.dispose();}};}

test('Balmoral trim retains orange-gold under a neutral night fill instead of cream',()=>{
 const r=trim();try {for(const h of [24.8,28.5,38.5]){const c=r.run(h).map(v=>THREE.ColorManagement.workingToColorSpace(new THREE.Color(v+.01,v+.01,v+.01),THREE.SRGBColorSpace).r);assert.ok(c[0]!/c[2]!>=2.2,`gold hue at ${h}m`);}assert.deepEqual(r.run(28.5,0),[0,0,0]);}finally{r.dispose();}
});

test('Balmoral corner dome has separate shoulder and cap light bands with a dim gap',()=>{
 const r=trim();try {assert.ok(r.run(27.8)[0]!>r.run(29.4)[0]!*1.4);assert.ok(r.run(30.8)[0]!>r.run(29.4)[0]!*1.3);}finally{r.dispose();}
});

test('urban wet streaks broaden their rough lobe with distance while keeping a narrow specular centre',()=>{
 const l=createStreetLights([spot],urbanLampOptions());try {const s=shader(named<THREE.InstancedMesh>(l.group,'street-lamp-reflections').material as THREE.Material),code=block(s.vertexShader,'reflection-rough-width');
 const width=(d:number)=>{const e={vars:{streakWidth:.5,roughWidth:.5,cameraPosition:[0,10,d],reflectionCentre:[0,0,0]}};new Glsl('').run(code,e);return Number(e.vars.roughWidth);};assert.ok(width(40)>1.3);assert.ok(width(140)>width(40)+.7);
 const alpha=block(s.fragmentShader,'reflection-alpha'),e={vars:{vReflectionUv:[.5,0],uLampWet:1,reflectionOpen:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(alpha,e);assert.ok((e.vars.gl_FragColor as number[])[3]!>.25,'broad soft wings must survive, not only a thin line');
 }finally{l.dispose();}
});

test('urban unresolved horizon strips fade before becoming the Balmoral horizontal rain band',()=>{
 const l=createStreetLights([spot],urbanLampOptions());try {const code=block(shader(named<THREE.InstancedMesh>(l.group,'street-lamp-reflections').material as THREE.Material).vertexShader,'reflection-resolve');
 for(const [span,expected] of [[.008,0],[.2,1]]){const e={vars:{reflectionEndA:[0,0,0,1],reflectionEndB:[0,span,0,1],reflectionValid:1}};new Glsl('').run(code,e);assert.equal(e.vars.reflectionValid,expected);}
 }finally{l.dispose();}
});

test('KX and Waverley fog halos widen and lose distant intensity while retaining sodium-coloured scattered light',()=>{
 for(const l of [createStreetLights([spot],urbanLampOptions()),createPlatformLamps([0,10,0],[[[-10,-10],[10,-10],[10,10],[-10,10]]],0)])try {
 const s=shader(named<THREE.Points>(l.group,'street-lamp-halos').material as THREE.Material,'points');
 const size=block(s.vertexShader,'lamp-fog-size'),e={vars:{size:3,lampFogHalo:1,uLampFog:1,pointSize:0}};new Glsl('').run(size.replaceAll('gl_PointSize','pointSize'),e);assert.ok(Number(e.vars.pointSize)>=24);
 const scatter=block(s.fragmentShader,'lamp-fog-scatter'),sample=(distance:number,fog=1)=>{const e={vars:{vLampFogHalo:1,uLampFog:fog,vLampFogDistance:distance,gl_FragColor:[1,.39,.07,1]}};new Glsl('').run(scatter,e);return e.vars.gl_FragColor as number[];};
 assert.ok(sample(300)[3]!<sample(30)[3]!*.6,'distant halos do not form a wall of light');assert.ok(sample(30)[0]!>sample(30)[2]!*2);assert.deepEqual(sample(30,0),[1,.39,.07,1],'clear air is unchanged');
 }finally{l.dispose();}
});

test('visible Waverley approach heads preserve sodium colour and brighten road pools without new triangles',async()=>{
 const b=buildWaverleyScene({lighting:false}),l=await loadWaverleyLamps(b.terrain.heightAt.bind(b.terrain),true,b.group);try {
 const rows=named<THREE.Group>(l.group,'waverley-approach-lamps'),c=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('color'),p=named<THREE.InstancedMesh>(rows,'street-lamp-pools'),colour=new THREE.Color();
 for(let i=0;i<c.count;i++)assert.ok(c.getX(i)>c.getZ(i)*3,'orange cores replace white panorama dots');
 p.getColorAt(0,colour);assert.ok(colour.r>=.30,'the sodium road pool remains visible below the head');
 }finally{l.dispose();b.dispose();}
});

test('rough streak wings narrow on the near end instead of ballooning into a foreground wash',()=>{
 const l=createStreetLights([spot],urbanLampOptions());try {const code=block(shader(named<THREE.InstancedMesh>(l.group,'street-lamp-reflections').material as THREE.Material).vertexShader,'reflection-rough-perspective');
 const run=(depth:number)=>{const e={vars:{roughWidth:2,streakDepth:40,vertexDepth:depth}};new Glsl('').run(code,e);return Number(e.vars.roughWidth);};assert.equal(run(40),2);assert.ok(run(10)<=.5);assert.ok(run(80)<=2);
 }finally{l.dispose();}
});
