// W3 city: the generic OSM city fabric (one wall draw, one roof draw) and the city's landmarks, today the Scott Monument from
// data/waverley-city.json (tools/build-waverley-landmarks.ts). OSM footprints/building parts: ODbL. Fallback building heights are
// ASSUMED (core/waverley-data.ts); the Scott heights are OSM's mapped part heights. waverley-scene.ts calls buildWaverleyCity for the
// fabric and buildWaverleyCityLandmarks for the landmarks, and puts both in its buildings part.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {Batch,material,cityMaterial} from './materials.ts';
import type {Rgb,MaterialName} from './materials.ts';
import {centre,fillSurface,meshAdder,walls} from './waverley-mesh.ts';
import {cityHeight,tinyBlock} from './waverley-city-heights.ts';
import {roofPlan,roofSurface,roofPeak,withCreases,chimney,dormer,rectangleOf} from './waverley-city-roofs.ts';
import {buildWaverleyCityGround,Footprints,LANDUSE,slopeOf} from './waverley-city-ground.ts';
import {Streets,shopBand,shopTexture} from './waverley-city-shops.ts';
import {nelsonMonument,nationalColumns,castleWalls,obelisk,stGilesCrown,governorsHouse,stoneShell,stonePyramid,MONUMENT_OMIT_IDS,GOVERNORS_HOUSE} from './waverley-city-monuments.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from './data/waverley-scene.json' with {type:'json'};
import data from './data/waverley-city.json' with {type:'json'};
/** Grey-buff, not tan (lead, round 2). Each tint below is the target albedo over its texture's average colour, channel by channel, so
 *  the texture's warm cast cancels: the target hue is OSM's building:colour for Edinburgh sandstone (#9d9592 on the Political Martyrs'
 *  Monument, way/239888879). Brightness is ASSUMED. Round 5: that hue's red over blue read as a mauve cast across the city (scorer, round
 *  4), so the city stone is pulled to the neutral, faintly green grey of R-wv3-c3, about 0x767774 (ASSUMED; still inside the sandstone
 *  hue band the tint test holds). Facades: over the city stone facade (average 0xd2c9b0). */
export const WAVERLEY_CITY_STONE=0x8f97a8;
/** Plain ashlar (materials.ts stone, average 0xa99a7c) to the same grey, about 0x767774. */
export const WAVERLEY_CITY_ASHLAR=0xb2c5ee;
/** Blocks that are not windowed fabric: monuments, towers, columns, churches and ruins, any elevated part (a monument's stage, a
 *  spire's drum) and anything under PLAIN_AREA m2 in plan. They wear plain ashlar (materials.ts stone, 0.6 x 0.3 m blocks). */
export const PLAIN_KINDS=new Set(['church','chapel','cathedral','ruins','bridge','column','tower','monument','castle','wall','gatehouse','kiosk','toilets']);
export const PLAIN_AREA=40;
export const WAVERLEY_CITY_HEIGHTS={scott:61.11} as const;
export const WAVERLEY_CITY_SOURCES={
 scott:{url:'https://www.openstreetmap.org/way/39044819',height:61.11,basis:'OSM height; explicit mapped part heights and min_height'},
 assumptions:'Unsupported Scott roof profiles remain flat at mapped height; pyramidal/conical roof heights use OSM tags. No decorative Scott figures inferred.',
} as const;
/** The city buildings the landmarks replace: the Scott Monument outline and its mapped parts, the Nelson Monument's parts and the
 *  National Monument's columns. */
/** ASSUMED: a tiny unmeasured block (tinyBlock) on ground steeper than this is not drawn; one mapped there (round 4: way/258095246, 2 m2 on Castle
 *  Rock's 62-degree west face, a pale fleck in wv-castle-from-princes-st) is a fixture on the rock, below the model's scale. */
export const TINY_CLIFF_DEG=50;
/** The blocks that rule leaves out on the scene's terrain, listed so the scene's omit accounting sees them (the city test re-derives
 *  this list from the rule over the real terrain, so it cannot drift from it). */
