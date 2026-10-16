/* Structures & materials — the widgets in the Shipyard & Rigging Loft.
   Every number a widget shows comes from the relationships the text teaches and the Data Booklet gives:
   sigma = F/A, epsilon = dl/l, E = sigma/epsilon, Es = 1/2 F x, factor of safety = ultimate / safe working,
   M = F x (perpendicular distance), sum Fh = 0, sum Fv = 0, sum M = 0.
   The pure calculations live in STR_CORE (no DOM) so they can be checked from node. */
(function () {
  "use strict";
  const D2R = Math.PI / 180;

  /* ================================================================
     PURE CORE
     ================================================================ */
  const Core = {};

  /* Simply supported beam. A (hinge) at xa, B (roller, vertical reaction only) at xb.
     loads: [{ x, F, ang }]  F in kN acting DOWN-and-sideways: ang is measured from the downward vertical,
     positive = pushing towards +x. udl: { w, x0, x1 } in kN/m. All lengths in m. */
  Core.beam = function (o) {
    const pts = o.loads.filter((l) => l.F > 0).map((l) => ({ x: l.x, F: l.F, ang: l.ang || 0, fv: l.F * Math.cos((l.ang || 0) * D2R), fh: l.F * Math.sin((l.ang || 0) * D2R) }));
    const u = o.udl && o.udl.w > 0 && o.udl.x1 > o.udl.x0 ? { w: o.udl.w, x0: o.udl.x0, x1: o.udl.x1, len: o.udl.x1 - o.udl.x0, W: o.udl.w * (o.udl.x1 - o.udl.x0), xm: (o.udl.x0 + o.udl.x1) / 2 } : null;
    const span = o.xb - o.xa;
    let sumFv = 0, sumFh = 0, mA = 0;
    pts.forEach((p) => { sumFv += p.fv; sumFh += p.fh; mA += p.fv * (p.x - o.xa); });
    if (u) { sumFv += u.W; mA += u.W * (u.xm - o.xa); }
    const By = mA / span, Ay = sumFv - By, Ax = -sumFh;
    // independent check: moments about B (anticlockwise positive), and the force sums
    let mB = Ay * (o.xa - o.xb);
    pts.forEach((p) => { mB += -p.fv * (p.x - o.xb); });
    if (u) mB += -u.W * (u.xm - o.xb);
    const RA = Math.hypot(Ax, Ay);
    return { pts, u, span, sumFv, sumFh, mA, By, Ay, Ax, RA, angA: Math.atan2(Ay, Ax) / D2R, chk: { fv: Ay + By - sumFv, fh: Ax + sumFh, mB } };
  };

  /* Pin-jointed truss by the matrix form of the method of joints.
     model: { nodes:[{x,y}], members:[[a,b],...], supports:[{n, kind:"pin"|"rollerV"|"rollerH"}], loads:[{n,fx,fy}] }
     member force T is + for tension. Returns { ok, T[], R:[{n,rx,ry,hasX,hasY}] } */
  Core.truss = function (m) {
    const nN = m.nodes.length, nM = m.members.length;
    const rc = [];
    m.supports.forEach((s) => { if (s.kind !== "rollerH") rc.push({ n: s.n, d: "y" }); if (s.kind !== "rollerV") rc.push({ n: s.n, d: "x" }); });
    const nU = nM + rc.length;
    if (nU !== 2 * nN) return { ok: false, reason: `${nM} members + ${rc.length} reaction components is not ${2 * nN}: not statically determinate` };
    const A = Array.from({ length: nU }, () => new Array(nU).fill(0));
    const b = new Array(nU).fill(0);
    m.members.forEach(([a, c], i) => {
      const dx = m.nodes[c].x - m.nodes[a].x, dy = m.nodes[c].y - m.nodes[a].y, L = Math.hypot(dx, dy);
      A[2 * a][i] += dx / L; A[2 * a + 1][i] += dy / L;
      A[2 * c][i] -= dx / L; A[2 * c + 1][i] -= dy / L;
    });
    rc.forEach((r, k) => { A[2 * r.n + (r.d === "y" ? 1 : 0)][nM + k] += 1; });
    (m.loads || []).forEach((l) => { b[2 * l.n] -= l.fx || 0; b[2 * l.n + 1] -= l.fy || 0; });
    // Gaussian elimination with partial pivoting
    const M = A.map((row, i) => row.concat([b[i]]));
    for (let c = 0; c < nU; c++) {
      let p = c;
      for (let r = c + 1; r < nU; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
      if (Math.abs(M[p][c]) < 1e-9) return { ok: false, reason: "the structure is a mechanism (it would collapse) or is badly supported" };
      [M[c], M[p]] = [M[p], M[c]];
      for (let r = 0; r < nU; r++) if (r !== c) { const f = M[r][c] / M[c][c]; if (f) for (let k = c; k <= nU; k++) M[r][k] -= f * M[c][k]; }
    }
    const x = M.map((row, i) => row[nU] / row[i]);
    const T = x.slice(0, nM).map((v) => (Math.abs(v) < 1e-9 ? 0 : v));
    const R = [];
    rc.forEach((r, k) => {
      let e = R.find((q) => q.n === r.n);
      if (!e) { e = { n: r.n, rx: 0, ry: 0, hasX: false, hasY: false }; R.push(e); }
      e["r" + r.d] = x[nM + k]; e["has" + r.d.toUpperCase()] = true;
    });
    return { ok: true, T, R, rc };
  };

  /* Order the joints for a step-by-step solution. Unknowns are the members and, until the
     whole-structure equilibrium has fixed them, the reaction components. Each step solves a joint
     with at most two unknowns, with the equations written out. */
  Core.truss.steps = function (m, sol, reactionsFirst) {
    const nN = m.nodes.length, nM = m.members.length;
    const solvedM = new Array(nM).fill(false);
    const solvedR = {}; // key n+d
    const rKey = (r) => r.n + r.d;
    sol.rc.forEach((r) => { solvedR[rKey(r)] = !!reactionsFirst; });
    const done = new Array(nN).fill(false);
    const steps = [];
    const dirOf = (a, c) => { const dx = m.nodes[c].x - m.nodes[a].x, dy = m.nodes[c].y - m.nodes[a].y, L = Math.hypot(dx, dy); return [dx / L, dy / L]; };
    const nodeInfo = (n) => {
      const mem = [];
      m.members.forEach(([a, c], i) => { if (a === n) mem.push({ i, other: c, dir: dirOf(a, c) }); else if (c === n) mem.push({ i, other: a, dir: dirOf(c, a) }); });
      const rcs = sol.rc.filter((r) => r.n === n);
      const loads = (m.loads || []).filter((l) => l.n === n);
      return { mem, rcs, loads };
    };
    let guard = 0;
    while (done.some((d) => !d) && guard++ < 40) {
      let pick = -1, bestCount = 9;
      for (let n = 0; n < nN; n++) {
        if (done[n]) continue;
        const info = nodeInfo(n);
        const unk = info.mem.filter((q) => !solvedM[q.i]).length + info.rcs.filter((r) => !solvedR[rKey(r)]).length;
        if (unk <= 2 && unk < bestCount) { pick = n; bestCount = unk; if (unk === 2) break; }
      }
      if (pick < 0) break;
      const n = pick, info = nodeInfo(n);
      const unkM = info.mem.filter((q) => !solvedM[q.i]);
      const unkR = info.rcs.filter((r) => !solvedR[rKey(r)]);
      // equation coefficients: sum over unknowns coef*value + K = 0, for x and y
      const cols = [];
      unkM.forEach((q) => cols.push({ kind: "m", i: q.i, cx: q.dir[0], cy: q.dir[1] }));
      unkR.forEach((r) => cols.push({ kind: "r", n: r.n, d: r.d, cx: r.d === "x" ? 1 : 0, cy: r.d === "y" ? 1 : 0 }));
      let Kx = 0, Ky = 0;
      const known = [];
      info.loads.forEach((l) => { Kx += l.fx || 0; Ky += l.fy || 0; known.push({ what: "load", fx: l.fx || 0, fy: l.fy || 0 }); });
      info.mem.forEach((q) => { if (solvedM[q.i]) { const T = sol.T[q.i]; Kx += T * q.dir[0]; Ky += T * q.dir[1]; known.push({ what: "member", i: q.i, other: q.other, T, fx: T * q.dir[0], fy: T * q.dir[1] }); } });
      info.rcs.forEach((r) => { if (solvedR[rKey(r)]) { const e = sol.R.find((q) => q.n === n); const v = r.d === "x" ? e.rx : e.ry; Kx += r.d === "x" ? v : 0; Ky += r.d === "y" ? v : 0; known.push({ what: "reaction", d: r.d, v, fx: r.d === "x" ? v : 0, fy: r.d === "y" ? v : 0 }); } });
      // solve (least squares for the 2 x k system, honest about the check equation)
      let vals = [];
      if (cols.length === 2) {
        const [p, q] = cols; const det = p.cx * q.cy - q.cx * p.cy;
        if (Math.abs(det) > 1e-9) vals = [(-Kx * q.cy + Ky * q.cx) / det, (-p.cx * Ky + p.cy * Kx) / det];
        else vals = null;
      } else if (cols.length === 1) {
        const p = cols[0];
        vals = [Math.abs(p.cx) >= Math.abs(p.cy) ? -Kx / p.cx : -Ky / p.cy];
      }
      if (vals === null) { done[n] = false; solvedM.forEach(() => 0); // collinear unknowns: skip this joint for now
        info._skip = true; if (guard > 30) break; done[n] = "skip"; continue; }
      const found = cols.map((c, k) => ({ ...c, val: vals[k] }));
      found.forEach((f) => { if (f.kind === "m") solvedM[f.i] = true; else solvedR[f.n + f.d] = true; });
      const residual = [Kx + found.reduce((s, f) => s + f.cx * f.val, 0), Ky + found.reduce((s, f) => s + f.cy * f.val, 0)];
      steps.push({ node: n, cols: found, known, Kx, Ky, residual, mem: info.mem, loads: info.loads, solvedMAfter: solvedM.slice(), solvedRAfter: Object.assign({}, solvedR) });
      done[n] = true;
      // reset any skipped joints so they can be retried
      for (let k = 0; k < nN; k++) if (done[k] === "skip") done[k] = false;
    }
    return steps;
  };

  /* Cantilever/centre-load style helper used by the sizing widget (kN, mm, N/mm2) */
  Core.size = function (o) {
    const sw = o.ult / o.fos;                       // safe working stress, N/mm2
    const A = (o.F * 1000) / sw;                    // mm2
    let d = null, t = null, bad = false;
    if (o.shape === "solid") d = Math.sqrt(4 * A / Math.PI);
    else { const inner2 = o.D * o.D - 4 * A / Math.PI; if (inner2 <= 0) bad = true; else { d = Math.sqrt(inner2); t = (o.D - d) / 2; } }
    const sigma = A ? (o.F * 1000) / A : 0;         // equals sw by construction
    const strain = o.E ? sigma / (o.E * 1000) : 0;  // E kN/mm2 -> N/mm2
    const dl = strain * o.L * 1000;                 // mm (L in m)
    const Es = 0.5 * (o.F * 1000) * (dl / 1000);    // J
    return { sw, A, d, t, bad, sigma, strain, dl, Es };
  };

  if (typeof module !== "undefined" && module.exports) { module.exports = Core; return; }
  window.STR_CORE = Core;

  /* ================================================================
     BROWSER PART
     ================================================================ */
  const HE = window.HE;
  const $ = (id) => document.getElementById(id);
  const N = HE.n;
  const F3 = (x, sf = 3) => (Math.abs(x) < 1e-9 ? "0" : HE.fmt(x, sf));
  const font = (px, bold) => `${bold ? "bold " : ""}${px}px "Atkinson Hyperlegible", system-ui, sans-serif`;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HE.el("canvas", { class: "sim", role: "img", "aria-label": label || "" }); box.append(c); return c; };
  const texBox = (box) => { const d = HE.el("div", { class: "tex-out str-work", "aria-live": "polite" }); box.append(d); return d; };
  const controls = (box, label) => { const d = HE.el("div", { class: "sim-controls", role: "group", "aria-label": label || null }); box.append(d); return d; };
  const group = (box, title) => { const g = HE.el("fieldset", { class: "str-group" }, HE.el("legend", null, title)); box.append(g); const c = HE.el("div", { class: "sim-controls" }); g.append(c); return c; };
  const ang360 = (a) => ((a % 360) + 360) % 360;
  const cap = (ctx, s, x, y, o) => HE.label(ctx, s, x, y, o);
  const dashed = (ctx, d, fn) => { ctx.save(); ctx.setLineDash(d); fn(); ctx.restore(); };
  function line(ctx, x1, y1, x2, y2, col, w = 2, dash) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); ctx.restore();
  }
  /* an arrow that may be dashed (HE.arrow keeps whatever dash is set when it is called) */
  function arrow(ctx, x1, y1, x2, y2, col, w = 3, head = 10, dash) {
    if (dash) { ctx.save(); ctx.setLineDash(dash); HE.arrow(ctx, x1, y1, x2, y2, col, w, head); ctx.restore(); }
    else HE.arrow(ctx, x1, y1, x2, y2, col, w, head);
  }

  /* =====================================================================
     1. Force resolver and polygon: resultant and equilibrant
     ===================================================================== */
  mount("w-polygon", (box) => {
    const FS = [{ m: 8, a: 0 }, { m: 6, a: 120 }, { m: 5, a: 250 }];
    let n = 2, u = 9, comps = false, anim = false;
    const names = ["F₁", "F₂", "F₃"];
    HE.choice(box, "Forces acting at the point:", [[2, "two forces"], [3, "three forces"]], 2, (v) => { n = v; rows[2].forEach((r) => (r.input.closest(".slider").hidden = n < 3)); u = n + 1; sim.redraw(); info(); });
    HE.choice(box, "Show components of the resultant:", [[0, "off"], [1, "on"]], 0, (v) => { comps = !!v; sim.redraw(); });
    const ctl = controls(box, "Force sizes and directions");
    const rows = FS.map((f, i) => {
      const a = HE.slider(ctl, { label: `${names[i]} size`, min: 0, max: 10, step: 0.1, value: f.m, unit: "kN", fmt: (v) => v.toFixed(1), oninput: (v) => { f.m = v; sim.redraw(); info(); } });
      const b = HE.slider(ctl, { label: `${names[i]} direction (anticlockwise from →)`, min: 0, max: 359, step: 1, value: f.a, unit: "°", oninput: (v) => { f.a = v; sim.redraw(); info(); } });
      return [a, b];
    });
    const rowsT = [0, 1].map((k) => rows.map((r) => r[k]));
    rows[2] = [rows[2][0], rows[2][1]]; rows[2].forEach((r) => (r.input.closest(".slider").hidden = true));
    const btns = HE.el("div", { class: "btn-row" });
    const build = HE.el("button", { class: "btn small primary", type: "button" }, "▶ Build the polygon");
    btns.append(build);
    box.append(btns);
    const cv = canvasIn(box, "Two panels. Left: the forces acting at a point, with their resultant and equilibrant. Right: the same forces drawn head to tail as a polygon.");
    box.append(HE.el("p", { class: "drag-hint" }, "Drag the tip of a force arrow in the left panel, or use the sliders. Directions are measured anticlockwise from the → axis."));
    const out = texBox(box);
    const geom = (S) => {
      const wide = S.w >= 560;
      const P1 = { x: 0, y: 0, w: wide ? S.w / 2 : S.w, h: wide ? S.h : S.h / 2 };
      const P2 = { x: wide ? S.w / 2 : 0, y: wide ? 0 : S.h / 2, w: P1.w, h: P1.h };
      return { P1, P2, wide };
    };
    const calc = () => {
      let rx = 0, ry = 0;
      for (let i = 0; i < n; i++) { rx += FS[i].m * Math.cos(FS[i].a * D2R); ry += FS[i].m * Math.sin(FS[i].a * D2R); }
      return { rx, ry, R: Math.hypot(rx, ry), th: ang360(Math.atan2(ry, rx) / D2R) };
    };
    let K = 1, O = { x: 0, y: 0 };
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? Math.min(340, w * 0.52) : 540),
      draw(ctx, t, dt, C, S) {
        if (anim) { u += dt * 0.9; if (u >= n + 1) { u = n + 1; anim = false; setTimeout(() => sim.pause(), 0); build.disabled = false; } }
        const { P1, P2, wide } = geom(S);
        const r = calc();
        // panel frames and titles
        ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 1;
        ctx.strokeRect(P1.x + 3, P1.y + 3, P1.w - 6, P1.h - 6); ctx.strokeRect(P2.x + 3, P2.y + 3, P2.w - 6, P2.h - 6); ctx.restore();
        cap(ctx, "Space diagram: forces at O", P1.x + 12, P1.y + 17, { bold: true, size: 12 });
        cap(ctx, "Vector diagram: head to tail", P2.x + 12, P2.y + 17, { bold: true, size: 12 });
        // ---- space diagram
        O = { x: P1.x + P1.w / 2, y: P1.y + P1.h / 2 + 8 };
        const rad = Math.min(P1.w, P1.h) / 2 - 30;
        const biggest = Math.max(10, r.R, ...FS.slice(0, n).map((f) => f.m));
        const smax = biggest <= 10 ? 10 : Math.ceil(biggest / 5) * 5;
        K = rad / smax;
        line(ctx, O.x - rad - 6, O.y, O.x + rad + 6, O.y, C.line, 1, [3, 4]); line(ctx, O.x, O.y - rad - 6, O.x, O.y + rad + 6, C.line, 1, [3, 4]);
        const cols = [C.lode, C.sea, C.gold];
        for (let i = 0; i < n; i++) {
          const f = FS[i], ex = O.x + K * f.m * Math.cos(f.a * D2R), ey = O.y - K * f.m * Math.sin(f.a * D2R);
          arrow(ctx, O.x, O.y, ex, ey, cols[i], 3.5, 11);
          if (f.m > 0.2) cap(ctx, names[i], ex + 9 * Math.cos(f.a * D2R) + (Math.cos(f.a * D2R) >= 0 ? 4 : -4), ey - 9 * Math.sin(f.a * D2R), { col: cols[i], bold: true, size: 13, align: Math.cos(f.a * D2R) >= 0 ? "left" : "right", avoid: true });
        }
        if (r.R > 0.05) {
          const ux = Math.cos(r.th * D2R), uy = Math.sin(r.th * D2R);
          if (comps) {
            line(ctx, O.x, O.y, O.x + K * r.rx, O.y, C.violet, 1.5, [5, 4]); line(ctx, O.x + K * r.rx, O.y, O.x + K * r.rx, O.y - K * r.ry, C.violet, 1.5, [5, 4]);
          }
          arrow(ctx, O.x, O.y, O.x + K * r.R * ux, O.y - K * r.R * uy, C.violet, 5, 13);
          arrow(ctx, O.x, O.y, O.x - K * r.R * ux, O.y + K * r.R * uy, C.grass, 3, 11, [7, 5]);
          cap(ctx, "R", O.x + (K * r.R * ux) * 0.55 + 10 * -uy, O.y - (K * r.R * uy) * 0.55 - 10 * ux, { col: C.violet, bold: true, size: 13, avoid: true });
          cap(ctx, "E", O.x - (K * r.R * ux) * 0.55 - 10 * -uy, O.y + (K * r.R * uy) * 0.55 + 10 * ux, { col: C.grass, bold: true, size: 13, avoid: true });
        }
        HE.dot(ctx, O.x, O.y, C.ink, 5, C.card);
        cap(ctx, "O", O.x - 12, O.y + 14, { size: 12, col: C.muted });
        // scale bar
        line(ctx, P1.x + 14, P1.y + P1.h - 16, P1.x + 14 + 5 * K, P1.y + P1.h - 16, C.ink2, 2);
        cap(ctx, "5 kN", P1.x + 20 + 5 * K, P1.y + P1.h - 16, { size: 11, col: C.ink2 });
        // ---- vector diagram (polygon)
        const pts = [{ x: 0, y: 0 }];
        for (let i = 0; i < n; i++) pts.push({ x: pts[i].x + FS[i].m * Math.cos(FS[i].a * D2R), y: pts[i].y + FS[i].m * Math.sin(FS[i].a * D2R) });
        const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
        const minx = Math.min(...xs, 0), maxx = Math.max(...xs, 0), miny = Math.min(...ys, 0), maxy = Math.max(...ys, 0);
        const bw = Math.max(maxx - minx, 2), bh = Math.max(maxy - miny, 2);
        const kp = Math.min((P2.w - 70) / bw, (P2.h - 80) / bh, 26);
        const ox = P2.x + (P2.w - bw * kp) / 2 - minx * kp, oy = P2.y + 28 + (P2.h - 56 - bh * kp) / 2 + maxy * kp;
        const sp = (p) => [ox + p.x * kp, oy - p.y * kp];
        for (let i = 0; i < n; i++) {
          const t = Math.max(0, Math.min(1, u - i));
          const a0 = pts[i], a1 = pts[i + 1];
          // each force slides from the start of the polygon to its head-to-tail place
          const tail = { x: a0.x * t, y: a0.y * t };
          const [x1, y1] = sp(tail), [x2, y2] = sp({ x: tail.x + (a1.x - a0.x), y: tail.y + (a1.y - a0.y) });
          if (FS[i].m > 0.05) {
            arrow(ctx, x1, y1, x2, y2, cols[i], 3.5, 11);
            if (t > 0.9) cap(ctx, names[i], (x1 + x2) / 2 + 12 * Math.sign(-(y2 - y1) || 1), (y1 + y2) / 2 - 12 * Math.sign(x2 - x1 || 1), { col: cols[i], bold: true, size: 13, align: "center", avoid: true });
          }
        }
        const eT = Math.max(0, Math.min(1, u - n));
        const [sx0, sy0] = sp(pts[0]), [ex1, ey1] = sp(pts[n]);
        if (r.R > 0.05) {
          if (eT > 0) {
            // resultant (thin, violet) and the equilibrant that closes the polygon (green, dashed)
            arrow(ctx, sx0, sy0, sx0 + (ex1 - sx0) * 1, sy0 + (ey1 - sy0) * 1, C.violet, 2, 9, [2, 4]);
            arrow(ctx, ex1, ey1, ex1 + (sx0 - ex1) * eT, ey1 + (sy0 - ey1) * eT, C.grass, 4, 12);
            if (eT > 0.9) { cap(ctx, "E", (sx0 + ex1) / 2 + 14 * Math.sign(ey1 - sy0 || 1), (sy0 + ey1) / 2 + 14 * Math.sign(sx0 - ex1 || 1), { col: C.grass, bold: true, size: 13, align: "center", avoid: true }); cap(ctx, "R", (sx0 + ex1) / 2 - 14 * Math.sign(ey1 - sy0 || 1), (sy0 + ey1) / 2 - 14 * Math.sign(sx0 - ex1 || 1), { col: C.violet, bold: true, size: 13, align: "center", avoid: true }); }
          }
        }
        HE.dot(ctx, sx0, sy0, C.ink, 4, C.card);
        line(ctx, P2.x + 14, P2.y + P2.h - 16, P2.x + 14 + 5 * kp, P2.y + P2.h - 16, C.ink2, 2);
        cap(ctx, "5 kN", P2.x + 20 + 5 * kp, P2.y + P2.h - 16, { size: 11, col: C.ink2 });
        if (u >= n + 1 && r.R < 0.05) cap(ctx, "The polygon closes by itself: equilibrium", P2.x + P2.w / 2, P2.y + P2.h - 36, { align: "center", bold: true, col: C.grass, size: 12 });
        cv.setAttribute("aria-label", `Forces at a point: ${FS.slice(0, n).map((f, i) => `${names[i]} ${f.m.toFixed(1)} kilonewtons at ${f.a} degrees`).join(", ")}. Resultant ${r.R.toFixed(2)} kilonewtons at ${r.th.toFixed(1)} degrees; the equilibrant is equal and opposite.`);
      },
    });
    build.addEventListener("click", () => {
      if (HE.reduced) { u = n + 1; sim.redraw(); return; }
      u = 0; anim = true; build.disabled = true; sim.play();
    });
    HE.drag(cv, sim, () => FS.slice(0, n).map((f, i) => ({ id: i, x: O.x + K * f.m * Math.cos(f.a * D2R), y: O.y - K * f.m * Math.sin(f.a * D2R) })), (id, x, y) => {
      const dx = x - O.x, dy = O.y - y, f = FS[id];
      f.m = Math.max(0, Math.min(10, Math.round(Math.hypot(dx, dy) / K * 10) / 10));
      if (f.m > 0.15) f.a = Math.round(ang360(Math.atan2(dy, dx) / D2R)) % 360;
      rowsT[0][id].sync(f.m); rowsT[1][id].sync(f.a);
      sim.redraw(); info();
    });
    function info() {
      const r = calc();
      let rowsH = "";
      for (let i = 0; i < n; i++) {
        const f = FS[i];
        rowsH += `<tr><td>${names[i]}</td><td class="num">${f.m.toFixed(1)}</td><td class="num">${f.a}°</td><td class="num">${F3(f.m * Math.cos(f.a * D2R))}</td><td class="num">${F3(f.m * Math.sin(f.a * D2R))}</td></tr>`;
      }
      rowsH += `<tr><th>Σ (resultant R)</th><td></td><td></td><th class="num">${F3(r.rx)}</th><th class="num">${F3(r.ry)}</th></tr>`;
      out.innerHTML = `<div class="table-wrap"><table><thead><tr><th>Force</th><th class="num">Size (kN)</th><th class="num">Direction</th><th class="num">Horizontal F cos θ (kN)</th><th class="num">Vertical F sin θ (kN)</th></tr></thead><tbody>${rowsH}</tbody></table></div>` +
        (r.R < 0.005 ? `<p><b class="ok">R = 0: these forces are already in equilibrium.</b> The head-to-tail polygon closes without any extra force.</p>`
          : `<p><b>Resultant R</b> = √(${F3(r.rx)}² + ${F3(r.ry)}²) = <b>${F3(r.R)} kN</b> at <b>${F3(r.th, 4).replace(/\.?0+$/, "")}°</b> (tan θ = ${F3(r.ry)} ÷ ${F3(r.rx)}, taking the quadrant from the signs).<br>` +
            `<b class="ok">Equilibrant E</b> = <b>${F3(r.R)} kN</b> at <b>${F3(ang360(r.th + 180), 4).replace(/\.?0+$/, "")}°</b>: equal in size to R and opposite in direction, so that F₁ + F₂${n === 3 ? " + F₃" : ""} + E = 0.</p>`);
    }
    info();
  });

  /* =====================================================================
     2. A load on two ropes: unknown forces from two simultaneous equations
     ===================================================================== */
  mount("w-hang", (box) => {
    let W = 30, al = 40, be = 65, comp = 0, target = 0, anim = false;
    const ctl = controls(box, "Hanging load and rope angles");
    HE.slider(ctl, { label: "Weight W hanging from the ring", min: 5, max: 60, step: 1, value: W, unit: "kN", oninput: (v) => { W = v; sim.redraw(); info(); } });
    HE.slider(ctl, { label: "Left rope angle α above horizontal", min: 20, max: 80, step: 1, value: al, unit: "°", oninput: (v) => { al = v; sim.redraw(); info(); } });
    HE.slider(ctl, { label: "Right rope angle β above horizontal", min: 20, max: 80, step: 1, value: be, unit: "°", oninput: (v) => { be = v; sim.redraw(); info(); } });
    const btns = HE.el("div", { class: "btn-row" });
    const go = HE.el("button", { class: "btn small primary", type: "button", "aria-pressed": "false" }, "▶ Resolve each tension into components");
    btns.append(go); box.append(btns);
    const cv = canvasIn(box, "A weight hangs from a ring held by two ropes at different angles; beside it the closed triangle of forces.");
    const out = texBox(box);
    const solve = () => { const s = Math.sin((al + be) * D2R); return { TA: W * Math.cos(be * D2R) / s, TB: W * Math.cos(al * D2R) / s }; };
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? Math.min(330, w * 0.5) : 520),
      draw(ctx, t, dt, C, S) {
        if (anim) { comp += (target - comp) * Math.min(1, dt * 4) + Math.sign(target - comp) * dt * 0.05; if (Math.abs(target - comp) < 0.01) { comp = target; anim = false; setTimeout(() => sim.pause(), 0); } }
        const wide = S.w >= 560;
        const P1 = { x: 0, y: 0, w: wide ? S.w * 0.56 : S.w, h: wide ? S.h : S.h * 0.56 };
        const P2 = { x: wide ? P1.w : 0, y: wide ? 0 : P1.h, w: wide ? S.w - P1.w : S.w, h: wide ? S.h : S.h - P1.h };
        const { TA, TB } = solve();
        ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(P1.x + 3, P1.y + 3, P1.w - 6, P1.h - 6); ctx.strokeRect(P2.x + 3, P2.y + 3, P2.w - 6, P2.h - 6); ctx.restore();
        cap(ctx, "Space diagram", P1.x + 12, P1.y + 17, { bold: true, size: 12 });
        cap(ctx, "Triangle of forces", P2.x + 12, P2.y + 17, { bold: true, size: 12 });
        // geometry: both ropes rise by H to a horizontal spar
        const cA = 1 / Math.tan(al * D2R), cB = 1 / Math.tan(be * D2R);
        const H = Math.min(P1.h * 0.34, (P1.w - 70) / (cA + cB));
        const sparY = P1.y + 38, ringY = sparY + H;
        const ringX = P1.x + (P1.w - H * (cA + cB)) / 2 + H * cA;
        const ax = ringX - H * cA, bx = ringX + H * cB;
        // spar
        ctx.save(); ctx.fillStyle = C.dirt; ctx.fillRect(ax - 22, sparY - 8, bx - ax + 44, 8);
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; for (let x = ax - 20; x < bx + 22; x += 8) { ctx.beginPath(); ctx.moveTo(x, sparY - 8); ctx.lineTo(x - 5, sparY - 15); ctx.stroke(); } ctx.restore();
        line(ctx, ax, sparY, ringX, ringY, C.ink2, 3); line(ctx, bx, sparY, ringX, ringY, C.ink2, 3);
        const wy = ringY + 28;
        line(ctx, ringX, ringY, ringX, wy, C.ink2, 3);
        ctx.save(); ctx.fillStyle = C.dirt; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(ringX - 20, wy, 40, 34); ctx.strokeRect(ringX - 20, wy, 40, 34); ctx.restore();
        cap(ctx, "W", ringX, wy + 18, { align: "center", bold: true, col: "#fffaf0", haloCol: C.dirt, size: 14 });
        // force arrows on the ring
        const sc = 78 / Math.max(W, TA, TB);
        const dA = [-Math.cos(al * D2R), -Math.sin(al * D2R)], dB = [Math.cos(be * D2R), -Math.sin(be * D2R)]; // screen directions
        arrow(ctx, ringX, ringY, ringX + dA[0] * TA * sc, ringY + dA[1] * TA * sc, C.lode, 3.5, 11);
        arrow(ctx, ringX, ringY, ringX + dB[0] * TB * sc, ringY + dB[1] * TB * sc, C.sea, 3.5, 11);
        arrow(ctx, ringX, ringY, ringX, ringY + W * sc, C.ink, 3.5, 11);
        if (comp > 0.02) {
          ctx.save(); ctx.globalAlpha = Math.min(1, comp * 1.4);
          const hA = TA * Math.cos(al * D2R) * sc * comp, vA = TA * Math.sin(al * D2R) * sc * comp, hB = TB * Math.cos(be * D2R) * sc * comp, vB = TB * Math.sin(be * D2R) * sc * comp;
          arrow(ctx, ringX, ringY, ringX - hA, ringY, C.lode, 2, 8, [4, 3]); arrow(ctx, ringX - hA, ringY, ringX - hA, ringY - vA, C.lode, 2, 8, [4, 3]);
          arrow(ctx, ringX, ringY, ringX + hB, ringY, C.sea, 2, 8, [4, 3]); arrow(ctx, ringX + hB, ringY, ringX + hB, ringY - vB, C.sea, 2, 8, [4, 3]);
          ctx.restore();
          if (comp > 0.95) {
            cap(ctx, "T_A cos α", ringX - hA / 2, ringY + 12, { size: 11, col: C.lode, align: "center", bold: true, avoid: true });
            cap(ctx, "T_B cos β", ringX + hB / 2, ringY + 12, { size: 11, col: C.sea, align: "center", bold: true, avoid: true });
          }
        }
        cap(ctx, "T_A", ringX + dA[0] * TA * sc - 6, ringY + dA[1] * TA * sc - 6, { col: C.lode, bold: true, size: 13, align: "right", avoid: true });
        cap(ctx, "T_B", ringX + dB[0] * TB * sc + 6, ringY + dB[1] * TB * sc - 6, { col: C.sea, bold: true, size: 13, avoid: true });
        // angle arcs
        ctx.save(); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(ax, sparY, 26, 0, al * D2R); ctx.stroke(); ctx.beginPath(); ctx.arc(bx, sparY, 26, Math.PI - be * D2R, Math.PI); ctx.stroke(); ctx.restore();
        cap(ctx, "α", ax + 34, sparY + 11, { size: 12, col: C.ink2 }); cap(ctx, "β", bx - 34, sparY + 11, { size: 12, col: C.ink2, align: "right" });
        // ---- triangle of forces: W (down), then T_B, then T_A closes it
        const v = [[0, -W], [TB * Math.cos(be * D2R), TB * Math.sin(be * D2R)], [-TA * Math.cos(al * D2R), TA * Math.sin(al * D2R)]];
        const pts = [[0, 0]]; v.forEach((q) => pts.push([pts[pts.length - 1][0] + q[0], pts[pts.length - 1][1] + q[1]]));
        const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
        const bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
        const kk = Math.min((P2.w - 70) / bw, (P2.h - 80) / bh, 12);
        const ox = P2.x + (P2.w - bw * kk) / 2 - Math.min(...xs) * kk, oy = P2.y + 30 + (P2.h - 60 - bh * kk) / 2 + Math.max(...ys) * kk;
        const q = (p) => [ox + p[0] * kk, oy - p[1] * kk];
        const cols = [C.ink, C.sea, C.lode], lab = ["W", "T_B", "T_A"];
        for (let i = 0; i < 3; i++) {
          const [x1, y1] = q(pts[i]), [x2, y2] = q(pts[i + 1]);
          arrow(ctx, x1, y1, x2, y2, cols[i], 3.5, 11);
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          const cx0 = ox + (xs.reduce((a, b) => a + b, 0) / 4) * kk, cy0 = oy - (ys.reduce((a, b) => a + b, 0) / 4) * kk;
          const nx = mx - cx0, ny = my - cy0, nl = Math.hypot(nx, ny) || 1;
          cap(ctx, lab[i], mx + nx / nl * 14, my + ny / nl * 14, { col: cols[i], bold: true, size: 13, align: "center", avoid: true });
        }
        cv.setAttribute("aria-label", `A ${W} kilonewton weight hangs from a ring on two ropes at ${al} and ${be} degrees above the horizontal. Tensions are ${TA.toFixed(2)} and ${TB.toFixed(2)} kilonewtons. The three forces form a closed triangle.`);
      },
    });
    go.addEventListener("click", () => {
      target = target ? 0 : 1;
      go.setAttribute("aria-pressed", target ? "true" : "false");
      go.textContent = target ? "◀ Hide the components" : "▶ Resolve each tension into components";
      if (HE.reduced) { comp = target; sim.redraw(); return; }
      anim = true; sim.play();
    });
    function info() {
      const { TA, TB } = solve();
      const ca = Math.cos(al * D2R), cb = Math.cos(be * D2R), sa = Math.sin(al * D2R), sb = Math.sin(be * D2R);
      out.innerHTML = `<p><b>Horizontal</b>, ΣF<sub>h</sub> = 0: T<sub>A</sub> cos ${al}° = T<sub>B</sub> cos ${be}° → ${F3(ca)} T<sub>A</sub> = ${F3(cb)} T<sub>B</sub></p>` +
        `<p><b>Vertical</b>, ΣF<sub>v</sub> = 0: T<sub>A</sub> sin ${al}° + T<sub>B</sub> sin ${be}° = ${W} → ${F3(sa)} T<sub>A</sub> + ${F3(sb)} T<sub>B</sub> = ${W}</p>` +
        `<p>Substitute T<sub>A</sub> = (${F3(cb)} ÷ ${F3(ca)}) T<sub>B</sub> into the vertical equation and solve:</p>` +
        `<p><b>T<sub>A</sub> = ${F3(TA)} kN</b> &nbsp; <b>T<sub>B</sub> = ${F3(TB)} kN</b> &nbsp; <span class="hint">check: ${F3(TA)} × ${F3(sa)} + ${F3(TB)} × ${F3(sb)} = ${F3(TA * sa + TB * sb)} kN, equal to W ✔</span></p>` +
        `<p class="hint">Sine rule on the triangle of forces gives the same answer: T<sub>A</sub> = W cos β ÷ sin(α + β) and T<sub>B</sub> = W cos α ÷ sin(α + β). Notice the tensions are bigger than W when the ropes are flat: shallow stays are strongly loaded.</p>`;
    }
    info();
  });

  /* =====================================================================
     3. Beam lab: reactions, moment working, equilibrium check
     ===================================================================== */
  mount("w-beam", (box) => {
    const S = { L: 10, xa: 0, xb: 10, p: [{ F: 20, x: 2, ang: 0 }, { F: 30, x: 6, ang: 0 }], w: 0, u0: 3, u1: 8 };
    const sl = {};
    const presets = HE.el("div", { class: "btn-row", role: "group", "aria-label": "Preset beams" }, HE.el("span", { class: "seg-label" }, "Load a preset:"));
    const addPre = (lab, f) => { const b = HE.el("button", { class: "btn small", type: "button" }, lab); b.addEventListener("click", () => { f(); sync(); sim.redraw(); info(); }); presets.append(b); };
    box.append(presets);
    const gL = group(box, "Beam and supports");
    sl.L = HE.slider(gL, { label: "Beam length", min: 4, max: 12, step: 1, value: S.L, unit: "m", oninput: (v) => { S.L = v; limits(); sim.redraw(); info(); } });
    sl.xa = HE.slider(gL, { label: "Hinge A at", min: 0, max: 12, step: 0.5, value: S.xa, unit: "m", oninput: (v) => { S.xa = Math.min(v, S.xb - 1); if (S.xa !== v) sl.xa.sync(S.xa); sim.redraw(); info(); } });
    sl.xb = HE.slider(gL, { label: "Roller B at", min: 0, max: 12, step: 0.5, value: S.xb, unit: "m", oninput: (v) => { S.xb = Math.max(v, S.xa + 1); if (S.xb !== v) sl.xb.sync(S.xb); sim.redraw(); info(); } });
    [0, 1].forEach((i) => {
      const g = group(box, `Point load P${i + 1}`);
      sl["F" + i] = HE.slider(g, { label: `P${i + 1} size`, min: 0, max: 60, step: 1, value: S.p[i].F, unit: "kN", oninput: (v) => { S.p[i].F = v; sim.redraw(); info(); } });
      sl["x" + i] = HE.slider(g, { label: `P${i + 1} distance from the left end`, min: 0, max: 12, step: 0.25, value: S.p[i].x, unit: "m", oninput: (v) => { S.p[i].x = v; sim.redraw(); info(); } });
      sl["a" + i] = HE.slider(g, { label: `P${i + 1} angle from the vertical`, min: -60, max: 60, step: 5, value: S.p[i].ang, unit: "°", oninput: (v) => { S.p[i].ang = v; sim.redraw(); info(); } });
    });
    const gU = group(box, "Uniformly distributed load (UDL)");
    sl.w = HE.slider(gU, { label: "Intensity w", min: 0, max: 10, step: 0.5, value: S.w, unit: "kN/m", oninput: (v) => { S.w = v; sim.redraw(); info(); } });
    sl.u0 = HE.slider(gU, { label: "UDL starts at", min: 0, max: 12, step: 0.25, value: S.u0, unit: "m", oninput: (v) => { S.u0 = Math.min(v, S.u1 - 0.5); if (S.u0 !== v) sl.u0.sync(S.u0); sim.redraw(); info(); } });
    sl.u1 = HE.slider(gU, { label: "UDL ends at", min: 0, max: 12, step: 0.25, value: S.u1, unit: "m", oninput: (v) => { S.u1 = Math.max(v, S.u0 + 0.5); if (S.u1 !== v) sl.u1.sync(S.u1); sim.redraw(); info(); } });
    const cv = canvasIn(box, "A beam on a hinge and a roller carrying point loads and a uniformly distributed load, with the reactions drawn.");
    box.append(HE.el("p", { class: "drag-hint" }, "Drag the load arrows, the ends of the UDL band or the two supports along the beam. Use the sliders for exact values."));
    const out = texBox(box);

    const limits = () => {
      Object.keys(sl).forEach((k) => { if (["xa", "xb", "x0", "x1", "u0", "u1"].includes(k) || /^x\d$/.test(k)) sl[k].input.max = S.L; });
      S.xa = Math.min(S.xa, S.L - 1); S.xb = Math.min(S.xb, S.L); S.p.forEach((p) => (p.x = Math.min(p.x, S.L))); S.u0 = Math.min(S.u0, S.L - 0.5); S.u1 = Math.min(S.u1, S.L);
      if (S.xb < S.xa + 1) S.xb = Math.min(S.L, S.xa + 1);
      sync();
    };
    const sync = () => {
      sl.L.sync(S.L); sl.xa.sync(S.xa); sl.xb.sync(S.xb); sl.w.sync(S.w); sl.u0.sync(S.u0); sl.u1.sync(S.u1);
      S.p.forEach((p, i) => { sl["F" + i].sync(p.F); sl["x" + i].sync(p.x); sl["a" + i].sync(p.ang); });
    };
    const setAll = (o) => { Object.assign(S, o); S.p = o.p.map((p) => ({ ...p })); limits(); };
    addPre("Two point loads", () => setAll({ L: 8, xa: 0, xb: 8, p: [{ F: 20, x: 2, ang: 0 }, { F: 30, x: 6, ang: 0 }], w: 0, u0: 3, u1: 8 }));
    addPre("Inclined load", () => setAll({ L: 10, xa: 0, xb: 10, p: [{ F: 50, x: 4, ang: 35 }, { F: 0, x: 6, ang: 0 }], w: 0, u0: 3, u1: 8 }));
    addPre("Part-length UDL", () => setAll({ L: 10, xa: 0, xb: 10, p: [{ F: 18, x: 8, ang: 0 }, { F: 0, x: 6, ang: 0 }], w: 6, u0: 2, u1: 6 }));
    addPre("Overhanging beam", () => setAll({ L: 10, xa: 0, xb: 7, p: [{ F: 20, x: 9, ang: 0 }, { F: 30, x: 3, ang: 0 }], w: 0, u0: 3, u1: 8 }));

    const calc = () => Core.beam({ xa: S.xa, xb: S.xb, loads: S.p.map((p) => ({ x: p.x, F: p.F, ang: p.ang })), udl: { w: S.w, x0: S.u0, x1: S.u1 } });
    let G = { pad: 56, sx: 40, by: 150 };
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? 340 : 360),
      draw(ctx, t, dt, C, Sd) {
        const r = calc();
        const pad = 58, sx = (Sd.w - 2 * pad) / S.L, by = 168;
        G = { pad, sx, by };
        const X = (m) => pad + m * sx;
        // ruler
        const ry = Sd.h - 16;
        line(ctx, X(0), ry, X(S.L), ry, C.ink2, 1.5);
        ctx.save(); ctx.font = font(11); ctx.fillStyle = C.ink2; ctx.textAlign = "center"; ctx.textBaseline = "top";
        for (let m = 0; m <= S.L; m++) { line(ctx, X(m), ry - 4, X(m), ry + 4, C.ink2, 1); if (sx > 28 || m % 2 === 0) ctx.fillText(String(m), X(m), ry + 5); }
        ctx.restore();
        cap(ctx, "m", X(S.L) + 12, ry, { size: 11, col: C.ink2 });
        // ground and supports
        const gy = by + 40;
        ctx.save(); ctx.strokeStyle = C.ink2; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(X(Math.min(S.xa, S.xb)) - 30, gy); ctx.lineTo(X(Math.max(S.xa, S.xb)) + 30, gy); ctx.stroke();
        ctx.lineWidth = 1; for (let x = X(Math.min(S.xa, S.xb)) - 30; x < X(Math.max(S.xa, S.xb)) + 28; x += 9) { ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(x - 6, gy + 7); ctx.stroke(); } ctx.restore();
        // hinge A
        ctx.save(); ctx.fillStyle = C.paper2; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(X(S.xa), by + 8); ctx.lineTo(X(S.xa) - 16, gy); ctx.lineTo(X(S.xa) + 16, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(X(S.xa), by + 8, 4, 0, 7); ctx.fillStyle = C.card; ctx.fill(); ctx.stroke();
        // roller B
        ctx.fillStyle = C.paper2; ctx.beginPath(); ctx.moveTo(X(S.xb), by + 8); ctx.lineTo(X(S.xb) - 16, gy - 9); ctx.lineTo(X(S.xb) + 16, gy - 9); ctx.closePath(); ctx.fill(); ctx.stroke();
        [-9, 9].forEach((d) => { ctx.beginPath(); ctx.arc(X(S.xb) + d, gy - 4.5, 4.5, 0, 7); ctx.fillStyle = C.card; ctx.fill(); ctx.stroke(); });
        ctx.restore();
        cap(ctx, "A", X(S.xa) - 22, by + 30, { bold: true, size: 14 }); cap(ctx, "B", X(S.xb) + 22, by + 30, { bold: true, size: 14 });
        // beam
        ctx.save(); ctx.fillStyle = C.dirt; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillRect(X(0), by - 7, S.L * sx, 14); ctx.strokeRect(X(0), by - 7, S.L * sx, 14); ctx.restore();
        // UDL
        if (r.u) {
          const top = by - 50, x0 = X(r.u.x0), x1 = X(r.u.x1);
          ctx.save(); ctx.fillStyle = C.sea; ctx.globalAlpha = 0.14; ctx.fillRect(x0, top, x1 - x0, 42); ctx.restore();
          line(ctx, x0, top, x1, top, C.sea, 2);
          const nAr = Math.max(2, Math.round((x1 - x0) / 22));
          for (let i = 0; i <= nAr; i++) { const x = x0 + (x1 - x0) * i / nAr; arrow(ctx, x, top, x, by - 9, C.sea, 1.5, 6); }
          [x0, x1].forEach((x) => HE.dot(ctx, x, top, C.sea, 6, C.card));
          cap(ctx, `w = ${N(r.u.w, 1)} kN/m`, (x0 + x1) / 2, top - 11, { align: "center", bold: true, size: 12, col: C.sea, avoid: true });
          // the equivalent single load, dashed, at the middle of the UDL's length
          const xm = X(r.u.xm);
          arrow(ctx, xm, top - 36, xm, by - 9, C.violet, 2.5, 9, [5, 4]);
          cap(ctx, `W = ${N(r.u.W, 2)} kN at ${N(r.u.xm, 2)} m`, xm + 6, top - 30, { size: 11, col: C.violet, bold: true, avoid: true });
        }
        // point loads
        S.p.forEach((p, i) => {
          if (p.F <= 0) return;
          const len = 34 + Math.min(p.F, 60) / 60 * 48, a = p.ang * D2R, dx = Math.sin(a), dy = Math.cos(a);
          const tipX = X(p.x), tipY = by - 8, tailX = tipX - dx * len, tailY = tipY - dy * len;
          arrow(ctx, tailX, tailY, tipX, tipY, C.lode, 4, 12);
          HE.dot(ctx, tailX, tailY, C.lode, 6, C.card);
          cap(ctx, `P${i + 1} = ${N(p.F)} kN${p.ang ? ` at ${Math.abs(p.ang)}° from vertical` : ""}`, tailX, tailY - 12, { align: "center", bold: true, size: 12, col: C.lode, avoid: true });
          if (p.ang) {
            line(ctx, tailX, tailY, tailX, tipY, C.lode, 1.2, [3, 3]); line(ctx, tailX, tipY, tipX, tipY, C.lode, 1.2, [3, 3]);
          }
        });
        // reactions
        const rl = (v) => 26 + Math.min(Math.abs(v), 80) / 80 * 40;
        const ay0 = gy + 12;
        const rv = (x, v, nm) => {
          const L = rl(v), up = v >= 0;
          const col = v >= 0 ? C.grass : C.red;
          if (up) arrow(ctx, x, ay0 + L, x, ay0, col, 4, 12); else arrow(ctx, x, ay0, x, ay0 + L, col, 4, 12);
          cap(ctx, `${nm} = ${N(Math.abs(v), 2)} kN${up ? "" : " (down!)"}`, x, ay0 + L + 12, { align: "center", bold: true, size: 12, col, avoid: true });
        };
        rv(X(S.xa), r.Ay, "A_y"); rv(X(S.xb), r.By, "B");
        if (Math.abs(r.Ax) > 1e-6) {
          const L = 36, dirx = Math.sign(r.Ax);
          const x1 = dirx > 0 ? X(S.xa) - L - 4 : X(S.xa) + L + 4;
          arrow(ctx, x1, by + 26 > gy ? by : by + 0, x1 + dirx * L, by, C.grass, 4, 11);
          cap(ctx, `A_x = ${N(Math.abs(r.Ax), 2)} kN`, dirx > 0 ? X(S.xa) - L - 4 : X(S.xa) + 2, by + 24, { size: 12, bold: true, col: C.grass, avoid: true, align: dirx > 0 ? "left" : "left" });
        }
        cv.setAttribute("aria-label", `Beam ${S.L} metres long. Hinge A at ${S.xa} metres, roller B at ${S.xb} metres. Reactions: A vertical ${r.Ay.toFixed(2)} kilonewtons, A horizontal ${r.Ax.toFixed(2)}, B ${r.By.toFixed(2)} kilonewtons.`);
      },
    });
    HE.drag(cv, sim, () => {
      const h = [];
      const X = (m) => G.pad + m * G.sx;
      S.p.forEach((p, i) => { if (p.F > 0) { const len = 34 + Math.min(p.F, 60) / 60 * 48, a = p.ang * D2R; h.push({ id: "p" + i, x: X(p.x) - Math.sin(a) * len, y: G.by - 8 - Math.cos(a) * len }); } });
      if (S.w > 0) { h.push({ id: "u0", x: X(S.u0), y: G.by - 50 }, { id: "u1", x: X(S.u1), y: G.by - 50 }); }
      h.push({ id: "xa", x: X(S.xa), y: G.by + 24 }, { id: "xb", x: X(S.xb), y: G.by + 24 });
      return h;
    }, (id, x, y) => {
      const m = (px) => Math.round(((px - G.pad) / G.sx) * 4) / 4;
      const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
      if (id[0] === "p") {
        const i = +id[1], p = S.p[i], len = 34 + Math.min(p.F, 60) / 60 * 48;
        p.x = clamp(m(x + Math.sin(p.ang * D2R) * len), 0, S.L); sl["x" + i].sync(p.x);
      } else if (id === "u0") { S.u0 = clamp(m(x), 0, S.u1 - 0.5); sl.u0.sync(S.u0); }
      else if (id === "u1") { S.u1 = clamp(m(x), S.u0 + 0.5, S.L); sl.u1.sync(S.u1); }
      else if (id === "xa") { S.xa = clamp(Math.round(m(x) * 2) / 2, 0, S.xb - 1); sl.xa.sync(S.xa); }
      else if (id === "xb") { S.xb = clamp(Math.round(m(x) * 2) / 2, S.xa + 1, S.L); sl.xb.sync(S.xb); }
      sim.redraw(); info();
    }, 26);

    function info() {
      const r = calc();
      const s = [];
      const d = (v) => F3(v, 4).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
      const inc = r.pts.filter((p) => Math.abs(p.ang) > 0.001);
      let k = 1;
      if (inc.length) {
        s.push(`<p><b>${k++}. Resolve the inclined load first</b> (only the vertical part makes a moment about a point on the beam's own line):<br>` +
          inc.map((p) => `P at ${d(p.x)} m: vertical = ${d(p.F)} cos ${Math.abs(p.ang)}° = <b>${F3(p.fv)} kN</b> ↓, horizontal = ${d(p.F)} sin ${Math.abs(p.ang)}° = <b>${F3(Math.abs(p.fh))} kN</b> ${p.fh >= 0 ? "→" : "←"}`).join("<br>") + `</p>`);
      }
      if (r.u) s.push(`<p><b>${k++}. Replace the UDL by one load:</b> W = w × length = ${d(r.u.w)} × ${d(r.u.len)} = <b>${F3(r.u.W)} kN</b>, acting at the middle of its length, ${d(r.u.xm)} m from the left end (${d(r.u.xm - S.xa)} m from A).</p>`);
      // moments about A
      const cw = [], acw = [];
      r.pts.forEach((p) => { const dd = p.x - S.xa; if (Math.abs(dd) < 1e-9 || p.fv === 0) return; (dd > 0 ? cw : acw).push({ t: `${F3(p.fv)} × ${d(Math.abs(dd))}`, v: p.fv * Math.abs(dd) }); });
      if (r.u) { const dd = r.u.xm - S.xa; if (Math.abs(dd) > 1e-9) (dd > 0 ? cw : acw).push({ t: `${F3(r.u.W)} × ${d(Math.abs(dd))}`, v: r.u.W * Math.abs(dd) }); }
      const sum = (a) => a.reduce((q, e) => q + e.v, 0);
      const tCW = cw.map((e) => e.t).join(" + ") || "0", tACW = acw.map((e) => e.t).join(" + ");
      s.push(`<p><b>${k++}. Moments about A</b> (A_x and A_y pass through A, so they have no moment about it). Clockwise = anticlockwise:<br>` +
        `clockwise: ${tCW} = ${F3(sum(cw))} kN m<br>anticlockwise: B × ${d(r.span)}${tACW ? " + " + tACW : ""} = B × ${d(r.span)}${acw.length ? " + " + F3(sum(acw)) : ""}<br>` +
        `B × ${d(r.span)} = ${F3(sum(cw) - sum(acw))} → <b>B = ${F3(r.By)} kN</b> ${r.By >= 0 ? "↑" : "↓"}</p>`);
      s.push(`<p><b>${k++}. Vertical forces:</b> A<sub>y</sub> + B = total downward load = ${F3(r.sumFv)} → A<sub>y</sub> = ${F3(r.sumFv)} − ${F3(r.By)} = <b>${F3(r.Ay)} kN</b> ${r.Ay >= 0 ? "↑" : "↓"}</p>`);
      s.push(Math.abs(r.sumFh) > 1e-6
        ? `<p><b>${k++}. Horizontal forces:</b> the roller gives none, so the hinge must balance all of them: A<sub>x</sub> = <b>${F3(Math.abs(r.Ax))} kN</b> ${r.Ax >= 0 ? "→" : "←"}</p><p><b>${k++}. Reaction at A</b> has two components, so give its <i>magnitude and direction</i>: R<sub>A</sub> = √(${F3(Math.abs(r.Ax))}² + ${F3(Math.abs(r.Ay))}²) = <b>${F3(r.RA)} kN</b>, at tan⁻¹(${F3(Math.abs(r.Ay))} ÷ ${F3(Math.abs(r.Ax))}) = <b>${F3(Math.atan(Math.abs(r.Ay) / Math.abs(r.Ax)) / D2R)}°</b> ${r.Ay >= 0 ? "above" : "below"} the horizontal, pointing ${r.Ax >= 0 ? "right" : "left"}.</p>`
        : `<p><b>${k++}. Horizontal forces:</b> there is no horizontal load, so A<sub>x</sub> = 0 (a hinge could supply one; the roller could not).</p>`);
      const ok = (v) => (Math.abs(v) < 1e-6 ? '<span class="ok">✔ 0</span>' : `<span class="bad">${F3(v)}</span>`);
      s.push(`<p class="str-check"><b>Equilibrium check</b> (using the answers): ΣF<sub>v</sub> = ${ok(r.chk.fv)} &nbsp; ΣF<sub>h</sub> = ${ok(r.chk.fh)} &nbsp; ΣM about B = ${ok(r.chk.mB)} kN m</p>`);
      if (r.By < -1e-9) s.push(`<p class="bad">B is negative: the loads would lift the roller off its support. A roller can only push up, never pull down, so this beam is not safely supported as drawn.</p>`);
      out.innerHTML = s.join("");
    }
    info();
  });

  /* =====================================================================
     4. Truss simulator: tension / compression colouring, method of joints stepper
     ===================================================================== */
  const LET = "ABCDEFGHIJKLMNOP";
  const TRUSS_PRESETS = {
    warren: {
      name: "Dock bridge (Warren truss)", span: "8 m span, 2 m deep, members at 45°",
      sliders: [{ key: "W", label: "Load on the bridge", min: 0, max: 100, step: 5, def: 50, unit: "kN" }],
      loadNodes: [2, 1, 3], reactionsFirst: true,
      build(v, ln) {
        return { nodes: [{ x: 0, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 0 }, { x: 6, y: 2 }, { x: 8, y: 0 }],
          members: [[0, 1], [1, 2], [2, 3], [3, 4], [1, 3], [0, 2], [2, 4]],
          supports: [{ n: 0, kind: "pin" }, { n: 4, kind: "rollerV" }], loads: [{ n: ln, fx: 0, fy: -v.W }], extras: [], ropes: [] };
      },
      note: "A cart parks on the dock bridge. Pick which joint carries it.",
    },
    pratt: {
      name: "Pratt bridge (4 panels)", span: "12 m span, 3 m deep",
      sliders: [{ key: "W", label: "Load on the bridge", min: 0, max: 120, step: 5, def: 60, unit: "kN" }],
      loadNodes: [2, 1, 3], reactionsFirst: true,
      build(v, ln) {
        const nodes = [], mem = [];
        for (let i = 0; i < 5; i++) nodes.push({ x: 3 * i, y: 0 });
        for (let i = 0; i < 5; i++) nodes.push({ x: 3 * i, y: 3 });
        for (let i = 0; i < 4; i++) { mem.push([i, i + 1]); mem.push([5 + i, 6 + i]); }
        for (let i = 0; i < 5; i++) mem.push([i, 5 + i]);
        mem.push([5, 1], [6, 2], [9, 3], [8, 2]);
        return { nodes, members: mem, supports: [{ n: 0, kind: "pin" }, { n: 4, kind: "rollerV" }], loads: [{ n: ln, fx: 0, fy: -v.W }], extras: [], ropes: [] };
      },
      note: "Pratt layout: the verticals are short struts and the diagonals slope down towards the middle. Look at which are red and which are blue.",
    },
    derrick: {
      name: "Derrick (mast, boom, topping lift, backstay)", span: "mast 4 m, boom to (3, 1), backstay 3-4-5",
      sliders: [{ key: "W", label: "Load hanging from the boom tip C", min: 0, max: 40, step: 1, def: 20, unit: "kN" }],
      loadNodes: [2], reactionsFirst: false,
      build(v) {
        return { nodes: [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: 3, y: 1 }, { x: -3, y: 0 }],
          members: [[0, 1], [0, 2], [1, 2], [1, 3]],
          supports: [{ n: 0, kind: "pin" }, { n: 3, kind: "pin" }], loads: [{ n: 2, fx: 0, fy: -v.W }], extras: [], ropes: [2, 3] };
      },
      note: "A ship's derrick: the topping lift BC and the backstay BD are ropes, so they must come out as tension. The mast AB and boom AC push.",
    },
    mast: {
      name: "Mast and stays (wind on the rig)", span: "mast 4 m, stays to 3 m either side",
      sliders: [
        { key: "H", label: "Wind force on the masthead (+ to the right)", min: -20, max: 20, step: 1, def: 10, unit: "kN" },
        { key: "W", label: "Weight of the rigging above", min: 0, max: 20, step: 1, def: 4, unit: "kN" },
      ],
      loadNodes: [1], reactionsFirst: false,
      build(v) {
        // only the stay on the windward side works; the other one hangs slack
        const right = v.H < 0;
        const nodes = [{ x: 0, y: 0 }, { x: 0, y: 4 }, { x: right ? 3 : -3, y: 0 }];
        return { nodes, members: [[0, 1], [1, 2]], supports: [{ n: 0, kind: "pin" }, { n: 2, kind: "pin" }],
          loads: [{ n: 1, fx: v.H, fy: -v.W }], extras: [{ x1: 0, y1: 4, x2: right ? -3 : 3, y2: 0, label: "slack stay: carries nothing" }], ropes: [1] };
      },
      note: "Wind pushes the mast over, so the stay on the windward side goes taut and the other goes slack. A rope can never be in compression.",
    },
  };

  mount("w-truss", (box) => {
    let key = "warren", vals = {}, ln = 2, stepIdx = -1, showAll = false, showVals = true;
    const presetsRow = HE.el("div", { class: "btn-row", role: "group", "aria-label": "Choose a structure" }, HE.el("span", { class: "seg-label" }, "Structure:"));
    const pbtn = {};
    Object.entries(TRUSS_PRESETS).forEach(([k, p]) => {
      const b = HE.el("button", { class: "btn small", type: "button", "aria-pressed": k === key ? "true" : "false" }, p.name.split(" (")[0]);
      b.addEventListener("click", () => load(k));
      pbtn[k] = b; presetsRow.append(b);
    });
    box.append(presetsRow);
    const slotNote = HE.el("p", { class: "hint" }); box.append(slotNote);
    const ctl = controls(box, "Load");
    const loadSel = HE.el("div", { class: "seg-slot" }); box.append(loadSel);
    const stepRow = HE.el("div", { class: "btn-row" });
    const bBack = HE.el("button", { class: "btn small", type: "button" }, "◀ Back");
    const bNext = HE.el("button", { class: "btn small primary", type: "button" }, "Next joint ▶");
    const bAll = HE.el("button", { class: "btn small", type: "button" }, "Show all forces");
    const bReset = HE.el("button", { class: "btn small", type: "button" }, "↺ Start again");
    const cnt = HE.el("span", { class: "hint", style: "margin:0" });
    stepRow.append(bBack, bNext, bAll, bReset, cnt);
    box.append(stepRow);
    const pair = HE.el("div", { class: "str-pair" }); box.append(pair);
    const cv = HE.el("canvas", { class: "sim", role: "img", "aria-label": "The structure with member forces coloured red for tension and blue for compression." });
    const cv2 = HE.el("canvas", { class: "sim", role: "img", "aria-label": "Free-body diagram of the joint being solved." });
    pair.append(cv, cv2);
    box.append(HE.el("div", { class: "legend" }, HE.el("span", null, HE.el("i", { style: "background:var(--redstone)" }), "tension (T): the member pulls on the joints"), HE.el("span", null, HE.el("i", { style: "background:var(--sea)" }), "compression (C): the member pushes on the joints"), HE.el("span", null, HE.el("i", { style: "background:var(--muted)" }), "not solved yet")));
    const note = HE.el("div", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    const tableBox = HE.el("div", { class: "table-wrap" }); box.append(tableBox);

    let model = null, sol = null, steps = [], names = [], mnames = [];
    function rebuild() {
      const P = TRUSS_PRESETS[key];
      model = P.build(vals, ln);
      names = model.nodes.map((_, i) => LET[i]);
      mnames = model.members.map(([a, b]) => names[a] + names[b]);
      sol = Core.truss(model);
      steps = [];
      if (sol.ok) {
        if (P.reactionsFirst) steps.push({ reactions: true });
        steps.push(...Core.truss.steps(model, sol, P.reactionsFirst));
      }
    }
    function load(k) {
      key = k;
      Object.entries(pbtn).forEach(([kk, b]) => b.setAttribute("aria-pressed", kk === k ? "true" : "false"));
      const P = TRUSS_PRESETS[k];
      vals = {}; P.sliders.forEach((s) => (vals[s.key] = s.def));
      ln = P.loadNodes[0];
      ctl.innerHTML = ""; loadSel.innerHTML = "";
      P.sliders.forEach((s) => HE.slider(ctl, { label: s.label, min: s.min, max: s.max, step: s.step, value: s.def, unit: s.unit, oninput: (v) => { vals[s.key] = v; rebuild(); stepIdx = Math.min(stepIdx, steps.length - 1); redraw(); } }));
      if (P.loadNodes.length > 1) {
        const names0 = P.build(vals, ln).nodes.map((_, i) => LET[i]);
        HE.choice(loadSel, "Load acts at joint:", P.loadNodes.map((n) => [n, names0[n]]).sort((a, b) => a[0] - b[0]), ln, (v) => { ln = v; rebuild(); stepIdx = -1; redraw(); });
      }
      slotNote.textContent = P.name + ": " + P.span + ". " + P.note;
      rebuild(); stepIdx = -1; showAll = false; redraw();
    }
    const solvedMembers = () => {
      const r = new Array(model.members.length).fill(false);
      if (showAll) return r.fill(true);
      if (stepIdx >= 0) { const s = steps.slice(0, stepIdx + 1).filter((x) => !x.reactions).pop(); if (s) s.solvedMAfter.forEach((v, i) => (r[i] = v)); }
      return r;
    };
    const reactionsKnown = () => showAll || (stepIdx >= 0 && (TRUSS_PRESETS[key].reactionsFirst || stepIdx >= steps.length - 1));
    const reactionKnownAt = (n, d) => {
      if (showAll) return true;
      if (stepIdx < 0) return false;
      if (TRUSS_PRESETS[key].reactionsFirst) return true;
      const s = steps.slice(0, stepIdx + 1).filter((x) => !x.reactions).pop();
      return !!(s && s.solvedRAfter[n + d]);
    };
    const natureOf = (T, i) => (Math.abs(T) < 1e-6 ? "zero" : T > 0 ? "T" : "C");
    function redraw() {
      sim.redraw(); sim2.redraw(); table(); status();
    }
    function status() {
      const P = TRUSS_PRESETS[key];
      bBack.disabled = stepIdx < 0; bNext.disabled = !sol.ok || stepIdx >= steps.length - 1 || showAll;
      bBack.hidden = false;
      cnt.textContent = !sol.ok ? "" : showAll ? "All members solved" : stepIdx < 0 ? `Press Next to start (${steps.length} steps)` : `Step ${stepIdx + 1} of ${steps.length}`;
      if (!sol.ok) { note.innerHTML = `<b class="bad">This arrangement cannot be solved:</b> ${sol.reason}.`; return; }
      if (showAll) { note.innerHTML = summary(); return; }
      if (stepIdx < 0) { note.innerHTML = P.reactionsFirst ? "Strategy: find the <b>reactions</b> first (the whole structure is in equilibrium), then take the joints one at a time, starting at a joint with only <b>two</b> unknown members." : "Strategy: start at a joint with only <b>two unknowns</b>, solve it with ΣF<sub>h</sub> = 0 and ΣF<sub>v</sub> = 0, then move to the next joint. Here the reactions turn up as unknowns at the supports."; return; }
      note.innerHTML = explain(steps[stepIdx]);
    }
    const arrowTxt = (fx, fy) => { const p = []; if (Math.abs(fx) > 1e-9) p.push(`${F3(Math.abs(fx))} kN ${fx > 0 ? "→" : "←"}`); if (Math.abs(fy) > 1e-9) p.push(`${F3(Math.abs(fy))} kN ${fy > 0 ? "↑" : "↓"}`); return p.join(", ") || "nothing"; };
    function summary() {
      const mx = sol.T.reduce((m, v, i) => (Math.abs(v) > Math.abs(sol.T[m]) ? i : m), 0);
      return `<b>All forces found.</b> Largest: member ${mnames[mx]} at ${F3(Math.abs(sol.T[mx]))} kN (${sol.T[mx] > 0 ? "tension" : "compression"}). Red members are pulled (tension), blue members are squeezed (compression).` +
        (model.ropes.some((i) => sol.T[i] < -1e-6) ? ` <b class="bad">A rope has come out in compression: in real life that stay would go slack.</b>` : "") +
        (sol.T.some((v) => Math.abs(v) < 1e-6) ? " A member showing 0 is a <b>zero-force member</b>: it carries nothing under this load, but it still stops the frame folding if the load moves." : "");
    }
    function explain(s) {
      const P = TRUSS_PRESETS[key];
      if (s.reactions) {
        const pin = model.supports.find((q) => q.kind === "pin"), rol = model.supports.find((q) => q.kind === "rollerV");
        const xp = model.nodes[pin.n].x, xr = model.nodes[rol.n].x, span = xr - xp;
        const terms = model.loads.map((l) => `${F3(Math.abs(l.fy))} × ${F3(model.nodes[l.n].x - xp)}`).join(" + ");
        const R = sol.R.find((q) => q.n === rol.n).ry, Rp = sol.R.find((q) => q.n === pin.n).ry;
        return `<b>Step ${stepIdx + 1}: reactions on the whole structure.</b> Moments about ${names[pin.n]} (the pin's two components pass through ${names[pin.n]}): clockwise = anticlockwise → ${terms} = ${names[rol.n]} × ${F3(span)} → <b>${names[rol.n]} = ${F3(R)} kN ↑</b>. Vertical forces: ${names[pin.n]}<sub>y</sub> = ${F3(model.loads.reduce((a, l) => a - l.fy, 0))} − ${F3(R)} = <b>${F3(Rp)} kN ↑</b>. No horizontal loads, so ${names[pin.n]}<sub>x</sub> = 0.`;
      }
      const nm = names[s.node];
      const unk = s.cols.map((c) => (c.kind === "m" ? `F<sub>${mnames[c.i]}</sub>` : `${nm}<sub>${c.d}</sub>`)).join(" and ");
      let h = `<b>Step ${stepIdx + 1}: joint ${nm}.</b> Unknowns: ${unk}. Assume every unknown member is in <b>tension</b> (arrow pulling away from the joint); a negative answer then means compression.<br>`;
      const kn = s.known.map((q) => q.what === "load" ? `the load (${arrowTxt(q.fx, q.fy)})` : q.what === "reaction" ? `reaction ${nm}<sub>${q.d}</sub> = ${F3(Math.abs(q.v))} kN ${q.d === "y" ? (q.v >= 0 ? "↑" : "↓") : (q.v >= 0 ? "→" : "←")}` : `member ${mnames[q.i]} (${F3(Math.abs(q.T))} kN ${q.T >= 0 ? "T" : "C"}) which acts on the joint with ${arrowTxt(q.fx, q.fy)}`);
      h += kn.length ? `Known forces on the joint: ${kn.join("; ")}.<br>` : `No loads or known forces act at this joint.<br>`;
      const co = (c, nmf) => `${c >= 0 ? "+" : "−"} ${F3(Math.abs(c))}${nmf}`;
      const eq = (K, f, lab) => `${lab}: ${F3(K)} ${s.cols.map((c) => co(f(c), ` ${c.kind === "m" ? "F" : nm}<sub>${c.kind === "m" ? mnames[c.i] : c.d}</sub>`)).join(" ")} = 0`;
      h += `${eq(s.Kx, (c) => c.cx, "ΣF<sub>h</sub> = 0")}<br>${eq(s.Ky, (c) => c.cy, "ΣF<sub>v</sub> = 0")}<br>`;
      h += "<b>Solve:</b> " + s.cols.map((c) => c.kind === "m" ? `F<sub>${mnames[c.i]}</sub> = ${c.val >= 0 ? "+" : "−"}${F3(Math.abs(c.val))} kN → <b>${Math.abs(c.val) < 1e-6 ? "zero-force member" : c.val > 0 ? "tension (T)" : "compression (C)"}</b>` : `${nm}<sub>${c.d}</sub> = ${F3(Math.abs(c.val))} kN ${c.d === "y" ? (c.val >= 0 ? "↑" : "↓") : (c.val >= 0 ? "→" : "←")}`).join(" &nbsp;|&nbsp; ");
      if (s.cols.some((c) => c.kind === "m" && model.ropes.includes(c.i) && c.val < -1e-6)) h += `<br><b class="bad">A rope in compression: it would go slack. This stay cannot work with this load.</b>`;
      if (!s.cols.length) h += `Everything here is already known: the joint just <b>checks</b> (residual ${F3(Math.hypot(...s.residual))} kN).`;
      return h;
    }
    function table() {
      if (!sol.ok) { tableBox.innerHTML = ""; return; }
      const sm = solvedMembers();
      let h = `<table class="nature-table"><caption>Size and nature of every member force (kN)</caption><thead><tr><th>Member</th><th>Size (kN)</th><th>Nature</th></tr></thead><tbody>`;
      model.members.forEach((_, i) => {
        const T = sol.T[i], k = natureOf(T, i);
        if (!sm[i]) h += `<tr><td>${mnames[i]}</td><td class="num">?</td><td>—</td></tr>`;
        else h += `<tr><td>${mnames[i]}</td><td class="num">${F3(Math.abs(T))}</td><td class="${k === "T" ? "bad" : k === "C" ? "str-c" : ""}"><b>${k === "T" ? "Tension (T)" : k === "C" ? "Compression (C)" : "zero-force"}</b></td></tr>`;
      });
      tableBox.innerHTML = h + "</tbody></table>";
    }
    /* ---- drawing ---- */
    const bbox = () => {
      const pts = model.nodes.map((n) => [n.x, n.y]).concat(model.extras.map((e) => [e.x2, e.y2]));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    };
    const mapper = (S, bb, padX, padT, padB) => {
      const bw = Math.max(bb.x1 - bb.x0, 1), bh = Math.max(bb.y1 - bb.y0, 1);
      const k = Math.min((S.w - 2 * padX) / bw, (S.h - padT - padB) / bh, 60);
      const ox = (S.w - bw * k) / 2 - bb.x0 * k, oy = padT + (S.h - padT - padB - bh * k) / 2 + bb.y1 * k;
      return { k, X: (x) => ox + x * k, Y: (y) => oy - y * k };
    };
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? 330 : 300),
      draw(ctx, t, dt, C, S) {
        if (!model) return;
        const bb = bbox(), M = mapper(S, bb, 52, 56, 70);
        const sm = solvedMembers();
        const Fmax = Math.max(1e-9, ...sol.T.map((v) => Math.abs(v)));
        const curNode = !showAll && stepIdx >= 0 && steps[stepIdx] && !steps[stepIdx].reactions ? steps[stepIdx].node : -1;
        // supports
        model.supports.forEach((s) => {
          const x = M.X(model.nodes[s.n].x), y = M.Y(model.nodes[s.n].y);
          ctx.save(); ctx.fillStyle = C.paper2; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(x, y + 4); ctx.lineTo(x - 15, y + 28); ctx.lineTo(x + 15, y + 28); ctx.closePath(); ctx.fill(); ctx.stroke();
          if (s.kind === "rollerV") { [-8, 8].forEach((d) => { ctx.beginPath(); ctx.arc(x + d, y + 33, 4.5, 0, 7); ctx.fillStyle = C.card; ctx.fill(); ctx.stroke(); }); }
          ctx.restore();
          line(ctx, x - 26, y + (s.kind === "rollerV" ? 38 : 29), x + 26, y + (s.kind === "rollerV" ? 38 : 29), C.ink2, 2);
        });
        // slack stays / extras
        model.extras.forEach((e) => {
          line(ctx, M.X(e.x1), M.Y(e.y1), M.X(e.x2), M.Y(e.y2), C.muted, 2, [4, 6]);
          cap(ctx, e.label, M.X(e.x2) + (e.x2 > 0 ? -4 : 4), M.Y(e.y2) - 18, { size: 11, col: C.muted, align: e.x2 > 0 ? "right" : "left", avoid: true });
        });
        // members
        model.members.forEach(([a, b], i) => {
          const x1 = M.X(model.nodes[a].x), y1 = M.Y(model.nodes[a].y), x2 = M.X(model.nodes[b].x), y2 = M.Y(model.nodes[b].y);
          const T = sol.ok ? sol.T[i] : 0, known = sm[i] && sol.ok;
          const col = !known ? C.muted : Math.abs(T) < 1e-6 ? C.muted : T > 0 ? C.red : C.sea;
          const w = known ? 3 + 7 * Math.abs(T) / Fmax : 3;
          const rope = model.ropes.includes(i);
          line(ctx, x1, y1, x2, y2, col, w, !known ? [6, 5] : rope ? [1, 0] : undefined);
          if (known && showVals) {
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
            const sgn = ny > 0 || (ny === 0 && nx > 0) ? 1 : -1;
            cap(ctx, Math.abs(T) < 1e-6 ? "0" : `${F3(Math.abs(T))} ${T > 0 ? "T" : "C"}`, mx + nx * sgn * 16, my + ny * sgn * 14, { size: 12, bold: true, col, align: "center", avoid: true });
          }
        });
        // nodes
        model.nodes.forEach((n, i) => {
          const x = M.X(n.x), y = M.Y(n.y);
          if (i === curNode) { ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 14, 0, 7); ctx.stroke(); ctx.restore(); }
          HE.dot(ctx, x, y, C.ink, 6, C.card);
          cap(ctx, names[i], x - 11, y - (n.y >= (bb.y0 + bb.y1) / 2 && bb.y1 > bb.y0 ? 12 : -14) - (i === curNode ? 4 : 0), { bold: true, size: 14, align: "center", avoid: true });
        });
        // loads
        model.loads.forEach((l) => {
          const x = M.X(model.nodes[l.n].x), y = M.Y(model.nodes[l.n].y), mag = Math.hypot(l.fx, l.fy);
          if (mag < 1e-9) return;
          const len = 30 + Math.min(mag / 120, 1) * 36, ux = l.fx / mag, uy = -l.fy / mag;
          arrow(ctx, x - ux * len, y - uy * len, x - ux * 8, y - uy * 8, C.ink, 4, 12);
          cap(ctx, `${F3(mag)} kN`, x - ux * len, y - uy * len - (uy > 0.5 ? -12 : 12), { size: 12, bold: true, align: "center", avoid: true });
        });
        // reactions (green) once known
        sol.ok && sol.R.forEach((r) => {
          const x = M.X(model.nodes[r.n].x), y = M.Y(model.nodes[r.n].y);
          if (r.hasY && reactionKnownAt(r.n, "y") && Math.abs(r.ry) > 1e-9) {
            const up = r.ry > 0, L = 30 + Math.min(Math.abs(r.ry) / 80, 1) * 22;
            if (up) arrow(ctx, x, y + 74 + 0, x, y + 42, C.grass, 3.5, 11); else arrow(ctx, x, y + 42, x, y + 74, C.grass, 3.5, 11);
            cap(ctx, `${names[r.n]}ʸ ${F3(Math.abs(r.ry))}`, x + 18, y + 62, { size: 11, bold: true, col: C.grass, avoid: true });
          }
          if (r.hasX && reactionKnownAt(r.n, "x") && Math.abs(r.rx) > 1e-9) {
            const d = Math.sign(r.rx), L = 36;
            arrow(ctx, x - d * (L + 10), y - 10, x - d * 10, y - 10, C.grass, 3.5, 11);
            cap(ctx, `${names[r.n]}ˣ ${F3(Math.abs(r.rx))}`, x - d * (L + 10), y - 24, { size: 11, bold: true, col: C.grass, align: d > 0 ? "right" : "left", avoid: true });
          }
        });
        cv.setAttribute("aria-label", `${TRUSS_PRESETS[key].name}. ` + (sol.ok ? model.members.map((_, i) => sm[i] ? `${mnames[i]} ${F3(Math.abs(sol.T[i]))} kilonewtons ${Math.abs(sol.T[i]) < 1e-6 ? "zero force" : sol.T[i] > 0 ? "tension" : "compression"}` : null).filter(Boolean).join(", ") || "No member solved yet." : "Cannot be solved."));
      },
    });
    const sim2 = HE.sim(cv2, {
      height: () => 300,
      draw(ctx, t, dt, C, S) {
        if (!model) return;
        const s = !showAll && stepIdx >= 0 ? steps[stepIdx] : null;
        ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(3, 3, S.w - 6, S.h - 6); ctx.restore();
        if (!s || s.reactions) {
          cap(ctx, s && s.reactions ? "Reactions: whole structure" : "Free-body diagram", S.w / 2, S.h / 2 - 10, { align: "center", bold: true, size: 13 });
          cap(ctx, s && s.reactions ? "see the main diagram" : showAll ? "(press Start again to step through)" : "of the current joint", S.w / 2, S.h / 2 + 12, { align: "center", size: 12, col: C.muted });
          return;
        }
        const cx = S.w / 2, cy = S.h / 2 + 8, R = Math.min(S.w, S.h) / 2 - 56;
        cap(ctx, `Free-body diagram of joint ${names[s.node]}`, 12, 17, { bold: true, size: 12 });
        // faint axes
        line(ctx, cx - R - 20, cy, cx + R + 20, cy, C.line, 1, [3, 4]); line(ctx, cx, cy - R - 20, cx, cy + R + 20, C.line, 1, [3, 4]);
        const Lm = R * 0.95;
        s.mem.forEach((q) => {
          const T = sol.T[q.i], ux = q.dir[0], uy = -q.dir[1];
          const col = Math.abs(T) < 1e-6 ? C.muted : T > 0 ? C.red : C.sea;
          // member drawn as a thin grey bar
          line(ctx, cx, cy, cx + ux * (Lm + 18), cy + uy * (Lm + 18), C.line, 6);
          if (Math.abs(T) < 1e-6) { cap(ctx, `${mnames[q.i]} = 0`, cx + ux * (Lm * 0.6), cy + uy * (Lm * 0.6) - 12, { size: 12, col: C.muted, align: "center", avoid: true }); return; }
          // tension: arrow points away from the joint. compression: arrow points towards the joint.
          if (T > 0) arrow(ctx, cx + ux * 10, cy + uy * 10, cx + ux * Lm, cy + uy * Lm, col, 4, 12);
          else arrow(ctx, cx + ux * Lm, cy + uy * Lm, cx + ux * 10, cy + uy * 10, col, 4, 12);
          cap(ctx, `${mnames[q.i]}  ${F3(Math.abs(T))} kN ${T > 0 ? "T" : "C"}`, cx + ux * (Lm + 8), cy + uy * (Lm + 8), { size: 12, bold: true, col, align: ux >= 0 ? "left" : "right", avoid: true, tries: [[0, 0], [0, -14], [0, 14], [ux >= 0 ? -30 : 30, -16]] });
        });
        s.loads.forEach((l) => {
          const mag = Math.hypot(l.fx, l.fy); if (mag < 1e-9) return;
          const ux = l.fx / mag, uy = -l.fy / mag;
          arrow(ctx, cx - ux * Lm, cy - uy * Lm, cx - ux * 10, cy - uy * 10, C.ink, 4, 12);
          cap(ctx, `load ${F3(mag)} kN`, cx - ux * Lm, cy - uy * Lm + (uy > 0.5 ? -12 : -12), { size: 12, bold: true, align: "center", avoid: true });
        });
        s.cols.filter((c) => c.kind === "r").forEach((c) => {
          const v = c.val; if (Math.abs(v) < 1e-9) return;
          if (c.d === "y") { arrow(ctx, cx, cy + (v > 0 ? 1 : -1) * Lm, cx, cy + (v > 0 ? 1 : -1) * 10, C.grass, 4, 12); cap(ctx, `${names[s.node]}ʸ ${F3(Math.abs(v))} kN`, cx + 8, cy + (v > 0 ? 1 : -1) * (Lm - 6), { size: 12, bold: true, col: C.grass, avoid: true }); }
          else { arrow(ctx, cx - Math.sign(v) * Lm, cy, cx - Math.sign(v) * 10, cy, C.grass, 4, 12); cap(ctx, `${names[s.node]}ˣ ${F3(Math.abs(v))} kN`, cx - Math.sign(v) * Lm, cy - 14, { size: 12, bold: true, col: C.grass, align: "center", avoid: true }); }
        });
        HE.dot(ctx, cx, cy, C.ink, 8, C.card);
        cap(ctx, names[s.node], cx + 12, cy + 18, { bold: true, size: 14 });
        cap(ctx, "tension: arrow away from the joint", 12, S.h - 30, { size: 11, col: C.red, bold: true });
        cap(ctx, "compression: arrow towards the joint", 12, S.h - 14, { size: 11, col: C.sea, bold: true });
        cv2.setAttribute("aria-label", `Free-body diagram of joint ${names[s.node]}: ` + s.mem.map((q) => `member ${mnames[q.i]} ${F3(Math.abs(sol.T[q.i]))} kilonewtons ${sol.T[q.i] > 1e-6 ? "tension" : sol.T[q.i] < -1e-6 ? "compression" : "zero"}`).join(", "));
      },
    });
    bNext.addEventListener("click", () => { if (stepIdx < steps.length - 1) stepIdx++; redraw(); });
    bBack.addEventListener("click", () => { showAll = false; if (stepIdx >= 0) stepIdx--; redraw(); });
    bAll.addEventListener("click", () => { showAll = true; redraw(); });
    bReset.addEventListener("click", () => { showAll = false; stepIdx = -1; redraw(); });
    load("warren");
  });

  /* =====================================================================
     5. The tensile test machine (flagship animation)
        E, yield and ultimate tensile stress are Data Booklet values; the strain at which
        each specimen necks and snaps, and the exact shape of the curve, are schematic.
     ===================================================================== */
  const MATS = {
    mild: { name: "Mild steel", E: 196, yld: 220, uts: 430, kind: "plateau", eu: 0.16, ef: 0.22, sf: 0.75, zoom: 0.005, ductile: true },
    alu: { name: "Aluminium alloy", E: 70, yld: 250, uts: 300, kind: "smooth", eu: 0.08, ef: 0.12, sf: 0.85, zoom: 0.008, ductile: true },
    ti: { name: "Titanium alloy", E: 110, yld: 950, uts: 1000, kind: "smooth", eu: 0.07, ef: 0.1, sf: 0.85, zoom: 0.015, ductile: true },
    ci: { name: "Cast iron", E: 120, yld: null, uts: 140, kind: "brittle", ef: 0.0014, zoom: 0.0015, ductile: false },
  };
  const L0 = 50, D0 = 10, A0 = Math.PI * D0 * D0 / 4; // gauge length mm, diameter mm, area mm2 (test piece)
  function prepMat(m) {
    if (m.env) return m;
    const E = m.E * 1000; // N/mm2
    if (m.kind === "plateau") {
      m.sLoP = 0.92 * m.yld; m.Ep = m.sLoP / E; m.Ey = m.yld / E; m.E1 = m.Ey + 0.015;
      m.env = (e) => {
        if (e <= m.Ep) return E * e;
        if (e <= m.Ey) return m.sLoP + (m.yld - m.sLoP) * Math.pow((e - m.Ep) / (m.Ey - m.Ep), 0.6);
        if (e <= m.E1) return m.yld;
        if (e <= m.eu) { const s = (e - m.E1) / (m.eu - m.E1); return m.yld + (m.uts - m.yld) * (1 - (1 - s) * (1 - s)); }
        const s = (e - m.eu) / (m.ef - m.eu); return m.uts - (m.uts - m.sf * m.uts) * s * s;
      };
      m.stages = [[0, m.Ey, 3], [m.Ey, m.E1, 1.8], [m.E1, m.eu, 3.2], [m.eu, m.ef, 2.6]];
      m.eY = m.Ey;
    } else if (m.kind === "smooth") {
      m.sLoP = 0.8 * m.yld; m.Ep = m.sLoP / E; m.eY = m.yld / E + 0.002; // 0.2 % proof stress
      const shape = (k, e) => (1 - Math.exp(-k * (e - m.Ep))) / (1 - Math.exp(-k * (m.eu - m.Ep)));
      let lo = 1, hi = 4000;
      for (let i = 0; i < 80; i++) { const k = (lo + hi) / 2; const v = m.sLoP + (m.uts - m.sLoP) * shape(k, m.eY); if (v > m.yld) lo = k; else hi = k; }
      m.k = (lo + hi) / 2;
      m.env = (e) => {
        if (e <= m.Ep) return E * e;
        if (e <= m.eu) return m.sLoP + (m.uts - m.sLoP) * shape(m.k, e);
        const s = (e - m.eu) / (m.ef - m.eu); return m.uts - (m.uts - m.sf * m.uts) * s * s;
      };
      m.stages = [[0, m.eY, 3], [m.eY, m.eu, 3.4], [m.eu, m.ef, 2.6]];
    } else {
      m.c = (E * m.ef - m.uts) / (m.ef * m.ef); m.sLoP = null; m.Ep = null; m.eY = null; m.sf = 1;
      m.env = (e) => E * e - m.c * e * e;
      m.stages = [[0, m.ef, 4]];
    }
    // the elastic limit: the stress below which unloading retraces the loading line
    m.sEL = m.kind === "plateau" ? 0.96 * m.yld : m.kind === "smooth" ? 0.9 * m.yld : m.uts;
    const bis = (f, a, b) => { for (let i = 0; i < 60; i++) { const c = (a + b) / 2; if (f(c) > 0) b = c; else a = c; } return (a + b) / 2; };
    m.eEL = m.kind === "brittle" ? m.ef : bis((e) => m.env(e) - m.sEL, 0, m.kind === "plateau" ? m.Ey : m.eY);
    m.sf_ = m.env(m.ef);
    m.tTot = m.stages.reduce((a, s) => a + s[2], 0);
    m.eOfT = (t) => { let a = 0; for (const [e0, e1, d] of m.stages) { if (t <= a + d) return e0 + (e1 - e0) * (t - a) / d; a += d; } return m.ef; };
    m.tOfE = (e) => { let a = 0; for (const [e0, e1, d] of m.stages) { if (e <= e1) return a + d * (e - e0) / (e1 - e0); a += d; } return a; };
    m.keys = m.kind === "brittle"
      ? [{ id: "F", short: "F", name: "Fracture", e: m.ef, txt: `Fracture: with no warning the specimen snaps at ${m.uts} N/mm² (mid-range of the Data Booklet's 120 to 160). Brittle: there is no yield and no necking, so the ultimate tensile stress is also the breaking stress.` }]
      : [
        { id: "LoP", short: "LoP", name: "Limit of proportionality", e: m.Ep, txt: `Limit of proportionality: up to here stress ∝ strain (Hooke's law) and the graph is straight. Its gradient is Young's modulus E = ${m.E} kN/mm². (Drawn just below yield: the Data Booklet gives only yield and ultimate values.)` },
        { id: "EL", short: "EL", name: "Elastic limit", e: m.eEL, txt: `Elastic limit: unload from anywhere below this and the specimen returns exactly to its original length. Beyond it, some of the stretch is permanent. It is very close to the limit of proportionality in metals.` },
        { id: "Y", short: "Y", name: m.kind === "plateau" ? "Yield point" : "Yield (0.2 % proof stress)", e: m.eY, txt: m.kind === "plateau" ? `Yield point: ${m.yld} N/mm². The steel suddenly stretches a long way with almost no extra load: layers of atoms are sliding past each other. This is plastic deformation.` : `Yield: ${m.yld} N/mm². This alloy has no sudden yield, so engineers define it as the 0.2 % proof stress: where a line parallel to the elastic part, starting at 0.2 % strain, meets the curve.` },
        { id: "UTS", short: "UTS", name: "Ultimate tensile strength", e: m.eu, txt: `Ultimate tensile strength: ${m.uts} N/mm², the highest stress the material ever reaches. The test piece is now at its maximum load, and a neck is about to form.` },
        { id: "F", short: "F", name: "Fracture", e: m.ef, txt: `Fracture: the neck has thinned so much that the specimen snaps. The stress on the graph is falling because it is calculated with the ORIGINAL area; the real stress in the neck is rising.` },
      ];
    return m;
  }

  mount("w-tensile", (box) => {
    let M = prepMat(MATS.mild), zoom = false, graph = "ss", speed = 1, ghost = true;
    const st = { mode: "load", running: false, t: 0, e: 0, s: 0, hist: [], e0: 0, s0: 0, ep: 0, tb: 0, parts: [], target: null, hover: null, msg: "" };
    const matChoice = HE.choice(box, "Material:", Object.entries(MATS).map(([k, m]) => [k, m.name]), "mild", (v) => { M = prepMat(MATS[v]); reset(); buildKeys(); });
    const row1 = HE.el("div", { class: "btn-row" });
    const bRun = HE.el("button", { class: "btn small primary", type: "button" }, "▶ Run the test");
    const bUn = HE.el("button", { class: "btn small", type: "button" }, "Unload now");
    const bRe = HE.el("button", { class: "btn small", type: "button" }, "Reload");
    const bRs = HE.el("button", { class: "btn small", type: "button" }, "↺ New specimen");
    row1.append(bRun, bUn, bRe, bRs); box.append(row1);
    const keyRow = HE.el("div", { class: "btn-row", role: "group", "aria-label": "Jump to a key point on the curve" }, HE.el("span", { class: "seg-label" }, "Go to:"));
    box.append(keyRow);
    const opts = HE.el("div", { class: "str-opts" }); box.append(opts);
    HE.choice(opts, "Graph:", [["ss", "stress–strain"], ["le", "load–extension"]], "ss", (v) => { graph = v; sim.redraw(); });
    HE.choice(opts, "View:", [["full", "whole test"], ["zoom", "zoom on the elastic part"]], "full", (v) => { zoom = v === "zoom"; sim.redraw(); });
    HE.choice(opts, "Full curve ghost:", [["on", "shown"], ["off", "hidden"]], "on", (v) => { ghost = v === "on"; sim.redraw(); });
    const ctl = controls(box, "Test speed");
    HE.slider(ctl, { label: "Test speed", min: 0.5, max: 2.5, step: 0.25, value: 1, unit: "×", oninput: (v) => (speed = v) });
    const cv = canvasIn(box, "A tensile test machine stretching a test piece, with the stress–strain graph traced live below it.");
    box.append(HE.el("p", { class: "drag-hint" }, "Hover over (or tap) a marker on the curve for its meaning. In the zoomed view the picture of the specimen is exaggerated so you can see the elastic stretch."));
    const readouts = HE.el("div", { class: "readouts", "aria-live": "off" }); box.append(readouts);
    const ro = {};
    [["s", "stress σ (N/mm²)"], ["e", "strain ε"], ["F", "load F (kN)"], ["x", "extension x (mm)"], ["perm", "permanent set (strain)"]].forEach(([k, lab]) => { const b = HE.el("b"); ro[k] = b; readouts.append(HE.el("div", null, b, HE.el("span", null, lab))); });
    const note = HE.el("div", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    const setNote = (txt) => { if (note._t !== txt) { note._t = txt; note.textContent = txt; } };
    box.append(HE.el("p", { class: "hint" }, `Test piece: round bar, diameter ${D0} mm (area ${HE.fmt(A0, 3)} mm²), gauge length ${L0} mm. Young's modulus, yield stress and ultimate tensile stress are Data Booklet values. The strains at which the specimen necks and snaps, and the exact shape of the curve, are schematic. Cast iron's ultimate tensile stress is the middle of the booklet's range.`));

    function buildKeys() {
      [...keyRow.querySelectorAll("button")].forEach((b) => b.remove());
      M.keys.forEach((k) => {
        const b = HE.el("button", { class: "btn small", type: "button", title: k.name }, k.short);
        b.setAttribute("aria-label", "Go to " + k.name);
        b.addEventListener("click", () => goTo(k));
        keyRow.append(b);
      });
    }
    const A_ = (m) => m.E * 1000;
    function sample(e1) { // history of the loading curve up to e1
      st.hist = [];
      const n = 160;
      for (let i = 0; i <= n; i++) { const e = e1 * i / n; st.hist.push({ e, s: M.env(e), ph: "load" }); }
    }
    function reset() {
      st.mode = "load"; st.running = false; st.t = 0; st.e = 0; st.s = 0; st.hist = [{ e: 0, s: 0, ph: "load" }]; st.ep = 0; st.tb = 0; st.parts = []; st.target = null;
      sim.pause(); matSync(); update(); sim.redraw();
    }
    function matSync() { bRun.textContent = HE.reduced ? "Next key point ▶" : "▶ Run the test"; }
    function goTo(k) {
      if (st.mode === "broken") reset();
      st.mode = "load"; st.running = false; sim.pause();
      st.e = k.e; st.s = M.env(k.e); st.t = M.tOfE(k.e); sample(k.e);
      if (k.id === "F") breakNow(true);
      update(); sim.redraw();
    }
    function breakNow(instant) {
      st.mode = "broken"; st.e0 = M.ef; st.s0 = M.env(M.ef); st.ep = M.ef - st.s0 / A_(M);
      st.tb = 0; st.running = false;
      if (M.ductile) st.ep = Math.max(0, M.ef - st.s0 / A_(M));
      else st.ep = 0;
      if (instant) { st.s = 0; st.e = st.ep; st.hist.push({ e: M.ef, s: st.s0, ph: "load" }, { e: st.ep, s: 0, ph: "un" }); st.parts = []; st.tb = 2; }
      else { st.hist.push({ e: M.ef, s: st.s0, ph: "load" }); spark(); }
    }
    function spark() { st.parts = []; for (let i = 0; i < 14; i++) st.parts.push({ x: 0, y: 0, vx: (Math.random() - 0.3) * 160, vy: -Math.random() * 120 - 20, life: 0.6 + Math.random() * 0.6 }); }
    const busy = () => st.running || (st.mode === "broken" && (st.tb < 1.6 || st.s > 0));
    function stepSim(dt) {
      if (HE.reduced) return;
      if (st.mode === "load" && st.running) {
        st.t += dt * speed; st.e = M.eOfT(st.t); st.s = M.env(st.e);
        const zlim = zoom ? M.zoom : Infinity;
        if (st.t >= M.tTot - 1e-6) { st.e = M.ef; st.s = M.env(M.ef); st.hist.push({ e: st.e, s: st.s, ph: "load" }); breakNow(false); return; }
        st.hist.push({ e: st.e, s: st.s, ph: "load" });
        if (st.target != null && st.e >= st.target) { st.running = false; st.target = null; }
        if (zoom && st.e >= zlim) { st.running = false; st.msg = "The zoomed window ends here. Switch to the whole test to carry on."; }
      } else if (st.mode === "unload" && st.running) {
        const rate = Math.max(st.s0, 1) / 2.4;
        st.s = Math.max(0, st.s - rate * dt * speed);
        st.e = st.s0 <= M.sEL ? invEnv(st.s) : st.e0 - (st.s0 - st.s) / A_(M);
        st.hist.push({ e: st.e, s: st.s, ph: "un" });
        if (st.s <= 0) { st.running = false; st.ep = st.e; }
      } else if (st.mode === "reload" && st.running) {
        const rate = Math.max(st.s0, 1) / 2.4;
        st.s = Math.min(st.s0, st.s + rate * dt * speed);
        st.e = st.s0 <= M.sEL ? invEnv(st.s) : st.e0 - (st.s0 - st.s) / A_(M);
        st.hist.push({ e: st.e, s: st.s, ph: "re" });
        if (st.s >= st.s0 - 1e-9) { st.mode = "load"; st.e = st.e0; st.s = st.s0; st.t = M.tOfE(st.e0); }
      } else if (st.mode === "broken") {
        st.tb += dt;
        if (st.s > 0) { const rate = st.s0 / 0.5; st.s = Math.max(0, st.s - rate * dt); st.e = st.e0 - (st.s0 - st.s) / A_(M); st.hist.push({ e: st.e, s: st.s, ph: "un" }); if (!M.ductile) { st.s = 0; st.e = 0; } }
        st.parts.forEach((p) => { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; });
      }
      if (!busy()) setTimeout(() => { if (!busy()) sim.pause(); update(); }, 0);
      update();
    }
    const invEnv = (s) => { let a = 0, b = M.kind === "plateau" ? M.Ey : M.eY || M.ef; if (M.kind === "brittle") b = M.ef; for (let i = 0; i < 50; i++) { const c = (a + b) / 2; if (M.env(c) > s) b = c; else a = c; } return (a + b) / 2; };
    function stateText() {
      const s = st.s, e = st.e;
      if (st.mode === "broken") return M.ductile ? `Snapped. The stress fell along a line parallel to the elastic part as the load was removed, leaving a permanent strain of ${HE.fmt(st.ep, 3)}: the two halves no longer fit back to their old length. Look for the cup and cone ends.` : "Snapped cleanly, almost without stretching: brittle fracture. The two halves fit back together almost perfectly (permanent strain is about zero), and there is no neck.";
      if (st.mode === "unload" || st.mode === "reload") return st.s0 <= M.sEL ? "Unloading from the elastic region: the graph retraces its own line back to the origin. No permanent set: the specimen springs back to its original length." : st.running || st.s > 0 ? `Unloading from beyond the elastic limit: the stress falls along a line parallel to the elastic part, so the specimen does NOT return to zero. The permanent set (plastic strain) is ${HE.fmt(st.e0 - st.s0 / A_(M), 3)}.` : `Fully unloaded. A permanent set of ${HE.fmt(st.ep, 3)} remains. Press Reload to load it again: it goes back up the same line and rejoins the curve.`;
      if (e === 0) return "The specimen is unloaded. Press Run, or jump straight to a key point.";
      if (M.kind === "brittle") return "Brittle: the graph is nearly straight and ends suddenly. No yield, no necking, very little plastic strain.";
      if (e < M.Ep) return "Elastic region: stress is proportional to strain, the graph is a straight line, and if you unload the specimen springs straight back.";
      if (e < M.eEL) return "Past the limit of proportionality: the graph is starting to curve, but the specimen would still spring back if unloaded.";
      if (e < M.eY) return "Past the elastic limit: some of the stretch is now permanent (plastic).";
      if (M.kind === "plateau" && e < M.E1) return "Yielding: the metal stretches with no extra load. Plastic deformation: layers of atoms slip.";
      if (e < M.eu) return M.kind === "plateau" ? "Strain hardening: the more it is stretched, the more load it takes to stretch it further." : "Plastic region: the metal keeps stretching, needing more and more stress.";
      return "Necking: the test piece narrows at one point, so the load it can carry falls. Engineering stress (load ÷ original area) therefore drops towards fracture.";
    }
    function update() {
      ro.s.textContent = HE.fmt(st.s, 3); ro.e.textContent = st.e < 1e-4 && st.e > 0 ? HE.fmt(st.e, 3, true) : HE.fmt(st.e, 3);
      ro.F.textContent = HE.fmt(st.s * A0 / 1000, 3); ro.x.textContent = HE.fmt(st.e * L0, 3);
      const perm = st.mode === "broken" || ((st.mode === "unload" || st.mode === "reload") && !st.running && st.s <= 0) ? st.ep : (st.mode === "unload" ? Math.max(0, st.e0 - st.s0 / A_(M)) : 0);
      ro.perm.textContent = HE.fmt(perm, 3);
      setNote(st.hover ? st.hover.txt : st.msg ? st.msg : stateText());
      bRun.disabled = st.mode === "broken" || st.mode === "unload" || st.mode === "reload";
      if (!HE.reduced) bRun.textContent = st.running && st.mode === "load" ? "❚❚ Pause" : st.e > 0 && st.mode === "load" ? "▶ Resume" : "▶ Run the test";
      bUn.disabled = !(st.mode === "load" && st.s > 0) ;
      bRe.disabled = !(st.mode === "unload" && !st.running && st.s <= 0 && st.e0 > 0);
      bRun.setAttribute("aria-pressed", st.running ? "true" : "false");
    }
    /* ---- drawing ---- */
    let PX = null, Pbox = null, keyPos = [];
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? 440 : 470),
      draw(ctx, t, dt, C, S) {
        stepSim(dt);
        const E = A_(M);
        // ---------- the specimen
        const cy = 62, h0 = 24;
        const x1v = zoom ? M.zoom : M.ef * 1.08;
        const K = zoom ? 0.12 / M.zoom : 1;
        const ed = (e) => (zoom ? Math.min(e * K, 0.12 + (e - M.zoom) * 0.5) : e);
        const Lg = Math.max(110, (S.w - 160) / 1.26), gx0 = 70;
        const edNow = st.mode === "broken" ? ed(st.e0) : ed(st.e);
        const gx1 = gx0 + Lg * (1 + edNow);
        const mid = (gx0 + gx1) / 2;
        const eN = st.mode === "broken" || st.mode === "unload" || st.mode === "reload" ? st.e0 : st.e;
        const neckNow = !M.ductile ? 0 : Math.max(0, Math.min(1, (eN - M.eu) / (M.ef - M.eu))) * 0.6;
        const hw = (x) => {
          const c = (h0 / 2) * (1 - 0.3 * Math.min(edNow, 0.3));
          const dx = (x - mid) / (0.11 * Lg);
          return c * (1 - neckNow * Math.exp(-dx * dx));
        };
        const steel = C.muted;
        const piece = (xa, xb, tipL, tipR) => {
          // outline from xa to xb along the gauge; tips: "cone"/"cup"/null at each end
          const pts = [];
          const n = 50;
          for (let i = 0; i <= n; i++) { const x = xa + (xb - xa) * i / n; pts.push([x, cy - hw(x)]); }
          for (let i = n; i >= 0; i--) { const x = xa + (xb - xa) * i / n; pts.push([x, cy + hw(x)]); }
          return pts;
        };
        ctx.save();
        // grips
        ctx.fillStyle = C.ink2; ctx.fillRect(14, cy - 30, 30, 60);
        const shift = st.mode === "broken" ? Math.min(24, st.tb * 90) : 0;
        const rg = gx1 + 26 + shift;
        ctx.fillRect(rg, cy - 30, 30, 60);
        ctx.fillStyle = steel; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.lineJoin = "round";
        const shoulderL = [[44, cy - 22], [gx0, cy - h0 / 2], [gx0, cy + h0 / 2], [44, cy + 22]];
        ctx.beginPath(); shoulderL.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
        const shoulderR = (off) => { ctx.beginPath(); [[gx1 + off, cy - h0 / 2], [rg, cy - 22], [rg, cy + 22], [gx1 + off, cy + h0 / 2]].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke(); };
        if (st.mode !== "broken") {
          const p = piece(gx0, gx1);
          ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
          shoulderR(0);
        } else {
          const gap = shift;
          const tipH = M.ductile ? 0.3 : 1;
          const left = [], right = [];
          const n = 40;
          for (let i = 0; i <= n; i++) { const x = gx0 + (mid - gx0) * i / n; left.push([x, cy - hw(x) * (i === n ? tipH : 1)]); }
          for (let i = n; i >= 0; i--) { const x = gx0 + (mid - gx0) * i / n; left.push([x, cy + hw(x) * (i === n ? tipH : 1)]); }
          ctx.beginPath(); left.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
          for (let i = 0; i <= n; i++) { const x = mid + (gx1 - mid) * i / n; right.push([x + gap, cy - hw(x) * (i === 0 ? tipH : 1)]); }
          for (let i = n; i >= 0; i--) { const x = mid + (gx1 - mid) * i / n; right.push([x + gap, cy + hw(x) * (i === 0 ? tipH : 1)]); }
          ctx.beginPath(); right.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill(); ctx.stroke();
          shoulderR(gap);
          st.parts.forEach((p) => { if (p.life > 0) { ctx.globalAlpha = Math.min(1, p.life * 2); HE.dot(ctx, mid + gap / 2 + p.x, cy + p.y, C.gold, 2.4); ctx.globalAlpha = 1; } });
        }
        // gauge marks and dimension
        ctx.strokeStyle = C.red; ctx.lineWidth = 2;
        [gx0 + 4, st.mode === "broken" ? gx1 - 4 + shift : gx1 - 4].forEach((x) => { ctx.beginPath(); ctx.moveTo(x, cy - 20); ctx.lineTo(x, cy + 20); ctx.stroke(); });
        ctx.restore();
        const eShow = st.mode === "broken" ? st.ep : st.e;
        cap(ctx, `Gauge length: ${HE.fmt(L0 * (1 + eShow), 4)} mm (started at ${L0} mm)${zoom ? "   picture stretched ×" + HE.fmt(K, 2) : ""}`, 14, 112, { size: 12, col: C.ink2 });
        // load cell arrows
        const Fk = st.s * A0 / 1000;
        cap(ctx, `${HE.fmt(Fk, 3)} kN`, S.w - 14, 20, { align: "right", bold: true, size: 14, col: C.lode });
        // ---------- graph
        const gb = { x: 66, y: 142, w: S.w - 66 - 18, h: S.h - 142 - 46 };
        Pbox = gb;
        const ymaxS = Math.max(M.uts * 1.12, 10);
        const le = graph === "le";
        const xs = le ? L0 : 1, ys = le ? A0 / 1000 : 1;
        const x1 = x1v * xs, y1 = ymaxS * ys;
        const stepX = HE.niceStep(x1 * 1.2), stepY = HE.niceStep(y1 * 1.2);
        const P = HE.plot(ctx, gb, { x0: 0, x1, y0: 0, y1, xt: stepX, yt: stepY, C, xl: le ? "extension x (mm)" : "strain ε", yl: le ? "load F (kN)" : "stress σ (N/mm²)", tf: (v) => (zoom && !le ? String(+v.toFixed(4)) : le ? String(+v.toFixed(2)) : String(+v.toFixed(3))) });
        PX = P;
        const px = (e) => P.X(e * xs), py = (s) => P.Y(s * ys);
        HE.clip(ctx, gb, () => {
          if (ghost) {
            ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.setLineDash([5, 4]); ctx.beginPath();
            for (let i = 0; i <= 400; i++) { const e = M.ef * i / 400; const X = px(e), Y = py(M.env(e)); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
            ctx.stroke(); ctx.restore();
          }
          // the traced curve
          if (st.hist.length > 1) {
            let prev = st.hist[0];
            ctx.save(); ctx.lineWidth = 3.2; ctx.lineJoin = "round"; ctx.lineCap = "round";
            for (let i = 1; i < st.hist.length; i++) {
              const q = st.hist[i];
              ctx.strokeStyle = q.ph === "load" ? C.lode : C.violet;
              ctx.beginPath(); ctx.moveTo(px(prev.e), py(prev.s)); ctx.lineTo(px(q.e), py(q.s)); ctx.stroke(); prev = q;
            }
            ctx.restore();
          }
          // current point
          const cxp = px(st.e), cyp = py(st.s);
          ctx.save(); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(cxp, gb.y + gb.h); ctx.lineTo(cxp, cyp); ctx.lineTo(gb.x, cyp); ctx.stroke(); ctx.restore();
          HE.dot(ctx, cxp, cyp, C.lode, 6.5, C.card);
          // elastic slope guide
          if (st.e === 0 || (st.mode === "load" && st.e < (M.Ep || 0.0001))) { ctx.save(); ctx.strokeStyle = C.sea; ctx.lineWidth = 1.5; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(px(0), py(0)); const eg = Math.min(x1v, (M.Ep || M.ef) * 1.0); ctx.lineTo(px(eg), py(E * eg)); ctx.stroke(); ctx.restore(); }
        });
        // key points
        keyPos = [];
        M.keys.forEach((k) => {
          const s = k.id === "F" ? M.env(M.ef) : M.env(k.e);
          const X = px(k.e), Y = py(s);
          if (X > gb.x + gb.w + 2 || X < gb.x - 2) return;
          const reached = (st.mode !== "load" ? true : st.e >= k.e - 1e-9) || st.hist.some((h) => h.e >= k.e - 1e-9);
          if (!(ghost || reached)) return;
          keyPos.push({ k, X, Y });
          ctx.save(); ctx.fillStyle = reached ? C.ink : C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.rect(X - 5, Y - 5, 10, 10); ctx.fill(); ctx.stroke(); ctx.restore();
          if (st.hover && st.hover.k === k) { ctx.save(); ctx.strokeStyle = C.gold; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X, Y, 13, 0, 7); ctx.stroke(); ctx.restore(); }
          cap(ctx, k.short, X + 8, Y - 10, { size: 12, bold: true, avoid: true, bounds: gb });
        });
        // elastic and permanent-set annotations
        if ((st.mode === "unload" || st.mode === "broken") && st.s <= 0 && st.ep > 0 && M.ductile) {
          ctx.save(); ctx.strokeStyle = C.violet; ctx.lineWidth = 2; const X0 = px(0), X1 = px(st.ep), Y0 = py(0);
          if (X1 - X0 > 8) { ctx.beginPath(); ctx.moveTo(X0, Y0 - 8); ctx.lineTo(X1, Y0 - 8); ctx.stroke(); }
          ctx.restore();
          if (X1 - X0 > 8 || true) cap(ctx, "permanent set", Math.max(px(st.ep), gb.x + 60), py(0) - 20, { size: 11, bold: true, col: C.violet, align: "center", avoid: true, bounds: gb });
        }
        if (zoom && st.msg && st.e < M.zoom) st.msg = "";
        cv.setAttribute("aria-label", `Tensile test of ${M.name}. Stress ${HE.fmt(st.s, 3)} newtons per square millimetre, strain ${HE.fmt(st.e, 3)}. ${stateText()}`);
      },
    });
    cv.addEventListener("pointermove", (e) => hover(e)); cv.addEventListener("pointerdown", (e) => hover(e)); cv.addEventListener("pointerleave", () => { if (st.hover) { st.hover = null; update(); sim.redraw(); } });
    function hover(ev) {
      const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) * sim.w / r.width, y = (ev.clientY - r.top) * sim.h / r.height;
      let best = null, bd = 18;
      keyPos.forEach((p) => { const d = Math.hypot(p.X - x, p.Y - y); if (d < bd) { bd = d; best = p; } });
      const h = best ? { k: best.k, txt: best.k.txt } : null;
      if ((h && h.k) !== (st.hover && st.hover.k)) { st.hover = h; update(); sim.redraw(); }
    }
    bRun.addEventListener("click", () => {
      st.msg = "";
      if (HE.reduced) { // no animation: step through the key points
        const nxt = M.keys.find((k) => k.e > st.e + 1e-9 && st.mode === "load") || null;
        if (nxt) goTo(nxt); return;
      }
      if (st.running) { st.running = false; sim.pause(); update(); return; }
      if (zoom && st.e >= M.zoom) { st.msg = "The zoomed window ends here. Switch to the whole test to carry on."; update(); return; }
      st.running = true; st.mode = "load"; sim.play(); update();
    });
    bUn.addEventListener("click", () => {
      st.msg = "";
      st.mode = "unload"; st.e0 = st.e; st.s0 = st.s; st.ep = Math.max(0, st.e - st.s / A_(M)) * (st.s0 <= M.sEL ? 0 : 1);
      if (HE.reduced) { st.running = false; st.s = 0; st.e = st.s0 <= M.sEL ? 0 : st.e0 - st.s0 / A_(M); st.ep = st.e; st.hist.push({ e: st.e, s: 0, ph: "un" }); update(); sim.redraw(); return; }
      st.running = true; sim.play(); update();
    });
    bRe.addEventListener("click", () => {
      st.msg = "";
      if (HE.reduced) { st.mode = "load"; st.e = st.e0; st.s = st.s0; st.t = M.tOfE(st.e0); st.hist.push({ e: st.e, s: st.s, ph: "re" }); update(); sim.redraw(); return; }
      st.mode = "reload"; st.running = true; sim.play(); update();
    });
    bRs.addEventListener("click", reset);
    buildKeys(); matSync(); update();
  });

  /* =====================================================================
     6. Sizing a member: factor of safety, area, diameter, tube wall, extension, strain energy
        Data Booklet values; where the booklet gives a range, the LOWER end is used
        (the safe, design choice). An exam question will give you one number.
     ===================================================================== */
  const BK = {
    mild: { name: "Mild steel", E: 196, ut: 430, uc: 430, yld: 220 },
    stainless: { name: "Stainless steel", E: 190, ut: 760, uc: 460, yld: 286 },
    alu: { name: "Aluminium alloy", E: 70, ut: 300, uc: 300, yld: 250 },
    ti: { name: "Titanium alloy", E: 110, ut: 1000, uc: 1000, yld: 950 },
    ci: { name: "Cast iron", E: 120, ut: 120, uc: 600, yld: null },
    wood: { name: "Wood, parallel to grain", E: 9, ut: 55, uc: 6, yld: null },
  };
  mount("w-sizing", (box) => {
    const S = { mat: "mild", load: "tension", F: 85, fos: 4, L: 2.5, shape: "solid", D: 60 };
    let app = 1, animating = false;
    const row = HE.el("div", { class: "btn-row" });
    const sel = HE.el("select", { "aria-label": "Material from the Data Booklet" }, ...Object.entries(BK).map(([k, m]) => HE.el("option", { value: k }, m.name)));
    sel.addEventListener("change", () => { S.mat = sel.value; run(); });
    row.append(HE.el("label", null, "Material: ", sel)); box.append(row);
    HE.choice(box, "The member is in:", [["tension", "tension (pulled)"], ["compression", "compression (squeezed)"]], "tension", (v) => { S.load = v; run(); });
    HE.choice(box, "Shape:", [["solid", "solid round bar"], ["tube", "round tube (find the wall thickness)"]], "solid", (v) => { S.shape = v; Dsl.input.closest(".slider").hidden = v === "solid"; run(); });
    const ctl = controls(box, "Design inputs");
    HE.slider(ctl, { label: "Load F carried", min: 5, max: 400, step: 5, value: S.F, unit: "kN", oninput: (v) => { S.F = v; run(); } });
    HE.slider(ctl, { label: "Factor of safety", min: 1.5, max: 8, step: 0.5, value: S.fos, oninput: (v) => { S.fos = v; run(); } });
    HE.slider(ctl, { label: "Length of member L", min: 0.5, max: 6, step: 0.5, value: S.L, unit: "m", oninput: (v) => { S.L = v; run(); } });
    const Dsl = HE.slider(ctl, { label: "Tube outside diameter D", min: 20, max: 160, step: 5, value: S.D, unit: "mm", oninput: (v) => { S.D = v; run(); } });
    Dsl.input.closest(".slider").hidden = true;
    const btnRow = HE.el("div", { class: "btn-row" });
    const apply = HE.el("button", { class: "btn small primary", type: "button" }, "▶ Apply the load");
    btnRow.append(apply); box.append(btnRow);
    const cv = canvasIn(box, "A member hanging under load, with its stretch exaggerated, beside a load–extension graph whose triangle is the strain energy.");
    const out = texBox(box);
    let R = null;
    function calc() {
      const m = BK[S.mat], ult = S.load === "tension" ? m.ut : m.uc;
      R = Core.size({ F: S.F, ult, fos: S.fos, shape: S.shape, D: S.D, E: m.E, L: S.L });
      R.m = m; R.ult = ult;
      return R;
    }
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? 300 : 330),
      draw(ctx, t, dt, C, Sd) {
        if (animating) { app += dt / 1.5; if (app >= 1) { app = 1; animating = false; setTimeout(() => sim.pause(), 0); } }
        const r = R || calc(), wide = Sd.w >= 560;
        const P1 = { x: 0, y: 0, w: wide ? Sd.w * 0.42 : Sd.w, h: wide ? Sd.h : 200 }, P2 = { x: wide ? P1.w : 0, y: wide ? 0 : 200, w: wide ? Sd.w - P1.w : Sd.w, h: wide ? Sd.h : Sd.h - 200 };
        // ---- the member
        const eased = app * app * (3 - 2 * app);
        const topY = 30, baseLen = 92;
        const dpx = r.bad ? 30 : Math.max(8, Math.min(46, 8 + (S.shape === "tube" ? S.D : r.d) * 0.4));
        const strPx = Math.min(30, r.strain * baseLen * 500);
        const cx = P1.x + P1.w / 2;
        ctx.save(); ctx.fillStyle = C.dirt; ctx.fillRect(cx - 50, topY - 12, 100, 12); ctx.restore();
        const len = baseLen + strPx * eased;
        const ratio = r.m.yld ? r.sigma / r.m.yld : r.sigma / r.ult;
        const col = S.load === "tension" ? (ratio > 1 ? C.red : ratio > 0.8 ? C.gold : C.grass) : (ratio > 1 ? C.red : C.sea);
        ctx.save(); ctx.fillStyle = col; ctx.globalAlpha = 0.85; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        if (S.shape === "tube" && !r.bad) {
          const di = dpx * (r.d / S.D);
          ctx.fillRect(cx - dpx / 2, topY, dpx, len); ctx.strokeRect(cx - dpx / 2, topY, dpx, len);
          ctx.globalAlpha = 1; ctx.fillStyle = C.card; ctx.fillRect(cx - di / 2, topY, di, len); ctx.strokeRect(cx - di / 2, topY, di, len);
        } else { ctx.fillRect(cx - dpx / 2, topY, dpx, len); ctx.strokeRect(cx - dpx / 2, topY, dpx, len); }
        ctx.restore();
        // the weight
        const wy = topY + len;
        ctx.save(); ctx.fillStyle = C.ink2; const ww = 54 + Math.min(S.F, 400) / 400 * 26; ctx.fillRect(cx - ww / 2, wy + 4, ww, 30); ctx.restore();
        cap(ctx, `${S.F} kN`, cx, wy + 19, { align: "center", bold: true, size: 13, col: "#fffaf0", haloCol: C.ink2 });
        if (S.load === "compression") cap(ctx, "compression: think of it as a strut", cx, topY + len + 52, { align: "center", size: 11, col: C.sea, bold: true });
        // length and exaggeration
        const nExag = r.strain > 0 ? strPx / (r.strain * baseLen) : 0;
        cap(ctx, `L = ${S.L} m`, cx - dpx / 2 - 10, topY + len / 2, { align: "right", size: 12, col: C.ink2 });
        cap(ctx, `stretch drawn ×${HE.fmt(nExag, 2, nExag >= 1e5)}`, P1.x + 10, P1.y + P1.h - 12, { size: 11, col: C.muted });
        cap(ctx, r.bad ? "(tube too thin: even a solid bar would not fit)" : S.shape === "solid" ? `d = ${F3(r.d)} mm` : `t = ${F3(r.t)} mm`, P1.x + 10, P1.y + 14, { size: 12, bold: true, col: r.bad ? C.red : C.ink });
        // ---- load–extension graph with the Es triangle
        const gb = { x: P2.x + 56, y: P2.y + 28, w: P2.w - 56 - 18, h: P2.h - 28 - 50 };
        const dl = r.dl * eased, Fk = S.F * eased;
        const xmax = Math.max(r.dl * 1.35, 1e-6), ymax = Math.max(S.F * 1.2, 1);
        cap(ctx, "Load–extension: area under the line = strain energy", P2.x + 10, P2.y + 14, { bold: true, size: 12 });
        const P = HE.plot(ctx, gb, { x0: 0, x1: xmax, y0: 0, y1: ymax, xt: HE.niceStep(xmax * 1.2), yt: HE.niceStep(ymax * 1.2), C, xl: "extension x (mm)", yl: "load F (kN)", tf: (v) => String(+v.toPrecision(3)) });
        ctx.save(); ctx.fillStyle = C.violet; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(0)); ctx.lineTo(P.X(dl), P.Y(0)); ctx.lineTo(P.X(dl), P.Y(Fk)); ctx.closePath(); ctx.fill(); ctx.restore();
        line(ctx, P.X(0), P.Y(0), P.X(dl), P.Y(Fk), C.lode, 3.5);
        line(ctx, P.X(dl), P.Y(0), P.X(dl), P.Y(Fk), C.violet, 1.5, [4, 3]); line(ctx, P.X(0), P.Y(Fk), P.X(dl), P.Y(Fk), C.violet, 1.5, [4, 3]);
        HE.dot(ctx, P.X(dl), P.Y(Fk), C.lode, 6, C.card);
        cap(ctx, `Es = ½Fx = ${F3(r.Es * eased * eased)} J`, P.X(Math.max(dl, xmax * 0.35)), P.Y(Fk * 0.35 + 0.01 * ymax), { size: 12, bold: true, col: C.violet, align: "center", avoid: true, bounds: gb });
        cv.setAttribute("aria-label", `A ${S.F} kilonewton load on a ${BK[S.mat].name} member in ${S.load}. ${r.bad ? "The tube is too thin." : S.shape === "solid" ? `Diameter ${r.d.toFixed(2)} millimetres.` : `Wall thickness ${r.t.toFixed(2)} millimetres.`} Extension ${r.dl.toFixed(3)} millimetres, strain energy ${r.Es.toFixed(2)} joules.`);
      },
    });
    apply.addEventListener("click", () => { if (HE.reduced) { app = 1; sim.redraw(); return; } app = 0; animating = true; sim.play(); });
    function run() { calc(); show(); sim.redraw(); }
    function show() {
      const r = R, m = r.m, Fn = S.F * 1000;
      const s = [];
      s.push(`<p><b>1. Safe working stress</b> = ultimate ${S.load === "tension" ? "tensile" : "compressive"} stress ÷ factor of safety = ${m.ult ?? r.ult} ÷ ${S.fos} = <b>${F3(r.sw)} N/mm²</b>.</p>`);
      s.push(`<p><b>2. Area needed</b> A = F ÷ σ = ${Fn.toLocaleString("en-GB").replace(/,/g, " ")} N ÷ ${F3(r.sw)} N/mm² = <b>${F3(r.A)} mm²</b> (the force is turned into newtons to match N/mm²).</p>`);
      if (r.bad) s.push(`<p class="bad">3. With an outside diameter of ${S.D} mm even a solid bar of area ${F3(r.A)} mm² would not fit inside the tube: A = π/4 (D² − d²) would need d² to be negative. Choose a bigger D.</p>`);
      else if (S.shape === "solid") s.push(`<p><b>3. Diameter</b> from A = πd²/4: d = √(4A ÷ π) = √(4 × ${F3(r.A, 6)} ÷ π) = <b>${F3(r.d)} mm</b>. <span class="hint">Use the unrounded area from your calculator; rounding it first can shift the last digit.</span></p>`);
      else s.push(`<p><b>3. Tube wall</b> from the annulus A = π/4 (D² − d²): d² = D² − 4A ÷ π = ${S.D}² − 4 × ${F3(r.A, 6)} ÷ π = ${F3(r.d * r.d, 6)}, so inside diameter d = ${F3(r.d)} mm and wall thickness t = (D − d) ÷ 2 = <b>${F3(r.t)} mm</b>.</p>`);
      s.push(`<p><b>4. Strain</b> ε = σ ÷ E = ${F3(r.sw)} ÷ (${m.E} × 1000) = <b>${F3(r.strain, 3)}</b>. &nbsp; <b>Change in length</b> Δl = ε × L = ${F3(r.strain, 3)} × ${S.L * 1000} mm = <b>${F3(r.dl)} mm</b> (${S.load === "tension" ? "longer" : "shorter"}).</p>`);
      s.push(`<p><b>5. Strain energy</b> E<sub>s</sub> = ½ F x = ½ × ${Fn.toLocaleString("en-GB").replace(/,/g, " ")} N × ${F3(r.dl / 1000, 4)} m = <b>${F3(r.Es)} J</b> (extension in metres, because 1 J = 1 N m).</p>`);
      if (m.yld && r.sw > m.yld) s.push(`<p class="bad">Warning: the safe working stress (${F3(r.sw)} N/mm²) is above the yield stress (${m.yld} N/mm²). Rated on the ultimate stress alone, this member would be permanently stretched in service. A designer would also check against yield.</p>`);
      else if (m.yld) s.push(`<p class="hint">For reference, the safe stress is ${F3(r.sw / m.yld * 100)} % of the yield stress (${m.yld} N/mm²).</p>`);
      if (S.load === "compression") s.push(`<p class="hint">Beyond the course: a long, thin strut can also buckle (bend sideways) before it crushes, which is why struts are fat, or hollow, or braced.</p>`);
      out.innerHTML = s.join("");
    }
    run();
  });

  /* =====================================================================
     7. Strain gauge on a loaded beam: tension face, compression face, divider, dummy gauge, amplifier
     ===================================================================== */
  mount("w-gauge", (box) => {
    const G = { load: 50, mode: "fixed", dT: 0, gain: 500 };
    const R0 = 120, GF = 2, Vs = 5, alpha = 0.002, epsMax = 1000e-6;
    HE.choice(box, "Circuit:", [["fixed", "one gauge + fixed resistor"], ["dummy", "one gauge + dummy gauge"], ["pair", "tension + compression gauges"]], "fixed", (v) => { G.mode = v; sim.redraw(); info(); });
    const ctl = controls(box, "Beam load, temperature and amplifier gain");
    HE.slider(ctl, { label: "Load on the beam", min: 0, max: 100, step: 5, value: G.load, unit: "%", oninput: (v) => { G.load = v; sim.redraw(); info(); } });
    HE.slider(ctl, { label: "Temperature rise (gauges and beam)", min: 0, max: 20, step: 1, value: 0, unit: "K", oninput: (v) => { G.dT = v; sim.redraw(); info(); } });
    HE.slider(ctl, { label: "Difference amplifier gain R_f/R_i", min: 100, max: 1000, step: 50, value: G.gain, oninput: (v) => { G.gain = v; sim.redraw(); info(); } });
    const cv = canvasIn(box, "A beam bending under load with a strain gauge on its tension face and another on its compression face, and the voltage divider that turns the resistance change into a voltage.");
    const out = texBox(box);
    const calc = () => {
      const eps = epsMax * G.load / 100, k = 1 + alpha * G.dT;
      const Rt = R0 * (1 + GF * eps) * k, Rc = R0 * (1 - GF * eps) * k, Rd = R0 * k;
      let Rtop, Rbot, topName, botName;
      if (G.mode === "fixed") { Rtop = R0; Rbot = Rt; topName = "fixed resistor"; botName = "tension gauge"; }
      else if (G.mode === "dummy") { Rtop = Rd; Rbot = Rt; topName = "dummy gauge"; botName = "tension gauge"; }
      else { Rtop = Rc; Rbot = Rt; topName = "compression gauge"; botName = "tension gauge"; }
      const V = Vs * Rbot / (Rtop + Rbot), Vo = G.gain * (V - Vs / 2);
      return { eps, Rt, Rc, Rd, Rtop, Rbot, topName, botName, V, Vo };
    };
    const sim = HE.sim(cv, {
      height: (w) => (w >= 560 ? 330 : 520),
      draw(ctx, t, dt, C, S) {
        const r = calc(), wide = S.w >= 560;
        const P1 = { x: 0, y: 0, w: wide ? S.w * 0.5 : S.w, h: wide ? S.h : 230 }, P2 = { x: wide ? P1.w : 0, y: wide ? 0 : 230, w: wide ? S.w - P1.w : S.w, h: wide ? S.h : S.h - 230 };
        ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.strokeRect(P1.x + 3, P1.y + 3, P1.w - 6, P1.h - 6); ctx.strokeRect(P2.x + 3, P2.y + 3, P2.w - 6, P2.h - 6); ctx.restore();
        cap(ctx, "The beam bends (greatly exaggerated)", P1.x + 12, P1.y + 17, { bold: true, size: 12 });
        // ---- beam
        const bx0 = P1.x + 34, bx1 = P1.x + P1.w - 34, by = P1.y + 100, d = G.load / 100 * 34;
        const yAt = (x) => by + d * 4 * ((x - bx0) / (bx1 - bx0)) * (1 - (x - bx0) / (bx1 - bx0));
        const n = 40, th = 9;
        const top = [], bot = [];
        for (let i = 0; i <= n; i++) { const x = bx0 + (bx1 - bx0) * i / n, y = yAt(x); top.push([x, y - th]); bot.push([x, y + th]); }
        ctx.save(); ctx.fillStyle = C.dirt; ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
        ctx.beginPath(); top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); bot.slice().reverse().forEach(([x, y]) => ctx.lineTo(x, y)); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); for (let i = 0; i <= n; i++) { const x = bx0 + (bx1 - bx0) * i / n; i ? ctx.lineTo(x, yAt(x)) : ctx.moveTo(x, yAt(x)); } ctx.stroke(); ctx.restore();
        cap(ctx, "neutral axis (no strain)", bx0 + 4, by + 30, { size: 11, col: C.ink2, avoid: true });
        // supports
        [bx0, bx1].forEach((x) => { ctx.save(); ctx.fillStyle = C.paper2; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, by + th); ctx.lineTo(x - 12, by + th + 22); ctx.lineTo(x + 12, by + th + 22); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); });
        // load
        const mx = (bx0 + bx1) / 2, my = yAt(mx);
        arrow(ctx, mx, my - th - 56, mx, my - th - 2, C.ink, 4, 12);
        cap(ctx, "load", mx + 8, my - th - 40, { size: 12, bold: true, avoid: true });
        // gauges: top (compression), bottom (tension)
        const gauge = (x, y, col, lab, up) => {
          ctx.save(); ctx.fillStyle = C.card; ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.fillRect(x - 22, y - 5, 44, 10); ctx.strokeRect(x - 22, y - 5, 44, 10);
          ctx.beginPath(); for (let i = -18; i <= 18; i += 6) { ctx.moveTo(x + i, y - 3); ctx.lineTo(x + i + 3, y + 3); } ctx.stroke(); ctx.restore();
          cap(ctx, lab, x, y + (up ? -16 : 18), { size: 11, bold: true, col, align: "center", avoid: true });
        };
        gauge(mx - 70, yAt(mx - 70) - th - 4, C.sea, "compression face", true);
        gauge(mx - 70, yAt(mx - 70) + th + 4, C.red, "tension face", false);
        // arrows on faces: compression squeezes top, tension stretches bottom
        const a = G.load / 100 * 18;
        if (a > 1) {
          const tx = mx + 70, ty = yAt(tx) - th - 6, bxx = mx + 70, byy = yAt(bxx) + th + 6;
          arrow(ctx, tx - 26, ty, tx - 26 + a, ty, C.sea, 3, 8); arrow(ctx, tx + 26, ty, tx + 26 - a, ty, C.sea, 3, 8);
          arrow(ctx, bxx - 6, byy, bxx - 6 - a, byy, C.red, 3, 8); arrow(ctx, bxx + 6, byy, bxx + 6 + a, byy, C.red, 3, 8);
        }
        cap(ctx, `ε = ${HE.fmt(r.eps * 1e6, 3)} microstrain at the bottom gauge`, P1.x + 12, P1.y + P1.h - 14, { size: 12, col: C.ink2 });
        // ---- circuit: divider + difference amplifier
        const cx = P2.x + 70, y0 = P2.y + 34, y1 = P2.y + P2.h - 30;
        cap(ctx, "Divider (5 V supply)", P2.x + 12, P2.y + 17, { bold: true, size: 12 });
        const res = (y, name, val, col) => {
          ctx.save(); ctx.strokeStyle = col; ctx.fillStyle = C.card; ctx.lineWidth = 2.2; ctx.fillRect(cx - 12, y, 24, 46); ctx.strokeRect(cx - 12, y, 24, 46); ctx.restore();
          cap(ctx, `${name}`, cx + 20, y + 14, { size: 11, bold: true, col, avoid: true }); cap(ctx, `${F3(val, 4)} Ω`, cx + 20, y + 30, { size: 11, col: C.ink2, avoid: true });
        };
        const mid = (y0 + y1) / 2;
        line(ctx, cx, y0, cx, mid - 54, C.ink, 2); line(ctx, cx, mid - 54 + 46, cx, mid, C.ink, 2); line(ctx, cx, mid, cx, mid + 8, C.ink, 2); line(ctx, cx, mid + 8 + 46, cx, y1, C.ink, 2);
        cap(ctx, "+5 V", cx, y0 - 10, { align: "center", bold: true, size: 12 }); cap(ctx, "0 V", cx, y1 + 12, { align: "center", bold: true, size: 12 });
        res(mid - 54, r.topName, r.Rtop, G.mode === "pair" ? C.sea : G.mode === "dummy" ? C.violet : C.ink2);
        res(mid + 8, r.botName, r.Rbot, C.red);
        HE.dot(ctx, cx, mid - 4, C.ink, 4);
        line(ctx, cx, mid - 4, cx + 130, mid - 4, C.ink, 2);
        cap(ctx, `V = ${HE.fmt(r.V, 5)} V`, cx + 58, mid - 18, { size: 12, bold: true, align: "center", avoid: true });
        // amplifier triangle
        const ax = Math.min(P2.x + P2.w - 70, cx + 200), ay = mid - 4;
        ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.fillStyle = C.card; ctx.beginPath(); ctx.moveTo(cx + 130, ay - 26); ctx.lineTo(cx + 130, ay + 26); ctx.lineTo(ax + 20, ay); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        cap(ctx, "+", cx + 137, ay - 11, { size: 13, bold: true }); cap(ctx, "−", cx + 137, ay + 12, { size: 13, bold: true });
        line(ctx, cx + 118, ay + 12, cx + 130, ay + 12, C.ink, 2);
        cap(ctx, "2.5 V ref", cx + 118, ay + 30, { size: 11, col: C.ink2, align: "right", avoid: true });
        cap(ctx, `Vo = ${HE.fmt(r.Vo, 3)} V`, ax + 20, ay - 34, { align: "right", bold: true, size: 13, col: C.lode, avoid: true });
        cap(ctx, "difference amplifier", cx + 150, ay + 44, { size: 11, col: C.muted, avoid: true });
        cv.setAttribute("aria-label", `Strain gauge demonstration. Load ${G.load} percent, temperature rise ${G.dT} kelvin. Divider voltage ${r.V.toFixed(5)} volts, amplifier output ${r.Vo.toFixed(3)} volts.`);
      },
    });
    function info() {
      const r = calc(), dR = r.Rt - R0 * (1 + alpha * G.dT);
      const base = Vs * R0 / (2 * R0);
      out.innerHTML = `<p><b>Gauge:</b> R = ${R0} Ω unstrained, gauge factor ${GF} (this demo's value; an exam question will give any number you need), so ΔR/R = GF × ε = ${GF} × ${HE.fmt(r.eps, 3)} = ${HE.fmt(GF * r.eps, 3)}, i.e. the tension gauge rises by ${F3(R0 * GF * r.eps)} Ω.</p>` +
        `<p><b>Divider:</b> V = 5 × ${F3(r.Rbot, 5)} ÷ (${F3(r.Rtop, 5)} + ${F3(r.Rbot, 5)}) = <b>${HE.fmt(r.V, 5)} V</b> (unloaded it would be 2.5000 V). <b>Amplifier:</b> V<sub>o</sub> = (R<sub>f</sub>/R<sub>i</sub>)(V<sub>2</sub> − V<sub>1</sub>) = ${G.gain} × (${HE.fmt(r.V, 5)} − 2.5) = <b>${HE.fmt(r.Vo, 3)} V</b>.</p>` +
        (G.dT > 0 && G.mode === "fixed" ? `<p class="bad">Heating the gauge changes its resistance too, and the fixed resistor does not follow: the "load reading" is wrong by ${HE.fmt(Math.abs(r.Vo - G.gain * (Vs * R0 * (1 + GF * r.eps) / (R0 + R0 * (1 + GF * r.eps)) - 2.5)), 3)} V. Try the dummy gauge.</p>`
          : G.dT > 0 && G.mode === "dummy" ? `<p class="ok">The dummy gauge sits on an unloaded piece at the same temperature. Both gauges change by the same factor, so the divider ratio, and the output, ignore the heat. That is temperature compensation.</p>`
            : G.mode === "pair" ? `<p class="hint">The compression gauge falls while the tension gauge rises, so the output moves twice as much, and a temperature change that raises both cancels in the divider.</p>` : "");
    }
    info();
  });

  /* =====================================================================
     8. Unit converter for stress and modulus
     ===================================================================== */
  mount("w-units", (box) => {
    const UNITS = [["kN/mm²", 1e9], ["N/mm²", 1e6], ["MPa", 1e6], ["GPa", 1e9], ["N/m²", 1], ["Pa", 1]];
    const row = HE.el("div", { class: "btn-row" });
    const inp = HE.el("input", { type: "number", class: "math-in", value: "196", step: "any", "aria-label": "Stress or modulus value" });
    const sel = HE.el("select", { "aria-label": "Unit of that value" }, ...UNITS.map(([u]) => HE.el("option", { value: u }, u)));
    row.append(HE.el("label", null, "Value ", inp), HE.el("label", null, " in ", sel));
    box.append(row);
    const presets = HE.el("div", { class: "btn-row", role: "group", "aria-label": "Quick values" }, HE.el("span", { class: "seg-label" }, "Try:"));
    [["E of mild steel", "196", "kN/mm²"], ["yield of mild steel", "220", "N/mm²"], ["E of aluminium alloy", "70", "kN/mm²"], ["1 MPa", "1", "MPa"]].forEach(([l, v, u]) => { const b = HE.el("button", { class: "btn small", type: "button" }, l); b.addEventListener("click", () => { inp.value = v; sel.value = u; draw(); }); presets.append(b); });
    box.append(presets);
    const out = HE.el("div", { class: "table-wrap", "aria-live": "polite" }); box.append(out);
    const row2 = HE.el("div", { class: "btn-row" });
    const dIn = HE.el("input", { type: "number", class: "math-in", value: "12", step: "any", min: "0", "aria-label": "Bar diameter in millimetres" });
    row2.append(HE.el("label", null, "Bar diameter d (mm) ", dIn)); box.append(row2);
    const out2 = HE.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(out2);
    function draw() {
      const v = parseFloat(inp.value), base = UNITS.find(([u]) => u === sel.value)[1];
      if (!isFinite(v)) { out.textContent = "Type a number."; return; }
      const pa = v * base;
      let h = `<table><caption>The same stress written in each unit</caption><thead><tr><th>Unit</th><th class="num">Value</th></tr></thead><tbody>`;
      UNITS.forEach(([u, f]) => { h += `<tr${u === sel.value ? ' style="font-weight:700"' : ""}><td>${u}</td><td class="num">${HE.fmt(pa / f, 4)}</td></tr>`; });
      out.innerHTML = h + `</tbody></table>`;
      const d = parseFloat(dIn.value);
      if (isFinite(d) && d >= 0) { const A = Math.PI * d * d / 4; out2.innerHTML = `Area of a ${HE.fmt(d, 4)} mm bar: A = πd²/4 = <b>${HE.fmt(A, 4)} mm²</b> = <b>${HE.fmt(A * 1e-6, 4)} m²</b> (1 mm² = 10⁻⁶ m², because 1 m = 1000 mm and areas square the factor). A force of 1 kN on it gives σ = ${HE.fmt(1000 / A, 4)} N/mm² = ${HE.fmt(1000 / A, 4)} MPa.`; }
      else out2.textContent = "";
    }
    inp.addEventListener("input", draw); sel.addEventListener("change", draw); dIn.addEventListener("input", draw);
    draw();
  });

  /* =====================================================================
     9. "Draw it": building a structure diagram in layers from a description
     ===================================================================== */
  mount("w-draw", (box) => {
    const steps = [
      ["1. Sketch the structure", "Draw the beam as a single line or bar, to a sensible scale. Do not draw the dock, the sea or the cart: only the structure."],
      ["2. Replace the ground by supports", "A hinge at A (it can push in two directions) and a roller at B (it pushes at right angles to the surface it rolls on). Use the standard symbols."],
      ["3. Add every load", "Point loads as arrows (an inclined load drawn at its true angle), and the UDL as a row of small arrows with its intensity in kN/m. Show where each acts."],
      ["4. Add the reactions", "Draw the unknown reactions as arrows: A has two components (A<sub>x</sub>, A<sub>y</sub>) and B has one (B). Guess the sense. A negative answer just means your guess was the wrong way round."],
      ["5. Dimension it", "Give every distance you will need for moments, measured from one point (usually a support). Angles go on the inclined load."],
      ["6. Label and check", "Name the points (A, B), give units (kN, kN/m, m), mark the axes you will resolve along, and check: is every force on the structure drawn, and none of the structure's own supports' forces missing?"],
    ];
    let i = 0;
    const note = HE.el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = HE.el("button", { class: "btn small", type: "button" }, "◀ Back");
    const next = HE.el("button", { class: "btn small primary", type: "button" }, "Next layer ▶");
    const rs = HE.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    const cnt = HE.el("span", { class: "hint", style: "margin:0" });
    box.append(HE.el("p", { class: "hint" }, "The description: “The dock bridge is a 6 m beam. It sits on a hinge at its left end A and on a roller at its right end B. A 12 kN cart stands 1.5 m from A. A winch rope pulls down on it at 3 m from A with 10 kN, 30° from the vertical, leaning to the right. The planking weighs 4 kN/m over the last 2 m.”"));
    box.append(HE.el("div", { class: "btn-row" }, back, next, rs, cnt), note);
    const fig = HE.el("figure", { class: "diagram", style: "margin:8px 0" });
    const s = (x) => 70 + x * 78, by = 150;
    const svg = `<svg viewBox="0 0 620 300" role="img" aria-label="The dock bridge free-body diagram being built up layer by layer." style="width:100%;height:auto">
<g data-l="1"><rect x="${s(0)}" y="${by - 6}" width="${6 * 78}" height="12" class="f-gold" stroke="var(--ink)" stroke-width="2"/></g>
<g data-l="2"><path d="M${s(0)} ${by + 6} l-16 28 h32 z" class="f-paper2" stroke="var(--ink)" stroke-width="2"/><circle cx="${s(0)}" cy="${by + 6}" r="4" class="f-card" stroke="var(--ink)" stroke-width="2"/><line x1="${s(0) - 26}" y1="${by + 34}" x2="${s(0) + 26}" y2="${by + 34}" stroke="var(--ink-2)" stroke-width="2"/>
<path d="M${s(6)} ${by + 6} l-16 24 h32 z" class="f-paper2" stroke="var(--ink)" stroke-width="2"/><circle cx="${s(6) - 8}" cy="${by + 35}" r="4.5" class="f-card" stroke="var(--ink)" stroke-width="2"/><circle cx="${s(6) + 8}" cy="${by + 35}" r="4.5" class="f-card" stroke="var(--ink)" stroke-width="2"/><line x1="${s(6) - 26}" y1="${by + 40}" x2="${s(6) + 26}" y2="${by + 40}" stroke="var(--ink-2)" stroke-width="2"/></g>
<g data-l="3" stroke-width="3.5" fill="none"><line x1="${s(1.5)}" y1="${by - 70}" x2="${s(1.5)}" y2="${by - 10}" class="s-gold" marker-end="url(#str-ah-lode)" style="stroke:var(--lode)"/>
<line x1="${s(3) - 30}" y1="${by - 66}" x2="${s(3)}" y2="${by - 10}" style="stroke:var(--lode)" marker-end="url(#str-ah-lode)"/>
<g stroke-width="2" style="stroke:var(--sea)"><rect x="${s(4)}" y="${by - 52}" width="${2 * 78}" height="1" /><line x1="${s(4)}" y1="${by - 52}" x2="${s(4)}" y2="${by - 10}" marker-end="url(#str-ah-sea)"/><line x1="${s(4.5)}" y1="${by - 52}" x2="${s(4.5)}" y2="${by - 10}" marker-end="url(#str-ah-sea)"/><line x1="${s(5)}" y1="${by - 52}" x2="${s(5)}" y2="${by - 10}" marker-end="url(#str-ah-sea)"/><line x1="${s(5.5)}" y1="${by - 52}" x2="${s(5.5)}" y2="${by - 10}" marker-end="url(#str-ah-sea)"/><line x1="${s(6)}" y1="${by - 52}" x2="${s(6)}" y2="${by - 10}" marker-end="url(#str-ah-sea)"/></g></g>
<g data-l="3" font-size="14" font-weight="700"><text x="${s(1.5) + 8}" y="${by - 62}" class="ink" style="fill:var(--lode)">12 kN</text><text x="${s(3) - 72}" y="${by - 66}" style="fill:var(--lode)">10 kN</text><text x="${s(4) + 6}" y="${by - 60}" style="fill:var(--sea)">4 kN/m</text></g>
<g data-l="4" stroke-width="3.5" fill="none" style="stroke:var(--grass)"><line x1="${s(0)}" y1="${by + 90}" x2="${s(0)}" y2="${by + 40}" marker-end="url(#str-ah-grass)"/><line x1="${s(6)}" y1="${by + 94}" x2="${s(6)}" y2="${by + 46}" marker-end="url(#str-ah-grass)"/><line x1="${s(0) - 48}" y1="${by}" x2="${s(0) - 12}" y2="${by}" marker-end="url(#str-ah-grass)"/></g>
<g data-l="4" font-size="14" font-weight="700" style="fill:var(--grass)"><text x="${s(0) + 8}" y="${by + 80}">A<tspan font-size="10" dy="4">y</tspan></text><text x="${s(6) + 8}" y="${by + 84}">B</text><text x="${s(0) - 62}" y="${by - 8}">A<tspan font-size="10" dy="4">x</tspan></text></g>
<g data-l="5" font-size="12" class="ink2"><g stroke="var(--ink-2)" stroke-width="1.2"><line x1="${s(0)}" y1="${by + 118}" x2="${s(6)}" y2="${by + 118}"/><line x1="${s(0)}" y1="${by + 112}" x2="${s(0)}" y2="${by + 124}"/><line x1="${s(6)}" y1="${by + 112}" x2="${s(6)}" y2="${by + 124}"/><line x1="${s(0)}" y1="${by + 102}" x2="${s(1.5)}" y2="${by + 102}"/><line x1="${s(0)}" y1="${by + 98}" x2="${s(0)}" y2="${by + 106}"/><line x1="${s(1.5)}" y1="${by + 98}" x2="${s(1.5)}" y2="${by + 106}"/><line x1="${s(0)}" y1="${by + 138}" x2="${s(3)}" y2="${by + 138}"/><line x1="${s(0)}" y1="${by + 134}" x2="${s(0)}" y2="${by + 142}"/><line x1="${s(3)}" y1="${by + 134}" x2="${s(3)}" y2="${by + 142}"/></g>
<text x="${s(3)}" y="${by + 114}" text-anchor="middle">6 m</text><text x="${s(0.75)}" y="${by + 98}" text-anchor="middle">1.5 m</text><text x="${s(1.5)}" y="${by + 134}" text-anchor="middle">3 m</text>
<path d="M${s(3) - 18} ${by - 31} A 24 24 0 0 1 ${s(3) - 4} ${by - 33}" fill="none" stroke="var(--ink-2)" stroke-width="1.2" opacity="0"/><text x="${s(3) + 6}" y="${by - 33}">30° from the vertical</text></g>
<g data-l="6" font-size="15" font-weight="700" class="ink"><text x="${s(0) - 8}" y="${by - 14}" text-anchor="end">A</text><text x="${s(6) + 14}" y="${by - 14}">B</text><g stroke="var(--ink-2)" stroke-width="1.5" marker-end="url(#str-ah-ink)"><line x1="580" y1="270" x2="580" y2="238"/><line x1="580" y1="270" x2="612" y2="270"/></g><text x="598" y="236" font-size="12" font-weight="400">+y</text><text x="598" y="286" font-size="12" font-weight="400">+x</text></g>
</svg>`;
    fig.innerHTML = svg;
    box.append(fig);
    const layers = [...fig.querySelectorAll("[data-l]")];
    function render() {
      layers.forEach((g) => (g.style.display = +g.dataset.l <= i + 1 ? "" : "none"));
      note.innerHTML = `<b>${steps[i][0]}.</b> ${steps[i][1]}`;
      cnt.textContent = `Layer ${i + 1} of ${steps.length}`;
      back.disabled = i === 0; next.disabled = i === steps.length - 1;
    }
    back.addEventListener("click", () => { if (i > 0) i--; render(); });
    next.addEventListener("click", () => { if (i < steps.length - 1) i++; render(); });
    rs.addEventListener("click", () => { i = 0; render(); });
    render();
  });
})();
