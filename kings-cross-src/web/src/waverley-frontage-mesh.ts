// W2 frontage mesh helpers: oriented boxes, prisms of revolution, profiled slabs and ring offsets for the Balmoral and the two bridges.
// Geometry only; no scene data, no materials. Every face carries an explicit outward normal so OSM ring winding never flips a face.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Batch,Rgb,V3} from './materials.ts';

const add=(a:V3,b:V3,k=1):V3=>[a[0]+b[0]*k,a[1]+b[1]*k,a[2]+b[2]*k];
const neg=(a:V3):V3=>[-a[0],-a[1],-a[2]];
export const unit=(a:V3):V3=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
export const crossV=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];

/** A box centred on `c` with unit axes `ax`, `ay`, `az` and half sizes `h`; six faces, each with its outward normal. */
export function obox(b:Batch,c:V3,ax:V3,ay:V3,az:V3,h:V3,color?:Rgb):void{
 const corner=(i:number,j:number,k:number):V3=>add(add(add(c,ax,i*h[0]),ay,j*h[1]),az,k*h[2]);
 const faces:[V3,V3[]][]=[
  [ax,[corner(1,-1,-1),corner(1,1,-1),corner(1,1,1),corner(1,-1,1)]],[neg(ax),[corner(-1,-1,-1),corner(-1,-1,1),corner(-1,1,1),corner(-1,1,-1)]],
  [ay,[corner(-1,1,-1),corner(-1,1,1),corner(1,1,1),corner(1,1,-1)]],[neg(ay),[corner(-1,-1,-1),corner(1,-1,-1),corner(1,-1,1),corner(-1,-1,1)]],
  [az,[corner(-1,-1,1),corner(1,-1,1),corner(1,1,1),corner(-1,1,1)]],[neg(az),[corner(-1,-1,-1),corner(-1,1,-1),corner(1,1,-1),corner(1,-1,-1)]],
 ];
 for(const [n,p]of faces)b.poly(p,[[0,0],[1,0],[1,1],[0,1]],{normal:n,color});
}
/** An axis-aligned-in-y box whose long axis runs from plan point a to plan point b (y0..y1), `half` its half thickness across. */
export function wallBox(b:Batch,a:Pt,p:Pt,y0:number,y1:number,half:number,color?:Rgb,extend=0):void{
 const dx=p[0]-a[0],dz=p[1]-a[1],l=Math.hypot(dx,dz);if(l<1e-6||y1<=y0)return;
 const ax:V3=[dx/l,0,dz/l],az:V3=[-dz/l,0,dx/l];
 obox(b,[(a[0]+p[0])/2,(y0+y1)/2,(a[1]+p[1])/2],ax,[0,1,0],az,[l/2+extend,(y1-y0)/2,half],color);
}
/** A vertical prism of `sides` faces about (x, z), radius r (to the corners), y0..y1, with a top cap. */
export function prism(b:Batch,x:number,z:number,r:number,y0:number,y1:number,sides:number,color?:Rgb,phase=Math.PI/sides,cap=true):void{
 revolve(b,x,z,[[r,y0],[r,y1],...cap?[[0,y1] as [number,number]]:[]],sides,color,phase);
}
/**
 * A surface of revolution about the vertical through (x, z): `profile` is [radius, y] from the bottom up; faceted into `sides`.
 * Each facet's normal is its own (flat shading), outward; a zero radius closes the top.
 */
export function revolve(b:Batch,x:number,z:number,profile:readonly (readonly [number,number])[],sides:number,color?:Rgb,phase=0):void{
 for(let k=0;k+1<profile.length;k++){
  const [r0,y0]=profile[k],[r1,y1]=profile[k+1];
  for(let i=0;i<sides;i++){
   const a0=phase+i*2*Math.PI/sides,a1=phase+(i+1)*2*Math.PI/sides,am=(a0+a1)/2;
   const p=(r:number,a:number,y:number):V3=>[x+r*Math.cos(a),y,z+r*Math.sin(a)];
   // the facet's outward normal: radial in plan, tilted by the profile's slope
   const dr=r1-r0,dy=y1-y0,l=Math.hypot(dr,dy)||1,n:V3=unit([Math.cos(am)*dy/l,-dr/l,Math.sin(am)*dy/l]);
   const pts:V3[]=r1<1e-6?[p(r0,a0,y0),p(r0,a1,y0),p(0,0,y1)]:r0<1e-6?[p(0,0,y0),p(r1,a1,y1),p(r1,a0,y1)]:[p(r0,a0,y0),p(r0,a1,y0),p(r1,a1,y1),p(r1,a0,y1)];
   b.poly(pts,undefined,{normal:n,color});
  }
 }
}
/**
 * A flat slab cut to a 2D outline (any simple polygon, [across, y]) standing in a vertical plane: `origin` at across 0, `across` the in-plane
 * horizontal axis, `out` the plane's outward normal; the slab runs from the plane `depth` back (against `out`) to the plane itself.
 */
