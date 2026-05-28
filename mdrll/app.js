// MDRLL Deep Dive — interactivity

// ── Pipeline ──────────────────────────────────────────────────────────
function renderPipeline() {
  const stages = document.querySelector('.pipeline-stages');
  const detail = document.querySelector('.pipeline-detail');
  if (!stages || !detail) return;

  stages.innerHTML = PIPELINE_STAGES.map((s, i) => `
    <button class="stage${i === 0 ? ' active' : ''}" data-i="${i}">
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="title">${s.title.split(' → ')[0]}</span>
    </button>
  `).join('');

  function show(i) {
    const s = PIPELINE_STAGES[i];
    stages.querySelectorAll('.stage').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
    detail.innerHTML = `
      <div class="stage-name">stage ${String(i + 1).padStart(2, '0')} · ${s.name}</div>
      <div class="stage-title">${s.title}</div>
      <div class="stage-body">${s.body}</div>
      <div class="stage-viz" id="stage-viz"></div>
    `;
    renderStageViz(s.viz);
  }

  stages.addEventListener('click', (e) => {
    const btn = e.target.closest('.stage');
    if (!btn) return;
    show(Number(btn.dataset.i));
  });

  show(0);
}

function renderStageViz(kind) {
  const el = document.getElementById('stage-viz');
  if (!el) return;
  switch (kind) {
    case 'header':
      el.innerHTML = `
<div class="byte-stream">
<span class="sync">EE 4D 46 46</span> <span class="sync">0D 0A 1A 00</span>  <span class="data">// magic 'MFM'</span><br>
<span class="am">01 02 00 00</span>              <span class="data">// version 1.2 (type=transition)</span><br>
<span class="data">A8 00 00 00  0C 00 00 00</span>  <span class="data">// header size, track header size</span><br>
<span class="data">86 02 00 00  04 00 00 00</span>  <span class="data">// cyls = 646, heads = 4</span><br>
<span class="data">00 84 D7 17</span>              <span class="data">// sample rate = 200,000,000 Hz</span><br>
<span class="data">2C 00 00 00</span>  <span class="data">// cmdline len = 44</span><br>
<span class="am">"mfm_read --format WD_1006 ..."</span>
</div>`;
      break;
    case 'deltas':
      el.innerHTML = `
<div class="byte-stream">
<span class="data">3C</span> <span class="data">14</span> <span class="am">FE</span> <span class="data">82 02</span> <span class="data">28</span> <span class="data">3D</span> <span class="data">FF</span> <span class="data">A0 0F 01</span> <span class="data">14</span> <span class="data">3C</span><br>
<span class="data" style="font-size:11px; color: var(--text-faint); line-height: 1.4">  └─60─┘ <span style="color:var(--amber)">→ 254 0x0282 = 642</span>   <span style="color:var(--amber)">→ 255 0x010FA0 = 69,536</span></span><br><br>
<div style="font-size: 12px; color: var(--text-dim); line-height: 1.6">
Direct u8 covers 0-253. Marker 254 takes two more bytes as u16; 255 takes three (u24).<br>
Each value = ticks @ 200 MHz between flux transitions.
</div>
</div>`;
      break;
    case 'histogram': {
      const bars = MFM_HIST.slice(0, 120).map((v, i) => {
        const h = Math.min(60, v / 6);
        return `<div class="b" style="height:${h}px;${[40,60,80].includes(i) ? 'background:var(--phosphor);opacity:1' : ''}"></div>`;
      }).join('');
      el.innerHTML = `
<div style="font-size: 11px; color: var(--text-faint); margin-bottom: 8px;">delta histogram · MFM track · peak 2 at 60 ticks → encoding = MFM, T = 20</div>
<div class="flux-bar">${bars}</div>
<div style="display: flex; justify-content: space-between; font-family: var(--font-mono); font-size: 10px; color: var(--text-faint);">
  <span>0</span><span>2T</span><span>3T</span><span>4T</span><span>120 ticks</span>
</div>`;
      break;
    }
    case 'pll':
      el.innerHTML = `
<pre class="code" style="margin:0;padding:14px 16px;font-size:12px;">
<span class="com">// Type-I PLL — recover_clock (decode.rs:305)</span>
<span class="kw">for</span> &amp;delta <span class="kw">in</span> deltas {
    <span class="kw">let</span> spacing = (delta <span class="kw">as</span> f64 / t_est).round();
    <span class="kw">let</span> error   = delta <span class="kw">as</span> f64 - spacing * t_est;
    t_est += <span class="num">0.05</span> * error / spacing;  <span class="com">// nudge</span>
    spacings.push(spacing <span class="kw">as</span> u32);
}</pre>`;
      break;
    case 'sync':
      el.innerHTML = `
<div style="font-family: var(--font-mono); font-size: 13px; color: var(--text-dim); line-height: 1.9;">
<span style="color:var(--text-faint)">raw MFM bits:</span><br>
<span style="font-size:14px;letter-spacing:0.05em;">… 1010 1010 <span class="am" style="color:var(--amber);font-weight:600">0100 0100 1000 1001</span> <span class="am" style="color:var(--amber);font-weight:600">0100 0100 1000 1001</span> <span class="am" style="color:var(--amber);font-weight:600">0100 0100 1000 1001</span> <span style="color:var(--phosphor)">1010 0101</span> …</span><br>
<span style="font-size:11px;color:var(--text-faint)">  preamble        ↑ 0x4489 (sync A1 — C2 suppressed)        ↑ 0xFE (ID AM)</span><br><br>
A normal A1 byte encodes to 0x44A9 (clock bit set). The sync A1 is 0x4489 — a bit-rule violation that cannot occur in valid MFM data. Three in a row = sector boundary.
</div>`;
      break;
    case 'decode':
      el.innerHTML = `
<pre class="code" style="margin:0;padding:14px 16px;font-size:12px;">
<span class="com">// 7-entry (2,7) RLL codebook — proven prefix-free</span>
<span class="kw">const</span> RLL_TABLE: &amp;[(&amp;[u8], &amp;[u8])] = &amp;[
    (b<span class="str">"0100"</span>,     b<span class="str">"10"</span>),     <span class="com">// 4 code bits  → 2 data</span>
    (b<span class="str">"1000"</span>,     b<span class="str">"11"</span>),
    (b<span class="str">"000100"</span>,   b<span class="str">"000"</span>),    <span class="com">// 6 → 3</span>
    (b<span class="str">"100100"</span>,   b<span class="str">"010"</span>),
    (b<span class="str">"001000"</span>,   b<span class="str">"011"</span>),
    (b<span class="str">"00100100"</span>, b<span class="str">"0010"</span>),   <span class="com">// 8 → 4</span>
    (b<span class="str">"00001000"</span>, b<span class="str">"0011"</span>),
];</pre>`;
      break;
    case 'sector':
      el.innerHTML = `
<div class="byte-stream">
<span class="sync">A1 A1 A1</span> <span class="am">FE</span> <span class="data">0A 30 05 02</span> <span class="data">8F 4C</span>  <span style="font-size:11px;color:var(--text-faint)">// ID: cyl=10, head=3, sec=5, size=2, CRC ✓</span><br>
<span class="sync">A1 A1 A1</span> <span class="am">FB</span> <span style="color:var(--text-faint)">[ 512 data bytes ]</span> <span class="data">A2 19 EB 7C</span>  <span style="font-size:11px;color:var(--text-faint)">// DATA, 32-bit CRC ✓</span><br>
<span style="color:var(--text-faint);font-size:11px">                                          ↑ optional 5-byte ECC trailer</span>
</div>`;
      break;
    case 'image':
      el.innerHTML = `
<div style="font-family: var(--font-mono); font-size: 12px; color: var(--text-dim); line-height: 1.7;">
offset = ((cyl * heads + head) * spt + (sec - sec_base)) * sec_size<br><br>
<span style="color:var(--text-faint)">geometry discovered:</span> <span style="color:var(--text)">646 × 4 × 17 × 512</span> = <span style="color:var(--amber)">21,495,808 B</span><br>
<span style="color:var(--text-faint)">vs .tr header claims:</span> <span style="color:var(--text)">615 × 6 × 26</span> <span style="color:var(--red)">(disagrees — discovered wins)</span><br><br>
duplicates resolved by CRC preference · missing sectors zero-filled · summary → stderr
</div>`;
      break;
  }
}

