/* Trigonometry — the widgets on the quarterdeck. */
(function () {
  "use strict";
  const HM = window.HM;
  const $ = (id) => document.getElementById(id);
  const N = HM.n;
  const D2R = Math.PI / 180;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HM.el("canvas", { class: "sim", role: "img", "aria-label": label || "" }); box.append(c); return c; };
  const texBox = (box) => { const d = HM.el("div", { class: "tex-out", "aria-live": "polite" }); box.append(d); return d; };
  const controls = (box) => { const d = HM.el("div", { class: "sim-controls" }); box.append(d); return d; };

  /* exact values for multiples of 30° and 45° */
  const EX = { 0: ["0", "1", "0"], 30: ["\\tfrac12", "\\tfrac{\\sqrt3}{2}", "\\tfrac{1}{\\sqrt3}"], 45: ["\\tfrac{1}{\\sqrt2}", "\\tfrac{1}{\\sqrt2}", "1"], 60: ["\\tfrac{\\sqrt3}{2}", "\\tfrac12", "\\sqrt3"], 90: ["1", "0", "\\text{undefined}"] };
  function exact(deg) {
    deg = ((deg % 360) + 360) % 360;
    const q = Math.floor(deg / 90);
    const ref = [deg, 180 - deg, deg - 180, 360 - deg][q];
    const e = EX[Math.round(ref)];
    if (!e) return null;
    const sgn = [[1, 1, 1], [1, -1, -1], [-1, -1, 1], [-1, 1, -1]][q];
    const f = (v, s) => (v === "0" || v === "\\text{undefined}" ? v : (s < 0 ? "-" : "") + v);
    // the axes are their own quadrant boundaries: use the true signs there
    if (deg % 90 === 0) { const k = deg / 90; return [["0", "1", "0"], ["1", "0", "\\text{undefined}"], ["0", "-1", "0"], ["-1", "0", "\\text{undefined}"]][k]; }
    return [f(e[0], sgn[0]), f(e[1], sgn[1]), f(e[2], sgn[2])];
  }
  /* degrees → a radian label like 5π/6 */
  function radTex(deg) {
    const r = deg / 180;
    let d = 1;
    while (d <= 36 && Math.abs(Math.round(r * d) - r * d) > 1e-7) d++;
    if (d > 36) return N(deg * D2R, 3);
    let n = Math.round(r * d);
    const g = (a, b) => (b ? g(b, a % b) : a);
    const c = g(Math.abs(n), d) || 1; n /= c; d /= c;
    if (n === 0) return "0";
    return `${n < 0 ? "-" : ""}${d === 1 ? "" : "\\tfrac{"}${Math.abs(n) === 1 ? "" : Math.abs(n)}\\pi${d === 1 ? "" : `}{${d}}`}`;
  }
  HM.radTex = radTex;

  /* =====================================================================
     1. Unit circle generating sin and cos graphs
     ===================================================================== */
  mount("w-unit", (box) => {
    let th = 60, playing = false;
    const cv = canvasIn(box);
    const row = HM.el("div", { class: "btn-row" });
    const play = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Turn the capstan");
    row.append(play);
    box.append(row);
    const grid = HM.el("div", { class: "exact-grid", role: "group", "aria-label": "Exact angles" });
    const angs = [0, 30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330];
    const btns = angs.map((a) => { const b = HM.el("button", { type: "button", "aria-pressed": a === th ? "true" : "false", html: `$${a}°$<br><small>$${radTex(a)}$</small>` }); b.addEventListener("click", () => { th = a; stop(); sync(); }); grid.append(b); return b; });
    box.append(grid);
    const out = texBox(box);
    let Pc = null;
    const sync = () => { btns.forEach((b, i) => b.setAttribute("aria-pressed", angs[i] === Math.round(th) ? "true" : "false")); sim.redraw(); info(); };
    const stop = () => { playing = false; sim.pause(); play.textContent = "▶ Turn the capstan"; };
    play.addEventListener("click", () => { if (playing) return stop(); playing = true; play.textContent = "❚❚ Stop"; sim.play(); });
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 430 : 300),
      draw(ctx, t, dt, C, S) {
        if (playing) { th = (th + dt * 45) % 360; if (Math.round(th) % 15 === 0) info(); }
        const narrow = S.w < 560;
        const R = narrow ? Math.min(S.w / 2 - 40, 100) : Math.min(S.h / 2 - 34, 115);
        const cx = narrow ? S.w / 2 : R + 40, cy = narrow ? R + 26 : S.h / 2;
        Pc = { cx, cy, R };
        // circle and axes
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(cx - R - 14, cy); ctx.lineTo(cx + R + 14, cy); ctx.moveTo(cx, cy - R - 14); ctx.lineTo(cx, cy + R + 14); ctx.stroke();
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        // quadrant letters
        [["A", 1, -1, C.grass], ["S", -1, -1, C.sea], ["T", -1, 1, C.gold], ["C", 1, 1, C.red]].forEach(([l, sx, sy, col]) => HM.label(ctx, l, cx + sx * R * 0.55, cy + sy * R * 0.55, { col, bold: true, size: 15, align: "center", halo: false }));
        const r = th * D2R, px = cx + R * Math.cos(r), py = cy - R * Math.sin(r);
        // angle arc
        ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 22, 0, -r, true); ctx.stroke();
        // cos (horizontal) and sin (vertical) lengths
        ctx.lineWidth = 4; ctx.strokeStyle = C.sea; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, cy); ctx.stroke();
        ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(px, cy); ctx.lineTo(px, py); ctx.stroke();
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(px, py); ctx.stroke();
        HM.dot(ctx, px, py, C.ink, 7, C.card);
        HM.label(ctx, `θ = ${Math.round(th)}°`, cx + 26, cy - 14, { size: 12, bold: true, col: C.gold });
        // graphs
        const g = narrow ? { x: 34, y: cy + R + 36, w: S.w - 46, h: S.h - (cy + R + 36) - 22 } : { x: cx + R + 50, y: 18, w: S.w - (cx + R + 50) - 14, h: S.h - 40 };
        const P = HM.plot(ctx, g, { x0: 0, x1: 360, y0: -1.2, y1: 1.2, xt: 90, yt: 0.5, C, xl: "θ°", yl: "", tf: (v) => (v === 0.5 || v === -0.5 ? "" : String(v).replace("-", "−")) });
        HM.curve(ctx, P, (x) => Math.sin(x * D2R), 0, 360, C.red, 1.2, { dash: [3, 4] });
        HM.curve(ctx, P, (x) => Math.cos(x * D2R), 0, 360, C.sea, 1.2, { dash: [3, 4] });
        HM.curve(ctx, P, (x) => Math.sin(x * D2R), 0, th, C.red, 3);
        HM.curve(ctx, P, (x) => Math.cos(x * D2R), 0, th, C.sea, 3);
        HM.dot(ctx, P.X(th), P.Y(Math.sin(r)), C.red, 5); HM.dot(ctx, P.X(th), P.Y(Math.cos(r)), C.sea, 5);
        if (!narrow) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(P.X(th), P.Y(Math.sin(r))); ctx.stroke(); ctx.setLineDash([]); }
        HM.label(ctx, "sin θ", g.x + g.w - 4, g.y + 8, { align: "right", col: C.red, bold: true, size: 13 });
        HM.label(ctx, "cos θ", g.x + g.w - 54, g.y + 8, { align: "right", col: C.sea, bold: true, size: 13 });
        cv.setAttribute("aria-label", `Unit circle at θ = ${Math.round(th)} degrees: cos θ = ${N(Math.cos(r), 3)}, sin θ = ${N(Math.sin(r), 3)}. The sine and cosine graphs are traced up to this angle.`);
      },
    });
    HM.drag(cv, sim, () => (Pc ? [{ id: 0, x: Pc.cx + Pc.R * Math.cos(th * D2R), y: Pc.cy - Pc.R * Math.sin(th * D2R) }] : []), (id, x, y) => {
      let a = Math.atan2(Pc.cy - y, x - Pc.cx) / D2R; if (a < 0) a += 360;
      const snap = angs.find((s) => Math.abs(s - a) < 4); th = snap !== undefined ? snap : Math.round(a); stop(); sync();
    }, 30);
    function info() {
      const a = Math.round(th), e = exact(a);
      const q = a % 90 === 0 ? "on an axis" : `in quadrant ${Math.floor(a / 90) + 1}, so ${["all three ratios are positive", "only sin is positive", "only tan is positive", "only cos is positive"][Math.floor(a / 90)]}`;
      out.innerHTML = e ? `<p style="margin:0">$\\theta = ${a}° = ${radTex(a)}$, ${q}. $\\sin\\theta = ${e[0]}$, $\\cos\\theta = ${e[1]}$, $\\tan\\theta = ${e[2]}$.</p>`
        : `<p style="margin:0">$\\theta = ${a}°$, ${q}: $\\sin\\theta = ${N(Math.sin(a * D2R), 3)}$, $\\cos\\theta = ${N(Math.cos(a * D2R), 3)}$.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     2. y = a sin(bx + c) + d
     ===================================================================== */
  mount("w-trigtrans", (box) => {
    let fn = "sin", a = 3, b = 2, c = 0, d = 1;
    HM.choice(box, "Function:", [["sin", "$\\sin$"], ["cos", "$\\cos$"]], fn, (v) => { fn = v; upd(); });
    const ctl = controls(box);
    HM.slider(ctl, { label: "$a$ (amplitude)", min: -4, max: 4, step: 0.5, value: a, fmt: (v) => N(v), oninput: (v) => { a = v || 0.5; upd(); } });
    HM.slider(ctl, { label: "$b$ (waves per 360°)", min: 0.5, max: 4, step: 0.5, value: b, fmt: (v) => N(v), oninput: (v) => { b = v; upd(); } });
    HM.slider(ctl, { label: "$c$ (inside shift)", min: -180, max: 180, step: 15, value: c, unit: "°", oninput: (v) => { c = v; upd(); } });
    HM.slider(ctl, { label: "$d$ (centre line)", min: -3, max: 3, step: 0.5, value: d, fmt: (v) => N(v), oninput: (v) => { d = v; upd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const f = (x) => a * (fn === "sin" ? Math.sin : Math.cos)((b * x + c) * D2R) + d;
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 40, y: 10, w: S.w - 54, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: 0, x1: 360, y0: -8, y1: 8, xt: 45, yt: 2, C, xl: "x°", yl: "y", tf: (v) => (v % 90 ? "" : String(v).replace("-", "−")), ytf: (v) => (v % 4 ? "" : String(v).replace("-", "−")) });
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, () => d, 0, 360, C.muted, 1.5, { dash: [6, 4] });
          HM.curve(ctx, P, () => d + Math.abs(a), 0, 360, C.gold, 1, { dash: [2, 4] });
          HM.curve(ctx, P, () => d - Math.abs(a), 0, 360, C.gold, 1, { dash: [2, 4] });
          HM.curve(ctx, P, (x) => (fn === "sin" ? Math.sin : Math.cos)(x * D2R), 0, 360, C.muted, 1.5);
          HM.curve(ctx, P, f, 0, 360, C.red, 3, { n: 720 });
          // one period bracket from the first maximum
          const per = 360 / b, xm = firstMax();
          if (xm + per <= 360) {
            const y = P.Y(d + Math.abs(a)) - 14;
            ctx.strokeStyle = C.sea; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(P.X(xm), y + 5); ctx.lineTo(P.X(xm), y); ctx.lineTo(P.X(xm + per), y); ctx.lineTo(P.X(xm + per), y + 5); ctx.stroke();
            HM.label(ctx, `period ${N(per, 1)}°`, P.X(xm + per / 2), y - 9, { align: "center", size: 12, col: C.sea, bold: true });
          }
        });
        cv.setAttribute("aria-label", `Graph of y = ${N(a)} ${fn}(${N(b)}x + ${c}) + ${N(d)} from 0 to 360 degrees, with y = ${fn} x faint behind it.`);
      },
    });
    function firstMax() {
      // where the inner angle is 90 (sin) or 0 (cos) for a > 0; 270/180 for a < 0
      let target = fn === "sin" ? (a > 0 ? 90 : 270) : (a > 0 ? 0 : 180);
      let x = (target - c) / b;
      const per = 360 / b;
      while (x < 0) x += per; while (x >= per) x -= per;
      return x;
    }
    function upd() {
      sim.redraw();
      const per = 360 / b;
      out.innerHTML = `<p style="margin:0">$y = ${a === 1 ? "" : a === -1 ? "-" : N(a)}\\${fn}(${b === 1 ? "" : N(b)}x${c ? (c < 0 ? " - " : " + ") + Math.abs(c) : ""})° ${d ? (d < 0 ? "- " : "+ ") + N(Math.abs(d)) : ""}$: amplitude $${N(Math.abs(a))}$, period $\\frac{360°}{${N(b)}} = ${N(per, 1)}°$, maximum $${N(d + Math.abs(a))}$, minimum $${N(d - Math.abs(a))}$. First maximum at $x = ${N(firstMax(), 1)}°$.${c ? ` Sideways shift: $\\frac{c}{b} = \\frac{${c}}{${N(b)}} = ${N(c / b, 1)}°$, so the graph of $y = ${a === 1 ? "" : a === -1 ? "-" : N(a)}\\${fn} ${b === 1 ? "" : N(b)}x$ moves ${N(Math.abs(c / b), 1)}° to the ${c > 0 ? "left" : "right"}.` : ""}</p>`;
      HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     3. Solving sin/cos/tan(bx) = k on an interval
     ===================================================================== */
  mount("w-solve", (box) => {
    let fn = "cos", b = 2, k = Math.sqrt(3) / 2, units = "deg";
    HM.choice(box, "Equation:", [["sin", "$\\sin bx = k$"], ["cos", "$\\cos bx = k$"], ["tan", "$\\tan bx = k$"]], fn, (v) => { fn = v; kS.input.min = fn === "tan" ? -3 : -1.2; kS.input.max = fn === "tan" ? 3 : 1.2; upd(); });
    HM.choice(box, "Interval:", [["deg", "$0 \\le x \\lt 360°$"], ["rad", "$0 \\le x \\lt 2\\pi$"]], units, (v) => { units = v; upd(); });
    const ctl = controls(box);
    HM.slider(ctl, { label: "$b$", min: 1, max: 4, step: 1, value: b, oninput: (v) => { b = v; upd(); } });
    const NICE = [0, 0.5, Math.SQRT1_2, Math.sqrt(3) / 2, 1, 1 / Math.sqrt(3), Math.sqrt(3)];
    const NICET = ["0", "\\tfrac12", "\\tfrac{1}{\\sqrt2}", "\\tfrac{\\sqrt3}{2}", "1", "\\tfrac{1}{\\sqrt3}", "\\sqrt3"];
    const kTex = (v) => { const i = NICE.findIndex((n) => Math.abs(Math.abs(v) - n) < 0.004); return i < 0 ? N(v, 2) : (v < 0 && i ? "-" : "") + NICET[i]; };
    const kS = HM.slider(ctl, { label: "$k$", min: -1.2, max: 1.2, step: 0.005, value: k, fmt: (v) => kTex(v).replace(/\\tfrac\{([^}]*)\}\{([^}]*)\}/, "$1/$2").replace(/\\sqrt/g, "√"), oninput: (v) => { const i = NICE.findIndex((n) => Math.abs(Math.abs(v) - n) < 0.012); k = i < 0 ? v : Math.sign(v) * NICE[i]; upd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const F = { sin: Math.sin, cos: Math.cos, tan: Math.tan };
    function sols() {
      const S = [];
      const per = fn === "tan" ? 180 : 360;
      if (fn !== "tan" && Math.abs(k) > 1 + 1e-9) return { S, base: [] };
      let p = fn === "sin" ? Math.asin(k) / D2R : fn === "cos" ? Math.acos(k) / D2R : Math.atan(k) / D2R;
      const base = fn === "sin" ? [p, 180 - p] : fn === "cos" ? [p, 360 - p] : [p];
      for (const q of base) for (let n = -2; n <= 2 * b + 2; n++) { const th = q + n * per; if (th >= -1e-9 && th < 360 * b - 1e-9) S.push(th); }
      const uniq = [...new Set(S.map((v) => Math.round(v * 1e6) / 1e6))].sort((x, y) => x - y);
      const bs = [...new Set(base.map((v) => Math.round((((v % per) + per) % per) * 1e6) / 1e6))].sort((x, y) => x - y);
      return { S: uniq, base: bs };
    }
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, Sx) {
        const bx = { x: 40, y: 10, w: Sx.w - 54, h: Sx.h - 32 };
        const ylim = fn === "tan" ? 4 : 1.5;
        const P = HM.plot(ctx, bx, { x0: 0, x1: 360, y0: -ylim, y1: ylim, xt: 30, yt: fn === "tan" ? 1 : 0.5, C, xl: units === "deg" ? "x°" : "x", yl: "y", tf: (v) => (v % 90 ? "" : units === "deg" ? String(v) : ["0", "π/2", "π", "3π/2", "2π"][v / 90]), ytf: (v) => (v % 1 ? "" : String(v).replace("-", "−")) });
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, (x) => F[fn](b * x * D2R), 0, 360, C.sea, 3, { n: 1440, ylo: -ylim * 1.5, yhi: ylim * 1.5 });
          HM.curve(ctx, P, () => k, 0, 360, C.red, 2, { dash: [7, 4] });
          sols().S.forEach((th) => { const x = th / b; ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(P.X(x), P.Y(k)); ctx.lineTo(P.X(x), P.Y(0)); ctx.stroke(); ctx.setLineDash([]); HM.dot(ctx, P.X(x), P.Y(k), C.gold, 6, C.card); });
        });
        cv.setAttribute("aria-label", `Graph of y = ${fn} ${b}x with the line y = ${N(k, 3)}; the ${sols().S.length} crossing points are the solutions.`);
      },
    });
    const fmtX = (deg) => (units === "deg" ? `${N(deg, 1)}°` : radTex(deg));
    function upd() {
      sim.redraw();
      const { S, base } = sols();
      const kt = kTex(k), lhs = `\\${fn} ${b === 1 ? "" : b}x = ${kt}`;
      if (!S.length) { out.innerHTML = `<p style="margin:0">$${lhs}$: <b>no solutions</b>, because $\\${fn}$ is never ${k > 0 ? "greater" : "less"} than ${k > 0 ? "$1$" : "$-1$"}.</p>`; HM.math(out); return; }
      const acute = fn === "tan" ? Math.atan(Math.abs(k)) / D2R : fn === "sin" ? Math.asin(Math.abs(k)) / D2R : Math.acos(Math.abs(k)) / D2R;
      const quads = { sin: k >= 0 ? "first and second" : "third and fourth", cos: k >= 0 ? "first and fourth" : "second and third", tan: k >= 0 ? "first and third" : "second and fourth" }[fn];
      const v = b === 1 ? "x" : `${b}x`;
      const axis = fn === "tan" ? k === 0 : k === 0 || Math.abs(k) === 1;
      let s = axis
        ? `<p style="margin:0">$${lhs}$. This value is on an axis of the unit circle, not inside a quadrant, so CAST is not needed: read it from the graph. In one turn, $${v} = ${base.map((q) => fmtX(q)).join(",\\ ")}$`
        : `<p style="margin:0">$${lhs}$. Acute angle $= ${fmtX(acute)}$; $\\${fn}$ is ${k > 0 ? "positive" : "negative"}, so use the ${quads} quadrants: $${v} = ${base.map((q) => fmtX(q)).join(",\\ ")}$`;
      if (b > 1) s += `, then add $${fmtX(fn === "tan" ? 180 : 360)}$ until $${v}$ reaches $${units === "deg" ? 360 * b + "°" : b * 2 + "\\pi"}$: $${v} = ${S.map(fmtX).join(",\\ ")}$`;
      s += `.</p><p style="margin:4px 0 0"><b>Solutions:</b> $x = ${S.map((th) => fmtX(th / b)).join(",\\ ")}$${b > 1 ? ` (after dividing by ${b})` : ""}.</p>`;
      out.innerHTML = s; HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     4. sin(A + B) built from two triangles
     ===================================================================== */
  mount("w-compound", (box) => {
    let A = 35, B = 25;
    const ctl = controls(box);
    HM.slider(ctl, { label: "$A$", min: 5, max: 80, step: 1, value: A, unit: "°", oninput: (v) => { A = v; upd(); } });
    HM.slider(ctl, { label: "$B$", min: 5, max: 80, step: 1, value: B, unit: "°", oninput: (v) => { B = v; upd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 520 : 330),
      draw(ctx, t, dt, C, S) {
        const narrow = S.w < 560;
        const R = narrow ? Math.min(S.w - 90, 260) : Math.min(S.h - 60, 260);
        const ox = 40, oy = narrow ? R + 40 : S.h - 30;
        const a = A * D2R, b = B * D2R;
        const Q = [ox + R * Math.cos(b) * Math.cos(a), oy - R * Math.cos(b) * Math.sin(a)];
        const Pp = [ox + R * Math.cos(a + b), oy - R * Math.sin(a + b)];
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(ox - 10, oy); ctx.lineTo(ox + R + 20, oy); ctx.stroke();
        // ray at angle A (faint), OQ, QP
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + (R + 20) * Math.cos(a), oy - (R + 20) * Math.sin(a)); ctx.stroke(); ctx.setLineDash([]);
        ctx.lineWidth = 3; ctx.strokeStyle = C.ink; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(Pp[0], Pp[1]); ctx.stroke();
        ctx.strokeStyle = C.sea; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(Q[0], Q[1]); ctx.stroke();
        ctx.strokeStyle = C.violet; ctx.beginPath(); ctx.moveTo(Q[0], Q[1]); ctx.lineTo(Pp[0], Pp[1]); ctx.stroke();
        // height of Q (sin A cos B) and the rise from Q to P (cos A sin B)
        const hx = Pp[0] + 18 > Q[0] ? Math.max(Q[0], Pp[0]) + 24 : Q[0] + 24;
        ctx.lineWidth = 6;
        ctx.strokeStyle = C.red; ctx.beginPath(); ctx.moveTo(hx, oy); ctx.lineTo(hx, Q[1]); ctx.stroke();
        ctx.strokeStyle = C.gold; ctx.beginPath(); ctx.moveTo(hx, Q[1]); ctx.lineTo(hx, Pp[1]); ctx.stroke();
        ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.strokeStyle = C.ink2;
        ctx.beginPath(); ctx.moveTo(Q[0], Q[1]); ctx.lineTo(hx, Q[1]); ctx.moveTo(Pp[0], Pp[1]); ctx.lineTo(hx, Pp[1]); ctx.stroke(); ctx.setLineDash([]);
        // angle arcs
        ctx.lineWidth = 2.5; ctx.strokeStyle = C.sea; ctx.beginPath(); ctx.arc(ox, oy, 30, 0, -a, true); ctx.stroke();
        ctx.strokeStyle = C.violet; ctx.beginPath(); ctx.arc(ox, oy, 42, -a, -a - b, true); ctx.stroke();
        HM.label(ctx, "A", ox + 38 * Math.cos(a / 2), oy - 38 * Math.sin(a / 2), { bold: true, col: C.sea });
        HM.label(ctx, "B", ox + 52 * Math.cos(a + b / 2), oy - 52 * Math.sin(a + b / 2), { bold: true, col: C.violet });
        HM.dot(ctx, Q[0], Q[1], C.sea, 4); HM.dot(ctx, Pp[0], Pp[1], C.ink, 5);
        HM.label(ctx, "1", (ox + Pp[0]) / 2 - 10, (oy + Pp[1]) / 2 - 6, { bold: true });
        HM.label(ctx, "cos B", (ox + Q[0]) / 2 + 8, (oy + Q[1]) / 2 + 12, { size: 12, col: C.sea, bold: true });
        HM.label(ctx, "sin B", (Q[0] + Pp[0]) / 2 + 6, (Q[1] + Pp[1]) / 2 - 4, { size: 12, col: C.violet, bold: true });
        HM.label(ctx, "sin A cos B", hx + 8, (oy + Q[1]) / 2, { size: 12, col: C.red, bold: true });
        HM.label(ctx, "cos A sin B", hx + 8, (Q[1] + Pp[1]) / 2, { size: 12, col: C.gold, bold: true });
        // bars
        const bxp = narrow ? { x: 20, y: oy + 34, w: S.w - 40 } : { x: S.w * 0.62, y: 40, w: S.w * 0.36 };
        const vals = [["sin(A + B)", Math.sin(a + b), C.ink], ["sin A cos B + cos A sin B", Math.sin(a) * Math.cos(b) + Math.cos(a) * Math.sin(b), C.grass], ["sin A + sin B  ✘", Math.sin(a) + Math.sin(b), C.red]];
        vals.forEach(([l, v, col], i) => {
          const y = bxp.y + i * 52;
          HM.label(ctx, l, bxp.x, y, { size: 12, bold: true });
          ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.fillRect(bxp.x, y + 10, bxp.w * v / 2, 16); ctx.globalAlpha = 1;
          HM.label(ctx, N(v, 4), bxp.x + bxp.w * v / 2 + 6, y + 18, { size: 12 });
        });
        cv.setAttribute("aria-label", `Construction for A = ${A} and B = ${B} degrees: the height of P, sin(A + B) = ${N(Math.sin(a + b), 4)}, is the sum of sin A cos B and cos A sin B. sin A + sin B would be ${N(Math.sin(a) + Math.sin(b), 4)}.`);
      },
    });
    function upd() {
      sim.redraw();
      const a = A * D2R, b = B * D2R;
      out.innerHTML = `<p style="margin:0">The unit length at angle $A + B = ${A + B}°$ is split into $\\cos B$ along the $A$ line and $\\sin B$ at right angles to it. Their heights add: $\\sin(A + B) = \\sin A\\cos B + \\cos A\\sin B = ${N(Math.sin(a) * Math.cos(b), 4)} + ${N(Math.cos(a) * Math.sin(b), 4)} = ${N(Math.sin(a + b), 4)}$.</p>`;
      HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     5. Wave function: phasors and waves
     ===================================================================== */
  mount("w-wave", (box) => {
    let a = 4, b = 3, x = 0, playing = false;
    const ctl = controls(box);
    HM.slider(ctl, { label: "$a$ (coefficient of $\\cos x$)", min: -5, max: 5, step: 1, value: a, oninput: (v) => { a = v; if (!a && !b) a = 1; upd(); } });
    HM.slider(ctl, { label: "$b$ (coefficient of $\\sin x$)", min: -5, max: 5, step: 1, value: b, oninput: (v) => { b = v; if (!a && !b) b = 1; upd(); } });
    const play = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Roll the swell");
    box.append(HM.el("div", { class: "btn-row" }, play));
    play.addEventListener("click", () => { playing = !playing; playing ? sim.play() : sim.pause(); play.textContent = playing ? "❚❚ Pause" : "▶ Roll the swell"; });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 520 : 300),
      draw(ctx, t, dt, C, S) {
        if (playing) x = (x + dt * 60) % 360;
        const narrow = S.w < 560;
        const k = Math.hypot(a, b);
        const R = narrow ? Math.min(S.w / 2 - 30, 110) : Math.min(S.h / 2 - 24, 120);
        const cx = narrow ? S.w / 2 : R + 30, cy = narrow ? R + 22 : S.h / 2;
        const u = R / 5.5;
        ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy); ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R); ctx.stroke();
        ctx.strokeStyle = C.ink2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(cx, cy, k * u, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        // rotate everything by −x so the horizontal projection is the value at x:
        // a cos x + b sin x = projection onto the "x-direction" rotated; draw the cos arrow at angle −x, sin arrow at 90° − x
        const r = -x * D2R;
        const ca = [a * Math.cos(r), a * Math.sin(r)], sb = [b * Math.cos(r + Math.PI / 2), b * Math.sin(r + Math.PI / 2)];
        const tip1 = [cx + ca[0] * u, cy - ca[1] * u], tip2 = [tip1[0] + sb[0] * u, tip1[1] - sb[1] * u];
        HM.arrow(ctx, cx, cy, tip1[0], tip1[1], C.sea, 3.5, 10);
        HM.arrow(ctx, tip1[0], tip1[1], tip2[0], tip2[1], C.gold, 3.5, 10);
        HM.arrow(ctx, cx, cy, tip2[0], tip2[1], C.red, 4, 12);
        ctx.setLineDash([3, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(tip2[0], tip2[1]); ctx.lineTo(tip2[0], cy); ctx.stroke(); ctx.setLineDash([]);
        HM.dot(ctx, tip2[0], cy, C.red, 5);
        HM.label(ctx, `x = ${Math.round(x)}°`, cx - R + 2, cy - R + 8, { size: 12, bold: true });
        HM.label(ctx, `k = ${N(k, 2)}`, tip2[0] + 6, tip2[1] - 8, { size: 12, bold: true, col: C.red });
        // waves
        const g = narrow ? { x: 34, y: cy + R + 26, w: S.w - 46, h: S.h - (cy + R + 26) - 22 } : { x: cx + R + 46, y: 10, w: S.w - (cx + R + 46) - 12, h: S.h - 32 };
        const P = HM.plot(ctx, g, { x0: 0, x1: 360, y0: -7.5, y1: 7.5, xt: 90, yt: 2.5, C, xl: "x°", yl: "", tf: (v) => String(v), ytf: (v) => (v % 5 ? "" : String(v).replace("-", "−")) });
        HM.curve(ctx, P, (z) => a * Math.cos(z * D2R), 0, 360, C.sea, 1.8, { dash: [5, 4] });
        HM.curve(ctx, P, (z) => b * Math.sin(z * D2R), 0, 360, C.gold, 1.8, { dash: [5, 4] });
        HM.curve(ctx, P, (z) => a * Math.cos(z * D2R) + b * Math.sin(z * D2R), 0, 360, C.red, 3);
        const val = a * Math.cos(x * D2R) + b * Math.sin(x * D2R);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.X(x), g.y); ctx.lineTo(P.X(x), g.y + g.h); ctx.stroke();
        HM.dot(ctx, P.X(x), P.Y(val), C.red, 5.5, C.card);
        cv.setAttribute("aria-label", `Phasor diagram and graphs: ${a} cos x ${b < 0 ? "minus" : "plus"} ${Math.abs(b)} sin x equals ${N(k, 3)} cos(x minus ${N(alpha(), 1)} degrees).`);
      },
    });
    function alpha() { let al = Math.atan2(b, a) / D2R; if (al < 0) al += 360; return al; }
    function upd() {
      sim.redraw();
      const k2 = a * a + b * b, k = Math.sqrt(k2), al = alpha();
      const kt = Number.isInteger(k) ? `${k}` : `\\sqrt{${k2}}`;
      const q = b >= 0 ? (a >= 0 ? 1 : 2) : (a >= 0 ? 4 : 3);
      const acute = a === 0 || b === 0 ? null : Math.atan(Math.abs(b / a)) / D2R;
      const qtxt = a === 0 || b === 0 ? "on an axis" : `$\\sin\\alpha$ ${b > 0 ? "positive" : "negative"}, $\\cos\\alpha$ ${a > 0 ? "positive" : "negative"}: quadrant ${q}`;
      const co = (v, f, first) => (v === 0 ? "" : `${v < 0 ? "-" : first ? "" : "+"} ${Math.abs(v) === 1 ? "" : Math.abs(v)}${f}`);
      const lhs = `${co(a, "\\cos x", true)} ${co(b, "\\sin x", a === 0)}`.trim();
      const kc = kt === "1" ? "" : kt;
      const rhs = al === 0 ? `${kc}\\cos x^\\circ` : `${kc}\\cos(x - ${N(al, 1)})^\\circ`;
      out.innerHTML = HM.tex(`${lhs} = k\\cos x\\cos\\alpha + k\\sin x\\sin\\alpha`, true) +
        `<p style="margin:0">$k\\cos\\alpha = ${a}$, $k\\sin\\alpha = ${b}$, so $k = \\sqrt{${a < 0 ? `(${a})` : a}^2 + ${b < 0 ? `(${b})` : b}^2} = ${kt}${Number.isInteger(k) ? "" : ` \\approx ${N(k, 3)}`}$. ${a === 0 ? "$\\cos\\alpha = 0$ (so $\\tan\\alpha$ is undefined)" : `$\\tan\\alpha = \\frac{${b}}{${a}}$`}; ${qtxt}${acute !== null ? `, acute angle $${N(acute, 1)}°$` : ""}, so $\\alpha = ${N(al, 1)}°$.</p>` +
        HM.tex(`${lhs} = ${rhs}`, true) +
        `<p style="margin:0">Maximum $${kt}$ at $x = ${N(al, 1)}°$; minimum $-${kt}$ at $x = ${N((al + 180) % 360, 1)}°$.</p>`;
      HM.math(out);
    }
    upd();
  });
})();
