// P3 west extension, the ground over PERTH_WEST_EXTENT (web/src/perth-west-cover.ts): the file's decode, the carriageways painted with the
// streets and kept clear of trees, the canvas size, the mesh names and the gardens' frame. The west the build tests use is synthetic (a
// 160 x 320 m plane with a wood and two carriageways), so each build is quick; the committed file is checked for what the scene relies on.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {terrainFromFunction} from '../../core/terrain.ts';
import {PERTH_WEST_EXTENT} from '../../tools/perth-west-extent.ts';
import {buildWaverleyCityGround,CANVAS_WIDTH,Footprints,GROUND_COLOURS,roadColour} from '../src/waverley-city-ground.ts';
import {perthGardens,streetIndex} from '../src/perth-gardens.ts';
import {buildPerthWestCover,decodePerthWest,decodeTrunk,PERTH_WEST,PERTH_WEST_CANVAS,PERTH_WEST_FILE,PERTH_WEST_LANDUSE,perthWestGardens,ribbon,trunkClearance} from '../src/perth-west-cover.ts';
import type {PerthWestFile,TrunkRoad} from '../src/perth-west-cover.ts';

const EXT={x0:0,z0:0,x1:160,z1:320};
/** Delta integers at `q` metres, as the land-use files hold their lines and rings. */
const enc=(pts:readonly Pt[],q:number):number[]=>{const out:number[]=[];let px=0,pz=0;for(const [x,z] of pts){const qx=Math.round(x/q),qz=Math.round(z/q);out.push(qx-px,qz-pz);px=qx;pz=qz;}return out;};
const area=(r:readonly Pt[])=>{let s=0;for(let i=0,j=r.length-1;i<r.length;j=i++)s+=r[j]![0]*r[i]![1]-r[i]![0]*r[j]![1];return Math.abs(s)/2;};
const pip=(x:number,z:number,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i]![1]>z)!==(p[j]![1]>z)&&x<(p[j]![0]-p[i]![0])*(z-p[i]![1])/(p[j]![1]-p[i]![1])+p[i]![0])yes=!yes;return yes;};
const WOOD:Pt[]=[[8,8],[152,8],[152,312],[8,312]];
const way=(id:number,line:Pt[],width:number,extra:object={})=>({id:`way/${id}`,hw:'trunk',ref:'A9',name:'',lanes:2,width,basis:'OSM lanes',oneway:true,dual:true,roundabout:false,bridge:false,line:enc(line,.5),...extra});
/** A west land-use file over EXT: a wood, a street across it, two mapped trees, and the two carriageways of a dual carriageway 15 m apart. */
function westFile(over:Record<string,unknown>={}):PerthWestFile{
 const empty={park:[],grass:[],garden:[],wood:[],scrub:[],water:[],rock:[],paved:[],flower:[],pitch:[]};
 return {attribution:'test',source:'test',q:2,extent:EXT,areas:{...empty,wood:[[enc(WOOD,2)]]},roads:{'7':[enc([[0,100],[160,100]],2)]},paths:{},trees:enc([[30,30],[120,200]],2),treeTags:[],cliffs:[],walls:[],castleWalls:[],outlooks:[],residential:[],
  trunk:{q:.5,basis:'test',assumed:{lane:3.65,hardStrip:1,hardShoulder:3.3,slipMin:6},ways:[way(1,[[70,0],[70,320]],9.3),way(2,[[85,320],[85,0]],9.3)],junctions:[],roundabouts:[]},...over} as unknown as PerthWestFile;
}
const ground=terrainFromFunction(x=>30+.02*x,EXT,16);
const west=decodePerthWest(westFile());
const coverOf=(g:{group:THREE.Group})=>g.group.getObjectByName('perth-west-ground-cover') as THREE.Mesh;

