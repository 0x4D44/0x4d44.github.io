// Waverley is an independent local scene. Lazy-load this MODULE, then call buildWaverleyScene();
// it owns no renderer, animation loop, feed, camera or DOM. No London/NR data is imported.
// Horizontal geometry is OSM (ODbL); the 16 m context grid is Scottish Phase V DTM (OGLv3).
//
// VERTICAL LIMIT: the DTM is not a rail survey: verified source pixels retain/interpolate raised
// ground at bridges and the station. Like the KX preview, rail heads use a schematic common y=0.
// Flatten ground under the mapped station/platforms and within 8 m of open rail, blending over
// 40 m to the physical context. Those widths, 0.915 m platform height, rail/sleeper dimensions,
// and fallback building heights are ASSUMED, not measured Waverley dimensions. The station's
// ridge-and-furrow type is sourced; its numeric profile is ASSUMED (waverley-roof.ts).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {createTerrain, terrainFromFunction, buildTerrainMesh, overMesh} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import {Batch, material, terrainMaterial} from './materials.ts';
import type {V3,Rgb,MaterialName} from './materials.ts';
import {ridgeRoofBatches} from './waverley-roof.ts';
import {buildWaverleyLandmarks,WAVERLEY_LANDMARK_OMIT_IDS} from './waverley-landmarks.ts';
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk.
// Awaiting the module resolves both before the synchronous builder becomes available.
const [{default:dataFile},{default:terrainFile}]=await Promise.all([
 import('./data/waverley-scene.json',{with:{type:'json'}}),
 import('./data/waverley-terrain.json',{with:{type:'json'}}),
]);

