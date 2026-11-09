// W1 station: the element's own canvas textures (procedural, no image assets; each canvas is at most 512 px). In Node, where there is no
// document, each is null and its material keeps its plain colour, as materials.ts `texture` does.
//  cassettes  the roof's aluminium glazing cassettes seen from above (HES LB30270: "aluminium cassette system with laminated glass"):
//             grey-silver panes between bright bars, as R-wv1-a and R-wv1-a3 show. Module 2.4 m up the slope by 0.6 m across it, ASSUMED
//             (about 28,000 panes over 34,000 m2 is 1.2 m2 a pane, Network Rail 2011; 2.4 x 0.6 = 1.44 m2 is the nearest even split).
//  blister    the platform-edge warning strip: buff-yellow with raised dots (DfT, Guidance on the use of tactile paving surfaces: blister
//             paving, dots in a square grid at about 66 mm); R-wv1-b and R-wv1-b2.
//  flags      the platform paving: pale grey flags 0.6 m square in stretcher-free grid, slightly varied in tone (R-wv1-b; 600 mm flag ASSUMED).
import * as THREE from 'three';
import {rng} from './materials.ts';

export interface StationTextureSpec {tile:[number,number];px:[number,number]}
export const WAVERLEY_STATION_TEXTURES={
 cassettes:{tile:[2.4,.6],px:[256,64]},
 blister:{tile:[.4,.4],px:[96,96]},
 flags:{tile:[1.2,1.2],px:[256,256]},
} as const satisfies Record<string,StationTextureSpec>;
export type StationTextureName=keyof typeof WAVERLEY_STATION_TEXTURES;
type Ctx=CanvasRenderingContext2D;
const PAINT:Record<StationTextureName,(g:Ctx,w:number,h:number)=>void>={
 cassettes(g,w,h){
  // u runs up the slope (x), v across it (z): panes with a soft sky sheen, bright bars at the module edges.
  const grad=g.createLinearGradient(0,0,w,0);grad.addColorStop(0,'#8b949b');grad.addColorStop(.5,'#a3abb1');grad.addColorStop(1,'#8f989f');
  g.fillStyle=grad;g.fillRect(0,0,w,h);
  g.fillStyle='#d9dde0';g.fillRect(0,0,w,Math.max(2,h*.09));g.fillRect(0,0,Math.max(3,w*.02),h);
  g.fillStyle='#6f777d';g.fillRect(0,h*.09,w,1);
 },
 blister(g,w,h){
  g.fillStyle='#cfae3a';g.fillRect(0,0,w,h);
  const n=6,step=w/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){
   const x=(i+.5)*step,y=(j+.5)*step,r=step*.28;
   g.fillStyle='#e6c955';g.beginPath();g.arc(x-1,y-1,r,0,Math.PI*2);g.fill();
   g.fillStyle='#9f8428';g.beginPath();g.arc(x+1,y+1,r*.85,0,Math.PI*.9);g.fill();
  }
 },
 flags(g,w,h){
  const random=rng(4170),n=2,s=w/n;
  for(let i=0;i<n;i++)for(let j=0;j<n;j++){const t=196+Math.floor(random()*14);g.fillStyle=`rgb(${t},${t},${t-3})`;g.fillRect(i*s,j*s,s,s);}
  g.strokeStyle='#8d8f8f';g.lineWidth=2;for(let i=0;i<=n;i++){g.beginPath();g.moveTo(i*s,0);g.lineTo(i*s,h);g.stroke();g.beginPath();g.moveTo(0,i*s);g.lineTo(w,i*s);g.stroke();}
 },
};
const cache=new Map<StationTextureName,THREE.CanvasTexture|null>();
/** The repeating canvas texture for `name`, UVs in metres; null in Node. Cached (one per page). */
export function stationTexture(name:StationTextureName):THREE.CanvasTexture|null{
 if(cache.has(name))return cache.get(name)!;
 let t:THREE.CanvasTexture|null=null;
 if(typeof document!=='undefined'){
  const spec=WAVERLEY_STATION_TEXTURES[name],c=document.createElement('canvas');[c.width,c.height]=spec.px;const g=c.getContext('2d');
  if(g){PAINT[name](g,c.width,c.height);t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/spec.tile[0],1/spec.tile[1]);}
 }
 cache.set(name,t);return t;
}
