/* Shared site chrome: top chapter-nav + scrollspy rail.
   Each page sets <body data-chapter="N"> and includes a <div id="topbar"></div>. */
(function(){
  const CH = [
    {n:"00", t:"Contents",        href:"index.html"},
    {n:"01", t:"The DC series motor", href:"1-dc-series-motor.html"},
    {n:"02", t:"Control",          href:"2-control.html"},
    {n:"03", t:"AC systems",       href:"3-ac-systems.html"},
    {n:"04", t:"Modern drives",    href:"4-modern-drives.html"},
    {n:"05", t:"Mechanics & upkeep", href:"5-mechanics-maintenance.html"},
    {n:"06", t:"Case studies",     href:"6-case-studies.html"},
  ];
  const cur = document.body.getAttribute('data-chapter');
  const mount = document.getElementById('topbar');
  if(mount){
    const mark = `<svg class="brand-mark" viewBox="0 0 24 24" fill="none" stroke="var(--signal)" stroke-width="1.6">
      <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/>
      <path d="M12 3v3.6M12 17.4V21M3 12h3.6M17.4 12H21M5.6 5.6l2.5 2.5M15.9 15.9l2.5 2.5M18.4 5.6l-2.5 2.5M8.1 15.9l-2.5 2.5" stroke="var(--ink)"/></svg>`;
    mount.outerHTML = `<header class="topbar"><div class="topbar-inner">
      <a class="brand" href="index.html" style="text-decoration:none">${mark}<span class="brand-name">TRAC<span>·</span>TION</span></a>
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
