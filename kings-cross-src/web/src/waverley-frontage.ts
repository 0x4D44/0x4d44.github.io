// W2 frontage: North Bridge and Waverley Bridge (decks and parapets) and the Balmoral Hotel's clock tower, from
// data/waverley-frontage.json (tools/build-waverley-landmarks.ts). OSM footprints/building parts: ODbL. Heights retain their cited basis below.
// No bridge clearance is inferred from OSM layer: deck ends sample the unwarped Scottish context DTM, never the railway flattening.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch,material} from './materials.ts';
import {centre,pyramid,shell} from './waverley-mesh.ts';
import {balmoralTime} from './clocks.ts';
import type {ClockDial} from './clocks.ts';
import data from './data/waverley-frontage.json' with {type:'json'};
export const WAVERLEY_FRONTAGE_HEIGHTS={balmoral:58,clockDiameter:3.2} as const;
export const WAVERLEY_FRONTAGE_SOURCES={
 balmoral:{url:'https://portal.historicenvironment.scot/designation/LB30315',height:58,basis:'HES Description: 58 metre high entrance tower'},
 clock:{url:'https://www.smithofderby.com/projects/balmoral-hotel/',diameter:3.2,basis:'clock maker project sheet Size: 3.2m'},
 assumptions:'Bridge thickness 1m and parapets 1.1m; bridge deck elevations interpolated from unwarped Scottish context DTM at extreme mapped ends, not surveyed clearances. Balmoral upper-stage split at 48m, spire profile, cornices, dial positions and hands ASSUMED.',
} as const;
/** The city buildings this element draws itself: the Balmoral tower footprint (the hotel mass, relation/14213049, stays in the city). */
export const WAVERLEY_FRONTAGE_OMIT_IDS=[data.balmoral.id];
const ringOf=(p:number[][]):Pt[]=>p.map(q=>[q[0],q[1]]);
export interface WaverleyFrontage {group:THREE.Group;stats:{drawCalls:number;triangles:number};omitBuildingIds:string[];dispose():void}
export function buildWaverleyFrontage(ground:Pick<Terrain,'heightAt'|'rangeUnder'>,contextTerrain:Pick<Terrain,'heightAt'>=ground):WaverleyFrontage{
 const group=new THREE.Group();group.name='waverley-frontage';const stats={drawCalls:0,triangles:0};
 const ownedGeometries:THREE.BufferGeometry[]=[],ownedMaterials:THREE.Material[]=[];
 const add=(b:Batch,key:Parameters<typeof material>[0],name:string,color?:number)=>{if(!b.triangles)return;const g=b.build(),m=material(key).clone();if(color!==undefined&&(m instanceof THREE.MeshLambertMaterial))m.color.setHex(color);const mesh=new THREE.Mesh(g,m);mesh.name=name;group.add(mesh);ownedGeometries.push(g);ownedMaterials.push(m);stats.drawCalls++;stats.triangles+=b.triangles;};
 const bridges=new Batch(),stone=new Batch(),roof=new Batch(),dial=new Batch();
 for(const bridge of data.bridges){
  const r=ringOf(bridge.ring),byZ=[...r].sort((a,b)=>a[1]-b[1]),a=byZ[0],b=byZ.at(-1)!;
  const y0=contextTerrain.heightAt(...a),y1=contextTerrain.heightAt(...b),deck=(p:Pt)=>y0+(y1-y0)*Math.max(0,Math.min(1,(p[1]-a[1])/(b[1]-a[1])));
  shell(bridges,r,p=>deck(p)-1,deck);
  // Only longitudinal outline edges carry parapets: end caps remain accessible.
  for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length],dx=q[0]-p[0],dz=q[1]-p[1],len=Math.hypot(dx,dz);if(Math.abs(dz)<Math.abs(dx)||len<2)continue;
   stone.box([(p[0]+q[0])/2,(deck(p)+deck(q))/2+.55,(p[1]+q[1])/2],[.35,1.1,len],{rotY:Math.atan2(dx,dz)});
  }
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
 add(bridges,'asphalt','waverley-bridge-decks');add(stone,'stone','waverley-balmoral-and-bridge-parapets');add(roof,'slate','waverley-balmoral-spire-and-hands');add(dial,'concrete','waverley-balmoral-clock-dials',0xeee8d1);
 let disposed=false;return {group,stats,omitBuildingIds:[...WAVERLEY_FRONTAGE_OMIT_IDS],dispose(){if(disposed)return;disposed=true;group.removeFromParent();for(const g of ownedGeometries)g.dispose();for(const m of ownedMaterials)m.dispose();group.clear();}};
}
