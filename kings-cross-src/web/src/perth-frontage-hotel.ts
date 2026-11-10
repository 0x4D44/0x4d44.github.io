// P2 frontage: the Station Hotel, Leonard Street, Perth (Andrew Heiton jr, 1885; HES LB39538, Category B; every "HES" below is that listing's text as read in the
// britishlistedbuildings.co.uk transcript 200385227, not the HES portal), on its OSM footprint
// way/234811330 (ODbL), unchanged. The footprint is identified by the HES grid reference NO 11260 23198, which converts (OSGB36 to
// WGS84, then core/geo.ts project) to x -41.6, z -134.5, inside this way; the OSM hotel way/104991643 holds node 267534279 "Queens Hotel".
// Published (HES LB39538, read 2026-11-10 as the britishlistedbuildings.co.uk transcript of the listing, 200385227, not the HES portal): "3-storey and attic, asymmetric Flemish Gothic"; an 8-bay south entrance elevation; stugged ashlar with red
// sandstone margins and band courses; grey slates; crow-stepped gables with finials; small piend-roofed dormers; corniced wallhead and
// ridge stacks; a segmental-arched doorway in an advanced bay at the far left; a full-height turret with a conical slated roof in the
// re-entrant angle; an octagonal corner tower with a conical roof at the south-east, opposite the station; later single-storey additions,
// and a ballroom to the east (1919).
// Every height below is ASSUMED, scaled from R-pt2-b (geograph 6872925, JThomas 2021, CC BY-SA 2.0), taken at the camera point
// pt-station-hotel uses. That scale is about 22 px/m, from the 33 m OSM front between the entrance bay and the east gable bay.
// Which parts of the footprint are the single-storey additions and the ballroom is read from that photograph and from the footprint's
// shape (see HOTEL_REGIONS), not from a published plan.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {cleanRing} from './waverley-mesh.ts';
import {prism,revolve,slab,wallBox} from './waverley-frontage-mesh.ts';

export const PERTH_HOTEL_ID='way/234811330';
export const PERTH_HOTEL_SOURCE={
 url:'https://portal.historicenvironment.scot/designation/LB39538',
 /** Where the listing's text was read: a transcript of it, not the HES portal. */
 transcript:'https://britishlistedbuildings.co.uk/200385227-station-hotel-leonard-street-perth-perth',grid:'NO 11260 23198',
 /** The grid reference in WGS84 (OSGB36 transverse Mercator inverse, then the OSGB36-to-WGS84 Helmert transform). */
 latLon:{lat:56.392685,lon:-3.439072},
 basis:'HES LB39538 (britishlistedbuildings.co.uk transcript 200385227): 3-storey and attic asymmetric Flemish Gothic hotel, 1885, Andrew Heiton jr; 8-bay south elevation; stugged ashlar, red sandstone margins and bands, grey slates; crow-stepped gables; conical re-entrant turret; octagonal SE corner tower',
} as const;
/** Heights above P, the car park at the front's midpoint (m). ASSUMED from R-pt2-b at about 22 px/m. */
export const HOTEL_LEVELS={
 plinth:.7,first:4.4,second:8,eaves:11.4,ridge:16.2,// the main range: three storeys, its slated attic roof
 bayEaves:15.2,bayRidge:18.4,bayApex:19.5,// the advanced entrance bay: four tiers (door, two storeys, the attic window in its gable)
 eastApex:18.6,stack:20.6,// the east gable bay's crow-stepped apex; the stacks' tops
 extension:4.6,ballroom:6,// the single-storey additions (R-pt2-b, left) and the 1919 ballroom (R-pt2-b, right of the corner tower)
 turret:{drum:12.8,tip:17.8},corner:{drum:14.2,tip:22.5},
} as const;
/** Window bay (m): the 18 m middle front (OSM) carries four, as R-pt2-b shows four window columns between the turret and the east gable. */
export const HOTEL_BAY=4.5;
/** `ashlar` is the stugged pinkish buff-grey wall (R-pt2-b, about #8e715c in shade, lit a little lighter; no yellow); `red` the darker, redder, dull sandstone of margins, bands,
 *  quoins, skews, cornice and finials (about #845f4e in shade); `frame` the white-painted sashes; `dormer` the white-painted dormer fronts; `pipe` the black cast-iron
 *  downpipes. Round 5 (F6): the dressings were a bright orange-red and the walls a yellow tan, with too much contrast between them. Tones ASSUMED from R-pt2-b. */
export const HOTEL_COLOURS={ashlar:0x9a8a7e,red:0x83574a,frame:0xeeeae2,dormer:0xe8e4da,slate:0x4b5059,lead:0x5a5d61,glass:0x262c33,door:0x6a4428,pipe:0x2b2d2f} as const;

type Ring=Pt[];
const dot=(a:Pt,b:Pt)=>a[0]*b[0]+a[1]*b[1];
const sub=(a:Pt,b:Pt):Pt=>[a[0]-b[0],a[1]-b[1]];
const nearest=(r:Ring,p:Pt)=>{let k=0;for(let i=1;i<r.length;i++)if(Math.hypot(...sub(r[i],p))<Math.hypot(...sub(r[k],p)))k=i;
 if(Math.hypot(...sub(r[k],p))>1.5)throw Error(`hotel footprint: no vertex near ${p}`);return r[k];};