test('the trunk block decodes at its own 0.5 m quantum, and its ways join the streets at their own widths',()=>{
 const f=westFile({residential:[[enc([[100,200],[150,200],[150,300],[100,300]],2)]]}),w=decodePerthWest(f);
 assert.deepEqual(w.trunk.map(t=>t.line),[[[70,0],[70,320]],[[85,320],[85,0]]]);
 assert.deepEqual(w.trunk.map(t=>[t.id,t.width,t.basis,t.lanes,t.oneway,t.dual]),[['way/1',9.3,'OSM lanes',2,true,true],['way/2',9.3,'OSM lanes',2,true,true]]);
 // 0.5 m, not the ground's 2 m: a carriageway kept at 70.5 is not pulled to 70 or 71
 assert.deepEqual(decodeTrunk({q:.5,ways:[way(3,[[70.5,.5],[70.5,10]],9.3)] as never}).map(t=>t.line),[[[70.5,.5],[70.5,10]]]);
 // the painter's streets: the file's street at its class width, and each carriageway at its own width, on the very same lines
 assert.deepEqual(w.landuse.roads.map(r=>r.width).sort((a,b)=>a-b),[7,9.3,9.3]);
 assert.deepEqual(w.landuse.roads.filter(r=>r.width===9.3).map(r=>r.line),w.trunk.map(t=>t.line));
 assert.deepEqual(w.landuse.areas.wood[0]![0],WOOD);assert.deepEqual(w.landuse.trees,[[30,30],[120,200]]);assert.deepEqual(w.landuse.extent,EXT);
 assert.deepEqual(w.residential,[[[[100,200],[150,200],[150,300],[100,300]]]]);
 assert.equal(w.roundabouts.length,0);assert.equal(w.junctions.length,0);
});

test('a carriageway ribbon: the line\'s two edges half a width out, mitred at a turn, the mitre held to twice the half width',()=>{
 const half=6.65;
 const straight=ribbon([[70,0],[70,320]],half);
 assert.equal(straight.length,4);assert.ok(Math.abs(area(straight)-2*half*320)<1e-9,'a 13.3 x 320 m rectangle');
 assert.ok(straight.every(p=>Math.abs(Math.abs(p[0]-70)-half)<1e-9),'edges at +-half');
 // a right angle: the corner's mitre point is half*sqrt(2) out, and the ribbon holds exactly 2 half x length
 const L=ribbon([[0,0],[100,0],[100,100]],5);
 assert.equal(L.length,6);assert.ok(Math.abs(area(L)-2*5*200)<1e-9,`area ${area(L)}`);
 assert.ok(L.some(p=>Math.abs(p[0]-95)<1e-9&&Math.abs(p[1]-5)<1e-9)&&L.some(p=>Math.abs(p[0]-105)<1e-9&&Math.abs(p[1]+5)<1e-9),'the inner and outer mitre points');
 // a hairpin: the mitre would run to infinity and is held to twice the half width
 const hair=ribbon([[0,0],[100,0],[0,10]],5),corner=hair.filter(p=>Math.hypot(p[0]-100,p[1])<50);
 assert.equal(corner.length,2);assert.ok(corner.every(p=>Math.abs(Math.hypot(p[0]-100,p[1])-10)<1e-9),'a hairpin\'s corner points sit exactly 2 x half out, not the 100 m the true mitre would run to');
 assert.deepEqual(ribbon([[1,1]],5),[]);assert.deepEqual(ribbon([],5),[]);
});

test('trunk clearance: one ring per carriageway of at least two points, its half width plus the verge out',()=>{
 const trunk=[{width:9.3,line:[[70,0],[70,320]]},{width:6,line:[[5,5]]},{width:6,line:[[100,0],[100,40]]}] as unknown as TrunkRoad[];
 const rings=trunkClearance(trunk);
 assert.equal(rings.length,2,'a one-point way has no outline');
 assert.ok(pip(70+6.6,100,rings[0]!)&&!pip(70+6.7,100,rings[0]!),'4.65 + 2 m verge');assert.ok(pip(70-6.6,100,rings[0]!)&&!pip(70-6.7,100,rings[0]!));
 assert.ok(pip(100+4.9,20,rings[1]!)&&!pip(100+5.1,20,rings[1]!),'a 6 m way: 3 + 2 m');
 const bare=trunkClearance(trunk,0);assert.ok(pip(70+4.6,100,bare[0]!)&&!pip(70+4.7,100,bare[0]!),'no verge');
 assert.equal(trunkClearance().length,PERTH_WEST.trunk.length,'the committed file\'s own ways by default');
});

