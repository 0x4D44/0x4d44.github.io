// W3 city heights: the Scottish Government LiDAR Phase V (0.5 m DSM minus DTM, OGLv3) roof height of each mapped block that OSM gives
// no height, from data/waverley-city-heights.json (tools/build-waverley-city-heights.ts). It replaces core/waverley-data.ts's
// ASSUMED 12 m / 3 m-per-level fallback. h is the 90th-percentile surface above the lowest ground under the footprint, which is
// exactly how the scene seats a block (its walls stand on the lowest ground), so seat + h is the LiDAR roof (median 0.3 m off it).
// Not used: footprints under LIDAR_MIN_AREA m2 (a tree over a small shed reads as a roof) and blocks reaching outside the terrain
// extent (seated on the flat groundY there, so a LiDAR height would sit tens of metres low). Where the median surface lies more than
// LIDAR_TOWER m under the 90th percentile, a tower or spire stands on part of the plan: the block takes the median plus
// LIDAR_TOWER_RISE (the roof over the main body) rather than raising its whole plan to the tower (rule ASSUMED).
import type {Pt} from '../../core/geo.ts';
import file from './data/waverley-city-heights.json' with {type:'json'};
export const WAVERLEY_CITY_LIDAR_SOURCE={dsm:file.source.dsm,licence:file.source.licence,attribution:file.source.attribution} as const;
export const LIDAR_MIN_AREA=30,LIDAR_TOWER=6,LIDAR_TOWER_RISE=3;
/** ASSUMED: a block on a footprint under TINY_AREA m2 with no OSM height (a sentry box, a kiosk, a stair head) is one 3 m storey, not
 *  the 12 m fallback (a building, not a building:part: a tiny part is a pinnacle or stack up on its building, LiDAR p10 11 m): on Castle Rock two 2 m2 blocks (way/258095237, way/258095246) stood as 12 m posts (round 3 score, C1). */
export const TINY_AREA=4,TINY_HEIGHT=3;
/** The terrain extent (data/waverley-terrain.json). */
const EXTENT={x0:-912,z0:-624,x1:1088,z1:608};
const lidar=new Map<string,{height:number;median:number}>();
{let id=0,k=0;const put=(key:string)=>{lidar.set(key,{height:file.h[k]*file.q,median:(file.h[k]-file.r[k])*file.q});k++;};
 for(const d of file.ids.way){id+=d;put(`way/${id}`);}for(const r of file.ids.relation)put(`relation/${r}`);}
export const LIDAR_HEIGHTS:ReadonlyMap<string,{height:number;median:number}>=lidar;
const area=(r:readonly Pt[])=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;};
/** A tiny block: a building (not a part) on under TINY_AREA m2 with no OSM height or levels. */
export const tinyBlock=(b:{outer:readonly Pt[];minHeight:number;heightBasis:string;tags?:Readonly<Record<string,string>>}):boolean=>
 b.heightBasis.startsWith('ASSUMED 12m')&&b.minHeight===0&&!b.tags?.['building:part']&&area(b.outer)<TINY_AREA;
/** The height a block is drawn at, with its basis: OSM's where mapped, else LiDAR's where usable, else the ASSUMED fallback. */
export function cityHeight(b:{id:string;outer:readonly Pt[];height:number;minHeight:number;heightBasis:string;tags?:Readonly<Record<string,string>>}):{height:number;basis:'OSM'|'LiDAR'|'ASSUMED'}{
 if(!b.heightBasis.startsWith('ASSUMED'))return {height:b.height,basis:'OSM'};
 const l=lidar.get(b.id);
 if(tinyBlock(b))return {height:TINY_HEIGHT,basis:'ASSUMED'};
 if(!l||b.minHeight>0||area(b.outer)<LIDAR_MIN_AREA||b.outer.some(([x,z])=>x<EXTENT.x0||x>EXTENT.x1||z<EXTENT.z0||z>EXTENT.z1))return {height:b.height,basis:'ASSUMED'};
 const height=l.height-l.median>LIDAR_TOWER?l.median+LIDAR_TOWER_RISE:l.height;
 return {height:Math.max(2.5,Math.round(height*10)/10),basis:'LiDAR'};
}
