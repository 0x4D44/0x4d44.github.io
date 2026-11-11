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
import {prism,revolve,wallBox} from './waverley-frontage-mesh.ts';
import {PERTH_TEXTURE_TILE} from './perth-frontage-textures.ts';

/** The frontage's plan window in the Perth frame (x east, z south): the car park, the entrance, the hotel and King's Place. */
export const FRONTAGE_WINDOW={x0:-80,x1:125,z0:-175,z1:-20} as const;
/** The entrance (OSM node/561381370 entrance=yes) in the Perth frame. */
export const PERTH_ENTRANCE:Pt=[-3.03,-34.98];
/** ASSUMED from R-pt2-a: the single-storey street walls, the entrance pavilion (its blue-clad upper storey over a glazed, recessed ground
 *  floor on four posts), the pavement and its bollards. */
export const STREET_LEVELS={wall:4.3,coping:.25,flatDeep:9,slateBack:11,slateTop:8,gableBack:2,gableDeep:12,gableEaves:4.8,gableApex:8.2,pavilionWidth:10,pavilionFloor:3.2,pavilionTop:6.4,pavilionOut:1.2,pavilionDeep:7,pavement:4.2,kerb:.12,bollard:1.05,bollardPitch:2.9,bollardPitchKerb:3.3} as const;
/** ASSUMED carriageway widths (m) by OSM highway class; no widths are mapped here. */
export const ROAD_WIDTHS:Readonly<Record<string,number>>={primary:9,secondary:8,tertiary:7,residential:6,unclassified:6,service:5,parking_aisle:6,footway:2.4,pedestrian:4,path:2,cycleway:2.5,steps:2};
/** `navy` and `strip` read from R-pt2-a by eye: the pavilion's bands are a dark navy, about rgb 34,43,95 in the shade (the lit upper band reads
 *  paler). Round 6: the glazed strip (and the transoms under it) is R-pt2-a's reflective blue-black, about rgb 30,38,48 to 38,48,60 (ASSUMED, by eye);
 *  round 5's grey-blue 0x607386 read too light. The model's lighting lifts both, so the base colours sit a step darker than the photo's. The
 *  greens, `bark` and `boulder` are ASSUMED from R-pt2-a/b's bushes, tree and kerbside stones. Round 7: `mullion` is a navy-black (ASSUMED, by eye: the
 *  photo's strip frames are thin and dark, not white); the concourse behind the entrance glazing is a bright warm white (`concourse` 0xf4ead8, `concourseHi`
 *  0xfff6e6, and a floor, side returns and a grey dado, all ASSUMED) so it reads as a lit interior and not as more of the buff wall; the door and transom
 *  glass (`doorGlass`, `doorGlassHi`, `transom`) is a pale sky-blue, ASSUMED, the daylight reflection R-pt2-a's glazing shows over a bright interior.
 *  P2 round 8 (the round-7 score: the ground floor rendered (99,100,99), three times R-pt2-a's (33,32,42) over the entrance): the glass is a dark
 *  blue-grey reflective glass and the concourse behind it dim greys, with only the coved light band (`concourseHi`) bright, a lit point glimpsed
 *  through dark glass, as R-pt2-a shows; ASSUMED tones, aimed at the photo's mean. */
export const STREET_COLOURS={felt:0x56585b,sandstone:0x9b8b7c,slate:0x4b5059,buff:0xc4b393,coping:0xd6ccb4,navy:0x2d3e62,fascia:0x2c3036,lead:0x5b6066,glass:0x14191e,strip:0x232c38,mullion:0x182034,concourse:0x5f5b55,concourseHi:0xfff6e6,concourseCeil:0x77736b,concourseFloor:0x57534d,concourseSide:0x55524c,dado:0x4a4945,doorGlass:0x26303a,doorGlassHi:0x34404c,transom:0x2e3946,lit:0xd8d0bb,litDim:0x9c968a,lantern:0x5d6f7c,lampBlack:0x232527,shrub:0x4f6b34,shrubDark:0x3b5229,bushMid:0x466332,bushLight:0x5b7b3d,hedge:0x41602f,leaf:0x6f8f42,bark:0x4b4034,boulder:0x7b776f,frame:0x8e9398,sign:0xeeeeea,bollard:0x1d1e20,yellow:0xd8b62a,planter:0x2f5d9a,column:0xb9c2b8,asphalt:0x4d4f52,carpark:0x3c3e41,block:0x6f6863,paving:0x6f6863,footway:0x9a9389,kerb:0xb9b3a8,paint:0xe9e9e3} as const;

export interface FrontageFile {parking:{id:string;ring:number[][]}[];roads:{id:string;highway:string;service?:string;surface?:string;path:number[][]}[];bridge:{id:string;ring:number[][]}}
type Ground=Pick<Terrain,'heightAt'|'rangeUnder'>;
const inRing=([x,z]:Pt,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const ringOf=(r:number[][]):Pt[]=>r.map(p=>[p[0],p[1]]);

/** A flat area draped on the drawn ground `lift` above it: the polygon triangulated, then split until no edge is over 3 m. */
export function drape(b:Batch,ring:readonly Pt[],ground:Ground,lift:number,color:Rgb,mottle=0,colorAt?:(p:Pt)=>Rgb,keep:(p:Pt)=>boolean=()=>true,uvTile=0):void{
 const r=cleanRing(ring),y=(p:Pt)=>ground.heightAt(...p)+lift;let seed=7;
 const tint=(at?:Pt):Rgb=>{const base=at&&colorAt?colorAt(at):color;if(!mottle)return base;seed=(seed*16807)%2147483647;const k=1+(seed/2147483647-.5)*2*mottle;return [base[0]*k,base[1]*k,base[2]*k] as Rgb;};
 const put=(a:Pt,c:Pt,d:Pt,depth:number):void=>{
  const ab=Math.hypot(c[0]-a[0],c[1]-a[1]),bc=Math.hypot(d[0]-c[0],d[1]-c[1]),ca=Math.hypot(a[0]-d[0],a[1]-d[1]),m=Math.max(ab,bc,ca);
  if(m<=3||depth>10){const g:Pt=[(a[0]+c[0]+d[0])/3,(a[1]+c[1]+d[1])/3];
   if(keep(g)&&Math.abs((c[0]-a[0])*(d[1]-a[1])-(c[1]-a[1])*(d[0]-a[0]))>1e-9)b.poly([[a[0],y(a),a[1]],[c[0],y(c),c[1]],[d[0],y(d),d[1]]],uvTile?[a,c,d].map(q=>[q[0]/uvTile,q[1]/uvTile] as [number,number]):undefined,{facing:[0,1,0],color:tint(g)});return;}
  if(m===ab){const q:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2];put(a,q,d,depth+1);put(q,c,d,depth+1);}
  else if(m===bc){const q:Pt=[(c[0]+d[0])/2,(c[1]+d[1])/2];put(a,c,q,depth+1);put(a,q,d,depth+1);}
  else {const q:Pt=[(d[0]+a[0])/2,(d[1]+a[1])/2];put(a,c,q,depth+1);put(q,c,d,depth+1);}
 };
 for(const t of THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]))put(r[t[0]],r[t[1]],r[t[2]],0);
}
/** A strip `half` either side of a polyline, draped `lift` above the ground; segments whose midpoint `skip` refuses are left out. */
export function strip(b:Batch,path:readonly Pt[],half:number,ground:Ground,lift:number,color:Rgb,skip:(p:Pt)=>boolean,uvTile=0):void{
 const pts:Pt[]=[];
 for(let i=0;i+1<path.length;i++){const a=path[i],c=path[i+1],n=Math.max(1,Math.ceil(Math.hypot(c[0]-a[0],c[1]-a[1])/3));for(let k=0;k<n;k++)pts.push([a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n]);}
 pts.push(path.at(-1)!);
 const off=pts.map((p,i)=>{const a=pts[Math.max(0,i-1)],c=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;return [-(c[1]-a[1])/l*half,(c[0]-a[0])/l*half] as Pt;});
 for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1];if(skip([(a[0]+c[0])/2,(a[1]+c[1])/2]))continue;
  const q=[[a[0]+off[i][0],a[1]+off[i][1]],[c[0]+off[i+1][0],c[1]+off[i+1][1]],[c[0]-off[i+1][0],c[1]-off[i+1][1]],[a[0]-off[i][0],a[1]-off[i][1]]] as Pt[];
  b.poly(q.map(p=>[p[0],ground.heightAt(...p)+lift,p[1]] as V3),uvTile?q.map(p=>[p[0]/uvTile,p[1]/uvTile] as [number,number]):undefined,{facing:[0,1,0],color});}
}

