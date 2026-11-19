import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import * as THREE from 'three';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {createWaverleyGlow} from '../src/waverley-night.ts';
import {Glsl} from './glsl.ts';
import {rgb} from '../src/materials.ts';
import {BALMORAL_COLOURS} from '../src/waverley-frontage-balmoral.ts';
const scene=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(scene.group);
after(()=>{glow.dispose();scene.dispose();});
const mesh=scene.group.getObjectByName('waverley-frontage-structure') as THREE.Mesh;
const s={uniforms:{},vertexShader:THREE.ShaderLib.lambert!.vertexShader,fragmentShader:THREE.ShaderLib.lambert!.fragmentShader};
(mesh.material as THREE.Material).onBeforeCompile(s as never,undefined as never);
const code=s.fragmentShader.split('// balmoral-trim-begin')[1]!.split('// balmoral-trim-end')[0]!;
const base=scene.group.getObjectByName('waverley-frontage')!.userData.frontage.P;
function emission(height:number,level=1){const e={vars:{vStationLampWorld:[74,base+height,-136],vStationLampNormal:[0,1,0],diffuseColor:[.1,.1,.1,1],uStationLampLevel:level,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(code,e);return e.vars.totalEmissiveRadiance as number[];}
test('Balmoral corner cap keeps its lower shoulder and upper bell in silhouette',()=>{
 glow.setLevel(1);
 const {vertexShader,fragmentShader}=THREE.ShaderLib.lambert!;
 const night={uniforms:{},vertexShader,fragmentShader};
 (mesh.material as THREE.Material).onBeforeCompile(night as never,undefined as never);
 glow.setLevel(0);
 const trim=night.fragmentShader.split('// balmoral-trim-begin')[1]!.split('// balmoral-trim-end')[0]!;
 const lead=rgb(BALMORAL_COLOURS.lead);
 function cap(height:number,level=1){
  const vars={vStationLampWorld:[74,base+height,-136],vStationLampNormal:[0,1,0],diffuseColor:[...lead,1],vColor:[...lead],
   vBalmoralTrimUv:[0,0],uStationLampLevel:level,totalEmissiveRadiance:[0,0,0]};
  new Glsl('').run(trim,{vars});return vars.totalEmissiveRadiance;
 }
 const low=cap(27.8),high=cap(30.8);
 assert.ok(Math.max(...low,...high)<.01,'both parts of the lead cap stay dark');
 assert.ok(low[0]!/low[2]!<2 && high[0]!/high[2]!<2,'the remaining fill is subdued and neutral');
 assert.deepEqual(cap(27.8,0),[0,0,0]);
});
test('Balmoral turret flood fades above its cornice instead of carrying a flat minimum up the shaft',()=>{const lamp=emission(24.8),above=emission(27.0);assert.ok(lamp[0]!>3*above[0]!,'the turret reveals vertical lamp falloff');assert.ok(above[0]!/above[2]!>=2);assert.deepEqual(emission(24.8,0),[0,0,0]);});

test('Princes Street lamp pools leave a dark gap across the frozen Balmoral road band',async()=>{
 const {loadWaverleyLamps}=await import('../src/waverley-lamps.ts'),{lampSurfaceAt}=await import('../src/lamp-wet-surface.ts');
 const lamps=await loadWaverleyLamps(scene.terrain.heightAt.bind(scene.terrain),true,scene.group),decals:THREE.Mesh[]=[],material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 try{
 lamps.group.traverse(o=>{if(o.name!=='street-lamp-pools')return;const pools=o as THREE.InstancedMesh,m=pools.material as THREE.Material,lib=THREE.ShaderLib.basic!,sh={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(sh as never,undefined as never);const surface={map:sh.uniforms.uLampSurface!.value,rect:sh.uniforms.uLampSurfaceRect!.value,dispose(){}},matrix=new THREE.Matrix4(),p=pools.geometry.getAttribute('position');
 for(let i=0;i<pools.count;i++){pools.getMatrixAt(i,matrix);const anchor=new THREE.Vector3().setFromMatrixPosition(matrix);if(Math.hypot(anchor.x-55,anchor.z+155)>60)continue;const vertices:number[]=[];
 for(let j=0;j<p.count;j++){const q=new THREE.Vector3().fromBufferAttribute(p,j).applyMatrix4(matrix),receiver=lampSurfaceAt(surface,q.x,q.z),fallback=lampSurfaceAt(surface,anchor.x,anchor.z);q.y=(receiver[1]>.001?receiver[0]:fallback[0])+.07;vertices.push(...q.toArray());}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));g.setAttribute('uv',pools.geometry.getAttribute('uv'));g.setIndex(pools.geometry.index!.clone());decals.push(new THREE.Mesh(g,material));
 }});
 const camera=new THREE.PerspectiveCamera(60,1.6,.1,10000);camera.position.set(70,17.86,-185);camera.lookAt(55,43,-125);camera.updateMatrixWorld();
 const lit=[650,800,1000,1200,1260].map(x=>{const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x/640-1,1-724/400),camera);return ray.intersectObjects(decals,false).some(h=>{const uv=h.uv!;return Math.hypot(2*uv.x-1,2*uv.y-1)<.95;});});
 assert.equal(lit[2],false,'the road at x1000,y724 must remain a dark gap between two local lamp pools');assert.ok(lit.filter(Boolean).length<=3,'local pools must not read as a continuous road-wide orange strip');assert.ok(lit.some(Boolean),'retain actual local ground lighting');
 }finally{for(const m of decals)m.geometry.dispose();material.dispose();lamps.dispose();}
});
