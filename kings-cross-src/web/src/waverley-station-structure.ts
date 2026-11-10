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
import {bandAt,crossSection,distanceToEdges,FIGURES,platformFrame,stripChains,worldPoint} from './furniture.ts';
import type {Frame,StripChain,TrackSegment} from './furniture.ts';
import {WAVERLEY_LEVELS,cleanRing} from './waverley-mesh.ts';
import {footprintRuns,roofHeight,WAVERLEY_ROOF_PROFILE} from './waverley-roof.ts';

export const WAVERLEY_STRUCTURE={
 /** Gutter girders under each furrow: top 0.05 m under the ASSUMED 8 m gutter, 1.5 m deep (ASSUMED from R-wv1-b3, where the main girders are deep
  *  riveted lattices, deeper than a pedestal is tall). */
 gutterGirderTop:7.95,gutterGirderDepth:1.5,
 /** A gutter girder stops this far short of the roof's edge, a hole or a bridge (m): its 0.3 m chord, square to a bridge's slanting flank, would
  *  otherwise poke under the deck (North Bridge crosses the furrows at about 16 degrees). ASSUMED. */
 gutterEnd:1.0,
 /** ... and this far short of the roof's own outline or its hole, where nothing stands over it. ASSUMED. */
 gutterEdge:.15,
 /** Rafters: the secondary grid between the gutter girders (R-wv1-b, R-wv1-b3), one up each slope from gutter to ridge every 3 m, 0.12 m
  *  wide and 0.3 m deep, their tops 0.03 m under the glazing, so the folds read from the platforms. ASSUMED sizes, R-wv1-b3. */
 purlinSpacing:3,rafterWidth:.12,rafterDepth:.3,rafterGap:.03,
 /** The clad gable ends round the roof's edge (R-wv1-a: vertical aluminium cladding closes each ridge where the roof meets its outline):
  *  from 7.9 m up to the glazing. ASSUMED. */
 fasciaBottom:7.9,
 /** The south edge (HES LB30270: "cast iron columns and masonry walls"): OSM's south outline runs along the track side of the southern
  *  platforms, so 1 m inside it is track all the way (no wall or column can stand there) and 0.5 m outside it is platform or track. The
  *  edge is a lattice girder 1 m in from the outline at the platform girders' height, tying the gutter girders' ends. An outline edge is a
  *  south edge when its outward normal points this far south (cos 60 degrees) and the roof does not resume within edgeProbe metres. ASSUMED. */
 southFacing:.5,edgeProbe:20,edgeInset:1,
 /** The green railings of R-wv1-b along a platform edge with no track beside it: 1.1 m high, 0.3 m in from the edge, posts every 1.5 m,
  *  bars every 0.15 m (ASSUMED sizes, R-wv1-b). */
 railHeight:1.1,railInset:.3,railPost:1.5,railBar:.15,
 /** Platform girders, column to column: top 0.25 m under the gutter girders', 1.15 m deep, so every chord face is at least 0.07 m from every
  *  other girder's (ASSUMED, R-wv1-b3). */
 platformGirderTop:7.70,platformGirderDepth:1.15,
 /** Chord 0.3 m wide x 0.18 m deep; lattice flats 0.12 x 0.08 m; the lattice is doubled (crossed diagonals and a vertical at every panel
  *  point, R-wv1-b3), panels square to the girder's depth (ASSUMED, R-wv1-b3). */
 chordWidth:.3,chordDepth:.18,latticeWidth:.12,latticeDepth:.08,
 /** Column: pedestal 0.66 m across and 1.2 m tall, shaft 0.34 m across, capital flaring to 0.84 m over 0.6 m, abacus 0.15 m (ASSUMED, R-wv1-b against the 0.915 m platform). */
 pedestalRadius:.33,pedestalHeight:1.2,shaftRadius:.17,capitalRadius:.42,capitalHeight:.6,abacus:.15,
 /** 12 flutes, their bottoms at 0.88 of the shaft radius; 8 capital leaves 0.16 m wide reaching 0.08 m past the bell, their tips 0.75 of
  *  the way up it. ASSUMED counts and sizes, read off R-wv1-b's gilt Corinthian heads (no published figure). */
 flutes:12,fluteDepth:.88,leaves:8,leafWidth:.16,leafOut:.08,leafTip:.75,
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
 /** The bench's seat of four slats and back of three, 0.09 m wide, on cast end frames (R-wv1-b2). ASSUMED. */
 benchSlat:.09,
 /** A platform building on each platform (R-wv1-b: the single-storey rendered office on platform 19, behind green railings): 3 m deep, 3.2 m
  *  high, filling the span between two columns less 0.8 m at each end, in the span whose band clear of the KX safety line is widest along
  *  its whole length. Benches and screens give way in that span. ASSUMED sizes and rule, read off R-wv1-b. */
 buildingDepth:3,buildingHeight:3.2,buildingEnd:.8,
 /** ... and its railings stand this far out from its long walls (m). ASSUMED, R-wv1-b. */
 officeRail:.6,
 /** The office's windows: one every 2.4 m along each long wall after a 1.4 m door bay, a 1.3 m square pale frame round 1.1 m square glass,
  *  centred 1.65 m up; a door 1.0 m wide and 2.2 m high centred 0.7 m from the west end. ASSUMED, read off R-wv1-b's BTP office. */
 windowEvery:2.4,doorBay:1.4,windowFrame:1.3,windowGlass:1.1,windowCentre:1.65,doorSize:[1,2.2] as const,doorAt:.7,
 /** The coper's nosing: 0.04 m proud of the platform face, 0.1 m deep, under the coper band (R-wv1-b: a pale lip with a shadow line). ASSUMED. */
 coperLip:.04,coperNose:.1,
 /** Platform-number signs: a 0.55 m square, 3.0-3.55 m up a column, on every third column (ASSUMED, R-wv1-b; generic, no lettering). */
 signSize:.55,signBottom:3.0,signEvery:3,
 /** Departure screens: 1.4 x 0.45 x 0.12 m, bottom 3.2 m up, hung on rods from the platform girder, on every third span (ASSUMED, R-wv1-b; blank). */
 screenWidth:1.4,screenHeight:.45,screenDepth:.12,screenBottom:3.2,screenEvery:3,
 /** The screen round the roof's hole over the central block: from the roof's surface down to 6.6 m, clear of the block's 6.04 m cornice and its 0.85 m balustrade (to 6.89 m)
  * (R-wv1-a3 shows a pale valance all round the hole; its depth is ASSUMED from that photo). Drawn in 1 m pieces so its top follows the folds. */
 valanceBottom:7.0,valancePiece:1,
 /** The platform-edge strip lies this far above the platform top (the KX figure, backed by a polygon offset). */
 stripLift:FIGURES.stripLift,
} as const;
/** Paint, read off R-wv1-b: light grey ironwork, white columns, gilt capitals, dark green pedestals; the furniture's colours likewise. ASSUMED shades. */
export const WAVERLEY_PAINT={iron:0xd5d8d8,column:0xeeece4,gilt:0xc9a032,pedestal:0x24493a,lamp:0xf1f0ea,bench:0x8f969b,sign:0x1f4a96,signFace:0xf4f4f0,screen:0x1b1d20,valance:0xe6dcc0,fascia:0xa9afb4,railing:0x2c5a3f,render:0xd8ccb2,office:0x34465a,officeRoof:0x6d7175,door:0x24493a} as const;

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
 /** Rafter pairs between neighbouring gutter girders (up to the ridge and down again): [x0, x1, z]. */
 purlins:[number,number,number][];
 /** The roof's outline (for the clad gable ends) and the south edge girders, 1 m pieces. */
 outline:Pt[];edgeGirders:[Pt,Pt][];
 /** Railings: [from, to] along a platform's open edge, already set in. */
 railings:[Pt,Pt][];
 lamps:WaverleyPlacement[];benches:WaverleyPlacement[];signs:WaverleyPlacement[];screens:WaverleyPlacement[];
 /** Platform buildings: centre, rotation (local x along the platform), length. */
 offices:(WaverleyPlacement&{length:number})[];
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
const segDist=(p:Pt,a:Pt,b:Pt):number=>{const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz,t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);};
const area2=(r:readonly Pt[]):number=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return s;};

