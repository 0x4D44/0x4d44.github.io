// P2 frontage: the rail underbridge that carries the Tay Coast Line over King's Place (OSM way/1260630142, man_made=bridge, ODbL), and the
// road cut under it. Source R-pt2-d: geograph 8184219 (habiloid, 2025-08-06, CC BY-SA 2.0; camera NO 1138 2310, looking NNE),
// "The railway bridge at the junction of St. Leonard's Bank and Kings Place". It shows a pair of half-through riveted plate girders painted
// red, each web divided by stiffeners into framed panels lined in cream, with an "1849" plate (Perth Civic Trust also dates the bridge
// 1849). They stand on coursed rubble abutments with dressed sandstone quoins; a high rubble retaining wall lines St Leonard's Bank.
//
// Levels, ASSUMED, from R-pt2-d's pixels (1280 x 1768 copy; the camera is level, so the horizon, the eye's height, is at y 884):
// - scale: the 48-sheet poster on the far wall under the deck is 3.05 m and 178 px tall at about 40 m (the deck's far side in plan), so the
//   focal length is about 2334 px; at the near girder, about 25.5 m from the standpoint, that is about 91.5 px/m;
// - the girder: its red web is about 140 px (1.53 m) and its flanges about 15 px more, so about 1.7 m deep; its underside is at y 870,
//   0.15 m above the eye;
// - the road: the far wall's foot is at y 1112, 3.9 m below the eye at 40 m.
// The rail (y = 0) is fixed. The girders' underside is set at the existing deck's underside (PERTH_LEVELS deckTop - deckDepth = -1.5), so
// the deck reads as their floor; the eye is then at -1.65 and the road under the bridge at -5.55, 4.05 m under the girders.
// pt-kings-place-bridge stands at that eye (lead re-freeze 2026-11-10 12:57). The 16 m DTM cannot resolve this cutting: this module carves it.
import type {Pt} from '../../core/geo.ts';
import {createTerrain,encodeGrid} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {TrackSegment} from './station-railway.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {cleanRing} from './waverley-mesh.ts';
import {prism,wallBox} from './waverley-frontage-mesh.ts';
import {PERTH_TEXTURE_TILE} from './perth-frontage-textures.ts';
import frontageFile from './data/perth-frontage.json' with {type:'json'};

/** ASSUMED from R-pt2-d's pixels (see the header): heights relative to the rail (y = 0); `panel` is the stiffener pitch (about 65 px). */
export const KINGS_PLACE_LEVELS={road:-5.55,soffit:-1.5,top:.2,eye:-1.65,panel:.75} as const;
/** R-pt2-d's standpoint on St Leonard's Bank (NO 1138 2310, in the Perth frame), where the photographer's eye stands 1.7 m over the road. */
export const KINGS_PLACE_STANDPOINT:Pt=[88,-39];
/** R-pt2-d, sampled (1280 x 1768 copy): the girder's weathered pink-red (#8b5358 in the web's shade), the walls' dark grey rubble (#40413d on
 *  the left wall, #585450 on the far one), the road (#5c5a5d). Lifted a little for the scene's sun; ASSUMED. */
export const KINGS_PLACE_COLOURS={red:0x9e5257,cream:0xe2d6bb,lining:0x1e1c1c,flange:0x4a2b2e,rubble:0x5a5a55,rubbleDark:0x4c4d48,quoin:0x8a7a6c,soffit:0x2f2c2a,
 asphalt:0x45474a,footway:0x8c8780,kerb:0xb3ada3,white:0xe9e9e3,yellow:0xd9b52c,column:0xb9c2b8} as const;
export const KINGS_PLACE_SOURCE={photo:'https://www.geograph.org.uk/photo/8184219',author:'habiloid',licence:'CC BY-SA 2.0',date:'2025-08-06',date1849:'https://www.perthcivictrust.org.uk/staging/?p=2081'} as const;

