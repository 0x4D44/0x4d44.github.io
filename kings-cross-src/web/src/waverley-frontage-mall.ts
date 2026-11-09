// W2 frontage: Princes Mall (Waverley Market), OSM relation/1113940 (building=retail, layer -1; ODbL), its outline and six inner rings unchanged.
// The mall is sunk below Princes Street with its roof a public terrace at street level: the glazed roof, the lawn and the curved glass
// canopy over the Waverley Bridge entrance are in R-wv1-a3 (wv1-a3-roof-from-scott-monument-2015.jpg) and R-wv2-b3 (the canopy).
// ASSUMED: the terrace level (the unwarped DTM at the outline's northmost corner, on Princes Street), the extents of the glazed roof
// (the outline's north-east half) and of the lawn, the 6 m glazing module, the cladding tones and the canopy's 6 m reach and fall.
import type {Pt} from '../../core/geo.ts';
import type {Batch,Rgb,V3} from './materials.ts';
import {rgb} from './materials.ts';
import {fillSurface} from './waverley-mesh.ts';
import {ccw,obox,ringArea,unit,wallBox} from './waverley-frontage-mesh.ts';

export const MALL_COLOURS={cladding:0xa8a397,band:0x39434a,paving:0xb9b4aa,glass:0x9fb3ad,frame:0x55605f,lawn:0x5f7f3e,canopy:0xb8d0cc} as const;
const C=(h:number):Rgb=>rgb(h);
const inRing=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};

export interface MallInput {ring:Pt[];holes:Pt[][];roof:number;foot:number}
/** The mall: clad walls from the lowest ground to the terrace, a dark glazed band under the terrace edge, the terrace, rooflights, lawn and canopy. */
export function princesMall(b:Batch,input:MallInput){
 const {roof,foot}=input,outer=ccw(input.ring);
 // the outer walls only: the inner rings are city blocks standing in the terrace, which draw their own walls
 for(const r of [outer])for(let i=0;i<r.length;i++){
  const a=r[i],c=r[(i+1)%r.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<1e-6)continue;
  const n:V3=[(c[1]-a[1])/len,0,-(c[0]-a[0])/len];
  b.poly([[a[0],foot,a[1]],[c[0],foot,c[1]],[c[0],roof-2.6,c[1]],[a[0],roof-2.6,a[1]]],undefined,{normal:n,color:C(MALL_COLOURS.cladding)});
  b.poly([[a[0],roof-2.6,a[1]],[c[0],roof-2.6,c[1]],[c[0],roof-.6,c[1]],[a[0],roof-.6,a[1]]],undefined,{normal:n,color:C(MALL_COLOURS.band)});
  b.poly([[a[0],roof-.6,a[1]],[c[0],roof-.6,c[1]],[c[0],roof+1.0,c[1]],[a[0],roof+1.0,a[1]]],undefined,{normal:n,color:C(MALL_COLOURS.cladding)});// terrace balustrade wall
 }
 // the terrace, then the rooflights and the lawn standing on it
 const start=b.count,paving=C(MALL_COLOURS.paving);fillSurface(b,input.ring,input.holes,()=>roof);
 for(let i=start;i<b.count;i++)b.colors.splice(i*3,3,...paving);
 const xs=input.ring.map(p=>p[0]),zs=input.ring.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
 const usable=(x:number,z:number,m:number)=>[[0,0],[m,0],[-m,0],[0,m],[0,-m]].every(([dx,dz])=>inRing(x+dx,z+dz,input.ring)&&!input.holes.some(h=>inRing(x+dx,z+dz,h)));
 const lights:{x:number;z:number}[]=[];
 for(let x=x0+3;x<x1;x+=6)for(let z=z0+3;z<z1;z+=6){
  // the north-east half under glass (R-wv1-a3: the glazed roof beside the terrace); the lawn in the south-east corner
  const glazed=x-x0>(x1-x0)*.45&&z<(z0+z1)/2+8,lawn=!glazed&&x-x0>(x1-x0)*.55&&z>(z0+z1)/2+8;
  if(!(glazed||lawn)||!usable(x,z,3.4))continue;
  if(glazed){obox(b,[x,roof+.35,z],[1,0,0],[0,1,0],[0,0,1],[2.85,.35,2.85],C(MALL_COLOURS.glass));obox(b,[x,roof+.36,z],[1,0,0],[0,1,0],[0,0,1],[.08,.36,2.9],C(MALL_COLOURS.frame));lights.push({x,z});}
  else obox(b,[x,roof+.06,z],[1,0,0],[0,1,0],[0,0,1],[3,.06,3],C(MALL_COLOURS.lawn));
 }
 // the curved glass canopy over the Waverley Bridge entrance: the outline's westward notch (R-wv2-b3)
 const r=input.ring;let k=0;for(let i=1;i<r.length;i++)if(Math.hypot(r[i][0]+82.4,r[i][1]+58.6)<Math.hypot(r[k][0]+82.4,r[k][1]+58.6))k=i;
 const a=r[k],c=r[(k+1)%r.length],m:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2],along=unit([c[0]-a[0],0,c[1]-a[1]]),out:V3=ringArea(r)>0?[along[2],0,-along[0]]:[-along[2],0,along[0]];
 for(let f=-4;f<=4;f++){const s=f*1.1,base:Pt=[m[0]+along[0]*s,m[1]+along[2]*s];
  let prev:Pt=base,py=roof-2.4;
  for(let j=1;j<=6;j++){const d=j,y=roof-2.4-.04*d*d,p:Pt=[base[0]+out[0]*d,base[1]+out[2]*d];wallBox(b,prev,p,Math.min(py,y)-.03,Math.max(py,y)+.03,.5,C(MALL_COLOURS.canopy));prev=p;py=y;}
 }
 return {lights,roof};
}
