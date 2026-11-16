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
export function coursedTexture(bond:'street'|'bridge'='street'):THREE.CanvasTexture|null{
 return canvas(512,(g,s,rnd)=>{const k=s/PERTH_TEXTURE_TILE.coursed;
  g.fillStyle=grey(170);g.fillRect(0,0,s,s);
  // R-slb-a: irregular sandstone ashlar, rather than the street walls' uniform 0.3 m courses. Normalise the bridge's courses to a
  // complete tile, so no thin closing course appears every four metres. Keep the same stone/mortar tones (~0.79 linear mean).
  const rows:number[]=[];
  if(bond==='bridge'){for(let y=0;y<s;){const h=(.24+rnd()*.18)*k;rows.push(h);y+=h;}const total=rows.reduce((a,b)=>a+b,0);for(let i=0;i<rows.length;i++)rows[i]*=s/total;}
  else for(let y=0;y<s;y+=.3*k)rows.push(.3*k);
  let y=0;
  for(const h of rows){let x=-rnd()*.6*k;const length=bond==='bridge'?.48+rnd()*.35:.6;
   while(x<s){const w=(length+rnd()*.5)*k,v=Math.round(215+rnd()*40),hue=bond==='bridge'?Math.sin(x*1.87+y*3.91):0;
    // A small warm/cool drift within the dirty sandstone, approximately constant in luma. A separate hash preserves both bonds' layout.
    g.fillStyle=bond==='bridge'?`rgb(${Math.min(255,Math.round(v+5*hue))},${Math.round(v-.7*hue)},${Math.min(255,Math.round(v-8*hue))})`:grey(v);
    g.fillRect(x+1.5,y+1.5,w-3,h-3);
    if(x+w>s)g.fillRect(x+1.5-s,y+1.5,w-3,h-3);x+=w;}
   y+=h;}
  if(bond==='bridge')for(let i=0;i<900;i++){g.fillStyle=grey(175+Math.round(rnd()*55));g.fillRect(rnd()*s,rnd()*s,1+rnd(),1+rnd()*2);}
 });
}

/** R-slb-a: one painted girder strip, not a repeating panel decal. Dimensions and rust colours ASSUMED by eye, following the round-8
 * capture ruling. Each panel has 0-2 smaller noise-shaped blooms, soft paint/rust boundaries and faint runoff below the blooms.
 * DataTexture keeps the same deterministic result without a canvas (also available to CPU inspection). All bytes are sRGB albedo. */
export function stLeonardsPaintTexture(panels:number,paint:number,flangeFraction:number):THREE.DataTexture{
 const width=4096,height=128,data=new Uint8Array(width*height*4),base=[paint>>16&255,paint>>8&255,paint&255];
 for(let i=0;i<data.length;i+=4){data[i]=base[0];data[i+1]=base[1];data[i+2]=base[2];data[i+3]=255;}
 const hash=(x:number,y=0)=>{let n=Math.imul(x,374761393)+Math.imul(y,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;};
 const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
 const noise=(x:number,y:number,seed:number)=>{const i=Math.floor(x),j=Math.floor(y),u=smooth(0,1,x-i),v=smooth(0,1,y-j);
  const a=hash(i+seed,j),b=hash(i+1+seed,j),c=hash(i+seed,j+1),d=hash(i+1+seed,j+1);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;};
 const grain=(x:number,y:number,seed:number)=>.6*noise(x,y,seed)+.28*noise(x*2,y*2,seed+77)+.12*noise(x*4,y*4,seed+139);
 const clear=1-2*flangeFraction;
 for(let panel=0;panel<panels;panel++){
  const seed=panel*31+503,choice=hash(seed),count=choice<.15?0:choice<.7?1:2;
  for(let patch=0;patch<count;patch++){
   const key=seed+patch*197,cx=count===2?.27+patch*.46+(hash(key+1)-.5)*.045:.3+hash(key+1)*.4;
   const cy=.27+hash(key+2)*.46,rx=count===2?.21+hash(key+3)*.025:.26+hash(key+3)*.09,ry=.21+hash(key+4)*.035;
   const x0=Math.floor(panel*width/panels),x1=Math.min(width,Math.ceil((panel+1)*width/panels));
   const y0=Math.max(0,Math.floor((flangeFraction+(cy-ry*1.2-.32)*clear)*height)),y1=Math.min(height,Math.ceil((flangeFraction+(cy+ry*1.2)*clear)*height));
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const u=(x+.5)*panels/width-panel,v=((y+.5)/height-flangeFraction)/clear,n=grain(u*9,v*9,key),nx=(u-cx)/rx,ny=(v-cy)/ry,angle=Math.atan2(ny,nx);
    // Asymmetric lobes and turbulence break the silhouette; finer noise lets paint show through the bloom. These are mottled
    // clusters of oxidation rather than solid spots. Keep the vertical envelope under half the clear web, including its feather.
    const q=Math.hypot(nx,ny)+(n-.5)*.5+.17*Math.sin(angle*3+key)+.1*Math.cos(angle*5+key*.7);
    const pores=.7+.3*smooth(.23,.58,grain(u*33,v*31,key+271));
    const bloom=(1-smooth(.55,1.13,q))*(1-smooth(.82,1.03,Math.abs(ny)))*smooth(.025,.1,u)*(1-smooth(.9,.975,u))*pores;
    const below=cy-ry*.5-v,runX=cx+rx*.16*Math.sin(v*12+key);
    const runoff=below>0?.16*Math.exp(-(((u-runX)/(.012+below*.035))**2))*(1-smooth(.04,.32,below)):0;
    const alpha=Math.max(bloom,runoff);if(alpha<=0)continue;
    const tone=grain(u*17,v*19,key+419),rust=[150+20*tone,80+15*tone,45+10*tone],i=(y*width+x)*4;
    for(let j=0;j<3;j++)data[i+j]=Math.round(data[i+j]*(1-alpha)+rust[j]*alpha);
   }
  }
 }
 // A one-texel Gaussian feather also smooths the smallest noise features; filtering on the GPU then handles the camera distance.
 const horizontal=data.slice();
 for(let y=0;y<height;y++)for(let x=1;x<width-1;x++)for(let c=0;c<3;c++){
  const i=(y*width+x)*4+c;horizontal[i]=Math.round((data[i-4]+2*data[i]+data[i+4])/4);
 }
 for(let y=1;y<height-1;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++){
  const i=(y*width+x)*4+c;data[i]=Math.round((horizontal[i-width*4]+2*horizontal[i]+horizontal[i+width*4])/4);
 }
 const t=new THREE.DataTexture(data,width,height,THREE.RGBAFormat);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;
 t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.needsUpdate=true;return t;
}
