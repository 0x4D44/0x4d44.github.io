// node tools/build-waverley.ts --raw-dir ../.scratch/b44/osm
// Four bounded public OSM map requests avoid its 50,000-node limit; raw stays local.
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildWaverleyScene, packWaverleyScene, WAVERLEY_AREA } from '../core/waverley-data.ts';
import type { StationArea, WaverleyRawElement, WaverleySource } from '../core/waverley-data.ts';
export const WAVERLEY_TILES = [
  {name:'sw',bbox:[-3.205,55.9465,-3.189,55.952]},
  {name:'se',bbox:[-3.189,55.9465,-3.173,55.952]},
  {name:'nw',bbox:[-3.205,55.952,-3.189,55.9575]},
  {name:'ne',bbox:[-3.189,55.952,-3.173,55.9575]},
];
export async function buildWaverley(rawDir:string,out:string):Promise<void> {
  await buildStationOsm({tiles:WAVERLEY_TILES,site:WAVERLEY_AREA,rawDir,out,agent:'almanac-waverley-build/0.1'});
}
/** One station's OSM scene from bounded public map API tiles (tools/build-perth.ts uses it for Perth). Raw tiles stay in rawDir, outside git. */
export async function buildStationOsm({tiles,site,rawDir,out,agent}:{tiles:readonly {name:string;bbox:number[]}[];site:StationArea;rawDir:string;out:string;agent:string}):Promise<void> {
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
  const data=buildWaverleyScene({elements},source,site), json=JSON.stringify(packWaverleyScene(data))+'\n';
  await mkdir(path.dirname(out),{recursive:true});await writeFile(out,json);
  console.error(JSON.stringify({
    out,sha256:source.sha256,rails:data.rails.length,platforms:data.platforms.length,
    roofs:data.roofs.length,buildings:data.buildings.length,
    parts:data.buildings.filter(b=>b.kind==='part').length,bytes:Buffer.byteLength(json),
    gzip9:gzipSync(json,{level:9}).length,warnings:data.warnings,
  },null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),flag=(key:string)=>args[args.indexOf(key)+1];
  await buildWaverley(args.includes('--raw-dir')?flag('--raw-dir'):'../.scratch/b44/osm',
    args.includes('--out')?flag('--out'):'web/src/data/waverley-scene.json');
}
