// P2 frontage: the station's street front (the north side of OSM way/4064272, facing the car park and the Station Hotel), the forecourt
// (OSM car parks, roads and paths from data/perth-frontage.json, ODbL), and the rail underbridge over King's Place (OSM way/1260630142).
// The entrance is OSM node/561381370 (x -3, z -35). Heights and the street furniture's spacing are ASSUMED, read from R-pt2-a
// (geograph 6872924, JThomas 2021, CC BY-SA 2.0), taken from the point pt-station-frontage uses, at about 19.5 px/m (its 2.2 m doors).
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import * as THREE from 'three';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {cleanRing} from './waverley-mesh.ts';
import {prism,wallBox} from './waverley-frontage-mesh.ts';

/** The frontage's plan window in the Perth frame (x east, z south): the car park, the entrance, the hotel and King's Place. */
export const FRONTAGE_WINDOW={x0:-80,x1:125,z0:-175,z1:-20} as const;
/** The entrance (OSM node/561381370 entrance=yes) in the Perth frame. */
export const PERTH_ENTRANCE:Pt=[-3.03,-34.98];
/** ASSUMED from R-pt2-a: the single-storey street walls, the entrance pavilion (its blue-clad upper storey over a glazed, recessed ground
 *  floor on four posts), the pavement and its bollards. */
export const STREET_LEVELS={wall:4.3,coping:.25,flatDeep:9,slateBack:11,slateTop:8,gableBack:2,gableDeep:12,gableEaves:4.8,gableApex:8.2,pavilionWidth:10,pavilionFloor:3.2,pavilionTop:6.4,pavilionOut:1.2,pavilionDeep:7,pavement:4.2,kerb:.12,bollard:1,bollardPitch:2.6} as const;
/** ASSUMED carriageway widths (m) by OSM highway class; no widths are mapped here. */
export const ROAD_WIDTHS:Readonly<Record<string,number>>={primary:9,secondary:8,tertiary:7,residential:6,unclassified:6,service:5,parking_aisle:6,footway:2.4,pedestrian:4,path:2,cycleway:2.5,steps:2};
export const STREET_COLOURS={felt:0x56585b,sandstone:0x9b8b7c,slate:0x4b5059,buff:0xc4b393,coping:0xd6ccb4,navy:0x3a62c4,fascia:0x2c3036,lead:0x5b6066,glass:0x14191e,lantern:0x5d6f7c,shrub:0x4f6b34,frame:0x8e9398,sign:0xeeeeea,bollard:0x1d1e20,yellow:0xd8b62a,planter:0x2f5d9a,column:0xb9c2b8,asphalt:0x4d4f52,carpark:0x3c3e41,block:0x6f6863,paving:0x6f6863,footway:0x9a9389,kerb:0xb9b3a8,paint:0xe9e9e3} as const;

