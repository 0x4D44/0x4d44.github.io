// P3 city ground for Perth: OSM land use, water, streets and park paths, mapped trees and cliffs, the viewing places, and the Tay's
// bridges, from the same public OSM snapshot as the scene (tools/build-perth.ts, six map-API tiles). Run from kings-cross-src:
//   node tools/build-perth-city-landuse.ts <raw-osm-dir> [<dir holding relation-<id>.json>]
// writes web/src/data/perth-city-landuse.json, read by web/src/perth-city-ground.ts. © OpenStreetMap contributors, ODbL 1.0.
// The ground classes and the file layout are Waverley's (tools/build-waverley-city-landuse.ts, read by waverley-city-ground.ts), so the
// Waverley ground builder draws Perth's: rings and lines simplified (Douglas-Peucker, 2 m) and stored as delta integers at 2 m. Nothing is
// invented: every polygon, line, tree and cliff is a mapped OSM feature with its tags' class. Perth adds `bridges`: the Tay viaduct's
// mapped path (way/4438951) and the mapped road-bridge outlines and carriageways over the river.
import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {gzipSync} from 'node:zlib';
import {project} from '../core/geo.ts';
import type {Pt} from '../core/geo.ts';
import {PERTH_ORIGIN} from '../core/perth-data.ts';
import {PERTH_TERRAIN_EXTENT} from './build-perth-terrain.ts';
const dir=process.argv[2]??'../.scratch/perth/osm',extra=process.argv[3];
type Element={type:string;id:number;lat?:number;lon?:number;nodes?:number[];tags?:Record<string,string>;members?:{type:string;ref:number;role:string}[]};
const all=new Map<string,Element>();
// The six tiles, plus any relation-<id>.json (the API's relation/<id>/full.json) in either directory for a multipolygon the tiles hold
// incompletely (relation/7398146, a Kinnoull Hill wood).
const files=[...readdirSync(dir).filter(f=>/^[ns]\d\.json$/.test(f)||/^relation-\d+\.json$/.test(f)).map(f=>`${dir}/${f}`),...extra?readdirSync(extra).filter(f=>/^relation-\d+\.json$/.test(f)).map(f=>`${extra}/${f}`):[]];
for(const f of files)for(const e of JSON.parse(readFileSync(f,'utf8')).elements as Element[])all.set(`${e.type}/${e.id}`,e);
const EXT=PERTH_TERRAIN_EXTENT,Q=2,M=40;
const pts=(ids:number[]):Pt[]|undefined=>{const out:Pt[]=[];for(const id of ids){const n=all.get(`node/${id}`);if(n?.lat===undefined||n.lon===undefined)return undefined;out.push(project(n.lat,n.lon,PERTH_ORIGIN) as Pt);}return out;};
type AreaClass='park'|'grass'|'garden'|'wood'|'scrub'|'water'|'rock'|'paved'|'flower'|'pitch';
/** Waverley's classes (build-waverley-city-landuse.ts areaClass), plus the rural classes Perth's cut holds: farmland, golf, allotments,
 *  orchard (grass or park), and sand (the Tay's shingle, as rock). */