// ── Controller zoo ────────────────────────────────────────────────────
function renderZoo() {
  const wrap = document.querySelector('.zoo');
  const filters = document.querySelector('.zoo-controls');
  if (!wrap) return;
  let active = 'all';

  function draw() {
    const items = CONTROLLERS.filter(c => active === 'all' || c.cat === active || (active === 'mfm' && (c.enc === 'MFM' || c.enc === 'MFM/RLL')));
    wrap.innerHTML = items.map(c => {
      const specRows = Object.entries(c.specs).map(([k, v]) =>
        `<span class="label">${k}</span><span class="value">${v}</span>`
      ).join('');
      return `
        <div class="zoo-card" data-id="${c.id}">
          <div class="badge ${c.enc === 'RLL' ? 'rll' : 'mfm'}">${c.enc}</div>
          <div class="ctlr-name">${c.name}</div>
          <div class="ctlr-sub">${c.sub}</div>
          <div class="specs">${specRows}</div>
          <div class="detail">${c.detail}</div>
        </div>`;
    }).join('');
  }

  filters?.addEventListener('click', (e) => {
    const btn = e.target.closest('.zoo-filter');
    if (!btn) return;
    active = btn.dataset.cat;
    filters.querySelectorAll('.zoo-filter').forEach(b => b.classList.toggle('active', b === btn));
    draw();
  });

  wrap.addEventListener('click', (e) => {
    const card = e.target.closest('.zoo-card');
    if (!card) return;
    card.classList.toggle('expanded');
  });

  draw();
}

