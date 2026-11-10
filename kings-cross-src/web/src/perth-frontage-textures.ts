// P2 frontage: tiling canvas textures, near-white so they modulate the vertex colours (the geometry keeps its tint without them, as in
// the tests, where there is no canvas). UVs are world metres over each texture's tile (PERTH_TEXTURE_TILE). Seeded, so every load is
// the same. Patterns and sizes ASSUMED from the photographs named on each.
import * as THREE from 'three';

/** The tile each texture covers (m): uv = metres / tile. */
export const PERTH_TEXTURE_TILE={setts:2,rubble:4,coursed:4} as const;

function canvas(size:number,draw:(g:CanvasRenderingContext2D,s:number,rnd:()=>number)=>void):THREE.CanvasTexture|null{
 if(typeof document==='undefined')return null;
 const c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');if(!g)return null;
 let seed=29;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
 draw(g,size,rnd);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;t.wrapS=t.wrapT=THREE.RepeatWrapping;
 return t;
}
const grey=(v:number)=>`rgb(${v},${v},${v})`;

/** Block paving (R-pt2-a: the entrance road and the station-side forecourt): 0.2 x 0.1 m blocks in stretcher bond, dark joints, each
 *  block a little lighter or darker. */
export function settsTexture():THREE.CanvasTexture|null{
 return canvas(512,(g,s,rnd)=>{const k=s/PERTH_TEXTURE_TILE.setts,bw=.2*k,bh=.1*k;
  g.fillStyle=grey(120);g.fillRect(0,0,s,s);
  for(let r=0;r*bh<s;r++)for(let x=-(r%2)*bw/2;x<s;x+=bw){g.fillStyle=grey(Math.round(205+rnd()*50));g.fillRect(x+1.5,r*bh+1.5,bw-3,bh-3);}
 });
}

/** Random rubble (R-pt2-d: the St Leonard's Bank and abutment walls): a fine, irregular, weathered grey. Rough courses 0.08-0.22 m high
 *  of stones 0.12-0.42 m long, each a jittered polygon; mid-grey mortar (round 4's black joints read as large regular blocks), speckle
 *  and a few faint rain streaks. */
export function rubbleTexture():THREE.CanvasTexture|null{
 return canvas(512,(g,s,rnd)=>{const k=s/PERTH_TEXTURE_TILE.rubble;
  g.fillStyle=grey(150);g.fillRect(0,0,s,s);
  const rows:number[]=[];for(let y=0;y<s;){const h=Math.min(s-y,(.08+rnd()*.14)*k);rows.push(h);y+=h;}
  if(rows.length>1&&rows.at(-1)!<.06*k){rows[rows.length-2]+=rows.pop()!;}// no sliver course at the tile's edge
  const stone=(x:number,y:number,w:number,h:number,v:number)=>{const j=1+rnd()*2,pts:[number,number][]=[[x+j,y+j+rnd()*3],[x+w*(.3+rnd()*.4),y+rnd()*2],[x+w-j,y+j+rnd()*4],
    [x+w-j-rnd()*3,y+h-j-rnd()*2],[x+w*(.3+rnd()*.4),y+h-rnd()*2],[x+j+rnd()*3,y+h-j-rnd()*3]];
   for(const dx of x+w>s?[0,-s]:[0]){g.fillStyle=grey(v);g.beginPath();g.moveTo(pts[0][0]+dx,pts[0][1]);for(const q of pts.slice(1))g.lineTo(q[0]+dx,q[1]);g.closePath();g.fill();}};
  let y=0;for(const h of rows){let x=-rnd()*.3*k;
   while(x<s){const w=(.12+rnd()*.3)*k,v=Math.round(165+rnd()*80);
    // now and then a stone two courses deep, or a pinned spall beside a big one, so the courses don't read as straight lines
    stone(x,y,w,h*(rnd()<.15&&y+2*h<s?1.9:1),v);x+=w;}
   y+=h;}
  for(let i=0;i<2600;i++){const v=Math.round(110+rnd()*120);g.fillStyle=`rgba(${v},${v},${v},.35)`;g.fillRect(rnd()*s,rnd()*s,1+rnd()*2,1+rnd()*2);}
  for(let i=0;i<10;i++){const x=rnd()*s,w=3+rnd()*10,gr=g.createLinearGradient(0,0,0,s);gr.addColorStop(0,'rgba(40,40,40,.14)');gr.addColorStop(1,'rgba(40,40,40,0)');
   g.fillStyle=gr;g.fillRect(x,0,w,s*(.3+rnd()*.7));}
 });
}

/** Coursed squared stone (R-pt2-a: the station's single-storey street walls): 0.3 m courses of 0.6-1.1 m blocks, fine light joints. */
export function coursedTexture():THREE.CanvasTexture|null{
 return canvas(512,(g,s,rnd)=>{const k=s/PERTH_TEXTURE_TILE.coursed,h=.3*k;
  g.fillStyle=grey(170);g.fillRect(0,0,s,s);
  for(let y=0;y<s;y+=h){let x=-rnd()*.6*k;while(x<s){const w=(.6+rnd()*.5)*k;g.fillStyle=grey(Math.round(215+rnd()*40));g.fillRect(x+1.5,y+1.5,w-3,h-3);
   if(x+w>s)g.fillRect(x+1.5-s,y+1.5,w-3,h-3);x+=w;}}
 });
}
