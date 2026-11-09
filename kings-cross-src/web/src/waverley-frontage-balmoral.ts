// W2 frontage: the Balmoral Hotel (W Hamilton Beattie, 1896-1902; HES LB30315, Category B) and its clock tower.
// Plan: OSM body relation/15839904 (ODbL) and tower way/313744197, both unchanged. Published: the 58 m entrance tower and "5 storeys,
// mezzanine and attic" (HES LB30315); "Dutch gabled bays carrying large clock faces", "polygonal turrets and ogee crown spires" (HES); dial
// 3.2 m (Smith of Derby). Every other height below is ASSUMED, scaled from R-wv2-b (wv2-b-station-west-end-from-the-mound-2011.jpg, a near-
// orthographic view of the tower's west face at ~10.3 px/m, taking the 3.2 m dial as the scale bar and the HES 58 m as the top) and checked
// against R-wv2-a and R-wv2-a2; the storey rhythm and bay width are read from R-wv2-a2 and R-wv2-b. Heights are above P, the street at the
// tower's north (Princes Street) corner.
import * as THREE from 'three';
import type {Pt} from '../../core/geo.ts';
import type {Batch,Rgb,V2,V3} from './materials.ts';
import {rgb} from './materials.ts';
import {cap} from './waverley-mesh.ts';
import {ccw,insetRing,obox,prism,revolve,simplifyRing,slab,unit,wallBox} from './waverley-frontage-mesh.ts';

/** Heights above P (m). ASSUMED unless marked: see the file header for the scaling. */
export const BALMORAL_LEVELS={
 cornice:25.5,// main cornice: R-wv2-b, 31.8 m under the finial
 mansard:31.5,// attic (HES "attic") behind the cornice, R-wv2-a2
 gable:36,// the Dutch gables' apex, R-wv2-b
 chimney:38.6,// stacks, R-wv2-a2
 bay:4.2,// window bay, R-wv2-a2 (about 17 bays along Princes Street)
 below:18,// the facade texture's reach below P: the station side falls ~16 m to the platforms (OSM ground, DTM)
 tower:{shaft:39.6,corbel:41,stage:49.2,dial:45,turret:50.6,turretCap:53.2,gable:52.2,lantern:[49.2,51.6],cornice:51.6,dome:56.1,top:58},// top: HES 58 m
 // the crown (R-wv2-a at ~8.7 px/m on the 12 m tower; R-wv2-b): an ogee bell about 5.2 m across and 4.5 m tall on a short octagonal
 // drum, an open lantern 0.9 m, its cap and finial to the top; the clock gables are slim pediments that stop under the bell's shoulder
} as const;
export const BALMORAL_COLOURS={stone:0xad9f88,cornice:0xc2b59d,slate:0x4f545a,lead:0x6f7880,pane:0x2a3038,surround:0xd2c2a2} as const;

/** The tower's own frame: corners of OSM way/313744197 (a rectangle to 0.1 m), `along` Princes Street, `back` into the hotel. */
export function towerFrame(ring:readonly Pt[]){
 const r=ccw(ring);let best=0,corners:Pt[]=[];
 // the four corners: the vertices where the ring turns by more than 45 degrees
 for(let i=0;i<r.length;i++){const a=r[(i+r.length-1)%r.length],p=r[i],c=r[(i+1)%r.length];
  const t=Math.abs(Math.atan2((p[0]-a[0])*(c[1]-p[1])-(p[1]-a[1])*(c[0]-p[0]),(p[0]-a[0])*(c[0]-p[0])+(p[1]-a[1])*(c[1]-p[1])));if(t>Math.PI/4)corners.push(p);}
 if(corners.length!==4)throw Error(`Balmoral tower: ${corners.length} corners`);
 const centre:Pt=[corners.reduce((s,p)=>s+p[0],0)/4,corners.reduce((s,p)=>s+p[1],0)/4];
 // the north face is the edge whose midpoint lies furthest north (smallest z)
 const edges=corners.map((p,i)=>[p,corners[(i+1)%4]] as const);
 for(let i=1;i<4;i++)if(edges[i][0][1]+edges[i][1][1]<edges[best][0][1]+edges[best][1][1])best=i;
 const [p,q]=edges[best],w=Math.hypot(q[0]-p[0],q[1]-p[1]);
 let along:V3=unit([q[0]-p[0],0,q[1]-p[1]]);if(along[0]<0)along=[-along[0],0,-along[2]];
 const back:V3=[-along[2],0,along[0]];// along x back = up: back points south, into the hotel
 const side=edges[(best+1)%4],d=Math.hypot(side[1][0]-side[0][0],side[1][1]-side[0][1]);
 return {centre,along,back,half:[w/2,d/2] as [number,number]};
}

