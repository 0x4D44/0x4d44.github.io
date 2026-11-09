// W3 city, round 1: the land-use drape, the trees, the roofs and the LiDAR heights (web/src/waverley-city-*.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {buildWaverleyScene,waverleyRailwayFootprint} from '../src/waverley-scene.ts';
import {LANDUSE,DRAPE_LIFT,Footprints,placeTrees} from '../src/waverley-city-ground.ts';
import {roofPlan,roofSurface,withCreases,rectangleOf,ROOF_ASSUMED,CHIMNEY} from '../src/waverley-city-roofs.ts';
import {cityHeight,LIDAR_HEIGHTS} from '../src/waverley-city-heights.ts';
import {buildWaverleyCity} from '../src/waverley-city.ts';
import {Batch} from '../src/materials.ts';
import {unpackWaverleyScene} from '../../core/waverley-data.ts';
import sceneFile from '../src/data/waverley-scene.json' with {type:'json'};
import type {Pt} from '../../core/geo.ts';

const data=unpackWaverleyScene(sceneFile);
const scene=buildWaverleyScene({lighting:false});
const pip=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
test.after(()=>scene.dispose());

test('the gardens are OSM land use: both Princes Street Gardens and Calton Hill are mapped green, with paths and trees',()=>{
 const green=[...LANDUSE.areas.grass,...LANDUSE.areas.garden];
 const inGreen=(x:number,z:number)=>green.some(([o,...h])=>pip(x,z,o)&&!h.some(r=>pip(x,z,r)));
 // West Princes Street Gardens (relation/963806) below the Castle, East Princes Street Gardens (way/5585005) by the Scott Monument,
 // Calton Hill park (way/1519743672) by the Dugald Stewart Monument: the frozen cameras' standpoints
 assert.ok(inGreen(-520,150),'West Princes Street Gardens');assert.ok(inGreen(-240,10),'East Princes Street Gardens');assert.ok(inGreen(365,-301),'Calton Hill');
 assert.ok(!inGreen(-600,30),'Princes Street itself is not a lawn');
 assert.ok(LANDUSE.trees.length===2405,'every mapped natural=tree node');assert.ok(LANDUSE.paths.length>300&&LANDUSE.roads.length>700);
 assert.ok(LANDUSE.cliffs.length>=10,'the mapped Castle Rock and Calton Craigs cliffs');
});

test('the drape sits just over the drawn terrain everywhere it is drawn, never under it, and leaves the railway bed alone',()=>{
 const cover=scene.parts.buildings.getObjectByName('waverley-ground-cover') as THREE.Mesh;assert.ok(cover);
 const m=cover.material as THREE.MeshLambertMaterial;assert.ok(m.polygonOffset&&m.polygonOffsetFactor<0&&m.polygonOffsetUnits<0,'pulled forward against the terrain, pushed back');
 cover.updateMatrixWorld(true);const ray=new THREE.Raycaster();let hits=0,below=0,worst=0;
 for(let i=0;i<600;i++){
  const x=-900+((i*7919)%1980),z=-610+((i*104729)%1210),g=scene.terrain.heightAt(x,z);
  ray.set(new THREE.Vector3(x,500,z),new THREE.Vector3(0,-1,0));const h=ray.intersectObject(cover)[0];
  if(!h){assert.ok(Math.abs(g+.2)<3,`only the flattened railway bed is left bare (x ${x}, z ${z}, ground ${g})`);continue;}
  hits++;const lift=h.point.y-g;worst=Math.max(worst,lift);if(lift<.02)below++;
 }
 assert.ok(hits>500,`${hits} hits`);assert.equal(below,0,'the drape never sinks into the terrain');assert.ok(worst<DRAPE_LIFT+.35,`within ${worst} m of the ground`);
 // nothing of the drape over the ballast
 for(const strip of waverleyRailwayFootprint(data).slice(0,200)){const c=strip.reduce((a,p)=>[a[0]+p[0]/strip.length,a[1]+p[1]/strip.length],[0,0]);
  if(Math.abs(scene.terrain.heightAt(c[0],c[1])+.2)>.001)continue;ray.set(new THREE.Vector3(c[0],500,c[1]),new THREE.Vector3(0,-1,0));assert.equal(ray.intersectObject(cover).length,0,'no drape over the track bed');}
});

