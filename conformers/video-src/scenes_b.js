// ======== scene 2: conformation vs configuration (3 sentences) ========
function bottle(x,y,col,lab,k=1){
  if(k<=0)return;sd(41);const e=easeOut(k);y+=(1-e)*40;
  poly([[x-34,y-60],[x+34,y-60],[x+34,y+60],[x-34,y+60]],'#e9efe6',{edgeCol:'#8a9a90'});
  poly([[x-14,y-92],[x+14,y-92],[x+14,y-60],[x-14,y-60]],'#e9efe6',{edgeCol:'#8a9a90'});
  rct(x-18,y-102,36,12,PAL.red,{});
  rct(x-34,y-8,68,38,col,{edge:false});
  T(lab,x,y+80+12,{size:24,col:PAL.dark,align:'center'});
}
function scene2(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const a0=ease(prog(S(0),0,.8)),a1=ease(prog(S(1),0,.8));
  if(S(2)<0){
  // left card
  sd(42);panel(50,120,560,430,'#dfe6e8',{j:3,edgeCol:PAL.blue});
  T('CONFORMATIONS',330,170,{size:34,font:'FR',weight:600,col:PAL.blue,align:'center'});
  const L=['rotate about single bonds','~1–60 kJ/mol','millions–billions of times a second','can you bottle them apart?  no'];
  L.forEach((s,i)=>TW(s,86,232+i*46,{p:(S(0)-0.6-i*1.3)/1.2,size:25,col:PAL.dark}));
  // spinning mini Newman on left
  if(S(0)>1)newmanDraw(330,470,34,(t*90)%360,['H','H','H'],['H','H','H'],{bw:4,gs:.55});
  // right card
  if(S(0)>3.5){
    sd(43);panel(670,120,560,430,'#ecdfd0',{j:3,edgeCol:PAL.orange});
    T('CONFIGURATIONS',950,170,{size:34,font:'FR',weight:600,col:PAL.orange,align:'center'});
    const R=['break & remake bonds','250+ kJ/mol','effectively never at 25 °C','can you bottle them apart?  yes'];
    R.forEach((s,i)=>TW(s,706,232+i*46,{p:(S(1)-0.4-i*1.3)/1.2,size:25,col:PAL.dark}));
    const kb=prog(S(1),5.2,6.4);
    bottle(830,470,PAL.blue,'cis-but-2-ene',kb);bottle(1070,470,PAL.green,'trans-but-2-ene',prog(S(1),5.8,7.0));
  }
  }
  // sentence 2: conformers
  if(S(2)>=0){
    const k=ease(prog(S(2),0,.9));sd(44);rct(0,0,W,H,PAL.paper,{edge:false});bg(PAL.panel,PAL.panel2);
    T('a conformer = a conformation at an energy minimum',640,160,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    // energy well sketch
    const ph=[180,60,300],names=['anti','gauche','gauche′'],cols=[PAL.green,PAL.orange,PAL.orange];
    const x0=170,w=940,y0=250,h=250;
    axes(x0,y0,w,h);
    plotCurve(x0,y0,w,h,butaneE,20,PAL.ink,ease(prog(S(2),0.6,3.2)));
    for(let i=0;i<3;i++){const a=ease(prog(S(2),4+i*1.2,5+i*1.2));if(a>0){const px=x0+w*(ph[i]/360),py=y0+h-h*butaneE(ph[i])/20;disc(px,py,13,cols[i]);
      newmanDraw(px,py+78,26,ph[i]-180+180,['CH3','H','H'],['CH3','H','H'],{bw:3,gs:.5,fill:PAL.white});T(names[i],px,py-30,{size:24,col:cols[i],align:'center',weight:700});}}
    T('energy',x0-8,y0+8,{size:20,col:PAL.grey,align:'right'});T('twist →',x0+w,y0+h+28,{size:20,col:PAL.grey,align:'right'});
  }
}

// ======== scene 3: strain (3 sentences) ========
function scene3(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const cards=[{x:70,col:PAL.red,tt:'TORSIONAL',sub:'eclipsing'},{x:460,col:PAL.orange,tt:'STERIC',sub:'crowding'},{x:850,col:PAL.plum,tt:'ANGLE',sub:'bending'}];
  const t1=S(1);
  // sentence 0: wobbling energy hill
  if(S(1)<0){
    T('as it twists, the energy rises and falls',640,170,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    const x0=180,w=920,y0=230,h=270;axes(x0,y0,w,h);
    plotCurve(x0,y0,w,h,butaneE,20,PAL.ink,ease(prog(S(0),.5,5)));
    const ph=((S(0)*50)%360),px=x0+w*ph/360,py=y0+h-h*butaneE(ph)/20;disc(px,py,14,PAL.red);
    T('strain = any energy penalty for bad geometry',640,560,{size:30,font:'CV',weight:700,col:PAL.red,align:'center',a:ease(prog(S(0),3,4.5))});
  }
  if(S(1)>=0&&S(2)<0){
    cards.forEach((cd,i)=>{
      const a=prog(S(1),0.3+i*0.5,1.0+i*0.5);if(a<=0)return;sd(50+i);
      panel(cd.x,170+(1-easeOut(a))*40,360,360,'#e4e1d3',{j:3,edgeCol:cd.col});
      T(cd.tt,cd.x+180,222,{size:32,font:'FR',weight:600,col:cd.col,align:'center'});
      T(cd.sub,cd.x+180,254,{size:26,font:'CV',weight:700,col:PAL.dark,align:'center'});
      const cx=cd.x+180,cy=395,q=S(1)-0.3-i*2.6;if(q<0)return;
      if(i===0){newmanDraw(cx,cy,50,0,['H','H','H'],['H','H','H'],{bw:5,gs:.7,bkCol:'#7a6a9a'});
        for(let k=0;k<3;k++){const a2=[90,210,330][k]*D2R;ink(cx+Math.cos(a2)*84,cy-Math.sin(a2)*84-6,cx+Math.cos(a2)*84+10,cy-Math.sin(a2)*84+6,PAL.red,2.2,'pen');}
        T('bonds lined up',cx,500,{size:22,col:PAL.dark,align:'center'});}
      if(i===1){const gap=lerp(70,34,(Math.sin(q*3)*.5+.5));disc(cx-gap,cy,36,PAL.carbon);disc(cx+gap,cy,36,PAL.carbon);
        T('CH₃',cx-gap,cy+6,{size:18,col:'#f1e9d6',align:'center'});T('CH₃',cx+gap,cy+6,{size:18,col:'#f1e9d6',align:'center'});
        ink(cx-8,cy-52,cx+8,cy-70,PAL.red,2,'pen');ink(cx,cy-56,cx,cy-82,PAL.red,2,'pen');ink(cx+8,cy-52,cx-8,cy-70,PAL.red,2,'pen');
        T('closer than their sizes allow',cx,500,{size:22,col:PAL.dark,align:'center'});}
      if(i===2){const bend=lerp(0,22,Math.sin(q*2)*.5+.5);const a1=(180-109.5/2-bend)*D2R*0+0;
        const base=[cx,cy+10],ang=(109.5-bend)/2*D2R;
        const p1=[base[0]-Math.sin(ang)*95,base[1]-Math.cos(ang)*95],p2=[base[0]+Math.sin(ang)*95,base[1]-Math.cos(ang)*95];
        bar(base[0],base[1],p1[0],p1[1],8,'#8d8a98',{edge:false});bar(base[0],base[1],p2[0],p2[1],8,'#8d8a98',{edge:false});
        disc(base[0],base[1],26,PAL.carbon);disc(p1[0],p1[1],15,PAL.hyd);disc(p2[0],p2[1],15,PAL.hyd);
        T((109.5-bend).toFixed(1)+'°',cx,cy+75,{size:26,col:bend>3?PAL.red:PAL.green,align:'center'});
        T('ideal 109.5° · mostly a ring problem',cx,500,{size:21,col:PAL.dark,align:'center'});}
    });
  }
  if(S(2)>=0){
    const k=ease(prog(S(2),0,.9));sd(55);rct(0,0,W,H,PAL.paper,{edge:false});bg(PAL.panel,PAL.panel2);
    // balance scale
    const tilt=lerp(-.22,0,ease(prog(S(2),2,5)))*0+(-.14)*Math.sin(S(2)*1.4)*(1-ease(prog(S(2),3,6)));
    const cx=640,cy=330;
    bar(cx,cy,cx,cy+190,12,'#8d8a98',{edge:false});rct(cx-90,cy+190,180,16,'#8d8a98',{});
    const L=180,dx=Math.cos(tilt)*L,dy=Math.sin(tilt)*L;
    bar(cx-dx,cy-dy,cx+dx,cy+dy,10,PAL.dark,{edge:false});
    const pan=(x,y,col,lab,val)=>{ink(x,y,x-60,y+70,PAL.ink,1.4);ink(x,y,x+60,y+70,PAL.ink,1.4);poly([[x-80,y+70],[x+80,y+70],[x+50,y+95],[x-50,y+95]],col,{});T(lab,x,y+130,{size:25,col:PAL.dark,align:'center'});T(val,x,y+158,{size:24,font:'FR',weight:600,col,align:'center'});};
    pan(cx-dx,cy-dy,PAL.red,'pose A: eclipsed','total 19 kJ/mol');pan(cx+dx,cy+dy,PAL.green,'pose B: staggered','total 0 kJ/mol');
    T('add up the strains — the lowest total wins',640,150,{size:36,font:'FR',weight:600,col:PAL.dark,align:'center'});
  }
}

// ======== scene 4: Newman projections (3 sentences) ========
function ethaneModel(phiDeg){
  const A=[],B=[];const add=(p,el)=>{A.push({p,el});return A.length-1;};
  const Ca=add([-0.77,0,0],'C'),Cb=add([0.77,0,0],'C');B.push([Ca,Cb]);
  const phi=phiDeg*D2R;
  for(let k=0;k<3;k++){const a=k*2.094+Math.PI/2;
    const d1=[Math.cos(TH),Math.sin(TH)*Math.cos(a),Math.sin(TH)*Math.sin(a)];
    const h1=add([-0.77+d1[0]*1.09,d1[1]*1.09,d1[2]*1.09],'H');B.push([Ca,h1]);
    const b=a+phi,d2=[-Math.cos(TH),Math.sin(TH)*Math.cos(b),Math.sin(TH)*Math.sin(b)];
    const h2=add([0.77+d2[0]*1.09,d2[1]*1.09,d2[2]*1.09],'H');B.push([Cb,h2]);}
  return{A,B};
}
function scene4(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const s1=S(1);
  if(s1<0){ // sentence 0: camera swing, ethane 3D -> end-on
    const q=ease(prog(S(0),1.0,6.5));const ry=lerp(0.35,Math.PI/2,q);
    drawModel(ethaneModel(60),640,360,150,ry,lerp(.25,0,q),{ox:0,rc:30,rh:17,bw:9});
    T(q<.3?'side view  (a "sawhorse")':'end-on:  a Newman projection',640,170,{size:34,font:'FR',weight:600,col:PAL.dark,align:'center'});
    if(q>.95){T('front carbon = a point',640,585,{size:26,font:'CV',weight:700,col:PAL.blue,align:'center'});}
  } else {
    // left: Newman ethane with animated dihedral; right: energy curve
    const dih=(()=>{if(S(2)<0){const p=ease(prog(S(1),0.5,12));return lerp(60,60+360,p)%360;} return 0;})();
    const phase=S(2)<0?dih:0;
    const ph=S(2)>=0?(60+ (S(2)*28)%360):phase;
    const phi=ph%360;
    newmanDraw(330,400,95,phi-60,['H','H','H'],['H','H','H'],{hlF:0,hlB:0,bw:9,gs:1});
    T('the dihedral angle',330,150,{size:30,font:'FR',weight:600,col:PAL.dark,align:'center'});
    T((((Math.round(phi-60)%360)+360)%360)+'°',330,178,{size:24,col:PAL.plum,align:'center'});
    const x0=700,w=500,y0=200,h=250;axes(x0,y0,w,h);
    const f=p=>ethaneE(p-60);
    plotCurve(x0,y0,w,h,p=>ethaneE(p),12,PAL.ink,1);
    const rel=((phi-60)%360+360)%360,px=x0+w*rel/360,py=y0+h-h*ethaneE(rel)/12;
    disc(px,py,13,ethaneE(rel)<2?PAL.green:ethaneE(rel)>10?PAL.red:PAL.orange);
    T('energy',x0-8,y0+10,{size:20,col:PAL.grey,align:'right'});[0,120,240,360].forEach(d=>T(d+'°',x0+w*d/360,y0+h+30,{size:20,col:PAL.grey,align:'center'}));
    chip('staggered · 0',x0+w*60/360,y0+h+68,PAL.green,ease(prog(S(1),2,3)),{size:20});
    chip('eclipsed · 12',x0+w*240/360,y0-20,PAL.red,ease(prog(S(1),5,6)),{size:20});
    if(S(2)>-0.1){const a=ease(prog(S(2),0.2,1.2));
      T('12 kJ/mol  ≈ 3 × 4.0',x0+w/2,y0+h+110,{size:30,font:'CV',weight:700,col:PAL.red,align:'center',a});
      T('torsional strain',x0+w/2,y0+h+140,{size:22,col:PAL.dark,align:'center',a});
      const kx=x0+w*120/360,ky=y0+h-h*12/12;
      // turret cameo on the hill
      const tk=prog(S(2),3.5,4.3);
      turret(kx-4,ky-48,.62,tk>0.5?[x0+80,y0+h-30]:null,tk);
      bubble('Are you still there?',kx+10,ky-130,tk>.9?1:0);
      T('a transition state — not a conformer',x0+w/2-90,y0+h+175,{size:22,col:PAL.dark,align:'center',a:ease(prog(S(2),1.5,2.5))});
    }
  }
}

// ======== scene 5: butane (3 sentences) ========
function scene5(c){
  const {t,lt,S}=c;bg(PAL.panel,PAL.panel2);
  const f=(()=>{ // dihedral keyframes: s0 anti(180)  s1 gauche(60)  s2 sweep 0->120->0
    if(S(1)<0)return lerp(300,180,ease(prog(S(0),.3,2.0)));
    if(S(2)<0)return lerp(180,60,ease(prog(S(1),.2,1.6)));
    const q=prog(S(2),0.5,11);return 60+ -60*ease(prog(q,0,.2)) + 0;})();
  let phi=f;
  if(S(2)>=0){const q=S(2);phi=q<1?lerp(60,0,ease(q)):q<4?lerp(0,120,ease((q-1)/3)):q<7?lerp(120,0,ease((q-4)/3)):lerp(0,180,ease((q-7)/3));}
  newmanDraw(300,400,90,phi-180,['CH3','H','H'],['CH3','H','H'],{hlF:0,hlB:0,bw:9});
  T('looking along C2–C3',300,150,{size:30,font:'FR',weight:600,col:PAL.dark,align:'center'});
  const x0=640,w=560,y0=190,h=290;axes(x0,y0,w,h);
  plotCurve(x0,y0,w,h,butaneE,20,PAL.ink,1);
  const rel=((phi%360)+360)%360,px=x0+w*rel/360,py=y0+h-h*butaneE(rel)/20;disc(px,py,13,PAL.orange);
  const mk=(p,e,lab,col,t0)=>{const a=ease(prog(S(Math.floor(t0)),t0%1*10,t0%1*10+1));return a;};
  if(S(0)>0.8){disc(x0+w*.5,y0+h,9,PAL.green);chip('anti · 0',x0+w*.5,y0+h+60,PAL.green,1,{size:21});}
  if(S(1)>0.6){[60,300].forEach(p=>disc(x0+w*p/360,y0+h-h*3.8/20,9,PAL.orange));chip('gauche · 3.8',x0+w*60/360,y0+h-h*3.8/20-42,PAL.orange,1,{size:21});}
  if(S(2)>2.2){disc(x0+w*120/360,y0+h-h*16/20,9,PAL.red);chip('16',x0+w*120/360,y0+h-h*16/20-34,PAL.red,1,{size:21});}
  if(S(2)>0.6){chip('19 · worst',x0+110,y0-16,PAL.red,1,{size:21});}
  T('kJ/mol',x0-6,y0+8,{size:20,col:PAL.grey,align:'right'});
  if(S(2)>8){T('three valleys, three hills',x0+w/2,y0+h+110,{size:32,font:'CV',weight:700,col:PAL.plum,align:'center',a:ease(prog(S(2),8,9.5))});}
}
