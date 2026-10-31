// In-page probe for the glare tests (R2-V-15). Evaluate `GLARE_PROBE` once in a loaded skyblitz page, then call `__glare.now()` / `__glare.deck()`.
//   now()   share of the drawing buffer that is white (all channels > 225) or bright (luma > 200), read in the same task that rendered (readPixels only works then)
//   deck()  contrast of the player's craft against the ice deck around it: WCAG ratio (hi + .05) / (lo + .05) of the mean linear luminance of the craft's silhouette
//           in the real frame and of the deck's own pixels in a ring (14 px) round the silhouette. The deck pixels come from a frame in which only the deck plane is drawn
//           (no decals, rings, lane chevrons or FX: the world-art material and its lighting, through the whole post chain); the silhouette is the craft drawn flat
//           white straight to the canvas, which does not depend on how bright the craft or its background is.
// Template-literal safe on purpose: no backticks, no ${ } inside the string.
export const GLARE_PROBE = `(()=>{ if (window.__glare) return 1; const g=__sky.game, T=g.THREE;
const grab=()=>{ const gl=g.renderer.getContext(), w=gl.drawingBufferWidth, h=gl.drawingBufferHeight, px=new Uint8Array(w*h*4); gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px); return {px,w,h}; };
const lin=new Float32Array(256); for(let i=0;i<256;i++){ const v=i/255; lin[i]= v<=0.04045 ? v/12.92 : Math.pow((v+0.055)/1.055,2.4); }
const L=(px,k)=>0.2126*lin[px[k]]+0.7152*lin[px[k+1]]+0.0722*lin[px[k+2]];
const stats=(f)=>{ const {px,w,h}=f; let white=0,bright=0,n=w*h; for(let i=0;i<n;i++){ const k=i*4,r=px[k],gg=px[k+1],b=px[k+2]; if(r>225&&gg>225&&b>225)white++; if(0.2126*r+0.7152*gg+0.0722*b>200)bright++; } return {white:+(100*white/n).toFixed(2),bright:+(100*bright/n).toFixed(2)}; };
const drawable=(o)=>o.isMesh||o.isPoints||o.isLine||o.isSprite;
const inside=(o,root)=>{ for(let p=o;p;p=p.parent) if(p===root) return true; return false; };
const platform=()=>g.scene.getObjectByName('platform');
const deckMesh=()=>{ let d=null; const p=platform(); if(p) p.traverse((o)=>{ if(!d&&o.isMesh&&o.geometry&&o.geometry.type==='PlaneGeometry'&&o.receiveShadow&&!o.material.transparent) d=o; }); return d; };
const only=(keep)=>{ const saved=[]; g.scene.traverse((o)=>{ if(drawable(o)){ saved.push([o,o.visible]); o.visible=keep(o); } }); return ()=>{ for(const [o,v] of saved) o.visible=v; }; };
const flat=(keep)=>{ const sc=g.scene, undo=only(keep), ov=sc.overrideMaterial, bg=sc.background, fog=sc.fog, sh=g.renderer.shadowMap.autoUpdate;
  sc.overrideMaterial=new T.MeshBasicMaterial({color:0xffffff,toneMapped:false,fog:false}); sc.background=new T.Color(0x000000); sc.fog=null; g.renderer.shadowMap.autoUpdate=false;
  g.renderer.setRenderTarget(null); g.renderer.clear(); g.renderer.render(sc,g.camera); const f=grab();
  g.renderer.shadowMap.autoUpdate=sh; sc.overrideMaterial=ov; sc.background=bg; sc.fog=fog; undo();
  const m=new Uint8Array(f.w*f.h); for(let i=0;i<m.length;i++) m[i]=f.px[i*4]>128?1:0; return {m,w:f.w,h:f.h}; };
const dilate=(c,w,h,R)=>{ const n=w*h, tmp=new Uint8Array(n), dil=new Uint8Array(n);
  for(let y=0;y<h;y++){ const row=y*w; let near=-1e9; for(let x=0;x<w;x++){ if(c[row+x]) near=x; tmp[row+x]=(x-near<=R)?1:0; } near=1e9; for(let x=w-1;x>=0;x--){ if(c[row+x]) near=x; if(near-x<=R) tmp[row+x]=1; } }
  for(let x=0;x<w;x++){ let near=-1e9; for(let y=0;y<h;y++){ if(tmp[y*w+x]) near=y; dil[y*w+x]=(y-near<=R)?1:0; } near=1e9; for(let y=h-1;y>=0;y--){ if(tmp[y*w+x]) near=y; if(near-y<=R) dil[y*w+x]=1; } }
  return dil; };
window.__glare={
  now(){ return stats(grab()); },
  deck(){ const craft=g.player.model, deck=deckMesh(); if(!deck) return null;
    const C=flat((o)=>inside(o,craft)), D=flat((o)=>o===deck); g.renderFrame(1,0); const A=grab();
    const undo=only((o)=>o===deck), bg=g.scene.background; g.scene.background=new T.Color(0x000000); g.post.update(0,g); g.post.render(0); const K=grab(); g.scene.background=bg; undo(); g.renderFrame(1,0);
    const n=C.w*C.h, dil=dilate(C.m,C.w,C.h,14); let nc=0,sc=0,nd=0,sd=0;
    for(let i=0;i<n;i++){ const k=i*4; if(C.m[i]){ nc++; sc+=L(A.px,k); } else if(dil[i]&&D.m[i]){ nd++; sd+=L(K.px,k); } }
    if(nc<200||nd<200) return {craftPx:nc,deckPx:nd,ratio:null};
    const mc=sc/nc, md=sd/nd, hi=Math.max(mc,md), lo=Math.min(mc,md);
    return {craftPx:nc,deckPx:nd,craftL:+mc.toFixed(3),deckL:+md.toFixed(3),ratio:+((hi+0.05)/(lo+0.05)).toFixed(2)}; },
};
return 1; })()`;