function ashlarCanvas(w:number,h:number,paint:(g:CanvasRenderingContext2D)=>void):THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d');if(!g)return null;
 paint(g);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
const STONE='#ad9f88',LIGHT='#cbbfa6',SHADE='#76685a',GLASS='#2b323b',FRAME='#ddd0b4';
/** One window bay of the hotel facade, `bay` m wide, from P-below to P+cornice: storeys and window sizes ASSUMED from R-wv2-a2 and R-wv2-b. */
export function balmoralFacadeTexture():THREE.CanvasTexture|null{
 const L=BALMORAL_LEVELS,W=192,H=2048,span=L.below+L.cornice,ky=H/span,kx=W/L.bay,Y=(m:number)=>H-(m+L.below)*ky;
 return ashlarCanvas(W,H,g=>{
  g.fillStyle=STONE;g.fillRect(0,0,W,H);
  // ashlar courses, 0.45 m; rusticated (deeper joints) below the first-floor balcony band
  for(let m=-L.below;m<L.cornice;m+=.45){g.fillStyle=m<8.2?'rgba(58,48,38,.45)':'rgba(58,48,38,.16)';g.fillRect(0,Y(m),W,m<8.2?3:1.5);}
  const win=(cx:number,y0:number,w:number,h:number,arch=false,pediment:'triangle'|'segment'|'hood'|null=null)=>{
   const x=cx*kx-w*kx/2,top=Y(y0+h),bottom=Y(y0);
   g.fillStyle=FRAME;g.fillRect(x-.18*kx,top-.18*ky,w*kx+.36*kx,bottom-top+.36*ky);
   g.fillStyle=GLASS;g.beginPath();
   if(arch){g.moveTo(x,bottom);g.lineTo(x,top+w*kx/2);g.arc(x+w*kx/2,top+w*kx/2,w*kx/2,Math.PI,0);g.lineTo(x+w*kx,bottom);}else g.rect(x,top,w*kx,bottom-top);
   g.fill();g.fillStyle='rgba(216,199,166,.8)';g.fillRect(x+w*kx/2-1.5,top,3,bottom-top);g.fillRect(x,(top+bottom)/2-1.5,w*kx,3);
   // window heads (R-wv2-a2): a triangular pediment, a segmental one or a flat hood, each with its shadow under it
   if(pediment==='triangle'||pediment==='segment'){g.fillStyle=SHADE;g.fillRect(x-.4*kx,top-.24*ky,w*kx+.8*kx,.1*ky);g.fillStyle=LIGHT;g.beginPath();g.moveTo(x-.4*kx,top-.26*ky);
    if(pediment==='triangle')g.lineTo(x+w*kx/2,top-1.0*ky);else g.quadraticCurveTo(x+w*kx/2,top-1.25*ky,x+w*kx+.4*kx,top-.26*ky);g.lineTo(x+w*kx+.4*kx,top-.26*ky);g.fill();}
   else if(pediment==='hood'){g.fillStyle=SHADE;g.fillRect(x-.3*kx,top-.22*ky,w*kx+.6*kx,.1*ky);g.fillStyle=LIGHT;g.fillRect(x-.3*kx,top-.42*ky,w*kx+.6*kx,.22*ky);}
   g.fillStyle=LIGHT;g.fillRect(x-.3*kx,bottom,w*kx+.6*kx,.22*ky);
  };
  // block-to-block tone (a fixed pseudo-random walk, so every build draws the same stones), ±6%
  let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let m=-L.below;m<L.cornice;m+=.45)for(let x=(Math.round(m/.45)%2)*.6;x<L.bay;x+=1.2){const t=rnd();g.fillStyle=t<.5?`rgba(60,48,36,${(.5-t)*.14})`:`rgba(235,225,205,${(t-.5)*.14})`;g.fillRect(x*kx,Y(m+.45),1.2*kx,.45*ky);}
  // the base: darker and weathered toward the station floor, and a dark plinth course on the street
  const base=g.createLinearGradient(0,Y(0),0,Y(-L.below));base.addColorStop(0,'rgba(50,42,34,0)');base.addColorStop(1,'rgba(50,42,34,.38)');g.fillStyle=base;g.fillRect(0,Y(0),W,Y(-L.below)-Y(0));
  g.fillStyle='rgba(45,38,30,.45)';g.fillRect(0,Y(.6),W,.6*ky);g.fillRect(0,Y(-L.below+1.2),W,1.2*ky);
  // soot under the main cornice, fading over two metres
  const soot=g.createLinearGradient(0,Y(23.6),0,Y(21.4));soot.addColorStop(0,'rgba(40,34,28,.4)');soot.addColorStop(1,'rgba(40,34,28,0)');g.fillStyle=soot;g.fillRect(0,Y(23.6),W,Y(21.4)-Y(23.6));
  // below the street, on the station side: plain storeys of 3.6 m
  for(let m=-L.below+1;m<-1;m+=3.6)win(L.bay/2,m,1.3,2.0);
  win(L.bay/2,.6,2.4,3.7,true);// ground floor: tall round-headed openings (R-wv2-a2)
  win(L.bay/2,5.3,1.5,1.9);// mezzanine (HES)
  g.fillStyle=LIGHT;g.fillRect(0,Y(8.6),W,.4*ky);g.fillStyle=SHADE;g.fillRect(0,Y(8.2),W,.12*ky);// first-floor balcony band
  win(L.bay/2,9.2,1.5,2.6,false,'triangle');win(L.bay/2,13.0,1.45,2.4,false,'segment');win(L.bay/2,16.7,1.4,2.2,false,'hood');win(L.bay/2,20.3,1.35,2.0);
  g.fillStyle=SHADE;g.fillRect(0,Y(23.6),W,.25*ky);g.fillStyle=LIGHT;g.fillRect(0,Y(24.1),W,.5*ky);// frieze under the main cornice
 });
}
/** One face of the tower shaft, 0..stage m: quoins and paired round-headed windows (R-wv2-a, R-wv2-b). */
export function balmoralTowerTexture(faceWidth:number):THREE.CanvasTexture|null{
 const T=BALMORAL_LEVELS.tower,W=256,H=1024,ky=H/T.stage,kx=W/faceWidth,Y=(m:number)=>H-m*ky;
 return ashlarCanvas(W,H,g=>{
  g.fillStyle=STONE;g.fillRect(0,0,W,H);
  for(let m=0;m<T.stage;m+=.5){g.fillStyle='rgba(70,52,34,.14)';g.fillRect(0,Y(m),W,1);
   const q=(Math.round(m*2)%2)?.9:.55;g.fillStyle=LIGHT;g.fillRect(0,Y(m+.5)+1,q*kx,.5*ky-2);g.fillRect(W-q*kx,Y(m+.5)+1,q*kx,.5*ky-2);}// quoins
  const pair=(y0:number,h:number)=>{for(const cx of [faceWidth/2-1.15,faceWidth/2+1.15]){const w=1.3,x=cx*kx-w*kx/2,top=Y(y0+h),bottom=Y(y0);
   g.fillStyle=FRAME;g.fillRect(x-.2*kx,top-.2*ky,w*kx+.4*kx,bottom-top+.4*ky);g.fillStyle=GLASS;g.beginPath();g.moveTo(x,bottom);g.lineTo(x,top+w*kx/2);g.arc(x+w*kx/2,top+w*kx/2,w*kx/2,Math.PI,0);g.lineTo(x+w*kx,bottom);g.fill();}};
  pair(27,4.4);pair(33.4,4.6);
  g.fillStyle=LIGHT;g.fillRect(0,Y(32.6),W,.45*ky);g.fillRect(0,Y(26.4),W,.35*ky);// balcony and string courses
 });
}

