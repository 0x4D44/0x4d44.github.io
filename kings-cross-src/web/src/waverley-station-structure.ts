// W1 station: what carries the ridge-and-furrow roof (waverley-roof.ts) and what stands on the platforms under it.
//
// SOURCES. HES LB30270 (https://portal.historicenvironment.scot/designation/LB30270): "a ridge and furrow roof on cast iron columns and
// masonry walls", parallel lattice girders. The forms are read off the reference photographs (refs/waverley, SOURCES.md):
//  R-wv1-b  (platform 20, 2013): fluted columns painted white with gilt Corinthian capitals on dark green pedestals; light grey lattice
//           girders along and across the platforms; pendant lamps hung from the girders; a departure screen and a blue platform-number
//           sign on the columns; pale paving with a yellow tactile strip set back from the coper.
//  R-wv1-b2 (platform 7, 2017): the same girders and lamps in a row along the platform; plain metal benches on the platform's middle line.
//  R-wv1-b3 (cab road, 2015): the dense two-way lattice of the roof's underside.
// No plan, bay or member dimension is published (refs/waverley/DIMENSIONS.md, "Not found"), so every number in WAVERLEY_STRUCTURE is
// ASSUMED, scaled from those photographs against the 0.915 m platform and the ASSUMED 12 m roof pitch; each says so.
//
// LAYOUT. Columns stand on each platform's middle line where it crosses a furrow line (x = phase + k * pitch: the gutters run north-south,
// waverley-roof.ts), inside the roof's OSM outline and outside its hole, and only where the platform is wide enough to keep the KX safety
// line (furniture.ts FIGURES) from both track edges. Girders: one under every furrow line, across the whole roof (the gutter girders), and
// one along each platform from column to column (the platform girders). Everything over a track is above the gutter girders' underside.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData,WaverleyArea} from '../../core/waverley-data.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {bandAt,crossSection,FIGURES,platformFrame,stripChains,worldPoint} from './furniture.ts';
import type {Frame,StripChain,TrackSegment} from './furniture.ts';
import {WAVERLEY_LEVELS,cleanRing} from './waverley-mesh.ts';
import {footprintRuns,roofHeight,WAVERLEY_ROOF_PROFILE} from './waverley-roof.ts';