function areaClass(t:Record<string,string>):AreaClass|undefined{
 if(t.building||t['building:part'])return undefined;
 if(t.natural==='water'||t.water||t.leisure==='swimming_pool')return 'water';
 if(t.natural==='wood'||t.landuse==='forest')return 'wood';
 if(t.natural==='scrub'||t.natural==='heath')return 'scrub';
 if(t.natural==='bare_rock'||t.natural==='scree'||t.natural==='rock'||t.natural==='sand'||t.natural==='shingle')return 'rock';
 if(t.landuse==='flowerbed')return 'flower';
 if(t.leisure==='pitch'&&t.surface&&!/grass/.test(t.surface))return 'paved';
 if(t.leisure==='pitch')return 'pitch';
 if(t.leisure==='garden'||t.landuse==='allotments'||t.landuse==='orchard')return 'garden';
 if(t.landuse==='grass'||t.landuse==='village_green'||t.landuse==='recreation_ground'||t.leisure==='golf_course'||t.leisure==='park'&&t.opening_hours)return 'grass';
 if(t.leisure==='park'||t.landuse==='meadow'||t.natural==='grassland'||t.landuse==='cemetery'||t.amenity==='grave_yard'||t.landuse==='farmland')return 'park';
 // ASSUMED: Perth's residential land (51 polygons: Bridgend, Craigie, Kinnoull's lower slopes) is houses in their gardens, not the paved
 // town centre Waverley's base paving stands for; its ground between the mapped houses and streets is drawn as unmown grass.
 if(t.landuse==='residential')return 'park';
 return undefined;
}
/** Carriageway or path width by highway class, metres: Waverley's ASSUMED widths, plus trunk roads. Paths from the OSM width tag when mapped. */
const ROAD_WIDTH:Record<string,number>={trunk:11,trunk_link:8.5,primary:11,primary_link:8.5,secondary:10,secondary_link:8.5,tertiary:8.5,tertiary_link:7,unclassified:7,residential:7,living_street:6,service:4.5,pedestrian:5,footway:2.5,path:2.5,cycleway:2.5,bridleway:2.5,track:3,steps:2.5};
const roadKind=(t:Record<string,string>):'road'|'path'|undefined=>{
 const h=t.highway;if(!h||!(h in ROAD_WIDTH)||t.area==='yes')return undefined;
 if(t.tunnel&&t.tunnel!=='no'||t.bridge&&t.bridge!=='no'||Number(t.layer??0)!==0||t.indoor==='yes'||t.level&&Number(t.level)<0)return undefined;
 if(t.footway==='sidewalk'||t.footway==='crossing')return undefined;
 return ['footway','path','cycleway','bridleway','track','steps'].includes(h)?'path':'road';
};
const inBox=(p:Pt,m:number)=>p[0]>=EXT.x0-m&&p[0]<=EXT.x1+m&&p[1]>=EXT.z0-m&&p[1]<=EXT.z1+m;
function dp(p:Pt[],tol:number):Pt[]{
 if(p.length<3)return p;const keep=new Uint8Array(p.length);keep[0]=keep[p.length-1]=1;const stack:[number,number][]=[[0,p.length-1]];
 while(stack.length){const [a,b]=stack.pop()!;let best=-1,at=-1;const [ax,az]=p[a]!,[bx,bz]=p[b]!,dx=bx-ax,dz=bz-az,l=Math.hypot(dx,dz)||1;
  for(let i=a+1;i<b;i++){const d=Math.abs((p[i]![0]-ax)*dz-(p[i]![1]-az)*dx)/l;if(d>best){best=d;at=i;}}
  if(best>tol){keep[at]=1;stack.push([a,at],[at,b]);}}
 return p.filter((_,i)=>keep[i]);
}
const enc=(p:Pt[]):number[]=>{const out:number[]=[];let px=0,pz=0;for(const [x,z]of p){const qx=Math.round(x/Q),qz=Math.round(z/Q);out.push(qx-px,qz-pz);px=qx;pz=qz;}return out;};
function rings(ways:number[][]):number[][]{
 const open=ways.map(w=>[...w]),out:number[][]=[];
 while(open.length){let r=open.shift()!;let grown=true;
  while(r[0]!==r.at(-1)&&grown){grown=false;
   for(let i=0;i<open.length;i++){const w=open[i]!;
    if(w[0]===r.at(-1)){r=[...r,...w.slice(1)];}else if(w.at(-1)===r.at(-1)){r=[...r,...[...w].reverse().slice(1)];}
    else if(w.at(-1)===r[0]){r=[...w,...r.slice(1)];}else if(w[0]===r[0]){r=[...[...w].reverse(),...r.slice(1)];}else continue;
    open.splice(i,1);grown=true;break;}}
  if(r[0]===r.at(-1)&&r.length>3)out.push(r);
 }
 return out;
}
const areas:Record<AreaClass,number[][][]>={park:[],grass:[],garden:[],wood:[],scrub:[],water:[],rock:[],paved:[],flower:[],pitch:[]};
const green:Pt[][]=[];
const addArea=(cls:AreaClass,outer:number[],holes:number[][])=>{
 const o=pts(outer);if(!o||!o.some(p=>inBox(p,0)))return;
 const tol=cls==='garden'?3:2,hs=holes.map(pts).filter((h):h is Pt[]=>!!h).map(h=>enc(dp(h.slice(0,-1),tol)));
 const s=dp(o.slice(0,-1),tol);if(s.length<3)return;areas[cls].push([enc(s),...hs]);if(cls!=='water'&&cls!=='rock'&&cls!=='paved')green.push(s);
};
const roads:Record<string,number[][]>={},paths:Record<string,number[][]>={},pathPts:{w:number;p:Pt[]}[]=[],cliffs:number[][]=[];
for(const e of all.values()){
 const t=e.tags??{};
 if(e.type==='way'&&e.nodes){
  const closed=e.nodes[0]===e.nodes.at(-1),cls=closed?areaClass(t):undefined;
  if(cls)addArea(cls,e.nodes,[]);
  const kind=roadKind(t);
  if(kind){const p=pts(e.nodes);if(p&&p.some(q=>inBox(q,M))){const w=Number(t.width)>0&&Number(t.width)<30?Number(t.width):ROAD_WIDTH[t.highway!]!;const key=String(Math.round(w*2)/2);if(kind==='road')(roads[key]??=[]).push(enc(dp(p,2)));else pathPts.push({w:Math.round(w*2)/2,p:dp(p,2)});}}
  if(t.natural==='cliff'){const p=pts(e.nodes);if(p&&p.some(q=>inBox(q,M)))cliffs.push(enc(dp(p,2)));}
 }
 if(e.type==='relation'&&t.type==='multipolygon'){
  const cls=areaClass(t);if(!cls)continue;
  const member=(role:string)=>(e.members??[]).filter(m=>m.type==='way'&&m.role===role).map(m=>all.get(`way/${m.ref}`)?.nodes).filter((n):n is number[]=>!!n);
  if((e.members??[]).some(m=>m.type==='way'&&!all.has(`way/${m.ref}`)))console.error(`incomplete relation/${e.id} (${cls}): drawn from its complete rings only`);
  const inner=rings(member('inner'));for(const o of rings(member('outer')))addArea(cls,o,inner);
 }
}
const pip=([x,z]:Pt,p:Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i]![1]>z)!==(p[j]![1]>z)&&x<(p[j]![0]-p[i]![0])*(z-p[i]![1])/(p[j]![1]-p[i]![1])+p[i]![0])yes=!yes;return yes;};
for(const {w,p}of pathPts){const mids=p.slice(1).map((q,i):Pt=>[(q[0]+p[i]![0])/2,(q[1]+p[i]![1])/2]);if(mids.some(m=>green.some(g=>pip(m,g))))(paths[String(w)]??=[]).push(enc(p));}
const outlooks:number[][]=[];
for(const e of all.values()){const t=e.tags??{};
 if(e.type==='node'&&(t.tourism==='viewpoint'||t.natural==='peak')&&e.lat!==undefined&&e.lon!==undefined){const p=project(e.lat,e.lon!,PERTH_ORIGIN) as Pt;if(inBox(p,0))outlooks.push(enc([p]));}}
