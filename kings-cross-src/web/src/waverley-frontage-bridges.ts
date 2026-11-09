// W2 frontage: North Bridge (1894-97, Blyth & Westland, William Arrol; HES LB30035) and Waverley Bridge (about 1894-96; HES LB30270).
// Published: North Bridge "3 wide spans, each constructed of 6 arched iron girders, on masonry piers" (HES LB30035), spans of 175 ft = 53 m
// (Wikipedia; Canmore summary); Waverley Bridge "seven plate girder spans" (HES LB30270). Plan: the OSM outlines way/380552925 and
// way/377738788, unchanged; the decks keep the DTM end-height rule (waverley-frontage.ts). Placed against the scene's railway, not a camera:
// North Bridge's two piers stand in the only bands across the bridge clear of every drawn track's ballast and every platform (pier 1 on the
// roof of the station block OSM way/225997712, which fills its band), and Waverley Bridge's six support lines stand on island platforms
// by the rule WAVERLEY_BRIDGE_COLUMN (precomputed by tools/build-waverley-frontage-extra.ts, checked by tests).
// ASSUMED: arch springing 6.4 m above the rail datum (above the 3.9 m train envelope, core/train-emr.ts), rib section 1.3 x 0.5 m, pier
// widths (the free bands: 3.5 and 3.1 m), the spandrel post pitch (span/20), parapet height 1.1 m, the deck's 1 m structural depth,
// the paint colours (R-wv2-a2 blue and cream parapet, R-wv2-c2 grey ribs) and Waverley Bridge's 0.55 m columns (R-wv2-b shows columns on
// the platforms under the deck).
import type {Pt} from '../../core/geo.ts';
import type {Batch,Rgb,V3} from './materials.ts';
import {rgb} from './materials.ts';
import {WAVERLEY_LEVELS} from './waverley-mesh.ts';
import {obox,unit,wallBox} from './waverley-frontage-mesh.ts';

export const NORTH_BRIDGE={spanLength:53,ribsPerSpan:6,springing:6.4,rib:[1.3,.5] as const,deckDepth:1,
 /** Along the bridge from its north end (m): spans and piers. Pier 2 fills the 3.5 m band between platform 10's end and the next track. */
 spans:[[0,53],[58,109.25],[112.75,165.55]] as [number,number][],piers:[[53,58],[109.25,112.75]] as [number,number][],
 parapet:1.1} as const;
export const BRIDGE_COLOURS={rib:0x7d8b92,spandrel:0x3f4b57,blue:0x4c78ad,cream:0xe4dcc4,trim:0x6b2f2a,coping:0xcfc6b0,pier:0x786d60,
 balustrade:0xd8d2bd,panel:0xc4bda7,girder:0x8d9188,column:0x5d6a62} as const;
const C=(h:number):Rgb=>rgb(h);
const inRing=([x,z]:Pt,p:readonly Pt[])=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>z)!==(p[j][1]>z)&&x<(p[j][0]-p[i][0])*(z-p[i][1])/(p[j][1]-p[i][1])+p[i][0])yes=!yes;return yes;};
const segDist=([x,z]:Pt,a:Pt,b:Pt)=>{const dx=b[0]-a[0],dz=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[1])*dz)/(dx*dx+dz*dz||1)));return Math.hypot(x-a[0]-t*dx,z-a[1]-t*dz);};
/**
 * Where a Waverley Bridge column may stand (the lead's round-1 ruling: on the island platforms, as R-wv2-b shows). Its square base
 * (`base` half side, ASSUMED) must lie wholly on one platform, clear of the edge zone: coping 0-0.2 m, yellow tactile strip 0.2-0.6 m,
 * white line to 1.15 m from the edge (materials.ts platformEdge; DfT tactile guidance, offsets ASSUMED), so at least `minEdge` in;
 * and its centre `track` m or more from every track centre, outside the train envelope (2.9 m wide body, core/train*.ts, plus margin).
 */
