import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { LAMP_KIND } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createPerthLights } from '../src/perth-lamps.ts';
import type { PerthStationPlan } from '../src/perth-station-structure.ts';
import { addPerthPlatforms } from '../src/perth-station.ts';
import type { PerthBuild } from '../src/perth-scene.ts';
import { createPerthWeather, createWaverleyWeather, sceneWeatherOptions } from '../src/station-weather.ts';
import type { WaverleyView } from '../src/waverley.ts';
import { Glsl } from './glsl.ts';
import { addRoofShade } from '../src/lighting.ts';
const plan={structure:{lamps:[0,12,24].map(x=>({x,z:0,ref:'synthetic'}))},canopyColumns:[],furniture:{lamps:[]}} as unknown as PerthStationPlan;
const spot=(x:number,z:number):LampSpot=>({x,y:0,z,height:4,yaw:0,kind:LAMP_KIND.cool,slope:[0,0]});
function shaderFor(material:THREE.Material,kind:'basic'|'points'='basic') {
  const lib=THREE.ShaderLib[kind];
  const shader={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
  material.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,undefined as never);return shader;
}
function block(source:string,name:string){const found=source.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(found,`${name} executes in the rendered shader`);return found;}

test('Perth pendant pools retain analytic peak/gap falloff at grazing views without texture mip averaging',()=>{
  const lights=createPerthLights(plan,[],[]);
  try {
    const p=lights.group.getObjectByName('perth-station-lamps')!.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const material=p.material as THREE.MeshBasicMaterial;assert.equal(material.map,null,'analytic alpha cannot be averaged into a flat mip band');
    const shader=shaderFor(material),body=block(shader.fragmentShader,'pool-profile');
    const run=(r:number)=>{const e={vars:{vPoolUv:[.5+.5*r,.5],gl_FragColor:[1,1,1,1]}};new Glsl('').run(body,e);return e.vars.gl_FragColor[3]!;};
    assert.equal(run(0),1);assert.equal(run(1),0);
    assert.ok(run(.87)<.03,'midway between neighbouring pools remains dark');
    for(let r=0;r<1;r+=.05)assert.ok(run(r)>=run(r+.05),'falloff remains monotone');
  }finally{lights.dispose();}
});

test('Perth pendant pool plane hugs the physical floor so a grazing ray does not displace its peak by metres',()=>{
  const lights=createPerthLights(plan,[],[]);
  try {
    const p=lights.group.getObjectByName('perth-station-lamps')!.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
    const m=new THREE.Matrix4();p.getMatrixAt(0,m);const lift=m.elements[13]!-.915;
    const displacement=80*lift/1.6;
    assert.ok(lift>0&&displacement<.3,`80 m floor ray displaced ${displacement} m`);
  }finally{lights.dispose();}
});

test('Perth creates wet reflection quads only near the station, never for rural heads',()=>{
  const lights=createPerthLights(plan,[spot(0,0),spot(1000,2000),spot(-1500,-3000)],[]);
  try {
    const street=lights.group.children.find(o=>o.name==='street-lamps')!;
    const reflection=street.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
    assert.equal(reflection.count,1,'far heads allocate no reflection quad');
    const heads=reflection.geometry.getAttribute('reflectionHead');assert.equal(heads.count,1);assert.ok(Math.abs(heads.getX(0))<3);
  }finally{lights.dispose();}
});

test('Perth rain streaks stay continuous along rough paving instead of forming world-space bars',()=>{
  const lights=createPerthLights(plan,[spot(0,0)],[]);
  try {
    const p=lights.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
    const body=block(shaderFor(p.material as THREE.Material).fragmentShader,'reflection-alpha');
    const run=(wet:number,z:number,y=.2)=>{const e={vars:{uLampWet:wet,reflectionOpen:1,vReflectionUv:[0,y],vReflectionWorld:[0,0,z],gl_FragColor:[1,1,1,1]},
      fns:{pow:(base:import('./glsl.ts').Value,power:import('./glsl.ts').Value)=>{assert.ok(typeof base==='number'&&base>=0,'GLSL pow is undefined for a negative base');assert.ok(typeof power==='number');return base**power;}}};new Glsl('').run(body,e);return e.vars.gl_FragColor[3]!;};
    const rain=Array.from({length:100},(_,i)=>run(1,i*.01));
    assert.ok(Math.abs(run(1,0,-.4)-run(1,0,.4))<1e-8,'continuous symmetric blur across both halves of the quad');
    assert.ok(Math.min(...rain)>.5);assert.ok(Math.max(...rain)-Math.min(...rain)<.01,'no high-frequency world-space stripes');
  }finally{lights.dispose();}
});

test('Perth fog dampness does not draw the rain reflection streaks',()=>{
  const lights=createPerthLights(plan,[spot(0,0)],[]);
  try {
    const p=lights.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
    const body=block(shaderFor(p.material as THREE.Material).fragmentShader,'reflection-alpha');
    const e={vars:{uLampWet:.3,reflectionOpen:1,vReflectionUv:[0,0],vReflectionWorld:[0,0,0],gl_FragColor:[1,1,1,1]}};
    new Glsl('').run(body,e);assert.equal(e.vars.gl_FragColor[3],0);
  }finally{lights.dispose();}
});

test('Perth rejects reflection planes above the eye instead of projecting a large quad at the camera',()=>{
  const lights=createPerthLights(plan,[spot(0,0)],[]);
  try {
    const p=lights.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
    const body=block(shaderFor(p.material as THREE.Material).vertexShader,'reflection-project');
    const e={vars:{lampBase:[0,4,0],lampHead:[0,8,0],lampNormal:[0,1,0],cameraPosition:[0,2,12],reflectionCentre:[0,0,0],vReflectionValid:1}};
    const local=new Glsl('').run(body,e);assert.equal(local.reflectionValid,0);
  }finally{lights.dispose();}
});