/** ASSUMED preview datum and detail dimensions; not Waverley surveyed rail/structure levels. */
export const WAVERLEY_LEVELS={ground:-.2,rail:0,platform:.915,railHalfGauge:.7175,railHeadWidth:.072,railFlatten:8,blend:40} as const;
export type TrackSegment=[ax:number,az:number,bx:number,bz:number];
export interface WaverleyOptions {
 data?:WaverleyData;
 /** Optional source terrain (in Waverley's local metric frame), for testing/custom source adapters. */
 terrain?:Terrain;
 /** Default true. Omit lights if the caller supplies them. */
 lighting?:boolean;
 /** Default true; hide mapped roof for track/platform inspection without removing its floor mask. */
 roofVisible?:boolean;
 cityVisible?:boolean;
}
export interface WaverleyScene {
 group:THREE.Group;
 parts:{terrain:THREE.Group;track:THREE.Group;platforms:THREE.Group;roof:THREE.Group;buildings:THREE.Group};
 origin:WaverleyData['origin'];
 attribution:string;
 /** Ground of the drawn mesh, including the documented railway flattening, not a rail survey. */
 terrain:Terrain;
 stats:{triangles:number;drawCalls:number;platforms:number;buildings:number;roofs:number;sleepers:number};
 dispose():void;
}
const cleanRing=(p:readonly Pt[]):Pt[]=>{
 const r=p.map(v=>[v[0],v[1]] as Pt);
 if(r.length>1&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1])r.pop();
 return r;
};
function fillSurface(batch:Batch,outer:readonly Pt[],holes:readonly (readonly Pt[])[],at:(x:number,z:number)=>number):void {
 const rings=[cleanRing(outer),...holes.map(cleanRing)];
 if(rings[0].length<3)return;
 const points=rings.flat(),vs=rings.map(r=>r.map(p=>new THREE.Vector2(...p)));
 for(const face of THREE.ShapeUtils.triangulateShape(vs[0],vs.slice(1))){
  const pts=face.map(i=>points[i]);
  batch.tri(...pts.map(p=>[p[0],at(...p),p[1]] as V3) as [V3,V3,V3],pts as [Pt,Pt,Pt],[0,1,0]);
 }
}
/** Concave OSM polygon with all inner rings left open. UVs are local metres. */
export function polygonSurface(outer:readonly Pt[],holes:readonly (readonly Pt[])[],at:(x:number,z:number)=>number):THREE.BufferGeometry {
 const batch=new Batch();fillSurface(batch,outer,holes,at);return batch.build();
}
/** No tram/tunnel is drawn as a surface train track, nor a duplicate junction edge. */
export function waverleyTrackSegments(data:WaverleyData):TrackSegment[] {
 const out:TrackSegment[]=[],seen=new Set<string>();
 for(const r of data.rails){
  if(r.tags.railway!=='rail'||r.tags.tram==='yes'||r.tags.tunnel&&r.tags.tunnel!=='no'||Number(r.tags.layer??0)<0)continue;
  for(let i=1;i<r.path.length;i++){
   const a=r.path[i-1],b=r.path[i];if(a[0]===b[0]&&a[1]===b[1])continue;
   const keys=[a.join(','),b.join(',')].sort(),key=keys.join('|');if(seen.has(key))continue;seen.add(key);out.push([...a,...b]);
  }
 }
 return out;
}
function segmentDistance(x:number,z:number,s:TrackSegment):number {
 const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-s[0]-t*dx,z-s[1]-t*dz);
}
function inside(x:number,z:number,p:readonly Pt[]):boolean {
 let yes=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;
 return yes;
}
/** Keep source terrain intact; derive the preview's station-floor plateau separately. */
export function waverleyGround(data:WaverleyData,raw:Terrain):Terrain {
 const rails=waverleyTrackSegments(data),polys=[...data.platforms.map(p=>p.path),...data.roofs.filter(r=>r.id==='relation/240040').map(r=>r.outer)];
 const edges:TrackSegment[]=polys.flatMap(r=>r.map((p,i)=>[...p,...r[(i+1)%r.length]] as TrackSegment));
 const height=(x:number,z:number):number=>{
  if(polys.some(r=>inside(x,z,r)))return WAVERLEY_LEVELS.ground;
  let distance=Infinity;
  for(const e of rails)distance=Math.min(distance,Math.max(0,segmentDistance(x,z,e)-WAVERLEY_LEVELS.railFlatten));
  for(const e of edges)distance=Math.min(distance,segmentDistance(x,z,e));
  const t=Math.min(1,distance/WAVERLEY_LEVELS.blend),blend=t*t*(3-2*t);
  return WAVERLEY_LEVELS.ground+(raw.heightAt(x,z)-WAVERLEY_LEVELS.ground)*blend;
 };
 // 8 m refines only the flattening transition; it adds no resolution claim to the 16 m DTM.
 return terrainFromFunction(height,raw.extent,8,{q:.001,groundY:WAVERLEY_LEVELS.ground,datumAod:raw.datumAod});
}
function walls(b:Batch,outer:readonly Pt[],holes:readonly (readonly Pt[])[],bottom:(x:number,z:number)=>number,top:(x:number,z:number)=>number,color?:Rgb):void {
 for(const [rIndex,input] of [outer,...holes].entries()){
 const ring=cleanRing(input);let signed=0;for(let i=0;i<ring.length;i++){const p=ring[i],q=ring[(i+1)%ring.length];signed+=p[0]*q[1]-q[0]*p[1];}
 // In x/east,z/south, a negative outer ring faces outward with bottom-bottom-top-top
 // quads. Positive rings were inward-facing, culling whole exterior faces on slopes.
 if((signed>0)===(rIndex===0))ring.reverse();
 for(let i=0;i<ring.length;i++){
  const a=ring[i],p=ring[(i+1)%ring.length],length=Math.hypot(p[0]-a[0],p[1]-a[1]);
  const y0=bottom(...a),y1=bottom(...p),h0=top(...a),h1=top(...p);
  b.poly([[a[0],y0,a[1]],[p[0],y1,p[1]],[p[0],h1,p[1]],[a[0],h0,a[1]]],[[0,0],[length,0],[length,h1-y1],[0,h0-y0]],{color});
 }
 }
}
function strip(batch:Batch,a:Pt,b:Pt,halfWidth:number,y:number):void {
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)return;
 const nx=-dz/length*halfWidth,nz=dx/length*halfWidth;
 batch.quadUV([a[0]+nx,y,a[1]+nz],[a[0]-nx,y,a[1]-nz],[b[0]-nx,y,b[1]-nz],[b[0]+nx,y,b[1]+nz],[[a[0],a[1]],[a[0],a[1]],[b[0],b[1]],[b[0],b[1]]],[0,1,0]);
}