export const WAVERLEY_BRIDGE_COLUMN={base:.42,shaft:.275,edgeZone:1.15,minEdge:1,track:3.2,
 /** The distance from the column's centre that its base reaches in any direction (the base square's half diagonal). */
 get reach(){return this.base*Math.SQRT2;},
 allowed(p:Pt,platforms:readonly (readonly Pt[])[],tracks:readonly (readonly [Pt,Pt])[]):boolean{
  const on=platforms.find(r=>inRing(p,r));if(!on)return false;
  const edge=Math.min(...on.map((a,i)=>segDist(p,a,on[(i+1)%on.length])));
  return edge-this.reach>=Math.max(this.edgeZone,this.minEdge)&&tracks.every(([a,b])=>segDist(p,a,b)>=this.track);
 }};
type Deck=(p:Pt)=>number;
const lerp=(a:Pt,b:Pt,t:number):Pt=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
function along(path:readonly Pt[],f:number):Pt{
 const lens=path.slice(1).map((p,i)=>Math.hypot(p[0]-path[i][0],p[1]-path[i][1])),total=lens.reduce((s,l)=>s+l,0);let d=f*total;
 for(let i=0;i<lens.length;i++){if(d<=lens[i]||i===lens.length-1)return lerp(path[i],path[i+1],Math.min(1,d/lens[i]));d-=lens[i];}
 return path.at(-1)!;
}
/**
 * A bridge's own frame from its OSM outline: the two long sides (west and east, each from the north end), the length along the west side,
 * and P(s, t): s metres from the north end, t from 0 (west side) to 1 (east side).
 */
export function bridgeFrame(ring:readonly Pt[]){
 // corners: where the outline turns by more than 45 degrees; of the four sides between them the two longest are the long sides
 const n=ring.length,corners:number[]=[];
 for(let i=0;i<n;i++){const a=ring[(i+n-1)%n],p=ring[i],c=ring[(i+1)%n];
  if(Math.abs(Math.atan2((p[0]-a[0])*(c[1]-p[1])-(p[1]-a[1])*(c[0]-p[0]),(p[0]-a[0])*(c[0]-p[0])+(p[1]-a[1])*(c[1]-p[1])))>Math.PI/4)corners.push(i);}
 if(corners.length!==4)throw Error(`bridge outline: ${corners.length} corners`);
 const sides=corners.map((c,k)=>{const out:Pt[]=[];for(let i=c;;i=(i+1)%n){out.push(ring[i]);if(i===corners[(k+1)%4])break;}return out;});
 const len=(c:Pt[])=>c.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-c[i][0],p[1]-c[i][1]),0);
 const [l0,l1]=[...sides].sort((a,b)=>len(b)-len(a)).map(c=>c[0][1]<c.at(-1)![1]?c:[...c].reverse());
 const mx=(c:Pt[])=>c.reduce((s,p)=>s+p[0],0)/c.length,[west,east]=mx(l0)<mx(l1)?[l0,l1]:[l1,l0];
 const length=west.slice(1).reduce((s,p,i)=>s+Math.hypot(p[0]-west[i][0],p[1]-west[i][1]),0);
 const at=(s:number,t:number):Pt=>lerp(along(west,s/length),along(east,s/length),t);
 const width=(s:number)=>{const a=at(s,0),b=at(s,1);return Math.hypot(b[0]-a[0],b[1]-a[1]);};
 return {west,east,length,at,width};
}
type Frame=ReturnType<typeof bridgeFrame>;
const dir=(a:Pt,b:Pt):V3=>unit([b[0]-a[0],0,b[1]-a[1]]);

