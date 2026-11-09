// W3 city monuments: the Nelson Monument, the National Monument's columns and the Castle's walls, drawn from their OSM parts and ways
// in place of the generic extrusions. Sources: OSM (ODbL) for every footprint, height and line; HES LB27823 (Nelson Monument: "a
// 5-stage circular tower with a narrower sixth stage, a compass mast and a time ball", castellated, on a star-shaped base) and
// LB27820 (National Monument: "octastyle Greek Doric colonnade with two return columns to either side"); refs/waverley/DIMENSIONS.md.
// Every proportion no source gives is ASSUMED and says so where it is set.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import {Batch} from './materials.ts';
import type {V3} from './materials.ts';
import {shell,cap} from './waverley-mesh.ts';

/** OSM parts the Nelson Monument replaces: the 6th-stage tower (15-32 m), the 5-stage drum (3-26 m), the star-shaped base (0-3 m). */
export const NELSON={tower:'way/465938528',drum:'way/465938538',base:'way/1518651668',height:32} as const;
/** The National Monument's 12 columns (OSM building:parts, 3 to 13 m on the stylobate): 8 across the west front, 2 returns each side. */
export const NATIONAL_COLUMNS=['way/465938541','way/465938545','way/465938548','way/465938551','way/465938555','way/465938558','way/465938562','way/465938565','way/465938568','way/465938572','way/465938575','way/465938582'] as const;
export const MONUMENT_OMIT_IDS:string[]=[NELSON.tower,NELSON.drum,NELSON.base,...NATIONAL_COLUMNS];
/** ASSUMED: merlon width, gap and height on every castellated top (a common Georgian-Gothic battlement, matched to R-wv3-d). */
export const BATTLEMENT={merlon:.7,gap:.6,height:.8,depth:.45} as const;
/** ASSUMED Castle wall heights above the higher ground beside them (no OSM height on these ways): a curtain wall (wall=castle_wall)
 *  stands 4 m above the inner ground, other walls 1.5 m (parapets, terrace walls); each runs down to the lower ground on its outer
 *  side, so on the cliff-top it reads as the battery face over the crag (R-wv3-a). */
export const CASTLE_WALL={curtain:4,other:1.5,thickness:2,sink:.4} as const;

type Ground=Pick<Terrain,'heightAt'|'rangeUnder'>;
interface Area {id:string;outer:Pt[];height:number;minHeight:number}
const centroid=(r:readonly Pt[]):Pt=>[r.reduce((s,p)=>s+p[0],0)/r.length,r.reduce((s,p)=>s+p[1],0)/r.length];
const areaOf=(r:readonly Pt[])=>{let s=0;for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];s+=a[0]*b[1]-b[0]*a[1];}return Math.abs(s)/2;};
const circle=(c:Pt,r:number,n:number,phase=0):Pt[]=>Array.from({length:n},(_,i)=>{const a=phase+i/n*Math.PI*2;return [c[0]+Math.cos(a)*r,c[1]+Math.sin(a)*r] as Pt;});
/** A frustum from ring a (y0) to ring b (y1), smooth-shaded sides, outward. */
function frustum(b:Batch,c:Pt,r0:number,r1:number,y0:number,y1:number,n:number):void{
 for(let i=0;i<n;i++){const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2,p=(a:number,r:number,y:number):V3=>[c[0]+Math.cos(a)*r,y,c[1]+Math.sin(a)*r];
  const n0:V3=[Math.cos(a0),0,Math.sin(a0)],n1:V3=[Math.cos(a1),0,Math.sin(a1)];
  b.poly([p(a0,r0,y0),p(a1,r0,y0),p(a1,r1,y1),p(a0,r1,y1)],[[0,0],[1,0],[1,1],[0,1]],{normals:[n0,n1,n1,n0]});}
}
/** Merlons along a closed ring (or an open line), standing on `top(p)`. */
function merlons(b:Batch,ring:readonly Pt[],top:(p:Pt)=>number,closed:boolean,outwardOf?:(p:Pt)=>Pt):void{
 const {merlon,gap,height,depth}=BATTLEMENT,period=merlon+gap,n=closed?ring.length:ring.length-1;
 for(let i=0;i<n;i++){const a=ring[i],q=ring[(i+1)%ring.length],len=Math.hypot(q[0]-a[0],q[1]-a[1]);if(len<merlon)continue;
  const ux=(q[0]-a[0])/len,uz=(q[1]-a[1])/len,count=Math.floor((len+gap)/period),start=(len-(count*period-gap))/2;
  for(let k=0;k<count;k++){const s0=start+k*period,s1=s0+merlon,m:Pt=[a[0]+ux*(s0+s1)/2,a[1]+uz*(s0+s1)/2];
   const out=outwardOf?outwardOf(m):[uz,-ux] as Pt,y=top(m),half=merlon/2,d=depth/2;
   const r:Pt[]=[[m[0]-ux*half-out[0]*d,m[1]-uz*half-out[1]*d],[m[0]+ux*half-out[0]*d,m[1]+uz*half-out[1]*d],[m[0]+ux*half+out[0]*d,m[1]+uz*half+out[1]*d],[m[0]-ux*half+out[0]*d,m[1]-uz*half+out[1]*d]];
   shell(b,r,()=>y-.05,()=>y+height);}}
}

