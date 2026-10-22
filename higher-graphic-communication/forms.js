/* Forms & pictorials — the widgets of the Sail Loft and the gun deck of HMS Vellum.
   Every figure is computed from the same geometric rules the page teaches:
   views of convex solids (with hidden detail), auxiliary true shapes, tangent blends,
   ellipse constructions, lines of interpenetration, unfolding developments,
   pictorial projections, two-point perspective, sketch faults and light and shade. */
(function () {
  "use strict";
  const HG = window.HG;
  const $ = (id) => document.getElementById(id);
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HG.el("canvas", { class: "sim", role: "img", "aria-label": label || "" }); box.append(c); return c; };
  const controls = (box) => { const d = HG.el("div", { class: "sim-controls" }); box.append(d); return d; };
  const noteIn = (box) => { const d = HG.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(d); return d; };
  const rowIn = (box, ...kids) => { const d = HG.el("div", { class: "btn-row" }, ...kids); box.append(d); return d; };
  const btn = (txt, fn, cls) => HG.el("button", { class: "btn small" + (cls ? " " + cls : ""), type: "button", onclick: fn }, txt);
  const N = (x, dp = 1) => HG.n(x, dp);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const DEG = Math.PI / 180;
  const SHADE = "#17120c"; // shading always darkens towards near-black, in either theme

  /* ---- colour helpers: theme colours arrive as #hex strings ---- */
  function rgb(c) {
    c = String(c || "#888").trim();
    if (c[0] === "#") {
      if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
    }
    const m = c.match(/[\d.]+/g);
    return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
  }
  const mixA = (a, b, t) => { const p = rgb(a), q = rgb(b); return [0, 1, 2].map((i) => p[i] + (q[i] - p[i]) * t); };
  const css = (v) => `rgb(${Math.round(v[0])},${Math.round(v[1])},${Math.round(v[2])})`;
  const mix = (a, b, t) => css(mixA(a, b, t));
  const alpha = (c, a) => { const v = rgb(c); return `rgba(${v[0]},${v[1]},${v[2]},${a})`; };
  const isDark = () => { const v = rgb(HG.css("--paper")); return v[0] + v[1] + v[2] < 300; };

  /* ---- drawing conventions (Appendix 2 line types, scaled for the screen) ---- */
  const DASH = { hidden: [5, 3.5], centre: [14, 3, 2, 3], fold: [14, 3, 2, 3, 2, 3], cons: [], proj: [2, 3] };
  function pline(ctx, pts, col, w, dash, close) {
    if (!pts || pts.length < 2) return;
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash || []);
    ctx.lineJoin = "round"; ctx.lineCap = dash && dash.length ? "butt" : "round";
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    if (close) ctx.closePath();
    ctx.stroke(); ctx.restore();
  }
  const seg = (ctx, a, b, col, w, dash) => pline(ctx, [a, b], col, w, dash);
  function fillPoly(ctx, pts, col, strokeCol, sw) {
    if (!pts || pts.length < 3) return;
    ctx.save(); ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath(); ctx.fillStyle = col; ctx.fill();
    if (strokeCol) { ctx.strokeStyle = strokeCol; ctx.lineWidth = sw || 1; ctx.lineJoin = "round"; ctx.stroke(); }
    ctx.restore();
  }
  const lab = (ctx, s, x, y, o = {}) => HG.label(ctx, s, x, y, Object.assign({ size: 12 }, o));
  const dot2 = (ctx, x, y, col, r = 3.5) => { ctx.save(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill(); ctx.restore(); };

  /* an animated construction: prog runs 0..n; Play animates from 0, Step jumps a stage.
     Under reduced motion Play shows the finished state at once and Step walks the stages. */
  function stagePlayer(box, sim, n, rate, onchange) {
    const st = { prog: n, n, playing: false };
    const play = btn("▶ Play construction", () => {
      if (HG.reduced) { st.prog = st.n; sync(); return; }
      if (st.playing) { st.playing = false; sim.pause(); sync(); return; }
      if (st.prog >= st.n - 1e-6) st.prog = 0;
      st.playing = true; sim.play(); sync();
    }, "primary");
    const back = btn("◀ Stage", () => { stop(); st.prog = Math.max(0, Math.ceil(st.prog - 1e-6) - 1); sync(); });
    const fwd = btn("Stage ▶", () => { stop(); st.prog = Math.min(st.n, Math.floor(st.prog + 1e-6) + 1); sync(); });
    const done = btn("Finished drawing", () => { stop(); st.prog = st.n; sync(); });
    function stop() { if (st.playing) { st.playing = false; sim.pause(); } }
    function sync() { play.textContent = st.playing ? "❚❚ Pause" : "▶ Play construction"; play.setAttribute("aria-pressed", st.playing ? "true" : "false"); onchange && onchange(); sim.redraw(); }
    st.tick = (dt) => {
      if (!st.playing) return;
      st.prog = Math.min(st.n, st.prog + dt * rate);
      if (st.prog >= st.n) { st.playing = false; sim.pause(); setTimeout(sync, 0); }
      onchange && onchange();
    };
    st.row = rowIn(box, play, back, fwd, done);
    st.sync = sync; st.stop = stop;
    st.reset = (to) => { stop(); st.prog = to == null ? st.n : to; sync(); };
    return st;
  }

  /*MESH-START*/
  /* ---- a small library of convex solids: faces with outward normals, plane cuts, view edges ---- */
  const M3 = (function () {
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const unit = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const R = Math.PI / 180;
    function ngon(n, r, rot) { const p = []; for (let i = 0; i < n; i++) { const a = ((rot || 0) + i * 360 / n) * R; p.push([r * Math.cos(a), r * Math.sin(a)]); } return p; }
    function newell(pts) {
      const n = [0, 0, 0];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
      }
      return unit(n);
    }
    const centroid = (pts) => mul(pts.reduce(add, [0, 0, 0]), 1 / pts.length);
    /* make every face's normal point away from the solid's centre (the solids are convex) */
    function orient(F) {
      const all = []; F.forEach((f) => all.push(...f.pts));
      const c = centroid(all);
      F.forEach((f) => { f.n = newell(f.pts); if (dot(f.n, sub(centroid(f.pts), c)) < 0) { f.pts.reverse(); f.n = mul(f.n, -1); } });
      return F;
    }
    function prism(poly, z0, z1) {
      const F = [{ pts: poly.map(([x, y]) => [x, y, z0]), tag: "end" }, { pts: poly.map(([x, y]) => [x, y, z1]), tag: "end" }];
      poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; F.push({ pts: [[p[0], p[1], z0], [q[0], q[1], z0], [q[0], q[1], z1], [p[0], p[1], z1]], tag: "side" }); });
      return orient(F);
    }
    function pyramid(poly, z0, apex) {
      const F = [{ pts: poly.map(([x, y]) => [x, y, z0]), tag: "end" }];
      poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length]; F.push({ pts: [[p[0], p[1], z0], [q[0], q[1], z0], apex.slice()], tag: "side" }); });
      return orient(F);
    }
    function sphere(r, c, nl, nm) {
      const P = (i, j) => { const th = Math.PI * i / nl, ph = 2 * Math.PI * j / nm; return [c[0] + r * Math.sin(th) * Math.cos(ph), c[1] + r * Math.sin(th) * Math.sin(ph), c[2] + r * Math.cos(th)]; };
      const F = [];
      for (let i = 0; i < nl; i++) for (let j = 0; j < nm; j++) {
        const a = P(i, j), b = P(i + 1, j), d = P(i + 1, j + 1), e = P(i, j + 1);
        F.push({ pts: i === 0 ? [a, b, d] : i === nl - 1 ? [a, b, e] : [a, b, d, e], tag: "side" });
      }
      return orient(F);
    }
    const key = (p) => Math.round(p[0] * 1e4) + "," + Math.round(p[1] * 1e4) + "," + Math.round(p[2] * 1e4);
    /* keep the part of a convex solid where n·p <= c, and close it with a cut face */
    function clip(F, n, c) {
      n = unit(n);
      const out = [], cut = new Map(), eps = 1e-7;
      const cross0 = (P, Q) => {
        if (key(P) > key(Q)) [P, Q] = [Q, P];
        const dp = dot(n, P) - c, dq = dot(n, Q) - c;
        return add(P, mul(sub(Q, P), dp / (dp - dq)));
      };
      for (const f of F) {
        const res = [], m = f.pts.length;
        for (let i = 0; i < m; i++) {
          const P = f.pts[i], Q = f.pts[(i + 1) % m];
          const dp = dot(n, P) - c, dq = dot(n, Q) - c;
          if (dp <= eps) res.push(P);
          if (Math.abs(dp) <= eps) cut.set(key(P), P);
          if ((dp < -eps && dq > eps) || (dp > eps && dq < -eps)) { const I = cross0(P, Q); res.push(I); cut.set(key(I), I); }
        }
        const clean = res.filter((p, i) => key(p) !== key(res[(i + 1) % res.length]));
        if (clean.length >= 3) out.push({ pts: clean, n: f.n, tag: f.tag });
      }
      const pts = [...cut.values()];
      if (pts.length >= 3) {
        const cen = centroid(pts);
        const u = unit(Math.abs(n[2]) < 0.9 ? cross(n, [0, 0, 1]) : cross(n, [1, 0, 0])), v = cross(n, u);
        const ang = (p) => Math.atan2(dot(sub(p, cen), v), dot(sub(p, cen), u));
        pts.sort((a, b) => ang(a) - ang(b));
        out.push({ pts, n, tag: "cut" });
      }
      return out;
    }
    function edges(F) {
      const E = new Map();
      F.forEach((f, fi) => {
        const m = f.pts.length;
        for (let i = 0; i < m; i++) {
          const a = f.pts[i], b = f.pts[(i + 1) % m], ka = key(a), kb = key(b);
          if (ka === kb) continue;
          const k = ka < kb ? ka + "|" + kb : kb + "|" + ka;
          let e = E.get(k); if (!e) E.set(k, (e = { a, b, f: [] })); e.f.push(fi);
        }
      });
      return [...E.values()];
    }
    /* edges seen from direction t (pointing towards the viewer): visible outlines and hidden detail.
       A convex solid hides an edge only when both faces that meet there face away. */
    function viewEdges(F, E, t, creaseCos) {
      const cc = creaseCos == null ? 0.85 : creaseCos;
      const vis = [], hid = [];
      for (const e of E) {
        const f1 = F[e.f[0]], f2 = e.f.length > 1 ? F[e.f[1]] : null;
        const d1 = dot(f1.n, t), d2 = f2 ? dot(f2.n, t) : -1;
        // the edges of a cut face are always real edges, however shallow the cut
        const crease = !f2 || f1.tag === "cut" || f2.tag === "cut" || dot(f1.n, f2.n) < cc;
        const a = d1 > 1e-6, b = f2 ? d2 > 1e-6 : false;
        if (a || b) { if (crease || a !== b) vis.push([e.a, e.b]); }
        else if (crease) hid.push([e.a, e.b]);
      }
      return { vis, hid };
    }
    /* a camera for pictorial views: yaw turns about the vertical, pitch looks down */
    function cam(yaw, pitch) {
      const ps = Math.sin(yaw * R), pc = Math.cos(yaw * R), ts = Math.sin(pitch * R), tc = Math.cos(pitch * R);
      const t = [-ps * tc, -pc * tc, ts], r = [pc, -ps, 0];
      return { t, r, u: cross(t, r) };
    }
    const VIEWS = {
      elev: { t: [0, -1, 0], r: [1, 0, 0], u: [0, 0, 1] },
      plan: { t: [0, 0, 1], r: [1, 0, 0], u: [0, 1, 0] },
      end: { t: [1, 0, 0], r: [0, 1, 0], u: [0, 0, 1] },
    };
    return { add, sub, mul, dot, cross, len, unit, ngon, newell, centroid, orient, prism, pyramid, sphere, clip, edges, viewEdges, cam, VIEWS, key };
  })();
  /*MESH-END*/
  const { add, sub, mul, dot, cross, len, unit } = M3;
  const proj = (v, p) => [dot(p, v.r), dot(p, v.u)];

  /* =====================================================================
     1. The form rack: a solid, a cut, and its three third-angle views
     ===================================================================== */
  mount("w-forms", (box) => {
    const H0 = 72;
    const FORMS = {
      sq: { name: "square prism", make: () => M3.prism(M3.ngon(4, 26 * Math.SQRT2, 45), 0, H0), kind: "poly", w: 26 },
      hex: { name: "hexagonal prism", make: () => M3.prism(M3.ngon(6, 32, 0), 0, H0), kind: "poly", w: 32 },
      cyl: { name: "cylinder", make: () => M3.prism(M3.ngon(48, 30, 0), 0, H0), kind: "cyl", w: 30, axis: true },
      pyr: { name: "square pyramid", make: () => M3.pyramid(M3.ngon(4, 32 * Math.SQRT2, 45), 0, [0, 0, H0]), kind: "poly", w: 32 },
      cone: { name: "cone", make: () => M3.pyramid(M3.ngon(48, 32, 0), 0, [0, 0, H0]), kind: "cone", w: 32, axis: true },
      sph: { name: "sphere", make: () => M3.sphere(36, [0, 0, 36], 16, 32), kind: "sph", w: 36, axis: true },
    };
    const st = { form: "cyl", cut: "inc", pos: 0.55, ang: 35, yaw: -35 };
    HG.choice(box, "Form:", [["sq", "Square prism"], ["hex", "Hexagonal prism"], ["cyl", "Cylinder"], ["pyr", "Square pyramid"], ["cone", "Cone"], ["sph", "Sphere"]], st.form, (v) => { st.form = v; draw(); });
    HG.choice(box, "Cut:", [["none", "None"], ["hor", "Horizontal"], ["inc", "Inclined"], ["vert", "Vertical"]], st.cut, (v) => { st.cut = v; draw(); });
    const ctl = controls(box);
    HG.slider(ctl, { label: "Cut position", min: 15, max: 85, step: 1, value: st.pos * 100, unit: "%", oninput: (v) => { st.pos = v / 100; draw(); } });
    HG.slider(ctl, { label: "Cut angle (inclined cut)", min: 10, max: 70, step: 1, value: st.ang, unit: "°", oninput: (v) => { st.ang = v; draw(); } });
    const yawS = HG.slider(ctl, { label: "Turn the pictorial", min: -85, max: 85, step: 1, value: st.yaw, unit: "°", oninput: (v) => { st.yaw = v; sim.redraw(); } });
    const cv = canvasIn(box, "");
    cv.style.touchAction = "pan-y";
    box.append(HG.el("p", { class: "drag-hint" }, "Drag sideways on the pictorial (top right) to turn the solid. Third-angle layout: plan above the elevation, end elevation (seen from the right) on the right."));
    const note = noteIn(box);
    let F = [], E = [], cap = null;

    function solid() {
      const f = FORMS[st.form];
      let S = f.make();
      const h = st.pos * H0, w = f.w;
      if (st.cut === "hor") S = M3.clip(S, [0, 0, 1], h);
      if (st.cut === "inc") { const a = st.ang * DEG; S = M3.clip(S, [Math.sin(a), 0, Math.cos(a)], Math.cos(a) * h); }
      if (st.cut === "vert") S = M3.clip(S, [1, 0, 0], (st.pos - 0.5) * 2 * w * 0.92);
      return S;
    }
    function sectionName(f) {
      if (!cap) return "";
      const zs = cap.pts.map((p) => p[2]);
      const onBase = Math.min(...zs) < 0.05, onTop = Math.max(...zs) > H0 - 0.05;
      const n = cap.pts.length;
      const poly = ["", "", "", "triangle", "quadrilateral", "pentagon", "hexagon", "heptagon", "octagon"][n] || n + "-sided polygon";
      if (f.kind === "poly") return `a ${poly}`;
      if (f.kind === "sph") return "a circle (every plane cut of a sphere is a circle)";
      if (f.kind === "cyl") {
        if (st.cut === "hor") return "a circle";
        if (st.cut === "vert") return "a rectangle";
        return onBase || onTop ? "part of an ellipse, cut off where the plane runs out through an end" : "an ellipse";
      }
      // cone: half-angle atan(32/72)
      const half = Math.atan(32 / H0) / DEG;
      if (st.cut === "hor") return "a circle";
      if (st.cut === "vert") return Math.abs(st.pos - 0.5) < 0.006 ? "a triangle (the plane contains the axis)" : "a hyperbola closed by the base line";
      if (st.ang < 90 - half - 0.5) return onBase ? "part of an ellipse, closed by a straight line where the plane leaves through the base" : "an ellipse";
      if (st.ang <= 90 - half + 0.5) return "a parabola closed by the base line (the plane is parallel to a sloping side)";
      return "a hyperbola closed by the base line";
    }
    function draw() {
      F = solid(); E = M3.edges(F); cap = F.find((f) => f.tag === "cut") || null;
      sim.redraw();
      const f = FORMS[st.form];
      let txt = `<b>${f.name[0].toUpperCase() + f.name.slice(1)}</b>`;
      if (!cap) txt += ", uncut. Read it in the views: " + ({ poly: "flat faces show as straight-edged shapes", cyl: "a rectangle in elevation and end elevation, a circle in plan", cone: "a triangle in elevation and end elevation, a circle in plan", sph: "a circle in every view" })[f.kind] + ".";
      else {
        const desc = (t) => { const d = Math.abs(dot(cap.n, t)); return d > 0.999 ? "true shape" : d < 0.002 ? "an edge (a straight line)" : "foreshortened"; };
        txt += ` cut ${({ hor: "horizontally", inc: "by an inclined plane at " + st.ang + "°", vert: "by a vertical plane" })[st.cut]}. The cut face (magenta) is ${sectionName(f)}. It appears as ${desc(M3.VIEWS.elev.t)} in the elevation, ${desc(M3.VIEWS.plan.t)} in the plan and ${desc(M3.VIEWS.end.t)} in the end elevation.`;
        if (st.cut === "inc") txt += " No principal view shows its true shape: that needs an auxiliary view (chapter 2).";
      }
      note.innerHTML = txt;
      cv.setAttribute("aria-label", note.textContent);
    }

    function extent() {
      const all = []; F.forEach((f) => all.push(...f.pts));
      const r = (i, fn) => fn(...all.map((p) => p[i]));
      return { x0: r(0, Math.min), x1: r(0, Math.max), y0: r(1, Math.min), y1: r(1, Math.max), z0: r(2, Math.min), z1: r(2, Math.max) };
    }
    function drawView(ctx, C, v, cx, cy, s, title) {
      const P = (p) => { const q = proj(v, p); return [cx + q[0] * s, cy - q[1] * s]; };
      if (cap) {
        const d = Math.abs(dot(cap.n, v.t));
        if (d > 0.002) fillPoly(ctx, cap.pts.map(P), alpha(C.lode, 0.2));
      }
      const { vis, hid } = M3.viewEdges(F, E, v.t);
      hid.forEach(([a, b]) => seg(ctx, P(a), P(b), C.ink2, 1.1, DASH.hidden));
      vis.forEach(([a, b]) => seg(ctx, P(a), P(b), C.ink, 2.1));
      const f = FORMS[st.form];
      if (f.axis || st.form === "pyr" || st.form === "sq" || st.form === "hex") {
        // centre lines: symmetry axes, drawn thin chain past the outline
        const ext = (f.w + 9) * s;
        if (v === M3.VIEWS.plan) { seg(ctx, [cx - ext, cy], [cx + ext, cy], C.sea, 1, DASH.centre); seg(ctx, [cx, cy - ext], [cx, cy + ext], C.sea, 1, DASH.centre); }
        else {
          const bb = extent(), top = bb.z1 + 8, bot = bb.z0 - 8;
          seg(ctx, P([0, 0, bot]), P([0, 0, top]), C.sea, 1, DASH.centre);
          if (st.form === "sph") seg(ctx, P(add([0, 0, 36], mul(v.r, -(f.w + 9)))), P(add([0, 0, 36], mul(v.r, f.w + 9))), C.sea, 1, DASH.centre);
        }
      }
    }
    const sim = HG.sim(cv, {
      height: (w) => Math.round(w * 0.92),
      draw(ctx, t, dt, C, S) {
        const pw = S.w / 2, ph = S.h / 2;
        const s = Math.min(pw, ph) * 0.62 / 80;
        const zc = 36;
        // panel guides
        ctx.save(); ctx.strokeStyle = alpha(C.line, 0.9); ctx.setLineDash([2, 4]); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(pw, 6); ctx.lineTo(pw, S.h - 6); ctx.moveTo(6, ph); ctx.lineTo(S.w - 6, ph); ctx.stroke(); ctx.restore();
        const plan = [pw / 2, ph / 2 + 8], elev = [pw / 2, ph * 1.5 + zc * s + 4], end = [pw * 1.5, ph * 1.5 + zc * s + 4];
        // faint projection lines tie the views together
        // projected from the solid's real extremes, so they always start and end on the drawing
        const bb = extent();
        ctx.save(); ctx.strokeStyle = alpha(C.muted, 0.35); ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]); ctx.beginPath();
        for (const x of [bb.x0, bb.x1]) { ctx.moveTo(plan[0] + x * s, plan[1] - bb.y0 * s + 4); ctx.lineTo(elev[0] + x * s, elev[1] - bb.z1 * s - 4); }
        for (const z of [bb.z0, bb.z1]) { ctx.moveTo(elev[0] + bb.x1 * s + 4, elev[1] - z * s); ctx.lineTo(end[0] + bb.y0 * s - 4, end[1] - z * s); }
        ctx.stroke(); ctx.restore();
        drawView(ctx, C, M3.VIEWS.plan, plan[0], plan[1], s, "");
        drawView(ctx, C, M3.VIEWS.elev, elev[0], elev[1], s, "");
        drawView(ctx, C, M3.VIEWS.end, end[0], end[1], s, "");
        const tl = (txt, x, y) => lab(ctx, txt, x, y, { size: 11, bold: true, align: "center", col: C.muted });
        tl("PLAN", pw / 2, 12); tl("ELEVATION", pw / 2, ph + 12); tl("END ELEVATION", pw * 1.5, ph + 12); tl("PICTORIAL", pw * 1.5, 12);
        // pictorial: shaded faces, back faces culled (the solid is convex)
        const cm = M3.cam(st.yaw, 28), L = unit([-0.5, -0.8, 0.9]);
        const pc = [pw * 1.5, ph / 2 + 10 + 4];
        const P = (p) => { const q = proj(cm, [p[0], p[1], p[2] - zc]); return [pc[0] + q[0] * s, pc[1] - q[1] * s]; };
        const base = mix(C.card, C.sea, 0.35);
        F.forEach((f) => {
          const d = dot(f.n, cm.t);
          if (d <= 1e-6) return;
          const k = 0.35 + 0.65 * Math.max(0, dot(f.n, L));
          const col = f.tag === "cut" ? mix(C.card, C.lode, 0.55) : mix(SHADE, base, 0.25 + 0.75 * k);
          fillPoly(ctx, f.pts.map(P), col, col, 0.8);
        });
        M3.viewEdges(F, E, cm.t).vis.forEach(([a, b]) => seg(ctx, P(a), P(b), C.ink, 1.6));
      },
    });
    // drag on the pictorial quadrant to turn the solid
    let drag = null;
    cv.addEventListener("pointerdown", (e) => {
      const r = cv.getBoundingClientRect();
      if (e.clientX - r.left < r.width / 2 || e.clientY - r.top > r.height / 2) return;
      drag = { x: e.clientX, yaw: st.yaw }; cv.setPointerCapture(e.pointerId);
    });
    cv.addEventListener("pointermove", (e) => { if (!drag) return; st.yaw = clamp(drag.yaw + (e.clientX - drag.x) * 0.7, -85, 85); yawS.sync(Math.round(st.yaw)); sim.redraw(); });
    const endDrag = () => { drag = null; };
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    draw();
  });

  /* =====================================================================
     2. Auxiliary view: the true shape of an inclined cut, projected at 90°
     ===================================================================== */
  mount("w-aux", (box) => {
    const H = 100, R = 28, h = 50;
    const st = { shape: "hex", rot: 0, th: 35 };
    HG.choice(box, "Mast section:", [["sq", "Square"], ["hex", "Hexagon"], ["oct", "Octagon"], ["cyl", "Circle (cylinder)"]], st.shape, (v) => { st.shape = v; play.reset(); });
    const ctl = controls(box);
    HG.slider(ctl, { label: "Cutting plane angle θ", min: 30, max: 60, step: 1, value: st.th, unit: "°", oninput: (v) => { st.th = v; play.reset(); } });
    HG.slider(ctl, { label: "Turn the mast about its axis", min: 0, max: 90, step: 1, value: st.rot, unit: "°", oninput: (v) => { st.rot = v; play.reset(); } });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    const stageNote = HG.el("p", { class: "hint", "aria-live": "polite" });
    const STAGES = ["Number each corner in the plan and find the same points on the cut line in the elevation.",
      "Project from every point on the cut line at 90° to it.",
      "Draw the auxiliary centre line (a datum) parallel to the cut line, a convenient distance away.",
      "Transfer each width from the plan, measured from the plan's centre line, along its projector (dividers do this).",
      "Join the points in order. That is the true shape. Hatch it, because it is a cut surface."];

    function pts() {
      const n = st.shape === "sq" ? 4 : st.shape === "hex" ? 6 : st.shape === "oct" ? 8 : 12;
      const r0 = st.shape === "sq" ? 45 : st.shape === "oct" ? 22.5 : 0;
      return M3.ngon(n, R, r0 + st.rot);
    }
    function geom(th) {
      const t = th * DEG, tn = Math.tan(t);
      const u = [Math.cos(t), -Math.sin(t)], nn = [Math.sin(t), Math.cos(t)], D = R + 60;
      const P = pts();
      const C = P.map(([x]) => [x, h - x * tn]);
      const A = P.map(([x, y], i) => [C[i][0] + nn[0] * (D + y), C[i][1] + nn[1] * (D + y)]);
      return { t, tn, u, nn, D, P, C, A };
    }
    const Pz = 205;
    let play = null;
    let box0 = null;
    function sheetBox() {
      let x0 = -R - 8, x1 = R + 8, z0 = -6, z1 = Pz + R + 10;
      for (const th of [30, 40, 50, 60]) {
        const g = geom(th);
        for (const sgn of [-1, 1]) for (const yy of [-R - 14, R + 14]) {
          const x = sgn * R, cz = h - x * g.tn;
          const ax = x + g.nn[0] * (g.D + yy), az = cz + g.nn[1] * (g.D + yy);
          x0 = Math.min(x0, ax); x1 = Math.max(x1, ax); z0 = Math.min(z0, az); z1 = Math.max(z1, az);
        }
      }
      return { x0, x1, z0, z1 };
    }
    const sim = HG.sim(cv, {
      height: (w) => Math.round(Math.min(w * 1.05, 640)),
      draw(ctx, tt, dt, C, S) {
        if (play) play.tick(dt);
        const pr = play ? play.prog : 5;
        if (!box0) box0 = sheetBox();
        const b = box0, s = Math.min((S.w - 20) / (b.x1 - b.x0), (S.h - 20) / (b.z1 - b.z0));
        const ox = 10 + (S.w - 20 - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy = S.h - 10 - (S.h - 20 - (b.z1 - b.z0) * s) / 2 + b.z0 * s;
        const Q = (p) => [ox + p[0] * s, oy - p[1] * s];
        const g = geom(st.th), n = g.P.length, cyl = st.shape === "cyl";
        const xs = cyl ? [-R, R] : g.P.map((p) => p[0]);
        const xmin = Math.min(...xs), xmax = Math.max(...xs);
        const zc = (x) => h - x * g.tn;
        // ---- elevation ----
        const outline = [[xmin, 0], [xmax, 0], [xmax, zc(xmax)], [xmin, zc(xmin)]].map(Q);
        if (!cyl) {
          const hid = [], vis = [];
          g.P.forEach((v, i) => {
            const prev = g.P[(i - 1 + n) % n], next = g.P[(i + 1) % n];
            const nyA = -(v[0] - prev[0]), nyB = -(next[0] - v[0]);
            ((nyA < -1e-9 || nyB < -1e-9) ? vis : hid).push(v[0]);
          });
          hid.forEach((x) => { if (!vis.some((x2) => Math.abs(x2 - x) < 0.05)) seg(ctx, Q([x, 0]), Q([x, zc(x)]), C.ink2, 1.1, DASH.hidden); });
          vis.forEach((x) => seg(ctx, Q([x, 0]), Q([x, zc(x)]), C.ink, 2));
        }
        pline(ctx, outline, C.ink, 2.2, null, true);
        seg(ctx, Q([xmin, zc(xmin)]), Q([xmax, zc(xmax)]), C.lode, 3.2);
        seg(ctx, Q([0, -6]), Q([0, H + 6]), C.sea, 1, DASH.centre);
        lab(ctx, "ELEVATION", Q([0, -4])[0], Q([0, -4])[1] + 4, { size: 11, bold: true, align: "center", col: C.muted, base: "top" });
        // ---- plan (third angle: above the elevation) ----
        const PP = (p) => Q([p[0], Pz + p[1]]);
        if (cyl) {
          const circ = []; for (let k = 0; k <= 72; k++) { const a = k / 72 * 2 * Math.PI; circ.push(PP([R * Math.cos(a), R * Math.sin(a)])); }
          fillPoly(ctx, circ, alpha(C.lode, 0.14)); pline(ctx, circ, C.ink, 2.2);
        } else { fillPoly(ctx, g.P.map(PP), alpha(C.lode, 0.14)); pline(ctx, g.P.map(PP), C.ink, 2.2, null, true); }
        seg(ctx, PP([-R - 8, 0]), PP([R + 8, 0]), C.sea, 1, DASH.centre);
        seg(ctx, PP([0, -R - 8]), PP([0, R + 8]), C.sea, 1, DASH.centre);
        lab(ctx, "PLAN", PP([-R - 12, 0])[0], PP([-R - 12, 0])[1] - 12, { size: 11, bold: true, col: C.muted, align: "right" });
        // faint projectors between plan and elevation
        ctx.save(); ctx.strokeStyle = alpha(C.muted, 0.35); ctx.lineWidth = 0.8; ctx.setLineDash([2, 3]); ctx.beginPath();
        g.P.forEach(([x]) => { const a = PP([x, -R]), c2 = Q([x, zc(x)]); ctx.moveTo(a[0], a[1] + 3); ctx.lineTo(c2[0], c2[1] - 3); });
        ctx.stroke(); ctx.restore();
        // ---- construction ----
        const f = (k) => clamp(pr - k, 0, 1);
        // stage 1: numbers
        if (pr > 0) g.P.forEach((p, i) => {
          if (f(0) < (i + 1) / n - 1e-9) return;
          dot2(ctx, ...PP(p), C.gold, 3); dot2(ctx, ...Q(g.C[i]), C.gold, 3);
          if (!cyl) {
            const o = unit([p[0], p[1], 0]); const lp = PP([p[0] + o[0] * 9, p[1] + o[1] * 9 + (Math.abs(o[1]) < 0.3 ? 6 : 0)]);
            lab(ctx, String(i + 1), lp[0], lp[1], { size: 11, bold: true, align: "center", col: C.gold });
          }
        });
        // stage 2: projectors at 90° to the cut line
        if (pr > 1) g.C.forEach((c) => { const L = (g.D + R + 12) * f(1); seg(ctx, Q(c), Q([c[0] + g.nn[0] * L, c[1] + g.nn[1] * L]), alpha(C.sea, 0.7), 1); });
        // stage 3: the auxiliary centre line
        const mid = [0, h], a0 = [mid[0] + g.nn[0] * g.D, mid[1] + g.nn[1] * g.D];
        const half = (R / Math.cos(g.t) + 14);
        if (pr > 2) {
          const k = f(2);
          seg(ctx, Q([a0[0] - g.u[0] * half * k, a0[1] - g.u[1] * half * k]), Q([a0[0] + g.u[0] * half * k, a0[1] + g.u[1] * half * k]), C.sea, 1.2, DASH.centre);
          const xl = Q([a0[0] + g.u[0] * half, a0[1] + g.u[1] * half]);
          if (k > 0.9) lab(ctx, "auxiliary centre line", xl[0] + 4, xl[1], { size: 11, col: C.sea });
          seg(ctx, PP([-R - 8, 0]), PP([R + 8, 0]), C.gold, 1.6, DASH.centre);
        }
        // stage 4: widths transferred from the plan
        if (pr > 3) g.P.forEach((p, i) => {
          if (f(3) < (i + 0.5) / n) return;
          const c0 = [g.C[i][0] + g.nn[0] * g.D, g.C[i][1] + g.nn[1] * g.D];
          seg(ctx, PP([p[0], 0]), PP(p), C.gold, 2.4);
          seg(ctx, Q(c0), Q(g.A[i]), C.gold, 2.4);
          dot2(ctx, ...Q(g.A[i]), C.red, 3.2);
        });
        // stage 5: join, fill and hatch
        if (pr > 4) {
          let shape;
          if (cyl) { // the exact ellipse through the twelve points
            shape = []; for (let k = 0; k <= 96; k++) { const a = k / 96 * 2 * Math.PI, x = R * Math.cos(a), y = R * Math.sin(a), c = [x, zc(x)]; shape.push(Q([c[0] + g.nn[0] * (g.D + y), c[1] + g.nn[1] * (g.D + y)])); }
          } else shape = g.A.map(Q);
          ctx.save(); ctx.globalAlpha = f(4);
          fillPoly(ctx, shape, alpha(C.lode, 0.18));
          ctx.save(); ctx.beginPath(); shape.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.clip();
          const xsS = shape.map((p) => p[0]), ysS = shape.map((p) => p[1]);
          const lx = Math.min(...xsS), hx = Math.max(...xsS), ly = Math.min(...ysS), hy = Math.max(...ysS);
          ctx.strokeStyle = C.ink2; ctx.lineWidth = 0.8; ctx.beginPath();
          for (let k = lx - (hy - ly); k < hx; k += 7) { ctx.moveTo(k, hy); ctx.lineTo(k + (hy - ly), ly); }
          ctx.stroke(); ctx.restore();
          pline(ctx, shape, C.ink, 2.2, null, true);
          const tl = Q([a0[0] + g.nn[0] * (R + 16), a0[1] + g.nn[1] * (R + 16)]);
          lab(ctx, "TRUE SHAPE", tl[0], tl[1], { size: 11, bold: true, align: "center", col: C.lode });
          ctx.restore();
        }
        const si = Math.min(STAGES.length - 1, Math.max(0, Math.ceil(pr - 1e-6) - 1));
        stageNote.textContent = pr <= 0 ? "Stage 0: the plan and elevation, with the cut shown as a line." : `Stage ${si + 1} of 5: ${STAGES[si]}`;
      },
    });
    play = stagePlayer(box, sim, 5, 0.7, null);
    box.append(stageNote);
    // keep the note in step with the geometry
    const origReset = play.reset;
    play.reset = (to) => { box0 = null; origReset(to); info(); };
    function info() {
      const g = geom(st.th), cyl = st.shape === "cyl";
      const xs = cyl ? [-R, R] : g.P.map((p) => p[0]), ys = cyl ? [-R, R] : g.P.map((p) => p[1]);
      const along = (Math.max(...xs) - Math.min(...xs)) / Math.cos(g.t), across = Math.max(...ys) - Math.min(...ys);
      note.innerHTML = cyl
        ? `The cut line in the elevation is the true length of the cut: ${N(along)} mm. The true shape is an <b>ellipse</b>: major axis = 2R ÷ cos θ = ${2 * R} ÷ cos ${st.th}° = <b>${N(along)} mm</b>; minor axis = the diameter = <b>${2 * R} mm</b>. The plan shows only a circle: it is foreshortened.`
        : `The cut face is an irregular ${({ sq: "quadrilateral", hex: "hexagon", oct: "octagon" })[st.shape]}. In the elevation it is seen as an edge, ${N(along)} mm long (its true length, because the plane is perpendicular to the elevation). Its true shape measures <b>${N(along)} mm</b> along the cut by <b>${N(across)} mm</b> across: the across-widths come unchanged from the plan.`;
      cv.setAttribute("aria-label", "Elevation, plan and auxiliary view of a " + ({ sq: "square", hex: "hexagonal", oct: "octagonal", cyl: "cylindrical" })[st.shape] + " mast cut at " + st.th + " degrees. " + note.textContent);
    }
    info();
    play.sync();
  });

  /* =====================================================================
     3. Tangency: locate the centre of a blend radius, then prove it touches
     ===================================================================== */
  mount("w-tangency", (box) => {
    const W = 200, Hh = 130;
    const st = { mode: "ext", R: 34, r1: 20, r2: 13, alpha: 70, O1: [62, 48], O2: [140, 54], line: 18, own: false, C: [100, 100] };
    let play = null;
    HG.choice(box, "Blend:", [["corner", "Line to line (corner radius)"], ["line", "Line to arc"], ["ext", "Arc to arc, external"], ["int", "Arc to arc, internal"]], st.mode, (v) => { st.mode = v; if (v === "int") st.R = Math.max(st.R, 70); else if (st.R > 50) st.R = 34; rS.sync(st.R); upd(); });
    const ctl = controls(box);
    const rS = HG.slider(ctl, { label: "Blend radius R", min: 6, max: 110, step: 1, value: st.R, unit: "mm", oninput: (v) => { st.R = v; upd(); } });
    HG.slider(ctl, { label: "Radius r₁ (left)", min: 8, max: 30, step: 1, value: st.r1, unit: "mm", oninput: (v) => { st.r1 = v; upd(); } });
    HG.slider(ctl, { label: "Radius r₂ (right)", min: 6, max: 30, step: 1, value: st.r2, unit: "mm", oninput: (v) => { st.r2 = v; upd(); } });
    HG.slider(ctl, { label: "Corner angle (line to line)", min: 40, max: 140, step: 1, value: st.alpha, unit: "°", oninput: (v) => { st.alpha = v; upd(); } });
    const own = HG.el("label", { class: "tg-own" }, HG.el("input", { type: "checkbox" }), " Find the centre yourself (drag the magenta point C)");
    own.querySelector("input").addEventListener("change", (e) => { st.own = e.target.checked; if (st.own) { st.C = solve().C ? [solve().C[0] + 9, solve().C[1] + 7] : [100, 100]; } upd(); });
    box.append(own);
    const cv = canvasIn(box, "");
    box.append(HG.el("p", { class: "drag-hint" }, "Drag the circle centres O₁ and O₂ (and C when you are finding it yourself)."));
    const stageNote = HG.el("p", { class: "hint", "aria-live": "polite" });
    const out = HG.el("div", { class: "output-box tg-out", "aria-live": "polite" });

    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const u2 = (a, b) => { const d = dist(a, b) || 1; return [(b[0] - a[0]) / d, (b[1] - a[1]) / d]; };
    function circInt(A, ra, B, rb, pickUpper) {
      const d = dist(A, B);
      if (d > ra + rb || d < Math.abs(ra - rb) || d === 0) return null;
      const a = (ra * ra - rb * rb + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, ra * ra - a * a));
      const e = u2(A, B), m = [A[0] + e[0] * a, A[1] + e[1] * a];
      const p1 = [m[0] - e[1] * hh, m[1] + e[0] * hh], p2 = [m[0] + e[1] * hh, m[1] - e[0] * hh];
      return pickUpper ? (p1[1] >= p2[1] ? p1 : p2) : (p1[1] < p2[1] ? p1 : p2);
    }
    /* the geometry of each blend: the given items, the two loci, the centre and tangent points */
    function solve() {
      const R = st.R, m = st.mode;
      if (m === "corner") {
        const K = [88, 20], a = st.alpha * DEG, d2 = [Math.cos(a), Math.sin(a)];
        const Lmax = 0.8 * 100 * Math.tan(a / 2);
        if (R > Lmax) return { err: `R is too big for this corner: the tangent points would run off the ends of the lines (largest here ≈ ${N(Lmax, 0)} mm).`, K, d2 };
        const C = [K[0] + R / Math.tan(a / 2), K[1] + R];
        const T1 = [C[0], K[1]], tk = dot([C[0] - K[0], C[1] - K[1], 0], [d2[0], d2[1], 0]), T2 = [K[0] + d2[0] * tk, K[1] + d2[1] * tk];
        return { K, d2, C, T1, T2, need1: R, need2: R };
      }
      if (m === "line") {
        const y0 = st.line, O1 = st.O1, need = R + st.r1, yc = y0 + R, dy = yc - O1[1];
        if (need * need < dy * dy) return { err: `No centre exists: the line R above the deck and the arc of radius R + r₁ = ${need} mm about O₁ do not meet. Make R bigger or bring O₁ down.`, y0 };
        const C = [O1[0] + Math.sqrt(need * need - dy * dy), yc];
        const e = u2(O1, C);
        return { y0, C, T1: [C[0], y0], T2: [O1[0] + e[0] * st.r1, O1[1] + e[1] * st.r1], need1: R, need2: need };
      }
      const O1 = st.O1, O2 = st.O2;
      if (m === "ext") {
        const C = circInt(O1, R + st.r1, O2, R + st.r2, true);
        if (!C) return { err: "The two loci (radius R + r about each centre) do not meet. Make R bigger or move the circles closer." };
        const e1 = u2(O1, C), e2 = u2(O2, C);
        return { C, T1: [O1[0] + e1[0] * st.r1, O1[1] + e1[1] * st.r1], T2: [O2[0] + e2[0] * st.r2, O2[1] + e2[1] * st.r2], need1: R + st.r1, need2: R + st.r2 };
      }
      if (R <= Math.max(st.r1, st.r2) + 0.5) return { err: "For an internal blend R must be bigger than both circles: it wraps round them." };
      const C = circInt(O1, R - st.r1, O2, R - st.r2, false);
      if (!C) return { err: `The loci (radius R − r about each centre) do not meet: R must be at least (d + r₁ + r₂) ÷ 2 = ${N((dist(O1, O2) + st.r1 + st.r2) / 2, 0)} mm here.` };
      const e1 = u2(C, O1), e2 = u2(C, O2);
      return { C, T1: [C[0] + e1[0] * R, C[1] + e1[1] * R], T2: [C[0] + e2[0] * R, C[1] + e2[1] * R], need1: R - st.r1, need2: R - st.r2 };
    }
    function arcPts(C, R, A, B) {
      let a1 = Math.atan2(A[1] - C[1], A[0] - C[0]), a2 = Math.atan2(B[1] - C[1], B[0] - C[0]);
      let d = a2 - a1; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      const p = []; for (let k = 0; k <= 48; k++) { const a = a1 + d * k / 48; p.push([C[0] + R * Math.cos(a), C[1] + R * Math.sin(a)]); }
      return p;
    }
    const circlePts = (C, r) => { const p = []; for (let k = 0; k <= 72; k++) { const a = k / 72 * 2 * Math.PI; p.push([C[0] + r * Math.cos(a), C[1] + r * Math.sin(a)]); } return p; };
    let view = { s: 1, ox: 0, oy: 0 };
    const sim = HG.sim(cv, {
      height: (w) => Math.round(w * 0.62),
      draw(ctx, tt, dt, C, S) {
        if (play) play.tick(dt);
        const pr = play ? play.prog : 5;
        const s = Math.min(S.w / W, S.h / Hh); view = { s, ox: (S.w - W * s) / 2, oy: S.h - (S.h - Hh * s) / 2 };
        const Q = (p) => [view.ox + p[0] * s, view.oy - p[1] * s], QL = (ps) => ps.map(Q);
        const g = solve(), m = st.mode, f = (k) => clamp(pr - k, 0, 1);
        const own = st.own;
        // the given items
        if (m === "corner") {
          const K = g.K, d2 = g.d2, done = !own && !g.err && pr >= 5;
          seg(ctx, Q(K), Q([K[0] + 100, K[1]]), done ? C.muted : C.ink, done ? 1 : 2, done ? [4, 3] : null);
          seg(ctx, Q(K), Q([K[0] + d2[0] * 100, K[1] + d2[1] * 100]), done ? C.muted : C.ink, done ? 1 : 2, done ? [4, 3] : null);
        } else if (m === "line") {
          seg(ctx, Q([4, st.line]), Q([196, st.line]), C.ink, 2.2);
          pline(ctx, QL(circlePts(st.O1, st.r1)), C.ink, 2.2);
        } else {
          pline(ctx, QL(circlePts(st.O1, st.r1)), C.ink, 2.2); pline(ctx, QL(circlePts(st.O2, st.r2)), C.ink, 2.2);
        }
        if (m !== "corner") {
          dot2(ctx, ...Q(st.O1), C.ink, 3); lab(ctx, "O₁", Q(st.O1)[0] + 6, Q(st.O1)[1] - 8, { size: 12, bold: true });
          if (m !== "line") { dot2(ctx, ...Q(st.O2), C.ink, 3); lab(ctx, "O₂", Q(st.O2)[0] + 6, Q(st.O2)[1] - 8, { size: 12, bold: true }); }
        }
        if (own) return drawOwn(ctx, C, g, Q, QL);
        if (g.err) { stageNote.textContent = ""; return; }
        const locCol = C.sea;
        // stage 1 and 2: the two loci of possible centres
        const locus = (which, k) => {
          if (k <= 0) return;
          if (m === "corner") {
            if (which === 1) seg(ctx, Q([g.K[0] - 10, g.K[1] + st.R]), Q([g.K[0] - 10 + 170 * k, g.K[1] + st.R]), locCol, 1.2, [6, 4]);
            else { const nrm = [g.d2[1], -g.d2[0]], p0 = [g.K[0] + nrm[0] * st.R, g.K[1] + nrm[1] * st.R]; seg(ctx, Q([p0[0] - g.d2[0] * 15, p0[1] - g.d2[1] * 15]), Q([p0[0] + g.d2[0] * 130 * k, p0[1] + g.d2[1] * 130 * k]), locCol, 1.2, [6, 4]); }
          } else if (m === "line" && which === 1) seg(ctx, Q([4, st.line + st.R]), Q([4 + 192 * k, st.line + st.R]), locCol, 1.2, [6, 4]);
          else {
            const O = which === 1 || m === "line" ? st.O1 : st.O2, rr = which === 1 ? g.need1 : g.need2;
            const O_ = m === "line" ? st.O1 : O;
            const pts = []; for (let i = 0; i <= 96 * k; i++) { const a = i / 96 * 2 * Math.PI; pts.push([O_[0] + rr * Math.cos(a), O_[1] + rr * Math.sin(a)]); }
            ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 9999, 9999); ctx.clip(); pline(ctx, QL(pts), locCol, 1.2, [6, 4]); ctx.restore();
          }
        };
        locus(1, f(0)); locus(2, f(1));
        if (pr > 2) { dot2(ctx, ...Q(g.C), C.lode, 4.5 * f(2) + 0.5); lab(ctx, "C", Q(g.C)[0] + 8, Q(g.C)[1] - 6, { size: 13, bold: true, col: C.lode }); }
        if (pr > 3) {
          const k = f(3);
          const ray = (P, T) => { const e = u2(P, T), L = dist(P, T) + 8; seg(ctx, Q(P), Q([P[0] + e[0] * L * k, P[1] + e[1] * L * k]), C.gold, 1.2); };
          if (m === "corner") { ray(g.C, g.T1); ray(g.C, g.T2); }
          else if (m === "line") { ray(g.C, g.T1); ray(st.O1, g.C); }
          else if (m === "ext") { ray(st.O1, g.C); ray(st.O2, g.C); }
          else { ray(g.C, g.T1); ray(g.C, g.T2); }
          if (k > 0.95) for (const [T, nm] of [[g.T1, "T₁"], [g.T2, "T₂"]]) { dot2(ctx, ...Q(T), C.gold, 4); lab(ctx, nm, Q(T)[0] + 7, Q(T)[1] + 10, { size: 12, bold: true, col: C.gold }); }
        }
        if (pr > 4) {
          const arc = arcPts(g.C, st.R, g.T1, g.T2), k = f(4), n = Math.max(2, Math.round(arc.length * k));
          pline(ctx, QL(arc.slice(0, n)), C.grass, 3.4);
          if (m === "corner" && k >= 1) { seg(ctx, Q(g.T1), Q([g.K[0] + 100, g.K[1]]), C.ink, 2.4); seg(ctx, Q(g.T2), Q([g.K[0] + g.d2[0] * 100, g.K[1] + g.d2[1] * 100]), C.ink, 2.4); }
        }
        const NOTES = {
          corner: ["Draw a line parallel to the first line, R away from it, on the inside.", "Draw a second parallel line, R inside the other line.", "Where the parallels cross is the centre C: it is R from both lines.", "Drop perpendiculars from C to each line: their feet are the tangent points T₁ and T₂.", "Draw the arc from T₁ to T₂, then line it in: stop each straight line exactly at its tangent point."],
          line: ["Locus 1: a line parallel to the deck, R above it (every point there is R from the deck).", "Locus 2: an arc about O₁ of radius R + r₁ (external: add the radii).", "C is where the two loci cross.", "Tangent points: drop a perpendicular from C to the line (T₁), and join O₁ to C (T₂ is where it crosses the circle).", "Draw the blend arc from T₁ to T₂."],
          ext: ["Locus 1: an arc about O₁ of radius R + r₁ (external blend: add the radii).", "Locus 2: an arc about O₂ of radius R + r₂.", "C is where the loci cross.", "Join C to O₁ and to O₂: the tangent points lie on these lines of centres, where they cross each circle.", "Draw the blend arc from T₁ to T₂."],
          int: ["Locus 1: an arc about O₁ of radius R − r₁ (internal blend: subtract).", "Locus 2: an arc about O₂ of radius R − r₂.", "C is where the loci cross (take the crossing on the far side from where the arc goes).", "Join C to O₁ and O₂ and extend the lines to the blend circle: T₁ and T₂ lie on these extended lines of centres.", "Draw the blend arc from T₁ to T₂: it wraps round both circles."],
        };
        const si = Math.min(4, Math.max(0, Math.ceil(pr - 1e-6) - 1));
        stageNote.textContent = `Stage ${si + 1} of 5: ${NOTES[m][si]}`;
      },
    });
    function drawOwn(ctx, C, g, Q, QL) {
      const Cp = st.C, R = st.R, m = st.mode;
      const gaps = [];
      if (m === "corner") {
        const a = st.alpha * DEG, nrm = [Math.sin(a), -Math.cos(a)];
        gaps.push(["line 1", Cp[1] - g.K[1] - R]);
        gaps.push(["line 2", ((Cp[0] - g.K[0]) * nrm[0] + (Cp[1] - g.K[1]) * nrm[1]) - R]);
      } else if (m === "line") { gaps.push(["the deck line", Cp[1] - st.line - R]); gaps.push(["circle O₁", dist(Cp, st.O1) - R - st.r1]); }
      else if (m === "ext") { gaps.push(["circle O₁", dist(Cp, st.O1) - R - st.r1]); gaps.push(["circle O₂", dist(Cp, st.O2) - R - st.r2]); }
      else { gaps.push(["circle O₁", R - st.r1 - dist(Cp, st.O1)]); gaps.push(["circle O₂", R - st.r2 - dist(Cp, st.O2)]); }
      const ok = gaps.every(([, v]) => Math.abs(v) < 1.2);
      pline(ctx, QL(circlePts(Cp, R)), ok ? C.grass : alpha(C.lode, 0.8), ok ? 3 : 1.6, ok ? null : [6, 4]);
      dot2(ctx, ...Q(Cp), C.lode, 5); lab(ctx, "C", Q(Cp)[0] + 8, Q(Cp)[1] - 6, { size: 13, bold: true, col: C.lode });
      out.innerHTML = gaps.map(([nm, v]) => Math.abs(v) < 1.2 ? `<span class="ok">✔ touches ${nm}</span> (error ${N(Math.abs(v))} mm)` : `<span class="bad">✘ ${v > 0 ? "a gap of " + N(v) + " mm to" : "cuts into"} ${nm}</span>${v < 0 ? " by " + N(-v) + " mm" : ""}`).join("<br>") +
        (ok ? "<br><b>Tangent to both.</b> You found the one point that is exactly R from the line or the right distance from each centre." : "<br>Hint: C must be on both loci at once. Untick the box to see them.");
      stageNote.textContent = "";
      cv.setAttribute("aria-label", "Blend circle of radius " + R + " mm centred where you placed C. " + out.textContent);
    }
    function upd() {
      sim.redraw();
      if (st.own) return;
      const g = solve();
      if (g.err) { out.innerHTML = `<span class="bad">${g.err}</span>`; cv.setAttribute("aria-label", g.err); return; }
      const m = st.mode, Cc = g.C;
      // verification, computed from the finished geometry
      const tanAt = (P, T) => { const e = u2(P, T); return [-e[1], e[0]]; };
      const angle = (a, b) => Math.acos(clamp(Math.abs(a[0] * b[0] + a[1] * b[1]), 0, 1)) / DEG;
      const lines = [];
      if (m === "corner") {
        lines.push(`Distance from C to line 1 = ${N(Cc[1] - g.K[1], 2)} mm = R ✔`, `Distance from C to line 2 = ${N((Cc[0] - g.K[0]) * Math.sin(st.alpha * DEG) - (Cc[1] - g.K[1]) * Math.cos(st.alpha * DEG), 2)} mm = R ✔`);
        lines.push(`CT₁ ⟂ line 1 and CT₂ ⟂ line 2: angle between arc and line at each tangent point = ${N(angle(tanAt(Cc, g.T1), [1, 0]), 2)}° and ${N(angle(tanAt(Cc, g.T2), g.d2), 2)}°`);
      } else if (m === "line") {
        lines.push(`C is ${N(Cc[1] - st.line, 2)} mm above the deck = R ✔`, `|CO₁| = ${N(dist(Cc, st.O1), 2)} mm = R + r₁ = ${st.R + st.r1} mm ✔`);
        lines.push(`At T₂ the blend and the circle share a tangent: angle between them = ${N(angle(tanAt(Cc, g.T2), tanAt(st.O1, g.T2)), 2)}°`);
      } else {
        const sign = m === "ext" ? "+" : "−";
        lines.push(`|CO₁| = ${N(dist(Cc, st.O1), 2)} mm = R ${sign} r₁ = ${N(g.need1, 0)} mm ✔`, `|CO₂| = ${N(dist(Cc, st.O2), 2)} mm = R ${sign} r₂ = ${N(g.need2, 0)} mm ✔`);
        lines.push(`T₁ and T₂ lie on the lines of centres, so at each the two curves share a tangent: angles between them = ${N(angle(tanAt(Cc, g.T1), tanAt(st.O1, g.T1)), 2)}° and ${N(angle(tanAt(Cc, g.T2), tanAt(st.O2, g.T2)), 2)}°`);
      }
      out.innerHTML = "<b>Check:</b><br>" + lines.join("<br>") + "<br>Angle 0° means the curves meet smoothly, with no kink: they are tangent.";
      cv.setAttribute("aria-label", ({ corner: "Corner radius", line: "Arc blending a line and a circle", ext: "External blend between two circles", int: "Internal blend round two circles" })[m] + ". " + out.textContent);
    }
    play = stagePlayer(box, sim, 5, 0.6, null);
    box.append(stageNote, out);
    HG.drag(cv, sim, () => {
      const T = (p) => ({ x: view.ox + p[0] * view.s, y: view.oy - p[1] * view.s });
      const h = [];
      if (st.own) h.push({ ...T(st.C), id: "C" });
      if (st.mode !== "corner") h.push({ ...T(st.O1), id: "O1" });
      if (st.mode === "ext" || st.mode === "int") h.push({ ...T(st.O2), id: "O2" });
      return h;
    }, (id, x, y) => {
      const p = [clamp((x - view.ox) / view.s, 10, W - 10), clamp((view.oy - y) / view.s, 8, Hh - 8)];
      if (id === "C") st.C = p; else if (id === "O1") st.O1 = st.mode === "line" ? [p[0], Math.max(p[1], st.line + st.r1 + 2)] : p; else st.O2 = p;
      upd();
    });
    upd();
    play.sync();
  });

  /* =====================================================================
     4. Ellipses: concentric circles, the trammel, and a tilted circle
     ===================================================================== */
  mount("w-ellipse", (box) => {
    const st = { mode: "conc", a: 70, b: 40, n: 12, tilt: 55, tr: 0.6 };
    let play = null, trSlider = null;
    HG.choice(box, "Method:", [["conc", "Concentric circles"], ["tram", "Trammel (paper strip)"], ["tilt", "Why: a tilted circle"]], st.mode, (v) => { st.mode = v; play.reset(v === "tram" ? 0 : null); trBox.hidden = v !== "tram"; tiltBox.hidden = v !== "tilt"; axBox.hidden = v === "tilt"; info(); });
    const axBox = controls(box);
    HG.slider(axBox, { label: "Major axis", min: 80, max: 160, step: 2, value: st.a * 2, unit: "mm", oninput: (v) => { st.a = v / 2; if (st.b > st.a - 2) st.b = st.a - 2; play.reset(st.mode === "tram" ? 0 : null); info(); } });
    const bS = HG.slider(axBox, { label: "Minor axis", min: 30, max: 150, step: 2, value: st.b * 2, unit: "mm", oninput: (v) => { st.b = Math.min(v / 2, st.a - 2); if (st.b !== v / 2) bS.sync(st.b * 2); play.reset(st.mode === "tram" ? 0 : null); info(); } });
    HG.choice(axBox, "Divisions:", [[8, "8"], [12, "12"], [16, "16"], [24, "24"]], st.n, (v) => { st.n = v; play.reset(); });
    const trBox = controls(box); trBox.hidden = true;
    trSlider = HG.slider(trBox, { label: "Slide the strip", min: 0, max: 100, step: 1, value: 0, unit: "%", oninput: (v) => { st.tr = v / 100; trail = traceTo(st.tr); sim.redraw(); } });
    const tiltBox = controls(box); tiltBox.hidden = true;
    HG.slider(tiltBox, { label: "Tilt of the circle away from you", min: 0, max: 90, step: 1, value: st.tilt, unit: "°", oninput: (v) => { st.tilt = v; sim.redraw(); info(); } });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    let trail = [];
    const stageNote = HG.el("p", { class: "hint", "aria-live": "polite" });
    const traceTo = (f) => { const p = []; const n = Math.round(f * 160); for (let k = 0; k <= n; k++) { const t = k / 160 * 2 * Math.PI; p.push([st.a * Math.cos(t), st.b * Math.sin(t)]); } return p; };
    const sim = HG.sim(cv, {
      height: (w) => Math.round(Math.min(w * 0.72, 470)),
      draw(ctx, tt, dt, C, S) {
        if (play) play.tick(dt);
        const pr = play ? play.prog : 0;
        const a = st.a, b = st.b;
        if (st.mode === "tilt") return drawTilt(ctx, C, S);
        const s = Math.min((S.w - 24) / (2 * a + 20), (S.h - 24) / (2 * a + 20));
        const cx = S.w / 2, cy = S.h / 2;
        const Q = (p) => [cx + p[0] * s, cy - p[1] * s];
        const ell = []; for (let k = 0; k <= 120; k++) { const t = k / 120 * 2 * Math.PI; ell.push(Q([a * Math.cos(t), b * Math.sin(t)])); }
        // axes (thin chain lines), always
        seg(ctx, Q([-a - 8, 0]), Q([a + 8, 0]), C.sea, 1, DASH.centre); seg(ctx, Q([0, -b - 8]), Q([0, b + 8]), C.sea, 1, DASH.centre);
        if (st.mode === "conc") {
          const f = (k) => clamp(pr - k, 0, 1), n = st.n;
          const circ = (r, k) => { const p = []; for (let i = 0; i <= 96 * k; i++) { const t = i / 96 * 2 * Math.PI; p.push(Q([r * Math.cos(t), r * Math.sin(t)])); } pline(ctx, p, C.muted, 1.1); };
          circ(a, f(0)); circ(b, f(1));
          const pts = [];
          for (let i = 0; i < n; i++) {
            const k = clamp((pr - 2) * n - i, 0, 1); if (k <= 0) break;
            const t = i / n * 2 * Math.PI, ct = Math.cos(t), sn = Math.sin(t);
            seg(ctx, Q([0, 0]), Q([a * ct * Math.min(1, k * 2), a * sn * Math.min(1, k * 2)]), alpha(C.muted, 0.8), 0.9);
            if (k > 0.5) {
              const kk = (k - 0.5) * 2, P = [a * ct, b * sn];
              seg(ctx, Q([a * ct, a * sn]), Q([a * ct, a * sn + (P[1] - a * sn) * kk]), C.sea, 1.1);
              seg(ctx, Q([b * ct, b * sn]), Q([b * ct + (P[0] - b * ct) * kk, b * sn]), C.gold, 1.1);
              if (kk >= 1) pts.push(P);
            }
          }
          pts.forEach((P) => dot2(ctx, ...Q(P), C.red, 3.2));
          if (pr >= 3) {
            const k = f(3), m = Math.round(ell.length * k);
            pline(ctx, ell.slice(0, Math.max(2, m)), C.ink, 2.6);
          }
          if (pr >= 3) {
            // the definition holds for a plotted point: PF1 + PF2 = major axis
            const c = Math.sqrt(a * a - b * b), t = 2 * Math.PI * 1 / st.n * Math.max(1, Math.round(st.n / 6)), P = [a * Math.cos(t), b * Math.sin(t)];
            const F1 = [-c, 0], F2 = [c, 0];
            seg(ctx, Q(F1), Q(P), C.lode, 1.4, [4, 3]); seg(ctx, Q(F2), Q(P), C.lode, 1.4, [4, 3]);
            dot2(ctx, ...Q(F1), C.lode, 3.5); dot2(ctx, ...Q(F2), C.lode, 3.5);
            lab(ctx, "F₁", Q(F1)[0], Q(F1)[1] + 12, { size: 12, bold: true, col: C.lode, align: "center" });
            lab(ctx, "F₂", Q(F2)[0], Q(F2)[1] + 12, { size: 12, bold: true, col: C.lode, align: "center" });
            lab(ctx, "P", Q(P)[0] + 8, Q(P)[1] - 8, { size: 12, bold: true, col: C.lode });
            const d1 = Math.hypot(P[0] - F1[0], P[1]), d2 = Math.hypot(P[0] - F2[0], P[1]);
            stageNote.innerHTML = `Plotted point P: PF₁ + PF₂ = ${N(d1)} + ${N(d2)} = <b>${N(d1 + d2)} mm</b> = the major axis (${N(2 * a, 0)} mm). Foci F₁, F₂ are ${N(c)} mm from the centre (√(a² − b²)).`;
          } else stageNote.textContent = ["Stage 1: draw a circle on the major axis.", "Stage 2: draw a circle on the minor axis, same centre.", `Stage 3: divide the circles with ${st.n} radial lines. From where each line cuts the big circle draw a vertical (blue); from the small circle a horizontal (gold). They meet on the ellipse.`][Math.min(2, Math.floor(pr))];
        } else {
          // trammel: P is the pen; A (b from P) runs on the major axis, B (a from P) on the minor axis
          pline(ctx, ell, alpha(C.muted, 0.5), 1, [3, 3]);
          pline(ctx, trail.map(Q), C.ink, 2.6);
          const t = st.tr * 2 * Math.PI, P = [a * Math.cos(t), b * Math.sin(t)];
          const A = [(a - b) * Math.cos(t), 0], B = [0, (b - a) * Math.sin(t)];
          const dir = unit([P[0] - B[0], P[1] - B[1], 0]);
          const e1 = [P[0] + dir[0] * 10, P[1] + dir[1] * 10], e0 = [B[0] - dir[0] * 10, B[1] - dir[1] * 10];
          const nrm = [-dir[1] * 5, dir[0] * 5];
          const strip = [[e0[0] + nrm[0], e0[1] + nrm[1]], [e1[0] + nrm[0], e1[1] + nrm[1]], [e1[0] - nrm[0], e1[1] - nrm[1]], [e0[0] - nrm[0], e0[1] - nrm[1]]].map(Q);
          fillPoly(ctx, strip, alpha(C.gold, 0.25), C.gold, 1.2);
          for (const [p, nm, col] of [[P, "P (pen)", C.red], [A, "A on major axis", C.sea], [B, "B on minor axis", C.violet]]) { dot2(ctx, ...Q(p), col, 4.5); lab(ctx, nm, Q(p)[0] + 8, Q(p)[1] - 10, { size: 12, bold: true, col }); }
          stageNote.innerHTML = `Strip marks: PA = semi-minor = <b>${N(b, 0)} mm</b>, PB = semi-major = <b>${N(a, 0)} mm</b>. Keep A on the major axis and B on the minor axis: P traces the ellipse.`;
        }
      },
    });
    function drawTilt(ctx, C, S) {
      const a = 60, phi = st.tilt * DEG;
      const s = Math.min((S.w - 30) / (2 * a + 2 * a + 60), (S.h - 30) / (2 * a + 30));
      const sx = 15 + a * s + 10, fx = S.w - 15 - a * s - 10, cy = S.h / 2;
      // side view (from the left, placed on the left): the circle is a line tilted phi from upright
      const SV = (d, y) => [sx + d * s, cy - y * s], FV = (x, y) => [fx + x * s, cy - y * s];
      seg(ctx, SV(0, -a - 10), SV(0, a + 10), alpha(C.muted, 0.6), 1, [3, 3]);
      lab(ctx, "picture plane", SV(0, a + 12)[0], SV(0, a + 12)[1], { size: 11, col: C.muted, align: "center" });
      seg(ctx, SV(-a * Math.sin(phi), -a * Math.cos(phi)), SV(a * Math.sin(phi), a * Math.cos(phi)), C.ink, 3);
      lab(ctx, "SIDE VIEW (edge-on)", sx, S.h - 10, { size: 11, bold: true, col: C.muted, align: "center" });
      lab(ctx, "VIEW", fx, S.h - 10, { size: 11, bold: true, col: C.muted, align: "center" });
      const n = 12, e = [];
      for (let k = 0; k <= 96; k++) { const t = k / 96 * 2 * Math.PI; e.push(FV(a * Math.cos(t), a * Math.sin(t) * Math.cos(phi))); }
      for (let k = 0; k < n; k++) {
        const t = k / n * 2 * Math.PI, y = a * Math.sin(t) * Math.cos(phi), d = a * Math.sin(t) * Math.sin(phi);
        seg(ctx, SV(d, y), FV(a * Math.cos(t), y), alpha(C.sea, 0.45), 0.9);
        dot2(ctx, ...FV(a * Math.cos(t), y), C.red, 3);
      }
      pline(ctx, e, C.ink, 2.6);
      seg(ctx, FV(-a - 8, 0), FV(a + 8, 0), C.sea, 1, DASH.centre); seg(ctx, FV(0, -a - 8), FV(0, a + 8), C.sea, 1, DASH.centre);
      const r = Math.cos(phi);
      stageNote.innerHTML = `The horizontal diameter stays true (major axis ${2 * a} mm); the vertical one shrinks to ${2 * a} × cos ${st.tilt}° = <b>${N(2 * a * r)} mm</b>. Ratio minor ÷ major = ${N(r, 3)}.` + (Math.abs(st.tilt - 55) <= 1 ? " At about 54.7° the ratio is 0.577: a horizontal circle in a true isometric projection." : "") + (st.tilt === 90 ? " Edge-on, the circle is a straight line." : "") + (st.tilt === 0 ? " Face-on, it is a true circle." : "");
    }
    play = stagePlayer(box, sim, 4, 0.5, null);
    box.append(stageNote);
    // the trammel animates continuously: its own play button replaces the stage player
    const tramPlay = btn("▶ Slide the strip", () => {
      if (HG.reduced) { st.tr = 1; trSlider.sync(100); trail = traceTo(1); sim.redraw(); return; }
      tramOn = !tramOn; tramPlay.textContent = tramOn ? "❚❚ Pause" : "▶ Slide the strip";
      if (tramOn) { if (st.tr >= 1) { st.tr = 0; trail = []; } sim.play(); } else sim.pause();
    }, "primary");
    let tramOn = false;
    trBox.append(tramPlay);
    const tick0 = play.tick;
    play.tick = (dt) => {
      if (st.mode === "tram" && tramOn) {
        st.tr = Math.min(1, st.tr + dt * 0.18); trail = traceTo(st.tr); trSlider.sync(Math.round(st.tr * 100));
        if (st.tr >= 1) { tramOn = false; tramPlay.textContent = "▶ Slide the strip"; sim.pause(); }
        return;
      }
      tick0(dt);
    };
    const reset0 = play.reset;
    play.reset = (to) => {
      if (st.mode === "tram") { tramOn = false; tramPlay.textContent = "▶ Slide the strip"; sim.pause(); trail = traceTo(st.tr); play.row.hidden = true; sim.redraw(); return; }
      play.row.hidden = st.mode === "tilt";
      reset0(to);
    };
    function info() {
      note.innerHTML = st.mode === "tilt"
        ? "A circle seen at an angle is an ellipse. Tilt it and only the diameter across the tilt is shortened. This is why circles on the faces of an isometric drawing, and the cut faces of cylinders, are drawn as ellipses."
        : `Ellipse: major axis <b>${N(2 * st.a, 0)} mm</b> (the longest diameter), minor axis <b>${N(2 * st.b, 0)} mm</b> (the shortest). They bisect each other at 90° at the centre.`;
      cv.setAttribute("aria-label", note.textContent);
    }
    info();
    play.sync();
  });

  /* =====================================================================
     5. Interpenetration: a barrel through a mast, plotted from generators
     ===================================================================== */
  mount("w-interpen", (box) => {
    const L = 72, H = 110, z0 = 55;
    const st = { mast: "cyl", br: "cyl", S: 30, r: 18, e: 0 };
    let play = null;
    const MAST = {
      cyl: { name: "cylindrical mast", X: (y, S) => Math.sqrt(Math.max(0, S * S - y * y)), inside: (x, y, S) => x * x + y * y < S * S - 1e-9, Y: (S) => S, Xm: (S) => S, ev: (S) => [[S, 0]], ee: (S) => [S] },
      sq: { name: "square mast (flat face to the front)", X: (y, S) => S, inside: (x, y, S) => Math.abs(x) < S - 1e-9 && Math.abs(y) < S - 1e-9, Y: (S) => S, Xm: (S) => S, ev: (S) => [[S, -S]], ee: (S) => [S] },
      dia: { name: "square mast turned 45° (corner to the front)", X: (y, S) => S * Math.SQRT2 - Math.abs(y), inside: (x, y, S) => Math.abs(x) + Math.abs(y) < S * Math.SQRT2 - 1e-9, Y: (S) => S * Math.SQRT2, Xm: (S) => S * Math.SQRT2, ev: (S) => [[S * Math.SQRT2, 0], [0, -S * Math.SQRT2]], ee: (S) => [S * Math.SQRT2, 0] },
      hex: { name: "hexagonal mast", X: (y, S) => (2 * S - Math.abs(y)) / Math.sqrt(3), inside: (x, y, S) => Math.abs(y) < S - 1e-9 && Math.abs(x) < (2 * S - Math.abs(y)) / Math.sqrt(3) - 1e-9, Y: (S) => S, Xm: (S) => 2 * S / Math.sqrt(3), ev: (S) => [[2 * S / Math.sqrt(3), 0], [S / Math.sqrt(3), -S]], ee: (S) => [S, 0] },
    };
    const outlinePlan = (m, S) => m === "cyl" ? M3.ngon(72, S, 0) : m === "sq" ? M3.ngon(4, S * Math.SQRT2, 45) : m === "dia" ? M3.ngon(4, S * Math.SQRT2, 0) : M3.ngon(6, 2 * S / Math.sqrt(3), 0);
    HG.choice(box, "Mast:", [["cyl", "Cylinder"], ["sq", "Square prism"], ["dia", "Square prism at 45°"], ["hex", "Hexagonal prism"]], st.mast, (v) => { st.mast = v; fix(); });
    HG.choice(box, "Through it:", [["cyl", "Cylinder (gun barrel)"], ["sq", "Square prism (timber)"]], st.br, (v) => { st.br = v; fix(); });
    const ctl = controls(box);
    const sS = HG.slider(ctl, { label: "Mast size (radius or half-width)", min: 20, max: 34, step: 1, value: st.S, unit: "mm", oninput: (v) => { st.S = v; fix(); } });
    const rS = HG.slider(ctl, { label: "Barrel radius r (or half-width)", min: 6, max: 34, step: 1, value: st.r, unit: "mm", oninput: (v) => { st.r = v; fix(); } });
    const eS = HG.slider(ctl, { label: "Offset of the barrel's axis (towards / away)", min: -30, max: 30, step: 1, value: st.e, unit: "mm", oninput: (v) => { st.e = v; fix(); } });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    const stageNote = HG.el("p", { class: "hint", "aria-live": "polite" });
    function fix() {
      const M = MAST[st.mast];
      if (st.r > st.S) { st.r = st.S; rS.sync(st.r); }
      const lim = Math.max(0, Math.floor(M.Y(st.S) - st.r));
      if (Math.abs(st.e) > lim) { st.e = Math.sign(st.e) * lim; eS.sync(st.e); }
      play && play.reset();
      info();
    }
    const brInside = (y, z) => st.br === "cyl" ? (y - st.e) ** 2 + (z - z0) ** 2 < st.r * st.r - 1e-9 : Math.abs(y - st.e) < st.r - 1e-9 && Math.abs(z - z0) < st.r - 1e-9;
    const brPoint = (u) => { // u in [0,1): around the barrel's section, starting at the top, going towards the front
      if (st.br === "cyl") { const p = Math.PI / 2 + u * 2 * Math.PI; return [st.e + st.r * Math.cos(p), z0 + st.r * Math.sin(p)]; }
      const r = st.r, q = (u * 8) % 8, c = [[0, r], [-r, r], [-r, 0], [-r, -r], [0, -r], [r, -r], [r, 0], [r, r]];
      const i = Math.floor(q), f = q - i, A = c[i], B = c[(i + 1) % 8];
      return [st.e + A[0] + (B[0] - A[0]) * f, z0 + A[1] + (B[1] - A[1]) * f];
    };
    const gens = () => { const n = st.br === "cyl" ? 12 : 8; const g = []; for (let k = 0; k < n; k++) g.push(brPoint(k / n)); return g; };
    // a point on the line of intersection, seen from the front: hidden if either solid is in front of it
    // in the elevation the line of intersection is straight unless a curved surface meets a face seen at an angle
    const straightOnly = () => st.br === "sq" || st.mast === "sq" || (st.mast === "cyl" && st.r === st.S && st.e === 0);
    // is any of the mast between this point and the viewer (who is towards −y)?
    const behindMast = (x, y) => { const M = MAST[st.mast], lim = 2 * M.Y(st.S) + 2; for (let k = 0.25; k < lim; k += 0.5) if (M.inside(x, y - k, st.S)) return true; return false; };
    const hiddenElev = (x, y, z) => MAST[st.mast].inside(x, y - 0.05, st.S) || brInside(y - 0.05, z);
    const sim = HG.sim(cv, {
      height: (w) => Math.round(w * 0.86),
      draw(ctx, tt, dt, C, S) {
        if (play) play.tick(dt);
        const M = MAST[st.mast], Sz = st.S, YM = 50;
        const PZ = H + 16 + YM, EX = L + 20 + YM;
        const bx0 = -L - 6, bx1 = EX + YM + 6, bz0 = -22, bz1 = PZ + YM + 6;
        const s = Math.min((S.w - 12) / (bx1 - bx0), (S.h - 12) / (bz1 - bz0));
        const ox = (S.w - (bx1 - bx0) * s) / 2 - bx0 * s, oy = S.h - (S.h - (bz1 - bz0) * s) / 2 + bz0 * s;
        const Q = (x, z) => [ox + x * s, oy - z * s];
        const PL = (x, y) => Q(x, PZ + y), EN = (y, z) => Q(EX + y, z);
        const ng = gens().length, pr = play ? Math.min(play.prog, ng + 1) : ng + 1;
        // ---------- views of the mast ----------
        // elevation: top, bottom, and each vertical edge, broken where the barrel passes
        const Xm = M.Xm(Sz);
        seg(ctx, Q(-Xm, 0), Q(Xm, 0), C.ink, 2.1); seg(ctx, Q(-Xm, H), Q(Xm, H), C.ink, 2.1);
        const edgeRun = (xv, yv) => {
          let cur = null, from = 0;
          const flush = (z) => { if (cur === "vis") seg(ctx, Q(xv, from), Q(xv, z), C.ink, 2.1); if (cur === "hid") seg(ctx, Q(xv, from), Q(xv, z), C.ink2, 1.1, DASH.hidden); };
          for (let z = 0; z <= H + 1e-6; z += 0.5) {
            let c = "vis";
            const dz = z - z0;
            if (brInside(yv, z) && Math.abs(xv) <= L) c = "none";
            else if (Math.abs(dz) < st.r) { const w = st.br === "cyl" ? Math.sqrt(st.r * st.r - dz * dz) : st.r; if (yv >= st.e + w) c = "hid"; }
            if (c !== cur) { flush(z); cur = c; from = z; }
          }
          flush(H);
        };
        M.ev(Sz).forEach(([xv, yv]) => { edgeRun(xv, yv); if (xv > 1e-9) edgeRun(-xv, yv); });
        lab(ctx, "ELEVATION", Q(0, -3)[0], Q(0, -3)[1] + 2, { size: 11, bold: true, col: C.muted, align: "center", base: "top" });
        // plan: the mast's section, and the barrel either side of it
        const op = outlinePlan(st.mast, Sz).map(([x, y]) => PL(x, y));
        pline(ctx, op, C.ink, 2.1, null, true);
        seg(ctx, PL(-Xm - 8, 0), PL(Xm + 8, 0), C.sea, 1, DASH.centre); seg(ctx, PL(0, -M.Y(Sz) - 8), PL(0, M.Y(Sz) + 8), C.sea, 1, DASH.centre);
        for (const sg of [-1, 1]) {
          for (const yy of [st.e - st.r, st.e + st.r]) {
            const x0 = st.br === "cyl" ? M.X(yy, Sz) : M.X(yy, Sz);
            seg(ctx, PL(sg * x0, yy), PL(sg * L, yy), C.ink, 2.1);
          }
          seg(ctx, PL(sg * L, st.e - st.r), PL(sg * L, st.e + st.r), C.ink, 2.1);
          seg(ctx, PL(sg * (M.X(st.e, Sz) - 4), st.e), PL(sg * (L + 6), st.e), C.sea, 1, DASH.centre);
        }
        lab(ctx, "PLAN", PL(-L, YM - 4)[0], PL(-L, YM - 4)[1], { size: 11, bold: true, col: C.muted });
        // end elevation (from the right): mast edges, then the barrel's end in front of them
        const Ym = M.Y(Sz);
        seg(ctx, EN(-Ym, 0), EN(Ym, 0), C.ink, 2.1); seg(ctx, EN(-Ym, H), EN(Ym, H), C.ink, 2.1);
        M.ee(Sz).forEach((yv) => { seg(ctx, EN(yv, 0), EN(yv, H), C.ink, 2.1); if (yv > 1e-9) seg(ctx, EN(-yv, 0), EN(-yv, H), C.ink, 2.1); });
        const sect = []; for (let k = 0; k <= 96; k++) sect.push(brPoint(k / 96));
        fillPoly(ctx, sect.map(([y, z]) => EN(y, z)), C.card, C.ink, 2.1);
        seg(ctx, EN(st.e - st.r - 6, z0), EN(st.e + st.r + 6, z0), C.sea, 1, DASH.centre); seg(ctx, EN(st.e, z0 - st.r - 6), EN(st.e, z0 + st.r + 6), C.sea, 1, DASH.centre);
        lab(ctx, "END ELEVATION", EN(0, -3)[0], EN(0, -3)[1] + 2, { size: 11, bold: true, col: C.muted, align: "center", base: "top" });
        // the barrel in the elevation: its outline beyond the mast
        for (const sg of [-1, 1]) {
          // top and bottom outlines of the barrel: each sample is visible unless the mast stands in front of it
          const edgesY = st.br === "sq" ? [st.e - st.r, st.e + st.r] : [st.e];
          for (const zz of [z0 - st.r, z0 + st.r]) {
            let run = [], cur = null;
            const flush = () => { if (run.length > 1 && cur) pline(ctx, run, cur === "hid" ? C.ink2 : C.ink, cur === "hid" ? 1.1 : 2.1, cur === "hid" ? DASH.hidden : null); };
            for (let x = 0; x <= L + 1e-6; x += 0.5) {
              const there = edgesY.filter((y) => x >= M.X(y, Sz) - 1e-9);
              let c = null;
              if (there.length) c = there.some((y) => !behindMast(x, y)) ? "vis" : "hid";
              if (c !== cur) { const last = run[run.length - 1]; flush(); run = c && cur && last ? [last] : []; cur = c; }
              if (c) run.push(Q(sg * x, zz));
            }
            flush();
          }
          seg(ctx, Q(sg * L, z0 - st.r), Q(sg * L, z0 + st.r), C.ink, 2.1);
          seg(ctx, Q(sg * (M.X(st.e, Sz) - 4), z0), Q(sg * (L + 6), z0), C.sea, 1, DASH.centre);
        }
        seg(ctx, Q(0, -6), Q(0, H + 6), C.sea, 1, DASH.centre);
        seg(ctx, EN(0, -6), EN(0, H + 6), C.sea, 1, DASH.centre);
        // mitre line between the plan and the end elevation
        seg(ctx, Q(EX - YM, PZ - YM), Q(EX + YM, PZ + YM), alpha(C.muted, 0.8), 1);
        { const mp = Q(EX + YM * 0.45, PZ + YM * 0.45); lab(ctx, "45° mitre", Math.min(mp[0] - 6, S.w - 4), mp[1] - 2, { size: 11, col: C.muted, align: "right" }); }
        // ---------- construction from the generators ----------
        const G = gens();
        G.forEach(([y, z], k) => {
          const p = EN(y, z);
          dot2(ctx, ...p, C.gold, 2.8);
          const o = unit([y - st.e, z - z0, 0]);
          const lp = EN(y + o[0] * 9, z + o[1] * 9);
          lab(ctx, String(k + 1), lp[0], lp[1], { size: 10, col: C.gold, align: "center" });
        });
        const done = pr >= ng + 1 - 1e-9;
        G.forEach(([y, z], k) => {
          const f = done ? 1 : clamp(pr - k, 0, 1);
          if (f <= 0) return;
          const x = M.X(y, Sz), col = done ? alpha(C.sea, 0.28) : alpha(C.sea, 0.85);
          const path = [EN(y, z), EN(y, PZ + y), PL(x, y), Q(x, z)];
          // walk the path: up to the mitre, across to the plan, down to the elevation
          const lens = [0]; for (let i = 1; i < path.length; i++) lens.push(lens[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
          const want = lens[lens.length - 1] * Math.min(1, f * 1.25), part = [path[0]];
          for (let i = 1; i < path.length; i++) {
            if (lens[i] <= want) part.push(path[i]);
            else { const t = (want - lens[i - 1]) / (lens[i] - lens[i - 1]); part.push([path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t]); break; }
          }
          pline(ctx, part, col, 1);
          // horizontal projector from the end elevation to the elevation
          if (f > 0.5) {
            const g2 = Math.min(1, (f - 0.5) * 2), a = EN(y, z), b = Q(x, z);
            seg(ctx, a, [a[0] + (b[0] - a[0]) * g2, a[1]], done ? alpha(C.gold, 0.3) : alpha(C.gold, 0.85), 1);
          }
          if (f >= 1) { dot2(ctx, ...PL(x, y), C.gold, 2.6); dot2(ctx, ...Q(x, z), C.red, 3.2); dot2(ctx, ...Q(-x, z), C.red, 3.2); }
        });
        // ---------- the line of intersection, visible and hidden ----------
        if (pr > ng) {
          const k = done ? 1 : clamp(pr - ng, 0, 1), n = 240;
          for (const sg of [-1, 1]) {
            let run = [], hid = null;
            const flush = () => { if (run.length > 1) pline(ctx, run, hid ? C.ink2 : C.lode, hid ? 1.3 : 2.8, hid ? DASH.hidden : null); };
            for (let i = 0; i <= n * k; i++) {
              const [y, z] = brPoint(i / n), x = M.X(y, Sz), h = hiddenElev(x, y, z);
              if (hid !== null && h !== hid) { const last = run[run.length - 1]; flush(); run = [last]; }
              hid = h; run.push(Q(sg * x, z));
            }
            flush();
          }
        }
        const gi = Math.min(ng, Math.floor(pr));
        stageNote.textContent = done ? (straightOnly() ? "Finished: here every part of the line of intersection is straight, so the red points are joined with straight lines (magenta). Parts behind the mast or the timber are hidden detail." : "Finished: the red points, joined by a smooth curve, give the line of intersection (magenta). Parts behind the mast or the barrel are hidden detail.") :
          `Generator ${Math.min(ng, gi + 1)}: from its point on the barrel's end view, project up to the mitre, across to the plan (where it meets the mast), then down to the elevation. Where that meets the horizontal from the end view is a point on the curve.`;
      },
    });
    function info() {
      const M = MAST[st.mast];
      let t = `A ${st.br === "cyl" ? "cylindrical barrel" : "square timber"} (${st.br === "cyl" ? "radius" : "half-width"} ${st.r} mm) passes through a ${M.name}${st.e ? `, its axis offset ${Math.abs(st.e)} mm ${st.e < 0 ? "towards you" : "away from you"}` : ", axes meeting"}. `;
      const pair = st.mast + "/" + st.br;
      if (pair === "cyl/cyl") t += st.r === st.S && st.e === 0 ? "<b>Equal diameters with axes that meet:</b> the curves flatten into straight lines in the elevation. That special case is worth remembering." : "Two cylinders meet in a curve. The smaller the barrel compared with the mast, the flatter the curve.";
      if (pair === "sq/cyl") t += "The round barrel meets the mast's flat side faces, which are seen edge-on in the elevation, so there the line of intersection is a straight line along the mast's outline.";
      if (pair === "dia/cyl") t += "The round barrel meets two sloping flat faces on each side. Each meeting is part of an ellipse, seen in the elevation as two curves that meet on the mast's front corner line.";
      if (pair === "hex/cyl") t += "The round barrel meets the sloping flat faces of the hexagon. Each meeting is part of an ellipse, seen as curves in the elevation that meet where the faces meet.";
      if (pair === "cyl/sq") t += "The timber's flat top and bottom meet the round mast in curves, but those curves lie in horizontal planes, seen edge-on as straight lines in the elevation. Its upright sides meet the mast in vertical straight lines.";
      if (pair === "sq/sq" || pair === "dia/sq" || pair === "hex/sq") t += "Flat faces meet flat faces, so every part of the line of intersection is a straight line: plot the corner points and join them with straight lines.";
      if (st.e) t += " With the offset the intersection is no longer symmetrical front to back, and parts of it, and of the barrel's outline, are hidden behind the mast.";
      note.innerHTML = t;
      cv.setAttribute("aria-label", "Plan, elevation and end elevation of the interpenetration. " + note.textContent);
    }
    play = stagePlayer(box, sim, 13, 0.9, null);
    box.append(stageNote);
    const reset0 = play.reset;
    play.reset = (to) => { play.n = gens().length + 1; reset0(to == null ? gens().length + 1 : to); };
    info();
    play.reset();
  });

  /* =====================================================================
     6. Surface developments: unfold the solid face by face into its net
     ===================================================================== */
  // rigid transforms {R: 3x3 rows, t}
  const TI = () => ({ R: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], t: [0, 0, 0] });
  const mv = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];
  const mm = (A, B) => A.map((row) => [0, 1, 2].map((j) => row[0] * B[0][j] + row[1] * B[1][j] + row[2] * B[2][j]));
  const tApply = (T, p) => add(mv(T.R, p), T.t);
  const tCompose = (A, B) => ({ R: mm(A.R, B.R), t: add(mv(A.R, B.t), A.t) });
  function tRot(P, k, th) {
    const c = Math.cos(th), s = Math.sin(th), v = 1 - c, [x, y, z] = k;
    const R = [[c + x * x * v, x * y * v - z * s, x * z * v + y * s], [y * x * v + z * s, c + y * y * v, y * z * v - x * s], [z * x * v - y * s, z * y * v + x * s, c + z * z * v]];
    return { R, t: sub(P, mv(R, P)) };
  }
  mount("w-develop", (box) => {
    const st = { type: "cone", D: 60, H: 80, cut: "none", cpos: 0.55, cang: 20, u: 1 };
    const TYPES = { hex: "Hexagonal prism (lantern)", cyl: "Cylinder (cartridge)", pyr: "Square pyramid (capstan cover)", cone: "Cone (speaking trumpet)" };
    HG.choice(box, "Solid:", Object.entries(TYPES).map(([k, v]) => [k, v]), st.type, (v) => { st.type = v; rebuild(); });
    HG.choice(box, "Cut:", [["none", "None"], ["par", "Parallel to base"], ["inc", "Inclined"]], st.cut, (v) => { st.cut = v; rebuild(); });
    const ctl = controls(box);
    HG.slider(ctl, { label: "Base size: diameter, side (pyramid) or across corners (hexagon)", min: 30, max: 80, step: 2, value: st.D, unit: "mm", oninput: (v) => { st.D = v; rebuild(); } });
    HG.slider(ctl, { label: "Height", min: 40, max: 110, step: 2, value: st.H, unit: "mm", oninput: (v) => { st.H = v; rebuild(); } });
    HG.slider(ctl, { label: "Cut height", min: 30, max: 85, step: 1, value: st.cpos * 100, unit: "%", oninput: (v) => { st.cpos = v / 100; rebuild(); } });
    HG.slider(ctl, { label: "Cut angle (inclined)", min: 5, max: 35, step: 1, value: st.cang, unit: "°", oninput: (v) => { st.cang = v; rebuild(); } });
    const uS = HG.slider(ctl, { label: "Unfold", min: 0, max: 100, step: 1, value: 100, unit: "%", oninput: (v) => { st.u = v / 100; sim.redraw(); } });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    let G = null, dir = 1, simRef = null;
    const playB = btn("▶ Fold and unfold", () => {
      if (HG.reduced) { st.u = st.u > 0.5 ? 0 : 1; uS.sync(Math.round(st.u * 100)); sim.redraw(); return; }
      if (sim.playing) { sim.pause(); } else { dir = st.u > 0.5 ? -1 : 1; sim.play(); }
    }, "primary");
    rowIn(box, playB, btn("Folded", () => { sim.pause(); st.u = 0; uS.sync(0); sim.redraw(); }), btn("Flat net", () => { sim.pause(); st.u = 1; uS.sync(100); sim.redraw(); }));

    function build() {
      const t = st.type, radial = t === "pyr" || t === "cone", n = t === "hex" ? 6 : t === "pyr" ? 4 : 48;
      const Rb = t === "pyr" ? st.D / Math.SQRT2 : st.D / 2, H = st.H;
      const base = M3.ngon(n, Rb, t === "pyr" ? 45 : t === "hex" ? 0 : 90 + 180 / n).map(([x, y]) => [x, y, 0]);
      const apex = [0, 0, H];
      const top = base.map((b) => (radial ? apex : [b[0], b[1], H]));
      const hc = st.cpos * H, ta = st.cut === "inc" ? Math.tan(st.cang * DEG) : 0;
      const cutP = base.map((b, i) => {
        if (st.cut === "none") return top[i];
        if (!radial) return [b[0], b[1], clamp(hc - b[0] * ta, 0, H)];
        const s = clamp((hc - b[0] * ta) / (H - b[0] * ta), 0, 1);
        return add(b, mul(sub(apex, b), s));
      });
      const faces = base.map((b, i) => { const j = (i + 1) % n; return { pts: [b, base[j], cutP[j], cutP[i]], i }; });
      const cen = [0, 0, H / 3];
      faces.forEach((f) => { f.n = M3.newell(f.pts.filter((p, k) => k === 0 || M3.key(p) !== M3.key(f.pts[k - 1]))); if (dot(f.n, sub(M3.centroid(f.pts), cen)) < 0) f.n = mul(f.n, -1); });
      return { n, base, top, cutP, faces, radial, apex, Rb, H };
    }
    function rebuild() { G = build(); info(); sim.redraw(); }
    const cm = M3.cam(-24, 22), L = unit([-0.4, -0.9, 0.7]);
    function transforms(u) {
      const { n, base, top, faces } = G;
      // fix the face that looks most nearly at the camera; unfold outwards both ways from it
      let m = 0, best = -9; faces.forEach((f, i) => { const d = dot(f.n, cm.t); if (d > best) { best = d; m = i; } });
      const T = new Array(n); T[m] = TI();
      const right = Math.floor((n - 1) / 2);
      const hinge = (g) => [base[g], unit(sub(top[g], base[g]))];
      for (let s = 1; s <= right; s++) {
        const j = (m + s) % n, p = (j - 1 + n) % n, [P, k] = hinge(j);
        const ang = Math.acos(clamp(dot(faces[p].n, faces[j].n), -1, 1));
        const sgn = dot(mv(tRot(P, k, ang).R, faces[j].n), faces[p].n) > 0.999 ? 1 : -1;
        T[j] = tCompose(T[p], tRot(P, k, u * ang * sgn));
      }
      for (let s = 1; s <= n - 1 - right; s++) {
        const j = (m - s + n) % n, p = (j + 1) % n, [P, k] = hinge(p);
        const ang = Math.acos(clamp(dot(faces[p].n, faces[j].n), -1, 1));
        const sgn = dot(mv(tRot(P, k, ang).R, faces[j].n), faces[p].n) > 0.999 ? 1 : -1;
        T[j] = tCompose(T[p], tRot(P, k, u * ang * sgn));
      }
      return { T, m, right };
    }
    const sim = HG.sim(cv, {
      height: (w) => Math.round(w >= 640 ? w * 0.5 : w * 1.25),
      draw(ctx, tt, dt, C, S) {
        if (!G) G = build();
        if (simRef && simRef.playing) {
          st.u = clamp(st.u + dir * dt * 0.45, 0, 1); uS.sync(Math.round(st.u * 100));
          if (st.u <= 0 || st.u >= 1) { simRef.pause(); }
        }
        const wide = S.w >= 640;
        const A = wide ? { x: 0, y: 0, w: S.w * 0.5, h: S.h } : { x: 0, y: 0, w: S.w, h: S.h * 0.5 };
        const B = wide ? { x: S.w * 0.5, y: 0, w: S.w * 0.5, h: S.h } : { x: 0, y: S.h * 0.5, w: S.w, h: S.h * 0.5 };
        ctx.save(); ctx.strokeStyle = alpha(C.line, 0.9); ctx.setLineDash([2, 4]); ctx.beginPath();
        if (wide) { ctx.moveTo(B.x, 8); ctx.lineTo(B.x, S.h - 8); } else { ctx.moveTo(8, B.y); ctx.lineTo(S.w - 8, B.y); }
        ctx.stroke(); ctx.restore();
        draw3D(ctx, C, A); drawNet(ctx, C, B);
        lab(ctx, `3D: ${Math.round(st.u * 100)}% unfolded`, A.x + 10, A.y + 12, { size: 11, bold: true, col: C.muted });
        lab(ctx, "DEVELOPMENT (true size, to scale)", B.x + 10, B.y + 12, { size: 11, bold: true, col: C.muted });
      },
    });
    simRef = sim;
    const syncPlay = () => { playB.textContent = sim.playing ? "❚❚ Pause" : "▶ Fold and unfold"; };
    sim.pause = ((p) => () => { p(); syncPlay(); })(sim.pause);
    sim.play = ((p) => () => { p(); syncPlay(); })(sim.play);

    function draw3D(ctx, C, A) {
      // scale fixed for this solid, folded or flat, so the animation does not zoom
      const P0 = (p) => proj(cm, p);
      let lo = [1e9, 1e9], hi = [-1e9, -1e9];
      for (const u of [0, 1]) { const { T } = transforms(u); G.faces.forEach((f, i) => f.pts.forEach((p) => { const q = P0(tApply(T[i], p)); lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; })); }
      const s = Math.min((A.w - 24) / (hi[0] - lo[0]), (A.h - 40) / (hi[1] - lo[1]));
      const cx = A.x + A.w / 2 - (lo[0] + hi[0]) / 2 * s, cy = A.y + 22 + (A.h - 30) / 2 + (lo[1] + hi[1]) / 2 * s;
      const Q = (p) => { const q = P0(p); return [cx + q[0] * s, cy - q[1] * s]; };
      const { T, m } = transforms(st.u);
      const curved = st.type === "cyl" || st.type === "cone";
      const outside = mix(C.card, C.gold, 0.35), inside = mix(SHADE, C.gold, 0.55);
      const list = G.faces.map((f, i) => { const pts = f.pts.map((p) => tApply(T[i], p)); return { i, pts, n: mv(T[i].R, f.n), d: dot(M3.centroid(pts), cm.t) }; });
      list.sort((a, b) => a.d - b.d);
      const n = G.n, seamA = (m + Math.floor((n - 1) / 2) + 1) % n;
      for (const f of list) {
        const front = dot(f.n, cm.t) > 0;
        const k = 0.45 + 0.55 * Math.abs(dot(f.n, L));
        const col = front ? mix(SHADE, outside, 0.35 + 0.65 * k) : mix(SHADE, inside, 0.5 + 0.4 * k);
        const sp = f.pts.map(Q);
        fillPoly(ctx, sp, col, col, 0.9);
        // edges belonging to this face, drawn now so that nearer faces cover them
        seg(ctx, sp[0], sp[1], C.ink, 1.6); seg(ctx, sp[2], sp[3], C.ink, 1.6);
        if (!curved || f.i === seamA) seg(ctx, sp[0], sp[3], C.ink, curved ? 1.6 : 1.1, !curved && f.i !== seamA ? DASH.fold : null);
        if (curved && (f.i + 1) % n === seamA) seg(ctx, sp[1], sp[2], C.ink, 1.6);
        if (!curved && (f.i + 1) % n === seamA) seg(ctx, sp[1], sp[2], C.ink, 1.1);
      }
    }
    // the development, computed directly from true lengths
    function netPts() {
      const { n, base, top, cutP, radial, apex } = G;
      const { m } = transforms(1);
      const start = (m + Math.floor((n - 1) / 2) + 1) % n; // the seam generator
      const order = []; for (let k = 0; k <= n; k++) order.push((start + k) % n);
      const B = [], Cc = [], gen = [];
      if (!radial) {
        let x = 0;
        order.forEach((g, k) => {
          if (k) x += Math.hypot(base[g][0] - base[order[k - 1]][0], base[g][1] - base[order[k - 1]][1]);
          B.push([x, 0]); Cc.push([x, cutP[g][2]]); gen.push(g);
        });
      } else {
        let a = 0;
        order.forEach((g, k) => {
          if (k) { const u1 = unit(sub(base[order[k - 1]], apex)), u2 = unit(sub(base[g], apex)); a += Math.acos(clamp(dot(u1, u2), -1, 1)); }
          const Lg = len(sub(base[g], apex)), Lc = len(sub(cutP[g], apex));
          B.push([Lg * Math.sin(a), -Lg * Math.cos(a)]); Cc.push([Lc * Math.sin(a), -Lc * Math.cos(a)]); gen.push(g);
        });
        // turn the fan so it hangs symmetrically below the apex
        const mid = a / 2, rot = (p) => [p[0] * Math.cos(-mid) - p[1] * Math.sin(-mid), p[0] * Math.sin(-mid) + p[1] * Math.cos(-mid)];
        for (let k = 0; k < B.length; k++) { B[k] = rot(B[k]); Cc[k] = rot(Cc[k]); }
        B.total = a;
      }
      return { B, Cc, gen, total: B.total };
    }
    function drawNet(ctx, C, A) {
      const { B, Cc, total } = netPts(), radial = G.radial, curved = st.type === "cyl" || st.type === "cone";
      const all = B.concat(Cc).concat(radial ? [[0, 0]] : []);
      const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
      const lo = [Math.min(...xs), Math.min(...ys)], hi = [Math.max(...xs), Math.max(...ys)];
      const s = Math.min((A.w - 30) / (hi[0] - lo[0] || 1), (A.h - 90) / (hi[1] - lo[1] || 1));
      const ox = A.x + A.w / 2 - (lo[0] + hi[0]) / 2 * s, oy = A.y + 46 + (A.h - 90) / 2 + (lo[1] + hi[1]) / 2 * s;
      const Q = (p) => [ox + p[0] * s, oy - p[1] * s];
      const poly = B.map(Q).concat(Cc.slice().reverse().map(Q));
      fillPoly(ctx, poly, mix(C.card, C.gold, 0.25));

      for (let k = 1; k < B.length - 1; k++) {
        if (curved) { if (k % 4 === 0) seg(ctx, Q(B[k]), Q(Cc[k]), alpha(C.muted, 0.7), 0.8); }
        else seg(ctx, Q(B[k]), Q(Cc[k]), C.ink, 1.1, DASH.fold);
      }
      pline(ctx, B.map(Q), C.ink, 2.2); pline(ctx, Cc.map(Q), C.ink, 2.2);
      seg(ctx, Q(B[0]), Q(Cc[0]), C.ink, 2.2); seg(ctx, Q(B[B.length - 1]), Q(Cc[Cc.length - 1]), C.ink, 2.2);
      if (radial) { dot2(ctx, ...Q([0, 0]), C.lode, 3.5); lab(ctx, "apex", Q([0, 0])[0] + 8, Q([0, 0])[1] + 4, { size: 11, col: C.lode }); }
      // dimensions
      const yB = Math.min(...ys);
      if (!radial) {
        const a = Q([B[0][0], yB]), b = Q([B[B.length - 1][0], yB]);
        HG.arrow(ctx, (a[0] + b[0]) / 2, a[1] + 16, a[0], a[1] + 16, C.red, 1.2, 7); HG.arrow(ctx, (a[0] + b[0]) / 2, a[1] + 16, b[0], b[1] + 16, C.red, 1.2, 7);
        lab(ctx, `${N(st.type === "cyl" ? Math.PI * st.D : B[B.length - 1][0])} mm`, (a[0] + b[0]) / 2, a[1] + 30, { size: 12, bold: true, align: "center", col: C.red });
      } else {
        lab(ctx, `sector angle ${N(st.type === "cone" ? 360 * (st.D / 2) / Math.hypot(st.H, st.D / 2) : total / DEG)}°`, Q([0, 0])[0], Q([0, 0])[1] - 16, { size: 12, bold: true, align: "center", col: C.red });
      }
    }
    function info() {
      const D = st.D, H = st.H, R = D / 2, t = st.type;
      let s = "";
      if (t === "hex") s = `<b>Parallel-line development.</b> Six faces in a strip: length = perimeter = 6 × side = 6 × ${N(R)} = <b>${N(6 * R)} mm</b>. The edges between faces are fold lines (thin, long dash double dot).`;
      if (t === "cyl") s = `<b>Parallel-line development.</b> The curved surface rolls out into a rectangle: length = circumference = π × D = π × ${D} = <b>${N(Math.PI * D)} mm</b>, height ${H} mm. No fold lines: a curved surface is rolled, not folded. The thin lines are generators used to plot the cut.`;
      if (t === "pyr") { const hd = D / Math.SQRT2, Ls = Math.hypot(H, hd); s = `<b>Radial-line development.</b> Four triangles fan out from the apex. Base ${D} × ${D} mm. Each sloping corner edge must be drawn at its <b>true length</b>: √(H² + (half the diagonal)²) = √(${H}² + ${N(hd)}²) = <b>${N(Ls)} mm</b>.`; }
      if (t === "cone") { const Ls = Math.hypot(H, R); s = `<b>Radial-line development.</b> A sector of a circle. Slant height L = √(H² + R²) = √(${H}² + ${N(R)}²) = <b>${N(Ls)} mm</b>. Sector angle = 360° × R ÷ L = 360 × ${N(R)} ÷ ${N(Ls)} = <b>${N(360 * R / Ls)}°</b>. The arc length equals the base circumference, π × ${D} = ${N(Math.PI * D)} mm.`; }
      if (st.cut === "par") s += t === "cone" ? ` Cut parallel to the base, the frustum's top edge is an arc of radius ${N(Math.hypot(st.H, st.D / 2) * (1 - st.cpos))} mm about the same apex.` : t === "pyr" ? ` Cut parallel to the base, each corner edge is cut ${N(Math.hypot(st.H, st.D / Math.SQRT2) * (1 - st.cpos))} mm (true length) from the apex.` : " Cut parallel to the base, the top edge stays straight.";
      if (st.cut === "inc") s += t === "cone" ? " Cut at an angle, each generator's cut point must be found at its true distance from the apex (project it horizontally across to the outside generator in the elevation, the one seen at true length) before swinging it round on the net." : t === "pyr" ? " Cut at an angle, the corner edges are not at true length in the elevation: find each edge's true length by rotation (chapter 2), mark the cut point on it, and use that true distance from the apex on the net." : " Cut at an angle, each generator keeps its own height: transfer the heights across from the elevation.";
      note.innerHTML = s;
      cv.setAttribute("aria-label", TYPES[st.type] + " unfolding into its development. " + note.textContent);
    }
    rebuild();
  });

  /* =====================================================================
     7. Pictorial views: one block model, six projections, morphing live
     ===================================================================== */
  mount("w-pictorial", (box) => {
    // a little ship of the line, built from unit blocks: x along the hull, y across, z up
    const cells = new Map(), mat = {};
    const put = (x, y, z, m) => { cells.set(x + "," + y + "," + z, m); };
    for (let x = 1; x <= 7; x++) for (let y = 0; y < 3; y++) put(x, y, 0, "hull");
    for (let x = 0; x <= 8; x++) for (let y = 0; y < 3; y++) if (!(x === 8 && y !== 1)) put(x, y, 1, "hull");
    for (let x = 0; x <= 1; x++) for (let y = 0; y < 3; y++) put(x, y, 2, "castle");
    for (let z = 2; z <= 5; z++) put(5, 1, z, "mast");
    put(4, 1, 5, "yard"); put(6, 1, 5, "yard");
    const has = (x, y, z) => cells.has(x + "," + y + "," + z);
    const c30 = Math.cos(30 * DEG), s30 = 0.5, c45 = Math.SQRT1_2;
    const k = Math.sqrt(2 / 3);
    // each projection: where a unit step along x, y and z lands on the page (x right, y up)
    const PROJ = {
      isoD: { name: "Isometric drawing", m: [[c30, -s30], [c30, s30], [0, 1]], text: "Verticals stay vertical; the other two axes go back at 30° to the horizontal, 120° apart. Every axis is drawn full size, so you can measure along any of them. No face is true shape: the round gun ports and hatch all become ellipses." },
      isoP: { name: "Isometric projection", m: [[c30 * k, -s30 * k], [c30 * k, s30 * k], [0, k]], text: "The true projection of a cube seen along its long diagonal. Every axis is foreshortened to about 82% (0.816) of true length. Same shape as an isometric drawing, just smaller: that is why drawings normally use full size (the isometric drawing)." },
      cav: { name: "Oblique: cavalier", m: [[1, 0], [c45, c45], [0, 1]], text: "The side of the hull is face-on, so it is drawn true shape: its gun ports stay circles. Receding lines go back at 45° at full length, which makes the ship look far too wide." },
      cab: { name: "Oblique: cabinet", m: [[1, 0], [0.5 * c45, 0.5 * c45], [0, 1]], text: "As cavalier, but the receding lines are drawn half length. It looks much more natural. Put the face with circles and detail at the front." },
      pl45: { name: "Planometric 45°/45°", m: [[c45, -c45], [c45, c45], [0, 1]], text: "The plan (deck) is drawn true shape, turned 45°. Verticals are drawn straight up. The round hatch on the deck stays a circle; the gun ports on the sides do not." },
      pl30: { name: "Planometric 30°/60°", m: [[c30, -s30], [s30, c30], [0, 1]], text: "The plan is true shape, turned so its sides lie at 30° and 60° to the horizontal. Good for room layouts and anything with detail in plan." },
    };
    const st = { p: "isoD", from: null, t: 1 };
    let M = PROJ.isoD.m.map((r) => r.slice());
    HG.choice(box, "Projection:", Object.entries(PROJ).map(([k2, v]) => [k2, v.name]), st.p, (v) => {
      st.from = M.map((r) => r.slice()); st.p = v; st.t = HG.reduced ? 1 : 0;
      if (HG.reduced) { M = PROJ[v].m.map((r) => r.slice()); sim.redraw(); } else sim.play();
      info();
    });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    const ctr = [4.5, 1.5, 2.5];
    // fixed scale across all projections, so isometric projection really is smaller than the drawing
    let scaleUnit = 1;
    function fitScale(S) {
      let w = 0, h = 0;
      for (const P of Object.values(PROJ)) {
        let lo = [1e9, 1e9], hi = [-1e9, -1e9];
        for (const key of cells.keys()) { const [x, y, z] = key.split(",").map(Number); for (const d of [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [0, 1, 1], [1, 0, 1]]) { const p = [x + d[0] - ctr[0], y + d[1] - ctr[1], z + d[2] - ctr[2]]; const q = [p[0] * P.m[0][0] + p[1] * P.m[1][0] + p[2] * P.m[2][0], p[0] * P.m[0][1] + p[1] * P.m[1][1] + p[2] * P.m[2][1]]; lo = [Math.min(lo[0], q[0]), Math.min(lo[1], q[1])]; hi = [Math.max(hi[0], q[0]), Math.max(hi[1], q[1])]; } }
        w = Math.max(w, hi[0] - lo[0], 2 * Math.max(hi[0], -lo[0])); h = Math.max(h, hi[1] - lo[1], 2 * Math.max(hi[1], -lo[1]));
      }
      scaleUnit = Math.min((S.w - 30) / w, (S.h - 70) / h);
    }
    const FACES = [[[1, 0, 0], [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]]], [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]]], [[0, 1, 0], [[0, 1, 0], [0, 1, 1], [1, 1, 1], [1, 1, 0]]], [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]]], [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]], [[0, 0, -1], [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]]]];
    // circles: gun ports on the near side (y = 0 face) and a hatch on the deck
    const ports = [[2.5, 0, 1.5], [4.5, 0, 1.5], [6.5, 0, 1.5]], hatch = [3.5, 1.5, 2];
    const sim = HG.sim(cv, {
      height: (w) => Math.round(Math.max(300, w * 0.62)),
      draw(ctx, tt, dt, C, S) {
        if (st.t < 1 && st.from) {
          st.t = Math.min(1, st.t + dt * 1.4);
          const e = ease(st.t), to = PROJ[st.p].m;
          M = st.from.map((r, i) => [r[0] + (to[i][0] - r[0]) * e, r[1] + (to[i][1] - r[1]) * e]);
          if (st.t >= 1 && sim) sim.pause();
        }
        fitScale(S);
        const s = scaleUnit, cx = S.w / 2, cy = (S.h - 50) / 2 + 40;
        const Pp = (p) => { const q = [p[0] - ctr[0], p[1] - ctr[1], p[2] - ctr[2]]; return [cx + s * (q[0] * M[0][0] + q[1] * M[1][0] + q[2] * M[2][0]), cy - s * (q[0] * M[0][1] + q[1] * M[1][1] + q[2] * M[2][1])]; };
        // the direction towards the viewer: the null vector of the projection (a × b), signed so we see the deck
        const a = [M[0][0], M[1][0], M[2][0]], b = [M[0][1], M[1][1], M[2][1]];
        let v = cross(a, b); if (v[2] < 0) v = mul(v, -1);
        const sg = v.map((c) => (Math.abs(c) < 1e-9 ? 0 : Math.sign(c)));
        const list = [...cells.entries()].map(([key, m]) => { const p = key.split(",").map(Number); return { p, m, key: p[0] * sg[0] + p[1] * sg[1] + p[2] * sg[2] }; });
        list.sort((p1, p2) => p1.key - p2.key);
        const COL = { hull: C.dirt, castle: mix(C.dirt, C.gold, 0.45), mast: mix(C.dirt, C.ink, 0.25), yard: mix(C.dirt, C.ink, 0.25) };
        const Lgt = unit([0.35, -0.6, 0.9]);
        const circ = (c, e1, e2, r) => { const pts = []; for (let i = 0; i < 40; i++) { const t2 = i / 40 * 2 * Math.PI; pts.push(Pp(add(c, add(mul(e1, r * Math.cos(t2)), mul(e2, r * Math.sin(t2)))))); } return pts; };
        for (const c of list) {
          for (const [n, quad] of FACES) {
            if (dot(n, v) <= 1e-9) continue;
            if (has(c.p[0] + n[0], c.p[1] + n[1], c.p[2] + n[2])) continue;
            const pts = quad.map((d) => Pp(add(c.p, d)));
            const tone = 0.55 + 0.45 * Math.max(0, dot(n, Lgt));
            const col = n[2] > 0 && c.m === "hull" ? mix(SHADE, mix(C.card, C.dirt, 0.45), tone) : mix(SHADE, COL[c.m], tone);
            fillPoly(ctx, pts, col, alpha(C.ink, 0.55), 1);
            // decorations lie on this face, so they are drawn now and nearer blocks can cover them
            if (n[1] === -1) for (const pc of ports) if (pc[0] - 0.5 === c.p[0] && pc[2] - 0.5 === c.p[2] && c.p[1] === 0) fillPoly(ctx, circ(pc, [1, 0, 0], [0, 0, 1], 0.32), mix(SHADE, C.red, 0.3), C.ink, 1.2);
            if (n[2] === 1 && c.p[0] === 3 && c.p[1] === 1 && c.p[2] === 1) fillPoly(ctx, circ(hatch, [1, 0, 0], [0, 1, 0], 0.4), mix(SHADE, C.dirt, 0.4), C.ink, 1.2);
          }
        }
        // axis key: how a unit step along each axis lands, with angle and scale
        const ax = [[1, 0, 0], [0, 1, 0], [0, 0, 1]], names = ["x (length)", "y (beam)", "z (height)"], cols = [C.red, C.sea, C.grass];
        const o = [16, 18], u = 26;
        ax.forEach((e, i) => {
          const q = [M[i][0], M[i][1]], L2 = Math.hypot(q[0], q[1]);
          HG.arrow(ctx, o[0] + 22, o[1] + 36, o[0] + 22 + q[0] * u, o[1] + 36 - q[1] * u, cols[i], 2, 7);
          let ang = Math.atan2(q[1], q[0]) / DEG; if (ang < -90) ang += 180; if (ang > 90) ang -= 180;
          lab(ctx, `${names[i]}: ${N(Math.abs(ang), 0)}° to horizontal, scale ${N(L2, 2)}`, S.w >= 520 ? S.w - 10 : o[0] + 70, 14 + i * 16, { size: 11, col: cols[i], align: S.w >= 520 ? "right" : "left" });
        });
      },
    });
    function info() {
      const P = PROJ[st.p];
      note.innerHTML = `<b>${P.name}.</b> ${P.text}`;
      cv.setAttribute("aria-label", "A block-built ship drawn in " + P.name + ". " + P.text);
    }
    info();
  });

  /* =====================================================================
     8. Perspective builder: one and two vanishing points, true geometry
     ===================================================================== */
  mount("w-perspective", (box) => {
    const st = { mode: "two", hy: 0.36, v1: 0.85, v2: 0.15, x0: 0.5, gy: 0.82, vx: 0.5, dk: 0.9, W: 4, D: 3, H: 2 };
    HG.choice(box, "Perspective:", [["two", "Two-point"], ["one", "One-point"]], st.mode, (v) => { st.mode = v; sim.redraw(); info(); });
    const ctl = controls(box);
    HG.slider(ctl, { label: "Width (blocks)", min: 1, max: 6, step: 1, value: st.W, oninput: (v) => { st.W = v; sim.redraw(); info(); } });
    HG.slider(ctl, { label: "Depth (blocks)", min: 1, max: 6, step: 1, value: st.D, oninput: (v) => { st.D = v; sim.redraw(); info(); } });
    HG.slider(ctl, { label: "Height (blocks)", min: 1, max: 5, step: 1, value: st.H, oninput: (v) => { st.H = v; sim.redraw(); info(); } });
    const hS = HG.slider(ctl, { label: "Horizon (eye level) height", min: 5, max: 95, step: 1, value: 100 - st.hy * 100, unit: "%", oninput: (v) => { st.hy = 1 - v / 100; sim.redraw(); info(); } });
    const v2S = HG.slider(ctl, { label: "Left vanishing point (two-point)", min: 0, max: 45, step: 1, value: st.v2 * 100, unit: "%", oninput: (v) => { st.v2 = v / 100; sim.redraw(); info(); } });
    const v1S = HG.slider(ctl, { label: "Right vanishing point (two-point)", min: 55, max: 100, step: 1, value: st.v1 * 100, unit: "%", oninput: (v) => { st.v1 = v / 100; sim.redraw(); info(); } });
    const vxS = HG.slider(ctl, { label: "Vanishing point position (one-point)", min: 2, max: 98, step: 1, value: st.vx * 100, unit: "%", oninput: (v) => { st.vx = v / 100; sim.redraw(); info(); } });
    HG.slider(ctl, { label: "Viewing distance (one-point)", min: 40, max: 200, step: 5, value: st.dk * 100, unit: "%", oninput: (v) => { st.dk = v / 100; sim.redraw(); info(); } });
    const cv = canvasIn(box, "");
    box.append(HG.el("p", { class: "drag-hint" }, "Drag the vanishing points along the horizon, the blue handle on the horizon to raise or lower eye level, and the foot of the leading edge to move the block."));
    const note = noteIn(box);
    let geo = null;
    function camera(S) {
      const b = S.w / 17, hy = st.hy * S.h, gy = st.gy * S.h, E = gy - hy;
      if (st.mode === "two") {
        const X0 = st.x0 * S.w;
        const V1 = Math.max(st.v1 * S.w, X0 + 24), V2 = Math.min(st.v2 * S.w, X0 - 24);
        const d = Math.sqrt((V1 - X0) * (X0 - V2)), be = Math.atan((X0 - V2) / d);
        const u1 = [Math.cos(be), Math.sin(be)], u2 = [-Math.sin(be), Math.cos(be)];
        const P3 = (w, dd, h) => [(w * u1[0] + dd * u2[0]) * b, d + (w * u1[1] + dd * u2[1]) * b, -E + h * b];
        const scr = (p) => [X0 + p[0] * d / p[1], hy - p[2] * d / p[1]];
        return { b, hy, gy, E, d, be, u1, u2, P3, scr, X0, V1, V2, n: { w: [u1[0], u1[1], 0], dd: [u2[0], u2[1], 0] } };
      }
      const VX = st.vx * S.w, X0 = st.x0 * S.w - st.W * b / 2, d = st.dk * S.w;
      const P3 = (w, dd, h) => [X0 - VX + w * b, d + dd * b, -E + h * b];
      const scr = (p) => [VX + p[0] * d / p[1], hy - p[2] * d / p[1]];
      return { b, hy, gy, E, d, P3, scr, X0, VX, n: { w: [1, 0, 0], dd: [0, 1, 0] } };
    }
    const sim = HG.sim(cv, {
      height: (w) => Math.round(Math.max(300, w * 0.6)),
      draw(ctx, tt, dt, C, S) {
        const g = camera(S); geo = g;
        const W = st.W, D = st.D, Hh = st.H;
        const pt = (w, dd, h) => g.scr(g.P3(w, dd, h));
        // horizon, ground line
        seg(ctx, [0, g.hy], [S.w, g.hy], C.sea, 1.5);
        lab(ctx, "HL (eye level)", S.w * 0.3, g.hy + 12, { size: 11, bold: true, col: C.sea, align: "center" });
        seg(ctx, [0, g.gy], [S.w, g.gy], alpha(C.muted, 0.7), 1, [6, 4]);
        lab(ctx, "GL", S.w - 24, g.gy - 9, { size: 11, col: C.muted });
        // faces, back to front: hidden faces skipped (the block is convex)
        const faces = [
          { n: g.n.w.map((x) => -x), c: [[0, 0, 0], [0, D, 0], [0, D, Hh], [0, 0, Hh]], ax: ["dd", "h"] },
          { n: g.n.w, c: [[W, 0, 0], [W, D, 0], [W, D, Hh], [W, 0, Hh]], ax: ["dd", "h"] },
          { n: g.n.dd.map((x) => -x), c: [[0, 0, 0], [W, 0, 0], [W, 0, Hh], [0, 0, Hh]], ax: ["w", "h"] },
          { n: g.n.dd, c: [[0, D, 0], [W, D, 0], [W, D, Hh], [0, D, Hh]], ax: ["w", "h"] },
          { n: [0, 0, 1], c: [[0, 0, Hh], [W, 0, Hh], [W, D, Hh], [0, D, Hh]], ax: ["w", "dd"] },
          { n: [0, 0, -1], c: [[0, 0, 0], [W, 0, 0], [W, D, 0], [0, D, 0]], ax: ["w", "dd"] },
        ];
        // construction lines to the vanishing points, faint, from every corner
        const corners = []; for (const w of [0, W]) for (const dd of [0, D]) for (const h of [0, Hh]) corners.push(pt(w, dd, h));
        ctx.save(); ctx.strokeStyle = alpha(C.lode, 0.35); ctx.lineWidth = 0.9; ctx.beginPath();
        const vps = st.mode === "two" ? [[g.V1, g.hy], [g.V2, g.hy]] : [[g.VX, g.hy]];
        corners.forEach((p) => vps.forEach((v) => { ctx.moveTo(p[0], p[1]); ctx.lineTo(v[0], v[1]); }));
        ctx.stroke(); ctx.restore();
        const Lg = unit([-0.5, -0.4, 0.8]);
        faces.forEach((f) => {
          const P = f.c.map(([w, dd, h]) => g.P3(w, dd, h));
          const cen = M3.centroid(P);
          if (dot(f.n, mul(cen, -1)) <= 0) return;
          const tone = 0.5 + 0.5 * Math.max(0, dot(f.n, Lg));
          fillPoly(ctx, P.map(g.scr), mix(SHADE, mix(C.card, C.grass, 0.45), tone), C.ink, 2);
          // block grid: each unit block shrinks with distance, exactly
          ctx.save(); ctx.strokeStyle = alpha(C.ink, 0.45); ctx.lineWidth = 0.9; ctx.beginPath();
          const lim = { w: W, dd: D, h: Hh };
          const [a1, a2] = f.ax, fixed = f.c[0];
          const at = (vals) => { const q = { w: fixed[0], dd: fixed[1], h: fixed[2] }; Object.assign(q, vals); return g.scr(g.P3(q.w, q.dd, q.h)); };
          for (let i = 1; i < lim[a1]; i++) { const p = at({ [a1]: i, [a2]: 0 }), q = at({ [a1]: i, [a2]: lim[a2] }); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
          for (let i = 1; i < lim[a2]; i++) { const p = at({ [a2]: i, [a1]: 0 }), q = at({ [a2]: i, [a1]: lim[a1] }); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
          ctx.stroke(); ctx.restore();
        });
        // leading edge
        const f0 = pt(0, 0, 0), f1 = pt(0, 0, Hh);
        if (st.mode === "two") { seg(ctx, f0, f1, C.red, 3); lab(ctx, "leading edge (true height)", f0[0] + 6, f0[1] + 14, { size: 11, col: C.red, avoid: true }); }
        // handles
        const hd = (x, y, txt, col) => { dot2(ctx, x, y, col, 7); ctx.save(); ctx.strokeStyle = C.card; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, 2 * Math.PI); ctx.stroke(); ctx.restore(); lab(ctx, txt, x, y - 16, { size: 12, bold: true, align: "center", col }); };
        if (st.mode === "two") { hd(g.V1, g.hy, "VP1", C.lode); hd(g.V2, g.hy, "VP2", C.lode); } else hd(g.VX, g.hy, "VP", C.lode);
        hd(S.w * 0.3, g.hy, "", C.sea); // the horizon's own handle, clear of the default VPs
        dot2(ctx, f0[0], f0[1], C.red, 6);
      },
    });
    HG.drag(cv, sim, () => {
      const g = geo; if (!g) return [];
      const h = [{ x: sim.w * 0.3, y: g.hy, id: "hl" }, { x: st.mode === "two" ? g.X0 : g.X0, y: g.gy, id: "foot" }];
      if (st.mode === "two") h.push({ x: g.V1, y: g.hy, id: "v1" }, { x: g.V2, y: g.hy, id: "v2" }); else h.push({ x: g.VX, y: g.hy, id: "vx" });
      return h;
    }, (id, x, y) => {
      const w = sim.w, h = sim.h;
      if (id === "hl") st.hy = clamp(y / h, 0.05, 0.95);
      // VPs stay clear of the horizon handle at the left edge
      if (id === "v1") st.v1 = clamp(x / w, st.x0 + 0.06, 1);
      if (id === "v2") st.v2 = clamp(x / w, 0, st.x0 - 0.06);
      if (id === "vx") { st.vx = clamp(x / w, 0.02, 0.98); st.hy = clamp(y / h, 0.05, 0.95); }
      if (id === "foot") { st.x0 = clamp((st.mode === "two" ? x : x + st.W * geo.b / 2) / w, st.mode === "two" ? st.v2 + 0.06 : 0.1, st.mode === "two" ? st.v1 - 0.06 : 0.9); st.gy = clamp(y / h, 0.15, 0.97); }
 vxS.sync(Math.round(st.vx * 100));
      sim.redraw(); info();
    });
    function info() {
      const S = { w: sim.w, h: sim.h }, g = camera(S);
      const eyeB = g.E / g.b;
      let t = st.mode === "two" ? "<b>Two-point perspective.</b> The block is turned to the picture plane, so both sets of horizontal edges run to vanishing points on the horizon; verticals stay vertical. " : "<b>One-point perspective.</b> The front face is parallel to the picture plane, so it is drawn true shape; only the edges going away from you converge, to a single vanishing point on the horizon. ";
      t += eyeB > st.H + 0.05 ? `Eye level is ${N(eyeB)} blocks up, above the block: a <b>bird's-eye view</b>, so you see the top.` : eyeB < -0.05 ? "Eye level is below the base: a <b>worm's-eye view</b>, so you see the underside." : "Eye level cuts through the block, so you see neither its top nor its bottom.";
      if (st.mode === "two") {
        t += ` These vanishing points mean the block is turned ${N(g.be / DEG, 0)}° to the picture plane and you stand ${N(g.d / g.b)} block-widths from it (taking your line of sight through the leading edge).`;
        if (g.d < 1.6 * Math.max(st.W, st.D) * g.b) t += " <span class='bad'>The VPs are close together: the block looks stretched and distorted. Spread them out, even off the page.</span>";
      }
      note.innerHTML = t;
      cv.setAttribute("aria-label", note.textContent);
    }
    info();
  });


  /* =====================================================================
     8b. Spot the faults: a cadet's Task 3 style orthographic sketch
     ===================================================================== */
  mount("w-sketchaudit", (box) => {
    const FAULTS = [
      ["elev", "The elevation is out of proportion"],
      ["plan", "The plan is out of proportion"],
      ["first", "The plan is in the wrong place for third angle"],
      ["align", "The plan is not lined up with the elevation"],
      ["hidden", "Hidden detail is missing"],
      ["lines", "Construction lines are as heavy as the outlines"],
    ];
    let seed = (Date.now() % 2147483646) + 1, faults = new Set(), sketchSeed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const cv = canvasIn(box, "");
    const form = HG.el("fieldset", { class: "fm-faults" }, HG.el("legend", null, "Tick every fault you can see:"));
    FAULTS.forEach(([id, txt]) => form.append(HG.el("label", null, HG.el("input", { type: "checkbox", value: id }), " " + txt)));
    box.append(form);
    const res = HG.el("div", { class: "output-box", "aria-live": "polite" });
    rowIn(box, btn("Check my audit", check, "primary"), btn("↺ New sketch", newSketch));
    box.append(res);
    function newSketch() {
      faults = new Set();
      const pool = FAULTS.map((f) => f[0]);
      const n = 1 + Math.floor(rnd() * 3);
      while (faults.size < n) {
        const f = pool[Math.floor(rnd() * pool.length)];
        if ((f === "first" && faults.has("align")) || (f === "align" && faults.has("first"))) continue;
        faults.add(f);
      }
      if (rnd() < 0.12) faults.clear(); // now and then, a sketch with nothing wrong
      form.querySelectorAll("input").forEach((i) => (i.checked = false));
      res.innerHTML = ""; sketchSeed = 1 + Math.floor(rnd() * 1e6); sim.redraw();
      cv.setAttribute("aria-label", "Left or top: a pictorial of a stepped block, 80 by 40 by 30 millimetres, with a step 30 long and 15 high at one end and a 16 millimetre hole drilled through. Beside it, a cadet's freehand elevation and plan of the block. Find the faults.");
    }
    function check() {
      const ticked = new Set([...form.querySelectorAll("input:checked")].map((i) => i.value));
      const lines = FAULTS.map(([id, txt]) => {
        const real = faults.has(id), t = ticked.has(id);
        if (real && t) return `<span class="ok">✔ Spotted:</span> ${txt}.`;
        if (real) return `<span class="bad">✘ Missed:</span> ${txt}.`;
        if (t) return `<span class="bad">✘ Not a fault here:</span> ${txt}.`;
        return null;
      }).filter(Boolean);
      const marks = 4 - (faults.has("elev") ? 1 : 0) - (faults.has("plan") ? 1 : 0) - (faults.has("first") || faults.has("align") ? 1 : 0) - (faults.has("hidden") ? 1 : 0);
      const why = { elev: "the elevation is drawn about 48 high for 80 long; the block is 30 high", plan: "the plan is about 22 deep; the block is 40 deep", first: "in third angle the plan goes above the elevation", align: "the plan's ends do not line up with the elevation's", hidden: "the drilled hole needs two dashed lines in the elevation", lines: "construction lines should be light" };
      res.innerHTML = (lines.length ? lines.join("<br>") : "<span class='ok'>✔ Nothing wrong, and you did not invent a fault.</span>") +
        ([...faults].length ? "<br>Why: " + [...faults].map((f) => why[f]).join("; ") + "." : "") +
        `<br><b>Against the four marking points used for the 2025 Task 3</b> (elevation in proportion, plan in proportion, third angle projected and aligned, accurate hidden detail) this sketch would earn about <b>${marks}/4</b>.` +
        (faults.has("lines") ? " Heavy construction lines are not one of those four points, but they make the drawing hard to read: keep them light." : "");
    }
    // one layout function, used both to size the canvas and to draw it
    function layout(w) {
      const wide = w >= 560;
      const vw = wide ? w * 0.6 : w, pw = wide ? w - vw : w, ph = wide ? 0 : 170;
      const s = Math.min((vw - 50) / 96, 3.4);
      const viewsH = 30 + (40 + 14 + 48) * s + 20;
      return { wide, vw, pw, ph, s, viewsH, h: Math.round(wide ? Math.max(viewsH, 260) : ph + viewsH) };
    }
    const sim = HG.sim(cv, {
      height: (w) => layout(w).h,
      draw(ctx, tt, dt, C, S) {
        let sd = sketchSeed;
        const r = () => { sd = (sd * 16807) % 2147483647; return (sd - 1) / 2147483646 - 0.5; };
        const f = faults, Lo = layout(S.w);
        ctx.fillStyle = isDark() ? "#23262e" : "#fbf8ef"; ctx.fillRect(0, 0, S.w, S.h);
        // ---- the reference pictorial, with the true sizes ----
        {
          const px0 = Lo.wide ? Lo.vw : 0, py0 = 0, pw = Lo.pw, ph = Lo.wide ? S.h : Lo.ph;
          const c30 = Math.cos(30 * DEG);
          const I0 = (x, y, z) => [(x + y) * c30, -((y - x) * 0.5 + z)];
          const cs = []; for (const x of [0, 80]) for (const y of [0, 40]) for (const z of [0, 30]) cs.push(I0(x, y, z));
          const lx = Math.min(...cs.map((q) => q[0])), hx = Math.max(...cs.map((q) => q[0])), ly = Math.min(...cs.map((q) => q[1])), hy = Math.max(...cs.map((q) => q[1]));
          const k = Math.min((pw - 70) / (hx - lx), (ph - 60) / (hy - ly));
          const ox = px0 + pw / 2 - (lx + hx) / 2 * k, oy = py0 + 22 + (ph - 40) / 2 - (ly + hy) / 2 * k;
          const I = (x, y, z) => { const q = I0(x, y, z); return [ox + q[0] * k, oy + q[1] * k]; };
          const E = (a, b2) => seg(ctx, I(...a), I(...b2), C.ink, 1.8);
          // visible edges, seen from the step end (x = 80) and the front (y = 0)
          [[[0, 0, 0], [80, 0, 0]], [[80, 0, 0], [80, 0, 15]], [[80, 0, 15], [50, 0, 15]], [[50, 0, 15], [50, 0, 30]], [[50, 0, 30], [0, 0, 30]], [[0, 0, 30], [0, 0, 0]],
            [[80, 0, 0], [80, 40, 0]], [[80, 40, 0], [80, 40, 15]], [[80, 40, 15], [80, 0, 15]], [[50, 0, 15], [50, 40, 15]], [[80, 40, 15], [50, 40, 15]],
            [[50, 40, 15], [50, 40, 30]], [[50, 0, 30], [50, 40, 30]], [[0, 0, 30], [0, 40, 30]], [[0, 40, 30], [50, 40, 30]]].forEach(([a, b2]) => E(a, b2));
          const hole = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * 2 * Math.PI; hole.push(I(25 + 8 * Math.cos(t), 20 + 8 * Math.sin(t), 30)); }
          pline(ctx, hole, C.ink, 1.6);
          const mid = (a, b2) => { const p = I(...a), q = I(...b2); return [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; };
          const t = (txt, p, dx, dy, al) => lab(ctx, txt, p[0] + dx, p[1] + dy, { size: 11, bold: true, col: C.red, align: al || "center" });
          t("80", mid([0, 0, 0], [80, 0, 0]), -6, 12);
          t("40", mid([80, 0, 0], [80, 40, 0]), 14, 8, "left");
          t("30", mid([0, 0, 0], [0, 0, 30]), -6, 0, "right");
          t("step 30 × 15", I(65, 0, 15), 0, -10);
          t("Ø16 through", I(25, 20, 30), 0, -24);
          lab(ctx, "THE BLOCK (mm)", px0 + pw / 2, py0 + 12, { size: 11, bold: true, col: C.muted, align: "center" });
        }
        // ---- the cadet's sketch ----
        const Lx = 80, Dy = f.has("plan") ? 22 : 40, Hz = f.has("elev") ? 48 : 30, step = 15 * Hz / 30;
        const s = Lo.s, top = (Lo.wide ? 0 : Lo.ph) + 26;
        const ex = (Lo.vw - Lx * s) / 2 - 10, gap = 14;
        const first = f.has("first");
        const py = first ? top + Hz * s + gap * s : top;
        const elevTop = first ? top : top + Dy * s + gap * s;
        const ey = elevTop + Hz * s;
        const px = ex + (f.has("align") ? 17 : 0) * s;
        const pen = C.ink, light = f.has("lines") ? C.ink : alpha(C.ink2, 0.45), lw = f.has("lines") ? 2.2 : 0.8;
        const hand = (x1, y1, x2, y2, col, w, dash) => {
          const L2 = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L2, uy = (y2 - y1) / L2, o1 = 2 + r() * 3, o2 = 1 + r() * 3;
          const a = [x1 - ux * o1, y1 - uy * o1], b2 = [x2 + ux * o2, y2 + uy * o2];
          const m1 = [a[0] + (b2[0] - a[0]) * 0.33 - uy * r() * 2.2, a[1] + (b2[1] - a[1]) * 0.33 + ux * r() * 2.2];
          const m2 = [a[0] + (b2[0] - a[0]) * 0.66 - uy * r() * 2.2, a[1] + (b2[1] - a[1]) * 0.66 + ux * r() * 2.2];
          ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.setLineDash(dash || []);
          ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.bezierCurveTo(m1[0], m1[1], m2[0], m2[1], b2[0], b2[1]); ctx.stroke(); ctx.restore();
        };
        const yTop = Math.min(py, elevTop), yBot = Math.max(ey, py + Dy * s);
        for (const x of [0, 17, 33, 50, Lx]) hand(ex + x * s, yTop - 8, ex + x * s, yBot + 8, light, lw);
        hand(ex - 14, ey, ex + Lx * s + 14, ey, light, lw);
        const E = (x, z) => [ex + x * s, ey - z * s];
        const prof = [[0, 0], [Lx, 0], [Lx, step], [50, step], [50, Hz], [0, Hz]];
        prof.forEach((p, i) => { const q = prof[(i + 1) % prof.length]; hand(...E(...p), ...E(...q), pen, 2.4); });
        if (!f.has("hidden")) { hand(...E(17, 0), ...E(17, Hz), pen, 1.2, [6, 4]); hand(...E(33, 0), ...E(33, Hz), pen, 1.2, [6, 4]); }
        hand(...E(25, -6), ...E(25, Hz + 6), C.sea, 1, [12, 3, 2, 3]);
        const Pp = (x, y) => [px + x * s, py + y * s];
        const rect = [[0, 0], [Lx, 0], [Lx, Dy], [0, Dy]];
        rect.forEach((p, i) => { const q = rect[(i + 1) % 4]; hand(...Pp(...p), ...Pp(...q), pen, 2.4); });
        hand(...Pp(50, 0), ...Pp(50, Dy), pen, 2.4);
        const c = Pp(25, Dy / 2), rr = 8 * s;
        ctx.save(); ctx.strokeStyle = pen; ctx.lineWidth = 2.2; ctx.beginPath();
        for (let k = 0; k <= 40; k++) { const t = k / 40 * 2.08 * Math.PI, wob = 1 + r() * 0.05; const q = [c[0] + rr * wob * Math.cos(t), c[1] + rr * wob * Math.sin(t)]; k ? ctx.lineTo(...q) : ctx.moveTo(...q); }
        ctx.stroke(); ctx.restore();
        hand(c[0] - rr - 7, c[1], c[0] + rr + 7, c[1], C.sea, 1, [12, 3, 2, 3]); hand(c[0], c[1] - rr - 7, c[0], c[1] + rr + 7, C.sea, 1, [12, 3, 2, 3]);
        lab(ctx, "PLAN", px + Lx * s / 2, first ? py + Dy * s + 14 : py - 10, { size: 11, bold: true, col: C.muted, align: "center" });
        // label each view on its outer side, so the labels never meet between the views
        lab(ctx, "ELEVATION", ex + Lx * s / 2, first ? elevTop - 10 : ey + 14, { size: 11, bold: true, col: C.muted, align: "center" });
        lab(ctx, "CADET'S SKETCH", 8, (Lo.wide ? 0 : Lo.ph) + 10, { size: 11, bold: true, col: C.muted });
      },
    });
    newSketch();
  });

  /* =====================================================================
     9. Light and shade: tone, cast shadow, highlight and reflected light
     ===================================================================== */
  mount("w-light", (box) => {
    const st = { az: 215, el: 40, mat: "gloss", mode: "tone", labels: true };
    const ctl = controls(box);
    HG.slider(ctl, { label: "Light direction (round the scene)", min: 0, max: 359, step: 1, value: st.az, unit: "°", oninput: (v) => { st.az = v; draw(); } });
    HG.slider(ctl, { label: "Light height above the deck", min: 20, max: 80, step: 1, value: st.el, unit: "°", oninput: (v) => { st.el = v; draw(); } });
    HG.choice(box, "Material:", [["matt", "Matt paint"], ["gloss", "Gloss paint"], ["metal", "Polished metal"], ["wood", "Wood"]], st.mat, (v) => { st.mat = v; draw(); });
    HG.choice(box, "Render as:", [["tone", "Full tone"], ["three", "Three tones"], ["hatch", "Pencil hatching"]], st.mode, (v) => { st.mode = v; draw(); });
    HG.choice(box, "Labels:", [[true, "Name the tones"], [false, "Hide labels"]], st.labels, (v) => { st.labels = v; draw(); });
    const cv = canvasIn(box, "");
    const note = noteIn(box);
    const cube = { c: [-1.7, 0.4, 1], h: 1 }, sph = { c: [1.75, -0.3, 1.15], r: 1.15 };
    const cm = M3.cam(-32, 26);
    const Lv = () => { const a = st.az * DEG, e = st.el * DEG; return [Math.cos(e) * Math.cos(a), Math.cos(e) * Math.sin(a), Math.sin(e)]; };
    const BASE = (C) => ({ matt: C.sea, gloss: C.red, metal: "#8d96a3", wood: C.dirt })[st.mat];
    function shade(n, L, p) {
      // tone 0..1 from a light direction: ambient + diffuse + light bounced up from the deck
      const dif = Math.max(0, dot(n, L));
      let t = 0.16 + 0.74 * dif + 0.14 * Math.max(0, -n[2]) * (dif < 0.05 ? 1 : 0.3);
      let spec = 0;
      if (st.mat === "gloss" || st.mat === "metal") {
        const hv = unit(add(L, cm.t)), sh = st.mat === "metal" ? 90 : 36;
        spec = Math.pow(Math.max(0, dot(n, hv)), sh) * (dif > 0 ? 1 : 0);
      }
      if (st.mat === "metal") { // reflects its surroundings: bright sky above the horizon, dark deck below
        const r = sub(mul(n, 2 * dot(n, cm.t)), cm.t);
        t = 0.25 * t + (r[2] > 0.08 ? 0.62 + 0.3 * r[2] : r[2] > -0.08 ? 0.12 : 0.3 + 0.12 * r[2]);
      }
      if (st.mat === "wood" && p) t *= 0.86 + 0.14 * Math.sin(18 * (p[0] + 0.25 * Math.sin(p[2] * 5)));
      return { t: clamp(t, 0, 1), spec: clamp(spec, 0, 1) };
    }
    function colour(C, tone, spec) {
      const base = BASE(C);
      if (st.mode === "three") { tone = tone < 0.36 ? 0.22 : tone < 0.7 ? 0.55 : 0.88; spec = spec > 0.45 ? 1 : 0; }
      const v = tone < 0.5 ? mixA("#0d0f14", base, tone * 2) : mixA(base, "#ffffff", (tone - 0.5) * 1.1);
      return spec > 0 ? [0, 1, 2].map((i) => v[i] + (255 - v[i]) * spec) : v;
    }
    function hatchPoly(ctx, pts, tone, ang, C) {
      ctx.save(); ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath();
      ctx.fillStyle = isDark() ? "#20232b" : "#ffffff"; ctx.fill(); ctx.clip();
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 60, y0 = Math.min(...ys) - 60, y1 = Math.max(...ys) + 60;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 0.9;
      const lines = (a, sp) => { const ca = Math.cos(a), sa = Math.sin(a), R0 = Math.hypot(x1 - x0, y1 - y0); ctx.beginPath(); for (let k = -R0; k < R0; k += sp) { const cx = (x0 + x1) / 2 - sa * k, cy = (y0 + y1) / 2 + ca * k; ctx.moveTo(cx - ca * R0, cy - sa * R0); ctx.lineTo(cx + ca * R0, cy + sa * R0); } ctx.stroke(); };
      if (tone < 0.88) lines(ang, 3 + 10 * tone);
      if (tone < 0.38) lines(ang + Math.PI / 2, 3 + 10 * tone);
      ctx.restore();
    }
    let labelsOut = [], sim0 = null;
    const sim = HG.sim(cv, {
      height: (w) => Math.round(Math.max(300, w * 0.58)),
      draw(ctx, tt, dt, C, S) {
        const L = Lv();
        const s = Math.min(S.w / 10.5, S.h / 6.2), cx = S.w / 2, cy = S.h * 0.6;
        const Q = (p) => { const q = proj(cm, p); return [cx + q[0] * s, cy - q[1] * s]; };
        // the deck
        const deck = [[-4.6, -3, 0], [4.6, -3, 0], [4.6, 3, 0], [-4.6, 3, 0]].map(Q);
        const dk = shade([0, 0, 1], L);
        if (st.mode === "hatch") hatchPoly(ctx, deck, 0.95, 0, C); else fillPoly(ctx, deck, css(mixA(C.card, C.dirt, 0.25 * (1 - dk.t) + 0.12)));
        ctx.save(); ctx.strokeStyle = alpha(C.ink, 0.18); ctx.lineWidth = 1; ctx.beginPath();
        for (let y = -3; y <= 3; y += 0.6) { const a = Q([-4.6, y, 0]), b = Q([4.6, y, 0]); ctx.moveTo(...a); ctx.lineTo(...b); }
        ctx.stroke(); ctx.restore();
        // cast shadows: every point slides along the light direction down to the deck
        const toDeck = (p) => sub(p, mul(L, p[2] / L[2]));
        const cc = cube.c, hh = cube.h, verts = []; for (const dx of [-hh, hh]) for (const dy of [-hh, hh]) for (const dz of [-hh, hh]) verts.push([cc[0] + dx, cc[1] + dy, cc[2] + dz]);
        const sh = verts.map(toDeck).map((p) => [p[0], p[1]]);
        const hull = (P) => { P = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); } for (const p of P.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); } return lo.slice(0, -1).concat(up.slice(0, -1)); };
        const cubeSh = hull(sh).map(([x, y]) => Q([x, y, 0]));
        const sc = toDeck(sph.c), hd = unit([L[0], L[1], 0]), pd = [-hd[1], hd[0], 0], maj = sph.r / Math.sin(st.el * DEG);
        const sphSh = []; for (let k = 0; k < 64; k++) { const t = k / 64 * 2 * Math.PI; sphSh.push(Q(add(sc, add(mul(hd, maj * Math.cos(t)), mul(pd, sph.r * Math.sin(t)))))); }
        const shadowCol = css(mixA(C.card, "#000000", 0.42));
        for (const P of [cubeSh, sphSh]) { if (st.mode === "hatch") hatchPoly(ctx, P, 0.2, 0.3, C); else fillPoly(ctx, P, st.mode === "three" ? css(mixA(C.card, "#000", 0.55)) : shadowCol); }
        // objects, far one first
        const objs = [{ k: "cube", d: dot(cube.c, cm.t) }, { k: "sph", d: dot(sph.c, cm.t) }].sort((a, b) => a.d - b.d);
        const faceInfo = [];
        let sphInfo = null;
        for (const o of objs) {
          if (o.k === "cube") {
            const F = M3.prism(M3.ngon(4, hh * Math.SQRT2, 45).map(([x, y]) => [x + cc[0], y + cc[1]]), cc[2] - hh, cc[2] + hh);
            F.forEach((f) => {
              if (dot(f.n, cm.t) <= 1e-6) return;
              const P = f.pts.map(Q), cen = M3.centroid(f.pts), sd = shade(f.n, L, cen);
              if (st.mode === "hatch") hatchPoly(ctx, P, sd.t, f.n[2] > 0.5 ? 0.2 : f.n[0] !== 0 ? 1.1 : -0.6, C);
              else {
                fillPoly(ctx, P, css(colour(C, sd.t, 0)));
                if (st.mat === "wood") { // grain runs along the timber
                  ctx.save(); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.clip();
                  ctx.strokeStyle = "rgba(40,20,5,.35)"; ctx.lineWidth = 1;
                  for (let k = 0; k < 9; k++) { ctx.beginPath(); for (let i = 0; i <= 20; i++) { const u = -1 + i / 10, v2 = -1 + k / 4 + 0.08 * Math.sin(i * 0.9 + k); const p = f.n[2] !== 0 ? [cc[0] + u * hh, cc[1] + v2 * hh, cc[2] + hh * f.n[2]] : f.n[0] !== 0 ? [cc[0] + hh * f.n[0], cc[1] + u * hh, cc[2] + v2 * hh] : [cc[0] + u * hh, cc[1] + hh * f.n[1], cc[2] + v2 * hh]; const q = Q(p); i ? ctx.lineTo(...q) : ctx.moveTo(...q); } ctx.stroke(); }
                  ctx.restore();
                }
                if (st.mat === "metal" || st.mat === "gloss") { // reflection streaks: the illustrator's shorthand for shine
                  ctx.save(); ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p))); ctx.closePath(); ctx.clip();
                  ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = st.mat === "metal" ? 5 : 3;
                  const a = P[0], b = P[2]; for (const f2 of [0.3, 0.42]) { ctx.beginPath(); ctx.moveTo(a[0] + (b[0] - a[0]) * f2 - 40, a[1] + (b[1] - a[1]) * f2 + 40); ctx.lineTo(a[0] + (b[0] - a[0]) * f2 + 40, a[1] + (b[1] - a[1]) * f2 - 40); ctx.stroke(); }
                  ctx.restore();
                }
              }
              pline(ctx, P, C.ink, 1.6, null, true);
              faceInfo.push({ t: sd.t, c: Q(cen), n: f.n });
            });
          } else {
            const c0 = Q(sph.c), R = sph.r * s;
            const sc2 = sim0 ? sim0.scale || 1 : 1, size = Math.ceil(2 * R * sc2);
            const off = document.createElement("canvas"); off.width = size; off.height = size;
            const ox = off.getContext("2d"), img = ox.createImageData(size, size), d = img.data;
            const dark = isDark();
            for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
              const xs = (i + 0.5) / size * 2 - 1, ys = -((j + 0.5) / size * 2 - 1), q = xs * xs + ys * ys;
              if (q > 1) continue;
              const zs = Math.sqrt(1 - q), n = add(add(mul(cm.r, xs), mul(cm.u, ys)), mul(cm.t, zs));
              const p = add(sph.c, mul(n, sph.r)), sd = shade(n, L, p);
              let v;
              if (st.mode === "hatch") {
                const px = i / sc2, py = j / sc2, sp = 5.5, k1 = ((px + py) % sp) / sp, k2 = ((px - py + 1000) % sp) / sp;
                const ink = (k1 < (1 - sd.t) * 0.55) || (sd.t < 0.38 && k2 < (0.38 - sd.t) * 1.2);
                v = ink ? rgb(C.ink) : dark ? [32, 35, 43] : [255, 255, 255];
                if (sd.spec > 0.5) v = dark ? [32, 35, 43] : [255, 255, 255];
              } else v = colour(C, sd.t, sd.spec);
              const a = Math.min(1, (1 - Math.sqrt(q)) * size * 0.5 + 0.2), o = (j * size + i) * 4;
              d[o] = v[0]; d[o + 1] = v[1]; d[o + 2] = v[2]; d[o + 3] = 255 * Math.min(1, a);
            }
            ox.putImageData(img, 0, 0);
            ctx.drawImage(off, c0[0] - R, c0[1] - R, 2 * R, 2 * R);
            ctx.save(); ctx.strokeStyle = C.ink; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(c0[0], c0[1], R, 0, 2 * Math.PI); ctx.stroke(); ctx.restore();
            // where are the named tones on the sphere?
            const best = (score) => { let b = null, bs = -1e9; for (let i = 0; i < 400; i++) { const u = (i % 20) / 19 * 2 - 1, v2 = Math.floor(i / 20) / 19 * 2 - 1; if (u * u + v2 * v2 > 0.86) continue; const n = add(add(mul(cm.r, u), mul(cm.u, v2)), mul(cm.t, Math.sqrt(1 - u * u - v2 * v2))); const sc3 = score(n); if (sc3 > bs) { bs = sc3; b = [c0[0] + u * R, c0[1] - v2 * R]; } } return b; };
            sphInfo = {
              hi: best((n) => dot(n, unit(add(L, cm.t)))),
              core: best((n) => -Math.abs(dot(n, L) + 0.25) * 3 + dot(n, cm.t)),
              refl: best((n) => -n[2] * 2 - Math.max(0, dot(n, L)) * 4 + dot(n, cm.t) * 0.5),
              sh: Q(sc), c: c0, R,
            };
          }
        }
        // the light: an arrow from the sun towards the scene
        const sun = Q(add([0, 0, 1.5], mul(L, 4.2)));
        const sunC = [clamp(sun[0], 20, S.w - 20), clamp(sun[1], 20, S.h - 20)];
        ctx.save(); ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(sunC[0], sunC[1], 9, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
        const tgt = Q([0, 0, 1.2]), dl = unit([tgt[0] - sunC[0], tgt[1] - sunC[1], 0]);
        HG.arrow(ctx, sunC[0] + dl[0] * 14, sunC[1] + dl[1] * 14, sunC[0] + dl[0] * 50, sunC[1] + dl[1] * 50, C.gold, 2.5, 9);
        labelsOut = [];
        if (st.labels && sphInfo) {
          // fixed label slots beside the sphere; each leader runs to where its label really is
          const { c: sc0, R: sR } = sphInfo;
          ctx.save(); ctx.font = 'bold 11px "Atkinson Hyperlegible", system-ui, sans-serif';
          const tag = (p, txt, lx, ly) => {
            if (!p) return;
            const w = ctx.measureText(txt).width;
            let al = "left";
            if (lx + w > S.w - 4) { lx = S.w - 4; al = "right"; }
            if (lx < 4) { lx = 4; al = "left"; }
            ly = clamp(ly, 10, S.h - 8);
            const x0 = al === "left" ? lx : lx - w, x1 = x0 + w;
            seg(ctx, p, [p[0] <= x0 ? x0 - 3 : p[0] >= x1 ? x1 + 3 : x0 - 3, ly], C.ink, 1);
            dot2(ctx, ...p, C.ink, 2.2);
            lab(ctx, txt, lx, ly, { size: 11, bold: true, align: al });
            labelsOut.push(txt);
          };
          const rx = sc0[0] + sR + 10;
          if (st.mat === "gloss" || st.mat === "metal") tag(sphInfo.hi, "highlight", rx, sc0[1] - sR * 0.75);
          tag(sphInfo.core, "core shadow", rx, sc0[1] - sR * 0.1);
          tag(sphInfo.refl, "reflected light", rx, sc0[1] + sR * 0.55);
          tag(sphInfo.sh, "cast shadow", sphInfo.sh[0] + 12, sphInfo.sh[1] + 26);
          ctx.restore();
          if (faceInfo.length) {
            // the faces are labelled on the faces themselves
            const sorted = faceInfo.slice().sort((a, b) => b.t - a.t);
            lab(ctx, "light face", sorted[0].c[0], sorted[0].c[1], { size: 11, bold: true, align: "center" });
            lab(ctx, "dark face", sorted[sorted.length - 1].c[0], sorted[sorted.length - 1].c[1], { size: 11, bold: true, align: "center" });
            labelsOut.push("light face", "dark face");
          }
        }
      },
    });
    sim0 = sim;
    function draw() {
      sim.redraw();
      const L = Lv(), len0 = 1 / Math.tan(st.el * DEG);
      const dirs = ["east", "north-east", "north", "north-west", "west", "south-west", "south", "south-east"];
      const from = dirs[Math.round(((st.az % 360) + 360) % 360 / 45) % 8];
      const faces = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1]].filter((n) => dot(n, cm.t) > 0).map((n) => shade(n, L).t);
      note.innerHTML = `Light from the ${from}, ${st.el}° above the deck. Shadows fall the opposite way, each <b>${N(len0, 2)} ×</b> as long as the object is tall (1 ÷ tan ${st.el}°). Visible cube faces range from tone ${N(Math.min(...faces), 2)} to ${N(Math.max(...faces), 2)}: one light, one medium, one dark is the classic three-tone block.` +
        ({ matt: " Matt paint: tone changes smoothly and there is no sharp highlight.", gloss: " Gloss: a small, sharp highlight where the light reflects straight to your eye, and reflection streaks on flat faces.", metal: " Polished metal: very high contrast. It mirrors its surroundings, so you see a bright sky band and a dark deck band, with a hard edge between them.", wood: " Wood: the grain is a texture that follows the shape of the piece." })[st.mat];
      cv.setAttribute("aria-label", "A cube and a sphere on a deck, lit from one direction, rendered in " + ({ tone: "full tone", three: "three tones", hatch: "pencil hatching" })[st.mode] + ". " + note.textContent);
    }
    draw();
  });
})();
