// ======== shared drawing helpers for scenes ========
const D2R=Math.PI/180;
function bg(col1,col2){ // big hand-cut wall
  sd(11);panel(14,100,W-28,H-190,col1,{j:7,edge:true,edgeCol:shade(col1,-.25)});
}
function portal(x,y,rx,ry,col,k=1,rot=0){
  if(k<=0)return;sd(77);const a=easeOut(k);
  ell(x,y,rx*a*1.0,ry*a,col,{rot,hi:false,edgeCol:shade(col,-.5)});
  ell(x,y,rx*a*.66,ry*a*.8,shade(col,-.55),{rot,hi:false,edge:false});
  ell(x+rx*.08*a,y,rx*a*.4,ry*a*.55,shade(col,.55),{rot,hi:false,edge:false});
}
function turret(x,y,s,laser=null,k=1){
  if(k<=0)return;sd(91);const e=easeOut(k);y+=(1-e)*60*s;
  // legs
  bar(x,y+10*s,x-26*s,y+62*s,5*s,'#cfc9bb',{edge:false});bar(x,y+10*s,x+26*s,y+62*s,5*s,'#cfc9bb',{edge:false});bar(x,y+10*s,x,y+66*s,5*s,'#cfc9bb',{edge:false});
  ell(x-24*s,y-12*s,10*s,26*s,'#e9e5da',{rot:.25,hi:false});ell(x+24*s,y-12*s,10*s,26*s,'#e9e5da',{rot:-.25,hi:false});
  ell(x,y-6*s,22*s,44*s,'#f1eee4',{hi:false});
  disc(x,y-12*s,10*s,'#3a3947',{hi:false});disc(x,y-12*s,5.5*s,PAL.red,{hi:false,edge:false});
  if(laser)ink(x,y-12*s,laser[0],laser[1],PAL.red,1.2,'pen');
}
function cake(x,y,s,fl=0){
  sd(95);rct(x-70*s,y,140*s,50*s,'#9a6a50');rct(x-70*s,y-6*s,140*s,18*s,'#f4e8e1');
  rct(x-52*s,y-44*s,104*s,40*s,'#b07a5c');rct(x-52*s,y-48*s,104*s,14*s,'#f8efe8');
  disc(x,y-58*s,8*s,PAL.red,{hi:true});
  rct(x-3*s,y-84*s,6*s,24*s,PAL.yellow,{edge:true});
  const fh=14*s*(1+.18*Math.sin(fl*9));ell(x,y-94*s,5*s,fh,PAL.orange,{hi:false,rot:.12*Math.sin(fl*7)});ell(x,y-92*s,2.6*s,fh*.55,PAL.yellow,{hi:false,edge:false});
}
function glados(x,y,s,look=0){ // hanging optic, gouache
  sd(61);bar(x,y-200*s,x,y-24*s,10*s,'#8e8a82',{edge:false});
  ell(x,y,34*s,38*s,'#cfcac0',{hi:true});
  disc(x+look*6*s,y,17*s,'#2f2e38',{hi:false});disc(x+look*7*s,y,10*s,PAL.yellow,{hi:false,edge:false});disc(x+look*7*s,y,4*s,'#fff3b0',{hi:false,edge:false});
}
function newmanDraw(cx,cy,R,phi,fr,bk,o={}){
  const fa=[90,210,330],L=R*1.95,GR={H:11,CH3:19};
  const pt=(a,r)=>[cx+Math.cos(a*D2R)*r,cy-Math.sin(a*D2R)*r];
  const bkc=o.bkCol||'#8d8a98';
  for(let k=0;k<3;k++){const a=fa[k]+phi,p0=pt(a,R),p1=pt(a,L);bar(p0[0],p0[1],p1[0],p1[1],o.bw||7,bkc,{edge:false});}
  disc(cx,cy,R,o.fill||PAL.white,{hi:false,w:1.4});
  for(let k=0;k<3;k++){const p1=pt(fa[k],L);bar(cx,cy,p1[0],p1[1],o.bw||7,'#5f5d6b',{edge:false});}
  const gd=(a,g,hl)=>{const p=pt(a,L+GR[g]*.6);const col=hl?PAL.orange:(g==='H'?PAL.hyd:PAL.carbon);disc(p[0],p[1],GR[g]*(o.gs||1),col,{hi:g!=='H'});
    if(g==='CH3')T('CH₃',p[0],p[1]+5,{size:15,col:'#f1e9d6',align:'center'});};
  for(let k=0;k<3;k++)gd(fa[k]+phi,bk[k],o.hlB===k);
  for(let k=0;k<3;k++)gd(fa[k],fr[k],o.hlF===k);
}
function butaneE(p){p=((p%360)+360)%360;const K=[[0,19],[60,3.8],[120,16],[180,0],[240,16],[300,3.8],[360,19]];
  for(let i=0;i<6;i++){if(p>=K[i][0]&&p<=K[i+1][0]){const u=(p-K[i][0])/60;return lerp(K[i][1],K[i+1][1],(1-Math.cos(u*Math.PI))/2);}}return 0;}
