/* ============================================================
   engine-kin.js — shared kinematics & thermodynamics
   Exposes window.EK. Pure functions, no DOM. Used by the cycle
   cutaway, the 3D lab, and the forces/balance graphs so that
   every figure in the study obeys the same slider-crank math.
   ============================================================ */
(function(){
  const TAU = Math.PI*2, D2R = Math.PI/180;

  /* ---- slider-crank geometry (θ measured from TDC, radians) ----
     r  = crank radius (= stroke/2),  L = rod length,  λ = r/L      */
  // exact piston displacement from TDC, in units of r
  function pistonPos(theta, lambda){
    return (1 - Math.cos(theta)) + (1/lambda)*(1 - Math.sqrt(1 - lambda*lambda*Math.sin(theta)*Math.sin(theta)));
  }
  // piston velocity factor (÷ rω):  approx good to 2nd order
  function pistonVel(theta, lambda){
    return Math.sin(theta) + (lambda/2)*Math.sin(2*theta);
  }
  // piston / reciprocating acceleration factor (÷ rω²)
  function recipAccel(theta, lambda){
    return Math.cos(theta) + lambda*Math.cos(2*theta);
  }
  // crank-torque arm: maps a force ALONG the bore to torque about crank (÷ r·F)
  function torqueArm(theta, lambda){
    return Math.sin(theta) + (lambda/2)*Math.sin(2*theta);
  }

  /* ---- four-stroke gas pressure over a 720° cycle ----
     phi in degrees [0,720). Returns gauge pressure, normalised so the
     peak firing pressure ≈ 1.0; pumping excursions are small & signed.
     Strokes (phi):  0–180 intake | 180–360 compression
                     360–540 power | 540–720 exhaust
     diesel=true  → later, flatter combustion (constant-pressure-ish)   */
  function gasP4(phi, opt){
    opt = opt||{}; const diesel = !!opt.diesel;
    phi = ((phi%720)+720)%720;
    const CR = opt.cr || (diesel?18:10);           // compression ratio
    // Normalised so firing peak ≈ 1.0; compression-end ≈ 0.28×peak; net cycle
    // work is positive and the gas torque (p·torqueArm) integrates > 0, so the
    // lumpy-power figure in Ch.04 gives realistic mean torque & ripple.
    if(phi<180){                                   // INTAKE — slight depression
      return -0.05*Math.sin((phi/180)*Math.PI);
    } else if(phi<360){                            // COMPRESSION (polytropic rise)
      const x = (phi-180)/180;                     // 0 at BDC → 1 at TDC
      return 0.28*Math.pow(CR, 1.3*(x-1));         // → 0.28 at TDC, ~0.014 at BDC
    } else if(phi<540){                            // POWER (burn + polytropic expansion)
      const t = (phi-360)/180;                     // 0 at TDC → 1 at BDC
      let peak, loc, width, escale;
      if(diesel){ peak=0.92; loc=0.11; width=0.15; escale=1.55; }
      else      { peak=1.00; loc=0.05; width=0.08; escale=1.60; }
      const burn   = peak*Math.exp(-Math.pow((t-loc)/width,2));
      const expand = escale/Math.pow(1+(CR-1)*t, 1.30);   // pressure persists into mid-stroke
      return Math.max(burn, expand);
    } else {                                       // EXHAUST — small back-pressure
      return 0.06*Math.sin(((phi-540)/180)*Math.PI);
    }
  }

  /* ---- two-stroke gas pressure over a 360° cycle ---- */
  function gasP2(phi, opt){
    opt = opt||{}; phi=((phi%360)+360)%360;
    if(phi<180){ // power + blowdown/scavenge near BDC
      const t=phi/180;
      const burn = 1.0*Math.exp(-Math.pow((t-0.05)/0.08,2));
      const expand = 0.4/Math.pow(1+9*t,1.1);
      return Math.max(burn,expand);
    } else { // compression up to TDC
      const x=1-(phi-180)/180;
      return (1/Math.pow(1+11*x,1.32))*0.5;
    }
  }

  /* ---- stroke / phase helpers ---- */
  const STROKES4 = ["Intake","Compression","Power","Exhaust"];
  function strokeOf4(phi){ phi=((phi%720)+720)%720; return STROKES4[Math.floor(phi/180)]; }

  /* ---- valve lift (4-stroke), normalised 0..1, with overlap ----
     Intake opens ~ -10° BTDC, closes ~ 220°; exhaust opens ~480°, closes ~730/10° */
  function lift(phi, openA, closeA){
    phi=((phi%720)+720)%720;
    // handle wrap for exhaust crossing 0
    let a=openA, b=closeA;
    let p=phi; if(b>720){ if(p< (b-720)) p+=720; }
    if(p<a||p>b) return 0;
    const x=(p-a)/(b-a);
    return Math.sin(Math.PI*x); // smooth open/close hump
  }
  function intakeLift(phi){ return lift(phi, 350, 580); }   // ~ -10 BTDC .. 220 ABDC
  function exhaustLift(phi){ return lift(phi, 130, 370); }  // ~ 130 .. 10 ATDC

  /* ---- two-stroke valve lift (uniflow style), 360° cycle, both act near BDC (180°) ---- */
  function liftHump(phi, center, half){
    let d=Math.abs((((phi-center+180)%360)+360)%360-180);
    return d<half ? Math.sin((1-d/half)*Math.PI/2) : 0;
  }
  function intakeLift2(phi){ return liftHump(((phi%360)+360)%360, 198, 52); } // transfer, trails exhaust
  function exhaustLift2(phi){ return liftHump(((phi%360)+360)%360, 162, 58); } // exhaust leads, opens before BDC

  /* ============================================================
     CYLINDER LAYOUTS — for balance & power summation.
     Returns array of cylinders, each: {bank(deg), crank(deg), x(axial), phase(deg cycle offset)}
     bank: bore direction angle from vertical (0 = up). crank: crank-pin angle.
     phase: firing phase offset within the 720° cycle (firing order).
     ============================================================ */
  function layout(kind, N){
    const cyl=[];
    if(kind==='inline'){
      // even firing 4-stroke inline: cranks set for primary balance where possible
      const cranks = inlineCranks(N);
      const order = firingPhases(N, cranks);
      for(let i=0;i<N;i++) cyl.push({bank:0, crank:cranks[i], x:i-(N-1)/2, phase:order[i]});
    } else if(kind==='vee'){
      const bankAngle = (N===6)?60:90;
      const pairs=N/2; const cranks=inlineCranks(pairs);
      for(let i=0;i<pairs;i++){
        cyl.push({bank:-bankAngle/2, crank:cranks[i], x:i-(pairs-1)/2, phase:(i*720/pairs)});
        cyl.push({bank:+bankAngle/2, crank:cranks[i], x:i-(pairs-1)/2, phase:(i*720/pairs)+360});
      }
    } else if(kind==='flat'){
      const pairs=N/2; const cranks=inlineCranks(pairs);
      for(let i=0;i<pairs;i++){
        cyl.push({bank:-90, crank:cranks[i],     x:i-(pairs-1)/2, phase:(i*720/pairs)});
        cyl.push({bank:+90, crank:cranks[i]+180, x:i-(pairs-1)/2, phase:(i*720/pairs)+360});
      }
    } else if(kind==='single'){
      cyl.push({bank:0, crank:0, x:0, phase:0});
    }
    return {cyl, bank:(kind==='vee'?((N===6)?60:90):(kind==='flat'?180:0))};
  }
  function inlineCranks(N){
    if(N===1) return [0];
    if(N===2) return [0,180];
    if(N===3) return [0,240,120];
    if(N===4) return [0,180,180,0];
    if(N===5) return [0,144,288,72,216];
    if(N===6) return [0,120,240,240,120,0];
    if(N===8) return [0,90,270,180,180,270,90,0];  // proper straight-8: two I4s at 90°, fully balanced
    // generic even spread
    const a=[]; for(let i=0;i<N;i++) a.push((i*720/N)%360); return a;
  }
  function firingPhases(N, cranks){
    // assign each cylinder a 720° firing phase; even interval = 720/N
    const order=[]; for(let i=0;i<N;i++) order.push((i*720/N));
    return order;
  }

  /* ============================================================
     IMBALANCE INDEX — the honest "how rough is this engine" number.
     Unlike a bare force sum, this accounts for BOTH:
       • free shaking FORCES (primary 1×, secondary 2× rev), AND
       • free shaking COUPLES (rocking moments along the crank axis).
     A couple is why an inline-3 or inline-5 — whose forces fully
     cancel — still buzz, and why an inline-6 / straight-8 (forces AND
     couples cancel) are silky. Result is normalised per-cylinder and
     scaled so a single cylinder ≈ 100. Lower = smoother.
     ============================================================ */
  function imbalance(kind, N, lambda){
    lambda = lambda||0.30;
    const {cyl} = layout(kind, N);
    const M = cyl.length;
    const xmax = Math.max(1e-9, ...cyl.map(c=>Math.abs(c.x)));
    let peakF=0, peakM=0;
    for(let s=0; s<720; s+=2){
      const th=s*D2R;
      let fx=0,fy=0,mx=0,my=0;
      for(const c of cyl){
        const ca = th + (c.crank - c.bank)*D2R;   // crank angle from THIS cylinder's own TDC
        const a  = Math.cos(ca) + lambda*Math.cos(2*ca);   // reciprocating accel factor
        const ux = Math.sin(c.bank*D2R), uy = Math.cos(c.bank*D2R);
        fx += a*ux; fy += a*uy;                            // free force (vector)
        const z = c.x/xmax;                                 // arm normalised to ±1
        mx += z*a*ux; my += z*a*uy;                         // free couple (vector)
      }
      peakF = Math.max(peakF, Math.hypot(fx,fy));
      peakM = Math.max(peakM, Math.hypot(mx,my));
    }
    const wc = 0.5;                                         // couples felt ~half as harshly as free forces
    const raw = Math.sqrt(peakF*peakF + wc*wc*peakM*peakM);
    const ref = 1 + lambda;                                // single-cylinder peak force
    const index = Math.min(100, (raw/M)/ref*100);
    return { peakForce:peakF, peakCouple:peakM, index };
  }

  /* ---- net shaking force & gas torque over a rotation ----
     returns {ang[], Fy[], Fx[], torque[]} sampled over `samples` of 720°.
     mass & geometry normalised: reciprocating force in units of m·r·ω². */
  function analyse(kind, N, lambda, opt){
    opt=opt||{}; lambda=lambda||0.28;
    const {cyl} = layout(kind,N);
    const S = opt.samples||360;
    const ang=[],Fy=[],Fx=[],torque=[];
    for(let s=0;s<=S;s++){
      const th = s/S*720;          // crank angle in degrees over a full 4-stroke cycle
      let fy=0,fx=0,T=0;
      for(const c of cyl){
        const ca = (th + c.crank - c.bank)*D2R;     // crank angle from this cylinder's own TDC
        const acc = recipAccel(ca, lambda);// ÷ m r ω²
        // bore unit direction
        const br = c.bank*D2R;
        const dirx = Math.sin(br), diry = Math.cos(br);
        // inertia (shaking) force opposes piston accel; project on bore
        fy += acc*diry; fx += acc*dirx;
        // gas torque: pressure at this cylinder's cycle phase
        const phi = th + c.phase;
        const p = gasP4(phi, opt);
        // torque arm uses crank angle relative to that cylinder's bore
        T += p*torqueArm(ca, lambda);
      }
      ang.push(th); Fy.push(fy); Fx.push(fx); torque.push(T);
    }
    return {ang,Fy,Fx,torque,cyl};
  }

  /* ---- summary balance descriptors for a layout ---- */
  function balance(kind,N,lambda){
    const a=analyse(kind,N,lambda,{samples:720});
    const max=arr=>Math.max(...arr.map(Math.abs));
    const mean=arr=>arr.reduce((s,v)=>s+v,0)/arr.length;
    const tq=a.torque, tmean=mean(tq), tmax=Math.max(...tq), tmin=Math.min(...tq);
    return {
      shakeY:max(a.Fy), shakeX:max(a.Fx),
      torqueRipple: tmean>0.0001 ? (tmax-tmin)/Math.max(tmean,0.001) : (tmax-tmin),
      torqueMean:tmean, torqueMax:tmax, torqueMin:tmin
    };
  }

  /* ---- Otto / Diesel ideal cycle for P–V & T–s plots ----
     returns {pv:[[V,p],...], labels:{...}, eff} V in 0..1 (1=BDC), p relative. */
  function idealCycle(type, opt){
    opt=opt||{}; const cr=opt.cr||(type==='diesel'?18:10);
    const g=1.4; const Vc=1/cr;            // clearance volume fraction (V=1 at BDC)
    const pts=[]; const N=40;
    // state 1: BDC, p=1
    // 1->2 isentropic compression to Vc
    for(let i=0;i<=N;i++){ const V=1-(1-Vc)*i/N; pts.push([V, Math.pow(1/V,g)]); }
    const p2=Math.pow(cr,g);
    if(type==='otto'){
      // 2->3 const-volume heat add
      const beta = opt.beta||2.2; // pressure ratio of combustion
      for(let i=1;i<=N;i++) pts.push([Vc, p2*(1+(beta-1)*i/N)]);
      const p3=p2*beta;
      // 3->4 isentropic expansion to V=1
      for(let i=0;i<=N;i++){ const V=Vc+(1-Vc)*i/N; pts.push([V, p3*Math.pow(Vc/V,g)]); }
      // 4->1 const-volume blowdown
      const p4=p3*Math.pow(Vc,g);
      for(let i=1;i<=N;i++) pts.push([1, p4 - (p4-1)*i/N]);
      const eff = 1-Math.pow(1/cr,g-1);
      return {pv:pts, eff, cr, peak:p3};
    } else {
      // diesel: 2->3 const-pressure heat add up to cutoff rc
      const rc = opt.rc||2.1;            // cutoff ratio
      const V3=Vc*rc;
      for(let i=1;i<=N;i++){ const V=Vc+(V3-Vc)*i/N; pts.push([V, p2]); }
      // 3->4 isentropic expansion to V=1
      for(let i=0;i<=N;i++){ const V=V3+(1-V3)*i/N; pts.push([V, p2*Math.pow(V3/V,g)]); }
      const p4=p2*Math.pow(V3,g);
      for(let i=1;i<=N;i++) pts.push([1, p4-(p4-1)*i/N]);
      const eff = 1 - (1/Math.pow(cr,g-1))*((Math.pow(rc,g)-1)/(g*(rc-1)));
      return {pv:pts, eff, cr, peak:p2, rc};
    }
  }

  window.EK = {
    TAU,D2R, pistonPos,pistonVel,recipAccel,torqueArm,
    gasP4,gasP2, strokeOf4, STROKES4,
    intakeLift,exhaustLift,intakeLift2,exhaustLift2,lift,
    layout,inlineCranks, analyse,balance,imbalance, idealCycle
  };
})();
