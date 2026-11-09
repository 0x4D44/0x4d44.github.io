// W3 city ground: the land use drawn over the terrain, and the mapped trees. All of it is OSM (ODbL), from
// data/waverley-city-landuse.json (tools/build-waverley-city-landuse.ts): parks, gardens, grass, woods, scrub, water, paved areas,
// streets (ASSUMED widths per highway class), park paths, the 2,405 natural=tree nodes and the natural=cliff lines.
//
// The ground cover is one canvas texture (<= 2048 px, about 1 m a texel over the 2,000 x 1,232 m extent) on one draped mesh: the
// adaptive terrain mesh rebuilt over the drawn ground (`overMesh`), lifted DRAPE_LIFT above it, and pushed forward in depth, so it
// never sinks into the terrain and never z-fights it (the terrain material is pushed back, polygon offset +1). It leaves out the
// railway's flattened bed (ground at WAVERLEY_LEVELS.ground), so the ballast and the station floor draw as they did.
// Steep ground (over ROCK_SLOPE_DEG) is painted as rock: Castle Rock and the Calton Hill crags are dolerite/basalt exposures
// (R-wv3-a shows the bare crag between the trees); the 16 m DTM smooths a cliff into a steep slope, so slope is the honest proxy.
// Trees: the mapped tree nodes, plus woods and scrub (7 m) filled on a jittered lattice (spacings ASSUMED). Tree sizes are
// ASSUMED (no OSM height on these nodes): 8 to 14 m, crowns about 0.6 of the height across, as the mature limes, elms and
// sycamores of R-wv3-a. No tree stands in a building or on the railway; a crown is narrowed to clear the nearest wall.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {buildTerrainMesh} from '../../core/terrain.ts';
import type {Terrain} from '../../core/terrain.ts';
import {WAVERLEY_LEVELS} from './waverley-mesh.ts';
import data from './data/waverley-city-landuse.json' with {type:'json'};

export const DRAPE_LIFT=.12;
export const ROCK_SLOPE_DEG=38;
/** sRGB paint for each ground class, matched by eye to R-wv3-a and R-wv3-c as rendered under the Waverley rig (ACES, exposure 1.25,
 *  which lifts a paint about 1.6x): ASSUMED shades. */
export const GROUND_COLOURS={
 paving:'#5c5850',road:'#3b3d3f',path:'#5f5c56',grass:'#4f6e28',garden:'#47652a',pitch:'#557530',flower:'#5a6530',
 wood:'#2d4120',scrub:'#45502c',water:'#2b3d48',paved:'#67635b',rock:'#4a463e',cliff:'#3a3733',
} as const;
type Ring=Pt[];
const decode=(d:number[]):Ring=>{const q=data.q,out:Ring=[];let x=0,z=0;for(let i=0;i<d.length;i+=2){x+=d[i];z+=d[i+1];out.push([x*q,z*q]);}return out;};
export const LANDUSE={
 extent:data.extent,
 areas:Object.fromEntries(Object.entries(data.areas).map(([k,v])=>[k,(v as number[][][]).map(rs=>rs.map(decode))])) as Record<keyof typeof data.areas,Ring[][]>,
 roads:Object.entries(data.roads).flatMap(([w,ls])=>(ls as number[][]).map(l=>({width:Number(w),line:decode(l)}))),
 paths:Object.entries(data.paths).flatMap(([w,ls])=>(ls as number[][]).map(l=>({width:Number(w),line:decode(l)}))),
 trees:decode(data.trees),
 cliffs:data.cliffs.map(decode),
};
const pip=(x:number,z:number,p:readonly Pt[]):boolean=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const segDist=(x:number,z:number,a:Pt,b:Pt):number=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
/** A seeded hash in [0,1). */
const hash=(x:number,z:number,k=0):number=>{let h=Math.imul(Math.round(x*10)^0x9e3779b9,0x85ebca6b)^Math.imul(Math.round(z*10)+k*7919,0xc2b2ae35);h^=h>>>15;h=Math.imul(h,0x2c1b3c6d);h^=h>>>12;return (h>>>0)/4294967296;};