test('no tree stands in a building or on the railway, and every crown clears the nearest wall',()=>{
 const fp=new Footprints([...data.buildings,...data.roofs].map(b=>b.outer)),trees=placeTrees(scene.terrain,fp);
 assert.ok(trees.length>2000);
 for(const t of trees){assert.ok(Math.abs(t.y+.2)>=.3,'off the railway bed');const room=fp.clearance(t.x,t.z,30);assert.ok(room>0,'not in a footprint');assert.ok(t.crown<=room+1e-9,'crown clears the nearest wall');}
 const placed=trees.filter(t=>t.kind==='tree').length;assert.ok(placed>1200&&placed<=2405,`${placed} mapped trees stand`);
});

test('an ASSUMED tenement roof: 40 degree pitch, its rise capped into a platform, walls meeting the roof edge to edge',()=>{
 const ring:Pt[]=[[0,0],[30,0],[30,16],[0,16]],b={id:'t',outer:ring,holes:[],height:18,minHeight:0,heightBasis:'ASSUMED',tags:{building:'apartments'},kind:'building' as const};
 const p=roofPlan(b,10);assert.equal(p.shape,'planes');assert.ok(p.assumed);
 assert.ok(Math.abs(p.top-28)<1e-9);assert.ok(Math.abs(p.eave-(28-ROOF_ASSUMED.maxRise))<1e-9,'rise capped at maxRise: 8 m half-width at 40 degrees would rise 6.7 m');
 assert.ok(Math.abs(p.at(15,8)-28)<1e-9,'the platform');assert.ok(Math.abs(p.at(15,0)-p.eave)<1e-9,'the eave on the long walls');
 assert.ok(Math.abs(p.at(15,1)-(p.eave+Math.tan(40*Math.PI/180)))<1e-9,'40 degrees');
 const wall=withCreases(ring,p.creases);assert.equal(wall.length,4+6,'each gable wall gets the ridge line and the two platform edges');
 const batch=new Batch();roofSurface(batch,ring,[],p);
 let area=0;const pos=batch.positions;for(let i=0;i<batch.indices.length;i+=3){const [a,c,d]=[0,1,2].map(k=>batch.indices[i+k]*3);area+=Math.abs((pos[c]-pos[a])*(pos[d+2]-pos[a+2])-(pos[d]-pos[a])*(pos[c+2]-pos[a+2]))/2;}
 assert.ok(Math.abs(area-480)<1e-6,'the roof covers the plan exactly once');
 // every piece is planar on the roof: no triangle spans a crease (its centroid lies on the roof too)
 for(let i=0;i<batch.indices.length;i+=3){const c=[0,1,2].map(k=>batch.indices[i+k]*3);const [x,y,z]=[0,1,2].map(o=>c.reduce((s,j)=>s+pos[j+o],0)/3);assert.ok(Math.abs(y-p.at(x,z))<1e-6,'triangle on the roof planes');}
 for(let i=0;i<pos.length;i+=3)assert.ok(Math.abs(pos[i+1]-p.at(pos[i],pos[i+2]))<1e-9&&pos[i+1]>=p.eave-1e-9&&pos[i+1]<=p.top+1e-9);
 assert.equal(p.chimneys.length,1+Math.round(2*(15-CHIMNEY.along)/CHIMNEY.spacing),'gable stacks and party-wall stacks along the ridge');
});

