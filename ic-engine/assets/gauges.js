/* ============================================================
   gauges.js — analog instrument cluster for the 3D engine.
   window.EngineGauges({mount, engine}) builds four 270° dials
   (RPM · oil temp · unbalanced force · fuel flow) and animates
   them from live engine state. Requires EK (engine-kin.js).
   Blueprint aesthetic: dark dial, cyan ticks, orange needle,
   red danger arc. Reads engine.cfg / engine.heat / engine.exploded.
   ============================================================ */
(function(){
  const NS='http://www.w3.org/2000/svg';
  function el(n,a){ const e=document.createElementNS(NS,n); if(a) for(const k in a) e.setAttribute(k,a[k]); return e; }
  const A0=-135, SWEEP=270;                       // dial start angle & span (deg, 0 = up)
  const CX=60, CY=62, R=46;
  function pt(aDeg, r){ const a=aDeg*Math.PI/180; return [CX+r*Math.sin(a), CY-r*Math.cos(a)]; }
  function arcPath(a1,a2,r){
    const p1=pt(a1,r), p2=pt(a2,r), large=(a2-a1)>180?1:0;
    return `M${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A${r} ${r} 0 ${large} 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
  }

  const SPECS=[
    {key:'rpm',  label:'ENGINE SPEED', unit:'rpm',  min:0,  max:7000, red:5200, ticks:7,  read:v=>Math.round(v/10)*10},
    {key:'temp', label:'OIL TEMP',     unit:'°C',   min:40, max:220,  red:120,  ticks:6,  read:v=>Math.round(v)},
    {key:'shake',label:'UNBAL. FORCE', unit:'%',    min:0,  max:100,  red:72,   ticks:5,  read:v=>Math.round(v)},
    {key:'fuel', label:'FUEL FLOW',    unit:'L/h',  min:0,  max:50,   red:43,   ticks:5,  read:v=>v.toFixed(1)},
  ];

  function buildGauge(spec){
    const wrap=document.createElement('div'); wrap.className='gauge';
    const svg=el('svg',{viewBox:'0 0 120 124'});
    // face
    svg.appendChild(el('circle',{cx:CX,cy:CY,r:R+9,class:'g-face'}));
    svg.appendChild(el('circle',{cx:CX,cy:CY,r:R+9,class:'g-ring'}));
    // value arc track + redline zone
    const track=el('path',{d:arcPath(A0,A0+SWEEP,R),class:'g-track'}); svg.appendChild(track);
    const redA1=A0+((spec.red-spec.min)/(spec.max-spec.min))*SWEEP;
    svg.appendChild(el('path',{d:arcPath(redA1,A0+SWEEP,R),class:'g-red'}));
    // ticks + numbers
    for(let i=0;i<=spec.ticks;i++){
      const f=i/spec.ticks, a=A0+f*SWEEP;
      const o=pt(a,R), inr=pt(a,R-7);
      const major=el('line',{x1:o[0],y1:o[1],x2:inr[0],y2:inr[1],class:'g-tick'}); svg.appendChild(major);
      const np=pt(a,R-15), val=spec.min+f*(spec.max-spec.min);
      const t=el('text',{x:np[0],y:np[1]+2.6,class:'g-num','text-anchor':'middle'});
      t.textContent = spec.max>=1000 ? Math.round(val/1000) : Math.round(val);
      svg.appendChild(t);
    }
    // needle + hub
    const needle=el('line',{x1:CX,y1:CY,x2:CX,y2:CY-R+4,class:'g-needle'}); svg.appendChild(needle);
    svg.appendChild(el('circle',{cx:CX,cy:CY,r:4.5,class:'g-hub'}));
    // digital readout
    const val=el('text',{x:CX,y:CY+24,class:'g-val','text-anchor':'middle'}); val.textContent='0'; svg.appendChild(val);
    const unit=el('text',{x:CX,y:CY+33,class:'g-unit','text-anchor':'middle'}); unit.textContent=spec.unit; svg.appendChild(unit);
    wrap.appendChild(svg);
    const lab=document.createElement('div'); lab.className='gauge-label'; lab.textContent=spec.label; wrap.appendChild(lab);
    return { wrap, set(v){
      const f=Math.max(0,Math.min(1,(v-spec.min)/(spec.max-spec.min)));
      needle.setAttribute('transform',`rotate(${(A0+f*SWEEP).toFixed(2)} ${CX} ${CY})`);
      needle.classList.toggle('hot', v>=spec.red);
      val.textContent=spec.read(v);
      val.classList.toggle('hot', v>=spec.red);
    }};
  }

  function EngineGauges(opts){
    const mount=opts.mount, eng=opts.engine;
    mount.classList.add('gaugestrip');
    const gauges={};
    SPECS.forEach(s=>{ const g=buildGauge(s); gauges[s.key]=g; mount.appendChild(g.wrap); });
    const cur={rpm:0,temp:55,shake:0,fuel:0};
    const RATE={rpm:0.16,temp:0.03,shake:0.12,fuel:0.13};

    function targets(){
      const c=eng.cfg||{}, exploded=eng.exploded, heat=eng.heat||0;
      const rpm = exploded?0:(c.rpm||0);
      const temp = exploded ? 40 : 55 + (rpm/6000)*45 + heat*125;
      // unbalanced shaking: a proper roughness index (free forces + rocking couples),
      // normalised per cylinder, growing with rev² (inertia force ∝ ω²).
      const kind = c.layout==='vee'?'vee':c.layout==='flat'?'flat':((c.N||1)===1?'single':'inline');
      let idx=0; try{ idx=EK.imbalance(kind, c.N||1, 0.30).index; }catch(e){}
      const shake = exploded?0: Math.min(100, idx*Math.pow(rpm/5200,2));
      // fuel flow ∝ power strokes/min × fuel/charge
      const strokesMin = (c.stroke4? (c.N||1)*rpm/2 : (c.N||1)*rpm);
      const fuel = exploded?0: strokesMin*0.0009*(c.diesel?0.86:1);
      return {rpm,temp,shake,fuel};
    }
    function frame(){
      const t=targets();
      for(const k in cur){ cur[k]+=(t[k]-cur[k])*RATE[k]; gauges[k].set(cur[k]); }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { };
  }
  window.EngineGauges=EngineGauges;
})();
