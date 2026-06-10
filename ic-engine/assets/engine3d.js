/* ============================================================
   engine3d.js — parametric 3D engine for the model lab.
   Requires THREE (r128 global) and EK (engine-kin.js).
   Exposes window.Engine3D({mount, hud}).
   Blueprint aesthetic: translucent ghost solids + cyan edges,
   orange crankshaft (the live part), yellow spark/injector flash.
   ============================================================ */
(function(){
  const D2R=Math.PI/180;
  const COL = { cyan:0x57C8DC, cyanDim:0x2c6675, signal:0xEE5A2B, spark:0xFFD23F,
                steel:0x9fb4bd, ghost:0x123141, exhaust:0xC79BC0, intake:0x6FB6E6 };

  function Engine3D(opts){
    const mount=opts.mount;
    const W=mount.clientWidth||800, H=mount.clientHeight||500;

    const renderer=new THREE.WebGLRenderer({antialias:true, alpha:true, preserveDrawingBuffer:true});
    renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    renderer.setSize(W,H); mount.appendChild(renderer.domElement);

    const scene=new THREE.Scene();
    const camera=new THREE.PerspectiveCamera(42, W/H, 0.1, 200);

    // lights
    scene.add(new THREE.AmbientLight(0x6f8a96, 0.7));
    const key=new THREE.DirectionalLight(0xffffff,0.8); key.position.set(6,10,8); scene.add(key);
    const rim=new THREE.DirectionalLight(COL.cyan,0.5); rim.position.set(-8,4,-6); scene.add(rim);

    const root=new THREE.Group(); scene.add(root);

    // ---- orbit state ----
    let az=0.9, pol=1.25, rad=22, tgt=new THREE.Vector3(0,1.2,0);
    function applyCam(){
      camera.position.set(
        tgt.x+rad*Math.sin(pol)*Math.cos(az),
        tgt.y+rad*Math.cos(pol),
        tgt.z+rad*Math.sin(pol)*Math.sin(az));
      camera.lookAt(tgt);
    }
    // pointer drag
    let drag=false,lx=0,ly=0;
    mount.addEventListener('pointerdown',e=>{ if(e.target.closest && e.target.closest('.boom')) return; drag=true;lx=e.clientX;ly=e.clientY;mount.setPointerCapture(e.pointerId);});
    mount.addEventListener('pointermove',e=>{ if(!drag)return; az-=(e.clientX-lx)*0.008; pol=Math.max(0.25,Math.min(2.7,pol-(e.clientY-ly)*0.006)); lx=e.clientX;ly=e.clientY; });
    mount.addEventListener('pointerup',e=>{drag=false;});
    mount.addEventListener('wheel',e=>{ e.preventDefault(); rad=Math.max(8,Math.min(60,rad*(1+Math.sign(e.deltaY)*0.08))); },{passive:false});

    // ---- helpers ----
    function ghostSolid(geo, color){
      const g=new THREE.Group();
      const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:color||COL.ghost, transparent:true, opacity:0.18, roughness:.6, metalness:.2, depthWrite:false}));
      const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo,20), new THREE.LineBasicMaterial({color:COL.cyan, transparent:true, opacity:.55}));
      g.add(m); g.add(e); g.userData.mesh=m; return g;
    }
    function metalSolid(geo,color){
      const g=new THREE.Group();
      const m=new THREE.Mesh(geo, new THREE.MeshStandardMaterial({color:color||COL.steel, roughness:.45, metalness:.65}));
      const e=new THREE.LineSegments(new THREE.EdgesGeometry(geo,30), new THREE.LineBasicMaterial({color:0x0b1e2a, transparent:true, opacity:.35}));
      g.add(m); g.add(e); return g;
    }
    function orientCyl(mesh, from, to){
      const dir=new THREE.Vector3().subVectors(to,from); const len=dir.length();
      mesh.position.copy(from).addScaledVector(dir,0.5);
      mesh.scale.y=len/mesh.userData.unit;
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0), dir.normalize());
    }
    function sparkSprite(){
      const cv=document.createElement('canvas'); cv.width=cv.height=64;
      const cx=cv.getContext('2d'); const grd=cx.createRadialGradient(32,32,0,32,32,32);
      grd.addColorStop(0,'rgba(255,236,120,1)'); grd.addColorStop(.4,'rgba(255,180,40,.7)'); grd.addColorStop(1,'rgba(255,120,20,0)');
      cx.fillStyle=grd; cx.fillRect(0,0,64,64);
      const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false, blending:THREE.AdditiveBlending}));
      sp.scale.set(2.2,2.2,1); return sp;
    }
    function smokeSprite(){
      const cv=document.createElement('canvas'); cv.width=cv.height=64;
      const cx=cv.getContext('2d'); const grd=cx.createRadialGradient(32,32,0,32,32,32);
      grd.addColorStop(0,'rgba(60,60,64,.8)'); grd.addColorStop(.5,'rgba(40,40,44,.5)'); grd.addColorStop(1,'rgba(20,20,22,0)');
      cx.fillStyle=grd; cx.fillRect(0,0,64,64);
      return new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(cv), transparent:true, depthWrite:false}));
    }
    // visible spark plug (petrol) or injector (diesel) seated in the head
    function makePlug(diesel){
      const g=new THREE.Group();
      const body=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.16,0.7,12),
        new THREE.MeshStandardMaterial({color:diesel?0x8a8f96:0xd2dadf, roughness:.45, metalness:.75}));
      body.position.y=0.34; g.add(body);
      const hex=new THREE.Mesh(new THREE.CylinderGeometry(0.24,0.24,0.16,6),
        new THREE.MeshStandardMaterial({color:0xb9c2c7, roughness:.5, metalness:.7}));
      hex.position.y=0.02; g.add(hex);
      // electrode / nozzle tip poking down into the chamber — glows on firing
      const tip=new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.075,0.4,8),
        new THREE.MeshStandardMaterial({color:diesel?COL.signal:COL.spark, emissive:diesel?0x401700:0x3a3200, emissiveIntensity:1, roughness:.4, metalness:.3}));
      tip.position.y=-0.26; g.add(tip);
      g.userData.tip=tip;
      return g;
    }

    // ---- config + build ----
    let cfg={N:4, layout:'inline', stroke4:true, diesel:false, rpm:900, run:true, ghost:true, valves:true};
    const R=1.0, lam=0.30, L=R/lam, bore=0.92, spacing=2.6;
    let cyls=[], crankGroup, flywheel, ghostBlock, info={};

    function clear(g){ while(g.children.length) g.remove(g.children[0]); }

    function build(){
      clear(root); cyls=[];
      // enforce even count for V/flat
      let N=cfg.N;
      if((cfg.layout==='vee'||cfg.layout==='flat') && N%2) N=Math.max(2,N-1);
      const lay=EK.layout(cfg.layout==='vee'?'vee':cfg.layout==='flat'?'flat':(N===1?'single':'inline'), N);
      const list=lay.cyl;
      // z centring
      const zs=list.map(c=>c.x*spacing);
      const zspan=(Math.max(...zs)-Math.min(...zs));
      // crank group
      crankGroup=new THREE.Group(); root.add(crankGroup);
      // main shaft
      const shaftLen=zspan+spacing*1.6;
      const shaft=metalSolid(new THREE.CylinderGeometry(0.26,0.26,shaftLen,20), COL.signal);
      shaft.rotation.x=Math.PI/2; shaft.position.z=0; crankGroup.add(shaft);
      // build per crank throw (unique by z + crank)
      const throwMap={};
      list.forEach(c=>{ const k=c.x+'|'+c.crank; throwMap[k]=c; });
      Object.values(throwMap).forEach(c=>{
        const a=c.crank*D2R;
        const tg=new THREE.Group(); tg.rotation.z=a; tg.position.z=c.x*spacing; crankGroup.add(tg);
        // webs
        const web=metalSolid(new THREE.BoxGeometry(R*1.5,0.5,0.34), COL.signal);
        web.position.set(R*0.5,0,-0.5); tg.add(web);
        const web2=metalSolid(new THREE.BoxGeometry(R*1.5,0.5,0.34), COL.signal);
        web2.position.set(R*0.5,0,0.5); tg.add(web2);
        // pin
        const pin=metalSolid(new THREE.CylinderGeometry(0.3,0.3,1.05,16), COL.signal);
        pin.rotation.x=Math.PI/2; pin.position.set(R,0,0); tg.add(pin);
        // counterweight
        const cw=metalSolid(new THREE.CylinderGeometry(R*0.95,R*0.95,0.3,20,1,false,Math.PI*0.9,Math.PI*1.2), COL.signal);
        cw.rotation.x=Math.PI/2; cw.position.set(0,0,-0.5); tg.add(cw);
      });
      // flywheel at -end
      flywheel=metalSolid(new THREE.CylinderGeometry(R*2.0,R*2.0,0.5,40), COL.steel);
      flywheel.rotation.x=Math.PI/2; flywheel.position.z=Math.min(...zs)-spacing*0.9; crankGroup.add(flywheel);

      // cylinders
      list.forEach((c,i)=>{
        const beta=c.bank, br=-beta*D2R;
        const cz=c.x*spacing;
        // bank group for static shell + valves (rotated about Z so +Y -> bore axis)
        const bg=new THREE.Group(); bg.rotation.z=br; bg.position.z=cz; root.add(bg);
        // bore shell — toggled by the "ghost block" control (clearly visible translucent liner)
        const shell=ghostSolid(new THREE.CylinderGeometry(bore*1.04,bore*1.04,3.0,28,1,true), COL.intake);
        shell.position.y=R+2.0; bg.add(shell);
        shell.userData.mesh.material.opacity=0.30;
        shell.userData.mesh.material.color.setHex(COL.intake);
        shell.visible=cfg.ghost;                       // <- the ghost toggle actually shows/hides the walls now
        // head block (always shown — it carries the valves & plug)
        const head=ghostSolid(new THREE.BoxGeometry(bore*2.2,0.9,1.7), COL.ghost);
        head.position.y=R+3.7; bg.add(head);
        head.userData.mesh.material.opacity=cfg.ghost?0.16:0.05;
        // valves — now present in BOTH 2- and 4-stroke when enabled
        let vIn=null,vEx=null;
        if(cfg.valves){
          vIn=metalSolid(new THREE.CylinderGeometry(0.16,0.16,1.2,12), COL.intake);
          vIn.position.set(-0.45,R+3.55,0); bg.add(vIn);
          const hIn=metalSolid(new THREE.CylinderGeometry(0.34,0.18,0.18,12), COL.intake);
          hIn.position.set(-0.45,R+3.0,0); vIn.userData.head=hIn; bg.add(hIn);
          vEx=metalSolid(new THREE.CylinderGeometry(0.16,0.16,1.2,12), COL.exhaust);
          vEx.position.set(0.45,R+3.55,0); bg.add(vEx);
          const hEx=metalSolid(new THREE.CylinderGeometry(0.34,0.18,0.18,12), COL.exhaust);
          hEx.position.set(0.45,R+3.0,0); vEx.userData.head=hEx; bg.add(hEx);
          vIn.userData.valveHead=hIn; vEx.userData.valveHead=hEx;
        }
        // visible spark plug (petrol) / injector (diesel) in the head
        const plug=makePlug(cfg.diesel); plug.position.set(0,R+3.95,0); bg.add(plug);
        // spark/injector flash
        const sp=sparkSprite(); sp.material.opacity=0; bg.add(sp); sp.position.set(0,R+3.2,0);
        // piston (world-space, not parented to bank)
        const piston=metalSolid(new THREE.CylinderGeometry(bore*0.96,bore*0.96,1.0,28), COL.steel);
        piston.rotation.z=br; root.add(piston);
        // rod (world-space)
        const rodMesh=new THREE.Mesh(new THREE.CylinderGeometry(0.16,0.22,1,12),
          new THREE.MeshStandardMaterial({color:COL.cyan, roughness:.4, metalness:.6}));
        rodMesh.userData.unit=1; root.add(rodMesh);
        cyls.push({beta, br, cz, crank:c.crank, phase:c.phase, piston, rodMesh, bg, vIn, vEx, sp, plug});
      });

      // ---- ghost ENGINE BLOCK (crankcase + sump + cylinder casing) — toggled with cfg.ghost ----
      (function(){
        const zMin=Math.min(...zs), zMax=Math.max(...zs), zc=(zMin+zMax)/2;
        const len=(zMax-zMin)+spacing*1.5;
        const blk=new THREE.Group(); root.add(blk);
        function box(w,h,d){ return ghostSolid(new THREE.BoxGeometry(w,h,d), COL.ghost); }
        // crankcase — encloses the crankshaft
        const cc=box(R*2.9, 3.0, len); cc.position.set(0, 0.1, zc); blk.add(cc);
        // sump / oil pan — below the crank
        const sump=box(R*2.1, 1.2, len*0.8); sump.position.set(0, -R*2.05, zc); blk.add(sump);
        // a little oil in the sump
        const oil=new THREE.Mesh(new THREE.BoxGeometry(R*2.0,0.25,len*0.78),
          new THREE.MeshStandardMaterial({color:0x3a2a12, transparent:true, opacity:0.5, roughness:.3, metalness:.1, depthWrite:false}));
        oil.position.set(0,-R*2.45,zc); oil.userData.noHeat=true; blk.add(oil);
        // upper cylinder block — one casing per distinct bank, angled to the bores
        [...new Set(list.map(c=>c.bank))].forEach(beta=>{
          const bgrp=new THREE.Group(); bgrp.rotation.z=-beta*D2R; bgrp.position.z=zc;
          const ub=box(bore*2.5, 2.9, len); ub.position.set(0, R+1.9, 0); bgrp.add(ub);
          // deck face at the head joint
          const deck=box(bore*2.5, 0.18, len); deck.position.set(0, R+3.35, 0); bgrp.add(deck);
          blk.add(bgrp);
        });
        blk.visible=cfg.ghost;
        ghostBlock=blk;
      })();

      info={N, order: list.map(c=>c.phase)};
      // camera framing
      rad=Math.max(14, zspan*1.1 + 12);
      tgt.set(0, R+1.5, 0);
      if(opts.onbuild) opts.onbuild(displayInfo());
    }

    function displayInfo(){
      const N=info.N;
      const layName={inline:'Inline',vee:'V',flat:'Flat / boxer',single:'Single'}[cfg.layout]||'Inline';
      return {
        N, layout: (cfg.layout==='inline'&&N===1)?'Single':layName,
        stroke: cfg.stroke4?'4-stroke':'2-stroke',
        fuel: cfg.diesel?'Diesel (CI)':'Petrol (SI)',
        rpm: cfg.rpm,
        firing: cfg.stroke4? (720/N).toFixed(0)+'° interval' : (360/N).toFixed(0)+'° interval'
      };
    }

    // ---- animation + over-rev grenade ----
    let crankDeg=0, last=performance.now();
    const REDLINE=5200, BLOWN=6000;        // over-rev danger band
    let heat=0, exploded=false, fx=null, debris=[];

    // tint every metal part toward red/white as the engine cooks
    const _hc=new THREE.Color();
    function applyHeat(h){
      _hc.setRGB(Math.min(1,h*1.7), Math.min(1,Math.max(0,h-0.38)*1.7), Math.min(1,Math.max(0,h-0.72)*3.2));
      root.traverse(o=>{ if(o.isMesh && o.material && o.material.emissive && !o.userData.noHeat){
        o.material.emissive.copy(_hc); o.material.emissiveIntensity=h*2.0; } });
    }
    function explode(){
      exploded=true; cfg.run=false; root.visible=false;
      fx=new THREE.Group(); scene.add(fx); debris=[];
      const c0=new THREE.Vector3(0,R+1.5,0), span=spacing*Math.max(1,cfg.N)*0.34;
      // metal shrapnel
      for(let i=0;i<52;i++){
        const sz=0.28+Math.random()*0.7;
        const col=[COL.steel,COL.signal,COL.cyan,COL.exhaust][i%4];
        const m=new THREE.Mesh(new THREE.BoxGeometry(sz,sz*(0.5+Math.random()),sz),
          new THREE.MeshStandardMaterial({color:col, emissive:0xff4a14, emissiveIntensity:0.9, roughness:.5, metalness:.6}));
        m.position.copy(c0).add(new THREE.Vector3((Math.random()-0.5)*2.4,(Math.random()-0.5)*2.4,(Math.random()-0.5)*span));
        const v=new THREE.Vector3((Math.random()-0.5)*26, 7+Math.random()*20, (Math.random()-0.5)*26);
        fx.add(m); debris.push({m,v,av:new THREE.Vector3((Math.random()-.5)*14,(Math.random()-.5)*14,(Math.random()-.5)*14)});
      }
      // fireball
      const fb=sparkSprite(); fb.scale.set(16,16,1); fb.position.copy(c0); fb.material.opacity=1; fx.add(fb); fx.userData.fb=fb;
      // smoke puffs
      fx.userData.smoke=[];
      for(let i=0;i<7;i++){ const s=smokeSprite(); const sc=3+Math.random()*3; s.scale.set(sc,sc,1);
        s.position.copy(c0).add(new THREE.Vector3((Math.random()-0.5)*4,Math.random()*1.5,(Math.random()-0.5)*span));
        s.material.opacity=0.9; fx.add(s); fx.userData.smoke.push({s, vy:1.4+Math.random()*1.6}); }
      if(opts.onexplode) opts.onexplode();
    }
    function animateDebris(dt){
      debris.forEach(d=>{ d.v.y-=30*dt; d.m.position.addScaledVector(d.v,dt);
        d.m.rotation.x+=d.av.x*dt; d.m.rotation.y+=d.av.y*dt; d.m.rotation.z+=d.av.z*dt;
        const mat=d.m.material; mat.emissiveIntensity=Math.max(0,mat.emissiveIntensity-0.25*dt);
        if(d.m.position.y<-7){ d.m.position.y=-7; d.v.set(0,0,0); d.av.multiplyScalar(0.6); } });
      if(fx&&fx.userData.fb){ const f=fx.userData.fb; f.material.opacity*=0.90; f.scale.multiplyScalar(1.035); }
      if(fx&&fx.userData.smoke){ fx.userData.smoke.forEach(p=>{ p.s.position.y+=p.vy*dt; p.s.scale.multiplyScalar(1.004); p.s.material.opacity=Math.max(0,p.s.material.opacity-0.12*dt); }); }
    }
    function revive(){
      if(fx){ scene.remove(fx); fx=null; } debris=[];
      exploded=false; heat=0; root.visible=true;
      cfg.run=true; build(); applyHeat(0); applyCam();
      if(opts.onrevive) opts.onrevive();
    }

    function pose(){
      crankGroup.rotation.z = crankDeg*D2R;
      const cyc=cfg.stroke4?720:360;
      cyls.forEach(c=>{
        const a=(crankDeg + c.crank)*D2R;
        const P=new THREE.Vector3(R*Math.sin(a), R*Math.cos(a), c.cz);  // crank pin (world; crank axis Z)
        // bore axis unit (world)
        const u=new THREE.Vector3(Math.sin(c.beta*D2R), Math.cos(c.beta*D2R), 0);
        const uP=u.dot(new THREE.Vector3(P.x,P.y,0));
        const perp=(P.x*P.x+P.y*P.y)-uP*uP;
        const t=uP+Math.sqrt(Math.max(0,L*L-perp));
        const S=new THREE.Vector3(u.x*t, u.y*t, c.cz);                  // small-end (piston pin)
        // piston body sits a little beyond pin along axis
        c.piston.position.copy(S).addScaledVector(u,0.7);
        // rod from S to P
        orientCyl(c.rodMesh, S, P);
        // valves + spark by firing phase
        const phi=(((crankDeg + c.phase)%cyc)+cyc)%cyc;
        if(c.vIn){
          let li,le;
          if(cfg.stroke4){ li=EK.intakeLift(phi); le=EK.exhaustLift(phi); }
          else { li=EK.intakeLift2(phi); le=EK.exhaustLift2(phi); }   // 2-stroke: valves work near BDC
          c.vIn.position.y = R+3.55 + li*0.5; if(c.vIn.userData.head) c.vIn.userData.head.position.y=R+3.0+li*0.5;
          c.vEx.position.y = R+3.55 + le*0.5; if(c.vEx.userData.head) c.vEx.userData.head.position.y=R+3.0+le*0.5;
        }
        // spark (petrol) / injector (diesel) just before TDC of the firing stroke
        const near = cfg.stroke4 ? (phi>700||phi<14) : (phi<14||phi>350);
        c.sp.material.opacity = near ? (0.6+0.4*Math.random()) : Math.max(0, c.sp.material.opacity-0.08);
        c.sp.material.color.setHex(cfg.diesel?COL.signal:COL.spark);
        if(c.plug && c.plug.userData.tip){           // glow the plug/injector tip as it fires
          const tm=c.plug.userData.tip.material;
          tm.emissive.setHex(near ? (cfg.diesel?0xEE5A2B:0xFFD23F) : (cfg.diesel?0x401700:0x3a3200));
          tm.emissiveIntensity = near ? 2.2 : 1;
        }
      });
    }
    function frame(now){
      const dt=Math.min(0.05,(now-last)/1000); last=now;
      if(exploded){ animateDebris(dt); applyCam(); renderer.render(scene,camera); requestAnimationFrame(frame); return; }
      // over-rev heat: builds past the redline, cools below it
      if(cfg.run && cfg.rpm>REDLINE) heat += dt*((cfg.rpm-REDLINE)/(BLOWN-REDLINE))*0.5;
      else heat -= dt*0.45;
      heat=Math.max(0,Math.min(1,heat));
      applyHeat(heat);
      if(opts.onheat) opts.onheat(heat, cfg.rpm>REDLINE);
      if(heat>=1){ explode(); requestAnimationFrame(frame); return; }
      if(cfg.run) crankDeg += cfg.rpm*6*dt;          // deg/s = rpm*360/60
      pose();
      applyCam();
      renderer.render(scene,camera);
      requestAnimationFrame(frame);
    }

    // ---- API ----
    function set(patch){ Object.assign(cfg,patch);
      if('N' in patch||'layout' in patch||'stroke4' in patch||'valves' in patch||'ghost' in patch||'diesel' in patch){ build(); }
      else if(opts.onbuild) opts.onbuild(displayInfo());
    }
    function resize(){ const w=mount.clientWidth,h=mount.clientHeight; renderer.setSize(w,h); camera.aspect=w/h; camera.updateProjectionMatrix(); }
    window.addEventListener('resize',resize);

    build(); applyCam(); requestAnimationFrame(frame);
    return { set, resize, revive, get cfg(){return cfg;}, get exploded(){return exploded;}, get heat(){return heat;}, info:displayInfo,
      renderOnce(){ pose(); applyCam(); renderer.render(scene,camera); },
      step(deg){ crankDeg+=(deg||40); pose(); applyCam(); renderer.render(scene,camera); } };
  }
  window.Engine3D=Engine3D;
})();