/** King's Place's mapped centreline (OSM primary, ODbL) from Leonard Street to St Leonard's Bank, west to east. */
export function kingsPlaceLine(file:{roads:{name?:string;path:number[][]}[]}=frontageFile):Pt[]{
 const segs=file.roads.filter(r=>r.name==="King's Place").map(r=>r.path.map(p=>[p[0],p[1]] as Pt)).map(p=>p[0][0]>p.at(-1)![0]?[...p].reverse():p);
 segs.sort((a,b)=>a[0][0]-b[0][0]);
 const out:Pt[]=[];for(const s of segs)for(const p of s)if(!out.length||Math.hypot(p[0]-out.at(-1)![0],p[1]-out.at(-1)![1])>.01)out.push(p);
 return out;
}
const segDist=(x:number,z:number,ax:number,az:number,bx:number,bz:number)=>{const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-ax-t*dx,z-az-t*dz);};
const inRing=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
/** Distance to a polyline and the distance along it to the nearest point. */
function onLine(line:readonly Pt[],x:number,z:number):{d:number;s:number}{
 let d=Infinity,s=0,acc=0;
 for(let i=0;i+1<line.length;i++){const a=line[i],c=line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),t=Math.max(0,Math.min(1,((x-a[0])*(c[0]-a[0])+(z-a[1])*(c[1]-a[1]))/(l*l||1)));
  const e=Math.hypot(x-a[0]-t*(c[0]-a[0]),z-a[1]-t*(c[1]-a[1]));if(e<d){d=e;s=acc+t*l;}acc+=l;}
 return {d,s};
}
/** The cut (grades ASSUMED): carriageway half widths (OSM classes primary and tertiary, ROAD_WIDTHS), a 1.8 m pavement each side,
 *  King's Place level under the deck and climbing `kpGrade` either side; St Leonard's Bank climbing from the junction to the standpoint
 *  (where R-pt2-d's eye is 1.7 m over it) and on at `bankGrade`. The cut keeps `railClear` m from any open rail outside the deck. */
export const KINGS_PLACE_CUT={kpHalf:4.5,bankHalf:3,pavement:1.8,kpGrade:.11,bankGrade:.1,railClear:2.5,railEdge:.8,edge:1.2,step:.5,
 /** the terrain lies `sink` m under the drawn surface (cutSurface) everywhere it is paved, and only starts to climb `wallBack` m past the
  *  pavement's back edge or the deck's outline (behind the 0.7 m retaining wall, and past the 0.71 m a drawn cell reaches beyond its
  *  paved corners), so no terrain triangle can rise through the road or the pavement; `guard`: paving starts this far past an open
  *  rail's guard, where the terrain is back at the cut's level */
 sink:.3,wallBack:.8,guard:.9,
 /** the St Leonard's Bank west wall's batter (R-pt2-d, left: it leans back about 1 in 8) */
 batter:.12} as const;
/** St Leonard's Bank (OSM way/24215785, ODbL) from its junction with King's Place, north to south. */
export function stLeonardsBankLine(file:{roads:{id:string;path:number[][]}[]}=frontageFile):Pt[]{
 const r=file.roads.find(q=>q.id==='way/24215785');if(!r)throw Error("St Leonard's Bank way/24215785 missing from perth-frontage.json");
 const p=r.path.map(q=>[q[0],q[1]] as Pt);return p[0][1]<p.at(-1)![1]?p:[...p].reverse();
}
export interface CutRoad {name:string;line:Pt[];half:number;level:(x:number,z:number)=>number;inRamp:(x:number,z:number)=>boolean}
/** The cut's two roads, each with its carriageway half width and its road level (y) at a plan point. */
export function cutRoads(bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):CutRoad[]{
 const C=KINGS_PLACE_CUT,L=KINGS_PLACE_LEVELS,bx0=Math.min(...bridgeRing.map(p=>p[0])),bx1=Math.max(...bridgeRing.map(p=>p[0])),bank=stLeonardsBankLine(),kp=kingsPlaceLine();
 const kpOut=(x:number)=>x<bx0?bx0-x:x>bx1?x-bx1:0,kpTop=6.5/C.kpGrade;// far enough out to climb from the road to any ground here
 const sStand=onLine(bank,...KINGS_PLACE_STANDPOINT).s,standY=L.eye-1.7,g1=(standY-L.road)/sStand;
 const bankY=(s:number)=>s<=sStand?L.road+g1*s:standY+C.bankGrade*(s-sStand);
 return [
  {name:"King's Place",line:kp,half:C.kpHalf,level:(x)=>L.road+C.kpGrade*kpOut(x),inRamp:(x)=>kpOut(x)<kpTop},
  {name:"St Leonard's Bank",line:bank,half:C.bankHalf,level:(x,z)=>bankY(onLine(bank,x,z).s),inRamp:(x,z)=>onLine(bank,x,z).s<sStand+6.5/C.bankGrade},
 ];
}
/** The cut's drawn surface at a plan point, or null where it is not paved: the road level (the lowest of the roads there) across each
 *  road's carriageway and pavements (0.12 m up past the kerb) to 0.2 m under the retaining wall's face, and King's Place's pavement
 *  level everywhere under the deck, to the abutments' feet (R-pt2-d paves the far wall's foot). Not within an open rail's guard. */