test('the committed west file decodes to the extent: every trunk way is painted, none in the setts tone, and the A9 and M90 are there',()=>{
 const file=PERTH_WEST_FILE;
 assert.deepEqual(PERTH_WEST_LANDUSE.extent,PERTH_WEST_EXTENT);
 assert.equal(PERTH_WEST_LANDUSE.roads.length,Object.values(file.roads).flat().length+file.trunk.ways.length,'the streets and the trunk ways, together');
 assert.equal(PERTH_WEST.trunk.length,file.trunk.ways.length);assert.equal(PERTH_WEST.residential.length,file.residential.length);
 for(const t of PERTH_WEST.trunk){
  assert.ok(t.line.length>=2,`${t.id} has a line`);assert.ok(t.width>=6&&t.width<30,`${t.id} is ${t.width} m`);
  assert.notEqual(roadColour(t.width),GROUND_COLOURS.setts,`${t.id}: not the pedestrian setts tone`);
  assert.ok(PERTH_WEST_LANDUSE.roads.some(r=>r.width===t.width&&r.line.length===t.line.length&&r.line[0]![0]===t.line[0]![0]&&r.line[0]![1]===t.line[0]![1]),`${t.id} is painted at ${t.width} m`);
 }
 assert.ok(PERTH_WEST.trunk.some(t=>t.ref==='A9'&&t.dual),'the A9\'s carriageways');assert.ok(PERTH_WEST.trunk.some(t=>t.ref==='M90'&&t.oneway),'the M90');
 // the extent was widened to take in the A9 bypass: two A9 carriageways cross each of these z, both inside the extent
 const a9=PERTH_WEST.trunk.filter(t=>t.ref==='A9'&&!t.roundabout);
 for(const z of [-1400,-1000,-600,-200,0,200]){
  const xs=a9.flatMap(t=>{const out:number[]=[];for(let i=1;i<t.line.length;i++){const a=t.line[i-1]!,b=t.line[i]!;if((a[1]-z)*(b[1]-z)<=0&&a[1]!==b[1])out.push(a[0]+(b[0]-a[0])*(z-a[1])/(b[1]-a[1]));}return out;});
  assert.ok(xs.length>=2&&xs.every(x=>x>=PERTH_WEST_EXTENT.x0&&x<=PERTH_WEST_EXTENT.x1),`the A9's carriageways at z ${z}: x ${xs.map(Math.round).join(', ')}`);
 }
 // and Broxden's roundabout: one closed ring of A9 ways near the lead's (-2995, 360); every roundabout a plausible size
 const broxden=PERTH_WEST.roundabouts.find(r=>r.name==='Broxden Roundabout');
 assert.ok(broxden&&broxden.closed&&Math.hypot(broxden.x+2995,broxden.z-360)<30&&broxden.radius>20&&broxden.radius<100,JSON.stringify(broxden));
 for(const r of PERTH_WEST.roundabouts)assert.ok(r.radius>1&&r.radius<100&&r.x>=PERTH_WEST_EXTENT.x0-40&&r.x<=PERTH_WEST_EXTENT.x1+40,`roundabout at ${r.x}, ${r.z}`);
 assert.ok(PERTH_WEST.junctions.some(j=>j.ref==='12'&&j.name==='Broxden Roundabout'));
 assert.ok(/OpenStreetMap contributors/.test(file.attribution));
 // the one canvas: 1,024 across, so about 1,427 down, a texture no taller than 2,048 texels (a safe WebGL size)
 const {x0,z0,x1,z1}=PERTH_WEST_EXTENT;assert.equal(PERTH_WEST_CANVAS,1024);assert.ok(Math.round(PERTH_WEST_CANVAS*(z1-z0)/(x1-x0))<=2048);
});

