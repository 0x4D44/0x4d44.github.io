/* Chapter 3 — ring strain: Baeyer polygons, combustion data, the pucker toy
   model, and cyclopropane's bent bonds. */
(function () {
  "use strict";
  const { Viewer, ringSubstituents, ringSix, CHAIR_PSI, q, el, v, angle, dihedral, DEG, CC } = CK;
  const NAMES = { 3: "cyclopropane", 4: "cyclobutane", 5: "cyclopentane", 6: "cyclohexane", 7: "cycloheptane", 8: "cyclooctane" };
  const STRAIN = { 3: 115, 4: 110, 5: 26, 6: 0, 7: 26, 8: 40 };

  // A ring of n carbons with pucker amplitude Q (Å): z_k = Q cos(2π m k / n),
  // m = 2 for 4- and 5-rings (butterfly / envelope), 3 for six (chair).
  function puckered(n, Q) {
    const m = n <= 5 ? 2 : 3;
    const z = []; for (let k = 0; k < n; k++) z.push(n === 3 ? 0 : Q * Math.cos(2 * Math.PI * m * k / n));
    let s = 0; for (let k = 0; k < n; k++) { const d = z[k] - z[(k + 1) % n]; s += d * d; } s /= n;
    const r = Math.sqrt(Math.max(0.01, CC * CC - s)) / (2 * Math.sin(Math.PI / n));
    return z.map((zz, k) => [r * Math.cos(2 * Math.PI * k / n), r * Math.sin(2 * Math.PI * k / n), zz]);
  }
  function strain(P) {
    const n = P.length; let ea = 0, et = 0; const angs = [], dihs = [];
    for (let i = 0; i < n; i++) {
      const a = angle(P[(i + n - 1) % n], P[i], P[(i + 1) % n]); angs.push(a); ea += 0.02 * (a - 109.5) ** 2;
      const d = dihedral(P[(i + n - 1) % n], P[i], P[(i + 1) % n], P[(i + 2) % n]); dihs.push(d); et += 4 * (1 + Math.cos(3 * d * DEG));
    }
    return { ea, et, t: ea + et, angs, dihs };
  }
  function ringModel(P, opt = {}) {
    const atoms = [], bonds = [];
    P.forEach((p) => atoms.push({ el: "C", p }));
    P.forEach((_, i) => bonds.push([i, (i + 1) % P.length]));
    ringSubstituents(P).forEach((s, i) => {
      [s.upPos, s.downPos].forEach((h) => { atoms.push({ el: "H", p: h }); bonds.push([i, atoms.length - 1]); });
    });
    return { atoms, bonds };
  }

  // ---------- hero: cycle through rings ----------
  (function () {
    const shapes = [
      [3, puckered(3, 0)], [4, puckered(4, 0.165)], [5, puckered(5, 0.34)], [6, ringSix(CHAIR_PSI, -CHAIR_PSI)],
    ];
    let i = 0;
    const tag = document.getElementById("heroRingTag");
    const view = new Viewer(document.getElementById("heroRing"), { orient: q.view(20, 50), autoSpin: 0.35, spinAxis: [0, 1, 0], extent: 2.8 });
    const show = () => { const m = ringModel(shapes[i][1]); view.setModel(m.atoms, m.bonds); tag.textContent = NAMES[shapes[i][0]] + " · strain " + STRAIN[shapes[i][0]] + " kJ/mol"; };
    show();
    if (!CK.reduceMotion()) setInterval(() => { i = (i + 1) % shapes.length; show(); }, 3500);
    view.canvas.addEventListener("click", () => { i = (i + 1) % shapes.length; show(); });
  })();

  // ---------- Baeyer polygons ----------
  (function () {
    const svg = document.getElementById("polygon");
    const out = { n: document.getElementById("polyName"), a: document.getElementById("polyAng"), d: document.getElementById("polyDev"), note: document.getElementById("polyNote") };
    const NOTES = {
      3: "Squeezed by almost 50°. Baeyer predicted cyclopropane would be the most strained ring — correctly.",
      4: "Squeezed by 19.5°. Still badly strained.",
      5: "Only 1.5° off. Baeyer's favourite — but flat cyclopentane hides another problem.",
      6: "Stretched by 10.5°. Baeyer predicted real strain here. He was wrong.",
      7: "Stretched by 19°. Baeyer predicted big rings get steadily worse…",
      8: "…and worse. In fact rings this size are only mildly strained, because they don't stay flat.",
    };
    function draw(n) {
      const S = 300, c = S / 2, r = 100;
      svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      const pts = [];
      for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + 2 * Math.PI * k / n; pts.push([c + r * Math.cos(a), c + 14 + r * Math.sin(a)]); }
      el("polygon", { points: pts.map((p) => p.join(",")).join(" "), fill: "#58c4dd14", stroke: "#58c4dd", "stroke-width": 5, "stroke-linejoin": "round" }, g);
      // angle at the top vertex
      const A = pts[0], B = pts[1], Cc = pts[n - 1];
      const ang = (n - 2) * 180 / n;
      const dirB = Math.atan2(B[1] - A[1], B[0] - A[0]), dirC = Math.atan2(Cc[1] - A[1], Cc[0] - A[0]);
      const rr = 38;
      // ideal 109.5° wedge centred on the vertical bisector
      const mid = Math.PI / 2, half = 109.5 / 2 * DEG;
      const w1 = [A[0] + 70 * Math.cos(mid - half), A[1] + 70 * Math.sin(mid - half)], w2 = [A[0] + 70 * Math.cos(mid + half), A[1] + 70 * Math.sin(mid + half)];
      el("path", { d: `M${A[0]} ${A[1]} L${w1[0]} ${w1[1]} A 70 70 0 0 1 ${w2[0]} ${w2[1]} Z`, fill: "#5bd6a222", stroke: "#5bd6a2", "stroke-width": 2, "stroke-dasharray": "4 4" }, g);
      const a1 = [A[0] + rr * Math.cos(dirB), A[1] + rr * Math.sin(dirB)], a2 = [A[0] + rr * Math.cos(dirC), A[1] + rr * Math.sin(dirC)];
      el("path", { d: `M${a1[0]} ${a1[1]} A ${rr} ${rr} 0 0 1 ${a2[0]} ${a2[1]}`, fill: "none", stroke: ang < 109.5 ? "#ff6f6f" : "#f4b942", "stroke-width": 5 }, g);
      pts.forEach((p) => { el("circle", { cx: p[0], cy: p[1], r: 10, fill: "#5d6596", stroke: "#0b0e20", "stroke-width": 2.5 }, g); });
      const t = el("text", { x: c, y: 22, "text-anchor": "middle", fill: "#5bd6a2", "font-size": 13, "font-weight": 800 }, g); t.textContent = "dashed: the ideal 109.5°";
      out.n.textContent = NAMES[n]; out.a.textContent = (Math.round(ang * 10) / 10) + "°";
      out.d.textContent = (Math.round(Math.abs(ang - 109.5) * 10) / 10) + "° " + (ang < 109.5 ? "squeezed" : "stretched");
      out.note.textContent = NOTES[n];
    }
    const pick = document.getElementById("ringPick");
    pick.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      pick.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); draw(+b.dataset.n);
    }));
    draw(3);
  })();

  // ---------- combustion chart ----------
  (function () {
    const svg = document.getElementById("combust");
    const PER = { 3: 697.1, 4: 686.2, 5: 663.6, 6: 658.6, 7: 662.3, 8: 663.6 };
    const W = 640, H = 300, ml = 60, mr = 16, mt = 24, mb = 54;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let mode = "per";
    function draw() {
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      const lo = mode === "per" ? 650 : 0, hi = mode === "per" ? 705 : 125;
      const Y = (y) => H - mb - (y - lo) / (hi - lo) * (H - mt - mb);
      const ticks = mode === "per" ? [650, 660, 670, 680, 690, 700] : [0, 25, 50, 75, 100, 125];
      ticks.forEach((t) => {
        el("line", { x1: ml, x2: W - mr, y1: Y(t), y2: Y(t), stroke: "#ffffff10" }, g);
        const n = el("text", { x: ml - 8, y: Y(t) + 4, "text-anchor": "end", fill: "#8f97c4", "font-size": 12 }, g); n.textContent = t;
      });
      const bw = (W - ml - mr) / 6;
      [3, 4, 5, 6, 7, 8].forEach((n, i) => {
        const val = mode === "per" ? PER[n] : STRAIN[n];
        const x = ml + i * bw + bw * 0.18, w = bw * 0.64;
        const col = STRAIN[n] > 80 ? "#ff6f6f" : STRAIN[n] > 0 ? "#f4b942" : "#5bd6a2";
        const top = Y(val), base = Y(lo);
        el("rect", { x, y: Math.min(top, base - 2), width: w, height: Math.max(2, base - top), rx: 6, fill: col, opacity: 0.85 }, g);
        const t = el("text", { x: x + w / 2, y: top - 8, "text-anchor": "middle", fill: "#eef0ff", "font-size": 13, "font-weight": 800 }, g);
        t.textContent = mode === "per" ? val.toFixed(1) : val;
        const lb = el("text", { x: x + w / 2, y: H - mb + 20, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800 }, g);
        lb.textContent = "C" + n;
      });
      if (mode === "per") {
        el("line", { x1: ml, x2: W - mr, y1: Y(658.6), y2: Y(658.6), stroke: "#5bd6a2", "stroke-width": 2, "stroke-dasharray": "6 5" }, g);
        const t = el("text", { x: W - mr, y: Y(658.6) - 8, "text-anchor": "end", fill: "#5bd6a2", "font-size": 12, "font-weight": 800 }, g); t.textContent = "unstrained: 658.6";
      }
      const yl = el("text", { x: 14, y: (mt + H - mb) / 2, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800, transform: `rotate(-90 14 ${(mt + H - mb) / 2})` }, g);
      yl.textContent = mode === "per" ? "heat released per CH₂, kJ/mol" : "ring strain, kJ/mol";
      const xl = el("text", { x: (ml + W - mr) / 2, y: H - 10, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800 }, g);
      xl.textContent = "number of carbons in the ring";
    }
    const seg = document.getElementById("combustMode");
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); mode = b.dataset.m; draw();
    }));
    draw();
  })();

  // ---------- pucker toy model ----------
  (function () {
    const QMAX = { 3: 0, 4: 0.34, 5: 0.5, 6: 0.42 };
    const svg = document.getElementById("puckerPlot");
    const slider = document.getElementById("pucker");
    const tag = document.getElementById("puckerTag");
    const o = { ang: document.getElementById("pkAng"), dih: document.getElementById("pkDih"), a: document.getElementById("pkA"), t: document.getElementById("pkT"), s: document.getElementById("pkSum") };
    let n = 4, Q = 0, anim = null;
    const view = new Viewer(document.getElementById("puckerMol"), { orient: q.view(0, -72), extent: 2.7,
      onFrame(dt) { if (!anim) return false; const t = Math.min(1, (performance.now() - anim.t0) / 900); Q = anim.a + (anim.b - anim.a) * CK.ease(t); if (t >= 1) anim = null; update(); } });
    const W = 520, H = 400, ml = 52, mr = 14, mt = 20, mb = 44;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    let curves, ymax, best;
    function compute() {
      curves = [];
      const qm = QMAX[n] || 0.0001;
      for (let i = 0; i <= 100; i++) { const qq = qm * i / 100; const s = strain(puckered(n, qq)); curves.push({ q: qq, ...s }); }
      best = curves.reduce((b, c) => (c.t < b.t ? c : b), curves[0]);
      ymax = Math.max(...curves.map((c) => Math.max(c.t, c.ea, c.et))) * 1.08;
      if (n === 3) ymax = 200;
    }
    function draw() {
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      const qm = QMAX[n] || 1;
      const X = (qq) => ml + qq / qm * (W - ml - mr), Y = (y) => H - mb - y / ymax * (H - mt - mb);
      const step = ymax > 120 ? 50 : ymax > 60 ? 20 : 10;
      for (let t = 0; t <= ymax; t += step) {
        el("line", { x1: ml, x2: W - mr, y1: Y(t), y2: Y(t), stroke: "#ffffff10" }, g);
        const tx = el("text", { x: ml - 8, y: Y(t) + 4, "text-anchor": "end", fill: "#8f97c4", "font-size": 12 }, g); tx.textContent = t;
      }
      const txt = (x, y, s, c, a = "middle", sz = 13) => { const e = el("text", { x, y, "text-anchor": a, fill: c, "font-size": sz, "font-weight": 800 }, g); e.textContent = s; };
      if (n === 3) {
        const s = curves[0];
        [["angle", s.ea, "#ff6f6f"], ["torsional", s.et, "#58c4dd"], ["total", s.t, "#f4b942"]].forEach(([k, val, c], i) => {
          const x = ml + 40 + i * 140;
          el("rect", { x, y: Y(val), width: 80, height: H - mb - Y(val), rx: 6, fill: c, opacity: 0.85 }, g);
          txt(x + 40, Y(val) - 8, val.toFixed(0), "#eef0ff");
          txt(x + 40, H - mb + 20, k, c);
        });
        el("line", { x1: ml, x2: W - mr, y1: Y(115), y2: Y(115), stroke: "#5bd6a2", "stroke-width": 2, "stroke-dasharray": "6 5" }, g);
        txt(W - mr, Y(115) - 8, "measured: 115", "#5bd6a2", "end", 12);
        txt((ml + W - mr) / 2, H - 6, "a triangle can't pucker — there's no slider to move", "#c3c9ec");
        return;
      }
      const path = (key, color, w) => {
        let d = ""; curves.forEach((c, i) => { d += (i ? "L" : "M") + X(c.q).toFixed(1) + " " + Y(c[key]).toFixed(1); });
        el("path", { d, fill: "none", stroke: color, "stroke-width": w, "stroke-linejoin": "round" }, g);
      };
      path("ea", "#ff6f6f", 2.5); path("et", "#58c4dd", 2.5); path("t", "#f4b942", 4);
      const last = curves[curves.length - 1];
      txt(X(last.q) - 4, Y(last.ea) - 8, "angle", "#ff6f6f", "end", 12);
      txt(X(curves[8].q) + 4, Y(curves[8].et) - 8, "torsional", "#58c4dd", "start", 12);
      // best point
      el("circle", { cx: X(best.q), cy: Y(best.t), r: 6, fill: "none", stroke: "#5bd6a2", "stroke-width": 2.5 }, g);
      txt(X(best.q), Y(best.t) + 24, "minimum", "#5bd6a2", "middle", 12);
      // current
      const cur = strain(puckered(n, Q));
      el("line", { x1: X(Q), x2: X(Q), y1: mt, y2: H - mb, stroke: "#ffffff55", "stroke-dasharray": "3 4" }, g);
      el("circle", { cx: X(Q), cy: Y(cur.t), r: 8, fill: "#f4b942", stroke: "#241a00", "stroke-width": 2.5 }, g);
      txt(ml, H - 8, "← flat", "#c3c9ec", "start"); txt(W - mr, H - 8, "very puckered →", "#c3c9ec", "end");
      const yl = el("text", { x: 14, y: (mt + H - mb) / 2, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800, transform: `rotate(-90 14 ${(mt + H - mb) / 2})` }, g);
      yl.textContent = "strain, kJ/mol";
    }
    function update() {
      const P = n === 6 && Q > 0 ? puckered(6, Q) : puckered(n, Q);
      const m = ringModel(P);
      view.setModel(m.atoms, m.bonds);
      const s = strain(P);
      const mn = Math.min(...s.angs), mx = Math.max(...s.angs);
      o.ang.textContent = Math.abs(mx - mn) < 0.6 ? mn.toFixed(0) + "°" : mn.toFixed(0) + "–" + mx.toFixed(0) + "°";
      o.dih.textContent = Math.max(...s.dihs.map(Math.abs)).toFixed(0) + "°";
      o.a.textContent = s.ea.toFixed(0) + " kJ/mol"; o.t.textContent = s.et.toFixed(0) + " kJ/mol"; o.s.textContent = s.t.toFixed(0) + " kJ/mol";
      const shape = n === 3 ? "flat, always" : Q < 0.02 ? "flat" : n === 4 ? "butterfly" : n === 5 ? "envelope" : Math.abs(Q - best.q) < 0.03 ? "chair" : "chair-like";
      tag.textContent = NAMES[n] + " · " + shape;
      if (n !== 3) slider.value = Math.round(Q / QMAX[n] * 100);
      draw();
    }
    slider.addEventListener("input", () => { anim = null; Q = (QMAX[n] || 0) * slider.value / 100; update(); });
    document.getElementById("puckerBest").addEventListener("click", () => {
      if (CK.reduceMotion()) { Q = best.q; update(); } else { anim = { a: Q, b: best.q, t0: performance.now() }; view.dirty = true; }
    });
    const seg = document.getElementById("puckerPick");
    seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
      seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      n = +b.dataset.n; Q = 0; anim = null; slider.value = 0; slider.disabled = n === 3; compute(); update();
    }));
    compute(); update();
  })();

  // ---------- cyclopropane bent bonds ----------
  (function () {
    const svg = document.getElementById("banana");
    const W = 520, H = 340;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const g = el("g", {}, svg);
    const P = [[260, 70], [130, 280], [390, 280]];
    // straight internuclear lines (dashed)
    for (let i = 0; i < 3; i++) { const a = P[i], b = P[(i + 1) % 3]; el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#8f97c4", "stroke-width": 2, "stroke-dasharray": "5 6" }, g); }
    // orbitals: from each carbon toward each neighbour, rotated 22° outward
    const cen = [260, 210];
    const lobeAt = (from, to) => {
      const dx = to[0] - from[0], dy = to[1] - from[1];
      let ang = Math.atan2(dy, dx);
      // outward = away from the centroid
      const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
      const out = Math.atan2(mid[1] - cen[1], mid[0] - cen[0]);
      const cross = Math.cos(ang) * Math.sin(out) - Math.sin(ang) * Math.cos(out);
      ang += (cross > 0 ? 1 : -1) * 22 * DEG;
      const L = 112, wdt = 30;
      const tip = [from[0] + L * Math.cos(ang), from[1] + L * Math.sin(ang)];
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const d = `M${from[0]} ${from[1]} C ${from[0] + 0.5 * L * Math.cos(ang) + wdt * nx} ${from[1] + 0.5 * L * Math.sin(ang) + wdt * ny}, ${tip[0] + 10 * nx} ${tip[1] + 10 * ny}, ${tip[0]} ${tip[1]} C ${tip[0] - 10 * nx} ${tip[1] - 10 * ny}, ${from[0] + 0.5 * L * Math.cos(ang) - wdt * nx} ${from[1] + 0.5 * L * Math.sin(ang) - wdt * ny}, ${from[0]} ${from[1]} Z`;
      el("path", { d, fill: "#a68cff", "fill-opacity": 0.35, stroke: "#a68cff", "stroke-width": 2 }, g);
    };
    for (let i = 0; i < 3; i++) { lobeAt(P[i], P[(i + 1) % 3]); lobeAt(P[(i + 1) % 3], P[i]); }
    P.forEach((p) => { el("circle", { cx: p[0], cy: p[1], r: 18, fill: "#5d6596", stroke: "#0b0e20", "stroke-width": 3 }, g); const t = el("text", { x: p[0], y: p[1] + 5, "text-anchor": "middle", fill: "#eef0ff", "font-size": 14, "font-weight": 900 }, g); t.textContent = "C"; });
    const t1 = el("text", { x: 260, y: 230, "text-anchor": "middle", fill: "#8f97c4", "font-size": 13, "font-weight": 800 }, g); t1.textContent = "60° between nuclei";
    const t2 = el("text", { x: 260, y: 26, "text-anchor": "middle", fill: "#a68cff", "font-size": 13, "font-weight": 800 }, g); t2.textContent = "orbitals ≈ 104° apart, bulging outwards";
  })();
})();
