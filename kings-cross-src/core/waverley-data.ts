// OSM-only geometry. Heights are relative to local footprint ground, not sea level.
import { project, round } from './geo.ts';
import type { LatLon, Pt } from './geo.ts';
export const WAVERLEY_ORIGIN: LatLon = {lat:55.9519018,lon:-3.1904199};
export const WAVERLEY_BBOX: [number,number,number,number] = [55.9465,-3.205,55.9575,-3.173];
type Tags=Record<string,string>;
export interface WaverleyRawElement {type:'node'|'way'|'relation';id:number;lat?:number;lon?:number;nodes?:number[];geometry?:LatLon[];tags?:Tags;members?:{type:string;ref:number;role:string;geometry?:LatLon[]}[]}
export interface WaverleySource {url:string;fetchedAt:string;sha256:string;license:string;query:string}
export interface WaverleyRail {id:string;path:Pt[];tags:Tags}
export interface WaverleyPlatform extends WaverleyRail {ref?:string}
export interface WaverleyArea {id:string;outer:Pt[];holes:Pt[][];height:number;minHeight:number;heightBasis:string;tags:Tags;kind:'building'|'part'}
export interface WaverleyScene {origin:LatLon;bbox:[number,number,number,number];attribution:string;source:WaverleySource;rails:WaverleyRail[];platforms:WaverleyPlatform[];roofs:WaverleyArea[];buildings:WaverleyArea[];warnings:string[]}
const equal=(a:Pt,b:Pt):boolean=>a[0]===b[0]&&a[1]===b[1];
function inside(p:Pt,ring:Pt[]):boolean {
 let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++) {const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;
}
// Liang-Barsky tests segments, including ways crossing the box with no inside vertex.
function segmentHits(a:Pt,b:Pt,box:number[]):boolean {
 let lo=0,hi=1;const dx=b[0]-a[0],dz=b[1]-a[1];
 for(const [p,q] of [[-dx,a[0]-box[0]],[dx,box[2]-a[0]],[-dz,a[1]-box[1]],[dz,box[3]-a[1]]]){if(p===0){if(q<0)return false;continue;}const t=q/p;if(p<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return false;}return true;
}
function intersects(p:Pt[],closed:boolean):boolean {
 const sw=project(WAVERLEY_BBOX[0],WAVERLEY_BBOX[1],WAVERLEY_ORIGIN),ne=project(WAVERLEY_BBOX[2],WAVERLEY_BBOX[3],WAVERLEY_ORIGIN),box=[sw[0],ne[1],ne[0],sw[1]];
 if(p.some(v=>v[0]>=box[0]&&v[0]<=box[2]&&v[1]>=box[1]&&v[1]<=box[3]))return true;
 for(let i=1;i<p.length;i++)if(segmentHits(p[i-1],p[i],box))return true;
 return closed&&(segmentHits(p[p.length-1],p[0],box)||inside([box[0],box[1]],p));
}
function metres(v:string|undefined):number|undefined {const m=v?.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*(m|ft|feet)?$/);return m?Number(m[1])*(m[2]==='ft'||m[2]==='feet'?0.3048:1):undefined;}
function heights(tags:Tags,roof:boolean):Pick<WaverleyArea,'height'|'minHeight'|'heightBasis'> {
 const h=metres(tags.height),levels=metres(tags['building:levels']),min=metres(tags.min_height),minLevels=metres(tags['building:min_level']),minHeight=min??(minLevels===undefined?0:minLevels*3);
 let height=h??(levels===undefined?(roof?8:12):levels*3);
 const basis=[h!==undefined?'OSM height':levels!==undefined?'ASSUMED 3m per OSM building:levels':`ASSUMED ${roof?8:12}m; OSM height absent`,min!==undefined?'OSM min_height':minLevels!==undefined?'ASSUMED 3m per OSM building:min_level':'ASSUMED minHeight 0m'];
 if(height<=minHeight){height=minHeight+3;basis.push('ASSUMED top 3m above minimum; absent/inconsistent top');}
 return {height:round(height,2),minHeight:round(minHeight,2),heightBasis:basis.join('; ')};
}
// Refuses incomplete rings, joins fragmented multipolygon members by endpoints.
function assemble(paths:Pt[][]):Pt[][]|undefined {
 const todo=paths.map(p=>p.slice()),result:Pt[][]=[];
 while(todo.length){const ring=todo.shift()!;while(ring.length>1&&!equal(ring[0],ring[ring.length-1])){const i=todo.findIndex(p=>equal(p[0],ring[ring.length-1])||equal(p[p.length-1],ring[ring.length-1]));if(i<0)return undefined;const part=todo.splice(i,1)[0];if(!equal(part[0],ring[ring.length-1]))part.reverse();ring.push(...part.slice(1));}if(ring.length<4)return undefined;ring.pop();result.push(ring);}return result;
}
function pointSegmentDistance(p:Pt,a:Pt,b:Pt):number {
 const dx=b[0]-a[0],dz=b[1]-a[1],length=dx*dx+dz*dz;
 const t=length===0?0:Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/length));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
