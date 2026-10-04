/* Chapter 4 — the chair: 3D chair with axial/equatorial colouring, a
   step-by-step drawing projected from the real geometry, and the ring flip. */
(function () {
  "use strict";
  const { Viewer, ringSix, ringSubstituents, CHAIR_PSI, q, el, v, DEG } = CK;
  const AX = "#ff6f6f", EQ = "#58c4dd", UP = "#f4b942", DOWN = "#a68cff";

  // quaternion turning unit vector a onto unit vector b
  function qFromTo(a, b) {
    const d = v.dot(a, b);
    if (d > 0.99999) return [1, 0, 0, 0];
    if (d < -0.99999) return q.axis(CK.perp(a), Math.PI);
    return q.axis(v.cross(a, b), Math.acos(d));
  }

  // Build a cyclohexane model. colour: "axeq" | "updown" | "none"; ids carries
  // a fixed identity for each hydrogen ("which face", "axial at start").
  function cyclohexane(psiH, psiF, colour = "axeq", startAxial) {
    const P = ringSix(psiH, psiF);
    const subs = ringSubstituents(P);
    const atoms = P.map((p) => ({ el: "C", p })), bonds = P.map((_, i) => [i, (i + 1) % 6]);
    subs.forEach((s, i) => {
      ["up", "down"].forEach((face) => {
        const isAxialNow = s.axial === face;
        const wasAxial = startAxial ? startAxial[i] === face : isAxialNow;
        let fill;
        if (colour === "axeq") fill = wasAxial ? AX : EQ;
        else if (colour === "updown") fill = face === "up" ? UP : DOWN;
        atoms.push({ el: "H", p: face === "up" ? s.upPos : s.downPos, fill, hi: fill ? "#ffffff" : undefined, face, axial: isAxialNow });
        bonds.push([i, atoms.length - 1]);
      });
    });
    return { atoms, bonds, subs, P };
  }
  const START = ringSubstituents(ringSix(CHAIR_PSI, -CHAIR_PSI)).map((s) => s.axial);
  const AXIS = ringSubstituents(ringSix(CHAIR_PSI, -CHAIR_PSI))[0].N;
  // orientations relative to the ring axis
  const toUp = qFromTo(AXIS, [0, 1, 0]);
  const SIDE = q.mul(q.axis([1, 0, 0], 16 * DEG), q.mul(q.axis([0, 1, 0], -20 * DEG), toUp));
  const TOP = q.mul(q.axis([1, 0, 0], 75 * DEG), toUp);
  const NEWMAN = q.view(90, 0); // look along the seat bonds C1–C2 and C5–C4 (the x axis)

  // ---------- hero ----------
  (function () {
    const m = cyclohexane(CHAIR_PSI, -CHAIR_PSI, "axeq");
    const view = new Viewer(document.getElementById("heroChair"), { orient: SIDE, autoSpin: 0.4, spinAxis: [0, 1, 0], extent: 2.6 });
    view.setModel(m.atoms, m.bonds);
  })();

  // ---------- explorer ----------
  (function () {
    const view = new Viewer(document.getElementById("chair3d"), { orient: SIDE, extent: 2.5 });
    const tag = document.getElementById("chairTag"), cap = document.getElementById("chairCap");
    let colour = "axeq", vw = "side";
    const CAPS = {
      axeq: '<b class="c-coral">Red</b>: the six axial hydrogens, parallel to the ring\'s axis. <b class="c-blue">Blue</b>: the six equatorial hydrogens, fanned out round the equator.',
      updown: '<b class="c-gold">Gold</b>: hydrogens on the top face of the ring. <b class="c-violet">Violet</b>: hydrogens on the bottom face. Every carbon has one of each.',
      none: "All twelve hydrogens look alike here — but they aren't. Switch the colouring back on to see the two kinds.",
    };
    const TAGS = { side: "side view", top: "from above, down the ring's axis", newman: "looking along two parallel C–C bonds: both staggered" };
    function build() { const m = cyclohexane(CHAIR_PSI, -CHAIR_PSI, colour); view.setModel(m.atoms, m.bonds); cap.innerHTML = CAPS[colour]; tag.textContent = TAGS[vw]; }
    document.querySelectorAll("[data-view]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("[data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      vw = b.dataset.view; view.turnTo(vw === "side" ? SIDE : vw === "top" ? TOP : NEWMAN, 1300); tag.textContent = TAGS[vw];
    }));
    document.querySelectorAll("[data-col]").forEach((b) => b.addEventListener("click", () => {
      document.querySelectorAll("[data-col]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      colour = b.dataset.col; build();
    }));
    build();
  })();

  // ---------- step-by-step drawing ----------
  (function () {
    const svg = document.getElementById("drawChair");
    const cap = document.getElementById("drawCap"), stepOut = document.getElementById("drawStep");
    const m = cyclohexane(CHAIR_PSI, -CHAIR_PSI, "none");
    // orthographic projection: axis vertical, viewed from slightly above,
    // head (atom 0) at the left and foot (atom 3) at the right
    const N = AXIS;
    const ex0 = v.norm(v.sub(m.P[3], m.P[0]));
    let ex = v.norm(v.sub(ex0, v.mul(N, v.dot(ex0, N))));
    const yaw = -15 * DEG, elev = 14 * DEG; // the angle textbooks draw it from
    ex = v.add(v.mul(ex, Math.cos(yaw)), v.mul(v.cross(ex, N), Math.sin(yaw)));
    const depth = v.cross(ex, N);
    const pr = (p) => [v.dot(p, ex), -(v.dot(p, N) * Math.cos(elev) + v.dot(p, depth) * Math.sin(elev))];
    const ring2 = m.P.map(pr);
    // axial bonds drawn exactly along the axis (so exactly vertical)
    const subs = m.subs.map((s) => ({ ax: pr(v.add(s.C, v.mul(N, s.axial === "up" ? CK.CH : -CK.CH))), eq: pr(s.axial === "up" ? s.downPos : s.upPos) }));
    // fit to the viewBox
    const all = ring2.concat(...subs.map((s) => [s.ax, s.eq]));
    const xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
    const W = 620, H = 330, pad = 34;
    const sc = Math.min((W - 2 * pad) / (Math.max(...xs) - Math.min(...xs)), (H - 2 * pad) / (Math.max(...ys) - Math.min(...ys)));
    const ox = (W - sc * (Math.max(...xs) + Math.min(...xs))) / 2, oy = (H - sc * (Math.max(...ys) + Math.min(...ys))) / 2;
    const T = (p) => [ox + sc * p[0], oy + sc * p[1]];
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const R = ring2.map(T), S = subs.map((s) => ({ ax: T(s.ax), eq: T(s.eq) }));
    // which bonds are the "two parallel lines": the seat edges 1–2 and 4–5
    const STEPS = [
      "Draw two parallel lines, sloping gently and offset from each other. These are two opposite C–C bonds (the edges of the chair's seat).",
      "Join the ends: a “V” at one end makes the headrest, pointing up; an upside-down “V” at the other makes the footrest, pointing down. Check: opposite bonds of the ring are parallel — three pairs.",
      "Axial bonds are vertical. At each corner that points up, draw the axial bond straight up; at each corner that points down, straight down. They alternate round the ring.",
      "Equatorial bonds point outwards, each one parallel to the ring bonds once removed from it (highlighted in matching colours). Never horizontal, never inside the ring.",
      "Done. Every carbon has one axial (red) and one equatorial (blue) bond — one pointing up, one pointing down.",
    ];
    let step = 0;
    const line = (g, a, b, color, w, extra = {}) => el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: color, "stroke-width": w, "stroke-linecap": "round", ...extra }, g);
    const PAIR_COLS = ["#5bd6a2", "#ff8fc7", "#f4b942"];
    function draw() {
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      const ringCol = "#eef0ff";
      const seat = [[1, 2], [4, 5]], ends = [[0, 1], [5, 0], [2, 3], [3, 4]];
      seat.forEach(([i, j]) => line(g, R[i], R[j], step === 0 ? "#f4b942" : ringCol, 5));
      if (step >= 1) ends.forEach(([i, j]) => line(g, R[i], R[j], step === 1 ? "#f4b942" : ringCol, 5));
      if (step >= 2) S.forEach((s, i) => line(g, R[i], s.ax, AX, 4));
      if (step >= 3) {
        S.forEach((s, i) => {
          // the ring bonds parallel to this equatorial bond: (i+1)–(i+2) and (i+4)–(i+5)
          const col = PAIR_COLS[i % 3];
          line(g, R[i], s.eq, step === 3 ? col : EQ, 4);
        });
        if (step === 3) {
          // colour each ring bond by the pair of equatorial bonds it's parallel to
          for (let i = 0; i < 6; i++) {
            const a = (i + 1) % 6, b = (i + 2) % 6; // ring bond a–b is parallel to equatorial on i and on i+3
            line(g, R[a], R[b], PAIR_COLS[i % 3], 5);
          }
        }
      }
      R.forEach((p, i) => el("circle", { cx: p[0], cy: p[1], r: step >= 1 || i === 1 || i === 2 || i === 4 || i === 5 ? 5 : 0, fill: "#eef0ff" }, g));
      if (step >= 1) {
        // the tips of the chair: left- and right-most carbons
        const iL = R.reduce((b, p, i) => (p[0] < R[b][0] ? i : b), 0), iR = R.reduce((b, p, i) => (p[0] > R[b][0] ? i : b), 0);
        [[iL, "end", -16], [iR, "start", 16]].forEach(([i, anc, dx]) => {
          const up = R[i][1] < (R[(i + 1) % 6][1] + R[(i + 5) % 6][1]) / 2;
          const t = el("text", { x: R[i][0] + dx, y: R[i][1] + 4, "text-anchor": anc, fill: "#8f97c4", "font-size": 13, "font-weight": 800 }, g);
          t.textContent = up ? "headrest (up)" : "footrest (down)";
        });
      }
      cap.textContent = STEPS[step];
      stepOut.textContent = step + 1 + " / " + STEPS.length;
      document.getElementById("drawPrev").disabled = step === 0;
      document.getElementById("drawNext").disabled = step === STEPS.length - 1;
    }
    document.getElementById("drawPrev").addEventListener("click", () => { step = Math.max(0, step - 1); draw(); });
    document.getElementById("drawNext").addEventListener("click", () => { step = Math.min(STEPS.length - 1, step + 1); draw(); });
    draw();
  })();

  // ---------- ring flip ----------
  (function () {
    const slider = document.getElementById("flipS"), tag = document.getElementById("flipTag"), play = document.getElementById("flipPlay");
    const svg = document.getElementById("flipPlot");
    // schematic energy profile through these way-points (s, kJ/mol, name)
    const K = [[0, 0, "chair"], [0.17, 45, "half-chair"], [0.36, 23, "twist-boat"], [0.5, 30, "boat"], [0.64, 23, "twist-boat"], [0.83, 45, "half-chair"], [1, 0, "chair"]];
    const E = (s) => {
      for (let i = 0; i < K.length - 1; i++) {
        if (s <= K[i + 1][0]) { const t = (s - K[i][0]) / (K[i + 1][0] - K[i][0]); const u = t * t * (3 - 2 * t); return K[i][1] + (K[i + 1][1] - K[i][1]) * u; }
      }
      return 0;
    };
    const nameAt = (s) => { let best = K[0], d = 9; K.forEach((k) => { const dd = Math.abs(k[0] - s); if (dd < d) { d = dd; best = k; } }); return d < 0.05 ? best[2] : "on the way…"; };
    const plot = CK.energyPlot(svg, {
      f: E, xmin: 0, xmax: 1, ymin: 0, ymax: 52, width: 520, height: 400,
      xticks: [], yticks: [0, 10, 20, 30, 40, 50], xlabel: "ring-flip progress →", ylabel: "energy, kJ/mol", color: "#5bd6a2", fill: "#5bd6a214",
      labels: [{ x: 0, text: "", dy: -14 }, { x: 0.17, text: "half-chair", dy: -12 }, { x: 0.36, text: "twist-boat", dy: 22 }, { x: 0.5, text: "boat", dy: -12 },
        { x: 0.64, text: "twist-boat", dy: 22 }, { x: 0.83, text: "half-chair", dy: -12 }],
      onPick: (x) => { anim = null; s = x; update(); },
    });
    // chair labels at the ends
    const lab = (x, t) => { const e = CK.el("text", { x: plot.X(x), y: plot.Y(0) - 12, "text-anchor": x ? "end" : "start", fill: "#5bd6a2", "font-size": 12, "font-weight": 800 }, plot.g); e.textContent = t; };
    lab(0, "chair"); lab(1, "flipped chair");
    let s = 0, anim = null;
    const view = new Viewer(document.getElementById("flip3d"), { orient: SIDE, extent: 2.6,
      onFrame() { if (!anim) return false; const t = Math.min(1, (performance.now() - anim.t0) / 4200); s = anim.a + (anim.b - anim.a) * t; if (t >= 1) anim = null; update(); } });
    function psi(s) {
      const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
      const foot = -CHAIR_PSI + 2 * CHAIR_PSI * sm(s / 0.5);
      const head = CHAIR_PSI - 2 * CHAIR_PSI * sm((s - 0.5) / 0.5);
      return [head, foot];
    }
    function update() {
      const [h, f] = psi(s);
      const m = cyclohexane(h, f, "axeq", START);
      view.setModel(m.atoms, m.bonds);
      plot.setX(s);
      slider.value = Math.round(s * 1000);
      tag.textContent = s < 0.02 ? "chair — red hydrogens axial" : s > 0.98 ? "flipped chair — red hydrogens now equatorial" : nameAt(s) + " · " + E(s).toFixed(0) + " kJ/mol";
      play.textContent = s > 0.98 ? "◀ Flip it back" : "▶ Flip it";
    }
    slider.addEventListener("input", () => { anim = null; s = slider.value / 1000; update(); });
    play.addEventListener("click", () => {
      const target = s > 0.5 ? 0 : 1;
      if (CK.reduceMotion()) { s = target; update(); return; }
      anim = { a: s, b: target, t0: performance.now() }; view.dirty = true;
    });
    update();
  })();
})();