function ethaneE(p){return 6*(1+Math.cos(3*p*D2R));}
function plotCurve(x0,y0,w,h,f,emax,col,upto=1,n=60){ // polyline through a brush spline
  const pts=[];for(let i=0;i<=Math.floor(n*upto);i++){const p=i/n*360;pts.push([x0+w*i/n,y0+h-h*f(p)/emax]);}
  if(pts.length>2)crv(pts,col,2.2,'charcoal',0.0);
  return pts;
}
function axes(x0,y0,w,h,col=PAL.ink){ink(x0,y0+h,x0+w,y0+h,col,1.4,'charcoal');ink(x0,y0,x0,y0+h,col,1.4,'charcoal');}
const typed=(s,p)=>s.slice(0,Math.floor(s.length*clamp(p)));
const cap=(a)=>a; // placeholder
function chip(txt,x,y,col,a=1,o={}){const w=OV.measureText?0:0;const sz=o.size||22;OV.font=`${sz}px PH`;const tw=OV.measureText(txt).width;
  if(a<=0)return;sd(33);panel(x-tw/2-14,y-sz*.85,tw+28,sz*1.5,col,{j:2,edge:true});T(txt,x,y+2,{size:sz,col:o.tc||PAL.white,align:'center'});}
function bubble(txt,x,y,a){if(a<=0)return;OV.font='22px PH';const w=OV.measureText(txt).width+26;sd(34);panel(x-w/2,y-26,w,40,PAL.white,{j:2});T(txt,x,y+2,{size:22,col:PAL.ink,align:'center'});}

// ======== scene 0: title ========
function scene0(c){
  const {t,lt,S}=c;
  bg(PAL.panel,PAL.panel2);
  sd(12);rct(14,620,W-28,0.1,PAL.grey,{edge:false});
  // floor strip
  sd(13);panel(14,560,W-28,62,'#cdbfa3',{j:4,edgeCol:'#9d8f74'});
  // portals
  const k1=prog(lt,0.4,1.4),k2=prog(lt,0.8,1.8);
  portal(150,330,40,105,PAL.orange,k1,0);portal(1130,330,40,105,PAL.blue,k2,0);
  // butane wobbling
  sd(14);
  const phi=180+120*Math.sin(t*1.1+.3);
  const M=butaneModel(phi);
  const bob=Math.sin(t*1.7)*8;
  drawModel(M,640,425+bob,92,0.55+0.25*Math.sin(t*.5),0.28,{hl:[1,5]});
  // title
  const a1=ease(prog(lt,1.2,2.2));
  if(a1>0){T('Conformers',640,150,{size:84,font:'FR',weight:600,align:'center',col:PAL.dark,a:a1});
    T("molecules that won't sit still",640,200,{size:40,font:'CV',weight:700,align:'center',col:PAL.red,a:a1});}
  T('ENRICHMENT CENTER · TEST SUBJECT C₄H₁₀',640,52,{size:19,align:'center',col:PAL.grey,a:ease(prog(lt,.5,1.2))});
  // flicker chips for poses (s2 on)
  const s2=S(2);
  if(s2>0){const lab=['anti','gauche','gauche'];const ph=[180,60,300];
    for(let i=0;i<3;i++){const a=ease(prog(s2,0.3+i*.5,0.9+i*.5));if(a>0)chip(lab[i]+'  '+ph[i]+'°',300+i*340,520,[PAL.blue,PAL.orange,PAL.green][i],a,{size:21});}}
  if(S(1)>0.5&&S(2)<0){const q=prog(S(1),0.5,2.5);
    const ang=(Math.sin(t*2.4)*0.5)*Math.PI;
    T('↻ twisting billions of times a second',640,580,{size:26,font:'CV',weight:700,align:'center',col:PAL.plum,a:ease(q)});}
}

