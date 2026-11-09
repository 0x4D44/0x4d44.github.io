// OSM footprints/building parts: ODbL. Heights retain their cited basis below.
// No bridge clearance is inferred from OSM layer: deck ends sample the unwarped Scottish context DTM, never the railway flattening.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import type {V3} from './materials.ts';
import {balmoralTime} from './clocks.ts';
import type {ClockDial} from './clocks.ts';
import data from './data/waverley-landmarks.json' with {type:'json'};
export const WAVERLEY_LANDMARK_HEIGHTS={scott:61.11,balmoral:58,clockDiameter:3.2} as const;
export const WAVERLEY_LANDMARK_SOURCES={
 scott:{url:'https://www.openstreetmap.org/way/39044819',height:61.11,basis:'OSM height; explicit mapped part heights and min_height'},
 balmoral:{url:'https://portal.historicenvironment.scot/designation/LB30315',height:58,basis:'HES Description: 58 metre high entrance tower'},
 clock:{url:'https://www.smithofderby.com/projects/balmoral-hotel/',diameter:3.2,basis:'clock maker project sheet Size: 3.2m'},
 assumptions:'Bridge thickness 1m and parapets 1.1m; bridge deck elevations interpolated from unwarped Scottish context DTM at extreme mapped ends, not surveyed clearances. Balmoral upper-stage split at 48m, spire profile, cornices, dial positions and hands ASSUMED. Unsupported Scott roof profiles remain flat at mapped height; pyramidal/conical roof heights use OSM tags. No decorative Scott figures inferred.',
} as const;
export const WAVERLEY_LANDMARK_OMIT_IDS=[data.scott.id,data.balmoral.id,...data.scott.parts.map(p=>p.id)];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
function centre(r:Pt[]):Pt{return [r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length];}
function cap(b:Batch,r:Pt[],height:(p:Pt)=>number):void{
 for(const f of THREE.ShapeUtils.triangulateShape(r.map(p=>new THREE.Vector2(...p)),[]))b.tri(...f.map(i=>[r[i][0],height(r[i]),r[i][1]] as V3) as [V3,V3,V3],undefined,[0,1,0]);
}
function shell(b:Batch,r:Pt[],bottom:(p:Pt)=>number,top:(p:Pt)=>number):void{
 const area=r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0);
 const poly=area>0?[...r].reverse():r;
 for(let i=0;i<poly.length;i++){const p=poly[i],q=poly[(i+1)%poly.length];b.quadUV([p[0],bottom(p),p[1]],[q[0],bottom(q),q[1]],[q[0],top(q),q[1]],[p[0],top(p),p[1]],[[0,0],[1,0],[1,1],[0,1]]);}
 cap(b,r,top);
}
function pyramid(b:Batch,r:Pt[],bottom:number,top:number):void{
 const c=centre(r);for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];const a:V3=[p[0],bottom,p[1]],d:V3=[q[0],bottom,q[1]],tip:V3=[c[0],top,c[1]];
 // Explicit outward facing removes dependence on input OSM ring winding.
 b.tri(a,d,tip,undefined,[((p[0]+q[0])/2-c[0]),0,((p[1]+q[1])/2-c[1])]);}
}
export interface WaverleyLandmarks {group:THREE.Group;stats:{drawCalls:number;triangles:number};omitBuildingIds:string[];dispose():void}
export function buildWaverleyLandmarks(ground:Pick<Terrain,'heightAt'|'rangeUnder'>,contextTerrain:Pick<Terrain,'heightAt'>=ground):WaverleyLandmarks{
 const group=new THREE.Group();group.name='waverley-landmarks';const stats={drawCalls:0,triangles:0};
 const ownedGeometries:THREE.BufferGeometry[]=[],ownedMaterials:THREE.Material[]=[];
 const add=(b:Batch,key:Parameters<typeof material>[0],name:string,color?:number)=>{if(!b.triangles)return;const g=b.build(),m=material(key).clone();if(color!==undefined&&(m instanceof THREE.MeshLambertMaterial))m.color.setHex(color);const mesh=new THREE.Mesh(g,m);mesh.name=name;group.add(mesh);ownedGeometries.push(g);ownedMaterials.push(m);stats.drawCalls++;stats.triangles+=b.triangles;};
 const bridges=new Batch(),stone=new Batch(),roof=new Batch(),dial=new Batch(),scott=new Batch();
 for(const bridge of data.bridges){
  const r=ringOf(bridge.ring),byZ=[...r].sort((a,b)=>a[1]-b[1]),a=byZ[0],b=byZ.at(-1)!;
  const y0=contextTerrain.heightAt(...a),y1=contextTerrain.heightAt(...b),deck=(p:Pt)=>y0+(y1-y0)*Math.max(0,Math.min(1,(p[1]-a[1])/(b[1]-a[1])));
  shell(bridges,r,p=>deck(p)-1,deck);
  // Only longitudinal outline edges carry parapets: end caps remain accessible.
  for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(Math.abs(dz)<Math.abs(dx)||len<2)continue;
   stone.box([(p[0]+q[0])/2,(deck(p)+deck(q))/2+.55,(p[1]+q[1])/2],[.35,1.1,len],{rotY:Math.atan2(dx,dz)});
  }
 }
 const sr=ringOf(data.scott.ring),sb=ground.rangeUnder(sr,2).min;
 for(const p of data.scott.parts){const r=ringOf(p.ring),pitched=['pyramidal','cone'].includes(p.roofShape)&&p.roofHeight>0,wallTop=p.height-(pitched?p.roofHeight:0);
  if(wallTop>p.minHeight)shell(scott,r,()=>sb+p.minHeight,()=>sb+wallTop);
  if(pitched)pyramid(scott,r,sb+wallTop,sb+p.height);
 }
 const br=ringOf(data.balmoral.ring),bc=centre(br),north=[...br].sort((a,b)=>a[1]-b[1])[0],base=ground.heightAt(...north);
 shell(stone,br,()=>base,()=>base+48);pyramid(roof,br,base+48,base+58);
 const xs=br.map(p=>p[0]),zs=br.map(p=>p[1]);
 // Dial diameter is published; placement is illustrative.
 const dials:ClockDial[]=[];
 for(const [cx,cz,nx,nz] of [[bc[0],Math.min(...zs)-.02,0,-1],[bc[0],Math.max(...zs)+.02,0,1],[Math.min(...xs)-.02,bc[1],-1,0],[Math.max(...xs)+.02,bc[1],1,0]]){
  const cy=base+43,tx=-nz,tz=nx,r=data.balmoral.clockDiameter/2;
  for(let i=0;i<32;i++){const a=i*Math.PI/16,b=(i+1)*Math.PI/16;dial.tri([cx,cy,cz],[cx+tx*r*Math.cos(a),cy+r*Math.sin(a),cz+tz*r*Math.cos(a)],[cx+tx*r*Math.cos(b),cy+r*Math.sin(b),cz+tz*r*Math.cos(b)],undefined,[nx,0,nz]);}
  dials.push({centre:[cx,cy,cz],normal:[nx,0,nz],up:[0,1,0],radius:r,show:balmoralTime}); // the hands are clocks.ts's, three minutes fast
 }
 group.userData.clockDials=dials;
 add(bridges,'asphalt','waverley-bridge-decks');add(stone,'stone','waverley-balmoral-and-bridge-parapets');add(roof,'slate','waverley-balmoral-spire-and-hands');add(dial,'concrete','waverley-balmoral-clock-dials',0xeee8d1);add(scott,'stone','waverley-scott-monument',0x51463d);
 let disposed=false;return {group,stats,omitBuildingIds:[...WAVERLEY_LANDMARK_OMIT_IDS],dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();group.clear();}};
}
