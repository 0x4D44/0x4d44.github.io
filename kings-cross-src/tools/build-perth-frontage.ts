// P2 frontage data, owned by the frontage element (gfx-rubrics/perth-frontage.md). Run from kings-cross-src:
// node tools/build-perth-frontage.ts --raw-dir <the six raw OSM tiles tools/build-perth.ts cached>
// writes web/src/data/perth-frontage.json, read by web/src/perth-frontage.ts. It reads the same six public OSM map tiles as
// tools/build-perth.ts (their sha256 must equal perth-scene.json's source.sha256, so both files come from one snapshot) and keeps only
// what the frontage draws near the station: the car parks, the roads and paths, and the rail underbridge over King's Place (OSM
// man_made=bridge). Horizontal geometry is OpenStreetMap (ODbL), in Perth's frame (core/perth-data.ts). No Network Rail data is read.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {project} from '../core/geo.ts';
import type {Pt} from '../core/geo.ts';
import {PERTH_ORIGIN} from '../core/perth-data.ts';
import {PERTH_TILES} from './build-perth.ts';
import {FRONTAGE_WINDOW} from '../web/src/perth-frontage-street.ts';

/** The rail underbridge over King's Place (OSM man_made=bridge, layer 1), under the Tay Coast Line segments way/1260630143 and -144. */
export const KINGS_PLACE_BRIDGE='way/1260630142';
const KEEP_HIGHWAY=new Set(['primary','secondary','tertiary','residential','service','unclassified','footway','pedestrian','steps','cycleway','path']);

interface RawElement {type:string;id:number;lat?:number;lon?:number;nodes?:number[];tags?:Record<string,string>}
export interface PerthFrontageFile {
 attribution:string;source:{sha256:string;license:string;note:string};
 parking:{id:string;ring:number[][]}[];
 roads:{id:string;highway:string;name?:string;service?:string;surface?:string;path:number[][]}[];
 bridge:{id:string;ring:number[][]};
}

export function buildPerthFrontage(tiles:{name:string;raw:string}[]):PerthFrontageFile{
 const hash=createHash('sha256'),nodes=new Map<number,Pt>(),ways=new Map<number,RawElement>();
 for(const {name,raw} of tiles){hash.update(name+'\n'+raw+'\n');
  for(const e of (JSON.parse(raw) as {elements:RawElement[]}).elements){if(e.type==='node')nodes.set(e.id,project(e.lat!,e.lon!,PERTH_ORIGIN));else if(e.type==='way')ways.set(e.id,e);}}
 const W=FRONTAGE_WINDOW,inside=([x,z]:Pt)=>x>W.x0&&x<W.x1&&z>W.z0&&z<W.z1;
 const r2=(p:Pt[])=>p.map(q=>[Math.round(q[0]*100)/100,Math.round(q[1]*100)/100]);
 const out:PerthFrontageFile={attribution:'© OpenStreetMap contributors (ODbL)',source:{sha256:hash.digest('hex'),license:'ODbL 1.0',note:'the six tiles of tools/build-perth.ts'},parking:[],roads:[],bridge:{id:KINGS_PLACE_BRIDGE,ring:[]}};
 for(const w of [...ways.values()].sort((a,b)=>a.id-b.id)){
  const t=w.tags??{},pts=(w.nodes??[]).map(n=>nodes.get(n)).filter((p):p is Pt=>!!p);
  if(pts.length<2)continue;
  const id=`way/${w.id}`;
  if(id===KINGS_PLACE_BRIDGE){out.bridge.ring=r2(pts.slice(0,-1));continue;}
  if(!pts.some(inside))continue;
  if(t.amenity==='parking'&&t.parking==='surface'&&pts.length>3)out.parking.push({id,ring:r2(pts.slice(0,-1))});
  else if(t.highway&&KEEP_HIGHWAY.has(t.highway)&&t.area!=='yes'&&!t.tunnel&&!t.bridge)
   out.roads.push({id,highway:t.highway,...t.name?{name:t.name}:{},...t.service?{service:t.service}:{},...t.surface?{surface:t.surface}:{},path:r2(pts)});
 }
 if(!out.bridge.ring.length)throw Error(`${KINGS_PLACE_BRIDGE} missing from the tiles`);
 return out;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),flag=(k:string)=>args.includes(k)?args[args.indexOf(k)+1]:undefined;
 const rawDir=flag('--raw-dir')??'../.scratch/perth/osm',out=flag('--out')??'web/src/data/perth-frontage.json';
 const file=buildPerthFrontage(PERTH_TILES.map(t=>({name:t.name,raw:readFileSync(path.join(rawDir,`${t.name}.json`),'utf8')})));
 const scene=JSON.parse(readFileSync('web/src/data/perth-scene.json','utf8')) as {source:{sha256:string}};
 if(scene.source.sha256!==file.source.sha256)throw Error(`the tiles are not perth-scene.json's snapshot: ${file.source.sha256} != ${scene.source.sha256}`);
 writeFileSync(out,JSON.stringify(file)+'\n');
 console.log(`${out}: ${file.parking.length} car parks, ${file.roads.length} roads, bridge ${file.bridge.ring.length} points`);
}
