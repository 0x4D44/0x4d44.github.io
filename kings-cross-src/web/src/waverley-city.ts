// W3 city: the generic OSM city fabric (one wall draw, one roof draw) and the city's landmarks, today the Scott Monument from
// data/waverley-city.json (tools/build-waverley-landmarks.ts). OSM footprints/building parts: ODbL. Fallback building heights are
// ASSUMED (core/waverley-data.ts); the Scott heights are OSM's mapped part heights. waverley-scene.ts calls buildWaverleyCity for the
// fabric and buildWaverleyCityLandmarks for the landmarks, and puts both in its buildings part.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {Batch,material} from './materials.ts';
import type {Rgb,MaterialName} from './materials.ts';
import {fillSurface,meshAdder,pyramid,shell,walls} from './waverley-mesh.ts';
import data from './data/waverley-city.json' with {type:'json'};
export const WAVERLEY_CITY_HEIGHTS={scott:61.11} as const;
export const WAVERLEY_CITY_SOURCES={
 scott:{url:'https://www.openstreetmap.org/way/39044819',height:61.11,basis:'OSM height; explicit mapped part heights and min_height'},
 assumptions:'Unsupported Scott roof profiles remain flat at mapped height; pyramidal/conical roof heights use OSM tags. No decorative Scott figures inferred.',
} as const;
/** The city buildings the landmarks replace: the Scott Monument outline and its mapped parts. */
export const WAVERLEY_CITY_OMIT_IDS=[data.scott.id,...data.scott.parts.map(p=>p.id)];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
export interface WaverleyCityPart {group:THREE.Group;stats:{triangles:number;drawCalls:number};omitBuildingIds:string[];dispose():void}

/** The generic city blocks, each footprint extruded from its lowest ground to its OSM (or ASSUMED) height; `omitBuildingIds` are drawn by an element. */
export function buildWaverleyCity(city:Pick<WaverleyData,'buildings'>,ground:Pick<Terrain,'rangeUnder'>,options:{omitBuildingIds?:Iterable<string>}={}):WaverleyCityPart {
 const group=new THREE.Group();group.name='waverley-city';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 // Own variants of the KX palette; never mutate the cached shared materials. Shades
 // and small per-block variations are ASSUMED, not facade-survey classifications.
 const local=(key:MaterialName,tint:number,vertexColors=false):THREE.MeshLambertMaterial=>{
  const m=material(key).clone() as THREE.MeshLambertMaterial;m.color.multiply(new THREE.Color(tint));m.vertexColors=vertexColors;return m;
 };
 const sandstone=local('stone',0xe4d4b3,true),slate=local('slate',0xada99f);
 const buildings=new Batch({colored:true}),buildingTops=new Batch();
 const omitted=new Set(options.omitBuildingIds??[]);
 for(const b of city.buildings){
  if(omitted.has(b.id))continue;
  const base=ground.rangeUnder(b.outer,4).min,top=base+b.height;
  let hash=0;for(const c of b.id)hash=(hash*31+c.charCodeAt(0))>>>0;
  const tone=.86+(hash%17)*.01,color:Rgb=[tone,tone*.985,tone*.95];
  // One foundation plane, ASSUMED 0.15m rendering sink. Elevated OSM parts keep their real
  // min_height void; terrain never pulls individual wall corners into shards.
  walls(buildings,b.outer,b.holes,()=>b.minHeight?base+b.minHeight:base-.15,()=>top,color);
  fillSurface(buildingTops,b.outer,b.holes,()=>top);
 }
 add(group,buildings,sandstone,'waverley-building-walls');add(group,buildingTops,slate,'waverley-building-tops');
 let disposed=false;
 return {group,stats,omitBuildingIds:[],dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of geometries)g.dispose();sandstone.dispose();slate.dispose();group.clear();}};
}

/** The Scott Monument from its 98 mapped OSM parts, on one common base: the lowest ground under its outline. */
export function buildWaverleyCityLandmarks(ground:Pick<Terrain,'rangeUnder'>):WaverleyCityPart {
 const group=new THREE.Group();group.name='waverley-city-landmarks';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 const scott=new Batch(),sr=ringOf(data.scott.ring),sb=ground.rangeUnder(sr,2).min;
 for(const p of data.scott.parts){const r=ringOf(p.ring),pitched=['pyramidal','cone'].includes(p.roofShape)&&p.roofHeight>0,wallTop=p.height-(pitched?p.roofHeight:0);
  if(wallTop>p.minHeight)shell(scott,r,()=>sb+p.minHeight,()=>sb+wallTop);
  if(pitched)pyramid(scott,r,sb+wallTop,sb+p.height);
 }
 const stone=material('stone').clone() as THREE.MeshLambertMaterial;stone.color.setHex(0x51463d);
 add(group,scott,stone,'waverley-scott-monument');
 let disposed=false;
 return {group,stats,omitBuildingIds:[...WAVERLEY_CITY_OMIT_IDS],dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of geometries)g.dispose();stone.dispose();group.clear();}};
}
