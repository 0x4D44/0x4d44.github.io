/* ============================================================================
 * The Death of Stars — interactive widgets.
 * Each block registers one figure via SN.mount(id, init) against the harness
 * in sim.js. Built by a multi-agent pass, then integrated, reviewed, and made
 * responsive for narrow screens. Load AFTER sim.js.
 * ==========================================================================*/

/* ---- widget: birth ------------------------------------------------------- */
SN.mount("birth", function (host, controls) {
  var P = SN.palette, U = SN.u, TAU = U.TAU, rgba = U.rgba;
  var clamp = U.clamp, lerp = U.lerp, mapv = U.map;
  var reduced = SN.reducedMotion;

  // ---- color helpers ----
  function pi(h){h=h.replace('#','');return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)];}
  function hx(n){n=Math.round(n);if(n<0)n=0;if(n>255)n=255;var s=n.toString(16);return s.length<2?'0'+s:s;}
  function hexLerp(a,b,f){var A=pi(a),B=pi(b);return '#'+hx(A[0]+(B[0]-A[0])*f)+hx(A[1]+(B[1]-A[1])*f)+hx(A[2]+(B[2]-A[2])*f);}
  function ss(e0,e1,x){var t=clamp((x-e0)/(e1-e0),0,1);return t*t*(3-2*t);}

  var TEMPS=[[2200,'#7a2b22'],[3000,'#e0564a'],[3600,'#ff8a5c'],[4800,'#ffb27a'],[5800,'#ffd27f'],[7000,'#fbfaf6'],[10000,'#dfe9ff'],[20000,'#9ad8ff'],[40000,'#8fc4ff']];
  function tempHex(T){
    if(T<=TEMPS[0][0])return TEMPS[0][1];
    if(T>=TEMPS[TEMPS.length-1][0])return TEMPS[TEMPS.length-1][1];
    for(var i=0;i<TEMPS.length-1;i++){if(T>=TEMPS[i][0]&&T<=TEMPS[i+1][0]){var f=(T-TEMPS[i][0])/(TEMPS[i+1][0]-TEMPS[i][0]);return hexLerp(TEMPS[i][1],TEMPS[i+1][1],f);}}
    return '#ffd27f';
  }
  var MT=[[0.05,1800],[0.08,2300],[0.1,2900],[0.3,3400],[0.5,3900],[0.8,5300],[1,5800],[2,9200],[5,17000],[10,24000],[20,34000],[40,44000]];
  function massToTemp(m){
    if(m<=MT[0][0])return MT[0][1];
    if(m>=MT[MT.length-1][0])return MT[MT.length-1][1];
    var lm=Math.log(m);
    for(var i=0;i<MT.length-1;i++){if(m>=MT[i][0]&&m<=MT[i+1][0]){var f=(lm-Math.log(MT[i][0]))/(Math.log(MT[i+1][0])-Math.log(MT[i][0]));return Math.exp(Math.log(MT[i][1])+f*(Math.log(MT[i+1][1])-Math.log(MT[i][1])));}}
    return 5800;
  }
  function tempClass(T,m){if(m<0.08)return "BD";if(T>=33000)return "O";if(T>=10000)return "B";if(T>=7500)return "A";if(T>=6000)return "F";if(T>=5300)return "G";if(T>=3900)return "K";return "M";}

  function massLabel(m){var s;if(m<0.1)s=m.toFixed(3);else if(m<10)s=m.toFixed(2);else s=m.toFixed(1);return s+" M☉";}
  function formLabel(myr,ign){if(!ign)return "— (no fusion)";if(myr>=1000)return (myr/1000).toFixed(1)+" Gyr";if(myr>=1)return (myr<10?myr.toFixed(1):myr.toFixed(0))+" Myr";return (myr*1000).toFixed(0)+" kyr";}
  function tempLabel(T){return (Math.round(T/100)*100)+" K";}

  function derive(m){
    var T=massToTemp(m), ign=m>=0.08;
    var l=Math.log(m)/Math.LN10;
    var dur=clamp(mapv(l,-1.52,1.60,16,5.0),5.0,16);
    var myr=25*Math.pow(m,-2.1);
    return {T:T,cls:tempClass(T,m),hex:tempHex(T),ign:ign,dur:dur,myr:myr};
  }

  var coldHex=hexLerp(P.blue,P.panel,0.42);
  var warmHex=P.orange;

  // ---- state ----
  // under reduced-motion, start paused on the settled (ignited) frame
  var state={mass:1.0, playing:!reduced, prog:reduced?1:0, holdT:0, diskAng:0, seed:1};
  var autoloop=!reduced;
  var COUNT=reduced?150:210;
  var parts=[]; var clumps=[];
  var stars=[]; var starsBuilt=false;

  function regen(){
    state.seed++;
    var r=U.rng(state.seed*131+7);
    clumps=[];
    for(var j=0;j<6;j++){
      if(j===0){clumps.push({x:0,y:0,r:0.05});}
      else{var a=r()*TAU,rad=0.10+r()*0.24;clumps.push({x:Math.cos(a)*rad,y:Math.sin(a)*rad*0.82,r:0.03+r()*r()*0.10});}
    }
    parts.length=0;
    for(var i=0;i<COUNT;i++){
      var ci=Math.floor(r()*6);
      var ang=r()*TAU, rr=0.44*Math.pow(r(),0.6);
      var nx=Math.cos(ang)*rr, ny=Math.sin(ang)*rr*0.82;
      var cj=clumps[ci], ja=r()*TAU, jr=cj.r*Math.sqrt(r());
      var kx=cj.x+Math.cos(ja)*jr, ky=cj.y+Math.sin(ja)*jr*0.9;
      var da=r()*TAU, dr=0.05+0.13*Math.sqrt(r()), dz=(r()-0.5)*0.02;
      parts.push({nx:nx,ny:ny,kx:kx,ky:ky,da:da,dr:dr,dz:dz,s:0.7+r()*1.3,ph:r()*TAU,ph2:r()*TAU});
    }
    state.prog=reduced?0:0; state.holdT=0; state.diskAng=0;
  }
  regen();

  function buildStars(w,h){
    var r=U.rng(9);stars.length=0;
    for(var i=0;i<44;i++){stars.push({x:r(),y:r(),b:0.2+r()*0.6,s:0.4+r()*1.1});}
    starsBuilt=true;
  }

  // ---- canvas ----
  var api=SN.canvas(host,function(a){ if(!starsBuilt||true) buildStars(a.w,a.h); });
  api.canvas.style.touchAction="pan-y";

  function replay(){ regen(); state.playing=true; if(playBtn)playBtn.textContent="Pause"; }
  function togglePlay(){
    if(state.playing){ state.playing=false; }
    else { if(state.prog>=1) regen(); state.playing=true; }
    if(playBtn) playBtn.textContent=state.playing?"Pause":"Play";
  }

  // ---- controls ----
  var playBtn=null;
  (function(){
    var slider=SN.slider({label:"Mass", min:-1.52, max:1.60, step:0.01, value:0,
      format:function(v){return massLabel(Math.pow(10,v));},
      oninput:function(v){state.mass=Math.pow(10,v);}});
    playBtn=SN.el("button.btn.primary",{onclick:togglePlay},reduced?"Play":"Pause");
    var rep=SN.el("button.btn",{onclick:replay},"Replay");
    var grp=SN.el("div.grp",{},[playBtn,rep]);
    if(controls){ controls.appendChild(slider); controls.appendChild(grp); }
    else{
      host.style.position="relative";
      var box=SN.el("div",{},[slider,grp]);
      box.style.position="absolute"; box.style.left="8px"; box.style.bottom="8px";
      box.style.zIndex="5"; box.style.display="flex"; box.style.gap="8px"; box.style.alignItems="center";
      host.appendChild(box);
    }
  })();

  // ---- draw helpers ----
  function glow(ctx,x,y,r,hex,a){
    if(r<=0||a<=0)return;
    var g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba(hex,a));
    g.addColorStop(0.4,rgba(hex,a*0.5));
    g.addColorStop(1,rgba(hex,0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,r,0,TAU); ctx.fill();
  }

  function caption(prog,ign){
    if(prog<0.12)return "Cold molecular cloud — ~10 K, mostly H₂";
    if(prog<0.22)return "External trigger — shock compression sweeps in";
    if(prog<0.40)return "Fragmentation into clumps";
    if(prog<0.55)return "Gravitational free-fall collapse";
    if(prog<0.66)return "Protostar + flattened accretion disk";
    if(prog<0.86)return "Bipolar jets — Herbig-Haro shock knots";
    if(prog<0.93)return "Disk clears — T Tauri flicker";
    return ign?"Main sequence — core >10 MK, fusion ignited":"Brown dwarf — no fusion";
  }

  // ---- main loop ----
  SN.loop(host,function(dt,t){
    var ctx=api.ctx, w=api.w, h=api.h;
    if(w<2||h<2)return;
    try{
    var m=state.mass, d=derive(m);
    var scale=Math.min(w,h), cx=w*0.5, cy=h*0.52;

    // advance
    if(state.playing && state.prog<1){ state.prog+=dt/d.dur; if(state.prog>1)state.prog=1; }
    if(state.prog>=1){ state.holdT+=dt; if(autoloop && state.holdT>3.4 && state.playing){ regen(); } }
    var prog=state.prog;

    // factors
    var triggerT=ss(0.10,0.30,prog);
    var bandA=triggerT*(1-ss(0.26,0.44,prog));
    var fragT=ss(0.20,0.40,prog);
    var cb=ss(0.38,0.66,prog);
    var diskF=ss(0.52,0.66,prog);
    var clearT=ss(0.82,0.94,prog);
    var igniteT=ss(0.88,1.0,prog)*(d.ign?1:0);
    var jr=clamp((prog-0.60)/0.26,0,1);
    var jaAct=ss(0.60,0.66,prog)*(1-ss(0.88,0.94,prog))*(d.ign?1:0.7);
    var fp=(prog-0.905)/0.045; var flash=Math.exp(-fp*fp*4)*(reduced?0.4:1)*(d.ign?1:0);
    if(prog<0.87||prog>0.99)flash*= (prog>0.99?0:1);

    if(cb>0.02) state.diskAng+=dt*(0.5+cb*2.4);

    // background
    var bg=ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,P.bg); bg.addColorStop(1,hexLerp(P.bg,P.panel,0.6));
    ctx.fillStyle=bg; ctx.fillRect(0,0,w,h);

    ctx.globalCompositeOperation='lighter';
    // stars
    for(var si=0;si<stars.length;si++){var s=stars[si];var tw=0.6+0.4*Math.sin(t*0.7+si);glow(ctx,s.x*w,s.y*h,s.s*3,P.white,0.10*s.b*tw);}

    // cloud background blob
    var cloudBgA=(1-cb)*0.42;
    if(cloudBgA>0.005){glow(ctx,cx,cy,scale*0.5,coldHex,cloudBgA);}

    // trigger shock band
    if(bandA>0.01){
      var bandX=cx+lerp(-0.55,0.55,triggerT)*scale, bw=scale*0.5;
      var lg=ctx.createLinearGradient(bandX-bw,0,bandX+bw,0);
      lg.addColorStop(0,rgba(P.ice,0));lg.addColorStop(0.5,rgba(P.ice,0.16*bandA));lg.addColorStop(1,rgba(P.ice,0));
      ctx.fillStyle=lg; ctx.fillRect(0,0,w,h);
    }

    // particles
    var turbAmp=0.02*(1-cb);
    var pcol=hexLerp(coldHex,warmHex,clamp(cb*1.1-0.05,0,1));
    for(var i=0;i<parts.length;i++){
      var p=parts[i];
      var tx=(Math.sin(t*0.4+p.ph)+Math.sin(t*0.19+p.ph2)*0.6)*turbAmp;
      var ty=(Math.cos(t*0.33+p.ph2)+Math.sin(t*0.24+p.ph)*0.6)*turbAmp;
      var cX=p.nx+tx, cY=p.ny+ty;
      var gX=lerp(cX,p.kx,fragT), gY=lerp(cY,p.ky,fragT);
      var ang=p.da+state.diskAng, drad=p.dr*(1-clearT*0.85);
      var diX=Math.cos(ang)*drad, diY=Math.sin(ang)*drad*0.30+p.dz;
      var fX=lerp(gX,diX,cb), fY=lerp(gY,diY,cb);
      var X=cx+fX*scale, Y=cy+fY*scale;
      var aBase=lerp(0.40,0.62,cb)*(1-clearT*0.95);
      var ta=aBase*(0.82+0.18*Math.sin(t*1.4+p.ph));
      if(ta<=0.004)continue;
      ctx.fillStyle=rgba(pcol,ta);
      ctx.beginPath(); ctx.arc(X,Y,p.s*(1.05+cb*0.6),0,TAU); ctx.fill();
    }

    // accretion disk
    if(diskF>0.01 && cb>0.05){
      ctx.save(); ctx.translate(cx,cy); ctx.scale(1,0.30);
      var dR=scale*0.17*(1-clearT*0.8);
      var dg=ctx.createRadialGradient(0,0,0,0,0,dR);
      dg.addColorStop(0,rgba(P.orange,0.0));
      dg.addColorStop(0.35,rgba(P.orange,0.42*diskF*(1-clearT)));
      dg.addColorStop(0.75,rgba(P.gold,0.20*diskF*(1-clearT)));
      dg.addColorStop(1,rgba(P.orange,0));
      ctx.fillStyle=dg; ctx.beginPath(); ctx.arc(0,0,dR,0,TAU); ctx.fill();
      ctx.restore();
    }

    // protostar / star
    var lr=Math.log(m)/Math.LN10;
    var starR=scale*clamp(mapv(lr,-1.52,1.60,0.018,0.05),0.014,0.055);
    var protoR=lerp(scale*0.004,starR*0.7,diskF);
    var curR=lerp(protoR,starR,igniteT);
    var warmCore=hexLerp('#e0564a','#ff8a5c',0.5);
    var coreHex=d.ign?hexLerp(warmCore,d.hex,igniteT):hexLerp('#e0564a',d.hex,0.55);
    var flick=1;
    if(prog>0.72&&prog<0.95){flick=1+(reduced?0.05:0.20)*Math.sin(t*7+Math.sin(t*3));}
    var breath=1+0.04*Math.sin(t*1.2);
    var coreBright=(d.ign?0.55:0.35);
    if(protoR>0.5||diskF>0.02){
      glow(ctx,cx,cy,curR*(d.ign?7:4.2)*flick*breath,coreHex,coreBright);
      glow(ctx,cx,cy,curR*2.4*breath,coreHex,coreBright*0.9);
      ctx.fillStyle=rgba(coreHex,d.ign?0.95:0.7);
      ctx.beginPath(); ctx.arc(cx,cy,curR*breath,0,TAU); ctx.fill();
    }

    // jets + HH knots
    if(jaAct>0.02){
      var jl=scale*(0.14+0.30*jr);
      var jc=hexLerp(P.cyan,P.ice,0.3);
      var drift=(t*0.06)%0.18;
      for(var dd=0;dd<2;dd++){
        var dir=dd===0?-1:1;
        var y0=cy+dir*curR*1.2, y1=cy+dir*jl;
        var jg=ctx.createLinearGradient(cx,y0,cx,y1);
        jg.addColorStop(0,rgba(jc,0.0));
        jg.addColorStop(0.15,rgba(jc,0.55*jaAct));
        jg.addColorStop(1,rgba(jc,0));
        ctx.strokeStyle=jg; ctx.lineCap='round';
        ctx.lineWidth=scale*0.014; ctx.beginPath(); ctx.moveTo(cx,y0); ctx.lineTo(cx,y1); ctx.stroke();
        ctx.strokeStyle=rgba(P.white,0.35*jaAct); ctx.lineWidth=scale*0.004;
        ctx.beginPath(); ctx.moveTo(cx,y0); ctx.lineTo(cx,y1); ctx.stroke();
        var bases=[0.5,0.72,0.9];
        for(var b=0;b<bases.length;b++){
          var fr=bases[b]+drift; if(fr>1.05)continue;
          var fade=1-clamp((fr-0.7)/0.4,0,1)*0.7;
          var ky=cy+dir*jl*fr, kr=scale*0.011*fade;
          var kc=hexLerp(P.magenta,P.ember,bases[b]);
          glow(ctx,cx,ky,kr*3.2,kc,0.5*jaAct*fade);
          ctx.fillStyle=rgba(kc,0.8*jaAct*fade);
          ctx.beginPath(); ctx.arc(cx,ky,kr,0,TAU); ctx.fill();
        }
      }
    }

    // ignition flash
    if(flash>0.01){glow(ctx,cx,cy,starR*6*(1+flash),P.white,0.7*flash);}

    ctx.globalCompositeOperation='source-over';

    // ---- readout ----
    var fs=clamp(w*0.026,10,13);
    ctx.font=fs+"px ui-monospace, monospace"; ctx.textBaseline="top";
    var px=12, py=12, lh=fs*1.55;
    function line(y,label,val,vhex){
      ctx.textAlign="left";
      ctx.fillStyle=rgba(P.muted,0.9); ctx.fillText(label,px,y);
      ctx.fillStyle=vhex||P.bright; ctx.fillText(val,px+fs*4.2,y);
    }
    line(py,"MASS", massLabel(m), P.bright);
    var clsTxt=(d.cls==="BD"?"BD":d.cls)+"  "+tempLabel(d.T);
    line(py+lh,"CLASS", clsTxt, d.hex);
    line(py+lh*2,"FORM", formLabel(d.myr,d.ign), P.gold);
    // swatch
    ctx.beginPath(); ctx.arc(px+fs*3.0,py+2+fs*0.5,fs*0.42,0,TAU);
    ctx.fillStyle=d.hex; ctx.fill();
    ctx.strokeStyle=rgba(P.muted,0.4); ctx.lineWidth=1; ctx.stroke();

    // caption
    ctx.textAlign="center"; ctx.font=(fs+1)+"px ui-monospace, monospace";
    ctx.fillStyle=rgba(P.ink,0.92);
    ctx.fillText(caption(prog,d.ign), cx, h-fs*2.6);

    // progress bar
    var bx0=w*0.18, bx1=w*0.82, by=h-fs*1.2;
    ctx.strokeStyle=rgba(P.muted,0.3); ctx.lineWidth=2; ctx.lineCap="round";
    ctx.beginPath(); ctx.moveTo(bx0,by); ctx.lineTo(bx1,by); ctx.stroke();
    ctx.strokeStyle=rgba(P.gold,0.85);
    ctx.beginPath(); ctx.moveTo(bx0,by); ctx.lineTo(bx0+(bx1-bx0)*prog,by); ctx.stroke();

    // title
    ctx.textAlign="right"; ctx.font=fs+"px ui-monospace, monospace";
    ctx.fillStyle=rgba(P.muted,0.7);
    ctx.fillText("STAR BIRTH", w-12, 12);

    }catch(err){ /* keep loop alive */ }
  });
});

