// W3 city roofs: the shape of each mapped block's roof, from its OSM roof tags where mapped (roof:shape on 600-odd ways and parts:
// gabled, hipped, skillion, pyramidal, dome ...; roof:height / roof:levels when given), else ASSUMED.
//
// ASSUMED roofs. Edinburgh's Old and New Town tenements and terraces are pitched slate roofs, many with a flat lead "platform" on top
// where the plan is deep (R-wv3-c, -c2, -c3: the roofscape seen from Calton Hill). A mapped block with no roof:shape therefore takes a
// double-pitched roof along its long axis, ASSUMED 40 degrees (a common Scottish slate pitch), its rise capped at ROOF_ASSUMED.maxRise
// (so a deep plan gets the platform), unless it is a kind that is usually flat (offices, shops, car parks), very large in plan, or tall
// (modern blocks). An OSM height is to the top of the roof (OSM convention), so the walls stop at height - rise; where the height is
// itself ASSUMED, so is the split.
//
// Geometry. A roof is a height field over the footprint made of planes: h = eave + min(rise, slope * distance-to-eave), the distances
// measured across (and, hipped, along) the footprint's minimum-area rectangle. Every line where the planes meet is a crease; the
// footprint's triangles are cut along every crease, and crossings are inserted into the wall rings, so each piece is exactly planar
// and the gable walls meet the roof edge to edge, with no gap and no overlap.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {Batch} from './materials.ts';
import type {V3,Rgb} from './materials.ts';
import {cleanRing} from './waverley-mesh.ts';

export const ROOF_ASSUMED={pitchDeg:40,maxRise:4.5,maxArea:3000,maxHeight:30,skillionRise:1.5,flatKinds:['commercial','office','retail','industrial','warehouse','parking','garage','garages','construction','roof','supermarket','train_station','transportation','hospital','service','kiosk']} as const;
/** Chimney stacks: ASSUMED Edinburgh tenement gable and party-wall stacks, 2.4 m across the ridge, 0.9 m along it, 1.4 m above it,
 *  one at each gable end and one about every CHIMNEY.spacing along the ridge (every second or third tenement frontage; ASSUMED). Only on pitched residential-kind roofs. */
export const CHIMNEY={across:2.4,along:.9,above:1.4,spacing:18} as const;
const CHIMNEY_KINDS=new Set(['yes','residential','apartments','house','terrace','tenement','hotel','church','school','university','public','civic','dormitory','detached','semidetached_house','government']);
interface Line {n:Pt;o:number}
export interface RoofPlan {
 shape:'flat'|'planes'|'pyramid'|'dome';
 /** Height at a point (absolute y). */
 at(x:number,z:number):number;
 eave:number;top:number;
 creases:Line[];
 assumed:boolean;
 /** Chimney stack centres with their ridge height, and the ridge direction. */
 chimneys:{x:number;z:number;y:number}[];u:Pt;
}
/** The minimum-area rectangle of a ring: centre, unit long axis u, half-length L along it, half-width W across it. */
export function rectangleOf(r:readonly Pt[]):{c:Pt;u:Pt;L:number;W:number}{
 const pts=[...r].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(o:Pt,a:Pt,b:Pt)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
 const lo:Pt[]=[],hi:Pt[]=[];for(const p of pts){while(lo.length>1&&cross(lo.at(-2)!,lo.at(-1)!,p)<=0)lo.pop();lo.push(p);}
 for(const p of [...pts].reverse()){while(hi.length>1&&cross(hi.at(-2)!,hi.at(-1)!,p)<=0)hi.pop();hi.push(p);}
 const hull=[...lo.slice(0,-1),...hi.slice(0,-1)];let best={area:Infinity,c:[0,0] as Pt,u:[1,0] as Pt,L:0,W:0};
 for(let i=0;i<hull.length;i++){const a=hull[i],b=hull[(i+1)%hull.length],l=Math.hypot(b[0]-a[0],b[1]-a[1]);if(!l)continue;
  const ux=(b[0]-a[0])/l,uz=(b[1]-a[1])/l;let e0=Infinity,e1=-Infinity,d0=Infinity,d1=-Infinity;
  for(const p of hull){const e=p[0]*ux+p[1]*uz,d=-p[0]*uz+p[1]*ux;e0=Math.min(e0,e);e1=Math.max(e1,e);d0=Math.min(d0,d);d1=Math.max(d1,d);}
  const area=(e1-e0)*(d1-d0);if(area<best.area){const ec=(e0+e1)/2,dc=(d0+d1)/2,long=e1-e0>=d1-d0;
   const c:Pt=[ec*ux-dc*uz,ec*uz+dc*ux];best=long?{area,c,u:[ux,uz],L:(e1-e0)/2,W:(d1-d0)/2}:{area,c,u:[-uz,ux],L:(d1-d0)/2,W:(e1-e0)/2};}}
 return best;
}
const area=(r:readonly Pt[])=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;};
const pip=(x:number,z:number,p:readonly Pt[]):boolean=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const num=(v:string|undefined)=>{const n=v===undefined?NaN:parseFloat(v);return Number.isFinite(n)?n:undefined;};