export const TINY_CLIFF_IDS=['way/258095237','way/258095246'] as const;
/** Whether a block is a tiny unmeasured one on a cliff face (TINY_CLIFF_DEG). */
export const onCliff=(b:Parameters<typeof tinyBlock>[0],ground:Pick<Terrain,'heightAt'>):boolean=>tinyBlock(b)&&slopeOf(ground,...centre([...b.outer]))>TINY_CLIFF_DEG;
export const WAVERLEY_CITY_OMIT_IDS=[data.scott.id,...data.scott.parts.map(p=>p.id),...MONUMENT_OMIT_IDS,...TINY_CLIFF_IDS];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
export interface WaverleyCityPart {group:THREE.Group;stats:{triangles:number;drawCalls:number};omitBuildingIds:string[];dispose():void}
export interface WaverleyCityFabric extends WaverleyCityPart {/** The ids of the mapped blocks drawn, in data order. */ buildingIds:string[];/** How many drawn blocks stand at an OSM, a LiDAR (waverley-city-heights.ts) or an ASSUMED height. */ heightBasis:{OSM:number;LiDAR:number;ASSUMED:number}}

/** The generic city blocks, each footprint extruded from its lowest ground to its OSM (or ASSUMED) height under the roof its OSM
 *  roof tags give (or an ASSUMED pitched roof, waverley-city-roofs.ts); `omitBuildingIds` are drawn by an element. */
export function buildWaverleyCity(city:Pick<WaverleyData,'buildings'>,ground:Pick<Terrain,'rangeUnder'>&Partial<Pick<Terrain,'heightAt'>>,options:{omitBuildingIds?:Iterable<string>}={}):WaverleyCityFabric {
 const group=new THREE.Group();group.name='waverley-city';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 // Own variants of the shared palette; never mutate the cached shared materials. The walls wear the city's stone facade (ashlar with
 // a tall window and surround to each 3.0 x 3.6 m bay, materials.ts CITY_TEXTURES.stone), toned to Edinburgh's grey-buff sandstone
 // (R-wv3-c, -c3); the shades and the per-block variation are ASSUMED, not a facade survey.
 const sandstone=cityMaterial('stone').clone() as THREE.MeshLambertMaterial;sandstone.color.setHex(WAVERLEY_CITY_STONE);sandstone.vertexColors=true;
 const slate=material('slate').clone() as THREE.MeshLambertMaterial;slate.color.multiply(new THREE.Color(0xada99f));slate.vertexColors=true;
 const buildings=new Batch({colored:true}),plainWalls=new Batch({colored:true}),buildingTops=new Batch({colored:true}),shops=new Batch(),streets=new Streets();
 const foot=ground.heightAt?(p:Pt)=>ground.heightAt!(p[0],p[1]):undefined;
 const ashlar=material('stone').clone() as THREE.MeshLambertMaterial;ashlar.color.setHex(WAVERLEY_CITY_ASHLAR);ashlar.vertexColors=true;
 const omitted=new Set(options.omitBuildingIds??[]),buildingIds:string[]=[],heightBasis={OSM:0,LiDAR:0,ASSUMED:0};
 for(const b of city.buildings){
  if(omitted.has(b.id))continue;
  buildingIds.push(b.id);
  const h=cityHeight(b);heightBasis[h.basis]++;
  const base=ground.rangeUnder(b.outer,4).min,plan=roofPlan({...b,height:h.height},base);
  let hash=0;for(const c of b.id)hash=(hash*31+c.charCodeAt(0))>>>0;
  const tone=.8+(hash%23)*.01,warm=((hash>>>5)%7)*.008,color:Rgb=[tone*(1+warm),tone,tone*(.97-warm)];
  const roofTone=.82+((hash>>>9)%13)*.02,roofColor:Rgb=[roofTone,roofTone,roofTone*1.02];
  // One foundation plane, ASSUMED 0.15m rendering sink. Elevated OSM parts keep their real
  // min_height void; terrain never pulls individual wall corners into shards.
  const planes=plan.shape==='planes',outer=planes?withCreases(b.outer,plan.creases):b.outer,holes=planes?b.holes.map(h=>withCreases(h,plan.creases)):b.holes;
  let area=0;{const r=b.outer;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];area+=p[0]*q[1]-q[0]*p[1];}area=Math.abs(area)/2;}
  const plain=b.minHeight>0||area<PLAIN_AREA||PLAIN_KINDS.has(b.tags.building??b.tags['building:part']??'');
  walls(plain?plainWalls:buildings,outer,holes,()=>b.minHeight?base+b.minHeight:base-.15,planes?plan.at:()=>plan.eave,color);
  const roofFrom=buildingTops.colors.length;
  if(planes)roofSurface(buildingTops,b.outer,b.holes,plan);
  else{fillSurface(buildingTops,b.outer,b.holes,()=>plan.eave);if(plan.shape!=='flat')roofPeak(buildingTops,b.outer,plan);}
  // slates vary a little block to block (ASSUMED, R-wv3-c: weathered grey slate, some darker, some bluer)
  for(let i=roofFrom;i<buildingTops.colors.length;i+=3){buildingTops.colors[i]*=roofColor[0];buildingTops.colors[i+1]*=roofColor[1];buildingTops.colors[i+2]*=roofColor[2];}
  for(const c of plan.chimneys)chimney(plainWalls,c,plan.u,plan.eave,color); // stacks are plain ashlar, not windowed fabric
  for(const d of plan.dormers??[])dormer(plainWalls,buildingTops,d,plan.at,color);
  if(!plain&&!b.minHeight)shopBand(shops,b.outer,base,plan.eave,streets,foot);
 }
 // Every top is a roof: the cover map (cover.ts ROOF_MESHES) knows this mesh by name.
 add(group,buildings,sandstone,'waverley-building-walls');add(group,plainWalls,ashlar,'waverley-building-ashlar');add(group,buildingTops,slate,'waverley-building-tops');
 const shopMap=shopTexture(),shopfront=new THREE.MeshLambertMaterial({map:shopMap,color:shopMap?0xffffff:0x5a5650});add(group,shops,shopfront,'waverley-building-shops');
 let disposed=false;
 return {group,stats,omitBuildingIds:[],buildingIds,heightBasis,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of geometries)g.dispose();sandstone.dispose();ashlar.dispose();slate.dispose();shopfront.dispose();shopMap?.dispose();group.clear();}};
}

