import assert from 'node:assert/strict';
import test,{after} from 'node:test';
import * as THREE from 'three';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {createWaverleyGlow} from '../src/waverley-night.ts';
import {createStreetLights,MAST_STRIP} from '../src/streetlights.ts';
import {urbanLampOptions,createPlatformLamps} from '../src/station-lamps.ts';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {Glsl} from './glsl.ts';
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}
const scene=buildWaverleyScene({lighting:false}),glow=createWaverleyGlow(scene.group),camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(70,17.86,-185);camera.lookAt(55,43,-125);camera.updateMatrixWorld();scene.group.updateMatrixWorld(true);after(()=>{glow.dispose();scene.dispose();});
const meshes:THREE.Object3D[]=[];scene.group.getObjectByName('waverley-frontage')!.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes.push(o);});
function emissionAt(x:number,y:number,level=1){
 const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((x+.5)/640-1,1-(y+.5)/400),camera);const hit=ray.intersectObjects(meshes,false)[0];assert.ok(hit,'the frozen pixel reaches built frontage');const mesh=hit.object as THREE.Mesh,m=mesh.material as THREE.MeshLambertMaterial,g=mesh.geometry,face=hit.face!,indices=[face.a,face.b,face.c],p=g.getAttribute('position'),vertices=indices.map(i=>new THREE.Vector3().fromBufferAttribute(p,i)),bary=new THREE.Vector3();THREE.Triangle.getBarycoord(mesh.worldToLocal(hit.point.clone()),vertices[0]!,vertices[1]!,vertices[2]!,bary);
 const interpolate=(a:THREE.BufferAttribute|THREE.InterleavedBufferAttribute)=>indices.reduce((v,i,j)=>v.addScaledVector(new THREE.Vector3().fromBufferAttribute(a,i),bary.getComponent(j)),new THREE.Vector3());const normal=interpolate(g.getAttribute('normal')).transformDirection(mesh.matrixWorld),colour=g.hasAttribute('color')?interpolate(g.getAttribute('color')):new THREE.Vector3(1,1,1);colour.multiply(new THREE.Vector3(m.color.r,m.color.g,m.color.b));
 const bridgeDeck=g.getAttribute('northBridgeDeck');
 const vNorthBridgeDeck=bridgeDeck?indices.reduce((sum,i,j)=>sum+bridgeDeck.getX(i)*bary.getComponent(j),0):0;
 const s=shader(m,'lambert'),start=s.fragmentShader.indexOf('// station-light-begin'),end=s.fragmentShader.indexOf('#include <lights_lambert_fragment>',start);assert.ok(start>=0&&end>start);const e={vars:{vStationLampWorld:hit.point.toArray(),vStationLampNormal:normal.toArray(),diffuseColor:[...colour.toArray(),1],uStationLampLevel:level,uStationLampSnow:0,vNorthBridgeDeck,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(s.fragmentShader.slice(start,end),e);return {mesh:mesh.name,light:e.vars.totalEmissiveRadiance as number[]};
}
test('actual camera-facing cap and turret faces retain warm radiance through the dome mask and height bands',()=>{
 for(const [x,y] of [[460,275],[460,300],[460,305],[460,310],[431,385],[437,391],[420,400],[870,370]]){const {mesh,light}=emissionAt(x!,y!);assert.equal(mesh,'waverley-frontage-structure');assert.ok(light[0]!>=.10,`dark cap band at ${x},${y}: ${light[0]}`);assert.ok(light[0]!/light[2]!>=8,'dark lead faces retain the gold uplight');}assert.deepEqual(emissionAt(460,310,0).light,[0,0,0]);
});
test('both cornice materials receive the flood below the old 24.1m cutoff',()=>{
 const a=emissionAt(555,390),b=emissionAt(780,440),dormer=emissionAt(415,345);assert.equal(a.mesh,'waverley-balmoral-facade');assert.equal(b.mesh,'waverley-frontage-structure');for(const p of [a,b,dormer])assert.ok(p.light[0]!>=.13,'cornice/dormer must not leave a dark strip under the cap');assert.deepEqual(emissionAt(555,390,0).light,[0,0,0]);
});
test('Waverley platform fog restores the BASE footprint without narrowing the city halos',()=>{
 const l=createPlatformLamps([0,10,0],[[[-10,-10],[10,-10],[10,10],[-10,10]]],0,'wv');try{const h=l.group.getObjectByName('street-lamp-halos') as THREE.Points,s=shader(h.material as THREE.Material,'points'),e={vars:{size:3.2,lampFogHalo:1,pointSize:0}};new Glsl('').run(block(s.vertexShader,'lamp-fog-size').replaceAll('gl_PointSize','pointSize'),e);assert.ok(Math.abs(Number(e.vars.pointSize)-28.8)<1e-6,'12x platform scatter caused the clipped west-end fog patch');}finally{l.dispose();}
});
test('each urban mast contributes one centred, bounded haze lobe with a monotonic soft edge',()=>{
 const spot={x:0,y:0,z:0,height:12,yaw:0,kind:LAMP_KIND.cool,slope:[0,0] as [number,number],mast:true as const},l=createStreetLights([spot],urbanLampOptions());try{const h=l.group.getObjectByName('street-lamp-halos') as THREE.Points,p=h.geometry.getAttribute('position'),flags=h.geometry.getAttribute('lampFogHaze');assert.ok(flags,'the wider air glow must be independent of the seven bright strip samples');const marked=Array.from({length:flags.count},(_,i)=>i).filter(i=>flags.getX(i)>0);assert.equal(marked.length,1);const i=marked[0]!;assert.ok(Math.abs(p.getY(i)-(MAST_STRIP[0]+MAST_STRIP[1])/2)<1e-5);assert.equal(p.getX(i),0);assert.equal(p.getZ(i),0);
 const s=shader(h.material as THREE.Material,'points'),code=block(s.fragmentShader,'lamp-mast-haze');let previous=Infinity;for(let j=0;j<=200;j++){const e={vars:{mastScatterAlpha:.9*.22,vLampFogHaze:1,gl_PointCoord:[.5+j/400,.5],gl_FragColor:[1,1,1,0]}};new Glsl('').run(code,e);const a=(e.vars.gl_FragColor as number[])[3]!;assert.ok(a<=previous+1e-8);assert.ok(a<=.29,'one lobe stays below clipping white');previous=a;}assert.equal(previous,0,'no hard sprite edge');
 const plain=createStreetLights([{...spot,mast:undefined}],urbanLampOptions());try{assert.ok(!(plain.group.getObjectByName('street-lamp-halos') as THREE.Points).geometry.hasAttribute('lampFogHaze'));assert.equal(l.counts().draws,plain.counts().draws,'haze stays in the existing Points draw');}finally{plain.dispose();}
 }finally{l.dispose();}
});
