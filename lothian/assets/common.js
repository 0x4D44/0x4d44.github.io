/* ============================================================
   LOTHIAN — common.js  ·  shared helpers & components
   ============================================================ */

/* ---------- tiny utils ---------- */
const $  = (s,r=document)=>r.querySelector(s);
const $$ = (s,r=document)=>[...r.querySelectorAll(s)];
const fmt = n => n.toLocaleString('en-GB');
function animateNum(el, to, {dur=1100, suffix='', prefix='', dp=0}={}){
  const start=performance.now(), from=0;
  function tick(t){
    const k=Math.min(1,(t-start)/dur), e=1-Math.pow(1-k,3);
    const val=from+(to-from)*e;
    el.textContent=prefix+(dp?val.toFixed(dp):Math.round(val).toLocaleString('en-GB'))+suffix;
    if(k<1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

/* ---------- navigation ---------- */
const NAV_PAGES = [
  ['index.html','Home'],['history.html','History'],['fleet.html','Fleet'],
  ['routes.html','Network'],['ridership.html','Ridership'],['finance.html','Finance'],
  ['electric.html','Electric'],['incidents.html','Resilience'],
];
function buildNav(cur){
  const mark = `<svg class="mark" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="2" y="2" width="36" height="36" rx="9" fill="var(--gold)"/>
    <rect x="6" y="13" width="28" height="15" rx="4" fill="var(--madder)"/>
    <rect x="9" y="16" width="6" height="5" rx="1.4" fill="var(--gold-soft)"/>
    <rect x="17" y="16" width="6" height="5" rx="1.4" fill="var(--gold-soft)"/>
    <rect x="25" y="16" width="5" height="5" rx="1.4" fill="var(--gold-soft)"/>
    <circle cx="13" cy="30" r="3.4" fill="var(--madder-ink)"/>
    <circle cx="28" cy="30" r="3.4" fill="var(--madder-ink)"/>
  </svg>`;
  const links = NAV_PAGES.map(([h,l])=>`<a href="${h}" class="${h===cur?'cur':''}">${l}</a>`).join('');
  const el=document.createElement('nav');
  el.className='nav';
  el.innerHTML=`<div class="nav-in">
    <a class="brand" href="index.html">${mark}<span>LOTHIAN<small>Edinburgh's buses · since 1919</small></span></a>
    <div class="nav-links">${links}</div>
  </div>`;
  document.body.prepend(el);
}
function buildFooter(){
  const el=document.createElement('footer');
  el.className='foot';
  el.innerHTML=`<div class="foot-in">
    <div>
      <div style="font-family:var(--display);font-weight:800;font-size:18px;color:var(--madder)">LOTHIAN — a deep dive</div>
      <p style="margin:8px 0 0;font-size:12.5px;max-width:420px;color:var(--ink-3)">An independent enthusiast’s study of Edinburgh’s municipal bus network. Figures from Lothian Buses, council reports and trade press, 2023–25. Not affiliated with Lothian Buses Ltd.</p>
    </div>
    <div style="display:flex;gap:26px;flex-wrap:wrap">
      <div><div style="font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--ink-faint);text-transform:uppercase;margin-bottom:8px">Explore</div>
        ${NAV_PAGES.slice(1,5).map(([h,l])=>`<a style="display:block;margin:5px 0" href="${h}">${l}</a>`).join('')}</div>
      <div><div style="font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--ink-faint);text-transform:uppercase;margin-bottom:8px">More</div>
        ${NAV_PAGES.slice(5).map(([h,l])=>`<a style="display:block;margin:5px 0" href="${h}">${l}</a>`).join('')}</div>
    </div>
  </div>`;
  document.body.appendChild(el);
}

/* ---------- reveal on scroll ---------- */
function initReveal(){
  const els=$$('.reveal');
  if(!('IntersectionObserver' in window)){els.forEach(e=>e.classList.add('in'));return;}
  const io=new IntersectionObserver((es)=>{
    es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
  },{threshold:0.12});
  els.forEach(e=>io.observe(e));
  // fallback: if IO hasn't revealed anything (background/embedded contexts),
  // commit everything so content is never left nudged/offset.
  setTimeout(()=>els.forEach(e=>e.classList.add('in')), 1200);
}

/* ---------- tooltip ---------- */
let _tip;
function tipShow(html,x,y){
  if(!_tip){_tip=document.createElement('div');_tip.className='tip';document.body.appendChild(_tip);}
  _tip.innerHTML=html; _tip.style.opacity='1';
  const r=_tip.getBoundingClientRect();
  let nx=x+14, ny=y-r.height-12;
  if(nx+r.width>innerWidth-8) nx=x-r.width-14;
  if(ny<8) ny=y+18;
  _tip.style.left=nx+'px'; _tip.style.top=ny+'px';
}
function tipHide(){ if(_tip) _tip.style.opacity='0'; }

/* ============================================================
   BUS SILHOUETTE generator — side profile, livery-aware
   opts: {type:'dd'|'sd'|'ot', fuel, color, band, w, dest}
   ============================================================ */
function busSil(opts){
  const o=Object.assign({type:'dd',fuel:'diesel',color:'var(--madder)',band:'var(--gold)',w:240,dest:''},opts);
  const VB_W=240, VB_H=opts.type==='sd'?86:110;
  const c=o.color, band=o.band;
  const isDD = o.type!=='sd';
  const bodyTop = isDD?14:34;
  const bodyBot = VB_H-22;
  let win='';
  // window helpers
  const winFill='#dfeef2', winStroke='rgba(20,30,30,.25)';
  function row(y,h,x0,x1,n){
    let s='';const gap=6, tot=x1-x0, ww=(tot-(n-1)*gap)/n;
    for(let i=0;i<n;i++){const x=x0+i*(ww+gap);
      s+=`<rect x="${x.toFixed(1)}" y="${y}" width="${ww.toFixed(1)}" height="${h}" rx="3" fill="${winFill}" stroke="${winStroke}" stroke-width="0.8"/>`;}
    return s;
  }
  if(o.type==='dd'){
    win += row(bodyTop+8,18,26,210,7);             // upper deck
    win += row(bodyTop+40,18,26,200,6);            // lower deck
  } else if(o.type==='ot'){
    // open top: seats up top, lower windows
    for(let i=0;i<8;i++){const x=24+i*23;win+=`<path d="M${x} ${bodyTop+22} l0 -10 l11 0 l0 10" fill="none" stroke="${band}" stroke-width="2.4" stroke-linecap="round"/>`;}
    win += row(bodyTop+30,18,26,200,6);
  } else {
    win += row(bodyTop+10,20,26,200,6);            // single deck
  }
  // destination blind (front, gold)
  const dest = `<rect x="178" y="${bodyTop+ (isDD?2:4)}" width="46" height="13" rx="2" fill="var(--led-bg)"/>
    <rect x="181" y="${bodyTop+(isDD?5:7)}" width="40" height="7" rx="1" fill="var(--led)" opacity="0.85"/>`;
  // fuel badge
  let badge='';
  if(o.fuel==='electric') badge=`<g transform="translate(20 ${bodyBot-26})"><circle r="9" fill="var(--green)"/><path d="M2 -5 l-5 6 l3 0 l-2 5 l5 -6 l-3 0 z" fill="#fff"/></g>`;
  else if(o.fuel==='hybrid') badge=`<g transform="translate(20 ${bodyBot-26})"><circle r="9" fill="var(--green)" opacity="0.55"/><path d="M-9 0 a9 9 0 0 1 9 -9 l0 18 a9 9 0 0 1 -9 -9z" fill="var(--green)"/></g>`;
  const roofTop = o.type==='ot'
    ? `<path d="M14 ${bodyTop} q0 -2 6 -2 l200 0" fill="none" stroke="${c}" stroke-width="2" stroke-dasharray="3 4" opacity="0.6"/>`
    : '';
  return `<svg viewBox="0 0 ${VB_W} ${VB_H}" width="${o.w}" style="max-width:100%;height:auto;display:block" aria-hidden="true">
    <rect x="12" y="${bodyTop}" width="216" height="${bodyBot-bodyTop}" rx="${o.type==='ot'?8:13}" fill="${c}"/>
    ${roofTop}
    <rect x="12" y="${bodyBot-12}" width="216" height="12" fill="${band}"/>
    <rect x="12" y="${(bodyTop+bodyBot)/2-3}" width="216" height="4" fill="${band}" opacity="0.9"/>
    ${win}${dest}
    <circle cx="60" cy="${bodyBot}" r="11" fill="#1c1410"/><circle cx="60" cy="${bodyBot}" r="5" fill="#5a4a40"/>
    <circle cx="184" cy="${bodyBot}" r="11" fill="#1c1410"/><circle cx="184" cy="${bodyBot}" r="5" fill="#5a4a40"/>
    ${badge}
  </svg>`;
}

/* ============================================================
   LED dot-matrix destination blind (scrolling) — canvas
   ledBlind(canvasEl, messages[], {rows,dot,gap,speed,color,bg})
   ============================================================ */
function ledBlind(canvas, messages, opt={}){
  const o=Object.assign({rows:13, dot:4, gap:1, speed:0.55, color:'#ffb01f', bg:'#160d06', pad:2}, opt);
  const ctx=canvas.getContext('2d');
  const rows=o.rows, cell=o.dot+o.gap, r=o.dot/2;
  const cssH=(rows+o.pad*2)*cell;
  let dpr=Math.min(devicePixelRatio||1,2);
  let cssW=600, matrix=null, totalCols=2, off=0;

  function buildMatrix(){
    const tmp=document.createElement('canvas'), tctx=tmp.getContext('2d');
    const font=`700 ${rows}px "IBM Plex Mono", ui-monospace, monospace`;
    tctx.font=font;
    const widths=messages.map(m=>Math.ceil(tctx.measureText(m).width));
    const W=Math.max(2,widths.reduce((a,b)=>a+b,0)+messages.length*40+40);
    tmp.width=W; tmp.height=rows;          // resizing clears the context...
    tctx.font=font;                        // ...so re-apply state afterwards
    tctx.fillStyle='#fff'; tctx.textBaseline='alphabetic';
    let x=8; messages.forEach((m,i)=>{ tctx.fillText(m, x, rows-2); x+=widths[i]+40; });
    const img=tctx.getImageData(0,0,W,rows).data;
    const M=new Uint8Array(W*rows);
    for(let cx=0;cx<W;cx++) for(let ry=0;ry<rows;ry++){
      if(img[(ry*W+cx)*4+3]>110) M[cx*rows+ry]=1;
    }
    matrix=M; totalCols=W;
  }
  function resize(){
    cssW=Math.max(120, canvas.clientWidth||canvas.parentElement.clientWidth||600);
    canvas.width=Math.round(cssW*dpr); canvas.height=Math.round(cssH*dpr);
    canvas.style.height=cssH+'px';
  }
  function draw(){
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.fillStyle=o.bg; ctx.fillRect(0,0,cssW,cssH);
    const visCols=Math.ceil(cssW/cell)+1;
    for(let c=0;c<visCols;c++){
      const src=(((Math.floor(off)+c)%totalCols)+totalCols)%totalCols;
      for(let ry=0;ry<rows;ry++){
        const on=matrix[src*rows+ry];
        const px=c*cell+r+1, py=(ry+o.pad)*cell+r;
        ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2);
        if(on){ctx.fillStyle=o.color;ctx.shadowColor=o.color;ctx.shadowBlur=5;}
        else  {ctx.fillStyle='rgba(255,176,31,0.10)';ctx.shadowBlur=0;}
        ctx.fill();
      }
    }
    ctx.shadowBlur=0; off+=o.speed;
    requestAnimationFrame(draw);
  }
  let started=false; function start(){ if(started) return; started=true; resize(); buildMatrix(); draw(); }
  if(document.fonts && document.fonts.ready){ document.fonts.ready.then(start); setTimeout(()=>{ if(!matrix) start(); }, 400); }
  else start();
  addEventListener('resize',()=>{ dpr=Math.min(devicePixelRatio||1,2); resize(); });
}

/* ============================================================
   mini chart helpers (SVG) — bars & line, hover tooltips
   ============================================================ */
function barChart(host, data, opt={}){
  const o=Object.assign({w:680,h:300,pad:34,color:'var(--madder)',fmt:v=>v,unit:'',label:''},opt);
  const max=Math.max(...data.map(d=>d.v))*1.12;
  const iw=o.w-o.pad*2, ih=o.h-o.pad*2;
  const bw=iw/data.length;
  let bars='';
  data.forEach((d,i)=>{
    const bh=ih*(d.v/max);
    const x=o.pad+i*bw+bw*0.16, y=o.pad+ih-bh, w=bw*0.68;
    const col=o.color;
    bars+=`<rect class="bar" data-i="${i}" x="${x.toFixed(1)}" y="${(o.pad+ih).toFixed(1)}" width="${w.toFixed(1)}" height="0" rx="3"
      fill="${d.col||col}" opacity="${d.est?0.55:1}" style="--y:${y.toFixed(1)};--h:${bh.toFixed(1)}"/>`;
    bars+=`<text x="${(x+w/2).toFixed(1)}" y="${o.h-12}" text-anchor="middle" font-family="var(--mono)" font-size="10" fill="var(--ink-3)">${d.y}</text>`;
  });
  // gridlines
  let grid='';
  for(let g=0;g<=4;g++){const gy=o.pad+ih*(g/4);const val=max*(1-g/4);
    grid+=`<line x1="${o.pad}" y1="${gy}" x2="${o.w-o.pad}" y2="${gy}" stroke="var(--hair)" stroke-width="1"/>`;
    grid+=`<text x="${o.pad-6}" y="${gy+3}" text-anchor="end" font-family="var(--mono)" font-size="9" fill="var(--ink-faint)">${o.fmt(Math.round(val))}</text>`;
  }
  host.innerHTML=`<svg viewBox="0 0 ${o.w} ${o.h}" width="100%" style="overflow:visible">${grid}${bars}</svg>`;
  const svg=host.querySelector('svg');
  // animate
  requestAnimationFrame(()=>{ $$('.bar',svg).forEach((b,i)=>{
    setTimeout(()=>{ b.setAttribute('y',b.style.getPropertyValue('--y')); b.setAttribute('height',b.style.getPropertyValue('--h'));
      b.style.transition='y .7s cubic-bezier(.2,.7,.2,1),height .7s cubic-bezier(.2,.7,.2,1)';
      b.setAttribute('y',b.style.getPropertyValue('--y')); b.setAttribute('height',b.style.getPropertyValue('--h'));
    }, i*55);
  });});
  // hover
  $$('.bar',svg).forEach(b=>{
    const d=data[+b.dataset.i];
    b.style.cursor='pointer';
    b.addEventListener('mousemove',e=>{b.setAttribute('opacity','1');
      tipShow(`<b>${d.y}</b> · ${o.label}<br>${o.fmt(d.v)}${o.unit}${d.est?' <span style="color:var(--ink-faint)">(est.)</span>':''}${d.note?'<br>'+d.note:''}`,e.clientX,e.clientY);});
    b.addEventListener('mouseleave',()=>{b.setAttribute('opacity',d.est?'0.55':'1');tipHide();});
  });
}

// trigger bar grow when visible — with a guaranteed fallback so the chart
// always renders even if the IntersectionObserver never fires (background
// tabs, throttled/embedded webviews, non-painting contexts).
function barChartReveal(host,data,opt){
  let done=false;
  const render=()=>{ if(done)return; done=true; barChart(host,data,opt); };
  if('IntersectionObserver' in window){
    const io=new IntersectionObserver((es)=>{es.forEach(e=>{if(e.isIntersecting){render();io.disconnect();}});},{threshold:0.15});
    io.observe(host);
    setTimeout(render, 600);   // fallback if IO never fires
  } else {
    render();
  }
}
