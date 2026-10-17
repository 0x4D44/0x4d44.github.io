/* Analogue electronic control: the widgets for the Redstone Room.
   Every number a widget shows comes from the same rules the text teaches (Data Booklet forms only). */
(function () {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const N = HE.n;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HE.el("canvas", { class: "sim", role: "img", "aria-label": label }); box.append(c); return c; };
  const controls = (box) => { const d = HE.el("div", { class: "sim-controls" }); box.append(d); return d; };
  const FONT = (px, bold) => `${bold ? "700 " : ""}${px}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  const MONO = (px) => `700 ${px}px "JetBrains Mono", ui-monospace, monospace`;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const wrapOf = (sl) => sl.input.closest(".slider");
  const show = (el, on) => { el.hidden = !on; el.style.display = on ? "" : "none"; };

  /* ---- formatting ---- */
  function fmtR(o) {
    if (o >= 1e6) return N(o / 1e6, 2) + " MΩ";
    if (o >= 1e4) return N(o / 1e3, 1) + " kΩ";
    if (o >= 1e3) return N(o / 1e3, 2) + " kΩ";
    return N(o, 1) + " Ω";
  }
  function fmtI(a) {
    const x = Math.abs(a);
    if (x >= 1) return N(a, 2) + " A";
    if (x >= 1e-3) return N(a * 1e3, 2) + " mA";
    return N(a * 1e6, 1) + " µA";
  }
  const fmtV = (v) => N(v, 2) + " V";
  const fmtP = (w) => (Math.abs(w) >= 1 ? N(w, 2) + " W" : N(w * 1e3, 1) + " mW");
  const logPos = (p, lo, hi) => lo * Math.pow(hi / lo, p / 1000);
  const posOf = (v, lo, hi) => Math.round(1000 * Math.log(v / lo) / Math.log(hi / lo));
  const rpos = (p, lo, hi) => Number(logPos(p, lo, hi).toPrecision(2));

  /* ---- sensor tables (identical to the figures in the text) ---- */
  const LDR = [[10, 100], [30, 46], [100, 20], [300, 9.3], [1000, 4.0], [3000, 1.8], [10000, 0.8]]; // lux, kΩ
  const NTC = [[0, 33], [10, 20], [20, 12.5], [30, 8.1], [40, 5.3], [50, 3.6], [60, 2.5], [70, 1.8], [80, 1.3], [90, 1.0]]; // °C, kΩ
  function logInterp(tab, x, logx) {
    const f = logx ? Math.log : (v) => v;
    if (x <= tab[0][0]) x = tab[0][0];
    if (x >= tab[tab.length - 1][0]) x = tab[tab.length - 1][0];
    for (let i = 0; i < tab.length - 1; i++) {
      const [x0, y0] = tab[i], [x1, y1] = tab[i + 1];
      if (x >= x0 && x <= x1) { const t = (f(x) - f(x0)) / (f(x1) - f(x0)); return Math.exp(Math.log(y0) + t * (Math.log(y1) - Math.log(y0))); }
    }
    return tab[tab.length - 1][1];
  }
  const ldrR = (lux) => logInterp(LDR, lux, true) * 1000; // ohms
  const ntcR = (T) => logInterp(NTC, T, false) * 1000;

  /* readouts: a grid of small boxes; returns set(key, text) */
  function readouts(parent, defs) {
    const grid = HE.el("div", { class: "readouts" });
    const m = {};
    defs.forEach(([k, label]) => {
      const b = HE.el("b"); m[k] = b;
      grid.append(HE.el("div", null, b, HE.el("span", { html: label })));
    });
    parent.append(grid);
    return (k, v) => { if (m[k] && m[k].textContent !== v) m[k].textContent = v; };
  }
  const note = (parent, text) => { const p = HE.el("p", { class: "sim-note", role: "status" }); if (text) p.innerHTML = text; parent.append(p); return p; };
  const dotAlong = (pts, d) => { // point at distance d along a polyline
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], L = Math.hypot(x1 - x0, y1 - y0);
      if (d <= L) return [x0 + (x1 - x0) * d / L, y0 + (y1 - y0) * d / L];
      d -= L;
    }
    return pts[pts.length - 1];
  };
  const polyLen = (pts) => { let L = 0; for (let i = 0; i < pts.length - 1; i++) L += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return L; };
  function stroke(ctx, pts, col, w) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
  }
  function txt(ctx, s, x, y, o = {}) {
    ctx.font = o.font || FONT(o.size || 13, o.bold); ctx.fillStyle = o.col || ctx.__ink || "#000";
    ctx.textAlign = o.align || "left"; ctx.textBaseline = o.base || "middle"; ctx.fillText(s, x, y);
  }

  /* =====================================================================
     1. Circuit flow: series, parallel and mixed
     ===================================================================== */
  mount("w-ana-circuit", (box) => {
    let mode = "series", V = 12, R1 = 4, R2 = 6, R3 = 12;
    HE.choice(box, "Circuit", [["series", "Series"], ["parallel", "Parallel"], ["mixed", "R₁ in series with R₂ ∥ R₃"]], mode, (v) => { mode = v; upd(); });
    const cv = canvasIn(box, "Animated circuit. Dots stream round the circuit in the direction of conventional current; faster dots mean more current. The readouts below give each resistor's voltage, current and power.");
    const ctl = controls(box);
    const sV = HE.slider(ctl, { label: "Supply $V$", min: 1, max: 12, step: 0.5, value: V, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { V = v; upd(); } });
    const s1 = HE.slider(ctl, { label: "$R_1$", min: 2, max: 50, step: 1, value: R1, unit: "Ω", fmt: (v) => N(v, 0), oninput: (v) => { R1 = v; upd(); } });
    const s2 = HE.slider(ctl, { label: "$R_2$", min: 2, max: 50, step: 1, value: R2, unit: "Ω", fmt: (v) => N(v, 0), oninput: (v) => { R2 = v; upd(); } });
    const s3 = HE.slider(ctl, { label: "$R_3$", min: 2, max: 50, step: 1, value: R3, unit: "Ω", fmt: (v) => N(v, 0), oninput: (v) => { R3 = v; upd(); } });
    HE.math(ctl);
    const bar = HE.el("div", { class: "btn-row" }); box.append(bar);
    const set = readouts(box, [["rt", "total resistance"], ["i", "current from supply"], ["p", "power from supply"], ["a", "R₁: voltage · current · power"], ["b", "R₂: voltage · current · power"], ["c", "R₃: voltage · current · power"]]);
    const status = note(box);
    let cur = {}; // computed values
    function compute() {
      let c;
      if (mode === "series") {
        const Rt = R1 + R2, I = V / Rt;
        c = { Rt, I, comps: [{ n: 1, R: R1, V: I * R1, I }, { n: 2, R: R2, V: I * R2, I }] };
        c.check = `Kirchhoff 2: ${N(c.comps[0].V, 2)} V + ${N(c.comps[1].V, 2)} V = ${N(c.comps[0].V + c.comps[1].V, 2)} V, the supply. The same ${fmtI(I)} flows through both.`;
      } else if (mode === "parallel") {
        const Rt = 1 / (1 / R1 + 1 / R2), I = V / Rt, i1 = V / R1, i2 = V / R2;
        c = { Rt, I, comps: [{ n: 1, R: R1, V, I: i1 }, { n: 2, R: R2, V, I: i2 }] };
        c.check = `Kirchhoff 1: ${fmtI(i1)} + ${fmtI(i2)} = ${fmtI(i1 + i2)}, the supply current. Each branch has the full ${N(V, 1)} V across it.`;
      } else {
        const R23 = R2 * R3 / (R2 + R3), Rt = R1 + R23, I = V / Rt, V1 = I * R1, V23 = V - V1, i2 = V23 / R2, i3 = V23 / R3;
        c = { Rt, I, R23, comps: [{ n: 1, R: R1, V: V1, I }, { n: 2, R: R2, V: V23, I: i2 }, { n: 3, R: R3, V: V23, I: i3 }] };
        c.check = `Kirchhoff 1 at the node: ${fmtI(i2)} + ${fmtI(i3)} = ${fmtI(i2 + i3)}, the current through R₁. Kirchhoff 2: ${N(V1, 2)} V + ${N(V23, 2)} V = ${N(V, 2)} V.`;
      }
      c.comps.forEach((k) => { k.P = k.V * k.I; });
      c.P = V * c.I;
      cur = c;
    }
    function upd() {
      show(wrapOf(s3), mode === "mixed");
      compute();
      set("rt", fmtR(cur.Rt)); set("i", fmtI(cur.I)); set("p", fmtP(cur.P));
      ["a", "b", "c"].forEach((k, i) => {
        const c = cur.comps[i];
        set(k, c ? `${N(c.V, 2)} V · ${fmtI(c.I)} · ${fmtP(c.P)}` : "(not used)");
      });
      status.textContent = cur.check;
      if (sim) sim.redraw();
    }
    const ph = {};
    var sim = HE.sim(cv, {
      height: (w) => (w < 480 ? 250 : 290), loop: true,
      draw(ctx, t, dt, C, s) {
        ctx.__ink = C.ink;
        if (!cur.comps) return;
        const w = s.w, h = s.h, L = 56, T = 44, B = h - 36, mid = (T + B) / 2;
        const W = w - L - 14;
        const segs = [];
        const dirs = [];
        if (mode === "series") {
          const Rr = w - 24;
          segs.push({ id: "a", pts: [[L, mid - 4], [L, T], [Rr, T]], I: cur.I, comp: { e: 1, c: cur.comps[0], side: "u" } });
          segs.push({ id: "b", pts: [[Rr, T], [Rr, B]], I: cur.I, comp: { e: 0, c: cur.comps[1], side: "l" } });
          segs.push({ id: "c", pts: [[Rr, B], [L, B], [L, mid + 4]], I: cur.I });
        } else {
          const x1 = L + W * 0.3, x2 = L + W * 0.66;
          const par = mode === "parallel";
          const I2 = cur.comps[par ? 0 : 1].I, I3 = cur.comps[par ? 1 : 2].I;
          segs.push({ id: "a", pts: [[L, mid - 4], [L, T], [x1, T]], I: cur.I, comp: par ? null : { e: 0, c: cur.comps[0], side: "r" } });
          segs.push({ id: "b", pts: [[x1, T], [x2, T]], I: I3 });
          segs.push({ id: "c", pts: [[x1, T], [x1, B]], I: I2, comp: { e: 0, c: cur.comps[par ? 0 : 1], side: "r" } });
          segs.push({ id: "d", pts: [[x2, T], [x2, B]], I: I3, comp: { e: 0, c: cur.comps[par ? 1 : 2], side: "r" } });
          segs.push({ id: "e", pts: [[x2, B], [x1, B]], I: I3 });
          segs.push({ id: "f", pts: [[x1, B], [L, B], [L, mid + 4]], I: cur.I });
          dirs.push([x1, T], [x1, B]);
        }
        // wires
        segs.forEach((g) => stroke(ctx, g.pts, C.ink, 2.4));
        // moving dots (conventional current)
        const GAP = 24;
        segs.forEach((g) => {
          const len = polyLen(g.pts), speed = Math.min(300, 30 * g.I);
          if (dt) ph[g.id] = ((ph[g.id] || 0) + speed * dt) % GAP;
          const p0 = ph[g.id] || 0;
          ctx.fillStyle = C.red;
          for (let d = p0; d < len; d += GAP) { const [x, y] = dotAlong(g.pts, d); ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill(); }
        });
        // components
        segs.forEach((g) => {
          if (!g.comp) return;
          const [a, b] = [g.pts[g.comp.e], g.pts[g.comp.e + 1]];
          const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2, horiz = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
          const bw = horiz ? 46 : 16, bh = horiz ? 16 : 46;
          ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4;
          ctx.fillRect(cx - bw / 2, cy - bh / 2, bw, bh); ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
          const c = g.comp.c, l1 = `R${c.n} = ${N(c.R, 0)} Ω`, l2 = `${N(c.V, 2)} V · ${fmtI(c.I)}`;
          if (horiz) { txt(ctx, l1, cx, cy - 24, { align: "center", bold: true, col: C.ink }); txt(ctx, l2, cx, cy + 22, { align: "center", size: 12, col: C.ink2 }); }
          else if (g.comp.side === "l") { txt(ctx, l1, cx - 14, cy - 8, { align: "right", bold: true, col: C.ink }); txt(ctx, l2, cx - 14, cy + 9, { align: "right", size: 12, col: C.ink2 }); }
          else { txt(ctx, l1, cx + 14, cy - 8, { bold: true, col: C.ink }); txt(ctx, l2, cx + 14, cy + 9, { size: 12, col: C.ink2 }); }
        });
        dirs.forEach(([x, y]) => HE.dot(ctx, x, y, C.ink, 3.6));
        // battery
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(L - 16, mid - 4); ctx.lineTo(L + 16, mid - 4); ctx.stroke();
        ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(L - 9, mid + 4); ctx.lineTo(L + 9, mid + 4); ctx.stroke();
        txt(ctx, "+", L + 22, mid - 12, { bold: true, size: 15, col: C.red });
        txt(ctx, `${N(V, 1)} V`, L - 20, mid, { align: "right", bold: true, col: C.ink });
        txt(ctx, "conventional current: + round to −", w - 10, h - 10, { align: "right", size: 11.5, col: C.muted });
      },
    });
    bar.append(HE.playButton(sim));
    upd();
  });

  /* =====================================================================
     2. Sensor divider, characteristic, and a design challenge
     ===================================================================== */
  mount("w-ana-divider", (box) => {
    const st = { sensor: "ldr", pos: "bottom", Vs: 9, Rf: 10000, lux: 100, temp: 40 };
    HE.choice(box, "Sensor", [["ldr", "LDR (light)"], ["ntc", "NTC thermistor (temperature)"]], st.sensor, (v) => { st.sensor = v; upd(); });
    HE.choice(box, "Sensor position", [["bottom", "Sensor at the bottom (V<sub>out</sub> across the sensor)"], ["top", "Sensor at the top"]], st.pos, (v) => { st.pos = v; upd(); });
    const cv = canvasIn(box, "A voltage divider with a sensor and a fixed resistor, beside a graph of the output voltage against the light level or the temperature. A dot marks the present operating point and can be dragged along the curve.");
    const ctl = controls(box);
    const sVs = HE.slider(ctl, { label: "Supply $V_s$", min: 3, max: 12, step: 0.5, value: st.Vs, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.Vs = v; upd(); } });
    const sRf = HE.slider(ctl, { label: "Fixed resistor $R$", min: 0, max: 1000, step: 1, value: posOf(st.Rf, 1e3, 1e6), fmt: (p) => fmtR(rpos(p, 1e3, 1e6)), oninput: (p) => { st.Rf = rpos(p, 1e3, 1e6); upd(); } });
    const sLux = HE.slider(ctl, { label: "Light level", min: 0, max: 1000, step: 1, value: posOf(st.lux, 10, 10000), fmt: (p) => N(logPos(p, 10, 10000), 0) + " lux", oninput: (p) => { st.lux = logPos(p, 10, 10000); upd(); } });
    const sT = HE.slider(ctl, { label: "Temperature", min: 0, max: 90, step: 1, value: st.temp, unit: "°C", fmt: (v) => N(v, 0), oninput: (v) => { st.temp = v; upd(); } });
    HE.math(ctl);
    const bar = HE.el("div", { class: "btn-row" }); box.append(bar);
    const set = readouts(box, [["rs", "sensor resistance"], ["rf", "fixed resistor"], ["vo", "output voltage V<sub>out</sub>"], ["dir", "as the stimulus increases V<sub>out</sub>…"]]);
    const status = note(box);

    const Rs = () => (st.sensor === "ldr" ? ldrR(st.lux) : ntcR(st.temp));
    const vout = (rs) => (st.pos === "bottom" ? st.Vs * rs / (rs + st.Rf) : st.Vs * st.Rf / (rs + st.Rf));
    const stimR = () => (st.sensor === "ldr" ? { lo: 10, hi: 10000, log: true } : { lo: 0, hi: 90, log: false });
    const rsAt = (x) => (st.sensor === "ldr" ? ldrR(x) : ntcR(x));
    const cur = () => (st.sensor === "ldr" ? st.lux : st.temp);
    let plotMap = null;

    function upd() {
      show(wrapOf(sLux), st.sensor === "ldr"); show(wrapOf(sT), st.sensor === "ntc");
      const rs = Rs(), vo = vout(rs);
      set("rs", fmtR(rs)); set("rf", fmtR(st.Rf)); set("vo", fmtV(vo));
      const r = stimR();
      const v1 = vout(rsAt(r.lo + (r.hi - r.lo) * 0.2)), v2 = vout(rsAt(r.lo + (r.hi - r.lo) * 0.8));
      const rising = vout(rsAt(r.hi)) > vout(rsAt(r.lo));
      set("dir", rising ? "RISES" : "FALLS");
      const what = st.sensor === "ldr" ? ["gets brighter", "LDR resistance falls"] : ["gets hotter", "thermistor resistance falls"];
      const share = st.pos === "bottom" ? "the sensor's share of the supply shrinks" : "the fixed resistor's share of the supply grows";
      status.innerHTML = `As it ${what[0]}, the ${what[1]}, so ${st.pos === "bottom" ? "its share of the supply, the voltage across it, falls" : "the fixed resistor takes a bigger share, so the output across the fixed resistor rises"}. ` +
        `Check with the divider rule: $\\dfrac{V_1}{V_2}=\\dfrac{R_1}{R_2}$ gives $V_{out}$ = ${N(vo, 2)} V.`;
      HE.math(status);
      if (sim) sim.redraw();
    }
    var sim = HE.sim(cv, {
      height: (w) => (w < 520 ? 470 : 290),
      draw(ctx, t, dt, C, s) {
        ctx.__ink = C.ink;
        const narrow = s.w < 520;
        // schematic
        const sx = narrow ? s.w / 2 - 20 : 70, top = 26, bot = narrow ? 168 : 252;
        const box1 = (cx, cy, label, sensor) => {
          ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2;
          ctx.fillRect(cx - 9, cy - 20, 18, 40); ctx.strokeRect(cx - 9, cy - 20, 18, 40);
          if (sensor) { ctx.strokeStyle = st.sensor === "ldr" ? C.gold : C.red; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, 25, 0, 7); ctx.stroke(); }
          txt(ctx, label, cx + 30, cy, { bold: true, col: C.ink, size: 12.5 });
        };
        const rail = (y, lab) => { stroke(ctx, [[sx - 28, y], [sx + 28, y]], C.ink, 2.4); txt(ctx, lab, sx - 34, y, { align: "right", bold: true, size: 12.5, col: C.ink }); };
        const upper = st.pos === "bottom" ? "R" : (st.sensor === "ldr" ? "LDR" : "thermistor");
        const lower = st.pos === "bottom" ? (st.sensor === "ldr" ? "LDR" : "thermistor") : "R";
        const H = bot - top, c1 = top + H * 0.25, nodeY = top + H * 0.5, c2 = top + H * 0.75;
        stroke(ctx, [[sx, top], [sx, bot]], C.ink, 2.4);
        stroke(ctx, [[sx, nodeY], [sx + 46, nodeY]], C.sea, 2.2);
        box1(sx, c1, upper, st.pos === "top");
        box1(sx, c2, lower, st.pos === "bottom");
        HE.dot(ctx, sx, nodeY, C.ink, 3.8);
        rail(top, `+${N(st.Vs, 1)} V`); rail(bot, "0 V");
        const vo = vout(Rs());
        txt(ctx, `Vout = ${N(vo, 2)} V`, sx + 52, nodeY, { bold: true, col: C.sea, size: 13 });
        // plot
        const bx = narrow ? { x: 48, y: 206, w: s.w - 66, h: 200 } : { x: 244, y: 22, w: s.w - 262, h: 214 };
        const r = stimR();
        const X0 = r.log ? Math.log(r.lo) : r.lo, X1 = r.log ? Math.log(r.hi) : r.hi;
        const xm = (v) => bx.x + ((r.log ? Math.log(v) : v) - X0) / (X1 - X0) * bx.w;
        const Y = (v) => bx.y + bx.h - v / st.Vs * bx.h;
        const pl = HE.plot(ctx, bx, {
          C, x0: 0, x1: 1, y0: 0, y1: st.Vs, yt: st.Vs > 6 ? 3 : 1, xt: 0.25, yl: "Vout (V)", xl: "", grid: true,
          tf: () => "", ytf: (v) => (v === 0 ? "" : N(v, 0)),
        });
        // x ticks
        const ticks = r.log ? [10, 100, 1000, 10000] : [0, 20, 40, 60, 80];
        ctx.font = FONT(11.5); ctx.fillStyle = C.ink2; ctx.textAlign = "center"; ctx.textBaseline = "top";
        ticks.forEach((v) => { ctx.fillText(r.log ? (v >= 1000 ? v / 1000 + "k" : v) : v, xm(v), bx.y + bx.h + 4); });
        txt(ctx, r.log ? "light level (lux, log scale)" : "temperature (°C)", bx.x + bx.w / 2, bx.y + bx.h + 26, { align: "center", bold: true, size: 12, col: C.ink });
        // curve
        ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
        for (let i = 0; i <= 120; i++) {
          const x = r.log ? Math.exp(X0 + (X1 - X0) * i / 120) : r.lo + (r.hi - r.lo) * i / 120;
          const px = xm(x), py = Y(vout(rsAt(x)));
          i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
        }
        ctx.stroke();
        const cx = xm(cur()), cy = Y(vo);
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]);
        ctx.beginPath(); ctx.moveTo(bx.x, cy); ctx.lineTo(cx, cy); ctx.lineTo(cx, bx.y + bx.h); ctx.stroke(); ctx.setLineDash([]);
        HE.dot(ctx, cx, cy, C.gold, 7, C.ink);
        plotMap = { xm, bx, r, X0, X1 };
      },
    });
    HE.drag(cv, sim, () => (plotMap ? [{ id: "p", x: plotMap.xm(cur()), y: (() => { const b = plotMap.bx; return b.y + b.h - vout(Rs()) / st.Vs * b.h; })() }] : []), (id, x) => {
      const m = plotMap; if (!m) return;
      const f = clamp((x - m.bx.x) / m.bx.w, 0, 1);
      if (st.sensor === "ldr") sLux.set(Math.round(f * 1000)); else sT.set(Math.round(f * 90));
    }, 34);

    /* ---- design challenge ---- */
    const chalBtn = HE.el("button", { class: "btn small", type: "button" }, "Design challenge");
    bar.append(chalBtn);
    const chalPanel = HE.el("div", { class: "ana-chal", hidden: true });
    box.append(chalPanel);
    let chal = null;
    const qEl = HE.el("p", { class: "ana-q" });
    const inp = HE.el("input", { type: "number", step: "any", inputmode: "decimal", id: "ana-dv-in", "aria-label": "Your answer for the fixed resistor in kilo-ohms" });
    const chk = HE.el("button", { class: "btn small primary", type: "button" }, "Check");
    const hintBtn = HE.el("button", { class: "btn small", type: "button" }, "Show steps");
    const nextBtn = HE.el("button", { class: "btn small", type: "button" }, "New question");
    const fb = HE.el("p", { class: "ana-fb", role: "status" });
    const sol = HE.el("ol", { class: "ana-steps ana-sol", hidden: true });
    chalPanel.append(qEl, HE.el("div", { class: "ana-row" }, HE.el("label", { class: "ana-in", for: "ana-dv-in" }, "R = ", inp, " kΩ"), chk, hintBtn, nextBtn), fb, sol);
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    function newQ() {
      const sensor = st.sensor, pos = st.pos;
      const Vs = pick([5, 6, 9, 12]);
      const stim = sensor === "ldr" ? pick([30, 100, 300, 1000]) : pick([20, 30, 40, 50, 60]);
      const rs = (sensor === "ldr" ? ldrR(stim) : ntcR(stim)) / 1000; // kΩ
      const rsR = Math.round(rs * 10) / 10;
      const Vt = Math.round(Vs * pick([0.3, 0.4, 0.5, 0.6, 0.7]) * 2) / 2;
      const R = pos === "bottom" ? rsR * (Vs - Vt) / Vt : rsR * Vt / (Vs - Vt);
      chal = { sensor, pos, Vs, stim, rs: rsR, Vt, R };
      const name = sensor === "ldr" ? `an LDR (${rsR} kΩ at ${stim} lux)` : `an NTC thermistor (${rsR} kΩ at ${stim} °C)`;
      const where = pos === "bottom" ? "lower resistor (the output is taken across it)" : "upper resistor (the output is taken across the fixed resistor below it)";
      qEl.innerHTML = `A ${Vs} V supply feeds a divider made of ${name} as the ${where}, and a fixed resistor $R$. Choose $R$ so that $V_{out}$ is <b>${Vt} V</b> at ${stim}${sensor === "ldr" ? " lux" : " °C"}.`;
      HE.math(qEl);
      inp.value = ""; fb.textContent = ""; fb.className = "ana-fb"; sol.hidden = true; sol.innerHTML = "";
      // let the main widget show the same circuit so the answer can be tried out
      sVs.set(Vs);
      if (sensor === "ldr") sLux.set(posOf(stim, 10, 10000)); else sT.set(stim);
    }
    function steps() {
      const c = chal, Vtop = c.pos === "bottom" ? c.Vs - c.Vt : c.Vt, rsK = c.rs;
      const fixedV = c.pos === "bottom" ? c.Vs - c.Vt : c.Vt, sensV = c.pos === "bottom" ? c.Vt : c.Vs - c.Vt;
      const l = [];
      l.push(`Voltage across the sensor: ${c.pos === "bottom" ? "this is $V_{out}$, " : c.Vs + " − " + c.Vt + " = "}<b>${N(sensV, 2)} V</b>.`);
      l.push(`Voltage across the fixed resistor: ${c.pos === "bottom" ? c.Vs + " − " + c.Vt + " =" : "this is $V_{out}$ ="} <b>${N(fixedV, 2)} V</b>. <i>(The two voltages add to the supply.)</i>`);
      l.push(`Use the Booklet form $\\dfrac{V_1}{V_2}=\\dfrac{R_1}{R_2}$ with 1 = fixed resistor, 2 = sensor: $\\dfrac{${N(fixedV, 2)}}{${N(sensV, 2)}}=\\dfrac{R}{${rsK}}$.`);
      l.push(`Rearrange: $R = ${rsK} \\times \\dfrac{${N(fixedV, 2)}}{${N(sensV, 2)}} = $ <b>${N(c.R, 2)} kΩ</b>.`);
      sol.innerHTML = l.map((x) => `<li>${x}</li>`).join(""); HE.math(sol); sol.hidden = false;
    }
    chk.addEventListener("click", () => {
      if (!chal) return;
      const v = parseFloat(inp.value);
      if (!isFinite(v)) { fb.textContent = "Type a number in kΩ first."; fb.className = "ana-fb"; return; }
      if (Math.abs(v - chal.R) <= 0.03 * chal.R) {
        fb.innerHTML = `<span class="ana-ok">Correct.</span> $R$ = ${N(chal.R, 2)} kΩ. Now move the sliders and see $V_{out}$ land on ${chal.Vt} V (set the fixed-resistor slider to about ${N(chal.R, 1)} kΩ).`;
        sRf.set(posOf(clamp(chal.R * 1000, 1e3, 1e6), 1e3, 1e6));
      } else {
        const flip = chal.pos === "bottom" ? chal.rs * chal.Vt / (chal.Vs - chal.Vt) : chal.rs * (chal.Vs - chal.Vt) / chal.Vt;
        const ratioHint = Math.abs(v - flip) <= 0.03 * flip ? " That is what you get with the ratio the wrong way up: check which resistor is which."
          : Math.abs(v - chal.rs) <= 0.03 * chal.rs ? " You copied the sensor's resistance; you need the other resistor." : "";
        fb.innerHTML = `<span class="ana-bad">Not quite.</span>${ratioHint} Remember the biggest resistor takes the biggest share of the voltage. Try <b>Show steps</b>.`;
      }
      HE.math(fb);
    });
    hintBtn.addEventListener("click", () => { if (chal) steps(); });
    nextBtn.addEventListener("click", newQ);
    chalBtn.addEventListener("click", () => {
      chalPanel.hidden = !chalPanel.hidden;
      chalBtn.setAttribute("aria-expanded", String(!chalPanel.hidden));
      if (!chalPanel.hidden && !chal) newQ();
    });
    chalBtn.setAttribute("aria-expanded", "false");
    upd();
  });

  /* =====================================================================
     3. Flyback: with and without the diode
     ===================================================================== */
  mount("w-ana-flyback", (box) => {
    const Vs = 12;
    let diode = false, swOn = true, tOff = null, t0 = 0;
    const hist = []; // {t, v, i}
    const WIN = 4;
    const cv = canvasIn(box, "Oscilloscope-style graph of the voltage at the transistor end of a relay coil. While the switch is on the voltage is near zero. When the switch opens, without a diode the voltage spikes far above the supply; with a diode it only rises 0.7 volts above the supply. A second trace shows the coil current.");
    const bar = HE.el("div", { class: "btn-row" }); box.append(bar);
    const bDiode = HE.el("button", { class: "btn small", type: "button", "aria-pressed": "false" });
    const bSw = HE.el("button", { class: "btn small", type: "button", "aria-pressed": "true" });
    const status = note(box);
    function eval_(t) { // voltage and coil current at time t
      if (swOn) return { v: 0.2, i: 1 };
      const dt = t - tOff;
      if (diode) {
        const i = Math.exp(-dt / 0.55);
        return { v: Vs + 0.7 * (i > 0.03 ? 1 : i / 0.03), i };
      }
      const i = Math.exp(-dt / 0.03);
      return { v: Vs + 44 * Math.exp(-dt / 0.06), i };
    }
    function label() {
      bDiode.textContent = diode ? "Diode: IN the circuit" : "Diode: NOT in the circuit";
      bDiode.setAttribute("aria-pressed", String(diode));
      bSw.textContent = swOn ? "Switch: ON (press to open it)" : "Switch: OFF (press to close it)";
      bSw.setAttribute("aria-pressed", String(swOn));
      status.innerHTML = swOn
        ? "The transistor is on and the coil carries a steady current. The collector sits near 0 V. Open the switch."
        : diode
          ? "The coil's collapsing field pushes current round through the diode, so the collector only reaches the supply plus 0.7 V and the current dies away slowly. The transistor is safe."
          : "With nowhere to go, the collapsing field makes a huge voltage across the coil, added on top of the supply. The spike can exceed the transistor's rating. This graph's height is qualitative.";
    }
    bar.append(bDiode, bSw);
    var sim = HE.sim(cv, {
      height: (w) => (w < 480 ? 250 : 290), loop: true,
      draw(ctx, t, dt, C, s) {
        if (dt || !hist.length) { // advance history
          t0 = t;
          const e = eval_(t);
          if (!hist.length || t - hist[hist.length - 1].t > 0.016) hist.push({ t, v: e.v, i: e.i });
          while (hist.length > 2 && hist[0].t < t - WIN) hist.shift();
        }
        const bx = { x: 52, y: 18, w: s.w - 68, h: s.h - 62 };
        const vmax = 60;
        const X = (tt) => bx.x + (tt - (t - WIN)) / WIN * bx.w;
        const Y = (v) => bx.y + bx.h - clamp(v, -2, vmax) / vmax * bx.h;
        ctx.fillStyle = C.paper; ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
        ctx.strokeStyle = C.line; ctx.lineWidth = 0.7;
        [0, 12, 24, 36, 48, 60].forEach((v) => { ctx.beginPath(); ctx.moveTo(bx.x, Y(v)); ctx.lineTo(bx.x + bx.w, Y(v)); ctx.stroke(); txt(ctx, v + " V", bx.x - 6, Y(v), { align: "right", size: 11.5, col: C.ink2 }); });
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(bx.x, bx.y, bx.w, bx.h);
        // supply line
        ctx.strokeStyle = C.gold; ctx.setLineDash([6, 4]); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx.x, Y(Vs)); ctx.lineTo(bx.x + bx.w, Y(Vs)); ctx.stroke(); ctx.setLineDash([]);
        txt(ctx, "supply +12 V", bx.x + bx.w - 4, Y(Vs) - 9, { align: "right", size: 11.5, bold: true, col: C.ink });
        // transistor limit
        ctx.strokeStyle = C.red; ctx.setLineDash([2, 4]); ctx.beginPath(); ctx.moveTo(bx.x, Y(40)); ctx.lineTo(bx.x + bx.w, Y(40)); ctx.stroke(); ctx.setLineDash([]);
        txt(ctx, "a typical transistor's limit (qualitative)", bx.x + 6, Y(40) - 9, { size: 11.5, col: C.red });
        // traces
        HE.clip(ctx, bx, () => {
          ctx.lineWidth = 3; ctx.lineJoin = "round";
          ctx.strokeStyle = C.red; ctx.beginPath(); hist.forEach((p, k) => (k ? ctx.lineTo(X(p.t), Y(p.v)) : ctx.moveTo(X(p.t), Y(p.v)))); ctx.stroke();
          ctx.strokeStyle = C.sea; ctx.lineWidth = 2.2; ctx.setLineDash([7, 4]);
          ctx.beginPath(); hist.forEach((p, k) => (k ? ctx.lineTo(X(p.t), Y(3 + p.i * 7)) : ctx.moveTo(X(p.t), Y(3 + p.i * 7)))); ctx.stroke(); ctx.setLineDash([]);
        });
        txt(ctx, "voltage at the collector", bx.x + 6, bx.y + 12, { bold: true, size: 12, col: C.red });
        txt(ctx, "- - coil current (scaled)", bx.x + 6, bx.y + 29, { bold: true, size: 12, col: C.sea });
        txt(ctx, "time (the graph scrolls)", bx.x + bx.w, bx.y + bx.h + 18, { align: "right", bold: true, size: 12, col: C.ink });
      },
    });
    // pre-fill four seconds of history: switch on, then opened 2 s in (no diode)
    (function prefill() {
      swOn = true; const save = diode; diode = false;
      for (let tt = 0; tt <= 2.0; tt += 0.016) hist.push({ t: tt, v: 0.2, i: 1 });
      swOn = false; tOff = 2.0;
      for (let tt = 2.0; tt <= 3.6; tt += 0.016) { const e = eval_(tt); hist.push({ t: tt, v: e.v, i: e.i }); }
      diode = save; sim.t = 3.6; sim.redraw();
      swOn = true; // present state: closed (so the user opens it); history shows a demo
    })();
    const kick = () => { if (!sim.playing) { sim.play(); pb.sync(); } };
    bDiode.addEventListener("click", () => { diode = !diode; label(); kick(); });
    bSw.addEventListener("click", () => { swOn = !swOn; if (!swOn) tOff = sim.t; label(); kick(); });
    const pb = HE.playButton(sim); bar.append(pb);
    label();
  });

  /* =====================================================================
     4. The lock gate: a trickle controls a torrent
     ===================================================================== */
  mount("w-ana-valve", (box) => {
    let Ib = 60, hfe = 100, cap = 20; // µA, gain, mA the load can supply
    const cv = canvasIn(box, "Animated lock-gate picture of a transistor. A thin pipe from above carries the base current and pushes the gate open. The big pipe carries the collector current through the gate. The more the gate opens the more water flows, until the supply can give no more.");
    const ctl = controls(box);
    HE.slider(ctl, { label: "Base current $I_B$", min: 0, max: 400, step: 1, value: Ib, unit: "µA", fmt: (v) => N(v, 0), oninput: (v) => { Ib = v; upd(); } });
    HE.slider(ctl, { label: "Gain $h_{FE}$", min: 20, max: 300, step: 5, value: hfe, fmt: (v) => N(v, 0), oninput: (v) => { hfe = v; upd(); } });
    HE.slider(ctl, { label: "Most the load can pass $V_s/R_L$", min: 5, max: 100, step: 1, value: cap, unit: "mA", fmt: (v) => N(v, 0), oninput: (v) => { cap = v; upd(); } });
    HE.math(ctl);
    const bar = HE.el("div", { class: "btn-row" }); box.append(bar);
    const set = readouts(box, [["ib", "base current I<sub>B</sub>"], ["pot", "h<sub>FE</sub> × I<sub>B</sub> (what the gain would give)"], ["ic", "collector current I<sub>C</sub> (what flows)"], ["st", "region"]]);
    const status = note(box);
    let Ic = 0, pot = 0, sat = false;
    function upd() {
      pot = hfe * Ib / 1000; Ic = Math.min(pot, cap); sat = pot >= cap && Ib > 0;
      set("ib", N(Ib, 0) + " µA"); set("pot", N(pot, 1) + " mA"); set("ic", N(Ic, 1) + " mA");
      set("st", Ib === 0 ? "CUT-OFF" : sat ? "SATURATED" : "ACTIVE");
      status.textContent = Ib === 0 ? "No base current: the gate is shut and no collector current flows. This is cut-off."
        : sat ? `The gain would give ${N(pot, 1)} mA, but the supply and load can only pass ${N(cap, 0)} mA. The gate is wide open, so the load sets the current. Raising IB further changes nothing: this is saturation.`
          : `Active region: IC = hFE × IB = ${N(hfe, 0)} × ${N(Ib, 0)} µA = ${N(pot, 1)} mA. The gate is part open.`;
      if (sim) sim.redraw();
    }
    const ph = { a: 0, b: 0 };
    var sim = HE.sim(cv, {
      height: (w) => (w < 480 ? 280 : 300), loop: true,
      draw(ctx, t, dt, C, s) {
        ctx.__ink = C.ink;
        const w = s.w, h = s.h, pT = h * 0.52, pB = h * 0.9, gx = w * 0.5, ph0 = pB - pT;
        const open = clamp(Ic / cap, 0, 1), gap = Ib === 0 ? 0 : Math.max(5, open * ph0);
        const waterCol = "rgba(40,120,200,0.38)";
        // supply tank (left) and pipe
        ctx.fillStyle = waterCol; ctx.fillRect(0, pT - 36, 58, ph0 + 36);
        ctx.fillRect(58, pT, gx - 58, ph0);
        const wh = gap > 0 ? Math.max(gap, 0.2 * ph0) : 0; ctx.fillRect(gx, pB - wh, w - gx, wh);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6;
        stroke(ctx, [[58, pT - 36], [0, pT - 36]], C.ink, 2.6);
        stroke(ctx, [[58, pT - 36], [58, pT], [w, pT]], C.ink, 2.6);
        stroke(ctx, [[0, pB], [w, pB]], C.ink, 2.6);
        txt(ctx, "supply (Vs), with the load", 4, pT - 48, { size: 12, bold: true, col: C.ink });
        txt(ctx, "IC", w - 8, pT + 16, { align: "right", bold: true, size: 13, col: C.sea });
        // gate (door)
        const doorBot = pB - gap;
        ctx.fillStyle = C.gold; ctx.strokeStyle = C.ink; ctx.lineWidth = 2.2;
        ctx.fillRect(gx - 6, pT - 34, 12, doorBot - (pT - 34)); ctx.strokeRect(gx - 6, pT - 34, 12, doorBot - (pT - 34));
        // control pipe (thin) from the top
        ctx.fillStyle = waterCol; ctx.fillRect(gx - 5, 30, 10, pT - 34 - 30);
        stroke(ctx, [[gx - 5, 30], [gx - 5, pT - 34]], C.ink, 2); stroke(ctx, [[gx + 5, 30], [gx + 5, pT - 34]], C.ink, 2);
        txt(ctx, "IB", gx + 14, 56, { bold: true, size: 13, col: C.red });
        txt(ctx, "base: the thin pipe", gx + 14, 74, { size: 12, col: C.ink2 });
        txt(ctx, "the gate", gx + 14, pT - 22, { size: 12, col: C.ink2 });
        // particles
        const spB = Math.min(150, 0.45 * Ib), spC = Math.min(260, 6 * Ic);
        if (dt) { ph.a = (ph.a + spB * dt) % 20; ph.b = (ph.b + spC * dt) % 26; }
        ctx.fillStyle = C.red;
        if (Ib > 0) for (let y = 30 + ph.a; y < pT - 40; y += 20) { ctx.beginPath(); ctx.arc(gx, y, 3, 0, 7); ctx.fill(); }
        ctx.fillStyle = C.sea;
        const lanes = Ib === 0 ? 0 : Math.max(1, Math.ceil(open * 5));
        const laneH = ph0 / 5;
        for (let k = 0; k < lanes; k++) {
          const y = pB - (k + 0.5) * laneH;
          for (let x = ph.b - 26; x < w; x += 26) {
            if (x < 62 || (x > gx - 8 && x < gx + 8)) continue;
            if (x < gx && y < pB - gap) continue;
            ctx.beginPath(); ctx.arc(x, y, 3.4, 0, 7); ctx.fill();
          }
        }
        if (Ib === 0) txt(ctx, "gate shut", gx + 18, pB - 14, { bold: true, size: 13, col: C.ink });
        else if (sat) txt(ctx, "gate wide open: the load sets the flow", w - 8, pB + 16, { align: "right", bold: true, size: 12, col: C.grass });
        else txt(ctx, `gate ${N(open * 100, 0)}% open`, w - 8, pB + 16, { align: "right", bold: true, size: 12, col: C.ink });
      },
    });
    bar.append(HE.playButton(sim));
    upd();
  });

  /* =====================================================================
     5. BJT driver: base current, collector current, VCE, power
     ===================================================================== */
  mount("w-ana-bjt", (box) => {
    const st = { Vs: 9, Vin: 5, Rb: 10000, hfe: 100, RL: 180, vsat: 0.2 };
    HE.choice(box, "Saturated VCE", [[0, "0 V"], [0.2, "0.2 V"]], st.vsat, (v) => { st.vsat = +v; upd(); });
    const cv = canvasIn(box, "Two graphs for a transistor driver. Left: collector current against base current, rising with slope hFE then flat at the load limit. Right: power dissipated in the transistor against base current, rising to a peak in the active region and falling to almost nothing when saturated. A dot shows the present operating point.");
    const ctl = controls(box);
    HE.slider(ctl, { label: "Supply $V_s$", min: 3, max: 15, step: 0.5, value: st.Vs, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.Vs = v; upd(); } });
    HE.slider(ctl, { label: "Input $V_{in}$", min: 0, max: 12, step: 0.1, value: st.Vin, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.Vin = v; upd(); } });
    HE.slider(ctl, { label: "Base resistor $R_B$", min: 0, max: 1000, step: 1, value: posOf(st.Rb, 1e3, 1e6), fmt: (p) => fmtR(rpos(p, 1e3, 1e6)), oninput: (p) => { st.Rb = rpos(p, 1e3, 1e6); upd(); } });
    HE.slider(ctl, { label: "Gain $h_{FE}$", min: 20, max: 300, step: 5, value: st.hfe, fmt: (v) => N(v, 0), oninput: (v) => { st.hfe = v; upd(); } });
    HE.slider(ctl, { label: "Load $R_L$", min: 0, max: 1000, step: 1, value: posOf(st.RL, 10, 1000), fmt: (p) => fmtR(rpos(p, 10, 1000)), oninput: (p) => { st.RL = rpos(p, 10, 1000); upd(); } });
    HE.math(ctl);
    const set = readouts(box, [["ib", "base current I<sub>B</sub> = (V<sub>in</sub> − 0.7) ÷ R<sub>B</sub>"], ["pot", "h<sub>FE</sub> I<sub>B</sub>"], ["lim", "most the load allows (V<sub>s</sub> − V<sub>CE(sat)</sub>) ÷ R<sub>L</sub>"], ["ic", "collector current I<sub>C</sub>"], ["vce", "V<sub>CE</sub>"], ["p", "power in transistor V<sub>CE</sub> I<sub>C</sub>"], ["reg", "region"], ["rbmax", "largest R<sub>B</sub> that saturates it"]]);
    const status = note(box);
    function solve(ib /* A */) {
      const lim = (st.Vs - st.vsat) / st.RL, pot = st.hfe * ib;
      if (ib <= 0) return { ib: 0, ic: 0, vce: st.Vs, p: 0, reg: "CUT-OFF", lim, pot: 0 };
      if (pot >= lim) return { ib, ic: lim, vce: st.vsat, p: st.vsat * lim, reg: "SATURATED", lim, pot };
      const ic = pot, vce = st.Vs - ic * st.RL;
      return { ib, ic, vce, p: vce * ic, reg: "ACTIVE", lim, pot };
    }
    let cur = null, ibSat = 0;
    function upd() {
      const ib = Math.max(0, (st.Vin - 0.7) / st.Rb);
      cur = solve(ib);
      ibSat = cur.lim / st.hfe;
      set("ib", fmtI(cur.ib)); set("pot", fmtI(cur.pot)); set("lim", fmtI(cur.lim)); set("ic", fmtI(cur.ic));
      set("vce", fmtV(cur.vce)); set("p", fmtP(cur.p)); set("reg", cur.reg);
      set("rbmax", st.Vin > 0.7 ? fmtR((st.Vin - 0.7) / ibSat) : "n/a (Vin below 0.7 V)");
      status.textContent = cur.reg === "CUT-OFF" ? `Vin is below the 0.7 V needed across the base–emitter junction, so there is no base current and no collector current. VCE = Vs.`
        : cur.reg === "SATURATED" ? `hFE × IB (${fmtI(cur.pot)}) is more than the load can take (${fmtI(cur.lim)}), so the transistor is saturated: IC is set by the load, VCE is about ${st.vsat} V and the transistor itself dissipates almost nothing. This is the switch-on state.`
          : `Active: IC = hFE × IB = ${fmtI(cur.ic)}. The load drops ${N(cur.ic * st.RL, 2)} V, so VCE = ${N(st.Vs, 1)} − ${N(cur.ic * st.RL, 2)} = ${N(cur.vce, 2)} V and the transistor dissipates ${fmtP(cur.p)}, which is wasted as heat.`;
      if (sim) sim.redraw();
    }
    var sim = HE.sim(cv, {
      height: (w) => (w < 600 ? 430 : 250),
      draw(ctx, t, dt, C, s) {
        ctx.__ink = C.ink;
        if (!cur) return;
        const narrow = s.w < 600;
        const boxes = narrow
          ? [{ x: 52, y: 16, w: s.w - 70, h: 150 }, { x: 52, y: 232, w: s.w - 70, h: 150 }]
          : [{ x: 52, y: 16, w: (s.w - 112) / 2, h: 176 }, { x: 52 + (s.w - 112) / 2 + 60, y: 16, w: (s.w - 112) / 2, h: 176 }];
        const ibMax = Math.max(1.6 * ibSat, 1.25 * cur.ib, 1e-6);
        const unitI = ibMax < 1e-3 ? 1e6 : 1e3, uI = ibMax < 1e-3 ? "µA" : "mA";
        const sweep = []; for (let i = 0; i <= 160; i++) sweep.push(solve(ibMax * i / 160));
        const icMax = Math.max(cur.lim * 1.15, cur.ic * 1.1) * 1000;
        const pMax = Math.max(...sweep.map((q) => q.p), cur.p) * 1000 * 1.15 || 1;
        const defs = [
          { box: boxes[0], yl: "IC (mA)", ymax: icMax, f: (q) => q.ic * 1000, now: cur.ic * 1000, col: C.red },
          { box: boxes[1], yl: "Power in transistor (mW)", ymax: pMax, f: (q) => q.p * 1000, now: cur.p * 1000, col: C.gold },
        ];
        defs.forEach((d) => {
          const bx = d.box;
          const xs = HE.niceStep(ibMax * unitI * 1.8);
          const ys = HE.niceStep(d.ymax * 1.8);
          const pl = HE.plot(ctx, bx, { C, x0: 0, x1: ibMax * unitI, y0: 0, y1: d.ymax, xt: xs, yt: ys, yl: d.yl, xl: `Ib (${uI})`, grid: true });
          ctx.strokeStyle = d.col; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
          sweep.forEach((q, i) => { const x = pl.X(ibMax * unitI * i / 160), y = pl.Y(d.f(q)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
          ctx.stroke();
          // saturation boundary
          ctx.strokeStyle = C.muted; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(pl.X(ibSat * unitI), bx.y); ctx.lineTo(pl.X(ibSat * unitI), bx.y + bx.h); ctx.stroke(); ctx.setLineDash([]);
          txt(ctx, "saturated →", pl.X(ibSat * unitI) + 5, bx.y + bx.h * 0.62, { size: 11.5, col: C.ink2 });
          const px = pl.X(Math.min(cur.ib, ibMax) * unitI), py = pl.Y(d.now);
          ctx.strokeStyle = C.ink; ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, bx.y + bx.h); ctx.stroke(); ctx.setLineDash([]);
          HE.dot(ctx, px, py, C.sea, 6.5, C.ink);
        });
      },
    });
    upd();
  });

  /* =====================================================================
     6. MOSFET transfer curve
     ===================================================================== */
  mount("w-ana-mosfet", (box) => {
    const VTH = 2.0, K = 0.4;
    const st = { Vs: 12, RL: 6, Vgs: 4, dV: 0.5 };
    const f = (v) => (v > VTH ? K * (v - VTH) * (v - VTH) : 0);
    const cv = canvasIn(box, "Transfer curve of an n-channel MOSFET: drain current against gate-source voltage, zero below the 2 volt threshold and then rising steeply. A dot can be dragged along it. A dashed line marks the most current the solenoid load can pass, and a small triangle shows the transconductance as change in current over change in voltage.");
    const ctl = controls(box);
    const sG = HE.slider(ctl, { label: "Gate voltage $V_{GS}$", min: 0, max: 6, step: 0.05, value: st.Vgs, unit: "V", fmt: (v) => N(v, 2), oninput: (v) => { st.Vgs = v; upd(); } });
    HE.slider(ctl, { label: "Supply $V_s$", min: 6, max: 24, step: 1, value: st.Vs, unit: "V", fmt: (v) => N(v, 0), oninput: (v) => { st.Vs = v; upd(); } });
    HE.slider(ctl, { label: "Solenoid $R_L$", min: 2, max: 20, step: 0.5, value: st.RL, unit: "Ω", fmt: (v) => N(v, 1), oninput: (v) => { st.RL = v; upd(); } });
    HE.slider(ctl, { label: "Step for $g_m$: $\\Delta V_{GS}$", min: 0.1, max: 1, step: 0.1, value: st.dV, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.dV = v; upd(); } });
    HE.math(ctl);
    const set = readouts(box, [["id", "drain current I<sub>D</sub>"], ["vl", "drop over solenoid I<sub>D</sub> R<sub>L</sub>"], ["vds", "V<sub>DS</sub> = V<sub>s</sub> − drop"], ["p", "power in MOSFET V<sub>DS</sub> I<sub>D</sub>"], ["gm", "g<sub>m</sub> = ΔI<sub>D</sub> ÷ ΔV<sub>GS</sub>"], ["reg", "state"]]);
    const status = note(box);
    let op = null;
    function upd() {
      const want = f(st.Vgs), lim = st.Vs / st.RL, Id = Math.min(want, lim);
      const drop = Id * st.RL, vds = st.Vs - drop, P = vds * Id, v2 = Math.min(6, st.Vgs + st.dV), v1 = v2 - st.dV;
      const gm = (f(v2) - f(v1)) / (v2 - v1);
      op = { want, lim, Id, drop, vds, P, v1, v2, gm };
      set("id", N(Id, 2) + " A"); set("vl", fmtV(drop)); set("vds", fmtV(vds)); set("p", fmtP(P)); set("gm", N(gm, 2) + " S");
      set("reg", st.Vgs <= VTH ? "OFF" : want >= lim ? "FULLY ON" : "ON");
      status.textContent = st.Vgs <= VTH ? `VGS (${N(st.Vgs, 2)} V) is not above the threshold voltage of 2.0 V, so no drain current flows: the MOSFET is off and the solenoid is not energised.`
        : want >= lim ? `The curve asks for ${N(want, 2)} A but the solenoid can only pass ${N(lim, 2)} A, so the MOSFET is fully on: VDS is about 0 V and it dissipates almost nothing. The load sets the current.`
          : `Read ID = ${N(Id, 2)} A from the curve. The solenoid drops ${N(Id, 2)} × ${N(st.RL, 1)} = ${N(drop, 2)} V, so VDS = ${N(st.Vs, 0)} − ${N(drop, 2)} = ${N(vds, 2)} V and P = VDS × ID = ${N(P, 2)} W.`;
      if (sim) sim.redraw();
    }
    let map = null;
    var sim = HE.sim(cv, {
      height: (w) => (w < 520 ? 320 : 310),
      draw(ctx, t, dt, C, s) {
        ctx.__ink = C.ink;
        if (!op) return;
        const bx = { x: 52, y: 16, w: s.w - 72, h: s.h - 58 };
        const ymax = 7;
        const pl = HE.plot(ctx, bx, { C, x0: 0, x1: 6, y0: 0, y1: ymax, xt: 1, yt: 1, xl: "VGS (V)", yl: "ID (A)", grid: true });
        map = pl;
        // off region
        ctx.fillStyle = C.gold; ctx.globalAlpha = 0.16; ctx.fillRect(bx.x, bx.y, pl.X(VTH) - bx.x, bx.h); ctx.globalAlpha = 1;
        ["OFF:", "below the", "threshold"].forEach((l, i) => txt(ctx, l, bx.x + 6, bx.y + bx.h * 0.45 + i * 14, { size: 11.5, col: C.ink2, bold: i === 0 }));
        // load limit
        const ly = pl.Y(Math.min(op.lim, ymax));
        if (op.lim <= ymax) {
          ctx.strokeStyle = C.sea; ctx.lineWidth = 1.8; ctx.setLineDash([7, 4]); ctx.beginPath(); ctx.moveTo(bx.x, ly); ctx.lineTo(bx.x + bx.w, ly); ctx.stroke(); ctx.setLineDash([]);
          txt(ctx, `load limit Vs/RL = ${N(op.lim, 2)} A`, bx.x + 6, ly - 9, { size: 11.5, bold: true, col: C.sea });
        }
        // curve
        ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.lineJoin = "round"; ctx.beginPath();
        for (let i = 0; i <= 150; i++) { const v = 6 * i / 150, x = pl.X(v), y = pl.Y(f(v)); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        ctx.stroke();
        // threshold marker
        HE.dot(ctx, pl.X(VTH), pl.Y(0), C.card, 4.5, C.ink);
        txt(ctx, "Vth = 2.0 V", pl.X(VTH) - 4, bx.y + bx.h - 14, { align: "right", size: 11.5, bold: true, col: C.ink });
        // gm triangle
        const a = [pl.X(op.v1), pl.Y(f(op.v1))], b = [pl.X(op.v2), pl.Y(f(op.v2))];
        if (op.v2 > op.v1 && f(op.v2) > 0) {
          ctx.strokeStyle = C.grass; ctx.lineWidth = 2; ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
          ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); ctx.setLineDash([]);
          txt(ctx, `gm = ${N(op.gm, 2)} S`, Math.min(b[0] + 6, bx.x + bx.w - 4), a[1] + 16, { align: b[0] + 80 > bx.x + bx.w ? "right" : "left", size: 12, bold: true, col: C.grass });
        }
        // operating dot
        const px = pl.X(st.Vgs), py = pl.Y(f(st.Vgs));
        ctx.strokeStyle = C.gold; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(bx.x, py); ctx.lineTo(px, py); ctx.lineTo(px, bx.y + bx.h); ctx.stroke(); ctx.setLineDash([]);
        HE.dot(ctx, px, py, C.gold, 8, C.ink);
        txt(ctx, `VGS = ${N(st.Vgs, 2)} V`, px > bx.x + bx.w - 100 ? px - 10 : px + 10, bx.y + 24, { size: 12, bold: true, col: C.ink, align: px > bx.x + bx.w - 100 ? "right" : "left" });
      },
    });
    HE.drag(cv, sim, () => (map ? [{ id: "g", x: map.X(st.Vgs), y: map.Y(f(st.Vgs)) }] : []), (id, x) => {
      const v = clamp(Math.round((x - 52) / (sim.w - 72) * 6 / 0.05) * 0.05, 0, 6);
      sG.set(+v.toFixed(2));
    }, 34);

    // the 2024-report method, run backwards: from VDS to VGS
    const panel = HE.el("div", { class: "ana-chal" });
    box.append(panel);
    const inp = HE.el("input", { type: "number", step: "any", inputmode: "decimal", id: "ana-ms-vds", value: "2.4", "aria-label": "V DS in volts" });
    const go = HE.el("button", { class: "btn small primary", type: "button" }, "Find the gate voltage");
    const out = HE.el("ol", { class: "ana-steps ana-sol", "aria-live": "polite" });
    panel.append(HE.el("p", { class: "ana-q", html: "<b>The method in reverse.</b> The question gives $V_{DS}$ and asks for $V_{GS}$. Enter $V_{DS}$ for the supply and solenoid set above, and see the three steps." }),
      HE.el("div", { class: "ana-row" }, HE.el("label", { class: "ana-in", for: "ana-ms-vds" }, "VDS = ", inp, " V"), go), out);
    HE.math(panel);
    go.addEventListener("click", () => {
      const vds = parseFloat(inp.value);
      if (!isFinite(vds) || vds < 0 || vds > st.Vs) { out.innerHTML = `<li>Enter a V<sub>DS</sub> between 0 and the supply (${N(st.Vs, 0)} V).</li>`; return; }
      const drop = st.Vs - vds, Id = drop / st.RL;
      const lim = [];
      lim.push(`Voltage across the solenoid = supply − V<sub>DS</sub> = ${N(st.Vs, 0)} − ${N(vds, 2)} = <b>${N(drop, 2)} V</b>.`);
      lim.push(`Drain current = V ÷ R = ${N(drop, 2)} ÷ ${N(st.RL, 1)} = <b>${N(Id, 2)} A</b>.`);
      const vg = VTH + Math.sqrt(Id / K);
      lim.push(vg <= 6 ? `Read across the transfer curve at I<sub>D</sub> = ${N(Id, 2)} A, then down: V<sub>GS</sub> = <b>${N(vg, 2)} V</b>. (The slider has moved there.)` : `I<sub>D</sub> = ${N(Id, 2)} A is off the top of this curve (V<sub>GS</sub> would be ${N(vg, 2)} V, beyond the 6 V graph).`);
      out.innerHTML = lim.map((x) => `<li>${x}</li>`).join("");
      if (vg <= 6) sG.set(+(Math.round(vg * 20) / 20).toFixed(2));
    });
    upd();
  });

  /* =====================================================================
     7. Redstone comparator block
     ===================================================================== */
  mount("w-ana-redstone", (box) => {
    let mode = "compare", back = 9, side = 5;
    HE.choice(box, "Block mode", [["compare", "Compare (front torch off)"], ["subtract", "Subtract (front torch on)"]], mode, (v) => { mode = v; upd(); });
    const ctl = controls(box);
    HE.slider(ctl, { label: "Back input (signal strength)", min: 0, max: 15, step: 1, value: back, fmt: (v) => N(v, 0), oninput: (v) => { back = v; upd(); } });
    HE.slider(ctl, { label: "Side input (signal strength)", min: 0, max: 15, step: 1, value: side, fmt: (v) => N(v, 0), oninput: (v) => { side = v; upd(); } });
    const grid = HE.el("div", { class: "ana-redstone", role: "group", "aria-label": "Signal strengths shown as bars of lit redstone, 0 to 15" });
    const rows = {};
    [["back", "Back"], ["side", "Side"], ["out", "Output"]].forEach(([k, lab]) => {
      const cells = HE.el("div", { class: "ana-rs-cells", "aria-hidden": "true" });
      cells.style.gridTemplateColumns = "repeat(15, 1fr)";
      const items = []; for (let i = 0; i < 15; i++) { const c = HE.el("i"); cells.append(c); items.push(c); }
      const num = HE.el("b", { class: "readout" });
      grid.append(HE.el("div", { class: "ana-rs-row" }, HE.el("span", null, lab), cells, num));
      rows[k] = { items, num };
    });
    box.append(grid);
    const status = note(box);
    function paint(k, v) { rows[k].items.forEach((c, i) => c.classList.toggle("lit", i < v)); rows[k].num.textContent = String(v); }
    function upd() {
      const out = mode === "compare" ? (back >= side ? back : 0) : Math.max(back - side, 0);
      paint("back", back); paint("side", side); paint("out", out);
      status.textContent = mode === "compare"
        ? (back >= side ? `Compare: the back (${back}) is at least the side (${side}), so the block passes the back signal on at strength ${out}. If the side were stronger, the output would be 0. That is a comparator: a yes or no on which input is bigger.`
          : `Compare: the side (${side}) beats the back (${back}), so the output is switched off: 0.`)
        : `Subtract: output = back − side = ${back} − ${side}, never below zero, so ${out}. That is a difference amplifier: the output follows the difference between two analogue signals.`;
    }
    upd();
  });

  /* =====================================================================
     8. The oscilloscope: the six op-amp circuits
     ===================================================================== */
  mount("w-ana-opamp", (box) => {
    const st = { cfg: "inv", Ri: 10, Rf: 47, R2: 20, Vcc: 9, single: false, amp: 1, dc: 1 };
    const NAMES = { inv: "Inverting", non: "Non-inverting", fol: "Follower", diff: "Difference", sum: "Summing", cmp: "Comparator" };
    HE.choice(box, "Circuit", Object.keys(NAMES).map((k) => [k, NAMES[k]]), st.cfg, (v) => { st.cfg = v; upd(); });
    HE.choice(box, "Supply", [["dual", "Dual: +V<sub>CC</sub> and −V<sub>CC</sub>"], ["single", "Single: +V<sub>CC</sub> and 0 V"]], "dual", (v) => { st.single = v === "single"; upd(); });
    const cv = canvasIn(box, "Oscilloscope screen. The input voltage, the second input (a steady level, where used) and the output voltage are plotted against time. The output flattens at the supply rails when the amplifier clips.");
    cv.classList.add("ana-scope");
    const ctl = controls(box);
    const sRi = HE.slider(ctl, { label: "$R_i$ (or $R_1$)", min: 1, max: 100, step: 1, value: st.Ri, unit: "kΩ", fmt: (v) => N(v, 0), oninput: (v) => { st.Ri = v; upd(); } });
    const sRf = HE.slider(ctl, { label: "$R_f$", min: 1, max: 100, step: 1, value: st.Rf, unit: "kΩ", fmt: (v) => N(v, 0), oninput: (v) => { st.Rf = v; upd(); } });
    const sR2 = HE.slider(ctl, { label: "$R_2$", min: 1, max: 100, step: 1, value: st.R2, unit: "kΩ", fmt: (v) => N(v, 0), oninput: (v) => { st.R2 = v; upd(); } });
    const sVcc = HE.slider(ctl, { label: "Supply $V_{CC}$", min: 3, max: 15, step: 1, value: st.Vcc, unit: "V", fmt: (v) => N(v, 0), oninput: (v) => { st.Vcc = v; upd(); } });
    const sA = HE.slider(ctl, { label: "Signal amplitude (peak)", min: 0, max: 5, step: 0.1, value: st.amp, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.amp = v; upd(); } });
    const sD = HE.slider(ctl, { label: "Steady level", min: -5, max: 5, step: 0.1, value: st.dc, unit: "V", fmt: (v) => N(v, 1), oninput: (v) => { st.dc = v; upd(); } });
    HE.math(ctl);
    const bar = HE.el("div", { class: "btn-row" }); box.append(bar);
    const eq = HE.el("div", { class: "ana-eq", "aria-live": "polite" }); box.append(eq);
    const set = readouts(box, [["gain", "gain (per input)"], ["ideal", "output the formula asks for"], ["real", "output you actually get"], ["clip", "clipping?"]]);
    const status = note(box);

    const gains = () => {
      const { Ri, Rf, R2 } = st;
      switch (st.cfg) {
        case "inv": return { g1: -Rf / Ri };
        case "non": return { g1: 1 + Rf / Ri };
        case "fol": return { g1: 1 };
        case "diff": return { g1: -Rf / Ri, g2: Rf / Ri };
        case "sum": return { g1: -Rf / Ri, g2: -Rf / R2 };
        default: return {};
      }
    };
    const rails = () => (st.single ? [0, st.Vcc] : [-st.Vcc, st.Vcc]);
    const v1 = (tau) => st.amp * Math.sin(2 * Math.PI * tau);
    function ideal(tau) {
      const g = gains(), a = v1(tau);
      if (st.cfg === "cmp") return a < st.dc ? st.Vcc : (st.single ? 0 : -st.Vcc); // saturated value
      if (st.cfg === "diff" || st.cfg === "sum") return g.g1 * a + g.g2 * st.dc;
      return g.g1 * a;
    }
    const real = (tau) => { const [lo, hi] = rails(); return clamp(ideal(tau), lo, hi); };
    const f1 = (x) => N(x, 2);
    function upd() {
      const c = st.cfg, g = gains();
      show(wrapOf(sRi), c !== "fol" && c !== "cmp"); show(wrapOf(sRf), c !== "fol" && c !== "cmp"); show(wrapOf(sR2), c === "sum");
      show(wrapOf(sD), c === "diff" || c === "sum" || c === "cmp");
      sD.input.closest(".slider").querySelector(".slider-name").innerHTML = c === "cmp" ? "Reference $V_{ref}$" : "Second input $V_2$ (steady)";
      HE.math(sD.input.closest(".slider"));
      const Ri = st.Ri, Rf = st.Rf, R2 = st.R2;
      let tex;
      if (c === "inv") tex = String.raw`V_o=-\frac{R_f}{R_i}V_i=-\frac{${Rf}}{${Ri}}V_i=${f1(g.g1)}\,V_i`;
      else if (c === "non") tex = String.raw`V_o=\left(1+\frac{R_f}{R_i}\right)V_i=\left(1+\frac{${Rf}}{${Ri}}\right)V_i=${f1(g.g1)}\,V_i`;
      else if (c === "fol") tex = String.raw`V_o=V_i`;
      else if (c === "diff") tex = String.raw`V_o=\frac{R_f}{R_i}(V_2-V_1)=\frac{${Rf}}{${Ri}}(${f1(st.dc)}-V_1)`;
      else if (c === "sum") tex = String.raw`V_o=-R_f\left(\frac{V_1}{R_1}+\frac{V_2}{R_2}\right)=${f1(g.g1)}\,V_1${g.g2 < 0 ? "-" : "+"}${f1(Math.abs(g.g2))}\times(${f1(st.dc)})`;
      else tex = String.raw`V_i\lt V_{ref}\Rightarrow +V_{sat}\quad V_i\gt V_{ref}\Rightarrow -V_{sat}\qquad(V_{ref}=${f1(st.dc)}\text{ V})`;
      eq.innerHTML = HE.tex(tex, true);
      const lab = c === "cmp" ? "n/a" : c === "diff" ? `V₁: ${f1(g.g1)}, V₂: ${f1(g.g2)}` : c === "sum" ? `V₁: ${f1(g.g1)}, V₂: ${f1(g.g2)}` : f1(g.g1);
      set("gain", lab);
      let imin = Infinity, imax = -Infinity, rmin = Infinity, rmax = -Infinity;
      for (let i = 0; i < 400; i++) { const tau = i / 400, a = ideal(tau), b = real(tau); imin = Math.min(imin, a); imax = Math.max(imax, a); rmin = Math.min(rmin, b); rmax = Math.max(rmax, b); }
      const clipped = Math.abs(imin - rmin) > 1e-6 || Math.abs(imax - rmax) > 1e-6;
      const rg = (a, b) => (Math.abs(b - a) < 0.005 ? `${f1(a)} V` : `${f1(a)} to ${f1(b)} V`);
      set("ideal", c === "cmp" ? "±Vsat only" : rg(imin, imax)); set("real", rg(rmin, rmax)); set("clip", c === "cmp" ? "always saturated" : clipped ? "YES: flattened at the rail" : "no");
      status.textContent = c === "cmp" ? `The comparator has no feedback, so the output is always at a rail: +VCC when Vi is below Vref (here ${f1(st.dc)} V) and ${st.single ? "0 V" : "−VCC"} when Vi is above it. The output flips exactly where the input crosses the reference.`
        : clipped ? `The formula asks for ${rg(imin, imax)}, but the output cannot go beyond the supply rails (${rails().map((x) => f1(x) + " V").join(" and ")}), so the peaks are flattened: clipping. Reduce the gain or the signal, or raise the supply.`
          : `The output follows the formula, and stays within the rails. ${c === "inv" ? "It is upside down (inverted) because the gain is negative." : ""}${c === "fol" ? "The output copies the input: gain 1, but it can drive a heavier load." : ""}`;
      if (sim) sim.redraw();
    }

    var sim = HE.sim(cv, {
      height: (w) => (w < 480 ? 280 : 320), loop: true,
      draw(ctx, t, dt, C, s) {
        const bx = { x: 44, y: 12, w: s.w - 56, h: s.h - 40 };
        const [lo, hi] = rails();
        const Ym = Math.max(6, Math.ceil(st.Vcc * 1.3));
        const Y = (v) => bx.y + bx.h / 2 - v / Ym * bx.h / 2;
        const span = 2; // two periods on screen
        const ink = "#c9d6ee", dim = "rgba(201,214,238,0.22)";
        ctx.fillStyle = "#0d1424"; ctx.fillRect(bx.x, bx.y, bx.w, bx.h);
        ctx.strokeStyle = dim; ctx.lineWidth = 1;
        const step = Ym > 10 ? 5 : 2;
        for (let v = -Math.floor(Ym / step) * step; v <= Ym; v += step) { ctx.beginPath(); ctx.moveTo(bx.x, Y(v)); ctx.lineTo(bx.x + bx.w, Y(v)); ctx.stroke(); txt(ctx, `${N(v, 0)}`, bx.x - 6, Y(v), { align: "right", size: 11.5, col: C.ink2 }); }
        for (let i = 0; i <= 8; i++) { const x = bx.x + bx.w * i / 8; ctx.beginPath(); ctx.moveTo(x, bx.y); ctx.lineTo(x, bx.y + bx.h); ctx.stroke(); }
        ctx.strokeStyle = "rgba(201,214,238,0.6)"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(bx.x, Y(0)); ctx.lineTo(bx.x + bx.w, Y(0)); ctx.stroke();
        // rails
        ctx.strokeStyle = "#ffd166"; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5;
        [hi, lo].forEach((r) => { ctx.beginPath(); ctx.moveTo(bx.x, Y(r)); ctx.lineTo(bx.x + bx.w, Y(r)); ctx.stroke(); });
        ctx.setLineDash([]);
        txt(ctx, "+VCC", bx.x + bx.w - 4, Y(hi) - 9, { align: "right", size: 11.5, bold: true, col: "#ffd166" });
        txt(ctx, st.single ? "0 V rail" : "−VCC", bx.x + bx.w - 4, Y(lo) + 10, { align: "right", size: 11.5, bold: true, col: "#ffd166" });
        const n = Math.floor(bx.w / 2);
        const trace = (fn, col, w, dash) => {
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.setLineDash(dash || []);
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const tau = t * 0.25 - span + span * i / n, x = bx.x + bx.w * i / n, y = clamp(Y(fn(tau)), bx.y + 1, bx.y + bx.h - 1);
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke(); ctx.setLineDash([]);
        };
        HE.clip(ctx, bx, () => {
          if (st.cfg === "diff" || st.cfg === "sum" || st.cfg === "cmp") trace(() => st.dc, "#ffd166", 1.8, [2, 4]);
          if (st.cfg !== "cmp") trace(ideal, "rgba(255,107,94,0.4)", 2, [5, 5]);
          trace(v1, "#5fd4ff", 2.2);
          trace(real, "#ff6b5e", 3.4);
        });
        ctx.strokeStyle = "rgba(201,214,238,0.8)"; ctx.lineWidth = 1.5; ctx.strokeRect(bx.x, bx.y, bx.w, bx.h);
        // legend
        const lg = [["#5fd4ff", st.cfg === "diff" || st.cfg === "sum" ? "V1 (signal)" : "Vi (input)"], ["#ff6b5e", "Vo (output)"]];
        if (st.cfg === "diff" || st.cfg === "sum") lg.push(["#ffd166", "V2 (steady)"]);
        if (st.cfg === "cmp") lg.push(["#ffd166", "Vref"]);
        lg.forEach(([col, l], i) => { ctx.fillStyle = col; ctx.fillRect(bx.x + 8, bx.y + 10 + i * 17 - 4, 14, 4); txt(ctx, l, bx.x + 28, bx.y + 10 + i * 17, { size: 12, bold: true, col: ink }); });
        txt(ctx, "volts against time (scrolling)", bx.x + bx.w, bx.y + bx.h + 16, { align: "right", size: 11.5, bold: true, col: C.ink2 });
      },
    });
    bar.append(HE.playButton(sim));

    // ---- design challenge ----
    const chalBtn = HE.el("button", { class: "btn small", type: "button", "aria-expanded": "false" }, "Design challenge");
    bar.append(chalBtn);
    const panel = HE.el("div", { class: "ana-chal", hidden: true }); box.append(panel);
    const qEl = HE.el("p", { class: "ana-q" });
    const inp = HE.el("input", { type: "number", step: "any", inputmode: "decimal", id: "ana-op-in", "aria-label": "Your answer" });
    const unitEl = HE.el("span");
    const chk = HE.el("button", { class: "btn small primary", type: "button" }, "Check");
    const tryB = HE.el("button", { class: "btn small", type: "button" }, "Try it on the scope");
    const stepB = HE.el("button", { class: "btn small", type: "button" }, "Show steps");
    const nextB = HE.el("button", { class: "btn small", type: "button" }, "New question");
    const fb = HE.el("p", { class: "ana-fb", role: "status" });
    const sol = HE.el("ol", { class: "ana-steps ana-sol", hidden: true });
    panel.append(qEl, HE.el("div", { class: "ana-row" }, HE.el("label", { class: "ana-in", for: "ana-op-in" }, "Answer = ", inp, unitEl), chk, tryB, stepB, nextB), fb, sol);
    let q = null;
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    function newQ() {
      const type = pick(["inv", "non", "sat", "inv", "non"]);
      st.single = false; st.Ri = 10; st.Vcc = 9; sRi.sync(10); sVcc.sync(9);
      if (type === "inv") {
        const g = pick([2, 3, 4, 5, 6, 8, 9]);
        q = { type, ans: g * 10, tol: 0.02, unit: " kΩ", set: () => { st.cfg = "inv"; st.amp = 1; st.Rf = g * 10; } };
        qEl.innerHTML = `Design an <b>inverting</b> amplifier with $R_i$ = 10 kΩ and a gain of <b>−${g}</b>. Choose $R_f$.`;
        unitEl.textContent = " kΩ";
        q.steps = [`Booklet: $V_o=-\\dfrac{R_f}{R_i}V_i$, so the gain is $-\\dfrac{R_f}{R_i}$.`, `Set $-\\dfrac{R_f}{R_i}=-${g}$, so $R_f=${g}\\times R_i$.`, `$R_f=${g}\\times10$ = <b>${g * 10} kΩ</b>.`];
        st.cfg = "inv"; st.Rf = 10; st.amp = 1;
      } else if (type === "non") {
        const G = pick([3, 4, 5, 6, 8, 11]);
        q = { type, ans: (G - 1) * 10, tol: 0.02, unit: " kΩ" };
        qEl.innerHTML = `Design a <b>non-inverting</b> amplifier with $R_i$ = 10 kΩ and a gain of <b>${G}</b>. Choose $R_f$.`;
        unitEl.textContent = " kΩ";
        q.steps = [`Booklet: $V_o=\\left(1+\\dfrac{R_f}{R_i}\\right)V_i$.`, `Set $1+\\dfrac{R_f}{R_i}=${G}$, so $\\dfrac{R_f}{R_i}=${G - 1}$.`, `$R_f=${G - 1}\\times10$ = <b>${(G - 1) * 10} kΩ</b>.`];
        st.cfg = "non"; st.Rf = 10; st.amp = 1;
      } else {
        const g = pick([3, 4, 5, 6, 8, 9]), x = pick([1, 1.5, 2, 2.5, 3, 4]);
        const raw = -g * x, ans = Math.max(raw, -9);
        q = { type, ans, tol: 0.03, unit: " V", abs: true };
        qEl.innerHTML = `An inverting amplifier has $R_i$ = 10 kΩ and $R_f$ = ${g * 10} kΩ, on a dual supply of ±9 V. The input signal peaks at <b>+${x} V</b>. What is the output voltage at that moment? (Give the sign.)`;
        unitEl.textContent = " V";
        q.steps = [`Gain = $-\\dfrac{R_f}{R_i}=-\\dfrac{${g * 10}}{10}=-${g}$.`, `Formula: $V_o=-${g}\\times${x}=${N(raw, 2)}$ V.`, raw < -9 ? `That is beyond the −9 V rail, so the output saturates: <b>−9 V</b>.` : `This is within the ±9 V rails, so the output is <b>${N(raw, 2)} V</b>.`];
        st.cfg = "inv"; st.Rf = g * 10; st.amp = x;
      }
      sRf.sync(st.Rf); sA.sync(st.amp);
      inp.value = ""; fb.textContent = ""; fb.className = "ana-fb"; sol.hidden = true; sol.innerHTML = "";
      // keep the segmented buttons in step with st.cfg
      box.querySelectorAll(".seg").forEach((g2) => {
        if (g2.getAttribute("aria-label") === "Circuit") [...g2.querySelectorAll(".seg-btn")].forEach((b) => b.setAttribute("aria-pressed", String(b.textContent === NAMES[st.cfg])));
        if (g2.getAttribute("aria-label") === "Supply") [...g2.querySelectorAll(".seg-btn")].forEach((b, i) => b.setAttribute("aria-pressed", String(i === 0)));
      });
      HE.math(qEl); upd();
    }
    chk.addEventListener("click", () => {
      if (!q) return;
      const v = parseFloat(inp.value);
      if (!isFinite(v)) { fb.textContent = "Type a number first."; fb.className = "ana-fb"; return; }
      const ok = q.abs ? Math.abs(v - q.ans) <= 0.05 : Math.abs(v - q.ans) <= q.tol * Math.abs(q.ans);
      if (ok) fb.innerHTML = `<span class="ana-ok">Correct:</span> ${N(q.ans, 2)}${q.unit}. Press <b>Try it on the scope</b> to see it.`;
      else if (q.type === "sat" && Math.abs(v + q.ans) < 0.05) fb.innerHTML = `<span class="ana-bad">Check the sign.</span> An inverting amplifier turns a positive input into a negative output.`;
      else if (q.type !== "sat" && Math.abs(v - (q.type === "inv" ? q.ans - 10 : q.ans + 10)) <= 0.5) fb.innerHTML = q.type === "inv" ? `<span class="ana-bad">So close.</span> There is no "1 +" in the inverting formula: the gain is just Rf / Ri.` : `<span class="ana-bad">So close.</span> Check the "1 +" in the non-inverting formula: the gain is 1 + Rf / Ri, so Rf is (gain − 1) × Ri.`;
      else fb.innerHTML = `<span class="ana-bad">Not quite.</span> Write the Booklet formula first, then substitute. Try <b>Show steps</b>.`;
    });
    tryB.addEventListener("click", () => {
      if (!q) return;
      if (q.type !== "sat") { st.Rf = clamp(Math.round(parseFloat(inp.value) || q.ans), 1, 100); sRf.sync(st.Rf); upd(); fb.innerHTML = `The scope now uses R<sub>f</sub> = ${st.Rf} kΩ.`; }
      else { upd(); fb.textContent = "The scope shows this circuit: look at where the output flattens."; }
    });
    stepB.addEventListener("click", () => { if (q) { sol.innerHTML = q.steps.map((x) => `<li>${x}</li>`).join(""); HE.math(sol); sol.hidden = false; } });
    nextB.addEventListener("click", newQ);
    chalBtn.addEventListener("click", () => {
      panel.hidden = !panel.hidden; chalBtn.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden && !q) newQ();
    });
    upd();
  });

  /* =====================================================================
     9. Trace the signal through the ship's systems
     ===================================================================== */
  mount("w-ana-system", (box) => {
    const st = { sc: "fan", T: 45, water: 0, lux: 1000, pair: false };
    HE.choice(box, "System", [["fan", "Engine-room fan"], ["bilge", "Bilge alarm"], ["lamp", "Dusk lamp"]], st.sc, (v) => { st.sc = v; upd(); });
    const ctl = controls(box);
    const sT = HE.slider(ctl, { label: "Engine-room temperature", min: 20, max: 90, step: 1, value: st.T, unit: "°C", fmt: (v) => N(v, 0), oninput: (v) => { st.T = v; upd(); } });
    const sW = HE.slider(ctl, { label: "Water bridging the probes", min: 0, max: 100, step: 1, value: st.water, unit: "%", fmt: (v) => N(v, 0), oninput: (v) => { st.water = v; upd(); } });
    const sL = HE.slider(ctl, { label: "Light level", min: 0, max: 1000, step: 1, value: posOf(st.lux, 10, 10000), fmt: (p) => N(logPos(p, 10, 10000), 0) + " lux", oninput: (p) => { st.lux = logPos(p, 10, 10000); upd(); } });
    const pairBox = HE.el("div", { class: "ana-row" });
    const pairCb = HE.el("input", { type: "checkbox", id: "ana-pair" });
    pairBox.append(HE.el("label", { for: "ana-pair", class: "ana-in" }, pairCb, " Add a second transistor (a pair, so the gains multiply)"));
    ctl.append(pairBox);
    pairCb.addEventListener("change", () => { st.pair = pairCb.checked; upd(); });
    const pipe = HE.el("div", { class: "ana-pipeline", role: "list", "aria-label": "Stages of the system, in the order the signal passes through them" });
    box.append(pipe);
    const status = note(box);

    function card(title, value, cls) { return HE.el("div", { class: cls || "", role: "listitem" }, HE.el("b", null, value), HE.el("span", null, title)); }
    function fan() {
      const Rth = ntcR(st.T), Rfix = 3600, Vi = 9 * Rth / (Rfix + Rth), Vref = 4.5, on = Vi <= Vref + 1e-9, Vo = on ? 9 : 0;
      const Rb = 10000, Ib = on ? (Vo - 0.7) / Rb : 0, Ic = Math.min(100 * Ib, 9 / 180);
      const run = on && Ic > 0.045;
      return {
        cards: [card("temperature", N(st.T, 0) + " °C", "live"), card("thermistor resistance (falls as it heats)" + (st.T % 10 ? " (interpolated)" : ""), fmtR(Rth)), card("divider output Vi", fmtV(Vi)), card(`comparator: Vi ${on ? "<" : ">"} Vref (4.5 V)`, Vo ? "+9 V" : "0 V", "hot"),
          card("base current (RB = 10 kΩ)", fmtI(Ib)), card("relay coil current (max 50 mA)", fmtI(Ic)), card("fan", run ? "RUNNING" : "OFF", run ? "live" : "")],
        text: on ? `At ${N(st.T, 0)} °C the thermistor has fallen to ${fmtR(Rth)}, so Vi (${N(Vi, 2)} V) has reached or fallen below Vref (4.5 V). The comparator output saturates positive, a base current of ${fmtI(Ib)} flows through RB, the transistor saturates, the coil carries ${fmtI(Ic)}, the relay closes and the fan runs.`
          : `At ${N(st.T, 0)} °C the thermistor is still ${fmtR(Rth)}, so Vi (${N(Vi, 2)} V) is above Vref (4.5 V). The comparator output is at its low rail, no base current flows, the transistor is off, the relay is open and the fan is stopped. The fan switches on at 50 °C.`,
      };
    }
    function bilge() {
      const Rp = 1e6 * Math.pow(2200 / 1e6, st.water / 100), Vi = 9 * Rp / (10000 + Rp), on = Vi < 4.5, Vo = on ? 9 : 0;
      const Ib = on ? (Vo - 0.7) / 33000 : 0, Ic = Math.min(150 * Ib, 0.03), snd = on && Ic >= 0.0299;
      return {
        cards: [card("water bridging the probes", N(st.water, 0) + " %", "live"), card("probe resistance (falls when wet)", fmtR(Rp)), card("probe divider output Vi", fmtV(Vi)), card(`comparator: Vi ${on ? "<" : ">"} Vref (4.5 V)`, Vo ? "+9 V" : "0 V", "hot"),
          card("base current (RB = 33 kΩ)", fmtI(Ib)), card("buzzer current (30 mA)", fmtI(Ic)), card("buzzer", snd ? "SOUNDS" : "SILENT", snd ? "live" : "")],
        text: on ? `The water has pulled the probe resistance down to ${fmtR(Rp)}, so Vi (${N(Vi, 2)} V) is below Vref (4.5 V). The comparator output goes high, ${fmtI(Ib)} flows into the base, hFE × IB (${fmtI(150 * Ib)}) is more than the buzzer's 30 mA, so the transistor saturates and the buzzer sounds.`
          : `With ${fmtR(Rp)} across the probes, Vi (${N(Vi, 2)} V) is above Vref (4.5 V), so the comparator output is low and the buzzer is silent. The alarm sounds when the probe resistance falls below 10 kΩ.`,
      };
    }
    function lamp() {
      const Rl = ldrR(st.lux), n = st.pair ? 2 : 1, Vb = 0.7 * n, R = 237000, hfe = st.pair ? 1e4 : 100;
      const Vopen = 9 * Rl / (R + Rl), Ibraw = (9 - Vb) / R - Vb / Rl, Ib = Ibraw > 0 ? Ibraw : 0;
      const Ic = Math.min(hfe * Ib, 0.06), bright = Ic / 0.06;
      return {
        cards: [card("light level", N(st.lux, 0) + " lux", "live"), card("LDR resistance (rises in the dark)", fmtR(Rl)), card(`divider voltage (transistor needs ${N(Vb, 1)} V)`, fmtV(Math.min(Vopen, Vb)), "hot"),
          card("base current", fmtI(Ib)), card(`collector current (hFE ${st.pair ? "100 × 100" : "100"}; lamp max 60 mA)`, fmtI(Ic)), card("lamp brightness", N(bright * 100, 0) + " %", bright > 0.5 ? "live" : "")],
        text: Ib <= 0 ? `At ${N(st.lux, 0)} lux the LDR is only ${fmtR(Rl)}, so it takes less than ${N(Vb, 1)} V of the supply. No base current flows and the lamp is off.`
          : `At ${N(st.lux, 0)} lux the LDR has risen to ${fmtR(Rl)}, so its voltage reaches ${N(Vb, 1)} V and a base current of ${fmtI(Ib)} flows. hFE × IB gives ${fmtI(hfe * Ib)}, so the lamp gets ${fmtI(Ic)}: ${N(bright * 100, 0)} % brightness. ${st.pair ? "" : "With one transistor, the high-value fixed resistor allows only a tiny base current, so the lamp is dim at best. Try adding a second transistor."}`,
      };
    }
    function upd() {
      show(wrapOf(sT), st.sc === "fan"); show(wrapOf(sW), st.sc === "bilge"); show(wrapOf(sL), st.sc === "lamp"); show(pairBox, st.sc === "lamp");
      const r = st.sc === "fan" ? fan() : st.sc === "bilge" ? bilge() : lamp();
      pipe.innerHTML = ""; r.cards.forEach((c) => pipe.append(c));
      status.textContent = r.text;
    }
    upd();
  });
})();
