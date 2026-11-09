import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWaverleyScene, WAVERLEY_ORIGIN, WAVERLEY_BBOX, packWaverleyScene, unpackWaverleyScene } from '../waverley-data.ts';
import { project, unproject } from '../geo.ts';
import type { Pt } from '../geo.ts';
const source = { url:'test', fetchedAt:'test', sha256:'test', license:'ODbL', query:'test' };
test('uses explicit Edinburgh projection and excludes trams/outside ways', () => {
  const data = buildWaverleyScene({elements:[
    {type:'way',id:1,tags:{railway:'rail',layer:'-1'},geometry:[{lat:55.952,lon:-3.19},{lat:55.9521,lon:-3.19}]},
    {type:'way',id:2,tags:{railway:'tram'},geometry:[{lat:55.952,lon:-3.19},{lat:55.9521,lon:-3.19}]},
    {type:'way',id:3,tags:{railway:'rail'},geometry:[{lat:55.9,lon:-3.3},{lat:55.91,lon:-3.3}]},
  ]},source);
  assert.equal(data.rails.length,1); assert.equal(data.rails[0].tags.layer,'-1');
  const expected=project(55.952,-3.19,WAVERLEY_ORIGIN);
  assert.ok(Math.hypot(data.rails[0].path[0][0]-expected[0],data.rails[0].path[0][1]-expected[1])<0.08);
});
test('Edinburgh coordinates round-trip through the exported local frame within quantization error', () => {
  const points=[{lat:55.948,lon:-3.204},{lat:55.9519018,lon:-3.1904199},{lat:55.957,lon:-3.174}];
  const data=buildWaverleyScene({elements:[{type:'way',id:1,tags:{railway:'rail'},geometry:points}]},source);
  assert.deepEqual(data.origin,{lat:55.9519018,lon:-3.1904199});
  for(const [i,p] of data.rails[0].path.entries()){
    const restored=unproject(...p,data.origin),expected=points[i];
    assert.ok(Math.abs(restored.lat-expected.lat)<0.0000005,`latitude ${i} survives the local frame`);
    assert.ok(Math.abs(restored.lon-expected.lon)<0.0000009,`longitude ${i} survives the local frame`);
  }
});
test('committed geometry intersects the approved bbox; spill is confined to whole features and no tram survives',()=>{
  const data=unpackWaverleyScene(JSON.parse(readFileSync(new URL('../../web/src/data/waverley-scene.json',import.meta.url),'utf8')));
  assert.deepEqual(data.bbox,WAVERLEY_BBOX);
  const [south,west,north,east]=WAVERLEY_BBOX;
  // Independent latitude/longitude oracle, with 0.12m tolerance for 0.1m quantization.
  const corners:Pt[]=[[west-0.000002,south-0.000001],[east+0.000002,south-0.000001],[east+0.000002,north+0.000001],[west-0.000002,north+0.000001]];
  const within=([x,z]:Pt)=>x>=corners[0][0]&&x<=corners[1][0]&&z>=corners[0][1]&&z<=corners[2][1];
  const cross=(a:Pt,b:Pt,p:Pt)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const hits=(a:Pt,b:Pt,c:Pt,d:Pt)=>Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1])&&cross(a,b,c)*cross(a,b,d)<=0&&cross(c,d,a)*cross(c,d,b)<=0;
  const contains=(p:Pt,ring:Pt[])=>{let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>p[1])!==(ring[j][1]>p[1])&&p[0]<(ring[j][0]-ring[i][0])*(p[1]-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;};
  for(const feature of [...data.rails,...data.platforms,...data.roofs,...data.buildings]){
    const path='path' in feature?feature.path:feature.outer,closed=!data.rails.includes(feature as typeof data.rails[number]);
    const ll=path.map(([x,z]):Pt=>{const p=unproject(x,z,data.origin);return [p.lon,p.lat];});
    const segments=ll.slice(1).map((p,i)=>[ll[i],p]);if(closed)segments.push([ll.at(-1)!,ll[0]]);
    const intersects=ll.some(within)||segments.some(([a,b])=>corners.some((c,i)=>hits(a,b,c,corners[(i+1)%4])))||(closed&&corners.some(c=>contains(c,ll)));
    assert.ok(intersects,`${feature.id} is wholly outside the approved bbox`);
    assert.notEqual(feature.tags.railway,'tram',`${feature.id} must not be a tram`);
    assert.notEqual(feature.tags.tram,'yes',`${feature.id} must not carry tram=yes`);
  }
  // Selection must keep crossing ways intact, not truncate at the bbox edge.
  const line=[{lat:55.952,lon:-3.21},{lat:55.952,lon:-3.17}];
  const selected=buildWaverleyScene({elements:[{type:'way',id:1,tags:{railway:'rail'},geometry:line}]},source);
  assert.equal(selected.rails[0].path.length,2);
  assert.ok(unproject(...selected.rails[0].path[0],selected.origin).lon<west);
  assert.ok(unproject(...selected.rails[0].path[1],selected.origin).lon>east);
});
test('committed OSM preserves 20 platform numbers, 23 polygons and roof hole', () => {
  const data=unpackWaverleyScene(JSON.parse(readFileSync(new URL('../../web/src/data/waverley-scene.json',import.meta.url),'utf8')));
  assert.equal(data.platforms.length,23);
  const refs=data.platforms.map((p:{ref?:string})=>p.ref).filter((ref):ref is string=>ref!==undefined);
  assert.equal(refs.length,22); assert.equal(new Set(refs.map((r:string)=>parseInt(r))).size,20);
  for(const ref of ['8e','8w','9e','9w']) assert.ok(refs.includes(ref));
  const roof=data.roofs.find((r:{id:string})=>r.id==='relation/240040');
  assert.ok(roof);assert.equal(roof.holes.length,1); assert.ok(roof.holes[0].length>10);
  assert.ok(!data.buildings.some((b:{id:string})=>b.id==='way/5208866'));
  assert.equal(data.platforms.filter((p:{ref?:string})=>!p.ref).length,1);
});
test('compact scene excludes unrelated OSM metadata and stays within 120kB gzip', async () => {
  const {gzipSync}=await import('node:zlib');
  const text=readFileSync(new URL('../../web/src/data/waverley-scene.json',import.meta.url));
  const scene=unpackWaverleyScene(JSON.parse(text.toString()));
  const tags=[...scene.rails,...scene.platforms,...scene.roofs,...scene.buildings].flatMap((e:{tags:Record<string,string>})=>Object.keys(e.tags));
  assert.ok(!tags.some((t:string)=>t.startsWith('addr:')||t.startsWith('contact:')||t==='source'));
  assert.ok(gzipSync(text,{level:9}).length<=120000);
});
test('joins fragmented roof rings, preserves holes and height provenance, and deduplicates outer ways',()=>{
  const CLOSED=true;
  const a={lat:55.952,lon:-3.19},b={lat:55.952,lon:-3.189},c={lat:55.953,lon:-3.189},d={lat:55.953,lon:-3.19};
  const h=[{lat:55.9522,lon:-3.1898},{lat:55.9522,lon:-3.1896},{lat:55.9524,lon:-3.1896},{lat:55.9524,lon:-3.1898}];
  const data=buildWaverleyScene({elements:[
    {type:'way',id:10,tags:{building:'train_station'},geometry:[a,b,c]},
    {type:'way',id:11,geometry:[c,d,...(CLOSED?[a]:[])]},
    {type:'way',id:12,tags:{building:'train_station','building:levels':'2'},geometry:[...h,h[0]]},
    {type:'relation',id:20,tags:{type:'multipolygon',building:'roof',height:'30 ft',min_height:'2',layer:'1'},members:[{type:'way',ref:10,role:'outer'},{type:'way',ref:11,role:'outer'},{type:'way',ref:12,role:'inner'}]},
    {type:'way',id:30,tags:{railway:'rail',source:'must strip'},geometry:[{lat:55.952,lon:-3.21},{lat:55.952,lon:-3.17}]},
  ]},source);
  assert.equal(data.roofs.length,1);assert.equal(data.roofs[0].holes.length,1);
  assert.equal(data.roofs[0].height,9.14);assert.equal(data.roofs[0].minHeight,2);
  assert.equal(data.roofs[0].tags.layer,'1');assert.match(data.roofs[0].heightBasis,/OSM height/);
  assert.equal(data.buildings.length,1);assert.equal(data.buildings[0].height,6);
  assert.match(data.buildings[0].heightBasis,/ASSUMED 3m per OSM building:levels/);
  assert.equal(data.rails.length,1);assert.equal(data.rails[0].tags.source,undefined);
  assert.deepEqual(data.warnings,[]);
});