export function cutSurfaceAt(roads:readonly CutRoad[],ring:readonly Pt[],rails:readonly TrackSegment[],x:number,z:number):{y:number;asphalt:boolean}|null{
 const C=KINGS_PLACE_CUT,L=KINGS_PLACE_LEVELS;let y=Infinity,asphalt=false;
 for(const r of roads){if(!r.inRamp(x,z))continue;const {d}=onLine(r.line,x,z);if(d>r.half+C.pavement+.2)continue;
  y=Math.min(y,r.level(x,z)+(d>r.half?.12:0));if(d<=r.half)asphalt=true;}
 // under the deck: paved to 0.55 m inside its outline (the walls' faces stand at it or 0.35 m inside), so the terrain grid's nodes either
 // side of a paved point are both sunk; a drawn cell reaches 0.71 m past its paved corners, so the paving still meets the faces
 const deck=inRing(x,z,ring)&&ringEdge(ring,x,z)>=.55;if(deck)y=Math.min(y,L.road+.12);
 if(y===Infinity)return null;
 if(!deck&&railGuarded(rails,ring,x,z))return null;
 return {y,asphalt};
}
/** Inside an open rail's guard (railClear, its fade and `guard`), where the cut is not paved. */
function railGuarded(rails:readonly TrackSegment[],ring:readonly Pt[],x:number,z:number):boolean{
 const C=KINGS_PLACE_CUT;void ring;return railReach(rails,x,z)<C.railClear+C.railEdge+C.guard;
}
/** The cut's terrain height at a plan point, or null outside it: `sink` under the drawn surface across the corridors and under the deck,
 *  held there `wallBack` m past each corridor's edge, then blending up to the field over `edge` m (a hard step spikes the adaptive
 *  terrain mesh); within an open rail's `railClear` guard outside the deck it fades back to the field over `railEdge` m. */
function cutLevel(roads:readonly CutRoad[],ring:readonly Pt[],rails:readonly TrackSegment[],x:number,z:number,base:number):number|null{
 const C=KINGS_PLACE_CUT,L=KINGS_PLACE_LEVELS;let y:number|null=null;
 for(const r of roads){if(!r.inRamp(x,z))continue;const {d}=onLine(r.line,x,z),edge=r.half+C.pavement+C.wallBack;if(d>edge+C.edge)continue;
  const lv=r.level(x,z)+(d>r.half?.12:0)-C.sink;if(lv>=base)continue;
  const v=d<=edge?lv:lv+(base-lv)*smooth((d-edge)/C.edge);y=y===null?v:Math.min(y,v);}
 const under=inRing(x,z,ring),deck=L.road+.12-C.sink;
 if(deck<base){const e=under?0:ringEdge(ring,x,z);
  if(e<C.wallBack+C.edge){const v=e<=C.wallBack?deck:deck+(base-deck)*smooth((e-C.wallBack)/C.edge);y=Math.min(y??Infinity,v);}}
 if(y===null)return null;
 if(!under){const r=railReach(rails,x,z);
  if(r<C.railClear+C.railEdge)y=base+(y-base)*smooth((r-C.railClear)/C.railEdge);}
 return y;
}
/** The distance from (x, z) to the nearest open rail, for its guard. */
function railReach(rails:readonly TrackSegment[],x:number,z:number):number{let r=Infinity;for(const [ax,az,bx,bz] of rails)r=Math.min(r,segDist(x,z,ax,az,bx,bz));return r;}
const ringEdge=(ring:readonly Pt[],x:number,z:number)=>{let d=Infinity;for(let i=0;i<ring.length;i++){const u=ring[i],v=ring[(i+1)%ring.length];d=Math.min(d,segDist(x,z,u[0],u[1],v[0],v[1]));}return d;};
const smooth=(t:number)=>{const u=Math.max(0,Math.min(1,t));return u*u*(3-2*u);};

/**
 * The ground with King's Place (and St Leonard's Bank's fall to it) cut under the bridge: a 0.5 m grid over the cut, finer than the
 * field's, holds the terrain `sink` m under the drawn road and pavements (cutSurface draws them) and the field outside them. Retaining
 * walls (cutWalls) stand on the edges. Within KINGS_PLACE_CUT.railClear m of an open rail outside the deck the field is kept.
 */
/** The cut's plan extents (whole metres, 10 m round its roads' ramps) and the open rails near enough to matter. */
function cutExtents(roads:readonly CutRoad[],openRails:readonly TrackSegment[]){
 const pts=roads.flatMap(r=>r.line.filter(p=>r.inRamp(...p)));
 const x0=Math.floor(Math.min(...pts.map(p=>p[0]))-10),x1=Math.ceil(Math.max(...pts.map(p=>p[0]))+10);
 const z0=Math.floor(Math.min(...pts.map(p=>p[1]))-10),z1=Math.ceil(Math.max(...pts.map(p=>p[1]))+10);
 const near=openRails.filter(([ax,az,bx,bz])=>Math.max(ax,bx)>x0-5&&Math.min(ax,bx)<x1+5&&Math.max(az,bz)>z0-5&&Math.min(az,bz)<z1+5);
 return {x0,x1,z0,z1,near};
}
export function kingsPlaceCut(field:Terrain,openRails:readonly TrackSegment[],bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):Terrain{
 const C=KINGS_PLACE_CUT,roads=cutRoads(bridgeRing),step=C.step,{x0,x1,z0,z1,near}=cutExtents(roads,openRails);
 const nx=Math.round((x1-x0)/step)+1,nz=Math.round((z1-z0)/step)+1,h=new Float32Array(nx*nz);
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=x0+i*step,z=z0+j*step,base=field.heightAt(x,z);h[j*nx+i]=cutLevel(roads,bridgeRing,near,x,z,base)??base;}
 const q=.001;
 return createTerrain({attribution:'derived',source:'perth-frontage-bridge.ts kingsPlaceCut over the station ground',groundY:field.groundY,datumAod:field.datumAod,extent:field.extent,
  grids:[...field.grids.map(g=>encodeGrid(g.h,{...g,q})),encodeGrid(h,{step,x0,z0,nx,nz,q})]});
}

