// HES LB30270: low ridge-and-furrow, laminated glazing in aluminium cassettes,
// parallel lattice girders; https://portal.historicenvironment.scot/designation/LB30270
// Approximately N–S ridges transverse to the tracks are INFERRED from the public
// North Bridge photo (Liberaler Humanist, 2015, CC BY-SA3):
// https://commons.wikimedia.org/wiki/File:Edinburgh_Waverley_Station_seen_from_North_Bridge,_Perspective_1,_07.08.2015.jpg
// ASSUMED 12m bay pitch, 8m gutter above the schematic rail datum, 2.4m symmetric
// rise, phase0, and 65x70mm runners. These are not measured roof dimensions.
// Reported 12.8m statutory height LIMIT (not actual height): Rail Engineer 7Jul2011,
// https://www.railengineer.co.uk/edinburgh-waverleys-new-roof-installed/
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {Batch} from './materials.ts';
import type {V3} from './materials.ts';
export interface RidgeRoofProfile {gutter:number;rise:number;pitch:number;phase:number}
export const WAVERLEY_ROOF_PROFILE={gutter:8,rise:2.4,pitch:12,phase:0} as const;
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
/** Split triangulated OSM faces at each gutter/ridge. Clipping triangles retains
 * concavities and holes exactly; moving only original OSM corners would bridge bays. */
export function ridgeRoofBatches(outer:readonly Pt[],holes:readonly (readonly Pt[])[],profile:RidgeRoofProfile=WAVERLEY_ROOF_PROFILE):{glass:Batch;ribs:Batch}{
 if(!Number.isFinite(profile.pitch)||profile.pitch<=0||![profile.gutter,profile.rise,profile.phase].every(Number.isFinite))throw Error('Invalid Waverley roof profile');
 const glass=new Batch(),ribs=new Batch(),rings=[clean(outer),...holes.map(clean)],points=rings.flat(),half=profile.pitch/2;
 if(rings[0].length<3)return {glass,ribs};
 const height=(x:number):number=>{const t=((x-profile.phase)%profile.pitch+profile.pitch)%profile.pitch;return profile.gutter+profile.rise*(1-Math.abs(t-half)/half);};
 const faces=THREE.ShapeUtils.triangulateShape(rings[0].map(p=>new THREE.Vector2(...p)),rings.slice(1).map(r=>r.map(p=>new THREE.Vector2(...p))));
 for(const face of faces){
  const triangle=face.map(i=>points[i]),lo=Math.min(...triangle.map(p=>p[0])),hi=Math.max(...triangle.map(p=>p[0]));
  for(let k=Math.floor((lo-profile.phase)/half);k<=Math.floor((hi-profile.phase)/half);k++){
   const x0=profile.phase+k*half,poly=clip(clip(triangle,x0,true),x0+half,false);
   for(let i=1;i+1<poly.length;i++){
    const pts=[poly[0],poly[i],poly[i+1]] as [Pt,Pt,Pt];
    glass.tri(...pts.map(p=>[p[0],height(p[0]),p[1]] as V3) as [V3,V3,V3],pts,[0,1,0]);
   }
  }
 }
 const lo=Math.min(...rings[0].map(p=>p[0])),hi=Math.max(...rings[0].map(p=>p[0]));
 // Ridge and gutter runners terminate at the footprint/hole, rather than bridging
 // the central building. Fine cassette bars remain in the existing KX texture.
 for(let k=Math.ceil((lo-profile.phase)/half);profile.phase+k*half<hi;k++){
  const x=profile.phase+k*half,zs:number[]=[];
  for(const ring of rings)for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   if(a[0]===b[0]){if(Math.abs(x-a[0])<1e-7)zs.push(a[1],b[1]);continue;}
   if(x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0]))zs.push(a[1]+(b[1]-a[1])*(x-a[0])/(b[0]-a[0]));
  }
  const cuts=[...new Set(zs)].sort((a,b)=>a-b);
  for(let i=1;i<cuts.length;i++){
   const z0=cuts[i-1],z1=cuts[i],mid:Pt=[x,(z0+z1)/2];
   if(z1-z0>.16&&inside(mid,rings[0])&&!rings.slice(1).some(r=>inside(mid,r)))ribs.box([x,height(x)-.035,(z0+z1)/2],[.065,.07,z1-z0-.08]);
  }
 }
 return {glass,ribs};
}
