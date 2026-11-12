// Waverley is an independent local scene. Lazy-load this MODULE, then call buildWaverleyScene();
// it owns no renderer, animation loop, feed, camera or DOM. No London/NR data is imported.
// Horizontal geometry is OSM (ODbL); the 16 m context grid is Scottish Phase V DTM (OGLv3).
//
// VERTICAL LIMIT: the DTM is not a rail survey: verified source pixels retain/interpolate raised
// ground at bridges and the station. Like the KX preview, rail heads use a schematic common y=0.
// Flatten ground under the mapped station/platforms and within 8 m of open rail, blending over
// 40 m to the physical context. Those widths, 0.915 m platform height, rail/sleeper dimensions,
// and fallback building heights are ASSUMED, not measured Waverley dimensions. The station's
// ridge-and-furrow type is sourced; its numeric profile is ASSUMED (waverley-roof.ts).
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import {createTerrain, buildTerrainMesh, overMesh} from '../../core/terrain.ts';
import type {Terrain, TerrainFile} from '../../core/terrain.ts';
import {Batch, material, terrainMaterial} from './materials.ts';
import type {V3} from './materials.ts';
import {WAVERLEY_LEVELS,meshAdder} from './waverley-mesh.ts';
import {RAILWAY_OVERLAP_TOLERANCE,addTrackLines,lineSegments,stationGround,stationRailwayFootprint,stationRailwayIntrusions,stationTrackCurves,stationTrackSegments} from './station-railway.ts';
import type {TrackSegment} from './station-railway.ts';
import {buildWaverleyStation,WAVERLEY_STATION_ROOF_ID,WAVERLEY_STATION_OMIT_IDS} from './waverley-station.ts';
import {buildWaverleyFrontage,WAVERLEY_FRONTAGE_OMIT_IDS} from './waverley-frontage.ts';
import {buildWaverleyCity,buildWaverleyCityLandmarks,WAVERLEY_CITY_OMIT_IDS} from './waverley-city.ts';
import {addWaverleyLights} from './station-weather.ts';
export {polygonSurface} from './waverley-mesh.ts';
export {WAVERLEY_LEVELS};
// Separate lazy assets: neither OSM nor Scottish terrain enters the London entry chunk.
// Awaiting the module resolves both before the synchronous builder becomes available.
const [{default:dataFile},{default:terrainFile}]=await Promise.all([
 import('./data/waverley-scene.json',{with:{type:'json'}}),
 import('./data/waverley-terrain.json',{with:{type:'json'}}),
]);

export type {TrackSegment};
export interface WaverleyOptions {
 data?:WaverleyData;
 /** Optional source terrain (in Waverley's local metric frame), for testing/custom source adapters. */
 terrain?:Terrain;
 /** Default true. Omit lights if the caller supplies them. */
 lighting?:boolean;
 /** Default true; hide mapped roof for track/platform inspection without removing its floor mask. */
 roofVisible?:boolean;
 cityVisible?:boolean;
 /** Default true: draw the track on the live graph's faired curves (core/curves.ts); false draws the OSM chords. */
 curves?:boolean;
}
export interface WaverleyScene {
 group:THREE.Group;
 parts:{terrain:THREE.Group;track:THREE.Group;platforms:THREE.Group;roof:THREE.Group;buildings:THREE.Group};
 origin:WaverleyData['origin'];
 attribution:string;
 groundAttribution:string;
 /** Ground of the drawn mesh, including the documented railway flattening, not a rail survey. */
 terrain:Terrain;
 stats:{triangles:number;drawCalls:number;platforms:number;buildings:number;roofs:number;sleepers:number};
 /** The mapped city blocks drawn as generic fabric: not those an element replaces, nor those standing on the railway. */
 buildingIds:string[];
 dispose():void;
}
/** No tram/tunnel is drawn as a surface train track, nor a duplicate junction edge (station-railway.ts stationTrackSegments). */
export const waverleyTrackSegments=(data:WaverleyData):TrackSegment[]=>stationTrackSegments(data);
/** Keep source terrain intact; derive the preview's station-floor plateau separately (station-railway.ts stationGround): the platforms and
 *  the station roof's outline are level, the rest blends to the source away from the open rail. */
export function waverleyGround(data:WaverleyData,raw:Terrain):Terrain {
 return stationGround(raw,waverleyTrackSegments(data),[...data.platforms.map(p=>p.path),...data.roofs.filter(r=>r.id===WAVERLEY_STATION_ROOF_ID).map(r=>r.outer)]);
}
export {RAILWAY_OVERLAP_TOLERANCE};
/** The railway's plan footprint as convex pieces (station-railway.ts stationRailwayFootprint). */
export const waverleyRailwayFootprint=(data:WaverleyData):Pt[][]=>stationRailwayFootprint(data);
/** The mapped city blocks that stand on the railway (station-railway.ts stationRailwayIntrusions). */
export const waverleyRailwayIntrusions=(data:WaverleyData,footprint:readonly Pt[][]=waverleyRailwayFootprint(data)):string[]=>stationRailwayIntrusions(data,footprint);
/** The drawn track's centre lines (station-railway.ts stationTrackCurves): the faired curves by default, the chords with curves false. */
export const waverleyTrackLines=(data:WaverleyData,curves=true):Pt[][]=>stationTrackCurves(data,{curves});

