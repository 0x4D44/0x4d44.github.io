/* Software Design & Development deck — interactive widgets. */
(function () {
  "use strict";
  const HC = window.HC;
  const el = HC.el;

  // The squadron used everywhere on this deck.
  const CADETS = [
    { name: "Ross", flight: "A", hours: 12 },
    { name: "Ailsa", flight: "B", hours: 31 },
    { name: "Callum", flight: "A", hours: 7 },
    { name: "Mhairi", flight: "C", hours: 31 },
    { name: "Euan", flight: "B", hours: 19 },
    { name: "Isla", flight: "C", hours: 4 },
    { name: "Kenzie", flight: "B", hours: 25 },
    { name: "Freya", flight: "A", hours: 19 },
  ];

  /* ============ 1. Two shipyards (iterative vs agile) ============ */
  function methods(box) {
    const W = 720, H = 330, X0 = 24, X1 = 560, TMAX = 1.2;
    const tx = (t) => X0 + (t / TMAX) * (X1 - X0);
    const S = HC.svg;
    const svg = S("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Animated comparison of an iterative project and an agile project. Text below the animation describes each event." });
    const PH = { A: ["Analysis", "#3e6fa8"], D: ["Design", "#6b4fa0"], I: ["Implement", "#4f8a2e"], T: ["Test", "#9a5f10"], Doc: ["Document", "#7a5532"], E: ["Evaluate", "#b3261e"] };
    // iterative plan; the change arrives at t = 0.45 and forces rework from analysis
    const CHANGE = 0.45;
    const iterPlan = [["A", 0, 0.14], ["D", 0.14, 0.28], ["I", 0.28, 0.54], ["T", 0.54, 0.7], ["Doc", 0.7, 0.8], ["E", 0.8, 0.9]];
    const iterReal = [["A", 0, 0.14], ["D", 0.14, 0.28], ["I", 0.28, CHANGE], ["A", 0.45, 0.53], ["D", 0.53, 0.63], ["I", 0.63, 0.86], ["T", 0.86, 1.0], ["Doc", 1.0, 1.07], ["E", 1.07, 1.15]];
    const sprints = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9]; // each 0.15 long; the 7th is the cost of the change
    const parts = ["hull", "lower gun deck", "masts", "+ extra gun deck", "rigging", "sails", "sea trials"];
    const g = S("g");
    svg.append(g);
    // static furniture
    const stat = [];
    stat.push(`<text x="${X0}" y="22" class="px ink" font-size="15">Yard 1 · Iterative (waterfall)</text>`);
    stat.push(`<text x="${X0}" y="184" class="px ink" font-size="15">Yard 2 · Agile</text>`);
    stat.push(`<line x1="${tx(0.9)}" y1="30" x2="${tx(0.9)}" y2="300" stroke="var(--muted)" stroke-dasharray="4 4"/>`);
    stat.push(`<text x="${tx(0.9) + 4}" y="314" font-size="11" class="muted">planned launch</text>`);
    stat.push(`<line x1="${tx(CHANGE)}" y1="30" x2="${tx(CHANGE)}" y2="300" stroke="var(--redstone)" stroke-dasharray="2 3" opacity=".6"/>`);
    stat.push(`<text x="${tx(CHANGE) - 4}" y="314" font-size="11" text-anchor="end" fill="var(--redstone)">Admiralty: "add a gun deck!"</text>`);
    stat.push(`<rect x="590" y="40" width="120" height="104" fill="var(--paper-2)" stroke="var(--line)"/><rect x="590" y="200" width="120" height="104" fill="var(--paper-2)" stroke="var(--line)"/>`);
    stat.push(`<text x="650" y="36" font-size="10" text-anchor="middle" class="muted">what the client can see</text><text x="650" y="196" font-size="10" text-anchor="middle" class="muted">what the client can see</text>`);
    const furn = S("g"); furn.innerHTML = stat.join(""); svg.prepend(furn);

    const ship = (x, y, n, total) => {
      // n parts of `total` built, drawn as blocky ship layers
      let s = "";
      const layers = [
        `<path d="M${x + 8} ${y + 70} h88 l-10 16 h-68 z" fill="#7a5532"/>`,
        `<rect x="${x + 14}" y="${y + 62}" width="76" height="8" fill="#3b2a1a"/><rect x="${x + 20}" y="${y + 64}" width="6" height="4" fill="#e0b23a"/><rect x="${x + 36}" y="${y + 64}" width="6" height="4" fill="#e0b23a"/><rect x="${x + 52}" y="${y + 64}" width="6" height="4" fill="#e0b23a"/><rect x="${x + 68}" y="${y + 64}" width="6" height="4" fill="#e0b23a"/>`,
        `<rect x="${x + 34}" y="${y + 14}" width="3" height="48" fill="#3b2a1a"/><rect x="${x + 64}" y="${y + 20}" width="3" height="42" fill="#3b2a1a"/>`,
        `<rect x="${x + 16}" y="${y + 54}" width="72" height="8" fill="#4a3522"/><rect x="${x + 24}" y="${y + 56}" width="6" height="4" fill="#e0b23a"/><rect x="${x + 44}" y="${y + 56}" width="6" height="4" fill="#e0b23a"/><rect x="${x + 64}" y="${y + 56}" width="6" height="4" fill="#e0b23a"/>`,
        `<path d="M${x + 35} ${y + 14} L${x + 12} ${y + 54} M${x + 35} ${y + 14} L${x + 88} ${y + 54} M${x + 65} ${y + 20} L${x + 92} ${y + 54}" stroke="#3b2a1a" stroke-width="1"/>`,
        `<rect x="${x + 22}" y="${y + 22}" width="28" height="24" fill="#f4ecd8" stroke="#888"/><rect x="${x + 54}" y="${y + 28}" width="24" height="20" fill="#f4ecd8" stroke="#888"/><rect x="${x + 36}" y="${y + 6}" width="12" height="7" fill="#c8102e"/>`,
      ];
      for (let k = 0; k < Math.min(n, total); k++) s += layers[k];
      return s;
    };

    let t = 0, playing = false, last = 0, raf = 0;
    const log = el("p", { class: "stepper-note", "aria-live": "polite" });
    const range = el("input", { type: "range", min: 0, max: 1000, value: 0, "aria-label": "Timeline position" });
    const go = el("button", { class: "btn primary", type: "button" }, "⚓ Launch");
    const rs = el("button", { class: "btn", type: "button" }, "↺ Reset");
    const scroller = el("div", { class: "diagram-scroll" }, svg);
    box.append(scroller, el("div", { class: "btn-row" }, go, rs, range), log);

    function narrate(t) {
      if (t < 0.02) return "Both yards receive the same order: build a frigate. The Admiralty is the client.";
      if (t < 0.14) return "Yard 1 analyses the whole job up front with the client. Yard 2 plans just its first sprint and starts building the hull.";
      if (t < CHANGE) return "Yard 1 is designing, then building, from a detailed plan, and the client sees nothing yet. Yard 2 shows the client a working piece at the end of every sprint and gets feedback.";
      if (t < 0.63) return "The Admiralty asks for an extra gun deck! Yard 1 must go back to analysis and redesign it, and some of the work already done is wasted. Yard 2 re-plans: the gun deck goes into its next sprint, and the remaining work moves along by one sprint.";
      if (t < 0.86) return "Yard 1 is re-implementing, and its separate testing phase still comes at the end. Yard 2 tests inside every sprint, so problems are found early.";
      if (t < 1.05) return "The change wasn't free for Yard 2 either: it costs one extra sprint, so it launches a little after the planned date. But the client has watched the ship grow and approved every piece. Yard 1 is only now testing.";
      return "Yard 1 delivers last, with the client involved mainly at the start and the end. Agile can't make change free, but it makes change cheaper. That suits a client whose needs change.";
    }
    function draw() {
      // playhead first, so labels sit on top of it
      let s = `<line x1="${tx(Math.min(t, TMAX))}" y1="30" x2="${tx(Math.min(t, TMAX))}" y2="300" stroke="var(--ink)" stroke-width="2"/>`;
      if (t < 0.02) {
        // before launch: a faint outline of each yard's plan, so the frame is never empty
        for (const [p, a, b] of iterPlan) s += `<rect x="${tx(a)}" y="40" width="${tx(b) - tx(a)}" height="34" fill="${PH[p][1]}" opacity=".18" stroke="${PH[p][1]}" stroke-dasharray="3 3"/>`;
        for (const a of sprints.slice(0, 6)) s += `<rect x="${tx(a)}" y="200" width="${tx(a + 0.15) - tx(a)}" height="34" fill="none" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
        s += `<text x="${tx(0.45)}" y="62" text-anchor="middle" font-size="12" class="ink2 halo">the plan · press ⚓ Launch</text><text x="${tx(0.45)}" y="222" text-anchor="middle" font-size="12" class="ink2 halo">six sprints planned · press ⚓ Launch</text>`;
      }
      // iterative bars
      for (const [p, a, b] of iterReal) {
        if (t <= a) continue;
        const e = Math.min(t, b);
        const rework = a >= CHANGE;
        s += `<rect x="${tx(a)}" y="${rework ? 82 : 40}" width="${Math.max(0, tx(e) - tx(a))}" height="34" fill="${PH[p][1]}" opacity="${rework ? 1 : (t > CHANGE && a >= 0.28 && a < CHANGE ? 0.35 : 1)}" stroke="var(--card)"/>`;
        if (tx(e) - tx(a) > 34) s += `<text x="${tx(a) + 4}" y="${rework ? 103 : 61}" font-size="11" fill="#fff">${PH[p][0]}</text>`;
      }
      if (t > CHANGE) s += `<text x="${tx(0.29)}" y="80" font-size="11" fill="var(--redstone)">✘ wasted work</text>`;
      if (t > CHANGE) s += `<text x="${tx(CHANGE) + 2}" y="128" font-size="11" fill="var(--redstone)">↻ back to analysis</text>`;
      // client contact markers for iterative
      const cI = [[0.02, "client"], [1.08, "client"]];
      for (const [ct] of cI) if (t > ct) s += `<text x="${tx(ct)}" y="36" font-size="13">⚓</text>`;
      // agile bars
      sprints.forEach((a, k) => {
        if (t <= a) return;
        const b = a + 0.15, e = Math.min(t, b);
        const quarters = ["#3e6fa8", "#6b4fa0", "#4f8a2e", "#9a5f10"];
        for (let q = 0; q < 4; q++) {
          const qa = a + q * 0.0375, qb = qa + 0.0375;
          if (e <= qa) break;
          s += `<rect x="${tx(qa)}" y="200" width="${tx(Math.min(e, qb)) - tx(qa)}" height="34" fill="${quarters[q]}"/>`;
        }
        s += `<text x="${tx(a) + 3}" y="250" font-size="10" class="ink2 halo">Sprint ${k + 1}</text>`;
        if (t > b) s += `<text x="${tx(b) - 14}" y="196" font-size="13">⚓</text><text x="${tx(b) - 2}" y="${276 + (k % 2) * 13}" font-size="10" text-anchor="end" fill="var(--grass)">✔ ${parts[k]}</text>`;
      });
      // ships
      const agileParts = Math.min(6, sprints.filter((a) => t >= a + 0.15).length);
      s += ship(598, 214, agileParts, 6);
      const iterDone = t >= 1.15;
      s += iterDone ? ship(598, 54, 6, 6) : `<text x="650" y="96" text-anchor="middle" font-size="11" class="muted">${t > 0.02 ? "nothing to show yet…" : ""}</text>`;
      // legend, on a backing strip so the dashed marker lines don't cross its words
      s += `<rect x="${X0 - 4}" y="142" width="${W - X0}" height="18" fill="var(--card)"/>` + Object.entries(PH).map(([k, [n, c]], i) => `<rect x="${X0 + i * 92}" y="146" width="10" height="10" fill="${c}"/><text x="${X0 + 14 + i * 92}" y="155" font-size="10" class="ink2">${n}</text>`).join("") + `<text x="${X0 + 6 * 92}" y="155" font-size="10" class="ink2">⚓ = client sees the work</text>`;
      g.innerHTML = s;
      // on a narrow screen, keep the playhead in view while the animation runs
      if (playing && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = tx(Math.min(t, TMAX)) / W * scroller.scrollWidth - scroller.clientWidth / 2;
      log.textContent = narrate(t);
      range.value = Math.round((t / TMAX) * 1000);
    }
    function tick(now) {
      if (!playing) return;
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      t += dt * (TMAX / 22); // ~22 seconds end to end
      if (t >= TMAX) { t = TMAX; playing = false; go.textContent = "⚓ Launch again"; }
      draw();
      if (playing) raf = requestAnimationFrame(tick);
    }
    if ("IntersectionObserver" in window) new IntersectionObserver((e) => {
      if (!e[0].isIntersecting && playing) { playing = false; cancelAnimationFrame(raf); go.textContent = "▶ Resume"; }
    }).observe(svg);
    go.addEventListener("click", () => {
      if (playing) { playing = false; go.textContent = "▶ Resume"; return; }
      if (t >= TMAX) t = 0;
      if (HC.reduced) { t = Math.min(TMAX, t + 0.15); draw(); go.textContent = t >= TMAX ? "⚓ Launch again" : "▶ Next stage"; return; }
      playing = true; go.textContent = "❚❚ Pause"; last = performance.now(); raf = requestAnimationFrame(tick);
    });
    rs.addEventListener("click", () => { playing = false; cancelAnimationFrame(raf); t = 0; go.textContent = "⚓ Launch"; draw(); });
    range.addEventListener("input", () => { playing = false; go.textContent = "▶ Resume"; t = (range.value / 1000) * TMAX; draw(); });
    draw();
  }

  /* ============ 2. Crafting table (parallel arrays → array of records) ============ */
  function structs(box) {
    const stage = el("div", { class: "craft-stage" });
    const readout = el("pre", { class: "craft-readout", "aria-live": "polite" });
    const idx = el("input", { type: "range", min: 0, max: 7, value: 3, "aria-label": "Array index" });
    const idxLab = el("span", { class: "readout" }, "index = 3");
    const craft = el("button", { class: "btn primary", type: "button" }, "⚒ Craft into records");
    box.append(el("div", { class: "btn-row" }, el("label", null, "Index ", idx), idxLab, craft), stage, readout);
    const fields = ["name", "flight", "hours"];
    const arrNames = ["names", "flights", "hours"];
    const cells = [];
    const labels = [];
    CADETS.forEach((c, i) => fields.forEach((f, r) => {
      const v = f === "hours" ? c.hours : `"${c[f]}"`;
      const d = el("div", { class: "slot f-" + f, "data-i": i, "data-r": r }, el("span", { class: "slot-v" }, String(v)));
      cells.push(d); stage.append(d);
    }));
    for (let r = 0; r < 3; r++) { const l = el("div", { class: "slot-lab" }, arrNames[r] + "[ ]"); labels.push(l); stage.append(l); }
    const chests = CADETS.map((c, i) => { const ch = el("div", { class: "chest" }, el("span", null, "cadets[" + i + "]")); stage.append(ch); return ch; });
    const idxLabs = CADETS.map((c, i) => { const l = el("div", { class: "slot-idx" }, String(i)); stage.append(l); return l; });
    let mode = "parallel";
    function layout() {
      const W = stage.clientWidth || 600;
      const i0 = +idx.value;
      if (mode === "parallel" && W < 600) {
        // phones: each array becomes a column, so every value has room
        const iw = 28, cw = (W - iw - 8) / 3, ch = 30, top = 26;
        stage.style.height = top + 8 * (ch + 4) + "px";
        cells.forEach((d) => {
          const i = +d.dataset.i, r = +d.dataset.r;
          Object.assign(d.style, { left: iw + r * cw + "px", top: top + i * (ch + 4) + "px", width: cw - 4 + "px", height: ch + "px" });
          d.classList.toggle("sel", i === i0);
        });
        labels.forEach((l, r) => Object.assign(l.style, { left: iw + r * cw + "px", top: "0px", width: cw - 4 + "px", opacity: 1, textAlign: "center" }));
        idxLabs.forEach((l, i) => Object.assign(l.style, { left: "0px", top: top + i * (ch + 4) + 8 + "px", width: iw - 4 + "px", opacity: 1 }));
        chests.forEach((c) => (c.style.opacity = 0));
      } else if (mode === "parallel") {
        labels.forEach((l) => (l.style.textAlign = "right"));
        const lw = Math.min(86, W * 0.14), cw = Math.min(88, (W - lw - 8) / 8), ch = 40;
        stage.style.height = (ch * 3 + 40) + "px";
        cells.forEach((d) => {
          const i = +d.dataset.i, r = +d.dataset.r;
          Object.assign(d.style, { left: lw + i * cw + "px", top: 24 + r * (ch + 4) + "px", width: cw - 4 + "px", height: ch + "px" });
          d.classList.toggle("sel", i === i0);
        });
        labels.forEach((l, r) => Object.assign(l.style, { left: 0, top: 24 + r * (ch + 4) + 10 + "px", width: lw - 6 + "px", opacity: 1 }));
        idxLabs.forEach((l, i) => Object.assign(l.style, { left: lw + i * cw + "px", top: "2px", width: cw - 4 + "px", opacity: 1 }));
        chests.forEach((c) => (c.style.opacity = 0));
      } else {
        const per = W < 520 ? 2 : 4, cw = (W - 8) / per, ch = 30;
        const rows = Math.ceil(8 / per);
        stage.style.height = rows * (ch * 3 + 48) + "px";
        chests.forEach((c, i) => {
          const col = i % per, row = Math.floor(i / per);
          Object.assign(c.style, { left: col * cw + "px", top: row * (ch * 3 + 48) + "px", width: cw - 8 + "px", height: ch * 3 + 40 + "px", opacity: 1 });
          c.classList.toggle("sel", i === i0);
        });
        cells.forEach((d) => {
          const i = +d.dataset.i, r = +d.dataset.r;
          const col = i % per, row = Math.floor(i / per);
          Object.assign(d.style, { left: col * cw + 6 + "px", top: row * (ch * 3 + 48) + 26 + r * (ch + 2) + "px", width: cw - 20 + "px", height: ch + "px" });
          d.classList.toggle("sel", i === i0);
        });
        labels.forEach((l) => (l.style.opacity = 0));
        idxLabs.forEach((l) => (l.style.opacity = 0));
      }
      const c = CADETS[i0];
      idxLab.textContent = "index = " + i0;
      readout.textContent = mode === "parallel"
        ? `names[${i0}]   = "${c.name}"\nflights[${i0}] = "${c.flight}"\nhours[${i0}]   = ${c.hours}\n# three separate arrays: the shared index ${i0} is all that links them`
        : `cadets[${i0}].name   = "${c.name}"\ncadets[${i0}].flight = "${c.flight}"\ncadets[${i0}].hours  = ${c.hours}\n# one array; each element is a whole record`;
    }
    idx.addEventListener("input", layout);
    craft.addEventListener("click", () => {
      mode = mode === "parallel" ? "records" : "parallel";
      craft.textContent = mode === "parallel" ? "⚒ Craft into records" : "↩ Back to parallel arrays";
      layout();
    });
    window.addEventListener("resize", layout);
    layout();
  }

  /* ============ 3. Scope stepper ============ */
  function scope(box) {
    const code = [
      "def count_flight(cadets, flight):",
      "    count = 0",
      "    for cadet in cadets:",
      "        if cadet.flight == flight:",
      "            count = count + 1",
      "    return count",
      "",
      "squadron = get_cadet_data()   # a short test file: 4 cadets",
      "b_total = count_flight(squadron, \"B\")",
      "print(\"B Flight:\", b_total)",
      "print(count)",
    ];
    const sq = "[Ross/A, Ailsa/B, Callum/A, Euan/B]";
    const frame = (title, cls, vars, changed) => `<div class="frame ${cls}"><p class="frame-title">${title}</p>${vars.map(([k, v]) => `<div class="var${changed === k ? " changed" : ""}"><span>${k}</span><span>${HC.esc(v)}</span></div>`).join("") || "<div class='var'><span>(empty)</span></div>"}</div>`;
    const G = (vars, ch) => frame("⚓ Quarterdeck: global (main program)", "global", vars, ch);
    const L = (vars, ch) => frame("🚪 Cabin: local to count_flight", "local", vars, ch);
    const steps = [
      { line: 8, note: "The main program starts. <code>squadron</code> is created in the main program, so it is global.", state: G([["squadron", sq]], "squadron") },
      { line: 9, note: "A call! The <b>actual parameters</b> <code>squadron</code> and <code>\"B\"</code> are matched by position to the <b>formal parameters</b> <code>cadets</code> and <code>flight</code>. A new cabin opens for the function's local variables.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""]], "flight") },
      { line: 2, note: "<code>count</code> is created inside the function, so it is <b>local</b>. Only code in this cabin can see it.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""], ["count", "0"]], "count") },
      { line: 4, note: "First cadet: Ross is in A Flight. The condition is false.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""], ["count", "0"], ["cadet", "Ross/A"]], "cadet") },
      { line: 5, note: "Ailsa is in B Flight, so <code>count</code> goes up to 1.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""], ["count", "1"], ["cadet", "Ailsa/B"]], "count") },
      { line: 4, note: "Callum: A Flight, so no change.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""], ["count", "1"], ["cadet", "Callum/A"]], "cadet") },
      { line: 5, note: "Euan: B Flight, so <code>count</code> becomes 2.", state: G([["squadron", sq]]) + L([["cadets", "→ squadron's data"], ["flight", "\"B\""], ["count", "2"], ["cadet", "Euan/B"]], "count") },
      { line: 6, note: "<code>return count</code> sends the <em>value</em> 2 back to the caller. The function has finished, so its cabin and every local variable in it are cleared.", state: G([["squadron", sq]]) + frame("🚪 Cabin: cleared", "local gone", [["count", "2"], ["flight", "\"B\""]]) },
      { line: 9, note: "Back in the main program, the returned value is stored in the global variable <code>b_total</code>.", state: G([["squadron", sq], ["b_total", "2"]], "b_total") },
      { line: 10, note: "Displays <samp>B Flight: 2</samp>.", state: G([["squadron", sq], ["b_total", "2"]]) },
      { line: 11, note: "<span class='bad'>NameError: name 'count' is not defined.</span> <code>count</code> was local to the function and no longer exists. The main program can only see what was returned. That is scope in action.", state: G([["squadron", sq], ["b_total", "2"]]) },
    ];
    HC.stepper(box, { code, steps });
  }

  /* ============ 4. Pre-defined function playground ============ */
  function predef(box) {
    const row = (...k) => el("div", { class: "pf-row" }, ...k);
    const sIn = el("input", { type: "text", value: "REDSTONE", maxlength: 24, "aria-label": "Text for substring", size: 12 });
    const a = el("input", { type: "number", value: 0, min: 0, max: 24, "aria-label": "Start index", style: "width:5em" });
    const b = el("input", { type: "number", value: 3, min: 0, max: 24, "aria-label": "End index", style: "width:5em" });
    const subOut = el("div", { class: "pf-out", "aria-live": "polite" });
    const ch = el("input", { type: "text", value: "A", maxlength: 1, "aria-label": "Character for ord", size: 2 });
    const ordOut = el("span", { class: "readout" });
    const num = el("input", { type: "number", value: 66, min: 32, max: 126, "aria-label": "Number for chr", style: "width:5em" });
    const chrOut = el("span", { class: "readout" });
    const fl = el("input", { type: "number", value: 7.9, step: 0.1, "aria-label": "Real number for int", style: "width:6em" });
    const intOut = el("span", { class: "readout" });
    const ma = el("input", { type: "number", value: 130, min: 0, max: 400, "aria-label": "Number of items", style: "width:5em" });
    const mb = el("input", { type: "number", value: 64, min: 1, max: 64, "aria-label": "Stack size", style: "width:5em" });
    const modOut = el("div", { class: "pf-out", "aria-live": "polite" });
    box.append(
      el("h4", null, "Substring"), row(el("code", null, "text = "), sIn, el("code", null, "text["), a, el("code", null, ":"), b, el("code", null, "]")), subOut,
      el("h4", null, "Character ⇄ ASCII"), row(el("code", null, "ord("), ch, el("code", null, ") = "), ordOut, el("span", { style: "width:1em" }), el("code", null, "chr("), num, el("code", null, ") = "), chrOut),
      el("h4", null, "Real → integer"), row(el("code", null, "int("), fl, el("code", null, ") = "), intOut),
      el("h4", null, "Modulus: stacking blocks"), row(ma, el("span", null, "blocks into stacks of"), mb), modOut,
    );
    function upd() {
      const s = sIn.value, i = Math.max(0, +a.value | 0), j = Math.max(0, +b.value | 0);
      const chars = [...s].map((c, k) => `<span class="pf-ch${k >= i && k < j ? " on" : ""}"><i>${k}</i>${HC.esc(c)}</span>`).join("");
      subOut.innerHTML = `<div class="pf-chars">${chars}</div><code>text[${i}:${j}]</code> → <b>"${HC.esc(s.slice(i, j))}"</b> <span class="hint">(from index ${i} up to, but not including, ${j})</span>`;
      const c = ch.value || " ";
      ordOut.textContent = c.codePointAt(0);
      const n = Math.min(126, Math.max(32, +num.value | 0));
      chrOut.textContent = `"${String.fromCharCode(n)}"` + (+num.value !== n ? `  (limited to ${n}: printable ASCII is 32–126)` : "");
      const f = +fl.value;
      intOut.textContent = isFinite(f) ? String(Math.trunc(f)) : "?";
      const A = Math.min(400, Math.max(0, +ma.value | 0)), B = Math.min(64, Math.max(1, +mb.value | 0));
      const full = Math.floor(A / B), rem = A % B;
      const stacks = Array.from({ length: Math.min(full, 12) }, () => `<span class="pf-stack" title="${B} blocks">${B}</span>`).join("") + (full > 12 ? ` … (${full} stacks)` : "");
      modOut.innerHTML = `<div class="pf-stacks">${stacks}${rem ? `<span class="pf-stack rem">${rem}</span>` : ""}</div>${A} ÷ ${B} = <b>${full}</b> full stacks (in Python, whole-number division is <code>${A} // ${B}</code>), and <code><b>${A} % ${B} = ${rem}</b></code> left over. The <b>remainder</b> is the modulus.` + (+ma.value !== A || +mb.value !== B ? ` <span class="hint">(Values limited to 0–400 blocks and stacks of 1–64.)</span>` : "");
    }
    [sIn, a, b, ch, num, fl, ma, mb].forEach((x) => x.addEventListener("input", upd));
    upd();
  }

  /* ============ 5. File pointer stepper ============ */
  function file(box) {
    const code = [
      "cadets = []",
      "file = open(\"cadets.csv\", \"r\")",
      "for line in file:",
      "    fields = line.strip().split(\",\")",
      "    cadets.append(Cadet(fields[0], fields[1], int(fields[2])))",
      "file.close()",
    ];
    const rows = ["Ross,A,12", "Ailsa,B,31", "Callum,A,7"];
    const fileView = (ptr, open, just) => `<div class="frame ${open ? "global" : ""}"><p class="frame-title">📜 cadets.csv ${open ? "(open)" : "(closed)"}  ▶ = file pointer</p>${rows.map((r, k) => `<div class="var${k === ptr ? " changed" : ""}"><span>${k === ptr ? "▶" : "&nbsp;"} ${k === just ? `<b>${r}</b> ← just read` : r}</span></div>`).join("")}<div class="var"><span>${ptr === 3 ? "▶" : "&nbsp;"} &lt;end of file&gt;</span></div></div>`;
    const mem = (vars) => `<div class="frame local"><p class="frame-title">Variables</p>${vars.map(([k, v]) => `<div class="var"><span>${k}</span><span>${HC.esc(v)}</span></div>`).join("")}</div>`;
    const recs = (n) => "[" + rows.slice(0, n).map((r) => { const f = r.split(","); return `Cadet("${f[0]}","${f[1]}",${f[2]})`; }).join(", ") + "]";
    const steps = [
      { line: 1, note: "An empty list is created to hold the records.", state: fileView(-1, false) + mem([["cadets", "[]"]]) },
      { line: 2, note: "<b>Open</b> the file for reading (<code>\"r\"</code>). The file pointer starts at the first line.", state: fileView(0, true) + mem([["cadets", "[]"]]) },
    ];
    rows.forEach((r, k) => {
      const f = r.split(",");
      steps.push({ line: 3, note: `<b>Read</b> the next line (shown in bold). Reading moves the file pointer straight on to the line after it. This is sequential access: always the next line, in order.`, state: fileView(k + 1, true, k) + mem([["cadets", recs(k)], ["line", `"${r}\\n"`]]) });
      steps.push({ line: 4, note: "Strip the newline and <b>split</b> at each comma. Every field is still a <em>string</em>.", state: fileView(k + 1, true, k) + mem([["cadets", recs(k)], ["fields", `["${f[0]}", "${f[1]}", "${f[2]}"]`]]) });
      steps.push({ line: 5, note: `<code>int("${f[2]}")</code> turns the hours into a number, and a new record is appended.`, state: fileView(k + 1, true, k) + mem([["cadets", recs(k + 1)]]) });
    });
    steps.push({ line: 3, note: "The pointer reaches the end of the file, so the loop stops.", state: fileView(3, true) + mem([["cadets", recs(3)]]) });
    steps.push({ line: 6, note: "<b>Close</b> the file. The data now lives in the array of records, in RAM.", state: fileView(-1, false) + mem([["cadets", recs(3)]]) });
    HC.stepper(box, { code, steps, speed: 1600 });
  }

  /* ============ 6. Ship's debugger ============ */
  const ALGS = {
    search: {
      label: "Linear search",
      vars: ["index", "found", "position"],
      code: [
        "def linear_search(cadets, target):",
        "    found = False",
        "    position = -1",
        "    index = 0",
        "    while index < len(cadets) and not found:",
        "        if cadets[index].name == target:",
        "            found = True",
        "            position = index",
        "        index = index + 1",
        "    return position",
      ],
      param: { label: "target", options: CADETS.map((c) => c.name).concat(["Hamish"]), def: "Euan" },
      *run(v, d, p) {
        yield 2; v.found = false;
        yield 3; v.position = -1;
        yield 4; v.index = 0;
        for (;;) {
          yield 5; if (!(v.index < d.length && !v.found)) break;
          yield 6;
          if (d[v.index].name === p) { yield 7; v.found = true; yield 8; v.position = v.index; }
          yield 9; v.index = v.index + 1;
        }
        yield 10; v["returned"] = v.position;
      },
    },
    max: {
      label: "Find maximum (position)",
      vars: ["index", "max_pos"],
      code: [
        "def find_max_position(cadets):",
        "    max_pos = 0",
        "    for index in range(1, len(cadets)):",
        "        if cadets[index].hours > cadets[max_pos].hours:",
        "            max_pos = index",
        "    return max_pos",
      ],
      bug: { line: 4, text: "        if cadets[index].hours < cadets[max_pos].hours:", note: "Sabotaged: > has become <" },
      *run(v, d, p, bug) {
        yield 2; v.max_pos = 0;
        let i = 1;
        for (;;) {
          yield 3; if (i >= d.length) break; v.index = i;
          yield 4;
          const cond = bug ? d[v.index].hours < d[v.max_pos].hours : d[v.index].hours > d[v.max_pos].hours;
          if (cond) { yield 5; v.max_pos = v.index; }
          i++;
        }
        yield 6; v["returned"] = v.max_pos;
      },
    },
    count: {
      label: "Count occurrences",
      vars: ["index", "count"],
      code: [
        "def count_flight(cadets, flight):",
        "    count = 0",
        "    for index in range(len(cadets)):",
        "        if cadets[index].flight == flight:",
        "            count = count + 1",
        "    return count",
      ],
      param: { label: "flight", options: ["A", "B", "C"], def: "A" },
      bug: { line: 3, text: "    for index in range(1, len(cadets)):", note: "Sabotaged: the loop starts at 1, so the first cadet (Ross, flight A) is skipped. Count flight B or C and the answer still looks right; count flight A to expose it. Good test data must reach the first item" },
      *run(v, d, p, bug) {
        yield 2; v.count = 0;
        let i = bug ? 1 : 0;
        for (;;) {
          yield 3; if (i >= d.length) break; v.index = i;
          yield 4;
          if (d[v.index].flight === p) { yield 5; v.count = v.count + 1; }
          i++;
        }
        yield 6; v["returned"] = v.count;
      },
    },
  };

  function debuggerWidget(box) {
    const algSel = el("select", { "aria-label": "Algorithm" }, ...Object.entries(ALGS).map(([k, a]) => el("option", { value: k }, a.label)));
    const paramSel = el("select", { "aria-label": "Parameter" });
    const paramLab = el("label", null, "", paramSel);
    const bugBox = el("input", { type: "checkbox", id: "dbg-bug" });
    const bugLab = el("label", { for: "dbg-bug" }, " 🐛 plant a logic error");
    const watchSel = el("select", { "aria-label": "Watchpoint variable" });
    const stepB = el("button", { class: "btn small primary", type: "button" }, "Step ▶");
    const runB = el("button", { class: "btn small", type: "button" }, "Run ▶▶");
    const resetB = el("button", { class: "btn small", type: "button" }, "↺ Reset");
    const msg = el("p", { class: "stepper-note", "aria-live": "polite" });
    const codeBox = el("div", { class: "dbg-code", role: "list", "aria-label": "Code. Activate a line number to toggle a breakpoint." });
    const dataBox = el("div", { class: "dbg-data" });
    const varsBox = el("div", { class: "dbg-vars" });
    const trace = el("div", { class: "table-wrap dbg-trace" });
    box.append(
      el("div", { class: "btn-row" }, el("label", null, "Algorithm ", algSel), paramLab, el("span", null, bugBox, bugLab)),
      el("div", { class: "btn-row" }, stepB, runB, resetB, el("label", null, "Watchpoint on ", watchSel)),
      msg,
      el("div", { class: "stepper-grid" }, codeBox, el("div", null, varsBox, dataBox)),
      el("h4", null, "Trace table"), trace,
    );
    let alg, gen, cur, v, bps = new Set(), rows = [], finished = false;
    function setup() {
      alg = ALGS[algSel.value];
      paramSel.innerHTML = "";
      if (alg.param) {
        paramLab.hidden = false;
        paramLab.firstChild.textContent = alg.param.label + " ";
        alg.param.options.forEach((o) => paramSel.append(el("option", { value: o, selected: o === alg.param.def ? true : null }, o)));
      } else paramLab.hidden = true;
      bugBox.disabled = !alg.bug; bugLab.style.opacity = alg.bug ? 1 : 0.5;
      if (!alg.bug) bugBox.checked = false;
      watchSel.innerHTML = "";
      watchSel.append(el("option", { value: "" }, "(none)"), ...alg.vars.map((x) => el("option", { value: x }, x)));
      bps = new Set();
      restart();
    }
    function restart() {
      v = {}; rows = []; finished = false;
      gen = alg.run(v, CADETS, paramSel.value, bugBox.checked);
      cur = gen.next().value;
      msg.innerHTML = "Ready. <b>Step</b> runs one line. <b>Run</b> keeps going until a breakpoint or watchpoint triggers." + (bugBox.checked && alg.bug ? ` <span class="bad">🐛 ${alg.bug.note}.</span> Can you see its effect in the trace table?` : "");
      render();
    }
    function codeLines() {
      return alg.code.map((l, k) => (bugBox.checked && alg.bug && alg.bug.line === k + 1 ? alg.bug.text : l));
    }
    function render(changed) {
      const lines = codeLines();
      codeBox.innerHTML = "";
      lines.forEach((l, k) => {
        const n = k + 1;
        const b = el("button", { type: "button", class: "bp" + (bps.has(n) ? " on" : ""), "aria-pressed": bps.has(n) ? "true" : "false", "aria-label": `Breakpoint on line ${n}` }, String(n));
        b.addEventListener("click", () => { bps.has(n) ? bps.delete(n) : bps.add(n); render(); });
        const t = el("span", { class: "dbg-line" + (n === cur && !finished ? " cur" : "") + (bugBox.checked && alg.bug && alg.bug.line === n ? " bug" : "") }, l || " ");
        codeBox.append(el("div", { role: "listitem", class: "dbg-row" }, b, t));
      });
      varsBox.innerHTML = `<div class="frame local"><p class="frame-title">Variables</p>${alg.vars.concat(v.returned !== undefined ? ["returned"] : []).map((k) => `<div class="var${changed && changed.includes(k) ? " changed" : ""}${watchSel.value === k ? " watched" : ""}"><span>${k}${watchSel.value === k ? " 👁" : ""}</span><span>${v[k] === undefined ? "—" : JSON.stringify(v[k])}</span></div>`).join("")}</div>`;
      const hi = v.index;
      dataBox.innerHTML = `<div class="table-wrap"><table class="dbg-table"><thead><tr><th>i</th><th>name</th><th>flight</th><th>hours</th></tr></thead><tbody>${CADETS.map((c, i) => `<tr class="${i === hi ? "cur" : ""}${(alg === ALGS.max && i === v.max_pos) ? " best" : ""}"><td>${i}</td><td>${c.name}</td><td>${c.flight}</td><td class="num">${c.hours}</td></tr>`).join("")}</tbody></table></div>`;
      trace.innerHTML = `<table><thead><tr><th>step</th><th>line</th>${alg.vars.map((k) => `<th>${k}</th>`).join("")}<th>note</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${i + 1}</td><td>${r.line}</td>${alg.vars.map((k) => `<td${r.changed.includes(k) ? ' class="ok"' : ""}>${r.vals[k] === undefined ? "" : JSON.stringify(r.vals[k])}</td>`).join("")}<td>${r.note || ""}</td></tr>`).join("")}</tbody></table>`;
      trace.scrollTop = trace.scrollHeight;
      stepB.disabled = runB.disabled = finished;
    }
    function step() {
      if (finished) return null;
      const before = { ...v };
      const ran = cur;
      const r = gen.next();
      const changed = Object.keys(v).filter((k) => before[k] !== v[k]);
      let note = "";
      if (ran === 5 && alg === ALGS.search) note = changed.length ? "" : (v.index < CADETS.length && !v.found ? "condition true: loop again" : "condition false: leave loop");
      if (ran === 3 && alg !== ALGS.search && !changed.includes("index")) note = "range exhausted: leave loop";
      rows.push({ line: ran, vals: { ...v }, changed, note });
      if (r.done) { finished = true; cur = null; }
      else cur = r.value;
      return { ran, changed, before };
    }
    stepB.addEventListener("click", () => {
      const s = step();
      if (!s) return;
      msg.innerHTML = finished ? `Finished. The function returned <b>${JSON.stringify(v.returned)}</b>.` + verdict() : `Ran line ${s.ran}. Next: line ${cur}.` + (s.changed.length ? ` Changed: ${s.changed.map((k) => `<code>${k}</code>`).join(", ")}.` : "");
      render(s.changed);
    });
    runB.addEventListener("click", () => {
      let guard = 0, s = null;
      while (!finished && guard++ < 500) {
        s = step();
        const w = watchSel.value;
        if (w && s.changed.includes(w)) {
          msg.innerHTML = `👁 <b>Watchpoint</b>: <code>${w}</code> changed from ${s.before[w] === undefined ? "nothing" : JSON.stringify(s.before[w])} to <b>${JSON.stringify(v[w])}</b> on line ${s.ran}. Paused.`;
          return render(s.changed);
        }
        if (!finished && bps.has(cur)) {
          msg.innerHTML = `🔴 <b>Breakpoint</b> on line ${cur}: paused <em>before</em> it runs. Inspect the variables, then Step or Run again.`;
          return render(s.changed);
        }
      }
      msg.innerHTML = `Ran to the end. The function returned <b>${JSON.stringify(v.returned)}</b>.` + verdict();
      render(s ? s.changed : []);
    });
    function verdict() {
      if (alg === ALGS.max) return v.returned === 1 ? " Position 1 is Ailsa (31 hours). Mhairi also has 31, but <code>&gt;</code> keeps the first." : ` <span class="bad">Position ${v.returned} is ${CADETS[v.returned].name} with ${CADETS[v.returned].hours} hours. That isn't the maximum! Use a watchpoint on <code>max_pos</code> to see where it goes wrong.</span>`;
      if (alg === ALGS.count) { const truth = CADETS.filter((c) => c.flight === paramSel.value).length; return v.returned === truth ? (bugBox.checked ? ` That happens to be right for flight ${paramSel.value}, but the loop skips cadets[0] (Ross, flight A). Try flight A to expose the bug.` : " Correct.") : ` <span class="bad">There are really ${truth}. Set a breakpoint on line 4 and check the first value of <code>index</code>.</span>`; }
      return v.returned === -1 ? " −1 means the target was not in the array: every element was checked." : ` Found at index ${v.returned}. The loop stopped early, without checking the rest of the array.`;
    }
    resetB.addEventListener("click", restart);
    algSel.addEventListener("change", setup);
    paramSel.addEventListener("change", restart);
    bugBox.addEventListener("change", restart);
    watchSel.addEventListener("change", () => render());
    setup();
  }

  function init() {
    const map = { "w-methods": methods, "w-structs": structs, "w-scope": scope, "w-predef": predef, "w-file": file, "w-debugger": debuggerWidget };
    for (const [id, fn] of Object.entries(map)) {
      const box = document.getElementById(id);
      if (box) try { fn(box); } catch (e) { console.error(id, e); box.append(el("p", { class: "bad" }, "This interactive failed to load.")); }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