/* ---- widget: hr ---------------------------------------------------------- */
SN.mount("hr", function (host, controls) {
  var P = SN.palette, U = SN.u;

  // ---- data -------------------------------------------------------------
  // category: "ms" main sequence, "giant", "wd" white dwarf
  var STARS = [
    { name:"O star",     cls:"O5 V",   T:40000, L:1e5,   M:40,   cat:"ms",    note:"Massive, blue-white; burns out in a few Myr." },
    { name:"B star",     cls:"B2 V",   T:20000, L:1e3,   M:7,    cat:"ms",    note:"Hot blue dwarf; short-lived." },
    { name:"Sirius A",   cls:"A1 V",   T:9900,  L:25,    M:2.06, cat:"ms",    note:"Nearest bright star; hydrogen-fusing dwarf." },
    { name:"Procyon",    cls:"F5 IV-V",T:6800,  L:7,     M:1.5,  cat:"ms",    note:"Just leaving the main sequence." },
    { name:"Sun",        cls:"G2 V",   T:5772,  L:1,     M:1,    cat:"ms",    note:"Our star; ~4.6 Gyr into a ~10 Gyr life." },
    { name:"K dwarf",    cls:"K5 V",   T:4500,  L:0.3,   M:0.7,  cat:"ms",    note:"Cool orange dwarf; very long-lived." },
    { name:"Proxima",    cls:"M5.5 V", T:3040,  L:0.0017,M:0.12, cat:"ms",    note:"Red dwarf; fusion lasts trillions of years." },

    { name:"Betelgeuse", cls:"M1 Ia",  T:3500,  L:1e5,   M:18,   cat:"giant", note:"Red supergiant; a future core-collapse supernova." },
    { name:"Rigel",      cls:"B8 Ia",  T:12000, L:1.2e5, M:21,   cat:"giant", note:"Blue supergiant; hugely luminous." },
    { name:"Aldebaran",  cls:"K5 III", T:3900,  L:400,   M:1.2,  cat:"giant", note:"Red giant; core hydrogen exhausted, shell burning." },
    { name:"Arcturus",   cls:"K1.5 III",T:4300, L:170,   M:1.1,  cat:"giant", note:"Evolved orange giant." },

    { name:"Sirius B",   cls:"DA2",    T:25000, L:0.025, M:1.0,  cat:"wd",    note:"White dwarf; Earth-sized ember, no fusion." },
    { name:"40 Eri B",   cls:"DA4",    T:16500, L:0.013, M:0.5,  cat:"wd",    note:"Nearby white dwarf; cooling remnant." }
  ];

  // ---- blackbody colour ramp -------------------------------------------
  var BB = [
    [40000,"#9bc0ff"],[20000,"#aecdff"],[10000,"#eaf1ff"],[7500,"#fbfaf6"],
    [6000,"#ffe9b8"],[5200,"#ffd27f"],[4200,"#ffb066"],[3400,"#ff8a5c"],[2800,"#e0564a"]
  ];
  function hexRGB(h){ h=h.replace("#",""); return [parseInt(h.substr(0,2),16),parseInt(h.substr(2,2),16),parseInt(h.substr(4,2),16)]; }
  var BBP = [];
  for (var i=0;i<BB.length;i++){ BBP.push([Math.log(BB[i][0]), hexRGB(BB[i][1])]); }
  function bbRGB(T){
    var lt = Math.log(U.clamp(T, 2500, 45000));
    if (lt >= BBP[0][0]) return BBP[0][1];
    if (lt <= BBP[BBP.length-1][0]) return BBP[BBP.length-1][1];
    for (var k=0;k<BBP.length-1;k++){
      var a=BBP[k], b=BBP[k+1];
      if (lt <= a[0] && lt >= b[0]){
        var f = (a[0]-lt)/(a[0]-b[0]);
        return [ a[1][0]+(b[1][0]-a[1][0])*f, a[1][1]+(b[1][1]-a[1][1])*f, a[1][2]+(b[1][2]-a[1][2])*f ];
      }
    }
    return [255,255,255];
  }
  function bbStr(T,a){ var c=bbRGB(T); return "rgba("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+","+(a==null?1:a)+")"; }

  // ---- scales -----------------------------------------------------------
  var LT_HI = Math.log(50000)/Math.LN10;  // left edge
  var LT_LO = Math.log(2500)/Math.LN10;   // right edge
  var LL_TOP = 6, LL_BOT = -4;            // luminosity decades
  var padL=46, padR=14, padT=18, padB=34;

  function log10(x){ return Math.log(x)/Math.LN10; }

  var lay = { px0:0, py0:0, pw:0, ph:0 };
  function relayout(w,h){
    lay.px0 = padL; lay.py0 = padT;
    lay.pw = Math.max(1, w - padL - padR);
    lay.ph = Math.max(1, h - padT - padB);
  }
  function xFromT(T){
    var lt = log10(U.clamp(T,2500,50000));
    var t = (LT_HI - lt) / (LT_HI - LT_LO);
    return lay.px0 + t * lay.pw;
  }
  function yFromL(L){
    var ll = log10(Math.max(1e-6, L));
    var t = (LL_TOP - ll) / (LL_TOP - LL_BOT);
    return lay.py0 + t * lay.ph;
  }

  // ---- main-sequence mass interpolation ---------------------------------
  var MS_M = [0.12,0.7,1.0,1.5,2.06,7,40];
  var MS_T = [3040,4500,5772,6800,9900,20000,40000];
  function tempFromMass(M){
    M = U.clamp(M, MS_M[0], MS_M[MS_M.length-1]);
    var lm = log10(M);
    for (var k=0;k<MS_M.length-1;k++){
      if (M <= MS_M[k+1]){
        var a=log10(MS_M[k]), b=log10(MS_M[k+1]);
        var f = (b===a)?0:(lm-a)/(b-a);
        var lt = log10(MS_T[k]) + (log10(MS_T[k+1])-log10(MS_T[k]))*f;
        return Math.pow(10, lt);
      }
    }
    return MS_T[MS_T.length-1];
  }
  function lumFromMass(M){ return Math.pow(M, 3.5); }         // L in Lsun
  function lifeGyr(M){ return 10 * Math.pow(M, -2.5); }        // Gyr

  // ---- state ------------------------------------------------------------
  var hovered = -1;
  var pointer = { x:-999, y:-999, active:false };
  var markerM = 1.0, showMarker = true, showLabels = true;

  // ---- canvas -----------------------------------------------------------
  var api = SN.canvas(host, function (a){ relayout(a.w, a.h); });
  relayout(api.w, api.h);

  function toLocal(e){
    var r = api.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function pickStar(x,y){
    var best=-1, bd=14*14;
    for (var i=0;i<STARS.length;i++){
      var sx=xFromT(STARS[i].T), sy=yFromL(STARS[i].L);
      var dx=sx-x, dy=sy-y, d=dx*dx+dy*dy;
      if (d<bd){ bd=d; best=i; }
    }
    return best;
  }
  api.canvas.addEventListener("pointermove", function(e){
    var p=toLocal(e); pointer.x=p.x; pointer.y=p.y; pointer.active=true;
    hovered = pickStar(p.x,p.y);
  });
  api.canvas.addEventListener("pointerdown", function(e){
    var p=toLocal(e); pointer.x=p.x; pointer.y=p.y; pointer.active=true;
    hovered = pickStar(p.x,p.y);
    if (e.pointerType==="touch") e.preventDefault();
  });
  api.canvas.addEventListener("pointerleave", function(){ pointer.active=false; hovered=-1; });
  api.canvas.style.touchAction = "pan-y";

  // ---- controls ---------------------------------------------------------
  if (controls){
    var sl = SN.slider({
      label:"star mass", min:0.1, max:40, step:0.1, value:markerM,
      format:function(v){ return (v<10? v.toFixed(1):v.toFixed(0))+" M☉"; },
      oninput:function(v){ markerM=v; showMarker=true; if (chipM) chipM.className="chip on"; }
    });
    controls.appendChild(sl);
    var chipM = SN.el("button.chip.on", { text:"marker", onclick:function(){
      showMarker=!showMarker; chipM.className = showMarker?"chip on":"chip";
    }});
    var chipL = SN.el("button.chip.on", { text:"labels", onclick:function(){
      showLabels=!showLabels; chipL.className = showLabels?"chip on":"chip";
    }});
    controls.appendChild(SN.el("div.grp", {}, [chipM, chipL]));
  }

  // ---- drawing helpers --------------------------------------------------
  function roundRect(ctx,x,y,w,h,r){
    ctx.beginPath();
    ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
  }
  function fmtL(L){
    if (L>=1000 || L<0.01){
      var e=Math.round(log10(L));
      return "10"+sup(e)+" L☉";
    }
    return (L>=10? L.toFixed(0) : L.toFixed(L<1?4:1))+" L☉";
  }
  function sup(n){
    var s=(n<0?"⁻":""), d=Math.abs(n).toString(), map="⁰¹²³⁴⁵⁶⁷⁸⁹", o="";
    for (var i=0;i<d.length;i++) o+=map.charAt(+d.charAt(i));
    return s+o;
  }

  // ---- render -----------------------------------------------------------
  function draw(t){
    var ctx=api.ctx, w=api.w, h=api.h;
    if (w<2 || h<2) return;
    relayout(w,h);
    var px0=lay.px0, py0=lay.py0, pw=lay.pw, ph=lay.ph;
    // narrow-width branch: desktop (w>=640) is byte-for-byte unchanged.
    var narrow = w < 560;
    var fs  = narrow ? U.clamp(w*0.014, 11, 12) : U.clamp(w*0.014, 9, 12);
    var afs = narrow ? 11 : U.clamp(w*0.013, 8, 11);
    var rfs = narrow ? 11 : U.clamp(w*0.015, 10, 13);

    ctx.clearRect(0,0,w,h);
    ctx.fillStyle=P.bg; ctx.fillRect(0,0,w,h);

    // plot panel
    ctx.fillStyle=P.panel; ctx.fillRect(px0,py0,pw,ph);

    // temperature colour wash
    var grad = ctx.createLinearGradient(px0,0,px0+pw,0);
    var NS=10;
    for (var s=0;s<=NS;s++){
      var frac=s/NS;
      var lt = LT_HI + (LT_LO-LT_HI)*frac;
      grad.addColorStop(frac, bbStr(Math.pow(10,lt), 0.10));
    }
    ctx.fillStyle=grad; ctx.fillRect(px0,py0,pw,ph);

    // gridlines
    ctx.lineWidth=1;
    ctx.font = afs+"px ui-monospace, monospace";
    ctx.textBaseline="middle";
    // luminosity (horizontal)
    var Ls=[1e-4,1e-2,1,1e2,1e4,1e6];
    for (var li=0; li<Ls.length; li++){
      var yy=yFromL(Ls[li]);
      ctx.strokeStyle=U.rgba(P.muted,0.14);
      ctx.beginPath(); ctx.moveTo(px0,yy); ctx.lineTo(px0+pw,yy); ctx.stroke();
      ctx.fillStyle=U.rgba(P.muted,0.9); ctx.textAlign="right";
      ctx.fillText("10"+sup(Math.round(log10(Ls[li]))), px0-6, yy);
    }
    // temperature (vertical). On narrow, thin the labelled ticks so 11px
    // labels don't collide, but keep every gridline and the reversed axis.
    var Ts=[40000,10000,6000,3000];
    ctx.textAlign="center"; ctx.textBaseline="top";
    for (var ti=0; ti<Ts.length; ti++){
      var xx=xFromT(Ts[ti]);
      ctx.strokeStyle=U.rgba(P.muted,0.14);
      ctx.beginPath(); ctx.moveTo(xx,py0); ctx.lineTo(xx,py0+ph); ctx.stroke();
      var showTick = !narrow || (ti===0 || ti===2 || ti===3);
      if (showTick){
        ctx.fillStyle=U.rgba(P.muted,0.9);
        ctx.fillText((Ts[ti]>=1000?(Ts[ti]/1000)+"k":Ts[ti]), xx, py0+ph+5);
      }
    }
    // frame
    ctx.strokeStyle=U.rgba(P.muted,0.3); ctx.strokeRect(px0,py0,pw,ph);

    // main-sequence band (through ms anchors)
    var ms=[];
    for (var mi=0;mi<STARS.length;mi++) if (STARS[mi].cat==="ms") ms.push(STARS[mi]);
    ms.sort(function(a,b){ return b.T-a.T; });
    ctx.save();
    ctx.lineCap="round"; ctx.lineJoin="round";
    ctx.strokeStyle=U.rgba(P.ice,0.10); ctx.lineWidth=U.clamp(ph*0.06,10,26);
    ctx.beginPath();
    for (var q=0;q<ms.length;q++){ var mx=xFromT(ms[q].T),my=yFromL(ms[q].L); if(q===0)ctx.moveTo(mx,my); else ctx.lineTo(mx,my); }
    ctx.stroke();
    ctx.strokeStyle=U.rgba(P.blue,0.16); ctx.lineWidth=1.4;
    ctx.beginPath();
    for (var q2=0;q2<ms.length;q2++){ var mx2=xFromT(ms[q2].T),my2=yFromL(ms[q2].L); if(q2===0)ctx.moveTo(mx2,my2); else ctx.lineTo(mx2,my2); }
    ctx.stroke();
    ctx.restore();

    // region labels
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    ctx.font = "italic "+rfs+"px ui-monospace, monospace";
    // main sequence (rotated along band)
    var pA={x:xFromT(9000),y:yFromL(15)}, pB={x:xFromT(6000),y:yFromL(0.9)};
    var ang=Math.atan2(pB.y-pA.y, pB.x-pA.x);
    ctx.save();
    ctx.translate((pA.x+pB.x)/2+6,(pA.y+pB.y)/2-8);
    ctx.rotate(ang);
    ctx.fillStyle=U.rgba(P.ice,0.5);
    ctx.fillText(narrow?"main seq.":"main sequence",0,0);
    ctx.restore();
    // giants label: shorten and clamp within the plot on narrow so it can't
    // run off the right edge.
    var gLbl = narrow ? "giants" : "giants & supergiants";
    ctx.fillStyle=U.rgba(P.ember,0.55);
    var gx = xFromT(5200);
    if (narrow){
      var gwid = ctx.measureText(gLbl).width;
      gx = Math.min(gx, px0+pw-gwid-2);
      gx = Math.max(px0+2, gx);
    }
    ctx.fillText(gLbl, gx, yFromL(6e4));
    // white dwarfs label: clamp on narrow.
    var wLbl = narrow ? "white dwarfs" : "white dwarfs";
    ctx.fillStyle=U.rgba(P.cyan,0.55);
    var wx = xFromT(30000);
    if (narrow){
      var wwid = ctx.measureText(wLbl).width;
      wx = Math.min(wx, px0+pw-wwid-2);
      wx = Math.max(px0+2, wx);
    }
    ctx.fillText(wLbl, wx, yFromL(3e-4));

    // stars
    ctx.font = fs+"px ui-monospace, monospace";
    for (var i2=0;i2<STARS.length;i2++){
      var st=STARS[i2];
      var sx=xFromT(st.T), sy=yFromL(st.L);
      var r = U.clamp(2.6 + (log10(st.L)+4)*0.5, 2.6, 8);
      var col = bbStr(st.T,1);
      // glow
      var gr = ctx.createRadialGradient(sx,sy,0,sx,sy,r*4.2);
      gr.addColorStop(0, bbStr(st.T,0.55));
      gr.addColorStop(1, bbStr(st.T,0));
      ctx.fillStyle=gr;
      ctx.beginPath(); ctx.arc(sx,sy,r*4.2,0,U.TAU); ctx.fill();
      // core
      ctx.fillStyle=col;
      ctx.beginPath(); ctx.arc(sx,sy,r,0,U.TAU); ctx.fill();
      if (i2===hovered){
        ctx.strokeStyle=P.bright; ctx.lineWidth=1.5;
        ctx.beginPath(); ctx.arc(sx,sy,r+3.5,0,U.TAU); ctx.stroke();
      }
      // label
      if (showLabels){
        var right = sx > px0+pw*0.6;
        // On narrow, flip side if the label would clip off either plot edge.
        if (narrow){
          var tw = ctx.measureText(st.name).width;
          if (!right && sx+(r+6)+tw > px0+pw) right=true;
          else if (right && sx-(r+6)-tw < px0) right=false;
        }
        ctx.textAlign = right?"right":"left";
        ctx.textBaseline="middle";
        ctx.fillStyle = i2===hovered? P.bright : U.rgba(P.ink,0.82);
        ctx.fillText(st.name, sx + (right?-(r+6):(r+6)), sy);
      }
    }

    // mass marker on the main sequence
    if (showMarker){
      var Mm=U.clamp(markerM,0.1,40);
      var Lm=lumFromMass(Mm), Tm=tempFromMass(Mm);
      var mx3=xFromT(Tm), my3=yFromL(Lm);
      var pr = SN.reducedMotion? 0 : Math.sin(t*3)*2;
      ctx.save();
      ctx.strokeStyle=P.gold; ctx.lineWidth=1.6;
      ctx.beginPath(); ctx.arc(mx3,my3,7+pr,0,U.TAU); ctx.stroke();
      ctx.strokeStyle=U.rgba(P.gold,0.35);
      ctx.beginPath(); ctx.moveTo(mx3-13,my3); ctx.lineTo(mx3-6,my3);
      ctx.moveTo(mx3+6,my3); ctx.lineTo(mx3+13,my3);
      ctx.moveTo(mx3,my3-13); ctx.lineTo(mx3,my3-6);
      ctx.moveTo(mx3,my3+6); ctx.lineTo(mx3,my3+13); ctx.stroke();
      ctx.fillStyle=P.gold;
      ctx.beginPath(); ctx.arc(mx3,my3,2.2,0,U.TAU); ctx.fill();
      ctx.restore();
      // marker readout (top-left), fully clamped inside the canvas
      var lg=lifeGyr(Mm);
      var lifeStr = lg>=1 ? lg.toFixed(1)+" Gyr" : (lg*1000>=1? (lg*1000).toFixed(0)+" Myr" : (lg*1e6).toFixed(0)+" kyr");
      var lines=[
        Mm.toFixed(1)+" M☉  →  main seq.",
        "L ≈ "+ (Lm>=1000||Lm<0.01? "10"+sup(Math.round(log10(Lm))) : Lm.toFixed(Lm<1?3:1)) +" L☉",
        "T ≈ "+ Math.round(Tm/10)*10 +" K",
        "life ≈ "+lifeStr
      ];
      drawPanel(ctx, px0+8, py0+8, lines, P.gold, afs, "L–M relation  L∝M³·⁵", w, h);
    }

    // hover readout panel (clamped fully inside the canvas)
    if (hovered>=0){
      var s2=STARS[hovered];
      var hl=[
        s2.name+"   "+s2.cls,
        "T = "+s2.T+" K",
        "L = "+fmtL(s2.L),
        "M = "+s2.M+" M☉",
        s2.note
      ];
      var pw2 = narrow ? Math.min(pw-4, 220) : Math.min(pw*0.62, 260);
      var bx = px0+pw-8-pw2, by = py0+ph-8;
      drawPanelWrap(ctx, bx, by, pw2, hl, bbStr(s2.T,1), afs, w, h);
    }

    // axis titles
    ctx.font = afs+"px ui-monospace, monospace";
    ctx.fillStyle=U.rgba(P.muted,0.75);
    ctx.textAlign="center"; ctx.textBaseline="bottom";
    var xtitle = narrow ? "← hot   temp (K)   cool →" : "← hotter    surface temperature (K)    cooler →";
    ctx.fillText(xtitle, px0+pw/2, h-2);
    ctx.save();
    ctx.translate(11, py0+ph/2); ctx.rotate(-Math.PI/2);
    ctx.textBaseline="top"; ctx.textAlign="center";
    ctx.fillText(narrow?"luminosity (L☉)":"luminosity (L☉)", 0, 0);
    ctx.restore();
  }

  function drawPanel(ctx,x,y,lines,accent,afs,footer,W,H){
    ctx.font = afs+"px ui-monospace, monospace";
    var lh=afs+5, w=0;
    for (var i=0;i<lines.length;i++) w=Math.max(w, ctx.measureText(lines[i]).width);
    if (footer) w=Math.max(w, ctx.measureText(footer).width);
    var pad=9, bw=w+pad*2, bh=lines.length*lh + (footer?lh:0) + pad*2 - 2;
    // Clamp the whole panel box within [0,W]x[0,H]. No-op on desktop.
    if (W!=null) x = Math.max(2, Math.min(x, W-bw-2));
    if (H!=null) y = Math.max(2, Math.min(y, H-bh-2));
    ctx.fillStyle=U.rgba(P.bg,0.86);
    roundRect(ctx,x,y,bw,bh,7); ctx.fill();
    ctx.strokeStyle=U.rgba(accent,0.6); ctx.lineWidth=1; ctx.stroke();
    ctx.textAlign="left"; ctx.textBaseline="top";
    var yy=y+pad;
    for (var j=0;j<lines.length;j++){
      ctx.fillStyle = j===0? accent : P.ink;
      ctx.fillText(lines[j], x+pad, yy); yy+=lh;
    }
    if (footer){ ctx.fillStyle=U.rgba(P.muted,0.8); ctx.fillText(footer, x+pad, yy); }
  }

  function drawPanelWrap(ctx,x,y,maxw,lines,accent,afs,W,H){
    ctx.font = afs+"px ui-monospace, monospace";
    var lh=afs+5, pad=9, avail=maxw-pad*2;
    var out=[];
    for (var i=0;i<lines.length;i++){
      if (i<lines.length-1){ out.push({t:lines[i],head:i===0}); continue; }
      var words=lines[i].split(" "), cur="";
      for (var wI=0;wI<words.length;wI++){
        var tst=cur?cur+" "+words[wI]:words[wI];
        if (ctx.measureText(tst).width>avail && cur){ out.push({t:cur,head:false}); cur=words[wI]; }
        else cur=tst;
      }
      if (cur) out.push({t:cur,head:false});
    }
    var bh=out.length*lh+pad*2-2;
    var yy0 = y-bh;
    // Clamp the whole panel box within [0,W]x[0,H]. No-op on desktop.
    if (W!=null) x = Math.max(2, Math.min(x, W-maxw-2));
    if (H!=null) yy0 = Math.max(2, Math.min(yy0, H-bh-2));
    ctx.fillStyle=U.rgba(P.bg,0.9);
    roundRect(ctx,x,yy0,maxw,bh,7); ctx.fill();
    ctx.strokeStyle=U.rgba(accent,0.6); ctx.lineWidth=1; ctx.stroke();
    ctx.textAlign="left"; ctx.textBaseline="top";
    var yy=yy0+pad;
    for (var o=0;o<out.length;o++){
      ctx.fillStyle = out[o].head? accent : (o>=lines.length-1? U.rgba(P.ink,0.85): P.ink);
      ctx.fillText(out[o].t, x+pad, yy); yy+=lh;
    }
  }

  // ---- loop -------------------------------------------------------------
  SN.loop(host, function(dt,t){ try { draw(t); } catch(e){} });
});

/* ---- widget: fate -------------------------------------------------------- */
SN.mount("fate", function (host, controls) {
  var P = SN.palette, U = SN.u;

  // ---- color helpers ----
  function hexToRgb(h) {
    h = ("" + h).replace("#", "");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return { r: parseInt(h.substr(0,2),16), g: parseInt(h.substr(2,2),16), b: parseInt(h.substr(4,2),16) };
  }
  var CT = {};
  for (var k in P) { if (P.hasOwnProperty(k) && typeof P[k] === "string" && P[k].charAt(0) === "#") CT[k] = hexToRgb(P[k]); }
  function mixC(a, b, t) {
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return { r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t };
  }
  function rgbaC(c, a) {
    return "rgba(" + (c.r|0) + "," + (c.g|0) + "," + (c.b|0) + "," + a + ")";
  }

  // ---- physics ----
  // log10(M) -> surface temperature anchors (main sequence)
  var LM = [-1.301,-1.097,-1.0,-0.301,0,0.301,0.477,0.699,0.903,1.301,1.602,2.0,2.176];
  var TT = [1800,2300,2800,3800,5800,9000,11500,17000,22000,33000,41000,47000,50000];
  function tempOf(M) {
    var x = Math.log(M) / Math.LN10;
    if (x <= LM[0]) return TT[0];
    if (x >= LM[LM.length-1]) return TT[TT.length-1];
    for (var i = 0; i < LM.length-1; i++) {
      if (x <= LM[i+1]) { var t = (x - LM[i]) / (LM[i+1] - LM[i]); return TT[i] + (TT[i+1]-TT[i]) * t; }
    }
    return TT[TT.length-1];
  }
  var TA = [2000,3600,5200,6200,8000,12000,20000,45000];
  var TCtok = ["ember","orange","gold","white","bright","ice","blue","blue"];
  var TCrgb = []; for (var ti = 0; ti < TCtok.length; ti++) TCrgb.push(CT[TCtok[ti]] || CT.white);
  function starColorRGB(T) {
    if (T <= TA[0]) return TCrgb[0];
    if (T >= TA[TA.length-1]) return TCrgb[TCrgb.length-1];
    for (var i = 0; i < TA.length-1; i++) {
      if (T <= TA[i+1]) { var t = (T - TA[i]) / (TA[i+1] - TA[i]); return mixC(TCrgb[i], TCrgb[i+1], t); }
    }
    return TCrgb[TCrgb.length-1];
  }
  function classOf(T) {
    if (T >= 30000) return { c: "O", hex: P.blue };
    if (T >= 10000) return { c: "B", hex: P.blue };
    if (T >= 7500)  return { c: "A", hex: P.ice };
    if (T >= 6000)  return { c: "F", hex: P.bright };
    if (T >= 5200)  return { c: "G", hex: P.gold };
    if (T >= 3700)  return { c: "K", hex: P.orange };
    return { c: "M", hex: P.ember };
  }

  function remnantFor(M) {
    if (M < 0.08) return { type:"brown", name:"Brown dwarf", icon:"brown", col:P.ember, giantMul:1,
      fate:"Never ignites hydrogen fusion — a failed star that radiates leftover warmth and slowly fades for eternity." };
    if (M < 0.5) return { type:"hewd", name:"Helium white dwarf", icon:"wd", col:P.ice, giantMul:1,
      fate:"Burns for trillions of years, then exhausts its fuel and settles into a dense helium white dwarf." };
    if (M < 8) return { type:"cowd", name:"Carbon–oxygen white dwarf", icon:"wd", col:P.white, giantMul:3.4,
      fate:"Swells to a red giant, puffs off a planetary nebula, and leaves an Earth-sized C–O ember (~0.6 M☉)." };
    if (M < 20) return { type:"neutron", name:"Neutron star", icon:"neutron", col:P.cyan, giantMul:3.0,
      fate:"The iron core collapses and rebounds as a core-collapse supernova, leaving a ~20 km neutron star." };
    if (M < 40) return { type:"bh", name:"Black hole", icon:"bh", col:P.violet, giantMul:2.6,
      fate:"The core exceeds the neutron-star limit and collapses into a stellar-mass black hole, often with a supernova." };
    if (M < 130) return { type:"bhhyper", name:"Black hole", icon:"bh", col:P.violet, giantMul:1,
      fate:"Fierce winds strip its outer layers; the core collapses to a black hole, often via a stripped-envelope hypernova." };
    return { type:"pisn", name:"No remnant", icon:"none", col:P.rproc, giantMul:2.2,
      fate:"Pair-instability triggers a runaway that unbinds the whole star — a titanic blast leaving nothing (needs low metallicity)." };
  }

  function stagesFor(rt, clsHex, remHex) {
    switch (rt) {
      case "brown": return [ {label:"Protostar",w:0.6,type:"proto",col:P.muted},
        {label:"Contraction",w:2,type:"contract",col:P.ember},
        {label:"Brown dwarf",w:5,type:"cooling",col:P.ember} ];
      case "hewd": return [ {label:"Protostar",w:0.4,type:"proto",col:P.muted},
        {label:"Main sequence",w:7,type:"ms",col:clsHex},
        {label:"Blue dwarf",w:1.5,type:"bluedwarf",col:P.ice},
        {label:"Helium WD",w:2,type:"remnant",col:remHex} ];
      case "cowd": return [ {label:"Protostar",w:0.4,type:"proto",col:P.muted},
        {label:"Main sequence",w:5,type:"ms",col:clsHex},
        {label:"Red giant",w:1.6,type:"giant",col:P.orange},
        {label:"Planetary nebula",w:0.4,type:"pn",col:P.ice},
        {label:"White dwarf",w:2,type:"remnant",col:remHex} ];
      case "neutron": return [ {label:"Protostar",w:0.3,type:"proto",col:P.muted},
        {label:"Main sequence",w:4,type:"ms",col:clsHex},
        {label:"Red supergiant",w:1.2,type:"giant",col:P.ember},
        {label:"Supernova",w:0.18,type:"sn",col:P.gold},
        {label:"Neutron star",w:2,type:"remnant",col:remHex} ];
      case "bh": return [ {label:"Protostar",w:0.3,type:"proto",col:P.muted},
        {label:"Main sequence",w:3.4,type:"ms",col:clsHex},
        {label:"Supergiant",w:1,type:"giant",col:P.ember},
        {label:"Core collapse",w:0.18,type:"sn",col:P.gold},
        {label:"Black hole",w:2,type:"remnant",col:remHex} ];
      case "bhhyper": return [ {label:"Protostar",w:0.3,type:"proto",col:P.muted},
        {label:"Main sequence",w:3,type:"ms",col:clsHex},
        {label:"Wolf–Rayet",w:1,type:"wr",col:P.blue},
        {label:"Hypernova",w:0.2,type:"sn",col:P.gold},
        {label:"Black hole",w:2,type:"remnant",col:remHex} ];
      default: return [ {label:"Protostar",w:0.3,type:"proto",col:P.muted},
        {label:"Main sequence",w:3,type:"ms",col:clsHex},
        {label:"Swelling",w:1,type:"giant",col:P.ember},
        {label:"Pair-instability SN",w:0.4,type:"sn",col:P.gold},
        {label:"No remnant",w:1.2,type:"none",col:P.rproc} ];
    }
  }

  function computeStar(M) {
    var T = tempOf(M);
    var L = Math.pow(M, 3.5);
    var life = Math.max(1e10 * Math.pow(M, -2.5), 3e6);
    var cls = classOf(T);
    var rem = remnantFor(M);
    var rgb = starColorRGB(T);
    var isSub = M < 0.08;
    return {
      M: M, T: T, L: L, life: life, isSub: isSub,
      cls: cls.c, clsHex: cls.hex,
      rgb: rgb, rgbCss: rgbaC(rgb, 1),
      remType: rem.type, remName: rem.name, remIcon: rem.icon, remCol: rem.col, remFate: rem.fate,
      giantMul: rem.giantMul,
      stages: stagesFor(rem.type, cls.hex, rem.col)
    };
  }

  // ---- formatting ----
  function fmtMass(M) {
    if (M < 1) return M.toFixed(2);
    if (M < 10) return M.toFixed(1);
    return String(Math.round(M));
  }
  function formatL(L) {
    if (L >= 1e4 || L < 0.01) {
      var e = Math.floor(Math.log(L) / Math.LN10);
      var m = L / Math.pow(10, e);
      return m.toFixed(1) + "e" + e;
    }
    if (L >= 100) return String(Math.round(L));
    if (L >= 1) return L.toFixed(1);
    return L.toFixed(2);
  }
  function formatYr(y) {
    if (y >= 1e12) return (y/1e12).toFixed(y/1e12 < 10 ? 1 : 0) + " Tyr";
    if (y >= 1e9)  return (y/1e9).toFixed(y/1e9 < 10 ? 1 : 0) + " Gyr";
    if (y >= 1e6)  return (y/1e6).toFixed(y/1e6 < 10 ? 1 : 0) + " Myr";
    return (y/1e6).toFixed(2) + " Myr";
  }

  // ---- state ----
  var mass = 1;
  var star = computeStar(mass);
  var playing = false, playProg = 0, playDur = 7.0;
  var scrubbed = false, scrubProg = 1, finished = false;
  var DEFAULT_PROG = 0.32;

  // seeded decorative data
  var rnd = U.rng(97);
  var rays = []; for (var ri = 0; ri < 14; ri++) rays.push({ ang: ri/14*U.TAU, len: 0.55 + rnd()*0.45 });
  var debris = []; for (var di = 0; di < 12; di++) debris.push({ ang: rnd()*U.TAU, rad: 0.55 + rnd()*1.05, r: 0.6 + rnd()*1.4 });

  var layout = {};
  // font size derived from base fs; on narrow widths never render text below 11px
  function tfont(mult) {
    var s = layout.fs * mult;
    if (layout.narrow && s < 11) s = 11;
    return s;
  }
  function onResize(a) {
    var w = a.w, h = a.h;
    if (w < 2) return;
    var narrow = w < 560;
    var pad = U.clamp(w * 0.022, 8, 18);
    var tlH = U.clamp(h * 0.20, 46, 84);
    var tlY = h - tlH - pad;
    var mainTop = pad, mainBottom = tlY - 6;
    var mainH = mainBottom - mainTop;
    // base font: keep desktop (>=640) exactly as before; raise floor to 11 below that
    var fs = U.clamp(w * 0.0155, w < 640 ? 11 : 10, 13);
    if (narrow) {
      // stacked layout: star region on top, readout below, timeline at the bottom
      var innerW = w - pad * 2;
      var fsBigN = U.clamp(w * 0.085, 20, 34);
      var prN = U.clamp(innerW * 0.11, 14, 26);
      // conservative estimate of the readout block height so it never spills into the timeline
      var estReadoutH = fsBigN * 1.25 + 3 * (fs * 1.85) + 2 + fs * 1.3 +
        (prN * 1.5 + 2) + 5 * (fs * 1.35) + fs;
      var starH = mainH - estReadoutH - 8;
      if (starH < 84) starH = 84;
      if (starH > mainH * 0.5) starH = mainH * 0.5;
      var sarN = Math.min(innerW * 0.30, starH * 0.34);
      layout = {
        w: w, h: h, pad: pad, narrow: true,
        tlX: pad, tlY: tlY, tlW: w - pad*2, tlH: tlH,
        mainTop: mainTop, mainBottom: mainBottom, mainH: mainH,
        leftW: w,
        starCx: pad + innerW * 0.5,
        starCy: mainTop + starH * 0.5,
        areaR: sarN,
        minR: sarN * 0.16, maxR: sarN * 0.60, giantCapR: sarN * 1.0,
        panelX: pad, panelW: innerW,
        readoutTop: mainTop + starH + 6,
        stageLabelY: mainTop + starH - 3,
        fs: fs,
        fsBig: fsBigN
      };
    } else {
      var leftW = w * 0.46;
      var areaR = Math.min((leftW - pad*2) * 0.5, mainH * 0.40);
      var fsBig = U.clamp(mainH * 0.16, 22, 52);
      layout = {
        w: w, h: h, pad: pad, narrow: false,
        tlX: pad, tlY: tlY, tlW: w - pad*2, tlH: tlH,
        mainTop: mainTop, mainBottom: mainBottom, mainH: mainH,
        leftW: leftW,
        starCx: pad + (leftW - pad) * 0.5,
        starCy: mainTop + mainH * 0.5,
        areaR: areaR,
        minR: areaR * 0.16, maxR: areaR * 0.60, giantCapR: areaR * 1.0,
        panelX: leftW + pad * 0.5, panelW: w - (leftW + pad * 0.5) - pad,
        readoutTop: mainTop + fsBig * 0.4,
        stageLabelY: mainBottom - 2,
        fs: fs,
        fsBig: fsBig
      };
    }
    var sr = U.rng(Math.floor(w) * 131 + 7);
    var stars = [];
    var n = 46;
    for (var i = 0; i < n; i++) stars.push({ x: sr()*w, y: sr()*h, r: 0.4 + sr()*1.1, a: 0.12 + sr()*0.35 });
    layout.stars = stars;
  }

  var api = SN.canvas(host, onResize);
  api.canvas.style.touchAction = "pan-y";

  function msRadius() {
    var x = Math.log(mass) / Math.LN10;
    var nrm = U.map(x, Math.log(0.05)/Math.LN10, Math.log(150)/Math.LN10, 0, 1);
    return U.lerp(layout.minR, layout.maxR, U.clamp(nrm, 0, 1));
  }

  function stageAt(prog, stages) {
    var total = 0, i; for (i = 0; i < stages.length; i++) total += stages[i].w;
    var acc = 0, p = U.clamp(prog, 0, 0.99999) * total;
    for (i = 0; i < stages.length; i++) {
      if (p <= acc + stages[i].w) {
        return { i: i, f: (p - acc) / stages[i].w, stage: stages[i], x0: acc/total, x1: (acc+stages[i].w)/total };
      }
      acc += stages[i].w;
    }
    var last = stages.length - 1;
    return { i: last, f: 1, stage: stages[last], x0: (total-stages[last].w)/total, x1: 1 };
  }

  // ---- drawing primitives ----
  function drawSphere(ctx, cx, cy, r, col, bright) {
    if (r < 0.5) r = 0.5;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 2.8);
    g.addColorStop(0, rgbaC(col, 0.30 * bright));
    g.addColorStop(0.4, rgbaC(col, 0.12 * bright));
    g.addColorStop(1, rgbaC(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r * 2.8, 0, U.TAU); ctx.fill();
    ctx.restore();
    var hot = mixC(col, CT.white, 0.55 * Math.min(bright, 1.2));
    var cg = ctx.createRadialGradient(cx - r*0.28, cy - r*0.28, r*0.08, cx, cy, r);
    cg.addColorStop(0, rgbaC(hot, 1));
    cg.addColorStop(0.55, rgbaC(col, 1));
    cg.addColorStop(1, rgbaC(mixC(col, CT.ember, 0.3), 0.95));
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, U.TAU); ctx.fill();
  }
  function drawFlash(ctx, cx, cy, R, alpha, col) {
    if (SN.reducedMotion) alpha = Math.min(alpha, 0.5);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, rgbaC(CT.white, 0.9 * alpha));
    g.addColorStop(0.22, rgbaC(mixC(col, CT.gold, 0.4), 0.6 * alpha));
    g.addColorStop(0.55, rgbaC(col, 0.24 * alpha));
    g.addColorStop(1, rgbaC(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, U.TAU); ctx.fill();
    ctx.lineCap = "round";
    for (var i = 0; i < rays.length; i++) {
      var a = rays[i].ang, l = rays[i].len;
      ctx.strokeStyle = rgbaC(mixC(col, CT.gold, 0.5), 0.35 * alpha);
      ctx.lineWidth = R * 0.02 + 1;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a)*R*0.18, cy + Math.sin(a)*R*0.18);
      ctx.lineTo(cx + Math.cos(a)*R*0.95*l, cy + Math.sin(a)*R*0.95*l);
      ctx.stroke();
    }
    ctx.restore();
  }
  function drawNebula(ctx, cx, cy, R, alpha, col) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(cx, cy, R*0.5, cx, cy, R);
    g.addColorStop(0, rgbaC(col, 0));
    g.addColorStop(0.6, rgbaC(col, 0.20 * alpha));
    g.addColorStop(0.85, rgbaC(mixC(col, CT.magenta, 0.3), 0.26 * alpha));
    g.addColorStop(1, rgbaC(col, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function drawRemnantIcon(ctx, cx, cy, r, icon, colRgb, t) {
    if (r < 2) r = 2;
    switch (icon) {
      case "brown":
        drawSphere(ctx, cx, cy, r*0.85, mixC(colRgb, CT.ember, 0.3), 0.5);
        ctx.strokeStyle = rgbaC(mixC(colRgb, CT.panel, 0.4), 0.35);
        ctx.lineWidth = Math.max(1, r*0.06);
        for (var b = -1; b <= 1; b++) {
          ctx.beginPath(); ctx.arc(cx, cy, r*0.85, 0.2 + b*0.5, 1.0 + b*0.5); ctx.stroke();
        }
        break;
      case "wd":
        drawSphere(ctx, cx, cy, r*0.5, mixC(colRgb, CT.white, 0.4), 1.15);
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = rgbaC(colRgb, 0.18);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r*1.35, 0, U.TAU); ctx.stroke();
        ctx.restore();
        break;
      case "neutron":
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var ang = t * 1.4;
        for (var kk = 0; kk < 2; kk++) {
          var aa = ang + kk * Math.PI;
          var gx = ctx.createLinearGradient(cx, cy, cx + Math.cos(aa)*r*2.4, cy + Math.sin(aa)*r*2.4);
          gx.addColorStop(0, rgbaC(CT.cyan, 0.55));
          gx.addColorStop(1, rgbaC(CT.cyan, 0));
          ctx.strokeStyle = gx; ctx.lineWidth = r*0.16 + 1; ctx.lineCap = "round";
          ctx.beginPath(); ctx.moveTo(cx, cy);
          ctx.lineTo(cx + Math.cos(aa)*r*2.4, cy + Math.sin(aa)*r*2.4); ctx.stroke();
        }
        var vg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r*1.3);
        vg.addColorStop(0, rgbaC(CT.violet, 0.4)); vg.addColorStop(1, rgbaC(CT.violet, 0));
        ctx.fillStyle = vg; ctx.beginPath(); ctx.arc(cx, cy, r*1.3, 0, U.TAU); ctx.fill();
        ctx.restore();
        drawSphere(ctx, cx, cy, r*0.32, CT.cyan, 1.3);
        break;
      case "bh":
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        var og = ctx.createRadialGradient(cx, cy, r*0.6, cx, cy, r*1.9);
        og.addColorStop(0, rgbaC(CT.violet, 0.28));
        og.addColorStop(0.5, rgbaC(CT.orange, 0.14));
        og.addColorStop(1, rgbaC(CT.orange, 0));
        ctx.fillStyle = og; ctx.beginPath(); ctx.arc(cx, cy, r*1.9, 0, U.TAU); ctx.fill();
        ctx.save();
        ctx.translate(cx, cy); ctx.scale(1, 0.34);
        ctx.strokeStyle = rgbaC(mixC(CT.gold, CT.orange, 0.4), 0.7);
        ctx.lineWidth = r*0.16;
        ctx.beginPath(); ctx.arc(0, 0, r*1.25, 0, U.TAU); ctx.stroke();
        ctx.restore();
        ctx.restore();
        ctx.fillStyle = "#000";
        ctx.beginPath(); ctx.arc(cx, cy, r*0.72, 0, U.TAU); ctx.fill();
        ctx.strokeStyle = rgbaC(CT.gold, 0.9); ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(cx, cy, r*0.74, 0, U.TAU); ctx.stroke();
        break;
      case "none":
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        for (var d = 0; d < debris.length; d++) {
          var dd = debris[d];
          var px = cx + Math.cos(dd.ang) * r * dd.rad * 1.4;
          var py = cy + Math.sin(dd.ang) * r * dd.rad * 1.4;
          var dg = ctx.createRadialGradient(px, py, 0, px, py, dd.r * 2.2);
          dg.addColorStop(0, rgbaC(colRgb, 0.35));
          dg.addColorStop(1, rgbaC(colRgb, 0));
          ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(px, py, dd.r * 2.2, 0, U.TAU); ctx.fill();
        }
        ctx.restore();
        break;
    }
  }

  // ---- star viz (birth->remnant morph) ----
  function drawStarViz(ctx, cx, cy, prog, t) {
    var st = stageAt(prog, star.stages);
    var type = st.stage.type, f = st.f;
    var msR = msRadius();
    var giantR = Math.min(msR * star.giantMul, layout.giantCapR);
    var col = star.rgb, r = msR, bright = 1, twk = 1;
    if (type === "ms" || type === "proto" || type === "giant" || type === "wr" ||
        type === "contract" || type === "cooling" || type === "bluedwarf") {
      twk = 1 + Math.sin(t * 2.2) * 0.012;
    }
    switch (type) {
      case "proto":
        r = msR * (0.5 + 0.5 * f); col = mixC(star.rgb, CT.ember, 0.45 * (1 - f)); bright = 0.5 + 0.5 * f;
        drawSphere(ctx, cx, cy, r * twk, col, bright); break;
      case "ms":
        drawSphere(ctx, cx, cy, msR * twk, star.rgb, 1.0); break;
      case "contract":
        r = msR * (1 - 0.45 * f); col = mixC(star.rgb, CT.ember, 0.5); bright = 0.85 - 0.4 * f;
        drawSphere(ctx, cx, cy, r, col, bright); break;
      case "cooling":
        r = msR * (0.62 - 0.2 * f); col = mixC(star.rgb, CT.ember, 0.55); bright = 0.42 - 0.16 * f;
        drawSphere(ctx, cx, cy, r, col, bright); break;
      case "bluedwarf":
        r = msR * (1 - 0.15 * f); col = mixC(star.rgb, CT.ice, 0.2 + 0.4 * f); bright = 0.9;
        drawSphere(ctx, cx, cy, r, col, bright); break;
      case "giant":
        r = U.lerp(msR, giantR, U.easeOut(f)); col = mixC(star.rgb, CT.ember, 0.1 + 0.55 * f); bright = 1.05;
        drawSphere(ctx, cx, cy, r * twk, col, bright); break;
      case "wr":
        r = U.lerp(msR, msR * 0.62, f); col = mixC(CT.blue, CT.white, 0.25); bright = 1.2;
        drawSphere(ctx, cx, cy, r * twk, col, bright); break;
      case "pn":
        var nebR = U.lerp(giantR * 0.9, giantR * 2.4, f);
        drawNebula(ctx, cx, cy, nebR, (1 - f * 0.6), CT.ice);
        var coreR = U.lerp(giantR * 0.45, msR * 0.2, U.easeOut(f));
        drawSphere(ctx, cx, cy, coreR, mixC(CT.ice, CT.white, 0.5), 1.2);
        break;
      case "sn":
        var peak = f < 0.45 ? (f / 0.45) : (1 - (f - 0.45) / 0.55);
        var fireR = U.lerp(Math.max(giantR, msR) * 0.9, layout.areaR * 1.95, U.easeOut(f));
        drawFlash(ctx, cx, cy, fireR, U.clamp(peak, 0, 1), star.remCol === P.gold ? CT.gold : mixC(CT.orange, CT.gold, 0.4));
        var coreDim = msR * 0.16 * (1 - f);
        if (coreDim > 0.5) drawSphere(ctx, cx, cy, coreDim, CT.white, 0.6);
        break;
      case "remnant":
        var s = U.easeOut(f);
        var remR = U.clamp(layout.areaR * 0.30, 12, 60);
        drawRemnantIcon(ctx, cx, cy, remR * (0.6 + 0.4 * s), star.remIcon, CT[iconTok(star.remCol)] || star.rgb, t);
        break;
      case "none":
        var dR = U.clamp(layout.areaR * 0.5, 20, 80) * (0.8 + 0.5 * f);
        drawRemnantIcon(ctx, cx, cy, dR, "none", CT.rproc, t);
        break;
    }
    return st;
  }
  function iconTok(hex) {
    for (var kk in P) { if (P[kk] === hex) return kk; }
    return "white";
  }

  // ---- text ----
  function wrapText(ctx, text, x, y, maxW, lh) {
    var words = text.split(" "), line = "", yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i]; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy + lh;
  }

  function drawReadout(ctx) {
    var px = layout.panelX, pw = layout.panelW, fs = layout.fs, fsB = layout.fsBig;
    var y = layout.readoutTop;
    var glyph = star.isSub ? "BD" : star.cls;
    var glCol = star.isSub ? CT.ember : hexToRgb(star.clsHex);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    var gg = ctx.createRadialGradient(px + fsB*0.4, y + fsB*0.35, 0, px + fsB*0.4, y + fsB*0.35, fsB*1.1);
    gg.addColorStop(0, rgbaC(glCol, 0.28)); gg.addColorStop(1, rgbaC(glCol, 0));
    ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(px + fsB*0.4, y + fsB*0.35, fsB*1.1, 0, U.TAU); ctx.fill();
    ctx.restore();
    ctx.textBaseline = "alphabetic"; ctx.textAlign = "left";
    ctx.font = "600 " + fsB + "px ui-monospace, monospace";
    ctx.fillStyle = rgbaC(glCol, 1);
    ctx.fillText(glyph, px, y + fsB * 0.78);
    ctx.font = tfont(0.82) + "px ui-monospace, monospace";
    ctx.fillStyle = P.muted;
    ctx.fillText(star.isSub ? "SUB-STELLAR" : "SPECTRAL CLASS", px + fsB * 1.5, y + fsB * 0.38);
    ctx.fillStyle = P.ink;
    ctx.font = fs + "px ui-monospace, monospace";
    ctx.fillText((star.isSub ? "~" : "") + (Math.round(star.T/100)*100) + " K", px + fsB * 1.5, y + fsB * 0.78);

    var ry = y + fsB * 1.25;
    var lh = fs * 1.85;
    var rows = [
      ["MASS", fmtMass(mass) + " M☉", CT.bright],
      ["LUMINOSITY", formatL(star.L) + " L☉", CT.gold],
      ["LIFETIME (MS)", star.isSub ? "no fusion" : formatYr(star.life), CT.ice]
    ];
    for (var i = 0; i < rows.length; i++) {
      ctx.font = tfont(0.82) + "px ui-monospace, monospace";
      ctx.fillStyle = P.muted;
      ctx.fillText(rows[i][0], px, ry);
      ctx.font = tfont(1.08) + "px ui-monospace, monospace";
      ctx.fillStyle = rgbaC(rows[i][2], 1);
      var vw = ctx.measureText(rows[i][1]).width;
      ctx.fillText(rows[i][1], px + pw - vw, ry);
      ry += lh;
    }
    ctx.strokeStyle = rgbaC(CT.muted, 0.28); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, ry - lh*0.35); ctx.lineTo(px + pw, ry - lh*0.35); ctx.stroke();
    ry += 2;
    ctx.font = tfont(0.82) + "px ui-monospace, monospace";
    ctx.fillStyle = P.muted;
    ctx.fillText("FINAL FATE", px, ry);
    ry += fs * 1.3;
    var pr = U.clamp(pw * 0.11, 14, 26);
    drawRemnantIcon(ctx, px + pr, ry + pr * 0.4, pr, star.remIcon, CT[iconTok(star.remCol)] || star.rgb, 0);
    ctx.font = "600 " + tfont(1.12) + "px ui-monospace, monospace";
    ctx.fillStyle = star.remCol;
    var remNameX = px + pr * 2 + 6;
    var remNameMaxW = px + pw - remNameX;
    var remNameStr = star.remName;
    // keep the remnant name inside the panel on narrow widths
    if (layout.narrow && ctx.measureText(remNameStr).width > remNameMaxW) {
      while (remNameStr.length > 1 && ctx.measureText(remNameStr + "…").width > remNameMaxW) {
        remNameStr = remNameStr.slice(0, -1);
      }
      remNameStr = remNameStr.replace(/[\s–-]+$/, "") + "…";
    }
    ctx.fillText(remNameStr, remNameX, ry + pr * 0.2);
    ry += pr * 1.5 + 2;
    ctx.font = tfont(0.92) + "px ui-monospace, monospace";
    ctx.fillStyle = P.ink;
    wrapText(ctx, star.remFate, px, ry, pw, fs * 1.35);
  }

  function drawTimeline(ctx, prog) {
    var x0 = layout.tlX, y0 = layout.tlY, w = layout.tlW, h = layout.tlH, fs = layout.fs;
    var barY = y0 + h * 0.42, barH = h * 0.36;
    ctx.font = tfont(0.82) + "px ui-monospace, monospace";
    ctx.textAlign = "left"; ctx.fillStyle = P.muted;
    ctx.fillText("LIFE STAGES · log time", x0, y0 + fs * 0.85);
    ctx.textAlign = "right"; ctx.fillText("remnant", x0 + w, y0 + fs * 0.85);
    var stages = star.stages, total = 0, i;
    for (i = 0; i < stages.length; i++) total += stages[i].w;
    var cur = stageAt(prog, stages);
    var acc = 0;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    for (i = 0; i < stages.length; i++) {
      var sx = x0 + (acc/total) * w;
      var sw = (stages[i].w/total) * w;
      var isCur = (i === cur.i);
      var c = hexToRgb(stages[i].col);
      ctx.fillStyle = rgbaC(c, isCur ? 0.42 : 0.20);
      ctx.fillRect(sx + 0.5, barY, sw - 1, barH);
      if (isCur) { ctx.fillStyle = rgbaC(c, 0.95); ctx.fillRect(sx + 0.5, barY - 2, sw - 1, 2); }
      ctx.font = tfont(0.8) + "px ui-monospace, monospace";
      if (sw > ctx.measureText(stages[i].label).width + 8) {
        ctx.fillStyle = isCur ? P.bright : P.ink;
        ctx.fillText(stages[i].label, sx + sw/2, barY + barH/2);
      }
      acc += stages[i].w;
    }
    ctx.strokeStyle = rgbaC(CT.muted, 0.35); ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, barY + 0.5, w - 1, barH - 1);
    var phx = x0 + U.clamp(prog, 0, 1) * w;
    ctx.strokeStyle = rgbaC(CT.bright, 0.9); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(phx, barY - 5); ctx.lineTo(phx, barY + barH + 4); ctx.stroke();
    ctx.fillStyle = P.bright;
    ctx.beginPath();
    ctx.moveTo(phx, barY - 5); ctx.lineTo(phx - 4, barY - 11); ctx.lineTo(phx + 4, barY - 11); ctx.closePath(); ctx.fill();
    ctx.textBaseline = "alphabetic";
  }

  // ---- main tick ----
  function displayProg() {
    return playing ? playProg : (scrubbed ? scrubProg : DEFAULT_PROG);
  }

  SN.loop(host, function (dt, t) {
    var ctx = api.ctx, w = api.w, h = api.h;
    if (w < 2 || h < 2) return;
    if (!layout.w || layout.w !== w || layout.h !== h) onResize(api);
    try {
      if (playing) {
        var spd = SN.reducedMotion ? (1 / (playDur * 1.6)) : (1 / playDur);
        playProg += dt * spd;
        if (playProg >= 1) { playProg = 1; playing = false; finished = true; scrubbed = true; scrubProg = 1; if (playBtn) playBtn.textContent = "Play life ▶"; }
      }
      var bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, P.panel); bg.addColorStop(1, P.bg);
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      var stars = layout.stars || [];
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var tw = 0.6 + 0.4 * Math.sin(t * 0.8 + i);
        ctx.fillStyle = rgbaC(CT.ink, s.a * tw);
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, U.TAU); ctx.fill();
      }
      ctx.restore();

      var prog = displayProg();
      var st = drawStarViz(ctx, layout.starCx, layout.starCy, prog, t);
      ctx.textAlign = "center"; ctx.font = "600 " + tfont(0.95) + "px ui-monospace, monospace";
      ctx.fillStyle = st.stage.col;
      ctx.fillText(st.stage.label, layout.starCx, layout.stageLabelY);
      ctx.textAlign = "left";

      drawReadout(ctx);
      drawTimeline(ctx, prog);
    } catch (err) { /* one bad frame won't kill the loop */ }
  });

  // ---- controls ----
  var slider, playBtn;
  function setMass(M) {
    mass = U.clamp(M, 0.05, 150);
    star = computeStar(mass);
    scrubbed = false; finished = false;
  }
  function fmtSlider(v) { return fmtMass(Math.pow(10, v)) + " M☉"; }

  if (controls) {
    slider = SN.slider({
      label: "Mass", min: Math.log(0.05)/Math.LN10, max: Math.log(150)/Math.LN10, step: 0.001,
      value: Math.log(1)/Math.LN10, format: fmtSlider,
      oninput: function (v) { setMass(Math.pow(10, v)); }
    });
    controls.appendChild(slider);

    playBtn = SN.el("button.btn.primary", { text: "Play life ▶", onclick: function () {
      if (playing) { playing = false; playBtn.textContent = "Play life ▶"; }
      else { playProg = 0; playing = true; scrubbed = false; finished = false; playBtn.textContent = "Playing…"; }
    } });
    controls.appendChild(SN.el("div.grp", {}, playBtn));

    var presets = [ [0.2, "0.2 red dwarf"], [1, "1 Sun"], [8, "8 threshold"], [25, "25 black hole"], [150, "150 pair-instab."] ];
    var chipRow = SN.el("div.grp", {});
    for (var pi = 0; pi < presets.length; pi++) {
      (function (pm, label) {
        var chip = SN.el("button.chip", { text: label, onclick: function () {
          setMass(pm);
          if (slider) { slider._input.value = Math.log(pm)/Math.LN10; if (slider._out) slider._out.textContent = fmtSlider(Math.log(pm)/Math.LN10); }
          playing = false; if (playBtn) playBtn.textContent = "Play life ▶";
        } });
        chipRow.appendChild(chip);
      })(presets[pi][0], presets[pi][1]);
    }
    controls.appendChild(chipRow);
  }

  // ---- pointer: scrub the timeline ----
  var scrubbing = false;
  function tlProgFromX(clientX) {
    var rct = api.canvas.getBoundingClientRect();
    var x = clientX - rct.left;
    return U.clamp((x - layout.tlX) / layout.tlW, 0, 1);
  }
  function inTimeline(clientY) {
    var rct = api.canvas.getBoundingClientRect();
    var y = clientY - rct.top;
    return y >= layout.tlY - 8;
  }
  api.canvas.addEventListener("pointerdown", function (e) {
    if (!layout.w) return;
    if (inTimeline(e.clientY)) {
      scrubbing = true; playing = false; scrubbed = true;
      if (playBtn) playBtn.textContent = "Play life ▶";
      scrubProg = tlProgFromX(e.clientX);
      if (e.pointerType === "touch") e.preventDefault();
    }
  });
  api.canvas.addEventListener("pointermove", function (e) {
    if (scrubbing) { scrubProg = tlProgFromX(e.clientX); if (e.pointerType === "touch") e.preventDefault(); }
  });
  function endScrub() { scrubbing = false; }
  api.canvas.addEventListener("pointerup", endScrub);
  api.canvas.addEventListener("pointercancel", endScrub);
  api.canvas.addEventListener("pointerleave", endScrub);
});