export interface RoofInput {id:string;outer:Pt[];holes:Pt[][];height:number;minHeight:number;heightBasis:string;tags:Record<string,string>;kind:'building'|'part'}
/** The roof a block takes, given its base y. */
export function roofPlan(b:RoofInput,base:number):RoofPlan{
 const top=base+b.height,floor=base+b.minHeight,outer=cleanRing(b.outer),t=b.tags;
 const flat=(assumed:boolean):RoofPlan=>({shape:'flat',at:()=>top,eave:top,top,creases:[],assumed,chimneys:[],u:[1,0]});
 if(outer.length<3)return flat(false);
 const tagged=t['roof:shape'];let shape=tagged;
 const assumed=!tagged;
 if(!shape){
  const kind=t.building??t['building:part']??'yes';
  if(b.kind==='part'||(ROOF_ASSUMED.flatKinds as readonly string[]).includes(kind)||area(outer)>ROOF_ASSUMED.maxArea||b.height>ROOF_ASSUMED.maxHeight||b.height<5)return flat(true);
  shape='gabled';
 }
 const {c,u,L,W}=rectangleOf(outer),v:Pt=[-u[1],u[0]];
 const d=(x:number,z:number)=>(x-c[0])*v[0]+(z-c[1])*v[1],e=(x:number,z:number)=>(x-c[0])*u[0]+(z-c[1])*u[1];
 const slope=Math.tan(ROOF_ASSUMED.pitchDeg*Math.PI/180),tagRise=num(t['roof:height'])??(num(t['roof:levels'])!==undefined?num(t['roof:levels'])!*2.5:undefined);
 // the rise never takes more than half the wall
 const cap=(r:number)=>Math.max(0,Math.min(r,(top-floor)/2));
 if(shape==='flat'||W<1.5)return flat(assumed);
 if(shape==='pyramidal'||shape==='cone'||shape==='dome'||shape==='onion'){
  const rise=cap(tagRise??Math.min(W,L)*(shape==='dome'||shape==='onion'?.8:1));
  return {shape:shape==='dome'||shape==='onion'?'dome':'pyramid',at:()=>top-rise,eave:top-rise,top,creases:[],assumed,chimneys:[],u};
 }
 if(shape==='skillion'){
  const rise=cap(tagRise??ROOF_ASSUMED.skillionRise),eave=top-rise;
  return {shape:'planes',at:(x,z)=>eave+rise*(d(x,z)+W)/(2*W),eave,top,creases:[],assumed,chimneys:[],u};
 }
 const hipped=['hipped','mansard','half-hipped','pyramidal_hipped','side_hipped'].includes(shape)&&L>W*1.05;
 const rise=cap(tagRise??Math.min(ROOF_ASSUMED.maxRise,slope*W)),eave=top-rise;
 if(rise<.3)return flat(assumed);
 const s=tagRise!==undefined?rise/W:slope,w=W-rise/s; // w: half-width of the flat platform (0: a sharp ridge)
 const at=(x:number,z:number)=>{const dd=W-Math.abs(d(x,z));let h=Math.min(rise,s*dd);if(hipped)h=Math.min(h,s*(L-Math.abs(e(x,z))));return eave+Math.max(0,h);};
 const creases:Line[]=[],line=(n:Pt,o:number)=>creases.push({n,o:o+n[0]*c[0]+n[1]*c[1]});
 line(v,0);if(w>.01){line(v,w);line(v,-w);}
 if(hipped){const l=L-rise/s;line(u,0);if(l>.01){line(u,l);line(u,-l);}
  // the four hip lines: |d|-|e| = W-L, i.e. ±d ±e = W-L
  for(const sd of [1,-1])for(const se of [1,-1]){const n:Pt=[sd*v[0]-se*u[0],sd*v[1]-se*u[1]],k=Math.SQRT1_2;line([n[0]*k,n[1]*k],(W-L)*k);}
 }
 const kind=t.building??'yes',chimneys:{x:number;z:number;y:number}[]=[];
 if(b.kind==='building'&&CHIMNEY_KINDS.has(kind)){
  const ends=L-CHIMNEY.along,n=Math.max(1,Math.round(2*ends/CHIMNEY.spacing));
  for(let i=0;i<=n;i++){const ee=-ends+2*ends*i/n,x=c[0]+u[0]*ee,z=c[1]+u[1]*ee;
   if(pip(x,z,outer)&&!b.holes.some(h=>pip(x,z,h)))chimneys.push({x,z,y:at(x,z)});}
 }
 return {shape:'planes',at,eave,top,creases,assumed,chimneys,u};
}