export function slab(b:Batch,outline:readonly [number,number][],origin:V3,across:V3,out:V3,depth:number,color?:Rgb):void{
 const at=(p:readonly [number,number],back:number):V3=>[origin[0]+across[0]*p[0]-out[0]*back,p[1],origin[2]+across[2]*p[0]-out[2]*back];
 const faces=THREE.ShapeUtils.triangulateShape(outline.map(p=>new THREE.Vector2(p[0],p[1])),[]);
 for(const f of faces){
  b.poly(f.map(i=>at(outline[i],0)),undefined,{normal:out,color});
  b.poly(f.map(i=>at(outline[i],depth)),undefined,{normal:neg(out),color});
 }
 const area=outline.reduce((s,p,i)=>{const q=outline[(i+1)%outline.length];return s+p[0]*q[1]-q[0]*p[1];},0);
 for(let i=0;i<outline.length;i++){
  const p=outline[i],q=outline[(i+1)%outline.length],dx=q[0]-p[0],dy=q[1]-p[1],l=Math.hypot(dx,dy);if(l<1e-6)continue;
  // in-plane edge normal, outward from the outline, lifted into 3D
  const s=area>0?1:-1,nx=s*dy/l,ny=-s*dx/l,n:V3=unit([across[0]*nx,ny,across[2]*nx]);
  b.poly([at(p,0),at(q,0),at(q,depth),at(p,depth)],undefined,{normal:n,color});
 }
}
/** Signed plan area (positive: counter-clockwise in x/z, so an edge's outward normal is (dz, -dx)). */
export const ringArea=(r:readonly Pt[]):number=>r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0)/2;
/** The ring counter-clockwise (positive area). */
export const ccw=(r:readonly Pt[]):Pt[]=>ringArea(r)>=0?[...r]:[...r].reverse();
/** Douglas-Peucker on a closed ring: drops the OSM notches smaller than `tolerance` for the roofline (never for the walls). */
export function simplifyRing(r:readonly Pt[],tolerance:number):Pt[]{
 const dist=(p:Pt,a:Pt,c:Pt)=>{const dx=c[0]-a[0],dz=c[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
 const chain=(p:Pt[]):Pt[]=>{if(p.length<3)return p;let far=0,at=0;for(let i=1;i<p.length-1;i++){const d=dist(p[i],p[0],p[p.length-1]);if(d>far){far=d;at=i;}}
  return far<=tolerance?[p[0],p[p.length-1]]:[...chain(p.slice(0,at+1)).slice(0,-1),...chain(p.slice(at))];};
 let far=1;for(let i=1;i<r.length;i++)if(Math.hypot(r[i][0]-r[0][0],r[i][1]-r[0][1])>Math.hypot(r[far][0]-r[0][0],r[far][1]-r[0][1]))far=i;
 return [...chain(r.slice(0,far+1)).slice(0,-1),...chain([...r.slice(far),r[0]]).slice(0,-1)];
}
/** Each corner of a counter-clockwise ring moved `d` inward along its mitre (capped at 2.5 d). */
export function insetRing(r:readonly Pt[],d:number):Pt[]{
 return r.map((p,i)=>{
  const a=r[(i+r.length-1)%r.length],c=r[(i+1)%r.length];
  const n1=unit([-(p[1]-a[1]),0,p[0]-a[0]]),n2=unit([-(c[1]-p[1]),0,c[0]-p[0]]);// inward normals of a counter-clockwise ring
  const m=unit([n1[0]+n2[0],0,n1[2]+n2[2]]),cos=Math.max(.4,m[0]*n1[0]+m[2]*n1[2]);
  return [p[0]+m[0]*d/cos,p[1]+m[2]*d/cos] as Pt;
 });
}