/** Lazy import contract: const {buildWaverleyScene}=await import('./waverley-scene.ts'); const w=buildWaverleyScene(); scene.add(w.group); */
export function buildWaverleyScene(options:WaverleyOptions={}):WaverleyScene {
 const data=options.data??unpackWaverleyScene(dataFile);
 const contextTerrain=options.terrain??createTerrain(terrainFile as unknown as TerrainFile);
 const field=waverleyGround(data,contextTerrain);
 const group=new THREE.Group();group.name='edinburgh-waverley';
 const parts={terrain:new THREE.Group(),track:new THREE.Group(),platforms:new THREE.Group(),roof:new THREE.Group(),buildings:new THREE.Group()};
 for(const [key,value]of Object.entries(parts)){value.name=`waverley-${key}`;group.add(value);}
 parts.roof.visible=options.roofVisible!==false;parts.buildings.visible=options.cityVisible!==false;
 const geometries=new Set<THREE.BufferGeometry>(),ownedMaterials=new Set<THREE.Material>();
 // Own variants of the KX palette; never mutate the cached shared materials. Shades
 // and small per-block variations are ASSUMED, not facade-survey classifications.
 const local=(key:MaterialName,tint:number,vertexColors=false):THREE.MeshLambertMaterial=>{
  const m=material(key).clone() as THREE.MeshLambertMaterial;m.color.multiply(new THREE.Color(tint));m.vertexColors=vertexColors;ownedMaterials.add(m);return m;
 };
 const sandstone=local('stone',0xe4d4b3,true),slate=local('slate',0xada99f);
 const glazing=local('shedGlass',0xf2f4ef);glazing.opacity=.78;glazing.forceSinglePass=true;
 const stats={triangles:0,drawCalls:0,platforms:data.platforms.length,buildings:data.buildings.length,roofs:data.roofs.length,sleepers:0};
 const add=(parent:THREE.Group,b:Batch,mat:THREE.Material,name:string):void=>{
  if(!b.triangles)return;const g=b.build();geometries.add(g);const mesh=new THREE.Mesh(g,mat);mesh.name=name;parent.add(mesh);stats.triangles+=b.triangles;stats.drawCalls++;
 };
 // This source extent is in whole 16 m blocks, not necessarily whole KX 64 m blocks.
 const tm=buildTerrainMesh(field,{maxLeaf:16,tolerance:()=>.08});
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(tm.positions,3));tg.setIndex(new THREE.BufferAttribute(tm.indices,1));tg.computeVertexNormals();
 const groundMaterial=terrainMaterial('ground').clone() as THREE.MeshLambertMaterial;
 // Neutral warm ground separates sandstone/slate/glazing without inventing land-use
 // polygons; real roads/parks are not classified by this context-only DTM.
 groundMaterial.color.setHex(0x757568);ownedMaterials.add(groundMaterial);
 const terrainMesh=new THREE.Mesh(tg,groundMaterial);terrainMesh.name='waverley-ground';parts.terrain.add(terrainMesh);geometries.add(tg);stats.triangles+=tm.triangles;stats.drawCalls++;
 const ground=overMesh(field,tm);
 const ballast=new Batch(),rails=new Batch(),lines:number[]=[],sleepers:V3[]=[];
 for(const [ax,az,bx,bz]of waverleyTrackSegments(data)){
  const a:Pt=[ax,az],b:Pt=[bx,bz],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
  strip(ballast,a,b,1.65,-.14);
  for(const side of [-1,1]){
   const offset=side*(WAVERLEY_LEVELS.railHalfGauge+WAVERLEY_LEVELS.railHeadWidth/2),r0:Pt=[ax+nx*offset,az+nz*offset],r1:Pt=[bx+nx*offset,bz+nz*offset];
   strip(rails,r0,r1,WAVERLEY_LEVELS.railHeadWidth/2,0);lines.push(r0[0],.004,r0[1],r1[0],.004,r1[1]);
  }
  for(let s=.325;s<length;s+=.65)sleepers.push([ax+dx*s/length,Math.atan2(dx,dz),az+dz*s/length]);
 }
 add(parts.track,ballast,material('ballast'),'waverley-ballast');add(parts.track,rails,material('steel'),'waverley-rail-heads');
 if(lines.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));geometries.add(g);const lineMaterial=new THREE.LineBasicMaterial({color:0xc3c8cc});ownedMaterials.add(lineMaterial);const m=new THREE.LineSegments(g,lineMaterial);m.name='waverley-distant-rails';parts.track.add(m);stats.drawCalls++;}
 if(sleepers.length){
  const g=new THREE.BoxGeometry(2.6,.05,.25),m=new THREE.InstancedMesh(g,material('concrete'),sleepers.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  sleepers.forEach(([x,yaw,z],i)=>{q.setFromAxisAngle(up,yaw);matrix.compose(new THREE.Vector3(x,-.125,z),q,new THREE.Vector3(1,1,1));m.setMatrixAt(i,matrix);});m.instanceMatrix.needsUpdate=true;m.name='waverley-sleepers';parts.track.add(m);geometries.add(g);stats.triangles+=sleepers.length*12;stats.drawCalls++;stats.sleepers=sleepers.length;
 }
 const platformTops=new Batch(),platformSides=new Batch();
 for(const p of data.platforms){fillSurface(platformTops,p.path,[],()=>WAVERLEY_LEVELS.platform);walls(platformSides,p.path,[],()=>WAVERLEY_LEVELS.ground,()=>WAVERLEY_LEVELS.platform);}
 add(parts.platforms,platformTops,material('asphalt'),'waverley-platform-surfaces');add(parts.platforms,platformSides,material('stone'),'waverley-platform-faces');
 const roof=new Batch(),roofRunners=new Batch();
 for(const r of data.roofs){
  if(r.id==='relation/240040'){
   const shaped=ridgeRoofBatches(r.outer,r.holes);
   // Batch.append is intentionally unnecessary: copy faces while preserving their
   // physical normals/UVs. Both pieces still make one draw per material overall.
   for(const [from,to]of [[shaped.glass,roof],[shaped.ribs,roofRunners]]){
    const base=to.count;to.positions.push(...from.positions);to.normals.push(...from.normals);to.uvs.push(...from.uvs);to.indices.push(...from.indices.map(i=>i+base));
   }
  }else{const base=ground.rangeUnder(r.outer,16).mean;fillSurface(roof,r.outer,r.holes,()=>base+r.height);}
 }
 add(parts.roof,roof,glazing,'waverley-mapped-roofs');
 add(parts.roof,roofRunners,material('ribPaint'),'waverley-roof-runners');
 const buildings=new Batch({colored:true}),buildingTops=new Batch();
 const omitted=new Set(options.data?[]:WAVERLEY_LANDMARK_OMIT_IDS);
 for(const b of data.buildings){
  if(omitted.has(b.id))continue;
  const base=ground.rangeUnder(b.outer,4).min,top=base+b.height;
  let hash=0;for(const c of b.id)hash=(hash*31+c.charCodeAt(0))>>>0;
  const tone=.86+(hash%17)*.01,color:Rgb=[tone,tone*.985,tone*.95];
  // One foundation plane, ASSUMED 0.15m rendering sink. Elevated OSM parts keep their real
  // min_height void; terrain never pulls individual wall corners into shards.
  walls(buildings,b.outer,b.holes,()=>b.minHeight?base+b.minHeight:base-.15,()=>top,color);
  fillSurface(buildingTops,b.outer,b.holes,()=>top);
 }
 add(parts.buildings,buildings,sandstone,'waverley-building-walls');add(parts.buildings,buildingTops,slate,'waverley-building-tops');
 const landmarks=options.data?undefined:buildWaverleyLandmarks(ground,contextTerrain);
 if(landmarks){parts.buildings.add(landmarks.group);stats.triangles+=landmarks.stats.triangles;stats.drawCalls+=landmarks.stats.drawCalls;}
 if(options.lighting!==false){const hemisphere=new THREE.HemisphereLight(0xd8e6f5,0x7a7566,2.1),sun=new THREE.DirectionalLight(0xfff0d9,2.4);sun.position.set(-300,600,250);group.add(hemisphere,sun);}
 let disposed=false;
 return {group,parts,origin:{...data.origin},attribution:`${data.attribution}; ${terrainFile.attribution}`,terrain:ground,stats,dispose(){if(disposed)return;disposed=true;group.removeFromParent();landmarks?.dispose();for(const g of geometries)g.dispose();for(const m of ownedMaterials)m.dispose();group.clear();}};
}
