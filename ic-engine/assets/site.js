/* Shared site chrome: top chapter-nav + scrollspy rail.
   Each page sets <body data-chapter="N"> and includes a <div id="topbar"></div>. */
(function(){
  const CH = [
    {n:"00", t:"Contents",            href:"index.html"},
    {n:"01", t:"The cycle",           href:"1-the-cycle.html"},
    {n:"02", t:"Petrol & Diesel",     href:"2-petrol-diesel.html"},
    {n:"03", t:"The model lab",       href:"3-model-lab.html"},
    {n:"04", t:"Forces & balance",    href:"4-forces-balance.html"},
    {n:"05", t:"Configurations",      href:"5-configurations.html"},
    {n:"06", t:"Forced induction",    href:"6-forced-induction.html"},
    {n:"07", t:"Wear & upkeep",       href:"7-wear-upkeep.html"},
    {n:"08", t:"History",             href:"8-history.html"},
  ];
  const cur = document.body.getAttribute('data-chapter');
  const mount = document.getElementById('topbar');
  if(mount){
    const mark = `<svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" stroke-width="1.6">
      <rect x="8" y="2.6" width="8" height="9" rx="1"/>
      <path d="M12 11.6 V15.5" stroke="var(--ink)"/>
      <circle cx="12" cy="18.4" r="3.1"/>
      <path d="M12 18.4 L14.7 16.8" stroke="var(--ink)"/>
      <path d="M9.4 5.4h5.2M9.4 8h5.2" stroke="var(--signal)" stroke-width="1"/></svg>`;
    mount.outerHTML = `<header class="topbar"><div class="topbar-inner">
      <a class="brand" href="index.html" style="text-decoration:none">${mark}<span class="brand-name">COM<span>·</span>BUSTION</span></a>
      <nav class="chapnav">${CH.map(c=>
        `<a href="${c.href}" ${c.n===cur?'class="active"':''}><span class="n">${c.n}</span> ${c.t}</a>`).join('')}
      </nav></div></header>`;
  }

  // prev/next auto-fill
  document.querySelectorAll('[data-pager]').forEach(el=>{
    const i = CH.findIndex(c=>c.n===cur);
    const prev = CH[i-1], next = CH[i+1];
    el.innerHTML =
      (prev?`<a href="${prev.href}"><div class="d">← Prev · ${prev.n}</div><div class="t">${prev.t}</div></a>`
           :`<a class="disabled"><div class="d">← Prev</div><div class="t">—</div></a>`)+
      (next?`<a class="next" href="${next.href}"><div class="d">Next · ${next.n} →</div><div class="t">${next.t}</div></a>`
           :`<a class="next disabled"><div class="d">Next →</div><div class="t">—</div></a>`);
  });

  // scrollspy for section rail
  const rails = document.querySelectorAll('.rail a[href^="#"]');
  if(rails.length){
    const map = {};
    rails.forEach(a=>{ const id=a.getAttribute('href').slice(1); const s=document.getElementById(id); if(s) map[id]=a; });
    const io = new IntersectionObserver(es=>{
      es.forEach(e=>{ if(e.isIntersecting){
        rails.forEach(a=>a.classList.remove('active'));
        const a=map[e.target.id]; if(a)a.classList.add('active');
      }});
    },{rootMargin:"-20% 0px -70% 0px"});
    Object.keys(map).forEach(id=>{ const s=document.getElementById(id); if(s)io.observe(s); });
  }
})();
