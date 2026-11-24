import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { shedLayout, worldToShed, SHED_SPAN_WIDTH } from '../../core/station.ts';
import { addCity } from '../src/city.ts';
import { surfaceUniforms } from '../src/atmosphere.ts';
import { Glsl } from './glsl.ts';
import { lampSurfaceAt } from '../src/lamp-wet-surface.ts';
// Re-pinned 2026-11-24 (shed realignment, signed off): the vault centres are the spine -/+ R (aisle + R and aisle + 3R before, the same points while the aisles were even), the valley is the spine, and there is no west aisle, so a probe of 'the aisle' stands in the east aisle.
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
const data=read('kx-track'),city=read('kx-city');
function make(){const scene=new THREE.Scene();let layer:{setLevel(l:number):void}|undefined;const made=addCity(scene,data,city,{nightEffects:true,trees:false,night:{attach(l){layer=l;return()=>{};}}});return {scene,made,setLevel(l:number){layer!.setLevel(l);}};}
function reflection(scene:THREE.Object3D){const object=scene.getObjectByName('kx-front-glazing-reflections');assert.ok(object,'actual front glazing has a dedicated reflected surface');return object as THREE.InstancedMesh;}
function shader(mesh:THREE.InstancedMesh){const lib=THREE.ShaderLib.basic,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};(mesh.material as THREE.Material).onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,name:string){const b=s.split(`// ${name}-begin`)[1]?.split(`// ${name}-end`)[0];assert.ok(b);return b;}

test('KX front reflections follow both built south lunette surfaces without creating extra fittings or pools',()=>{
 const r=make();try{const mesh=reflection(r.scene),layout=shedLayout(data),heads=mesh.geometry.getAttribute('reflectionHead');assert.equal(mesh.count,10);assert.equal(heads.count,mesh.count);
 const counts=[0,0];for(let i=0;i<heads.count;i++){const p=worldToShed(layout,[heads.getX(i),heads.getZ(i)]),c=layout.spine+(p.u<layout.spine?-.5:.5)*SHED_SPAN_WIDTH;assert.ok(Math.abs(p.v-.7)<.001,'inside the built glazing recess');assert.ok(Math.hypot(p.u-c,heads.getY(i)-layout.springing)<SHED_SPAN_WIDTH/2-.02);counts[p.u<layout.spine?0:1]++;}
 assert.deepEqual(counts,[5,5]);const group=mesh.parent!;assert.equal(group.children.length,1,'only reflections, no source heads, pools or posts');assert.equal(mesh.geometry.index!.count/3*mesh.count,160);
 }finally{r.made.dispose();}
});

test('KX front reflected glazing is invisible by day and in dry weather and clips to the existing paving receiver',()=>{
 const r=make(),wet=surfaceUniforms.wet.value;try{const mesh=reflection(r.scene),s=shader(mesh);surfaceUniforms.wet.value=1;r.setLevel(0);assert.equal(mesh.visible,false);r.setLevel(1);assert.equal(mesh.visible,true);surfaceUniforms.wet.value=0;r.setLevel(1);assert.equal(mesh.visible,false);
 const receiver={map:s.uniforms.uLampSurface!.value as THREE.DataTexture,rect:s.uniforms.uLampSurfaceRect!.value as THREE.Vector4,dispose(){}};
 const matrix=new THREE.Matrix4();mesh.getMatrixAt(0,matrix);const base=new THREE.Vector3().setFromMatrixPosition(matrix);
 for(const [p,expected]of [[base.toArray(),true],[[base.x,base.y+4,base.z],false],[[10000,base.y,10000],false]] as const){
  const env={vars:{vReflectionWorld:[...p],reflectionOpen:1},fns:{lampReceiver:(uv:import('./glsl.ts').Value)=>{assert.ok(Array.isArray(uv));return [...lampSurfaceAt(receiver,uv[0]!,uv[1]!)];}}};
  new Glsl('').run(block(s.fragmentShader,'reflection-receiver-clip'),env);if(expected)assert.ok(env.vars.reflectionOpen>.9);else assert.equal(env.vars.reflectionOpen,0);
 }
 assert.ok(s.uniforms.uLampSurface);assert.match(s.vertexShader,/headReceiver = lampReceiver\(lampBase.xz\)/);assert.match(s.fragmentShader,/reflection-receiver-clip-begin/);assert.match(s.fragmentShader,/reflection-footprint-begin/);
 const alpha=block(s.fragmentShader,'reflection-alpha');for(const [wet,expected]of [[0,0],[.4,0],[1,1]]){const e={vars:{vReflectionUv:[0,0],uLampWet:wet,reflectionOpen:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(alpha,e);const a=(e.vars.gl_FragColor as number[])[3]!;if(expected)assert.ok(a>0);else assert.equal(a,0);}
 }finally{surfaceUniforms.wet.value=wet;r.made.dispose();}
});

test('plain city path allocates no KX front reflection surfaces',()=>{const enhanced=make();try{reflection(enhanced.scene);}finally{enhanced.made.dispose();}const scene=new THREE.Scene(),made=addCity(scene,data,city,{trees:false});try{assert.equal(!!scene.getObjectByName('kx-front-glazing-reflections'),false);}finally{made.dispose();}});
