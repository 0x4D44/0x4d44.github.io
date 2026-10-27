/* Past-paper practice: the auto-marker for Higher Maths.
   Pure functions, no DOM, so the question banks can be tested in Node (tests/papers.test.mjs).
   Candidates type maths as plain text: x^2, sqrt(3), 3/4, pi, 2x(x-1). Expressions are read by a small
   parser (no eval) and judged by VALUE, so 0.5, 1/2 and 2/4 are the same number, and (x+1)^2 and
   x^2+2x+1 are the same expression: they agree at a spread of test points.

   A part is { type, marks, q, ... }; scorePart(part, answer) returns { got, of, ... } or { error } when
   an answer cannot be read (the panel then asks the candidate to retype it instead of marking it wrong).

   type      answer shape        key fields
   mcq       option index        opts[], a (index), why
   multi     array of indexes    opts[], a ([indexes]); a mark per correct option, minus one per wrong tick
   match     array of indexes    pairs [[term, meaning], ...]; a mark per pair
   num       string              a (number or expression string), tol (default 1e-6), alts[], partial[], unit
   expr      string              a (expression in vars), vars (default ["x"]), plusC, partial[]
   eq        string              a (an equation "lhs = rhs"); judged up to a constant multiple
   set       string "1, -2, 3"   a ([numbers]); one mark per root found, minus one per wrong extra
   vec       string "(3,-1,2)"   a ([numbers]); all or nothing. Also reads 3i-j+2k
   fields    array of strings    fields [{label, type: num|expr|eq|set|vec, a, marks, ...}]; marks add up
   text      string              points [{desc, all, any, not, marks}], sample; self-ticked afterwards
   `show` (TeX) is the answer printed after marking; `why` is the worked solution with the marking bullets.
   partial: [{ a, marks, note }] awards method marks for a listed wrong-but-reasoned answer (num/expr only). */