function simplifyChain(p:Pt[]):Pt[] {
 if(p.length<=2)return p;
 let farthest=0,index=0;
 for(let i=1;i<p.length-1;i++){const distance=pointSegmentDistance(p[i],p[0],p[p.length-1]);if(distance>farthest){farthest=distance;index=i;}}
 if(farthest<=0.3)return [p[0],p[p.length-1]];
 return [...simplifyChain(p.slice(0,index+1)).slice(0,-1),...simplifyChain(p.slice(index))];
}
const cross=(a:Pt,b:Pt,c:Pt):number=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
function edgesCross(a:Pt,b:Pt,c:Pt,d:Pt):boolean {
 const a1=cross(a,b,c),a2=cross(a,b,d),b1=cross(c,d,a),b2=cross(c,d,b);
 // Treat collinear/touching non-adjacent edges as unsafe too.
 if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))return false;
 return a1*a2<=0&&b1*b2<=0;
}
function simplifyCity(area:WaverleyArea):void {
 const original=[area.outer,...area.holes];
 const rings=original.map(r=>{
  let farthest=1;for(let i=2;i<r.length;i++)if(Math.hypot(r[i][0]-r[0][0],r[i][1]-r[0][1])>Math.hypot(r[farthest][0]-r[0][0],r[farthest][1]-r[0][1]))farthest=i;
  return [...simplifyChain(r.slice(0,farthest+1)).slice(0,-1),...simplifyChain([...r.slice(farthest),r[0]]).slice(0,-1)];
 });
 for(const ring of rings){
  if(ring.length<3)return;
  for(let i=0;i<ring.length;i++)for(let j=i+1;j<ring.length;j++){
   if(j===i+1||(i===0&&j===ring.length-1))continue;
   if(edgesCross(ring[i],ring[(i+1)%ring.length],ring[j],ring[(j+1)%ring.length]))return;
  }
 }
 for(let i=0;i<rings.length;i++)for(let j=i+1;j<rings.length;j++){
  for(let a=0;a<rings[i].length;a++)for(let b=0;b<rings[j].length;b++)if(edgesCross(rings[i][a],rings[i][(a+1)%rings[i].length],rings[j][b],rings[j][(b+1)%rings[j].length]))return;
 }
 if(rings.slice(1).some(h=>!inside(h[0],rings[0])))return;
 // New holes must retain their old interior location and must not swallow each other.
 for(let i=1;i<rings.length;i++)for(let j=1;j<rings.length;j++)if(i!==j&&inside(rings[i][0],rings[j]))return;
 area.outer=rings[0];area.holes=rings.slice(1);
}
export function buildWaverleyScene(raw:{elements:WaverleyRawElement[]},source:WaverleySource):WaverleyScene {
 const scene:WaverleyScene={origin:{...WAVERLEY_ORIGIN},bbox:[...WAVERLEY_BBOX],attribution:'© OpenStreetMap contributors (ODbL), https://www.openstreetmap.org/copyright',source,rails:[],platforms:[],roofs:[],buildings:[],warnings:[]};
 const elements=[...new Map(raw.elements.map(e=>[`${e.type}/${e.id}`,e])).values()],nodes=new Map(elements.filter(e=>e.type==='node').map(e=>[e.id,e])),ways=new Map(elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
 const projected=(g:LatLon[]):Pt[]=>g.map(v=>project(v.lat,v.lon,WAVERLEY_ORIGIN)).map(([x,z])=>[round(x),round(z)]);
 const path=(e:WaverleyRawElement):Pt[]|undefined=>{if(e.geometry)return projected(e.geometry);if(!e.nodes)return undefined;const pts=e.nodes.map(id=>nodes.get(id));return pts.every(n=>n?.lat!==undefined&&n.lon!==undefined)?projected(pts.map(n=>({lat:n!.lat!,lon:n!.lon!}))):undefined;};
 const drawnMembers=new Set<number>();
 for(const e of elements.filter(e=>e.type==='relation'&&(e.tags?.building||e.tags?.['building:part']))){
  const tags=e.tags??{},members=e.members??[];if(tags.type!=='multipolygon')continue;
  const collect=(role:string):Pt[][]|undefined=>{const relevant=members.filter(m=>m.type==='way'&&(m.role===role||(role==='outer'&&!m.role))),paths=relevant.map(m=>m.geometry?projected(m.geometry):ways.has(m.ref)?path(ways.get(m.ref)!):undefined);return paths.every(p=>p&&p.length>=2)?assemble(paths as Pt[][]):undefined;};
  const outers=collect('outer'),inners=collect('inner');if(!outers?.length||!inners){scene.warnings.push(`Incomplete building relation/${e.id} omitted`);continue;}
  let drawn=false;outers.forEach((outer,index)=>{if(!intersects(outer,true))return;const roof=tags.building==='roof'||tags['building:part']==='roof';const area:WaverleyArea={id:`relation/${e.id}${outers.length>1?`/${index}`:''}`,outer,holes:inners.filter(h=>inside(h[0],outer)),tags,kind:tags['building:part']?'part':'building',...heights(tags,roof)};(roof?scene.roofs:scene.buildings).push(area);drawn=true;});
  if(drawn)for(const m of members)if(m.type==='way'&&(m.role==='outer'||!m.role))drawnMembers.add(m.ref);
 }
 for(const e of ways.values()){
  const tags=e.tags??{},p=path(e);if(!p||p.length<2)continue;const closed=equal(p[0],p[p.length-1]);if(!intersects(p,closed))continue;const id=`way/${e.id}`;
  if(tags.railway==='rail')scene.rails.push({id,path:p,tags});else if(tags.railway==='platform'&&tags.train==='yes'&&tags.tram!=='yes'&&closed)scene.platforms.push({id,path:p.slice(0,-1),...(tags.ref?{ref:tags.ref}:{}),tags});
  if((tags.building||tags['building:part'])&&closed&&!drawnMembers.has(e.id)){const roof=tags.building==='roof'||tags['building:part']==='roof';const area:WaverleyArea={id,outer:p.slice(0,-1),holes:[],tags,kind:tags['building:part']?'part':'building',...heights(tags,roof)};(roof?scene.roofs:scene.buildings).push(area);}
 }
 // A parent outline represented by OSM parts must not fill the parts' gaps again.
 const parts=scene.buildings.filter(b=>b.kind==='part');scene.buildings=scene.buildings.filter(b=>b.kind==='part'||!parts.some(p=>p.outer.every(v=>(inside(v,b.outer)||b.outer.some(q=>equal(v,q)))&&!b.holes.some(h=>inside(v,h)))));
 for(const area of scene.buildings)if(area.tags.name!=='Edinburgh Waverley')simplifyCity(area);
 const keep=new Set(['railway','train','tram','ref','building','building:part','building:levels','building:min_level','height','min_height','roof:shape','roof:height','roof:levels','roof:direction','roof:orientation','layer','tunnel','bridge','service','usage','ele']);
 for(const list of [scene.rails,scene.platforms,scene.roofs,scene.buildings])for(const item of list){
  const named=scene.platforms.includes(item as WaverleyPlatform)||item.tags.name==='Edinburgh Waverley';
  item.tags=Object.fromEntries(Object.entries(item.tags).filter(([k])=>keep.has(k)||(k==='name'&&named)));
 }
 for(const list of [scene.rails,scene.platforms,scene.roofs,scene.buildings])list.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));return scene;
}