const pairs:[number,number,string,number][]=[];
for(const e of all.values())if(e.type==='node'&&e.tags?.natural==='tree'&&e.lat!==undefined&&e.lon!==undefined){const p=project(e.lat,e.lon!,PERTH_ORIGIN) as Pt;
 if(inBox(p,0))pairs.push([Math.round(p[0]/Q),Math.round(p[1]/Q),e.tags.leaf_type??'',Number(e.tags.height)>0?Number(e.tags.height):0]);}
pairs.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
const treeRun:number[]=[],treeTags:number[][]=[];{let px=0,pz=0;pairs.forEach(([x,z,leaf,h],i)=>{treeRun.push(x-px,z-pz);px=x;pz=z;if(leaf==='needleleaved'||h)treeTags.push([i,leaf==='needleleaved'?1:0,h]);});}
// ---- the Tay's bridges ------------------------------------------------------------------------------------------------------------
// The railway viaduct's mapped path (way/4438951, bridge:name Tay Viaduct) at 0.5 m, and the mapped bridge outlines (man_made=bridge:
// Perth Bridge, Queen's Bridge) with their carriageways (the highway ways on them, bridge=yes), each with its OSM name and structure;
// an outline holding the viaduct's path is the railway's own and is left out.
const r1=(p:Pt):Pt=>[Math.round(p[0]*2)/2,Math.round(p[1]*2)/2];
const viaduct=pts(all.get('way/4438951')!.nodes!)!.map(r1);
const water=areas.water.map(([o])=>{let x=0,z=0;return o!.reduce<Pt[]>((a,_,i)=>{if(i%2)return a;x+=o![i]!;z+=o![i+1]!;a.push([x*Q,z*Q]);return a;},[]);});
const overWater=(p:Pt[])=>p.some((a,i)=>i>0&&water.some(w=>pip([(a[0]+p[i-1]![0])/2,(a[1]+p[i-1]![1])/2],w)));
const roadBridges:{id:string;name:string;structure:string;outline:Pt[];decks:{id:string;width:number;line:Pt[]}[]}[]=[];
for(const e of all.values()){const t=e.tags??{};if(e.type!=='way'||t.man_made!=='bridge'||!e.nodes)continue;
 const o=pts(e.nodes);if(!o||!overWater(o))continue;
 // the railway's own bridge outline (way/611293698 traces the viaduct's curve) is the viaduct, drawn by tayViaduct, not a road bridge
 if(viaduct.some(q=>pip(q,o)))continue;
 const outline=o.slice(0,-1).map(r1);
 const decks=[...all.values()].filter(h=>h.type==='way'&&h.tags?.highway&&h.tags.bridge&&h.tags.bridge!=='no'&&h.nodes).map(h=>({h,p:pts(h.nodes!)!})).filter(({p})=>p&&p.some(q=>pip(q,o)))
  .map(({h,p})=>({id:`way/${h.id}`,width:Number(h.tags!.width)>0?Number(h.tags!.width):ROAD_WIDTH[h.tags!.highway!]??7,line:p.map(r1)}));
 roadBridges.push({id:`way/${e.id}`,name:t.name??'',structure:t['bridge:structure']??'',outline,decks});}