export const WAVERLEY_STRUCTURE={
 /** Gutter girders under each furrow: top 0.05 m under the ASSUMED 8 m gutter, 1.0 m deep (ASSUMED from R-wv1-b, where a girder is about as deep as a pedestal is tall). */
 gutterGirderTop:7.95,gutterGirderDepth:1.0,
 /** A gutter girder stops this far short of the roof's edge, a hole or a bridge (m): its 0.3 m chord, square to a bridge's slanting flank, would
  *  otherwise poke under the deck (North Bridge crosses the furrows at about 16 degrees). ASSUMED. */
 gutterEnd:1.0,
 /** Platform girders, column to column: top 0.23 m under the gutter girders' so no chord is coplanar with another, 0.9 m deep (ASSUMED, R-wv1-b). */
 platformGirderTop:7.72,platformGirderDepth:.9,
 /** Chord 0.3 m wide x 0.18 m deep; lattice flats 0.12 x 0.08 m (ASSUMED, R-wv1-b3). */
 chordWidth:.3,chordDepth:.18,latticeWidth:.12,latticeDepth:.08,
 /** Column: pedestal 0.66 m across and 1.2 m tall, shaft 0.34 m across, capital flaring to 0.84 m over 0.6 m, abacus 0.15 m (ASSUMED, R-wv1-b against the 0.915 m platform). */
 pedestalRadius:.33,pedestalHeight:1.2,shaftRadius:.17,capitalRadius:.42,capitalHeight:.6,abacus:.15,
 /** A column stands this far inside the roof outline and its hole at least (m). ASSUMED. */
 roofMargin:1.0,
 /** Two columns from neighbouring polygons of one island closer than this are one column (m). ASSUMED. */
 mergeDistance:4,
 /** A platform girder spans at most this far between columns (m): 1.6 pitches, so it never jumps a missing column. ASSUMED. */
 maxSpan:WAVERLEY_ROOF_PROFILE.pitch*1.6,
 /** Pendant lamps: one per span, the shade's rim 4.1 m above the platform, 0.56 m across (ASSUMED, R-wv1-b2). */
 lampRim:4.1,lampRadius:.28,lampShade:.35,
 /** Benches: 1.8 x 0.5 m, seat 0.45 m, back 0.85 m (the KX bench, furniture.ts), one on every second span (ASSUMED, R-wv1-b2). */
 benchLength:1.8,benchDepth:.5,benchSeat:.45,benchBack:.85,benchEvery:2,
 /** Platform-number signs: a 0.55 m square, 3.0-3.55 m up a column, on every third column (ASSUMED, R-wv1-b; generic, no lettering). */
 signSize:.55,signBottom:3.0,signEvery:3,
 /** Departure screens: 1.4 x 0.45 x 0.12 m, bottom 3.2 m up, hung on rods from the platform girder, on every third span (ASSUMED, R-wv1-b; blank). */
 screenWidth:1.4,screenHeight:.45,screenDepth:.12,screenBottom:3.2,screenEvery:3,
 /** The screen round the roof's hole over the central block: from the roof's surface down to 6.6 m, clear of the block's 6.04 m cornice
  * (R-wv1-a3 shows a pale valance all round the hole; its depth is ASSUMED from that photo). Drawn in 1 m pieces so its top follows the folds. */
 valanceBottom:6.6,valancePiece:1,
 /** The platform-edge strip lies this far above the platform top (the KX figure, backed by a polygon offset). */
 stripLift:FIGURES.stripLift,
} as const;
/** Paint, read off R-wv1-b: light grey ironwork, white columns, gilt capitals, dark green pedestals; the furniture's colours likewise. ASSUMED shades. */
export const WAVERLEY_PAINT={iron:0xd5d8d8,column:0xeeece4,gilt:0xc9a032,pedestal:0x24493a,lamp:0xf1f0ea,bench:0x8f969b,sign:0x1f4a96,signFace:0xf4f4f0,screen:0x1b1d20,valance:0xe6dcc0} as const;

export interface WaverleyColumn {x:number;z:number;ref:string}
export interface WaverleyPlacement {x:number;z:number;rotY:number;ref:string}
export interface WaverleyStationPlan {
 frames:Frame[];
 columns:WaverleyColumn[];
 /** Platform girders, column to column. */
 spans:[Pt,Pt][];
 /** The roof's hole rings (the central block's outline), for the valance, and the bridges it stops at (no valance under a deck). */
 holes:Pt[][];cutouts:readonly (readonly Pt[])[];
 /** Gutter girders: [x, z0, z1]. */
 gutters:[number,number,number][];
 lamps:WaverleyPlacement[];benches:WaverleyPlacement[];signs:WaverleyPlacement[];screens:WaverleyPlacement[];
}
/** The drawn rails as segments: the filter waverley-scene.ts waverleyTrackSegments applies (no tram, tunnel or underground line). */
export function waverleyRailPieces(data:Pick<WaverleyData,'rails'>):TrackSegment[]{
 const out:TrackSegment[]=[];
 for(const r of data.rails){
  if(r.tags.railway!=='rail'||r.tags.tram==='yes'||r.tags.tunnel&&r.tags.tunnel!=='no'||Number(r.tags.layer??0)<0)continue;
  for(let i=1;i<r.path.length;i++)out.push([r.path[i-1],r.path[i]]);
 }
 return out;
}
/** classifyEdges' shed-wall test, made never to fire: Waverley has no KX shed frame. */
const NO_SHED={origin:[0,0] as Pt,heading:0,width:0,length:-1e6};
export function waverleyPlatformFrames(data:Pick<WaverleyData,'platforms'|'rails'>):Frame[]{
 const outlines=data.platforms.map(p=>cleanRing(p.path)).filter(r=>r.length>=3),tracks=waverleyRailPieces(data);
 return outlines.map((pts,i)=>platformFrame(data.platforms[i].ref??'',pts,outlines.filter((_,j)=>j!==i),NO_SHED,tracks));
}
function inRing(p:Pt,r:readonly Pt[]):boolean{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++)if((r[i][1]>p[1])!==(r[j][1]>p[1])&&p[0]<(r[j][0]-r[i][0])*(p[1]-r[i][1])/(r[j][1]-r[i][1])+r[i][0])yes=!yes;return yes;}
function edgeDistance(p:Pt,r:readonly Pt[]):number{
 let best=Infinity;
 for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length],dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz));}
 return best;
}
/** Is p under the roof (inside its outline, outside its hole) by at least `margin` metres? */
export function underRoof(roof:Pick<WaverleyArea,'outer'|'holes'>,p:Pt,margin:number,cutouts:readonly (readonly Pt[])[]=[]):boolean{
 const outer=cleanRing(roof.outer),holes=[...roof.holes,...cutouts].map(cleanRing);
 return inRing(p,outer)&&!holes.some(h=>inRing(p,h))&&[outer,...holes].every(r=>edgeDistance(p,r)>=margin);
}
const rotAcross=(f:Frame):number=>Math.atan2(-f.n[1],f.n[0]);

