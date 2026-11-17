import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {LAMP_KIND} from '../../core/streetlights.ts';
import type {LampSpot} from '../../core/streetlights.ts';
import {createStreetLights} from '../src/streetlights.ts';
import type {StreetLightOptions} from '../src/streetlights.ts';
import {addCity} from '../src/city.ts';
import {createAtmosphere} from '../src/atmosphere.ts';
import {addWorld} from '../src/world.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {Glsl,Sampler} from './glsl.ts';
import type {Value} from './glsl.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
const kx=read('kx-track'),city=read('kx-city');
function compile(m:THREE.Material,kind='basic'){
 const lib=THREE.ShaderLib[kind]!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};
 m.onBeforeCompile(s as never,undefined as never);return s;
}
function block(s:string,name:string){const b=s.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(b,`${name} runs in the rendered shader`);return b;}
const named=<T extends THREE.Object3D>(o:THREE.Object3D,n:string):T=>{const found=o.getObjectByName(n);assert.ok(found,n);return found as T;};
const spot: LampSpot={x:0,y:0,z:0,height:8,kind:LAMP_KIND.sodium,yaw:0,slope:[0,0]};
function finite(){return createStreetLights([spot],{weatherEffects:true,reflectionReach:8} as StreetLightOptions);}

test('urban reflection footprint rejects the far-lamp projections that crossed the North Bridge camera',()=>{
 const made=finite();
 try{
  const refl=named<THREE.InstancedMesh>(made.group,'street-lamp-reflections'),s=compile(refl.material as THREE.Material);
  const body=block(s.fragmentShader,'reflection-footprint');
  // Recorded CPU reconstruction of the three quads covering capture pixel (140,470).
  for(const [anchor,world]of [
   [[253.444,26.408,476.414],[125.946,16.732,36.664]],
   [[227.353,3.447,-413.690],[125.838,16.649,33.360]],
   [[-362.113,18.318,-194.428],[123.713,16.710,34.174]],
  ]){
   const e={vars:{vReflectionAnchor:anchor!,vReflectionWorld:world!,uReflectionReach:8,reflectionOpen:1}};
   new Glsl('').run(body,e);assert.equal(e.vars.reflectionOpen,0,'a distant tangent plane cannot become a foreground reflection');
   const vertex={vars:{reflectionCentre:world!,lampBase:anchor!,uReflectionReach:8,reflectionValid:1}};
   new Glsl('').run(block(s.vertexShader,'reflection-local'),vertex);assert.equal(vertex.vars.reflectionValid,0,'reject the whole far quad before rasterisation');
  }
  for(const d of [0,2,4,8,20]){
   const e={vars:{vReflectionAnchor:[0,0,0],vReflectionWorld:[d,0,0],uReflectionReach:8,reflectionOpen:1}};
   new Glsl('').run(body,e);if(d<4)assert.equal(e.vars.reflectionOpen,1);if(d>=8)assert.equal(e.vars.reflectionOpen,0);
  }
 }finally{made.dispose();}
});

async function receiver(){
 const root=new THREE.Group(),geometry=new THREE.PlaneGeometry(8,30).rotateX(-Math.PI/2),material=new THREE.MeshBasicMaterial();
 const road=new THREE.Mesh(geometry,material);road.name='waverley-bridge-decks';road.position.set(130,15,35);root.add(road);
 const made=await (loadWaverleyLamps as (g:(x:number,z:number)=>number,n:boolean,r:THREE.Object3D)=>ReturnType<typeof loadWaverleyLamps>)(()=>0,true,root);
 const refl=named<THREE.InstancedMesh>(made.group,'street-lamp-reflections'),s=compile(refl.material as THREE.Material);
 return {made,s,dispose(){made.dispose();geometry.dispose();material.dispose();}};
}
function receiverProgram(s:ReturnType<typeof compile>){
 assert.ok(s.uniforms.uLampSurface,'reflections receive actual road geometry, not only a roof-cover map');
 const tex=s.uniforms.uLampSurface!.value as THREE.DataTexture,rect=(s.uniforms.uLampSurfaceRect!.value as THREE.Vector4).toArray();
 const data=tex.image.data as Uint8Array,nx=tex.image.width,nz=tex.image.height;
 const fetch=(_t:Value,uv:Value):Value=>{
  assert.ok(Array.isArray(uv));const x=uv[0]!*nx-.5,z=uv[1]!*nz-.5,ix=Math.floor(x),iz=Math.floor(z),fx=x-ix,fz=z-iz;
  const at=(i:number,j:number,k:number)=>data[(Math.max(0,Math.min(nz-1,j))*nx+Math.max(0,Math.min(nx-1,i)))*4+k]!/255;
  return [0,1,2,3].map(k=>(at(ix,iz,k)*(1-fx)+at(ix+1,iz,k)*fx)*(1-fz)+(at(ix,iz+1,k)*(1-fx)+at(ix+1,iz+1,k)*fx)*fz);
 };
 const fn=s.fragmentShader.match(/vec2 lampReceiver\(vec2 p\) \{[\s\S]*?\n\}/)![0];
 return {glsl:new Glsl(fn),env:{vars:{uLampSurface:new Sampler(tex),uLampSurfaceRect:rect},fns:{texture2D:fetch}}};
}

test('Waverley reflection footprint is on the drawn road deck and inside its wet receiver mask',async()=>{
 const r=await receiver();
 try{
  const {glsl,env}=receiverProgram(r.s);
  const clip=block(r.s.fragmentShader,'reflection-receiver-clip');
  for(const [p,expected]of [ [[130,15.012,35],1],[[130,19,35],0],[[120,15.012,35],0],[[130,15.012,55],0] ] as const){
   const e={...env,vars:{...env.vars,vReflectionWorld:[...p],reflectionOpen:1}};
   glsl.run(clip,e);if(expected)assert.ok(Number(e.vars.reflectionOpen)>.99);else assert.equal(e.vars.reflectionOpen,0,'no light above, below or beside the physical road');
  }
 }finally{r.dispose();}
});

