import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {LAMP_KIND,type LampSpot} from '../../core/streetlights.ts';
import {createStreetLights,type StreetLightOptions} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {addCity} from '../src/city.ts';
import {addLandmarks} from '../src/landmarks.ts';
import {windowNight} from '../src/materials.ts';
import {surfaceUniforms} from '../src/atmosphere.ts';
import {Glsl} from './glsl.ts';

const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
function shader(m:THREE.Material){const lib=THREE.ShaderLib.basic!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}
const spots:LampSpot[]=[0,.7,Math.PI/2].flatMap(yaw=>[LAMP_KIND.sodium,LAMP_KIND.warm,LAMP_KIND.cool].map(kind=>({x:0,y:0,z:0,height:9,yaw,kind,slope:[0,0] as [number,number]})));

test('production KX pools distinguish each luminaire without discarding the accepted radial footprint',()=>{
 const city=addCity(new THREE.Scene(),read('kx-track'),read('kx-city'),{nightEffects:true,trees:false});
 try{
  const p=city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const beam=p.geometry.getAttribute('poolBeam');assert.ok(beam,'a shared disc cannot distinguish sodium from LED optics');
  const kinds=new Set(Array.from({length:beam.count},(_,i)=>beam.getZ(i)));assert.deepEqual(kinds,new Set([0,1,2]));
  assert.ok(!p.geometry.hasAttribute('poolRoadDirection'),'do not restore the shrinking round-eight UV mask');
  const s=shader(p.material as THREE.Material);block(s.fragmentShader,'pool-luminaire');
  city.lights!.setLevel(0);assert.equal(p.visible,false);
 }finally{city.dispose();}
});

test('road-oriented sodium and LED beams retain every baseline pool sample, grow along the road and have distinct cutoffs',()=>{
 const options={...urbanLampOptions(),kxOptics:true,poolRoadShape:false,poolFocus:.8,luminairePools:true} as StreetLightOptions;
 const layer=createStreetLights(spots,options);
 try{
  const p=layer.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh,beam=p.geometry.getAttribute('poolBeam');assert.ok(beam);
  const s=shader(p.material as THREE.Material),input=block(s.fragmentShader,'pool-luminaire-input'),legacy=block(s.fragmentShader,'pool-profile'),code=input+legacy+block(s.fragmentShader,'pool-luminaire');
  const at=(i:number,x:number,z:number)=>{const e={vars:{vPoolUv:[.5+.5*x,.5+.5*z],vPoolLine:0,vPoolBeam:[beam.getX(i),beam.getY(i),beam.getZ(i),beam.getW(i)],gl_FragColor:[1,1,1,1]}};new Glsl('').run(code,e);return e.vars.gl_FragColor[3]!;};
  for(let i=0;i<spots.length;i++){
   const d=[beam.getX(i),beam.getY(i)],across=[-d[1]!,d[0]!];
   for(let x=-1;x<=1.001;x+=.1)for(let z=-1;z<=1.001;z+=.1){
    const r=Math.hypot(x,z),base=Math.pow(1+.8*r*r,-1.5)*(1-THREE.MathUtils.smoothstep(r,.55,1));
    assert.ok(at(i,x,z)>=base-1e-7,'the complete accepted pool remains; extension must not trim its sides');
   }
   assert.equal(at(i,0,0),1);assert.ok(at(i,d[0]!*1.2,d[1]!*1.2)>.12,'light reaches beyond the former eight-metre disc');
   assert.equal(at(i,across[0]!*1.01,across[1]!*1.01),0,'the optic has a visible outer cutoff');
   assert.ok(at(i,d[0]!*1.6,d[1]!*1.6)>at(i,across[0]!*1.6,across[1]!*1.6),'long axis follows the road, never the lamp arm');
   const m=new THREE.Matrix4();p.getMatrixAt(i,m);assert.ok(m.elements[0]!>=28.7&&m.elements[10]!>=28.7,'the geometry contains the larger beam rather than clipping it');
  }
  assert.ok(at(2,.85,0)>at(0,.85,0)*2,'the LED keeps a crisp bright edge where sodium has a soft brown-orange skirt');
 }finally{layer.dispose();}
});

test('KX wet optics use the shared Waverley tapered streak with a dim continuous spine and snow suppression',()=>{
 const city=addCity(new THREE.Scene(),read('kx-track'),read('kx-city'),{nightEffects:true,trees:false});
 try{
  const r=city.lights!.group.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh,s=shader(r.material as THREE.Material);
  const code=block(s.fragmentShader,'reflection-alpha')+block(s.fragmentShader,'reflection-edge')+block(s.fragmentShader,'reflection-breakup');
  const at=(x:number,y:number,wet=1)=>{const e={vars:{vReflectionUv:[x,y],vReflectionAnchor:[12,0,25],uLampWet:wet,reflectionOpen:1,gl_FragColor:[1,1,1,1]}};new Glsl('').run(code,e);return e.vars.gl_FragColor[3]!;};
  const spine=Array.from({length:131},(_,i)=>at(0,-.65+i*.01));assert.ok(Math.min(...spine)>=.055,'the KX path must retain the dim wet spine between bright segments');
  assert.ok(Math.max(...spine)>3*Math.min(...spine));assert.ok(at(0,.9)>=.035,'a long soft tail remains visible');
  assert.ok(at(.6,.8)<.7*at(.6,0),'the streak narrows towards its eye-facing tip');
  assert.equal(at(0,0,0),0);assert.equal(at(0,0,.3),0);block(s.fragmentShader,'reflection-snow');block(s.fragmentShader,'reflection-receiver-clip');
 }finally{city.dispose();}
});

