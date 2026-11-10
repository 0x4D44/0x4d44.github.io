// HES LB30270: low ridge-and-furrow, laminated glazing in aluminium cassettes,
// parallel lattice girders; https://portal.historicenvironment.scot/designation/LB30270
// Approximately N–S ridges transverse to the tracks are INFERRED from the public
// North Bridge photo (Liberaler Humanist, 2015, CC BY-SA3):
// https://commons.wikimedia.org/wiki/File:Edinburgh_Waverley_Station_seen_from_North_Bridge,_Perspective_1,_07.08.2015.jpg
// ASSUMED 12m bay pitch, 8m gutter above the schematic rail datum, 2.4m symmetric
// rise, phase0, and 100x160mm fold rafters. These are not measured roof dimensions.
/** The rafter under each fold (gutter and ridge), w x h (m): deep enough that the folds read from the platforms (R-wv1-b3). ASSUMED. */
export const WAVERLEY_FOLD_RAFTER=[.1,.16] as const;
// Reported 12.8m statutory height LIMIT (not actual height): Rail Engineer 7Jul2011,
// https://www.railengineer.co.uk/edinburgh-waverleys-new-roof-installed/
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {Batch} from './materials.ts';
import type {V3} from './materials.ts';
export interface RidgeRoofProfile {gutter:number;rise:number;pitch:number;phase:number}
export const WAVERLEY_ROOF_PROFILE={gutter:8,rise:2.4,pitch:12,phase:0} as const;
/** The opaque strips of each pitch, half-widths in plan (m) either side of a furrow and of a ridge: the gutter walkway and the ridge capping
 * that read as solid bands between the glazed slopes from North Bridge and the Scott Monument (R-wv1-a, R-wv1-a3). ASSUMED widths, scaled
 * from those photos against the ASSUMED 12 m pitch; no published figure. */
export const WAVERLEY_ROOF_BANDS={gutter:.9,ridge:.35} as const;
/** How far the solid strips stand above the glazing they cover (m): the glazing writes no depth, so this only keeps the strip on top. */
export const WAVERLEY_ROOF_STRIP_LIFT=.03;
/** The roof's height (y) at east coordinate x: gutter at each furrow, ridge midway, straight slopes. */
export function roofHeight(x:number,profile:RidgeRoofProfile=WAVERLEY_ROOF_PROFILE):number{
 const half=profile.pitch/2,t=((x-profile.phase)%profile.pitch+profile.pitch)%profile.pitch;return profile.gutter+profile.rise*(1-Math.abs(t-half)/half);
}
const clean=(ring:readonly Pt[]):Pt[]=>ring.length>1&&ring[0][0]===ring.at(-1)![0]&&ring[0][1]===ring.at(-1)![1]?ring.slice(0,-1):[...ring];
function clip(ring:Pt[],x:number,greater:boolean):Pt[]{
 const result:Pt[]=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length],insideA=greater?a[0]>=x:a[0]<=x,insideB=greater?b[0]>=x:b[0]<=x;
  if(insideA)result.push(a);
  if(insideA!==insideB){const t=(x-a[0])/(b[0]-a[0]);result.push([x,a[1]+(b[1]-a[1])*t]);}
 }
 return result;
}
function inside(p:Pt,r:Pt[]):boolean{
 let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;
}
/** The part of a convex polygon on one side of the line a-b: side(p) = cross(b - a, p - a), kept where its sign is `sign`. */
function clipSide(ring:Pt[],a:Pt,b:Pt,sign:1|-1):Pt[]{
 const side=(p:Pt):number=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])),out:Pt[]=[];
 for(let i=0;i<ring.length;i++){
  const p=ring[i],q=ring[(i+1)%ring.length],sp=side(p),sq=side(q);
  if(sp>=0)out.push(p);
  if((sp>=0)!==(sq>=0)){const t=sp/(sp-sq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
 }
 return out;
}
const area2=(r:readonly Pt[]):number=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return s;};
/** A convex polygon less a convex cut-out: the pieces outside each of the cut-out's edges in turn (convex, non-overlapping). */
function subtractConvex(poly:Pt[],cut:readonly Pt[]):Pt[][]{
 const c=area2(cut)>0?cut:[...cut].reverse(),pieces:Pt[][]=[];let rest=poly;
 for(let i=0;i<c.length&&rest.length>=3;i++){
  const a=c[i],b=c[(i+1)%c.length],outside=clipSide(rest,a,b,-1);
  if(outside.length>=3&&Math.abs(area2(outside))>1e-9)pieces.push(outside);
  rest=clipSide(rest,a,b,1);
 }
 return pieces;
}
/** The convex hull of a ring (Andrew's monotone chain), counter-clockwise in x/z. */
export function convexHull(ring:readonly Pt[]):Pt[]{
 const pts=[...clean(ring)].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o:Pt,a:Pt,b:Pt)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const half=(list:Pt[]):Pt[]=>{const h:Pt[]=[];for(const p of list){while(h.length>=2&&cross(h[h.length-2],h[h.length-1],p)<=0)h.pop();h.push(p);}h.pop();return h;};
 return [...half(pts),...half([...pts].reverse())];
}
/** The north-south runs [z0, z1] of the line at east coordinate x that lie inside the outer ring and outside every hole. */
export function footprintRuns(outer:readonly Pt[],holes:readonly (readonly Pt[])[],x:number):[number,number][]{
 const rings=[clean(outer),...holes.map(clean)],zs:number[]=[],out:[number,number][]=[];
 for(const ring of rings)for(let i=0;i<ring.length;i++){
  const a=ring[i],b=ring[(i+1)%ring.length];
  if(a[0]===b[0]){if(Math.abs(x-a[0])<1e-7)zs.push(a[1],b[1]);continue;}
  if(x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0]))zs.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));
 }
 const cuts=[...new Set(zs)].sort((a,b)=>a-b);
 for(let i=1;i<cuts.length;i++){const z0=cuts[i-1],z1=cuts[i],mid:Pt=[x,(z0+z1)/2];if(inside(mid,rings[0])&&!rings.slice(1).some(r=>inside(mid,r)))out.push([z0,z1]);}
 return out;
}
/** Split triangulated OSM faces at each gutter/ridge; `cutouts` are convex outlines (the bridges over the roof) the roof stops at. Clipping triangles retains
 * concavities and holes exactly; moving only original OSM corners would bridge bays. */
