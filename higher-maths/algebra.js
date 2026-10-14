/* Algebra & functions — the widgets in the purser's office.
   Every number a widget shows is computed from the same rules the text teaches. */
(function () {
  "use strict";
  const HM = window.HM;
  const $ = (id) => document.getElementById(id);
  const N = HM.n;
  const niceStep = HM.niceStep;

  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const canvasIn = (box, label) => { const c = HM.el("canvas", { class: "sim", role: "img", "aria-label": label }); box.append(c); return c; };
  const texBox = (box) => { const d = HM.el("div", { class: "tex-out", "aria-live": "polite" }); box.append(d); return d; };
  const controls = (box) => { const d = HM.el("div", { class: "sim-controls" }); box.append(d); return d; };
  const polyTex = HM.polyTex;
  /* (x − r) as TeX */
  const linTex = (r) => (r === 0 ? "x" : r > 0 ? `(x - ${N(r, 3)})` : `(x + ${N(-r, 3)})`);

  /* =====================================================================
     1. Synthetic division, step by step, plus a root hunter
     ===================================================================== */
  mount("w-synth", (box) => {
    const row = HM.el("div", { class: "btn-row" });
    const cIn = HM.el("input", { type: "text", class: "math-in", value: "2, 1, -13, 6", "aria-label": "Coefficients, highest power first, separated by commas", style: "width:12em" });
    const rIn = HM.el("input", { type: "number", class: "math-in", value: "2", step: "1", "aria-label": "Trial root" });
    const step = HM.el("button", { class: "btn small primary", type: "button" }, "Step ▶");
    const all = HM.el("button", { class: "btn small", type: "button" }, "Show all");
    const hunt = HM.el("button", { class: "btn small", type: "button" }, "Hunt for roots");
    row.append(HM.el("label", null, "Coefficients ", cIn), HM.el("label", null, "Trial root ", rIn), step, all, hunt);
    box.append(row);
    const tableWrap = HM.el("div", { class: "synth-wrap" });
    const note = HM.el("p", { class: "sim-note", "aria-live": "polite" });
    const out = texBox(box);
    box.insertBefore(tableWrap, out); box.insertBefore(note, out);
    let cs = [], r = 0, k = 0, prods = [], sums = [];
    function parse() {
      const v = cIn.value.split(/[,\s]+/).filter(Boolean).map(Number);
      if (v.length < 2 || v.some((x) => !isFinite(x)) || v[0] === 0) return null;
      return v;
    }
    function reset() {
      const v = parse();
      if (!v) { note.textContent = "Type at least two numbers, separated by commas, with a non-zero first coefficient."; tableWrap.innerHTML = ""; out.innerHTML = ""; return false; }
      cs = v; r = +rIn.value || 0; k = 0;
      sums = [cs[0]]; prods = [null];
      for (let i = 1; i < cs.length; i++) { prods.push(sums[i - 1] * r); sums.push(cs[i] + prods[i]); }
      out.innerHTML = HM.tex(`f(x) = ${polyTex(cs)}`, true);
      draw(); return true;
    }
    function draw() {
      // the table: trial root | coefficients / products / sums. Shown up to step k.
      const n = cs.length;
      const g = HM.el("div", { class: "synth", style: `grid-template-columns: repeat(${n + 1}, auto)`, role: "table", "aria-label": "Synthetic division table" });
      const cell = (t, cls) => HM.el("div", { class: "synth-cell" + (cls ? " " + cls : ""), role: "cell" }, t);
      g.append(cell(N(r, 3), "k"), ...cs.map((c) => cell(N(c, 3))));
      g.append(cell("", "k"), ...cs.map((c, i) => cell(i && i <= k ? N(prods[i], 3) : "", i === k && k > 0 ? "hot" : "")));
      g.append(cell("", "k sum"), ...cs.map((c, i) => {
        const shown = i <= k - (k === 0 ? 1 : 0) || (i === 0 && k >= 0);
        const isRem = i === n - 1;
        const cls = "sum" + (i === k ? " hot" : "") + (isRem && shown && k >= n - 1 ? " rem" + (Math.abs(sums[i]) < 1e-9 ? " zero" : "") : "");
        return cell(i <= k ? N(sums[i], 3) : "", cls);
      }));
      tableWrap.innerHTML = ""; tableWrap.append(g);
      // narration
      if (k === 0) note.innerHTML = `Bring down the first coefficient, <b>${N(cs[0], 3)}</b>.`;
      else note.innerHTML = `Multiply ${N(sums[k - 1], 3)} by the trial root ${N(r, 3)}: <b>${N(prods[k], 3)}</b>. Add it to ${N(cs[k], 3)}: <b>${N(sums[k], 3)}</b>.`;
      if (k === n - 1) {
        const rem = sums[n - 1];
        const q = sums.slice(0, n - 1);
        if (Math.abs(rem) < 1e-9) {
          note.innerHTML += ` The remainder is <b>0</b>, so $${linTex(r)}$ is a factor and $f(${N(r, 3)}) = 0$.`;
          out.innerHTML = HM.tex(`f(x) = ${polyTex(cs)} = ${linTex(r)}\\left(${polyTex(q)}\\right)`, true) + factorNote(q);
        } else {
          note.innerHTML += ` The remainder is <b>${N(rem, 3)}</b>, not 0, so $${linTex(r)}$ is <em>not</em> a factor. (The remainder theorem says $f(${N(r, 3)}) = ${N(rem, 3)}$.)`;
          out.innerHTML = HM.tex(`f(x) = ${linTex(r)}\\left(${polyTex(q)}\\right) ${rem < 0 ? "-" : "+"} ${N(Math.abs(rem), 3)}`, true);
        }
        HM.math(note);
      }
      step.disabled = k >= n - 1;
    }
    function factorNote(q) {
      if (q.length !== 3) return q.length > 3 ? `<p class="hint" style="margin:4px 0 0">The quotient is still degree ${q.length - 1}: test it for another root.</p>` : "";
      const [a, b, c] = q, d = b * b - 4 * a * c;
      if (d < -1e-9) return HM.el("p", { class: "hint", style: "margin:4px 0 0", html: `Quadratic factor: $b^2 - 4ac = ${N(d, 3)} \\lt 0$, so it has no real roots and cannot be factorised further.` }).outerHTML;
      const P = (h) => `<p class="hint" style="margin:4px 0 0">${h}</p>`;
      const nice = (x) => { for (let k = 1; k <= 24; k++) if (Math.abs(x * k - Math.round(x * k)) < 1e-9) return true; return false; };
      const F = (x) => HM.tex(HM.fracTex(x, 24));
      // list the roots of f(x) = 0, counting repeats: "1 (twice) and -2"
      const all = (rs) => { const u = []; rs.forEach((x) => { const e = u.find((o) => Math.abs(o.x - x) < 1e-9); e ? e.n++ : u.push({ x, n: 1 }); });
        const w = u.map((o) => (nice(o.x) ? F(o.x) : HM.tex(N(o.x, 3))) + ["", "", " (twice)", " (three times)"][o.n]);
        return w.length === 1 ? w[0] : w.slice(0, -1).join(", ") + " and " + w[w.length - 1]; };
      if (Math.abs(d) < 1e-9) {
        const r0 = -b / (2 * a);
        return P(`Quadratic factor: $b^2 - 4ac = 0$, so it has a repeated root ${nice(r0) ? F(r0) : HM.tex(N(r0, 3))}. The roots of $f(x) = 0$ are ${all([r, r0, r0])}.`);
      }
      const s = Math.sqrt(d), r1 = (-b + s) / (2 * a), r2 = (-b - s) / (2 * a);
      if (nice(r1) && nice(r2)) return P(`The quadratic factor has roots ${F(r1)} and ${F(r2)}, so the roots of $f(x) = 0$ are ${all([r, r1, r2])}.`);
      return P(`$b^2 - 4ac = ${N(d, 3)} \\gt 0$ but is not a perfect square, so the quadratic factor will not factorise: its two real roots are irrational. Use the quadratic formula: $x = ${N(r1, 3)}$ or $x = ${N(r2, 3)}$ (to 3 significant figures).`);
    }
    step.addEventListener("click", () => { if (!cs.length && !reset()) return; if (k < cs.length - 1) { k++; draw(); HM.math(out); } });
    all.addEventListener("click", () => { if (!reset()) return; k = cs.length - 1; draw(); HM.math(out); });
    [cIn, rIn].forEach((i) => i.addEventListener("change", () => { reset(); HM.math(out); }));
    hunt.addEventListener("click", () => {
      const v = parse();
      if (!v) return reset();
      const c0 = Math.abs(v[v.length - 1]);
      if (!Number.isInteger(c0) || c0 === 0 || c0 > 500) { note.textContent = "The hunt needs a non-zero whole-number constant term. (If the constant is 0, x is a factor: take it out first.)"; return; }
      const cands = [];
      for (let d = 1; d <= c0; d++) if (c0 % d === 0) cands.push(d, -d);
      const evalAt = (x) => v.reduce((acc, c) => acc * x + c, 0);
      const rows = cands.map((x) => { const fx = evalAt(x); return `<tr><td class="num">${N(x)}</td><td class="num">${N(fx, 4)}</td><td>${Math.abs(fx) < 1e-9 ? "<span class='ok'>root ✔</span>" : ""}</td></tr>`; });
      const hit = cands.find((x) => Math.abs(evalAt(x)) < 1e-9);
      note.innerHTML = `Candidates are the factors of ${c0}, positive and negative. ` + (hit !== undefined ? `First root found: <b>${N(hit)}</b>. It is now loaded as the trial root.` : (v.every(Number.isInteger) ? "None of them is a root, so this polynomial has no whole-number roots." : "None of them is a root. (With non-whole coefficients this test is not conclusive.)"));
      out.innerHTML = `<div class="table-wrap" style="margin:0"><table><thead><tr><th class="num">Try $x =$</th><th class="num">$f(x)$</th><th></th></tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
      HM.math(out); HM.math(note);
      if (hit !== undefined) { rIn.value = hit; cs = []; }
    });
    reset();
  });

  /* =====================================================================
     2. Completing the square: blocks + algebra + graph
     ===================================================================== */
  mount("w-square", (box) => {
    const ctl = controls(box);
    let a = 2, b = 12, c = 5;
    const sa = HM.slider(ctl, { label: "$a$", min: -3, max: 3, step: 1, value: a, fmt: (v) => N(v), oninput: (v) => { a = v || (a > 0 ? -1 : 1); if (!v) sa.set(a); upd(); } });
    HM.slider(ctl, { label: "$b$", min: -12, max: 12, step: 1, value: b, oninput: (v) => { b = v; upd(); } });
    HM.slider(ctl, { label: "$c$", min: -10, max: 10, step: 1, value: c, oninput: (v) => { c = v; upd(); } });
    const grid = HM.el("div", { class: "two-col" });
    const cv = HM.el("canvas", { class: "sim", role: "img" });
    const right = HM.el("div");
    const tex = HM.el("div", { class: "tex-out", "aria-live": "polite" });
    const gcv = HM.el("canvas", { class: "sim", role: "img" });
    right.append(tex);
    grid.append(cv, right);
    box.append(grid, gcv);
    const tiles = HM.sim(cv, {
      height: (w) => Math.min(300, Math.round(w * 0.75)),
      draw(ctx, t, dt, C, S) {
        const p = b / a;
        ctx.fillStyle = C.paper; ctx.fillRect(0, 0, S.w, S.h);
        if (p <= 0) {
          HM.label(ctx, "Blocks need b/a > 0.", S.w / 2, S.h / 2 - 10, { align: "center", col: C.ink2 });
          HM.label(ctx, "The algebra still works →", S.w / 2, S.h / 2 + 12, { align: "center", col: C.ink2 });
          cv.setAttribute("aria-label", "No block picture: the blocks can only show a positive coefficient of x.");
          return;
        }
        // x drawn as 4 units; strips p/2 wide on two sides; missing corner (p/2)^2
        const X = 4, h = p / 2, tot = X + h;
        const u = Math.min((S.w - 40) / tot, (S.h - 40) / tot);
        const ox = 20, oy = 20;
        const blk = (x, y, w, hh, col) => {
          ctx.fillStyle = col; ctx.fillRect(ox + x * u, oy + y * u, w * u, hh * u);
          ctx.strokeStyle = "rgba(0,0,0,.35)"; ctx.lineWidth = 1;
          for (let gx = 0; gx < w - 1e-9; gx += 1) for (let gy = 0; gy < hh - 1e-9; gy += 1) ctx.strokeRect(ox + (x + gx) * u, oy + (y + gy) * u, Math.min(1, w - gx) * u, Math.min(1, hh - gy) * u);
        };
        blk(0, 0, X, X, "#7fb069"); // grass block x²
        blk(X, 0, h, X, "#a8794f"); // dirt strips
        blk(0, X, X, h, "#a8794f");
        // the missing corner, pulsing
        const pulse = HM.reduced ? 0.6 : 0.45 + 0.25 * Math.sin(t * 3);
        ctx.save(); ctx.globalAlpha = pulse; ctx.fillStyle = C.red; ctx.fillRect(ox + X * u, oy + X * u, h * u, h * u); ctx.restore();
        ctx.setLineDash([5, 4]); ctx.strokeStyle = C.red; ctx.lineWidth = 2; ctx.strokeRect(ox + X * u, oy + X * u, h * u, h * u); ctx.setLineDash([]);
        HM.label(ctx, "x²", ox + X * u / 2, oy + X * u / 2, { align: "center", bold: true, size: 16 });
        HM.label(ctx, `${N(h)}x`, ox + (X + h / 2) * u, oy + X * u / 2, { align: "center", size: 13 });
        HM.label(ctx, `${N(h)}x`, ox + X * u / 2, oy + (X + h / 2) * u, { align: "center", size: 13 });
        HM.label(ctx, `missing ${N(h * h)}`, ox + (X + h / 2) * u, oy + (X + h) * u + 12, { align: "center", size: 12, col: C.red, bold: true });
        HM.label(ctx, `x + ${N(h)}`, ox + tot * u / 2, oy - 9, { align: "center", size: 12 });
        cv.setAttribute("aria-label", `Blocks: an x by x square plus two strips ${N(h)} by x make an (x + ${N(h)}) square with a ${N(h)} by ${N(h)} corner missing, so x² + ${N(p)}x = (x + ${N(h)})² − ${N(h * h)}.`);
      },
      loop: true,
    });
    const graph = HM.sim(gcv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const p = b / (2 * a), q = c - b * b / (4 * a);
        const xc = -p, span = 7;
        const x0 = Math.floor(xc - span), x1 = Math.ceil(xc + span);
        const ymid = q, yr = 14;
        const y0 = Math.floor(ymid - (a > 0 ? 3 : yr)), y1 = Math.ceil(ymid + (a > 0 ? yr : 3));
        const bx = { x: 40, y: 12, w: S.w - 56, h: S.h - 34 };
        const P = HM.plot(ctx, bx, { x0, x1, y0, y1, xt: niceStep(x1 - x0), yt: niceStep(y1 - y0), C, xl: "x", yl: "y" });
        HM.clip(ctx, bx, () => {
          ctx.setLineDash([5, 4]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(P.X(xc), bx.y); ctx.lineTo(P.X(xc), bx.y + bx.h); ctx.stroke(); ctx.setLineDash([]);
          HM.curve(ctx, P, (x) => a * x * x + b * x + c, x0, x1, C.sea, 3);
          HM.dot(ctx, P.X(xc), P.Y(q), C.red, 6, C.card);
        });
        HM.label(ctx, `${a > 0 ? "minimum" : "maximum"} (${N(xc)}, ${N(q)})`, Math.min(Math.max(P.X(xc) + 10, bx.x + 4), S.w - 170), Math.min(Math.max(P.Y(q) + (a > 0 ? 18 : -18), 24), S.h - 30), { avoid: true, bold: true, col: C.red });
        // clear of the y-axis label when the axis of symmetry is the y-axis itself
        HM.label(ctx, `x = ${N(xc)}`, P.X(xc) + (Math.abs(P.X(xc) - P.X(0)) < 24 ? 16 : 5), bx.y + (Math.abs(P.X(xc) - P.X(0)) < 24 ? 30 : 10), { avoid: true, size: 12, col: C.ink2 });
        gcv.setAttribute("aria-label", `Graph of y = ${HM.terms([[a, "x²"], [b, "x"], [c, ""]])}, a parabola with ${a > 0 ? "minimum" : "maximum"} turning point (${N(xc)}, ${N(q)}) and axis of symmetry x = ${N(xc)}.`);
      },
    });
    function upd() {
      const p = b / (2 * a), half = b / (2 * a), q = c - b * b / (4 * a);
      const F = HM.fracTex;
      const inner = b / a;
      const cT = c ? ` ${c < 0 ? "-" : "+"} ${Math.abs(c)}` : "";
      const lines = [];
      lines.push(`${polyTex([a, b, c])}`);
      if (a !== 1) lines.push(`= ${a === -1 ? "-" : N(a)}\\left(x^2 ${inner < 0 ? "-" : "+"} ${F(Math.abs(inner))}x\\right)${cT}`);
      const sq = half * half;
      const brk = `\\left(x ${half < 0 ? "-" : "+"} ${F(Math.abs(half))}\\right)^2`;
      lines.push(a === 1 ? `= ${brk} - ${F(sq, 144)}${cT}` : `= ${a === -1 ? "-" : N(a)}\\left[${brk} - ${F(sq, 144)}\\right]${cT}`);
      lines.push(`= ${a === 1 ? "" : a === -1 ? "-" : N(a)}${brk} ${q < 0 ? "-" : "+"} ${F(Math.abs(q))}`);
      const already = b === 0 ? `<p class="hint" style="margin:6px 0 0">With $b = 0$ this is already in the form $a(x + p)^2 + q$, with $p = 0$.</p>` : "";
      if (b === 0) { lines.length = 0; lines.push(`${polyTex([a, b, c])}`); }
      tex.innerHTML = HM.tex(`\\begin{aligned}${lines.map((l, i) => (i ? "&" : "&") + l).join("\\\\")}\\end{aligned}`, true) + already +
        `<p class="hint" style="margin:6px 0 0">Turning point ${HM.tex(`\\left(${F(-p)},\\ ${F(q)}\\right)`)}, a <b>${a > 0 ? "minimum" : "maximum"}</b> because $a ${a > 0 ? "\\gt" : "\\lt"} 0$.</p>`;
      HM.math(tex);
      tiles.redraw(); graph.redraw();
    }
    upd();
  });

  /* =====================================================================
     3. Discriminant explorer with inequality shading
     ===================================================================== */
  mount("w-disc", (box) => {
    const ctl = controls(box);
    let a = 1, b = -2, c = -8, shade = "none";
    const sa = HM.slider(ctl, { label: "$a$", min: -3, max: 3, step: 0.5, value: a, fmt: (v) => N(v), oninput: (v) => { if (v === 0) { sa.set(a > 0 ? -0.5 : 0.5); return; } a = v; sim.redraw(); info(); } });
    HM.slider(ctl, { label: "$b$", min: -8, max: 8, step: 0.5, value: b, fmt: (v) => N(v), oninput: (v) => { b = v; sim.redraw(); info(); } });
    HM.slider(ctl, { label: "$c$", min: -10, max: 10, step: 0.5, value: c, fmt: (v) => N(v), oninput: (v) => { c = v; sim.redraw(); info(); } });
    HM.choice(box, "Shade where:", [["none", "no shading"], ["gt", "$f(x) \\gt 0$"], ["lt", "$f(x) \\lt 0$"]], shade, (v) => { shade = v; sim.redraw(); info(); });
    const cv = canvasIn(box, "");
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 36, y: 10, w: S.w - 50, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: -8, x1: 8, y0: -12, y1: 12, xt: 2, yt: 4, C, xl: "x", yl: "y" });
        const f = (x) => a * x * x + b * x + c;
        const D = b * b - 4 * a * c;
        HM.clip(ctx, bx, () => {
          if (shade !== "none") {
            ctx.fillStyle = shade === "gt" ? C.grass : C.red; ctx.globalAlpha = 0.18;
            for (let px = bx.x; px < bx.x + bx.w; px += 2) {
              const x = -8 + (px - bx.x) / bx.w * 16, y = f(x);
              if ((shade === "gt" && y > 0) || (shade === "lt" && y < 0)) ctx.fillRect(px, bx.y, 2, bx.h);
            }
            ctx.globalAlpha = 1;
          }
          HM.curve(ctx, P, f, -8, 8, C.sea, 3);
          if (D >= 0) {
            const s = Math.sqrt(D);
            [(-b - s) / (2 * a), (-b + s) / (2 * a)].forEach((r) => HM.dot(ctx, P.X(r), P.Y(0), D === 0 ? C.gold : C.red, 6, C.card));
          }
        });
        cv.setAttribute("aria-label", `Parabola y = ${HM.terms([[a, "x²"], [b, "x"], [c, ""]])}. ${D > 0 ? "It crosses the x-axis twice." : D === 0 ? "It touches the x-axis once." : "It does not meet the x-axis."}`);
      },
    });
    function info() {
      const D = b * b - 4 * a * c;
      const nat = D > 0 ? "two real, distinct roots" : D === 0 ? "equal roots (a repeated root)" : "no real roots";
      let s;
      s = `$b^2 - 4ac = (${N(b).replace("−", "-")})^2 - 4 \\times ${a < 0 ? `(${N(a).replace("−", "-")})` : N(a)} \\times ${c < 0 ? `(${N(c).replace("−", "-")})` : N(c)} = ${N(D).replace("−", "-")}$, which is ${D > 0 ? "positive" : D === 0 ? "zero" : "negative"}: <b>${nat}</b>.`;
      if (D >= 0) {
        const r1 = (-b - Math.sqrt(D)) / (2 * a), r2 = (-b + Math.sqrt(D)) / (2 * a);
        const lo = Math.min(r1, r2), hi = Math.max(r1, r2);
        s += D > 0 ? ` Roots $x = ${N(lo).replace("−", "-")}$ and $x = ${N(hi).replace("−", "-")}$.` : ` Root $x = ${N(lo).replace("−", "-")}$.`;
        if (shade !== "none" && D > 0) {
          const between = (shade === "lt") === (a > 0);
          s += ` So $f(x) ${shade === "gt" ? "\\gt" : "\\lt"} 0$ when ${between ? `$${N(lo).replace("−", "-")} \\lt x \\lt ${N(hi).replace("−", "-")}$` : `$x \\lt ${N(lo).replace("−", "-")}$ or $x \\gt ${N(hi).replace("−", "-")}$`}.`;
        }
      } else if (shade !== "none") s += (shade === "gt") === (a > 0) ? " The graph never crosses the axis, so the inequality holds for <b>every</b> $x$." : " The graph never crosses the axis, so the inequality has <b>no</b> solutions.";
      out.innerHTML = `<p style="margin:0">${s}</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     4. Tangency: a line and the parabola y = x² + 4
     ===================================================================== */
  mount("w-tangent", (box) => {
    const ctl = controls(box);
    let m = 2, k = 1;
    HM.slider(ctl, { label: "gradient $m$", min: -6, max: 6, step: 0.5, value: m, fmt: (v) => N(v), oninput: (v) => { m = v; sim.redraw(); info(); } });
    const sk = HM.slider(ctl, { label: "intercept $k$", min: -6, max: 10, step: 0.0625, value: k, fmt: (v) => N(v), oninput: (v) => { k = v; sim.redraw(); info(); } });
    const snap = HM.el("button", { class: "btn small", type: "button" }, "Make it a tangent");
    box.append(HM.el("div", { class: "btn-row" }, snap));
    const cv = canvasIn(box, "");
    const out = texBox(box);
    snap.addEventListener("click", () => { sk.set(4 - m * m / 4); });
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 300 : 320),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 36, y: 10, w: S.w - 50, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: -6, x1: 6, y0: -4, y1: 20, xt: 2, yt: 4, C, xl: "x", yl: "y" });
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, (x) => x * x + 4, -6, 6, C.sea, 3);
          HM.curve(ctx, P, (x) => m * x + k, -6, 6, C.red, 2.5);
          const D = m * m - 4 * (4 - k);
          if (D >= -1e-9) {
            const s = Math.sqrt(Math.max(0, D));
            [(m - s) / 2, (m + s) / 2].forEach((x) => HM.dot(ctx, P.X(x), P.Y(x * x + 4), Math.abs(D) < 1e-9 ? C.gold : C.ink, 6, C.card));
          }
        });
        const D = m * m - 4 * (4 - k);
        cv.setAttribute("aria-label", `The parabola y = x² + 4 and the line y = ${HM.terms([[m, "x"], [k, ""]])}. ${Math.abs(D) < 1e-9 ? "The line is a tangent." : D > 0 ? "The line cuts the curve twice." : "The line misses the curve."}`);
      },
    });
    function info() {
      const D = m * m - 4 * (4 - k);
      const z = Math.abs(D) < 1e-9;
      out.innerHTML = HM.tex(`x^2 + 4 = ${polyTex([m, k], "x", true)} \\;\\Rightarrow\\; ${polyTex([1, -m, 4 - k], "x", true)} = 0`, true) +
        `<p style="margin:0">Discriminant $= (${N(-m).replace("−", "-")})^2 - 4(1)(${HM.fracTex(4 - k, 16)}) = ${z ? 0 : HM.fracTex(D, 16)}$: <b>${z ? "zero, so the line is a tangent" : D > 0 ? "positive, so the line cuts the curve at two points" : "negative, so the line misses the curve"}</b>.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     5. Composite functions: two furnaces and a minecart
     ===================================================================== */
  const FUNCS = {
    lin: { tex: "3x - 1", f: (x) => 3 * x - 1, sub: (s) => `3(${s}) - 1` },
    sq: { tex: "x^2 + 2", f: (x) => x * x + 2, sub: (s) => `(${s})^2 + 2` },
    add: { tex: "x + 4", f: (x) => x + 4, sub: (s) => `(${s}) + 4` },
    half: { tex: "\\tfrac{1}{2}x", f: (x) => x / 2, sub: (s) => `\\tfrac{1}{2}(${s})` },
    exp: { tex: "2^x", f: (x) => Math.pow(2, x), sub: (s) => `2^{${s}}` },
  };
  const SIMPLE = { // simplified f(g(x)) for each ordered pair, outer first
    "lin|sq": "3x^2 + 5", "sq|lin": "9x^2 - 6x + 3", "lin|add": "3x + 11", "add|lin": "3x + 3", "lin|half": "\\tfrac{3}{2}x - 1", "half|lin": "\\tfrac{3}{2}x - \\tfrac{1}{2}",
    "lin|exp": "3 \\cdot 2^x - 1", "exp|lin": "2^{3x - 1}", "sq|add": "x^2 + 8x + 18", "add|sq": "x^2 + 6", "sq|half": "\\tfrac{1}{4}x^2 + 2", "half|sq": "\\tfrac{1}{2}x^2 + 1",
    "sq|exp": "4^x + 2", "exp|sq": "2^{x^2 + 2}", "add|half": "\\tfrac{1}{2}x + 4", "half|add": "\\tfrac{1}{2}x + 2", "add|exp": "2^x + 4", "exp|add": "2^{x + 4}", "half|exp": "2^{x - 1}", "exp|half": "2^{x/2}",
    "lin|lin": "9x - 4", "sq|sq": "x^4 + 4x^2 + 6", "add|add": "x + 8", "half|half": "\\tfrac{1}{4}x", "exp|exp": "2^{2^x}",
  };
  mount("w-furnace", (box) => {
    let fk = "lin", gk = "sq", x = 2, order = "fg";
    const opts = [["lin", "$3x - 1$"], ["sq", "$x^2 + 2$"], ["add", "$x + 4$"], ["half", "$\\tfrac12 x$"], ["exp", "$2^x$"]];
    HM.choice(box, "$f(x) =$", opts, fk, (v) => { fk = v; run(); });
    HM.choice(box, "$g(x) =$", opts, gk, (v) => { gk = v; run(); });
    const ctl = controls(box);
    HM.slider(ctl, { label: "input $x$", min: -3, max: 3, step: 1, value: x, oninput: (v) => { x = v; run(); } });
    const swap = HM.el("button", { class: "btn small", type: "button" }, "⇄ Swap the order");
    const go = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Send the cart");
    box.append(HM.el("div", { class: "btn-row" }, go, swap));
    const cv = canvasIn(box, "");
    const out = texBox(box);
    let start = -1;
    swap.addEventListener("click", () => { order = order === "fg" ? "gf" : "fg"; run(); });
    go.addEventListener("click", () => { start = sim.t; if (!sim.playing) sim.play(); });
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 200 : 180),
      draw(ctx, t, dt, C, S) {
        const first = order === "fg" ? gk : fk, second = order === "fg" ? fk : gk;
        const fN = order === "fg" ? "g" : "f", sN = order === "fg" ? "f" : "g"; // by position, so f and g can be the same rule
        const v1 = FUNCS[first].f(x), v2 = FUNCS[second].f(v1);
        const y = S.h * 0.62;
        ctx.fillStyle = C.paper2; ctx.fillRect(0, y + 14, S.w, S.h - y - 14);
        // rails
        ctx.strokeStyle = "#7a5532"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(10, y + 12); ctx.lineTo(S.w - 10, y + 12); ctx.stroke();
        for (let rx = 14; rx < S.w - 10; rx += 14) { ctx.fillStyle = "#8a8f99"; ctx.fillRect(rx, y + 9, 3, 7); }
        const fx = [S.w * 0.33, S.w * 0.68];
        const furn = (cx, lab, key, lit) => {
          const w = 70, h = 64;
          ctx.fillStyle = "#6b707a"; ctx.fillRect(cx - w / 2, y - h + 8, w, h);
          ctx.fillStyle = "#4d525c"; ctx.fillRect(cx - w / 2 + 6, y - h + 14, w - 12, 12);
          ctx.fillStyle = lit ? "#ffb21e" : "#2a2a2a"; ctx.fillRect(cx - 14, y - 26, 28, 18);
          if (lit && !HM.reduced) { ctx.fillStyle = "#ff4b3a"; ctx.fillRect(cx - 8 + Math.sin(t * 20) * 3, y - 22, 6, 10); }
          HM.label(ctx, lab, cx, y - h - 6, { align: "center", bold: true, size: 15 });
        };
        const tt = start < 0 ? 99 : t - start, dur = 3.4;
        const ph = Math.min(1, tt / dur);
        const cx = 20 + ph * (S.w - 60);
        furn(fx[0], fN, first, cx > fx[0] - 40 && cx < fx[0] + 40);
        furn(fx[1], sN, second, cx > fx[1] - 40 && cx < fx[1] + 40);
        const val = cx < fx[0] ? x : cx < fx[1] ? v1 : v2;
        // the minecart
        ctx.fillStyle = "#555"; ctx.fillRect(cx - 18, y - 6, 36, 16); ctx.fillStyle = "#333"; ctx.fillRect(cx - 14, y + 8, 6, 6); ctx.fillRect(cx + 8, y + 8, 6, 6);
        HM.label(ctx, N(val, 3), cx, y - 16, { align: "center", bold: true, size: 15, col: C.red });
        HM.label(ctx, `in: ${N(x)}`, 14, 16, { size: 13 });
        HM.label(ctx, `out: ${ph >= 1 ? N(v2, 3) : "…"}`, S.w - 14, 16, { size: 13, align: "right" });
        if (ph >= 1 && start >= 0 && S.playing) S.pause();
        cv.setAttribute("aria-label", `A minecart carries ${N(x)} through furnace ${fN} giving ${N(v1, 3)}, then through furnace ${sN} giving ${N(v2, 3)}.`);
      },
    });
    function run() {
      const outerK = order === "fg" ? fk : gk, innerK = order === "fg" ? gk : fk;
      const oN = order === "fg" ? "f" : "g", iN = order === "fg" ? "g" : "f";
      const v1 = FUNCS[innerK].f(x), v2 = FUNCS[outerK].f(v1);
      out.innerHTML = HM.tex(`${oN}\\big(${iN}(x)\\big) = ${oN}\\left(${FUNCS[innerK].tex}\\right) = ${FUNCS[outerK].sub(FUNCS[innerK].tex)} = ${SIMPLE[outerK + "|" + innerK]}`, true) +
        `<p style="margin:0">With $x = ${x}$: $${iN}(${x}) = ${N(v1, 3).replace("−", "-")}$, then $${oN}(${N(v1, 3).replace("−", "-")}) = ${N(v2, 3).replace("−", "-")}$. ${iN === "g" ? "$g$ acts first because it is on the inside." : "Now $f$ is on the inside, so it acts first."}</p>`;
      HM.math(out);
      // with reduced motion there is no ride: draw the finished state (start = -1) straight away
      start = HM.reduced ? -1 : sim.t; if (!sim.playing && !HM.reduced) sim.play(); else sim.redraw();
    }
    run();
  });

  /* =====================================================================
     6. Inverse functions: reflect in y = x
     ===================================================================== */
  mount("w-inverse", (box) => {
    const FN = {
      lin: { name: "$f(x) = 2x + 1$", f: (x) => 2 * x + 1, g: (x) => (x - 1) / 2, inv: "f^{-1}(x) = \\tfrac{x - 1}{2}", pts: [-2, 0, 1.5], x0: -6, x1: 6 },
      exp: { name: "$f(x) = 2^x$", f: (x) => Math.pow(2, x), g: (x) => Math.log2(x), inv: "f^{-1}(x) = \\log_2 x", pts: [-1, 0, 1, 2], x0: -6, x1: 6 },
      cube: { name: "$f(x) = x^3$", f: (x) => x * x * x, g: (x) => Math.cbrt(x), inv: "f^{-1}(x) = \\sqrt[3]{x}", pts: [-1.5, -1, 1, 1.5], x0: -6, x1: 6 },
      rec: { name: "$f(x) = \\tfrac{2}{x - 1}$", f: (x) => 2 / (x - 1), g: (x) => 1 + 2 / x, inv: "f^{-1}(x) = 1 + \\tfrac{2}{x}", pts: [-1, 2, 3, 5], x0: -6, x1: 6 },
    };
    let key = "exp", start = null;
    HM.choice(box, "Function:", Object.entries(FN).map(([k, v]) => [k, v.name]), key, (v) => { key = v; start = null; sim.redraw(); info(); });
    const go = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Reflect in y = x");
    box.append(HM.el("div", { class: "btn-row" }, go));
    const cv = canvasIn(box, "");
    const out = texBox(box);
    go.addEventListener("click", () => { start = sim.t; if (!sim.playing) sim.play(); });
    const sim = HM.sim(cv, {
      height: (w) => Math.min(460, Math.max(300, Math.round(w * 0.62))),
      draw(ctx, t, dt, C, S) {
        const F = FN[key];
        const side = Math.min(S.w - 50, S.h - 30);
        const bx = { x: (S.w - side) / 2 + 10, y: 10, w: side, h: side - 10 };
        const P = HM.plot(ctx, bx, { x0: -6, x1: 6, y0: -6, y1: 6, xt: 1, yt: 1, C, xl: "x", yl: "y", tf: (v) => (v % 2 ? "" : String(v).replace("-", "−")) });
        const ph = start === null ? 0 : HM.reduced ? 1 : Math.max(0, Math.min(1, (t - start) / 2.2));
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, (x) => x, -6, 6, C.muted, 1.5, { dash: [6, 4] });
          HM.curve(ctx, P, F.f, F.x0, F.x1, C.sea, 3, { ylo: -7, yhi: 7 });
          if (ph > 0) {
            // the reflected curve, swept in as the points swing across
            ctx.save(); ctx.globalAlpha = ph;
            HM.curve(ctx, P, F.g, -6, 6, C.red, 3, { ylo: -7, yhi: 7 });
            ctx.restore();
          }
          F.pts.forEach((a) => {
            const b = F.f(a);
            // rotate (a,b) to (b,a) through the mirror: move along the perpendicular to y = x
            const xa = a + (b - a) * ph, yb = b + (a - b) * ph;
            ctx.setLineDash([3, 3]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(P.X(a), P.Y(b)); ctx.lineTo(P.X(b), P.Y(a)); ctx.stroke(); ctx.setLineDash([]);
            HM.dot(ctx, P.X(a), P.Y(b), C.sea, 5);
            HM.dot(ctx, P.X(xa), P.Y(yb), C.red, 5.5, C.card);
          });
        });
        // labels after every dot and outside the clip, kept inside the plot box so none is cut off;
        // "y = x" goes first so the point labels steer round it
        HM.label(ctx, "y = x", P.X(5.2), P.Y(5.2) + 14, { size: 12, col: C.ink2, align: "right" });
        F.pts.forEach((a) => {
          const b = F.f(a);
          if (ph >= 1) HM.label(ctx, `(${N(b, 2)}, ${N(a, 2)})`, P.X(b) + 6, P.Y(a) + (a > b ? -10 : 12), { avoid: true, bounds: bx, size: 12, col: C.red });
          else HM.label(ctx, `(${N(a, 2)}, ${N(b, 2)})`, P.X(a) + 6, P.Y(b) - 10, { avoid: true, bounds: bx, size: 12, col: C.sea });
        });
        if (ph >= 1 && S.playing) S.pause();
        cv.setAttribute("aria-label", `Graph of ${F.name.replace(/\$/g, "")} in blue${ph ? " and its inverse in red, its reflection in the line y = x" : ""}. Marked points (a, b) on f become (b, a) on the inverse.`);
      },
    });
    function info() {
      out.innerHTML = HM.tex(FN[key].inv, true) + `<p style="margin:0">Every point swaps its coordinates. ${key === "exp" ? "The asymptote (the line the graph gets ever closer to but never meets) swaps too: $y = 0$ for $2^x$ becomes $x = 0$ for $\\log_2 x$." : key === "rec" ? "The asymptotes swap: $x = 1, y = 0$ for $f$ become $y = 1, x = 0$ for $f^{-1}$." : ""}</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     7. Graph transformations: y = a f(bx + c) + d with travelling points
     ===================================================================== */
  mount("w-transform", (box) => {
    const BASE = {
      cubic: { name: "cubic", tex: "x^3 - 3x", f: (x) => x * x * x - 3 * x, pts: [[-1, 2, "max"], [1, -2, "min"], [0, 0, ""]] },
      sin: { name: "sin x°", tex: "\\sin x^\\circ", f: (x) => Math.sin(x * Math.PI / 180), pts: [[90, 1, "max"], [270, -1, "min"], [0, 0, ""]], deg: true },
      exp: { name: "2^x", tex: "2^x", f: (x) => Math.pow(2, x), pts: [[0, 1, ""], [1, 2, ""], [2, 4, ""]] },
      log: { name: "log₂ x", tex: "\\log_2 x", f: (x) => (x > 0 ? Math.log2(x) : NaN), pts: [[1, 0, ""], [2, 1, ""], [4, 2, ""]] },
    };
    let key = "cubic", T = { a: 1, b: 1, c: 0, d: 0 }, target = { a: 2, b: 1, c: -1, d: 3 }, start = -10;
    HM.choice(box, "Base graph $y = f(x)$:", Object.entries(BASE).map(([k, v]) => [k, `$${v.tex}$`]), key, (v) => { key = v; resetTo(); });
    const ctl = controls(box);
    const sliders = {
      a: HM.slider(ctl, { label: "$a$ (outside, multiplies $y$)", min: -3, max: 3, step: 0.5, value: 2, fmt: (v) => N(v), oninput: (v) => { target.a = v; preview(); } }),
      b: HM.slider(ctl, { label: "$b$ (inside, multiplies $x$)", min: -2, max: 3, step: 0.5, value: 1, fmt: (v) => N(v), oninput: (v) => { if (v === 0) { sliders.b.set(target.b > 0 ? -0.5 : 0.5); return; } target.b = v; preview(); } }),
      c: HM.slider(ctl, { label: "$c$ (inside, added)", min: -4, max: 4, step: 1, value: -1, oninput: (v) => { target.c = v; preview(); } }),
      d: HM.slider(ctl, { label: "$d$ (outside, added)", min: -4, max: 4, step: 1, value: 3, oninput: (v) => { target.d = v; preview(); } }),
    };
    const go = HM.el("button", { class: "btn small primary", type: "button" }, "▶ Transform");
    const back = HM.el("button", { class: "btn small", type: "button" }, "↺ Back to $f(x)$");
    box.append(HM.el("div", { class: "btn-row" }, go, back));
    const cv = canvasIn(box, "");
    const out = texBox(box);
    let from = { ...T };
    const ID = { a: 1, b: 1, c: 0, d: 0 };
    go.addEventListener("click", () => { from = { ...ID }; start = sim.t; if (!sim.playing) sim.play(); });
    back.addEventListener("click", () => { const old = { ...target }; Object.entries(ID).forEach(([k, v]) => sliders[k].set(v)); target = { ...ID }; from = old; start = sim.t; if (!sim.playing) sim.play(); });
    function resetTo() {
      T = { a: 1, b: 1, c: 0, d: 0 }; from = { ...T }; start = -10;
      if (BASE[key].deg) { sliders.c.input.min = -180; sliders.c.input.max = 180; sliders.c.input.step = 30; sliders.c.set(-90); }
      else { sliders.c.input.min = -4; sliders.c.input.max = 4; sliders.c.input.step = 1; sliders.c.set(Math.max(-4, Math.min(4, target.c))); }
      preview(); sim.redraw();
    }
    const lerp = (p, q, s) => p + (q - p) * s;
    // the "b" morph goes through 1/b so the squash looks smooth; avoid b = 0 crossing
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 340 : 360),
      draw(ctx, t, dt, C, S) {
        const B = BASE[key];
        const ph = HM.reduced ? (t - start > 0.01 ? 1 : 0) : Math.max(0, Math.min(1, (t - start) / 2));
        const e = ph < 0.5 ? 2 * ph * ph : 1 - Math.pow(-2 * ph + 2, 2) / 2;
        const sameSignB = Math.sign(from.b) === Math.sign(target.b);
        const bb = sameSignB ? 1 / lerp(1 / from.b, 1 / target.b, e) : (e < 0.5 ? from.b : target.b);
        T = { a: lerp(from.a, target.a, e), b: bb, c: lerp(from.c, target.c, e), d: lerp(from.d, target.d, e) };
        const xr = B.deg ? [-360, 540] : [-6, 6];
        const bx = { x: 40, y: 10, w: S.w - 54, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: xr[0], x1: xr[1], y0: -8, y1: 8, xt: B.deg ? 90 : 1, yt: 2, C, xl: "x", yl: "y", tf: (v) => (B.deg ? (v % 180 ? "" : String(v).replace("-", "−")) : v % 2 ? "" : String(v).replace("-", "−")) });
        const g = (x) => T.a * B.f(T.b * x + T.c) + T.d;
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, B.f, xr[0], xr[1], C.muted, 2, { ylo: -12, yhi: 12, dash: [6, 4], n: 600 });
          HM.curve(ctx, P, g, xr[0], xr[1], C.red, 3, { ylo: -12, yhi: 12, n: 600 });
          B.pts.forEach(([px, py, lab]) => {
            const nx = (px - T.c) / T.b, ny = T.a * py + T.d;
            HM.dot(ctx, P.X(px), P.Y(py), C.muted, 4);
            ctx.setLineDash([2, 3]); ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P.X(px), P.Y(py)); ctx.lineTo(P.X(nx), P.Y(ny)); ctx.stroke(); ctx.setLineDash([]);
            HM.dot(ctx, P.X(nx), P.Y(ny), C.red, 5.5, C.card);
            if (ph >= 1 || start < 0) HM.label(ctx, `(${N(nx, 2)}, ${N(ny, 2)})`, P.X(nx) + 7, P.Y(ny) - 11, { avoid: true, size: 12, col: C.red, bold: true });
          });
        });
        if (ph >= 1 && S.playing) S.pause();
        cv.setAttribute("aria-label", `The graph of y = f(x) (dashed) and of y = ${HM.terms([[target.a, "f(" + HM.terms([[target.b, "x"], [target.c, ""]]) + ")"], [target.d, ""]])} (red), with marked points mapped.`);
      },
    });
    function preview() {
      const B = BASE[key], { a, b, c, d } = target;
      const inner = `${b === 1 ? "" : b === -1 ? "-" : N(b).replace("−", "-")}x${c ? (c < 0 ? " - " : " + ") + Math.abs(c) : ""}`;
      const eq = `y = ${a === 1 ? "" : a === -1 ? "-" : N(a).replace("−", "-")}f(${inner})${d ? (d < 0 ? " - " : " + ") + Math.abs(d) : ""}`;
      const steps = [];
      if (c) steps.push(`$f(${b === 1 ? "x" : "\\dots x"} ${c < 0 ? "-" : "+"} ${Math.abs(c)})$: inside, ${b === 1 ? `moves <b>${c > 0 ? "left" : "right"} ${Math.abs(c)}</b>` : `combined with $b$ below`}`);
      if (b !== 1) steps.push(`$b = ${N(b).replace("−", "-")}$: inside, ${b < 0 ? "<b>reflects in the $y$-axis</b> and " : ""}horizontal scale factor $\\frac{1}{${N(Math.abs(b)).replace("−", "-")}}$. Each point: $x \\to \\dfrac{x - (${c})}{${N(b).replace("−", "-")}}$`);
      if (a !== 1) steps.push(`$a = ${N(a).replace("−", "-")}$: outside, ${a < 0 ? "<b>reflects in the $x$-axis</b> and " : ""}vertical scale factor ${N(Math.abs(a))}: $y \\to ${N(a).replace("−", "-")}y$`);
      if (d) steps.push(`$d = ${d}$: outside, moves <b>${d > 0 ? "up" : "down"} ${Math.abs(d)}</b>`);
      from = { ...target }; start = -10; sim.redraw();
      out.innerHTML = HM.tex(`f(x) = ${B.tex}, \\qquad ${eq}`, true) + `<ul style="margin:0">${steps.map((s) => `<li>${s}</li>`).join("") || "<li>No change: this is $y = f(x)$.</li>"}</ul><p class="hint" style="margin:4px 0 0">Point rule: $(x,\\ y) \\to \\left(\\dfrac{x - c}{b},\\ ay + d\\right)$. Press <b>Transform</b> to watch the points travel from $y = f(x)$.</p>`;
      HM.math(out);
    }
    preview();
  });

  /* =====================================================================
     8. Exponential and logarithm: reflections in y = x
     ===================================================================== */
  mount("w-explog", (box) => {
    const ctl = controls(box);
    let a = 2;
    // base 1 is skipped (no log), and the stop at 2.7 stands for e itself
    const sa = HM.slider(ctl, { label: "base $a$", min: 0.2, max: 5, step: 0.1, value: a, fmt: (v) => (Math.abs(v - Math.E) < 0.05 ? "≈ e" : N(v, 1)), oninput: (v) => { if (Math.abs(v - 1) < 0.05) { sa.set(a > 1 ? 0.9 : 1.1); return; } a = Math.abs(v - Math.E) < 0.05 ? Math.E : v; sim.redraw(); info(); } });
    const eBtn = HM.el("button", { class: "btn small", type: "button" }, "Set a = e");
    box.append(HM.el("div", { class: "btn-row" }, eBtn));
    const cv = canvasIn(box, "");
    const out = texBox(box);
    eBtn.addEventListener("click", () => sa.set(2.7));
    const sim = HM.sim(cv, {
      height: (w) => Math.min(440, Math.max(300, Math.round(w * 0.6))),
      draw(ctx, t, dt, C, S) {
        const side = Math.min(S.w - 50, S.h - 20);
        const bx = { x: (S.w - side) / 2 + 10, y: 10, w: side, h: side - 10 };
        const P = HM.plot(ctx, bx, { x0: -5, x1: 6, y0: -5, y1: 6, xt: 1, yt: 1, C, xl: "x", yl: "y" });
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, (x) => x, -5, 6, C.muted, 1.5, { dash: [6, 4] });
          HM.curve(ctx, P, (x) => Math.pow(a, x), -5, 6, C.sea, 3, { yhi: 8 });
          HM.curve(ctx, P, (x) => (x > 0 ? Math.log(x) / Math.log(a) : NaN), 0.001, 6, C.red, 3, { ylo: -8, yhi: 8, n: 1200 });
          [[0, 1, C.sea], [1, a, C.sea], [1, 0, C.red], [a, 1, C.red]].forEach(([x, y, col]) => HM.dot(ctx, P.X(x), P.Y(y), col, 5, C.card));
        });
        HM.label(ctx, `y = ${a === Math.E ? "e" : N(a, 1)}ˣ`, P.X(Math.log(5) / Math.log(a) * (a > 1 ? 1 : 1)) + 6, P.Y(5), { avoid: true, col: C.sea, bold: true });
        const subs = (t) => String(t).replace(/[0-9.]/g, (d) => "₀₁₂₃₄₅₆₇₈₉"[d] || "․");
        HM.label(ctx, `y = log${a === Math.E ? "ₑ" : subs(N(a, 1))} x`, P.X(5.6), P.Y(Math.log(5.6) / Math.log(a)) + (a > 1 ? 16 : -16), { avoid: true, col: C.red, bold: true, align: "right" });
        cv.setAttribute("aria-label", `Graphs of y = a to the power x (blue) and y = log base a of x (red) for a = ${N(a, 2)}, reflections of each other in the line y = x.`);
      },
    });
    function info() {
      const A = a === Math.E ? "e" : N(a, 1);
      out.innerHTML = `<p style="margin:0">$y = ${A}^x$ passes through $(0, 1)$ and $(1, ${A})$; asymptote $y = 0$. Its mirror $y = \\log_{${A}} x$ passes through $(1, 0)$ and $(${A}, 1)$; asymptote $x = 0$. ${a > 1 ? "Base greater than 1: growth." : "Base between 0 and 1: decay, and the log graph slopes down."}</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     9. Cooling model: solve with logs, every line shown
     ===================================================================== */
  mount("w-cool", (box) => {
    const ctl = controls(box);
    let k = 0.05, Ts = 50;
    HM.slider(ctl, { label: "cooling rate $k$", min: 0.02, max: 0.2, step: 0.01, value: k, fmt: (v) => N(v), oninput: (v) => { k = v; sim.redraw(); info(); } });
    HM.slider(ctl, { label: "safe temperature", min: 25, max: 190, step: 5, value: Ts, unit: "°C", oninput: (v) => { Ts = v; sim.redraw(); info(); } });
    const cv = canvasIn(box, "");
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 260 : 280),
      draw(ctx, t, dt, C, S) {
        const bx = { x: 44, y: 10, w: S.w - 58, h: S.h - 32 };
        const P = HM.plot(ctx, bx, { x0: 0, x1: 120, y0: 0, y1: 210, xt: 20, yt: 50, C, xl: "t (min)", yl: "T (°C)" });
        const tt = Math.log(180 / (Ts - 20)) / k;
        HM.clip(ctx, bx, () => {
          HM.curve(ctx, P, () => 20, 0, 120, C.muted, 1.5, { dash: [5, 4] });
          HM.curve(ctx, P, () => Ts, 0, 120, C.gold, 1.5, { dash: [3, 3] });
          HM.curve(ctx, P, (x) => 20 + 180 * Math.exp(-k * x), 0, 120, C.red, 3);
          if (tt <= 120) { ctx.setLineDash([3, 3]); ctx.strokeStyle = C.ink2; ctx.beginPath(); ctx.moveTo(P.X(tt), P.Y(Ts)); ctx.lineTo(P.X(tt), P.Y(0)); ctx.stroke(); ctx.setLineDash([]); HM.dot(ctx, P.X(tt), P.Y(Ts), C.gold, 6, C.card); }
        });
        HM.label(ctx, "room 20 °C", bx.x + bx.w - 4, P.Y(20) - 9, { align: "right", size: 12, col: C.ink2 });
        cv.setAttribute("aria-label", `Temperature falls from 200 °C towards 20 °C. It reaches ${Ts} °C after ${N(tt, 1)} minutes.`);
      },
    });
    function info() {
      const r = (Ts - 20) / 180, tt = Math.log(1 / r) / k;
      out.innerHTML = HM.tex(`\\begin{aligned}20 + 180e^{-${k}t} &= ${Ts}\\\\ e^{-${k}t} &= \\tfrac{${Ts - 20}}{180} = ${N(r, 4)}\\\\ -${k}t &= \\ln ${N(r, 4)} = ${N(Math.log(r), 4).replace("−", "-")}\\\\ t &= ${N(tt, 1)} \\text{ minutes}\\end{aligned}`, true);
    }
    info();
  });

  /* =====================================================================
     10. Log graphs: points slide onto log axes
     ===================================================================== */
  mount("w-loglin", (box) => {
    // the Sailing Master's data come from a hidden law; the reader decides which axes straighten them
    const LAWS = {
      exp: { tex: "y = 3 \\times 2^x", f: (x) => 3 * Math.pow(2, x), a: 3, b: 2, xs: [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4] },
      pow: { tex: "y = 2x^{1.5}", f: (x) => 2 * Math.pow(x, 1.5), a: 2, b: 1.5, xs: [1, 2, 3, 4, 5, 6, 7, 8] },
    };
    let law = "exp", mode = "raw", from = "raw", start = -10;
    HM.choice(box, "The data:", [["exp", "Data set A"], ["pow", "Data set B"]], law, (v) => { law = v; from = mode = "raw"; start = -10; sim.redraw(); info(); });
    const seg = HM.choice(box, "Plot:", [["raw", "$y$ against $x$"], ["lx", "$\\log_{10} y$ against $x$"], ["ll", "$\\log_{10} y$ against $\\log_{10} x$"]], mode, (v) => { from = mode; mode = v; start = sim.t; if (!sim.playing) sim.play(); info(); });
    const cv = canvasIn(box, "");
    const out = texBox(box);
    const map = (m, x, y) => (m === "raw" ? [x, y] : m === "lx" ? [x, Math.log10(y)] : [Math.log10(x), Math.log10(y)]);
    const ranges = { raw: [0, 9, 0, 50], lx: [0, 9, 0, 1.8], ll: [0, 1, 0, 1.8] };
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 280 : 300),
      draw(ctx, t, dt, C, S) {
        const L = LAWS[law];
        const ph = HM.reduced ? 1 : Math.max(0, Math.min(1, (t - start) / 1.6));
        const e = ph < 0.5 ? 2 * ph * ph : 1 - Math.pow(-2 * ph + 2, 2) / 2;
        const bx = { x: 44, y: 10, w: S.w - 58, h: S.h - 32 };
        const r = ranges[mode];
        const lab = { raw: ["x", "y"], lx: ["x", "log y"], ll: ["log x", "log y"] }[mode];
        const P = HM.plot(ctx, bx, { x0: r[0], x1: r[1], y0: r[2], y1: r[3], xt: mode === "ll" ? 0.2 : 1, yt: mode === "raw" ? 10 : 0.3, C, xl: lab[0], yl: lab[1], tf: (v) => (+v.toFixed(2) + "") });
        const Pf = HM.plot.bind(null);
        const rf = ranges[from];
        const Xf = (v) => bx.x + (v - rf[0]) / (rf[1] - rf[0]) * bx.w, Yf = (v) => bx.y + bx.h - (v - rf[2]) / (rf[3] - rf[2]) * bx.h;
        const pts = L.xs.map((x) => { const y = L.f(x); const [ax, ay] = map(from, x, y), [bx2, by] = map(mode, x, y); return [Xf(ax) + (P.X(bx2) - Xf(ax)) * e, Yf(ay) + (P.Y(by) - Yf(ay)) * e]; });
        HM.clip(ctx, bx, () => {
          if (ph >= 1) {
            // straight-line fit through the first and last points when the axes straighten them
            const a0 = map(mode, L.xs[0], L.f(L.xs[0])), a1 = map(mode, L.xs.at(-1), L.f(L.xs.at(-1)));
            const mid = map(mode, L.xs[3], L.f(L.xs[3]));
            const m = (a1[1] - a0[1]) / (a1[0] - a0[0]), c = a0[1] - m * a0[0];
            const straight = Math.abs(mid[1] - (m * mid[0] + c)) < 1e-6;
            if (straight && mode !== "raw") HM.curve(ctx, P, (x) => m * x + c, r[0], r[1], C.red, 2.5);
          }
          pts.forEach(([x, y]) => HM.dot(ctx, x, y, C.sea, 5.5, C.card));
        });
        if (ph >= 1 && S.playing) S.pause();
        cv.setAttribute("aria-label", `Data set ${law === "exp" ? "A" : "B"} plotted as ${lab[1]} against ${lab[0]}.`);
      },
    });
    function info() {
      const L = LAWS[law];
      const right = law === "exp" ? "lx" : "ll";
      if (mode === "raw") { out.innerHTML = `<p style="margin:0">A curve. Is it exponential ($y = ab^x$) or a power law ($y = ax^b$)? Choose a pair of log axes.</p>`; HM.math(out); return; }
      if (mode !== right) { out.innerHTML = `<p style="margin:0">Still curved: these are the wrong axes for this data, so it is <b>not</b> ${mode === "lx" ? "exponential" : "a power law"}. Try the other log plot.</p>`; HM.math(out); return; }
      const lg = Math.log10;
      if (law === "exp") out.innerHTML = `<p style="margin:0">Straight! So $\\log y = (\\log b)x + \\log a$. Gradient $= \\log b = ${N(lg(L.b), 3)}$, so $b = 10^{${N(lg(L.b), 3)}} = ${L.b}$. Intercept $= \\log a = ${N(lg(L.a), 3)}$, so $a = 10^{${N(lg(L.a), 3)}} = ${L.a}$. The law is $${L.tex}$.</p>`;
      else out.innerHTML = `<p style="margin:0">Straight! So $\\log y = b\\log x + \\log a$. Gradient $= b = ${L.b}$. Intercept $= \\log a = ${N(lg(L.a), 3)}$, so $a = 10^{${N(lg(L.a), 3)}} = ${L.a}$. The law is $${L.tex}$.</p>`;
      HM.math(out);
    }
    info();
  });

  /* =====================================================================
     11. Recurrence relations: cobweb + term plot
     ===================================================================== */
  mount("w-cobweb", (box) => {
    const ctl = controls(box);
    let a = 0.85, b = 40, u0 = 100, start = 0;
    const restart = () => { start = sim.t; if (!sim.playing && !HM.reduced) sim.play(); else sim.redraw(); info(); };
    HM.slider(ctl, { label: "$a$ (multiplier)", min: -1.2, max: 1.2, step: 0.05, value: a, fmt: (v) => N(v), oninput: (v) => { a = v; restart(); } });
    HM.slider(ctl, { label: "$b$ (added)", min: -40, max: 80, step: 5, value: b, oninput: (v) => { b = v; restart(); } });
    HM.slider(ctl, { label: "$u_0$", min: 0, max: 400, step: 10, value: u0, oninput: (v) => { u0 = v; restart(); } });
    const replay = HM.el("button", { class: "btn small", type: "button" }, "↺ Replay");
    box.append(HM.el("div", { class: "btn-row" }, replay));
    replay.addEventListener("click", restart);
    const cv = canvasIn(box, "");
    const out = texBox(box);
    const sim = HM.sim(cv, {
      height: (w) => (w < 560 ? 560 : 330),
      draw(ctx, t, dt, C, S) {
        const narrow = S.w < 560;
        const n = HM.reduced ? 30 : Math.min(30, Math.floor((t - start) * 3));
        const us = [u0];
        for (let i = 0; i < 30; i++) us.push(a * us[i] + b);
        const vals = us.filter((v) => isFinite(v));
        const lo = Math.min(0, ...vals.slice(0, 31).map((v) => Math.max(v, -2000))), hi = Math.max(10, ...vals.slice(0, 31).map((v) => Math.min(v, 2000)));
        const pad = (hi - lo) * 0.08;
        const R = [lo - pad, hi + pad];
        const b1 = narrow ? { x: 46, y: 10, w: S.w - 60, h: S.h / 2 - 30 } : { x: 46, y: 10, w: S.w / 2 - 66, h: S.h - 32 };
        const b2 = narrow ? { x: 46, y: S.h / 2 + 10, w: S.w - 60, h: S.h / 2 - 32 } : { x: S.w / 2 + 30, y: 10, w: S.w / 2 - 44, h: S.h - 32 };
        const step = niceStep(R[1] - R[0]);
        const P1 = HM.plot(ctx, b1, { x0: R[0], x1: R[1], y0: R[0], y1: R[1], xt: step, yt: step, C, xl: "uₙ", yl: "uₙ₊₁", tf: (v) => N(v, 0) });
        HM.clip(ctx, b1, () => {
          HM.curve(ctx, P1, (x) => x, R[0], R[1], C.muted, 1.5, { dash: [6, 4] });
          HM.curve(ctx, P1, (x) => a * x + b, R[0], R[1], C.sea, 2.5);
          ctx.strokeStyle = C.red; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(P1.X(us[0]), P1.Y(R[0] < 0 && R[1] > 0 ? 0 : R[0]));
          for (let i = 0; i < n; i++) { ctx.lineTo(P1.X(us[i]), P1.Y(us[i + 1])); ctx.lineTo(P1.X(us[i + 1]), P1.Y(us[i + 1])); }
          ctx.stroke();
          if (Math.abs(a) < 1) { const L = b / (1 - a); HM.dot(ctx, P1.X(L), P1.Y(L), C.gold, 6, C.card); }
        });
        HM.label(ctx, "cobweb", b1.x + b1.w - 4, b1.y + 10, { align: "right", size: 12, col: C.ink2, avoid: true });
        const P2 = HM.plot(ctx, b2, { x0: 0, x1: 30, y0: R[0], y1: R[1], xt: 5, yt: step, C, xl: "n", yl: "uₙ", tf: (v) => N(v, 0) });
        HM.clip(ctx, b2, () => {
          if (Math.abs(a) < 1) HM.curve(ctx, P2, () => b / (1 - a), 0, 30, C.gold, 1.5, { dash: [5, 4] });
          for (let i = 0; i <= n; i++) HM.dot(ctx, P2.X(i), P2.Y(us[i]), C.red, 3.5);
        });
        if (n >= 30 && S.playing) S.pause();
        cv.setAttribute("aria-label", `Cobweb diagram and term plot for u(n+1) = ${N(a)} u(n) + ${b}, starting at ${u0}. ${Math.abs(a) < 1 ? `The terms settle towards ${N(b / (1 - a), 1)}.` : "The terms do not settle."}`);
      },
    });
    function noLimit() {
      const L = a === 1 ? null : b / (1 - a);
      if (L !== null && Math.abs(u0 - L) < 1e-9) return `This start happens to be the fixed point $${N(L, 2).replace("−", "-")}$, so every term is the same, but any other start would move away: the recurrence has no limit in general.`;
      if (a === 1) return b === 0 ? "Every term equals $u_0$: the sequence is constant, but this recurrence has no limit in general." : `Each term ${b > 0 ? "adds" : "subtracts"} ${Math.abs(b)}, so the terms ${b > 0 ? "increase" : "decrease"} without end (the cobweb staircases away).`;
      if (a === -1) return "The terms flip between two values for ever: they are bounded but never settle, so there is no limit (the cobweb is a closed square).";
      if (a > 1) return `The terms run away from $${N(L, 2).replace("−", "-")}$, ${u0 > L ? "increasing" : "decreasing"} without end (the cobweb staircases away).`;
      return "The terms swing either side of the fixed point, further each time (the cobweb spirals outwards).";
    }
    function info() {
      const us = [u0]; for (let i = 0; i < 5; i++) us.push(a * us[i] + b);
      const ok = a > -1 && a < 1;
      out.innerHTML = `<p style="margin:0">$u_{n+1} = ${a === 0 ? (b < 0 ? "-" : "") + Math.abs(b) : `${N(a).replace("−", "-")}u_n ${b < 0 ? "-" : "+"} ${Math.abs(b)}`}$: $u_1 = ${N(us[1], 2).replace("−", "-")}$, $u_2 = ${N(us[2], 2).replace("−", "-")}$, $u_3 = ${N(us[3], 2).replace("−", "-")}$, … </p>` +
        (ok ? `<p style="margin:4px 0 0">A limit exists because $-1 \\lt ${N(a).replace("−", "-")} \\lt 1$. $L = \\dfrac{${b}}{1 - ${a < 0 ? `(${N(a).replace("−", "-")})` : N(a)}} = ${N(b / (1 - a), 2).replace("−", "-")}$.${a < 0 ? " Because $a$ is negative, the terms zig-zag above and below the limit: the cobweb spirals in." : ""}</p>`
          : `<p style="margin:4px 0 0"><b>No limit</b>: $a = ${N(a).replace("−", "-")}$ is not between $-1$ and $1$. ${noLimit()}</p>`);
      HM.math(out);
    }
    info();
    start = 0; if (!HM.reduced) sim.play();
  });
})();