/** The Scott Monument's central spire part (OSM 15 to 61.11 m, mapped as walls to 21.11 m under a 40 m pyramid). */
export const SCOTT_SPIRE='way/445166834';
/** ASSUMED: the spire as R-wv3-b shows it, a square tower stepping in at its galleries rather than one smooth pyramid. Each tier's top
 *  (m above the base) and its plan scale on the OSM spire part, measured by eye off R-wv3-b; the last tier ends in a pyramid at the
 *  OSM 61.11 m. Pinnacles (ASSUMED 0.8 m square, 3.5 m tall) stand at each tier's outermost corners, each the head of a cluster (R-wv3-b:
 *  the tier corners bristle with pinnacles): two lesser ones, `lesserSide` square (or 0.8 of a narrower ledge) and `lesserHeight` tall,
 *  set back `lesserSet` m (or more, past a chamfer) from the corner along each of its two edges, on the ledge before the tier above. */
export const SCOTT_TIERS=[{top:29,scale:.86},{top:38,scale:.7},{top:46,scale:.55},{top:52,scale:.42}] as const;
export const SCOTT_PINNACLE={side:.8,height:3.5,lesserSide:.45,lesserHeight:2.3,lesserSet:1.1} as const;
/** ASSUMED gallery on each tier face (R-wv3-b: an open arcade at each stage, near-black inside): over 0.55 of the face's width, from
 *  1 m over the tier's floor to 1.2 m under its top, `lancets` pointed openings between stone mullions `mullion` m wide, each head
 *  rising `point` of its width to its apex, 3 cm proud of the face, at 0.16 of the stone's tone. */
export const SCOTT_GALLERY={width:.55,sill:1,head:1.2,proud:.03,tone:.16,lancets:3,mullion:.35,point:.7} as const;
/** The Scott Monument's stone over the ashlar texture (average 0xa99a7c): to about 0x534f4a, the sooted Binny sandstone's dark
 *  grey-brown (R-wv3-b: near-black in shade, only dark brown where lit; round 4 a quarter darker than round 3's 0x6e6962, scorer's
 *  round 3 note), darker than the city. The Calton monuments' paler Craigleith stone: to about 0x87837c. ASSUMED. */
export const SCOTT_STONE=0x7d8297,MONUMENT_STONE=0xccd9ff;
let sceneData:ReturnType<typeof unpackWaverleyScene>|undefined;
const scene=()=>sceneData??=unpackWaverleyScene(sceneFile);

