/* Exam drill: the Courts-Martial Room.
   Widgets for question-paper technique. Every number shown is computed from the rules the page
   teaches (150 minutes, 90 marks, the specification's mark ranges, the 2025 grade boundaries).
   The practice tools prompt and drill you; the self-marking court counts only what you award. */
(function () {
  "use strict";
  const HG = window.HG;
  if (!HG) return;
  const $ = (id) => document.getElementById(id);
  const el = HG.el;
  const N = HG.n;
  const NS = "http://www.w3.org/2000/svg";

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const KEY = "hg-exam.v1";
  const store = {
    get(k, d) { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); return k in o ? o[k] : d; } catch (e) { return d; } },
    set(k, v) { try { const o = JSON.parse(localStorage.getItem(KEY) || "{}"); o[k] = v; localStorage.setItem(KEY, JSON.stringify(o)); } catch (e) { /* private mode: this visit only */ } },
  };
  const svgBox = (vb, label, cls) => {
    const s = document.createElementNS(NS, "svg");
    s.setAttribute("viewBox", vb); s.setAttribute("role", "img"); s.setAttribute("aria-label", label);
    if (cls) s.setAttribute("class", cls);
    return s;
  };
  const mmss = (min) => { const s = Math.round(min * 60); return `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s`; };

  /* the five question-paper areas and their mark ranges (course specification) */
  const AREAS = [
    { id: "cad", name: "Computer-aided design", short: "CAD", lo: 20, hi: 30, cls: "violet", deck: "cad.html" },
    { id: "interp", name: "Interpretation of graphic items", short: "Interpretation", lo: 12, hi: 30, cls: "sea", deck: "standards.html" },
    { id: "tech", name: "Digital technology", short: "Digital tech", lo: 4, hi: 12, cls: "grass", deck: "tech.html" },
    { id: "std", name: "Drawing standards, protocols & conventions", short: "Standards", lo: 7, hi: 14, cls: "gold", deck: "standards.html" },
    { id: "dtp", name: "DTP features, design elements & principles", short: "DTP", lo: 20, hi: 30, cls: "red", deck: "dtp.html" },
  ];

  /* =====================================================================
     1. The pacing clock
     ===================================================================== */
  mount("w-pace", (box) => {
    const marks = { cad: 25, interp: 20, tech: 8, std: 10, dtp: 27 };
    let check = 10, clock = 45;
    const svg = svgBox("0 0 300 300", "", "ex-dial");
    const wrap = el("div", { class: "ex-pace-grid" });
    const left = el("div", { class: "ex-pace-dial" }, svg);
    const right = el("div");
    wrap.append(left, right);
    box.append(wrap);
    const ctl = el("div", { class: "sim-controls ex-one-col" });
    right.append(ctl);
    AREAS.forEach((a) => HG.slider(ctl, { label: `${a.short} (${a.lo}–${a.hi})`, min: a.lo, max: a.hi, step: 1, value: marks[a.id], unit: "marks", oninput: (v) => { marks[a.id] = v; draw(); } }));
    const total = el("p", { class: "ex-total", "aria-live": "polite" });
    right.append(total);
    const ctl2 = el("div", { class: "sim-controls" });
    box.append(ctl2);
    HG.slider(ctl2, { label: "Minutes held back for checking", min: 0, max: 20, step: 1, value: check, unit: "min", oninput: (v) => { check = v; draw(); } });
    HG.slider(ctl2, { label: "Exam clock", min: 0, max: 150, step: 1, value: clock, unit: "min", oninput: (v) => { clock = v; draw(); } });
    const legend = el("div", { class: "ex-legend" });
    const ro = el("div", { class: "readouts", "aria-live": "polite" });
    const note = el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(legend, ro, note);
    // a quick converter: any question's marks into minutes
    const conv = el("p", { class: "ex-conv" });
    const ctl3 = el("div", { class: "sim-controls" });
    box.append(ctl3, conv);
    let qm = 6;
    HG.slider(ctl3, { label: "A question worth…", min: 1, max: 10, step: 1, value: qm, unit: "marks", oninput: (v) => { qm = v; draw(); } });

    const pt = (a, r) => [150 + r * Math.cos(a), 150 + r * Math.sin(a)];
    const ang = (min) => -Math.PI / 2 + (min / 150) * 2 * Math.PI;
    function sector(m0, m1, r, cls) {
      if (m1 - m0 < 0.01) return null;
      const a0 = ang(m0), a1 = ang(Math.min(m1, 149.999));
      const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
      const large = m1 - m0 > 75 ? 1 : 0;
      return HG.svg("path", { d: `M150 150 L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`, class: `f-${cls} stroke-ink`, "fill-opacity": cls === "muted" ? ".35" : ".45", "stroke-width": "1.2" });
    }
    function draw() {
      const tot = AREAS.reduce((s, a) => s + marks[a.id], 0);
      const work = 150 - check, per = work / 90;
      total.innerHTML = tot === 90 ? `<span class="ok">Total: 90 marks ✔</span> a possible paper.` : `<span class="bad">Total: ${tot} marks.</span> The paper is always 90: ${tot > 90 ? "lower" : "raise"} an area by ${Math.abs(tot - 90)}.`;
      svg.innerHTML = "";
      svg.append(HG.svg("circle", { cx: 150, cy: 150, r: 124, class: "f-card stroke-ink", "stroke-width": "2" }));
      let m = 0;
      AREAS.forEach((a) => { const t = marks[a.id] * per; const s = sector(m, m + t, 118, a.cls); if (s) svg.append(s); m += t; });
      // anything left over (a total under 90) shows as an unplanned gap; the checking time is grey
      const s2 = sector(m, 150 - check, 118, "paper2"); if (s2 && tot < 90) svg.append(s2);
      const s3 = sector(150 - check, 150, 118, "muted"); if (s3) svg.append(s3);
      for (let k = 0; k < 150; k += 10) {
        const [x0, y0] = pt(ang(k), 118), [x1, y1] = pt(ang(k), k % 30 ? 112 : 104);
        svg.append(HG.svg("line", { x1: x0, y1: y0, x2: x1, y2: y1, class: "stroke-ink", "stroke-width": k % 30 ? 1 : 2 }));
      }
      [0, 30, 60, 90, 120].forEach((k) => { const [x, y] = pt(ang(k), 138); svg.append(HG.svg("text", { x, y: y + 4, "text-anchor": "middle", "font-size": 12, class: "ink2", text: k === 0 ? "0/150" : String(k) })); });
      svg.append(HG.svg("circle", { cx: 150, cy: 150, r: 56, class: "f-card stroke-ink", "stroke-width": "1.5" }));
      const [hx, hy] = pt(ang(clock), 114);
      svg.append(HG.svg("line", { x1: 150, y1: 150, x2: hx, y2: hy, class: "s-red", "stroke-width": 3.5, "stroke-linecap": "round" }));
      svg.append(HG.svg("circle", { cx: 150, cy: 150, r: 5, class: "f-red" }));
      const banked = Math.min(90, clock / per);
      svg.append(HG.svg("text", { x: 150, y: 134, "text-anchor": "middle", "font-size": 13, class: "ink2", text: `minute ${clock}` }));
      svg.append(HG.svg("text", { x: 150, y: 176, "text-anchor": "middle", "font-size": 22, "font-weight": 700, class: "ink", text: `${N(banked, 0)}/90` }));
      svg.append(HG.svg("text", { x: 150, y: 194, "text-anchor": "middle", "font-size": 12, class: "ink2", text: "marks banked" }));
      svg.setAttribute("aria-label", `Exam dial of 150 minutes. ${AREAS.map((a) => `${a.short} ${marks[a.id]} marks, ${N(marks[a.id] * per, 0)} minutes`).join("; ")}; checking ${check} minutes. Clock hand at minute ${clock}: about ${N(banked, 0)} of 90 marks should be banked.`);
      legend.innerHTML = "";
      AREAS.forEach((a) => legend.append(el("span", null, el("i", { class: `sw-${a.cls}` }), `${a.short}: ${N(marks[a.id] * per, 1)} min`)));
      legend.append(el("span", null, el("i", { class: "sw-muted" }), `Checking: ${check} min`));
      ro.innerHTML = "";
      ro.append(
        el("div", null, el("b", null, mmss(per)), el("span", null, "per mark at this plan")),
        el("div", null, el("b", null, `${N(banked, 0)} marks`), el("span", null, `target banked by minute ${clock}`)),
        el("div", null, el("b", null, `${N(work, 0)} min`), el("span", null, "answering time")),
      );
      note.textContent = clock >= work
        ? `From minute ${work} you are in your checking time: every part should already have an answer.`
        : `At minute ${clock} you should be about ${N(banked, 0)} marks in. If you are well behind, write the points you are sure of in the part you are stuck on and move on.`;
      conv.innerHTML = `<b>${qm} mark${qm > 1 ? "s" : ""}</b> at this pace: <b>${mmss(qm * per)}</b>. At the full 1 min 40 s a mark: ${mmss(qm * 150 / 90)}.`;
    }
    draw();
  });

  /* =====================================================================
     2a. The explain ladder
     ===================================================================== */
  const SCEN = [
    {
      name: "Emphasis on a title",
      q: "Explain how emphasis has been created on the title “HMS VELLUM” on the open-day poster. [2]",
      causes: [
        { t: "The title is set in a large, bold font, much bigger than any other text", g: "size" },
        { t: "The title is reversed out: white letters on the navy band", g: "rev" },
        { t: "Nothing else shares the top band, so space surrounds the title", g: "space" },
        { t: "The body text is set in two columns", bad: "True, but it is about the body text. It cannot cause emphasis on the title." },
        { t: "The poster uses navy and magenta", bad: "Too general: it does not say what was done to the title, or where." },
      ],
      effects: [
        { t: "so the title is the first thing the viewer's eye is drawn to", g: "first" },
        { t: "which makes it stand out from everything else on the poster", g: "out" },
        { t: "creating a hierarchy, so the title is read before the date and the body text", g: "hier" },
        { t: "which creates emphasis", bad: "This repeats the question. In the 2024 marking instructions, emphasis itself was not accepted as the effect." },
        { t: "which looks nice", bad: "Too vague: say what it does for the reader." },
      ],
    },
    {
      name: "Master page",
      q: "Explain why the designer used a master page for the Plan Room's eight-page brochure. [2]",
      causes: [
        { t: "The two-column grid and guides are set up once on the master page", g: "grid" },
        { t: "The running headline and folio are placed on the master page", g: "head" },
        { t: "The master page is applied to every page as a template", g: "grid" },
        { t: "The brochure has eight pages", bad: "That is the situation, not something the designer did." },
      ],
      effects: [
        { t: "so every page has the same layout, giving consistency (unity) across the brochure", g: "same" },
        { t: "so items do not have to be placed again on each page, which saves the designer time", g: "time" },
        { t: "so the page numbers appear, and stay correct, on every page automatically", g: "num", needs: ["head"] },
        { t: "which makes it a better brochure", bad: "Better how? Say what the reader or designer gains." },
      ],
    },
    {
      name: "STEP file",
      q: "Explain why the Plan Room sends its 3D models to the foundry as STEP files. [2]",
      causes: [
        { t: "STEP is a neutral 3D file format", g: "neutral" },
        { t: "STEP files can be imported by most CAD packages", g: "neutral" },
        { t: "A STEP file carries the model's full 3D solid geometry", g: "solid" },
        { t: "The foundry is in another town", bad: "That is context, but it does not explain the choice of file type." },
      ],
      effects: [
        { t: "so the foundry can open the model even though its CAD package is different", g: "open", needs: ["neutral"] },
        { t: "so the foundry can use the true 3D shape (for example to make the mould), not just a picture of it", g: "use", needs: ["solid"] },
        { t: "so it is a common file", bad: "This restates the cause. What does being common let the foundry do?" },
        { t: "which is better for them", bad: "Too vague to earn a mark." },
      ],
    },
  ];
  mount("w-explain", (box) => {
    let sc = 0;
    const qEl = el("p", { class: "ex-q-stem" });
    const lines = el("div", { class: "ex-lines" });
    const out = el("div", { class: "ex-verdict", "aria-live": "polite" });
    const markBtn = el("button", { class: "btn small primary", type: "button" }, "⚖ Mark my answer");
    const clear = el("button", { class: "btn small", type: "button" }, "↺ Clear");
    HG.choice(box, "Question:", SCEN.map((s, i) => [i, s.name]), 0, (v) => { sc = v; build(); });
    box.append(qEl, lines, el("div", { class: "btn-row" }, markBtn, clear), out);
    let sels = [];
    function build() {
      const s = SCEN[sc];
      qEl.textContent = s.q;
      lines.innerHTML = ""; out.innerHTML = ""; sels = [];
      for (let i = 0; i < 2; i++) {
        const cSel = el("select", { "aria-label": `Line ${i + 1}: cause` }, el("option", { value: "-1" }, "— no cause —"), ...s.causes.map((c, k) => el("option", { value: k }, c.t)));
        const eSel = el("select", { "aria-label": `Line ${i + 1}: effect` }, el("option", { value: "-1" }, "— no effect —"), ...s.effects.map((c, k) => el("option", { value: k }, c.t)));
        const said = el("p", { class: "ex-said" });
        const upd = () => {
          const c = s.causes[+cSel.value], e = s.effects[+eSel.value];
          said.textContent = c || e ? `“${c ? c.t : ""}${c && e ? ", " : ""}${e ? (c ? e.t : e.t.charAt(0).toUpperCase() + e.t.slice(1)) : ""}.”` : "";
        };
        cSel.addEventListener("change", upd); eSel.addEventListener("change", upd);
        lines.append(el("div", { class: "ex-line" }, el("span", { class: "ex-line-n" }, `Line ${i + 1}`), el("label", null, "Cause ", cSel), el("label", null, "Effect ", eSel), said));
        sels.push([cSel, eSel]);
      }
    }
    markBtn.addEventListener("click", () => {
      const s = SCEN[sc];
      let total = 0; const usedC = new Set(), usedE = new Set();
      const rows = sels.map(([cs, es], i) => {
        const c = s.causes[+cs.value], e = s.effects[+es.value];
        let ok = false, msg;
        if (!c && !e) msg = "Blank: nothing to credit.";
        else if (!c) msg = e.bad ? `No cause, and the effect is weak too. ${e.bad}` : "Effect only: the 2025 report's commonest error. No mark: say what was done, and where, first.";
        else if (!e) msg = c.bad ? `Cause only, and it does not fit: ${c.bad}` : "Cause only: true, but it is a statement, not an explanation. Add what it does for the reader.";
        else if (c.bad) msg = `The cause does not fit: ${c.bad}`;
        else if (e.bad) msg = `The effect does not earn it: ${e.bad}`;
        else if (e.needs && !e.needs.includes(c.g)) msg = "Both halves are good, but they do not link: that effect does not follow from that cause.";
        else if (usedC.has(c.g) || usedE.has(e.g)) msg = "A linked pair, but it repeats the point of line 1. A second mark needs a different point.";
        else { ok = true; msg = "Linked cause and effect, in context: 1 mark."; usedC.add(c.g); usedE.add(e.g); }
        if (ok) total++;
        return el("li", { class: ok ? "ok-line" : "bad-line" }, el("b", null, `Line ${i + 1}: ${ok ? "✔ 1 mark" : "✘ 0"}`), " ", msg);
      });
      out.innerHTML = "";
      out.append(el("p", { class: "readout" }, `The court awards ${total} / 2`), el("ul", { class: "ex-lines-out" }, rows));
      if (total < 2) out.append(el("p", { class: "hint" }, "Change the lines and mark again. Every good answer here has two different causes, each joined to an effect that follows from it."));
    });
    clear.addEventListener("click", build);
    build();
  });

  /* =====================================================================
     2b. The verdict: cause, effect or both?
     ===================================================================== */
  const VERDICTS = [
    { q: "Explain why a drop cap was used.", a: "It draws the reader's eye.", v: "effect", fix: "The first letter of the article is enlarged and drops over three lines (cause), so the reader's eye is led to where the text starts (effect)." },
    { q: "Explain how contrast has been used.", a: "The heading is white on a black band.", v: "cause", fix: "The heading is white on a black band (cause), so it stands out sharply and is read first (effect)." },
    { q: "Explain why STEP was used.", a: "STEP is a neutral format, so the supplier can open it in their own, different CAD package.", v: "both", fix: "Already complete: cause (a neutral format) linked to an effect in context (the supplier's different package can open it)." },
    { q: "Explain why the image has been fully cropped.", a: "To make the page look more interesting and professional.", v: "effect", fix: "The background has been cut away round the boat (full crop) (cause), so the text can wrap round the boat's outline, linking image and text (effect)." },
    { q: "Explain why a bleed is included.", a: "The background colour runs 3 mm past the trim line.", v: "cause", fix: "The colour runs 3 mm past the trim line (cause), so no thin white edge shows if the guillotine cuts slightly off the line (effect)." },
    { q: "Explain why the model was edited in the modelling tree.", a: "The hole's sketch was edited in the tree from Ø20 to Ø24, so the bore and every feature built on it updated automatically.", v: "both", fix: "Already complete: the edit (cause) and the automatic update of later features (effect)." },
    { q: "Explain the use of white space.", a: "It makes the layout look clean and uncluttered.", v: "effect", fix: "Wide margins and the empty area round the logo (cause) stop the layout feeling crowded and make the logo stand out (effect)." },
    { q: "Explain why cloud storage helps the designers.", a: "The files are kept on a remote server accessed over the internet.", v: "cause", fix: "The files are kept on a remote server reached over the internet (cause), so the designers in Leith and Portsmouth can open the latest version and work on it together (effect)." },
    { q: "Explain how value has been used.", a: "A darker (low value) navy is used behind the title, so the white text stands out against it.", v: "both", fix: "Already complete: the low-value navy (cause) makes the white title contrast and stand out (effect)." },
    { q: "Explain why a radial array was used for the holes.", a: "So they are all exactly evenly spaced.", v: "effect", fix: "One hole was copied 6 times over 360° about the centre axis (cause), so the holes are exactly evenly spaced and all change if the first is edited (effect)." },
    { q: "Explain why a sans serif font was used for the body text.", a: "It is a sans serif font with plain strokes.", v: "cause", fix: "The plain sans serif strokes (cause) keep the small body text clear and easy to read on screen (effect)." },
    { q: "Explain why parallel dimensioning was used.", a: "Every size is measured from the same datum edge, so an error in one size does not add on to the others.", v: "both", fix: "Already complete: measuring from one datum (cause) avoids accumulated error (effect)." },
  ];
  mount("w-verdict", (box) => {
    let deck = [], i = 0, right = 0, done = 0;
    const card = el("div", { class: "ex-vcard" });
    const btns = el("div", { class: "btn-row", role: "group", "aria-label": "Your verdict" });
    const fb = el("div", { class: "ex-verdict", "aria-live": "polite" });
    const tally = el("p", { class: "readout", "aria-live": "polite" });
    const next = el("button", { class: "btn small primary", type: "button", hidden: true }, "Next answer ▶");
    const LAB = { effect: "Effect only", cause: "Cause only", both: "Cause and effect" };
    const vb = Object.keys(LAB).map((k) => {
      const b = el("button", { class: "btn small", type: "button" }, LAB[k]);
      b.addEventListener("click", () => judge(k, b));
      btns.append(b); return b;
    });
    box.append(card, btns, fb, el("div", { class: "btn-row" }, next), tally);
    function start() { deck = shuffle(VERDICTS.slice()); i = 0; right = 0; done = 0; show(); }
    function show() {
      if (i >= deck.length) {
        card.innerHTML = `<p class="ex-vq">Session over.</p>`;
        fb.innerHTML = `You judged ${right} of ${done} correctly. ${right === done ? "A flawless court." : "Look again at the ones you missed: is there a 'so' or 'which' joining two halves?"}`;
        vb.forEach((b) => (b.disabled = true));
        next.hidden = false; next.textContent = "↺ New session";
        return;
      }
      const d = deck[i];
      card.innerHTML = `<p class="ex-vq"><b>Question:</b> ${HG.esc(d.q)} [1]</p><p class="ex-va">Candidate: “${HG.esc(d.a)}”</p>`;
      fb.innerHTML = ""; next.hidden = true;
      vb.forEach((b) => { b.disabled = false; b.classList.remove("primary", "chosen"); });
    }
    function judge(k, b) {
      const d = deck[i], ok = k === d.v;
      done++; if (ok) right++;
      vb.forEach((x) => (x.disabled = true));
      b.classList.add("chosen"); vb[Object.keys(LAB).indexOf(d.v)].classList.add("primary");
      fb.innerHTML = `${ok ? "<span class='ok'>✔ Right:</span>" : "<span class='bad'>✘ Not quite:</span>"} it is <b>${LAB[d.v].toLowerCase()}</b>${d.v === "both" ? ", so it earns the mark." : ", so it earns nothing."}<br><b>A version that earns the mark:</b> ${HG.esc(d.fix)}`;
      tally.textContent = `${right} of ${done} verdicts correct`;
      next.hidden = false; next.textContent = "Next answer ▶";
      i++;
    }
    next.addEventListener("click", () => { if (i >= deck.length) start(); else show(); });
    start();
  });

  /* =====================================================================
     3. Terminology: the card bank (course specification terms)
     ===================================================================== */
  const C = (term, def, area) => ({ term, def, area });
  const CARDS = [
    // CAD
    C("Extrude", "A CAD feature that draws a 2D profile out in a straight line, at right angles to its sketch plane, to a set distance.", "cad"),
    C("Revolve", "A CAD feature that spins a 2D profile about an axis, through a set angle, to make a solid with a circular cross-section.", "cad"),
    C("Loft", "A CAD feature that joins two or more profiles, drawn on separate (offset) planes, with a smoothly changing solid.", "cad"),
    C("Helix", "A CAD feature that sweeps a profile round an axis in a spiral, set by its pitch and number of revolutions (or height).", "cad"),
    C("Pitch (of a helix)", "The distance a helix moves along its axis in one revolution.", "cad"),
    C("Extrude along a path", "A CAD feature that moves a profile along a drawn line or curve; the profile sits on a plane perpendicular to the start of that line.", "cad"),
    C("Shell", "A CAD edit that hollows a solid to a set wall thickness, removing the faces you choose.", "cad"),
    C("Fillet (3D edit)", "A CAD edit that rounds an edge to a radius; regular keeps one radius, irregular varies it along the edge.", "cad"),
    C("Chamfer (3D edit)", "A CAD edit that cuts a flat bevel along an edge; regular has equal set-backs, irregular has unequal ones.", "cad"),
    C("Radial array", "Copies a feature a set number of times round an axis, over a set angle.", "cad"),
    C("Linear array", "Copies a feature a set number of times in a straight line at a set spacing.", "cad"),
    C("Box array", "Copies a feature in rows and columns: in two directions at once.", "cad"),
    C("Mirror", "Copies a feature or sketch as a reflection about a plane or line.", "cad"),
    C("Subtract", "A Boolean edit that removes the volume of one solid from another.", "cad"),
    C("Intersect", "A Boolean edit that keeps only the volume two solids share.", "cad"),
    C("Add", "A Boolean edit that joins two solids into one.", "cad"),
    C("Workplane", "A flat reference surface on which a 2D sketch is drawn; it can be offset or angled from another plane or face.", "cad"),
    C("Profile", "The closed 2D shape that a feature such as extrude or revolve works on.", "cad"),
    C("Modelling tree", "The ordered history of a model's sketches and features; editing an early item updates everything built on it.", "cad"),
    C("Suppress", "Switches a feature off in the modelling tree without deleting it.", "cad"),
    C("Datum", "A fixed reference (plane, axis, edge or point) from which features and sizes are positioned.", "cad"),
    C("Top-down modelling", "Components are designed in the context of the assembly, so one part can take its sizes from another.", "cad"),
    C("Bottom-up modelling", "Each component is modelled separately, then brought into an assembly and constrained.", "cad"),
    C("Mate", "A 3D assembly constraint that places two faces against each other, facing opposite ways.", "cad"),
    C("Align", "A 3D assembly constraint that makes two faces lie in the same plane, facing the same way.", "cad"),
    C("Centre axis", "A 3D assembly constraint that lines up the axes of two cylindrical features, such as a pin and a hole.", "cad"),
    C("Orientate", "A 3D assembly constraint that sets the angle between two faces or edges.", "cad"),
    C("Offset (3D constraint)", "A 3D assembly constraint that holds two faces a set distance apart.", "cad"),
    C("Concentric", "A 2D constraint that gives circles or arcs the same centre.", "cad"),
    C("Tangent (2D constraint)", "A 2D constraint that makes a line or arc touch a curve at one point without crossing it.", "cad"),
    C("Fixed (2D constraint)", "A 2D constraint that locks a point or line in place so it cannot move.", "cad"),
    C("Project edge", "A 2D tool that copies an existing model edge onto the current sketch plane as usable geometry.", "cad"),
    C("Trim", "A 2D tool that cuts away part of a sketch line up to where it crosses another line.", "cad"),
    C("Offset (2D tool)", "A 2D tool that draws a parallel copy of a line or shape at a set distance.", "cad"),
    C("Library (stock) component", "A ready-made standard part, such as a bolt or bearing, taken from a CAD library instead of being modelled.", "cad"),
    C("STEP / IGES", "Neutral 3D file formats used to move models between different CAD packages.", "cad"),
    C("DXF", "A 2D drawing-exchange file format, a vector format read by many CAD packages and cutters.", "cad"),
    C("3DS", "A 3D file format used to move models into rendering and animation software.", "cad"),
    // DTP, design elements and principles
    C("Bleed", "Colour or an image that runs past the trim line (often by 3 mm) so no white edge shows after cutting.", "dtp"),
    C("Crop marks", "Short lines outside the page corners that show the printer where to trim.", "dtp"),
    C("Registration marks", "Target marks printed on every colour separation so the printer can check the colours line up.", "dtp"),
    C("Proof (pre-press)", "A trial print or file checked for errors before the full print run.", "dtp"),
    C("Gutter", "The space between two columns of text.", "dtp"),
    C("Margin", "The space between the edge of the page and the content.", "dtp"),
    C("Column rule", "A thin vertical line placed in the gutter to separate columns.", "dtp"),
    C("Pull quote", "A short extract from the text, enlarged and set apart, to catch the reader's attention.", "dtp"),
    C("Drop cap", "An enlarged first letter of a paragraph that drops down over several lines of text.", "dtp"),
    C("Running headline", "A heading repeated across the top of every page of a document.", "dtp"),
    C("Folio", "A page number.", "dtp"),
    C("Caption", "A short line of text that explains an image.", "dtp"),
    C("Hanging indent", "A paragraph whose first line starts further left than the lines below it.", "dtp"),
    C("Reverse", "Light text on a dark background.", "dtp"),
    C("Justified text", "Text aligned to both the left and right edges of its column.", "dtp"),
    C("Text wrap", "Text that flows round the shape of an image or object.", "dtp"),
    C("Extended text", "Text that flows on from one linked text box into another.", "dtp"),
    C("Master page", "A template page whose grid, guides, folios and headers appear on every page that uses it.", "dtp"),
    C("Grid structure", "The framework of columns, gutters and margins used to position items consistently.", "dtp"),
    C("Square cropping", "Trimming the straight edges of an image to remove unwanted areas or to fit a space.", "dtp"),
    C("Full cropping", "Cutting round the outline of the subject, removing its background.", "dtp"),
    C("Placeholder text", "Dummy text (such as lorem ipsum) that shows where, and how much, text will go before the real copy is ready.", "dtp"),
    C("Transparency", "Makes an object partly see-through so what is behind it shows.", "dtp"),
    C("Drop shadow", "A shadow placed behind an object so it seems to lift off the page.", "dtp"),
    C("Gradient fill", "A fill that blends smoothly from one colour or tone to another.", "dtp"),
    C("Serif font", "A typeface with small finishing strokes at the ends of the letters.", "dtp"),
    C("Script font", "A typeface that imitates handwriting.", "dtp"),
    C("Line spacing", "The vertical space between lines of text.", "dtp"),
    C("Thumbnails", "Small, quick sketches used to try out many layout ideas.", "dtp"),
    C("Value", "How light or dark a colour or tone is.", "dtp"),
    C("Emphasis", "Making one item stand out so that it is noticed first.", "dtp"),
    C("Unity", "The parts of a layout look as if they belong together, for example through repeated colour or style.", "dtp"),
    C("Proximity", "Grouping related items close together so they read as one unit.", "dtp"),
    C("Rhythm", "A regular repetition of an element that leads the eye through a layout.", "dtp"),
    C("Dominance", "One element is clearly the most important, by size, colour or position.", "dtp"),
    C("Accent colour", "A small amount of a contrasting colour used to draw attention.", "dtp"),
    C("Advancing colours", "Warm colours (reds, oranges) that seem to come towards the viewer.", "dtp"),
    C("Receding colours", "Cool colours (blues, greens) that seem to move away from the viewer.", "dtp"),
    C("Harmony (colour)", "Colours next to each other on the colour wheel, which sit together calmly.", "dtp"),
    // Standards
    C("Third-angle projection", "The system in which the plan is drawn above the elevation and the end elevation on the side it is viewed from.", "std"),
    C("Hidden detail line", "A thin dashed line that shows edges you cannot see from the viewing direction.", "std"),
    C("Centre line", "A thin long-dash, dot chain line that marks an axis or centre of symmetry.", "std"),
    C("Fold line", "A thin long-dash, double-dot chain line that shows where a surface development is folded.", "std"),
    C("Cutting plane", "A chain line, thick at its ends, with arrows that show where a section is taken and the direction of viewing.", "std"),
    C("Hatching", "Thin lines, usually at 45° and equally spaced, that show the cut surface of a section.", "std"),
    C("Pitch circle diameter (PCD)", "The diameter of the circle on which the centres of a ring of holes lie.", "std"),
    C("Across flats (A/F)", "The size of a hexagon measured between two opposite flat sides.", "std"),
    C("Across corners (A/C)", "The size of a hexagon measured between two opposite corners.", "std"),
    C("Chain dimensioning", "Sizes given end to end, from each feature to the next.", "std"),
    C("Parallel dimensioning", "Sizes all measured from one datum, which avoids accumulated error.", "std"),
    C("Symmetrical tolerance", "The nominal size followed by ± the same allowance either way, such as 40 ± 0.1.", "std"),
    C("Asymmetrical tolerance", "The nominal size with different upper and lower allowances, such as 40 +0.2 / −0.1.", "std"),
    C("Common tolerance", "The upper limit of size written above the lower limit.", "std"),
    C("Functional dimension", "A size that is essential to the function of a component or space.", "std"),
    C("Auxiliary view", "A view projected square to an inclined surface, to show its true shape.", "std"),
    // Technology
    C("Cloud storage", "Keeping files on remote servers reached over the internet instead of on a local drive.", "tech"),
    C("Cloud computing", "Using software and processing power on remote servers over the internet.", "tech"),
    C("Digital rights management (DRM)", "Technology that controls who can open, copy, print or share a digital file.", "tech"),
    C("Watermark", "A faint mark or logo over an image that shows ownership and discourages unpaid use.", "tech"),
    C("Paperless office", "Working with on-screen documents and drawings instead of printing them.", "tech"),
    C("Remote working", "Working away from the office, for example at home, using networks to share files.", "tech"),
    C("Raster image", "An image made of pixels, such as a JPG or PNG, which loses quality when enlarged.", "tech"),
    C("Vector graphic", "A graphic made of mathematically defined paths, such as an SVG, which scales without losing quality.", "tech"),
    C("Graphics tablet", "An input device on which a stylus is used to draw directly into software.", "tech"),
    C("3D printer", "An output device that builds a physical model layer by layer from a 3D file.", "tech"),
  ];
  const AREA_LBL = { all: "All", cad: "CAD", dtp: "DTP & design", std: "Standards", tech: "Technology" };

  mount("w-cards", (box) => {
    let area = "all", dir = "t2d", queue = [], cur = null, flipped = false, seen = 0;
    const boxes = store.get("boxes", {});
    HG.choice(box, "Area:", Object.entries(AREA_LBL), "all", (v) => { area = v; deal(); });
    HG.choice(box, "Show first:", [["t2d", "Term"], ["d2t", "Definition"]], "t2d", (v) => { dir = v; showCard(); });
    const face = el("div", { class: "ex-card", "aria-live": "polite" });
    const flip = el("button", { class: "btn small primary", type: "button" }, "↻ Flip the card");
    const rate = el("div", { class: "btn-row", role: "group", "aria-label": "Rate your recall", hidden: true });
    const R = [["again", "Again"], ["hard", "Hard"], ["good", "Good"], ["easy", "Easy"]];
    R.forEach(([k, t]) => { const b = el("button", { class: "btn small" + (k === "good" ? " primary" : ""), type: "button" }, t); b.addEventListener("click", () => rateIt(k)); rate.append(b); });
    const stat = el("p", { class: "ex-cardstat" });
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Reset my boxes");
    box.append(face, el("div", { class: "btn-row" }, flip), rate, stat, el("div", { class: "btn-row" }, reset));
    const pool = () => CARDS.filter((c) => area === "all" || c.area === area);
    function deal() {
      // spaced shuffling: the lowest boxes come first, shuffled within each box
      const p = shuffle(pool().slice());
      p.sort((a, b) => (boxes[a.term] || 0) - (boxes[b.term] || 0));
      queue = p; seen = 0; next();
    }
    function next() { cur = queue.shift() || null; flipped = false; showCard(); }
    function showCard() {
      if (!cur) { face.innerHTML = `<p class="ex-card-term">Deck cleared.</p><p>Every card in this set was rated Easy this session. Deal again, or pick another area.</p>`; flip.hidden = true; rate.hidden = true; paintStat(); return; }
      flip.hidden = false;
      const front = dir === "t2d" ? `<p class="ex-card-term">${HG.esc(cur.term)}</p>` : `<p class="ex-card-def">${HG.esc(cur.def)}</p>`;
      const back = dir === "t2d" ? `<p class="ex-card-def">${HG.esc(cur.def)}</p>` : `<p class="ex-card-term">${HG.esc(cur.term)}</p>`;
      face.innerHTML = `<span class="ex-card-tag">${AREA_LBL[cur.area]} · box ${boxes[cur.term] || 0}</span>${front}${flipped ? `<hr>${back}` : `<p class="hint">Say the ${dir === "t2d" ? "definition" : "term"} aloud, then flip.</p>`}`;
      rate.hidden = !flipped; flip.disabled = flipped;
      paintStat();
    }
    function rateIt(k) {
      const b = boxes[cur.term] || 0;
      if (k === "again") { boxes[cur.term] = 0; queue.splice(Math.min(2, queue.length), 0, cur); }
      else if (k === "hard") { boxes[cur.term] = Math.max(0, b); queue.splice(Math.min(5, queue.length), 0, cur); }
      else if (k === "good") { boxes[cur.term] = Math.min(4, b + 1); queue.splice(Math.min(12, queue.length), 0, cur); }
      else { boxes[cur.term] = Math.min(4, b + 2); }
      store.set("boxes", boxes); seen++;
      next();
    }
    function paintStat() {
      const p = pool(), cnt = [0, 0, 0, 0, 0];
      p.forEach((c) => cnt[boxes[c.term] || 0]++);
      stat.innerHTML = `${p.length} cards in this set · rated this session: ${seen} · <b>Boxes</b> 0: ${cnt[0]} · 1: ${cnt[1]} · 2: ${cnt[2]} · 3: ${cnt[3]} · 4: ${cnt[4]}` +
        `<span class="ex-boxbar" aria-hidden="true">${cnt.map((n, i) => `<i class="b${i}" style="flex:${n || 0}"></i>`).join("")}</span>`;
    }
    flip.addEventListener("click", () => { flipped = true; showCard(); const r = rate.querySelector(".primary"); if (r) r.focus(); });
    reset.addEventListener("click", () => { Object.keys(boxes).forEach((k) => delete boxes[k]); store.set("boxes", boxes); deal(); });
    deal();
  });

  mount("w-match", (box) => {
    let area = "all", pairs = [], pick = null, misses = 0, found = 0, t0 = 0;
    HG.choice(box, "Area:", Object.entries(AREA_LBL), "all", (v) => { area = v; deal(); });
    const grid = el("div", { class: "ex-match" });
    const colT = el("div", { class: "ex-match-col", role: "group", "aria-label": "Terms" });
    const colD = el("div", { class: "ex-match-col", role: "group", "aria-label": "Definitions" });
    grid.append(colT, colD);
    const ro = el("p", { class: "readout", "aria-live": "polite" });
    const again = el("button", { class: "btn small primary", type: "button" }, "↺ Deal six more");
    box.append(grid, ro, el("div", { class: "btn-row" }, again));
    function deal() {
      pairs = shuffle(CARDS.filter((c) => area === "all" || c.area === area).slice()).slice(0, 6);
      pick = null; misses = 0; found = 0; t0 = Date.now();
      colT.innerHTML = ""; colD.innerHTML = "";
      shuffle(pairs.map((p, i) => i)).forEach((i) => colT.append(mk(pairs[i].term, i, "t")));
      shuffle(pairs.map((p, i) => i)).forEach((i) => colD.append(mk(pairs[i].def, i, "d")));
      ro.textContent = "Pick a term.";
    }
    function mk(txt, i, side) {
      const b = el("button", { class: "ex-m-btn", type: "button", "data-i": i, "data-s": side, "aria-pressed": "false" }, txt);
      b.addEventListener("click", () => choose(b));
      return b;
    }
    function choose(b) {
      if (b.classList.contains("done")) return;
      if (!pick || pick.dataset.s === b.dataset.s) {
        if (pick) pick.setAttribute("aria-pressed", "false");
        pick = b; b.setAttribute("aria-pressed", "true");
        ro.textContent = b.dataset.s === "t" ? `Term chosen: ${b.textContent}. Now pick its definition.` : "Definition chosen. Now pick its term.";
        return;
      }
      if (pick.dataset.i === b.dataset.i) {
        [pick, b].forEach((x) => { x.classList.add("done"); x.setAttribute("aria-pressed", "false"); x.setAttribute("aria-disabled", "true"); });
        found++;
        ro.textContent = found === pairs.length ? `Board cleared in ${Math.round((Date.now() - t0) / 1000)} s with ${misses} miss${misses === 1 ? "" : "es"}.` : `Match! ${found} of ${pairs.length}.`;
      } else {
        misses++;
        [pick, b].forEach((x) => { x.classList.add("miss"); setTimeout(() => x.classList.remove("miss"), 500); x.setAttribute("aria-pressed", "false"); });
        ro.textContent = `Not a pair. Misses: ${misses}.`;
      }
      pick = null;
    }
    again.addEventListener("click", deal);
    deal();
  });

  /* =====================================================================
     4.1 The modelling plan (the deadeye)
     ===================================================================== */
  const STEPS = [
    { id: "s1", t: "On the XY (top) plane, sketch a Ø80 circle centred on the origin.", mark: true, deps: [] },
    { id: "s1v", t: "Draw a circle.", vague: "s1", why: "No plane and no size: the court cannot tell what you would build." },
    { id: "s2", t: "Extrude the Ø80 profile 30 mm.", mark: true, deps: ["s1"] },
    { id: "s2v", t: "Extrude it to make a cylinder.", vague: "s2", why: "No distance. 'Extrude 30' earns the mark; 'extrude it' does not." },
    { id: "s3", t: "On the XZ plane (through the centre axis), sketch an R4 semicircle on the outer edge, centred 15 mm up from the base.", mark: true, deps: ["s2"] },
    { id: "s4", t: "Revolve the R4 semicircle 360° about the centre axis, subtracting it, to cut the rope groove.", mark: true, deps: ["s3"] },
    { id: "s5", t: "On the top face, sketch a Ø14 circle with its centre 22 mm from the centre axis (on PCD 44).", mark: true, deps: ["s2"] },
    { id: "s6", t: "Extrude-subtract the Ø14 circle through all.", mark: true, deps: ["s5"] },
    { id: "s7", t: "Radial array the hole: 3 instances over 360° about the centre axis.", mark: true, deps: ["s6"] },
    { id: "s7v", t: "Copy the hole round the block.", vague: "s7", why: "Which command, how many copies, over what angle, about which axis? Name the radial array and give its values." },
    { id: "s8", t: "Fillet the top and bottom outer edges R3.", mark: true, deps: ["s2"] },
    { id: "d1", t: "Shell the block, wall thickness 3 mm, removing the top face.", wrong: "The deadeye is solid wood: a shell would hollow it. No mark is taken away (positive marking), but it wastes time and changes the model the later steps act on." },
    { id: "d2", t: "Loft between the Ø80 circle and a Ø14 circle on a plane offset 30 mm.", wrong: "A loft would make a tapering solid. The deadeye is a straight-sided disc: extrude it." },
  ];
  mount("w-cadplan", (box) => {
    let plan = [];
    const poolBox = el("div", { class: "ex-pool", role: "group", "aria-label": "Step pool" });
    const planBox = el("ol", { class: "ex-plan", "aria-label": "Your modelling plan" });
    const out = el("div", { class: "ex-verdict", "aria-live": "polite" });
    const markB = el("button", { class: "btn small primary", type: "button" }, "⚖ Mark the plan");
    const resetB = el("button", { class: "btn small", type: "button" }, "↺ Start again");
    const showB = el("button", { class: "btn small", type: "button" }, "Show a full-mark plan");
    box.append(el("p", { class: "ex-sub" }, "Step pool (click to add to the plan)"), poolBox, el("p", { class: "ex-sub" }, "Your plan"), planBox, el("div", { class: "btn-row" }, markB, showB, resetB), out);
    const order = shuffle(STEPS.slice());
    function render() {
      poolBox.innerHTML = "";
      order.filter((s) => !plan.includes(s)).forEach((s) => {
        const b = el("button", { class: "ex-step", type: "button" }, "+ " + s.t);
        b.addEventListener("click", () => { plan.push(s); render(); });
        poolBox.append(b);
      });
      if (!poolBox.children.length) poolBox.append(el("p", { class: "hint" }, "Every step is in your plan."));
      planBox.innerHTML = "";
      plan.forEach((s, i) => {
        const up = el("button", { class: "btn small", type: "button", "aria-label": `Move step ${i + 1} up`, disabled: i === 0 }, "↑");
        const dn = el("button", { class: "btn small", type: "button", "aria-label": `Move step ${i + 1} down`, disabled: i === plan.length - 1 }, "↓");
        const rm = el("button", { class: "btn small", type: "button", "aria-label": `Remove step ${i + 1}` }, "✕");
        up.addEventListener("click", () => { [plan[i - 1], plan[i]] = [plan[i], plan[i - 1]]; render(); });
        dn.addEventListener("click", () => { [plan[i + 1], plan[i]] = [plan[i], plan[i + 1]]; render(); });
        rm.addEventListener("click", () => { plan.splice(i, 1); render(); });
        planBox.append(el("li", { "data-id": s.id }, el("span", { class: "ex-step-t" }, s.t), el("span", { class: "ex-step-b" }, up, dn, rm)));
      });
      if (!plan.length) planBox.append(el("li", { class: "hint ex-empty" }, "Empty: add steps from the pool."));
    }
    markB.addEventListener("click", () => {
      let marks = 0; const lines = [];
      const placed = new Set();
      plan.forEach((s, i) => {
        let msg, ok = false;
        if (s.mark) {
          const missing = s.deps.filter((d) => !placed.has(d));
          if (missing.length) msg = `cannot be built yet: it needs “${STEPS.find((x) => x.id === missing[0]).t}” first.`;
          else { ok = true; msg = "precise and buildable: 1 mark."; }
        } else if (s.vague) msg = `no mark. ${s.why}`;
        else msg = `no mark. ${s.wrong}`;
        if (ok) marks++;
        placed.add(s.id);
        if (s.vague) placed.add(s.vague); // a vague step still lets later steps be built, but earns nothing itself
        lines.push(el("li", { class: ok ? "ok-line" : "bad-line" }, el("b", null, `Step ${i + 1}: ${ok ? "✔" : "✘"}`), " ", msg));
      });
      const missingAll = STEPS.filter((s) => s.mark && !plan.includes(s));
      out.innerHTML = "";
      out.append(el("p", { class: "readout" }, `The court awards ${marks} / 8`), el("ul", { class: "ex-lines-out" }, lines));
      if (missingAll.length) out.append(el("p", null, el("b", null, "Not described: "), missingAll.map((s) => s.t.replace(/\.$/, "")).join("; ") + "."));
      if (marks === 8) out.append(el("p", { class: "ok" }, "Full marks. Notice that more than one order would have scored: the court only needs each step to be possible when you reach it."));
    });
    showB.addEventListener("click", () => { plan = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"].map((id) => STEPS.find((s) => s.id === id)); render(); out.innerHTML = "<p>One full-mark plan. Press “Mark the plan” to see the court's record, or reorder it: the groove and the holes can be made in either order.</p>"; });
    resetB.addEventListener("click", () => { plan = []; out.innerHTML = ""; render(); });
    render();
  });

  /* =====================================================================
     4.2 Trace it: one feature in four views
     ===================================================================== */
  mount("w-trace", (box) => {
    // an L-shaped block with an inclined face, extruded 40 deep, and a Ø10 hole through the upright
    const P = [[0, 0], [60, 0], [60, 20], [30, 20], [20, 35], [20, 50], [0, 50]]; // (x, z)
    const D = 40;
    const side = (i) => { const [a, b] = [P[i], P[(i + 1) % P.length]]; return [[a[0], 0, a[1]], [b[0], 0, b[1]], [b[0], D, b[1]], [a[0], D, a[1]]]; };
    const FEAT = [
      { id: "front", name: "Front face", poly: P.map(([x, z]) => [x, 0, z]),
        note: "Elevation: true shape (the whole L-shaped outline), because the face is square to the line of sight. Plan: seen edge-on, the line along the front (bottom) edge. End elevation: seen edge-on, the left-hand vertical edge." },
      { id: "incline", name: "Inclined face", poly: side(3),
        note: "Elevation: seen edge-on, so it is the sloping line. Plan: a rectangle 10 wide, but foreshortened. End elevation: a rectangle 15 high, also foreshortened. Its true width is the sloping length, √(10² + 15²) = 18.0, which no view here shows: only an auxiliary view square to the slope would." },
      { id: "basetop", name: "Top of the base", poly: side(2),
        note: "Plan: true shape, a 30 × 40 rectangle. Elevation and end elevation: seen edge-on, a horizontal line at height 20." },
      { id: "uptop", name: "Top of the upright", poly: side(5),
        note: "Plan: true shape, a 20 × 40 rectangle at the left. Elevation and end elevation: seen edge-on, the top line at height 50." },
      { id: "end", name: "Right end of the base", poly: side(1),
        note: "End elevation: true shape, the 40 × 20 rectangle at the bottom. Elevation: seen edge-on, the vertical line at the right. Plan: seen edge-on, the right-hand edge." },
      { id: "upface", name: "Right face of the upright", poly: side(4),
        note: "End elevation: true shape, the 40 × 15 band at the top. Elevation: seen edge-on, the short vertical line. Plan: seen edge-on, the line where the upright's top meets the inclined face." },
      { id: "hole", name: "Ø10 hole", hole: true,
        note: "Elevation: a circle with two centre lines, because you look along the hole. Plan and end elevation: two dashed hidden-detail lines and a centre line, because the hole is inside the material." },
    ];
    const VIEWS = {
      elev: ([x, , z]) => [30 + 2 * x, 350 - 2 * z],
      plan: ([x, y]) => [30 + 2 * x, 220 - 2 * y],
      end: ([, y, z]) => [190 + 2 * y, 350 - 2 * z],
    };
    const iso = ([x, y, z]) => [285 + 1.6 * (x + y) / Math.SQRT2, 150 - 1.6 * (-x + y + 2 * z) / Math.sqrt(6)];
    const pts = (a) => a.map((p) => p.map((v) => v.toFixed(1)).join(",")).join(" ");
    const area2 = (a) => { let s = 0; for (let i = 0; i < a.length; i++) { const [x0, y0] = a[i], [x1, y1] = a[(i + 1) % a.length]; s += x0 * y1 - x1 * y0; } return Math.abs(s) / 2; };
    let sel = "incline", proj = true;
    const svg = svgBox("0 0 420 372", "", "ex-trace");
    const fig = el("div", { class: "ex-trace-wrap" }, svg);
    const btns = el("div", { class: "seg", role: "group", "aria-label": "Feature" }, el("span", { class: "seg-label" }, "Feature:"));
    const bmap = {};
    FEAT.forEach((f) => { const b = el("button", { class: "seg-btn", type: "button", "aria-pressed": "false" }, f.name); b.addEventListener("click", () => { sel = f.id; draw(); }); bmap[f.id] = b; btns.append(b); });
    const projB = el("button", { class: "btn small", type: "button", "aria-pressed": "true" }, "Projection lines: on");
    projB.addEventListener("click", () => { proj = !proj; projB.textContent = `Projection lines: ${proj ? "on" : "off"}`; projB.setAttribute("aria-pressed", String(proj)); draw(); });
    const note = el("p", { class: "sim-note", "aria-live": "polite" });
    box.append(btns, fig, el("div", { class: "btn-row" }, projB), note);
    const S = (tag, a) => HG.svg(tag, a);
    const holeC = [10, 42], HR = 5;
    function base(g) {
      const thick = { class: "stroke-ink", fill: "none", "stroke-width": 2.2 };
      const thin = (dash) => ({ class: "stroke-ink", fill: "none", "stroke-width": 1, "stroke-dasharray": dash });
      // elevation
      g.append(S("polygon", { points: pts(P.map(([x, z]) => VIEWS.elev([x, 0, z]))), ...thick, class: "stroke-ink f-card" }));
      const [hx, hz] = VIEWS.elev([holeC[0], 0, holeC[1]]);
      g.append(S("circle", { cx: hx, cy: hz, r: HR * 2, ...thick }));
      g.append(S("path", { d: `M${hx - 15} ${hz} H${hx + 15} M${hx} ${hz - 15} V${hz + 15}`, ...thin("8 3 2 3") }));
      // plan
      g.append(S("rect", { x: 30, y: 140, width: 120, height: 80, ...thick, class: "stroke-ink f-card" }));
      g.append(S("path", { d: "M70 140 V220 M90 140 V220", ...thick }));
      g.append(S("path", { d: "M40 140 V220 M60 140 V220", ...thin("5 3") }));
      g.append(S("path", { d: "M50 134 V226", ...thin("10 3 2 3") }));
      // end elevation
      g.append(S("rect", { x: 190, y: 250, width: 80, height: 100, ...thick, class: "stroke-ink f-card" }));
      g.append(S("path", { d: "M190 310 H270 M190 280 H270", ...thick }));
      g.append(S("path", { d: "M190 276 H270 M190 256 H270", ...thin("5 3") }));
      g.append(S("path", { d: "M184 266 H276", ...thin("10 3 2 3") }));
      g.append(S("path", { d: "M186 224 L266 144", class: "s-muted", fill: "none", "stroke-width": 1, "stroke-dasharray": "6 4" }));
    }
    function draw() {
      svg.innerHTML = "";
      const g = S("g", {}); svg.append(g);
      base(g);
      const f = FEAT.find((x) => x.id === sel);
      const hi = S("g", {}); svg.append(hi);
      const hiFill = { class: "f-red s-red", "fill-opacity": ".35", "stroke-width": 3 };
      const verts = [];
      if (f.hole) {
        const [hx, hz] = VIEWS.elev([10, 0, 42]);
        hi.append(S("circle", { cx: hx, cy: hz, r: 10, ...hiFill }));
        hi.append(S("path", { d: "M40 140 V220 M60 140 V220 M190 276 H270 M190 256 H270", class: "s-red", fill: "none", "stroke-width": 3, "stroke-dasharray": "6 3" }));
        [[5, 42], [15, 42], [10, 37], [10, 47]].forEach(([x, z]) => { verts.push([x, 0, z]); verts.push([x, D, z]); });
      } else {
        Object.values(VIEWS).forEach((V) => {
          const p2 = f.poly.map(V);
          if (area2(p2) > 1) hi.append(S("polygon", { points: pts(p2), ...hiFill }));
          else {
            // edge-on: the face shows as a line from its extreme points
            let best = [p2[0], p2[0]], bd = -1;
            p2.forEach((a) => p2.forEach((b) => { const dd = Math.hypot(a[0] - b[0], a[1] - b[1]); if (dd > bd) { bd = dd; best = [a, b]; } }));
            hi.append(S("line", { x1: best[0][0], y1: best[0][1], x2: best[1][0], y2: best[1][1], class: "s-red", "stroke-width": 5, "stroke-linecap": "round" }));
          }
        });
        verts.push(...f.poly);
      }
      if (proj) {
        const pl = S("g", { class: "s-red", fill: "none", "stroke-width": 1, "stroke-dasharray": "3 3", opacity: ".8" });
        const seen = new Set();
        const line = (d) => { if (!seen.has(d)) { seen.add(d); pl.append(S("path", { d })); } };
        verts.forEach((v) => {
          const e = VIEWS.elev(v), p = VIEWS.plan(v), n = VIEWS.end(v);
          line(`M${e[0]} ${e[1]} V${p[1]}`);
          line(`M${e[0]} ${e[1]} H${n[0]}`);
          line(`M${p[0]} ${p[1]} H${410 - p[1]} V${n[1]}`);
        });
        svg.insertBefore(pl, hi);
      }
      // isometric pictorial: back faces culled (outward normal of a counter-clockwise (x, z) profile edge), the rest painted far to near
      const isoG = S("g", {}); svg.append(isoG);
      const cam = [1, -1, 1];
      const list = [{ id: "front", q: P.map(([x, z]) => [x, 0, z]) }];
      for (let i = 0; i < P.length; i++) {
        const [a, b] = [P[i], P[(i + 1) % P.length]];
        const n = [b[1] - a[1], -(b[0] - a[0])];
        if (n[0] * cam[0] + n[1] * cam[2] > 0) list.push({ id: (FEAT.find((x) => x.poly && x.poly[0][0] === a[0] && x.poly[0][2] === a[1] && x.poly[1][0] === b[0] && x.poly[1][2] === b[1] && x.poly.length === 4) || {}).id, q: side(i) });
      }
      const depth = (q) => q.reduce((s, [x, y, z]) => s + x - y + z, 0) / q.length;
      list.sort((a, b) => depth(a.q) - depth(b.q));
      list.forEach((L) => {
        const on = L.id === sel;
        const isTop = L.q.every((p) => p[2] === L.q[0][2]) && L.id !== "front";
        const poly = S("polygon", { points: pts(L.q.map(iso)), class: on ? "f-red stroke-ink" : `${isTop ? "f-card" : L.id === "front" ? "f-paper2" : "f-muted"} stroke-ink`, "fill-opacity": on ? ".55" : L.id === "front" || isTop ? "1" : ".35", "stroke-width": 1.6, "stroke-linejoin": "round" });
        if (L.id) { poly.style.cursor = "pointer"; poly.addEventListener("click", () => { sel = L.id; draw(); }); }
        isoG.append(poly);
      });
      const ring = []; for (let k = 0; k < 32; k++) { const t = k / 32 * 2 * Math.PI; ring.push(iso([10 + 5 * Math.cos(t), 0, 42 + 5 * Math.sin(t)])); }
      const hp = S("polygon", { points: pts(ring), class: sel === "hole" ? "f-red stroke-ink" : "ink stroke-ink", "fill-opacity": sel === "hole" ? ".8" : ".75", "stroke-width": 1.2 });
      hp.style.cursor = "pointer"; hp.addEventListener("click", () => { sel = "hole"; draw(); });
      isoG.append(hp);
      // labels
      const lab = (x, y, t, a = "middle") => svg.append(S("text", { x, y, "text-anchor": a, "font-size": 13, "font-weight": 700, class: "ink", text: t }));
      lab(90, 132, "PLAN"); lab(90, 368, "ELEVATION"); lab(230, 368, "END ELEVATION"); lab(345, 210, "PICTORIAL"); lab(345, 226, "(isometric)");
      svg.lastChild.setAttribute("font-weight", "400"); svg.lastChild.setAttribute("font-size", "12");
      Object.entries(bmap).forEach(([k, b]) => b.setAttribute("aria-pressed", String(k === sel)));
      note.innerHTML = `<b>${f.name}.</b> ${f.note}`;
      svg.setAttribute("aria-label", `Third-angle plan, elevation and end elevation of an L-shaped block with an inclined face and a hole, with an isometric pictorial. Highlighted: ${f.name}. ${f.note}`);
    }
    draw();
  });

  /* =====================================================================
     4.3 Symbol quick-recall
     ===================================================================== */
  const ln = (d, w = 1.4, dash) => `<path d="${d}" class="stroke-ink" fill="none" stroke-width="${w}"${dash ? ` stroke-dasharray="${dash}"` : ""}/>`;
  const tx = (x, y, t, o = "") => `<text x="${x}" y="${y}" font-size="13" class="ink" ${o}>${t}</text>`;
  const ah = (x, y, dx, dy) => { // arrowhead with its tip at (x, y), pointing along (dx, dy)
    const L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, bx = x - ux * 8, by = y - uy * 8;
    return `<path d="M${x} ${y} L${(bx - uy * 3).toFixed(1)} ${(by + ux * 3).toFixed(1)} L${(bx + uy * 3).toFixed(1)} ${(by - ux * 3).toFixed(1)} Z" class="ink"/>`;
  };
  const hex = (cx, cy, r) => [0, 60, 120, 180, 240, 300].map((a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)].map((v) => v.toFixed(1)).join(",")).join(" ");
  const SYM = [
    // line types and conventions
    { cat: "line", name: "Outline", note: "Continuous thick: visible edges and outlines.", svg: ln("M15 50 H145", 4) },
    { cat: "line", name: "Projection line", note: "Continuous thin: projecting between views (dimension and extension lines are thin too).", svg: ln("M15 50 H145", 1.2) },
    { cat: "line", name: "Hidden detail line", note: "Dashed thin: edges that cannot be seen from the viewing direction.", svg: ln("M15 50 H145", 1.6, "9 5") },
    { cat: "line", name: "Centre line", note: "Thin long dash, dot chain: centres and axes of symmetry.", svg: ln("M10 50 H150", 1.3, "22 5 3 5") },
    { cat: "line", name: "Fold line", note: "Thin long dash, double-dot chain: folds on surface developments.", svg: ln("M10 50 H150", 1.3, "22 5 3 5 3 5") },
    { cat: "line", name: "Cutting plane", note: "Chain line, thick at the ends, with arrows for the viewing direction and letters naming the section.", svg: ln("M32 60 H128", 1.3, "18 5 3 5") + ln("M14 60 H32 M128 60 H146", 4) + ln("M18 60 V40 M142 60 V40", 1.4) + ah(18, 30, 0, -1) + ah(142, 30, 0, -1) + tx(26, 34, "A", 'font-weight="700"') + tx(124, 34, "A", 'font-weight="700"') },
    { cat: "line", name: "Knurling (straight)", note: "Straight knurling: parallel lines along the axis over the knurled length.", svg: `<rect x="20" y="28" width="120" height="44" class="f-card stroke-ink" stroke-width="2"/>` + ln("M50 28 V72 M110 28 V72", 1) + ln([33, 38, 43, 48, 53, 58, 63, 68].map((y) => `M50 ${y} H110`).join(" "), 1) },
    { cat: "line", name: "Knurling (diamond)", note: "Diamond knurling: two sets of crossing diagonal lines.", svg: `<rect x="20" y="28" width="120" height="44" class="f-card stroke-ink" stroke-width="2"/>` + ln("M50 28 V72 M110 28 V72", 1) + `<svg x="50" y="28" width="60" height="44" viewBox="0 0 60 44">${ln(Array.from({ length: 14 }, (_, k) => `M${k * 8 - 44} 0 l44 44 M${k * 8} 0 l-44 44`).join(" "), 1)}</svg>` },
    // dimensioning and tolerances
    { cat: "dim", name: "Diameter", note: "Ø before the size: the full width of a circle through its centre.", svg: `<circle cx="60" cy="56" r="28" class="stroke-ink" fill="none" stroke-width="2"/>` + ln("M79.8 36.2 L104 16 H146", 1) + ah(79.8, 36.2, -24.2, 20.2) + tx(110, 12, "Ø40") },
    { cat: "dim", name: "Radius", note: "R before the size, with the arrow touching the arc.", svg: ln("M20 90 V20 H90 A40 40 0 0 1 130 60 V90", 2.2) + ln("M118.3 31.7 L136 14 H154", 1) + ah(118.3, 31.7, -17.7, 17.7) + tx(134, 10, "R20") },
    { cat: "dim", name: "Square symbol", note: "□ before the size of a square feature: one size gives both sides.", svg: `<rect x="40" y="16" width="56" height="56" class="stroke-ink f-card" stroke-width="2"/>` + ln("M40 76 V92 M96 76 V92 M40 88 H96", 1) + ah(40, 88, -1, 0) + ah(96, 88, 1, 0) + tx(102, 92, "□30") },
    { cat: "dim", name: "Across flats (A/F)", note: "A hexagon sized between opposite flat sides.", svg: `<polygon points="${hex(58, 50, 30)}" class="stroke-ink f-card" stroke-width="2"/>` + ln("M77 24 H114 M77 76 H114 M108 24 V76", 1) + ah(108, 24, 0, -1) + ah(108, 76, 0, 1) + tx(112, 55, "52 A/F") },
    { cat: "dim", name: "Across corners (A/C)", note: "A hexagon sized between opposite corners.", svg: `<polygon points="${hex(60, 46, 30)}" class="stroke-ink f-card" stroke-width="2"/>` + ln("M30 50 V96 M90 50 V96 M30 90 H90", 1) + ah(30, 90, -1, 0) + ah(90, 90, 1, 0) + tx(96, 94, "60 A/C") },
    { cat: "dim", name: "Pitch circle diameter (PCD)", note: "The diameter of the circle through the centres of a ring of holes.", svg: `<circle cx="60" cy="50" r="40" class="stroke-ink f-card" stroke-width="2"/>` + `<circle cx="60" cy="50" r="26" class="stroke-ink" fill="none" stroke-width="1" stroke-dasharray="12 3 2 3"/>` + [45, 135, 225, 315].map((a) => `<circle cx="${(60 + 26 * Math.cos(a * Math.PI / 180)).toFixed(1)}" cy="${(50 + 26 * Math.sin(a * Math.PI / 180)).toFixed(1)}" r="5" class="stroke-ink" fill="none" stroke-width="1.6"/>`).join("") + ln("M84 40 L112 22 H150", 1) + ah(84, 40, -28, 18) + tx(112, 17, "PCD 52") },
    { cat: "dim", name: "Third-angle projection symbol", note: "The cone's elevation with the circles of its end view drawn on the right: third angle.", svg: ln("M28 28 L76 40 V60 L28 72 Z", 2) + `<circle cx="116" cy="50" r="22" class="stroke-ink" fill="none" stroke-width="2"/><circle cx="116" cy="50" r="11" class="stroke-ink" fill="none" stroke-width="2"/>` + ln("M18 50 H146 M116 20 V80", 1, "10 3 2 3") },
    { cat: "dim", name: "Leader line", note: "A thin line from a note to the feature: an arrowhead on an edge (a dot when it ends inside an outline).", svg: `<rect x="16" y="40" width="80" height="44" class="stroke-ink f-card" stroke-width="2"/>` + ln("M96 52 L120 26 H150", 1) + ah(96, 52, -24, 26) + tx(104, 20, "NOTE 2") },
    { cat: "dim", name: "Chain dimensioning", note: "Each size runs end to end from the last feature to the next.", svg: `<rect x="15" y="16" width="130" height="30" class="stroke-ink f-card" stroke-width="2"/>` + ln("M15 50 V84 M55 50 V84 M95 50 V84 M145 50 V84 M15 78 H145", 1) + [15, 55, 95].map((x, i) => ah(x, 78, -1, 0) + ah([55, 95, 145][i], 78, 1, 0)).join("") + tx(29, 74, "20") + tx(69, 74, "20") + tx(114, 74, "25") },
    { cat: "dim", name: "Parallel dimensioning", note: "All sizes from one datum, stacked: no accumulated error.", svg: `<rect x="15" y="12" width="130" height="26" class="stroke-ink f-card" stroke-width="2"/>` + ln("M15 42 V96 M55 42 V64 M95 42 V78 M145 42 V92 M15 60 H55 M15 74 H95 M15 88 H145", 1) + ah(15, 60, -1, 0) + ah(55, 60, 1, 0) + ah(15, 74, -1, 0) + ah(95, 74, 1, 0) + ah(15, 88, -1, 0) + ah(145, 88, 1, 0) + tx(28, 57, "20") + tx(48, 71, "40") + tx(72, 85, "65") },
    { cat: "dim", name: "Running dimensioning", note: "One line from a marked origin; the size at each arrowhead is measured from that origin.", svg: `<rect x="15" y="14" width="130" height="30" class="stroke-ink f-card" stroke-width="2"/>` + ln("M15 48 V78 M55 48 V78 M95 48 V78 M145 48 V78 M15 72 H145", 1) + `<circle cx="15" cy="72" r="4" class="stroke-ink f-card" stroke-width="1.4"/>` + ah(55, 72, 1, 0) + ah(95, 72, 1, 0) + ah(145, 72, 1, 0) + tx(10, 94, "0") + tx(46, 94, "20") + tx(86, 94, "40") + tx(136, 94, "65") },
    { cat: "dim", name: "Angular dimension", note: "An arc between the two lines, with the angle in degrees.", svg: ln("M20 84 H150 M20 84 L120 26", 2) + `<path d="M110 84 A90 90 0 0 0 98 39" class="stroke-ink" fill="none" stroke-width="1"/>` + ah(110, 84, 0, 1) + ah(98, 39, -0.5, -0.87) + tx(110, 62, "30°") },
    { cat: "dim", name: "Symmetrical tolerance", note: "Nominal size ± the same allowance each way: here 39.9 to 40.1.", svg: ln("M20 30 V80 M140 30 V80 M20 72 H140", 1) + ah(20, 72, -1, 0) + ah(140, 72, 1, 0) + tx(80, 64, "40 ± 0.1", 'text-anchor="middle"') },
    { cat: "dim", name: "Asymmetrical tolerance", note: "Nominal size with different upper and lower allowances.", svg: ln("M20 30 V80 M140 30 V80 M20 72 H140", 1) + ah(20, 72, -1, 0) + ah(140, 72, 1, 0) + tx(64, 64, "40", 'text-anchor="middle"') + `<text x="74" y="54" font-size="11" class="ink">+0.2</text><text x="74" y="67" font-size="11" class="ink">−0.1</text>` },
    { cat: "dim", name: "Common tolerance", note: "The upper limit written above the lower limit.", svg: ln("M20 24 V80 M140 24 V80 M20 72 H140", 1) + ah(20, 72, -1, 0) + ah(140, 72, 1, 0) + tx(80, 50, "40.2", 'text-anchor="middle"') + tx(80, 66, "39.8", 'text-anchor="middle"') },
    // building symbols (Appendix 2, from the British Standard)
    { cat: "bld", name: "Lamp", note: "A circle with a diagonal cross inside it.", svg: `<circle cx="80" cy="50" r="22" class="stroke-ink" fill="none" stroke-width="2"/>` + ln("M64.4 34.4 L95.6 65.6 M95.6 34.4 L64.4 65.6", 2) },
    { cat: "bld", name: "Switch", note: "A small circle with an angled line ending in a short tick.", svg: `<circle cx="60" cy="70" r="6" class="stroke-ink" fill="none" stroke-width="2"/>` + ln("M64.2 65.8 L100 30 L108 38", 2) },
    { cat: "bld", name: "Door", note: "A gap in the wall with the door leaf and the arc of its swing.", svg: `<rect x="6" y="74" width="34" height="8" class="ink"/><rect x="106" y="74" width="48" height="8" class="ink"/>` + ln("M40 78 V12", 2.2) + `<path d="M40 12 A66 66 0 0 1 106 78" class="stroke-ink" fill="none" stroke-width="1.2"/>` },
    { cat: "bld", name: "Window — fixed", note: "A window frame with no opening lines: it does not open.", svg: `<rect x="40" y="14" width="80" height="72" class="stroke-ink f-card" stroke-width="2"/><rect x="47" y="21" width="66" height="58" class="stroke-ink" fill="none" stroke-width="1.2"/>` },
    { cat: "bld", name: "Window — hinged at side", note: "Opening lines meet at a point on the hinged side (here the left).", svg: `<rect x="40" y="14" width="80" height="72" class="stroke-ink f-card" stroke-width="2"/><rect x="47" y="21" width="66" height="58" class="stroke-ink" fill="none" stroke-width="1.2"/>` + ln("M113 21 L47 50 L113 79", 1.2) },
    { cat: "bld", name: "Window — hinged at top", note: "Opening lines meet at a point on the top edge, where the hinge is.", svg: `<rect x="40" y="14" width="80" height="72" class="stroke-ink f-card" stroke-width="2"/><rect x="47" y="21" width="66" height="58" class="stroke-ink" fill="none" stroke-width="1.2"/>` + ln("M47 79 L80 21 L113 79", 1.2) },
    { cat: "bld", name: "Window — hinged at bottom", note: "Opening lines meet at a point on the bottom edge, where the hinge is.", svg: `<rect x="40" y="14" width="80" height="72" class="stroke-ink f-card" stroke-width="2"/><rect x="47" y="21" width="66" height="58" class="stroke-ink" fill="none" stroke-width="1.2"/>` + ln("M47 21 L80 79 L113 21", 1.2) },
    { cat: "bld", name: "Window — sliding horizontally", note: "An arrow shows the sash slides sideways.", svg: `<rect x="40" y="14" width="80" height="72" class="stroke-ink f-card" stroke-width="2"/><rect x="47" y="21" width="66" height="58" class="stroke-ink" fill="none" stroke-width="1.2"/>` + ln("M56 50 H100", 1.6) + ah(106, 50, 1, 0) },
    { cat: "bld", name: "Wood (sawn)", note: "Sawn timber in section: a rectangle with both diagonals.", svg: `<rect x="30" y="28" width="100" height="44" class="stroke-ink f-card" stroke-width="2"/>` + ln("M30 28 L130 72 M130 28 L30 72", 1.2) },
    { cat: "bld", name: "Brickwork", note: "Brickwork in section: thin diagonal hatching.", svg: `<rect x="30" y="24" width="100" height="52" class="stroke-ink f-card" stroke-width="2"/><svg x="30" y="24" width="100" height="52" viewBox="0 0 100 52">${ln(Array.from({ length: 20 }, (_, k) => `M${k * 9 - 52} 52 l52 -52`).join(" "), 1)}</svg>` },
    { cat: "bld", name: "Concrete", note: "Concrete in section: small triangles (aggregate) and dots.", svg: `<rect x="30" y="24" width="100" height="52" class="stroke-ink f-card" stroke-width="2"/>` + [[44, 40], [70, 34], [100, 44], [56, 62], [88, 64], [116, 60], [112, 32]].map(([x, y]) => `<path d="M${x} ${y} l6 -8 l5 9 Z" class="stroke-ink" fill="none" stroke-width="1"/>`).join("") + [[40, 56], [62, 46], [80, 52], [96, 34], [104, 68], [122, 46], [48, 70], [76, 70], [86, 40]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.4" class="ink"/>`).join("") },
    { cat: "bld", name: "North point", note: "An arrow marked N showing the direction of north on a site plan.", svg: `<circle cx="80" cy="56" r="26" class="stroke-ink" fill="none" stroke-width="1.4"/><path d="M80 26 L90 70 L80 62 L70 70 Z" class="ink"/>` + tx(80, 18, "N", 'text-anchor="middle" font-weight="700"') },
    { cat: "bld", name: "Contours", note: "Lines joining points of equal ground height, labelled with their levels.", svg: ln("M10 30 C40 18 70 42 100 28 S140 24 150 30 M10 55 C40 43 70 67 100 53 S140 49 150 55 M10 80 C40 68 70 92 100 78 S140 74 150 80", 1.4) + `<text x="128" y="22" font-size="11" class="ink">11.0</text><text x="128" y="47" font-size="11" class="ink">10.5</text><text x="128" y="72" font-size="11" class="ink">10.0</text>` },
    { cat: "bld", name: "Bath", note: "A long rectangle with a rounded inner tub and the plug hole at one end.", svg: `<rect x="20" y="24" width="120" height="52" class="stroke-ink f-card" stroke-width="2"/><rect x="28" y="31" width="104" height="38" rx="17" class="stroke-ink" fill="none" stroke-width="1.4"/><circle cx="40" cy="50" r="3" class="stroke-ink" fill="none" stroke-width="1.2"/>` },
    { cat: "bld", name: "WC", note: "The cistern against the wall and the oval bowl in front of it.", svg: `<rect x="22" y="32" width="24" height="36" class="stroke-ink f-card" stroke-width="2"/><path d="M46 36 H76 A34 20 0 0 1 76 64 H46" class="stroke-ink f-card" stroke-width="2"/><ellipse cx="78" cy="50" rx="22" ry="11" class="stroke-ink" fill="none" stroke-width="1.2"/>` },
  ];
  const CAT_LBL = { all: "All", line: "Line types", dim: "Dimensioning & tolerances", bld: "Building symbols" };
  mount("w-symbols", (box) => {
    let cat = "all", round = [], i = 0, right = 0, streak = 0, t0 = 0;
    HG.choice(box, "Category:", Object.entries(CAT_LBL), "all", (v) => { cat = v; start(); });
    const stage = el("div", { class: "ex-sym" });
    const pic = el("div", { class: "ex-sym-pic" });
    const opts = el("div", { class: "ex-sym-opts", role: "group", "aria-label": "Which symbol is this?" });
    const fb = el("p", { class: "ex-verdict", "aria-live": "polite" });
    const nextB = el("button", { class: "btn small primary", type: "button", hidden: true }, "Next ▶");
    const ro = el("p", { class: "readout", "aria-live": "polite" });
    const startB = el("button", { class: "btn small", type: "button" }, "↺ New round");
    stage.append(pic, opts);
    box.append(stage, fb, el("div", { class: "btn-row" }, nextB, startB), ro);
    function start() {
      const pool = SYM.filter((s) => cat === "all" || s.cat === cat);
      round = shuffle(pool.slice()).slice(0, 10); i = 0; right = 0; streak = 0; t0 = Date.now();
      ask();
    }
    function ask() {
      fb.textContent = ""; nextB.hidden = true;
      if (i >= round.length) {
        pic.innerHTML = ""; opts.innerHTML = "";
        ro.textContent = `Round over: ${right} / ${round.length} in ${Math.round((Date.now() - t0) / 1000)} s.`;
        fb.textContent = right === round.length ? "Every symbol named. Drill another category." : "Start a new round; the ones you missed will come up again at random.";
        return;
      }
      const s = round[i];
      pic.innerHTML = `<svg viewBox="0 0 160 100" role="img" aria-label="Symbol ${i + 1} of ${round.length}. Name it from the options.">${s.svg}</svg>`;
      const others = shuffle(SYM.filter((x) => x.cat === s.cat && x.name !== s.name)).slice(0, 3);
      opts.innerHTML = "";
      shuffle([s, ...others]).forEach((o) => {
        const b = el("button", { class: "q-opt", type: "button" }, o.name);
        b.addEventListener("click", () => answer(o, b));
        opts.append(b);
      });
      ro.textContent = `Symbol ${i + 1} of ${round.length} · score ${right} · streak ${streak}`;
    }
    function answer(o, b) {
      const s = round[i];
      if (opts.dataset.lock === String(i)) return;
      opts.dataset.lock = String(i);
      const ok = o === s;
      if (ok) { right++; streak++; } else streak = 0;
      opts.querySelectorAll("button").forEach((x) => { x.setAttribute("aria-disabled", "true"); if (x.textContent === s.name) x.classList.add("right"); });
      if (!ok) b.classList.add("wrong");
      fb.innerHTML = `${ok ? "<span class='ok'>✔ Correct.</span>" : `<span class='bad'>✘ It is: ${HG.esc(s.name)}.</span>`} ${HG.esc(s.note)}`;
      i++;
      ro.textContent = `Symbol ${i} of ${round.length} · score ${right} · streak ${streak}`;
      nextB.hidden = false; nextB.textContent = i >= round.length ? "See the result ▶" : "Next ▶";
      nextB.focus();
    }
    nextB.addEventListener("click", ask);
    startB.addEventListener("click", start);
    start();
  });

  /* =====================================================================
     6. The court: marking the mini-paper
     ===================================================================== */
  const PAPER = [
    { q: 1, part: "1(a)", area: "dtp", marks: 2, mi: ["A: drop cap (1)", "B: pull quote (1)"] },
    { q: 1, part: "1(b)", area: "dtp", marks: 2, mi: ["Any two, each a cause linked to an effect (1 each):", "the title is in a large, bold font, the biggest on the poster, so it is the first thing the viewer sees", "the title is reversed out (white on the navy band), so it contrasts strongly and stands out from the rest", "the title has space round it with nothing else in the top band, so the eye goes straight to it", "Not accepted: 'creates emphasis' as the effect; an effect with no cause"] },
    { q: 1, part: "1(c)", area: "dtp", marks: 2, mi: ["Any two developed points (1 each):", "the body text is set in two equal columns with a gutter (and a column rule) between them", "the image spans the full width of both columns", "the drop cap, body text and image all align to the left edge of column 1 / the same margins", "the pull quote sits within the width of column 2", "A bare 'it uses a grid' or 'two columns' with no description earns at most one point"] },
    { q: 1, part: "1(d)", area: "dtp", marks: 1, mi: ["The colour is printed beyond where the sheet will be cut (cause), so no thin white edge shows if the trimming is slightly out (effect) (1)"] },
    { q: 1, part: "1(e)", area: "dtp", marks: 2, mi: ["Any two (1 each):", "the navy band is repeated at the top and the foot of the poster", "magenta is repeated in the title, the drop cap, the pull-quote rules and the small squares in the footer", "the same font family is used for the title and the footer text", "consistent margins and alignment to the grid tie the parts together"] },
    { q: 2, part: "2(a)", area: "cad", marks: 6, mi: ["On a plane through the axis (e.g. XY), sketch the half profile: radius 30 at the breech tapering to radius 22 at 225, then the ring radius 26 for the last 15 (240 overall) (1)", "Revolve the profile 360° about the centre axis (1)", "On the muzzle face, sketch a Ø20 circle concentric with the axis (1)", "Extrude-subtract the Ø20 circle 200 deep into the barrel (1)", "On the plane through the axis, sketch a Ø16 circle centred on the axis 100 from the breech (1)", "Extrude the Ø16 circle symmetrically, 96 in total (48 each way), adding it to form both trunnions (1)", "Alternative: one trunnion extruded 48 from the mid-plane, then mirrored about it, earns the last mark"] },
    { q: 2, part: "2(b)", area: "cad", marks: 2, mi: ["In the modelling tree, select and edit the sketch (or the extrude-subtract feature) of the bore (1)", "Change the Ø20 dimension to Ø24; the model updates (1)", "No marks for modelling the barrel again from scratch"] },
    { q: 2, part: "2(c)", area: "cad", marks: 2, mi: ["Any two (1 each), naming the constraint and the features:", "centre axis: a trunnion and its semicircular bearing cut-out", "mate: the trunnion's cylindrical face to the bearing face (or tangent)", "mate or offset: the barrel's side (or the trunnion's shoulder) to the inside face of the carriage cheek", "orientate: the barrel axis at a set angle (elevation) to the carriage base"] },
    { q: 3, part: "3(a)", area: "interp", marks: 3, mi: ["X: plan (1)", "Y: elevation (1)", "Z: end elevation (1)"] },
    { q: 3, part: "3(b)", area: "interp", marks: 2, mi: ["Horizontal run 90 − 40 = 50 and vertical rise 45 − 15 = 30 (1)", "True length = √(50² + 30²) = √3400 = 58.3 mm (1)"] },
    { q: 3, part: "3(c)", area: "interp", marks: 2, mi: ["(i) L: the edge where the flat top meets the sloping face (1)", "(ii) M: the sides of the groove under the chock, hidden from above (1)"] },
    { q: 4, part: "4(a)", area: "std", marks: 2, mi: ["A: hidden detail line (1)", "B: centre line (1)"] },
    { q: 4, part: "4(b)", area: "std", marks: 2, mi: ["Largest: 40.1 mm (1)", "Smallest: 39.9 mm (1)"] },
    { q: 4, part: "4(c)", area: "std", marks: 1, mi: ["Symmetrical tolerance (1)"] },
    { q: 4, part: "4(d)", area: "std", marks: 1, mi: ["Lamp (1)"] },
    { q: 5, part: "5(a)", area: "tech", marks: 2, mi: ["Any two different benefits, described in context (1 each):", "draughtsmen in Leith, Portsmouth or on board can open the files from anywhere with an internet connection (remote working)", "several people can share and work on the same, latest version (collaboration)", "earlier versions are kept and can be restored (back-up)", "no physical storage space is needed for the files", "files can be protected with encryption and access controls"] },
    { q: 5, part: "5(b)", area: "tech", marks: 2, mi: ["Any two linked points (1 each):", "DRM controls who can open the chart files, so only paying customers can use them", "DRM can stop copying, printing or sharing, so the charts are not passed on free", "this protects the Plan Room's intellectual property and its income from sales"] },
  ];
  const BOUNDS = [["A", 98], ["B", 84], ["C", 70], ["D", 56]];
  mount("w-paper", (box) => {
    const got = {};
    const ctrl = el("div", { class: "btn-row" });
    const allB = el("button", { class: "btn small", type: "button" }, "Reveal all the guidance");
    const clearB = el("button", { class: "btn small", type: "button" }, "↺ Clear my marks");
    ctrl.append(allB, clearB);
    box.append(ctrl);
    const qBlocks = [];
    [1, 2, 3, 4, 5].forEach((qn) => {
      const parts = PAPER.filter((p) => p.q === qn);
      const area = AREAS.find((a) => a.id === parts[0].area);
      const blk = el("div", { class: "ex-court-q" });
      const rev = el("button", { class: "btn small primary", type: "button" }, `Reveal Question ${qn} guidance`);
      const body = el("div", { hidden: true });
      parts.forEach((p) => {
        const row = el("div", { class: "ex-court-part" });
        row.append(el("p", { class: "ex-court-h" }, el("b", null, p.part), ` · ${p.marks} mark${p.marks > 1 ? "s" : ""}`));
        row.append(el("ul", { class: "ex-mi" }, p.mi.map((m) => el("li", null, m))));
        const seg = HG.choice(row, "Marks you earned:", Array.from({ length: p.marks + 1 }, (_, k) => [k, String(k)]), -1, (v) => { got[p.part] = v; paint(); });
        seg.dataset.part = p.part;
        body.append(row);
      });
      rev.addEventListener("click", () => { body.hidden = false; rev.hidden = true; });
      blk.append(el("h4", null, `Question ${qn} · ${area.name}`), rev, body);
      qBlocks.push([rev, body]);
      box.append(blk);
    });
    allB.addEventListener("click", () => qBlocks.forEach(([r, b]) => { r.hidden = true; b.hidden = false; }));
    clearB.addEventListener("click", () => { Object.keys(got).forEach((k) => delete got[k]); box.querySelectorAll(".ex-court-part .seg-btn").forEach((b) => b.setAttribute("aria-pressed", "false")); paint(); });
    const res = el("div", { class: "ex-results", "aria-live": "polite" });
    box.append(el("h4", null, "Results panel"), res);
    function paint() {
      const tot = PAPER.reduce((s, p) => s + p.marks, 0);
      const marked = PAPER.filter((p) => p.part in got).length;
      const score = PAPER.reduce((s, p) => s + (got[p.part] || 0), 0);
      const pct = (score / tot) * 100;
      res.innerHTML = "";
      res.append(el("p", { class: "readout" }, `${score} / ${tot} marks · ${N(pct, 0)}%` + (marked < PAPER.length ? ` (${marked} of ${PAPER.length} parts marked)` : "")));
      const bars = el("div", { class: "ex-bars" });
      let worst = null;
      AREAS.forEach((a) => {
        const ps = PAPER.filter((p) => p.area === a.id), av = ps.reduce((s, p) => s + p.marks, 0), sc = ps.reduce((s, p) => s + (got[p.part] || 0), 0);
        const f = av ? sc / av : 0;
        if (ps.every((p) => p.part in got) && (!worst || f < worst.f)) worst = { a, f };
        bars.append(el("div", { class: "ex-bar-row" }, el("span", { class: "ex-bar-lab" }, a.short),
          el("span", { class: "ex-bar-track" }, el("i", { class: `sw-${a.cls}`, style: `width:${(f * 100).toFixed(1)}%` })),
          el("span", { class: "ex-bar-n" }, `${sc}/${av}`)));
      });
      res.append(bars);
      // the 2025 boundaries as percentages of 140, with a marker at your percentage
      const sc2 = svgBox("0 0 360 70", `Your ${N(pct, 0)} per cent set against the 2025 grade-boundary percentages: D 40, C 50, B 60, A 70.`, "ex-bscale");
      const X = (p) => 10 + p * 3.4;
      sc2.append(HG.svg("rect", { x: 10, y: 24, width: 340, height: 14, class: "f-paper2 stroke-ink", "stroke-width": 1 }));
      BOUNDS.forEach(([g, m]) => {
        const p = (m / 140) * 100;
        sc2.append(HG.svg("line", { x1: X(p), y1: 18, x2: X(p), y2: 44, class: "stroke-ink", "stroke-width": 1.5 }));
        sc2.append(HG.svg("text", { x: X(p), y: 14, "text-anchor": "middle", "font-size": 12, class: "ink", text: `${g} ${N(p, 0)}%` }));
      });
      sc2.append(HG.svg("rect", { x: 10, y: 24, width: Math.max(0, X(pct) - 10), height: 14, class: "f-red", "fill-opacity": ".55" }));
      sc2.append(HG.svg("text", { x: Math.min(330, Math.max(30, X(pct))), y: 60, "text-anchor": "middle", "font-size": 12, "font-weight": 700, class: "ink", text: `you: ${N(pct, 0)}%` }));
      res.append(sc2);
      const band = BOUNDS.find(([, m]) => pct + 1e-9 >= (m / 140) * 100);
      res.append(el("p", null, marked
        ? `On this practice paper you scored ${N(pct, 0)}%. In 2025 the minimum for a grade ${band ? band[0] : "D"} was ${band ? band[1] : 56} of 140 (${band ? N(band[1] / 1.4, 0) : 40}%)${band ? `, so this is at or above that 2025 percentage` : ", so this is below the 2025 grade-D percentage"}. A 36-mark practice paper is only a rough guide: your grade comes from the whole 140-mark course.`
        : "Mark the parts to see your total, your areas and the 2025 grade-boundary percentages."));
      if (worst && marked === PAPER.length && worst.f < 1) res.append(el("p", null, "Weakest area on this paper: ", el("b", null, worst.a.name), ". Revise it on ", el("a", { href: worst.a.deck }, "its deck"), ", then re-sit this paper in a week."));
    }
    paint();
  });
})();