// ── Modules ───────────────────────────────────────────────────────────
function renderModules() {
  const wrap = document.querySelector('.modules');
  if (!wrap) return;
  wrap.innerHTML = MODULES.map(m => `
    <div class="module-card">
      <div class="file">
        <span>src/${m.file}</span>
        <span class="loc">${m.loc} loc</span>
      </div>
      <h3>${m.title}</h3>
      <p>${m.desc}</p>
      <ul class="responsibilities">
        ${m.items.map(i => `<li>${i}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

// ── Timeline ──────────────────────────────────────────────────────────
function renderTimeline() {
  const track = document.querySelector('.timeline-track');
  const detail = document.querySelector('.timeline-detail');
  if (!track || !detail) return;

  // map dates to x positions (Mar 28 → May 17)
  const start = new Date('2026-03-28').getTime();
  const end = new Date('2026-05-28').getTime();
  const span = end - start;

  function x(date) {
    const t = new Date(date).getTime();
    return ((t - start) / span) * 100;
  }

  // month markers
  const months = [
    { d: '2026-04-01', label: 'APR 2026' },
    { d: '2026-05-01', label: 'MAY 2026' }
  ];

  track.innerHTML = `
    <div class="timeline-axis"></div>
    ${TIMELINE.map((e, i) => `
      <div class="timeline-event-line" style="left:${x(e.date)}%;"></div>
      <div class="timeline-event ${e.major ? 'major' : ''}${i === 0 ? ' active' : ''}"
           style="left:${x(e.date)}%; top:${e.major ? 14 : 22}px;"
           data-i="${i}"
           title="${e.title}"></div>
    `).join('')}
    ${months.map(m => `
      <div class="timeline-month" style="left:${x(m.d)}%;">${m.label}</div>
    `).join('')}
  `;

  function show(i) {
    const e = TIMELINE[i];
    track.querySelectorAll('.timeline-event').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
    detail.innerHTML = `
      <div>
        <div class="date">${e.date}</div>
        <div class="ver">v${e.ver}</div>
      </div>
      <div>
        <h4>${e.title}</h4>
        <p>${e.body}</p>
      </div>
    `;
  }

  track.addEventListener('click', (ev) => {
    const dot = ev.target.closest('.timeline-event');
    if (!dot) return;
    show(Number(dot.dataset.i));
  });

  show(0);
}

// ── Flux histogram demo ───────────────────────────────────────────────
function renderFluxDemo() {
  const wrap = document.querySelector('.histogram');
  const toggle = document.querySelector('.flux-toggle');
  const readout = document.querySelector('.flux-readout');
  if (!wrap || !toggle) return;

  const MFM_PEAKS = [40, 60, 80];
  const RLL_PEAKS = [40, 53, 67, 80, 93, 107];
  const MFM_LABELS = { 40: '2T', 60: '3T', 80: '4T' };
  const RLL_LABELS = { 40: '3T', 53: '4T', 67: '5T', 80: '6T', 93: '7T', 107: '8T' };

  function draw(kind) {
    const data = kind === 'mfm' ? MFM_HIST : RLL_HIST;
    const peaks = kind === 'mfm' ? MFM_PEAKS : RLL_PEAKS;
    const labels = kind === 'mfm' ? MFM_LABELS : RLL_LABELS;
    const max = Math.max(...data);

    const bars = data.map((v, i) => {
      const h = (v / max) * 100;
      const isPeak = peaks.includes(i);
      const label = isPeak ? `data-label="${labels[i]} @ ${i}"` : '';
      return `<div class="bar${isPeak ? ' peak' : ''}" style="height:${h}%" ${label}></div>`;
    }).join('');

    const axisMarks = [0, 30, 60, 90, 120].map(t => {
      const pct = (t / 120) * 100;
      return `<div class="axis-mark" style="left:${pct}%;">${t}</div>`;
    }).join('');

    wrap.innerHTML = bars + axisMarks;

    // readout
    const enc = kind === 'mfm' ? 'MFM' : 'RLL 2,7';
    const T = kind === 'mfm' ? '20.0' : '13.33';
    const peak2 = kind === 'mfm' ? '60' : '53';
    const datarate = kind === 'mfm' ? '5 Mbit/s' : '7.5 Mbit/s';
    readout.innerHTML = `
      <div class="item">
        <div class="k">Encoding</div>
        <div class="v" style="color:var(--amber)">${enc}</div>
        <div class="desc">${kind === 'mfm' ? '3 peaks (2T/3T/4T)' : '6 peaks (3T-8T)'}</div>
      </div>
      <div class="item">
        <div class="k">Bit-cell T</div>
        <div class="v">${T}<span style="color:var(--text-dim); font-size:12px"> ticks</span></div>
        <div class="desc">@ 200 MHz sample rate</div>
      </div>
      <div class="item">
        <div class="k">2nd peak position</div>
        <div class="v">${peak2}<span style="color:var(--text-dim); font-size:12px"> ticks</span></div>
        <div class="desc">discriminator: 60 vs 53 is unambiguous</div>
      </div>
      <div class="item">
        <div class="k">Data rate</div>
        <div class="v">${datarate}</div>
        <div class="desc">${kind === 'mfm' ? '10 MHz code-bit rate' : '15 MHz code-bit rate'}</div>
      </div>
    `;
  }

  toggle.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    toggle.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    draw(btn.dataset.kind);
  });

  draw('mfm');
}

