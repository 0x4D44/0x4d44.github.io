// ---------- palette (chalky, muted gouache) ----------
const PAL={paper:'#ece3cf',ink:'#3a3947',carbon:'#55545f',hyd:'#efe6d0',orange:'#d98a45',blue:'#5d8db3',red:'#bf5a45',green:'#7c9a6a',yellow:'#e4bc55',plum:'#8c6384',grey:'#9a968c',white:'#f6f1e4',panel:'#d7dbd0',panel2:'#e7d3b3',dark:'#34333f',teal:'#6fa59f'};
const OV=document.getElementById('ov').getContext('2d');
const W=1280,H=720;
function hx(c){c=c.replace('#','');return[parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];}
function shade(c,a){const r=hx(c).map(v=>a<0?v*(1+a):v+(255-v)*a);return '#'+r.map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,'0')).join('');}
function mixc(a,b,t){const x=hx(a),y=hx(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');}
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const easeOut=x=>{x=clamp(x);return 1-Math.pow(1-x,3)};
const lerp=(a,b,t)=>a+(b-a)*t;
const prog=(t,a,b)=>clamp((t-a)/(b-a));
function sd(n){randomSeed(n);noiseSeed(n);}

// ---------- gouache primitives (p5.brush) ----------
// Flat opaque body (brush.wash at full opacity) + one lighter dab + a dry charcoal edge.
// No transparent washes, no bleed: that is the gouache look.
function disc(x,y,r,col,o={}){
  if(r<=0.5)return;
  brush.noStroke();brush.noFill();brush.wash(col,255);brush.circle(x,y,r);brush.noWash();
  if(o.hi!==false&&r>7){brush.wash(shade(col,.13),255);brush.circle(x-r*.26,y-r*.28,r*.36);brush.noWash();}
  if(o.edge!==false){brush.set(o.brush||'charcoal',o.edgeCol||shade(col,-.55),o.w||1);brush.noFill();brush.circle(x,y,r);}
}
function poly(pts,col,o={}){
  brush.noStroke();brush.noFill();brush.wash(col,255);brush.polygon(pts);brush.noWash();
  if(o.edge!==false){brush.set(o.brush||'charcoal',o.edgeCol||shade(col,-.5),o.w||1);brush.noFill();brush.polygon(pts);}
}
function rct(x,y,w,h,col,o={}){poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]],col,o);}
// ragged hand-cut panel
function panel(x,y,w,h,col,o={}){
  const j=o.j||5,n=Math.max(2,Math.round(w/60)),m=Math.max(2,Math.round(h/60));const p=[];
  for(let i=0;i<=n;i++)p.push([x+w*i/n+(noise(i,7)-.5)*j*2,y+(noise(i,3)-.5)*j*2]);
  for(let i=1;i<=m;i++)p.push([x+w+(noise(9,i)-.5)*j*2,y+h*i/m+(noise(4,i)-.5)*j*2]);
  for(let i=n-1;i>=0;i--)p.push([x+w*i/n+(noise(i,5)-.5)*j*2,y+h+(noise(i,8)-.5)*j*2]);
  for(let i=m-1;i>0;i--)p.push([x+(noise(2,i)-.5)*j*2,y+h*i/m+(noise(6,i)-.5)*j*2]);
  poly(p,col,o);
}
function bar(x1,y1,x2,y2,w,col,o={}){ // flat quad bond
  const dx=x2-x1,dy=y2-y1,L=Math.hypot(dx,dy)||1,nx=-dy/L*w/2,ny=dx/L*w/2;
  poly([[x1+nx,y1+ny],[x2+nx,y2+ny],[x2-nx,y2-ny],[x1-nx,y1-ny]],col,o);
}
function ink(x1,y1,x2,y2,col,w=1.2,name='2B'){brush.set(name,col||PAL.ink,w);brush.noFill();brush.line(x1,y1,x2,y2);}
function crv(pts,col,w=1.6,name='charcoal',curv=0.7){brush.set(name,col||PAL.ink,w);brush.noFill();brush.spline(pts,curv);}
function arrow(x1,y1,x2,y2,col,w=1.5){ink(x1,y1,x2,y2,col,w,'charcoal');const a=Math.atan2(y2-y1,x2-x1),s=12;
  ink(x2,y2,x2-s*Math.cos(a-.45),y2-s*Math.sin(a-.45),col,w,'charcoal');ink(x2,y2,x2-s*Math.cos(a+.45),y2-s*Math.sin(a+.45),col,w,'charcoal');}
function ellipseP(cx,cy,rx,ry,rot=0,n=26){const p=[];for(let i=0;i<n;i++){const a=i/n*TWO_PI,x=Math.cos(a)*rx,y=Math.sin(a)*ry;p.push([cx+x*Math.cos(rot)-y*Math.sin(rot),cy+x*Math.sin(rot)+y*Math.cos(rot)]);}return p;}
function ell(cx,cy,rx,ry,col,o={}){poly(ellipseP(cx,cy,rx,ry,o.rot||0,o.n||24),col,o);}
function hatchFill(pts,col,dist=7,ang=35){brush.noStroke();brush.noFill();brush.hatch(dist,ang,{rand:0.15});brush.setHatch&&brush.setHatch('2B',col,0.8);brush.polygon(pts);brush.noHatch();}