/** The footprints things must stand clear of, bucketed by 16 m cells. */
export class Footprints {
 private cells=new Map<string,number[]>();
 readonly rings:readonly (readonly Pt[])[];
 constructor(rings:readonly (readonly Pt[])[]){
  this.rings=rings;
  rings.forEach((r,i)=>{let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const [x,z]of r){x0=Math.min(x0,x);x1=Math.max(x1,x);z0=Math.min(z0,z);z1=Math.max(z1,z);}
   for(let cx=Math.floor(x0/16);cx<=Math.floor(x1/16);cx++)for(let cz=Math.floor(z0/16);cz<=Math.floor(z1/16);cz++){const k=`${cx},${cz}`;let a=this.cells.get(k);if(!a)this.cells.set(k,a=[]);a.push(i);}});
 }
 /** Distance from (x,z) to the nearest footprint outline within `reach` (reach when none is nearer), negative when inside one. */
 clearance(x:number,z:number,reach:number):number{
  let best=reach;const seen=new Set<number>();
  for(let cx=Math.floor((x-reach)/16);cx<=Math.floor((x+reach)/16);cx++)for(let cz=Math.floor((z-reach)/16);cz<=Math.floor((z+reach)/16);cz++)for(const i of this.cells.get(`${cx},${cz}`)??[]){
   if(seen.has(i))continue;seen.add(i);const r=this.rings[i];if(pip(x,z,r))return -1;
   for(let j=0;j<r.length;j++)best=Math.min(best,segDist(x,z,r[j],r[(j+1)%r.length]));
  }
  return best;
 }
}

export interface Tree {x:number;z:number;y:number;height:number;crown:number;kind:'tree'|'wood'|'scrub'}
/** The trees that stand: mapped nodes and wood/scrub fill, each clear of every footprint and off the railway bed. */
export function placeTrees(ground:Pick<Terrain,'heightAt'>,footprints:Footprints):Tree[]{
 const out:Tree[]=[],{x0,z0,x1,z1}=LANDUSE.extent;
 const take=(x:number,z:number,kind:Tree['kind']):void=>{
  if(x<x0+2||x>x1-2||z<z0+2||z>z1-2)return;
  const y=ground.heightAt(x,z);if(Math.abs(y-WAVERLEY_LEVELS.ground)<.3)return; // the railway's flattened bed (and its first blend)
  const r=hash(x,z,1),height=kind==='scrub'?2.5+r*2:8+r*6,want=height*(kind==='scrub'?.45:.3);
  const room=footprints.clearance(x,z,want);if(room<Math.min(1.2,want))return;
  out.push({x,z,y,height,crown:Math.min(want,room),kind});
 };
 for(const [x,z]of LANDUSE.trees)take(x,z,'tree');
 const fill=(rings:Ring[][],step:number,kind:Tree['kind'])=>{for(const rs of rings){const [o,...holes]=rs;let ax=Infinity,bx=-Infinity,az=Infinity,bz=-Infinity;for(const [x,z]of o){ax=Math.min(ax,x);bx=Math.max(bx,x);az=Math.min(az,z);bz=Math.max(bz,z);}
  for(let gx=Math.ceil(ax/step)*step;gx<bx;gx+=step)for(let gz=Math.ceil(az/step)*step;gz<bz;gz+=step){const x=gx+(hash(gx,gz,2)-.5)*step*.8,z=gz+(hash(gx,gz,3)-.5)*step*.8;if(pip(x,z,o)&&!holes.some(h=>pip(x,z,h)))take(x,z,kind);}}};
 fill(LANDUSE.areas.wood,7,'wood');fill(LANDUSE.areas.scrub,7,'scrub');
 return out;
}