// ======== scene 1: single bonds are axles (4 sentences) ========
function scene1(c){
  const {t,lt,S}=c;
  bg(PAL.panel,PAL.panel2);
  if(S(3)<0){
  // butane zig-zag, big at first then shrinks to the top
  const move=ease(prog(S(1),0,1.0));
  const zz=[[0,0],[140,46],[280,0],[420,46]];
  const sc=lerp(1.35,.62,move),ox=lerp(560,300,move),oy=lerp(300,138,move);
  const P=zz.map(p=>[ox+(p[0]-210)*sc,oy+(p[1]-23)*sc]);
  sd(21);
  for(let i=0;i<3;i++){const hot=i===1;bar(P[i][0],P[i][1],P[i+1][0],P[i+1][1],(hot?14:9)*sc,hot?PAL.orange:'#8d8a98',{edge:false});}
  P.forEach(p=>disc(p[0],p[1],24*sc,PAL.carbon));
  if(S(0)>1.6&&S(1)<0.2){const q=ease(prog(S(0),1.6,2.4));
    crv([[P[1][0]-10,P[1][1]-62],[P[1][0]+60,P[1][1]-92],[P[2][0]+10,P[2][1]-62]],PAL.orange,2,'charcoal',0.9);
    T('the middle bond is an axle',P[1][0]+70,P[1][1]-112,{size:34,font:'CV',weight:700,col:PAL.orange,align:'center',a:q});
    T('C–C single bond',560,520,{size:28,col:PAL.dark,align:'center',a:q});}
  // sigma panel (left)
  const s1=S(1);
  if(s1>0.9){
    sd(22);panel(50,240,560,350,'#e4e1d3',{j:3,edgeCol:'#a69f8c'});
    T('σ bond — spins freely',80,282,{size:30,font:'FR',weight:600,col:PAL.blue});
    const th=t*2.2,cy=440;
    ell(300,cy,125,40,PAL.blue,{edge:false,hi:false});
    disc(215,cy,29,PAL.carbon);disc(385,cy,29,PAL.carbon);
    const g=[];for(let k=0;k<3;k++){const ang=th+k*2.094;g.push({a:ang,x:420+9*Math.cos(ang),y:cy+62*Math.sin(ang),z:Math.cos(ang)});}
    g.sort((a,b)=>a.z-b.z);g.forEach(q=>{bar(385,cy,q.x,q.y,6,'#8d8a98',{edge:false});disc(q.x,q.y,12,PAL.hyd);});
    T('electron density is cylindrically symmetric',330,508,{size:21,col:PAL.dark,align:'center'});
    rct(80,300,150,14,'#cfcab9',{edge:false});rct(80,300,150,14,PAL.green,{edge:false});T('overlap 100%',242,313,{size:20,col:PAL.dark});
    T('like a sausage',330,540,{size:22,font:'CV',weight:700,col:PAL.blue,align:'center'});
  }
  // pi panel (right)
  const s2=S(2);
  if(s1>0.9){
    sd(23);panel(660,240,570,350,'#e4e1d3',{j:3,edgeCol:'#a69f8c'});
    T('π bond — side-by-side p orbitals',690,282,{size:30,font:'FR',weight:600,col:PAL.orange});
    const tw=ease(prog(S(2),3.2,7.2));const th=tw*Math.PI/2;
    const cx1=800,cx2=1070,cy=450;
    ink(cx1,cy,cx2,cy,'#8d8a98',3,'charcoal');
    ell(cx1,cy-66,24,48,PAL.orange,{hi:false});ell(cx1,cy+66,24,48,PAL.blue,{hi:false});
    const ca=Math.cos(th),sa=Math.sin(th);
    ell(cx2,cy-66*ca,24-5*sa,48-12*sa,PAL.orange,{hi:false});ell(cx2,cy+66*ca,24-5*sa,48-12*sa,PAL.blue,{hi:false});
    disc(cx1,cy,26,PAL.carbon);disc(cx2,cy,26,PAL.carbon);
    const ov=Math.round(Math.abs(ca)*100);
    rct(690,300,190,14,'#cfcab9',{edge:false});if(ov>0)rct(690,300,1.9*ov,14,ov>50?PAL.green:PAL.red,{edge:false});
    T('overlap '+ov+'%  = cos θ',892,313,{size:20,col:PAL.dark});
    T('twist θ = '+Math.round(th/D2R)+'°',935,555,{size:26,col:PAL.dark,align:'center'});
    if(ov===0)T('gone',1130,420,{size:34,font:'CV',weight:700,col:PAL.red,align:'center'});
  }
  }
  // sentence 3: cost to break vs thermal jostling
  if(S(3)>=0){
    const k=ease(prog(S(3),0.0,0.9));
    sd(26);rct(0,0,W,H,PAL.paper,{edge:false});bg(PAL.panel,PAL.panel2);
    T('breaking a π bond',640,170,{size:30,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const grow=ease(prog(S(3),1.0,3.5)),w=900*grow;
    rct(190,300,w,56,PAL.red,{edge:true});
    T('≈ 270 kJ/mol',190+Math.max(w,200)/2,342,{size:34,font:'FR',weight:600,col:PAL.white,align:'center',a:grow>0.3?1:0});
    const kk=ease(prog(S(3),3.5,4.5));
    if(kk>0){rct(190,400,900*(2.5/270)*1.0+6,40,PAL.blue,{edge:true});T('thermal jostling RT ≈ 2.5 kJ/mol',230,470,{size:26,col:PAL.blue,a:kk});}
    const lk=ease(prog(S(3),5.0,6.0));
    if(lk>0){ // padlock
      sd(27);const lx=1130,ly=250;crv([[lx-28,ly],[lx-28,ly-34],[lx,ly-48],[lx+28,ly-34],[lx+28,ly]],PAL.ink,3,'charcoal',0.8);
      rct(lx-42,ly,84,62,PAL.yellow,{edge:true});disc(lx,ly+30,7,PAL.ink,{hi:false});
      T('double bonds are locked',920,290,{size:30,font:'CV',weight:700,col:PAL.plum,align:'center',a:lk});
      T('single bonds: nearly free',920,610,{size:30,font:'CV',weight:700,col:PAL.green,align:'center',a:lk});}
  }
}
