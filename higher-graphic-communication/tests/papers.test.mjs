// Contract and marker tests for the past-paper banks (papers-*.js) and the auto-marker (papers-engine.js).
// Run with: node --test higher-graphic-communication/tests/papers.test.mjs   (HGP_AREAS=dtp,cad limits it to some banks)
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import vm from "node:vm";

const PROJECT = resolve(import.meta.dirname, "..");
const AREAS = process.env.HGP_AREAS ? process.env.HGP_AREAS.split(",") : ["dtp", "cad", "interp", "std", "tech"];
const MIN_MARKS = { dtp: 50, cad: 50, interp: 40, std: 30, tech: 25 };

const sandbox = { window: {}, console };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const f of ["papers-engine.js", ...AREAS.map((a) => `papers-${a}.js`)])
  vm.runInContext(await readFile(resolve(PROJECT, f), "utf8"), sandbox, { filename: f });
const { HGP, HGP_BANK } = sandbox.window;
const strip = (h) => String(h).replace(/<[^>]*>/g, " ").replace(/&[a-z]+;/g, " ");

const all = AREAS.flatMap((a) => HGP_BANK[a].questions.map((q) => ({ area: a, q })));
const parts = all.flatMap(({ area, q }) => q.parts.map((p, i) => ({ area, q, p, i })));

test("every area has a bank of the expected depth", () => {
  for (const a of AREAS) {
    const b = HGP_BANK[a];
    assert.ok(b && b.intro && b.questions.length >= 6, `${a}: intro and at least six questions`);
    const marks = b.questions.reduce((s, q) => s + HGP.partsMarks(q), 0);
    assert.ok(marks >= MIN_MARKS[a], `${a}: ${marks} marks, wanted at least ${MIN_MARKS[a]}`);
  }
});

test("questions are well-formed and ids are unique", () => {
  const ids = new Set();
  for (const { area, q } of all) {
    assert.match(q.id, new RegExp(`^${area}-\\d\\d$`), `${q.id}: id format`);
    assert.ok(!ids.has(q.id), `${q.id}: duplicate id`);
    ids.add(q.id);
    assert.ok(q.stem && strip(q.stem).trim().length > 20, `${q.id}: stem`);
    assert.ok(q.style && q.style.length > 10, `${q.id}: style tag`);
    assert.ok(q.parts.length >= 1 && q.parts.length <= 6, `${q.id}: one to six parts`);
    const m = HGP.partsMarks(q);
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
    assert.ok(p.q && strip(p.q).trim().length > 8, `${w}: question text`);
    assert.ok(Number.isInteger(p.marks) && p.marks >= 1 && p.marks <= 6, `${w}: marks`);
    if (q.parts.length > 1) assert.ok(p.label, `${w}: parts are labelled (a), (b)...`);
    switch (p.type) {
      case "mcq":
        assert.equal(p.marks, 1, `${w}: mcq is one mark`);
        assert.ok(p.opts.length >= 4 && new Set(p.opts).size === p.opts.length, `${w}: four distinct options`);
        assert.ok(Number.isInteger(p.a) && p.a >= 0 && p.a < p.opts.length, `${w}: answer index`);
        assert.ok(p.why, `${w}: why`);
        break;
      case "multi":
        assert.ok(p.opts.length >= 5 && new Set(p.opts).size === p.opts.length, `${w}: five distinct options`);
        assert.ok(Array.isArray(p.a) && p.a.length >= 2 && p.a.length < p.opts.length && new Set(p.a).size === p.a.length, `${w}: answers`);
        assert.ok(p.a.every((x) => x >= 0 && x < p.opts.length), `${w}: answer indexes`);
        assert.equal(p.marks, p.a.length, `${w}: a mark per correct option`);
        assert.ok(p.why, `${w}: why`);
        break;
      case "num":
        assert.equal(typeof p.a, "number", `${w}: numeric answer`);
        assert.ok(p.tol >= 0, `${w}: tolerance`);
        assert.ok(p.why, `${w}: why`);
        break;
      case "match":
        assert.ok(p.pairs.length >= 3 && p.pairs.length <= 6, `${w}: three to six pairs`);
        assert.equal(new Set(p.pairs.map((x) => x[1])).size, p.pairs.length, `${w}: distinct definitions`);
        assert.equal(p.marks, p.pairs.length, `${w}: a mark per pair`);
        break;
      case "text": {
        assert.ok(p.model && p.sample, `${w}: model answer and sample`);
        assert.ok(p.points.length >= p.marks, `${w}: at least as many points as marks`);
        const sum = p.points.reduce((s, x) => s + (x.marks == null ? 1 : x.marks), 0);
        assert.ok(sum >= p.marks, `${w}: points can reach the marks`);
        for (const pt of p.points) {
          assert.ok(pt.desc && (pt.any || pt.all), `${w}: point has a description and patterns`);
          for (const r of [...(pt.any || []), ...(pt.all || [])]) assert.doesNotThrow(() => new RegExp(r, "i"), `${w}: pattern ${r}`);
        }
        break;
      }
      default: assert.fail(`${w}: unknown type ${p.type}`);
    }
  }
});

