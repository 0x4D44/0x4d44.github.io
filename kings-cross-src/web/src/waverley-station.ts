// W1 station: the platforms (tops and faces) and the mapped roofs, the 1890s ridge-and-furrow train shed (waverley-roof.ts) among them.
// Horizontal geometry is OSM (ODbL). The 0.915 m platform height and the roof's numeric profile are ASSUMED (waverley-scene.ts,
// waverley-roof.ts). waverley-scene.ts calls buildWaverleyStation once and adds its two groups as the scene's platforms and roof parts.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {WaverleyScene as WaverleyData} from '../../core/waverley-data.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import type {WaverleyArea} from '../../core/waverley-data.ts';
import {stationTexture} from './waverley-station-textures.ts';
import {convexHull,ridgeRoofBatches} from './waverley-roof.ts';
import frontage from './data/waverley-frontage.json' with {type:'json'};
import {WAVERLEY_LEVELS,fillSurface,meshAdder} from './waverley-mesh.ts';
import {paintMaterial,waverleyStationPlan,waverleyStructureBatches} from './waverley-station-structure.ts';
import {centralBlockBatches,WAVERLEY_CENTRAL_BLOCK_ID} from './waverley-station-block.ts';

/** The mapped Waverley station roof (OSM relation/240040): drawn as the ridge-and-furrow shed, and flattened under by waverley-scene.ts. */
export const WAVERLEY_STATION_ROOF_ID='relation/240040';
/** The flat 8 m slab OSM maps over Waverley Steps: not drawn here; the steps and their cover are W2's (waverley-frontage.ts). */
export const WAVERLEY_STEPS_ROOF_ID='way/577519823';
/** The bridges that cross over the station roof, North Bridge (way/380552925) and Waverley Bridge (way/377738788), as convex outlines:
 * the roof stops at them (R-wv2-c2: the roof meets North Bridge's flank; R-wv1-a3: the roof ends east of Waverley Bridge). The rings are
 * W2's OSM data (data/waverley-frontage.json), read only; each is all but straight-sided, so its hull is its outline. */
export const WAVERLEY_ROOF_CUTOUTS:readonly Pt[][]=frontage.bridges.map(b=>convexHull(b.ring.map(p=>[p[0],p[1]] as Pt)));
/** Mapped city blocks W1 draws itself, so waverley-scene.ts leaves them out of the city loop, as it does for WAVERLEY_FRONTAGE_OMIT_IDS
 *  and WAVERLEY_CITY_OMIT_IDS: the central block (waverley-station-block.ts). */
export const WAVERLEY_STATION_OMIT_IDS:readonly string[]=[WAVERLEY_CENTRAL_BLOCK_ID];
/**
 * The roof's west end on the south half, run out to Waverley Bridge's east face (a lead ruling for round 2, against the rubric's "unchanged
 * OSM outline": R-wv1-a3 shows the glazing reaching the bridge, where OSM's outline stops about 15 m short and leaves a strip of open track).
 * The extension is the quadrilateral between OSM's west edge (-57.9,-3.4)-(-48.2,31.5), the corner (-61.9,47.7) where OSM's outline already
 * meets the bridge, and the bridge's east face at z = -3.4, 5 cm off it so the roof's edge never lies on the face. The corner is entered
 * 0.5 m short of (-61.9,47.7) so the ring never passes through one point twice.
 */
export const WAVERLEY_ROOF_EXTENSION={from:[-48.2,31.5] as Pt,to:[-57.9,-3.4] as Pt,corner:[-61.9,47.7] as Pt,faceZ:-3.4,faceGap:.05,cornerInset:.5};
/** The station roof's outline with the west extension spliced in after `from` (OSM's corners matched to 0.2 m). An outline without those
 *  corners (a test fixture, or OSM redrawn) comes back unchanged; waverley-station.test.ts checks the real one is extended. */
