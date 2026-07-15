"use strict";
/* The Star-Forged Ring — part 2: the ground.
   Accretion disc, iron catastrophe + late veneer, the Bushveld reef,
   the ore funnel, and the ring finale. Relies on helpers in sky.js. */

/* ================================================================
   FIG 7 — the protoplanetary disc (self-running loop)
   ================================================================ */
(function () {
  const c = document.getElementById('disc'), x = c.getContext('2d');
  let W, H, running = false, T = 0;
  const N = 420;
  let dust = [], planets = [];
  function build() {
    dust = Array.from({ length: N }, (_, i) => ({
      r: 0.16 + Math.pow(hash(i * 1.9), 0.85) * 0.8,
      th: hash(i * 3.3) * TAU,
      z: (hash(i * 6.1) - 0.5) * 0.05,
      pt: hash(i * 8.3) < 0.05,          // a few grains are "ours"
      gone: 0
    }));
    planets = [0.3, 0.48, 0.66, 0.85].map((r, i) => ({ r, th: hash(i * 9.7) * TAU, m: 1.6 }));
    T = 0;
  }
  function size() { ({ W, H } = fitCanvas(c, x, 320)); }
  const omega = r => 0.55 / Math.pow(r, 1.5);
  function frame(dt) {
    T += dt;
    if (T > 26) build();                 // loop the movie
    const grow = clamp((T - 4) / 16, 0, 1);   // accretion era
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W / 2.2, H / 2.05);
    // the young sun
    const sg = x.createRadialGradient(cx, cy, 0, cx, cy, 40);
    sg.addColorStop(0, 'rgba(255,240,205,.95)'); sg.addColorStop(0.35, 'rgba(255,207,122,.55)'); sg.addColorStop(1, 'rgba(255,140,90,0)');
    x.fillStyle = sg; x.beginPath(); x.arc(cx, cy, 40, 0, TAU); x.fill();
    // dust
    for (const d of dust) {
      if (d.gone >= 1) continue;
      d.th += omega(d.r) * dt;
      // capture by a planet whose lane we share
      if (grow > 0) {
        for (const p of planets) {
          if (Math.abs(d.r - p.r) < 0.035 * p.m && d.gone === 0) {
            const dth = Math.atan2(Math.sin(d.th - p.th), Math.cos(d.th - p.th));
            if (Math.abs(dth) < 0.3) { d.gone = 0.01; p.m = Math.min(p.m + 0.012, 4.2); }
          }
        }
      }
      if (d.gone > 0) { d.gone = Math.min(d.gone + dt * 2, 1); }
      const X = cx + Math.cos(d.th) * d.r * R, Y = cy + Math.sin(d.th) * d.r * R * 0.5 + d.z * R;
      const a = (1 - d.gone) * 0.75;
      x.beginPath(); x.arc(X, Y, d.pt ? 1.9 : 1.1, 0, TAU);
      x.fillStyle = d.pt ? `rgba(233,237,247,${a})` : `rgba(190,170,150,${a * 0.8})`;
      x.fill();
    }
    // planets
    for (const p of planets) {
      p.th += omega(p.r) * dt;
      const X = cx + Math.cos(p.th) * p.r * R, Y = cy + Math.sin(p.th) * p.r * R * 0.5;
      x.beginPath(); x.arc(X, Y, p.m, 0, TAU);
      x.fillStyle = 'rgba(210,220,240,.95)'; x.fill();
      // cleared-lane hint
      if (p.m > 2.4) {
        x.beginPath(); x.ellipse(cx, cy, p.r * R, p.r * R * 0.5, 0, 0, TAU);
        x.strokeStyle = 'rgba(150,164,214,.08)'; x.stroke();
      }
    }
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.9)';
    x.fillText(T < 4 ? 'the solar nebula — dust (your platinum riding it, bright) orbits a newborn sun'
      : T < 14 ? 'planetesimals sweep their lanes clean, snowballing as they go'
        : 'a planetary system — total elapsed time: a few million years', 12, H - 12);
  }
  let last = 0;
  function loop(ts) { if (!running) return; const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts; frame(dt); requestAnimationFrame(loop); }
  build(); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) frame(0.016);
})();

/* ================================================================
   FIG 8 — the iron catastrophe & the late veneer
   ================================================================ */
