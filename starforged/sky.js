"use strict";
/* The Star-Forged Ring — part 1: the sky.
   Shared helpers + hero, BBN, onion star, binding curve, s/r-process, merger, drift. */

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
// deterministic pseudo-random, stable across resizes
const hash = s => { const v = Math.sin(s * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/* ---------- reading progress ---------- */
const prog = document.getElementById('progress');
addEventListener('scroll', () => {
  const h = document.documentElement, max = h.scrollHeight - h.clientHeight;
  prog.style.width = (max > 0 ? (h.scrollTop / max * 100) : 0) + '%';
}, { passive: true });

/* ---------- reveal on scroll ---------- */
const io = new IntersectionObserver((es) => {
  es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
}, { threshold: .12, rootMargin: '0px 0px -8% 0px' });
document.querySelectorAll('.rv').forEach((el, i) => { el.style.transitionDelay = (Math.min(i, 4) * 55) + 'ms'; io.observe(el); });

/* only animate a canvas while it's on screen */
function whenVisible(el, onIn, onOut) {
  const ob = new IntersectionObserver(es => es.forEach(e => { e.isIntersecting ? onIn() : (onOut && onOut()); }), { threshold: .15 });
  ob.observe(el); return ob;
}
/* standard canvas sizing */
function fitCanvas(c, x, h) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = c.clientWidth, H = h || c.height / (c.dataset.dpr || 1) || c.clientHeight;
  c.width = W * dpr; c.height = (h || H) * dpr; c.dataset.dpr = dpr;
  c.style.height = (h || H) + 'px';
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { W, H: h || H };
}

/* ================================================================
   COSMIC CLOCK — a fixed HUD that tracks scroll position through
   13.8 billion years, interpolating (in log time) between sections.
   ================================================================ */
(function () {
  const el = document.getElementById('clock'), tEl = document.getElementById('clockT'), eEl = document.getElementById('clockE');
  const secs = [...document.querySelectorAll('section[data-t]')];
  const YR = 3.156e7; // seconds per year
  function fmtT(yr) {
    if (yr <= 0) return 'T + 0';
    const s = yr * YR;
    if (s < 90) return 'T + ' + (s < 1 ? s.toFixed(s < 0.01 ? 4 : 2) : Math.round(s)) + ' s';
    if (s < 5400) return 'T + ' + Math.round(s / 60) + ' min';
    if (yr < 1) return 'T + ' + Math.round(s / 3600) + ' hours';
    if (yr < 1e3) return 'T + ' + Math.round(yr) + ' years';
    if (yr < 1e6) return 'T + ' + Math.round(yr / 1e3).toLocaleString() + ',000 yr';
    if (yr < 1e9) return 'T + ' + (yr / 1e6).toFixed(yr < 1e7 ? 1 : 0) + ' million yr';
    return 'T + ' + (yr / 1e9).toFixed(2) + ' billion yr';
  }
  let marks = [];
  function measure() {
    marks = secs.map(s => ({
      y: s.getBoundingClientRect().top + scrollY,
      h: s.offsetHeight,
      t: parseFloat(s.dataset.t) || 0,
      era: s.dataset.era || ''
    }));
  }
  const L = t => Math.log10(Math.max(t, 1e-7) + 1e-7);
  function update() {
    if (!marks.length) return;
    const probe = scrollY + innerHeight * 0.55;
    el.classList.toggle('on', scrollY > innerHeight * 0.5);
    let i = 0;
    while (i < marks.length - 1 && probe > marks[i + 1].y) i++;
    const cur = marks[i], nxt = marks[i + 1];
    let t = cur.t;
    if (nxt && nxt.t > cur.t) {
      const f = clamp((probe - cur.y) / Math.max(nxt.y - cur.y, 1), 0, 1);
      t = cur.t <= 0 ? Math.pow(10, lerp(-7, L(nxt.t), f)) : Math.pow(10, lerp(L(cur.t), L(nxt.t), f));
      if (f < 0.02 && cur.t <= 0) t = 0;
    }
    tEl.textContent = fmtT(t);
    eEl.textContent = cur.era;
  }
  measure(); update();
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', () => { measure(); update(); });
  // late layout shifts (fonts, reveals)
  setTimeout(measure, 800); setTimeout(measure, 2500);
})();

/* ================================================================
   HERO — a slow starfield with a distant, occasional kilonova
   ================================================================ */
(function () {
  const c = document.getElementById('stars'), x = c.getContext('2d');
  let W, H, stars = [], t = 0, running = false, nova = null;
  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    W = c.clientWidth; H = c.clientHeight;
    c.width = W * dpr; c.height = H * dpr; x.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.round(clamp(W * H / 3800, 90, 320));
    stars = Array.from({ length: n }, (_, i) => ({
      x: hash(i * 3.1) * W, y: hash(i * 7.7 + 1) * H,
      r: 0.4 + hash(i * 1.7) * 1.4, ph: hash(i * 2.3) * TAU,
      sp: 0.3 + hash(i * 5.9) * 1.2,
      warm: hash(i * 9.1) < 0.22
    }));
  }
  function frame() {
    if (!running) return;
    t += 0.016;
    x.clearRect(0, 0, W, H);
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph);
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, TAU);
      x.fillStyle = s.warm ? `rgba(255,207,122,${0.5 * tw})` : `rgba(223,231,245,${0.6 * tw})`;
      x.fill();
    }
    // occasional far-off kilonova: a soft gold bloom that swells and dies
    if (!nova && Math.random() < 0.004) nova = { x: (0.12 + Math.random() * 0.76) * W, y: (0.1 + Math.random() * 0.55) * H, a: 0 };
    if (nova) {
      nova.a += 0.014;
      const k = Math.sin(Math.min(nova.a, 1) * Math.PI);
      const R = 8 + nova.a * 46;
      const g = x.createRadialGradient(nova.x, nova.y, 0, nova.x, nova.y, R);
      g.addColorStop(0, `rgba(255,220,160,${0.5 * k})`);
      g.addColorStop(0.4, `rgba(255,140,120,${0.22 * k})`);
      g.addColorStop(1, 'rgba(255,120,120,0)');
      x.fillStyle = g; x.beginPath(); x.arc(nova.x, nova.y, R, 0, TAU); x.fill();
      if (nova.a > 1.6) nova = null;
    }
    requestAnimationFrame(frame);
  }
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(frame); else { frame(); running = false; } } },
    () => { running = false; });
  if (REDUCED) { running = true; frame(); running = false; }
})();

