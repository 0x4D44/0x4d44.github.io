import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createAtmosphere} from '../src/atmosphere.ts';
import {addWorld} from '../src/world.ts';
import {CLEAR_STATE,forcedObservation,weatherState} from '../src/weather.ts';
import {createStreetLights} from '../src/streetlights.ts';
import {createPlatformLamps,urbanLampOptions} from '../src/station-lamps.ts';
import {WAVERLEY_HAZE} from '../src/station-weather.ts';
import {Glsl} from './glsl.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {reflectionProbe} from './lamp-reflection-probe.ts';
import {lampHaloProbe} from './lamp-halo-probe.ts';
import {addCity} from '../src/city.ts';

const night=Date.parse('2026-11-20T22:30:00Z'),day=Date.parse('2026-11-20T12:00:00Z');
function climate(city:'kx'|'wv'|'pt',cloud=true){
 const scene=new THREE.Scene(),world=addWorld(scene,{grid:false}),camera=new THREE.PerspectiveCamera(50,1.6,.1,20000);
 const a=createAtmosphere({scene,world,sites:null,...(city==='kx'?{kingsCrossNightFog:true,cityFogTint:[.320,.266,.237] as const}:city==='wv'?{cityFogTint:[.215,.185,.16] as const,haze:WAVERLEY_HAZE}:{}),litFogCloud:cloud&&city!=='pt'});
 let wall=0;
 return{a,world,at(y:number,weather=weatherState(forcedObservation('fog')),timeMs=night){camera.position.set(260,y,90);a.update({camera,target:new THREE.Vector3(),weather,timeMs,wallMs:wall+=1000});const fog=scene.fog as THREE.Fog;return{fog,rig:a.state()!.rig,amount:(d:number)=>THREE.MathUtils.smoothstep(d,fog.near,fog.far)};}};
}
function shader(m:THREE.Material){const l=THREE.ShaderLib.points!,s={uniforms:{} as Record<string,THREE.IUniform>,vertexShader:l.vertexShader,fragmentShader:l.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}

test('selected city night fog veils nearby paving and dissolves the 300m skyline without erasing overview roofs',()=>{
 for(const city of ['kx','wv'] as const){const c=climate(city);try{
  const ground=c.at(26);assert.ok(ground.amount(30)>=.04&&ground.amount(30)<=.18,'thin foreground veil');
  assert.ok(ground.amount(100)>=.3&&ground.amount(100)<=.55,'100m facade retains 45–70% contrast');
  assert.ok(ground.amount(320)>.97,'ground-level far blocks dissolve');
  const hill=c.at(45.4);assert.ok(hill.amount(350)>.98,'Balmoral from the frozen Calton camera dissolves');
  const high=c.at(220);assert.ok(high.amount(323)>.4&&high.amount(323)<.78,'overview roofs remain faintly formed');assert.ok(high.amount(600)>.98);
 }finally{c.a.dispose();}}
});

test('the near Market Street junction uses a source-aligned mirror, without the diagonal road-run sliver at the frozen left edge',async()=>{
 const built=buildWaverleyScene({lighting:false}),lamps=await loadWaverleyLamps(built.terrain.heightAt.bind(built.terrain),true,built.group);
 try{
  lamps.group.updateMatrixWorld(true);const mesh=lamps.group.getObjectByName('waverley-approach-lamps')!.getObjectByName('street-lamp-reflections') as THREE.InstancedMesh;
  const camera=new THREE.PerspectiveCamera(60,1.6,.1,20000);camera.position.set(125.47,16.73,35);camera.lookAt(-40,8,10);camera.updateMatrixWorld();
  const p=reflectionProbe(mesh,camera,19);try{const h=p.head.clone().project(camera);assert.ok(Math.abs(640*(h.x+1)-150)<2,'identify the actual source, not an off-screen lamp');for(let y=606;y<=618;y+=2)for(let x=0;x<=10;x+=2)assert.ok((p.at(x,y)?.alpha??0)<.001,`diagonal sliver at ${x},${y}`);}finally{p.dispose();}
  assert.equal(lamps.counts().triangles,41992);assert.equal(lamps.counts().draws,10);
 }finally{lamps.dispose();built.dispose();}
});

test('dense city fog paints a smooth glowing dome including the overview horizon; legacy cloud texture stays intact',()=>{
 for(const city of ['kx','wv'] as const){const c=climate(city),legacy=climate(city,false);try{
  const x=c.at(220),y=legacy.at(220),p=c.world.sky.geometry.getAttribute('position'),a=c.world.sky.geometry.getAttribute('color'),b=legacy.world.sky.geometry.getAttribute('color');
  const ratios:number[]=[];
  // A latitude ring must be smooth even though cloudDeck varies with longitude.
  for(let i=0;i<p.count;i++)if(p.getY(i)>2000&&p.getY(i)<2400)ratios.push(a.getX(i));
  assert.ok(ratios.length>50);assert.ok(Math.max(...ratios)-Math.min(...ratios)<.00005,'dense fog hides textured cloud billows');
  const bottom=Array.from({length:p.count},(_,i)=>i).find(i=>p.getY(i)<-1000)!;
  assert.ok(a.getX(bottom)>b.getX(bottom)*1.06,'overview/lower hemisphere must also take the lit cloud');
  assert.ok(x.rig.dome.horizon[0]/x.rig.dome.horizon[2]<1.5,'glowing warm grey, not sepia');
  assert.deepEqual({...x.rig,dome:y.rig.dome},y.rig,'sky does not raise ambient or lamp fill');
  const horizon=new THREE.Color().setRGB(...x.rig.dome.horizon,THREE.SRGBColorSpace);assert.deepEqual(x.fog.color.toArray(),horizon.toArray(),'far fog and the smooth sky meet');
 }finally{c.a.dispose();legacy.a.dispose();}}
});

test('the same lit low-cloud path warms rain sky without changing rain surface lighting, day, clear or Perth',()=>{
 for(const city of ['kx','wv'] as const){const c=climate(city),legacy=climate(city,false);try{
  const rain=weatherState(forcedObservation('rain')),x=c.at(26,rain),y=legacy.at(26,rain);
  assert.ok(x.rig.dome.zenith[0]>=.11&&x.rig.dome.zenith[0]/x.rig.dome.zenith[2]>1.15,'rain low cloud is lit brown-grey');
  assert.deepEqual({...x.rig,dome:y.rig.dome},y.rig,'rain road/pool lighting stays fixed');
  assert.equal(x.fog.near,y.fog.near);assert.equal(x.fog.far,y.fog.far);assert.ok(x.fog.color.equals(y.fog.color));
  for(const [time,w]of [[day,CLEAR_STATE],[day,rain],[night,CLEAR_STATE]] as const){assert.deepEqual(c.at(26,w,time).rig,legacy.at(26,w,time).rig);assert.deepEqual(c.world.sky.geometry.getAttribute('color').array,legacy.world.sky.geometry.getAttribute('color').array);}
 }finally{c.a.dispose();legacy.a.dispose();}}
 const pt=climate('pt'),plain=climate('pt',false);try{for(const weather of [CLEAR_STATE,weatherState(forcedObservation('rain')),weatherState(forcedObservation('fog')),weatherState(forcedObservation('snow'))]){assert.deepEqual(pt.at(26,weather).rig,plain.at(26,weather).rig);assert.deepEqual(pt.world.sky.geometry.getAttribute('color').array,plain.world.sky.geometry.getAttribute('color').array);}}finally{pt.a.dispose();plain.a.dispose();}
});

test('composed city fog optics resolve a soft 3–30px halo including mast volumes, without extra geometry or clear-weather light',()=>{
 const spot={x:0,y:0,z:0,height:10,yaw:0,kind:2 as const,slope:[0,0] as [number,number]},l=createStreetLights([{...spot,mast:true},spot],{...urbanLampOptions(),softFog:true,kxOptics:true}),plain=createStreetLights([{...spot,mast:true},spot],{...urbanLampOptions(),kxOptics:true});
 try{
  const s=shader((l.group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.Material);
  const screen=block(s.vertexShader,'lamp-city-air-size'),air=block(s.fragmentShader,'lamp-air-profile'),mast=block(s.fragmentShader,'lamp-city-mast-air');
  const size=(fog:number,mast=0,haze=0)=>{const e={vars:{uLampFog:fog,vLampFogMast:mast,vLampFogHaze:haze,lampFogHalo:1,gl_PointSize:52.2}};new Glsl('').run(screen,e);return Number(e.vars.gl_PointSize);};
  assert.ok(size(1)>=96,'a 52px sprite cannot scatter at a 30px radius');assert.equal(size(0),52.2);
  const at=(px:number,d=50,fog=1,isMast=0,haze=0,core=0)=>{const diameter=isMast?(core?212:810):size(fog),e={vars:{gl_PointCoord:[.5+px/diameter,.5],uLampFog:fog,vLampFogHalo:1,vLampFogMast:isMast,vLampFogDistance:d,vLampFogHaze:haze,vLampFogCore:core,lampAirAlpha:.9,gl_FragColor:[1,1,1,0]}};new Glsl('').run(air+mast,e);return e.vars.gl_FragColor[3]!;};
  assert.ok(at(30)>.075,'visible scattered light above the local background at 30px');assert.ok(at(30,500)<at(30)*.06,'far lamps fade, not floating halos');
  for(const [haze,core]of [[1,0],[0,1]]){assert.ok(at(20,50,1,1,haze,core)>.018,'mast contributes actual near-source fog light');let prev=Infinity;for(let p=0;p<=120;p++){const a=at(p,50,1,1,haze,core);assert.ok(a<=prev+1e-9);prev=a;}assert.equal(at(20,50,0,1,haze,core),0);}
  assert.ok(at(0,50,1,1,1,0)+at(0,50,1,1,0,1)<.10,'bounded extra light at mast centre');
  assert.deepEqual(l.counts(),plain.counts());
  for(const station of ['kx','wv'] as const){const p=createPlatformLamps([0,6,0],[],0,station,true);try{assert.ok(shader((p.group.getObjectByName('street-lamp-halos') as THREE.Points).material as THREE.Material).fragmentShader.includes('lamp-air-profile'),'pendant halos use the same soft source optics');}finally{p.dispose();}}
 }finally{l.dispose();plain.dispose();}
});

test('the complete frozen KX mast halo gains at 3–30px after source extinction, retaining the 60–120px tail',()=>{
 const data=(name:string)=>JSON.parse(readFileSync(new URL(`../src/data/${name}.json`,import.meta.url),'utf8'));
 const city=addCity(new THREE.Scene(),data('kx-track'),data('kx-city'),{nightEffects:true,trees:false}),c=climate('kx');
 try{
  const {fog,rig}=c.at(26),camera=new THREE.PerspectiveCamera(50,1.6,.1,20000);camera.position.set(41.04926345892175,26,58.29601279953229);camera.lookAt(43.01159807807881,12,-11.676476386164524);camera.updateMatrixWorld();
  city.lights!.setLevel(1);city.lights!.group.updateMatrixWorld(true);
  const p=lampHaloProbe(city.lights!.group.getObjectByName('street-lamp-halos') as THREE.Points,camera,{near:fog.near,far:fog.far,amount:rig.fogAmount}),source=p.entries.find(p=>p.haze&&p.x>500&&p.x<600)!;
  assert.ok(source&&Math.abs(source.x-516.4)<1&&Math.abs(source.y-559.8)<1,'projected physical mast centroid');
  // a4ec6da5 receipt from the same composed shaders, camera, opacity and
  // source-fog attenuation. This is pre-tone energy, not screenshot RGB.
  const baseline=[[3,.45124454],[10,.43953217],[20,.40843072],[30,.36854923],[60,.27272927],[90,.21586608],[120,.15926837]];
  for(const [r,energy]of baseline){assert.ok(p.at(source.x+r!,source.y)>energy!*(r!<=30?1.15:1.05),`no actual halo gain at ${r}px`);}
  assert.ok(p.at(source.x,source.y)<.7,'bounded centre energy');
  assert.ok(p.at(source.x+30,source.y)-p.at(source.x+90,source.y)>(.36854923-.21586608)*1.15,'halo contrast rises above its own broad local background');
 }finally{city.dispose();c.a.dispose();}
});