(function () {
  const c = document.getElementById('earthx'), x = c.getContext('2d');
  const read = document.getElementById('earthRead'), tag = document.getElementById('earthTag');
  const btnMelt = document.getElementById('btnMelt'), btnVeneer = document.getElementById('btnVeneer'), btnReset = document.getElementById('btnEarthReset');
  let W, H, running = false, anim = 0;
  // stage: 0 cold mix · 1 melting/sinking · 2 differentiated · 3 veneer raining · 4 done
  let stage = 0, coreR = 0, flecks = [], irons = [], meteors = [], veneerCount = 0;
  const FLECKS = 130;
  function build() {
    stage = 0; coreR = 0; meteors = []; veneerCount = 0;
    flecks = Array.from({ length: FLECKS }, (_, i) => {
      const a = hash(i * 3.1) * TAU, r = Math.sqrt(hash(i * 7.7)) * 0.92;
      return { a, r, state: 0 };          // 0 in rock · 1 sinking · 2 in core · 3 veneer
    });
    irons = Array.from({ length: 46 }, (_, i) => ({
      a: hash(i * 5.3) * TAU, r: 0.25 + hash(i * 2.9) * 0.65, v: 0, sz: 3 + hash(i * 8.1) * 5
    }));
    setUI();
  }
  function setUI() {
    btnMelt.disabled = stage !== 0;
    btnVeneer.disabled = stage !== 2;
    tag.textContent = ['stage 1 of 3 · a homogeneous Earth', 'the iron catastrophe…', 'stage 2 of 3 · differentiated', 'the late veneer…', 'stage 3 of 3 · restocked'][stage];
  }
  function size() { ({ W, H } = fitCanvas(c, x, 340)); }
  function frame(dt) {
    anim += dt;
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2, R = Math.min(W * 0.36, H * 0.42);
    // planet body
    const g = x.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
    if (stage === 1) { g.addColorStop(0, '#7a2f2f'); g.addColorStop(0.7, '#5a1f28'); g.addColorStop(1, '#38141f'); }
    else { g.addColorStop(0, '#3d4258'); g.addColorStop(0.75, '#2b2f42'); g.addColorStop(1, '#1b1e2e'); }
    x.beginPath(); x.arc(cx, cy, R, 0, TAU); x.fillStyle = g; x.fill();
    x.strokeStyle = 'rgba(150,164,214,.3)'; x.stroke();
    // magma shimmer while molten
    if (stage === 1) for (let i = 0; i < 14; i++) {
      const a = hash(i * 4.4) * TAU + anim * 0.15, r = (0.3 + hash(i * 6.6) * 0.6) * R;
      x.beginPath(); x.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 8 + Math.sin(anim * 2 + i) * 3, 0, TAU);
      x.fillStyle = 'rgba(255,109,80,.08)'; x.fill();
    }
    // sinking iron
    if (stage === 1) {
      let allDown = true;
      for (const ir of irons) {
        if (ir.r > coreR / R + 0.02) { ir.r -= dt * (0.10 + ir.sz * 0.012); allDown = false; }
        const X = cx + Math.cos(ir.a) * ir.r * R, Y = cy + Math.sin(ir.a) * ir.r * R;
        x.beginPath(); x.arc(X, Y, ir.sz, 0, TAU); x.fillStyle = 'rgba(120,128,148,.85)'; x.fill();
      }
      coreR = Math.min(coreR + dt * R * 0.055, R * 0.52);
      // flecks hitch a ride down
      for (const f of flecks) {
        if (f.state === 0 && Math.random() < dt * 0.55) f.state = 1;
        if (f.state === 1) { f.r -= dt * 0.22; if (f.r * R <= coreR) f.state = 2; }
      }
      if (allDown && coreR >= R * 0.52) {
        stage = 2; setUI();
        const left = flecks.filter(f => f.state === 0).length;
        const pct = left / FLECKS * 100;
        read.innerHTML = `<b>The heist is complete.</b> The iron has built a core — and dissolved the treasure into it on the way down. Precious metal left in reach of any future mine: <b style="color:#ff6d92">${pct < 2 ? 'under 1%' : Math.round(pct) + '%'}</b> of the original. Now press <b>The late veneer</b>.`;
      }
    }
    // the core
    if (coreR > 0) {
      const cg = x.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      cg.addColorStop(0, '#c8cede'); cg.addColorStop(1, '#6e7488');
      x.beginPath(); x.arc(cx, cy, coreR, 0, TAU); x.fillStyle = cg; x.fill();
      // the hoard, locked inside
      for (const f of flecks) if (f.state === 2) {
        const X = cx + Math.cos(f.a + anim * 0.05) * Math.min(f.r, coreR / R * 0.9) * R;
        const Y = cy + Math.sin(f.a + anim * 0.05) * Math.min(f.r, coreR / R * 0.9) * R;
        x.beginPath(); x.arc(X, Y, 1.4, 0, TAU); x.fillStyle = 'rgba(255,207,122,.8)'; x.fill();
      }
    }
    // meteors of the late veneer
    if (stage === 3) {
      if (meteors.length < 3 && Math.random() < dt * 2.2 && veneerCount < 26) {
        const a = Math.random() * TAU;
        meteors.push({ a, d: 1.9, tail: [] });
      }
      for (const m of meteors) {
        m.d -= dt * 1.5;
        const X = cx + Math.cos(m.a) * m.d * R, Y = cy + Math.sin(m.a) * m.d * R;
        m.tail.push([X, Y]); if (m.tail.length > 9) m.tail.shift();
        m.tail.forEach(([tx, ty], i) => {
          x.beginPath(); x.arc(tx, ty, 1 + i * 0.28, 0, TAU);
          x.fillStyle = `rgba(255,190,120,${i / m.tail.length * 0.8})`; x.fill();
        });
        if (m.d <= 1.0) {
          veneerCount++;
          // flash + sprinkle new flecks near the surface
          for (let k = 0; k < 3; k++) flecks.push({ a: m.a + (Math.random() - 0.5) * 0.5, r: 0.72 + Math.random() * 0.2, state: 3 });
          m.dead = true;
        }
      }
      meteors = meteors.filter(m => !m.dead);
      if (veneerCount >= 26 && !meteors.length) {
        stage = 4; setUI();
        read.innerHTML = '<b>Restocked — from outside.</b> A final half-percent of Earth’s mass arrived after the core had closed, and its platinum and gold stayed marooned in the mantle. Practically everything a mine will ever touch — including your ring — came in this last delivery.';
      }
    }
    // flecks in the mantle/crust
    for (const f of flecks) {
      if (f.state === 1) { /* drawn below as falling */ }
      if (f.state === 0 || f.state === 1 || f.state === 3) {
        const rr = clamp(f.r, 0, 0.94);
        const X = cx + Math.cos(f.a) * rr * R, Y = cy + Math.sin(f.a) * rr * R;
        x.beginPath(); x.arc(X, Y, f.state === 3 ? 1.7 : 1.4, 0, TAU);
        x.fillStyle = f.state === 3 ? 'rgba(255,207,122,.95)' : 'rgba(255,207,122,.75)';
        x.fill();
      }
    }
    // labels
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.9)';
    x.fillText(stage === 0 ? 'the newborn Earth — treasure evenly stirred through it'
      : stage === 1 ? 'molten: iron rain falling coreward, treasure dissolving into it'
        : stage === 2 ? '>99% of the platinum & gold: locked in the core, 2,900 km down'
          : stage === 3 ? 'the last bombardment — too late to sink'
            : 'mantle & crust: restocked by meteorites. That’s the minable Earth.', 12, H - 12);
  }
  btnMelt.addEventListener('click', () => {
    if (stage !== 0) return; stage = 1; setUI();
    read.innerHTML = '<b>The iron catastrophe.</b> The planet melts; a third of its mass rains toward the centre as iron — and platinum and gold, iron-lovers both, dissolve into the droplets and ride them down…';
  });
  btnVeneer.addEventListener('click', () => {
    if (stage !== 2) return; stage = 3; setUI();
    read.innerHTML = '<b>The late veneer.</b> For a hundred million years the leftover planetesimals keep falling — onto a planet whose core has already closed for business…';
  });
  btnReset.addEventListener('click', () => { build(); read.innerHTML = 'A newborn Earth, precious metals (<b class="goldc">gold flecks</b>) stirred evenly through it. Press <b>Melt</b>.'; });
  let last = 0;
  function loop(ts) { if (!running) return; const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts; frame(dt); requestAnimationFrame(loop); }
  build(); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) frame(0.016);
})();

