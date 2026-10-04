/* Chapter 5 — substituted cyclohexanes: methylcyclohexane's flip with its
   1,3-diaxial contacts, the hidden gauche-butane Newmans, an A-value
   equilibrium calculator and a dimethylcyclohexane builder. */
(function () {
  "use strict";
  const { Viewer, ringSix, ringSubstituents, CHAIR_PSI, q, el, v, DEG, CC, CH, TET, dihedral, R } = CK;
  const ME_YAW = 240, ME_GAUCHE = 3.8, ME_H_13 = 3.8, ME_ME_13 = 15.4;

  function qFromTo(a, b) {
    const d = v.dot(a, b);
    if (d > 0.99999) return [1, 0, 0, 0];
    if (d < -0.99999) return q.axis(CK.perp(a), Math.PI);
    return q.axis(v.cross(a, b), Math.acos(d));
  }

  // A cyclohexane in conformation (psiH, psiF) with methyls on the given
  // carbons and faces: groups = [{ at: ringIndex, face: "up"|"down" }].
  function model(psiH, psiF, groups, opt = {}) {
    const P = ringSix(psiH, psiF);
    const subs = ringSubstituents(P);
    const atoms = P.map((p) => ({ el: "C", p })), bonds = P.map((_, i) => [i, (i + 1) % 6]);
    const hIndex = {};
    subs.forEach((s, i) => {
      ["up", "down"].forEach((face) => {
        const dir = face === "up" ? s.up : s.down;
        const g = groups.find((x) => x.at === i && x.face === face);
        if (g) {
          const m = v.add(s.C, v.mul(dir, CC));
          atoms.push({ el: "Me", p: m }); const mi = atoms.length - 1; bonds.push([i, mi]);
          const e1 = CK.perp(dir), e2 = v.cross(dir, e1);
          for (let h = 0; h < 3; h++) {
            const g2 = (h * 120 + 30) * DEG;
            const hd = v.add(v.mul(dir, -Math.cos(TET * DEG)), v.add(v.mul(e1, Math.sin(TET * DEG) * Math.cos(g2)), v.mul(e2, Math.sin(TET * DEG) * Math.sin(g2))));
            atoms.push({ el: "H", p: v.add(m, v.mul(hd, CH)), r: 0.2 }); bonds.push([mi, atoms.length - 1]);
          }
        } else {
          atoms.push({ el: "H", p: face === "up" ? s.upPos : s.downPos });
          bonds.push([i, atoms.length - 1]);
          hIndex[i + face] = atoms.length - 1;
        }
      });
    });
    // positions of each group: axial or equatorial right now
    const where = groups.map((g) => (subs[g.at].axial === g.face ? "axial" : "equatorial"));
    // glow the hydrogens that an axial methyl is bumping into
    if (opt.glow) groups.forEach((g, k) => {
      if (where[k] !== "axial") return;
      [(g.at + 2) % 6, (g.at + 4) % 6].forEach((j) => { const hi = hIndex[j + g.face]; if (hi != null) { atoms[hi].fill = "#ff6f6f"; atoms[hi].glow = "#ff6f6f44"; } });
    });
    return { atoms, bonds, subs, P, where };
  }

  // Strain bookkeeping for methyl groups from the real geometry.
  function bookkeeping(m, groups) {
    const items = [];
    let total = 0;
    const axial = groups.map((g, k) => m.where[k] === "axial");
    // 1,3-diaxial: each axial methyl vs the axial positions two carbons away, same face
    const seen = new Set();
    groups.forEach((g, k) => {
      if (!axial[k]) return;
      [(g.at + 2) % 6, (g.at + 4) % 6].forEach((j) => {
        const other = groups.findIndex((x, kk) => x.at === j && x.face === g.face && axial[kk]);
        if (other >= 0) {
          const key = [k, other].sort().join("-");
          if (!seen.has(key)) { seen.add(key); items.push(["CH₃/CH₃ 1,3-diaxial", ME_ME_13]); total += ME_ME_13; }
        } else { items.push(["CH₃/H 1,3-diaxial", ME_H_13]); total += ME_H_13; }
      });
    });
    // adjacent methyls: gauche if their dihedral is ~60°
    for (let a = 0; a < groups.length; a++) for (let b = a + 1; b < groups.length; b++) {
      const ga = groups[a], gb = groups[b];
      if ((ga.at + 1) % 6 !== gb.at && (gb.at + 1) % 6 !== ga.at) continue;
      const pa = v.add(m.subs[ga.at].C, ga.face === "up" ? m.subs[ga.at].up : m.subs[ga.at].down);
      const pb = v.add(m.subs[gb.at].C, gb.face === "up" ? m.subs[gb.at].up : m.subs[gb.at].down);
      const d = Math.abs(dihedral(pa, m.subs[ga.at].C, m.subs[gb.at].C, pb));
      if (d < 100) { items.push(["CH₃/CH₃ gauche (neighbours)", ME_GAUCHE]); total += ME_GAUCHE; }
    }
    return { items, total };
  }

  const AXIS = ringSubstituents(ringSix(CHAIR_PSI, -CHAIR_PSI))[0].N;
  const toUp = qFromTo(AXIS, [0, 1, 0]);
  const SIDE = q.mul(q.axis([1, 0, 0], 16 * DEG), q.mul(q.axis([0, 1, 0], -20 * DEG), toUp));

  // ---------- hero ----------
  (function () {
    const m = model(CHAIR_PSI, -CHAIR_PSI, [{ at: 0, face: "down" }]);
    const view = new Viewer(document.getElementById("heroMe"), { orient: SIDE, autoSpin: 0.4, extent: 2.9 });
    view.setModel(m.atoms, m.bonds);
  })();

  // ---------- methylcyclohexane flip ----------
  (function () {
    // on carbon 0, on whichever face is axial in the starting chair
    const groups = [{ at: 0, face: ringSubstituents(ringSix(CHAIR_PSI, -CHAIR_PSI))[0].axial }];
    const btn = document.getElementById("meFlipBtn"), tag = document.getElementById("meTag");
    const pos = document.getElementById("mePos"), en = document.getElementById("meE");
    let s = 0, anim = null;
    // the methyl's face of the ring on top, seen a little from above so all
    // three axial groups on that face stand clear of the ring
    const faceUp = qFromTo(groups[0].face === "up" ? AXIS : v.mul(AXIS, -1), [0, 1, 0]);
    const view = new Viewer(document.getElementById("meFlip"), { orient: q.mul(q.axis([1, 0, 0], 24 * DEG), q.mul(q.axis([0, 1, 0], ME_YAW * DEG), faceUp)), extent: 3.3,
      onFrame() { if (!anim) return false; const t = Math.min(1, (performance.now() - anim.t0) / 3000); s = anim.a + (anim.b - anim.a) * t; if (t >= 1) anim = null; update(); } });
    const sm = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
    function update() {
      const foot = -CHAIR_PSI + 2 * CHAIR_PSI * sm(s / 0.5), head = CHAIR_PSI - 2 * CHAIR_PSI * sm((s - 0.5) / 0.5);
      const m = model(head, foot, groups, { glow: s < 0.02 });
      view.setModel(m.atoms, m.bonds);
      const ends = s < 0.02 || s > 0.98;
      pos.textContent = ends ? m.where[0] : "flipping…";
      en.textContent = s < 0.02 ? "7.6 kJ/mol" : s > 0.98 ? "0 kJ/mol" : "—";
      tag.textContent = s < 0.02 ? "methyl axial: two 1,3-diaxial contacts" : s > 0.98 ? "methyl equatorial: nothing in the way" : "ring flipping…";
      btn.textContent = s > 0.5 ? "◀ Flip it back" : "▶ Flip the ring";
    }
    btn.addEventListener("click", () => {
      const b = s > 0.5 ? 0 : 1;
      if (CK.reduceMotion()) { s = b; update(); return; }
      anim = { a: s, b, t0: performance.now() }; view.dirty = true;
    });
    update();
  })();

  // ---------- hidden gauche butane: Newman along C1–C2 ----------
  (function () {
    function newman(svg, axial) {
      const S = 280, c = S / 2;
      svg.setAttribute("viewBox", `0 0 ${S} ${S}`);
      const g = el("g", {}, svg);
      const pt = (a, r) => [c + r * Math.sin(a * DEG), c - r * Math.cos(a * DEG)];
      // front C1: CH3, H, C6 ; back C2: C3, H, H. The ring dihedral
      // C6–C1–C2–C3 is ~55° in a chair, so C6 (0°) and C3 (60°) are gauche.
      // An axial group on C1 is gauche to C3; an equatorial one is anti.
      const front = axial ? [[120, "CH₃", "#e8a93a"], [240, "H", "#e9ebf7"], [0, "C6", "#8b93c7"]] : [[120, "H", "#e9ebf7"], [240, "CH₃", "#e8a93a"], [0, "C6", "#8b93c7"]];
      const back = [[60, "C3", "#8b93c7"], [180, "H", "#e9ebf7"], [300, "H", "#e9ebf7"]];
      const meA = front.find((f) => f[1] === "CH₃")[0];
      const diff = Math.abs(((60 - meA + 540) % 360) - 180);
      const [x1, y1] = pt(60, 128), [x2, y2] = pt(meA, 128);
      el("path", { d: `M${x1} ${y1} A 128 128 0 0 1 ${x2} ${y2}`, fill: "none", stroke: diff < 90 ? "#ff6f6f" : "#5bd6a2", "stroke-width": 8, opacity: 0.5, "stroke-linecap": "round" }, g);
      const lbl = el("text", { x: c, y: S - 4, "text-anchor": "middle", fill: diff < 90 ? "#ff6f6f" : "#5bd6a2", "font-size": 13, "font-weight": 800 }, g);
      lbl.textContent = diff < 90 ? "60° — gauche" : "180° — anti";
      const dot = (a, r, txt, col) => { const [x, y] = pt(a, r); const big = txt !== "H"; el("circle", { cx: x, cy: y, r: big ? 18 : 12, fill: col, stroke: "#0b0e20", "stroke-width": 2 }, g); const t = el("text", { x, y: y + 5, "text-anchor": "middle", "font-size": big ? 12 : 13, "font-weight": 900, fill: "#0b0e20" }, g); t.textContent = txt; };
      back.forEach(([a, t, col]) => { const [x1, y1] = pt(a, 52), [x2, y2] = pt(a, 98); el("line", { x1, y1, x2, y2, stroke: "#8b93c7", "stroke-width": 6, "stroke-linecap": "round" }, g); dot(a, 110, t, col); });
      el("circle", { cx: c, cy: c, r: 52, fill: "#2a3160", stroke: "#8b93c7", "stroke-width": 4 }, g);
      front.forEach(([a, t, col]) => { const [x2, y2] = pt(a, 80); el("line", { x1: c, y1: c, x2, y2, stroke: "#eef0ff", "stroke-width": 6, "stroke-linecap": "round" }, g); dot(a, 88, t, col); });
      el("circle", { cx: c, cy: c, r: 6, fill: "#eef0ff" }, g);
    }
    newman(document.getElementById("nmAx"), true);
    newman(document.getElementById("nmEq"), false);
  })();

  // ---------- A-values ----------
  (function () {
    const GROUPS = [
      ["F", "–F", 1.0, "Small, and on a short-ish bond. Barely any preference."],
      ["CN", "–C≡N", 0.8, "Linear and thin: the nitrile slides past the axial hydrogens."],
      ["Cl", "–Cl", 2.0, "A big atom on a long bond (1.78 Å). The distance helps."],
      ["Br", "–Br", 2.0, "Bigger still, but on an even longer bond (1.93 Å). Size and distance cancel."],
      ["OH", "–OH", 4.2, "Moderate. The value shifts with solvent, because hydrogen bonding changes the OH's effective size."],
      ["CO2H", "–CO₂H", 5.6, "Flat, so it can turn edge-on to the ring."],
      ["Me", "–CH₃", 7.6, "The benchmark: two gauche-butane interactions."],
      ["Et", "–CH₂CH₃", 8.0, "Barely worse than methyl — it turns its CH₃ away from the ring."],
      ["iPr", "–CH(CH₃)₂", 9.2, "Can still point its single H inwards, but it's getting tight."],
      ["Ph", "–C₆H₅", 12.6, "A flat ring, but wide; its ortho hydrogens clash whichever way it turns."],
      ["tBu", "–C(CH₃)₃", 22.8, "No hydrogen to turn inwards. Effectively locks the ring with t-butyl equatorial."],
    ];
    const sel = document.getElementById("aPick"), Tin = document.getElementById("aT");
    GROUPS.forEach(([k, name], i) => { const o = document.createElement("option"); o.value = i; o.textContent = name; if (k === "Me") o.selected = true; sel.appendChild(o); });
    const tb = document.getElementById("aTable");
    GROUPS.forEach(([, name, A]) => {
      const K = Math.exp(A / (R * 298.15)), pct = K / (1 + K) * 100;
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${name}</td><td class="n">${A.toFixed(1)}</td><td class="n">${pct >= 99.9 ? "&gt;99.9" : pct.toFixed(0)}%</td>`;
      tb.appendChild(tr);
    });
    const svg = document.getElementById("aBar");
    const W = 640, H = 96;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    function update() {
      const [, name, A, note] = GROUPS[+sel.value];
      const T = +Tin.value, K = Math.exp(A / (R * T)), f = K / (1 + K);
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      const x0 = 10, w = W - 20;
      el("rect", { x: x0, y: 30, width: w, height: 34, rx: 17, fill: "#ff6f6f" }, g);
      el("rect", { x: x0, y: 30, width: Math.max(34, w * f), height: 34, rx: 17, fill: "#58c4dd" }, g);
      const t1 = el("text", { x: x0 + 16, y: 22, fill: "#58c4dd", "font-size": 14, "font-weight": 800 }, g); t1.textContent = "equatorial " + (f * 100 >= 99.95 ? ">99.9" : (f * 100).toFixed(1)) + "%";
      const t2 = el("text", { x: W - 16, y: 22, "text-anchor": "end", fill: "#ff6f6f", "font-size": 14, "font-weight": 800 }, g); t2.textContent = "axial " + ((1 - f) * 100 < 0.05 ? "<0.1" : ((1 - f) * 100).toFixed(1)) + "%";
      const t3 = el("text", { x: W / 2, y: 88, "text-anchor": "middle", fill: "#8f97c4", "font-size": 12, "font-weight": 700 }, g);
      t3.textContent = `out of every 1000 molecules, about ${Math.round((1 - f) * 1000)} are axial`;
      document.getElementById("aVal").textContent = A.toFixed(1) + " kJ/mol";
      document.getElementById("aTout").textContent = T + " K (" + Math.round(T - 273.15) + " °C)";
      document.getElementById("aK").textContent = K < 1000 ? K.toFixed(1) : K.toExponential(1).replace("e+", "×10^");
      document.getElementById("aPct").textContent = (f * 100 >= 99.95 ? ">99.9" : (f * 100).toFixed(1)) + "%";
      document.getElementById("aNote").textContent = name + ": " + note;
    }
    sel.addEventListener("change", update); Tin.addEventListener("input", update);
    update();
  })();

  // ---------- dimethylcyclohexane builder ----------
  (function () {
    let gap = 1, rel = "cis";
    const svgA = document.getElementById("dA"), svgB = document.getElementById("dB");
    const costA = document.getElementById("dAcost"), costB = document.getElementById("dBcost"), verdict = document.getElementById("dVerdict");
    function draw2D(svg, m, groups, title, yawDeg) {
      const N = m.subs[0].N;
      const ex0 = v.norm(v.sub(m.P[3], m.P[0]));
      let ex = v.norm(v.sub(ex0, v.mul(N, v.dot(ex0, N))));
      const yaw = yawDeg * DEG, elev = 14 * DEG;
      ex = v.add(v.mul(ex, Math.cos(yaw)), v.mul(v.cross(ex, N), Math.sin(yaw)));
      const depth = v.cross(ex, N);
      const pr = (p) => [v.dot(p, ex), -(v.dot(p, N) * Math.cos(elev) + v.dot(p, depth) * Math.sin(elev))];
      const W = 420, H = 290;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = "";
      const g = el("g", {}, svg);
      // fit the ring plus every substituent tip (methyls drawn 1.25 long, H's 0.8)
      const tipOf = (s, face, isMe) => v.add(s.C, v.mul(s.axial === face ? v.mul(N, face === "up" ? 1 : -1) : face === "up" ? s.up : s.down, isMe ? 1.25 : 0.8));
      const pts = m.P.map(pr);
      groups.forEach((gr) => ["up", "down"].forEach((f) => pts.push(pr(tipOf(m.subs[gr.at], f, f === gr.face)))));
      const xs = pts.map((a) => a[0]), ys = pts.map((a) => a[1]);
      const sc = Math.min(92, (W - 70) / (Math.max(...xs) - Math.min(...xs)), (H - 80) / (Math.max(...ys) - Math.min(...ys)));
      const ox = W / 2 - sc * (Math.max(...xs) + Math.min(...xs)) / 2, oy = H / 2 + 12 - sc * (Math.max(...ys) + Math.min(...ys)) / 2;
      const T = (p) => { const a = pr(p); return [ox + sc * a[0], oy + sc * a[1]]; };
      const Rr = m.P.map(T);
      for (let i = 0; i < 6; i++) { const a = Rr[i], b = Rr[(i + 1) % 6]; el("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: "#eef0ff", "stroke-width": 4, "stroke-linecap": "round" }, g); }
      const tt = el("text", { x: 12, y: 22, fill: "#c3c9ec", "font-size": 14, "font-weight": 800 }, g); tt.textContent = title;
      groups.forEach((gr, k) => {
        const s = m.subs[gr.at];
        ["up", "down"].forEach((face) => {
          const isMe = face === gr.face;
          const len = isMe ? 1.25 : 0.8;
          const ax = s.axial === face;
          const dir = ax ? v.mul(N, face === "up" ? 1 : -1) : face === "up" ? s.up : s.down;
          const tip = T(v.add(s.C, v.mul(dir, len)));
          el("line", { x1: Rr[gr.at][0], y1: Rr[gr.at][1], x2: tip[0], y2: tip[1], stroke: ax ? "#ff6f6f" : "#58c4dd", "stroke-width": 3.5, "stroke-linecap": "round" }, g);
          if (isMe) {
            el("circle", { cx: tip[0], cy: tip[1], r: 17, fill: "#e8a93a", stroke: "#0b0e20", "stroke-width": 2 }, g);
            const t = el("text", { x: tip[0], y: tip[1] + 4, "text-anchor": "middle", "font-size": 11, "font-weight": 900, fill: "#0b0e20" }, g); t.textContent = "CH₃";
          } else {
            const t = el("text", { x: tip[0], y: tip[1] + 5, "text-anchor": "middle", "font-size": 13, "font-weight": 900, fill: "#c3c9ec" }, g); t.textContent = "H";
          }
        });
        const gx = Rr.reduce((t, p) => t + p[0], 0) / 6, gy = Rr.reduce((t, p) => t + p[1], 0) / 6;
        const lab = el("text", { x: Rr[gr.at][0] + (gx - Rr[gr.at][0]) * 0.28, y: Rr[gr.at][1] + (gy - Rr[gr.at][1]) * 0.28 + 4, "text-anchor": "middle", fill: "#8f97c4", "font-size": 11, "font-weight": 800 }, g);
        lab.textContent = "C" + (k === 0 ? 1 : 1 + gap);
      });
    }
    const fmt = (b, m) => {
      const where = m.where.map((w) => w[0]).join(",");
      if (!b.items.length) return `<b>${where}</b> — no methyl strain: <b class="c-green">0 kJ/mol</b>`;
      return `<b>${where}</b> — ` + b.items.map(([n, e]) => `${n} ${e}`).join(" + ") + ` = <b class="c-gold">${b.total.toFixed(1)} kJ/mol</b>`;
    };
    function update() {
      // C1 on seat atom 1, the second methyl `gap` carbons round the ring
      const groups = [{ at: 1, face: "up" }, { at: (1 + gap) % 6, face: rel === "cis" ? "up" : "down" }];
      const mA = model(CHAIR_PSI, -CHAIR_PSI, groups), mB = model(-CHAIR_PSI, CHAIR_PSI, groups);
      const bA = bookkeeping(mA, groups), bB = bookkeeping(mB, groups);
      draw2D(svgA, mA, groups, "chair 1", -15);
      draw2D(svgB, mB, groups, "chair 2 (after a ring flip)", 15);
      costA.innerHTML = fmt(bA, mA); costB.innerHTML = fmt(bB, mB);
      const name = `<i>${rel}</i>-1,${1 + gap}-dimethylcyclohexane`;
      const d = bA.total - bB.total;
      if (Math.abs(d) < 0.05) verdict.innerHTML = `${name}: the two chairs are equal in energy, so it's a 50:50 mixture. <span class="muted">Red bonds are axial, blue are equatorial.</span>`;
      else {
        const K = Math.exp(Math.abs(d) / (R * 298.15)), pct = K / (1 + K) * 100;
        verdict.innerHTML = `${name}: chair ${d > 0 ? 2 : 1} is lower by ${Math.abs(d).toFixed(1)} kJ/mol, so about <b>${pct >= 99.9 ? ">99.9" : pct.toFixed(0)}%</b> of molecules sit in it at 25&nbsp;°C. <span class="muted">Red bonds are axial, blue are equatorial.</span>`;
      }
    }
    const wire = (id, attr, fn) => {
      const seg = document.getElementById(id);
      seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
        seg.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", x === b)); fn(b.dataset[attr]); update();
      }));
    };
    wire("dPos", "p", (p) => { gap = +p; });
    wire("dRel", "r", (r) => { rel = r; });
    update();
  })();
})();
