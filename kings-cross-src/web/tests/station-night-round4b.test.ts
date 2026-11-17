import assert from 'node:assert/strict';
import test, {after} from 'node:test';
import * as THREE from 'three';
import {LAMP_KIND} from '../../core/streetlights.ts';
import {createStreetLights,LAMP_LIGHT} from '../src/streetlights.ts';
import {urbanLampOptions} from '../src/station-lamps.ts';
import {buildWaverleyScene} from '../src/waverley-scene.ts';
import {loadWaverleyLamps} from '../src/waverley-lamps.ts';
import {createWaverleyGlow} from '../src/waverley-night.ts';
import {Glsl} from './glsl.ts';

const named=<T extends THREE.Object3D>(o:THREE.Object3D,n:string):T=>{const found=o.getObjectByName(n);assert.ok(found,n);return found as T;};
function shader(m:THREE.Material,kind='basic'){const lib=THREE.ShaderLib[kind]!,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};m.onBeforeCompile(s as never,undefined as never);return s;}
function block(s:string,n:string){const b=s.split(`// ${n}-begin`)[1]?.split(`// ${n}-end`)[0];assert.ok(b,n);return b;}
const spot={x:0,y:0,z:0,height:10,yaw:0,kind:LAMP_KIND.sodium,slope:[0,0] as [number,number]};
const display=(v:number)=>THREE.ColorManagement.workingToColorSpace(new THREE.Color(v,v,v),THREE.SRGBColorSpace).r;

test('Euston Road urban sodium keeps its golden high-pressure palette',()=>{
 const opt=urbanLampOptions();assert.notEqual(opt.lowPressureSodium,true,'generic urban optics must not select low-pressure sodium');
 const l=createStreetLights([spot],opt);try{const p=named<THREE.InstancedMesh>(l.group,'street-lamp-pools'),c=new THREE.Color();p.getColorAt(0,c);
 const expected=new THREE.Color(LAMP_LIGHT[LAMP_KIND.sodium].pool).multiplyScalar(opt.poolCeiling!);assert.ok(Math.hypot(c.r-expected.r,c.g-expected.g,c.b-expected.b)<1e-6,'Euston uses the original reference-fitted golden pool');
 const ratio=display(c.r)/display(c.b);assert.ok(ratio>=2&&ratio<=2.5);
 }finally{l.dispose();}
});

const b=buildWaverleyScene({lighting:false}),g=createWaverleyGlow(b.group);after(()=>{g.dispose();b.dispose();});
test('only Waverley approach fittings select moderately orange low-pressure sodium',async()=>{
 const l=await loadWaverleyLamps(b.terrain.heightAt.bind(b.terrain),true,b.group);try{const rows=named<THREE.Group>(l.group,'waverley-approach-lamps'),cores=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('color');
 for(let i=0;i<cores.count;i++){const ratio=display(cores.getX(i))/display(cores.getZ(i));assert.ok(ratio>=3&&ratio<=5,'approach head is orange-brown, not saturated orange');}
 const main=l.group.children.find(o=>o.name==='street-lamp-cores') as THREE.Points,positions=main.geometry.getAttribute('position'),colours=main.geometry.getAttribute('color'),rowPositions=named<THREE.Points>(rows,'street-lamp-cores').geometry.getAttribute('position');
 let checked=0;for(let i=0;i<positions.count;i++){const isApproach=Array.from({length:rowPositions.count},(_,j)=>j).some(j=>Math.hypot(positions.getX(i)-rowPositions.getX(j),positions.getY(i)-rowPositions.getY(j),positions.getZ(i)-rowPositions.getZ(j))<.01);if(isApproach)continue;
 const original=new THREE.Color(LAMP_LIGHT[LAMP_KIND.sodium].halo),saturated=new THREE.Color(0xff8704);if(Math.abs(colours.getX(i)-original.r)>.001)continue;
 assert.ok(Math.abs(colours.getZ(i)-saturated.b)>.001,'other city sodium is not given the approach palette');checked++;}assert.ok(checked>0);
 }finally{l.dispose();}
});