export function waverleyRoofOutline(outer:readonly Pt[]):Pt[]{
 const E=WAVERLEY_ROOF_EXTENSION,ring=outer.length>1&&outer[0][0]===outer.at(-1)![0]&&outer[0][1]===outer.at(-1)![1]?outer.slice(0,-1):[...outer];
 const find=(q:Pt):number=>ring.findIndex(p=>Math.hypot(p[0]-q[0],p[1]-q[1])<.2);
 const i=find(E.from),j=find(E.to),k=find(E.corner);if(i<0||j<0||k<0||(i+1)%ring.length!==j)return ring;const c=ring[k];
 // Waverley Bridge's east face: the hull edge whose x is greatest at z = faceZ, among the edges spanning it.
 const wb=WAVERLEY_ROOF_CUTOUTS.find(h=>h.some(p=>p[0]<-90));if(!wb)return ring;let fx=-Infinity;
 for(let k=0;k<wb.length;k++){const a=wb[k],b=wb[(k+1)%wb.length];if((a[1]-E.faceZ)*(b[1]-E.faceZ)<=0&&a[1]!==b[1]){const x=a[0]+(b[0]-a[0])*(E.faceZ-a[1])/(b[1]-a[1]);if(x>fx)fx=x;}}
 const face:Pt=[fx+E.faceGap,E.faceZ],l=Math.hypot(c[0]-face[0],c[1]-face[1]),c2:Pt=[c[0]+(face[0]-c[0])/l*E.cornerInset,c[1]+(face[1]-c[1])/l*E.cornerInset];
 return [...ring.slice(0,i+1),c2,face,...ring.slice(i+1)];
}
/** The station roof with its outline extended (waverleyRoofOutline); the mapped one if it is missing. */
export function waverleyStationRoof<T extends Pick<WaverleyArea,'outer'|'holes'>>(roof:T|undefined):T|undefined{return roof&&{...roof,outer:waverleyRoofOutline(roof.outer)};}
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
 glazing.opacity=.78;glazing.forceSinglePass=true;glazing.side=THREE.BackSide;
 // From above, the aluminium cassettes (R-wv1-a, R-wv1-a3): silver-grey, near opaque, the bars visible (waverley-station-textures.ts). The
 // underside keeps the translucent KX glazing. Each mesh shows one face, so neither is drawn over the other.
 const cassettes=own(material('shedGlass').clone() as THREE.MeshLambertMaterial),cassetteMap=stationTexture('cassettes');cassettes.vertexColors=false;cassettes.side=THREE.FrontSide;
 // The pinned noon light is strong (sun 3.24, sky 1.02, exposure 1.25): the panes are toned down so a lit slope reads mid-grey, as in R-wv1-a.
 cassettes.color.setHex(cassetteMap?0x7a7a7a:0x606468);cassettes.map=cassetteMap;cassettes.emissive.setHex(0x101214);cassettes.emissiveMap=cassetteMap;cassettes.opacity=.97;cassettes.forceSinglePass=true;
 const stationRoof=waverleyStationRoof(data.roofs.find(r=>r.id===WAVERLEY_STATION_ROOF_ID)),plan=waverleyStationPlan(data,stationRoof,WAVERLEY_ROOF_CUTOUTS),structure=waverleyStructureBatches(plan);
 // Platforms: pale slab paving (R-wv1-b, R-wv1-b2: light grey flags, not asphalt), the KX coper/tactile/white-line strip on every track edge,
 // and darker faces (R-wv1-b: the platform wall under the coper is dark, weathered stone). Faces skip the seam between two polygons of one island.
 const platformTops=new Batch();
 for(const p of data.platforms)fillSurface(platformTops,p.path,[],()=>WAVERLEY_LEVELS.platform);
 const faceStone=own(material('stone').clone() as THREE.MeshLambertMaterial);faceStone.color.multiply(new THREE.Color(0x5e5a54));
 // Paving: 0.6 m flags (waverley-station-textures.ts `flags`) where there is a document; the KX slab texture otherwise.
 const flagMap=stationTexture('flags'),paving=own(material('concourseFloor').clone() as THREE.MeshLambertMaterial);if(flagMap){paving.map=flagMap;paving.color.setHex(0xffffff);}
 const blister=own(material('platformEdgeStrip').clone() as THREE.MeshLambertMaterial),blisterMap=stationTexture('blister');blister.map=blisterMap;blister.color.setHex(blisterMap?0xffffff:0xcfae3a);
 add(platforms,platformTops,paving,'waverley-platform-surfaces');add(platforms,structure.faces,faceStone,'waverley-platform-faces');
 structure.edges.append(structure.lip);add(platforms,structure.edges,own(paintMaterial(material('platformEdgeStrip'))),'waverley-platform-edges');
 add(platforms,structure.tactile,blister,'waverley-platform-tactile');
 add(platforms,structure.fittings,own(paintMaterial(material('whiteSteel'))),'waverley-columns-and-furniture');
 // The central block (waverley-station-block.ts), standing on the flattened station floor.
 const block=data.buildings.find(b=>b.id===WAVERLEY_CENTRAL_BLOCK_ID);
 if(block){
  const parts=centralBlockBatches(block,ground.rangeUnder(block.outer,4).min),sandstone=own(material('stone').clone() as THREE.MeshLambertMaterial);sandstone.vertexColors=true;
  // Divide out the stone texture's own average (materials.ts stone, 0xa99a7c), so the block's colour is its paint and the texture adds only coursing.
  const avg=new THREE.Color(0xa99a7c);if(sandstone.map)sandstone.color.setRGB(1/avg.r,1/avg.g,1/avg.b);else sandstone.color.setHex(0xffffff);
  const blockTop=own(material('slate').clone() as THREE.MeshLambertMaterial);blockTop.color.multiply(new THREE.Color(0xada99f));
  add(platforms,parts.stone,sandstone,'waverley-central-block');add(platforms,parts.windows,material('sash'),'waverley-central-block-windows');add(platforms,parts.top,blockTop,'waverley-central-block-top');
 }
 const roof=new Batch(),roofRunners=new Batch(),roofStrips=new Batch();
 for(const r of data.roofs){
  if(r.id===WAVERLEY_STATION_ROOF_ID){
   const shaped=ridgeRoofBatches(stationRoof!.outer,r.holes,undefined,undefined,WAVERLEY_ROOF_CUTOUTS);
   for(const [from,to]of [[shaped.glass,roof],[shaped.ribs,roofRunners],[shaped.solid,roofStrips]])to.append(from);
  }else if(r.id!==WAVERLEY_STEPS_ROOF_ID){const base=ground.rangeUnder(r.outer,16).mean;fillSurface(roof,r.outer,r.holes,()=>base+r.height);}
 }
 add(roofGroup,roof,cassettes,'waverley-mapped-roofs');
 // The underside shares the top's geometry: one buffer, two draws.
 const top=roofGroup.getObjectByName('waverley-mapped-roofs') as THREE.Mesh|undefined;
 if(top){const under=new THREE.Mesh(top.geometry,glazing);under.name='waverley-roof-underside';roofGroup.add(under);stats.triangles+=roof.triangles;stats.drawCalls++;}
 add(roofGroup,roofRunners,material('ribPaint'),'waverley-roof-runners');
 // The opaque gutter walkways and ridge cappings over the glazing (waverley-roof.ts WAVERLEY_ROOF_BANDS): aluminium grey, both sides.
 const strips=own(material('whiteSteel').clone() as THREE.MeshLambertMaterial);strips.color.setHex(0x9ea4a9);strips.side=THREE.DoubleSide;
 add(roofGroup,roofStrips,strips,'waverley-roof-strips');
 add(roofGroup,structure.ironwork,own(paintMaterial(material('whiteSteel'))),'waverley-roof-ironwork');
 let disposed=false;
 return {platforms,roof:roofGroup,stats,omitBuildingIds:[...WAVERLEY_STATION_OMIT_IDS],dispose(){if(disposed)return;disposed=true;for(const g of [platforms,roofGroup]){g.removeFromParent();g.clear();}for(const g of geometries)g.dispose();for(const m of owned)m.dispose();}};
}