/** The deck-edge parapets on each long side, in pieces of `pitch` m, leaving out `gaps` (ranges of s). */
function parapets(b:Batch,f:Frame,deck:Deck,style:'north'|'waverley',gaps:readonly [number,number][]=[]):void{
 const pitch=style==='north'?3:2.2,H=NORTH_BRIDGE.parapet;
 for(const side of [0,1]){
  for(let s=0;s+.2<f.length;s+=pitch){
   const s1=Math.min(f.length,s+pitch),m=(s+s1)/2;if(gaps.some(([a,c])=>m>a-.3&&m<c+.3))continue;
   const w=f.width(m),inset=.25/w,t=side?1-inset:inset,a=f.at(s,t),c=f.at(s1,t),y=deck(f.at(m,t)),ax=dir(a,c),out:V3=side?dir(f.at(m,0),f.at(m,1)):dir(f.at(m,1),f.at(m,0));
   const mid:V3=[(a[0]+c[0])/2,0,(a[1]+c[1])/2],len=Math.hypot(c[0]-a[0],c[1]-a[1]);
   if(style==='north'){
    wallBox(b,a,c,y,y+H-.12,.18,C(BRIDGE_COLOURS.blue),.01);
    wallBox(b,a,c,y+H-.12,y+H,.26,C(BRIDGE_COLOURS.coping),.01);
    for(const o of [1,-1]){const n:V3=[out[0]*o,0,out[2]*o],at=(d:number,h:V3,col:number)=>obox(b,[mid[0]+n[0]*(.18+d),y+.5,mid[2]+n[2]*(.18+d)],ax,[0,1,0],n,h,C(col));
     at(.01,[len/2-.3,.3,.01],BRIDGE_COLOURS.trim);at(.02,[len/2-.42,.2,.01],BRIDGE_COLOURS.cream);}
   }else{
    wallBox(b,a,c,y,y+.25,.24,C(BRIDGE_COLOURS.panel),.01);
    wallBox(b,a,c,y+.25,y+H-.24,.18,C(BRIDGE_COLOURS.balustrade),.01);
    wallBox(b,a,c,y+H-.24,y+H-.16,.22,C(BRIDGE_COLOURS.panel),.01);// bed moulding
    wallBox(b,a,c,y+H-.16,y+H-.05,.3,C(BRIDGE_COLOURS.coping),.01);// the cope, overhanging both faces
    wallBox(b,a,c,y+H-.05,y+H,.24,C(BRIDGE_COLOURS.coping),.01);// its weathered top
    for(const o of [1,-1]){const n:V3=[out[0]*o,0,out[2]*o];obox(b,[mid[0]+n[0]*.19,y+.62,mid[2]+n[2]*.19],ax,[0,1,0],n,[len/2-.28,.26,.01],C(BRIDGE_COLOURS.panel));}
    obox(b,[a[0],y+.6,a[1]],ax,[0,1,0],out,[.16,.62,.27],C(BRIDGE_COLOURS.balustrade));// post at each panel joint
   }
  }
 }
}
/** The deck's edge girder faces, 0.06 m proud of each long side, with stiffeners. */
function fascia(b:Batch,f:Frame,deck:Deck,colour:number,stiffener:number):void{
 for(const side of [0,1])for(let s=0;s+.2<f.length;s+=stiffener){
  const s1=Math.min(f.length,s+stiffener),t=side,a=f.at(s,t),c=f.at(s1,t),m=f.at((s+s1)/2,t),y=deck(m),out:V3=side?dir(f.at(s,0),f.at(s,1)):dir(f.at(s,1),f.at(s,0));
  const o=(p:Pt,k:number):Pt=>[p[0]+out[0]*k,p[1]+out[2]*k];
  wallBox(b,o(a,.06),o(c,.06),y-NORTH_BRIDGE.deckDepth,y-.02,.05,C(colour),.005);
  obox(b,[o(a,.14)[0],y-.5,o(a,.14)[1]],dir(a,c),[0,1,0],out,[.07,.48,.05],C(colour));
 }
}