// The canvas alpha gradient in haloTexture; test the composed profile, not
// only a factor that may increase towards the sprite edge.
function texture(r:number){const stops=[[0,1],[.18,.7],[.5,.18],[1,0]];for(let i=1;i<stops.length;i++){const [x,y]=stops[i]!,[a,z]=stops[i-1]!;if(r<=x!)return z!+(y!-z!)*(r-a!)/(x!-a!);}return 0;}
function mastShader(){const l=createStreetLights([{...spot,mast:true,kind:LAMP_KIND.cool}],urbanLampOptions());const s=shader(named<THREE.Points>(l.group,'street-lamp-halos').material as THREE.Material,'points');return {l,s,code:s.fragmentShader.includes('// lamp-fog-mast-profile-begin')?block(s.fragmentShader,'lamp-fog-mast-profile'):block(s.fragmentShader,'lamp-fog-mast')};}
test('the full mast fog halo peaks at its head and falls monotonically to its edge',()=>{
 const {l,code}=mastShader();try{let previous=Infinity,peak=0;
 for(let i=0;i<=200;i++){const r=i/200,e={vars:{vLampFogMast:1,vLampFogHalo:1,uLampFog:1,gl_PointCoord:[.5+r/2,.5],gl_FragColor:[1,1,1,texture(r)]}};new Glsl('').run(code,e);const a=(e.vars.gl_FragColor as number[])[3]!;
 assert.ok(a<=previous+1e-8,`halo brightens away from the head at radius ${r}`);previous=a;if(i===0)peak=a;}
 assert.ok(peak>=.15&&peak<=.30,'lower the peak while retaining a filled centre');
 }finally{l.dispose();}
});
test('mast fog fill is warmer while clear heads and non-mast city fog retain their colour',()=>{
 const {l,code}=mastShader();try{const run=(mast:number,fog:number)=>{const e={vars:{vLampFogMast:mast,vLampFogHalo:1,uLampFog:fog,gl_PointCoord:[.5,.5],gl_FragColor:[.85,.78,.60,1]}};new Glsl('').run(code,e);return e.vars.gl_FragColor as number[];};
 const c=run(1,1);assert.ok(c[0]!/c[2]!>1.7,'warm the KX scattered light without changing Princes Street');assert.deepEqual(run(0,1).slice(0,3),[.85,.78,.60]);assert.deepEqual(run(1,0),[.85,.78,.60,1]);
 }finally{l.dispose();}
});

const sh=shader(named<THREE.Mesh>(b.group,'waverley-frontage-structure').material as THREE.Material,'lambert'),trim=block(sh.fragmentShader,'balmoral-trim'),front=b.group.getObjectByName('waverley-frontage')!.userData.frontage;
const feature=front.hotel.features.find((f:{kind:string;x:number;z:number})=>f.kind==='gable'&&Math.hypot(f.x-74,f.z+136)>12)!;
function emission(h:number,level=1){const e={vars:{vStationLampWorld:[feature.x,front.P+h,feature.z],vStationLampNormal:[0,1,0],diffuseColor:[.5,.5,.5,1],uStationLampLevel:level,totalEmissiveRadiance:[0,0,0]}};new Glsl('').run(trim,e);return(e.vars.totalEmissiveRadiance as number[])[0]!;}
test('Balmoral dormers and gables receive a continuous uplight from the cornice',()=>{
 let previous=emission(26);assert.ok(previous>.2);for(let h=26.1;h<=36;h+=.1){const next=emission(h);assert.ok(next<=previous+1e-8,`a dark band gives way to a second top light at ${h}`);assert.ok(next>.08);previous=next;}assert.equal(emission(29,0),0);
});
test('Balmoral chimney middles stay lit below their smoothly fading tops',()=>{
 const low=emission(31.5),middle=emission(34),top=emission(38.6);assert.ok(low>middle&&middle>top,'a below-roof flood fades upward instead of lighting only the chimney tops');assert.ok(top>low*.3,'the stack has a gradual wash, not a dark waist');
});
