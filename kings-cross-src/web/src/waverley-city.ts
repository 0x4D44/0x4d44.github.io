// W3 city: the generic OSM city fabric (one wall draw, one roof draw) and the city's landmarks, today the Scott Monument from
// data/waverley-city.json (tools/build-waverley-landmarks.ts). OSM footprints/building parts: ODbL. Fallback building heights are
// ASSUMED (core/waverley-data.ts); the Scott heights are OSM's mapped part heights. waverley-scene.ts calls buildWaverleyCity for the
// fabric and buildWaverleyCityLandmarks for the landmarks, and puts both in its buildings part.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {Batch,material,cityMaterial} from './materials.ts';
import type {Rgb,MaterialName} from './materials.ts';
import {fillSurface,meshAdder,pyramid,shell,walls} from './waverley-mesh.ts';
import {cityHeight} from './waverley-city-heights.ts';
import {roofPlan,roofSurface,roofPeak,withCreases,chimney} from './waverley-city-roofs.ts';
import {buildWaverleyCityGround,Footprints} from './waverley-city-ground.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from './data/waverley-scene.json' with {type:'json'};
import data from './data/waverley-city.json' with {type:'json'};
/** The walls' tint over the city stone facade (average 0xd2c9b0): about 0x897f72 in all, weathered Craigleith-type sandstone. ASSUMED shade. */
export const WAVERLEY_CITY_STONE=0x9c968f;
/** Blocks that are not windowed fabric: monuments, towers, columns, churches and ruins, any elevated part (a monument's stage, a
 *  spire's drum) and anything under PLAIN_AREA m2 in plan. They wear plain ashlar (materials.ts stone, 0.6 x 0.3 m blocks). */
export const PLAIN_KINDS=new Set(['church','chapel','cathedral','ruins','bridge','column','tower','monument','castle','wall','gatehouse','kiosk','toilets']);
export const PLAIN_AREA=40;
export const WAVERLEY_CITY_HEIGHTS={scott:61.11} as const;
export const WAVERLEY_CITY_SOURCES={
 scott:{url:'https://www.openstreetmap.org/way/39044819',height:61.11,basis:'OSM height; explicit mapped part heights and min_height'},
 assumptions:'Unsupported Scott roof profiles remain flat at mapped height; pyramidal/conical roof heights use OSM tags. No decorative Scott figures inferred.',
} as const;
/** The city buildings the landmarks replace: the Scott Monument outline and its mapped parts. */
export const WAVERLEY_CITY_OMIT_IDS=[data.scott.id,...data.scott.parts.map(p=>p.id)];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
export interface WaverleyCityPart {group:THREE.Group;stats:{triangles:number;drawCalls:number};omitBuildingIds:string[];dispose():void}
export interface WaverleyCityFabric extends WaverleyCityPart {/** The ids of the mapped blocks drawn, in data order. */ buildingIds:string[];/** How many drawn blocks stand at an OSM, a LiDAR (waverley-city-heights.ts) or an ASSUMED height. */ heightBasis:{OSM:number;LiDAR:number;ASSUMED:number}}

/** The generic city blocks, each footprint extruded from its lowest ground to its OSM (or ASSUMED) height under the roof its OSM
 *  roof tags give (or an ASSUMED pitched roof, waverley-city-roofs.ts); `omitBuildingIds` are drawn by an element. */
