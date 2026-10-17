/* Drive systems & pneumatics: the Engine Deck of HMS Ratchet.
   Every number a widget shows is computed from the same formulae the text teaches (Data Booklet forms). */
(function () {
  "use strict";
  const HE = window.HE;
  if (!HE) return;
  const $ = (id) => document.getElementById(id);
  const N = HE.n, F = HE.fmt;
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HE.el("canvas", { class: "sim", role: "img", "aria-label": label }); box.append(c); return c; };
  const controls = (box) => { const d = HE.el("div", { class: "sim-controls" }); box.append(d); return d; };
  /* a grid of labelled read-outs; r.set(key, text) */
  function readouts(box, defs) {
    const wrap = HE.el("div", { class: "readouts", "aria-live": "polite" });
    const els = {};
    defs.forEach(([k, label]) => {
      const b = HE.quiet(HE.el("b", null, "—"));
      els[k] = b;
      wrap.append(HE.el("div", null, b, HE.el("span", null, label)));
    });
    box.append(wrap);
    return { set(k, t) { els[k].textContent = t; } };
  }
  const note = (box, cls) => { const p = HE.el("p", { class: cls || "sim-note", "aria-live": "polite" }); box.append(p); return p; };
  /* visual rev/s for an input shaft: slow enough to watch, still faster for a faster shaft */
  const visRev = (rpm) => 0.15 + 0.85 * Math.min(rpm, 3000) / 3000;
  const rpmText = (x) => F(x, 3) + " rev/min";

  /* ================================================================
     1. The capstan: torque, power and rope speed
     ================================================================ */
  mount("w-capstan", (box) => {
    const cv = canvasIn(box, "A capstan drum seen from above with a rope hauling a load. Sliders set the rope pull, drum diameter and speed; read-outs show torque, power and rope speed.");
    const ctl = controls(box);
    let Fn = 800, dmm = 400, nrpm = 40, ang = 0, mark = 0;
    const sF = HE.slider(ctl, { label: "Rope pull $F$", min: 100, max: 2000, step: 50, value: Fn, unit: "N", oninput: (v) => { Fn = v; upd(); } });
    HE.slider(ctl, { label: "Drum <b>diameter</b> $d$", min: 200, max: 800, step: 20, value: dmm, unit: "mm", oninput: (v) => { dmm = v; upd(); } });
    HE.slider(ctl, { label: "Drum speed $n$", min: 10, max: 120, step: 5, value: nrpm, unit: "rev/min", oninput: (v) => { nrpm = v; upd(); } });
    const row = HE.el("div", { class: "btn-row" });
    box.append(row);
    const ro = readouts(box, [["r", "radius r = d ÷ 2"], ["T", "torque T = F r"], ["n", "speed n in rev/s"], ["P", "power P = 2πnT"], ["v", "rope speed v = 2πrn"], ["P2", "check: P = Fv"]]);
    const msg = note(box);
    let L = { cx: 0, cy: 0, rpx: 0, tipY: 0 };
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.62, 270, 340)),
      draw(ctx, t, dt, C, s) {
        const w = s.w, h = s.h, r = dmm / 2000, nrps = nrpm / 60;
        const vis = visRev(nrpm);
        if (dt) { ang -= TAU * vis * dt; mark += vis * dt * 3; }
        const Rmax = Math.min(h * 0.34, w * 0.24);
        const rpx = Rmax * (0.42 + 0.58 * (dmm - 200) / 600);
        const cx = w * 0.45, cy = h * 0.38;
        const ropeX = cx + rpx;
        // rope hangs from the right-hand rim to a load
        const ropeEnd = h - 52;
        ctx.save();
        ctx.strokeStyle = C.dirt; ctx.lineWidth = 5; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(ropeX, cy); ctx.lineTo(ropeX, ropeEnd); ctx.stroke();
        ctx.strokeStyle = C.paper; ctx.lineWidth = 2; ctx.setLineDash([3, 9]);
        ctx.lineDashOffset = -(mark * 12);
        ctx.beginPath(); ctx.moveTo(ropeX, cy); ctx.lineTo(ropeX, ropeEnd); ctx.stroke();
        ctx.setLineDash([]);
        // the load: a crate of powder kegs
        ctx.fillStyle = C.dirt; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillRect(ropeX - 22, ropeEnd, 44, 32); ctx.strokeRect(ropeX - 22, ropeEnd, 44, 32);
        ctx.fillStyle = C.paper; ctx.font = "bold 12px 'Atkinson Hyperlegible', sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("load", ropeX, ropeEnd + 16);
        // drum
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang);
        ctx.fillStyle = C.paper2; ctx.strokeStyle = C.navy; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.arc(0, 0, rpx, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.sky; ctx.lineWidth = 3;
        for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * rpx * 0.95, Math.sin(a) * rpx * 0.95); ctx.stroke(); ctx.fillStyle = C.lode; ctx.beginPath(); ctx.arc(Math.cos(a) * rpx * 0.95, Math.sin(a) * rpx * 0.95, 4, 0, TAU); ctx.fill(); }
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(0, 0, 5, 0, TAU); ctx.fill();
        ctx.restore();
        // radius = perpendicular distance from the axis to the line of the rope
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.red; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ropeX, cy); ctx.stroke(); ctx.setLineDash([]);
        HE.label(ctx, "r = " + F(r, 3) + " m", cx + rpx / 2, cy + 16, { align: "center", col: C.red, bold: true });
        // force arrow, drawn beside the rope; its tip is a drag handle
        const aL = 18 + (Fn / 2000) * Math.max(30, ropeEnd - cy - 40);
        const ax = ropeX + 20, tipY = cy + aL;
        HE.arrow(ctx, ax, cy, ax, tipY, C.lode, 4, 12);
        HE.dot(ctx, ax, tipY, C.lode, 6, C.card);
        HE.label(ctx, "F = " + F(Fn, 3) + " N", ax + 12, cy + aL / 2, { col: C.lode, bold: true });
        // torque arrow: the motor turns the drum anticlockwise to haul
        ctx.strokeStyle = C.sea; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, rpx * 0.34, Math.PI * 0.15, Math.PI * 1.45, true); ctx.stroke();
        const ea = Math.PI * 1.45; HE.arrow(ctx, cx + Math.cos(ea + 0.15) * rpx * 0.34, cy + Math.sin(ea + 0.15) * rpx * 0.34, cx + Math.cos(ea) * rpx * 0.34 + 1.5, cy + Math.sin(ea) * rpx * 0.34 + 6, C.sea, 3, 10);
        HE.label(ctx, "T = " + F(Fn * r, 3) + " N m", cx - rpx - 12, cy + 4, { align: "right", col: C.sea, bold: true });
        HE.label(ctx, "motor torque hauls the rope", 10, 16, { col: C.ink2, size: 12 });
        ctx.restore();
        L = { cx, cy, rpx, tipY, ax, cyTop: cy };
      },
    });
    HE.drag(cv, sim, () => [{ x: L.ax || 0, y: L.tipY || 0, id: "F" }], (id, x, y) => {
      const span = Math.max(30, sim.h - 52 - L.cy - 40);
      const f = clamp(Math.round(((y - L.cy - 18) / span) * 2000 / 50) * 50, 100, 2000);
      sF.set(f);
    });
    const play = HE.playButton(sim, ["▶ Haul", "❚❚ Pause"]);
    row.append(play, HE.el("span", { class: "hint", style: "margin:0" }, "Drag the orange dot to change the pull. The animation is slowed down; the numbers are real."));
    function upd() {
      const r = dmm / 2000, nrps = nrpm / 60, T = Fn * r, P = TAU * nrps * T, v = TAU * r * nrps;
      ro.set("r", F(r, 3) + " m"); ro.set("T", F(T, 3) + " N m"); ro.set("n", F(nrps, 3) + " rev/s");
      ro.set("P", F(P, 3) + " W"); ro.set("v", F(v, 3) + " m/s"); ro.set("P2", F(Fn * v, 3) + " W");
      msg.innerHTML = `The drum's <b>diameter</b> is ${dmm} mm, so the <b>radius</b> is ${dmm / 2} mm = ${F(r, 3)} m. $T = Fr = ${F(Fn, 3)} \\times ${F(r, 3)} = ${F(T, 3)}$ N m. The speed ${nrpm} rev/min is ${F(nrps, 3)} rev/s. $P = 2\\pi nT = ${F(P, 3)}$ W, which is the same as $Fv$.`;
      HE.math(msg);
      sim.redraw();
    }
    upd();
  });

  /* ================================================================
     2. Gear-train builder
     ================================================================ */
  function gearPath(ctx, N, rp, cx, cy, th) {
    // rp is the pitch radius in pixels; teeth stand 1 module out and 1.25 modules in (module = 2 rp / N)
    const m = (2 * rp) / N, ro = rp + m, rr = rp - 1.25 * m, p = TAU / N;
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const a = th + k * p;
      const pts = [[rr, -0.3], [ro, -0.16], [ro, 0.16], [rr, 0.3]];
      pts.forEach(([r, f], i) => { const x = cx + Math.cos(a + f * p) * r, y = cy + Math.sin(a + f * p) * r; (k === 0 && i === 0) ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
    }
    ctx.closePath();
  }
  function curvedArrow(ctx, cx, cy, r, cw, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2.5;
    const a0 = cw ? -2.4 : -0.74, a1 = cw ? -0.74 : -2.4;
    ctx.beginPath(); ctx.arc(cx, cy, r, a0, a1, !cw); ctx.stroke();
    const ea = a1, dir = cw ? 1 : -1;
    const px = cx + Math.cos(ea) * r, py = cy + Math.sin(ea) * r, tx = -Math.sin(ea) * dir, ty = Math.cos(ea) * dir;
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(px + tx * 7, py + ty * 7); ctx.lineTo(px - ty * 5 - tx * 3, py + tx * 5 - ty * 3); ctx.lineTo(px + ty * 5 - tx * 3, py - tx * 5 - ty * 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  mount("w-gear", (box) => {
    let mode = "simple", tA = 20, tD = 40, tI = 30, tB = 45, tC = 15, tD2 = 30, nin = 1200, Tin = 10, eta = 90, th0 = 0;
    const cv = canvasIn(box, "A gear train. Choose a simple pair, a pair with an idler, or a compound train; set the numbers of teeth. The gears turn with meshing teeth, curved arrows show each gear's direction, and read-outs give velocity ratio, output speed and output torque.");
    HE.choice(box, "Train", [["simple", "Simple pair"], ["idler", "Simple + idler"], ["compound", "Compound"]], mode, (v) => { mode = v; buildSliders(); upd(); });
    const ctlT = controls(box), ctlE = controls(box);
    let sl = {};
    function buildSliders() {
      ctlT.innerHTML = "";
      const mk = (key, label, min, max, init, set) => { sl[key] = HE.slider(ctlT, { label, min, max, step: 1, value: init, unit: "teeth", oninput: (v) => { set(v); upd(); } }); };
      mk("A", "Driver A (input)", 10, 60, tA, (v) => (tA = v));
      if (mode === "idler") mk("I", "Idler gear", 10, 60, tI, (v) => (tI = v));
      if (mode === "compound") { mk("B", "Gear B (meshes with A)", 10, 60, tB, (v) => (tB = v)); mk("C", "Gear C (on B's shaft)", 10, 60, tC, (v) => (tC = v)); }
      mk("D", mode === "compound" ? "Driven D (output)" : "Driven gear D (output)", 10, 60, mode === "compound" ? tD2 : tD, (v) => { if (mode === "compound") tD2 = v; else tD = v; });
    }
    HE.slider(ctlE, { label: "Input speed", min: 60, max: 3000, step: 20, value: nin, unit: "rev/min", oninput: (v) => { nin = v; upd(); } });
    HE.slider(ctlE, { label: "Input torque", min: 1, max: 50, step: 1, value: Tin, unit: "N m", oninput: (v) => { Tin = v; upd(); } });
    HE.slider(ctlE, { label: "Efficiency of the whole train", min: 50, max: 100, step: 1, value: eta, unit: "%", oninput: (v) => { eta = v; upd(); } });
    const row = HE.el("div", { class: "btn-row" }); box.append(row);
    const ro = readouts(box, [["VR", "velocity ratio VR"], ["nout", "output speed"], ["Tout", "output torque"], ["Pin", "input power"], ["Pout", "output power"], ["dir", "output direction"]]);
    const msg = note(box);
    // the gears: list of { N, role, plane, cx, cy (unit coords), th (angle) }
    function layout() {
      const g = [];
      if (mode === "simple") {
        g.push({ N: tA, role: "A", x: 0, y: 0 }); g.push({ N: tD, role: "D", x: (tA + tD) / 2, y: 0, from: 0, ang: 0 });
      } else if (mode === "idler") {
        g.push({ N: tA, role: "A", x: 0, y: 0 }); g.push({ N: tI, role: "I", x: (tA + tI) / 2, y: 0, from: 0, ang: 0 });
        g.push({ N: tD, role: "D", x: (tA + tI) / 2 + (tI + tD) / 2, y: 0, from: 1, ang: 0 });
      } else {
        g.push({ N: tA, role: "A", x: 0, y: 0 }); g.push({ N: tB, role: "B", x: (tA + tB) / 2, y: 0, from: 0, ang: 0 });
        const phi = 0.62; // C sits on B's shaft, D sits down and to the right of it
        g.push({ N: tC, role: "C", x: (tA + tB) / 2, y: 0, same: 1, plane: 2 });
        g.push({ N: tD2, role: "D", x: (tA + tB) / 2 + Math.cos(phi) * (tC + tD2) / 2, y: Math.sin(phi) * (tC + tD2) / 2, from: 2, ang: phi, plane: 2 });
      }
      return g;
    }
    function ratio() {
      const eff = eta / 100;
      let VR;
      if (mode === "simple") VR = tD / tA; else if (mode === "idler") VR = tD / tA; else VR = (tB / tA) * (tD2 / tC);
      const meshes = mode === "simple" ? 1 : mode === "idler" ? 2 : 2;
      return { VR, eff, same: meshes % 2 === 0 };
    }
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.62, 260, 340)),
      draw(ctx, t, dt, C, s) {
        const w = s.w, h = s.h, g = layout();
        if (dt) th0 += TAU * visRev(nin) * dt;
        // bounding box in unit coords
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        g.forEach((q) => { const r = q.N / 2 + 1.2; x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r); y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r); });
        const sc = Math.min((w - 36) / (x1 - x0), (h - 54) / (y1 - y0), 7);
        const ox = (w - (x1 - x0) * sc) / 2 - x0 * sc, oy = 20 + (h - 20 - (y1 - y0) * sc) / 2 - y0 * sc;
        // angles: sequential meshing so every pair is consistent
        g[0].th = th0;
        for (let i = 1; i < g.length; i++) {
          const q = g[i];
          if (q.same != null) { q.th = g[q.same].th; continue; }
          const p = g[q.from];
          q.th = q.ang + Math.PI + Math.PI / q.N - (p.th - q.ang) * p.N / q.N;
        }
        const col = { A: C.lode, B: C.sky, C: C.navy, D: C.grass, I: C.muted };
        const sign = (q) => { // direction of rotation relative to A: +1 clockwise
          let sg = 1; const chain = q.role === "A" ? [] : (q.role === "I" ? [0] : q.role === "B" ? [0] : q.role === "C" ? [0] : mode === "compound" ? [0, 1] : mode === "simple" ? [0] : [0, 1]);
          // each external mesh flips the direction
          const meshes = q.role === "A" ? 0 : q.role === "I" ? 1 : q.role === "B" ? 1 : q.role === "C" ? 1 : mode === "simple" ? 1 : 2;
          return meshes % 2 ? -1 : 1;
        };
        g.slice().sort((a, b) => (a.plane || 1) - (b.plane || 1)).forEach((q) => {
          const rp = q.N / 2 * sc, cx = ox + q.x * sc, cy = oy + q.y * sc;
          ctx.save();
          if (mode === "compound" && !q.plane) ctx.globalAlpha = 0.72;
          ctx.fillStyle = col[q.role]; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.4; ctx.lineJoin = "round";
          gearPath(ctx, q.N, rp, cx, cy, q.th); ctx.fill(); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(cx, cy, Math.max(7, rp * 0.28), 0, TAU); ctx.fill(); ctx.stroke();
          // spoke mark shows the turning
          ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(q.th) * rp * 0.7, cy + Math.sin(q.th) * rp * 0.7); ctx.stroke();
          ctx.restore();
          HE.label(ctx, q.role + "  " + q.N + "T", cx, cy + (q.plane === 2 && q.role === "C" ? 0 : 0), { align: "center", size: 12, bold: true, col: C.ink, halo: true });
          curvedArrow(ctx, cx, cy - 0, Math.max(10, rp * 0.5), sign(q) > 0, C.ink);
        });
        const rr = ratio();
        HE.label(ctx, "slow motion: the ratios are exact", 10, 12, { size: 12, col: C.ink2 });
        if (mode === "compound") HE.label(ctx, "B and C are fixed to one shaft: same speed", w - 10, h - 12, { size: 12, col: C.ink2, align: "right" });
        HE.label(ctx, "curved arrows show each gear's direction of rotation", 10, h - 12, { size: 11, col: C.muted });
      },
    });
    const play = HE.playButton(sim, ["▶ Run the train", "❚❚ Pause"]);
    row.append(play);
    function upd() {
      const { VR, eff, same } = ratio();
      const nout = nin / VR, Tout = Tin * VR * eff, Pin = TAU * (nin / 60) * Tin, Pout = TAU * (nout / 60) * Tout;
      ro.set("VR", F(VR, 3)); ro.set("nout", rpmText(nout)); ro.set("Tout", F(Tout, 3) + " N m");
      ro.set("Pin", F(Pin, 3) + " W"); ro.set("Pout", F(Pout, 3) + " W"); ro.set("dir", same ? "same as input" : "opposite to input");
      let work;
      if (mode === "compound") work = `$\\text{VR} = \\dfrac{${tB}}{${tA}} \\times \\dfrac{${tD2}}{${tC}} = ${F(VR, 4)}$`;
      else work = `$\\text{VR} = \\dfrac{${tD}}{${tA}} = ${F(VR, 4)}$`;
      msg.innerHTML = `${work}. Output speed = ${nin} ÷ ${F(VR, 4)} = <b>${rpmText(nout)}</b>. Torque goes up by the ratio but only ${eta}% survives: ${Tin} × ${F(VR, 4)} × ${F(eff, 2)} = <b>${F(Tout, 3)} N m</b>. ${VR > 1 ? "A slower, stronger output (a reduction)." : VR < 1 ? "A faster, weaker output (a step-up)." : "Same speed, same torque (less losses)."} ${mode === "idler" ? "The idler makes no difference to the ratio: it only reverses the direction of the output." : ""}`;
      HE.math(msg); sim.redraw();
    }
    buildSliders(); upd();
  });

  /* ================================================================
     3. Other drives: belt, chain, rack & pinion, worm & wheel, worm & nut
     ================================================================ */
  mount("w-drives", (box) => {
    let mode = "belt";
    const P = { belt: { d1: 80, d2: 240, n: 1440, slip: 0, crossed: false }, chain: { t1: 16, t2: 32, n: 600 }, rack: { d: 40, n: 90, flip: false }, worm: { starts: 1, teeth: 30, n: 1200 }, screw: { lead: 5, n: 300, flip: false } };
    const cv = canvasIn(box, "A drive animation. Choose belt, chain and sprocket, rack and pinion, worm and wheel, or worm and nut; sliders change sizes and speed and read-outs give the calculated output speeds.");
    const tabs = HE.choice(box, "Drive", [["belt", "Belt"], ["chain", "Chain"], ["rack", "Rack & pinion"], ["worm", "Worm & wheel"], ["screw", "Worm & nut"]], mode, (v) => { mode = v; build(); upd(); });
    const ctl = controls(box);
    const row = HE.el("div", { class: "btn-row" }); box.append(row);
    const roHost = HE.el("div"); box.append(roHost);
    const msg = note(box);
    let ro = null, ang = 0, drift = 0, pos = 0, dirNut = 1;
    function build() {
      ctl.innerHTML = ""; roHost.innerHTML = "";
      const p = P[mode], S = (o) => HE.slider(ctl, Object.assign({ step: 1 }, o));
      if (mode === "belt") {
        S({ label: "Driver pulley diameter", min: 40, max: 200, step: 5, value: p.d1, unit: "mm", oninput: (v) => { p.d1 = v; upd(); } });
        S({ label: "Driven pulley diameter", min: 40, max: 400, step: 5, value: p.d2, unit: "mm", oninput: (v) => { p.d2 = v; upd(); } });
        S({ label: "Driver speed", min: 100, max: 3000, step: 20, value: p.n, unit: "rev/min", oninput: (v) => { p.n = v; upd(); } });
        S({ label: "Belt slip (a loss at the driven pulley)", min: 0, max: 10, step: 1, value: p.slip, unit: "%", oninput: (v) => { p.slip = v; upd(); } });
        ro = readouts(roHost, [["v", "belt speed v = πdn"], ["VR", "velocity ratio"], ["nout", "driven speed"], ["dir", "driven direction"]]);
        if (!row.querySelector(".mode-x")) { }
      } else if (mode === "chain") {
        S({ label: "Driver sprocket", min: 10, max: 40, value: p.t1, unit: "teeth", oninput: (v) => { p.t1 = v; upd(); } });
        S({ label: "Driven sprocket", min: 12, max: 60, value: p.t2, unit: "teeth", oninput: (v) => { p.t2 = v; upd(); } });
        S({ label: "Driver speed", min: 50, max: 1500, step: 10, value: p.n, unit: "rev/min", oninput: (v) => { p.n = v; upd(); } });
        ro = readouts(roHost, [["v", "chain speed (pitch 12.7 mm)"], ["VR", "velocity ratio"], ["nout", "driven speed"], ["dir", "driven direction"]]);
      } else if (mode === "rack") {
        S({ label: "Pinion <b>diameter</b>", min: 20, max: 120, step: 2, value: p.d, unit: "mm", oninput: (v) => { p.d = v; upd(); } });
        S({ label: "Pinion speed", min: 10, max: 300, step: 5, value: p.n, unit: "rev/min", oninput: (v) => { p.n = v; upd(); } });
        ro = readouts(roHost, [["v", "rack speed v = πdn"], ["vmm", "in mm/s"], ["t", "time for a 450 mm stroke"], ["dir", "rack moves"]]);
      } else if (mode === "worm") {
        S({ label: "Worm starts (threads)", min: 1, max: 4, value: p.starts, unit: "start" + "(s)", oninput: (v) => { p.starts = v; upd(); } });
        S({ label: "Teeth on the wheel", min: 20, max: 60, value: p.teeth, unit: "teeth", oninput: (v) => { p.teeth = v; upd(); } });
        S({ label: "Worm speed", min: 100, max: 3000, step: 50, value: p.n, unit: "rev/min", oninput: (v) => { p.n = v; upd(); } });
        ro = readouts(roHost, [["VR", "VR = teeth ÷ starts"], ["nout", "wheel speed"], ["T", "wheel torque (2 N m in, 40% efficient)"], ["dir", "back-driving"]]);
      } else {
        S({ label: "Pitch (lead) of the screw", min: 1, max: 10, step: 0.5, value: p.lead, unit: "mm", oninput: (v) => { p.lead = v; upd(); } });
        S({ label: "Screw speed", min: 30, max: 900, step: 10, value: p.n, unit: "rev/min", oninput: (v) => { p.n = v; upd(); } });
        ro = readouts(roHost, [["v", "nut speed = lead × n"], ["vmm", "in mm/s"], ["t", "time for 400 mm of travel"], ["dir", "load can back-drive?"]]);
      }
      row.innerHTML = ""; row.append(play);
      if (mode === "rack" || mode === "screw") { const fb = HE.el("button", { class: "btn small", type: "button" }, "⇄ Reverse the input"); fb.addEventListener("click", () => { p.flip = !p.flip; upd(); }); row.append(fb); }
      if (mode === "belt") { const fb = HE.el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "⤫ Cross the belt"); fb.addEventListener("click", () => { p.crossed = !p.crossed; fb.setAttribute("aria-pressed", p.crossed); fb.textContent = p.crossed ? "⤫ Belt is crossed (click to open it)" : "⤫ Cross the belt"; upd(); }); row.append(fb); }
    }
    function beltGeom(r1, r2, L, crossed) {
      const a = []; // returns path ops
      return null;
    }
    function drawBelt(ctx, C, s, chain) {
      const w = s.w, h = s.h, p = P[mode];
      let d1, d2, n1, rat, v;
      if (chain) { d1 = p.t1; d2 = p.t2; n1 = p.n; } else { d1 = p.d1; d2 = p.d2; n1 = p.n; }
      const slip = chain ? 0 : p.slip / 100, crossed = !chain && p.crossed;
      const dmax = Math.max(d1, d2);
      const sc = Math.min((w - 90) / (d1 + d2 + 60 * 0 + 2 * 0.5 * (d1 + d2) * 0 + 130) * 0, 1);
      // choose pixel radii: fit width w - 40 and height
      const maxR = Math.min(h * 0.36, (w - 70) / 4);
      const k = maxR / (dmax / 2);
      const r1 = Math.max(14, d1 / 2 * k), r2 = Math.max(14, d2 / 2 * k);
      const L = r1 + r2 + Math.max(50, Math.min(w * 0.22, w - 40 - 2 * (r1 + r2)));
      const x1 = (w - (L + r1 + r2)) / 2 + r1, x2 = x1 + L, cy = h * 0.5;
      const vis = visRev(n1);
      if (!chain) { /* belt */ }
      const w1 = TAU * vis, w2 = w1 * (r1 / r2) * (1 - slip) * (crossed ? -1 : 1);
      ctx.save();
      // belt path
      ctx.lineJoin = "round";
      const path = () => {
        ctx.beginPath();
        if (!crossed) {
          const ph = Math.asin((r1 - r2) / L), n1x = Math.sin(ph), n1y = -Math.cos(ph);
          ctx.moveTo(x1 + r1 * n1x, cy + r1 * n1y); ctx.lineTo(x2 + r2 * n1x, cy + r2 * n1y);
          ctx.arc(x2, cy, r2, -Math.PI / 2 + ph, Math.PI / 2 - ph, false);
          ctx.lineTo(x1 + r1 * n1x, cy - r1 * n1y);
          ctx.arc(x1, cy, r1, Math.PI / 2 - ph, 1.5 * Math.PI + ph, false);
        } else {
          const ps = Math.asin(clamp((r1 + r2) / L, -0.999, 0.999)), sx = Math.sin(ps), cc = Math.cos(ps);
          ctx.moveTo(x1 + r1 * sx, cy - r1 * cc); ctx.lineTo(x2 - r2 * sx, cy + r2 * cc);
          ctx.arc(x2, cy, r2, Math.PI / 2 + ps, -Math.PI / 2 - ps, true);
          ctx.lineTo(x1 + r1 * sx, cy + r1 * cc);
          ctx.arc(x1, cy, r1, Math.PI / 2 - ps, 1.5 * Math.PI - ps + 2 * ps - 0 * ps, false);
        }
      };
      path();
      if (chain) {
        ctx.strokeStyle = C.ink; ctx.lineWidth = 7; ctx.stroke();
        ctx.strokeStyle = C.sky; ctx.lineWidth = 4; ctx.setLineDash([9, 6]); ctx.lineDashOffset = -drift * (r1 * w1 / 60); ctx.stroke(); ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 6; ctx.stroke();
        ctx.strokeStyle = C.paper; ctx.lineWidth = 2; ctx.setLineDash([4, 12]); ctx.lineDashOffset = -drift * (r1 * w1 / 60); ctx.stroke(); ctx.setLineDash([]);
      }
      ctx.restore();
      // wheels
      const wheel = (cx, r, th, cnt, colr, name) => {
        ctx.save();
        if (chain) { gearPath(ctx, cnt, r, cx, cy, th); } else { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); }
        ctx.fillStyle = colr; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
        for (let q = 0; q < 3; q++) { const a = th + q * TAU / 3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a) * r * 0.8, cy + Math.sin(a) * r * 0.8); ctx.stroke(); }
        ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.restore();
      };
      wheel(x1, r1, ang * w1 / (TAU * vis) * 1, d1, C.lode, "driver");
      wheel(x2, r2, ang * w2 / (TAU * vis), d2, C.grass, "driven");
      HE.label(ctx, chain ? "driver " + p.t1 + "T" : "driver " + p.d1 + " mm", x1, cy + r1 + 16, { align: "center", bold: true, col: C.lode });
      HE.label(ctx, chain ? "driven " + p.t2 + "T" : "driven " + p.d2 + " mm", x2, cy + r2 + 16, { align: "center", bold: true, col: C.grass });
      curvedArrow(ctx, x1, cy, Math.max(8, r1 * 0.5), true, C.ink);
      curvedArrow(ctx, x2, cy, Math.max(8, r2 * 0.5), crossed ? false : true, C.ink);
      if (crossed) HE.label(ctx, "crossed belt: the driven pulley turns the opposite way", w / 2, 14, { align: "center", size: 12, col: C.ink2 });
      else HE.label(ctx, chain ? "chain and sprockets: no slip, same direction" : "open belt: same direction", w / 2, 14, { align: "center", size: 12, col: C.ink2 });
    }
    function drawRack(ctx, C, s) {
      const w = s.w, h = s.h, p = P.rack;
      const rp = clamp(p.d / 2 * 1.9, 30, 92);
      const cx = w * 0.5, cy = h * 0.58;
      const Np = Math.max(8, Math.round(p.d / 2)); // module 2 mm
      const phi = (ang * (p.flip ? -1 : 1));
      const pitch = rp * TAU / Np;
      const ropx = Math.min(rp, 80);
      // pinion tooth at the top when phi is a multiple of the tooth angle: rack gap centred there
      // teeth angle offset: tooth at top when (th + pi/2) % p == 0 => th = phi - pi/2
      const th = phi - Math.PI / 2;
      ctx.save();
      gearPath(ctx, Np, rp, cx, cy, th); ctx.fillStyle = C.lode; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(th) * rp * 0.7, cy + Math.sin(th) * rp * 0.7); ctx.stroke();
      // rack above the pinion: teeth point down
      const m = pitch / Math.PI, topY = cy - rp - m * 1 - 24, rootY = cy - rp - m * 1 + 0, baseY = topY;
      const yPitch = cy - rp, yTip = yPitch - 0 + 0, yRoot = yPitch - 1.25 * m;
      ctx.fillStyle = C.sky; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath();
      const off = (phi * rp) % pitch; // rack moves with +phi to the right
      const xs = -pitch * 2;
      ctx.moveTo(0, yRoot - 26); ctx.lineTo(w, yRoot - 26); ctx.lineTo(w, yRoot);
      for (let x = w + pitch; x >= -pitch; x -= pitch) {
        const xc = cx + pitch * 0.5 + off + Math.round((x - cx - off - pitch * 0.5) / pitch) * pitch; // snapped
        // draw tooth centred at xc
        ctx.lineTo(xc + pitch * 0.3, yRoot); ctx.lineTo(xc + pitch * 0.16, yPitch + m); ctx.lineTo(xc - pitch * 0.16, yPitch + m); ctx.lineTo(xc - pitch * 0.3, yRoot);
      }
      ctx.lineTo(0, yRoot); ctx.closePath();
      ctx.restore();
      // simpler, robust rack: draw each tooth as its own polygon
      ctx.save();
      ctx.fillStyle = C.sky; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.fillRect(0, yRoot - 26, w, 26); ctx.strokeRect(0, yRoot - 26, w, 26);
      const k0 = Math.floor((-off - pitch * 0.5 - cx) / pitch) - 1, k1 = Math.ceil((w - cx - off) / pitch) + 1;
      for (let k = k0; k <= k1; k++) {
        const xc = cx + off + pitch * (0.5 + k);
        if (xc < -pitch || xc > w + pitch) continue;
        ctx.beginPath(); ctx.moveTo(xc - pitch * 0.3, yRoot); ctx.lineTo(xc - pitch * 0.16, yPitch + m); ctx.lineTo(xc + pitch * 0.16, yPitch + m); ctx.lineTo(xc + pitch * 0.3, yRoot); ctx.closePath(); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
      // direction arrows
      const v = p.n / 60 * Math.PI * (p.d / 1000), sg = p.flip ? -1 : 1;
      HE.arrow(ctx, w / 2 - sg * 40, yRoot - 40, w / 2 + sg * 40, yRoot - 40, C.grass, 4, 12);
      HE.label(ctx, "rack: v = " + F(v, 3) + " m/s", w / 2, yRoot - 56, { align: "center", bold: true, col: C.grass });
      curvedArrow(ctx, cx, cy, Math.max(12, rp * 0.5), !p.flip, C.ink);
      HE.label(ctx, "pinion d = " + p.d + " mm", cx, cy + rp + 16, { align: "center", bold: true, col: C.lode });
    }
    function drawWorm(ctx, C, s) {
      const w = s.w, h = s.h, p = P.worm;
      const rw = Math.min(h * 0.33, w * 0.2), cx = w * 0.5, cy = h * 0.4;
      const Nw = p.teeth;
      const wheelAng = ang * p.starts / Nw;
      const pitch = rw * TAU / Nw;
      const wy = cy + rw + 4; // worm shaft below the wheel
      const wh = Math.max(16, rw * 0.28);
      ctx.save();
      // wheel (side view)
      gearPath(ctx, Math.min(Nw, 40), rw, cx, cy, wheelAng * Nw / Math.min(Nw, 40) + Math.PI / 2); ctx.fillStyle = C.grass; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fill(); ctx.stroke();
      ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(cx, cy, 8, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(wheelAng) * rw * 0.7, cy + Math.sin(wheelAng) * rw * 0.7); ctx.stroke();
      // worm: a cylinder with a helical thread (slanted lines that crawl along the axis)
      const x0 = cx - rw - 40 * 0 - 30, x1 = cx + rw + 30;
      ctx.fillStyle = C.sky; ctx.fillRect(x0, wy, x1 - x0, wh * 2); ctx.strokeRect(x0, wy, x1 - x0, wh * 2);
      ctx.save(); ctx.beginPath(); ctx.rect(x0, wy, x1 - x0, wh * 2); ctx.clip();
      ctx.strokeStyle = C.navy; ctx.lineWidth = 3;
      const lead = pitch * p.starts, phase = (ang / TAU) * lead; // axial crawl: one lead per revolution
      for (let st = 0; st < p.starts; st++) {
        for (let x = x0 - lead * 2; x < x1 + lead * 2; x += lead) {
          const xx = x + phase + st * pitch;
          ctx.beginPath(); ctx.moveTo(xx - wh * 0.7, wy + wh * 2); ctx.lineTo(xx + wh * 0.7, wy); ctx.stroke();
        }
      }
      ctx.restore();
      // shaft end
      ctx.fillStyle = C.ink2; ctx.fillRect(x0 - 18, wy + wh * 0.6, 18, wh * 0.8);
      ctx.restore();
      curvedArrow(ctx, cx, cy, rw * 0.5, true, C.ink);
      HE.label(ctx, "worm: " + p.starts + " start" + (p.starts > 1 ? "s" : "") + ", " + p.n + " rev/min →", x0, wy + wh * 2 + 16, { bold: true, col: C.lode, size: 12 });
      HE.label(ctx, "wheel " + Nw + "T", cx, cy - rw - 10, { align: "center", bold: true, col: C.grass });
      HE.label(ctx, "axes at 90°", w - 10, 14, { align: "right", size: 12, col: C.ink2 });
    }
    function drawScrew(ctx, C, s) {
      const w = s.w, h = s.h, p = P.screw;
      const x0 = 40, x1 = w - 40, cy = h * 0.5, hh = 22;
      const vis = visRev(p.n) * 0.7;
      const sg = p.flip ? -1 : 1;
      ctx.save();
      ctx.fillStyle = C.ink2; ctx.fillRect(10, cy - 8, 30, 16);
      ctx.fillStyle = C.sky; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.fillRect(x0, cy - hh, x1 - x0, hh * 2); ctx.strokeRect(x0, cy - hh, x1 - x0, hh * 2);
      const lead = p.lead * 5; // pixels per mm = 5 (so a 5 mm lead is 25 px)
      ctx.save(); ctx.beginPath(); ctx.rect(x0, cy - hh, x1 - x0, hh * 2); ctx.clip();
      ctx.strokeStyle = C.navy; ctx.lineWidth = 3;
      const phase = sg * (ang / TAU) * lead * 0 + sg * (ang / TAU) * lead;
      for (let x = x0 - lead * 2; x < x1 + lead * 2; x += lead) { const xx = x + (phase % lead + lead) % lead; ctx.beginPath(); ctx.moveTo(xx - 7, cy + hh); ctx.lineTo(xx + 7, cy - hh); ctx.stroke(); }
      ctx.restore();
      // the nut advances one lead per turn of the screw (bounces between the ends)
      const travel = x1 - x0 - 90, span = travel;
      const raw = sg * (ang / TAU) * lead; // pixels moved since start
      const m = ((raw % (2 * span)) + 2 * span) % (2 * span);
      const nx = x0 + 10 + (m < span ? m : 2 * span - m);
      ctx.fillStyle = C.lode; ctx.fillRect(nx, cy - hh - 14, 60, hh * 2 + 28); ctx.strokeRect(nx, cy - hh - 14, 60, hh * 2 + 28);
      HE.label(ctx, "nut", nx + 30, cy - hh - 26, { align: "center", bold: true, col: C.lode });
      ctx.restore();
      const v = p.lead * p.n / 60;
      curvedArrow(ctx, 25, cy, 12, sg > 0, C.ink);
      HE.label(ctx, "lead " + p.lead + " mm: the nut moves " + p.lead + " mm for each turn", w / 2, h - 18, { align: "center", size: 12, col: C.ink2 });
      HE.label(ctx, "v = " + F(v, 3) + " mm/s", w / 2, 18, { align: "center", bold: true, col: C.grass });
    }
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.58, 250, 320)),
      draw(ctx, t, dt, C, s) {
        const p = P[mode];
        const nIn = mode === "worm" || mode === "screw" || mode === "rack" || mode === "chain" || mode === "belt" ? p.n : 100;
        if (dt) { ang += TAU * visRev(mode === "screw" ? p.n : nIn) * dt * (mode === "screw" ? 0.7 : 1); drift += dt; }
        if (mode === "belt") drawBelt(ctx, C, s, false);
        else if (mode === "chain") drawBelt(ctx, C, s, true);
        else if (mode === "rack") drawRack(ctx, C, s);
        else if (mode === "worm") drawWorm(ctx, C, s);
        else drawScrew(ctx, C, s);
      },
    });
    const play = HE.playButton(sim, ["▶ Run", "❚❚ Pause"]);
    function upd() {
      const p = P[mode]; let m;
      if (mode === "belt") {
        const v = Math.PI * (p.d1 / 1000) * (p.n / 60), VR = p.d2 / p.d1 / (1 - p.slip / 100);
        const nout = p.n * p.d1 / p.d2 * (1 - p.slip / 100);
        ro.set("v", F(v, 3) + " m/s"); ro.set("VR", F(VR, 3)); ro.set("nout", rpmText(nout)); ro.set("dir", p.crossed ? "opposite" : "same");
        m = `$v = \\pi d n = \\pi \\times ${F(p.d1 / 1000, 3)} \\times ${F(p.n / 60, 4)} = ${F(v, 3)}$ m/s. Input size × input speed = output size × output speed, so ${p.d1} × ${p.n} = ${p.d2} × n gives ${F(p.n * p.d1 / p.d2, 4)} rev/min with no slip` + (p.slip ? `; with ${p.slip}% slip the driven pulley loses speed: <b>${rpmText(nout)}</b>. Slip is why a belt cannot give an exact ratio.` : ". Add some slip with the slider and watch the ratio drift.");
      } else if (mode === "chain") {
        const pitchM = 0.0127, v = p.t1 * pitchM * (p.n / 60), nout = p.n * p.t1 / p.t2;
        ro.set("v", F(v, 3) + " m/s"); ro.set("VR", F(p.t2 / p.t1, 3)); ro.set("nout", rpmText(nout)); ro.set("dir", "same");
        m = `Teeth stand in for size: ${p.t1} × ${p.n} = ${p.t2} × n gives <b>${rpmText(nout)}</b>. Each revolution pulls ${p.t1} links, so the chain moves ${p.t1} × 12.7 mm × ${F(p.n / 60, 4)} rev/s = ${F(v, 3)} m/s. A chain cannot slip, so the ratio is exact.`;
      } else if (mode === "rack") {
        const v = Math.PI * (p.d / 1000) * (p.n / 60);
        ro.set("v", F(v, 3) + " m/s"); ro.set("vmm", F(v * 1000, 3) + " mm/s"); ro.set("t", F(0.45 / v, 3) + " s"); ro.set("dir", p.flip ? "to the left" : "to the right");
        m = `One turn of the pinion moves the rack one pinion circumference, $C = \\pi d = ${F(Math.PI * p.d, 4)}$ mm. So $v = \\pi d n = \\pi \\times ${F(p.d / 1000, 3)} \\times ${F(p.n / 60, 4)} = ${F(v, 3)}$ m/s. Use the <b>diameter</b> (or twice the radius) and n in rev/s.`;
      } else if (mode === "worm") {
        const VR = p.teeth / p.starts, nout = p.n / VR, T = 2 * VR * 0.4;
        ro.set("VR", F(VR, 3)); ro.set("nout", rpmText(nout)); ro.set("T", F(T, 3) + " N m"); ro.set("dir", "wheel cannot drive the worm (usually)");
        m = `One turn of a ${p.starts}-start worm moves the wheel on by ${p.starts} tooth${p.starts > 1 ? "s" : ""}. $\\text{VR} = \\dfrac{${p.teeth}}{${p.starts}} = ${F(VR, 3)}$, so the wheel turns at ${p.n} ÷ ${F(VR, 3)} = <b>${rpmText(nout)}</b>. A single stage gives a huge reduction at 90°. Efficiency is low (the thread slides), so only part of the torque gain survives.`;
      } else {
        const v = p.lead * (p.n / 60);
        ro.set("v", F(v, 3) + " mm/s"); ro.set("vmm", F(v * 60, 3) + " mm/min"); ro.set("t", F(400 / v, 3) + " s"); ro.set("dir", "usually not with a shallow thread (steep leads and ball screws can back-drive)");
        m = `The nut advances one <b>lead</b> (here the pitch of a single-start thread, ${p.lead} mm) per turn: ${p.lead} mm × ${F(p.n / 60, 4)} rev/s = ${F(v, 3)} mm/s. Reverse the screw and the nut reverses.`;
      }
      msg.innerHTML = m; HE.math(msg); sim.redraw();
    }
    build(); upd();
  });

  /* ================================================================
     4. Which drive? A requirements-to-drive chooser
     ================================================================ */
  mount("w-select", (box) => {
    const drives = ["Flat belt", "V-belt", "Toothed belt", "Chain & sprocket", "Spur gears", "Rack & pinion", "Worm & wheel", "Worm & nut"];
    const reqs = [
      ["No slip: an exact speed ratio (timing)", [0, 0, 2, 2, 2, 2, 2, 2]],
      ["Shafts a long way apart", [2, 2, 2, 2, 0, 1, 0, 1]],
      ["Slip should protect the machine from overload", [2, 2, 0, 0, 0, 0, 0, 0]],
      ["A very large speed reduction in one stage", [0, 0, 0, 1, 1, 0, 2, 1]],
      ["Shafts at 90° to each other", [0, 0, 0, 0, 0, 0, 2, 0]],
      ["Turn rotation into straight-line motion", [0, 0, 0, 0, 0, 2, 0, 2]],
      ["Must hold the load without back-driving", [0, 0, 0, 0, 0, 0, 2, 2]],
      ["Quiet, cheap and no lubrication", [2, 2, 1, 0, 0, 0, 1, 1]],
      ["High power in a compact space", [0, 1, 1, 2, 2, 2, 1, 1]],
      ["The load must be able to drive the input", [2, 2, 2, 2, 2, 2, 0, 0]],
    ];
    const why = [
      "A flat belt grips by friction only, so it slips: cheap and quiet, but never exact.",
      "A V-belt wedges into its groove: more grip than a flat belt, still some slip.",
      "Teeth mesh with the pulley, so it cannot slip: timing belts are used where the ratio must be exact.",
      "A chain meshes with sprocket teeth: no slip, strong, and good over longer distances (it needs lubrication and is noisier).",
      "Gears mesh directly: strong and exact, but the shafts must be close together.",
      "Rack and pinion turns rotation into a straight line (and back again) with an exact relationship.",
      "Worm and wheel: a big reduction in one stage, shafts at 90°, and usually non-reversible, so it holds a load.",
      "Worm and nut (lead screw): slow, strong, precise straight-line motion that usually holds the load with a shallow thread.",
    ];
    box.append(HE.el("p", { class: "hint" }, "Tick the requirements of the job. Each drive scores 0, 1 or 2 per requirement (2 = a natural fit). This is a teaching guide, not a rule: the exam will tell you what the drive must do."));
    const grid = HE.el("div", { class: "mec-req", role: "group", "aria-label": "Requirements" });
    const checks = reqs.map(([t], i) => { const cb = HE.el("input", { type: "checkbox", id: "mecreq" + i }); cb.addEventListener("change", upd); grid.append(HE.el("label", { for: "mecreq" + i }, cb, t)); return cb; });
    const out = HE.el("div", { "aria-live": "polite" }); const msg = HE.el("p", { class: "mec-why" });
    const presets = HE.el("div", { class: "btn-row" });
    const pre = (name, idx) => { const b = HE.el("button", { class: "btn small", type: "button" }, name); b.addEventListener("click", () => { checks.forEach((c, i) => (c.checked = idx.includes(i))); upd(); }); presets.append(b); };
    pre("The great wheel's steering gear", [3, 4, 6]); pre("A printer's paper feed", [0, 7]); pre("A hand-cranked drawbridge", [3, 6, 8]); pre("A lathe's carriage", [0, 5, 6]); pre("A cheap fan drive", [2, 7]);
    const clear = HE.el("button", { class: "btn small", type: "button" }, "↺ Clear"); clear.addEventListener("click", () => { checks.forEach((c) => (c.checked = false)); upd(); }); presets.append(clear);
    box.append(grid, presets, out, msg);
    function upd() {
      const sel = reqs.map((r, i) => (checks[i].checked ? i : -1)).filter((i) => i >= 0);
      out.innerHTML = "";
      if (!sel.length) { msg.textContent = "Tick at least one requirement to see the ranking."; return; }
      const sc = drives.map((d, j) => ({ d, j, s: sel.reduce((a, i) => a + reqs[i][1][j], 0) }));
      const max = sel.length * 2, best = Math.max(...sc.map((x) => x.s));
      sc.sort((a, b) => b.s - a.s).forEach((x) => out.append(HE.el("div", { class: "mec-rank" + (x.s === best ? " top" : "") }, HE.el("span", null, x.d), HE.el("div", { class: "bar" }, HE.el("i", { style: `width:${(x.s / max) * 100}%` })), HE.el("b", null, String(x.s)))));
      const tops = sc.filter((x) => x.s === best);
      msg.innerHTML = "<b>Best fit: " + tops.map((x) => x.d).join(" or ") + ".</b> " + tops.map((x) => why[x.j]).join(" ") + (best === 0 ? " Nothing here is a natural fit: relax a requirement." : "");
    }
    upd();
  });

  /* ================================================================
     5. Brake: kinetic energy becomes heat in the disc
     ================================================================ */
  mount("w-brake", (box) => {
    let m = 1200, v = 15, md = 3, nd = 4, applying = false, omega = 1, temp = 0, ang = 0;
    const cv = canvasIn(box, "A rotating brake disc. Press apply brake: the disc slows and glows hotter as the kinetic energy of the vehicle is turned into heat in the disc. Sliders set the vehicle mass, speed, and disc mass.");
    const ctl = controls(box);
    HE.slider(ctl, { label: "Vehicle (or load) mass $m$", min: 200, max: 3000, step: 50, value: m, unit: "kg", oninput: (x) => { m = x; reset(); } });
    HE.slider(ctl, { label: "Speed $v$", min: 2, max: 30, step: 1, value: v, unit: "m/s", oninput: (x) => { v = x; reset(); } });
    HE.slider(ctl, { label: "Mass of ONE brake disc", min: 1, max: 10, step: 0.5, value: md, unit: "kg", oninput: (x) => { md = x; reset(); } });
    HE.slider(ctl, { label: "Number of discs sharing the energy", min: 1, max: 4, step: 1, value: nd, oninput: (x) => { nd = x; reset(); } });
    const row = HE.el("div", { class: "btn-row" });
    const apply = HE.el("button", { class: "btn small primary", type: "button" }, "Apply the brake");
    const rs = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    row.append(apply, rs); box.append(row);
    const ro = readouts(box, [["Ek", "kinetic energy ½mv²"], ["Eh", "heat per disc"], ["dT", "temperature rise ΔT"], ["T", "disc temperature (start 20 °C)"]]);
    const msg = note(box);
    const c = 490;
    const Ek = () => 0.5 * m * v * v;
    const dTfull = () => Ek() / nd / (c * md);
    function reset() { applying = false; omega = 1; temp = 0; apply.textContent = "Apply the brake"; upd(); }
    function upd() {
      const E = Ek(), dT = dTfull();
      ro.set("Ek", F(E, 3) + " J"); ro.set("Eh", F(E / nd, 3) + " J"); ro.set("dT", F(dT, 3) + " K"); ro.set("T", F(20 + dT, 3) + " °C");
      msg.innerHTML = `$E_k = \\tfrac12 m v^2 = \\tfrac12 \\times ${m} \\times ${v}^2 = ${F(E, 4)}$ J. Shared by ${nd} disc${nd > 1 ? "s" : ""}, each takes ${F(E / nd, 4)} J. $E_h = c\\,m\\,\\Delta T$ so $\\Delta T = \\dfrac{${F(E / nd, 4)}}{${c} \\times ${md}} = ${F(dT, 3)}$ K. (Model: all the energy ends up in the discs; $c = ${c}$ J kg⁻¹ K⁻¹ for steel: an exam would give this value.)`;
      HE.math(msg); sim.redraw();
    }
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.5, 230, 290)),
      draw(ctx, t, dt, C, s) {
        const w = s.w, h = s.h;
        if (dt && applying) { omega = Math.max(0, omega - dt / 4); temp = 1 - omega; if (omega === 0) { applying = false; apply.textContent = "Brake applied: reset to repeat"; } }
        if (dt) ang += TAU * (0.15 + 0.85 * omega) * 1.3 * dt * (omega > 0 ? 1 : 0);
        const dT = dTfull(), cx = w * 0.4, cy = h * 0.5, R = Math.min(h * 0.38, w * 0.26);
        const tNow = temp * dT; // °C above ambient
        // colour: grey steel -> dull red -> orange -> yellow-white
        const q = clamp(tNow / 500, 0, 1);
        const hot = (a) => `rgb(${Math.round(140 + 115 * a)},${Math.round(145 - 60 * a + (a > 0.7 ? (a - 0.7) * 300 : 0))},${Math.round(155 - 130 * a)})`;
        ctx.save();
        ctx.fillStyle = hot(q); ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.paper2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        for (let k = 0; k < 10; k++) { const a = ang + k * TAU / 10; ctx.fillStyle = C.paper; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * R * 0.62, cy + Math.sin(a) * R * 0.62, R * 0.09, 0, TAU); ctx.fill(); ctx.stroke(); }
        // caliper
        ctx.fillStyle = C.navy; const squeeze = applying || omega < 1 ? 7 : 0;
        ctx.fillRect(cx + R - 18, cy - 28, 14 + (squeeze ? 3 : 0), 56); ctx.fillStyle = C.red; ctx.fillRect(cx + R - 18 + 14 - 3, cy - 24, 5, 48);
        ctx.restore();
        HE.label(ctx, "brake disc: 20 °C → " + F(20 + tNow, 3) + " °C", cx, cy + R + 18, { align: "center", bold: true, col: C.ink });
        // thermometer
        const tx = w * 0.82, ty0 = 24, ty1 = h - 30, frac = clamp(tNow / Math.max(dT, 1), 0, 1);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(tx - 9, ty0, 18, ty1 - ty0);
        ctx.fillStyle = C.red; ctx.fillRect(tx - 7, ty1 - (ty1 - ty0 - 4) * frac - 2, 14, (ty1 - ty0 - 4) * frac);
        HE.label(ctx, "ΔT = " + F(tNow, 3) + " K", tx, ty1 + 16, { align: "center", size: 12, col: C.ink, bold: true });
        HE.label(ctx, "wheel speed " + F(omega * v, 3) + " m/s", 10, 14, { size: 12, col: C.ink2 });
        if (20 + dT > 500) HE.label(ctx, "very hot: real brakes fade at high temperature", cx, 14, { align: "center", size: 12, col: C.red });
      },
    });
    apply.addEventListener("click", () => { if (omega <= 0) return; applying = true; apply.textContent = "Braking…"; sim.play(); });
    rs.addEventListener("click", reset);
    upd();
  });

  /* ================================================================
     6. Clutch: slip, then lock
     ================================================================ */
  mount("w-clutch", (box) => {
    const cv = canvasIn(box, "A friction clutch. The input plate turns at a steady speed; press engage to clamp the output plate against it. The output plate slips while it speeds up and locks when it reaches the input speed, unless the load torque is bigger than the friction can carry.");
    let Fc = 1500, TL = 40, mu = 0.3, st = { wi: 150, wo: 0, locked: false, engaged: false, a1: 0, a2: 0, heat: 0 };
    const rm = 0.08, J = 0.25;
    const ctl = controls(box);
    HE.slider(ctl, { label: "Clamping force $F$", min: 200, max: 4000, step: 100, value: Fc, unit: "N", oninput: (v) => { Fc = v; upd(); } });
    HE.slider(ctl, { label: "Load torque on the output shaft", min: 0, max: 200, step: 5, value: TL, unit: "N m", oninput: (v) => { TL = v; upd(); } });
    HE.slider(ctl, { label: "Friction coefficient $\\mu$ of the linings", min: 0.1, max: 0.5, step: 0.05, value: mu, fmt: (v) => N(v, 2), oninput: (v) => { mu = v; upd(); } });
    const row = HE.el("div", { class: "btn-row" });
    const eng = HE.el("button", { class: "btn small primary", type: "button" }, "Engage the clutch");
    const rs = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    row.append(eng, rs); box.append(row);
    const ro = readouts(box, [["cap", "torque the friction can carry"], ["state", "state"], ["slip", "slip speed"], ["heat", "heat made in slipping"]]);
    const msg = note(box);
    const cap = () => 2 * mu * Fc * rm; // two friction faces on a lined plate; model only
    function upd() {
      msg.innerHTML = `Model (not a Data Booklet formula): torque capacity ≈ 2 × μ × F × r = 2 × ${N(mu, 2)} × ${Fc} × ${rm} = <b>${F(cap(), 3)} N m</b> for a lined plate with two friction faces. The load needs ${TL} N m. ${cap() > TL ? "Friction can carry it, so the plates slip while the output speeds up, then <b>lock</b>." : "Friction cannot carry the load, so the clutch <b>keeps slipping</b> and the linings get hot."}`;
      HE.math(msg); paintRo(); sim.redraw();
    }
    function paintRo() {
      ro.set("cap", F(cap(), 3) + " N m");
      ro.set("state", !st.engaged ? "disengaged" : st.locked ? "locked: turns as one" : "slipping");
      ro.set("slip", F(Math.max(0, st.wi - st.wo) * 60 / TAU, 3) + " rev/min");
      ro.set("heat", F(st.heat, 3) + " J");
    }
    function reset() { st = { wi: 150, wo: 0, locked: false, engaged: false, a1: 0, a2: 0, heat: 0 }; eng.textContent = "Engage the clutch"; upd(); }
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.5, 220, 280)),
      draw(ctx, t, dt, C, s) {
        const w = s.w, h = s.h;
        if (dt && st.engaged) {
          const c = cap();
          if (st.locked) { if (TL > c) st.locked = false; st.wo = st.wi; }
          else {
            const slipT = c, net = slipT - TL; // kinetic friction torque c while slipping
            const dw = st.wi - st.wo;
            const acc = net / J;
            const old = st.wo;
            st.wo = Math.max(0, st.wo + acc * dt);
            st.heat += slipT * dw * dt;
            if (st.wo >= st.wi - 0.5 && net > 0) { st.wo = st.wi; st.locked = true; }
          }
        }
        if (dt) { st.a1 += st.wi * dt * 0.2; st.a2 += st.wo * dt * 0.2; paintRo(); }
        const cy = h * 0.5, x1 = w * 0.25, x2 = w * 0.62, R = Math.min(h * 0.36, w * 0.14);
        const gap = st.engaged ? 0 : 22;
        const plate = (cx, a, colr, lab, off) => {
          ctx.save(); ctx.translate(cx + off, cy); ctx.rotate(a);
          ctx.fillStyle = colr; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.ellipse(0, 0, R * 0.32, R, 0, 0, TAU); ctx.fill(); ctx.stroke();
          ctx.restore();
        };
        // shafts
        ctx.fillStyle = C.ink2; ctx.fillRect(10, cy - 8, x1 - 10, 16); ctx.fillRect(x2, cy - 8, w - x2 - 10, 16);
        // drawn as discs viewed face-on, alongside, with an edge view between
        const fcx = (w - 2 * (R + 4)) / 2;
        ctx.restore && 0;
        // edge view: two plates
        ctx.fillStyle = C.lode; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.fillRect(x1 + 10, cy - R, 16, 2 * R); ctx.strokeRect(x1 + 10, cy - R, 16, 2 * R);
        ctx.fillStyle = C.grass; const ox = x1 + 26 + gap;
        ctx.fillRect(ox, cy - R, 16, 2 * R); ctx.strokeRect(ox, cy - R, 16, 2 * R);
        // lining
        ctx.fillStyle = C.dirt; ctx.fillRect(x1 + 26, cy - R + 3, 6, 2 * R - 6); ctx.fillRect(ox - 6 + (gap ? 0 : -0), cy - R + 3, 0, 0);
        // marks that show each plate's turning (spokes seen from the end)
        const spokes = (cx, a, col) => { ctx.strokeStyle = col; ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { const th = a + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(th) * R * 0.8, cy + Math.sin(th) * R * 0.8); ctx.stroke(); } ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R * 0.8, 0, TAU); ctx.stroke(); };
        const fx1 = w * 0.78 - 0, fy = h * 0.5;
        // end-on pair of discs on the right so the turning is visible
        const ex1 = w * 0.74, ex2 = w * 0.89;
        ctx.save(); ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(ex1, fy - 0, R * 0.62, 0, TAU); ctx.fill(); ctx.restore();
        ctx.save(); ctx.beginPath(); ctx.arc(ex1, fy, R * 0.62, 0, TAU); ctx.clip(); ctx.restore();
        const dsc = (cx, a, col) => { ctx.fillStyle = C.card; ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, R * 0.45, 0, TAU); ctx.fill(); ctx.stroke(); ctx.lineWidth = 3; for (let k = 0; k < 4; k++) { const th = a + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(th) * R * 0.45, cy + Math.sin(th) * R * 0.45); ctx.stroke(); } };
        dsc(ex1 - 0, st.a1, C.lode); dsc(ex2 + 0, st.a2, C.grass);
        HE.label(ctx, "input plate", x1 + 16, cy - R - 14, { align: "right", size: 13, bold: true, col: C.lode });
        HE.label(ctx, "output plate", ox - 2, cy - R - 14, { align: "left", size: 13, bold: true, col: C.grass });
        HE.label(ctx, F(st.wi * 60 / TAU, 3), ex1, cy + R * 0.45 + 16, { align: "center", size: 13, col: C.lode });
        HE.label(ctx, F(st.wo * 60 / TAU, 3), ex2, cy + R * 0.45 + 16, { align: "center", size: 13, col: C.grass });
        HE.label(ctx, "rev/min", (ex1 + ex2) / 2, cy + R * 0.45 + 32, { align: "center", size: 13, col: C.ink2 });
        HE.label(ctx, !st.engaged ? "disengaged: output stationary" : st.locked ? "LOCKED: both plates at one speed" : "SLIPPING: friction drags the output up to speed", w / 2, 14, { align: "center", bold: true, size: 13, col: st.locked ? C.grass : C.red });
        // heat glow on lining when slipping
        if (st.engaged && !st.locked) { ctx.fillStyle = "rgba(255,120,30,.55)"; ctx.fillRect(x1 + 24, cy - R + 3, 4, 2 * R - 6); }
      },
    });
    eng.addEventListener("click", () => { st.engaged = !st.engaged; if (!st.engaged) { st.locked = false; } eng.textContent = st.engaged ? "Disengage the clutch" : "Engage the clutch"; sim.play(); upd(); });
    rs.addEventListener("click", reset);
    HE.el; upd();
    // the output plate coasts to rest when disengaged
    const coast = setInterval(() => { if (!st.engaged && st.wo > 0) { st.wo = Math.max(0, st.wo - 6); sim.redraw(); } }, 80);
  });

  /* ================================================================
     7. Cylinder force calculator
     ================================================================ */
  mount("w-cyl", (box) => {
    let D = 50, d = 20, bar = 6, loadN = 600, dir = "out", pos = 0, target = 0, moving = false;
    const cv = canvasIn(box, "A double-acting pneumatic cylinder with a pressure gauge. Choose the bore, rod diameter and pressure; the piston strokes out or in, and read-outs give the area, force on outstroke and on instroke.");
    HE.choice(box, "Stroke", [["out", "Outstroke (cap end pressurised)"], ["in", "Instroke (rod end pressurised)"]], dir, (v) => { dir = v; upd(); });
    const ctl = controls(box);
    HE.slider(ctl, { label: "Bore (piston) diameter $D$", min: 16, max: 100, step: 2, value: D, unit: "mm", oninput: (v) => { D = v; d = Math.min(d, D - 4); upd(); } });
    HE.slider(ctl, { label: "Piston rod diameter $d$", min: 6, max: 40, step: 2, value: d, unit: "mm", oninput: (v) => { d = Math.min(v, D - 4); upd(); } });
    HE.slider(ctl, { label: "Gauge pressure", min: 1, max: 10, step: 0.5, value: bar, unit: "bar", oninput: (v) => { bar = v; upd(); } });
    HE.slider(ctl, { label: "Load to move (incl. friction)", min: 0, max: 5000, step: 50, value: loadN, unit: "N", oninput: (v) => { loadN = v; upd(); } });
    const row = HE.el("div", { class: "btn-row" });
    const go = HE.el("button", { class: "btn small primary", type: "button" }, "▶ Stroke");
    const back = HE.el("button", { class: "btn small", type: "button" }, "↺ Retract");
    row.append(go, back); box.append(row);
    const ro = readouts(box, [["P", "pressure P (N/m²)"], ["Ao", "area A on outstroke"], ["Ai", "annular area on instroke"], ["Fo", "force, outstroke"], ["Fi", "force, instroke"], ["res", "this stroke"]]);
    const msg = note(box);
    const calc = () => {
      const P = bar * 1e5, Ao = Math.PI * (D / 1000) ** 2 / 4, Aa = Math.PI * ((D / 1000) ** 2 - (d / 1000) ** 2) / 4;
      return { P, Ao, Aa, Fo: P * Ao, Fi: P * Aa };
    };
    function upd() {
      const c = calc(), Fs = dir === "out" ? c.Fo : c.Fi, ok = Fs > loadN;
      ro.set("P", F(c.P, 3)); ro.set("Ao", F(c.Ao * 1e6, 4) + " mm²"); ro.set("Ai", F(c.Aa * 1e6, 4) + " mm²");
      ro.set("Fo", F(c.Fo, 4) + " N"); ro.set("Fi", F(c.Fi, 4) + " N"); ro.set("res", ok ? "moves the load" : "STALLS: force too small");
      msg.innerHTML = `$P = ${F(c.P, 3)}$ N/m² (${bar} bar = ${bar} × 100 000 Pa). Outstroke: $A = \\pi D^2/4 = ${F(c.Ao * 1e6, 4)}$ mm², so $F = PA = ${F(c.Fo, 4)}$ N. Instroke: the rod takes up room, so $A = \\pi (D^2 - d^2)/4 = ${F(c.Aa * 1e6, 4)}$ mm² and $F = ${F(c.Fi, 4)}$ N: <b>${F((c.Fo - c.Fi) / c.Fo * 100, 3)}% weaker</b> than on the outstroke.`;
      HE.math(msg); sim.redraw();
      if (!ok) { moving = false; }
    }
    go.addEventListener("click", () => { const c = calc(), Fs = dir === "out" ? c.Fo : c.Fi; if (Fs > loadN) { target = dir === "out" ? 1 : 0; moving = true; sim.play(); } else { moving = false; } upd(); });
    back.addEventListener("click", () => { target = 0; moving = true; pos = pos; sim.play(); });
    const sim = HE.sim(cv, {
      height: (w) => Math.round(clamp(w * 0.48, 220, 270)),
      draw(ctx, t, dt, C, s) {
        const w = s.w, h = s.h;
        if (dt && moving) { const dpos = dt * 0.35; if (Math.abs(target - pos) <= dpos) { pos = target; moving = false; } else pos += Math.sign(target - pos) * dpos; }
        const bx = 24, bw = Math.round((w - 120) / 2), by = h * 0.36, bh = 54, c = calc();
        const outP = dir === "out", pushing = moving ? (target > pos ? true : false) : false;
        const px = bx + 8 + pos * (bw - 24);
        // chambers
        const capP = (dir === "out" || (moving && target > pos)) && !(moving && target < pos);
        const capOn = moving ? target > pos : dir === "out", rodOn = moving ? target < pos : dir === "in";
        ctx.save();
        ctx.fillStyle = C.sea + "55";
        if (capOn || (!moving && dir === "out")) ctx.fillRect(bx, by, px - bx, bh);
        if (rodOn || (!moving && dir === "in")) ctx.fillRect(px + 8, by, bx + bw - px - 8, bh);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = C.ink2; ctx.fillRect(px, by + 2, 8, bh - 4);
        const rodTip = bx + bw + 30 + pos * (bw - 24);
        ctx.fillStyle = C.muted; ctx.fillRect(px + 8, by + bh / 2 - 6, rodTip - px - 8, 12); ctx.strokeRect(px + 8, by + bh / 2 - 6, rodTip - px - 8, 12);
        // load block on rod tip
        const lx = rodTip; ctx.fillStyle = C.dirt; ctx.fillRect(lx, by + bh / 2 - 18, 24, 36); ctx.strokeRect(lx, by + bh / 2 - 18, 24, 36);
        ctx.restore();
        // ports and airflow
        ctx.strokeStyle = C.sea; ctx.lineWidth = 4;
        const capPort = bx + 12, rodPort = bx + bw - 12;
        ctx.beginPath(); ctx.moveTo(capPort, by + bh); ctx.lineTo(capPort, by + bh + 28); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(rodPort, by + bh); ctx.lineTo(rodPort, by + bh + 28); ctx.stroke();
        ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.setLineDash([4, 4]);
        const flowY = by + bh + 28;
        ctx.restore;
        ctx.setLineDash([]);
        const pressured = dir === "out" ? capPort : rodPort, vented = dir === "out" ? rodPort : capPort;
        ctx.strokeStyle = C.sea; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(pressured, flowY); ctx.lineTo(pressured, flowY + 14); ctx.stroke();
        HE.label(ctx, "air in", pressured, flowY + 28, { align: "center", size: 12, col: C.sea, bold: true });
        HE.label(ctx, "exhaust", vented, flowY + 28, { align: "center", size: 12, col: C.muted });
        // moving air dots
        const n = 5;
        if (moving || s.playing) for (let k = 0; k < n; k++) { const f = ((t * 1.2 + k / n) % 1); ctx.fillStyle = C.sea; ctx.beginPath(); ctx.arc(pressured, flowY + 14 - f * 38 + 18 - 18, 3, 0, TAU); ctx.fill(); }
        // area labels
        HE.label(ctx, dir === "out" ? "area on this side: A = πD²/4" : "area on this side: π(D² − d²)/4", bx + bw / 2, by - 12, { align: "center", size: 12, col: C.ink2 });
        // pressure gauge
        const gx = w - 56, gy = h * 0.2 + 6, gr = 34;
        ctx.save();
        ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(gx, gy, gr, 0, TAU); ctx.fill(); ctx.stroke();
        for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + k / 10 * Math.PI * 1.5; ctx.strokeStyle = C.ink2; ctx.lineWidth = k % 5 === 0 ? 2.4 : 1.2; ctx.beginPath(); ctx.moveTo(gx + Math.cos(a) * (gr - 4), gy + Math.sin(a) * (gr - 4)); ctx.lineTo(gx + Math.cos(a) * (gr - (k % 5 === 0 ? 11 : 8)), gy + Math.sin(a) * (gr - (k % 5 === 0 ? 11 : 8))); ctx.stroke(); }
        const na = Math.PI * 0.75 + (bar / 10) * Math.PI * 1.5;
        ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(na) * (gr - 8), gy + Math.sin(na) * (gr - 8)); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(gx, gy, 3, 0, TAU); ctx.fill();
        ctx.restore();
        HE.label(ctx, bar + " bar", gx, gy + gr + 14, { align: "center", size: 12, bold: true, col: C.ink });
        // force arrow
        const Fs = dir === "out" ? c.Fo : c.Fi, okk = Fs > loadN;
        HE.label(ctx, "F = " + F(Fs, 4) + " N " + (okk ? "(> load " + loadN + " N)" : "(< load " + loadN + " N: stalls)"), 10, h - 14, { size: 13, bold: true, col: okk ? C.grass : C.red });
      },
    });
    upd();
  });

  /* ================================================================
     ISO-style pneumatic symbol library (SVG).
     Boxes are SZ x SZ. A 5/2 or 3/2 valve is two boxes side by side; the box that sits over the port
     stubs is the box "in operation". In the simulators the pair of boxes slides, as a real spool does.
     ================================================================ */
  const SZ = 46;
  const sv = HE.svg;
  const pth = (d, cls) => sv("path", { d, class: "ln " + (cls || "") });
  const txt = (x, y, t, cls, anchor) => sv("text", { x, y, class: "sy-t " + (cls || ""), "text-anchor": anchor || "middle", text: t });
  function head(x, y, a, cls, len = 7) {
    const p = (da) => `${(x - len * Math.cos(a + da)).toFixed(1)},${(y - len * Math.sin(a + da)).toFixed(1)}`;
    return sv("polygon", { points: `${x.toFixed(1)},${y.toFixed(1)} ${p(0.42)} ${p(-0.42)}`, class: "pth hd " + cls });
  }
  /* a flow path inside a box with an arrow head; returns the elements so they can be coloured */
  function flow(parent, x1, y1, x2, y2, cls) {
    const l = sv("path", { d: `M${x1} ${y1} L${x2} ${y2}`, class: "pth " + cls });
    const h = head(x2, y2, Math.atan2(y2 - y1, x2 - x1), cls);
    parent.append(l, h);
    return [l, h];
  }
  function block(parent, x, y) { // a closed port: T-shaped stop
    const e = sv("path", { d: `M${x} ${y} v${y > SZ / 2 ? -9 : 9} m-5 0 h10`, class: "pth blk" });
    parent.append(e);
    return e;
  }
  /* actuator glyphs: kind at box edge xe, mid-height ym, side -1 (left) / +1 (right). returns { g, w, coil } */
  function actuator(kind, xe, ym, side, label) {
    const g = sv("g"), s = side;
    let w = 20, coil = null;
    if (kind === "pilot") { g.append(pth(`M${xe} ${ym} H${xe + s * 26}`, "dash thin")); g.append(sv("polygon", { points: `${xe},${ym} ${xe + s * 9},${ym - 5} ${xe + s * 9},${ym + 5}`, class: "fillink" })); w = 26; }
    else if (kind === "push") { g.append(pth(`M${xe} ${ym} h${s * 8} M${xe + s * 8} ${ym - 9} v18 M${xe + s * 8} ${ym - 9} h${s * 7} M${xe + s * 8} ${ym + 9} h${s * 7}`)); w = 16; }
    else if (kind === "roller") { g.append(pth(`M${xe} ${ym} h${s * 8}`)); g.append(sv("circle", { cx: xe + s * 13, cy: ym, r: 5, class: "ln fillc" })); g.append(sv("circle", { cx: xe + s * 13, cy: ym, r: 1.3, class: "fillink" })); w = 20; }
    else if (kind === "lever") { g.append(pth(`M${xe} ${ym} h${s * 8} M${xe + s * 8} ${ym - 9} v18 M${xe + s * 8} ${ym + 9} l${s * 9} ${-14}`)); w = 18; }
    else if (kind === "spring") { let d = `M${xe} ${ym}`; for (let i = 0; i < 6; i++) d += ` L${xe + s * (3 + i * 3.6)} ${ym + (i % 2 ? 6 : -6)}`; d += ` L${xe + s * 25} ${ym}`; g.append(pth(d, "thin")); w = 25; }
    else if (kind === "sol") { coil = sv("rect", { x: Math.min(xe, xe + s * 18), y: ym - 11, width: 18, height: 22, class: "coil" }); g.append(coil); g.append(pth(`M${xe + s * 1} ${ym + 11} L${xe + s * 17} ${ym - 11}`, "thin")); w = 18; }
    if (label) g.append(txt(xe + s * (w + 4), ym - 7, label, "sm", s < 0 ? "end" : "start"));
    return { g, w, coil };
  }
  /* A valve. o: { x, y (window top-left), type "52"|"32", left, right (actuator kinds), lblL, lblR, d (1 = left box in the window),
     fixed: actuators sit at the ends of a fixed body (simulators) rather than on the boxes, ports: label the ports } */
  function valve(o) {
    const S = SZ, g = sv("g"), x = o.x, y = o.y, is52 = o.type === "52";
    const grp = sv("g"), boxes = [], paths = { L: [], R: [] };
    for (let i = 0; i < 2; i++) { const b = sv("rect", { x: i * S, y: 0, width: S, height: S, class: "box" }); grp.append(b); boxes.push(b); }
    const Lg = sv("g"), Rg = sv("g"); Lg.setAttribute("transform", "translate(0 0)"); Rg.setAttribute("transform", `translate(${S} 0)`);
    grp.append(Lg, Rg);
    if (is52) {
      paths.L.push(...flow(Lg, 0.5 * S, S, 0.28 * S, 1, "sup"), ...flow(Lg, 0.72 * S, 1, 0.8 * S, S - 1, "exh"));
      paths.R.push(...flow(Rg, 0.5 * S, S, 0.72 * S, 1, "sup"), ...flow(Rg, 0.28 * S, 1, 0.2 * S, S - 1, "exh"));
    } else {
      paths.L.push(...flow(Lg, 0.28 * S, S - 1, 0.5 * S, 1, "sup")); paths.L.push(block(Lg, 0.72 * S, S));
      paths.R.push(...flow(Rg, 0.5 * S, 1, 0.72 * S, S - 1, "exh")); paths.R.push(block(Rg, 0.28 * S, S));
    }
    // ports (fixed stubs on the window)
    const pg = sv("g"), P = {};
    const top = is52 ? [["4", 0.28], ["2", 0.72]] : [["2", 0.5]];
    const bot = is52 ? [["5", 0.2], ["1", 0.5], ["3", 0.8]] : [["1", 0.28], ["3", 0.72]];
    top.forEach(([n, f]) => { const px = x + f * S; P[n] = { x: px, y }; pg.append(pth(`M${px} ${y} v-12`, "thin")); if (o.ports !== false) pg.append(txt(px, y - 15, n, "sm")); });
    bot.forEach(([n, f]) => { const px = x + f * S; P[n] = { x: px, y: y + S }; pg.append(pth(`M${px} ${y + S} v12`, "thin")); if (o.ports !== false) pg.append(txt(px, y + S + 23, n, "sm")); });
    const api = { g, ports: P, paths, boxes, coils: {}, S };
    // actuators
    if (o.fixed) {
      const env = sv("rect", { x: x - S, y, width: 3 * S, height: S, class: "env" }); g.append(env);
      g.append(pg, grp);
      if (o.left) { const a = actuator(o.left, x - S, y + S / 2, -1, o.lblL); g.append(a.g); api.coils.L = a.coil; api.leftW = a.w; }
      if (o.right) { const a = actuator(o.right, x + 2 * S, y + S / 2, 1, o.lblR); g.append(a.g); api.coils.R = a.coil; api.rightW = a.w; }
    } else {
      g.append(grp, pg);
      if (o.left) { const a = actuator(o.left, 0, S / 2, -1, o.lblL); grp.append(a.g); api.coils.L = a.coil; }
      if (o.right) { const a = actuator(o.right, 2 * S, S / 2, 1, o.lblR); grp.append(a.g); api.coils.R = a.coil; }
    }
    // d: 1 = left box over the ports, 0 = right box over the ports
    api.setD = (d) => {
      grp.setAttribute("transform", `translate(${x - S * (1 - d)} ${y})`);
      const leftIn = d >= 0.5;
      boxes[0].classList.toggle("act", leftIn); boxes[1].classList.toggle("act", !leftIn);
    };
    api.setFlow = (on) => { // colour the paths of the box in the window when on
      const leftIn = api.d >= 0.5;
      [paths.L, paths.R].forEach((arr, i) => arr.forEach((e) => e.classList.toggle("on", on && (i === 0) === leftIn)));
    };
    api.d = o.d == null ? 1 : o.d;
    api.setD(api.d);
    return api;
  }
  /* a cylinder lying horizontally. o: { x, y, len, h, single, name } ; rod runs right of the body */
  function cylinder(o) {
    const g = sv("g"), { x, y, len } = o, h = o.h || 40;
    const capC = sv("rect", { x, y, width: len, height: h, class: "cham" }), rodC = sv("rect", { x, y, width: 0, height: h, class: "cham" });
    const body = sv("rect", { x, y, width: len, height: h, class: "cyl", fill: "none" });
    body.setAttribute("style", "fill:none");
    const pist = sv("rect", { x: x + 3, y: y + 2, width: 7, height: h - 4, class: "pist" });
    const rod = sv("rect", { x: x + 10, y: y + h / 2 - 4, width: 30, height: 8, class: "rod" });
    const spring = o.single ? pth("", "thin") : null;
    g.append(capC, rodC, body, spring, rod, pist);
    // ports
    const capPort = { x: x + 12, y: y + h }, rodPort = { x: x + len - 12, y: y + h };
    g.append(pth(`M${capPort.x} ${y + h} v14`, "thin"));
    if (o.single) { g.append(pth(`M${rodPort.x} ${y + h} v8 m-5 0 h10`, "thin")); } else g.append(pth(`M${rodPort.x} ${y + h} v14`, "thin"));
    const tipExtra = 24, travel = len - 20;
    const api = { g, capPort: { x: capPort.x, y: y + h + 14 }, rodPort: { x: rodPort.x, y: y + h + 14 }, x, y, len, h, travel };
    api.setPos = (pos) => {
      const px = x + 3 + pos * (len - 16);
      pist.setAttribute("x", px);
      rod.setAttribute("x", px + 7); rod.setAttribute("width", len + tipExtra + pos * (len - 16) - (px + 7 - x) + 0);
      capC.setAttribute("width", px - x); rodC.setAttribute("x", px + 7); rodC.setAttribute("width", Math.max(0, x + len - px - 7));
      if (spring) { let d = `M${x + len} ${y + h / 2}`; const x0 = px + 7, n = 9; d = `M${x0} ${y + h / 2}`; for (let i = 1; i <= n; i++) d += ` L${x0 + (x + len - x0) * (i - 0.5) / n} ${y + h / 2 + (i % 2 ? -9 : 9)}`; d += ` L${x + len} ${y + h / 2}`; spring.setAttribute("d", d); }
      api.pos = pos;
    };
    api.setChambers = (capOn, rodOn) => { capC.classList.toggle("p", !!capOn); rodC.classList.toggle("p", !!rodOn && !o.single); };
    api.setPos(o.pos || 0);
    return api;
  }
  /* small helper: a titled pressure line that can flow */
  function airLine(parent, d, flowEls) {
    const e = sv("path", { d, class: "ln air" });
    parent.append(e);
    if (flowEls) flowEls.push(e);
    return e;
  }

  /* Static ISO symbol sheet for chapter 5 */
  function symbolSheet(svgHost) {
    const g = sv("g", { class: "sy" }); svgHost.append(g);
    const cell = (cx, cy, label, draw, sub, ly) => {
      ly = ly || 78;
      const c = sv("g", { transform: `translate(${cx} ${cy})` }); g.append(c); draw(c);
      c.append(txt(0, ly, label, "b")); if (sub) c.append(txt(0, ly + 14, sub, "sm"));
    };
    // 1 compressor
    cell(70, 20, "Compressor", (c) => { c.append(sv("circle", { cx: 0, cy: 22, r: 22, class: "ln fillc" }), sv("polygon", { points: "-8,32 8,32 0,10", class: "ln fillc" }), pth("M22 22 h22"), sv("circle", { cx: -42, cy: 22, r: 13, class: "ln fillc" }), txt(-42, 26, "M", "b"), pth("M-29 22 h7")); }, "with its motor");
    // 2 receiver
    cell(210, 20, "Air receiver", (c) => { c.append(sv("rect", { x: -34, y: 4, width: 68, height: 36, rx: 16, class: "ln fillc" }), pth("M0 4 v-12 M0 40 v8 M-5 48 h10")); }, "storage tank");
    // 3 FRL
    cell(380, 20, "Filter / regulator / lubricator", (c) => {
      c.append(sv("rect", { x: -62, y: -6, width: 124, height: 56, class: "ln dash thin fillc", fill: "none" }));
      c.append(sv("polygon", { points: "-48,22 -36,8 -24,22 -36,36", class: "ln fillc" }), pth("M-48 22 h24", "dash thin"));
      c.append(sv("rect", { x: -12, y: 8, width: 24, height: 28, class: "ln fillc" }), pth("M-6 30 L6 14 M6 14 l-5 1 M6 14 l-1 5"), pth("M-12 22 h-6 M12 22 h6 M-12 8 q-6 -6 -12 0", "thin"));
      c.append(sv("polygon", { points: "24,22 36,8 48,22 36,36", class: "ln fillc" }), pth("M36 14 q-4 8 0 10 q4 -2 0 -10", "thin"));
      c.append(pth("M-62 22 h14 M48 22 h14", "thin"));
    }, "'FRL' unit (filter, regulator, lubricator)");
    // 4 gauge
    cell(560, 20, "Pressure gauge", (c) => { c.append(sv("circle", { cx: 0, cy: 22, r: 20, class: "ln fillc" }), pth("M0 22 L10 12"), sv("circle", { cx: 0, cy: 22, r: 2, class: "fillink" }), pth("M0 42 v10")); });
    // 5 silencer
    cell(690, 20, "Exhaust port", (c) => { c.append(sv("polygon", { points: "-10,12 10,12 0,30", class: "ln fillc" }), pth("M0 12 v-10 M0 30 v8"), sv("rect", { x: -9, y: 38, width: 18, height: 8, class: "ln fillc" })); }, "with silencer");
    // row 2 cylinders
    cell(110, 150, "Single-acting cylinder", (c) => { const cy = cylinder({ x: -70, y: 0, len: 110, h: 36, single: true, pos: 0.0 }); c.append(cy.g); }, "spring return");
    cell(330, 150, "Double-acting cylinder", (c) => { const cy = cylinder({ x: -70, y: 0, len: 110, h: 36, pos: 0.0 }); c.append(cy.g); }, "air pushes both ways");
    // 3/2 pb
    cell(560, 130, "3/2 valve, push-button, spring return", (c) => { const v = valve({ type: "32", x: -23, y: 20, left: "push", right: "spring", d: 0 }); v.setD(0); c.append(v.g); }, "normally closed (shown at rest)", 112);
    // row 3
    cell(100, 290, "3/2 valve, roller", (c) => { const v = valve({ type: "32", x: -23, y: 20, left: "roller", right: "spring", d: 0 }); c.append(v.g); }, "limit valve, tripped by a cam on the rod", 112);
    cell(290, 290, "5/2 valve, pilot both sides", (c) => { const v = valve({ type: "52", x: -23, y: 20, left: "pilot", right: "pilot", d: 0, lblL: "14", lblR: "12" }); c.append(v.g); }, "memory valve: stays where it was put", 112);
    cell(480, 290, "5/2 valve, pilot / spring", (c) => { const v = valve({ type: "52", x: -23, y: 20, left: "pilot", right: "spring", d: 0, lblL: "14" }); c.append(v.g); }, "spring returns it when pilot goes", 112);
    cell(680, 290, "5/2 valve, solenoid / spring", (c) => { const v = valve({ type: "52", x: -23, y: 20, left: "sol", right: "spring", d: 0, lblL: "Y1" }); c.append(v.g); }, "electro-pneumatic", 112);
    // row 4
    cell(110, 440, "One-way flow control valve", (c) => {
      c.append(sv("rect", { x: -40, y: 6, width: 80, height: 40, class: "ln fillc" }), pth("M-40 26 h-14 M40 26 h14"));
      c.append(pth("M-26 14 q8 12 0 24 M-14 14 q-8 12 0 24", "thin"), pth("M-30 40 L-8 12 M-8 12 l-1 6 M-8 12 l-6 -1", "thin"));
      c.append(sv("circle", { cx: 14, cy: 26, r: 4, class: "ln fillc" }), pth("M24 18 l-8 8 l8 8", "thin"));
    }, "restrictor + check valve");
  }

  /* ================================================================
     Valve states you can press: "a 3/2 valve actuates, a 5/2 valve changes state, a piston outstrokes"
     ================================================================ */
  /* One row of circuit: valve + cylinder + pipework. Returns handles for the simulators. */
  const VX = 196, ROWH = 190;
  function circuitRow(parent, ry, o) {
    const is52 = o.type !== "32";
    const g = sv("g"); parent.append(g);
    const vy = ry + 82, cyl = cylinder({ x: 400, y: ry + 8, len: 200, h: 40, single: !!o.single, name: o.name });
    const flowEls = [];
    const v = valve({ type: is52 ? "52" : "32", x: VX, y: vy, left: o.left, right: o.right, lblL: o.lblL, lblR: o.lblR, fixed: true, d: 0 });
    g.append(cyl.g);
    // pipes
    const lanes = {};
    const p4 = is52 ? v.ports["4"] : null, p2 = v.ports["2"], p1 = v.ports["1"], p3 = v.ports["3"], p5 = is52 ? v.ports["5"] : null;
    if (is52) {
      lanes.l4 = airLine(g, `M${p4.x} ${p4.y - 12} V${ry + 66} H${cyl.capPort.x} V${cyl.capPort.y}`, flowEls);
      lanes.l2 = airLine(g, `M${p2.x} ${p2.y - 12} V${ry + 74} H${cyl.rodPort.x} V${cyl.rodPort.y}`, flowEls);
    } else {
      lanes.l4 = airLine(g, `M${p2.x} ${p2.y - 12} V${ry + 66} H${cyl.capPort.x} V${cyl.capPort.y}`, flowEls);
    }
    lanes.sup = airLine(g, `M${16} ${ry + 140} H${p1.x} V${p1.y + 12}`, flowEls);
    lanes.sup.classList.add("p");
    const puffs = [];
    [p5, p3].forEach((pp) => { if (!pp) return; g.append(sv("rect", { x: pp.x - 6, y: pp.y + 12, width: 12, height: 6, class: "ln fillc" })); const pf = sv("circle", { cx: pp.x, cy: pp.y + 26, r: 5, class: "puff" }); g.append(pf); puffs.push(pf); });
    g.append(v.g);
    if (o.name) g.append(txt(386, ry + 33, o.name, "b", "end"));
    // the air-flow state of the row
    const rowApi = {
      g, valve: v, cyl, lanes, puffs, flowEls, ry,
      /* v1: valve state target (1 = left box in window); moving: piston moving; dir: +1 outstroke / -1 instroke */
      paint(d, moving) {
        v.d = d; v.setD(d); v.setFlow(true);
        const left = d >= 0.5;
        const pressCap = is52 ? left : left; // 5/2: port 4 pressurised when left box; 3/2: port 2 pressurised when actuated (left box)
        const pressRod = is52 ? !left : false;
        const setLane = (el, press, flows, dirSign) => { el.classList.toggle("p", press); el.classList.toggle("e", !press); el.classList.toggle("flow", !!flows); el._dir = dirSign; };
        setLane(lanes.l4, pressCap, moving, pressCap ? 1 : -1);
        if (is52) setLane(lanes.l2, pressRod, moving, pressRod ? 1 : -1);
        lanes.sup.classList.toggle("flow", !!moving); lanes.sup._dir = 1;
        cyl.setChambers(pressCap, pressRod);
        puffs.forEach((pf, i) => { pf._on = moving && (is52 ? (i === 0 ? !left : left) : (i === 1 ? !left : false)); if (!pf._on) pf.style.opacity = 0; });
      },
    };
    return rowApi;
  }

  mount("w-valve", (box) => {
    const kinds = {
      pb32: { label: "3/2 push-button, spring return", type: "32", left: "push", right: "spring", single: true },
      rl32: { label: "3/2 roller (limit) valve", type: "32", left: "roller", right: "spring", single: true },
      pp52: { label: "5/2 pilot-operated (both sides)", type: "52", left: "pilot", right: "pilot", lblL: "14", lblR: "12" },
      ps52: { label: "5/2 pilot / spring return", type: "52", left: "pilot", right: "spring", lblL: "14" },
    };
    let kind = "pb32", d = 0, dT = 0, pos = 0, held = false, rowO = null, raf = 0, last = 0, flowPh = 0;
    const host = HE.el("div", { class: "mec-scroll" }); box.append(host);
    HE.choice(box, "Valve", Object.entries(kinds).map(([k, v]) => [k, v.label]), kind, (v) => { kind = v; d = dT = 0; pos = 0; held = false; build(); });
    const row = HE.el("div", { class: "btn-row" }); box.append(row);
    const status = HE.el("p", { class: "mec-status", "aria-live": "polite" }); box.append(status);
    let svg;
    function build() {
      host.innerHTML = "";
      const k = kinds[kind];
      svg = sv("svg", { viewBox: "0 0 840 172", class: "sy mec-svg", role: "img", "aria-label": "A pneumatic valve connected to a cylinder. Use the buttons to actuate the valve and watch the air path and the piston." });
      host.append(svg);
      rowO = circuitRow(svg, 0, { type: k.type, left: k.left, right: k.right, lblL: k.lblL, lblR: k.lblR, single: k.single });
      rowO.g.append(txt(24, 134, "air supply", "sm", "start"));
      row.innerHTML = "";
      if (k.type === "32") {
        const b = HE.el("button", { class: "btn small primary", type: "button" }, kind === "pb32" ? "Press and hold the push-button" : "Roll the cam over the roller (hold)");
        const down = () => { held = true; upd(); }, up = () => { held = false; upd(); };
        b.addEventListener("pointerdown", (e) => { e.preventDefault(); down(); }); ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => b.addEventListener(ev, up));
        b.addEventListener("keydown", (e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); down(); } }); b.addEventListener("keyup", (e) => { if (e.key === " " || e.key === "Enter") up(); });
        const tg = HE.el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "Latch it held");
        tg.addEventListener("click", () => { held = !held; tg.setAttribute("aria-pressed", held); upd(); });
        row.append(b, tg);
      } else {
        const b14 = HE.el("button", { class: "btn small primary", type: "button" }, "Air to pilot 14");
        const b12 = HE.el("button", { class: "btn small", type: "button" }, kind === "pp52" ? "Air to pilot 12" : "Remove pilot 14 (spring returns it)");
        b14.addEventListener("click", () => { dT = 1; upd(); });
        b12.addEventListener("click", () => { dT = 0; upd(); });
        row.append(b14, b12);
      }
      upd(); kick();
    }
    function upd() {
      const k = kinds[kind];
      if (k.type === "32") dT = held ? 1 : 0;
      let m;
      if (kind === "pb32" || kind === "rl32") {
        m = dT ? `The 3/2 valve <b>actuates</b>: supply port 1 is joined to outlet port 2, the exhaust port 3 is closed, and the piston <b>outstrokes</b> against its spring.` : `The valve is not actuated. The spring holds it: port 1 (supply) is closed, and port 2 is joined to exhaust port 3. The spring pushes the piston back: it <b>instrokes</b>.`;
      } else if (kind === "pp52") {
        m = dT ? `Air at pilot 14: the 5/2 valve <b>changes state</b>. Supply 1 → port 4 (cap end), and port 2 → exhaust 3. The piston <b>outstrokes</b>.` : `Air at pilot 12 (or at rest): the 5/2 valve is in its other state. Supply 1 → port 2 (rod end), and port 4 → exhaust 5. The piston <b>instrokes</b>. Remove the pilot signal and the valve stays put: it has a memory.`;
      } else {
        m = dT ? `Pilot 14 has air: the 5/2 valve <b>changes state</b> against the spring. 1 → 4, 2 → 3: the piston <b>outstrokes</b>.` : `No pilot signal: the spring holds the valve. 1 → 2, 4 → 5: the piston <b>instrokes</b>.`;
      }
      status.innerHTML = m; kick();
    }
    function kick() { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } }
    function frame(now) {
      raf = 0;
      if (!svg.isConnected) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      const target = dT, spd = HE.reduced ? 100 : 5;
      d += clamp(target - d, -spd * dt, spd * dt);
      const settled = Math.abs(d - target) < 0.02;
      let moving = false;
      if (settled) { d = target; const goal = target ? 1 : 0; if (pos !== goal) { pos += clamp(goal - pos, -dt * (HE.reduced ? 100 : 0.5), dt * (HE.reduced ? 100 : 0.5)); moving = Math.abs(goal - pos) > 1e-6; } }
      rowO.paint(d, moving); rowO.cyl.setPos(pos);
      flowPh += dt * 60;
      rowO.flowEls.forEach((e) => { if (e.classList.contains("flow")) e.setAttribute("stroke-dashoffset", -(e._dir || 1) * flowPh); else e.removeAttribute("stroke-dashoffset"); });
      rowO.puffs.forEach((pf) => { if (pf._on) pf.style.opacity = 0.35 + 0.35 * Math.sin(flowPh / 4); });
      if (moving || Math.abs(d - target) > 0.02) raf = requestAnimationFrame(frame);
    }
    build();
  });

  /* ================================================================
     Circuit simulator (pure pneumatic and electro-pneumatic)
     ================================================================ */
  function parseSeq(str) { return str.trim().split(/\s+/).map((s) => [s[0], s[1] === "+" ? 1 : -1]); }
  const lim = (c, dir) => c.toLowerCase() + (dir > 0 ? "1" : "0");
  /* the standard pilot-signal map: step k starts when step k-1 finishes */
  function stdPilots(seq, mode) {
    const n = seq.length, map = {}, order = [];
    const cyls = [...new Set(seq.map((s) => s[0]))];
    seq.forEach(([c, dir], k) => {
      const [pc, pd] = seq[(k + n - 1) % n];
      const key = mode === "ep" ? "Y" + (cyls.indexOf(c) * 2 + (dir > 0 ? 1 : 2)) : c + (dir > 0 ? "14" : "12");
      const ex = [];
      if (k === 0) ex.push("start");
      ex.push(lim(pc, pd));
      if (mode === "ep") ex.push(lim(c, -dir)); // interlock: own cylinder must be at the opposite end
      map[key] = [...new Set(ex)];
    });
    return map;
  }
  function createSim(host, o) {
    const ep = o.mode === "ep";
    let cfg = null, st = null, rows = [], raf = 0, last = 0, running = false, flowPh = 0, stopOnEvent = false, svg, ladder, ladderEls = {};
    const scroller = HE.el("div", { class: "mec-scroll" });
    const lscroller = HE.el("div", { class: "mec-scroll narrow" });
    const status = HE.el("p", { class: "mec-status", "aria-live": "polite" });
    const chips = HE.el("div", { class: "mec-chips", "aria-label": "Live signals" });
    const stepsEl = HE.el("div", { class: "mec-steps", "aria-label": "Sequence steps" });
    const diag = HE.el("div", { class: "mec-scroll narrow" });
    host.append(scroller);
    if (ep) host.append(lscroller);
    host.append(stepsEl, chips, status);
    const api = { diagHost: diag, scroller };

    function ready() { return st.rows.every((r) => r.pos < 0.02 && !r.moving); }
    function sig(name, t) {
      if (name === "start") return st.startOn(t);
      const c = name[0].toUpperCase(), e = +name[1], r = st.byName[c], at = e ? r.pos >= 0.999 : r.pos <= 0.001;
      if (!at) return false;
      if (cfg.oneWay.has(name)) return t - (st.arrived[name] == null ? -1e9 : st.arrived[name]) < 0.5;
      return true;
    }
    function configure(c) {
      cfg = Object.assign({ oneWay: new Set(), cont: false, speed: 1 }, c);
      cfg.seq = typeof cfg.seq === "string" ? parseSeq(cfg.seq) : cfg.seq;
      cfg.cyls = [...new Set(cfg.seq.map((s) => s[0]))];
      cfg.pilots = cfg.pilots || stdPilots(cfg.seq, o.mode);
      build(); reset();
    }
    function build() {
      scroller.innerHTML = ""; chips.innerHTML = ""; stepsEl.innerHTML = "";
      const n = cfg.cyls.length, H = 62 + n * ROWH, W = 840;
      svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "sy mec-svg", role: "img", "aria-label": (ep ? "Electro-pneumatic" : "Pneumatic") + " circuit for the sequence " + cfg.seq.map((s) => s[0] + (s[1] > 0 ? "+" : "−")).join(" ") + ". The air lines are coloured when pressurised; valves slide when they change state; pistons move." });
      scroller.append(svg);
      svg.append(txt(20, 14, "compressed air supply (6 bar)", "sm", "start"));
      svg.append(pth(`M16 18 V${H - 40}`, "air p"));
      rows = []; st = { rows: [], byName: {}, arrived: {}, t: 0, startUntil: -1, ptr: 0, done: [], conflict: {}, cycles: 0, moveLog: [], startOn: (t) => (cfg.cont && st.contLatch) || t < st.startUntil, contLatch: false, k1: false };
      cfg.cyls.forEach((c, i) => {
        const ry = 56 + i * ROWH;
        const pl = ep ? "sol" : "pilot", sigOf = (k) => (cfg.pilots[k] || []);
        const kL = c + "14", kR = c + "12", yL = "Y" + (i * 2 + 1), yR = "Y" + (i * 2 + 2);
        const row = circuitRow(svg, ry, { type: "52", left: ep ? "sol" : "pilot", right: ep ? "sol" : "pilot", lblL: ep ? yL : "14", lblR: ep ? yR : "12", name: c });
        // limit valves / reed switches above the cylinder, supplied from a bus (pneumatic only)
        const mkLim = (cx, name, outLeft) => {
          const lg = sv("g"); svg.append(lg);
          const rect = sv("rect", { x: cx - 18, y: ry - 30, width: 36, height: 20, rx: 3, class: "lv" });
          const cam = sv("path", { d: `M${cx} ${ry - 10} V${ry + 8}`, class: "ln thin" });
          const roller = sv("circle", { cx, cy: ry - 10, r: 4, class: "ln fillc" });
          lg.append(cam, rect, roller, txt(cx, ry - 16, name, "b"));
          if (!ep) {
            lg.append(pth(`M${cx} ${ry - 38} V${ry - 30}`, "air p thin"));
            if (cfg.oneWay.has(name)) lg.append(txt(cx, ry - 42, "one-way trip roller", "sm"));
          } else lg.append(txt(cx, ry - 36, "reed switch", "sm"));
          return { rect, name, lg };
        };
        row.lims = [mkLim(432, c.toLowerCase() + "0"), mkLim(568, c.toLowerCase() + "1")];
        if (!ep) {
          // supply bus
          svg.append(pth(`M16 ${ry - 38} H568`, "air p thin"));
        }
        row.name = c; row.kL = kL; row.kR = kR; row.yL = yL; row.yR = yR;
        // signal label texts at the valve's pilot stubs
        const lblSig = (k, x, anchor) => txt(x, ry + 82 + 23 + 18, "", "sm sg", anchor);
        row.sigL = sv("path", { d: `M${VX - SZ - (row.valve.leftW || 26)} ${ry + 82 + SZ / 2} H${VX - SZ}`, class: "ln sig" + (ep ? " elec" : "") });
        row.sigR = sv("path", { d: `M${VX + 2 * SZ} ${ry + 82 + SZ / 2} H${VX + 2 * SZ + (row.valve.rightW || 26)}`, class: "ln sig" + (ep ? " elec" : "") });
        if (!ep) svg.append(row.sigL, row.sigR);
        const sL = (cfg.pilots[ep ? yL : kL] || []).join("·"), sR = (cfg.pilots[ep ? yR : kR] || []).join("·");
        row.tL = txt(VX - SZ - (row.valve.leftW || 26) - 24 - (ep ? 0 : 0), ry + 82 + SZ / 2 + 22, (ep ? "" : "") + (sL ? "← " + sL : ""), "sm sg", "end");
        row.tR = txt(VX + 2 * SZ + (row.valve.rightW || 26) + 24, ry + 82 + SZ / 2 + 22, (sR ? sR + " →" : ""), "sm sg", "start");
        // fix label positions: put them under the stubs
        row.tL.setAttribute("x", VX - SZ - 6); row.tL.setAttribute("text-anchor", "end"); row.tL.setAttribute("y", ry + 82 + SZ + 2 + 20);
        row.tR.setAttribute("x", VX + 2 * SZ + 6); row.tR.setAttribute("text-anchor", "start"); row.tR.setAttribute("y", ry + 82 + SZ + 2 + 20);
        svg.append(row.tL, row.tR);
        row.pos = 0; row.v = 0; row.d = 0; row.moving = false; row.dirLast = 0;
        st.rows.push(row); st.byName[c] = row;
      });
      // signal key for clarity
      svg.append(txt(W - 14, H - 12, ep ? "orange coil = solenoid energised" : "orange dashed line = pilot signal present", "sm", "end"));
      cfg.seq.forEach(([c, dir], k) => { const s = HE.el("span", { class: "mec-step", id: "" }, (k + 1) + ": " + c + (dir > 0 ? "+" : "−")); stepsEl.append(s); });
      // chips
      st.chips = {};
      Object.keys(cfg.pilots).forEach((key) => { const ch = HE.el("span", { class: "mec-chip" }, key + " ← " + cfg.pilots[key].join(" · ")); chips.append(ch); st.chips[key] = ch; });
      if (ep) buildLadder();
      api.cfg = cfg; api.seqLabels = cfg.seq.map((s) => s[0] + (s[1] > 0 ? "+" : "−"));
      if (api.onbuild) api.onbuild(cfg);
    }
    /* electrical ladder diagram: left and right rails, one rung per coil */
    function buildLadder() {
      lscroller.innerHTML = "";
      const rungs = [];
      const keys = Object.keys(cfg.pilots);
      const rowH = 54, top = 44, W = 700;
      const extra = cfg.cont ? 1 : 0;
      const H = top + (keys.length + extra) * rowH + 24;
      ladder = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "sy mec-svg", role: "img", "aria-label": "Electrical ladder diagram. Each rung has switch contacts in series with a solenoid coil. A rung conducts, and its coil energises, only when all its contacts are closed." });
      lscroller.append(ladder);
      ladderEls = { rungs: {}, contacts: {}, coils: {}, rail: [] };
      const xl = 30, xr = W - 30;
      const rl = pth(`M${xl} 26 V${H - 12}`, "rail"), rr = pth(`M${xr} 26 V${H - 12}`, "rail");
      rl.setAttribute("class", "ln rail"); rr.setAttribute("class", "ln rail");
      ladder.append(rl, rr, txt(xl, 16, "+24 V", "sm"), txt(xr, 16, "0 V", "sm"));
      ladderEls.rail = [rl, rr];
      let r = 0;
      const contact = (x, y, name, nc) => {
        const g = sv("g"); const a = pth(`M${x - 9} ${y - 11} V${y + 11}`, "contact"), b = pth(`M${x + 9} ${y - 11} V${y + 11}`, "contact");
        a.setAttribute("class", "contact"); b.setAttribute("class", "contact");
        g.append(a, b); if (nc) g.append(pth(`M${x - 13} ${y + 13} L${x + 13} ${y - 13}`, "thin"));
        g.append(txt(x, y - 17, name, "sm b"));
        ladder.append(g);
        (ladderEls.contacts[name] = ladderEls.contacts[name] || []).push([a, b]);
        return g;
      };
      const wire = (d) => { const w = pth(d, "elec"); ladder.append(w); return w; };
      if (cfg.cont) {
        const y = top + r * rowH, y2 = y + 24;
        // S1 || K1 in series with S2 (NC) feeding relay K1
        const w1 = wire(`M${xl} ${y} H70`); contact(110, y, "S1"); const w2 = wire(`M130 ${y} H190`);
        wire(`M70 ${y} V${y2} H90`); contact(110, y2, "K1"); wire(`M130 ${y2} H150 V${y}`);
        contact(230, y, "S2 (stop)", true); wire(`M250 ${y} H${W - 130}`);
        const k = sv("circle", { cx: W - 110, cy: y, r: 16, class: "coil" }); ladder.append(k, txt(W - 110, y + 4, "K1", "b"), wire(`M${W - 94} ${y} H${xr}`), txt(W - 110, y + 32, "relay coil: latches the run", "sm"));
        ladderEls.coils.K1 = k;
        r++;
      }
      keys.forEach((key) => {
        const y = top + r * rowH, ex = cfg.pilots[key];
        let x = 100; const ws = [];
        ws.push(wire(`M${xl} ${y} H${x - 10}`));
        ex.forEach((nm, i) => {
          const label = nm === "start" ? (cfg.cont ? "K1" : "S1") : nm;
          contact(x, y, label);
          ws.push(wire(`M${x + 10} ${y} H${x + 70}`)); x += 80;
        });
        ws.push(wire(`M${x - 10} ${y} H${W - 130}`));
        const coil = sv("circle", { cx: W - 110, cy: y, r: 16, class: "coil" });
        ladder.append(coil, txt(W - 110, y + 4, key, "b"), wire(`M${W - 94} ${y} H${xr}`));
        const mv = cfg.seq.find((s, k) => stdKey(s, k) === key);
        ladder.append(txt(W - 110, y + 32, mv ? mv[0] + (mv[1] > 0 ? " outstrokes" : " instrokes") : "", "sm"));
        ladderEls.coils[key] = coil; ladderEls.rungs[key] = ws;
        r++;
      });
    }
    function stdKey(s, k) { const cyls = cfg.cyls; return "Y" + (cyls.indexOf(s[0]) * 2 + (s[1] > 0 ? 1 : 2)); }
    function reset() {
      running = false; stopOnEvent = false;
      st.rows.forEach((r) => { r.pos = 0; r.v = 0; r.d = 0; r.moving = false; });
      st.t = 0; st.startUntil = -1; st.ptr = 0; st.moveLog = []; st.done = []; st.confLog = {}; st.stuck = false; st.rows.forEach((r) => { r._at0 = true; r._at1 = false; }); st.arrived = {}; st.conflict = {}; st.cycles = 0; st.contLatch = false; st.k1 = false; st.idleAnnounced = false;
      status.className = "mec-status"; status.innerHTML = "At rest: every piston is instroked and the valves are in their rest states. Press <b>START</b> (or Step).";
      evalSignals(0); paint(0); if (api.onstate) api.onstate();
    }
    function start() { st.startUntil = st.t + 1.0; st.stuck = false; st.confLog = {}; st.idleAnnounced = false; if (cfg.cont) st.contLatch = true; run(true); }
    function run(on) { if (on && !running) { running = true; last = 0; if (!raf) raf = requestAnimationFrame(frame); } else if (!on) { running = false; } if (api.onstate) api.onstate(); }
    function step() {
      stopOnEvent = true;
      if (ready() && st.ptr === 0 && !st.rows.some((r) => r.moving)) start(); else run(true);
    }
    function frame(now) {
      raf = 0;
      if (!svg.isConnected) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0; last = now;
      if (running) update(dt * cfg.speed);
      paint(dt);
      if (running) raf = requestAnimationFrame(frame);
    }
    function evalSignals(t) {
      const on = {};
      Object.keys(cfg.pilots).forEach((key) => { on[key] = cfg.pilots[key].every((n) => sig(n, t)); });
      st.on = on;
      st.rows.forEach((r) => {
        const kL = ep ? r.yL : r.kL, kR = ep ? r.yR : r.kR;
        r.sa = !!on[kL]; r.sb = !!on[kR]; r.conf = r.sa && r.sb;
      });
    }
    function update(dt) {
      st.t += dt;
      const t = st.t;
      // edge detection for arrival pulses
      st.rows.forEach((r) => { [0, 1].forEach((e) => { const nm = r.name.toLowerCase() + e, at = e ? r.pos >= 0.999 : r.pos <= 0.001; if (at && !r["_at" + e]) st.arrived[nm] = t; r["_at" + e] = at; }); });
      // signals
      evalSignals(t);
      st.rows.forEach((r, i) => {
        if (r.conf) st.confLog[r.name] = true; else if (r.sa) r.v = 1; else if (r.sb) r.v = 0;
        // spool tween
        const sp = 5 * dt;
        r.d += clamp(r.v - r.d, -sp, sp);
        const spoolDone = Math.abs(r.d - r.v) < 0.02;
        const wasMoving = r.moving;
        if (spoolDone) {
          const goal = r.v ? 1 : 0;
          if (Math.abs(goal - r.pos) > 1e-6) {
            r.pos += clamp(goal - r.pos, -dt * 0.5, dt * 0.5); r.moving = true; if (Math.abs(goal - r.pos) < 0.0015) r.pos = goal;
            if (Math.abs(goal - r.pos) < 1e-6) { r.pos = goal; r.moving = false; st.moveLog.push(r.name + (goal ? "+" : "−")); if (stopOnEvent) { running = false; stopOnEvent = false; } }
          } else r.moving = false;
        } else r.moving = false;
      });
      // progress pointer for the step lights
      const exp = cfg.seq[st.ptr];
      while (st.moveLog.length > st.done.length) {
        const m = st.moveLog[st.done.length]; st.done.push(m);
        const e = cfg.seq[st.ptr], lab = e[0] + (e[1] > 0 ? "+" : "−");
        if (m === lab) { st.ptr++; if (st.ptr >= cfg.seq.length) { st.ptr = 0; st.cycles++; } }
      }
      // idle? either the cycle has finished, or the circuit has jammed
      const anyMoving = st.rows.some((r) => r.moving) || st.rows.some((r) => Math.abs(r.d - r.v) > 0.02);
      if (!anyMoving && t > st.startUntil + 0.3) {
        const atHome = st.rows.every((r) => r.pos < 0.02), cycleDone = atHome && st.ptr === 0 && st.moveLog.length > 0;
        if (cycleDone) { st.idleT = 0; if (!cfg.cont) { running = false; stopOnEvent = false; } }
        else { st.idleT = (st.idleT || 0) + dt; if (st.idleT > 0.8) { running = false; stopOnEvent = false; st.stuck = true; } }
      } else st.idleT = 0;
      if (api.onstate) api.onstate();
    }
    function paint(dt) {
      if (!st) return;
      flowPh += (dt || 0) * 60;
      const t = st.t, on = st.on || {};
      st.rows.forEach((r) => {
        r.paint(r.d, r.moving && !HE.reduced ? true : r.moving);
        r.cyl.setPos(r.pos);
        r.flowEls.forEach((e) => { if (e.classList.contains("flow") && !HE.reduced) e.setAttribute("stroke-dashoffset", -(e._dir || 1) * flowPh); else e.removeAttribute("stroke-dashoffset"); });
        r.puffs.forEach((pf) => { if (pf._on && !HE.reduced) pf.style.opacity = 0.3 + 0.3 * Math.sin(flowPh / 4); else pf.style.opacity = pf._on ? 0.4 : 0; });
        r.lims.forEach((l) => { l.rect.classList.toggle("on", !!(st.on && sigPlain(l.name))); });
        r.sigL.classList.toggle("on", !!r.sa && !r.conf); r.sigR.classList.toggle("on", !!r.sb && !r.conf);
        r.sigL.classList.toggle("bad", !!r.conf); r.sigR.classList.toggle("bad", !!r.conf);
        if (ep) { if (r.valve.coils.L) r.valve.coils.L.classList.toggle("on", !!r.sa); if (r.valve.coils.R) r.valve.coils.R.classList.toggle("on", !!r.sb); }
        r.tL.classList.toggle("bad", !!r.conf); r.tR.classList.toggle("bad", !!r.conf);
        if (!ep) { r.valve.g.querySelectorAll(".sy-t").forEach(() => {}); }
      });
      Object.keys(st.chips).forEach((k) => { const c = st.chips[k]; c.classList.toggle("on", !!on[k]); const conflict = st.rows.some((r) => r.conf && (r.kL === k || r.kR === k || r.yL === k || r.yR === k)); c.classList.toggle("bad", conflict); });
      [...stepsEl.children].forEach((s, i) => { const mov = st.rows.some((r) => r.moving); s.classList.toggle("now", i === st.ptr && (mov || running)); s.classList.toggle("done", i < st.ptr); });
      if (ep && ladder) {
        Object.keys(ladderEls.contacts).forEach((nm) => {
          const real = nm.replace(" (stop)", "");
          let closed;
          if (nm === "S1") closed = t < st.startUntil;
          else if (nm === "K1") closed = st.contLatch;
          else if (nm.startsWith("S2")) closed = true;
          else closed = sigPlain(nm);
          ladderEls.contacts[nm].forEach(([a, b]) => { a.classList.toggle("on", !!closed); b.classList.toggle("on", !!closed); });
        });
        Object.keys(ladderEls.coils).forEach((k) => ladderEls.coils[k].classList.toggle("on", k === "K1" ? st.contLatch : !!on[k]));
        ladderEls.rail.forEach((e) => e.classList.add("on"));
      }
      // status text
      const conf = st.rows.filter((r) => r.conf);
      let msg = "", cls = "mec-status";
      const mv = st.rows.filter((r) => r.moving);
      if (st.stuck) {
        const cl = Object.keys(st.confLog);
        msg = cl.length ? `<b>Jammed.</b> Valve ${cl.join(", ")} had ${ep ? "both solenoids energised" : "both pilot lines (14 and 12) pressurised"} at the same time, so it could not change state, and when the START signal went away nothing else could happen.` + (ep ? "" : " A one-way trip (idle-return) roller on the limit valve that is held pressed gives only a short pulse and removes the conflict.") : `<b>Stopped.</b> After ${st.moveLog.length ? st.moveLog.join(" ") : "no movement"} no pilot signal arrives, so no valve can change state.`;
        cls += " bad";
      } else if (conf.length) {
        msg = `<b>Signal conflict on valve ${conf.map((r) => r.name).join(", ")}:</b> both ${ep ? "solenoids are energised" : "pilot lines (14 and 12) are pressurised"} at once. The valve cannot change state, so the sequence is stuck.` + (ep ? "" : " The usual fix is a one-way trip (idle-return) roller on the limit valve that is still held pressed.");
        cls += " bad";
      } else if (mv.length) {
        const r = mv[0], e = cfg.seq[st.ptr];
        msg = `<b>Step ${st.ptr + 1}:</b> ${ep ? "solenoid " + (r.v ? r.yL : r.yR) + " energised" : "pilot " + (r.v ? "14" : "12") + " has air"}, so the 5/2 valve ${r.name} has changed state and the piston of cylinder ${r.name} ${r.v ? "<b>outstrokes</b>" : "<b>instrokes</b>"}.`;
      } else if (st.moveLog.length && st.rows.every((r) => r.pos < 0.02) && st.ptr === 0) {
        msg = `<b>Cycle complete</b> (${st.cycles} cycle${st.cycles === 1 ? "" : "s"}). All pistons are back in. ${cfg.cont ? "Continuous mode restarts it." : "Press START to run it again."}`; cls += " good";
      } else if (running) {
        msg = "Valves are changing state…";
      } else if (st.moveLog.length) {
        msg = `Paused after step ${st.ptr || cfg.seq.length}. Press Step or Run to carry on.`;
      } else msg = "At rest: every piston is instroked. Press <b>START</b> (or Step).";
      if (status._m !== msg || status.className !== cls) { status.innerHTML = msg; status.className = cls; status._m = msg; }
    }
    const sigPlain = (name) => { const c = name[0].toUpperCase(), e = +name[1], r = st.byName[c]; return r && (e ? r.pos >= 0.999 : r.pos <= 0.001) && (!cfg.oneWay.has(name) || (st.t - (st.arrived[name] == null ? -1e9 : st.arrived[name])) < 0.5); };
    Object.assign(api, {
      configure, reset, start, step, run, paint: () => paint(0),
      setSpeed(v) { cfg.speed = v; }, setCont(v) { cfg.cont = v; if (!v && st) st.contLatch = false; if (ep) { buildLadder(); } },
      idle() { return !running && !st.rows.some((r) => r.moving); },
    });
    Object.defineProperties(api, { running: { get: () => running, enumerable: true }, state: { get: () => st, enumerable: true }, moveLog: { get: () => (st ? st.moveLog : []), enumerable: true } });
    host.__sim = api;
    return api;
  }
  /* motion (displacement–step) diagram as inline SVG */
  function stepDiagram(host, seqStr) {
    const seq = typeof seqStr === "string" ? parseSeq(seqStr) : seqStr, cyls = [...new Set(seq.map((s) => s[0]))];
    const n = seq.length, colW = 64, left = 54, rowH = 56, top = 34, W = left + n * colW + 20, H = top + cyls.length * rowH + 30;
    const svg = sv("svg", { viewBox: `0 0 ${W} ${H}`, class: "sy mec-svg", role: "img", "aria-label": "Displacement–step diagram for the sequence " + seq.map((s) => s[0] + (s[1] > 0 ? "+" : "−")).join(" ") + ". Each row shows one piston: high when outstroked, low when instroked." });
    svg.append(txt(8, 16, "step →", "sm", "start"));
    for (let k = 0; k <= n; k++) svg.append(pth(`M${left + k * colW} ${top - 8} V${H - 24}`, "thin dash sig"));
    seq.forEach((s, k) => svg.append(txt(left + (k + 0.5) * colW, 16, `${k + 1}  ${s[0]}${s[1] > 0 ? "+" : "−"}`, "b")));
    cyls.forEach((c, i) => {
      const y0 = top + i * rowH, hi = y0 + 8, lo = y0 + rowH - 14;
      svg.append(txt(left - 10, y0 + rowH / 2 + 2, c, "b", "end"), txt(left - 10, hi + 4, "out", "sm", "end"), txt(left - 10, lo + 4, "in", "sm", "end"));
      let lev = 0, d = `M${left} ${lo}`;
      seq.forEach((s, k) => {
        const nx = left + (k + 1) * colW, ny = s[0] === c ? (s[1] > 0 ? hi : lo) : (lev ? hi : lo);
        const here = left + k * colW;
        if (s[0] === c) { d += ` L${here + 6} ${lev ? hi : lo} L${nx - 6} ${ny}`; lev = s[1] > 0 ? 1 : 0; d += ` L${nx} ${ny}`; }
        else d += ` L${nx} ${ny}`;
      });
      svg.append(pth(d, "air p")); svg.lastChild.setAttribute("style", "stroke:var(--sea);stroke-width:3");
    });
    svg.style.maxWidth = Math.round(W * 1.5) + "px"; host.append(svg);
    return svg;
  }

  /* ---------- shared controls for a circuit simulator ---------- */
  function simControls(box, sim, o) {
    const row = HE.el("div", { class: "btn-row" });
    const bStart = HE.el("button", { class: "btn small primary", type: "button" }, o.ep ? "START (S1)" : "START (push-button)");
    const bStep = HE.el("button", { class: "btn small", type: "button" }, "Step ▶");
    const bRun = HE.el("button", { class: "btn small", type: "button" }, "❚❚ Pause");
    const bReset = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    row.append(bStart, bStep, bRun, bReset);
    if (o.ep) { const bStop = HE.el("button", { class: "btn small danger", type: "button" }, "STOP (S2)"); bStop.addEventListener("click", () => { const s = sim.state; s.contLatch = false; sim.paint(); }); row.append(bStop); }
    bStart.addEventListener("click", () => { sim.start(); });
    bStep.addEventListener("click", () => sim.step());
    bRun.addEventListener("click", () => sim.run(!sim.running));
    bReset.addEventListener("click", () => sim.reset());
    const old = sim.onstate;
    sim.onstate = () => { bRun.textContent = sim.running ? "❚❚ Pause" : "▶ Resume"; if (old) old(); };
    box.append(row);
    const sp = HE.el("div", { class: "sim-controls" }); box.append(sp);
    HE.slider(sp, { label: "Speed", min: 0.5, max: 3, step: 0.25, value: 1, unit: "×", fmt: (v) => N(v, 2), oninput: (v) => sim.setSpeed(v) });
    return { row, bStart };
  }
  const labelOf = (str) => str.replace(/-/g, "−");

  mount("w-seq", (box) => {
    const SEQS = {
      s1: { label: "A+ B+ A− B−", seq: "A+ B+ A- B-", note: "Two cylinders. Each step starts when the previous piston reaches its limit valve. There is no signal conflict, so plain roller limit valves are enough." },
      s2: { label: "A+ B+ B− A−", seq: "A+ B+ B- A-", note: "Same two cylinders, different order. Limit valve b0 is held pressed at rest, so it fights the START signal at valve A, and a1 stays pressed while B has to go back. With plain rollers the circuit jams. Fit one-way trip rollers and it runs." },
      s3: { label: "A+ B+ C+ A− B− C−", seq: "A+ B+ C+ A- B- C-", note: "Three cylinders. A chain of six limit valves, each one starting the next step. Watch the signals pass along the chain." },
    };
    let key = "s1", oneWay = false, cont = false;
    const host = HE.el("div"); box.append(host);
    const sim = createSim(host, { mode: "pneu" });
    HE.choice(box, "Sequence", Object.entries(SEQS).map(([k, v]) => [k, v.label]), key, (v) => { key = v; cfg(); });
    const { row } = simControls(box, sim, {});
    const opt = HE.el("div", { class: "btn-row" });
    const lab = (txtv, on) => { const cb = HE.el("input", { type: "checkbox" }); cb.addEventListener("change", () => on(cb.checked)); return HE.el("label", { style: "display:flex;gap:6px;align-items:center" }, cb, txtv); };
    const l1 = lab("Fit one-way trip rollers on a1 and b0", (c) => { oneWay = c; cfg(); });
    const l2 = lab("Continuous cycling", (c) => { cont = c; cfg(); });
    opt.append(l1, l2); box.append(opt);
    const nt = note(box, "mec-why");
    const dg = HE.el("div"); box.append(HE.el("h4", null, "Displacement–step diagram"), dg);
    function cfg() {
      const s = SEQS[key];
      l1.querySelector("input").disabled = key !== "s2";
      if (key !== "s2") { l1.querySelector("input").checked = false; oneWay = false; }
      sim.configure({ seq: s.seq, oneWay: new Set(oneWay ? ["a1", "b0"] : []), cont });
      nt.textContent = s.note;
      dg.innerHTML = ""; stepDiagram(dg, s.seq);
      dg.classList.add("mec-scroll", "narrow");
    }
    cfg();
  });

  mount("w-ep", (box) => {
    const SEQS = { e1: { label: "A+ B+ A− B−", seq: "A+ B+ A- B-" }, e2: { label: "A+ B+ C+ A− B− C−", seq: "A+ B+ C+ A- B- C-" } };
    let key = "e1", cont = false;
    const host = HE.el("div"); box.append(host);
    const sim = createSim(host, { mode: "ep" });
    HE.choice(box, "Sequence", Object.entries(SEQS).map(([k, v]) => [k, v.label]), key, (v) => { key = v; cfg(); });
    simControls(box, sim, { ep: true });
    const cb = HE.el("input", { type: "checkbox" }); cb.addEventListener("change", () => { cont = cb.checked; cfg(); });
    box.append(HE.el("div", { class: "btn-row" }, HE.el("label", { style: "display:flex;gap:6px;align-items:center" }, cb, "Use relay K1 to latch a continuous cycle (STOP releases it)")));
    box.append(note(box, "mec-why"));
    box.lastChild.innerHTML = "Each coil's rung shows the contacts that must ALL be closed (AND): the limit switch that says the last step has finished, plus an interlock on the cylinder's own opposite limit switch so that the two coils of one valve are never energised together. Sequences where one limit switch must trigger two different steps need relays to latch the stages, which this simplified circuit does not include.";
    function cfg() { sim.configure({ seq: SEQS[key].seq, cont }); }
    cfg();
  });

  mount("w-build", (box) => {
    const CH = {
      c1: { label: "Challenge 1", seq: "A+ B+ A- B-", text: "Cylinder A clamps a block, B then stamps it. Required sequence: A+ B+ A− B−. Pick which limit valve feeds each pilot port." },
      c2: { label: "Challenge 2", seq: "B+ A+ B- A-", text: "Cylinder B feeds a planchet, A pushes it away. Required sequence: B+ A+ B− A−." },
      c3: { label: "Challenge 3", seq: "A+ B+ C+ A- B- C-", text: "Three cylinders in a row: A+ B+ C+ A− B− C−." },
    };
    let key = "c1", testing = false, sel = {};
    const lines = HE.el("div"); const msg = HE.el("p", { class: "mec-status", "aria-live": "polite" });
    HE.choice(box, "Challenge", Object.entries(CH).map(([k, v]) => [k, v.label]), key, (v) => { key = v; build(); });
    const brief = HE.el("p", { class: "hint" }); box.append(brief, lines);
    const row = HE.el("div", { class: "btn-row" });
    const chk = HE.el("button", { class: "btn small primary", type: "button" }, "Check my answers");
    const test = HE.el("button", { class: "btn small", type: "button" }, "▶ Test my circuit");
    const show = HE.el("button", { class: "btn small", type: "button" }, "Show the answer");
    row.append(chk, test, show); box.append(row, msg);
    const host = HE.el("div"); box.append(host);
    const sim = createSim(host, { mode: "pneu" });
    const seqOf = () => parseSeq(CH[key].seq);
    function limits() { const cs = [...new Set(seqOf().map((s) => s[0]))]; const o = []; cs.forEach((c) => { o.push(c.toLowerCase() + "0", c.toLowerCase() + "1"); }); return o; }
    function build() {
      const seq = seqOf(), std = stdPilots(seq, "pneu"), n = seq.length;
      brief.textContent = CH[key].text;
      lines.innerHTML = ""; sel = {};
      seq.forEach(([c, dir], k) => {
        const port = c + (dir > 0 ? "14" : "12"), id = "mecb-" + port;
        const s = HE.el("select", { id, "aria-label": `Signal for pilot ${dir > 0 ? 14 : 12} of valve ${c}` });
        s.append(HE.el("option", { value: "" }, "(choose a limit valve)"), ...limits().map((l) => HE.el("option", { value: l }, l + " (cylinder " + l[0].toUpperCase() + (l[1] === "1" ? " fully out" : " fully in") + ")")));
        s.addEventListener("change", () => { sel[port] = s.value; });
        sel[port] = "";
        lines.append(HE.el("div", { class: "mec-opt-row" }, HE.el("label", { for: id }, `Step ${k + 1}: ${c}${dir > 0 ? "+" : "−"} — pilot ${dir > 0 ? 14 : 12} of valve ${c}` + (k === 0 ? " (the START button is also in series)" : "")), s));
      });
      msg.className = "mec-status"; msg.textContent = "Choose a limit valve for every pilot port, then check, or test it in the simulator.";
      sim.configure({ seq: CH[key].seq });
      testing = false;
    }
    chk.addEventListener("click", () => {
      const seq = seqOf(), std = stdPilots(seq, "pneu"); let ok = 0; const bad = [];
      seq.forEach(([c, dir], k) => {
        const port = c + (dir > 0 ? "14" : "12"), want = std[port].find((x) => x !== "start"), got = sel[port];
        const s = lines.querySelector("#mecb-" + port);
        if (got === want) { ok++; s.style.outline = "3px solid var(--grass)"; } else { s.style.outline = "3px solid var(--redstone)"; bad.push(`step ${k + 1}: ${c}${dir > 0 ? "+" : "−"} needs the signal from the end of the PREVIOUS step, ${seq[(k + seq.length - 1) % seq.length][0]}${seq[(k + seq.length - 1) % seq.length][1] > 0 ? "+" : "−"}, which is limit valve ${want}.`); }
      });
      msg.className = "mec-status " + (ok === seq.length ? "good" : "bad");
      msg.innerHTML = ok === seq.length ? `<b>All ${ok} correct.</b> Each step is started by the limit valve that the previous piston reaches. Now press Test to watch it run.` : `<b>${ok} of ${seq.length} correct.</b> ` + bad.join(" ");
    });
    show.addEventListener("click", () => {
      const seq = seqOf(), std = stdPilots(seq, "pneu");
      seq.forEach(([c, dir]) => { const port = c + (dir > 0 ? "14" : "12"), s = lines.querySelector("#mecb-" + port); s.value = std[port].find((x) => x !== "start"); sel[port] = s.value; });
    });
    test.addEventListener("click", () => {
      const seq = seqOf(), pil = {};
      let missing = false;
      seq.forEach(([c, dir], k) => { const port = c + (dir > 0 ? "14" : "12"); if (!sel[port]) { missing = true; return; } pil[port] = k === 0 ? ["start", sel[port]] : [sel[port]]; });
      if (missing) { msg.className = "mec-status bad"; msg.textContent = "Every pilot port needs a signal before the circuit can be tested."; return; }
      // ports with no step (e.g. none) stay empty
      sim.configure({ seq, pilots: pil });
      msg.className = "mec-status"; msg.textContent = "Testing your circuit…";
      testing = true; sim.start();
    });
    sim.onstate = () => {
      if (!testing) return;
      const log = sim.moveLog, want = parseSeq(CH[key].seq).map((s) => s[0] + (s[1] > 0 ? "+" : "−")), n = want.length;
      const wrongAt = log.findIndex((m, i) => m !== want[i % n]);
      const done = () => { testing = false; sim.run(false); };
      if (wrongAt >= 0) { done(); msg.className = "mec-status bad"; msg.innerHTML = `<b>Wrong order.</b> The circuit did <b>${log.slice(0, wrongAt + 1).join(" ")}</b> but the sequence needs <b>${want.slice(0, wrongAt + 1).join(" ")}</b>. Check the signal for step ${(wrongAt % n) + 1}.`; return; }
      if (log.length >= n && sim.state.rows.every((r) => r.pos < 0.02) && !sim.state.rows.some((r) => r.moving)) { done(); msg.className = "mec-status good"; msg.innerHTML = `<b>It works.</b> The cylinders ran ${log.join(" ")} and came to rest. Every pilot port is fed by the limit valve at the end of the previous step.`; return; }
      if (sim.idle() && !sim.running && log.length < n && sim.state.t > 1.5) { done(); const jam = sim.state.rows.some((r) => r.conf); msg.className = "mec-status bad"; msg.innerHTML = log.length ? `<b>It stopped after ${log.join(" ")}.</b> The next pilot signal never arrived, or two signals fought each other.` : `<b>Nothing moved.</b> The first step needs START together with the right limit valve.`; return; }
      if (log.length > 2 * n) { done(); msg.className = "mec-status bad"; msg.textContent = "The circuit keeps running and does not stop: check the signals."; }
    };
    build();
  });

  /* ================================================================
     Static circuit figures (drawn with the same symbol library)
     ================================================================ */
  document.querySelectorAll("[data-mec]").forEach((slot) => {
    const id = slot.getAttribute("data-mec");
    try {
      if (id === "symbols") {
        const svg = sv("svg", { viewBox: "0 0 800 530", class: "sy mec-svg", role: "img", "aria-label": "A sheet of ISO-style pneumatic symbols: compressor, air receiver, filter regulator lubricator unit, pressure gauge, exhaust, single-acting and double-acting cylinders, 3/2 push-button and roller valves, 5/2 pilot, pilot/spring and solenoid valves, and a one-way flow control valve." });
        slot.append(svg); symbolSheet(svg);
      } else if (id === "valve-states") {
        const svg = sv("svg", { viewBox: "0 0 860 190", class: "sy mec-svg", role: "img", "aria-label": "Four valve symbols showing which ports are connected. A 3/2 valve at rest: supply closed, outlet to exhaust. The same 3/2 valve actuated: supply to outlet. A 5/2 valve in one state: 1 to 4 and 2 to 3. The 5/2 valve in its other state: 1 to 2 and 4 to 5." });
        slot.append(svg);
        const items = [["3/2 at rest", "32", 0, "push", "spring", 20], ["3/2 actuated", "32", 1, "push", "spring", 215], ["5/2 first state", "52", 1, "pilot", "pilot", 400], ["5/2 other state", "52", 0, "pilot", "pilot", 650]];
        items.forEach(([lab, type, d, l, r, x]) => {
          const g = sv("g"); svg.append(g);
          const v = valve({ type, x: x + 56, y: 56, left: l, right: r, d, lblL: type === "52" ? "14" : "", lblR: type === "52" ? "12" : "" });
          v.setD(d); v.setFlow(true); g.append(v.g);
          const t = txt(x + 79, 150, lab, "b"); g.append(t);
        });
      } else if (id === "circuit-ab" || id === "circuit-abc") {
        const host = HE.el("div"); slot.append(host);
        const s = createSim(host, { mode: "pneu" }); s.configure({ seq: id === "circuit-ab" ? "A+ B+ A- B-" : "A+ B+ C+ A- B- C-" });
      } else if (id === "ladder-ep") {
        const host = HE.el("div"); slot.append(host);
        const s = createSim(host, { mode: "ep" }); s.configure({ seq: "A+ B+ A- B-" });
      } else if (id === "step-ab") {
        stepDiagram(slot, "A+ B+ A- B-");
      } else if (id === "step-abc") {
        stepDiagram(slot, "A+ B+ C+ A- B- C-");
      }
    } catch (e) { console.error("figure", id, e); }
  });
  /* keyboard access: every horizontally scrolling figure box is a focusable, labelled region */
  const tag = () => document.querySelectorAll(".mec-scroll, .diagram-scroll").forEach((el) => {
    if (el.getAttribute("tabindex") === null) el.setAttribute("tabindex", "0");
    if (!el.getAttribute("role")) el.setAttribute("role", "region");
    if (!el.getAttribute("aria-label")) {
      const w = el.closest(".widget"), fg = el.closest("figure");
      const base = w ? (w.querySelector(".widget-title") || {}).textContent : fg ? ((fg.querySelector("figcaption") || {}).textContent || "").split(".")[0] : "";
      el.setAttribute("aria-label", ((base || "Diagram").trim().slice(0, 80)) + " (scrollable)");
    }
  });
  tag(); new MutationObserver(tag).observe(document.body, { childList: true, subtree: true });
})();