export interface BalmoralBatches {facade:Batch;tower:Batch;paint:Batch;spire:Batch;dial:Batch}
export interface BalmoralInput {towerRing:Pt[];bodyRing:Pt[];P:number;foot:number}
const C=(hex:number):Rgb=>rgb(hex);

/** The tower: shaft, corbel table, clock stage with four Dutch-gabled dials and corner turrets, octagonal lantern and ogee dome to P+58. */
export function balmoralTower(b:BalmoralBatches,input:BalmoralInput,dialRadius:number){
 const T=BALMORAL_LEVELS.tower,P=input.P,{centre,along,back,half}=towerFrame(input.towerRing);
 const at=(s:number,t:number,y:number):V3=>[centre[0]+along[0]*s+back[0]*t,y,centre[1]+along[2]*s+back[2]*t];
 const up:V3=[0,1,0],stone=C(BALMORAL_COLOURS.stone),cornice=C(BALMORAL_COLOURS.cornice),lead=C(BALMORAL_COLOURS.lead);
 // the four faces: [outward normal, in-plane right as seen from outside, half width, distance from the centre]
 const faces:[V3,V3,number,number][]=[[[-back[0],0,-back[2]],along,half[0],half[1]],[back,[-along[0],0,-along[2]],half[0],half[1]],[[-along[0],0,-along[2]],[-back[0],0,-back[2]],half[1],half[0]],[along,back,half[1],half[0]]];
 // shaft and clock stage walls in the tower texture (u across the face, v up to the stage top)
 const y0=P+BALMORAL_LEVELS.cornice;// below the main cornice the tower stands inside the body walls
 for(const [n,right,hw,dist]of faces){
  const o:V3=[centre[0]+n[0]*dist,0,centre[1]+n[2]*dist],p=(s:number,y:number):V3=>[o[0]+right[0]*s,y,o[2]+right[2]*s];
  const v=(y:number)=>(y-P)/T.stage;
  b.tower.poly([p(-hw,y0),p(hw,y0),p(hw,P+T.shaft),p(-hw,P+T.shaft)],[[0,v(y0)],[1,v(y0)],[1,v(P+T.shaft)],[0,v(P+T.shaft)]],{normal:n});
  b.tower.poly([p(-hw,P+T.corbel),p(hw,P+T.corbel),p(hw,P+T.stage),p(-hw,P+T.stage)],[[0,v(P+T.corbel)],[1,v(P+T.corbel)],[1,1],[0,1]] as V2[],{normal:n});
  // corbel table: a projecting band with a row of corbels under it (R-wv2-b)
  obox(b.paint,[o[0]+n[0]*.3,P+T.corbel-.45,o[2]+n[2]*.3],right,up,n,[hw+.3,.45,.3],cornice);
  for(let s=-hw+.6;s<=hw-.5;s+=.9)obox(b.paint,[o[0]+n[0]*.2+right[0]*s,P+T.shaft+.25,o[2]+n[2]*.2+right[2]*s],right,up,n,[.18,.3,.2],stone);
  // clock-stage cornice and the Dutch gable over the dial (HES "Dutch gabled bays"; outline ASSUMED from R-wv2-b)
  obox(b.paint,[o[0]+n[0]*.15,P+T.stage-.2,o[2]+n[2]*.15],right,up,n,[hw+.15,.25,.25],cornice);
  const g=[[hw-1.6,T.stage],[hw-1.6,T.stage+.6],[hw-2.4,T.stage+.8],[1.9,T.stage+1.3],[1.1,T.gable-.9],[1.1,T.gable-.4],[0,T.gable]] as [number,number][];
  slab(b.paint,[...g.map(([s,y])=>[s,P+y] as [number,number]),...g.slice(0,-1).reverse().map(([s,y])=>[-s,P+y] as [number,number])],[o[0]+n[0]*.1,0,o[2]+n[2]*.1],right,n,1.2,stone);
  obox(b.paint,[o[0]+n[0]*.16,P+T.gable+.15,o[2]+n[2]*.16],right,up,n,[.35,.3,.3],cornice);// gable finial block
  // the dial (3.2 m, Smith of Derby) with a stone surround, on the stage face
  const c:V3=[o[0]+n[0]*.06,P+T.dial,o[2]+n[2]*.06],ring=24;
  for(let i=0;i<32;i++){const a=i*Math.PI/16,e=(i+1)*Math.PI/16,pt=(r:number,q:number,out=0):V3=>[c[0]+right[0]*r*Math.cos(q)+n[0]*out,c[1]+r*Math.sin(q),c[2]+right[2]*r*Math.cos(q)+n[2]*out];
   b.dial.tri(c,pt(dialRadius,a),pt(dialRadius,e),undefined,n);
   b.paint.poly([pt(dialRadius,a,.02),pt(dialRadius+.32,a,.02),pt(dialRadius+.32,e,.02),pt(dialRadius,e,.02)],undefined,{normal:n,color:C(BALMORAL_COLOURS.surround)});
  }
 }
 // corner turrets: octagonal, on the corners, ogee caps (HES "polygonal turrets and ogee crown spires")
 for(const [s,t]of [[-1,-1],[1,-1],[1,1],[-1,1]]){
  const p=at(s*(half[0]-.35),t*(half[1]-.35),0);
  prism(b.paint,p[0],p[2],1.15,P+T.shaft,P+T.turret,8,stone,Math.PI/8,false);
  // the ogee crown spire: a swelling bell, a waist and a long point (R-wv2-a, R-wv2-b; ASSUMED 2.6 m bell and 1.6 m point)
  revolve(b.paint,p[0],p[2],[[1.3,P+T.turret],[1.3,P+T.turret+.3],[1.35,P+T.turret+.7],[1.15,P+T.turret+1.3],[.7,P+T.turret+1.9],[.3,P+T.turret+2.4],[.22,P+T.turretCap],[.08,P+T.turretCap+1.2],[0,P+T.turretCap+1.6]],8,lead,Math.PI/8);
 }
 // the roof behind the gables and the octagonal lantern on it
 const sq=[at(-half[0],-half[1],0),at(half[0],-half[1],0),at(half[0],half[1],0),at(-half[0],half[1],0)];
 for(let i=0;i<4;i++){const a=sq[i],e=sq[(i+1)%4],m=[(a[0]+e[0])/2-centre[0],0,(a[2]+e[2])/2-centre[1]] as V3;b.paint.tri([a[0],P+T.stage,a[2]],[e[0],P+T.stage,e[2]],[centre[0],P+T.stage+2.4,centre[1]],undefined,m);}
 const [l0,l1]=T.lantern;
 prism(b.paint,centre[0],centre[1],2.4,P+l0,P+l1,8,stone,Math.PI/8,false);
 for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4+Math.PI/8,n:V3=[Math.cos(a),0,Math.sin(a)],r=2.4*Math.cos(Math.PI/8)+.02;
  obox(b.paint,[centre[0]+n[0]*r,P+(l0+l1)/2+.3,centre[1]+n[2]*r],[-n[2],0,n[0]],up,n,[.32,.6,.02],C(BALMORAL_COLOURS.pane));}
 revolve(b.paint,centre[0],centre[1],[[2.75,P+T.cornice-.35],[2.75,P+T.cornice],[2.6,P+T.cornice]],8,cornice,Math.PI/8);
 // the ogee bell, open lantern, cap and finial: the published top, P+58 (HES)
 const c=P+T.cornice;
 revolve(b.spire,centre[0],centre[1],[[2.5,c],[2.6,c+.5],[2.5,c+1.3],[2.1,c+2.3],[1.4,c+3.3],[.8,c+4.0],[.6,P+T.dome]],16,lead);
 for(let i=0;i<8;i++){const a=i*Math.PI/4,x=centre[0]+.55*Math.cos(a),z=centre[1]+.55*Math.sin(a);prism(b.spire,x,z,.08,P+T.dome,P+T.dome+.9,6,stone,0,false);}// the lantern's posts
 prism(b.spire,centre[0],centre[1],.36,P+T.dome,P+T.dome+.9,8,C(BALMORAL_COLOURS.pane),Math.PI/8,false);// the dark lantern core seen between them
 revolve(b.spire,centre[0],centre[1],[[.75,P+T.dome+.9],[.7,P+T.dome+1.1],[.42,P+T.dome+1.35],[.14,P+T.dome+1.55],[.05,P+T.top-.15],[0,P+T.top]],8,lead);
 return {centre,along,back,half};
}