/** A rubble wall from plan point p to q, `half` its half thickness, its face toward -out (the road), leaning back toward `out` by
 *  `batter` m per m of height; world-metre UVs on the coursed rubble tile (PERTH_TEXTURE_TILE.rubble), continuous along a run. */
export function stoneWall(b:Batch,p:Pt,q:Pt,y0:number,y1:number,half:number,color:Rgb,out:Pt,batter=0):void{
 const l=Math.hypot(q[0]-p[0],q[1]-p[1]);if(l<1e-6||y1<=y0)return;
 const T=PERTH_TEXTURE_TILE.rubble,t:Pt=[(q[0]-p[0])/l,(q[1]-p[1])/l],lean=batter*(y1-y0),u0=(p[0]*t[0]+p[1]*t[1])/T,u1=u0+l/T,v0=y0/T,v1=y1/T,w=2*half/T;
 const P=(e:Pt,o:number,y:number):V3=>[e[0]+out[0]*o,y,e[1]+out[1]*o];
 b.poly([P(p,-half,y0),P(q,-half,y0),P(q,-half+lean,y1),P(p,-half+lean,y1)],[[u0,v0],[u1,v0],[u1,v1],[u0,v1]],{facing:[-out[0],batter,-out[1]],color});
 b.poly([P(q,half,y0),P(p,half,y0),P(p,half+lean,y1),P(q,half+lean,y1)],[[u1,v0],[u0,v0],[u0,v1],[u1,v1]],{facing:[out[0],0,out[1]],color});
 b.poly([P(p,-half+lean,y1),P(q,-half+lean,y1),P(q,half+lean,y1),P(p,half+lean,y1)],[[u0,0],[u1,0],[u1,w],[u0,w]],{facing:[0,1,0],color});
 for(const [e,sg] of [[p,-1],[q,1]] as const)b.poly([P(e,-half,y0),P(e,half,y0),P(e,half+lean,y1),P(e,-half+lean,y1)],[[0,v0],[w,v0],[w,v1],[0,v1]],{facing:[t[0]*sg,0,t[1]*sg],color});
}
const outOf=(a:Pt,c:Pt,cx:number,cz:number):Pt=>{const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1;let n:Pt=[-(c[1]-a[1])/l,(c[0]-a[0])/l];if(((a[0]+c[0])/2-cx)*n[0]+((a[1]+c[1])/2-cz)*n[1]<0)n=[-n[0],-n[1]];return n;};

/** The bridge: the two half-through girders along the outline's rail-parallel sides, their panels and stiffeners, the deck soffit between
 *  them, and the abutments along its two ends from the cut road up to the soffit. */