export interface NorthBridgeInput {ring:Pt[];deck:Deck;ground:(ring:Pt[])=>number;seatTop:number}
/** North Bridge below and beside its deck: two masonry piers with pedestals, three spans of six segmental ribs, spandrel posts, fascia, parapets. */
export function northBridge(b:Batch,input:NorthBridgeInput){
 const f=bridgeFrame(input.ring),N=NORTH_BRIDGE,deck=input.deck,up:V3=[0,1,0];
 const pierParts:{ring:Pt[];bottom:number;top:number}[]=[];
 N.piers.forEach(([s0,s1],k)=>{
  const sm=(s0+s1)/2,w=f.width(sm),e=.8/w,ax=dir(f.at(s0,.5),f.at(s1,.5)),az=dir(f.at(sm,0),f.at(sm,1));
  const ring:Pt[]=[f.at(s0,-e),f.at(s1,-e),f.at(s1,1+e),f.at(s0,1+e)];
  const bottom=k===0?input.seatTop:input.ground(ring)-.15,top=Math.min(...ring.map(deck))-.9,c=f.at(sm,.5);
  obox(b,[c[0],(bottom+top)/2,c[1]],ax,up,az,[(s1-s0)/2,(top-bottom)/2,w/2+.8],C(BRIDGE_COLOURS.pier));
  obox(b,[c[0],N.springing-.25,c[1]],ax,up,az,[(s1-s0)/2+.15,.25,w/2+.95],C(BRIDGE_COLOURS.coping));// impost band at the springing
  pierParts.push({ring,bottom,top});
  // pedestals rising through the parapet line on both faces (R-wv2-c2)
  for(const t of [0,1]){const p=f.at(sm,t),o=t?az:[-az[0],0,-az[2]] as V3,y=deck(p),q:V3=[p[0]+o[0]*.2,0,p[1]+o[2]*.2];
   obox(b,[q[0],(y-.9+y+2.3)/2,q[2]],ax,up,az,[(s1-s0)/2+.1,(3.2)/2,.9],C(BRIDGE_COLOURS.pier));
   obox(b,[q[0],y+2.45,q[2]],ax,up,az,[(s1-s0)/2+.25,.15,1.05],C(BRIDGE_COLOURS.coping));
   obox(b,[q[0],y+2.85,q[2]],ax,up,az,[.6,.25,.6],C(BRIDGE_COLOURS.pier));}
 });
 // the north end, over the platforms: a diaphragm from the springing up to the deck (no abutment on the platforms)
 {const w=f.width(0),ax=dir(f.at(0,.5),f.at(1,.5)),az=dir(f.at(0,0),f.at(0,1)),c=f.at(.5,.5),top=Math.min(deck(f.at(0,0)),deck(f.at(0,1)))-.9;
  obox(b,[c[0],(N.springing-.6+top)/2,c[1]],ax,up,az,[.5,(top-N.springing+.6)/2,w/2],C(BRIDGE_COLOURS.pier));}
 // the south abutment, on clear ground beyond the last span
 {const s0=N.spans[2][1],s1=f.length,sm=(s0+s1)/2,w=f.width(sm),ring:Pt[]=[f.at(s0,0),f.at(s1,0),f.at(s1,1),f.at(s0,1)],bottom=input.ground(ring)-.15,top=Math.min(...ring.map(deck))-.9,c=f.at(sm,.5);
  obox(b,[c[0],(bottom+top)/2,c[1]],dir(f.at(s0,.5),f.at(s1,.5)),up,dir(f.at(sm,0),f.at(sm,1)),[(s1-s0)/2,(top-bottom)/2,w/2],C(BRIDGE_COLOURS.pier));
  pierParts.push({ring,bottom,top});}
 // six segmental ribs a span; intrados through the two springings and a crown just under the deck structure
 const ribs:{s:number;t:number;y:number}[][]=[];
 for(const [sa,sb] of N.spans)for(let i=0;i<N.ribsPerSpan;i++){
  const t=.04+i*.92/(N.ribsPerSpan-1),sm=(sa+sb)/2,yc=deck(f.at(sm,t))-N.deckDepth-N.rib[0],h=yc-N.springing,c=sb-sa,R=(c*c/4+h*h)/(2*h);
  const y=(s:number)=>N.springing+Math.sqrt(Math.max(0,R*R-(s-sm)**2))-(R-h),seg=24,half=N.rib[1]/2/f.width(sm),line:{s:number;t:number;y:number}[]=[];
  for(let k=0;k<seg;k++){
   const s0=sa+(sb-sa)*k/seg,s1=sa+(sb-sa)*(k+1)/seg;
   const q=(s:number,dt:number,top:boolean):V3=>{const p=f.at(s,t+dt);return [p[0],y(s)+(top?N.rib[0]:0),p[1]];};
   const across=dir(f.at(s0,t-half),f.at(s0,t+half)),tan=unit([...(()=>{const a=f.at(s0,t),e=f.at(s1,t);return [e[0]-a[0],y(s1)-y(s0),e[1]-a[1]] as V3;})()]);
   const nUp=unit([across[1]*tan[2]-across[2]*tan[1],across[2]*tan[0]-across[0]*tan[2],across[0]*tan[1]-across[1]*tan[0]]),upward:V3=nUp[1]<0?[-nUp[0],-nUp[1],-nUp[2]]:nUp;
   const col=C(BRIDGE_COLOURS.rib);
   b.poly([q(s0,-half,false),q(s1,-half,false),q(s1,half,false),q(s0,half,false)],undefined,{normal:[-upward[0],-upward[1],-upward[2]],color:col});
   b.poly([q(s0,-half,true),q(s1,-half,true),q(s1,half,true),q(s0,half,true)],undefined,{normal:upward,color:col});
   b.poly([q(s0,-half,false),q(s1,-half,false),q(s1,-half,true),q(s0,-half,true)],undefined,{normal:[-across[0],0,-across[2]],color:col});
   b.poly([q(s0,half,false),q(s1,half,false),q(s1,half,true),q(s0,half,true)],undefined,{normal:across,color:col});
   line.push({s:s0,t,y:y(s0)});
  }
  ribs.push(line);
  // spandrel posts on the two outer ribs (HES: cast-iron arcading), and a rail under the deck tying their heads
  if(i===0||i===N.ribsPerSpan-1){
   const out:V3=i===0?dir(f.at(sm,1),f.at(sm,0)):dir(f.at(sm,0),f.at(sm,1)),ax=dir(f.at(sa,t),f.at(sb,t));
   for(let k=1;k<20;k++){const s=sa+c*k/20,p=f.at(s,t),y0=y(s)+N.rib[0],y1=deck(p)-N.deckDepth;if(y1-y0<.15)continue;
    obox(b,[p[0],(y0+y1)/2,p[1]],ax,up,out,[.14,(y1-y0)/2,.2],C(BRIDGE_COLOURS.spandrel));}
   for(let k=0;k<20;k++){const s0=sa+c*k/20,s1=sa+c*(k+1)/20,p=f.at(s0,t),q=f.at(s1,t),ym=deck(f.at((s0+s1)/2,t))-N.deckDepth-.35,yr=y((s0+s1)/2)+N.rib[0];
    if(ym-.18>yr)wallBox(b,p,q,ym-.18,ym+.18,.12,C(BRIDGE_COLOURS.spandrel));}
  }
 }
 fascia(b,f,deck,BRIDGE_COLOURS.spandrel,2.65);
 parapets(b,f,deck,'north',N.piers.map(([a,c])=>[a-.2,c+.2] as [number,number]));
 return {frame:f,piers:pierParts,ribs};
}