// ---------- overlay text (2D canvas above the WebGL canvas) ----------
function T(s,x,y,o={}){
  OV.save();OV.globalAlpha=o.a??1;OV.translate(x,y);if(o.rot)OV.rotate(o.rot);
  OV.font=`${o.weight||''} ${o.size||26}px ${o.font||'PH'}`.trim();OV.textAlign=o.align||'left';OV.textBaseline=o.base||'alphabetic';
  if(o.bg){const w=OV.measureText(s).width,p=o.pad??8;OV.fillStyle=o.bg;OV.fillRect(o.align==='center'?-w/2-p:o.align==='right'?-w-p:-p,-(o.size||26)*.85-p/2,w+2*p,(o.size||26)*1.1+p);}
  OV.fillStyle=o.col||PAL.ink;OV.fillText(s,0,0);
  if(o.chalk){OV.globalAlpha=(o.a??1)*.5;OV.fillText(s,.8,.6);}
  OV.restore();
}
function TW(s,x,y,o){ // typed-on reveal; o.p in 0..1
  const n=Math.floor(s.length*clamp(o.p??1));T(s.slice(0,n),x,y,o);
}
function wrapText(s,maxW,font){OV.font=font;const words=s.split(' '),lines=[];let cur='';
  for(const w of words){const t=cur?cur+' '+w:w;if(OV.measureText(t).width>maxW&&cur){lines.push(cur);cur=w;}else cur=t;}lines.push(cur);return lines;}

// ---------- paper grain (multiply overlay) ----------
function makePaper(){
  const c=document.getElementById('paper'),g=c.getContext('2d'),img=g.createImageData(1280,720);
  let s=12345;const rnd=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
  const cell=new Float32Array(321*181);for(let i=0;i<cell.length;i++)cell[i]=rnd();
  const sm=(x,y)=>{const gx=x/4,gy=y/4,ix=Math.floor(gx),iy=Math.floor(gy),fx=gx-ix,fy=gy-iy;
    const a=cell[iy*321+ix],b=cell[iy*321+ix+1],c2=cell[(iy+1)*321+ix],d=cell[(iy+1)*321+ix+1];
    return (a*(1-fx)+b*fx)*(1-fy)+(c2*(1-fx)+d*fx)*fy;};
  for(let y=0;y<720;y++)for(let x=0;x<1280;x++){
    const i=(y*1280+x)*4;const fine=rnd();const mid=sm(x,y);
    let v=236+fine*14+mid*10-5;
    const dx=(x-640)/640,dy=(y-360)/360;const vig=1-0.10*(dx*dx+dy*dy);
    v*=vig;img.data[i]=v;img.data[i+1]=v*0.985;img.data[i+2]=v*0.955;img.data[i+3]=255;}
  g.putImageData(img,0,0);
  g.globalAlpha=.10;g.strokeStyle='#8a7a5a';g.lineWidth=.7;
  for(let k=0;k<420;k++){const x=rnd()*1280,y=rnd()*720,a=rnd()*6.28,l=6+rnd()*18;g.beginPath();g.moveTo(x,y);g.quadraticCurveTo(x+Math.cos(a)*l*.5+3,y+Math.sin(a)*l*.5,x+Math.cos(a)*l,y+Math.sin(a)*l);g.stroke();}
}

