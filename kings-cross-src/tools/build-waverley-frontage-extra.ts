// W2 frontage extras: offline extraction from the committed Waverley scene data, owned by the W2 element. Run from kings-cross-src:
// node tools/build-waverley-frontage-extra.ts
// writes web/src/data/waverley-frontage-extra.json, read by waverley-frontage.ts beside the shared waverley-frontage.json
// (tools/build-waverley-landmarks.ts, lead-owned), which it leaves alone.
// Sources: every outline is OpenStreetMap (ODbL), taken from web/src/data/waverley-scene.json (tools/build-waverley.ts) exactly as the
// city draws it. The Waverley Bridge column points are derived, not mapped: placed by the rule below against the scene's own drawn
// tracks and platforms (OSM). No Network Rail data is read.
import {writeFileSync} from 'node:fs';
import type {Pt} from '../core/geo.ts';
import {unpackWaverleyScene} from '../core/waverley-data.ts';
import sceneFile from '../web/src/data/waverley-scene.json' with {type:'json'};
import frontage from '../web/src/data/waverley-frontage.json' with {type:'json'};
import {waverleyTrackSegments} from '../web/src/waverley-scene.ts';
import {WAVERLEY_BRIDGE_COLUMN,bridgeFrame} from '../web/src/waverley-frontage-bridges.ts';

const scene=unpackWaverleyScene(sceneFile as never);
const r=(p:readonly Pt[])=>p.map(q=>[Math.round(q[0]*1000)/1000,Math.round(q[1]*1000)/1000]);
const area=(id:string)=>{const b=scene.buildings.find(b=>b.id===id);if(!b)throw Error(`${id} missing from waverley-scene.json`);return b;};

// Waverley Bridge's seven plate-girder spans (HES LB30270) need six support lines; the span lengths are not published. A column is
// placed only where WAVERLEY_BRIDGE_COLUMN.allowed holds (on an island platform, its base clear of the edge, tactile and line zone,
// clear of the train envelope). Columns on the islands: allowed by the lead's ruling of round 1, from R-wv2-b.
const wb=frontage.bridges.find(b=>b.id==='way/377738788')!,f=bridgeFrame(wb.ring.map(p=>[p[0],p[1]] as Pt));
const tracks=waverleyTrackSegments(scene).map(([ax,az,bx,bz])=>[[ax,az],[bx,bz]] as [Pt,Pt]),platforms=scene.platforms.map(p=>p.path as Pt[]);
// The platforms run across the bridge, so each support line is a row of columns along one island platform under the deck: on a
// 0.25 m grid over the bridge (0.8 m in from its sides), the points where a column is allowed, grouped by platform; in each 4.5 m
// slot across the bridge (ASSUMED column pitch) the point deepest inside its platform. The six platforms seating the most columns
// carry the six lines, which divide the bridge into its seven spans.
const inRing=([x,z]:Pt,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const segDist=([x,z]:Pt,a:Pt,b:Pt)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
const rows=new Map<number,{s:number;across:number;p:Pt;depth:number}[]>();
for(let s=.25;s<f.length;s+=.25){const w=f.width(s);for(let a=.8;a<=w-.8;a+=.25){
 const p=f.at(s,a/w);if(!WAVERLEY_BRIDGE_COLUMN.allowed(p,platforms,tracks))continue;
 const k=platforms.findIndex(r=>inRing(p,r)),r=platforms[k],depth=Math.min(...r.map((q,i)=>segDist(p,q,r[(i+1)%r.length])));
 const list=rows.get(k)??[];list.push({s,across:a,p,depth});rows.set(k,list);
}}
const lines=[...rows.values()].map(points=>{
 const slots=new Map<number,typeof points[number]>();
 for(const q of points){const k=Math.floor(q.across/4.5),b=slots.get(k);if(!b||q.depth>b.depth)slots.set(k,q);}
 const cols=[...slots.values()].sort((a,b)=>a.across-b.across).filter((q,i,a)=>i===0||Math.hypot(q.p[0]-a[i-1].p[0],q.p[1]-a[i-1].p[1])>=3);
 return {s:cols.reduce((t,q)=>t+q.s,0)/cols.length,cols:cols.map(q=>q.p)};
}).sort((a,b)=>b.cols.length-a.cols.length).slice(0,6).sort((a,b)=>a.s-b.s);
const columns=lines.map(l=>({s:Math.round(l.s*100)/100,cols:r(l.cols)}));
console.log(JSON.stringify(columns.map(l=>[l.s,l.cols.length])));
if(columns.length!==6||columns.some(l=>l.cols.length<2))throw Error('Waverley Bridge: six support lines of two or more columns not found');

const stepsRoof=scene.roofs.find(r=>r.id==='way/577519823');if(!stepsRoof)throw Error('way/577519823 missing from waverley-scene.json');
const body=area('relation/15839904'),mall=area('relation/1113940'),seat=area('way/225997712');
const out={
 origin:frontage.origin,attribution:'© OpenStreetMap contributors (ODbL)',
 sources:{
  osm:'https://www.openstreetmap.org/ (ODbL 1.0), via web/src/data/waverley-scene.json',
  balmoralBody:'https://www.openstreetmap.org/relation/15839904 (Balmoral Hotel body, building:levels 6, roof:levels 1); HES LB30315 "5 storeys, mezzanine and attic"',
  princesMall:'https://www.openstreetmap.org/relation/1113940 (building=retail, layer -1)',
  northBridgePierSeat:'https://www.openstreetmap.org/way/225997712 (station block in North Bridge pier 1\'s clear band; height as the city draws it, ASSUMED 3 m per OSM level)',
  waverleySteps:'https://www.openstreetmap.org/way/577519823 (the Waverley Steps cover, building=roof, layer 1)',
  waverleyBridgeColumns:'derived: HES LB30270 seven plate-girder spans; columns on the island platforms as in R-wv2-b; placement rule WAVERLEY_BRIDGE_COLUMN (web/src/waverley-frontage-bridges.ts)',
 },
 balmoralBody:{id:body.id,levels:6,roofLevels:1,ring:r(body.outer),holes:body.holes.map(r)},
 princesMall:{id:mall.id,ring:r(mall.outer),holes:mall.holes.map(r)},
 northBridgePierSeat:{id:seat.id,height:seat.height,ring:r(seat.outer)},
 waverleyBridgeColumns:columns,
 waverleySteps:{id:stepsRoof.id,ring:r(stepsRoof.outer)},
};
writeFileSync('web/src/data/waverley-frontage-extra.json',JSON.stringify(out)+'\n');
console.log(`Wrote the hotel body, the mall, the pier seat and ${columns.reduce((s,l)=>s+l.cols.length,0)} Waverley Bridge columns on ${columns.length} lines`);