export interface FrontageFile {parking:{id:string;ring:number[][]}[];roads:{id:string;highway:string;service?:string;surface?:string;path:number[][]}[];bridge:{id:string;ring:number[][]}}
type Ground=Pick<Terrain,'heightAt'|'rangeUnder'>;
const inRing=([x,z]:Pt,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const ringOf=(r:number[][]):Pt[]=>r.map(p=>[p[0],p[1]]);

/** A flat area draped on the drawn ground `lift` above it: the polygon triangulated, then split until no edge is over 3 m. */
export function drape(b:Batch,ring:readonly Pt[],ground:Ground,lift:number,color:Rgb,mottle=0,colorAt?:(p:Pt)=>Rgb):void{
 const r=cleanRing(ring),y=(p:Pt)=>ground.heightAt(...p)+lift;let seed=7;
 const tint=(at?:Pt):Rgb=>{const base=at&&colorAt?colorAt(at):color;if(!mottle)return base;seed=(seed*16807)%2147483647;const k=1+(seed/2147483647-.5)*2*mottle;return [base[0]*k,base[1]*k,base[2]*k] as Rgb;};
 const put=(a:Pt,c:Pt,d:Pt,depth:number):void=>{
  const ab=Math.hypot(c[0]-a[0],c[1]-a[1]),bc=Math.hypot(d[0]-c[0],d[1]-c[1]),ca=Math.hypot(a[0]-d[0],a[1]-d[1]),m=Math.max(ab,bc,ca);
  if(m<=3||depth>10){if(Math.abs((c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0]))>1e-9)b.poly([[a[0],y(a),a[1]],[c[0],y(c),c[1]],[d[0],y(d),d[1]]],undefined,{facing:[0,1,0],color:tint([(a[0]+c[0]+d[0])/3,(a[1]+c[1]+d[1])/3])});return;}
  if(m===ab){const q:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2];put(a,q,d,depth+1);put(q,c,d,depth+1);}
  else if(m===bc){const q:Pt=[(c[0]+d[0])/2,(c[1]+d[1])/2];put(a,c,q,depth+1);put(a,q,d,depth+1);}
  else {const q:Pt=[(d[0]+a[0])/2,(d[1]+a[1])/2];put(a,c,q,depth+1);put(q,c,d,depth+1);}
 };
 for(const t of THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]))put(r[t[0]],r[t[1]],r[t[2]],0);
}
/** A strip `half` either side of a polyline, draped `lift` above the ground; segments whose midpoint `skip` refuses are left out. */
export function strip(b:Batch,path:readonly Pt[],half:number,ground:Ground,lift:number,color:Rgb,skip:(p:Pt)=>boolean):void{
 const pts:Pt[]=[];
 for(let i=0;i+1<path.length;i++){const a=path[i],c=path[i+1],n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/3));for(let k=0;k<n;k++)pts.push([a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n]);}
 pts.push(path.at(-1)!);
 const off=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],c=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;return [-(c[1]-a[1])/l*half,(c[0]-a[0])/l*half] as Pt;});
 for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1];if(skip([(a[0]+c[0])/2,(a[1]+c[1])/2]))continue;
  const q=[[a[0]+off[i][0],a[1]+off[i][1]],[c[0]+off[i+1][0],c[1]+off[i+1][1]],[c[0]-off[i+1][0],c[1]-off[i+1][1]],[a[0]-off[i][0],a[1]-off[i][1]]] as Pt[];
  b.poly(q.map(p=>[p[0],ground.heightAt(...p)+lift,p[1]] as V3),undefined,{facing:[0,1,0],color});}
}

export interface StreetBatches {front:Batch;glass:Batch;flat:Batch;paint:Batch}

/** The forecourt: the mapped car parks, the roads and paths round the station front and the hotel, white bay lines along the mapped
 *  parking aisles (2.5 m bays, 4.8 m deep, ASSUMED), and the zebra crossing at the entrance (R-pt2-a). Nothing is drawn inside the
 *  station outline or the hotel. */
