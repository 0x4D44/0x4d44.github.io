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
 mansard:30,// attic (HES "attic") behind the cornice, R-wv2-a2
 gable:34.5,// the Dutch gables' apex, R-wv2-b
 chimney:36,// stacks, R-wv2-a2
 bay:4.2,// window bay, R-wv2-a2 (about 17 bays along Princes Street)
 below:18,// the facade texture's reach below P: the station side falls ~16 m to the platforms (OSM ground, DTM)
 tower:{shaft:39.6,corbel:41,stage:49.2,dial:45,turret:50.6,turretCap:53,gable:53.6,lantern:[50.2,53.6],cornice:53.9,dome:56.6,top:58},// top: HES 58 m
} as const;
export const BALMORAL_COLOURS={stone:0xb39a7a,cornice:0xc4ab87,slate:0x4f545a,lead:0x6f7880,pane:0x2a3038,surround:0xd2c2a2} as const;

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
const STONE='#b49b7b',LIGHT='#c9b190',SHADE='#8d7759',GLASS='#2b323b',FRAME='#d8c7a6';
/** One window bay of the hotel facade, `bay` m wide, from P-below to P+cornice: storeys and window sizes ASSUMED from R-wv2-a2 and R-wv2-b. */
export function balmoralFacadeTexture():THREE.CanvasTexture|null{
 const L=BALMORAL_LEVELS,W=192,H=2048,span=L.below+L.cornice,ky=H/span,kx=W/L.bay,Y=(m:number)=>H-(m+L.below)*ky;
 return ashlarCanvas(W,H,g=>{
  g.fillStyle=STONE;g.fillRect(0,0,W,H);
  // ashlar courses, 0.45 m; rusticated (deeper joints) below the first-floor balcony band
  for(let m=-L.below;m<L.cornice;m+=.45){g.fillStyle=m<8.2?'rgba(70,52,34,.4)':'rgba(70,52,34,.14)';g.fillRect(0,Y(m),W,m<8.2?3:1.5);}
  const win=(cx:number,y0:number,w:number,h:number,arch=false,pediment=false)=>{
   const x=cx*kx-w*kx/2,top=Y(y0+h),bottom=Y(y0);
   g.fillStyle=FRAME;g.fillRect(x-.18*kx,top-.18*ky,w*kx+.36*kx,bottom-top+.36*ky);
   g.fillStyle=GLASS;g.beginPath();
   if(arch){g.moveTo(x,bottom);g.lineTo(x,top+w*kx/2);g.arc(x+w*kx/2,top+w*kx/2,w*kx/2,Math.PI,0);g.lineTo(x+w*kx,bottom);}else g.rect(x,top,w*kx,bottom-top);
   g.fill();g.fillStyle='rgba(216,199,166,.8)';g.fillRect(x+w*kx/2-1.5,top,3,bottom-top);g.fillRect(x,(top+bottom)/2-1.5,w*kx,3);
   if(pediment){g.fillStyle=LIGHT;g.beginPath();g.moveTo(x-.35*kx,top-.25*ky);g.lineTo(x+w*kx/2,top-.95*ky);g.lineTo(x+w*kx+.35*kx,top-.25*ky);g.fill();}
   g.fillStyle=LIGHT;g.fillRect(x-.3*kx,bottom,w*kx+.6*kx,.22*ky);
  };
  // below the street, on the station side: plain storeys of 3.6 m
  for(let m=-L.below+1;m<-1;m+=3.6)win(L.bay/2,m,1.3,2.0);
  win(L.bay/2,.6,2.4,3.7,true);// ground floor: tall round-headed openings (R-wv2-a2)
  win(L.bay/2,5.3,1.5,1.9);// mezzanine (HES)
  g.fillStyle=LIGHT;g.fillRect(0,Y(8.6),W,.4*ky);g.fillStyle=SHADE;g.fillRect(0,Y(8.2),W,.12*ky);// first-floor balcony band
  win(L.bay/2,9.2,1.5,2.6,false,true);win(L.bay/2,13.0,1.45,2.4);win(L.bay/2,16.7,1.4,2.2);win(L.bay/2,20.3,1.35,2.0);
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
  const g=[[hw-1.3,T.stage],[hw-1.3,T.stage+.9],[hw-2.1,T.stage+1.2],[2.6,T.stage+2.0],[1.6,T.gable-1.2],[1.6,T.gable-.6],[0,T.gable]] as [number,number][];
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
  revolve(b.paint,p[0],p[2],[[1.3,P+T.turret],[1.3,P+T.turret+.3],[1.2,P+T.turret+.6],[.9,P+T.turret+1.2],[.45,P+T.turret+1.9],[.2,P+T.turretCap-.1],[0,P+T.turretCap+.5]],8,lead,Math.PI/8);
 }
 // the roof behind the gables and the octagonal lantern on it
 const sq=[at(-half[0],-half[1],0),at(half[0],-half[1],0),at(half[0],half[1],0),at(-half[0],half[1],0)];
 for(let i=0;i<4;i++){const a=sq[i],e=sq[(i+1)%4],m=[(a[0]+e[0])/2-centre[0],0,(a[2]+e[2])/2-centre[1]] as V3;b.paint.tri([a[0],P+T.stage,a[2]],[e[0],P+T.stage,e[2]],[centre[0],P+T.stage+2.4,centre[1]],undefined,m);}
 const [l0,l1]=T.lantern;
 prism(b.paint,centre[0],centre[1],2.7,P+l0,P+l1,8,stone,Math.PI/8,false);
 for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4+Math.PI/8,n:V3=[Math.cos(a),0,Math.sin(a)],r=2.7*Math.cos(Math.PI/8)+.02;
  obox(b.paint,[centre[0]+n[0]*r,P+l0+2.0,centre[1]+n[2]*r],[-n[2],0,n[0]],up,n,[.45,.75,.02],C(BALMORAL_COLOURS.pane));}
 revolve(b.paint,centre[0],centre[1],[[3.0,P+l1],[3.0,P+T.cornice],[2.8,P+T.cornice]],8,cornice,Math.PI/8);
 // ogee dome, small lantern and finial: the published top, P+58 (HES)
 revolve(b.spire,centre[0],centre[1],[[2.85,P+T.cornice],[2.95,P+T.cornice+.5],[2.75,P+T.cornice+1.1],[2.2,P+T.cornice+1.7],[1.4,P+T.cornice+2.2],[.75,P+T.cornice+2.5],[.45,P+T.dome]],16,lead);
 prism(b.spire,centre[0],centre[1],.45,P+T.dome,P+T.dome+.6,8,lead,Math.PI/8,false);
 revolve(b.spire,centre[0],centre[1],[[.55,P+T.dome+.6],[.25,P+T.dome+.9],[.08,P+T.top-.3],[0,P+T.top]],8,lead);
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
 const roof=ccw(simplifyRing(ring,1.2)),inner=insetRing(roof,2.2),y1=top+.6,y2=P+L.mansard;
 for(let i=0;i<roof.length;i++){
  const a=roof[i],c=roof[(i+1)%roof.length],len=Math.hypot(c[0]-a[0],c[1]-a[1]);if(len<.5)continue;
  const n:V3=[(c[1]-a[1])/len,0,-(c[0]-a[0])/len],along:V3=[(c[0]-a[0])/len,0,(c[1]-a[1])/len];
  wallBox(b.paint,[a[0]+n[0]*.35,a[1]+n[2]*.35],[c[0]+n[0]*.35,c[1]+n[2]*.35],top-.5,y1,.55,cornice,.55);// main cornice
  const ia=inner[i],ic=inner[(i+1)%roof.length];
  b.paint.poly([[a[0],y1,a[1]],[c[0],y1,c[1]],[ic[0],y2,ic[1]],[ia[0],y2,ia[1]]],undefined,{facing:unit([n[0],.5,n[2]]),color:slate});// mansard
  if(len<9)continue;
  const bays=Math.floor(len/L.bay);
  for(let k=0;k<bays;k++){
   const s=(k+.5)*len/bays,m:Pt=[a[0]+along[0]*s,a[1]+along[2]*s];
   if(Math.hypot(m[0]-tower.centre[0],m[1]-tower.centre[1])<9)continue;
   if(k%4===1&&k<bays-1){
    // a Dutch gable standing on the wall line (R-wv2-a2, R-wv2-b), with an attic window
    const g=[[2.8,L.cornice],[2.8,L.cornice+3.6],[2.2,L.cornice+4.0],[1.9,L.cornice+5.6],[1.2,L.cornice+6.1],[1.2,L.gable-1.6],[.6,L.gable-.9],[0,L.gable]] as [number,number][];
    slab(b.paint,[...g.map(([x,y])=>[x,P+y] as [number,number]),...g.slice(0,-1).reverse().map(([x,y])=>[-x,P+y] as [number,number])],[m[0]+n[0]*.05,0,m[1]+n[2]*.05],along,n,3.2,stone);
    obox(b.paint,[m[0]+n[0]*.08,P+L.cornice+2.7,m[1]+n[2]*.08],along,[0,1,0],n,[.7,1.1,.02],pane);
    obox(b.paint,[m[0]+n[0]*.08,P+L.cornice+5.2,m[1]+n[2]*.08],along,[0,1,0],n,[.4,.4,.02],pane);
   }else if(k%2===0){
    // a dormer on the mansard: stone cheeks, window, pitched cap
    const c0:V3=[m[0]-n[0]*1.3,0,m[1]-n[2]*1.3];
    obox(b.paint,[c0[0],(y1+y1+2.6)/2,c0[2]],along,[0,1,0],n,[1.0,1.3,1.0],stone);
    obox(b.paint,[c0[0]+n[0]*1.01,y1+1.25,c0[2]+n[2]*1.01],along,[0,1,0],n,[.6,.85,.01],pane);
    for(const side of [-1,1])b.paint.poly([[c0[0]+along[0]*side*1.15+n[0]*1.05,y1+2.6,c0[2]+along[2]*side*1.15+n[2]*1.05],[c0[0]+n[0]*1.05,y1+3.5,c0[2]+n[2]*1.05],[c0[0]-n[0]*1.0,y1+3.5,c0[2]-n[2]*1.0],[c0[0]+along[0]*side*1.15-n[0]*1.0,y1+2.6,c0[2]+along[2]*side*1.15-n[2]*1.0]],undefined,{facing:[along[0]*side,1,along[2]*side],color:slate});
    b.paint.tri([c0[0]-along[0]*1.0+n[0]*1.0,y1+2.6,c0[2]-along[2]*1.0+n[2]*1.0],[c0[0]+along[0]*1.0+n[0]*1.0,y1+2.6,c0[2]+along[2]*1.0+n[2]*1.0],[c0[0]+n[0]*1.0,y1+3.5,c0[2]+n[2]*1.0],undefined,n);
   }else if(k%4===3){
    // a chimney stack on the attic, inboard of the mansard
    const s0:Pt=[m[0]-n[0]*3.4,m[1]-n[2]*3.4];
    obox(b.paint,[s0[0],(y2-1+P+L.chimney)/2,s0[1]],along,[0,1,0],n,[1.4,(P+L.chimney-y2+1)/2,.5],stone);
    obox(b.paint,[s0[0],P+L.chimney+.12,s0[1]],along,[0,1,0],n,[1.55,.15,.62],cornice);
   }
  }
 }
 cap(b.paint,inner,()=>y2);
 // the corner domes: the large one on the west (Waverley Steps) corner in R-wv2-b, a small turret on the North Bridge corner in R-wv2-a2
 const corner=(x:number,z:number)=>{let k=0;for(let i=1;i<roof.length;i++)if(Math.hypot(roof[i][0]-x,roof[i][1]-z)<Math.hypot(roof[k][0]-x,roof[k][1]-z))k=i;return k;};
 const west=insetRing(roof,3.4)[corner(22.3,-122.4)];
 prism(b.paint,west[0],west[1],3.3,top,P+L.cornice+3.2,16,stone,0,false);
 revolve(b.paint,west[0],west[1],[[3.5,P+L.cornice+3.2],[3.5,P+L.cornice+3.5],[3.3,P+L.cornice+4.4],[2.8,P+L.cornice+5.6],[2.0,P+L.cornice+6.6],[1.0,P+L.cornice+7.3],[.4,P+L.cornice+7.5]],16,lead);
 prism(b.paint,west[0],west[1],.4,P+L.cornice+7.5,P+L.cornice+8.3,8,stone);
 const ne=insetRing(roof,1.0)[corner(75.3,-138.5)];
 prism(b.paint,ne[0],ne[1],1.9,P+19,P+L.cornice+2,12,stone,0,false);
 revolve(b.paint,ne[0],ne[1],[[2.0,P+L.cornice+2],[2.0,P+L.cornice+2.3],[1.7,P+L.cornice+3.1],[.9,P+L.cornice+4],[.2,P+L.cornice+4.8],[0,P+L.cornice+5.4]],12,lead);
}