/** Paint the ground cover; `slopeAt` gives the ground's slope in degrees. Browser only (null in Node). */
function paintGround(slopeAt:(x:number,z:number)=>number):THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const {x0,z0,x1,z1}=LANDUSE.extent,W=2048,H=Math.round(2048*(z1-z0)/(x1-x0)),s=W/(x1-x0);
 const c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');if(!g)return null;
 const px=(p:Pt):[number,number]=>[(p[0]-x0)*s,(p[1]-z0)*s];
 const path=(rings:readonly Ring[])=>{g.beginPath();for(const r of rings){r.forEach((p,i)=>i?g.lineTo(...px(p)):g.moveTo(...px(p)));g.closePath();}};
 const line=(l:Ring)=>{g.beginPath();l.forEach((p,i)=>i?g.lineTo(...px(p)):g.moveTo(...px(p)));};
 g.fillStyle=GROUND_COLOURS.paving;g.fillRect(0,0,W,H);
 const A=LANDUSE.areas;
 for(const [k,col]of [['garden',GROUND_COLOURS.garden],['grass',GROUND_COLOURS.grass],['pitch',GROUND_COLOURS.pitch],['flower',GROUND_COLOURS.flower],['scrub',GROUND_COLOURS.scrub],['wood',GROUND_COLOURS.wood],['paved',GROUND_COLOURS.paved],['water',GROUND_COLOURS.water],['rock',GROUND_COLOURS.rock]] as const){
  g.fillStyle=col;for(const rs of A[k]){path(rs);g.fill('evenodd');}
 }
 // Steep ground is bare rock, over grass and scrub; streets and paths are drawn over it.
 g.fillStyle=GROUND_COLOURS.rock;const cell=4;
 for(let x=x0;x<x1;x+=cell)for(let z=z0;z<z1;z+=cell){const a=slopeAt(x+cell/2,z+cell/2);if(a>ROCK_SLOPE_DEG){g.globalAlpha=Math.min(1,(a-ROCK_SLOPE_DEG)/10)*.9;g.fillRect((x-x0)*s,(z-z0)*s,cell*s+.5,cell*s+.5);}}
 g.globalAlpha=1;g.lineCap='round';g.lineJoin='round';
 g.strokeStyle=GROUND_COLOURS.cliff;g.lineWidth=5*s;for(const l of LANDUSE.cliffs){line(l);g.stroke();}
 g.strokeStyle=GROUND_COLOURS.path;for(const p of LANDUSE.paths){g.lineWidth=p.width*s;line(p.line);g.stroke();}
 g.strokeStyle=GROUND_COLOURS.road;for(const r of LANDUSE.roads){g.lineWidth=r.width*s;line(r.line);g.stroke();}
 // Texture: a low-contrast mottle so a lawn or a street is not one flat tone at close range. Seeded, so every load is the same.
 for(let i=0;i<30000;i++){const x=hash(i,1,4)*W,y=hash(i,2,5)*H,l=hash(i,3,6);g.fillStyle=l>.5?'rgba(255,255,240,0.05)':'rgba(20,20,10,0.07)';g.fillRect(x,y,2+l*3,2+l*3);}
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.ClampToEdgeWrapping;
 return t;
}

