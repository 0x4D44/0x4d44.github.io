// node tools/build-waverley.ts --raw-dir ../.scratch/b44/osm
// Four bounded public OSM map requests avoid its 50,000-node limit; raw stays local.
// node tools/build-waverley.ts --signals --raw-dir ../.scratch/b44/osm
// The OSM railway=signal overlay (web/src/data/waverley-signals.json) on the committed scene's track, from tiles already
// in --raw-dir: it never fetches, and it never rewrites the scene.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildWaverleyScene, packWaverleyScene, WAVERLEY_AREA } from '../core/waverley-data.ts';
import { decodeWaverleyAnchorScene, waverleyTrackData } from '../core/waverley-anchors.ts';
import { project, round } from '../core/geo.ts';
import type { KxData, RawElement } from '../core/osm.ts';
import { buildSignalOverlay, runtimeOverlay } from './build-signals.ts';
import type { SignalOverlay } from '../web/src/signals.ts';
import type { StationArea, WaverleyRawElement, WaverleyScene, WaverleySource } from '../core/waverley-data.ts';
export const WAVERLEY_TILES = [
  {name:'sw',bbox:[-3.205,55.9465,-3.189,55.952]},
  {name:'se',bbox:[-3.189,55.9465,-3.173,55.952]},
  {name:'nw',bbox:[-3.205,55.952,-3.189,55.9575]},
  {name:'ne',bbox:[-3.189,55.952,-3.173,55.9575]},
];
export async function buildWaverley(rawDir:string,out:string):Promise<void> {
  await buildStationOsm({tiles:WAVERLEY_TILES,site:WAVERLEY_AREA,rawDir,out,agent:'almanac-waverley-build/0.1'});
}
/** One station's OSM scene from bounded public map API tiles (tools/build-perth.ts uses it for Perth). Raw tiles stay in rawDir, outside git.
 *  `finish`, if given, trims the built scene in place before it is packed (tools/build-perth-west.ts keeps only the blocks the context scene lacks). */
export async function buildStationOsm({tiles,site,rawDir,out,agent,finish}:{tiles:readonly {name:string;bbox:number[]}[];site:StationArea;rawDir:string;out:string;agent:string;finish?:(scene:WaverleyScene)=>void}):Promise<void> {
  await mkdir(rawDir,{recursive:true});
  const hash=createHash('sha256'), elements:WaverleyRawElement[]=[], urls:string[]=[], times:number[]=[];
  async function load(name:string,url:string):Promise<void> {
    const file=path.join(rawDir,`${name}.json`);
    let raw:string;
    try {raw=await readFile(file,'utf8');}
    catch(error) {
      if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;
      console.error(`fetching ${url}`);
      const response=await fetch(url,{
        headers:{'User-Agent':agent},signal:AbortSignal.timeout(45000),
      });
      if(!response.ok)throw Error(`OSM map API HTTP ${response.status}: ${await response.text()}`);
      raw=await response.text();
      if(!Array.isArray(JSON.parse(raw).elements))throw Error('Invalid OSM map response');
      await writeFile(file,raw);
    }
    const parsed=JSON.parse(raw);
    if(!Array.isArray(parsed.elements))throw Error(`Invalid OSM snapshot ${file}`);
    hash.update(name+'\n'+raw+'\n');
    elements.push(...parsed.elements);urls.push(url);times.push((await stat(file)).mtimeMs);
  }
  for(const tile of tiles) {
    await load(tile.name,`https://api.openstreetmap.org/api/0.6/map.json?bbox=${tile.bbox.join(',')}`);
  }
  const provisional:WaverleySource={url:'',fetchedAt:'',sha256:'',license:'',query:''};
  // map API returns intersecting relations without all members. Fetch only the
  // explicitly missing building multipolygons, never routes or unrelated objects.
  const missing=buildWaverleyScene({elements},provisional,site).warnings;
  for(const warning of missing) {
    const id=warning.match(/^Incomplete building relation\/(\d+) omitted$/)?.[1];
    if(id)await load(`relation-${id}`,`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`);
  }
  const source:WaverleySource={
    url:urls.join('\n'),fetchedAt:new Date(Math.max(...times)).toISOString(),sha256:hash.digest('hex'),
    license:'ODbL 1.0, https://www.openstreetmap.org/copyright',
    query:`OSM map API ${tiles.length===4?'four':tiles.length} tiles covering south,west,north,east ${site.bbox.join(',')}; retain whole intersecting ways; complete missing building multipolygons via relation/full; 0.1m coordinate quantization; city footprints simplified up to 0.3m with topology checks; zigzag varint base64 signed delta encoding`,
  };
  const data=buildWaverleyScene({elements},source,site);finish?.(data);
  const json=JSON.stringify(packWaverleyScene(data))+'\n';
  await mkdir(path.dirname(out),{recursive:true});await writeFile(out,json);
  console.error(JSON.stringify({
    out,sha256:source.sha256,rails:data.rails.length,platforms:data.platforms.length,
    roofs:data.roofs.length,buildings:data.buildings.length,
    parts:data.buildings.filter(b=>b.kind==='part').length,bytes:Buffer.byteLength(json),
    gzip9:gzipSync(json,{level:9}).length,warnings:data.warnings,
  },null,2));
}
/**
 * The public signal overlay of a station scene: every OSM railway=signal node inside the site, on the scene's own track
 * (the graph its page and its relearn build, waverleyTrackData), through buildSignalOverlay as a through station.
 * OSM fields only: no berth is named here (the page binds a ref to its berth at runtime, by SIGNAL_REF_RULES), no review ledger applies.
 */