/** `setts` (block paving) and `coursed` (the street walls) carry world-metre UVs for perth-frontage-textures.ts. */
export interface StreetBatches {front:Batch;glass:Batch;flat:Batch;paint:Batch;setts:Batch;coursed:Batch}

/** The forecourt: the mapped car parks, the roads and paths round the station front and the hotel, white bay lines along the mapped
 *  parking aisles (2.5 m bays, 4.8 m deep, ASSUMED), and the zebra crossing at the entrance (R-pt2-a). Nothing is drawn inside the
 *  station outline or the hotel. */
export function forecourt(b:StreetBatches,file:FrontageFile,ground:Ground,keepOut:readonly (readonly Pt[])[],leave:(p:Pt)=>boolean=()=>false):void{
 const C=STREET_COLOURS,W=FRONTAGE_WINDOW,out=(p:Pt)=>p[0]<W.x0||p[0]>W.x1||p[1]<W.z0||p[1]>W.z1||keepOut.some(r=>inRing(p,r))||leave(p);
 const paved=file.roads.find(r=>r.id==='way/44356824'),stationSide=(q:Pt):boolean=>{if(!paved)return false;
  let best=Infinity,side=0;for(let i=0;i+1<paved.path.length;i++){const a=paved.path[i],c=paved.path[i+1],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dz)/(dx*dx+dz*dz||1))),d=Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dz);
   if(d<best){best=d;side=Math.sign(dx*(q[1]-a[1])-dz*(q[0]-a[0]));}}
  const a=paved.path[0],c=paved.path[1],e=Math.sign((c[0]-a[0])*(PERTH_ENTRANCE[1]-a[1])-(c[1]-a[1])*(PERTH_ENTRANCE[0]-a[0]));return side===e;};
 const ST=PERTH_TEXTURE_TILE.setts;
 // R-pt2-a's foreground is block paving all the way to the camera, which stands 6 m north of the paved loop road (way/44356824): the setts
 // reach 9 m either side of that road's line (ASSUMED), not just its station side, so the frozen view has no asphalt wedge under it
 const SETT_REACH=9,nearPaved=(q:Pt):boolean=>{if(!paved)return false;
  for(let i=0;i+1<paved.path.length;i++){const a=paved.path[i],c=paved.path[i+1],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((q[0]-a[0])*dx+(q[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
   if(Math.hypot(q[0]-a[0]-t*dx,q[1]-a[1]-t*dz)<SETT_REACH)return true;}return false;};
 const settsAt=(q:Pt)=>stationSide(q)||nearPaved(q);
 for(const p of file.parking){drape(b.flat,ringOf(p.ring),ground,.05,rgb(C.carpark),.05,undefined,q=>!settsAt(q));drape(b.setts,ringOf(p.ring),ground,.05,rgb(C.block),.04,undefined,settsAt,ST);}
 const carriage=file.roads.filter(r=>!['footway','pedestrian','path','cycleway','steps'].includes(r.highway));
 const onCarriage=(p:Pt)=>file.parking.some(q=>inRing(p,ringOf(q.ring)))||carriage.some(r=>{const h=(ROAD_WIDTHS[r.service==='parking_aisle'?'parking_aisle':r.highway]??4)/2;
  for(let i=0;i+1<r.path.length;i++){const a=r.path[i],c=r.path[i+1],dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
   if(Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)<h)return true;}return false;});
 for(const r of file.roads){
  const kind=r.service==='parking_aisle'?'parking_aisle':r.highway,half=(ROAD_WIDTHS[kind]??4)/2;
  const foot=['footway','pedestrian','path','cycleway','steps'].includes(r.highway);
  const byEntrance=!foot&&r.path.some(q=>Math.hypot(q[0]-PERTH_ENTRANCE[0],q[1]-PERTH_ENTRANCE[1])<25)&&r.service!=='parking_aisle';
  const sett=!foot&&(r.surface==='paving_stones'||byEntrance),color=rgb(foot?C.footway:sett?C.paving:C.asphalt);
  if(byEntrance){const pts=ringOf(r.path);
   // the road's broken centre line: R-pt2-a's dashes are short, about 1 m with 2.5 m gaps (ASSUMED from the photo's foreground, ~25 px/m there)
   for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]);for(let x=1;x+1<l;){const p0:Pt=[a[0]+(c[0]-a[0])*x/l,a[1]+(c[1]-a[1])*x/l],p1:Pt=[a[0]+(c[0]-a[0])*(x+1)/l,a[1]+(c[1]-a[1])*(x+1)/l];
    if(!out(p0)&&!out(p1))strip(b.paint,[p0,p1],.06,ground,.12,rgb(C.paint),()=>false);x+=3.5;}}
   for(const [e,f2] of [[pts[0],pts[1]],[pts.at(-1)!,pts.at(-2)!]] as const){if(out(e))continue;const l=Math.hypot(f2[0]-e[0],f2[1]-e[1])||1,t2:Pt=[(f2[0]-e[0])/l,(f2[1]-e[1])/l],n2:Pt=[-t2[1],t2[0]];
    for(const k of [1.2,1.6])for(let o=-half+.2;o<half-.4;o+=1){const c0:Pt=[e[0]+t2[0]*k+n2[0]*o,e[1]+t2[1]*k+n2[1]*o],c1:Pt=[c0[0]+n2[0]*.6,c0[1]+n2[1]*.6];strip(b.paint,[c0,c1],.1,ground,.12,rgb(C.paint),()=>false);}}}
  strip(sett?b.setts:b.flat,ringOf(r.path),half,ground,foot?.11:kind==='parking_aisle'?.07:.08,color,foot?(p=>out(p)||onCarriage(p)):out,sett?ST:0);
  if(kind==='parking_aisle'){// three lamp columns along the aisle's edge (R-pt2-b): black, with a lantern hung from an arm either side; 7 m, ASSUMED
   const [a0,c0]=[r.path[0],r.path.at(-1)!],la=Math.hypot(c0[0]-a0[0],c0[1]-a0[1]),tt:Pt=[(c0[0]-a0[0])/la,(c0[1]-a0[1])/la];
   for(const f of [.2,.5,.8]){const q:Pt=[a0[0]+(c0[0]-a0[0])*f,a0[1]+(c0[1]-a0[1])*f],nn:Pt=[-(c0[1]-a0[1])/la,(c0[0]-a0[0])/la],lp:Pt=[q[0]+nn[0]*(half+5.2),q[1]+nn[1]*(half+5.2)];
    if(out(lp))continue;const y=ground.heightAt(...lp),k=rgb(C.lampBlack);
    prism(b.front,lp[0],lp[1],.16,y,y+.6,8,k);prism(b.front,lp[0],lp[1],.08,y+.6,y+7,8,k);prism(b.front,lp[0],lp[1],.12,y+6.9,y+7.15,8,k);
    for(const sg of [1,-1]){const arm:Pt=[lp[0]+tt[0]*sg*1.1,lp[1]+tt[1]*sg*1.1];wallBox(b.front,lp,arm,y+6.75,y+6.85,.035,k);
     prism(b.front,arm[0],arm[1],.04,y+6.45,y+6.8,6,k);// the hanger
     prism(b.front,arm[0],arm[1],.22,y+5.9,y+6.35,6,rgb(C.lit));// the lantern's glazed body (pale, as R-pt2-b's read by day)
     prism(b.front,arm[0],arm[1],.28,y+6.35,y+6.45,6,k);prism(b.front,arm[0],arm[1],.12,y+5.82,y+5.9,6,k);}}
   // two white arrows per aisle, the pair R-pt2-b shows in its foreground (the frozen hotel view stands on aisle way/454950537, 5.7 m up from its
   // station end, looking up it): one straight on, pointing away up the aisle toward the hotel, and one to its right turned 150 degrees, so
   // it points back and to the right (R-pt2-b's second: head lower right). Each is 3 m long, a 2 m shaft 0.36 m wide under a 1 m head 1 m wide (ASSUMED
   // by eye at ~19 px/m; the photo's are chunkier than the 0.2 m shaft this replaces). Placed 0.64/0.68 of the way up, 2.3 m left and 1.2 m
   // right of the centre line (ASSUMED): 9 to 14 m ahead of that camera, the lowest sixth of its frame, as in the photo.
   const aSouth=a0[1]>c0[1],hd:Pt=aSouth?tt:[-tt[0],-tt[1]],sp=aSouth?a0:c0,rt:Pt=[-hd[1],hd[0]];
   for(const [f,e,deg] of [[.64,-2.3,0],[.68,1.2,150]] as const){const q:Pt=[sp[0]+hd[0]*la*f+rt[0]*e,sp[1]+hd[1]*la*f+rt[1]*e];if(out(q))continue;
    const th=deg*Math.PI/180,d:Pt=[hd[0]*Math.cos(th)+rt[0]*Math.sin(th),hd[1]*Math.cos(th)+rt[1]*Math.sin(th)],pp:Pt=[-d[1],d[0]];
    const P2=(u:number,v:number):V3=>{const x=q[0]+d[0]*u+pp[0]*v,z=q[1]+d[1]*u+pp[1]*v;return [x,ground.heightAt(x,z)+.11,z];};
    b.paint.poly([P2(-1.5,-.18),P2(.5,-.18),P2(.5,.18),P2(-1.5,.18)],undefined,{facing:[0,1,0],color:rgb(C.paint)});
    b.paint.poly([P2(.4,-.5),P2(1.5,0),P2(.4,.5)],undefined,{facing:[0,1,0],color:rgb(C.paint)});}
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
 // the front edge holding the entrance: nearest the mapped entrance. The pavilion stands on it, and its ground floor is cut open through the stone
 // wall for the glazed bays and the concourse behind them (R-pt2-a), from the end posts' inner edges (0.12 m inside the pavilion's ends)
 let k=0,best=Infinity;for(let i=0;i+1<chain.length;i++){const a=chain[i],c=chain[i+1],l2=(c[0]-a[0])**2+(c[1]-a[1])**2,t=Math.max(0,Math.min(1,((PERTH_ENTRANCE[0]-a[0])*(c[0]-a[0])+(PERTH_ENTRANCE[1]-a[1])*(c[1]-a[1]))/l2));
  const d=Math.hypot(a[0]+(c[0]-a[0])*t-PERTH_ENTRANCE[0],a[1]+(c[1]-a[1])*t-PERTH_ENTRANCE[1]);if(d<best){best=d;k=i;}}
 const eA=chain[k],eC=chain[k+1],eL=Math.hypot(eC[0]-eA[0],eC[1]-eA[1]),eS=((PERTH_ENTRANCE[0]-eA[0])*(eC[0]-eA[0])+(PERTH_ENTRANCE[1]-eA[1])*(eC[1]-eA[1]))/eL;
 const cut0=eS-S.pavilionWidth/2+.12,cut1=eS+S.pavilionWidth/2-.12;
 let run=0;
 for(let i=0;i+1<chain.length;i++){const a=chain[i],c=chain[i+1],n=outward(a,c),len=Math.hypot(c[0]-a[0],c[1]-a[1]),T=PERTH_TEXTURE_TILE.coursed;
  const stone=(sa:number,sb:number)=>{if(sb-sa<.01)return;// coursed stone (R-pt2-a), UVs running along the front: the wall from `sa` to `sb` metres along this edge
   const p:Pt=[a[0]+(c[0]-a[0])*sa/len,a[1]+(c[1]-a[1])*sa/len],q:Pt=[a[0]+(c[0]-a[0])*sb/len,a[1]+(c[1]-a[1])*sb/len],u0=(run+sa)/T,u1=(run+sb)/T;
   b.coursed.poly([[p[0],foot,p[1]],[q[0],foot,q[1]],[q[0],P+S.wall,q[1]],[p[0],P+S.wall,p[1]]],[[u0,foot/T],[u1,foot/T],[u1,(P+S.wall)/T],[u0,(P+S.wall)/T]],{facing:[n[0],0,n[1]],color:rgb(C.buff)});};
  if(i===k){stone(0,cut0);stone(cut1,len);}else stone(0,len);
  run+=len;
  const ca:Pt=[a[0]+n[0]*.1,a[1]+n[1]*.1],cc:Pt=[c[0]+n[0]*.1,c[1]+n[1]*.1];
  wallBox(b.front,[(a[0]+ca[0])/2,(a[1]+ca[1])/2],[(c[0]+cc[0])/2,(c[1]+cc[1])/2],P+S.wall,P+S.wall+S.coping,.25,rgb(C.coping),.12);
 }
 // the front edge holding the entrance: the pavilion, its posts and glazing, the shop and booking-hall glazing either side (R-pt2-a)
 const a=chain[k],c=chain[k+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),t:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l],n=outward(a,c);
 const sE=(PERTH_ENTRANCE[0]-a[0])*t[0]+(PERTH_ENTRANCE[1]-a[1])*t[1];
 const at=(s:number,o:number):Pt=>[a[0]+t[0]*s+n[0]*o,a[1]+t[1]*s+n[1]*o];
 const box=(s0:number,s1:number,o0:number,o1:number,y0:number,y1:number,color:number,batch=b.front)=>{const p=at(s0,(o0+o1)/2),q=at(s1,(o0+o1)/2);wallBox(batch,p,q,P+y0,P+y1,(o1-o0)/2,rgb(color));};
 const pane=(s0:number,s1:number,y0:number,y1:number,o=.04,color:number=C.glass)=>{const p=at(s0,o),q=at(s1,o);
  b.glass.poly([[p[0],P+y0,p[1]],[q[0],P+y0,q[1]],[q[0],P+y1,q[1]],[p[0],P+y1,p[1]]],undefined,{facing:[n[0],0,n[1]],color:rgb(color)});};
 const w=S.pavilionWidth,s0=sE-w/2,s1=sE+w/2;
 const bandLo=S.pavilionFloor+1.1,bandHi=S.pavilionTop-1;// ASSUMED from R-pt2-a: a 1.1 m lower band, a 1.9 m window strip, a 1 m upper band
 box(s0,s1,-S.pavilionDeep,S.pavilionOut,S.pavilionFloor,bandLo,C.navy);box(s0,s1,-S.pavilionDeep,S.pavilionOut,bandHi,S.pavilionTop,C.navy);
 // the window strip, set back 0.25 m: R-pt2-a's reads as dark glazing in thin frames. Round 7: the mullions are navy-black and 0.06 m wide standing 0.05 m
 // proud (round 6: white, 0.14 m wide, 0.11 m proud, which read heavier than the photo's thin frames), and the transom rail is 0.05 m (all ASSUMED, by eye)
 box(s0+.05,s1-.05,-S.pavilionDeep,S.pavilionOut-.25,bandLo,bandHi,C.strip,b.glass);
 for(let k=0;k<=12;k++){const s=s0+.1+k*(w-.2)/12;box(s-.03,s+.03,S.pavilionOut-.3,S.pavilionOut-.2,bandLo,bandHi,C.mullion);}// its mullions
 box(s0+.1,s1-.1,S.pavilionOut-.3,S.pavilionOut-.2,bandLo+1.2,bandLo+1.25,C.mullion);
 // the blank sign panel ON the upper band's fascia (R-pt2-a: a light panel 78 px by 10 px at 19.5 px/m, 4 m by 0.5 m, centred, ASSUMED), no lettering and no
 // logo drawn; it replaces round 5's white box standing on the roof. A thin grey frame sits behind it, on the band's face.
 pane(sE-2.06,sE+2.06,bandHi+.19,bandHi+.81,S.pavilionOut+.01,C.frame);pane(sE-2,sE+2,bandHi+.25,bandHi+.75,S.pavilionOut+.02,C.sign);
 const posts=[s0+.3,sE-1.7,sE+1.7,s1-.3];
 for(const s of posts)box(s-.18,s+.18,S.pavilionOut-.5,S.pavilionOut-.14,0,S.pavilionFloor,C.navy);// four posts
 // the ground floor (R-pt2-a), opened through the stone wall above: three glazed bays between the four posts. Round 7: it must read as GLAZING over a LIT
 // interior, as R-pt2-a's mostly-glass front does, not as doors in a wall. So each bay is a thin navy frame grid (0.05 m members, ASSUMED) round open lights
 // that show a bright warm-white concourse (`concourse`/`concourseHi`, not the buff of the wall), with pale sky-blue glass in the door leaves and over the
 // transom (the daylight reflection R-pt2-a's glass shows, ASSUMED; the glass batch is opaque, so the open lights stand for clear glass). Glazed door leaves in
 // the glazing plane (0.9 to 1 m wide, 2.2 m high, from the photo's 2.2 m doors, ASSUMED); behind them the concourse 3.6 m deep (ASSUMED, "a few metres in"):
 // a back wall with a lit panel to each bay and a coved light band, a floor, a ceiling and side returns. The walls are `front`, the leaves and transoms `glass`:
 // no new batch. Every size here is ASSUMED from R-pt2-a: the door head rail at 2.22 m, a 0.35 m open light over it to a rail at 2.62 m, the transom glass
 // 2.66 m to the pavilion's underside (3.2 m), the ceiling at 3.15 m, the light band at 2.55 to 2.9 m, the lit panels 0.85 to 2.4 m, the dado 0.8 m, the
 // floor level with the 0.12 m pavement, a mid-rail at 1 m and a 0.2 m kick rail across every bay (the leaves' head, push rail and kick are those rails).
 {const i0=s0+.12,i1=s1-.12,D=3.6,yc=S.pavilionFloor-.05,face:V3=[n[0],0,n[1]],wall=rgb(C.concourse),hi=rgb(C.concourseHi);
  const V=(s:number,o:number,y:number):V3=>{const p=at(s,o);return [p[0],P+y,p[1]];};
  b.front.poly([V(i0,-D,-.05),V(i1,-D,-.05),V(i1,-D,yc),V(i0,-D,yc)],undefined,{facing:face,color:wall});// the back wall: a dim grey in the interior's gloom (P2 round 8), not buff
  b.front.poly([V(i0,-D+.01,-.05),V(i1,-D+.01,-.05),V(i1,-D+.01,.8),V(i0,-D+.01,.8)],undefined,{facing:face,color:rgb(C.dado)});// its dado, a cool grey so it is not the wall's buff
  b.front.poly([V(i0,-D+.01,2.55),V(i1,-D+.01,2.55),V(i1,-D+.01,2.9),V(i0,-D+.01,2.9)],undefined,{facing:face,color:hi});// the coved light band under the ceiling
  b.front.poly([V(i0,0,.13),V(i1,0,.13),V(i1,-D,.13),V(i0,-D,.13)],undefined,{facing:[0,1,0],color:rgb(C.concourseFloor)});// the floor, level with the pavement
  b.front.poly([V(i0,0,yc),V(i1,0,yc),V(i1,-D,yc),V(i0,-D,yc)],undefined,{facing:[0,-1,0],color:rgb(C.concourseCeil)});// the ceiling, a dim grey (P2 round 8): only the light band reads lit
  for(const [s,sg] of [[i0,1],[i1,-1]] as const)b.front.poly([V(s,0,-.05),V(s,-D,-.05),V(s,-D,yc),V(s,0,yc)],undefined,{facing:[t[0]*sg,0,t[1]*sg],color:rgb(C.concourseSide)});// the side returns
  const leaf=(sa:number,sb:number)=>{box(sa,sa+.05,-.02,.1,.1,2.22,C.navy);box(sb-.05,sb,-.02,.1,.1,2.22,C.navy);
   pane(sa+.05,sb-.05,.3,.96,.05,C.doorGlass);pane(sa+.05,sb-.05,1.02,2.22,.05,C.doorGlassHi);};// a leaf: two stiles, a darker lower pane under a paler upper one (the bay's rails, below, are its kick, push rail and head)
  for(let j=0;j<3;j++){const sa=posts[j]+.18,sb=posts[j+1]-.18,c=(sa+sb)/2,leaves:readonly [number,number][]=j===1?[[c-.92,c-.02],[c+.02,c+.92]]:[[c-.5,c+.5]];// a pair of leaves in the middle bay, one in each side bay
   pane(sa,sb,2.66,S.pavilionFloor,.05,C.transom);box(sa,sb,-.02,.1,2.62,2.66,C.navy);box(sa,sb,-.02,.1,2.22,2.27,C.navy);// the glazed transom, over a rail; the light under it stays open on the concourse
   box(sa,sb,-.02,.1,.1,.3,C.navy);box(sa,sb,-.02,.1,.96,1.02,C.navy);// a kick rail and a mid-rail across the whole bay, framing the open lights beside the leaves
   for(const [la,lb] of leaves){leaf(la,lb);for(const x of [la,lb])box(x-.025,x+.025,-.02,.1,2.27,S.pavilionFloor,C.navy);}// each leaf's stiles run up through the transom as thin mullions
   b.front.poly([V(sa+.3,-D+.015,.85),V(sb-.3,-D+.015,.85),V(sb-.3,-D+.015,2.4),V(sa+.3,-D+.015,2.4)],undefined,{facing:face,color:hi});}// a lit panel on the back wall behind each bay
 }
 // east of the entrance (R-pt2-a, left): a shop front - dark glazing in a blue frame with a glazed door, a blank fascia over it (no
 // lettering drawn) - and a notice case. Sizes ASSUMED from R-pt2-a at about 19.5 px/m.
 pane(s1+1.2,s1+5.4,.25,2.75,.03,C.navy);pane(s1+1.3,s1+5.3,.35,2.65,.06);
 // the lit interior seen through it (R-pt2-a): pale shelving panels and a bright ceiling band, drawn just proud of the dark pane
 for(const [u0,u1,y0,y1,col] of [[1.45,2.4,.5,2.2,C.lit],[3.8,5.15,.5,2.2,C.lit],[1.4,5.2,2.3,2.6,C.lit],[2.55,3.65,.45,1.4,C.litDim]] as const)pane(s1+u0,s1+u1,y0,y1,.065,col);
 for(const s of [s1+2.6,s1+3.6])box(s-.04,s+.04,.04,.12,.35,2.65,C.navy);// the door's frame
 box(s1+1.1,s1+5.5,0,.18,2.8,3.3,C.fascia);
 pane(s1+5.9,s1+7.1,.4,2.4,.04,C.frame);
 // west of the entrance (R-pt2-a, right): the glazed lean-to bay, blue-framed and mullioned, 2.2 m deep, its roof falling from 3.3 m at
 // the wall to 2.7 m at its front (ASSUMED), on a 0.35 m buff upstand
 {const b0=s0-7.6,b1=s0-1.2,dp=2.2,hb=3.3,hf=2.7,k=Math.round((b1-b0)/1.1);
  box(b0,b1,0,dp,0,.35,C.buff);
  const glassQuad=(p:Pt,q:Pt,y0:number,y1p:number,y1q:number,face:Pt)=>b.glass.poly([[p[0],P+y0,p[1]],[q[0],P+y0,q[1]],[q[0],P+y1q,q[1]],[p[0],P+y1p,p[1]]],undefined,{facing:[face[0],0,face[1]],color:rgb(C.glass)});
  glassQuad(at(b0,dp),at(b1,dp),.35,hf,hf,n);
  // its lit interior (R-pt2-a): white panels and a bright ceiling band behind every other light, just proud of the glass
  for(let i=0;i<k;i++){const x0=b0+(b1-b0)*i/k,x1=b0+(b1-b0)*(i+1)/k;
   const lit=(y0:number,y1:number)=>{const p=at(x0+.12,dp+.006),q=at(x1-.12,dp+.006);b.glass.poly([[p[0],P+y0,p[1]],[q[0],P+y0,q[1]],[q[0],P+y1,q[1]],[p[0],P+y1,p[1]]],undefined,{facing:[n[0],0,n[1]],color:rgb(C.lit)});};
   lit(hf-.5,hf-.25);if(i%2===0)lit(.55,1.9);}
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
 // the pavement: 4.2 m out to a kerb, block paving, black bollards with two yellow bands, blue planters, kerbside boulders (R-pt2-a). It runs
 // the whole frontage the photo shows: 16.5 m either side of the entrance, so the shop front and the glazed bay stand on it (the walls beyond
 // the edge's end are within 0.1 m of its line for that far), and never less than the edge itself.
 const sLo=Math.min(-1,sE-16.5),sHi=Math.max(l+1,sE+16.5);
 const pv:Pt[]=[at(sLo,0),at(sHi,0),at(sHi,S.pavement),at(sLo,S.pavement)];
 drape(b.setts,pv,ground,S.kerb,rgb(C.footway),0,undefined,()=>true,PERTH_TEXTURE_TILE.setts);
 for(let s=sLo;s<sHi;s+=4){const k0=at(s,S.pavement),k1=at(Math.min(sHi,s+4),S.pavement),g=ground.heightAt((k0[0]+k1[0])/2,(k0[1]+k1[1])/2);wallBox(b.flat,k0,k1,g-.05,g+S.kerb+.01,.08,rgb(C.kerb));}
 // R-pt2-a's bollards: dark posts, 1.05 m tall and 0.22 m across (round 6: the near row's stand about 30 px tall by 8 px wide against the pavilion's 3.2 m
 // ground floor at 54 px, so a little over 1 m by 0.25 m, ASSUMED; round 5's 1 m by 0.16 m read too small), two yellow bands near the top, in two rows
 // the length of the front: a back row by the wall (R-pt2-a: about every 55 px at 19.5 px/m, 2.9 m) and a kerb row ON the kerb line (every 73 to 97 px
 // at about 26 px/m, 3.3 m; their feet sit on the pavement's front edge in the photo, so they stand 0.1 m inside the kerb's centre line, their outer
 // edge on the kerb stone), a gap at the crossing (ASSUMED from the photo's count: ten to a row across the frame). The back row stands 1.7 m out,
 // clear of the pavilion's 1.2 m projection.
 const post=(s:number,o:number)=>{const p=at(s,o),y=ground.heightAt(...p)+S.kerb;
  prism(b.front,p[0],p[1],.11,y,y+S.bollard,10,rgb(C.bollard));
  for(const [y0,y1] of [[.72,.8],[.88,.96]])prism(b.front,p[0],p[1],.115,y+y0,y+y1,10,rgb(C.yellow),Math.PI/10,false);};
 for(let j=0;j<5;j++)for(const sg of [-1,1]){post(sE+sg*(2.5+S.bollardPitchKerb*j),S.pavement-.1);post(sE+sg*(1.5+S.bollardPitch*j),1.7);}
 // a few kerbside boulders by the blue planters (R-pt2-a, left: a rock beside the planters): low grey stones 0.4 to 0.6 m across, 0.45 to 0.6 m high, ASSUMED
 for(const [s,o,R,H,key] of [[s1+5.4,3.0,.55,.6,11],[s1+6.4,3.5,.4,.45,12],[s0-3.4,3.3,.5,.55,13]] as const){const p=at(s,o);
  lobe(b.front,p[0],p[1],ground.heightAt(...p)+S.kerb-.06,R,H,6,shade(rgb(C.boulder),.9+hash(key,1)*.2),key,.28,.95);}
 for(const s of [s1+1.5,s1+3.6,s0-2.2,s0-8.5]){const p=at(s,S.pavement-1.4),y=ground.heightAt(...p)+S.kerb,key=60+Math.round(s*4);
  prism(b.front,p[0],p[1],.6,y,y+.62,12,rgb(C.planter));
  // the planted shrub (round 6): a rounded dome rising from the rim, 0.9 m across and 0.7 m over it, and a lower one beside it (ASSUMED from R-pt2-a's 1 m planters), not a flat cylinder
  lobe(b.front,p[0],p[1],y+.5,.45,.82,12,shade(rgb(C.shrub),.96+.1*hash(key,1)),key,.1,.8,BUSH_RINGS);
  const a2=hash(key,2)*2*Math.PI;lobe(b.front,p[0]+Math.cos(a2)*.3,p[1]+Math.sin(a2)*.3,y+.5,.3,.62,10,shade(rgb(C.shrubDark),.96+.1*hash(key,3)),key+1,.1,.8,BUSH_RINGS);}
 for(let o=S.pavement+.6;o<S.pavement+6.6;o+=1){const p=at(sE-1.6,o),q=at(sE+1.6,o);strip(b.paint,[p,q],.25,ground,.1,rgb(C.paint),()=>false);}
 return {chain,P};
}