test('Waverley reflection vertices and source anchor use the actual deck height instead of a remote tangent-plane height',async()=>{
 const r=await receiver();
 try{
  const {glsl,env}=receiverProgram(r.s);
  const anchor={...env,vars:{...env.vars,lampHead:[130,24,35],lampBase:[130,27,35]}};
  glsl.run(block(r.s.vertexShader,'reflection-receiver-anchor'),anchor);assert.ok(Math.abs((anchor.vars.lampBase as number[])[1]!-15.012)<.01);
  const vertex={...env,vars:{...env.vars,vReflectionWorld:[130,27,35]}};
  glsl.run(block(r.s.vertexShader,'reflection-receiver-vertex'),vertex);assert.ok(Math.abs((vertex.vars.vReflectionWorld as number[])[1]!-15.012)<.01);
 }finally{r.dispose();}
});

test('KX city street reflections also clip against the drawn asphalt and paving receiver',()=>{
 const made=addCity(new THREE.Scene(),kx,city,{nightEffects:true,trees:false});
 try{
  const s=compile((named<THREE.InstancedMesh>(made.lights!.group,'street-lamp-reflections')).material as THREE.Material);
  assert.ok(s.uniforms.uLampSurface);const bytes=(s.uniforms.uLampSurface!.value as THREE.DataTexture).image.data as Uint8Array;
  let wet=0,dry=0;for(let i=2;i<bytes.length;i+=4){if(bytes[i])wet++;else dry++;}
  assert.ok(wet>1000&&dry>1000,'wet roads and unlit voids are distinct');
  assert.ok(s.fragmentShader.includes('reflection-receiver-clip-begin'));
 }finally{made.dispose();}
});

test('urban rain reflections fade continuously to zero at every quad edge',()=>{
 const made=finite();
 try{
  const s=compile((named<THREE.InstancedMesh>(made.group,'street-lamp-reflections')).material as THREE.Material);
  const body=block(s.fragmentShader,'reflection-alpha')+block(s.fragmentShader,'reflection-edge');
  const run=(uv:number[])=>{const e={vars:{vReflectionUv:uv,uLampWet:1,reflectionOpen:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(body,e);return (e.vars.gl_FragColor as number[])[3]!;};
  assert.ok(run([0,0])>.7);for(const uv of [[1,0],[-1,0],[0,1],[0,-1]])assert.equal(run(uv),0);
  assert.ok(run([0,.9])<run([0,.7]));assert.ok(run([0,.99])<.001);
 }finally{made.dispose();}
});

test('KX mast line pools fall off along their length and across their width without a grey plateau',()=>{
 const made=addCity(new THREE.Scene(),kx,{...city,roads:[],trees:[],areas:[],canals:[]},{nightEffects:true,trees:false});
 try{
  const s=compile((named<THREE.InstancedMesh>(made.lights!.group,'street-lamp-pools')).material as THREE.Material),body=block(s.fragmentShader,'pool-profile');
  const run=(u:number,v:number)=>{const e={vars:{vPoolUv:[u,v],vPoolLine:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(body,e);return(e.vars.gl_FragColor as number[])[3]!;};
  assert.equal(run(.5,.5),1);for(const p of [[.75,.5],[.5,.75]])assert.ok(run(p[0]!,p[1]!)>.2&&run(p[0]!,p[1]!)<.8,'mid-radius is dimmer than the centre');
  for(const p of [[0,.5],[1,.5],[.5,0],[.5,1]])assert.equal(run(p[0]!,p[1]!),0);
 }finally{made.dispose();}
});

test('KX mast strips blaze vertically and ordinary street heads retain a modest halo',()=>{
 const made=addCity(new THREE.Scene(),kx,city,{nightEffects:true,trees:false});
 try{
  const halo=named<THREE.Points>(made.lights!.group,'street-lamp-halos'),m=halo.material as THREE.PointsMaterial;
  assert.ok(m.size>=2.6,'ordinary heads retain their pre-round-1 diameter');
  const scale=halo.geometry.getAttribute('lampHaloScale');assert.ok(scale,'mast strips have a separate luminous diameter');
  assert.ok(Array.from(scale.array).some(x=>x>=2));assert.ok(Array.from(scale.array).some(x=>x===1));
  assert.equal(scale.count,halo.geometry.getAttribute('position').count,'source and fog-scatter points both have the scale');
  assert.match(compile(m,'points').vertexShader,/gl_PointSize \*= lampHaloScale/);
  made.lights!.setLevel(1);assert.equal(m.opacity,.9);made.lights!.setLevel(0);assert.equal(halo.visible,false);
 }finally{made.dispose();}
});

test('KX shed heads retain a visible halo around the bright core without changing the bounded pool',()=>{
 const scene=new THREE.Scene(),climate=createAtmosphere({scene,world:addWorld(scene,{grid:false}),sites:{platform:[],shed:[0,12,0],concourse:[]},platformLampFloor:[[[-3,-3],[3,-3],[3,3],[-3,3]]]});
 try{
  const halo=named<THREE.Points>(scene,'street-lamp-halos');assert.ok((halo.material as THREE.PointsMaterial).size>=3);
  const pools=named<THREE.InstancedMesh>(scene,'street-lamp-pools');assert.equal((pools.material as THREE.Material).blending,THREE.NormalBlending);
 }finally{climate.dispose();}
});
