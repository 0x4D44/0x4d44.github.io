/* Chapter 2 — Newman projections: the look-down camera, two linked rotors
   (ethane, butane) and a Langevin simulation of butane's populations. */
(function () {
  "use strict";
  const { Viewer, twoCarbon, ethaneE, butaneE, ethaneName, butaneName, q, el, energyPlot, DEG, R } = CK;
  const wrap = (a) => ((a % 360) + 360) % 360;

  // ---------- Newman projection drawing ----------
  // groups: front & back lists of {a: angle clockwise from up, kind: "H"|"Me", mark}
  function drawNewman(svg, kind, phi, opt = {}) {
    const S = 320, c = S / 2;
    svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
    svg.innerHTML = "";
    const g = el("g", {}, svg);
    const pt = (a, r) => [c + r * Math.sin(a * DEG), c - r * Math.cos(a * DEG)];
    const front = kind === "butane"
      ? [{ a: 0, k: "Me" }, { a: 120, k: "H" }, { a: 240, k: "H" }]
      : [{ a: 0, k: "H", mark: true }, { a: 120, k: "H" }, { a: 240, k: "H" }];
    const back = front.map((f) => ({ a: wrap(f.a + phi), k: f.k, mark: f.mark }));

    // interaction arcs (behind everything)
    if (opt.interactions !== false) {
      const arc = (a1, a2, r, color, dash) => {
        let d1 = a1, d2 = a2;
        if (((d2 - d1 + 360) % 360) > 180) [d1, d2] = [d2, d1];
        let span = (d2 - d1 + 360) % 360;
        if (span < 6) { d1 -= 6; span += 12; }
        const [x1, y1] = pt(d1, r), [x2, y2] = pt(d1 + span, r);
        el("path", { d: `M${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`, fill: "none", stroke: color, "stroke-width": 10, "stroke-linecap": "round", opacity: 0.55, "stroke-dasharray": dash || "" }, g);
      };
      front.forEach((f) => back.forEach((b) => {
        const dd = Math.abs(((b.a - f.a + 540) % 360) - 180);
        if (dd < 16) arc(f.a, b.a, 152, f.k === "Me" && b.k === "Me" ? "#ff6f6f" : "#ff9a6f");
        else if (f.k === "Me" && b.k === "Me" && Math.abs(dd - 60) < 14) arc(f.a, b.a, 152, "#f4b942", "2 12");
      }));
    }

    const groupDot = (x, y, k, mark, back) => {
      const big = k === "Me";
      const r = big ? 19 : 13;
      el("circle", { cx: x, cy: y, r: r + 2, fill: "#0b0e20" }, g);
      el("circle", { cx: x, cy: y, r, fill: big ? "#e8a93a" : mark ? "#ff8fc7" : "#e9ebf7", opacity: back ? 0.9 : 1 }, g);
      const t = el("text", { x, y: y + (big ? 5 : 5), "text-anchor": "middle", "font-size": big ? 13 : 14, "font-weight": 900, fill: "#0b0e20" }, g);
      t.textContent = big ? "CH₃" : "H";
    };
    // back bonds + groups
    back.forEach((b) => {
      const [x1, y1] = pt(b.a, 62), [x2, y2] = pt(b.a, 118);
      el("line", { x1, y1, x2, y2, stroke: "#8b93c7", "stroke-width": 6, "stroke-linecap": "round" }, g);
      const [gx, gy] = pt(b.a, b.k === "Me" ? 136 : 130);
      groupDot(gx, gy, b.k, b.mark, true);
    });
    // back carbon disc
    el("circle", { cx: c, cy: c, r: 62, fill: "#2a3160", stroke: "#8b93c7", "stroke-width": 4 }, g);
    // front bonds + groups
    front.forEach((f) => {
      const [x2, y2] = pt(f.a, 98);
      el("line", { x1: c, y1: c, x2, y2, stroke: "#eef0ff", "stroke-width": 6, "stroke-linecap": "round" }, g);
      const [gx, gy] = pt(f.a, f.k === "Me" ? 108 : 104);
      groupDot(gx, gy, f.k, f.mark, false);
    });
    el("circle", { cx: c, cy: c, r: 7, fill: "#eef0ff", stroke: "#0b0e20", "stroke-width": 2 }, g);
    if (opt.labels) {
      const t1 = el("text", { x: 14, y: 296, fill: "#c3c9ec", "font-size": 13, "font-weight": 800 }, g); t1.textContent = "• front carbon";
      const t2 = el("text", { x: 14, y: 312, fill: "#8b93c7", "font-size": 13, "font-weight": 800 }, g); t2.textContent = "○ back carbon";
    }
    return g;
  }

  function colourEthane(atoms) {
    atoms.forEach((a) => { if ((a.role === "frontH" || a.role === "backH") && a.k === 0) a.fill = "#ff8fc7"; });
  }

  // ---------- hero ----------
  drawNewman(document.getElementById("heroNewman"), "ethane", 60, { labels: true });

  // ---------- look down the bond ----------
  (function () {
    const SIDE = q.view(-28, 22), END = q.view(90, 0);
    const view = new Viewer(document.getElementById("lookCanvas"), { orient: SIDE, extent: 2.4 });
    const m = twoCarbon("ethane", 60); colourEthane(m.atoms);
    view.setModel(m.atoms, m.bonds);
    drawNewman(document.getElementById("lookNewman"), "ethane", 60, { labels: true, interactions: false });
    const tag = document.getElementById("lookTag");
    document.getElementById("lookDown").addEventListener("click", () => { view.turnTo(END, 1600); tag.textContent = "end-on: front carbon hides the back one"; });
    document.getElementById("lookSide").addEventListener("click", () => { view.turnTo(SIDE, 1200); tag.textContent = 'side view (a "sawhorse")'; });
  })();

  // ---------- linked rotors ----------
  function rotor(root, kind) {
    const nsvg = root.querySelector(".newman"), canvas = root.querySelector(".mol"), psvg = root.querySelector(".energy");
    const dial = root.querySelector(".dial");
    const out = { phi: root.querySelector(".o-phi"), name: root.querySelector(".o-name"), e: root.querySelector(".o-e"), why: root.querySelector(".o-why") };
    const E = kind === "butane" ? butaneE : ethaneE;
    const name = kind === "butane" ? butaneName : ethaneName;
    let phi = +dial.value, target = null;
    const view = new Viewer(canvas, {
      orient: q.view(62, 14), extent: kind === "butane" ? 3.1 : 2.4,
      onFrame(dt) {
        if (target == null) return false;
        const d = ((target - phi + 540) % 360) - 180;
        if (Math.abs(d) < 0.6 || CK.reduceMotion()) { phi = wrap(target); target = null; }
        else phi = wrap(phi + d * Math.min(1, dt * 7));
        update(false);
      },
    });
    const plot = energyPlot(psvg, {
      f: E, width: 900, height: 250, ymax: kind === "butane" ? 22 : 14,
      xticks: [0, 60, 120, 180, 240, 300, 360], yticks: kind === "butane" ? [0, 5, 10, 15, 20] : [0, 4, 8, 12],
      xlabel: kind === "butane" ? "CH₃–C–C–CH₃ dihedral angle" : "H–C–C–H dihedral angle", ylabel: "energy, kJ/mol",
      color: kind === "butane" ? "#f4b942" : "#58c4dd", fill: kind === "butane" ? "#f4b94214" : "#58c4dd14",
      labels: kind === "butane"
        ? [{ x: 0, text: "fully eclipsed", dy: -12 }, { x: 60, text: "gauche", dy: -14, color: "#f4b942" }, { x: 120, text: "eclipsed", dy: -12 },
          { x: 180, text: "anti", dy: -14, color: "#5bd6a2" }, { x: 240, text: "eclipsed", dy: -12 }, { x: 300, text: "gauche", dy: -14, color: "#f4b942" }, { x: 360, text: "", dy: -12 }]
        : [{ x: 0, text: "eclipsed", dy: -12 }, { x: 60, text: "staggered", dy: -14, color: "#5bd6a2" }, { x: 120, text: "eclipsed", dy: -12 }, { x: 180, text: "staggered", dy: -14, color: "#5bd6a2" }, { x: 240, text: "eclipsed", dy: -12 }, { x: 300, text: "staggered", dy: -14, color: "#5bd6a2" }],
      onPick: (x) => { target = null; phi = Math.round(x); update(true); },
    });
    function why(p) {
      const n = butaneName(p);
      if (n === "anti") return "nothing — all staggered, methyls far apart";
      if (n === "gauche") return "CH₃/CH₃ gauche (steric) ≈ 3.8";
      if (n === "eclipsed") return "2 × H/CH₃ eclipsed (6.0) + 1 × H/H (4.0) = 16";
      if (n === "fully eclipsed") return "CH₃/CH₃ eclipsed (11) + 2 × H/H (4.0) = 19";
      return "partly eclipsed — on the way up or down a hill";
    }
    function update(fromUser) {
      const m = twoCarbon(kind, phi);
      if (kind === "ethane") colourEthane(m.atoms);
      view.setModel(m.atoms, m.bonds);
      drawNewman(nsvg, kind, phi);
      plot.setX(phi);
      if (fromUser !== null) dial.value = Math.round(phi);
      out.phi.textContent = Math.round(phi) + "°";
      out.name.textContent = name(phi);
      out.e.textContent = E(phi).toFixed(1) + " kJ/mol";
      if (out.why) out.why.textContent = why(phi);
    }
    dial.addEventListener("input", () => { target = null; phi = +dial.value; update(null); });
    root.querySelectorAll(".snap").forEach((b) => b.addEventListener("click", () => { target = +b.dataset.to; view.dirty = true; }));
    // drag the Newman back carbon round
    let drag = null;
    const angAt = (e) => {
      const r = nsvg.getBoundingClientRect();
      return Math.atan2(e.clientX - (r.left + r.width / 2), -(e.clientY - (r.top + r.height / 2))) / DEG;
    };
    nsvg.addEventListener("pointerdown", (e) => { drag = { a0: angAt(e), p0: phi }; target = null; nsvg.setPointerCapture(e.pointerId); nsvg.style.cursor = "grabbing"; });
    nsvg.addEventListener("pointermove", (e) => { if (!drag) return; phi = wrap(drag.p0 + angAt(e) - drag.a0); update(true); });
    const end = () => { drag = null; nsvg.style.cursor = "grab"; };
    nsvg.addEventListener("pointerup", end); nsvg.addEventListener("pointercancel", end);
    update(true);
  }
  rotor(document.getElementById("ethaneRotor"), "ethane");
  rotor(document.getElementById("butaneRotor"), "butane");

  // ---------- Langevin simulation of butane ----------
  (function () {
    const nsvg = document.getElementById("simNewman"), hsvg = document.getElementById("simHist");
    const Tin = document.getElementById("simT"), Tout = document.getElementById("simTout");
    const antiOut = document.getElementById("simAnti"), predOut = document.getElementById("simPred");
    const pauseBtn = document.getElementById("simPause");
    const NB = 72, bins = new Float64Array(NB);
    let total = 0, phi = 180, paused = false;
    const W = 520, H = 330, ml = 16, mr = 16, mt = 28, mb = 40;
    hsvg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const X = (x) => ml + x / 360 * (W - ml - mr);
    const dE = (p) => { const t = p * DEG; return -(2.2667 * Math.sin(t) + 2 * -0.2667 * Math.sin(2 * t) + 3 * 7.2333 * Math.sin(3 * t)); }; // dE/dθ (per radian)
    function gauss() { let u = 0, v = 0; while (!u) u = Math.random(); v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
    function predicted(T) {
      let a = 0, s = 0;
      for (let i = 0; i < 3600; i++) { const p = i / 10, w = Math.exp(-butaneE(p) / (R * T)); s += w; if (p > 120 && p < 240) a += w; }
      return a / s;
    }
    function boltzCurve(T) {
      const pts = []; let s = 0;
      for (let i = 0; i < NB; i++) { const w = Math.exp(-butaneE((i + 0.5) * 360 / NB) / (R * T)); pts.push(w); s += w; }
      return pts.map((w) => w / s);
    }
    function drawHist() {
      const T = +Tin.value;
      hsvg.innerHTML = "";
      const g = el("g", {}, hsvg);
      const curve = boltzCurve(T);
      const frac = Array.from(bins, (b) => (total ? b / total : 0));
      const ymax = Math.max(0.02, ...curve, ...frac) * 1.12;
      const Y = (y) => H - mb - y / ymax * (H - mt - mb);
      // anti region shading
      el("rect", { x: X(120), y: mt, width: X(240) - X(120), height: H - mt - mb, fill: "#5bd6a210" }, g);
      const lab = (x, s, c) => { const t = el("text", { x: X(x), y: mt - 8, "text-anchor": "middle", fill: c, "font-size": 13, "font-weight": 800 }, g); t.textContent = s; };
      lab(60, "gauche", "#f4b942"); lab(180, "anti", "#5bd6a2"); lab(300, "gauche", "#f4b942");
      const bw = (W - ml - mr) / NB;
      frac.forEach((f, i) => { if (f > 0) el("rect", { x: ml + i * bw + 0.5, y: Y(f), width: bw - 1, height: H - mb - Y(f), fill: "#58c4dd", opacity: 0.75 }, g); });
      let d = "";
      curve.forEach((f, i) => { d += (i ? "L" : "M") + (ml + (i + 0.5) * bw).toFixed(1) + " " + Y(f).toFixed(1); });
      el("path", { d, fill: "none", stroke: "#f4b942", "stroke-width": 3 }, g);
      el("line", { x1: ml, x2: W - mr, y1: H - mb, y2: H - mb, stroke: "#2c335e", "stroke-width": 2 }, g);
      [0, 60, 120, 180, 240, 300, 360].forEach((t) => { const n = el("text", { x: X(t), y: H - mb + 18, "text-anchor": "middle", fill: "#8f97c4", "font-size": 12 }, g); n.textContent = t + "°"; });
      const cur = el("line", { x1: X(phi), x2: X(phi), y1: mt, y2: H - mb, stroke: "#fff", "stroke-width": 2, "stroke-dasharray": "3 4" }, g);
      const xl = el("text", { x: W / 2, y: H - 6, "text-anchor": "middle", fill: "#c3c9ec", "font-size": 13, "font-weight": 800 }, g); xl.textContent = "CH₃–C–C–CH₃ dihedral angle";
      let anti = 0; for (let i = 24; i < 48; i++) anti += bins[i];
      antiOut.textContent = total > 2000 ? Math.round(anti / total * 100) + "%" : "…";
      predOut.textContent = Math.round(predicted(T) * 100) + "%";
    }
    let frame = 0;
    function step() {
      if (!paused && !CK.reduceMotion()) {
        const T = +Tin.value, kT = R * T;
        const D = 80, sub = 200, h = (1 / 60) / sub;
        for (let i = 0; i < sub; i++) {
          let p = phi * DEG;
          p += -(D / kT) * dE(phi) * h + Math.sqrt(2 * D * h) * gauss();
          phi = wrap(p / DEG);
          bins[Math.min(NB - 1, Math.floor(phi / 360 * NB))]++; total++;
        }
        drawNewman(nsvg, "butane", phi);
        if (++frame % 4 === 0) drawHist();
      }
      requestAnimationFrame(step);
    }
    Tin.addEventListener("input", () => { Tout.textContent = Tin.value + " K"; bins.fill(0); total = 0; drawHist(); });
    document.getElementById("simReset").addEventListener("click", () => { bins.fill(0); total = 0; drawHist(); });
    pauseBtn.addEventListener("click", () => { paused = !paused; pauseBtn.setAttribute("aria-pressed", paused); pauseBtn.textContent = paused ? "Resume" : "Pause"; });
    drawNewman(nsvg, "butane", phi);
    drawHist();
    requestAnimationFrame(step);
  })();
})();
