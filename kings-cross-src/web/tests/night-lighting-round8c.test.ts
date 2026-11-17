import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import {addLandmarks} from '../src/landmarks.ts';
import {addRoofShade} from '../src/lighting.ts';
import {Glsl} from './glsl.ts';

// CPU regression model calibrated from the generated scene, not reference
// photos. Inverting quantised ACES pixels approximates its incident/FLOOD
// inputs. The lead's fixed-camera PNG check remains the final acceptance.
const fixture=JSON.parse(readFileSync(new URL('./fixtures/midland-night-rows.json',import.meta.url),'utf8')) as {emptyBrickRows:number[];samples:[number,number,number,number[],number[]][]};
const data=JSON.parse(readFileSync(new URL('../src/data/kx-track.json',import.meta.url),'utf8'));
const input=new THREE.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.0284,.13383,.83777);
const output=new THREE.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602);
const decode=(x:number)=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4;
const encode=(x:number)=>x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
function inverse(rgb:number[]){
 const y=new THREE.Vector3(...rgb.map(n=>decode(n/255)) as [number,number,number]).applyMatrix3(output.clone().invert());
 const fit=y.toArray().map(n=>{const a=1-.983729*n,b=.0245786-.432951*n,c=-.000090537-.238081*n;return(-b+Math.sqrt(b*b-4*a*c))/(2*a);});
 return new THREE.Vector3(...fit as [number,number,number]).applyMatrix3(input.clone().invert()).multiplyScalar(.6/2.3).toArray();
}
function render(rgb:number[]){
 const v=new THREE.Vector3(...rgb as [number,number,number]).multiplyScalar(2.3/.6).applyMatrix3(input);
 const fit=v.toArray().map(n=>(n*(n+.0245786)-.000090537)/(n*(.983729*n+.432951)+.238081));
 return new THREE.Vector3(...fit as [number,number,number]).applyMatrix3(output).toArray().map(n=>Math.round(255*encode(THREE.MathUtils.clamp(n,0,1))));
}
const median=(a:number[])=>{const s=[...a].sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]!:(s[m-1]!+s[m]!)/2;};
function hue(rgb:number[]){const [r,g,b]=rgb,max=Math.max(...rgb),min=Math.min(...rgb);return max===min?0:60*((g!-b!)/(max-min));}
const block=(s:string,name:string)=>s.split('// '+name+'-begin')[1]?.split('// '+name+'-end')[0]??'';

test('frozen Midland brick rows stay red-brown with a smooth hue gradient, an unchanged tower and a brighter arcade',()=>{
 const built=addLandmarks(new THREE.Scene(),data);
 try{
  const brick=built.group.getObjectByName('landmarks-brickRed') as THREE.Mesh,material=brick.material as THREE.MeshLambertMaterial;addRoofShade(material);
  const lib=THREE.ShaderLib.lambert!,s={uniforms:{},vertexShader:lib.vertexShader,fragmentShader:lib.fragmentShader};material.onBeforeCompile(s as never,undefined as never);
  const dim=block(s.fragmentShader,'midland-night'),floor=block(s.fragmentShader,'midland-brick-floor'),body=block(s.fragmentShader,'midland-body-grade');
  const translate=(source:string)=>source.replaceAll('reflectedLight.directDiffuse','direct').replaceAll('reflectedLight.indirectDiffuse','indirect').replace(/\bFLOOD\b/g,String(material.defines!.FLOOD));
  const code=translate(dim+floor+body);
  const run=(height:number,diffuse:number[],emission:number[],albedo:number[],night=1,scope=1,bodyMask=1,statements=code)=>{
   const vars={vMidlandNight:[scope,0],vMidlandHeight:height,vMidlandBrickBody:bodyMask,uMidlandNight:night,diffuseColor:[...albedo,1],direct:[...diffuse],indirect:[0,0,0],totalEmissiveRadiance:[...emission]};new Glsl('').run(statements,{vars});return vars;
  };
  const rows=new Map<number,number[][]>();
  for(const [,y,h,mainRGB,darkRGB] of fixture.samples){
   const base=inverse(mainRGB),dark=inverse(darkRGB),u=THREE.MathUtils.smoothstep(h,6,18),baseFill=1-.7*u,dimFill=1-.82*u,emScale=1-.95*u;
   const emission=base.map((b,i)=>(b-dark[i]!*baseFill/dimFill)/(1-emScale*baseFill/dimFill));
   const incident=dark.map((b,i)=>(b-emission[i]!*emScale)/dimFill);
   const beam=.28*(.04+.96*Math.exp(-h/5)),albedo=emission.map((e,i)=>e/(beam*[1,.82,.5][i]!));
   const r=run(h,incident,emission,albedo),rgb=render(r.direct.map((v,i)=>v+r.indirect[i]!+r.totalEmissiveRadiance[i]!));
   const row=y-4;if(!rows.has(row))rows.set(row,[]);rows.get(row)!.push(rgb);
  }
  let previous:number|undefined;let maximum=0;
  for(let y=340;y<492;y+=8){
   const samples=rows.get(y);
   if(!samples){assert.ok(fixture.emptyBrickRows.includes(y),`missing brick receipt at y${y}`);continue;} // stone string courses, not brick
   const rgb=[0,1,2].map(i=>median(samples.map(c=>c[i]!))),h=hue(rgb);maximum=Math.max(maximum,rgb[0]!);
   assert.ok(h>=8&&h<=25,`brick row y${y}: RGB ${rgb}, hue ${h.toFixed(2)} must stay 8–25deg`);
   if(previous!==undefined)assert.ok(Math.abs(h-previous)<=5,`adjacent brick rows jump ${Math.abs(h-previous).toFixed(2)}deg at y${y}`);previous=h;
  }
  assert.ok(147>3*maximum,`the captured arcade's red level 147 must exceed 3x the upper brick ${maximum}`);
  assert.ok(body,'the body grade uses the baseline height response instead of the yellow clamp');
  const priorCode=translate(dim+floor);
  for(const [night,bodyMask,height] of [[0,1,19],[1,0,25.61],[1,0,10],[1,1,3]]){
   const v=run(height!,[.04,.01,.003],[.006,.002,.001],[.4,.12,.05],night,1,bodyMask);
   // Compare the complete composed shader with the accepted 8b response:
   // day, both tower heights and the arcade remain exact no-ops.
   const control=run(height!,[.04,.01,.003],[.006,.002,.001],[.4,.12,.05],night,1,bodyMask,priorCode);
   assert.deepEqual(v.direct,control.direct);assert.deepEqual(v.indirect,control.indirect);assert.deepEqual(v.totalEmissiveRadiance,control.totalEmissiveRadiance);
  }
  const mask=brick.geometry.getAttribute('midlandBrickBody');assert.ok(mask,'body/tower selection belongs to the geometry builder');
  const camera=new THREE.PerspectiveCamera(70,1.6,.1,20000);camera.position.set(-67.56067450589593,2.830348310685503,142.60696559216098);camera.lookAt(-89.85,16,97.85);camera.updateMatrixWorld();built.group.updateMatrixWorld(true);
  for(const [x,y,expected] of [[680,365,1],[1150,300,0],[1150,460,0]]){const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2(x!/640-1,1-y!/400),camera);const hit=ray.intersectObject(built.group,true)[0]!;assert.equal(hit.object.name,'landmarks-brickRed');assert.equal(mask.getX(hit.face!.a),expected,'the tower remains outside the body correction');}
 }finally{built.dispose();}
});
