// The railway of an OSM station scene (Waverley's, Perth's): the drawn track segments, the station-floor flattening of the source terrain,
// the railway's plan footprint and the city blocks standing on it. Pure functions of the scene data: no scene file, no materials, so a
// station's lazy chunk can use them without pulling another station's data in. waverley-scene.ts re-exports them under their old names.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as StationData} from '../../core/waverley-data.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {KxData} from '../../core/osm.ts';
import {railShapes,shapeFrom,shapeKey} from '../../core/curves.ts';
import {waverleyTrackData} from '../../core/waverley-anchors.ts';
import {Batch} from './materials.ts';
import type {V3} from './materials.ts';
import {WAVERLEY_LEVELS,cleanRing} from './waverley-mesh.ts';

export type TrackSegment=[ax:number,az:number,bx:number,bz:number];
/** A rail drawn as surface train track: not a tram, a tunnel or below ground. */
const drawnRail=(r:StationData['rails'][number]):boolean=>!(r.tags.railway!=='rail'||r.tags.tram==='yes'||r.tags.tunnel&&r.tags.tunnel!=='no'||Number(r.tags.layer??0)<0);
/** No tram/tunnel is drawn as a surface train track, nor a duplicate junction edge. */
export function stationTrackSegments(data:Pick<StationData,'rails'>):TrackSegment[] {
 const out:TrackSegment[]=[],seen=new Set<string>();
 for(const r of data.rails){
  if(!drawnRail(r))continue;
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
export function railStrip(batch:Batch,a:Pt,b:Pt,halfWidth:number,y:number):void {railRibbon(batch,[a,b],halfWidth,y);}
/**
 * The unit normal (left of the direction of travel) at each point of a polyline, scaled for a mitred joint: at an interior point it is
 * the bisector of the two pieces' normals divided by the cosine of half the turn, so a line offset along it by d stays d from both
 * pieces. A zero-length piece is skipped; a polyline of fewer than two distinct points has no normals (empty).
 */
function mitreNormals(pts:readonly Pt[]):Pt[] {
 const n:(Pt|undefined)[]=[];
 for(let i=0;i+1<pts.length;i++){const a=pts[i],b=pts[i+1],dx=b[0]-a[0],dz=b[1]-a[1],l=Math.hypot(dx,dz);n.push(l?[-dz/l,dx/l]:undefined);}
 const before=(i:number):Pt|undefined=>{for(let j=i-1;j>=0;j--)if(n[j])return n[j];return undefined;};
 const after=(i:number):Pt|undefined=>{for(let j=i;j<n.length;j++)if(n[j])return n[j];return undefined;};
 if(!n.some(v=>v))return [];
 return pts.map((_,i)=>{
  const p=before(i),q=after(i);if(!p||!q)return (p??q) as Pt;
  const mx=p[0]+q[0],mz=p[1]+q[1],ml=Math.hypot(mx,mz);if(ml<1e-9)return p;
  const c=(mx*p[0]+mz*p[1])/ml;return [mx/ml/c,mz/ml/c];
 });
}
/** The polyline offset `d` to its left (mitred: see mitreNormals). */
export function offsetLine(pts:readonly Pt[],d:number):Pt[] {
 const n=mitreNormals(pts);return n.length?pts.map((p,i)=>[p[0]+n[i][0]*d,p[1]+n[i][1]*d]):[];
}
/**
 * A flat strip of `halfWidth` either side of the polyline `pts` at height y, its UVs in plan metres: one quad per piece, the pieces
 * meeting at mitred joints so the strip has no gap or overlap at a turn. Two points draw exactly railStrip's quad.
 */
export function railRibbon(batch:Batch,pts:readonly Pt[],halfWidth:number,y:number):void {
 const n=mitreNormals(pts);if(!n.length)return;
 for(let i=0;i+1<pts.length;i++){
  const a=pts[i],b=pts[i+1];if(a[0]===b[0]&&a[1]===b[1])continue;
  const ax=n[i][0]*halfWidth,az=n[i][1]*halfWidth,bx=n[i+1][0]*halfWidth,bz=n[i+1][1]*halfWidth;
  batch.quadUV([a[0]+ax,y,a[1]+az],[a[0]-ax,y,a[1]-az],[b[0]-bx,y,b[1]-bz],[b[0]+bx,y,b[1]+bz],[[a[0],a[1]],[a[0],a[1]],[b[0],b[1]],[b[0],b[1]]],[0,1,0]);
 }
}
/** The rails of a scene as the track graph's data: exactly waverleyTrackData's nodes and rails (its node ids, its layers), so a graph
 *  built on it (buildGraph(stationTrackData(data), {curves: true})) is the live graph, and its curves are the ones drawn. */
export function stationTrackData(data:Pick<StationData,'rails'>):Pick<KxData,'nodes'|'rails'> {
 const {nodes,rails}=waverleyTrackData({origin:{lat:0,lon:0},attribution:'',rails:data.rails,platforms:[]});return {nodes,rails};
}
/** The drawn track's centre lines, one per drawn segment (the segments stationTrackSegments draws, by node pair): with `curves`, the
 *  faired curves (core/curves.ts) that buildGraph(stationTrackData(data), {curves: true}) carries, so a train's edgePoint lies on the
 *  drawn line; without, the chord. The curves are built on all the rails (a tunnel or tram still shapes a junction it meets), and `keep`
 *  picks the rails drawn. */
export function stationTrackCurves(data:Pick<StationData,'rails'>,opts:{curves?:boolean;keep?:(r:StationData['rails'][number])=>boolean}={}):Pt[][] {
 const kx=stationTrackData(data),shapes=opts.curves===false?undefined:railShapes(kx),pos=new Map<number,Pt>();
 for(const [id,x,z]of kx.nodes)pos.set(id,[x,z]);
 // waverleyTrackData numbers the rails in id order (core/waverley-anchors.ts), so kx.rails[i] is the i-th rail by id
 const sorted=[...data.rails].sort((a,b)=>a.id.localeCompare(b.id)),out:Pt[][]=[],seen=new Set<string>();
 sorted.forEach((r,i)=>{
  if(!drawnRail(r)||opts.keep&&!opts.keep(r))return;
  const nodes=kx.rails[i].nodes;
  for(let j=1;j<nodes.length;j++){
   const a=nodes[j-1],b=nodes[j],pa=pos.get(a) as Pt,pb=pos.get(b) as Pt;if(a===b||pa[0]===pb[0]&&pa[1]===pb[1])continue;
   const key=shapeKey(a,b);if(seen.has(key))continue;seen.add(key);
   out.push(shapes?shapeFrom(shapes,a,b) as Pt[]:[pa,pb]);
  }
 });
 return out;
}
/** The pieces of centre lines as segments (for the station-floor flattening and the railway footprint). */
export const lineSegments=(lines:readonly (readonly Pt[])[]):TrackSegment[]=>lines.flatMap(l=>l.slice(1).map((b,i):TrackSegment=>[...l[i],...b]).filter(s=>s[0]!==s[2]||s[1]!==s[3]));
/** A station's track dimensions (WAVERLEY_LEVELS, PERTH_LEVELS). */
export interface TrackLevels {ballastHalfWidth:number;railHalfGauge:number;railHeadWidth:number}
/** Sleeper spacing (m) and the first one's distance from a segment's start. ASSUMED, as the levels. */
export const SLEEPER_SPACING=.65;
/**
 * Ballast, the two rail heads and the sleepers along each centre line: ribbons on the polyline, sleepers every SLEEPER_SPACING of arc
 * length (from half a spacing in, each line on its own), each square to the piece it stands on. `rails` gets each rail head's centre line
 * (for the distant-rail lines). A two-point line draws what the chord-by-chord drawing did, sleeper for sleeper.
 */
export function addTrackLines(lines:readonly (readonly Pt[])[],levels:TrackLevels,out:{ballast:Batch;rails:Batch;sleepers:V3[];railLines?:Pt[][]}):void {
 const offset=levels.railHalfGauge+levels.railHeadWidth/2;
 for(const line of lines){
  railRibbon(out.ballast,line,levels.ballastHalfWidth,-.14);
  for(const side of [-1,1]){const r=offsetLine(line,side*offset);railRibbon(out.rails,r,levels.railHeadWidth/2,0);out.railLines?.push(r);}
  let s=SLEEPER_SPACING/2,start=0;
  for(let i=0;i+1<line.length;i++){
   const [ax,az]=line[i],[bx,bz]=line[i+1],dx=bx-ax,dz=bz-az,length=Math.hypot(dx,dz);
   for(;s<start+length;s+=SLEEPER_SPACING)out.sleepers.push([ax+dx*(s-start)/length,Math.atan2(dx,dz),az+dz*(s-start)/length]);
   start+=length;
  }
 }
}
