/* Electricity — the redstone works.
   Oscilloscope, potential divider, EMF and internal resistance, the RC circuit,
   band structure and the p-n junction. */
(function () {
  "use strict";
  const HP = window.HP;
  const $ = (id) => document.getElementById(id);
  const F = HP.fmt;
  function mount(id, fn) { const box = $(id); if (!box) return; try { fn(box); } catch (err) { console.error(id, err); } }
  function canvasIn(box, cls, label) { const cv = HP.el("canvas", { class: "sim" + (cls ? " " + cls : ""), role: "img", "aria-label": label || "" }); box.append(cv); return cv; }
  const readouts = (box, items) => {
    const wrap = HP.el("div", { class: "readouts", "aria-live": "polite" }); const map = {};
    items.forEach(([k, label]) => { const b = HP.el("b"); map[k] = b; wrap.append(HP.el("div", null, b, HP.el("span", { html: label }))); });
    box.append(wrap); return map;
  };
  const px = (ctx, x, y, w, h, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  /* draw a straight "redstone" wire, optionally with moving charge dots */
  function wire(ctx, pts, col, t, speed) {
    ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    if (!speed) return;
    // dots spaced 18 px along the path
    let total = 0; const seg = [];
    for (let i = 1; i < pts.length; i++) { const L = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push([total, L, pts[i - 1], pts[i]]); total += L; }
    const off = (t * speed) % 18;
    ctx.fillStyle = "#ffd65a";
    for (let s = off; s < total; s += 18) {
      const sg = seg.find(([a, L]) => s >= a && s <= a + L); if (!sg) continue;
      const f = (s - sg[0]) / sg[1]; const x = sg[2][0] + (sg[3][0] - sg[2][0]) * f, y = sg[2][1] + (sg[3][1] - sg[2][1]) * f;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }
  function resistor(ctx, x, y, w, h, label, C, vertical) {
    ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    if (vertical) { ctx.fillRect(x - h / 2, y - w / 2, h, w); ctx.strokeRect(x - h / 2, y - w / 2, h, w); }
    else { ctx.fillRect(x - w / 2, y - h / 2, w, h); ctx.strokeRect(x - w / 2, y - h / 2, w, h); }
    if (label) HP.label(ctx, label, vertical ? x + h / 2 + 6 : x, vertical ? y : y - h / 2 - 10, { size: 12, bold: true, align: vertical ? "left" : "center" });
  }
  function meter(ctx, x, y, letter, C, reading) {
    ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 13, 0, 7); ctx.fill(); ctx.stroke();
    HP.label(ctx, letter, x, y + 1, { size: 13, bold: true, align: "center", halo: false });
    if (reading) HP.label(ctx, reading, x, y + 25, { size: 11, align: "center", bold: true, col: C.red });
  }

  /* =====================================================================
     1. The oscilloscope
     ===================================================================== */
  mount("w-scope", (box) => {
    const cv = canvasIn(box, "dark", "An oscilloscope screen showing an alternating voltage trace on a grid of divisions. Change the supply and the scope's settings and read off the peak voltage and the period.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sVp = HP.slider(ctr, { label: "Supply: peak voltage", min: 1, max: 12, step: 0.5, value: 6, unit: "V", fmt: (v) => v.toFixed(1), oninput: () => upd() });
    const sF = HP.slider(ctr, { label: "Supply: frequency", min: 10, max: 200, step: 10, value: 50, unit: "Hz", oninput: () => upd() });
    const Y = [0.5, 1, 2, 5], TB = [1, 2, 5, 10];
    const sY = HP.slider(ctr, { label: "Scope Y-gain", min: 0, max: 3, step: 1, value: 2, fmt: (i) => Y[i] + " V/div", oninput: () => upd() });
    const sT = HP.slider(ctr, { label: "Scope timebase", min: 0, max: 3, step: 1, value: 2, fmt: (i) => TB[i] + " ms/div", oninput: () => upd() });
    let reveal = false;
    const R = readouts(box, [["vp", "peak voltage"], ["rms", "r.m.s. voltage V<sub>peak</sub> / √2"], ["T", "period T"], ["f", "frequency f = 1/T"]]);
    const btn = HP.el("button", { type: "button", class: "btn small" }, "Show the answers");
    btn.addEventListener("click", () => { reveal = !reveal; btn.textContent = reveal ? "Hide the answers" : "Show the answers"; upd(); });
    box.append(HP.el("div", { class: "btn-row" }, btn, HP.el("span", { class: "hint", style: "margin:0" }, "Read the trace yourself first: count divisions, then multiply.")));
    function upd() {
      const vp = sVp.value, f = sF.value, T = 1 / f;
      const hide = (s) => (reveal ? s : "?");
      R.vp.textContent = hide(`${(vp / Y[sY.value]).toFixed(1)} div × ${Y[sY.value]} V/div = ${vp.toFixed(1)} V`);
      R.rms.textContent = hide(`${F(vp / Math.SQRT2, 3)} V`);
      R.T.textContent = hide(`${(T * 1000 / TB[sT.value]).toFixed(1)} div × ${TB[sT.value]} ms/div = ${F(T * 1000, 3)} ms`);
      R.f.textContent = hide(`${f} Hz`);
      sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => Math.round(Math.min(w, 600) * 0.6),
      draw(ctx, t, dt, C, S) {
        const w = Math.min(S.w - 20, 600), h = w * 0.8 * 0.6 / 0.8, x0 = (S.w - w) / 2, y0 = (S.h - h) / 2;
        px(ctx, x0 - 6, y0 - 6, w + 12, h + 12, "#2a3550");
        px(ctx, x0, y0, w, h, "#06210f");
        const dx = w / 10, dy = h / 8;
        ctx.strokeStyle = "rgba(120,255,160,.18)"; ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) { ctx.beginPath(); ctx.moveTo(x0 + i * dx, y0); ctx.lineTo(x0 + i * dx, y0 + h); ctx.stroke(); }
        for (let j = 0; j <= 8; j++) { ctx.beginPath(); ctx.moveTo(x0, y0 + j * dy); ctx.lineTo(x0 + w, y0 + j * dy); ctx.stroke(); }
        ctx.strokeStyle = "rgba(120,255,160,.4)"; ctx.beginPath(); ctx.moveTo(x0, y0 + h / 2); ctx.lineTo(x0 + w, y0 + h / 2); ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x0 + w / 2, y0 + h); ctx.stroke();
        for (let i = 0; i <= 50; i++) { const xx = x0 + i * dx / 5; ctx.beginPath(); ctx.moveTo(xx, y0 + h / 2 - 3); ctx.lineTo(xx, y0 + h / 2 + 3); ctx.stroke(); }
        const vp = sVp.value, f = sF.value, vd = Y[sY.value], tb = TB[sT.value] / 1000;
        ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
        ctx.strokeStyle = "#7dff9e"; ctx.lineWidth = 2.5; ctx.shadowColor = "#7dff9e"; ctx.shadowBlur = 6; ctx.beginPath();
        for (let i = 0; i <= 400; i++) { const tt = i / 400 * 10 * tb; const v = vp * Math.sin(2 * Math.PI * f * tt); const xx = x0 + i / 400 * w, yy = y0 + h / 2 - v / vd * dy; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
        ctx.stroke(); ctx.restore();
        HP.label(ctx, `Y-gain ${vd} V/div · timebase ${TB[sT.value]} ms/div`, x0 + 6, y0 + 12, { size: 11, col: "#b9ffcb", halo: false });
        if (vp / vd > 4) HP.label(ctx, "trace off the screen: increase the Y-gain setting (more V/div)", x0 + w / 2, y0 + h - 10, { size: 11, align: "center", col: "#ffd65a", halo: false });
      },
    });
    upd();
  });

  /* =====================================================================
     2. The potential divider
     ===================================================================== */
  mount("w-divider", (box) => {
    let mode = "fixed";
    HP.choice(box, "R₁ is:", [["fixed", "a variable resistor"], ["therm", "a thermistor"], ["ldr", "an LDR"]], mode, (v) => { mode = v; setup(); });
    const cv = canvasIn(box, "", "A potential divider: two resistors in series across a supply, with voltmeters across each.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sVs = HP.slider(ctr, { label: "Supply voltage V<sub>s</sub>", min: 3, max: 12, step: 0.5, value: 9, unit: "V", fmt: (v) => v.toFixed(1), oninput: () => sim.redraw() });
    const s1 = HP.slider(ctr, { label: "R₁", min: 100, max: 10000, step: 100, value: 2000, unit: "Ω", oninput: () => sim.redraw() });
    const s2 = HP.slider(ctr, { label: "R₂ (fixed)", min: 100, max: 10000, step: 100, value: 1000, unit: "Ω", oninput: () => sim.redraw() });
    let envUnit = "°C";
    const sEnv = HP.slider(ctr, { label: "Temperature", min: 0, max: 80, step: 1, value: 20, fmt: (v) => envUnit ? v + " " + envUnit : "level " + v, oninput: () => sim.redraw() });
    const R = readouts(box, [["I", "current I = V<sub>s</sub> / (R₁ + R₂)"], ["V1", "V₁ = R₁ / (R₁ + R₂) × V<sub>s</sub>"], ["V2", "V₂"], ["ratio", "V₁ / V₂ = R₁ / R₂"]]);
    function r1() {
      if (mode === "fixed") return s1.value;
      if (mode === "therm") return 5000 * Math.exp(3900 * (1 / (sEnv.value + 273) - 1 / 298)); // NTC thermistor, 5 kΩ at 25 °C
      return 400 + 20000 / (1 + sEnv.value / 8); // LDR: resistance falls as light increases (sEnv reused as light level)
    }
    function setup() {
      s1.input.closest(".slider").hidden = mode !== "fixed";
      sEnv.input.closest(".slider").hidden = mode === "fixed";
      sEnv.input.closest(".slider").querySelector(".slider-name").textContent = mode === "therm" ? "Temperature" : "Light level";
      envUnit = mode === "therm" ? "°C" : "";
      sEnv.set(sEnv.value);
      sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: () => 240,
      draw(ctx, t, dt, C, S) {
        const Vs = sVs.value, R1 = r1(), R2 = s2.value, I = Vs / (R1 + R2), V1 = I * R1, V2 = I * R2;
        R.I.textContent = F(I * 1000, 3) + " mA"; R.V1.textContent = F(V1, 3) + " V"; R.V2.textContent = F(V2, 3) + " V"; R.ratio.textContent = F(V1 / V2, 3);
        if (mode !== "fixed") s1.input.closest(".slider").querySelector(".slider-val").textContent = F(R1, 3) + " Ω";
        const xL = 60, xR = Math.min(S.w - 160, 300), yT = 40, yB = 200, ym = 120;
        // supply on the left
        wire(ctx, [[xL, ym - 14], [xL, yT], [xR, yT], [xR, yB], [xL, yB], [xL, ym + 14]], "#b3261e", t, 0);
        px(ctx, xL - 14, ym - 3, 28, 3, C.ink); px(ctx, xL - 8, ym + 4, 16, 6, C.ink);
        HP.label(ctx, `${Vs.toFixed(1)} V`, xL - 18, ym, { size: 12, bold: true, align: "right" });
        resistor(ctx, xR, yT + 40, 50, 20, "", C, true);
        resistor(ctx, xR, yB - 40, 50, 20, "", C, true);
        // the component name goes on two lines so it stays clear of the supply wire at narrow widths
        // (the LDR's circle and light arrow need the label further out and lower)
        const r1x = mode === "ldr" ? xR - 30 : xR - 18, r1y = mode === "ldr" ? yT + 48 : yT + 40;
        HP.label(ctx, "R₁", r1x, r1y - (mode === "fixed" ? 0 : 7), { size: 12, bold: true, align: "right" });
        if (mode !== "fixed") HP.label(ctx, mode === "therm" ? "(thermistor)" : "(LDR)", r1x, r1y + 7, { size: 10, align: "right" });
        // variable resistor: an arrow drawn diagonally through the box
        if (mode === "fixed") HP.arrow(ctx, xR - 16, yT + 62, xR + 16, yT + 20, C.ink, 2, 8);
        HP.label(ctx, "R₂", xR - 18, yB - 40, { size: 12, bold: true, align: "right" });
        if (mode === "therm") { ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(xR - 16, yT + 64); ctx.lineTo(xR + 16, yT + 16); ctx.lineTo(xR + 24, yT + 16); ctx.stroke(); }
        if (mode === "ldr") { ctx.beginPath(); ctx.strokeStyle = C.ink; ctx.arc(xR, yT + 40, 22, 0, 7); ctx.stroke(); HP.arrow(ctx, xR - 44, yT + 14, xR - 26, yT + 28, C.gold, 1.5, 6); }
        // voltmeters on the right
        const vx = xR + 60;
        wire(ctx, [[xR, yT + 10], [vx, yT + 10], [vx, yT + 26]], C.ink2); wire(ctx, [[vx, yT + 54], [vx, ym], [xR, ym]], C.ink2);
        wire(ctx, [[vx, ym], [vx, ym + 26]], C.ink2); wire(ctx, [[vx, ym + 54], [vx, yB - 10], [xR, yB - 10]], C.ink2);
        meter(ctx, vx, yT + 40, "V", C); meter(ctx, vx, ym + 40, "V", C);
        // readings sit right of the meters, shrinking if the canvas is too narrow for them
        const v1t = `V₁ = ${F(V1, 3)} V`, v2t = `V₂ = ${F(V2, 3)} V`;
        ctx.font = 'bold 12px "Atkinson Hyperlegible", system-ui, sans-serif';
        const vw = Math.max(ctx.measureText(v1t).width, ctx.measureText(v2t).width), room = S.w - (vx + 18) - 4;
        const vfs = vw > room ? Math.max(9, Math.floor(12 * room / vw)) : 12;
        HP.label(ctx, v1t, vx + 18, yT + 40, { size: vfs, bold: true, col: C.red });
        HP.label(ctx, v2t, vx + 18, ym + 40, { size: vfs, bold: true, col: C.red });
        HP.label(ctx, "the bigger resistor takes the bigger share of V", 10, S.h - 10, { size: 11, col: C.muted });
      },
    });
    setup();
  });

  /* =====================================================================
     3. EMF and internal resistance: the V–I graph builds itself
     ===================================================================== */
  mount("w-emf", (box) => {
    const E = 1.5, r = 0.5;
    const cv = canvasIn(box, "", "A cell with internal resistance drives current through a variable resistor. A voltmeter reads the terminal potential difference; a graph of terminal potential difference against current builds up as you take readings.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sR = HP.slider(ctr, { label: "Load resistance R", min: 0, max: 10, step: 0.25, value: 2.5, unit: "Ω", fmt: (v) => v.toFixed(2), oninput: () => sim.redraw() });
    let pts = [];
    const take = HP.el("button", { type: "button", class: "btn small primary" }, "📏 Record reading");
    take.addEventListener("click", () => { const I = E / (sR.value + r); pts.push([I, E - I * r]); sim.redraw(); if (pts.length >= 4) note.innerHTML = "Extend the best-fit line: it cuts the V axis at the <b>EMF</b> (1.5 V), its gradient is <b>−r</b> (−0.50 Ω), and it cuts the I axis at the <b>short-circuit current</b> E/r = 3.0 A."; });
    const clr = HP.el("button", { type: "button", class: "btn small" }, "↺ Clear graph"); clr.addEventListener("click", () => { pts = []; sim.redraw(); });
    box.append(HP.el("div", { class: "btn-row" }, take, clr));
    const R = readouts(box, [["I", "current I = E / (R + r)"], ["tpd", "terminal p.d. V = IR"], ["lost", "lost volts Ir"], ["sum", "V + Ir"]]);
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" }, "Set a resistance and record a reading. Take at least five over the full range.");
    box.append(note);
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 470 : 270),
      draw(ctx, t, dt, C, S) {
        const Rl = sR.value, I = E / (Rl + r), V = E - I * r;
        R.I.textContent = F(I, 3) + " A"; R.tpd.textContent = F(V, 3) + " V"; R.lost.textContent = F(I * r, 3) + " V"; R.sum.textContent = F(V + I * r, 3) + " V = E";
        const narrow = S.w < 560;
        // circuit
        const cx0 = 20, cy0 = 30, cw = narrow ? S.w - 40 : S.w * 0.42, ch = 180;
        wire(ctx, [[cx0 + cw * 0.3, cy0 + 20], [cx0 + 10, cy0 + 20], [cx0 + 10, cy0 + ch - 20], [cx0 + cw - 10, cy0 + ch - 20], [cx0 + cw - 10, cy0 + 20], [cx0 + cw * 0.7, cy0 + 20]], "#b3261e", t, I * 30);
        // cell with internal resistance inside dashed box
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.strokeRect(cx0 + cw * 0.3, cy0, cw * 0.4, 40); ctx.setLineDash([]);
        px(ctx, cx0 + cw * 0.36, cy0 + 8, 3, 24, C.ink); px(ctx, cx0 + cw * 0.36 + 8, cy0 + 14, 3, 12, C.ink);
        wire(ctx, [[cx0 + cw * 0.36 + 11, cy0 + 20], [cx0 + cw * 0.46, cy0 + 20]], C.ink);
        resistor(ctx, cx0 + cw * 0.55, cy0 + 20, 30, 12, "", C);
        HP.label(ctx, "E = 1.5 V, r = 0.50 Ω", cx0 + cw * 0.5, cy0 - 10, { size: 11, align: "center", bold: true });
        // load
        resistor(ctx, cx0 + cw / 2, cy0 + ch - 20, 50, 18, "", C);
        HP.label(ctx, `R = ${Rl.toFixed(2)} Ω`, cx0 + cw / 2, cy0 + ch, { size: 11, align: "center", bold: true });
        meter(ctx, cx0 + 10, cy0 + ch / 2, "A", C); HP.label(ctx, F(I, 3) + " A", cx0 + 30, cy0 + ch / 2, { size: 11, col: C.red, bold: true });
        // voltmeter across the cell terminals
        wire(ctx, [[cx0 + cw * 0.3, cy0 + 20], [cx0 + cw * 0.3, cy0 + 70], [cx0 + cw * 0.42, cy0 + 70]], C.ink2);
        wire(ctx, [[cx0 + cw * 0.7, cy0 + 20], [cx0 + cw * 0.7, cy0 + 70], [cx0 + cw * 0.58, cy0 + 70]], C.ink2);
        meter(ctx, cx0 + cw * 0.5, cy0 + 70, "V", C); HP.label(ctx, `t.p.d. ${F(V, 3)} V`, cx0 + cw * 0.5, cy0 + 96, { size: 11, align: "center", col: C.red, bold: true });
        // energy bar: E split into V and Ir
        const bx = cx0 + cw * 0.2, by = cy0 + ch + 14, bw = cw * 0.6;
        px(ctx, bx, by, bw * V / E, 12, C.sea); px(ctx, bx + bw * V / E, by, bw * I * r / E, 12, C.red);
        HP.label(ctx, "t.p.d.", bx, by + 22, { size: 10, col: C.sea }); HP.label(ctx, "lost volts", bx + bw, by + 22, { size: 10, align: "right", col: C.red });
        // graph
        const gb = narrow ? { x: 50, y: 262, w: S.w - 66, h: S.h - 262 - 34 } : { x: S.w * 0.5 + 40, y: 18, w: S.w * 0.5 - 56, h: S.h - 52 };
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 3.2, y0: 0, y1: 1.6, xt: 0.5, yt: 0.25, xl: "I / A", yl: "t.p.d. / V", C, fs: 11, tf: (v) => +v.toFixed(2) + "" });
        if (pts.length >= 2) { ctx.strokeStyle = C.gold; ctx.setLineDash([6, 4]); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(E)); ctx.lineTo(ax.X(E / r), ax.Y(0)); ctx.stroke(); ctx.setLineDash([]); }
        pts.forEach(([i, v]) => { ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(ax.X(i) - 4, ax.Y(v) - 4); ctx.lineTo(ax.X(i) + 4, ax.Y(v) + 4); ctx.moveTo(ax.X(i) + 4, ax.Y(v) - 4); ctx.lineTo(ax.X(i) - 4, ax.Y(v) + 4); ctx.stroke(); });
        ctx.fillStyle = C.sea; ctx.beginPath(); ctx.arc(ax.X(I), ax.Y(V), 4, 0, 7); ctx.fill();
      },
      loop: true,
    });
  });

  /* =====================================================================
     4. The Leyden jar: charging and discharging an RC circuit
     ===================================================================== */
  mount("w-rc", (box) => {
    const Vs = 12;
    const cv = canvasIn(box, "", "A capacitor in series with a resistor. Graphs of the potential difference across the capacitor and the current in the circuit against time, for charging and discharging.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sR = HP.slider(ctr, { label: "Resistance R", min: 10, max: 100, step: 5, value: 50, unit: "kΩ", oninput: () => restart() });
    const sC = HP.slider(ctr, { label: "Capacitance C", min: 100, max: 1000, step: 50, value: 200, unit: "μF", oninput: () => restart() });
    let charging = true, Vc = 0, hist = [], tSwitch = 0;
    const R = readouts(box, [["vc", "p.d. across capacitor V<sub>C</sub>"], ["vr", "p.d. across resistor V<sub>R</sub>"], ["I", "current I = V<sub>R</sub> / R"], ["Q", "charge Q = CV<sub>C</sub>"], ["E", "energy stored ½CV<sub>C</sub>²"]]);
    function restart() { Vc = charging ? 0 : Vs; hist = []; sim.t = 0; tSwitch = 0; if (!sim.playing) { sim.play(); pb.sync(); } }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 520 : 320),
      draw(ctx, t, dt, C, S) {
        const Rv = sR.value * 1e3, Cv = sC.value * 1e-6, tau = Rv * Cv;
        // real time is slowed: 1 s on screen = 1 s of circuit time, graph spans 60 s
        const steps = Math.max(1, Math.ceil(dt / 0.01));
        for (let k = 0; k < steps; k++) { const hh = dt / steps; const I = charging ? (Vs - Vc) / Rv : -Vc / Rv; Vc += I * hh / Cv; }
        if (dt > 0) { hist.push([t, Vc, charging ? (Vs - Vc) / Rv : -Vc / Rv]); if (t > 60) sim.pause(), pb.sync(); }
        const I = charging ? (Vs - Vc) / Rv : -Vc / Rv, VR = Math.abs(I) * Rv;
        R.vc.textContent = F(Vc, 3) + " V"; R.vr.textContent = F(VR, 3) + " V"; R.I.textContent = F(I * 1e6, 3) + " μA" + (I < 0 ? " (reversed)" : "");
        R.Q.textContent = F(Cv * Vc, 3) + " C"; R.E.textContent = F(0.5 * Cv * Vc * Vc, 3) + " J";
        const narrow = S.w < 560;
        // circuit: battery (left) – switch – resistor (top) – capacitor (right) – back along the bottom.
        // Position A puts the battery in the loop; position B joins the loop without it (discharge).
        const cx = narrow ? S.w / 2 - 100 : 56, cy = 30, cw = 200, ch = 150;
        const wireCol = "#b3261e", flow = Math.abs(I) > 2e-6 ? Math.abs(I) * 1e6 / 3 : 0;
        const bx = cx, top = cy + 10, bot = cy + ch, rx = cx + cw;
        const pivot = [cx + 60, top], cA = [cx + 30, top], cB = [cx + 30, top + 40];
        // battery branch: A contact down through the cell to the bottom wire
        wire(ctx, [cA, [bx, top], [bx, cy + ch / 2 - 10]], wireCol); wire(ctx, [[bx, cy + ch / 2 + 10], [bx, bot]], wireCol);
        px(ctx, bx - 14, cy + ch / 2 - 10, 28, 3, C.ink); px(ctx, bx - 8, cy + ch / 2 + 5, 16, 5, C.ink);
        HP.label(ctx, "12 V", bx - 18, cy + ch / 2, { size: 11, align: "right", bold: true });
        // B contact straight down to the bottom wire
        wire(ctx, [cB, [cB[0], bot]], wireCol);
        // main loop: pivot → resistor → capacitor → bottom
        wire(ctx, [pivot, [rx, top], [rx, bot], [bx, bot]], wireCol, t, flow);
        resistor(ctx, cx + 120, top, 44, 14, `R = ${sR.value} kΩ`, C);
        // capacitor plates on the right-hand side
        ctx.fillStyle = C.paper; ctx.fillRect(rx - 4, cy + ch / 2 - 4, 8, 8);
        px(ctx, rx - 16, cy + ch / 2 - 6, 32, 3, C.ink); px(ctx, rx - 16, cy + ch / 2 + 4, 32, 3, C.ink);
        const cLab = `C = ${sC.value} μF`;
        ctx.font = 'bold 11px "Atkinson Hyperlegible", system-ui, sans-serif';
        const cFits = rx + 20 + ctx.measureText(cLab).width <= S.w - 4;
        HP.label(ctx, cLab, cFits ? rx + 20 : rx - 22, cy + ch / 2, { size: 11, bold: true, align: cFits ? "left" : "right" });
        const q = Vc / Vs; for (let k = 0; k < Math.round(q * 5); k++) { HP.label(ctx, "+", rx - 12 + k * 6, cy + ch / 2 - 15, { size: 10, col: C.red, halo: false, bold: true }); HP.label(ctx, "−", rx - 12 + k * 6, cy + ch / 2 + 16, { size: 10, col: C.sea, halo: false, bold: true }); }
        // switch blade
        [cA, cB, pivot].forEach(([x, y]) => { ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, 7); ctx.fill(); });
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(...pivot); ctx.lineTo(...(charging ? cA : cB)); ctx.stroke();
        HP.label(ctx, "A", cA[0] - 4, cA[1] - 10, { size: 11, bold: true, align: "center" });
        HP.label(ctx, "B", cB[0] - 10, cB[1], { size: 11, bold: true, align: "right" });
        HP.label(ctx, charging ? "switch at A: charging" : "switch at B: discharging", cx + cw / 2, bot + 18, { size: 12, align: "center", bold: true });
        // graphs
        const gx = narrow ? 50 : cx + cw + 110, gw = S.w - gx - 16;
        const g1 = narrow ? { x: gx, y: 230, w: gw, h: 120 } : { x: gx, y: 16, w: gw, h: S.h / 2 - 34 };
        const g2 = narrow ? { x: gx, y: 380, w: gw, h: 120 } : { x: gx, y: S.h / 2 + 12, w: gw, h: S.h / 2 - 34 };
        const a1 = HP.plot(ctx, g1, { x0: 0, x1: 60, y0: 0, y1: 13, xt: 10, yt: 4, xl: "t / s", yl: "Vc / V", C, fs: 11 });
        const Imax = Vs / 10e3 * 1e6; // μA at the smallest R, fixed axis so R's effect shows
        const a2 = HP.plot(ctx, g2, { x0: 0, x1: 60, y0: -Imax * 1.05, y1: Imax * 1.05, xt: 10, yt: 400, xl: "t / s", yl: "I / μA", C, fs: 11 });
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = C.sea; ctx.beginPath(); hist.forEach(([tt, v], i) => (i ? ctx.lineTo(a1.X(tt), a1.Y(v)) : ctx.moveTo(a1.X(tt), a1.Y(v)))); ctx.stroke();
        ctx.strokeStyle = C.red; ctx.beginPath(); hist.forEach(([tt, , ii], i) => (i ? ctx.lineTo(a2.X(tt), a2.Y(ii * 1e6)) : ctx.moveTo(a2.X(tt), a2.Y(ii * 1e6)))); ctx.stroke();
        if (tSwitch) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; [a1, a2].forEach((a, k) => { const g = k ? g2 : g1; ctx.beginPath(); ctx.moveTo(a.X(tSwitch), g.y); ctx.lineTo(a.X(tSwitch), g.y + g.h); ctx.stroke(); }); ctx.setLineDash([]); }
        // under the circuit, clear of the graph axes and their labels
        HP.label(ctx, `time constant RC = ${F(tau, 2)} s (for interest only)`, cx + cw / 2, bot + 36, { size: 10, align: "center", col: C.muted });
      },
    });
    const pb = HP.playButton(sim, ["▶ Run", "❚❚ Pause"]);
    const sw = HP.el("button", { type: "button", class: "btn small" }, "⇄ Flip the switch");
    sw.addEventListener("click", () => { charging = !charging; tSwitch = sim.t; if (!sim.playing) { sim.play(); pb.sync(); } });
    const rs = HP.el("button", { type: "button", class: "btn small" }, "↺ Start again (charging)");
    rs.addEventListener("click", () => { charging = true; restart(); });
    box.insertBefore(HP.el("div", { class: "btn-row" }, pb, sw, rs), ctr);
    sim.redraw();
  });

  /* =====================================================================
     5. Energy bands: conductor, semiconductor, insulator
     ===================================================================== */
  mount("w-bands", (box) => {
    const cv = canvasIn(box, "", "Energy band diagrams for a conductor, a semiconductor and an insulator. Dots are electrons. Raising the temperature lifts some electrons across the small gap in the semiconductor.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sT = HP.slider(ctr, { label: "Temperature", min: 0, max: 500, step: 10, value: 300, unit: "K", oninput: () => sim.redraw() });
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    // fixed pseudo-random electron positions
    const rnd = (k) => { const x = Math.sin(k * 12.9898) * 43758.5453; return x - Math.floor(x); };
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 280),
      draw(ctx, t, dt, C, S) {
        const T = sT.value;
        const cols = [["Conductor (metal)", 0, true], ["Semiconductor", 1.1, false], ["Insulator", 6, false]];
        const ax0 = 26, pw = (S.w - ax0) / 3;
        // energy axis: an upward arrow down the left-hand edge
        HP.arrow(ctx, 12, S.h - 24, 12, 34, C.ink, 2, 8);
        ctx.save(); ctx.translate(12, (S.h + 10) / 2); ctx.rotate(-Math.PI / 2);
        HP.label(ctx, "energy", 0, 0, { size: 11, bold: true, align: "center" }); ctx.restore();
        cols.forEach(([name, gap, metal], i) => {
          const x0 = ax0 + i * pw + 6, w = pw - 12, top = 40, bot = S.h - 30;
          ctx.font = 'bold 12px "Atkinson Hyperlegible", system-ui, sans-serif';
          const nw = ctx.measureText(name).width, nfs = nw > pw - 6 ? Math.max(9, Math.floor(12 * (pw - 6) / nw)) : 12;
          HP.label(ctx, name, x0 + w / 2, 18, { size: nfs, bold: true, align: "center" });
          const gapPx = metal ? 0 : Math.min(110, 20 + gap * 16);
          const vbTop = (top + bot) / 2 + gapPx / 2 - (metal ? 10 : 0), cbBot = (top + bot) / 2 - gapPx / 2 - (metal ? -10 : 0);
          // conduction band (upper)
          ctx.fillStyle = "rgba(29,106,128,.18)"; ctx.fillRect(x0, top, w, cbBot - top);
          ctx.strokeStyle = C.sea; ctx.lineWidth = 1.5; ctx.strokeRect(x0, top, w, cbBot - top);
          // valence band (lower)
          ctx.fillStyle = "rgba(179,38,30,.15)"; ctx.fillRect(x0, vbTop, w, bot - vbTop);
          ctx.strokeStyle = C.red; ctx.strokeRect(x0, vbTop, w, bot - vbTop);
          HP.label(ctx, "conduction band", x0 + 4, top + 10, { size: 10, col: C.sea });
          HP.label(ctx, "valence band", x0 + 4, bot - 8, { size: 10, col: C.red });
          if (!metal) HP.label(ctx, `gap ${gap < 2 ? "small" : "large"}`, x0 + w / 2, (cbBot + vbTop) / 2, { size: 10, align: "center", col: C.muted });
          // electrons
          const nV = 40;
          let excited;
          if (metal) excited = 14;
          else excited = gap > 3 ? 0 : Math.round(10 * Math.pow(T / 500, 3)); // illustrative: rises steeply with temperature
          for (let k = 0; k < nV; k++) {
            const up = k < excited;
            const jitter = Math.sin(t * 3 + k) * 1.5;
            const xx = x0 + 6 + rnd(k + i * 100) * (w - 12);
            const yy = up ? top + 16 + rnd(k * 7 + i) * (cbBot - top - 22) : vbTop + 6 + rnd(k * 3 + i * 7) * (bot - vbTop - 20);
            ctx.fillStyle = "#1c3b66"; ctx.beginPath(); ctx.arc(xx + (up ? jitter : 0), yy, 2.6, 0, 7); ctx.fill();
            if (up && !metal) { ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x0 + 6 + rnd(k * 5 + 9 + i) * (w - 12), vbTop + 8 + rnd(k * 11 + i) * 12, 2.6, 0, 7); ctx.stroke(); }
          }
        });
        const nSemi = Math.round(10 * Math.pow(T / 500, 3));
        const txt = T < 100 ? "Very cold: in the semiconductor, almost no electrons have enough energy to cross the gap, so it barely conducts. The metal still conducts: its band is only partly filled."
          : `At ${T} K, ${nSemi ? "some" : "a few"} electrons in the semiconductor gain enough energy to jump into the conduction band, leaving empty spaces (holes, red rings) behind. Both let it conduct. Hotter means more of them, so higher conductivity. The insulator's gap is far too large: no conduction.`;
        if (note.textContent !== txt) note.textContent = txt;
      },
      loop: true,
    });
  });

  /* =====================================================================
     6. The p-n junction: bias, LED and solar cell
     ===================================================================== */
  mount("w-pn", (box) => {
    let mode = "none";
    HP.choice(box, "Junction:", [["none", "no bias"], ["fwd", "forward bias (LED)"], ["rev", "reverse bias"], ["solar", "light falling on it (solar cell)"]], mode, (v) => { mode = v; parts.forEach((p) => (p.x = p.home)); });
    let colour = "red";
    const colSeg = HP.choice(box, "LED material:", [["red", "red LED (smaller gap)"], ["blue", "blue LED (bigger gap)"]], colour, (v) => { colour = v; });
    const cv = canvasIn(box, "", "A p-n junction with its depletion layer and electric field, shown as a band diagram. Forward bias narrows the depletion layer and electrons fall into holes, emitting photons; reverse bias widens it; light falling on it creates a potential difference.");
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    const parts = [];
    for (let k = 0; k < 18; k++) parts.push({ type: "e", home: 0.55 + (k % 6) * 0.07, y: 0.25 + Math.floor(k / 6) * 0.08, x: 0 });
    for (let k = 0; k < 18; k++) parts.push({ type: "h", home: 0.05 + (k % 6) * 0.07, y: 0.67 + Math.floor(k / 6) * 0.08, x: 0 });
    parts.forEach((p) => (p.x = p.home));
    const photons = [];
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 300),
      draw(ctx, t, dt, C, S) {
        colSeg.hidden = mode !== "fwd";
        const x0 = 20, w = S.w - 40, mid = x0 + w / 2;
        const depl = mode === "fwd" ? 0.04 : mode === "rev" ? 0.2 : 0.1;
        // regions
        ctx.fillStyle = "rgba(179,38,30,.10)"; ctx.fillRect(x0, 30, w / 2, S.h - 70);
        ctx.fillStyle = "rgba(29,106,128,.12)"; ctx.fillRect(mid, 30, w / 2, S.h - 70);
        ctx.fillStyle = "rgba(0,0,0,.08)"; ctx.fillRect(mid - depl * w / 2, 30, depl * w, S.h - 70);
        HP.label(ctx, "p-type (holes)", x0 + w / 4, 18, { size: 12, bold: true, align: "center", col: C.red });
        HP.label(ctx, "n-type (free electrons)", x0 + w * 0.75, 18, { size: 12, bold: true, align: "center", col: C.sea });
        HP.label(ctx, "depletion layer", mid, S.h - 28, { size: 11, align: "center", col: C.ink2 });
        // band edges: step at the junction (bigger step = bigger field)
        const step = mode === "fwd" ? 18 : mode === "rev" ? 70 : 40;
        const cbN = S.h * 0.3, vbN = S.h * 0.62;
        const gapFactor = mode === "fwd" && colour === "blue" ? 1.35 : 1;
        const cbP = cbN - step, vbP = vbN - step;
        const edge = (yp, yn, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x0, yp); ctx.lineTo(mid - depl * w / 2, yp); ctx.bezierCurveTo(mid, yp, mid, yn, mid + depl * w / 2, yn); ctx.lineTo(x0 + w, yn); ctx.stroke(); };
        const gapPx = (vbN - cbN) * gapFactor;
        edge(cbP - (gapFactor - 1) * 20, cbN - (gapFactor - 1) * 20, C.sea);
        edge(cbP - (gapFactor - 1) * 20 + gapPx, cbN - (gapFactor - 1) * 20 + gapPx, C.red);
        HP.label(ctx, "conduction band", x0 + 4, cbP - (gapFactor - 1) * 20 - 10, { size: 10, col: C.sea });
        HP.label(ctx, "valence band", x0 + 4, cbP - (gapFactor - 1) * 20 + gapPx + 12, { size: 10, col: C.red });
        // field arrow inside the depletion layer (from n to p, i.e. pointing left)
        HP.arrow(ctx, mid + 18 + depl * w * 0.3, S.h - 46, mid - 18 - depl * w * 0.3, S.h - 46, C.gold, 2 + (mode === "rev" ? 1.5 : 0), 8);
        HP.label(ctx, mode === "fwd" ? "field reduced" : mode === "rev" ? "field increased" : "electric field", mid + 30 + depl * w * 0.3, S.h - 46, { size: 10, col: C.gold });
        // electrons in n conduction band, holes in p valence band
        const cbAt = (fx) => { const X = x0 + fx * w; return X < mid ? cbP - (gapFactor - 1) * 20 : cbN - (gapFactor - 1) * 20; };
        parts.forEach((p, k) => {
          if (mode === "fwd") {
            // electrons drift left into p, holes drift right into n; they meet near the junction and recombine
            const sp = 0.06 * dt;
            if (p.type === "e") { p.x -= sp; if (p.x < 0.45) { photons.push({ x: x0 + p.x * w, y: cbAt(p.x) + gapPx / 2, t0: t }); p.x = 0.93; } }
            else { p.x += sp; if (p.x > 0.52) p.x = 0.05; }
          } else if (mode === "rev") {
            p.x += (p.type === "e" ? Math.max(p.home + 0.05, 0.65) - p.x : Math.min(p.home - 0.05, 0.35) - p.x) * 0.05;
          } else p.x += (p.home - p.x) * 0.05;
          const X = x0 + p.x * w;
          if (p.type === "e") { const y = cbAt(p.x) - 8 - (k % 3) * 7; ctx.fillStyle = "#1c3b66"; ctx.beginPath(); ctx.arc(X, y, 3.2, 0, 7); ctx.fill(); }
          else { const y = cbAt(p.x) + gapPx + 8 + (k % 3) * 7; ctx.strokeStyle = C.red; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(X, y, 3.2, 0, 7); ctx.stroke(); }
        });
        if (mode === "solar") {
          // photons arrive, lift electrons across the gap at the junction; the field sweeps electrons to n, holes to p
          if (Math.floor(t * 3) !== Math.floor((t - dt) * 3)) photons.push({ x: mid - 30 + Math.random() * 60, y: 30, t0: t, inbound: true });
        }
        for (let i = photons.length - 1; i >= 0; i--) {
          const ph = photons[i], age = t - ph.t0;
          if (age > 1.6) { photons.splice(i, 1); continue; }
          const col = ph.inbound ? "#e0b23a" : colour === "blue" ? "#3a6bff" : "#ff3030";
          const y = ph.inbound ? ph.y + age * 80 : ph.y - age * 90;
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
          for (let k = 0; k <= 14; k++) { const xx = ph.x + Math.sin(k * 0.9) * 4, yy = y + k * 1.5; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
          ctx.stroke();
          if (ph.inbound && age > 0.9) {
            const f = (age - 0.9) / 0.7;
            ctx.fillStyle = "#1c3b66"; ctx.beginPath(); ctx.arc(ph.x + f * 90, cbN - 12, 3.2, 0, 7); ctx.fill();
            ctx.strokeStyle = C.red; ctx.beginPath(); ctx.arc(ph.x - f * 90, vbP + 12, 3.2, 0, 7); ctx.stroke();
          }
        }
        if (mode === "solar") HP.label(ctx, "p.d. produced: p side +, n side −", mid, S.h - 12, { size: 11, align: "center", bold: true, col: C.grass });
        if (mode === "fwd") HP.label(ctx, `photons emitted (${colour}): energy ≈ the band gap`, mid, S.h - 12, { size: 11, align: "center", bold: true, col: colour === "blue" ? "#3a6bff" : C.red });
        const txt = {
          none: "No bias: free electrons from the n-type and holes from the p-type have combined across the junction, leaving a thin depletion layer with no free charges and an electric field across it. The field stops further charge crossing.",
          fwd: "Forward bias (p to +, n to −) reduces the electric field. Electrons move from the conduction band of the n-type towards the conduction band of the p-type, then fall into holes in the valence band, emitting a photon each time. That is an LED. A bigger band gap gives higher-energy photons (blue rather than red), and needs a larger forward p.d.",
          rev: "Reverse bias (p to −, n to +) increases the electric field. The depletion layer widens and almost no current flows.",
          solar: "Photovoltaic effect: photons absorbed at the junction raise electrons from the valence band to the conduction band. The field in the junction pushes these electrons towards the n-type (and holes towards the p-type), so a potential difference appears across the cell.",
        }[mode];
        if (note.textContent !== txt) note.textContent = txt;
      },
      loop: true,
    });
    box.insertBefore(HP.el("div", { class: "btn-row" }, HP.playButton(sim)), cv);
  });
})();
