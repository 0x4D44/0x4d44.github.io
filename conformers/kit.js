/* Conformers — shared toolkit.
   A tiny ball-and-stick renderer on <canvas>, molecule builders, the energy
   models the chapters plot, and a few SVG/quiz helpers. Plain browser JS,
   exposed as window.CK. */
(function () {
  "use strict";
  const DEG = Math.PI / 180;

  // ---------- vectors ----------
  const v = {
    add: (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]],
    sub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
    mul: (a, s) => [a[0] * s, a[1] * s, a[2] * s],
    dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
    cross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
    len: (a) => Math.hypot(a[0], a[1], a[2]),
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },
    lerp: (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t],
  };
  // angle a-b-c in degrees
  function angle(a, b, c) {
    const u = v.norm(v.sub(a, b)), w = v.norm(v.sub(c, b));
    return Math.acos(Math.max(-1, Math.min(1, v.dot(u, w)))) / DEG;
  }
  // dihedral a-b-c-d in degrees, (-180, 180]
  function dihedral(a, b, c, d) {
    const b0 = v.sub(a, b), b1 = v.norm(v.sub(c, b)), b2 = v.sub(d, c);
    const p = v.sub(b0, v.mul(b1, v.dot(b0, b1)));
    const q = v.sub(b2, v.mul(b1, v.dot(b2, b1)));
    const x = v.dot(p, q), y = v.dot(v.cross(b1, p), q);
    return Math.atan2(y, x) / DEG;
  }
  // any unit vector perpendicular to a
  function perp(a) {
    const t = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    return v.norm(v.cross(a, t));
  }

  // ---------- quaternions ----------
  const q = {
    axis: (ax, ang) => { const s = Math.sin(ang / 2), n = v.norm(ax); return [Math.cos(ang / 2), n[0] * s, n[1] * s, n[2] * s]; },
    mul: (a, b) => [
      a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
      a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
      a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
      a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
    ],
    norm: (a) => { const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1; return a.map((x) => x / l); },
    slerp(a, b, t) {
      let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
      if (d < 0) { b = b.map((x) => -x); d = -d; }
      if (d > 0.9995) return q.norm(a.map((x, i) => x + (b[i] - x) * t));
      const th = Math.acos(d), s = Math.sin(th);
      const wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
      return a.map((x, i) => x * wa + b[i] * wb);
    },
    mat(a) {
      const [w, x, y, z] = a;
      return [
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
      ];
    },
    // compose from intrinsic yaw (about y) then pitch (about x), in degrees
    view(yawDeg, pitchDeg, rollDeg = 0) {
      let r = q.axis([0, 1, 0], yawDeg * DEG);
      r = q.mul(q.axis([1, 0, 0], pitchDeg * DEG), r);
      if (rollDeg) r = q.mul(q.axis([0, 0, 1], rollDeg * DEG), r);
      return r;
    },
  };

  const ease = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- element styles ----------
  const ELEMENTS = {
    C: { r: 0.36, fill: "#5d6596", hi: "#8b93c7" },
    H: { r: 0.24, fill: "#e9ebf7", hi: "#ffffff" },
    Me: { r: 0.40, fill: "#e8a93a", hi: "#ffd27a" }, // a methyl carbon, gold
    X: { r: 0.44, fill: "#4fc59a", hi: "#8ff0c8" },  // generic substituent
    O: { r: 0.36, fill: "#ef5b5b", hi: "#ff9a9a" },
    Cl: { r: 0.44, fill: "#4fc59a", hi: "#8ff0c8" },
    tBu: { r: 0.62, fill: "#e8a93a", hi: "#ffd27a" },
  };

  // ---------- the viewer ----------
  class Viewer {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.atoms = [];
      this.bonds = [];
      this.orient = opts.orient || q.view(-25, 15);
      this.zoom = opts.zoom || 1;
      this.autoSpin = opts.autoSpin || 0; // radians per second about screen y
      this.spinAxis = opts.spinAxis || [0, 1, 0];
      this.bg = opts.bg || "#12162d";
      this.onDraw = opts.onDraw || null;
      this.onFrame = opts.onFrame || null;
      this.interactive = opts.interactive !== false;
      this.extent = opts.extent || 3.2; // model half-size that should fit
      this._anim = null;
      this._dragging = false;
      this._last = performance.now();
      this.dirty = true;
      this._setupSize();
      if (this.interactive) this._setupDrag();
      this._loop = this._loop.bind(this);
      this._visible = true;
      if ("IntersectionObserver" in window) {
        new IntersectionObserver((es) => { this._visible = es[0].isIntersecting; if (this._visible) this.dirty = true; })
          .observe(canvas);
      }
      requestAnimationFrame(this._loop);
    }
    _setupSize() {
      const fit = () => {
        const r = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
        this.canvas.width = Math.round(this.w * dpr);
        this.canvas.height = Math.round(this.h * dpr);
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.dirty = true;
      };
      fit();
      if ("ResizeObserver" in window) new ResizeObserver(fit).observe(this.canvas);
      else window.addEventListener("resize", fit);
    }
    _setupDrag() {
      const c = this.canvas;
      let lx = 0, ly = 0, id = null;
      c.addEventListener("pointerdown", (e) => {
        id = e.pointerId; lx = e.clientX; ly = e.clientY; this._dragging = true;
        this._anim = null; c.setPointerCapture(id); this.userMoved = true;
      });
      c.addEventListener("pointermove", (e) => {
        if (!this._dragging || e.pointerId !== id) return;
        const dx = e.clientX - lx, dy = e.clientY - ly; lx = e.clientX; ly = e.clientY;
        const k = 0.01;
        this.orient = q.norm(q.mul(q.axis([0, 1, 0], dx * k), this.orient));
        this.orient = q.norm(q.mul(q.axis([1, 0, 0], dy * k), this.orient));
        this.dirty = true;
      });
      const end = () => { this._dragging = false; };
      c.addEventListener("pointerup", end);
      c.addEventListener("pointercancel", end);
    }
    setModel(atoms, bonds) { this.atoms = atoms; this.bonds = bonds; this.dirty = true; }
    turnTo(target, ms = 1200) {
      if (reduceMotion()) { this.orient = target; this.dirty = true; return; }
      this._anim = { from: this.orient, to: target, t0: performance.now(), ms };
    }
    project(p) {
      const m = this._m || q.mat(this.orient);
      const x = m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2];
      const y = m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2];
      const z = m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2];
      const s = (Math.min(this.w, this.h) / (2 * this.extent)) * this.zoom;
      const D = 14;
      const f = D / (D - z);
      return { x: this.w / 2 + x * s * f, y: this.h / 2 - y * s * f, z, f, s: s * f };
    }
    _loop(now) {
      const dt = Math.min(0.05, (now - this._last) / 1000);
      this._last = now;
      if (this.onFrame) { if (this.onFrame(dt, now) !== false) this.dirty = true; }
      if (this._anim) {
        const a = this._anim;
        const t = Math.min(1, (now - a.t0) / a.ms);
        this.orient = q.slerp(a.from, a.to, ease(t));
        if (t >= 1) this._anim = null;
        this.dirty = true;
      } else if (this.autoSpin && !this._dragging && !reduceMotion()) {
        this.orient = q.norm(q.mul(q.axis(this.spinAxis, this.autoSpin * dt), this.orient));
        this.dirty = true;
      }
      if (this.dirty && this._visible) { this.draw(); this.dirty = false; }
      requestAnimationFrame(this._loop);
    }
    draw() {
      const ctx = this.ctx;
      this._m = q.mat(this.orient);
      ctx.clearRect(0, 0, this.w, this.h);
      const P = this.atoms.map((a) => this.project(a.p));
      const items = [];
      this.bonds.forEach((b) => {
        const i = b[0], j = b[1], o = b[2] || {};
        const A = P[i], B = P[j];
        const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2, z: (A.z + B.z) / 2 };
        const ca = o.color || this._atomStyle(this.atoms[i]).fill;
        const cb = o.color || this._atomStyle(this.atoms[j]).fill;
        items.push({ z: (A.z + M.z) / 2 - 0.01, kind: "b", a: A, b: M, c: ca, w: o.width || 0.17, dash: o.dash, alpha: o.alpha });
        items.push({ z: (B.z + M.z) / 2 - 0.01, kind: "b", a: M, b: B, c: cb, w: o.width || 0.17, dash: o.dash, alpha: o.alpha });
      });
      this.atoms.forEach((a, i) => { if (!a.hidden) items.push({ z: P[i].z, kind: "a", p: P[i], a }); });
      items.sort((x, y) => x.z - y.z);
      for (const it of items) {
        if (it.kind === "b") {
          ctx.globalAlpha = it.alpha == null ? 1 : it.alpha;
          ctx.strokeStyle = "#0b0e20";
          ctx.lineCap = "round";
          ctx.setLineDash(it.dash ? [4, 5] : []);
          const wpx = it.w * (it.a.s + it.b.s) / 2;
          ctx.lineWidth = wpx + 3;
          ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
          ctx.strokeStyle = it.c;
          ctx.lineWidth = wpx;
          ctx.beginPath(); ctx.moveTo(it.a.x, it.a.y); ctx.lineTo(it.b.x, it.b.y); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        } else {
          this._drawAtom(it.p, it.a);
        }
      }
      if (this.onDraw) this.onDraw(ctx, this);
    }
    _atomStyle(a) {
      const base = ELEMENTS[a.el] || ELEMENTS.C;
      return { r: a.r || base.r, fill: a.fill || base.fill, hi: a.hi || base.hi };
    }
    _drawAtom(p, a) {
      const ctx = this.ctx, st = this._atomStyle(a);
      const r = st.r * p.s;
      ctx.globalAlpha = a.alpha == null ? 1 : a.alpha;
      if (a.glow) {
        ctx.fillStyle = a.glow;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 1.9, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = "#0b0e20";
      ctx.beginPath(); ctx.arc(p.x, p.y, r + 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = st.fill;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      // flat highlight blob, upper left
      ctx.fillStyle = st.hi;
      ctx.globalAlpha *= 0.55;
      ctx.beginPath(); ctx.arc(p.x - r * 0.32, p.y - r * 0.34, r * 0.42, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      if (a.label) {
        ctx.font = `800 ${Math.max(10, Math.round(r * 0.95))}px Nunito, sans-serif`;
        ctx.fillStyle = a.labelColor || "#0b0e20";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText(a.label, p.x, p.y + 1);
      }
    }
  }

  // ---------- molecule builders ----------
  // Bond lengths are real (Å); the radii above are cartoon sizes.
  const CC = 1.54, CH = 1.09, TET = 109.47;

  // Ethane or butane laid along x: front carbon C1 at -x, back carbon C2 at +x.
  // phi = rotation of the back carbon (degrees), measured clockwise as seen
  // from the front — the Newman-projection convention used on every page.
  // kind "ethane": reference H's on both carbons start eclipsed at phi=0.
  // kind "butane": phi is the CH3-C-C-CH3 dihedral (0 = fully eclipsed).
  function twoCarbon(kind, phi, opt = {}) {
    const atoms = [], bonds = [];
    const c1 = [-CC / 2, 0, 0], c2 = [CC / 2, 0, 0];
    atoms.push({ el: "C", p: c1, role: "front" });
    atoms.push({ el: "C", p: c2, role: "back" });
    bonds.push([0, 1]);
    const ax = Math.cos((180 - TET) * DEG), rad = Math.sin((180 - TET) * DEG);
    // a substituent direction at Newman angle a (deg, clockwise from up)
    const dir = (a, back) => [back ? ax : -ax, rad * Math.cos(a * DEG), rad * Math.sin(a * DEG)];
    const groups = kind === "butane" ? ["Me", "H", "H"] : ["H", "H", "H"];
    const place = (carbon, ci, back, offset) => {
      groups.forEach((g, k) => {
        const a = offset + k * 120;
        const d = dir(a, back);
        if (g === "H") {
          atoms.push({ el: "H", p: v.add(carbon, v.mul(d, CH)), role: back ? "backH" : "frontH", k, newman: a });
          bonds.push([ci, atoms.length - 1]);
        } else {
          const m = v.add(carbon, v.mul(d, CC));
          atoms.push({ el: "Me", p: m, role: back ? "backMe" : "frontMe", newman: a });
          const mi = atoms.length - 1;
          bonds.push([ci, mi]);
          // three hydrogens on the methyl, staggered about the C–CH3 bond
          const w = v.norm(d), e1 = v.norm(v.cross(w, [1, 0, 0])), e2 = v.cross(w, e1);
          for (let h = 0; h < 3; h++) {
            const g2 = (h * 120 + 60) * DEG;
            const hd = v.add(v.mul(w, -Math.cos(TET * DEG)), v.add(v.mul(e1, Math.sin(TET * DEG) * Math.cos(g2)), v.mul(e2, Math.sin(TET * DEG) * Math.sin(g2))));
            atoms.push({ el: "H", p: v.add(m, v.mul(hd, CH)), r: 0.2, role: "meH", alpha: opt.meHAlpha });
            bonds.push([mi, atoms.length - 1]);
          }
        }
      });
    };
    // front methyl straight up (0°); back group rotated by phi
    place(c1, 0, false, 0);
    place(c2, 1, true, phi);
    return { atoms, bonds };
  }

  // Cyclohexane in the "seat" frame: ring atoms 1,2,4,5 form a flat rectangle
  // (the seat); atom 0 (the headrest) and atom 3 (the footrest) hinge about
  // the seat edges, which keeps every C–C bond exactly 1.54 Å as they move.
  // psiHead / psiFoot in degrees: +50.75 = up, -50.75 = down.
  //   chair: (+50.75, -50.75)  boat: (+50.75, +50.75)  flipped chair: (-50.75, +50.75)
  const CHAIR_PSI = Math.acos(Math.cos(111 * DEG) / -(Math.cos(55.5 * DEG))) / DEG; // ≈ 50.75
  function ringSix(psiHead, psiFoot) {
    const b = CC, w = 2 * b * Math.sin(55.5 * DEG), d = b * Math.cos(55.5 * DEG);
    const P = [];
    P[1] = [-b / 2, w / 2, 0];
    P[2] = [b / 2, w / 2, 0];
    P[4] = [b / 2, -w / 2, 0];
    P[5] = [-b / 2, -w / 2, 0];
    P[0] = [-b / 2 - d * Math.cos(psiHead * DEG), 0, d * Math.sin(psiHead * DEG)];
    P[3] = [b / 2 + d * Math.cos(psiFoot * DEG), 0, d * Math.sin(psiFoot * DEG)];
    // centre it
    const c = P.reduce((s, p) => v.add(s, p), [0, 0, 0]).map((x) => x / 6);
    return P.map((p) => v.sub(p, c));
  }

  // Put two hydrogens (or groups) on every ring carbon. Returns, per carbon,
  // { up, down } positions: "up" is on the same face of the ring for every
  // carbon (that identity survives a ring flip), and `axial` says which of
  // the two is currently the axial one.
  function ringSubstituents(ring, len = CH) {
    const n = ring.length;
    const centroid = ring.reduce((s, p) => v.add(s, p), [0, 0, 0]).map((x) => x / n);
    // mean ring normal from the cross products round the ring
    let N = [0, 0, 0];
    for (let i = 0; i < n; i++) N = v.add(N, v.cross(v.sub(ring[i], centroid), v.sub(ring[(i + 1) % n], centroid)));
    N = v.norm(N);
    const out = [];
    const half = (TET / 2) * DEG;
    for (let i = 0; i < n; i++) {
      const C = ring[i], A = ring[(i + n - 1) % n], B = ring[(i + 1) % n];
      const u = v.norm(v.add(v.sub(C, A), v.sub(C, B)));
      let nn = v.norm(v.cross(v.sub(A, C), v.sub(B, C)));
      if (v.dot(nn, N) < 0) nn = v.mul(nn, -1);
      const up = v.norm(v.add(v.mul(u, Math.cos(half)), v.mul(nn, Math.sin(half))));
      const down = v.norm(v.sub(v.mul(u, Math.cos(half)), v.mul(nn, Math.sin(half))));
      const axialUp = Math.abs(v.dot(up, N)) > Math.abs(v.dot(down, N));
      out.push({ C, up, down, upPos: v.add(C, v.mul(up, len)), downPos: v.add(C, v.mul(down, len)), axial: axialUp ? "up" : "down", N });
    }
    return out;
  }

  // ---------- energy models (kJ/mol) ----------
  // Ethane: three equal eclipsing costs of 4.0 → a 12 kJ/mol barrier.
  const ethaneE = (phi) => 6 * (1 + Math.cos(3 * phi * DEG));
  // Butane: a four-term fit that hits the textbook values exactly:
  // 0° 19 (fully eclipsed), 60° 3.8 (gauche), 120° 16 (eclipsed), 180° 0 (anti).
  const BUT = [9.7667, 2.2667, -0.2667, 7.2333];
  const butaneE = (phi) => { const t = phi * DEG; return BUT[0] + BUT[1] * Math.cos(t) + BUT[2] * Math.cos(2 * t) + BUT[3] * Math.cos(3 * t); };
  const R = 8.314e-3; // kJ/(mol·K)

  function butaneName(phi) {
    const p = ((phi % 360) + 360) % 360;
    const near = (x, tol = 12) => Math.abs(((p - x + 540) % 360) - 180) <= tol;
    if (near(180)) return "anti";
    if (near(60) || near(300)) return "gauche";
    if (near(0)) return "fully eclipsed";
    if (near(120) || near(240)) return "eclipsed";
    return "skew (in between)";
  }
  function ethaneName(phi) {
    const p = ((phi % 120) + 120) % 120;
    if (p <= 10 || p >= 110) return "eclipsed";
    if (Math.abs(p - 60) <= 10) return "staggered";
    return "skew (in between)";
  }

  // ---------- SVG helpers ----------
  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs = {}, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  // An energy-vs-angle plot. Returns { setX(x) } to move the marker.
  function energyPlot(svg, opt) {
    const W = opt.width || 600, H = opt.height || 260;
    const m = { l: 56, r: 16, t: 18, b: 42 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = "";
    const x0 = opt.xmin ?? 0, x1 = opt.xmax ?? 360, y0 = opt.ymin ?? 0, y1 = opt.ymax ?? 20;
    const X = (x) => m.l + (x - x0) / (x1 - x0) * (W - m.l - m.r);
    const Y = (y) => H - m.b - (y - y0) / (y1 - y0) * (H - m.t - m.b);
    const g = el("g", {}, svg);
    // grid
    (opt.yticks || []).forEach((t) => {
      el("line", { x1: m.l, x2: W - m.r, y1: Y(t), y2: Y(t), stroke: "#ffffff12" }, g);
      const tx = el("text", { x: m.l - 8, y: Y(t) + 4, "text-anchor": "end", fill: "#8f97c4", "font-size": 12 }, g);
      tx.textContent = t;
    });
    (opt.xticks || []).forEach((t) => {
      el("line", { x1: X(t), x2: X(t), y1: m.t, y2: H - m.b, stroke: "#ffffff0c" }, g);
      const tx = el("text", { x: X(t), y: H - m.b + 18, "text-anchor": "middle", fill: "#8f97c4", "font-size": 12 }, g);
      tx.textContent = (opt.xfmt ? opt.xfmt(t) : t + "°");
    });
    const xl = el("text", { x: (m.l + W - m.r) / 2, y: H - 6, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800 }, g);
    xl.textContent = opt.xlabel || "";
    const yl = el("text", { x: 14, y: (m.t + H - m.b) / 2, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800, transform: `rotate(-90 14 ${(m.t + H - m.b) / 2})` }, g);
    yl.textContent = opt.ylabel || "";
    // curve
    let d = "";
    const N = 360;
    for (let i = 0; i <= N; i++) {
      const x = x0 + (x1 - x0) * i / N;
      d += (i ? "L" : "M") + X(x).toFixed(1) + " " + Y(opt.f(x)).toFixed(1);
    }
    const area = el("path", { d: d + `L${X(x1)} ${Y(y0)}L${X(x0)} ${Y(y0)}Z`, fill: opt.fill || "#58c4dd18" }, g);
    el("path", { d, fill: "none", stroke: opt.color || "#58c4dd", "stroke-width": 3, "stroke-linejoin": "round" }, g);
    (opt.labels || []).forEach((L) => {
      const ty = Y(opt.f(L.x)) + (L.dy ?? -12);
      const anchor = L.x <= x0 ? "start" : L.x >= x1 ? "end" : "middle";
      const t = el("text", { x: X(L.x), y: ty, "text-anchor": anchor, fill: L.color || "#eef0ff", "font-size": 12, "font-weight": 800 }, g);
      t.textContent = L.text;
    });
    const guide = el("line", { y1: m.t, y2: H - m.b, stroke: "#f4b94266", "stroke-dasharray": "3 4" }, g);
    const halo = el("circle", { r: 13, fill: "#f4b94233" }, g);
    const dot = el("circle", { r: 7, fill: "#f4b942", stroke: "#241a00", "stroke-width": 2.5 }, g);
    function setX(x) {
      const px = X(x), py = Y(opt.f(x));
      guide.setAttribute("x1", px); guide.setAttribute("x2", px);
      dot.setAttribute("cx", px); dot.setAttribute("cy", py);
      halo.setAttribute("cx", px); halo.setAttribute("cy", py);
    }
    // click / drag along the plot to choose x
    if (opt.onPick) {
      let down = false;
      const pick = (e) => {
        const r = svg.getBoundingClientRect();
        const sx = (e.clientX - r.left) / r.width * W;
        let x = x0 + (sx - m.l) / (W - m.l - m.r) * (x1 - x0);
        x = Math.max(x0, Math.min(x1, x));
        opt.onPick(x);
      };
      svg.style.cursor = "crosshair";
      svg.style.touchAction = "pan-y";
      svg.addEventListener("pointerdown", (e) => { down = true; svg.setPointerCapture(e.pointerId); pick(e); });
      svg.addEventListener("pointermove", (e) => { if (down) pick(e); });
      svg.addEventListener("pointerup", () => { down = false; });
      svg.addEventListener("pointercancel", () => { down = false; });
    }
    return { setX, X, Y, g };
  }

  // ---------- quick-check quizzes ----------
  function initQuizzes(root = document) {
    root.querySelectorAll(".quiz").forEach((qz) => {
      qz.querySelectorAll(".opts button").forEach((b) => {
        b.type = "button";
        b.addEventListener("click", () => {
          if (b.hasAttribute("data-ok")) {
            b.classList.add("right");
            qz.classList.add("done");
            qz.querySelectorAll(".opts button").forEach((o) => { o.disabled = o !== b && !o.classList.contains("wrong"); });
          } else {
            b.classList.add("wrong");
          }
        });
      });
    });
  }
  document.addEventListener("DOMContentLoaded", () => {
    initQuizzes();
    // on a phone the chapter strip scrolls sideways: bring this chapter into view
    const nav = document.querySelector(".chapters"), cur = nav && nav.querySelector('[aria-current="page"]');
    if (nav && cur && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = cur.getBoundingClientRect().left - nav.getBoundingClientRect().left + nav.scrollLeft - (nav.clientWidth - cur.offsetWidth) / 2;
  });

  window.CK = { v, q, DEG, angle, dihedral, perp, ease, reduceMotion, Viewer, ELEMENTS, CC, CH, TET, twoCarbon, ringSix, ringSubstituents, CHAIR_PSI, ethaneE, butaneE, butaneName, ethaneName, R, el, energyPlot };
})();
