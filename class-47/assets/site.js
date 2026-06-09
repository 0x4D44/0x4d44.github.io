/* Shared site chrome for the CLASS 47 study: top chapter-nav + pager + scrollspy.
   Each page sets <body data-chapter="N"> and includes <div id="topbar"></div>. */
(function(){
  const CH = [
    {n:"00", t:"Contents",            href:"index.html"},
    {n:"01", t:"Origins & design",    href:"1-origins.html"},
    {n:"02", t:"The power chain",      href:"2-power.html"},
    {n:"03", t:"Control & config",     href:"3-control.html"},
    {n:"04", t:"Faults & the fix",     href:"4-faults.html"},
    {n:"05", t:"Fleet & service",      href:"5-fleet.html"},
  ];
  const cur = document.body.getAttribute('data-chapter');
  const mount = document.getElementById('topbar');
  if(mount){
    // a tiny Co-Co diesel silhouette as the brand mark
    const mark = `<svg class="brand-mark" viewBox="0 0 50 30" fill="none" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">
      <path d="M4 19 L8 8 L42 8 L46 13 L46 19 Z"/>
      <line x1="2" y1="19" x2="48" y2="19"/>
      <rect x="14" y="11" width="6" height="5"/><rect x="23" y="11" width="6" height="5"/><rect x="32" y="11" width="6" height="5"/>
      <circle cx="11" cy="23" r="3"/><circle cx="18" cy="23" r="3"/><circle cx="25" cy="23" r="3"/>
      <circle cx="32" cy="23" r="3"/><circle cx="39" cy="23" r="3"/>
      <line x1="1" y1="27.5" x2="49" y2="27.5" stroke="var(--signal)" stroke-dasharray="4 3"/></svg>`;
    mount.outerHTML = `<header class="topbar"><div class="topbar-inner">
      <a class="brand" href="index.html" style="text-decoration:none">${mark}<span class="brand-name">CLASS&nbsp;<span>47</span></span></a>
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

  // generic reveal-on-scroll for [data-reveal]
  const revs = document.querySelectorAll('[data-reveal]');
  if(revs.length){
    const ro = new IntersectionObserver(es=>{
      es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); ro.unobserve(e.target); } });
    },{rootMargin:"0px 0px -10% 0px"});
    revs.forEach(el=>ro.observe(el));
  }
})();