/** Insert the points where each crease crosses the ring's edges, so a wall's top follows the roof exactly. */
export function withCreases(ring:readonly Pt[],creases:readonly Line[]):Pt[]{
 let r=cleanRing(ring);
 for(const {n,o}of creases){const out:Pt[]=[];
  for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],sa=a[0]*n[0]+a[1]*n[1]-o,sb=b[0]*n[0]+b[1]*n[1]-o;out.push(a);
   if(sa*sb<0){const t=sa/(sa-sb);if(t>1e-4&&t<1-1e-4)out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}}
  r=out;}
 return r;
}
/** Split a convex polygon by a line; returns the non-empty sides. */
function split(p:Pt[],{n,o}:Line):Pt[][]{
 const side=(q:Pt)=>q[0]*n[0]+q[1]*n[1]-o,a:Pt[]=[],b:Pt[]=[];
 for(let i=0;i<p.length;i++){const q=p[i],r=p[(i+1)%p.length],sq=side(q),sr=side(r);
  if(sq>=0)a.push(q);if(sq<=0)b.push(q);
  if(sq*sr<0){const t=sq/(sq-sr),m:Pt=[q[0]+(r[0]-q[0])*t,q[1]+(r[1]-q[1])*t];a.push(m);b.push(m);}}
 return [a,b].filter(x=>x.length>=3);
}
/** The roof surface: the footprint (less holes) cut along every crease, each convex piece lifted onto the plan's planes. */
export function roofSurface(batch:Batch,outer:readonly Pt[],holes:readonly (readonly Pt[])[],plan:RoofPlan):void{
 const rings=[cleanRing(outer),...holes.map(cleanRing)];if(rings[0].length<3)return;
 const points=rings.flat(),faces=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))));
 for(const f of faces){
  let pieces:Pt[][]=[f.map(i=>points[i])];
  for(const l of plan.creases)pieces=pieces.flatMap(p=>split(p,l));
  for(const p of pieces){const v=p.map((q):V3=>[q[0],plan.at(q[0],q[1]),q[1]]);for(let i=1;i+1<v.length;i++)batch.tri(v[0],v[i],v[i+1],[p[0],p[i],p[i+1]] as [Pt,Pt,Pt],[0,1,0]);}
 }
}
/** A pyramid or (dome) a stack of shrinking rings over the vertex centroid, from the eave to the top. */
export function roofPeak(batch:Batch,ring:readonly Pt[],plan:RoofPlan):void{
 const r=cleanRing(ring),c:Pt=[r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length],rise=plan.top-plan.eave;
 const steps=plan.shape==='dome'?[0,.45,.7,.87,.97,1]:[0,1];
 const ringAt=(k:number):V3[]=>{const s=plan.shape==='dome'?Math.cos(Math.asin(k)):1-k;return r.map(p=>[c[0]+(p[0]-c[0])*s,plan.eave+rise*k,c[1]+(p[1]-c[1])*s]);};
 for(let i=0;i+1<steps.length;i++){const lo=ringAt(steps[i]),hi=ringAt(steps[i+1]);
  for(let j=0;j<r.length;j++){const k=(j+1)%r.length,out:V3=[(r[j][0]+r[k][0])/2-c[0],.3,(r[j][1]+r[k][1])/2-c[1]];
   if(i+2===steps.length)batch.tri(lo[j],lo[k],hi[j],undefined,out);else batch.quadUV(lo[j],lo[k],hi[k],hi[j],undefined,out);}}
}
/** A chimney stack: a box (no floor) from the eave to CHIMNEY.above over the ridge, turned to the ridge. */
export function chimney(batch:Batch,at:{x:number;z:number;y:number},u:Pt,eave:number,color:Rgb):void{
 const v:Pt=[-u[1],u[0]],a=CHIMNEY.along/2,b=CHIMNEY.across/2,y0=eave,y1=at.y+CHIMNEY.above;
 const P=(su:number,sv:number,y:number):V3=>[at.x+u[0]*a*su+v[0]*b*sv,y,at.z+u[1]*a*su+v[1]*b*sv];
 const corners:[number,number][]=[[-1,-1],[1,-1],[1,1],[-1,1]];
 for(let i=0;i<4;i++){const [p,q]=[corners[i],corners[(i+1)%4]],mid:V3=[(u[0]*(p[0]+q[0])*a+v[0]*(p[1]+q[1])*b),0,(u[1]*(p[0]+q[0])*a+v[1]*(p[1]+q[1])*b)];
  const len=i%2?2*b:2*a;batch.poly([P(p[0],p[1],y0),P(q[0],q[1],y0),P(q[0],q[1],y1),P(p[0],p[1],y1)],[[0,0],[len,0],[len,y1-y0],[0,y1-y0]],{facing:mid,color});}
 batch.poly([P(-1,-1,y1),P(1,-1,y1),P(1,1,y1),P(-1,1,y1)],undefined,{facing:[0,1,0],color:[color[0]*.6,color[1]*.6,color[2]*.6]});
}
