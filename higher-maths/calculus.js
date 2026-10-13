/* Calculus — the widgets on the gun deck. */
(function () {
  "use strict";
  const HM = window.HM;
  const $ = (id) => document.getElementById(id);
  const N = HM.n;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HM.el("canvas", { class: "sim", role: "img", "aria-label": label || "" }); box.append(c); return c; };
  const texBox = (box) => { const d = HM.el("div", { class: "tex-out", "aria-live": "polite" }); box.append(d); return d; };
  const controls = (box) => { const d = HM.el("div", { class: "sim-controls" }); box.append(d); return d; };
  const easeIO = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  /* =====================================================================
     1. Sliding tangent + derived graph
     ===================================================================== */
  mount("w-deriv", (box) => {
    const FN = {
      cubic: { tex: "f(x) = x^3 - 3x", dtex: "f'(x) = 3x^2 - 3", f: (x) => x * x * x - 3 * x, d: (x) => 3 * x * x - 3, x0: -2.5, x1: 2.5, y0: -5, y1: 5, dy0: -4, dy1: 12, tick: 1 },
      quad: { tex: "f(x) = 4 - x^2", dtex: "f'(x) = -2x", f: (x) => 4 - x * x, d: (x) => -2 * x, x0: -3, x1: 3, y0: -5, y1: 5, dy0: -6, dy1: 6, tick: 1 },
      sin: { tex: "f(x) = \\sin x", dtex: "f'(x) = \\cos x", f: Math.sin, d: Math.cos, x0: 0, x1: 2 * Math.PI, y0: -1.5, y1: 1.5, dy0: -1.5, dy1: 1.5, tick: Math.PI / 2, rad: true },
      quart: { tex: "f(x) = \\tfrac14x^4 - x^3", dtex: "f'(x) = x^3 - 3x^2", f: (x) => x ** 4 / 4 - x ** 3, d: (x) => x ** 3 - 3 * x * x, x0: -1.5, x1: 4.2, y0: -8, y1: 3, dy0: -5, dy1: 8, tick: 1 },
    };
    let key = "cubic", x = -1.8, full = false, auto = false;
    HM.choice(box, "Curve:", Object.entries(FN).map(([k, v]) => [k, `$${v.tex.replace("f(x) = ", "")}$`]), key, (v) => { key = v; x = FN[v].x0 + 0.3; xs.input.min = FN[v].x0; xs.input.max = FN[v].x1; xs.set(x); });
    const ctl = controls(box);
    const xs = HM.slider(ctl, { label: "$x$", min: FN[key].x0, max: FN[key].x1, step: 0.01, value: x, fmt: (v) => N(v, 2), oninput: (v) => { x = v; sim.redraw(); info(); } });
    const row = HM.el("div", { class: "btn-row" });
    const go = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Sweep along the curve");
    const show = HM.el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "Show the whole of f′");
    row.append(go, show); box.append(row);
    go.addEventListener("click", () => { auto = !auto; if (auto) { if (x >= FN[key].x1 - 0.05) x = FN[key].x0; sim.play(); } else sim.pause(); go.textContent = auto ? "❚❚ Pause" : "▶ Sweep along the curve"; });
    show.addEventListener("click", () => { full = !full; show.setAttribute("aria-pressed", String(full)); sim.redraw(); });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 480 : 440),
      draw(ctx, t, dt, C, S) {
        const F = FN[key];
        if (auto) { x += dt * (F.x1 - F.x0) / 7; if (x >= F.x1) { x = F.x1; auto = false; S.pause(); go.textContent = "▶ Sweep along the curve"; } xs.input.value = x; info(); }
        const h1 = S.h * 0.56;
        const b1 = { x: 40, y: 10, w: S.w - 54, h: h1 - 24 }, b2 = { x: 40, y: h1 + 8, w: S.w - 54, h: S.h - h1 - 30 };
        const tf = F.rad ? (v) => ["0", "π/2", "π", "3π/2", "2π"][Math.round(v / (Math.PI / 2))] || "" : undefined;
        const P1 = HM.plot(ctx, b1, { x0: F.x0, x1: F.x1, y0: F.y0, y1: F.y1, xt: F.tick, yt: F.rad ? 0.5 : 1, C, xl: "x", yl: "y = f(x)", tf, ytf: (v) => (Math.abs(v % 1) < 1e-9 ? String(v).replace("-", "−") : "") });
        const P2 = HM.plot(ctx, b2, { x0: F.x0, x1: F.x1, y0: F.dy0, y1: F.dy1, xt: F.tick, yt: F.rad ? 0.5 : 2, C, xl: "x", yl: "y = f′(x)", tf, ytf: (v) => (Math.abs(v % 1) < 1e-9 ? String(v).replace("-", "−") : "") });
        const m = F.d(x), y = F.f(x);
        HM.clip(ctx, b1, () => {
          HM.curve(ctx, P1, F.f, F.x0, F.x1, C.sea, 3);
          // the curve is coloured by the sign of the gradient up to x
          HM.curve(ctx, P1, (z) => (F.d(z) > 0 ? F.f(z) : NaN), F.x0, x, C.grass, 5);
          HM.curve(ctx, P1, (z) => (F.d(z) < 0 ? F.f(z) : NaN), F.x0, x, C.red, 5);
          const L = (F.x1 - F.x0) * 0.22;
          HM.curve(ctx, P1, (z) => y + m * (z - x), x - L, x + L, C.ink, 2.5);
          HM.dot(ctx, P1.X(x), P1.Y(y), C.ink, 6, C.card);
        });
        HM.clip(ctx, b2, () => {
          if (full) HM.curve(ctx, P2, F.d, F.x0, F.x1, C.muted, 2, { dash: [6, 4] });
          HM.curve(ctx, P2, F.d, F.x0, x, C.violet, 3);
          HM.dot(ctx, P2.X(x), P2.Y(m), C.violet, 6, C.card);
        });
        ctx.setLineDash([3, 3]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P1.X(x), P1.Y(y)); ctx.lineTo(P2.X(x), Math.max(b2.y, Math.min(b2.y + b2.h, P2.Y(m)))); ctx.stroke(); ctx.setLineDash([]);
        HM.label(ctx, `gradient ${N(m, 2)}`, Math.min(P1.X(x) + 10, S.w - 110), Math.max(P1.Y(y) - 16, 18), { bold: true, size: 13 });
        cv.setAttribute("aria-label", `Top: the curve ${F.tex} with its tangent at x = ${N(x, 2)}, gradient ${N(m, 2)}. Bottom: the gradient plotted against x, which traces ${F.dtex}.`);
      },
    });
    function info() {
      const F = FN[key], m = F.d(x);
      out.innerHTML = `<p style="margin:0">$${F.tex}$, so $${F.dtex}$. At $x = ${N(x, 2)}$ the gradient is $${N(m, 2)}$: the curve is ${Math.abs(m) < 0.02 ? "<b>stationary</b> here: $f'(x) = 0$" : m > 0 ? "<b>increasing</b> ($f'(x) \\gt 0$, green)" : "<b>decreasing</b> ($f'(x) \\lt 0$, red)"}.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     2. Chain rule gears
     ===================================================================== */
  mount("w-gears", (box) => {
    const FN = {
      p5: { tex: "y = (3x - 1)^5", inner: "u = 3x - 1", outer: "y = u^5", g: (x) => 3 * x - 1, dg: () => 3, dgt: "3", f: (u) => u ** 5, df: (u) => 5 * u ** 4, dft: "5u^4", xs: [0, 1], y: (x) => (3 * x - 1) ** 5 },
      root: { tex: "y = \\sqrt{x^2 + 5}", inner: "u = x^2 + 5", outer: "y = u^{1/2}", g: (x) => x * x + 5, dg: (x) => 2 * x, dgt: "2x", f: Math.sqrt, df: (u) => 0.5 / Math.sqrt(u), dft: "\\tfrac12u^{-1/2}", xs: [2, -2], y: (x) => Math.sqrt(x * x + 5) },
      sin: { tex: "y = \\sin(2x)", inner: "u = 2x", outer: "y = \\sin u", g: (x) => 2 * x, dg: () => 2, dgt: "2", f: Math.sin, df: Math.cos, dft: "\\cos u", xs: [0, Math.PI / 6], y: (x) => Math.sin(2 * x) },
      cos3: { tex: "y = \\cos^3 x", inner: "u = \\cos x", outer: "y = u^3", g: Math.cos, dg: (x) => -Math.sin(x), dgt: "-\\sin x", f: (u) => u ** 3, df: (u) => 3 * u * u, dft: "3u^2", xs: [Math.PI / 3, Math.PI / 4], y: (x) => Math.cos(x) ** 3 },
    };
    let key = "p5", x = 1;
    HM.choice(box, "Function:", Object.entries(FN).map(([k, v]) => [k, `$${v.tex}$`]), key, (v) => { key = v; x = FN[v].xs[0]; xsl.set(x); });
    const ctl = controls(box);
    const xsl = HM.slider(ctl, { label: "$x$", min: -2, max: 2, step: 0.05, value: x, fmt: (v) => N(v, 2), oninput: (v) => { x = v; info(); sim.redraw(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const angles = [0, 0, 0];
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 220 : 200),
      loop: true,
      draw(ctx, t, dt, C, S) {
        const F = FN[key];
        const r1 = F.dg(x), r2 = F.df(F.g(x)), r = r1 * r2;
        // turning speeds (radians per second), squashed so huge ratios still look sensible
        const sq = (v) => Math.sign(v) * Math.min(6, Math.log1p(Math.abs(v)) * 1.4);
        const speeds = [0.6, 0.6 * sq(r1), 0.6 * sq(r)];
        if (!HM.reduced) for (let i = 0; i < 3; i++) angles[i] += speeds[i] * dt;
        const ys = S.h * 0.48;
        const gx = [S.w * 0.17, S.w * 0.5, S.w * 0.83];
        const R = Math.min(56, S.w * 0.12);
        const gear = (cx, ang, col, label, rate) => {
          const teeth = 12;
          ctx.save(); ctx.translate(cx, ys); ctx.rotate(ang);
          ctx.fillStyle = col; ctx.beginPath();
          for (let i = 0; i < teeth * 2; i++) { const a = i * Math.PI / teeth, rr = i % 2 ? R * 0.82 : R; ctx.lineTo(rr * Math.cos(a), rr * Math.sin(a)); }
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = "rgba(0,0,0,.25)"; ctx.fillRect(-R * 0.6, -4, R * 1.2, 8);
          ctx.fillStyle = C.card; ctx.beginPath(); ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
          HM.label(ctx, label, cx, ys + R + 16, { align: "center", bold: true, size: 15 });
          if (rate) HM.label(ctx, rate, cx, ys - R - 12, { align: "center", size: 13, col: C.ink2 });
        };
        gear(gx[0], angles[0], "#8a8f99", "x", "turns at 1");
        gear(gx[1], angles[1], "#a8794f", "u", `du/dx = ${N(r1, 3)}`);
        gear(gx[2], angles[2], "#c99a2e", "y", `dy/dx = ${N(r, 3)}`);
        HM.label(ctx, `× ${N(r1, 3)}`, (gx[0] + gx[1]) / 2, ys, { align: "center", bold: true, col: C.sea });
        HM.label(ctx, `× ${N(r2, 3)}`, (gx[1] + gx[2]) / 2, ys, { align: "center", bold: true, col: C.red });
        cv.setAttribute("aria-label", `Three gears: x drives u at du/dx = ${N(r1, 3)}, u drives y at dy/du = ${N(r2, 3)}, so y turns at dy/dx = ${N(r, 3)}.`);
      },
    });
    function info() {
      const F = FN[key], u = F.g(x), r1 = F.dg(x), r2 = F.df(u), r = r1 * r2;
      const h = 1e-5, num = (F.y(x + h) - F.y(x - h)) / (2 * h);
      out.innerHTML = HM.tex(`${F.tex}:\\quad ${F.inner},\\ \\ ${F.outer}`, true) +
        HM.tex(`\\frac{dy}{dx} = \\frac{dy}{du}\\times\\frac{du}{dx} = ${F.dft} \\times ${F.dgt}`, true) +
        `<p style="margin:0">At $x = ${N(x, 2)}$: $u = ${N(u, 3)}$, $\\frac{du}{dx} = ${N(r1, 3)}$, $\\frac{dy}{du} = ${N(r2, 3)}$, so $\\frac{dy}{dx} = ${N(r1, 3)} \\times ${N(r2, 3)} = ${N(r, 3)}$. Measured straight from the graph: $${N(num, 3)}$.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     3. Live nature table for a cubic
     ===================================================================== */
  mount("w-nature", (box) => {
    let a = 1, b = -3, c = -9, d = 5;
    const ctl = controls(box);
    HM.slider(ctl, { label: "$a$ ($x^3$)", min: -2, max: 2, step: 1, value: a, oninput: (v) => { a = v || 1; upd(); } });
    HM.slider(ctl, { label: "$b$ ($x^2$)", min: -6, max: 6, step: 1, value: b, oninput: (v) => { b = v; upd(); } });
    HM.slider(ctl, { label: "$c$ ($x$)", min: -12, max: 12, step: 1, value: c, oninput: (v) => { c = v; upd(); } });
    HM.slider(ctl, { label: "$d$", min: -20, max: 20, step: 1, value: d, oninput: (v) => { d = v; upd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const f = (x) => ((a * x + b) * x + c) * x + d, fd = (x) => (3 * a * x + 2 * b) * x + c;
    function sps() {
      const A = 3 * a, B = 2 * b, D = B * B - 4 * A * c;
      if (D < -1e-9) return [];
      if (Math.abs(D) < 1e-9) return [-B / (2 * A)];
      const s = Math.sqrt(D);
      return [(-B - s) / (2 * A), (-B + s) / (2 * A)].sort((p, q) => p - q);
    }
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const pts = sps();
        const xc = pts.length ? (pts[0] + pts[pts.length - 1]) / 2 : -b / (3 * a);
        const span = pts.length ? Math.max(2.5, (pts[pts.length - 1] - pts[0]) * 0.9 + 1.5) : 3;
        const x0 = xc - span, x1 = xc + span;
        let lo = Infinity, hi = -Infinity;
        for (let i = 0; i <= 100; i++) { const v = f(x0 + (x1 - x0) * i / 100); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        const pad = (hi - lo) * 0.12 + 1;
        const bx = { x: 48, y: 10, w: S.w - 62, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0, x1, y0: lo - pad, y1: hi + pad, xt: HM.niceStep(x1 - x0), yt: HM.niceStep(hi - lo + 2 * pad), C, xl: "x", yl: "y", tf: (v) => N(v, 1), ytf: (v) => N(v, 0) });
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, (x) => (fd(x) >= 0 ? f(x) : NaN), x0, x1, C.grass, 3.5, { n: 600 });
          HM.curve(ctx, P, (x) => (fd(x) <= 0 ? f(x) : NaN), x0, x1, C.red, 3.5, { n: 600 });
          pts.forEach((x) => HM.dot(ctx, P.X(x), P.Y(f(x)), C.ink, 6, C.card));
        });
        pts.forEach((x) => HM.label(ctx, `(${N(x, 2)}, ${N(f(x), 2)})`, Math.min(P.X(x) + 8, S.w - 100), P.Y(f(x)) + (fd(x - 0.01) > 0 ? -14 : 16), { size: 12, bold: true }));
        cv.setAttribute("aria-label", `Cubic y = ${a}x³ + ${b}x² + ${c}x + ${d}: green where increasing, red where decreasing; ${pts.length} stationary point${pts.length === 1 ? "" : "s"}.`);
      },
    });
    function upd() {
      sim.redraw();
      const pts = sps();
      const sg = (v) => (Math.abs(v) < 1e-9 ? "0" : v > 0 ? "+" : "−");
      const arrow = (v) => (Math.abs(v) < 1e-9 ? "→" : v > 0 ? "↗" : "↘");
      const poly = HM.polyTex([a, b, c, d]);
      let s = HM.tex(`y = ${poly},\\qquad \\frac{dy}{dx} = ${HM.polyTex([3 * a, 2 * b, c])}`, true);
      if (!pts.length) s += `<p style="margin:0">$b^2 - 4ac \\lt 0$ for $\\frac{dy}{dx} = 0$: <b>no stationary points</b>. The cubic is always ${a > 0 ? "increasing" : "decreasing"}.</p>`;
      else {
        const cols = [];
        pts.forEach((x) => { cols.push([`→ ${N(x, 2)}⁻`, fd(x - 0.01)], [N(x, 2), 0], [`→ ${N(x, 2)}⁺`, fd(x + 0.01)]); });
        s += `<div class="table-wrap" style="margin:6px 0"><table class="nature-table"><thead><tr><th>$x$</th>${cols.map((c) => `<th>${c[0]}</th>`).join("")}</tr></thead><tbody><tr><th scope="row">$\\frac{dy}{dx}$</th>${cols.map((c) => `<td>${sg(c[1])}</td>`).join("")}</tr><tr><th scope="row">slope</th>${cols.map((c) => `<td>${arrow(c[1])}</td>`).join("")}</tr></tbody></table></div>`;
        s += `<p style="margin:0">${pts.map((x) => { const l = fd(x - 0.01), r = fd(x + 0.01); const kind = l > 0 && r < 0 ? "maximum turning point" : l < 0 && r > 0 ? "minimum turning point" : l > 0 ? "rising point of inflection" : "falling point of inflection"; return `$(${N(x, 2)}, ${N(f(x), 2)})$: <b>${kind}</b>`; }).join("; ")}.</p>`;
      }
      out.innerHTML = s; HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     4. Greatest and least on a closed interval
     ===================================================================== */
  mount("w-interval", (box) => {
    let A = -2, B = 6;
    const f = (x) => x ** 3 - 3 * x * x - 9 * x + 5;
    const ctl = controls(box);
    HM.slider(ctl, { label: "left end $a$", min: -3, max: 2, step: 0.5, value: A, fmt: (v) => N(v), oninput: (v) => { A = v; upd(); } });
    HM.slider(ctl, { label: "right end $b$", min: 2.5, max: 6, step: 0.5, value: B, fmt: (v) => N(v), oninput: (v) => { B = v; upd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const cands = () => [[A, "end"], ...[-1, 3].filter((x) => x > A && x < B).map((x) => [x, "stationary"]), [B, "end"]];
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 44, y: 10, w: S.w - 58, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: -3.5, x1: 6.5, y0: -35, y1: 65, xt: 1, yt: 10, C, xl: "x", yl: "y" });
        const cs = cands(), vals = cs.map(([x]) => f(x)), mx = Math.max(...vals), mn = Math.min(...vals);
        HM.clip(ctx, bx, () => {
          ctx.fillStyle = C.gold; ctx.globalAlpha = 0.1; ctx.fillRect(P.X(A), bx.y, P.X(B) - P.X(A), bx.h); ctx.globalAlpha = 1;
          HM.curve(ctx, P, f, -3.5, 6.5, C.muted, 2, { dash: [5, 4] });
          HM.curve(ctx, P, f, A, B, C.sea, 3.5);
          cs.forEach(([x, k]) => { const v = f(x); HM.dot(ctx, P.X(x), P.Y(v), v === mx ? C.grass : v === mn ? C.red : C.ink, 6.5, C.card); });
        });
        cs.forEach(([x]) => { const v = f(x); if (v === mx || v === mn) HM.label(ctx, `${v === mx ? "greatest" : "least"} ${N(v, 2)}`, Math.min(P.X(x) + 8, S.w - 110), P.Y(v) + (v === mx ? -12 : 14), { bold: true, size: 12, col: v === mx ? C.grass : C.red }); });
        cv.setAttribute("aria-label", `f(x) = x³ − 3x² − 9x + 5 on ${A} ≤ x ≤ ${B}: greatest ${N(mx, 2)}, least ${N(mn, 2)}.`);
      },
    });
    function upd() {
      sim.redraw();
      const cs = cands(), vals = cs.map(([x]) => f(x)), mx = Math.max(...vals), mn = Math.min(...vals);
      const row = cs.map(([x, k]) => `<tr><td>${k === "end" ? "endpoint" : "stationary point"}</td><td class="num">$${N(x)}$</td><td class="num">$${N(f(x), 3)}$</td><td>${f(x) === mx ? "<span class='ok'>greatest</span>" : f(x) === mn ? "<span class='bad'>least</span>" : ""}</td></tr>`).join("");
      out.innerHTML = `<div class="table-wrap" style="margin:0"><table><thead><tr><th>Candidate</th><th class="num">$x$</th><th class="num">$f(x)$</th><th></th></tr></thead><tbody>${row}</tbody></table></div><p style="margin:6px 0 0">Stationary points at $x = -1$ and $x = 3$ count only if they lie inside $${N(A)} \\le x \\le ${N(B)}$. ${cs.some(([x, k]) => k === "end" && (f(x) === mx || f(x) === mn)) ? "<b>An endpoint wins this time.</b>" : "This time the extremes are at stationary points."}</p>`;
      HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     5. Copper box optimisation: a sheet that folds
     ===================================================================== */
  mount("w-box", (box) => {
    const L = 24, W = 15;
    let x = 2;
    const V = (x) => x * (L - 2 * x) * (W - 2 * x);
    const ctl = controls(box);
    HM.slider(ctl, { label: "corner square $x$", min: 0.25, max: 7.25, step: 0.25, value: x, unit: "cm", fmt: (v) => N(v, 2), oninput: (v) => { x = v; fold0 = sim.t; if (!sim.playing && !HM.reduced) sim.play(); info(); } });
    const best = HM.el("button", { class: "btn small", type: "button" }, "Jump to x = 3");
    box.append(HM.el("div", { class: "btn-row" }, best));
    const cv = canvasIn(box);
    const out = texBox(box);
    let fold0 = -10;
    best.addEventListener("click", () => { ctl.querySelector("input").value = 3; x = 3; ctl.querySelector("input").dispatchEvent(new Event("input")); });
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 520 : 300),
      draw(ctx, t, dt, C, S) {
        const narrow = S.w < 560;
        // a fold animation: 0 = flat sheet, 1 = sides up
        const fp = HM.reduced ? 1 : Math.max(0, Math.min(1, (t - fold0) / 1.2));
        const ang = easeIO(fp) * Math.PI / 2;
        if (fp >= 1 && S.playing) S.pause();
        const area = narrow ? { x: 0, y: 0, w: S.w, h: 250 } : { x: 0, y: 0, w: S.w * 0.5, h: S.h };
        const sc = Math.min(area.w / 28, area.h / 19);
        const ox = area.x + area.w / 2, oy = area.y + area.h * 0.62;
        // isometric-ish projection of 3D (X along length, Y along width, Z up)
        const pr = (X, Y, Z) => [ox + (X - Y * 0.55) * sc * 0.9, oy - (Z + Y * 0.45) * sc * 0.9 + 0];
        const base = [[x, x], [L - x, x], [L - x, W - x], [x, W - x]].map(([X, Y]) => [X - L / 2, Y - W / 2]);
        const poly = (pts, col, stroke) => { ctx.fillStyle = col; ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.fill(); ctx.strokeStyle = stroke || "rgba(0,0,0,.45)"; ctx.lineWidth = 1.2; ctx.stroke(); };
        const h = x, ca = Math.cos(ang), sa = Math.sin(ang);
        const [x0, y0] = base[0], [x1, y1] = base[2];
        // flaps: back, left, right, front (draw back ones first)
        const flapBack = [[x0, y1, 0], [x1, y1, 0], [x1, y1 + h * ca, h * sa], [x0, y1 + h * ca, h * sa]];
        const flapLeft = [[x0, y0, 0], [x0, y1, 0], [x0 - h * ca, y1, h * sa], [x0 - h * ca, y0, h * sa]];
        const flapRight = [[x1, y0, 0], [x1, y1, 0], [x1 + h * ca, y1, h * sa], [x1 + h * ca, y0, h * sa]];
        const flapFront = [[x0, y0, 0], [x1, y0, 0], [x1, y0 - h * ca, h * sa], [x0, y0 - h * ca, h * sa]];
        const P3 = (q) => q.map((p) => pr(...p));
        // cut corners shown as faint outlines on the flat sheet
        if (fp < 0.05) { ctx.setLineDash([4, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; [[-L / 2, -W / 2], [L / 2 - x, -W / 2], [L / 2 - x, W / 2 - x], [-L / 2, W / 2 - x]].forEach(([X, Y]) => { const q = P3([[X, Y, 0], [X + x, Y, 0], [X + x, Y + x, 0], [X, Y + x, 0]]); ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.stroke(); }); ctx.setLineDash([]); }
        poly(P3(flapBack), "#b06a3a"); poly(P3(flapLeft), "#a35f33");
        poly(P3([[x0, y0, 0], [x1, y0, 0], [x1, y1, 0], [x0, y1, 0]]), "#c9824c");
        poly(P3(flapRight), "#a35f33"); poly(P3(flapFront), "#d8955c");
        HM.label(ctx, `x = ${N(x, 2)} cm`, area.x + 10, area.y + 16, { bold: true });
        HM.label(ctx, `${N(L - 2 * x, 2)} × ${N(W - 2 * x, 2)} × ${N(x, 2)}`, area.x + 10, area.y + 34, { size: 12, col: C.ink2 });
        // V(x) graph
        const gb = narrow ? { x: 44, y: 270, w: S.w - 58, h: S.h - 300 } : { x: S.w * 0.55, y: 10, w: S.w * 0.45 - 14, h: S.h - 32 };
        const Pg = HM.plot(ctx, gb, { x0: 0, x1: 7.5, y0: 0, y1: 550, xt: 1, yt: 100, C, xl: "x (cm)", yl: "V (cm³)" });
        HM.clip(ctx, gb, () => {
          HM.curve(ctx, Pg, V, 0, 7.5, C.sea, 3);
          ctx.setLineDash([4, 3]); ctx.strokeStyle = C.gold; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(Pg.X(3), Pg.Y(486)); ctx.lineTo(Pg.X(3), Pg.Y(0)); ctx.stroke(); ctx.setLineDash([]);
          HM.dot(ctx, Pg.X(x), Pg.Y(V(x)), C.red, 6.5, C.card);
        });
        HM.label(ctx, `V = ${N(V(x), 1)}`, Math.min(Pg.X(x) + 8, S.w - 80), Pg.Y(V(x)) - 12, { bold: true, col: C.red });
        cv.setAttribute("aria-label", `A 24 by 15 copper sheet with ${N(x, 2)} cm squares cut from the corners, folded into a box of volume ${N(V(x), 1)} cubic centimetres. The volume graph peaks at x = 3 with 486.`);
      },
    });
    function info() {
      const dv = 12 * x * x - 156 * x + 360;
      out.innerHTML = `<p style="margin:0">$V = x(24 - 2x)(15 - 2x) = ${N(V(x), 1)}$ cm³. $V'(x) = 12x^2 - 156x + 360 = ${N(dv, 1)}$: ${Math.abs(dv) < 1e-9 ? "<b>zero: this is the maximum</b>, $V = 486$ cm³." : dv > 0 ? "positive, so making $x$ bigger still <b>increases</b> the volume." : "negative, so making $x$ bigger now <b>reduces</b> the volume."}</p>`;
      HM.math(out);
    }
    info();
    fold0 = 0; if (!HM.reduced) sim.play();
  });

  /* =====================================================================
     6. Family of curves y = 2x³ − x² + C
     ===================================================================== */
  mount("w-family", (box) => {
    let Cc = 4, px = 1, py = 5;
    const F = (x) => 2 * x ** 3 - x * x;
    const ctl = controls(box);
    const cs = HM.slider(ctl, { label: "constant $C$", min: -8, max: 8, step: 0.5, value: Cc, fmt: (v) => N(v), oninput: (v) => { Cc = v; sim.redraw(); info(false); } });
    const pxs = HM.slider(ctl, { label: "point: $x$", min: -1.5, max: 1.5, step: 0.5, value: px, fmt: (v) => N(v), oninput: (v) => { px = v; fit(); } });
    const pys = HM.slider(ctl, { label: "point: $y$", min: -8, max: 8, step: 1, value: py, oninput: (v) => { py = v; fit(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    function fit() { Cc = py - F(px); cs.input.value = Cc; cs.input.dispatchEvent(new Event("input")); info(true); }
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 40, y: 10, w: S.w - 54, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: -2, x1: 2, y0: -12, y1: 14, xt: 0.5, yt: 2, C, xl: "x", yl: "y", tf: (v) => (v % 1 ? "" : String(v).replace("-", "−")), ytf: (v) => (v % 4 ? "" : String(v).replace("-", "−")) });
        HM.clip(ctx, bx, () => {
          for (let k = -8; k <= 8; k += 2) HM.curve(ctx, P, (x) => F(x) + k, -2, 2, C.muted, 1.2);
          HM.curve(ctx, P, (x) => F(x) + Cc, -2, 2, C.red, 3.5);
          // short gradient ticks at x = −1, 0, 1 on two curves to show the slopes match
          [-1, 0, 1].forEach((x) => [Cc, Cc - 6].forEach((k) => { const y = F(x) + k, m = 6 * x * x - 2 * x; HM.curve(ctx, P, (z) => y + m * (z - x), x - 0.18, x + 0.18, C.sea, 2.5); }));
          HM.dot(ctx, P.X(px), P.Y(py), C.gold, 7, C.card);
        });
        cv.setAttribute("aria-label", `The family y = 2x³ − x² + C; the highlighted member has C = ${N(Cc)}. The point (${px}, ${py}) is marked.`);
      },
    });
    function info(fromPoint) {
      const through = Math.abs(F(px) + Cc - py) < 1e-9;
      out.innerHTML = `<p style="margin:0">$\\dfrac{dy}{dx} = 6x^2 - 2x \\Rightarrow y = 2x^3 - x^2 + C$. Every grey curve has the same gradient at each $x$ (the blue ticks are parallel). ${fromPoint || through ? `Through $(${N(px)}, ${N(py)})$: $${N(py)} = 2(${N(px)})^3 - (${N(px)})^2 + C \\Rightarrow C = ${N(Cc)}$.` : "The red curve does not pass through the gold point: move $C$, or move the point."}</p>`;
      HM.math(out);
    }
    info(true);
  });

  /* =====================================================================
     7. Riemann strips → definite integral, signed
     ===================================================================== */
  mount("w-riemann", (box) => {
    const FN = {
      quad: { tex: "x^2 - x - 2", f: (x) => x * x - x - 2, F: (x) => x ** 3 / 3 - x * x / 2 - 2 * x, a: -1, b: 2, x0: -2, x1: 3.5, y0: -3, y1: 6 },
      cubic: { tex: "x^3 - 4x", f: (x) => x ** 3 - 4 * x, F: (x) => x ** 4 / 4 - 2 * x * x, a: -2, b: 2, x0: -2.5, x1: 3, y0: -6, y1: 8 },
      sin: { tex: "\\sin x", f: Math.sin, F: (x) => -Math.cos(x), a: 0, b: Math.PI, x0: -0.3, x1: 6.6, y0: -1.4, y1: 1.4, rad: true },
    };
    let key = "quad", n = 4, a = FN[key].a, b = FN[key].b;
    HM.choice(box, "Curve:", Object.entries(FN).map(([k, v]) => [k, `$y = ${v.tex}$`]), key, (v) => { key = v; a = FN[v].a; b = FN[v].b; as.input.min = bs.input.min = FN[v].x0; as.input.max = bs.input.max = FN[v].x1; as.set(a); bs.set(b); });
    const ctl = controls(box);
    const as = HM.slider(ctl, { label: "lower limit $a$", min: FN[key].x0, max: FN[key].x1, step: 0.05, value: a, fmt: (v) => N(v, 2), oninput: (v) => { a = Math.min(v, b - 0.1); upd(); } });
    const bs = HM.slider(ctl, { label: "upper limit $b$", min: FN[key].x0, max: FN[key].x1, step: 0.05, value: b, fmt: (v) => N(v, 2), oninput: (v) => { b = Math.max(v, a + 0.1); upd(); } });
    const ns = HM.slider(ctl, { label: "number of strips", min: 1, max: 200, step: 1, value: n, oninput: (v) => { n = v; upd(); } });
    const go = HM.el("button", { class: "btn small primary", type: "button" }, "▶ More and more strips");
    box.append(HM.el("div", { class: "btn-row" }, go));
    let anim = false;
    go.addEventListener("click", () => { anim = true; n = 1; sim.play(); });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const Fn = FN[key];
        if (anim) { n = Math.min(200, Math.ceil(n * (1 + dt * 1.6))); ns.input.value = n; const o = ns.input.closest(".slider").querySelector("output"); if (o) o.textContent = n; txt(); if (n >= 200) { anim = false; S.pause(); } }
        const bx = { x: 40, y: 10, w: S.w - 54, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: Fn.x0, x1: Fn.x1, y0: Fn.y0, y1: Fn.y1, xt: Fn.rad ? Math.PI / 2 : 1, yt: Fn.rad ? 0.5 : 1, C, xl: "x", yl: "y", tf: Fn.rad ? (v) => ["0", "π/2", "π", "3π/2", "2π"][Math.round(v / (Math.PI / 2))] || "" : undefined, ytf: (v) => (Math.abs(v % 1) < 1e-9 ? String(v).replace("-", "−") : "") });
        const w = (b - a) / n;
        HM.clip(ctx, bx, () => {
          for (let i = 0; i < n; i++) {
            const xm = a + (i + 0.5) * w, y = Fn.f(xm);
            ctx.fillStyle = y >= 0 ? C.grass : C.red; ctx.globalAlpha = 0.45;
            ctx.fillRect(P.X(a + i * w), Math.min(P.Y(0), P.Y(y)), P.X(a + (i + 1) * w) - P.X(a + i * w), Math.abs(P.Y(y) - P.Y(0)));
            ctx.globalAlpha = 1;
            if (n <= 40) { ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1; ctx.strokeRect(P.X(a + i * w), Math.min(P.Y(0), P.Y(y)), P.X(a + (i + 1) * w) - P.X(a + i * w), Math.abs(P.Y(y) - P.Y(0))); }
          }
          HM.curve(ctx, P, Fn.f, Fn.x0, Fn.x1, C.sea, 3);
        });
        cv.setAttribute("aria-label", `${n} strips under y = ${Fn.tex} from ${N(a, 2)} to ${N(b, 2)}; green strips count positive, red negative.`);
      },
    });
    function upd() { sim.redraw(); txt(); }
    function txt() {
      const Fn = FN[key], w = (b - a) / n;
      let pos = 0, neg = 0;
      for (let i = 0; i < n; i++) { const y = Fn.f(a + (i + 0.5) * w) * w; if (y >= 0) pos += y; else neg += y; }
      const I = Fn.F(b) - Fn.F(a);
      out.innerHTML = `<p style="margin:0">${n} strip${n > 1 ? "s" : ""}: green total $${N(pos, 3)}$, red total $${N(neg, 3)}$, so the signed sum is $${N(pos + neg, 3)}$.</p><p style="margin:4px 0 0">Exact: $\\displaystyle\\int_{${N(a, 2)}}^{${N(b, 2)}} (${Fn.tex})\\,dx = ${N(I, 3)}$. ${neg < -1e-6 && pos > 1e-6 ? "The curve crosses the axis here, so this integral is <b>not</b> the area: positive and negative parts partly cancel. Split at the root." : neg < -1e-6 ? "All of it is below the axis: the integral is negative, and the area is its size, $" + N(Math.abs(I), 3) + "$." : "All above the axis: the integral is the area."}</p>`;
      HM.math(out);
    }
    upd();
  });

  /* =====================================================================
     8. Area between y = x² and y = 2x + c
     ===================================================================== */
  mount("w-between", (box) => {
    let c = 3;
    const ctl = controls(box);
    HM.slider(ctl, { label: "line intercept $c$", min: -0.5, max: 8, step: 0.5, value: c, fmt: (v) => N(v), oninput: (v) => { c = v; sim.redraw(); info(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const roots = () => { const D = 4 + 4 * c; if (D < 0) return null; const s = Math.sqrt(D); return [(2 - s) / 2, (2 + s) / 2]; };
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 40, y: 10, w: S.w - 54, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: -3, x1: 5, y0: -2, y1: 20, xt: 1, yt: 2, C, xl: "x", yl: "y", ytf: (v) => (v % 4 ? "" : String(v)) });
        const r = roots();
        HM.clip(ctx, bx, () => {
          if (r) {
            ctx.fillStyle = C.gold; ctx.globalAlpha = 0.3; ctx.beginPath();
            for (let i = 0; i <= 80; i++) { const x = r[0] + (r[1] - r[0]) * i / 80; i ? ctx.lineTo(P.X(x), P.Y(2 * x + c)) : ctx.moveTo(P.X(x), P.Y(2 * x + c)); }
            for (let i = 80; i >= 0; i--) { const x = r[0] + (r[1] - r[0]) * i / 80; ctx.lineTo(P.X(x), P.Y(x * x)); }
            ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
            // a sample strip: upper minus lower
            const xm = (r[0] + r[1]) / 2;
            ctx.strokeStyle = C.violet; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(P.X(xm), P.Y(xm * xm)); ctx.lineTo(P.X(xm), P.Y(2 * xm + c)); ctx.stroke();
          }
          HM.curve(ctx, P, (x) => x * x, -3, 5, C.sea, 3);
          HM.curve(ctx, P, (x) => 2 * x + c, -3, 5, C.red, 3);
          if (r) r.forEach((x) => HM.dot(ctx, P.X(x), P.Y(x * x), C.ink, 5.5, C.card));
        });
        if (r) HM.label(ctx, "upper − lower", P.X((r[0] + r[1]) / 2) + 6, P.Y(((r[0] + r[1]) / 2) ** 2 + 1.5), { size: 12, col: C.violet, bold: true });
        cv.setAttribute("aria-label", `The parabola y = x² and the line y = 2x + ${N(c)}${r ? `, meeting at x = ${N(r[0], 2)} and x = ${N(r[1], 2)}, with the region between them shaded` : ", which do not meet"}.`);
      },
    });
    function info() {
      const r = roots();
      if (!r || r[1] - r[0] < 1e-9) { out.innerHTML = `<p style="margin:0">The line does not cross the parabola, so no region is enclosed.</p>`; return; }
      const G = (x) => x * x + c * x - x ** 3 / 3;
      const A = G(r[1]) - G(r[0]);
      out.innerHTML = `<p style="margin:0">Meet where $x^2 = 2x + ${N(c)}$: $x = ${N(r[0], 3)}$ and $x = ${N(r[1], 3)}$. Area $= \\displaystyle\\int_{${N(r[0], 3)}}^{${N(r[1], 3)}} \\big(2x + ${N(c)} - x^2\\big)\\,dx = \\Big[x^2 + ${N(c)}x - \\tfrac{x^3}{3}\\Big] = ${N(A, 3)}$ square units.</p>`;
      HM.math(out);
    }
    info();
  });
})();