export function kingsPlaceBridge(b:Batch,ring:readonly Pt[],railDir:Pt,ground:Pick<Terrain,'heightAt'>,stone:Batch=b):{sides:number;ends:number;panels:number}{
 const C=KINGS_PLACE_COLOURS,L=KINGS_PLACE_LEVELS,r=cleanRing(ring);let sides=0,ends=0,panels=0;
 const cx=r.reduce((s,p)=>s+p[0],0)/r.length,cz=r.reduce((s,p)=>s+p[1],0)/r.length;
 const girders:[Pt,Pt][]=[];
 for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<2)continue;
  const cos=Math.abs(((c[0]-a[0])*railDir[0]+(c[1]-a[1])*railDir[1])/l);
  if(cos>.95){girders.push([a,c]);sides++;}
  else {// the abutment's face: from the road's level just inside the bridge, under the edge, up to the girders' seat, quoins at the top
   const inward=(p:Pt):Pt=>{const l2=Math.hypot(cx-p[0],cz-p[1])||1;return [p[0]+(cx-p[0])/l2*1.5,p[1]+(cz-p[1])/l2*1.5];};
   let g=Infinity;for(let k=0;k<=8;k++){const q:Pt=[a[0]+(c[0]-a[0])*k/8,a[1]+(c[1]-a[1])*k/8];g=Math.min(g,ground.heightAt(...inward(q)));}
   if(L.soffit>g+.05){const n=outOf(a,c,cx,cz),a2:Pt=[a[0]+n[0]*.35,a[1]+n[1]*.35],c2:Pt=[c[0]+n[0]*.35,c[1]+n[1]*.35];
    stoneWall(stone,a2,c2,g-.3,L.soffit-.35,.7,rgb(C.rubbleDark),n);wallBox(b,a,c,L.soffit-.35,L.soffit,.75,rgb(C.quoin));}ends++;}
 }
 for(const [a,c] of girders){
  const l=Math.hypot(c[0]-a[0],c[1]-a[1]),t:Pt=[(c[0]-a[0])/l,(c[1]-a[1])/l];
  let n:Pt=[-t[1],t[0]];const m:Pt=[(a[0]+c[0])/2,(a[1]+c[1])/2];if((m[0]-cx)*n[0]+(m[1]-cz)*n[1]<0)n=[-n[0],-n[1]];// n: out of the bridge
  const at=(s:number,o:number):Pt=>[a[0]+t[0]*s+n[0]*o,a[1]+t[1]*s+n[1]*o];
  const GO=.35;// the girder's centre line, 0.35 m outside the mapped deck edge: the outline is the deck, the girders stand along its sides
  wallBox(b,at(-.3,GO),at(l+.3,GO),L.soffit,L.top,.22,rgb(C.red));// the web, 0.45 m thick with its flanges' outstand
  wallBox(b,at(-.4,GO),at(l+.4,GO),L.top-.1,L.top,.4,rgb(C.flange));wallBox(b,at(-.4,GO),at(l+.4,GO),L.soffit,L.soffit+.16,.4,rgb(C.flange));
  const k=Math.max(1,Math.round(l/L.panel)),w=l/k;
  for(const side of [1,-1])for(let i=0;i<=k;i++){const s=i*w,o=GO+side*.23;// stiffeners both faces
   wallBox(b,at(s-.06,o+side*.05),at(s+.06,o+side*.05),L.soffit+.16,L.top-.1,.05,rgb(C.red));
   if(i<k){panels++;const s0=s+.12,s1=s+w-.12,y0=L.soffit+.38,y1=L.top-.3,oo=o+side*.015,face:V3=[n[0]*side,0,n[1]*side];
    const quad=(u0:number,u1:number,v0:number,v1:number,col:Rgb,lift:number)=>{const p=at(u0,oo+side*lift),q=at(u1,oo+side*lift);
     b.poly([[p[0],v0,p[1]],[q[0],v0,q[1]],[q[0],v1,q[1]],[p[0],v1,p[1]]],undefined,{facing:face,color:col});};
    quad(s0,s1,y0,y1,rgb(C.cream),.004);quad(s0+.05,s1-.05,y0+.05,y1-.05,rgb(C.lining),.008);quad(s0+.09,s1-.09,y0+.09,y1-.09,rgb(C.red),.012);}
  }
 }
 // the deck soffit between the girders (dark), at the girders' foot
 if(girders.length===2){const [[a,c],[d,e]]=girders;const pts:V3[]=[[a[0],L.soffit,a[1]],[c[0],L.soffit,c[1]],[d[0],L.soffit,d[1]],[e[0],L.soffit,e[1]]];
  const sameDir=(c[0]-a[0])*(e[0]-d[0])+(c[1]-a[1])*(e[1]-d[1])>0;const quad=sameDir?[pts[0],pts[1],pts[3],pts[2]]:pts;
  b.poly(quad,undefined,{facing:[0,-1,0],color:rgb(C.soffit)});}
 return {sides,ends,panels};
}

/** Coursed rubble walls on the cut's edges (R-pt2-d, dark grey): along both edges of each road's corridor (the pavement's back edge),
 *  along each open rail's guard line, and under the deck's girder lines, wherever the ground beyond stands more than 0.6 m over the cut.
 *  Outside the deck they rise 0.5 m over the ground as a parapet; under it they stop at its underside. Under the deck the abutments
 *  (kingsPlaceBridge) are the far faces. The St Leonard's Bank west wall (R-pt2-d, left) is battered back. */