/** A seeded hash of a few numbers into [0,1): the same input gives the same number in every build (no Math.random, so the scene is deterministic). */
function hash(...k:number[]):number{let h=0x811c9dc5;for(const v of k){h^=Math.imul(Math.round(v*64)|0,0x85ebca6b);h=Math.imul(h^(h>>>15),0xc2b2ae35);h^=h>>>13;}return (h>>>0)/4294967296;}
const shade=(c:Rgb,k:number):Rgb=>[c[0]*k,c[1]*k,c[2]*k];

/** A lobe's rings from the foot up, each [radius as a fraction of R, height as a fraction of H]; the cap closes the last at the apex (H). */
type Rings=readonly (readonly [number,number])[];
/** A bush's lobe (round 6): a foot and three stacked rings of decreasing radius (1, 0.86 and 0.5 of R, ASSUMED), a rounded dome rather than a cube. */
const BUSH_RINGS:Rings=[[.8,0],[1,.3],[.86,.62],[.5,.88]];
/** A tree crown's lobe (round 6): a foot, then four rings swelling to the belly at 0.45 H and closing in a domed shoulder (ASSUMED). */
const CROWN_RINGS:Rings=[[.74,0],[.97,.18],[1,.45],[.88,.7],[.6,.9]];

/**
 * A low-sided rounded mass about (x, z) rising H from y0: by default a foot ring (`foot` of R), a belly ring (R, at 0.4 H), a shoulder ring (0.74 R, at 0.8 H)
 * and a cap, each facet flat; `rings` gives the profile instead (BUSH_RINGS, CROWN_RINGS), `under` closes the foot with a flat underside. Every vertex's
 * radius, height and angle is pulled about by up to `jit` from the hash of `key`, so no two read alike. One lobe is (2 x bands + 1) x `sides` triangles
 * (5 x `sides` by default); bushes, tree crowns and boulders are built from them. `smooth` (round 7, the tree crown) shades every vertex with the normal of the
 * lobe's ellipsoid (half-axes R and 0.55 H about its mid-height, ASSUMED) instead of its facet's, so the many small triangles blend into one soft mass and the
 * ring-to-ring tone steps are small (0.94 to 1.04 of the colour, against 0.88 to 1.08).
 */