/* ================================================================
   FIG 9 — the Bushveld magma chamber & the Merensky Reef
   ================================================================ */
(function () {
  const c = document.getElementById('reef'), x = c.getContext('2d');
  const read = document.getElementById('reefRead'), tag = document.getElementById('reefTag');
  const btn = document.getElementById('btnSulf'), btnReset = document.getElementById('btnReefReset');
  let W, H, running = false, anim = 0;
  let atoms = [], drops = [], saturated = false, reefLoad = 0, collected = 0;
  const ATOMS = 150;
  function build() {
    saturated = false; reefLoad = 0; collected = 0; drops = [];
    atoms = Array.from({ length: ATOMS }, (_, i) => ({
      x: hash(i * 3.7), y: 0.08 + hash(i * 5.9) * 0.68,
      ph: hash(i * 2.1) * TAU, taken: false
    }));
    tag.textContent = 'undersaturated';
  }
  function size() { ({ W, H } = fitCanvas(c, x, 330)); }
  function frame(dt) {
    anim += dt;
    x.clearRect(0, 0, W, H);
    const floorY = H - 46;
    // chamber walls & country rock
    x.fillStyle = '#141625'; x.fillRect(0, floorY, W, H - floorY);
    x.fillStyle = '#10121e'; x.fillRect(0, 0, W, 18);
    // the melt
    const mg = x.createLinearGradient(0, 18, 0, floorY);
    mg.addColorStop(0, 'rgba(120,40,40,.55)'); mg.addColorStop(0.6, 'rgba(90,28,38,.6)'); mg.addColorStop(1, 'rgba(60,20,32,.7)');
    x.fillStyle = mg; x.fillRect(0, 18, W, floorY - 18);
    // convection shimmer
    for (let i = 0; i < 10; i++) {
      const a = anim * 0.3 + i;
      x.beginPath(); x.ellipse(W * (0.1 + i * 0.09), 40 + Math.sin(a) * 14 + i * 18 % (floorY - 70), 26, 7, 0, 0, TAU);
      x.fillStyle = 'rgba(255,120,80,.045)'; x.fill();
    }
    // dissolved platinum atoms
    for (const a of atoms) {
      if (a.taken) continue;
      a.x += Math.sin(anim * 0.7 + a.ph) * 0.0006; a.y += Math.cos(anim * 0.5 + a.ph * 2) * 0.0006;
      a.x = (a.x + 1) % 1;
      const X = a.x * W, Y = 18 + a.y * (floorY - 40);
      x.beginPath(); x.arc(X, Y, 1.6, 0, TAU);
      x.fillStyle = 'rgba(233,237,247,.9)'; x.fill();
    }
    // sulfide droplets
    if (saturated) {
      if (drops.length < 9 && Math.random() < dt * 3 && collected < ATOMS - 4) {
        drops.push({ x: 0.08 + Math.random() * 0.84, y: 0.02, n: 0 });
      }
      for (const d of drops) {
        d.y += dt * 0.12;
        const X = d.x * W, Y = 18 + d.y * (floorY - 40);
        // scavenge nearby atoms — D(sulfide/silicate) ≈ 10⁴–10⁶
        for (const a of atoms) {
          if (a.taken) continue;
          const ax = a.x * W, ay = 18 + a.y * (floorY - 40);
          const dd = Math.hypot(ax - X, ay - Y);
          if (dd < 34) {
            a.x += (X / W - a.x) * dt * 14; a.y += ((Y - 18) / (floorY - 40) - a.y) * dt * 14;
            if (dd < 7) { a.taken = true; d.n++; collected++; }
          }
        }
        const rr = 4.5 + d.n * 0.35;
        x.beginPath(); x.arc(X, Y, rr, 0, TAU);
        x.fillStyle = 'rgba(40,36,50,.95)'; x.fill();
        x.strokeStyle = `rgba(233,237,247,${clamp(d.n / 14, 0.1, 0.9)})`; x.stroke();
        if (d.y >= 0.97) { reefLoad += d.n; d.dead = true; }
      }
      drops = drops.filter(d => !d.dead);
      const pct = Math.round(collected / ATOMS * 100);
      read.innerHTML = pct < 95
        ? `Sulfide droplets rain through the chamber, scavenging platinum as they fall. Collected so far: <b>${pct}%</b> — concentration on the floor: <b style="color:#e9edf7">×${(1 + reefLoad * 700).toLocaleString()}</b> over the melt.`
        : `<b>The reef is laid.</b> A metre of dark rock now holds what a mountain of magma once carried — 5–10 g/t, <b>ten-thousand-fold enrichment</b>. It will wait two billion years to be found.`;
      if (pct >= 95) tag.textContent = 'the Merensky Reef';
    }
    // the reef seam building on the floor
    if (reefLoad > 0) {
      const hgt = clamp(reefLoad / ATOMS * 10, 1.5, 9);
      const rg = x.createLinearGradient(0, floorY - hgt, 0, floorY);
      rg.addColorStop(0, 'rgba(233,237,247,.95)'); rg.addColorStop(1, 'rgba(150,150,170,.8)');
      x.fillStyle = rg; x.fillRect(0, floorY - hgt, W, hgt);
      // glints
      for (let i = 0; i < 20; i++) {
        if (hash(i * 7.1 + Math.floor(anim)) > 0.93) {
          x.fillStyle = 'rgba(255,255,255,.9)';
          x.fillRect(hash(i * 3.3) * W, floorY - hgt / 2, 1.6, 1.6);
        }
      }
    }
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.95)';
    x.fillText('a slice of the Bushveld chamber — kilometres of magma above a slowly freezing floor', 12, 13);
    x.fillStyle = 'rgba(150,160,192,.8)';
    x.fillText('chamber floor → the future Merensky Reef', 12, H - 16);
  }
  btn.addEventListener('click', () => {
    if (saturated) return; saturated = true; tag.textContent = 'sulfide rain';
    read.innerHTML = 'The melt crosses <b>sulfur saturation</b> — iron-sulfide droplets condense like dew and begin to fall…';
  });
  btnReset.addEventListener('click', () => { build(); read.innerHTML = 'Platinum atoms (<b class="plat">bright</b>) drift dissolved in the silicate melt — five parts per billion, unminable for ever.'; });
  let last = 0;
  function loop(ts) { if (!running) return; const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts; frame(dt); requestAnimationFrame(loop); }
  build(); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) frame(0.016);
})();

