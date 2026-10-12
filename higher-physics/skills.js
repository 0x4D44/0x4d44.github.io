/* Skills — the chart room: significant figures and prefixes drill,
   an uncertainty calculator for repeated readings, and a best-fit-line trainer. */
(function () {
  "use strict";
  const HP = window.HP;
  const $ = (id) => document.getElementById(id);
  function mount(id, fn) { const box = $(id); if (!box) return; try { fn(box); } catch (err) { console.error(id, err); } }

  /* ---------- 1. Prefixes, standard form and significant figures drill ---------- */
  mount("w-sf", (box) => {
    const PRE = [["p", -12, "pico"], ["n", -9, "nano"], ["μ", -6, "micro"], ["m", -3, "milli"], ["k", 3, "kilo"], ["M", 6, "mega"], ["G", 9, "giga"], ["T", 12, "tera"]];
    const UNITS = [["m", "metres"], ["F", "farads"], ["W", "watts"], ["Hz", "hertz"], ["J", "joules"], ["A", "amperes"], ["s", "seconds"]];
    const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
    let cur = null;
    const q = HP.el("p", { class: "readout", style: "font-family:var(--font-body);font-size:1.05rem", "aria-live": "polite" });
    const ans = HP.el("p", { class: "sim-note", hidden: true, "aria-live": "polite" });
    const sup = (n) => HP.sup(n);
    function make() {
      const kind = rint(0, 2);
      if (kind === 0) {
        const [p, e, name] = PRE[rint(0, PRE.length - 1)], [u] = UNITS[rint(0, UNITS.length - 1)];
        const m = rint(12, 980) / (rint(0, 1) ? 10 : 1);
        return { q: `Write ${m} ${p}${u} in standard form, in ${u} with no prefix.`, a: `${m} ${p}${u} = ${m} × 10${sup(e)} ${u} = <b>${HP.fmt(m * Math.pow(10, e), String(m).replace(".", "").replace(/^0+/, "").length, true)} ${u}</b> (${name} means × 10${sup(e)}).` };
      }
      if (kind === 1) {
        const sf = rint(2, 3), x = (rint(10000, 99999) / Math.pow(10, rint(0, 6)));
        return { q: `Round ${x} to ${sf} significant figures.`, a: `<b>${HP.fmt(x, sf)}</b>. Count from the first non-zero digit; zeros before it don't count.` };
      }
      const a = (rint(11, 99) / 10).toFixed(1), b = (rint(101, 999) / 100).toFixed(2), r = parseFloat(a) * parseFloat(b);
      return { q: `A calculation multiplies ${a} (measured) by ${b} (measured). The calculator shows ${r.toFixed(6)}. How should you write the final answer?`, a: `The least precise value, ${a}, has 2 significant figures, so give <b>${HP.fmt(r, 2)}</b>. Markers accept from one fewer to two more significant figures than that (so ${HP.fmt(r, 1)} to ${HP.fmt(r, 4)}), but 2 is the right habit.` };
    }
    function next() { cur = make(); q.textContent = cur.q; ans.hidden = true; ans.innerHTML = cur.a; }
    const show = HP.el("button", { type: "button", class: "btn small primary" }, "Show answer");
    show.addEventListener("click", () => { ans.hidden = false; });
    const nx = HP.el("button", { type: "button", class: "btn small" }, "Next question ↻");
    nx.addEventListener("click", next);
    box.append(q, HP.el("div", { class: "btn-row" }, show, nx), ans);
    next();
  });

  /* ---------- 2. Random uncertainty from repeated readings ---------- */
  mount("w-uncert", (box) => {
    const inp = HP.el("input", { type: "text", value: "2.34, 2.38, 2.31, 2.36, 2.41", "aria-label": "Repeated readings, separated by commas", style: "width:100%" });
    const scale = HP.el("input", { type: "text", value: "0.01", "aria-label": "Scale reading uncertainty", style: "width:8em" });
    const unit = HP.el("input", { type: "text", value: "s", "aria-label": "Unit", style: "width:5em" });
    const out = HP.el("div", { class: "output-box", "aria-live": "polite" });
    box.append(HP.el("label", null, "Repeated readings (comma-separated):"), inp,
      HP.el("div", { class: "btn-row" }, HP.el("label", null, "Scale-reading uncertainty ± ", scale), HP.el("label", null, "Unit ", unit)), out);
    function dp(s) { const m = String(s).trim().match(/\.(\d+)/); return m ? m[1].length : 0; }
    function calc() {
      const raw = inp.value.split(/[,;\s]+/).filter(Boolean);
      const v = raw.map(Number).filter((x) => isFinite(x));
      if (v.length < 2) { out.textContent = "Enter at least two readings."; return; }
      const n = v.length, mean = v.reduce((a, b) => a + b, 0) / n, mx = Math.max(...v), mn = Math.min(...v);
      const d = Math.max(...raw.map(dp));
      const ru = (mx - mn) / n, su = parseFloat(scale.value) || 0, u = Math.max(ru, su);
      const fx = (x) => x.toFixed(d);
      out.innerHTML = [
        `Number of readings n = ${n}`,
        `Mean = (${v.map(fx).join(" + ")}) ÷ ${n} = <b>${fx(mean)} ${unit.value}</b>  (quote it to the same precision as the readings)`,
        `Random uncertainty = (max − min) ÷ n = (${fx(mx)} − ${fx(mn)}) ÷ ${n} = <b>${(ru).toFixed(d + 1)} ${unit.value}</b>`,
        `Scale-reading uncertainty = ± ${su} ${unit.value}`,
        `Percentage random uncertainty = ${(ru).toFixed(d + 1)} ÷ ${fx(mean)} × 100 = <b>${(ru / mean * 100).toFixed(1)}%</b>`,
        `Result: (${fx(mean)} ± ${HP.fmt(u, 1)}) ${unit.value}, using the larger of the two uncertainties.`,
        ru < su ? "Here the scale-reading uncertainty is bigger than the random uncertainty: repeating more times would not help. A more precise instrument would." : "The random uncertainty is the bigger one: taking more repeated readings would reduce it.",
      ].join("<br>");
    }
    [inp, scale, unit].forEach((x) => x.addEventListener("input", calc));
    calc();
  });

  /* ---------- 3. Draw the line of best fit ---------- */
  mount("w-bestfit", (box) => {
    // A student's internal-resistance data: V = 1.52 − 0.83 I with scatter
    const DATA = [[0.10, 1.45], [0.20, 1.37], [0.30, 1.28], [0.40, 1.20], [0.50, 1.10], [0.60, 1.03], [0.70, 0.94]];
    const cv = HP.el("canvas", { class: "sim", role: "img", "aria-label": "Scatter graph of terminal potential difference against current, with a line you can adjust to fit the points." });
    box.append(cv);
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sC = HP.slider(ctr, { label: "Line's intercept on the V axis", min: 1.2, max: 1.8, step: 0.01, value: 1.4, unit: "V", fmt: (v) => v.toFixed(2), oninput: () => sim.redraw() });
    const sM = HP.slider(ctr, { label: "Line's gradient", min: -1.5, max: 0, step: 0.01, value: -0.4, fmt: (v) => v.toFixed(2).replace("-", "−"), oninput: () => sim.redraw() });
    const out = HP.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(out);
    const fit = HP.el("button", { type: "button", class: "btn small" }, "Show the least-squares line");
    let showFit = false;
    fit.addEventListener("click", () => { showFit = !showFit; fit.textContent = showFit ? "Hide the least-squares line" : "Show the least-squares line"; sim.redraw(); });
    box.append(HP.el("div", { class: "btn-row" }, fit));
    const n = DATA.length, sx = DATA.reduce((a, d) => a + d[0], 0), sy = DATA.reduce((a, d) => a + d[1], 0);
    const sxx = DATA.reduce((a, d) => a + d[0] * d[0], 0), sxy = DATA.reduce((a, d) => a + d[0] * d[1], 0);
    const mBest = (n * sxy - sx * sy) / (n * sxx - sx * sx), cBest = (sy - mBest * sx) / n;
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const gb = { x: 54, y: 18, w: S.w - 70, h: S.h - 52 };
        const ax = HP.plot(ctx, gb, { x0: 0, x1: 1.0, y0: 0.8, y1: 1.6, xt: 0.1, yt: 0.1, xl: "I / A", yl: "V / V", C, fs: 11, tf: (v) => v.toFixed(1) });
        const m = sM.value, c = sC.value;
        const line = (mm, cc, col, dash) => { ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.setLineDash(dash || []); ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(cc)); ctx.lineTo(ax.X(1), ax.Y(cc + mm)); ctx.stroke(); ctx.setLineDash([]); };
        ctx.save(); ctx.beginPath(); ctx.rect(gb.x, gb.y, gb.w, gb.h); ctx.clip();
        line(m, c, C.sea);
        if (showFit) line(mBest, cBest, C.gold, [6, 4]);
        ctx.restore();
        let ss = 0, above = 0, below = 0;
        DATA.forEach(([x, y]) => {
          const r = y - (m * x + c); ss += r * r; if (r > 0.005) above++; else if (r < -0.005) below++;
          ctx.strokeStyle = C.red; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(ax.X(x) - 4, ax.Y(y) - 4); ctx.lineTo(ax.X(x) + 4, ax.Y(y) + 4); ctx.moveTo(ax.X(x) + 4, ax.Y(y) - 4); ctx.lineTo(ax.X(x) - 4, ax.Y(y) + 4); ctx.stroke();
          ctx.strokeStyle = "rgba(179,38,30,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ax.X(x), ax.Y(y)); ctx.lineTo(ax.X(x), ax.Y(m * x + c)); ctx.stroke();
        });
        const good = ss < 0.0025;
        out.innerHTML = `Points above the line: ${above}, below: ${below}. ` + (good
          ? `<span class="ok">A good line of best fit.</span> Gradient ≈ ${m.toFixed(2).replace("-", "−")} V A⁻¹, so the internal resistance r = −gradient ≈ ${(-m).toFixed(2)} Ω, and the EMF (the V intercept) ≈ ${c.toFixed(2)} V.`
          : "Adjust the line: aim for a straight line with the points scattered evenly on both sides, close to as many as possible. Don't force it through the origin, and don't just join the first point to the last.");
        if (showFit) {
          // two lines when one would run back over the V axis label on a narrow canvas
          const g = `least squares: gradient ${mBest.toFixed(2).replace("-", "−")} Ω`, k = `intercept ${cBest.toFixed(2).replace("-", "−")} V`;
          ctx.font = 'bold 11px "Atkinson Hyperlegible", system-ui, sans-serif';
          const o = { size: 11, align: "right", col: C.gold, bold: true };
          if (ctx.measureText(g + ", " + k).width < gb.w - 60) HP.label(ctx, g + ", " + k, gb.x + gb.w, gb.y + 10, o);
          else { HP.label(ctx, g, gb.x + gb.w, gb.y + 10, o); HP.label(ctx, k, gb.x + gb.w, gb.y + 24, o); }
        }
      },
    });
  });
})();