export interface WaverleyBridgeInput {ring:Pt[];deck:Deck;columns:{s:number;cols:number[][]}[];ground?:(x:number,z:number)=>number}
/** Waverley Bridge below and beside its deck: plate-girder fascia, columns on the island platforms at its six support lines, balustrade. */
export function waverleyBridge(b:Batch,input:WaverleyBridgeInput){
 const f=bridgeFrame(input.ring),up:V3=[0,1,0],deck=input.deck,columns:{x:number;z:number;bottom:number;top:number}[]=[];
 for(const line of input.columns){
  const ax=dir(f.at(line.s,0),f.at(line.s,1)),az:V3=[-ax[2],0,ax[0]];
  for(const [x,z] of line.cols){const top=deck([x,z])-NORTH_BRIDGE.deckDepth,bottom=WAVERLEY_LEVELS.platform;
   const K=WAVERLEY_BRIDGE_COLUMN;obox(b,[x,(bottom+top)/2,z],ax,up,az,[K.shaft,(top-bottom)/2,K.shaft],C(BRIDGE_COLOURS.column));
   obox(b,[x,bottom+.15,z],ax,up,az,[K.base,.15,K.base],C(BRIDGE_COLOURS.column));
   obox(b,[x,top-.12,z],ax,up,az,[.5,.12,.5],C(BRIDGE_COLOURS.column));
   columns.push({x,z,bottom,top});}
 }
 fascia(b,f,deck,BRIDGE_COLOURS.girder,1.8);
 parapets(b,f,deck,'waverley');
 const ramp=input.ground?marketStreetRamp(b,f,deck,input.ground):null;
 return {frame:f,columns,ramp};
}