test('Midland wet reflections come from real lit window panes and keep the exact pane colour and dusk timing',()=>{
 const scene=new THREE.Scene(),landmarks=addLandmarks(scene,read('kx-track'));
 const city=addCity(scene,read('kx-track'),read('kx-city'),{nightEffects:true,trees:false,hidden:new Set(landmarks.excludeIds)});
 const wet=surfaceUniforms.wet.value,snow=surfaceUniforms.snowCover.value;
 try{
  const mesh=city.lights!.group.getObjectByName('kx-midland-window-reflections') as THREE.InstancedMesh;
  assert.ok(mesh,'the lit Midland panes need their own wet-ground reflections');
  const id=mesh.geometry.getAttribute('reflectionWindowId'),head=mesh.geometry.getAttribute('reflectionHead');
  assert.ok(mesh.count>=20&&mesh.count<350,'only low facade panes with a real paving receiver are reflected');
  const s=shader(mesh.material as THREE.Material),paneShader=shader((landmarks.group.getObjectByName('landmarks-pane') as THREE.Mesh).material as THREE.Material);
  const definitions=(source:string)=>{const end=source.indexOf('\n}',source.indexOf('vec3 midlandPaneLight('))+2;return source.slice(source.indexOf('float winHash('),end);};
  const own=new Glsl(definitions(paneShader.fragmentShader)),reflected=new Glsl(definitions(s.fragmentShader));
  const pane=(landmarks.group.getObjectByName('landmarks-pane') as THREE.Mesh).geometry,positions=pane.getAttribute('position'),uv=pane.getAttribute('uv'),index=pane.index!;
  const triangles=new Map<number,THREE.Triangle[]>();
  for(let t=0;t<index.count;t+=3){const ids=[index.getX(t),index.getX(t+1),index.getX(t+2)];if(ids.some(i=>uv.getY(i)>=-.5))continue;const key=Math.floor(uv.getX(ids[0]!)),list=triangles.get(key)??[];list.push(new THREE.Triangle(...ids.map(i=>new THREE.Vector3().fromBufferAttribute(positions,i)) as [THREE.Vector3,THREE.Vector3,THREE.Vector3]));triangles.set(key,list);}
  const code=block(s.fragmentShader,'reflection-window');
  let lit=0,dark=0;
  for(let i=0;i<mesh.count;i++){
   assert.ok(Number.isInteger(id.getX(i)));const point=new THREE.Vector3().fromBufferAttribute(head,i);
   for(let j=0;j<i;j++)if(id.getX(i)===id.getX(j))assert.ok(point.distanceTo(new THREE.Vector3().fromBufferAttribute(head,j))>=.05,'a pane fan must create one reflected light, not duplicate overlapping streaks');
   assert.ok(triangles.get(id.getX(i))!.some(t=>t.closestPointToPoint(point,new THREE.Vector3()).distanceTo(point)<.001),'every reflected source lies on its actual glass triangle');
   for(const night of [0,.3,1]){
    const expected=own.call('midlandPaneLight',[[id.getX(i)+.5,-1.5],[.02,.02],night],{vars:{}});
    const e={vars:{vReflectionWindowId:id.getX(i),uWinNight:night,gl_FragColor:[1,1,1,1]}};reflected.run(code,e);
    assert.deepEqual(e.vars.gl_FragColor.slice(0,3),expected,'a dark pane must not reflect; lit colour and dusk phase follow the actual glass');
    if(night===1){if((expected as number[])[0]!>0)lit++;else dark++;}
   }
  }
  assert.ok(lit>5&&dark>5);assert.equal(s.uniforms.uWinNight!.value,windowNight.value);
  block(s.fragmentShader,'reflection-receiver-clip');block(s.fragmentShader,'reflection-snow');
  surfaceUniforms.wet.value=1;surfaceUniforms.snowCover.value=0;city.lights!.setLevel(1);assert.equal(mesh.visible,true);
  city.lights!.setLevel(0);assert.equal(mesh.visible,false);
  surfaceUniforms.snowCover.value=.8;city.lights!.setLevel(1);assert.equal(mesh.visible,false);
 }finally{surfaceUniforms.wet.value=wet;surfaceUniforms.snowCover.value=snow;city.dispose();landmarks.dispose();}
});
