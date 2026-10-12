/* Computer Systems deck — interactive widgets. */
(function () {
  "use strict";
  const HC = window.HC;
  const el = HC.el;

  /* ============ Two's complement register ============ */
  function twos(box) {
    const PV = [-128, 64, 32, 16, 8, 4, 2, 1];
    let bits = [1, 1, 0, 1, 0, 0, 1, 1];
    const lamps = el("div", { class: "lamps", role: "group", "aria-label": "Eight bits. Activate a lamp to flip it." });
    const btns = PV.map((pv, i) => {
      const b = el("button", { type: "button", class: "lamp", "aria-pressed": "false" }, el("span", { class: "lamp-pv" }, String(pv)), el("span", { class: "lamp-bit" }, "0"));
      b.addEventListener("click", () => { bits[i] ^= 1; steps.innerHTML = ""; paint(); });
      lamps.append(b);
      return b;
    });
    const out = el("p", { class: "readout", "aria-live": "polite" });
    const inp = el("input", { type: "number", min: -128, max: 127, value: -45, "aria-label": "Denary number to convert" });
    const go = el("button", { class: "btn small primary", type: "button" }, "Convert");
    const steps = el("div", { class: "output-box twos-steps", "aria-live": "polite" });
    const nIn = el("input", { type: "number", min: 2, max: 64, value: 8, style: "width:5em", "aria-label": "Number of bits" });
    const rng = el("span", { class: "readout" });
    box.append(lamps, out, el("div", { class: "btn-row" }, el("label", null, "Denary ", inp), go), steps,
      el("div", { class: "btn-row" }, el("label", null, "Range with ", nIn, " bits: "), rng));
    function paint() {
      bits.forEach((b, i) => { btns[i].classList.toggle("on", !!b); btns[i].setAttribute("aria-pressed", b ? "true" : "false"); btns[i].querySelector(".lamp-bit").textContent = b; btns[i].setAttribute("aria-label", `Bit worth ${PV[i]}: ${b ? "lit, 1" : "dark, 0"}`); });
      const parts = PV.filter((p, i) => bits[i]);
      const v = parts.reduce((a, b) => a + b, 0);
      out.innerHTML = `<code>${bits.join("")}</code> = ${parts.length ? parts.map((p, k) => (k && p > 0 ? "+ " : "") + (p < 0 ? "−128 " : p + " ")).join("") : "0 "}= <b>${v}</b>`;
    }
    const bin8 = (n) => n.toString(2).padStart(8, "0");
    go.addEventListener("click", () => {
      let n = Math.trunc(+inp.value);
      if (!isFinite(n) || n < -128 || n > 127) { steps.innerHTML = "<span class='bad'>8-bit two's complement can only hold −128 to 127.</span>"; return; }
      if (n >= 0) {
        bits = bin8(n).split("").map(Number);
        steps.innerHTML = `${n} is positive, so it's ordinary binary with a 0 in the −128 column: <b>${bin8(n)}</b>`;
      } else if (n === -128) {
        bits = [1, 0, 0, 0, 0, 0, 0, 0];
        steps.innerHTML = `−128 is just the leftmost lamp: <b>10000000</b>. (128 itself doesn't fit in 8-bit two's complement, so flip-and-add-one can't start from it.)`;
      } else {
        const pos = bin8(-n);
        const inv = pos.split("").map((c) => (c === "0" ? "1" : "0")).join("");
        const res = bin8((parseInt(inv, 2) + 1) & 255);
        bits = res.split("").map(Number);
        steps.innerHTML = `1. Write +${-n} in binary:   <b>${pos}</b>\n2. Invert every bit:     <b>${inv}</b>\n3. Add 1:                <b>${res}</b>\nCheck: −128 + ${PV.slice(1).filter((p, i) => bits[i + 1]).join(" + ") || "0"} = ${n} ✔`;
      }
      paint();
    });
    function range() {
      const n = Math.min(64, Math.max(2, Math.trunc(+nIn.value) || 8));
      const lo = -(2n ** BigInt(n - 1)), hi = 2n ** BigInt(n - 1) - 1n;
      const f = (x) => x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ").replace("-", "−");
      rng.textContent = `−2^${n - 1} to 2^${n - 1} − 1  =  ${f(lo)} to ${f(hi)}`;
    }
    nIn.addEventListener("input", range);
    paint(); range();
  }

  /* ============ Floating point converter ============ */
  function toBin(x, maxFrac) {
    let ip = Math.floor(x), fp = x - ip;
    let ib = ip.toString(2), fb = "", exact = true;
    for (let i = 0; i < maxFrac && fp > 0; i++) { fp *= 2; if (fp >= 1) { fb += "1"; fp -= 1; } else fb += "0"; }
    if (fp > 0) exact = false;
    return { ib, fb, exact };
  }
  function floatW(box) {
    const inp = el("input", { type: "text", value: "66.625", inputmode: "decimal", "aria-label": "Real number", size: 12 });
    const go = el("button", { class: "btn small primary", type: "button" }, "Convert");
    const stage = el("div", { class: "fp-stage", "aria-hidden": "true" });
    const expo = el("p", { class: "readout fp-expo" });
    const fields = el("div", { class: "fp-fields" });
    const note = el("div", { class: "output-box", "aria-live": "polite" });
    const ex = el("div", { class: "btn-row" }, ...["66.625", "-13.75", "0.1640625", "0.1", "-0.05078125", "1000000"].map((v) => {
      const b = el("button", { class: "btn small", type: "button" }, v); b.addEventListener("click", () => { inp.value = v; run(); }); return b;
    }));
    box.append(el("div", { class: "btn-row" }, el("label", null, "Number ", inp), go), el("p", { class: "hint" }, "Try:"), ex, stage, expo, fields, note);
    let timer = null;
    function run() {
      clearInterval(timer);
      const x = Number(String(inp.value).replace(/[−–]/g, "-").trim());
      if (!isFinite(x)) { note.innerHTML = "<span class='bad'>Please type a number, like 66.625 or -0.75.</span>"; return; }
      if (x === 0) { stage.innerHTML = ""; fields.innerHTML = ""; expo.textContent = ""; note.innerHTML = "Zero is a special case: the mantissa is all zeros, so there is no leading 1 to move the point to."; return; }
      const sign = x < 0 ? 1 : 0;
      const { ib, fb, exact } = toBin(Math.abs(x), 200);
      const digits = (ib + fb).split("");
      const first = digits.indexOf("1");
      if (first === -1) { stage.innerHTML = ""; fields.innerHTML = ""; expo.textContent = ""; note.innerHTML = "<span class='bad'>This number is so small that its first 1 bit is more than 200 places after the point. The exponent would be far below −128, so it cannot be stored: it underflows to zero.</span>"; return; }
      const e = ib.length - first;
      const sig = digits.slice(first).join("");
      const mant = sig.slice(0, 15).padEnd(15, "0");
      const lost = sig.length > 15 || !exact;
      const expOk = e >= -128 && e <= 127;
      const expBits = expOk ? ((e + 256) & 255).toString(2).padStart(8, "0") : "overflow";
      // animate the point hopping from after the integer part to before the first 1
      let p = ib.length;
      const draw = (pp) => {
        // show digits with the point inserted at pp (relative to the digit string), padding with leading zeros as needed
        let ds = digits.slice(), pos = pp;
        while (pos < 0) { ds.unshift("0"); pos++; }
        const left = ds.slice(0, pos).join("") || "0";
        const right = ds.slice(pos).join("");
        const shown = (left.replace(/^0+(?=\d)/, "") || "0");
        stage.innerHTML = `<span class="fp-sign">${sign ? "−" : ""}</span>${[...shown].map((c, i) => `<span class="fp-d${c === "1" && i === shown.indexOf("1") ? " lead" : ""}">${c}</span>`).join("")}<span class="fp-point">.</span>${[...right.slice(0, 24)].map((c) => `<span class="fp-d">${c}</span>`).join("")}${right.length > 24 ? "<span class='fp-d'>…</span>" : ""}`;
        const moved = ib.length - pp;
        expo.innerHTML = `× 2<sup>${moved}</sup> &nbsp; <span class="hint">(point moved ${Math.abs(moved)} place${Math.abs(moved) === 1 ? "" : "s"} ${moved >= 0 ? "left" : "right"})</span>`;
      };
      draw(p);
      fields.innerHTML = ""; note.innerHTML = `${Math.abs(x)} in binary is <code>${ib}.${fb.slice(0, 30) || "0"}${fb.length > 30 ? "…" : ""}</code>${exact ? "" : " (the fraction never ends in binary)"}`;
      const target = first;
      const finish = () => {
        draw(target);
        fields.innerHTML = `<div class="fp-field s"><b>${sign}</b><span>sign</span></div><div class="fp-field m"><b>${mant}</b><span>mantissa</span></div><div class="fp-field e"><b>${expBits}</b><span>exponent = ${e}</span></div>`;
        const back = (sign ? -1 : 1) * parseInt(mant, 2) / 2 ** 15 * 2 ** e;
        note.innerHTML = `Normalised: ${sign ? "−" : ""}0.${sig.slice(0, 15)}${sig.length > 15 ? "<s>" + sig.slice(15, 25) + "</s>…" : ""} × 2<sup>${e}</sup><br>` +
          (expOk ? "" : "<span class='bad'>Exponent out of range for 8 bits (−128…127): this number is too big or too small to store.</span><br>") +
          (lost ? `<span class='bad'>Only 15 mantissa bits fit, so the rest are lost. The stored value is ${back}, not ${Math.abs(x) * (sign ? -1 : 1)}. That is a loss of <b>precision</b>.</span>` : `<span class='ok'>Stored exactly.</span> Check: ${sign ? "−" : ""}0.${mant} × 2<sup>${e}</sup> = ${back}`);
      };
      if (HC.reduced || p === target) return finish();
      timer = setInterval(() => { p += p > target ? -1 : 1; draw(p); if (p === target) { clearInterval(timer); setTimeout(finish, 350); } }, 380);
    }
    go.addEventListener("click", run);
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    run();
  }

  function tradeoff(box) {
    const s = el("input", { type: "range", min: 2, max: 14, value: 8, "aria-label": "Exponent bits" });
    const bar = el("div", { class: "to-bar", "aria-hidden": "true" });
    const out = el("div", { class: "output-box", "aria-live": "polite" });
    box.append(el("label", null, "Exponent bits ", s), bar, out);
    const sci = (log10) => {
      const k = Math.floor(log10), m = 10 ** (log10 - k);
      return k > 6 || k < -4 ? `${m.toFixed(1)} × 10<sup>${k}</sup>` : (10 ** log10).toPrecision(3);
    };
    function upd() {
      const e = +s.value, m = 23 - e;
      bar.innerHTML = `<span class="to-s" style="flex:1">S</span><span class="to-m" style="flex:${m}">mantissa ${m}</span><span class="to-e" style="flex:${e}">exp ${e}</span>`;
      const emax = 2 ** (e - 1) - 1, emin = -(2 ** (e - 1));
      const largest = emax * Math.log10(2) + Math.log10(1 - 2 ** -m);
      const smallest = (emin - 1) * Math.log10(2);
      const digits = (m * Math.log10(2)).toFixed(1);
      out.innerHTML = `Exponent range: ${emin} to ${emax}\nLargest number ≈ <b>${sci(largest)}</b>\nSmallest positive ≈ <b>${sci(smallest)}</b>\nPrecision ≈ <b>${digits}</b> significant decimal digits\n` +
        (e <= 4 ? "→ Very precise, but tiny range: astronomical distances and atom widths are both out of reach." : e >= 12 ? "→ Enormous range, but only a handful of digits are kept: 3.14159 and 3.15 might end up looking the same." : "→ A balance of range and precision.");
    }
    s.addEventListener("input", upd); upd();
  }

  /* ============ Unicode signal book ============ */
  function unicode(box) {
    const inp = el("input", { type: "text", value: "Fàilte, HMS Redstone! 🚢 日本", "aria-label": "Text to encode", style: "width:100%" });
    const tbl = el("div", { class: "table-wrap", style: "max-height:300px;overflow:auto" });
    const sum = el("div", { class: "output-box", "aria-live": "polite" });
    box.append(inp, sum, tbl);
    function upd() {
      const cps = [...inp.value].slice(0, 60);
      const rows = cps.map((ch) => {
        const cp = ch.codePointAt(0);
        const set = cp < 128 ? ["ASCII (7-bit)", "ok"] : cp < 256 ? ["Extended ASCII (8-bit)", "ok"] : cp <= 0xffff ? ["Unicode only (16-bit)", "warn"] : ["Unicode only (32-bit)", "bad"];
        return `<tr><td style="font-size:1.2rem">${HC.esc(ch === " " ? "␠" : ch)}</td><td class="num">${cp}</td><td><code>U+${cp.toString(16).toUpperCase().padStart(4, "0")}</code></td><td><code>${cp.toString(2)}</code></td><td>${set[0]}</td></tr>`;
      });
      tbl.innerHTML = `<table><thead><tr><th>Char</th><th>Code</th><th>Hex</th><th>Binary</th><th>Smallest set that holds it</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
      const n = cps.length, maxCp = Math.max(0, ...cps.map((c) => c.codePointAt(0)));
      const asciiOk = maxCp < 256;
      const ubits = maxCp <= 0xffff ? 16 : 32;
      sum.innerHTML = `${n} characters\nExtended ASCII (8 bits each): ${asciiOk ? `<b>${n * 8} bits</b>` : "<span class='bad'>can't store this text: some characters have codes above 255</span>"}\nUnicode (${ubits} bits each): <b>${n * ubits} bits</b>${asciiOk ? ` — ${ubits / 8}× the storage, for no gain with this text` : " — the only option"}`;
    }
    inp.addEventListener("input", upd); upd();
  }

  /* ============ Bitmap vs vector spyglass ============ */
  function graphics(box) {
    const SHAPES = [
      { kind: "circle", cx: 12, cy: 4, r: 2.2, stroke: "#2b2f3a", w: 1.5, desc: "circle centre (12,4) radius 2.2, line dark grey 1.5" },
      { kind: "path", d: "M12 6.2 V21", stroke: "#2b2f3a", w: 1.8, desc: "line (12,6.2)→(12,21), dark grey 1.8" },
      { kind: "path", d: "M6.5 9 H17.5", stroke: "#7a5532", w: 2, desc: "line (6.5,9)→(17.5,9), brown 2 (the stock)" },
      { kind: "path", d: "M3.8 14.5 Q5 21 12 21 Q19 21 20.2 14.5", stroke: "#2b2f3a", w: 1.8, fill: "none", desc: "curve (3.8,14.5)…(20.2,14.5), dark grey 1.8" },
      { kind: "path", d: "M2.5 12.5 L6.5 13.5 L3.6 16.5 Z", fill: "#b3261e", desc: "triangle fluke, fill red" },
      { kind: "path", d: "M21.5 12.5 L17.5 13.5 L20.4 16.5 Z", fill: "#b3261e", desc: "triangle fluke, fill red" },
    ];
    const N = 24, VIEW = 240;
    // vector
    const svg = HC.svg("svg", { viewBox: "0 0 24 24", width: VIEW, height: VIEW, role: "img", "aria-label": "Vector anchor" });
    svg.append(HC.svg("rect", { x: -100, y: -100, width: 300, height: 300, fill: "#f4ecd8" }));
    SHAPES.forEach((s) => {
      const n = s.kind === "circle" ? HC.svg("circle", { cx: s.cx, cy: s.cy, r: s.r }) : HC.svg("path", { d: s.d });
      n.setAttribute("fill", s.fill || "none");
      if (s.stroke) { n.setAttribute("stroke", s.stroke); n.setAttribute("stroke-width", s.w); n.setAttribute("stroke-linecap", "round"); }
      svg.append(n);
    });
    // bitmap: rasterise the same shapes at 24×24 and threshold alpha → hard pixels
    const small = document.createElement("canvas"); small.width = small.height = N;
    const sc = small.getContext("2d");
    sc.fillStyle = "#f4ecd8"; sc.fillRect(0, 0, N, N);
    const tmp = document.createElement("canvas"); tmp.width = tmp.height = N;
    const tc = tmp.getContext("2d", { willReadFrequently: true });
    SHAPES.forEach((s) => {
      tc.clearRect(0, 0, N, N);
      const p = s.kind === "circle" ? (() => { const q = new Path2D(); q.arc(s.cx, s.cy, s.r, 0, Math.PI * 2); return q; })() : new Path2D(s.d);
      if (s.fill) { tc.fillStyle = s.fill; tc.fill(p); }
      if (s.stroke) { tc.strokeStyle = s.stroke; tc.lineWidth = s.w; tc.lineCap = "round"; tc.stroke(p); }
      const img = tc.getImageData(0, 0, N, N);
      const col = (s.fill && !s.stroke ? s.fill : s.stroke);
      sc.fillStyle = col;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (img.data[(y * N + x) * 4 + 3] > 110) sc.fillRect(x, y, 1, 1);
    });
    const big = el("canvas", { width: VIEW, height: VIEW, role: "img", "aria-label": "Bit-mapped anchor, 24 by 24 pixels" });
    const z = el("input", { type: "range", min: 1, max: 8, step: 0.25, value: 1, "aria-label": "Zoom" });
    const zl = el("span", { class: "readout" }, "×1");
    box.append(
      el("div", { class: "btn-row" }, el("label", null, "Zoom ", z), zl),
      el("div", { class: "spy" },
        el("figure", null, big, el("figcaption", null, "Bit-mapped: 24 × 24 pixels")),
        el("figure", null, svg, el("figcaption", null, "Vector: 6 objects"))),
      el("details", null, el("summary", null, "What is actually stored?"),
        el("div", { class: "compare" },
          el("div", { html: `<h3>Bit-mapped</h3><p>One colour per pixel: 24 × 24 = 576 pixels. At 24-bit colour depth that is 576 × 24 = <b>13 824 bits</b>, whatever the picture shows. Double the resolution and the file is four times bigger.</p>` }),
          el("div", { html: `<h3>Vector</h3><ol style="font-size:.85rem">${SHAPES.map((s) => `<li>${s.desc}</li>`).join("")}</ol><p>A few dozen numbers, and it can be redrawn at any size.</p>` }))));
    function draw() {
      const k = +z.value;
      zl.textContent = "×" + k;
      const ctx = big.getContext("2d");
      ctx.imageSmoothingEnabled = false;
      // zoom towards the curved arm and fluke, where jagged edges show best
      const FX = 6, FY = 15, f = (k - 1) / 7;
      const w = N / k, cx = 12 + (FX - 12) * Math.min(1, f * 1.6), cy = 12 + (FY - 12) * Math.min(1, f * 1.6);
      const ox = Math.max(0, Math.min(N - w, cx - w / 2)), oy = Math.max(0, Math.min(N - w, cy - w / 2));
      ctx.clearRect(0, 0, VIEW, VIEW);
      ctx.drawImage(small, ox, oy, w, w, 0, 0, VIEW, VIEW);
      svg.setAttribute("viewBox", `${ox} ${oy} ${w} ${w}`);
    }
    z.addEventListener("input", draw); draw();
  }

  /* ============ Fetch-execute animation ============ */
  function fetchW(box) {
    const S = HC.svg;
    const svg = S("svg", { role: "img", "aria-label": "Processor and memory joined by address, data and control buses. The current step is described in the text below." });
    const mem = [[4, "LOAD 9"], [5, "ADD 10"], [6, "STORE 11"], [7, "HALT"], [8, "—"], [9, "12"], [10, "7"], [11, "0"]];
    const procBox = `
      <rect x="10" y="20" width="230" height="330" rx="6" fill="var(--card)" stroke="var(--navy-2)" stroke-width="3"/>
      <text x="125" y="44" text-anchor="middle" class="px ink" font-size="16">Processor</text>
      <g class="mono" font-size="14">
        <rect x="26" y="62" width="198" height="40" fill="var(--paper)" stroke="var(--line)"/><text x="34" y="78" class="ink2" font-size="13">PROGRAM COUNTER</text><text id="fx-pc" x="34" y="96" class="ink">04</text>
        <rect x="26" y="112" width="198" height="40" fill="var(--paper)" stroke="var(--line)"/><text x="34" y="128" class="ink2" font-size="13">INSTRUCTION REGISTER</text><text id="fx-ir" x="34" y="146" class="ink">—</text>
        <rect id="fx-cu" x="26" y="162" width="96" height="60" fill="var(--paper)" stroke="var(--line)"/><text x="34" y="180" class="ink2" font-size="13">CONTROL</text><text x="34" y="194" class="ink2" font-size="13">UNIT /</text><text x="34" y="208" class="ink2" font-size="13">DECODER</text>
        <rect id="fx-alu" x="128" y="162" width="96" height="60" fill="var(--paper)" stroke="var(--line)"/><text x="136" y="180" class="ink2" font-size="13">ALU</text>
        <rect x="26" y="232" width="198" height="40" fill="var(--paper)" stroke="var(--line)"/><text x="34" y="248" class="ink2" font-size="13">ACCUMULATOR</text><text id="fx-acc" x="34" y="266" class="ink">0</text>
      </g>`;
    const memBox = `
      <rect x="0" y="0" width="230" height="330" rx="6" fill="var(--card)" stroke="var(--dirt)" stroke-width="3"/>
      <text x="115" y="24" text-anchor="middle" class="px ink" font-size="16">Main memory</text>
      ${mem.map(([a, v], i) => `<g id="fx-m${a}"><rect x="20" y="${40 + i * 34}" width="190" height="28" fill="var(--paper)" stroke="var(--line)"/><text x="30" y="${59 + i * 34}" font-size="13" class="mono muted">${String(a).padStart(2, "0")}</text><text x="65" y="${59 + i * 34}" font-size="13" class="mono ink">${v}</text></g>`).join("")}`;
    // Two layouts: side by side, or (on a phone) memory stacked under the processor with vertical buses.
    // BUS[k] = [x1, y1, x2, y2] from the processor end to the memory end, for k = address, data, control.
    const narrowMq = matchMedia("(max-width: 600px)");
    let BUS;
    function layout() {
      if (narrowMq.matches) {
        BUS = [[110, 340, 110, 450], [190, 340, 190, 450], [270, 340, 270, 450]];
        svg.setAttribute("viewBox", "0 0 380 790");
        svg.innerHTML = `<g transform="translate(65,-10)">${procBox}</g><g transform="translate(75,450)">${memBox}</g>
      <line x1="110" y1="340" x2="110" y2="450" stroke="#5b8fc7" stroke-width="8"/><path d="M102 436 L118 436 L110 448 Z" fill="#3e6fa8"/><text transform="translate(94,395) rotate(-90)" text-anchor="middle" font-size="12" class="ink2">address bus</text>
      <line x1="190" y1="340" x2="190" y2="450" stroke="#4f8a2e" stroke-width="12"/><text transform="translate(172,395) rotate(-90)" text-anchor="middle" font-size="12" class="ink2">data bus</text>
      <line id="fx-ctl" x1="270" y1="340" x2="270" y2="450" stroke="#8e6cc1" stroke-width="6"/><text transform="translate(256,395) rotate(-90)" text-anchor="middle" font-size="12" class="ink2">control bus</text>
      <g id="fx-token"></g>`;
      } else {
        BUS = [[240, 90, 440, 90], [240, 170, 440, 170], [240, 250, 440, 250]];
        svg.setAttribute("viewBox", "0 0 680 360");
        svg.innerHTML = `${procBox}<g transform="translate(440,20)">${memBox}</g>
      <line x1="240" y1="90" x2="440" y2="90" stroke="#5b8fc7" stroke-width="8"/><text x="340" y="80" text-anchor="middle" font-size="12" class="ink2">address bus →</text>
      <line x1="240" y1="170" x2="440" y2="170" stroke="#4f8a2e" stroke-width="12"/><text x="340" y="157" text-anchor="middle" font-size="12" class="ink2">← data bus →</text>
      <line id="fx-ctl" x1="240" y1="250" x2="440" y2="250" stroke="#8e6cc1" stroke-width="6"/><text x="340" y="240" text-anchor="middle" font-size="12" class="ink2">control bus (read line)</text>
      <g id="fx-token"></g>`;
      }
    }
    layout();
    const panel = el("div", { class: "fx-drill" });
    const note = el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = el("button", { class: "btn small", type: "button" }, "◀ Back");
    const next = el("button", { class: "btn small primary", type: "button" }, "Next step ▶");
    const auto = el("button", { class: "btn small", type: "button" }, "▶ Auto");
    box.append(el("div", { class: "fx-grid" }, el("div", { class: "diagram-scroll" }, svg), panel), el("div", { class: "btn-row" }, back, next, auto), note);
    const prog = [{ a: 4, ins: "LOAD 9", exec: (s) => { s.acc = 12; return "Execute: copy the value at address 09 (12) into the accumulator."; } },
      { a: 5, ins: "ADD 10", exec: (s) => { s.acc += 7; return "Execute: the ALU adds the value at address 10 (7) to the accumulator, giving 19."; } },
      { a: 6, ins: "STORE 11", exec: (s) => { s.store = s.acc; return "Execute: write the accumulator (19) to address 11. Writing uses the write line instead of the read line."; } }];
    const DRILL = [
      ["📣", "The captain calls out a locker number.", "address bus"],
      ["🎶", "The bosun's pipe sounds: “Fetch!”", "read line"],
      ["🏃", "A powder monkey runs the cartridge up from the magazine.", "data bus"],
      ["💥", "The gun captain reads the cartridge label, then the crew loads and fires.", "decode & execute"],
    ];
    // build the full step list
    const steps = [];
    const st = { pc: 4, acc: 0, ir: "—", store: 0 };
    prog.forEach((p) => {
      steps.push({ k: 0, p, txt: `<b>1. Address bus.</b> The processor puts the address <b>${String(p.a).padStart(2, "0")}</b> (from the program counter) on the address bus. The address travels one way, to memory.` });
      steps.push({ k: 1, p, txt: "<b>2. Control bus.</b> The processor activates the <b>read line</b> on the control bus, so memory knows to send the contents of that location." });
      steps.push({ k: 2, p, txt: `<b>3. Data bus.</b> The instruction <code>${p.ins}</code> travels back along the data bus and is stored in the <b>instruction register</b>. The program counter moves on to the next address.` });
      steps.push({ k: 3, p, txt: `<b>4. Decode and execute.</b> The decoder interprets <code>${p.ins}</code>. ` });
    });
    let i = -1, timer = null, anim = 0;
    // Move a labelled token along bus k, towards memory (toMem) or back to the processor.
    function token(k, toMem, label, colour, done) {
      const g = svg.querySelector("#fx-token");
      cancelAnimationFrame(anim);
      const [bx1, by1, bx2, by2] = BUS[k];
      const len = Math.hypot(bx2 - bx1, by2 - by1), inset = len < 150 ? 18 : 42, ux = (bx2 - bx1) / len, uy = (by2 - by1) / len;
      const p0 = [bx1 + ux * inset, by1 + uy * inset], p1 = [bx2 - ux * inset, by2 - uy * inset];
      const [from, to] = toMem ? [p0, p1] : [p1, p0];
      const t0 = performance.now(), dur = HC.reduced ? 1 : 800;
      const step = (now) => {
        const f = Math.min(1, (now - t0) / dur), e = f < .5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2;
        const x = from[0] + (to[0] - from[0]) * e, y = from[1] + (to[1] - from[1]) * e;
        g.innerHTML = `<rect x="${x - 36}" y="${y - 13}" width="72" height="26" rx="3" fill="${colour}" stroke="#000" stroke-opacity=".3"/><text x="${x}" y="${y + 5}" text-anchor="middle" font-size="12" fill="#fff" class="mono">${label}</text>`;
        if (f < 1) anim = requestAnimationFrame(step); else if (done) done();
      };
      anim = requestAnimationFrame(step);
    }
    function render() {
      // recompute state from scratch up to step i (so Back works)
      const s = { pc: 4, acc: 0, ir: "—", store: 0, last: "" };
      for (let j = 0; j <= i; j++) {
        const sj = steps[j];
        if (sj.k === 2) { s.ir = sj.p.ins; s.pc = sj.p.a + 1; }
        if (sj.k === 3) s.last = sj.p.exec(s);
      }
      svg.querySelector("#fx-pc").textContent = String(s.pc).padStart(2, "0");
      svg.querySelector("#fx-ir").textContent = s.ir;
      svg.querySelector("#fx-acc").textContent = s.acc;
      svg.querySelector("#fx-m11").querySelectorAll("text")[1].textContent = s.store;
      svg.querySelectorAll("[id^=fx-m] rect").forEach((r) => r.setAttribute("fill", "var(--paper)"));
      svg.querySelector("#fx-ctl").setAttribute("stroke", "#8e6cc1");
      ["#fx-cu", "#fx-alu"].forEach((q) => svg.querySelector(q).setAttribute("fill", "var(--paper)"));
      svg.querySelector("#fx-token").innerHTML = "";
      const cur = steps[i];
      if (!cur) {
        note.innerHTML = "The program in memory starts at address 04. Press <b>Next step</b> to fetch the first instruction.";
        panel.innerHTML = DRILL.map((d) => `<div class="fx-d"><span>${d[0]}</span><div>${d[1]}<small>${d[2]}</small></div></div>`).join("");
      } else {
        const m = svg.querySelector("#fx-m" + cur.p.a + " rect");
        if (cur.k >= 0) m.setAttribute("fill", "color-mix(in srgb, #5b8fc7 30%, var(--paper))");
        if (cur.k === 0) token(0, true, String(cur.p.a).padStart(2, "0"), "#3e6fa8");
        if (cur.k === 1) { svg.querySelector("#fx-ctl").setAttribute("stroke", "#e0b23a"); token(2, true, "READ", "#6b4fa0"); }
        if (cur.k === 2) token(1, false, cur.p.ins, "#3d7022");
        if (cur.k === 3) { svg.querySelector("#fx-cu").setAttribute("fill", "color-mix(in srgb, #e0b23a 40%, var(--paper))"); if (cur.p.ins.startsWith("ADD")) svg.querySelector("#fx-alu").setAttribute("fill", "color-mix(in srgb, #b3261e 30%, var(--paper))"); }
        note.innerHTML = cur.txt + (cur.k === 3 ? s.last : "") + `<br><span class="hint">Instruction ${prog.indexOf(cur.p) + 1} of 3 · step ${cur.k + 1} of 4</span>`;
        panel.innerHTML = DRILL.map((d, k) => `<div class="fx-d${k === cur.k ? " on" : ""}"><span>${d[0]}</span><div>${d[1]}<small>${d[2]}</small></div></div>`).join("");
      }
      back.disabled = i < 0; next.disabled = i >= steps.length - 1;
    }
    const stop = () => { clearInterval(timer); timer = null; auto.textContent = "▶ Auto"; };
    narrowMq.addEventListener("change", () => { cancelAnimationFrame(anim); layout(); render(); });
    back.addEventListener("click", () => { stop(); i = Math.max(-1, i - 1); render(); });
    next.addEventListener("click", () => { stop(); i = Math.min(steps.length - 1, i + 1); render(); });
    auto.addEventListener("click", () => {
      if (timer) return stop();
      if (i >= steps.length - 1) i = -1;
      auto.textContent = "❚❚ Pause";
      timer = setInterval(() => { if (i < steps.length - 1) { i++; render(); } else stop(); }, 2600);
      i++; render();
    });
    render();
  }

  /* ============ Performance simulator ============ */
  function perf(box) {
    const sel = (label, opts, def) => {
      const s = el("select", { "aria-label": label }, ...opts.map(([v, t]) => el("option", { value: v, selected: v === def ? true : null }, t)));
      return [el("label", null, label + " ", s), s];
    };
    const [l1, cores] = sel("Cores", [["1", "1 (single)"], ["2", "2 (dual)"], ["4", "4 (quad)"], ["8", "8 (octa)"]], "1");
    const [l2, bus] = sel("Data bus", [["16", "16 lines"], ["32", "32 lines"], ["64", "64 lines"]], "32");
    const [l3, cache] = sel("Cache", [["0", "none"], ["0.8", "small (80% hits)"], ["0.95", "large (95% hits)"]], "0");
    const [l4, clock] = sel("Clock", [["1", "1.0 GHz"], ["2", "2.0 GHz"], ["3.5", "3.5 GHz"], ["5", "5.0 GHz"]], "2");
    const fire = el("button", { class: "btn primary", type: "button" }, "💥 Fire broadside");
    const deck = el("div", { class: "perf-deck", "aria-hidden": "true" });
    const bar = el("div", { class: "perf-bar" }, el("span"));
    const res = el("div", { class: "output-box", "aria-live": "polite" });
    const hist = el("div", { class: "table-wrap" });
    box.append(el("div", { class: "btn-row" }, l1, l2, l3, l4), el("div", { class: "btn-row" }, fire), deck, bar, res, hist);
    const runs = [];
    const N = 2000, P = 0.75; // 75% of the work can be shared between cores
    function model() {
      const c = +cores.value, w = +bus.value, h = +cache.value, f = +clock.value;
      const transfers = 64 / w;            // each instruction needs 64 bits moved from memory
      const cpi = 1 + h * 2 + (1 - h) * transfers * 20;  // cycles per instruction: execute + cache or RAM
      const speedup = 1 / ((1 - P) + P / c);
      const cycles = (N * cpi) / speedup;
      const us = cycles / (f * 1000);       // f GHz = f*1000 cycles per microsecond
      return { c, w, h, f, cpi, speedup, us };
    }
    function show() {
      const m = model();
      deck.innerHTML = Array.from({ length: m.c }, (_, k) => `<span class="gun" style="animation-delay:${k * 80}ms"><svg viewBox="0 0 40 24" width="56" height="34" shape-rendering="crispEdges"><rect x="2" y="6" width="26" height="8" fill="#3a3a3a"/><rect x="26" y="7" width="6" height="6" fill="#2a2a2a"/><rect x="32" y="4" width="8" height="12" class="flash" fill="transparent"/><rect x="6" y="14" width="18" height="5" fill="#7a5532"/><rect x="6" y="19" width="5" height="5" fill="#4a3522"/><rect x="19" y="19" width="5" height="5" fill="#4a3522"/></svg><small>core ${k + 1}</small></span>`).join("");
    }
    [cores, bus, cache, clock].forEach((s) => s.addEventListener("change", show));
    fire.addEventListener("click", () => {
      const m = model();
      runs.unshift(m); if (runs.length > 6) runs.pop();
      const fill = bar.firstChild;
      const ms = HC.reduced ? 0 : Math.min(4000, 150 + m.us * 60);
      fill.style.transition = "none"; fill.style.width = "0";
      void fill.offsetWidth;
      fill.style.transition = `width ${ms}ms linear`; fill.style.width = "100%";
      deck.classList.add("firing"); setTimeout(() => deck.classList.remove("firing"), ms);
      res.innerHTML = `Time for ${N} instructions: <b>${m.us.toFixed(1)} µs</b>\n` +
        `Average cycles per instruction: ${m.cpi.toFixed(2)} (${m.h ? Math.round(m.h * 100) + "% of fetches hit the cache" : "every fetch goes to main memory"}, ${64 / m.w} bus transfer${m.w === 64 ? "" : "s"} per memory fetch)\n` +
        `Cores: ×${m.speedup.toFixed(2)} speed-up from ${m.c} core${m.c > 1 ? "s" : ""}${m.c > 1 ? `, not ×${m.c}, because a quarter of the work can't be shared between cores` : ""}\n` +
        `(Cycles per instruction = clock ticks each instruction takes on average; fewer is faster. With a ${m.w}-line data bus, each 64-bit item from memory takes ${64 / m.w} trip${m.w === 64 ? "" : "s"}.)`;
      hist.innerHTML = `<table><caption>Your last runs (newest first)</caption><thead><tr><th>Cores</th><th>Bus</th><th>Cache hits</th><th>Clock</th><th class="num">Time (µs)</th></tr></thead><tbody>${runs.map((r) => `<tr><td>${r.c}</td><td>${r.w}</td><td>${Math.round(r.h * 100)}%</td><td>${r.f} GHz</td><td class="num">${r.us.toFixed(1)}</td></tr>`).join("")}</tbody></table>`;
    });
    show();
  }

  /* ============ DoS harbour simulation ============ */
  function dos(box) {
    const W = 680, H = 260;
    const cv = el("canvas", { width: W, height: H, role: "img", "aria-label": "Simulation of genuine visitors and attack traffic reaching a web server. Statistics are given in text below." });
    const mode = el("select", { "aria-label": "Attack type" },
      el("option", { value: "none" }, "No attack: a normal day"),
      el("option", { value: "bandwidth" }, "Bandwidth consumption"),
      el("option", { value: "starve" }, "Resource starvation"),
      el("option", { value: "dns" }, "DNS attack"));
    const pause = el("button", { class: "btn small", type: "button" }, "❚❚ Pause");
    const stats = el("p", { class: "output-box" });
    const summary = el("p", { class: "sr-only", "aria-live": "polite" });
    const expl = el("p", { class: "hint" });
    const legend = el("p", { class: "hint" });
    legend.innerHTML = 'Key: <span class="sw" style="background:#2f6fb5"></span> <b>blue</b> = genuine visitor requests &nbsp; <span class="sw" style="background:#d33a2c"></span> <b>red</b> = attacker traffic &nbsp; <span class="sw" style="background:#4f8a2e"></span> <b>green</b> = answered requests / server connection slots. Choose an attack from the <b>Scenario</b> list.';
    box.append(el("div", { class: "btn-row" }, el("label", null, "Scenario ", mode), pause), el("div", { class: "diagram-scroll" }, cv), legend, stats, summary, expl);
    const ctx = cv.getContext("2d");
    let parts = [], served = 0, failed = 0, slots = [], running = !HC.reduced, t = 0, raf = 0, lastT = 0, lastStat = 0, lastSay = 0;
    if (!running) pause.textContent = "▶ Play";
    const LINK = { x0: 170, x1: 470, y: 130 };
    const SERVER = { x: 520, y: 70, w: 120, h: 120, cap: 6 };
    const EXPL = {
      none: "Genuine visitors (blue) send requests across the network link to the fort's server, which answers them all.",
      bandwidth: "Attackers (red) flood the network link with traffic. The link can only carry so much at once, so genuine requests are squeezed out and lost before they reach the server.",
      starve: "Attackers open connections and never finish them. Each one holds a connection slot on the server until it times out, and the slots run out, so genuine visitors are refused even though the link is clear.",
      dns: "The DNS server (lighthouse) that turns the fort's name into its IP address is knocked out. Visitors can't find the fort at all, and the server sits idle.",
    };
    function reset() { parts = []; served = 0; failed = 0; slots = []; expl.textContent = EXPL[mode.value]; summary.textContent = mode.options[mode.selectedIndex].text + ". " + EXPL[mode.value]; }
    mode.addEventListener("change", reset);
    pause.addEventListener("click", () => { running = !running; pause.textContent = running ? "❚❚ Pause" : "▶ Play"; if (running) { lastT = performance.now(); raf = requestAnimationFrame(loop); } });
    function spawn(dt) {
      const m = mode.value;
      if (Math.random() < dt * 3) parts.push({ x: 30, y: 60 + Math.random() * 140, good: true, v: 120 + Math.random() * 40, st: m === "dns" ? "lost-dns" : "go" });
      if (m === "bandwidth" && Math.random() < dt * 45) parts.push({ x: 30, y: 40 + Math.random() * 180, good: false, v: 160 + Math.random() * 80, st: "go" });
      if (m === "starve" && Math.random() < dt * 4) parts.push({ x: 30, y: 60 + Math.random() * 140, good: false, v: 140, st: "go", half: true });
    }
    function step(dt) {
      t += dt; spawn(dt);
      const onLink = parts.filter((p) => p.x > LINK.x0 && p.x < LINK.x1 && p.st === "go").length;
      const linkCap = 22;
      for (const p of parts) {
        if (p.st === "lost-dns") { p.x += p.v * dt * 0.6; if (p.x > 140) { p.st = "fail"; failed++; p.age = 0; } continue; }
        if (p.st === "go") {
          const ny = LINK.y + (p.y - LINK.y) * Math.max(0, 1 - (p.x - LINK.x0) / 80);
          p.y += ((p.x > LINK.x0 - 20 ? ny : p.y) - p.y) * Math.min(1, dt * 6);
          p.x += p.v * dt;
          if (p.x > LINK.x0 && p.x < LINK.x0 + 10 && onLink > linkCap && Math.random() < 0.5) { p.st = "drop"; p.age = 0; if (p.good) failed++; continue; }
          if (p.x >= SERVER.x) {
            if (p.half) { if (slots.length < SERVER.cap) { slots.push({ ttl: 6, bad: true }); p.st = "in"; } else p.st = "gone"; continue; }
            if (!p.good) { p.st = "gone"; continue; }
            if (slots.length < SERVER.cap) { slots.push({ ttl: 0.4, bad: false }); served++; p.st = "back"; p.v = -140; }
            else { p.st = "drop"; p.age = 0; failed++; }
          }
        } else if (p.st === "back") { p.x += p.v * dt; if (p.x < 30) p.st = "gone"; }
        else if (p.st === "drop" || p.st === "fail") { p.age += dt; p.y += 40 * dt; if (p.age > 1) p.st = "gone"; }
      }
      slots.forEach((s) => (s.ttl -= dt));
      slots = slots.filter((s) => s.ttl > 0);
      parts = parts.filter((p) => p.st !== "gone" && p.st !== "in");
    }
    let colCache = null;
    document.addEventListener("hc-theme", () => (colCache = null));
    const css = (v) => {
      if (!colCache) colCache = {};
      if (!(v in colCache)) colCache[v] = getComputedStyle(document.documentElement).getPropertyValue(v).trim() || "#888";
      return colCache[v];
    };
    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = css("--paper-2"); ctx.fillRect(0, 0, W, H);
      // sea + link
      ctx.strokeStyle = "#5b8fc7"; ctx.lineWidth = 26; ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.moveTo(LINK.x0, LINK.y); ctx.lineTo(LINK.x1 + 50, LINK.y); ctx.stroke(); ctx.globalAlpha = 1;
      // when the canvas is shrunk to fit a phone, draw the labels larger so they stay readable
      const fs = Math.round(12 * Math.min(1.8, Math.max(1, (W / (cv.clientWidth || W)) * 0.8)));
      const nar = fs > 14;
      ctx.fillStyle = css("--ink"); ctx.font = `${fs}px 'Atkinson Hyperlegible', sans-serif`;
      ctx.fillText("network link", LINK.x0 + 100, LINK.y - 20);
      ctx.fillText("visitors", 20, 24);
      // server fort
      ctx.fillStyle = "#6b6b6b"; ctx.fillRect(SERVER.x, SERVER.y, SERVER.w, SERVER.h);
      for (let k = 0; k < 6; k++) ctx.fillRect(SERVER.x + k * 22, SERVER.y - 10, 12, 10);
      ctx.fillStyle = "#fff"; ctx.fillText(nar ? "server" : "web server", SERVER.x + (nar ? 30 : 26), SERVER.y + 18);
      for (let k = 0; k < SERVER.cap; k++) {
        const s = slots[k];
        ctx.fillStyle = s ? (s.bad ? "#b3261e" : "#4f8a2e") : "#3a3a3a";
        ctx.fillRect(SERVER.x + 12 + (k % 3) * 34, SERVER.y + 34 + Math.floor(k / 3) * 34, 28, 28);
      }
      ctx.fillStyle = "#fff"; ctx.fillText(nar ? "slots" : "connection slots", SERVER.x + (nar ? 38 : 14), SERVER.y + 112);
      // DNS lighthouse
      const dnsDown = mode.value === "dns";
      ctx.fillStyle = dnsDown ? "#555" : "#e0b23a"; ctx.fillRect(130, 200, 18, 44); ctx.fillStyle = dnsDown ? "#b3261e" : "#fff6c2"; ctx.fillRect(126, 190, 26, 12);
      ctx.fillStyle = css("--ink"); ctx.fillText(dnsDown ? "DNS ✘ down" : "DNS", 156, 236);
      for (const p of parts) {
        ctx.globalAlpha = p.st === "drop" || p.st === "fail" ? Math.max(0, 1 - p.age) : 1;
        ctx.fillStyle = p.good ? (p.st === "back" ? "#4f8a2e" : "#2f6fb5") : "#d33a2c";
        ctx.fillRect(p.x - 4, p.y - 4, 8, 8);
        if ((p.st === "drop" || p.st === "fail") && p.good) { ctx.fillStyle = "#d33a2c"; ctx.fillText("✘", p.x + 6, p.y); }
      }
      ctx.globalAlpha = 1;
    }
    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      step(dt * (HC.reduced ? 0.5 : 1)); draw();
      if (now - lastStat > 500) {
        lastStat = now;
        const tot = served + failed;
        stats.textContent = `Genuine requests answered: ${served}   failed: ${failed}   success rate: ${tot ? Math.round((served / tot) * 100) + "%" : "–"}` + (mode.value !== "none" && tot > 10 && served / tot < 0.6 ? "  → symptoms: slow or no access" : "");
        if (now - lastSay > 8000 && tot > 10) { lastSay = now; summary.textContent = `Success rate ${Math.round((served / tot) * 100)} percent.`; }
      }
      raf = requestAnimationFrame(loop);
    }
    // only animate while visible
    const io = "IntersectionObserver" in window ? new IntersectionObserver((e) => {
      if (e[0].isIntersecting && running) { lastT = performance.now(); cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
      else cancelAnimationFrame(raf);
    }) : null;
    reset(); draw();
    if (io) io.observe(cv); else if (running) { lastT = performance.now(); raf = requestAnimationFrame(loop); }
    if (!running) { for (let k = 0; k < 120; k++) step(0.05); draw(); }
  }

  /* ============ Key-pair storyboards ============ */
  function crypto(box) {
    const KEY = (x, y, col, lab) => `<g transform="translate(${x} ${y})"><circle cx="8" cy="8" r="7" fill="none" stroke="${col}" stroke-width="4"/><path d="M15 8 H40 M32 8 V15 M38 8 V13" stroke="${col}" stroke-width="4"/><text x="0" y="30" font-size="11" fill="${col}" font-weight="700">${lab}</text></g>`;
    const PERSON = (x, name, emoji) => `<g><text x="${x}" y="70" font-size="40" text-anchor="middle">${emoji}</text><text x="${x}" y="96" font-size="13" text-anchor="middle" class="ink" font-weight="700">${name}</text></g>`;
    const SCROLL = (x, y, txt, col = "#f4ecd8", seal) => `<g transform="translate(${x} ${y})"><rect width="150" height="44" rx="6" fill="${col}" stroke="#7a5532" stroke-width="2"/><text x="75" y="27" text-anchor="middle" font-size="12" class="mono" fill="#2b2216">${txt}</text>${seal ? `<circle cx="150" cy="44" r="11" fill="${seal}" stroke="#5a1410" stroke-width="2"/>` : ""}</g>`;
    const BLUE = "var(--sky)", RED = "var(--redstone)", GOLD = "var(--gold)";
    const base = (inner) => `<svg viewBox="0 0 640 230" role="img" aria-hidden="true"><rect x="0" y="0" width="640" height="230" fill="var(--paper-2)"/><path d="M0 200 Q80 190 160 200 T320 200 T480 200 T640 200 V230 H0 Z" fill="#5b8fc7" opacity=".35"/>${inner}</svg>`;
    const SC = {
      secret: [
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(520, 120, BLUE, "his PUBLIC key") + KEY(520, 160, RED, "his PRIVATE key"), "The captain has a matched pair of keys. His <b>public key</b> is pinned to the mast for anyone to copy. His <b>private key</b> never leaves his cabin."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(40, 120, BLUE, "captain's PUBLIC key") + SCROLL(160, 40, "Fleet sails at dawn"), "Ailsa wants to send <i>“Fleet sails at dawn”</i>. She takes a copy of the <b>captain's public key</b>…"],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + SCROLL(160, 40, "x9#Qm!2@Lr*wZ", "#d7cbb0") + `<text x="235" y="110" font-size="28" text-anchor="middle">🔒</text>`, "…and <b>encrypts</b> the message with it. The result is ciphertext: unreadable without the matching <b>private</b> key."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + PERSON(320, "Le Renard (spy)", "🦊") + SCROLL(245, 120, "x9#Qm!2@Lr*wZ", "#d7cbb0") + KEY(400, 40, BLUE, "public key: useless"), "A spy intercepts it on the way. He has the public key too (everyone does), but a public key <b>cannot decrypt</b> what it encrypted. He sees only gibberish."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(520, 120, RED, "his PRIVATE key") + SCROLL(330, 40, "Fleet sails at dawn") + `<text x="300" y="70" font-size="26">🔓</text>`, "The captain <b>decrypts</b> with his <b>private key</b>, the only key in the world that can. The message stayed confidential the whole way."],
      ],
      signature: [
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(40, 120, BLUE, "Ailsa's PUBLIC key") + KEY(40, 160, RED, "Ailsa's PRIVATE key"), "This time Ailsa needs to prove that the order comes from <b>her</b>, and that nobody has changed it. She uses <b>her own</b> key pair."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(40, 120, RED, "Ailsa's PRIVATE key") + SCROLL(160, 40, "Fleet sails at dawn", undefined, RED), "Software works out a short summary (a <i>hash</i>) of the message. Ailsa encrypts that summary with her <b>private key</b>. This is her <b>digital signature</b>, the wax seal attached to the message."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + KEY(470, 120, BLUE, "Ailsa's PUBLIC key") + SCROLL(300, 40, "Fleet sails at dawn", undefined, RED) + `<text x="320" y="125" font-size="14" fill="var(--grass)" font-weight="700">✔ seal matches</text>`, "The captain decrypts the signature with <b>Ailsa's public key</b> and compares it with his own summary of the message. They match, so it <b>must</b> have come from Ailsa and it is <b>unaltered</b>."],
        [PERSON(80, "Cadet Ailsa", "🧑‍✈️") + PERSON(560, "Capt. Blackwood", "🧔") + PERSON(320, "Le Renard (spy)", "🦊") + SCROLL(245, 120, "Fleet sails at dusk", undefined, RED) + `<text x="415" y="150" font-size="14" fill="var(--redstone)" font-weight="700">✘ seal doesn't match!</text>`, "If the spy changes <i>dawn</i> to <i>dusk</i>, the summary no longer matches the signature, and he can't make a new one without Ailsa's <b>private</b> key. <b>Tampering is detected.</b> (A signature proves origin and integrity. It does not hide the message.)"],
      ],
      cert: [
        [PERSON(80, "Your browser", "🧭") + PERSON(560, "redstone.example", "🏰") + KEY(520, 120, BLUE, "site's PUBLIC key"), "You visit <code>https://redstone.example</code>. It sends its public key, but how do you know a fake site isn't pretending to be Redstone?"],
        [PERSON(320, "Certificate Authority", "🏛️") + PERSON(560, "redstone.example", "🏰") + `<g transform="translate(230 110)"><rect width="180" height="86" rx="4" fill="#fffaf0" stroke="${GOLD}" stroke-width="3"/><text x="10" y="20" font-size="11" class="mono">Name: redstone.example</text><text x="10" y="36" font-size="11" class="mono">Public key: 🔑 3f:a2:…</text><text x="10" y="52" font-size="11" class="mono">Expires: 2027-03-01</text><text x="10" y="68" font-size="11" class="mono">Serial: 0451…</text><circle cx="160" cy="70" r="12" fill="${GOLD}"/></g>`, "Earlier, the site proved its identity to a trusted <b>Certificate Authority</b> (CA), the Admiralty of the web. The CA issued a <b>digital certificate</b> holding the site's name, its public key, an expiry date and a serial number, all <b>signed with the CA's private key</b>."],
        [PERSON(80, "Your browser", "🧭") + PERSON(560, "redstone.example", "🏰") + KEY(40, 120, GOLD, "CA public keys (built in)") + `<text x="262" y="100" font-size="14" text-anchor="middle" fill="var(--grass)" font-weight="700"><tspan x="262">✔ CA signature valid</tspan><tspan x="262" dy="20">✔ name matches</tspan><tspan x="262" dy="20">✔ not expired</tspan></text>`, "Your browser already holds the public keys of trusted CAs. It checks the certificate's signature, that the name matches the address, and that the certificate hasn't expired."],
        [PERSON(80, "Your browser", "🧭") + PERSON(560, "redstone.example", "🏰") + `<text x="320" y="70" font-size="36" text-anchor="middle">🔒</text><text x="320" y="110" font-size="13" text-anchor="middle" class="ink">encrypted HTTPS connection</text>`, "Now the browser trusts the public key, and it uses it to set up an encrypted connection: the padlock. A forged certificate would fail the check and trigger a big warning."],
      ],
    };
    const FOCUS = {secret: [480, 160, 200, 370, 450], signature: [110, 170, 430, 400], cert: [480, 320, 176, 320]};
    const tabs = el("div", { class: "btn-row", role: "group", "aria-label": "Scenario" });
    const stage = el("div", { class: "diagram-scroll crypto-stage" });
    const cap = el("p", { class: "stepper-note", "aria-live": "polite" });
    const back = el("button", { class: "btn small", type: "button" }, "◀ Back");
    const next = el("button", { class: "btn small primary", type: "button" }, "Next ▶");
    const pos = el("span", { class: "hint", style: "margin:0" });
    let cur = "secret", i = 0;
    const names = { secret: "🔐 Secret message", signature: "🖋 Digital signature", cert: "📜 Digital certificate" };
    const tb = {};
    Object.keys(SC).forEach((k) => {
      const b = el("button", { class: "btn small", type: "button", "aria-pressed": "false" }, names[k]);
      b.addEventListener("click", () => { cur = k; i = 0; render(); });
      tb[k] = b; tabs.append(b);
    });
    box.append(tabs, stage, cap, el("div", { class: "btn-row" }, back, next, pos));
    function render() {
      const [svg, txt] = SC[cur][i];
      stage.innerHTML = base(svg);
      // On a phone the scene is wider than the screen: scroll to the part this step is about.
      const over = stage.scrollWidth - stage.clientWidth;
      if (over > 2) {
        const fx = FOCUS[cur][i] / 640 * stage.scrollWidth - stage.clientWidth / 2;
        stage.scrollTo({ left: Math.max(0, Math.min(over, fx)), behavior: HC.reduced ? "auto" : "smooth" });
      }
      cap.innerHTML = txt;
      pos.textContent = `Scene ${i + 1} of ${SC[cur].length}`;
      back.disabled = i === 0; next.disabled = i === SC[cur].length - 1;
      Object.entries(tb).forEach(([k, b]) => { b.setAttribute("aria-pressed", k === cur ? "true" : "false"); b.classList.toggle("primary", k === cur); });
    }
    back.addEventListener("click", () => { i--; render(); });
    next.addEventListener("click", () => { i++; render(); });
    render();
    // the arithmetic, for the curious (beyond Higher)
    const det = el("details", { class: "rsa" }, el("summary", null, "Beyond Higher: try real public-key maths with tiny numbers"));
    const m = el("input", { type: "number", min: 0, max: 3232, value: 1805, "aria-label": "Message number", style: "width:7em" });
    const o = el("div", { class: "output-box", "aria-live": "polite" });
    det.append(el("p", null, "RSA with toy primes p = 61 and q = 53: n = 3233, public key e = 17, private key d = 2753. Real keys use numbers hundreds of digits long."), el("label", null, "Message (a number below 3233) ", m), o);
    box.append(det);
    const pw = (b, e, n) => { let r = 1n; b %= n; while (e > 0n) { if (e & 1n) r = (r * b) % n; b = (b * b) % n; e >>= 1n; } return r; };
    const upd = () => {
      const x = BigInt(Math.max(0, Math.min(3232, Math.trunc(+m.value) || 0)));
      const c = pw(x, 17n, 3233n), back2 = pw(c, 2753n, 3233n);
      o.innerHTML = `encrypt with the PUBLIC key:  ${x}^17 mod 3233 = <b>${c}</b>\ndecrypt with the PRIVATE key: ${c}^2753 mod 3233 = <b>${back2}</b> ✔`;
    };
    m.addEventListener("input", upd); upd();
  }

  function init() {
    const map = { "w-twos": twos, "w-float": floatW, "w-tradeoff": tradeoff, "w-unicode": unicode, "w-graphics": graphics, "w-fetch": fetchW, "w-perf": perf, "w-dos": dos, "w-crypto": crypto };
    for (const [id, fn] of Object.entries(map)) {
      const box = document.getElementById(id);
      if (box) try { fn(box); } catch (e) { console.error(id, e); box.append(el("p", { class: "bad" }, "This interactive failed to load.")); }
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