export function ridgeRoofBatches(outer:readonly Pt[],holes:readonly (readonly Pt[])[],profile:RidgeRoofProfile=WAVERLEY_ROOF_PROFILE,bands:{gutter:number;ridge:number}=WAVERLEY_ROOF_BANDS,cutouts:readonly (readonly Pt[])[]=[]):{glass:Batch;ribs:Batch;solid:Batch}{
 if(!Number.isFinite(profile.pitch)||profile.pitch<=0||![profile.gutter,profile.rise,profile.phase].every(Number.isFinite))throw Error('Invalid Waverley roof profile');
 const glass=new Batch(),ribs=new Batch(),solid=new Batch(),rings=[clean(outer),...holes.map(clean)],points=rings.flat(),half=profile.pitch/2;
 if(rings[0].length<3)return {glass,ribs,solid};
 const height=(x:number):number=>roofHeight(x,profile);
 const faces=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))));
 for(const face of faces){
  const triangle=face.map(i=>points[i]),lo=Math.min(...triangle.map(p=>p[0])),hi=Math.max(...triangle.map(p=>p[0]));
  for(let k=Math.floor((lo-profile.phase)/half);k<=Math.floor((hi-profile.phase)/half);k++){
   const x0=profile.phase+k*half;
   // Convex cut-outs (the bridges that cross the roof) leave convex pieces of this half-pitch piece.
   let pieces=[clip(clip(triangle,x0,true),x0+half,false)];
   for(const cut of cutouts)pieces=pieces.flatMap(p=>p.length<3?[]:subtractConvex(p,cut));
   for(const poly of pieces){
   for(let i=1;i+1<poly.length;i++){
    const pts=[poly[0],poly[i],poly[i+1]] as [Pt,Pt,Pt];
    glass.tri(...pts.map(p=>[p[0],height(p[0]),p[1]] as V3) as [V3,V3,V3],pts,[0,1,0]);
   }
   // The solid strips over this half pitch: the gutter band at its furrow end, the capping at its ridge end (k even rises from a furrow).
   const rising=((k%2)+2)%2===0,[g0,g1]=rising?[x0,x0+bands.gutter]:[x0+half-bands.gutter,x0+half],[r0,r1]=rising?[x0+half-bands.ridge,x0+half]:[x0,x0+bands.ridge];
   for(const [a,b]of [[g0,g1],[r0,r1]]){
    const band=clip(clip(poly,a,true),b,false);
    for(let i=1;i+1<band.length;i++){const pts=[band[0],band[i],band[i+1]] as [Pt,Pt,Pt];solid.tri(...pts.map(p=>[p[0],height(p[0])+WAVERLEY_ROOF_STRIP_LIFT,p[1]] as V3) as [V3,V3,V3],pts,[0,1,0]);}
   }
   }
  }
 }
 const lo=Math.min(...rings[0].map(p=>p[0])),hi=Math.max(...rings[0].map(p=>p[0]));
 // Ridge and gutter runners terminate 0.3 m inside the footprint/hole/bridge edge (so a runner's corner never pokes past a slanting edge), rather than bridging
 // the central building. Fine cassette bars remain in the existing KX texture.
 for(let k=Math.ceil((lo-profile.phase)/half);profile.phase+k*half<hi;k++){
  const x=profile.phase+k*half;
  for(const [z0,z1]of footprintRuns(outer,[...holes,...cutouts],x))if(z1-z0>.8)ribs.box([x,height(x)-WAVERLEY_FOLD_RAFTER[1]/2,(z0+z1)/2],[WAVERLEY_FOLD_RAFTER[0],WAVERLEY_FOLD_RAFTER[1],z1-z0-.6]);
 }
 return {glass,ribs,solid};
}