/** The circle through three points (the OSM turret outlines are polygons round their shafts). */
function circle(a:Pt,b:Pt,c:Pt):{c:Pt;r:number}{
 const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
 const ux=((a[0]**2+a[1]**2)*(b[1]-c[1])+(b[0]**2+b[1]**2)*(c[1]-a[1])+(c[0]**2+c[1]**2)*(a[1]-b[1]))/d;
 const uz=((a[0]**2+a[1]**2)*(c[0]-b[0])+(b[0]**2+b[1]**2)*(a[0]-c[0])+(c[0]**2+c[1]**2)*(b[0]-a[0]))/d;
 return {c:[ux,uz],r:Math.hypot(a[0]-ux,a[1]-uz)};
}
/** Keep the side of the line where f >= 0 (Sutherland-Hodgman against one half-plane; exact for a convex input). */
function clipHalf(poly:Ring,f:(p:Pt)=>number):Ring{
 const out:Ring=[];
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length],fp=f(p),fq=f(q);
  if(fp>=0)out.push(p);
  if((fp>=0)!==(fq>=0)){const t=fp/(fp-fq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
 return out;
}
const inRing=([x,z]:Pt,p:Ring)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};

/**
 * The hotel's plan frame, from the OSM footprint's own vertices: `u` runs along the main south front (the 18 m middle edge, west to east),
 * `n` faces out of it (south-south-east, over the car park). s(p) is metres along u from the entrance bay's west corner; d(p) is metres
 * behind the main front line (negative in front of it: the entrance bay stands 7.3 m forward).
 */
export function hotelFrame(outer:readonly Pt[]){
 const ring=cleanRing(outer);
 const a2=nearest(ring,[-25.3,-97.8]),a3=nearest(ring,[-8.7,-104.7]);// the middle front's ends (OSM)
 const e0=nearest(ring,[-31,-87.4]),e1=nearest(ring,[-26.2,-89.5]);// the entrance bay's front corners (OSM)
 const l=Math.hypot(...sub(a3,a2)),u:Pt=[(a3[0]-a2[0])/l,(a3[1]-a2[1])/l],n:Pt=[-u[1],u[0]];
 const s=(p:Pt)=>dot(sub(p,e0),u),d=(p:Pt)=>dot(sub(a2,p),n);
 const at=(si:number,di:number):Pt=>{const k=d(e0)-di;return [e0[0]+u[0]*si+n[0]*k,e0[1]+u[1]*si+n[1]*k];};
 const reentrant=circle(nearest(ring,[-26.9,-94.5]),nearest(ring,[-26,-95.3]),nearest(ring,[-25.3,-97.8]));
 const corner=circle(nearest(ring,[-1.5,-105.3]),nearest(ring,[.4,-107.5]),nearest(ring,[-1.3,-109.4]));
 return {ring,u,n,s,d,at,bayWidth:Math.hypot(...sub(e1,e0)),bayFront:d(e0),middle:[s(a2),s(a3)] as [number,number],
  eastBay:[s(nearest(ring,[-8.5,-104.3])),s(nearest(ring,[-3.2,-106.5]))] as [number,number],reentrant,corner};
}
export type HotelFrame=ReturnType<typeof hotelFrame>;

/**
 * The footprint's parts and their wall-top heights, first match wins (all ASSUMED from R-pt2-b and the footprint's shape):
 * the single-storey additions west of the entrance bay (R-pt2-b's left edge); the four-tier entrance bay; the ballroom east of the corner
 * tower (R-pt2-b shows single-storey windows right of it; HES "ballroom to the east"); everything else the three-storey main block.
 */
export function hotelRegions(f:HotelFrame){
 const L=HOTEL_LEVELS,cornerS=f.s(f.corner.c);
 const regions:{name:string;planes:((p:Pt)=>number)[];top:number}[]=[
  {name:'extension',planes:[p=>-f.s(p),p=>10-f.d(p)],top:L.extension},
  {name:'entrance-bay',planes:[p=>f.s(p),p=>f.bayWidth-f.s(p),p=>6-f.d(p)],top:L.bayEaves},
  {name:'ballroom',planes:[p=>f.s(p)-(cornerS+f.corner.r)],top:L.ballroom},
 ];
 const top=(p:Pt)=>{for(const r of regions)if(r.planes.every(h=>h(p)>=0))return r.top;return L.eaves;};
 return {regions,top,main:L.eaves};
}

/** Split a convex piece by the regions: [piece, its wall-top height][]. */
function pieces(tri:Ring,regions:ReturnType<typeof hotelRegions>['regions'],main:number):[Ring,number][]{
 const out:[Ring,number][]=[];let rest:Ring[]=[tri];
 for(const r of regions){const next:Ring[]=[];
  for(const piece of rest){let inside=piece;
   for(const h of r.planes){const outside=clipHalf(inside,p=>-h(p));if(outside.length>2)next.push(outside);inside=clipHalf(inside,h);if(inside.length<3)break;}
   if(inside.length>2)out.push([inside,r.top]);}
  rest=next;}
 for(const piece of rest)out.push([piece,main]);
 return out;
}