(function () {
  "use strict";
  const HMP = (window.HMP = window.HMP || {});

  /* ---------------- tidy and parse ---------------- */
  const SUP = { "²": "^2", "³": "^3", "⁴": "^4", "⁻¹": "^(-1)" };
  const FUNCS = { sqrt: Math.sqrt, sin: Math.sin, cos: Math.cos, tan: Math.tan, ln: Math.log, log: Math.log, exp: Math.exp, abs: Math.abs, arcsin: Math.asin, arccos: Math.acos, arctan: Math.atan };
  const FNAMES = Object.keys(FUNCS).sort((a, b) => b.length - a.length);

  HMP.tidy = function (s) {
    let t = String(s == null ? "" : s).toLowerCase();
    t = t.replace(/[−–—]/g, "-").replace(/[×·⋅]/g, "*").replace(/÷/g, "/").replace(/\*\*/g, "^").replace(/√/g, "sqrt").replace(/π/g, "pi")
      .replace(/[²³⁴]|⁻¹/g, (m) => SUP[m]).replace(/°|degrees?|rad(?:ians?)?\b/g, "").replace(/\$/g, "").replace(/[{}]/g, (c) => (c === "{" ? "(" : ")")).replace(/\[/g, "(").replace(/\]/g, ")")
      .replace(/\\(?:left|right|cdot)/g, (m) => (m === "\\cdot" ? "*" : "")).replace(/\\frac\s*\(([^()]*)\)\s*\(([^()]*)\)/g, "(($1)/($2))")
      .replace(/\s+/g, " ").trim();
    return t;
  };

  function tokenize(src) {
    const toks = [];
    let i = 0;
    while (i < src.length) {
      const c = src[i];
      if (c === " ") { i++; continue; }
      let m;
      if ((m = /^(?:\d+(?:\.\d*)?|\.\d+)/.exec(src.slice(i)))) { toks.push({ t: "num", v: parseFloat(m[0]) }); i += m[0].length; continue; }
      if (/[a-z]/.test(c)) {
        const rest = src.slice(i);
        const f = FNAMES.find((n) => rest.startsWith(n));
        if (f) { toks.push({ t: "fn", v: f }); i += f.length; continue; }
        if (rest.startsWith("pi")) { toks.push({ t: "id", v: "pi" }); i += 2; continue; }
        toks.push({ t: "id", v: c }); i++; continue;
      }
      if ("+-*/^(),=".includes(c)) { toks.push({ t: c }); i++; continue; }
      throw new Error(`I cannot read "${c}"`);
    }
    return toks;
  }

  /* recursive descent; returns an AST of closures-in-waiting */
  function parse(src, allowed) {
    const toks = tokenize(src);
    let p = 0;
    const peek = () => toks[p];
    const eat = (t) => { if (toks[p] && toks[p].t === t) return toks[p++]; return null; };
    const startsFactor = (k) => k && (k.t === "num" || k.t === "id" || k.t === "fn" || k.t === "(");
    function sum() {
      let a = term();
      for (;;) {
        if (eat("+")) { const b = term(), l = a; a = (v) => l(v) + b(v); }
        else if (eat("-")) { const b = term(), l = a; a = (v) => l(v) - b(v); }
        else return a;
      }
    }
    function term() {
      let a = unary();
      for (;;) {
        const k = peek();
        if (k && k.t === "*") { p++; const b = unary(), l = a; a = (v) => l(v) * b(v); }
        else if (k && k.t === "/") { p++; const b = unary(), l = a; a = (v) => l(v) / b(v); }
        else if (startsFactor(k)) {
          if (toks[p - 1] && toks[p - 1].t === "num" && k.t === "num") throw new Error("two numbers side by side: put an operator between them");
          const b = unary(), l = a; a = (v) => l(v) * b(v);
        } else return a;
      }
    }
    function unary() {
      if (eat("-")) { const a = unary(); return (v) => -a(v); }
      if (eat("+")) return unary();
      return power();
    }
    function power() {
      const base = atom();
      if (eat("^")) {
        const neg = !!eat("-");
        if (!neg) eat("+");
        const e = exponentAtom();
        return (v) => Math.pow(base(v), neg ? -e(v) : e(v));
      }
      return base;
    }
    function exponentAtom() { // x^2, x^(1/2), x^-3, x^2x is (x^2)*x
      const k = peek();
      if (k && k.t === "(") return atom();
      if (k && k.t === "num") { p++; return () => k.v; }
      if (k && k.t === "id") return atom();
      throw new Error("missing power");
    }
    function juxtArg() { // sin2x, sqrt3, sin x: factors joined only by juxtaposition
      let a = power(), prevNum = toks[p - 1] && toks[p - 1].t === "num";
      while (startsFactor(peek()) && !(prevNum && peek().t === "num")) {
        prevNum = peek().t === "num";
        const b = power(), l = a; a = (v) => l(v) * b(v);
      }
      return a;
    }
    function atom() {
      const k = peek();
      if (!k) throw new Error("the answer stops short");
      if (k.t === "num") { p++; return () => k.v; }
      if (k.t === "(") {
        p++; const a = sum();
        if (!eat(")")) throw new Error("a bracket is not closed");
        return a;
      }
      if (k.t === "fn") {
        p++;
        let pw = null;
        if (peek() && peek().t === "^") { p++; const neg = !!eat("-"); const e = exponentAtom(); pw = (v) => (neg ? -e(v) : e(v)); }
        let arg;
        if (peek() && peek().t === "(") { p++; arg = sum(); if (!eat(")")) throw new Error("a bracket is not closed"); }
        else if (startsFactor(peek())) arg = juxtArg();
        else throw new Error(`${k.v} needs something to work on: write ${k.v}(...)`);
        const f = FUNCS[k.v];
        return pw ? (v) => Math.pow(f(arg(v)), pw(v)) : (v) => f(arg(v));
      }
      if (k.t === "id") {
        p++;
        if (k.v === "pi") return () => Math.PI;
        if (k.v === "e" && !allowed.includes("e")) return () => Math.E;
        if (!allowed.includes(k.v)) throw new Error(`"${k.v}" is not a letter this question uses`);
        return (v) => v[k.v];
      }
      throw new Error(`unexpected "${k.t}"`);
    }
    const out = sum();
    if (p < toks.length) throw new Error(`I could not read the answer from "${toks[p].t === "num" ? toks[p].v : toks[p].v || toks[p].t}" onwards`);
    return out;
  }
  HMP.compile = (s, vars) => parse(HMP.tidy(s), vars || []);
  /* value of a variable-free expression */
  HMP.evalNum = (s, extraVars) => HMP.compile(s, Object.keys(extraVars || {}))(extraVars || {});

  /* Answers: take the right-hand side of a trailing "x = ..." or "f'(x) = ..." and forgive units. */
  function rhs(s) {
    const t = HMP.tidy(s);
    return t.includes("=") ? t.slice(t.lastIndexOf("=") + 1).trim() : t;
  }
  function stripUnits(t) {
    return t.replace(/(?:square |sq\.? )?(?:units?|cm|mm|km|metres?|meters?|m|s|secs?|seconds?|ms|mph|kg|hours?|hrs?|years?|days?|minutes?|mins?)(?:\^?\s*[23])?\s*(?:per\s+\w+|\/\s*\w+)?\s*$/g, "").trim();
  }
  function numFrom(s, vars) {
    let t = rhs(s);
    if (!t) throw new Error("nothing typed");
    let f;
    try { f = HMP.compile(t, vars); }
    catch (e) {
      const u = stripUnits(t);
      if (u && u !== t) f = HMP.compile(u, vars); else throw e;
    }
    return f;
  }

  /* ---------------- comparing ---------------- */
  const close = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 1e-6 : tol) + 1e-9 + 1e-9 * Math.abs(b);
  const PTS1 = [0.37, 1.13, 1.9, 2.61, -0.58, -1.47, 3.3, 0.91, 4.2, -2.35, 0.12, 5.7];
  function samples(vars, positive) {
    const out = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 14; i++) {
      const v = {};
      vars.forEach((n, k) => { const base = vars.length === 1 ? PTS1[i % PTS1.length] : (rnd() * 6 - 2.3 + k * 0.17); v[n] = positive ? Math.abs(base) + 0.15 : base; });
      out.push(v);
    }
    return out;
  }
  function sameFn(f, g, vars, o) {
    const pts = samples(vars, o && o.positive);
    let used = 0, c = null;
    for (const v of pts) {
      let a, b;
      try { a = f(v); b = g(v); } catch (e) { continue; }
      if (!isFinite(b)) continue;              // the key is undefined here: skip the point
      if (!isFinite(a)) return false;
      used++;
      const sc = 1 + Math.abs(b);
      if (o && o.plusC) { const d = a - b; if (c == null) c = d; else if (Math.abs(d - c) > 1e-7 * (1 + Math.abs(c) + sc)) return false; }
      else if (Math.abs(a - b) > 1e-7 * sc) return false;
    }
    return used >= 5;
  }
  function eqFn(s, vars) {
    const t = HMP.tidy(s);
    const parts = t.split("=");
    if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) throw new Error("write it as an equation with one = sign");
    const l = parse(parts[0], vars), r = parse(parts[1], vars);
    return (v) => l(v) - r(v);
  }
  function sameEq(f, g, vars) {
    let k = null, used = 0;
    for (const v of samples(vars)) {
      const a = f(v), b = g(v);
      if (!isFinite(a) || !isFinite(b)) return false;
      if (Math.abs(b) < 1e-6) { if (Math.abs(a) > 1e-6) return false; continue; }
      const r = a / b; used++;
      if (Math.abs(r) < 1e-9) return false;
      if (k == null) k = r; else if (Math.abs(r - k) > 1e-6 * (1 + Math.abs(k))) return false;
    }
    return used >= 5;
  }
  const pieces = (s) => HMP.tidy(s).split(/\s*(?:,|;|\band\b|\bor\b|\s&\s)\s*/).map((x) => x.trim()).filter(Boolean);
  function setVals(s) {
    return pieces(s).map((p) => numFrom(p, [])({}));
  }
  function vecVals(s) {
    let t = HMP.tidy(s);
    if (/^[\d\s.+\-ijk/()]*$/.test(t) && /[ijk]/.test(t) && !/,/.test(t)) { // 3i - j + 2k
      const c = { i: 0, j: 0, k: 0 };
      const re = /([+-]?)\s*((?:\d+(?:\.\d+)?(?:\s*\/\s*\d+)?)?)\s*([ijk])/g;
      let m, rest = t;
      while ((m = re.exec(t))) { const n = m[2] ? HMP.evalNum(m[2]) : 1; c[m[3]] += (m[1] === "-" ? -1 : 1) * n; rest = rest.replace(m[0], ""); }
      if (/[\d.]/.test(rest)) throw new Error("write the vector as (a, b, c) or as ai + bj + ck");
      return [c.i, c.j, c.k];
    }
    t = t.replace(/^[\s(<]+|[\s)>]+$/g, "").replace(/\)\s*\(/g, ",");
    const parts = t.includes(",") ? t.split(",") : t.split(/\s+/);
    return parts.map((x) => numFrom(x.replace(/^[\s(]+|[\s)]+$/g, ""), [])({}));
  }

  /* one input, one verdict: { ok, got, note } */
  function scoreOne(f, ans) {
    const marks = f.marks;
    const s = String(ans == null ? "" : ans);
    if (!s.trim()) return { got: 0, empty: true };
    switch (f.type) {
      case "num": {
        const v = numFrom(s, [])({});
        if (!isFinite(v)) throw new Error("that does not come to a number");
        const keys = [f.a].concat(f.alts || []).map((a) => (typeof a === "number" ? a : HMP.evalNum(a)));
        if (keys.some((k) => close(v, k, f.tol))) return { got: marks };
        const h = (f.partial || []).find((p) => close(v, typeof p.a === "number" ? p.a : HMP.evalNum(p.a), f.tol));
        return h ? { got: Math.min(h.marks, marks), note: h.note, method: true } : { got: 0 };
      }
      case "expr": {
        const vars = f.vars || ["x"], allowed = f.plusC ? vars.concat(["c"]) : vars;
        const g = numFrom(s, allowed);
        const key = HMP.compile(f.a, vars);
        const wrap = (fn) => (v) => fn(f.plusC ? Object.assign({ c: 0 }, v) : v);
        if (sameFn(wrap(g), key, vars, { plusC: f.plusC, positive: f.positive })) return { got: marks };
        const h = (f.partial || []).find((p) => sameFn(wrap(g), HMP.compile(p.a, vars), vars, { plusC: f.plusC, positive: f.positive }));
        return h ? { got: Math.min(h.marks, marks), note: h.note, method: true } : { got: 0 };
      }
      case "eq": {
        const vars = f.vars || ["x", "y"];
        return { got: sameEq(eqFn(s, vars), eqFn(f.a, vars), vars) ? marks : 0 };
      }
      case "set": {
        const mine = setVals(s), key = f.a.map((a) => (typeof a === "number" ? a : HMP.evalNum(a)));
        if (mine.some((v) => !isFinite(v))) throw new Error("that does not come to a number");
        const left = key.slice();
        let right = 0;
        mine.forEach((v) => { const i = left.findIndex((k) => close(v, k, f.tol)); if (i >= 0) { left.splice(i, 1); right++; } });
        const net = Math.max(0, right - (mine.length - right));
        return { got: Math.floor((marks * net) / key.length + 1e-9) };
      }
      case "vec": {
        const mine = vecVals(s), key = f.a.map((a) => (typeof a === "number" ? a : HMP.evalNum(a)));
        return { got: mine.length === key.length && mine.every((v, i) => close(v, key[i], f.tol)) ? marks : 0 };
      }
      default: throw new Error("unknown field type " + f.type);
    }
  }
  const attempt = (f, ans) => {
    try { return scoreOne(f, ans); } catch (e) { return { error: e.message, got: 0 }; }
  };

  /* ---------------- written answers (a few "explain / justify" parts) ---------------- */
  const WIN = 160;
  const NEG = /\b(not|never|cannot|no longer|isn't|aren't|doesn't|don't|won't|can't)\b|n't\b/;
  const rx = (src) => new RegExp(src, "i");
  HMP.norm = (s) => String(s == null ? "" : s).toLowerCase().replace(/[‘’“”]/g, "'").replace(/[–—−]/g, "-").replace(/\s+/g, " ").trim();
  HMP.pointHit = function (pt, text, negCheck) {
    const all = pt.all || [], any = pt.any || [], not = pt.not || [];
    if (!all.length && !any.length) return false;
    if (not.some((p) => rx(p).test(text))) return false;
    if (any.length && !any.some((p) => rx(p).test(text))) return false;
    if (negCheck && !pt.negOK) {
      const spans = [];
      all.concat(any).forEach((p) => { const g = new RegExp(rx(p).source, "gi"); let m; while ((m = g.exec(text))) { spans.push(m.index); if (m[0] === "") g.lastIndex++; } });
      if (spans.some((a) => NEG.test(text.slice(Math.max(0, a - 70), a + 1).split(/[.;!?]|\bbut\b|\bhowever\b/).pop()))) return false;
    }
    if (!all.length) return true;
    const win = pt.win || WIN;
    const where = all.map((p) => { const g = new RegExp(rx(p).source, "gi"); const ix = []; let m; while ((m = g.exec(text))) { ix.push(m.index); if (m[0] === "") g.lastIndex++; } return ix; });
    if (where.some((ix) => !ix.length)) return false;
    return where[0].some((a) => where.every((ix) => ix.some((b) => Math.abs(a - b) <= win)));
  };
  function scoreText(part, ans) {
    const text = HMP.norm(ans);
    const w = (text.match(/[a-z0-9]+/g) || []).length;
    const min = part.minWords == null ? 3 : Math.min(part.minWords, 5);
    const neg = !NEG.test(HMP.norm(part.sample || ""));
    const pts = part.points.map((pt) => ({ desc: pt.desc, marks: pt.marks == null ? 1 : pt.marks, hit: w >= min && HMP.pointHit(pt, text, neg), group: pt.group }));
    const seen = new Set();
    pts.forEach((p) => { if (p.group && p.hit) { if (seen.has(p.group)) p.hit = false; else seen.add(p.group); } });
    let got = Math.min(part.marks, pts.reduce((a, p) => a + (p.hit ? p.marks : 0), 0));
    got = Math.min(got, Math.max(Math.floor(w / 4), w >= min ? 1 : 0));   // a mark needs some writing behind it
    return { got, of: part.marks, points: pts };
  }

  /* ---------------- the public marker ---------------- */
  HMP.scorePart = function (part, ans) {
    const of = part.marks;
    switch (part.type) {
      case "mcq": return { got: ans === part.a ? of : 0, of };
      case "multi": {
        const picked = Array.isArray(ans) ? ans : [];
        const right = picked.filter((i) => part.a.includes(i)).length;
        return { got: Math.max(0, Math.min(of, right - (picked.length - right))), of };
      }
      case "match": {
        const picked = Array.isArray(ans) ? ans : [];
        return { got: Math.min(of, part.pairs.filter((_, i) => picked[i] === i).length), of };
      }
      case "text": return scoreText(part, ans);
      case "fields": {
        const list = Array.isArray(ans) ? ans : [];
        const per = part.fields.map((f, i) => Object.assign(attempt(Object.assign({ marks: f.marks }, f), list[i]), { max: f.marks }));
        const bad = per.findIndex((r) => r.error);
        if (bad >= 0) return { error: `${part.fields[bad].label ? part.fields[bad].label + ": " : ""}${per[bad].error}`, of };
        return { got: Math.min(of, per.reduce((a, r) => a + r.got, 0)), of, per, note: per.map((r) => r.note).filter(Boolean).join(" ") || undefined };
      }
      default: {
        const r = attempt(Object.assign({ marks: of }, part), ans);
        if (r.error) return { error: r.error, of };
        return { got: r.got, of, note: r.note };
      }
    }
  };

  /* the model answer for a part, as something a test can feed back to the marker */
  const keyText = (f) => {
    switch (f.type) {
      case "num": return f.sample != null ? f.sample : String(f.a);
      case "expr": case "eq": return f.sample != null ? f.sample : f.a;
      case "set": return f.a.join(", ");
      case "vec": return "(" + f.a.join(", ") + ")";
      default: return null;
    }
  };
  HMP.modelAnswer = function (part) {
    switch (part.type) {
      case "mcq": return part.a;
      case "multi": return part.a.slice();
      case "match": return part.pairs.map((_, i) => i);
      case "text": return part.sample;
      case "fields": return part.fields.map(keyText);
      default: return keyText(part);
    }
  };

  HMP.partsMarks = (q) => q.parts.reduce((a, p) => a + p.marks, 0);
  HMP.AREAS = [
    { id: "alg", name: "Algebra & functions", short: "Algebra" },
    { id: "geo", name: "Coordinate geometry, circles & vectors", short: "Geometry" },
    { id: "trig", name: "Trigonometry", short: "Trigonometry" },
    { id: "cal", name: "Calculus", short: "Calculus" },
  ];
})();
