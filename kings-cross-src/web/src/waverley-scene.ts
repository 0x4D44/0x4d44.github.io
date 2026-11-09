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
import type {V3} from './materials.ts';
import {WAVERLEY_LEVELS,meshAdder} from './waverley-mesh.ts';
import {buildWaverleyStation,WAVERLEY_STATION_ROOF_ID} from './waverley-station.ts';
import {buildWaverleyFrontage,WAVERLEY_FRONTAGE_OMIT_IDS} from './waverley-frontage.ts';
import {buildWaverleyCity,buildWaverleyCityLandmarks,WAVERLEY_CITY_OMIT_IDS} from './waverley-city.ts';
import {addWaverleyLights} from './station-weather.ts';
export {polygonSurface} from './waverley-mesh.ts';
export {WAVERLEY_LEVELS};
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk.
// Awaiting the module resolves both before the synchronous builder becomes available.
const [{default:dataFile},{default:terrainFile}]=await Promise.all([
 import('./data/waverley-scene.json',{with:{type:'json'}}),
 import('./data/waverley-terrain.json',{with:{type:'json'}}),
]);

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
 groundAttribution:string;
 /** Ground of the drawn mesh, including the documented railway flattening, not a rail survey. */
 terrain:Terrain;
 stats:{triangles:number;drawCalls:number;platforms:number;buildings:number;roofs:number;sleepers:number};
 dispose():void;
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
 const rails=waverleyTrackSegments(data),polys=[...data.platforms.map(p=>p.path),...data.roofs.filter(r=>r.id===WAVERLEY_STATION_ROOF_ID).map(r=>r.outer)];
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
 const geometries=new Set<THREE.BufferGeometry>(),ownedMaterials=new Set<THREE.Material>();
 const stats={triangles:0,drawCalls:0,platforms:data.platforms.length,buildings:data.buildings.length,roofs:data.roofs.length,sleepers:0};
 const add=meshAdder(stats,geometries);
 // This source extent is in whole 16 m blocks, not necessarily whole KX 64 m blocks.
 const tm=buildTerrainMesh(field,{maxLeaf:16,tolerance:()=>.08});
 const ground=overMesh(field,tm);
 // The elements, each in its own file. They are built in this order (city, then ground and track, station, frontage, city landmarks) so
 // that their materials keep the order, and so the draw order, they had when all of this was one function; the scene graph keeps its old order.
 // Elements draw their own replacements of mapped city blocks; the synthetic-data path (tests) draws no landmarks and omits nothing.
 const landmarks=!options.data;
 const city=buildWaverleyCity(data,ground,{omitBuildingIds:landmarks?[...WAVERLEY_FRONTAGE_OMIT_IDS,...WAVERLEY_CITY_OMIT_IDS]:[]});
 const terrain=new THREE.Group(),track=new THREE.Group(),buildings=new THREE.Group();
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(tm.positions,3));tg.setIndex(new THREE.BufferAttribute(tm.indices,1));tg.computeVertexNormals();
 const groundMaterial=terrainMaterial('ground').clone() as THREE.MeshLambertMaterial;
 // Neutral warm ground separates sandstone/slate/glazing without inventing land-use
 // polygons; real roads/parks are not classified by this context-only DTM.
 groundMaterial.color.setHex(0x757568);ownedMaterials.add(groundMaterial);
 const terrainMesh=new THREE.Mesh(tg,groundMaterial);terrainMesh.name='waverley-ground';terrain.add(terrainMesh);geometries.add(tg);stats.triangles+=tm.triangles;stats.drawCalls++;
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
 add(track,ballast,material('ballast'),'waverley-ballast');add(track,rails,material('steel'),'waverley-rail-heads');
 if(lines.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));geometries.add(g);const lineMaterial=new THREE.LineBasicMaterial({color:0xc3c8cc});ownedMaterials.add(lineMaterial);const m=new THREE.LineSegments(g,lineMaterial);m.name='waverley-distant-rails';track.add(m);stats.drawCalls++;}
 if(sleepers.length){
  const g=new THREE.BoxGeometry(2.6,.05,.25),m=new THREE.InstancedMesh(g,material('concrete'),sleepers.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  sleepers.forEach(([x,yaw,z],i)=>{q.setFromAxisAngle(up,yaw);matrix.compose(new THREE.Vector3(x,-.125,z),q,new THREE.Vector3(1,1,1));m.setMatrixAt(i,matrix);});m.instanceMatrix.needsUpdate=true;m.name='waverley-sleepers';track.add(m);geometries.add(g);stats.triangles+=sleepers.length*12;stats.drawCalls++;stats.sleepers=sleepers.length;
 }
 const station=buildWaverleyStation(data,ground);
 const parts={terrain,track,platforms:station.platforms,roof:station.roof,buildings};
 for(const [key,value]of Object.entries(parts)){value.name=`waverley-${key}`;group.add(value);}
 parts.roof.visible=options.roofVisible!==false;parts.buildings.visible=options.cityVisible!==false;
 const frontage=landmarks?buildWaverleyFrontage(ground,contextTerrain):undefined;
 const cityLandmarks=landmarks?buildWaverleyCityLandmarks(ground):undefined;
 const elements=[station,city,frontage,cityLandmarks].filter(e=>e!==undefined);
 for(const e of [city,frontage,cityLandmarks])if(e)parts.buildings.add(e.group);
 for(const e of elements){stats.triangles+=e.stats.triangles;stats.drawCalls+=e.stats.drawCalls;}
 if(options.lighting!==false)addWaverleyLights(group);
 let disposed=false;
 return {group,parts,origin:{...data.origin},attribution:`${data.attribution}; ${terrainFile.attribution}`,groundAttribution:terrainFile.attribution,terrain:ground,stats,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const e of elements)e.dispose();for(const g of geometries)g.dispose();for(const m of ownedMaterials)m.dispose();group.clear();}};
}