/** Hotel parts: `facade` (UV: x across the window-bay texture, y up it), `detail` (vertex-coloured: slates, stone, door, finials). */
export interface HotelBatches {facade:Batch;detail:Batch}
/** Texture v for a height above P: the facade texture spans P-2 m to P+16 m. */
export const HOTEL_TEX_SPAN=[-2,16] as const;
const tv=(h:number)=>(h-HOTEL_TEX_SPAN[0])/(HOTEL_TEX_SPAN[1]-HOTEL_TEX_SPAN[0]);

export function stationHotel(b:HotelBatches,outer:readonly Pt[],ground:Pick<Terrain,'heightAt'|'rangeUnder'>):{P:number;foot:number;frame:HotelFrame;triangles:number}{
 const f=hotelFrame(outer),{regions,top,main}=hotelRegions(f),L=HOTEL_LEVELS;
 const P=ground.heightAt(...f.at((f.middle[0]+f.middle[1])/2,-6)),foot=ground.rangeUnder(f.ring,4).min-.15;
 const start=b.facade.triangles+b.detail.triangles;
 const C={ashlar:rgb(HOTEL_COLOURS.ashlar),red:rgb(HOTEL_COLOURS.red),slate:rgb(HOTEL_COLOURS.slate),lead:rgb(HOTEL_COLOURS.lead),glass:rgb(HOTEL_COLOURS.glass),door:rgb(HOTEL_COLOURS.door),frame:rgb(HOTEL_COLOURS.frame),white:rgb(HOTEL_COLOURS.dormer),pipe:rgb(HOTEL_COLOURS.pipe)};
 // 1. Walls on the OSM footprint, split where a region boundary crosses an edge; each edge's window bays fitted to its length.
 const lines=regions.flatMap(r=>r.planes);
 let area=0;for(let i=0;i<f.ring.length;i++){const p=f.ring[i],q=f.ring[(i+1)%f.ring.length];area+=p[0]*q[1]-q[0]*p[1];}
 const ring=area>0?[...f.ring].reverse():f.ring;// negative signed area in x/z faces out with these quads (waverley-mesh.ts walls)
 for(let i=0;i<ring.length;i++){
  const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(...sub(c,a));if(len<1e-3)continue;
  const ts=[0,1];for(const h of lines){const ha=h(a),hc=h(c);if((ha<0)!==(hc<0)&&Math.abs(ha-hc)>1e-9){const t=ha/(ha-hc);if(t>1e-4&&t<1-1e-4)ts.push(t);}}
  ts.sort((x,y)=>x-y);
  const bays=len<2.5?0:Math.max(1,Math.round(len/HOTEL_BAY)),U=(t:number)=>bays?t*bays:.02+t*.12;// short returns: plain ashlar (the tile's margin)
  for(let k=0;k+1<ts.length;k++){
   const t0=ts[k],t1=ts[k+1],p0:Pt=[a[0]+(c[0]-a[0])*t0,a[1]+(c[1]-a[1])*t0],p1:Pt=[a[0]+(c[0]-a[0])*t1,a[1]+(c[1]-a[1])*t1];
   const h=top([(p0[0]+p1[0])/2,(p0[1]+p1[1])/2]);
   b.facade.poly([[p0[0],foot,p0[1]],[p1[0],foot,p1[1]],[p1[0],P+h,p1[1]],[p0[0],P+h,p0[1]]],[[U(t0),tv(foot-P)],[U(t1),tv(foot-P)],[U(t1),tv(h)],[U(t0),tv(h)]]);
  }
 }
 // 2. Flat tops (leads) per region, and the step walls where a higher part rises over a lower one.
 const rv=f.ring.map(p=>new THREE.Vector2(p[0],p[1]));
 for(const tri of THREE.ShapeUtils.triangulateShape(rv,[]))for(const [piece,h] of pieces(tri.map(k=>f.ring[k]),regions,main)){
  b.detail.poly(piece.map(p=>[p[0],P+h,p[1]] as V3),undefined,{facing:[0,1,0],color:C.lead});
  for(let k=0;k<piece.length;k++){const p=piece[k],q=piece[(k+1)%piece.length],l=Math.hypot(...sub(q,p));if(l<.05)continue;
   const m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2],o:Pt=[(q[1]-p[1])/l,-(q[0]-p[0])/l],cen=piece.reduce((s,v)=>[s[0]+v[0]/piece.length,s[1]+v[1]/piece.length],[0,0]);
   const out=dot(sub(m,cen as Pt),o)>0?o:[-o[0],-o[1]] as Pt,probe:Pt=[m[0]+out[0]*.05,m[1]+out[1]*.05];
   if(!inRing(probe,f.ring))continue;const lower=top(probe);if(lower>=h)continue;
   const U0=dot(p,f.u)/HOTEL_BAY,U1=dot(q,f.u)/HOTEL_BAY;
   b.facade.poly([[p[0],P+lower,p[1]],[q[0],P+lower,q[1]],[q[0],P+h,q[1]],[p[0],P+h,p[1]]],[[U0,tv(lower)],[U1,tv(lower)],[U1,tv(h)],[U0,tv(h)]],{facing:[out[0],0,out[1]]});
  }
 }
 // 3. Pitched roofs: the main range over the middle front (eaves on the front line, ridge 6 m back, 12 m deep), the entrance bay's
 // own roof (ridge front to back), and the east gable bay's cross gable; their crow-stepped gables in the front plane.
 const V=(s:number,d:number,y:number):V3=>{const p=f.at(s,d);return [p[0],y,p[1]];};
 const up:V3=[0,1,0],nOut:V3=[f.n[0],0,f.n[1]],uAx:V3=[f.u[0],0,f.u[1]];
 const gableRoof=(s0:number,s1:number,d0:number,d1:number,eaves:number,ridge:number,alongS:boolean,color:Rgb)=>{
  // alongS: ridge runs along u (a range); else along d (a bay roof running back from the front)
  if(alongS){const dm=(d0+d1)/2;
   b.detail.poly([V(s0,d0,eaves),V(s1,d0,eaves),V(s1,dm,ridge),V(s0,dm,ridge)],undefined,{facing:[nOut[0],1,nOut[2]],color});
   b.detail.poly([V(s0,d1,eaves),V(s1,d1,eaves),V(s1,dm,ridge),V(s0,dm,ridge)],undefined,{facing:[-nOut[0],1,-nOut[2]],color});
   for(const s of [s0,s1])b.detail.poly([V(s,d0,eaves),V(s,d1,eaves),V(s,dm,ridge)],undefined,{facing:s===s0?[-uAx[0],0,-uAx[2]]:uAx,color:C.ashlar});
  }else{const sm=(s0+s1)/2;
   b.detail.poly([V(s0,d0,eaves),V(s0,d1,eaves),V(sm,d1,ridge),V(sm,d0,ridge)],undefined,{facing:[-uAx[0],1,-uAx[2]],color});
   b.detail.poly([V(s1,d0,eaves),V(s1,d1,eaves),V(sm,d1,ridge),V(sm,d0,ridge)],undefined,{facing:[uAx[0],1,uAx[2]],color});
   b.detail.poly([V(s0,d1,eaves),V(s1,d1,eaves),V(sm,d1,ridge)],undefined,{facing:[-nOut[0],0,-nOut[2]],color:C.ashlar});
  }
 };
 const [m0,m1]=f.middle,[e0,e1]=f.eastBay,range={s0:f.bayWidth,s1:f.s(f.corner.c),d0:-.35,d1:12.35};
 gableRoof(range.s0,range.s1,range.d0,range.d1,P+L.eaves,P+L.ridge,true,C.slate);
 const pitch=(L.ridge-L.eaves)/((range.d1-range.d0)/2),slopeAt=(d:number)=>L.eaves+(d-range.d0)*pitch;// the range's front slope (above P)
 const bayRidge=L.bayRidge;gableRoof(-.2,f.bayWidth+.2,f.bayFront-.25,6,P+L.bayEaves,P+bayRidge,false,C.slate);
 const eastRidge=L.eaves+(e1-e0)/2*1.2,eastBack=(eastRidge-L.eaves)/pitch+range.d0;
 gableRoof(e0-.15,e1+.15,-.45,eastBack,P+L.eaves,P+eastRidge,false,C.slate);
 // the rear: two slated ranges behind the front range (round-1 score: the rear read as a flat slab), between the footprint's west return
