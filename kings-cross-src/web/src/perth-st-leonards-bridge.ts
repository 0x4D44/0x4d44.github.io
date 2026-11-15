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
import {PERTH_TEXTURE_TILE} from './perth-frontage-textures.ts';

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
 *  12.5), `wallDepth` (the retaining walls' foot under the drawn ground). Round 2 (the round-1 score): `pierWidth` 1.5 m (was 2.4; R-slb-a's
 *  piers are about a tenth of their arches' span), each arch drawn in `archSegments` facets (16-24, by span; was 6-17), and the fascia gains
 *  a stone string course at its foot (`string`: height, projection) and a coping on the parapets (`coping`: height, overhang either side).
 *  The fascia's foot rises to 0.5 m under the road (was 0.9, which put it under the crown) so the string course runs just over the crowns. */
export const ST_LEONARDS={road:5.9,abutments:[14,74],half:5.5,crown:.75,fascia:.5,parapet:1.15,footway:2,kerb:.12,
 piers:[22.3,35.46,43.76,55.74],pierWidth:1.5,spring:2,grade:.08,wallDepth:.5,step:3,
 archSegments:[16,24],string:{height:.25,projection:.12},coping:{height:.18,overhang:.15},
 voussoir:{depth:.45,proud:.04},impost:{height:.22,proud:.08},girder:{flange:.12,flangeProud:.05,pitch:1.8,stiffener:.1,stiffenerProud:.04},
 northShade:.75,
 soffitStone:.9,joint:.05,soffitBend:1.5,
 soffitFill:{base:2.6,crown:1.3},soffitLamp:{strength:.018,reach:4,floor:1},soffitJoint:{width:.1,tone:.5,inset:.015},weather:{jitter:.085,cell:3,cellHeight:2.5,stain:.35,stainFull:.5,stainHeight:1.6}} as const;
/* Round 3 (the round-2 score, LAND F5 7.0 F6 6.0): the stone reads as one flat tone, the arches' insides band, the parapet is a slab whose
 * coping never shows, the shaded face is too bright. So, from R-slb-a (ASSUMED sizes, by eye):
 * - the spandrels, piers, abutments and approach walls are coursed ashlar: the station walls' coursed-stone texture (perth-frontage-
 *   textures.ts coursedTexture, 0.3 m courses, shared: no new texture or draw), drawn in that batch with world-metre UVs;
 * - a voussoir ring round each arch face, `voussoir.depth` deep and `proud` of the spandrel, its stones in two tones of the dressed stone;
 * - impost bands at the springing round each pier and on the abutments' faces (`impost`);
 * - the arch soffits smooth-shaded (a normal per corner from the ellipse), so the facets no longer band;
 * - the parapet a plate girder: top and bottom flanges (`girder.flange` deep, `flangeProud`) and stiffeners every `pitch` m
 *   (`stiffener` wide, `stiffenerProud`), the stiffeners and flanges a darker green-grey (`steelDark`), framing its panels;
 * - the coping overhangs the girder's face by `coping.overhang` (was 0.08 m), so it shows from below;
 * - every face looking north (toward the station, R-slb-a's backlit face) is shaded by `northShade`. */
/** Round 2 (the round-1 score: the stone too dark). R-slb-a is backlit, its spandrels in shade (sampled 41,44,30); the same sandstone in
 *  sun, the wall beside the left arch, samples (158,144,100), and the lit coping along the fascia's top (178,166,142). So `stone` is that
 *  buff sandstone, a touch greyed for weathering (150,138,112); `soffit` the same in the arches' shade; `dressed` the string course and the
 *  coping, R-slb-a's coping sample. The steel fascia's pale grey-green paint (R-slb-a, by eye); the road's asphalt and the footways'
 *  paving as the frontage's (perth-frontage-bridge.ts). ASSUMED beyond the samples. */
/* Round 4 (the round-3 score, LAND F5 8.0 F6 7.0): the soffits read near black, the voussoirs as one pale band, the coping's overhang
 * does not read and the approach parapets notch at their bends. So (ASSUMED tones, by eye from R-slb-a, whose soffits are a mid grey
 * stone in shade): `soffit` a mid grey, laid in stones `soffitStone` m long across the barrel in stretcher bond, each a tone of
 * SOFFIT_TONES; the voussoirs alternate `dressed` and a darker `voussoir`, with a dark `joint` (`ST_LEONARDS.joint` m wide) between
 * stones; the copings' overhangs get a dark underside (`shadow`); the approach parapets and copings are one mitred ribbon. */
/* Round 4b (the lead's look at round 4): at dusk the soffits glowed pink, brighter than the face, and by day were lighter than R-slb-a's,
 * whose soffits are a brown-grey darker than the face. The pink was the lighting, not the colour: a smooth soffit's normals near the
 * springing are near horizontal, so a Lambert soffit took half the hemisphere's lavender sky and the whole of a low red sun from the side
 * (from the west at dusk), light the barrel never sees (the spandrels, the piers and the deck hide it: nothing in this scene casts a
 * shadow). So the soffit's normals are bent down toward the arch's open underside, `soffitBend` times the ellipse's unit normal (still one
 * per station, so still smooth): the sky's share falls to 1% and a horizon sun to a fifth of a square-on wall's, and the barrel takes the
 * hemisphere's ground light, as a real one takes the light off the ground under it. The global rig is untouched. `soffit` is darkened to
 * two thirds of `stone` (a warm brown-grey), and the darker voussoir lifted to 0.88 of `dressed` (in luma): the ring read too strong.
 * Round 4c (the lead's look at 4b): bent by 5 the soffits drew as black voids by day, with no gradient. `soffitBend` 1 puts the normal at
 * the springing 45 degrees below the horizontal (the sky's share there 15%, a horizon sun 0.72 of square on), rising to straight down at
 * the crown, so the soffit grades from springing to crown. Under the filmic tone map's toe two thirds of `stone` still drew at 0.23 of
 * the shaded face's brightness by noon whatever the bend (0.27 unbent), so `soffit` is 0.85 of `stone`: 0.41 of the face by noon (the
 * lead's target, 0.4 to 0.5), and at dusk still under it. */
/* Round 5 (the r4c score, LAND F5 8.3 F6 7.2, judged by eye): the soffits' top third still near black, where R-slb-a's whole underside
 * reads as stone; the soffit's bond does not read at the frozen cameras' range; the masonry looks evenly tiled. So (ASSUMED amounts):
 * - `soffitFill`: the light thrown up off the ground and the far haunch, which the hemisphere's ground term under-gives a barrel's
 *   crown: each soffit stone's colour is lifted by `soffitFill` times the square of its height up the arch (0 at the springing, 1 at the
 *   crown), so the crown draws at 0.47 of the shaded face's brightness by noon (the tone-mapped model in the tests; it was 0.40) and
 *   the springing still at 1.1 times the crown;
 * - the soffit's stones in a wider spread of tones (SOFFIT_TONES, 0.8-1.16), with dark joints between them (`soffitJoint`: `width` m,
 *   `tone` of the stone's colour, `inset` m into the opening along the arch's normal), bed joints across the barrel at every facet and
 *   cross joints between the stones of each course;
 * - weathering on the coursed ashlar (the faces, piers, abutments and approach walls; the shared coursed texture is untouched): each
 *   corner's colour jittered by up to `jitter` from a hash of its position on a `cell` m lattice (corners shared between faces agree),
 *   and the piers' and abutments' feet stained darker, by `stain` at the ground fading out `stainHeight` m up. */
/* Round 6 (the round-5 pixels: crown 10-13 of 255 by day against a face of 55-90, 1-3 at dusk; the face's drift 0.99-1.02; the stain
 * 11-15%; the soffit's joints about 1 px). The tests' lighting model had read the rig's sRGB colours as linear (atmosphere.ts sets the
 * lights with SRGBColorSpace): its hemisphere's ground light, all a crown gets, was three times the renderer's. Corrected (and the coursed
 * texture's mean put on the faces) it meets the calibration capture of 2d545dc9 within 15% everywhere sampled. By that model:
 * - `soffitFill`: every soffit stone's colour times `base` plus `crown` times the square of its height up the arch (vertex colours may
 *   pass 1: the light the barrel takes off the sunlit ground and the far haunch, which the hemisphere's ground term does not give it);
 *   and `soffitBend` 1.5 (was 1: a low sun takes at most 0.57 of square on, for the dusk cap). Noon: springing 49, crown 46 of 255; dusk
 *   32 and 16, every stone under the north face's 42;
 * - the face's drift is a tone per patch, `cell` m in plan by `cellHeight` m up, so a corner carries its whole +-`jitter`;
 * - the stained faces are cut at the ground, `stainFull` m up and `stainHeight` m up, so the stain is whole to `stainFull` and fades out by
 *   `stainHeight` (one quad from under the ground to the springing had spread it thin);
 * - the soffit's joints are `soffitJoint.width` 0.1 m: 2.4 px at pt-st-leonards-bridge's 82 m (they were 1.4 px). */
/* Round 7 (the round-6 pixels, LAND F5 8.5 F6 8.0: by day the springing about as bright as the crown, both near the face; at dusk the
 * crown 11 of 255; the face's drift not visible at the frozen cameras). By the tests' calibrated model, at pt-platform-4-south-end:
 * - `soffitFill` base 2.6 and crown 1.3 (were 3 and 1.75): by noon the springing about 0.7 of the north face and the crown under 0.8;
 * - `soffitLamp`: the soffits are their own mesh, lit after dark by the platforms' and the street's lamps under them (lighting.ts FLOOD:
 *   their colour in a warm light, times the lamps' level and `strength`; `floor` 1 keeps it even up the barrel, as a fall with height
 *   would push the sunlit springing over the face), so the crown keeps about 20 of 255 at dusk and gains nothing by day; one more draw;
 * - the face's drift in patches with edges: each coursed face cut at every patch's edge, each piece one tone, of -1, -0.55, 0.55 or 1
 *   times `jitter` 0.085 (round 6's corners took any tone in [-1, 1] at 0.07 and blended across the 5 m spandrels): the patches' means
 *   spread about 6% (sd) at the frozen cameras;
 * - `stain` 0.35 (was 0.28), so a pier's foot stays under 0.8 of its springing when the foot's patch is light and the springing's dark. */
export const SOFFIT_TONES=[1,.84,1.04,1.16,.8,.98,1.1,.9] as const;
export const ST_LEONARDS_COLOURS={stone:0x968a70,soffit:0x80755f,joint:0x4f483d,shadow:0x3e3a33,dressed:0xb2a68e,voussoir:0x9d927d,steel:0x9aaba2,steelDark:0x76877e,asphalt:0x45474a,footway:0x8c8780,kerb:0xb3ada3} as const;
/** The facets each arch is drawn in: about one per 0.7 m of span, within ST_LEONARDS.archSegments. */
export const stLeonardsArchSegments=(span:number):number=>Math.min(ST_LEONARDS.archSegments[1],Math.max(ST_LEONARDS.archSegments[0],Math.round(span/.7)));

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
export interface StLeonardsInfo {spans:number;piers:number;approachSegments:number;archSegments:number[];copings:number;voussoirs:number;joints:number;soffitJoints:number;imposts:number;stiffeners:number;triangles:number}

/** The plan direction the north face looks (the side of the way whose outward normal points north, -z). */
export const ST_LEONARDS_NORTH:1|-1=V[1]<0?1:-1;
const shadeFor=(c:Rgb,n:V3):Rgb=>{const north=-n[2]/(Math.hypot(n[0],n[1],n[2])||1);return north>.5?[c[0]*ST_LEONARDS.northShade,c[1]*ST_LEONARDS.northShade,c[2]*ST_LEONARDS.northShade]:c;};
/** A face into `b`, shaded if it looks north; world-metre UVs over the coursed tile (`u` along, y up) when `b` is textured. A textured
 *  (coursed) face is weathered: cut into pieces at every `weather.cell` m along and `weather.cellHeight` m up (round 7), each piece one
 *  patch's tone (`patch` at its middle), so the drift reads as patches with edges rather than a gradient between distant corners. */
function face(b:Batch,pts:V3[],us:number[],n:V3,c:Rgb,foot?:number):void{
 if(!b.textured){b.poly(pts,undefined,{facing:n,color:shadeFor(c,n)});return;}
 const T=PERTH_TEXTURE_TILE.coursed,W=ST_LEONARDS.weather;
 for(const piece of cells(cells([pts.map((p,i)=>({p,u:us[i]}))],v=>v.u,W.cell),v=>v.p[1],W.cellHeight)){
  const m=piece.reduce((a,v)=>[a[0]+v.p[0]/piece.length,a[1]+v.p[1]/piece.length,a[2]+v.p[2]/piece.length],[0,0,0]),d=patch(m as V3);
  b.poly(piece.map(v=>v.p),piece.map(v=>[v.u/T,v.p[1]/T]),{facing:n,color:shadeFor(c,n),colors:piece.map(v=>shadeFor(weathered(c,v.p,d,foot),n))});
 }
}
/** A face's corner: its position and its distance along (the coursed tile's u, metres). */
interface Cv{p:V3;u:number}
/** Convex polygons cut at every multiple of `step` of `key` (the cut corners interpolated), dropping slivers under a centimetre. */
function cells(polys:Cv[][],key:(v:Cv)=>number,step:number):Cv[][]{
 const half=(poly:Cv[],at:number,below:boolean):Cv[]=>{const out:Cv[]=[],ins=(v:Cv)=>below?key(v)<=at:key(v)>=at;
  for(let i=0;i<poly.length;i++){const a=poly[i],c=poly[(i+1)%poly.length],ka=key(a),kc=key(c);
   if(ins(a))out.push(a);
   if((ka<at&&kc>at)||(ka>at&&kc<at)){const t=(at-ka)/(kc-ka);out.push({p:[a.p[0]+(c.p[0]-a.p[0])*t,a.p[1]+(c.p[1]-a.p[1])*t,a.p[2]+(c.p[2]-a.p[2])*t],u:a.u+(c.u-a.u)*t});}}
  return out;};
 const out:Cv[][]=[];
 for(const poly of polys){
  const ks=poly.map(key),lo=Math.min(...ks),hi=Math.max(...ks);let rest=poly;
  for(let k=Math.floor(lo/step)+1;k*step<hi;k++){const at=k*step;if(at-lo<.01||hi-at<.01)continue;const under=half(rest,at,true);if(under.length>=3)out.push(under);rest=half(rest,at,false);}
  if(rest.length>=3)out.push(rest);
 }
 return out;
}
/** The weathering patch a point lies in (round 6: `cell` m in plan by `cellHeight` m up), as a tone: one value for the whole patch, the same
 *  for every face meeting there. Round 7: one of -1, -0.55, 0.55 and 1 (round 6 took any value in [-1, 1], and half its patches drew
 *  within a third of the stone's own tone, too near to read), so every patch stands off the mean by at least 0.55 of `jitter`. */
const DRIFT=[-1,-.55,.55,1] as const;
function patch(p:V3):number{
 const W=ST_LEONARDS.weather,h=Math.sin(Math.floor(p[0]/W.cell)*127.1+Math.floor(p[1]/W.cellHeight)*311.7+Math.floor(p[2]/W.cell)*74.7)*43758.5453;
 return DRIFT[Math.min(3,Math.floor(4*(h-Math.floor(h))))];
}
/** Coursed stone's colour at a corner: its patch's tone `drift` (times `jitter`), and stained near `foot` (the ground's height) when given. */
function weathered(c:Rgb,p:V3,drift:number,foot?:number):Rgb{
 const W=ST_LEONARDS.weather,stain=foot===undefined?0:W.stain*Math.min(1,Math.max(0,(foot+W.stainHeight-p[1])/(W.stainHeight-W.stainFull))),f=(1+W.jitter*drift)*(1-stain);
 return [c[0]*f,c[1]*f,c[2]*f];
}
/** A box whose long axis runs from plan a to p (y0..y1), `half` its half thickness across; each face shaded as `face`; no underside. */
function block(b:Batch,a:Pt,p:Pt,y0:number,y1:number,half:number,c:Rgb,foot?:number):void{
 const dx=p[0]-a[0],dz=p[1]-a[1],l=Math.hypot(dx,dz);if(l<1e-6||y1<=y0)return;
 const ax:Pt=[dx/l,dz/l],nx:Pt=[-ax[1],ax[0]],at=(i:number,j:number):Pt=>[a[0]+ax[0]*l*i+nx[0]*half*j,a[1]+ax[1]*l*i+nx[1]*half*j];
 // (round 6) a stained foot: the sides cut at the ground and at the stain's top, so the stain runs exactly from full to none between
 const cuts=[y0,...(foot===undefined?[]:[foot,foot+ST_LEONARDS.weather.stainFull,foot+ST_LEONARDS.weather.stainHeight].filter(y=>y>y0+.01&&y<y1-.01)),y1];
 for(let k=0;k+1<cuts.length;k++){const ya=cuts[k],yb=cuts[k+1];
  for(const j of [-1,1]){const q0=at(0,j),q1=at(1,j);face(b,[v3(q0,ya),v3(q1,ya),v3(q1,yb),v3(q0,yb)],[0,l,l,0],[nx[0]*j,0,nx[1]*j],c,foot);}
  for(const i of [0,1]){const q0=at(i,-1),q1=at(i,1),d=i?1:-1;face(b,[v3(q0,ya),v3(q1,ya),v3(q1,yb),v3(q0,yb)],[0,2*half,2*half,0],[ax[0]*d,0,ax[1]*d],c,foot);}
 }
 face(b,[v3(at(0,-1),y1),v3(at(1,-1),y1),v3(at(1,1),y1),v3(at(0,1),y1)],[0,l,l,0],[0,1,0],c);
}

/** St Leonard's Bridge into `b` (a vertex-coloured, untextured batch): arches, voussoirs, imposts, the plate-girder parapets, their copings,
 *  the string courses, the deck's road and footways; the coursed ashlar (spandrels, piers, abutments, the approaches' retaining walls and
 *  parapets) into `ashlar` (vertex-coloured, textured: the frontage's coursed-stone batch), or into `b` when none is given; the arches'
 *  soffits, stones and joints, into `soffitB` (round 7: their own mesh, lamp-lit after dark: ST_LEONARDS.soffitLamp), or into `b`. */
export function stLeonardsBridge(b:Batch,ground:Pick<Terrain,'heightAt'>,ashlar:Batch=b,soffitB:Batch=b):StLeonardsInfo{
 const own=()=>b.triangles+(ashlar===b?0:ashlar.triangles)+(soffitB===b||soffitB===ashlar?0:soffitB.triangles),before=own(),K=ST_LEONARDS,C=ST_LEONARDS_COLOURS;
 const stone=rgb(C.stone),soffit=rgb(C.soffit),joint=rgb(C.joint),shadow=rgb(C.shadow),steel=rgb(C.steel),steelDark=rgb(C.steelDark),dressed=rgb(C.dressed),vous=[rgb(C.dressed),rgb(C.voussoir)];
 const fasciaFoot=K.road-K.fascia,[e0,e1]=K.abutments,{string:sc,coping:cp,voussoir:vs,impost:im,girder:gd}=K,stringFoot=fasciaFoot-sc.height;
 const out=(sg:number):V3=>[sg*V[0],0,sg*V[1]];
 // the arches: each soffit a barrel across the deck's width, smooth-shaded; each face a coursed spandrel from the arch to the fascia's
 // foot, and a ring of voussoirs proud of it, clipped under the string course
 const spans=stLeonardsSpans(),archSegments:number[]=[];let voussoirs=0,joints=0,soffitJoints=0;
 for(const a of spans){
  const n=stLeonardsArchSegments(a.s1-a.s0);archSegments.push(n);
  const ss=Array.from({length:n+1},(_,i)=>a.s0+(a.s1-a.s0)*i/n);
  const ys=ss.map(s=>stLeonardsSoffit(s)),m=(a.s0+a.s1)/2,h=(a.s1-a.s0)/2,r=a.crown-a.spring;
  // the ellipse's normal into the opening at each station, in (along, up), and as a world vector
  const nrm=ss.map((s,i)=>{const gx=(s-m)/(h*h),gy=(ys[i]-a.spring)/(r*r),l=Math.hypot(gx,gy)||1;return [-gx/l,-gy/l] as [number,number];});
  // the soffit's normal: the ellipse's, bent down into the arch's open underside (round 4b)
  const bent=(q:[number,number]):V3=>{const y=q[1]-K.soffitBend,l=Math.hypot(q[0],y);return [q[0]/l*U[0],y/l,q[0]/l*U[1]];};
  for(let i=0;i<n;i++){
   const n0=bent(nrm[i]),n1=bent(nrm[i+1]);
   // the soffit's stones: across the barrel in stretcher bond, each its own tone; the corners keep the ellipse's normals
   // (round 5) lifted by the fill with height up the arch, and jointed: the cross joint at each stone's start, the bed joint at the facet's
   const up=Math.min(1,Math.max(0,((ys[i]+ys[i+1])/2-a.spring)/(a.crown-a.spring))),lift=K.soffitFill.base+K.soffitFill.crown*up*up,SJ=K.soffitJoint;
   const into=(k:number,o:number,along:number,dy:number):V3=>{const d=nrm[k];return v3(stLeonardsAt(ss[k]+along+d[0]*SJ.inset,o),ys[k]+dy+d[1]*SJ.inset);};
   for(let o=-K.half-(i%2)*K.soffitStone/2;o<K.half;o+=K.soffitStone){
    const oa=Math.max(-K.half,o),ob=Math.min(K.half,o+K.soffitStone);if(ob-oa<.01)continue;
    const f=SOFFIT_TONES[(i*7+Math.round((o+K.half)/K.soffitStone)*3+spans.indexOf(a)*5)%SOFFIT_TONES.length]*lift,c:Rgb=[soffit[0]*f,soffit[1]*f,soffit[2]*f];
    soffitB.poly([v3(stLeonardsAt(ss[i],oa),ys[i]),v3(stLeonardsAt(ss[i+1],oa),ys[i+1]),v3(stLeonardsAt(ss[i+1],ob),ys[i+1]),v3(stLeonardsAt(ss[i],ob),ys[i])],undefined,{normals:[n0,n1,n1,n0],color:c});
    if(oa>-K.half){const jc:Rgb=[c[0]*SJ.tone,c[1]*SJ.tone,c[2]*SJ.tone],w=SJ.width/2;
     soffitB.poly([into(i,oa-w,0,0),into(i+1,oa-w,0,0),into(i+1,oa+w,0,0),into(i,oa+w,0,0)],undefined,{normals:[n0,n1,n1,n0],color:jc});soffitJoints++;}
   }
   if(i>0){const t:[number,number]=[-nrm[i][1],nrm[i][0]],w=SJ.width/2,c=soffit.map(x=>x*lift*SJ.tone) as Rgb;
    soffitB.poly([into(i,-K.half,-t[0]*w,-t[1]*w),into(i,-K.half,t[0]*w,t[1]*w),into(i,K.half,t[0]*w,t[1]*w),into(i,K.half,-t[0]*w,-t[1]*w)],undefined,{normals:[n0,n0,n0,n0],color:c});soffitJoints++;}
   for(const sg of [-1,1]){
    const r0=stLeonardsAt(ss[i],sg*K.half),r1=stLeonardsAt(ss[i+1],sg*K.half);
    face(ashlar,[v3(r0,ys[i]),v3(r1,ys[i+1]),v3(r1,fasciaFoot),v3(r0,fasciaFoot)],[ss[i],ss[i+1],ss[i+1],ss[i]],out(sg),stone);
    // the voussoir: from the intrados out along the ellipse's normal, its outer edge kept under the string course
    const o=sg*(K.half+vs.proud),ring=(k:number):[V3,V3]=>{const s=ss[k],y=ys[k],d=nrm[k],so=s-d[0]*vs.depth,yo=Math.min(stringFoot,y-d[1]*vs.depth);return [v3(stLeonardsAt(s,o),y),v3(stLeonardsAt(so,o),Math.max(y,yo))];};
    const [i0,o0]=ring(i),[i1,o1]=ring(i+1);
    if(o0[1]-i0[1]>.02||o1[1]-i1[1]>.02){face(b,[i0,i1,o1,o0],[0,0,0,0],out(sg),vous[i%2]);voussoirs++;
     // the joint at this voussoir's leading edge: a dark strip from the intrados out, a hair proud of the stones
     if(i>0&&o0[1]-i0[1]>.02){const d=nrm[i],t:[number,number]=[-d[1],d[0]],w=K.joint/2,oj=o+sg*.005,at=(sa:number,ya:number):V3=>v3(stLeonardsAt(sa,oj),ya);
      const si=ss[i],yi=ys[i],so=si-d[0]*vs.depth,yo=Math.max(yi,Math.min(stringFoot,yi-d[1]*vs.depth));
      face(b,[at(si-t[0]*w,yi-t[1]*w),at(si+t[0]*w,yi+t[1]*w),at(so+t[0]*w,yo+t[1]*w),at(so-t[0]*w,yo-t[1]*w)],[0,0,0,0],out(sg),joint);joints++;}}
   }
  }
 }
 const low=(s:number)=>Math.min(...[-K.half,0,K.half].map(o=>{const p=stLeonardsAt(s,o);return ground.heightAt(p[0],p[1]);}))-K.wallDepth;
 // the piers: coursed, from under the ground to the springing (the spandrels above them run on to the fascia), full width; an impost
 // band round each at the springing
 let imposts=0;
 for(let i=0;i<K.piers.length;i++){const c=K.piers[i],l=spans[i],r=spans[i+1],top=Math.max(l.spring,r.spring),w=K.pierWidth/2;
  block(ashlar,stLeonardsAt(c,-K.half),stLeonardsAt(c,K.half),Math.min(low(c-w),low(c+w)),top+.01,w,stone,Math.min(low(c-w),low(c+w))+K.wallDepth);
  for(const sg of [-1,1]){const r0=stLeonardsAt(c-w,sg*K.half),r1=stLeonardsAt(c+w,sg*K.half);
   face(ashlar,[v3(r0,top),v3(r1,top),v3(r1,fasciaFoot),v3(r0,fasciaFoot)],[c-w,c+w,c+w,c-w],out(sg),stone);}
  block(b,stLeonardsAt(c,-K.half-im.proud),stLeonardsAt(c,K.half+im.proud),top-im.height,top,w+im.proud,dressed);imposts++;
 }
 // the abutments' faces toward the arches, ground to the fascia's foot, with their impost bands
 block(ashlar,stLeonardsAt(e0-.6,-K.half),stLeonardsAt(e0-.6,K.half),low(e0),fasciaFoot,.6,stone,low(e0)+K.wallDepth);
 block(ashlar,stLeonardsAt(e1+.6,-K.half),stLeonardsAt(e1+.6,K.half),low(e1),fasciaFoot,.6,stone,low(e1)+K.wallDepth);
 block(b,stLeonardsAt(e0-.6,-K.half-im.proud),stLeonardsAt(e0-.6,K.half+im.proud),K.spring-im.height,K.spring,.6+im.proud,dressed);
 block(b,stLeonardsAt(e1+.6,-K.half-im.proud),stLeonardsAt(e1+.6,K.half+im.proud),K.spring-im.height,K.spring,.6+im.proud,dressed);imposts+=2;
 // the plate-girder parapets: the web, its flanges and stiffeners on the outer face; the coping over it; the string course under it
 const g0=e0-1.2,g1=e1+1.2,topY=K.road+K.parapet;let copings=0,stiffeners=0;
 for(const sg of [-1,1]){
  block(b,stLeonardsAt(g0,sg*(K.half-.2)),stLeonardsAt(g1,sg*(K.half-.2)),fasciaFoot,topY,.2,steel);
  const fo=sg*(K.half+gd.flangeProud/2-.01);
  block(b,stLeonardsAt(g0,fo),stLeonardsAt(g1,fo),fasciaFoot,fasciaFoot+gd.flange,gd.flangeProud/2+.01,steelDark);
  block(b,stLeonardsAt(g0,fo),stLeonardsAt(g1,fo),topY-gd.flange,topY,gd.flangeProud/2+.01,steelDark);
  const so=sg*(K.half+gd.stiffenerProud/2-.01),count=Math.floor((g1-g0)/gd.pitch);
  for(let k=1;k<count;k++){const s=g0+(g1-g0)*k/count;block(b,stLeonardsAt(s,so-sg*gd.stiffener/2),stLeonardsAt(s,so+sg*gd.stiffener/2),fasciaFoot+gd.flange,topY-gd.flange,gd.stiffener/2,steelDark);stiffeners++;}
  const o=sg*(K.half+sc.projection/2-.05);
  block(b,stLeonardsAt(g0,o),stLeonardsAt(g1,o),stringFoot,fasciaFoot,(sc.projection+.1)/2,dressed);
  // the coping: from 0.2 m inside the web to `overhang` past its outer face
  const ci=K.half-.4,co=K.half+cp.overhang,cm=sg*(ci+co)/2;
  block(b,stLeonardsAt(g0-cp.overhang,cm),stLeonardsAt(g1+cp.overhang,cm),topY,topY+cp.height,(co-ci)/2,dressed);copings++;
  // its overhang's underside, in shadow: the line that makes the overhang read from below
  face(b,[v3(stLeonardsAt(g0-cp.overhang,sg*K.half),topY),v3(stLeonardsAt(g1+cp.overhang,sg*K.half),topY),v3(stLeonardsAt(g1+cp.overhang,sg*co),topY),v3(stLeonardsAt(g0-cp.overhang,sg*co),topY)],[0,0,0,0],[0,-1,0],shadow);
 }
 // the deck's road over the arches
 roadSection(b,stLeonardsAt(g0),V,K.road,stLeonardsAt(g1),V,K.road);
 // the approaches: from each abutment outward, falling at `grade` until the road meets the drawn ground; coursed retaining walls and
 // parapets either side, the parapets coped. The east one runs back along the way to its end, then up St Leonard's Bank; the west likewise.
 let approachSegments=0;
 const paths:Pt[][]=[[stLeonardsAt(g0),...ST_LEONARDS_APPROACHES[0]],[stLeonardsAt(g1),...ST_LEONARDS_APPROACHES[1]]];
 for(const path of paths){
  // stations every `step` m along the path
  const pts:Pt[]=[path[0]];
  for(let i=0;i+1<path.length;i++){const a=path[i],c=path[i+1],l=Math.hypot(c[0]-a[0],c[1]-a[1]),n=Math.max(1,Math.ceil(l/K.step));for(let k=1;k<=n;k++)pts.push([a[0]+(c[0]-a[0])*k/n,a[1]+(c[1]-a[1])*k/n]);}
  const side=(i:number):Pt=>{const a=pts[Math.max(0,i-1)],c=pts[Math.min(pts.length-1,i+1)],dx=c[0]-a[0],dz=c[1]-a[1],l=Math.hypot(dx,dz)||1;return [-dz/l,dx/l];};
  // the mitre: a side offset at a bend stretched by 1/cos(half the turn), so the parapet keeps its thickness round the corner
  const mitre=(i:number):number=>{if(i<=0||i>=pts.length-1)return 1;const a=pts[i-1],c=pts[i],dx=c[0]-a[0],dz=c[1]-a[1],l=Math.hypot(dx,dz)||1,n=side(i);return 1/Math.max(.5,(-dz/l)*n[0]+(dx/l)*n[1]);};
  let d=0;
  for(let i=0;i+1<pts.length;i++){
   const a=pts[i],c=pts[i+1],na=side(i),nc=side(i+1),dl=Math.hypot(c[0]-a[0],c[1]-a[1]);
   const ga=ground.heightAt(a[0],a[1]),gc=ground.heightAt(c[0],c[1]);
   const ya=Math.max(ga+.05,K.road-K.grade*d),yc=Math.max(gc+.05,K.road-K.grade*(d+dl));
   if(ya<=ga+.05)break;
   roadSection(b,a,na,ya,c,nc,yc);
   // the parapet stands while the fill is a metre up; it runs on to the next segment if that one's does too
   const wall=Math.min(ya-ga,yc-gc)>1;let wallNext=false;
   if(wall&&i+2<pts.length){const e=pts[i+2],ge=ground.heightAt(e[0],e[1]),ye=K.road-K.grade*(d+dl+Math.hypot(e[0]-c[0],e[1]-c[1]));wallNext=Math.min(yc-gc,ye-ge)>1;}
   for(const sg of [-1,1]){
    const pa:Pt=[a[0]+na[0]*sg*K.half,a[1]+na[1]*sg*K.half],pc:Pt=[c[0]+nc[0]*sg*K.half,c[1]+nc[1]*sg*K.half];
    const fa=ground.heightAt(pa[0],pa[1])-K.wallDepth,fc=ground.heightAt(pc[0],pc[1])-K.wallDepth;
    // the retaining wall's outer face, and the parapet over it (as high as the girder's over the deck, while the fill stands a metre up)
    face(ashlar,[v3(pa,fa),v3(pc,fc),v3(pc,yc+K.kerb),v3(pa,ya+K.kerb)],[d,d+dl,d+dl,d],[sg*(na[0]+nc[0])/2,0,sg*(na[1]+nc[1])/2],stone);
    if(wall){
     // the parapet, one mitred ribbon along the approach (no notch at the bends): its outer and inner faces, then the coping over it
     const ma=mitre(i),mc=mitre(i+1),P=(p:Pt,nn:Pt,m:number,o:number):Pt=>[p[0]+nn[0]*sg*o*m,p[1]+nn[1]*sg*o*m];
     const at=(o:number):[Pt,Pt]=>[P(a,na,ma,o),P(c,nc,mc,o)],ta=ya+K.parapet,tc=yc+K.parapet,ba=ya+K.kerb-.1,bc=yc+K.kerb-.1,nAvg:V3=[sg*(na[0]+nc[0])/2,0,sg*(na[1]+nc[1])/2],nIn:V3=[-nAvg[0],0,-nAvg[2]];
     const [oa,oc]=at(K.half),[ia,ic]=at(K.half-.4);
     face(ashlar,[v3(oa,ba),v3(oc,bc),v3(oc,tc),v3(oa,ta)],[d,d+dl,d+dl,d],nAvg,stone);
     face(ashlar,[v3(ia,ba),v3(ic,bc),v3(ic,tc),v3(ia,ta)],[d,d+dl,d+dl,d],nIn,stone);
     const [ca,cc]=at(K.half+cp.overhang),[ka,kc]=at(K.half-.45);
     face(b,[v3(ka,ta+cp.height),v3(kc,tc+cp.height),v3(cc,tc+cp.height),v3(ca,ta+cp.height)],[0,0,0,0],[0,1,0],dressed);
     face(b,[v3(ca,ta),v3(cc,tc),v3(cc,tc+cp.height),v3(ca,ta+cp.height)],[0,0,0,0],nAvg,dressed);
     face(b,[v3(ka,ta),v3(kc,tc),v3(kc,tc+cp.height),v3(ka,ta+cp.height)],[0,0,0,0],nIn,dressed);
     face(b,[v3(oa,ta),v3(oc,tc),v3(cc,tc),v3(ca,ta)],[0,0,0,0],[0,-1,0],shadow);
     // the run's far end: close the wall and the coping
     const ux=(c[0]-a[0])/dl,uz=(c[1]-a[1])/dl;
     if(!wallNext){face(ashlar,[v3(oc,bc),v3(ic,bc),v3(ic,tc),v3(oc,tc)],[0,.4,.4,0],[ux,0,uz],stone);face(b,[v3(cc,tc),v3(kc,tc),v3(kc,tc+cp.height),v3(cc,tc+cp.height)],[0,0,0,0],[ux,0,uz],dressed);}
     copings++;
    }
   }
   d+=dl;approachSegments++;
  }
 }
 return {spans:spans.length,piers:K.piers.length,approachSegments,archSegments,copings,voussoirs,joints,soffitJoints,imposts,stiffeners,triangles:own()-before};
}