// ---------- tiny 3D ----------
function rotY(p,a){return[p[0]*Math.cos(a)+p[2]*Math.sin(a),p[1],-p[0]*Math.sin(a)+p[2]*Math.cos(a)];}
function rotX(p,a){return[p[0],p[1]*Math.cos(a)-p[2]*Math.sin(a),p[1]*Math.sin(a)+p[2]*Math.cos(a)];}
function rotZ(p,a){return[p[0]*Math.cos(a)-p[1]*Math.sin(a),p[0]*Math.sin(a)+p[1]*Math.cos(a),p[2]];}
function proj(p,cx,cy,s){const f=1+p[2]*0.06;return[cx+p[0]*s*f,cy-p[1]*s*f,p[2],f];}
const TH=109.5*Math.PI/180;
function butaneModel(phiDeg){
  const phi=phiDeg*Math.PI/180,A=[],B=[];
  const add=(p,el)=>{A.push({p,el});return A.length-1;};
  const C2=add([0,0,0],'C'),C3=add([1.54,0,0],'C');
  // substituent directions: on C2 x-comp=cos(TH) (negative), on C3 x-comp=-cos(TH) (positive)
  const sub2=al=>[Math.cos(TH),Math.sin(TH)*Math.cos(al),Math.sin(TH)*Math.sin(al)];
  const sub3=al=>[-Math.cos(TH),Math.sin(TH)*Math.cos(al),Math.sin(TH)*Math.sin(al)];
  const at=(base,d,L)=>[base[0]+d[0]*L,base[1]+d[1]*L,base[2]+d[2]*L];
  const c1=add(at(A[C2].p,sub2(0),1.54),'C');B.push([C2,c1]);
  const c4=add(at(A[C3].p,sub3(phi),1.54),'C');B.push([C3,c4]);B.push([C2,C3]);
  for(const k of[1,2]){const h=add(at(A[C2].p,sub2(k*2.094),1.09),'H');B.push([C2,h]);}
  for(const k of[1,2]){const h=add(at(A[C3].p,sub3(phi+k*2.094),1.09),'H');B.push([C3,h]);}
  // terminal H's: three around each terminal carbon
  const termH=(ci,from,ax)=>{
    const o=A[ci].p,n=Math.hypot(...ax);const u=ax.map(v=>v/n);
    const r=Math.abs(u[1])<.9?[0,1,0]:[0,0,1];
    let e1=[u[1]*r[2]-u[2]*r[1],u[2]*r[0]-u[0]*r[2],u[0]*r[1]-u[1]*r[0]];const m=Math.hypot(...e1);e1=e1.map(v=>v/m);
    const e2=[u[1]*e1[2]-u[2]*e1[1],u[2]*e1[0]-u[0]*e1[2],u[0]*e1[1]-u[1]*e1[0]];
    const cp=-Math.cos(TH),sp=Math.sin(TH);
    for(let k=0;k<3;k++){const a=k*2.094;
      const dv=u.map((v,i)=>v*cp+sp*(Math.cos(a)*e1[i]+Math.sin(a)*e2[i]));
      const h=add(at(o,dv,1.09),'H');B.push([ci,h]);}
  };
  termH(c1,C2,A[c1].p.map((v,i)=>v-A[C2].p[i]));
  termH(c4,C3,A[c4].p.map((v,i)=>v-A[C3].p[i]));
  return{A,B};
}
function drawModel(M,cx,cy,s,ry,rx,o={}){
  const pts=M.A.map(a=>{let p=a.p.slice();p[0]-=o.ox??0.77;p=rotY(p,ry);p=rotX(p,rx);return proj(p,cx,cy,s);});
  const items=[];
  M.B.forEach(([i,j])=>items.push({k:'b',z:(pts[i][2]+pts[j][2])/2-.01,i,j}));
  M.A.forEach((a,i)=>items.push({k:'a',z:pts[i][2],i}));
  items.sort((a,b)=>a.z-b.z);
  for(const it of items){
    if(it.k==='b'){const a=pts[it.i],b=pts[it.j];bar(a[0],a[1],b[0],b[1],o.bw||7,o.bondCol||'#8d8a98');}
    else{const a=M.A[it.i],q=pts[it.i];const hl=o.hl&&o.hl.includes(it.i);
      if(a.el==='C')disc(q[0],q[1],(o.rc||21)*q[3],hl?PAL.orange:PAL.carbon);else disc(q[0],q[1],(o.rh||12)*q[3],hl?PAL.orange:PAL.hyd);}
  }
}

// ---------- chrome: scene tag, captions, transitions ----------
const TAGS=['WELCOME','SINGLE BONDS','CONFORMATION vs CONFIGURATION','STRAIN','NEWMAN PROJECTIONS','BUTANE','HOW BIG IS SMALL','DRAWING IN 3D','RING STRAIN','THE CHAIR','SUBSTITUENTS & A-VALUES','TOOLKIT & PRACTICE','CONCLUSION'];
function chrome(c){
  const {t,si,lt,dur}=c;
  // portal-ish torn wipe on scene entry
  if(lt<0.55){const p=ease(lt/0.55);sd(5000+si);
    const x=lerp(-60,W+120,p);const pts=[[0,0],[x,0]];for(let i=1;i<7;i++)pts.push([x+(noise(i,si)-.5)*50,i*H/7]);pts.push([x,H],[0,H]);
    brush.noStroke();brush.noFill();brush.wash(si%2?PAL.blue:PAL.orange,255);brush.polygon(pts);brush.noWash();}
  // scene tag plate
  if(si>0){const a=ease(prog(lt,0.4,0.9));if(a>0){T('TEST CHAMBER '+String(si).padStart(2,'0'),36,46,{size:20,col:PAL.orange,a});T(TAGS[si],36,72,{size:26,col:PAL.dark,a,font:'FR',weight:600});}}
  // caption
  const cu=c.sc.sents;let cur=-1;for(let i=0;i<cu.length;i++){if(t>=cu[i].start-0.05&&t<=cu[i].end+0.35)cur=i;}
  if(cur>=0){const txt=cu[cur].text;const f='24px PH';const lines=wrapText(txt,1080,f);const h=lines.length*32+18;
    OV.save();OV.fillStyle='#34333f';OV.globalAlpha=.94;OV.fillRect(90,H-34-h,1100,h);OV.restore();
    lines.forEach((l,i)=>T(l,640,H-34-h+34+i*32-6,{size:24,col:'#f1e9d6',align:'center'}));}
}