// ── Assessment ────────────────────────────────────────────────────────
function renderAssessment() {
  const good = document.querySelector('.assessment-col.good ul');
  const bad = document.querySelector('.assessment-col.improve ul');
  if (good) {
    good.innerHTML = STRENGTHS.map((s, i) => `
      <li>
        <span class="marker">${String(i + 1).padStart(2, '0')}</span>
        <div>
          <span class="title">${s.title}</span>
          <span class="body">${s.body}</span>
        </div>
      </li>
    `).join('');
  }
  if (bad) {
    bad.innerHTML = IMPROVEMENTS.map((s, i) => `
      <li>
        <span class="marker">${String(i + 1).padStart(2, '0')}</span>
        <div>
          <span class="title">${s.title}</span>
          <span class="body">${s.body}</span>
        </div>
      </li>
    `).join('');
  }
}

// ── Stats counter animation ───────────────────────────────────────────
function animateCounters() {
  const counters = document.querySelectorAll('[data-counter]');
  counters.forEach(el => {
    const target = el.dataset.counter;
    const num = parseFloat(target.replace(/[^\d.]/g, ''));
    if (isNaN(num)) {
      el.textContent = target;
      return;
    }
    const suffix = target.replace(/[\d.,]/g, '');
    const duration = 1100;
    const steps = 40;
    const stepDur = duration / steps;
    let i = 0;
    const fmt = (n) => {
      if (num >= 1000) return Math.round(n).toLocaleString();
      return Math.round(n).toString();
    };
    const tick = setInterval(() => {
      i++;
      const t = i / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      el.textContent = fmt(num * eased) + suffix;
      if (i >= steps) {
        clearInterval(tick);
        el.textContent = target;
      }
    }, stepDur);
  });
}

// ── Tech primer (tabbed deep dive) ────────────────────────────────────
function renderTechPrimer() {
  const tabsEl = document.querySelector('.tech-tabs');
  const contentEl = document.querySelector('.tech-content');
  if (!tabsEl || !contentEl) return;

  tabsEl.innerHTML = TECH_TABS.map((t, i) => `
    <button class="tech-tab${i === 0 ? ' active' : ''}" data-i="${i}">
      <span class="num">${String(i + 1).padStart(2, '0')}</span>
      <span class="lbl">${t.label}</span>
    </button>
  `).join('');

  function show(i) {
    const t = TECH_TABS[i];
    tabsEl.querySelectorAll('.tech-tab').forEach((el, idx) => {
      el.classList.toggle('active', idx === i);
    });
    contentEl.innerHTML = `
      <div class="tech-prose">
        <div class="tt">${String(i + 1).padStart(2, '0')} · ${t.label}</div>
        <h3>${t.title}</h3>
        <div class="lede">${t.lede}</div>
        <div class="body">${t.body}</div>
      </div>
      <div class="tech-diagram">${DIAGRAMS[t.diagram] || ''}</div>
    `;
  }

  tabsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.tech-tab');
    if (!btn) return;
    show(Number(btn.dataset.i));
  });

  show(0);
}

// ── Bootstrap ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderPipeline();
  renderModules();
  renderZoo();
  renderTechPrimer();
  renderTimeline();
  renderFluxDemo();
  renderAssessment();
  // delay counter animation briefly
  setTimeout(animateCounters, 200);
});