/** Where everything goes (pure: no three.js objects). */
export function waverleyStationPlan(data:Pick<WaverleyData,'platforms'|'rails'>,roof:Pick<WaverleyArea,'outer'|'holes'>|undefined,cutouts:readonly (readonly Pt[])[]=[]):WaverleyStationPlan{
 const S=WAVERLEY_STRUCTURE,P=WAVERLEY_ROOF_PROFILE,frames=waverleyPlatformFrames(data),tracks=waverleyRailPieces(data);
 const plan:WaverleyStationPlan={frames,columns:[],spans:[],holes:[],cutouts,gutters:[],purlins:[],outline:[],edgeGirders:[],railings:[],lamps:[],benches:[],signs:[],screens:[],offices:[]};
 if(!roof)return plan;
 const outer=cleanRing(roof.outer),xs=outer.map(p=>p[0]);plan.holes=roof.holes.map(cleanRing);plan.outline=outer;
 const nearTrack=(p:Pt,d:number):boolean=>tracks.some(([a,b])=>segDist(p,a,b)<d);
 const nearCut=(p:Pt):boolean=>cutouts.some(c=>inRing(p,c)||edgeDistance(p,c)<.5);
 for(let k=Math.ceil((Math.min(...xs)-P.phase)/P.pitch);P.phase+k*P.pitch<Math.max(...xs);k++){
  const x=P.phase+k*P.pitch;
  for(const [z0,z1]of footprintRuns(roof.outer,[...roof.holes,...cutouts],x)){
   const a=z0+(nearCut([x,z0])?S.gutterEnd:S.gutterEdge),b=z1-(nearCut([x,z1])?S.gutterEnd:S.gutterEdge);if(b-a>1)plan.gutters.push([x,a,b]);
  }
  // Rafters to the next gutter line, every purlinSpacing in z, where both ends and the ridge are under the roof.
  const x0=x+S.chordWidth/2,x1=x+P.pitch-S.chordWidth/2,zs=outer.map(p=>p[1]);
  for(let z=Math.ceil(Math.min(...zs)/S.purlinSpacing)*S.purlinSpacing;z<Math.max(...zs);z+=S.purlinSpacing)
   if([x0,(x0+x1)/2,x1].every(px=>underRoof(roof,[px,z],.3,cutouts)))plan.purlins.push([x0,x1,z]);
 }
 // Railings along platform edges with no track beside them (R-wv1-b), set in from the edge, under the roof.
 for(const f of frames)for(const e of f.edges){
  if(e.kind!=='open'||e.length<2)continue;
  const ia:Pt=[e.a[0]+e.inward[0]*S.railInset+e.dir[0]*.3,e.a[1]+e.inward[1]*S.railInset+e.dir[1]*.3],ib:Pt=[e.b[0]+e.inward[0]*S.railInset-e.dir[0]*.3,e.b[1]+e.inward[1]*S.railInset-e.dir[1]*.3];
  if([ia,ib].every(q=>inRing(q,f.pts)&&!nearTrack(q,1.75)&&underRoof(roof,q,0,cutouts)))plan.railings.push([ia,ib]);
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
  // The platform building's span: the one whose band, S.buildingDepth/2 clear of the safety line, is widest along its whole length.
  let office=-1,officeWidth=0;
  for(let i=1;i<own.length;i++){
   const a=own[i-1],b=own[i],span=Math.hypot(a.c.x-b.c.x,a.c.z-b.c.z);if(span>S.maxSpan)continue;
   const end=(S.pedestalRadius+S.buildingEnd)*(b.t-a.t)/span;let w=Infinity;
   for(let t=a.t+end;t<=b.t-end+1e-9;t+=.5){const band=bandAt(f,t,S.buildingDepth/2);w=Math.min(w,band?band.s1-band.s0:-1);}
   if(w>=0&&w>officeWidth-1e-9&&(office<0||w>officeWidth)){office=i;officeWidth=w;}
  }
  for(let i=1;i<own.length;i++){
   const a=own[i-1],b=own[i];if(Math.hypot(a.c.x-b.c.x,a.c.z-b.c.z)>S.maxSpan)continue;
   plan.spans.push([[a.c.x,a.c.z],[b.c.x,b.c.z]]);
   const mid:Pt=[(a.c.x+b.c.x)/2,(a.c.z+b.c.z)/2],tm=(a.t+b.t)/2,rotY=rotAcross(f);
   plan.lamps.push({x:mid[0],z:mid[1],rotY,ref:f.ref});
   if(i===office){
    const band=bandAt(f,tm,S.buildingDepth/2)!,c=worldPoint(f,tm,band.mid),span=Math.hypot(a.c.x-b.c.x,a.c.z-b.c.z);
    plan.offices.push({x:c[0],z:c[1],rotY,ref:f.ref,length:span-2*(S.pedestalRadius+S.buildingEnd)});
    // The green railings in front of the office (R-wv1-b), on both long sides, column to column less 0.5 m at each end, where the platform
    // has room for them clear of the safety line along the whole span.
    let room=true;for(let t=a.t;t<=b.t;t+=.5)if(!bandAt(f,t,S.buildingDepth/2+S.officeRail))room=false;
    const ux=(b.c.x-a.c.x)/span,uz=(b.c.z-a.c.z)/span,nx=-uz,nz=ux,r=S.buildingDepth/2+S.officeRail,e=S.pedestalRadius+.5;
    if(room)for(const sgn of [-1,1])plan.railings.push([[a.c.x+ux*e+nx*r*sgn+(c[0]-mid[0]),a.c.z+uz*e+nz*r*sgn+(c[1]-mid[1])],[b.c.x-ux*e+nx*r*sgn+(c[0]-mid[0]),b.c.z-uz*e+nz*r*sgn+(c[1]-mid[1])]]);
    continue;
   }
   if(i%S.benchEvery===0&&bandAt(f,tm,S.benchLength/2))plan.benches.push({x:mid[0],z:mid[1],rotY,ref:f.ref});
   if(i%S.screenEvery===1&&bandAt(f,tm,S.screenWidth/2)){
    // Hung a quarter span off the bench/lamp point, so it never meets the lamp.
    const q:Pt=[mid[0]+(b.c.x-a.c.x)/4,mid[1]+(b.c.z-a.c.z)/4];plan.screens.push({x:q[0],z:q[1],rotY,ref:f.ref});
   }
  }
 }
 // Islands that OSM draws as two polygons sharing a seam (8e/9e, 8w/9w, 12/13, 15/16, 18/17...): neither half alone keeps a column clear
 // of its track, but the island does. Its middle line is the middle of the two halves' sections taken together; the clearance is the
 // KX safety line from every track edge of either half (bandAt's rule), plus the pedestal.
 const clearance=FIGURES.safetyLine+FIGURES.safetySlack;
 for(let i=0;i<frames.length;i++)for(let j=i+1;j<frames.length;j++){
  const f=frames[i],g=frames[j];if(!f.pts.some(p=>g.pts.some(q=>Math.hypot(p[0]-q[0],p[1]-q[1])<.05)))continue;
  const ref=`${f.ref}/${g.ref}`,edges=[...f.edges,...g.edges],free=(p:Pt,half:number)=>distanceToEdges(p,edges)>=clearance+half&&(inRing(p,f.pts)||inRing(p,g.pts));
  const mids:{t:number;p:Pt}[]=[];
  for(let t=Math.max(f.tLo,g.tLo)+.25;t<Math.min(f.tHi,g.tHi);t+=.5){
   const a=crossSection(f.pts,f.axis,t),b=crossSection(g.pts,f.axis,t);if(!a||!b||Math.min(Math.abs(a.hi-b.lo),Math.abs(b.hi-a.lo))>.6)continue;
   mids.push({t,p:worldPoint(f,t,(Math.min(a.lo,b.lo)+Math.max(a.hi,b.hi))/2)});
  }
  const own:{t:number;c:WaverleyColumn}[]=[];
  for(let k=1;k<mids.length;k++){
   const a=mids[k-1],b=mids[k],ka=Math.floor((a.p[0]-P.phase)/P.pitch),kb=Math.floor((b.p[0]-P.phase)/P.pitch);if(ka===kb)continue;
   const x=P.phase+Math.max(ka,kb)*P.pitch,u=(x-a.p[0])/(b.p[0]-a.p[0]),p:Pt=[x,a.p[1]+(b.p[1]-a.p[1])*u];
   if(!free(p,S.pedestalRadius)||!underRoof(roof,p,S.roofMargin,cutouts)||plan.columns.some(c=>Math.hypot(c.x-p[0],c.z-p[1])<S.mergeDistance))continue;
   const c={x:p[0],z:p[1],ref};plan.columns.push(c);own.push({t:a.t+(b.t-a.t)*u,c});
  }
  const rotY=rotAcross(f);
  own.forEach(({c},k)=>{if(k%S.signEvery===1)plan.signs.push({x:c.x,z:c.z,rotY,ref});});
  for(let k=1;k<own.length;k++){
   const a=own[k-1].c,b=own[k].c;if(Math.hypot(a.x-b.x,a.z-b.z)>S.maxSpan)continue;
   plan.spans.push([[a.x,a.z],[b.x,b.z]]);const mid:Pt=[(a.x+b.x)/2,(a.z+b.z)/2];
   plan.lamps.push({x:mid[0],z:mid[1],rotY,ref});
   if(k%S.benchEvery===0&&free(mid,S.benchLength/2))plan.benches.push({x:mid[0],z:mid[1],rotY,ref});
   const q:Pt=[mid[0]+(b.x-a.x)/4,mid[1]+(b.z-a.z)/4];if(k%S.screenEvery===1&&free(q,S.screenWidth/2))plan.screens.push({x:q[0],z:q[1],rotY,ref});
  }
 }
 // The south edge: a girder 1 m in from each south-facing perimeter edge, in 1 m pieces clear of the bridges, tying the gutter girders' ends.
 const sign=area2(outer)>0?1:-1;
 for(let i=0;i<outer.length;i++){
  const a=outer[i],b=outer[(i+1)%outer.length],len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.5)continue;
  const d:Pt=[(b[0]-a[0])/len,(b[1]-a[1])/len],out:Pt=sign>0?[d[1],-d[0]]:[-d[1],d[0]];if(out[1]<S.southFacing)continue;
  if(inRing([(a[0]+b[0])/2+out[0]*S.edgeProbe,(a[1]+b[1])/2+out[1]*S.edgeProbe],outer))continue;
  const at=(s:number):Pt=>[a[0]+d[0]*s-out[0]*S.edgeInset,a[1]+d[1]*s-out[1]*S.edgeInset],n=Math.max(1,Math.round(len));
  for(let k=0;k<n;k++){const p0=at(len*k/n),p1=at(len*(k+1)/n);if([p0,p1].every(q=>underRoof(roof,q,S.edgeInset-.05,cutouts)))plan.edgeGirders.push([p0,p1]);}
 }
 return plan;
}