/* ================================================================
   FIG 1 — Big-Bang nucleosynthesis, on a time slider
   ================================================================ */
(function () {
  const c = document.getElementById('bbn'), x = c.getContext('2d');
  const slider = document.getElementById('bbnSlider'), timeEl = document.getElementById('bbnTime'), tag = document.getElementById('bbnTag');
  const bars = {
    H: [document.getElementById('abH'), document.getElementById('abHv')],
    He: [document.getElementById('abHe'), document.getElementById('abHev')],
    Li: [document.getElementById('abLi'), document.getElementById('abLiv')],
    Pt: [document.getElementById('abPt'), document.getElementById('abPtv')]
  };
  let W, H, anim = 0, running = false;
  const N = 120;
  // particles: fixed home positions, role assigned per phase
  const ps = Array.from({ length: N }, (_, i) => ({
    hx: 0.06 + hash(i * 3.7) * 0.88, hy: 0.1 + hash(i * 5.3 + 2) * 0.8,
    ph: hash(i * 2.9) * TAU, sp: 0.5 + hash(i * 7.1) * 1.4,
    neutron: i % 8 === 0            // 1-in-8 ⇒ the 7:1 proton:neutron freeze-out
  }));
  // helium groups: pick 14 clusters of [2 neutrons + 2 protons] → 25% of mass
  const groups = [];
  {
    const neutrons = ps.filter(p => p.neutron), protons = ps.filter(p => !p.neutron);
    for (let g = 0; g < 7; g++) {
      const members = [neutrons[g * 2], neutrons[g * 2 + 1], protons[g * 3], protons[g * 3 + 1]].filter(Boolean);
      if (members.length === 4) { members.forEach(m => m.group = g); groups.push({ i: g }); }
    }
  }
  function size() { ({ W, H } = fitCanvas(c, x, 270)); draw(); }
  // slider 0..1000 → time 1e-4 s .. 1400 s (log)
  const sliderT = () => Math.pow(10, lerp(-4, Math.log10(1400), slider.value / 1000));
  function fmtS(s) {
    if (s < 1) return s.toPrecision(2) + ' s';
    if (s < 120) return s.toFixed(0) + ' s';
    return (s / 60).toFixed(1) + ' min';
  }
  function phase(t) { return t < 1 ? 0 : t < 10 ? 1 : t < 180 ? 2 : 3; } // quark / nucleon / bottleneck / helium
  function draw() {
    const t = sliderT(), P = phase(t);
    anim += 0.016;
    x.clearRect(0, 0, W, H);
    // background temperature wash: white-hot → deep red → dark
    const cool = clamp(Math.log10(t) / Math.log10(1400) * 0.5 + 0.5, 0, 1); // 0 hot → 1 cold
    const g = x.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, Math.max(W, H) * 0.7);
    g.addColorStop(0, `rgba(255,${Math.round(200 - 120 * cool)},${Math.round(140 - 100 * cool)},${0.16 * (1 - cool) + 0.03})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    const jit = (1 - cool) * 9 + 1.5;      // thermal jitter shrinks as it cools
    const heF = P < 3 ? 0 : clamp((Math.log10(t) - Math.log10(180)) / (Math.log10(900) - Math.log10(180)), 0, 1);
    for (const p of ps) {
      let px = p.hx * W + Math.cos(anim * p.sp + p.ph) * jit;
      let py = p.hy * H + Math.sin(anim * p.sp * 1.3 + p.ph) * jit;
      if (P === 0) { // quark soup: split each nucleon into 3 flickering quarks
        for (let q = 0; q < 3; q++) {
          const qa = anim * (2 + p.sp) + p.ph + q * TAU / 3;
          x.beginPath(); x.arc(px + Math.cos(qa) * 5, py + Math.sin(qa) * 5, 1.3, 0, TAU);
          x.fillStyle = ['rgba(127,212,255,.8)', 'rgba(255,109,146,.8)', 'rgba(255,207,122,.8)'][q]; x.fill();
        }
        continue;
      }
      // bound into helium? move toward the group centroid
      if (P === 3 && p.group !== undefined && heF > hash(p.group * 13.7) * 0.65) {
        const gm = ps.filter(q => q.group === p.group);
        const cx0 = gm.reduce((s, q) => s + q.hx, 0) / 4 * W, cy0 = gm.reduce((s, q) => s + q.hy, 0) / 4 * H;
        const idx = gm.indexOf(p), aa = idx * TAU / 4 + Math.PI / 4 + anim * 0.6;
        px = lerp(px, cx0 + Math.cos(aa) * 5.5, 0.94); py = lerp(py, cy0 + Math.sin(aa) * 5.5, 0.94);
        // bond glow
        x.beginPath(); x.arc(cx0, cy0, 10, 0, TAU); x.fillStyle = 'rgba(165,140,255,.06)'; x.fill();
      }
      // deuterium flashes during the bottleneck: brief pairings, smashed by photons
      if (P === 2 && p.neutron && Math.sin(anim * 2.2 + p.ph * 3) > 0.86) {
        x.beginPath(); x.arc(px + 4, py, 6.5, 0, TAU); x.strokeStyle = 'rgba(255,207,122,.5)'; x.lineWidth = 1; x.stroke();
      }
      x.beginPath(); x.arc(px, py, p.neutron ? 2.6 : 2.3, 0, TAU);
      x.fillStyle = p.neutron ? 'rgba(127,212,255,.9)' : 'rgba(255,109,146,.85)';
      x.fill();
    }
    // legend
    x.font = '11px ui-monospace,monospace'; x.fillStyle = 'rgba(150,160,192,.9)';
    const legend = ['a soup of free quarks — too hot for protons to exist',
      'protons (pink) & neutrons (blue) — seven protons per neutron',
      'the deuterium bottleneck — pairs form, photons smash them apart',
      'helium-4 locks up the neutrons — and there the ladder ends'][P];
    x.fillText(legend, 12, H - 12);
    // temperature readout
    const temp = 1e10 / Math.sqrt(Math.max(t, 1e-4));
    x.fillStyle = 'rgba(255,207,122,.85)';
    x.fillText('T ≈ ' + temp.toExponential(1).replace('e+', '×10^') + ' K', 12, 20);
    // bars
    const doneF = P < 3 ? 0 : heF;
    setBar('H', 100 - 25 * doneF, (100 - 25 * doneF).toFixed(0) + '%');
    setBar('He', 25 * doneF, (25 * doneF).toFixed(1) + '%');
    setBar('Li', doneF > 0.6 ? 0.5 : 0, doneF > 0.6 ? 'a trace' : '—');
    setBar('Pt', 0, doneF > 0.9 ? '0 — none, anywhere' : '0');
    timeEl.textContent = fmtS(t); tag.textContent = 'T + ' + fmtS(t);
  }
  function setBar(k, pct, label) { bars[k][0].style.width = clamp(pct, 0, 100) + '%'; bars[k][1].textContent = label; }
  function loop() { if (!running) return; draw(); requestAnimationFrame(loop); }
  slider.addEventListener('input', draw);
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running && !REDUCED) { running = true; requestAnimationFrame(loop); } }, () => { running = false; });
})();

/* ================================================================
   FIG 2 — the onion star
   ================================================================ */
(function () {
  const c = document.getElementById('onion'), x = c.getContext('2d');
  const read = document.getElementById('onionRead'), tag = document.getElementById('onionTag');
  const shells = [
    { name: 'hydrogen envelope', burn: 'H → He', T: '35 million K', life: '~8 million years', col: [127, 212, 255], r: 1.00 },
    { name: 'helium shell', burn: 'He → C, O', T: '180 million K', life: '~1 million years', col: [165, 140, 255], r: 0.78 },
    { name: 'carbon shell', burn: 'C → Ne, Mg', T: '800 million K', life: '~1,000 years', col: [255, 207, 122], r: 0.60 },
    { name: 'neon shell', burn: 'Ne → O, Mg', T: '1.6 billion K', life: '~1 year', col: [255, 160, 110], r: 0.45 },
    { name: 'oxygen shell', burn: 'O → Si, S', T: '1.9 billion K', life: '~4 months', col: [255, 120, 120], r: 0.33 },
    { name: 'silicon shell', burn: 'Si → Fe, Ni', T: '3.3 billion K', life: '~1 day', col: [255, 109, 146], r: 0.22 },
    { name: 'IRON CORE', burn: 'no burning — inert ash', T: '7+ billion K', life: 'grows to 1.4 suns… then collapses in ¼ s', col: [233, 237, 247], r: 0.12 }
  ];
  let W, H, R, cx, cy, sel = -1, anim = 0, running = false;
  function size() { ({ W, H } = fitCanvas(c, x, 330)); R = Math.min(W * 0.42, H * 0.44); cx = W / 2; cy = H / 2 + 4; draw(); }
  function draw() {
    anim += 0.016;
    x.clearRect(0, 0, W, H);
    for (let i = 0; i < shells.length; i++) {
      const s = shells[i], rr = s.r * R;
      const pulse = 1 + Math.sin(anim * (1.2 + i * 0.7)) * 0.012;
      const [r0, g0, b0] = s.col, on = sel === i;
      const grd = x.createRadialGradient(cx, cy, rr * 0.55, cx, cy, rr * pulse);
      grd.addColorStop(0, `rgba(${r0},${g0},${b0},0)`);
      grd.addColorStop(1, `rgba(${r0},${g0},${b0},${on ? 0.5 : 0.24})`);
      x.beginPath(); x.arc(cx, cy, rr * pulse, 0, TAU); x.fillStyle = grd; x.fill();
      x.strokeStyle = `rgba(${r0},${g0},${b0},${on ? 0.95 : 0.4})`; x.lineWidth = on ? 2 : 1; x.stroke();
    }
    // flicker at the very centre
    x.beginPath(); x.arc(cx, cy, shells[6].r * R * (0.5 + 0.08 * Math.sin(anim * 6)), 0, TAU);
    x.fillStyle = 'rgba(233,237,247,.85)'; x.fill();
    // labels for outer & core
    x.font = '10.5px ui-monospace,monospace'; x.textAlign = 'center';
    x.fillStyle = 'rgba(127,212,255,.8)'; x.fillText('hydrogen — burning for 8,000,000 years', cx, cy - R - 10);
    x.fillStyle = 'rgba(233,237,247,.8)'; x.fillText('iron — one day left', cx, cy + R + 18);
    x.textAlign = 'left';
    x.fillStyle = 'rgba(109,119,160,.9)'; x.fillText('not to scale — the real core is a millionth of the star’s width', 10, H - 10);
  }
  function pick(ev) {
    const b = c.getBoundingClientRect();
    const px = (ev.clientX ?? (ev.touches && ev.touches[0].clientX)) - b.left;
    const py = (ev.clientY ?? (ev.touches && ev.touches[0].clientY)) - b.top;
    const d = Math.hypot(px - cx, py - cy) / R;
    let hit = -1;
    for (let i = shells.length - 1; i >= 0; i--) if (d <= shells[i].r) { hit = i; break; }
    if (hit !== sel) {
      sel = hit;
      if (sel >= 0) {
        const s = shells[sel];
        read.innerHTML = `<b>${s.name}</b> · ${s.burn} · ${s.T} · <b style="color:#ffcf7a">${s.life}</b>`;
        tag.textContent = s.name.toLowerCase();
      } else { read.innerHTML = '<b>Tap or hover a shell.</b> Each one is a separate furnace, burning the ash of the shell above.'; tag.textContent = 'tap a shell'; }
      draw();
    }
  }
  c.addEventListener('pointermove', pick);
  c.addEventListener('pointerdown', pick);
  function loop() { if (!running) return; draw(); requestAnimationFrame(loop); }
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running && !REDUCED) { running = true; requestAnimationFrame(loop); } }, () => { running = false; });
})();

/* ================================================================
   FIG 3 — the binding-energy curve
   ================================================================ */
(function () {
  const c = document.getElementById('bind'), x = c.getContext('2d');
  const read = document.getElementById('bindRead');
  // anchor nuclei: [A, BE/A MeV, symbol, name]
  const pts = [
    [1, 0, '¹H', 'hydrogen'], [2, 1.11, '²H', 'deuterium'], [3, 2.57, '³He', 'helium-3'],
    [4, 7.07, '⁴He', 'helium-4'], [7, 5.61, '⁷Li', 'lithium-7'], [12, 7.68, '¹²C', 'carbon-12'],
    [16, 7.98, '¹⁶O', 'oxygen-16'], [28, 8.45, '²⁸Si', 'silicon-28'], [40, 8.60, '⁴⁰Ca', 'calcium-40'],
    [56, 8.79, '⁵⁶Fe', 'IRON-56 — the peak'], [62, 8.79, '⁶²Ni', 'nickel-62 — the true summit'],
    [84, 8.72, '⁸⁴Kr', 'krypton-84'], [120, 8.50, '¹²⁰Sn', 'tin-120'], [153, 8.22, '¹⁵³Eu', 'europium-153'],
    [195, 7.92, '¹⁹⁵Pt', 'PLATINUM-195 — your ring'], [197, 7.92, '¹⁹⁷Au', 'GOLD-197'],
    [238, 7.57, '²³⁸U', 'uranium-238']
  ];
  let W, H, hover = 9, running = false, anim = 0;
  const PAD = { l: 44, r: 16, t: 26, b: 40 };
  const ax = A => PAD.l + (Math.log10(A) / Math.log10(240)) * (W - PAD.l - PAD.r);
  const ay = be => H - PAD.b - (be / 9.4) * (H - PAD.t - PAD.b);
  function curveAt(A) { // piecewise linear in log-A between anchors — keeps the honest He-4 spike / Li dip
    const arr = pts;
    for (let i = 0; i < arr.length - 1; i++) {
      if (A >= arr[i][0] && A <= arr[i + 1][0]) {
        const f = (Math.log10(A) - Math.log10(arr[i][0])) / (Math.log10(arr[i + 1][0]) - Math.log10(arr[i][0]));
        return lerp(arr[i][1], arr[i + 1][1], f);
      }
    }
    return arr[arr.length - 1][1];
  }
  function size() { ({ W, H } = fitCanvas(c, x, 300)); draw(); }
  function draw() {
    anim += 0.016;
    x.clearRect(0, 0, W, H);
    // axes
    x.strokeStyle = 'rgba(150,164,214,.25)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(PAD.l, PAD.t - 8); x.lineTo(PAD.l, H - PAD.b); x.lineTo(W - PAD.r, H - PAD.b); x.stroke();
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,1)';
    x.fillText('binding energy per particle (MeV)', PAD.l - 34, PAD.t - 12);
    x.textAlign = 'right'; x.fillText('mass of nucleus →  (log)', W - PAD.r, H - 8); x.textAlign = 'left';
    for (const v of [2, 4, 6, 8]) { x.fillText(v, PAD.l - 18, ay(v) + 3); x.strokeStyle = 'rgba(150,164,214,.08)'; x.beginPath(); x.moveTo(PAD.l, ay(v)); x.lineTo(W - PAD.r, ay(v)); x.stroke(); }
    // uphill / downhill washes
    const peakX = ax(58);
    let grd = x.createLinearGradient(PAD.l, 0, peakX, 0);
    grd.addColorStop(0, 'rgba(127,212,255,.07)'); grd.addColorStop(1, 'rgba(127,212,255,0)');
    x.fillStyle = grd; x.fillRect(PAD.l, PAD.t, peakX - PAD.l, H - PAD.t - PAD.b);
    grd = x.createLinearGradient(peakX, 0, W - PAD.r, 0);
    grd.addColorStop(0, 'rgba(255,109,146,0)'); grd.addColorStop(1, 'rgba(255,109,146,.08)');
    x.fillStyle = grd; x.fillRect(peakX, PAD.t, W - PAD.r - peakX, H - PAD.t - PAD.b);
    x.fillStyle = 'rgba(127,212,255,.75)'; x.fillText('fusion pays →', PAD.l + 8, PAD.t + 6);
    x.textAlign = 'right'; x.fillStyle = 'rgba(255,109,146,.75)'; x.fillText('← fission pays', W - PAD.r - 4, PAD.t + 6); x.textAlign = 'left';
    // the curve
    x.beginPath();
    for (let A = 1; A <= 240; A += 0.5) { const X = ax(A), Y = ay(curveAt(A)); A === 1 ? x.moveTo(X, Y) : x.lineTo(X, Y); }
    x.strokeStyle = 'rgba(233,237,247,.9)'; x.lineWidth = 2; x.stroke();
    // anchor dots
    pts.forEach((p, i) => {
      const X = ax(p[0]), Y = ay(p[1]);
      const key = i === 9 || i === 14 || i === 15;
      x.beginPath(); x.arc(X, Y, i === hover ? 5 : (key ? 4 : 2.5), 0, TAU);
      x.fillStyle = i === 9 || i === 10 ? '#ff6d92' : (i >= 14 && i <= 15 ? '#ffcf7a' : 'rgba(127,212,255,.9)');
      x.fill();
      if (key && i !== hover) { x.fillStyle = 'rgba(150,160,192,.75)'; x.fillText(p[2], X - 8, Y - 10); }
    });
    // Fe flag
    x.strokeStyle = 'rgba(255,109,146,.4)'; x.setLineDash([3, 4]);
    x.beginPath(); x.moveTo(ax(56), ay(8.79)); x.lineTo(ax(56), H - PAD.b); x.stroke(); x.setLineDash([]);
    // hover card
    const p = pts[hover], X = ax(p[0]), Y = ay(p[1]);
    x.beginPath(); x.arc(X, Y, 7 + Math.sin(anim * 4) * 1.2, 0, TAU); x.strokeStyle = 'rgba(255,207,122,.8)'; x.stroke();
    const label = `${p[2]} · ${p[1].toFixed(2)} MeV`;
    x.font = '12px ui-monospace,monospace';
    const tw = x.measureText(label).width;
    const bx = clamp(X - tw / 2 - 8, PAD.l, W - PAD.r - tw - 16), by = Y < 70 ? Y + 14 : Y - 40;
    x.fillStyle = 'rgba(8,10,22,.92)'; x.strokeStyle = 'rgba(150,164,214,.35)';
    x.beginPath();
    if (x.roundRect) x.roundRect(bx, by, tw + 16, 26, 7); else x.rect(bx, by, tw + 16, 26);
    x.fill(); x.stroke();
    x.fillStyle = '#fff'; x.fillText(label, bx + 8, by + 17);
  }
  function pick(ev) {
    const b = c.getBoundingClientRect();
    const px = (ev.clientX ?? (ev.touches && ev.touches[0].clientX)) - b.left;
    let best = 0, bd = 1e9;
    pts.forEach((p, i) => { const d = Math.abs(ax(p[0]) - px); if (d < bd) { bd = d; best = i; } });
    if (best !== hover) {
      hover = best;
      const p = pts[hover];
      const side = p[0] < 56 ? `uphill — fusing toward iron <b>releases</b> energy here.`
        : p[0] <= 62 ? `<b>the summit.</b> The most tightly bound matter in the universe. No fusion or fission can profit from it — every star's furnace dies here.`
          : `downhill — building ${p[3].toLowerCase().split('—')[0].trim()} by fusion <b>consumes</b> energy. No shining star will ever do it.`;
      read.innerHTML = `<b>${p[3]}</b> · ${p[1].toFixed(2)} MeV per particle · ${side}`;
      draw();
    }
  }
  c.addEventListener('pointermove', pick);
  c.addEventListener('pointerdown', pick);
  function loop() { if (!running) return; draw(); requestAnimationFrame(loop); }
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running && !REDUCED) { running = true; requestAnimationFrame(loop); } }, () => { running = false; });
})();

