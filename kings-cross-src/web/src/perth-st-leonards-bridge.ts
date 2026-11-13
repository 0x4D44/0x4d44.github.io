// St Leonard's Bridge, Perth (ALM-BUG-FLU-00021): the road overbridge across the station's south throat. OSM way/24228327 (highway=tertiary,
// bridge=yes, layer 1, lanes 2, sidewalk both; ODbL) carries the road over the main lines; way/24228328 and way/860005397 continue it west,
// way/208465188 (St Leonard's Bank) meets its east end. The city's roads leave every bridge=yes way out (tools/build-perth-city-landuse.ts:
// "no tunnels, bridges or indoor") and only the Tay's bridges were drawn, so the bridge was missing.
//
// Form, from R-slb-a: geograph 591926 (Adrian Beney, 2007-01-19, CC BY-SA 2.0), "Looking south from Perth Railway Station": dark coursed
// stone arches on stone piers over the tracks, the spandrels carrying a pale grey-green painted steel plate fascia that is also the parapet.
// Levels, from the Scottish Phase I 1 m LiDAR (OGLv3, read with tools/build-perth-city-heights.ts openPerthLidar, 2026-11-13): the DSM on the
// deck's centreline reads 15.0-15.2 m from 16 m to 72 m along the way (east to west); the DTM under it, on the track bed, 8.9-9.2 m. The
// railway's schematic rail head is y = 0 (perth-scene.ts), so the road is about 5.9 m over the rails. The DTM rises to the road at about
// 14 m and 74 m along the way: the abutments' faces. The 16 m context grid smooths the town's level down to 1-2 m at the bridge's ends, so
// the approaches stand on embankments with retaining walls and fall at an ASSUMED grade until they meet the drawn ground.
// ASSUMED (not measured): the deck's width, the crown's depth under the road, the pier positions and widths, the arches' springing, the parapet
// height, the footway widths, the colours (by eye from R-slb-a).
import type {Pt} from '../../core/geo.ts';
import {project} from '../../core/geo.ts';
import {PERTH_ORIGIN} from '../../core/perth-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,rgb} from './materials.ts';
import type {Rgb,V3} from './materials.ts';
import {wallBox} from './waverley-frontage-mesh.ts';

export const ST_LEONARDS_SOURCE={osm:'https://www.openstreetmap.org/way/24228327',photo:'https://www.geograph.org.uk/photo/591926',author:'Adrian Beney',
 licence:'CC BY-SA 2.0',date:'2007-01-19',lidar:'Scottish Public Sector LiDAR Phase I 1 m DSM/DTM (OGLv3)'} as const;
const ll=(lat:number,lon:number):Pt=>project(lat,lon,PERTH_ORIGIN);
/** OSM way/24228327, east node to west node. */
export const ST_LEONARDS_LINE:readonly Pt[]=[ll(56.3901191,-3.4377036),ll(56.3898659,-3.4388499)];
/** The approaches, each from the bridge way's end outward: east up St Leonard's Bank (way/208465188, reversed), west along St Leonard's
 *  Bridge (way/24228328, way/860005397). */
export const ST_LEONARDS_APPROACHES:readonly(readonly Pt[])[]=[
 [[56.3901191,-3.4377036],[56.3901396,-3.4376511],[56.3901643,-3.4376091],[56.3902177,-3.4375595],[56.3904048,-3.437472],[56.3906649,-3.4373421],[56.3907528,-3.4373088]].map(p=>ll(p[0],p[1])),
 [[56.3898659,-3.4388499],[56.3897463,-3.439294],[56.3896973,-3.439454],[56.3896624,-3.4395976],[56.3896571,-3.439631],[56.3896372,-3.4397536]].map(p=>ll(p[0],p[1])),
];
/** Metres along the way (from its east node) and heights over the rail (y = 0). `road` from the LiDAR (header); `abutments` the faces where
 *  the LiDAR's DTM meets the road. ASSUMED: `half` (the deck's half width, 11 m: two lanes and two footways; the DSM is at road level 5 m
 *  either side of the centreline and at track level 8 m out), `crown` (the arch's crown under the road), `fascia` (the steel fascia's foot
 *  under the road), `parapet` (its top over the road), `footway`, `kerb`; `piers` (centres, set in the gaps between the mapped tracks, which
 *  cross the way within 6 degrees of square, so each running line sits in the middle half of its arch; `pierWidth` along the way), `spring`
 *  (every arch's springing over the rail; the arches are elliptical, R-slb-a's are near semicircles), `grade` (the approaches' fall, 1 in
 *  12.5), `wallDepth` (the retaining walls' foot under the drawn ground). */
