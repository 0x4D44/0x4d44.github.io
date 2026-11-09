// W3 city shopfronts: a ground-floor shop band on the facades that front a main or pedestrian street (R-wv3-c3, wv2-a2: Princes Street,
// North Bridge, the Bridges and the Royal Mile run shopfronts under the stone storeys). The streets are the OSM highways with their
// class (data/waverley-roads.json, ODbL); which facades carry shops is inferred from them, ASSUMED.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import {Batch} from './materials.ts';
import roadsFile from './data/waverley-roads.json' with {type:'json'};

/** ASSUMED shop band: 4.2 m tall (a New Town ground floor), 6 m bays, 6 cm proud of the facade; on a block whose wall is at least
 *  minWall tall, along an outer edge at least minEdge long whose midpoint is within `reach` m of a shop street's kerb. Shop streets, by
 *  OSM class with their ASSUMED carriageway widths (as the land-use builder's ROAD_WIDTH): the city centre's primary to tertiary and
 *  unclassified roads (Princes Street's carriageways are unclassified) and its pedestrian streets; never a residential street. */
export const SHOP_BAND={height:4.2,bay:6,proud:.06,minWall:9,minEdge:4,reach:4} as const;
export const SHOP_STREETS:Readonly<Record<string,number>>={primary:11,primary_link:11,secondary:10,secondary_link:10,tertiary:8.5,tertiary_link:8.5,unclassified:7,pedestrian:5};
const roads=()=>roadsFile.roads.filter(r=>r.highway in SHOP_STREETS).map(r=>({width:SHOP_STREETS[r.highway],line:r.path as Pt[]}));

/** Street centre lines bucketed by 32 m cells, for a quick nearest-kerb query. */
export class Streets {
 private cells=new Map<string,{a:Pt;b:Pt;half:number}[]>();
 constructor(streets:readonly {width:number;line:Pt[]}[]=roads()){
  for(const r of streets){
   for(let i=1;i<r.line.length;i++){const a=r.line[i-1],b=r.line[i],seg={a,b,half:r.width/2};
    for(let x=Math.floor(Math.min(a[0],b[0])/32)-1;x<=Math.floor(Math.max(a[0],b[0])/32)+1;x++)for(let z=Math.floor(Math.min(a[1],b[1])/32)-1;z<=Math.floor(Math.max(a[1],b[1])/32)+1;z++){const k=`${x},${z}`;let c=this.cells.get(k);if(!c)this.cells.set(k,c=[]);c.push(seg);}}}
 }
 /** Distance from p to the nearest shop street's kerb (negative inside the carriageway); Infinity when none is near. */
 kerb(p:Pt):number{let best=Infinity;
  for(const {a,b,half}of this.cells.get(`${Math.floor(p[0]/32)},${Math.floor(p[1]/32)}`)??[]){const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/(dx*dx+dz*dz||1)));
   best=Math.min(best,Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz)-half);}
  return best;}
}

/** The shop band along each qualifying outer edge of `outer` (any winding): from the street at each end (`foot`, never under the
 *  block's `base`) up SHOP_BAND.height, its UVs in bays (u) and band heights (v). Returns the triangles added. */
export function shopBand(b:Batch,outer:readonly Pt[],base:number,wallTop:number,streets:Streets,foot:(p:Pt)=>number=()=>base):number{
 const S=SHOP_BAND;if(wallTop-base<S.minWall)return 0;
 const before=b.triangles;let signed=0;for(let i=0;i<outer.length;i++){const p=outer[i],q=outer[(i+1)%outer.length];signed+=p[0]*q[1]-q[0]*p[1];}
 for(let i=0;i<outer.length;i++){const p=outer[i],q=outer[(i+1)%outer.length],len=Math.hypot(q[0]-p[0],q[1]-p[1]);if(len<S.minEdge)continue;
  // outward normal from the winding (x east, z south)
  const s=signed>0?1:-1,n:Pt=[s*(q[1]-p[1])/len,-s*(q[0]-p[0])/len],m:Pt=[(p[0]+q[0])/2,(p[1]+q[1])/2];
  if(streets.kerb([m[0]+n[0]*.5,m[1]+n[1]*.5])>S.reach)continue;
  const o=(r:Pt):Pt=>[r[0]+n[0]*S.proud,r[1]+n[1]*S.proud],a=o(p),d=o(q),bays=Math.max(1,Math.round(len/S.bay)),ya=Math.max(base,foot(p)),yd=Math.max(base,foot(q));
  if(Math.max(ya,yd)+S.height>wallTop-3)continue; // keep a storey of stone over the band
  b.poly([[a[0],ya,a[1]],[d[0],yd,d[1]],[d[0],yd+S.height,d[1]],[a[0],ya+S.height,a[1]]],[[0,0],[bays,0],[bays,1],[0,1]],{facing:[n[0],0,n[1]]});
 }
 return b.triangles-before;
}

/** One shopfront bay as a texture (u: one bay, v: the band): a dark fascia with a sign, two plate-glass windows over a stall riser, a
 *  recessed door between, stone pilasters at the ends. ASSUMED design, after R-wv3-c3 and wv2-a2. Browser only (null in Node). */
export function shopTexture():THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const W=256,H=180,c=document.createElement('canvas');c.width=W;c.height=H;const g=c.getContext('2d');if(!g)return null;
 const y=(m:number)=>H-m/SHOP_BAND.height*H,x=(m:number)=>m/SHOP_BAND.bay*W;
 g.fillStyle='#b9b2a6';g.fillRect(0,0,W,H); // stone surround
 g.fillStyle='#2b2f33';g.fillRect(x(.35),y(4.0),x(5.3),y(3.25)-y(4.0)); // fascia
 g.fillStyle='#d8cfb8';g.fillRect(x(1.6),y(3.8),x(2.8),y(3.45)-y(3.8)); // sign
 g.fillStyle='#3d4a52';g.fillRect(x(.45),y(3.1),x(2.0),y(.55)-y(3.1));g.fillRect(x(3.55),y(3.1),x(2.0),y(.55)-y(3.1)); // plate glass
 g.fillStyle='rgba(255,236,190,0.35)';g.fillRect(x(.45),y(1.9),x(2.0),y(.55)-y(1.9));g.fillRect(x(3.55),y(1.9),x(2.0),y(.55)-y(1.9)); // lit display
 g.fillStyle='#22262a';g.fillRect(x(2.6),y(3.1),x(.8),y(0)-y(3.1)); // door recess
 g.fillStyle='#4a4038';g.fillRect(x(.45),y(.55),x(2.0),y(0)-y(.55));g.fillRect(x(3.55),y(.55),x(2.0),y(0)-y(.55)); // stall risers
 g.fillStyle='#8f887c';g.fillRect(0,0,x(.35),H);g.fillRect(x(5.65),0,x(.35),H); // pilasters
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
