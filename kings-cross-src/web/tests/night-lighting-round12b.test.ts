import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import {createPlatformLamps,urbanLampOptions} from '../src/station-lamps.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {surfaceUniforms,createAtmosphere} from '../src/atmosphere.ts';
import {addWorld} from '../src/world.ts';
import {forcedObservation,weatherState} from '../src/weather.ts';
import {lampHaloProbe} from './lamp-halo-probe.ts';
const amount=.8963541094861764,fog={near:-17.986,far:210.019,amount};
function camera(){const c=new THREE.PerspectiveCamera(50,1.6,.1,20000);c.position.set(0,26,50);c.lookAt(0,12,0);c.updateMatrixWorld();return c;}
const receiver={background:[.14,.13,.12],depth:100,fogColour:[.352,.2926,.2607],exposure:2.3};

test('dense roof fog uses bounded halo compositing, preserving isolated bright cores, rib occlusion and the original clear/snow program',()=>{
 for(const station of ['kx','wv'] as const){
  surfaceUniforms.fog.value=0;const layer=createPlatformLamps(Array.from({length:64},()=>[0,8,0]).flat(),[],0,station,true);
  try{
   layer.setLevel(1);layer.group.updateMatrixWorld(true);const points=layer.group.getObjectByName('street-lamp-halos') as THREE.Points,clear=points.material as THREE.PointsMaterial,budget=layer.counts();
   surfaceUniforms.fog.value=amount;layer.setLevel(1);const material=points.material as THREE.PointsMaterial;
   assert.equal(material.blending,THREE.CustomBlending,'overlapping fog uses a bounded additive blend');
   assert.equal(material.blendSrc,THREE.OneFactor);
   assert.equal(material.blendDst,THREE.OneMinusSrcColorFactor);
   assert.equal(material.depthTest,true);
   assert.equal(((layer.group.getObjectByName('street-lamp-cores') as THREE.Points).material as THREE.Material).blending,THREE.AdditiveBlending);
   const p=lampHaloProbe(points,camera(),fog),source=p.entries.find(p=>p.halo)!;
   for(const x of [3,10,20,30]){const out=p.composeAt(source.x+x,source.y,receiver);assert.ok(Math.max(...out.rgb)<.69,'even 64 coincident lights stay below lamp peaks');assert.ok(out.rgb[0]!>out.rgb[2]!*1.04,'warm grey, not a neutral white void');const rib=p.composeAt(source.x+x,source.y,{...receiver,depth:20,background:[.04,.04,.04]});assert.ok(out.rgb[0]!-rib.rgb[0]!>.10,'near arch ribs occlude distant glow and retain contrast');}
   for(const weather of [0,.0912,.26]){surfaceUniforms.fog.value=weather;layer.setLevel(1);assert.equal(points.material,clear,'night-clear/rain/snow render the exact original material');}
   assert.deepEqual(layer.counts(),budget,'no triangles or draws added');
  }finally{layer.dispose();surfaceUniforms.fog.value=0;}
 }
});

test('mast halo gain survives ACES, display clipping and the near veil at the upper end of the physical LED strip',()=>{
 surfaceUniforms.fog.value=0;const layer=createStreetLights([{x:0,y:0,z:0,height:10,yaw:0,kind:2,mast:true,slope:[0,0]}],{...urbanLampOptions(),softFog:true,kxOptics:true});
 try{
  layer.setLevel(1);layer.group.updateMatrixWorld(true);const points=layer.group.getObjectByName('street-lamp-halos') as THREE.Points,clear=points.material,baseline=lampHaloProbe(points,camera(),fog),top=baseline.entries.filter(p=>!p.halo&&!p.haze&&!p.core).sort((a,b)=>a.y-b.y)[0]!;
  surfaceUniforms.fog.value=amount;layer.setLevel(1);const head=lampHaloProbe(points,camera(),fog);
  for(const maxPointSize of [512,1024])for(const r of [10,20,30]){
   const base=baseline.composeAt(top.x+r,top.y,{...receiver,maxPointSize}),next=head.composeAt(top.x+r,top.y,{...receiver,maxPointSize});
   assert.deepEqual(base.background,next.background,'keep the confirmed veil');
   const gain=(next.excess[0]!+next.excess[1]!+next.excess[2]!-base.excess[0]!-base.excess[1]!-base.excess[2]!)*255/3;
   assert.ok(gain>=5,`${r}px display excess gain ${gain}, point limit ${maxPointSize}`);
  }
  const background=head.composeAt(top.x+120,top.y,receiver),prior=baseline.composeAt(top.x+120,top.y,receiver);assert.ok(background.excess.every((v,i)=>v<=prior.excess[i]!+.004),'do not raise the local outer background');
  surfaceUniforms.fog.value=0;layer.setLevel(1);assert.equal(points.material,clear);
 }finally{layer.dispose();surfaceUniforms.fog.value=0;}
});

test('dense fog has a gentle horizon rise and a broad lift towards the actual city lamp group, without cloud billows',()=>{
 for(const kx of [true,false]){
  const scene=new THREE.Scene(),world=addWorld(scene,{grid:false}),a=createAtmosphere({scene,world,sites:null,kingsCrossNightFog:kx,cityFogTint:kx?[.320,.266,.237]:[.215,.185,.16],litFogCloud:true}),c=camera();
  try{
   a.update({camera:c,target:new THREE.Vector3(0,12,0),timeMs:Date.parse('2026-11-20T22:30:00Z'),wallMs:1000,weather:weatherState(forcedObservation('fog'))});
   const rig=a.state()!.rig;assert.ok(rig.dome.horizon[0]>rig.dome.zenith[0]*1.035,'the fog dome must retain a gentle gradient');
   const p=world.sky.geometry.getAttribute('position'),colour=world.sky.geometry.getAttribute('color'),group=new THREE.Vector2(kx?45:40,(kx?15:-150)-50).normalize();
   const near:number[]=[],opposite:number[]=[],high:number[]=[];
   for(let i=0;i<p.count;i++){
    const t=p.getY(i)/5200,dir=new THREE.Vector2(p.getX(i),p.getZ(i)).normalize().dot(group);
    if(t>.05&&t<.10){if(dir>.97)near.push(colour.getX(i));if(dir<-.97)opposite.push(colour.getX(i));}
    if(p.getY(i)>2000&&p.getY(i)<2400)high.push(colour.getX(i));
   }
   assert.ok(near.length&&opposite.length);assert.ok(Math.max(...near)>Math.max(...opposite)+.001,'localized low cloud over the square / Princes Street');
   assert.ok(Math.max(...high)-Math.min(...high)<.00005,'no textured cloud masses return');
  }finally{a.dispose();}
 }
});
