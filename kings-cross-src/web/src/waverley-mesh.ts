// Shared Waverley mesh helpers (lead-owned): the OSM polygon surface, wall extrusion and landmark prism/pyramid that the station
// (waverley-station.ts), the frontage (waverley-frontage.ts) and the city (waverley-city.ts) draw with. No scene data or materials here.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {Batch} from './materials.ts';
import type {V3,Rgb} from './materials.ts';

/** ASSUMED preview datum and detail dimensions; not Waverley surveyed rail/structure levels. */
export const WAVERLEY_LEVELS={ground:-.2,rail:0,platform:.915,railHalfGauge:.7175,railHeadWidth:.072,ballastHalfWidth:1.65,railFlatten:8,blend:40} as const;
export const cleanRing=(p:readonly Pt[]):Pt[]=>{
 const r=p.map(v=>[v[0],v[1]] as Pt);
 if(r.length>1&&r[0][0]===r.at(-1)![0]&&r[0][1]===r.at(-1)![1])r.pop();
 return r;
};
export function fillSurface(batch:Batch,outer:readonly Pt[],holes:readonly (readonly Pt[])[],at:(x:number,z:number)=>number):void {
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
export function walls(b:Batch,outer:readonly Pt[],holes:readonly (readonly Pt[])[],bottom:(x:number,z:number)=>number,top:(x:number,z:number)=>number,color?:Rgb):void {
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
/** The vertex centroid of a ring. */
export function centre(r:Pt[]):Pt{return [r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length];}
export function cap(b:Batch,r:Pt[],height:(p:Pt)=>number):void{
 for(const f of THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]))b.tri(...f.map(i=>[r[i][0],height(r[i]),r[i][1]] as V3) as [V3,V3,V3],undefined,[0,1,0]);
}
/** A prism wall shell with its top cap, outward-facing in either ring winding. */
export function shell(b:Batch,r:Pt[],bottom:(p:Pt)=>number,top:(p:Pt)=>number):void{
 const area=r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0);
 const poly=area>0?[...r].reverse():r;
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];b.quadUV([p[0],bottom(p),p[1]],[q[0],bottom(q),q[1]],[q[0],top(q),q[1]],[p[0],top(p),p[1]],[[0,0],[1,0],[1,1],[0,1]]);}
 cap(b,r,top);
}
/** A pyramid over the ring's vertex centroid. */
export function pyramid(b:Batch,r:Pt[],bottom:number,top:number):void{
 const c=centre(r);for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];const a:V3=[p[0],bottom,p[1]],d:V3=[q[0],bottom,q[1]],tip:V3=[c[0],top,c[1]];
 // Explicit outward facing removes dependence on input OSM ring winding.
 b.tri(a,d,tip,undefined,[((p[0]+q[0])/2-c[0]),0,((p[1]+q[1])/2-c[1])]);}
}
/** A builder's draws: one mesh per non-empty batch, counted into `stats`, with the geometry recorded for dispose. */
export function meshAdder(stats:{triangles:number;drawCalls:number},geometries:Set<THREE.BufferGeometry>){
 return (parent:THREE.Group,b:Batch,mat:THREE.Material,name:string):void=>{
  if(!b.triangles)return;const g=b.build();geometries.add(g);const mesh=new THREE.Mesh(g,mat);mesh.name=name;parent.add(mesh);stats.triangles+=b.triangles;stats.drawCalls++;
 };
}