test('Perth platform night fill is cool and owned only by station platform materials',()=>{
  const materials=new Map<string,THREE.Material>();
  const build={own:(m:THREE.Material)=>m,add:(_g:THREE.Group,_b:unknown,m:THREE.Material,name:string)=>materials.set(name,m)} as unknown as PerthBuild;
  addPerthPlatforms(build,{platforms:[{id:'synthetic',ref:'4',tags:{},path:[[0,0],[8,0],[8,100],[0,100]]}],rails:[],buildings:[]},new THREE.Group());
  try {
    for(const name of ['perth-platform-surfaces','perth-platform-surfaces-open','perth-platform-surfaces-open-grey']){
      const m=materials.get(name)!;assert.equal(m.defines?.FLOOD_COLOUR,'vec3( 0.82, 0.92, 1.0 )');
      addRoofShade(m as THREE.MeshLambertMaterial);
      const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
      m.onBeforeCompile(shader as THREE.WebGLProgramParametersWithUniforms,undefined as never);
      assert.ok(shader.fragmentShader.includes('diffuseColor.rgb * vec3( 0.82, 0.92, 1.0 ) * uWinNight'),'the executed flood shader uses the platform colour');
    }
    assert.ok(Number(String(materials.get('perth-platform-surfaces')!.defines?.FLOOD).match(/vec4\(\s*([\d.]+)/)![1])<=.015,'covered fill leaves dark pendant gaps');
    for(const [name,m] of materials)if(m.defines?.FLOOD!==undefined)assert.ok(name.startsWith('perth-platform-surfaces'),'fill has no town or forecourt material');
  }finally{for(const m of materials.values())m.dispose();}
});

test('Perth asphalt fill stays on the station platforms and never enters the forecourt road or setts',async()=>{
  const {buildPerthScene}=await import('../src/perth-scene.ts');
  const model=buildPerthScene({lighting:false});let platforms=0,forecourt=0;
  try {
    model.group.traverse(o=>{
      const mesh=o as THREE.Mesh;if(!mesh.isMesh)return;
      const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      for(const m of materials){
        if(o.name.startsWith('perth-platform-surfaces')){platforms++;assert.equal(m.defines?.FLOOD_COLOUR,'vec3( 0.82, 0.92, 1.0 )');}
        if(o.name==='perth-forecourt'||o.name==='perth-forecourt-setts'){forecourt++;assert.equal(m.defines?.FLOOD,undefined,'road/setts receive no platform fill');}
        if(m.defines?.FLOOD_COLOUR!==undefined)assert.ok(o.name.startsWith('perth-platform-surfaces'),'cool fill belongs to the station footprint');
      }
    });
    assert.equal(platforms,3);assert.equal(forecourt,2);
  }finally{model.dispose();}
});

test('Perth fog scattering widens the canopy halo beyond the ordinary head without changing the head diameter',()=>{
  const lights=createPerthLights(plan,[],[]);
  try {
    const h=lights.group.getObjectByName('perth-station-lamps')!.getObjectByName('street-lamp-halos') as THREE.Points;
    const body=block(shaderFor(h.material as THREE.Material,'points').vertexShader,'lamp-fog-size');
    for(const halo of [0,1]){
      const e={vars:{size:2,lampFogHalo:halo,gl_PointSize:0}};new Glsl('').run(body,e);
      if(halo)assert.ok(e.vars.gl_PointSize>=8,'scattering reaches at least four ordinary head radii');
      else assert.equal(e.vars.gl_PointSize,2,'ordinary head diameter stays fixed');
    }
  }finally{lights.dispose();}
});

test('Perth fog halos keep a soft visible screen diameter at distant canopy heads',()=>{
  const lights=createPerthLights(plan,[],[]);
  try {
    const h=lights.group.getObjectByName('perth-station-lamps')!.getObjectByName('street-lamp-halos') as THREE.Points;
    const source=shaderFor(h.material as THREE.Material,'points').vertexShader;
    const body=block(source,'lamp-fog-screen');
    assert.ok(source.indexOf('// lamp-fog-screen-begin')>source.indexOf('gl_PointSize *= ( scale / - mvPosition.z )'),'minimum is applied after perspective attenuation');
    for(const [fog,halo,expected] of [[1,1,16],[0,1,2],[1,0,2]]){
      const e={vars:{uLampFog:fog,lampFogHalo:halo,gl_PointSize:2}};new Glsl('').run(body,e);assert.equal(e.vars.gl_PointSize,expected);
    }
  }finally{lights.dispose();}
});

test('Perth dense fog loses the far canopy from 20 m while clear Perth and Waverley retain their fog near range',()=>{
  const view=()=>({scene:new THREE.Scene(),placeholder:false,geometry:{origin:{lat:56.392,lon:-3.438},rails:[],platforms:[]},model:{group:new THREE.Group(),night:{setLevel(){}}}} as unknown as WaverleyView);
  for(const [factory,weather,expected] of [[createPerthWeather,'fog',20],[createPerthWeather,'clear',100],[createWaverleyWeather,'fog',75]] as const){
    const v=view(),c=factory(v,sceneWeatherOptions(weather,null));
    try{c.update({timeMs:Date.parse('2026-11-20T22:30:00Z'),wallMs:1000,camera:new THREE.PerspectiveCamera(),target:new THREE.Vector3()});assert.ok(Math.abs((v.scene.fog as THREE.Fog).near-expected)<1e-6);}finally{c.dispose();}
  }
});
