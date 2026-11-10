// The railway of an OSM station scene (Waverley's, Perth's): the drawn track segments, the station-floor flattening of the source terrain,
// the railway's plan footprint and the city blocks standing on it. Pure functions of the scene data: no scene file, no materials, so a
// station's lazy chunk can use them without pulling another station's data in. waverley-scene.ts re-exports them under their old names.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as StationData} from '../../core/waverley-data.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch} from './materials.ts';
import {WAVERLEY_LEVELS,cleanRing} from './waverley-mesh.ts';

export type TrackSegment=[ax:number,az:number,bx:number,bz:number];
/** No tram/tunnel is drawn as a surface train track, nor a duplicate junction edge. */
export function stationTrackSegments(data:Pick<StationData,'rails'>):TrackSegment[] {
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
export function segmentDistance(x:number,z:number,s:TrackSegment):number {
 const dx=s[2]-s[0],dz=s[3]-s[1],t=Math.max(0,Math.min(1,((x-s[0])*dx+(z-s[1])*dz)/(dx*dx+dz*dz||1)));
 return Math.hypot(x-s[0]-t*dx,z-s[1]-t*dz);
}
export function insideRing(x:number,z:number,p:readonly Pt[]):boolean {
 let yes=false;
 for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;
 return yes;
}
/** Keep source terrain intact; derive the preview's station-floor plateau separately: level inside `floors` (the platforms and the station
 *  roof's outline), level within WAVERLEY_LEVELS.railFlatten of `rails`, blending to the source over WAVERLEY_LEVELS.blend. */
export function stationGround(raw:Terrain,rails:readonly TrackSegment[],floors:readonly (readonly Pt[])[]):Terrain {
 const edges:TrackSegment[]=floors.flatMap(r=>r.map((p,i)=>[...p,...r[(i+1)%r.length]] as TrackSegment));
 const height=(x:number,z:number):number=>{
  if(floors.some(r=>insideRing(x,z,r)))return WAVERLEY_LEVELS.ground;
  let distance=Infinity;
  for(const e of rails)distance=Math.min(distance,Math.max(0,segmentDistance(x,z,e)-WAVERLEY_LEVELS.railFlatten));
  for(const e of edges)distance=Math.min(distance,segmentDistance(x,z,e));
  const t=Math.min(1,distance/WAVERLEY_LEVELS.blend),blend=t*t*(3-2*t);
  return WAVERLEY_LEVELS.ground+(raw.heightAt(x,z)-WAVERLEY_LEVELS.ground)*blend;
 };
 // 8 m refines only the flattening transition; it adds no resolution claim to the 16 m DTM.
 return terrainFromFunction(height,raw.extent,8,{q:.001,groundY:WAVERLEY_LEVELS.ground,datumAod:raw.datumAod});
}
/**
 * The plan overlap (m²) a mapped city block may have with the railway and still be drawn. OSM traces a building and an abutting
 * platform separately, so a shared wall can overlap by a sliver (way/62065007, an office beside a platform: 0.51 m² of its 4,327 m²);
 * a block standing on the railway overlaps by hundreds (way/377738789 beside Waverley Bridge: 440 m²; way/226874677: 162 m²).
 */
export const RAILWAY_OVERLAP_TOLERANCE=2;
const ringArea=(p:readonly Pt[]):number=>{let s=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];s+=a[0]*b[1]-b[0]*a[1];}return s/2;};
/** Sutherland-Hodgman: the part of any simple ring inside a convex ring (either winding). Its area is exact for a concave subject too. */
function clipConvex(subject:readonly Pt[],convex:readonly Pt[]):Pt[] {
 const c=ringArea(convex)>0?convex:[...convex].reverse();let out:Pt[]=[...subject];
 for(let i=0;i<c.length&&out.length;i++){
  const a=c[i],b=c[(i+1)%c.length],side=(p:Pt)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]),input=out;out=[];
  for(let j=0;j<input.length;j++){
   const p=input[j],q=input[(j+1)%input.length],sp=side(p),sq=side(q);
   if(sp>=0)out.push(p);
   if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }
 }
 return out;
}
/** The railway's plan footprint as convex pieces: each drawn track's ballast strip and each mapped platform's triangles. */
export function stationRailwayFootprint(data:Pick<StationData,'rails'|'platforms'>):Pt[][] {
 const strips=stationTrackSegments(data).map(([ax,az,bx,bz]):Pt[]=>{
  const length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length*WAVERLEY_LEVELS.ballastHalfWidth,nz=(bx-ax)/length*WAVERLEY_LEVELS.ballastHalfWidth;
  return [[ax+nx,az+nz],[bx+nx,bz+nz],[bx-nx,bz-nz],[ax-nx,az-nz]];
 });
 const platforms=data.platforms.flatMap(p=>{const r=cleanRing(p.path);return r.length<3?[]:THREE.ShapeUtils.triangulateShape(r.map(v=>new THREE.Vector2(...v)),[]).map(f=>f.map(i=>r[i]));});
 return [...strips,...platforms];
}
/**
 * The mapped city blocks that stand on the railway: the general rule, by footprint, not by id. A block is dropped when its footprint
 * (less its holes) overlaps the track ballast or a platform by more than RAILWAY_OVERLAP_TOLERANCE. The railway is the scene's:
 * the drawn track and platforms, so nothing solid stands where a train or a passenger would be.
 */
export function stationRailwayIntrusions(data:Pick<StationData,'rails'|'platforms'|'buildings'>,footprint:readonly Pt[][]=stationRailwayFootprint(data)):string[] {
 const box=(r:readonly Pt[])=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const [x,z]of r){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}return [x0,x1,z0,z1];};
 const pieces=footprint.map(r=>({r,b:box(r)}));
 return data.buildings.filter(b=>{
  const [x0,x1,z0,z1]=box(b.outer),outer=cleanRing(b.outer),holes=b.holes.map(cleanRing);let overlap=0;
  for(const {r,b:[a0,a1,c0,c1]}of pieces){
   if(a1<x0||a0>x1||c1<z0||c0>z1)continue;
   overlap+=Math.abs(ringArea(clipConvex(outer,r)));for(const h of holes)overlap-=Math.abs(ringArea(clipConvex(h,r)));
  }
  return overlap>RAILWAY_OVERLAP_TOLERANCE;
 }).map(b=>b.id);
}
/** A flat strip of `halfWidth` either side of a→b at height y, its UVs in plan metres. */
export function railStrip(batch:Batch,a:Pt,b:Pt,halfWidth:number,y:number):void {
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)return;
 const nx=-dz/length*halfWidth,nz=dx/length*halfWidth;
 batch.quadUV([a[0]+nx,y,a[1]+nz],[a[0]-nx,y,a[1]-nz],[b[0]-nx,y,b[1]-nz],[b[0]+nx,y,b[1]+nz],[[a[0],a[1]],[a[0],a[1]],[b[0],b[1]],[b[0],b[1]]],[0,1,0]);
}
