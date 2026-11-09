// W2 frontage: the Waverley Steps, from Princes Street down between the Balmoral (east) and Princes Mall (west) to the station.
// Plan: the OSM steps cover, way/577519823 (building=roof; ODbL), unchanged; the flights, landings and cover stand inside it.
// Form: R-wv1-d2 (wv1-d2-waverley-steps-escalator-2013.jpg, M J Richardson, CC BY-SA 2.0): stone stair flights with escalators
// beside them, glass-and-steel balustrades, under a glazed canopy carried on white tubular-steel "trees". Covered escalators fitted
// 2012-14 (Wikipedia, in refs/waverley/DIMENSIONS.md).
// ASSUMED: the stair dimensions follow the public-stair limits of the UK building regulations (rise 170 mm, going 300 mm, at most 12
// risers to a flight: Approved Document K, table 1.1 and para 1.14; Scottish Technical Handbook 4.3 is alike), landings at least
// 1.8 m; the stair sits on the ground under it (never below the scene's ground anywhere across the strip), so its flights fall where
// the ground falls; the west 55% is stair and the east part escalators (R-wv1-d2); the canopy 4.5 m over the highest tread within
// 8 m, trees on every second landing, paint and glass tones.
import type {Pt} from '../../core/geo.ts';
import type {Terrain} from '../../core/terrain.ts';
import type {Batch,Rgb,V3} from './materials.ts';
import {rgb} from './materials.ts';
import {bridgeFrame} from './waverley-frontage-bridges.ts';
import {obox,unit} from './waverley-frontage-mesh.ts';

export const WAVERLEY_STEPS={rise:.17,going:.3,flight:12,landing:1.8,clearance:4.5,stairShare:.55,escalator:[.6,.97] as const,tree:.2} as const;
export const STEPS_COLOURS={stone:0x8c8a86,nosing:0xd9b21a,escalator:0x3b3d40,steel:0xb9bec2,handrail:0x222426,tree:0xdfe2e2,mullion:0xc9cdcf} as const;
const C=(h:number):Rgb=>rgb(h);

export interface Tread {s0:number;s1:number;y:number;flight:boolean}
/**
 * The treads from the top (north) down: the longest flight of 3 to `flight` risers whose every tread clears the ground under it and is
 * followed by a landing that clears it too (or ends the strip); where none fits the landing runs on. `top(s0, s1)` is the highest
 * ground under the walking line between s0 and s1.
 */
export function layTreads(length:number,top:(s0:number,s1:number)=>number):Tread[]{
 const S=WAVERLEY_STEPS,out:Tread[]=[];let s=0,y=top(0,S.landing)+.02;
 // the head landing on Princes Street
 out.push({s0:0,s1:S.landing,y,flight:false});s=S.landing;
 const fits=(n:number)=>{if(s+n*S.going>length+1e-9)return false;
  for(let k=0;k<n;k++)if(y-(k+1)*S.rise<top(s+k*S.going,s+(k+1)*S.going)+.02)return false;
  const after=s+n*S.going;return after>=length-1e-9||y-n*S.rise>=top(after,Math.min(length,after+S.landing))+.02;};
 while(s<length-1e-6){
  let n=S.flight;while(n>=3&&!fits(n))n--;
  if(n>=3){for(let k=0;k<n;k++)out.push({s0:s+k*S.going,s1:s+(k+1)*S.going,y:y-(k+1)*S.rise,flight:true});s+=n*S.going;y-=n*S.rise;
   const s1=Math.min(length,s+S.landing);out.push({s0:s,s1,y,flight:false});s=s1;}
  else{const s1=Math.min(length,s+S.going),last=out[out.length-1];last.s1=s1;s=s1;}
 }
 return out;
}

