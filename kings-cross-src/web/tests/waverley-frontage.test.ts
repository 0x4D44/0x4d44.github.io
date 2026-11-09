import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyFrontage,WAVERLEY_FRONTAGE_HEIGHTS,WAVERLEY_FRONTAGE_SOURCES,WAVERLEY_FRONTAGE_OMIT_IDS} from '../src/waverley-frontage.ts';
import {BALMORAL_LEVELS,towerFrame} from '../src/waverley-frontage-balmoral.ts';
import {NORTH_BRIDGE,bridgeFrame} from '../src/waverley-frontage-bridges.ts';
import {buildWaverleyScene,waverleyRailwayFootprint,waverleyRailwayIntrusions,waverleyTrackSegments} from '../src/waverley-scene.ts';
import {WAVERLEY_LEVELS} from '../src/waverley-mesh.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import data from '../src/data/waverley-frontage.json' with {type:'json'};
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};
type Pt=[number,number];
const ground={heightAt:(x:number,z:number)=>8+x*.002+z*.003,rangeUnder:()=>({min:8,max:8,mean:8})};
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
const inRing=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const segDist=(x:number,z:number,a:Pt,b:Pt)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
const edgeDist=(x:number,z:number,r:readonly Pt[])=>Math.min(...r.map((p,i)=>segDist(x,z,p,r[(i+1)%r.length])));
const positions=(m:THREE.Mesh)=>{const p=m.geometry.getAttribute('position'),out:THREE.Vector3[]=[];for(let i=0;i<p.count;i++)out.push(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));return out;};
const scene=unpackWaverleyScene(sceneFile as never);
let real:ReturnType<typeof buildWaverleyScene>|undefined;
const realScene=()=>real??=buildWaverleyScene({lighting:false});
const frontageOf=()=>realScene().parts.buildings.getObjectByName('waverley-frontage')!.userData.frontage;
test.after(()=>real?.dispose());