// (s -3.9) and the corner tower's line (s 34.9), back to d 35.7 (all OSM vertices); the same pitch as the front range (ASSUMED)
for(const [d0,d1] of [[range.d1,24],[24,35.7]] as const){const half=(d1-d0)/2;gableRoof(-3.9,range.s1+.1,d0,d1,P+L.eaves,P+L.eaves+half*pitch,true,C.slate);}
{const ws0=-14.2,ws1=-1.0,wd0=-5.2,wd1=6.1,top=L.extension,dw=.6;
 const glaze=(a:Pt,c:Pt,face:V3)=>{const l=Math.hypot(c[0]-a[0],c[1]-a[1]),k=Math.max(1,Math.round(l/1.1)),tt:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l];
  b.detail.poly([[a[0],P+dw,a[1]],[c[0],P+dw,c[1]],[c[0],P+top-.25,c[1]],[a[0],P+top-.25,a[1]]],undefined,{facing:face,color:C.glass});
  for(let i=0;i<=k;i++){const q:Pt=[a[0]+tt[0]*l*i/k,a[1]+tt[1]*l*i/k];wallBox(b.detail,[q[0]-tt[0]*.05,q[1]-tt[1]*.05],[q[0]+tt[0]*.05,q[1]+tt[1]*.05],P+dw,P+top-.25,.05,C.frame);}
  for(const y of [P+dw,P+2.4,P+top-.3])wallBox(b.detail,a,c,y-.04,y+.04,.05,C.frame);};
 const fA=f.at(ws0,wd0-.06),fB=f.at(ws1,wd0-.06);glaze(fA,fB,nOut);
 const wA=f.at(ws0-.06,wd1),wB=f.at(ws0-.06,wd0);glaze(wA,wB,[-uAx[0],0,-uAx[2]]);
 gableRoof(ws0-.25,ws1,wd0-.3,wd1,P+top,P+top+3,true,C.slate);}