/** Lazy import contract: const {buildWaverleyScene}=await import('./waverley-scene.ts'); const w=buildWaverleyScene(); scene.add(w.group); */
export function buildWaverleyScene(options:WaverleyOptions={}):WaverleyScene {
 const data=options.data??unpackWaverleyScene(dataFile);
 const contextTerrain=options.terrain??createTerrain(terrainFile as unknown as TerrainFile);
 const field=waverleyGround(data,contextTerrain);
 const group=new THREE.Group();group.name='edinburgh-waverley';
 const geometries=new Set<THREE.BufferGeometry>(),ownedMaterials=new Set<THREE.Material>();
 const stats={triangles:0,drawCalls:0,platforms:data.platforms.length,buildings:data.buildings.length,roofs:data.roofs.length,sleepers:0};
 const add=meshAdder(stats,geometries);
 // This source extent is in whole 16 m blocks, not necessarily whole KX 64 m blocks.
 const tm=buildTerrainMesh(field,{maxLeaf:16,tolerance:()=>.08});
 const ground=overMesh(field,tm);
 // The elements, each in its own file. They are built in this order (city, then ground and track, station, frontage, city landmarks) so
 // that their materials keep the order, and so the draw order, they had when all of this was one function; the scene graph keeps its old order.
 // Elements draw their own replacements of mapped city blocks; the synthetic-data path (tests) draws no landmarks.
 const landmarks=!options.data;
 // City blocks standing on the track or a platform are not drawn (waverleyRailwayIntrusions), whatever the data.
 const city=buildWaverleyCity(data,ground,{omitBuildingIds:[...landmarks?[...WAVERLEY_STATION_OMIT_IDS,...WAVERLEY_FRONTAGE_OMIT_IDS,...WAVERLEY_CITY_OMIT_IDS]:[],...waverleyRailwayIntrusions(data)]});
 const terrain=new THREE.Group(),track=new THREE.Group(),buildings=new THREE.Group();
 const tg=new THREE.BufferGeometry();tg.setAttribute('position',new THREE.BufferAttribute(tm.positions,3));tg.setIndex(new THREE.BufferAttribute(tm.indices,1));tg.computeVertexNormals();
 const groundMaterial=terrainMaterial('ground').clone() as THREE.MeshLambertMaterial;
 // Neutral warm ground separates sandstone/slate/glazing without inventing land-use
 // polygons; real roads/parks are not classified by this context-only DTM.
 groundMaterial.color.setHex(0x757568);ownedMaterials.add(groundMaterial);
 const terrainMesh=new THREE.Mesh(tg,groundMaterial);terrainMesh.name='waverley-ground';terrain.add(terrainMesh);geometries.add(tg);stats.triangles+=tm.triangles;stats.drawCalls++;
 // The drawn centre lines are the live graph's curves (edinburgh-live.ts builds it with {curves: true} on the same rails).
 const ballast=new Batch(),rails=new Batch(),lines:number[]=[],sleepers:V3[]=[],railLines:Pt[][]=[];
 addTrackLines(waverleyTrackLines(data,options.curves!==false),WAVERLEY_LEVELS,{ballast,rails,sleepers,railLines});
 for(const [ax,az,bx,bz]of lineSegments(railLines))lines.push(ax,.004,az,bx,.004,bz);
 add(track,ballast,material('ballast'),'waverley-ballast');add(track,rails,material('steel'),'waverley-rail-heads');
 if(lines.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(lines,3));geometries.add(g);const lineMaterial=new THREE.LineBasicMaterial({color:0xc3c8cc});ownedMaterials.add(lineMaterial);const m=new THREE.LineSegments(g,lineMaterial);m.name='waverley-distant-rails';track.add(m);stats.drawCalls++;}
 if(sleepers.length){
  const g=new THREE.BoxGeometry(2.6,.05,.25),m=new THREE.InstancedMesh(g,material('concrete'),sleepers.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
  sleepers.forEach(([x,yaw,z],i)=>{q.setFromAxisAngle(up,yaw);matrix.compose(new THREE.Vector3(x,-.125,z),q,new THREE.Vector3(1,1,1));m.setMatrixAt(i,matrix);});m.instanceMatrix.needsUpdate=true;m.name='waverley-sleepers';track.add(m);geometries.add(g);stats.triangles+=sleepers.length*12;stats.drawCalls++;stats.sleepers=sleepers.length;
 }
 const station=buildWaverleyStation(data,ground);
 const parts={terrain,track,platforms:station.platforms,roof:station.roof,buildings};
 for(const [key,value]of Object.entries(parts)){value.name=`waverley-${key}`;group.add(value);}
 parts.roof.visible=options.roofVisible!==false;parts.buildings.visible=options.cityVisible!==false;
 const frontage=landmarks?buildWaverleyFrontage(ground,contextTerrain):undefined;
 const cityLandmarks=landmarks?buildWaverleyCityLandmarks(ground):undefined;
 const elements=[station,city,frontage,cityLandmarks].filter(e=>e!==undefined);
 for(const e of [city,frontage,cityLandmarks])if(e)parts.buildings.add(e.group);
 for(const e of elements){stats.triangles+=e.stats.triangles;stats.drawCalls+=e.stats.drawCalls;}
 if(options.lighting!==false)addWaverleyLights(group);
 let disposed=false;
 return {group,parts,origin:{...data.origin},attribution:`${data.attribution}; ${terrainFile.attribution}`,groundAttribution:terrainFile.attribution,terrain:ground,stats,buildingIds:city.buildingIds,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const e of elements)e.dispose();for(const g of geometries)g.dispose();for(const m of ownedMaterials)m.dispose();group.clear();}};
}