export const ST_LEONARDS={road:5.9,abutments:[14,74],half:5.5,crown:.75,fascia:.9,parapet:1.15,footway:2,kerb:.12,
 piers:[22.3,35.46,43.76,55.74],pierWidth:2.4,spring:2,grade:.08,wallDepth:.5,step:3} as const;
/** By eye from R-slb-a (ASSUMED): the dark weathered stone, the arches' shadowed soffits, the steel fascia's pale grey-green paint; the
 *  road's asphalt and the footways' paving as the frontage's (perth-frontage-bridge.ts). */
export const ST_LEONARDS_COLOURS={stone:0x5b544d,soffit:0x3b3733,steel:0x9aaba2,asphalt:0x45474a,footway:0x8c8780,kerb:0xb3ada3} as const;

const L=Math.hypot(ST_LEONARDS_LINE[1][0]-ST_LEONARDS_LINE[0][0],ST_LEONARDS_LINE[1][1]-ST_LEONARDS_LINE[0][1]);
const U:Pt=[(ST_LEONARDS_LINE[1][0]-ST_LEONARDS_LINE[0][0])/L,(ST_LEONARDS_LINE[1][1]-ST_LEONARDS_LINE[0][1])/L],V:Pt=[-U[1],U[0]];
/** The plan point `s` m along the way and `o` m to its side. */
export function stLeonardsAt(s:number,o=0):Pt{const a=ST_LEONARDS_LINE[0];return [a[0]+U[0]*s+V[0]*o,a[1]+U[1]*s+V[1]*o];}
/** Metres along the way and to its side of a plan point. */
export function stLeonardsFrame(p:Pt):{s:number;o:number}{const a=ST_LEONARDS_LINE[0],dx=p[0]-a[0],dz=p[1]-a[1];return {s:dx*U[0]+dz*U[1],o:dx*V[0]+dz*V[1]};}
export const ST_LEONARDS_LENGTH=L;

/** The arches: each opening between an abutment or a pier and the next, with its springing and crown heights. */
export function stLeonardsSpans():{s0:number;s1:number;spring:number;crown:number}[]{
 const {abutments,piers,pierWidth,road,crown,spring}=ST_LEONARDS,edges=[abutments[0],...piers.flatMap(p=>[p-pierWidth/2,p+pierWidth/2]),abutments[1]];
 const out:{s0:number;s1:number;spring:number;crown:number}[]=[];
 for(let i=0;i<edges.length;i+=2){const s0=edges[i],s1=edges[i+1],top=road-crown;out.push({s0,s1,crown:top,spring});}
 return out;
}
/** The arch's soffit height over the point `s` m along the way (an elliptical arch); -Infinity over a pier or an abutment. */
export function stLeonardsSoffit(s:number):number{
 for(const a of stLeonardsSpans())if(s>=a.s0&&s<=a.s1){const h=(a.s1-a.s0)/2,x=(s-(a.s0+a.s1)/2)/h;return a.spring+(a.crown-a.spring)*Math.sqrt(Math.max(0,1-x*x));}
 return -Infinity;
}

