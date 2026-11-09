// W1 station: the platforms (tops and faces) and the mapped roofs, the 1890s ridge-and-furrow train shed (waverley-roof.ts) among them.
// Horizontal geometry is OSM (ODbL). The 0.915 m platform height and the roof's numeric profile are ASSUMED (waverley-scene.ts,
// waverley-roof.ts). waverley-scene.ts calls buildWaverleyStation once and adds its two groups as the scene's platforms and roof parts.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import {convexHull,ridgeRoofBatches} from './waverley-roof.ts';
import frontage from './data/waverley-frontage.json' with {type:'json'};
import {WAVERLEY_LEVELS,fillSurface,meshAdder} from './waverley-mesh.ts';
import {paintMaterial,waverleyStationPlan,waverleyStructureBatches} from './waverley-station-structure.ts';
import {centralBlockBatches,WAVERLEY_CENTRAL_BLOCK_ID} from './waverley-station-block.ts';

/** The mapped Waverley station roof (OSM relation/240040): drawn as the ridge-and-furrow shed, and flattened under by waverley-scene.ts. */
export const WAVERLEY_STATION_ROOF_ID='relation/240040';
/** Mapped city blocks W1 draws itself (e.g. the central block), so waverley-scene.ts leaves them out of the city loop, as it does for
 *  WAVERLEY_FRONTAGE_OMIT_IDS and WAVERLEY_CITY_OMIT_IDS. Empty until W1 draws a replacement. */
/** The flat 8 m slab OSM maps over Waverley Steps: not drawn here; the steps and their cover are W2's (waverley-frontage.ts). */
export const WAVERLEY_STEPS_ROOF_ID='way/577519823';
/** The bridges that cross over the station roof, North Bridge (way/380552925) and Waverley Bridge (way/377738788), as convex outlines:
 * the roof stops at them (R-wv2-c2: the roof meets North Bridge's flank; R-wv1-a3: the roof ends east of Waverley Bridge). The rings are
 * W2's OSM data (data/waverley-frontage.json), read only; each is all but straight-sided, so its hull is its outline. */
export const WAVERLEY_ROOF_CUTOUTS:readonly Pt[][]=frontage.bridges.map(b=>convexHull(b.ring.map(p=>[p[0],p[1]] as Pt)));
export const WAVERLEY_STATION_OMIT_IDS:readonly string[]=[WAVERLEY_CENTRAL_BLOCK_ID];
export interface WaverleyStation {
 platforms:THREE.Group;
 roof:THREE.Group;
 stats:{triangles:number;drawCalls:number};
 /** City building ids this element draws itself, so the generic city loop leaves them out: the central block. */
 omitBuildingIds:string[];
 dispose():void;
}
export function buildWaverleyStation(data:Pick<WaverleyData,'platforms'|'roofs'|'rails'|'buildings'>,ground:Pick<Terrain,'rangeUnder'>):WaverleyStation {
 const platforms=new THREE.Group(),roofGroup=new THREE.Group();platforms.name='waverley-platforms';roofGroup.name='waverley-roof';
 const stats={triangles:0,drawCalls:0},geometries=new Set<THREE.BufferGeometry>(),add=meshAdder(stats,geometries),owned:THREE.Material[]=[];
 const own=<T extends THREE.Material>(m:T):T=>{owned.push(m);return m;};
 // Own variant of the KX glazing; never mutate the cached shared material.
 const glazing=own(material('shedGlass').clone() as THREE.MeshLambertMaterial);glazing.color.multiply(new THREE.Color(0xf2f4ef));glazing.vertexColors=false;
 glazing.opacity=.78;glazing.forceSinglePass=true;
 const stationRoof=data.roofs.find(r=>r.id===WAVERLEY_STATION_ROOF_ID),plan=waverleyStationPlan(data,stationRoof,WAVERLEY_ROOF_CUTOUTS),structure=waverleyStructureBatches(plan);
 // Platforms: pale slab paving (R-wv1-b, R-wv1-b2: light grey flags, not asphalt), the KX coper/tactile/white-line strip on every track edge,
 // and darker faces (R-wv1-b: the platform wall under the coper is dark, weathered stone). Faces skip the seam between two polygons of one island.
 const platformTops=new Batch();
 for(const p of data.platforms)fillSurface(platformTops,p.path,[],()=>WAVERLEY_LEVELS.platform);
 const faceStone=own(material('stone').clone() as THREE.MeshLambertMaterial);faceStone.color.multiply(new THREE.Color(0x8a8278));
 add(platforms,platformTops,material('concourseFloor'),'waverley-platform-surfaces');add(platforms,structure.faces,faceStone,'waverley-platform-faces');
 add(platforms,structure.edges,own(paintMaterial(material('platformEdgeStrip'))),'waverley-platform-edges');
 add(platforms,structure.fittings,own(paintMaterial(material('whiteSteel'))),'waverley-columns-and-furniture');
 // The central block (waverley-station-block.ts), standing on the flattened station floor.
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID);
 if(block){
  const parts=centralBlockBatches(block,ground.rangeUnder(block.outer,4).min),sandstone=own(material('stone').clone() as THREE.MeshLambertMaterial);sandstone.vertexColors=true;
  const blockTop=own(material('slate').clone() as THREE.MeshLambertMaterial);blockTop.color.multiply(new THREE.Color(0xada99f));
  add(platforms,parts.stone,sandstone,'waverley-central-block');add(platforms,parts.windows,material('sash'),'waverley-central-block-windows');add(platforms,parts.top,blockTop,'waverley-central-block-top');
 }
 const roof=new Batch(),roofRunners=new Batch(),roofStrips=new Batch();
 for(const r of data.roofs){
  if(r.id===WAVERLEY_STATION_ROOF_ID){
   const shaped=ridgeRoofBatches(r.outer,r.holes,undefined,undefined,WAVERLEY_ROOF_CUTOUTS);
   for(const [from,to]of [[shaped.glass,roof],[shaped.ribs,roofRunners],[shaped.solid,roofStrips]])to.append(from);
  }else if(r.id!==WAVERLEY_STEPS_ROOF_ID){const base=ground.rangeUnder(r.outer,16).mean;fillSurface(roof,r.outer,r.holes,()=>base+r.height);}
 }
 add(roofGroup,roof,glazing,'waverley-mapped-roofs');
 add(roofGroup,roofRunners,material('ribPaint'),'waverley-roof-runners');
 // The opaque gutter walkways and ridge cappings over the glazing (waverley-roof.ts WAVERLEY_ROOF_BANDS): aluminium grey, both sides.
 const strips=own(material('whiteSteel').clone() as THREE.MeshLambertMaterial);strips.color.setHex(0x9ea4a9);strips.side=THREE.DoubleSide;
 add(roofGroup,roofStrips,strips,'waverley-roof-strips');
 add(roofGroup,structure.ironwork,own(paintMaterial(material('whiteSteel'))),'waverley-roof-ironwork');
 let disposed=false;
 return {platforms,roof:roofGroup,stats,omitBuildingIds:[...WAVERLEY_STATION_OMIT_IDS],dispose(){if(disposed)return;disposed=true;for(const g of [platforms,roofGroup]){g.removeFromParent();g.clear();}for(const g of geometries)g.dispose();for(const m of owned)m.dispose();}};
}
