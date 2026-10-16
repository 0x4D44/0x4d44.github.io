/* Exam & assignment: the widgets on the Admiralty Board.
   Every number a widget shows is computed from the same rules the text teaches.
   The widgets are practice tools: the keyword checkers prompt you, they do not mark you. */
(function () {
  "use strict";
  const HE = window.HE;
  if (!HE) return;
  const $ = (id) => document.getElementById(id);
  const N = HE.n;
  const el = HE.el;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = el("canvas", { class: "sim", role: "img", "aria-label": label }); box.append(c); return c; };
  const controls = (box) => { const d = el("div", { class: "sim-controls" }); box.append(d); return d; };
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const KEY = "he-exam.v1";
  const store = {
    get(k, d) { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return k in o ? o[k] : d; } catch (e) { return d; } },
    set(k, v) { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); o[k] = v; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode */ } },
  };
  const FONT = '"Atkinson Hyperlegible", system-ui, sans-serif';
  const lum = (hex) => {
    const m = /#?([0-9a-f]{6})/i.exec(hex || "");
    if (!m) return 0.3;
    const n = parseInt(m[1], 16);
    return 0.2126 * (n >> 16 & 255) / 255 + 0.7152 * (n >> 8 & 255) / 255 + 0.0722 * (n & 255) / 255;
  };
  const textOn = (hex) => (lum(hex) > 0.45 ? "#14161c" : "#ffffff");

  /* ---- shared data: the six question-paper areas and their mark ranges (course specification) ---- */
  const AREAS = [
    { id: "themes", name: "Course themes, roles & impacts", lo: 10, hi: 17, deck: "systems.html", deckName: "Systems & energy" },
    { id: "analogue", name: "Analogue electronic control", lo: 20, hi: 35, deck: "analogue.html", deckName: "Analogue electronics" },
    { id: "digital", name: "Digital electronic control", lo: 15, hi: 25, deck: "digital.html", deckName: "Digital & programmable" },
    { id: "drives", name: "Drive systems & pneumatics", lo: 10, hi: 20, deck: "mechanisms.html", deckName: "Drives & pneumatics" },
    { id: "structures", name: "Structures & forces", lo: 15, hi: 25, deck: "structures.html", deckName: "Structures & materials" },
    { id: "materials", name: "Materials", lo: 8, hi: 14, deck: "structures.html", deckName: "Structures & materials" },
  ];
  const MAPDATA = {
    themes: [
      "Draw and read system, sub-system and control diagrams",
      "Explain negative feedback; closed-loop, two-state and proportional control; use error detection",
      "Carry out an energy audit: inputs, outputs, losses and efficiency",
      "Use Ew = Fd, P = E/t, Ek, Ep, Ee, Eh and efficiency",
      "Manipulate and combine given formulae; use trigonometry and simultaneous equations in structural problems",
      "Describe the role of the professional engineer, including communication and team working",
      "Describe social, economic and environmental impacts (positive and negative), sustainability and emerging technologies",
    ],
    analogue: [
      "Use variable resistors, light and temperature sensors in voltage dividers",
      "Design a voltage divider to a specification from a sensor characteristic",
      "Explain the function of a BJT; design a current-amplifier circuit; calculate hFE",
      "Design an n-channel enhancement MOSFET as a voltage-operated switch; explain threshold voltage",
      "Compare a BJT and a MOSFET in a given application",
      "Name the six op-amp configurations and calculate input/output voltages",
    ],
    digital: [
      "Use AND, OR, NOT, NAND, NOR and EOR gates (up to four inputs)",
      "Write Boolean expressions and truth tables from diagrams or written specifications",
      "Convert to NAND equivalents and minimise gates and ICs",
      "Control a motor using pulse-width modulation",
      "Draw flowcharts with pin numbers and delay units; use infinite and finite loops, decisions and analogue inputs",
      "Read a program or flowchart and spot faults",
    ],
    drives: [
      "Draw and interpret drive-system diagrams",
      "Calculate simple and compound gear trains, belt and chain drives, rack and pinion, worm and wheel, worm and nut",
      "State the purpose of couplings, radial and thrust bearings, brakes and clutches",
      "Calculate torque (T = Fr), power (P = 2πnT) and efficiency",
      "Describe and sequence pneumatic circuits with up to three cylinders, using correct terminology",
      "Read electro-pneumatic circuits",
    ],
    structures: [
      "Draw free-body diagrams; apply equilibrium to concurrent and non-concurrent forces",
      "Resolve forces; use triangle and polygon of forces; find resultant and equilibrant",
      "Find reactions on beams (hinge, roller, angled loads, UDLs)",
      "Find the size and nature (tension or compression) of forces in frames by nodal analysis",
    ],
    materials: [
      "Read and sketch stress–strain and load–extension graphs",
      "Define and recognise brittleness, elasticity, ductility, plasticity, strength and malleability",
      "Calculate stress, strain, Young's modulus and factor of safety",
      "Calculate elastic strain energy Es = ½Fx with the right units",
      "Explain how a strain gauge works and why a dummy gauge is used",
    ],
    assignment: [
      "Analysis: read the specification and complete a control diagram",
      "Designing: calculate component values, draw circuits, logic and flowcharts",
      "Building: simulate or build with clear, labelled evidence (orientation shown)",
      "Testing: write a test plan with expected results, record actual results, amend before the next test",
      "Evaluation: judge every specification point using evidence from actual performance",
    ],
  };

  /* =====================================================================
     1. Grade boundaries to scale, and "results day"
     ===================================================================== */
  const BOUND = { 2024: [112, 95, 78, 61], 2025: [112, 96, 80, 64], 2026: [117, 103, 90, 76] }; // A, B, C, D
  const LET = ["A", "B", "C", "D"];
  const gradeAt = (y, m) => { const b = BOUND[y]; for (let i = 0; i < 4; i++) if (m >= b[i]) return LET[i]; return "No award"; };

  mount("w-grades", (box) => {
    let qp = 64, asg = 31, anim = false;
    const cv = canvasIn(box, "");
    const ctl = controls(box);
    const ro = el("div", { class: "readouts", "aria-live": "polite" });
    const note = el("p", { class: "sim-note", "aria-live": "polite" });
    const total = () => qp + asg;
    function summary() {
      const t = total();
      const parts = [2024, 2025, 2026].map((y) => `${y}: ${gradeAt(y, t)}`).join("; ");
      return `Total ${t} out of 160 (${N(t / 160 * 100, 1)}%). ${parts}.`;
    }
    const sim = HE.sim(cv, {
      w: 600, h: 236, height: () => 238,
      draw(ctx, t, dt, C, S) {
        const W = S.w, tot = total();
        let shown = tot;
        if (anim) { shown = Math.min(tot, t * 55); if (shown >= tot) { anim = false; setTimeout(() => sim.pause(), 0); } }
        const x0 = 46, x1 = W - 14, X = (m) => x0 + (m / 160) * (x1 - x0);
        const cols = [C.gold, C.grass, C.sea, C.dirt]; // A B C D
        ctx.textBaseline = "middle";
        [2024, 2025, 2026].forEach((y, r) => {
          const top = 8 + r * 58, by = top + 26, bh = 24, b = BOUND[y];
          ctx.font = `bold 13px ${FONT}`; ctx.fillStyle = C.ink; ctx.textAlign = "right";
          ctx.fillText(String(y), x0 - 6, by + bh / 2);
          const edges = [0, b[3], b[2], b[1], b[0], 160];
          const fills = [C.line, cols[3], cols[2], cols[1], cols[0]];
          const names = ["No award", "D", "C", "B", "A"];
          // band index in edges: none=0, D=1, C=2, B=3, A=4
          const bi = shown >= b[0] ? 4 : shown >= b[1] ? 3 : shown >= b[2] ? 2 : shown >= b[3] ? 1 : 0;
          for (let i = 0; i < 5; i++) {
            const xa = X(edges[i]), xb = X(edges[i + 1]);
            ctx.fillStyle = fills[i]; ctx.globalAlpha = i === 0 ? 0.55 : 1; ctx.fillRect(xa, by, xb - xa, bh); ctx.globalAlpha = 1;
            ctx.fillStyle = i === 0 ? C.ink2 : textOn(fills[i]); ctx.textAlign = "center"; ctx.font = `bold ${i === 0 ? 11 : 13}px ${FONT}`;
            if (xb - xa > (i === 0 ? 60 : 12)) ctx.fillText(names[i], (xa + xb) / 2, by + bh / 2);
          }
          ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
          { const xa = X(edges[bi]), xb = X(edges[bi + 1]); ctx.strokeRect(xa + 1.5, by + 1.5, xb - xa - 3, bh - 3); }
          // boundary numbers, staggered so neighbours do not collide
          ctx.font = `bold 11px ${FONT}`; ctx.textAlign = "center";
          [b[3], b[2], b[1], b[0]].forEach((m, i) => {
            const yy = by - (i % 2 ? 5 : 16);
            ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(m), by - (i % 2 ? 1 : 1)); ctx.lineTo(X(m), yy + 5); ctx.stroke();
            HE.label(ctx, String(m), X(m), yy, { align: "center", size: 11, bold: true, col: C.ink });
          });
        });
        // axis and notional markers
        const ya = 8 + 3 * 58 - 4;
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x0, ya); ctx.lineTo(x1, ya); ctx.stroke();
        ctx.font = `11px ${FONT}`; ctx.fillStyle = C.ink2; ctx.textAlign = "center";
        [0, 40, 160].forEach((m) => { ctx.beginPath(); ctx.moveTo(X(m), ya); ctx.lineTo(X(m), ya + 4); ctx.stroke(); ctx.fillText(String(m), X(m), ya + 13); });
        ctx.setLineDash([4, 3]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
        [80, 112].forEach((m) => { ctx.beginPath(); ctx.moveTo(X(m), 30); ctx.lineTo(X(m), ya + 6); ctx.stroke(); });
        ctx.setLineDash([]);
        ctx.fillStyle = C.red; ctx.font = `bold 11px ${FONT}`;
        ctx.textAlign = "right"; ctx.fillText("80 = 50%", X(80) - 3, ya + 24);
        ctx.textAlign = "left"; ctx.fillText("112 = 70%", X(112) + 3, ya + 24);
        // my mark
        ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(X(shown), 30); ctx.lineTo(X(shown), ya + 4); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(X(shown), ya + 6); ctx.lineTo(X(shown) - 5, ya + 15); ctx.lineTo(X(shown) + 5, ya + 15); ctx.closePath(); ctx.fill();
        const lab = `You: ${Math.round(shown)}`;
        ctx.font = `bold 13px ${FONT}`;
        const tw = ctx.measureText(lab).width, lx = Math.max(x0, Math.min(x1 - tw, X(shown) - tw / 2));
        HE.label(ctx, lab, lx, ya + 40, { size: 13, bold: true, col: C.ink });
      },
    });
    function refresh() {
      cv.setAttribute("aria-label", "Grade boundaries drawn to scale for 2024, 2025 and 2026, from 0 to 160 marks, with your total marked. " + summary());
      const t = total();
      ro.innerHTML = "";
      [2024, 2025, 2026].forEach((y) => ro.append(el("div", null, el("b", null, gradeAt(y, t)), el("span", null, `with ${t} marks in ${y}`))));
      ro.append(el("div", null, el("b", null, `${t} / 160`), el("span", null, `${N(t / 160 * 100, 1)}% of the marks`)));
      const g = [2024, 2025, 2026].map((y) => gradeAt(y, t));
      note.textContent = g.every((x) => x === g[0])
        ? `The same total gives a ${g[0]} in all three years.`
        : `The same total of ${t} marks gives different grades in different years (${g.join(", ")}): the boundaries are fixed after each exam from the evidence, so aim comfortably above last year's line, not on it.`;
      sim.redraw();
    }
    HE.slider(ctl, { label: "Question paper mark (out of 110)", min: 0, max: 110, value: qp, oninput: (v) => { qp = v; anim = false; refresh(); } });
    HE.slider(ctl, { label: "Assignment mark (out of 50)", min: 0, max: 50, value: asg, oninput: (v) => { asg = v; anim = false; refresh(); } });
    const go = el("button", { class: "btn small primary", type: "button" }, "▶ Results day: replay");
    go.addEventListener("click", () => {
      if (HE.reduced) { anim = false; refresh(); return; }
      anim = true; sim.t = 0; sim.play();
    });
    box.append(ro, el("div", { class: "btn-row" }, go), note);
    refresh();
  });

  /* =====================================================================
     2. Revision-plan weighting: marks range x (6 - confidence)
     ===================================================================== */
  let planSliders = null;
  mount("w-plan", (box) => {
    const ctl = controls(box);
    const hrs = HE.slider(ctl, { label: "Revision time available (hours)", min: 5, max: 80, step: 1, value: 30, unit: "h", oninput: () => compute() });
    const words = ["", "very shaky", "shaky", "okay", "good", "very secure"];
    const list = el("div", { class: "exm-plan" });
    const rows = AREAS.map((a) => {
      const row = el("div", { class: "exm-plan-row" });
      row.append(el("h4", null, a.name + " ", el("a", { href: a.deck, "aria-label": `Open the ${a.deckName} deck` }, "→ " + a.deckName)));
      const mid = (a.lo + a.hi) / 2;
      const sc = el("div", { class: "exm-scale", role: "img", "aria-label": `${a.name}: between ${a.lo} and ${a.hi} marks in the question paper` });
      sc.append(el("i", { style: `left:${a.lo / 35 * 100}%;width:${(a.hi - a.lo) / 35 * 100}%` }), el("b", { style: `left:calc(${mid / 35 * 100}% - 1px)` }));
      row.append(sc, el("div", { class: "exm-scale-cap" }, el("span", null, `${a.lo}–${a.hi} marks (scale 0–35)`), el("span", null, `midpoint ${N(mid, 1)}`)));
      const sl = HE.slider(row, { label: `Confidence: ${a.name}`, min: 1, max: 5, step: 1, value: 3, fmt: (v) => `${v} · ${words[v]}`, oninput: () => compute() });
      const bar = el("div", { class: "exm-hours-bar" });
      const num = el("span", { class: "exm-hours-num" });
      const wrap = el("div", { class: "exm-hours" }, el("div", { style: "flex:1;min-width:0" }, bar), num);
      row.append(wrap);
      list.append(row);
      return { a, mid, sl, bar, num };
    });
    planSliders = rows;
    const out = el("p", { class: "sim-note", "aria-live": "polite" });
    const useMap = el("button", { class: "btn small", type: "button" }, "Set confidence from my revision-map ticks");
    useMap.addEventListener("click", () => {
      const t = store.get("map", {});
      rows.forEach((r) => {
        const n = (MAPDATA[r.a.id] || []).length;
        const done = (MAPDATA[r.a.id] || []).filter((_, i) => t[`${r.a.id}:${i}`]).length;
        r.sl.set(1 + Math.round(4 * (n ? done / n : 0)));
      });
    });
    function compute() {
      const H = hrs.value;
      const ws = rows.map((r) => r.mid * (6 - r.sl.value));
      const S = ws.reduce((a, b) => a + b, 0);
      let best = 0;
      rows.forEach((r, i) => {
        const h = H * ws[i] / S;
        r.bar.style.width = (h / H * 100 / 0.5) + "%";
        r.bar.style.maxWidth = "100%";
        r.num.textContent = `${N(h, 1)} h`;
        if (ws[i] > ws[best]) best = i;
      });
      const top = rows[best];
      out.textContent = `Biggest share: ${top.a.name} (${N(H * ws[best] / S, 1)} h of ${H} h). Weight = midpoint of the mark range × (6 − confidence).`;
    }
    box.append(list, el("div", { class: "btn-row" }, useMap), out);
    compute();
  });

  /* =====================================================================
     3. Pace race: 150 minutes, 110 marks
     ===================================================================== */
  mount("w-pace", (box) => {
    const cv = canvasIn(box, "");
    const ctl = controls(box);
    let hold = 10, pace = 1.5, scrub;
    const ro = el("div", { class: "readouts", "aria-live": "polite" });
    const note = el("p", { class: "sim-note", "aria-live": "polite" });
    let last = -1;
    const target = () => (150 - hold) / 110;
    const sim = HE.sim(cv, {
      w: 600, h: 300, loop: true, height: (w) => Math.round(Math.max(230, w * 0.5)),
      draw(ctx, t, dt, C, S) {
        const tm = (t * 12.5) % 150, tp = target();
        const box2 = { x: 46, y: 14, w: S.w - 62, h: S.h - 58 };
        const P = HE.plot(ctx, box2, { x0: 0, x1: 150, y0: 0, y1: 110, xt: 30, yt: 20, xl: "minutes", yl: "marks banked", C });
        // section 1 line
        ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(20)); ctx.lineTo(P.X(150), P.Y(20)); ctx.stroke(); ctx.restore();
        HE.label(ctx, "Section 1: 20 marks", P.X(150) - 4, P.Y(20) + 11, { align: "right", size: 11, col: C.muted });
        // lines
        const yT = (m) => Math.min(110, m / tp), yU = (m) => Math.min(110, m / pace);
        ctx.lineWidth = 3; ctx.lineCap = "round";
        ctx.strokeStyle = C.grass; ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(0)); ctx.lineTo(P.X(tp * 110), P.Y(110)); ctx.lineTo(P.X(150), P.Y(110)); ctx.stroke();
        ctx.strokeStyle = C.lode; ctx.beginPath(); ctx.moveTo(P.X(0), P.Y(0)); ctx.lineTo(P.X(Math.min(150, pace * 110)), P.Y(yU(Math.min(150, pace * 110)))); ctx.stroke();
        // cursor
        ctx.strokeStyle = C.ink2; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.X(tm), box2.y); ctx.lineTo(P.X(tm), box2.y + box2.h); ctx.stroke();
        HE.dot(ctx, P.X(tm), P.Y(yT(tm)), C.grass, 6, C.card);
        HE.dot(ctx, P.X(tm), P.Y(yU(tm)), C.lode, 6, C.card);
        const diff = yU(tm) - yT(tm);
        const clock = `${Math.floor(tm / 60)}:${String(Math.floor(tm % 60)).padStart(2, "0")}`;
        HE.label(ctx, `Clock ${clock} h:min`, box2.x + 6, box2.y + 8, { size: 12, bold: true });
        HE.label(ctx, diff >= 0.5 ? `${N(diff, 0)} marks ahead` : diff <= -0.5 ? `${N(-diff, 0)} marks behind` : "on pace", box2.x + 6, box2.y + 24, { size: 12, col: diff < -0.5 ? C.red : C.grass, bold: true });
        const mi = Math.floor(tm);
        if (scrub && mi !== last && !scrub.input.matches(":active")) { last = mi; scrub.sync(mi); }
      },
    });
    const play = HE.playButton(sim);
    HE.slider(ctl, { label: "Minutes you hold back for checking", min: 0, max: 30, step: 5, value: hold, unit: "min", oninput: (v) => { hold = v; refresh(); } });
    HE.slider(ctl, { label: "My pace (minutes per mark)", min: 0.8, max: 2, step: 0.05, value: pace, fmt: (v) => N(v, 2), oninput: (v) => { pace = v; refresh(); } });
    scrub = HE.slider(ctl, { label: "Exam clock (drag to scrub)", min: 0, max: 150, step: 1, value: 0, unit: "min", oninput: (v) => { sim.t = v / 12.5; last = v; sim.redraw(); } });
    function refresh() {
      const tp = target(), banked = Math.min(110, 150 / pace), fin = 110 * pace;
      ro.innerHTML = "";
      const sec = (s) => `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, "0")} s`;
      ro.append(
        el("div", null, el("b", null, `${N(tp, 2)} min`), el("span", null, `target pace per mark (${sec(tp * 60)})`)),
        el("div", null, el("b", null, `${N(20 * tp, 1)} min`), el("span", null, "target time for Section 1 (20 marks)")),
        el("div", null, el("b", null, `${N(banked, 0)} / 110`), el("span", null, "marks banked by 2 h 30 min at my pace")),
        el("div", null, el("b", null, fin > 150 ? "never" : `${N(fin, 0)} min`), el("span", null, "time my pace needs for all 110 marks")));
      note.textContent = pace <= tp + 1e-9
        ? "At this pace you finish all 110 marks inside your target, with your checking time in hand."
        : fin <= 150
          ? `You finish all 110 marks in ${N(fin, 0)} minutes, but you use up some of the ${hold} minutes you wanted for checking.`
          : `At this pace about ${N(110 - 150 / pace, 0)} marks would be left unattempted. Speed up on the easy marks, and move on from questions that are stalling.`;
      cv.setAttribute("aria-label", `Graph of marks banked against minutes. Target pace ${N(tp, 2)} minutes per mark. At your pace of ${N(pace, 2)} minutes per mark you bank ${N(banked, 0)} of 110 marks in 150 minutes.`);
      sim.redraw();
    }
    box.append(el("div", { class: "btn-row" }, play), ro, note);
    refresh();
    legendAfter(cv, [["var(--grass)", "target pace"], ["var(--lode)", "my pace"]]);
  });
  function legendAfter(cv, items) {
    const lg = el("div", { class: "legend" });
    items.forEach(([c, t]) => lg.append(el("span", null, el("i", { style: `background:${c}` }), t)));
    cv.after(lg);
  }

  /* =====================================================================
     4. Find the formula: every relationship in the Data Booklet
     ===================================================================== */
  const F = (sec, q, tex, eq) => ({ sec, q, tex, eq });
  const BANK = [
    F("Energy and power", "You know the <b>mass</b>, the <b>height</b> it is lifted through, and $g$. You want the <b>energy stored</b> by lifting.", "E_p = mgh"),
    F("Energy and power", "You know the <b>mass</b> and the <b>speed</b>. You want the <b>energy of motion</b>.", "E_k = \\tfrac{1}{2}mv^2"),
    F("Energy and power", "You know the <b>mass of water</b>, its <b>temperature rise</b> and its specific heat capacity. You want the <b>heat energy</b>.", "E_h = cm\\Delta T"),
    F("Energy and power", "You know the <b>voltage</b>, the <b>current</b> and the <b>time</b>. You want the <b>electrical energy</b> transferred.", "E_e = VIt"),
    F("Energy and power", "You know the <b>force</b> and the <b>distance moved</b> in its direction. You want the <b>work done</b>.", "E_w = Fd"),
    F("Energy and power", "You know the <b>energy transferred</b> and the <b>time</b>. You want the <b>power</b>.", "P = \\dfrac{E}{t}"),
    F("Energy and power", "You know the <b>voltage</b> across a component and the <b>current</b> through it. You want its <b>electrical power</b>.", "P = VI"),
    F("Energy and power", "You know only the <b>current</b> through a resistor and its <b>resistance</b>. You want the <b>power</b> it dissipates.", "P = I^2R"),
    F("Energy and power", "You know only the <b>voltage</b> across a resistor and its <b>resistance</b>. You want the <b>power</b> it dissipates.", "P = \\dfrac{V^2}{R}"),
    F("Energy and power", "You know the <b>force</b> and the <b>speed</b> of the thing it pushes. You want the <b>mechanical power</b>.", "P = Fv"),
    F("Energy and power", "You know the <b>torque</b> and the <b>rotational speed</b> of a shaft. You want the <b>mechanical power</b> (watch the units of $n$).", "P = 2\\pi nT"),
    F("Energy and power", "You know the <b>useful output</b> and the <b>input</b>. You want the <b>efficiency</b>.", "\\eta = \\dfrac{E_{out}}{E_{in}} = \\dfrac{P_{out}}{P_{in}}"),
    F("Mechanisms", "You know the <b>input speed</b> and the <b>output speed</b> of a drive. You want the <b>velocity ratio</b>.", "VR = \\dfrac{\\text{speed of input}}{\\text{speed of output}}"),
    F("Mechanisms", "A belt drive: you know both <b>pulley sizes</b> and the <b>driver's speed</b>. You want the <b>driven speed</b>.", "\\text{input speed}\\times\\text{input size} = \\text{output speed}\\times\\text{output size}"),
    F("Mechanisms", "You know the <b>force</b> on a drum rim and the <b>radius</b>. You want the <b>torque</b>.", "T = Fr"),
    F("Mechanisms", "You know the <b>diameter</b> of a wheel. You want how far one turn of its rim travels: the <b>circumference</b>.", "C = \\pi d"),
    F("Mechanisms", "You know a <b>force</b> and its <b>perpendicular distance</b> from a pivot. You want the <b>moment</b>.", "M = Fx"),
    F("Mechanisms", "A beam is balanced on its pivot. You want to relate the <b>clockwise</b> and <b>anticlockwise</b> moments.", "\\Sigma M = 0\\quad(\\Sigma\\text{clockwise} = \\Sigma\\text{anticlockwise})", "equil"),
    F("Mechanisms", "A frame is in equilibrium. State <b>all three conditions</b> you can use to find unknown forces.", "\\Sigma F_h = 0,\\quad \\Sigma F_v = 0,\\quad \\Sigma M = 0", "equil"),
    F("Pneumatic systems", "You know the <b>air pressure</b> and the <b>piston area</b>. You want the <b>force</b> (or the other way round).", "P = \\dfrac{F}{A}"),
    F("Pneumatic systems", "You are given the piston's <b>diameter</b>. You want its <b>area</b>.", "A = \\dfrac{\\pi d^2}{4}", "area"),
    F("Pneumatic systems", "You are given the piston's <b>radius</b>. You want its <b>area</b>.", "A = \\pi r^2", "area"),
    F("Structures", "You know the <b>force</b> on a bar and its <b>cross-sectional area</b>. You want the <b>stress</b>.", "\\sigma = \\dfrac{F}{A}"),
    F("Structures", "You know the <b>extension</b> and the <b>original length</b>. You want the <b>strain</b>.", "\\varepsilon = \\dfrac{\\Delta l}{l}"),
    F("Structures", "You know the <b>force</b> and the <b>extension</b> (in the elastic region). You want the <b>energy stored</b> in the bar.", "E_s = \\tfrac{1}{2}Fx"),
    F("Structures", "You know the <b>stress</b> and the <b>strain</b> in the elastic region. You want the <b>Young's modulus</b>.", "E = \\dfrac{\\sigma}{\\varepsilon}"),
    F("Structures", "You know the <b>ultimate</b> and <b>safe working</b> values. You want the <b>factor of safety</b>.", "\\text{FoS} = \\dfrac{\\text{ultimate load}}{\\text{safe working load}} = \\dfrac{\\text{ultimate stress}}{\\text{safe working stress}}"),
    F("Electrical and electronic", "You know the <b>voltage</b> across a resistor and the <b>current</b> through it. You want the <b>resistance</b>.", "V = IR"),
    F("Electrical and electronic", "Resistors are joined <b>in series</b>. You want the <b>total resistance</b>.", "R_t = R_1 + R_2 + R_3 + \\dots"),
    F("Electrical and electronic", "<b>Exactly two</b> resistors are in parallel. You want a quick <b>total resistance</b>.", "R_t = \\dfrac{R_1R_2}{R_1 + R_2}", "par"),
    F("Electrical and electronic", "<b>Three or more</b> resistors are in parallel. You want the <b>total resistance</b>.", "\\dfrac{1}{R_t} = \\dfrac{1}{R_1} + \\dfrac{1}{R_2} + \\dfrac{1}{R_3} + \\dots", "par"),
    F("Electrical and electronic", "Several wires meet at a <b>node</b>. How do the <b>currents</b> relate?", "\\Sigma I = 0"),
    F("Electrical and electronic", "Round a <b>closed loop</b>, how do the <b>supply voltages</b> relate to the voltage drops?", "\\Sigma E = \\Sigma IR"),
    F("Electrical and electronic", "Two resistors in series share a supply. You want how the <b>voltage divides</b> between them.", "\\dfrac{V_1}{V_2} = \\dfrac{R_1}{R_2}"),
    F("Transistors", "You know a bipolar transistor's <b>collector current</b> and <b>base current</b>. You want its <b>current gain</b>.", "h_{FE} = \\dfrac{I_c}{I_b}"),
    F("Transistors", "You know the <b>change in drain current</b> and the <b>change in gate–source voltage</b> of a MOSFET. You want its <b>transconductance</b>.", "g_m = \\dfrac{\\Delta I_d}{\\Delta V_{gs}}"),
    F("Op-amps", "The signal goes through $R_i$ to the <b>inverting (−)</b> input, with $R_f$ as feedback. You want $V_o$.", "V_o = -\\dfrac{R_f}{R_i}V_i"),
    F("Op-amps", "The signal goes to the <b>non-inverting (+)</b> input; $R_f$ and $R_i$ set the gain. You want $V_o$.", "V_o = \\left(1 + \\dfrac{R_f}{R_i}\\right)V_i"),
    F("Op-amps", "An op-amp has <b>no feedback</b> and compares $V_i$ with $V_{ref}$. When does the output saturate <b>positively</b>?", "V_i \\lt V_{ref}\\ \\Rightarrow\\ V_o\\ \\text{saturates positively}"),
    F("Op-amps", "Two inputs $V_1$ and $V_2$ go to a <b>difference amplifier</b>. You want $V_o$.", "V_o = \\dfrac{R_f}{R_i}(V_2 - V_1)"),
    F("Op-amps", "Several inputs feed one inverting op-amp through $R_1, R_2, \\dots$ (a <b>summing amplifier</b>). You want $V_o$.", "V_o = -R_f\\left(\\dfrac{V_1}{R_1} + \\dfrac{V_2}{R_2} + \\dots\\right)"),
    F("Op-amps", "A <b>voltage follower</b> buffers a signal. What is $V_o$?", "V_o = V_i"),
  ];

  mount("w-find", (box) => {
    const stage = el("div");
    const start = el("button", { class: "btn small primary", type: "button" }, "▶ Start: 10 rounds");
    let hard = false;
    const row = el("div", { class: "btn-row" }, start);
    box.append(row);
    HE.choice(box, "Wrong options come from", [["any", "any section"], ["same", "the same section (harder)"]], "any", (v) => { hard = v === "same"; });
    box.append(stage);
    let round = [], i = 0, right = 0, t0 = 0;
    const best = () => store.get("findBest", null);
    function options(item) {
      const pool = BANK.filter((x) => x !== item && !(item.eq && x.eq === item.eq) && x.tex !== item.tex);
      let cand = hard ? pool.filter((x) => x.sec === item.sec) : pool;
      if (cand.length < 3) cand = pool;
      return shuffle([item, ...shuffle(cand.slice()).slice(0, 3)]);
    }
    function ask() {
      stage.innerHTML = "";
      if (i >= round.length) {
        const s = (Date.now() - t0) / 1000, b = best();
        const prev = b && b.right >= right && b.time <= s ? b : null;
        if (!b || right > b.right || (right === b.right && s < b.time)) store.set("findBest", { right, time: Math.round(s) });
        stage.append(el("p", { class: "readout", style: "font-family:var(--font-body)", "aria-live": "polite" },
          `${right} out of ${round.length} in ${Math.floor(s / 60)} min ${Math.round(s % 60)} s (${N(s / round.length, 1)} s per question). ` +
          (right === round.length ? "Every relationship found: you know your booklet." : "Look at the booklet sections for the ones you missed.") +
          (prev ? ` Your best so far: ${prev.right}/${round.length} in ${prev.time} s.` : "")));
        start.textContent = "↺ Play again";
        return;
      }
      const item = round[i], opts = options(item);
      const stem = el("p", { class: "q-stem", html: `Round ${i + 1} of ${round.length}: ${item.q} <br>Which relationship do you use?` });
      const grid = el("div", { class: "q-opts", role: "group", "aria-label": "Relationships" });
      const fb = el("div", { class: "q-feedback", "aria-live": "polite" });
      const next = el("button", { class: "btn small primary", type: "button", hidden: true }, i < round.length - 1 ? "Next round →" : "See your score →");
      opts.forEach((o) => {
        const b = el("button", { class: "q-opt", type: "button", html: `$${o.tex}$` });
        b.dataset.ok = o === item ? "1" : "";
        b.addEventListener("click", () => {
          if (b.getAttribute("aria-disabled")) return;
          grid.querySelectorAll(".q-opt").forEach((x) => { x.setAttribute("aria-disabled", "true"); if (x.dataset.ok) x.classList.add("right"); });
          const ok = o === item;
          if (ok) right++; else b.classList.add("wrong");
          fb.innerHTML = (ok ? "<span class='ok'>Correct.</span> " : "<span class='bad'>Not this one.</span> ") + `It is in the booklet section <b>${item.sec}</b>.`;
          next.hidden = false; next.focus();
        });
        grid.append(b);
      });
      next.addEventListener("click", () => { i++; ask(); });
      stage.append(stem, grid, fb, el("div", { class: "btn-row" }, next));
      HE.math(stage);
      if (i) { const f = grid.querySelector(".q-opt"); if (f) f.focus(); }
    }
    start.addEventListener("click", () => { round = shuffle(BANK.slice()).slice(0, 10); i = 0; right = 0; t0 = Date.now(); ask(); });
  });

  /* =====================================================================
     5. Units and prefixes drill (typed answers)
     ===================================================================== */
  const SUPD = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };
  function parseNum(s) {
    s = String(s).trim().replace(/−/g, "-").replace(/,/g, "").replace(/\s+/g, "");
    s = s.replace(/10([⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+)/g, (m, g) => "10^" + g.split("").map((ch) => SUPD[ch]).join(""));
    let m = s.match(/^(-?\d*\.?\d+)(?:[x×*]10\^?\(?(-?\d+)\)?)?$/i);
    if (m) return parseFloat(m[1]) * Math.pow(10, m[2] ? +m[2] : 0);
    m = s.match(/^(-?\d*\.?\d+)e(-?\d+)$/i);
    if (m) return parseFloat(m[1]) * Math.pow(10, +m[2]);
    return NaN;
  }
  const fmtStd = (x) => {
    if (x === 0) return "0";
    const e = Math.floor(Math.log10(Math.abs(x)));
    if (e >= -3 && e <= 5) return String(+x.toPrecision(6)).replace("-", "−");
    return `${+(x / Math.pow(10, e)).toPrecision(6)} × 10${HE.sup(e)}`;
  };
  function unitBank() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const vals = [1.5, 2.2, 3.3, 4.7, 6.8, 10, 22, 47, 100, 150, 220, 470];
    const gen = [
      () => { const v = pick(vals); return { q: `$${v}\\ \\mathrm{k\\Omega}$ in ohms (Ω)`, ans: v * 1e3, why: "kilo means ×1000, so move the number up by 10³." }; },
      () => { const v = pick(vals); return { q: `$${v}\\ \\mathrm{M\\Omega}$ in ohms (Ω)`, ans: v * 1e6, why: "mega means ×10⁶." }; },
      () => { const v = pick(vals); return { q: `$${v}\\ \\mu\\mathrm{A}$ in amperes (A)`, ans: v * 1e-6, why: "micro means ×10⁻⁶." }; },
      () => { const v = pick(vals); return { q: `$${v}\\ \\mathrm{mA}$ in amperes (A)`, ans: v * 1e-3, why: "milli means ×10⁻³, so divide by 1000." }; },
      () => { const v = pick(vals); return { q: `$${v}\\ \\mathrm{mV}$ in volts (V)`, ans: v * 1e-3, why: "milli means ×10⁻³." }; },
      () => { const v = pick([0.0047, 0.012, 0.025, 0.068, 0.15]); return { q: `$${v}\\ \\mathrm{A}$ in milliamperes (mA)`, ans: v * 1e3, why: "Going to the smaller unit gives a bigger number: ×1000." }; },
      () => { const v = pick([600, 900, 1200, 1440, 1500, 2400, 3000]); return { q: `$${v}$ revs per minute in revs per second`, ans: v / 60, why: "Divide by 60 seconds. The booklet's $P = 2\\pi nT$ needs revs per second." }; },
      () => { const v = pick([25, 40, 50, 78.5, 113, 201, 314]); return { q: `$${v}\\ \\mathrm{mm^2}$ in square metres (m²)`, ans: v * 1e-6, why: "1 mm = 10⁻³ m, so 1 mm² = 10⁻⁶ m² (the factor is squared)." }; },
      () => { const v = pick([2.5, 6, 12, 18, 40, 125]); return { q: `$${v}\\ \\mathrm{kN}$ in newtons (N)`, ans: v * 1e3, why: "kilo means ×1000." }; },
      () => { const v = pick([70, 110, 196, 200]); return { q: `Young's modulus $${v}\\ \\mathrm{kN\\,mm^{-2}}$ in $\\mathrm{N\\,mm^{-2}}$`, ans: v * 1e3, why: "Only the kilo changes: 1 kN = 1000 N, and the mm⁻² stays." }; },
      () => { const v = pick([55, 220, 250, 430]); return { q: `A stress of $${v}\\ \\mathrm{N\\,mm^{-2}}$ in pascals (N m⁻²)`, ans: v * 1e6, why: "1 N mm⁻² = 1 N per 10⁻⁶ m² = 10⁶ N m⁻² (1 MPa)." }; },
      () => { const v = pick([12, 20, 40, 63, 80, 125]); return { q: `$${v}\\ \\mathrm{mm}$ in metres (m)`, ans: v * 1e-3, why: "milli means ×10⁻³: divide by 1000." }; },
      () => { const v = pick([0.5, 1.5, 2.5, 4, 7.5]); return { q: `$${v}$ minutes in seconds`, ans: v * 60, why: "Multiply by 60." }; },
      () => { const v = pick([2.2, 4.7, 10, 33]); return { q: `$${v}\\ \\mathrm{k\\Omega}$ in megohms (MΩ)`, ans: v * 1e-3, why: "1 MΩ = 1000 kΩ, so divide by 1000." }; },
    ];
    return shuffle(gen.slice()).slice(0, 10).map((g) => g());
  }
  mount("w-units", (box) => {
    const stage = el("div", { "aria-live": "polite" });
    const start = el("button", { class: "btn small primary", type: "button" }, "▶ Start the drill");
    box.append(el("div", { class: "btn-row" }, start), stage);
    let qs = [], i = 0, right = 0;
    function ask() {
      stage.innerHTML = "";
      if (i >= qs.length) { stage.append(el("p", { class: "readout", style: "font-family:var(--font-body)" }, `${right} out of ${qs.length}. ${right === qs.length ? "Perfect: those conversions are automatic." : "Drill again: a wrong power of ten loses the whole answer."}`)); start.textContent = "↺ New drill"; return; }
      const q = qs[i];
      const inp = el("input", { type: "text", inputmode: "decimal", "aria-label": "Your answer, as a number", autocomplete: "off", style: "width:12em" });
      const chk = el("button", { class: "btn small primary", type: "submit" }, "Check");
      const fb = el("div", { class: "q-feedback", "aria-live": "polite" });
      const form = el("form", { class: "btn-row" }, el("label", null, "Answer ", inp), chk);
      const next = el("button", { class: "btn small primary", type: "button", hidden: true }, i < qs.length - 1 ? "Next →" : "See score →");
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        if (chk.disabled) return;
        const v = parseNum(inp.value);
        if (!isFinite(v)) { fb.innerHTML = "<span class='bad'>Type a number</span>, such as 4700, 4.7e3 or 4.7×10^3."; return; }
        const ok = Math.abs(v - q.ans) <= 1e-9 * Math.abs(q.ans) + 1e-15;
        if (ok) right++;
        chk.disabled = true; inp.readOnly = true;
        fb.innerHTML = (ok ? "<span class='ok'>Correct.</span> " : `<span class='bad'>Not quite:</span> the answer is <b>${fmtStd(q.ans)}</b>. `) + q.why;
        next.hidden = false; next.focus();
      });
      next.addEventListener("click", () => { i++; ask(); });
      stage.append(el("p", { class: "q-stem", html: `Question ${i + 1} of ${qs.length}: convert ${q.q}` }), form, fb, el("div", { class: "btn-row" }, next));
      HE.math(stage);
      if (i) inp.focus();
    }
    start.addEventListener("click", () => { qs = unitBank(); i = 0; right = 0; ask(); });
  });

  /* =====================================================================
     6. The calculation script: formula, substitution, answer with unit
     ===================================================================== */
  mount("w-layout", (box) => {
    let T = 24, rpm = 1200;
    const stem = el("p", { class: "q-stem", "aria-live": "polite" });
    const fsel = el("select", { id: "lay-f", "aria-label": "Relationship" });
    [["", "— choose a relationship —"], ["wrong1", "P = Fv"], ["right", "P = 2πnT"], ["wrong2", "P = VI"], ["wrong3", "T = Fr"], ["wrong4", "P = E/t"]].forEach(([v, t]) => fsel.append(el("option", { value: v }, t)));
    const nin = el("input", { type: "number", step: "any", id: "lay-n", "aria-label": "Rotational speed n in revolutions per second" });
    const ain = el("input", { type: "number", step: "any", id: "lay-a", "aria-label": "Final answer, number only" });
    const usel = el("select", { id: "lay-u", "aria-label": "Unit of the final answer" });
    ["", "W", "kW", "N m", "J", "rev/s"].forEach((u) => usel.append(el("option", { value: u }, u || "— unit —")));
    const script = el("div", { class: "exm-script" },
      el("label", null, el("span", null, el("span", { class: "exm-tag" }, "•1"), "Write the relationship (from the Data Booklet)"), fsel),
      el("label", null, el("span", null, el("span", { class: "exm-tag" }, "•2"), "Substitute: what value of n goes into the formula?"), el("span", { class: "exm-line" }, nin, "rev/s")),
      el("label", null, el("span", null, el("span", { class: "exm-tag" }, "•3"), "Answer with its unit (3 significant figures)"), el("span", { class: "exm-line" }, ain, usel)));
    const mark = el("button", { class: "btn small primary", type: "button" }, "Mark my script");
    const fresh = el("button", { class: "btn small", type: "button" }, "↺ New numbers");
    const out = el("div", { "aria-live": "polite" });
    const P = () => 2 * Math.PI * (rpm / 60) * T;
    function newQ() {
      T = [18, 24, 30, 36, 45][Math.floor(Math.random() * 5)];
      rpm = [600, 900, 1200, 1500, 1800][Math.floor(Math.random() * 5)];
      stem.innerHTML = `A winch-drum motor delivers a torque of <b>${T} N m</b> at <b>${rpm} rev/min</b>. Calculate its output power.`;
      fsel.value = ""; nin.value = ""; ain.value = ""; usel.value = ""; out.innerHTML = "";
    }
    mark.addEventListener("click", () => {
      const p = P(), n = rpm / 60;
      const m1 = fsel.value === "right";
      const nv = parseFloat(nin.value), m2 = m1 && isFinite(nv) && Math.abs(nv - n) < 1e-6 * n + 1e-9;
      const av = parseFloat(ain.value), u = usel.value;
      const val = u === "W" ? p : u === "kW" ? p / 1000 : NaN;
      const m3 = m2 && isFinite(av) && isFinite(val) && Math.abs(av - val) / val < 0.006;
      const ul = el("ul", { class: "exm-marklist" });
      const li = (ok, t) => ul.append(el("li", { class: ok ? "ok" : "no", html: (ok ? "✔ " : "✘ ") + t }));
      li(m1, m1 ? "•1 The relationship $P = 2\\pi nT$ is the one that links torque, speed and power." : "•1 not earned: the relationship that links <b>torque</b> and <b>rotational speed</b> to power is $P = 2\\pi nT$.");
      li(m2, m2 ? `•2 Substitution right: n = ${rpm} ÷ 60 = ${N(n, 3)} rev/s.` : `•2 not earned: the booklet's $n$ is in revolutions per <b>second</b>. ${rpm} rev/min ÷ 60 = ${N(n, 3)} rev/s. Using ${rpm} directly would give ${N(2 * Math.PI * rpm * T, 0)} W: 60 times too big.`);
      const unitOk = (u === "W" || u === "kW");
      li(m3, m3 ? `•3 Answer ${HE.fmt(p, 3)} W (${HE.fmt(p / 1000, 3)} kW), with a unit.` : `•3 not earned: the answer is ${HE.fmt(p, 3)} W (or ${HE.fmt(p / 1000, 3)} kW).` + (!unitOk && isFinite(av) ? " A number with the wrong or missing unit loses this mark." : ""));
      out.innerHTML = ""; out.append(ul, el("p", { class: "hint", html: `Full calculation: $P = 2\\pi nT = 2\\pi \\times ${N(n, 3)} \\times ${T} = ${N(p, 1)}\\ \\mathrm{W}$. <br><em>Typical allocation in the style of a 3-mark calculation (formula, substitution, answer with unit). This is not an official marking scheme.</em>` }));
      HE.math(out);
    });
    fresh.addEventListener("click", newQ);
    box.append(stem, script, el("div", { class: "btn-row" }, mark, fresh), out);
    newQ();
  });

  /* =====================================================================
     7. The rounding trap
     ===================================================================== */
  mount("w-round", (box) => {
    const ctl = controls(box);
    const out = el("div", { "aria-live": "polite" });
    const m = 1100, v = 18, share = 0.8, c = 490, md = 8.0;
    const sfr = (x, sf) => +x.toPrecision(sf);
    const s = HE.slider(ctl, { label: "Significant figures kept in the intermediate answers", min: 2, max: 6, step: 1, value: 3, oninput: () => draw() });
    function draw() {
      const sf = s.value;
      const Ek = 0.5 * m * v * v, Eh = share * Ek, dT = Eh / (c * md);
      const Ek2 = sfr(Ek, sf), Eh2 = sfr(share * Ek2, sf), dT2 = Eh2 / (c * md);
      const a = sfr(dT, 3), b = sfr(dT2, 3), same = a === b;
      out.innerHTML = "";
      out.append(el("div", { class: "exm-twocol" },
        el("div", null, el("h4", null, "Carry full calculator values"), el("p", null, `Ek = ${N(Ek, 4)} J`), el("p", null, `E to discs = ${N(Eh, 4)} J`), el("p", null, `ΔT = ${N(dT, 6)} K`), el("p", null, `Final (3 s.f.): ${HE.fmt(dT, 3)} K`)),
        el("div", null, el("h4", null, `Round each step to ${sf} s.f.`), el("p", null, `Ek = ${HE.fmt(Ek2, sf)} J`), el("p", null, `E to discs = ${HE.fmt(Eh2, sf)} J`), el("p", null, `ΔT = ${N(dT2, 6)} K`), el("p", null, `Final (3 s.f.): ${HE.fmt(dT2, 3)} K`))));
      out.append(el("p", { class: "exm-verdict " + (same ? "good" : "bad") },
        same ? `Same final answer this time (${HE.fmt(dT, 3)} K), but that is luck: the error is hiding below the third figure. Never rely on it.`
          : `Different! ${HE.fmt(dT, 3)} K is correct; ${HE.fmt(dT2, 3)} K is wrong. Rounding in the middle moved the answer by ${N(Math.abs(dT2 - dT) / dT * 100, 2)}%, enough to lose the final mark.`));
    }
    box.append(out);
    draw();
  });

  /* =====================================================================
     8. Pneumatic circuit: say what happens, with the right words
     ===================================================================== */
  mount("w-pneu", (box) => {
    const cv = canvasIn(box, "Animated pneumatic circuit. A 3/2 push-button valve (bottom left) sends a pilot signal to a 5/2 valve with spring return (centre), which supplies a double-acting cylinder (top). Press the button to watch air flow and the piston outstroke; release it to watch the piston instroke.");
    let pressed = false, auto = false, autoT = 0, d = 0, d1 = 0, p = 0;
    const holdBtn = el("button", { class: "btn small primary", type: "button", "aria-pressed": "false" }, "Hold the push button");
    const autoBtn = el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, "Auto demo");
    const now = HE.quiet(el("p", { class: "sim-note", "aria-live": "polite" }));
    const setPressed = (v) => { pressed = v; holdBtn.setAttribute("aria-pressed", String(v)); holdBtn.textContent = v ? "Release the push button" : "Hold the push button"; };
    const sentence = () => {
      if (pressed && d < 0.999) return "The push button is pressed: the 3/2 valve actuates and sends supply air to the pilot port of the 5/2 valve.";
      if (pressed && p < 0.999) return "The 5/2 valve has changed state: supply air goes to the cap end (A), the rod end (B) exhausts, and the piston outstrokes.";
      if (pressed) return "The piston has fully outstroked and stays out while the button is held.";
      if (d > 0.001) return "The button is released: the 3/2 valve returns by its spring and the pilot air exhausts, so the 5/2 valve changes state back (spring return).";
      if (p > 0.001) return "The 5/2 valve now supplies the rod end (B) and the cap end (A) exhausts, so the piston instrokes.";
      return "At rest: the piston is instroked. Press the push button.";
    };
    function geom(W, H) {
      const s = Math.max(30, Math.min(58, W * 0.095)), s1 = s * 0.8;
      const g = { s, s1, xw: W * 0.4, yv: H * 0.46, x1w: W * 0.16, y1: H * 0.7, yR: H * 0.93, cx0: W * 0.3, cx1: W * 0.62, cy: H * 0.1, ch: Math.max(22, H * 0.1), pw: 12 };
      g.A = [g.xw + 0.25 * s, g.yv]; g.B = [g.xw + 0.75 * s, g.yv];
      g.R = [g.xw + 0.17 * s, g.yv + s]; g.P = [g.xw + 0.5 * s, g.yv + s]; g.S = [g.xw + 0.83 * s, g.yv + s];
      g.A1 = [g.x1w + 0.5 * s1, g.y1]; g.R1 = [g.x1w + 0.25 * s1, g.y1 + s1]; g.P1 = [g.x1w + 0.75 * s1, g.y1 + s1];
      g.cap = [g.cx0 + 10, g.cy + g.ch]; g.rod = [g.cx1 - 10, g.cy + g.ch];
      g.ym = (g.cy + g.ch + g.yv) / 2; g.ypil = g.yv + s / 2;
      g.sup = [W * 0.055, g.yR];
      return g;
    }
    function pipePath(ctx, pts, col, w) { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; ctx.beginPath(); pts.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.stroke(); }
    function particles(ctx, pts, dir, t, col) {
      let L = 0; const seg = [];
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); seg.push(l); L += l; }
      if (L < 4) return;
      const n = Math.max(1, Math.floor(L / 16));
      ctx.fillStyle = col;
      for (let k = 0; k < n; k++) {
        let s = (((t * 55 * dir) + k * L / n) % L + L) % L;
        for (let i = 0; i < seg.length; i++) {
          if (s <= seg[i]) { const f = s / seg[i]; ctx.beginPath(); ctx.arc(pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f, 2.6, 0, 7); ctx.fill(); break; }
          s -= seg[i];
        }
      }
    }
    const sim = HE.sim(cv, {
      w: 600, h: 372, height: (w) => Math.round(Math.max(255, w * 0.62)), loop: true,
      draw(ctx, t, dt, C, S) {
        const W = S.w, H = S.h, g = geom(W, H);
        if (dt > 0) {
          if (auto) { autoT += dt; const want = (autoT % 9) < 4.6; if (want !== pressed) setPressed(want); }
          const dT = pressed ? 1 : 0;
          d1 += Math.sign(dT - d1) * Math.min(Math.abs(dT - d1), dt * 8);
          d += Math.sign(dT - d) * Math.min(Math.abs(dT - d), dt * 3.5);
          const pT = d > 0.999 ? 1 : d < 0.001 ? 0 : p;
          p += Math.sign(pT - p) * Math.min(Math.abs(pT - p), dt * 0.42);
        }
        const out = d > 0.5;
        const live = S.playing && ((d > 0.001 && d < 0.999) || (d > 0.999 && p < 0.999) || (d < 0.001 && p > 0.001) || (d1 > 0.001 && d1 < 0.999) || (pressed && d < 0.999) || (!pressed && d > 0.001));
        const press = C.sea, vent = C.muted;
        ctx.font = `bold 12px ${FONT}`; ctx.textBaseline = "middle";
        // ---------- pipes
        const pA = [g.A, [g.A[0], g.ym], [g.cap[0], g.ym], g.cap], pB = [g.B, [g.B[0], g.ym], [g.rod[0], g.ym], g.rod];
        const pS = [g.sup, [g.P[0], g.yR], g.P], pS1 = [[g.P1[0], g.yR], g.P1];
        const pPil = [g.A1, [g.A1[0], g.ypil], [g.xw - g.s - g.pw, g.ypil]];
        pipePath(ctx, pS, press, 3); pipePath(ctx, pS1, press, 3);
        pipePath(ctx, pA, out ? press : vent, 3); pipePath(ctx, pB, out ? vent : press, 3);
        pipePath(ctx, pPil, d1 > 0.5 ? press : vent, 3);
        // exhaust stubs
        ctx.strokeStyle = C.muted; ctx.lineWidth = 2;
        [g.R, g.S, g.R1].forEach((q, i) => { ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0], q[1] + 12); ctx.stroke(); });
        // ---------- cylinder
        const x0 = g.cx0, x1 = g.cx1, cy = g.cy, ch = g.ch, head = x0 + 6 + p * (x1 - x0 - 12);
        ctx.fillStyle = C.paper2; ctx.fillRect(x0, cy, x1 - x0, ch);
        ctx.globalAlpha = 0.35; ctx.fillStyle = out ? press : vent; ctx.fillRect(x0 + 2, cy + 2, head - x0 - 2, ch - 4);
        ctx.fillStyle = out ? vent : press; ctx.fillRect(head, cy + 2, x1 - head - 2, ch - 4); ctx.globalAlpha = 1;
        const tip = head + (x1 - x0 - 6) + 8;
        ctx.fillStyle = C.ink2; ctx.fillRect(head, cy + ch / 2 - 3, tip - head, 6);
        ctx.fillStyle = C.lode; ctx.fillRect(tip, cy + ch / 2 - ch * 0.7, 9, ch * 1.4);
        ctx.fillStyle = C.ink; ctx.fillRect(head - 3, cy + 2, 6, ch - 4);
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2.5; ctx.strokeRect(x0, cy, x1 - x0, ch);
        ctx.fillStyle = C.ink; ctx.textAlign = "center";
        HE.label(ctx, "A", g.cap[0] - 9, cy + ch + 8, { size: 12, bold: true, align: "center" });
        HE.label(ctx, "B", g.rod[0] + 9, cy + ch + 8, { size: 12, bold: true, align: "center" });
        HE.label(ctx, "cap end", x0 + 2, cy - 9, { size: 11, align: "left", col: C.ink2 });
        HE.label(ctx, "rod end", x1 - 2, cy - 9, { size: 11, align: "right", col: C.ink2 });
        // ---------- valve drawing helper (two squares that slide)
        const arrow = (xa, ya, xb, yb, col) => HE.arrow(ctx, xa, ya, xb, yb, col, 2, 6);
        // 5/2 valve
        {
          const s = g.s, gx = g.xw - s + d * s, y = g.yv;
          // actuators
          ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
          ctx.strokeRect(g.xw - s - g.pw, y + s * 0.25, g.pw, s * 0.5);
          ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(g.xw - s - g.pw, y + s / 2); ctx.lineTo(g.xw - s - g.pw - 1, y + s / 2); ctx.stroke(); ctx.setLineDash([]);
          if (d > 0.001) { ctx.fillStyle = d1 > 0.5 ? press : vent; ctx.fillRect(g.xw - s, y + s * 0.4, d * s, s * 0.2); }
          // spring on the right
          const wall = g.xw + 2 * s + s * 0.5, sx = gx + 2 * s;
          ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(sx, y + s / 2);
          const zl = Math.max(4, wall - sx), zn = 6; for (let k = 1; k <= zn; k++) ctx.lineTo(sx + zl * k / zn, y + s / 2 + (k % 2 ? -s * 0.16 : s * 0.16)); ctx.lineTo(wall, y + s / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wall, y + s * 0.2); ctx.lineTo(wall, y + s * 0.8); ctx.stroke();
          for (let k = 0; k < 2; k++) {
            const sx0 = gx + k * s, active = (k === 0) === (d > 0.5);
            ctx.fillStyle = C.card; ctx.fillRect(sx0, y, s, s);
            ctx.strokeStyle = active ? C.lode : C.ink; ctx.lineWidth = active ? 3 : 2; ctx.strokeRect(sx0, y, s, s);
            const col = active ? press : C.muted;
            if (k === 0) { arrow(sx0 + 0.5 * s, y + s, sx0 + 0.25 * s, y, col); arrow(sx0 + 0.75 * s, y, sx0 + 0.83 * s, y + s, col); }
            else { arrow(sx0 + 0.5 * s, y + s, sx0 + 0.75 * s, y, col); arrow(sx0 + 0.25 * s, y, sx0 + 0.17 * s, y + s, col); }
          }
          HE.label(ctx, "A", g.A[0] - 8, y - 8, { size: 11, bold: true, align: "center" });
          HE.label(ctx, "B", g.B[0] + 8, y - 8, { size: 11, bold: true, align: "center" });
          HE.label(ctx, "5/2", wall + 6, y + s / 2, { size: 13, bold: true, col: C.lode });
          HE.label(ctx, "P", g.P[0] + 9, y + s + 9, { size: 11, bold: true, align: "center" });
        }
        // 3/2 push-button valve
        {
          const s = g.s1, gx = g.x1w - s + d1 * s, y = g.y1;
          ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(g.x1w - s - 12, y + s * 0.2, 12, s * 0.6);
          ctx.beginPath(); ctx.moveTo(g.x1w - s - 12, y + s * 0.5); ctx.lineTo(g.x1w - s - 17, y + s * 0.5); ctx.stroke();
          ctx.fillStyle = pressed ? C.lode : C.paper2; ctx.fillRect(g.x1w - s - 12 + 1, y + s * 0.2 + 1, 10, s * 0.6 - 2);
          const wall = g.x1w + 2 * s + s * 0.5, sx = gx + 2 * s;
          ctx.strokeStyle = C.ink2; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(sx, y + s / 2);
          const zl = Math.max(4, wall - sx), zn = 5; for (let k = 1; k <= zn; k++) ctx.lineTo(sx + zl * k / zn, y + s / 2 + (k % 2 ? -s * 0.16 : s * 0.16)); ctx.lineTo(wall, y + s / 2); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(wall, y + s * 0.2); ctx.lineTo(wall, y + s * 0.8); ctx.stroke();
          for (let k = 0; k < 2; k++) {
            const sx0 = gx + k * s, active = (k === 0) === (d1 > 0.5);
            ctx.fillStyle = C.card; ctx.fillRect(sx0, y, s, s);
            ctx.strokeStyle = active ? C.lode : C.ink; ctx.lineWidth = active ? 3 : 2; ctx.strokeRect(sx0, y, s, s);
            const col = active ? press : C.muted;
            if (k === 0) arrow(sx0 + 0.75 * s, y + s, sx0 + 0.5 * s, y, col);
            else { arrow(sx0 + 0.5 * s, y, sx0 + 0.25 * s, y + s, col); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(sx0 + 0.6 * s, y + s - 5); ctx.lineTo(sx0 + 0.9 * s, y + s - 5); ctx.stroke(); }
          }
          HE.label(ctx, "3/2", wall + 6, y + s / 2, { size: 13, bold: true, col: C.lode });
          HE.label(ctx, "push button", g.x1w - s - 12, y + s + 12, { size: 11, align: "left", col: C.ink2 });
        }
        // supply symbol
        ctx.fillStyle = C.card; ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(g.sup[0], g.sup[1], 9, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.moveTo(g.sup[0] - 3.5, g.sup[1] - 4.5); ctx.lineTo(g.sup[0] + 4.5, g.sup[1]); ctx.lineTo(g.sup[0] - 3.5, g.sup[1] + 4.5); ctx.closePath(); ctx.fill();
        HE.label(ctx, "air supply", g.sup[0] - 8, g.sup[1] + 17, { size: 11, align: "left", col: C.ink2 });
        // ---------- moving air
        if (live) {
          ctx.globalAlpha = 0.95;
          const movingOut = d > 0.999 && p < 0.999, movingIn = d < 0.001 && p > 0.001;
          if (movingOut || movingIn || (d > 0.001 && d < 0.999)) particles(ctx, pS, 1, t, press);
          if (movingOut) { particles(ctx, pA, 1, t, press); particles(ctx, pB, -1, t, vent); particles(ctx, [g.S, [g.S[0], g.S[1] + 12]], 1, t, vent); }
          if (movingIn) { particles(ctx, pB, 1, t, press); particles(ctx, pA, -1, t, vent); particles(ctx, [g.R, [g.R[0], g.R[1] + 12]], 1, t, vent); }
          if (d1 > 0.001 && d1 < 0.999 || (pressed && d < 0.999)) { particles(ctx, pS1, 1, t, press); particles(ctx, pPil, 1, t, press); }
          if (!pressed && d > 0.001) particles(ctx, pPil, -1, t, vent);
          ctx.globalAlpha = 1;
        }
        const txt = sentence(); if (now.textContent !== txt) now.textContent = txt;
      },
    });
    function jump() { // reduced motion: no animation, go straight to the settled state
      d = d1 = pressed ? 1 : 0; p = pressed ? 1 : 0; sim.redraw();
      const txt = sentence(); now.textContent = txt;
    }
    holdBtn.addEventListener("click", () => {
      auto = false; autoBtn.setAttribute("aria-pressed", "false"); autoBtn.textContent = "Auto demo";
      setPressed(!pressed);
      if (HE.reduced) jump(); else { if (!sim.playing) sim.play(); }
    });
    autoBtn.addEventListener("click", () => {
      auto = !auto; autoBtn.setAttribute("aria-pressed", String(auto)); autoBtn.textContent = auto ? "Stop auto demo" : "Auto demo";
      if (auto) { autoT = 0; if (HE.reduced) { setPressed(true); jump(); } else if (!sim.playing) sim.play(); }
    });
    const play = HE.playButton(sim);
    legendAfter(cv, [["var(--sea)", "pressurised air"], ["var(--muted)", "vented / exhausting"], ["var(--lode)", "valve position in use"]]);
    box.append(el("div", { class: "btn-row" }, holdBtn, autoBtn, play), now);
    // terminology checker
    const ta = el("textarea", { "aria-label": "Your description of what happens when the button is pressed and then released", rows: 5, placeholder: "Describe what happens when the push button is pressed and then released…", style: "width:100%;box-sizing:border-box" });
    const chips = el("ul", { class: "exm-chips", "aria-live": "polite" });
    const checks = [
      ["“3/2 valve actuates”", /3\s*\/\s*2[^.]{0,50}actuat/i],
      ["“5/2 valve changes state”", /5\s*\/\s*2[^.]{0,50}chang\w*\s+(its\s+)?state/i],
      ["“piston outstrokes”", /outstroke/i],
      ["air supplied to the cap end (or rod end)", /(cap|rod)\s*end|port\s*[ab]\b/i],
      ["exhaust / vent mentioned", /exhaust|vent/i],
      ["release / spring return", /releas|spring/i],
      ["“piston instrokes”", /instroke/i],
    ];
    const chk = el("button", { class: "btn small primary", type: "button" }, "Check my terminology");
    chk.addEventListener("click", () => {
      chips.innerHTML = "";
      checks.forEach(([t, re]) => chips.append(el("li", { class: re.test(ta.value) ? "ok" : "no" }, (re.test(ta.value) ? "✔ " : "✘ ") + t)));
      chips.append(el("li", { class: "na" }, "These are keyword prompts, not a marker."));
    });
    box.append(el("h4", null, "Your turn: write the description"), ta, el("div", { class: "btn-row" }, chk), chips);
    sim.redraw();
    now.textContent = sentence();
  });

  /* =====================================================================
     9. Which marks am I leaving on the table? (self-audit)
     ===================================================================== */
  const HABITS = [
    ["calc", "I carry full calculator values through a calculation and round only the final answer.", "2024, 2025 and 2026 reports", "Calculations", "exam.html#booklet"],
    ["calc", "I use the π key on the calculator, not 3.14.", "2024 report", "Calculations", "exam.html#booklet"],
    ["calc", "I write the relationship, then the substitution, then the answer with its unit.", "marking style", "Calculations", "exam.html#booklet"],
    ["calc", "I convert units first (rev/min to rev/s, mm² to m², kN to N, kN mm⁻² to N mm⁻²).", "booklet conventions", "Calculations", "exam.html#booklet"],
    ["calc", "In torque I use the radius (not the diameter); in moments I multiply each force by its perpendicular distance.", "2024 report", "Calculations", "structures.html"],
    ["calc", "In strain energy I check that force and extension are in units that give joules.", "2024 report", "Calculations", "structures.html"],
    ["ana", "In transistor and MOSFET questions I first find the voltage drop across the resistor or solenoid, then use Ohm's law.", "2024 report", "Analogue", "analogue.html"],
    ["ana", "I can rearrange V1/V2 = R1/R2 to find an unknown R1.", "2024 report", "Analogue", "analogue.html"],
    ["ana", "I work out power in a transistor as V_CE × I_C.", "2026 report", "Analogue", "analogue.html"],
    ["desc", "Every descriptive point has a reason with it (not just 'it switches on').", "2024 report", "Descriptive answers", "exam.html#answering"],
    ["desc", "In pneumatic answers I say '3/2 valve actuates', '5/2 valve changes state', 'piston instrokes/outstrokes'.", "2025 and 2026 reports", "Descriptive answers", "exam.html#answering"],
    ["desc", "I give the number of points asked for (two roles, two adaptations) and make each one different.", "2026 report", "Descriptive answers", "exam.html#answering"],
    ["asg", "My assignment screenshots and photos are clear, with components labelled and orientation shown.", "2025 and 2026 reports", "Assignment", "exam.html#assignment"],
    ["asg", "In a test plan I keep the test (what I do) separate from the expected result (what should happen).", "2024 report", "Assignment", "exam.html#assignment"],
    ["asg", "When a test fails I amend the design before the next test.", "2026 report", "Assignment", "exam.html#assignment"],
    ["asg", "My evaluation takes each specification point in turn and cites actual test evidence.", "2025 and 2026 reports", "Assignment", "exam.html#assignment"],
    ["asg", "I count integrated circuits, not gates, and convert to NAND equivalents.", "2025 and 2026 reports", "Assignment", "digital.html"],
    ["asg", "I check whether each support can withstand its reaction force.", "2026 report", "Assignment", "structures.html"],
  ];
  mount("w-audit", (box) => {
    const saved = store.get("audit", {});
    const groups = {};
    HABITS.forEach((h, i) => { (groups[h[3]] = groups[h[3]] || []).push([h, i]); });
    const wrap = el("div", { class: "exm-audit" });
    const out = el("div", { "aria-live": "polite" });
    const levels = [["always", "Always"], ["sometimes", "Sometimes"], ["rarely", "Rarely"]];
    function compute() {
      store.set("audit", saved);
      const done = Object.keys(saved).length;
      out.innerHTML = "";
      if (done < HABITS.length) { out.append(el("p", { class: "hint" }, `${done} of ${HABITS.length} habits rated. Rate them all, honestly, to see your priorities.`)); }
      const sc = (v) => (v === "rarely" ? 2 : v === "sometimes" ? 1 : 0);
      const ranked = HABITS.map((h, i) => ({ h, i, s: sc(saved[i]) })).filter((x) => x.s > 0 && saved[x.i]).sort((a, b) => b.s - a.s || a.i - b.i);
      if (!ranked.length) { if (done === HABITS.length) out.append(el("p", { class: "exm-verdict good" }, "You rate every habit as 'always'. Prove it on a past paper: a self-audit is only as honest as the evidence behind it.")); return; }
      out.append(el("p", { class: "exm-verdict bad" }, `Marks most likely to leak (${ranked.length} habits to fix; top ${Math.min(5, ranked.length)} shown):`));
      const ol = el("ol", { class: "exm-prio" });
      ranked.slice(0, 5).forEach((x) => ol.append(el("li", null, x.h[1] + " ", el("span", { class: "src" }, `(${x.h[2]}) → `), el("a", { href: x.h[4] }, "go to " + (x.h[4].startsWith("exam") ? "this chapter" : x.h[4].replace(".html", ""))))));
      out.append(ol);
    }
    Object.entries(groups).forEach(([name, items]) => {
      const fs = el("fieldset", null, el("legend", null, name));
      items.forEach(([h, i]) => {
        const row = el("div", { class: "exm-habit" }, el("p", null, h[1], " ", el("span", { class: "src" }, `[${h[2]}]`)));
        const seg = el("div", { class: "seg", role: "group", "aria-label": "How often: " + h[1] });
        const btns = levels.map(([v, t]) => {
          const b = el("button", { type: "button", class: "seg-btn", "aria-pressed": saved[i] === v ? "true" : "false" }, t);
          b.addEventListener("click", () => { saved[i] = v; btns.forEach((x) => x.setAttribute("aria-pressed", "false")); b.setAttribute("aria-pressed", "true"); compute(); });
          return b;
        });
        seg.append(...btns); row.append(seg); fs.append(row);
      });
      wrap.append(fs);
    });
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Clear my ratings");
    reset.addEventListener("click", () => { Object.keys(saved).forEach((k) => delete saved[k]); wrap.querySelectorAll(".seg-btn").forEach((b) => b.setAttribute("aria-pressed", "false")); compute(); });
    box.append(wrap, el("div", { class: "btn-row" }, reset), out);
    compute();
  });

  /* =====================================================================
     10. Test-plan builder (test is not the same as expected result)
     ===================================================================== */
  const TP_EXAMPLE = [
    { test: "Set the LDR to 2 kΩ (bright daylight) and measure the voltage at the MOSFET gate.", expect: "Gate voltage about 0.26 V, below the 2.0 V threshold: lamp off.", actual: "", result: "", amend: "" },
    { test: "Set the LDR to 20 kΩ (dusk) and measure the gate voltage.", expect: "Gate voltage about 2.05 V: lamp just switches on.", actual: "", result: "", amend: "" },
    { test: "Set the LDR to 100 kΩ (dark) and measure the lamp current.", expect: "Gate voltage about 5.36 V; lamp current 60 mA, lamp fully bright.", actual: "", result: "", amend: "" },
  ];
  const ACTION = /\b(set|connect|measure|cover|expose|change|apply|adjust|record|switch|place|increase|reduce|vary|replace|turn|read|insert|attach|run|simulate|use|test)\b/i;
  const STATE = /\b(on|off|high|low|bright|dim|brighter|dimmer|lit|pass|fails?|saturat\w*|positive|negative|stops?|starts?|rotates?|instrokes?|outstrokes?)\b/i;
  mount("w-testplan", (box) => {
    let rows = store.get("tp", null) || TP_EXAMPLE.map((r) => ({ ...r }));
    const holder = el("div"), sum = el("p", { class: "sim-note", "aria-live": "polite" });
    function flags(r) {
      const f = [];
      const t = r.test.trim(), e = r.expect.trim();
      if (!t) f.push(["warn", "Say what you will do (the test)."]);
      else if (!ACTION.test(t)) f.push(["warn", "The test should be an action: set, connect, cover, measure…"]);
      else f.push(["ok", "The test is an action."]);
      if (!e) f.push(["warn", "Give the expected result: what should happen if the design works."]);
      else {
        if (!/\d/.test(e) && !STATE.test(e)) f.push(["warn", "An expected result should be a value (with units) or a clear state (lamp on/off)."]);
        else f.push(["ok", "The expected result is a value or a state."]);
        if (t && e && t.toLowerCase() === e.toLowerCase()) f.push(["warn", "The test and the expected result are identical: they are different things."]);
        if (/^\s*(measure|connect|set|cover|place|apply|record)\b/i.test(e)) f.push(["warn", "That reads like an instruction. The expected result says what you predict you will see."]);
      }
      if (r.result === "fail" && !r.amend.trim()) f.push(["warn", "A failed test needs an amendment, made before the next test."]);
      if (r.result === "fail" && r.amend.trim()) f.push(["ok", "Amendment recorded: retest and record the new result."]);
      if (r.result && !r.actual.trim()) f.push(["warn", "Record the actual result (the number you measured), not only pass or fail."]);
      return f;
    }
    function render() {
      store.set("tp", rows);
      holder.innerHTML = "";
      let good = 0;
      rows.forEach((r, i) => {
        const g = el("div", { class: "exm-tp-grid" });
        const field = (key, label, tag) => {
          const inp = tag === "select"
            ? el("select", null, el("option", { value: "" }, "— not tested yet —"), el("option", { value: "pass" }, "pass"), el("option", { value: "fail" }, "fail"))
            : el("textarea", { rows: 3 });
          inp.value = r[key];
          inp.addEventListener(tag === "select" ? "change" : "input", () => { r[key] = inp.value; store.set("tp", rows); upd(); });
          return el("label", null, label, inp);
        };
        g.append(field("test", "Test (what I do)"), field("expect", "Expected result (what should happen)"), field("actual", "Actual result (what I measured)"), field("result", "Pass or fail?", "select"), field("amend", "Amendment (if it failed)"));
        const fl = el("ul", { class: "exm-flags" });
        const del = el("button", { class: "btn small", type: "button", "aria-label": `Delete test ${i + 1}` }, "Delete");
        del.addEventListener("click", () => { rows.splice(i, 1); render(); });
        const card = el("div", { class: "exm-tp-row" }, el("h4", { style: "margin:0 0 6px" }, `Test ${i + 1}`), g, fl, el("div", { class: "btn-row" }, del));
        const upd = () => {
          fl.innerHTML = ""; const f = flags(r);
          f.forEach(([c, t]) => fl.append(el("li", { class: c }, (c === "ok" ? "✔ " : "• ") + t)));
          tally();
        };
        card._upd = upd; holder.append(card); upd();
      });
      tally();
    }
    function tally() {
      const n = rows.length, ok = rows.filter((r) => flags(r).every(([c]) => c === "ok")).length;
      sum.textContent = `${ok} of ${n} test${n === 1 ? "" : "s"} pass the prompts above. The prompts check structure only: they cannot tell whether your expected values are physically right.`;
    }
    const add = el("button", { class: "btn small primary", type: "button" }, "+ Add a test");
    add.addEventListener("click", () => { if (rows.length < 8) { rows.push({ test: "", expect: "", actual: "", result: "", amend: "" }); render(); } });
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Reload the example");
    reset.addEventListener("click", () => { rows = TP_EXAMPLE.map((r) => ({ ...r })); render(); });
    const weak = el("button", { class: "btn small", type: "button" }, "Load a weak plan to fix");
    weak.addEventListener("click", () => { rows = [{ test: "Check the lamp works.", expect: "Measure the gate voltage.", actual: "", result: "", amend: "" }, { test: "Set the LDR to 20 kΩ.", expect: "Set the LDR to 20 kΩ.", actual: "1.2 V", result: "fail", amend: "" }]; render(); });
    box.append(holder, el("div", { class: "btn-row" }, add, reset, weak), sum);
    render();
  });

  /* =====================================================================
     11. Evaluation-sentence checker (prompts, not a marker)
     ===================================================================== */
  const SPECS = [
    { id: "S1", text: "The lamp is off in bright daylight (LDR about 2 kΩ).", kw: /daylight|bright|2\s*k|off|S1/i },
    { id: "S2", text: "The lamp switches on when the LDR reaches about 20 kΩ (dusk).", kw: /dusk|20\s*k|switch(es)?\s*on|threshold|S2/i },
    { id: "S3", text: "In the dark (LDR 100 kΩ) the lamp is fully bright, drawing 60 mA.", kw: /dark|100\s*k|60\s*mA|bright|current|S3/i },
    { id: "S4", text: "The control circuit works from a single 9 V battery and uses no more than three components besides the lamp and battery.", kw: /9\s*V|battery|component|S4/i },
  ];
  const EVID = /\d+(?:\.\d+)?\s*(?:V|mA|A|kΩ|k|Ω|ohm|s|%|mm|N)\b|\b(measured|measurement|reading|multimeter|simulation|simulated|test(?:ed)?|screenshot|photograph|result(?:s)?|graph|recorded|observed)\b/gi;
  const VERD = /\b(met|meets|meet|achieved|achieves|satisfied|satisfies|fully|not met|was not|were not|did not|does not|fails?|failed|partly|partially)\b/gi;
  const NEG = /\b(not met|was not|were not|did not|does not|fail(?:s|ed)?|partly|partially|below|short of)\b/i;
  const AMEND = /\b(amend\w*|changed|replaced|increas\w*|reduc\w*|modif\w*|adjust\w*|improv\w*|would|could|should)\b/i;
  const GENERIC = /\ball (of )?(the )?(specification|spec)\b|\beverything (works|was met)\b|\ball (points )?(were |was )?met\b/i;
  mount("w-evalcheck", (box) => {
    const saved = store.get("ev", {});
    const wrap = el("div");
    const blocks = SPECS.map((s) => {
      const ta = el("textarea", { rows: 4, "aria-label": `Your evaluation of specification point ${s.id}`, placeholder: "Write your evaluation of this one point here…" });
      ta.value = saved[s.id] || "";
      const chips = el("ul", { class: "exm-chips", "aria-live": "polite" });
      const hl = el("div", { class: "exm-hl", "aria-label": "Your text with evidence and verdict words highlighted" });
      const card = el("div", { class: "exm-ev" }, el("h4", null, `${s.id}: ${s.text}`), ta, chips, hl);
      const run = () => {
        const v = ta.value; saved[s.id] = v; store.set("ev", saved);
        chips.innerHTML = "";
        if (!v.trim()) { hl.textContent = ""; return; }
        const mention = s.kw.test(v), evid = (v.match(EVID) || []).length, verdict = new RegExp(VERD.source, "i").test(v);
        const neg = NEG.test(v), am = AMEND.test(v);
        const mk = (ok, t, na) => chips.append(el("li", { class: na ? "na" : ok ? "ok" : "no" }, (na ? "– " : ok ? "✔ " : "✘ ") + t));
        mk(mention, "refers to this specification point");
        mk(evid >= 2, "cites evidence (a measured value with a unit, or a named test / screenshot)");
        mk(verdict, "gives a clear verdict (met / not met / partly met)");
        mk(am, "says what was amended or would be changed", !neg);
        if (GENERIC.test(v)) chips.append(el("li", { class: "no" }, "✘ blanket claim ('all met'): judge each point separately, with its own evidence"));
        // highlighted copy
        let html = HE.esc(v);
        html = html.replace(new RegExp(EVID.source, "gi"), (m) => `<mark>${m}</mark>`);
        html = html.replace(/\b(not met|was not|were not|did not|does not|fails?|failed|partly|partially|met|meets|achieved|satisfied)\b/gi, (m) => `<mark class="v">${m}</mark>`);
        html = html.replace(/\b(amend\w*|changed|replaced|increas\w*|reduc\w*|modif\w*|adjust\w*)\b/gi, (m) => `<mark class="k">${m}</mark>`);
        hl.innerHTML = html.replace(/\n/g, "<br>");
      };
      ta.addEventListener("input", run);
      wrap.append(card); run();
      return { s, ta, run };
    });
    const weak = el("button", { class: "btn small", type: "button" }, "Load a weak example");
    const strong = el("button", { class: "btn small", type: "button" }, "Load a stronger example");
    const clear = el("button", { class: "btn small", type: "button" }, "Clear");
    const put = (arr) => { blocks.forEach((b, i) => { b.ta.value = arr[i] || ""; b.run(); }); };
    weak.addEventListener("click", () => put(["The circuit worked well in daylight.", "It switches on at dusk, so this was met.", "The lamp was bright in the dark.", "All the specification points were met."]));
    strong.addEventListener("click", () => put([
      "S1 was met: with the LDR set to 2 kΩ the simulation showed 0.26 V at the gate, below the 2.0 V threshold, and the lamp stayed off (screenshot 1).",
      "S2 was only partly met: at 20 kΩ the measured gate voltage was 1.76 V, just under the 2.0 V threshold, so the lamp stayed off. I changed the fixed resistor from 82 kΩ to 68 kΩ, retested, and measured 2.05 V with the lamp just lit.",
      "S3 was met: at 100 kΩ the gate voltage was 5.36 V and the multimeter read 60 mA through the lamp.",
      "S4 was met: it runs from one 9 V battery, and apart from the lamp and battery it needs only three components (resistor, LDR, MOSFET).",
    ]));
    clear.addEventListener("click", () => put([]));
    box.append(wrap, el("div", { class: "btn-row" }, weak, strong, clear), el("p", { class: "hint" }, "Honest limits: this is a keyword-and-structure prompt. It cannot tell whether your numbers are right, and a real marker will read your meaning, not your keywords."));
  });

  /* =====================================================================
     12. Revision map with ticks
     ===================================================================== */
  mount("w-map", (box) => {
    const ticks = store.get("map", {});
    const total = Object.values(MAPDATA).reduce((a, b) => a + b.length, 0);
    const meter = el("div", { class: "exm-meter", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-label": "Revision map ticked" }, el("i"));
    const lbl = el("p", { class: "hint", "aria-live": "polite" });
    const wrap = el("div", { class: "exm-map" });
    const info = { assignment: { name: "The assignment (50 marks)", marks: "50 marks", deck: "exam.html#assignment", deckName: "this deck, chapter 4" } };
    const groups = [...AREAS.map((a) => ({ id: a.id, name: a.name, marks: `${a.lo}–${a.hi} marks`, deck: a.deck, deckName: a.deckName })), { id: "assignment", ...info.assignment }];
    const pcts = [];
    function paint() {
      const n = Object.values(ticks).filter(Boolean).length;
      meter.firstChild.style.width = (n / total * 100) + "%";
      meter.setAttribute("aria-valuenow", String(n));
      lbl.textContent = `${n} of ${total} skills ticked.`;
      pcts.forEach((f) => f());
    }
    groups.forEach((g) => {
      const items = MAPDATA[g.id];
      const det = el("details");
      const pc = el("span", { class: "p" });
      det.append(el("summary", null, el("span", null, g.name), el("span", { class: "m" }, g.marks), pc));
      const ul = el("ul");
      items.forEach((t, i) => {
        const k = `${g.id}:${i}`;
        const cb = el("input", { type: "checkbox" });
        cb.checked = !!ticks[k];
        cb.addEventListener("change", () => { ticks[k] = cb.checked; store.set("map", ticks); paint(); });
        ul.append(el("li", null, el("label", null, cb, el("span", null, t))));
      });
      det.append(ul, el("p", { class: "hint" }, "Learn it in: ", el("a", { href: g.deck }, g.deckName)));
      pcts.push(() => { const d = items.filter((_, i) => ticks[`${g.id}:${i}`]).length; pc.textContent = `${d}/${items.length}`; });
      wrap.append(det);
    });
    const clear = el("button", { class: "btn small", type: "button" }, "↺ Clear all ticks");
    clear.addEventListener("click", () => { Object.keys(ticks).forEach((k) => delete ticks[k]); store.set("map", ticks); wrap.querySelectorAll("input").forEach((c) => (c.checked = false)); paint(); });
    box.append(meter, lbl, wrap, el("div", { class: "btn-row" }, clear));
    paint();
  });
})();