const v3=(p:Pt,y:number):V3=>[p[0],y,p[1]];
/** A strip of the road's top between side offsets o0..o1, from plan points a to b (each with its side vector) at heights ya, yb. */
function strip(b:Batch,a:Pt,na:Pt,ya:number,c:Pt,nc:Pt,yc:number,o0:number,o1:number,color:Rgb):void{
 const at=(p:Pt,n:Pt,o:number):Pt=>[p[0]+n[0]*o,p[1]+n[1]*o];
 b.poly([v3(at(a,na,o0),ya),v3(at(c,nc,o0),yc),v3(at(c,nc,o1),yc),v3(at(a,na,o1),ya)],undefined,{facing:[0,1,0],color});
}
/** The road's cross-section at one station: carriageway, kerbs and footways. */
function roadSection(b:Batch,a:Pt,na:Pt,ya:number,c:Pt,nc:Pt,yc:number):void{
 const {half,footway,kerb}=ST_LEONARDS,C=ST_LEONARDS_COLOURS,inner=half-footway;
 strip(b,a,na,ya,c,nc,yc,-inner,inner,rgb(C.asphalt));
 for(const sg of [-1,1]){
  strip(b,a,na,ya+kerb,c,nc,yc+kerb,sg*inner,sg*half,rgb(C.footway));
  const at=(p:Pt,n:Pt):Pt=>[p[0]+n[0]*sg*inner,p[1]+n[1]*sg*inner];
  b.poly([v3(at(a,na),ya),v3(at(c,nc),yc),v3(at(c,nc),yc+kerb),v3(at(a,na),ya+kerb)],undefined,{facing:[-sg*na[0],0,-sg*na[1]],color:rgb(C.kerb)});
 }
}

/** What the bridge drew, for tests. */
export interface StLeonardsInfo {spans:number;piers:number;approachSegments:number;triangles:number}

/** St Leonard's Bridge into `b` (a vertex-coloured, untextured batch): arches, piers, spandrels, the steel fascia-parapets, the deck's road and
 *  footways, the abutments, and the approach embankments down to the drawn ground. */