test('trees keep clear of the carriageways: no tree stands on one or overhangs its verge, and without the clearance rings some would',()=>{
 const stands=(trees:readonly {x:number;z:number;crown:number}[],slack:number)=>trees.filter(t=>west.trunk.some(w=>Math.abs(t.x-w.line[0]![0])-t.crown<w.width/2+2-slack));
 const real=buildPerthWestCover(ground,new Footprints([]),undefined,west);
 try{
  const wood=real.trees.filter(t=>t.kind==='wood');assert.ok(wood.length>50,`${wood.length} wood trees stand in the wood`);
  assert.deepEqual(stands(real.trees,1e-6),[],'every crown ends at the verge or short of it');
  assert.equal(real.trees.filter(t=>t.kind==='tree').length,2,'both mapped trees stand');
 }finally{real.dispose();}
 // the control: the same wood and the same roads, but no trunk ways to clear (the painted streets are the same)
 const bare=buildPerthWestCover(ground,new Footprints([]),undefined,{...west,trunk:[]});
 try{const on=bare.trees.filter(t=>west.trunk.some(w=>Math.abs(t.x-w.line[0]![0])<w.width/2));assert.ok(on.length>=3,`${on.length} trees would stand on a carriageway`);}
 finally{bare.dispose();}
});

test('the cover is one draped mesh and one instanced tree draw, all named perth-west-*: the mapped trees stand in the wood\'s batch',()=>{
 const g=buildPerthWestCover(ground,new Footprints([]),undefined,west);
 try{
  const names:string[]=[];g.group.traverse(o=>{if(o.name)names.push(o.name);});
  assert.deepEqual(names.sort(),['perth-west-cover','perth-west-ground-cover','perth-west-wood-crowns'],'nothing is still waverley-*, and no draw of its own for the mapped trees');
  assert.equal(g.stats.drawCalls,2,'the cover and the trees');
  let meshes=0;g.group.traverse(o=>{if((o as THREE.Mesh).isMesh)meshes++;});assert.equal(meshes,2);
  const crowns=g.group.getObjectByName('perth-west-wood-crowns') as THREE.InstancedMesh;
  assert.equal(crowns.count,g.trees.length,'every tree, wood and mapped, is an instance of it');assert.equal(g.trees.filter(t=>t.kind==='tree').length,2);
  assert.ok(g.stats.triangles>coverOf(g).geometry.index!.count/3,'the trees add triangles to the cover\'s');
 }finally{g.dispose();}
 assert.equal(g.group.children.length,0,'disposed');
});

test('mappedWithMassed draws the mapped trees with the massed ones, standing on the ground, two draws fewer; by default they keep their own draws',()=>{
 const opts={fillStep:{wood:18,scrub:14},woodTrunks:false};
 const separate=buildWaverleyCityGround(ground,new Footprints([]),west.landuse,opts),merged=buildWaverleyCityGround(ground,new Footprints([]),west.landuse,{...opts,mappedWithMassed:true});
 try{
  const counts=(g:{group:THREE.Group})=>{const out:Record<string,number>={};g.group.traverse(o=>{if((o as THREE.InstancedMesh).isInstancedMesh)out[o.name]=(o as THREE.InstancedMesh).count;});return out;};
  const wood=separate.trees.filter(t=>t.kind==='wood').length;assert.ok(wood>50);
  assert.equal(separate.stats.drawCalls,4);assert.deepEqual(counts(separate),{'waverley-tree-crowns':2,'waverley-wood-crowns':wood,'waverley-tree-trunks':2});
  assert.equal(merged.stats.drawCalls,2);assert.deepEqual(counts(merged),{'waverley-wood-crowns':wood+2});
  assert.deepEqual(merged.trees,separate.trees,'the same trees stand: only how they are drawn differs');
  // each crown of the batch stands on the ground (bare foliage, as the wood's own, with no trunk to hold a floating crown up)
  const crowns=merged.group.getObjectByName('waverley-wood-crowns') as THREE.InstancedMesh,m=new THREE.Matrix4(),p=new THREE.Vector3(),q=new THREE.Quaternion(),s=new THREE.Vector3();
  merged.trees.forEach((t,i)=>{crowns.getMatrixAt(i,m);m.decompose(p,q,s);assert.ok(Math.abs(p.y-s.y-t.y)<1e-3,`tree ${i} (${t.kind}): crown bottom ${p.y-s.y}, ground ${t.y}`);});
 }finally{separate.dispose();merged.dispose();}
});