export function cutWalls(b:Batch,ground:Pick<Terrain,'heightAt'>,openRails:readonly TrackSegment[]=[],bridgeRails:readonly TrackSegment[]=[],bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):number{
 const C=KINGS_PLACE_CUT,L=KINGS_PLACE_LEVELS,K=KINGS_PLACE_COLOURS,roads=cutRoads(bridgeRing),all=[...openRails,...bridgeRails];let n=0;
 const ringDist=(e:Pt)=>{let d=Infinity;for(let i=0;i<bridgeRing.length;i++){const u=bridgeRing[i],v=bridgeRing[(i+1)%bridgeRing.length];d=Math.min(d,segDist(e[0],e[1],u[0],u[1],v[0],v[1]));}return d;};
 const wall=(p:Pt,q:Pt,out:Pt,inner:number,batter=0)=>{// out: unit normal toward the high side; inner: the cut's level at the wall's foot
  const m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2],under=inRing(m[0],m[1],bridgeRing)||ringDist(m)<1;// under the deck, or at its edge
  const lq=Math.hypot(q[0]-p[0],q[1]-p[1])||1,dir:Pt=[(q[0]-p[0])/lq,(q[1]-p[1])/lq];
  let hi=-Infinity;for(const e of [p,m,q])for(const o of [KINGS_PLACE_CUT.edge+.3,3,4.5,6])hi=Math.max(hi,ground.heightAt(e[0]+out[0]*o,e[1]+out[1]*o));// the ground the wall retains, up to 6 m behind it
  if(hi-inner<.6)return;
  const top=under?Math.min(hi+.5,L.soffit):hi+.5;if(top-inner<.3)return;
  if(top>-.3-1e-6&&[p,q,m].some(e=>all.some(([cx,cz,dx,dz])=>segDist(e[0],e[1],cx,cz,dx,dz)<2.3+batter*(top-inner))))return;// the train envelope (1.75 m, plus the wall's half thickness and lean)
  stoneWall(b,[p[0]-dir[0]*.18,p[1]-dir[1]*.18],[q[0]+dir[0]*.18,q[1]+dir[1]*.18],inner-C.sink-.3,top,.35,rgb(n%3?K.rubble:K.rubbleDark),out,batter);n++;
 };
 for(const road of roads){
  const pts:Pt[]=[];for(let i=0;i+1<road.line.length;i++){const a=road.line[i],c=road.line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),k=Math.max(1,Math.ceil(l/1.5));for(let j=0;j<k;j++)pts.push([a[0]+(c[0]-a[0])*j/k,a[1]+(c[1]-a[1])*j/k]);}
  pts.push(road.line.at(-1)!);
  for(const side of [1,-1])for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1];if(!road.inRamp(...a)&&!road.inRamp(...c))continue;
   const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,nx=-(c[1]-a[1])/l*side,nz=(c[0]-a[0])/l*side,o=road.half+C.pavement+.35;// the wall's face on the pavement's back edge; the cut blends up behind it
   const p:Pt=[a[0]+nx*o,a[1]+nz*o],q:Pt=[c[0]+nx*o,c[1]+nz*o];
   // not where the edge runs inside the other road's corridor (the junction), nor under the deck (paved to the abutments)
   const m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];if(roads.some(r=>r!==road&&r.inRamp(...m)&&onLine(r.line,...m).d<r.half+C.pavement-.6))continue;// walls run on into the other road's pavement, closing the junction's corners
   if(inRing(m[0],m[1],bridgeRing))continue;
   wall(p,q,[nx,nz],Math.min(road.level(...a),road.level(...c))+.12,road.name!=="King's Place"&&nx<0?C.batter:0);
  }
 }
 // the railway's own walls (R-pt2-d, left): on the guard line of each open rail, where the cut lies beyond it
 for(const [ax,az,bx,bz] of openRails){
  const l=Math.hypot(bx-ax,bz-az);if(l<.1)continue;const k=Math.ceil(l/1.5),tx=(bx-ax)/l,tz=(bz-az)/l;
  for(const side of [1,-1])for(let j=0;j<k;j++){const s0=j*l/k,s1=(j+1)*l/k,nx=-tz*side,nz=tx*side,o=C.railClear+C.railEdge+C.guard-.35;// its face where the paving starts
   const p:Pt=[ax+tx*s0+nx*o,az+tz*s0+nz*o],q:Pt=[ax+tx*s1+nx*o,az+tz*s1+nz*o],m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];
   if(inRing(m[0],m[1],bridgeRing)||openRails.some(([cx,cz,dx,dz])=>segDist(m[0],m[1],cx,cz,dx,dz)<o-.3))continue;
   const lo=Math.min(ground.heightAt(p[0]+nx*.4,p[1]+nz*.4),ground.heightAt(q[0]+nx*.4,q[1]+nz*.4));
   wall(p,q,[-nx,-nz],lo);
  }
  // round the end it leaves the deck by (R-pt2-d: the masonry pier at the deck's north-east end): the guard's cap there reaches past the
  // deck's corner over the cut, so a wall on the same line closes it, outside the deck
  for(const [ex,ez,sg] of [[ax,az,-1],[bx,bz,1]] as const){if(!(inRing(ex,ez,bridgeRing)||ringEdge(bridgeRing,ex,ez)<.6))continue;
   const o=C.railClear+C.railEdge+C.guard-.35,arc=(k:number):Pt=>{const a=Math.PI*k/8,c=Math.cos(a),s2=Math.sin(a);// from one side round behind the end to the other
    return [ex+(-tz*c+tx*sg*s2)*o,ez+(tx*c+tz*sg*s2)*o];};
   for(let k=0;k<8;k++){const p=arc(k),q=arc(k+1),m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];if(inRing(m[0],m[1],bridgeRing))continue;
    const ml=Math.hypot(ex-m[0],ez-m[1])||1,toEnd:Pt=[(ex-m[0])/ml,(ez-m[1])/ml];
    wall(p,q,toEnd,Math.min(ground.heightAt(p[0]-toEnd[0]*.4,p[1]-toEnd[1]*.4),ground.heightAt(q[0]-toEnd[0]*.4,q[1]-toEnd[1]*.4)));}
  }
 }
 // under the girder lines, where the deck's paved floor meets higher ground outside it: walls from the floor up to the deck's underside
 const r=cleanRing(bridgeRing),cx=r.reduce((s,p)=>s+p[0],0)/r.length,cz=r.reduce((s,p)=>s+p[1],0)/r.length;
 for(let i=0;i<r.length;i++){const a=r[i],c=r[(i+1)%r.length],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(l<2)continue;
  const o=outOf(a,c,cx,cz),k=Math.ceil(l/1.5);
  for(let j=0;j<k;j++){const p:Pt=[a[0]+(c[0]-a[0])*j/k+o[0]*.35,a[1]+(c[1]-a[1])*j/k+o[1]*.35],q:Pt=[a[0]+(c[0]-a[0])*(j+1)/k+o[0]*.35,a[1]+(c[1]-a[1])*(j+1)/k+o[1]*.35];
   const mo:Pt=[(p[0]+q[0])/2+o[0]*1.2,(p[1]+q[1])/2+o[1]*1.2];
   if(cutSurfaceAt(roads,bridgeRing,openRails,...mo))continue;// paved beyond this edge: a road runs out under it
   wall(p,q,o,L.road+.12);}
 }
 return n;
}