export function buildWaverleyCity(city:Pick<WaverleyData,'buildings'>,ground:Pick<Terrain,'rangeUnder'>,options:{omitBuildingIds?:Iterable<string>}={}):WaverleyCityFabric {
 const group=new THREE.Group();group.name='waverley-city';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 // Own variants of the shared palette; never mutate the cached shared materials. The walls wear the city's stone facade (ashlar with
 // a tall window and surround to each 3.0 x 3.6 m bay, materials.ts CITY_TEXTURES.stone), toned to Edinburgh's grey-buff sandstone
 // (R-wv3-c, -c3); the shades and the per-block variation are ASSUMED, not a facade survey.
 const sandstone=cityMaterial('stone').clone() as THREE.MeshLambertMaterial;sandstone.color.setHex(WAVERLEY_CITY_STONE);sandstone.vertexColors=true;
 const slate=material('slate').clone() as THREE.MeshLambertMaterial;slate.color.multiply(new THREE.Color(0xada99f));slate.vertexColors=true;
 const buildings=new Batch({colored:true}),plainWalls=new Batch({colored:true}),buildingTops=new Batch({colored:true});
 const ashlar=material('stone').clone() as THREE.MeshLambertMaterial;ashlar.color.setHex(0xc4b8a4);ashlar.vertexColors=true;
 const omitted=new Set(options.omitBuildingIds??[]),buildingIds:string[]=[],heightBasis={OSM:0,LiDAR:0,ASSUMED:0};
 for(const b of city.buildings){
  if(omitted.has(b.id))continue;
  buildingIds.push(b.id);
  const h=cityHeight(b);heightBasis[h.basis]++;
  const base=ground.rangeUnder(b.outer,4).min,plan=roofPlan({...b,height:h.height},base);
  let hash=0;for(const c of b.id)hash=(hash*31+c.charCodeAt(0))>>>0;
  const tone=.8+(hash%23)*.01,warm=((hash>>>5)%7)*.008,color:Rgb=[tone*(1+warm),tone,tone*(.97-warm)];
  const roofTone=.82+((hash>>>9)%13)*.02,roofColor:Rgb=[roofTone,roofTone,roofTone*1.02];
  // One foundation plane, ASSUMED 0.15m rendering sink. Elevated OSM parts keep their real
  // min_height void; terrain never pulls individual wall corners into shards.
  const planes=plan.shape==='planes',outer=planes?withCreases(b.outer,plan.creases):b.outer,holes=planes?b.holes.map(h=>withCreases(h,plan.creases)):b.holes;
  let area=0;{const r=b.outer;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];area+=p[0]*q[1]-q[0]*p[1];}area=Math.abs(area)/2;}
  const plain=b.minHeight>0||area<PLAIN_AREA||PLAIN_KINDS.has(b.tags.building??b.tags['building:part']??'');
  walls(plain?plainWalls:buildings,outer,holes,()=>b.minHeight?base+b.minHeight:base-.15,planes?plan.at:()=>plan.eave,color);
  const roofFrom=buildingTops.colors.length;
  if(planes)roofSurface(buildingTops,b.outer,b.holes,plan);
  else{fillSurface(buildingTops,b.outer,b.holes,()=>plan.eave);if(plan.shape!=='flat')roofPeak(buildingTops,b.outer,plan);}
  // slates vary a little block to block (ASSUMED, R-wv3-c: weathered grey slate, some darker, some bluer)
  for(let i=roofFrom;i<buildingTops.colors.length;i+=3){buildingTops.colors[i]*=roofColor[0];buildingTops.colors[i+1]*=roofColor[1];buildingTops.colors[i+2]*=roofColor[2];}
  for(const c of plan.chimneys)chimney(plainWalls,c,plan.u,plan.eave,color); // stacks are plain ashlar, not windowed fabric
 }
 // Every top is a roof: the cover map (cover.ts ROOF_MESHES) knows this mesh by name.
 add(group,buildings,sandstone,'waverley-building-walls');add(group,plainWalls,ashlar,'waverley-building-ashlar');add(group,buildingTops,slate,'waverley-building-tops');
 let disposed=false;
 return {group,stats,omitBuildingIds:[],buildingIds,heightBasis,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of geometries)g.dispose();sandstone.dispose();ashlar.dispose();slate.dispose();group.clear();}};
}

/** The Scott Monument from its 98 mapped OSM parts, on one common base: the lowest ground under its outline. */
export function buildWaverleyCityLandmarks(ground:Pick<Terrain,'rangeUnder'>&Partial<Terrain>):WaverleyCityPart {
 const group=new THREE.Group();group.name='waverley-city-landmarks';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 const scott=new Batch(),sr=ringOf(data.scott.ring),sb=ground.rangeUnder(sr,2).min;
 for(const p of data.scott.parts){const r=ringOf(p.ring),pitched=['pyramidal','cone'].includes(p.roofShape)&&p.roofHeight>0,wallTop=p.height-(pitched?p.roofHeight:0);
  if(wallTop>p.minHeight)shell(scott,r,()=>sb+p.minHeight,()=>sb+wallTop);
  if(pitched)pyramid(scott,r,sb+wallTop,sb+p.height);
 }
 const stone=material('stone').clone() as THREE.MeshLambertMaterial;stone.color.setHex(0x51463d);
 add(group,scott,stone,'waverley-scott-monument');
 // The ground's land use and the trees, over the drawn terrain (a full terrain only: the real scene, not a test stub). Trees keep
 // clear of every mapped building and roof outline, whichever element draws it.
 let cover:ReturnType<typeof buildWaverleyCityGround>|undefined;
 if(ground.extent&&ground.normalAt&&ground.heightAt&&ground.stepIn){
  const scene=unpackWaverleyScene(sceneFile);
  cover=buildWaverleyCityGround(ground as Terrain,new Footprints([...scene.buildings,...scene.roofs].map(b=>ringOf(b.outer))));
  group.add(cover.group);stats.triangles+=cover.stats.triangles;stats.drawCalls+=cover.stats.drawCalls;
 }
 let disposed=false;
 return {group,stats,omitBuildingIds:[...WAVERLEY_CITY_OMIT_IDS],dispose(){if(disposed)return;disposed=true;cover?.dispose();group.removeFromParent();for(const g of geometries)g.dispose();stone.dispose();group.clear();}};
}