/** The Scott Monument from its 98 mapped OSM parts, on one common base: the lowest ground under its outline; the Nelson and National
 *  Monuments and the Castle walls (waverley-city-monuments.ts); and, over a full terrain, the ground cover and trees. */
export function buildWaverleyCityLandmarks(ground:Pick<Terrain,'rangeUnder'|'heightAt'>&Partial<Terrain>):WaverleyCityPart {
 const group=new THREE.Group();group.name='waverley-city-landmarks';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 const scott=new Batch({colored:true}),sr=ringOf(data.scott.ring),sb=ground.rangeUnder(sr,2).min;
 for(const p of data.scott.parts){const r=ringOf(p.ring),pitched=['pyramidal','cone'].includes(p.roofShape)&&p.roofHeight>0,wallTop=p.height-(pitched?p.roofHeight:0);
  if(wallTop>p.minHeight)stoneShell(scott,r,sb+p.minHeight,sb+wallTop);
  if(!pitched)continue;
  if(p.id!==SCOTT_SPIRE){stonePyramid(scott,r,sb+wallTop,sb+p.height);continue;}
  const c=centre(r),at=(k:number)=>r.map(q=>[c[0]+(q[0]-c[0])*k,c[1]+(q[1]-c[1])*k] as [number,number]);
  // each tier steps in from the one below; its pinnacles stand on the ledge so left, at the lower tier's four outermost corners
  const inRing=(x:number,z:number,p:readonly [number,number][])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
  const pinnacles=(ring:[number,number][],y:number,upper?:[number,number][])=>{const h=SCOTT_PINNACLE.side/2;
   for(const [sx,sz]of [[1,1],[1,-1],[-1,1],[-1,-1]]){const q=ring.reduce((m,v)=>(v[0]-c[0])*sx+(v[1]-c[1])*sz>(m[0]-c[0])*sx+(m[1]-c[1])*sz?v:m),d=Math.hypot(q[0]-c[0],q[1]-c[1])||1,o=[q[0]-(q[0]-c[0])/d*h*1.5,q[1]-(q[1]-c[1])/d*h*1.5];
    const sq:[number,number][]=[[o[0]-h,o[1]-h],[o[0]+h,o[1]-h],[o[0]+h,o[1]+h],[o[0]-h,o[1]+h]];stoneShell(scott,sq,sb+y-.1,sb+y+.6);stonePyramid(scott,sq,sb+y+.6,sb+y+SCOTT_PINNACLE.height);
   }
   // the lesser pinnacles of each corner's cluster: on the ledge between this ring and the tier above, set back along the corner's two
   // edges (the plan rectangle's axes), each square to those axes; one that would not stand wholly on the ledge is left out
   if(!upper)return;
   const R=rectangleOf(ring),U=rectangleOf(upper),v:[number,number]=[-R.u[1],R.u[0]],{lesserSide:ls,lesserHeight:lh,lesserSet:set}=SCOTT_PINNACLE;
   const at2=(a:number,b:number):[number,number]=>[R.c[0]+R.u[0]*a+v[0]*b,R.c[1]+R.u[1]*a+v[1]*b];
   // (the OSM ring's corners are chamfered: where the set-back point is off the chamfer, it steps further back, 0.3 m at a time)
   for(const [sx,sz]of [[1,1],[1,-1],[-1,1],[-1,-1]])for(const along of [0,1])for(let back=set;back<=Math.min(R.L,R.W)*.6;back+=.3){
    const [a,b,e0]=along?[sx*(R.L+U.L)/2,sz*(R.W-back),Math.min(ls,.8*(R.L-U.L))/2]:[sx*(R.L-back),sz*(R.W+U.W)/2,Math.min(ls,.8*(R.W-U.W))/2];
    if(e0<=.05)break;
    // the OSM ring is not a true rectangle: where the ledge is narrower than the rectangles say, a slimmer pinnacle (0.7 of the width)
    const e=[e0,e0*.7].find(e=>[at2(a-e,b-e),at2(a+e,b-e),at2(a+e,b+e),at2(a-e,b+e)].every(q=>inRing(q[0],q[1],ring)&&!inRing(q[0],q[1],upper)));if(e===undefined)continue;
    const lq=[at2(a-e,b-e),at2(a+e,b-e),at2(a+e,b+e),at2(a-e,b+e)];stoneShell(scott,lq,sb+y-.1,sb+y+.4);stonePyramid(scott,lq,sb+y+.4,sb+y+lh);break;}};
  let y=wallTop,below=r;
  // each tier face carries its gallery: a dark recess (SCOTT_GALLERY) standing for the open arcade R-wv3-b shows at every stage
  // on each of the four sides of the plan's minimum-area rectangle (the OSM ring is a chamfered square of many short edges)
  const gallery=(ring:[number,number][],ya:number,yb:number)=>{const {width,sill,head,proud,tone,lancets,mullion,point}=SCOTT_GALLERY;if(yb-ya<sill+head+1)return;
   const R=rectangleOf(ring),v=[-R.u[1],R.u[0]];
   for(const [ax,half,other]of [[R.u,R.L,R.W],[R.u,R.L,-R.W],[v,R.W,R.L],[v,R.W,-R.L]] as const){const n=ax===R.u?[v[0]*Math.sign(other),v[1]*Math.sign(other)]:[R.u[0]*Math.sign(other),R.u[1]*Math.sign(other)];
    const m=[R.c[0]+n[0]*(Math.abs(other)+proud),R.c[1]+n[1]*(Math.abs(other)+proud)],h=half*width;
    const P=(s:number,yy:number):[number,number,number]=>[m[0]+ax[0]*s,yy,m[1]+ax[1]*s];
    // the lancets: each a dark opening with a pointed head; the stone left between them reads as the mullions
    const lw=(2*h-(lancets-1)*mullion)/lancets,top=yb-head,spring=top-lw*point;if(lw<=0||spring<=ya+sill)continue;
    for(let k=0;k<lancets;k++){const a=-h+k*(lw+mullion),b2=a+lw;
     scott.poly([P(a,ya+sill),P(b2,ya+sill),P(b2,spring),P((a+b2)/2,top),P(a,spring)],undefined,{facing:[n[0],0,n[1]],color:[tone,tone,tone]});}}};
  for(const t of SCOTT_TIERS){const ring=at(t.scale);stoneShell(scott,ring,sb+y,sb+t.top);gallery(ring,sb+y,sb+t.top);pinnacles(below,y,ring);below=ring;y=t.top;}
  pinnacles(below,y);
  stonePyramid(scott,at(SCOTT_TIERS.at(-1)!.scale),sb+y,sb+p.height);
 }
 const stone=material('stone').clone() as THREE.MeshLambertMaterial;stone.color.setHex(SCOTT_STONE);stone.vertexColors=true;
 add(group,scott,stone,'waverley-scott-monument');
 const parts=new Map(scene().buildings.filter(b=>MONUMENT_OMIT_IDS.includes(b.id)).map(b=>[b.id,b]));
 const monuments=new Batch({colored:true});nelsonMonument(monuments,parts,ground);nationalColumns(monuments,parts,ground);obelisk(monuments,parts,ground);stGilesCrown(monuments,parts,ground);
 castleWalls(monuments,LANDUSE.castleWalls,ground);
 const house=scene().buildings.find(b=>b.id===GOVERNORS_HOUSE.id);governorsHouse(monuments,house,house?cityHeight(house).height:0,ground);
 const pale=material('stone').clone() as THREE.MeshLambertMaterial;pale.color.setHex(MONUMENT_STONE);pale.vertexColors=true;
 add(group,monuments,pale,'waverley-city-monuments');
 // The ground's land use and the trees, over the drawn terrain (a full terrain only: the real scene, not a test stub). Trees keep
 // clear of every mapped building and roof outline, whichever element draws it.
 let cover:ReturnType<typeof buildWaverleyCityGround>|undefined;
 if(ground.extent&&ground.normalAt&&ground.stepIn){
  cover=buildWaverleyCityGround(ground as Terrain,new Footprints([...scene().buildings,...scene().roofs].map(b=>ringOf(b.outer))));
  group.add(cover.group);stats.triangles+=cover.stats.triangles;stats.drawCalls+=cover.stats.drawCalls;
 }
 let disposed=false;
 return {group,stats,omitBuildingIds:[...WAVERLEY_CITY_OMIT_IDS],dispose(){if(disposed)return;disposed=true;cover?.dispose();group.removeFromParent();for(const g of geometries)g.dispose();stone.dispose();pale.dispose();group.clear();}};
}