/** The cut's drawn surface (cutSurfaceAt) on the 0.5 m grid: asphalt over any carriageway, pavement elsewhere, one union over both
 *  roads and the deck's floor, so the junction and the far wall's foot are paved with no seam. A cell with any paved corner is drawn,
 *  its other corners at the paved ones' mean level, so the surface runs on under the walls' faces (but not into an open rail's guard,
 *  where the terrain climbs back to the field). Returns the cells drawn. */
export function cutSurface(b:Batch,openRails:readonly TrackSegment[]=[],bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt)):number{
 const C=KINGS_PLACE_CUT,K=KINGS_PLACE_COLOURS,roads=cutRoads(bridgeRing),{x0,x1,z0,z1,near}=cutExtents(roads,openRails),st=C.step;
 const nx=Math.round((x1-x0)/st)+1,nz=Math.round((z1-z0)/st)+1,grid:({y:number;asphalt:boolean}|null)[]=[];
 const guarded:boolean[]=[];
 for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=x0+i*st,z=z0+j*st;grid.push(cutSurfaceAt(roads,bridgeRing,near,x,z));guarded.push(railGuarded(near,bridgeRing,x,z)&&!(inRing(x,z,bridgeRing)&&ringEdge(bridgeRing,x,z)>=.55));}
 const asphalt=rgb(K.asphalt),footway=rgb(K.footway);let cells=0;
 for(let j=0;j+1<nz;j++)for(let i=0;i+1<nx;i++){const c=[grid[j*nx+i],grid[j*nx+i+1],grid[(j+1)*nx+i+1],grid[(j+1)*nx+i]],have=c.filter(v=>v!==null);
  if(!have.length||[j*nx+i,j*nx+i+1,(j+1)*nx+i+1,(j+1)*nx+i].some(k=>guarded[k]))continue;// not over a rail's guard, where the terrain climbs
  const mean=have.reduce((s,v)=>s+v!.y,0)/have.length,tar=have.filter(v=>v!.asphalt).length*2>=c.length;
  const xs=[x0+i*st,x0+(i+1)*st,x0+(i+1)*st,x0+i*st],zs=[z0+j*st,z0+j*st,z0+(j+1)*st,z0+(j+1)*st];
  b.poly(c.map((v,k):V3=>[xs[k],(v?v.y:mean)+.02,zs[k]]),undefined,{facing:[0,1,0],color:tar?asphalt:footway});cells++;}
 return cells;
}

/** The cut roads' kerbs and markings (R-pt2-d; cutSurface draws the asphalt carriageways and the 1.8 m pavements behind a 0.12 m kerb): a dashed white
 *  centre line on King's Place, double yellow lines along the Bank's west kerb, the stop line at the Bank's mouth, and the lamp column
 *  on the Bank's west pavement (R-pt2-d, about 10 m ahead of the standpoint; 8 m, ASSUMED). The forecourt leaves these roads to it. */
