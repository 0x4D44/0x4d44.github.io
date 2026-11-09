// W1 station: the platforms (tops and faces) and the mapped roofs, the 1890s ridge-and-furrow train shed (waverley-roof.ts) among them.
// Horizontal geometry is OSM (ODbL). The 0.915 m platform height and the roof's numeric profile are ASSUMED (waverley-scene.ts,
// waverley-roof.ts). waverley-scene.ts calls buildWaverleyStation once and adds its two groups as the scene's platforms and roof parts.
import * as THREE from 'three';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import {ridgeRoofBatches} from './waverley-roof.ts';
import {WAVERLEY_LEVELS,fillSurface,meshAdder,walls} from './waverley-mesh.ts';

/** The mapped Waverley station roof (OSM relation/240040): drawn as the ridge-and-furrow shed, and flattened under by waverley-scene.ts. */
export const WAVERLEY_STATION_ROOF_ID='relation/240040';
export interface WaverleyStation {
 platforms:THREE.Group;
 roof:THREE.Group;
 stats:{triangles:number;drawCalls:number};
 /** City building ids this element draws itself, so the generic city loop leaves them out (none today). */
 omitBuildingIds:string[];
 dispose():void;
}
export function buildWaverleyStation(data:Pick<WaverleyData,'platforms'|'roofs'>,ground:Pick<Terrain,'rangeUnder'>):WaverleyStation {
 const platforms=new THREE.Group(),roofGroup=new THREE.Group();platforms.name='waverley-platforms';roofGroup.name='waverley-roof';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries);
 // Own variant of the KX glazing; never mutate the cached shared material.
 const glazing=material('shedGlass').clone() as THREE.MeshLambertMaterial;glazing.color.multiply(new THREE.Color(0xf2f4ef));glazing.vertexColors=false;
 glazing.opacity=.78;glazing.forceSinglePass=true;
 const platformTops=new Batch(),platformSides=new Batch();
 for(const p of data.platforms){fillSurface(platformTops,p.path,[],()=>WAVERLEY_LEVELS.platform);walls(platformSides,p.path,[],()=>WAVERLEY_LEVELS.ground,()=>WAVERLEY_LEVELS.platform);}
 add(platforms,platformTops,material('asphalt'),'waverley-platform-surfaces');add(platforms,platformSides,material('stone'),'waverley-platform-faces');
 const roof=new Batch(),roofRunners=new Batch();
 for(const r of data.roofs){
  if(r.id===WAVERLEY_STATION_ROOF_ID){
   const shaped=ridgeRoofBatches(r.outer,r.holes);
   // Batch.append is intentionally unnecessary: copy faces while preserving their
   // physical normals/UVs. Both pieces still make one draw per material overall.
   for(const [from,to]of [[shaped.glass,roof],[shaped.ribs,roofRunners]]){
    const base=to.count;to.positions.push(...from.positions);to.normals.push(...from.normals);to.uvs.push(...from.uvs);to.indices.push(...from.indices.map(i=>i+base));
   }
  }else{const base=ground.rangeUnder(r.outer,16).mean;fillSurface(roof,r.outer,r.holes,()=>base+r.height);}
 }
 add(roofGroup,roof,glazing,'waverley-mapped-roofs');
 add(roofGroup,roofRunners,material('ribPaint'),'waverley-roof-runners');
 let disposed=false;
 return {platforms,roof:roofGroup,stats,omitBuildingIds:[],dispose(){if(disposed)return;disposed=true;for(const g of [platforms,roofGroup]){g.removeFromParent();g.clear();}for(const g of geometries)g.dispose();glazing.dispose();}};
}
