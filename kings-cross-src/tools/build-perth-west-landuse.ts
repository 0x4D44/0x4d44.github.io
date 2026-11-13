// The Perth west extension's land use (PERTH_WEST_EXTENT, tools/perth-west-extent.ts): the same OSM ground as the context file
// (tools/build-perth-city-landuse.ts buildLanduse: areas, streets, park paths, trees, cliffs, outlooks, residential land), for the
// extent's own box, plus the trunk roads and motorways drawn as dual carriageways. Run from kings-cross-src:
//   node tools/build-perth-west-landuse.ts [--osm-dir ../.scratch/perth-west/osm] [--out web/src/data/perth-city-landuse-west.json] [--extent x0,z0,x1,z1]
// (--extent previews another box, for a --out elsewhere; the committed file is always PERTH_WEST_EXTENT's.)
// It fetches whatever map-API tiles of its lattice the cache lacks (generic user agent, one request at a time, never a cached tile twice)
// and the full relation of any area multipolygon the tiles hold incompletely, then writes the file. © OpenStreetMap contributors, ODbL 1.0.
// Widening the extent needs only a rebuild: the lattice is fixed, so the new tiles alone are fetched.
// - The trunk block: every highway=motorway or trunk way (and its _link slip roads and roundabout ways) that comes within M m of the
//   extent. A dual carriageway is two one-way ways in OSM, each with its own `lanes`, so each is drawn at its own width: OSM `width`
//   when mapped, else its lanes at the UK standard lane width plus hard strips (a motorway: its hard shoulder), both ASSUMED, else a
//   class default, each flagged by `basis`. The central reserve is the gap between the two. They are kept apart from `roads` so the width
//   and its basis travel with the way; web/src/perth-west-ground.ts paints them with the rest.
// - Everything else follows the context rule (class widths), except that a bridge is painted through: the context file leaves the Tay's
//   bridges to their own meshes, but here a bridged road (a motorway over a lane) would otherwise break.
import {existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {unproject} from '../core/geo.ts';
import type {Pt} from '../core/geo.ts';
import type {Extent} from '../core/terrain.ts';
import {PERTH_ORIGIN} from '../core/perth-data.ts';
import {PERTH_WEST_EXTENT} from './perth-west-extent.ts';
import {areaClass,buildLanduse,dp,loadOsm,M,nodePoints,perthRoad,Q} from './build-perth-city-landuse.ts';
import type {Element,RoadRule} from './build-perth-city-landuse.ts';

// ---- the OSM tiles --------------------------------------------------------------------------------------------------------------
/** The map-API tile lattice, in degrees: fixed, so a wider extent reuses every cached tile and fetches only the new ones. A tile is about
 *  1.0 km north-south and 0.9 km east-west, well under the API's 50,000-node and 0.25 square-degree limits. */
export const TILE_LATTICE={lat0:56.36,lon0:-3.56,dLat:0.009,dLon:0.0143} as const;
/** Metres fetched beyond the extent: the margin M of the roads and cliffs, and the ways that cross the edge. */
export const FETCH_PAD=120;
export interface OsmTile {name:string;bbox:[west:number,south:number,east:number,north:number]}
const r4=(v:number)=>Math.round(v*1e4)/1e4;
/** The lattice tiles that cover the extent and FETCH_PAD m beyond it. */
export function westTiles(extent:Extent,pad:number=FETCH_PAD):OsmTile[]{
 const {lat0,lon0,dLat,dLon}=TILE_LATTICE,sw=unproject(extent.x0-pad,extent.z1+pad,PERTH_ORIGIN),ne=unproject(extent.x1+pad,extent.z0-pad,PERTH_ORIGIN);
 const i0=Math.floor((sw.lat-lat0)/dLat),i1=Math.floor((ne.lat-lat0)/dLat),j0=Math.floor((sw.lon-lon0)/dLon),j1=Math.floor((ne.lon-lon0)/dLon),out:OsmTile[]=[];
 for(let i=i0;i<=i1;i++)for(let j=j0;j<=j1;j++)out.push({name:`t${i}_${j}`,bbox:[r4(lon0+j*dLon),r4(lat0+i*dLat),r4(lon0+(j+1)*dLon),r4(lat0+(i+1)*dLat)]});
 return out;
}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
/** Fetch what the cache lacks: one tile at a time, a pause between, a clear refusal if the API says a tile holds too many nodes. */
async function fetchInto(dir:string,jobs:readonly {name:string;url:string}[],agent:string):Promise<void>{
 mkdirSync(dir,{recursive:true});
 for(const j of jobs){
  const file=`${dir}/${j.name}.json`;if(existsSync(file))continue;
  console.error(`fetching ${j.url}`);
  const res=await fetch(j.url,{headers:{'User-Agent':agent},signal:AbortSignal.timeout(90000)});
  if(!res.ok)throw Error(`OSM map API HTTP ${res.status} for ${j.name}: ${(await res.text()).slice(0,200)}`);
  const raw=await res.text();if(!Array.isArray(JSON.parse(raw).elements))throw Error(`Invalid OSM response for ${j.name}`);
  writeFileSync(file,raw);await sleep(1500);
 }
}
/** The area multipolygon relations (a class areaClass draws) whose way members the tiles do not all hold: the map API returns an
 *  intersecting relation without its members, so each is fetched whole (relation/<id>/full.json) and the rings close. */
export function missingAreaRelations(all:ReadonlyMap<string,Element>):number[]{
 const out:number[]=[];
 for(const e of all.values()){
  if(e.type!=='relation'||e.tags?.type!=='multipolygon'||!areaClass(e.tags))continue;
  if((e.members??[]).some(m=>m.type==='way'&&!all.has(`way/${m.ref}`)))out.push(e.id);
 }
 return out.sort((a,b)=>a-b);
}

// ---- the trunk roads and motorways ----------------------------------------------------------------------------------------------
/** ASSUMED carriageway make-up (m), the UK standard for an all-purpose trunk road or motorway (DMRB): a lane, a hard strip on each
 *  side of a trunk carriageway, a motorway's nearside hard shoulder and offside strip, and the least a painted trunk-class way is (`slipMin`:
 *  a slip road, or a one-lane way; from 5 to 6 m the paint would read as the pedestrian setts, waverley-city-ground.ts roadColour).
 *  OSM maps none of these on the A9 or the M90. */
export const TRUNK_ASSUMED={lane:3.65,hardStrip:1,hardShoulder:3.3,slipMin:6} as const;
export type TrunkBasis='OSM width'|'OSM lanes'|'ASSUMED';
export const TRUNK_CLASS=/^(motorway|trunk)(_link)?$/;
/** The width (m) of a trunk or motorway way's carriageway, its lane count, and where the width came from. */
export function trunkWidth(t:Record<string,string>):{width:number;lanes:number;basis:TrunkBasis}{
 const hw=t.highway??'',link=hw.endsWith('_link'),motorway=hw.startsWith('motorway'),A=TRUNK_ASSUMED;
 const lanes=/^\d+$/.test(t.lanes??'')?Number(t.lanes):0,tagged=Number(t.width);
 if(tagged>0&&tagged<30)return {width:tagged,lanes,basis:'OSM width'};
 // ASSUMED when no lanes are mapped: two lanes on a motorway or trunk carriageway, one on a slip road
 const n=lanes||(link?1:2),edge=motorway&&!link?A.hardShoulder+A.hardStrip:2*A.hardStrip;
 // never under the least a painted road is: a one-lane trunk way (a ramp tagged trunk) would otherwise land in the pedestrian setts band
 const w=Math.max(A.slipMin,n*A.lane+edge);
 return {width:Math.round(w*10)/10,lanes:n,basis:lanes?'OSM lanes':'ASSUMED'};
}
/** The west extension's street rule: the context rule, but a bridge (layer 1 or 2) is painted through, and the trunk class is left to
 *  the trunk block. */
export const westRoad:RoadRule=t=>{
 if(TRUNK_CLASS.test(t.highway??''))return undefined;
 const layer=Number(t.layer??1);
 if(t.bridge&&t.bridge!=='no'&&layer>0&&layer<=2){const {bridge:_b,layer:_l,...rest}=t;return perthRoad(rest);}
 return perthRoad(t);
};
/** Quantum (m) of the trunk block's coordinates: finer than the ground's, so a carriageway pair keeps its central reserve. */
export const TRUNK_Q=.5;
const encQ=(p:Pt[],q:number):number[]=>{const out:number[]=[];let px=0,pz=0;for(const [x,z]of p){const qx=Math.round(x/q),qz=Math.round(z/q);out.push(qx-px,qz-pz);px=qx;pz=qz;}return out;};
export interface TrunkWay {id:string;hw:string;ref:string;name:string;lanes:number;width:number;basis:TrunkBasis;oneway:boolean;dual:boolean;roundabout:boolean;bridge:boolean;line:number[]}
/** The vertices of a polyline from one before its first point within `m` of the box to one after its last, or undefined if none is. */
export function runInside(p:readonly Pt[],box:Extent,m:number):Pt[]|undefined{
 const inside=(q:Pt)=>q[0]>=box.x0-m&&q[0]<=box.x1+m&&q[1]>=box.z0-m&&q[1]<=box.z1+m;
 const first=p.findIndex(inside);if(first<0)return undefined;
 let last=first;for(let i=p.length-1;i>first;i--)if(inside(p[i]!)){last=i;break;}
 return p.slice(Math.max(0,first-1),Math.min(p.length,last+2)) as Pt[];
}
/** The trunk and motorway ways that come within M m of the extent, in OSM id order, each cut to the run near the extent. */
export function trunkWays(all:ReadonlyMap<string,Element>,extent:Extent):TrunkWay[]{
 const out:TrunkWay[]=[];
 for(const e of [...all.values()].filter(e=>e.type==='way'&&e.nodes&&e.tags&&TRUNK_CLASS.test(e.tags.highway??'')).sort((a,b)=>a.id-b.id)){
  const t=e.tags!;if(t.area==='yes'||t.tunnel&&t.tunnel!=='no')continue;
  const p=nodePoints(all,e.nodes!);if(!p)continue;
  const run=runInside(p,extent,M);if(!run||run.length<2)continue;
  const {width,lanes,basis}=trunkWidth(t);
  out.push({id:`way/${e.id}`,hw:t.highway!,ref:t.ref??'',name:t.name??'',lanes,width,basis,oneway:t.oneway==='yes'||t.oneway==='-1',dual:t.dual_carriageway==='yes',
   roundabout:t.junction==='roundabout',bridge:!!t.bridge&&t.bridge!=='no',line:encQ(dp(run,TRUNK_Q),TRUNK_Q)});
 }
 return out;
}

// ---- junctions ------------------------------------------------------------------------------------------------------------------
export interface Roundabout {ways:string[];ref:string;name:string;hw:string;lanes:number;x:number;z:number;radius:number;closed:boolean}
/** The roundabouts whose centre is within the extent: the junction=roundabout ways that share nodes, as one ring each (centre and mean
 *  radius from the ring's nodes; `closed` when the ways join into a loop). */
export function roundabouts(all:ReadonlyMap<string,Element>,extent:Extent):Roundabout[]{
 const ways=[...all.values()].filter(e=>e.type==='way'&&e.nodes&&e.tags?.junction==='roundabout'&&e.tags.highway).sort((a,b)=>a.id-b.id);
 const parent=new Map<number,number>(),find=(a:number):number=>{let r=a;while(parent.get(r)!==r)r=parent.get(r)!;parent.set(a,r);return r;};
 for(const w of ways)for(const n of w.nodes!)if(!parent.has(n))parent.set(n,n);
 for(const w of ways)for(const n of w.nodes!.slice(1))parent.set(find(n),find(w.nodes![0]!));
 const groups=new Map<number,Element[]>();for(const w of ways){const k=find(w.nodes![0]!);(groups.get(k)??groups.set(k,[]).get(k)!).push(w);}
 const out:Roundabout[]=[];
 for(const g of groups.values()){
  const nodes=[...new Set(g.flatMap(w=>w.nodes!))],ps=nodes.map(n=>nodePoints(all,[n])?.[0]).filter((p):p is Pt=>!!p);if(ps.length<3)continue;
  const x=ps.reduce((s,p)=>s+p[0],0)/ps.length,z=ps.reduce((s,p)=>s+p[1],0)/ps.length;
  if(x<extent.x0-M||x>extent.x1+M||z<extent.z0-M||z>extent.z1+M)continue;
  // a closed loop: every node is in two ways' joins (or one way's two ends)
  const degree=new Map<number,number>();for(const w of g){const ns=w.nodes!;const closedWay=ns[0]===ns.at(-1);ns.forEach((n,i)=>{const ends=!closedWay&&(i===0||i===ns.length-1);degree.set(n,(degree.get(n)??0)+(ends?1:2));});}
  const closed=[...degree.values()].every(d=>d===2);
  const hws=g.map(w=>w.tags!.highway!),rank=['motorway','trunk','primary','secondary','tertiary','unclassified','residential','service'];
  const hw=hws.sort((a,b)=>rank.indexOf(a.replace('_link',''))-rank.indexOf(b.replace('_link','')))[0]!;
  out.push({ways:g.map(w=>`way/${w.id}`),ref:g.find(w=>w.tags!.ref)?.tags!.ref??'',name:g.find(w=>w.tags!.name)?.tags!.name??'',hw,lanes:Math.max(0,...g.map(w=>Number(w.tags!.lanes)||0)),
   x:Math.round(x*10)/10,z:Math.round(z*10)/10,radius:Math.round(ps.reduce((s,p)=>s+Math.hypot(p[0]-x,p[1]-z),0)/ps.length*10)/10,closed});
 }
 return out.sort((a,b)=>a.x-b.x||a.z-b.z);
}
export interface MotorwayJunction {id:string;ref:string;name:string;x:number;z:number}
/** The numbered motorway junctions (highway=motorway_junction nodes) within the extent. */
export function motorwayJunctions(all:ReadonlyMap<string,Element>,extent:Extent):MotorwayJunction[]{
 const out:MotorwayJunction[]=[];
 for(const e of all.values()){
  if(e.type!=='node'||e.tags?.highway!=='motorway_junction'||e.lat===undefined)continue;
  const p=nodePoints(all,[e.id])![0]!;
  if(p[0]>=extent.x0-M&&p[0]<=extent.x1+M&&p[1]>=extent.z0-M&&p[1]<=extent.z1+M)out.push({id:`node/${e.id}`,ref:e.tags.ref??'',name:e.tags.name??'',x:Math.round(p[0]*10)/10,z:Math.round(p[1]*10)/10});
 }
 return out.sort((a,b)=>a.x-b.x||a.z-b.z);
}

// ---- the file -------------------------------------------------------------------------------------------------------------------
/** The west land-use file for `extent` from raw OSM elements (the layout of perth-city-landuse.json, less the Tay's bridges, plus `trunk`). */
export function buildWestLanduse(all:ReadonlyMap<string,Element>,extent:Extent=PERTH_WEST_EXTENT,fetchedAt='2026-11-13'){
 const g=buildLanduse(all,extent,{road:westRoad});
 return {
  attribution:'© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',
  source:`OSM map API snapshot (lattice tiles of tools/build-perth-west-landuse.ts covering the west extension ${extent.x0},${extent.z0} to ${extent.x1},${extent.z1} m of the Perth frame and ${FETCH_PAD} m beyond, fetched ${fetchedAt}); land use, leisure and natural areas, highways (no tunnels or indoor; bridges painted through), natural=tree nodes, natural=cliff ways, viewpoint and peak nodes (outlooks); the trunk block: highway=motorway and trunk ways with their links and roundabouts, drawn as carriageways`,
  q:Q,extent,areas:g.areas,roads:g.roads,paths:g.paths,trees:g.trees,treeTags:g.treeTags,cliffs:g.cliffs,walls:[] as number[][],castleWalls:[] as [number,number[]][],outlooks:g.outlooks,
  residential:g.residential,
  trunk:{
   q:TRUNK_Q,
   basis:`Each way is drawn at its own width: the OSM width tag ('OSM width'); else its lanes tag times ${TRUNK_ASSUMED.lane} m plus ${TRUNK_ASSUMED.hardStrip} m hard strips each side, or for a motorway a ${TRUNK_ASSUMED.hardShoulder} m hard shoulder and a ${TRUNK_ASSUMED.hardStrip} m offside strip, the lane and edge widths ASSUMED ('OSM lanes'); else two lanes (one on a slip road) by the same make-up ('ASSUMED'). No way is drawn under ${TRUNK_ASSUMED.slipMin} m (a slip road or a one-lane way). Lines are cut to the run within ${M} m of the extent.`,
   assumed:TRUNK_ASSUMED,
   ways:trunkWays(all,extent),
   junctions:motorwayJunctions(all,extent),
   roundabouts:roundabouts(all,extent),
  },
 };
}

async function main():Promise<void>{
 const args=process.argv.slice(2),flag=(k:string,d:string)=>args.includes(k)?args[args.indexOf(k)+1]!:d;
 const dir=flag('--osm-dir','../.scratch/perth-west/osm'),out=flag('--out',fileURLToPath(new URL('../web/src/data/perth-city-landuse-west.json',import.meta.url))),agent='almanac-perth-build/0.1';
 const [x0,z0,x1,z1]=flag('--extent','').split(',').map(Number),extent:Extent=args.includes('--extent')?{x0:x0!,z0:z0!,x1:x1!,z1:z1!}:PERTH_WEST_EXTENT;
 if(args.includes('--extent')&&!Object.values(extent).every(Number.isFinite))throw Error('--extent takes x0,z0,x1,z1 in metres');
 const tiles=westTiles(extent);
 await fetchInto(dir,tiles.map(t=>({name:t.name,url:`https://api.openstreetmap.org/api/0.6/map.json?bbox=${t.bbox.join(',')}`})),agent);
 // only this extent's tiles are read, whatever else the cache holds, so the file never depends on it; then the area relations those
 // tiles hold incompletely, whole
 const tileFiles=tiles.map(t=>`${dir}/${t.name}.json`),need=missingAreaRelations(loadOsm(tileFiles));
 await fetchInto(dir,need.map(id=>({name:`relation-${id}`,url:`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`})),agent);
 const all=loadOsm([...tileFiles,...need.map(id=>`${dir}/relation-${id}.json`)]);
 const file=buildWestLanduse(all,extent);
 const json=JSON.stringify(file)+'\n';
 mkdirSync(path.dirname(out),{recursive:true});writeFileSync(out,json);
 console.log(JSON.stringify({out,tiles:tiles.length,relations:need,areas:Object.fromEntries(Object.entries(file.areas).map(([k,v])=>[k,v.length])),residential:file.residential.length,
  roads:Object.values(file.roads).flat().length,paths:Object.values(file.paths).flat().length,trees:file.trees.length/2,cliffs:file.cliffs.length,outlooks:file.outlooks.length,
  trunk:file.trunk.ways.map(w=>`${w.id} ${w.hw} ${w.ref} ${w.width} m (${w.basis}${w.roundabout?', roundabout':''})`),roundabouts:file.trunk.roundabouts.length,junctions:file.trunk.junctions,
  bytes:json.length,gzip:gzipSync(json,{level:9}).length}));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
