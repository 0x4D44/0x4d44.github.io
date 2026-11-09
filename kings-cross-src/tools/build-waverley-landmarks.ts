// Public OSM-only offline extraction, one JSON per element. Run from kings-cross-src:
// node tools/build-waverley-landmarks.ts ../.scratch/b44/osm
// writes web/src/data/waverley-frontage.json (the two bridges and the Balmoral tower: W2, waverley-frontage.ts) and
// web/src/data/waverley-city.json (the Scott Monument and its parts: W3, waverley-city.ts). The lead owns this script and reruns it
// when an element asks for a new OSM feature.
import {readFileSync,writeFileSync} from 'node:fs';
import {project} from '../core/geo.ts';
import type {Pt} from '../core/geo.ts';
const dir=process.argv[2]??'../.scratch/b44/osm';
type Element={type:string;id:number;lat?:number;lon?:number;nodes?:number[];tags?:Record<string,string>};
const all=new Map<string,Element>();
for(const name of ['sw','se','nw','ne'])for(const e of JSON.parse(readFileSync(`${dir}/${name}.json`,'utf8')).elements as Element[])all.set(`${e.type}/${e.id}`,e);
const origin={lat:55.9519018,lon:-3.1904199};
const ring=(e:Element):Pt[]=>e.nodes!.map(id=>{const n=all.get(`node/${id}`)!;if(n?.lat===undefined||n.lon===undefined)throw Error(`Missing node ${id}`);return project(n.lat,n.lon,origin).map(x=>Math.round(x*1000)/1000) as Pt;}).slice(0,-1);
const get=(id:number)=>all.get(`way/${id}`)!;
const scottRing=ring(get(39044819));
const inside=([x,z]:Pt,p:Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const scott=[...all.values()].filter(e=>e.type==='way'&&e.tags?.['building:part']&&e.nodes?.length&&e.tags.height).filter(e=>{const p=ring(e);return inside([p.reduce((s,q)=>s+q[0],0)/p.length,p.reduce((s,q)=>s+q[1],0)/p.length],scottRing);}).map(e=>({id:`way/${e.id}`,ring:ring(e),height:Number(e.tags!.height),minHeight:Number(e.tags!.min_height??0),roofHeight:Number(e.tags!['roof:height']??0),roofShape:e.tags!['roof:shape']??'flat'}));
if(scott.length<30)throw Error('Scott part extraction unexpectedly incomplete');
const head={origin,attribution:'© OpenStreetMap contributors (ODbL)'};
const frontage={...head,bridges:[380552925,377738788].map(id=>({id:`way/${id}`,name:get(id).tags!.name,layer:Number(get(id).tags!.layer),ring:ring(get(id))})),balmoral:{id:'way/313744197',parentId:'relation/14213049',height:58,clockDiameter:3.2,ring:ring(get(313744197))}};
const city={...head,scott:{id:'way/39044819',height:61.11,ring:scottRing,parts:scott}};
writeFileSync('web/src/data/waverley-frontage.json',JSON.stringify(frontage)+'\n');
writeFileSync('web/src/data/waverley-city.json',JSON.stringify(city)+'\n');
console.log(`Extracted ${scott.length} Scott parts, two bridges and Balmoral tower`);
