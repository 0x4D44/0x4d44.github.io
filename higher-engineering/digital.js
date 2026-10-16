/* Digital & programmable control — the Signal Locker on HMS Ratchet.
   Part 1 (pure code, also run under Node to pre-draw the static figures):
     logic netlists, evaluation, Boolean expressions, truth tables, SVG circuit drawing,
     NAND conversion, IC counting, flowchart programs and a tiny program interpreter.
   Part 2 (browser only): the widgets. */
(function (root) {
  "use strict";
  const Dig = {};

  /* =====================================================================
     1. Netlists.  { inputs:["A","B"], gates:[{type:"AND", in:["A","B"], out:"X"}], outputs:["X"] }
     ===================================================================== */
  const inv = (t) => t === "NOT" || t === "NAND" || t === "NOR";
  Dig.GATES = ["AND", "OR", "NOT", "NAND", "NOR", "EOR"];
  function norm(net) {
    return {
      inputs: net.inputs.slice(), outputs: net.outputs.slice(),
      gates: net.gates.map((g, i) => ({ id: g.id || "g" + (i + 1), type: g.type, in: g.in.slice(), out: g.out })),
    };
  }
  Dig.norm = norm;
  function fn(type, v) {
    switch (type) {
      case "AND": return v.every(Boolean) ? 1 : 0;
      case "OR": return v.some(Boolean) ? 1 : 0;
      case "NOT": return v[0] ? 0 : 1;
      case "NAND": return v.every(Boolean) ? 0 : 1;
      case "NOR": return v.some(Boolean) ? 0 : 1;
      case "EOR": return v.reduce((a, b) => a ^ (b ? 1 : 0), 0);
    }
    throw new Error("gate " + type);
  }
  Dig.fn = fn;
  function levels(net) {
    const prod = {}; net.gates.forEach((g) => { prod[g.out] = g; });
    const lvl = {}; net.inputs.forEach((i) => { lvl[i] = 0; });
    const busy = {};
    const L = (n) => {
      if (n in lvl) return lvl[n];
      const g = prod[n]; if (!g) throw new Error("undriven net " + n);
      if (busy[n]) throw new Error("loop at " + n);
      busy[n] = 1; lvl[n] = 1 + Math.max(...g.in.map(L)); return lvl[n];
    };
    net.gates.forEach((g) => L(g.out));
    return { lvl, prod };
  }
  Dig.levels = levels;
  /* every net's value for given input values {A:1,B:0} (all values are 0 or 1) */
  Dig.evalNet = function (net, inp) {
    const v = {}; net.inputs.forEach((i) => { v[i] = inp[i] ? 1 : 0; });
    const { lvl } = levels(net);
    [...net.gates].sort((a, b) => lvl[a.out] - lvl[b.out]).forEach((g) => { v[g.out] = fn(g.type, g.in.map((n) => v[n])); });
    return v;
  };
  /* binary-ordered rows, first input is the most significant bit */
  Dig.rows = function (inputs) {
    const n = inputs.length, out = [];
    for (let k = 0; k < (1 << n); k++) { const r = {}; inputs.forEach((nm, i) => { r[nm] = (k >> (n - 1 - i)) & 1; }); out.push(r); }
    return out;
  };
  Dig.table = function (net, outName) {
    const o = outName || net.outputs[0];
    return Dig.rows(net.inputs).map((r) => ({ in: r, q: Dig.evalNet(net, r)[o] }));
  };
  Dig.sameFunction = function (a, b, outA, outB) {
    return Dig.rows(a.inputs).every((r) => Dig.evalNet(a, r)[outA || a.outputs[0]] === Dig.evalNet(b, r)[outB || b.outputs[0]]);
  };

  /* =====================================================================
     2. Boolean expressions as TeX.  AND = \cdot, OR = +, NOT = overbar, EOR = \oplus
     ===================================================================== */
  Dig.expr = function (netIn, outName) {
    const net = norm(netIn), { prod } = levels(net);
    const build = (n) => {
      const g = prod[n];
      if (!g) return { t: n, k: "atom" };
      const ch = g.in.map(build);
      const par = (c, bad) => (bad.includes(c.k) ? "(" + c.t + ")" : c.t);
      switch (g.type) {
        case "NOT": return { t: "\\overline{" + ch[0].t + "}", k: "bar" };
        case "AND": return { t: ch.map((c) => par(c, ["or", "eor"])).join(" \\cdot "), k: "and" };
        case "OR": return { t: ch.map((c) => c.t).join(" + "), k: "or" };
        case "EOR": return { t: ch.map((c) => par(c, ["and", "or", "eor"])).join(" \\oplus "), k: "eor" };
        case "NAND": return { t: "\\overline{" + ch.map((c) => par(c, ["or", "eor"])).join(" \\cdot ") + "}", k: "bar" };
        case "NOR": return { t: "\\overline{" + ch.map((c) => c.t).join(" + ") + "}", k: "bar" };
      }
    };
    return build(outName || net.outputs[0]).t;
  };
  const lit = (nm, v) => (v ? nm : "\\overline{" + nm + "}");

  /* sum of products from a truth-table column: tableRows = [{in:{A:0,..}, q:0|1}] */
  Dig.sop = function (inputs, rows, outName) {
    const ones = rows.filter((r) => r.q);
    const q = outName || "Q";
    if (!ones.length) return { tex: q + " = 0", net: null, terms: [], constant: 0 };
    if (ones.length === rows.length) return { tex: q + " = 1", net: null, terms: [], constant: 1 };
    const terms = ones.map((r) => inputs.map((nm) => lit(nm, r.in[nm])).join(" \\cdot "));
    const tex = q + " = " + terms.join(" + ");
    // netlist: NOT gates for inverted literals, an AND per term, then OR (a tree if there are more than four terms)
    const gates = [], need = {};
    ones.forEach((r) => inputs.forEach((nm) => { if (!r.in[nm]) need[nm] = 1; }));
    inputs.forEach((nm) => { if (need[nm]) gates.push({ type: "NOT", in: [nm], out: "n" + nm }); });
    const termNets = ones.map((r, i) => {
      const ins = inputs.map((nm) => (r.in[nm] ? nm : "n" + nm));
      if (ins.length === 1) return ins[0];
      const out = "p" + (i + 1); gates.push({ type: "AND", in: ins, out }); return out;
    });
    let level = termNets, k = 0;
    while (level.length > 1) {
      const nx = [];
      for (let i = 0; i < level.length; i += 4) {
        const grp = level.slice(i, i + 4);
        if (grp.length === 1) { nx.push(grp[0]); continue; }
        const out = level.length <= 4 ? q : "s" + (++k); gates.push({ type: "OR", in: grp, out }); nx.push(out);
      }
      level = nx;
    }
    if (level[0] !== q) {
      // a single term that is a bare input (e.g. Q = A): nothing to draw but a wire
      return { tex, net: null, terms, constant: null };
    }
    return { tex, net: { inputs: inputs.slice(), gates, outputs: [q] }, terms, constant: null };
  };

  /* =====================================================================
     3. Drawing circuits as SVG strings.
     ===================================================================== */
  const BODY_W = { NOT: 30, AND: 52, OR: 52, EOR: 52, NAND: 52, NOR: 52 };
  const BUB = 9;
  const outW = (t) => BODY_W[t] + (inv(t) ? BUB : 0);
  const gateH = (g) => (g.type === "NOT" ? 28 : g.in.length > 2 ? 56 : 40);
  const PINS = { 1: [0], 2: [-10, 10], 3: [-18, 0, 18], 4: [-21, -7, 7, 21] };
  function backX(type, h, y) {
    if (type === "OR" || type === "NOR" || type === "EOR") {
      const c = 0.45 * h, x = (c / 2) * (1 - (4 * y * y) / (h * h));
      return type === "EOR" ? x - 7 : x;
    }
    return 0;
  }
  function bodyPath(type, h) {
    const w = BODY_W[type], r = h / 2;
    if (type === "NOT") return `M0,${-r} L${w},0 L0,${r} Z`;
    if (type === "AND" || type === "NAND") return `M0,${-r} H${w - r} A${r},${r} 0 0 1 ${w - r},${r} H0 Z`;
    const c = 0.45 * h;
    return `M0,${-r} Q${w * 0.55},${-r} ${w},0 Q${w * 0.55},${r} 0,${r} Q${c},0 0,${-r} Z`;
  }
  const f1 = (x) => (Math.round(x * 10) / 10).toString();
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  Dig.layout = function (netIn, o) {
    o = o || {};
    const net = norm(netIn), { lvl, prod } = levels(net);
    const gl = {}; net.gates.forEach((g) => { gl[g.id] = lvl[g.out]; });
    const maxL = net.gates.length ? Math.max(...net.gates.map((g) => gl[g.id])) : 0;
    const rowH = 14 + Math.max(40, ...net.gates.map(gateH));
    const yOf = {};
    net.inputs.forEach((n, i) => { yOf[n] = i * rowH; });
    const colGates = [];
    for (let l = 1; l <= maxL; l++) {
      const cg = net.gates.filter((g) => gl[g.id] === l);
      cg.forEach((g) => { g.bary = g.in.reduce((a, n) => a + yOf[n], 0) / g.in.length; });
      cg.sort((a, b) => a.bary - b.bary);
      let prev = -1e9;
      cg.forEach((g) => { g.y = Math.max(g.bary, prev + rowH); prev = g.y; yOf[g.out] = g.y; });
      colGates[l] = cg;
    }
    // channels: lanes for the nets each column consumes, stubs for nets that jump over a column
    const consumed = [], stubs = [];
    for (let l = 1; l <= maxL; l++) { consumed[l] = []; stubs[l] = []; }
    net.gates.forEach((g) => g.in.forEach((n) => {
      const l = gl[g.id];
      if (!consumed[l].includes(n)) consumed[l].push(n);
      if (l - lvl[n] > 1) { const s = lvl[n] + 1; if (!stubs[s].includes(n)) stubs[s].push(n); }
    }));
    const longNets = []; net.gates.forEach((g) => g.in.forEach((n) => { if (gl[g.id] - lvl[n] > 1 && !longNets.includes(n)) longNets.push(n); }));
    const termR = o.vals ? 9 : 4;
    const inLabelW = 22;
    const startX = inLabelW + 4 + termR * 2 + 2; // where wires leave the input terminals
    const colX = [], chL = [], leftEdge = [];
    let prevRight = startX;
    for (let l = 1; l <= maxL; l++) {
      consumed[l].sort((a, b) => yOf[a] - yOf[b]);
      const w = 16 + 7 * consumed[l].length + 7 * stubs[l].length + 8;
      leftEdge[l] = prevRight; chL[l] = w;
      colX[l] = prevRight + w;
      prevRight = colX[l] + Math.max(...colGates[l].map((g) => outW(g.type)));
    }
    const laneX = (l, n) => leftEdge[l] + 9 + 7 * consumed[l].indexOf(n);
    const stubX = (n) => { const s = lvl[n] + 1; return leftEdge[s] + 9 + 7 * consumed[s].length + 7 * stubs[s].indexOf(n); };
    const gutterY = (n) => -(12 + 6 * longNets.indexOf(n));
    const srcX = (n) => (lvl[n] === 0 ? startX : colX[lvl[n]] + outW(prod[n].type));
    const gatesL = net.gates.map((g) => {
      const h = gateH(g), l = gl[g.id], x = colX[l];
      const offs = PINS[g.in.length] || PINS[4];
      return { g, x, y: g.y, h, pins: g.in.map((n, i) => ({ net: n, x: x + backX(g.type, h, offs[i]), y: g.y + offs[i] })), outx: x + outW(g.type), outy: g.y };
    });
    const wires = [], byNet = {};
    gatesL.forEach((G) => G.pins.forEach((p, i) => {
      const n = p.net, sx = srcX(n), sy = yOf[n], l = gl[G.g.id], long = l - lvl[n] > 1;
      const lx = laneX(l, n);
      const d = long
        ? `M${f1(sx)},${f1(sy)} H${f1(stubX(n))} V${f1(gutterY(n))} H${f1(lx)} V${f1(p.y)} H${f1(p.x)}`
        : `M${f1(sx)},${f1(sy)} H${f1(lx)} V${f1(p.y)} H${f1(p.x)}`;
      const w = { net: n, d, to: G.g.id, pin: i, firstX: long ? stubX(n) : lx, sy, lx, py: p.y };
      wires.push(w); (byNet[n] = byNet[n] || []).push(w);
    }));
    // outputs
    const lastRight = prevRight;
    const outX = lastRight + 20 + termR * 2;
    const outs = net.outputs.map((n) => ({ net: n, y: yOf[n], x: outX, from: srcX(n) }));
    // bounding box
    let minY = 1e9, maxY = -1e9;
    gatesL.forEach((G) => { minY = Math.min(minY, G.y - G.h / 2); maxY = Math.max(maxY, G.y + G.h / 2); });
    net.inputs.forEach((n) => { minY = Math.min(minY, yOf[n] - 10); maxY = Math.max(maxY, yOf[n] + 10); });
    if (longNets.length) minY = Math.min(minY, gutterY(longNets[longNets.length - 1]) - 6);
    return { net, lvl, prod, gatesL, wires, byNet, outs, yOf, startX, termR, inLabelW, minY, maxY, maxL, W: outX + 30, srcX, colX };
  };

  /* opts: label (aria), vals {net:0|1} (interactive: terminals show values), flow (animated dashes),
           nets (label internal nets), tags (gate type text), hl (Set of gate ids to highlight),
           fresh (Set of gate ids drawn as 'new'), width (max-width px), cls */
  Dig.svg = function (netIn, o) {
    o = o || {};
    const L = Dig.layout(netIn, o), pad = 8;
    const H = L.maxY - L.minY + pad * 2, W = L.W + pad;
    const ty = pad - L.minY;
    const hl = o.hl || new Set(), fresh = o.fresh || new Set();
    const parts = [];
    parts.push(`<svg class="dg-svg${o.cls ? " " + o.cls : ""}" viewBox="0 0 ${f1(W)} ${f1(H)}" style="max-width:${o.width || Math.round(W * 1.45)}px" role="img" aria-label="${esc(o.label || "Logic circuit")}">`);
    parts.push(`<g transform="translate(${pad},${f1(ty)})">`);
    // wires first
    L.wires.forEach((w) => {
      parts.push(`<path class="dg-wire" data-net="${esc(w.net)}" d="${w.d}"/>`);
      if (o.flow) parts.push(`<path class="dg-flow" data-net="${esc(w.net)}" d="${w.d}"/>`);
    });
    // fork dots
    Object.keys(L.byNet).forEach((n) => {
      const ws = L.byNet[n];
      if (ws.length < 2 && !(L.outs.some((q) => q.net === n))) return;
      const w0 = ws.reduce((a, b) => (a.firstX <= b.firstX ? a : b));
      parts.push(`<circle class="dg-dot" data-net="${esc(n)}" cx="${f1(w0.firstX)}" cy="${f1(w0.sy)}" r="2.6"/>`);
    });
    // output wires
    L.outs.forEach((q) => {
      parts.push(`<path class="dg-wire" data-net="${esc(q.net)}" d="M${f1(q.from)},${f1(q.y)} H${f1(q.x - L.termR)}"/>`);
      if (o.flow) parts.push(`<path class="dg-flow" data-net="${esc(q.net)}" d="M${f1(q.from)},${f1(q.y)} H${f1(q.x - L.termR)}"/>`);
    });
    // inputs
    L.net.inputs.forEach((n) => {
      const y = L.yOf[n], cx = L.inLabelW + 4 + L.termR;
      if (!L.byNet[n]) return;
      parts.push(`<path class="dg-wire" data-net="${esc(n)}" d="M${f1(cx + L.termR)},${f1(y)} H${f1(L.startX)}"/>`);
    });
    L.net.inputs.forEach((n) => {
      const y = L.yOf[n], cx = L.inLabelW + 4 + L.termR;
      parts.push(`<text class="dg-lab" x="${L.inLabelW - 2}" y="${f1(y + 5)}" text-anchor="end">${esc(n)}</text>`);
      parts.push(`<circle class="dg-term" data-net="${esc(n)}" cx="${f1(cx)}" cy="${f1(y)}" r="${L.termR}"/>`);
      if (o.vals) parts.push(`<text class="dg-val" data-net="${esc(n)}" x="${f1(cx)}" y="${f1(y + 4)}" text-anchor="middle">${o.vals[n] ? 1 : 0}</text>`);
    });
    // gates
    L.gatesL.forEach((G) => {
      const t = G.g.type, h = G.h, w = BODY_W[t];
      const cls = "dg-gate" + (hl.has(G.g.id) ? " hl" : "") + (fresh.has(G.g.id) ? " fresh" : "");
      parts.push(`<g class="${cls}" data-gate="${esc(G.g.id)}" data-out="${esc(G.g.out)}" transform="translate(${f1(G.x)},${f1(G.y)})">`);
      parts.push(`<path class="dg-body" d="${bodyPath(t, h)}"/>`);
      if (t === "EOR") parts.push(`<path class="dg-extra" d="M-7,${-h / 2} Q${f1(0.45 * h - 7)},0 -7,${h / 2}"/>`);
      if (inv(t)) parts.push(`<circle class="dg-bub" cx="${w + 4.5}" cy="0" r="4.5"/>`);
      if (o.tags !== false) parts.push(`<text class="dg-tag" x="${f1(w / 2 + (t === "NOT" ? -4 : 0))}" y="${f1(h / 2 + 11)}" text-anchor="middle">${t}</text>`);
      parts.push(`</g>`);
      if (o.nets && !L.net.outputs.includes(G.g.out)) parts.push(`<text class="dg-net" x="${f1(G.outx + 4)}" y="${f1(G.outy - 6)}">${esc(G.g.out)}</text>`);
    });
    // outputs
    L.outs.forEach((q) => {
      parts.push(`<circle class="dg-term" data-net="${esc(q.net)}" cx="${f1(q.x)}" cy="${f1(q.y)}" r="${L.termR}"/>`);
      if (o.vals) parts.push(`<text class="dg-val" data-net="${esc(q.net)}" x="${f1(q.x)}" y="${f1(q.y + 4)}" text-anchor="middle">${o.vals[q.net] ? 1 : 0}</text>`);
      parts.push(`<text class="dg-lab" x="${f1(q.x + L.termR + 4)}" y="${f1(q.y + 5)}">${esc(q.net)}</text>`);
    });
    parts.push(`</g></svg>`);
    return parts.join("");
  };

  /* browser: repaint wire/terminal classes and values from {net: 0|1} */
  Dig.paint = function (svgRoot, vals) {
    svgRoot.querySelectorAll("[data-net]").forEach((el) => {
      const v = vals[el.getAttribute("data-net")];
      el.classList.toggle("hi", !!v); el.classList.toggle("lo", !v);
      if (el.tagName === "text" && el.classList.contains("dg-val")) el.textContent = v ? "1" : "0";
    });
    svgRoot.querySelectorAll(".dg-gate").forEach((g) => g.classList.toggle("on", !!vals[g.getAttribute("data-out")]));
  };

  /* =====================================================================
     4. NAND conversion
     ===================================================================== */
  const isNot = (g) => g.type === "NAND" && g.in.length === 2 && g.in[0] === g.in[1];
  Dig.isNot = isNot;
  function clone(net) { return { inputs: net.inputs.slice(), outputs: net.outputs.slice(), gates: net.gates.map((g) => ({ id: g.id, type: g.type, in: g.in.slice(), out: g.out, from: g.from, role: g.role })) }; }
  /* swap every gate for NAND gates (all NAND, tied inputs for a NOT) */
  Dig.nandSwap = function (netIn) {
    const net = norm(netIn), gates = [];
    let k = 0;
    const mk = (ins, out, role, from) => { gates.push({ id: "n" + (++k), type: "NAND", in: ins, out, role, from }); return out; };
    net.gates.forEach((g) => {
      const o = g.out, a = g.in, p = g.id;
      switch (g.type) {
        case "NAND": mk(a, o, "keep", p); break;
        case "NOT": mk([a[0], a[0]], o, "not", p); break;
        case "AND": { const t = mk(a, o + "_n", "and-nand", p); mk([t, t], o, "and-not", p); break; }
        case "OR": { const ns = a.map((x, i) => mk([x, x], o + "_i" + (i + 1), "or-not", p)); mk(ns, o, "or-nand", p); break; }
        case "NOR": { const ns = a.map((x, i) => mk([x, x], o + "_i" + (i + 1), "or-not", p)); const t = mk(ns, o + "_o", "or-nand", p); mk([t, t], o, "nor-not", p); break; }
        case "EOR": { const t = mk([a[0], a[1]], o + "_t", "eor", p); const u = mk([a[0], t], o + "_u", "eor", p); const v = mk([a[1], t], o + "_v", "eor", p); mk([u, v], o, "eor", p); break; }
      }
    });
    return { inputs: net.inputs, outputs: net.outputs, gates };
  };
  /* find double-inversion pairs: a NOT whose input comes from another NOT */
  Dig.doubleInv = function (netIn) {
    const net = norm(netIn), prod = {}; net.gates.forEach((g) => { prod[g.out] = g; });
    const pairs = [];
    net.gates.forEach((x) => { if (isNot(x)) { const y = prod[x.in[0]]; if (y && isNot(y) && !net.outputs.includes(x.out)) pairs.push([y.id, x.id]); } });
    return pairs;
  };
  Dig.cancelDouble = function (netIn) {
    const net = clone(norm(netIn));
    let again = true;
    while (again) {
      again = false;
      const prod = {}; net.gates.forEach((g) => { prod[g.out] = g; });
      for (const x of net.gates) {
        if (!isNot(x) || net.outputs.includes(x.out)) continue;
        const y = prod[x.in[0]];
        if (!y || !isNot(y)) continue;
        const src = y.in[0];
        net.gates.forEach((g) => { g.in = g.in.map((n) => (n === x.out ? src : n)); });
        net.gates.splice(net.gates.indexOf(x), 1);
        const used = net.gates.some((g) => g.in.includes(y.out)) || net.outputs.includes(y.out);
        if (!used) net.gates.splice(net.gates.indexOf(y), 1);
        again = true; break;
      }
    }
    return net;
  };
  /* merge identical gates (same inputs): returns {net, merged:[[keepId, dropId]]} */
  Dig.shareDup = function (netIn) {
    const net = clone(norm(netIn)), merged = [];
    let again = true;
    while (again) {
      again = false;
      const seen = {};
      for (const g of net.gates) {
        const key = g.type + ":" + g.in.slice().sort().join(",");
        if (seen[key] && !net.outputs.includes(g.out)) {
          const keep = seen[key];
          net.gates.forEach((q) => { q.in = q.in.map((n) => (n === g.out ? keep.out : n)); });
          net.gates.splice(net.gates.indexOf(g), 1); merged.push([keep.id, g.id]); again = true; break;
        }
        if (!seen[key]) seen[key] = g;
      }
    }
    return { net, merged };
  };
  /* the whole story, as steps for the converter widget */
  Dig.nandSteps = function (netIn) {
    const orig = norm(netIn), steps = [];
    steps.push({ key: "orig", net: orig, title: "The circuit as drawn", hl: new Set(), fresh: new Set() });
    const swapped = Dig.nandSwap(orig);
    steps.push({ key: "swap", net: swapped, title: "Swap every gate for its NAND version", hl: new Set(), fresh: new Set(swapped.gates.map((g) => g.id)) });
    const pairs = Dig.doubleInv(swapped);
    if (pairs.length) {
      steps.push({ key: "find", net: swapped, title: "Spot the double inversions", hl: new Set(pairs.flat()), fresh: new Set(), pairs });
      let cancelled = Dig.cancelDouble(swapped);
      steps.push({ key: "cancel", net: cancelled, title: "Cancel each pair", hl: new Set(), fresh: new Set() });
      const sh = Dig.shareDup(cancelled);
      if (sh.merged.length) steps.push({ key: "share", net: sh.net, title: "Share identical gates", hl: new Set(), fresh: new Set(), merged: sh.merged });
    } else {
      const sh = Dig.shareDup(swapped);
      if (sh.merged.length) steps.push({ key: "share", net: sh.net, title: "Share identical gates", hl: new Set(), fresh: new Set(), merged: sh.merged });
    }
    return steps;
  };
  /* ICs for an all-NAND circuit: quad 2-input (7400), triple 3-input (7410), dual 4-input (7420) */
  Dig.nandIcs = function (net) {
    const n = { 2: 0, 3: 0, 4: 0 };
    net.gates.forEach((g) => { n[g.in.length] = (n[g.in.length] || 0) + 1; });
    const c2 = Math.ceil(n[2] / 4), c3 = Math.ceil(n[3] / 3), c4 = Math.ceil(n[4] / 2);
    return { n2: n[2], n3: n[3], n4: n[4], c2, c3, c4, total: c2 + c3 + c4, gates: net.gates.length };
  };
  /* ICs for a mixed-gate circuit, assuming the standard 7400-family packages for 2-input gates and NOTs */
  Dig.mixedIcs = function (net) {
    const per = { NOT1: 6, AND2: 4, OR2: 4, NAND2: 4, NOR2: 4, EOR2: 4, AND3: 3, AND4: 2, NAND3: 3, NAND4: 2, NOR3: 3 }, cnt = {};
    net.gates.forEach((g) => { const k = g.type + g.in.length; cnt[k] = (cnt[k] || 0) + 1; });
    let total = 0; const kinds = [];
    Object.keys(cnt).forEach((k) => {
      const cap = per[k] == null ? null : per[k];
      if (cap == null) { kinds.push({ k, n: cnt[k], chips: null }); return; }
      const chips = Math.ceil(cnt[k] / cap); total += chips; kinds.push({ k, n: cnt[k], chips });
    });
    return { total, kinds, gates: net.gates.length, exact: kinds.every((q) => q.chips != null) };
  };

  /* =====================================================================
     5. A small expression evaluator for programs (no eval)
     ===================================================================== */
  function tokenise(s) {
    const re = /\s*(\d+(?:\.\d+)?|[A-Za-z_][A-Za-z_0-9]*|<=|>=|<>|[-+*\/()<>=])/gy;
    const out = []; let m; re.lastIndex = 0;
    while (re.lastIndex < s.length && (m = re.exec(s))) out.push(m[1]);
    if (re.lastIndex < s.replace(/\s+$/, "").length) throw new Error("bad character in: " + s);
    return out;
  }
  Dig.evalExpr = function (src, env) {
    const t = tokenise(src); let i = 0;
    const peek = () => t[i], next = () => t[i++];
    function prim() {
      const x = next();
      if (x === undefined) throw new Error("unexpected end of: " + src);
      if (x === "(") { const v = orE(); if (next() !== ")") throw new Error("missing ) in: " + src); return v; }
      if (x === "-") return -prim();
      if (/^\d/.test(x)) return parseFloat(x);
      if (x === "not") return prim() ? 0 : 1;
      if (!(x in env)) throw new Error("unknown name " + x);
      return env[x];
    }
    function mulE() { let v = prim(); while (peek() === "*" || peek() === "/") { const o = next(), r = prim(); v = o === "*" ? v * r : v / r; } return v; }
    function addE() { let v = mulE(); while (peek() === "+" || peek() === "-") { const o = next(), r = mulE(); v = o === "+" ? v + r : v - r; } return v; }
    function cmpE() {
      let v = addE();
      while (["<", ">", "<=", ">=", "=", "<>"].includes(peek())) {
        const o = next(), r = addE();
        v = (o === "<" ? v < r : o === ">" ? v > r : o === "<=" ? v <= r : o === ">=" ? v >= r : o === "=" ? v === r : v !== r) ? 1 : 0;
      }
      return v;
    }
    function notE() { if (peek() === "not") { next(); return notE() ? 0 : 1; } return cmpE(); }
    function andE() { let v = notE(); while (peek() === "and") { next(); const r = notE(); v = v && r ? 1 : 0; } return v; }
    function orE() { let v = andE(); while (peek() === "or") { next(); const r = andE(); v = v || r ? 1 : 0; } return v; }
    const v = orE();
    if (i < t.length) throw new Error("unexpected " + t[i] + " in: " + src);
    return v;
  };

  /* =====================================================================
     6. Programs (flowchart node graphs) and their interpreter
        node kinds: term, io (parallelogram), proc (rectangle), dec (diamond)
        ops: {o:"out1", v:expr} digital output · {p:"out1", v:expr} PWM duty % · {l:"n", v:expr} variable
        edges (next / yes / no): "id" or {to, exit, enter, via:[[col,row],...]}
     ===================================================================== */
  const to = (e) => (e == null ? null : typeof e === "string" ? e : e.to);
  Dig.PROGRAMS = {
    gun: {
      id: "gun", title: "Gun-port alarm",
      blurb: "Warn the gun crew when a port lid is open (input 1 = 1) but the gun has not been run out (input 2 = 0). Red lamp on output 1 flashes, buzzer on output 2 sounds. Otherwise both stay off.",
      inputs: [{ id: "in1", label: "Port lid open" }, { id: "in2", label: "Gun run out" }],
      analog: [], outputs: [{ id: "out1", label: "Red lamp", kind: "lamp" }, { id: "out2", label: "Buzzer", kind: "buzzer" }],
      start: "n0",
      nodes: {
        n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
        n1: { k: "dec", t: "in1 = 1 AND\nin2 = 0 ?", c: "in1 = 1 and in2 = 0", x: 1, y: 1, yes: "n2", no: { to: "n6", exit: "r" } },
        n2: { k: "io", t: "out2 = 1 (buzzer ON)", ops: [{ o: "out2", v: "1" }], x: 1, y: 2, next: "n3" },
        n3: { k: "io", t: "out1 = 1 (lamp ON)", ops: [{ o: "out1", v: "1" }], x: 1, y: 3, next: "n4" },
        n4: { k: "proc", t: "Wait 0.5 s", wait: 0.5, x: 1, y: 4, next: "n5" },
        n5: { k: "io", t: "out1 = 0 (lamp OFF)", ops: [{ o: "out1", v: "0" }], x: 1, y: 5, next: "n5b" },
        n5b: { k: "proc", t: "Wait 0.5 s", wait: 0.5, x: 1, y: 6, next: { to: "n1", exit: "l", enter: "t", via: [[-0.15, 6], [-0.15, 0.55], [1, 0.55]] } },
        n6: { k: "io", t: "out1 = 0 , out2 = 0", ops: [{ o: "out1", v: "0" }, { o: "out2", v: "0" }], x: 2.35, y: 1, next: { to: "n1", exit: "t", enter: "t", via: [[2.35, 0.55], [1, 0.55]] } },
      },
      lines: [
        { t: "main:", n: "n1" },
        { t: "  if in1 = 1 and in2 = 0 then", n: "n1" },
        { t: "    out2 = 1          // buzzer on", n: "n2" },
        { t: "    out1 = 1          // lamp on", n: "n3" },
        { t: "    wait 0.5 s", n: "n4" },
        { t: "    out1 = 0          // lamp off", n: "n5" },
        { t: "    wait 0.5 s", n: "n5b" },
        { t: "  else", n: null },
        { t: "    out1 = 0 : out2 = 0", n: "n6" },
        { t: "  end if", n: null },
        { t: "  goto main", n: null, loop: true },
      ],
    },
    boiler: {
      id: "boiler", title: "Boiler thermostat",
      blurb: "The galley boiler has a temperature sensor on analogue input 1 (0 to 255 stands for 0 to 100 °C) and a master switch on input 1. The heater (output 1) runs when the switch is on and the temperature is below 60 °C. The warning lamp (output 2) lights above 90 °C.",
      inputs: [{ id: "in1", label: "Master switch" }],
      analog: [{ id: "an1", label: "Temperature sensor", unit: "°C", scale: 100 / 255, max: 255 }],
      outputs: [{ id: "out1", label: "Heater", kind: "lamp" }, { id: "out2", label: "Warning lamp", kind: "lamp" }],
      start: "n0",
      nodes: {
        n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
        n1: { k: "proc", t: "temp = an1 × 100 ÷ 255", ops: [{ l: "temp", v: "an1 * 100 / 255" }], x: 1, y: 1, next: "n2" },
        n2: { k: "dec", t: "in1 = 1 AND\ntemp < 60 ?", c: "in1 = 1 and temp < 60", x: 1, y: 2, yes: { to: "n3", exit: "r" }, no: "n4" },
        n3: { k: "io", t: "out1 = 1 (heater ON)", ops: [{ o: "out1", v: "1" }], x: 2.4, y: 2, next: { to: "n5", exit: "b", enter: "t", via: [[2.4, 3.5], [1, 3.5]] } },
        n4: { k: "io", t: "out1 = 0 (heater OFF)", ops: [{ o: "out1", v: "0" }], x: 1, y: 3, next: "n5" },
        n5: { k: "dec", t: "temp > 90 ?", c: "temp > 90", x: 1, y: 4, yes: { to: "n6", exit: "r" }, no: "n7" },
        n6: { k: "io", t: "out2 = 1 (lamp ON)", ops: [{ o: "out2", v: "1" }], x: 2.4, y: 4, next: { to: "n8", exit: "b", enter: "t", via: [[2.4, 5.5], [1, 5.5]] } },
        n7: { k: "io", t: "out2 = 0 (lamp OFF)", ops: [{ o: "out2", v: "0" }], x: 1, y: 5, next: "n8" },
        n8: { k: "proc", t: "Wait 1 s", wait: 1, x: 1, y: 6, next: { to: "n1", exit: "l", enter: "t", via: [[-0.15, 6], [-0.15, 0.55], [1, 0.55]] } },
      },
      lines: [
        { t: "main:", n: "n1" },
        { t: "  temp = an1 * 100 / 255", n: "n1" },
        { t: "  if in1 = 1 and temp < 60 then", n: "n2" },
        { t: "    out1 = 1          // heater on", n: "n3" },
        { t: "  else", n: null },
        { t: "    out1 = 0          // heater off", n: "n4" },
        { t: "  end if", n: null },
        { t: "  if temp > 90 then", n: "n5" },
        { t: "    out2 = 1          // warning lamp on", n: "n6" },
        { t: "  else", n: null },
        { t: "    out2 = 0", n: "n7" },
        { t: "  end if", n: null },
        { t: "  wait 1 s", n: "n8" },
        { t: "  goto main", n: null, loop: true },
      ],
    },
    soft: {
      id: "soft", title: "Motor soft-start (finite loop)",
      blurb: "Press and hold the start switch (input 1). The capstan motor (output 1, PWM) steps up through 25 %, 50 %, 75 % and 100 % duty, one second each: a finite loop that runs four times. Running lamp on output 2. Release the switch and everything stops.",
      inputs: [{ id: "in1", label: "Start switch" }], analog: [],
      outputs: [{ id: "out1", label: "Motor (PWM)", kind: "motor" }, { id: "out2", label: "Running lamp", kind: "lamp" }],
      start: "n0",
      nodes: {
        n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
        n1: { k: "io", t: "PWM out1 = 0 % , out2 = 0", ops: [{ p: "out1", v: "0" }, { o: "out2", v: "0" }], x: 1, y: 1, next: "n2" },
        n2: { k: "dec", t: "in1 = 1 ?", c: "in1 = 1", x: 1, y: 2, yes: "n3", no: { to: "n1", exit: "l", enter: "l", via: [[-0.2, 2], [-0.2, 1]] } },
        n3: { k: "proc", t: "out2 = 1 , n = 1", ops: [{ o: "out2", v: "1" }, { l: "n", v: "1" }], x: 1, y: 3, next: "n4" },
        n4: { k: "io", t: "PWM out1 = n × 25 %", ops: [{ p: "out1", v: "n * 25" }], x: 1, y: 4, next: "n5" },
        n5: { k: "proc", t: "Wait 1 s", wait: 1, x: 1, y: 5, next: "n6" },
        n6: { k: "proc", t: "n = n + 1", ops: [{ l: "n", v: "n + 1" }], x: 1, y: 6, next: "n7" },
        n7: { k: "dec", t: "n ≤ 4 ?", c: "n <= 4", x: 1, y: 7, yes: { to: "n4", exit: "r", enter: "r", via: [[2.2, 7], [2.2, 4]] }, no: "n8" },
        n8: { k: "dec", t: "in1 = 1 ?", c: "in1 = 1", x: 1, y: 8, yes: { to: "n8", exit: "r", enter: "b", via: [[2.1, 8], [2.1, 8.62], [1, 8.62]] }, no: { to: "n1", exit: "l", enter: "l", via: [[-0.2, 8], [-0.2, 1]] } },
      },
      lines: [
        { t: "main:", n: "n1" },
        { t: "  pwm out1 = 0 : out2 = 0", n: "n1" },
        { t: "  if in1 = 0 then goto main", n: "n2" },
        { t: "  out2 = 1 : n = 1", n: "n3" },
        { t: "ramp:", n: "n4" },
        { t: "  pwm out1 = n * 25", n: "n4" },
        { t: "  wait 1 s", n: "n5" },
        { t: "  n = n + 1", n: "n6" },
        { t: "  if n <= 4 then goto ramp    // finite loop", n: "n7" },
        { t: "run:", n: "n8" },
        { t: "  if in1 = 1 then goto run    // hold at 100 %", n: "n8" },
        { t: "  goto main", n: null, loop: true },
      ],
    },
    dial: {
      id: "dial", title: "Speed dial with emergency stop",
      blurb: "A dial on analogue input 1 (0 to 255) sets the capstan motor speed on output 1 (PWM). The emergency stop (input 1) forces the motor off. The lamp on output 2 shows the motor is enabled.",
      inputs: [{ id: "in1", label: "Emergency stop pressed" }],
      analog: [{ id: "an1", label: "Speed dial", unit: "", scale: 1, max: 255 }],
      outputs: [{ id: "out1", label: "Motor (PWM)", kind: "motor" }, { id: "out2", label: "Enabled lamp", kind: "lamp" }],
      start: "n0",
      nodes: {
        n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
        n1: { k: "dec", t: "in1 = 1 ?", c: "in1 = 1", x: 1, y: 1, yes: { to: "n2", exit: "r" }, no: "n3" },
        n2: { k: "io", t: "PWM out1 = 0 %\nout2 = 0", ops: [{ p: "out1", v: "0" }, { o: "out2", v: "0" }], x: 2.45, y: 1, next: { to: "n1", exit: "t", enter: "t", via: [[2.45, 0.5], [1, 0.5]] } },
        n3: { k: "proc", t: "duty = an1 × 100 ÷ 255", ops: [{ l: "duty", v: "an1 * 100 / 255" }], x: 1, y: 2, next: "n4" },
        n4: { k: "io", t: "PWM out1 = duty %\nout2 = 1", ops: [{ p: "out1", v: "duty" }, { o: "out2", v: "1" }], x: 1, y: 3, next: { to: "n1", exit: "l", enter: "t", via: [[-0.15, 3], [-0.15, 0.5], [1, 0.5]] } },
      },
      lines: [
        { t: "main:", n: "n1" },
        { t: "  if in1 = 1 then", n: "n1" },
        { t: "    pwm out1 = 0 : out2 = 0", n: "n2" },
        { t: "  else", n: null },
        { t: "    duty = an1 * 100 / 255", n: "n3" },
        { t: "    pwm out1 = duty : out2 = 1", n: "n4" },
        { t: "  end if", n: null },
        { t: "  goto main", n: null, loop: true },
      ],
    },
    fan: {
      id: "fan", title: "Cooling fan: scaling a range",
      blurb: "The magazine cooling fan (output 1, PWM) is off at 25 \u00b0C or below, runs at 100 % at 45 \u00b0C or above, and rises in a straight line between. The temperature sensor is analogue input 1 (0 to 255 stands for 0 to 100 \u00b0C). Lamp on output 2 whenever the fan is turning.",
      inputs: [], analog: [{ id: "an1", label: "Temperature sensor", unit: "\u00b0C", scale: 100 / 255, max: 255 }],
      outputs: [{ id: "out1", label: "Fan (PWM)", kind: "motor" }, { id: "out2", label: "Fan lamp", kind: "lamp" }],
      start: "n0",
      nodes: {
        n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
        n1: { k: "proc", t: "temp = an1 \u00d7 100 \u00f7 255", ops: [{ l: "temp", v: "an1 * 100 / 255" }], x: 1, y: 1, next: "n2" },
        n2: { k: "proc", t: "duty = (temp \u2212 25) \u00d7 5", ops: [{ l: "duty", v: "(temp - 25) * 5" }], x: 1, y: 2, next: "n3" },
        n3: { k: "dec", t: "duty < 0 ?", c: "duty < 0", x: 1, y: 3, yes: { to: "n3y", exit: "r" }, no: "n4" },
        n3y: { k: "proc", t: "duty = 0", ops: [{ l: "duty", v: "0" }], x: 2.3, y: 3, next: { to: "n4", exit: "b", enter: "t", via: [[2.3, 3.5], [1, 3.5]] } },
        n4: { k: "dec", t: "duty > 100 ?", c: "duty > 100", x: 1, y: 4, yes: { to: "n4y", exit: "r" }, no: "n5" },
        n4y: { k: "proc", t: "duty = 100", ops: [{ l: "duty", v: "100" }], x: 2.3, y: 4, next: { to: "n5", exit: "b", enter: "t", via: [[2.3, 4.5], [1, 4.5]] } },
        n5: { k: "io", t: "PWM out1 = duty %", ops: [{ p: "out1", v: "duty" }], x: 1, y: 5, next: "n6" },
        n6: { k: "dec", t: "duty > 0 ?", c: "duty > 0", x: 1, y: 6, yes: { to: "n6y", exit: "r" }, no: "n6n" },
        n6y: { k: "io", t: "out2 = 1", ops: [{ o: "out2", v: "1" }], x: 2.3, y: 6, next: { to: "n7", exit: "b", enter: "t", via: [[2.3, 7.5], [1, 7.5]] } },
        n6n: { k: "io", t: "out2 = 0", ops: [{ o: "out2", v: "0" }], x: 1, y: 7, next: "n7" },
        n7: { k: "proc", t: "Wait 1 s", wait: 1, x: 1, y: 8, next: { to: "n1", exit: "l", enter: "t", via: [[-0.15, 8], [-0.15, 0.55], [1, 0.55]] } },
      },
      lines: [
        { t: "main:", n: "n1" },
        { t: "  temp = an1 * 100 / 255", n: "n1" },
        { t: "  duty = (temp - 25) * 5", n: "n2" },
        { t: "  if duty < 0 then duty = 0", n: "n3" },
        { t: "  if duty > 100 then duty = 100", n: "n4" },
        { t: "  pwm out1 = duty", n: "n5" },
        { t: "  if duty > 0 then", n: "n6" },
        { t: "    out2 = 1", n: "n6y" },
        { t: "  else", n: null },
        { t: "    out2 = 0", n: "n6n" },
        { t: "  end if", n: null },
        { t: "  wait 1 s", n: "n7" },
        { t: "  goto main", n: null, loop: true },
      ],
    },
  };
  /* the capstan program of chapter 6: one enable line from the logic board, a speed dial, PWM */
  Dig.PROGRAMS.capstan = {
    id: "capstan", title: "Capstan drive",
    blurb: "The logic board sends one ENABLE line to input 1. When it is 1 the capstan motor (output 1, PWM) runs at the duty set by the speed dial (analogue input 1, 0 to 255) and the lamp on output 2 is on. When it is 0 the motor is off.",
    inputs: [{ id: "in1", label: "ENABLE from logic board" }],
    analog: [{ id: "an1", label: "Speed dial", unit: "", scale: 1, max: 255 }],
    outputs: [{ id: "out1", label: "Capstan motor (PWM)", kind: "motor" }, { id: "out2", label: "Running lamp", kind: "lamp" }],
    start: "n0",
    nodes: {
      n0: { k: "term", t: "START", x: 1, y: 0, next: "n1" },
      n1: { k: "dec", t: "in1 = 1 ?", c: "in1 = 1", x: 1, y: 1, yes: "n2", no: { to: "n4", exit: "r" } },
      n2: { k: "proc", t: "duty = an1 × 100 ÷ 255", ops: [{ l: "duty", v: "an1 * 100 / 255" }], x: 1, y: 2, next: "n3" },
      n3: { k: "io", t: "PWM out1 = duty %\nout2 = 1", ops: [{ p: "out1", v: "duty" }, { o: "out2", v: "1" }], x: 1, y: 3, next: { to: "n1", exit: "l", enter: "t", via: [[-0.15, 3], [-0.15, 0.5], [1, 0.5]] } },
      n4: { k: "io", t: "PWM out1 = 0 %\nout2 = 0", ops: [{ p: "out1", v: "0" }, { o: "out2", v: "0" }], x: 2.45, y: 1, next: { to: "n1", exit: "t", enter: "t", via: [[2.45, 0.5], [1, 0.5]] } },
    },
    lines: [
      { t: "main:", n: "n1" },
      { t: "  if in1 = 1 then", n: "n1" },
      { t: "    duty = an1 * 100 / 255", n: "n2" },
      { t: "    pwm out1 = duty : out2 = 1", n: "n3" },
      { t: "  else", n: null },
      { t: "    pwm out1 = 0 : out2 = 0", n: "n4" },
      { t: "  end if", n: null },
      { t: "  goto main", n: null, loop: true },
    ],
  };

  /* ---- interpreter ---- */
  Dig.newState = function (prog) {
    const st = { node: prog.start, vars: {}, out: {}, pwm: {}, t: 0, done: false, steps: 0, waiting: 0, inputs: {}, an: {} };
    prog.outputs.forEach((o) => { st.out[o.id] = 0; st.pwm[o.id] = null; });
    prog.inputs.forEach((i) => { st.inputs[i.id] = 0; });
    prog.analog.forEach((a) => { st.an[a.id] = 0; });
    return st;
  };
  Dig.env = function (st) {
    return Object.assign({}, st.vars, st.inputs, st.an, st.out);
  };
  function setOut(st, pin, v, duty) {
    if (!(pin in st.out)) throw new Error("no such output pin " + pin);
    if (duty) { const d = Math.max(0, Math.min(100, v)); st.pwm[pin] = d; st.out[pin] = d > 0 ? 1 : 0; }
    else { st.pwm[pin] = null; st.out[pin] = v ? 1 : 0; }
  }
  /* execute the node st.node; returns the node just run */
  Dig.step = function (prog, st) {
    if (st.done) return null;
    const id = st.node, n = prog.nodes[id];
    if (!n) { st.done = true; return null; }
    let nx;
    st.waiting = 0;
    if (n.k === "dec") { nx = Dig.evalExpr(n.c, Dig.env(st)) ? n.yes : n.no; st.lastDec = !!Dig.evalExpr(n.c, Dig.env(st)); }
    else {
      (n.ops || []).forEach((op) => {
        const v = Dig.evalExpr(op.v, Dig.env(st));
        if (op.o) setOut(st, op.o, v, false); else if (op.p) setOut(st, op.p, v, true); else if (op.l) st.vars[op.l] = v;
      });
      if (n.wait) { st.t += n.wait; st.waiting = n.wait; }
      nx = n.next;
    }
    st.steps++;
    const dest = to(nx);
    if (dest == null) { st.done = true; st.node = null; } else st.node = dest;
    return id;
  };
  /* run until the program is back at its first decision/node 'main' (one scan of the loop) */
  Dig.settle = function (prog, st, limit) {
    const home = to(prog.nodes[prog.start].next); let guard = limit || 200, seen = 0;
    st.trail = [];
    for (;;) {
      if (st.done || guard-- <= 0) break;
      const id = st.node;
      if (id === home && ++seen === 2) break;
      st.trail.push(id); Dig.step(prog, st);
    }
    return st;
  };

  /* =====================================================================
     7. Flowchart drawing
     ===================================================================== */
  const CW = 196, RH = 74;
  function nodeBox(n) {
    const lines = String(n.t).split("\n"), tw = Math.max(...lines.map((s) => s.length)) * 7.2;
    if (n.k === "term") return { w: Math.max(96, tw + 34), h: 30, lines };
    if (n.k === "dec") return { w: Math.max(120, tw * 1.55 + 22), h: 52 + (lines.length - 1) * 15, lines };
    return { w: Math.max(116, tw + 34), h: 32 + (lines.length - 1) * 15, lines };
  }
  Dig.flow = function (prog, o) {
    o = o || {};
    const uid = o.uid || "f" + Math.floor(Math.random() * 1e6);
    const ids = Object.keys(prog.nodes), box = {}, pos = {};
    ids.forEach((id) => { const n = prog.nodes[id]; box[id] = nodeBox(n); pos[id] = { x: n.x * CW, y: n.y * RH }; });
    const port = (id, side) => {
      const p = pos[id], b = box[id];
      return side === "t" ? [p.x, p.y - b.h / 2] : side === "b" ? [p.x, p.y + b.h / 2] : side === "l" ? [p.x - b.w / 2, p.y] : [p.x + b.w / 2, p.y];
    };
    const edges = [];
    ids.forEach((id) => {
      const n = prog.nodes[id];
      const add = (e, label) => {
        if (e == null) return;
        const E = typeof e === "string" ? { to: e } : e;
        const dest = E.to, exit = E.exit || "b", enter = E.enter || "t";
        let a = port(id, exit), z = port(dest, enter);
        const pts = [a];
        const via = (E.via || []).map(([cx, cy]) => [cx * CW, cy * RH]);
        if (via.length) via.forEach((p) => pts.push(p));
        else if ((exit === "b" || exit === "t") && Math.abs(a[0] - z[0]) > 1) { const my = (a[1] + z[1]) / 2; pts.push([a[0], my], [z[0], my]); }
        else if ((exit === "r" || exit === "l") && Math.abs(a[1] - z[1]) > 1) { pts.push([z[0], a[1]]); }
        pts.push(z);
        edges.push({ from: id, to: dest, pts, label });
      };
      if (n.k === "dec") { add(n.yes, "Yes"); add(n.no, "No"); } else add(n.next);
    });
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    ids.forEach((id) => { const p = pos[id], b = box[id]; minX = Math.min(minX, p.x - b.w / 2); maxX = Math.max(maxX, p.x + b.w / 2); minY = Math.min(minY, p.y - b.h / 2); maxY = Math.max(maxY, p.y + b.h / 2); });
    edges.forEach((e) => e.pts.forEach(([x, y]) => { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }));
    const pad = 14, W = maxX - minX + pad * 2, H = maxY - minY + pad * 2;
    const tx = pad - minX, ty = pad - minY;
    const s = [];
    s.push(`<svg class="dg-flowsvg${o.cls ? " " + o.cls : ""}" viewBox="0 0 ${f1(W)} ${f1(H)}" style="max-width:${o.width || Math.round(W)}px" role="img" aria-label="${esc(o.label || "Flowchart: " + prog.title)}">`);
    s.push(`<defs><marker id="ar-${uid}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="dg-arrowhead"/></marker></defs>`);
    s.push(`<g transform="translate(${f1(tx)},${f1(ty)})">`);
    edges.forEach((e) => {
      s.push(`<path class="dg-edge" d="M${e.pts.map((p) => f1(p[0]) + "," + f1(p[1])).join(" L")}" marker-end="url(#ar-${uid})"/>`);
      if (e.label) {
        const a = e.pts[0], b = e.pts[1], horiz = Math.abs(b[1] - a[1]) < 1;
        const left = horiz ? b[0] < a[0] : true;
        s.push(`<text class="dg-elab" x="${f1(horiz ? (left ? a[0] - 8 : a[0] + 8) : a[0] - 7)}" y="${f1(horiz ? a[1] - 5 : a[1] + 14)}"${left ? ' text-anchor="end"' : ""}>${e.label}</text>`);
      }
    });
    ids.forEach((id) => {
      const n = prog.nodes[id], b = box[id], p = pos[id], hw = b.w / 2, hh = b.h / 2;
      let shape;
      if (n.k === "term") shape = `<rect class="dg-shape" x="${-hw}" y="${-hh}" width="${b.w}" height="${b.h}" rx="${hh}"/>`;
      else if (n.k === "dec") shape = `<path class="dg-shape" d="M0,${-hh} L${hw},0 L0,${hh} L${-hw},0 Z"/>`;
      else if (n.k === "io") shape = `<path class="dg-shape" d="M${-hw + 12},${-hh} H${hw} L${hw - 12},${hh} H${-hw} Z"/>`;
      else shape = `<rect class="dg-shape" x="${-hw}" y="${-hh}" width="${b.w}" height="${b.h}"/>`;
      const ty0 = -((b.lines.length - 1) * 15) / 2 + 4.5;
      const txt = b.lines.map((l, i) => `<tspan x="0" y="${f1(ty0 + i * 15)}">${esc(l)}</tspan>`).join("");
      s.push(`<g class="dg-node dg-${n.k}" data-node="${id}" transform="translate(${f1(p.x)},${f1(p.y)})">${shape}<text class="dg-ntxt" text-anchor="middle">${txt}</text></g>`);
    });
    s.push(`</g></svg>`);
    return { svg: s.join(""), W, H, pos: (id) => ({ x: pos[id].x + tx, y: pos[id].y + ty }) };
  };


  /* =====================================================================
     8. Shared text and truth-table HTML
     ===================================================================== */
  Dig.INFO = {
    AND: { name: "AND", eng: "The output is 1 only when <b>all</b> the inputs are 1.", tex: "Q = A \\cdot B", dev: "A capstan interlock: the motor runs only if the pawls are clear <em>and</em> the heave button is pressed." },
    OR: { name: "OR", eng: "The output is 1 when <b>any</b> input is 1 (one, several, or all).", tex: "Q = A + B", dev: "A fire alarm bell: it rings if <em>any</em> call point is pressed." },
    NOT: { name: "NOT", eng: "The output is the <b>opposite</b> of the input. It has one input only.", tex: "Q = \\overline{A}", dev: "A redstone torch. Or a lamp that lights when a hatch is <em>not</em> closed." },
    NAND: { name: "NAND", eng: "An AND followed by a NOT: the output is 0 only when <b>all</b> inputs are 1.", tex: "Q = \\overline{A \\cdot B}", dev: "A warning lamp that is lit unless <em>every</em> hatch is shut. The building block of the whole chapter on NAND equivalents." },
    NOR: { name: "NOR", eng: "An OR followed by a NOT: the output is 1 only when <b>every</b> input is 0.", tex: "Q = \\overline{A + B}", dev: "A “all quiet” lamp: lit only when <em>none</em> of the alarms is active." },
    EOR: { name: "EOR (exclusive OR)", eng: "The output is 1 when the two inputs are <b>different</b>: one is 1 but not both.", tex: "Q = A \\oplus B", dev: "A two-way lantern: a switch at each end of the gun deck, and flipping either one changes the lamp." },
  };
  /* a truth table as HTML. o.cur = highlighted row index; o.hide = row index whose output is shown as ? */
  Dig.ttHTML = function (netIn, outName, o) {
    o = o || {};
    const net = norm(netIn), out = outName || net.outputs[0], rows = Dig.table(net, out);
    const head = net.inputs.map((n) => `<th scope="col">${esc(n)}</th>`).join("") + `<th scope="col" class="q">${esc(out)}</th>`;
    const body = rows.map((r, i) => {
      const hidden = o.hide === i;
      return `<tr data-row="${i}"${o.cur === i ? ' class="cur" aria-current="true"' : ""}>` + net.inputs.map((n) => `<td>${r.in[n]}</td>`).join("") +
        `<td class="q${r.q && !hidden ? " one" : ""}">${hidden ? "?" : r.q}</td></tr>`;
    }).join("");
    return `<table class="dg-tt"><caption class="sr-only">Truth table for ${esc(out)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  };

  root.Dig = Dig;
  if (typeof module !== "undefined" && module.exports) module.exports = Dig;
})(typeof window !== "undefined" ? window : globalThis);

/* =====================================================================
   Part 2: the widgets (browser only)
   ===================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.HE || !window.Dig) return;
  const HE = window.HE, Dig = window.Dig, el = HE.el;
  const $ = (id) => document.getElementById(id);
  const NAMES = ["A", "B", "C", "D"];
  let seq = 0;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const tex = (node, src, display) => { node.innerHTML = HE.tex(src, !!display); };
  /* toggle switches: returns {set(name,v), btns} */
  function switches(parent, names, vals, onchange, labels) {
    const row = el("div", { class: "dg-tog-row", role: "group", "aria-label": "Input switches" });
    const btns = {};
    const label = (n) => `${n} = ${vals[n]}` + (labels && labels[n] ? ` · ${labels[n]}` : "");
    names.forEach((n) => {
      const b = el("button", { type: "button", class: "dg-tog", "aria-pressed": vals[n] ? "true" : "false", "aria-label": `Input ${n}${labels && labels[n] ? ", " + labels[n] : ""}` }, label(n));
      b.addEventListener("click", () => { vals[n] = vals[n] ? 0 : 1; b.setAttribute("aria-pressed", vals[n] ? "true" : "false"); b.textContent = label(n); onchange(n); });
      btns[n] = b; row.append(b);
    });
    parent.append(row);
    return {
      row, btns,
      set(n, v) { vals[n] = v ? 1 : 0; btns[n].setAttribute("aria-pressed", vals[n] ? "true" : "false"); btns[n].textContent = label(n); },
    };
  }
  const rowIndex = (names, vals) => names.reduce((a, n) => a * 2 + (vals[n] ? 1 : 0), 0);
  const pauseButton = (box) => {
    const b = el("button", { type: "button", class: "btn small", "aria-pressed": "false" }, "❚❚ Pause animation");
    b.addEventListener("click", () => {
      const p = !box.classList.contains("dg-paused");
      box.classList.toggle("dg-paused", p);
      b.setAttribute("aria-pressed", p ? "true" : "false");
      b.textContent = p ? "▶ Play animation" : "❚❚ Pause animation";
    });
    return b;
  };
  const refit = (host) => { if (HE.markScrollables) setTimeout(HE.markScrollables, 50); return host; };

  /* =====================================================================
     1. Gate lab
     ===================================================================== */
  mount("w-gates", (box) => {
    let type = "AND", n = 2, oldQ = 0, timer = 0;
    const vals = { A: 0, B: 0, C: 0, D: 0 };
    const quiz = { on: false, answered: true, right: 0, tried: 0 };
    const sel = el("div", { class: "btn-row" });
    box.append(sel);
    HE.choice(sel, "Gate", Dig.GATES.map((g) => [g, g]), type, (v) => { type = v; build(); });
    const nSeg = HE.choice(sel, "Inputs", [[2, "2"], [3, "3"], [4, "4"]], 2, (v) => { n = v; build(); });
    const cols = el("div", { class: "dg-cols" });
    const left = el("div"), right = el("div");
    cols.append(left, right); box.append(cols);
    const stage = el("div", { class: "dg-stage" });
    left.append(stage);
    const swHost = el("div"); left.append(swHost);
    const say = el("p", { class: "dg-say", "aria-live": "polite" });
    const ctl = el("div", { class: "btn-row" });
    const pb = pauseButton(box);
    const qb = el("button", { type: "button", class: "btn small", "aria-pressed": "false" }, "? Quiz me");
    ctl.append(qb, pb);
    left.append(say, ctl);
    const quizBox = el("div", { class: "dg-say", hidden: true, "aria-live": "polite" });
    left.append(quizBox);
    const ttHost = el("div", { class: "dg-ttwrap" });
    const eq = el("div", { class: "dg-eq" });
    const facts = el("div", { class: "hint", style: "margin:8px 0 0" });
    right.append(ttHost, el("p", { class: "dg-note", style: "margin:8px 0 2px" }, "Boolean expression:"), eq, facts);
    let sw = null, net = null, svgEl = null;

    function build() {
      const k = type === "NOT" ? 1 : type === "EOR" ? 2 : n;
      nSeg.style.display = type === "NOT" || type === "EOR" ? "none" : "";
      const names = NAMES.slice(0, k);
      net = { inputs: names, gates: [{ type, in: names.slice(), out: "Q" }], outputs: ["Q"] };
      stage.innerHTML = Dig.svg(net, { vals, flow: true, label: `${type} gate with ${k} input${k > 1 ? "s" : ""}, drawn with its standard symbol`, width: 420, tags: false });
      svgEl = stage.querySelector("svg");
      swHost.innerHTML = "";
      sw = switches(swHost, names, vals, () => update(true));
      tex(eq, "Q = " + Dig.expr(net));
      const info = Dig.INFO[type];
      facts.innerHTML = `<b>${info.name}:</b> ${info.eng}<br><b>On HMS Ratchet:</b> ${info.dev}`;
      oldQ = Dig.evalNet(net, vals).Q;
      update(false);
    }
    function update(animate) {
      const all = Dig.evalNet(net, vals), names = net.inputs;
      const idx = rowIndex(names, vals), hidden = quiz.on && !quiz.answered;
      ttHost.innerHTML = Dig.ttHTML(net, "Q", { cur: idx, hide: hidden ? idx : undefined });
      clearTimeout(timer);
      const shown = hidden ? Object.assign({}, all, { Q: 0 }) : all;
      if (animate && !HE.reduced && !hidden && oldQ !== all.Q) {
        Dig.paint(svgEl, Object.assign({}, all, { Q: oldQ }));
        timer = setTimeout(() => { Dig.paint(svgEl, all); }, 280);
      } else Dig.paint(svgEl, shown);
      if (hidden) { const t = svgEl.querySelector('.dg-val[data-net="Q"]'); if (t) t.textContent = "?"; }
      oldQ = all.Q;
      say.textContent = hidden ? `Inputs: ${names.map((m) => m + " = " + vals[m]).join(", ")}. What is Q?`
        : `${names.map((m) => m + " = " + vals[m]).join(", ")}, so Q = ${all.Q}. This is row ${idx + 1} of ${1 << names.length} in the truth table.`;
    }
    function newPattern() {
      const names = net.inputs; let tries = 0, idx = rowIndex(names, vals);
      do { names.forEach((m) => sw.set(m, Math.random() < 0.5 ? 1 : 0)); tries++; } while (rowIndex(names, vals) === idx && tries < 20);
      quiz.answered = false; showQuiz(); update(false);
    }
    function showQuiz() {
      quizBox.innerHTML = "";
      if (!quiz.answered) {
        quizBox.append(el("div", { class: "dg-quiz-q" }, "Predict the output, then press the button."));
        const row = el("div", { class: "btn-row" });
        [0, 1].forEach((v) => {
          const b = el("button", { type: "button", class: "btn small" }, `Q = ${v}`);
          b.addEventListener("click", () => {
            const q = Dig.evalNet(net, vals).Q;
            quiz.tried++; if (v === q) quiz.right++;
            quiz.answered = true; update(false);
            showQuiz();
            quizBox.prepend(el("div", { class: v === q ? "dg-ok" : "dg-bad" }, (v === q ? "Right. " : "Not quite. ") + `Q = ${q}.`));
          });
          row.append(b);
        });
        quizBox.append(row);
      } else {
        const next = el("button", { type: "button", class: "btn small primary" }, "Next pattern ▶");
        next.addEventListener("click", newPattern);
        quizBox.append(el("div", { class: "dg-note" }, `Score: ${quiz.right} right out of ${quiz.tried}.`), el("div", { class: "btn-row" }, next));
      }
    }
    qb.addEventListener("click", () => {
      quiz.on = !quiz.on; qb.setAttribute("aria-pressed", quiz.on ? "true" : "false");
      qb.textContent = quiz.on ? "✕ Stop the quiz" : "? Quiz me";
      quizBox.hidden = !quiz.on;
      if (quiz.on) { quiz.right = 0; quiz.tried = 0; newPattern(); } else { quiz.answered = true; update(false); }
    });
    build();
  });

  /* =====================================================================
     2. Signal Locker: analogue vs digital through fog
     ===================================================================== */
  mount("w-noise", (box) => {
    const bits = [1, 0, 1, 1, 0, 0, 1, 0], SPB = 14, N = bits.length * SPB;
    let seed = 20240805; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const noise = Array.from({ length: N }, () => rnd() * 2 - 1);
    const clean = Array.from({ length: N }, (_, i) => { const b = bits[Math.floor(i / SPB)]; return b; });
    // an "analogue" message: a smooth curve, here a sum of two slow sine waves scaled into 0..1
    const ana = Array.from({ length: N }, (_, i) => 0.5 + 0.28 * Math.sin(i / N * 2 * Math.PI * 1.5) + 0.2 * Math.sin(i / N * 2 * Math.PI * 3.2 + 1));
    let amp = 0.2;
    const canvas = el("canvas", { class: "sim", role: "img", "aria-label": "Two links carrying the same message through noise. Top: an analogue signal that picks up every bit of noise. Bottom: a digital signal in which each bit is decided as 0 or 1 at the receiver." });
    box.append(canvas);
    const readout = el("div", { class: "dg-kpi", "aria-live": "polite" });
    const sim = HE.sim(canvas, {
      w: 640, h: 300, height: (w) => (w < 480 ? 330 : 300),
      draw(ctx, t, dt, C, s) {
        const W = s.w, H = s.h, mx = 14, pw = W - 2 * mx, pad = 16, ph = (H - 3 * pad - 24) / 2;
        const panel = (y0, title, fn) => {
          ctx.fillStyle = C.paper2; ctx.fillRect(mx, y0, pw, ph);
          ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.strokeRect(mx, y0, pw, ph);
          HE.label(ctx, title, mx + 6, y0 + 11, { size: 12, bold: true, col: C.ink2 });
          fn(y0 + 28, ph - 34);
        };
        const X = (i) => mx + 4 + (i / (N - 1)) * (pw - 8);
        const trace = (arr, y, h, col, w, dash) => {
          ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = "round"; if (dash) ctx.setLineDash(dash);
          ctx.beginPath(); arr.forEach((v, i) => { const yy = y + h - Math.max(-0.4, Math.min(1.4, v)) * h; i ? ctx.lineTo(X(i), yy) : ctx.moveTo(X(i), yy); }); ctx.stroke(); ctx.restore();
        };
        panel(8, "ANALOGUE link: what arrives is the message plus the noise", (y, h) => {
          trace(ana, y, h, C.sea, 2, [5, 4]);
          trace(ana.map((v, i) => v + amp * noise[i]), y, h, C.lode, 2.2);
        });
        panel(8 + ph + pad, "DIGITAL link: the receiver decides each bit at its middle", (y, h) => {
          trace(clean, y, h, C.sea, 2, [5, 4]);
          trace(clean.map((v, i) => v + amp * noise[i]), y, h, C.muted, 1.3);
          // decisions at the middle of each bit
          let errs = 0;
          bits.forEach((b, k) => {
            const i = k * SPB + Math.floor(SPB / 2), got = clean[i] + amp * noise[i] > 0.5 ? 1 : 0;
            if (got !== b) errs++;
            const x0 = X(k * SPB), x1 = X((k + 1) * SPB - 1);
            ctx.fillStyle = got === b ? C.grass : C.red; ctx.globalAlpha = 0.9;
            ctx.fillRect(x0 + 2, y + h - (got ? h : 0) - 2, Math.max(2, x1 - x0 - 4), 4);
            ctx.globalAlpha = 1;
            HE.label(ctx, String(got), (x0 + x1) / 2, y + h + 9, { size: 12, bold: true, col: got === b ? C.grass : C.red, align: "center" });
          });
          s.errs = errs;
        });
        HE.label(ctx, "dashed blue: what was sent · orange / grey: what arrives · green or red bar: the decoded bit", mx, H - 8, { size: 11, col: C.muted });
      },
    });
    const ctlr = el("div", { class: "sim-controls" });
    box.append(ctlr);
    const upd = () => {
      sim.redraw();
      let err = 0; for (let i = 0; i < N; i++) err += Math.pow(amp * noise[i], 2);
      const rms = Math.sqrt(err / N) * 100;
      let wrong = 0; bits.forEach((b, k) => { const i = k * SPB + Math.floor(SPB / 2); if ((clean[i] + amp * noise[i] > 0.5 ? 1 : 0) !== b) wrong++; });
      readout.innerHTML = `<div><b>${Math.round(amp * 100)} %</b><span>noise (as % of the signal swing)</span></div><div><b>${HE.n(rms, 1)} %</b><span>analogue: noise that stays in the message (rms)</span></div><div><b>${wrong} of ${bits.length}</b><span>digital: bits received wrongly</span></div>`;
    };
    HE.slider(ctlr, { label: "Noise (fog on the signal lamp)", min: 0, max: 100, step: 1, value: 20, unit: "%", oninput: (v) => { amp = v / 100; upd(); } });
    box.append(readout);
    box.append(el("p", { class: "dg-note" }, "In this model the noise is never bigger than the slider value. Keep it at or below 50 % of the swing and the digital receiver never makes a mistake, however you look at it: the 0s and 1s are far enough apart that the noise cannot push a bit across the halfway line. The analogue trace is spoiled at every setting above zero."));
    upd();
  });

  /* =====================================================================
     3. Spec-to-circuit trainer
     ===================================================================== */
  const T = (inputs, gates, outputs) => ({ inputs, gates, outputs });
  const SCEN = [
    {
      id: "flood", name: "Magazine flood alarm", inputs: ["A", "B", "C"],
      legend: { A: "low-level float switch tripped", B: "high-level float switch tripped", C: "bilge pump is running" },
      spec: "The alarm (Q = 1) must sound if the high-level float switch has tripped, whatever else is happening. It must also sound if the low-level float switch has tripped while the pump is not running. Otherwise it stays silent.",
      f: (r) => (r.B || (r.A && !r.C) ? 1 : 0),
      why: (r) => (r.B ? "the high-level switch (B) has tripped, which always sounds the alarm" : r.A && !r.C ? "the low-level switch (A) has tripped and the pump (C) is not running" : "the high-level switch has not tripped, and either the low-level switch has not tripped or the pump is running"),
      tidy: T(["A", "B", "C"], [{ type: "NOT", in: ["C"], out: "nC" }, { type: "AND", in: ["A", "nC"], out: "p" }, { type: "OR", in: ["B", "p"], out: "Q" }], ["Q"]),
      tidyTex: "Q = B + A \\cdot \\overline{C}",
    },
    {
      id: "lantern", name: "Two-way gun-deck lantern", inputs: ["A", "B"],
      legend: { A: "switch at the forward ladder is UP", B: "switch at the after ladder is UP" },
      spec: "A lantern (Q = 1) hangs over the gun deck with a switch at each end. Flipping either switch changes the lantern. It is lit when the two switches are in different positions, and dark when they are in the same position.",
      f: (r) => (r.A !== r.B ? 1 : 0),
      why: (r) => (r.A !== r.B ? "the two switches are in different positions" : "the two switches are in the same position"),
      tidy: T(["A", "B"], [{ type: "EOR", in: ["A", "B"], out: "Q" }], ["Q"]),
      tidyTex: "Q = A \\oplus B",
    },
    {
      id: "hatch", name: "Magazine hatch release", inputs: ["A", "B", "C", "D"],
      legend: { A: "Captain's key turned", B: "gunner's key turned", C: "carpenter's key turned", D: "fire alarm sounding" },
      spec: "The hatch release (Q = 1) works only when the Captain's key is turned and at least one of the gunner's key or the carpenter's key is turned, and the fire alarm is not sounding.",
      f: (r) => (r.A && (r.B || r.C) && !r.D ? 1 : 0),
      why: (r) => (r.D ? "the fire alarm (D) is sounding, which blocks the release" : !r.A ? "the Captain's key (A) is not turned" : !(r.B || r.C) ? "neither the gunner's key (B) nor the carpenter's key (C) is turned" : "the Captain's key and one of the other keys are turned, and the fire alarm is silent"),
      tidy: T(["A", "B", "C", "D"], [{ type: "OR", in: ["B", "C"], out: "X" }, { type: "NOT", in: ["D"], out: "nD" }, { type: "AND", in: ["A", "X", "nD"], out: "Q" }], ["Q"]),
      tidyTex: "Q = A \\cdot (B + C) \\cdot \\overline{D}",
    },
    {
      id: "fire", name: "Broadside firing order", inputs: ["A", "B", "C"],
      legend: { A: "gun captain gives the order", B: "midshipman gives the order", C: "lieutenant gives the order" },
      spec: "The broadside fires (Q = 1) when at least two of the three officers have given the order. One order alone is not enough.",
      f: (r) => (r.A + r.B + r.C >= 2 ? 1 : 0),
      why: (r) => `${r.A + r.B + r.C} of the three officers ${r.A + r.B + r.C === 1 ? "has" : "have"} given the order, and at least two are needed`,
      tidy: T(["A", "B", "C"], [{ type: "AND", in: ["A", "B"], out: "p1" }, { type: "AND", in: ["B", "C"], out: "p2" }, { type: "AND", in: ["A", "C"], out: "p3" }, { type: "OR", in: ["p1", "p2", "p3"], out: "Q" }], ["Q"]),
      tidyTex: "Q = A \\cdot B + B \\cdot C + A \\cdot C",
    },
  ];
  mount("w-trainer", (box) => {
    let sc = SCEN[0], cells = [];
    const pick = el("div", { class: "btn-row" }); box.append(pick);
    const specBox = el("div", { class: "dg-say" });
    const legend = el("ul", { class: "dg-note", style: "margin:4px 0 8px 1.1em;padding:0" });
    const ttHost = el("div", { class: "dg-ttwrap" });
    const btns = el("div", { class: "btn-row" });
    const msg = el("p", { class: "dg-say", "aria-live": "polite", hidden: true });
    const out = el("div", { "aria-live": "polite" });
    box.append(specBox, legend, ttHost, btns, msg, out);
    const rowsOf = () => Dig.rows(sc.inputs);
    function reset() {
      cells = rowsOf().map(() => null);
      specBox.innerHTML = `<b>Specification.</b> ${sc.spec}`;
      legend.innerHTML = sc.inputs.map((n) => `<li><b>${n}</b> = 1 when the ${sc.legend[n]}</li>`).join("");
      msg.hidden = true; out.innerHTML = "";
      drawTable(null);
    }
    function drawTable(marks) {
      const rows = rowsOf();
      const t = el("table", { class: "dg-tt" });
      t.append(el("caption", { class: "sr-only" }, `Truth table for ${sc.name}: press each output cell to set it to 0 or 1`));
      t.append(el("thead", null, el("tr", null, ...sc.inputs.map((n) => el("th", { scope: "col" }, n)), el("th", { scope: "col", class: "q" }, "Q"), el("th", { scope: "col", class: "row-txt" }, "In words"))));
      const tb = el("tbody");
      rows.forEach((r, i) => {
        const on = sc.inputs.filter((n) => r[n]);
        const b = el("button", { type: "button", class: "cell" + (marks ? (marks[i] ? " ok" : " bad") : ""), "data-v": cells[i] == null ? "" : String(cells[i]), "aria-label": `Row ${i + 1}, ${sc.inputs.map((n) => n + "=" + r[n]).join(", ")}: output ${cells[i] == null ? "not set" : cells[i]}. Press to change.` }, cells[i] == null ? "?" : String(cells[i]));
        b.addEventListener("click", () => { cells[i] = cells[i] == null ? 1 : cells[i] === 1 ? 0 : null; drawTable(null); msg.hidden = true; out.innerHTML = ""; const nb = ttHost.querySelectorAll("button.cell")[i]; if (nb) nb.focus(); });
        tb.append(el("tr", null, ...sc.inputs.map((n) => el("td", null, String(r[n]))), el("td", { class: "q" }, b), el("td", { class: "row-txt" }, on.length ? on.join(", ") + " on" : "nothing on")));
      });
      t.append(tb);
      ttHost.innerHTML = ""; ttHost.append(t);
    }
    const mk = (txt, cls, fn) => { const b = el("button", { type: "button", class: "btn small" + (cls ? " " + cls : "") }, txt); b.addEventListener("click", fn); btns.append(b); return b; };
    mk("Check against the spec", "primary", () => {
      const rows = rowsOf(), marks = [], bad = [];
      let empty = 0;
      rows.forEach((r, i) => { if (cells[i] == null) { empty++; marks.push(false); return; } const ok = cells[i] === sc.f(r); marks.push(ok); if (!ok) bad.push(i); });
      drawTable(marks.map((m, i) => (cells[i] == null ? false : m)));
      msg.hidden = false;
      if (empty) { msg.innerHTML = `<span class="dg-bad">${empty} row${empty > 1 ? "s are" : " is"} still unset.</span> Press each Q cell to make it 0 or 1.`; return; }
      if (!bad.length) { msg.innerHTML = `<span class="dg-ok">Every row matches the specification.</span> Now press <b>Build the circuit</b>.`; return; }
      msg.innerHTML = `<span class="dg-bad">${bad.length} row${bad.length > 1 ? "s" : ""} differ from the specification.</span><ul style="margin:4px 0 0 1.1em;padding:0">` + bad.map((i) => { const r = rows[i]; return `<li>Row ${i + 1} (${sc.inputs.map((n) => n + "=" + r[n]).join(", ")}): Q should be ${sc.f(r)}, because ${sc.why(r)}.</li>`; }).join("") + "</ul>";
    });
    mk("Build the circuit", "", () => {
      const rows = rowsOf();
      msg.hidden = true;
      if (cells.some((c) => c == null)) { msg.hidden = false; msg.innerHTML = `<span class="dg-bad">Fill in every row first.</span>`; return; }
      const tt = rows.map((r, i) => ({ in: r, q: cells[i] }));
      const sop = Dig.sop(sc.inputs, tt, "Q");
      const wrong = rows.filter((r, i) => cells[i] !== sc.f(r)).length;
      let h = `<p class="dg-note" style="margin:10px 0 2px">Sum of products from <em>your</em> table: write a product term for every row where Q = 1.</p><div class="dg-eq" data-tex="${HE.esc(sop.tex)}"></div>`;
      if (sop.net) h += `<div class="dg-stage" style="margin-top:8px">${Dig.svg(sop.net, { label: "Logic diagram built from your truth table: NOT gates, an AND gate for each term, then an OR gate", width: 640 })}</div><p class="dg-note">${sop.net.gates.length} gates.</p>`;
      else h += `<p class="dg-say">With this table the output is always ${sop.constant === 1 ? 1 : sop.constant === 0 ? 0 : "a single input"}: no gates are needed.</p>`;
      h += wrong ? `<p class="dg-say"><span class="dg-bad">This circuit does not match the spec</span> (${wrong} row${wrong > 1 ? "s" : ""} differ). Press <b>Check against the spec</b>, repair those rows and build again.</p>`
        : `<p class="dg-say"><span class="dg-ok">This circuit does match the spec.</span> A tidier version uses fewer gates:</p><div class="dg-eq" data-tex="${HE.esc(sc.tidyTex)}"></div><div class="dg-stage" style="margin-top:8px">${Dig.svg(sc.tidy, { label: "A simpler circuit with the same truth table", width: 560 })}</div><p class="dg-note">${sc.tidy.gates.length} gates instead of ${sop.net ? sop.net.gates.length : 0}. Same truth table, so the same behaviour.</p>`;
      out.innerHTML = h;
      out.querySelectorAll("[data-tex]").forEach((d) => { d.innerHTML = HE.tex(d.getAttribute("data-tex"), true); });
      refit(out);
    });
    mk("Show the spec's table", "", () => { cells = rowsOf().map((r) => sc.f(r)); drawTable(null); msg.hidden = false; msg.textContent = "The truth table the specification asks for. Work out why each row has its value before you move on."; out.innerHTML = ""; });
    mk("↺ Clear", "", () => { reset(); });
    HE.choice(pick, "Scenario", SCEN.map((s) => [s.id, s.name]), sc.id, (v) => { sc = SCEN.find((s) => s.id === v); reset(); });
    reset();
  });

  /* =====================================================================
     4. Diagram-to-expression tracer
     ===================================================================== */
  const TRACE = [
    { id: "t1", name: "AND, NOT and OR", net: T(["A", "B", "C"], [{ type: "AND", in: ["A", "B"], out: "X" }, { type: "NOT", in: ["C"], out: "Y" }, { type: "OR", in: ["X", "Y"], out: "Q" }], ["Q"]) },
    { id: "t2", name: "EOR and NOR (four inputs)", net: T(["A", "B", "C", "D"], [{ type: "EOR", in: ["A", "B"], out: "X" }, { type: "NOR", in: ["C", "D"], out: "Y" }, { type: "AND", in: ["X", "Y"], out: "Q" }], ["Q"]) },
    { id: "t3", name: "Three NAND gates", net: T(["A", "B", "C", "D"], [{ type: "NAND", in: ["A", "B"], out: "X" }, { type: "NAND", in: ["C", "D"], out: "Y" }, { type: "NAND", in: ["X", "Y"], out: "Q" }], ["Q"]) },
    { id: "t4", name: "A three-input AND and a NOR", net: T(["A", "B", "C", "D"], [{ type: "NOT", in: ["B"], out: "X" }, { type: "AND", in: ["A", "X", "C"], out: "Y" }, { type: "NOR", in: ["Y", "D"], out: "Q" }], ["Q"]) },
  ];
  mount("w-tracer", (box) => {
    let cur = TRACE[0], shown = 0, order = [];
    const vals = { A: 0, B: 0, C: 0, D: 0 };
    const pick = el("div", { class: "btn-row" }); box.append(pick);
    const cols = el("div", { class: "dg-cols" }), left = el("div"), right = el("div");
    cols.append(left, right); box.append(cols);
    const stage = el("div", { class: "dg-stage" }); left.append(stage);
    const swHost = el("div"); left.append(swHost);
    const steps = el("div", { class: "dg-say", "aria-live": "polite" });
    const ctl = el("div", { class: "btn-row" });
    left.append(ctl, steps);
    const ttHost = el("div", { class: "dg-ttwrap" }); right.append(ttHost);
    let svgEl = null, sw = null;
    const addBtn = (txt, cls, fn) => { const b = el("button", { type: "button", class: "btn small" + (cls ? " " + cls : "") }, txt); b.addEventListener("click", fn); ctl.append(b); return b; };
    function load(c) {
      cur = c; shown = 0;
      const { lvl } = Dig.levels(c.net);
      order = c.net.gates.slice().sort((a, b) => lvl[a.out] - lvl[b.out]);
      swHost.innerHTML = ""; sw = switches(swHost, c.net.inputs, vals, paint);
      draw();
    }
    function draw() {
      const g = order[shown - 1];
      stage.innerHTML = Dig.svg(cur.net, { vals, nets: true, flow: true, hl: g ? new Set([g.id]) : new Set(), label: `Logic diagram: ${cur.name}`, width: 600 });
      svgEl = stage.querySelector("svg");
      paint(); refit(stage);
      let h = shown ? "" : "Press <b>Trace next gate</b>: label each gate's output with an expression, working left to right.";
      order.slice(0, shown).forEach((gate, i) => {
        const loc = Dig.expr({ inputs: [...new Set(gate.in)], gates: [{ type: gate.type, in: gate.in, out: gate.out }], outputs: [gate.out] }, gate.out);
        const full = Dig.expr(cur.net, gate.out);
        h += `<div style="margin:4px 0"><b>Gate ${i + 1} (${gate.type}):</b> ${HE.tex(gate.out + " = " + loc)}` + (loc !== full ? ` &nbsp;so&nbsp; ${HE.tex(gate.out + " = " + full)}` : "") + `</div>`;
      });
      if (shown === order.length) h += `<p style="margin:6px 0 0"><span class="dg-ok">Done.</span> The answer is the expression for the output, with everything substituted in: ${HE.tex(cur.net.outputs[0] + " = " + Dig.expr(cur.net))}</p>`;
      steps.innerHTML = h;
    }
    function paint() {
      const all = Dig.evalNet(cur.net, vals);
      Dig.paint(svgEl, all);
      ttHost.innerHTML = Dig.ttHTML(cur.net, cur.net.outputs[0], { cur: rowIndex(cur.net.inputs, vals) });
    }
    addBtn("Trace next gate ▶", "primary", () => { if (shown < order.length) { shown++; draw(); } });
    addBtn("Show all", "", () => { shown = order.length; draw(); });
    addBtn("↺ Reset", "", () => { shown = 0; draw(); });
    addBtn("❚❚ Pause animation", "", function () { const p = !box.classList.contains("dg-paused"); box.classList.toggle("dg-paused", p); this.textContent = p ? "▶ Play animation" : "❚❚ Pause animation"; this.setAttribute("aria-pressed", p ? "true" : "false"); }).setAttribute("aria-pressed", "false");
    HE.choice(pick, "Circuit", TRACE.map((c) => [c.id, c.name]), cur.id, (v) => load(TRACE.find((c) => c.id === v)));
    load(cur);
  });

  /* =====================================================================
     5. NAND converter
     ===================================================================== */
  const NP = [
    { id: "n1", name: "A·B + C (AND then OR)", net: T(["A", "B", "C"], [{ type: "AND", in: ["A", "B"], out: "X" }, { type: "OR", in: ["X", "C"], out: "Q" }], ["Q"]) },
    { id: "n2", name: "EOR gate", net: T(["A", "B"], [{ type: "EOR", in: ["A", "B"], out: "Q" }], ["Q"]) },
    { id: "n3", name: "A·B̄ + Ā·B (EOR from basic gates)", net: T(["A", "B"], [{ type: "NOT", in: ["A"], out: "nA" }, { type: "NOT", in: ["B"], out: "nB" }, { type: "AND", in: ["A", "nB"], out: "p1" }, { type: "AND", in: ["nA", "B"], out: "p2" }, { type: "OR", in: ["p1", "p2"], out: "Q" }], ["Q"]) },
    { id: "n4", name: "(A + B)·(C + D), four inputs", net: T(["A", "B", "C", "D"], [{ type: "OR", in: ["A", "B"], out: "X" }, { type: "OR", in: ["C", "D"], out: "Y" }, { type: "AND", in: ["X", "Y"], out: "Q" }], ["Q"]) },
    { id: "n5", name: "A·B·C·D̄ (capstan enable)", net: T(["A", "B", "C", "D"], [{ type: "NOT", in: ["D"], out: "nD" }, { type: "AND", in: ["A", "B", "C", "nD"], out: "Q" }], ["Q"]) },
    { id: "n6", name: "NOR gate", net: T(["A", "B"], [{ type: "NOR", in: ["A", "B"], out: "Q" }], ["Q"]) },
  ];
  const NOTES = {
    orig: (s, o) => `The circuit as drawn: ${o.gates} gate${o.gates > 1 ? "s" : ""}, ${o.kinds} different kind${o.kinds > 1 ? "s" : ""}. Each kind of gate needs its own type of chip.`,
    swap: () => `Swap each gate for its NAND version. NOT: a NAND with its inputs tied together. AND: a NAND followed by a NAND acting as NOT. OR: a NAND whose inputs are each inverted first. NOR: that OR, then a NOT. EOR: four NANDs. Everything is a NAND now, but there are more gates (shaded).`,
    find: (s) => `Look along every wire that joins two NOT gates (a NAND with tied inputs). Two NOTs in a row cancel, because inverting twice gives back the original signal. ${s.pairs.length === 1 ? "One pair is" : s.pairs.length + " pairs are"} highlighted.`,
    cancel: () => `Remove each highlighted pair and join the wires straight through. The truth table does not change, but the gate count falls.`,
    share: (s) => `${s.merged.length === 1 ? "Two gates" : "Some gates"} in the circuit take exactly the same inputs, so they give exactly the same output. Keep one and feed both places from it.`,
  };
  mount("w-nand", (box) => {
    let cur = NP[0], steps = [], k = 0, timer = null;
    const vals = { A: 0, B: 0, C: 0, D: 0 };
    const pick = el("div", { class: "btn-row" }); box.append(pick);
    const pips = el("div", { class: "dg-steps", "aria-hidden": "true" });
    const title = el("p", { class: "dg-quiz-q", "aria-live": "polite" });
    const note = el("p", { class: "dg-say", "aria-live": "polite" });
    const stage = el("div", { class: "dg-stage dg-fade" });
    const count = el("div", { class: "dg-count", "aria-live": "polite" });
    const swHost = el("div");
    const live = el("p", { class: "dg-note" });
    const ctl = el("div", { class: "btn-row" });
    box.append(pips, title, ctl, stage, note, count, swHost, live);
    const bBack = el("button", { type: "button", class: "btn small" }, "◀ Back");
    const bNext = el("button", { type: "button", class: "btn small primary" }, "Next step ▶");
    const bPlay = el("button", { type: "button", class: "btn small" }, "▶ Play all steps");
    const bRst = el("button", { type: "button", class: "btn small" }, "↺ Start again");
    ctl.append(bBack, bNext, bPlay, bRst);
    let sw = null;
    function icText(s) {
      if (s.key === "orig") { const m = Dig.mixedIcs(s.net); return m.exact ? { n: String(m.total), t: "ICs (separate gate types)" } : { n: "?", t: "ICs: needs a data sheet" }; }
      const c = Dig.nandIcs(s.net);
      const parts = [];
      if (c.c2) parts.push(`${c.c2} × 7400 (quad 2-input)`);
      if (c.c3) parts.push(`${c.c3} × 7410 (triple 3-input)`);
      if (c.c4) parts.push(`${c.c4} × 7420 (dual 4-input)`);
      return { n: String(c.total), t: parts.join(" + ") || "ICs" };
    }
    function load(c) {
      stop(); cur = c; steps = Dig.nandSteps(c.net); k = 0;
      swHost.innerHTML = ""; sw = switches(swHost, c.net.inputs, vals, paintLive);
      show();
    }
    function show() {
      const s = steps[k], orig = steps[0].net;
      pips.innerHTML = steps.map((t, i) => `<span class="pip${i === k ? " cur" : i < k ? " done" : ""}">${i + 1}. ${t.key === "orig" ? "Start" : t.key === "swap" ? "Swap" : t.key === "find" ? "Spot" : t.key === "cancel" ? "Cancel" : "Share"}</span>`).join("");
      title.textContent = `Step ${k + 1} of ${steps.length}: ${s.title}`;
      stage.innerHTML = Dig.svg(s.net, { vals, flow: false, hl: s.hl, fresh: s.fresh, label: `${s.title}: circuit with ${s.net.gates.length} gates`, width: 680 });
      stage.classList.remove("dg-fade"); void stage.offsetWidth; stage.classList.add("dg-fade");
      const kinds = new Set(orig.gates.map((g) => g.type + g.in.length)).size;
      note.innerHTML = NOTES[s.key](s, { gates: orig.gates.length, kinds });
      const ic = icText(s), ic0 = icText(steps[0]), last = k === steps.length - 1;
      const g0 = orig.gates.length, g1 = s.net.gates.length;
      count.innerHTML = `<div class="${g1 > g0 ? "up" : g1 < g0 ? "down" : ""}"><b>${g1}</b><span>gates now (started with ${g0})</span></div><div class="${s.key !== "orig" && ic.n !== "?" && ic0.n !== "?" ? (+ic.n > +ic0.n ? "up" : +ic.n < +ic0.n ? "down" : "") : ""}"><b>${ic.n}</b><span>${s.key === "orig" ? ic.t : "ICs: " + ic.t}</span></div>` + (s.key !== "orig" ? `<div><b>${ic0.n}</b><span>ICs for the original gates</span></div>` : "");
      bBack.disabled = k === 0; bNext.disabled = last;
      paintLive();
      refit(stage);
    }
    function paintLive() {
      const s = steps[k], a = Dig.evalNet(steps[0].net, vals), b = Dig.evalNet(s.net, vals), o = cur.net.outputs[0];
      const svg = stage.querySelector("svg");
      if (svg) Dig.paint(svg, b);
      const same = Dig.sameFunction(steps[0].net, s.net, o, o);
      live.innerHTML = `Switches set to ${cur.net.inputs.map((n) => n + "=" + vals[n]).join(", ")}: original circuit Q = <b>${a[o]}</b>, this circuit Q = <b>${b[o]}</b>. ${same ? '<span class="dg-ok">The truth tables of all 2<sup>' + cur.net.inputs.length + '</sup> rows are identical.</span>' : '<span class="dg-bad">Different!</span>'}`;
    }
    function stop() { if (timer) { clearInterval(timer); timer = null; } bPlay.textContent = "▶ Play all steps"; }
    bBack.addEventListener("click", () => { stop(); if (k > 0) { k--; show(); } });
    bNext.addEventListener("click", () => { stop(); if (k < steps.length - 1) { k++; show(); } });
    bRst.addEventListener("click", () => { stop(); k = 0; show(); });
    bPlay.addEventListener("click", () => {
      if (timer) return stop();
      if (k >= steps.length - 1) k = 0;
      bPlay.textContent = "❚❚ Pause"; show();
      timer = setInterval(() => { if (k < steps.length - 1) { k++; show(); } else stop(); }, 2300);
    });
    HE.choice(pick, "Circuit", NP.map((c) => [c.id, c.name]), cur.id, (v) => load(NP.find((c) => c.id === v)));
    load(cur);
  });

  /* =====================================================================
     6. ADC: an analogue voltage becomes a number
     ===================================================================== */
  mount("w-adc", (box) => {
    let bitsN = 3, volts = 1.6;
    const sel = el("div", { class: "btn-row" }); box.append(sel);
    const canvas = el("canvas", { class: "sim", role: "img", "aria-label": "Graph of the number an analogue-to-digital converter outputs against the input voltage from 0 to 5 volts. It is a staircase: every voltage in one step gives the same number." });
    box.append(canvas);
    const ctlr = el("div", { class: "sim-controls" }); box.append(ctlr);
    const kpi = el("div", { class: "dg-kpi", "aria-live": "polite" }); box.append(kpi);
    const max = () => (1 << bitsN) - 1;
    const code = () => Math.min(max(), Math.max(0, Math.round(volts / 5 * max())));
    const sim = HE.sim(canvas, {
      w: 600, h: 280, height: (w) => (w < 480 ? 280 : 290),
      draw(ctx, t, dt, C, s) {
        const box = { x: 46, y: 18, w: s.w - 66, h: s.h - 60 };
        const P = HE.plot(ctx, box, { x0: 0, x1: 5, y0: 0, y1: max() + 0.6, xl: "input volts", yl: "number out", xt: 1, yt: bitsN > 4 ? 0 : 1, C, grid: true, tf: (v) => String(v) });
        ctx.save(); ctx.strokeStyle = C.sea; ctx.lineWidth = 3; ctx.beginPath();
        const n = max();
        for (let i = 0; i <= n; i++) {
          // the number i is output for volts between (i - 0.5)/n*5 and (i + 0.5)/n*5
          const x0 = Math.max(0, (i - 0.5) / n * 5), x1 = Math.min(5, (i + 0.5) / n * 5);
          i ? ctx.lineTo(P.X(x0), P.Y(i)) : ctx.moveTo(P.X(x0), P.Y(i)); ctx.lineTo(P.X(x1), P.Y(i));
        }
        ctx.stroke(); ctx.restore();
        ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = C.red; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(P.X(volts), P.Y(0)); ctx.lineTo(P.X(volts), P.Y(code())); ctx.lineTo(P.X(0), P.Y(code())); ctx.stroke(); ctx.restore();
        HE.dot(ctx, P.X(volts), P.Y(code()), C.red, 6, C.card);
        HE.label(ctx, `${HE.n(volts, 2)} V → ${code()}`, Math.min(P.X(volts) + 10, s.w - 90), Math.max(P.Y(code()) - 14, 34), { size: 13, bold: true, col: C.red });
      },
    });
    const upd = () => {
      sim.redraw();
      const c = code(), b = c.toString(2).padStart(bitsN, "0");
      kpi.innerHTML = `<div><b>${c}</b><span>number out (0 to ${max()})</span></div><div><b>${b}</b><span>as binary, ${bitsN} bits</span></div><div><b>${HE.n(5 / max(), 3)} V</b><span>voltage per step (5 V ÷ ${max()})</span></div>`;
    };
    HE.choice(sel, "Converter size", [[2, "2 bits"], [3, "3 bits"], [4, "4 bits"], [8, "8 bits"]], bitsN, (v) => { bitsN = v; upd(); });
    HE.slider(ctlr, { label: "Input voltage", min: 0, max: 5, step: 0.01, value: volts, unit: "V", fmt: (v) => HE.n(v, 2), oninput: (v) => { volts = v; upd(); } });
    upd();
  });
})();

/* =====================================================================
   Part 3: the programmable-control widgets
   ===================================================================== */
(function () {
  "use strict";
  if (typeof window === "undefined" || !window.HE || !window.Dig) return;
  const tex = (node, src, display) => { node.innerHTML = HE.tex(src, !!display); };
  const HE = window.HE, Dig = window.Dig, el = HE.el;
  const $ = (id) => document.getElementById(id);
  let seq = 0;
  function mount(id, fn) {
    const box = $(id);
    if (!box) return;
    try { fn(box); } catch (e) { console.error(id, e); }
  }
  const motorSVG = () => `<svg class="dg-motor" viewBox="0 0 84 84" aria-hidden="true" focusable="false"><circle cx="42" cy="42" r="37" fill="none" stroke="var(--ink-2)" stroke-width="3"/><g class="dg-spin"><rect x="39.5" y="9" width="5" height="33" rx="2" fill="var(--dg-hi)"/><rect x="42" y="39.5" width="33" height="5" rx="2" fill="var(--ink-2)"/><rect x="39.5" y="42" width="5" height="33" rx="2" fill="var(--ink-2)"/><rect x="9" y="39.5" width="33" height="5" rx="2" fill="var(--ink-2)"/></g><circle cx="42" cy="42" r="6" fill="var(--card)" stroke="var(--ink)" stroke-width="2.5"/></svg>`;
  const spinDur = (duty) => (duty > 0 ? Math.max(0.25, 40 / duty) : 0);

  /* =====================================================================
     1. The program runner: flowchart + pseudo-code + pins
     ===================================================================== */
  function execWidget(box, ids, o) {
    o = o || {};
    const uid = "ex" + ++seq;
    let prog = null, st = null, timer = null, running = false, speed = 2.5, flowSvg = null, flowInfo = null, lines = [];
    const inVals = {}, anVals = {};
    const top = el("div", { class: "btn-row" });
    const blurb = el("p", { class: "dg-say" });
    const ctl = el("div", { class: "btn-row" });
    const inputsBox = el("div", { class: "dg-note", style: "margin:4px 0" });
    const swRow = el("div", { class: "dg-tog-row", role: "group", "aria-label": "Digital inputs" });
    const slHost = el("div", { class: "sim-controls" });
    const run = el("div", { class: "dg-run" });
    const flowBox = el("div", { class: "dg-flowbox", tabindex: "0", role: "group", "aria-label": "Flowchart of the program. Scrolls if it does not fit." });
    const side = el("div");
    const pre = el("pre", { class: "dg-code", "aria-label": "Pseudo-code of the program", tabindex: "0" });
    const pins = el("div", { class: "dg-pins" });
    const vars = el("div", { class: "dg-vars" });
    const status = el("div", { class: "dg-status", role: "status" });
    side.append(pre, vars, pins, status);
    run.append(flowBox, side);
    box.append(top, blurb, ctl, inputsBox, swRow, slHost, run);
    const bStep = el("button", { type: "button", class: "btn small primary" }, "Step ▶");
    const bRun = el("button", { type: "button", class: "btn small" }, "▶ Run");
    const bRst = el("button", { type: "button", class: "btn small" }, "↺ Reset");
    const bPause = el("button", { type: "button", class: "btn small", "aria-pressed": "false" }, "❚❚ Pause animation");
    ctl.append(bStep, bRun, bRst);
    HE.choice(ctl, "Speed", [[1, "Slow"], [2.5, "Normal"], [8, "Fast"]], speed, (v) => { speed = v; });
    ctl.append(bPause);
    bPause.addEventListener("click", () => {
      const p = !box.classList.contains("dg-paused");
      box.classList.toggle("dg-paused", p); bPause.setAttribute("aria-pressed", p ? "true" : "false");
      bPause.textContent = p ? "▶ Play animation" : "❚❚ Pause animation";
    });
    const fmtV = (v) => (typeof v === "number" ? HE.n(v, 2) : String(v));

    function applyInputs() {
      prog.inputs.forEach((i) => { st.inputs[i.id] = inVals[i.id] || 0; });
      prog.analog.forEach((a) => { st.an[a.id] = anVals[a.id] != null ? anVals[a.id] : 0; });
    }
    function load(id) {
      stop();
      prog = Dig.PROGRAMS[id];
      st = Dig.newState(prog);
      blurb.innerHTML = `<b>${prog.title}.</b> ${prog.blurb}`;
      // inputs
      inputsBox.textContent = prog.inputs.length || prog.analog.length ? "Inputs (set them while the program runs):" : "";
      swRow.innerHTML = ""; slHost.innerHTML = "";
      prog.inputs.forEach((i) => {
        if (inVals[i.id] == null || o.resetInputs !== false) inVals[i.id] = 0;
        const label = () => `${i.id} = ${inVals[i.id]} · ${i.label}`;
        const b = el("button", { type: "button", class: "dg-tog", "aria-pressed": inVals[i.id] ? "true" : "false" }, label());
        b.addEventListener("click", () => { inVals[i.id] = inVals[i.id] ? 0 : 1; st.inputs[i.id] = inVals[i.id]; b.setAttribute("aria-pressed", inVals[i.id] ? "true" : "false"); b.textContent = label(); });
        swRow.append(b);
      });
      prog.analog.forEach((a) => {
        anVals[a.id] = Math.round(a.max * 0.5);
        HE.slider(slHost, { label: `${a.id} · ${a.label} (0 to ${a.max})`, min: 0, max: a.max, step: 1, value: anVals[a.id], fmt: (v) => (a.unit ? `${v}  ≈ ${HE.n(v * a.scale, 1)} ${a.unit}` : String(v)), oninput: (v) => { anVals[a.id] = v; st.an[a.id] = v; } });
      });
      // flowchart
      flowInfo = Dig.flow(prog, { uid, label: `Flowchart of the ${prog.title} program` });
      flowBox.innerHTML = flowInfo.svg;
      flowSvg = flowBox.querySelector("svg");
      flowSvg.style.minWidth = Math.round(flowInfo.W * 0.82) + "px";
      // pseudo-code
      lines = prog.lines;
      // pins
      pins.innerHTML = "";
      prog.outputs.forEach((p) => {
        const d = el("div", { class: "dg-pin", "data-pin": p.id });
        if (p.kind === "motor") d.innerHTML = `<b>${p.id} · ${p.label}</b>${motorSVG()}<span class="val">OFF</span>`;
        else d.innerHTML = `<b>${p.id} · ${p.label}</b><span class="led${p.kind === "buzzer" ? " buzz" : ""}"></span><span class="val">OFF</span>`;
        pins.append(d);
      });
      applyInputs();
      status.className = "dg-status"; status.textContent = "Ready. Press Step to run one flowchart symbol at a time, or Run to let it go.";
      render(true);
    }
    function render(initial) {
      flowBox.querySelectorAll(".dg-node.cur").forEach((n) => n.classList.remove("cur"));
      let curEl = null;
      if (!st.done && st.node) { curEl = flowBox.querySelector(`.dg-node[data-node="${st.node}"]`); if (curEl) curEl.classList.add("cur"); }
      const hot = st.done ? null : st.node;
      pre.innerHTML = lines.map((l, i) => `<span class="ln">${String(i + 1).padStart(2, " ")}</span> ${hot && l.n === hot ? `<span class="hl">${HE.esc(l.t) || " "}</span>` : HE.esc(l.t)}`).join("\n");
      prog.outputs.forEach((p) => {
        const d = pins.querySelector(`[data-pin="${p.id}"]`), v = st.out[p.id], duty = st.pwm[p.id];
        d.querySelector(".val").textContent = duty != null ? `PWM ${HE.n(duty, 1)} %` : v ? "ON" : "OFF";
        const led = d.querySelector(".led"); if (led) led.classList.toggle("on", !!v);
        const sp = d.querySelector(".dg-spin");
        if (sp) { const dd = duty != null ? duty : v ? 100 : 0; sp.style.animationDuration = dd > 0 ? spinDur(dd) + "s" : "1s"; sp.style.animationPlayState = dd > 0 ? "" : "paused"; sp.style.animationName = dd > 0 ? "" : "none"; }
      });
      const vs = Object.keys(st.vars).map((k) => `${k} = ${fmtV(st.vars[k])}`);
      vars.textContent = (vs.length ? "Variables: " + vs.join(" · ") + " · " : "") + `Program clock ${HE.n(st.t, 1)} s · ${st.steps} step${st.steps === 1 ? "" : "s"} run`;
      if (curEl && !initial) {
        const k = flowSvg.getBoundingClientRect().width / flowInfo.W, p = flowInfo.pos(st.node);
        if (flowBox.scrollHeight > flowBox.clientHeight + 4) flowBox.scrollTop = Math.max(0, p.y * k - flowBox.clientHeight / 2);
      }
    }
    function say(msg, stopped) { status.className = "dg-status" + (stopped ? " stopped" : ""); status.textContent = msg; }
    function stepOnce(manual) {
      if (st.done) return;
      const id = st.node, n = prog.nodes[id];
      Dig.step(prog, st);
      render();
      if (st.done) { say(`The program has ended after ${st.steps} steps: nothing is running any more, so the outputs will stay exactly as they are. A real program needs goto main to keep checking its inputs.`, true); stop(); return; }
      if (manual) say(n.k === "dec" ? `Decision: ${n.t.replace(/\n/g, " ")} → ${st.lastDec ? "Yes" : "No"}.` : n.wait ? `Waited ${n.wait} s of program time.` : `Ran: ${n.t.replace(/\n/g, " ")}.`);
    }
    function tick() {
      if (!running) return;
      const n = prog.nodes[st.node];
      if (n && n.wait && !st.pend) { st.pend = true; timer = setTimeout(tick, (n.wait * 1000) / speed); return; }
      st.pend = false;
      stepOnce(false);
      if (running && !st.done) timer = setTimeout(tick, 700 / speed);
    }
    function start() { if (st.done) return; running = true; bRun.textContent = "❚❚ Pause"; bRun.setAttribute("aria-pressed", "true"); say("Running…"); tick(); }
    function stop() { running = false; clearTimeout(timer); timer = null; if (st) st.pend = false; bRun.textContent = "▶ Run"; bRun.setAttribute("aria-pressed", "false"); }
    bStep.addEventListener("click", () => { if (running) { stop(); say("Paused."); } st.pend = false; stepOnce(true); });
    bRun.addEventListener("click", () => { if (running) { stop(); say("Paused."); } else start(); });
    bRst.addEventListener("click", () => { stop(); st = Dig.newState(prog); applyInputs(); say("Reset. Outputs off, variables cleared; the input settings are kept."); render(true); });
    HE.choice(top, "Program", ids.map((i) => [i, Dig.PROGRAMS[i].title]), ids[0], (v) => load(v));
    load(ids[0]);
  }
  mount("w-exec", (box) => execWidget(box, ["gun", "boiler", "soft"]));
  mount("w-exec2", (box) => execWidget(box, ["dial", "fan", "soft"]));

  /* =====================================================================
     2. Fault finding
     ===================================================================== */
  const FAULTS = [
    {
      id: "f1", name: "Motor and lamp",
      spec: "While the start switch (in1) is pressed, the motor on out1 must run at full speed (PWM 100 %) and the lamp on out2 must be on. When the switch is released, both must go off. The program must keep watching the switch for as long as the power is on.",
      lines: ["main:", "  if in1 = 1 then", "    pwm out1 = 100", "    out3 = 1", "  else", "    pwm out1 = 0", "    out2 = 0", "  end if", "(end of program)"],
      faults: { 4: "The lamp is on output 2, but this line switches output 3, which has nothing connected. A wrong pin number is exactly the kind of slip the exam asks you to spot. It should be out2 = 1.", 9: "There is no goto main. The program runs once from top to bottom and stops, so the switch is never read again. The fix is a line goto main here, at the end." },
    },
    {
      id: "f2", name: "Thermostat",
      spec: "The heater on out1 must be ON when the temperature is below 20 °C and OFF otherwise. The temperature sensor is on analogue input 1 (an1), where 0 to 255 stands for 0 to 100 °C. The temperature is checked every 2 seconds, for ever.",
      lines: ["main:", "  temp = in1 * 100 / 255", "  if temp > 20 then", "    out1 = 1", "  else", "    out1 = 0", "  end if", "  wait 2", "  goto main"],
      faults: { 2: "in1 is a digital input pin that only reads 0 or 1. The temperature sensor is on the analogue input, an1. It should be temp = an1 * 100 / 255.", 3: "The comparison is the wrong way round. The heater should be on when the temperature is BELOW 20 °C, so the test must be temp < 20. As written, the heater runs when it is already warm.", 8: "The delay has no unit. A delay in a flowchart or program must say seconds (or milliseconds): wait 2 s. The course asks for sufficient detail, including a delay unit." },
    },
    {
      id: "f3", name: "Flashing lamp (finite loop)",
      spec: "The lamp on out1 must flash exactly 5 times, 0.5 s on and 0.5 s off each time, then the program ends. The counter n counts the flashes already done.",
      lines: ["n = 0", "repeat:", "  out1 = 1", "  wait 0.5 s", "  out1 = 1", "  wait 0.5 s", "  n = n + 1", "  if n <= 5 then goto repeat", "(end of program)"],
      faults: { 5: "This line should switch the lamp OFF: out1 = 0. As written the lamp goes on at the start of the first pass and never goes off, so it never flashes.", 8: "n starts at 0 and counts the flashes done. With n <= 5 the loop repeats while n is 0, 1, 2, 3, 4 and 5, which is six passes. For five flashes the test must be n < 5." },
    },
  ];
  mount("w-fault", (box) => {
    let F = FAULTS[0], sel = new Set(), checked = false;
    const pick = el("div", { class: "btn-row" });
    const spec = el("div", { class: "dg-say" });
    const hint = el("p", { class: "dg-note" }, "Press every line you think contains a fault (or is missing something), then press Check. Some programs have more than one fault.");
    const code = el("pre", { class: "dg-code", style: "max-height:none" });
    const btns = el("div", { class: "btn-row" });
    const out = el("div", { "aria-live": "polite" });
    box.append(pick, spec, hint, code, btns, out);
    function draw() {
      code.innerHTML = "";
      F.lines.forEach((t, i) => {
        const n = i + 1, row = el("div", { class: "dg-faultline" });
        let cls = "";
        if (checked) { const isF = n in F.faults; cls = sel.has(n) && isF ? "found" : sel.has(n) ? "false" : isF ? "missed" : ""; }
        const b = el("button", { type: "button", class: cls, "aria-pressed": sel.has(n) ? "true" : "false", "aria-label": `Line ${n}: ${t.trim()}${checked && cls ? ". " + ({ found: "fault found", false: "not a fault", missed: "fault you missed" }[cls]) : ""}` }, t);
        b.addEventListener("click", () => { if (checked) return; sel.has(n) ? sel.delete(n) : sel.add(n); draw(); const nb = code.querySelectorAll("button")[i]; if (nb) nb.focus(); });
        row.append(el("span", { class: "ln" }, String(n)), b); code.append(row);
      });
    }
    function reset() { sel = new Set(); checked = false; spec.innerHTML = `<b>Specification.</b> ${F.spec}`; out.innerHTML = ""; draw(); }
    const mk = (txt, cls, fn) => { const b = el("button", { type: "button", class: "btn small" + (cls ? " " + cls : "") }, txt); b.addEventListener("click", fn); btns.append(b); };
    mk("Check my answer", "primary", () => {
      checked = true; draw();
      const keys = Object.keys(F.faults).map(Number), found = keys.filter((k) => sel.has(k)), wrong = [...sel].filter((k) => !(k in F.faults));
      let h = `<p class="dg-say"><b>${found.length} of ${keys.length}</b> faults found` + (wrong.length ? `, and ${wrong.length} line${wrong.length > 1 ? "s" : ""} that ${wrong.length > 1 ? "are" : "is"} fine.` : ".") + (found.length === keys.length && !wrong.length ? ' <span class="dg-ok">Full marks.</span>' : "") + "</p><ul style='margin:4px 0 0 1.1em;padding:0'>";
      keys.forEach((k) => { h += `<li><b>Line ${k}${sel.has(k) ? " (you found it)" : " (missed)"}:</b> ${F.faults[k]}</li>`; });
      out.innerHTML = h + "</ul>" + (wrong.length ? `<p class="dg-note">Lines marked red were not faults: ${wrong.join(", ")}.</p>` : "");
    });
    mk("↺ Try again", "", reset);
    HE.choice(pick, "Faulty program", FAULTS.map((f) => [f.id, f.name]), F.id, (v) => { F = FAULTS.find((f) => f.id === v); reset(); });
    reset();
  });

  /* =====================================================================
     3. PWM scope
     ===================================================================== */
  mount("w-pwm", (box) => {
    let duty = 60, vs = 12, real = false, ref = null;
    const F_HZ = 500, T_MS = 1000 / F_HZ;
    const canvas = el("canvas", { class: "sim", role: "img", "aria-label": "Oscilloscope trace of a pulse-width-modulated voltage. The voltage is either the full supply or zero. A dashed line shows the average voltage, which is the duty cycle times the supply voltage." });
    box.append(canvas);
    const ctl = el("div", { class: "btn-row" });
    const kpi = el("div", { class: "dg-kpi", "aria-live": "polite" });
    const eq = el("div", { class: "dg-eq" });
    const slHost = el("div", { class: "sim-controls" });
    const motorBox = el("div", { class: "dg-pin", style: "max-width:230px" });
    const describe = el("div", { class: "dg-say", "aria-live": "polite" });
    const speedFrac = (d) => (real ? (d < 15 ? 0 : (d - 15) / 85) : d / 100);
    const sim = HE.sim(canvas, {
      w: 640, h: 230, height: (w) => (w < 480 ? 230 : 220), loop: true,
      draw(ctx, t, dt, C, s) {
        const W = s.w, H = s.h, bx = { x: 52, y: 26, w: W - 70, h: H - 82 };
        const per = 3, perW = bx.w / per, D = duty / 100;
        const yHi = bx.y, yLo = bx.y + bx.h, yAvg = yLo - D * bx.h;
        ctx.fillStyle = C.paper2; ctx.fillRect(bx.x, bx.y - 10, bx.w, bx.h + 20);
        // grid
        ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.globalAlpha = 0.7;
        for (let i = 0; i <= per; i++) { const x = bx.x + i * perW; ctx.beginPath(); ctx.moveTo(x, bx.y - 10); ctx.lineTo(x, yLo + 10); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = C.muted; ctx.beginPath(); ctx.moveTo(bx.x, yLo); ctx.lineTo(bx.x + bx.w, yLo); ctx.stroke();
        HE.label(ctx, "0 V", bx.x - 6, yLo, { align: "right", size: 12, col: C.ink2 });
        HE.label(ctx, `${vs} V`, bx.x - 6, yHi, { align: "right", size: 12, col: C.ink2 });
        // the wave, scrolling gently
        const ph = HE.reduced ? 0 : (t * 0.22) % 1;
        ctx.save(); ctx.beginPath(); ctx.rect(bx.x, bx.y - 14, bx.w, bx.h + 28); ctx.clip();
        ctx.strokeStyle = C.red; ctx.lineWidth = 3; ctx.lineJoin = "miter";
        ctx.beginPath();
        let first = true;
        for (let k = -1; k <= per + 1; k++) {
          const x0 = bx.x + (k - ph) * perW, x1 = x0 + D * perW, x2 = x0 + perW;
          const pts = D <= 0 ? [[x0, yLo], [x2, yLo]] : D >= 1 ? [[x0, yHi], [x2, yHi]] : [[x0, yLo], [x0, yHi], [x1, yHi], [x1, yLo], [x2, yLo]];
          pts.forEach(([x, y]) => { if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); });
        }
        ctx.stroke();
        // shade the area under the pulses: this area is what the motor "feels"
        ctx.fillStyle = C.red; ctx.globalAlpha = 0.12;
        for (let k = -1; k <= per + 1; k++) { const x0 = bx.x + (k - ph) * perW; ctx.fillRect(x0, yHi, D * perW, bx.h); }
        ctx.globalAlpha = 1; ctx.restore();
        // average
        ctx.save(); ctx.setLineDash([7, 5]); ctx.strokeStyle = C.sea; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(bx.x, yAvg); ctx.lineTo(bx.x + bx.w, yAvg); ctx.stroke(); ctx.restore();
        HE.label(ctx, `average ${HE.n(D * vs, 2)} V`, bx.x + bx.w - 4, Math.min(yLo - 10, Math.max(yHi + 12, yAvg - 12)), { align: "right", size: 13, bold: true, col: C.sea });
        // one period bracket under the axis
        const x0 = bx.x + (1 - ph) * perW + 0, yb = yLo + 26;
        const brace = (xa, xb, y, txt, col) => {
          ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xb, y); ctx.moveTo(xa, y - 5); ctx.lineTo(xa, y + 5); ctx.moveTo(xb, y - 5); ctx.lineTo(xb, y + 5); ctx.stroke(); ctx.restore();
          HE.label(ctx, txt, (xa + xb) / 2, y + 12, { align: "center", size: 12, bold: true, col });
        };
        if (x0 > bx.x && x0 + perW < bx.x + bx.w + 0.5) {
          brace(x0, x0 + perW, yb, `T = ${HE.n(T_MS, 1)} ms`, C.ink2);
          if (D > 0 && D < 1) brace(x0, x0 + D * perW, yb - 16, `t on = ${HE.n(D * T_MS, 2)} ms`, C.red);
        } else {
          const xa = bx.x + (2 - ph) * perW; // fall back to the next period if this one is cut off
          if (xa + perW <= bx.x + bx.w + 0.5 && xa > bx.x) { brace(xa, xa + perW, yb, `T = ${HE.n(T_MS, 1)} ms`, C.ink2); if (D > 0 && D < 1) brace(xa, xa + D * perW, yb - 16, `t on = ${HE.n(D * T_MS, 2)} ms`, C.red); }
        }
      },
    });
    const playB = HE.playButton(sim, ["▶ Scroll the trace", "❚❚ Pause the trace"]);
    ctl.append(playB);
    const slider = HE.slider(slHost, { label: "Duty cycle", min: 0, max: 100, step: 1, value: duty, unit: "%", oninput: (v) => { duty = v; upd(); } });
    HE.choice(ctl, "Supply", [[5, "5 V"], [6, "6 V"], [12, "12 V"]], vs, (v) => { vs = v; upd(); });
    const realB = el("button", { type: "button", class: "btn small", "aria-pressed": "false" }, "Real motor: needs about 15 % to start");
    realB.addEventListener("click", () => { real = !real; realB.setAttribute("aria-pressed", real ? "true" : "false"); realB.classList.toggle("primary", real); upd(); });
    ctl.append(realB);
    const refB = el("button", { type: "button", class: "btn small" }, "Use this duty as my starting point");
    refB.addEventListener("click", () => { ref = duty; upd(); });
    box.append(ctl, slHost, kpi, eq, el("div", { class: "dg-pins" }, motorBox), el("div", { class: "btn-row" }, refB), describe);
    function upd() {
      sim.redraw();
      const D = duty / 100, vavg = D * vs, sp = speedFrac(duty);
      kpi.innerHTML = `<div><b>${duty} %</b><span>duty cycle</span></div><div><b>${HE.n(D * T_MS, 2)} ms of ${HE.n(T_MS, 1)} ms</b><span>on-time in one period (${F_HZ} Hz)</span></div><div><b>${HE.n(vavg, 2)} V</b><span>average voltage</span></div><div><b>${Math.round(sp * 100)} %</b><span>motor speed, as a share of full speed<div class="dg-bar g"><i style="width:${sp * 100}%"></i></div></span></div><div><b>${Math.round((1 - D) * 100)} %</b><span>power thrown away as heat if a series resistor made the same voltage (PWM wastes almost none)<div class="dg-bar"><i style="width:${(1 - D) * 100}%"></i></div></span></div>`;
      tex(eq, `V_{\\text{avg}} = \\dfrac{t_{\\text{on}}}{T} \\times V_s = ${HE.n(D, 2)} \\times ${vs} = ${HE.n(vavg, 2)}\\ \\text{V}`, true);
      motorBox.innerHTML = `<b>Motor</b>${motorSVG()}<span class="val">${sp > 0 ? Math.round(sp * 100) + " % of full speed" : "not turning"}</span>`;
      const sps = motorBox.querySelector(".dg-spin");
      if (sps) { if (sp > 0) { sps.style.animationDuration = spinDur(sp * 100) + "s"; } else sps.style.animationName = "none"; }
      if (ref == null) describe.innerHTML = "<b>Describe the speed.</b> Press <em>Use this duty as my starting point</em>, then move the slider, and the sentence below will write the description for you.";
      else if (ref === duty) describe.innerHTML = `<b>Starting point set at ${ref} %.</b> Now move the duty slider up or down.`;
      else {
        const dn = duty < ref, v0 = ref / 100 * vs, s0 = speedFrac(ref), s1 = sp;
        describe.innerHTML = `<b>As the duty cycle ${dn ? "falls" : "rises"} from ${ref} % to ${duty} %</b>, the average voltage ${dn ? "falls" : "rises"} from ${HE.n(v0, 2)} V to ${HE.n(vavg, 2)} V, so the motor ${dn ? "slows down" : "speeds up"} ` + (real && (duty < 15 || ref < 15) ? "(it stops altogether below about 15 %, because the voltage is too small to overcome friction)" : (s0 > 0 ? `smoothly and in proportion, to about ${Math.round(s1 / s0 * 100)} % of its starting speed` : "smoothly")) + (duty === 0 ? ". At 0 % duty there is no voltage and the motor stops." : ".");
      }
    }
    upd();
  });

  /* =====================================================================
     4. Capstan: logic board + microcontroller
     ===================================================================== */
  const CAP = { inputs: ["A", "B", "C", "D"], gates: [{ type: "NAND", in: ["D", "D"], out: "nD" }, { type: "NAND", in: ["A", "B", "C", "nD"], out: "u" }, { type: "NAND", in: ["u", "u"], out: "E" }], outputs: ["E"] };
  mount("w-capstan", (box) => {
    const vals = { A: 1, B: 1, C: 0, D: 0 };
    let dial = 150;
    const prog = Dig.PROGRAMS.capstan;
    const legend = { A: "pawls lifted clear", B: "guard rail in place", C: "heave button", D: "emergency stop" };
    const cols = el("div", { class: "dg-cols" }), left = el("div"), right = el("div");
    cols.append(left, right);
    const stage = el("div", { class: "dg-stage" });
    const swHost = el("div");
    const slHost = el("div", { class: "sim-controls" });
    const flowHost = el("div", { class: "dg-flowbox", tabindex: "0", role: "group", "aria-label": "Flowchart of the capstan program. The boxes lit up are the ones that ran on the last pass." });
    const readout = el("div", { class: "dg-kpi", "aria-live": "polite" });
    const ttHost = el("div", { class: "dg-ttwrap" });
    const check = el("div", { class: "btn-row" });
    const result = el("p", { class: "dg-say", "aria-live": "polite" });
    left.append(stage, swHost);
    right.append(readout, ttHost);
    const flowInfo = Dig.flow(prog, { uid: "cap", label: "Flowchart of the capstan program" });
    flowHost.innerHTML = flowInfo.svg; flowHost.querySelector("svg").style.minWidth = Math.round(flowInfo.W * 0.82) + "px";
    box.append(cols, slHost, el("p", { class: "dg-note" }, "The microcontroller program (the boxes that ran on the latest pass are lit):"), flowHost, check, result);
    stage.innerHTML = Dig.svg(CAP, { vals, flow: true, label: "Logic board: a NOT gate on D, a four-input NAND, then a NAND with its inputs tied, producing ENABLE", width: 520, tags: false });
    const svg = stage.querySelector("svg");
    const sw = (function () {
      const row = el("div", { class: "dg-tog-row", role: "group", "aria-label": "Capstan switches" }), b = {};
      CAP.inputs.forEach((n) => {
        const label = () => `${n} = ${vals[n]} · ${legend[n]}`;
        b[n] = el("button", { type: "button", class: "dg-tog", "aria-pressed": vals[n] ? "true" : "false" }, label());
        b[n].addEventListener("click", () => { vals[n] = vals[n] ? 0 : 1; b[n].setAttribute("aria-pressed", vals[n] ? "true" : "false"); b[n].textContent = label(); update(); });
        row.append(b[n]);
      });
      swHost.append(row); return b;
    })();
    HE.slider(slHost, { label: "an1 · speed dial (0 to 255)", min: 0, max: 255, step: 1, value: dial, oninput: (v) => { dial = v; update(); } });
    function update() {
      const all = Dig.evalNet(CAP, vals), E = all.E;
      Dig.paint(svg, all);
      const st = Dig.newState(prog); st.inputs.in1 = E; st.an.an1 = dial; Dig.settle(prog, st);
      flowHost.querySelectorAll(".dg-node").forEach((n) => n.classList.toggle("cur", (st.trail || []).includes(n.getAttribute("data-node")) && n.getAttribute("data-node") !== "n0"));
      const duty = st.pwm.out1 || 0, lamp = st.out.out2;
      readout.innerHTML = `<div><b>E = ${E}</b><span>ENABLE from the logic board (in1)</span></div><div><b>${HE.n(duty, 1)} %</b><span>motor PWM duty (out1)</span></div><div><b>${lamp ? "ON" : "OFF"}</b><span>running lamp (out2)</span></div><div><b>${HE.n(duty / 100 * 12, 2)} V</b><span>average motor voltage on a 12 V supply</span></div>`;
      ttHost.innerHTML = Dig.ttHTML(CAP, "E", { cur: rowIndex(CAP.inputs, vals) });
    }
    const rowIndex = (names, v) => names.reduce((a, n) => a * 2 + (v[n] ? 1 : 0), 0);
    const bC = el("button", { type: "button", class: "btn small primary" }, "Check all 16 switch combinations");
    bC.addEventListener("click", () => {
      let ok = 0; const bad = [];
      Dig.rows(CAP.inputs).forEach((r) => { const want = r.A && r.B && r.C && !r.D ? 1 : 0; if (Dig.evalNet(CAP, r).E === want) ok++; else bad.push(r); });
      result.innerHTML = ok === 16 ? `<span class="dg-ok">${ok} of 16 agree</span> with the specification E = A · B · C · D̄: the NAND-only board is the AND-with-NOT circuit, drawn with 3 gates (2 ICs).` : `<span class="dg-bad">${16 - ok} rows disagree.</span>`;
    });
    check.append(bC, el("button", { type: "button", class: "btn small", onclick: function () { const p = !box.classList.contains("dg-paused"); box.classList.toggle("dg-paused", p); this.setAttribute("aria-pressed", p ? "true" : "false"); this.textContent = p ? "▶ Play animation" : "❚❚ Pause animation"; }, "aria-pressed": "false" }, "❚❚ Pause animation"));
    update();
  });
})();