/* ================================================================
   FIG 4 — s-process vs r-process on the chart of nuclides
   ================================================================ */
(function () {
  const c = document.getElementById('nz'), x = c.getContext('2d');
  const read = document.getElementById('nzRead'), tag = document.getElementById('nzTag');
  const btnS = document.getElementById('btnS'), btnR = document.getElementById('btnR'), btnReset = document.getElementById('btnNZreset');
  let W, H, running = false, anim = 0;
  const PAD = { l: 46, r: 18, t: 20, b: 42 };
  const NMAX = 150, ZMAX = 95;
  const nx = n => PAD.l + n / NMAX * (W - PAD.l - PAD.r);
  const zy = z => H - PAD.b - z / ZMAX * (H - PAD.t - PAD.b);
  // valley of stability: most-stable Z for a given A
  const stableZ = A => Math.round(A / (1.98 + 0.0155 * Math.pow(A, 2 / 3)));
  // walker state
  let mode = null, trail = [], pos = null, phaseMsg = '', done = false, stepAcc = 0, sparkle = 0;
  function reset() { mode = null; trail = []; pos = null; phaseMsg = ''; done = false; sparkle = 0; tag.textContent = 'seed: iron-56'; read.innerHTML = 'The grey band is the <b>valley of stability</b> — every stable nucleus that exists. Iron sits at the bottom-left; platinum and gold are marked near the top.'; }
  function start(m) {
    mode = m; trail = []; done = false; sparkle = 0; stepAcc = 0;
    pos = { Z: 26, N: 30 }; trail.push({ ...pos });
    tag.textContent = m === 's' ? 's-process · one capture every few years' : 'r-process · thousands of captures per second';
    read.innerHTML = m === 's'
      ? 'Inside a red giant: a neutron drips in every few <b>years</b>. The nucleus always beta-decays back to stability before the next one arrives — so the path hugs the valley floor.'
      : '<b>The blizzard.</b> Captures arrive far faster than decays: the nucleus is driven out to the neutron drip line, twenty neutrons beyond stability.';
  }
  function step() {
    if (!pos || done) return;
    const A = pos.Z + pos.N, sz = stableZ(A);
    if (mode === 's') {
      // capture; if now 2+ neutrons past stability, beta-decay
      if (pos.Z < sz) { pos.Z += 1; pos.N -= 1; }   // β⁻: n → p
      else pos.N += 1;
      if (pos.Z >= 82 && pos.N >= 125) { done = true; phaseMsg = 'end of the s-road: lead & bismuth. It never reaches the r-only isotopes — and makes only a few % of Pt/Au.'; read.innerHTML = '<b>Journey’s end: lead-208.</b> Thousands of years of patient drip-feeding built strontium, barium and lead along the way — but the s-process contributes only a few percent of platinum and gold. For those, run the violent way.'; tag.textContent = 's-process · arrived at lead'; }
    } else {
      const drip = z => Math.round(z * 1.55 + 12);       // schematic neutron drip line
      if (phaseMsg !== 'freeze') {
        if (pos.Z < 70) {
          if (pos.N < drip(pos.Z)) pos.N += 2;           // gorge on neutrons
          else { pos.Z += 1; pos.N += 1; }               // β⁻ mid-storm, then keep eating
        } else if (pos.N < 126) pos.N += 2;
        else { phaseMsg = 'freeze'; read.innerHTML = '<b>The storm stops.</b> Seconds later the neutron supply is gone. Now the bloated nuclei cascade back — each beta-decay turning a neutron into a proton, climbing the periodic table as it falls toward stability…'; tag.textContent = 'freeze-out · decaying back to stability'; }
      } else {
        // beta cascade toward stability: Z+1, N-1
        const target = { Z: 78, N: 117 };
        if (pos.Z < target.Z) { pos.Z += 1; pos.N -= 1; }
        else { done = true; sparkle = 1; read.innerHTML = '<b>Touchdown: platinum.</b> The cascade has come to rest on the stable isotopes of platinum and gold (and their neighbours osmium and iridium). Total elapsed time in the storm: <b>about one second</b>. This is the only known origin of the metal on your finger.'; tag.textContent = 'r-process · landed on Pt & Au'; }
      }
    }
    trail.push({ ...pos });
  }
  function size() { ({ W, H } = fitCanvas(c, x, 340)); draw(); }
  function draw() {
    anim += 0.016;
    x.clearRect(0, 0, W, H);
    x.font = '10.5px ui-monospace,monospace';
    // axes
    x.strokeStyle = 'rgba(150,164,214,.25)';
    x.beginPath(); x.moveTo(PAD.l, PAD.t); x.lineTo(PAD.l, H - PAD.b); x.lineTo(W - PAD.r, H - PAD.b); x.stroke();
    x.fillStyle = 'rgba(109,119,160,1)';
    x.save(); x.translate(14, H / 2); x.rotate(-Math.PI / 2); x.textAlign = 'center'; x.fillText('protons (element) →', 0, 0); x.restore();
    x.textAlign = 'right'; x.fillText('neutrons →', W - PAD.r, H - 10); x.textAlign = 'left';
    // valley of stability band
    x.beginPath();
    for (let A = 2; A <= 210; A += 2) { const z = stableZ(A), n = A - z; A === 2 ? x.moveTo(nx(n), zy(z)) : x.lineTo(nx(n), zy(z)); }
    x.strokeStyle = 'rgba(185,195,217,.35)'; x.lineWidth = 9; x.lineCap = 'round'; x.stroke(); x.lineWidth = 1;
    x.fillStyle = 'rgba(150,160,192,.7)'; x.fillText('valley of stability', nx(52), zy(48) - 12);
    // N=Z guide
    x.setLineDash([2, 5]); x.strokeStyle = 'rgba(150,164,214,.15)';
    x.beginPath(); x.moveTo(nx(0), zy(0)); x.lineTo(nx(92), zy(92)); x.stroke(); x.setLineDash([]);
    // landmarks
    mark(30, 26, '#7fd4ff', 'Fe-56 (seed)');
    mark(117, 78, '#e9edf7', 'Pt');
    mark(118, 79, '#ffcf7a', 'Au');
    mark(126, 82, 'rgba(150,160,192,.8)', 'Pb');
    // trail
    if (trail.length > 1) {
      x.beginPath();
      trail.forEach((p, i) => { const X = nx(p.N), Y = zy(p.Z); i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.strokeStyle = mode === 's' ? 'rgba(127,212,255,.75)' : 'rgba(255,109,146,.8)'; x.lineWidth = 2; x.stroke(); x.lineWidth = 1;
    }
    if (pos) {
      const X = nx(pos.N), Y = zy(pos.Z);
      x.beginPath(); x.arc(X, Y, 5 + Math.sin(anim * 6) * 1.2, 0, TAU);
      x.fillStyle = mode === 's' ? '#7fd4ff' : '#ff6d92'; x.fill();
    }
    if (sparkle > 0) {
      sparkle = Math.max(0, sparkle - 0.008);
      const X = nx(117.5), Y = zy(78.5), k = Math.sin(Math.min((1 - sparkle) * 2.2, 1) * Math.PI);
      x.strokeStyle = `rgba(255,207,122,${0.9 * k})`;
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + anim; x.beginPath(); x.moveTo(X + Math.cos(a) * 8, Y + Math.sin(a) * 8); x.lineTo(X + Math.cos(a) * (16 + 14 * (1 - sparkle)), Y + Math.sin(a) * (16 + 14 * (1 - sparkle))); x.stroke(); }
    }
    function mark(n, z, col, lab) {
      const X = nx(n), Y = zy(z);
      x.beginPath(); x.arc(X, Y, 4, 0, TAU); x.fillStyle = col; x.fill();
      x.fillStyle = col; x.fillText(lab, X + 8, Y + 4);
    }
  }
  function loop() {
    if (!running) return;
    if (pos && !done) {
      stepAcc += mode === 's' ? 0.9 : 1.6;
      while (stepAcc >= 1) { step(); stepAcc -= 1; }
    }
    draw();
    requestAnimationFrame(loop);
  }
  btnS.addEventListener('click', () => start('s'));
  btnR.addEventListener('click', () => start('r'));
  btnReset.addEventListener('click', () => { reset(); draw(); });
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else draw(); } }, () => { running = false; });
})();