// crow-stepped gable walls (HES): an outline of steps from the wallhead to the apex, 0.45 m thick, red sandstone skews
 const crow=(s0:number,s1:number,d:number,base:number,apex:number,steps:number)=>{
  const w=s1-s0,o:[number,number][]=[[0,base-1.2],[w,base-1.2]];
  for(let k=0;k<steps;k++){const x=w-k*w/2/steps,y=base+(apex-base)*k/steps;o.push([x,y],[x,y+(apex-base)/steps]);}
  o.push([w/2+.35,apex],[w/2-.35,apex]);
  for(let k=steps-1;k>=0;k--){const x=k*w/2/steps,y=base+(apex-base)*k/steps;o.push([x,y+(apex-base)/steps],[x,y]);}
  const origin=f.at(s0,d);slab(b.detail,o.map(([x,y])=>[x,y+P] as [number,number]),[origin[0],0,origin[1]],uAx,nOut,.45,C.ashlar);
  const cap=f.at((s0+s1)/2,d+.25);prism(b.detail,cap[0],cap[1],.22,P+apex,P+apex+.9,4,C.red);// the apex finial (HES "stone finials")
 };
 crow(0,f.bayWidth,f.bayFront-.02,L.bayEaves,L.bayApex,5);
 crow(e0,e1,-.47,L.eaves,L.eastApex,5);
 // wallhead gablets on the middle front's two inner bays (R-pt2-b): over each second-floor window pair, under the eaves, a carved arched tympanum
 // (a segmental panel of the red stone, 2.3 m on its chord, with a darker inset); over the eaves a narrow stepped pedestal (three steps, 1.9, 1.4 and
 // 0.9 m wide, red caps, 1.5 m high) on two stepped corbels either side of the tympanum, carrying a cross finial 1.0 m high. The pedestal stands proud of
 // the wall by 0.4 m so the main roof's eaves pass behind it. The window pair itself is the facade texture's. Sizes ASSUMED from R-pt2-b.
 function gablet(sc:number){
  const lens=(w2:number,y0:number,rise:number)=>{const R=(w2*w2/4+rise*rise)/(2*rise),o:[number,number][]=[[-w2/2,y0],[w2/2,y0]];
   for(let i=1;i<8;i++){const x=w2/2-w2*i/8;o.push([x,y0+Math.sqrt(R*R-x*x)-(R-rise)]);}return o;};
  const ty0=L.second+2.88,rise=L.eaves-.02-ty0,dark:Rgb=[C.red[0]*.72,C.red[1]*.72,C.red[2]*.72];// from the window margins' top to just under the cornice's top
  const tp=f.at(sc,-.06);slab(b.detail,lens(2.3,ty0,rise).map(([x,y])=>[x,y+P] as [number,number]),[tp[0],0,tp[1]],uAx,nOut,.06,C.red);
  const ti=f.at(sc,-.09);slab(b.detail,lens(1.8,ty0+.07,rise-.16).map(([x,y])=>[x,y+P] as [number,number]),[ti[0],0,ti[1]],uAx,nOut,.03,dark);// the darker carved inset
  for(const x of [-.8,.8]){// two stepped corbels carrying the pedestal's ends, clear of the tympanum's crown
   const lo=f.at(sc+x,-.13),hi=f.at(sc+x,-.2);wallBoxAlong(b.detail,lo,f.u,f.n,.3,.26,P+L.eaves-.3,P+L.eaves-.15,C.red);wallBoxAlong(b.detail,hi,f.u,f.n,.4,.4,P+L.eaves-.15,P+L.eaves,C.red);}
  const pc=f.at(sc,-.2);let y=L.eaves;
  for(const [w2,h] of [[1.9,.45],[1.4,.4],[.9,.35]] as const){wallBoxAlong(b.detail,pc,f.u,f.n,w2,.4,P+y,P+y+h,C.ashlar);wallBoxAlong(b.detail,pc,f.u,f.n,w2+.14,.46,P+y+h,P+y+h+.1,C.red);y+=h+.1;}// step and red cap
  wallBoxAlong(b.detail,pc,f.u,f.n,.14,.14,P+y,P+y+1,C.red);wallBoxAlong(b.detail,pc,f.u,f.n,.56,.14,P+y+.5,P+y+.64,C.red);}// the cross: a shaft and a short arm
 // the two gablets on the middle front's inner bays (R-pt2-b), and four white-fronted piend-roofed dormers on the front slope, two each side of the pair
 // (R-pt2-b shows them at about 2.5 m and 5 m from the nearest gablet's centre; HES lists "small piend-roofed dormers" and the photo agrees: flat-headed
 // white-painted fronts under hipped slate roofs, not gabled fronts). Each: a 1.0 m wide white front, 1.0 m of it above the slope, a dark light 0.56 m
 // wide with a white mullion, a slated roof hipped to the front and both sides (0.4 m rise, the front hip meeting the ridge 0.56 m back) running back to
 // meet the main slope, slated cheeks. Sizes ASSUMED from R-pt2-b.
 const bayW=(m1-m0)/4;
 for(const k of [1,2]){const sc=m0+(k+.5)*bayW;gablet(sc);}
 for(const [k,offs] of [[1,[-2.5,-5]],[2,[2.5,5]]] as const)for(const off of offs){// outward of each gablet, away from the other
  const sc=m0+(k+.5)*bayW+off,dz=1.1,y0=P+slopeAt(dz),hw=.5,wallTop=y0+1;
  const c=f.at(sc,dz+.85);wallBoxAlong(b.detail,c,f.u,f.n,.9,1.7,y0-.2,wallTop,C.slate);// the cheeks, slated
  const ff=f.at(sc,dz+.03);wallBoxAlong(b.detail,ff,f.u,f.n,2*hw,.1,y0-.15,wallTop,C.white);// the white-painted, flat-headed front
  const gl=f.at(sc,dz-.06),gw=.28,hf:Pt=[f.u[0]*gw,f.u[1]*gw];
  b.detail.poly([[gl[0]-hf[0],y0+.1,gl[1]-hf[1]],[gl[0]+hf[0],y0+.1,gl[1]+hf[1]],[gl[0]+hf[0],y0+.88,gl[1]+hf[1]],[gl[0]-hf[0],y0+.88,gl[1]-hf[1]]],undefined,{facing:nOut,color:C.glass});
  const mu=f.at(sc,dz-.07);wallBoxAlong(b.detail,mu,f.u,f.n,.06,.02,y0+.1,y0+.88,C.white);
  // the hipped roof: eaves at wallTop, 0.06 m out from the front and sides; the ridge at +0.4 m runs from the front hip's apex back into the main slope
  const ex=hw+.06,rh=.4,d0=dz-.08,back=dz+(wallTop+rh-y0)/pitch+.1,ridge=wallTop+rh;
  const e00=V(sc-ex,d0,wallTop),e10=V(sc+ex,d0,wallTop),e01=V(sc-ex,back,wallTop),e11=V(sc+ex,back,wallTop),r0=V(sc,d0+ex,ridge),r1=V(sc,back,ridge);
  b.detail.poly([e00,e10,r0],undefined,{facing:[nOut[0],1,nOut[2]],color:C.slate});// the front hip
  b.detail.poly([e00,e01,r1,r0],undefined,{facing:[-uAx[0],1,-uAx[2]],color:C.slate});b.detail.poly([e10,e11,r1,r0],undefined,{facing:[uAx[0],1,uAx[2]],color:C.slate});}
 // 4. Stacks: corniced, on the ridge between the bays and over the two gables (HES "corniced wallhead and ridge stacks")
 const stack=(p:Pt,y0:number)=>{wallBoxAlong(b.detail,p,f.u,f.n,1.9,.9,y0,P+L.stack,C.ashlar);wallBoxAlong(b.detail,p,f.u,f.n,2.2,1.15,P+L.stack-.45,P+L.stack-.2,C.red);};
 stack(f.at(m0+bayW,6),P+L.ridge-.5);stack(f.at(m0+3*bayW,6),P+L.ridge-.5);stack(f.at(f.bayWidth/2,f.bayFront+.8),P+L.bayApex-1.2);stack(f.at((e0+e1)/2,-.25),P+L.eastApex-1.5);
 // 5. The turrets (HES): the re-entrant turret's conical slated roof, and the south-east corner tower's tall octagonal spire (R-pt2-b,
 // R-pt2-b 5._Perth_Station_copy.jpg). Their shafts are the footprint's own polygonal outlines, walled above.
 const t=f.reentrant,k=f.corner;
 prism(b.detail,t.c[0],t.c[1],t.r+.15,P+L.eaves-.3,P+L.turret.drum,8,C.ashlar,Math.PI/8,false);// the shaft is wall stone (R-pt2-b), as the corner tower's is
 revolve(b.detail,t.c[0],t.c[1],[[t.r+.3,P+L.turret.drum],[0,P+L.turret.tip]],12,C.slate);
 prism(b.detail,t.c[0],t.c[1],.07,P+L.turret.tip-.1,P+L.turret.tip+.8,4,C.lead);
 prism(b.detail,k.c[0],k.c[1],k.r+.1,P+L.eaves-.3,P+L.corner.drum,8,C.ashlar,Math.PI/8);
 prism(b.detail,k.c[0],k.c[1],k.r+.25,P+L.corner.drum-.4,P+L.corner.drum,8,C.red,Math.PI/8,false);
 revolve(b.detail,k.c[0],k.c[1],[[k.r+.25,P+L.corner.drum],[0,P+L.corner.tip]],8,C.slate,Math.PI/8);
 prism(b.detail,k.c[0],k.c[1],.08,P+L.corner.tip-.1,P+L.corner.tip+1,4,C.lead);
 // 6. The segmental-arched doorway in the entrance bay (HES), with its red sandstone surround (R-pt2-b): 2.6 m by 3.6 m, ASSUMED.
 const dc=f.at(f.bayWidth/2,f.bayFront-.03),arch=(w:number,h:number,rise:number)=>{const o:[number,number][]=[[-w/2,0],[w/2,0],[w/2,h-rise]];
  for(let i=1;i<8;i++){const a=i/8;o.push([w/2-a*w,h-rise+Math.sin(a*Math.PI)*rise]);}o.push([-w/2,h-rise]);return o;};
 slab(b.detail,arch(3.3,4.1,.6).map(([x,y])=>[x,y+P-.05] as [number,number]),[dc[0],0,dc[1]],uAx,nOut,.05,C.red);
 const dd=f.at(f.bayWidth/2,f.bayFront-.09);slab(b.detail,arch(2.6,3.6,.5).map(([x,y])=>[x,y+P] as [number,number]),[dd[0],0,dd[1]],uAx,nOut,.05,C.door);
 const fl=f.at(f.bayWidth/2,f.bayFront-.12);slab(b.detail,arch(2.3,.62,.45).map(([x,y])=>[x,y+P+2.85] as [number,number]),[fl[0],0,fl[1]],uAx,nOut,.02,C.glass);
 for(const x of [-.65,.65]){const q=f.at(f.bayWidth/2+x,f.bayFront-.12);slab(b.detail,[[-.42,P+1.3],[.42,P+1.3],[.42,P+2.6],[-.42,P+2.6]],[q[0],0,q[1]],uAx,nOut,.02,C.glass);}
 // 7. Long-and-short quoins (R-pt2-b; round-5 F4) up the main external corners of the entrance bay (its two front corners, on the front and on the short 1.0-1.2 m
 // returns the OSM outline gives them) and the east gable bay (its west front corner and, against the corner tower, its east end, on the front only: its 0.45 m
 // riser and 0.76 m east return are too short to carry any): red sandstone blocks on the 0.33 m courses of the facade texture, long (0.6 m) and short (0.3 m) faces alternating course by course and the other way
 // about on the corner's other face, 0.03 m proud (1 cm clear of the crow-stepped gables' slabs, which stand 2 cm off the wall), from the plinth to the wall top. Each run follows the footprint's own edge from its corner vertex and stops at
 // the lowest wall top sampled along it, so none can stand on air. ASSUMED from R-pt2-b.
 const quoin=(at:Pt)=>{
  const q=nearest(f.ring,at),n=f.ring.length,i=f.ring.indexOf(q);
  const runs=[(i+1)%n,(i+n-1)%n].map(j=>{const l=Math.hypot(...sub(f.ring[j],q));return {l,t:[(f.ring[j][0]-q[0])/l,(f.ring[j][1]-q[1])/l] as Pt};});
  const bis:Pt=[runs[0].t[0]+runs[1].t[0],runs[0].t[1]+runs[1].t[1]];
  if(Math.hypot(...bis)<.3)return;// a straight run: no corner
  const reentrant=!inRing([q[0]+bis[0]*.1,q[1]+bis[1]*.1],f.ring);// an angle the wall turns into: the long run only (the east bay's east end, against the corner tower's return)
  runs.forEach(({l,t:tg},face)=>{if(l<(reentrant?2:.7))return;
   let o:Pt=[tg[1],-tg[0]];if(inRing([q[0]+tg[0]*.3+o[0]*.05,q[1]+tg[1]*.3+o[1]*.05],f.ring))o=[-o[0],-o[1]];// the wall's outward normal
   const wall=Math.min(...[.1,.4,.8].filter(s=>s<l).map(s=>top([q[0]+tg[0]*s-o[0]*.08,q[1]+tg[1]*s-o[1]*.08])));
   const t3:V3=[tg[0],0,tg[1]],o3:V3=[o[0],0,o[1]],dn:V3=[0,-1,0],up3:V3=[0,1,0];
   for(let c=8;HOTEL_TEX_SPAN[0]+c*.33+.31<=wall;c++){
    const y0=P+HOTEL_TEX_SPAN[0]+c*.33,y1=y0+.31,len=Math.min((c+face)%2?.3:.6,l);
    const ao=(s:number,y:number):V3=>[q[0]+tg[0]*s+o[0]*.03,y,q[1]+tg[1]*s+o[1]*.03],aw=(s:number,y:number):V3=>[q[0]+tg[0]*s,y,q[1]+tg[1]*s];
    b.detail.poly([ao(-.03,y0),ao(len,y0),ao(len,y1),ao(-.03,y1)],undefined,{facing:o3,color:C.red});// the proud face
    b.detail.poly([aw(len,y0),ao(len,y0),ao(len,y1),aw(len,y1)],undefined,{facing:t3,color:C.red});// its free end
    b.detail.poly([aw(-.03,y0),aw(len,y0),ao(len,y0),ao(-.03,y0)],undefined,{facing:dn,color:C.red});// its underside
    b.detail.poly([aw(-.03,y1),aw(len,y1),ao(len,y1),ao(-.03,y1)],undefined,{facing:up3,color:C.red});}// its top
  });
 };
 for(const at of [[-31,-87.4],[-26.2,-89.5],[-8.5,-104.3],[-3.2,-106.5]] as const)quoin([at[0],at[1]]);// the entrance bay's front corners; the east gable bay's
 // 8. Downpipes (R-pt2-b shows several): black cast-iron, 0.11 m round, from a small hopper head at the gutter to the ground, 0.06 m off the wall: five on the main
 // front (by the turret, either side of the pair of gablets and between them, by the east gable) and one on the entrance bay's front by its east quoins. ASSUMED.
 const downpipe=(s:number,d:number,eaves:number)=>{const [x,z]=f.at(s,d-.06),yt=P+eaves-.12,yb=ground.heightAt(x,z)+.05;
  prism(b.detail,x,z,.055,yb,yt,6,C.pipe,Math.PI/6,false);
  const hd=f.at(s,d-.1);wallBoxAlong(b.detail,hd,f.u,f.n,.22,.16,yt-.24,yt,C.pipe);};
 for(const s of [m0+.55,m0+bayW,m0+2*bayW,m0+3*bayW,m1-.55])downpipe(s,0,L.eaves);
 downpipe(f.bayWidth-.72,f.bayFront,L.bayEaves);
 return {P,foot,frame:f,triangles:b.facade.triangles+b.detail.triangles-start};
}
/** A box standing on plan point c, `w` along u and `dp` along n, y0..y1. */
function wallBoxAlong(b:Batch,c:Pt,u:Pt,_n:Pt,w:number,dp:number,y0:number,y1:number,color:Rgb){wallBox(b,[c[0]-u[0]*w/2,c[1]-u[1]*w/2],[c[0]+u[0]*w/2,c[1]+u[1]*w/2],y0,y1,dp/2,color);}

