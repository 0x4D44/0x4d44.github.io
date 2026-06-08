/* ============================================================
   FLEET ATLAS — shared chrome + helpers
   ============================================================ */
(function(){
  const PAGES = [
    ['index.html','Atlas'],
    ['fleet.html','Fleet'],
    ['compare.html','Compare'],
    ['history.html','History'],
    ['evolution.html','Evolution'],
    ['map.html','Map'],
  ];
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();

  /* ---- compass mark (inline svg) ---- */
  const MARK = `<svg class="mark" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <circle cx="50" cy="50" r="46" stroke="#3fe0ff" stroke-width="2"/>
    <circle cx="50" cy="50" r="34" stroke="#3fe0ff" stroke-width="1" opacity=".4"/>
    <path d="M50 6 L58 50 L50 94 L42 50 Z" fill="#3fe0ff"/>
    <path d="M6 50 L50 42 L94 50 L50 58 Z" fill="#3fe0ff" opacity=".35"/>
    <circle cx="50" cy="50" r="4" fill="#04121a" stroke="#3fe0ff" stroke-width="2"/>
  </svg>`;

  function buildNav(){
    const links = PAGES.map(([href,label])=>{
      const cur = href.toLowerCase()===here ? ' class="cur"' : '';
      return `<a href="${href}"${cur}>${label}</a>`;
    }).join('');
    const nav = document.createElement('nav');
    nav.className='nav';
    nav.innerHTML = `<div class="nav-in">
      <a href="index.html" class="brand">${MARK}<span>FLEET&nbsp;ATLAS</span></a>
      <div class="nav-coord"><span id="navClock">--:--:-- UTC</span><span class="blink" style="color:var(--cyan)">● TRACKING 29 HULLS</span></div>
      <div class="nav-links">${links}</div>
    </div>`;
    document.body.insertBefore(nav, document.body.firstChild);
    tickClock();
  }

  function tickClock(){
    const el = document.getElementById('navClock');
    if(!el) return;
    const upd=()=>{ const d=new Date();
      el.textContent = d.toISOString().slice(11,19)+' UTC';
    };
    upd(); setInterval(upd,1000);
  }

  function buildFooter(){
    const f = document.createElement('footer');
    f.className='foot';
    f.innerHTML = `<div class="foot-in">
      <div style="max-width:440px">
        <div style="display:flex;align-items:center;gap:10px;font-family:var(--display);font-weight:700;font-size:15px;margin-bottom:10px">${MARK}<span>FLEET ATLAS</span></div>
        <p style="font-size:12.5px;color:var(--ink-3);line-height:1.6;margin:0">An independent, interactive reference to the Royal Caribbean International fleet — every active hull, the ships that came before, and how the cruise ship itself evolved. Not affiliated with Royal Caribbean.</p>
      </div>
      <div style="display:flex;gap:48px;flex-wrap:wrap">
        <div style="display:flex;flex-direction:column;gap:9px">${PAGES.map(([h,l])=>`<a href="${h}">${l}</a>`).join('')}</div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <span style="font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-3)">Data sources</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">Wikipedia · RCI press fact sheets</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--ink-3)">DNV vessel register · 2026</span>
        </div>
      </div>
    </div>`;
    document.body.appendChild(f);
  }

  /* ---- number helpers ---- */
  window.fmt = n => (n==null||n==='—')?'—':Number(n).toLocaleString('en-US');
  window.compactGt = n => {
    if(n==null) return n;
    if(n>=1000000) return (n/1000000).toFixed(n>=10000000?0:2).replace(/\.?0+$/,'')+'M';
    if(n>=1000) return (n/1000).toFixed(n>=100000?0:1)+'k';
    return n;
  };

  /* ---- ship silhouette generator ----------------------------------------
     Returns an inline SVG side-profile whose proportions track length & decks.
     w = pixel width to render at; the hull length maps to w, decks set height. */
  window.shipSilhouette = function(opts){
    const { lenFt=1000, decks=12, color='#3fe0ff', w=300, funnels=1, era='modern' } = opts;
    // vertical scale: a deck ~ unit; superstructure height grows with decks
    const hullH = 16;                 // hull band
    const deckH = Math.max(5.5, 64/ Math.max(decks,8)); // each deck slab
    const superH = Math.min(decks*deckH, 120);
    const totalH = hullH + superH + 14;
    const W = 1000, scale = w/W;
    const H = totalH;
    const baseY = H - 12;             // waterline
    const hullTop = baseY - hullH;
    const superTop = hullTop - superH;
    const bow = 60, stern = 940;

    // hull path — raked bow, rounded stern
    const hull = `M40 ${baseY} 
      C 70 ${baseY+9}, 930 ${baseY+9}, 962 ${baseY}
      L 950 ${hullTop} L ${era==='liner'?80:120} ${hullTop} 
      C ${era==='liner'?40:70} ${hullTop}, 30 ${hullTop+hullH*0.5}, 40 ${baseY} Z`;

    // superstructure block (stepped for modern, smooth for liner)
    let sup;
    if(era==='liner'){
      sup = `M150 ${hullTop} L150 ${superTop+14} Q150 ${superTop} 175 ${superTop} L820 ${superTop} Q845 ${superTop} 845 ${superTop+14} L845 ${hullTop} Z`;
    } else {
      sup = `M150 ${hullTop} L150 ${superTop+10} L210 ${superTop+10} L210 ${superTop} L800 ${superTop} L800 ${superTop+10} L860 ${superTop+10} L860 ${hullTop} Z`;
    }

    // funnels — a single broad funnel raked slightly back, with Viking-Crown lounge ring
    let fun='';
    const fy = superTop;
    const fcount = funnels;
    for(let i=0;i<fcount;i++){
      const cx = 470 + (i-(fcount-1)/2)*120;
      // trapezoidal funnel
      fun += `<path d="M${cx-30} ${fy} L${cx-22} ${fy-40} L${cx+30} ${fy-40} L${cx+34} ${fy} Z" fill="${color}"/>`;
    }
    // viking-crown style lounge ring straddling the funnel top (a ring, not a floating circle)
    const crownCx = 470;
    const crown = era==='modern'
      ? `<ellipse cx="${crownCx}" cy="${fy-40}" rx="30" ry="9" fill="none" stroke="${color}" stroke-width="5"/>`
      : '';

    // window stripes
    let win='';
    const rows = Math.min(decks,9);
    for(let r=0;r<rows;r++){
      const y = superTop + 8 + r*(superH/(rows+1));
      win += `<line x1="200" y1="${y}" x2="810" y2="${y}" stroke="#04121a" stroke-width="1.4" opacity="0.5"/>`;
    }

    return `<svg viewBox="0 0 ${W} ${H}" width="${w}" height="${H*scale}" preserveAspectRatio="xMidYMax meet" style="overflow:visible">
      <g>
        <path d="${sup}" fill="${color}" opacity="0.92"/>
        ${win}
        ${fun}${crown}
        <path d="${hull}" fill="${color}"/>
        <line x1="20" y1="${baseY+10}" x2="980" y2="${baseY+10}" stroke="${color}" stroke-width="1" opacity="0.3"/>
      </g>
    </svg>`;
  };

  /* ---- reveal on scroll (resilient: never leaves content hidden) ---- */
  window.initReveal = function(){
    const els = [...document.querySelectorAll('.reveal')];
    const showInView = ()=>{
      els.forEach(e=>{ const r=e.getBoundingClientRect();
        if(r.top < (innerHeight||800)*0.92 && r.bottom > 0) e.classList.add('in'); });
    };
    if('IntersectionObserver' in window){
      const io = new IntersectionObserver((ents)=>{
        ents.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
      },{threshold:0.12});
      els.forEach(e=>io.observe(e));
    }
    showInView();
    addEventListener('scroll',showInView,{passive:true});
    addEventListener('resize',showInView);
    /* safety net — reveal anything still hidden */
    setTimeout(()=>els.forEach(e=>e.classList.add('in')),1200);
  };

  /* ---- boot ---- */
  window.__buildFooter = buildFooter;
  function boot(){ buildNav(); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot);
  else boot();
})();