/* ---- widget: planetary --------------------------------------------------- */
SN.mount("planetary", function (host, controls) {
  var P = SN.palette, U = SN.u;

  // ---- color helpers ---------------------------------------------------
  function hx(h){ h = h.replace("#",""); return [parseInt(h.substr(0,2),16), parseInt(h.substr(2,2),16), parseInt(h.substr(4,2),16)]; }
  function mixRGB(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
  function rs(c,a){ return "rgba("+(c[0]|0)+","+(c[1]|0)+","+(c[2]|0)+","+a+")"; }

  var EMBER=hx(P.ember), ORANGE=hx(P.orange), GOLD=hx(P.gold), WHITE=hx(P.white),
      BLUE=hx(P.blue), ICE=hx(P.ice), VIOLET=hx(P.violet), CYAN=hx(P.cyan),
      GREEN=hx(P.green), MAGENTA=hx(P.magenta), RPROC=hx(P.rproc),
      INK=hx(P.ink), MUTED=hx(P.muted), BRIGHT=hx(P.bright), BG=hx(P.bg);

  // blackbody-ish surface tint from temperature (K)
  var TS = [
    [2200, EMBER],
    [3200, mixRGB(EMBER,ORANGE,0.55)],
    [3800, ORANGE],
    [4600, mixRGB(ORANGE,GOLD,0.6)],
    [5600, GOLD],
    [6400, WHITE],
    [9000, BLUE],
    [30000, ICE],
    [110000, mixRGB(ICE,VIOLET,0.55)]
  ];
  function starRGB(T){
    if(T<=TS[0][0]) return TS[0][1];
    var n=TS.length;
    if(T>=TS[n-1][0]) return TS[n-1][1];
    for(var i=0;i<n-1;i++){
      if(T<=TS[i+1][0]){
        var t=(T-TS[i][0])/(TS[i+1][0]-TS[i][0]);
        return mixRGB(TS[i][1],TS[i+1][1],t);
      }
    }
    return TS[n-1][1];
  }

  function commas(n){
    n=Math.round(n); var s=""+n, o="", c=0;
    for(var i=s.length-1;i>=0;i--){ o=s.charAt(i)+o; if(++c%3===0 && i>0) o=","+o; }
    return o;
  }
  function fmtR(R){ if(R>=10) return R.toFixed(0); if(R>=1) return R.toFixed(1); return R.toFixed(3); }
  function fmtRe(Re){ if(Re>=100) return commas(Re); if(Re>=10) return Re.toFixed(0); return Re.toFixed(1); }

  // ---- evolutionary keyframes (radius R in R_sun, surface T in K) -------
  // s = on-screen radius as a fraction of the reference unit (schematic).
  var KF = [
    {p:0.00, R:1,     T:5772,   s:0.052},
    {p:0.12, R:1.6,   T:5400,   s:0.066},
    {p:0.22, R:11,    T:4700,   s:0.16},
    {p:0.30, R:170,   T:3300,   s:0.40},
    {p:0.34, R:170,   T:3300,   s:0.40},   // He flash: surface unchanged
    {p:0.38, R:12,    T:4950,   s:0.15},   // horizontal branch shrink
    {p:0.46, R:70,    T:3400,   s:0.30},
    {p:0.54, R:200,   T:3050,   s:0.40},
    {p:0.62, R:320,   T:2900,   s:0.46},   // AGB tip
    {p:0.66, R:120,   T:6000,   s:0.30},   // envelope lifting off
    {p:0.70, R:0.9,   T:35000,  s:0.060},  // core emerging
    {p:0.78, R:0.045, T:100000, s:0.032},  // hot central star of PN
    {p:0.86, R:0.02,  T:92000,  s:0.026},
    {p:1.00, R:0.013, T:55000,  s:0.022}   // white dwarf
  ];
  function sample(pp){
    pp = U.clamp(pp,0,1);
    for(var i=0;i<KF.length-1;i++){
      var A=KF[i], B=KF[i+1];
      if(pp<=B.p || i===KF.length-2){
        var t=(pp-A.p)/(B.p-A.p); if(t<0)t=0; if(t>1)t=1;
        var lr=Math.log(A.R)+(Math.log(B.R)-Math.log(A.R))*t;
        return { R:Math.exp(lr), T:A.T+(B.T-A.T)*t, s:A.s+(B.s-A.s)*t };
      }
    }
    var L=KF[KF.length-1]; return {R:L.R,T:L.T,s:L.s};
  }

  // ---- phases ----------------------------------------------------------
  var PH = [
    {a:0.00, t:"MAIN SEQUENCE",            s:"Hydrogen fuses to helium in the core.",     d:"~10 billion yr", n:"Main sequence"},
    {a:0.12, t:"RED GIANT",                s:"A hydrogen shell swells the envelope.",     d:"~1 billion yr",  n:"Red giant"},
    {a:0.30, t:"HELIUM FLASH",             s:"Degenerate core ignites helium — hidden inside.", d:"runaway in seconds", n:"Helium flash"},
    {a:0.38, t:"HELIUM-CORE BURNING",      s:"Horizontal branch: steady He → C.",    d:"~100 million yr",n:"He-core burning"},
    {a:0.46, t:"ASYMPTOTIC GIANT BRANCH",  s:"Thermal pulses drive a dusty carbon wind.", d:"~1–5 million yr", n:"AGB pulses"},
    {a:0.62, t:"SUPERWIND",                s:"The whole envelope is ejected at 20–30 km/s.", d:"~10,000 yr", n:"Superwind"},
    {a:0.70, t:"PLANETARY NEBULA",         s:"The bare 100,000 K core lights the shell.", d:"~10,000 yr",    n:"Planetary nebula"},
    {a:0.86, t:"WHITE DWARF",              s:"Earth-sized ember, ~0.6 M☉, cooling on.", d:"trillions of yr", n:"White dwarf"}
  ];
  var TLC = [P.gold,P.orange,P.rproc,P.gold,P.ember,P.magenta,P.green,P.ice];
  function phaseIdx(pp){ var k=0; for(var i=0;i<PH.length;i++){ if(pp>=PH[i].a) k=i; } return k; }

  // ---- canvas / state --------------------------------------------------
  var api = SN.canvas(host, onResize);
  api.canvas.style.touchAction = "pan-y";
  var ctx = api.ctx;
  var p = 0, playing = true, ended = false, speed = 0.032;
  var timeAcc = 0, coolT = 0, planetAngle = 0;
  var cx=0, cy=0, refUnit=1;
  var tlx=0, tly=0, tlw=1, dragging=false;

  if(SN.reducedMotion){ playing = false; p = 0.78; }

  // static backdrop starfield
  var STARS = [];
  (function(){ var r=U.rng(71); for(var i=0;i<110;i++){ STARS.push({x:r(),y:r(),z:0.4+r()*0.9,tw:r()*6.28}); } })();
  // nebula knots (procedural texture)
  var KNOTS = [];
  (function(){ var r=U.rng(24); for(var i=0;i<52;i++){ KNOTS.push({ang:r()*6.283, rad:r(), sz:0.6+r()*1.8, hue:r(), ph:r()*6.283}); } })();
  // AGB dust-wind particles
  var DUST = [];
  (function(){ var r=U.rng(9); for(var i=0;i<90;i++){ DUST.push({ang:r()*6.283, r:r()*1.2, sp:0.05+r()*0.10, sz:0.8+r()*1.6, y:0.55+r()*0.5}); } })();

  function onResize(a){ layout(a.w, a.h); }
  function layout(w,h){ cx=w*0.5; cy=h*0.455; refUnit=Math.min(w*0.82, h*0.92); }

  // ---- controls --------------------------------------------------------
  var bar = controls;
  if(!bar){
    bar = SN.el("div",{});
    bar.style.cssText = "position:absolute;left:8px;right:8px;bottom:8px;display:flex;gap:8px;flex-wrap:wrap;z-index:2";
    host.style.position = host.style.position || "relative";
    host.appendChild(bar);
  }
  var btnPlay = SN.el("button.btn.primary",{ onclick:togglePlay }, playing?"Pause":"Play");
  function updatePlay(){ btnPlay.textContent = playing ? "Pause" : (ended ? "Replay" : "Play"); }
  function togglePlay(){
    if(ended){ p=0; ended=false; coolT=0; playing=true; }
    else playing=!playing;
    updatePlay();
  }
  var sl = SN.slider({
    label:"Phase", min:0, max:1000, step:1, value:Math.round(p*1000),
    format:function(v){ return PH[phaseIdx(v/1000)].n; },
    oninput:function(v){ p=v/1000; playing=false; ended=(p>=1); coolT=0; updatePlay(); }
  });
  var grp = SN.el("div.grp",{}, btnPlay);
  grp.style.cssText = "display:flex;align-items:center;gap:8px";
  bar.appendChild(grp);
  bar.appendChild(sl);

  // ---- pointer scrub on timeline --------------------------------------
  function scrubAt(clientX){
    var r=api.canvas.getBoundingClientRect();
    var x=clientX-r.left;
    p=U.clamp((x-tlx)/tlw,0,1); playing=false; ended=(p>=1); coolT=0; updatePlay();
  }
  api.canvas.addEventListener("pointerdown", function(e){
    var r=api.canvas.getBoundingClientRect();
    var y=e.clientY-r.top;
    if(y>=tly-16 && y<=tly+18){ dragging=true; scrubAt(e.clientX); e.preventDefault(); }
  });
  api.canvas.addEventListener("pointermove", function(e){ if(dragging){ scrubAt(e.clientX); e.preventDefault(); } });
  window.addEventListener("pointerup", function(){ dragging=false; });

  // ---- star rendering --------------------------------------------------
  function drawStar(x,y,r,T,glowMul){
    var col=starRGB(T), bright=mixRGB(col,WHITE,0.55);
    var halo = r*3.2 + refUnit*0.018*glowMul + (T>15000 ? refUnit*0.14 : 0);
    ctx.globalCompositeOperation="lighter";
    var g=ctx.createRadialGradient(x,y,r*0.3, x,y,halo);
    g.addColorStop(0, rs(bright, 0.50*glowMul));
    g.addColorStop(0.35, rs(col, 0.22*glowMul));
    g.addColorStop(1, rs(col,0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(x,y,halo,0,6.2832); ctx.fill();
    ctx.globalCompositeOperation="source-over";
    var bg=ctx.createRadialGradient(x-r*0.28,y-r*0.28,r*0.05, x,y,r);
    bg.addColorStop(0, rs(bright,1));
    bg.addColorStop(0.7, rs(col,1));
    bg.addColorStop(1, rs(mixRGB(col,BG,0.45),1));
    ctx.fillStyle=bg; ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fill();
  }

  function drawNebula(pp){
    if(pp<0.615) return;
    var ej=U.clamp((pp-0.62)/0.38,0,1);
    var nebR=refUnit*(0.16+ej*1.15);
    var ion=U.clamp((pp-0.66)/0.05,0,1) * (1 - U.clamp((pp-0.86)/0.12,0,1)*0.82);
    var a=0.06 + ion*0.40;
    ctx.save();
    ctx.translate(cx,cy); ctx.scale(1,0.90);
    ctx.globalCompositeOperation="lighter";
    var g=ctx.createRadialGradient(0,0,nebR*0.30, 0,0,nebR);
    g.addColorStop(0.00, rs(CYAN,0));
    g.addColorStop(0.42, rs(CYAN, a*0.80));
    g.addColorStop(0.58, rs(GREEN, a*0.95));
    g.addColorStop(0.80, rs(EMBER, a*0.75));
    g.addColorStop(1.00, rs(EMBER,0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(0,0,nebR,0,6.2832); ctx.fill();
    // ionization-front rim
    ctx.strokeStyle=rs(mixRGB(GREEN,WHITE,0.3), a*0.5); ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.arc(0,0,nebR*0.62,0,6.2832); ctx.stroke();
    // faint older outer shell
    ctx.strokeStyle=rs(EMBER, a*0.28); ctx.lineWidth=1;
    ctx.beginPath(); ctx.arc(0,0,nebR*1.02,0,6.2832); ctx.stroke();
    // knots
    for(var i=0;i<KNOTS.length;i++){
      var k=KNOTS[i], rr=nebR*(0.5+k.rad*0.46);
      var tw=SN.reducedMotion?0.7:(0.4+0.6*(0.5+0.5*Math.sin(timeAcc*2+k.ph)));
      var kc=mixRGB(CYAN,EMBER,k.hue);
      ctx.fillStyle=rs(kc, a*tw*0.7);
      ctx.beginPath(); ctx.arc(Math.cos(k.ang)*rr, Math.sin(k.ang)*rr, k.sz*(1+ej*0.8), 0, 6.2832); ctx.fill();
    }
    ctx.restore();
    ctx.globalCompositeOperation="source-over";
  }

  function updateDust(dt){
    var active = (p>=0.46 && p<0.70);
    if(!active) return;
    var mul = SN.reducedMotion?0.3:1;
    for(var i=0;i<DUST.length;i++){
      var d=DUST[i]; d.r += d.sp*dt*mul;
      if(d.r>1.35){ d.r = 0.04 + d.r*0; d.r=0.04+ (i%17)*0.002; }
    }
  }
  function drawDust(){
    if(p<0.46 || p>=0.70) return;
    var act = U.smooth(U.clamp((p-0.46)/0.06,0,1)) * (1-U.clamp((p-0.66)/0.04,0,1));
    ctx.globalCompositeOperation="lighter";
    for(var i=0;i<DUST.length;i++){
      var d=DUST[i], rr=d.r*refUnit*0.95;
      var x=cx+Math.cos(d.ang)*rr, y=cy+Math.sin(d.ang)*rr*0.9;
      var fade=(1-d.r/1.35);
      ctx.fillStyle=rs(mixRGB(EMBER,MUTED,0.4), 0.10*fade*act);
      ctx.beginPath(); ctx.arc(x,y,d.sz*(1+d.r*1.2),0,6.2832); ctx.fill();
    }
    ctx.globalCompositeOperation="source-over";
  }

  function drawPlanet(sr){
    if(p>=0.72) return;
    var orbitR=refUnit*0.30;
    var orbA=(1-U.clamp((p-0.60)/0.10,0,1))*0.45;
    if(orbA<=0.01) return;
    // orbit ellipse
    ctx.strokeStyle=rs(BLUE,orbA); ctx.lineWidth=1;
    if(ctx.setLineDash) ctx.setLineDash([4,5]);
    ctx.beginPath();
    for(var a=0;a<=6.2832+0.05;a+=0.12){
      var x=cx+Math.cos(a)*orbitR, y=cy+Math.sin(a)*orbitR*0.34;
      if(a===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    if(ctx.setLineDash) ctx.setLineDash([]);
    var px=cx+Math.cos(planetAngle)*orbitR, py=cy+Math.sin(planetAngle)*orbitR*0.34;
    var engulfed = sr > orbitR*0.86;
    if(!engulfed){
      ctx.globalCompositeOperation="lighter";
      ctx.fillStyle=rs(ICE,0.35*orbA/0.45);
      ctx.beginPath(); ctx.arc(px,py,5,0,6.2832); ctx.fill();
      ctx.globalCompositeOperation="source-over";
      ctx.fillStyle=rs(mixRGB(ICE,WHITE,0.4),1);
      ctx.beginPath(); ctx.arc(px,py,2.4,0,6.2832); ctx.fill();
      if(sr>orbitR*0.5){ callout(px,py, refUnit*0.10,-refUnit*0.10, ["inner planet","about to be engulfed"], P.ice, "left"); }
    }
  }

  // ---- overlay text ----------------------------------------------------
  function callout(x,y,dx,dy,lines,colHex,align){
    var c=hx(colHex);
    ctx.strokeStyle=rs(c,0.5); ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+dx,y+dy); ctx.stroke();
    ctx.fillStyle=rs(c,0.9); ctx.beginPath(); ctx.arc(x,y,2.2,0,6.2832); ctx.fill();
    var tx=x+dx+(align==="right"?-6:6), ty=y+dy;
    ctx.textAlign=align||"left"; ctx.textBaseline="middle";
    for(var i=0;i<lines.length;i++){
      ctx.font=(i===0?"600 ":"")+(i===0?12:11)+"px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle=rs(i===0?BRIGHT:INK,0.92);
      ctx.fillText(lines[i], tx, ty+i*14);
    }
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
  }

  function drawOverlay(w,h,R,T){
    var idx=phaseIdx(p), ph=PH[idx];
    var titleSize=U.clamp(Math.round(w*0.026),13,22);
    var subSize=U.clamp(Math.round(w*0.017),10,13);
    var ms=U.clamp(Math.round(w*0.016),10,12);

    // phase title, top-left
    ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    ctx.font="700 "+titleSize+"px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle=rs(BRIGHT,0.96);
    ctx.fillText(ph.t, 16, 20+titleSize*0.7);
    ctx.font=subSize+"px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle=rs(INK,0.82);
    ctx.fillText(ph.s, 16, 20+titleSize*0.7+subSize+8);
    ctx.fillStyle=rs(MUTED,0.85);
    ctx.font=ms+"px ui-monospace, monospace";
    ctx.fillText("duration ≈ "+ph.d, 16, 20+titleSize*0.7+subSize+8+ms+6);

    // readouts, top-right (tabular)
    var Re=R*109.2;
    var lines=[
      "R = "+fmtR(R)+" Rsun",
      "    "+fmtRe(Re)+" REarth",
      "T = "+commas(T)+" K"
    ];
    ctx.textAlign="right";
    ctx.font=ms+"px ui-monospace, monospace";
    for(var i=0;i<lines.length;i++){
      ctx.fillStyle=rs(i===2?ICE:INK, 0.9);
      ctx.fillText(lines[i], w-16, 18+i*(ms+5));
    }
    ctx.textAlign="left";

    // size-scale note, bottom-left
    ctx.fillStyle=rs(MUTED,0.75);
    ctx.font=ms+"px ui-monospace, monospace";
    ctx.fillText("scale: red giant ~300 Rsun → white dwarf ~0.013 Rsun  (~20,000×)", 16, tly+16);

    // phase-specific spatial callouts
    if(p>=0.30 && p<0.38){
      var f=1-Math.abs((p-0.34)/0.04);
      var col=rs(mixRGB(CYAN,WHITE,0.3), 0.4+0.5*f);
      ctx.strokeStyle=col; ctx.lineWidth=1;
      ctx.beginPath(); ctx.arc(cx,cy, refUnit*0.05, 0, 6.2832); ctx.stroke();
      callout(cx,cy, refUnit*0.12, refUnit*0.14, ["helium flash — hidden","core reaches 100,000,000 K"], P.cyan, "left");
    }
    if(p>=0.62 && p<0.70){
      callout(cx-refUnit*0.30, cy, -refUnit*0.02, -refUnit*0.20, ["superwind","envelope drifts out at 20–30 km/s"], P.magenta, "left");
    }
    if(p>=0.70 && p<0.90){
      var ny=cy-refUnit*0.62;
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.font="600 "+subSize+"px ui-sans-serif, system-ui, sans-serif";
      ctx.fillStyle=rs(GREEN,0.9);
      ctx.fillText("PLANETARY NEBULA — not planets; lasts ~10,000 yr", cx, ny);
      ctx.textAlign="left"; ctx.textBaseline="alphabetic";
    }
    if(p>=0.86){
      callout(cx,cy, refUnit*0.16, refUnit*0.16,
        ["white dwarf: Earth-sized, ~0.6 M☉","1 cm³ ≈ 1 tonne","cools for trillions of yr → black dwarf"],
        P.ice, "left");
    }
  }

  // ---- timeline --------------------------------------------------------
  function drawTimeline(w,h){
    var margin=w*0.06;
    tlx=margin; tlw=w-2*margin; tly=h-18;
    var tlh=6;
    ctx.fillStyle=rs(hx(P.panel),0.9);
    ctx.fillRect(tlx-2, tly-2, tlw+4, tlh+4);
    for(var i=0;i<PH.length;i++){
      var a=PH[i].a, b=(i<PH.length-1?PH[i+1].a:1);
      var x1=tlx+a*tlw, x2=tlx+b*tlw;
      var cur=(phaseIdx(p)===i);
      ctx.fillStyle=rs(hx(TLC[i]), cur?0.95:0.42);
      ctx.fillRect(x1+0.5, tly, (x2-x1)-1, tlh);
    }
    var mx=tlx+p*tlw;
    ctx.strokeStyle=rs(BRIGHT,0.9); ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.moveTo(mx,tly-6); ctx.lineTo(mx,tly+tlh+6); ctx.stroke();
    ctx.fillStyle=rs(WHITE,1); ctx.beginPath(); ctx.arc(mx,tly+tlh*0.5,3.2,0,6.2832); ctx.fill();
    ctx.fillStyle=rs(MUTED,0.7);
    ctx.font="9px ui-monospace, monospace"; ctx.textAlign="left";
    ctx.fillText("log time →  (each phase far shorter than the last)", tlx, tly-9);
    ctx.textAlign="left";
  }

  // ---- main loop -------------------------------------------------------
  function tick(dt,t){
    timeAcc+=dt;
    if(playing && !SN.reducedMotion){
      p+=dt*speed;
      if(p>=1){ p=1; playing=false; ended=true; updatePlay(); }
    }
    if(p>=0.999){ coolT+=dt; } else { coolT=0; }
    updateDust(dt);
    if(!SN.reducedMotion) planetAngle+=dt*0.55;

    var w=api.w, h=api.h;
    if(w<2||h<2) return;
    layout(w,h);

    // background
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle=P.bg; ctx.fillRect(0,0,w,h);
    var vg=ctx.createRadialGradient(cx,cy,refUnit*0.1, cx,cy,Math.max(w,h)*0.7);
    vg.addColorStop(0, rs(hx(P.panel),0.5)); vg.addColorStop(1, rs(BG,0));
    ctx.fillStyle=vg; ctx.fillRect(0,0,w,h);

    // starfield
    for(var i=0;i<STARS.length;i++){
      var st=STARS[i];
      var tw=SN.reducedMotion?0.6:(0.4+0.6*(0.5+0.5*Math.sin(timeAcc*1.5+st.tw)));
      ctx.fillStyle=rs(INK, 0.12*st.z*tw);
      ctx.fillRect(st.x*w, st.y*(h-30), st.z*1.2, st.z*1.2);
    }

    var S=sample(p);
    var T=S.T;
    if(coolT>0) T=Math.max(4200, S.T*Math.exp(-coolT*0.02));
    var glowMul=1;
    var sr=S.s*refUnit;
    if(p>=0.46 && p<0.62 && !SN.reducedMotion){
      glowMul=1+0.40*(0.5+0.5*Math.sin(timeAcc*1.6));
      sr*=1+0.04*Math.sin(timeAcc*2.2);
    }
    if(p>=0.70) glowMul*=1.3;
    if(sr<1.2) sr=1.2;

    drawNebula(p);
    drawDust();
    drawPlanet(sr);
    drawStar(cx,cy,sr,T,glowMul);

    drawOverlay(w,h,S.R,T);
    drawTimeline(w,h);

    if(sl){ sl._input.value=Math.round(p*1000); if(sl._out) sl._out.textContent=PH[phaseIdx(p)].n; }
  }

  var L=SN.loop(host, tick);
  L.start();
  updatePlay();
});

/* ---- widget: collapse ---------------------------------------------------- */
SN.mount("collapse", function (host, controls) {
  var pal = SN.palette, u = SN.u, TAU = u.TAU;
  var clamp = u.clamp, lerp = u.lerp, smooth = u.smooth, easeOut = u.easeOut;

  // ---------- state ----------
  var stageIndex = 0, stageProgress = 0, playing = false, stepPause = false;
  var type = "II";
  var LAST = 9;
  var narrowW = false; // set every frame in draw()

  var STAGES = [
    { t: "Silicon burning", b: "A star above 8 M☉ fuses ever-heavier ash in nested shells. Each stage burns faster: carbon lasts centuries, neon about a year, oxygen months, silicon a single day." },
    { t: "Iron core — 1.4 M☉", b: "The ash builds an inert iron core that reaches the Chandrasekhar mass, 1.4 M☉ — Earth-sized yet as heavy as the Sun. Fusing iron costs energy, so the fire ends." },
    { t: "Pressure vanishes", b: "Gamma rays photodisintegrate the iron back to helium, and electrons are captured onto protons. Both drain the degeneracy pressure holding the core up." },
    { t: "Implosion", b: "With nothing to resist gravity, the core falls inward in under a second — the inner core reaching up to 0.25c, a quarter of light speed." },
    { t: "Nuclear density — bounce", b: "The inner core slams into nuclear density, 2.7×10¹⁴ g/cm³, becomes incompressible, and rebounds like a struck anvil — launching a shock wave outward." },
    { t: "The shock stalls", b: "The shock spends its energy tearing apart the iron still raining in, and stalls a few hundred km out. For a heartbeat the explosion has failed." },
    { t: "Neutrinos revive it", b: "A flood of neutrinos — carrying 99% of the released energy — pours out of the hot proto-neutron star over ~1 s and re-heats the stalled shock." },
    { t: "Shock breakout", b: "Reborn, the shock tears outward through the onion shells and blasts the star's envelope off at thousands of km/s." },
    { t: "The flash", b: "For weeks the debris blazes near 10⁹ L☉ — a single dying star that briefly rivals its entire galaxy." },
    { t: "The remnant", b: "Left behind: a ~12 km neutron star (or, above ~25 M☉, a black hole). The light we see is only the sparkle atop the neutrino iceberg." }
  ];
  var DUR = [3.2, 2.6, 2.4, 1.7, 2.0, 3.2, 3.0, 1.9, 2.7, 3.4];

  var C_H = pal.ember, C_HE = pal.orange, C_C = pal.gold, C_ONE = "#fff1cf", C_SI = "#bfe0ff", C_FE = "#9aa3bd";
  var SHELLS = [
    { n: "H",    full: "Hydrogen",     col: C_H,   Lout: 3.0,   clk: "envelope" },
    { n: "He",   full: "Helium",       col: C_HE,  Lout: 1.48,  clk: "shell" },
    { n: "C",    full: "Carbon",       col: C_C,   Lout: 0.30,  clk: "~ centuries" },
    { n: "O/Ne", full: "Oxygen/Neon",  col: C_ONE, Lout: -0.52, clk: "Ne ~1 yr · O ~mo" },
    { n: "Si",   full: "Silicon",      col: C_SI,  Lout: -1.30, clk: "~ 1 day" },
    { n: "Fe",   full: "Iron core",    col: C_FE,  Lout: -2.10, clk: "inert · 1.4 M☉" }
  ];
  // shortened burn labels for narrow gutters (keep the info, drop the words that overflow)
  var SCLK = { "H": "envelope", "He": "shell", "C": "centuries", "O/Ne": "Ne 1yr O mo", "Si": "1 day", "Fe": "1.4 M☉" };
  var LMIN = -2.7;

  // particle direction tables (no per-frame alloc)
  var NP = 96, pAng = new Array(NP), pR0 = new Array(NP), pJit = new Array(NP);
  var rnd = u.rng(20871);
  for (var qi = 0; qi < NP; qi++) { pAng[qi] = rnd() * TAU; pR0[qi] = rnd(); pJit[qi] = 0.55 + rnd() * 0.9; }

  // ---------- canvas ----------
  var api = SN.canvas(host, function () {});
  api.canvas.style.touchAction = "pan-y";
  var ctx = api.ctx;
  var lastDots = [];

  // font floor helper: on narrow widths, never render on-canvas text below 11px.
  // On wide widths this is identical to clamp() so desktop is byte-for-byte unchanged.
  function ff(base, lo, hi) {
    var L = lo, H = hi;
    if (narrowW) { if (L < 11) L = 11; if (H < L) H = L; }
    return clamp(base, L, H);
  }

  // ---------- controls ----------
  var playBtn, stepBtn, replayBtn, chips = {};
  var cbar = controls;
  var fallback = false;
  if (!cbar) {
    fallback = true;
    cbar = SN.el("div", {});
    cbar.style.position = "absolute"; cbar.style.left = "8px"; cbar.style.bottom = "8px";
    cbar.style.display = "flex"; cbar.style.gap = "6px"; cbar.style.flexWrap = "wrap"; cbar.style.zIndex = "5";
    host.style.position = "relative";
    host.appendChild(cbar);
  }
  function styleFallback(btn) {
    if (!fallback) return;
    btn.style.font = "600 12px system-ui, sans-serif";
    btn.style.color = pal.ink; btn.style.background = u.rgba(pal.panel, 0.9);
    btn.style.border = "1px solid " + u.rgba(pal.ink, 0.25);
    btn.style.borderRadius = "6px"; btn.style.padding = "5px 9px"; btn.style.cursor = "pointer";
  }
  var g1 = SN.el("div.grp");
  playBtn = SN.el("button.btn.primary", { onclick: onPlay }, "Play");
  stepBtn = SN.el("button.btn", { onclick: onStep }, "Step");
  replayBtn = SN.el("button.btn", { onclick: onReplay }, "Replay");
  styleFallback(playBtn); styleFallback(stepBtn); styleFallback(replayBtn);
  g1.appendChild(playBtn); g1.appendChild(stepBtn); g1.appendChild(replayBtn);
  cbar.appendChild(g1);
  var g2 = SN.el("div.grp");
  ["II", "Ib", "Ic"].forEach(function (tp) {
    var c = SN.el("button.chip" + (tp === "II" ? " on" : ""), { onclick: function () { setType(tp); } }, "SN " + tp);
    styleFallback(c);
    chips[tp] = c; g2.appendChild(c);
  });
  cbar.appendChild(g2);

  function updateButtons() {
    if (playBtn) playBtn.textContent = playing ? "Pause" : "Play";
    for (var k in chips) if (chips.hasOwnProperty(k)) {
      var on = (k === type);
      chips[k].className = "chip" + (on ? " on" : "");
      if (fallback) { chips[k].style.background = on ? u.rgba(pal.cyan, 0.22) : u.rgba(pal.panel, 0.9); chips[k].style.borderColor = on ? u.rgba(pal.cyan, 0.6) : u.rgba(pal.ink, 0.25); }
    }
  }
  function setType(tp) { type = tp; updateButtons(); }
  function onPlay() {
    if (playing) { playing = false; stepPause = false; }
    else { if (stageIndex === LAST && stageProgress >= 1) { stageIndex = 0; stageProgress = 0; } playing = true; stepPause = false; }
    updateButtons();
  }
  function onStep() {
    if (stageProgress < 1) { playing = true; stepPause = true; }
    else if (stageIndex < LAST) { stageIndex++; stageProgress = 0; playing = true; stepPause = true; }
    else { stageIndex = 0; stageProgress = 0; playing = true; stepPause = true; }
    updateButtons();
  }
  function onReplay() { stageIndex = 0; stageProgress = 0; playing = true; stepPause = false; updateButtons(); }
  updateButtons();

  // pointer: jump via timeline dots
  api.canvas.addEventListener("pointerdown", function (e) {
    var r = api.canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top;
    for (var i = 0; i < lastDots.length; i++) {
      var d = lastDots[i];
      var dx = x - d.x, dy = y - d.y;
      if (dx * dx + dy * dy <= d.r * d.r * 6) {
        stageIndex = d.i; stageProgress = 1; playing = false; stepPause = false; updateButtons(); return;
      }
    }
  });

  // ---------- update ----------
  function stageDur(i) { return DUR[i] * (SN.reducedMotion ? 1.6 : 1); }
  function update(dt) {
    if (!playing) return;
    stageProgress += dt / stageDur(stageIndex);
    if (stageProgress >= 1) {
      stageProgress = 1;
      if (stepPause) { playing = false; stepPause = false; }
      else if (stageIndex < LAST) { stageIndex++; stageProgress = 0; }
      else { playing = false; }
      updateButtons();
    }
  }

  // ---------- draw helpers ----------
  function rr(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function txt(s, x, y, font, col, align, base) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = align || "left"; ctx.textBaseline = base || "alphabetic";
    ctx.fillText(s, x, y);
  }
  function wrap(s, x, y, maxW, lh, font, col) {
    ctx.font = font; ctx.fillStyle = col; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    var words = s.split(" "), line = "", yy = y;
    for (var i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, x, yy); line = words[i]; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, x, yy);
    return yy;
  }
  function glowDisk(cx, cy, r, col, aIn, aOut) {
    if (r <= 0) return;
    var g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, u.rgba(col, aIn));
    g.addColorStop(1, u.rgba(col, aOut));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
  }
  function surfaceL() { return type === "II" ? 3.0 : (type === "Ib" ? 1.48 : 0.30); }
  function firstShell() { return type === "II" ? 0 : (type === "Ib" ? 1 : 2); }

  var MONO = "px ui-monospace, ui-monospace, monospace";
  var SANS = "px system-ui, -apple-system, sans-serif";

  // ---------- dynamics ----------
  function dyn(si, sp) {
    var d = { coreN: 0.34, coreCol: C_FE, shockN: 0, shockA: 0, neu: 0, infall: 0, flash: 0, vel: 0, phase: "", remnant: false, lum: 0 };
    if (si <= 1) { d.coreN = 0.34; }
    else if (si === 2) { d.coreN = lerp(0.34, 0.28, smooth(sp)); d.neu = 0.14; d.phase = "e⁻ capture"; }
    else if (si === 3) { d.coreN = lerp(0.28, 0.06, sp * sp); d.vel = 0.25 * smooth(sp); d.infall = 1; d.phase = "IMPLOSION"; }
    else if (si === 4) { d.coreN = 0.05; d.coreCol = pal.cyan; d.shockN = lerp(0.05, 0.24, easeOut(sp)); d.shockA = 1; d.flash = Math.max(0, 1 - sp * 1.5) * 0.45; d.neu = 0.3; d.phase = "BOUNCE"; }
    else if (si === 5) { d.coreN = 0.05; d.coreCol = pal.cyan; d.shockN = lerp(0.24, 0.60, easeOut(sp)); d.shockA = lerp(1, 0.20, smooth(sp)); d.neu = 0.3; d.phase = "STALL"; }
    else if (si === 6) { d.coreN = 0.05; d.coreCol = pal.cyan; d.shockN = lerp(0.56, 0.74, smooth(sp)); d.shockA = lerp(0.20, 1, smooth(sp)); d.neu = 1; d.phase = "ν REVIVAL"; }
    else if (si === 7) { d.coreN = 0.045; d.coreCol = pal.cyan; d.shockN = lerp(0.74, 1.28, easeOut(sp)); d.shockA = 1; d.neu = 0.5; d.phase = "BREAKOUT"; }
    else if (si === 8) { d.coreN = 0.045; d.coreCol = pal.cyan; d.shockN = 1.35; d.flash = smooth(Math.min(1, sp * 1.6)); d.lum = smooth(Math.min(1, sp * 1.6)); d.phase = "FLASH"; }
    else { d.coreN = 0.03; d.coreCol = pal.cyan; d.remnant = true; d.flash = (1 - smooth(Math.min(1, sp * 1.5))) * 0.4; d.phase = "NEUTRON STAR"; }
    return d;
  }

  // ---------- main draw ----------
  function draw(t) {
    var w = api.w, h = api.h;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, w, h);

    narrowW = w < 560;

    var pad = clamp(Math.min(w, h) * 0.03, 6, 16);
    var fBase = clamp(w / 62, 8.5, 13);

    // caption band
    var si = stageIndex, sp = stageProgress;
    var st = STAGES[si];
    var cy0;
    if (narrowW) {
      // narrow: measured caption so bigger (>=11px) text never overlaps the panels
      var sf = ff(fBase * 0.82, 8, 12);
      var tf = Math.max(11.5, fBase * 1.35);
      var bf2 = 11;
      var cyw = pad + sf + 2;
      txt("STAGE " + si + " / " + LAST, pad, cyw, "700 " + sf.toFixed(1) + MONO, u.rgba(pal.muted, 0.9));
      cyw += tf + 4;
      txt(st.t, pad, cyw, "700 " + tf.toFixed(1) + SANS, pal.bright);
      cyw += bf2 + 6;
      var endY = wrap(st.b, pad, cyw, w - pad * 2, bf2 * 1.34, "400 " + bf2.toFixed(1) + SANS, pal.ink);
      cy0 = endY + pad + 4;
    } else {
      var capH = clamp(h * 0.28, 46, 96);
      txt("STAGE " + si + " / " + LAST, pad, pad + fBase, "700 " + (fBase * 0.82).toFixed(1) + MONO, u.rgba(pal.muted, 0.9));
      txt(st.t, pad, pad + fBase * 2.35, "700 " + (fBase * 1.35).toFixed(1) + SANS, pal.bright);
      wrap(st.b, pad, pad + fBase * 3.9, w - pad * 2, fBase * 1.42, "400 " + (fBase * 0.98).toFixed(1) + SANS, pal.ink);
      cy0 = pad + capH;
    }

    // timeline dots (top-right of caption)
    lastDots.length = 0;
    var tlN = LAST + 1;
    var tlR = clamp(fBase * 0.28, 3, 5);
    var tlGap = clamp(w * 0.018, tlR * 2.4, 26);
    var tlW = (tlN - 1) * tlGap;
    var tlX = w - pad - tlW;
    var tlY = pad + tlR + 2;
    for (var di = 0; di < tlN; di++) {
      var dx = tlX + di * tlGap;
      ctx.beginPath(); ctx.arc(dx, tlY, tlR, 0, TAU);
      if (di === si) { ctx.fillStyle = pal.gold; ctx.fill(); ctx.beginPath(); ctx.arc(dx, tlY, tlR + 2.5, 0, TAU); ctx.strokeStyle = u.rgba(pal.gold, 0.4); ctx.lineWidth = 1; ctx.stroke(); }
      else if (di < si) { ctx.fillStyle = u.rgba(pal.ink, 0.55); ctx.fill(); }
      else { ctx.strokeStyle = u.rgba(pal.muted, 0.6); ctx.lineWidth = 1; ctx.stroke(); }
      lastDots.push({ x: dx, y: tlY, r: tlR, i: di });
    }

    // content layout
    var contentH = h - cy0 - pad;
    if (contentH < 40) return;
    var gap = pad;

    var onionR, collR, enR;
    if (narrowW) {
      // stack the two columns vertically: onion on top, collapse scene + energy beneath
      var fullW = w - pad * 2;
      var enH = clamp(contentH * 0.28, 104, 150);
      var remain = contentH - enH - gap * 2;
      if (remain < 80) { enH = Math.max(88, contentH * 0.28); remain = contentH - enH - gap * 2; }
      var onH = Math.max(84, remain * 0.46);
      var coH = remain - onH;
      if (coH < 70) { coH = Math.max(70, remain * 0.5); onH = remain - coH; }
      onionR = { x: pad, y: cy0, w: fullW, h: onH };
      collR = { x: pad, y: cy0 + onH + gap, w: fullW, h: coH };
      enR = { x: pad, y: cy0 + onH + gap + coH + gap, w: fullW, h: enH };
    } else {
      var leftW = (w - pad * 2 - gap) * 0.46;
      var rightX = pad + leftW + gap;
      var rightW = w - pad - rightX;
      var collapseH = contentH * 0.60;
      var energyH = contentH - collapseH - gap;
      onionR = { x: pad, y: cy0, w: leftW, h: contentH };
      collR = { x: rightX, y: cy0, w: rightW, h: collapseH };
      enR = { x: rightX, y: cy0 + collapseH + gap, w: rightW, h: energyH };
    }

    // panels
    ctx.fillStyle = u.rgba(pal.panel, 0.55); ctx.strokeStyle = u.rgba(pal.ink, 0.08); ctx.lineWidth = 1;
    rr(onionR.x, onionR.y, onionR.w, onionR.h, 8); ctx.fill(); ctx.stroke();
    rr(collR.x, collR.y, collR.w, collR.h, 8); ctx.fill(); ctx.stroke();
    rr(enR.x, enR.y, enR.w, enR.h, 8); ctx.fill(); ctx.stroke();

    var d = dyn(si, sp);
    drawOnion(onionR, si, sp, d, fBase, t);
    drawCollapse(collR, si, sp, d, fBase, t);
    drawEnergy(enR, si, fBase);

    // global flash overlay (soft, no strobe)
    if (d.flash > 0.01) {
      var fa = d.flash * (SN.reducedMotion ? 0.5 : 0.72);
      var cx = collR.x + collR.w * 0.5, ccy = collR.y + collR.h * 0.5;
      var fg = ctx.createRadialGradient(cx, ccy, 0, cx, ccy, Math.max(w, h) * 0.9);
      fg.addColorStop(0, u.rgba(pal.white, 0.5 * fa));
      fg.addColorStop(0.4, u.rgba(pal.gold, 0.22 * fa));
      fg.addColorStop(1, u.rgba(pal.gold, 0));
      ctx.fillStyle = fg; ctx.fillRect(0, 0, w, h);
    }
  }

  // ---------- onion ----------
  function drawOnion(R, si, sp, d, fB, t) {
    var gW = clamp(R.w * 0.34, 58, 108);
    var availW = R.w - gW;
    var rad = Math.min(availW, R.h) * 0.5 - 6;
    if (rad < 12) { gW = 0; availW = R.w; rad = Math.min(availW, R.h) * 0.5 - 6; }
    var cx = R.x + gW + availW * 0.5;
    var cy = R.y + R.h * 0.5;
    var R0 = clamp(rad * 0.10, 5, 12);
    var Lmax = surfaceL();
    var fs = firstShell();

    function pr(L) { return R0 + (L - LMIN) / (Lmax - LMIN) * (rad - R0); }

    var gAlpha = si >= 9 ? 0.5 : 1;
    var ejF = si === 8 ? smooth(sp) : (si >= 9 ? 1 : 0);

    // draw shells outer->inner
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, rad + 1, 0, TAU); ctx.clip();
    for (var i = fs; i < SHELLS.length; i++) {
      var sh = SHELLS[i];
      var Lout = Math.min(sh.Lout, Lmax);
      var rout = pr(Lout);
      var push = (i <= fs + 1) ? (1 + 0.18 * ejF) : 1;
      var alpha = (i <= fs + 1) ? (1 - 0.5 * ejF) : 1;
      glowDisk(cx, cy, rout * push, sh.col, 0.92 * gAlpha * alpha, 0.62 * gAlpha * alpha);
      ctx.beginPath(); ctx.arc(cx, cy, rout * push, 0, TAU);
      ctx.strokeStyle = u.rgba("#000000", 0.22 * gAlpha); ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();

    // macro shock ring through the onion (breakout)
    var osf = -1;
    if (si === 7) osf = lerp(0.08, 0.78, easeOut(sp));
    else if (si === 8) osf = lerp(0.78, 1.32, sp);
    if (osf > 0 && osf < 1.32) {
      var orr = osf * rad;
      ctx.beginPath(); ctx.arc(cx, cy, orr, 0, TAU);
      ctx.strokeStyle = u.rgba(pal.gold, 0.9 * (1 - osf * 0.5)); ctx.lineWidth = clamp(rad * 0.03, 2, 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cy, orr, 0, TAU);
      ctx.strokeStyle = u.rgba(pal.orange, 0.35); ctx.lineWidth = clamp(rad * 0.09, 4, 12); ctx.stroke();
    }

    // remnant dot post-explosion
    if (si >= 9) {
      var pulse = SN.reducedMotion ? 1 : (0.85 + 0.15 * Math.sin(t * 3));
      glowDisk(cx, cy, R0 * 1.6 * pulse, pal.cyan, 0.9, 0);
      ctx.beginPath(); ctx.arc(cx, cy, Math.max(2, R0 * 0.4), 0, TAU); ctx.fillStyle = pal.white; ctx.fill();
    }

    // legend gutter
    if (gW > 20) {
      var rows = SHELLS.length - fs;
      var lx = R.x + 8;
      var top = R.y + clamp(R.h * 0.06, 6, 16);
      var bot = R.y + R.h - clamp(R.h * 0.10, 14, 26);
      var rh = (bot - top) / rows;
      var activeIdx = (si === 0) ? 4 : 5; // Si then Fe
      var lf = ff(fB * 0.82, 8.5, 11.5);
      var clkF = narrowW ? 11 : (lf * 0.82);
      for (var j = fs; j < SHELLS.length; j++) {
        var s2 = SHELLS[j];
        var ry = top + (j - fs) * rh + rh * 0.5;
        var hot = (j === activeIdx && si <= 6);
        // swatch
        ctx.fillStyle = u.rgba(s2.col, 0.95);
        ctx.beginPath(); ctx.arc(lx + 5, ry - lf * 0.35, 4.5, 0, TAU); ctx.fill();
        if (hot) { ctx.beginPath(); ctx.arc(lx + 5, ry - lf * 0.35, 7, 0, TAU); ctx.strokeStyle = u.rgba(s2.col, 0.6); ctx.lineWidth = 1; ctx.stroke(); }
        txt(s2.n, lx + 15, ry - lf * 0.05, (hot ? "700 " : "600 ") + lf.toFixed(1) + SANS, hot ? pal.bright : pal.ink);
        txt(narrowW ? SCLK[s2.n] : s2.clk, lx + 15, ry + lf * 0.95, clkF.toFixed(1) + MONO, hot ? u.rgba(s2.col, 0.95) : pal.muted);
      }
      // acceleration punch
      txt("collapse: < 1 s", lx, R.y + R.h - clamp(R.h * 0.02, 4, 8), "700 " + ff(fB * 0.82, 8.5, 11).toFixed(1) + MONO, si >= 1 ? pal.ember : u.rgba(pal.ember, 0.7));
    }

    // title
    txt("THE ONION — log radius", R.x + 8, R.y + R.h + 0.5, "", "rgba(0,0,0,0)"); // no-op guard
  }

  // ---------- collapse inset ----------
  function drawCollapse(R, si, sp, d, fB, t) {
    var cx = R.x + R.w * 0.5;
    var cyc = R.y + R.h * 0.5;
    var rad = Math.min(R.w, R.h) * 0.5 - 8;
    if (rad < 10) return;
    ctx.save();
    ctx.beginPath(); rr(R.x + 1, R.y + 1, R.w - 2, R.h - 2, 7); ctx.clip();

    // faint field
    ctx.strokeStyle = u.rgba(pal.ink, 0.06); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cyc, rad, 0, TAU); ctx.stroke();

    var coreR = Math.max(2, d.coreN * rad);

    // infall particles
    if (d.infall > 0 && !SN.reducedMotion) {
      for (var a = 0; a < NP; a += 2) {
        var fr = (t * 1.1 + pR0[a]) % 1;
        var pr2 = coreR + (1 - fr) * (rad * 1.2 - coreR);
        var px = cx + Math.cos(pAng[a]) * pr2, py = cyc + Math.sin(pAng[a]) * pr2;
        ctx.fillStyle = u.rgba(pal.ice, 0.5 * fr);
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // stalled shock: dashed marker + inward pressure
    if (si === 5) {
      var sr = d.shockN * rad;
      var pulse = SN.reducedMotion ? 0 : Math.sin(t * 4) * 0.5 + 0.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath(); ctx.arc(cx, cyc, sr, 0, TAU);
      ctx.strokeStyle = u.rgba(pal.ember, 0.4 + 0.35 * (1 - sp)); ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([]);
      // inward-pressure ticks
      for (var b = 0; b < 8; b++) {
        var ang = b / 8 * TAU;
        var r1 = sr + 8 + pulse * 4, r2 = sr + 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ang) * r1, cyc + Math.sin(ang) * r1);
        ctx.lineTo(cx + Math.cos(ang) * r2, cyc + Math.sin(ang) * r2);
        ctx.strokeStyle = u.rgba(pal.ember, 0.5); ctx.lineWidth = 1.5; ctx.stroke();
      }
      txt("STALL", cx, cyc - sr - clamp(fB, 10, 14), "700 " + ff(fB * 0.95, 9, 12).toFixed(1) + MONO, pal.ember, "center");
    }

    // active shock ring
    if (d.shockN > 0 && d.shockN < 1.3 && si !== 5) {
      var srr = d.shockN * rad;
      var pu = (si === 6 && !SN.reducedMotion) ? (0.9 + 0.1 * Math.sin(t * 5)) : 1;
      glowDisk(cx, cyc, srr, pal.orange, 0, 0); // guard
      ctx.beginPath(); ctx.arc(cx, cyc, srr, 0, TAU);
      ctx.strokeStyle = u.rgba(pal.gold, 0.95 * d.shockA * pu); ctx.lineWidth = clamp(rad * 0.035, 2, 5); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, cyc, srr, 0, TAU);
      ctx.strokeStyle = u.rgba(pal.orange, 0.32 * d.shockA); ctx.lineWidth = clamp(rad * 0.11, 4, 13); ctx.stroke();
    }

    // neutrinos streaming out
    if (d.neu > 0.02) {
      var count = Math.floor(NP * (0.4 + 0.6 * d.neu));
      var tt = SN.reducedMotion ? t * 0.4 : t;
      for (var c2 = 0; c2 < count; c2++) {
        var frn = (tt * pJit[c2] * 0.7 + pR0[c2]) % 1;
        var rn = coreR + frn * (rad * 1.18 - coreR);
        var nx = cx + Math.cos(pAng[c2]) * rn, ny = cyc + Math.sin(pAng[c2]) * rn;
        var al = d.neu * (1 - frn) * 0.85;
        ctx.fillStyle = u.rgba((c2 % 3 === 0) ? pal.violet : pal.cyan, al);
        ctx.fillRect(nx - 1, ny - 1, 2, 2);
      }
    }

    // core / proto-NS
    glowDisk(cx, cyc, coreR * (d.remnant ? 3.2 : 2.0), d.coreCol, d.remnant ? 0.85 : 0.55, 0);
    ctx.beginPath(); ctx.arc(cx, cyc, coreR, 0, TAU);
    ctx.fillStyle = u.rgba(d.coreCol, 0.95); ctx.fill();
    if (si >= 4) { ctx.beginPath(); ctx.arc(cx, cyc, Math.max(1.5, coreR * 0.5), 0, TAU); ctx.fillStyle = u.rgba(pal.white, 0.9); ctx.fill(); }

    ctx.restore();

    // phase pill
    if (d.phase) {
      var pf = ff(fB * 0.9, 9, 12);
      ctx.font = "700 " + pf.toFixed(1) + MONO;
      var pw = ctx.measureText(d.phase).width + 14;
      var pcol = (si === 5) ? pal.ember : (si === 6 ? pal.cyan : (si === 8 ? pal.gold : pal.ink));
      ctx.fillStyle = u.rgba(pcol, 0.16);
      rr(R.x + 8, R.y + 8, pw, pf + 8, 4); ctx.fill();
      txt(d.phase, R.x + 8 + 7, R.y + 8 + pf + 1, "700 " + pf.toFixed(1) + MONO, pcol, "left");
    }

    // big stat
    var big = null, sub = null, bcol = pal.bright;
    if (si === 1) { big = "1.4 M☉"; sub = "Chandrasekhar · Earth-sized"; }
    else if (si === 3) { big = (0.25 * smooth(sp)).toFixed(2) + " c"; sub = "core infall speed"; bcol = pal.ice; }
    else if (si === 4) { big = "2.7×10¹⁴"; sub = "g/cm³ · nuclear density"; bcol = pal.cyan; }
    else if (si === 8) { big = "10⁹ L☉"; sub = "rivals its galaxy"; bcol = pal.gold; }
    else if (si === 9) { big = "12 km"; sub = "neutron star"; bcol = pal.cyan; }
    if (big) {
      var fadeA = clamp(si === 3 ? 1 : (sp < 0.15 ? sp / 0.15 : 1), 0, 1);
      var bf = ff(fB * 1.9, 16, 30);
      txt(big, cx, cyc - rad * 0.42, "800 " + bf.toFixed(1) + MONO, u.rgba(bcol, 0.95 * fadeA), "center", "middle");
      txt(sub, cx, cyc - rad * 0.42 + bf * 0.85, ff(fB * 0.82, 8.5, 11).toFixed(1) + SANS, u.rgba(pal.muted, fadeA), "center", "middle");
    }

    // readouts (mono, bottom)
    var rf = ff(fB * 0.82, 8.5, 11).toFixed(1);
    var densS = si >= 4 ? "2.7×10¹⁴ g/cm³" : (si >= 2 ? "10¹³ g/cm³" : "10⁹ g/cm³");
    var velS = "v " + (d.vel).toFixed(2) + "c";
    if (narrowW) {
      // stack the left readout and the right annotation on separate lines so neither clips/overlaps
      var annot = null, acol = null;
      if (si === 9) { annot = "(≳ 25 M☉ → black hole)"; acol = u.rgba(pal.violet, 0.85); }
      else if (si >= 6 && si <= 8) { annot = "SN 1987A: ν ~3 h before light"; acol = u.rgba(pal.cyan, 0.8); }
      var by = R.y + R.h - 8;
      if (annot) { txt(annot, R.x + 8, by, rf + MONO, acol, "left"); by -= (parseFloat(rf) + 4); }
      txt(velS + "   ρ " + densS, R.x + 8, by, rf + MONO, u.rgba(pal.ink, 0.85));
    } else {
      txt(velS + "   ρ " + densS, R.x + 8, R.y + R.h - 8, rf + MONO, u.rgba(pal.ink, 0.85));
      if (si === 9) txt("(≳ 25 M☉ → black hole)", R.x + R.w - 8, R.y + R.h - 8, rf + MONO, u.rgba(pal.violet, 0.85), "right");
      else if (si >= 6 && si <= 8) txt("SN 1987A: ν ~3 h before light", R.x + R.w - 8, R.y + R.h - 8, rf + MONO, u.rgba(pal.cyan, 0.8), "right");
    }
  }

  // ---------- energy budget ----------
  function drawEnergy(R, si, fB) {
    var pf = ff(fB * 0.92, 9, 12.5);
    var barX = R.x + 10;
    var barW = R.w - 20;

    if (narrowW) {
      // stacked, top-down layout so all the right-side text fits inside the panel
      txt("ENERGY BUDGET — total ≈ 3×10⁴⁶ J", barX, R.y + pf + 6, "700 " + pf.toFixed(1) + MONO, pal.bright);
      var barH = clamp(R.h * 0.16, 10, 16);
      var barY = R.y + pf + 12;
      var nvW = barW * 0.99;
      var gg = ctx.createLinearGradient(barX, 0, barX + nvW, 0);
      gg.addColorStop(0, u.rgba(pal.cyan, 0.9));
      gg.addColorStop(1, u.rgba(pal.violet, 0.9));
      ctx.fillStyle = gg; rr(barX, barY, nvW, barH, 3); ctx.fill();
      var keX = barX + nvW, keW = Math.max(2, barW * 0.01);
      ctx.fillStyle = u.rgba(pal.orange, 0.95); rr(keX, barY, keW, barH, 1.5); ctx.fill();
      ctx.strokeStyle = u.rgba(pal.ink, 0.15); ctx.lineWidth = 1; rr(barX, barY, barW, barH, 3); ctx.stroke();

      var lf = ff(fB * 0.80, 8, 10.8);
      var ly = barY + barH + lf + 6;
      txt("ν neutrinos  99%  ·  3×10⁴⁶ J", barX, ly, "700 " + lf.toFixed(1) + MONO, u.rgba(pal.ice, 0.95));
      var kl = "kinetic 1% (10⁴⁴ J)  ·  light 0.01% (10⁴² J)";
      ctx.font = lf.toFixed(1) + MONO;
      var y2 = ly + lf + 5;
      if (ctx.measureText(kl).width <= barW) {
        txt(kl, barX, y2, lf.toFixed(1) + MONO, u.rgba(pal.gold, 0.92));
        var y3 = y2 + lf + 5;
        if (y3 <= R.y + R.h - 2) txt("the sparkle on a neutrino iceberg", barX, y3, lf.toFixed(1) + SANS, u.rgba(pal.muted, 0.95));
      } else {
        txt("kinetic 1% (10⁴⁴ J)", barX, y2, lf.toFixed(1) + MONO, u.rgba(pal.gold, 0.92));
        txt("light 0.01% (10⁴² J)", barX, y2 + lf + 5, lf.toFixed(1) + MONO, u.rgba(pal.gold, 0.92));
      }
      return;
    }

    txt("ENERGY BUDGET — total ≈ 3×10⁴⁶ J", R.x + 10, R.y + pf + 6, "700 " + pf.toFixed(1) + MONO, pal.bright);

    var barY = R.y + R.h * 0.44;
    var barH = clamp(R.h * 0.20, 9, 18);

    // neutrino 99%
    var nvW = barW * 0.99;
    var gg = ctx.createLinearGradient(barX, 0, barX + nvW, 0);
    gg.addColorStop(0, u.rgba(pal.cyan, 0.9));
    gg.addColorStop(1, u.rgba(pal.violet, 0.9));
    ctx.fillStyle = gg; rr(barX, barY, nvW, barH, 3); ctx.fill();
    // kinetic 1% sliver
    var keX = barX + nvW, keW = Math.max(2, barW * 0.01);
    ctx.fillStyle = u.rgba(pal.orange, 0.95); rr(keX, barY, keW, barH, 1.5); ctx.fill();
    // outline
    ctx.strokeStyle = u.rgba(pal.ink, 0.15); ctx.lineWidth = 1; rr(barX, barY, barW, barH, 3); ctx.stroke();

    var lf = ff(fB * 0.80, 8, 10.8).toFixed(1);
    // neutrino label inside/under
    txt("ν neutrinos  99%  ·  3×10⁴⁶ J", barX + 4, barY - 4, "700 " + lf + MONO, u.rgba(pal.ice, 0.95));

    // callout for the tiny slice
    var coX = keX + keW * 0.5;
    var coY = barY + barH + clamp(R.h * 0.10, 8, 16);
    ctx.strokeStyle = u.rgba(pal.orange, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(keX + keW * 0.5, barY + barH); ctx.lineTo(coX, coY - 2); ctx.stroke();
    txt("kinetic 1% (10⁴⁴ J)  ·  light 0.01% (10⁴² J)", barX, coY + lf * 1.0, lf + MONO, u.rgba(pal.gold, 0.92));
    txt("the blast we see is the sparkle on a neutrino iceberg", barX, coY + lf * 2.3, (parseFloat(lf) * 0.98).toFixed(1) + SANS, u.rgba(pal.muted, 0.95));
  }

  // ---------- loop ----------
  SN.loop(host, function (dt, t) {
    update(dt);
    try { draw(t); } catch (e) { /* keep the frame alive */ }
  });
});

/* ---- widget: typeia ------------------------------------------------------ */
SN.mount("typeia", function (host, controls) {
  var P = SN.palette, U = SN.u, TAU = U.TAU;

  // ---------- physical constants ----------
  var LN2 = Math.LN2;
  var tauNi = 6.08 / LN2;   // Ni-56 mean life (days), t1/2 = 6.08 d
  var tauCo = 77.2 / LN2;   // Co-56 mean life (days), t1/2 = 77.2 d
  var MAGTOP = -20.0, MAGBOT = -12.8;
  var DAYMAX = 100;

  // ---------- state ----------
  var state = {
    running: true, mode: "single", showCC: false, showSC: false,
    corrOn: false, corr: 0,
    phase: "accrete", pt: 0, day: 0, mass: 1.02, flash: 0
  };
  var ACC_DUR = 6.0, IGN_DUR = 1.8, DAY_DUR = 15.0;

  var L = {};
  var ej = [], stars = [];
  var scrubbing = false, wasRunning = true, hoverPlot = false;

  var scFam = [
    { s: 0.80, tint: P.ice },
    { s: 0.90, tint: P.gold },
    { s: 1.00, tint: P.orange },
    { s: 1.12, tint: P.ember }
  ];

  // canvas created here — after L/ej/stars/state exist, since SN.canvas fires
  // onResize synchronously during setup and onResize populates L via buildStars.
  var api = SN.canvas(host, onResize);
  api.canvas.style.touchAction = "pan-y";
  var ctx = api.ctx;

  // ---------- light-curve model ----------
  function iaLum(t) {
    if (t < 0) return 0;
    var dep = 6.45 * Math.exp(-t / 8.8) + 1.45 * Math.exp(-t / 111.3); // Ni + Co deposition
    var rise = 1 - Math.exp(-(t * t) / (14.5 * 14.5));                 // diffusion rise, peak ~18 d
    return dep * rise;
  }
  var IA_PEAK = null;
  function iaPeakL() {
    if (IA_PEAK == null) { var m = 0; for (var t = 0; t <= 100; t += 0.25) { var v = iaLum(t); if (v > m) m = v; } IA_PEAK = m; }
    return IA_PEAK;
  }
  function iaMag(t) { var v = iaLum(t); if (v <= 1e-5) return MAGBOT; return -19.3 + 2.5 * Math.log(iaPeakL() / v) / Math.LN10; }

  function scMag(mem, t) {
    var pk = -19.3 + 4.5 * (1 - mem.s);
    var lu = iaLum(t / mem.s); if (lu <= 1e-5) lu = 1e-5;
    var mu = pk + 2.5 * Math.log(iaPeakL() / lu) / Math.LN10;
    var lc = iaLum(t); if (lc <= 1e-5) lc = 1e-5;
    var mc = -19.3 + 2.5 * Math.log(iaPeakL() / lc) / Math.LN10;
    return mu + (mc - mu) * state.corr;
  }

  function ccMag(t) { // Type II-P: rise, ~90 d plateau (H recombination), then fall
    var peak = -17.2;
    if (t < 8) return -14 + (peak + 14) * (t / 8);
    if (t < 95) return peak + 0.45 * ((t - 8) / 87);
    return peak + 0.45 + (t - 95) * 0.10;
  }

  // decay-chain fractions (Ni-56 -> Co-56 -> Fe-56)
  function fNi(t) { return Math.exp(-t / tauNi); }
  function fCo(t) { var a = 1 / tauNi, b = 1 / tauCo; return (a / (a - b)) * (Math.exp(-b * t) - Math.exp(-a * t)); }
  function fFe(t) { var v = 1 - fNi(t) - fCo(t); return v < 0 ? 0 : v; }

  // ---------- layout ----------
  function onResize(a) {
    var W = a.w, H = a.h; if (W < 2 || H < 2) return;
    L.W = W; L.H = H;
    // Narrow (mobile) screens stack the scene on top and the light-curve panel
    // below at full width. Wide (>=560, incl. all desktop >=640) keeps the
    // original side-by-side layout byte-for-byte.
    L.narrow = W < 560;
    var pad = 8;
    if (L.narrow) {
      L.sw = W; L.sx = 0; L.sy = 0; L.sh = Math.round(H * 0.45);
      L.lcx = 4; L.lcy = L.sh + pad; L.lcw = W - 8; L.lch = H - L.lcy - 6;
    } else {
      L.sw = U.clamp(W * 0.40, 118, 380);
      L.sx = 0; L.sy = 0; L.sh = H;
      L.lcx = L.sw + pad; L.lcy = 6; L.lcw = W - L.sw - pad - 10; L.lch = H - 12;
    }
    L.plx = L.lcx + 30; L.ply = L.lcy + 20; L.plw = L.lcw - 30 - 8; L.plh = L.lch - 20 - 26;
    L.wdx = L.sx + L.sw * 0.62; L.wdy = L.sy + L.sh * 0.40;
    L.compx = L.sx + L.sw * 0.20; L.compy = L.sy + L.sh * 0.30;
    L.stripY = L.sy + L.sh * 0.735; L.stripH = L.sh * 0.205;
    buildStars();
  }
  function buildStars() {
    stars.length = 0; var r = U.rng(99), n = 55;
    for (var i = 0; i < n; i++) stars.push({ x: r() * L.sw, y: r() * L.sh, rr: 0.4 + r() * 1.0, a: 0.15 + r() * 0.5 });
  }
  function spawnEjecta() {
    ej.length = 0; var n = SN.reducedMotion ? 90 : 200, r = U.rng(42);
    for (var i = 0; i < n; i++) ej.push({ ang: r() * TAU, sp: 0.5 + r() * 0.95, j: 0.3 + r() * 0.7 });
  }

  // ---------- helpers ----------
  function txt(s, x, y, col, size, align, mono, weight) {
    // On narrow screens keep all on-canvas text readable (>=11px). Desktop
    // (>=560px canvas) is untouched, so its rendering is unchanged.
    if (api.w < 560 && size < 11) size = 11;
    ctx.fillStyle = col;
    ctx.font = (weight ? weight + " " : "") + size + "px " + (mono ? "ui-monospace, monospace" : "ui-sans-serif, system-ui, sans-serif");
    ctx.textAlign = align || "left"; ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  }
  function fs() { return U.clamp(api.w / 92, 9, 12); }
  function glow(x, y, rad, col, inten) {
    var g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, U.rgba(col, 0.95 * inten));
    g.addColorStop(0.32, U.rgba(col, 0.45 * inten));
    g.addColorStop(1, U.rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
  }
  function starBall(x, y, rad, col) {
    var g = ctx.createRadialGradient(x - rad * 0.3, y - rad * 0.3, rad * 0.1, x, y, rad);
    g.addColorStop(0, U.rgba(P.white, 0.97));
    g.addColorStop(0.5, U.rgba(col, 0.9));
    g.addColorStop(1, U.rgba(col, 0.04));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, TAU); ctx.fill();
    glow(x, y, rad * 2.1, col, 0.35);
  }
  function coolCol(f) { f = U.clamp(f, 0, 1); return f < 0.5 ? U.mix(P.bright, P.orange, f * 2) : U.mix(P.orange, P.ember, (f - 0.5) * 2); }
  function qpt(x0, y0, cx, cy, x1, y1, u) { var m = 1 - u; return { x: m * m * x0 + 2 * m * u * cx + u * u * x1, y: m * m * y0 + 2 * m * u * cy + u * u * y1 }; }
  function xOf(d) { return L.plx + (d / 100) * L.plw; }
  function yOf(m) { if (m > MAGBOT) m = MAGBOT; if (m < MAGTOP) m = MAGTOP; return L.ply + (m - MAGTOP) / (MAGBOT - MAGTOP) * L.plh; }

  // ---------- scene ----------
  function drawScene(t) {
    ctx.save();
    ctx.beginPath(); ctx.rect(L.sx, L.sy, L.sw, L.sh); ctx.clip();
    var g = ctx.createLinearGradient(0, 0, 0, L.sh);
    g.addColorStop(0, U.mix(P.bg, P.panel, 0.5)); g.addColorStop(1, P.bg);
    ctx.fillStyle = g; ctx.fillRect(L.sx, L.sy, L.sw, L.sh);
    var i;
    for (i = 0; i < stars.length; i++) { var s = stars[i]; ctx.fillStyle = U.rgba(P.ink, s.a); ctx.beginPath(); ctx.arc(s.x, s.y, s.rr, 0, TAU); ctx.fill(); }

    var ph = state.phase;
    if (ph === "accrete" || ph === "ignite") {
      if (state.mode === "single") drawSingle(t); else drawDouble(t);
    } else {
      drawEjecta();
    }
    if (state.flash > 0.01) { ctx.globalCompositeOperation = "lighter"; glow(L.wdx, L.wdy, Math.min(L.sw, L.sh) * (0.5 + state.flash * 0.9), P.white, state.flash); ctx.globalCompositeOperation = "source-over"; }

    drawStrip(t);
    drawSceneCaptions();
    ctx.restore();
  }

  function drawSingle(t) {
    var p = U.clamp(state.pt / ACC_DUR, 0, 1);
    // On narrow the scene is full-width but short — size the companion off the
    // scene height so it never clips the top edge or crowds the mass strip.
    var cr = L.narrow ? L.sh * 0.15 : L.sw * 0.15;
    starBall(L.compx, L.compy, cr, P.gold);
    // accretion disk
    ctx.save(); ctx.translate(L.wdx, L.wdy); ctx.scale(1, 0.30);
    for (var k = 0; k < 4; k++) { var rr = cr * (0.55 + k * 0.28); ctx.strokeStyle = U.rgba(P.orange, 0.28 - k * 0.05); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // stream
    var cxp = (L.compx + L.wdx) / 2, cyp = L.compy - L.sh * 0.10;
    var flow = state.phase === "accrete" ? 1 : 0.3;
    for (var j = 0; j < 26; j++) {
      var u = ((j / 26) + t * 0.28) % 1;
      var pt = qpt(L.compx + cr * 0.7, L.compy, cxp, cyp, L.wdx, L.wdy, u);
      var a = (1 - u) * 0.7 * flow;
      ctx.fillStyle = U.rgba(P.gold, a); ctx.beginPath(); ctx.arc(pt.x, pt.y, 1.0 + (1 - u) * 1.3, 0, TAU); ctx.fill();
    }
    // white dwarf
    var ign = state.phase === "ignite" ? state.flash : 0;
    var fl = ign > 0 ? (0.6 + 0.4 * Math.sin(t * 40)) : 1;
    glow(L.wdx, L.wdy, 7 + ign * 22 * fl, ign > 0 ? P.orange : P.blue, 0.9);
    starBall(L.wdx, L.wdy, 3.2 + ign * 3, ign > 0 ? P.gold : P.ice);
    if (ign > 0) { ctx.globalCompositeOperation = "lighter"; glow(L.wdx, L.wdy, 10 + ign * 18, P.ember, ign * 0.8); ctx.globalCompositeOperation = "source-over"; }
  }

  function drawDouble(t) {
    var p = U.clamp(state.pt / ACC_DUR, 0, 1);
    var cx = L.sx + L.sw * 0.48, cy = L.wdy;
    var R = U.lerp(L.sw * 0.22, L.sw * 0.015, Math.pow(p, 1.4));
    var ang = t * (0.6 + 3.0 * p);
    var ign = state.phase === "ignite" ? state.flash : 0;
    // tidal ring
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.42);
    ctx.strokeStyle = U.rgba(P.cyan, 0.18); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(0, 0, R + L.sw * 0.05, 0, TAU); ctx.stroke();
    ctx.restore();
    var wr = L.sw * 0.045;
    for (var s = 0; s < 2; s++) {
      var aa = ang + s * Math.PI;
      var x = cx + Math.cos(aa) * R, y = cy + Math.sin(aa) * R * 0.42;
      glow(x, y, wr * 2.6, P.ice, 0.7); starBall(x, y, wr, P.blue);
    }
    if (ign > 0) { ctx.globalCompositeOperation = "lighter"; glow(cx, cy, 12 + ign * 26, P.gold, ign); ctx.globalCompositeOperation = "source-over"; }
  }

  function drawEjecta() {
    var cx = L.wdx, cy = L.wdy, Rmax = Math.min(L.sw, L.sh) * 0.62, D = state.day;
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < ej.length; i++) {
      var e = ej[i], rad = (D / 55) * Rmax * e.sp;
      if (rad < 1) continue;
      var life = U.clamp(1 - D / 95, 0, 1), a = life * (0.35 + 0.5 * e.j);
      if (a <= 0.02) continue;
      var x = cx + Math.cos(e.ang) * rad, y = cy + Math.sin(e.ang) * rad * 0.9;
      ctx.globalAlpha = a; ctx.fillStyle = coolCol(U.clamp(D / 70, 0, 1));
      ctx.beginPath(); ctx.arc(x, y, 1.1 + e.j * 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    if (state.day > 60 && U.clamp(1 - state.day / 95, 0, 1) < 0.5) txt("no remnant", cx, cy + 3, U.rgba(P.muted, 0.85), fs(), "center", false, "600");
  }

  function drawSceneCaptions() {
    var s = fs(), y = L.sy + s + 6, cap, sub = "";
    if (state.phase === "accrete") { cap = state.mode === "single" ? "Accreting from companion" : "Double-degenerate inspiral"; sub = "M ≈ " + state.mass.toFixed(2) + " M☉"; }
    else if (state.phase === "ignite") { cap = "Carbon ignites — degenerate runaway"; sub = "unbinds the star in ~1 s"; }
    else if (state.day < 3) { cap = "Explosion — ~10⁴⁴ J"; sub = "v ≈ 10,000 km/s"; }
    else { cap = "Ejecta glow — day " + Math.round(state.day); sub = "powered by radioactive decay"; }
    txt(cap, L.sx + 8, y, P.bright, s, "left", false, "600");
    txt(sub, L.sx + 8, y + s + 3, P.muted, s - 1, "left", true);
  }

  function drawStrip(t) {
    var x0 = L.sx + 10, w = L.sw - 20, y0 = L.stripY, h = L.stripH, s = fs();
    if (state.phase === "accrete" || state.phase === "ignite") {
      // Chandrasekhar mass meter
      var by = y0 + h * 0.55, bh = 10;
      var frac = U.clamp((state.mass - 0.8) / (1.44 - 0.8), 0, 1);
      txt("MASS → Chandrasekhar limit", x0, y0 + s, P.ink, s - 1, "left", false, "600");
      ctx.fillStyle = U.rgba(P.ink, 0.10); ctx.fillRect(x0, by, w, bh);
      var g = ctx.createLinearGradient(x0, 0, x0 + w, 0);
      g.addColorStop(0, U.rgba(P.gold, 0.85)); g.addColorStop(1, U.rgba(P.ember, 0.95));
      ctx.fillStyle = g; ctx.fillRect(x0, by, w * frac, bh);
      var lx = x0 + w * ((1.40 - 0.8) / (1.44 - 0.8));
      ctx.strokeStyle = U.rgba(P.cyan, 0.9); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, by - 3); ctx.lineTo(lx, by + bh + 3); ctx.stroke();
      txt("≈1.4 M☉", lx, by + bh + s + 1, P.cyan, s - 2, "center", true);
      txt(state.mass.toFixed(2) + " M☉", x0, by + bh + s + 1, P.gold, s - 1, "left", true);
    } else {
      // decay chain stacked area Ni / Co / Fe
      txt("DECAY  Ni-56 → Co-56 → Fe-56", x0, y0 + s, P.ink, s - 1, "left", false, "600");
      var ax = x0, ay = y0 + s + 5, aw = w, ah = h - s - 20;
      ctx.save(); ctx.beginPath(); ctx.rect(ax, ay, aw, ah); ctx.clip();
      var N = 60, prevN = [], prevC = [], i, d, xx;
      // build layered fills bottom=Ni, mid=Co, top=Fe
      fillLayer(ax, ay, aw, ah, N, function (d) { return 0; }, function (d) { return fNi(d); }, P.gold, 0.75);
      fillLayer(ax, ay, aw, ah, N, function (d) { return fNi(d); }, function (d) { return fNi(d) + fCo(d); }, P.orange, 0.7);
      fillLayer(ax, ay, aw, ah, N, function (d) { return fNi(d) + fCo(d); }, function (d) { return 1; }, P.muted, 0.55);
      // current-day marker
      var mx = ax + (state.day / 100) * aw;
      ctx.strokeStyle = U.rgba(P.white, 0.85); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(mx, ay); ctx.lineTo(mx, ay + ah); ctx.stroke();
      ctx.restore();
      var rd = "Ni " + Math.round(fNi(state.day) * 100) + "%  Co " + Math.round(fCo(state.day) * 100) + "%  Fe " + Math.round(fFe(state.day) * 100) + "%";
      txt(rd, x0, y0 + h + 1, P.ink, s - 1, "left", true);
    }
  }
  function fillLayer(ax, ay, aw, ah, N, lo, hi, col, al) {
    ctx.beginPath(); var i, d, x, yl;
    for (i = 0; i <= N; i++) { d = (i / N) * 100; x = ax + (i / N) * aw; yl = ay + ah - hi(d) * ah; if (i === 0) ctx.moveTo(x, yl); else ctx.lineTo(x, yl); }
    for (i = N; i >= 0; i--) { d = (i / N) * 100; x = ax + (i / N) * aw; yl = ay + ah - lo(d) * ah; ctx.lineTo(x, yl); }
    ctx.closePath(); ctx.fillStyle = U.rgba(col, al); ctx.fill();
  }

  // ---------- light curve panel ----------
  function drawLC(t) {
    ctx.save();
    ctx.beginPath(); ctx.rect(L.lcx, L.lcy, L.lcw, L.lch); ctx.clip();
    ctx.fillStyle = U.rgba(P.panel, 0.65); ctx.fillRect(L.lcx, L.lcy, L.lcw, L.lch);
    ctx.strokeStyle = U.rgba(P.ink, 0.10); ctx.lineWidth = 1; ctx.strokeRect(L.lcx + 0.5, L.lcy + 0.5, L.lcw - 1, L.lch - 1);
    var s = fs();

    var title = state.showSC ? "STANDARD CANDLE — Phillips correction" : "LIGHT CURVE — absolute magnitude";
    txt(title, L.lcx + 8, L.lcy + s + 2, P.bright, s, "left", false, "600");

    // grid + axes
    var m;
    ctx.lineWidth = 1;
    for (m = -20; m <= -13; m++) {
      var y = yOf(m);
      ctx.strokeStyle = U.rgba(P.ink, m === -19 ? 0.14 : 0.06); ctx.beginPath(); ctx.moveTo(L.plx, y); ctx.lineTo(L.plx + L.plw, y); ctx.stroke();
      txt(String(m), L.plx - 4, y + 3, P.muted, s - 2, "right", true);
    }
    var dd;
    for (dd = 0; dd <= 100; dd += 20) {
      var x = xOf(dd);
      ctx.strokeStyle = U.rgba(P.ink, 0.05); ctx.beginPath(); ctx.moveTo(x, L.ply); ctx.lineTo(x, L.ply + L.plh); ctx.stroke();
      txt(String(dd), x, L.ply + L.plh + s + 2, P.muted, s - 2, "center", true);
    }
    txt("days since explosion", L.plx + L.plw / 2, L.ply + L.plh + 2 * s + 3, P.muted, s - 2, "center");

    // peak reference
    var yp = yOf(-19.3);
    ctx.strokeStyle = U.rgba(P.gold, 0.35); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(L.plx, yp); ctx.lineTo(L.plx + L.plw, yp); ctx.stroke(); ctx.setLineDash([]);
    txt("peak ≈ −19.3", L.plx + L.plw - 3, yp - 3, U.rgba(P.gold, 0.8), s - 2, "right", true);

    if (state.showSC) {
      drawSCFamily(s);
    } else {
      if (state.showCC) drawCC(s);
      drawIa(s);
    }
    drawSpectrumCue(s);
    ctx.restore();
  }

  function pathMag(fn, dMax, col, wid) {
    ctx.beginPath(); var started = false, d;
    for (d = 0.5; d <= dMax; d += 1) {
      var mm = fn(d); if (mm >= MAGBOT) { started = false; continue; }
      var x = xOf(d), y = yOf(mm);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = col; ctx.lineWidth = wid; ctx.lineJoin = "round"; ctx.stroke();
  }

  function drawIa(s) {
    var dMax = state.phase === "hold" ? DAYMAX : Math.max(0.5, state.day);
    // under-curve glow
    if (dMax > 3) {
      ctx.beginPath(); var started = false, d;
      for (d = 0.5; d <= dMax; d += 1) { var mm = iaMag(d); if (mm >= MAGBOT) { continue; } var x = xOf(d), y = yOf(mm); if (!started) { ctx.moveTo(x, L.ply + L.plh); ctx.lineTo(x, y); started = true; } else ctx.lineTo(x, y); }
      ctx.lineTo(xOf(dMax), L.ply + L.plh); ctx.closePath();
      var g = ctx.createLinearGradient(0, L.ply, 0, L.ply + L.plh);
      g.addColorStop(0, U.rgba(P.gold, 0.22)); g.addColorStop(1, U.rgba(P.gold, 0));
      ctx.fillStyle = g; ctx.fill();
    }
    pathMag(iaMag, dMax, U.rgba(P.gold, 0.35), 3.2);
    pathMag(iaMag, dMax, P.gold, 1.6);
    // head marker
    if (dMax > 0.6 && state.phase !== "accrete" && state.phase !== "ignite") {
      var hm = iaMag(dMax), hx = xOf(dMax), hy = yOf(hm);
      ctx.globalCompositeOperation = "lighter"; glow(hx, hy, 10, P.orange, 0.8); ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = P.white; ctx.beginPath(); ctx.arc(hx, hy, 2.6, 0, TAU); ctx.fill();
      txt("day " + Math.round(dMax) + "  M " + hm.toFixed(1), L.plx + 4, L.ply + s + 2, P.gold, s - 1, "left", true);
    }
    // annotations
    txt("18 d rise", xOf(12), yOf(-18.2), U.rgba(P.ink, 0.7), s - 2, "center", true);
    txt("Ni-56 (6 d)", xOf(30), yOf(-18.4), U.rgba(P.orange, 0.8), s - 2, "left");
    txt("Co-56 tail (77 d)", xOf(72), yOf(-16.4), U.rgba(P.ember, 0.85), s - 2, "center");
    // Secondary flavour line — dropped on narrow (would collide with the peak
    // label once text is floored to 11px).
    if (dMax > 14 && !L.narrow) txt("briefly rivals its whole galaxy", xOf(20), yOf(-19.7), U.rgba(P.gold, 0.8), s - 2, "left");
    if (state.showCC) txt("Ia: no remnant", L.plx + L.plw - 3, L.ply + L.plh - 6, U.rgba(P.gold, 0.85), s - 1, "right", false, "600");
  }

  function drawCC(s) {
    // scatter band peak -16..-18
    ctx.fillStyle = U.rgba(P.blue, 0.05); ctx.fillRect(L.plx, yOf(-18), L.plw, yOf(-16) - yOf(-18));
    pathMag(ccMag, 100, U.rgba(P.ice, 0.25), 3);
    pathMag(ccMag, 100, P.ice, 1.5);
    txt("Type II-P plateau (H recombination)", xOf(50), yOf(-16.6), U.rgba(P.ice, 0.9), s - 2, "center");
    txt(L.narrow ? "leaves neutron star or black hole" : "core-collapse: leaves neutron star / black hole", L.plx + 3, L.ply + L.plh - 6, U.rgba(P.ice, 0.85), s - 1, "left");
  }

  function drawSCFamily(s) {
    var i;
    for (i = 0; i < scFam.length; i++) {
      var mem = scFam[i];
      (function (mem) {
        pathMag(function (d) { return scMag(mem, d); }, 100, U.rgba(mem.tint, 0.85), 1.5);
      })(mem);
      // peak dot
      var pd = 17.25 * (state.corr < 0.5 ? mem.s : 1);
      var pm = scMag(mem, pd), px = xOf(pd), py = yOf(pm);
      ctx.fillStyle = mem.tint; ctx.beginPath(); ctx.arc(px, py, 2.3, 0, TAU); ctx.fill();
    }
    var msg = state.corr > 0.5 ? "corrected — peaks converge at −19.3" : "raw peaks differ by ~1.4 mag";
    txt(msg, xOf(50), L.ply + s + 4, state.corr > 0.5 ? P.green : P.orange, s - 1, "center", false, "600");
    txt(L.narrow ? "brighter → declines slower" : "Phillips: brighter → declines slower", xOf(60), yOf(-15.4), U.rgba(P.ink, 0.75), s - 2, "center");
    txt("the ruler that revealed dark energy (1998)", L.plx + 3, L.ply + L.plh - 6, U.rgba(P.violet, 0.85), s - 1, "left");
  }

  function drawSpectrumCue(s) {
    var y = L.lcy + 2 * s + 2;
    txt("Si II 6355 Å", L.lcx + L.lcw - 8, y, U.rgba(P.cyan, 0.9), s - 2, "right", true);
    txt("• NO hydrogen", L.lcx + L.lcw - 8, y + s, U.rgba(P.ember, 0.9), s - 2, "right", true);
  }

  // ---------- main tick ----------
  function tick(dt, t) {
    try {
      if (api.w < 2 || api.h < 2) return;
      ctx = api.ctx;
      if (state.running && !scrubbing) {
        if (state.phase === "accrete") {
          state.pt += dt; var p = U.clamp(state.pt / ACC_DUR, 0, 1);
          state.mass = U.lerp(1.02, 1.40, U.easeInOut(p));
          if (state.pt >= ACC_DUR) { state.phase = "ignite"; state.pt = 0; }
        } else if (state.phase === "ignite") {
          state.pt += dt; state.flash = U.clamp(state.pt / IGN_DUR, 0, 1);
          if (state.pt >= IGN_DUR) { state.phase = "lightcurve"; state.pt = 0; state.day = 0; spawnEjecta(); state.flash = 1; }
        } else if (state.phase === "lightcurve") {
          state.pt += dt; state.day = (state.pt / DAY_DUR) * DAYMAX;
          state.flash = Math.max(0, state.flash - dt * 1.6);
          if (state.day >= DAYMAX) { state.day = DAYMAX; state.phase = "hold"; }
        }
      }
      var tgt = (state.showSC && state.corrOn) ? 1 : 0;
      state.corr += (tgt - state.corr) * Math.min(1, dt * 3);

      ctx.clearRect(0, 0, api.w, api.h);
      ctx.fillStyle = P.bg; ctx.fillRect(0, 0, api.w, api.h);
      drawScene(t);
      drawLC(t);
    } catch (err) { /* keep the loop alive */ }
  }

  // ---------- controls ----------
  function replay() {
    state.phase = "accrete"; state.pt = 0; state.day = 0; state.mass = 1.02; state.flash = 0; ej.length = 0;
    state.running = true; syncPlay();
  }
  var bar = controls;
  if (!bar) {
    bar = SN.el("div", {}); bar.style.cssText = "position:absolute;left:8px;bottom:8px;display:flex;gap:6px;flex-wrap:wrap;z-index:3";
    host.style.position = "relative"; host.appendChild(bar);
  }
  var btnPlay = SN.el("button.btn.primary", { text: "Pause", onclick: function () { state.running = !state.running; if (state.running && state.phase === "hold") replay(); syncPlay(); } });
  function syncPlay() { btnPlay.textContent = state.running ? "Pause" : "Play"; }
  var btnReplay = SN.el("button.btn", { text: "Replay", onclick: replay });
  function chip(label, get, tog) {
    var c = SN.el("button.chip", { text: label, onclick: function () { tog(); c.className = "chip" + (get() ? " on" : ""); } });
    c.className = "chip" + (get() ? " on" : ""); return c;
  }
  var chDD = chip("double-degenerate", function () { return state.mode === "double"; }, function () { state.mode = state.mode === "single" ? "double" : "single"; if (state.phase === "accrete") { } });
  var chCC = chip("vs core-collapse", function () { return state.showCC; }, function () { state.showCC = !state.showCC; if (state.showCC) state.showSC = false; syncChips(); });
  var chSC = chip("standard candle", function () { return state.showSC; }, function () { state.showSC = !state.showSC; if (state.showSC) state.showCC = false; syncChips(); });
  var chCorr = chip("Phillips correction", function () { return state.corrOn; }, function () { state.corrOn = !state.corrOn; });
  function syncChips() { chCC.className = "chip" + (state.showCC ? " on" : ""); chSC.className = "chip" + (state.showSC ? " on" : ""); }
  var g1 = SN.el("div.grp", {}, [btnPlay, btnReplay]);
  var g2 = SN.el("div.grp", {}, [chDD, chCC, chSC, chCorr]);
  bar.appendChild(g1); bar.appendChild(g2);

  // ---------- pointer scrub ----------
  function inPlot(x, y) { return x >= L.plx && x <= L.plx + L.plw && y >= L.ply - 6 && y <= L.ply + L.plh + 6; }
  function setDay(x) { var d = U.clamp((x - L.plx) / L.plw * 100, 0, 100); state.day = d; state.pt = (d / DAYMAX) * DAY_DUR; if (state.phase === "hold" && d < DAYMAX) state.phase = "lightcurve"; }
  function coords(e) { var r = api.canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  api.canvas.addEventListener("pointerdown", function (e) {
    var c = coords(e);
    if ((state.phase === "lightcurve" || state.phase === "hold") && !state.showSC && inPlot(c.x, c.y)) {
      scrubbing = true; wasRunning = state.running; if (e.pointerType === "touch") e.preventDefault(); setDay(c.x);
    }
  });
  window.addEventListener("pointermove", function (e) {
    var c = coords(e); hoverPlot = inPlot(c.x, c.y);
    if (scrubbing) { if (e.pointerType === "touch") e.preventDefault(); setDay(c.x); }
  });
  window.addEventListener("pointerup", function () { if (scrubbing) { scrubbing = false; } });

  // ---------- reduced motion ----------
  if (SN.reducedMotion) { state.running = false; state.phase = "hold"; state.day = DAYMAX; state.mass = 1.40; state.flash = 0; spawnEjecta(); syncPlay(); }

  SN.loop(host, tick);
});

/* ---- widget: grb --------------------------------------------------------- */
SN.mount("grb", function (host, controls) {
  var P = SN.palette, U = SN.u;
  var api = SN.canvas(host, onResize);
  api.canvas.style.touchAction = "pan-y";
  var ctx = api.ctx;

  // ---- state ----
  var channel = "long";        // "long" | "short"
  var viewAngle = 3;           // degrees from spin axis
  var playing = true;
  var scene = 0;               // scene seconds
  var SCENE_MAX = 12;
  var halfAngleDeg = 5;
  var orbPhase = 0;
  var fs = 11;

  // narrow-layout state (only used when isNarrow)
  var isNarrow = false, nHudH = 0, nLcH = 0;

  // layout
  var cx = 0, cy = 0, R = 10, Rstar = 4, Reye = 9;
  function onResize(a) { layout(a); }
  function layout(a) {
    cx = a.w * 0.34;
    cy = a.h * 0.50;
    R = Math.min(a.w * 0.30, a.h * 0.44);
    Rstar = R * 0.42;
    Reye = R * 0.98;
  }
  layout(api);

  // narrow layout: full-width HUD strip at top, light-curve strip at bottom,
  // shrunken central visual centred in the remaining band.
  function narrowLayout(w, h) {
    nHudH = 8 + fs * 14.4;
    nLcH = Math.max(h * 0.26, 74);
    cx = w * 0.5;
    var top = nHudH + 6;
    var bottom = nLcH + 8;
    var avail = h - top - bottom;
    if (avail < 46) avail = 46;
    cy = top + avail * 0.5;
    R = Math.min(w * 0.40, avail * 0.42);
    if (R < 12) R = 12;
    Rstar = R * 0.42;
    Reye = R * 0.92;
  }

  // ---- timelines ----
  var LONG = [
    { t1: 2.5, label: "Rapidly rotating massive star (~30 M☉)" },
    { t1: 3.3, label: "Core collapse → black hole" },
    { t1: 4.3, label: "Accretion disk launches twin jets" },
    { t1: 4.9, label: "Jet breakout" },
    { t1: 7.2, label: "Prompt γ-ray burst (~20–100 s)" },
    { t1: 99, label: "Broad-lined Type Ic supernova (days later)" }
  ];
  var SHORT = [
    { t1: 3.0, label: "Neutron-star inspiral — GW chirp rising" },
    { t1: 3.4, label: "Merger" },
    { t1: 4.4, label: "Brief jet → short GRB (<2 s), γ-flash +1.7 s" },
    { t1: 99, label: "Kilonova — r-process gold over days" }
  ];
  function phaseAt(arr, s) {
    for (var i = 0; i < arr.length; i++) { if (s < arr[i].t1) return arr[i]; }
    return arr[arr.length - 1];
  }

  // ---- physics-ish shape functions ----
  function log10(x) { return Math.log(x) / Math.LN10; }
  function fmtExp(x) {
    if (x <= 0) return "0";
    var e = Math.floor(log10(x)); var m = x / Math.pow(10, e);
    if (m >= 9.95) { m /= 10; e++; }
    return m.toFixed(1) + "e" + e;
  }
  function beamVis(deg) {
    if (deg <= halfAngleDeg) return 1;
    var d = deg - halfAngleDeg, w = 3.0;
    return Math.exp(-(d * d) / (w * w));
  }
  function bump(s, a, b) {
    if (s <= a || s >= b) return 0;
    return Math.sin(Math.PI * (s - a) / (b - a));
  }
  function snShape(s) {
    if (s < 7.0) return 0;
    var pk = 9.2;
    if (s < pk) return U.easeOut((s - 7.0) / (pk - 7.0));
    return U.clamp(1 - (s - pk) / (SCENE_MAX - pk) * 0.7, 0, 1);
  }
  function knShape(s) {
    if (s < 4.4) return 0;
    var pk = 5.6;
    if (s < pk) return U.easeOut((s - 4.4) / (pk - 4.4));
    return U.clamp(1 - (s - pk) / (SCENE_MAX - pk) * 0.75, 0, 1);
  }
  function lumLinear(s, deg, ch) {
    var vis = beamVis(deg);
    if (ch === "long") {
      return 1e47 * vis * bump(s, 4.9, 7.2) + 1e37 * snShape(s) + 1e33;
    }
    return 5e46 * vis * bump(s, 3.4, 4.4) + 3e35 * knShape(s) + 1e32;
  }
  function promptWin() { return channel === "long" ? [4.9, 7.2] : [3.4, 4.4]; }

  // ---- jet geometry ----
  function jetGeom(s, ch) {
    var outer = 0, glow = 0, width = Rstar * 0.06, p;
    if (ch === "long") {
      if (s < 3.3) return { outer: 0, glow: 0, width: width };
      if (s < 4.3) { p = (s - 3.3) / 1.0; outer = Rstar * 0.9 * p; glow = 0.18; }
      else if (s < 4.9) { p = (s - 4.3) / 0.6; outer = U.lerp(Rstar * 0.9, R * 1.15, p); glow = U.lerp(0.35, 1, p); }
      else if (s < 7.2) { outer = R * 1.15; glow = 1; }
      else { p = U.clamp((s - 7.2) / 1.4, 0, 1); outer = R * 1.15; glow = 1 - p; }
    } else {
      if (s < 3.4 || s > 4.6) return { outer: 0, glow: 0, width: Rstar * 0.045 };
      width = Rstar * 0.045;
      var pr = U.clamp((s - 3.4) / 0.35, 0, 1);
      var q = U.clamp((4.6 - s) / 1.2, 0, 1);
      glow = Math.min(pr, q);
      outer = R * 1.1 * pr;
    }
    return { outer: outer, glow: glow, width: width };
  }

  // ---- static assets ----
  var stars = [];
  var rs0 = U.rng(1234);
  for (var i = 0; i < 90; i++) stars.push({ x: rs0(), y: rs0(), b: 0.2 + rs0() * 0.6, s: rs0() });
  var jetP = [];
  var rj = U.rng(77);
  for (i = 0; i < 80; i++) jetP.push({ sign: (i % 2 ? 1 : -1), u: rj(), off: (rj() * 2 - 1), w: 0.3 + rj() * 0.7, sp: 0.6 + rj() * 0.8 });

  // ---- draw helpers ----
  function txt(str, x, y, col, size, align) {
    ctx.font = (size || fs).toFixed(1) + "px ui-monospace, monospace";
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = col || P.ink;
    ctx.fillText(str, x, y);
  }
  function clipText(str, maxW, size) {
    ctx.font = size.toFixed(1) + "px ui-monospace, monospace";
    if (ctx.measureText(str).width <= maxW) return str;
    var s = str;
    while (s.length > 1 && ctx.measureText(s + "…").width > maxW) s = s.slice(0, -1);
    return s + "…";
  }
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawStars(t) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var tw = SN.reducedMotion ? 1 : (0.6 + 0.4 * Math.sin(t * 1.5 + s.s * 10));
      ctx.fillStyle = U.rgba(P.bright, s.b * 0.5 * tw);
      ctx.fillRect(s.x * api.w, s.y * api.h, 1.2, 1.2);
    }
  }

  function drawStarBody(s, t) {
    var vis, rad;
    if (s < 2.5) { vis = 1; rad = Rstar * (1 + 0.02 * Math.sin(t * 2)); }
    else if (s < 3.3) { var p = (s - 2.5) / 0.8; vis = 1 - 0.2 * p; rad = Rstar * U.lerp(1, 0.3, U.easeInOut(p)); }
    else if (s < 4.3) { var p2 = (s - 3.3) / 1.0; vis = U.clamp(1 - p2, 0, 1) * 0.8; rad = Rstar * U.lerp(0.3, 0.08, p2); }
    else return;
    if (vis <= 0.01) return;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1.18, 0.9);
    var g = ctx.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad);
    g.addColorStop(0, U.rgba(P.white, 0.95 * vis));
    g.addColorStop(0.3, U.rgba(P.gold, 0.9 * vis));
    g.addColorStop(0.7, U.rgba(P.orange, 0.6 * vis));
    g.addColorStop(1, U.rgba(P.ember, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rad, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function drawBH(s) {
    if (s < 3.0) return;
    var app = U.clamp((s - 3.0) / 0.5, 0, 1);
    var rbh = R * 0.045, dr = R * 0.16 * app;
    ctx.save(); ctx.translate(cx, cy);
    ctx.save(); ctx.scale(1, 0.34);
    var dg = ctx.createRadialGradient(0, 0, rbh, 0, 0, dr);
    dg.addColorStop(0, U.rgba(P.cyan, 0));
    dg.addColorStop(0.35, U.rgba(P.gold, 0.7 * app));
    dg.addColorStop(0.7, U.rgba(P.orange, 0.45 * app));
    dg.addColorStop(1, U.rgba(P.ember, 0));
    ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(0, 0, dr, 0, U.TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = U.rgba(P.gold, 0.8 * app); ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.arc(0, 0, rbh * 1.5, 0, U.TAU); ctx.stroke();
    ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(0, 0, rbh, 0, U.TAU); ctx.fill();
    ctx.restore();
  }

  function drawSN(s) {
    if (s < 7.0) return;
    var p = U.clamp((s - 7.0) / 5.0, 0, 1);
    var rad = U.lerp(Rstar * 0.6, R * 1.25, U.easeOut(p));
    var b = snShape(s);
    var g = ctx.createRadialGradient(cx, cy, rad * 0.1, cx, cy, rad);
    g.addColorStop(0, U.rgba(P.gold, 0.10 * b + 0.02));
    g.addColorStop(0.4, U.rgba(P.orange, 0.18 * b));
    g.addColorStop(0.75, U.rgba(P.ember, 0.14 * b));
    g.addColorStop(1, U.rgba(P.ember, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rad, 0, U.TAU); ctx.fill();
    // broad-lined high-velocity streaks
    var rline = U.rng(51);
    ctx.lineWidth = 1;
    for (var i = 0; i < 14; i++) {
      var a = rline() * U.TAU;
      ctx.strokeStyle = U.rgba(i % 2 ? P.orange : P.gold, 0.10 * b);
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * rad * 0.25, cy + Math.sin(a) * rad * 0.25);
      ctx.lineTo(cx + Math.cos(a) * rad * 0.95, cy + Math.sin(a) * rad * 0.95);
      ctx.stroke();
    }
  }

  function drawInspiral(s, dt, t) {
    if (s > 3.4) return;
    var prog = U.clamp(s / 3.0, 0, 1);
    var sep = U.lerp(R * 0.5, R * 0.05, prog * prog);
    var omega = 1.2 + prog * prog * 16;
    if (playing) orbPhase += dt * omega * (SN.reducedMotion ? 0.5 : 1);
    // GW ripples
    for (var r = 0; r < 3; r++) {
      var ph = (t * 0.6 * (1 + prog) + r / 3) % 1;
      var rr = ph * R * 1.2;
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.34);
      ctx.strokeStyle = U.rgba(P.violet, 0.12 * (1 - ph) * (0.4 + prog)); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(0, 0, rr, 0, U.TAU); ctx.stroke(); ctx.restore();
    }
    // orbit guide
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.34);
    ctx.strokeStyle = U.rgba(P.muted, 0.18); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, sep, 0, U.TAU); ctx.stroke(); ctx.restore();
    // two neutron stars
    for (var k = 0; k < 2; k++) {
      var an = orbPhase + k * Math.PI;
      var x = cx + sep * Math.cos(an), y = cy + sep * 0.34 * Math.sin(an);
      var g = ctx.createRadialGradient(x, y, 0, x, y, R * 0.10);
      g.addColorStop(0, U.rgba(P.white, 0.95));
      g.addColorStop(0.4, U.rgba(P.cyan, 0.7));
      g.addColorStop(1, U.rgba(P.cyan, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, R * 0.10, 0, U.TAU); ctx.fill();
    }
  }

  function drawMergeRemnant(s) {
    if (s < 2.95) return;
    if (s < 3.7) {
      var f = U.clamp(1 - Math.abs(s - 3.15) / 0.55, 0, 1);
      var rr = R * 0.5 * f;
      var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      g.addColorStop(0, U.rgba(P.white, 0.9 * f));
      g.addColorStop(0.4, U.rgba(P.ice, 0.5 * f));
      g.addColorStop(1, U.rgba(P.violet, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rr, 0, U.TAU); ctx.fill();
    }
    if (s > 3.3) {
      var rbh = R * 0.03;
      ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(cx, cy, rbh, 0, U.TAU); ctx.fill();
      ctx.strokeStyle = U.rgba(P.violet, 0.6); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, rbh * 1.6, 0, U.TAU); ctx.stroke();
    }
  }

  function drawKilonova(s, t) {
    if (s < 4.4) return;
    var p = U.clamp((s - 4.4) / 6.0, 0, 1);
    var rad = U.lerp(Rstar * 0.5, R * 1.05, U.easeOut(p));
    var b = knShape(s);
    // red lanthanide-rich equatorial (oblate)
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.5);
    var gr = ctx.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad);
    gr.addColorStop(0, U.rgba(P.orange, 0.20 * b));
    gr.addColorStop(0.5, U.rgba(P.ember, 0.16 * b));
    gr.addColorStop(1, U.rgba(P.ember, 0));
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(0, 0, rad, 0, U.TAU); ctx.fill();
    ctx.restore();
    // blue polar (prolate), fades faster
    var bf = U.clamp(1 - p * 1.3, 0, 1) * b;
    if (bf > 0.01) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(0.55, 1);
      var gb = ctx.createRadialGradient(0, 0, rad * 0.1, 0, 0, rad * 0.9);
      gb.addColorStop(0, U.rgba(P.ice, 0.18 * bf));
      gb.addColorStop(0.6, U.rgba(P.blue, 0.10 * bf));
      gb.addColorStop(1, U.rgba(P.blue, 0));
      ctx.fillStyle = gb; ctx.beginPath(); ctx.arc(0, 0, rad * 0.9, 0, U.TAU); ctx.fill();
      ctx.restore();
    }
    // r-process gold sparkles
    var rp = U.rng(303);
    for (var i = 0; i < 40; i++) {
      var a = rp() * U.TAU, rr = Math.sqrt(rp()) * rad;
      var xx = cx + rr * Math.cos(a), yy = cy + rr * 0.5 * Math.sin(a);
      var tw = SN.reducedMotion ? 0.7 : (0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)));
      ctx.fillStyle = U.rgba(P.rproc, 0.5 * b * tw);
      ctx.fillRect(xx, yy, 1.6, 1.6);
    }
  }

  function drawJets(s, ch, dt) {
    var geo = jetGeom(s, ch);
    if (geo.outer <= 0) return;
    var col = P.ice;
    var tip = ch === "short" ? P.violet : P.blue;
    for (var si = 0; si < 2; si++) {
      var sign = si === 0 ? 1 : -1;
      var ty = cy - sign * geo.outer;
      var g = ctx.createLinearGradient(cx, cy, cx, ty);
      g.addColorStop(0, U.rgba(P.white, 0));
      g.addColorStop(0.15, U.rgba(P.white, 0.5 * geo.glow));
      g.addColorStop(0.5, U.rgba(col, 0.35 * geo.glow));
      g.addColorStop(1, U.rgba(tip, 0));
      ctx.beginPath();
      ctx.moveTo(cx - geo.width * 0.4, cy);
      ctx.lineTo(cx + geo.width * 0.4, cy);
      ctx.lineTo(cx + geo.width * 1.4, ty);
      ctx.lineTo(cx - geo.width * 1.4, ty);
      ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
    }
    var spd = ch === "short" ? 2.2 : 1.6;
    for (var i = 0; i < jetP.length; i++) {
      var pp = jetP[i];
      if (playing) { pp.u += dt * pp.sp * spd * (SN.reducedMotion ? 0.4 : 1); if (pp.u > 1) pp.u -= 1; }
      var along = pp.u;
      var yy = cy - pp.sign * (along * geo.outer);
      var xx = cx + pp.off * geo.width * (0.4 + along * 1.2);
      var a = geo.glow * (1 - along) * 0.9;
      if (a <= 0.02) continue;
      ctx.strokeStyle = U.rgba(along < 0.6 ? P.white : P.blue, a);
      ctx.lineWidth = pp.w;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx, yy + pp.sign * geo.outer * 0.06); ctx.stroke();
    }
  }

  function drawBloom() {
    var pa = promptWin();
    var boost = beamVis(viewAngle) * bump(scene, pa[0], pa[1]);
    if (boost <= 0.01) return;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.4);
    g.addColorStop(0, U.rgba(P.gold, 0.22 * boost));
    g.addColorStop(0.5, U.rgba(P.orange, 0.10 * boost));
    g.addColorStop(1, U.rgba(P.gold, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, api.w, api.h);
  }

  function drawEye(x, y, col) {
    ctx.save(); ctx.translate(x, y);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, 14);
    g.addColorStop(0, U.rgba(col, 0.5)); g.addColorStop(1, U.rgba(col, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 14, 0, U.TAU); ctx.fill();
    ctx.fillStyle = U.rgba(col, 0.95); ctx.beginPath(); ctx.arc(0, 0, 3.2, 0, U.TAU); ctx.fill();
    ctx.restore();
    txt("you", x + (x < cx ? -6 : 6), y - 8, col, isNarrow ? 11 : fs * 0.9, x < cx ? "right" : "left");
  }

  function drawCone(s, ch) {
    var ha = halfAngleDeg * Math.PI / 180;
    var len = R * 1.15;
    var geo = jetGeom(s, ch);
    var cg = geo.outer > 0 ? geo.glow : 0;
    var col = ch === "short" ? P.violet : P.blue;
    for (var i = 0; i < 2; i++) {
      var base = i === 0 ? -Math.PI / 2 : Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      ctx.lineTo(cx + len * Math.cos(base - ha), cy + len * Math.sin(base - ha));
      ctx.lineTo(cx + len * Math.cos(base + ha), cy + len * Math.sin(base + ha));
      ctx.closePath();
      ctx.fillStyle = U.rgba(col, 0.04 + 0.10 * cg); ctx.fill();
      ctx.strokeStyle = U.rgba(col, 0.25 + 0.4 * cg); ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx + len * Math.cos(base - ha), cy + len * Math.sin(base - ha));
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + len * Math.cos(base + ha), cy + len * Math.sin(base + ha));
      ctx.stroke();
    }
    // spin axis
    ctx.setLineDash([3, 4]); ctx.strokeStyle = U.rgba(P.muted, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy - len); ctx.lineTo(cx, cy + len); ctx.stroke(); ctx.setLineDash([]);
    // angle arc
    var va = viewAngle * Math.PI / 180;
    var ea = -Math.PI / 2 + va;
    var ra = R * 0.5;
    ctx.strokeStyle = U.rgba(P.gold, 0.5); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, ra, -Math.PI / 2, ea, false); ctx.stroke();
    // sightline + eye
    var ex = cx + Reye * Math.cos(ea), ey = cy + Reye * Math.sin(ea);
    var inBeam = viewAngle <= halfAngleDeg;
    var vis = beamVis(viewAngle);
    var eyeCol = inBeam ? P.gold : (vis > 0.05 ? P.orange : P.muted);
    ctx.setLineDash([2, 4]); ctx.strokeStyle = U.rgba(eyeCol, 0.6); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.setLineDash([]);
    drawEye(ex, ey, eyeCol);
    var ma = (-Math.PI / 2 + ea) / 2;
    txt(viewAngle + "°", cx + (ra + 12) * Math.cos(ma), cy + (ra + 12) * Math.sin(ma), P.gold, fs);
  }

  function timeLabel(s) {
    if (channel === "long") {
      if (s < 4.9) return "t = 0";
      if (s < 7.2) { return "burst  +" + Math.round(U.map(s, 4.9, 7.2, 0, 80)) + " s"; }
      return "SN  +" + U.map(s, 7.2, 12, 0.3, 22).toFixed(1) + " d";
    }
    if (s < 3.0) return "inspiral  t < 0";
    if (s < 3.4) return "MERGER  t = 0";
    if (s < 4.6) return "γ-flash  +" + U.map(s, 3.4, 4.6, 0, 2).toFixed(1) + " s";
    return "kilonova  +" + U.map(s, 4.6, 12, 0.2, 14).toFixed(1) + " d";
  }

  // narrow HUD: single full-width strip along the top, everything left-aligned
  // so no line clips the right edge. All text >= 11px.
  function drawHUDNarrow(ph) {
    var w = api.w;
    var pad = 8;
    var x = pad + 2;
    var rw = w - pad * 2 - 4;
    var rh = fs * 1.42;
    ctx.fillStyle = U.rgba(P.panel, 0.55);
    ctx.strokeStyle = U.rgba(P.muted, 0.25); ctx.lineWidth = 1;
    roundRect(4, 4, w - 8, nHudH - 8, 5); ctx.fill(); ctx.stroke();

    var y = 6 + fs * 1.2;
    txt(channel === "long" ? "COLLAPSAR — long GRB" : "NS MERGER — short GRB", x, y, P.muted, fs); y += rh;
    txt(clipText(ph.label, rw, fs), x, y, P.bright, fs); y += rh;
    txt(timeLabel(scene), x, y, P.ice, fs); y += rh;

    var Lapp = lumLinear(scene, viewAngle, channel);
    txt("θ view " + viewAngle + "°    θ jet ±5°", x, y, P.bright, fs); y += rh;
    txt("Γ >100  v>0.9999c", x, y, P.bright, fs); y += rh;
    if (channel === "long") txt("E_kin ~1e45 J (~10× SN)", x, y, P.bright, fs);
    else txt("ejecta ~0.05 M☉  r-proc", x, y, P.bright, fs);
    y += rh;
    txt("L_app " + fmtExp(Lapp) + " W", x, y, P.bright, fs); y += rh;

    // badge
    var inBeam = viewAngle <= halfAngleDeg;
    var vis = beamVis(viewAngle);
    var bcol, btxt;
    if (inBeam) { bcol = P.gold; btxt = "IN BEAM — γ-ray burst"; }
    else if (vis > 0.05) { bcol = P.orange; btxt = "GRAZING — weak burst"; }
    else { bcol = P.muted; btxt = channel === "long" ? "OFF-AXIS — SN only" : "OFF-AXIS — kilonova only"; }
    ctx.font = fs.toFixed(1) + "px ui-monospace, monospace";
    var bwB = Math.min(rw + 4, ctx.measureText(btxt).width + 16);
    ctx.fillStyle = U.rgba(bcol, 0.18); ctx.strokeStyle = U.rgba(bcol, 0.7); ctx.lineWidth = 1;
    roundRect(x - 3, y - fs, bwB, fs * 1.7, 4); ctx.fill(); ctx.stroke();
    txt(btxt, x, y + fs * 0.28, bcol, fs);
    y += rh + fs * 0.7;
    txt("beaming: two 5° cones ≈ 0.4% of sky", x, y, U.rgba(P.muted, 0.85), fs);
  }

  function drawHUD(ph) {
    if (isNarrow) { drawHUDNarrow(ph); return; }
    txt(channel === "long" ? "COLLAPSAR — long GRB" : "NS MERGER — short GRB", 12, fs * 1.6, P.muted, fs * 0.95);
    txt(ph.label, 12, fs * 3.0, P.bright, fs * 1.05);
    txt(timeLabel(scene), 12, fs * 4.4, P.ice, fs * 0.95);

    var px = api.w * 0.66, py = api.h * 0.05, pw = api.w * 0.30;
    var Lapp = lumLinear(scene, viewAngle, channel);
    var lines = [];
    lines.push(["θ view", viewAngle + "°"]);
    lines.push(["θ jet", "±5° half-angle"]);
    lines.push(["Γ", ">100  v>0.9999c"]);
    if (channel === "long") lines.push(["E_kin", "~1e45 J (~10× SN)"]);
    else lines.push(["ejecta", "~0.05 M☉  r-proc"]);
    lines.push(["L_app", fmtExp(Lapp) + " W"]);

    var bodyH = lines.length * fs * 1.5;
    ctx.fillStyle = U.rgba(P.panel, 0.55); ctx.strokeStyle = U.rgba(P.muted, 0.25); ctx.lineWidth = 1;
    roundRect(px - 6, py - 4, pw + 12, bodyH + fs * 4.4, 5); ctx.fill(); ctx.stroke();

    var yy = py + fs * 1.2;
    for (var i = 0; i < lines.length; i++) {
      txt(lines[i][0], px, yy, P.muted, fs * 0.95);
      txt(lines[i][1], px + pw, yy, P.bright, fs * 0.95, "right");
      yy += fs * 1.5;
    }
    // badge
    yy += fs * 0.3;
    var inBeam = viewAngle <= halfAngleDeg;
    var vis = beamVis(viewAngle);
    var bcol, btxt;
    if (inBeam) { bcol = P.gold; btxt = "IN BEAM — γ-ray burst"; }
    else if (vis > 0.05) { bcol = P.orange; btxt = "GRAZING — weak burst"; }
    else { bcol = P.muted; btxt = channel === "long" ? "OFF-AXIS — SN only" : "OFF-AXIS — kilonova only"; }
    ctx.fillStyle = U.rgba(bcol, 0.18); ctx.strokeStyle = U.rgba(bcol, 0.7);
    roundRect(px - 6, yy - fs, pw + 12, fs * 1.7, 4); ctx.fill(); ctx.stroke();
    txt(btxt, px, yy + fs * 0.25, bcol, fs * 0.92);
    txt("beaming: two 5° cones ≈ 0.4% of sky", px, yy + fs * 2.5, U.rgba(P.muted, 0.8), fs * 0.8);
  }

  function drawLightCurve() {
    var w = api.w, h = api.h;
    if (isNarrow) {
      var bw = w - 16, bx = 8;
      var bh = nLcH - 14;
      var by = h - bh - 8;
      var lf = 11;
      ctx.fillStyle = U.rgba(P.panel, 0.55); ctx.strokeStyle = U.rgba(P.muted, 0.25); ctx.lineWidth = 1;
      roundRect(bx - 6, by - 6, bw + 12, bh + 12, 5); ctx.fill(); ctx.stroke();
      var loMin = 32, loMax = 48;
      var X = function (s) { return bx + (s / SCENE_MAX) * bw; };
      var Y = function (lg) { return by + bh - (U.clamp(lg, loMin, loMax) - loMin) / (loMax - loMin) * bh; };
      var gl = [35, 40, 45];
      for (var i = 0; i < gl.length; i++) {
        var y = Y(gl[i]);
        ctx.strokeStyle = U.rgba(P.muted, 0.15); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke();
        txt("10^" + gl[i], bx + 2, y - 2, U.rgba(P.muted, 0.7), lf);
      }
      var n = 100, k, s, lg, x2, y2;
      ctx.strokeStyle = U.rgba(P.gold, 0.30); ctx.lineWidth = 1; ctx.beginPath();
      for (k = 0; k <= n; k++) { s = k / n * SCENE_MAX; lg = log10(lumLinear(s, 0, channel)); x2 = X(s); y2 = Y(lg); if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
      ctx.stroke();
      ctx.strokeStyle = U.rgba(P.cyan, 0.9); ctx.lineWidth = 1.6; ctx.beginPath();
      for (k = 0; k <= n; k++) { s = k / n * SCENE_MAX; lg = log10(lumLinear(s, viewAngle, channel)); x2 = X(s); y2 = Y(lg); if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
      ctx.stroke();
      var xp = X(scene);
      ctx.strokeStyle = U.rgba(P.bright, 0.5); ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(xp, by); ctx.lineTo(xp, by + bh); ctx.stroke(); ctx.setLineDash([]);
      var cl = log10(lumLinear(scene, viewAngle, channel));
      ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(xp, Y(cl), 3, 0, U.TAU); ctx.fill();
      txt("you", bx + bw - 3, by + lf + 1, P.cyan, lf, "right");
      txt("on-axis", bx + bw - 3, by + lf * 2 + 3, U.rgba(P.gold, 0.8), lf, "right");
      txt("apparent L (log W)", bx + 3, by + bh - 3, U.rgba(P.ink, 0.9), lf);
      txt("time →", bx + bw - 3, by + bh - 3, U.rgba(P.muted, 0.7), lf, "right");
      return;
    }
    var bw = w * 0.32, bx = w - bw - 8;
    var bh = Math.max(h * 0.28, 52);
    var by = h - bh - 8;
    ctx.fillStyle = U.rgba(P.panel, 0.55); ctx.strokeStyle = U.rgba(P.muted, 0.25); ctx.lineWidth = 1;
    roundRect(bx - 6, by - 6, bw + 12, bh + 12, 5); ctx.fill(); ctx.stroke();
    var loMin = 32, loMax = 48;
    function X(s) { return bx + (s / SCENE_MAX) * bw; }
    function Y(lg) { return by + bh - (U.clamp(lg, loMin, loMax) - loMin) / (loMax - loMin) * bh; }
    var gl = [35, 40, 45];
    for (var i = 0; i < gl.length; i++) {
      var y = Y(gl[i]);
      ctx.strokeStyle = U.rgba(P.muted, 0.15); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + bw, y); ctx.stroke();
      txt("10^" + gl[i], bx + 2, y - 2, U.rgba(P.muted, 0.7), fs * 0.75);
    }
    var n = 100, k, s, lg, x2, y2;
    // on-axis reference
    ctx.strokeStyle = U.rgba(P.gold, 0.30); ctx.lineWidth = 1; ctx.beginPath();
    for (k = 0; k <= n; k++) { s = k / n * SCENE_MAX; lg = log10(lumLinear(s, 0, channel)); x2 = X(s); y2 = Y(lg); if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
    ctx.stroke();
    // your-angle curve
    ctx.strokeStyle = U.rgba(P.cyan, 0.9); ctx.lineWidth = 1.6; ctx.beginPath();
    for (k = 0; k <= n; k++) { s = k / n * SCENE_MAX; lg = log10(lumLinear(s, viewAngle, channel)); x2 = X(s); y2 = Y(lg); if (k === 0) ctx.moveTo(x2, y2); else ctx.lineTo(x2, y2); }
    ctx.stroke();
    // current marker
    var xp = X(scene);
    ctx.strokeStyle = U.rgba(P.bright, 0.5); ctx.setLineDash([2, 3]);
    ctx.beginPath(); ctx.moveTo(xp, by); ctx.lineTo(xp, by + bh); ctx.stroke(); ctx.setLineDash([]);
    var cl = log10(lumLinear(scene, viewAngle, channel));
    ctx.fillStyle = P.cyan; ctx.beginPath(); ctx.arc(xp, Y(cl), 3, 0, U.TAU); ctx.fill();
    txt("apparent L (log W)", bx + 2, by + fs, U.rgba(P.ink, 0.9), fs * 0.8);
    txt("you", bx + bw - 2, by + fs, P.cyan, fs * 0.78, "right");
    txt("on-axis", bx + bw - 2, by + fs * 2, U.rgba(P.gold, 0.8), fs * 0.78, "right");
    txt("time →", bx + bw - 2, by + bh - 2, U.rgba(P.muted, 0.7), fs * 0.78, "right");
  }

  function drawGW(s, t) {
    if (s > 4.6) return;
    var bw, bx, bh, by;
    if (isNarrow) {
      bw = Math.min(api.w - 16, 220);
      bx = (api.w - bw) * 0.5;
      bh = Math.max(Math.min(R * 0.5, 44), 34);
      by = (api.h - nLcH - 12) - bh - 4;
      if (by < 4) by = 4;
    } else {
      bw = R * 1.2; bx = cx - bw * 0.5; bh = Math.min(R * 0.32, 46);
      by = cy + R * 1.05;
      if (by + bh > api.h - 6) by = api.h - bh - 6;
      if (bx < 6) bx = 6;
    }
    ctx.fillStyle = U.rgba(P.panel, 0.6); ctx.strokeStyle = U.rgba(P.muted, 0.3); ctx.lineWidth = 1;
    roundRect(bx, by, bw, bh, 4); ctx.fill(); ctx.stroke();
    var appear = U.clamp(s / 1.2, 0, 1);
    ctx.strokeStyle = U.rgba(P.violet, 0.9 * appear); ctx.lineWidth = 1.4; ctx.beginPath();
    var n = 130, mid = by + bh * 0.52;
    for (var i = 0; i <= n; i++) {
      var u = i / n;
      var env, phase = 6.283 * (2 * u + u * u * u * 14);
      if (u < 0.78) env = Math.pow(u / 0.78, 1.5);
      else env = Math.exp(-(u - 0.78) * 9) * 0.9;
      var yy = mid - env * bh * 0.4 * Math.sin(phase);
      var xx = bx + u * bw;
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    var lf = isNarrow ? 11 : fs * 0.8;
    txt(isNarrow ? "GW chirp h(t)" : "GW strain h(t) — chirp", bx + 4, by + (isNarrow ? lf : fs), U.rgba(P.muted, 0.85), lf);
    txt(isNarrow ? "γ-flash +1.7 s" : "GW170817: γ-flash +1.7 s", bx + 4, by + bh - 4, U.rgba(P.ice, 0.9), lf);
  }

  // ---- main draw ----
  function draw(dt, t) {
    var w = api.w, h = api.h;
    if (w < 2 || h < 2) return;
    isNarrow = w < 560;
    fs = isNarrow ? U.clamp(w * 0.017, 11, 12.5) : U.clamp(w * 0.017, 9, 12.5);
    if (isNarrow) narrowLayout(w, h);
    var bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, P.bg); bg.addColorStop(1, "#02030a");
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    drawStars(t);
    var arr = channel === "long" ? LONG : SHORT;
    var ph = phaseAt(arr, scene);
    if (channel === "long") {
      drawStarBody(scene, t);
      drawBH(scene);
      drawSN(scene);
      drawJets(scene, "long", dt);
    } else {
      drawInspiral(scene, dt, t);
      drawMergeRemnant(scene);
      drawKilonova(scene, t);
      drawJets(scene, "short", dt);
    }
    drawBloom();
    drawCone(scene, channel);
    drawHUD(ph);
    drawLightCurve();
    if (channel === "short") drawGW(scene, t);
  }

  // ---- controls ----
  var chipLong, chipShort, playBtn;
  function replay() {
    scene = 0; playing = true; orbPhase = 0;
    if (playBtn) playBtn.textContent = "Pause";
  }
  function setChannel(ch) {
    channel = ch;
    if (chipLong) chipLong.className = ch === "long" ? "chip on" : "chip";
    if (chipShort) chipShort.className = ch === "short" ? "chip on" : "chip";
    replay();
  }

  var bar = controls;
  if (!bar) {
    bar = SN.el("div", {});
    bar.style.position = "absolute"; bar.style.left = "8px"; bar.style.bottom = "8px";
    bar.style.display = "flex"; bar.style.flexWrap = "wrap"; bar.style.gap = "6px"; bar.style.zIndex = "5";
    host.style.position = "relative";
    host.appendChild(bar);
  }
  playBtn = SN.el("button.btn", { text: "Pause", onclick: function () { playing = !playing; playBtn.textContent = playing ? "Pause" : "Play"; } });
  var replayBtn = SN.el("button.btn.primary", { text: "Replay", onclick: function () { replay(); } });
  chipLong = SN.el("button.chip.on", { text: "Long GRB · collapsar", onclick: function () { setChannel("long"); } });
  chipShort = SN.el("button.chip", { text: "Short GRB · merger", onclick: function () { setChannel("short"); } });
  var slider = SN.slider({
    label: "Viewing angle", min: 0, max: 90, step: 1, value: viewAngle,
    format: function (v) { return v + "°"; },
    oninput: function (v) { viewAngle = v; }
  });
  bar.appendChild(SN.el("div.grp", {}, [replayBtn, playBtn]));
  bar.appendChild(SN.el("div.grp", {}, [chipLong, chipShort]));
  bar.appendChild(slider);

  if (SN.reducedMotion) { scene = 6.0; playing = false; playBtn.textContent = "Play"; }

  // ---- loop ----
  SN.loop(host, function (dt, t) {
    if (playing) {
      scene += dt * (SN.reducedMotion ? 0.5 : 1);
      if (scene > SCENE_MAX) { scene = SCENE_MAX; playing = false; if (playBtn) playBtn.textContent = "Play"; }
    }
    draw(dt, t);
  });
});

