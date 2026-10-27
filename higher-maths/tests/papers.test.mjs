// Contract and marker tests for the past-paper banks (papers-*.js) and the auto-marker (papers-engine.js).
// Run with: node --test higher-maths/tests/papers.test.mjs   (HMP_AREAS=alg,geo limits it to some banks)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";

const PROJECT = resolve(import.meta.dirname, "..");
const AREAS = process.env.HMP_AREAS ? process.env.HMP_AREAS.split(",") : ["alg", "geo", "trig", "cal"];
const MIN_MARKS = { alg: 80, geo: 70, trig: 65, cal: 80 };

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["papers-engine.js", ...AREAS.map((a) => `papers-${a}.js`)])
  vm.runInContext(await readFile(resolve(PROJECT, f), "utf8"), sandbox, { filename: f });
const { HMP, HMP_BANK } = sandbox.window;
const katex = createRequire(import.meta.url)(resolve(PROJECT, "vendor/katex/katex.min.js"));
const strip = (h) => String(h).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");

const all = AREAS.flatMap((a) => HMP_BANK[a].questions.map((q) => ({ area: a, q })));
const parts = all.flatMap(({ area, q }) => q.parts.map((p, i) => ({ area, q, p, i })));
const TYPED = ["num", "expr", "eq", "set", "vec"];
const fieldsOf = (p) => (p.type === "fields" ? p.fields.map((f) => ({ f, w: "field " + (f.label || "")})) : TYPED.includes(p.type) ? [{ f: p, w: "" }] : []);

test("every area has a bank of the expected depth and a calculator / non-calculator mix", () => {
  for (const a of AREAS) {
    const b = HMP_BANK[a];
    assert.ok(b && b.intro && b.questions.length >= 12, `${a}: intro and at least twelve questions`);
    const marks = b.questions.reduce((s, q) => s + HMP.partsMarks(q), 0);
    assert.ok(marks >= MIN_MARKS[a], `${a}: ${marks} marks, wanted at least ${MIN_MARKS[a]}`);
    for (const calc of [true, false]) {
      const m = b.questions.filter((q) => q.calc === calc).reduce((s, q) => s + HMP.partsMarks(q), 0);
      assert.ok(m >= 20, `${a}: only ${m} ${calc ? "calculator" : "non-calculator"} marks`);
    }
  }
});

