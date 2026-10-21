/* CAD — the widgets in HMS Vellum's Model Shop.
   Every model on this page is real geometry: the profiles, rings and voxels are computed from the
   same rules the text teaches (extrude, revolve, loft, sweep, helix, shell, Booleans, constraints),
   then drawn by a small flat-shaded renderer (painter's algorithm, Newell normals, silhouette edges).
   The engine between the ENGINE markers has no DOM, so the page's static figures are generated
   from exactly the same code. */
(function () {
  "use strict";

  /* ===ENGINE-START=== */
  const E3 = (function () {
    const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const len = (a) => Math.hypot(a[0], a[1], a[2]);
    const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const TAU = Math.PI * 2;

    /* ---------- 2D profiles (anticlockwise) ---------- */
    const circle = (r, n, cx = 0, cy = 0) => Array.from({ length: n }, (_, i) => [cx + r * Math.cos(TAU * i / n), cy + r * Math.sin(TAU * i / n)]);
    const rect = (w, h) => [[w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2], [-w / 2, -h / 2]];
    /* rounded rectangle: always 4(k+1) points, so two of them can be skinned together whatever the radius */
    function roundRect(w, h, r, k = 6) {
      r = Math.max(0, Math.min(r, w / 2 - 1e-6, h / 2 - 1e-6));
      const out = [], cs = [[w / 2 - r, -h / 2 + r, -Math.PI / 2], [w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, Math.PI / 2], [-w / 2 + r, -h / 2 + r, Math.PI]];
      cs.forEach(([cx, cy, a0]) => { for (let i = 0; i <= k; i++) { const a = a0 + (Math.PI / 2) * i / k; out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } });
      return out;
    }
    /* chamfered rectangle: distance a along x and b along y at every corner (a = b is a regular chamfer) */
    function chamferRect(w, h, a, b) {
      const X = w / 2, Y = h / 2;
      return [[X - a, -Y], [X, -Y + b], [X, Y - b], [X - a, Y], [-X + a, Y], [-X, Y - b], [-X, -Y + b], [-X + a, -Y]];
    }
    /* inward offset of a convex polygon by t: every edge moves in by t, neighbours meet again (mitre) */
    function offsetConvex(poly, t) {
      const n = poly.length, lines = [];
      for (let i = 0; i < n; i++) {
        const p = poly[i], q = poly[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
        const nx = -dy / L, ny = dx / L; // inward normal for an anticlockwise polygon
        lines.push({ p: [p[0] + nx * t, p[1] + ny * t], d: [dx / L, dy / L] });
      }
      return lines.map((l, i) => {
        const m = lines[(i + n - 1) % n];
        const den = m.d[0] * l.d[1] - m.d[1] * l.d[0];
        if (Math.abs(den) < 1e-9) return l.p.slice();
        const s = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / den;
        return [m.p[0] + m.d[0] * s, m.p[1] + m.d[1] * s];
      });
    }
    /* where the ray from the origin at angle a leaves a convex polygon that contains the origin */
    function polarHit(poly, a) {
      const dx = Math.cos(a), dy = Math.sin(a);
      let best = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const p = poly[i], q = poly[(i + 1) % poly.length], ex = q[0] - p[0], ey = q[1] - p[1];
        const den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const s = (p[0] * ey - p[1] * ex) / den, u = (p[0] * dy - p[1] * dx) / den;
        if (s > 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 && s < best) best = s;
      }
      return [dx * best, dy * best];
    }
    /* sample a convex polygon at given angles (radians) round the origin: matched rings for lofts and holes */
    const polar = (poly, angles) => angles.map((a) => polarHit(poly, a));
    const angles = (n) => Array.from({ length: n }, (_, i) => TAU * i / n);
    /* uniform angles plus the polygon's own corners, so corners are never cut */
    function anglesWithCorners(poly, n) {
      const set = angles(n).concat(poly.map((p) => (Math.atan2(p[1], p[0]) + TAU) % TAU));
      set.sort((a, b) => a - b);
      return set.filter((a, i) => i === 0 || a - set[i - 1] > 1e-6);
    }

    /* ---------- meshes: a face is { p: [[x,y,z]...], mat } ---------- */
    const place = (prof, o, u, v) => prof.map(([x, y]) => [o[0] + u[0] * x + v[0] * y, o[1] + u[1] * x + v[1] * y, o[2] + u[2] * x + v[2] * y]);
    /* join rings of equal length with quads; caps close an open tube */
    function skin(rings, o = {}) {
      const faces = [], R = rings.length, M = rings[0].length, closedRing = o.closedRing !== false;
      const nI = o.loop ? R : R - 1, nJ = closedRing ? M : M - 1;
      for (let i = 0; i < nI; i++) {
        const A = rings[i], B = rings[(i + 1) % R];
        for (let j = 0; j < nJ; j++) {
          const j2 = (j + 1) % M;
          faces.push({ p: [A[j], A[j2], B[j2], B[j]], mat: o.mat });
        }
      }
      if (closedRing && o.capStart) faces.push({ p: rings[0].slice().reverse(), mat: o.capMat || o.mat });
      if (closedRing && o.capEnd) faces.push({ p: rings[R - 1].slice(), mat: o.capMat || o.mat });
      return faces;
    }
    function newell(p) {
      let x = 0, y = 0, z = 0;
      for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[(i + 1) % p.length];
        x += (a[1] - b[1]) * (a[2] + b[2]); y += (a[2] - b[2]) * (a[0] + b[0]); z += (a[0] - b[0]) * (a[1] + b[1]);
      }
      return [x, y, z];
    }
    function signedVolume(faces) {
      let v = 0;
      faces.forEach((f) => { const p = f.p; for (let i = 1; i + 1 < p.length; i++) v += dot(p[0], cross(p[i], p[i + 1])) / 6; });
      return v;
    }
    /* make one closed, consistently wound component face outwards */
    function orient(faces) {
      if (signedVolume(faces) < 0) faces.forEach((f) => f.p.reverse());
      return faces;
    }
    function box(x0, y0, z0, x1, y1, z1, mat) {
      const P = (x, y, z) => [x ? x1 : x0, y ? y1 : y0, z ? z1 : z0];
      return orient([
        { p: [P(0, 0, 0), P(0, 1, 0), P(1, 1, 0), P(1, 0, 0)], mat }, { p: [P(0, 0, 1), P(1, 0, 1), P(1, 1, 1), P(0, 1, 1)], mat },
        { p: [P(0, 0, 0), P(1, 0, 0), P(1, 0, 1), P(0, 0, 1)], mat }, { p: [P(0, 1, 0), P(0, 1, 1), P(1, 1, 1), P(1, 1, 0)], mat },
        { p: [P(0, 0, 0), P(0, 0, 1), P(0, 1, 1), P(0, 1, 0)], mat }, { p: [P(1, 0, 0), P(1, 1, 0), P(1, 1, 1), P(1, 0, 1)], mat },
      ]);
    }
    /* extrude a 2D profile (in XY) from z0 to z1 */
    const prism = (prof, z0, z1, mat) => orient(skin([place(prof, [0, 0, z0], [1, 0, 0], [0, 1, 0]), place(prof, [0, 0, z1], [1, 0, 0], [0, 1, 0])], { capStart: true, capEnd: true, mat }));
    /* revolve an (r, z) polyline about the z axis between angles a0 and a1 */
    function lathe(rz, n, mat, a0 = 0, a1 = TAU, closedProfile = false) {
      const full = Math.abs(a1 - a0 - TAU) < 1e-9, rings = [];
      const steps = full ? n : n + 1;
      for (let i = 0; i < steps; i++) {
        const a = a0 + (a1 - a0) * i / n, c = Math.cos(a), s = Math.sin(a);
        rings.push(rz.map(([r, z]) => [r * c, r * s, z]));
      }
      return orient(skin(rings, { loop: full, closedRing: closedProfile, capStart: !full && closedProfile, capEnd: !full && closedProfile, mat }));
    }
    /* a convex outline with a round hole through it, as one closed skin (outline and hole share angles) */
    function plateWithHole(outline, r, z0, z1, mat, n = 48) {
      const as = anglesWithCorners(outline, n), O = polar(outline, as), H = as.map((a) => [r * Math.cos(a), r * Math.sin(a)]);
      const L = (prof, z) => prof.map(([x, y]) => [x, y, z]);
      return orient(skin([L(O, z0), L(O, z1), L(H, z1), L(H, z0)], { loop: true, mat }));
    }
    /* voxels: get(i, j, k) returns a material name or null; exposed faces only */
    function voxels(nx, ny, nz, get, size = 1, org = [0, 0, 0]) {
      const faces = [], D = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
        const m = get(i, j, k);
        if (!m) continue;
        for (const d of D) {
          const ii = i + d[0], jj = j + d[1], kk = k + d[2];
          if (ii >= 0 && jj >= 0 && kk >= 0 && ii < nx && jj < ny && kk < nz && get(ii, jj, kk)) continue;
          const ax = d[0] ? 0 : d[1] ? 1 : 2, u = [0, 0, 0], v = [0, 0, 0];
          u[(ax + 1) % 3] = 1; v[(ax + 2) % 3] = 1;
          const c = [i + 0.5 + d[0] * 0.5, j + 0.5 + d[1] * 0.5, k + 0.5 + d[2] * 0.5];
          let p = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [c[0] + 0.5 * (a * u[0] + b * v[0]), c[1] + 0.5 * (a * u[1] + b * v[1]), c[2] + 0.5 * (a * u[2] + b * v[2])]);
          if (dot(newell(p), d) < 0) p.reverse();
          faces.push({ p: p.map((q) => [org[0] + q[0] * size, org[1] + q[1] * size, org[2] + q[2] * size]), mat: m });
        }
      }
      return faces;
    }
    const translate = (faces, t) => faces.map((f) => ({ ...f, p: f.p.map((q) => add(q, t)) }));
    /* rotate about the axis through point c with direction (unit) k, angle a (Rodrigues) */
    function rotate(faces, c, k, a) {
      const co = Math.cos(a), si = Math.sin(a);
      const R = (q) => { const v = sub(q, c), kv = cross(k, v), kd = dot(k, v); return add(c, add(add(mul(v, co), mul(kv, si)), mul(k, kd * (1 - co)))); };
      return faces.map((f) => ({ ...f, p: f.p.map(R) }));
    }

    /* edge adjacency (view independent), cached on the mesh array */
    function adjacency(faces) {
      const map = new Map(), key = (q) => q[0].toFixed(3) + "," + q[1].toFixed(3) + "," + q[2].toFixed(3);
      faces.forEach((f, fi) => {
        f.e = [];
        f.p.forEach((a, i) => {
          const b = f.p[(i + 1) % f.p.length];
          if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-6) { f.e.push(null); return; }
          const ka = key(a), kb = key(b), k = ka < kb ? ka + "|" + kb : kb + "|" + ka;
          if (!map.has(k)) map.set(k, []);
          map.get(k).push(fi);
          f.e.push(k);
        });
      });
      faces.forEach((f, fi) => { f.nb = f.e.map((k) => (k ? (map.get(k).find((g) => g !== fi) ?? -1) : null)); });
      faces.forEach((f) => { const n = newell(f.p), l = len(n); f.n = l > 1e-12 ? mul(n, 1 / l) : [0, 0, 1]; f.area = l / 2; f.c = f.p.reduce((s, q) => add(s, q), [0, 0, 0]).map((v) => v / f.p.length); });
      faces._adj = true;
      return faces;
    }

    /* camera: yaw about z, then pitch (looking down); z is up, as in CAD */
    function view(o) {
      const cy = Math.cos(o.yaw), sy = Math.sin(o.yaw), cp = Math.cos(o.pitch), sp = Math.sin(o.pitch);
      const right = [cy, -sy, 0], up = [sp * sy, sp * cy, cp], toV = [-cp * sy, -cp * cy, sp];
      const ctr = o.target || [0, 0, 0];
      const proj = (p) => {
        const x = p[0] - ctr[0], y = p[1] - ctr[1], z = p[2] - ctr[2];
        const X = x * cy - y * sy, Y = x * sy + y * cy;
        const U = z * cp + Y * sp, d = Y * cp - z * sp;
        const f = o.persp ? o.persp / (o.persp + d) : 1;
        return [o.cx + X * o.scale * f, o.cy - U * o.scale * f, d];
      };
      const light = norm(add(add(mul(right, -0.45), mul(up, 0.75)), mul(toV, 0.62)));
      return { proj, right, up, toV, light, o };
    }
    /* sort and shade; each kept face lists the edges worth inking (silhouettes, creases, boundaries) */
    function prepare(faces, V, opt = {}) {
      if (!faces._adj) adjacency(faces);
      const crease = Math.cos(((opt.crease ?? 28) * Math.PI) / 180);
      const front = faces.map((f) => dot(f.n, V.toV) > 1e-9);
      const out = [];
      faces.forEach((f, fi) => {
        if (!front[fi] && !opt.double) return;
        const sp = f.p.map(V.proj);
        const depth = V.proj(f.c)[2];
        const n = front[fi] ? f.n : mul(f.n, -1);
        const shade = Math.max(0, dot(n, V.light));
        const edges = [];
        f.nb.forEach((g, i) => {
          if (g === null) return;
          let ink = false;
          if (g === -1) ink = true;
          else if (!front[g]) ink = true;
          else if (dot(f.n, faces[g].n) < crease) ink = true;
          else if (opt.matEdges && faces[g].mat !== f.mat) ink = true;
          if (ink || opt.allEdges) edges.push([i, ink]);
        });
        out.push({ f, sp, depth: depth + (opt.bias ? opt.bias(f) : 0), shade, edges, front: front[fi] });
      });
      out.sort((a, b) => b.depth - a.depth);
      return out;
    }
    /* colour helpers: tone s (0 dark .. 1 lit) mixes the base towards black or white */
    function hexRGB(c) {
      c = String(c).trim();
      if (c[0] === "#") { if (c.length === 4) c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]; return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }
      const m = c.match(/[\d.]+/g);
      return m ? m.slice(0, 3).map(Number) : [128, 128, 128];
    }
    function tone(rgb, s) {
      const k = s > 0.55 ? (s - 0.55) * 1.15 : (0.55 - s) * 0.9, t = s > 0.55 ? 255 : 0;
      return `rgb(${rgb.map((v) => Math.round(v + (t - v) * Math.min(0.85, k))).join(",")})`;
    }
    return { add, sub, mul, dot, cross, len, norm, TAU, circle, rect, roundRect, chamferRect, offsetConvex, polar, polarHit, angles, anglesWithCorners, place, skin, newell, signedVolume, orient, box, prism, lathe, plateWithHole, voxels, translate, rotate, adjacency, view, prepare, hexRGB, tone };
  })();
  /* ===ENGINE-END=== */
  if (typeof window === "undefined" || !window.HG) { if (typeof module !== "undefined") module.exports = E3; return; }

  const HG = window.HG;
  const $ = (id) => document.getElementById(id);
  const N = HG.n;
  const D2R = Math.PI / 180;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const controls = (box) => { const d = HG.el("div", { class: "sim-controls" }); box.append(d); return d; };
  const readouts = (box, items) => {
    const d = HG.el("div", { class: "readouts", "aria-live": "polite" });
    const els = {};
    items.forEach(([k, lab]) => { const b = HG.quiet(HG.el("b")); els[k] = b; d.append(HG.el("div", null, HG.el("span", null, lab), b)); });
    box.append(d);
    return els;
  };
  const note = (box) => { const p = HG.quiet(HG.el("p", { class: "sim-note", "aria-live": "polite" })); box.append(p); return p; };
  const canvasIn = (box, label) => { const c = HG.el("canvas", { class: "sim cad-canvas", role: "img", "aria-label": label }); box.append(c); return c; };
  const matCol = (C, m) => ({ sea: C.sea, gold: C.gold, lode: C.lode, grass: C.grass, red: C.red, muted: C.muted, violet: C.violet, ink: C.ink2, sky: C.sky, dirt: C.dirt }[m] || C.sea);

  /* draw prepared faces onto a canvas */
  function paint(ctx, list, C, o = {}) {
    const cache = {};
    const fillOf = (m, s) => { const k = m + "|" + Math.round(s * 40); if (!cache[k]) cache[k] = E3.tone(E3.hexRGB(matCol(C, m)), s); return cache[k]; };
    ctx.lineJoin = "round"; ctx.lineCap = "round";
    for (const it of list) {
      const sp = it.sp;
      ctx.beginPath(); ctx.moveTo(sp[0][0], sp[0][1]);
      for (let i = 1; i < sp.length; i++) ctx.lineTo(sp[i][0], sp[i][1]);
      ctx.closePath();
      if (o.wire) {
        ctx.globalAlpha = 1;
      } else {
        const col = it.f.ghost ? null : fillOf(it.f.mat, 0.18 + 0.82 * it.shade);
        if (col) {
          ctx.globalAlpha = it.f.alpha ?? 1;
          ctx.fillStyle = col; ctx.fill();
          ctx.strokeStyle = col; ctx.lineWidth = 0.7; ctx.stroke();
          ctx.globalAlpha = 1;
        }
      }
      if (it.edges.length) {
        ctx.beginPath();
        for (const [i, ink] of it.edges) {
          if (!ink && !o.grid) continue;
          const a = sp[i], b = sp[(i + 1) % sp.length];
          ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
        }
        ctx.strokeStyle = it.f.edgeCol || C.ink; ctx.lineWidth = o.lw || 1.3; ctx.globalAlpha = it.f.alpha ? Math.max(0.35, it.f.alpha) : 1;
        ctx.stroke(); ctx.globalAlpha = 1;
        if (o.grid) {
          ctx.beginPath();
          for (const [i, ink] of it.edges) { if (ink) continue; const a = sp[i], b = sp[(i + 1) % sp.length]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
          ctx.strokeStyle = C.ink; ctx.globalAlpha = 0.16; ctx.lineWidth = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
    }
  }
  /* pointer orbit: drag sideways to turn, up and down to tilt */
  function orbit(canvas, cam, redraw, onStart) {
    let last = null;
    canvas.classList.add("cad-orbit");
    canvas.addEventListener("pointerdown", (e) => { last = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); if (onStart) onStart(); });
    canvas.addEventListener("pointermove", (e) => {
      if (!last) return;
      cam.yaw -= (e.clientX - last[0]) * 0.01;
      cam.pitch = Math.max(-0.2, Math.min(1.45, cam.pitch + (e.clientY - last[1]) * 0.008));
      last = [e.clientX, e.clientY];
      redraw();
    });
    const end = () => { last = null; };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
  }
  /* fit: scale and centre so a bounding radius fits the canvas */
  const fitView = (cam, w, h, radius, target, cyFrac = 0.52) => E3.view({ yaw: cam.yaw, pitch: cam.pitch, scale: Math.min(w, h) * 0.42 / radius, cx: w / 2, cy: h * cyFrac, target, persp: cam.persp });
  /* a world-space polyline (paths, axes, centre lines) */
  function line3(ctx, V, pts, col, w = 1.5, dash) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; if (dash) ctx.setLineDash(dash);
    ctx.beginPath(); pts.forEach((p, i) => { const s = V.proj(p); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); ctx.restore();
  }
  const CHAIN = [14, 4, 2, 4];

  /* =====================================================================
     1. 2D drawing tools: offset, mirror, arrays, fillet, chamfer, trim/extend
     ===================================================================== */
  mount("w-tools", (box) => {
    const S = { tool: "offset", d: 6, n: 5, sp: 22, rows: 2, ang: 360, r: 8, c: 8 };
    const svgW = 360, svgH = 250;
    const svg = HG.svg("svg", { viewBox: `0 0 ${svgW} ${svgH}`, class: "cad-sketch", role: "img", "aria-label": "Sketch" });
    box.append(HG.el("div", { class: "cad-sketch-wrap" }, svg));
    const ctl = HG.el("div");
    box.append(ctl);
    const sl = HG.el("div", { class: "sim-controls" });
    const out = note(box);
    const tools = [["offset", "Offset"], ["mirror", "Mirror"], ["linear", "Linear array"], ["box", "Box array"], ["radial", "Radial array"], ["fillet", "Fillet"], ["chamfer", "Chamfer"], ["trim", "Trim"], ["extend", "Extend"]];
    HG.choice(ctl, "Tool", tools, S.tool, (v) => { S.tool = v; build(); });
    ctl.append(sl);
    // the sketch: an L-shaped bracket profile, in mm, origin at its bottom-left corner
    const L = [[0, 0], [80, 0], [80, 20], [30, 20], [30, 60], [0, 60]];
    let ox = 70, oy = 200, k = 1.6; // mm to svg units, set per tool so each sketch fills the pad
    const P = ([x, y]) => [ox + x * k, oy - y * k];
    const pathOf = (pts, close = true) => "M" + pts.map((p) => P(p).map((v) => v.toFixed(1)).join(" ")).join(" L") + (close ? " Z" : "");
    function poly(pts, cls, extra = {}) { return HG.svg("path", { d: pathOf(pts, extra.open ? false : true), class: cls, ...extra.attrs }); }
    function txt(x, y, s, cls = "ink", anchor = "middle") { return HG.svg("text", { x, y, "font-size": 13, "text-anchor": anchor, class: cls + " halo", text: s }); }
    // convex/concave-safe mitred outward offset of a simple anticlockwise polygon
    function offsetOut(poly, d) {
      const n = poly.length, lines = poly.map((p, i) => { const q = poly[(i + 1) % n], dx = q[0] - p[0], dy = q[1] - p[1], Lh = Math.hypot(dx, dy); return { p: [p[0] + dy / Lh * d, p[1] - dx / Lh * d], d: [dx / Lh, dy / Lh] }; });
      return lines.map((l, i) => { const m = lines[(i + n - 1) % n]; const den = m.d[0] * l.d[1] - m.d[1] * l.d[0]; const s = ((l.p[0] - m.p[0]) * l.d[1] - (l.p[1] - m.p[1]) * l.d[0]) / den; return [m.p[0] + m.d[0] * s, m.p[1] + m.d[1] * s]; });
    }
    // fillet or chamfer every corner: the arc is tangent to both edges, set back t = r / tan(theta/2)
    function corners(poly, r, mode) {
      const n = poly.length, out = [];
      const info = [];
      for (let i = 0; i < n; i++) {
        const A = poly[(i + n - 1) % n], B = poly[i], Cc = poly[(i + 1) % n];
        const u = [A[0] - B[0], A[1] - B[1]], v = [Cc[0] - B[0], Cc[1] - B[1]];
        const lu = Math.hypot(...u), lv = Math.hypot(...v);
        const th = Math.acos((u[0] * v[0] + u[1] * v[1]) / (lu * lv));
        const t = mode === "fillet" ? r / Math.tan(th / 2) : r;
        const p1 = [B[0] + u[0] / lu * t, B[1] + u[1] / lu * t], p2 = [B[0] + v[0] / lv * t, B[1] + v[1] / lv * t];
        const turn = u[0] * v[1] - u[1] * v[0]; // > 0: concave (inside) corner for an anticlockwise loop
        info.push({ p1, p2, t, th, concave: turn > 0 });
        if (mode === "chamfer") { out.push(p1, p2); continue; }
        // arc centre on the bisector at distance r / sin(theta/2)
        const bis = [u[0] / lu + v[0] / lv, u[1] / lu + v[1] / lv], lb = Math.hypot(...bis), dc = r / Math.sin(th / 2);
        const c = [B[0] + bis[0] / lb * dc, B[1] + bis[1] / lb * dc];
        let a1 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), a2 = Math.atan2(p2[1] - c[1], p2[0] - c[0]);
        let da = a2 - a1; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        for (let s = 0; s <= 8; s++) out.push([c[0] + r * Math.cos(a1 + da * s / 8), c[1] + r * Math.sin(a1 + da * s / 8)]);
      }
      return { out, info };
    }
    function holes(n, fn) { const g = []; for (let i = 0; i < n; i++) g.push(fn(i)); return g; }
    function build() {
      sl.innerHTML = "";
      const add = (o) => HG.slider(sl, { ...o, oninput: (v) => { S[o.key] = v; draw(); } });
      if (S.tool === "offset") add({ key: "d", label: "Offset distance", min: 2, max: 14, step: 1, value: S.d, unit: "mm" });
      if (S.tool === "linear" || S.tool === "box") { add({ key: "n", label: "Instances in a row", min: 2, max: 6, step: 1, value: Math.min(S.n, 6) }); add({ key: "sp", label: "Spacing", min: 10, max: 26, step: 1, value: S.sp, unit: "mm" }); }
      if (S.tool === "box") add({ key: "rows", label: "Rows", min: 1, max: 3, step: 1, value: S.rows });
      if (S.tool === "radial") { add({ key: "n", label: "Number of instances", min: 2, max: 12, step: 1, value: S.n }); add({ key: "ang", label: "Total angle", min: 90, max: 360, step: 15, value: S.ang, unit: "°" }); }
      if (S.tool === "fillet") add({ key: "r", label: "Fillet radius", min: 2, max: 16, step: 1, value: S.r, unit: "mm" });
      if (S.tool === "chamfer") add({ key: "c", label: "Chamfer distance", min: 2, max: 16, step: 1, value: S.c, unit: "mm" });
      draw();
    }
    function draw() {
      svg.innerHTML = "";
      const g = (el) => svg.append(el);
      const t = S.tool;
      let msg = "", label = "";
      [ox, oy, k] = { offset: [70, 205, 2.3], mirror: [180, 210, 2.2], linear: [30, 210, 2], box: [30, 210, 2], radial: [0, 0, 2.4], fillet: [80, 215, 2.4], chamfer: [80, 215, 2.4], trim: [70, 225, 2.3], extend: [70, 225, 2.3] }[t];
      if (t === "offset") {
        g(poly(L, "cad-sk-base"));
        const o = offsetOut(L, S.d);
        g(poly(o, "cad-sk-new"));
        // dimension the offset at the bottom edge
        const a = P([50, 0]), b = P([50, -S.d]);
        g(HG.svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "cad-sk-dim" }));
        g(txt(a[0] + 8, b[1] + 16, S.d + " mm", "ink", "start"));
        msg = `Offset copies every line ${S.d} mm away, keeping each one parallel to the original. Outside corners grow longer and inside corners shorter: the new loop is ${N(perim(o))} mm round, against ${N(perim(L))} mm for the original. Use it for wall thicknesses, rims and gaskets.`;
        label = `Offset of the L-shaped profile by ${S.d} mm`;
      } else if (t === "mirror") {
        g(poly(L, "cad-sk-base"));
        const m = L.map(([x, y]) => [-x, y]).reverse();
        g(poly(m, "cad-sk-new"));
        const a = P([0, -10]), b = P([0, 72]);
        g(HG.svg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], class: "cad-sk-cl" }));
        g(txt(a[0], b[1] - 4, "mirror line"));
        msg = "Mirror reflects the selected geometry across a mirror line. Each point lands the same distance from the line on the other side, so the copy is reversed (a left hand becomes a right hand). Model or draw half of a symmetrical part, then mirror it.";
        label = "L-shaped profile mirrored across a vertical mirror line";
      } else if (t === "linear" || t === "box") {
        const rows = t === "box" ? S.rows : 1;
        const plate = [[0, 0], [150, 0], [150, 70], [0, 70]];
        g(poly(plate, "cad-sk-base"));
        let cnt = 0;
        for (let r = 0; r < rows; r++) for (let i = 0; i < S.n; i++) {
          const c = P([15 + i * S.sp, 15 + r * S.sp]);
          g(HG.svg("circle", { cx: c[0], cy: c[1], r: 4 * k, class: i || r ? "cad-sk-new" : "cad-sk-seed" })); cnt++;
        }
        const span = (S.n - 1) * S.sp;
        msg = t === "linear"
          ? `Linear array: one seed hole copied ${S.n - 1} more times in one direction, ${S.sp} mm apart. From the first centre to the last is (${S.n} − 1) × ${S.sp} = ${span} mm.${15 + span + 4 > 150 ? " The last copy runs off the plate: in CAD you would reduce the count or the spacing." : ""}`
          : `Box array: a grid of ${S.n} × ${rows} = ${cnt} instances, ${S.sp} mm apart in both directions (rows and columns).${15 + span + 4 > 150 || 15 + (rows - 1) * S.sp + 4 > 70 ? " Some copies run off the plate: reduce the count or the spacing." : ""}`;
        label = `${t === "linear" ? "Linear" : "Box"} array of ${cnt} holes`;
      } else if (t === "radial") {
        const c0 = [130, 125];
        g(HG.svg("circle", { cx: c0[0], cy: c0[1], r: 46 * k, class: "cad-sk-base" }));
        g(HG.svg("circle", { cx: c0[0], cy: c0[1], r: 30 * k, class: "cad-sk-pcd" }));
        const full = S.ang >= 360, step = full ? 360 / S.n : S.ang / (S.n - 1);
        for (let i = 0; i < S.n; i++) {
          const a = (90 - i * step) * D2R, c = [c0[0] + 30 * k * Math.cos(a), c0[1] - 30 * k * Math.sin(a)];
          g(HG.svg("circle", { cx: c[0], cy: c[1], r: 4 * k, class: i ? "cad-sk-new" : "cad-sk-seed" }));
        }
        g(HG.svg("line", { x1: c0[0] - 8, y1: c0[1], x2: c0[0] + 8, y2: c0[1], class: "cad-sk-cl" }));
        g(HG.svg("line", { x1: c0[0], y1: c0[1] - 8, x2: c0[0], y2: c0[1] + 8, class: "cad-sk-cl" }));
        g(txt(c0[0] + 30 * k * 0.71 + 40, c0[1] - 30 * k * 0.71 - 6, "PCD 60", "ink2", "start"));
        msg = full
          ? `Radial array of ${S.n} round the full 360°: the angle between neighbours is 360 ÷ ${S.n} = ${N(step, 2)}°, because the last copy would land on the first.`
          : `Radial array of ${S.n} through a total angle of ${S.ang}°: the first and last instances sit at the ends of the arc, so there are ${S.n - 1} gaps and the angle between neighbours is ${S.ang} ÷ ${S.n - 1} = ${N(step, 2)}°.`;
        label = `Radial array of ${S.n} holes through ${S.ang} degrees`;
      } else if (t === "fillet" || t === "chamfer") {
        const v = t === "fillet" ? S.r : S.c;
        const res = corners(L, v, t);
        // CAD refuses when the set-backs at the two ends of any line add up to more than the line's length
        const clash = L.map((p, i) => { const q = L[(i + 1) % L.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]); return { len, need: res.info[i].t + res.info[(i + 1) % L.length].t }; }).find((e) => e.need > e.len + 1e-9);
        g(poly(L, clash ? "cad-sk-new" : "cad-sk-base"));
        if (!clash) g(poly(res.out, "cad-sk-new"));
        msg = t === "fillet"
          ? `Fillet replaces each corner with an arc of radius ${v} mm, tangent to both lines. At a 90° corner the arc starts ${v} mm back along each line (set-back = r ÷ tan 45° = r). The inside corner (concave) gets a fillet too: that is the one that strengthens a bracket.`
          : `Chamfer cuts each corner with a straight line, ${v} mm back along both lines: an equal-distance chamfer, so the cut is at 45° and its length is ${v} × √2 = ${N(v * Math.SQRT2, 1)} mm.`;
        if (clash) msg = `⚠ CAD would refuse: the ${N(clash.len, 0)} mm line would need ${N(clash.need, 0)} mm of set-back (${v} mm at each end), more than its length, so the two ${t}s would cross. The profile is left unchanged. Reduce the ${t === "fillet" ? "radius" : "distance"} to ${N(clash.len / 2, 0)} mm or less.`;
        label = `${t === "fillet" ? "Fillet radius" : "Chamfer distance"} ${v} mm on every corner of the L profile`;
      } else if (t === "trim" || t === "extend") {
        // two crossing construction lines, a horizontal one that stops short, and a boundary
        const base = [[[0, 0], [100, 0]], [[0, 0], [0, 70]]];
        base.forEach(([a, b]) => g(poly([a, b], "cad-sk-base", { open: true })));
        if (t === "trim") {
          // a line that overshoots the vertical at x = 70
          g(poly([[-20, 40], [70, 40]], "cad-sk-new", { open: true }));
          g(poly([[-20, 40], [0, 40]], "cad-sk-gone", { open: true }));
          g(poly([[70, 0], [70, 60]], "cad-sk-new", { open: true }));
          g(poly([[70, 60], [70, 80]], "cad-sk-gone", { open: true }));
          g(txt(P([-10, 40])[0], P([-10, 40])[1] - 8, "trimmed", "muted"));
          msg = "Trim removes the part of a line on one side of an intersection: you pick the piece to delete and it is cut back exactly to the line it crosses (the dashed overshoots go). Sketch quickly with overlapping lines, then trim to tidy the profile so it is a single closed loop.";
          label = "Trim: overshooting line ends removed back to the intersection";
        } else {
          g(poly([[100, 0], [100, 70]], "cad-sk-base", { open: true }));
          g(poly([[0, 40], [55, 40]], "cad-sk-base", { open: true }));
          g(poly([[55, 40], [100, 40]], "cad-sk-new", { open: true }));
          g(txt(P([78, 40])[0], P([78, 40])[1] - 8, "extended", "ink2"));
          msg = "Extend lengthens a line until it meets the next boundary in its path (here the right-hand edge). It closes small gaps so the profile is a closed loop, which an extrude or revolve needs.";
          label = "Extend: a short line lengthened to meet the boundary";
        }
      }
      out.textContent = msg;
      svg.setAttribute("aria-label", label + ". " + msg);
    }
    const perim = (p) => p.reduce((s, q, i) => s + Math.hypot(q[0] - p[(i + 1) % p.length][0], q[1] - p[(i + 1) % p.length][1]), 0);
    build();
  });

  /* =====================================================================
     2. 2D constraints and degrees of freedom: a little geometric solver
     ===================================================================== */
  mount("w-constrain", (box) => {
    // four corners of a profile, deliberately a little wonky; each point has 2 degrees of freedom
    const init = () => [[40, 30], [200, 42], [212, 180], [28, 168]];
    let P = init();
    let hole = { c: [140, 110], r: 18 };
    const S = { fixed: false, perp: false, par1: false, par2: false, lenAB: false, lenAD: false, dia: false, conc: false };
    const LAD = 120, HOLE_R = 15;
    let fixedAt = [[40, 30], [200, 42]];
    const W = 360, H = 250;
    const svg = HG.svg("svg", { viewBox: `0 0 ${W} ${H}`, class: "cad-sketch", role: "img", "aria-label": "Sketch with constraints" });
    box.append(HG.el("div", { class: "cad-sketch-wrap" }, svg));
    const row = HG.el("div", { class: "cad-cons-row", role: "group", "aria-label": "Constraints" });
    const list = [
      ["fixed", "Fixed (edge AB)", 4, "A and B are locked where they are: 4 freedoms removed."],
      ["perp", "Perpendicular (AD ⊥ AB)", 1, "AD is forced to 90° to AB."],
      ["par1", "Parallel (DC ∥ AB)", 1, "DC must run parallel to AB."],
      ["par2", "Parallel (BC ∥ AD)", 1, "BC must run parallel to AD."],
      ["lenAD", "Linear (AD = 120)", 1, "A linear dimension fixes the length of AD."],
      ["dia", "Diameter (hole Ø30)", 1, "A diameter dimension fixes the size of the circle."],
      ["conc", "Concentric (hole with the construction circle)", 2, "The hole is made concentric with a dashed construction circle drawn round the profile's centre: the two share one centre, so the hole's centre can no longer move."],
    ];
    const btns = {};
    list.forEach(([k, lab]) => {
      const b = HG.el("button", { type: "button", class: "seg-btn", "aria-pressed": "false" }, lab);
      b.addEventListener("click", () => { S[k] = !S[k]; if (k === "fixed" && S.fixed) fixedAt = [P[0].slice(), P[1].slice()]; b.setAttribute("aria-pressed", S[k] ? "true" : "false"); solve(); draw(); });
      btns[k] = b; row.append(b);
    });
    box.append(row);
    const ro = readouts(box, [["dof", "Degrees of freedom left"], ["state", "Sketch state"]]);
    const msg = note(box);
    const br = HG.el("div", { class: "btn-row" });
    const wig = HG.el("button", { class: "btn small", type: "button" }, "↝ Tug the free points");
    const rst = HG.el("button", { class: "btn small", type: "button" }, "↺ Reset");
    br.append(wig, rst); box.append(br);
    box.append(HG.el("p", { class: "drag-hint" }, "Drag the corners A–D or the circle's centre. Constrained geometry stays put; free geometry follows your pointer."));
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
    // solve by repeated projection: each constraint nudges the free points until all agree
    function solve(pin) {
      for (let it = 0; it < 80; it++) {
        if (S.fixed) { P[0] = fixedAt[0].slice(); P[1] = fixedAt[1].slice(); }
        const free = (i) => !(S.fixed && i < 2) && i !== pin;
        const setLen = (i, j, L) => {
          const d = sub(P[j], P[i]), l = Math.hypot(...d) || 1, e = (l - L) / l;
          const fi = free(i), fj = free(j);
          if (fi && fj) { P[i] = [P[i][0] + d[0] * e / 2, P[i][1] + d[1] * e / 2]; P[j] = [P[j][0] - d[0] * e / 2, P[j][1] - d[1] * e / 2]; }
          else if (fj) P[j] = [P[j][0] - d[0] * e, P[j][1] - d[1] * e];
          else if (fi) P[i] = [P[i][0] + d[0] * e, P[i][1] + d[1] * e];
        };
        // make the direction of segment (i,j) match the unit vector u, rotating about whichever end is free
        const setDir = (i, j, u) => {
          const d = sub(P[j], P[i]), l = Math.hypot(...d), s = (d[0] * u[0] + d[1] * u[1]) >= 0 ? 1 : -1;
          const want = [u[0] * l * s, u[1] * l * s];
          if (free(j)) P[j] = [P[j][0] + (P[i][0] + want[0] - P[j][0]) * 0.5, P[j][1] + (P[i][1] + want[1] - P[j][1]) * 0.5];
          else if (free(i)) P[i] = [P[i][0] + (P[j][0] - want[0] - P[i][0]) * 0.5, P[i][1] + (P[j][1] - want[1] - P[i][1]) * 0.5];
        };
        const unit = (i, j) => { const d = sub(P[j], P[i]), l = Math.hypot(...d) || 1; return [d[0] / l, d[1] / l]; };
        if (S.perp) { const u = unit(0, 1); setDir(0, 3, [-u[1], u[0]]); }
        if (S.par1) setDir(3, 2, unit(0, 1));
        if (S.par2) setDir(1, 2, unit(0, 3));
        if (S.lenAD) setLen(0, 3, LAD);
      }
      if (S.dia) hole.r = HOLE_R;
      if (S.conc && pin !== "c") hole.c = centreMark();
    }
    const centreMark = () => [(P[0][0] + P[1][0] + P[2][0] + P[3][0]) / 4, (P[0][1] + P[1][1] + P[2][1] + P[3][1]) / 4];
    function dof() {
      let d = 8 + 3; // four points + a circle (centre x, y and radius)
      list.forEach(([k, , n]) => { if (S[k]) d -= n; });
      return d;
    }
    const X = (p) => [p[0] + 20, H - 10 - p[1]];
    function draw() {
      svg.innerHTML = "";
      const g = (e) => svg.append(e);
      const pts = P.map(X);
      g(HG.svg("path", { d: "M" + pts.map((p) => p.join(" ")).join(" L") + " Z", class: "cad-sk-new" }));
      const hc = X(hole.c);
      g(HG.svg("circle", { cx: hc[0], cy: hc[1], r: hole.r, class: "cad-sk-new" }));
      const cm = X(centreMark());
      g(HG.svg("circle", { cx: cm[0], cy: cm[1], r: 30, class: "cad-sk-pcd" }));
      g(HG.svg("path", { d: `M${cm[0] - 7} ${cm[1]} h14 M${cm[0]} ${cm[1] - 7} v14`, class: "cad-sk-cl" }));
      // constraint glyphs
      const mid = (i, j) => [(pts[i][0] + pts[j][0]) / 2, (pts[i][1] + pts[j][1]) / 2];
      const glyph = (p, s, dx = 0, dy = -10) => g(HG.svg("text", { x: p[0] + dx, y: p[1] + dy, "font-size": 13, "text-anchor": "middle", class: "lode halo cad-glyph", text: s }));
      if (S.fixed) { glyph(pts[0], "🔒", -12, 14); glyph(pts[1], "🔒", 12, 14); }
      if (S.perp) glyph(pts[0], "⊥", 14, -10);
      if (S.par1) { glyph(mid(0, 1), "∥", 0, 16); glyph(mid(3, 2), "∥", 0, -8); }
      if (S.par2) { glyph(mid(0, 3), "∥", -12, 4); glyph(mid(1, 2), "∥", 12, 4); }
      if (S.lenAD) glyph(mid(0, 3), "120", -28, 4);
      if (S.dia) glyph(hc, "Ø30", 0, -hole.r - 6);
      if (S.conc) glyph(hc, "◎", hole.r + 12, 4);
      ["A", "B", "C", "D"].forEach((l, i) => {
        const fixed = S.fixed && i < 2;
        g(HG.svg("circle", { cx: pts[i][0], cy: pts[i][1], r: 6, class: fixed ? "cad-pt-fixed" : "cad-pt" }));
        g(HG.svg("text", { x: pts[i][0] + (i === 1 || i === 2 ? 10 : -10), y: pts[i][1] + (i < 2 ? 18 : -8), "font-size": 14, "font-weight": 700, "text-anchor": "middle", class: "ink halo", text: l }));
      });
      g(HG.svg("circle", { cx: hc[0], cy: hc[1], r: 5, class: S.conc ? "cad-pt-fixed" : "cad-pt" }));
      const d = dof();
      ro.dof.textContent = String(d);
      ro.state.textContent = d === 0 ? "Fully constrained" : d === 11 ? "Unconstrained" : "Under-constrained";
      const lenAB = Math.hypot(...sub(P[1], P[0]));
      msg.innerHTML = d === 0
        ? `<b>Fully constrained.</b> Every point and the circle are fixed by a constraint, so nothing can move unintentionally when you edit. AB measures ${N(lenAB, 0)} (it was fixed in place), AD is ${N(Math.hypot(...sub(P[3], P[0])), 0)}.`
        : `${d} freedom${d === 1 ? "" : "s"} left. A sketch starts with 2 per point (x and y) plus 3 for a circle (centre x, y and its size): 4 × 2 + 3 = 11. Each constraint removes some. Try dragging the geometry to see what can still move.`;
      svg.setAttribute("aria-label", `Rectangle-like profile ABCD with a circle. ${d} degrees of freedom left. ` + list.filter(([k]) => S[k]).map(([, l]) => l).join(", "));
    }
    // dragging
    let drag = null;
    const toSk = (e) => { const r = svg.getBoundingClientRect(); const x = (e.clientX - r.left) * W / r.width, y = (e.clientY - r.top) * H / r.height; return [x - 20, H - 10 - y]; };
    svg.addEventListener("pointerdown", (e) => {
      const p = toSk(e); let best = null, bd = 18;
      P.forEach((q, i) => { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = i; } });
      if (Math.hypot(hole.c[0] - p[0], hole.c[1] - p[1]) < bd) best = "c";
      if (best === null) return;
      drag = best; svg.setPointerCapture(e.pointerId); e.preventDefault();
    });
    svg.addEventListener("pointermove", (e) => {
      if (drag === null) return;
      const p = toSk(e).map((v, i) => Math.max(0, Math.min(i ? 225 : 320, v)));
      if (drag === "c") { if (!S.conc) hole.c = p; }
      else if (!(S.fixed && drag < 2)) P[drag] = p;
      solve(drag); solve(); draw();
    });
    const end = () => { drag = null; };
    svg.addEventListener("pointerup", end); svg.addEventListener("pointercancel", end);
    let wt = null;
    wig.addEventListener("click", () => {
      if (wt) return;
      const start = P.map((p) => p.slice()), c0 = hole.c.slice(), r0 = hole.r;
      let f = 0;
      const step = () => {
        f++;
        const a = Math.sin(f / 6) * 14;
        P = start.map((p, i) => (S.fixed && i < 2 ? p : [p[0] + a * (i % 2 ? 1 : -0.6), p[1] + a * (i > 1 ? 0.8 : -0.5)]));
        hole.c = [c0[0] + a, c0[1] - a * 0.5]; hole.r = r0 + a * 0.3;
        solve(); draw();
        if (f < (HG.reduced ? 10 : 76)) wt = setTimeout(step, HG.reduced ? 60 : 24);
        else { wt = null; P = start; hole.c = c0; hole.r = r0; solve(); draw(); }
      };
      step();
    });
    rst.addEventListener("click", () => { list.forEach(([k]) => { S[k] = false; btns[k].setAttribute("aria-pressed", "false"); }); P = init(); hole = { c: [140, 110], r: 18 }; draw(); });
    solve(); draw();
  });

  /* =====================================================================
     3. The feature builder: extrude, revolve, loft, sweep along a path, helix
     ===================================================================== */
  mount("w-features", (box) => {
    const S = {
      mode: "extrude",
      ex: { w: 60, h: 40, d: 50 },
      rev: { R: 45, a: 12, ang: 360 },
      loft: { s: 70, d: 40, h: 70, top: "circle" },
      sw: { L1: 70, R: 25, L2: 60, d: 16 },
      hx: { R: 25, d: 6, p: 15, n: 5, L: 75, spec: "pn" },
    };
    const cam = { yaw: -0.75, pitch: 0.42 };
    let t = 1, building = false, spin = !HG.reduced;
    const canvas = canvasIn(box, "Feature builder");
    const ctl = HG.el("div"); box.append(ctl);
    const sl = HG.el("div", { class: "sim-controls" });
    const ro = HG.el("div");
    const btnRow = HG.el("div", { class: "btn-row" });
    const buildBtn = HG.el("button", { class: "btn small primary", type: "button" }, "▶ Build the feature");
    const spinBtn = HG.el("button", { class: "btn small", type: "button", "aria-pressed": spin ? "true" : "false" }, spin ? "❚❚ Stop turning" : "⟳ Turntable");
    const stagesBtn = HG.el("button", { class: "btn small", type: "button" }, "Step through stages ▶");
    btnRow.append(buildBtn, stagesBtn, spinBtn);
    HG.choice(ctl, "Feature", [["extrude", "Extrude"], ["revolve", "Revolve"], ["loft", "Loft"], ["sweep", "Extrude along a path"], ["helix", "Helix"]], S.mode, (v) => { S.mode = v; t = 1; buildControls(); rebuild(); start(); });
    ctl.append(sl);
    box.append(btnRow, ro);
    const msg = note(box);
    box.append(HG.el("p", { class: "drag-hint" }, "Drag the model to turn it."));
    let mesh = [], extrasPre = () => {}, extras = () => {}, radius = 80, target = [0, 0, 0], ro2 = null;

    function buildControls() {
      sl.innerHTML = ""; ro.innerHTML = "";
      const m = S.mode, o = S[{ extrude: "ex", revolve: "rev", loft: "loft", sweep: "sw", helix: "hx" }[m]];
      const add = (key, label, min, max, step, unit) => HG.slider(sl, { label, min, max, step, value: o[key], unit, oninput: (v) => { o[key] = v; if (m === "helix") syncHelix(key); t = 1; rebuild(); sim.redraw(); } });
      if (m === "extrude") { add("w", "Profile width", 20, 90, 5, "mm"); add("h", "Profile height", 20, 70, 5, "mm"); add("d", "Extrude distance", 10, 100, 5, "mm"); ro2 = readouts(ro, [["a", "Profile area"], ["v", "Volume = area × distance"]]); }
      if (m === "revolve") { add("R", "Profile centre to axis", 15, 60, 1, "mm"); add("a", "Profile radius", 4, 20, 1, "mm"); add("ang", "Angle of revolution", 30, 360, 15, "°"); ro2 = readouts(ro, [["d", "Outside diameter"], ["v", "Volume = area × distance travelled"]]); }
      if (m === "loft") { add("s", "Bottom square side", 30, 100, 5, "mm"); add("d", "Top profile size", 10, 90, 5, "mm"); add("h", "Work plane offset", 30, 110, 5, "mm"); HG.choice(sl, "Top profile", [["circle", "Circle"], ["square", "Square"], ["hex", "Hexagon"]], o.top, (v) => { o.top = v; t = 1; rebuild(); sim.redraw(); }); ro2 = readouts(ro, [["p", "Profiles"], ["h", "Distance between planes"]]); }
      if (m === "sweep") { add("L1", "Path: vertical length", 20, 110, 5, "mm"); add("R", "Path: bend radius", 10, 50, 5, "mm"); add("L2", "Path: horizontal length", 20, 110, 5, "mm"); add("d", "Profile diameter", 6, 40, 2, "mm"); ro2 = readouts(ro, [["pl", "Path length"], ["v", "Volume ≈ area × path length"]]); }
      if (m === "helix") {
        HG.choice(sl, "You specify", [["pn", "Pitch + revolutions"], ["pL", "Pitch + length"], ["nL", "Revolutions + length"]], o.spec, (v) => { o.spec = v; buildControls(); rebuild(); sim.redraw(); });
        add("R", "Profile centre to axis", 10, 40, 1, "mm"); add("d", "Profile diameter", 2, 16, 1, "mm");
        if (o.spec !== "nL") add("p", "Pitch", 4, 30, 1, "mm");
        if (o.spec !== "pL") add("n", "Number of revolutions", 1, 12, 0.5, "");
        if (o.spec !== "pn") add("L", "Overall length (height)", 10, 160, 5, "mm");
        syncHelix();
        ro2 = readouts(ro, [["p", "Pitch"], ["n", "Revolutions"], ["L", "Overall length = pitch × revolutions"], ["w", "Wire length"]]);
      }
    }
    // keep the third helix quantity consistent with the two you specify: L = p × n
    function syncHelix() {
      const o = S.hx;
      if (o.spec === "pn") o.L = o.p * o.n;
      if (o.spec === "pL") o.n = o.L / o.p;
      if (o.spec === "nL") o.p = o.L / o.n;
    }
    const zUp = (prof, z) => prof.map(([x, y]) => [x, y, z]);
    function rebuild() {
      const m = S.mode;
      extras = () => {}; extrasPre = () => {};
      if (m === "extrude") {
        const o = S.ex, prof = E3.rect(o.w, o.h), d = Math.max(0.5, o.d * t);
        mesh = E3.prism(prof, 0, d, "sea");
        radius = Math.hypot(o.w, o.h, 100) * 0.62; target = [0, 0, 40];
        extras = (ctx, V, C) => {
          line3(ctx, V, zUp(prof, 0).concat([zUp(prof, 0)[0]]), C.lode, 2.5);
          const tip = [o.w / 2 + 8, 0, d];
          line3(ctx, V, [[o.w / 2 + 8, 0, 0], tip], C.red, 2);
          const a = V.proj(tip); HG.label(ctx, `${N(d, 0)} mm`, a[0] + 6, a[1], { col: C.red, size: 13 });
        };
        ro2.a.textContent = `${o.w} × ${o.h} = ${o.w * o.h} mm²`;
        ro2.v.textContent = `${N(o.w * o.h * o.d / 1000, 1)} cm³`;
        msg.textContent = `Extrude pushes a closed 2D profile straight out of its sketch plane by a set distance (here ${o.d} mm, in one direction). The profile (magenta) stays the same shape all the way: every cross-section of an extrusion is identical.`;
      }
      if (m === "revolve") {
        const o = S.rev, n = 48, ang = Math.max(2, o.ang * t);
        const segs = Math.max(2, Math.round(n * ang / 360));
        const prof = E3.circle(Math.min(o.a, o.R - 1), 18, o.R, 0).map(([r, z]) => [r, z]);
        mesh = E3.lathe(prof, segs, "gold", 0, ang * D2R, true);
        radius = o.R + o.a + 10; target = [0, 0, 0];
        // the axis is drawn before the model, so the model hides the part of it that is behind
        extrasPre = (ctx, V, C) => line3(ctx, V, [[0, 0, -radius * 0.9], [0, 0, radius * 0.9]], C.lode, 1.6, CHAIN);
        extras = (ctx, V, C) => {
          const a = V.proj([0, 0, radius * 0.9]); HG.label(ctx, "axis", a[0] + 6, a[1], { col: C.lode, size: 13 });
          line3(ctx, V, prof.map(([r, z]) => [r, 0, z]).concat([[prof[0][0], 0, prof[0][1]]]), C.lode, 2.5);
        };
        const rr = Math.min(o.a, o.R - 1);
        ro2.d.textContent = `2 × (${o.R} + ${rr}) = ${2 * (o.R + rr)} mm`;
        ro2.v.textContent = `${N((Math.PI * rr * rr) * (2 * Math.PI * o.R) * (o.ang / 360) / 1000, 1)} cm³`;
        msg.textContent = `Revolve spins a profile round an axis. A circle (radius ${rr} mm) whose centre is ${o.R} mm from the axis, revolved ${o.ang}°, gives ${o.ang >= 360 ? "a ring: HMS Vellum's lifebuoy" : "part of a ring with flat ends"}. The profile must not cross the axis. Volume = profile area × the distance its centre travels (2π × ${o.R} × ${o.ang}/360).`;
      }
      if (m === "loft") {
        const o = S.loft, as = E3.angles(48).map((a) => a + Math.PI / 4);
        const sq = E3.polar(E3.rect(o.s, o.s), as);
        const topPoly = o.top === "circle" ? E3.circle(o.d / 2, 48) : o.top === "square" ? E3.rect(o.d, o.d) : E3.circle(o.d / 2, 6);
        const top = o.top === "circle" ? as.map((a) => [o.d / 2 * Math.cos(a), o.d / 2 * Math.sin(a)]) : E3.polar(topPoly, as);
        const k = 12, rings = [];
        const kk = Math.max(1, Math.round(k * t));
        for (let i = 0; i <= kk; i++) { const f = i / k; rings.push(sq.map(([x, y], j) => [x + (top[j][0] - x) * f, y + (top[j][1] - y) * f, o.h * f])); }
        mesh = E3.orient(E3.skin(rings, { capStart: true, capEnd: true, mat: "grass" }));
        radius = Math.hypot(o.s * 0.75, o.h) * 0.75; target = [0, 0, o.h / 2];
        extras = (ctx, V, C) => {
          const loop = (p) => p.concat([p[0]]);
          line3(ctx, V, loop(zUp(E3.rect(o.s, o.s), 0)), C.lode, 2.5);
          line3(ctx, V, loop(zUp(topPoly, o.h)), C.lode, 2.5);
          const wp = [[-o.s * 0.75, -o.s * 0.75, o.h], [o.s * 0.75, -o.s * 0.75, o.h], [o.s * 0.75, o.s * 0.75, o.h], [-o.s * 0.75, o.s * 0.75, o.h], [-o.s * 0.75, -o.s * 0.75, o.h]];
          line3(ctx, V, wp, C.muted, 1, [5, 4]);
          const a = V.proj(wp[1]); HG.label(ctx, `work plane, offset ${o.h}`, a[0] - 4, a[1] - 10, { col: C.ink2, size: 12, align: "right" });
        };
        ro2.p.textContent = `${o.s} square → ${o.top === "circle" ? "Ø" + o.d + " circle" : o.top === "square" ? o.d + " square" : o.d + " across corners hexagon"}`;
        ro2.h.textContent = `${o.h} mm`;
        msg.textContent = `Loft blends between two (or more) closed profiles drawn on separate work planes. Here a ${o.s} mm square on the base plane changes smoothly into a ${o.top === "circle" ? "circle" : o.top === "square" ? "smaller square" : "hexagon"} on a work plane offset ${o.h} mm above it. No single profile describes the shape: every cross-section is different.`;
      }
      if (m === "sweep") {
        const o = S.sw, r = o.d / 2, n = 20;
        const path = []; // points along: up L1, quarter bend radius R, along +x L2
        for (let i = 0; i <= 6; i++) path.push({ p: [0, 0, o.L1 * i / 6], T: [0, 0, 1], Nn: [1, 0, 0] });
        for (let i = 1; i <= 12; i++) { const a = (Math.PI / 2) * i / 12; path.push({ p: [o.R - o.R * Math.cos(a), 0, o.L1 + o.R * Math.sin(a)], T: [Math.sin(a), 0, Math.cos(a)], Nn: [Math.cos(a), 0, -Math.sin(a)] }); }
        for (let i = 1; i <= 6; i++) path.push({ p: [o.R + o.L2 * i / 6, 0, o.L1 + o.R], T: [1, 0, 0], Nn: [0, 0, -1] });
        const total = o.L1 + Math.PI * o.R / 2 + o.L2;
        // keep the frames up to the built length
        const cum = [0];
        for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + E3.len(E3.sub(path[i].p, path[i - 1].p)));
        const lim = total * t, use = [];
        for (let i = 0; i < path.length; i++) { if (cum[i] <= lim + 1e-6) use.push(path[i]); else { const f = (lim - cum[i - 1]) / (cum[i] - cum[i - 1]); const a = path[i - 1], b = path[i]; use.push({ p: a.p.map((v, k) => v + (b.p[k] - v) * f), T: b.T, Nn: b.Nn }); break; } }
        if (use.length < 2) use.push({ p: [0, 0, 0.5], T: [0, 0, 1], Nn: [1, 0, 0] });
        const prof = E3.circle(r, n), B = [0, 1, 0];
        const rings = use.map((f) => E3.place(prof, f.p, f.Nn, B));
        mesh = E3.orient(E3.skin(rings, { capStart: true, capEnd: true, mat: "sea" }));
        radius = Math.max(o.L1 + o.R, o.R + o.L2) * 0.62 + 10; target = [(o.R + o.L2) / 2, 0, (o.L1 + o.R) / 2];
        extras = (ctx, V, C) => {
          line3(ctx, V, path.map((f) => f.p), C.lode, 1.6, CHAIN);
          // the work plane at the start of the path, perpendicular to it
          const s = r + 8, wp = [[-s, -s, 0], [s, -s, 0], [s, s, 0], [-s, s, 0], [-s, -s, 0]];
          line3(ctx, V, wp, C.muted, 1, [5, 4]);
          line3(ctx, V, zUp(prof, 0).concat([zUp(prof, 0)[0]]), C.lode, 2.5);
          const lab = (p, s2, dx = 6, dy = 0) => { const a = V.proj(p); HG.label(ctx, s2, a[0] + dx, a[1] + dy, { col: C.red, size: 13, bold: true }); };
          lab([-r - 2, 0, o.L1 / 2], `${o.L1}`, -10, 0);
          lab([o.R * 0.3, 0, o.L1 + o.R * 0.7], `R${o.R}`, -34, -6);
          lab([o.R + o.L2 / 2, 0, o.L1 + o.R + r + 4], `${o.L2}`, 0, -10);
        };
        ro2.pl.textContent = `${o.L1} + π×${o.R}/2 + ${o.L2} = ${N(total, 1)} mm`;
        ro2.v.textContent = `${N(Math.PI * r * r * total / 1000, 1)} cm³`;
        msg.textContent = (o.R < r ? `⚠ The bend radius (${o.R}) is smaller than the profile radius (${r}): the tube would fold through itself and CAD would refuse. ` : "") + `Extrude along a path (a sweep) drives a profile along a path. Draw the path first, with every dimension: the ${o.L1} mm vertical, the R${o.R} bend and the ${o.L2} mm horizontal. Then draw the Ø${o.d} profile on a work plane perpendicular to the path at its start.`;
      }
      if (m === "helix") {
        const o = S.hx;
        syncHelix();
        const segPerRev = 28, total = Math.max(1, Math.round(o.n * segPerRev));
        const kk = Math.max(1, Math.round(total * t));
        const prof = E3.circle(o.d / 2, 12), rings = [];
        for (let i = 0; i <= kk; i++) {
          const th = (o.n * 2 * Math.PI) * i / total, c = Math.cos(th), s = Math.sin(th);
          rings.push(E3.place(prof, [o.R * c, o.R * s, o.p * th / (2 * Math.PI)], [c, s, 0], [0, 0, 1]));
        }
        mesh = E3.orient(E3.skin(rings, { capStart: true, capEnd: true, mat: "gold" }));
        radius = Math.max(o.R * 1.6, o.L * 0.62) + 10; target = [0, 0, o.L / 2];
        extrasPre = (ctx, V, C) => line3(ctx, V, [[0, 0, -10], [0, 0, o.L + 12]], C.lode, 1.6, CHAIN);
        extras = (ctx, V, C) => {
          line3(ctx, V, zUp(prof.map(([x, y]) => [o.R + x, 0]), 0).map(([x, , z], i) => [x, 0, prof[i][1]]).concat([[o.R + prof[0][0], 0, prof[0][1]]]), C.lode, 2.5);
          // pitch marker between the first two coils on the near side
          const a = V.proj([o.R + o.d, 0, 0]), b = V.proj([o.R + o.d, 0, o.p]);
          HG.arrow(ctx, a[0] + 10, a[1], b[0] + 10, b[1], C.red, 1.6, 7); HG.arrow(ctx, b[0] + 10, b[1], a[0] + 10, a[1], C.red, 1.6, 7);
          HG.label(ctx, `pitch ${N(o.p, 1)}`, b[0] + 16, (a[1] + b[1]) / 2, { col: C.red, size: 13, bold: true });
        };
        ro2.p.textContent = `${N(o.p, 2)} mm`; ro2.n.textContent = N(o.n, 2);
        ro2.L.textContent = `${N(o.p, 2)} × ${N(o.n, 2)} = ${N(o.L, 1)} mm`;
        ro2.w.textContent = `${N(o.n * Math.hypot(2 * Math.PI * o.R, o.p), 0)} mm`;
        const warn = o.p <= o.d ? `⚠ Pitch (${N(o.p, 1)}) is not bigger than the profile diameter (${o.d}): neighbouring coils would touch or pass through each other. ` : "";
        msg.textContent = warn + `A helix (coil) drives a profile round and along an axis. Set it by any two of pitch, number of revolutions and overall length, because length = pitch × revolutions. Pitch is the distance between the centres of neighbouring coils, measured along the axis. The Ø${o.d} profile sits ${o.R} mm from the axis.`;
      }
      E3.adjacency(mesh);
      canvas.setAttribute("aria-label", `${m} feature. ${msg.textContent}`);
    }
    const sim = HG.sim(canvas, {
      w: 640, h: 400, height: (w) => Math.round(Math.min(420, Math.max(300, w * 0.66))), loop: false,
      draw(ctx, time, dt, C, s) {
        if (building) {
          t = Math.min(1, t + dt / 2.2);
          rebuild();
          if (t >= 1) { building = false; if (!spin) s.pause(); }
        }
        if (spin && !building) cam.yaw += dt * 0.35;
        const V = fitView(cam, s.w, s.h, radius, target);
        const list = E3.prepare(mesh, V);
        extrasPre(ctx, V, C);
        paint(ctx, list, C, { lw: 1.2 });
        extras(ctx, V, C);
      },
    });
    function start() {
      if (HG.reduced) { t = 1; rebuild(); sim.redraw(); return; }
      t = 0; building = true; rebuild(); sim.play();
    }
    buildBtn.addEventListener("click", start);
    let stage = 4;
    stagesBtn.addEventListener("click", () => { building = false; stage = (stage + 1) % 5; t = (stage + 1) / 5; rebuild(); sim.redraw(); stagesBtn.textContent = `Stage ${stage + 1} of 5 ▶`; });
    spinBtn.addEventListener("click", () => {
      spin = !spin; spinBtn.textContent = spin ? "❚❚ Stop turning" : "⟳ Turntable"; spinBtn.setAttribute("aria-pressed", spin ? "true" : "false");
      if (spin) sim.play(); else if (!building) sim.pause();
    });
    orbit(canvas, cam, () => sim.redraw());
    buildControls(); rebuild();
    if (!HG.reduced) start(); else sim.redraw();
  });

  /* =====================================================================
     4. Modelling edits on a block: fillet / chamfer (regular, irregular) and shell
     ===================================================================== */
  mount("w-edits", (box) => {
    const S = { edit: "fillet", r1: 10, r2: 10, a: 10, b: 10, shell: false, t: 3 };
    const W = 90, Dp = 60, H = 45;
    const cam = { yaw: -0.7, pitch: 0.5 };
    const canvas = canvasIn(box, "Modelling edits");
    const ctl = HG.el("div"); box.append(ctl);
    HG.choice(ctl, "Edit on the four vertical edges", [["none", "None"], ["fillet", "Fillet (regular)"], ["vfillet", "Fillet (irregular)"], ["chamfer", "Chamfer (regular)"], ["uchamfer", "Chamfer (irregular)"]], S.edit, (v) => { S.edit = v; controlsFor(); rebuild(); });
    const sl = HG.el("div", { class: "sim-controls" }); ctl.append(sl);
    const sh = HG.el("div", { class: "sim-controls" }); ctl.append(sh);
    const shellBtn = HG.el("button", { type: "button", class: "seg-btn", "aria-pressed": "false" }, "Shell: remove the top face");
    shellBtn.addEventListener("click", () => { S.shell = !S.shell; shellBtn.setAttribute("aria-pressed", S.shell ? "true" : "false"); rebuild(); });
    sh.append(HG.el("div", { class: "seg" }, shellBtn));
    HG.slider(sh, { label: "Shell wall thickness", min: 1, max: 8, step: 1, value: S.t, unit: "mm", oninput: (v) => { S.t = v; rebuild(); } });
    const ro = readouts(box, [["vol", "Volume of material"], ["faces", "Faces on the model"]]);
    const msg = note(box);
    box.append(HG.el("p", { class: "drag-hint" }, "Drag the model to turn it."));
    let mesh = [];
    function controlsFor() {
      sl.innerHTML = "";
      const add = (key, label, max) => HG.slider(sl, { label, min: 2, max, step: 1, value: S[key], unit: "mm", oninput: (v) => { S[key] = v; rebuild(); } });
      if (S.edit === "fillet") add("r1", "Radius", 25);
      if (S.edit === "vfillet") { add("r1", "Radius at the bottom", 25); add("r2", "Radius at the top", 25); }
      if (S.edit === "chamfer") add("a", "Distance (both sides)", 25);
      if (S.edit === "uchamfer") { add("a", "Distance 1 (along the 90 side)", 25); add("b", "Distance 2 (along the 60 side)", 25); }
    }
    // the outline at height z (outer) and its inward offset by t (inner)
    function outline(z, inset) {
      const e = S.edit, f = z / H;
      if (e === "none") return E3.roundRect(W - 2 * inset, Dp - 2 * inset, 0, 6);
      if (e === "fillet" || e === "vfillet") { const r = e === "fillet" ? S.r1 : S.r1 + (S.r2 - S.r1) * f; return E3.roundRect(W - 2 * inset, Dp - 2 * inset, Math.max(0, r - inset), 6); }
      const a = S.a, b = e === "chamfer" ? S.a : S.b;
      const outer = E3.chamferRect(W, Dp, a, b);
      return inset ? E3.offsetConvex(outer, inset) : outer;
    }
    const area = (p) => Math.abs(p.reduce((s, q, i) => s + q[0] * p[(i + 1) % p.length][1] - p[(i + 1) % p.length][0] * q[1], 0)) / 2;
    function rebuild() {
      const L = (prof, z) => prof.map(([x, y]) => [x, y, z]);
      const rings = [];
      const K = S.edit === "vfillet" ? 10 : 1;
      for (let i = 0; i <= K; i++) rings.push(L(outline(H * i / K, 0), H * i / K));
      let vol = 0;
      for (let i = 0; i < K; i++) vol += (area(outline(H * i / K, 0)) + area(outline(H * (i + 1) / K, 0))) / 2 * H / K;
      if (S.shell) {
        const inner = [];
        for (let i = K; i >= 0; i--) { const z = S.t + (H - S.t) * i / K; inner.push(L(outline(z, S.t), z)); }
        mesh = E3.orient(E3.skin(rings.concat(inner), { capStart: true, capEnd: true, mat: "sea" }));
        let cav = 0;
        for (let i = 0; i < K; i++) { const z0 = S.t + (H - S.t) * i / K, z1 = S.t + (H - S.t) * (i + 1) / K; cav += (area(outline(z0, S.t)) + area(outline(z1, S.t))) / 2 * (z1 - z0); }
        vol -= cav;
      } else mesh = E3.orient(E3.skin(rings, { capStart: true, capEnd: true, mat: "sea" }));
      E3.adjacency(mesh);
      const e = S.edit;
      const flatSides = e === "none" ? 4 : 8; // 4 sides plus 4 rounds or 4 chamfer faces
      // outer sides + bottom + (top, or rim + inner walls + inner floor when shelled)
      const rounded = e === "fillet" ? S.r1 > S.t : e === "vfillet" ? Math.max(S.r1, S.r2) > S.t : e !== "none";
      const inner = rounded ? flatSides : 4;
      const faces = S.shell ? flatSides + 1 + 1 + inner + 1 : flatSides + 2;
      ro.vol.textContent = `${N(vol / 1000, 1)} cm³`;
      ro.faces.textContent = String(faces);
      const parts = {
        none: "A plain 90 × 60 × 45 block: 6 faces, 12 edges, 8 vertices.",
        fillet: `A regular fillet: every selected edge is rounded with the same ${S.r1} mm radius all the way along.`,
        vfillet: `An irregular (variable) fillet: the radius changes along the edge, from ${S.r1} mm at the bottom to ${S.r2} mm at the top.`,
        chamfer: `A regular chamfer: the edge is cut back the same ${S.a} mm on both faces, so the bevel is at 45°.`,
        uchamfer: `An irregular chamfer: two different distances (${S.a} mm and ${S.b} mm), so the bevel is not at 45°.`,
      }[e];
      msg.textContent = parts + (S.shell ? ` Shell hollows the solid, leaving walls ${S.t} mm thick everywhere and removing the face you pick (the top), so you can see inside. The fillets and chamfers carry through to the inside walls.` : "");
      canvas.setAttribute("aria-label", msg.textContent);
      sim.redraw();
    }
    const sim = HG.sim(canvas, {
      w: 640, h: 360, height: (w) => Math.round(Math.min(380, Math.max(280, w * 0.6))),
      draw(ctx, time, dt, C, s) { const V = fitView(cam, s.w, s.h, 62, [0, 0, H / 2], 0.55); paint(ctx, E3.prepare(mesh, V), C, { lw: 1.3 }); },
    });
    orbit(canvas, cam, () => sim.redraw());
    controlsFor(); rebuild();
  });

  /* =====================================================================
     5. Boolean operations on voxel solids: add, subtract, intersect
     ===================================================================== */
  mount("w-boolean", (box) => {
    const S = { op: "subtract", tool: "cyl", x: 12, r: 4, ghost: true };
    const NX = 24, NY = 14, NZ = 12;
    const cam = { yaw: -0.65, pitch: 0.55 };
    const canvas = canvasIn(box, "Boolean operations");
    const ctl = HG.el("div"); box.append(ctl);
    HG.choice(ctl, "Operation", [["add", "Add (join)"], ["subtract", "Subtract (cut)"], ["intersect", "Intersect"]], S.op, (v) => { S.op = v; rebuild(); });
    HG.choice(ctl, "Tool body B", [["cyl", "Cylinder"], ["sphere", "Sphere"], ["box", "Block"]], S.tool, (v) => { S.tool = v; rebuild(); });
    const sl = controls(box);
    HG.slider(sl, { label: "Move B along the block", min: 2, max: 22, step: 1, value: S.x, unit: "blocks", oninput: (v) => { S.x = v; rebuild(); } });
    HG.slider(sl, { label: "Size of B", min: 2, max: 7, step: 1, value: S.r, unit: "blocks", oninput: (v) => { S.r = v; rebuild(); } });
    const ghostBtn = HG.el("button", { type: "button", class: "seg-btn", "aria-pressed": "true" }, "Show B as a ghost outline");
    ghostBtn.addEventListener("click", () => { S.ghost = !S.ghost; ghostBtn.setAttribute("aria-pressed", S.ghost ? "true" : "false"); sim.redraw(); });
    box.append(HG.el("div", { class: "seg" }, ghostBtn));
    const ro = readouts(box, [["a", "Volume of A"], ["b", "Volume of B"], ["ab", "Overlap A ∩ B"], ["res", "Result"]]);
    const msg = note(box);
    box.append(HG.el("p", { class: "drag-hint" }, "One block here is one cubic unit. Drag the model to turn it."));
    let mesh = [], ghost = [];
    const inA = (i, j, k) => i >= 2 && i < 22 && j >= 2 && j < 12 && k < 6;
    function inB(i, j, k) {
      const x = i + 0.5 - S.x, y = j + 0.5 - 7, z = k + 0.5 - 6, r = S.r;
      if (S.tool === "cyl") return x * x + y * y <= r * r && k < NZ;
      if (S.tool === "sphere") return x * x + y * y + z * z <= r * r;
      return Math.abs(x) <= r && Math.abs(y) <= r && k >= 2 && k < 10;
    }
    function rebuild() {
      let a = 0, b = 0, ab = 0;
      for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) { const A = inA(i, j, k), B = inB(i, j, k); a += A; b += B; ab += A && B; }
      const get = (i, j, k) => {
        const A = inA(i, j, k), B = inB(i, j, k);
        if (S.op === "add") return A || B ? (B ? "gold" : "sea") : null;
        if (S.op === "subtract") return A && !B ? "sea" : null;
        return A && B ? "lode" : null;
      };
      mesh = E3.voxels(NX, NY, NZ, get, 1, [-NX / 2, -NY / 2, 0]);
      E3.adjacency(mesh);
      ghost = E3.voxels(NX, NY, NZ, (i, j, k) => (inB(i, j, k) ? "gold" : null), 1, [-NX / 2, -NY / 2, 0]);
      E3.adjacency(ghost);
      const res = S.op === "add" ? a + b - ab : S.op === "subtract" ? a - ab : ab;
      ro.a.textContent = `${a}`; ro.b.textContent = `${b}`; ro.ab.textContent = `${ab}`;
      ro.res.textContent = S.op === "add" ? `${a} + ${b} − ${ab} = ${res}` : S.op === "subtract" ? `${a} − ${ab} = ${res}` : `${res}`;
      msg.textContent = {
        add: `Add (join, union) merges the two bodies into one solid. Volume = A + B − the overlap, because the overlap would otherwise be counted twice. Gold blocks came from B.`,
        subtract: `Subtract (cut) removes B from A: whatever of A was inside B is gone. This is how holes, slots and pockets are made: draw a profile, then extrude it and subtract.${ab === 0 ? " Right now B does not touch A, so nothing is removed." : ""}`,
        intersect: `Intersect keeps only the volume the two bodies share.${ab === 0 ? " They do not overlap, so the result is empty." : ` Here that is the ${res} blocks inside both.`}`,
      }[S.op];
      canvas.setAttribute("aria-label", `${S.op} of block A and ${S.tool} B. Result volume ${res} blocks. ${msg.textContent}`);
      sim.redraw();
    }
    const sim = HG.sim(canvas, {
      w: 640, h: 360, height: (w) => Math.round(Math.min(380, Math.max(280, w * 0.58))),
      draw(ctx, time, dt, C, s) {
        const V = fitView(cam, s.w, s.h, 14, [0, 0, 4], 0.55);
        paint(ctx, E3.prepare(mesh, V), C, { lw: 1.1, grid: true });
        if (S.ghost && S.op !== "add") {
          ctx.save(); ctx.setLineDash([4, 4]);
          const list = E3.prepare(ghost, V, { double: false });
          ctx.strokeStyle = C.gold; ctx.lineWidth = 1.1; ctx.globalAlpha = 0.9;
          ctx.beginPath();
          list.forEach((it) => it.edges.forEach(([i, ink]) => { if (!ink) return; const a = it.sp[i], b = it.sp[(i + 1) % it.sp.length]; ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }));
          ctx.stroke(); ctx.restore();
        }
      },
    });
    orbit(canvas, cam, () => sim.redraw());
    rebuild();
  });

  /* =====================================================================
     6. Vertices, edges and faces: count them on a turning solid
     ===================================================================== */
  mount("w-vef", (box) => {
    const solids = {
      cube: { name: "Cube", v: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], f: [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]] },
      tri: { name: "Triangular prism", v: [[0, 0, 0], [1, 0, 0], [0.5, 0.87, 0], [0, 0, 1.2], [1, 0, 1.2], [0.5, 0.87, 1.2]], f: [[0, 2, 1], [3, 4, 5], [0, 1, 4, 3], [1, 2, 5, 4], [2, 0, 3, 5]] },
      pyr: { name: "Square pyramid", v: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.5, 0.5, 0.9]], f: [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]] },
      hex: { name: "Hexagonal prism", v: [], f: [] },
      cut: { name: "Cube with one corner chamfered", v: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [0.6, 1, 1], [1, 0.6, 1], [1, 1, 0.6]], f: [[0, 3, 2, 1], [0, 1, 5, 4], [3, 0, 4, 6], [4, 5, 8, 7, 6], [1, 2, 9, 8, 5], [2, 3, 6, 7, 9], [7, 8, 9]] },
    };
    for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; solids.hex.v.push([0.5 + 0.55 * Math.cos(a), 0.5 + 0.55 * Math.sin(a), 0]); }
    for (let i = 0; i < 6; i++) solids.hex.v.push([solids.hex.v[i][0], solids.hex.v[i][1], 1]);
    solids.hex.f.push([5, 4, 3, 2, 1, 0], [6, 7, 8, 9, 10, 11]);
    for (let i = 0; i < 6; i++) solids.hex.f.push([i, (i + 1) % 6, (i + 1) % 6 + 6, i + 6]);
    const S = { solid: "cube", show: "v", k: 0 };
    const cam = { yaw: -0.7, pitch: 0.45 };
    const canvas = canvasIn(box, "Vertices, edges and faces");
    const ctl = HG.el("div"); box.append(ctl);
    HG.choice(ctl, "Solid", Object.entries(solids).map(([k, s]) => [k, s.name]), S.solid, (v) => { S.solid = v; S.k = 0; setup(); });
    HG.choice(ctl, "Count", [["v", "Vertices"], ["e", "Edges"], ["f", "Faces"]], S.show, (v) => { S.show = v; S.k = 0; count(); });
    const br = HG.el("div", { class: "btn-row" });
    const go = HG.el("button", { class: "btn small primary", type: "button" }, "▶ Count them");
    const all = HG.el("button", { class: "btn small", type: "button" }, "Show all at once");
    br.append(go, all); box.append(br);
    const ro = readouts(box, [["v", "V (vertices)"], ["e", "E (edges)"], ["f", "F (faces)"], ["eu", "V − E + F"]]);
    const msg = note(box);
    let mesh = [], edges = [], sol = null, counting = false, acc = 0;
    function setup() {
      sol = solids[S.solid];
      const c = [0.5, 0.5, 0.5];
      mesh = E3.orient(sol.f.map((f) => ({ p: f.map((i) => E3.sub(sol.v[i], c)), mat: "sea", idx: f })));
      E3.adjacency(mesh);
      const set = new Map();
      sol.f.forEach((f) => f.forEach((a, i) => { const b = f[(i + 1) % f.length], k = Math.min(a, b) + "-" + Math.max(a, b); set.set(k, [a, b]); }));
      edges = [...set.values()];
      const V = sol.v.length, Ec = edges.length, F = sol.f.length;
      ro.v.textContent = V; ro.e.textContent = Ec; ro.f.textContent = F; ro.eu.textContent = `${V} − ${Ec} + ${F} = ${V - Ec + F}`;
      count();
    }
    function count() {
      const n = S.show === "v" ? sol.v.length : S.show === "e" ? edges.length : sol.f.length;
      S.k = HG.reduced ? n : 0; acc = 0;
      msg.textContent = { v: "A vertex is a corner point where edges meet.", e: "An edge is the line where two faces meet.", f: "A face is a single surface of the solid, bounded by edges." }[S.show] + ` This ${sol.name.toLowerCase()} has ${n}. For any solid like these (no holes through it), V − E + F = 2: a handy check on your count.`;
      canvas.setAttribute("aria-label", `${sol.name}: ${sol.v.length} vertices, ${edges.length} edges, ${sol.f.length} faces.`);
      sim.redraw();
    }
    const sim = HG.sim(canvas, {
      w: 640, h: 340, height: (w) => Math.round(Math.min(360, Math.max(260, w * 0.55))),
      draw(ctx, time, dt, C, s) {
        if (!sol) return;
        if (s.playing) { cam.yaw += dt * 0.3; if (counting) { acc += dt; if (acc > 0.45) { acc = 0; S.k++; const n = S.show === "v" ? sol.v.length : S.show === "e" ? edges.length : sol.f.length; if (S.k >= n) { S.k = n; counting = false; } } } }
        const V = fitView(cam, s.w, s.h, 0.95, [0, 0, 0], 0.52);
        const list = E3.prepare(mesh, V);
        paint(ctx, list, C, { lw: 1.4 });
        const c = [0.5, 0.5, 0.5], P = (q) => V.proj(E3.sub(q, c));
        // hidden edges dashed, so every one can be counted
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
        edges.forEach(([a, b]) => { const A = P(sol.v[a]), B = P(sol.v[b]); ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); });
        ctx.restore();
        const lab = (i, p) => { HG.dot(ctx, p[0], p[1], C.lode, 4); HG.label(ctx, String(i + 1), p[0] + 6, p[1] - 8, { col: C.lode, size: 13, bold: true }); };
        if (S.show === "v") sol.v.slice(0, S.k).forEach((q, i) => lab(i, P(q)));
        if (S.show === "e") edges.slice(0, S.k).forEach(([a, b], i) => { const A = P(sol.v[a]), B = P(sol.v[b]); ctx.save(); ctx.strokeStyle = C.lode; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(A[0], A[1]); ctx.lineTo(B[0], B[1]); ctx.stroke(); ctx.restore(); lab(i, [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]); });
        if (S.show === "f") sol.f.slice(0, S.k).forEach((f, i) => { const q = f.reduce((s2, k) => E3.add(s2, sol.v[k]), [0, 0, 0]).map((v) => v / f.length); lab(i, P(q)); });
      },
    });
    go.addEventListener("click", () => { S.k = 0; acc = 0; counting = true; if (HG.reduced) { S.k = 99; counting = false; S.k = S.show === "v" ? sol.v.length : S.show === "e" ? edges.length : sol.f.length; sim.redraw(); } else sim.play(); });
    all.addEventListener("click", () => { counting = false; S.k = S.show === "v" ? sol.v.length : S.show === "e" ? edges.length : sol.f.length; sim.redraw(); });
    orbit(canvas, cam, () => sim.redraw(), () => sim.pause());
    setup();
    if (!HG.reduced) sim.play();
  });

  /* =====================================================================
     7. The modelling tree: suppress or edit a feature and the model regenerates
     ===================================================================== */
  mount("w-tree", (box) => {
    const P = { W: 120, D: 80, T: 20, B: 50, H: 40, d: 20, h: 10, inset: 15 };
    const feats = [
      { id: "s1", name: "Sketch1: rectangle W × D (XY plane)", parent: null, kind: "sketch", params: [["W", "Width W", 80, 140, 5], ["D", "Depth D", 50, 90, 5]] },
      { id: "e1", name: "Extrude1: base plate, distance T", parent: "s1", kind: "feature", params: [["T", "Distance T", 10, 30, 5]] },
      { id: "s2", name: "Sketch2: circle ØB (top face of Extrude1)", parent: "e1", kind: "sketch", params: [["B", "Diameter B", 30, 60, 5]] },
      { id: "e2", name: "Extrude2: boss, distance H", parent: "s2", kind: "feature", params: [["H", "Distance H", 15, 50, 5]] },
      { id: "s3", name: "Sketch3: circle Ød (top face of Extrude2)", parent: "e2", kind: "sketch", params: [["d", "Diameter d", 10, 25, 5]] },
      { id: "c3", name: "Extrude3: subtract, through all (bore)", parent: "s3", kind: "feature", params: [] },
      { id: "s4", name: "Sketch4: circle Øh, 15 from two edges", parent: "e1", kind: "sketch", params: [["h", "Diameter h", 5, 15, 5]] },
      { id: "c4", name: "Extrude4: subtract, through all (fixing hole)", parent: "s4", kind: "feature", params: [] },
      { id: "a4", name: "Box array: Extrude4, 2 × 2", parent: "c4", kind: "feature", params: [] },
    ];
    const sup = {};
    let sel = "e1";
    const wrap = HG.el("div", { class: "cad-tree-grid" });
    const treeBox = HG.el("div", { class: "cad-tree", role: "group", "aria-label": "Modelling tree" });
    const right = HG.el("div");
    const canvas = HG.el("canvas", { class: "sim cad-canvas", role: "img", "aria-label": "Model" });
    right.append(canvas);
    wrap.append(treeBox, right);
    box.append(wrap);
    const edit = HG.el("div", { class: "sim-controls" });
    box.append(edit);
    const draw2d = HG.svg("svg", { viewBox: "0 0 400 200", class: "cad-elev", role: "img", "aria-label": "Associated elevation" });
    box.append(HG.el("figure", { class: "cad-elev-fig" }, draw2d, HG.el("figcaption", null, "The associated drawing: an elevation of the same part, dimensioned. It updates with the model.")));
    const msg = note(box);
    const cam = { yaw: -0.7, pitch: 0.55 };
    const isSup = (f) => { for (let x = f; x; x = feats.find((g) => g.id === x.parent)) if (sup[x.id]) return x.id; return null; };
    function renderTree() {
      treeBox.innerHTML = "";
      treeBox.append(HG.el("div", { class: "cad-tree-root" }, "▣ Bracket.part"), HG.el("div", { class: "cad-tree-item cad-datum" }, "⌖ Origin: XY, XZ, YZ planes, axes, centre point"));
      ["e1", "s1", "e2", "s2", "c3", "s3", "c4", "s4", "a4"].map((id) => feats.find((g) => g.id === id)).forEach((f) => {
        const by = isSup(f), depth = f.kind === "sketch" ? 1 : 0;
        const item = HG.el("div", { class: "cad-tree-item" + (by ? " is-sup" : "") + (sel === f.id ? " is-sel" : ""), style: `--d:${depth}` });
        const pick = HG.el("button", { type: "button", class: "cad-tree-name", "aria-pressed": sel === f.id ? "true" : "false" }, (f.kind === "sketch" ? "✎ " : "◆ ") + f.name);
        pick.addEventListener("click", () => { sel = f.id; renderTree(); renderEdit(); });
        const s = HG.el("button", { type: "button", class: "btn small cad-sup", "aria-pressed": sup[f.id] ? "true" : "false", "aria-label": (sup[f.id] ? "Unsuppress " : "Suppress ") + f.name }, sup[f.id] ? "Unsuppress" : "Suppress");
        s.addEventListener("click", () => { sup[f.id] = !sup[f.id]; renderTree(); regen(); });
        item.append(pick, s);
        if (by && by !== f.id) item.append(HG.el("span", { class: "cad-tree-why" }, "suppressed with its parent"));
        treeBox.append(item);
      });
    }
    function renderEdit() {
      edit.innerHTML = "";
      const f = feats.find((g) => g.id === sel);
      if (!f.params.length) { edit.append(HG.el("p", { class: "hint" }, `${f.name.split(":")[0]} has no size of its own: it takes its shape from its sketch. Select the sketch above it to edit the size.`)); return; }
      f.params.forEach(([k, lab, min, max, step]) => HG.slider(edit, { label: `${f.name.split(":")[0]} · ${lab}`, min, max, step, value: P[k], unit: "mm", oninput: (v) => { P[k] = v; regen(); } }));
    }
    let mesh = [];
    const on = (id) => !isSup(feats.find((f) => f.id === id));
    function regen() {
      const vx = 2.5; // one block = 2.5 mm
      const nx = Math.ceil(P.W / vx), ny = Math.ceil(P.D / vx), nz = Math.ceil((P.T + P.H) / vx);
      const base = on("e1"), boss = on("e2"), bore = on("c3"), hole = on("c4"), arr = on("a4");
      const holes = [];
      if (hole) {
        holes.push([P.inset, P.inset]);
        if (arr) holes.push([P.W - P.inset, P.inset], [P.inset, P.D - P.inset], [P.W - P.inset, P.D - P.inset]);
      }
      const get = (i, j, k) => {
        const x = (i + 0.5) * vx, y = (j + 0.5) * vx, z = (k + 0.5) * vx;
        const cx = x - P.W / 2, cy = y - P.D / 2;
        let solid = false, m = "sea";
        if (base && z < P.T && x < P.W && y < P.D) solid = true;
        if (boss && z >= P.T && z < P.T + P.H && cx * cx + cy * cy <= (P.B / 2) ** 2) { solid = true; m = "gold"; }
        if (!solid) return null;
        if (bore && cx * cx + cy * cy <= (P.d / 2) ** 2) return null;
        for (const [hx, hy] of holes) if ((x - hx) ** 2 + (y - hy) ** 2 <= (P.h / 2) ** 2 && z < P.T) return null;
        return m;
      };
      mesh = E3.voxels(nx, ny, nz, get, vx, [-P.W / 2, -P.D / 2, 0]);
      E3.adjacency(mesh);
      // the associated elevation (front view), drawn to scale
      drawElev(base, boss, bore, hole, arr);
      const off = feats.filter((f) => isSup(f)).map((f) => f.name.split(":")[0]);
      msg.textContent = off.length
        ? `Suppressed: ${off.join(", ")}. A suppressed feature is switched off, not deleted: unsuppress it and it comes back. Features built on it (its children) are switched off with it, because the face or sketch they were placed on no longer exists.`
        : `All features on. The tree records how the part was built, in order. Change a size in a sketch or feature and the model is rebuilt from that point down: the boss stays on top of the plate even when the plate gets thicker, because Sketch2 is attached to the top face of Extrude1.`;
      canvas.setAttribute("aria-label", `Bracket model: plate ${P.W} by ${P.D} by ${P.T}` + (boss ? `, boss diameter ${P.B} height ${P.H}` : "") + (bore ? `, bore diameter ${P.d}` : "") + `. ${off.length ? "Suppressed: " + off.join(", ") : "All features on."}`);
      sim.redraw();
    }
    function drawElev(base, boss, bore, hole, arr) {
      draw2d.innerHTML = "";
      const top = (base ? P.T : 0) + (boss ? P.H : 0);
      const s = Math.min(250 / P.W, 120 / Math.max(top, P.T)), ox = 70, oy = 160;
      const g = (e) => draw2d.append(e);
      const X = (x) => ox + x * s, Y = (y) => oy - y * s;
      const R = (x, y, w, h, cls) => g(HG.svg("rect", { x: X(x), y: Y(y + h), width: w * s, height: h * s, class: cls }));
      const Lh = (x1, y1, x2, y2, cls) => g(HG.svg("line", { x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), class: cls }));
      const ln = (x1, y1, x2, y2, cls) => g(HG.svg("line", { x1, y1, x2, y2, class: cls }));
      const head = (x, y, dx, dy) => { const L = 7, w = 2.6, px = -dy, py = dx; g(HG.svg("path", { d: `M${x} ${y}L${x - dx * L + px * w} ${y - dy * L + py * w}L${x - dx * L - px * w} ${y - dy * L - py * w}Z`, class: "cad-el-arrow" })); };
      const txt = (x, y, str, anchor = "middle") => g(HG.svg("text", { x, y, "font-size": 13, "text-anchor": anchor, class: "ink halo", text: str }));
      // horizontal dimension between screen x1 and x2, features at screen ys (extension lines start 3 px clear of them)
      const hdim = (x1, x2, yf1, yf2, yl, str) => {
        const up = yl < Math.min(yf1, yf2), d = up ? -1 : 1;
        ln(x1, yf1 + 3 * d, x1, yl + 4 * d, "cad-el-dim"); ln(x2, yf2 + 3 * d, x2, yl + 4 * d, "cad-el-dim");
        ln(x1, yl, x2, yl, "cad-el-dim"); head(x1, yl, -1, 0); head(x2, yl, 1, 0);
        txt((x1 + x2) / 2, yl - 4, str);
      };
      const vdim = (y1, y2, xf1, xf2, xl, str) => {
        const left = xl < Math.min(xf1, xf2), d = left ? -1 : 1;
        ln(xf1 + 3 * d, y1, xl + 4 * d, y1, "cad-el-dim"); ln(xf2 + 3 * d, y2, xl + 4 * d, y2, "cad-el-dim");
        ln(xl, y1, xl, y2, "cad-el-dim"); head(xl, y1, 0, 1); head(xl, y2, 0, -1);
        txt(xl + (left ? -5 : 5), (y1 + y2) / 2 + 4, str, left ? "end" : "start");
      };
      if (!base && !boss) { txt(200, 100, "Nothing to draw: every feature is suppressed"); return; }
      if (base) R(0, 0, P.W, P.T, "cad-el-out");
      if (boss) R(P.W / 2 - P.B / 2, base ? P.T : 0, P.B, P.H, "cad-el-out");
      const z0 = base ? 0 : P.T;
      if (bore && (boss || base)) { Lh(P.W / 2 - P.d / 2, base ? 0 : P.T, P.W / 2 - P.d / 2, top, "cad-el-hid"); Lh(P.W / 2 + P.d / 2, base ? 0 : P.T, P.W / 2 + P.d / 2, top, "cad-el-hid"); }
      Lh(P.W / 2, -4, P.W / 2, top + 4, "cad-el-cl");
      if (hole && base) { const xs = arr ? [P.inset, P.W - P.inset] : [P.inset]; xs.forEach((x) => { Lh(x - P.h / 2, 0, x - P.h / 2, P.T, "cad-el-hid"); Lh(x + P.h / 2, 0, x + P.h / 2, P.T, "cad-el-hid"); Lh(x, -3, x, P.T + 3, "cad-el-cl"); }); }
      if (base) {
        hdim(X(0), X(P.W), Y(0), Y(0), Y(0) + 24, String(P.W));
        vdim(Y(0), Y(P.T), X(0), X(0), X(0) - 22, String(P.T));
      }
      if (boss) {
        const bl = X(P.W / 2 - P.B / 2), br = X(P.W / 2 + P.B / 2), bt = Y(top);
        hdim(bl, br, bt, bt, bt - 16, "Ø" + P.B);
        vdim(Y(top - P.H), bt, br, br, X(P.W) + 22, String(P.H));
      }
      void z0;
      draw2d.setAttribute("aria-label", `Elevation: plate ${P.W} wide and ${P.T} thick` + (boss ? `, boss diameter ${P.B} and ${P.H} high` : "") + ", with dimensions.");
    }
    const sim = HG.sim(canvas, {
      w: 420, h: 300, height: (w) => Math.round(Math.min(330, Math.max(240, w * 0.7))),
      draw(ctx, time, dt, C, s) { const V = fitView(cam, s.w, s.h, 72, [0, 0, 20], 0.56); paint(ctx, E3.prepare(mesh, V), C, { lw: 1, grid: false }); if (!mesh.length) HG.label(ctx, "Every feature is suppressed: nothing to show", s.w / 2, s.h / 2, { align: "center", size: 13, col: C.muted }); },
    });
    orbit(canvas, cam, () => sim.redraw());
    renderTree(); renderEdit(); regen();
  });

  /* =====================================================================
     8. The assembler: 3D constraints remove degrees of freedom
     ===================================================================== */
  mount("w-assembly", (box) => {
    // world: base fixed, its hole axis is the z axis, top face at z = 30
    const base = E3.plateWithHole(E3.rect(60, 60), 8, 0, 30, "muted");
    const armOutline = [[-20, -16], [100, -16], [100, 16], [-20, 16]];
    const arm0 = E3.plateWithHole(armOutline, 8, 0, 10, "sea");
    const pin0 = E3.lathe([[0, 0], [7.6, 0], [7.6, 40], [13, 40], [13, 46], [0, 46]], 32, "gold");
    const DOF = ["Tx", "Ty", "Tz", "Rx", "Ry", "Rz"];
    const RM = { centre: ["Tx", "Ty", "Rx", "Ry"], mate: ["Tz", "Rx", "Ry"], offset: ["Tz", "Rx", "Ry"], orient: ["Rz"] };
    const free = { arm: { Tx: 75, Ty: -55, Tz: 75, Rx: 18, Ry: -12, Rz: 70 }, pin: { Tx: -60, Ty: 45, Tz: 55, Rx: -20, Ry: 15, Rz: 0 } };
    const S = { arm: new Set(), pin: new Set(), off: 4, armMode: null, orientA: 30 };
    const cur = { arm: { ...free.arm }, pin: { ...free.pin } };
    const cam = { yaw: -0.55, pitch: 0.38 };
    const canvas = canvasIn(box, "Assembly");
    const btns = HG.el("div", { class: "cad-asm-btns" });
    box.append(btns);
    const defs = [
      ["arm", "centre", "Arm: centre axis (arm hole ↔ base hole)"],
      ["arm", "mate", "Arm: mate (arm underside ↔ base top)"],
      ["arm", "offset", "Arm: offset (underside ↔ base top, distance)"],
      ["arm", "orient", "Arm: orientate (30° to the base edge)"],
      ["pin", "centre", "Pin: centre axis (pin ↔ hole)"],
      ["pin", "mate", "Pin: mate (head underside ↔ arm top)"],
    ];
    const bEls = [];
    const has = (part, c) => (part === "arm" && (c === "mate" || c === "offset") ? S.armMode === c : S[part].has(c));
    defs.forEach(([part, c, lab]) => {
      const b = HG.el("button", { type: "button", class: "seg-btn", "aria-pressed": "false" }, lab);
      b.addEventListener("click", () => {
        if (part === "arm" && (c === "mate" || c === "offset")) S.armMode = S.armMode === c ? null : c;
        else if (S[part].has(c)) S[part].delete(c); else S[part].add(c);
        sync(); kick();
      });
      bEls.push([b, part, c]); btns.append(b);
    });
    const sl = controls(box);
    const offS = HG.slider(sl, { label: "Offset distance (arm above base)", min: -6, max: 12, step: 1, value: S.off, unit: "mm", oninput: (v) => { S.off = v; sync(); kick(); } });
    HG.slider(sl, { label: "Orientate angle", min: 0, max: 90, step: 5, value: S.orientA, unit: "°", oninput: (v) => { S.orientA = v; const ob = bEls.find(([, p2, c2]) => p2 === "arm" && c2 === "orient"); if (ob) ob[0].textContent = `Arm: orientate (${v}° to the base edge)`; sync(); kick(); } });
    const ro = readouts(box, [["base", "Base"], ["arm", "Arm: degrees of freedom"], ["pin", "Pin: degrees of freedom"], ["fit", "Arm to base"]]);
    const msg = note(box);
    const br = HG.el("div", { class: "btn-row" });
    const reset = HG.el("button", { class: "btn small", type: "button" }, "↺ Take it apart");
    const auto = HG.el("button", { class: "btn small primary", type: "button" }, "▶ Assemble it for me");
    br.append(auto, reset); box.append(br);
    function removed(part) {
      const set = new Set();
      S[part].forEach((c) => RM[c].forEach((d) => set.add(d)));
      if (part === "arm" && S.armMode) RM[S.armMode].forEach((d) => set.add(d));
      return set;
    }
    function target(part) {
      const rm = removed(part), t = {};
      const armZ = S.armMode === "offset" ? 30 + S.off : 30;
      const goal = part === "arm" ? { Tx: 0, Ty: 0, Tz: armZ, Rx: 0, Ry: 0, Rz: S.orientA } : { Tx: 0, Ty: 0, Tz: 0, Rx: 0, Ry: 0, Rz: 0 };
      if (part === "pin") goal.Tz = cur.arm.Tz + 10 - 40; // the head's underside (z = 40 on the pin) sits on the arm's top face
      DOF.forEach((d) => { t[d] = rm.has(d) ? goal[d] : free[part][d]; });
      return t;
    }
    function sync() {
      // the pin's centre axis is the arm's hole: it cannot be used until the arm's hole is on the base's axis
      if (!S.arm.has("centre")) S.pin.delete("centre");
      bEls.forEach(([b, part, c]) => { if (part === "pin" && c === "centre") { b.disabled = !S.arm.has("centre"); b.title = b.disabled ? "Centre-axis the arm first: the pin goes through both holes" : ""; } });
      bEls.forEach(([b, part, c]) => b.setAttribute("aria-pressed", has(part, c) ? "true" : "false"));
      const a = 6 - removed("arm").size, p = 6 - removed("pin").size;
      ro.base.textContent = "Grounded (0 DOF)";
      ro.arm.textContent = `${a} of 6` + (a ? ": " + DOF.filter((d) => !removed("arm").has(d)).map(nice).join(", ") : "");
      ro.pin.textContent = `${p} of 6` + (p ? ": " + DOF.filter((d) => !removed("pin").has(d)).map(nice).join(", ") : "");
      const armFixed = removed("arm").has("Tz") && removed("arm").has("Tx");
      const gap = S.armMode === "offset" ? S.off : S.armMode === "mate" ? 0 : null;
      ro.fit.textContent = !armFixed || gap === null ? "—" : gap < 0 ? `Interference: ${-gap} mm overlap` : gap === 0 ? "Touching (mate)" : `Clearance: ${gap} mm`;
      const last = [...S.arm].concat(S.armMode ? [S.armMode] : []);
      msg.innerHTML = explain(a, p, gap);
      canvas.setAttribute("aria-label", `Assembly. Arm has ${a} degrees of freedom, pin has ${p}. ${ro.fit.textContent}`);
      void last;
    }
    const nice = (d) => ({ Tx: "slide x", Ty: "slide y", Tz: "slide up/down", Rx: "tilt about x", Ry: "tilt about y", Rz: "turn about the axis" }[d]);
    function explain(a, p, gap) {
      if (a === 6 && p === 6) return "Every free component has <b>six degrees of freedom</b>: it can slide along x, y and z and rotate about each. The base is grounded (fixed) as the first component. Apply constraints to take freedoms away.";
      let s = "";
      if (S.arm.has("centre") && !S.armMode) s += "Centre axis has lined the arm's hole up with the base's hole: it removes 4 freedoms. The arm can still slide up and down the axis and turn about it. ";
      if (S.armMode && !S.arm.has("centre")) s += `A ${S.armMode} on its own removes 3 freedoms (one slide, two tilts): the arm can still slide about on the face and turn. `;
      if (S.arm.has("centre") && S.armMode) s += `Centre axis + ${S.armMode}: the ${S.armMode} only adds one new restriction here (up/down), because the two tilts were already gone. `;
      if (gap !== null && gap < 0) s += `<b>An offset of ${gap} mm drives the arm into the base: interference.</b> Two solids cannot occupy the same space; an interference check would flag it. `;
      if (gap > 0) s += `An offset of ${gap} mm leaves a clearance gap between the faces (a mate is an offset of 0). `;
      if (S.arm.has("orient")) s += `Orientate fixes the angle (${S.orientA}°) between the arm and an edge of the base. `;
      if (a === 0) s += "<b>The arm is fully constrained.</b> ";
      if (p === 1) s += "The pin can still spin about its own axis (watch the mark on its head): harmless for a round pin, so it is often left free. ";
      return s;
    }
    let anim = 0;
    function kick() { anim = 1; if (!sim.playing) sim.play(); }
    function poseMesh(m, pose, pivot) {
      let f = E3.rotate(m, [0, 0, 0], [0, 0, 1], pose.Rz * D2R);
      f = E3.rotate(f, [0, 0, 0], [1, 0, 0], pose.Rx * D2R);
      f = E3.rotate(f, [0, 0, 0], [0, 1, 0], pose.Ry * D2R);
      return E3.translate(f, [pose.Tx, pose.Ty, pose.Tz + (pivot || 0)]);
    }
    let wob = 0;
    const sim = HG.sim(canvas, {
      w: 640, h: 380, height: (w) => Math.round(Math.min(400, Math.max(290, w * 0.62))),
      draw(ctx, time, dt, C, s) {
        // ease each part towards its target pose; free freedoms wobble to show they are still free
        wob += dt;
        let moving = false;
        for (const part of ["arm", "pin"]) {
          const tg = target(part), rm = removed(part);
          DOF.forEach((d) => {
            let want = tg[d];
            if (!rm.has(d) && !HG.reduced) want += Math.sin(wob * 1.6 + DOF.indexOf(d) + (part === "pin" ? 2 : 0)) * (d[0] === "T" ? 8 : 10);
            const k = Math.min(1, dt * 5);
            const nv = cur[part][d] + (want - cur[part][d]) * k;
            if (Math.abs(nv - cur[part][d]) > 0.01) moving = true;
            cur[part][d] = nv;
          });
        }
        if (!moving && dt > 0 && removed("arm").size === 6 && removed("pin").size >= 5 && anim) { anim = 0; }
        const armM = poseMesh(arm0, cur.arm);
        const pinM = poseMesh(pin0, cur.pin);
        const gap = S.armMode === "offset" ? S.off : 0;
        const interf = S.armMode === "offset" && gap < 0 && removed("arm").has("Tx");
        if (interf) armM.forEach((f) => { f.mat = "red"; });
        const all = base.concat(armM, pinM);
        all._adj = false;
        const V = fitView(cam, s.w, s.h, 82, [10, 0, 35], 0.55);
        E3.adjacency(all);
        paint(ctx, E3.prepare(all, V, { bias: (f) => (f.mat === "muted" ? 15 : 0) }), C, { lw: 1.1 });
        // the shared axis
        line3(ctx, V, [[0, 0, -12], [0, 0, 100]], C.lode, 1.3, CHAIN);
        // a mark on the pin head shows its spin
        const hz = cur.pin.Tz + 46.2, a = cur.pin.Rz * D2R;
        if (removed("pin").has("Rx")) line3(ctx, V, [[cur.pin.Tx, cur.pin.Ty, hz], [cur.pin.Tx + 11 * Math.cos(a), cur.pin.Ty + 11 * Math.sin(a), hz]], C.red, 2.5);
      },
    });
    reset.addEventListener("click", () => { S.arm.clear(); S.pin.clear(); S.armMode = null; sync(); kick(); });
    auto.addEventListener("click", async () => {
      S.arm.clear(); S.pin.clear(); S.armMode = null; sync(); kick();
      const steps = [() => S.arm.add("centre"), () => (S.armMode = "mate"), () => S.arm.add("orient"), () => S.pin.add("centre"), () => S.pin.add("mate")];
      for (const st of steps) { await HG.sleep(1300); st(); sync(); kick(); }
    });
    orbit(canvas, cam, () => sim.redraw());
    sync();
    if (!HG.reduced) sim.play(); else { for (const part of ["arm", "pin"]) Object.assign(cur[part], target(part)); sim.redraw(); }
    // under reduced motion, snap rather than ease
    if (HG.reduced) { const orig = kick; kick = function () { for (const part of ["arm", "pin"]) Object.assign(cur[part], target(part)); sim.redraw(); }; void orig; }
    void offS;
  });

  /* =====================================================================
     9. The render lab: a tiny ray tracer (light source, materials, shadows, reflections)
     ===================================================================== */
  mount("w-render", (box) => {
    const S = { az: 220, el: 45, mat: "gloss", shadows: true, lift: 0, env: true, quality: "high", decal: true, labels: false };
    const canvas = canvasIn(box, "Render lab");
    const ctl = HG.el("div"); box.append(ctl);
    HG.choice(ctl, "Material", [["matte", "Matte"], ["gloss", "Gloss"], ["metal", "Metal"]], S.mat, (v) => { S.mat = v; go(); });
    HG.choice(ctl, "Render quality", [["draft", "Draft"], ["medium", "Medium"], ["high", "High"]], S.quality, (v) => { S.quality = v; go(); });
    const tg = HG.el("div", { class: "seg" });
    const tog = (k, lab) => { const b = HG.el("button", { type: "button", class: "seg-btn", "aria-pressed": S[k] ? "true" : "false" }, lab); b.addEventListener("click", () => { S[k] = !S[k]; b.setAttribute("aria-pressed", S[k] ? "true" : "false"); k === "labels" ? sim.redraw() : go(); }); tg.append(b); };
    tog("shadows", "Shadows"); tog("env", "Sited environment"); tog("decal", "Decal on the crate"); tog("labels", "Label the render");
    ctl.append(tg);
    const sl = controls(box);
    HG.slider(sl, { label: "Light direction (round)", min: 0, max: 355, step: 5, value: S.az, unit: "°", oninput: (v) => { S.az = v; go(true); } });
    HG.slider(sl, { label: "Light height", min: 10, max: 85, step: 5, value: S.el, unit: "°", oninput: (v) => { S.el = v; go(true); } });
    HG.slider(sl, { label: "Lift the models off the deck", min: 0, max: 20, step: 1, value: S.lift, unit: "mm", oninput: (v) => { S.lift = v; go(true); } });
    const msg = note(box);
    // scene (mm): deck z = 0; a cannonball, a crate and a capstan drum
    const RW = { draft: 96, medium: 200, high: 360 };
    const off = document.createElement("canvas");
    let img = null, job = 0, info = {};
    function scene() {
      const L = S.lift;
      return {
        sph: { c: [-42, 4, 22 + L], r: 22 },
        box: { a: [0, -20, L], b: [40, 20, 40 + L] },
        cyl: { c: [70, 40, L], r: 14, h: 30 },
      };
    }
    const sub = E3.sub, dot = E3.dot, add = E3.add, mul = E3.mul, norm = E3.norm;
    function hitScene(o, d, sc, tmax = 1e9) {
      let best = { t: tmax, n: null, id: null };
      // sphere
      { const oc = sub(o, sc.sph.c), b = dot(oc, d), c = dot(oc, oc) - sc.sph.r ** 2, h = b * b - c; if (h > 0) { const t = -b - Math.sqrt(h); if (t > 1e-3 && t < best.t) best = { t, n: norm(sub(add(o, mul(d, t)), sc.sph.c)), id: "sph" }; } }
      // box (slabs)
      { let t0 = -1e9, t1 = 1e9, nn = null; for (let k = 0; k < 3; k++) { const inv = 1 / d[k]; let ta = (sc.box.a[k] - o[k]) * inv, tb = (sc.box.b[k] - o[k]) * inv; let s = -1; if (ta > tb) { [ta, tb] = [tb, ta]; s = 1; } if (ta > t0) { t0 = ta; nn = [0, 0, 0]; nn[k] = s; } if (tb < t1) t1 = tb; } if (t0 < t1 && t0 > 1e-3 && t0 < best.t) best = { t: t0, n: nn, id: "box" }; }
      // vertical cylinder with a top cap
      { const cc = sc.cyl, ox = o[0] - cc.c[0], oy = o[1] - cc.c[1], A = d[0] * d[0] + d[1] * d[1], B = ox * d[0] + oy * d[1], Cq = ox * ox + oy * oy - cc.r * cc.r, h = B * B - A * Cq;
        if (h > 0 && A > 1e-9) { const t = (-B - Math.sqrt(h)) / A, z = o[2] + d[2] * t; if (t > 1e-3 && t < best.t && z >= cc.c[2] && z <= cc.c[2] + cc.h) best = { t, n: norm([ox + d[0] * t, oy + d[1] * t, 0]), id: "cyl" }; }
        if (Math.abs(d[2]) > 1e-9) { const t = (cc.c[2] + cc.h - o[2]) / d[2]; if (t > 1e-3 && t < best.t) { const x = o[0] + d[0] * t - cc.c[0], y = o[1] + d[1] * t - cc.c[1]; if (x * x + y * y <= cc.r * cc.r) best = { t, n: [0, 0, 1], id: "cyl" }; } } }
      // deck
      if (d[2] < -1e-9) { const t = -o[2] / d[2]; if (t > 1e-3 && t < best.t) { const p = add(o, mul(d, t)); if (Math.abs(p[0]) < 140 && Math.abs(p[1]) < 140) best = { t, n: [0, 0, 1], id: "deck" }; } }
      return best;
    }
    const cam = { eye: [190, -230, 150], look: [8, 10, 12] };
    function render(q, done, quick) {
      const my = ++job;
      const W = quick ? Math.min(RW[q], 150) : RW[q], H = Math.round(W * 0.6);
      off.width = W; off.height = H;
      const octx = off.getContext("2d");
      const data = octx.createImageData(W, H);
      const sc = scene();
      const fwd = norm(sub(cam.look, cam.eye)), rt = norm(E3.cross(fwd, [0, 0, 1])), up = E3.cross(rt, fwd);
      const fov = 0.62, Ld = norm([Math.cos(S.az * D2R) * Math.cos(S.el * D2R), Math.sin(S.az * D2R) * Math.cos(S.el * D2R), Math.sin(S.el * D2R)]);
      const lr = Math.max(...Object.values(sc).map(() => 0)) + 0.06; // light's angular size (soft shadows)
      const spp = q === "high" && !quick ? 4 : 1, shs = q === "draft" ? 3 : q === "medium" ? 6 : quick ? 2 : 10;
      const lt = norm(E3.cross(Ld, [0, 0, 1])), lu = E3.cross(lt, Ld);
      const rnd = (() => { let s = 12345; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
      const C = HG.colors();
      const deckA = E3.hexRGB("#b98a57"), deckB = E3.hexRGB("#a77845");
      const cols = { sph: [40, 42, 48], box: [176, 128, 72], cyl: [29, 106, 128] };
      const matOf = (id) => (id === "deck" ? { kd: 0.85, ks: 0.08, sh: 12, refl: S.env ? 0.06 : 0 } : S.mat === "matte" ? { kd: 0.95, ks: 0.0, sh: 1, refl: 0 } : S.mat === "gloss" ? { kd: 0.75, ks: 0.55, sh: 60, refl: 0.12 } : { kd: 0.25, ks: 0.9, sh: 140, refl: 0.6 });
      function sky(d) {
        if (!S.env) return [236, 232, 222];
        const t = Math.max(0, d[2]);
        return [150 + 80 * (1 - t), 180 + 50 * (1 - t), 215 + 25 * (1 - t)];
      }
      function shadow(p, n) {
        if (!S.shadows) return 1;
        let lit = 0;
        for (let s = 0; s < shs; s++) {
          let dir = Ld;
          if (shs > 1) { const a = rnd() * 2 * Math.PI, r = Math.sqrt(rnd()) * lr; dir = norm(add(Ld, add(mul(lt, Math.cos(a) * r), mul(lu, Math.sin(a) * r)))); }
          const h = hitScene(add(p, mul(n, 0.05)), dir, sc);
          if (!h.id || h.id === "deck") lit++;
        }
        return lit / shs;
      }
      function shade(o, d, depth) {
        const h = hitScene(o, d, sc);
        if (!h.id) return sky(d);
        const p = add(o, mul(d, h.t)), n = h.n, m = matOf(h.id);
        let base;
        if (h.id === "deck") { const plank = Math.floor((p[0] + 200) / 18) % 2; base = plank ? deckA : deckB; if (!S.env) base = [205, 200, 190]; }
        else base = S.mat === "metal" ? (h.id === "sph" ? [180, 182, 190] : h.id === "box" ? [212, 168, 90] : [170, 190, 200]) : cols[h.id];
        if (h.id === "box" && S.decal && n[1] < -0.5) {
          // a decal on the front face: the squadron's pennant (a magenta triangle on a white field)
          const u = (p[0] - sc.box.a[0]) / (sc.box.b[0] - sc.box.a[0]), v = (p[2] - sc.box.a[2]) / (sc.box.b[2] - sc.box.a[2]);
          if (u > 0.15 && u < 0.85 && v > 0.2 && v < 0.8) { base = [244, 238, 226]; const uu = (u - 0.15) / 0.7, vv = (v - 0.2) / 0.6; if (uu < 0.9 * (1 - Math.abs(vv - 0.5) * 2)) base = [212, 20, 122]; }
        }
        const sh = shadow(p, n);
        const diff = Math.max(0, dot(n, Ld)) * sh;
        const hv = norm(sub(Ld, d)), spec = Math.pow(Math.max(0, dot(n, hv)), m.sh) * m.ks * sh;
        const amb = S.env ? 0.28 : 0.22;
        let c = base.map((v) => v * (amb + m.kd * diff) + 255 * spec);
        if (m.refl > 0 && depth < 2) {
          const r = sub(d, mul(n, 2 * dot(d, n)));
          const rc = shade(add(p, mul(n, 0.05)), norm(r), depth + 1);
          c = c.map((v, i) => v * (1 - m.refl) + rc[i] * m.refl * (S.mat === "metal" && h.id !== "deck" ? base[i] / 255 + 0.3 : 1));
        }
        return c;
      }
      let y = 0;
      const rowsPer = quick ? H : q === "high" ? 18 : 60;
      const step = () => {
        if (my !== job) return;
        const yEnd = Math.min(H, y + rowsPer);
        for (; y < yEnd; y++) for (let x = 0; x < W; x++) {
          let acc = [0, 0, 0];
          for (let s = 0; s < spp; s++) {
            const jx = spp > 1 ? (s % 2) * 0.5 + 0.25 : 0.5, jy = spp > 1 ? Math.floor(s / 2) * 0.5 + 0.25 : 0.5;
            const u = ((x + jx) / W * 2 - 1) * fov, v = (1 - (y + jy) / H * 2) * fov * H / W;
            const d = norm(add(fwd, add(mul(rt, u), mul(up, v))));
            const c = shade(cam.eye, d, 0);
            acc = acc.map((a, i) => a + c[i]);
          }
          const k = (y * W + x) * 4;
          data.data[k] = Math.min(255, acc[0] / spp); data.data[k + 1] = Math.min(255, acc[1] / spp); data.data[k + 2] = Math.min(255, acc[2] / spp); data.data[k + 3] = 255;
        }
        octx.putImageData(data, 0, 0);
        img = { W, H, q };
        sim.redraw();
        if (y < H) requestAnimationFrame(step); else if (done) done();
      };
      // label anchors computed from the same geometry
      const toScreen = (p) => { const v = sub(p, cam.eye), z = dot(v, fwd); return [(dot(v, rt) / z / fov + 1) / 2, (1 - dot(v, up) / z / (fov * H / W)) / 2]; };
      const sp = sc.sph, hl = norm(add(Ld, norm(sub(cam.eye, sp.c))));
      // shade: the limb of the sphere on the side away from the light, as the camera sees it
      const vc = norm(sub(cam.eye, sp.c)), nl = mul(Ld, -1), limb = norm(sub(nl, mul(vc, dot(nl, vc))));
      // cast shadow: the first candidate ground point that is in shadow and that the camera can actually see
      const cands = [];
      if (Ld[2] > 0) [sp.c, [sc.box.a[0], sc.box.a[1], sc.box.b[2]], [sc.box.b[0], sc.box.a[1], sc.box.b[2]], [sc.box.a[0], sc.box.b[1], sc.box.b[2]], [sc.box.b[0], sc.box.b[1], sc.box.b[2]], [sc.cyl.c[0], sc.cyl.c[1], sc.cyl.c[2] + sc.cyl.h]].forEach((q) => { const t = q[2] / Ld[2]; const g = [q[0] - Ld[0] * t * 0.85, q[1] - Ld[1] * t * 0.85, 0]; cands.push(g); });
      const shadowPt = cands.find((g) => { const dv = sub(g, cam.eye), L = E3.len(dv), h = hitScene(cam.eye, norm(dv), sc); if (!h.id || h.id !== "deck" || Math.abs(h.t - L) > 1) return false; return hitScene(add(g, [0, 0, 0.05]), Ld, sc).id && hitScene(add(g, [0, 0, 0.05]), Ld, sc).id !== "deck"; }) || null;
      const shadowC = Ld[2] > 0 ? (() => { const t = sp.c[2] / Ld[2]; return [sp.c[0] - Ld[0] * t, sp.c[1] - Ld[1] * t, 0]; })() : null;
      info = {
        light: toScreen(add(cam.look, mul(Ld, 90))),
        highlight: toScreen(add(sp.c, mul(hl, sp.r))),
        shade: toScreen(add(sp.c, mul(limb, sp.r * 0.8))),
        shadow: shadowPt ? toScreen(shadowPt) : null,
        refl: toScreen(add(sp.c, mul(norm(add(vc, [0, 0, -0.9])), sp.r * 0.97))),
      };
      step();
    }
    let qt = 0;
    function go(quick) {
      clearTimeout(qt);
      if (quick) { render(S.quality, null, true); qt = setTimeout(() => render(S.quality), 280); } else render(S.quality);
      const qtxt = { draft: "Draft: low resolution, so you can see the pixels (pixelation), and only three samples of the light per point, so the soft shadow edges come out speckled (grain).", medium: "Medium: twice the resolution and six light samples: sharper, but a little grain is still visible in the soft shadow edges.", high: "High: full resolution, smoothed edges (4 samples per pixel) and ten shadow samples, so there is no pixelation or grain. It takes longest." }[S.quality];
      const mt = { matte: "Matte: light scatters evenly; no highlight and no reflection.", gloss: "Gloss: a bright, sharp highlight and a faint reflection of the scene.", metal: "Metal: strong reflections of its surroundings, tinted by the metal's colour, and a tight highlight." }[S.mat];
      msg.textContent = `${mt} ${qtxt}` + (S.lift > 0 ? ` The models are ${S.lift} mm above the deck: their shadows have pulled away from them, which tells the viewer at once that they are floating.` : "") + (!S.shadows ? " Without shadows, nothing seems to sit on the deck." : "");
      canvas.setAttribute("aria-label", `Rendered scene: a cannonball, a crate and a capstan drum on a deck. Light from ${S.az}° round and ${S.el}° high. ${msg.textContent}`);
    }
    const sim = HG.sim(canvas, {
      w: 640, h: 384, height: (w) => Math.round(w * 0.6),
      draw(ctx, time, dt, C, s) {
        if (!img) return;
        ctx.imageSmoothingEnabled = img.q !== "draft";
        ctx.drawImage(off, 0, 0, img.W, img.H, 0, 0, s.w, s.h);
        if (S.labels && info.light) {
          const P = (p) => [p[0] * s.w, p[1] * s.h];
          const lab = (p, t, dx, dy) => { if (!p) return; const q = P(p); HG.dot(ctx, q[0], q[1], "#d4147a", 4); ctx.save(); ctx.strokeStyle = "#d4147a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + dx, q[1] + dy); ctx.stroke(); ctx.restore(); HG.label(ctx, t, q[0] + dx + (dx < 0 ? -3 : 3), q[1] + dy, { size: 13, bold: true, col: "#1d1a14", haloCol: "#fffaf0", align: dx < 0 ? "right" : "left" }); };
          const li = P(info.light); const lx = Math.max(20, Math.min(s.w - 20, li[0])), ly = Math.max(16, Math.min(s.h - 16, li[1]));
          HG.label(ctx, "☀ light source", lx, ly, { size: 13, bold: true, col: "#1d1a14", haloCol: "#fffaf0", align: "center" });
          lab(info.highlight, "highlight", -40, -24);
          lab(info.shade, "shade", 26, -46);
          if (S.shadows) lab(info.shadow, "cast shadow", -30, 34);
          if (S.mat !== "matte") lab(info.refl, "reflection", -50, 34);
        }
      },
    });
    go();
  });

  /* =====================================================================
     10. The answer builder: put the modelling steps in a workable order
     ===================================================================== */
  mount("w-plan", (box) => {
    const tasks = {
      vent: {
        title: "Speaking tube: sweep, flare, shell and holes",
        steps: [
          { id: "path", t: "On the XZ plane, sketch the path: a vertical line 120, a tangent arc R40 and a horizontal line 90, all dimensioned.", after: [] },
          { id: "wp", t: "Create a work plane perpendicular to the path at its lower end.", after: ["path"] },
          { id: "prof", t: "On that work plane, sketch a Ø30 circle centred on the end of the path.", after: ["wp"] },
          { id: "sweep", t: "Extrude along the path (sweep) the Ø30 profile along the whole path.", after: ["prof"] },
          { id: "flare", t: "On the end face, sketch a Ø50 circle and loft from it to a Ø80 circle on a work plane offset 40.", after: ["sweep"] },
          { id: "shell", t: "Shell the part, wall thickness 2, removing both end faces.", after: ["flare"] },
          { id: "hole", t: "On the work plane at the end of the mouth, sketch one Ø4 circle on a PCD of 65.", after: ["shell"] },
          { id: "array", t: "Radial array the Ø4 circle 6 times round 360° (60° apart) about the axis of the mouth.", after: ["hole"] },
          { id: "cut", t: "Extrude subtract the six circles by 30, back through the flared wall.", after: ["array"] },
        ],
        decoys: [
          { id: "x1", t: "Make the tube shape and bend it.", why: "Too vague to earn a mark: name the command (extrude along a path) and give the sizes." },
          { id: "x2", t: "Apply a brass material and render it.", why: "Nothing to do with how the model is built: no modelling mark." },
        ],
      },
      spring: {
        title: "Lantern hook spring: helix",
        steps: [
          { id: "ax", t: "On the XZ plane, draw a vertical axis (centre line) through the origin.", after: [] },
          { id: "pr", t: "On the same plane, sketch a Ø4 circle with its centre 18 from the axis.", after: ["ax"] },
          { id: "hx", t: "Use the helix (coil) command: profile = the Ø4 circle, axis = the centre line.", after: ["pr"] },
          { id: "pp", t: "Set pitch 12 and number of revolutions 9 (overall length 108).", after: ["hx"] },
          { id: "end", t: "On a work plane perpendicular to the axis at the top end of the coil, sketch a Ø4 circle centred on the end of the wire and extrude it 20 upwards to form the hook's leg.", after: ["pp"] },
        ],
        decoys: [
          { id: "y1", t: "Set the helix to 12 rotations of pitch.", why: "Mixes up the terms: pitch is a distance (12 mm); revolutions is a count (9). The report says many candidates misused exactly these words." },
          { id: "y2", t: "Draw a spring shape and extrude it.", why: "No profile, no axis, no command name, no sizes: no marks." },
        ],
      },
    };
    let key = "vent", order = [], out = new Set();
    const ctl = HG.el("div"); box.append(ctl);
    HG.choice(ctl, "Model", Object.entries(tasks).map(([k, t]) => [k, t.title]), key, (v) => { key = v; shuffle(); });
    const listEl = HG.el("ol", { class: "cad-plan" }); box.append(listEl);
    const br = HG.el("div", { class: "btn-row" });
    const check = HG.el("button", { class: "btn small primary", type: "button" }, "✔ Check my plan");
    const again = HG.el("button", { class: "btn small", type: "button" }, "↺ Shuffle again");
    const show = HG.el("button", { class: "btn small", type: "button" }, "Show a model answer");
    br.append(check, again, show); box.append(br);
    const res = HG.el("div", { class: "sim-note", "aria-live": "polite" }); box.append(res);
    function shuffle() {
      const t = tasks[key];
      order = t.steps.concat(t.decoys).map((s) => s.id);
      let seed = key === "vent" ? 7 : 3;
      for (let i = order.length - 1; i > 0; i--) { seed = (seed * 9301 + 49297) % 233280; const j = Math.floor(seed / 233280 * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      out = new Set(); res.innerHTML = "Order the steps with the arrows. Leave out any step that would not earn a mark."; draw();
    }
    const byId = (id) => { const t = tasks[key]; return t.steps.find((s) => s.id === id) || t.decoys.find((s) => s.id === id); };
    function draw(marks) {
      listEl.innerHTML = "";
      order.forEach((id, i) => {
        const s = byId(id), li = HG.el("li", { class: "cad-plan-item" + (out.has(id) ? " is-out" : "") + (marks && marks[id] ? " " + marks[id].cls : "") });
        const up = HG.el("button", { type: "button", class: "btn small", "aria-label": "Move up: " + s.t, disabled: i === 0 ? true : null }, "▲");
        const dn = HG.el("button", { type: "button", class: "btn small", "aria-label": "Move down: " + s.t, disabled: i === order.length - 1 ? true : null }, "▼");
        const x = HG.el("button", { type: "button", class: "btn small", "aria-pressed": out.has(id) ? "true" : "false", "aria-label": (out.has(id) ? "Put back: " : "Leave out: ") + s.t }, out.has(id) ? "↩ Put back" : "✕ Leave out");
        up.addEventListener("click", () => { if (i < 1 || !up.isConnected) return; [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); listEl.children[i - 1].querySelector("button").focus(); });
        dn.addEventListener("click", () => { if (i >= order.length - 1 || !dn.isConnected) return; [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); listEl.children[i + 1].querySelectorAll("button")[1].focus(); });
        x.addEventListener("click", () => { if (!x.isConnected) return; out.has(id) ? out.delete(id) : out.add(id); draw(); });
        li.append(HG.el("span", { class: "cad-plan-text" }, s.t), HG.el("span", { class: "cad-plan-btns" }, up, dn, x));
        if (marks && marks[id] && marks[id].why) li.append(HG.el("span", { class: "cad-plan-why" }, marks[id].why));
        listEl.append(li);
      });
    }
    check.addEventListener("click", () => {
      const t = tasks[key], marks = {}, kept = order.filter((id) => !out.has(id));
      let ok = 0;
      t.steps.forEach((s) => {
        if (out.has(s.id)) { marks[s.id] = { cls: "bad", why: "This step is needed: put it back." }; return; }
        const pos = kept.indexOf(s.id), late = s.after.filter((a) => out.has(a) || kept.indexOf(a) > pos);
        if (late.length) marks[s.id] = { cls: "bad", why: "Too early: it needs “" + byId(late[0]).t.split(/[,:.]/)[0] + "” to come first." };
        else { marks[s.id] = { cls: "good" }; ok++; }
      });
      let dec = 0;
      t.decoys.forEach((s) => { if (out.has(s.id)) { marks[s.id] = { cls: "good", why: "Rightly left out. " + s.why }; dec++; } else marks[s.id] = { cls: "bad", why: s.why }; });
      draw(marks);
      res.innerHTML = `<b>${ok} of ${t.steps.length}</b> modelling steps are in a workable place, and ${dec} of ${t.decoys.length} weak steps left out.` + (ok === t.steps.length && dec === t.decoys.length ? " <span class='ok'>A clear, complete modelling plan: each step names the command, the plane or face, and the sizes.</span>" : " Each step must come after everything it is built on: a profile needs its plane, a feature needs its profile, an edit needs a solid.");
    });
    again.addEventListener("click", shuffle);
    show.addEventListener("click", () => { const t = tasks[key]; order = t.steps.map((s) => s.id).concat(t.decoys.map((s) => s.id)); out = new Set(t.decoys.map((s) => s.id)); check.click(); });
    shuffle();
  });
})();