/* ================================================================
   FIG 5 — the neutron-star merger + the chirp
   ================================================================ */
(function () {
  const c = document.getElementById('merger'), x = c.getContext('2d');
  const read = document.getElementById('mergeRead'), tag = document.getElementById('mergeTag');
  const btn = document.getElementById('btnMerge'), btnChirp = document.getElementById('btnChirp'), btnReset = document.getElementById('btnMergeReset');
  let W, H, running = false, t = -1, ejecta = [], wave = [], merged = false, anim = 0;
  const DUR = 9;      // seconds of inspiral
  function size() { ({ W, H } = fitCanvas(c, x, 340)); }
  function reset() { t = -1; merged = false; ejecta = []; wave = []; tag.textContent = 'ready'; read.innerHTML = 'The trace below the stars is the <b>gravitational waveform</b> — the actual signal detectors hear, rising in pitch as the orbit tightens: the <b>chirp</b>.'; }
  function run() { reset(); t = 0; tag.textContent = 'inspiral'; }
  function frame(dt) {
    anim += dt;
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H * 0.40;
    const waveY = H - 52;
    // faint background stars
    x.fillStyle = 'rgba(223,231,245,.4)';
    for (let i = 0; i < 40; i++) x.fillRect(hash(i * 3.3) * W, hash(i * 8.8) * (H - 90), 1, 1);
    if (t >= 0 && !merged) {
      t += dt;
      const f = clamp(t / DUR, 0, 1);
      const sep = lerp(Math.min(W * 0.32, 130), 9, Math.pow(f, 1.6));   // shrinking separation
      const om = 1.6 / Math.pow(sep / 40, 1.5);                          // Kepler-ish angular speed
      const th = (anim * om) % TAU;
      // waveform sample
      wave.push({ a: (12 / sep) * 16, p: th * 2 });
      if (wave.length > 260) wave.shift();
      for (const [sgn, col] of [[1, '#7fd4ff'], [-1, '#e9edf7']]) {
        const sx = cx + Math.cos(th) * sep * 0.5 * sgn, sy = cy + Math.sin(th) * sep * 0.5 * sgn * 0.5;
        // tidal stretch near the end
        const stretch = 1 + clamp((40 - sep) / 60, 0, 0.5);
        x.save(); x.translate(sx, sy); x.rotate(th + (sgn < 0 ? Math.PI : 0));
        const g = x.createRadialGradient(0, 0, 1, 0, 0, 13);
        g.addColorStop(0, '#fff'); g.addColorStop(0.5, col); g.addColorStop(1, 'rgba(127,212,255,0)');
        x.beginPath(); x.ellipse(0, 0, 9 * stretch, 9 / Math.sqrt(stretch), 0, 0, TAU); x.fillStyle = g; x.fill();
        x.restore();
      }
      // spacetime ripple rings
      for (let i = 0; i < 4; i++) {
        const rr = ((anim * 60 * (0.4 + f)) + i * 55) % 220;
        x.beginPath(); x.arc(cx, cy, 20 + rr, 0, TAU);
        x.strokeStyle = `rgba(165,140,255,${0.14 * (1 - rr / 220)})`; x.stroke();
      }
      if (f >= 1) {
        merged = true; tag.textContent = 'merger + kilonova';
        read.innerHTML = '<b>Contact.</b> In milliseconds, tidal forces shred the stars’ surfaces; ~16,000 Earth-masses of neutron-rich matter is flung out at up to a third of light-speed. Inside it the r-process saturates — the cloud you’re watching glow is <b>freshly minted gold, platinum and their kin</b>, heated by their own radioactivity.';
        for (let i = 0; i < 240; i++) {
          const a = Math.random() * TAU, v = 30 + Math.random() * 130;
          ejecta.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, life: 1, gold: Math.random() < 0.5 });
        }
      }
    }
    if (merged) {
      // central remnant flash
      const age = Math.min((ejecta[0] ? 1 - ejecta[0].life : 0) * 2.4, 1);
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, 60);
      g.addColorStop(0, `rgba(255,240,210,${0.9 * (1 - age)})`); g.addColorStop(1, 'rgba(255,140,120,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 60, 0, TAU); x.fill();
      let alive = false;
      for (const p of ejecta) {
        if (p.life <= 0) continue; alive = true;
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.995; p.vy *= 0.995; p.life -= dt * 0.10;
        const a = clamp(p.life, 0, 1);
        x.beginPath(); x.arc(p.x, p.y, 1.6, 0, TAU);
        // kilonova reddening: gold → deep red as it expands and cools
        x.fillStyle = p.gold ? `rgba(255,${Math.round(207 * a + 90 * (1 - a))},${Math.round(122 * a)},${0.5 + 0.5 * a})`
          : `rgba(233,237,247,${0.4 + 0.6 * a})`;
        x.fill();
      }
      if (!alive && tag.textContent !== 'done') { tag.textContent = 'done'; }
    }
    if (t < 0 && !merged) {
      // idle: two quiet stars
      for (const [sgn, col] of [[1, '#7fd4ff'], [-1, '#e9edf7']]) {
        x.beginPath(); x.arc(cx + 70 * sgn, cy, 8, 0, TAU); x.fillStyle = col; x.fill();
      }
      x.font = '11px ui-monospace,monospace'; x.fillStyle = 'rgba(150,160,192,.8)';
      x.textAlign = 'center'; x.fillText('two neutron stars · press “Run the merger”', cx, cy + 44); x.textAlign = 'left';
    }
    // waveform strip
    x.strokeStyle = 'rgba(150,164,214,.2)'; x.beginPath(); x.moveTo(16, waveY); x.lineTo(W - 16, waveY); x.stroke();
    if (wave.length > 1) {
      x.beginPath();
      wave.forEach((w0, i) => { const X = 16 + i / 260 * (W - 32), Y = waveY + Math.sin(w0.p) * Math.min(w0.a, 24); i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
      x.strokeStyle = 'rgba(255,207,122,.85)'; x.stroke();
    }
    x.font = '10px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.9)';
    x.fillText('h(t) — the gravitational-wave strain (schematic)', 16, waveY + 26);
  }
  let last = 0;
  function loop(ts) {
    if (!running) return;
    const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts;
    frame(dt);
    requestAnimationFrame(loop);
  }
  // the audible chirp — a rising sweep, like GW170817 made audible
  function chirp() {
    try {
      const A = new (window.AudioContext || window.webkitAudioContext)();
      const o = A.createOscillator(), g = A.createGain();
      o.type = 'sine';
      const t0 = A.currentTime;
      o.frequency.setValueAtTime(35, t0);
      o.frequency.exponentialRampToValueAtTime(420, t0 + 1.5);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.24, t0 + 1.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.62);
      o.connect(g); g.connect(A.destination);
      o.start(t0); o.stop(t0 + 1.7);
      o.onended = () => A.close();
    } catch (e) { /* no audio — fine */ }
  }
  btn.addEventListener('click', run);
  btnChirp.addEventListener('click', chirp);
  btnReset.addEventListener('click', reset);
  size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) { frame(0.016); }
})();