function lobe(b:Batch,x:number,z:number,y0:number,R:number,H:number,sides:number,color:Rgb,key:number,jit:number,foot=.78,rings?:Rings,under=false,smooth=false):void{
 const ring:Rings=rings??[[foot,0],[1,.4],[.74,.8]],top=ring.length-1,ang=(i:number)=>(i+(hash(key,i,3)-.5)*.5)*2*Math.PI/sides;
 const at=(k:number,i:number):V3=>{const a=ang(i),r=R*ring[k][0]*(1+(hash(key,i,k)-.5)*2*jit);return [x+r*Math.cos(a),y0+ring[k][1]*H*(1+(hash(key,i,k+5)-.5)*jit),z+r*Math.sin(a)];};
 const apex:V3=[x+(hash(key,7)-.5)*R*.3,y0+H*(1+(hash(key,8)-.5)*jit*.5),z+(hash(key,9)-.5)*R*.3];
 const cy=y0+H*.5,ry=H*.55,nrm=(p:V3):V3=>{const nx=(p[0]-x)/(R*R),ny=(p[1]-cy)/(ry*ry),nz=(p[2]-z)/(R*R),l=Math.hypot(nx,ny,nz)||1;return [nx/l,ny/l,nz/l];};
 const lo=smooth?.94:.88,span=smooth?.1:.2;
 for(let i=0;i<sides;i++){const j=(i+1)%sides,am=(i+.5)*2*Math.PI/sides,out:V3=[Math.cos(am),0,Math.sin(am)];
  for(let k=0;k<top;k++){const c=shade(color,lo+span*k/top),p0=at(k,i),p1=at(k,j),p2=at(k+1,j),p3=at(k+1,i);
   if(smooth){b.poly([p0,p1,p2],undefined,{normals:[nrm(p0),nrm(p1),nrm(p2)],color:c});b.poly([p0,p2,p3],undefined,{normals:[nrm(p0),nrm(p2),nrm(p3)],color:c});}
   else{b.poly([p0,p1,p2],undefined,{facing:out,color:c});b.poly([p0,p2,p3],undefined,{facing:out,color:c});}}
  const t0=at(top,i),t1=at(top,j),cap=shade(color,smooth?1.04:1.08);
  if(smooth)b.poly([t0,t1,apex],undefined,{normals:[nrm(t0),nrm(t1),nrm(apex)],color:cap});
  else b.poly([t0,t1,apex],undefined,{facing:[out[0]*.3,1,out[2]*.3],color:cap});
  if(under)b.poly([[x,y0,z],at(0,j),at(0,i)],undefined,{facing:[0,-1,0],color:shade(color,.7)});}
}

