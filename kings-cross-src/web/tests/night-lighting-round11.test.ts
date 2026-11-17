import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {addCity} from '../src/city.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {createAtmosphere} from '../src/atmosphere.ts';
import {addWorld} from '../src/world.ts';
import {CLEAR_STATE,forcedObservation,weatherState} from '../src/weather.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {Glsl} from './glsl.ts';
import {reflectionProbe} from './lamp-reflection-probe.ts';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}

test('KX production road balance restores warm-white LEDs and darker gaps without changing mast/cool optics or pool extent',()=>{
 const city=addCity(new THREE.Scene(),read('kx-track'),read('kx-city'),{nightEffects:true,trees:false});
 try{
  const m=city.lights!.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh,s=shader(m.material as THREE.Material),code=block(s.fragmentShader,'pool-road-balance');
  const at=(kind:number,mast:number,head:number)=>{const e={vars:{vPoolBeam:[0,-1,kind,mast],poolHead:head,gl_FragColor:[.12,.12,.12,.5]}};new Glsl('').run(code,e);return e.vars.gl_FragColor;};
  const c=at(1,0,0).slice(0,3).map(v=>new THREE.Color(v,v,v).getRGB({r:0,g:0,b:0},THREE.SRGBColorSpace).r);
  assert.ok(c[0]!/c[2]!>=1.2&&c[0]!/c[2]!<=1.35,'warm LED has a warm-white display hue');
  for(const kind of [0,1]){assert.ok(at(kind,0,0)[0]!<=.12*.7,'between-head road energy falls enough to undo 89 vs 72');assert.equal(at(kind,0,1)[0],.12,'keep the head patch');assert.equal(at(kind,0,0)[3],.5,'retain pool coverage');}
  assert.deepEqual(at(2,0,0),[.12,.12,.12,.5]);assert.deepEqual(at(1,1,0),[.12,.12,.12,.5]);
  const remote=createStreetLights([{x:0,y:0,z:0,height:8,yaw:0,kind:1,slope:[0,0]}],urbanLampOptions());
  try{assert.ok(!shader((remote.group.getObjectByName('street-lamp-pools') as THREE.Mesh).material as THREE.Material).fragmentShader.includes('pool-road-balance'));}finally{remote.dispose();}
 }finally{city.dispose();}
});