/** Where everything goes (pure: no three.js objects). */
export function waverleyStationPlan(data:Pick<WaverleyData,'platforms'|'rails'>,roof:Pick<WaverleyArea,'outer'|'holes'>|undefined,cutouts:readonly (readonly Pt[])[]=[]):WaverleyStationPlan{
 const S=WAVERLEY_STRUCTURE,P=WAVERLEY_ROOF_PROFILE,frames=waverleyPlatformFrames(data);
 const plan:WaverleyStationPlan={frames,columns:[],spans:[],holes:[],cutouts,gutters:[],lamps:[],benches:[],signs:[],screens:[]};
 if(!roof)return plan;
 const outer=cleanRing(roof.outer),xs=outer.map(p=>p[0]);plan.holes=roof.holes.map(cleanRing);
 for(let k=Math.ceil((Math.min(...xs)-P.phase)/P.pitch);P.phase+k*P.pitch<Math.max(...xs);k++){
  const x=P.phase+k*P.pitch;for(const [z0,z1]of footprintRuns(roof.outer,[...roof.holes,...cutouts],x))if(z1-z0>2*S.gutterEnd)plan.gutters.push([x,z0+S.gutterEnd,z1-S.gutterEnd]);
 }
 for(const f of frames){
  // Where this platform's middle line crosses a furrow line: sample the middle every 0.5 m along the platform's axis.
  const mids:{t:number;p:Pt}[]=[];
  for(let t=f.tLo+.25;t<f.tHi;t+=.5){const s=crossSection(f.pts,f.axis,t);if(s)mids.push({t,p:worldPoint(f,t,(s.lo+s.hi)/2)});}
  const own:{t:number;c:WaverleyColumn}[]=[];
  for(let i=1;i<mids.length;i++){
   const a=mids[i-1],b=mids[i],ka=Math.floor((a.p[0]-P.phase)/P.pitch),kb=Math.floor((b.p[0]-P.phase)/P.pitch);if(ka===kb)continue;
   const x=P.phase+Math.max(ka,kb)*P.pitch,t=a.t+(b.t-a.t)*(x-a.p[0])/(b.p[0]-a.p[0]),band=bandAt(f,t,S.pedestalRadius);if(!band)continue;
   const p=worldPoint(f,t,band.mid);if(!underRoof(roof,p,S.roofMargin,cutouts))continue;
   if(plan.columns.some(c=>Math.hypot(c.x-p[0],c.z-p[1])<S.mergeDistance))continue;
   const c={x:p[0],z:p[1],ref:f.ref};plan.columns.push(c);own.push({t,c});
  }
  own.sort((a,b)=>a.t-b.t);
  own.forEach(({c},i)=>{if(i%S.signEvery===1)plan.signs.push({x:c.x,z:c.z,rotY:rotAcross(f),ref:f.ref});});
  for(let i=1;i<own.length;i++){
   const a=own[i-1],b=own[i];if(Math.hypot(a.c.x-b.c.x,a.c.z-b.c.z)>S.maxSpan)continue;
   plan.spans.push([[a.c.x,a.c.z],[b.c.x,b.c.z]]);
   const mid:Pt=[(a.c.x+b.c.x)/2,(a.c.z+b.c.z)/2],tm=(a.t+b.t)/2,rotY=rotAcross(f);
   plan.lamps.push({x:mid[0],z:mid[1],rotY,ref:f.ref});
   if(i%S.benchEvery===0&&bandAt(f,tm,S.benchLength/2))plan.benches.push({x:mid[0],z:mid[1],rotY,ref:f.ref});
   if(i%S.screenEvery===1&&bandAt(f,tm,S.screenWidth/2)){
    // Hung a quarter span off the bench/lamp point, so it never meets the lamp.
    const q:Pt=[mid[0]+(b.c.x-a.c.x)/4,mid[1]+(b.c.z-a.c.z)/4];plan.screens.push({x:q[0],z:q[1],rotY,ref:f.ref});
   }
  }
 }
 return plan;
}