/** A bush: 2 to 4 overlapping lobes (a tall one in the middle, the rest round it) of varied greens, about `w` across and `h` high, each a 12-sided dome of
 *  stacked rings (round 6; 84 triangles a lobe against round 5's 8-sided 40). Returns the lobes placed. */
function bush(b:Batch,ground:Ground,ok:(p:Pt)=>boolean,x:number,z:number,w:number,h:number,key:number):number{
 const C=STREET_COLOURS,greens=[C.shrub,C.shrubDark,C.bushMid,C.bushLight],n=2+Math.floor(hash(key,1)*3),a0=hash(key,2)*2*Math.PI;let placed=0;
 for(let i=0;i<n;i++){
  const a=a0+(i-1)*2*Math.PI/Math.max(1,n-1)+(hash(key,3,i)-.5)*.7,d=i===0?0:w*(.2+.1*hash(key,4,i)),px=x+Math.cos(a)*d,pz=z+Math.sin(a)*d;
  if(!ok([px,pz]))continue;
  const R=w*(i===0?.3:.24+.04*hash(key,5,i)),H=h*(i===0?1:.66+.24*hash(key,6,i));
  lobe(b,px,pz,ground.heightAt(px,pz)-.12,R,H+.12,12,shade(rgb(greens[Math.floor(hash(key,7,i)*greens.length)]),.92+.16*hash(key,8,i)),key*10+i,.12,.78,BUSH_RINGS);placed++;}
 return placed;
}

