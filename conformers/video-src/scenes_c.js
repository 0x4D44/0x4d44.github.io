// ======== scene 6: how big is small (3 sentences) ========
function sci(x){if(x>=1e3||x<1e-2){const e=Math.floor(Math.log10(x));const m=x/Math.pow(10,e);const sup='⁰¹²³⁴⁵⁶⁷⁸⁹';const es=(e<0?'⁻':'')+String(Math.abs(e)).split('').map(d=>sup[+d]).join('');return m.toFixed(1)+'×10'+es;}return x.toFixed(0);}
function scene6(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const RT=2.48;
  if(S(1)<0){ // s0: thermal jostling
    T('molecules are constantly being hit',640,170,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    sd(61);
    for(let i=0;i<9;i++){const x=200+i*110+Math.sin(t*5+i*2)*26,y=330+Math.cos(t*4.3+i*1.7)*40;disc(x,y,16+(i%3)*5,[PAL.hyd,PAL.carbon,PAL.blue][i%3]);}
    const a=ease(prog(S(0),2,3.4));
    T('typical jostle  RT ≈ 2.5 kJ/mol',640,520,{size:38,font:'FR',weight:600,col:PAL.blue,align:'center',a});
    if(a>0){rct(490,540,300*(2.5/12)*3.2*0+50,22,PAL.blue,{edge:true});}
  } else if(S(2)<0){ // s1: formula + ladder
    const a=ease(prog(S(1),.2,1.2));
    T('rate  ≈  6×10¹² s⁻¹  ×  e^( −Eₐ / RT )',640,200,{size:48,font:'FR',weight:600,col:PAL.dark,align:'center',a});
    const b=S(1)-3.5;
    const rows=[0,5.7,11.4,17.1,22.8];
    rows.forEach((e,i)=>{const q=ease(prog(b,i*0.8,i*0.8+.7));if(q<=0)return;const rt=6e12*Math.exp(-e/RT);
      const y=300+i*58;sd(62+i);rct(300,y-26,260*(1-i*.12)*q,40,PAL.orange,{edge:true});
      T('+'+e.toFixed(1)+' kJ/mol',280,y+6,{size:26,col:PAL.dark,align:'right'});
      T('÷ '+Math.pow(10,i).toLocaleString('en-US'),600+260*(1-i*.12)*.0+30,y+6,{size:28,font:'FR',weight:600,col:PAL.red,a:q});});
    T('every +5.7 kJ/mol = ten times slower',900,300,{size:30,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(b,0,1))});
  } else { // s2: scale of real barriers
    const x0=110,x1=1170,y=420,mx=300,X=e=>x0+(x1-x0)*e/mx;
    T('barrier height  Eₐ  (kJ/mol)',640,160,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    rct(x0,y-6,x1-x0,12,'#b9b4a4',{edge:true});
    // fast -> slow zones
    rct(x0,y-6,X(100)-x0,12,PAL.green,{edge:false});rct(X(100),y-6,x1-X(100),12,PAL.red,{edge:false});
    [0,50,100,150,200,250,300].forEach(e=>{ink(X(e),y+6,X(e),y+22,PAL.ink,1.2,'2B');T(String(e),X(e),y+46,{size:20,col:PAL.grey,align:'center'});});
    const items=[{e:12,l:'ethane rotation',s:.6},{e:19,l:'butane worst eclipse',s:2.2},{e:45,l:'ring flip',s:3.9},{e:270,l:'twist C=C',s:6.0}];
    items.forEach((it,i)=>{const q=ease(prog(S(2),it.s,it.s+.8));if(q<=0)return;const px=X(it.e),r=6e12*Math.exp(-it.e/RT);
      disc(px,y,14,[PAL.green,PAL.green,PAL.yellow,PAL.red][i]);
      const ty=[y-70,y+95,y-150,y+95][i];const lx=[px+70,px+40,px+70,px-30][i];
      ink(px,y+(ty<y?-16:16),px,ty+(ty<y?8:-26),PAL.ink,1,'2B');
      T(it.l,lx,ty-4,{size:24,col:PAL.dark,align:'center'});
      T(sci(r)+' per second',lx,ty+26,{size:26,font:'FR',weight:600,col:i<2?PAL.green:i===2?PAL.orange:PAL.red,align:'center'});});
    if(S(2)>8.0){const q=ease(prog(S(2),8,9));sd(66);ink(X(100),y-60,X(100),y+30,PAL.ink,2,'charcoal');T('~100: swaps take hours–years',X(100)+8,y-66,{size:22,font:'CV',weight:700,col:PAL.plum,a:q});
      T('conformations',X(50),y-235,{size:26,col:PAL.green,align:'center',a:q});T('configurations',X(200),y-190,{size:26,col:PAL.red,align:'center',a:q});}
  }
}

// ======== scene 8: ring strain (4 sentences) ========
function ngon(cx,cy,r,n,rot=-90){const p=[];for(let i=0;i<n;i++){const a=(rot+i*360/n)*D2R;p.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}return p;}
function flame(x,y,s,t,k=1){sd(71);const w=s*(1+.12*Math.sin(t*14));
  poly([[x-30*s,y],[x-18*s,y-40*s*w],[x-4*s,y-18*s],[x+4*s,y-66*s*w],[x+20*s,y-26*s],[x+30*s,y]],PAL.orange,{});
  poly([[x-14*s,y],[x-4*s,y-26*s*w],[x+4*s,y-12*s],[x+14*s,y]],PAL.yellow,{edge:false});}
function scene8(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  if(S(1)<0){ // flat polygons
    T('Baeyer, 1885:  rings are flat polygons',640,168,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const ns=[3,4,5,6,7,8],names=['cyclopropane','cyclobutane','cyclopentane','cyclohexane','cycloheptane','cyclooctane'];
    ns.forEach((n,i)=>{const q=ease(prog(S(0),.6+i*.45,1.3+i*.45));if(q<=0)return;const cx=140+i*200,cy=360;sd(72+i);
      poly(ngon(cx,cy,70*q,n),i===0?PAL.red:'#c9c2b0',{});
      T(Math.round(180-360/n)+'°',cx,cy+8,{size:30,font:'FR',weight:600,col:i===0?PAL.white:PAL.dark,align:'center'});
      T(names[i].replace('cyclo','cyclo-'),cx,cy+130,{size:19,col:PAL.dark,align:'center'});});
    const a=ease(prog(S(0),5,6.5));
    T('ideal sp³ angle 109.5°  —  cyclopropane is bent by 49.5°: a coiled spring',640,520,{size:28,font:'CV',weight:700,col:PAL.red,align:'center',a});
  } else if(S(2)<0){ // burning
    T('measure strain by setting fire to it',640,168,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    sd(73);poly(ngon(640,330,80,6),'#c9c2b0',{});
    for(let i=0;i<5;i++)flame(520+i*60,440,1.2,t+i*.7);
    rct(480,442,320,14,'#7a6a55',{});
    T('(CH₂)ₙ + 1.5n O₂ → n CO₂ + n H₂O',640,520,{size:30,col:PAL.dark,align:'center',a:ease(prog(S(1),1.5,2.5))});
    T('relaxed chain: 658.6 kJ/mol per CH₂',640,570,{size:32,font:'FR',weight:600,col:PAL.blue,align:'center',a:ease(prog(S(1),4,5))});
    T('any extra heat = strain stored in the ring',640,610,{size:28,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(S(1),7,8.2))});
  } else if(S(3)<0){ // bar chart
    T('total ring strain  (kJ/mol)',640,168,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const data=[['C3',115],['C4',110],['C5',26],['C6',0],['C7',26],['C8',40]];
    const x0=180,y0=520,sc=2.7;axes(100,210,1080,310);T('kJ per CH₂:',40,y0+60,{size:19,col:PAL.blue});
    data.forEach(([n,v],i)=>{const q=ease(prog(S(2),.4+i*(i<3?1.3:.9)*(i===3?0.6:1)*.9,1.4+i*.9));const h=v*sc*q;const x=x0+i*165;sd(74+i);
      if(h>2)rct(x,y0-h,100,h,v>60?PAL.red:v>20?PAL.orange:PAL.green,{});
      T(n,x+50,y0+30,{size:26,col:PAL.dark,align:'center'});T(['697.1','686.2','663.6','658.6','662.3','663.6'][i],x+50,y0+60,{size:23,col:PAL.blue,align:'center',a:q>.6?1:0});if(q>.6)T(String(v),x+50,y0-Math.max(h,0)-12,{size:30,font:'FR',weight:600,col:PAL.dark,align:'center'});});
    if(S(2)>7.5)T('cyclohexane: exactly zero',x0+3*165+50,y0-90,{size:30,font:'CV',weight:700,col:PAL.green,align:'center',a:ease(prog(S(2),7.5,8.5))});
  } else { // pucker
    T('Baeyer was wrong about the rest: rings pucker',640,168,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const q=ease(prog(S(3),1.5,6));
    // flat chain -> chair-like zigzag (side view)
    const flat=[[400,380],[520,330],[640,380],[760,330],[880,380],[1000,330]];
    sd(78);
    const pts=[];for(let i=0;i<6;i++){const k=i%2?1:-1;pts.push([360+i*100+ (i%2?0:0),380+k*lerp(0,38,q)]);}
    for(let i=0;i<5;i++)bar(pts[i][0],pts[i][1],pts[i+1][0],pts[i+1][1],11,'#8d8a98',{edge:false});
    pts.forEach(p=>disc(p[0],p[1],25,PAL.carbon));
    T(q<.5?'flat: every bond eclipsed':'puckered: staggered, ~111°',640,520,{size:32,font:'FR',weight:600,col:q<.5?PAL.red:PAL.green,align:'center'});
    if(S(3)>6.5){const a=ease(prog(S(3),6.5,8));['angle strain','torsional strain','transannular strain'].forEach((s,i)=>chip(s,310+i*330,600,[PAL.plum,PAL.red,PAL.orange][i],a,{size:21}));}
  }
}

// ======== chair model ========
function chairModel(f,methyl){ // f: flip 0..1
  const g=Math.cos(Math.PI*f),A=[],B=[];const add=(p,el,tag)=>{A.push({p,el,tag});return A.length-1;};
  const R=1.45,hh=0.34,C=[];
  for(let k=0;k<6;k++){const s=k%2?-1:1,a=k*60*D2R;C.push(add([R*Math.cos(a),hh*s*g,R*Math.sin(a)],'C'));}
  for(let k=0;k<6;k++)B.push([C[k],C[(k+1)%6]]);
  for(let k=0;k<6;k++){const s=k%2?-1:1,a=k*60*D2R,sig=s*g,w=(sig+1)/2,rad=[Math.cos(a),0,Math.sin(a)];
    const up=[w*0+(1-w)*rad[0]*.94,w*1+(1-w)*.33,(1-w)*rad[2]*.94];
    const dn=[w*rad[0]*.94,w*-.33+(1-w)*-1,w*rad[2]*.94];
    const nrm=v=>{const m=Math.hypot(...v)||1;return v.map(x=>x/m);};
    const u=nrm(up),d=nrm(dn);const p0=A[C[k]].p;
    const L=1.09;
    const orig=s>0?'up':'down'; // originally axial bond
    const hU=add([p0[0]+u[0]*L,p0[1]+u[1]*L,p0[2]+u[2]*L],'H',s>0?'ax':'eq');B.push([C[k],hU]);
    const hD=add([p0[0]+d[0]*L,p0[1]+d[1]*L,p0[2]+d[2]*L],'H',s>0?'eq':'ax');B.push([C[k],hD]);
    if(methyl&&k===0){A[hU].el='M';A[hU].p=[p0[0]+u[0]*1.54,p0[1]+u[1]*1.54,p0[2]+u[2]*1.54];}
  }
  return{A,B,C};
}
function drawChair(M,cx,cy,s,ry,rx,o={}){
  const pts=M.A.map(a=>proj(rotX(rotY(a.p,ry),rx),cx,cy,s));
  const items=[];M.B.forEach(([i,j])=>items.push({k:'b',z:(pts[i][2]+pts[j][2])/2-.01,i,j}));M.A.forEach((a,i)=>items.push({k:'a',z:pts[i][2],i}));
  items.sort((a,b)=>a.z-b.z);
  for(const it of items){
    if(it.k==='b'){const a=pts[it.i],b=pts[it.j],ringB=M.A[it.i].el==='C'&&M.A[it.j].el==='C';bar(a[0],a[1],b[0],b[1],ringB?10:6,ringB?'#6f6d7b':'#a9a6b2',{edge:false});}
    else{const a=M.A[it.i],q=pts[it.i];
      if(a.el==='C')disc(q[0],q[1],19*q[3],PAL.carbon);
      else if(a.el==='M'){disc(q[0],q[1],(o.mr||27)*q[3],PAL.carbon);T('CH₃',q[0],q[1]+6,{size:16,col:'#f1e9d6',align:'center'});}
      else{let col=PAL.hyd;if(o.color==='ax'){col=a.tag==='ax'?PAL.red:PAL.blue;}
        if(o.clash&&o.clash.includes(it.i))col=PAL.red;
        disc(q[0],q[1],(o.color?14:11)*q[3],col);}
    }}
}
function flipCurve(p){ // schematic energy profile 0..1 -> kJ/mol
  const K=[[0,0],[.16,45],[.30,23],[.5,30],[.70,23],[.84,45],[1,0]];
  for(let i=0;i<6;i++)if(p>=K[i][0]&&p<=K[i+1][0]){const u=(p-K[i][0])/(K[i+1][0]-K[i][0]);return lerp(K[i][1],K[i+1][1],(1-Math.cos(u*Math.PI))/2);}return 0;}

// ======== scene 9: the chair (6 sentences) ========
function scene9(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const f=S(4)<0?0:ease(prog(S(4),1.0,9.0));
  const spin=.55+.55*Math.sin(t*.35);
  const color=S(1)>=0?'ax':null;
  const M=chairModel(f,false);
  const cx=S(4)>=0?420:640;
  drawChair(M,cx,395,104,spin,.42,{color});
  if(S(1)>=0){sd(165);disc(1010,128,11,PAL.red,{hi:false});T('axial',1030,134,{size:22,col:PAL.dark});disc(1110,128,11,PAL.blue,{hi:false});T('equatorial',1130,134,{size:22,col:PAL.dark});}
  if(S(1)<0){
    T('no angle strain · no torsional strain',640,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    chip('C–C–C ≈ 111°',640,560,PAL.green,ease(prog(S(0),4,5.5)),{size:24});
  } else if(S(2)<0){
    T('every carbon has one axial and one equatorial hydrogen',640,150,{size:30,font:'FR',weight:600,col:PAL.dark,align:'center'});
    chip('axial — straight up / down',230,560,PAL.red,ease(prog(S(1),1,2)),{size:24});chip('equatorial — out round the equator',1000,560,PAL.blue,ease(prog(S(1),5,6.2)),{size:24});
  } else if(S(3)<0){
    T('up / down  ≠  axial / equatorial',640,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    chip('on an UP carbon the axial bond points up',270,560,PAL.red,ease(prog(S(2),1.5,2.5)),{size:22});chip('on a DOWN carbon the up bond is equatorial',1000,560,PAL.blue,ease(prog(S(2),5,6)),{size:22});
  } else if(S(4)<0){
    T('drawing the chair: parallel lines',640,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    chip('axial: always vertical',230,560,PAL.red,ease(prog(S(3),2.5,3.5)),{size:24});chip('equatorial: parallel to a ring bond, pointing away',900,560,PAL.blue,ease(prog(S(3),6,7)),{size:24});
    // ghost guide lines
    const a=ease(prog(S(3),1,2));if(a>0){sd(160);for(let k=0;k<3;k++)ink(250+k*30,250,420+k*30,520,PAL.grey,1.2,'charcoal');}
  } else {
    T('the ring flip',cx,150,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const x0=800,w=400,y0=200,h=230;axes(x0,y0,w,h);
    const pts=[];for(let i=0;i<=40;i++)pts.push([x0+w*i/40,y0+h-h*flipCurve(i/40)/48]);crv(pts,PAL.ink,2,'charcoal',0);
    disc(x0+w*f,y0+h-h*flipCurve(f)/48,12,PAL.orange);
    [['1',.16,'half-chair  45'],['2',.30,'twist-boat  23'],['3',.5,'boat  30']].forEach(([n,u,s],i)=>{const a=ease(prog(S(4),3+i*1.6,4+i*1.6));
      if(a>0){disc(x0+w*u,y0+h-h*flipCurve(u)/48,9,PAL.plum,{hi:false});T(n,x0+w*u,y0+h-h*flipCurve(u)/48-18,{size:20,col:PAL.plum,align:'center',weight:700});
        T(n+'  '+s+' kJ/mol',x0+10,y0+h+62+i*26,{size:21,col:PAL.dark,a});}});
    T('energy',x0-6,y0-8,{size:19,col:PAL.grey,align:'right'});T('chair',x0,y0+h+28,{size:21,col:PAL.dark,align:'center'});T('chair',x0+w,y0+h+28,{size:21,col:PAL.dark,align:'center'});
    if(S(5)>=0){chip('red: axial before → equatorial after',430,570,PAL.red,ease(prog(S(5),.5,1.5)),{size:23});
      chip('blue: equatorial before → axial after',900,570,PAL.blue,ease(prog(S(5),3,4)),{size:23});}
  }
}

// ======== scene 10: substituents (4 sentences) ========
function scene10(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const f=(S(0)<0)?0:(S(1)<2.5?0:ease(prog(S(1)+0,6,10)));
  const flipT=S(2)>=0?ease(prog(S(2),4.5,7.5)):(S(1)>=0?0:0);
  const ff=S(3)>=0?1:(S(2)>=0?flipT:0);
  const M=chairModel(S(0)<0?0:ff,true);
  const ry=.55+.45*Math.sin(t*.35);
  const clashIdx=[];if(ff<0.15){M.A.forEach((a,i)=>{if(a.el==='H'&&a.tag==='ax'&&a.p[1]>0.3&&i>10)clashIdx.push(i);});}
  if(S(3)<0){
    drawChair(M,S(0)<0?640:380,400,104,ry,.42,{clash:S(1)>=0?clashIdx:null});
    if(S(0)>=0&&S(1)<0){T('methylcyclohexane: axial or equatorial?',640,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});}
    if(S(1)>=0&&S(2)<0){
      T('1,3-diaxial crowding',380,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
      const a=ease(prog(S(1),3.5,4.8)),a2=ease(prog(S(1),6,7.2));
      chip('3.8  +  3.8  =  7.6 kJ/mol',380,575,PAL.red,a,{size:26});
      // energy bars
      const bx=800;
      const bh=7.6*26*ease(prog(S(1),3.5,5));
      T('axial',bx+60,585,{size:24,col:PAL.dark,align:'center'});T('equatorial',bx+210,585,{size:24,col:PAL.dark,align:'center'});
      rct(bx+20,545-bh,80,bh,PAL.red,{});rct(bx+170,541,80,4,PAL.green,{});
      T('7.6',bx+60,535-bh,{size:30,font:'FR',weight:600,col:PAL.red,align:'center',a});
      T('0',bx+210,530,{size:30,font:'FR',weight:600,col:PAL.green,align:'center',a});
    }
    if(S(2)>=0){
      const a=ease(prog(S(2),0.2,1.2));
      T('gauche butane in disguise',380,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
      const q=ease(prog(S(2),4.5,7.5));
      T(q<.5?'axial CH₃ — gauche to two ring carbons':'equatorial CH₃ — anti to both',380,610,{size:26,col:q<.5?PAL.red:PAL.green,align:'center',a});
      newmanDraw(900,380,70,q<.5?60:180,['CH3','H','H'],['C','H','H'],{bw:6,gs:.8,hlF:0,hlB:0});
      T('looking C1→C2',900,200,{size:24,col:PAL.dark,align:'center'});
      T(q<.5?'gauche · 60°':'anti · 180°',900,570,{size:30,font:'FR',weight:600,col:q<.5?PAL.red:PAL.green,align:'center'});
    }
  } else {
    // sentence 3: A-values / ratio / t-butyl
    const eq=1/(1+Math.exp(-7.6/2.48)*0+Math.exp(-7.6/2.48));
    T('A-value  =  energy cost of putting a group axial',640,150,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const items=[['F',1.0],['Cl',2.0],['Br',2.0],['CH₃',7.6],['Et',8.0],['iPr',9.2],['t-Bu',22.8]];
    items.forEach(([n,v],i)=>{const q=ease(prog(S(3),.6+i*.7,1.5+i*.7));if(q<=0)return;const x=150+i*150;sd(91+i);
      const h=v*9.2*q;if(h>1)rct(x,560-h,100,h,i===6?PAL.red:i>=3?PAL.orange:PAL.green,{});T(n,x+50,596,{size:26,col:PAL.dark,align:'center'});T(v.toFixed(1),x+50,552-h,{size:26,font:'FR',weight:600,col:PAL.dark,align:'center'});});
    T('kJ/mol',90,330,{size:20,col:PAL.grey});
    const a=ease(prog(S(3),5,6.5));
    T('K = e^(ΔG/RT):  methyl  ≈ 21 : 1  →  95 % equatorial',640,205,{size:30,font:'CV',weight:700,col:PAL.green,align:'center',a});
    const b=ease(prog(S(3),9,10.5));
    if(b>0)T('t-butyl locks the ring',930,360,{size:30,font:'CV',weight:700,col:PAL.red,align:'center',a:b});
  }
}

// ======== scene 11: toolkit & practice (4 sentences) ========
function scene11(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  if(S(1)<0){
    T('everything on one page',640,168,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const cards=[['2.5','RT at 25 °C',0],['5.7','per factor of 10',0],['4.0','H / H eclipsed',0],['3.8','CH₃ / CH₃ gauche',1],['3.8','1,3-diaxial CH₃ / H',1],['7.6','A-value of CH₃',0]];
    cards.forEach(([n,l,hot],i)=>{const q=ease(prog(S(0),.3+i*.3,.9+i*.3));if(q<=0)return;const x=120+(i%3)*370,y=250+Math.floor(i/3)*170;sd(100+i);
      const pulse=hot&&S(0)>5?1+.05*Math.sin(t*6):1;
      panel(x,y+(1-q)*30,310,130,hot&&S(0)>4?PAL.orange:'#e4e1d3',{j:3,edgeCol:hot?PAL.orange:'#a69f8c'});
      T(n,x+155,y+68+(1-q)*30,{size:58*pulse,font:'FR',weight:600,col:hot&&S(0)>4?PAL.white:PAL.dark,align:'center'});T(l,x+155,y+106+(1-q)*30,{size:22,col:hot&&S(0)>4?PAL.white:PAL.dark,align:'center'});});
    if(S(0)>6.5)T('3.8 — the same crowding, seen from different angles',640,610,{size:32,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(S(0),6.5,7.7))});
  } else if(S(3)<0){
    // quiz screen
    sd(110);panel(150,140,980,470,'#f1ecde',{j:3,edgeCol:PAL.ink});
    glados(1040,230,.8,Math.sin(t*1.2));
    T('QUICK CHECK',190,190,{size:24,col:PAL.orange});
    T('cis- and trans-but-2-ene are…',190,245,{size:36,font:'FR',weight:600,col:PAL.dark});
    const opts=['conformers — they interconvert by rotation','configurational isomers — rotation would break the π bond','the same molecule drawn twice'];
    const sel=S(2)>=0?1:-1;
    opts.forEach((o,i)=>{const q=ease(prog(S(1),1.2+i*.9,2+i*.9));if(q<=0)return;const y=300+i*84;sd(111+i);
      panel(190,y,820,64,sel===i&&S(2)>1.5?PAL.green:'#e1dccb',{j:2,edgeCol:'#8f897a'});
      T(String.fromCharCode(65+i)+'.   '+o,214,y+41,{size:25,col:sel===i&&S(2)>1.5?PAL.white:PAL.dark});});
    // waiting clock + deadlock button
    if(S(1)>5.0&&S(2)<0){const q=ease(prog(S(1),5.0,5.6));
      const ph=(S(1)-5)*2;sd(114);disc(1040,420+0,0.1,PAL.paper,{edge:false});
      T('…waiting…  '+('•'.repeat(1+Math.floor(ph)%4)),1060,590,{size:24,col:PAL.grey,align:'center',a:q});}
    if(S(2)>-1.5&&S(1)>6.5){ // the deadlock resolution button appears in the pause before s2
      const q=ease(prog(S(2),-1.5,-.5));
      sd(115);panel(780,545,330,48,S(2)>-.3?PAL.red:PAL.plum,{j:2,edgeCol:PAL.dark});
      T('DEADLOCK RESOLUTION',945,577,{size:23,col:PAL.white,align:'center'});}
    if(S(2)>0.2){const a=ease(prog(S(2),.2,1.0));
      T('Interpreting unclear answer as:  B',190,566,{size:26,font:'CV',weight:700,col:PAL.red,a});
      if(S(2)>2.6)T('✓ configurational isomers — correct',190,598,{size:28,font:'FR',weight:600,col:PAL.green,a:ease(prog(S(2),2.6,3.4))});}
  } else {
    // sentence 3: reward — cake
    const k=ease(prog(S(3),0,1.2));
    sd(120);panel(60,130,1160,460,'#e4e1d3',{j:3,edgeCol:'#a69f8c'});
    T('A reward will be provided at the end of the test.',640,190,{size:32,font:'FR',weight:600,col:PAL.dark,align:'center'});
    cake(640,470,2.0*k,t);
    if(S(3)>2.5)T('(probably)',640,255+0,{size:28,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(S(3),2.5,3.3))});
  }
}

// ======== scene 12: outro (3 sentences) ========
function scene12(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  portal(130,350,36,95,PAL.orange,prog(lt,.3,1.2),0);portal(1150,350,36,95,PAL.blue,prog(lt,.5,1.4),0);
  if(S(1)<0){
    ['Overview','Newman','Rings','Chair','Substituents','Practice'].forEach((n,i)=>{const q=ease(prog(S(0),.5+i*.5,1.2+i*.5));if(q<=0)return;
      const x=240+(i%3)*400,y=240+Math.floor(i/3)*130;sd(130+i);panel(x-130,y+(1-q)*30,260,90,[PAL.blue,PAL.orange,PAL.green,PAL.plum,PAL.red,PAL.teal][i],{j:2});
      T((i+1)+'  '+n,x,y+58+(1-q)*30,{size:32,font:'FR',weight:600,col:PAL.white,align:'center'});});
    T('drag it · spin it · poke it',640,500,{size:40,font:'CV',weight:700,col:PAL.plum,align:'center',a:ease(prog(S(0),4,5.2))});
    T('add up the strains — the lowest total wins',640,570,{size:28,font:'FR',weight:600,col:PAL.dark,align:'center',a:ease(prog(S(0),7,8.2))});
  } else if(S(2)<0){
    sd(135);panel(220,200,840,260,PAL.white,{j:3,edgeCol:PAL.ink});
    rct(220,200,840,44,'#cdc7b6',{});disc(246,222,8,PAL.red,{hi:false});disc(272,222,8,PAL.yellow,{hi:false});disc(298,222,8,PAL.green,{hi:false});
    const s='0x4d44.github.io/conformers';
    T(typed(s,prog(S(1),0.3,5.5)/1),640,350,{size:52,font:'FR',weight:600,col:PAL.dark,align:'center'});
    T('Conformers — molecules that won\'t sit still',640,420,{size:24,col:PAL.grey,align:'center',a:ease(prog(S(1),6,7))});
    glados(1040,330,.55,0);
  } else {
    const k=ease(prog(S(2),0,1.3));
    sd(136);panel(300,150,680,400,'#e4e1d3',{j:3,edgeCol:'#a69f8c'});
    cake(640,440,1.7*k,t);
    T('the cake is a lie',640,200,{size:56,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(S(2),.2,1.2)),rot:-.04});
    const a=ease(prog(S(2),2.6,3.6));
    T('the chemistry is not.',640,585,{size:36,font:'FR',weight:600,col:PAL.dark,align:'center',a});
    turret(1130,520,.7,S(2)>2.5?[700,430]:null,prog(S(2),2.0,2.8));
    bubble('Goodbye.',1100,390,S(2)>3?1:0);
  }
}

// ======== scene 7: drawing 3D (5 sentences) ========
function scene7(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  T('four ways to draw 3D on flat paper',640,150,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
  const names=['wedge & dash','sawhorse','Newman','chair'],subs=['wedge: toward you · dash: away','both carbons, in perspective','straight down the bond','up / down / axial / equatorial'];
  for(let i=0;i<4;i++){
    const cx=160+i*320;const a=ease(prog(S(0),1.0+i*1.1,1.8+i*1.1));if(a<=0&&S(i+1)<0)continue;
    sd(170+i);const act=S(i+1)>=0&&(i===3||S(i+2)<0);
    panel(cx-145,190,290,360,act?'#f1ecde':'#e4e1d3',{j:3,edgeCol:act?PAL.orange:'#a69f8c'});
    T(names[i],cx,235,{size:28,font:'FR',weight:600,col:act?PAL.orange:PAL.dark,align:'center'});
    const q=S(i+1)>=0?ease(prog(S(i+1),.3,1.3)):ease(prog(S(0),1.8+i*1.1,2.6+i*1.1));if(q<=0)continue;sd(180+i);
    if(i===0){
      const y=400;bar(cx,y,cx-70,y-70,6,'#6f6d7b',{edge:false});bar(cx,y,cx+70,y-70,6,'#6f6d7b',{edge:false});
      poly([[cx,y],[cx+38,y+78],[cx+70,y+58]],PAL.ink,{});
      for(let k=1;k<=5;k++){const u=k/6,px=cx-55*u,py=y+68*u,w=14*u+3;ink(px-w/2*.7,py-w/2*.7,px+w/2*.7,py+w/2*.7,PAL.ink,1.4,'2B');}
      disc(cx,y,22,PAL.carbon);disc(cx-70,y-70,13,PAL.hyd);disc(cx+70,y-70,13,PAL.hyd);disc(cx+64,y+66,13,PAL.hyd);disc(cx-60,y+76,13,PAL.hyd);
    }
    if(i===1)drawModel(ethaneModel(60),cx,410,66,.75,.32,{ox:0,rc:20,rh:11,bw:6});
    if(i===2)newmanDraw(cx,410,46,30,['H','H','H'],['H','H','H'],{bw:6,gs:.7});
    if(i===3)drawChair(chairModel(0,false),cx,415,44,.6+.3*Math.sin(t*.5),.42,{});
    T(subs[i],cx,518,{size:20,font:'CV',weight:700,col:PAL.plum,align:'center',a:q});
  }
}