export interface WaverleyCityGround {group:THREE.Group;stats:{triangles:number;drawCalls:number};trees:Tree[];dispose():void}
/** The draped land-use cover and the trees; `footprints` are every mapped building and roof outline (trees stand clear of them). */
export function buildWaverleyCityGround(ground:Terrain,footprints:Footprints):WaverleyCityGround{
 const group=new THREE.Group();group.name='waverley-city-ground';
 const stats={triangles:0,drawCalls:0},geometries:THREE.BufferGeometry[]=[],materials:THREE.Material[]=[];
 const {x0,z0,x1,z1}=LANDUSE.extent;
 // The drape: the terrain mesh rebuilt over the drawn surface, less the railway bed.
 const tm=buildTerrainMesh(ground,{maxLeaf:16,tolerance:()=>.1});
 const P=tm.positions,keep:number[]=[],bed=(i:number)=>Math.abs(P[i*3+1]-WAVERLEY_LEVELS.ground)<.01;
 for(let i=0;i<tm.indices.length;i+=3){const a=tm.indices[i],b=tm.indices[i+1],c=tm.indices[i+2];/* the flattened bed is exactly at the rail datum (natural ground below it is drawn); a triangle touching it is left to the terrain, so the drape never spans the ballast */if(bed(a)||bed(b)||bed(c))continue;keep.push(a,b,c);}
 const pos=new Float32Array(P.length),uv=new Float32Array(P.length/3*2);
 for(let i=0;i<P.length/3;i++){const x=P[i*3],z=P[i*3+2];pos[i*3]=x;pos[i*3+1]=ground.heightAt(x,z)+DRAPE_LIFT;pos[i*3+2]=z;uv[i*2]=(x-x0)/(x1-x0);uv[i*2+1]=1-(z-z0)/(z1-z0);}
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(keep);g.computeVertexNormals();geometries.push(g);
 const slopeAt=(x:number,z:number)=>{const n=ground.normalAt(x,z,4);return Math.acos(Math.min(1,n[1]))*180/Math.PI;};
 const map=paintGround(slopeAt);
 const cover=new THREE.MeshLambertMaterial({map,color:map?0xffffff:GROUND_COLOURS.paving});
 cover.polygonOffset=true;cover.polygonOffsetFactor=-1;cover.polygonOffsetUnits=-1;cover.name='waverley-ground-cover';materials.push(cover);
 const mesh=new THREE.Mesh(g,cover);mesh.name='waverley-ground-cover';group.add(mesh);stats.triangles+=keep.length/3;stats.drawCalls++;
 // Trees: crowns (one icosahedron each) and trunks, two instanced draws.
 const trees=placeTrees(ground,footprints);
 if(trees.length){
  // A mapped tree is seen close from the gardens: a rounder crown (icosahedron, detail 1, 80 faces); woods and scrub are seen as masses (20).
  const ico=(detail:number)=>{const g=new THREE.IcosahedronGeometry(1,detail),p=g.getAttribute('position'),n=g.getAttribute('normal');for(let i=0;i<p.count;i++){const v=new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)).normalize();n.setXYZ(i,v.x,v.y,v.z);}return g;}; // smooth normals: a rounded crown, not facets
  const fineG=ico(1),coarseG=ico(0),trunkG=new THREE.CylinderGeometry(1,1,1,4,1,true);geometries.push(fineG,coarseG,trunkG);
  const leaf=new THREE.MeshLambertMaterial({color:0xffffff}),bark=new THREE.MeshLambertMaterial({color:0x4a3f33});materials.push(leaf,bark);leaf.name='waverley-tree-crowns';bark.name='waverley-tree-trunks';
  const mapped=trees.filter(t=>t.kind==='tree'),massed=trees.filter(t=>t.kind!=='tree'),trunked=trees.filter(t=>t.kind!=='scrub');
  const m=new THREE.Matrix4(),q=new THREE.Quaternion(),col=new THREE.Color(),up=new THREE.Vector3(0,1,0);
  const crownsOf=(list:Tree[],geo:THREE.BufferGeometry,name:string)=>{
   const crowns=new THREE.InstancedMesh(geo,leaf,list.length);
   list.forEach((t,i)=>{const r=hash(t.x,t.z,7),ch=t.height*(t.kind==='tree'?.33:.4);q.setFromAxisAngle(up,r*6.283);
    m.compose(new THREE.Vector3(t.x,t.y+t.height-ch,t.z),q,new THREE.Vector3(t.crown,ch,t.crown));crowns.setMatrixAt(i,m);
    // ASSUMED leaf greens (R-wv3-a: fresh lime-greens in sun, darker conifers and holly between)
    col.setRGB(.24+r*.1,.36+r*.12,.14+r*.05,THREE.SRGBColorSpace);if(t.kind!=='tree')col.multiplyScalar(.85);crowns.setColorAt(i,col);});
   crowns.instanceMatrix.needsUpdate=true;if(crowns.instanceColor)crowns.instanceColor.needsUpdate=true;crowns.name=name;crowns.computeBoundingSphere();
   group.add(crowns);stats.triangles+=list.length*(geo.getAttribute('position').count/3);stats.drawCalls++;
  };
  if(mapped.length)crownsOf(mapped,fineG,'waverley-tree-crowns');
  if(massed.length)crownsOf(massed,coarseG,'waverley-wood-crowns');
  if(trunked.length){const trunks=new THREE.InstancedMesh(trunkG,bark,trunked.length);
   trunked.forEach((t,i)=>{const r=hash(t.x,t.z,7),ch=t.height*(t.kind==='tree'?.33:.4),th=t.height-ch*1.2+.4;q.setFromAxisAngle(up,r*6.283);
    m.compose(new THREE.Vector3(t.x,t.y-.4+th/2,t.z),q,new THREE.Vector3(.15+t.height*.012,th,.15+t.height*.012));trunks.setMatrixAt(i,m);});
   trunks.instanceMatrix.needsUpdate=true;trunks.name='waverley-tree-trunks';trunks.computeBoundingSphere();group.add(trunks);stats.triangles+=trunked.length*8;stats.drawCalls++;}
 }
 let disposed=false;
 return {group,stats,trees,dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const x of geometries)x.dispose();for(const x of materials)x.dispose();map?.dispose();group.clear();}};
}