// --- shapes (one coloured Batch per draw)
const sub3=(a:V3,b:V3):V3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross3=(a:V3,b:V3):V3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm3=(a:V3):V3=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
/** A bar from a to b, w wide and h deep, its ends left open (they always butt into a chord or a column). */
function bar(batch:Batch,a:V3,b:V3,w:number,h:number,color:Rgb,skip:readonly ('up'|'down')[]=[]):void{
 const d=norm3(sub3(b,a));let side=cross3([0,1,0],d);if(Math.hypot(...side)<1e-6)side=[1,0,0];side=norm3(side);const up=cross3(d,side);
 const at=(e:V3,sx:number,sy:number):V3=>[e[0]+side[0]*sx*w/2+up[0]*sy*h/2,e[1]+side[1]*sx*w/2+up[1]*sy*h/2,e[2]+side[2]*sx*w/2+up[2]*sy*h/2];
 const neg=(v:V3):V3=>[-v[0],-v[1],-v[2]];
 for(const [s0,t0,s1,t1,n]of [[1,-1,1,1,side],[-1,-1,-1,1,neg(side)],[-1,1,1,1,up],[-1,-1,1,-1,neg(up)]] as [number,number,number,number,V3][])
  if(!(t0===1&&t1===1&&skip.includes('up'))&&!(t0===-1&&t1===-1&&skip.includes('down')))batch.poly([at(a,s0,t0),at(b,s0,t0),at(b,s1,t1),at(a,s1,t1)],undefined,{facing:n,color});
}
/** A Warren lattice girder from a to b (plan), its top at `top`: two chords and diagonals at 45 degrees. */
export function latticeGirder(batch:Batch,a:Pt,b:Pt,top:number,depth:number,color:Rgb):void{
 const S=WAVERLEY_STRUCTURE,len=Math.hypot(b[0]-a[0],b[1]-a[1]);if(len<.5)return;
 const yt=top-S.chordDepth/2,yb=top-depth+S.chordDepth/2,p=(s:number,y:number):V3=>[a[0]+(b[0]-a[0])*s,y,a[1]+(b[1]-a[1])*s];
 bar(batch,p(0,yt),p(1,yt),S.chordWidth,S.chordDepth,color);bar(batch,p(0,yb),p(1,yb),S.chordWidth,S.chordDepth,color);
 // Square panels, each crossed by both diagonals, a vertical at every panel point (the doubled lattice of R-wv1-b3). The verticals sit
 // between the chords; the diagonals run chord face to chord face.
 const n=Math.max(1,Math.round(len/(depth-S.chordDepth))),yi=yt-S.chordDepth/2,yo=yb+S.chordDepth/2;
 // The flats are thin plates: their two broad faces only (their 0.08 m edges are left out, which halves the lattice's triangles).
 for(let i=0;i<n;i++){const s0=i/n,s1=(i+1)/n;bar(batch,p(s0,yo),p(s1,yi),S.latticeWidth,S.latticeDepth,color,['up','down']);bar(batch,p(s0,yi),p(s1,yo),S.latticeWidth*.8,S.latticeDepth,color,['up','down']);}
 // (The second set is narrower, so where the two cross no faces share a plane.)
 const rotY=Math.atan2(-(b[1]-a[1]),b[0]-a[0]);
 for(let i=1;i<n;i++){const c=p(i/n,(yi+yo)/2);batch.box(c,[S.latticeDepth,yi-yo,S.latticeWidth*.9],{rotY,color,skip:['+y','-y','+x','-x']});}
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
 /** Platforms part: the blister warning strip, UVs in metres along and across it (waverley-station-textures.ts `blister`). */
 tactile:Batch;
 /** Platforms part, drawn with the edge strip: the coper's nosing on every track edge (front and underside). */
 lip:Batch;
}
/** The bands laid along a track edge, metres in from the coper's face: a pale coper, then the yellow blister strip, 0.4 m deep with its
 * front 0.6 m back from the edge (DfT, Guidance on the use of tactile paving surfaces: a 400 mm platform-edge warning strip; the 0.6 m
 * set-back is ASSUMED within that guidance's range), as R-wv1-b and R-wv1-b2 show. The coper's 0.3 m depth is ASSUMED. */
