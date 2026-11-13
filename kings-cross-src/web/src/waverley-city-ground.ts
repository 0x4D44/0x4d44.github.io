// W3 city ground: the land use drawn over the terrain, and the mapped trees. All of it is OSM (ODbL), from
// data/waverley-city-landuse.json (tools/build-waverley-city-landuse.ts): parks, gardens, grass, woods, scrub, water, paved areas,
// streets (ASSUMED widths per highway class), park paths, the 2,405 natural=tree nodes and the natural=cliff lines.
//
// The ground cover is one canvas texture (<= 2048 px, about 1 m a texel over the 2,000 x 1,232 m extent) on one draped mesh: the
// adaptive terrain mesh rebuilt over the drawn ground (`overMesh`), lifted DRAPE_LIFT above it, and pushed forward in depth, so it
// never sinks into the terrain and never z-fights it (the terrain material is pushed back, polygon offset +1). It leaves out the
// railway's flattened bed (ground at WAVERLEY_LEVELS.ground), so the ballast and the station floor draw as they did.
// Steep ground (over ROCK_SLOPE_DEG) is painted as rock: Castle Rock and the Calton Hill crags are dolerite/basalt exposures
// (R-wv3-a shows the bare crag between the trees); the 16 m DTM smooths a cliff into a steep slope, so slope is the honest proxy.
// Trees: the mapped tree nodes, plus woods and scrub (FILL_STEP) filled on a jittered lattice (spacings ASSUMED). Tree sizes are
// ASSUMED (no OSM height on these nodes): 8 to 14 m, crowns about 0.6 of the height across, as the mature limes, elms and
// sycamores of R-wv3-a. No tree stands in a building or on the railway; a crown is narrowed to clear the nearest wall.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {buildTerrainMesh} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import {WAVERLEY_LEVELS} from './waverley-mesh.ts';
import data from './data/waverley-city-landuse.json' with {type:'json'};

/** The drape is a coarser mesh than the terrain (DRAPE_TOLERANCE, m of sag allowed between its vertices), so it is lifted as much: a facet
 *  sagging the full tolerance still lies on the true ground. Measured against the drawn terrain mesh (0.08 m) at 18,900 points, 0.25/0.25
 *  leaves it under or within 2 cm at 10 (0.15/0.15 did at 22), and the polygon offset covers those; it costs 8,500 fewer triangles. */
export const DRAPE_LIFT=.25,DRAPE_TOLERANCE=.25;
/** The cover's canvas is this many texels across the extent's x span (its height follows the extent's aspect), unless a scene sets `canvasWidth`:
 *  about 1 m a texel over Waverley's 2,000 m, but a taller extent (Perth's west extension, 1,600 x 2,832 m) would paint 3,625 rows at this width. */
export const CANVAS_WIDTH=2048;
/** The drape's facets still cut under the drawn ground between their corners where the ground bends (round 4: by 4 cm on Castle Rock's
 *  summit face, which from Princes Street's grazing view left the bare terrain showing as a pale slab). So each facet is sampled every
 *  `sample` m against the drawn surface and, where the surface comes within `clear` m of it, its corners are lifted by the shortfall.
 *  A corner takes the largest lift of its facets; a lift only raises a neighbour, so one pass seats every facet. ASSUMED distances. */
export const DRAPE_SEAT={sample:1,clear:.1} as const;
/** Turn a quad of two drape facets onto its upper diagonal where its fold runs under the ground. The drape and the drawn terrain end in
 *  the same 8 m blocks, each two triangles, but each picks its block's diagonal from a different surface, so on a steep fold they can
 *  fold a block opposite ways and the drape's fold run up to 1.3 m under the terrain's (round 4's pale slab on Castle Rock). Where two
 *  facets share an edge across a quad that is convex in plan, and that edge stands less than DRAPE_SEAT.clear over `ground` where the
 *  quad's diagonals cross, it is swapped for the other diagonal if that one stands higher there. Elsewhere (a hollow, where the drawn
 *  terrain takes the lower fold) the drape keeps its own. `index` is rewritten in place (same triangle count, same winding); returns
 *  the swaps made. */
