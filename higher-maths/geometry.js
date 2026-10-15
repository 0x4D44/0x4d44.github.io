/* Lines, circles & vectors — the widgets on the chart table. */
(function () {
  "use strict";
  const HM = window.HM;
  const $ = (id) => document.getElementById(id);
  const N = HM.n;
  const F = HM.fracTex;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HM.el("canvas", { class: "sim", role: "img", "aria-label": label || "" }); box.append(c); return c; };
  const texBox = (box) => { const d = HM.el("div", { class: "tex-out", "aria-live": "polite" }); box.append(d); return d; };
  const controls = (box) => { const d = HM.el("div", { class: "sim-controls" }); box.append(d); return d; };
  /* a square grid plot that fits the canvas: returns { P, bx } */
  function gridPlot(ctx, C, S, r, step = 1, labels = 2, cx = 0, cy = 0) {
    const side = Math.min(S.w - 40, S.h - 24);
    const bx = { x: (S.w - side) / 2 + 8, y: 8, w: side, h: side };
    const P = HM.plot(ctx, bx, { x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r, xt: step, yt: step, C, xl: "x", yl: "y", tf: (v) => (v % labels ? "" : String(v).replace("-", "−")) });
    return { P, bx };
  }
  /* gradient as exact TeX where it is a small fraction */
  const mTex = (dy, dx) => {
    if (dx === 0) return "\\text{undefined (vertical)}";
    const m = dy / dx;
    return F(m, 20);
  };
  /* line through (x1,y1) with gradient m, as TeX "ax + by + c = 0" with integers where possible */
  function lineTex(x1, y1, dy, dx) {
    if (dx === 0) return `x = ${F(x1)}`;
    if (dy === 0) return `y = ${F(y1)}`;
    // dy x - dx y + (dx y1 - dy x1) = 0, scaled to integers
    let a = dy, b = -dx, c = dx * y1 - dy * x1;
    // a midpoint can be a half-integer: double everything until c is whole
    for (let k = 0; k < 3 && Math.abs(c - Math.round(c)) > 1e-9; k++) { a *= 2; b *= 2; c *= 2; }
    c = Math.round(c);
    const g = gcd(gcd(Math.abs(a), Math.abs(b)), Math.abs(c)) || 1;
    a /= g; b /= g; c /= g;
    if (a < 0) { a = -a; b = -b; c = -c; }
    const t = (k, v, first) => (k === 0 ? "" : `${k < 0 ? "-" : first ? "" : "+"} ${Math.abs(k) === 1 && v ? "" : Math.abs(k)}${v}`);
    return `${t(a, "x", true)} ${t(b, "y")} ${t(c, "")} = 0`.replace(/\s+/g, " ");
  }
  function gcd(a, b) { a = Math.round(a); b = Math.round(b); while (b) [a, b] = [b, a % b]; return a; }

  /* =====================================================================
     1. Gradient, m = tan θ, equation, perpendiculars
     ===================================================================== */
  mount("w-line", (box) => {
    let A = [-2, 1], B = [4, 5], mode = "none";
    const ctl = controls(box);
    const S = {};
    // A and B may not coincide: step this slider on by one, so its value stays the state
    const sl = (lab, arr, i) => { const h = HM.slider(ctl, { label: lab, min: -8, max: 8, step: 1, value: arr[i], oninput: (v) => { const prev = arr[i]; arr[i] = v; if (A[0] === B[0] && A[1] === B[1]) { let n = v + (v < prev ? -1 : 1); if (n < -8 || n > 8) n = prev; h.set(n); return; } sim.redraw(); info(); } }); return h; };
    S.ax = sl("$A$: $x$", A, 0); S.ay = sl("$A$: $y$", A, 1); S.bx = sl("$B$: $x$", B, 0); S.by = sl("$B$: $y$", B, 1);
    HM.choice(box, "Also show:", [["none", "nothing"], ["perp", "perpendicular through $A$"], ["bis", "perpendicular bisector of $AB$"]], mode, (v) => { mode = v; sim.redraw(); info(); });
    const cv = canvasIn(box);
    box.append(HM.el("p", { class: "drag-hint" }, "Drag the points A and B on the grid."));
    const out = texBox(box);
    let Pm = null;
    const sim = HM.sim(cv, {
      height: (w) => Math.min(460, Math.max(320, w * 0.62)),
      draw(ctx, t, dt, C, Sx) {
        const { P, bx } = gridPlot(ctx, C, Sx, 9, 1, 2);
        Pm = P;
        const dy = B[1] - A[1], dx = B[0] - A[0];
        const ext = (x0, y0, ddx, ddy, col, w, dash) => {
          const L = 40 / Math.hypot(ddx, ddy);
          ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
          ctx.beginPath(); ctx.moveTo(P.X(x0 - ddx * L), P.Y(y0 - ddy * L)); ctx.lineTo(P.X(x0 + ddx * L), P.Y(y0 + ddy * L)); ctx.stroke(); ctx.restore();
        };
        HM.clip(ctx, bx, () => {
          ext(A[0], A[1], dx, dy, C.sea, 3);
          // run-and-rise triangle
          ctx.setLineDash([4, 3]); ctx.strokeStyle = C.gold; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(P.X(A[0]), P.Y(A[1])); ctx.lineTo(P.X(B[0]), P.Y(A[1])); ctx.lineTo(P.X(B[0]), P.Y(B[1])); ctx.stroke(); ctx.setLineDash([]);
          // keep "run" beside its own segment, on the side away from the line
          const rx0 = Math.min(P.X(A[0]), P.X(B[0])), rw = Math.abs(P.X(B[0]) - P.X(A[0]));
          if (dx) HM.label(ctx, `run ${N(dx)}`, P.X((A[0] + B[0]) / 2), P.Y(A[1]) + (dy >= 0 ? 14 : -14), { align: "center", size: 12, col: C.gold, bold: true, avoid: true, bounds: { x: rx0 - 30, y: dy >= 0 ? P.Y(A[1]) + 2 : P.Y(A[1]) - 34, w: rw + 60, h: 32 } });
          if (dy) HM.label(ctx, `rise ${N(dy)}`, P.X(B[0]) + 6, P.Y((A[1] + B[1]) / 2), { size: 12, col: C.gold, bold: true, avoid: true });
          if (mode === "perp") ext(A[0], A[1], -dy, dx, C.violet, 2.5, [8, 5]);
          if (mode === "bis") { const M = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]; ext(M[0], M[1], -dy, dx, C.violet, 2.5, [8, 5]); HM.dot(ctx, P.X(M[0]), P.Y(M[1]), C.violet, 5); }
          HM.dot(ctx, P.X(A[0]), P.Y(A[1]), C.ink, 7, C.card); HM.dot(ctx, P.X(B[0]), P.Y(B[1]), C.ink, 7, C.card);
          // θ, the angle with the positive x direction: an arc where the line crosses y = 0, or at A when that
          // crossing is off the grid or so close to A or B that their dots would hide the arc (parallel lines, same angle)
          if (dy !== 0) {
            const xc = A[0] - A[1] * dx / dy;
            const far = (q) => Math.hypot(P.X(xc) - P.X(q[0]), P.Y(0) - P.Y(q[1])) > 64;
            const onGrid = P.X(xc) > bx.x + 30 && P.X(xc) < bx.x + bx.w - 30;
            const [vx, vy] = onGrid && far(A) && far(B) ? [P.X(xc), P.Y(0)] : [P.X(A[0]), P.Y(A[1])];
            let th = Math.atan2(dy, dx); if (th < 0) th += Math.PI; // 0..π
            ctx.setLineDash([4, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(vx, vy); ctx.lineTo(vx + 60, vy); ctx.stroke(); ctx.setLineDash([]);
            ctx.strokeStyle = C.red; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(vx, vy, 26, 0, -th, true); ctx.stroke();
            // the label sits on the bisector of the marked angle, never elsewhere
            const c = Math.cos(th / 2), sn = Math.sin(th / 2);
            HM.label(ctx, "θ", vx + 36 * c, vy - 36 * sn, { col: C.red, bold: true, align: "center", avoid: true, tries: [36, 48, 60, 72].map((r) => [(r - 36) * c, -(r - 36) * sn]) });
          }
        });
        const up = B[1] >= A[1];
        HM.label(ctx, `A(${N(A[0])}, ${N(A[1])})`, P.X(A[0]) - 10, P.Y(A[1]) + (up ? -16 : 16), { bold: true, align: "right" });
        HM.label(ctx, `B(${N(B[0])}, ${N(B[1])})`, P.X(B[0]) + 10, P.Y(B[1]) + (up ? -16 : 16), { bold: true });
        cv.setAttribute("aria-label", `Line through A(${A}) and B(${B}).`);
      },
    });
    HM.drag(cv, sim, () => Pm ? [{ id: "A", x: Pm.X(A[0]), y: Pm.Y(A[1]) }, { id: "B", x: Pm.X(B[0]), y: Pm.Y(B[1]) }] : [], (id, x, y) => {
      // invert the plot maps by bisection-free algebra: X is linear
      const gx = Math.round(x0FromX(x)), gy = Math.round(y0FromY(y));
      const p = id === "A" ? A : B, o = id === "A" ? B : A;
      const nx = Math.max(-8, Math.min(8, gx)), ny = Math.max(-8, Math.min(8, gy));
      if (nx === o[0] && ny === o[1]) return;
      if (nx === p[0] && ny === p[1]) return;
      // move both coordinates at once: setting x then y could pass through B's square and trip the slider's step-on rule
      p[0] = nx; p[1] = ny;
      (id === "A" ? S.ax : S.bx).sync(nx); (id === "A" ? S.ay : S.by).sync(ny);
      sim.redraw(); info();
    });
    const x0FromX = (X) => { const a = Pm.X(0), b = Pm.X(1); return (X - a) / (b - a); };
    const y0FromY = (Y) => { const a = Pm.Y(0), b = Pm.Y(1); return (Y - a) / (b - a); };
    function info() {
      const dy = B[1] - A[1], dx = B[0] - A[0];
      const pn = (v) => (v < 0 ? `(${N(v)})` : N(v));
      let s = `$m_{AB} = \\dfrac{${N(B[1])} - ${pn(A[1])}}{${N(B[0])} - ${pn(A[0])}} = ${dx ? `\\dfrac{${dy}}{${dx}}${Number.isInteger(dy / dx) || Math.abs(gcd(dy, dx)) === 1 && dx > 0 ? "" : ` = ${mTex(dy, dx)}`}` : "\\text{undefined}"}$; `;
      if (dx === 0) s += "the line is vertical: $\\theta = 90°$.";
      else if (dy === 0) s += "the line is horizontal: $\\theta = 0°$.";
      else {
        const m = dy / dx, th = Math.atan(m) * 180 / Math.PI;
        s += m > 0 ? `$\\tan\\theta = ${mTex(dy, dx)} \\Rightarrow \\theta = ${N(th, 1)}°$.` : `$\\tan\\theta = ${mTex(dy, dx)}$: the calculator gives $${N(th, 1)}°$, so $\\theta = 180° ${N(th, 1)}° = ${N(180 + th, 1)}°$.`;
      }
      s += `<br>Line $AB$: $${lineTex(A[0], A[1], dy, dx)}$.`;
      if (mode !== "none") {
        const M = mode === "bis" ? [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] : A;
        const pg = dy === 0 ? "\\text{undefined (vertical)}" : dx === 0 ? "0" : mTex(-dx, dy);
        s += `<br>${mode === "bis" ? `Midpoint $(${F(M[0])}, ${F(M[1])})$; perpendicular` : "Perpendicular"} gradient $= ${pg}$${dx && dy ? ` (check: $${mTex(dy, dx)} \\times ${mTex(-dx, dy)} = -1$)` : ""}. Equation: $${lineTex(M[0], M[1], dx, -dy)}$.`;
      }
      out.innerHTML = `<p style="margin:0">${s}</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     2. Triangle: medians, altitudes, perpendicular bisectors
     ===================================================================== */
  mount("w-triangle", (box) => {
    let V = [[3, -4], [1, -8], [9, -2]];
    // the view is a 20-square window centred near the triangle (on even numbers, so the tick labels stay put);
    // it moves only when a preset is chosen, never under a dragging finger
    let cx = 0, cy = 0;
    const centre = () => { const xs = V.map((p) => p[0]), ys = V.map((p) => p[1]); cx = 2 * Math.round((Math.min(...xs) + Math.max(...xs)) / 4); cy = 2 * Math.round((Math.min(...ys) + Math.max(...ys)) / 4); };
    centre();
    const clampV = (g) => [Math.max(cx - 9, Math.min(cx + 9, g[0])), Math.max(cy - 9, Math.min(cy + 9, g[1]))];
    let fam = "med";
    HM.choice(box, "Show:", [["med", "medians"], ["alt", "altitudes"], ["bis", "perpendicular bisectors"]], fam, (v) => { fam = v; sim.redraw(); info(); });
    const presets = HM.el("div", { class: "btn-row" });
    const pre = (lab, pts) => { const b = HM.el("button", { class: "btn small", type: "button" }, lab); b.addEventListener("click", () => { V = pts.map((p) => [...p]); centre(); sim.redraw(); info(); }); presets.append(b); };
    pre("Worked example", [[3, -4], [1, -8], [9, -2]]);
    pre("Right-angled", [[-4, -4], [4, -4], [-4, 4]]);
    pre("Obtuse", [[-6, -4], [6, -4], [-3, -1]]);
    pre("Nearly equilateral", [[-5, -4], [5, -4], [0, 5]]);
    box.append(presets);
    const cv = canvasIn(box);
    box.append(HM.el("p", { class: "drag-hint" }, "Drag the vertices A, B and C, or use the buttons to step one vertex a square at a time."));
    // keyboard (and fine-touch) control: pick a vertex, then step it one grid square
    let pick = 0;
    HM.choice(box, "Move vertex:", [[0, "A"], [1, "B"], [2, "C"]], 0, (v) => { pick = +v; });
    const nudges = HM.el("div", { class: "btn-row" });
    [["←", -1, 0, "left"], ["→", 1, 0, "right"], ["↑", 0, 1, "up"], ["↓", 0, -1, "down"]].forEach(([t, dx, dy, w]) => {
      const b = HM.el("button", { class: "btn small", type: "button", "aria-label": `Move the vertex ${w} one square` }, t);
      b.addEventListener("click", () => {
        const g = clampV([V[pick][0] + dx, V[pick][1] + dy]);
        if (V.some((p, j) => j !== pick && p[0] === g[0] && p[1] === g[1])) return;
        V[pick] = g; sim.redraw(); info();
      });
      nudges.append(b);
    });
    box.append(nudges);
    const out = texBox(box);
    let Pm = null;
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    // a line as point + direction
    function lines() {
      const [A, B, C] = V, L = [];
      const opp = [[B, C], [C, A], [A, B]];
      for (let i = 0; i < 3; i++) {
        const P = V[i], [Q, R] = opp[i], d = [R[0] - Q[0], R[1] - Q[1]];
        if (fam === "med") { const M = mid(Q, R); L.push({ p: P, d: [M[0] - P[0], M[1] - P[1]], foot: M }); }
        if (fam === "alt") { const tt = ((P[0] - Q[0]) * d[0] + (P[1] - Q[1]) * d[1]) / (d[0] * d[0] + d[1] * d[1]); L.push({ p: P, d: [-d[1], d[0]], foot: [Q[0] + tt * d[0], Q[1] + tt * d[1]], right: true }); }
        if (fam === "bis") { const M = mid(Q, R); L.push({ p: M, d: [-d[1], d[0]], foot: M, right: true }); }
      }
      return L;
    }
    function meet(l1, l2) {
      const det = l1.d[0] * -l2.d[1] - l1.d[1] * -l2.d[0];
      if (Math.abs(det) < 1e-9) return null;
      const rx = l2.p[0] - l1.p[0], ry = l2.p[1] - l1.p[1];
      const s = (rx * -l2.d[1] - ry * -l2.d[0]) / det;
      return [l1.p[0] + s * l1.d[0], l1.p[1] + s * l1.d[1]];
    }
    const sim = HM.sim(cv, {
      height: (w) => Math.min(480, Math.max(320, w * 0.64)),
      draw(ctx, t, dt, C, S) {
        const { P, bx } = gridPlot(ctx, C, S, 10, 1, 2, cx, cy);
        Pm = P;
        const col = { med: C.sea, alt: C.red, bis: C.gold }[fam];
        const L = lines(), X = meet(L[0], L[1]);
        HM.clip(ctx, bx, () => {
          if (fam === "bis" && X) { const r = Math.hypot(V[0][0] - X[0], V[0][1] - X[1]); ctx.strokeStyle = C.muted; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(P.X(X[0]), P.Y(X[1]), r * (P.X(1) - P.X(0)), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]); }
          ctx.fillStyle = C.sea; ctx.globalAlpha = 0.08; ctx.beginPath(); V.forEach((p, i) => (i ? ctx.lineTo(P.X(p[0]), P.Y(p[1])) : ctx.moveTo(P.X(p[0]), P.Y(p[1])))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.stroke();
          // extend altitudes' opposite sides where the foot falls outside (obtuse triangles)
          L.forEach((l) => {
            const k = 30 / Math.hypot(...l.d);
            ctx.strokeStyle = col; ctx.lineWidth = 2.2; ctx.globalAlpha = 0.9;
            ctx.beginPath(); ctx.moveTo(P.X(l.p[0] - l.d[0] * k), P.Y(l.p[1] - l.d[1] * k)); ctx.lineTo(P.X(l.p[0] + l.d[0] * k), P.Y(l.p[1] + l.d[1] * k)); ctx.stroke(); ctx.globalAlpha = 1;
            HM.dot(ctx, P.X(l.foot[0]), P.Y(l.foot[1]), col, 4);
          });
          if (X) HM.dot(ctx, P.X(X[0]), P.Y(X[1]), C.violet, 7, C.card);
          V.forEach((p, i) => HM.dot(ctx, P.X(p[0]), P.Y(p[1]), C.ink, 7, C.card));
        });
        V.forEach((p, i) => HM.label(ctx, "ABC"[i], P.X(p[0]) + 9, P.Y(p[1]) - 11, { bold: true, size: 15, avoid: true }));
        cv.setAttribute("aria-label", `Triangle A(${V[0]}), B(${V[1]}), C(${V[2]}) with its three ${{ med: "medians", alt: "altitudes", bis: "perpendicular bisectors" }[fam]} meeting at one point.`);
      },
    });
    HM.drag(cv, sim, () => (Pm ? V.map((p, i) => ({ id: i, x: Pm.X(p[0]), y: Pm.Y(p[1]) })) : []), (id, x, y) => {
      const ux = Pm.X(1) - Pm.X(0), uy = Pm.Y(1) - Pm.Y(0);
      const [gx, gy] = clampV([Math.round((x - Pm.X(0)) / ux), Math.round((y - Pm.Y(0)) / uy)]);
      if (V.some((p, j) => j !== id && p[0] === gx && p[1] === gy)) return;
      V[id] = [gx, gy]; sim.redraw(); info();
    });
    function info() {
      const L = lines(), X = meet(L[0], L[1]);
      const name = { med: "centroid", alt: "orthocentre", bis: "circumcentre" }[fam];
      const l = L[0], foot = l.foot;
      let s = "";
      if (fam === "med") s = `Median from $A$: through $A(${F(V[0][0])}, ${F(V[0][1])})$ and the midpoint of $BC$, $(${F(foot[0], 60)}, ${F(foot[1], 60)})$.`;
      if (fam === "alt") s = `Altitude from $A$: through $A$, perpendicular to $BC$ (gradient ${V[2][0] - V[1][0] === 0 ? "$0$" : V[2][1] === V[1][1] ? "undefined" : `$${F(-(V[2][0] - V[1][0]) / (V[2][1] - V[1][1]), 30)}$`}).`;
      if (fam === "bis") s = `Perpendicular bisector of $BC$: through its midpoint $(${F(foot[0], 60)}, ${F(foot[1], 60)})$, perpendicular to $BC$.`;
      s += X ? ` All three meet at the <b>${name}</b> $(${F(X[0], 30)}, ${F(X[1], 30)})$.` : "";
      if (fam === "alt" && X && L.some((q) => false)) s += "";
      if (fam === "med") s += " The centroid is always two thirds of the way down each median.";
      if (fam === "bis") s += " It is the same distance from all three vertices: the dashed circle passes through them.";
      if (fam === "alt") s += " For an obtuse triangle the orthocentre lies outside it; for a right-angled triangle it is the right-angled corner.";
      out.innerHTML = `<p style="margin:0">${s}</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     3. Circle (general form) and a line
     ===================================================================== */
  mount("w-circle", (box) => {
    let g = -3, f = 2, c = -12, m = 0.5, k = 4;
    const ctl = controls(box);
    const rd = () => { sim.redraw(); info(); };
    HM.slider(ctl, { label: "$g$", min: -6, max: 6, step: 1, value: g, oninput: (v) => { g = v; rd(); } });
    HM.slider(ctl, { label: "$f$", min: -6, max: 6, step: 1, value: f, oninput: (v) => { f = v; rd(); } });
    HM.slider(ctl, { label: "$c$", min: -30, max: 30, step: 1, value: c, oninput: (v) => { c = v; rd(); } });
    HM.slider(ctl, { label: "line gradient $m$", min: -3, max: 3, step: 0.25, value: m, fmt: (v) => N(v), oninput: (v) => { m = v; rd(); } });
    HM.slider(ctl, { label: "line intercept $k$", min: -12, max: 12, step: 0.5, value: k, fmt: (v) => N(v), oninput: (v) => { k = v; rd(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    // substituting y = mx + k: (1+m²)x² + (2g + 2m(k+f))x + (k² + 2fk + c) = 0
    const quad = () => [1 + m * m, 2 * g + 2 * m * (k + f), k * k + 2 * f * k + c];
    const sim = HM.sim(cv, {
      height: (w) => Math.min(460, Math.max(320, w * 0.62)),
      draw(ctx, t, dt, C, S) {
        const { P, bx } = gridPlot(ctx, C, S, 12, 1, 4);
        const r2 = g * g + f * f - c;
        HM.clip(ctx, bx, () => {
          if (r2 > 0) {
            const u = P.X(1) - P.X(0);
            ctx.fillStyle = C.sea; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.arc(P.X(-g), P.Y(-f), Math.sqrt(r2) * u, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = C.sea; ctx.lineWidth = 3; ctx.stroke();
            HM.dot(ctx, P.X(-g), P.Y(-f), C.sea, 5);
          }
          HM.curve(ctx, P, (x) => m * x + k, -12, 12, C.red, 2.5);
          const [a, b, cc] = quad(), D = b * b - 4 * a * cc;
          if (r2 > 0 && D >= -1e-9) [(-b - Math.sqrt(Math.max(0, D))) / (2 * a), (-b + Math.sqrt(Math.max(0, D))) / (2 * a)].forEach((x) => HM.dot(ctx, P.X(x), P.Y(m * x + k), Math.abs(D) < 1e-6 ? C.gold : C.ink, 6, C.card));
        });
        if (r2 > 0) HM.label(ctx, `(${N(-g)}, ${N(-f)})`, P.X(-g) + 8, P.Y(-f) + 12, { size: 12, col: C.sea, bold: true });
        cv.setAttribute("aria-label", r2 > 0 ? `Circle centre (${-g}, ${-f}) radius ${N(Math.sqrt(r2), 2)} and the line y = ${N(m)}x ${k < 0 ? "−" : "+"} ${N(Math.abs(k))}.` : "Not a circle: g² + f² − c is not positive.");
      },
    });
    function info() {
      const r2 = g * g + f * f - c;
      const sg = (v, s) => (v === 0 ? "" : ` ${v < 0 ? "-" : "+"} ${Math.abs(v)}${s}`);
      let s = HM.tex(`x^2 + y^2${sg(2 * g, "x")}${sg(2 * f, "y")}${sg(c, "")} = 0`, true);
      if (r2 <= 0) s += `<p style="margin:0">$g^2 + f^2 - c = ${g * g} + ${f * f} - (${c}) = ${r2}$, which is ${r2 === 0 ? "zero (a single point)" : "negative"}: <b>not a circle</b>.</p>`;
      else {
        const rt = Math.sqrt(r2);
        s += `<p style="margin:0">Centre $(-g, -f) = (${-g}, ${-f})$, radius $\\sqrt{${g * g} + ${f * f} - (${c})} = \\sqrt{${r2}}${Number.isInteger(rt) ? ` = ${rt}` : ` \\approx ${N(rt, 2)}`}$.</p>`;
        const [a, b, cc] = quad(), D = b * b - 4 * a * cc;
        const z = Math.abs(D) < 1e-6;
        const term = (v, x) => (Math.abs(v) < 1e-9 ? "" : ` ${v < 0 ? "-" : "+"} ${Math.abs(v) === 1 && x ? "" : N(Math.abs(v), 4)}${x}`);
        const ln = m === 0 ? N(k) : `${m === 1 ? "" : m === -1 ? "-" : N(m)}x${term(k, "")}`;
        s += `<p style="margin:4px 0 0">Substituting $y = ${ln}$ gives $${N(a, 4)}x^2${term(b, "x")}${term(cc, "")} = 0$, discriminant $${N(z ? 0 : D, 3)}$: <b>${z ? "the line is a tangent" : D > 0 ? "two points of intersection" : "the line misses the circle"}</b>.</p>`;
      }
      out.innerHTML = s; HM.math(out);
    }
    info();
  });

  /* =====================================================================
     4. Two circles: compare d with r1 + r2 and |r1 − r2|
     ===================================================================== */
  mount("w-circles", (box) => {
    let c2 = [6, 8], r1 = 4, r2 = 6;
    const ctl = controls(box);
    const S = {};
    const rd = () => { sim.redraw(); info(); };
    HM.slider(ctl, { label: "$r_1$", min: 1, max: 10, step: 1, value: r1, oninput: (v) => { r1 = v; rd(); } });
    HM.slider(ctl, { label: "$r_2$", min: 1, max: 10, step: 1, value: r2, oninput: (v) => { r2 = v; rd(); } });
    S.x = HM.slider(ctl, { label: "second centre $x$", min: -12, max: 12, step: 1, value: c2[0], oninput: (v) => { c2[0] = v; rd(); } });
    S.y = HM.slider(ctl, { label: "second centre $y$", min: -12, max: 12, step: 1, value: c2[1], oninput: (v) => { c2[1] = v; rd(); } });
    const cv = canvasIn(box);
    box.append(HM.el("p", { class: "drag-hint" }, "Drag the second centre."));
    const out = texBox(box);
    let Pm = null;
    const sim = HM.sim(cv, {
      height: (w) => Math.min(460, Math.max(320, w * 0.62)),
      draw(ctx, t, dt, C, Sx) {
        const { P, bx } = gridPlot(ctx, C, Sx, 16, 2, 4);
        Pm = P;
        const u = P.X(1) - P.X(0);
        HM.clip(ctx, bx, () => {
          [[[0, 0], r1, C.sea], [c2, r2, C.red]].forEach(([c, r, col]) => {
            ctx.fillStyle = col; ctx.globalAlpha = 0.1; ctx.beginPath(); ctx.arc(P.X(c[0]), P.Y(c[1]), r * u, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
            ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); HM.dot(ctx, P.X(c[0]), P.Y(c[1]), col, 5);
          });
          ctx.setLineDash([5, 4]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(0)); ctx.lineTo(P.X(c2[0]), P.Y(c2[1])); ctx.stroke(); ctx.setLineDash([]);
        });
        const d = Math.hypot(...c2);
        HM.label(ctx, `d = ${N(d, 2)}`, P.X(c2[0] / 2) + 8, P.Y(c2[1] / 2) - (d === 0 ? 22 : 0), { bold: true, avoid: true });
        cv.setAttribute("aria-label", `Two circles: centres (0, 0) and (${c2}), radii ${r1} and ${r2}, distance between centres ${N(d, 2)}.`);
      },
    });
    HM.drag(cv, sim, () => (Pm ? [{ id: 0, x: Pm.X(c2[0]), y: Pm.Y(c2[1]) }] : []), (id, x, y) => {
      const ux = Pm.X(1) - Pm.X(0), uy = Pm.Y(1) - Pm.Y(0);
      S.x.set(Math.max(-12, Math.min(12, Math.round((x - Pm.X(0)) / ux)))); S.y.set(Math.max(-12, Math.min(12, Math.round((y - Pm.Y(0)) / uy))));
    });
    function info() {
      const d2 = c2[0] ** 2 + c2[1] ** 2, d = Math.sqrt(d2), sum = r1 + r2, dif = Math.abs(r1 - r2);
      const eq = (a, b) => Math.abs(a - b) < 1e-9;
      const verdict = eq(d, sum) ? "touch externally $(d = r_1 + r_2)$" : eq(d, dif) && d > 0 ? "touch internally $(d = |r_1 - r_2|)$" : d === 0 && r1 === r2 ? "are the same circle" : d > sum ? "are separate $(d \\gt r_1 + r_2)$" : d < dif ? "one lies inside the other without touching $(d \\lt |r_1 - r_2|)$" : "intersect at two points $(|r_1 - r_2| \\lt d \\lt r_1 + r_2)$";
      out.innerHTML = `<p style="margin:0">$d = \\sqrt{${c2[0]}^2 + ${c2[1] < 0 ? `(${c2[1]})` : c2[1]}^2} = ${Number.isInteger(d) ? d : `\\sqrt{${d2}} \\approx ${N(d, 2)}`}$; $r_1 + r_2 = ${sum}$; $|r_1 - r_2| = ${dif}$. The circles <b>${verdict}</b>.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     3D helpers: orthographic view with yaw and pitch
     ===================================================================== */
  // the shear below sends an axis onto the screen vertical (on top of z) when yaw = 15.6° + 90°k;
  // keep the view at least 10° away from those angles so no axis or cuboid face goes edge-on
  const BAD = Math.atan(0.28), GAP = 10 * Math.PI / 180, Q = Math.PI / 2;
  function safeYaw(yaw) {
    const r = ((yaw - BAD) % Q + Q) % Q; // 0..90°, measured from the nearest bad angle below
    if (r < GAP) return yaw - r + GAP;
    if (r > Q - GAP) return yaw + (Q - r) - GAP;
    return yaw;
  }
  // a turn slider's input: a value inside an excluded gap jumps to the far edge in the direction of travel,
  // so every key press changes the picture and the readout always matches the angle drawn
  function turnInput(st, redraw) {
    const bad = BAD * 180 / Math.PI, gap = 10;
    return (v) => {
      const from = st.lastDeg ?? v, r = (((v - bad) % 90) + 90) % 90;
      if (r < gap || r > 90 - gap) {
        const base = r < gap ? v - r : v + (90 - r); // the excluded angle itself
        v = ((v >= from ? Math.ceil(base + gap) : Math.floor(base - gap)) % 360 + 360) % 360;
        st.slider.sync(v);
      }
      st.lastDeg = v; st.yaw = v * Math.PI / 180; redraw();
    };
  }
  function view3(S, yaw, pitch, scale, cx, cy) {
    yaw = safeYaw(yaw);
    const cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    return (p) => {
      const x1 = p[0] * cyw - p[1] * syw, y1 = p[0] * syw + p[1] * cyw;
      // a slight oblique shear on depth: an edge pointing straight away from the viewer would
      // otherwise project onto the vertical and look parallel (or opposite) to the z-axis
      return { x: cx + scale * (x1 + 0.28 * y1), y: cy - scale * (p[2] * cp + y1 * sp), z: y1 * cp - p[2] * sp };
    };
  }
  function rotDrag(cv, st, redraw) {
    let last = null;
    cv.classList.add("draggable");
    cv.addEventListener("pointerdown", (e) => { last = [e.clientX, e.clientY]; cv.setPointerCapture(e.pointerId); cv.classList.add("dragging"); });
    cv.addEventListener("pointermove", (e) => {
      if (!last) return;
      st.yaw += (e.clientX - last[0]) * 0.01; st.pitch = Math.max(0.25, Math.min(1.3, st.pitch + (e.clientY - last[1]) * 0.01));
      last = [e.clientX, e.clientY]; if (st.slider) {
        // the drawn angle, rounded to a whole degree that is itself outside the excluded gap
        const deg = ((safeYaw(st.yaw) * 180 / Math.PI) % 360 + 360) % 360;
        const ok = (d) => safeYaw(d * Math.PI / 180) === d * Math.PI / 180;
        const d = [Math.round(deg), Math.floor(deg), Math.ceil(deg)].find(ok) % 360;
        st.slider.sync(d); st.lastDeg = d;
      }
      redraw();
    });
    const end = () => { last = null; cv.classList.remove("dragging"); };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  /* =====================================================================
     5. Block-built cuboid: vector pathways
     ===================================================================== */
  mount("w-cuboid", (box) => {
    const V = { O: [0, 0, 0], A: [6, 0, 0], B: [6, 4, 0], C: [0, 4, 0], D: [0, 0, 3], E: [6, 0, 3], F: [6, 4, 3], G: [0, 4, 3], M: [3, 4, 3] };
    const ROUTES = {
      "O-F": { from: "O", to: "F", path: ["O", "A", "B", "F"] },
      "A-G": { from: "A", to: "G", path: ["A", "B", "C", "G"] },
      "A-M": { from: "A", to: "M", path: ["A", "B", "F", "M"] },
      "E-C": { from: "E", to: "C", path: ["E", "A", "B", "C"] },
    };
    let route = "A-M", start = 0;
    const st = { yaw: 326 * Math.PI / 180, pitch: 0.55 };
    HM.choice(box, "Path:", Object.keys(ROUTES).map((k) => [k, `$\\overrightarrow{${k.replace("-", "")}}$`]), route, (v) => { route = v; start = sim.t; if (!sim.playing && !HM.reduced) sim.play(); else sim.redraw(); info(); });
    const ctl = controls(box);
    st.slider = HM.slider(ctl, { label: "turn the cuboid", min: 0, max: 359, step: 1, value: 326, unit: "°", oninput: turnInput(st, () => sim.redraw()) });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 320 : 360),
      draw(ctx, t, dt, C, S) {
        // fit the cuboid and its axes inside the canvas at any angle: project at unit scale, then scale and centre the bounding box
        const c0 = [-3, -2, -1.5];
        const unit = view3(S, st.yaw, st.pitch, 1, 0, 0);
        // an axis whose tip would land over the block (seen from behind it) is lengthened until its tip and label are clear
        const sh = (p) => unit([p[0] + c0[0], p[1] + c0[1], p[2] + c0[2]]);
        const box2 = ["O", "A", "B", "C", "D", "E", "F", "G"].map((k) => sh(V[k]));
        const inside = (q) => { // inside the block's outline, with a margin for the label
          const pts = box2.slice().sort((a, b) => a.x - b.x || a.y - b.y), cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
          const lo = [], hi = [];
          for (const p of pts) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
          for (const p of pts.reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
          const hull = lo.slice(0, -1).concat(hi.slice(0, -1));
          return hull.every((a, i) => { const b = hull[(i + 1) % hull.length], L = Math.hypot(b.x - a.x, b.y - a.y); return cr(a, b, q) / L > -0.9; });
        };
        const AXL = [7.5, 5.5, 4.5].map((L, i) => { const e = (l) => [0, 1, 2].map((j) => (j === i ? l : 0)); while (L < 12 && inside(sh(e(L)))) L += 0.5; return e(L); });
        const ext = Object.values(V).concat(AXL).map((p) => unit([p[0] + c0[0], p[1] + c0[1], p[2] + c0[2]]));
        const x0 = Math.min(...ext.map((q) => q.x)), x1 = Math.max(...ext.map((q) => q.x)), y0 = Math.min(...ext.map((q) => q.y)), y1 = Math.max(...ext.map((q) => q.y));
        const k = Math.min(Math.min(S.w, S.h * 1.4) / 13, (S.w - 56) / (x1 - x0), (S.h - 56) / (y1 - y0));
        const pr = view3(S, st.yaw, st.pitch, k, S.w / 2 - k * (x0 + x1) / 2, S.h / 2 - k * (y0 + y1) / 2 + 6);
        const P = (p) => pr([p[0] + c0[0], p[1] + c0[1], p[2] + c0[2]]);
        ctx.fillStyle = C.paper; ctx.fillRect(0, 0, S.w, S.h);
        // faces of the cuboid, painter's order
        const faces = [
          { pts: ["O", "A", "B", "C"], col: "#6b4b2e" }, { pts: ["D", "E", "F", "G"], col: "#7fb069", top: true },
          { pts: ["O", "A", "E", "D"], col: "#a8794f" }, { pts: ["C", "B", "F", "G"], col: "#a8794f" },
          { pts: ["O", "C", "G", "D"], col: "#946a43" }, { pts: ["A", "B", "F", "E"], col: "#946a43" },
        ];
        const depth = (f) => f.pts.reduce((s, k) => s + P(V[k]).z, 0) / 4;
        faces.sort((a, b) => depth(b) - depth(a));
        // the axes go in first, so the cuboid's faces sit in front of the parts behind it
        const AX = [[AXL[0], "x"], [AXL[1], "y"], [AXL[2], "z"]];
        AX.forEach(([e]) => { const a = P([0, 0, 0]), b = P(e); HM.arrow(ctx, a.x, a.y, b.x, b.y, C.ink2, 1.5, 7); });
        // the corner furthest from the viewer is hidden behind the three faces in front of it
        const CORN = ["O", "A", "B", "C", "D", "E", "F", "G"];
        const hid = CORN.reduce((h, k) => (P(V[k]).z > P(V[h]).z ? k : h), "O");
        faces.forEach((f) => {
          const q = f.pts.map((k) => P(V[k]));
          ctx.globalAlpha = 0.72; ctx.fillStyle = f.col; ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.fill(); ctx.globalAlpha = 1;
          // block grid on the face
          const a = V[f.pts[0]], b = V[f.pts[1]], d = V[f.pts[3]];
          const nu = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])), nv = Math.round(Math.hypot(d[0] - a[0], d[1] - a[1], d[2] - a[2]));
          ctx.strokeStyle = "rgba(0,0,0,.28)"; ctx.lineWidth = 1;
          for (let i = 1; i < nu; i++) { const s = i / nu; const p1 = P(a.map((v, j) => v + (b[j] - a[j]) * s)), p2 = P(d.map((v, j) => v + (b[j] - a[j]) * s)); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
          for (let i = 1; i < nv; i++) { const s = i / nv; const p1 = P(a.map((v, j) => v + (d[j] - a[j]) * s)), p2 = P(b.map((v, j) => v + (d[j] - a[j]) * s)); ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); }
          ctx.strokeStyle = "rgba(0,0,0,.6)"; ctx.lineWidth = 1.5; ctx.beginPath(); q.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath(); ctx.stroke();
        });
        // hidden edges (the three meeting the hidden corner) dashed, as in a textbook drawing
        const NB = { O: "ACD", A: "OBE", B: "ACF", C: "OBG", D: "OEG", E: "ADF", F: "BEG", G: "CDF" };
        ctx.save(); ctx.setLineDash([5, 4]); ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1.5;
        for (const n of NB[hid]) { const a = P(V[hid]), b = P(V[n]); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
        ctx.restore();
        AX.forEach(([e, l]) => { const b = P(e); HM.label(ctx, l, b.x + 6, b.y - 6, { size: 13, col: C.ink2, bold: true, avoid: true }); });
        // the route, one edge at a time
        const R = ROUTES[route];
        const legs = R.path.length - 1;
        const prog = HM.reduced ? legs : Math.min(legs, (t - start) * 1.1);
        for (let i = 0; i < legs; i++) {
          if (prog <= i) break;
          const a = V[R.path[i]], b = V[R.path[i + 1]], s = Math.min(1, prog - i);
          const pa = P(a), pb = P(a.map((v, j) => v + (b[j] - v) * s));
          HM.arrow(ctx, pa.x, pa.y, pb.x, pb.y, C.red, 4, 12);
        }
        if (prog >= legs) { const pa = P(V[R.from]), pb = P(V[R.to]); ctx.setLineDash([7, 5]); HM.arrow(ctx, pa.x, pa.y, pb.x, pb.y, C.lode || C.sea, 3, 12); ctx.setLineDash([]); }
        Object.entries(V).forEach(([k, p]) => { const q = P(p); if (k === hid) ctx.globalAlpha = 0.5; HM.dot(ctx, q.x, q.y, C.ink, 3.5); ctx.globalAlpha = 1; });
        Object.entries(V).forEach(([k, p]) => { const q = P(p); HM.label(ctx, k, q.x + 7, q.y - 9, { bold: true, size: 14, avoid: true, col: k === hid ? C.ink2 : undefined }); });
        if (prog >= legs && S.playing) S.pause();
        cv.setAttribute("aria-label", `A 6 by 4 by 3 cuboid of blocks with vertices O, A, B, C on the bottom and D, E, F, G on top; ${hid} is the hidden corner, at the back. The path ${R.path.join(" to ")} is drawn.`);
      },
    });
    rotDrag(cv, st, () => sim.redraw());
    function info() {
      const R = ROUTES[route];
      const legs = [];
      let sum = [0, 0, 0];
      for (let i = 0; i < R.path.length - 1; i++) {
        const a = V[R.path[i]], b = V[R.path[i + 1]];
        const v = b.map((x, j) => x - a[j]);
        sum = sum.map((x, j) => x + v[j]);
        legs.push({ name: `\\overrightarrow{${R.path[i]}${R.path[i + 1]}}`, v });
      }
      const col = (v) => `\\begin{pmatrix}${v.join("\\\\")}\\end{pmatrix}`;
      out.innerHTML = HM.tex(`\\overrightarrow{${R.from}${R.to}} = ${legs.map((l) => l.name).join(" + ")}`, true) + HM.tex(`= ${legs.map((l) => col(l.v)).join(" + ")} = ${col(sum)}`, true) +
        `<p style="margin:0">Check with coordinates: $${R.to}(${V[R.to].join(", ")})$ minus $${R.from}(${V[R.from].join(", ")})$ gives $(${sum.join(", ")})$. Length $= \\sqrt{${sum.map((x) => (x < 0 ? `(${x})` : x) + "^2").join(" + ")}} = \\sqrt{${sum.reduce((s, x) => s + x * x, 0)}}$.</p>`;
      HM.math(out);
    }
    info();
    if (!HM.reduced) sim.play();
  });

  /* =====================================================================
     6. Internal division in a ratio m : n
     ===================================================================== */
  mount("w-section", (box) => {
    const A = [2, -1, 4], B = [7, 9, -1];
    let m = 3, n = 2;
    const ctl = controls(box);
    HM.slider(ctl, { label: "$m$", min: 1, max: 6, step: 1, value: m, oninput: (v) => { m = v; sim.redraw(); info(); } });
    HM.slider(ctl, { label: "$n$", min: 1, max: 6, step: 1, value: n, oninput: (v) => { n = v; sim.redraw(); info(); } });
    const cv = canvasIn(box);
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: () => 130,
      draw(ctx, t, dt, C, S) {
        const x0 = 40, x1 = S.w - 40, y = 66;
        ctx.strokeStyle = C.ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        const parts = m + n;
        for (let i = 0; i <= parts; i++) { const x = x0 + (x1 - x0) * i / parts; ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y - 8); ctx.lineTo(x, y + 8); ctx.stroke(); }
        const px = x0 + (x1 - x0) * m / parts;
        ctx.fillStyle = C.sea; ctx.globalAlpha = 0.25; ctx.fillRect(x0, y - 14, px - x0, 28); ctx.fillStyle = C.gold; ctx.fillRect(px, y - 14, x1 - px, 28); ctx.globalAlpha = 1;
        HM.label(ctx, `${m} part${m > 1 ? "s" : ""}`, (x0 + px) / 2, y - 26, { align: "center", bold: true, col: C.sea });
        HM.label(ctx, `${n} part${n > 1 ? "s" : ""}`, (px + x1) / 2, y - 26, { align: "center", bold: true, col: C.gold });
        HM.dot(ctx, x0, y, C.ink, 7, C.card); HM.dot(ctx, x1, y, C.ink, 7, C.card); HM.dot(ctx, px, y, C.red, 8, C.card);
        HM.label(ctx, "A", x0, y + 26, { align: "center", bold: true, size: 15 }); HM.label(ctx, "B", x1, y + 26, { align: "center", bold: true, size: 15 }); HM.label(ctx, "P", px, y + 26, { align: "center", bold: true, size: 15, col: C.red });
        cv.setAttribute("aria-label", `P divides AB in the ratio ${m} to ${n}: it is ${m} of ${parts} equal parts along from A.`);
      },
    });
    function info() {
      const AB = B.map((b, i) => b - A[i]);
      const p = A.map((a, i) => a + AB[i] * m / (m + n));
      const col = (v) => `\\begin{pmatrix}${v.map((x) => F(x, 30)).join("\\\\")}\\end{pmatrix}`;
      out.innerHTML = HM.tex(`\\mathbf{p} = \\mathbf{a} + \\tfrac{${m}}{${m + n}}\\overrightarrow{AB}`, true) + HM.tex(`= ${col(A)} + \\tfrac{${m}}{${m + n}}${col(AB)} = ${col(p)}`, true) +
        HM.tex(`\\text{or}\\quad \\mathbf{p} = \\frac{${n}\\mathbf{a} + ${m}\\mathbf{b}}{${m + n}} = ${col(p)}`, true) + `<p style="margin:0">$A(2, -1, 4)$, $B(7, 9, -1)$, so $P$ is $(${p.map((x) => F(x, 30)).join(", ")})$.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     7. Scalar product in 3D
     ===================================================================== */
  mount("w-dot", (box) => {
    const a = [2, -1, 2], b = [3, 4, 0];
    const st = { yaw: 40 * Math.PI / 180, pitch: 0.45 };
    const ctl = controls(box);
    const mk = (v, i, lab) => { const sl = HM.slider(ctl, { label: lab, min: -4, max: 4, step: 1, value: v[i], oninput: (x) => { const prev = v[i]; v[i] = x; if (!v.some(Boolean)) { sl.set(prev > 0 ? -1 : 1); return; } sim.redraw(); info(); } }); return sl; };
    ["$a_1$", "$a_2$", "$a_3$"].forEach((l, i) => mk(a, i, l));
    ["$b_1$", "$b_2$", "$b_3$"].forEach((l, i) => mk(b, i, l));
    st.slider = HM.slider(ctl, { label: "turn the picture", min: 0, max: 359, step: 1, value: 40, unit: "°", oninput: turnInput(st, () => sim.redraw()) });
    const cv = canvasIn(box);
    box.append(HM.el("p", { class: "drag-hint" }, "Drag the picture, or use the turn slider, to turn it."));
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 300 : 340),
      draw(ctx, t, dt, C, S) {
        const pr = view3(S, st.yaw, st.pitch, Math.min(S.w, S.h * 1.3) / 12, S.w / 2, S.h * 0.55);
        ctx.fillStyle = C.paper; ctx.fillRect(0, 0, S.w, S.h);
        // floor grid z = 0
        ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        for (let i = -4; i <= 4; i++) { let p = pr([i, -4, 0]), q = pr([i, 4, 0]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); p = pr([-4, i, 0]); q = pr([4, i, 0]); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke(); }
        const o = pr([0, 0, 0]);
        [[[5, 0, 0], "x"], [[0, 5, 0], "y"], [[0, 0, 5], "z"]].forEach(([e, l]) => { const q = pr(e); HM.arrow(ctx, o.x, o.y, q.x, q.y, C.ink2, 1.5, 7); HM.label(ctx, l, q.x + 5, q.y - 6, { size: 13, col: C.ink2, bold: true, avoid: true }); });
        // angle arc between a and b, drawn as a fan of points along the slerp
        const la = Math.hypot(...a), lb = Math.hypot(...b);
        const ua = a.map((x) => x / la), ub = b.map((x) => x / lb);
        const cos = ua.reduce((s, x, i) => s + x * ub[i], 0), th = Math.acos(Math.max(-1, Math.min(1, cos)));
        if (th > 0.02 && th < Math.PI - 0.02) {
          ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath();
          for (let k = 0; k <= 30; k++) { const s = k / 30; const w1 = Math.sin((1 - s) * th) / Math.sin(th), w2 = Math.sin(s * th) / Math.sin(th); const p = pr(ua.map((x, i) => 1.2 * (w1 * x + w2 * ub[i]))); k ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }
          ctx.stroke();
        }
        [[a, C.red, "a"], [b, C.sea, "b"]].forEach(([v, col, l]) => { const q = pr(v), f = pr([v[0], v[1], 0]); ctx.setLineDash([3, 3]); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(q.x, q.y); ctx.stroke(); ctx.setLineDash([]); HM.arrow(ctx, o.x, o.y, q.x, q.y, col, 4, 13); HM.label(ctx, l, q.x + 7, q.y - 8, { bold: true, size: 17, col, avoid: true }); });
        cv.setAttribute("aria-label", `Vectors a = (${a}) in red and b = (${b}) in blue drawn from the origin, with the angle between them marked.`);
      },
    });
    rotDrag(cv, st, () => sim.redraw());
    function info() {
      const dot = a.reduce((s, x, i) => s + x * b[i], 0);
      const la2 = a.reduce((s, x) => s + x * x, 0), lb2 = b.reduce((s, x) => s + x * x, 0);
      const sq = (n) => (Number.isInteger(Math.sqrt(n)) ? `${Math.sqrt(n)}` : `\\sqrt{${n}}`);
      const p = (x) => (x < 0 ? `(${x})` : `${x}`);
      const th = Math.acos(dot / Math.sqrt(la2 * lb2)) * 180 / Math.PI;
      out.innerHTML = HM.tex(`\\mathbf{a}\\cdot\\mathbf{b} = ${a.map((x, i) => `${x}(${b[i]})`).join(" + ").replace(/\+ -/g, "- ")} = ${dot}`, true) +
        HM.tex(`|\\mathbf{a}| = ${sq(la2)},\\quad |\\mathbf{b}| = ${sq(lb2)}`, true) + HM.tex(`\\cos\\theta = \\frac{${dot}}{${sq(la2)} \\times ${sq(lb2)}} \\Rightarrow \\theta = ${N(th, 1)}^\\circ`, true) +
        `<p style="margin:0">${dot === 0 ? "<b>$\\mathbf{a}\\cdot\\mathbf{b} = 0$: the vectors are perpendicular.</b>" : dot > 0 ? "Positive scalar product: the angle is acute." : "Negative scalar product: the angle is obtuse."}</p>`;
      HM.math(out);
    }
    info();
  });
})();