export function cutRoadSurfaces(flat:Batch,paint:Batch,street:Batch,ground:Pick<Terrain,'heightAt'>,bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(p=>[p[0],p[1]] as Pt),openRails:readonly TrackSegment[]=[]):{segments:number}{
 const C=KINGS_PLACE_CUT,K=KINGS_PLACE_COLOURS,roads=cutRoads(bridgeRing),segments=cutSurface(flat,openRails,bridgeRing);
 const band=(road:CutRoad,pts:Pt[],o0:number,o1:number,lift:number,b:Batch,color:Rgb,keep:(i:number)=>boolean=()=>true)=>{
  for(let i=0;i+1<pts.length;i++){const a=pts[i],c=pts[i+1];if(!keep(i)||!road.inRamp(...a)||!road.inRamp(...c))continue;
   const l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,nx=-(c[1]-a[1])/l,nz=(c[0]-a[0])/l;
   const P=(p:Pt,o:number):V3=>{const x=p[0]+nx*o,z=p[1]+nz*o;return [x,road.level(...p)+lift+(Math.abs(o)>road.half?.12:0),z];};
   b.poly([P(a,o0),P(c,o0),P(c,o1),P(a,o1)],undefined,{facing:[0,1,0],color});}
 };
 for(const road of roads){
  const pts:Pt[]=[];for(let i=0;i+1<road.line.length;i++){const a=road.line[i],c=road.line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),k=Math.max(1,Math.ceil(l/1.5));for(let j=0;j<k;j++)pts.push([a[0]+(c[0]-a[0])*j/k,a[1]+(c[1]-a[1])*j/k]);}
  pts.push(road.line.at(-1)!);
  const other=(i:number)=>{const p=pts[i];return roads.some(r=>r!==road&&r.inRamp(...p)&&onLine(r.line,...p).d<r.half+C.pavement);};
  for(const side of [1,-1]){
   for(let i=0;i+1<pts.length;i++){if(other(i)||!road.inRamp(...pts[i])||!road.inRamp(...pts[i+1]))continue;const a=pts[i],c=pts[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1])||1,nx=-(c[1]-a[1])/l,nz=(c[0]-a[0])/l;
    const p:Pt=[a[0]+nx*side*road.half,a[1]+nz*side*road.half],q:Pt=[c[0]+nx*side*road.half,c[1]+nz*side*road.half];
    wallBox(street,p,q,Math.min(road.level(...a),road.level(...c))-.1,Math.max(road.level(...a),road.level(...c))+.16,.08,rgb(K.kerb));}}
  if(road.name==="King's Place")band(road,pts,-.06,.06,.06,paint,rgb(K.white),i=>i%2===0&&!other(i));
  else{for(const o of [road.half-.25,road.half-.45])band(road,pts,o-.05,o+.05,.06,paint,rgb(K.yellow),i=>!other(i));
   const kp=roads[0],mouth=pts.findIndex((p,i)=>i>0&&!(onLine(kp.line,...p).d<kp.half+C.pavement));
   if(mouth>0)band(road,pts.slice(mouth,mouth+2),-road.half,0,.06,paint,rgb(K.white));}
 }
 // the lamp column (R-pt2-d): pale green-grey, a short arm over the road, on the Bank's west pavement
 const bank=roads[1],s=onLine(bank.line,...KINGS_PLACE_STANDPOINT).s-10;let acc=0,lp:Pt|null=null,dir:Pt=[0,1];
 for(let i=0;i+1<bank.line.length&&!lp;i++){const a=bank.line[i],c=bank.line[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]);if(acc+l>=s){const t=(s-acc)/l;dir=[(c[0]-a[0])/l,(c[1]-a[1])/l];lp=[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];}acc+=l;}
 if(lp){const nx=-dir[1],nz=dir[0],west=nx<0?1:-1,o=bank.half+.5,p:Pt=[lp[0]+nx*west*o,lp[1]+nz*west*o],y=bank.level(...lp)+.12;
  prism(street,p[0],p[1],.09,y,y+8,8,rgb(K.column));
  const arm:Pt=[p[0]-nx*west*1.6,p[1]-nz*west*1.6];wallBox(street,p,arm,y+7.85,y+8,.05,rgb(K.column));wallBox(street,arm,[arm[0]-nx*west*.5,arm[1]-nz*west*.5],y+7.8,y+7.95,.12,rgb(0x3a3d40));}
 void ground;
 return {segments};
}

/** A test for where the forecourt should leave a road surface to cutRoadSurfaces: inside a cut road's corridor along its ramp. */
export function cutRoadMask(bridgeRing:readonly Pt[]=frontageFile.bridge.ring.map(q=>[q[0],q[1]] as Pt)):(p:Pt)=>boolean{
 const roads=cutRoads(bridgeRing);return p=>roads.some(r=>r.inRamp(...p)&&onLine(r.line,...p).d<r.half+KINGS_PLACE_CUT.pavement+.5);
}