export function foldUp(pos:Float32Array,index:number[],ground:Pick<Terrain,'heightAt'>):number{
 let swaps=0;
 for(let pass=0;pass<4;pass++){
  const edges=new Map<string,number[]>(),done=new Set<number>();let n=0;
  for(let t=0;t<index.length;t+=3)for(let k=0;k<3;k++){const a=index[t+k],b=index[t+(k+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;let e=edges.get(key);if(!e)edges.set(key,e=[]);e.push(t);}
  const X=(v:number)=>pos[v*3],Y=(v:number)=>pos[v*3+1],Z=(v:number)=>pos[v*3+2];
  const area=(a:number,b:number,c:number)=>(X(b)-X(a))*(Z(c)-Z(a))-(Z(b)-Z(a))*(X(c)-X(a));
  for(const [key,ts]of edges){if(ts.length!==2||done.has(ts[0])||done.has(ts[1]))continue;
   const [a,b]=key.split(',').map(Number),opp=(t:number)=>index.slice(t,t+3).find(v=>v!==a&&v!==b)!,c=opp(ts[0]),d=opp(ts[1]);
   // the diagonals a-b and c-d must cross inside both (a convex quad in plan)
   const den=(X(b)-X(a))*(Z(d)-Z(c))-(Z(b)-Z(a))*(X(d)-X(c));if(Math.abs(den)<1e-9)continue;
   const u=((X(c)-X(a))*(Z(d)-Z(c))-(Z(c)-Z(a))*(X(d)-X(c)))/den,w=((X(c)-X(a))*(Z(b)-Z(a))-(Z(c)-Z(a))*(X(b)-X(a)))/den;
   if(u<=1e-6||u>=1-1e-6||w<=1e-6||w>=1-1e-6)continue;
   const here=Y(a)+(Y(b)-Y(a))*u;if(here>=ground.heightAt(X(a)+(X(b)-X(a))*u,Z(a)+(Z(b)-Z(a))*u)+DRAPE_SEAT.clear||Y(c)+(Y(d)-Y(c))*w<=here+1e-4)continue;
   // swap: the two new facets keep the old ones' winding sense
   const sense=Math.sign(area(index[ts[0]],index[ts[0]+1],index[ts[0]+2])),put=(t:number,p:number,q:number,r:number)=>{if(Math.sign(area(p,q,r))!==sense)[q,r]=[r,q];index[t]=p;index[t+1]=q;index[t+2]=r;};
   put(ts[0],c,d,a);put(ts[1],d,c,b);done.add(ts[0]);done.add(ts[1]);n++;}
  swaps+=n;if(!n)break;
 }
 return swaps;
}
/** Lift drape corners (`pos`, x y z per vertex) so no facet of `index` comes within DRAPE_SEAT.clear of `ground`, sampled every
 *  DRAPE_SEAT.sample m (kept just inside the ground's extent, outside which the field answers its base level). Returns the corners lifted. */
export function seatDrape(pos:Float32Array,index:ArrayLike<number>,ground:Pick<Terrain,'heightAt'|'extent'>):number{
 const lift=new Float32Array(pos.length/3),{x0,z0,x1,z1}=ground.extent,e=1e-3;
 for(let i=0;i<index.length;i+=3){
  const a=index[i]*3,b=index[i+1]*3,c=index[i+2]*3;
  const edge=Math.max(Math.hypot(pos[a]-pos[b],pos[a+2]-pos[b+2]),Math.hypot(pos[b]-pos[c],pos[b+2]-pos[c+2]),Math.hypot(pos[c]-pos[a],pos[c+2]-pos[a+2]));
  const m=Math.max(1,Math.ceil(edge/DRAPE_SEAT.sample));let short=0;
  for(let u=0;u<=m;u++)for(let w=0;u+w<=m;w++){const bu=u/m,bw=w/m,bs=1-bu-bw;
   const x=Math.min(x1-e,Math.max(x0+e,pos[a]*bs+pos[b]*bu+pos[c]*bw)),z=Math.min(z1-e,Math.max(z0+e,pos[a+2]*bs+pos[b+2]*bu+pos[c+2]*bw));
   short=Math.max(short,ground.heightAt(x,z)+DRAPE_SEAT.clear-(pos[a+1]*bs+pos[b+1]*bu+pos[c+1]*bw));}
  if(short>0)for(const v of [a,b,c])lift[v/3]=Math.max(lift[v/3],short);
 }
 let n=0;for(let v=0;v<lift.length;v++)if(lift[v]>0){pos[v*3+1]+=lift[v];n++;}
 return n;
}
export const ROCK_SLOPE_DEG=38;
/** ASSUMED: unmapped ground over this pitch is rock, not the base paving; over CLIFF_FACE_DEG a cell is a cliff face (shaded, streaked). */
export const UNMAPPED_ROCK_DEG=28,CLIFF_FACE_DEG=55;
/** ASSUMED painted jointing on the rock: two or three joints a cell down the fall line, `joint` m long (from, to), a short ledge on only
 *  a `ledges` share of the cells (round 5's ledge on every 4 m contour read as even bands); the buff wash on faces whose normal has more
 *  than `sunward` along the noon sun (`sun`: its up and south components, 55 degrees high in the pinned midsummer views). */
export const JOINT={joint:[3,9],ledges:.1,sun:[.82,.57],sunward:.75} as const;
/** ASSUMED crag tones (R-wv3-a): dark dolerite, paler weathered faces, lichen grey, moss, and the warm brown-ochre of the weathered
 *  faces in the sun. */
export const ROCK_TONES=['#4a463e','#55493c','#5a554c','#615c53','#474a37','#524e45','#6b5a46','#5e5040'] as const;
/** sRGB paint for each ground class, matched by eye to R-wv3-a and R-wv3-c as rendered under the Waverley rig (ACES, exposure 1.25,
 *  which lifts a paint about 1.6x): ASSUMED shades. */
export const GROUND_COLOURS={
 paving:'#5c5850',road:'#3b3d3f',path:'#5f5c56',setts:'#615b51',lane:'#47474a',grass:'#4f6e28',park:'#566b2e',garden:'#47652a',pitch:'#557530',flower:'#5a6530',
 wood:'#2d4120',scrub:'#45502c',water:'#2b3d48',paved:'#67635b',rock:'#4a463e',cliff:'#4f4840',
} as const;
type Ring=Pt[];
/** The land-use file layout (tools/build-waverley-city-landuse.ts; Perth's tools/build-perth-city-landuse.ts writes the same). */
export interface LanduseFile {q:number;extent:{x0:number;z0:number;x1:number;z1:number};areas:Record<keyof typeof data.areas,number[][][]>;roads:Record<string,number[][]>;paths:Record<string,number[][]>;trees:number[];treeTags:number[][];cliffs:number[][];castleWalls:(number|number[])[][];outlooks:number[][]}
/** Decode a land-use file into local-metre rings and lines. */
export function decodeLanduse(file:LanduseFile){
 const decode=(d:number[]):Ring=>{const q=file.q,out:Ring=[];let x=0,z=0;for(let i=0;i<d.length;i+=2){x+=d[i];z+=d[i+1];out.push([x*q,z*q]);}return out;};
 return {
 extent:file.extent,
 areas:Object.fromEntries(Object.entries(file.areas).map(([k,v])=>[k,(v as number[][][]).map(rs=>rs.map(decode))])) as Record<keyof typeof data.areas,Ring[][]>,
 roads:Object.entries(file.roads).flatMap(([w,ls])=>(ls as number[][]).map(l=>({width:Number(w),line:decode(l)}))),
 paths:Object.entries(file.paths).flatMap(([w,ls])=>(ls as number[][]).map(l=>({width:Number(w),line:decode(l)}))),
 trees:decode(file.trees),
 /** Per mapped tree (by index in `trees`): needleleaved, and its OSM height in m (0 when untagged). */
 treeTags:new Map(file.treeTags.map(([i,needle,h])=>[i,{needle:needle===1,height:h}])),
 cliffs:file.cliffs.map(decode),
 castleWalls:file.castleWalls.map(([curtain,line])=>({curtain:curtain===1,line:decode(line as number[])})),
 /** The mapped viewing places: a viewpoint or peak (one point), or an attraction monument's outline. */
 outlooks:file.outlooks.map(decode),
 };
}
export type Landuse=ReturnType<typeof decodeLanduse>;
export const LANDUSE:Landuse=decodeLanduse(data as LanduseFile);
/** Waverley's, the default every builder below takes (Perth passes its own: perth-city-ground.ts). */
const WAVERLEY_LANDUSE=LANDUSE;
const pip=(x:number,z:number,p:readonly Pt[]):boolean=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const segDist=(x:number,z:number,a:Pt,b:Pt):number=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
/** A seeded hash in [0,1). */
const hash=(x:number,z:number,k=0):number=>{let h=Math.imul(Math.round(x*10)^0x9e3779b9,0x85ebca6b)^Math.imul(Math.round(z*10)+k*7919,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;return (h>>>0)/4294967296;};

/** The footprints things must stand clear of, bucketed by 16 m cells. */
export class Footprints {
 private cells=new Map<string,number[]>();
 readonly rings:readonly (readonly Pt[])[];
 constructor(rings:readonly (readonly Pt[])[]){
  this.rings=rings;
  rings.forEach((r,i)=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const [x,z]of r){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
   for(let cx=Math.floor(x0/16);cx<=Math.floor(x1/16);cx++)for(let cz=Math.floor(z0/16);cz<=Math.floor(z1/16);cz++){const k=`${cx},${cz}`;let a=this.cells.get(k);if(!a)this.cells.set(k,a=[]);a.push(i);}});
 }
 /** Distance from (x,z) to the nearest footprint outline within `reach` (reach when none is nearer), negative when inside one. */
 clearance(x:number,z:number,reach:number):number{
  let best=reach;const seen=new Set<number>();
  for(let cx=Math.floor((x-reach)/16);cx<=Math.floor((x+reach)/16);cx++)for(let cz=Math.floor((z-reach)/16);cz<=Math.floor((z+reach)/16);cz++)for(const i of this.cells.get(`${cx},${cz}`)??[]){
   if(seen.has(i))continue;seen.add(i);const r=this.rings[i];if(pip(x,z,r))return -1;
   for(let j=0;j<r.length;j++)best=Math.min(best,segDist(x,z,r[j],r[(j+1)%r.length]));
  }
  return best;
 }
}

/** Fill spacing (m) and crown spread (radius over height): ASSUMED. Woods are wider than the spacing so neighbouring crowns overlap into a
 *  canopy (R-wv3-a, R-wv3-b: the garden banks read as one mass of foliage); mapped trees are broad, low-crowned park specimens. */
export const FILL_STEP={wood:9,scrub:9} as const,CROWN_SPREAD={tree:.42,wood:.42,scrub:.5} as const,SCRUB_MAX_SLOPE_DEG=50;
/** ASSUMED sizes (m), the species size every tree is held to. An urban broadleaved tree (2,100 of the mapped 2,405 are OSM
 *  denotation=urban, the rest untagged or broadleaved) 8-14 tall; a needleleaved one narrow (spread 0.2) unless tagged; woodland 10-16;
 *  scrub (gorse, broom, hawthorn on Calton Hill and the Castle banks, R-wv3-d2) 1.2-2.8; the scattered trees in scrub (R-wv3-d2: ash,
 *  sycamore and hawthorn up the Calton face) 5-8, on a steep face (ground at least SCRUB_TREE_MIN_SLOPE_DEG; the summits are open grass
 *  and gorse, R-wv3-d2, -d3). There the scrub is a hanging wood, not scattered trees: R-wv3-d2 shows Calton Hill's south face one
 *  continuous canopy from Regent Road down to Calton Road, so its steep cells are filled on a closer HANGING_WOOD_STEP lattice with no
 *  gaps (ASSUMED spacing, under the crown width, so the crowns meet). An OSM height tag wins over all of these. */
export const TREE_SIZE={tree:[8,14],wood:[10,16],scrub:[1.2,2.8],scrubTree:[5,8],needleSpread:.2} as const,SCRUB_TREE_MIN_SLOPE_DEG=28,HANGING_WOOD_STEP=6;
/** ASSUMED: a viewing place keeps its outlook. Within `reach` m of a mapped viewing place (LANDUSE.outlooks: OSM viewpoints, peaks and the
 *  attraction monuments), a hanging-wood tree whose top would stand more than `over` m above the place's ground is left as gorse instead
 *  (round 4: the scrub on the Dugald Stewart Monument's knoll grew 6-8 m trees whose crowns closed the view west, where R-wv3-c2 shows it
 *  open). Round 5 held every mapped path to this, and so stripped the wooded belt at the foot of Castle Rock (R-wv3-a) and the summit trees
 *  by the obelisk (R-wv3-d2); a path is not a viewing place. */
export const OUTLOOK={reach:20,over:1.5} as const;
export const crownDepth=(kind:'tree'|'wood'|'scrub')=>kind==='tree'?.42:.4;
/** Ground slope in degrees from central differences over 2 m. */
export const slopeOf=(ground:Pick<Terrain,'heightAt'>,x:number,z:number)=>{const dx=(ground.heightAt(x+2,z)-ground.heightAt(x-2,z))/4,dz=(ground.heightAt(x,z+2)-ground.heightAt(x,z-2))/4;return Math.atan(Math.hypot(dx,dz))*180/Math.PI;};
export interface Tree {x:number;z:number;y:number;height:number;crown:number;kind:'tree'|'wood'|'scrub';/** a hanging-wood tree (round 6: with its trunk, so the crown stands on the slope, not floats over it) */hanging?:true}
/** A scene's own woodland (Perth's Kinnoull Hill; Waverley passes none): a height factor per massed tree (`size`), a veto on a placed
 *  massed tree (`keep`: clumps and gaps, open sightlines), its leaf colour (`tone`), and scrub placed at given points (`gorse`). */
export interface Woodland {size?(x:number,z:number,kind:'wood'|'scrub'):number;keep?(t:Tree):boolean;tone?(t:Tree,col:THREE.Color):void;gorse?:readonly Pt[]}
const lerp=([a,b]:readonly [number,number],r:number)=>a+(b-a)*r;
/** The trees that stand: mapped nodes and wood/scrub fill, each clear of every footprint and off the railway bed. */
export function placeTrees(ground:Pick<Terrain,'heightAt'>,footprints:Footprints,LANDUSE:Landuse=WAVERLEY_LANDUSE,step:{wood:number;scrub:number}=FILL_STEP,woodland:Woodland={}):Tree[]{
 const out:Tree[]=[],{x0,z0,x1,z1}=LANDUSE.extent;
 const take=(x:number,z:number,kind:Tree['kind'],size:readonly [number,number]=TREE_SIZE[kind],spread:number=CROWN_SPREAD[kind],tagged=0):void=>{
  if(x<x0+2||x>x1-2||z<z0+2||z>z1-2)return;
  const y=ground.heightAt(x,z);if(Math.abs(y-WAVERLEY_LEVELS.ground)<.3)return; // the railway's flattened bed (and its first blend)
  // no fill on bare crag: R-wv3-a shows Castle Rock's steepest faces as rock, the scrub on its ledges and lower banks
  if(kind!=='tree'&&slopeOf(ground,x,z)>SCRUB_MAX_SLOPE_DEG)return;
  const height=tagged||lerp(size,hash(x,z,1))*(kind!=='tree'&&woodland.size?woodland.size(x,z,kind):1),ch=crownDepth(kind)*height,cy=y+height-ch;
  let crown=Math.min(height*spread,footprints.clearance(x,z,height*spread));
  // seat the crown on the slope: narrow it until no ground rises into it (its rim at the crown's middle, its underside at 0.6 of the radius)
  const into=(c:number)=>[0,1,2,3,4,5,6,7,8,9,10,11].some(k=>{const a=k*Math.PI/6,dx=Math.cos(a),dz=Math.sin(a);return ground.heightAt(x+dx*c,z+dz*c)>cy-.2||ground.heightAt(x+dx*c*.6,z+dz*c*.6)>cy-.8*ch;});
  while(crown>=1&&into(crown))crown*=.75;
  if(crown<Math.min(1,height*spread))return;
  const t:Tree={x,z,y,height,crown,kind};if(kind!=='tree'&&woodland.keep&&!woodland.keep(t))return;
  out.push(t);
 };
 LANDUSE.trees.forEach(([x,z],i)=>{const tag=LANDUSE.treeTags.get(i);take(x,z,'tree',TREE_SIZE.tree,tag?.needle?TREE_SIZE.needleSpread:CROWN_SPREAD.tree,tag?.height);});
 // woods and scrub: a jittered lattice with gaps (a quarter of the cells left open), so a bank reads as clumps, not a grid of dots
 const fill=(rings:Ring[][],step:number,gaps:number,put:(x:number,z:number)=>void)=>{for(const rs of rings){const [o,...holes]=rs;let ax=Infinity,bx=-Infinity,az=Infinity,bz=-Infinity;for(const [x,z]of o){ax=Math.min(ax,x);bx=Math.max(bx,x);az=Math.min(az,z);bz=Math.max(bz,z);}
  for(let gx=Math.ceil(ax/step)*step;gx<bx;gx+=step)for(let gz=Math.ceil(az/step)*step;gz<bz;gz+=step){if(hash(gx,gz,9)<gaps)continue;const x=gx+(hash(gx,gz,2)-.5)*step*.9,z=gz+(hash(gx,gz,3)-.5)*step*.9;if(pip(x,z,o)&&!holes.some(h=>pip(x,z,h)))put(x,z);}}};
 const steep=(x:number,z:number)=>slopeOf(ground,x,z)>=SCRUB_TREE_MIN_SLOPE_DEG;
 fill(LANDUSE.areas.wood,step.wood,.25,(x,z)=>take(x,z,'wood'));
 // scrub: gorse on the gentler ground, the hanging wood on the steep faces
 fill(LANDUSE.areas.scrub,step.scrub,.25,(x,z)=>{if(!steep(x,z))take(x,z,'scrub');});
 for(const [x,z]of woodland.gorse??[])take(x,z,'scrub');
 // the lowest ground of the viewing places within OUTLOOK.reach (to a point, or to an outline's edges), or undefined
 const places=LANDUSE.outlooks.map(r=>({r,y:Math.min(...r.map(([x,z])=>ground.heightAt(x,z)))}));
 const outlookGround=(x:number,z:number):number|undefined=>{let low:number|undefined;
  for(const {r,y}of places){const d=r.length===1?Math.hypot(x-r[0][0],z-r[0][1]):Math.min(...r.map((a,i)=>segDist(x,z,a,r[(i+1)%r.length])));if(d<=OUTLOOK.reach&&(low===undefined||y<low))low=y;}
  return low;};
 fill(LANDUSE.areas.scrub,HANGING_WOOD_STEP,0,(x,z)=>{if(!steep(x,z))return;const n=out.length;take(x,z,'wood',TREE_SIZE.scrubTree,CROWN_SPREAD.wood);if(out.length===n)return;
  const t=out[n],place=outlookGround(x,z);if(place!==undefined&&t.y+t.height>place+OUTLOOK.over){out.pop();take(x,z,'scrub');}else t.hanging=true;});
 return out;
}

/** The lawns painted with mown stripes: the lawns and kept parks (grass, garden, pitch) whose box is over 400 m2. */
export function mownLawns(LANDUSE:Landuse=WAVERLEY_LANDUSE):Ring[][]{
 return (['garden','grass','pitch'] as const).flatMap(k=>LANDUSE.areas[k]).filter(([o])=>{let ax=Infinity,az=Infinity,bx=-Infinity,bz=-Infinity;for(const [x,z]of o){ax=Math.min(ax,x);az=Math.min(az,z);bx=Math.max(bx,x);bz=Math.max(bz,z);}return (bx-ax)*(bz-az)>=400;});
}
/** A street's paint by its class, as the builder's ROAD_WIDTH (or an OSM width tag) gives it: >= 8.5 m primary to tertiary, 5-5.5 m
 *  pedestrian, the rest residential, unclassified and service. ASSUMED shades. */
export const roadColour=(width:number)=>width>=8.5?GROUND_COLOURS.road:width>=5&&width<6?GROUND_COLOURS.setts:GROUND_COLOURS.lane;
/** Paint the ground cover; `slopeAt` gives the ground's slope in degrees. Browser only (null in Node). */
/** Gardens painted over land use (Perth's residential land, perth-gardens.ts): plots in their tones, hedges round them and tree crowns,
 *  clipped to `rings`. */
export interface GardenPaint {rings:Ring[][];plots:GardenRect[];crowns:{x:number;z:number;r:number}[];hedge:number;hedgeTone:string;crownTone:string;/** rects painted under the land use, over the bare paving (Perth's yards and back greens) */patches?:GardenRect[]}
/** A painted rect: corner (x, z), w along x and d along z before it is turned `rot` radians about its centre. */
export interface GardenRect {x:number;z:number;w:number;d:number;tone:string;rot?:number}
function paintGround(ground:Pick<Terrain,'normalAt'|'heightAt'>,slopeAt:(x:number,z:number)=>number,LANDUSE:Landuse,TONES:readonly string[]=ROCK_TONES,WATER_PAINT:string=GROUND_COLOURS.water,gardens?:GardenPaint,canvasWidth:number=CANVAS_WIDTH):THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const {x0,z0,x1,z1}=LANDUSE.extent,W=canvasWidth,H=Math.round(W*(z1-z0)/(x1-x0)),s=W/(x1-x0);
 const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');if(!g)return null;
 const px=(p:Pt):[number,number]=>[(p[0]-x0)*s,(p[1]-z0)*s];
 const path=(rings:readonly Ring[])=>{g.beginPath();for(const r of rings){r.forEach((p,i)=>i?g.lineTo(...px(p)):g.moveTo(...px(p)));g.closePath();}};
 const line=(l:Ring)=>{g.beginPath();l.forEach((p,i)=>i?g.lineTo(...px(p)):g.moveTo(...px(p)));};
 g.fillStyle=GROUND_COLOURS.paving;g.fillRect(0,0,W,H);
 const rect=(r:GardenRect,stroke=false)=>{if(!r.rot){(stroke?g.strokeRect:g.fillRect).call(g,(r.x-x0)*s,(r.z-z0)*s,r.w*s,r.d*s);return;}g.save();g.translate((r.x+r.w/2-x0)*s,(r.z+r.d/2-z0)*s);g.rotate(r.rot);(stroke?g.strokeRect:g.fillRect).call(g,-r.w/2*s,-r.d/2*s,r.w*s,r.d*s);g.restore();};
 if(gardens?.patches)for(const r of gardens.patches){g.fillStyle=r.tone;rect(r);}
 const cell=4,cols=Math.ceil((x1-x0)/cell),slopes=new Float32Array(cols*Math.ceil((z1-z0)/cell)),slope=(x:number,z:number)=>slopes[Math.round((z-z0)/cell)*cols+Math.round((x-x0)/cell)];
 for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell)slopes[Math.round((z-z0)/cell)*cols+Math.round((x-x0)/cell)]=slopeAt(x+cell/2,z+cell/2);
 // Unmapped ground steeper than UNMAPPED_ROCK_DEG is rough rock, not paving: nothing is paved at that pitch (round 3 drew the paving tone
 // on the Castle's summit bank as a pale slab). Mapped land use paints over it.
 for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell)if(slope(x,z)>UNMAPPED_ROCK_DEG){g.fillStyle=TONES[Math.floor(hash(x,z,11)*TONES.length)];g.fillRect((x-x0)*s,(z-z0)*s,cell*s+.5,cell*s+.5);}
 const A=LANDUSE.areas;
 for(const [k,col]of [['park',GROUND_COLOURS.park],['garden',GROUND_COLOURS.garden],['grass',GROUND_COLOURS.grass],['pitch',GROUND_COLOURS.pitch],['flower',GROUND_COLOURS.flower],['scrub',GROUND_COLOURS.scrub],['wood',GROUND_COLOURS.wood],['paved',GROUND_COLOURS.paved],['water',WATER_PAINT],['rock',GROUND_COLOURS.rock]] as const){
  g.fillStyle=col;for(const rs of A[k]){path(rs);g.fill('evenodd');}
 }
 // mown lawns: 3 m stripes a little lighter, alternate bands, turned per lawn (ASSUMED; R-wv3-a shows the gardens' lawns striped). Only
 // the lawns and kept parks (grass, garden, pitch): an open park's rough grass is not mown (R-wv3-d3: Calton Hill; the builder's note).
 for(const rs of mownLawns(LANDUSE)){const o=rs[0];let ax=Infinity,az=Infinity,bx=-Infinity,bz=-Infinity;for(const [x,z]of o){ax=Math.min(ax,x);az=Math.min(az,z);bx=Math.max(bx,x);bz=Math.max(bz,z);}
  g.save();path(rs);g.clip('evenodd');g.fillStyle='rgba(235,255,190,0.07)';const along=bx-ax>bz-az;
  for(let t=(along?az:ax);t<(along?bz:bx);t+=6){if(along)g.fillRect((ax-x0)*s,(t-z0)*s,(bx-ax)*s,3*s);else g.fillRect((t-x0)*s,(az-z0)*s,3*s,(bz-az)*s);}g.restore();}
 if(gardens){g.save();g.beginPath();for(const rs of gardens.rings)for(const r of rs){r.forEach((p,i)=>i?g.lineTo(...px(p)):g.moveTo(...px(p)));g.closePath();}g.clip('evenodd');
  for(const p of gardens.plots){g.fillStyle=p.tone;rect(p);}
  g.strokeStyle=gardens.hedgeTone;g.lineWidth=gardens.hedge*s;for(const p of gardens.plots)rect(p,true);
  g.fillStyle=gardens.crownTone;for(const c of gardens.crowns){g.beginPath();g.arc((c.x-x0)*s,(c.z-z0)*s,c.r*s,0,Math.PI*2);g.fill();}
  g.restore();}
 // Steep ground is bare rock, over grass and scrub; streets and paths are drawn over it.
 // The crag is not one tone (R-wv3-a): dark dolerite, paler weathered faces, grey lichen and moss on the ledges, each 4 m cell one of
 // ROCK_TONES by a seeded hash, then broken by short dark joints running down the fall line.
 for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell){const a=slope(x,z);if(a>ROCK_SLOPE_DEG){g.globalAlpha=Math.min(1,(a-ROCK_SLOPE_DEG)/10)*.9;g.fillStyle=TONES[Math.floor(hash(x,z,11)*TONES.length)];g.fillRect((x-x0)*s,(z-z0)*s,cell*s+.5,cell*s+.5);
  if(a>ROCK_SLOPE_DEG+8&&hash(x,z,12)<.5){const n=ground.normalAt(x,z,4),l=Math.hypot(n[0],n[2])||1;g.strokeStyle='rgba(25,22,20,0.55)';g.lineWidth=.6*s;g.beginPath();g.moveTo((x+2-x0)*s,(z+2-z0)*s);g.lineTo((x+2+n[0]/l*5-x0)*s,(z+2+n[2]/l*5-z0)*s);g.stroke();}}}
 // The steepest cells (over CLIFF_FACE_DEG) are the cliff faces themselves: shadowed and wet-streaked, so the crag reads as rock steps
 // between ledges, not one ramp (R-wv3-a, R-wv3-d2: the dark vertical faces of Castle Rock and the Calton crags). ASSUMED tone.
 g.globalAlpha=1;for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell){const a=slope(x,z);if(a<=CLIFF_FACE_DEG)continue;
  g.fillStyle='rgba(18,16,14,0.35)';g.fillRect((x-x0)*s,(z-z0)*s,cell*s+.5,cell*s+.5);
  const n=ground.normalAt(x,z,4),l=Math.hypot(n[0],n[2])||1;g.strokeStyle='rgba(15,13,12,0.6)';g.lineWidth=.8*s;
  for(const o of [.8,2.6])if(hash(x+o,z,14)<.7){g.beginPath();g.moveTo((x+o-x0)*s,(z+o-z0)*s);g.lineTo((x+o+n[0]/l*(5+hash(x,z+o,15)*6)-x0)*s,(z+o+n[2]/l*(5+hash(x,z+o,15)*6)-z0)*s);g.stroke();}}
 // Jointing: the 16 m DTM smooths the crag into one ramp. The dolerite breaks in mostly vertical joints (R-wv3-a: Castle Rock's faces
 // split into columns, with few ledges), so each rock cell carries two or three dark joints down the fall line, each kinked once and of
 // uneven length, and only a few cells (JOINT.ledges) a short ledge across the slope: a buff lip over its shadowed riser, 1.5-3 m long,
 // set anywhere in the cell, not on a contour. The sunward faces (towards the south and up, ASSUMED: the noon sun of the pinned views)
 // take a buff wash, except under the wood and scrub (round 5 washed Calton's wooded face buff). ASSUMED tones, counts and lengths.
 const woods=[...A.wood,...A.scrub].map(rs=>{let ax=Infinity,az=Infinity,bx=-Infinity,bz=-Infinity;for(const [x,z]of rs[0]){ax=Math.min(ax,x);az=Math.min(az,z);bx=Math.max(bx,x);bz=Math.max(bz,z);}return {rs,ax,az,bx,bz};});
 const wooded=(x:number,z:number)=>woods.some(w=>x>=w.ax&&x<=w.bx&&z>=w.az&&z<=w.bz&&pip(x,z,w.rs[0])&&!w.rs.slice(1).some(h=>pip(x,z,h)));
 const stroke=(pts:[number,number][],w:number,col:string)=>{g.strokeStyle=col;g.lineWidth=w*s;g.beginPath();pts.forEach(([x,z],i)=>i?g.lineTo((x-x0)*s,(z-z0)*s):g.moveTo((x-x0)*s,(z-z0)*s));g.stroke();};
 for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell){const a=slope(x,z);if(a<=ROCK_SLOPE_DEG)continue;
  const cx=x+cell/2,cz=z+cell/2,n=ground.normalAt(cx,cz,4),l=Math.hypot(n[0],n[2])||1,d=[n[0]/l,n[2]/l],t=[-d[1],d[0]];
  const sun=n[1]*JOINT.sun[0]+n[2]*JOINT.sun[1];if(sun>JOINT.sunward&&!wooded(cx,cz)){g.fillStyle=`rgba(176,140,96,${Math.min(.3,(sun-JOINT.sunward)*1.2)})`;g.fillRect((x-x0)*s,(z-z0)*s,cell*s+.5,cell*s+.5);}
  for(let k=0;k<3;k++){if(k===2&&hash(x,z,20)<.5)continue;
   const sx=x+hash(x,z,21+k)*cell,sz=z+hash(x,z,24+k)*cell,len=JOINT.joint[0]+hash(x,z,27+k)*(JOINT.joint[1]-JOINT.joint[0]),kink=(hash(x,z,30+k)-.5)*1.2;
   stroke([[sx,sz],[sx+d[0]*len/2+t[0]*kink,sz+d[1]*len/2+t[1]*kink],[sx+d[0]*len,sz+d[1]*len]],.35+hash(x,z,33+k)*.5,'rgba(16,14,12,0.5)');}
  if(hash(x,z,17)>=JOINT.ledges)continue;
  const lx=x+hash(x,z,18)*cell,lz=z+hash(x,z,19)*cell,half=.75+hash(x,z,36)*.75;
  const across=(o:number):[number,number][]=>[[lx+d[0]*o-t[0]*half,lz+d[1]*o-t[1]*half],[lx+d[0]*o+t[0]*half,lz+d[1]*o+t[1]*half]];
  stroke(across(.9),1.2,'rgba(18,16,14,0.55)');stroke(across(0),.7,'rgba(178,150,108,0.6)');}
 g.lineCap='round';g.lineJoin='round';
 // OSM cliff lines: a broken, half-strength 2.5 m edge, not a painted stripe (the slope cells above already carry the rock)
 g.strokeStyle=GROUND_COLOURS.cliff;g.lineWidth=2.5*s;g.globalAlpha=.55;g.setLineDash([6*s,4*s]);for(const l of LANDUSE.cliffs){line(l);g.stroke();}g.setLineDash([]);g.globalAlpha=1;
 g.strokeStyle=GROUND_COLOURS.path;for(const p of LANDUSE.paths){g.lineWidth=p.width*s;line(p.line);g.stroke();}
 // streets by class, which the builder's ROAD_WIDTH carries: main roads asphalt, lanes and service roads a paler worn asphalt,
 // pedestrian streets (the Royal Mile's setts, Rose Street) stone; narrow first, so a main road runs over its side streets
 for(const r of [...LANDUSE.roads].sort((a,b)=>a.width-b.width)){g.strokeStyle=roadColour(r.width);g.lineWidth=r.width*s;line(r.line);g.stroke();}
 // Texture: a low-contrast mottle so a lawn or a street is not one flat tone at close range. Seeded, so every load is the same.
 for(let i=0;i<30000;i++){const x=hash(i,1,4)*W,y=hash(i,2,5)*H,l=hash(i,3,6);g.fillStyle=l>.5?'rgba(255,255,240,0.05)':'rgba(20,20,10,0.07)';g.fillRect(x,y,2+l*3,2+l*3);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
 return t;
}