export const WAVERLEY_EDGE_BANDS=[{from:0,to:.3,color:0xd9d7d0},{from:.6,to:1.0,color:0xd8b324}] as const;
/** The bands along one run of track edges, between the run's outer line and its mitred inner line (stripChains, 1.6 m in): the coper
 *  coloured, the warning strip textured (u along the edge, v across it, metres). */
function edgeStrip(b:Batch,tactile:Batch,chain:StripChain):void{
 const y=WAVERLEY_LEVELS.platform+WAVERLEY_STRUCTURE.stripLift,w=FIGURES.stripWidth;
 const at=(k:number,u:number):V3=>{const o=chain.outer[k],i=chain.inner[k],f=Math.min(1,u/w);return [o[0]+(i[0]-o[0])*f,y,o[1]+(i[1]-o[1])*f];};
 const [coper,warning]=WAVERLEY_EDGE_BANDS,color=rgb(coper.color);
 let along=0;
 for(let k=0;k+1<chain.outer.length;k++){
  b.poly([at(k,coper.from),at(k+1,coper.from),at(k+1,coper.to),at(k,coper.to)],undefined,{normal:[0,1,0],facing:[0,1,0],color});
  const s0=along,s1=along+Math.hypot(chain.outer[k+1][0]-chain.outer[k][0],chain.outer[k+1][1]-chain.outer[k][1]);along=s1;
  tactile.poly([at(k,warning.from),at(k+1,warning.from),at(k+1,warning.to),at(k,warning.to)],[[s0,0],[s1,0],[s1,warning.to-warning.from],[s0,warning.to-warning.from]],{normal:[0,1,0],facing:[0,1,0]});
 }
}
/** Vertical pieces of `piece` metres along a-b from `bottom` up to the glazing, both faces (gable cladding, the valance). Each piece is cut
 *  again at every fold (furrow or ridge) it crosses, so its straight top follows the roof's profile and never rises through a furrow. */
