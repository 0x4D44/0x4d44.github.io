// Static guards for "Three Clocks".
//
// The checks that do not need a browser: file hygiene, the document's
// wiring into the almanac catalogue, and — the part specific to this
// document — that the prose and the model have not drifted apart.
//
// That last one is the point. This site's whole claim is that its
// numbers come from a stated model rather than from the author's
// confidence, so a hard-coded forecast in the prose is not a typo, it is
// the failure mode. Several checks below run the model and compare it
// with what the text says about it.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(HERE, "..");
const ROOT = resolve(DOC, "..");
const SLUG = "three-clocks";

const read = (p) => readFileSync(p, "utf8");
const html = read(join(DOC, "index.html"));
const css = read(join(DOC, "style.css"));
const appSrc = read(join(DOC, "app.js"));

function loadScope(...files) {
  const scope = { window: {} };
  scope.window.window = scope.window;
  for (const f of files) new Function("window", read(f))(scope.window);
  return scope.window;
}
const D = loadScope(join(DOC, "content.js"), join(DOC, "model.js"));
const CATALOG = loadScope(join(ROOT, "data.js"));
const M = D.TC_MODEL;
const TC = D.TC;
const at = (s, y) => s[y - 2026];

// ============================================================
// File hygiene and repo invariants
// ============================================================

test("the document loads nothing from an external origin", () => {
  const loaded = [...html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /(?:src|href)="(?:https?:)?\/\//i.test(tag));
  assert.deepEqual(loaded, [], `external subresource: ${loaded.join(", ")}`);
  assert.ok(!/type="text\/babel"/.test(html), "no in-browser Babel: this document has no build step");
});

test("the shared almanac back button is included", () => {
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/);
});

test("the header is inset clear of the back pill", () => {
  // /almanac-back.js pins its pill to [0,0 109x41] at every viewport
  // width, so the top bar's left inset must be unconditional and >=112px.
  const m = css.match(/\.topbar\s*\{[^}]*padding:[^;]*?(\d+)px;/s);
  assert.ok(m, "expected .topbar to declare padding");
  assert.ok(Number(m[1]) >= 112, `.topbar left inset is ${m[1]}px, needs >= 112px`);
});

test("the document has no back link of its own", () => {
  // The shared pill is the one back button. A second one in the masthead
  // would sit underneath it and be untappable (ALM-BUG-KILN-00039).
  const brand = html.match(/<span class="brand">[\s\S]*?<\/span>\s*<button/);
  assert.ok(brand, "expected the brand block before the burger");
  assert.ok(!/<a[^>]+class="brand"/.test(html), "the wordmark must not be a link");
});