export function stLeonardsBridge(b:Batch,ground:Pick<Terrain,'heightAt'>):StLeonardsInfo{
 const before=b.triangles,K=ST_LEONARDS,C=ST_LEONARDS_COLOURS,stone=rgb(C.stone),soffit=rgb(C.soffit),steel=rgb(C.steel);
 const fasciaFoot=K.road-K.fascia,[e0,e1]=K.abutments;
 // the arches: each soffit a barrel across the deck's width, each face a spandrel from the arch up to the fascia's foot
 const spans=stLeonardsSpans();
 for(const a of spans){
  const n=Math.max(6,Math.ceil((a.s1-a.s0)/1.2)),ss=Array.from({length:n+1},(_,i)=>a.s0+(a.s1-a.s0)*i/n);
  const ys=ss.map(s=>stLeonardsSoffit(s)),m=(a.s0+a.s1)/2;
  for(let i=0;i<n;i++){
   const p0=stLeonardsAt(ss[i],-K.half),p1=stLeonardsAt(ss[i+1],-K.half),q0=stLeonardsAt(ss[i],K.half),q1=stLeonardsAt(ss[i+1],K.half);
   const mid=stLeonardsAt((ss[i]+ss[i+1])/2),cen=stLeonardsAt(m),down:V3=[cen[0]-mid[0],-Math.max(.5,(ys[i]+ys[i+1])/2-a.spring+.5),cen[1]-mid[1]];
   b.poly([v3(p0,ys[i]),v3(p1,ys[i+1]),v3(q1,ys[i+1]),v3(q0,ys[i])],undefined,{facing:down,color:soffit});
   for(const sg of [-1,1]){const r0=stLeonardsAt(ss[i],sg*K.half),r1=stLeonardsAt(ss[i+1],sg*K.half);
    b.poly([v3(r0,ys[i]),v3(r1,ys[i+1]),v3(r1,fasciaFoot),v3(r0,fasciaFoot)],undefined,{facing:[sg*V[0],0,sg*V[1]],color:stone});}
  }
 }
 const low=(s:number)=>Math.min(...[-K.half,0,K.half].map(o=>{const p=stLeonardsAt(s,o);return ground.heightAt(p[0],p[1]);}))-K.wallDepth;
 // the piers: from under the ground to the springing (the spandrels above them run on to the fascia), full width
 for(let i=0;i<K.piers.length;i++){const c=K.piers[i],l=spans[i],r=spans[i+1],top=Math.max(l.spring,r.spring);
  wallBox(b,stLeonardsAt(c,-K.half),stLeonardsAt(c,K.half),Math.min(low(c-K.pierWidth/2),low(c+K.pierWidth/2)),top+.01,K.pierWidth/2,stone);
  for(const sg of [-1,1]){const r0=stLeonardsAt(c-K.pierWidth/2,sg*K.half),r1=stLeonardsAt(c+K.pierWidth/2,sg*K.half);
   b.poly([v3(r0,top),v3(r1,top),v3(r1,fasciaFoot),v3(r0,fasciaFoot)],undefined,{facing:[sg*V[0],0,sg*V[1]],color:stone});}
 }
 // the abutments' faces toward the arches, ground to the fascia's foot
 wallBox(b,stLeonardsAt(e0-.6,-K.half),stLeonardsAt(e0-.6,K.half),low(e0),fasciaFoot,.6,stone);
 wallBox(b,stLeonardsAt(e1+.6,-K.half),stLeonardsAt(e1+.6,K.half),low(e1),fasciaFoot,.6,stone);
 // the steel fascia-parapets over the arches, either side
 for(const sg of [-1,1])wallBox(b,stLeonardsAt(e0-1.2,sg*(K.half-.2)),stLeonardsAt(e1+1.2,sg*(K.half-.2)),fasciaFoot,K.road+K.parapet,.2,steel);
 // the deck's road over the arches
 roadSection(b,stLeonardsAt(e0-1.2),V,K.road,stLeonardsAt(e1+1.2),V,K.road);
 // the approaches: from each abutment outward, falling at `grade` until the road meets the drawn ground; stone retaining walls and
 // parapets either side. The east one runs back along the way to its end, then up St Leonard's Bank; the west one likewise.
 let approachSegments=0;
 const paths:Pt[][]=[[stLeonardsAt(e0-1.2),...ST_LEONARDS_APPROACHES[0]],[stLeonardsAt(e1+1.2),...ST_LEONARDS_APPROACHES[1]]];
 for(const path of paths){
  // stations every `step` m along the path
  const pts:Pt[]=[path[0]];
  for(let i=0;i+1<path.length;i++){const a=path[i],c=path[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.max(1,Math.ceil(l/K.step));for(let k=1;k<=n;k++)pts.push([a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n]);}
  const side=(i:number):Pt=>{const a=pts[Math.max(0,i-1)],c=pts[Math.min(pts.length-1,i+1)],dx=c[0]-a[0],dz=c[1]-a[1],l=Math.hypot(dx,dz)||1;return [-dz/l,dx/l];};
  let d=0;
  for(let i=0;i+1<pts.length;i++){
   const a=pts[i],c=pts[i+1],na=side(i),nc=side(i+1),dl=Math.hypot(c[0]-a[0],c[1]-a[1]);
   const ga=ground.heightAt(a[0],a[1]),gc=ground.heightAt(c[0],c[1]);
   const ya=Math.max(ga+.05,K.road-K.grade*d),yc=Math.max(gc+.05,K.road-K.grade*(d+dl));d+=dl;
   if(ya<=ga+.05)break;
   roadSection(b,a,na,ya,c,nc,yc);
   for(const sg of [-1,1]){
    const pa:Pt=[a[0]+na[0]*sg*K.half,a[1]+na[1]*sg*K.half],pc:Pt=[c[0]+nc[0]*sg*K.half,c[1]+nc[1]*sg*K.half];
    const fa=ground.heightAt(pa[0],pa[1])-K.wallDepth,fc=ground.heightAt(pc[0],pc[1])-K.wallDepth;
    // the retaining wall's outer face, and the parapet over it (as high as the fascia's over the deck, while the fill stands a metre up)
    b.poly([v3(pa,fa),v3(pc,fc),v3(pc,yc+K.kerb),v3(pa,ya+K.kerb)],undefined,{facing:[sg*(na[0]+nc[0]),0,sg*(na[1]+nc[1])],color:stone});
    if(Math.min(ya-ga,yc-gc)>1)wallBox(b,[a[0]+na[0]*sg*(K.half-.2),a[1]+na[1]*sg*(K.half-.2)],[c[0]+nc[0]*sg*(K.half-.2),c[1]+nc[1]*sg*(K.half-.2)],ya+K.kerb-.1,Math.max(ya,yc)+K.parapet,.2,stone,.1);
   }
   approachSegments++;
  }
 }
 return {spans:spans.length,piers:K.piers.length,approachSegments,triangles:b.triangles-before};
}