test('delta packing round-trips signed geometry and height provenance losslessly',()=>{
 const data=buildWaverleyScene({elements:[{type:'way',id:1,tags:{railway:'rail'},geometry:[{lat:55.952,lon:-3.19},{lat:55.9521,lon:-3.1901},{lat:55.9522,lon:-3.19}]}]},source);
 const packed=packWaverleyScene(data);
 assert.equal(packed.format,'waverley-varint-v1');assert.equal(packed.q,0.1);
 assert.equal(typeof packed.rails[0].path,'string');
 assert.deepEqual(unpackWaverleyScene(JSON.parse(JSON.stringify(packed))),data);
 assert.throws(()=>unpackWaverleyScene({...packed,q:0}),/format|quantization/);
});

test('varint decoder rejects truncated coordinate pairs and malformed base64',()=>{
 const scene=buildWaverleyScene({elements:[{type:'way',id:1,tags:{railway:'rail'},geometry:[{lat:55.952,lon:-3.21},{lat:55.952,lon:-3.17}]}]},source);
 const packed=packWaverleyScene(scene);
 assert.deepEqual(unpackWaverleyScene(packed),scene);
 const corrupt=(path:string)=>({...packed,rails:[{...packed.rails[0],path}]});
 assert.throws(()=>unpackWaverleyScene(corrupt('gA==')),/truncated varint/);
 assert.throws(()=>unpackWaverleyScene(corrupt('Ag==')),/coordinate pair/);
 assert.throws(()=>unpackWaverleyScene(corrupt('!invalid!')),/base64/);
});