test("the model answer earns full marks, and nothing earns nothing", () => {
  for (const { q, p, i } of parts) {
    const w = `${q.id}[${i}]`;
    const full = HGP.scorePart(p, HGP.modelAnswer(p));
    assert.equal(full.got, p.marks, `${w}: model answer scores ${full.got}/${p.marks}` + (full.points ? " missed: " + full.points.filter((x) => !x.hit).map((x) => x.desc).join(" | ") : ""));
    const none = { mcq: -1, multi: [], num: "", match: p.pairs ? p.pairs.map(() => -1) : null, text: "" }[p.type];
    assert.equal(HGP.scorePart(p, none).got, 0, `${w}: empty answer scores 0`);
  }
});

test("a wrong choice never scores, and a number off by a lot never scores", () => {
  for (const { q, p, i } of parts) {
    const w = `${q.id}[${i}]`;
    if (p.type === "mcq") for (let k = 0; k < p.opts.length; k++) assert.equal(HGP.scorePart(p, k).got, k === p.a ? 1 : 0, `${w}: option ${k}`);
    if (p.type === "num") {
      assert.equal(HGP.scorePart(p, String(p.a + p.tol + Math.max(1, Math.abs(p.a) * 0.2))).got, 0, `${w}: far-off number`);
      assert.equal(HGP.scorePart(p, "banana").got, 0, `${w}: not a number`);
    }
    if (p.type === "multi") {
      const wrong = p.opts.map((_, k) => k).filter((k) => !p.a.includes(k));
      assert.equal(HGP.scorePart(p, wrong).got, 0, `${w}: all wrong`);
      assert.equal(HGP.scorePart(p, p.opts.map((_, k) => k)).got, 0, `${w}: pick everything scores nothing`);
    }
  }
});

test("the marker cannot be fooled by parroting the question, filler, or a pasted wall of words", () => {
  for (const { q, p, i } of parts.filter((x) => x.p.type === "text")) {
    const w = `${q.id}[${i}]`;
    const parrot = strip(q.stem) + " " + strip(p.q);
    assert.ok(HGP.scorePart(p, parrot).got < p.marks, `${w}: the question text alone earns full marks`);
    assert.equal(HGP.scorePart(p, "I do not know the answer to this one at all really").got, 0, `${w}: filler scores 0`);
    // every other model answer in the same bank, pasted in, must not earn full marks here unless it is the same part
    const others = HGP_BANK[q.id.split("-")[0]].questions.flatMap((o) => o.parts).filter((o) => o.type === "text" && o !== p);
    const dump = others.map((o) => o.sample).join(" ");
    const got = HGP.scorePart(p, dump).got;
    assert.ok(got < p.marks || p.marks === 1, `${w}: other parts' answers pasted together earn full ${p.marks} marks (${got})`);
  }
});

test("no marking point is satisfied by the question text itself", () => {
  for (const { q, p, i } of parts.filter((x) => x.p.type === "text")) {
    const text = HGP.norm(strip(q.stem) + " " + strip(p.q));
    for (const pt of p.points) assert.ok(!HGP.pointHit(pt, text), `${q.id}[${i}]: point "${pt.desc}" is already matched by the question text`);
  }
});

test("the engine's own rules", () => {
  const part = { type: "text", marks: 2, points: [{ desc: "a", any: ["cat"] }, { desc: "b", any: ["dog"] }, { desc: "c", any: ["cow"], group: "g" }, { desc: "d", any: ["cow"], group: "g" }] };
  assert.equal(HGP.scorePart(part, "the cat is here and the dog is there too").got, 2);
  assert.equal(HGP.scorePart(part, "the cat saw a cow and the cow ran").got, 2, "grouped alternatives count once");
  assert.equal(HGP.scorePart(part, "cat").got, 0, "below the word minimum nothing is awarded");
  assert.equal(HGP.scorePart({ type: "num", marks: 1, a: 25, tol: 0.5 }, "25.4 mm").got, 1);
  assert.equal(HGP.scorePart({ type: "num", marks: 1, a: 25, tol: 0.5 }, "26").got, 0);
  assert.equal(HGP.scorePart({ type: "multi", marks: 2, a: [0, 1], opts: [1, 2, 3, 4, 5] }, [0, 2]).got, 0, "a wrong pick cancels a right one");
  assert.equal(HGP.norm("Ø40 × 2"), "diameter 40 x 2");
});

// Word-salad attack: shuffle the words of the model answer (all words, then content words only).
// A student who knows the key words but cannot write the answer must not collect the marks.
test("a shuffled model answer does not earn most of the marks", () => {
  let seed = 777;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const shuf = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sw = new Set("the a an and of to in is it so that this on for be are as at with by or can they their there from which was not do does if then than when".split(" "));
  const LIMIT = { content: 0.3, all: 0.45 };
  for (const mode of ["content", "all"]) {
    let got = 0, of = 0;
    const fulls = [];
    for (const { q, p, i } of parts) {
      if (p.type !== "text" || p.marks < 2) continue;
      let w = HGP.norm(p.sample).split(" ");
      if (mode === "content") w = w.filter((x) => !sw.has(x));
      let s = 0;
      for (let t = 0; t < 8; t++) s += HGP.scorePart(p, shuf(w).join(" ")).got;
      s /= 8; got += s; of += p.marks;
      if (s >= p.marks - 0.01) fulls.push(`${q.id}[${i}]`);
    }
    assert.ok(got / of <= LIMIT[mode], `${mode}-word shuffle earns ${(100 * got / of).toFixed(1)}% (limit ${100 * LIMIT[mode]}%); full marks on ${fulls.join(", ")}`);
  }
});