/* ---- widget: forge ------------------------------------------------------- */
SN.mount("forge", function (host, controls) {
  var pal = SN.palette, u = SN.u, TAU = u.TAU;
  var reduced = SN.reducedMotion;

  // ---- category indices ----
  var BB=0, CR=1, AGB=2, CC=3, IA=4, R=5, HM=6;
  var CATS = [
    { name:"Big Bang nucleosynthesis", lbl:"Big Bang", chip:"Big Bang", color:pal.cyan },
    { name:"Cosmic-ray spallation", lbl:"Cosmic ray", chip:"Cosmic ray", color:"#9aa06a" },
    { name:"Dying low-mass stars (s-process)", lbl:"AGB s-process", chip:"s-process", color:pal.green },
    { name:"Core-collapse supernovae", lbl:"Core-collapse SN", chip:"Core-collapse", color:pal.gold },
    { name:"Type Ia (white-dwarf) supernovae", lbl:"Type Ia SN", chip:"Type Ia", color:pal.blue },
    { name:"Merging neutron stars (r-process)", lbl:"r-process", chip:"r-process", color:pal.violet },
    { name:"Human-made / not natural", lbl:"Human-made", chip:"Human-made", color:pal.muted }
  ];

  function one(i){ var a=[0,0,0,0,0,0,0]; a[i]=1; return a; }

  // ---- element data: [Z, sym, name, gx, gy, origins[7], note] ----
  var D = [
    [1,"H","Hydrogen",1,0, one(BB), "Forged in the first minutes after the Big Bang; ~74% of ordinary matter."],
    [2,"He","Helium",18,0, one(BB), "Mostly primordial from Big Bang nucleosynthesis; ~24% of ordinary matter."],
    [3,"Li","Lithium",1,1, [0.4,0.2,0.4,0,0,0,0], "A cosmic puzzle: part Big Bang, part cosmic rays, part dying stars."],
    [4,"Be","Beryllium",2,1, one(CR), "Not built in stars; chipped from heavier nuclei by cosmic rays."],
    [5,"B","Boron",13,1, one(CR), "Cosmic-ray spallation splinters carbon and oxygen into boron."],
    [6,"C","Carbon",14,1, [0,0,0.6,0.4,0,0,0], "The backbone of life, breathed out by dying low-mass stars."],
    [7,"N","Nitrogen",15,1, [0,0,0.6,0.4,0,0,0], "Cooked in the CNO cycle of AGB stars; the air you breathe."],
    [8,"O","Oxygen",16,1, one(CC), "Massive stars forge oxygen; the most abundant element in your body by mass."],
    [9,"F","Fluorine",17,1, [0,0,0.5,0.5,0,0,0], "Rare and fragile; its exact stellar source is still debated."],
    [10,"Ne","Neon",18,1, one(CC), ""],
    [11,"Na","Sodium",1,2, one(CC), ""],
    [12,"Mg","Magnesium",2,2, one(CC), "Built in the burning shells of massive stars before they explode."],
    [13,"Al","Aluminium",13,2, one(CC), ""],
    [14,"Si","Silicon",14,2, [0,0,0,0.65,0.35,0,0], "Rock and sand: mostly core-collapse, with a Type Ia slice."],
    [15,"P","Phosphorus",15,2, one(CC), "Essential to your DNA; forged in massive stars."],
    [16,"S","Sulfur",16,2, [0,0,0,0.7,0.3,0,0], ""],
    [17,"Cl","Chlorine",17,2, one(CC), ""],
    [18,"Ar","Argon",18,2, [0,0,0,0.65,0.35,0,0], ""],
    [19,"K","Potassium",1,3, [0,0,0,0.8,0.2,0,0], ""],
    [20,"Ca","Calcium",2,3, [0,0,0,0.7,0.3,0,0], "Forged in supernovae; the calcium in your bones."],
    [21,"Sc","Scandium",3,3, one(CC), ""],
    [22,"Ti","Titanium",4,3, [0,0,0,0.7,0.3,0,0], ""],
    [23,"V","Vanadium",5,3, [0,0,0,0.7,0.3,0,0], ""],
    [24,"Cr","Chromium",6,3, [0,0,0,0.5,0.5,0,0], ""],
    [25,"Mn","Manganese",7,3, [0,0,0,0.4,0.6,0,0], ""],
    [26,"Fe","Iron",8,3, [0,0,0,0.5,0.5,0,0], "The end of fusion's road; the iron in your blood. Half Type Ia, half core-collapse."],
    [27,"Co","Cobalt",9,3, [0,0,0,0.6,0.4,0,0], ""],
    [28,"Ni","Nickel",10,3, [0,0,0,0.4,0.6,0,0], "Much decays from radioactive nickel-56 minted in white-dwarf (Type Ia) supernovae."],
    [29,"Cu","Copper",11,3, [0,0,0,0.7,0.3,0,0], ""],
    [30,"Zn","Zinc",12,3, [0,0,0,0.7,0.3,0,0], ""],
    [31,"Ga","Gallium",13,3, [0,0,0.3,0.5,0,0.2,0], ""],
    [32,"Ge","Germanium",14,3, [0,0,0.4,0.4,0,0.2,0], ""],
    [33,"As","Arsenic",15,3, [0,0,0.3,0.3,0,0.4,0], ""],
    [34,"Se","Selenium",16,3, [0,0,0.4,0.2,0,0.4,0], ""],
    [35,"Br","Bromine",17,3, [0,0,0.3,0.2,0,0.5,0], ""],
    [36,"Kr","Krypton",18,3, [0,0,0.4,0.3,0,0.3,0], ""],
    [37,"Rb","Rubidium",1,4, [0,0,0.5,0.2,0,0.3,0], ""],
    [38,"Sr","Strontium",2,4, [0,0,0.7,0.1,0,0.2,0], "Its glow was detected in the GW170817 neutron-star merger."],
    [39,"Y","Yttrium",3,4, [0,0,0.7,0,0,0.3,0], ""],
    [40,"Zr","Zirconium",4,4, [0,0,0.7,0,0,0.3,0], ""],
    [41,"Nb","Niobium",5,4, [0,0,0.6,0,0,0.4,0], ""],
    [42,"Mo","Molybdenum",6,4, [0,0,0.5,0,0,0.5,0], ""],
    [43,"Tc","Technetium",7,4, one(HM), "No stable isotope; essentially none survives naturally on Earth."],
    [44,"Ru","Ruthenium",8,4, [0,0,0.4,0,0,0.6,0], ""],
    [45,"Rh","Rhodium",9,4, [0,0,0.3,0,0,0.7,0], ""],
    [46,"Pd","Palladium",10,4, [0,0,0.5,0,0,0.5,0], ""],
    [47,"Ag","Silver",11,4, [0,0,0.2,0,0,0.8,0], "Mostly forged in neutron-star collisions."],
    [48,"Cd","Cadmium",12,4, [0,0,0.5,0,0,0.5,0], ""],
    [49,"In","Indium",13,4, [0,0,0.4,0,0,0.6,0], ""],
    [50,"Sn","Tin",14,4, [0,0,0.6,0,0,0.4,0], ""],
    [51,"Sb","Antimony",15,4, [0,0,0.4,0,0,0.6,0], ""],
    [52,"Te","Tellurium",16,4, [0,0,0.3,0,0,0.7,0], ""],
    [53,"I","Iodine",17,4, [0,0,0.1,0,0,0.9,0], "The iodine in your thyroid, forged in neutron-star mergers."],
    [54,"Xe","Xenon",18,4, [0,0,0.5,0,0,0.5,0], ""],
    [55,"Cs","Caesium",1,5, [0,0,0.4,0,0,0.6,0], ""],
    [56,"Ba","Barium",2,5, [0,0,0.8,0,0,0.2,0], "About 80% slow-process (AGB stars), 20% r-process."],
    [72,"Hf","Hafnium",4,5, [0,0,0.6,0,0,0.4,0], ""],
    [73,"Ta","Tantalum",5,5, [0,0,0.5,0,0,0.5,0], ""],
    [74,"W","Tungsten",6,5, [0,0,0.6,0,0,0.4,0], ""],
    [75,"Re","Rhenium",7,5, [0,0,0.2,0,0,0.8,0], ""],
    [76,"Os","Osmium",8,5, [0,0,0.2,0,0,0.8,0], ""],
    [77,"Ir","Iridium",9,5, [0,0,0.15,0,0,0.85,0], "The iridium layer marking the dinosaur-killing impact came from space."],
    [78,"Pt","Platinum",10,5, [0,0,0.1,0,0,0.9,0], "Neutron-star mergers are the main source."],
    [79,"Au","Gold",11,5, [0,0,0.1,0,0,0.9,0], "Made mostly when neutron stars collide - GW170817, 2017."],
    [80,"Hg","Mercury",12,5, [0,0,0.5,0,0,0.5,0], ""],
    [81,"Tl","Thallium",13,5, [0,0,0.6,0,0,0.4,0], ""],
    [82,"Pb","Lead",14,5, [0,0,0.8,0,0,0.2,0], "The end of the slow-process chain in AGB stars."],
    [83,"Bi","Bismuth",15,5, [0,0,0.6,0,0,0.4,0], ""],
    [84,"Po","Polonium",16,5, one(R), "Radioactive; a fleeting decay product of heavier r-process nuclei."],
    [85,"At","Astatine",17,5, one(R), ""],
    [86,"Rn","Radon",18,5, one(R), ""],
    [87,"Fr","Francium",1,6, one(R), ""],
    [88,"Ra","Radium",2,6, one(R), ""],
    [104,"Rf","Rutherfordium",4,6, one(HM), ""],
    [105,"Db","Dubnium",5,6, one(HM), ""],
    [106,"Sg","Seaborgium",6,6, one(HM), ""],
    [107,"Bh","Bohrium",7,6, one(HM), ""],
    [108,"Hs","Hassium",8,6, one(HM), ""],
    [109,"Mt","Meitnerium",9,6, one(HM), ""],
    [110,"Ds","Darmstadtium",10,6, one(HM), ""],
    [111,"Rg","Roentgenium",11,6, one(HM), ""],
    [112,"Cn","Copernicium",12,6, one(HM), ""],
    [113,"Nh","Nihonium",13,6, one(HM), ""],
    [114,"Fl","Flerovium",14,6, one(HM), ""],
    [115,"Mc","Moscovium",15,6, one(HM), ""],
    [116,"Lv","Livermorium",16,6, one(HM), ""],
    [117,"Ts","Tennessine",17,6, one(HM), ""],
    [118,"Og","Oganesson",18,6, one(HM), "Human-made superheavy; a few atoms, gone in milliseconds."],
    // lanthanides gy 7.4
    [57,"La","Lanthanum",3,7.4, [0,0,0.7,0,0,0.3,0], ""],
    [58,"Ce","Cerium",4,7.4, [0,0,0.8,0,0,0.2,0], ""],
    [59,"Pr","Praseodymium",5,7.4, [0,0,0.5,0,0,0.5,0], ""],
    [60,"Nd","Neodymium",6,7.4, [0,0,0.6,0,0,0.4,0], ""],
    [61,"Pm","Promethium",7,7.4, one(HM), "No stable isotope; not found naturally in usable amounts."],
    [62,"Sm","Samarium",8,7.4, [0,0,0.4,0,0,0.6,0], ""],
    [63,"Eu","Europium",9,7.4, [0,0,0.05,0,0,0.95,0], "The textbook r-process element; almost all from neutron-star mergers."],
    [64,"Gd","Gadolinium",10,7.4, [0,0,0.4,0,0,0.6,0], ""],
    [65,"Tb","Terbium",11,7.4, [0,0,0.3,0,0,0.7,0], ""],
    [66,"Dy","Dysprosium",12,7.4, [0,0,0.3,0,0,0.7,0], ""],
    [67,"Ho","Holmium",13,7.4, [0,0,0.2,0,0,0.8,0], ""],
    [68,"Er","Erbium",14,7.4, [0,0,0.3,0,0,0.7,0], ""],
    [69,"Tm","Thulium",15,7.4, [0,0,0.3,0,0,0.7,0], ""],
    [70,"Yb","Ytterbium",16,7.4, [0,0,0.4,0,0,0.6,0], ""],
    [71,"Lu","Lutetium",17,7.4, [0,0,0.3,0,0,0.7,0], ""],
    // actinides gy 8.4
    [89,"Ac","Actinium",3,8.4, one(R), ""],
    [90,"Th","Thorium",4,8.4, one(R), "Forged in neutron-star mergers; its slow decay warms Earth's interior."],
    [91,"Pa","Protactinium",5,8.4, one(R), ""],
    [92,"U","Uranium",6,8.4, one(R), "The heaviest natural element; made in neutron-star mergers, it powers reactors."],
    [93,"Np","Neptunium",7,8.4, one(HM), ""],
    [94,"Pu","Plutonium",8,8.4, one(HM), "Only trace amounts occur naturally; effectively human-made."],
    [95,"Am","Americium",9,8.4, one(HM), ""],
    [96,"Cm","Curium",10,8.4, one(HM), ""],
    [97,"Bk","Berkelium",11,8.4, one(HM), ""],
    [98,"Cf","Californium",12,8.4, one(HM), ""],
    [99,"Es","Einsteinium",13,8.4, one(HM), ""],
    [100,"Fm","Fermium",14,8.4, one(HM), ""],
    [101,"Md","Mendelevium",15,8.4, one(HM), ""],
    [102,"No","Nobelium",16,8.4, one(HM), ""],
    [103,"Lr","Lawrencium",17,8.4, one(HM), ""]
  ];

  var ELS = [];
  (function(){
    for (var i=0;i<D.length;i++){
      var d = D[i];
      ELS.push({ z:d[0], sym:d[1], name:d[2], gx:d[3], gy:d[4], o:d[5], note:d[6]||"", _idx:i });
    }
  })();

  // ---- state ----
  var state = { hover:-1, pinned:-1, set:[true,true,true,true,true,true,true], allActive:true };

  // ---- narrow pan state ----
  var panX = 0, panMin = 0, panMax = 0;

  function setCount(){ var c=0; for(var i=0;i<7;i++) if(state.set[i]) c++; return c; }
  function setAll(){ for(var i=0;i<7;i++) state.set[i]=true; state.allActive=true; }
  function onlyThis(i){ if(!state.set[i]) return false; return setCount()===1; }
  function toggleCat(i){
    if (state.allActive){ for(var k=0;k<7;k++) state.set[k]=false; state.set[i]=true; state.allActive=false; }
    else if (onlyThis(i)){ setAll(); }
    else { state.set[i]=!state.set[i]; if(setCount()===0) setAll(); state.allActive=(setCount()===7); }
    updateChips();
  }

  // ---- controls (legend chips) ----
  var chipEls = [];
  var cbar = controls;
  if (!cbar){
    cbar = SN.el("div.sim-controls");
    cbar.style.position="absolute"; cbar.style.left="6px"; cbar.style.top="6px"; cbar.style.zIndex="6";
    host.appendChild(cbar);
  }
  (function(){
    var grp = SN.el("div.grp");
    for (var i=0;i<7;i++){
      (function(idx){
        var dot = '<span style="display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:5px;vertical-align:middle;background:'+CATS[idx].color+'"></span>';
        var chip = SN.el("button.chip.on", { html: dot + CATS[idx].chip, onclick:function(){ toggleCat(idx); } });
        chipEls.push(chip);
        grp.appendChild(chip);
      })(i);
    }
    cbar.appendChild(grp);
  })();
  function updateChips(){
    for (var i=0;i<chipEls.length;i++){
      var on = state.allActive || state.set[i];
      chipEls[i].className = on ? "chip on" : "chip";
    }
  }

  // ---- canvas ----
  var api = SN.canvas(host, function(){});
  api.canvas.style.touchAction = "pan-y";
  var ctx = api.ctx;
  var LAY = null;

  function isNarrow(){ return api.w < 560; }

  // ---- geometry helpers ----
  function rrect(x,y,w,h,r){
    if(r>w/2)r=w/2; if(r>h/2)r=h/2; if(r<0)r=0;
    ctx.beginPath();
    ctx.moveTo(x+r,y);
    ctx.arcTo(x+w,y,x+w,y+h,r);
    ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);
    ctx.arcTo(x,y,x+w,y,r);
    ctx.closePath();
  }
  function computeLayout(w,h){
    if (w >= 560){
      // ---- WIDE / DESKTOP LAYOUT (unchanged) ----
      var pad = u.clamp(w*0.02, 6, 16);
      var headH = u.clamp(w*0.03, 12, 20);
      var gy0 = pad + headH + 6;
      var availH = h - gy0 - pad;
      var availW = w - 2*pad;
      var cell = Math.min(availW/18, availH/9.5);
      if (cell < 4) cell = 4;
      var gridW = 18*cell;
      var gridX = (w - gridW)/2;
      var gridH = 9.4*cell;
      var gridY = gy0 + Math.max(0,(availH-gridH)*0.22);
      var box = { x: gridX + 2*cell + 3, y: gridY + 3, w: 10*cell - 6, h: 2.85*cell - 6 };
      panMin = 0; panMax = 0;
      return { cell:cell, gridX:gridX, gridY:gridY, pad:pad, headY:pad, box:box, narrow:false, pannable:false };
    }

    // ---- NARROW / MOBILE LAYOUT ----
    var npad = u.clamp(w*0.02, 6, 12);
    var nheadH = Math.round(u.clamp(w*0.028, 11, 16));
    var hintH = 14;
    var ngy0 = npad + nheadH + hintH + 6;
    var infoMin = u.clamp(h*0.24, 84, 132);
    var gAvail = h - ngy0 - npad - infoMin - 6;
    if (gAvail < 80) gAvail = 80;
    var ncell = gAvail/9.5;
    if (ncell < 28) ncell = 28;   // finger-friendly minimum (symbol >= 11px)
    if (ncell > 56) ncell = 56;
    var gh = 9.4*ncell;
    var stripTop = ngy0 + gh + 6;
    var ninfoH = h - stripTop - npad;
    if (ninfoH < 70){
      ninfoH = 70;
      stripTop = h - ninfoH - npad;
      // if the grid would now dip into the strip, shrink cells to fit
      if (ngy0 + 9.4*ncell > stripTop){
        ncell = (stripTop - ngy0 - 6)/9.4;
        if (ncell < 16) ncell = 16;
        gh = 9.4*ncell;
      }
    }
    var navailW = w - 2*npad;
    var ngridW = 18*ncell;
    var ngridX, pmin=0, pmax=0;
    if (ngridW <= navailW){
      ngridX = (w - ngridW)/2;
    } else {
      ngridX = npad;
      pmin = navailW - ngridW;   // most-negative pan (reveals right edge)
      pmax = 0;
    }
    panMin = pmin; panMax = pmax;
    var nbox = { x: npad, y: stripTop, w: navailW, h: ninfoH };
    return {
      cell: ncell, gridX: ngridX, gridY: ngy0, pad: npad, headY: npad,
      box: nbox, narrow: true, pannable: (ngridW > navailW),
      hintY: npad + nheadH + 2
    };
  }
  function gridOriginX(){ return LAY.gridX + (LAY.narrow ? panX : 0); }
  function cellRect(el){
    return { x: gridOriginX() + (el.gx-1)*LAY.cell, y: LAY.gridY + el.gy*LAY.cell, w: LAY.cell, h: LAY.cell };
  }
  function hitTest(px,py){
    if(!LAY) return -1;
    for (var i=0;i<ELS.length;i++){
      var r = cellRect(ELS[i]);
      if (px>=r.x && px<=r.x+r.w && py>=r.y && py<=r.y+r.h) return i;
    }
    return -1;
  }

  // ---- drawing ----
  function drawCell(el, pulse){
    var r = cellRect(el), cell = LAY.cell;
    var narrow = LAY.narrow;
    var p = Math.max(1, cell*0.06);
    var x=r.x+p, y=r.y+p, w=r.w-2*p, h=r.h-2*p;
    var rad = Math.max(2, cell*0.12);
    var all = state.allActive, i, anyActive=false;
    for (i=0;i<7;i++){ if(el.o[i]>0 && state.set[i]) anyActive=true; }
    var dim = all ? 1 : (anyActive ? 1 : 0.16);
    var isHi = (state.hover===el._idx) || (state.pinned===el._idx);

    ctx.save();
    if (isHi){
      ctx.globalAlpha = 0.55;
      rrect(x-2.5,y-2.5,w+5,h+5,rad+2);
      ctx.strokeStyle = u.rgba(pal.bright, 0.55*pulse);
      ctx.lineWidth = 2.5; ctx.stroke();
    }
    ctx.globalAlpha = dim;
    // slices
    rrect(x,y,w,h,rad);
    ctx.save(); ctx.clip();
    var acc=0;
    for (i=0;i<7;i++){
      var f=el.o[i]; if(f<=0) continue;
      var sw=w*f;
      var active = all || state.set[i];
      ctx.fillStyle = active ? CATS[i].color : SN.u.mix(CATS[i].color, pal.bg, 0.74);
      ctx.globalAlpha = dim * (active ? 0.94 : 0.9);
      ctx.fillRect(x+acc, y, sw+0.7, h);
      acc += sw;
    }
    ctx.restore();
    ctx.globalAlpha = dim;
    rrect(x,y,w,h,rad);
    ctx.lineWidth = isHi ? 1.5 : 0.7;
    ctx.strokeStyle = isHi ? pal.bright : u.rgba(pal.bright, 0.16);
    ctx.stroke();
    // symbol
    ctx.shadowColor = "rgba(0,0,0,0.85)";
    ctx.shadowBlur = Math.max(1, cell*0.14);
    ctx.fillStyle = pal.white;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "600 " + Math.max(narrow?11:7, Math.round(cell*0.4)) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(el.sym, x+w/2, y+h*0.57);
    ctx.shadowBlur = 0;
    // atomic number (secondary annotation) — kept legible; dropped on narrow when it would crowd
    var showZ = cell > 13 && (!narrow || cell >= 34);
    if (showZ){
      ctx.font = (narrow ? Math.max(11, Math.round(cell*0.24)) : Math.max(6, Math.round(cell*0.24))) + "px ui-monospace, monospace";
      ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillStyle = u.rgba(pal.white, 0.82);
      ctx.fillText(""+el.z, x+cell*0.08, y+cell*0.05);
    }
    ctx.restore();
  }

  function drawPlaceholder(gx, gy, label){
    var x = gridOriginX() + (gx-1)*LAY.cell, y = LAY.gridY + gy*LAY.cell, cell=LAY.cell;
    var p = Math.max(1, cell*0.06);
    ctx.save();
    ctx.globalAlpha = 0.6;
    rrect(x+p, y+p, cell-2*p, cell-2*p, Math.max(2,cell*0.12));
    ctx.setLineDash([2,2]);
    ctx.strokeStyle = u.rgba(pal.muted, 0.5);
    ctx.lineWidth = 0.7; ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = u.rgba(pal.muted, 0.85);
    ctx.textAlign="center"; ctx.textBaseline="middle";
    ctx.font = Math.max(LAY.narrow?11:6, Math.round(cell*0.22)) + "px ui-monospace, monospace";
    ctx.fillText(label, x+cell/2, y+cell/2);
    ctx.restore();
  }

  function fracList(el){
    var out=[], i;
    for (i=0;i<7;i++){ if(el.o[i]>0) out.push({ i:i, f:el.o[i] }); }
    out.sort(function(a,b){ return b.f-a.f; });
    return out;
  }

  function drawPie(cx, cy, rad, el){
    var fl = fracList(el), a0 = -Math.PI/2, i;
    for (i=0;i<fl.length;i++){
      var a1 = a0 + fl[i].f*TAU;
      ctx.beginPath(); ctx.moveTo(cx,cy);
      ctx.arc(cx,cy,rad,a0,a1); ctx.closePath();
      ctx.fillStyle = CATS[fl[i].i].color; ctx.fill();
      a0 = a1;
    }
    ctx.beginPath(); ctx.arc(cx,cy,rad,0,TAU);
    ctx.strokeStyle = u.rgba(pal.bright, 0.3); ctx.lineWidth = 1; ctx.stroke();
  }

  function wrap(text, x, y, maxW, lh, maxLines){
    var words = text.split(" "), lines=[], cur="", i;
    for (i=0;i<words.length;i++){
      var t = cur ? cur+" "+words[i] : words[i];
      if (ctx.measureText(t).width > maxW && cur){ lines.push(cur); cur = words[i]; }
      else cur = t;
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines){
      lines = lines.slice(0, maxLines);
      var last = lines[maxLines-1];
      while (ctx.measureText(last+"…").width > maxW && last.length>1) last = last.slice(0,-1);
      lines[maxLines-1] = last + "…";
    }
    for (i=0;i<lines.length;i++) ctx.fillText(lines[i], x, y+i*lh);
    return y + lines.length*lh;
  }

  function drawReadout(){
    var b = LAY.box; if (b.w < 40 || b.h < 24) return;
    var narrow = LAY.narrow;
    ctx.save();
    rrect(b.x, b.y, b.w, b.h, 6);
    ctx.fillStyle = u.rgba(pal.panel, 0.92); ctx.fill();
    ctx.strokeStyle = u.rgba(pal.bright, 0.14); ctx.lineWidth = 1; ctx.stroke();
    rrect(b.x, b.y, b.w, b.h, 6); ctx.clip();

    var idx = state.hover>=0 ? state.hover : state.pinned;
    var padL = 10, ix = b.x+padL, iy = b.y+9;
    var big = u.clamp(b.h*0.17, narrow?12:11, 18);
    var mid = u.clamp(b.h*0.11, narrow?11:9, 13);
    var sm  = u.clamp(b.h*0.095, narrow?11:8, 12);

    if (idx < 0){
      ctx.textAlign="left"; ctx.textBaseline="top";
      ctx.fillStyle = pal.bright;
      ctx.font = "600 " + Math.round(big) + "px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(narrow ? "Cosmic origins" : "A periodic table of cosmic origins", ix, iy);
      iy += big*1.35;
      ctx.fillStyle = pal.ink;
      ctx.font = Math.round(sm) + "px ui-sans-serif, system-ui, sans-serif";
      iy = wrap(narrow
                ? "H + He are ~98% of ordinary matter; heavier elements are the rest."
                : "H + He are about 98% of ordinary matter; everything heavier is the other ~1-2%.",
                ix, iy, b.w-2*padL, sm*1.3, 2);
      iy += 2;
      ctx.fillStyle = pal.muted;
      wrap(narrow
           ? "Tap an element. Drag the table sideways to explore."
           : "Tap any element for its origin story. Tap a legend chip to isolate one source.",
           ix, iy, b.w-2*padL, sm*1.3, 2);
      ctx.restore();
      return;
    }

    var el = ELS[idx];
    var ts = Math.min(b.h-18, b.w*0.2, LAY.cell*1.9);
    if (ts < 16) ts = 16;
    drawPie(b.x+9+ts/2, b.y+9+ts/2, ts/2, el);
    var tx = b.x + 9 + ts + 12;
    var tw = b.x + b.w - 8 - tx;
    var ty = b.y + 9;

    ctx.textAlign="left"; ctx.textBaseline="top";
    ctx.fillStyle = pal.bright;
    ctx.font = "600 " + Math.round(big) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(el.sym + "  " + el.name, tx, ty);
    ty += big*1.3;

    var fl = fracList(el);
    ctx.fillStyle = pal.ink;
    ctx.font = Math.round(mid) + "px ui-monospace, monospace";
    ctx.fillText("Z = " + el.z, tx, ty);
    ty += mid*1.45;

    // stacked fraction bar
    var barH = Math.max(6, mid*0.7), acc=0, i;
    for (i=0;i<fl.length;i++){
      var sw = tw * fl[i].f;
      ctx.fillStyle = CATS[fl[i].i].color;
      ctx.fillRect(tx+acc, ty, sw+0.6, barH);
      acc += sw;
    }
    ctx.strokeStyle = u.rgba(pal.bright,0.2); ctx.lineWidth=0.7;
    ctx.strokeRect(tx, ty, tw, barH);
    ty += barH + 5;

    // fraction labels
    ctx.font = Math.round(sm) + "px ui-sans-serif, system-ui, sans-serif";
    var fstr = "";
    for (i=0;i<fl.length;i++){
      if (i>0) fstr += "  ·  ";
      fstr += CATS[fl[i].i].lbl + " " + Math.round(fl[i].f*100) + "%";
    }
    ctx.fillStyle = pal.ink;
    ty = wrap(fstr, tx, ty, tw, sm*1.3, 2);
    ty += 2;

    // note (spans full width under everything if room)
    var note = el.note;
    if (!note){
      note = "Primarily from " + CATS[fl[0].i].name.toLowerCase() + ".";
    }
    var nx = b.x + padL, nw = b.w - 2*padL;
    var ny = Math.max(ty, b.y + 9 + ts + 4);
    ctx.fillStyle = pal.gold;
    ctx.font = "italic " + Math.round(sm) + "px ui-sans-serif, system-ui, sans-serif";
    wrap(note, nx, ny, nw, sm*1.32, 2);

    ctx.restore();
  }

  // ---- pointer ----
  var interacting = false;
  var downOnCanvas = false, dragStartX = 0, dragStartY = 0, dragBasePan = 0, dragMoved = false, panGesture = false;
  function toLocal(e){
    var r = api.canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  api.canvas.addEventListener("pointermove", function(e){
    var pt = toLocal(e);
    if (interacting && isNarrow()){
      var dx = pt.x - dragStartX, dy = pt.y - dragStartY;
      if (!panGesture && LAY && LAY.pannable && Math.abs(dx) > 4 && Math.abs(dx) >= Math.abs(dy)){
        panGesture = true;
      }
      if (panGesture){
        dragMoved = true;
        panX = dragBasePan + dx;
        if (panX < panMin) panX = panMin;
        if (panX > panMax) panX = panMax;
        state.hover = -1;
        if (e.pointerType === "touch") e.preventDefault();
        return;
      }
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved = true;
      state.hover = hitTest(pt.x, pt.y);
      return;
    }
    state.hover = hitTest(pt.x, pt.y);
    if (interacting && e.pointerType === "touch") e.preventDefault();
  });
  api.canvas.addEventListener("pointerleave", function(){ state.hover = -1; });
  api.canvas.addEventListener("pointerdown", function(e){
    interacting = true; downOnCanvas = true;
    var pt = toLocal(e);
    if (isNarrow()){
      dragStartX = pt.x; dragStartY = pt.y; dragBasePan = panX; dragMoved = false; panGesture = false;
      state.hover = hitTest(pt.x, pt.y);
      return;
    }
    var idx = hitTest(pt.x, pt.y);
    if (idx >= 0){ state.pinned = (state.pinned===idx) ? -1 : idx; state.hover = idx; }
    else state.pinned = -1;
  });
  window.addEventListener("pointerup", function(e){
    if (downOnCanvas && isNarrow() && !dragMoved){
      var pt = toLocal(e);
      var inBox = LAY && LAY.box &&
                  pt.x>=LAY.box.x && pt.x<=LAY.box.x+LAY.box.w &&
                  pt.y>=LAY.box.y && pt.y<=LAY.box.y+LAY.box.h;
      if (!inBox){
        var idx = hitTest(pt.x, pt.y);
        if (idx >= 0){ state.pinned = (state.pinned===idx) ? -1 : idx; state.hover = idx; }
        else state.pinned = -1;
      }
    }
    interacting = false; downOnCanvas = false; panGesture = false;
  });

  // ---- loop ----
  updateChips();
  SN.loop(host, function(dt, t){
    var w = api.w, h = api.h;
    if (w < 2 || h < 2) return;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = pal.bg; ctx.fillRect(0,0,w,h);
    LAY = computeLayout(w,h);
    var narrow = LAY.narrow;
    // keep pan within bounds each frame
    if (narrow){
      if (panX < panMin) panX = panMin;
      if (panX > panMax) panX = panMax;
    } else {
      panX = 0;
    }
    var cell = LAY.cell;
    var pulse = reduced ? 1 : (0.7 + 0.3*Math.sin(t*3));

    // headline
    ctx.textAlign="center"; ctx.textBaseline="top";
    ctx.fillStyle = u.rgba(pal.ink, 0.85);
    ctx.font = Math.round(u.clamp(w*0.02, narrow?11:9, 13)) + "px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(narrow ? "The forge — every element's origin" : "The forge — where every element was made", w/2, LAY.headY);

    // narrow pan hint
    if (narrow && LAY.pannable){
      ctx.textAlign="center"; ctx.textBaseline="top";
      ctx.fillStyle = u.rgba(pal.muted, 0.9);
      ctx.font = "11px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText("‹ drag sideways · swipe → ›", w/2, LAY.hintY);
    }

    // f-block markers
    drawPlaceholder(3, 5, "57-71");
    drawPlaceholder(3, 6, "89-103");

    // cells
    for (var i=0;i<ELS.length;i++) drawCell(ELS[i], pulse);

    // readout panel
    drawReadout();
  });
});