export function forecourt(b:StreetBatches,file:FrontageFile,ground:Ground,keepOut:readonly (readonly Pt[])[],leave:(p:Pt)=>boolean=()=>false):void{
 const C=STREET_COLOURS,W=FRONTAGE_WINDOW,out=(p:Pt)=>p[0]<W.x0||p[0]>W.x1||p[1]<W.z0||p[1]>W.z1||keepOut.some(r=>inRing(p,r))||leave(p);
 const paved=file.roads.find(r=>r.id==='way/44356824'),stationSide=(q:Pt):boolean=>{if(!paved)return false;
  let best=Infinity,side=0;for(let i=0;i+1<paved.path.length;i++){const a=paved.path[i],c=paved.path[i+1],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dz);
   if(d<best){best=d;side=Math.sign(dx*(q[1]-a[1])-dz*(q[0]-a[0]));}}
  const a=paved.path[0],c=paved.path[1],e=Math.sign((c[0]-a[0])*(PERTH_ENTRANCE[1]-a[1])-(c[1]-a[1])*(PERTH_ENTRANCE[0]-a[0]));return side===e;};
 for(const p of file.parking)drape(b.flat,ringOf(p.ring),ground,.05,rgb(C.carpark),.05,q=>rgb(stationSide(q)?C.block:C.carpark));
 const carriage=file.roads.filter(r=>!['footway','pedestrian','path','cycleway','steps'].includes(r.highway));
 const onCarriage=(p:Pt)=>file.parking.some(q=>inRing(p,ringOf(q.ring)))||carriage.some(r=>{const h=(ROAD_WIDTHS[r.service==='parking_aisle'?'parking_aisle':r.highway]??4)/2;
  for(let i=0;i+1<r.path.length;i++){const a=r.path[i],c=r.path[i+1],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
   if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)<h)return true;}return false;});
 for(const r of file.roads){
  const kind=r.service==='parking_aisle'?'parking_aisle':r.highway,half=(ROAD_WIDTHS[kind]??4)/2;
  const foot=['footway','pedestrian','path','cycleway','steps'].includes(r.highway);
  const byEntrance=!foot&&r.path.some(q=>Math.hypot(q[0]-PERTH_ENTRANCE[0],q[1]-PERTH_ENTRANCE[1])<25)&&r.service!=='parking_aisle';
  const color=rgb(foot?C.footway:r.surface==='paving_stones'||byEntrance?C.paving:C.asphalt);
  if(byEntrance){const pts=ringOf(r.path);
   for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]);for(let x=1;x+1<l;){const p0:Pt=[a[0]+(c[0]-a[0])*x/l,a[1]+(c[1]-a[1])*x/l],p1:Pt=[a[0]+(c[0]-a[0])*(x+1.5)/l,a[1]+(c[1]-a[1])*(x+1.5)/l];
    if(!out(p0)&&!out(p1))strip(b.paint,[p0,p1],.06,ground,.12,rgb(C.paint),()=>false);x+=4.5;}}
   for(const [e,f2] of [[pts[0],pts[1]],[pts.at(-1)!,pts.at(-2)!]] as const){if(out(e))continue;const l=Math.hypot(f2[0]-e[0],f2[1]-e[1])||1,t2:Pt=[(f2[0]-e[0])/l,(f2[1]-e[1])/l],n2:Pt=[-t2[1],t2[0]];
    for(const k of [1.2,1.6])for(let o=-half+.2;o<half-.4;o+=1){const c0:Pt=[e[0]+t2[0]*k+n2[0]*o,e[1]+t2[1]*k+n2[1]*o],c1:Pt=[c0[0]+n2[0]*.6,c0[1]+n2[1]*.6];strip(b.paint,[c0,c1],.1,ground,.12,rgb(C.paint),()=>false);}}}
  strip(b.flat,ringOf(r.path),half,ground,foot?.11:kind==='parking_aisle'?.07:.08,color,foot?(p=>out(p)||onCarriage(p)):out);
  if(kind==='parking_aisle'){// three lamp columns along the aisle's edge (R-pt2-b), 8 m, ASSUMED
   const [a0,c0]=[r.path[0],r.path.at(-1)!],la=Math.hypot(c0[0]-a0[0],c0[1]-a0[1]);
   for(const f of [.2,.5,.8]){const q:Pt=[a0[0]+(c0[0]-a0[0])*f,a0[1]+(c0[1]-a0[1])*f],nn:Pt=[-(c0[1]-a0[1])/la,(c0[0]-a0[0])/la],lp:Pt=[q[0]+nn[0]*(half+5.2),q[1]+nn[1]*(half+5.2)];
    if(out(lp))continue;const y=ground.heightAt(...lp);prism(b.front,lp[0],lp[1],.09,y,y+8,8,rgb(C.column));
    const arm:Pt=[lp[0]-nn[0]*1.4,lp[1]-nn[1]*1.4];wallBox(b.front,lp,arm,y+7.85,y+8,.05,rgb(C.column));wallBox(b.front,arm,[arm[0]-nn[0]*.5,arm[1]-nn[1]*.5],y+7.8,y+7.95,.12,rgb(C.bollard));}
  }
  if(kind==='parking_aisle'){// bay lines both sides of the aisle, perpendicular to it
   const [a,c]=[r.path[0],r.path.at(-1)!],l=Math.hypot(c[0]-a[0],c[1]-a[1]),t:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l],n:Pt=[-t[1],t[0]];
   for(let s=1.25;s<l;s+=2.5)for(const side of [-1,1]){const p0:Pt=[a[0]+t[0]*s+n[0]*side*half,a[1]+t[1]*s+n[1]*side*half],p1:Pt=[p0[0]+n[0]*side*4.8,p0[1]+n[1]*side*4.8];
    if(out(p1)||!file.parking.some(q=>inRing(p1,ringOf(q.ring))))continue;
    strip(b.paint,[p0,p1],.075,ground,.1,rgb(C.paint),()=>false);}
  }
 }
}

