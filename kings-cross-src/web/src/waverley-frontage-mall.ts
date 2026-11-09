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

export const MALL_COLOURS={cladding:0xa8a397,band:0x39434a,paving:0xb9b4aa,glass:0xa9c0bb,glassShade:0x8ea7a3,frame:0x55605f,lawn:0x67913f,kerb:0x8c877d,canopy:0xb8d0cc} as const;
/** The glazed roof: a hipped glass pyramid over the largest clear rectangle of the glazed area (R-wv1-a3). ASSUMED: 0.6 m kerb, 3.2 m rise, 1.5 m bars. */
export const MALL_ROOF={kerb:.6,rise:3.2,bar:1.5,cell:6} as const;
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
 const lights:{x:number;z:number}[]=[],G=MALL_ROOF.cell,nx=Math.floor((x1-x0-3)/G)+1,nz=Math.floor((z1-z0-3)/G)+1,glass:boolean[][]=[];
 for(let i=0;i<nx;i++){glass.push([]);for(let j=0;j<nz;j++){const x=x0+3+i*G,z=z0+3+j*G;
  // the north-east half under glass (R-wv1-a3: the glazed roof beside the terrace); the lawn in the south-east corner
  const glazed=x-x0>(x1-x0)*.45&&z<(z0+z1)/2+8,lawn=!glazed&&x-x0>(x1-x0)*.55&&z>(z0+z1)/2+8,ok=usable(x,z,3.4);
  glass[i].push(glazed&&ok);
  if(lawn&&ok)obox(b,[x,roof+.06,z],[1,0,0],[0,1,0],[0,0,1],[3,.06,3],C(MALL_COLOURS.lawn));
 }}
 // the largest all-glazed rectangle of cells carries the pyramid
 let best={a:0,i0:0,i1:-1,j0:0,j1:-1};
 for(let i0=0;i0<nx;i0++)for(let i1=i0;i1<nx;i1++)for(let j0=0;j0<nz;j0++)for(let j1=j0;j1<nz;j1++){
  const a=(i1-i0+1)*(j1-j0+1);if(a<=best.a)continue;let all=true;
  for(let i=i0;all&&i<=i1;i++)for(let j=j0;all&&j<=j1;j++)all=glass[i][j];if(all)best={a,i0,i1,j0,j1};}
 let pyramid:{x0:number;x1:number;z0:number;z1:number;top:number}|null=null;
 if(best.a){
  const R=MALL_ROOF,ax0=x0+3+best.i0*G-2.85,ax1=x0+3+best.i1*G+2.85,az0=z0+3+best.j0*G-2.85,az1=z0+3+best.j1*G+2.85;
  for(let i=best.i0;i<=best.i1;i++)for(let j=best.j0;j<=best.j1;j++)lights.push({x:x0+3+i*G,z:z0+3+j*G});
  const e=roof+R.kerb,top=e+R.rise,h=Math.min(ax1-ax0,az1-az0)/2,cx=(ax0+ax1)/2,cz=(az0+az1)/2;
  // the kerb: a framed upstand round the rectangle
  for(const [a,c] of [[[ax0,az0],[ax1,az0]],[[ax1,az0],[ax1,az1]],[[ax1,az1],[ax0,az1]],[[ax0,az1],[ax0,az0]]] as [Pt,Pt][])wallBox(b,a,c,roof,e,.15,C(MALL_COLOURS.frame),.15);
  // hipped: a ridge along the longer side; four sloped faces, the two hips in the shaded glass
  const rx=ax1-ax0>=az1-az0,r0:V3=rx?[ax0+h,top,cz]:[cx,top,az0+h],r1:V3=rx?[ax1-h,top,cz]:[cx,top,az1-h];
  const E=(x:number,z:number):V3=>[x,e,z],c00=E(ax0,az0),c10=E(ax1,az0),c11=E(ax1,az1),c01=E(ax0,az1);
  const faces:[V3[],V3,number][]=rx?[[[c00,c10,r1,r0],[0,h,-R.rise],MALL_COLOURS.glass],[[c11,c01,r0,r1],[0,h,R.rise],MALL_COLOURS.glass],[[c10,c11,r1],[R.rise,h,0],MALL_COLOURS.glassShade],[[c01,c00,r0],[-R.rise,h,0],MALL_COLOURS.glassShade]]
   :[[[c01,c00,r0,r1],[-R.rise,h,0],MALL_COLOURS.glass],[[c10,c11,r1,r0],[R.rise,h,0],MALL_COLOURS.glass],[[c00,c10,r0],[0,h,-R.rise],MALL_COLOURS.glassShade],[[c11,c01,r1],[0,h,R.rise],MALL_COLOURS.glassShade]];
  for(const [q,n,col] of faces)b.poly(q,undefined,{facing:unit(n),color:C(col)});
  // glazing bars down the slopes every 1.5 m, and the ridge and hips in the frame colour
  const bar=(p:V3,q:V3)=>{const d=unit([q[0]-p[0],q[1]-p[1],q[2]-p[2]]),len=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]),side=unit([d[2],0,-d[0]]),upn=unit([side[1]*d[2]-side[2]*d[1],side[2]*d[0]-side[0]*d[2],side[0]*d[1]-side[1]*d[0]]);
   obox(b,[(p[0]+q[0])/2+upn[0]*.04,(p[1]+q[1])/2+Math.abs(upn[1])*.04,(p[2]+q[2])/2+upn[2]*.04],d,upn[1]<0?[-upn[0],-upn[1],-upn[2]]:upn,side,[len/2,.04,.05],C(MALL_COLOURS.frame));};
  bar(r0,r1);for(const [c,r] of [[c00,r0],[c01,r0],[c10,r1],[c11,r1]] as [V3,V3][])bar(c,r);
  const along=(a:V3,c:V3,ra:V3,rc:V3)=>{const L=Math.hypot(c[0]-a[0],c[2]-a[2]);for(let s=R.bar;s<L-.3;s+=R.bar){const t=s/L,p:V3=[a[0]+(c[0]-a[0])*t,e,a[2]+(c[2]-a[2])*t];
   const q:V3=[Math.min(Math.max(p[0],Math.min(ra[0],rc[0])),Math.max(ra[0],rc[0])),top,Math.min(Math.max(p[2],Math.min(ra[2],rc[2])),Math.max(ra[2],rc[2]))];
   // on a hip-end face the bar runs to the ridge end; on a long face, straight up the slope
   bar(p,rx?[q[0],top,(ra[2])]:[ra[0],top,q[2]]);}};
  if(rx){along(c00,c10,r0,r1);along(c01,c11,r0,r1);}else{along(c00,c01,r0,r1);along(c10,c11,r0,r1);}
  pyramid={x0:ax0,x1:ax1,z0:az0,z1:az1,top};
 }
 // the curved glass canopy over the Waverley Bridge entrance: the outline's westward notch (R-wv2-b3)
 const r=input.ring;let k=0;for(let i=1;i<r.length;i++)if(Math.hypot(r[i][0]+82.4,r[i][1]+58.6)<Math.hypot(r[k][0]+82.4,r[k][1]+58.6))k=i;
 const a=r[k],c=r[(k+1)%r.length],m:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2],along=unit([c[0]-a[0],0,c[1]-a[1]]),out:V3=ringArea(r)>0?[along[2],0,-along[0]]:[-along[2],0,along[0]];
 for(let f=-4;f<=4;f++){const s=f*1.1,base:Pt=[m[0]+along[0]*s,m[1]+along[2]*s];
  let prev:Pt=base,py=roof-2.4;
  for(let j=1;j<=6;j++){const d=j,y=roof-2.4-.04*d*d,p:Pt=[base[0]+out[0]*d,base[1]+out[2]*d];wallBox(b,prev,p,Math.min(py,y)-.03,Math.max(py,y)+.03,.5,C(MALL_COLOURS.canopy));prev=p;py=y;}
 }
 return {lights,roof,pyramid};
}
