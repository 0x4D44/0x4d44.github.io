/* Chapter 1 — overview: twisting butane, σ vs π overlap, barrier timescales. */
(function () {
  "use strict";
  const { Viewer, twoCarbon, butaneE, butaneName, q, el, DEG } = CK;

  // ---- hero: butane spinning through every conformation ----
  let phi = 180;
  const hero = new Viewer(document.getElementById("hero3d"), {
    orient: q.view(-35, 18), extent: 3.1,
    onFrame(dt) {
      if (CK.reduceMotion()) return false;
      // slow down in the wells so the favourite poses read as "favourites"
      const speed = 25 + 4.2 * butaneE(phi);
      phi = (phi + speed * dt) % 360;
      build();
    },
  });
  const out = { p: document.getElementById("heroPhi"), n: document.getElementById("heroName"), e: document.getElementById("heroE") };
  function build() {
    const m = twoCarbon("butane", phi);
    hero.setModel(m.atoms, m.bonds);
    const shown = phi > 180 ? 360 - phi : phi;
    out.p.textContent = Math.round(shown) + "°";
    out.n.textContent = butaneName(phi);
    out.e.textContent = butaneE(phi).toFixed(1) + " kJ/mol";
  }
  build();

  // ---- σ vs π overlap ----
  const svg = document.getElementById("orbitals");
  const twist = document.getElementById("twist"), twistOut = document.getElementById("twistOut");
  svg.setAttribute("viewBox", "0 0 640 275");
  const lobe = (g, cx, cy, sx, sy, color, flip) => {
    // a teardrop lobe pointing up (or down) from (cx, cy)
    const s = flip ? -1 : 1;
    const d = `M${cx} ${cy} C ${cx - 26 * sx} ${cy - s * 30 * sy}, ${cx - 22 * sx} ${cy - s * 78 * sy}, ${cx} ${cy - s * 78 * sy} C ${cx + 22 * sx} ${cy - s * 78 * sy}, ${cx + 26 * sx} ${cy - s * 30 * sy}, ${cx} ${cy} Z`;
    return el("path", { d, fill: color, "fill-opacity": 0.55, stroke: color, "stroke-width": 2 }, g);
  };
  function drawOrbitals(t) {
    svg.innerHTML = "";
    const g = el("g", {}, svg);
    // titles
    const T = (x, y, s, c = "#eef0ff", size = 15) => { const e = el("text", { x, y, "text-anchor": "middle", fill: c, "font-size": size, "font-weight": 800 }, g); e.textContent = s; return e; };
    T(160, 24, "σ bond (single)", "#58c4dd");
    T(480, 24, "π bond (the extra half of a double bond)", "#f4b942");
    // σ: two atoms with a sausage of density; a rotating marker shows the twist
    const cy = 130;
    el("ellipse", { cx: 160, cy, rx: 90, ry: 26, fill: "#58c4dd", "fill-opacity": 0.28, stroke: "#58c4dd", "stroke-width": 2 }, g);
    [110, 210].forEach((x) => el("circle", { cx: x, cy, r: 16, fill: "#5d6596", stroke: "#0b0e20", "stroke-width": 2 }, g));
    // twist marker on right atom: a little ring around the axis, drawn as an ellipse with a dot
    el("ellipse", { cx: 210, cy, rx: 8, ry: 34, fill: "none", stroke: "#ffffff40", "stroke-dasharray": "3 4" }, g);
    el("circle", { cx: 210 + 8 * Math.sin(t * DEG), cy: cy - 34 * Math.cos(t * DEG), r: 5, fill: "#f4b942" }, g);
    // π: two atoms, p orbitals; right one foreshortened by cos t
    const ax = 430, bx = 530;
    el("line", { x1: ax, y1: cy, x2: bx, y2: cy, stroke: "#5d6596", "stroke-width": 6 }, g);
    lobe(g, ax, cy, 1, 1, "#f4b942"); lobe(g, ax, cy, 1, 1, "#a68cff", true);
    const c = Math.cos(t * DEG);
    lobe(g, bx, cy, 1, Math.max(0.04, c), "#f4b942"); lobe(g, bx, cy, 1, Math.max(0.04, c), "#a68cff", true);
    // edge-on lobes appear sideways as they turn: draw the out-of-plane part as a faint horizontal
    if (t > 2) {
      const s = Math.sin(t * DEG);
      el("ellipse", { cx: bx, cy, rx: 24 * s, ry: 9 * s, fill: "#f4b942", "fill-opacity": 0.25 }, g);
    }
    [ax, bx].forEach((x) => el("circle", { cx: x, cy, r: 16, fill: "#5d6596", stroke: "#0b0e20", "stroke-width": 2 }, g));
    // overlap meters
    const meter = (x, frac, color, label) => {
      el("rect", { x: x - 90, y: 250, width: 180, height: 12, rx: 6, fill: "#0f1329", stroke: "#2c335e" }, g);
      el("rect", { x: x - 90, y: 250, width: 180 * frac, height: 12, rx: 6, fill: color }, g);
      T(x, 240, label, "#c3c9ec", 13);
    };
    meter(160, 1, "#58c4dd", "overlap 100%");
    meter(480, Math.max(0, c), c > 0.2 ? "#f4b942" : "#ff6f6f", "overlap " + Math.round(Math.max(0, c) * 100) + "%");
  }
  twist.addEventListener("input", () => { twistOut.textContent = twist.value + "°"; drawOrbitals(+twist.value); });
  drawOrbitals(0);

  // ---- barrier height vs timescale ----
  const bsvg = document.getElementById("barrier");
  const ea = document.getElementById("ea");
  const RT = 8.314e-3 * 298.15, A = 6.21e12;
  const W = 640, H = 170, L = 30, Rr = 610;
  bsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const X = (e) => L + (e / 300) * (Rr - L);
  function fmtRate(k) {
    if (k >= 1) {
      const e = Math.floor(Math.log10(k));
      if (e < 4) return k.toFixed(k < 10 ? 1 : 0);
      return (k / 10 ** e).toFixed(1) + " × 10" + sup(e);
    }
    const e = Math.floor(Math.log10(k));
    return (k / 10 ** e).toFixed(1) + " × 10" + sup(e);
  }
  function sup(n) { const m = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" }; return String(n).split("").map((c) => m[c]).join(""); }
  function fmtTime(s) {
    const units = [[1e-12, "picoseconds", 1e-12], [1e-9, "nanoseconds", 1e-9], [1e-6, "microseconds", 1e-6], [1e-3, "milliseconds", 1e-3], [1, "seconds", 1], [60, "minutes", 60], [3600, "hours", 3600], [86400, "days", 86400], [3.156e7, "years", 3.156e7]];
    if (s < 1e-12) return (s / 1e-15).toFixed(0) + " femtoseconds";
    let u = units[0];
    for (const x of units) if (s >= x[0]) u = x;
    const val = s / u[2];
    if (u[1] === "years" && val >= 1e4) {
      const age = val / 1.38e10;
      if (age >= 10) return "10" + sup(Math.floor(Math.log10(val))) + " years";
      return val.toExponential(1).replace("e+", " × 10^") + " years";
    }
    return (val < 10 ? val.toFixed(1) : Math.round(val)) + " " + u[1];
  }
  const marks = [[12, "#58c4dd"], [19, "#f4b942"], [45, "#5bd6a2"], [270, "#ff6f6f"]];
  function drawBar() {
    const e = +ea.value;
    bsvg.innerHTML = "";
    const g = el("g", {}, bsvg);
    // gradient band: fast (blue) → slow (coral)
    const defs = el("defs", {}, g);
    const lg = el("linearGradient", { id: "bgrad", x1: 0, x2: 1 }, defs);
    el("stop", { offset: "0", "stop-color": "#58c4dd" }, lg);
    el("stop", { offset: "0.3", "stop-color": "#5bd6a2" }, lg);
    el("stop", { offset: "0.45", "stop-color": "#f4b942" }, lg);
    el("stop", { offset: "1", "stop-color": "#ff6f6f" }, lg);
    el("rect", { x: L, y: 72, width: Rr - L, height: 14, rx: 7, fill: "url(#bgrad)", opacity: 0.9 }, g);
    const t = (x, y, s, c, a = "middle", sz = 12, w = 700) => { const n = el("text", { x, y, fill: c, "font-size": sz, "font-weight": w, "text-anchor": a }, g); n.textContent = s; };
    t(L, 112, "0", "#8f97c4", "start");
    [50, 100, 150, 200, 250, 300].forEach((v) => t(X(v), 112, v, "#8f97c4"));
    t(X(150), 136, "barrier, kJ/mol", "#c3c9ec", "middle", 13, 800);
    t(X(35), 56, "conformations: swap in a flash", "#5bd6a2", "middle", 12, 800);
    t(X(220), 56, "configurations: effectively stuck", "#ff6f6f", "middle", 12, 800);
    marks.forEach(([v, c]) => el("circle", { cx: X(v), cy: 79, r: 5, fill: c, stroke: "#0b0e20", "stroke-width": 2 }, g));
    // marker
    el("line", { x1: X(e), x2: X(e), y1: 64, y2: 94, stroke: "#fff", "stroke-width": 3 }, g);
    el("circle", { cx: X(e), cy: 79, r: 9, fill: "none", stroke: "#fff", "stroke-width": 3 }, g);
    const k = A * Math.exp(-e / RT);
    document.getElementById("eaOut").textContent = e + " kJ/mol";
    document.getElementById("rateOut").textContent = fmtRate(k);
    document.getElementById("waitOut").textContent = fmtTime(1 / k);
  }
  ea.addEventListener("input", drawBar);
  drawBar();
})();