export interface PackedWaverleyRail extends Omit<WaverleyRail,'path'> {path:string}
export interface PackedWaverleyPlatform extends PackedWaverleyRail {ref?:string}
export interface PackedWaverleyArea extends Omit<WaverleyArea,'outer'|'holes'> {outer:string;holes:string[]}
export interface PackedWaverleyScene extends Omit<WaverleyScene,'rails'|'platforms'|'roofs'|'buildings'> {
 format:'waverley-varint-v1';q:number;rails:PackedWaverleyRail[];platforms:PackedWaverleyPlatform[];
 roofs:PackedWaverleyArea[];buildings:PackedWaverleyArea[];
}
/** Lossless signed integer deltas of already quantized 0.1m coordinates.
 * Zigzag makes small negative deltas small unsigned values; varints use seven
 * payload bits per byte, then base64 keeps the binary payload safe in JSON.
 */
export function packWaverleyScene(scene:WaverleyScene):PackedWaverleyScene {
 const pack=(ring:Pt[]):string=>{
  let previousX=0,previousZ=0,bytes='';
  const append=(delta:number):void=>{
   let value=delta<0?-delta*2-1:delta*2;
   do {const byte=value%128;value=Math.floor(value/128);bytes+=String.fromCharCode(byte+(value?128:0));}while(value);
  };
  for(const [x,z] of ring){const ix=Math.round(x*10),iz=Math.round(z*10);append(ix-previousX);append(iz-previousZ);previousX=ix;previousZ=iz;}
  return btoa(bytes);
 };
 const area=(a:WaverleyArea):PackedWaverleyArea=>({...a,outer:pack(a.outer),holes:a.holes.map(pack)});
 return {...scene,format:'waverley-varint-v1',q:0.1,
  rails:scene.rails.map(r=>({...r,path:pack(r.path)})),
  platforms:scene.platforms.map(p=>({...p,path:pack(p.path)})),
  roofs:scene.roofs.map(area),buildings:scene.buildings.map(area)};
}
export function unpackWaverleyScene(input:unknown):WaverleyScene {
 const packed=input as PackedWaverleyScene;
 if(packed?.format!=='waverley-varint-v1'||packed.q!==0.1)throw Error('Unsupported Waverley format or quantization');
 const unpack=(ring:string):Pt[]=>{
  let bytes:string;
  try {if(typeof ring!=='string')throw Error();bytes=atob(ring);}catch{throw Error('Invalid Waverley base64 ring');}
  let x=0,z=0,value=0,multiplier=1,coordinate=0;
  const result:Pt[]=[];
  for(let i=0;i<bytes.length;i++){
   const byte=bytes.charCodeAt(i);value+=(byte%128)*multiplier;
   if(!Number.isSafeInteger(value)||multiplier>128**7)throw Error('Invalid Waverley varint overflow');
   if(byte>=128){multiplier*=128;continue;}
   const delta=value%2===1?-(value+1)/2:value/2;
   if(coordinate%2===0)x+=delta;else{z+=delta;result.push([round(x*packed.q),round(z*packed.q)]);}
   if(!Number.isSafeInteger(x)||!Number.isSafeInteger(z))throw Error('Invalid Waverley coordinate overflow');
   coordinate++;value=0;multiplier=1;
  }
  if(multiplier!==1)throw Error('Invalid Waverley truncated varint');
  if(coordinate%2!==0)throw Error('Invalid Waverley coordinate pair');
  return result;
 };
 const area=(a:PackedWaverleyArea):WaverleyArea=>({...a,outer:unpack(a.outer),holes:a.holes.map(unpack)});
 const {format:_format,q:_q,...metadata}=packed;
 return {...metadata,rails:packed.rails.map(r=>({...r,path:unpack(r.path)})),
  platforms:packed.platforms.map(p=>({...p,path:unpack(p.path)})),
  roofs:packed.roofs.map(area),buildings:packed.buildings.map(area)};
}