/**
 * The approach toward Market Street: the road runs on from the bridge's south end on its own line between masonry retaining walls,
 * graded from the deck to where the ground meets it (ASSUMED: straight on, the end width, walls 0.5 m with a 1.1 m parapet; R-wv2-b2
 * shows the walled approach). Returns the road's centre profile and footprint for the tests.
 */
export function marketStreetRamp(b:Batch,f:Frame,deck:Deck,ground:(x:number,z:number)=>number){
 const L=f.length,e0=f.at(L,0),e1=f.at(L,1),c0=f.at(L,.5),c1=f.at(L-5,.5),u=[(c0[0]-c1[0])/5,(c0[1]-c1[1])/5];
 const at=(k:number,t:number):Pt=>{const e=[e0[0]+(e1[0]-e0[0])*t,e0[1]+(e1[1]-e0[1])*t];return [e[0]+u[0]*k,e[1]+u[1]*k];};
 const y0=deck(c0),high=(k:number)=>Math.max(...[0,.25,.5,.75,1].map(t=>{const p=at(k,t);return ground(p[0],p[1]);}));
 let K=0;while(K<40&&high(K)<y0-.05)K+=1;
 const yK=Math.max(y0-.05,high(K)),road=(k:number)=>y0+(yK-y0)*k/Math.max(1,K);
 const footprint:Pt[]=[at(0,0),at(K,0),at(K,1),at(0,1)],profile:{k:number;y:number;ground:number}[]=[];
 for(let k=0;k<K;k+=2){const k1=Math.min(K,k+2),ya=road(k),yb=road(k1);
  const low=Math.min(...[0,.5,1].flatMap(t=>[at(k,t),at(k1,t)]).map(p=>ground(p[0],p[1])))-.15;
  const q=(kk:number,t:number,y:number):V3=>{const p=at(kk,t);return [p[0],y,p[1]];};
  b.poly([q(k,.03,ya),q(k,.97,ya),q(k1,.97,yb),q(k1,.03,yb)],undefined,{facing:[0,1,0],color:C(0x56585b)});
  b.poly([q(k,.03,ya),q(k1,.03,yb),q(k1,.97,yb),q(k,.97,ya)],undefined,{facing:[0,-1,0],color:C(BRIDGE_COLOURS.pier)});
  for(const t of [.015,.985]){const a=at(k,t),c=at(k1,t),ym=(ya+yb)/2;
   wallBox(b,a,c,low,ym+1.1-.12,.25,C(BRIDGE_COLOURS.pier),.01);wallBox(b,a,c,ym+1.1-.12,ym+1.1,.32,C(BRIDGE_COLOURS.coping),.01);}
  const m=at((k+k1)/2,.5);profile.push({k:(k+k1)/2,y:(ya+yb)/2,ground:ground(m[0],m[1])});
 }
 return {length:K,footprint,profile,start:y0,end:yK};
}