export interface WaverleyCityGround {group:THREE.Group;stats:{triangles:number;drawCalls:number};trees:Tree[];dispose():void}
/** The draped land-use cover and the trees; `footprints` are every mapped building and roof outline (trees stand clear of them). */
/** `options` (another station's ground, Perth's): its wood and scrub fill spacing, and whether a massed wood tree (not a mapped or hanging one) has a trunk, and the drape's tolerance and lift (DRAPE_TOLERANCE). */
export function buildWaverleyCityGround(ground:Terrain,footprints:Footprints,LANDUSE:Landuse=WAVERLEY_LANDUSE,options:{fillStep?:{wood:number;scrub:number};woodTrunks?:boolean;drape?:number;/** ground another element draws itself (Perth's frontage): no drape triangle with its centroid or any corner there */uncovered?:(x:number,z:number)=>boolean;woodland?:Woodland;rockTones?:readonly string[];/** paint for the mapped water on the drape, where it shows above a water sheet (Perth's shore) */waterPaint?:string;/** gardens painted over the land use (Perth's residential land) */gardens?:GardenPaint;/** texels across the extent's x span (CANVAS_WIDTH by default) */canvasWidth?:number;/** draw the mapped trees (natural=tree nodes) with the massed trees (coarse crowns, treated as wood trees: bare foliage on the ground when `woodTrunks` is false) instead of in their own crown and trunk draws, two draws fewer (Perth's west, where there are 6) */mappedWithMassed?:boolean}={}):WaverleyCityGround{
 const group=new THREE.Group();group.name='waverley-city-ground';
 const stats={triangles:0,drawCalls:0},geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const {x0,z0,x1,z1}=LANDUSE.extent;
 // The drape: the terrain mesh rebuilt over the drawn surface, less the railway bed.
 const drape=options.drape??DRAPE_TOLERANCE,tm=buildTerrainMesh(ground,{maxLeaf:16,tolerance:()=>drape});
 const P=tm.positions,keep:number[]=[],bed=(i:number)=>Math.abs(P[i*3+1]-WAVERLEY_LEVELS.ground)<.01;
 for(let i=0;i<tm.indices.length;i+=3){const a=tm.indices[i],b=tm.indices[i+1],c=tm.indices[i+2];/* the flattened bed is exactly at the rail datum (natural ground below it is drawn); a triangle touching it is left to the terrain, so the drape never spans the ballast */if(bed(a)||bed(b)||bed(c))continue;if(options.uncovered&&[a,b,c].some(v=>options.uncovered!(P[v*3],P[v*3+2]))||options.uncovered?.((P[a*3]+P[b*3]+P[c*3])/3,(P[a*3+2]+P[b*3+2]+P[c*3+2])/3))continue;keep.push(a,b,c);}
 const pos=new Float32Array(P.length),uv=new Float32Array(P.length/3*2);
 for(let i=0;i<P.length/3;i++){const x=P[i*3],z=P[i*3+2];pos[i*3]=x;pos[i*3+1]=ground.heightAt(x,z)+(options.drape??DRAPE_LIFT);pos[i*3+2]=z;uv[i*2]=(x-x0)/(x1-x0);uv[i*2+1]=1-(z-z0)/(z1-z0);}
 foldUp(pos,keep,ground);seatDrape(pos,keep,ground);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(keep);g.computeVertexNormals();geometries.push(g);
 const slopeAt=(x:number,z:number)=>{const n=ground.normalAt(x,z,4);return Math.acos(Math.min(1,n[1]))*180/Math.PI;};
 const map=paintGround(ground,slopeAt,LANDUSE,options.rockTones,options.waterPaint,options.gardens,options.canvasWidth);
 const cover=new THREE.MeshLambertMaterial({map,color:map?0xffffff:GROUND_COLOURS.paving});
 // a constant pull forward only: the drape is seated over the drawn ground (seatDrape), and a depth-slope factor would pull the cover over
 // low roofs and building bases scene-wide (round 5)
 cover.polygonOffset=true;cover.polygonOffsetFactor=-1;cover.polygonOffsetUnits=-1;cover.name='waverley-ground-cover';materials.push(cover);
 const mesh=new THREE.Mesh(g,cover);mesh.name='waverley-ground-cover';group.add(mesh);stats.triangles+=keep.length/3;stats.drawCalls++;
 // Trees: crowns (one icosahedron each) and trunks, two instanced draws.
 const trees=placeTrees(ground,footprints,LANDUSE,options.fillStep,options.woodland);
 if(trees.length){
  // A mapped tree is seen close from the gardens: a rounder crown (a 6 x 4 sphere, 36 faces: round 6 freed 6 a tree for the hanging wood's
  // trunks); woods and scrub are seen as masses (icosahedron, 20).
  const ico=(detail:number)=>{const g=new THREE.IcosahedronGeometry(1,detail),p=g.getAttribute('position'),n=g.getAttribute('normal');for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).normalize();n.setXYZ(i,v.x,v.y,v.z);}return g;}; // smooth normals: a rounded crown, not facets
  const fineG=new THREE.SphereGeometry(1,6,4),coarseG=ico(0),trunkG=new THREE.CylinderGeometry(1,1,1,3,1,true);geometries.push(fineG,coarseG,trunkG);
  const leaf=new THREE.MeshLambertMaterial({color:0xffffff}),bark=new THREE.MeshLambertMaterial({color:0x4a3f33});materials.push(leaf,bark);leaf.name='waverley-tree-crowns';bark.name='waverley-tree-trunks';
  const own=!options.mappedWithMassed,mapped=trees.filter(t=>t.kind==='tree'&&own),massed=trees.filter(t=>t.kind!=='tree'||!own),trunked=trees.filter(t=>t.kind!=='scrub'&&(options.woodTrunks!==false||t.kind==='tree'&&own||t.hanging));
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
  const crownsOf=(list:Tree[],geo:THREE.BufferGeometry,name:string)=>{
   const crowns=new THREE.InstancedMesh(geo,leaf,list.length);
   list.forEach((t,i)=>{const r=hash(t.x,t.z,7),ch=t.height*crownDepth(t.kind);q.setFromAxisAngle(up,r*6.283);
    // a massed wood tree with no trunk (options.woodTrunks false) is foliage down to the ground, not a crown floating over it
    const bare=options.woodTrunks===false&&(t.kind==='wood'||t.kind==='tree'&&!own)&&!t.hanging;
    m.compose(new THREE.Vector3(t.x,bare?t.y+ch:t.y+t.height-ch,t.z),q,new THREE.Vector3(t.crown,ch,t.crown));crowns.setMatrixAt(i,m);
    // ASSUMED leaf greens (R-wv3-a: fresh lime-greens in sun, darker conifers and holly between)
    col.setRGB(.24+r*.1,.36+r*.12,.14+r*.05,THREE.SRGBColorSpace);if(t.kind!=='tree')col.multiplyScalar(.85);if(t.kind!=='tree'&&options.woodland?.tone)options.woodland.tone(t,col);crowns.setColorAt(i,col);});
   crowns.instanceMatrix.needsUpdate=true;if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;crowns.name=name;crowns.computeBoundingSphere();
   group.add(crowns);stats.triangles+=list.length*(geo.index?geo.index.count:geo.getAttribute('position').count)/3;stats.drawCalls++;
  };
  if(mapped.length)crownsOf(mapped,fineG,'waverley-tree-crowns');
  if(massed.length)crownsOf(massed,coarseG,'waverley-wood-crowns');
  if(trunked.length){const trunks=new THREE.InstancedMesh(trunkG,bark,trunked.length);
   trunked.forEach((t,i)=>{const r=hash(t.x,t.z,7),ch=t.height*crownDepth(t.kind),th=t.height-ch*1.2+.4;q.setFromAxisAngle(up,r*6.283);
    m.compose(new THREE.Vector3(t.x,t.y-.4+th/2,t.z),q,new THREE.Vector3(.15+t.height*.012,th,.15+t.height*.012));trunks.setMatrixAt(i,m);});
   trunks.instanceMatrix.needsUpdate=true;trunks.name='waverley-tree-trunks';trunks.computeBoundingSphere();group.add(trunks);stats.triangles+=trunked.length*6;stats.drawCalls++;}
 }
 let disposed=false;
 return {group,stats,trees,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const x of geometries)x.dispose();for(const x of materials)x.dispose();map?.dispose();group.clear();}};
}