test('ground another element draws itself is left uncovered: no cover triangle has a corner there',()=>{
 const all=buildPerthWestCover(ground,new Footprints([]),undefined,west),none=buildPerthWestCover(ground,new Footprints([]),()=>true,west),east=buildPerthWestCover(ground,new Footprints([]),x=>x>100,west);
 try{
  const n=(g:{group:THREE.Group})=>coverOf(g).geometry.index!.count/3;
  assert.ok(n(all)>100,`${n(all)} cover triangles`);assert.equal(n(none),0);assert.ok(n(east)>0&&n(east)<n(all));
  const m=coverOf(east),P=m.geometry.getAttribute('position'),ix=m.geometry.index!;let worst=-Infinity;for(let i=0;i<ix.count;i++)worst=Math.max(worst,P.getX(ix.getX(i)));
  assert.ok(worst<=100+1e-6,`the east of x 100 is bare (furthest corner ${worst})`);
 }finally{all.dispose();none.dispose();east.dispose();}
});

/** A document whose canvases are plain objects, so the cover paints in Node: the canvases made are returned. */
function stubCanvas():{made:{width:number;height:number}[];restore():void}{
 const made:{width:number;height:number}[]=[],ctx=new Proxy({},{get:()=>()=>undefined,set:()=>true});
 (globalThis as {document?:unknown}).document={createElement:()=>{const c={width:0,height:0,getContext:()=>ctx};made.push(c);return c;}};
 return {made,restore(){delete (globalThis as {document?:unknown}).document;}};
}
test('the west cover paints a canvas PERTH_WEST_CANVAS texels across with the height of the extent, and Waverley\'s default stays 2,048',()=>{
 const {made,restore}=stubCanvas();
 try{
  const g=buildPerthWestCover(ground,new Footprints([]),undefined,west);g.dispose();
  const d=buildWaverleyCityGround(ground,new Footprints([]),west.landuse,{});d.dispose();
  assert.deepEqual(made.map(c=>[c.width,c.height]),[[PERTH_WEST_CANVAS,PERTH_WEST_CANVAS*2],[CANVAS_WIDTH,CANVAS_WIDTH*2]],'160 x 320 m: twice as tall as wide');
 }finally{restore();}
 assert.equal(CANVAS_WIDTH,2048);
});

test('the gardens take the west\'s streets for their frame and its extent for their town patches, not the context\'s',()=>{
 const theta=.4,street={line:[[-2700,-1500],[-2700+400*Math.cos(theta),-1500+400*Math.sin(theta)]] as Pt[]};
 const ring:Pt[]=[[-2650,-1450],[-2530,-1450],[-2530,-1330],[-2650,-1330]];
 const site={extent:{x0:-2800,z0:-1600,x1:-2400,z1:-1200},streets:streetIndex([street])};
 const own=perthGardens([[ring]],site),ctx=perthGardens([[ring]]);
 assert.ok(own.plots.length>20,`${own.plots.length} plots`);
 assert.ok(own.plots.every(p=>Math.abs((p.rot??0)-theta)<1e-9),'the plots lie along the street');
 assert.ok(ctx.plots.every(p=>(p.rot??0)===0),'with no context street near, the same plots stand square');
 assert.ok(own.patches!.length>0&&own.patches!.every(p=>p.x>=-2830&&p.x<=-2400&&p.z>=-1630&&p.z<=-1200),'the patches tile the site\'s extent');
 // the committed west's gardens are built once; another west gets its own, over its own residential land and streets
 assert.equal(perthWestGardens(),perthWestGardens(PERTH_WEST));
 const w=decodePerthWest(westFile({residential:[[enc([[20,120],[140,120],[140,240],[20,240]],2)]]})),a=perthWestGardens(w);
 assert.notEqual(a,perthWestGardens(w));assert.deepEqual(a.rings,w.residential);assert.ok(a.plots.length>20);
 assert.ok(a.plots.every(p=>Math.abs((p.rot??0))<.01),'the one street across the block runs along x: the plots follow it');
});