/** The Nelson Monument: star base with a battlemented top; five stages stepping in, each with a string course, the fifth battlemented;
 *  the narrower sixth stage, battlemented, to the OSM 32 m; the mast and time ball above (HES). */
export function nelsonMonument(b:Batch,parts:ReadonlyMap<string,Area>,ground:Ground):void{
 const base=parts.get(NELSON.base),drum=parts.get(NELSON.drum),tower=parts.get(NELSON.tower);if(!base||!drum||!tower)return;
 const y0=ground.rangeUnder(base.outer,1).min,c=centroid(drum.outer),r0=Math.sqrt(areaOf(drum.outer)/Math.PI),r6=Math.sqrt(areaOf(tower.outer)/Math.PI),N=20;
 shell(b,base.outer,()=>y0-.15,()=>y0+base.height);
 const sc=centroid(base.outer);merlons(b,base.outer,()=>y0+base.height,true,m=>{const dx=m[0]-sc[0],dz=m[1]-sc[1],l=Math.hypot(dx,dz)||1;return [dx/l,dz/l];});
 // five stages from the OSM drum's min_height to its height, each ASSUMED 3 % narrower than the one below (the "telescope" of R-wv3-d)
 const s0=drum.minHeight,s1=drum.height,stage=(s1-s0)/5;
 for(let i=0;i<5;i++){const r=r0*(1-.03*i),ya=y0+s0+i*stage,yb=ya+stage;frustum(b,c,r,r,ya,yb,N);
  // ASSUMED string course: 0.35 m tall, 0.2 m proud
  frustum(b,c,r+.2,r+.2,yb-.35,yb,N);cap(b,circle(c,r+.2,N),()=>yb);}
 const top5=y0+s1,rTop=r0*(1-.03*4)+.2;merlons(b,circle(c,rTop-.1,24),()=>top5,true,m=>{const dx=m[0]-c[0],dz=m[1]-c[1],l=Math.hypot(dx,dz);return [dx/l,dz/l];});
 // the sixth stage, OSM's narrower tower part, to 32 m with its battlements (their top at the OSM height)
 const y6=y0+tower.height-BATTLEMENT.height;frustum(b,c,r6,r6,top5,y6,N);cap(b,circle(c,r6,N),()=>y6);
 merlons(b,circle(c,r6-.2,12),()=>y6,true,m=>{const dx=m[0]-c[0],dz=m[1]-c[1],l=Math.hypot(dx,dz);return [dx/l,dz/l];});
 // HES's compass mast and time ball: mast ASSUMED 6 m, 0.15 m radius; ball ASSUMED 1.5 m across, at its raised (13:00) position
 frustum(b,c,.15,.1,y6,y6+6,6);const ball=new THREE.SphereGeometry(.75,10,6),p=ball.getAttribute('position');
 const ix=ball.index!;for(let i=0;i<ix.count;i+=3){const v=[0,1,2].map(k=>{const j=ix.getX(i+k);return [p.getX(j)+c[0],p.getY(j)+y6+5,p.getZ(j)+c[1]] as V3;});b.tri(v[0],v[1],v[2],undefined,[(v[0][0]+v[1][0]+v[2][0])/3-c[0],(v[0][1]+v[1][1]+v[2][1])/3-(y6+5),(v[0][2]+v[1][2]+v[2][2])/3-c[1]]);}
 ball.dispose();
}

/** The National Monument's 12 Doric columns: round shafts on the OSM column parts (3 to 13 m), tapering ASSUMED to 0.8 of the base
 *  radius (Greek Doric, no base), each with an echinus and a square abacus under the OSM architrave (13 to 14.5 m). */
export function nationalColumns(b:Batch,parts:ReadonlyMap<string,Area>,ground:Ground):void{
 for(const id of NATIONAL_COLUMNS){const p=parts.get(id);if(!p)continue;
  const y0=ground.rangeUnder(p.outer,4).min,c=centroid(p.outer),r=Math.sqrt(areaOf(p.outer)/Math.PI),bottom=y0+p.minHeight,top=y0+p.height;
  // ASSUMED capital: echinus 0.35 m flaring to 1.15 r, abacus 0.3 m square of side 2.4 r
  frustum(b,c,r,r*.8,bottom,top-.65,16);frustum(b,c,r*.8,r*1.15,top-.65,top-.3,16);
  const h=1.2*r;shell(b,[[c[0]-h,c[1]-h],[c[0]+h,c[1]-h],[c[0]+h,c[1]+h],[c[0]-h,c[1]+h]],()=>top-.3,()=>top);}
}