/* ================================================================
   FIG 10 — ten tonnes of rock → one troy ounce
   ================================================================ */
(function () {
  const c = document.getElementById('funnel'), x = c.getContext('2d');
  const read = document.getElementById('funRead'), tag = document.getElementById('funTag');
  const btn = document.getElementById('btnFun'), btnReset = document.getElementById('btnFunReset');
  const stagesEl = document.getElementById('funStages');
  const stages = [
    { name: 'blast & hoist', mass: 10000, unit: '10 t of reef', col: '#5b5f75',
      text: '<b>Blast &amp; hoist.</b> A metre-high slice of two-billion-year-old reef, about ten tonnes of it, rides the shaft to the surface.' },
    { name: 'mill', mass: 10000, unit: '10 t of powder', col: '#6b6f88',
      text: '<b>Crush &amp; mill.</b> The rock is ground finer than flour — every platinum-bearing sulfide grain must be broken free of its prison of silicate.' },
    { name: 'float', mass: 150, unit: '~150 kg concentrate', col: '#8a8fa8',
      text: '<b>Froth flotation.</b> Bubbling reagents float the metal-rich sulfides off as a froth and let 98% of the rock sink away as tailings. The sulfide-droplet trick, re-run by industry.' },
    { name: 'smelt', mass: 15, unit: '~15 kg of matte', col: '#b56a4a',
      text: '<b>Smelt &amp; convert.</b> An electric furnace at ~1,500 °C melts the concentrate to a sulfide matte; blowing air through it burns off iron and sulfur.' },
    { name: 'refine metals', mass: 0.3, unit: '~300 g precious sludge', col: '#c8cede',
      text: '<b>Base-metals refinery.</b> Nickel and copper — the bulk of the matte, saleable in their own right — are dissolved away, leaving a grey sludge in which precious metals are finally the majority.' },
    { name: 'separate', mass: 0.0311, unit: '31.1 g — one troy ounce', col: '#e9edf7',
      text: '<b>Precious-metals refinery.</b> Chlorination, solvent extraction and ion exchange tease apart platinum, palladium, rhodium, ruthenium, iridium, osmium — and the hitch-hiking gold — one by one, to 99.95%. Elapsed time since the blast: <b>about six months.</b>' }
  ];
  let W, H, cur = 0, disp = 10000, running = false, anim = 0;
  function chips() {
    stagesEl.innerHTML = stages.map((s, i) => `<span class="fstage${i <= cur ? ' on' : ''}">${i + 1} · ${s.name}</span>`).join('');
  }
  function size() { ({ W, H } = fitCanvas(c, x, 300)); }
  function frame(dt) {
    anim += dt;
    // ease displayed mass toward the stage mass (log space)
    const target = stages[cur].mass;
    disp = Math.exp(lerp(Math.log(disp), Math.log(target), Math.min(dt * 3, 1)));
    x.clearRect(0, 0, W, H);
    const baseY = H - 58, cx = W / 2;
    // side ∝ cube root of mass; 10 t → big block, 31 g → speck (clamped so it stays visible)
    const side = clamp(Math.pow(disp / 10000, 1 / 3) * Math.min(W * 0.42, 180), 6, Math.min(W * 0.42, 180));
    // the block, drawn as a simple iso cube
    const h2 = side * 0.5, d2 = side * 0.26;
    const col = stages[cur].col;
    x.save(); x.translate(cx, baseY);
    // top face
    x.beginPath(); x.moveTo(0, -side - d2); x.lineTo(h2, -side); x.lineTo(0, -side + d2); x.lineTo(-h2, -side); x.closePath();
    x.fillStyle = shade(col, 1.25); x.fill();
    // left + right faces
    x.beginPath(); x.moveTo(-h2, -side); x.lineTo(0, -side + d2); x.lineTo(0, 0); x.lineTo(-h2, -d2); x.closePath();
    x.fillStyle = shade(col, 0.8); x.fill();
    x.beginPath(); x.moveTo(h2, -side); x.lineTo(0, -side + d2); x.lineTo(0, 0); x.lineTo(h2, -d2); x.closePath();
    x.fillStyle = shade(col, 1.0); x.fill();
    // sparkle on the final stage
    if (cur === stages.length - 1) {
      const k = 0.5 + 0.5 * Math.sin(anim * 3);
      x.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
      x.beginPath(); x.moveTo(0, -side - d2 - 14); x.lineTo(0, -side - d2 - 4); x.moveTo(-6, -side - d2 - 9); x.lineTo(4 + 2, -side - d2 - 9); x.stroke();
    }
    x.restore();
    // mass label
    x.font = '600 15px ui-monospace,monospace'; x.textAlign = 'center';
    x.fillStyle = '#fff'; x.fillText(stages[cur].unit, cx, baseY + 28);
    x.font = '10.5px ui-monospace,monospace'; x.fillStyle = 'rgba(109,119,160,.95)';
    x.fillText(fmtMass(disp), cx, baseY + 46);
    x.textAlign = 'left';
    // scale silhouette: a person, for the first stages
    x.strokeStyle = 'rgba(150,160,192,.5)';
    const px = cx + Math.min(W * 0.42, 180) / 2 + 40, py = baseY;
    x.beginPath(); x.arc(px, py - 30, 4, 0, TAU); x.moveTo(px, py - 26); x.lineTo(px, py - 12);
    x.moveTo(px - 5, py); x.lineTo(px, py - 12); x.lineTo(px + 5, py);
    x.moveTo(px - 5, py - 21); x.lineTo(px + 5, py - 21); x.stroke();
  }
  function fmtMass(kg) {
    if (kg >= 1000) return (kg / 1000).toFixed(1) + ' tonnes';
    if (kg >= 1) return kg.toFixed(0) + ' kg';
    return (kg * 1000).toFixed(1) + ' g';
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(Math.round(((n >> 16) & 255) * k), 0, 255), g = clamp(Math.round(((n >> 8) & 255) * k), 0, 255), b = clamp(Math.round((n & 255) * k), 0, 255);
    return `rgb(${r},${g},${b})`;
  }
  function setStage(i) {
    cur = clamp(i, 0, stages.length - 1);
    read.innerHTML = stages[cur].text;
    tag.textContent = `stage ${cur + 1} of ${stages.length}`;
    btn.disabled = cur === stages.length - 1;
    chips();
  }
  btn.addEventListener('click', () => setStage(cur + 1));
  btnReset.addEventListener('click', () => { disp = 10000; setStage(0); });
  let last = 0;
  function loop(ts) { if (!running) return; const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts; frame(dt); requestAnimationFrame(loop); }
  chips(); setStage(0); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) frame(0.016);
})();