test('published tower, dial and bridge figures retain primary citations',()=>{
 assert.deepEqual(WAVERLEY_FRONTAGE_HEIGHTS,{balmoral:58,clockDiameter:3.2});
 const s=JSON.stringify(WAVERLEY_FRONTAGE_SOURCES);
 for(const re of [/historicenvironment.scot\/designation\/LB30315/,/smithofderby.com/,/LB30035/,/LB30270/,/6 arched iron girders/,/seven plate girder spans/])assert.match(s,re);
 assert.deepEqual(WAVERLEY_FRONTAGE_OMIT_IDS,['way/313744197','relation/15839904','relation/1113940'],'the tower, the hotel body and Princes Mall are drawn here, not by the city');
});
test('frontage keeps mapped bridge layers, finite bounded geometry and owned disposal',()=>{
 assert.deepEqual(data.bridges.map(b=>[b.id,b.layer]),[['way/380552925',2],['way/377738788',1]]);
 const built=buildWaverleyFrontage(ground);assert.equal(built.stats.drawCalls,6);assert.ok(built.stats.triangles<240000);
 assert.deepEqual(built.omitBuildingIds,WAVERLEY_FRONTAGE_OMIT_IDS);
 let count=0,disposed=0;
 built.group.traverse((obj:THREE.Object3D)=>{if(obj instanceof THREE.Mesh){count++;const p=obj.geometry.getAttribute('position');for(let i=0;i<p.count;i++)for(const v of [p.getX(i),p.getY(i),p.getZ(i)])assert.ok(Number.isFinite(v));obj.geometry.addEventListener('dispose',()=>disposed++);}});
 assert.equal(count,built.stats.drawCalls);built.dispose();built.dispose();assert.equal(disposed,count);assert.equal(built.group.children.length,0);
});
test('the Balmoral spire reaches its published total height above its source seat',()=>{
 const built=buildWaverleyFrontage(ground);
 try {
  const spire=built.group.getObjectByName('waverley-balmoral-spire-and-hands') as THREE.Mesh;
  const north=[...data.balmoral.ring].sort((a,b)=>a[1]-b[1])[0];
  const sourcedBase=ground.heightAt(north[0],north[1]);spire.geometry.computeBoundingBox();
  assert.ok(Math.abs(spire.geometry.boundingBox!.max.y-sourcedBase-58)<1e-4,'actual geometry reaches the published 58m above its source seat');
  // nothing of the hotel stands higher than its published tower
  for(const m of built.group.children as THREE.Mesh[])if(m.name.startsWith('waverley-balmoral')){m.geometry.computeBoundingBox();assert.ok(m.geometry.boundingBox!.max.y<=sourcedBase+58+1e-4,m.name);}
 } finally {built.dispose();}
});
test('four 3.2 m dials, one on each face of the mapped tower, centred and proud of the face',()=>{
 const built=buildWaverleyFrontage(ground);
 try {
  const {centre,along,back,half}=towerFrame(ringOf(data.balmoral.ring)),dials=built.group.userData.clockDials as {centre:number[];normal:number[];radius:number}[];
  assert.equal(dials.length,4);
  assert.ok(Math.abs(2*half[0]-11.2)<.2&&Math.abs(2*half[1]-12.8)<.2,`tower ${2*half[0]} x ${2*half[1]} m, the OSM outline`);
  const faces=new Set<string>();
  for(const d of dials){
   assert.equal(d.radius*2,3.2);
   const v=[d.centre[0]-centre[0],d.centre[2]-centre[1]],a=v[0]*along[0]+v[1]*along[2],b=v[0]*back[0]+v[1]*back[2];
   const onAlong=Math.abs(Math.abs(a)-half[0]-.06)<1e-6&&Math.abs(b)<1e-6,onBack=Math.abs(Math.abs(b)-half[1]-.06)<1e-6&&Math.abs(a)<1e-6;
   assert.ok(onAlong||onBack,'a dial sits 6 cm proud of the centre of a face');faces.add(`${Math.sign(Math.round(a))},${Math.sign(Math.round(b))}`);
  }
  assert.equal(faces.size,4);
 } finally {built.dispose();}
});
test('the hotel stands on its unchanged OSM outline, walls to the main cornice, and the tower shaft never shares the body wall plane',()=>{
 const built=buildWaverleyFrontage(ground);
 try {
  const P=built.group.userData.frontage.P,body=ringOf(data.balmoralBody.ring);
  const facade=positions(built.group.getObjectByName('waverley-balmoral-facade') as THREE.Mesh);
  for(const v of facade){assert.ok(body.some(p=>Math.abs(p[0]-v.x)<1e-3&&Math.abs(p[1]-v.z)<1e-3),'every facade corner is an OSM outline vertex');assert.ok(v.y<=P+BALMORAL_LEVELS.cornice+1e-3);}
  assert.ok(facade.some(v=>Math.abs(v.y-P-BALMORAL_LEVELS.cornice)<1e-3));
  for(const v of positions(built.group.getObjectByName('waverley-balmoral-tower') as THREE.Mesh))assert.ok(v.y>=P+BALMORAL_LEVELS.cornice-1e-3,'the textured tower starts at the cornice, above the coplanar body wall');
  // HES: 5 storeys, mezzanine and attic. The cornice holds six levels; the attic is above it
  assert.equal(data.balmoralBody.levels,6);assert.ok(BALMORAL_LEVELS.mansard>BALMORAL_LEVELS.cornice);
 } finally {built.dispose();}
});
test('North Bridge: three 53 m spans of six arched ribs on two masonry piers (HES LB30035)',()=>{
 const nb=frontageOf().northBridge,N=NORTH_BRIDGE;
 assert.equal(N.spans.length,3);for(const [a,b]of N.spans)assert.ok(Math.abs(b-a-53)<=2,`span ${b-a}`);
 assert.equal(N.piers.length,2);assert.equal(nb.ribs.length,3*6);
 // the ribs spring at the springing line, rise to a crown, and keep under the deck structure
 const f=nb.frame;
 for(const rib of nb.ribs as {s:number;t:number;y:number}[][]){
  assert.ok(Math.abs(rib[0].y-N.springing)<1e-6);const crown=Math.max(...rib.map(p=>p.y));assert.ok(crown>N.springing+4,`rise ${crown-N.springing}`);
 }
 assert.ok(f.length>165&&f.length<172,`mapped length ${f.length}`);
});
test('North Bridge piers and abutment stand clear of every drawn track and platform, and of every drawn city block',()=>{
 const nb=frontageOf().northBridge,tracks=waverleyTrackSegments(scene),half=WAVERLEY_LEVELS.ballastHalfWidth;
 const drawn=new Set(realScene().buildingIds),blocks=scene.buildings.filter(b=>drawn.has(b.id));
 for(const [k,pier]of (nb.piers as {ring:Pt[];bottom:number;top:number}[]).entries()){
  const xs=pier.ring.map(p=>p[0]),zs=pier.ring.map(p=>p[1]);let probes=0;
  for(let x=Math.min(...xs);x<=Math.max(...xs);x+=.25)for(let z=Math.min(...zs);z<=Math.max(...zs);z+=.25){
   if(!inRing(x,z,pier.ring))continue;probes++;
   for(const s of tracks)assert.ok(segDist(x,z,[s[0],s[1]],[s[2],s[3]])>=half,`pier ${k} on a track's ballast at ${x.toFixed(2)},${z.toFixed(2)}`);
   for(const p of scene.platforms)assert.ok(!inRing(x,z,p.path as Pt[]),`pier ${k} on platform ${p.ref} at ${x.toFixed(2)},${z.toFixed(2)}`);
   for(const b of blocks)if(inRing(x,z,b.outer as Pt[]))assert.equal(b.id,data.northBridgePierSeat.id,`pier ${k} inside ${b.id}`);
  }
  assert.ok(probes>100);
 }
 // pier 1 bears on the roof of the station block that fills its band, never through it
 const seat=scene.buildings.find(b=>b.id===data.northBridgePierSeat.id)!;
 assert.ok(Math.abs(nb.piers[0].bottom-(realScene().terrain.rangeUnder(seat.outer,4).min+seat.height))<1e-6,'pier 1 stands on the seat block top');
});
test('the bridges keep over the train envelope: no rib, fascia or column top below 3.9 m over a track',()=>{
 const built=realScene(),tracks=waverleyTrackSegments(built===undefined?scene:scene),struct=built.parts.buildings.getObjectByName('waverley-frontage-structure') as THREE.Mesh;
 const nbRing=ringOf(data.bridges[0].ring),wbRing=ringOf(data.bridges[1].ring);
 let checked=0;
 for(const v of positions(struct)){
  if(!(inRing(v.x,v.z,nbRing)||inRing(v.x,v.z,wbRing)))continue;
  if(!tracks.some(s=>segDist(v.x,v.z,[s[0],s[1]],[s[2],s[3]])<1.6))continue;
  checked++;assert.ok(v.y>=3.9,`structure at ${v.x.toFixed(1)},${v.y.toFixed(2)},${v.z.toFixed(1)} inside the 3.9 m train envelope (core/train-emr.ts)`);
 }
 assert.ok(checked>1000,`${checked} vertices over tracks checked`);
 // and between the vertices: each drawn rib soffit segment is straight, so sample it along its length
 const nb=frontageOf().northBridge;let samples=0;
 for(const rib of nb.ribs as {s:number;t:number;y:number}[][])for(let i=0;i+1<rib.length;i++)for(let k=0;k<=10;k++){
  const a=rib[i],b=rib[i+1],s=a.s+(b.s-a.s)*k/10,y=a.y+(b.y-a.y)*k/10,[x,z]=nb.frame.at(s,a.t);
  if(!tracks.some(t=>segDist(x,z,[t[0],t[1]],[t[2],t[3]])<1.7))continue;
  samples++;assert.ok(y>=3.9,`rib soffit ${y.toFixed(2)} m over a track at ${x.toFixed(1)},${z.toFixed(1)}`);
 }
 assert.ok(samples>100,`${samples} soffit samples over tracks`);
});
test('Waverley Bridge: six support lines (seven spans, HES LB30270), each column on an island platform clear of every track',()=>{
 const wb=frontageOf().waverleyBridge,tracks=waverleyTrackSegments(scene);
 assert.equal(data.waverleyBridgeColumns.length,6,'six support lines make seven spans');
 const f=bridgeFrame(ringOf(data.bridges[1].ring));
 const ss=data.waverleyBridgeColumns.map(l=>l.s);for(let i=1;i<ss.length;i++)assert.ok(ss[i]>ss[i-1]+8);assert.ok(f.length>95);
 for(const c of wb.columns as {x:number;z:number;bottom:number;top:number}[]){
  const on=scene.platforms.find(p=>inRing(c.x,c.z,p.path as Pt[]));
  assert.ok(on,`column at ${c.x},${c.z} stands on a platform`);assert.ok(edgeDist(c.x,c.z,on.path as Pt[])>=1.2,'1.2 m in from the platform edge');
  for(const s of tracks)assert.ok(segDist(c.x,c.z,[s[0],s[1]],[s[2],s[3]])>3.2,'3.2 m from any track centre');
  assert.equal(c.bottom,WAVERLEY_LEVELS.platform);assert.ok(c.top>3.9);
 }
 assert.ok(wb.columns.length>=20);
});
test('Princes Mall: terrace at street level on its unchanged outline, rooflights on the terrace and off its inner rings',()=>{
 const mall=frontageOf().mall,ring=ringOf(data.princesMall.ring),holes=data.princesMall.holes.map(ringOf);
 assert.ok(mall.lights.length>10);
 for(const l of mall.lights as {x:number;z:number}[]){assert.ok(inRing(l.x,l.z,ring));assert.ok(!holes.some(h=>inRing(l.x,l.z,h)));}
 assert.ok(!waverleyRailwayIntrusions(scene).includes('relation/1113940'));
 assert.ok(mall.roof>WAVERLEY_LEVELS.platform+5,'the terrace is street level, well above the station floor');
 void waverleyRailwayFootprint;
});
test('bridge decks use unwarped public context terrain instead of the flattened railway ground',()=>{
 const flat={heightAt:()=>-.2,rangeUnder:()=>({min:-.2,max:-.2,mean:-.2})};
 const context={heightAt:(x:number,z:number)=>8+x*.002+z*.003};
 const built=buildWaverleyFrontage(flat,context);
 try {
  const mesh=built.group.getObjectByName('waverley-bridge-decks') as THREE.Mesh;
  mesh.geometry.computeBoundingBox();assert.ok(mesh.geometry.boundingBox!.min.y>6,'1m slab remains above the railway flattening');
  const p=mesh.geometry.getAttribute('position');
  for(const bridge of data.bridges){
   const byZ=[...bridge.ring].sort((a,b)=>a[1]-b[1]);
   for(const endpoint of [byZ[0],byZ.at(-1)!]){
    const expected=context.heightAt(endpoint[0],endpoint[1]);let found=false;
    for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)-endpoint[0])<1e-4&&Math.abs(p.getZ(i)-endpoint[1])<1e-4&&Math.abs(p.getY(i)-expected)<1e-4)found=true;
    assert.ok(found,`${bridge.id} endpoint deck follows the unwarped source height`);
   }
  }
  assert.equal(built.stats.drawCalls,6);
 } finally {built.dispose();}
});
