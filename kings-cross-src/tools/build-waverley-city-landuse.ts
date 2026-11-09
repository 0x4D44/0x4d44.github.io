// W3 city ground: OSM land use, streets and paths, mapped trees and cliffs for the Waverley terrain extent, from the same public
// OSM snapshot as the scene (tools/build-waverley.ts, four map-API tiles). Run from kings-cross-src:
//   node tools/build-waverley-city-landuse.ts <raw-osm-dir>
// writes web/src/data/waverley-city-landuse.json, read by web/src/waverley-city-ground.ts. © OpenStreetMap contributors, ODbL 1.0.
// Rings and lines are clipped to the extent's box (plus a margin), simplified (Douglas-Peucker, 2 m) and stored as
// delta integers at 2 m (the ground texture is about 1 m a texel; the overview reads it at tens of metres). Nothing is invented here: every polygon, line, tree and cliff is a mapped OSM feature with its tags' class.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {project} from '../core/geo.ts';
import type {Pt} from '../core/geo.ts';
const dir=process.argv[2]??'../.scratch/b44/osm';
type Element={type:string;id:number;lat?:number;lon?:number;nodes?:number[];tags?:Record<string,string>;members?:{type:string;ref:number;role:string}[]};
const all=new Map<string,Element>();
// The four tiles, plus any relation/<id>/full.json fetched beside them for a multipolygon the tiles hold incompletely.
for(const name of ['sw','se','nw','ne',...readdirSync(dir).filter(f=>/^relation-\d+\.json$/.test(f)).map(f=>f.slice(0,-5))])for(const e of JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8')).elements as Element[])all.set(`${e.type}/${e.id}`,e);
const origin={lat:55.9519018,lon:-3.1904199};
const get=(id:number)=>all.get(`way/${id}`)!;
/** The Waverley terrain extent (web/src/data/waverley-terrain.json). */
export const LANDUSE_EXTENT={x0:-912,z0:-624,x1:1088,z1:608} as const;
const Q=2,M=40;
const pts=(ids:number[]):Pt[]|undefined=>{const out:Pt[]=[];for(const id of ids){const n=all.get(`node/${id}`);if(n?.lat===undefined||n.lon===undefined)return undefined;out.push(project(n.lat,n.lon,origin) as Pt);}return out;};
// ---- classes (OSM tag -> ground class) --------------------------------------------------------------------------------------
type AreaClass='grass'|'garden'|'wood'|'scrub'|'water'|'rock'|'paved'|'flower'|'pitch';
function areaClass(t:Record<string,string>):AreaClass|undefined{
 if(t.building||t['building:part'])return undefined;
 if(t.natural==='water'||t.water||t.leisure==='swimming_pool')return 'water';
 if(t.natural==='wood'||t.landuse==='forest')return 'wood';
 if(t.natural==='scrub'||t.natural==='heath')return 'scrub';
 if(t.natural==='bare_rock'||t.natural==='scree'||t.natural==='rock')return 'rock';
 if(t.landuse==='flowerbed')return 'flower';
 if(t.leisure==='pitch'&&t.surface&&!/grass/.test(t.surface))return 'paved';
 if(t.leisure==='pitch')return 'pitch';
 if(t.leisure==='garden')return 'garden';
 if(t.leisure==='park'||t.landuse==='grass'||t.landuse==='meadow'||t.landuse==='village_green'||t.landuse==='recreation_ground'||t.natural==='grassland'||t.landuse==='cemetery'||t.amenity==='grave_yard')return 'grass';
 // paved squares, car parks and playgrounds are left as the base paving: the ground already is paving
 return undefined;
}
/** Carriageway or path width by highway class, metres. ASSUMED: typical Edinburgh city-centre widths (no survey); paths from the
 * OSM width tag when mapped. */
const ROAD_WIDTH:Record<string,number>={primary:11,secondary:10,tertiary:8.5,unclassified:7,residential:7,living_street:6,service:4.5,pedestrian:5,footway:2.5,path:2.5,cycleway:2.5,bridleway:2.5,track:3,steps:2.5};
const roadKind=(t:Record<string,string>):'road'|'path'|undefined=>{
 const h=t.highway;if(!h||!(h in ROAD_WIDTH)||t.area==='yes')return undefined;
 if(t.tunnel&&t.tunnel!=='no'||t.bridge&&t.bridge!=='no'||Number(t.layer??0)!==0||t.indoor==='yes'||t.level&&Number(t.level)<0)return undefined;
 if(t.footway==='sidewalk'||t.footway==='crossing')return undefined; // a sidewalk is the paving the ground already is
 return ['footway','path','cycleway','bridleway','track','steps'].includes(h)?'path':'road';
};
// ---- geometry -----------------------------------------------------------------------------------------------------------------
const inBox=(p:Pt,m:number)=>p[0]>=LANDUSE_EXTENT.x0-m&&p[0]<=LANDUSE_EXTENT.x1+m&&p[1]>=LANDUSE_EXTENT.z0-m&&p[1]<=LANDUSE_EXTENT.z1+m;
function dp(p:Pt[],tol:number):Pt[]{
 if(p.length<3)return p;const keep=new Uint8Array(p.length);keep[0]=keep[p.length-1]=1;const stack:[number,number][]=[[0,p.length-1]];
 while(stack.length){const [a,b]=stack.pop()!;let best=-1,at=-1;const [ax,az]=p[a],[bx,bz]=p[b],dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz)||1;
  for(let i=a+1;i<b;i++){const d=Math.abs((p[i][0]-ax)*dz-(p[i][1]-az)*dx)/l;if(d>best){best=d;at=i;}}
  if(best>tol){keep[at]=1;stack.push([a,at],[at,b]);}}
 return p.filter((_,i)=>keep[i]);
}
const enc=(p:Pt[]):number[]=>{const out:number[]=[];let px=0,pz=0;for(const [x,z]of p){const qx=Math.round(x/Q),qz=Math.round(z/Q);out.push(qx-px,qz-pz);px=qx;pz=qz;}return out;};
/** Stitch member ways into closed rings by shared end nodes. */
function rings(ways:number[][]):number[][]{
 const open=ways.map(w=>[...w]),out:number[][]=[];
 while(open.length){let r=open.shift()!;let grown=true;
  while(r[0]!==r.at(-1)&&grown){grown=false;
   for(let i=0;i<open.length;i++){const w=open[i];
    if(w[0]===r.at(-1)){r=[...r,...w.slice(1)];}else if(w.at(-1)===r.at(-1)){r=[...r,...[...w].reverse().slice(1)];}
    else if(w.at(-1)===r[0]){r=[...w,...r.slice(1)];}else if(w[0]===r[0]){r=[...[...w].reverse(),...r.slice(1)];}else continue;
    open.splice(i,1);grown=true;break;}}
  if(r[0]===r.at(-1)&&r.length>3)out.push(r);
 }
 return out;
}
const areas:Record<AreaClass,number[][][]>={grass:[],garden:[],wood:[],scrub:[],water:[],rock:[],paved:[],flower:[],pitch:[]};
const green:Pt[][]=[];
const addArea=(cls:AreaClass,outer:number[],holes:number[][])=>{
 const o=pts(outer);if(!o||!o.some(p=>inBox(p,0)))return;
 // private back greens (leisure=garden, 625 of them) are seen only from above and afar: 3 m simplification; the rest 2 m
 const tol=cls==='garden'?3:2,hs=holes.map(pts).filter((h):h is Pt[]=>!!h).map(h=>enc(dp(h.slice(0,-1),tol)));
 const s=dp(o.slice(0,-1),tol);if(s.length<3)return;areas[cls].push([enc(s),...hs]);green.push(...(['grass','garden','wood','scrub','pitch','flower'].includes(cls)?[s]:[]));
};
const roads:Record<string,number[][]>={},paths:Record<string,number[][]>={},pathPts:{w:number;p:Pt[]}[]=[],cliffs:number[][]=[],walls:number[][]=[];
for(const e of all.values()){
 const t=e.tags??{};
 if(e.type==='way'&&e.nodes){
  const closed=e.nodes[0]===e.nodes.at(-1),cls=closed?areaClass(t):undefined;
  if(cls)addArea(cls,e.nodes,[]);
  const kind=roadKind(t);
  if(kind){const p=pts(e.nodes);if(p&&p.some(q=>inBox(q,M))){const w=Number(t.width)>0&&Number(t.width)<30?Number(t.width):ROAD_WIDTH[t.highway];const key=String(Math.round(w*2)/2);if(kind==='road')(roads[key]??=[]).push(enc(dp(p,2)));else pathPts.push({w:Math.round(w*2)/2,p:dp(p,2)});}}
  if(t.natural==='cliff'){const p=pts(e.nodes);if(p&&p.some(q=>inBox(q,M)))cliffs.push(enc(dp(p,2)));}
  if(t.barrier==='city_wall'){const p=pts(e.nodes);if(p&&p.some(q=>inBox(q,M)))walls.push(enc(dp(p,2)));}
 }
 if(e.type==='relation'&&t.type==='multipolygon'){
  const cls=areaClass(t);if(!cls)continue;
  const member=(role:string)=>(e.members??[]).filter(m=>m.type==='way'&&m.role===role).map(m=>all.get(`way/${m.ref}`)?.nodes).filter((n):n is number[]=>!!n);
  if((e.members??[]).some(m=>m.type==='way'&&!all.has(`way/${m.ref}`)))console.error(`incomplete relation/${e.id}: fetch https://api.openstreetmap.org/api/0.6/relation/${e.id}/full.json`);
  const inner=rings(member('inner'));for(const o of rings(member('outer')))addArea(cls,o,inner);
 }
}
// A path is drawn only where it crosses mapped green ground (park paths); elsewhere it is paving on paving.
const pip=([x,z]:Pt,p:Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
for(const {w,p}of pathPts){const mids=p.slice(1).map((q,i):Pt=>[(q[0]+p[i][0])/2,(q[1]+p[i][1])/2]);if(mids.some(m=>green.some(g=>pip(m,g))))(paths[String(w)]??=[]).push(enc(p));}
// The Castle's walls: every barrier=wall / retaining_wall way with most of its nodes inside the castle precinct (way/4301292,
// historic=castle). 1 if OSM tags it wall=castle_wall (a curtain wall), else 0. No heights are mapped: the renderer's are ASSUMED.
const castle=pts(get(4301292).nodes!)!,castleWalls:[number,number[]][]=[];
for(const e of all.values()){const t=e.tags??{};if(e.type!=='way'||!e.nodes||t.barrier!=='wall'&&t.barrier!=='retaining_wall'&&t.barrier!=='city_wall')continue;
 const p=pts(e.nodes);if(!p||p.filter(q=>pip(q,castle)).length*2<=p.length)continue;castleWalls.push([t.wall==='castle_wall'?1:0,enc(dp(p,1))]);}
// mapped trees, with the two size tags OSM carries here: leaf_type (needleleaved is narrow) and height (m)
const pairs:[number,number,string,number][]=[];
for(const e of all.values())if(e.type==='node'&&e.tags?.natural==='tree'&&e.lat!==undefined&&e.lon!==undefined){const p=project(e.lat,e.lon!,origin) as Pt;
 if(inBox(p,0))pairs.push([Math.round(p[0]/Q),Math.round(p[1]/Q),e.tags.leaf_type??'',Number(e.tags.height)>0?Number(e.tags.height):0]);}
// trees as one delta run, sorted west to east for compression; treeTags: [index in the run, 1 if needleleaved else 0, height m or 0]
pairs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
const treeRun:number[]=[],treeTags:number[][]=[];{let px=0,pz=0;pairs.forEach(([x,z,leaf,h],i)=>{treeRun.push(x-px,z-pz);px=x;pz=z;if(leaf==='needleleaved'||h)treeTags.push([i,leaf==='needleleaved'?1:0,h]);});}
const out={
 attribution:'© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',
 source:'OSM map API snapshot of tools/build-waverley.ts (four tiles, fetched 2026-11-09); land use, leisure and natural areas, highways (no tunnels, bridges or indoor), natural=tree nodes, natural=cliff and barrier=city_wall ways, and the walls inside the Edinburgh Castle precinct (way/4301292)',
 q:Q,extent:LANDUSE_EXTENT,areas,roads,paths,trees:treeRun,treeTags,cliffs,walls,castleWalls,
};
const json=JSON.stringify(out)+'\n';
writeFileSync('web/src/data/waverley-city-landuse.json',json);
// ---- web/src/data/waverley-roads.json: every OSM highway line for the street lamps (the lighting element, core/streetlights.ts) ----
// The lamp-bearing classes only (LAMP_ROADS) plus any way on a bridge (flagged: North and Waverley Bridges carry lamps), each with
// its OSM highway class; tunnels and indoor ways are left out. Lines are clipped to the terrain extent, so every point is inside the
// scene, simplified (Douglas-Peucker 0.5 m) and rounded to 0.5 m. Nothing in W3 draws from it.
const ex=LANDUSE_EXTENT,inside=(p:Pt)=>p[0]>=ex.x0&&p[0]<=ex.x1&&p[1]>=ex.z0&&p[1]<=ex.z1;
/** Liang-Barsky: the part of segment a-b inside the extent, or undefined. */
const clipSeg=(a:Pt,b:Pt):[Pt,Pt]|undefined=>{let t0=0,t1=1;const dx=b[0]-a[0],dz=b[1]-a[1];
 for(const [p,q]of [[-dx,a[0]-ex.x0],[dx,ex.x1-a[0]],[-dz,a[1]-ex.z0],[dz,ex.z1-a[1]]] as [number,number][]){if(p===0){if(q<0)return undefined;continue;}const r=q/p;if(p<0){if(r>t1)return undefined;t0=Math.max(t0,r);}else{if(r<t0)return undefined;t1=Math.min(t1,r);}}
 return [[a[0]+t0*dx,a[1]+t0*dz],[a[0]+t1*dx,a[1]+t1*dz]];};
const r1=(p:Pt):Pt=>[Math.round(p[0]*2)/2,Math.round(p[1]*2)/2];
/** The classes that carry street lamps; footways, steps, paths, cycleways and tracks are left out unless they are on a bridge. */
export const LAMP_ROADS=new Set(['primary','primary_link','secondary','secondary_link','tertiary','tertiary_link','unclassified','residential','service','pedestrian']);
const roadLines:{id:string;highway:string;name?:string;bridge?:true;path:Pt[]}[]=[];
for(const e of all.values()){
 const t=e.tags??{};if(e.type!=='way'||!e.nodes||!t.highway||t.area==='yes'||t.tunnel&&t.tunnel!=='no'||t.indoor==='yes'||t.highway==='corridor'||t.highway==='elevator'||t.highway==='proposed'||t.highway==='construction')continue;
 const bridge=!!t.bridge&&t.bridge!=='no';if(!LAMP_ROADS.has(t.highway)&&!bridge)continue;
 const p=pts(e.nodes);if(!p)continue;
 let run:Pt[]=[];const flush=()=>{if(run.length>1){const path=dp(run,.5).map(r1);roadLines.push({id:`way/${e.id}`,highway:t.highway,...t.name?{name:t.name}:{},...bridge?{bridge:true as const}:{},path});}run=[];};
 for(let i=1;i<p.length;i++){const c=clipSeg(p[i-1],p[i]);if(!c){flush();continue;}
  if(!run.length||run.at(-1)![0]!==c[0][0]||run.at(-1)![1]!==c[0][1]){flush();run.push(c[0]);}run.push(c[1]);if(!inside(p[i]))flush();}
 flush();
}
roadLines.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
const roadsJson=JSON.stringify({attribution:'© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',licence:'ODbL 1.0, https://opendatacommons.org/licenses/odbl/1-0/',
 source:'OSM map API snapshot of tools/build-waverley.ts (four tiles, fetched 2026-11-09); highway=primary, secondary, tertiary (and _link), unclassified, residential, service and pedestrian ways, plus any highway way on a bridge; no tunnels, indoor ways or areas; clipped to the terrain extent; Douglas-Peucker 0.5 m; 0.5 m rounding',
 frame:'Waverley local metres: x east, z south, origin 55.9519018 N, 3.1904199 W (core/geo.ts project)',extent:LANDUSE_EXTENT,roads:roadLines})+'\n';
writeFileSync('web/src/data/waverley-roads.json',roadsJson);
console.log(JSON.stringify({roadLines:roadLines.length,classes:Object.fromEntries([...new Set(roadLines.map(r=>r.highway))].map(h=>[h,roadLines.filter(r=>r.highway===h).length])),bytes:roadsJson.length,gzip:gzipSync(roadsJson,{level:9}).length}));
console.log(JSON.stringify({areas:Object.fromEntries(Object.entries(areas).map(([k,v])=>[k,v.length])),roads:Object.values(roads).flat().length,paths:Object.values(paths).flat().length,trees:pairs.length,cliffs:cliffs.length,walls:walls.length,castleWalls:castleWalls.length,bytes:json.length,gzip:gzipSync(json,{level:9}).length}));