/* ---- widget: remnants ---------------------------------------------------- */
SN.mount("remnants", function (host, controls) {
  var P = SN.palette, U = SN.u;
  var TAU = U.TAU, clamp = U.clamp, lerp = U.lerp, mapv = U.map, mix = U.mix, rgba = U.rgba;
  var RM = SN.reducedMotion;

  // ---- state ----------------------------------------------------------
  var state = {
    sel: "white-dwarf",
    spinHz: 30,
    bhMass: 10
  };
  var spinPhase = 0;      // accumulated pulsar rotations
  var flareClock = 0;     // magnetar flare timer (s)
  var flareEnergy = 0;    // 0..1 decaying burst
  var HN = 160;
  var hist = new Array(HN);
  var histI = 0;
  var hi;
  for (hi = 0; hi < HN; hi++) hist[hi] = 0;
  var lastBright = 0;
  var flashDot = 0;

  // ---- helpers --------------------------------------------------------
  function log10(x) { return Math.log(x) / Math.LN10; }

  function text(ctx, s, x, y, font, color, align) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(s, x, y);
  }

  function glow(ctx, cx, cy, r0, r1, hex, a0) {
    var g = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
    g.addColorStop(0, rgba(hex, a0));
    g.addColorStop(1, rgba(hex, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r1, 0, TAU); ctx.fill();
  }

  function ball(ctx, cx, cy, r, coreHex, midHex, edgeHex) {
    // limb-shaded sphere with an off-centre highlight
    var g = ctx.createRadialGradient(cx - r * 0.32, cy - r * 0.34, r * 0.05, cx, cy, r);
    g.addColorStop(0, coreHex);
    g.addColorStop(0.55, midHex);
    g.addColorStop(1, edgeHex);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // faint limb rim
    ctx.strokeStyle = rgba(P.bright, 0.12);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
  }

  // ---- content model --------------------------------------------------
  function info() {
    var s = state.sel;
    if (s === "white-dwarf") {
      return {
        name: "WHITE DWARF",
        color: mix(P.white, P.blue, 0.45),
        lines: [
          ["MASS", "~0.6 M☉"],
          ["RADIUS", "~6,000 km (≈ Earth)"],
          ["DENSITY", "~1×10⁹ kg/m³"],
          ["", "1 cm³ ≈ 1 tonne"],
          ["SUPPORT", "electron degeneracy"],
          ["MAX", "1.4 M☉ (Chandrasekhar)"]
        ],
        note: "Ember of a Sun-like star. No fusion left — it just cools and fades forever."
      };
    }
    if (s === "neutron-star") {
      return {
        name: "NEUTRON STAR",
        color: mix(P.white, P.ice, 0.5),
        lines: [
          ["MASS", "~1.4 M☉"],
          ["RADIUS", "~11 km (a city)"],
          ["DENSITY", "~4×10¹⁷ kg/m³"],
          ["", "1 tsp ≈ 10⁹ tonnes"],
          ["GRAVITY", "~2×10¹¹ g"],
          ["ESCAPE", "~0.6 c"]
        ],
        note: "Neutron-degenerate core. Gravity is so strong it bends light around the limb."
      };
    }
    if (s === "pulsar") {
      var hz = state.spinHz;
      var per = 1000 / hz;
      return {
        name: "PULSAR",
        color: P.cyan,
        lines: [
          ["SPIN", hz + " Hz"],
          ["PERIOD", (hz < 10 ? per.toFixed(0) : per.toFixed(1)) + " ms"],
          ["STAR", "~1.4 M☉ · R ~11 km"],
          ["BEAMS", "twin · mag axis ~20°"],
          ["", "Crab ≈ 30 Hz"],
          ["MSP", "up to 716 Hz"]
        ],
        note: "A spinning neutron star. Radio beams sweep like a lighthouse — one blip per pass."
      };
    }
    if (s === "magnetar") {
      return {
        name: "MAGNETAR",
        color: P.violet,
        lines: [
          ["FIELD", "~10¹¹ T"],
          ["", "~1000× a normal pulsar"],
          ["STAR", "~1.4 M☉ · R ~11 km"],
          ["EVENTS", "giant γ-flares"],
          ["", "strongest magnets known"]
        ],
        note: "A neutron star with an extreme field. Starquakes unleash giant gamma-ray flares."
      };
    }
    // black hole
    var M = state.bhMass;
    var Rs = 2.95 * M;
    return {
      name: "BLACK HOLE",
      color: P.orange,
      lines: [
        ["MASS", M + " M☉"],
        ["HORIZON", Rs.toFixed(0) + " km"],
        ["RULE", "~3 km per M☉"],
        ["PHOTON RING", "1.5× horizon"],
        ["FORMS", "above TOV ~2.2–2.9 M☉"]
      ],
      note: "Gravity wins completely. Past the event horizon, not even light escapes."
    };
  }

  // ---- canvas + layout ------------------------------------------------
  var stars = [];
  var lastW = -1, lastH = -1;
  var rng = U.rng(1337);

  function buildStars(w, h) {
    stars.length = 0;
    var n = Math.min(70, Math.round(w * h / 5200));
    var i;
    for (i = 0; i < n; i++) {
      stars.push({ x: rng() * w, y: rng() * h, r: 0.4 + rng() * 1.1, p: rng() * TAU, s: 0.4 + rng() * 0.7 });
    }
  }

  function onResize(a) {
    if (a.w !== lastW || a.h !== lastH) {
      lastW = a.w; lastH = a.h;
      buildStars(a.w, a.h);
    }
  }

  var api = SN.canvas(host, onResize);
  api.canvas.style.touchAction = "pan-y";

  var L = {};
  function layout(w, h) {
    var scaleH = clamp(h * 0.19, 52, 96);
    var mainH = h - scaleH;
    var wide = w >= 600;
    L.scaleH = scaleH;
    L.mainH = mainH;
    L.wide = wide;
    if (wide) {
      // ---- desktop / wide: unchanged ----
      L.fs = clamp(w * 0.017, 10, 13);
      L.noteFs = L.fs * 0.92;
      L.cx = w * 0.30;
      L.cy = mainH * 0.50;
      L.R = Math.min(mainH * 0.34, w * 0.15);
      L.px = w * 0.555;
      L.pw = w * 0.40;
      L.compact = false;
      L.readTop = 0;
    } else {
      // ---- narrow: vertical stack (visual on top, readout below, ladder pinned) ----
      var fsN = clamp(w * 0.030, 11, 13);   // font floor >= 11
      L.fs = fsN;
      L.noteFs = Math.max(11, fsN * 0.86);
      var lh = fsN * 1.7;
      // reserved readout height: title + gap + 5 data lines + up to 3 note lines
      var readH = fsN * 1.2 + lh * 1.5 + 5 * lh + fsN * 0.6 + 3 * (fsN * 1.35) + fsN * 0.5;
      var top = 8;
      var gapVR = 14;                        // gap between visual and readout
      var visArea = mainH - readH - top - gapVR;
      if (visArea < 44) visArea = 44;        // keep a minimum visual band
      var R = Math.min(visArea * 0.46, w * 0.20);
      R = clamp(R, 18, w * 0.24);
      L.R = R;
      L.cx = w * 0.50;
      L.cy = top + visArea * 0.5;
      L.readTop = top + visArea + gapVR + fsN;  // title baseline
      L.px = w * 0.06;
      L.pw = w * 0.88;
      L.compact = true;
    }
    L.x0 = w * 0.07;
    L.x1 = w * 0.93;
    L.sy = h - scaleH * 0.42;
  }

  // ---- background -----------------------------------------------------
  function bg(ctx, w, h, t) {
    ctx.fillStyle = P.bg;
    ctx.fillRect(0, 0, w, h);
    var g = ctx.createRadialGradient(w * 0.5, h * 0.42, 10, w * 0.5, h * 0.42, Math.max(w, h) * 0.75);
    g.addColorStop(0, rgba(P.panel, 0.9));
    g.addColorStop(1, rgba(P.bg, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var i, st;
    for (i = 0; i < stars.length; i++) {
      st = stars[i];
      var tw = RM ? st.s : (0.55 + 0.45 * Math.sin(t * st.s + st.p));
      ctx.fillStyle = rgba(P.bright, 0.05 + 0.28 * tw);
      ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, TAU); ctx.fill();
    }
  }

  // ---- visuals --------------------------------------------------------
  function drawWhiteDwarf(ctx, cx, cy, R, t) {
    glow(ctx, cx, cy, R * 0.3, R * 2.4, mix(P.white, P.blue, 0.4), 0.34);
    ball(ctx, cx, cy, R, P.white, mix(P.white, P.blue, 0.5), mix(P.blue, P.bg, 0.35));
    // faint pulsing cooling shimmer
    var a = RM ? 0.10 : 0.08 + 0.05 * Math.sin(t * 0.8);
    glow(ctx, cx, cy, R * 0.5, R * 1.15, P.ice, a);
  }

  function drawNeutronStar(ctx, cx, cy, R, t) {
    glow(ctx, cx, cy, R * 0.3, R * 2.6, P.ice, 0.30);
    ball(ctx, cx, cy, R, P.white, mix(P.white, P.blue, 0.55), mix(P.blue, P.bg, 0.25));
    // hot magnetic poles with gravitational light-bending: spots wrap past the limb
    var pa = RM ? 0.35 : (0.35 + 0.12 * Math.sin(t * 1.3));
    // top pole
    hotSpot(ctx, cx, cy - R * 0.78, R * 0.5, pa);
    // bottom pole (dimmer, partly behind)
    hotSpot(ctx, cx, cy + R * 0.78, R * 0.42, pa * 0.7);
    // light-bending rim: bright arcs hugging the limb top & bottom (back pole wrapped into view)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(P.white, 0.22);
    ctx.lineWidth = R * 0.10;
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.99, -TAU * 0.30, -TAU * 0.20); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.99, TAU * 0.20, TAU * 0.30); ctx.stroke();
    ctx.restore();
  }

  function hotSpot(ctx, x, y, r, a) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(P.white, a));
    g.addColorStop(0.5, rgba(P.ice, a * 0.5));
    g.addColorStop(1, rgba(P.ice, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPulsar(ctx, cx, cy, R, t) {
    // 3D magnetic pole vector; spin axis vertical, mag axis tilted by beta, spun by phase.
    var beta = 0.35;                 // ~20 deg
    var incl = 0.39;                 // observer inclination ~22 deg
    var ang = spinPhase * TAU;
    var px = Math.sin(beta) * Math.cos(ang);
    var py = -Math.cos(beta);
    var pz = Math.sin(beta) * Math.sin(ang);
    // observer direction (unit)
    var ox = 0, oy = -Math.sin(incl), oz = Math.cos(incl);
    var d1 = px * ox + py * oy + pz * oz;
    var d2 = -d1;
    var bright = Math.pow(Math.max(0, d1), 12) + Math.pow(Math.max(0, d2), 12);
    lastBright = bright;

    // spin axis (faint dashed)
    ctx.strokeStyle = rgba(P.muted, 0.35);
    ctx.lineWidth = 1;
    dashLine(ctx, cx, cy - R * 2.5, cx, cy + R * 2.5, 4, 5);

    glow(ctx, cx, cy, R * 0.3, R * 2.2, P.ice, 0.22);

    // beams (draw the far one first)
    var order = pz >= 0 ? [-1, 1] : [1, -1];
    var k;
    for (k = 0; k < 2; k++) {
      var sgn = order[k];
      drawBeam(ctx, cx, cy, R, sgn * px, sgn * py, sgn * pz);
    }

    ball(ctx, cx, cy, R, P.white, mix(P.white, P.blue, 0.55), mix(P.blue, P.bg, 0.25));
    // pole hot spots follow the magnetic axis
    hotSpot(ctx, cx + px * R * 0.85, cy + py * R * 0.85, R * 0.45, 0.4 + 0.3 * Math.max(0, pz));
    hotSpot(ctx, cx - px * R * 0.85, cy - py * R * 0.85, R * 0.4, 0.4 + 0.3 * Math.max(0, -pz));
  }

  function drawBeam(ctx, cx, cy, R, dx, dy, dz) {
    var len = R * 3.4;
    var tx = cx + dx * len, ty = cy + dy * len;
    var nx = -dy, ny = dx;
    var nl = Math.sqrt(nx * nx + ny * ny) || 1;
    nx /= nl; ny /= nl;
    var wt = R * 0.7 * (0.7 + 0.5 * Math.max(0, dz));
    var toward = dz > 0;
    var aBase = toward ? 0.5 : 0.22;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var g = ctx.createLinearGradient(cx, cy, tx, ty);
    g.addColorStop(0, rgba(P.cyan, aBase));
    g.addColorStop(0.4, rgba(P.cyan, aBase * 0.5));
    g.addColorStop(1, rgba(P.cyan, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tx + nx * wt, ty + ny * wt);
    ctx.lineTo(tx - nx * wt, ty - ny * wt);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function dashLine(ctx, x0, y0, x1, y1, on, off) {
    var dx = x1 - x0, dy = y1 - y0;
    var len = Math.sqrt(dx * dx + dy * dy);
    var ux = dx / len, uy = dy / len;
    var d = 0, draw = true;
    ctx.beginPath();
    while (d < len) {
      var seg = draw ? on : off;
      var e = Math.min(d + seg, len);
      if (draw) { ctx.moveTo(x0 + ux * d, y0 + uy * d); ctx.lineTo(x0 + ux * e, y0 + uy * e); }
      d = e; draw = !draw;
    }
    ctx.stroke();
  }

  function drawMagnetar(ctx, cx, cy, R, t) {
    glow(ctx, cx, cy, R * 0.3, R * 2.6, P.violet, 0.28 + flareEnergy * 0.5);
    // tilted dense dipole field lines
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.18);
    var Nx = 0, Ny = -R * 0.98, Sx = 0, Sy = R * 0.98;
    var k, loops = 5;
    for (k = 1; k <= loops; k++) {
      var d = R * (0.9 + k * 0.75);
      var a = (0.42 - k * 0.05) * (1 + flareEnergy * 1.6);
      ctx.strokeStyle = rgba(mix(P.violet, P.magenta, k / loops), clamp(a, 0, 0.7));
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(Nx, Ny); ctx.quadraticCurveTo(-d, 0, Sx, Sy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(Nx, Ny); ctx.quadraticCurveTo(d, 0, Sx, Sy); ctx.stroke();
    }
    ctx.restore();

    ball(ctx, cx, cy, R, P.white, mix(P.white, P.violet, 0.5), mix(P.violet, P.bg, 0.3));
    hotSpot(ctx, cx, cy - R * 0.8, R * 0.5, 0.4);
    hotSpot(ctx, cx, cy + R * 0.8, R * 0.5, 0.4);

    // giant flare expanding shell
    if (flareEnergy > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      var fr = R * (1.2 + (1 - flareEnergy) * 3.4);
      ctx.strokeStyle = rgba(P.magenta, flareEnergy * 0.6);
      ctx.lineWidth = R * 0.18 * flareEnergy + 1;
      ctx.beginPath(); ctx.arc(cx, cy, fr, 0, TAU); ctx.stroke();
      glow(ctx, cx, cy, R * 0.4, R * 1.6, P.magenta, flareEnergy * 0.4);
      ctx.restore();
    }
  }

  function drawBlackHole(ctx, cx, cy, R, t) {
    var M = state.bhMass;
    // visual horizon radius scales with mass, clamped to the stage
    var rB = R * (0.42 + 0.58 * (M / 70));
    var tilt = 0.34; // disk squash

    // outer accretion glow
    glow(ctx, cx, cy, rB * 0.6, rB * 3.4, P.orange, 0.22);

    // accretion disk (full annulus, squashed) with Doppler asymmetry
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, tilt);
    var din = rB * 1.35, dout = rB * 3.0;
    var lg = ctx.createLinearGradient(-dout, 0, dout, 0);
    lg.addColorStop(0, rgba(P.gold, 0.85));      // approaching side (brighter)
    lg.addColorStop(0.5, rgba(P.orange, 0.5));
    lg.addColorStop(1, rgba(P.ember, 0.3));      // receding side
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.arc(0, 0, dout, 0, TAU);
    ctx.arc(0, 0, din, 0, TAU, true);
    ctx.fill();
    ctx.restore();

    // event horizon (true black)
    ctx.fillStyle = "#000000";
    ctx.beginPath(); ctx.arc(cx, cy, rB, 0, TAU); ctx.fill();

    // photon ring: bright thin ring hugging the shadow at ~1.5x horizon
    var pr = rB * 1.0; // shadow edge where the ring sits visually
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    var k, alphas = [0.15, 0.3, 0.7];
    var widths = [rB * 0.18, rB * 0.09, 1.6];
    for (k = 0; k < 3; k++) {
      ctx.strokeStyle = rgba(P.white, alphas[k]);
      ctx.lineWidth = widths[k];
      ctx.beginPath(); ctx.arc(cx, cy, pr, 0, TAU); ctx.stroke();
    }
    ctx.restore();

    // front half of the disk drawn over the lower limb
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(1, tilt);
    var lg2 = ctx.createLinearGradient(-dout, 0, dout, 0);
    lg2.addColorStop(0, rgba(P.gold, 0.9));
    lg2.addColorStop(0.5, rgba(P.orange, 0.55));
    lg2.addColorStop(1, rgba(P.ember, 0.35));
    ctx.fillStyle = lg2;
    ctx.beginPath();
    ctx.arc(0, 0, dout, 0, Math.PI, false);
    ctx.arc(0, 0, din, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // subtle photon-sphere label ring at literal 1.5x for reference
    ctx.strokeStyle = rgba(P.white, 0.10);
    ctx.lineWidth = 1;
    dashCircle(ctx, cx, cy, rB * 1.5, 3, 5);
  }

  function dashCircle(ctx, cx, cy, r, on, off) {
    var c = TAU * r;
    var seg = (on + off);
    var steps = Math.max(8, Math.floor(c / seg));
    var i;
    ctx.beginPath();
    for (i = 0; i < steps; i++) {
      var a0 = (i / steps) * TAU;
      var a1 = a0 + (on / seg) * (TAU / steps);
      ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
      ctx.arc(cx, cy, r, a0, a1);
    }
    ctx.stroke();
  }

  // ---- readout + light curve -----------------------------------------
  function drawReadout(ctx, w, inf) {
    var fs = L.fs;
    var mono = "px ui-monospace, SFMono-Regular, Menlo, monospace";
    var top = L.wide ? (L.cy - L.R * 0.9) : L.readTop;
    // title
    text(ctx, inf.name, L.px, top, (fs * 1.55).toFixed(1) + mono, P.bright, "left");
    // accent underline
    ctx.strokeStyle = rgba(inf.color, 0.8);
    ctx.lineWidth = 2;
    var uy = top + 6;
    ctx.beginPath(); ctx.moveTo(L.px, uy); ctx.lineTo(L.px + fs * 3.4, uy); ctx.stroke();

    var lh = fs * 1.7;
    var y0 = top + lh * 1.5;
    var maxLines = L.compact ? 5 : inf.lines.length;
    var i;
    var labW = fs * 6.2;
    for (i = 0; i < inf.lines.length && i < maxLines; i++) {
      var lab = inf.lines[i][0], val = inf.lines[i][1];
      var yy = y0 + i * lh;
      if (lab) text(ctx, lab, L.px, yy, fs.toFixed(1) + mono, P.muted, "left");
      text(ctx, val, L.px + labW, yy, fs.toFixed(1) + mono, lab ? P.ink : mix(P.ink, inf.color, 0.5), "left");
    }

    // note line (narrow: clamp so it never spills into the size ladder)
    var ny = y0 + Math.min(inf.lines.length, maxLines) * lh + fs * 0.6;
    var maxY = L.wide ? 1e9 : (L.mainH - fs * 0.4);
    wrapText(ctx, inf.note, L.px, ny, L.pw, fs * 1.35, L.noteFs.toFixed(1) + mono, P.muted, maxY);

    // pulsar light curve
    if (state.sel === "pulsar" && !L.compact) {
      drawLightCurve(ctx, L.px, ny + fs * 3.6, L.pw * 0.86, fs * 3.2);
    }
  }

  function drawLightCurve(ctx, x, y, w, h) {
    ctx.save();
    ctx.strokeStyle = rgba(P.muted, 0.35);
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, w, h);
    text(ctx, "OBSERVED FLUX", x, y - 4, "9px ui-monospace, monospace", P.muted, "left");
    ctx.beginPath();
    var i;
    for (i = 0; i < HN; i++) {
      var idx = (histI + i) % HN;
      var v = hist[idx];
      var xx = x + (i / (HN - 1)) * w;
      var yy = y + h - clamp(v, 0, 1) * (h - 3) - 1.5;
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.strokeStyle = P.cyan;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    // current-value dot / observer flash
    if (flashDot > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.fillStyle = rgba(P.cyan, flashDot);
      ctx.beginPath(); ctx.arc(x + w + 8, y + h * 0.5, 4 + flashDot * 4, 0, TAU); ctx.fill();
      ctx.restore();
      text(ctx, "→ blip", x + w + 16, y + h * 0.5 + 3, "9px ui-monospace, monospace", rgba(P.cyan, flashDot), "left");
    }
    ctx.restore();
  }

  function wrapText(ctx, s, x, y, maxW, lh, font, color, maxY) {
    if (maxY == null) maxY = 1e9;
    ctx.font = font;
    var words = s.split(" ");
    var line = "", i, yy = y;
    for (i = 0; i < words.length; i++) {
      var test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        if (yy > maxY) return;
        text(ctx, line, x, yy, font, color, "left");
        line = words[i]; yy += lh;
      } else line = test;
    }
    if (line && yy <= maxY) text(ctx, line, x, yy, font, color, "left");
  }

  // ---- scale ladder ---------------------------------------------------
  function drawScale(ctx, w, h) {
    var y = L.sy, x0 = L.x0, x1 = L.x1;
    var narrow = !L.wide;
    function xf(km) { return mapv(clamp(log10(km), 0, 6), 0, 6, x0, x1); }
    // baseline
    ctx.strokeStyle = rgba(P.muted, 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    // decade ticks
    var d, labels = ["1", "10", "100", "1k", "10k", "100k", "1M"];
    var labFont = narrow ? "11px ui-monospace, monospace" : "9px ui-monospace, monospace";
    for (d = 0; d <= 6; d++) {
      var tx = mapv(d, 0, 6, x0, x1);
      ctx.strokeStyle = rgba(P.muted, 0.25);
      ctx.beginPath(); ctx.moveTo(tx, y - 3); ctx.lineTo(tx, y + 3); ctx.stroke();
      // narrow: label every other decade so 11px glyphs never crowd
      if (!narrow || d % 2 === 0) {
        text(ctx, labels[d], tx, y + 15, labFont, rgba(P.muted, 0.8), "center");
      }
    }
    // reference ticks (faint) — desktop only; dropped on narrow to avoid crowding
    if (!narrow) {
      refTick(ctx, xf(6371), y, "Earth", P.muted);
      refTick(ctx, xf(696000), y, "Sun", mix(P.gold, P.muted, 0.4));
    }

    // remnant markers
    var M = state.bhMass;
    marker(ctx, xf(2.95 * M), y, "BH", P.orange, state.sel === "black-hole", -1, narrow);
    marker(ctx, xf(11), y, "NS", P.cyan, state.sel === "neutron-star" || state.sel === "pulsar" || state.sel === "magnetar", 1, narrow);
    marker(ctx, xf(6000), y, "WD", mix(P.white, P.blue, 0.45), state.sel === "white-dwarf", -1, narrow);

    // title + honesty note
    if (narrow) {
      text(ctx, "SIZE LADDER (log km)", x0, y - L.scaleH * 0.30, "11px ui-monospace, monospace", P.muted, "left");
    } else {
      text(ctx, "SIZE LADDER · log radius (km)", x0, y - L.scaleH * 0.30, "9px ui-monospace, monospace", P.muted, "left");
      var noteFont = w < 480 ? "8px ui-monospace, monospace" : "9px ui-monospace, monospace";
      text(ctx, "linear scale would make the NS & BH vanish", x1, y - L.scaleH * 0.30, noteFont, rgba(P.muted, 0.75), "right");
    }
  }

  function refTick(ctx, x, y, label, color) {
    ctx.strokeStyle = rgba(color, 0.4);
    ctx.lineWidth = 1;
    dashLineV(ctx, x, y - 10, y + 6);
    text(ctx, label, x, y - 13, "8px ui-monospace, monospace", rgba(color, 0.75), "center");
  }

  function dashLineV(ctx, x, y0, y1) {
    var d = y0, on = 2, off = 3, draw = true;
    ctx.beginPath();
    while (d < y1) {
      var e = Math.min(d + (draw ? on : off), y1);
      if (draw) { ctx.moveTo(x, d); ctx.lineTo(x, e); }
      d = e; draw = !draw;
    }
    ctx.stroke();
  }

  function marker(ctx, x, y, label, color, active, dir, narrow) {
    var r = active ? 5 : 3.5;
    if (active) glow(ctx, x, y, 1, 16, color, 0.5);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = rgba(P.bg, 0.9); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    var ly = dir < 0 ? y - 12 : y + (narrow ? 20 : 24);
    var f = narrow ? (active ? "12px" : "11px") : (active ? "10px" : "9px");
    text(ctx, label, x, ly, f + " ui-monospace, monospace",
      active ? P.bright : rgba(color, 0.9), "center");
  }

  // ---- main draw ------------------------------------------------------
  function frame(dt, t) {
    var w = api.w, h = api.h, ctx = api.ctx;
    if (w < 2 || h < 2) return;
    layout(w, h);
    bg(ctx, w, h, t);

    // advance dynamic state
    if (state.sel === "pulsar") {
      var visRate = RM ? 0.35 : clamp(state.spinHz, 0.3, 2.4);
      spinPhase += visRate * dt;
      if (spinPhase > 1e6) spinPhase -= 1e6;
    }
    if (state.sel === "magnetar") {
      flareClock += dt;
      var period = RM ? 9 : 6;
      if (flareClock >= period) { flareClock = 0; flareEnergy = RM ? 0.5 : 1; }
      flareEnergy = Math.max(0, flareEnergy - dt * 0.9);
    } else {
      flareEnergy = Math.max(0, flareEnergy - dt * 2);
    }

    var inf = info();
    var cx = L.cx, cy = L.cy, R = L.R;

    if (state.sel === "white-dwarf") drawWhiteDwarf(ctx, cx, cy, R, t);
    else if (state.sel === "neutron-star") drawNeutronStar(ctx, cx, cy, R, t);
    else if (state.sel === "pulsar") drawPulsar(ctx, cx, cy, R, t);
    else if (state.sel === "magnetar") drawMagnetar(ctx, cx, cy, R, t);
    else drawBlackHole(ctx, cx, cy, R, t);

    // update light-curve history (pulsar)
    var b = state.sel === "pulsar" ? lastBright : 0;
    hist[histI] = b;
    histI = (histI + 1) % HN;
    if (b > 0.5 && lastBright >= b) flashDot = 1;
    flashDot = Math.max(0, flashDot - dt * 3);
    if (b > flashDot) flashDot = Math.max(flashDot, Math.min(1, b));

    drawReadout(ctx, w, inf);
    drawScale(ctx, w, h);
  }

  var loop = SN.loop(host, frame);

  // ---- controls -------------------------------------------------------
  var bar = controls;
  var madeOverlay = false;
  if (!bar) {
    bar = SN.el("div.sim-controls", {});
    bar.style.position = "absolute";
    bar.style.left = "0"; bar.style.bottom = "0"; bar.style.width = "100%";
    host.style.position = host.style.position || "relative";
    host.appendChild(bar);
    madeOverlay = true;
  }

  var chipEls = {};
  var opts = [
    ["white-dwarf", "White dwarf"],
    ["neutron-star", "Neutron star"],
    ["pulsar", "Pulsar"],
    ["magnetar", "Magnetar"],
    ["black-hole", "Black hole"]
  ];

  var spinSlider = SN.slider({
    label: "Spin", min: 1, max: 30, step: 1, value: state.spinHz,
    format: function (v) { return v + " Hz · " + (1000 / v).toFixed(0) + " ms"; },
    oninput: function (v) { state.spinHz = v; }
  });
  var massSlider = SN.slider({
    label: "BH mass", min: 1, max: 70, step: 1, value: state.bhMass,
    format: function (v) { return v + " M☉ · R " + (2.95 * v).toFixed(0) + " km"; },
    oninput: function (v) { state.bhMass = v; }
  });

  function refreshSliders() {
    spinSlider.style.display = state.sel === "pulsar" ? "" : "none";
    massSlider.style.display = state.sel === "black-hole" ? "" : "none";
  }

  function setSel(id) {
    state.sel = id;
    var k;
    for (k in chipEls) {
      if (chipEls.hasOwnProperty(k)) chipEls[k].className = "chip" + (k === id ? " on" : "");
    }
    refreshSliders();
  }

  var chipGrp = SN.el("div.grp", {});
  var oi;
  for (oi = 0; oi < opts.length; oi++) {
    (function (id, label) {
      var c = SN.el("button.chip", { type: "button", text: label, onclick: function () { setSel(id); } });
      chipEls[id] = c;
      chipGrp.appendChild(c);
    })(opts[oi][0], opts[oi][1]);
  }

  bar.appendChild(chipGrp);
  bar.appendChild(spinSlider);
  bar.appendChild(massSlider);

  setSel(state.sel);

  return {
    destroy: function () {
      if (loop && loop.stop) loop.stop();
      if (madeOverlay && bar && bar.parentNode) bar.parentNode.removeChild(bar);
    }
  };
});
