// Static guards for "Click, Whirr".
//
// The checks that do not need a browser: the document's own file hygiene, its
// wiring into the almanac catalogue, and — the part specific to this document
// — that every number rendered on the page is one that data.js actually
// carries. A persuasion site that misquotes its own studies would be a poor
// advertisement for checking the evidence.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(HERE, "..");
const ROOT = resolve(DOC, "..");
const SLUG = "influence";

const read = (p) => readFileSync(p, "utf8");
const html = read(join(DOC, "index.html"));
const css = read(join(DOC, "style.css"));
const appSrc = read(join(DOC, "app.js"));

// data.js and the root catalog are browser scripts that assign onto `window`.
function loadScope(...files) {
  const scope = { window: {} };
  scope.window.window = scope.window;
  for (const f of files) new Function("window", read(f))(scope.window);
  return scope.window;
}
const D = loadScope(join(DOC, "data.js"));
const CATALOG = loadScope(join(ROOT, "data.js"));

test("the document loads nothing from an external origin", () => {
  const loaded = [...html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /(?:src|href)="(?:https?:)?\/\//i.test(tag));
  assert.deepEqual(loaded, [], `external subresource: ${loaded.join(", ")}`);
  assert.ok(!/type="text\/babel"/.test(html), "no in-browser Babel: this document has no build step");
});

test("the shared almanac back button is included", () => {
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/,
    "every document page carries the shared back pill");
});

test("the header is inset clear of the back pill", () => {
  // /almanac-back.js pins its pill to [0,0 109x41] at every viewport width,
  // so the top bar's left inset must be unconditional and >= 112px.
  const m = css.match(/\.topbar\s*\{[^}]*padding:[^;]*?(\d+)px;/s);
  assert.ok(m, "expected .topbar to declare padding");
  assert.ok(Number(m[1]) >= 112, `.topbar left inset is ${m[1]}px, needs >= 112px`);
});