// --- shapes (one coloured Batch per draw)
const sub3=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm3=(a:V3):V3=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
/** A bar from a to b, w wide and h deep, its ends left open (they always butt into a chord or a column). */
function bar(batch:Batch,a:V3,b:V3,w:number,h:number,color:Rgb):void{
 const d=norm3(sub3(b,a));let side=cross3([0,1,0],d);if(Math.hypot(...side)<1e-6)side=[1,0,0];side=norm3(side);const up=cross3(d,side);
 const at=(e:V3,sx:number,sy:number):V3=>[e[0]+side[0]*sx*w/2+up[0]*sy*h/2,e[1]+side[1]*sx*w/2+up[1]*sy*h/2,e[2]+side[2]*sx*w/2+up[2]*sy*h/2];
 const neg=(v:V3):V3=>[-v[0],-v[1],-v[2]];
 for(const [s0,t0,s1,t1,n]of [[1,-1,1,1,side],[-1,-1,-1,1,neg(side)],[-1,1,1,1,up],[-1,-1,1,-1,neg(up)]] as [number,number,number,number,V3][])
  batch.poly([at(a,s0,t0),at(b,s0,t0),at(b,s1,t1),at(a,s1,t1)],undefined,{facing:n,color});
}
/** A Warren lattice girder from a to b (plan), its top at `top`: two chords and diagonals at 45 degrees. */
export function latticeGirder(batch:Batch,a:Pt,b:Pt,top:number,depth:number,color:Rgb):void{
 const S=WAVERLEY_STRUCTURE,len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.5)return;
 const yt=top-S.chordDepth/2,yb=top-depth+S.chordDepth/2,p=(s:number,y:number):V3=>[a[0]+(b[0]-a[0])*s,y,a[1]+(b[1]-a[1])*s];
 bar(batch,p(0,yt),p(1,yt),S.chordWidth,S.chordDepth,color);bar(batch,p(0,yb),p(1,yb),S.chordWidth,S.chordDepth,color);
 const n=Math.max(1,Math.round(len/(depth-S.chordDepth)));
 for(let i=0;i<n;i++){const s0=i/n,s1=(i+1)/n;bar(batch,p(s0,i%2?yt:yb),p(s1,i%2?yb:yt),S.latticeWidth,S.latticeDepth,color);}
}
/** A vertical frustum: `sides` flat faces from radius r0 at y0 to r1 at y1, with a top cap. */
function frustum(b:Batch,x:number,z:number,r0:number,r1:number,y0:number,y1:number,sides:number,color:Rgb,capTop=true):void{
 const top:V3[]=[];
 for(let i=0;i<sides;i++){
  const a0=i/sides*Math.PI*2,a1=(i+1)/sides*Math.PI*2,m=(a0+a1)/2,c0=Math.cos(a0),s0=Math.sin(a0),c1=Math.cos(a1),s1=Math.sin(a1);
  b.poly([[x+r0*c0,y0,z+r0*s0],[x+r0*c1,y0,z+r0*s1],[x+r1*c1,y1,z+r1*s1],[x+r1*c0,y1,z+r1*s0]],undefined,{facing:[Math.cos(m),0,Math.sin(m)],color});
  top.push([x+r1*c0,y1,z+r1*s0]);
 }
 if(capTop)b.poly(top,undefined,{facing:[0,1,0],color});
}