test('urban fog adds a broad soft source-centred lobe and extinguishes far heads, retaining clear/day and legacy shaders',()=>{
 const spot={x:0,y:0,z:0,height:8,yaw:0,kind:0 as const,slope:[0,0] as [number,number]},urban=createStreetLights([spot],{...urbanLampOptions(),lightFog:true,softFog:true}),plain=createStreetLights([spot],{weatherEffects:true});
 try{
  const s=shader((urban.group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.Material,'points'),code=block(s.fragmentShader,'lamp-air-profile');
  const at=(r:number,d=50,fog=1,flag=1,mast=0)=>{const e={vars:{gl_PointCoord:[.5+r/2,.5],vLampFogDistance:d,uLampFog:fog,vLampFogHalo:flag,vLampFogMast:mast,lampAirAlpha:1,gl_FragColor:[1,1,1,.02]}};new Glsl('').run(code,e);return e.vars.gl_FragColor[3]!;};
  assert.ok(at(.4)>.04&&at(.7)>.005,'the soft halo remains visible beyond its sharp head texture');
  let prev=Infinity;for(let i=0;i<=100;i++){const a=at(i/100);assert.ok(a<=prev+1e-7,'no hollow rings');prev=a;}
  assert.ok(at(.4,500)<at(.4,50)*.08,'distant lamps fade out');
  assert.equal(at(.4,50,0),.02);assert.equal(at(.4,50,1,0),.02);assert.equal(at(.4,50,1,1,1),.02,'accepted mast lobes stay exact');
  assert.ok(!shader((plain.group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.Material,'points').fragmentShader.includes('lamp-air-profile'));
  const core=shader((urban.group.getObjectByName('street-lamp-cores') as THREE.Points).material as THREE.Material,'points');
  const extinction=(d:number,fog=1)=>{const e={vars:{vUrbanLampDistance:d,uUrbanLampFog:fog,gl_FragColor:[1,1,1,1]}};new Glsl('').run(block(core.fragmentShader,'lamp-source-extinction'),e);return e.vars.gl_FragColor[0]!;};
  assert.equal(extinction(100),1);assert.ok(extinction(500)<.2);assert.equal(extinction(500,0),1);

 }finally{urban.dispose();plain.dispose();}
});

test('city-selected low cloud lifts dense night fog sky without changing lighting, daytime or legacy climate',()=>{
 const setup=(cloud:boolean)=>{const scene=new THREE.Scene(),world=addWorld(scene,{grid:false}),a=createAtmosphere({scene,world,sites:null,cityFogTint:[.32,.266,.237],...{litFogCloud:cloud}});const camera=new THREE.PerspectiveCamera();camera.position.set(260,220,90);let wall=0;return{a,at(time:number,weather=weatherState(forcedObservation('fog'))){a.update({camera,target:new THREE.Vector3(),timeMs:time,wallMs:wall+=1000,weather});return a.state()!.rig;}};};
 const a=setup(true),b=setup(false),night=Date.parse('2026-11-20T22:30:00Z'),day=Date.parse('2026-11-20T12:00:00Z');
 try{const x=a.at(night),y=b.at(night);assert.ok(x.dome.zenith[0]>y.dome.zenith[0]*1.5,'overview low cloud must be lit');assert.ok(x.dome.zenith[0]/x.dome.zenith[2]<1.5,'warm grey rather than sepia');assert.deepEqual({...x,dome:y.dome},y,'no surface light or visibility raise');for(const[t,w]of [[day,CLEAR_STATE],[night,CLEAR_STATE],[day,weatherState(forcedObservation('fog'))]] as const)assert.deepEqual(a.at(t,w),b.at(t,w));}finally{a.a.dispose();b.a.dispose();}
 const main=readFileSync(new URL('../src/main.ts',import.meta.url),'utf8'),remote=readFileSync(new URL('../src/station-weather.ts',import.meta.url),'utf8');assert.match(main,/litFogCloud:true/);assert.match(remote,/litFogCloud/);
});

test('Market Street rain streaks survive real opaque occlusion in the frozen North Bridge camera and stay on wet road',async()=>{
 const built=buildWaverleyScene({lighting:false}),lamps=await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain),true,built.group);
 try{
  built.group.updateMatrixWorld(true);lamps.group.updateMatrixWorld(true);
  const mesh=lamps.group.getObjectByName('waverley-approach-lamps')!.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
  assert.ok(Object.keys(mesh.geometry.attributes).length+5<=16,'instancing and road samples fit the WebGL attribute budget');
  const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(125.47,16.73,35);camera.lookAt(-40,8,10);camera.updateMatrixWorld();
  const opaque:THREE.Object3D[]=[];built.group.traverse(o=>{const m=o as THREE.Mesh;if(!m.isMesh)return;let visible=true;for(let p:THREE.Object3D|null=o;p;p=p.parent)if(!p.visible)visible=false;const materials=Array.isArray(m.material)?m.material:[m.material];if(visible&&materials.some(x=>!x.transparent||x.depthWrite))opaque.push(o);});
  let visibleRuns=0,total=0;const receipts:unknown[]=[];
  for(const i of [10,11,12,13,14,15]){
   const p=reflectionProbe(mesh,camera,i),ys:number[]=[],xs:number[]=[];
   try{for(let y=330;y<410;y+=2)for(let x=160;x<265;x+=2){const hit=p.at(x,y);if(!hit||hit.alpha<.035)continue;const point=new THREE.Vector3().fromArray(hit.world),d=point.clone().sub(camera.position),first=new THREE.Raycaster(camera.position,d.clone().normalize(),0,d.length()-.10).intersectObjects(opaque,false)[0];if(first)continue;assert.ok(hit.receiver[1]>.5);assert.ok(Math.abs(hit.world[1]!-hit.receiver[0]!)<.16);ys.push(y);xs.push(x);total++;}
    if(ys.length>=12&&Math.max(...ys)-Math.min(...ys)>=10)visibleRuns++;
    const head=p.head.clone().project(camera);receipts.push({index:i,head:[640*(head.x+1),400*(1-head.y)],samples:ys.length,visibleBox:ys.length?[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)]:null});
   }finally{p.dispose();}
  }
  console.log("R11 WV visibility",JSON.stringify({visibleRuns,total,receipts}));
  assert.ok(visibleRuns>=3,`only ${visibleRuns} road streaks survive building occlusion (${total} samples)`);assert.ok(total>=100,`only ${total} samples: must read at frame scale`);
  assert.equal(lamps.counts().triangles,41992);assert.equal(lamps.counts().draws,10);
 }finally{lamps.dispose();built.dispose();}
});