/**
 * A clipped hedge run from `from` to `to`, `h` high and 2 x `half` wide, as a rounded mound and not a box (round 6: round 5's was a stack of three boxes; round 7:
 * round 6's still read as a long box at the frozen view's range). It is swept: a section that tucks in at the foot, bellies out at 14% of its height and closes
 * in a rounded crown (a half-ellipse, 17 points), cut every 0.25 m. Along its length it is a string of rounded lobes about 1.1 m long (ASSUMED), each a hump
 * with a creased valley between it (height and width follow sin^0.6 of the lobe's phase: -12% in the crease to +5% at the crown, width -10% to +4%), each lobe
 * also a little taller or lower than the next (+-14%) and a little wider (+-8%), so the top line steps and the sides scallop. Both ends close in a quarter-ellipse
 * over 0.55 m (ASSUMED) down to a fifth of the width and a third of the height. Every vertex takes its normal from its neighbours, so it shades as one soft mass.
 * Lower facets are darker, upper paler. About 600 triangles for a 4 m run. The proportions are ASSUMED from R-pt2-b's bush (about 3.9 m by 2.2 m at 20 px/m,
 * the height here capped by the round's brief).
 */
function hedge(b:Batch,ground:Ground,from:Pt,to:Pt,half:number,h:number,key:number):void{
 const len=Math.hypot(to[0]-from[0],to[1]-from[1])||1,d:Pt=[(to[0]-from[0])/len,(to[1]-from[1])/len],sv:Pt=[-d[1],d[0]],n=Math.max(2,Math.round(len/.25)),m=Math.max(2,Math.round(len/1.1)),tipR=Math.min(.55,len/4);
 // the section left to right over the top: [across as a fraction of half, up as a fraction of the height]
 const right:[number,number][]=[[.86,0],[1,.14],[.97,.36],[.88,.56],[.74,.74],[.54,.88],[.3,.96],[.1,.995]],sec:[number,number][]=[...right.map(([u,v])=>[-u,v] as [number,number]),[0,1],...[...right].reverse()];
 const st=Array.from({length:n+1},(_,i)=>{const s=len*i/n,f=s/len*m,lobeNo=Math.min(Math.floor(f),m-1),bump=Math.pow(Math.sin(Math.PI*(f-lobeNo)),.6);// 0 in a crease, 1 mid-lobe
  const e=Math.min(s,len-s),tip=e<tipR?Math.sqrt(1-((tipR-e)/tipR)**2):1;// the quarter-ellipse closing each end
  const p:Pt=[from[0]+d[0]*s,from[1]+d[1]*s],top=h*(.88+.17*bump)*(1+.14*(hash(key,lobeNo,2)-.5)*2)*(.33+.67*tip),wide=half*(.9+.14*bump)*(1+.08*(hash(key,lobeNo,5)-.5)*2)*(.2+.8*tip);
  return {p,y:ground.heightAt(p[0],p[1])-.05,top,wide,col:shade(rgb(STREET_COLOURS.hedge),.92+.16*hash(key,lobeNo))};});
 const V=(i:number,j:number):V3=>{const q=st[i],[u,v]=sec[j];return [q.p[0]+sv[0]*u*q.wide,q.y+v*q.top,q.p[1]+sv[1]*u*q.wide];};
 // a vertex's normal: the cross of its neighbours' spans along the run and across the section, turned to point away from the hedge's core (0.3 of its height up its axis)
 const P=(i:number,j:number):V3=>V(Math.max(0,Math.min(n,i)),Math.max(0,Math.min(sec.length-1,j)));
 const N=(i:number,j:number):V3=>{const a=P(i-1,j),c=P(i+1,j),e=P(i,j-1),f=P(i,j+1),q=V(i,j),o:V3=[q[0]-st[i].p[0],q[1]-st[i].y-.3*st[i].top,q[2]-st[i].p[1]],ol=Math.hypot(...o)||1;
  const t1:V3=[c[0]-a[0],c[1]-a[1],c[2]-a[2]],t2:V3=[f[0]-e[0],f[1]-e[1],f[2]-e[2]];let x=t1[1]*t2[2]-t1[2]*t2[1],y=t1[2]*t2[0]-t1[0]*t2[2],z=t1[0]*t2[1]-t1[1]*t2[0];const l=Math.hypot(x,y,z);
  if(l<1e-9)return [o[0]/ol,o[1]/ol,o[2]/ol];if(x*o[0]+y*o[1]+z*o[2]<0){x=-x;y=-y;z=-z;}return [x/l,y/l,z/l];};
 for(let i=0;i<n;i++)for(let j=0;j+1<sec.length;j++){const v=(sec[j][1]+sec[j+1][1])/2;
  b.poly([V(i,j),V(i,j+1),V(i+1,j+1),V(i+1,j)],undefined,{normals:[N(i,j),N(i,j+1),N(i+1,j+1),N(i+1,j)],color:shade(st[i].col,.92+.16*v)});}
 for(const [i,sg] of [[0,-1],[n,1]] as const)b.poly(sec.map((_,j)=>V(i,j)),undefined,{facing:[d[0]*sg,0,d[1]*sg],color:shade(st[i].col,1.02)});
}

