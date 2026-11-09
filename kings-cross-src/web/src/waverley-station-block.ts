// W1 station: the central block (OSM way/225997712, the one hole in the roof relation/240040), which holds the booking hall and offices of
// 1896-1900 (HES LB30270: "two-storey" interior, nine-compartment ceiling, central cast-iron dome). The footprint is OSM (ODbL); the height
// is OSM's building:levels=2 at the data's ASSUMED 3 m a level (core/waverley-data.ts). The elevation is read off R-wv1-b3 (the block's
// sandstone flank by the cab road: a dark plinth, pilasters, a moulded cornice) and R-wv1-a3 (two storeys of windows, seen from the
// Scott Monument). Bay width, window sizes, plinth and cornice depths are ASSUMED, scaled from those photographs against the 6 m height.
// The hall and its dome are NOT drawn: no plan position or diameter is published (DIMENSIONS.md "Not found"; rubric gate 2).
import type {Pt} from '../../core/geo.ts';
import type {WaverleyArea} from '../../core/waverley-data.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {cleanRing,fillSurface} from './waverley-mesh.ts';

export const WAVERLEY_CENTRAL_BLOCK_ID='way/225997712';
export const WAVERLEY_BLOCK={
 /** Bays of about 4.2 m, pilaster to pilaster (ASSUMED, R-wv1-b3). Pilasters 0.6 m wide, 0.15 m proud. */
 bay:4.2,pilasterWidth:.6,pilasterDepth:.15,
 /** Plinth to 0.9 m, 0.08 m proud; string course at the first floor (3 m), 0.2 m high, 0.1 m proud (ASSUMED, R-wv1-b3). */
 plinth:.9,plinthDepth:.08,storey:3,stringHeight:.2,stringDepth:.1,
 /** Cornice: the top 0.45 m, 0.3 m proud (ASSUMED, R-wv1-b3). */
 cornice:.45,corniceDepth:.3,
 /** Windows 1.4 m wide, 1.8 m tall, the ground floor's sills just over the plinth (0.95 m), the upper floor's 0.4 m over the string course;
  * every third ground-floor bay a door 1.4 x 2.6 m (ASSUMED, R-wv1-a3). */
 windowWidth:1.4,windowHeight:1.8,groundSill:.95,upperSill:.4,doorHeight:2.6,doorEvery:3,
 /** A window stands this far off its wall, a door clear of the plinth in front of it; the material's polygon offset does the rest (materials.ts `sash`). */
 windowLift:.03,doorLift:.1,
} as const;
/** Sandstone (R-wv1-b3's warm buff), a darker plinth and the cornice's paler stone. ASSUMED shades. */
export const WAVERLEY_BLOCK_PAINT={wall:0xe2cfa6,plinth:0x9b8a6d,dressing:0xece0c4} as const;
export interface WaverleyBlockBatches {stone:Batch;windows:Batch;top:Batch}
/** The block's walls, dressings and windows from its footprint, standing on `base` (y) and `height` tall. */
export function centralBlockBatches(area:Pick<WaverleyArea,'outer'|'height'>,base:number):WaverleyBlockBatches{
 const B=WAVERLEY_BLOCK,stone=new Batch({colored:true}),windows=new Batch(),top=new Batch(),r=cleanRing(area.outer),h=area.height;
 const wall=rgb(WAVERLEY_BLOCK_PAINT.wall),plinth=rgb(WAVERLEY_BLOCK_PAINT.plinth),dressing=rgb(WAVERLEY_BLOCK_PAINT.dressing);
 let signed=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];signed+=p[0]*q[1]-q[0]*p[1];}
 const sink=base-.15,y=(v:number):number=>base+v;
 for(let i=0;i<r.length;i++){
  const a=r[i],b=r[(i+1)%r.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.5)continue;
  const d:Pt=[(b[0]-a[0])/len,(b[1]-a[1])/len],out:Pt=signed>0?[d[1],-d[0]]:[-d[1],d[0]],at=(s:number,off:number,yy:number):V3=>[a[0]+d[0]*s+out[0]*off,yy,a[1]+d[1]*s+out[1]*off];
  const rotY=Math.atan2(-d[1],d[0]);
  // The wall face itself, from the foundation to the top.
  stone.poly([at(0,0,sink),at(len,0,sink),at(len,0,y(h)),at(0,0,y(h))],[[0,0],[len,0],[len,h+.15],[0,h+.15]],{facing:[out[0],0,out[1]],color:wall});
  // Plinth, string course and cornice: bands along the whole face, proud of it (boxes long axis along d).
  const band=(y0:number,y1:number,depth:number,color:Rgb,extra=0):void=>{const c=at(len/2,depth/2-.05,(y0+y1)/2);stone.box(c,[len+2*extra,y1-y0,depth+.1],{rotY,color});};
  band(sink,y(B.plinth),B.plinthDepth,plinth);band(y(B.storey-B.stringHeight/2),y(B.storey+B.stringHeight/2),B.stringDepth,dressing);// The cornice stands 0.04 m over the block's flat top, so its top face is not coplanar with it.
  band(y(h-B.cornice),y(h+.04),B.corniceDepth,dressing,B.corniceDepth);
  // Bays: pilasters between them, a window per storey in each (a door instead on every third ground-floor bay).
  const n=Math.max(1,Math.round(len/B.bay)),w=len/n;
  for(let k=0;k<=n;k++){const s=Math.min(len-B.pilasterWidth/2,Math.max(B.pilasterWidth/2,k*w));stone.box(at(s,B.pilasterDepth/2-.05,(y(B.plinth)+y(h-B.cornice))/2),[B.pilasterWidth,h-B.cornice-B.plinth,B.pilasterDepth+.1],{rotY,color:dressing});}
  for(let k=0;k<n;k++){
   const s=(k+.5)*w;if(w<B.windowWidth+B.pilasterWidth+.2)continue;
   const door=k%B.doorEvery===1;
   for(const [y0,y1,lift]of [door?[0,B.doorHeight,B.doorLift]:[B.groundSill,B.groundSill+B.windowHeight,B.windowLift],[B.storey+B.upperSill,B.storey+B.upperSill+B.windowHeight,B.windowLift]]){
    if(y1>h-B.cornice-.1)continue;
    const s0=s-B.windowWidth/2,s1=s+B.windowWidth/2;
    windows.poly([at(s0,lift,y(y0)),at(s1,lift,y(y0)),at(s1,lift,y(y1)),at(s0,lift,y(y1))],[[0,0],[1.4,0],[1.4,2.6],[0,2.6]],{facing:[out[0],0,out[1]]});
   }
  }
 }
 fillSurface(top,r,[],()=>y(h));
 return {stone,windows,top};
}