/** The hotel body on its OSM outline: walls in the facade texture to the main cornice, cornice, mansard attic, Dutch gables, dormers, stacks, corner domes. */
export function balmoralBody(b:BalmoralBatches,input:BalmoralInput,tower:{centre:Pt}){
 const L=BALMORAL_LEVELS,P=input.P,ring=ccw(input.bodyRing),stone=C(BALMORAL_COLOURS.stone),cornice=C(BALMORAL_COLOURS.cornice),slate=C(BALMORAL_COLOURS.slate),pane=C(BALMORAL_COLOURS.pane),lead=C(BALMORAL_COLOURS.lead);
 const top=P+L.cornice,v=(y:number)=>(y-P+L.below)/(L.below+L.cornice);
 let run=0;
 for(let i=0;i<ring.length;i++){
  const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<1e-6)continue;
  const n:V3=[(c[1]-a[1])/len,0,-(c[0]-a[0])/len],u0=run/L.bay,u1=(run+len)/L.bay;run+=len;
  b.facade.poly([[a[0],input.foot,a[1]],[c[0],input.foot,c[1]],[c[0],top,c[1]],[a[0],top,a[1]]],[[u0,v(input.foot)],[u1,v(input.foot)],[u1,v(top)],[u0,v(top)]],{normal:n});
 }
 cap(b.paint,ring,()=>top);
 // the roofline on the outline with the OSM's sub-metre notches smoothed out (never the walls)
 const roof=ccw(simplifyRing(ring,1.2)),inner=insetRing(roof,2.2),y1=top+.6,y2=P+L.mansard;let gk=0;const features:{kind:'gable'|'dormer'|'stack';x:number;z:number}[]=[];
 for(let i=0;i<roof.length;i++){
  const a=roof[i],c=roof[(i+1)%roof.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.5)continue;
  const n:V3=[(c[1]-a[1])/len,0,-(c[0]-a[0])/len],along:V3=[(c[0]-a[0])/len,0,(c[1]-a[1])/len];
  wallBox(b.paint,[a[0]+n[0]*.45,a[1]+n[2]*.45],[c[0]+n[0]*.45,c[1]+n[2]*.45],top-.5,y1,.8,cornice,.8);// main cornice, 1.25 m proud
  wallBox(b.paint,[a[0]+n[0]*.1,a[1]+n[2]*.1],[c[0]+n[0]*.1,c[1]+n[2]*.1],top-1.6,top-.5,.2,stone,.2);// the frieze under it
  const ia=inner[i],ic=inner[(i+1)%roof.length];
  b.paint.poly([[a[0],y1,a[1]],[c[0],y1,c[1]],[ic[0],y2,ic[1]],[ia[0],y2,ia[1]]],undefined,{facing:unit([n[0],.5,n[2]]),color:slate});// mansard
  // every edge of 3.5 m or more carries its bays, the pattern counted round the whole roofline (R-wv2-a: gables and stacks along the front)
  if(len<3.5)continue;
  const bays=Math.max(1,Math.floor(len/L.bay));
  for(let kk=0;kk<bays;kk++){
   const k=gk++,s=(kk+.5)*len/bays,m:Pt=[a[0]+along[0]*s,a[1]+along[2]*s];
   if(Math.hypot(m[0]-tower.centre[0],m[1]-tower.centre[1])<9)continue;
   if(k%3===1&&len>=7){
    // a Dutch gable standing on the wall line (R-wv2-a2, R-wv2-b), with an attic window
    features.push({kind:'gable',x:m[0],z:m[1]});
    const g=[[2.8,L.cornice],[2.8,L.cornice+3.6],[2.2,L.cornice+4.0],[1.9,L.cornice+5.6],[1.2,L.cornice+6.1],[1.2,L.gable-1.6],[.6,L.gable-.9],[0,L.gable]] as [number,number][];
    slab(b.paint,[...g.map(([x,y])=>[x,P+y] as [number,number]),...g.slice(0,-1).reverse().map(([x,y])=>[-x,P+y] as [number,number])],[m[0]+n[0]*.05,0,m[1]+n[2]*.05],along,n,3.2,stone);
    obox(b.paint,[m[0]+n[0]*.08,P+L.cornice+2.7,m[1]+n[2]*.08],along,[0,1,0],n,[.7,1.1,.02],pane);
    obox(b.paint,[m[0]+n[0]*.08,P+L.cornice+5.2,m[1]+n[2]*.08],along,[0,1,0],n,[.4,.4,.02],pane);
   }else{
    // a dormer on the mansard: stone cheeks, window, pitched cap
    features.push({kind:'dormer',x:m[0],z:m[1]});
    const c0:V3=[m[0]-n[0]*1.3,0,m[1]-n[2]*1.3];
    obox(b.paint,[c0[0],(y1+y1+2.6)/2,c0[2]],along,[0,1,0],n,[1.0,1.3,1.0],stone);
    obox(b.paint,[c0[0]+n[0]*1.01,y1+1.25,c0[2]+n[2]*1.01],along,[0,1,0],n,[.6,.85,.01],pane);
    for(const side of [-1,1])b.paint.poly([[c0[0]+along[0]*side*1.15+n[0]*1.05,y1+2.6,c0[2]+along[2]*side*1.15+n[2]*1.05],[c0[0]+n[0]*1.05,y1+3.5,c0[2]+n[2]*1.05],[c0[0]-n[0]*1.0,y1+3.5,c0[2]-n[2]*1.0],[c0[0]+along[0]*side*1.15-n[0]*1.0,y1+2.6,c0[2]+along[2]*side*1.15-n[2]*1.0]],undefined,{facing:[along[0]*side,1,along[2]*side],color:slate});
    b.paint.tri([c0[0]-along[0]*1.0+n[0]*1.0,y1+2.6,c0[2]-along[2]*1.0+n[2]*1.0],[c0[0]+along[0]*1.0+n[0]*1.0,y1+2.6,c0[2]+along[2]*1.0+n[2]*1.0],[c0[0]+n[0]*1.0,y1+3.5,c0[2]+n[2]*1.0],undefined,n);
   }
   if(k%3===2||(k%3===0&&k>0)){
    // a chimney stack on the attic behind the bay, inboard of the mansard, with its cope and pots (R-wv2-b: a stack beside every gable)
    features.push({kind:'stack',x:m[0],z:m[1]});
    const s0:Pt=[m[0]-n[0]*3.4-along[0]*(k%3===2?1.2:-1.2),m[1]-n[2]*3.4-along[2]*(k%3===2?1.2:-1.2)];
    obox(b.paint,[s0[0],(y2-1+P+L.chimney)/2,s0[1]],along,[0,1,0],n,[1.2,(P+L.chimney-y2+1)/2,.55],stone);
    obox(b.paint,[s0[0],P+L.chimney+.12,s0[1]],along,[0,1,0],n,[1.35,.15,.68],cornice);
    for(const d of [-.6,0,.6])prism(b.paint,s0[0]+along[0]*d,s0[1]+along[2]*d,.14,P+L.chimney+.27,P+L.chimney+.8,6,C(0x8a6a52),0,true);
   }
  }
 }
 cap(b.paint,inner,()=>y2);
 // the first-floor balcony band (R-wv2-a, R-wv2-b): a stone slab 0.7 m proud at P+8.2 with a balustrade, round the whole simplified outline
 for(let i=0;i<roof.length;i++){const a=roof[i],c=roof[(i+1)%roof.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.5)continue;
  const n:V3=[(c[1]-a[1])/len,0,-(c[0]-a[0])/len],along:V3=[(c[0]-a[0])/len,0,(c[1]-a[1])/len];
  wallBox(b.paint,[a[0]+n[0]*.35,a[1]+n[2]*.35],[c[0]+n[0]*.35,c[1]+n[2]*.35],P+8.2,P+8.5,.35,cornice,.35);
  wallBox(b.paint,[a[0]+n[0]*.6,a[1]+n[2]*.6],[c[0]+n[0]*.6,c[1]+n[2]*.6],P+9.3,P+9.45,.1,cornice,.1);
  for(let s=.3;s<len-.2;s+=.45){const q:Pt=[a[0]+along[0]*s+n[0]*.6,a[1]+along[2]*s+n[2]*.6];obox(b.paint,[q[0],P+8.9,q[1]],along,[0,1,0],n,[.07,.4,.07],stone);}
 }
 // three projecting bays, two storeys of the street front 0.6 m proud from the balcony to the cornice (R-wv2-a: the Princes Street
 // front; ASSUMED 8.4 m, two window bays, wide): at 30% and 70% of the longest north-facing edge, and the middle of the east (North Bridge) one
 const fronts:[Pt,Pt,number][]=[];
 for(let i=0;i<ring.length;i++){const a=ring[i],c=ring[(i+1)%ring.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]),nz=-(c[0]-a[0])/len,nx=(c[1]-a[1])/len;if(len<1e-6)continue;
  if(nz<-.8)fronts.push([a,c,0]);else if(nx>.8)fronts.push([a,c,1]);}
 const longest=(side:number)=>fronts.filter(f=>f[2]===side).sort((p,q)=>Math.hypot(q[1][0]-q[0][0],q[1][1]-q[0][1])-Math.hypot(p[1][0]-p[0][0],p[1][1]-p[0][1]))[0];
 const bays:[Pt,Pt,number][]=[];const N=longest(0),E=longest(1);
 if(N)for(const t of [.3,.7])bays.push([N[0],N[1],t]);if(E)bays.push([E[0],E[1],.5]);
 for(const [a,c,t] of bays){const len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<14)continue;
  const along:V3=[(c[0]-a[0])/len,0,(c[1]-a[1])/len],n:V3=[along[2],0,-along[0]],s=len*t,m:Pt=[a[0]+along[0]*s,a[1]+along[2]*s];
  if(Math.hypot(m[0]-tower.centre[0],m[1]-tower.centre[1])<12)continue;
  const w=4.2,d=.6,y0=P+8.5,y3=top-.5,u0=s/L.bay;
  const pt=(x:number,o:number,y:number):V3=>[m[0]+along[0]*x+n[0]*o,y,m[1]+along[2]*x+n[2]*o];
  b.facade.poly([pt(-w,d,y0),pt(w,d,y0),pt(w,d,y3),pt(-w,d,y3)],[[u0-1,v(y0)],[u0+1,v(y0)],[u0+1,v(y3)],[u0-1,v(y3)]],{normal:n});
  for(const sd of [-1,1])b.facade.poly(sd<0?[pt(-w,0,y0),pt(-w,d,y0),pt(-w,d,y3),pt(-w,0,y3)]:[pt(w,d,y0),pt(w,0,y0),pt(w,0,y3),pt(w,d,y3)],[[0,v(y0)],[.15,v(y0)],[.15,v(y3)],[0,v(y3)]],{normal:[along[0]*sd,0,along[2]*sd]});
  b.paint.poly([pt(-w,0,y0),pt(w,0,y0),pt(w,d,y0),pt(-w,d,y0)],undefined,{facing:[0,-1,0],color:cornice});
 }
 // the corner domes: the large one on the west (Waverley Steps) corner in R-wv2-b, a small turret on the North Bridge corner in R-wv2-a2
 const corner=(x:number,z:number)=>{let k=0;for(let i=1;i<roof.length;i++)if(Math.hypot(roof[i][0]-x,roof[i][1]-z)<Math.hypot(roof[k][0]-x,roof[k][1]-z))k=i;return k;};
 const west=insetRing(roof,3.4)[corner(22.3,-122.4)];
 prism(b.paint,west[0],west[1],3.3,top,P+L.cornice+3.2,16,stone,0,false);
 revolve(b.paint,west[0],west[1],[[3.5,P+L.cornice+3.2],[3.5,P+L.cornice+3.5],[3.3,P+L.cornice+4.4],[2.8,P+L.cornice+5.6],[2.0,P+L.cornice+6.6],[1.0,P+L.cornice+7.3],[.4,P+L.cornice+7.5]],16,lead);
 prism(b.paint,west[0],west[1],.4,P+L.cornice+7.5,P+L.cornice+8.3,8,stone);
 const ne=insetRing(roof,1.0)[corner(75.3,-138.5)];
 prism(b.paint,ne[0],ne[1],1.9,P+19,P+L.cornice+2,12,stone,0,false);
 revolve(b.paint,ne[0],ne[1],[[2.0,P+L.cornice+2],[2.0,P+L.cornice+2.3],[1.7,P+L.cornice+3.1],[.9,P+L.cornice+4],[.2,P+L.cornice+4.8],[0,P+L.cornice+5.4]],12,lead);
 return {features};
}