test("no rule would clip real horizontal overflow", () => {
  // overflow-x:hidden on html/body propagates to the viewport and would hide
  // layout bugs from tests/responsive.test.mjs instead of fixing them.
  assert.ok(!/^\s*(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/ms.test(css),
    "html/body must not set overflow-x:hidden");
});

test("every route in the nav is one the router knows", () => {
  const navRoutes = [...html.matchAll(/<a href="#(\/[a-z-]*)">/g)].map((m) => m[1]);
  assert.ok(navRoutes.length >= 10, `expected a full nav, found ${navRoutes.length}`);
  for (const r of navRoutes) {
    const head = r.replace(/^\//, "");
    if (head === "") continue;
    assert.match(appSrc, new RegExp(`head === "${head}"`), `router has no branch for #${r}`);
  }
});

test("every sprite symbol referenced by the page exists", () => {
  const defined = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([
    ...[...html.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]),
    ...[...appSrc.matchAll(/<use href="#' \+ ([a-zA-Z.]+)/g)].map(() => null),
  ].filter(Boolean));
  for (const id of used) assert.ok(defined.has(id), `index.html uses #${id} but never defines it`);
  // the icons app.js names indirectly, via principle.icon and the chapter list
  for (const p of D.PRINCIPLES) {
    assert.ok(defined.has(p.icon), `principle "${p.key}" wants #${p.icon}, which is not in the sprite`);
  }
  for (const id of ["p-hero", "p-mark", "p-clickwhirr", "p-presuasion", "p-lab", "p-machine", "p-defence", "p-ledger", "p-quiz", "p-lexicon", "p-sources"]) {
    assert.ok(defined.has(id), `missing sprite symbol #${id}`);
  }
});

test("the seven principles are complete and internally consistent", () => {
  assert.equal(D.PRINCIPLES.length, 7, "there are seven principles");
  const seen = new Set();
  for (const p of D.PRINCIPLES) {
    assert.ok(!seen.has(p.key), `duplicate principle key ${p.key}`);
    seen.add(p.key);
    for (const field of ["name", "rule", "hook", "inOneLine", "icon"]) {
      assert.ok(p[field] && p[field].length > 3, `${p.key} is missing ${field}`);
    }
    assert.ok(p.mechanism.length >= 2, `${p.key} needs a real mechanism section`);
    assert.ok(p.studies.length >= 3, `${p.key} needs at least three studies`);
    assert.ok(p.cases.length >= 3, `${p.key} needs at least three case studies`);
    assert.ok(p.tactics.length >= 3, `${p.key} needs its named tactics`);
    assert.ok(p.defence.tell && p.defence.paras.length >= 2, `${p.key} needs a defence`);
    assert.ok(p.ai.body.length > 80, `${p.key} needs its AI panel`);
    for (const s of p.studies) {
      assert.ok(s.cite, `${p.key}: a study with no citation`);
      // A study that shows numbers must show both sides of the comparison.
      const hasControl = s.control && s.control.value != null;
      const hasTreatment = s.treatment && s.treatment.value != null;
      assert.equal(hasControl, hasTreatment,
        `${p.key} / "${s.name}": a one-sided comparison is not a comparison`);
      if (hasControl) assert.ok(s.unit, `${p.key} / "${s.name}": numbers with no unit`);
    }
    // Every principle carries its own accent colour in the stylesheet.
    assert.match(css, new RegExp(`\\.acc-${p.key}\\s*\\{`), `no accent colour for .acc-${p.key}`);
  }
});

test("both AI rounds cover all seven principles, with plausible numbers", () => {
  for (const round of ["2025", "2026"]) {
    const r = D.AI.perPrinciple[round];
    assert.ok(r.overall.control >= 0 && r.overall.treatment <= 100, `${round}: overall out of range`);
    assert.ok(r.overall.treatment > r.overall.control, `${round}: the headline should be a lift`);
    for (const p of D.PRINCIPLES) {
      const row = r.rows[p.key];
      assert.ok(row, `${round} is missing ${p.key}`);
      for (const k of ["control", "treatment"]) {
        assert.ok(row[k] >= 0 && row[k] <= 100, `${round}/${p.key}/${k} = ${row[k]} is not a percentage`);
      }
      // Every principle produced a statistically significant lift in both
      // published rounds; a row that does not is a transcription error.
      assert.ok(row.treatment > row.control, `${round}/${p.key}: treatment should exceed control`);
    }
  }
});

test("every tactic says what it looks like from the receiving end", () => {
  // The attack material must not be more actionable than the defence, which
  // is what happens when the tactic is written in the imperative and the
  // counter-move only in the reflective. Every tactic carries its own tell.
  for (const p of D.PRINCIPLES) {
    for (const t of p.tactics) {
      assert.ok(t.tell && t.tell.length > 40,
        `${p.key} / "${t.name}": a tactic with no tell is a how-to with no counter`);
    }
  }
});

test("the framing bench covers every principle, names no live request, and answers itself", () => {
  for (const p of D.PRINCIPLES) {
    const f = D.FRAMES[p.key];
    assert.ok(f && f.shape && f.note, `no framing skeleton for ${p.key}`);
    assert.match(f.shape, /\[request\]|\[benign version of the request\]/,
      `${p.key}: the framing must leave the request as a placeholder`);
    // Each attack shape ships with what a builder does about it, so the bench
    // reads as a threat model rather than a ranked menu.
    assert.ok(f.counter && f.counter.length > 60,
      `${p.key}: a framing with an efficacy number and no mitigation is a menu`);
  }
  // The published papers used a controlled-substance request. The skeletons
  // here must not carry it, on this page or any other.
  const all = read(join(DOC, "data.js"));
  const shapes = Object.values(D.FRAMES).map((f) => f.shape).join("\n");
  assert.ok(!/synthesi[sz]e\s+lidocaine/i.test(shapes),
    "framing skeletons must not spell out the objectionable request");
  assert.ok(all.includes("[request]"), "sanity: placeholders survive into data.js");
});

test("every lab experiment is answerable and scored against a real figure", () => {
  assert.ok(D.LAB.length >= 10, "the lab needs a decent bench");
  const ids = new Set();
  for (const x of D.LAB) {
    assert.ok(!ids.has(x.id), `duplicate lab id ${x.id}`);
    ids.add(x.id);
    assert.ok(x.cite, `${x.id} has no citation`);
    assert.ok(x.answer >= 0 && x.answer <= 100, `${x.id}: answer ${x.answer} is not a percentage`);
    assert.ok(x.baseline && x.baseline.value != null, `${x.id} needs a baseline to contrast with`);
    assert.ok(x.reveal.length > 60, `${x.id} needs a real explanation, not just a number`);
    assert.ok(x.question.includes("?"), `${x.id}: the question should be a question`);
  }
});

test("every quiz answer names one of the seven", () => {
  const keys = new Set(D.PRINCIPLES.map((p) => p.key));
  assert.ok(D.QUIZ.length >= 10, "the quiz needs enough scenarios to be worth playing");
  for (const q of D.QUIZ) {
    assert.ok(keys.has(q.answer), `quiz answer "${q.answer}" is not one of the seven`);
    assert.ok(q.why.length > 40, `"${q.scenario.slice(0, 40)}…" needs an explanation`);
  }
});

test("the glossary and ledger are wired to real keys", () => {
  const keys = new Set([...D.PRINCIPLES.map((p) => p.key), "clickwhirr", "presuasion", "ai"]);
  for (const g of D.GLOSSARY) {
    assert.ok(keys.has(g.principle), `glossary term "${g.term}" points at unknown group "${g.principle}"`);
  }
  for (const r of D.LEDGER.rows) {
    assert.ok(D.LEDGER.verdicts[r.verdict], `ledger row "${r.finding}" has unknown verdict "${r.verdict}"`);
    assert.ok(r.note.length > 40, `ledger row "${r.finding}" needs a real note`);
  }
  // The whole point of the ledger is that it is not a whitewash.
  const shaky = D.LEDGER.rows.filter((r) => r.verdict !== "solid").length;
  assert.ok(shaky >= 3, "a replication ledger with nothing contested is not a ledger");

  // And it must audit this site's own weakest material, not only the famous
  // experiments that already have DOIs. Anecdotes carried from the book are
  // exactly what a reader cannot check for themselves.
  const blob = JSON.stringify(D.LEDGER.rows);
  for (const must of ["Korean", "Girard", "Krishna", "Genovese", "ycophancy", "microtargeting"]) {
    assert.ok(blob.includes(must), `the ledger never audits the site's own claim about "${must}"`);
  }
});

test("no principle's one-liner is an unattributed quotation", () => {
  // Two of these started life as verbatim Lippmann and Chesterton, rendered in
  // the site's own voice in its largest pull-quote slot. On a document whose
  // proposition is fastidious sourcing, that was the one indefensible thing in
  // it. This test is a tripwire, not a plagiarism detector.
  const known = [
    "where all think alike",
    "the way to love anything",
    "no one thinks very much",
  ];
  for (const p of D.PRINCIPLES) {
    const line = p.inOneLine.toLowerCase();
    for (const q of known) {
      assert.ok(!line.includes(q), `${p.key}: inOneLine reproduces a known quotation without attribution`);
    }
  }
});

test("sources are complete and every link is https", () => {
  const items = D.SOURCES.flatMap((g) => g.items);
  assert.ok(items.length >= 25, `expected a full bibliography, found ${items.length}`);
  for (const s of items) {
    assert.ok(s.t && s.d, `source "${s.t}" is missing a description`);
    if (s.u) assert.match(s.u, /^https:\/\//, `source link is not https: ${s.u}`);
  }
  // The claims that carry the most weight must be traceable.
  const blob = JSON.stringify(D.SOURCES);
  for (const must of ["Freedman", "Milgram", "Bickman", "Goldstein", "Meincke", "Cialdini", "Salvi", "Costello", "Bohner"]) {
    assert.ok(blob.includes(must), `no source entry mentions ${must}`);
  }
});

test("the almanac catalogue points at this document", () => {
  const entry = CATALOG.ESSAYS.find((e) => e.slug === SLUG);
  assert.ok(entry, "no ESSAYS entry for this document — it would be invisible on the catalog");
  assert.equal(entry.url, `https://0x4d44.github.io/${SLUG}/`);
  assert.ok(entry.illustration, "the entry needs an illustration id");
  const rootHtml = read(join(ROOT, "index.html"));
  assert.ok(rootHtml.includes(`<symbol id="${entry.illustration}"`),
    `the catalog sprite has no #${entry.illustration}`);

  const tagVocab = new Set(CATALOG.TAG_GROUPS.flatMap((g) => g.tags));
  for (const t of entry.tags || [entry.tag]) {
    assert.ok(tagVocab.has(t), `tag "${t}" is not in TAG_GROUPS, so it gets no filter chip`);
  }
  const shelved = CATALOG.COLLECTIONS.some((c) => c.slugs.includes(SLUG));
  assert.ok(shelved, "the document is not on any shelf, so it lands in Unshelved");
});
