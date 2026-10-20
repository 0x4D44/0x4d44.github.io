/* Technology & society: the widgets and the script-drawn figures.
   Every number a widget shows is computed from the same rules the text teaches. */
(function () {
  "use strict";
  const HG = window.HG;
  const $ = (id) => document.getElementById(id);
  const el = HG.el, S = HG.svg;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const fb = (cls) => el("div", { class: "tc-fb" + (cls ? " " + cls : ""), "aria-live": "polite" });
  const setFb = (box, html, kind) => { box.className = "tc-fb" + (kind ? " " + kind : ""); box.innerHTML = html; };
  const n0 = (x) => Math.round(x).toLocaleString("en-GB");

  /* =====================================================================
     Static figures drawn from the same rules (pixel grids, compression)
     ===================================================================== */
  function pixelGrid(g, x0, y0, size, cells) {
    // a pennant edge: inside a circle centred off the bottom-left of the square
    const inside = (u, v) => (u + 0.25) ** 2 + (v - 1.25) ** 2 < 1.05 ** 2;
    const c = size / cells;
    for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
      const u = (i + 0.5) / cells, v = (j + 0.5) / cells;
      g.append(S("rect", { x: x0 + i * c, y: y0 + j * c, width: c + 0.2, height: c + 0.2, fill: inside(u, v) ? "#d4147a" : "#f4efe2" }));
    }
    const grid = [];
    for (let k = 0; k <= cells; k++) grid.push(`M${x0 + k * c} ${y0}V${y0 + size}M${x0} ${y0 + k * c}H${x0 + size}`);
    g.append(S("path", { d: grid.join(""), stroke: "#6d6250", "stroke-width": cells > 12 ? 0.4 : 0.8, fill: "none" }));
    // the true curve, for comparison
    const pts = [];
    for (let k = 0; k <= 60; k++) {
      const a = -Math.PI / 2 + (Math.PI / 2) * k / 60;
      const u = -0.25 + 1.05 * Math.cos(a), v = 1.25 + 1.05 * Math.sin(a);
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) pts.push(`${(x0 + u * size).toFixed(1)},${(y0 + v * size).toFixed(1)}`);
    }
    g.append(S("polyline", { points: pts.join(" "), fill: "none", stroke: "#00a3d9", "stroke-width": 2 }));
    g.append(S("rect", { x: x0, y: y0, width: size, height: size, fill: "none", class: "tc-stroke", "stroke-width": 2 }));
  }
  function staticFigures() {
    const a = $("tc-ppi-a"), b = $("tc-ppi-b");
    if (a) pixelGrid(a, 30, 12, 160, 6);
    if (b) pixelGrid(b, 210, 12, 160, 18);
    const g = $("tc-comp");
    if (g) {
      const N = 8, cs = 13, top = 26;
      const dark = [42, 23, 64], sky = [159, 211, 232];
      const orig = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) orig.push(j + i * 0.5 > 5.2 ? dark : sky);
      const draw = (x0, px) => {
        px.forEach((c, k) => g.append(S("rect", { x: x0 + (k % N) * cs, y: top + Math.floor(k / N) * cs, width: cs + 0.2, height: cs + 0.2, fill: `rgb(${c.map(Math.round).join(",")})` })));
        g.append(S("rect", { x: x0, y: top, width: N * cs, height: N * cs, fill: "none", class: "tc-stroke", "stroke-width": 1.5 }));
      };
      // lossy: average each 2 x 2 block, then round to coarse steps (what heavy quantisation does)
      const lossy = orig.map((_, k) => {
        const i = k % N, j = Math.floor(k / N), bi = i - (i % 2), bj = j - (j % 2);
        const blk = [orig[bj * N + bi], orig[bj * N + bi + 1], orig[(bj + 1) * N + bi], orig[(bj + 1) * N + bi + 1]];
        return [0, 1, 2].map((ch) => Math.round(blk.reduce((s, c) => s + c[ch], 0) / 4 / 24) * 24);
      });
      draw(14, orig); draw(148, orig.slice()); draw(282, lossy);
    }
  }

  /* =====================================================================
     1a. Resolution lab
     ===================================================================== */
  mount("w-dpi", (box) => {
    const cv = el("canvas", { class: "sim", role: "img", "aria-label": "Magnified 10 millimetre square of the print" });
    box.append(cv);
    const ctl = el("div", { class: "sim-controls" }); box.append(ctl);
    const ro = el("div", { class: "readouts", "aria-live": "polite" }); box.append(ro);
    const note = el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    let px = 1800, mm = 297;
    const sim = HG.sim(cv, {
      height: (w) => (w < 480 ? 230 : 250),
      draw(ctx, t, dt, C, s) {
        const ppi = px / (mm / 25.4), cellsF = ppi * 10 / 25.4;
        const S0 = s.h - 40, x0 = 14, y0 = 12;
        const cells = Math.max(1, Math.min(140, Math.round(cellsF)));
        const c = S0 / cells;
        const inside = (u, v) => (u + 0.25) ** 2 + (v - 1.25) ** 2 < 1.05 ** 2 || (u > 0.62 && v < 0.3 + (u - 0.62) * 0.4);
        for (let i = 0; i < cells; i++) for (let j = 0; j < cells; j++) {
          ctx.fillStyle = inside((i + 0.5) / cells, (j + 0.5) / cells) ? "#d4147a" : "#f4efe2";
          ctx.fillRect(x0 + i * c, y0 + j * c, c + 0.5, c + 0.5);
        }
        if (cells <= 40) { ctx.strokeStyle = "rgba(60,50,40,.35)"; ctx.lineWidth = 0.6; ctx.beginPath(); for (let k = 0; k <= cells; k++) { ctx.moveTo(x0 + k * c, y0); ctx.lineTo(x0 + k * c, y0 + S0); ctx.moveTo(x0, y0 + k * c); ctx.lineTo(x0 + S0, y0 + k * c); } ctx.stroke(); }
        ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.strokeRect(x0, y0, S0, S0);
        HG.label(ctx, "10 mm of the print, magnified", x0, y0 + S0 + 16, { size: 12, col: C.ink2 });
        // right side: the print and what it would need
        const rx = x0 + S0 + 24, rw = s.w - rx - 12;
        if (rw > 110) {
          HG.label(ctx, `${HG.n(cellsF, 1)} pixels`, rx, y0 + 18, { size: 14, bold: true });
          HG.label(ctx, "across 10 mm", rx, y0 + 38, { size: 12, col: C.ink2 });
          const need = Math.ceil(mm / 25.4 * 300);
          const frac = Math.min(1, px / need);
          const bw = Math.min(rw, 220);
          ctx.fillStyle = C.paper2; ctx.fillRect(rx, y0 + 70, bw, 16);
          ctx.fillStyle = frac >= 1 ? C.grass : frac >= 0.5 ? C.gold : C.red; ctx.fillRect(rx, y0 + 70, bw * frac, 16);
          ctx.strokeStyle = C.ink; ctx.lineWidth = 1; ctx.strokeRect(rx, y0 + 70, bw, 16);
          HG.label(ctx, "pixels you have vs", rx, y0 + 104, { size: 12, col: C.ink2 });
          HG.label(ctx, "pixels for 300 ppi", rx, y0 + 120, { size: 12, col: C.ink2 });
          HG.label(ctx, `${Math.round(frac * 100)}%`, rx, y0 + 146, { size: 14, bold: true });
        }
      },
    });
    const update = () => {
      const ppi = px / (mm / 25.4), hPx = Math.round(px * 2 / 3), need = Math.ceil(mm / 25.4 * 300);
      const mb = px * hPx * 3 / 1e6;
      const verdict = ppi >= 300 ? ["Sharp at close viewing", "ok"] : ppi >= 150 ? ["Fine for a poster seen from a distance; soft close up", ""] : ["Visible pixelation: find a bigger image or print smaller", "bad"];
      ro.innerHTML = `<div><b>${n0(ppi)} ppi</b><span>effective resolution on paper</span></div>
        <div><b class="${verdict[1]}">${verdict[0]}</b><span>verdict (300 ppi rule for close viewing)</span></div>
        <div><b>${n0(need)} px</b><span>width needed for 300 ppi</span></div>
        <div><b>${HG.n(px * hPx / 1e6, 1)} MP · ${HG.n(mb, 1)} MB</b><span>3:2 image (${n0(px)} × ${n0(hPx)}), uncompressed RGB</span></div>`;
      note.textContent = `${n0(px)} pixels spread over ${mm} mm (${HG.n(mm / 25.4, 2)} inches) gives ${n0(px)} ÷ ${HG.n(mm / 25.4, 2)} = ${n0(ppi)} pixels per inch. Halving the print width doubles the ppi; doubling the pixel width and height quadruples the file size.`;
      cv.setAttribute("aria-label", `Magnified 10 mm square of the print: ${HG.n(ppi * 10 / 25.4, 1)} pixels across it, effective resolution ${n0(ppi)} ppi. ${verdict[0]}.`);
      sim.redraw();
    };
    HG.slider(ctl, { label: "Image width (pixels)", min: 400, max: 6000, step: 100, value: px, fmt: (v) => n0(v), oninput: (v) => { px = v; update(); } });
    HG.slider(ctl, { label: "Printed width (mm)", min: 50, max: 840, step: 10, value: mm, unit: "mm", fmt: (v) => String(v), oninput: (v) => { mm = v; update(); } });
    const row = el("div", { class: "btn-row" });
    [["A4 width (210 mm)", 210], ["A3 width (297 mm)", 297], ["A1 width (594 mm)", 594]].forEach(([t, v]) => {
      const b = el("button", { class: "btn small", type: "button" }, t);
      b.addEventListener("click", () => { mm = v; ctl.querySelectorAll("input")[1].value = v; ctl.querySelectorAll("input")[1].dispatchEvent(new Event("input")); });
      row.append(b);
    });
    box.insertBefore(row, ro);
    update();
  });

  /* =====================================================================
     1b. Device requisitions
     ===================================================================== */
  mount("w-device", (box) => {
    const DEV = {
      scanner: "Flatbed scanner", camera: "Digital camera", tablet: "Graphics tablet & stylus", scan3d: "3D scanner",
      inkjet: "Inkjet printer", laser: "Laser printer", plotter: "Plotter / large-format", printer3d: "3D printer",
      lasercut: "Laser cutter", vinyl: "Vinyl cutter", projector: "Projector", monitor: "Calibrated monitor",
    };
    const ORDERS = [
      { t: "Digitise a fragile, hand-inked A3 hull plan from 1805 so it can be traced in CAD.", best: ["scanner"], ok: { camera: "Workable, but the sheet must be perfectly square to the lens and evenly lit, or the plan distorts. A flatbed gives even light and no perspective." }, why: "The original is flat and A3: an A3 flatbed scanner captures it with even lighting and no perspective distortion, at a resolution you choose." },
      { t: "Capture the exact shape of the carved figurehead so a replacement can be modelled.", best: ["scan3d"], ok: { camera: "Photographs show the look but not measured 3D geometry. (Photogrammetry exists, but a 3D scanner is the direct answer.)" }, why: "A 3D scanner measures millions of points on the curved surface, producing a point cloud and mesh that CAD can use." },
      { t: "Produce expressive freehand concept sketches, with varying line weight, straight into the software.", best: ["tablet"], ok: {}, why: "A pressure-sensitive stylus varies line weight and tone like a pencil; a mouse cannot." },
      { t: "Print 400 copies of a black-and-white, text-heavy crew briefing by this afternoon.", best: ["laser"], ok: { inkjet: "It would work, but slowly, and ink costs far more per page at this quantity." }, why: "A laser printer is fast and has a low cost per page for large runs of text." },
      { t: "Print one A0 general arrangement drawing of the ship for the shipyard wall.", best: ["plotter"], ok: {}, why: "A0 is far beyond an office printer: a plotter or large-format printer prints it in one piece with accurate lines." },
      { t: "Make a physical scale prototype of a new gun carriage from the CAD model, to check the parts fit.", best: ["printer3d"], ok: { lasercut: "Could make a flat-pack card model from slices, but a 3D printer builds the solid form directly from the model." }, why: "A 3D printer builds the CAD model layer by layer: a quick, cheap physical prototype." },
      { t: "Cut 30 identical acrylic name plates with engraved lettering.", best: ["lasercut"], ok: {}, why: "A laser cutter follows vector paths to cut and engrave sheet acrylic, repeating identical parts accurately." },
      { t: "Make self-adhesive lettering for the side of the squadron minibus.", best: ["vinyl"], ok: {}, why: "A vinyl cutter cuts lettering from self-adhesive vinyl along vector paths, ready to apply to the vehicle." },
      { t: "Take photographs of HMS Vellum under sail for the recruitment website.", best: ["camera"], ok: {}, why: "A digital camera captures the scene; images can be reviewed on the spot, re-shot, edited and uploaded at once." },
      { t: "Check the poster's colours on screen as accurately as possible before sending it to print.", best: ["monitor"], ok: { inkjet: "A printed proof is the final check, and a good idea too. On screen, though, a calibrated monitor shows colour most reliably." }, why: "A calibrated monitor displays colours consistently, so on-screen checks are trustworthy (a printed proof is still wise, because screens are RGB and print is CMYK)." },
      { t: "Show the new design to the whole wardroom at once during a briefing.", best: ["projector"], ok: { monitor: "Fine for a few people at a desk, not for a whole room." }, why: "A projector enlarges the screen image so a whole group can see and discuss it together." },
    ];
    let i = 0, score = 0, done = 0, answered = false;
    const head = el("p", { class: "tc-order", "aria-live": "polite" });
    const grid = el("div", { class: "tc-devgrid", role: "group", "aria-label": "Devices" });
    const out = fb();
    const tally = el("p", { class: "readout", "aria-live": "polite" });
    const next = el("button", { class: "btn small primary", type: "button" }, "Next order ▶");
    const again = el("button", { class: "btn small", type: "button" }, "↺ Start again");
    box.append(head, grid, out, el("div", { class: "btn-row" }, next, again), tally);
    const btns = {};
    Object.entries(DEV).forEach(([k, name]) => {
      const b = el("button", { type: "button" }, name);
      b.addEventListener("click", () => choose(k));
      btns[k] = b; grid.append(b);
    });
    function show() {
      const o = ORDERS[i];
      head.innerHTML = `<b>Order ${i + 1} of ${ORDERS.length}:</b> ${HG.esc(o.t)}`;
      Object.values(btns).forEach((b) => { b.className = ""; b.removeAttribute("aria-pressed"); });
      out.innerHTML = ""; out.className = "tc-fb"; answered = false;
      next.disabled = true;
      tally.textContent = `${score} of ${done} best choices`;
    }
    function choose(k) {
      if (answered) return;
      answered = true; done++;
      const o = ORDERS[i];
      btns[k].setAttribute("aria-pressed", "true");
      o.best.forEach((b) => btns[b].classList.add("best"));
      if (o.best.includes(k)) { score++; setFb(out, `<span class="ok">✔ Best choice.</span> ${o.why}`, "good"); }
      else if (o.ok[k]) { btns[k].classList.add("ok2"); setFb(out, `<span class="bad">◐ Possible, but not the best.</span> ${o.ok[k]} <strong>Best:</strong> ${DEV[o.best[0]]}. ${o.why}`, ""); }
      else { btns[k].classList.add("wrong"); setFb(out, `<span class="bad">✘ Not suitable.</span> A ${DEV[k].toLowerCase()} does not do this job. <strong>Best:</strong> ${DEV[o.best[0]]}. ${o.why}`, "poor"); }
      next.disabled = i >= ORDERS.length - 1;
      tally.textContent = `${score} of ${done} best choices` + (i === ORDERS.length - 1 ? (score === ORDERS.length ? " — a perfect requisition record!" : " — all orders filled. Start again to improve.") : "");
    }
    next.addEventListener("click", () => { if (i < ORDERS.length - 1) { i++; show(); } });
    again.addEventListener("click", () => { i = 0; score = 0; done = 0; show(); });
    show();
  });

  /* =====================================================================
     2. File management: tidy the archive, and a 3-2-1 back-up audit
     ===================================================================== */
  mount("w-files", (box) => {
    const FOLDERS = ["01_research", "02_preliminary", "03_production/CAD_parts", "03_production/drawings", "04_promotional", "05_admin"];
    const FILES = [
      { f: "IMG_4032.jpg", what: "photo of the old lanterns on deck", dir: 0, names: ["VEL-lantern_existing-deck_01.jpg", "lantern photo.jpg", "IMG_4032_final.jpg"], why: "Research photograph. The new name says project, content and a number; the camera's IMG_4032 says nothing." },
      { f: "scan0001.pdf", what: "scanned thumbnail sketches", dir: 1, names: ["sketches!!.pdf", "VEL-lantern_thumbnails_v01.pdf", "scan0001 (copy).pdf"], why: "Preliminary work. Avoid symbols such as ! and the word 'copy'." },
      { f: "body.ipt", what: "CAD part: the lantern body", dir: 2, names: ["lantern final FINAL.ipt", "body new.ipt", "VEL-lantern_body_v03.ipt"], why: "A CAD part belongs with the other parts. A version number always rises, so it beats 'final' or 'new'." },
      { f: "lantern drawing for yard.pdf", what: "the PDF drawing for the shipyard", dir: 3, names: ["VEL-lantern_GA-drawing_v02.pdf", "drawing for yard 14/3.pdf", "lantern drawing.pdf"], why: "Production drawings. A slash in '14/3' is illegal in many file systems." },
      { f: "render3.png", what: "night-time render of the lantern", dir: 4, names: ["render3 good one.png", "VEL-lantern_render-night_v01.png", "Render.png"], why: "Promotional graphics. 'good one' will not mean anything in a month." },
      { f: "poster final FINAL (2).indd", what: "the DTP poster layout", dir: 4, names: ["poster final FINAL (3).indd", "poster.indd", "VEL-lantern_poster_v05.indd"], why: "Promotional. Replace the 'final FINAL (2)' trap with a version number." },
      { f: "email from Captain.txt", what: "the design brief from Captain Grant", dir: 5, names: ["VEL-lantern_brief_2026-03-14.txt", "email from captain 14-3-26.txt", "important.txt"], why: "Admin. A year-first date (2026-03-14) sorts in date order." },
      { f: "Untitled-1.jpg", what: "a mood board of ship lanterns", dir: 0, names: ["Untitled-1 moodboard.jpg", "VEL-lantern_moodboard_01.jpg", "mood board for lantern project new.jpg"], why: "Research. Short, consistent and descriptive." },
    ];
    const rows = el("div");
    const tree = el("div", { class: "tc-tree", "aria-live": "polite", "aria-label": "Resulting folder tree" });
    const out = fb();
    const inspect = el("button", { class: "btn small primary", type: "button" }, "Inspect the archive");
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Reset");
    box.append(rows, el("div", { class: "btn-row" }, inspect, reset), out, el("p", { class: "px-label" }, "Your folder tree:"), tree);
    const sel = [];
    FILES.forEach((it, k) => {
      const dirS = el("select", { "aria-label": `Folder for ${it.f}` }, el("option", { value: "" }, "— choose a folder —"), ...FOLDERS.map((f, j) => el("option", { value: j }, f + "/")));
      const nameS = el("select", { "aria-label": `New name for ${it.f}` }, el("option", { value: "" }, "— choose a name —"), ...it.names.map((n, j) => el("option", { value: j }, n)));
      const res = el("div", { class: "tc-res", "aria-live": "polite" });
      const row = el("div", { class: "tc-filerow" }, el("div", { html: `<code>${HG.esc(it.f)}</code> <span class="tc-res">· ${HG.esc(it.what)}</span>` }), el("div", { class: "tc-sel" }, dirS, nameS), res);
      [dirS, nameS].forEach((s) => s.addEventListener("change", drawTree));
      sel.push({ dirS, nameS, res, row }); rows.append(row);
    });
    const bestName = (it) => it.names.findIndex((n) => /^VEL-lantern_/.test(n));
    function drawTree() {
      const lines = ["VEL-lantern/"];
      FOLDERS.forEach((f, j) => {
        const inF = FILES.map((it, k) => [it, sel[k]]).filter(([, s]) => s.dirS.value === String(j));
        lines.push("├─ " + f + "/");
        inF.forEach(([it, s]) => lines.push("│   └─ " + (s.nameS.value !== "" ? it.names[+s.nameS.value] : it.f)));
      });
      const loose = FILES.filter((it, k) => sel[k].dirS.value === "");
      if (loose.length) lines.push(`(${loose.length} file${loose.length > 1 ? "s" : ""} still loose in Downloads)`);
      tree.textContent = lines.join("\n");
    }
    inspect.addEventListener("click", () => {
      let ok = 0, tot = 0;
      FILES.forEach((it, k) => {
        const s = sel[k], dOk = s.dirS.value === String(it.dir), nOk = s.nameS.value === String(bestName(it));
        ok += dOk + nOk; tot += 2;
        s.row.className = "tc-filerow " + (dOk && nOk ? "right" : "wrong");
        s.res.innerHTML = (dOk ? "<span class='ok'>✔ folder</span>" : `<span class='bad'>✘ folder: ${FOLDERS[it.dir]}/</span>`) + " · " + (nOk ? "<span class='ok'>✔ name</span>" : `<span class='bad'>✘ name: ${HG.esc(it.names[bestName(it)])}</span>`) + " — " + it.why;
      });
      setFb(out, `${ok} of ${tot} decisions match the Plan Room's convention (project_item_version, no spaces, year-first dates, numbered stage folders).` + (ok === tot ? " <span class='ok'>Shipshape.</span>" : ""), ok === tot ? "good" : "");
    });
    reset.addEventListener("click", () => { sel.forEach((s) => { s.dirS.value = ""; s.nameS.value = ""; s.res.innerHTML = ""; s.row.className = "tc-filerow"; }); out.innerHTML = ""; out.className = "tc-fb"; drawTree(); });
    drawTree();

    // ---- back-up audit ----
    const STORE = [
      { id: "laptop", t: "Working copy on the laptop's internal drive", type: "laptop disk", off: false, fixed: true },
      { id: "usb", t: "USB stick kept in the laptop bag", type: "USB flash", off: false, note: "It travels with the laptop: one theft or one dropped bag loses both." },
      { id: "ext", t: "External hard drive on the studio shelf", type: "external disk", off: false },
      { id: "home", t: "Second external drive kept at home", type: "external disk", off: true },
      { id: "cloud", t: "Cloud storage with version history", type: "cloud", off: true },
    ];
    const panel = el("div", { class: "tc-panel" }, el("h4", null, "Back-up audit: does the plan meet 3-2-1?"));
    const grid = el("div", { class: "tc-bk" });
    const tal = el("div", { class: "tc-tally", "aria-live": "polite" });
    const msg = fb();
    const cbs = STORE.map((s) => {
      const cb = el("input", { type: "checkbox", checked: s.fixed ? true : null, disabled: s.fixed ? true : null });
      cb.addEventListener("change", audit);
      grid.append(el("label", null, cb, el("span", null, s.t)));
      return cb;
    });
    panel.append(el("p", { class: "hint" }, "Tick where copies of the lantern project are kept."), grid, tal, msg);
    box.append(panel);
    function audit() {
      const on = STORE.filter((s, k) => cbs[k].checked);
      // the USB stick in the laptop bag is not an independent copy: it shares the laptop's fate
      const copies = on.length, types = new Set(on.map((s) => s.type)).size, off = on.some((s) => s.off);
      const indep = on.filter((s) => s.id !== "usb").length + (on.some((s) => s.id === "usb") ? 0 : 0);
      const pass = [copies >= 3, types >= 2, off];
      tal.innerHTML = `<span class="${pass[0] ? "pass" : "fail"}">${copies} cop${copies === 1 ? "y" : "ies"} ${pass[0] ? "✔" : "✘"} (need 3)</span><span class="${pass[1] ? "pass" : "fail"}">${types} storage type${types === 1 ? "" : "s"} ${pass[1] ? "✔" : "✘"} (need 2)</span><span class="${pass[2] ? "pass" : "fail"}">off-site ${pass[2] ? "✔" : "✘"} (need 1)</span>`;
      let t = pass.every(Boolean) ? "<span class='ok'>Meets 3-2-1.</span> A fire, theft or failed drive cannot take every copy." : "<span class='bad'>Does not meet 3-2-1 yet.</span> " + (!pass[2] ? "Every copy is in one place: a studio fire or burglary could take them all. " : "") + (!pass[0] ? "Add another copy. " : "");
      if (on.some((s) => s.id === "usb")) t += " Note: " + STORE[1].note + (indep < 3 ? " Treat it as weak protection." : "");
      setFb(msg, t, pass.every(Boolean) ? "good" : "poor");
    }
    audit();
  });

  /* =====================================================================
     3. Cloud signalling simulator
     ===================================================================== */
  mount("w-cloud", (box) => {
    const PAL = ["#d4147a", "#00a3d9", "#f7d117", "#3f7426", "#52308a", "#e07020", "#15121c"];
    const NAME = { E: "Euan (ship)", A: "Alba (ashore)" };
    let st, colourN, packets = [];
    function fresh() {
      st = { vers: [], cur: null, bin: false, conflict: null, E: { has: true, online: true, ver: null, pend: null }, A: { has: true, online: true, ver: null, pend: null } };
      colourN = 0; packets = [];
    }
    fresh();
    const grid = el("div", { class: "tc-cloudgrid" });
    const cv = el("canvas", { class: "sim", role: "img", "aria-label": "Two designers' laptops and the cloud" });
    const side = el("div");
    const vlist = el("ol", { class: "tc-vers", "aria-label": "Version history in the cloud" });
    const log = el("ol", { class: "tc-log", "aria-live": "polite" });
    side.append(el("p", { class: "px-label" }, "Version history (in the cloud)"), vlist);
    grid.append(cv, side);
    box.append(grid);
    const r1 = el("div", { class: "btn-row" }), r2 = el("div", { class: "btn-row" });
    const B = (t, f, cls) => { const b = el("button", { class: "btn small" + (cls ? " " + cls : ""), type: "button" }, t); b.addEventListener("click", f); return b; };
    const linkBtn = B("Cut the ship's internet", () => toggleLink());
    const loseBtn = B("Euan's laptop goes overboard", () => loseOrNew());
    const restSel = el("select", { "aria-label": "Version to restore" });
    r1.append(B("Euan saves a change", () => save("E"), "primary"), B("Alba saves a change", () => save("A"), "primary"), linkBtn);
    r2.append(B("Alba deletes the file", () => del()), loseBtn, restSel, B("Restore this version", () => restore()), B("↺ Reset", () => { fresh(); syncUI(); say("Reset: no file yet. Euan or Alba, save something."); }));
    box.append(r1, r2, el("p", { class: "px-label" }, "Signal log"), log);

    const say = (t) => { log.prepend(el("li", { html: t })); while (log.children.length > 8) log.lastChild.remove(); };
    const design = (n) => (n ? st.vers[n - 1].design : []);
    const newDesign = (base) => { const d = base.concat(PAL[colourN++ % PAL.length]); return d.length > 4 ? d.slice(-4) : d; };
    function send(from, to, colour, then) {
      if (HG.reduced) { then(); syncUI(); return; }
      packets.push({ from, to, t: 0, colour, then });
      sim.play();
    }
    function other(k) { return k === "E" ? "A" : "E"; }
    function broadcast(except) {
      ["E", "A"].forEach((k) => {
        const d = st[k];
        if (k === except || !d.has) return;
        if (!d.online) { say(`${NAME[k]} is offline, so their copy is now out of date. It will update when the link returns.`); return; }
        send("C", k, st.cur ? design(st.cur).slice(-1)[0] : "#888", () => { d.ver = st.bin ? null : st.cur; });
      });
    }
    function upload(k, des, base) {
      const d = st[k];
      send(k, "C", des.slice(-1)[0], () => {
        if (st.cur !== null && base !== st.cur && !st.bin) {
          st.conflict = { by: k, design: des };
          d.pend = null; d.ver = st.cur;
          say(`<b>Conflict!</b> ${NAME[k]} edited v${base || "?"} offline, but the cloud already has v${st.cur}. The service keeps both: the offline edit is saved as a separate <em>conflicted copy</em>, and someone has to merge the changes by hand.`);
          syncUI(); broadcast(null); return;
        }
        st.vers.push({ n: st.vers.length + 1, by: k, design: des, note: "" });
        st.cur = st.vers.length; st.bin = false; d.ver = st.cur; d.pend = null;
        say(`${NAME[k]} saved <b>v${st.cur}</b>. It uploads to the cloud, then syncs down to the other laptop.`);
        syncUI(); broadcast(k);
      });
    }
    function save(k) {
      const d = st[k];
      if (!d.has) { say(`${NAME[k]} has no laptop to work on.`); return; }
      const base = d.pend ? d.pend.design : design(d.ver);
      const des = newDesign(base);
      if (d.online) upload(k, des, d.ver);
      else { d.pend = { design: des, base: d.pend ? d.pend.base : d.ver }; say(`${NAME[k]} saved a change, but there is no internet aboard: it waits on the laptop, <b>unsynced</b>. Only this laptop has it.`); }
      syncUI();
    }
    function toggleLink() {
      const d = st.E;
      d.online = !d.online;
      if (!d.online) say("The ship's internet link is down. Euan can keep working on his local copy, but nothing reaches the cloud.");
      else {
        say("The link is back.");
        if (d.has && d.pend) upload("E", d.pend.design, d.pend.base);
        else if (d.has && d.ver !== (st.bin ? null : st.cur)) send("C", "E", "#888", () => { d.ver = st.bin ? null : st.cur; say("Euan's laptop catches up with the latest version."); });
      }
      syncUI();
    }
    function del() {
      if (!st.A.has || st.A.ver === null) { say("Alba has no copy of the file to delete."); return; }
      st.A.ver = null;
      send("A", "C", "#888", () => {
        st.bin = true;
        say("Alba deleted the poster by mistake. Sync obeys: the file goes to the cloud's <b>bin</b>, and is deleted from Euan's laptop too. Sync is not a back-up! Restore a version to rescue it.");
        syncUI(); broadcast("A");
      });
      syncUI();
    }
    function restore() {
      if (!st.vers.length) { say("There is nothing in the version history yet."); return; }
      const n = +restSel.value || st.vers.length;
      st.vers.push({ n: st.vers.length + 1, by: "R", design: design(n).slice(), note: `restored from v${n}` });
      st.cur = st.vers.length; st.bin = false;
      say(`Restored v${n} from the version history. It becomes the new current version, <b>v${st.cur}</b>; nothing in the history is lost.`);
      syncUI(); broadcast(null);
    }
    function loseOrNew() {
      const d = st.E;
      if (d.has) {
        const lost = !!d.pend;
        d.has = false; d.ver = null; d.pend = null;
        say("Euan's laptop has gone over the side. " + (lost ? "<b>His unsynced edit is gone for ever</b>: it existed only on that laptop." : "Every saved version is safe in the cloud.") + " Press the button again to sign in on a new laptop.");
      } else {
        d.has = true; d.online = true; d.ver = null;
        say("Euan signs in on a new laptop. The files download from the cloud, so work continues.");
        if (st.cur && !st.bin) send("C", "E", design(st.cur).slice(-1)[0], () => { d.ver = st.cur; });
      }
      syncUI();
    }
    function syncUI() {
      linkBtn.textContent = st.E.online ? "Cut the ship's internet" : "Restore the ship's internet";
      linkBtn.setAttribute("aria-pressed", st.E.online ? "false" : "true");
      loseBtn.textContent = st.E.has ? "Euan's laptop goes overboard" : "Euan signs in on a new laptop";
      vlist.innerHTML = "";
      if (!st.vers.length) vlist.append(el("li", null, "(empty: nobody has saved yet)"));
      st.vers.forEach((v) => {
        const sw = el("span", { class: "sw", style: `background:${v.design.slice(-1)[0]}` });
        vlist.append(el("li", { class: v.n === st.cur && !st.bin ? "cur" : "" }, sw, `v${v.n} · ${v.by === "R" ? v.note : "by " + NAME[v.by]}` + (v.n === st.cur ? (st.bin ? " (in the bin)" : " (current)") : "")));
      });
      if (st.conflict) vlist.append(el("li", null, el("span", { class: "sw", style: `background:${st.conflict.design.slice(-1)[0]}` }), `poster (${NAME[st.conflict.by]}'s conflicted copy)`));
      const keep = restSel.value;
      restSel.innerHTML = "";
      if (!st.vers.length) restSel.append(el("option", { value: "" }, "no versions"));
      st.vers.forEach((v) => restSel.append(el("option", { value: v.n }, `v${v.n}`)));
      if (keep && st.vers.length >= +keep) restSel.value = keep; else if (st.vers.length) restSel.value = st.vers.length > 1 ? st.vers.length - 1 : 1;
      const desc = (k) => { const d = st[k]; return !d.has ? "no laptop" : d.pend ? "an unsynced edit" : d.ver ? "v" + d.ver : "no file"; };
      cv.setAttribute("aria-label", `Cloud holds ${st.cur ? "v" + st.cur + (st.bin ? " in the bin" : "") : "nothing yet"}. Euan's laptop: ${desc("E")}, ${st.E.online ? "online" : "offline"}. Alba's laptop: ${desc("A")}.`);
      sim.redraw();
    }
    function flag(ctx, x, y, w, h, des, C) {
      ctx.fillStyle = C.card; ctx.fillRect(x, y, w, h);
      if (des && des.length) des.forEach((c, k) => { ctx.fillStyle = c; ctx.fillRect(x, y + k * h / des.length, w, h / des.length + 0.5); });
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.strokeRect(x, y, w, h);
    }
    const pos = (s) => ({ C: { x: s.w / 2, y: 62 }, E: { x: s.w * 0.2, y: s.h - 78 }, A: { x: s.w * 0.8, y: s.h - 78 } });
    const sim = HG.sim(cv, {
      height: (w) => (w < 460 ? 280 : 300),
      draw(ctx, t, dt, C, s) {
        const P = pos(s);
        // links
        ["E", "A"].forEach((k) => {
          const d = st[k], a = P[k], c = P.C;
          ctx.save(); ctx.strokeStyle = d.online && d.has ? C.sea : C.red; ctx.lineWidth = 2; ctx.setLineDash(d.online && d.has ? [] : [6, 5]);
          ctx.beginPath(); ctx.moveTo(a.x, a.y - 40); ctx.lineTo(c.x + (k === "E" ? -30 : 30), c.y + 26); ctx.stroke(); ctx.restore();
          if (!d.online || !d.has) { const mx = (a.x + c.x) / 2, my = (a.y - 40 + c.y + 26) / 2; HG.label(ctx, "✕ no link", mx, my, { size: 12, align: "center", col: C.red, bold: true }); }
        });
        // cloud
        const c = P.C;
        ctx.save(); ctx.fillStyle = C.paper2; ctx.strokeStyle = C.sea; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(c.x - 34, c.y + 6, 22, Math.PI * 0.5, Math.PI * 1.5); ctx.arc(c.x - 6, c.y - 14, 28, Math.PI, Math.PI * 1.9); ctx.arc(c.x + 32, c.y + 2, 24, Math.PI * 1.3, Math.PI * 0.5); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
        if (st.cur) flag(ctx, c.x - 14, c.y - 18, 28, 20, design(st.cur), C);
        HG.label(ctx, st.cur ? (st.bin ? `v${st.cur} in bin` : `cloud: v${st.cur}`) : "cloud: empty", c.x, c.y + 18, { size: 12, align: "center", bold: true });
        // devices
        ["E", "A"].forEach((k) => {
          const d = st[k], p = P[k];
          if (!d.has) { HG.label(ctx, "🌊 no laptop", p.x, p.y, { size: 13, align: "center", col: C.muted }); }
          else {
            ctx.fillStyle = C.ink2; ctx.fillRect(p.x - 44, p.y - 38, 88, 56); ctx.fillRect(p.x - 54, p.y + 18, 108, 7);
            ctx.fillStyle = C.paper; ctx.fillRect(p.x - 39, p.y - 33, 78, 46);
            const des = d.pend ? d.pend.design : d.ver ? design(d.ver) : null;
            if (des) flag(ctx, p.x - 22, p.y - 26, 44, 32, des, C); else HG.label(ctx, "no file", p.x, p.y - 10, { size: 12, align: "center", col: C.muted, halo: false });
          }
          HG.label(ctx, NAME[k], p.x, p.y + 40, { size: 13, align: "center", bold: true });
          HG.label(ctx, !d.has ? "" : d.pend ? "unsynced edit!" : d.ver ? `has v${d.ver}` + (st.cur && d.ver !== st.cur ? " (old)" : "") : "", p.x, p.y + 58, { size: 12, align: "center", col: d.pend ? C.red : C.ink2 });
        });
        // packets
        packets.forEach((q) => {
          q.t += dt / 0.9;
          const a = q.from === "C" ? { x: P.C.x, y: P.C.y + 20 } : { x: P[q.from].x, y: P[q.from].y - 40 };
          const b = q.to === "C" ? { x: P.C.x, y: P.C.y + 20 } : { x: P[q.to].x, y: P[q.to].y - 40 };
          const u = Math.min(1, q.t);
          const x = a.x + (b.x - a.x) * u, y = a.y + (b.y - a.y) * u;
          ctx.fillStyle = q.colour; ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
          ctx.fillRect(x - 8, y - 6, 16, 12); ctx.strokeRect(x - 8, y - 6, 16, 12);
        });
        const doneP = packets.filter((q) => q.t >= 1);
        if (doneP.length) { packets = packets.filter((q) => q.t < 1); doneP.forEach((q) => q.then()); syncUI(); }
        if (!packets.length && s.playing) setTimeout(() => { if (!packets.length) s.pause(); }, 0);
      },
    });
    syncUI();
    say("Start by saving the poster: press <b>Euan saves a change</b>.");
  });

  /* =====================================================================
     4. Watermark workshop
     ===================================================================== */
  mount("w-watermark", (box) => {
    const W = 480, H = 320, SUBJ = { x: 120, y: 40, w: 250, h: 230 };
    const base = document.createElement("canvas"); base.width = W; base.height = H;
    (function paint(g) {
      const sky = g.createLinearGradient(0, 0, 0, 220); sky.addColorStop(0, "#5b8fc9"); sky.addColorStop(1, "#f2c48f");
      g.fillStyle = sky; g.fillRect(0, 0, W, 220);
      g.fillStyle = "#f7e0a0"; g.beginPath(); g.arc(70, 170, 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#1d5470"; g.fillRect(0, 220, W, 100);
      g.fillStyle = "rgba(255,255,255,.35)"; for (let i = 0; i < 26; i++) g.fillRect((i * 53) % W, 232 + (i * 29) % 80, 18, 2);
      // hull, built of blocks
      g.fillStyle = "#5a3a1e"; g.beginPath(); g.moveTo(130, 210); g.lineTo(370, 210); g.lineTo(350, 255); g.lineTo(150, 255); g.closePath(); g.fill();
      g.fillStyle = "#e0b23a"; g.fillRect(140, 222, 220, 6);
      g.fillStyle = "#15121c"; for (let x = 160; x < 340; x += 22) g.fillRect(x, 232, 10, 9);
      // masts and sails
      g.fillStyle = "#3a2410"; [180, 250, 320].forEach((x) => g.fillRect(x - 2, 60, 5, 150));
      g.fillStyle = "#f4ecd8"; [[180, 80], [250, 62], [320, 84]].forEach(([x, y]) => { g.fillRect(x - 34, y, 68, 40); g.fillRect(x - 30, y + 48, 60, 44); g.fillRect(x - 26, y + 100, 52, 30); });
      g.fillStyle = "#d4147a"; g.beginPath(); g.moveTo(253, 50); g.lineTo(290, 56); g.lineTo(253, 62); g.closePath(); g.fill();
      g.fillStyle = "#c9a14a"; g.beginPath(); g.moveTo(370, 210); g.lineTo(392, 196); g.lineTo(386, 218); g.closePath(); g.fill();
    })(base.getContext("2d"));
    const cfg = { pos: "corner", op: 40, size: 26, ang: 0, crop: "none" };
    const TXT = "© VELLUM PLAN ROOM";
    function stamp(g, alpha, colour) {
      g.save(); g.globalAlpha = alpha; g.fillStyle = colour; g.font = `700 ${cfg.size}px "Atkinson Hyperlegible", sans-serif`;
      g.textBaseline = "middle";
      const tw = g.measureText(TXT).width;
      const one = (x, y) => { g.save(); g.translate(x, y); g.rotate(cfg.ang * Math.PI / 180); g.textAlign = "center"; g.fillText(TXT, 0, 0); g.restore(); };
      if (cfg.pos === "corner") { g.textAlign = "right"; g.fillText(TXT, W - 10, H - 10 - cfg.size / 2); }
      else if (cfg.pos === "centre") one(W / 2, H / 2);
      else { const sx = tw + 40, sy = cfg.size * 3; let r = 0; for (let y = sy / 2; y < H + sy; y += sy, r++) for (let x = (r % 2) * sx / 2 - sx / 2; x < W + sx; x += sx) one(x, y); }
      g.restore();
    }
    const mask = document.createElement("canvas"); mask.width = W; mask.height = H;
    const cropRect = () => (cfg.crop === "subject" ? SUBJ : cfg.crop === "trim" ? { x: W * 0.12, y: H * 0.12, w: W * 0.76, h: H * 0.76 } : { x: 0, y: 0, w: W, h: H });
    function measure() {
      const g = mask.getContext("2d"); g.clearRect(0, 0, W, H); stamp(g, 1, "#000");
      const d = g.getImageData(0, 0, W, H).data, R = cropRect();
      let tot = 0, kept = 0, subj = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (d[(y * W + x) * 4 + 3] < 64) continue;
        tot++;
        if (x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h) kept++;
        if (x >= SUBJ.x && x < SUBJ.x + SUBJ.w && y >= SUBJ.y && y < SUBJ.y + SUBJ.h) subj++;
      }
      return { survive: tot ? kept / tot : 0, hide: subj / (SUBJ.w * SUBJ.h) * cfg.op / 100, kept };
    }
    const cv = el("canvas", { class: "sim", role: "img", "aria-label": "Photograph of HMS Vellum with a watermark" });
    box.append(cv);
    const ctl = el("div", { class: "tc-wmgrid" }); box.append(ctl);
    const ro = el("div", { class: "readouts", "aria-live": "polite" }); box.append(ro);
    const note = el("p", { class: "sim-note", "aria-live": "polite" }); box.append(note);
    const sim = HG.sim(cv, {
      w: W, h: H,
      draw(ctx, t, dt, C) {
        ctx.drawImage(base, 0, 0, W, H);
        stamp(ctx, cfg.op / 100, "#ffffff");
        if (cfg.crop !== "none") {
          const R = cropRect();
          ctx.save(); ctx.fillStyle = "rgba(10,10,20,.72)";
          ctx.fillRect(0, 0, W, R.y); ctx.fillRect(0, R.y + R.h, W, H - R.y - R.h); ctx.fillRect(0, R.y, R.x, R.h); ctx.fillRect(R.x + R.w, R.y, W - R.x - R.w, R.h);
          ctx.setLineDash([8, 6]); ctx.strokeStyle = "#f7d117"; ctx.lineWidth = 3; ctx.strokeRect(R.x, R.y, R.w, R.h); ctx.restore();
        }
      },
    });
    function update() {
      const m = measure();
      const vis = m.survive * cfg.op / 100;
      const protect = m.kept === 0 ? "None: the crop removed it" : vis < 0.12 ? "Weak: faint or mostly cropped" : m.survive > 0.6 && cfg.op >= 25 ? "Strong: survives and is visible" : "Partial";
      ro.innerHTML = `<div><b>${Math.round(m.survive * 100)}%</b><span>of the watermark survives the ${cfg.crop === "none" ? "uncropped image" : "crop"}</span></div>
        <div><b>${Math.round(m.hide * 100)}%</b><span>of the ship hidden (coverage × opacity)</span></div>
        <div><b class="${/Strong/.test(protect) ? "ok" : /None|Weak/.test(protect) ? "bad" : ""}">${protect}</b><span>protection after the thief's tool</span></div>`;
      note.textContent = cfg.pos === "corner"
        ? "A corner mark barely touches the picture, but one crop to the subject removes it completely. It protects only against lazy copying."
        : cfg.pos === "centre"
          ? "Across the subject, the mark survives a crop, because the thief wants the ship. The cost is that it also hides part of the picture: a trade-off between protection and showing the work."
          : "Tiling repeats the mark everywhere, so no crop can remove it. Stock-photo libraries do this on previews, then sell the clean, full-resolution file under licence.";
      cv.setAttribute("aria-label", `Photograph of HMS Vellum with a ${cfg.pos} watermark at ${cfg.op}% opacity. ${Math.round(m.survive * 100)}% of the watermark survives; ${Math.round(m.hide * 100)}% of the ship hidden.`);
      sim.redraw();
    }
    HG.choice(ctl, "Position", [["corner", "Corner"], ["centre", "Centre"], ["tiled", "Tiled"]], cfg.pos, (v) => { cfg.pos = v; update(); });
    HG.choice(ctl, "Angle", [[0, "0°"], [-30, "−30°"]], cfg.ang, (v) => { cfg.ang = v; update(); });
    HG.slider(ctl, { label: "Opacity", min: 5, max: 90, step: 5, value: cfg.op, unit: "%", fmt: (v) => String(v), oninput: (v) => { cfg.op = v; update(); } });
    HG.slider(ctl, { label: "Text size", min: 14, max: 48, step: 2, value: cfg.size, unit: "px", fmt: (v) => String(v), oninput: (v) => { cfg.size = v; update(); } });
    HG.choice(box, "Thief's tool", [["none", "None"], ["trim", "Trim the edges"], ["subject", "Crop to the ship"]], cfg.crop, (v) => { cfg.crop = v; update(); });
    box.insertBefore(box.lastChild, ro);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(update);
    update();
  });

  /* =====================================================================
     6a. Paperless office calculator
     ===================================================================== */
  mount("w-paperless", (box) => {
    const v = { staff: 8, pages: 20, days: 220, cut: 70, paper: 1.0, ink: 4.0, mb: 0.2 };
    const ctl = el("div", { class: "sim-controls" }); box.append(ctl);
    const bars = el("div", { class: "tc-bars", "aria-hidden": "true" }); box.append(bars);
    const ro = el("div", { class: "readouts", "aria-live": "polite" }); box.append(ro);
    const ass = el("details", { class: "tc-assume" }, el("summary", null, "Assumptions and how each number is calculated"));
    const assBody = el("div"); ass.append(assBody);
    const extra = el("div", { class: "sim-controls" });
    box.append(ass);
    const GSM = 80, SHEET_M2 = 0.210 * 0.297, MM_PER_SHEET = 0.1;
    function update() {
      const before = v.staff * v.pages * v.days, after = Math.round(before * (1 - v.cut / 100)), saved = before - after;
      const g = SHEET_M2 * GSM; // grams per sheet
      const cost = (s) => s * (v.paper + v.ink) / 100;
      const gb = saved * v.mb / 1024;
      bars.innerHTML = `<div class="tc-bar"><span>Printed now</span><div class="trk"><div class="fill" style="width:100%"></div></div></div>
        <div class="tc-bar"><span>Printed after</span><div class="trk"><div class="fill after" style="width:${before ? (after / before) * 100 : 0}%"></div></div></div>`;
      ro.innerHTML = `<div><b>${n0(before)} → ${n0(after)}</b><span>A4 sheets a year</span></div>
        <div><b>${n0(saved / 500)} reams</b><span>saved (500 sheets each)</span></div>
        <div><b>${HG.n(saved * g / 1000, 0)} kg</b><span>of paper saved</span></div>
        <div><b>${HG.n(saved * MM_PER_SHEET / 1000, 2)} m</b><span>height of the saved stack</span></div>
        <div><b>£${n0(cost(saved))}</b><span>paper + ink saved a year</span></div>
        <div><b>${HG.n(gb, 1)} GB</b><span>to store those pages as PDFs instead</span></div>`;
      assBody.innerHTML = `<ul>
        <li>Sheets a year = staff × pages per person per day × working days = ${v.staff} × ${v.pages} × ${v.days} = ${n0(before)}.</li>
        <li>An A4 sheet is 0.210 m × 0.297 m = ${HG.n(SHEET_M2, 4)} m². At ${GSM} g/m² (ordinary office paper) that is ${HG.n(g, 2)} g a sheet.</li>
        <li>Office paper is about ${MM_PER_SHEET} mm thick, so a 500-sheet ream is about 50 mm tall.</li>
        <li>Costs per sheet (paper ${HG.n(v.paper, 1)}p, ink or toner ${HG.n(v.ink, 1)}p per printed page) are your assumptions: printer, paper grade and colour coverage change them a lot.</li>
        <li>A one-page PDF is assumed to be about ${HG.n(v.mb, 2)} MB; image-heavy pages are bigger.</li>
        <li>Not counted: the cost and energy of screens, servers and cloud storage, and staff training. Going paperless is not free.</li></ul>`;
    }
    const sl = (o, k) => HG.slider(ctl, Object.assign(o, { value: v[k], oninput: (x) => { v[k] = x; update(); } }));
    sl({ label: "Staff", min: 1, max: 50, step: 1, fmt: (x) => String(x) }, "staff");
    sl({ label: "Pages per person per day", min: 0, max: 60, step: 1, fmt: (x) => String(x) }, "pages");
    sl({ label: "Working days a year", min: 150, max: 260, step: 5, fmt: (x) => String(x) }, "days");
    sl({ label: "Printing replaced by digital", min: 0, max: 100, step: 5, unit: "%", fmt: (x) => String(x) }, "cut");
    HG.slider(extra, { label: "Paper cost per sheet (p)", min: 0.5, max: 5, step: 0.1, value: v.paper, fmt: (x) => HG.n(x, 1), oninput: (x) => { v.paper = x; update(); } });
    HG.slider(extra, { label: "Ink or toner per page (p)", min: 1, max: 15, step: 0.5, value: v.ink, fmt: (x) => HG.n(x, 1), oninput: (x) => { v.ink = x; update(); } });
    HG.slider(extra, { label: "PDF size per page (MB)", min: 0.05, max: 2, step: 0.05, value: v.mb, fmt: (x) => HG.n(x, 2), oninput: (x) => { v.mb = x; update(); } });
    ass.append(extra);
    update();
  });

  /* =====================================================================
     6b. Cause-and-effect builder
     ===================================================================== */
  mount("w-impact", (box) => {
    const T = {
      paperless: { name: "Paperless office", ctx: "a design studio",
        c: [["c1", "drawings and proofs are stored and shared as digital files"], ["c2", "far less paper, ink and toner is bought"], ["c3", "plan chests and filing cabinets are no longer needed"]],
        e: [["e1", "the studio's running costs fall"], ["e2", "a smaller, cheaper office can be used"], ["e3", "the whole team can open the same file at once, wherever they are"], ["e4", "it is better for everyone"]],
        L: { c1: ["e3"], c2: ["e1"], c3: ["e2", "e1"] } },
      recycled: { name: "Recycled materials", ctx: "a packaging company",
        c: [["c1", "packaging is printed on recycled card"], ["c2", "CAM software nests the nets tightly on each sheet before cutting"], ["c3", "designs are tested as CAD models before any prototype is made"]],
        e: [["e1", "fewer trees are felled and less energy goes into making new card"], ["e2", "less offcut is wasted from every sheet"], ["e3", "fewer physical prototypes are thrown away"], ["e4", "it helps the environment"]],
        L: { c1: ["e1"], c2: ["e2"], c3: ["e3"] } },
      cadmfg: { name: "CAD in manufacturing", ctx: "a bicycle-parts maker",
        c: [["c1", "the CAD model is sent as a STEP file and turned into CNC toolpaths by CAM software"], ["c2", "a prototype is 3D printed straight from the CAD model"], ["c3", "a clash check is run on the assembly in CAD"]],
        e: [["e1", "parts are machined exactly to the design, so they fit first time"], ["e2", "the design can be tested in the hand within hours, so it reaches the market sooner"], ["e3", "interference is found before any metal is cut, saving scrapped parts"], ["e4", "it is much faster"]],
        L: { c1: ["e1"], c2: ["e2"], c3: ["e3"] } },
      dtp: { name: "DTP in marketing", ctx: "a small café",
        c: [["c1", "the owner can lay out menus and posters in-house with DTP software"], ["c2", "a master page holds the logo, colours and fonts"], ["c3", "one layout can be exported for print and for social media"]],
        e: [["e1", "there is no agency fee for every price change"], ["e2", "every item looks consistent, so customers recognise the brand"], ["e3", "the same promotion reaches customers on paper and online"], ["e4", "the posters look nicer"]],
        L: { c1: ["e1"], c2: ["e2"], c3: ["e3"] } },
      remote: { name: "Remote working", ctx: "a graphic designer",
        c: [["c1", "project files are kept in cloud storage and meetings are held by video call"], ["c2", "the designer does not travel to the office each day"], ["c3", "company files are opened over a home internet connection"]],
        e: [["e1", "the designer can work from home or anywhere with internet access"], ["e2", "commuting time, cost and pollution are cut"], ["e3", "there is a greater risk of client designs being hacked or lost"], ["e4", "working is more convenient"]],
        L: { c1: ["e1"], c2: ["e2"], c3: ["e3"] } },
      global: { name: "International communication", ctx: "a furniture company selling worldwide",
        c: [["c1", "assembly instructions use pictograms and exploded views instead of words"], ["c2", "drawings follow BS/ISO conventions for projection, lines and dimensions"], ["c3", "a team in Scotland hands work to a team in another time zone at the end of each day"]],
        e: [["e1", "customers in any country can assemble the product without translation"], ["e2", "an engineer in any country reads the drawing correctly"], ["e3", "the project progresses around the clock and finishes sooner"], ["e4", "everyone can understand it"]],
        L: { c1: ["e1"], c2: ["e2"], c3: ["e3"] } },
    };
    let topic = "paperless", cause = null, effect = null;
    const topRow = el("div"); box.append(topRow);
    HG.choice(topRow, "Topic", Object.entries(T).map(([k, o]) => [k, o.name]), topic, (k) => { topic = k; cause = effect = null; draw(); });
    const ctxP = el("p", { class: "hint" });
    const cBox = el("div", { class: "tc-chips", role: "group", "aria-label": "Causes" });
    const eBox = el("div", { class: "tc-chips", role: "group", "aria-label": "Effects" });
    const sent = el("div", { class: "tc-sentence", "aria-live": "polite" });
    const out = fb();
    box.append(ctxP, el("p", { class: "px-label" }, "1 · Cause: what the technology does"), cBox, el("p", { class: "px-label" }, "2 · Effect: what happens as a result"), eBox, sent, out);
    function chips(holder, list, cur, set) {
      holder.innerHTML = "";
      list.forEach(([id, t]) => {
        const b = el("button", { type: "button", "aria-pressed": id === cur ? "true" : "false" }, t);
        b.addEventListener("click", () => { set(id === cur ? null : id); draw(); });
        holder.append(b);
      });
    }
    function draw() {
      const o = T[topic];
      ctxP.textContent = `Context: ${o.ctx}. Build one "explain" mark.`;
      chips(cBox, o.c, cause, (x) => (cause = x));
      chips(eBox, o.e, effect, (x) => (effect = x));
      const ct = cause && o.c.find((x) => x[0] === cause)[1], et = effect && o.e.find((x) => x[0] === effect)[1];
      sent.innerHTML = `For ${HG.esc(o.ctx)}: ` + (ct ? `<span class="c">${HG.esc(ct)}</span>` : "<em>[cause?]</em>") + ", so " + (et ? `<span class="e">${HG.esc(et)}</span>` : "<em>[effect?]</em>") + ".";
      if (!effect && !cause) { out.innerHTML = ""; out.className = "tc-fb"; return; }
      if (effect === "e4") return setFb(out, "<span class='bad'>Too vague for a mark.</span> \"" + HG.esc(et) + "\" gives no specific result. Who benefits, and how? Pick a precise effect.", "poor");
      if (!cause) return setFb(out, "<span class='bad'>Effect without cause: likely 0 marks.</span> This is the error the 2025 course report singles out. Add what the technology does that leads to this.", "poor");
      if (!effect) return setFb(out, "A cause on its own is only half the answer. What happens as a result?", "");
      if (o.L[cause].includes(effect)) setFb(out, "<span class='ok'>✔ Linked cause and effect, in context: worth the mark.</span> For a second mark, build a different cause–effect pair.", "good");
      else setFb(out, "<span class='bad'>These do not connect.</span> Both halves are true, but this cause does not lead to this effect. A marker needs the link to be real. Try a different effect for this cause.", "poor");
    }
    draw();
  });

  /* =====================================================================
     7. Studio inspection
     ===================================================================== */
  mount("w-studio", (box) => {
    const ITEMS = [
      { id: "spray", bad: true, x: 50, y: 178, r: 34, name: "Spray adhesive at a bench with the window shut", fix: "Solvent fumes build up and are flammable. Use a spray booth or a well-ventilated area, spray into a box, and keep away from heat." },
      { id: "posture", bad: true, x: 236, y: 160, r: 44, name: "Hunched over a laptop flat on the desk", fix: "The screen is far below eye level, so the neck bends all day. Raise the screen (laptop stand), add a separate keyboard and mouse, sit back against the chair." },
      { id: "drink", bad: true, x: 330, y: 200, r: 18, name: "Mug of tea beside the keyboard and power strip", fix: "A spill onto electrics risks a shock or fire and can destroy the computer. Keep drinks well away from equipment." },
      { id: "daisy", bad: true, x: 300, y: 300, r: 26, name: "Extension lead plugged into another extension lead", fix: "Daisy-chaining overloads the socket and can overheat and start a fire. Use one correctly rated lead, or more wall sockets." },
      { id: "cable", bad: true, x: 420, y: 314, r: 24, name: "Cable trailing across the walkway", fix: "A trip hazard. Route cables along the wall or under a cable cover." },
      { id: "exit", bad: true, x: 512, y: 252, r: 30, name: "Paper boxes stacked in front of the fire exit", fix: "Exits must be kept clear at all times. Store heavy boxes low, on shelving, away from routes." },
      { id: "ext", bad: false, x: 452, y: 214, r: 18, name: "Fire extinguisher on its wall bracket by the exit", fix: "Correct: visible, accessible, beside the escape route." },
      { id: "aid", bad: false, x: 160, y: 74, r: 18, name: "First aid kit on the wall", fix: "Correct: clearly marked and easy to reach, for cuts from craft knives." },
      { id: "sharps", bad: false, x: 122, y: 190, r: 15, name: "Sharps container for used blades", fix: "Correct: old craft knife blades go in a sharps container, never loose in a bin." },
    ];
    const NB = ITEMS.filter((i) => i.bad).length;
    const svg = S("svg", { viewBox: "0 0 560 340", role: "group", "aria-label": "Studio scene with selectable items" });
    const P = (d, cls, extra) => S("path", Object.assign({ d, class: cls }, extra || {}));
    const R = (x, y, w, h, cls, extra) => S("rect", Object.assign({ x, y, width: w, height: h, class: cls }, extra || {}));
    // room
    svg.append(R(0, 0, 560, 290, "f-paper2"), R(0, 290, 560, 50, "f-muted", { opacity: 0.35 }), P("M0 290 H560", "tc-stroke", { "stroke-width": 2 }));
    // window (closed) and bench with spray can and sharps bin
    svg.append(R(14, 34, 110, 100, "tc-box"), P("M69 34 V134 M14 84 H124", "tc-stroke", { "stroke-width": 2 }), R(10, 210, 140, 8, "tc-dark"), R(18, 218, 6, 72, "tc-dark"), R(136, 218, 6, 72, "tc-dark"));
    svg.append(S("text", { x: 69, y: 150, "text-anchor": "middle", class: "muted", "font-size": 12, text: "window shut" }));
    svg.append(R(40, 180, 14, 30, "f-red"), R(42, 174, 10, 6, "tc-dark"), S("circle", { cx: 70, cy: 168, r: 14, fill: "#cfd6e6", opacity: 0.85 }), S("circle", { cx: 84, cy: 160, r: 10, fill: "#cfd6e6", opacity: 0.7 }), R(70, 196, 50, 14, "tc-cardsheet"));
    svg.append(R(112, 180, 20, 30, "f-gold"), R(110, 176, 24, 6, "tc-dark"));
    // first aid kit
    svg.append(R(146, 60, 28, 26, "tc-box"), P("M160 64 V82 M151 73 H169", "", { stroke: "#3f7426", "stroke-width": 4 }));
    // desk with laptop and hunched person
    svg.append(R(170, 210, 190, 8, "tc-dark"), R(178, 218, 6, 72, "tc-dark"), R(346, 218, 6, 72, "tc-dark"));
    svg.append(P("M246 210 l40 0 l-6 -26 l-40 0 z", "tc-dark"), R(242, 206, 50, 4, "tc-dark"));
    svg.append(S("circle", { cx: 236, cy: 168, r: 14, class: "tc-person" }), P("M222 180 Q200 196 196 236 L210 248 L232 214 Q244 200 250 196 Z", "tc-person"), P("M200 236 L196 290 M214 246 L232 290", "tc-stroke", { "stroke-width": 5 }), R(186, 240, 40, 8, "tc-dark"), R(200, 248, 5, 42, "tc-dark"));
    // mug and power strip on desk
    svg.append(R(322, 192, 14, 18, "f-sea"), P("M336 196 q8 4 0 10", "tc-stroke", { fill: "none", "stroke-width": 2 }), R(300, 205, 22, 5, "tc-dark"));
    // daisy chained extension leads under desk
    svg.append(R(280, 296, 30, 10, "tc-box"), R(304, 286, 26, 10, "tc-box"), P("M282 296 q-20 -40 -2 -78 M318 286 q10 -30 0 -68 M292 306 q30 10 60 0", "tc-stroke", { fill: "none", "stroke-width": 2 }));
    // trailing cable to right wall socket
    svg.append(P("M352 304 Q400 330 450 312 T548 280", "tc-stroke", { fill: "none", "stroke-width": 2.5 }), R(540, 270, 12, 16, "tc-box"));
    // fire exit door, extinguisher, boxes
    svg.append(R(480, 110, 66, 180, "f-grass", { opacity: 0.8 }), S("text", { x: 513, y: 132, "text-anchor": "middle", fill: "#fff", "font-size": 13, "font-weight": 700, text: "EXIT" }));
    svg.append(R(445, 198, 14, 34, "f-red"), R(447, 192, 10, 6, "tc-dark"));
    svg.append(R(486, 234, 46, 28, "tc-folder"), R(492, 262, 50, 28, "tc-folder"), R(494, 210, 34, 24, "tc-folder"));
    const hots = [];
    const list = el("ul", { class: "tc-found", "aria-live": "polite" });
    const ro = el("p", { class: "readout", "aria-live": "polite" });
    const found = new Set();
    ITEMS.forEach((it) => {
      const g = S("g", { class: "hot", tabindex: 0, role: "button", "aria-label": it.name });
      g.append(S("circle", { cx: it.x, cy: it.y, r: it.r, class: "ring" }));
      const act = () => pick(it, g);
      g.addEventListener("click", act);
      g.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); act(); } });
      svg.append(g); hots.push([it, g]);
    });
    function pick(it, g, quietly) {
      if (found.has(it.id)) return;
      found.add(it.id);
      g.classList.add(it.bad ? "found-bad" : "found-good");
      const k = found.size;
      g.append(S("circle", { cx: it.x + it.r * 0.7, cy: it.y - it.r * 0.7, r: 10, fill: it.bad ? "#b3261e" : "#3f7426" }), S("text", { x: it.x + it.r * 0.7, y: it.y - it.r * 0.7 + 4.5, "text-anchor": "middle", class: "badge", fill: "#fff", text: String(k) }));
      g.setAttribute("aria-label", `${k}. ${it.name}: ${it.bad ? "hazard" : "good practice"}`);
      list.append(el("li", { class: it.bad ? "bad" : "good", html: `<b>${k}. ${it.bad ? "⚠ Hazard" : "✔ Good practice"}: ${HG.esc(it.name)}.</b> ${HG.esc(it.fix)}` }));
      const nb = ITEMS.filter((i) => i.bad && found.has(i.id)).length;
      ro.textContent = `Hazards found: ${nb} of ${NB}` + (nb === NB ? (quietly ? "" : " — inspection complete. Well spotted.") : "");
    }
    const all = el("button", { class: "btn small", type: "button" }, "Reveal everything");
    all.addEventListener("click", () => hots.forEach(([it, g]) => pick(it, g, true)));
    const reset = el("button", { class: "btn small", type: "button" }, "↺ Reset");
    reset.addEventListener("click", () => {
      found.clear(); list.innerHTML = "";
      hots.forEach(([it, g]) => { g.classList.remove("found-bad", "found-good"); [...g.children].slice(1).forEach((c) => c.remove()); g.setAttribute("aria-label", it.name); });
      ro.textContent = `Hazards found: 0 of ${NB}`;
    });
    box.append(el("div", { class: "tc-studio" }, svg), ro, el("div", { class: "btn-row" }, all, reset), list);
    ro.textContent = `Hazards found: 0 of ${NB}`;
  });

  /* =====================================================================
     8. Be the marker
     ===================================================================== */
  mount("w-markit", (box) => {
    const Q = [
      { q: "Explain one benefit of cloud storage for a design team. [2]", m: 2, a: "It is quicker.", k: 0, why: "No cause, no context, and 'quicker' at what? 0 marks." },
      { q: "Explain one benefit of cloud storage for a design team. [2]", m: 2, a: "Files are stored on remote servers, so a designer can open the latest version from home or a client's office, without carrying a USB stick.", k: 2, why: "Cause (remote servers) linked to an effect (open from anywhere), with context. 2 marks." },
      { q: "Explain why a company watermarks images on its website. [2]", m: 2, a: "To stop theft.", k: 0, why: "Bare 'theft' with no description: the 2024 marking instructions did not accept it. 0 marks." },
      { q: "Explain why a company watermarks images on its website. [2]", m: 2, a: "It shows the images are the company's intellectual property, so others cannot pass them off as their own. It also stops them being used without payment.", k: 2, why: "Two different, described points. 2 marks." },
      { q: "Describe two benefits of the paperless office. [2]", m: 2, a: "Less paper and toner are bought, so running costs fall. It is also cheaper.", k: 1, why: "The first sentence is a described benefit: 1 mark. 'It is also cheaper' repeats the same point, so it earns nothing more. Give two clearly different benefits." },
      { q: "Describe two benefits of the paperless office. [2]", m: 2, a: "Less paper, ink and toner are bought, which reduces costs. Documents are stored digitally, so no space is needed for filing cabinets.", k: 2, why: "Two different, described benefits. 2 marks." },
      { q: "State one input device that would capture a 3D object for reverse engineering. [1]", m: 1, a: "A 3D scanner.", k: 1, why: "A 'state' question needs only the correct name. 1 mark." },
      { q: "Explain one advantage of a laser printer over an inkjet printer for printing 500 leaflets. [2]", m: 2, a: "A laser printer is better quality.", k: 0, why: "Not reliably true (inkjets are excellent for photographs), and no cause or context. The relevant points are speed and cost per page for large runs. 0 marks." },
      { q: "Explain one advantage of a laser printer over an inkjet printer for printing 500 leaflets. [2]", m: 2, a: "Toner has a lower cost per page than inkjet cartridges, so printing 500 leaflets costs less.", k: 2, why: "Cause (cost per page of toner) and effect in context (500 leaflets cheaper). 2 marks." },
    ];
    let i = 0, agree = 0, done = 0;
    const qP = el("p", { class: "tc-q" }), aP = el("p", { class: "tc-cand" });
    const marks = el("div", { class: "btn-row", role: "group", "aria-label": "Award marks" });
    const out = fb();
    const nav = el("div", { class: "btn-row" });
    const prev = el("button", { class: "btn small", type: "button" }, "◀ Previous"), next = el("button", { class: "btn small primary", type: "button" }, "Next answer ▶");
    const tally = el("span", { class: "hint", style: "margin:0" });
    nav.append(prev, next, tally);
    box.append(qP, aP, marks, out, nav);
    const answered = new Map();
    function show() {
      const o = Q[i];
      qP.textContent = `Answer ${i + 1} of ${Q.length} · ${o.q}`;
      aP.textContent = `"${o.a}"`;
      marks.innerHTML = "";
      for (let k = 0; k <= o.m; k++) {
        const b = el("button", { class: "btn small", type: "button" }, `${k} mark${k === 1 ? "" : "s"}`);
        b.addEventListener("click", () => award(k));
        marks.append(b);
      }
      out.innerHTML = ""; out.className = "tc-fb";
      if (answered.has(i)) verdict(answered.get(i));
      prev.disabled = i === 0; next.disabled = i === Q.length - 1;
      tally.textContent = `You agree with the marker on ${agree} of ${done}`;
    }
    function verdict(k) {
      const o = Q[i];
      marks.querySelectorAll("button").forEach((b, j) => { b.disabled = true; if (j === o.k) b.classList.add("primary"); });
      setFb(out, (k === o.k ? "<span class='ok'>✔ You agree with the marker.</span> " : `<span class='bad'>The marker gives ${o.k}.</span> `) + o.why, k === o.k ? "good" : "poor");
    }
    function award(k) {
      if (answered.has(i)) return;
      answered.set(i, k); done++; if (k === Q[i].k) agree++;
      verdict(k);
      tally.textContent = `You agree with the marker on ${agree} of ${done}`;
    }
    prev.addEventListener("click", () => { if (i > 0) { i--; show(); } });
    next.addEventListener("click", () => { if (i < Q.length - 1) { i++; show(); } });
    show();
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", staticFigures); else staticFigures();
})();