function roofScreen(b:Batch,a:Pt,c:Pt,bottom:number,piece:number,color:Rgb,skip:(p:Pt)=>boolean):void{
 const len=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.max(1,Math.ceil(len/piece)),p=(t:number):Pt=>[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t];
 const P=WAVERLEY_ROOF_PROFILE,half=P.pitch/2;
 for(let k=0;k<n;k++){
  const t0=k/n,t1=(k+1)/n,p0=p(t0),p1=p(t1);if([p0,p1,p((k+.5)/n)].some(skip))continue;
  const ts=[t0];
  if(Math.abs(p1[0]-p0[0])>1e-9)for(let f=Math.ceil((Math.min(p0[0],p1[0])-P.phase)/half);P.phase+f*half<Math.max(p0[0],p1[0]);f++){
   const t=t0+(t1-t0)*(P.phase+f*half-p0[0])/(p1[0]-p0[0]);if(t>t0+1e-9&&t<t1-1e-9)ts.push(t);
  }
  ts.sort((u,v)=>u-v);ts.push(t1);
  for(let i=0;i+1<ts.length;i++){
   const q0=p(ts[i]),q1=p(ts[i+1]),quad:V3[]=[[q0[0],bottom,q0[1]],[q1[0],bottom,q1[1]],[q1[0],roofHeight(q1[0]),q1[1]],[q0[0],roofHeight(q0[0]),q0[1]]];
   b.poly(quad,undefined,{color});b.poly([...quad].reverse(),undefined,{color});
  }
 }
}
export function waverleyStructureBatches(plan:WaverleyStationPlan):WaverleyStructureBatches{
 const S=WAVERLEY_STRUCTURE,C=Object.fromEntries(Object.entries(WAVERLEY_PAINT).map(([k,v])=>[k,rgb(v)])) as Record<keyof typeof WAVERLEY_PAINT,Rgb>;
 const ironwork=new Batch({colored:true,uv:false}),fittings=new Batch({colored:true,uv:false}),edges=new Batch({colored:true,uv:false}),faces=new Batch(),tactile=new Batch(),lip=new Batch({colored:true,uv:false});
 const deck=WAVERLEY_LEVELS.platform,underGirder=S.platformGirderTop-S.platformGirderDepth;
 for(const [x,z0,z1]of plan.gutters)latticeGirder(ironwork,[x,z0],[x,z1],S.gutterGirderTop,S.gutterGirderDepth,C.iron);
 for(const [a,b]of plan.spans)latticeGirder(ironwork,a,b,S.platformGirderTop,S.platformGirderDepth,C.iron);
 for(const l of plan.lamps){
  const rim=deck+S.lampRim;
  ironwork.box([l.x,(rim+S.lampShade+underGirder)/2,l.z],[.04,underGirder-rim-S.lampShade,.04],{color:C.iron});
  frustum(ironwork,l.x,l.z,S.lampRadius,.08,rim,rim+S.lampShade,8,C.lamp);
  ironwork.poly(Array.from({length:8},(_,i):V3=>[l.x+S.lampRadius*Math.cos(i/8*Math.PI*2),rim,l.z+S.lampRadius*Math.sin(i/8*Math.PI*2)]),undefined,{facing:[0,-1,0],color:C.lamp});
 }
 const underDeck=(q:Pt):boolean=>plan.cutouts.some(c=>inRing(q,c));
 // The valance round the hole (seen from inside the hole and from under the roof), and the clad gables round the outline and along the
 // bridges' flanks, none of them under a bridge deck.
 for(const h of plan.holes)for(let i=0;i<h.length;i++)roofScreen(ironwork,h[i],h[(i+1)%h.length],S.valanceBottom,S.valancePiece,C.valance,underDeck);
 const o=plan.outline;
 for(let i=0;i<o.length;i++)roofScreen(ironwork,o[i],o[(i+1)%o.length],S.fasciaBottom,S.valancePiece,C.fascia,underDeck);
 const outsideRoof=(q:Pt):boolean=>!inRing(q,o)||plan.holes.some(h=>inRing(q,h));
 for(const c of plan.cutouts)for(let i=0;i<c.length;i++)roofScreen(ironwork,c[i],c[(i+1)%c.length],S.fasciaBottom,S.valancePiece,C.fascia,q=>outsideRoof(q)||edgeDistance(q,o)<.05);
 // Rafters: a bar up each slope, its top rafterGap under the glazing (measured square to the slope; the drop is the same vertically,
 // divided by the slope's cosine). The top face is left out: it is hidden under the cassettes.
 for(const [x0,x1,z]of plan.purlins){
  const xm=(x0+x1)/2,cos=Math.cos(Math.atan2(WAVERLEY_ROOF_PROFILE.rise,WAVERLEY_ROOF_PROFILE.pitch/2)),drop=(S.rafterGap+S.rafterDepth/2)/cos,at=(x:number):V3=>[x,roofHeight(x)-drop,z];
  bar(ironwork,at(x0),at(xm),S.rafterWidth,S.rafterDepth,C.iron,['up']);bar(ironwork,at(xm),at(x1),S.rafterWidth,S.rafterDepth,C.iron,['up']);
 }
 for(const [a,b]of plan.edgeGirders)latticeGirder(ironwork,a,b,S.platformGirderTop,S.platformGirderDepth,C.iron);
 for(const [a,b]of plan.railings){
  const len=Math.hypot(b[0]-a[0],b[1]-a[1]),d:Pt=[(b[0]-a[0])/len,(b[1]-a[1])/len],rotY=Math.atan2(-d[1],d[0]),y0=deck,y1=deck+S.railHeight,at=(s:number):Pt=>[a[0]+d[0]*s,a[1]+d[1]*s];
  for(const y of [y0+.12,y1-.03]){const c=at(len/2);fittings.box([c[0],y,c[1]],[len,.05,.04],{rotY,color:C.railing});}
  for(let s=0;s<=len+1e-6;s+=S.railPost){const c=at(Math.min(s,len));fittings.box([c[0],(y0+y1)/2,c[1]],[.06,S.railHeight,.06],{rotY,color:C.railing});}
  for(let s=S.railBar;s<len;s+=S.railBar){const c=at(s);fittings.box([c[0],(y0+.12+y1-.03)/2,c[1]],[.018,y1-.03-y0-.12,.018],{rotY,color:C.railing,skip:['+y','-y']});}
 }
 for(const c of plan.columns){
  const y1=deck+S.pedestalHeight,y3=underGirder-S.abacus,y2=y3-S.capitalHeight;
  frustum(fittings,c.x,c.z,S.pedestalRadius,S.pedestalRadius,deck,y1,8,C.pedestal);
  // A fluted shaft (R-wv1-b, b3): S.flutes flutes, the arrises at the full radius, the flute bottoms S.fluteDepth of it.
  const sides=2*S.flutes,ring=(r:number,k:number):[number,number]=>{const a=k/sides*Math.PI*2,f=k%2?S.fluteDepth:1;return [c.x+r*f*Math.cos(a),c.z+r*f*Math.sin(a)];};
  for(let k=0;k<sides;k++){const [ax,az]=ring(S.shaftRadius,k),[bx,bz]=ring(S.shaftRadius,k+1),m=(k+.5)/sides*Math.PI*2;
   fittings.poly([[ax,y1,az],[bx,y1,bz],[bx,y2,bz],[ax,y2,az]],undefined,{facing:[Math.cos(m),0,Math.sin(m)],color:C.column});}
  frustum(fittings,c.x,c.z,S.shaftRadius,S.capitalRadius,y2,y3,8,C.gilt,false);
  // The leafy capital (R-wv1-b's gilt Corinthian heads): S.leaves leaves curling out from the bell, each a gilt blade from the necking out
  // past the bell to its tip, both faces.
  for(let k=0;k<S.leaves;k++){
   const a=(k+.5)/S.leaves*Math.PI*2,ca=Math.cos(a),sa=Math.sin(a),tx=-sa,tz=ca,w=S.leafWidth/2,r0=S.shaftRadius,r1=S.capitalRadius+S.leafOut,ym=y2+S.capitalHeight*S.leafTip;
   const leaf:V3[]=[[c.x+ca*r0+tx*w,y2,c.z+sa*r0+tz*w],[c.x+ca*r0-tx*w,y2,c.z+sa*r0-tz*w],[c.x+ca*r1,ym,c.z+sa*r1]];
   fittings.poly(leaf,undefined,{color:C.gilt});fittings.poly([...leaf].reverse(),undefined,{color:C.gilt});
  }
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
 for(const o of plan.offices){
  // A rendered single-storey office (R-wv1-b): body, a flat roof slab overhanging 0.15 m, a dark window band on both long sides.
  const along=o.rotY+Math.PI/2,H=S.buildingHeight,D=S.buildingDepth;
  fittings.box([o.x,deck+H/2,o.z],[o.length,H,D],{rotY:along,color:C.render,skip:['-y']});
  fittings.box([o.x,deck+H+.075,o.z],[o.length+.3,.15,D+.3],{rotY:along,color:C.officeRoof});
  // Framed windows (a pale frame box, the dark glass 0.02 m proud of it) every S.windowEvery on both long sides after the door bay, and a
  // door at the west end of each (sizes in WAVERLEY_STRUCTURE, ASSUMED from R-wv1-b).
  const ax=Math.cos(along),az=-Math.sin(along),at=(u:number):[number,number]=>[o.x+ax*u,o.z+az*u],n=Math.max(1,Math.floor((o.length-S.doorBay)/S.windowEvery));
  for(let k=0;k<n;k++){const u=-o.length/2+S.doorBay+(k+.5)*(o.length-S.doorBay)/n,[x,z]=at(u);
   fittings.box([x,deck+S.windowCentre,z],[S.windowFrame,S.windowFrame,D+.06],{rotY:along,color:C.signFace,skip:['+y','-y','+x','-x']});
   fittings.box([x,deck+S.windowCentre,z],[S.windowGlass,S.windowGlass,D+.1],{rotY:along,color:C.office,skip:['+y','-y','+x','-x']});}
  {const [dw,dh]=S.doorSize,[x,z]=at(-o.length/2+S.doorAt);fittings.box([x,deck+dh/2,z],[dw,dh,D+.06],{rotY:along,color:C.door,skip:['+y','-y','+x','-x']});}
 }
 for(const s of plan.benches){
  // The bench runs along the platform (local x along the axis): a seat of slats with gaps, a back of slats leaning 10 degrees, and a cast
  // end frame at each end (front and back legs, a seat rail and the back post).
  const ax=Math.cos(s.rotY),az=-Math.sin(s.rotY),ux=-az,uz=ax,along=s.rotY+Math.PI/2,at=(u:number,v:number):[number,number]=>[s.x+ux*u+ax*v,s.z+uz*u+az*v];
  const L=S.benchLength,D=S.benchDepth,sl=S.benchSlat;
  for(let i=0;i<4;i++){const v=-D/2+sl/2+i*(D-sl)/3,[x,z]=at(0,v);fittings.box([x,deck+S.benchSeat,z],[L,.035,sl],{rotY:along,color:C.bench});}
  for(let i=0;i<3;i++){const h=S.benchSeat+.12+i*.13,[x,z]=at(0,-D/2-.02-i*.023);fittings.box([x,deck+h,z],[L,sl,.03],{rotY:along,rotZ:0,color:C.bench});}
  for(const k of [-1,1]){
   const u=k*(L/2-.12);
   for(const v of [-D/2+.05,D/2-.05]){const [x,z]=at(u,v);fittings.box([x,deck+(S.benchSeat-.02)/2,z],[.05,S.benchSeat-.02,.05],{rotY:along,color:C.iron});}
   const [x,z]=at(u,0);fittings.box([x,deck+S.benchSeat-.04,z],[.05,.05,D],{rotY:along,color:C.iron});
   const [bx,bz]=at(u,-D/2-.03);fittings.box([bx,deck+(S.benchSeat+S.benchBack)/2,bz],[.05,S.benchBack-S.benchSeat+.05,.05],{rotY:along,color:C.iron});
  }
 }
 for(const f of plan.frames){
  for(const chain of stripChains(f.edges))edgeStrip(edges,tactile,chain);
  let along=0;
  for(const e of f.edges){
   if(e.kind==='track'&&e.length>1e-6){
    const o:Pt=[-e.inward[0]*S.coperLip,-e.inward[1]*S.coperLip],top=deck+S.stripLift,bot=deck-S.coperNose,cl=rgb(WAVERLEY_EDGE_BANDS[0].color);
    lip.poly([[e.a[0]+o[0],bot,e.a[1]+o[1]],[e.b[0]+o[0],bot,e.b[1]+o[1]],[e.b[0]+o[0],top,e.b[1]+o[1]],[e.a[0]+o[0],top,e.a[1]+o[1]]],undefined,{facing:[-e.inward[0],0,-e.inward[1]],color:cl});
    lip.poly([[e.a[0],bot,e.a[1]],[e.b[0],bot,e.b[1]],[e.b[0]+o[0],bot,e.b[1]+o[1]],[e.a[0]+o[0],bot,e.a[1]+o[1]]],undefined,{facing:[0,-1,0],color:cl});
    lip.poly([[e.a[0],top,e.a[1]],[e.b[0],top,e.b[1]],[e.b[0]+o[0],top,e.b[1]+o[1]],[e.a[0]+o[0],top,e.a[1]+o[1]]],undefined,{facing:[0,1,0],color:cl});
   }
   if(e.kind!=='shared'&&e.length>1e-6){const g=WAVERLEY_LEVELS.ground;faces.poly([[e.a[0],g,e.a[1]],[e.b[0],g,e.b[1]],[e.b[0],deck,e.b[1]],[e.a[0],deck,e.a[1]]],[[along,g],[along+e.length,g],[along+e.length,deck],[along,deck]],{normal:[-e.inward[0],0,-e.inward[1]]});}
   along+=e.length;
  }
 }
 return {ironwork,fittings,edges,faces,tactile,lip};
}
/** The paint material for a coloured batch: the colours are the vertices'; the small emissive term stands in for the light that comes down through the glazing, so an underside is not black (as materials.ts ribPaint). */
export function paintMaterial(base:THREE.Material):THREE.MeshLambertMaterial{
 const m=base.clone() as THREE.MeshLambertMaterial;m.color.setHex(0xffffff);m.vertexColors=true;m.map=null;m.emissive=new THREE.Color(0x2a2c2e);return m;
}