/** One cross-section of a Castle wall at p (n: unit normal): its top over the higher ground a metre beyond either face, its foot under the
 *  lower ground at either face and beyond it. */
export function castleWallSection(ground:Pick<Terrain,'heightAt'>,p:Pt,n:Pt,rise:number):{hi:number;lo:number}{
 const half=CASTLE_WALL.thickness/2,at=(k:number)=>ground.heightAt(p[0]+n[0]*k,p[1]+n[1]*k),g=[at(half+1),at(-half-1),at(half),at(-half),at(0)];
 return {hi:Math.max(...g)+rise,lo:Math.min(...g)-CASTLE_WALL.sink};
}
/** The Castle's walls along their OSM lines: from the lower ground beside them (less CASTLE_WALL.sink) to the higher ground plus the
 *  ASSUMED height, CASTLE_WALL.thickness thick, battlemented on top. */
export function castleWalls(b:Batch,walls:readonly {curtain:boolean;line:Pt[]}[],ground:Ground):void{
 const half=CASTLE_WALL.thickness/2;
 for(const w of walls){
  // resample every 3 m so the top follows the ground
  const pts:Pt[]=[];for(let i=1;i<w.line.length;i++){const a=w.line[i-1],q=w.line[i],n=Math.max(1,Math.ceil(Math.hypot(q[0]-a[0],q[1]-a[1])/3));for(let k=0;k<n;k++)pts.push([a[0]+(q[0]-a[0])*k/n,a[1]+(q[1]-a[1])*k/n]);}
  pts.push(w.line.at(-1)!);if(pts.length<2)continue;
  const rise=w.curtain?CASTLE_WALL.curtain:CASTLE_WALL.other;
  const side=(i:number):Pt=>{const a=pts[Math.max(0,i-1)],q=pts[Math.min(pts.length-1,i+1)],l=Math.hypot(q[0]-a[0],q[1]-a[1])||1;return [-(q[1]-a[1])/l,(q[0]-a[0])/l];};
  const tops=pts.map((p,i)=>castleWallSection(ground,p,side(i),rise));
  for(let i=1;i<pts.length;i++){const a=pts[i-1],q=pts[i],na=side(i-1),nq=side(i),ta=tops[i-1],tq=tops[i];
   const L=(p:Pt,n:Pt,s:number):Pt=>[p[0]+n[0]*half*s,p[1]+n[1]*half*s];
   for(const s of [1,-1]){const pa=L(a,na,s),pq=L(q,nq,s),len=Math.hypot(pq[0]-pa[0],pq[1]-pa[1]);
    b.poly([[pa[0],ta.lo,pa[1]],[pq[0],tq.lo,pq[1]],[pq[0],tq.hi,pq[1]],[pa[0],ta.hi,pa[1]]],[[0,0],[len,0],[len,tq.hi-tq.lo],[0,ta.hi-ta.lo]],{facing:[na[0]*s,0,na[1]*s]});}
   const A=L(a,na,1),B=L(q,nq,1),C=L(q,nq,-1),D=L(a,na,-1);b.poly([[A[0],ta.hi,A[1]],[B[0],tq.hi,B[1]],[C[0],tq.hi,C[1]],[D[0],ta.hi,D[1]]],undefined,{facing:[0,1,0]});
  }
  for(const i of [0,pts.length-1]){const p=pts[i],n=side(i),t=tops[i],q=pts[i===0?1:i-1],l=Math.hypot(q[0]-p[0],q[1]-p[1])||1,u:Pt=[(p[0]-q[0])/l,(p[1]-q[1])/l];
   b.poly([[p[0]+n[0]*half,t.lo,p[1]+n[1]*half],[p[0]-n[0]*half,t.lo,p[1]-n[1]*half],[p[0]-n[0]*half,t.hi,p[1]-n[1]*half],[p[0]+n[0]*half,t.hi,p[1]+n[1]*half]],undefined,{facing:[u[0],0,u[1]]});}
  // battlements on the outer face line
  const outer=pts.map((p,i)=>{const n=side(i);return [p[0]+n[0]*(half-BATTLEMENT.depth/2),p[1]+n[1]*(half-BATTLEMENT.depth/2)] as Pt;});
  merlons(b,outer,m=>{let best=0,d=Infinity;for(let i=0;i<outer.length;i++){const e=Math.hypot(outer[i][0]-m[0],outer[i][1]-m[1]);if(e<d){d=e;best=i;}}return tops[best].hi;},false);
 }
}