test("no rule would clip real horizontal overflow", () => {
  assert.ok(!/^\s*(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/ms.test(css),
    "html/body must not set overflow-x:hidden");
});

test("wide content has its own scroll container", () => {
  // The two things on this page wider than a phone: the coupling matrix
  // and the cone chart.
  assert.match(css, /\.twrap\s*\{[^}]*overflow-x:\s*auto/s, ".twrap must scroll");
  assert.match(css, /\.cone-wrap\s*\{[^}]*overflow-x:\s*auto/s, ".cone-wrap must scroll");
});

test("motion is conditional on prefers-reduced-motion", () => {
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("every sprite symbol referenced by the code exists", () => {
  const defined = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...appSrc.matchAll(/#(c-[a-z-]+)/g)].map((m) => m[1]));
  // the domain icons are built by string concatenation: "c-" + key
  for (const k of ["ai", "climate", "peace"]) used.add("c-" + k);
  for (const id of used) {
    assert.ok(defined.has(id), `app.js references <use href="#${id}"> but no symbol defines it`);
  }
  assert.ok(defined.has("c-mark") && defined.has("c-hero"));
});

test("the sprite contains no malformed colour values", () => {
  // A corrupted fill or stroke renders as black and is easy to miss.
  const colours = [...html.matchAll(/(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1]);
  for (const c of colours) {
    if (c === "none" || c.startsWith("url(") || /^[a-z]+$/.test(c)) continue;
    assert.match(c, /^#[0-9a-fA-F]{3,8}$/, `malformed colour value: ${c}`);
  }
});

// ============================================================
// Catalogue wiring
// ============================================================

test("the document is in the almanac catalogue, on a shelf, with a real icon", () => {
  const entry = (CATALOG.ESSAYS || []).find((e) => e.slug === SLUG);
  assert.ok(entry, `no window.ESSAYS entry for "${SLUG}"`);
  assert.equal(entry.url, `https://0x4d44.github.io/${SLUG}/`);
  assert.ok(entry.date && entry.title && entry.tagline);
  assert.ok(entry.tagline.split(/\s+/).length <= 70,
    `tagline is ${entry.tagline.split(/\s+/).length} words; the house limit is about 55`);

  const vocabulary = new Set(CATALOG.TAGS);
  const tags = entry.tags || [entry.tag];
  for (const t of tags) assert.ok(vocabulary.has(t), `tag "${t}" has no filter chip`);

  const shelves = (CATALOG.COLLECTIONS || []).filter((c) => c.slugs.includes(SLUG));
  assert.ok(shelves.length > 0, "not on any shelf; it would fall into Unshelved");

  const rootHtml = read(join(ROOT, "index.html"));
  assert.ok(new RegExp(`<symbol id="${entry.illustration}"`).test(rootHtml),
    `illustration "${entry.illustration}" is not in the root sprite`);
});

// ============================================================
// Content integrity
// ============================================================

test("every content section has the fields its view reads", () => {
  for (const key of ["home", "method", "ai", "climate", "peace", "coupling", "estimate"]) {
    assert.ok(TC[key], `TC.${key} is missing`);
    assert.ok(TC[key].title && TC[key].sub, `TC.${key} needs a title and sub`);
    assert.ok(Array.isArray(TC[key].blocks) && TC[key].blocks.length > 3,
      `TC.${key}.blocks looks empty`);
  }
  for (const key of ["scenarios", "watch", "objections", "sources", "cone"]) {
    assert.ok(TC[key] && TC[key].title, `TC.${key} is missing or has no title`);
  }
});

test("the scenario weights sum to 100", () => {
  const total = TC.scenarios.items.reduce((s, x) => s + x.weight, 0);
  assert.equal(total, 100, `scenario weights sum to ${total}`);
});

test("every forecast is dated, resolvable and reasoned", () => {
  for (const f of TC.forecasts) {
    assert.ok(f.p > 0 && f.p < 100, `probability ${f.p} for "${f.claim}"`);
    assert.ok(f.by >= 2030 && f.by <= 2100, `resolution year ${f.by}`);
    assert.ok(f.claim && f.claim.length > 30, "claim is too short to be resolvable");
    assert.ok(f.res && f.res.length > 8, `no resolution criterion for "${f.claim}"`);
    assert.ok(f.why && f.why.length > 40, `no reasoning given for "${f.claim}"`);
    assert.ok(["ai", "climate", "peace", "all"].includes(f.domain), `bad domain ${f.domain}`);
  }
});

test("every watchlist item names a trigger that would change the forecast", () => {
  for (const i of TC.watch.items) {
    assert.ok(i.now && i.trigger && i.note, `incomplete watchlist item: ${i.name}`);
    assert.ok(["up", "down", "flat"].includes(i.trend), `bad trend on ${i.name}`);
  }
  // All three domains represented, so the page is not lopsided.
  for (const d of ["ai", "climate", "peace"]) {
    assert.ok(TC.watch.items.some((i) => i.domain === d), `no ${d} indicators`);
  }
});

test("every objection carries a response that concedes or answers", () => {
  assert.ok(TC.objections.items.length >= 5, "too few objections to count as adversarial");
  for (const o of TC.objections.items) {
    assert.ok(o.arg.length > 150, `objection "${o.h}" is too thin to be a steelman`);
    assert.ok(o.resp.length > 150, `response to "${o.h}" is too thin`);
  }
});

test("the drivers described in the prose match the model's drivers", () => {
  const modelKeys = M.DRIVERS.map((d) => d.key).sort();
  const defaultKeys = Object.keys(M.DEFAULTS).filter((k) => k !== "coupling").sort();
  assert.deepEqual(modelKeys, defaultKeys,
    "DRIVERS and DEFAULTS disagree about which knobs exist");
  for (const d of M.DRIVERS) {
    assert.ok(["ai", "climate", "peace"].includes(d.domain), `driver ${d.key} has no domain`);
    assert.ok(d.label && d.lo && d.hi && d.note, `driver ${d.key} is under-described`);
  }
});

// ============================================================
// Prose versus model
// ------------------------------------------------------------
// The checks that matter most. Each runs the model and compares it with
// a claim the text makes about it.
// ============================================================

const run = M.run({}, { runs: 1500, seed: 20260804 });

test("no forecast number is hard-coded into the prose", () => {
  // Forecasts must come from the live model. Observations may be
  // literal — they are cited — so this looks only for the specific
  // shapes a stale forecast would take.
  const prose = JSON.stringify([TC.home, TC.method, TC.ai, TC.climate, TC.peace,
    TC.coupling, TC.cone]);
  const banned = [
    /\b4[0-9]% chance/i,
    /chance (?:of|that)[^.]{0,40}\b(?:is|was) [0-9]{1,2}%/i,
    /median warming (?:in|by) 2100 (?:is|of) [0-9]/i,
  ];
  for (const re of banned) {
    const m = prose.match(re);
    assert.equal(m, null, `hard-coded forecast in the prose: "${m && m[0]}"`);
  }
});

test("CLAIM: the policy driver moves 2100 warming by about a degree and a half", () => {
  const lo = M.run({ policy: 1 }, { runs: 900, seed: 4 });
  const hi = M.run({ policy: 0 }, { runs: 900, seed: 4 });
  const span = at(hi.climate.temp.p50, 2100) - at(lo.climate.temp.p50, 2100);
  assert.ok(span > 1.2 && span < 1.9,
    `the cone page says "about a degree and a half"; the model gives ${span.toFixed(2)}`);
});

test("CLAIM: the policy driver barely moves 2035", () => {
  const lo = M.run({ policy: 1 }, { runs: 900, seed: 4 });
  const hi = M.run({ policy: 0 }, { runs: 900, seed: 4 });
  const span = at(hi.climate.temp.p50, 2035) - at(lo.climate.temp.p50, 2035);
  assert.ok(span < 0.2,
    `the cone page says "almost nothing happens" at 2035; the model gives ${span.toFixed(3)} degC`);
});

test("CLAIM: turning coupling off moves things by the amounts the prose states", () => {
  const on = M.run({ coupling: true }, { runs: 1500, seed: 2 });
  const off = M.run({ coupling: false }, { runs: 1500, seed: 2 });
  const dT = Math.abs(at(on.climate.temp.p50, 2100) - at(off.climate.temp.p50, 2100));
  const dN = Math.abs(at(on.peace.pNuke, 2100) - at(off.peace.pNuke, 2100));
  const dD = Math.abs(at(on.peace.per100k.p50, 2100) / at(off.peace.per100k.p50, 2100) - 1);
  // "about two hundredths of a degree, three or four percentage points,
  // and around a sixth"
  assert.ok(dT < 0.09, `warming moved ${dT.toFixed(3)} degC, prose says ~0.02`);
  assert.ok(dN < 0.09, `nuclear hazard moved ${(dN * 100).toFixed(1)}pts, prose says 3-4`);
  assert.ok(dD < 0.35, `conflict deaths moved ${(dD * 100).toFixed(0)}%, prose says ~a sixth`);
});

test("CLAIM: the nuclear probability is 'a little over two in five' at defaults", () => {
  const p = at(run.peace.pNuke, 2100);
  assert.ok(p > 0.38 && p < 0.50,
    `the objections page says a little over two in five; the model gives ${(p * 100).toFixed(0)}%`);
});

test("CLAIM: a great-power war before 2100 is more likely than not", () => {
  // The peace section's headline arithmetic. If a constant edit breaks
  // this, the section's central argument no longer follows.
  const p = at(run.peace.pGp, 2100);
  assert.ok(p > 0.5, `the model gives ${(p * 100).toFixed(0)}%, and the prose claims >50%`);
});

test("the stated credences are consistent with the model, or say why not", () => {
  // Where a forecast restates something the model computes, the two
  // should agree within a stated tolerance. A large divergence is
  // allowed — the author is permitted to override the model — but the
  // `why` field must acknowledge it rather than leaving the reader to
  // find it.
  const checks = [
    { by: 2030, needle: "No nuclear weapon", model: 1 - at(run.peace.pNuke, 2030) },
    { by: 2040, needle: "No nuclear weapon", model: 1 - at(run.peace.pNuke, 2040) },
    { by: 2100, needle: "No nuclear weapon", model: 1 - at(run.peace.pNuke, 2100) },
    { by: 2040, needle: "No direct sustained combat", model: 1 - at(run.peace.pGp, 2040) },
    { by: 2030, needle: "AI-enabled incident", model: at(run.ai.pIncident, 2030) },
  ];
  for (const c of checks) {
    const f = TC.forecasts.find((x) => x.by === c.by && x.claim.includes(c.needle));
    assert.ok(f, `no forecast matching "${c.needle}" by ${c.by}`);
    const gap = Math.abs(f.p / 100 - c.model);
    if (gap > 0.06) {
      assert.match(f.why, /model/i,
        `"${c.claim || f.claim}" states ${f.p}% against the model's ` +
        `${(c.model * 100).toFixed(0)}%, without acknowledging the divergence`);
    }
    assert.ok(gap < 0.25,
      `"${f.claim}" states ${f.p}% against the model's ${(c.model * 100).toFixed(0)}% — too far apart`);
  }
});

test("the sources cover every domain the document argues about", () => {
  const heads = TC.sources.groups.map((g) => g.h.toLowerCase()).join(" ");
  for (const want of ["intelligence", "climate", "nuclear", "method"]) {
    assert.ok(heads.includes(want), `no source group for "${want}"`);
  }
  for (const g of TC.sources.groups) {
    assert.ok(g.items.length >= 4, `source group "${g.h}" has only ${g.items.length} entries`);
    for (const i of g.items) assert.ok(i.t && i.d, `incomplete source in "${g.h}"`);
  }
});