/** A cordyline (R-pt2-b's palm-like plant before the centre bays): a short stout trunk 2.2 m tall and a tuft of narrow lens-shaped leaves (0.28 m wide), 24 of them in four tiers (steep to drooping), the tuft about 3.4 m across. */
function cordyline(b:Batch,ground:Ground,x:number,z:number,key:number):void{
 const C=STREET_COLOURS,y=ground.heightAt(x,z),top=y+2.2,leaf=rgb(C.leaf);
 prism(b,x,z,.11,y-.1,top,6,rgb(C.bark));
 for(let i=0;i<24;i++){const tier=i%4,al=(i+(hash(key,i)-.5)*.6)*2*Math.PI/24,el=[75,50,28,6][tier]*Math.PI/180,L=[1.1,1.5,1.7,1.6][tier]*(.9+.2*hash(key,i,2));
  const dx=Math.cos(al)*Math.cos(el),dy=Math.sin(el),dz=Math.sin(al)*Math.cos(el),sx=-Math.sin(al),sz=Math.cos(al);
  const at=(f:number,w:number):V3=>[x+dx*L*f+sx*w,top+dy*L*f-(tier===3?.4*f*f:0),z+dz*L*f+sz*w];// along the leaf (0..1) and across it, a leaf drooping toward its tip in the last tier
  const N:V3=[-Math.cos(al)*dy,Math.cos(el),-Math.sin(al)*dy],col=shade(leaf,.85+.3*hash(key,i,3)),leafPts=[at(0,.05),at(.35,.14),at(1,0),at(.35,-.14),at(0,-.05)];// a lens 0.28 m wide
  b.poly(leafPts,undefined,{facing:N,color:col});b.poly([...leafPts].reverse(),undefined,{facing:[-N[0],-N[1],-N[2]],color:col});}// both faces: a leaf has no back
}