const out={
 attribution:'© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',
 source:'OSM map API snapshot of tools/build-perth.ts (six tiles, fetched 2026-11-10); land use, leisure and natural areas (the Tay: relation/956087 and way/82223450, natural=water water=river), highways (no tunnels, bridges or indoor), natural=tree nodes, natural=cliff ways, viewpoint and peak nodes (outlooks); bridges: the Tay viaduct way/4438951 and the man_made=bridge outlines over water with their carriageways',
 q:Q,extent:EXT,areas,roads,paths,trees:treeRun,treeTags,cliffs,walls:[] as number[][],castleWalls:[] as [number,number[]][],outlooks,
 bridges:{viaduct:{id:'way/4438951',line:viaduct},roads:roadBridges},
};
const json=JSON.stringify(out)+'\n';
writeFileSync(new URL('../web/src/data/perth-city-landuse.json',import.meta.url),json);
console.log(JSON.stringify({areas:Object.fromEntries(Object.entries(areas).map(([k,v])=>[k,v.length])),roads:Object.values(roads).flat().length,paths:Object.values(paths).flat().length,trees:pairs.length,cliffs:cliffs.length,outlooks:outlooks.length,viaduct:viaduct.length,roadBridges:roadBridges.map(b=>`${b.id} ${b.name} ${b.structure} decks ${b.decks.map(d=>d.id).join(',')}`),bytes:json.length,gzip:gzipSync(json,{level:9}).length}));