/** The station's street front: the outline's north edges between the hotel corner and the east return, single-storey buff walls with a
 *  coping, the entrance pavilion centred on the mapped entrance, its glazing, the pavement with bollards and planters, and the crossing. */
export function stationFront(b:StreetBatches,station:readonly Pt[],ground:Ground):{chain:Pt[];P:number}{
 const S=STREET_LEVELS,C=STREET_COLOURS,ring=cleanRing(station);
 const near=(p:Pt)=>{let k=0;for(let i=1;i<ring.length;i++)if(Math.hypot(ring[i][0]-p[0],ring[i][1]-p[1])<Math.hypot(ring[k][0]-p[0],ring[k][1]-p[1]))k=i;
  if(Math.hypot(ring[k][0]-p[0],ring[k][1]-p[1])>1.5)throw Error(`station outline: no vertex near ${p}`);return k;};
 // the chain of OSM vertices from the hotel corner (-45,-84) to the east return's end (17.4,-22.4), whichever way the ring runs
 const i0=near([-45,-84]),i1=near([17.4,-22.4]),fwd:Pt[]=[],back:Pt[]=[];
 for(let i=i0;;i=(i+1)%ring.length){fwd.push(ring[i]);if(i===i1)break;}
 for(let i=i0;;i=(i-1+ring.length)%ring.length){back.push(ring[i]);if(i===i1)break;}
 const chain=fwd.length<back.length?fwd:back,P=ground.heightAt(...PERTH_ENTRANCE);
 // the station lies to the right of the chain walked from the hotel corner when its outward side is to the left: pick by the entrance's side
 const outward=(a:Pt,c:Pt):Pt=>{const l=Math.hypot(c[0]-a[0],c[1]-a[1]),n:Pt=[(c[1]-a[1])/l,-(c[0]-a[0])/l],m:Pt=[(a[0]+c[0])/2+n[0]*.5,(a[1]+c[1])/2+n[1]*.5];return inRing(m,ring)?[-n[0],-n[1]]:n;};
 const foot=ground.rangeUnder(chain,2).min-.15;
 for(let i=0;i+1<chain.length;i++){const a=chain[i],c=chain[i+1],n=outward(a,c);
  b.front.poly([[a[0],foot,a[1]],[c[0],foot,c[1]],[c[0],P+S.wall,c[1]],[a[0],P+S.wall,a[1]]],undefined,{facing:[n[0],0,n[1]],color:rgb(C.buff)});
  const ca:Pt=[a[0]+n[0]*.1,a[1]+n[1]*.1],cc:Pt=[c[0]+n[0]*.1,c[1]+n[1]*.1];
  wallBox(b.front,[(a[0]+ca[0])/2,(a[1]+ca[1])/2],[(c[0]+cc[0])/2,(c[1]+cc[1])/2],P+S.wall,P+S.wall+S.coping,.25,rgb(C.coping),.12);
 }
 // the front edge holding the entrance: the pavilion, its posts and glazing, the shop and booking-hall glazing either side (R-pt2-a)
 let k=0,best=Infinity;for(let i=0;i+1<chain.length;i++){const a=chain[i],c=chain[i+1],l2=(c[0]-a[0])**2+(c[1]-a[1])**2,t=Math.max(0,Math.min(1,((PERTH_ENTRANCE[0]-a[0])*(c[0]-a[0])+(PERTH_ENTRANCE[1]-a[1])*(c[1]-a[1]))/l2));
  const d=Math.hypot(a[0]+(c[0]-a[0])*t-PERTH_ENTRANCE[0],a[1]+(c[1]-a[1])*t-PERTH_ENTRANCE[1]);if(d<best){best=d;k=i;}}
 const a=chain[k],c=chain[k+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),t:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l],n=outward(a,c);
 const sE=(PERTH_ENTRANCE[0]-a[0])*t[0]+(PERTH_ENTRANCE[1]-a[1])*t[1];
 const at=(s:number,o:number):Pt=>[a[0]+t[0]*s+n[0]*o,a[1]+t[1]*s+n[1]*o];
 const box=(s0:number,s1:number,o0:number,o1:number,y0:number,y1:number,color:number,batch=b.front)=>{const p=at(s0,(o0+o1)/2),q=at(s1,(o0+o1)/2);wallBox(batch,p,q,P+y0,P+y1,(o1-o0)/2,rgb(color));};
 const pane=(s0:number,s1:number,y0:number,y1:number,o=.04,color:number=C.glass)=>{const p=at(s0,o),q=at(s1,o);
  b.glass.poly([[p[0],P+y0,p[1]],[q[0],P+y0,q[1]],[q[0],P+y1,q[1]],[p[0],P+y1,p[1]]],undefined,{facing:[n[0],0,n[1]],color:rgb(color)});};
 const w=S.pavilionWidth,s0=sE-w/2,s1=sE+w/2;
 const bandLo=S.pavilionFloor+1.1,bandHi=S.pavilionTop-1;// ASSUMED from R-pt2-a: a 1.1 m lower band, a 1.9 m window strip, a 1 m upper band
 box(s0,s1,-S.pavilionDeep,S.pavilionOut,S.pavilionFloor,bandLo,C.navy);box(s0,s1,-S.pavilionDeep,S.pavilionOut,bandHi,S.pavilionTop,C.navy);
 box(s0+.05,s1-.05,-S.pavilionDeep,S.pavilionOut-.25,bandLo,bandHi,C.glass,b.glass);// the window strip, set back 0.25 m
 for(let k=0;k<=12;k++){const s=s0+.1+k*(w-.2)/12;box(s-.05,s+.05,S.pavilionOut-.3,S.pavilionOut-.18,bandLo,bandHi,C.frame);}// its mullions
 pane(sE-2,sE+2,S.pavilionTop-.05,S.pavilionTop+.55,S.pavilionOut-.1,C.sign);// the blank sign panel on its parapet (no lettering drawn)
 for(const s of [s0+.3,sE-1.7,sE+1.7,s1-.3])box(s-.18,s+.18,S.pavilionOut-.5,S.pavilionOut-.14,0,S.pavilionFloor,C.navy);// four posts
 pane(s0+.2,s1-.2,.05,S.pavilionFloor-.1);// the recessed glazed entrance
 // east of the entrance (R-pt2-a, left): a shop front - dark glazing in a blue frame with a glazed door, a blank fascia over it (no
 // lettering drawn) - and a notice case. Sizes ASSUMED from R-pt2-a at about 19.5 px/m.
 pane(s1+1.2,s1+5.4,.25,2.75,.03,C.navy);pane(s1+1.3,s1+5.3,.35,2.65,.06);
 for(const s of [s1+2.6,s1+3.6])box(s-.04,s+.04,.04,.12,.35,2.65,C.navy);// the door's frame
 box(s1+1.1,s1+5.5,0,.18,2.8,3.3,C.fascia);
 pane(s1+5.9,s1+7.1,.4,2.4,.04,C.frame);
 // west of the entrance (R-pt2-a, right): the glazed lean-to bay, blue-framed and mullioned, 2.2 m deep, its roof falling from 3.3 m at
 // the wall to 2.7 m at its front (ASSUMED), on a 0.35 m buff upstand
 {const b0=s0-7.6,b1=s0-1.2,dp=2.2,hb=3.3,hf=2.7,k=Math.round((b1-b0)/1.1);
  box(b0,b1,0,dp,0,.35,C.buff);
  const glassQuad=(p:Pt,q:Pt,y0:number,y1p:number,y1q:number,face:Pt)=>b.glass.poly([[p[0],P+y0,p[1]],[q[0],P+y0,q[1]],[q[0],P+y1q,q[1]],[p[0],P+y1p,p[1]]],undefined,{facing:[face[0],0,face[1]],color:rgb(C.glass)});
  glassQuad(at(b0,dp),at(b1,dp),.35,hf,hf,n);
  for(const [x,sg] of [[b0,-1],[b1,1]] as const)glassQuad(at(x,0),at(x,dp),.35,hb,hf,[t[0]*sg,t[1]*sg]);
  for(let i=0;i<=k;i++){const x=b0+(b1-b0)*i/k;box(x-.05,x+.05,dp-.06,dp+.04,.35,hf,C.navy);}
  box(b0,b1,dp-.06,dp+.04,hf-.12,hf,C.navy);box(b0,b1,dp-.06,dp+.04,1.1,1.18,C.navy);
  const r0=at(b0-.1,0),r1=at(b1+.1,0),r2=at(b1+.1,dp+.15),r3=at(b0-.1,dp+.15);
  b.front.poly([[r0[0],P+hb,r0[1]],[r1[0],P+hb,r1[1]],[r2[0],P+hf-.05,r2[1]],[r3[0],P+hf-.05,r3[1]]],undefined,{facing:[n[0]*.3,1,n[1]*.3],color:rgb(C.lead)});}
 // behind the front (lead ruling 2026-11-10 12:21: the north-front buildings' own roofs are P2's): the 1968 link's flat roof over the
 // single-storey range (HES LB39340, read 2026-11-10 as the britishlistedbuildings.co.uk transcript of the listing, 200384979, not the HES portal: the 1968
 // flat-roofed single-storey link infills the V-shaped entrance's southern aspect), 9 m deep (ASSUMED); and east of the pavilion the two
 // stone gable ends with slated roofs that R-pt2-a and R-pt2-e (geograph 2008570) show rising behind the street wall. Their stone tint is
 // read from R-pt2-a (LB39340's "coursed grey and pink sandstone" describes Tite's block, not these). Widths, set-back, eaves and apex
 // ASSUMED from R-pt2-e.
 const roofY=P+S.wall-.02;
 for(const [ra,rb] of [[0,s0-.1],[s1+.1,l]] as const){if(rb-ra<1)continue;const west=ra===0;
  const back=west?S.slateBack:S.flatDeep,top=west?P+S.slateTop:roofY;
  const q=[[ra,-.1,roofY],[rb,-.1,roofY],[rb,-back,top],[ra,-back,top]] as const;
  b.front.poly(q.map(([u,o,y])=>{const p=at(u,o);return [p[0],y,p[1]] as V3;}),undefined,{facing:[n[0]*(west?.6:0),1,n[1]*(west?.6:0)],color:rgb(west?C.slate:C.felt)});
  if(west){for(const u of [ra,rb]){const a2=at(u,-.1),b2=at(u,-back);b.front.poly([[a2[0],roofY,a2[1]],[b2[0],roofY,b2[1]],[b2[0],top,b2[1]]],undefined,{facing:[t[0]*(u===ra?-1:1),0,t[1]*(u===ra?-1:1)],color:rgb(C.buff)});}
   for(let u=ra+2;u+4<rb;u+=7){const m0=-back*.55,m1=-back*.8,y0=roofY+(top-roofY)*.55,y1=roofY+(top-roofY)*.8;// a glazed lantern on the slope
    const c=at(u+2,(m0+m1)/2);wallBox(b.glass,at(u,(m0+m1)/2),at(u+4,(m0+m1)/2),Math.min(y0,y1)-.1,Math.max(y0,y1)+.7,(m0-m1)/2,rgb(C.lantern));void c;}}
 }
 {const back=(u0:number,u1:number,o:number,y0:number,y1:number)=>{const p=at(u0,o),q=at(u1,o);
   b.front.poly([[p[0],y0,p[1]],[q[0],y0,q[1]],[q[0],y1,q[1]],[p[0],y1,p[1]]],undefined,{facing:[-n[0],0,-n[1]],color:rgb(C.buff)});
   for(const [u,sg] of [[u0,-1],[u1,1]] as const){const a2=at(u,0),b2=at(u,o);b.front.poly([[a2[0],y0,a2[1]],[b2[0],y0,b2[1]],[b2[0],y1,b2[1]],[a2[0],y1,a2[1]]],undefined,{facing:[t[0]*sg,0,t[1]*sg],color:rgb(C.buff)});}};
  back(0,s0-.1,-S.slateBack,foot,roofY);back(s1+.1,l,-S.flatDeep,foot,roofY);
  back(s0-.1,s1+.1,-S.pavilionDeep,foot,P+S.pavilionFloor);}
 const g0=s1+.6,gw=(l-.2-g0-.2)/2,up:V3=[0,1,0];
 for(let g=0;g<2;g++){const sa=g0+g*(gw+.2),sb=sa+gw,sm=(sa+sb)/2,of=-S.gableBack,ob=-S.gableDeep,ye=P+S.gableEaves,ya=P+S.gableApex;
  const V=(s:number,o:number,y:number):V3=>{const q=at(s,o);return [q[0],y,q[1]];};
  // the gable wall, its triangle and the wall below it down into the single-storey roof
  b.front.poly([V(sa,of,roofY-.3),V(sb,of,roofY-.3),V(sb,of,ye),V(sm,of,ya),V(sa,of,ye)],undefined,{facing:[n[0],0,n[1]],color:rgb(C.sandstone)});
  b.front.poly([V(sa,ob,roofY-.3),V(sb,ob,roofY-.3),V(sb,ob,ye),V(sm,ob,ya),V(sa,ob,ye)],undefined,{facing:[-n[0],0,-n[1]],color:rgb(C.sandstone)});
  for(const [x,dir] of [[sa,-1],[sb,1]] as const)b.front.poly([V(x,of,roofY-.3),V(x,ob,roofY-.3),V(x,ob,ye),V(x,of,ye)],undefined,{facing:[t[0]*dir,0,t[1]*dir],color:rgb(C.sandstone)});
  // the slated roof, oversailing the side walls by 0.3 m; a skew (coping) along each gable's raking edges
  for(const [x,dir] of [[sa-.3,-1],[sb+.3,1]] as const){const ey=ye-.3*(S.gableApex-S.gableEaves)/(gw/2);
   b.front.poly([V(x,of+.15,ey),V(x,ob-.15,ey),V(sm,ob-.15,ya),V(sm,of+.15,ya)],undefined,{facing:[t[0]*dir,1,t[1]*dir],color:rgb(C.slate)});}
  for(const [x0,x1] of [[sa,sm],[sm,sb]] as const){const p=at(x0,of+.12),q=at(x1,of+.12),y0=x0===sa?ye:ya,y1=x0===sa?ya:ye;
   b.front.poly([[p[0],y0,p[1]],[q[0],y1,q[1]],[q[0],y1+.25,q[1]],[p[0],y0+.25,p[1]]],undefined,{facing:[n[0],0,n[1]],color:rgb(C.coping)});}
  void up;
 }
 // the pavement: 4.2 m out to a kerb, block paving, black bollards with a yellow band at the kerb, blue planters (R-pt2-a)
 const pv:Pt[]=[at(-1,0),at(l+1,0),at(l+1,S.pavement),at(-1,S.pavement)];
 drape(b.flat,pv,ground,S.kerb,rgb(C.footway));
 const k0=at(-1,S.pavement),k1=at(l+1,S.pavement);wallBox(b.flat,k0,k1,ground.heightAt(...k0)-.05,P+S.kerb+.01,.08,rgb(C.kerb));
 for(let s=1;s<l;s+=S.bollardPitch){if(Math.abs(s-sE)<2.8)continue;const p=at(s,S.pavement-.35),y=ground.heightAt(...p)+S.kerb;
  prism(b.front,p[0],p[1],.11,y,y+S.bollard,8,rgb(C.bollard));prism(b.front,p[0],p[1],.115,y+.72,y+.84,8,rgb(C.yellow),Math.PI/8,false);}
 for(const s of [s1+1.5,s1+3.6,s0-2.2,s0-8.5]){const p=at(s,S.pavement-1.4),y=ground.heightAt(...p)+S.kerb;
  prism(b.front,p[0],p[1],.6,y,y+.62,12,rgb(C.planter));prism(b.front,p[0],p[1],.5,y+.62,y+1.05,8,rgb(C.shrub),Math.PI/8);}
 for(let o=S.pavement+.6;o<S.pavement+6.6;o+=1){const p=at(sE-1.6,o),q=at(sE+1.6,o);strip(b.paint,[p,q],.25,ground,.1,rgb(C.paint),()=>false);}
 return {chain,P};
}