/* ================================================================
   FIG 11 — the ring, itemised
   ================================================================ */
(function () {
  const c = document.getElementById('ringfig'), x = c.getContext('2d');
  const slider = document.getElementById('ringMass'), massEl = document.getElementById('ringMassV'), atomsEl = document.getElementById('ringAtoms');
  const iso = [
    ['isoA', 33.8], ['isoB', 32.9], ['isoC', 25.2], ['isoD', 8.1]
  ];
  let W, H, running = false, anim = 0, sparks = [];
  function size() { ({ W, H } = fitCanvas(c, x, 240)); }
  function frame(dt) {
    anim += dt;
    x.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2 + 8, Rx = Math.min(W * 0.22, 92), Ry = Rx * 0.42, th = Rx * 0.16;
    // band: outer & inner ellipse with metallic sheen driven by a moving light
    const sweep = (anim * 0.35) % 2 - 0.5;
    for (let i = 0; i < 44; i++) {
      const a = i / 44 * TAU;
      const lx = Math.cos(a), shine = Math.exp(-Math.pow((lx - Math.sin(sweep * Math.PI)) * 2.2, 2));
      const base = 150 + 70 * Math.max(Math.sin(a + 0.6), 0) + 90 * shine;
      x.strokeStyle = `rgb(${Math.round(base)},${Math.round(base * 1.02)},${Math.round(Math.min(base * 1.1, 255))})`;
      x.lineWidth = th;
      x.beginPath();
      x.ellipse(cx, cy, Rx, Ry + Rx * 0.5, 0, a, a + TAU / 44 + 0.02);
      x.stroke();
    }
    x.lineWidth = 1;
    // occasional sparkle
    if (Math.random() < dt * 1.4 && sparks.length < 3) {
      const a = Math.random() * TAU;
      sparks.push({ x: cx + Math.cos(a) * Rx, y: cy + Math.sin(a) * (Ry + Rx * 0.5), l: 1 });
    }
    for (const s of sparks) {
      s.l -= dt * 1.6;
      const k = Math.sin(clamp(s.l, 0, 1) * Math.PI), r = 7 * k;
      x.strokeStyle = `rgba(255,255,255,${0.9 * k})`;
      x.beginPath(); x.moveTo(s.x - r, s.y); x.lineTo(s.x + r, s.y); x.moveTo(s.x, s.y - r); x.lineTo(s.x, s.y + r); x.stroke();
    }
    sparks = sparks.filter(s => s.l > 0);
    x.font = '10.5px ui-monospace,monospace'; x.textAlign = 'center';
    x.fillStyle = 'rgba(109,119,160,.95)';
    x.fillText('Pt 950 · forged 13.8 billion years, finished by hand', cx, H - 12);
    x.textAlign = 'left';
  }
  function update() {
    const grams = slider.value / 10;
    massEl.textContent = grams.toFixed(1) + ' g';
    const atoms = grams * 0.95 / 195.084 * 6.02214e23;
    atomsEl.firstChild.textContent = Math.round(atoms / 1e18).toLocaleString('en-GB') + ',000,000,000,000,000,000';
    // isotope bars (widths relative to the biggest slice)
    iso.forEach(([id, pct]) => {
      document.getElementById(id).style.width = (pct / 33.8 * 100) + '%';
      document.getElementById(id + 'v').textContent = pct + '%';
    });
  }
  slider.addEventListener('input', update);
  let last = 0;
  function loop(ts) { if (!running) return; const dt = Math.min((ts - last) / 1000 || 0.016, 0.05); last = ts; frame(dt); requestAnimationFrame(loop); }
  update(); size(); addEventListener('resize', size);
  whenVisible(c, () => { if (!running) { running = true; if (!REDUCED) requestAnimationFrame(loop); else { frame(0.016); running = false; } } }, () => { running = false; });
  if (REDUCED) frame(0.016);
})();