test('roof tags win: a mapped gabled roof keeps its OSM height to the ridge, a flat-kind or tall block stays flat',()=>{
 const ring:Pt[]=[[0,0],[12,0],[12,8],[0,8]],base={id:'g',outer:ring,holes:[],minHeight:0,heightBasis:'OSM height',kind:'building' as const};
 const g=roofPlan({...base,height:15,tags:{building:'yes','roof:shape':'gabled','roof:height':'3'}},0);assert.ok(!g.assumed);assert.equal(g.top,15);assert.equal(g.eave,12);assert.equal(g.at(6,4),15,'the ridge');
 assert.equal(roofPlan({...base,height:15,tags:{building:'office'}},0).shape,'flat');assert.equal(roofPlan({...base,height:40,tags:{building:'yes'}},0).shape,'flat');
 const r=rectangleOf([[0,0],[10,10],[5,15],[-5,5]]);assert.ok(Math.abs(r.L-Math.hypot(10,10)/2)<1e-9&&Math.abs(r.W-Math.hypot(5,5)/2)<1e-9,'minimum-area rectangle of a turned plan');
});

test('LiDAR heights replace ASSUMED ones: fewer blocks assumed than before, OSM heights untouched',()=>{
 const city=buildWaverleyCity(data,scene.terrain);
 try{
  const before=data.buildings.filter(b=>city.buildingIds.includes(b.id)&&b.heightBasis.startsWith('ASSUMED')).length;
  assert.equal(city.heightBasis.OSM+city.heightBasis.LiDAR+city.heightBasis.ASSUMED,city.buildingIds.length);
  assert.ok(city.heightBasis.ASSUMED<before/4,`${city.heightBasis.ASSUMED} ASSUMED of ${before} before`);assert.ok(city.heightBasis.LiDAR>2000);
  for(const b of data.buildings.filter(b=>!b.heightBasis.startsWith('ASSUMED')).slice(0,50))assert.equal(cityHeight(b).height,b.height);
  assert.ok(LIDAR_HEIGHTS.size>2500);for(const [,h]of LIDAR_HEIGHTS)assert.ok(h.height>=2.5&&h.height<=80);
 }finally{city.dispose();}
});

test('waverley-roads.json (for the street lamps) loads: OSM highway lines with their class and licence, every point inside the scene',async()=>{
 const {default:roads}=await import('../src/data/waverley-roads.json',{with:{type:'json'}});
 assert.match(roads.attribution,/OpenStreetMap/);assert.match(roads.licence,/ODbL/);
 const {x0,z0,x1,z1}=scene.terrain.extent;assert.deepEqual(roads.extent,{x0,z0,x1,z1});
 assert.ok(roads.roads.length>500);
 for(const r of roads.roads){assert.match(r.id,/^way\/\d+$/);assert.ok(typeof r.highway==='string'&&r.highway.length>0);assert.ok(r.path.length>=2);
  for(const [x,z]of r.path)assert.ok(x>=x0&&x<=x1&&z>=z0&&z<=z1,`${r.id} point ${x},${z} outside the scene`);}
 for(const c of ['primary','secondary','tertiary','residential','service','pedestrian'])assert.ok(roads.roads.some(r=>r.highway===c),c);
 for(const c of ['footway','steps','path','cycleway','track'])assert.ok(roads.roads.every(r=>r.highway!==c||r.bridge),`no ${c} off a bridge`);
 for(const r of roads.roads)for(const [x,z]of r.path)assert.ok(Number.isInteger(x*2)&&Number.isInteger(z*2),'0.5 m rounding');
 assert.ok(roads.roads.some(r=>r.name==='Princes Street'&&r.highway==='primary'));
});

test('the city stays one batch per material: walls, plain ashlar, roofs; trees and the drape instanced or single',()=>{
 const names:string[]=[];scene.parts.buildings.traverse(o=>{if(o instanceof THREE.Mesh)names.push(o.name);});
 for(const n of ['waverley-building-walls','waverley-building-ashlar','waverley-building-tops','waverley-ground-cover','waverley-tree-crowns','waverley-wood-crowns','waverley-tree-trunks'])assert.equal(names.filter(x=>x===n).length,1,n);
 assert.ok(scene.parts.buildings.getObjectByName('waverley-tree-crowns') instanceof THREE.InstancedMesh);
});