/** The facade texture: one window bay (4.5 m) from P-2 m to P+16 m: stugged buff-grey ashlar courses, red sandstone (the darker, redder stone)
 *  plinth, bands, margins and cornice; bipartite white-painted sash windows on three storeys and an attic window that only the entrance bay's
 *  taller walls reach. ASSUMED sizes, read from R-pt2-b. */
export function hotelFacadeTexture():THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const W=512,H=2048,[lo,hi]=HOTEL_TEX_SPAN,ky=H/(hi-lo),kx=W/HOTEL_BAY,Y=(m:number)=>H-(m-lo)*ky;
 const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');if(!g)return null;
 const L=HOTEL_LEVELS,hex=(v:number)=>'#'+v.toString(16).padStart(6,'0');
 g.fillStyle=hex(HOTEL_COLOURS.ashlar);g.fillRect(0,0,W,H);
 let seed=11;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 for(let m=lo;m<hi;m+=.33)for(let x=(Math.round(m/.33)%2)*.45;x<HOTEL_BAY;x+=.9){const t=rnd();
  g.fillStyle=t<.35?`rgba(88,72,66,${(.35-t)*.7})`:t<.7?`rgba(176,166,160,${(t-.35)*.45})`:`rgba(150,118,108,${(t-.7)*.8})`;g.fillRect(x*kx,Y(m+.33),.9*kx,.33*ky);}// darker pink-grey, lighter grey, a rosy brown: stugged pinkish buff-grey ashlar, no yellow in any of them
 for(let m=lo;m<hi;m+=.33){g.fillStyle='rgba(58,46,44,.35)';g.fillRect(0,Y(m),W,2);}
 const red=hex(HOTEL_COLOURS.red),white=hex(HOTEL_COLOURS.frame),fw=.09,mw=.12;// the red sandstone dressings; the sashes' white paint: frame 0.09 m, mullion 0.12 m (ASSUMED from R-pt2-b)
 g.fillStyle=red;
 g.fillRect(0,Y(L.plinth),W,(L.plinth-lo)*ky);// plinth
 for(const [y,h] of [[L.first,.3],[L.second,.25],[L.eaves-.35,.35]] as const)g.fillRect(0,Y(y+h),W,h*ky);// band courses, wallhead cornice
 const sash=(cx:number,y0:number,w:number,h:number,lights:number)=>{
  const x0=(cx-w/2)*kx;g.fillStyle=red;g.fillRect(x0-.22*kx,Y(y0+h+.25),(w+.44)*kx,(h+.5)*ky);// red sandstone margins
  g.fillStyle=white;g.fillRect(x0,Y(y0+h),w*kx,h*ky);// the white-painted frame block: what the panes below leave of it is frame, mullion and rail
  const pw=(w-2*fw-(lights-1)*mw)/lights;
  for(let i=0;i<lights;i++){const lx=x0+(fw+i*(pw+mw))*kx;
   const grad=g.createLinearGradient(0,Y(y0+h-fw),0,Y(y0+fw));grad.addColorStop(0,'#4a5562');grad.addColorStop(1,'#20262d');
   g.fillStyle=grad;g.fillRect(lx,Y(y0+h-fw),pw*kx,(h-2*fw)*ky);
   g.fillStyle=white;g.fillRect(lx,Y(y0+h/2)-.04*ky,pw*kx,.08*ky);}// the sashes' meeting rail, white-painted (R-pt2-b)
  g.fillStyle=red;g.fillRect(x0-.35*kx,Y(y0),(w+.7)*kx,.2*ky);// sill
 };
 const cx=HOTEL_BAY/2;
 sash(cx,1.3,2.3,2.5,2);sash(cx,5.1,2.2,2.3,2);sash(cx,8.6,1.9,2,2);sash(cx,12.4,1.3,1.8,1);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=THREE.RepeatWrapping;t.wrapT=THREE.ClampToEdgeWrapping;
 return t;
}