export interface StepsInput {ring:Pt[];ground:Pick<Terrain,'heightAt'>}
/** The steps: stone flights and landings, escalators beside the flights, balustrades, and the glazed canopy on its trees. */
export function waverleySteps(paint:Batch,glass:Batch,input:StepsInput){
 const S=WAVERLEY_STEPS,f=bridgeFrame(input.ring),g=input.ground,up:V3=[0,1,0];
 // the ground under the walking line (the middle 60% of the strip) between s0 and s1, sampled every 0.15 m along; the strip's edges stand
 // against the hotel's and the mall's walls, where the ground model rounds the cutting off, so a stone cheek wall takes them (below)
 const sample=(s0:number,s1:number)=>{const out:number[]=[],n=Math.max(2,Math.ceil((s1-s0)/.15));
  for(let k=0;k<=n;k++)for(const t of [.2,.35,.5,.65,.8]){const p=f.at(Math.max(0,Math.min(f.length,s0+(s1-s0)*k/n)),t);out.push(g.heightAt(p[0],p[1]));}return out;};
 const top=(s0:number,s1:number)=>Math.max(...sample(s0,s1)),low=(s0:number,s1:number)=>Math.min(...sample(s0,s1));
 const treads=layTreads(f.length,top);
 const box=(s0:number,s1:number,t0:number,t1:number,y0:number,y1:number,col:Rgb)=>{
  const sm=(s0+s1)/2,tm=(t0+t1)/2,c=f.at(sm,tm),w=f.width(sm),ax=unit([f.at(s1,tm)[0]-f.at(s0,tm)[0],0,f.at(s1,tm)[1]-f.at(s0,tm)[1]]),az=unit([f.at(sm,t1)[0]-f.at(sm,t0)[0],0,f.at(sm,t1)[1]-f.at(sm,t0)[1]]);
  obox(paint,[c[0],(y0+y1)/2,c[1]],ax,up,az,[(s1-s0)/2,(y1-y0)/2,(t1-t0)*w/2],col);
 };
 const flights:{s0:number;s1:number;y0:number;y1:number}[]=[];
 for(const [i,tr] of treads.entries()){
  const foot=low(tr.s0,tr.s1)-.3,stone=C(STEPS_COLOURS.stone);
  if(tr.flight){
   box(tr.s0,tr.s1,.03,S.stairShare,foot,tr.y,stone);
   box(tr.s0,tr.s1,S.escalator[0],S.escalator[1],foot,tr.y-.02,C(STEPS_COLOURS.escalator));
   const prev=treads[i-1];if(!prev.flight)flights.push({s0:tr.s0,s1:tr.s0,y0:prev.y,y1:tr.y});const fl=flights[flights.length-1];fl.s1=tr.s1;fl.y1=tr.y;
  }else box(tr.s0,tr.s1,.03,.97,foot,tr.y,stone);
 }
 // the escalators run as smooth inclines over their stepped base: the moving deck from the flight's head to its foot, its steel sides
 // closing the sawtooth between the incline and the treads under it (R-wv1-d2)
 for(const fl of flights){const [t0,t1]=S.escalator,q=(s:number,t:number,y:number):V3=>{const p=f.at(s,t);return [p[0],y,p[1]];};
  const line=(s:number)=>fl.y0+(fl.y1-fl.y0)*(s-fl.s0)/(fl.s1-fl.s0);
  paint.poly([q(fl.s0,t0,fl.y0+.01),q(fl.s0,t1,fl.y0+.01),q(fl.s1,t1,fl.y1+.01),q(fl.s1,t0,fl.y1+.01)],undefined,{facing:[0,1,0],color:C(STEPS_COLOURS.escalator)});
  for(const tr of treads)if(tr.flight&&tr.s0>=fl.s0-1e-9&&tr.s1<=fl.s1+1e-9)for(const [t,sd] of [[t0,-1],[t1,1]] as [number,number][]){
   const n=unit([f.at(tr.s0,t1)[0]-f.at(tr.s0,t0)[0],0,f.at(tr.s0,t1)[1]-f.at(tr.s0,t0)[1]]);
   paint.poly([q(tr.s0,t,line(tr.s0)+.01),q(tr.s1,t,line(tr.s1)+.01),q(tr.s1,t,tr.y-.03),q(tr.s0,t,tr.y-.03)],undefined,{normal:[n[0]*sd,0,n[2]*sd],color:C(STEPS_COLOURS.steel)});}
 }
 // the cheek walls along both edges: from under the tread to the handrail or the ground beside it, whichever is higher (ASSUMED 0.4 m thick)
 for(const tr of treads)for(const [t0,t1] of [[0,.03],[.97,1]] as [number,number][]){let gy=-Infinity;
  for(let k=0;k<=4;k++){const p=f.at(tr.s0+(tr.s1-tr.s0)*k/4,(t0+t1)/2),q=f.at(tr.s0+(tr.s1-tr.s0)*k/4,t0<.5?0:1);gy=Math.max(gy,g.heightAt(p[0],p[1]),g.heightAt(q[0],q[1]));}
  box(tr.s0,tr.s1,t0,t1,low(tr.s0,tr.s1)-.3,Math.max(tr.y+1.1,gy+.15),C(STEPS_COLOURS.stone));}
 // nosings: a yellow strip at the top and foot of every flight (R-wv1-d2)
 for(const fl of flights)for(const [s,y] of [[fl.s0,fl.y0],[fl.s1-S.going,fl.y1+S.rise]] as [number,number][])box(s,s+.05,.03,S.stairShare,y-.01,y+.006,C(STEPS_COLOURS.nosing));
 // balustrades either side of each escalator: glass panel and a black handrail, following the flight's pitch
 for(const fl of flights)for(const t of [S.stairShare+.02,S.escalator[1]-.005]){
  const a=f.at(fl.s0,t),b=f.at(fl.s1,t),n=50;
  const pt=(p:Pt,y:number):V3=>[p[0],y,p[1]];
  glass.poly([pt(a,fl.y0),pt(b,fl.y1),pt(b,fl.y1+1.0),pt(a,fl.y0+1.0)],undefined,{normal:unit([-(b[1]-a[1]),0,b[0]-a[0]])});
  for(let k=0;k<n;k++){const p=f.at(fl.s0+(fl.s1-fl.s0)*k/n,t),q=f.at(fl.s0+(fl.s1-fl.s0)*(k+1)/n,t),y0=fl.y0+(fl.y1-fl.y0)*k/n+1.0,y1=fl.y0+(fl.y1-fl.y0)*(k+1)/n+1.0;
   obox(paint,[(p[0]+q[0])/2,(y0+y1)/2+.04,(p[1]+q[1])/2],unit([q[0]-p[0],y1-y0,q[1]-p[1]]),up,unit([-(q[1]-p[1]),0,q[0]-p[0]]),[Math.hypot(q[0]-p[0],y1-y0,q[1]-p[1])/2,.05,.06],C(STEPS_COLOURS.handrail));}
 }
 // the canopy: knots every 4 m along the strip, each 4.5 m over the highest tread within 8 m; a low ridge on the centreline
 const level=(s:number)=>{let y=-Infinity;for(const tr of treads)if(tr.s1>=s-8&&tr.s0<=s+8)y=Math.max(y,tr.y);return y;};
 const knots:number[]=[];for(let s=0;s<f.length;s+=4)knots.push(s);knots.push(f.length);
 const ch=knots.map(s=>level(s)+S.clearance);
 for(let i=1;i<ch.length;i++)ch[i]=Math.min(ch[i],ch[i-1]);// never rising toward the foot
 for(let i=0;i+1<knots.length;i++){
  const s0=knots[i],s1=knots[i+1],y0=ch[i],y1=ch[i+1],row=(s:number,t:number,y:number):V3=>{const p=f.at(s,t);return [p[0],y,p[1]];};
  for(const [ta,tb,ra,rb] of [[.02,.5,0,.5],[.5,.98,.5,0]] as [number,number,number,number][]){
   const q=[row(s0,ta,y0+ra),row(s1,ta,y1+ra),row(s1,tb,y1+rb),row(s0,tb,y0+rb)];glass.poly(q,undefined,{facing:[0,1,0]});// one face: the glass material is two-sided
  }
  for(const t of [.02,.5,.98]){const a=row(s0,t,y0+(t===.5?.5:0)),b=row(s1,t,y1+(t===.5?.5:0));
   obox(paint,[(a[0]+b[0])/2,(a[1]+b[1])/2-.06,(a[2]+b[2])/2],unit([b[0]-a[0],b[1]-a[1],b[2]-a[2]]),up,unit([-(b[2]-a[2]),0,b[0]-a[0]]),[Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/2,.07,.07],C(STEPS_COLOURS.mullion));}
  const a=row(s0,.02,y0),b=row(s0,.98,y0);obox(paint,[(a[0]+b[0])/2,y0+.2,(a[2]+b[2])/2],unit([b[0]-a[0],0,b[2]-a[2]]),up,unit([-(b[2]-a[2]),0,b[0]-a[0]]),[f.width(s0)*.48,.09,.07],C(STEPS_COLOURS.mullion));
 }
 // the trees: a white tube on every second landing's centre, branching in four arms to the canopy (R-wv1-d2)
 const trees:{x:number;z:number;y0:number;y1:number}[]=[];
 treads.filter(t=>!t.flight&&t.s1-t.s0>=S.landing-1e-6).forEach((tr,k)=>{
  if(k%2)return;const s=(tr.s0+tr.s1)/2,c=f.at(s,.5);let i=0;while(i+1<knots.length-1&&knots[i+1]<s)i++;
  const yc=ch[i]+(ch[i+1]-ch[i])*(s-knots[i])/(knots[i+1]-knots[i]),fork=tr.y+(yc-tr.y)*.55;
  obox(paint,[c[0],(tr.y+fork)/2,c[1]],[1,0,0],up,[0,0,1],[S.tree,(fork-tr.y)/2,S.tree],C(STEPS_COLOURS.tree));
  for(const [ds,dt] of [[-1.6,.3],[1.6,.3],[-1.6,-.3],[1.6,-.3]]){const e=f.at(s+ds,.5+dt),top:V3=[e[0],yc+.45-Math.abs(dt)*.9,e[1]],bot:V3=[c[0],fork,c[1]];
   const ax=unit([top[0]-bot[0],top[1]-bot[1],top[2]-bot[2]]),len=Math.hypot(top[0]-bot[0],top[1]-bot[1],top[2]-bot[2]),side=unit([ax[2],0,-ax[0]]);
   obox(paint,[(top[0]+bot[0])/2,(top[1]+bot[1])/2,(top[2]+bot[2])/2],ax,unit([side[1]*ax[2]-side[2]*ax[1],side[2]*ax[0]-side[0]*ax[2],side[0]*ax[1]-side[1]*ax[0]]),side,[len/2,S.tree*.6,S.tree*.6],C(STEPS_COLOURS.tree));}
  trees.push({x:c[0],z:c[1],y0:tr.y,y1:yc});
 });
 return {frame:f,treads,flights,canopy:knots.map((s,i)=>({s,y:ch[i]})),trees};
}