/**
 * A mature broadleaf tree (R-pt2-b's, east of the hotel's corner tower; round 6 scales it to the photograph): 17 m to the crown's top, a trunk 0.9 m across at the
 * foot tapering to 0.4 m at 9 m, a crown 13 m across from 4.6 m up, built of 19 rounded 22-sided lobes in five tiers: a core, a skirt of six, a middle tier of six
 * (turned half a step), an upper tier of five and a cap. About 3,900 triangles (round 6: 14-sided, flat-shaded, about 2,500). Size worked out from R-pt2-b against the hotel's levels (HOTEL_LEVELS: eaves 11.4 m,
 * east gable apex 18.6 m, corner-tower tip 22.5 m; about 22 px/m on the front at 1024 px wide): the crown's top reaches the tower tip's height (photo y 132 against
 * 118 for the tip, 170 for the apex) and its left edge the east gable bay (photo x 745), so 15 to 18 m tall and 13 m or more across. ASSUMED, by eye.
 * Round 7 (the scorer's F2: "faceted, bright-green, gem-like", where R-pt2-b's is a soft, irregular, darker broadleaf): the crown is shaded smooth (each lobe's
 * vertices take their ellipsoid's normal, see `lobe`), its greens are darker and less saturated (about 0x3b4f2e against 0x45682c; the photo's crown is mostly
 * shade, an olive near rgb 40,60,35, with pale yellow-green only on its lit tops, ASSUMED by eye), they differ less from lobe to lobe, and the tiers' placing
 * is looser (+-14% in distance, +-0.45 m in height, against +-8% and +-0.25 m) so the silhouette is irregular.
 */
function tree(b:Batch,ground:Ground,x:number,z:number,key:number):void{
 const y=ground.heightAt(x,z),greens=[0x3b4f2e,0x44593a,0x33452a,0x3e5231];
 revolve(b,x,z,[[.45,y-.12],[.36,y+2.5],[.28,y+5],[.2,y+9]],8,rgb(STREET_COLOURS.bark));
 // tiers: [count, ring distance from the trunk, foot height, R, H], all ASSUMED
 const tiers:[number,number,number,number,number][]=[[1,0,6.2,4.4,9.6],[6,3.9,4.6,2.9,5.2],[6,3.7,7.8,3,5.8],[5,2.1,10.8,2.6,5],[1,0,13.2,2.4,3.8]];
 let n=0;
 tiers.forEach(([count,dist,y0,R,H],t)=>{for(let i=0;i<count;i++,n++){
  const a=(i+(t%2?.5:0)+(hash(key,n,1)-.5)*.4)*2*Math.PI/count,d=dist*(1+(hash(key,n,2)-.5)*.28),dy=(hash(key,n,3)-.5)*.9,sun=.86+.16*Math.min(1,(y0+H/2-4)/10);
  lobe(b,x+Math.cos(a)*d,z+Math.sin(a)*d,y+y0+dy,R,H,22,shade(rgb(greens[n%4]),sun*(.96+.08*hash(key,n))),key*100+n,.12,.7,CROWN_RINGS,y0<5,true);}});
}

/**
 * The planting before the Station Hotel (R-pt2-b), in plan on the hotel's own frame: A is the middle front's west end (OSM -25.3,-97.8, as hotelFrame),
 * `m` runs along the front toward its east end (OSM -8.7,-104.7, 18 m) and `o` out from it over the car park. R-pt2-b, read at about 18.6 px/m along
 * the front: a clipped hedge-like bush 4.7 m along, a dark mass at 8.9, a cordyline at 12.5, a bush at 14.6, a tall narrow shrub at the east end, and a
 * big tree east of the corner tower (about 26 m along); the model draws them 1.4 to 2.2 m out from the wall (ASSUMED), a clipped hedge mound (1.3 m high, 4.2 m long)
 * in place of the first bush, rounded and lobed along its length (rounds 6 and 7), bush clusters 1.2 to 1.6 m high and 2 to 3 m across, each of 2 to 4 domed lobes 1.2 to 1.8 m
 * wide (the photo's are a little bigger; the round's brief caps them), the cordyline 3.5 m, and the tree 17 m (round 6, scaled to the photograph: see `tree`),
 * 4 m out from the front at 25 m along, where the photo's trunk stands east of the corner tower's bay (its crown then falls on the right of the frozen
 * view, as the photo's does). Along every other hotel edge facing the car park that is 6 m or more: clusters 1.9 m out every 4.4 m with gaps, 0.9 to 1.5 m
 * high. Nothing stands in the car park or within 0.9 m of the building. Returns the plants drawn (lobes, the hedge, the cordyline and the tree each count one).
 */
export function hotelShrubs(b:Batch,hotel:readonly Pt[],park:readonly Pt[],ground:Ground):number{
 const r=cleanRing(hotel),cx=park.reduce((s,p)=>s+p[0],0)/park.length,cz=park.reduce((s,p)=>s+p[1],0)/park.length;let n=0;
 const segDist=(p:Pt,a:Pt,c:Pt)=>{const dx=c[0]-a[0],dz=c[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
 const ok=(p:Pt)=>!inRing(p,park)&&!inRing(p,r)&&Math.min(...r.map((q,i)=>segDist(p,q,r[(i+1)%r.length])))>.9;
 const near=(p:Pt)=>r.reduce((k,q)=>Math.hypot(q[0]-p[0],q[1]-p[1])<Math.hypot(k[0]-p[0],k[1]-p[1])?q:k,r[0]);
 const A=near([-25.3,-97.8]),B=near([-8.7,-104.7]),lm=Math.hypot(B[0]-A[0],B[1]-A[1])||1,u:Pt=[(B[0]-A[0])/lm,(B[1]-A[1])/lm],nf:Pt=[-u[1],u[0]];
 const at=(m:number,o:number):Pt=>[A[0]+u[0]*m+nf[0]*o,A[1]+u[1]*m+nf[1]*o];
 const h0=at(2,1.6),h1=at(6.2,1.6);if(ok(h0)&&ok(h1)){hedge(b,ground,h0,h1,.55,1.3,31);n++;}// 4.2 m long, 1.1 m wide, 1.3 m high, centred where round 6's 5 m run was (ASSUMED: R-pt2-b's mound is about 3.9 m by 2.2 m; the height capped by the round's brief)
 for(const [m,o,w,h,key] of [[9.3,2.2,2.7,1.6,21],[14.9,2.1,2.4,1.4,22],[17.2,1.9,1.7,1.6,23],[21,1.9,2,1.2,24]] as const){const p=at(m,o);n+=bush(b,ground,ok,p[0],p[1],w,h,key);}
 const cp=at(12.4,1.4);if(ok(cp)){cordyline(b,ground,cp[0],cp[1],41);n++;}
 const tp=at(25,4);if(ok(tp)){tree(b,ground,tp[0],tp[1],51);n++;}
 for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<6||(a===A&&c===B)||(a===B&&c===A))continue;
  let nn:Pt=[-(c[1]-a[1])/l,(c[0]-a[0])/l];const m:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2];if(inRing([m[0]+nn[0]*.5,m[1]+nn[1]*.5],r))nn=[-nn[0],-nn[1]];
  const toPark=Math.hypot(cx-m[0],cz-m[1])||1;if((nn[0]*(cx-m[0])+nn[1]*(cz-m[1]))/toPark<.6)continue;
  for(let s=2;s<l-2;s+=4.4){const key=100+i*37+Math.round(s);if(hash(key,1)<.3)continue;
   const p:Pt=[a[0]+(c[0]-a[0])*s/l+nn[0]*1.9,a[1]+(c[1]-a[1])*s/l+nn[1]*1.9];if(!ok(p))continue;
   n+=bush(b,ground,ok,p[0],p[1],1.7+.7*hash(key,2),.9+.6*hash(key,3),key);}
 }
 return n;
}