export interface WaverleyStructureBatches {
 /** Roof part: girders, lamps and their rods. */
 ironwork:Batch;
 /** Platforms part: columns, signs, screens, benches. */
 fittings:Batch;
 /** Platforms part: the coper/tactile/white-line strip along every track edge. */
 edges:Batch;
 /** Platforms part: the platform faces (every edge but a seam between two polygons of one island). */
 faces:Batch;
}
/** The bands laid along a track edge, metres in from the coper's face: a pale coper, then the yellow blister strip, 0.4 m deep with its
 * front 0.6 m back from the edge (DfT, Guidance on the use of tactile paving surfaces: a 400 mm platform-edge warning strip; the 0.6 m
 * set-back is ASSUMED within that guidance's range), as R-wv1-b and R-wv1-b2 show. The coper's 0.3 m depth is ASSUMED. */
export const WAVERLEY_EDGE_BANDS=[{from:0,to:.3,color:0xd9d7d0},{from:.6,to:1.0,color:0xd8b324}] as const;
/** The bands along one run of track edges, between the run's outer line and its mitred inner line (stripChains, 1.6 m in). */
function edgeStrip(b:Batch,chain:StripChain):void{
 const y=WAVERLEY_LEVELS.platform+WAVERLEY_STRUCTURE.stripLift,w=FIGURES.stripWidth;
 const at=(k:number,u:number):V3=>{const o=chain.outer[k],i=chain.inner[k],f=Math.min(1,u/w);return [o[0]+(i[0]-o[0])*f,y,o[1]+(i[1]-o[1])*f];};
 for(const band of WAVERLEY_EDGE_BANDS){const color=rgb(band.color);for(let k=0;k+1<chain.outer.length;k++)b.poly([at(k,band.from),at(k+1,band.from),at(k+1,band.to),at(k,band.to)],undefined,{normal:[0,1,0],facing:[0,1,0],color});}
}
export function waverleyStructureBatches(plan:WaverleyStationPlan):WaverleyStructureBatches{
 const S=WAVERLEY_STRUCTURE,C=Object.fromEntries(Object.entries(WAVERLEY_PAINT).map(([k,v])=>[k,rgb(v)])) as Record<keyof typeof WAVERLEY_PAINT,Rgb>;
 const ironwork=new Batch({colored:true,uv:false}),fittings=new Batch({colored:true,uv:false}),edges=new Batch({colored:true,uv:false}),faces=new Batch();
 const deck=WAVERLEY_LEVELS.platform,underGirder=S.platformGirderTop-S.platformGirderDepth;
 for(const [x,z0,z1]of plan.gutters)latticeGirder(ironwork,[x,z0],[x,z1],S.gutterGirderTop,S.gutterGirderDepth,C.iron);
 for(const [a,b]of plan.spans)latticeGirder(ironwork,a,b,S.platformGirderTop,S.platformGirderDepth,C.iron);
 for(const l of plan.lamps){
  const rim=deck+S.lampRim;
  ironwork.box([l.x,(rim+S.lampShade+underGirder)/2,l.z],[.04,underGirder-rim-S.lampShade,.04],{color:C.iron});
  frustum(ironwork,l.x,l.z,S.lampRadius,.08,rim,rim+S.lampShade,8,C.lamp);
  ironwork.poly(Array.from({length:8},(_,i):V3=>[l.x+S.lampRadius*Math.cos(i/8*Math.PI*2),rim,l.z+S.lampRadius*Math.sin(i/8*Math.PI*2)]),undefined,{facing:[0,-1,0],color:C.lamp});
 }
 for(const h of plan.holes)for(let i=0;i<h.length;i++){
  const a=h[i],b=h[(i+1)%h.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/S.valancePiece));
  for(let k=0;k<n;k++){
   const p=(t:number):Pt=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],p0=p(k/n),p1=p(Math.min(1,(k+1)/n)),y0=S.valanceBottom;
   if(plan.cutouts.some(c=>[p0,p1,p((k+.5)/n)].some(q=>inRing(q,c))))continue;
   const quad:V3[]=[[p0[0],y0,p0[1]],[p1[0],y0,p1[1]],[p1[0],roofHeight(p1[0]),p1[1]],[p0[0],roofHeight(p0[0]),p0[1]]];
   // Both faces: it is seen from inside the hole and from under the roof.
   ironwork.poly(quad,undefined,{color:C.valance});ironwork.poly([...quad].reverse(),undefined,{color:C.valance});
  }
 }
 for(const c of plan.columns){
  const y1=deck+S.pedestalHeight,y3=underGirder-S.abacus,y2=y3-S.capitalHeight;
  frustum(fittings,c.x,c.z,S.pedestalRadius,S.pedestalRadius,deck,y1,8,C.pedestal);
  frustum(fittings,c.x,c.z,S.shaftRadius,S.shaftRadius,y1,y2,16,C.column,false);
  frustum(fittings,c.x,c.z,S.shaftRadius,S.capitalRadius,y2,y3,8,C.gilt,false);
  fittings.box([c.x,y3+S.abacus/2,c.z],[S.capitalRadius*2.1,S.abacus,S.capitalRadius*2.1],{color:C.column});
 }
 for(const s of plan.signs){
  // On the column's face, across the platform's axis: its plane faces along the platform, as the sign in R-wv1-b.
  const y=deck+S.signBottom+S.signSize/2;
  fittings.box([s.x,y,s.z],[S.signSize,S.signSize,S.shaftRadius*2+.06],{rotY:s.rotY,color:C.sign});
  fittings.box([s.x,y,s.z],[S.signSize*.55,S.signSize*.55,S.shaftRadius*2+.08],{rotY:s.rotY,color:C.signFace});
 }
 for(const s of plan.screens){
  const y0=deck+S.screenBottom,ax=Math.cos(s.rotY),az=-Math.sin(s.rotY);
  fittings.box([s.x,y0+S.screenHeight/2,s.z],[S.screenWidth,S.screenHeight,S.screenDepth],{rotY:s.rotY,color:C.screen});
  for(const k of [-1,1])fittings.box([s.x+ax*k*.5,(y0+S.screenHeight+underGirder)/2,s.z+az*k*.5],[.04,underGirder-y0-S.screenHeight,.04],{color:C.iron});
 }
 for(const s of plan.benches){
  const ax=Math.cos(s.rotY),az=-Math.sin(s.rotY),ux=-az,uz=ax,along=s.rotY+Math.PI/2;
  // The bench runs along the platform (local x along the axis), its back on the platform's middle line.
  fittings.box([s.x,deck+S.benchSeat,s.z],[S.benchLength,.05,S.benchDepth],{rotY:along,color:C.bench});
  fittings.box([s.x+ax*(-S.benchDepth/2),deck+(S.benchSeat+S.benchBack)/2,s.z+az*(-S.benchDepth/2)],[S.benchLength,S.benchBack-S.benchSeat,.04],{rotY:along,color:C.bench});
  for(const k of [-1,1])fittings.box([s.x+ux*k*(S.benchLength/2-.15),deck+S.benchSeat/2,s.z+uz*k*(S.benchLength/2-.15)],[.06,S.benchSeat-.025,S.benchDepth*.9],{rotY:along,color:C.bench});
 }
 for(const f of plan.frames){
  for(const chain of stripChains(f.edges))edgeStrip(edges,chain);
  let run=0;
  for(const e of f.edges){
   if(e.kind!=='shared'&&e.length>1e-6){const g=WAVERLEY_LEVELS.ground;faces.poly([[e.a[0],g,e.a[1]],[e.b[0],g,e.b[1]],[e.b[0],deck,e.b[1]],[e.a[0],deck,e.a[1]]],[[run,g],[run+e.length,g],[run+e.length,deck],[run,deck]],{normal:[-e.inward[0],0,-e.inward[1]]});}
   run+=e.length;
  }
 }
 return {ironwork,fittings,edges,faces};
}
/** The paint material for a coloured batch: the colours are the vertices'; the small emissive term stands in for the light that comes down through the glazing, so an underside is not black (as materials.ts ribPaint). */
export function paintMaterial(base:THREE.Material):THREE.MeshLambertMaterial{
 const m=base.clone() as THREE.MeshLambertMaterial;m.color.setHex(0xffffff);m.vertexColors=true;m.map=null;m.emissive=new THREE.Color(0x2a2c2e);return m;
}
