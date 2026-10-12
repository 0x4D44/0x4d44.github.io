/* Particles and Waves — the signal deck's simulations.
   Constants from the data sheet: e = 1.60 × 10⁻¹⁹ C, h = 6.63 × 10⁻³⁴ J s,
   c = 3.00 × 10⁸ m s⁻¹, mₑ = 9.11 × 10⁻³¹ kg, mₚ = 1.673 × 10⁻²⁷ kg. */
(function () {
  "use strict";
  const HP = window.HP;
  const $ = (id) => document.getElementById(id);
  const F = HP.fmt;
  const e = 1.6e-19, h = 6.63e-34, c = 3e8, me = 9.11e-31, mp = 1.673e-27, mn = 1.675e-27;
  function mount(id, fn) { const box = $(id); if (!box) return; try { fn(box); } catch (err) { console.error(id, err); } }
  function canvasIn(box, cls, label) { const cv = HP.el("canvas", { class: "sim" + (cls ? " " + cls : ""), role: "img", "aria-label": label || "" }); box.append(cv); return cv; }
  const readouts = (box, items) => {
    const wrap = HP.el("div", { class: "readouts", "aria-live": "polite" }); const map = {};
    items.forEach(([k, label]) => { const b = HP.el("b"); map[k] = b; wrap.append(HP.el("div", null, b, HP.el("span", { html: label }))); });
    box.append(wrap); return map;
  };
  const px = (ctx, x, y, w, hh, col) => { ctx.fillStyle = col; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(hh)); };
  const font = (s, b) => `${b ? "bold " : ""}${s}px "Atkinson Hyperlegible", system-ui, sans-serif`;
  const PARTICLES = {
    electron: { q: -e, m: me, name: "electron", sym: "e⁻", col: "#1c5fb3" },
    proton: { q: e, m: mp, name: "proton", sym: "p", col: "#b3261e" },
    alpha: { q: 2 * e, m: 4 * 1.661e-27 * 1.0015, name: "alpha particle", sym: "α", col: "#8a6510" },
  };

  /* =====================================================================
     1. A charge accelerated between parallel plates: W = QV = ½mv²
     ===================================================================== */
  mount("w-plates", (box) => {
    let kind = "electron";
    HP.choice(box, "Particle:", [["electron", "electron"], ["proton", "proton"], ["alpha", "alpha particle"]], kind, (v) => { kind = v; restart(); });
    const cv = canvasIn(box, "", "Two parallel plates with a uniform electric field between them. A charged particle starts at rest beside one plate and accelerates across to the other.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sV = HP.slider(ctr, { label: "Potential difference between the plates", min: 100, max: 5000, step: 100, value: 2000, unit: "V", oninput: () => restart() });
    const R = readouts(box, [["W", "work done W = QV (gained as E<sub>k</sub>)"], ["v", "speed on arrival v = √(2QV / m)"], ["vc", "as a fraction of c"]]);
    let run = 0;
    function restart() { run = 0; sim.t = 0; if (!sim.playing) sim.play(); }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 230 : 250),
      draw(ctx, t, dt, C, S) {
        const P = PARTICLES[kind], V = sV.value, Q = Math.abs(P.q);
        const W = Q * V, v = Math.sqrt(2 * W / P.m);
        R.W.textContent = `${F(Q, 3)} × ${V} = ${F(W, 3)} J`;
        R.v.textContent = F(v, 3) + " m s⁻¹"; R.vc.textContent = (v / c).toFixed(3) + " c";
        const L = 40, Rr = S.w - 40, top = 36, bot = S.h - 40;
        // positive plate is where the particle must be pushed away from: a positive particle starts at the + plate
        const posLeft = P.q > 0;
        px(ctx, L - 12, top, 12, bot - top, posLeft ? "#b3261e" : "#1c5fb3");
        px(ctx, Rr, top, 12, bot - top, posLeft ? "#1c5fb3" : "#b3261e");
        HP.label(ctx, posLeft ? "+" : "−", L - 6, top - 14, { size: 18, bold: true, align: "center" });
        HP.label(ctx, posLeft ? "−" : "+", Rr + 6, top - 14, { size: 18, bold: true, align: "center" });
        // field lines: from + to −
        for (let k = 0; k < 6; k++) {
          const y = top + 16 + k * (bot - top - 32) / 5;
          ctx.strokeStyle = C.line; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(L + 4, y); ctx.lineTo(Rr - 4, y); ctx.stroke();
          const mid = (L + Rr) / 2;
          HP.arrow(ctx, mid - 10 * (posLeft ? 1 : -1), y, mid + 10 * (posLeft ? 1 : -1), y, C.muted, 1.5, 8);
        }
        // motion with constant acceleration: x = ½ a t², animation time scaled to 2 s per crossing
        const T = 1.6, f = Math.min(1, (t % (T + 1)) / T);
        const x = L + 10 + (Rr - L - 20) * f * f;
        const y = (top + bot) / 2;
        ctx.fillStyle = P.col; ctx.beginPath(); ctx.arc(x, y, kind === "alpha" ? 9 : 7, 0, 7); ctx.fill();
        HP.label(ctx, P.sym, x, y + 1, { size: 11, bold: true, align: "center", col: "#fff", halo: false });
        HP.arrow(ctx, x + 12, y - 16, x + 12 + 40 * f + 4, y - 16, C.grass, 2);
        HP.label(ctx, `Eₖ = ${F(W * f * f, 2)} J`, x, y + 28, { size: 11, align: "center" }); // work done so far = F × distance, and distance ∝ t²
        HP.label(ctx, "electric field direction: + to −", S.w / 2, S.h - 14, { size: 11, align: "center", col: C.muted });
      },
      loop: true,
    });
  });

  /* =====================================================================
     2. A charge moving through a magnetic field (into the page)
     ===================================================================== */
  mount("w-magnetic", (box) => {
    let sign = 1;
    HP.choice(box, "Charge:", [["1", "positive (proton)"], ["-1", "negative (electron)"]], "1", (v) => { sign = +v; sim.t = 0; });
    const cv = canvasIn(box, "", "A charged particle enters a region of magnetic field directed into the screen and is pushed into a circular path, upwards for a positive charge and downwards for a negative charge.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sB = HP.slider(ctr, { label: "Magnetic field strength (relative)", min: 0.4, max: 2, step: 0.1, value: 1, fmt: (v) => v.toFixed(1) + " ×" });
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const fieldX = S.w * 0.32;
        // field region: crosses (into page)
        ctx.fillStyle = C.paper2; ctx.fillRect(fieldX, 0, S.w - fieldX, S.h);
        ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5;
        for (let x = fieldX + 20; x < S.w; x += 34) for (let y = 18; y < S.h; y += 34) { ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); }
        HP.label(ctx, "× magnetic field into the screen", fieldX + 8, S.h - 10, { size: 11, haloCol: C.paper2 });
        const v = 120; // px/s
        const R = Math.min(S.h * 0.4, 150) / sB.value;
        const y0 = S.h / 2;
        const T = (fieldX - 20) / v + Math.PI * R / v + 1.5;
        const tt = t % T;
        let x, y, vx, vy;
        const tIn = (fieldX - 20) / v;
        // canvas y grows downwards: a positive charge moving right in B (into page) is pushed UP the screen
        const dir = -sign; // −1 → up the screen
        if (tt < tIn) { x = 20 + v * tt; y = y0; vx = v; vy = 0; }
        else {
          const ang = (tt - tIn) * v / R;
          if (ang < Math.PI) { x = fieldX + R * Math.sin(ang); y = y0 + dir * R * (1 - Math.cos(ang)); vx = v * Math.cos(ang); vy = dir * v * Math.sin(ang); }
          else { const t2 = (tt - tIn) - Math.PI * R / v; x = fieldX - v * t2; y = y0 + dir * 2 * R; vx = -v; vy = 0; }
        }
        // trail
        ctx.strokeStyle = sign > 0 ? "#b3261e" : "#1c5fb3"; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(20, y0);
        for (let s2 = 0; s2 <= tt; s2 += 0.02) {
          let xx, yy;
          if (s2 < tIn) { xx = 20 + v * s2; yy = y0; } else { const a2 = (s2 - tIn) * v / R; if (a2 < Math.PI) { xx = fieldX + R * Math.sin(a2); yy = y0 + dir * R * (1 - Math.cos(a2)); } else { xx = fieldX - v * ((s2 - tIn) - Math.PI * R / v); yy = y0 + dir * 2 * R; } }
          ctx.lineTo(xx, yy);
        }
        ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = sign > 0 ? "#b3261e" : "#1c5fb3"; ctx.beginPath(); ctx.arc(x, y, 8, 0, 7); ctx.fill();
        HP.label(ctx, sign > 0 ? "+" : "−", x, y + 1, { size: 13, bold: true, align: "center", col: "#fff", halo: false });
        HP.arrow(ctx, x, y, x + vx * 0.3, y + vy * 0.3, C.grass, 2.5);
        if (x > fieldX && tt > tIn && tt < tIn + Math.PI * R / v) {
          // force towards the centre of the circle
          const cx = fieldX, cy = y0 + dir * R;
          const d = Math.hypot(cx - x, cy - y);
          HP.arrow(ctx, x, y, x + (cx - x) / d * 34, y + (cy - y) / d * 34, C.gold, 2.5);
        }
        HP.label(ctx, "green: velocity · gold: magnetic force", 10, 14, { size: 11, col: C.ink2 });
        const txt = sign > 0
          ? "Positive charge moving right, field into the screen: the force is up the screen (left-hand rule: First finger Field, seCond finger the motion of the positive charge, thuMb the force). The force is always at right angles to the motion, so it changes the direction, not the speed."
          : "Negative charge moving right, field into the screen: the force is down the screen, the opposite way to a positive charge (right-hand rule: First finger Field, seCond finger the motion of the electron, thuMb the force).";
        if (note.textContent !== txt) note.textContent = txt;
      },
      loop: true,
    });
  });

  /* =====================================================================
     3. A ring accelerator: electric fields accelerate, magnets steer, beams collide
     ===================================================================== */
  mount("w-ring", (box) => {
    const cv = canvasIn(box, "dark", "A circular particle accelerator. Two beams circulate in opposite directions; they gain energy each time they pass through the accelerating cavity, are steered by bending magnets, and collide inside the detector.");
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    let lap = 0;
    const sim = HP.sim(cv, {
      height: (w) => Math.min(380, w * 0.75),
      draw(ctx, t, dt, C, S) {
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        const cx = S.w / 2, cy = S.h / 2, R = Math.min(S.w, S.h) * 0.36;
        ctx.strokeStyle = "#55607a"; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
        // bending magnets (blue blocks) around the ring
        for (let k = 0; k < 12; k++) {
          const a = k / 12 * 2 * Math.PI + Math.PI / 12;
          if (k === 0 || k === 6) continue;
          ctx.save(); ctx.translate(cx + R * Math.cos(a), cy + R * Math.sin(a)); ctx.rotate(a); px(ctx, -8, -12, 16, 24, "#1c5fb3"); ctx.restore();
        }
        // RF cavity at the top (a = -π/2), detector at the bottom (a = +π/2)
        ctx.save(); ctx.translate(cx, cy - R); px(ctx, -20, -14, 40, 28, "#b3261e"); ctx.restore();
        ctx.save(); ctx.translate(cx, cy + R); px(ctx, -26, -26, 52, 52, "#8a6510"); px(ctx, -18, -18, 36, 36, "#e0b23a"); ctx.restore();
        HP.label(ctx, "accelerating cavity (electric field)", cx, cy - R - 26, { size: 11, align: "center", col: "#ffb3aa", halo: false });
        HP.label(ctx, "detector", cx, cy + R + 38, { size: 11, align: "center", col: "#ffd65a", halo: false });
        HP.label(ctx, "bending magnets", cx + R + 14, cy, { size: 11, col: "#9fd0ff", halo: false, align: S.w - cx - R > 110 ? "left" : "right" });
        // two beams, opposite directions, speeding up each lap
        const period = Math.max(1.2, 4 - lap * 0.5);
        const phase = (t / period) % 1;
        const newLap = Math.floor(t / period);
        if (newLap !== lap) lap = Math.min(newLap, 6);
        const aCW = -Math.PI / 2 + phase * 2 * Math.PI, aCCW = -Math.PI / 2 - phase * 2 * Math.PI;
        const col = (k) => k ? "#ff9b8f" : "#9fd0ff";
        [aCW, aCCW].forEach((a, k) => {
          for (let j = 0; j < 6; j++) { const aa = a - (k ? -1 : 1) * j * 0.05; ctx.globalAlpha = 1 - j * 0.15; ctx.fillStyle = col(k); ctx.beginPath(); ctx.arc(cx + R * Math.cos(aa), cy + R * Math.sin(aa), 4, 0, 7); ctx.fill(); }
          ctx.globalAlpha = 1;
        });
        // collision flash when both reach the detector (phase 0.5) on the last laps
        if (lap >= 4 && Math.abs(phase - 0.5) < 0.06) {
          for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * Math.PI; HP.arrow(ctx, cx, cy + R, cx + Math.cos(a) * 34, cy + R + Math.sin(a) * 34, k % 2 ? "#ffd65a" : "#8cc96a", 1.5, 5); }
        }
        const energy = Math.min(lap + 1, 7);
        const txt = lap < 4 ? `Lap ${lap + 1}: each time the beams pass through the cavity, its electric field does work on them (W = QV), so they speed up. The magnets bend their paths into a circle and must get stronger as the beams gain energy.`
          : "Full energy: the beams are steered into each other inside the detector. In the collision, kinetic energy becomes mass (E = mc²), and new particles fly out to be tracked.";
        if (note.textContent !== txt) note.textContent = txt;
        if (t > period * 9) { S.t = 0; lap = 0; }
      },
      loop: true,
    });
    box.append(HP.el("div", { class: "btn-row" }, HP.playButton(sim)), note);
  });

  /* =====================================================================
     4. Orders of magnitude: zoom from a quark to the edge of the Universe
     ===================================================================== */
  mount("w-scale", (box) => {
    const ITEMS = [
      [-18, "less than 10⁻¹⁸ m", "Quarks and electrons: no measurable size at all (smaller than 10⁻¹⁸ m)"],
      [-15, "10⁻¹⁵ m", "A proton or a neutron"],
      [-14, "10⁻¹⁴ m", "A large nucleus (uranium)"],
      [-10, "10⁻¹⁰ m", "An atom: the nucleus is 10 000 times smaller than the atom it sits in"],
      [-7, "10⁻⁷ m", "A virus; the wavelength of ultraviolet light"],
      [-6, "10⁻⁶ m", "A bacterium; the wavelength of visible light is about half this"],
      [-4, "10⁻⁴ m", "The width of a human hair"],
      [0, "10⁰ m = 1 m", "A Minecraft block; a cadet's stride"],
      [2, "10² m", "HMS Victory, about 70 m long; a football pitch"],
      [3, "10³ m", "Ben Nevis, 1345 m"],
      [7, "10⁷ m", "The diameter of the Earth, 1.3 × 10⁷ m"],
      [9, "10⁹ m", "The diameter of the Sun, 1.4 × 10⁹ m"],
      [11, "10¹¹ m", "The Earth–Sun distance, 1.5 × 10¹¹ m"],
      [13, "10¹³ m", "The Solar System out to Neptune, about 10¹³ m across"],
      [16, "10¹⁶ m", "One light-year, 9.46 × 10¹⁵ m"],
      [21, "10²¹ m", "The Milky Way galaxy, about 10²¹ m across"],
      [26, "10²⁶ m", "The furthest objects we can see: the observable Universe is about 9 × 10²⁶ m across"],
    ];
    const cv = canvasIn(box, "", "A logarithmic scale from 10 to the minus 18 metres to 10 to the 26 metres, with the selected object marked.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sI = HP.slider(ctr, { label: "Zoom", min: 0, max: ITEMS.length - 1, step: 1, value: 3, fmt: (i) => ITEMS[i][1], oninput: () => { sim.redraw(); out.textContent = ITEMS[sI.value][2]; } });
    const out = HP.el("p", { class: "sim-note", "aria-live": "polite" }, ITEMS[3][2]); box.append(out);
    const sim = HP.sim(cv, {
      height: () => 110,
      draw(ctx, t, dt, C, S) {
        const x0 = 20, x1 = S.w - 20, X = (p) => x0 + (p + 18) / 44 * (x1 - x0);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x0, 60); ctx.lineTo(x1, 60); ctx.stroke();
        for (let p = -18; p <= 26; p += 2) { ctx.beginPath(); ctx.moveTo(X(p), 54); ctx.lineTo(X(p), 66); ctx.stroke(); if (p % 6 === 0) HP.label(ctx, "10" + HP.sup(p), X(p), 82, { size: 11, align: "center" }); }
        ITEMS.forEach(([p], i) => { ctx.fillStyle = i === sI.value ? C.red : C.muted; ctx.beginPath(); ctx.arc(X(p), 60, i === sI.value ? 7 : 3.5, 0, 7); ctx.fill(); });
        const [p, lab] = ITEMS[sI.value];
        HP.label(ctx, lab, Math.min(Math.max(X(p), 60), S.w - 60), 32, { size: 13, bold: true, align: "center", col: C.red });
        HP.label(ctx, "sub-nuclear", X(-16), 100, { size: 10, align: "center", col: C.muted });
        HP.label(ctx, "human scale", X(0), 100, { size: 10, align: "center", col: C.muted });
        HP.label(ctx, "cosmic", X(22), 100, { size: 10, align: "center", col: C.muted });
      },
    });
  });

  /* =====================================================================
     5. The Standard Model particle board
     ===================================================================== */
  mount("w-sm", (box) => {
    const P = [
      ["q", "u", "up", "+⅔", "Quark. Two ups and a down make a proton."],
      ["q", "c", "charm", "+⅔", "Quark (second generation). Heavier copy of the up quark."],
      ["q", "t", "top", "+⅔", "Quark (third generation). The heaviest fundamental particle known, about as massive as a gold atom."],
      ["b", "g", "gluon", "0", "Boson. Carries the strong force that holds quarks together inside protons and neutrons (and holds the nucleus together)."],
      ["h", "H", "Higgs", "0", "Boson. Discovered at CERN in 2012; explains how particles get mass. Not needed for the course, but part of the Standard Model."],
      ["q", "d", "down", "−⅓", "Quark. One up and two downs make a neutron."],
      ["q", "s", "strange", "−⅓", "Quark (second generation). Heavier copy of the down quark."],
      ["q", "b", "bottom", "−⅓", "Quark (third generation). Heaviest copy of the down quark."],
      ["b", "γ", "photon", "0", "Boson. Carries the electromagnetic force. A particle of light."],
      ["b", "W", "W⁺ W⁻", "±1", "Bosons. Carry the weak force, responsible for beta decay."],
      ["l", "e", "electron", "−1", "Lepton. Orbits the nucleus in atoms; carries the current in wires."],
      ["l", "μ", "muon", "−1", "Lepton (second generation). A heavy electron that decays in about 2.2 μs (see special relativity)."],
      ["l", "τ", "tau", "−1", "Lepton (third generation). An even heavier electron."],
      ["b", "Z", "Z⁰", "0", "Boson. Also carries the weak force."],
      null,
      ["l", "νₑ", "electron neutrino", "0", "Lepton. Almost massless, no charge, barely interacts: billions pass through you every second. First predicted from beta decay."],
      ["l", "ν_μ", "muon neutrino", "0", "Lepton. Partner of the muon."],
      ["l", "ν_τ", "tau neutrino", "0", "Lepton. Partner of the tau."],
    ];
    const grid = HP.el("div", { class: "sm-grid" });
    const info = HP.el("p", { class: "sim-note sm-info", "aria-live": "polite" }, "Click a particle. Purple: quarks. Green: leptons. Brown: force-carrying bosons. Every one of them also has an antiparticle.");
    const btns = [];
    P.forEach((p) => {
      if (!p) { grid.append(HP.el("div")); return; }
      const [k, sym, name, q, txt] = p;
      const b = HP.el("button", { type: "button", class: "sm-p " + k, "aria-pressed": "false", html: `<b>${sym.replace("_μ", "<sub>μ</sub>").replace("_τ", "<sub>τ</sub>")}</b><small>${name}</small><small>charge ${q}</small>` });
      b.addEventListener("click", () => { btns.forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); info.innerHTML = `<b>${name}</b> (charge ${q}): ${txt}`; });
      btns.push(b); grid.append(b);
    });
    box.append(grid, info);
  });

  /* =====================================================================
     6. Build a hadron from quarks
     ===================================================================== */
  mount("w-quarks", (box) => {
    const Q = { u: 2 / 3, d: -1 / 3, s: -1 / 3, c: 2 / 3 };
    let bag = [];
    const bin = HP.el("div", { class: "quark-bin", "aria-live": "polite" });
    const out = HP.el("p", { class: "sim-note", "aria-live": "polite" });
    const row = HP.el("div", { class: "btn-row" });
    ["u", "d", "s", "c"].forEach((q) => {
      const b = HP.el("button", { type: "button", class: "quark-chip" }, q); b.addEventListener("click", () => add(q, false));
      const ab = HP.el("button", { type: "button", class: "quark-chip anti", "aria-label": "anti-" + q }, q); ab.addEventListener("click", () => add(q, true));
      row.append(b, ab);
    });
    const clr = HP.el("button", { type: "button", class: "btn small" }, "↺ Empty"); clr.addEventListener("click", () => { bag = []; render(); });
    row.append(clr);
    box.append(row, bin, out);
    function add(q, anti) { if (bag.length < 3) bag.push([q, anti]); render(); }
    function frac(x) {
      const n = Math.round(x * 3);
      if (n % 3 === 0) return (n / 3 > 0 ? "+" : "") + (n / 3) + "";
      return (n > 0 ? "+" : "−") + Math.abs(n) + "/3";
    }
    const NAMES = { "uud": "a proton (p)", "udd": "a neutron (n)", "uuu": "a Δ⁺⁺ baryon", "ddd": "a Δ⁻ baryon", "uds": "a Λ⁰ (lambda) baryon", "uus": "a Σ⁺ (sigma) baryon", "u|d": "a π⁺ (positive pion) meson", "d|u": "a π⁻ (negative pion) meson", "u|u": "a neutral pion (π⁰) meson", "d|d": "a neutral pion (π⁰) meson", "u|s": "a K⁺ (kaon) meson", "s|u": "a K⁻ (kaon) meson", "c|c": "a J/ψ meson" };
    function render() {
      bin.innerHTML = bag.length ? "" : "<span style='color:var(--muted);font-size:.9rem'>Add up to three quarks or antiquarks (the pale ones with a bar are antiquarks).</span>";
      bag.forEach(([q, anti]) => bin.append(HP.el("span", { class: "quark-chip" + (anti ? " anti" : "") }, q)));
      const charge = bag.reduce((s, [q, anti]) => s + (anti ? -1 : 1) * Q[q], 0);
      const nq = bag.filter((x) => !x[1]).length, na = bag.length - nq;
      let verdict;
      if (!bag.length) verdict = "";
      else if (bag.length === 3 && (nq === 3 || na === 3)) {
        const key = bag.map((x) => x[0]).sort((a, b) => "udsc".indexOf(a) - "udsc".indexOf(b)).join("");
        verdict = `Three ${na ? "antiquarks" : "quarks"}: a <b>${na ? "anti" : ""}baryon</b>, which is a kind of hadron. ${NAMES[key] && !na ? "This one is " + NAMES[key] + "." : na && NAMES[key] ? "This is the antiparticle of " + NAMES[key] + "." : ""}`;
      } else if (bag.length === 2 && nq === 1) {
        const qk = bag.find((x) => !x[1])[0], ak = bag.find((x) => x[1])[0];
        verdict = `A quark and an antiquark: a <b>meson</b>, which is a kind of hadron. ${NAMES[qk + "|" + ak] ? "This one is " + NAMES[qk + "|" + ak] + "." : ""}`;
      } else if (bag.length < 2 || (bag.length === 2 && nq !== 1)) verdict = bag.length === 1 ? "Quarks are never found on their own: add more." : "Two quarks (or two antiquarks) never bind: try one quark and one antiquark.";
      else verdict = "Not allowed: hadrons are three quarks (baryons), three antiquarks (antibaryons) or a quark–antiquark pair (mesons).";
      out.innerHTML = bag.length ? `Total charge: <b>${frac(charge)}</b>. ${verdict}` : "Hadrons are made of quarks. Try uud, then udd, then a u with an anti-d.";
    }
    render();
  });

  /* =====================================================================
     7. Fission and fusion: the missing mass
     ===================================================================== */
  mount("w-nuclear", (box) => {
    const u = 1.6605e-27;
    const R = {
      fusion: { before: [["²H", 2.014102], ["³H", 3.016049]], after: [["⁴He", 4.002603], ["n", 1.008665]], eq: "²₁H + ³₁H → ⁴₂He + ¹₀n" },
      fission: { before: [["²³⁵U", 235.043930], ["n", 1.008665]], after: [["¹⁴¹Ba", 140.914411], ["⁹²Kr", 91.926156], ["n", 1.008665], ["n", 1.008665], ["n", 1.008665]], eq: "²³⁵₉₂U + ¹₀n → ¹⁴¹₅₆Ba + ⁹²₃₆Kr + 3 ¹₀n" },
    };
    let key = "fusion";
    HP.choice(box, "Reaction:", [["fusion", "fusion (deuterium + tritium)"], ["fission", "induced fission of uranium-235"]], key, (v) => { key = v; sim.t = 0; upd(); });
    const cv = canvasIn(box, "", "Animation of a nuclear reaction with bar charts showing total mass before and after; the small missing mass is released as energy.");
    const Rd = readouts(box, [["mb", "total mass before"], ["ma", "total mass after"], ["dm", "mass lost Δm"], ["E", "energy released E = Δmc²"]]);
    function upd() {
      const r = R[key];
      const mb = r.before.reduce((s, x) => s + x[1], 0) * u, ma = r.after.reduce((s, x) => s + x[1], 0) * u;
      Rd.mb.textContent = F(mb, 6) + " kg"; Rd.ma.textContent = F(ma, 6) + " kg";
      Rd.dm.textContent = F(mb - ma, 3) + " kg"; Rd.E.textContent = F((mb - ma) * c * c, 3) + " J";
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 250 : 230),
      draw(ctx, t, dt, C, S) {
        const r = R[key];
        const T = 4, tt = t % (T + 1.5), f = Math.min(1, tt / T);
        const cx = S.w * (S.w < 560 ? 0.5 : 0.36), cy = 92;
        const nucleus = (x, y, nP, nN, rad) => {
          const n = nP + nN, k = Math.min(n, 40);
          for (let i = 0; i < k; i++) { const a = i * 2.4, rr = rad * Math.sqrt(i / k); ctx.fillStyle = i < k * nP / n ? "#b3261e" : "#7d86a0"; ctx.beginPath(); ctx.arc(x + rr * Math.cos(a), y + rr * Math.sin(a), 4.2, 0, 7); ctx.fill(); }
        };
        if (key === "fusion") {
          if (f < 0.5) { const d = (1 - f * 2) * 110; nucleus(cx - d - 8, cy, 1, 1, 7); nucleus(cx + d + 8, cy, 1, 2, 9); }
          else {
            const g = (f - 0.5) * 2; nucleus(cx - g * 40, cy, 2, 2, 10);
            ctx.fillStyle = "#7d86a0"; ctx.beginPath(); ctx.arc(cx + 20 + g * 140, cy - g * 20, 4.5, 0, 7); ctx.fill();
            if (g < 0.4) { ctx.fillStyle = `rgba(255,214,90,${0.9 - g * 2})`; ctx.beginPath(); ctx.arc(cx, cy, 20 + g * 120, 0, 7); ctx.fill(); }
          }
        } else {
          if (f < 0.35) { nucleus(cx, cy, 30, 40, 26); ctx.fillStyle = "#7d86a0"; ctx.beginPath(); ctx.arc(cx - 150 + f / 0.35 * 120, cy, 4.5, 0, 7); ctx.fill(); }
          else {
            const g = (f - 0.35) / 0.65;
            nucleus(cx - 20 - g * 90, cy - 10 - g * 20, 22, 30, 20); nucleus(cx + 20 + g * 90, cy + 8 + g * 20, 14, 20, 16);
            [[1, -1], [1.2, 0.3], [-0.2, 1]].forEach(([a, b2]) => { ctx.fillStyle = "#7d86a0"; ctx.beginPath(); ctx.arc(cx + a * g * 150, cy + b2 * g * 60, 4.5, 0, 7); ctx.fill(); });
            if (g < 0.35) { ctx.fillStyle = `rgba(255,214,90,${0.9 - g * 2.5})`; ctx.beginPath(); ctx.arc(cx, cy, 30 + g * 140, 0, 7); ctx.fill(); }
          }
        }
        HP.label(ctx, r.eq, cx, 18, { size: 14, bold: true, align: "center" });
        // mass bars (zoomed in on the top so the tiny difference is visible)
        const mb = r.before.reduce((s, x) => s + x[1], 0), ma = r.after.reduce((s, x) => s + x[1], 0);
        const bx = S.w < 560 ? 20 : S.w * 0.72, by = S.w < 560 ? 160 : 40, bw = S.w < 560 ? S.w - 40 : S.w * 0.25, bh = S.w < 560 ? 70 : 160;
        if (S.w < 560) {
          const scale = (m) => (m - ma * 0.995) / (mb - ma * 0.995) * (bw - 70);
          px(ctx, bx + 60, by, scale(mb), 18, C.sea); px(ctx, bx + 60, by + 28, scale(ma), 18, C.red);
          HP.label(ctx, "before", bx, by + 9, { size: 11 }); HP.label(ctx, "after", bx, by + 37, { size: 11 });
          HP.label(ctx, "(bars zoomed: only the top 0.5% of the mass is shown)", bx, by + 62, { size: 10, col: C.muted });
        } else {
          const scale = (m) => (m - ma * 0.995) / (mb - ma * 0.995) * (bh - 30);
          px(ctx, bx + 10, by + bh - scale(mb), bw / 2 - 20, scale(mb), C.sea);
          px(ctx, bx + bw / 2 + 10, by + bh - scale(ma), bw / 2 - 20, scale(ma), C.red);
          HP.label(ctx, "mass before", bx + bw / 4, by + bh + 12, { size: 11, align: "center" });
          HP.label(ctx, "mass after", bx + bw * 0.75, by + bh + 12, { size: 11, align: "center" });
          HP.label(ctx, "top 0.5% of the bars only", bx + bw / 2, by - 10, { size: 10, align: "center", col: C.muted });
          ctx.strokeStyle = C.gold; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(bx + bw / 2 + 10, by + bh - scale(mb)); ctx.lineTo(bx + bw - 10, by + bh - scale(mb)); ctx.stroke(); ctx.setLineDash([]);
          HP.label(ctx, "Δm", bx + bw - 14, by + bh - (scale(mb) + scale(ma)) / 2, { size: 12, bold: true, align: "right", col: C.gold });
        }
      },
      loop: true,
    });
    upd();
  });

  /* =====================================================================
     8. The inverse square law: the signal lantern and a light meter
     ===================================================================== */
  mount("w-inverse", (box) => {
    const cv = canvasIn(box, "", "A lamp's light spreads over a larger area further away: at twice the distance it covers four squares, at three times the distance nine squares. A graph shows irradiance against distance.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sD = HP.slider(ctr, { label: "Distance from the lamp d", min: 0.5, max: 3, step: 0.1, value: 1, unit: "m", fmt: (v) => v.toFixed(1), oninput: () => sim.redraw() });
    let graph = "d";
    HP.choice(box, "Plot irradiance against:", [["d", "d"], ["inv", "1/d²"]], "d", (v) => { graph = v; sim.redraw(); });
    const R = readouts(box, [["I", "irradiance I (lamp gives 0.80 W m⁻² at 1.0 m)"], ["Id2", "I × d² (the constant k)"]]);
    const k = 0.8;
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 440 : 260),
      draw(ctx, t, dt, C, S) {
        const d = sD.value, I = k / (d * d);
        R.I.textContent = F(I, 3) + " W m⁻²"; R.Id2.textContent = F(I * d * d, 3) + " W";
        const narrow = S.w < 560;
        const sc = narrow ? { x: 0, y: 0, w: S.w, h: 200 } : { x: 0, y: 0, w: S.w * 0.55, h: S.h };
        ctx.fillStyle = "#0d1424"; ctx.fillRect(sc.x, sc.y, sc.w, sc.h);
        const lx = sc.x + 30, ly = sc.y + sc.h / 2;
        // lantern
        px(ctx, lx - 10, ly - 14, 20, 28, "#e0b23a"); px(ctx, lx - 6, ly - 10, 12, 20, "#fff6c8"); px(ctx, lx - 12, ly - 18, 24, 4, "#555"); px(ctx, lx - 12, ly + 14, 24, 4, "#555");
        const pxPerM = (sc.w - 70) / 3;
        const xs = lx + d * pxPerM;
        // the cone of light through a 1×1 window at 1 m
        const half = 16; // half-size of the 1 m square, in px at d = 1
        ctx.fillStyle = "rgba(255,240,170,.18)"; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(xs, ly - half * d); ctx.lineTo(xs, ly + half * d); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "rgba(255,240,170,.6)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(xs, ly - half * d); ctx.moveTo(lx, ly); ctx.lineTo(xs, ly + half * d); ctx.stroke();
        // grid at distance d, seen face-on in perspective: draw n×n squares
        const n = d;
        ctx.strokeStyle = "#ffd65a"; ctx.lineWidth = 2; ctx.strokeRect(xs - 3, ly - half * d, 6, 2 * half * d);
        // face-on inset showing how many 1 m-at-1 m squares the light covers
        const inset = { x: sc.x + sc.w - 92, y: sc.y + 10, s: 80 };
        px(ctx, inset.x - 4, inset.y - 4, inset.s + 8, inset.s + 22, "rgba(255,255,255,.08)");
        const cell = inset.s / 3;
        const lit = d * cell;
        ctx.fillStyle = "rgba(255,240,170,.55)"; ctx.fillRect(inset.x + (inset.s - lit) / 2, inset.y + (inset.s - lit) / 2, lit, lit);
        ctx.strokeStyle = "rgba(255,255,255,.35)"; ctx.lineWidth = 1;
        for (let i = 0; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(inset.x + i * cell, inset.y); ctx.lineTo(inset.x + i * cell, inset.y + inset.s); ctx.moveTo(inset.x, inset.y + i * cell); ctx.lineTo(inset.x + inset.s, inset.y + i * cell); ctx.stroke(); }
        HP.label(ctx, `area × ${(d * d).toFixed(2)}`, inset.x + inset.s / 2, inset.y + inset.s + 10, { size: 11, align: "center", col: "#ffd65a", halo: false });
        // light meter
        px(ctx, xs + 4, ly - 12, 18, 24, "#333"); px(ctx, xs + 7, ly - 8, 12, 8, "#9fd0ff");
        HP.label(ctx, `d = ${d.toFixed(1)} m`, xs, ly + half * d + 16 > sc.h - 6 ? sc.h - 8 : ly + half * d + 16, { size: 11, align: "center", col: "#fff", halo: false });
        HP.label(ctx, "Signal lantern (a point source)", sc.x + 8, sc.y + sc.h - 10, { size: 10, col: "#cfd6e6", halo: false });
        // graph
        const gb = narrow ? { x: 52, y: sc.h + 24, w: S.w - 68, h: S.h - sc.h - 56 } : { x: sc.w + 58, y: 20, w: S.w - sc.w - 72, h: S.h - 56 };
        if (graph === "d") {
          const ax = HP.plot(ctx, gb, { x0: 0, x1: 3, y0: 0, y1: 3.2, xt: 0.5, yt: 0.8, xl: "d / m", yl: "I / W m⁻²", C, fs: 11 });
          ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath();
          for (let x = 0.5; x <= 3.001; x += 0.02) { const y = k / (x * x); x > 0.5 ? ctx.lineTo(ax.X(x), ax.Y(y)) : ctx.moveTo(ax.X(x), ax.Y(y)); }
          ctx.stroke(); ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(ax.X(d), ax.Y(I), 5, 0, 7); ctx.fill();
          HP.label(ctx, "a curve: hard to prove it is inverse square", gb.x + gb.w, gb.y + 12, { size: 10, align: "right", col: C.muted });
        } else {
          const ax = HP.plot(ctx, gb, { x0: 0, x1: 4, y0: 0, y1: 3.2, xt: 1, yt: 0.8, xl: "1/d² / m⁻²", yl: "I / W m⁻²", C, fs: 11 });
          ctx.strokeStyle = C.red; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(ax.X(0), ax.Y(0)); ctx.lineTo(ax.X(4), ax.Y(3.2)); ctx.stroke();
          ctx.fillStyle = C.red; ctx.beginPath(); ctx.arc(ax.X(1 / (d * d)), ax.Y(I), 5, 0, 7); ctx.fill();
          HP.label(ctx, "a straight line through the origin: I ∝ 1/d²", gb.x + 8, gb.y + 12, { size: 10, col: C.muted });
        }
      },
    });
  });

  /* =====================================================================
     9. The photoelectric effect
     ===================================================================== */
  mount("w-photo", (box) => {
    const METALS = { caesium: 3.4e-19, sodium: 3.7e-19, zinc: 6.9e-19 };
    let metal = "zinc";
    HP.choice(box, "Metal plate:", [["caesium", "caesium"], ["sodium", "sodium"], ["zinc", "zinc"]], metal, (v) => { metal = v; upd(); });
    const cv = canvasIn(box, "dark", "Photons stream onto a metal plate. If each photon has enough energy, electrons are ejected; their speed depends on the frequency, while the number ejected depends on the irradiance.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sF = HP.slider(ctr, { label: "Frequency of the light f", min: 3.5, max: 15, step: 0.1, value: 12, fmt: (v) => v.toFixed(1) + " × 10¹⁴", unit: "Hz", oninput: () => upd() });
    const sI = HP.slider(ctr, { label: "Irradiance (photons per second)", min: 1, max: 10, step: 1, value: 4, fmt: (v) => "level " + v, oninput: () => upd() });
    const R = readouts(box, [["E", "photon energy E = hf"], ["W", "work function hf₀"], ["f0", "threshold frequency f₀"], ["Ek", "max E<sub>k</sub> = hf − hf₀"], ["v", "max speed of electrons"]]);
    const note = HP.el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    let photons = [], electrons = [], last = 0;
    function st() { const f = sF.value * 1e14, E = h * f, W = METALS[metal], Ek = E - W; return { f, E, W, Ek, f0: W / h }; }
    function upd() {
      const s = st();
      R.E.textContent = F(s.E, 3) + " J"; R.W.textContent = F(s.W, 2) + " J"; R.f0.textContent = F(s.f0, 3) + " Hz";
      R.Ek.textContent = s.Ek > 0 ? F(s.Ek, 3) + " J" : "none: no emission";
      R.v.textContent = s.Ek > 0 ? F(Math.sqrt(2 * s.Ek / me), 3) + " m s⁻¹" : "—";
      note.textContent = s.Ek > 0
        ? "Each photon gives ALL its energy to ONE electron. Some of it (the work function) frees the electron; what is left is its kinetic energy. Raise the irradiance: more electrons per second, but none of them goes any faster."
        : "Below the threshold frequency no single photon has enough energy to free an electron. Turn the irradiance up as far as you like: still no electrons. A wave model cannot explain this; the photon model can.";
      sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 240 : 260),
      draw(ctx, t, dt, C, S) {
        const s = st();
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        const plateX = S.w * 0.62;
        px(ctx, plateX, 30, 18, S.h - 60, metal === "zinc" ? "#9aa4b5" : metal === "sodium" ? "#c9c3a8" : "#d8b75a");
        HP.label(ctx, metal, plateX + 9, 18, { size: 12, align: "center", col: "#cfd6e6", halo: false });
        // lamp
        const nm = 3e8 / s.f * 1e9;
        const col = nm < 380 ? "#c9a2ff" : nm > 750 ? "#ff6040" : HP.nmToRGB(nm);
        px(ctx, 10, S.h / 2 - 20, 28, 40, "#555"); px(ctx, 34, S.h / 2 - 14, 8, 28, col);
        HP.label(ctx, nm < 380 ? "ultraviolet" : nm > 750 ? "infrared" : `${nm.toFixed(0)} nm`, 26, S.h / 2 + 34, { size: 11, align: "center", col: "#cfd6e6", halo: false });
        // spawn photons
        const rate = sI.value * 3;
        if (dt > 0 && t - last > 1 / rate) {
          last = t; photons.push({ x: 44, y: S.h / 2 + (Math.random() - 0.5) * (S.h - 90) * 0.8 });
        }
        photons.forEach((p) => { p.x += dt * 260; });
        photons = photons.filter((p) => {
          if (p.x >= plateX) { if (s.Ek > 0) electrons.push({ x: plateX + 18, y: p.y, vx: 40 + 220 * Math.sqrt(s.Ek / 8e-19) * (0.55 + 0.45 * Math.random()), vy: (Math.random() - 0.5) * 30 }); return false; }
          return true;
        });
        electrons.forEach((el) => { el.x += el.vx * dt; el.y += el.vy * dt; });
        electrons = electrons.filter((el) => el.x < S.w + 10);
        // draw photons as little wave packets
        photons.forEach((p) => {
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
          for (let k = 0; k <= 16; k++) { const xx = p.x - 16 + k, yy = p.y + Math.sin(k * (s.f / 1.5e14)) * 4; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
          ctx.stroke();
        });
        electrons.forEach((el) => { ctx.fillStyle = "#9fd0ff"; ctx.beginPath(); ctx.arc(el.x, el.y, 4, 0, 7); ctx.fill(); });
        HP.label(ctx, s.Ek > 0 ? "photoelectrons" : "no electrons emitted", plateX + 30, 18, { size: 12, col: s.Ek > 0 ? "#9fd0ff" : "#ff9b8f", halo: false });
      },
      loop: true,
    });
    box.insertBefore(HP.el("div", { class: "btn-row" }, HP.playButton(sim)), ctr);
    upd();
  });

  /* =====================================================================
     10. Two-source interference in the harbour (a ripple tank)
     ===================================================================== */
  mount("w-ripple", (box) => {
    const cv = canvasIn(box, "", "Two sources produce overlapping circular waves. Bright and dark bands show constructive and destructive interference. A probe point shows the path difference in wavelengths.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sL = HP.slider(ctr, { label: "Wavelength λ", min: 14, max: 40, step: 1, value: 24, unit: "px", oninput: () => sim.redraw() });
    const sS = HP.slider(ctr, { label: "Separation of the sources", min: 40, max: 160, step: 2, value: 90, unit: "px", oninput: () => sim.redraw() });
    let phase180 = false;
    HP.choice(box, "Sources:", [["0", "in phase"], ["1", "in antiphase (180° out of phase)"]], "0", (v) => { phase180 = v === "1"; sim.redraw(); });
    const R = readouts(box, [["p1", "distance from S₁"], ["p2", "distance from S₂"], ["pd", "path difference"], ["res", "at the probe"]]);
    let probe = null, img = null, imgW = 0, offCanvas = null;
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const lam = sL.value, sep = sS.value, k = 2 * Math.PI / lam, w = 2 * Math.PI * 1.2;
        const s1 = { x: 30, y: S.h / 2 - sep / 2 }, s2 = { x: 30, y: S.h / 2 + sep / 2 };
        if (!probe) probe = { x: S.w * 0.8, y: S.h / 2 };
        // render the wave field at reduced resolution
        const step = 3, cols = Math.ceil(S.w / step), rows = Math.ceil(S.h / step);
        if (!img || imgW !== cols) { img = ctx.createImageData(cols, rows); imgW = cols; }
        const d = img.data, ph2 = phase180 ? Math.PI : 0;
        for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
          const x = i * step, y = j * step;
          const r1 = Math.hypot(x - s1.x, y - s1.y), r2 = Math.hypot(x - s2.x, y - s2.y);
          const a = (Math.sin(k * r1 - w * t) + Math.sin(k * r2 - w * t + ph2)) / Math.sqrt(1 + Math.min(r1, r2) / 120);
          const v = Math.max(0, Math.min(255, 128 + a * 60));
          const o = (j * cols + i) * 4;
          d[o] = v * 0.35; d[o + 1] = v * 0.6 + 30; d[o + 2] = 90 + v * 0.65; d[o + 3] = 255;
        }
        const off = offCanvas || (offCanvas = document.createElement("canvas"));
        off.width = cols; off.height = rows; off.getContext("2d").putImageData(img, 0, 0);
        ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, cols * step, rows * step);
        // sources (two signal guns / bells in the harbour)
        [s1, s2].forEach((s, i) => { px(ctx, s.x - 6, s.y - 6, 12, 12, "#e0b23a"); HP.label(ctx, i ? "S₂" : "S₁", s.x + 10, s.y, { size: 12, bold: true, col: "#fff", halo: false }); });
        // probe
        const r1 = Math.hypot(probe.x - s1.x, probe.y - s1.y), r2 = Math.hypot(probe.x - s2.x, probe.y - s2.y);
        ctx.strokeStyle = "rgba(255,255,255,.75)"; ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(s1.x, s1.y); ctx.lineTo(probe.x, probe.y); ctx.lineTo(s2.x, s2.y); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(probe.x, probe.y, 8, 0, 7); ctx.stroke();
        const pdl = Math.abs(r2 - r1) / lam;
        const frac = pdl - Math.floor(pdl);
        R.p1.textContent = (r1 / lam).toFixed(2) + " λ"; R.p2.textContent = (r2 / lam).toFixed(2) + " λ";
        R.pd.textContent = pdl.toFixed(2) + " λ";
        const nearWhole = frac < 0.12 || frac > 0.88, nearHalf = Math.abs(frac - 0.5) < 0.12;
        let res;
        if (!phase180) res = nearWhole ? `maximum (constructive): ≈ ${Math.round(pdl)}λ` : nearHalf ? `minimum (destructive): ≈ (${Math.floor(pdl)} + ½)λ` : "between a maximum and a minimum";
        else res = nearWhole ? "minimum: antiphase sources swap the rule" : nearHalf ? "maximum: antiphase sources swap the rule" : "between a maximum and a minimum";
        R.res.textContent = res;
        HP.label(ctx, "drag the white ring to probe the pattern", S.w - 8, 14, { size: 11, align: "right", col: "#fff", halo: false });
      },
      loop: true,
    });
    const setProbe = (ev) => {
      const r = cv.getBoundingClientRect();
      const p = ev.touches ? ev.touches[0] : ev;
      probe = { x: (p.clientX - r.left) * sim.w / r.width, y: (p.clientY - r.top) * sim.h / r.height };
      sim.redraw();
    };
    let dragging = false;
    cv.addEventListener("pointerdown", (ev) => { dragging = true; cv.setPointerCapture(ev.pointerId); setProbe(ev); });
    cv.addEventListener("pointermove", (ev) => { if (dragging) setProbe(ev); });
    cv.addEventListener("pointerup", () => (dragging = false));
    cv.style.touchAction = "none"; cv.style.cursor = "crosshair";
    cv.setAttribute("tabindex", "0");
    cv.addEventListener("keydown", (ev) => {
      const m = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[ev.key];
      if (!m || !probe) return; ev.preventDefault(); probe.x = Math.max(0, Math.min(sim.w, probe.x + m[0])); probe.y = Math.max(0, Math.min(sim.h, probe.y + m[1])); sim.redraw();
    });
    box.insertBefore(HP.el("div", { class: "btn-row" }, HP.playButton(sim), HP.el("span", { class: "hint", style: "margin:0" }, "Keyboard: focus the picture and use the arrow keys to move the probe.")), ctr);
  });

  /* =====================================================================
     11. The diffraction grating: d sin θ = mλ
     ===================================================================== */
  mount("w-grating", (box) => {
    let src = 633;
    HP.choice(box, "Light source:", [["633", "He-Ne laser (633 nm)"], ["532", "green laser (532 nm)"], ["405", "violet laser (405 nm)"], ["white", "white light"]], "633", (v) => { src = v; sim.redraw(); });
    const cv = canvasIn(box, "", "Light passes through a diffraction grating and forms maxima on a screen at angles given by d sin theta equals m lambda.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sN = HP.slider(ctr, { label: "Grating", min: 100, max: 600, step: 50, value: 300, unit: "lines per mm", oninput: () => sim.redraw() });
    const R = readouts(box, [["d", "grating spacing d = 1 / N"], ["th1", "angle to 1st order maximum"], ["th2", "angle to 2nd order maximum"], ["mx", "highest order visible"]]);
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 300 : 340),
      draw(ctx, t, dt, C, S) {
        const N = sN.value * 1000, d = 1 / N;
        ctx.fillStyle = "#0d1424"; ctx.fillRect(0, 0, S.w, S.h);
        // grating at the left-centre; a curved screen centred on it, so every angle is drawn true to size
        const gx = S.w < 560 ? 40 : S.w * 0.3, cy = S.h / 2, Rs = Math.min(S.h / 2 - 16, S.w - gx - 30);
        ctx.strokeStyle = "#e8e2d0"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(gx, cy, Rs, -Math.PI / 2 + 0.02, Math.PI / 2 - 0.02); ctx.stroke();
        px(ctx, gx - 3, cy - 40, 6, 80, "#9aa4b5");
        for (let y = cy - 38; y < cy + 38; y += 4) px(ctx, gx - 3, y, 6, 1, "#333");
        HP.label(ctx, "grating", gx, cy + 54, { size: 11, align: "center", col: "#cfd6e6", halo: false });
        HP.label(ctx, "curved screen: angles drawn true to size", S.w - 8, S.h - 10, { size: 10, align: "right", col: "#cfd6e6", halo: false });
        ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(gx + Rs, cy); ctx.stroke(); ctx.setLineDash([]);
        const draw = (lam, col, width, labels) => {
          for (let m = -6; m <= 6; m++) {
            const sn = m * lam * 1e-9 / d;
            if (Math.abs(sn) >= 1) continue;
            const th = Math.asin(sn), ex = gx + Rs * Math.cos(th), ey = cy - Rs * Math.sin(th);
            ctx.strokeStyle = col; ctx.globalAlpha = 0.45; ctx.lineWidth = width; ctx.beginPath(); ctx.moveTo(gx, cy); ctx.lineTo(ex, ey); ctx.stroke(); ctx.globalAlpha = 1;
            ctx.fillStyle = col; ctx.beginPath(); ctx.arc(ex, ey, 5, 0, 7); ctx.fill();
            if (labels) HP.label(ctx, m === 0 ? "m = 0" : `m = ${m > 0 ? m : "−" + -m}`, ex + 10 * Math.cos(th), ey - 10 * Math.sin(th), { size: 11, align: "left", col: "#fff", halo: false });
          }
        };
        if (src === "white") {
          for (let lam = 400; lam <= 700; lam += 10) draw(lam, HP.nmToRGB(lam), 1, false);
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx + Rs, cy, 6, 0, 7); ctx.fill();
          HP.label(ctx, "central maximum: white", gx + Rs - 8, cy + 16, { size: 11, align: "right", col: "#fff", halo: false });
          HP.label(ctx, "in each order, red is deviated more than violet", 10, 14, { size: 11, col: "#cfd6e6", halo: false });
        } else {
          px(ctx, 4, cy - 4, Math.max(10, gx - 10), 8, "#666");
          draw(+src, HP.nmToRGB(+src), 2, true);
        }
        const lam = src === "white" ? 700 : +src;
        const ang = (m) => { const sn = m * lam * 1e-9 / d; return Math.abs(sn) < 1 ? (Math.asin(sn) * 180 / Math.PI).toFixed(1) + "°" : "none (sin θ > 1)"; };
        R.d.textContent = F(d, 3) + " m";
        R.th1.textContent = (src === "white" ? "red end: " : "") + ang(1); R.th2.textContent = (src === "white" ? "red end: " : "") + ang(2);
        R.mx.textContent = "m = " + Math.floor(d / (lam * 1e-9) - 1e-9) + (src === "white" ? " (complete spectrum)" : "");
      },
    });
  });

  /* =====================================================================
     12. The Bohr model: hydrogen energy levels, emission and absorption
     ===================================================================== */
  mount("w-bohr", (box) => {
    const E = (n) => Number((-2.18e-18 / (n * n)).toPrecision(3)); // rounded to 3 s.f., as on exam energy-level diagrams
    let mode = "emit", hi = 3, lo = 2, lines = new Set(["3-2"]);
    HP.choice(box, "Spectrum:", [["emit", "emission (hot gas)"], ["abs", "absorption (white light through cool gas)"]], mode, (v) => { mode = v; sim.redraw(); });
    const cv = canvasIn(box, "", "Energy level diagram for hydrogen with the levels n = 1 to 6, and the spectrum produced by the chosen transitions.");
    const pick = HP.el("div", { class: "btn-row" });
    const sel = (lab, val, onch) => {
      const s = HP.el("select", { "aria-label": lab });
      for (let n = 1; n <= 6; n++) s.append(HP.el("option", { value: n, selected: n === val ? true : null }, "n = " + n));
      s.addEventListener("change", () => onch(+s.value));
      return HP.el("label", null, lab + " ", s);
    };
    pick.append(sel("Upper level", hi, (v) => { hi = v; go(); }), sel("Lower level", lo, (v) => { lo = v; go(); }));
    const clear = HP.el("button", { type: "button", class: "btn small" }, "↺ Clear spectrum"); clear.addEventListener("click", () => { lines.clear(); go(); });
    pick.append(clear);
    box.append(pick);
    const R = readouts(box, [["dE", "E₂ − E₁ (photon energy)"], ["f", "frequency f = (E₂ − E₁)/h"], ["l", "wavelength λ = c/f"]]);
    let anim = 0;
    function go() {
      if (hi <= lo) { R.dE.textContent = "choose upper > lower"; R.f.textContent = "—"; R.l.textContent = "—"; sim.redraw(); return; }
      const dE = E(hi) - E(lo), f = dE / h, l = c / f * 1e9;
      R.dE.textContent = F(dE, 3) + " J"; R.f.textContent = F(f, 3) + " Hz";
      R.l.textContent = l.toFixed(0) + " nm (" + (l < 380 ? "ultraviolet" : l > 750 ? "infrared" : "visible") + ")";
      lines.add(hi + "-" + lo); anim = sim.t; if (!sim.playing) sim.play();
      sim.redraw();
    }
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 460 : 340),
      draw(ctx, t, dt, C, S) {
        const narrow = S.w < 560;
        const lv = narrow ? { x: 60, y: 24, w: S.w - 80, h: 290 } : { x: 70, y: 24, w: S.w * 0.46, h: S.h - 44 };
        const Y = (en) => lv.y + lv.h - (en - E(1)) / (0 - E(1)) * lv.h;
        // zero line
        ctx.strokeStyle = C.muted; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(lv.x, Y(0)); ctx.lineTo(lv.x + lv.w, Y(0)); ctx.stroke(); ctx.setLineDash([]);
        HP.label(ctx, "0 J (ionisation)", lv.x + lv.w, Y(0) - 8, { size: 10, align: "right", col: C.muted });
        for (let n = 1; n <= 6; n++) {
          ctx.strokeStyle = n === hi || n === lo ? C.red : C.ink; ctx.lineWidth = n === hi || n === lo ? 3 : 1.5;
          ctx.beginPath(); ctx.moveTo(lv.x, Y(E(n))); ctx.lineTo(lv.x + lv.w, Y(E(n))); ctx.stroke();
          if (n <= 4) HP.label(ctx, `n = ${n}`, lv.x - 6, Y(E(n)), { size: 10, align: "right" });
          if (n <= 3) HP.label(ctx, F(E(n), 3) + " J", lv.x + lv.w - 4, Y(E(n)) + (n === 1 ? -9 : 10), { size: 10, align: "right", col: C.ink2 });
        }
        HP.label(ctx, "ground state", lv.x + 6, Y(E(1)) - 9, { size: 10, col: C.ink2 });
        HP.label(ctx, "n = 5, 6 … crowd up towards 0 J", lv.x - 6, Y(0) - 8, { size: 9, col: C.muted, align: "left" });
        if (hi > lo) {
          const x = lv.x + lv.w * 0.35, y1 = Y(E(hi)), y2 = Y(E(lo));
          const l = c / ((E(hi) - E(lo)) / h) * 1e9;
          const col = l < 380 ? "#8a5cd6" : l > 750 ? "#a01818" : HP.nmToRGB(l);
          const p = Math.min(1, (t - anim) / 1.2);
          if (mode === "emit") HP.arrow(ctx, x, y1, x, y1 + (y2 - y1) * Math.max(p, 0.05), C.red, 2.5);
          else HP.arrow(ctx, x, y2, x, y2 + (y1 - y2) * Math.max(p, 0.05), C.sea, 2.5);
          // photon squiggle
          ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath();
          const py = (y1 + y2) / 2, sx0 = mode === "emit" ? x + 10 : x + 120 - p * 100;
          for (let k = 0; k <= 60; k++) { const xx = sx0 + k * 1.5, yy = py + Math.sin(k * 0.6) * 5; k ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); }
          if (mode === "emit" ? p > 0.3 : p < 0.9) ctx.stroke();
          HP.label(ctx, mode === "emit" ? "electron falls: photon emitted" : "photon absorbed: electron rises", x + 8, py + 18, { size: 11, bold: true });
        }
        // spectrum strip
        const sp = narrow ? { x: 14, y: lv.y + lv.h + 40, w: S.w - 28, h: 50 } : { x: lv.x + lv.w + 30, y: S.h / 2 - 20, w: S.w - lv.x - lv.w - 44, h: 50 };
        const X = (l) => sp.x + (l - 380) / (750 - 380) * sp.w;
        if (mode === "emit") { px(ctx, sp.x, sp.y, sp.w, sp.h, "#000"); }
        else for (let l = 380; l < 750; l++) { ctx.fillStyle = HP.nmToRGB(l); ctx.fillRect(X(l), sp.y, X(l + 1) - X(l) + 0.6, sp.h); }
        lines.forEach((key) => {
          const [a, b] = key.split("-").map(Number); if (a <= b) return;
          const l = c / ((E(a) - E(b)) / h) * 1e9;
          if (l < 380 || l > 750) return;
          px(ctx, X(l) - 1.5, sp.y, 3, sp.h, mode === "emit" ? HP.nmToRGB(l) : "#000");
        });
        HP.label(ctx, mode === "emit" ? "emission line spectrum" : "absorption spectrum: dark lines at the same wavelengths", sp.x, sp.y - 10, { size: 11, bold: true });
        for (let l = 400; l <= 700; l += 100) HP.label(ctx, l + " nm", X(l), sp.y + sp.h + 12, { size: 10, align: "center", col: C.ink2 });
        HP.label(ctx, "(only visible lines appear on this strip)", sp.x, sp.y + sp.h + 30, { size: 10, col: C.muted });
      },
    });
    go();
  });

  /* =====================================================================
     13. Refraction and total internal reflection: a semicircular block
     ===================================================================== */
  mount("w-refract", (box) => {
    const MAT = { "crown glass": 1.5, water: 1.33, diamond: 2.42 };
    let mat = "crown glass", dir = "in", disp = false;
    HP.choice(box, "Block:", [["crown glass", "crown glass (1.50)"], ["water", "water (1.33)"], ["diamond", "diamond (2.42)"]], mat, (v) => { mat = v; sim.redraw(); });
    HP.choice(box, "Ray travels:", [["in", "from air into the block"], ["out", "from the block out into air"]], dir, (v) => { dir = v; sim.redraw(); });
    const cv = canvasIn(box, "", "A ray of light meets the flat face of a semicircular block at the centre. The normal is drawn dashed. The refracted and reflected rays are shown, with total internal reflection beyond the critical angle.");
    const ctr = HP.el("div", { class: "sim-controls" }); box.append(ctr);
    const sA = HP.slider(ctr, { label: "Angle of incidence θ₁ (from the normal)", min: 0, max: 89, step: 1, value: 30, unit: "°", oninput: () => sim.redraw() });
    const opt = HP.el("label", null); const cb = HP.el("input", { type: "checkbox" }); cb.addEventListener("change", () => { disp = cb.checked; sim.redraw(); }); opt.append(cb, " show red and violet separately (dispersion)");
    box.append(HP.el("div", { class: "btn-row" }, opt));
    const R = readouts(box, [["r", "angle of refraction θ₂"], ["n", "sin θ₁ / sin θ₂ (air ÷ material)"], ["cA", "critical angle θc = sin⁻¹(1/n)"], ["what", "what happens"]]);
    const sim = HP.sim(cv, {
      height: (w) => (w < 560 ? 320 : 330),
      draw(ctx, t, dt, C, S) {
        const n = MAT[mat], th = sA.value * Math.PI / 180;
        const cx = S.w / 2, cy = S.h / 2, Rb = Math.min(S.w * 0.36, S.h * 0.44);
        // block: semicircle below the flat face (y > cy)
        ctx.fillStyle = mat === "water" ? "rgba(70,140,220,.25)" : mat === "diamond" ? "rgba(200,230,255,.45)" : "rgba(140,200,210,.35)";
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(cx - Rb, cy); ctx.arc(cx, cy, Rb, 0, Math.PI); ctx.closePath(); ctx.fill(); ctx.stroke();
        HP.label(ctx, mat, cx + Rb * 0.55, cy + Rb * 0.55, { size: 12, align: "center" });
        HP.label(ctx, "air", cx - Rb * 0.8, cy - Rb * 0.7, { size: 12 });
        // normal
        ctx.strokeStyle = C.muted; ctx.setLineDash([6, 5]); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(cx, cy - Rb - 10); ctx.lineTo(cx, cy + Rb + 10); ctx.stroke(); ctx.setLineDash([]);
        HP.label(ctx, "normal", cx + 6, cy - Rb - 2, { size: 10, col: C.muted });
        const crit = Math.asin(1 / n);
        const ray = (nn, col, w, main) => {
          if (dir === "in") {
            // incident in air from upper-left, hits the centre of the flat face
            const x0 = cx - Math.sin(th) * Rb * 1.1, y0 = cy - Math.cos(th) * Rb * 1.1;
            if (main) HP.arrow(ctx, x0, y0, cx - Math.sin(th) * 12, cy - Math.cos(th) * 12, col, w, 10);
            ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(cx, cy); ctx.stroke();
            const r = Math.asin(Math.sin(th) / nn);
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(r) * Rb * 1.25, cy + Math.cos(r) * Rb * 1.25); ctx.stroke();
            // weak reflection
            ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(th) * Rb, cy - Math.cos(th) * Rb); ctx.stroke(); ctx.globalAlpha = 1;
            return r;
          }
          // from inside the block: enters the curved face along a radius (no bending there), meets the flat face at the centre
          const x0 = cx - Math.sin(th) * Rb * 1.1, y0 = cy + Math.cos(th) * Rb * 1.1;
          ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(cx, cy); ctx.stroke();
          if (main) HP.arrow(ctx, cx - Math.sin(th) * Rb * 0.7, cy + Math.cos(th) * Rb * 0.7, cx - Math.sin(th) * Rb * 0.45, cy + Math.cos(th) * Rb * 0.45, col, w, 10);
          const cc = Math.asin(1 / nn);
          if (th < cc) {
            const r = Math.asin(Math.min(1, Math.sin(th) * nn));
            ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(r) * Rb * 1.25, cy - Math.cos(r) * Rb * 1.25); ctx.stroke();
            ctx.globalAlpha = 0.3 + 0.7 * Math.pow(th / cc, 6); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(th) * Rb, cy + Math.cos(th) * Rb); ctx.stroke(); ctx.globalAlpha = 1;
            return r;
          }
          ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.sin(th) * Rb, cy + Math.cos(th) * Rb); ctx.stroke();
          return null;
        };
        let r;
        if (disp) { ray(n * 0.99, "#d01818", 2.5, false); r = ray(n * 1.012, "#7a2bd6", 2.5, false); ray(n, "rgba(0,0,0,0)", 0, true); }
        else r = ray(n, C.red, 3, true);
        // angle arcs
        ctx.strokeStyle = C.ink; ctx.lineWidth = 1.2;
        if (dir === "in") { ctx.beginPath(); ctx.arc(cx, cy, 40, -Math.PI / 2 - th, -Math.PI / 2); ctx.stroke(); HP.label(ctx, "θ₁", cx - 16 - 20 * Math.sin(th / 2), cy - 52, { size: 12, bold: true }); }
        else { ctx.beginPath(); ctx.arc(cx, cy, 40, Math.PI / 2, Math.PI / 2 + th); ctx.stroke(); HP.label(ctx, "θ₁", cx - 22 - 16 * Math.sin(th / 2), cy + 54, { size: 12, bold: true }); }
        const deg = (x) => (x * 180 / Math.PI).toFixed(1) + "°";
        R.cA.textContent = deg(crit);
        if (dir === "in") {
          R.r.textContent = deg(r) + " (in the block)"; R.n.textContent = th > 0 ? (Math.sin(th) / Math.sin(r)).toFixed(2) : "—";
          R.what.textContent = th === 0 ? "along the normal: no change of direction" : "refraction towards the normal (light slows down)";
        } else {
          if (r == null) { R.r.textContent = "no refracted ray"; R.n.textContent = "—"; R.what.textContent = `total internal reflection: θ₁ > θc (${deg(crit)})`; }
          else { R.r.textContent = deg(r) + " (in air)"; R.n.textContent = th > 0 ? (Math.sin(r) / Math.sin(th)).toFixed(2) : "—"; R.what.textContent = Math.abs(th - crit) < 0.012 ? "at the critical angle: refracted ray along the surface (90°)" : "refraction away from the normal (light speeds up)"; }
        }
      },
    });
  });
})();