test("questions are well-formed and ids are unique", () => {
  const ids = new Set();
  for (const { area, q } of all) {
    assert.match(q.id, new RegExp(`^${area}-\\d\\d$`), `${q.id}: id format`);
    assert.ok(!ids.has(q.id), `${q.id}: duplicate id`);
    ids.add(q.id);
    assert.equal(typeof q.calc, "boolean", `${q.id}: calc flag`);
    assert.ok(q.stem && strip(q.stem).trim().length > 20, `${q.id}: stem`);
    assert.ok(q.style && q.style.length > 10, `${q.id}: style tag`);
    assert.ok(q.parts.length >= 1 && q.parts.length <= 6, `${q.id}: one to six parts`);
    const m = HMP.partsMarks(q);
    assert.ok(m >= 2 && m <= 12, `${q.id}: ${m} marks is a plausible question`);
    if (q.figure) {
      assert.match(q.figure, /<svg[^>]+role="img"[^>]+aria-label="[^"]{30,}"/, `${q.id}: figure is an accessible svg`);
      assert.doesNotMatch(q.figure, /(?:href|src)=["']?https?:/i, `${q.id}: no remote figure assets`);
    }
  }
});

test("every part is well-formed for its type", () => {
  for (const { q, p, i } of parts) {
    const w = `${q.id}[${i}]`;
    assert.ok(p.q && strip(p.q).trim().length > 5, `${w}: question text`);
    assert.ok(Number.isInteger(p.marks) && p.marks >= 1 && p.marks <= 6, `${w}: marks`);
    if (q.parts.length > 1) assert.ok(p.label, `${w}: parts are labelled (a), (b)...`);
    assert.ok(p.why && strip(p.why).length > 15, `${w}: worked solution`);
    switch (p.type) {
      case "mcq":
        assert.equal(p.marks, 1, `${w}: mcq is one mark`);
        assert.ok(p.opts.length >= 4 && new Set(p.opts).size === p.opts.length, `${w}: four distinct options`);
        assert.ok(Number.isInteger(p.a) && p.a >= 0 && p.a < p.opts.length, `${w}: answer index`);
        break;
      case "multi":
        assert.ok(p.opts.length >= 5 && new Set(p.opts).size === p.opts.length, `${w}: five distinct options`);
        assert.ok(Array.isArray(p.a) && p.a.length >= 2 && p.a.length < p.opts.length && new Set(p.a).size === p.a.length && p.a.every((x) => x >= 0 && x < p.opts.length), `${w}: answers`);
        assert.equal(p.marks, p.a.length, `${w}: a mark per correct option`);
        break;
      case "match":
        assert.ok(p.pairs.length >= 3 && p.pairs.length <= 6, `${w}: three to six pairs`);
        assert.equal(new Set(p.pairs.map((x) => x[1])).size, p.pairs.length, `${w}: distinct definitions`);
        assert.ok(p.pairs.every((x) => !/[$<]/.test(x[1])), `${w}: match meanings are plain text (select options are not typeset)`);
        assert.equal(p.marks, p.pairs.length, `${w}: a mark per pair`);
        break;
      case "fields":
        assert.ok(p.fields.length >= 2, `${w}: at least two fields`);
        assert.equal(p.marks, p.fields.reduce((s, f) => s + f.marks, 0), `${w}: field marks add up`);
        break;
      case "text":
        assert.ok(p.sample && p.points.length >= p.marks, `${w}: sample and a point per mark`);
        assert.ok(p.points.every((pt) => pt.desc && (pt.all || pt.any)), `${w}: points are described and have patterns`);
        break;
      case "num": case "expr": case "eq": case "set": case "vec": break;
      default: assert.fail(`${w}: unknown type ${p.type}`);
    }
    for (const { f, w: fw } of fieldsOf(p)) {
      assert.ok(f.show && strip(f.show).length > 0, `${w} ${fw}: show (the TeX of the answer)`);
      assert.ok(Number.isInteger(f.marks || p.marks), `${w} ${fw}: marks`);
      assert.ok(Array.isArray(f.reject) && f.reject.length >= 1, `${w} ${fw}: at least one realistic wrong answer in reject[]`);
      if (f.type === "num") assert.ok(f.a != null && (f.tol == null || f.tol >= 0), `${w} ${fw}: numeric key`);
      if (f.type === "set") assert.equal(f.marks || p.marks, f.a.length, `${w} ${fw}: a mark per root`);
    }
  }
});

test("the marker gives full marks to the model answer, accepted forms, and less to rejected ones", () => {
  for (const { q, p, i } of parts) {
    const w = `${q.id}[${i}]`;
    const full = HMP.scorePart(p, HMP.modelAnswer(p));
    assert.ok(!full.error, `${w}: model answer reads fine (${full.error})`);
    assert.equal(full.got, p.marks, `${w}: model answer earns full marks`);
    const each = (f, field) => {
      const give = (s) => (p.type === "fields" ? p.fields.map((g) => (g === f ? s : HMP.modelAnswer({ type: "fields", fields: [g] })[0])) : s);
      const pt = p.type === "fields" ? p : f;
      for (const s of f.accept || []) { const r = HMP.scorePart(pt, give(s)); assert.ok(!r.error && r.got >= (p.type === "fields" ? p.marks : f.marks || p.marks), `${w}: accepted form "${s}" earns full marks (${r.error || r.got})`); }
      for (const s of f.reject || []) { const r = HMP.scorePart(pt, give(s)); assert.ok(r.error || r.got < p.marks, `${w}: rejected answer "${s}" must not earn full marks`); }
    };
    if (p.type === "fields") p.fields.forEach((f) => each(f)); else if (TYPED.includes(p.type)) each(p);
    if (p.type === "mcq") for (let o = 0; o < p.opts.length; o++) if (o !== p.a) assert.equal(HMP.scorePart(p, o).got, 0, `${w}: wrong option scores 0`);
    if (p.type === "text") assert.ok(HMP.scorePart(p, "").got === 0 && HMP.scorePart(p, "i do not know").got < p.marks, `${w}: empty/idle answer scores nothing`);
  }
});

test("every piece of maths typesets without a KaTeX error and bare < is avoided", () => {
  const seen = [];
  const collect = (label, html) => {
    const text = String(html).replace(/<svg[\s\S]*?<\/svg>/g, "");
    const bad = (m) => { assert.doesNotMatch(m, /<[a-z]/i, `${label}: raw "<" inside maths (use \\lt): ${m.slice(0, 50)}`); seen.push([label, m]); };
    let t = text.replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => { bad(m); return ""; });
    const segs = t.split("$");
    assert.equal(segs.length % 2, 1, `${label}: unbalanced $ in "${strip(t).slice(0, 60)}"`);
    segs.forEach((s, i) => { if (i % 2) bad(s); });
  };
  for (const { q, p, i } of parts) {
    const w = `${q.id}[${i}]`;
    collect(w + " q", p.q); collect(w + " why", p.why); collect(w + " show", p.show ? `$${p.show}$` : "");
    (p.opts || []).forEach((o, k) => collect(`${w} opt${k}`, o));
    (p.fields || []).forEach((f, k) => { collect(`${w} field${k} label`, f.label || ""); collect(`${w} field${k} show`, `$${f.show}$`); });
    (p.pairs || []).forEach((pr, k) => collect(`${w} pair${k}`, pr[0]));
  }
  for (const { q } of all) collect(q.id + " stem", q.stem);
  for (const [label, m] of seen) {
    try { katex.renderToString(m, { throwOnError: true, strict: "ignore" }); } catch (e) { assert.fail(`${label}: KaTeX: ${e.message}`); }
  }
});

test("no string carries a control character (a lone backslash before f, t, b, r or v in a JS string)", () => {
  const bad = /[\t\b\f\v\r\x00-\x07\x0e-\x1f]/;
  const walk = (label, v) => {
    if (typeof v === "string") assert.doesNotMatch(v, bad, `${label}: control character in "${v.slice(0, 50).replace(/[\x00-\x1f]/g, "?")}" (write \\\\frac, \\\\times, \\\\theta ... or use String.raw)`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(`${label}[${i}]`, x));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(`${label}.${k}`, x);
  };
  for (const a of AREAS) walk(a, HMP_BANK[a]);
});