/* ================================================================
   FIG 6 — the galactic drift, on a Gyr slider
   ================================================================ */
(function () {
  const c = document.getElementById('drift'), x = c.getContext('2d');
  const slider = document.getElementById('driftSlider'), yEl = document.getElementById('driftYears'), tag = document.getElementById('driftTag');
  let W, H, running = false, anim = 0;
  const STARS = 900, ASH = 380;
  let gal = [], ash = [];
  function build() {
    gal = Array.from({ length: STARS }, (_, i) => {
      const arm = i % 2, r = 0.08 + Math.pow(hash(i * 1.7), 0.8) * 0.92;
      const th = Math.log(r * 10 + 1) * 2.6 + arm * Math.PI + (hash(i * 4.1) - 0.5) * (0.5 + r);
      return { r, th, w: hash(i * 6.3), warm: hash(i * 8.9) < 0.3 };
    });
    ash = Array.from({ length: ASH }, (_, i) => ({
      r0: 0.55 + (hash(i * 2.1) - 0.5) * 0.05,
      dr: (hash(i * 3.9) - 0.5), da: (hash(i * 7.7) - 0.5), rand: hash(i * 5.5)
    }));
  }
  function size() { ({ W, H } = fitCanvas(c, x, 320)); draw(); }
  const omega = r => 0.9 / (r + 0.12);      // differential rotation → shear
  function draw() {
    anim += 0.016;
    const T = slider.value / 100;           // 0..10 Gyr
    yEl.textContent = T.toFixed(1) + ' Gyr';
    tag.textContent = '+' + T.toFixed(1) + ' Gyr';
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.46;
    // the galaxy, gently rotating
    for (const s of gal) {
      const th = s.th + omega(s.r) * (anim * 0.02 + T * 0.8);
      const X = cx + Math.cos(th) * s.r * R, Y = cy + Math.sin(th) * s.r * R * 0.62;
      x.beginPath(); x.arc(X, Y, s.w * 1.1 + 0.3, 0, TAU);
      x.fillStyle = s.warm ? 'rgba(255,207,122,.5)' : 'rgba(160,190,235,.5)'; x.fill();
    }
    // galactic core glow
    const g = x.createRadialGradient(cx, cy, 2, cx, cy, R * 0.4);
    g.addColorStop(0, 'rgba(255,230,190,.35)'); g.addColorStop(1, 'rgba(255,230,190,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, R * 0.4, R * 0.26, 0, 0, TAU); x.fill();
    // the merger ashes: start as a point, shear into an arc, dilute into a ring
    const spreadR = 0.012 + T * 0.02;                    // radial diffusion
    const th0 = 0.6;
    for (const a of ash) {
      const r = clamp(a.r0 + a.dr * spreadR, 0.1, 1);
      const th = th0 + omega(r) * (anim * 0.02 + T * 0.8) + a.da * T * 0.05;
      const X = cx + Math.cos(th) * r * R, Y = cy + Math.sin(th) * r * R * 0.62;
      const alpha = clamp(0.95 - T * 0.06, 0.25, 1);
      x.beginPath(); x.arc(X, Y, T < 0.2 ? 1.8 : 1.2, 0, TAU);
      x.fillStyle = `rgba(255,207,122,${alpha})`; x.fill();
    }
    if (T < 0.15) { // the fresh merger flare
      const th = th0 + omega(0.55) * (anim * 0.02);
      const X = cx + Math.cos(th) * 0.55 * R, Y = cy + Math.sin(th) * 0.55 * R * 0.62;
      const gg = x.createRadialGradient(X, Y, 0, X, Y, 26);
      gg.addColorStop(0, 'rgba(255,235,200,.9)'); gg.addColorStop(1, 'rgba(255,140,120,0)');
      x.fillStyle = gg; x.beginPath(); x.arc(X, Y, 26, 0, TAU); x.fill();
    }
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.9)';
    x.fillText(T < 0.2 ? 'a kilonova, one afternoon, somewhere in a spiral arm'
      : T < 3 ? 'differential rotation shears the debris into a streak…'
        : T < 7 ? '…then winds it around the whole disc…'
          : '…until “somewhere” is everywhere. Ready for a new sun.', 12, H - 12);
  }
  slider.addEventListener('input', draw);
  function loop() { if (!running) return; draw(); requestAnimationFrame(loop); }
  build(); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running && !REDUCED) { running = true; requestAnimationFrame(loop); } }, () => { running = false; });
})();