export function buildStationSignalOverlay(elements:readonly WaverleyRawElement[],packedScene:unknown,site:StationArea=WAVERLEY_AREA) {
  const track=waverleyTrackData(decodeWaverleyAnchorScene(packedScene));
  // a signal node on a rail is one of its vertices: the same projected, rounded point names the same track node
  const nodeAt=new Map(track.nodes.map(([id,x,z])=>[`${x},${z}`,id]));
  const [south,west,north,east]=site.bbox;
  const nodes=[...new Map(elements.filter(e=>e.type==='node'&&e.tags?.railway==='signal'&&e.lat!==undefined&&e.lon!==undefined).map(e=>[e.id,e])).values()]
    .filter(e=>e.lat!>=south&&e.lat!<=north&&e.lon!>=west&&e.lon!<=east).sort((a,b)=>a.id-b.id);
  const signals:KxData['signals']=nodes.map(e=>{
    const [x,z]=project(e.lat!,e.lon!,site.origin).map(v=>round(v)) as [number,number],tags=e.tags??{};
    return {id:e.id,x,z,kinds:Object.keys(tags).filter(k=>k.startsWith('railway:signal:')&&k!=='railway:signal:direction').map(k=>k.slice('railway:signal:'.length)).sort(),
      ...(tags.ref?{ref:tags.ref}:{}),...(tags['railway:signal:direction']?{direction:tags['railway:signal:direction']}:{})};
  });
  const result=buildSignalOverlay({...track,signals},{raw:nodes as RawElement[],reviews:[],platformRef:/./,serving:'platform-side',publicBerth:null,
    graphNode:s=>nodeAt.get(`${s.x},${s.z}`)});
  return {overlay:runtimeOverlay(result.overlay) as SignalOverlay,report:result.report};
}
const RAW_TILES=['sw','se','nw','ne'];
export async function buildWaverleySignals(rawDir:string,scenePath:string,out:string):Promise<void> {
  const elements:WaverleyRawElement[]=[];
  for(const name of RAW_TILES){
    const file=path.join(rawDir,`${name}.json`);
    let raw:string;
    try{raw=await readFile(file,'utf8');}
    catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')throw Error(`${file} missing: the signal build reads tiles already on disk and never fetches`);throw error;}
    const parsed=JSON.parse(raw);if(!Array.isArray(parsed.elements))throw Error(`Invalid OSM snapshot ${file}`);
    elements.push(...parsed.elements);
  }
  const {overlay,report}=buildStationSignalOverlay(elements,JSON.parse(await readFile(scenePath,'utf8')));
  await writeFile(out,JSON.stringify(overlay,null,2)+'\n');
  console.error(JSON.stringify({out,inputSignals:report.inputSignals,included:report.includedSignals,excluded:report.excludedSignals,counts:report.counts},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),flag=(key:string)=>args[args.indexOf(key)+1];
  if(args.includes('--signals'))await buildWaverleySignals(args.includes('--raw-dir')?flag('--raw-dir'):'../.scratch/b44/osm',
    args.includes('--scene')?flag('--scene'):'web/src/data/waverley-scene.json',args.includes('--out')?flag('--out'):'web/src/data/waverley-signals.json');
  else await buildWaverley(args.includes('--raw-dir')?flag('--raw-dir'):'../.scratch/b44/osm',
    args.includes('--out')?flag('--out'):'web/src/data/waverley-scene.json');
}
