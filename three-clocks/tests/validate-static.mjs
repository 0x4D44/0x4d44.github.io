// Static guards for "Three Clocks".
//
// The checks that do not need a browser: file hygiene, the wiring into
// the almanac catalogue, and — the part specific to this document — that
// the PROSE AND THE MODEL AGREE.
//
// That last one is the reason this file exists. The site's whole claim
// on the reader's attention is that its numbers come from a model rather
// than from the author's confidence, so a sentence in content.js that
// states a figure the model does not produce is not a typo; it is the
// document failing at the one thing it says it does. Several such
// mismatches were found this way, including a stale nuclear probability
// and a forecast band containing far less of the model's mass than the
// stated confidence implied.

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

// content.js, model.js and the root catalog are browser scripts that
// assign onto `window`.
function loadScope(...files) {
  const scope = { window: {} };
  scope.window.window = scope.window;
  for (const f of files) new Function("window", read(f))(scope.window);
  return scope.window;
}
const W = loadScope(join(DOC, "content.js"), join(DOC, "model.js"));
const TC = W.TC;
const M = W.TC_MODEL;
const CATALOG = loadScope(join(ROOT, "data.js"));

const run = M.run({}, { runs: 4000 });
const at = (series, year) => series[year - 2026];

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
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/,
    "every document page carries the shared back pill");
});

test("the header is inset clear of the back pill", () => {
  // /almanac-back.js pins its pill to [0,0 109x41] at every viewport
  // width, so the top bar's left inset must be unconditional and >= 112px.
  const m = css.match(/\.topbar\s*\{[^}]*padding:[^;]*?(\d+)px;/s);
  assert.ok(m, "expected .topbar to declare padding");
  assert.ok(Number(m[1]) >= 112, `.topbar left inset is ${m[1]}px, needs >= 112px`);
});

test("no rule would clip real horizontal overflow", () => {
  assert.ok(!/^\s*(?:html|body)[^{]*\{[^}]*overflow-x:\s*hidden/ms.test(css),
    "html/body must not set overflow-x:hidden — it hides layout bugs instead of fixing them");
});

test("wide content has its own scroll container", () => {
  // The matrix table and the cone are both wider than a phone.
  assert.match(css, /\.twrap\s*\{[^}]*overflow-x:\s*auto/s, ".twrap must scroll its table");
  assert.match(css, /\.cone-wrap\s*\{[^}]*overflow-x:\s*auto/s, ".cone-wrap must scroll its chart");
});

test("every sprite symbol referenced by the app exists in the page", () => {
  const defined = new Set([...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const used = new Set([...appSrc.matchAll(/#(c-[a-z-]+)/g)].map((m) => m[1]));
  // The icon() helper builds ids as "c-" + a domain or chapter key.
  for (const k of ["ai", "climate", "peace"]) used.add("c-" + k);
  const missing = [...used].filter((id) => !defined.has(id));
  assert.deepEqual(missing, [], `app.js references undefined sprite symbols: ${missing.join(", ")}`);
});

test("the sprite carries no malformed colour values", () => {
  const bad = [...html.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]*[^"0-9a-fA-F#][^"]*)"/g)]
    .map((m) => m[1])
    .filter((v) => !/^(none|currentColor)$/.test(v));
  assert.deepEqual(bad, [], `malformed colour in the sprite: ${bad.join(", ")}`);
});

// ============================================================
// Catalogue wiring
// ============================================================

test("the document is in the almanac catalogue, on a shelf, with a real icon", () => {
  const entry = (CATALOG.ESSAYS || []).find((e) => e.slug === SLUG);
  assert.ok(entry, `no ESSAYS entry for "${SLUG}"`);
  assert.equal(entry.url, `https://0x4d44.github.io/${SLUG}/`);
  assert.ok(entry.tagline.length < 420, "tagline is too long for the listing");

  const tags = entry.tags || (entry.tag ? [entry.tag] : []);
  const vocabulary = new Set((CATALOG.TAG_GROUPS || []).flatMap((g) => g.tags));
  for (const t of tags) {
    assert.ok(vocabulary.has(t), `tag "${t}" is not in TAG_GROUPS, so it gets no filter chip`);
  }

  const shelved = (CATALOG.COLLECTIONS || []).some((c) => c.slugs.includes(SLUG));
  assert.ok(shelved, `"${SLUG}" is not on any shelf and would fall into Unshelved`);

  const root = read(join(ROOT, "index.html"));
  assert.ok(root.includes(`<symbol id="${entry.illustration}"`),
    `illustration "${entry.illustration}" is not in the root sprite`);
});

// ============================================================
// Content integrity
// ============================================================

test("every content section the router asks for exists", () => {
  for (const key of ["home", "method", "ai", "climate", "peace", "coupling",
                     "cone", "scenarios", "estimate", "watch", "objections", "sources"]) {
    assert.ok(TC[key], `content.js is missing TC.${key}`);
  }
  assert.ok(Array.isArray(TC.forecasts) && TC.forecasts.length >= 12);
  assert.ok(TC.axes && TC.axes.rows.length === 3);
});

test("the nav links and the router's routes are the same set", () => {
  const navHrefs = [...html.matchAll(/<a href="#(\/[a-z-]*)">/g)].map((m) => m[1]);
  const routes = [...appSrc.matchAll(/^\s*"(\/[a-z-]*)":/gm)].map((m) => m[1]);
  for (const h of navHrefs) {
    assert.ok(routes.includes(h), `nav links to ${h}, which the router does not handle`);
  }
});

test("every scenario is well formed and the weights sum to 100", () => {
  const total = TC.scenarios.items.reduce((s, i) => s + i.weight, 0);
  assert.equal(total, 100, `scenario weights sum to ${total}`);
  for (const s of TC.scenarios.items) {
    for (const f of ["key", "name", "tag", "summary", "body", "needs", "tell", "tone"]) {
      assert.ok(s[f], `scenario "${s.name}" is missing ${f}`);
    }
  }
});

test("every forecast is dated, resolvable and reasoned", () => {
  for (const f of TC.forecasts) {
    assert.ok(f.p > 0 && f.p < 100, `forecast "${f.claim}" has probability ${f.p}`);
    assert.ok([2030, 2040, 2050, 2100].includes(f.by), `odd resolution year ${f.by}`);
    assert.ok(f.res && f.res.length > 10, `forecast "${f.claim}" has no resolution criterion`);
    assert.ok(f.why && f.why.length > 40, `forecast "${f.claim}" has no reasoning`);
    assert.ok(["ai", "climate", "peace", "all"].includes(f.domain));
  }
});

test("every watchlist item names a reading and a trigger", () => {
  for (const i of TC.watch.items) {
    assert.ok(["ai", "climate", "peace"].includes(i.domain));
    assert.ok(["up", "down", "flat"].includes(i.trend));
    assert.ok(i.now && i.trigger && i.note, `watchlist item "${i.name}" is incomplete`);
  }
});

test("every objection carries a response", () => {
  assert.ok(TC.objections.items.length >= 5, "too few objections to count as steelmanning");
  for (const o of TC.objections.items) {
    assert.ok(o.arg.length > 150, `objection "${o.h}" is too thin to be a steelman`);
    assert.ok(o.resp.length > 150, `objection "${o.h}" has no substantive response`);
  }
});

// ============================================================
// Prose versus model
// ------------------------------------------------------------
// The checks this file exists for.
// ============================================================

test("PROSE: the headline warming range matches the model", () => {
  // TC.home: "Warming lands between about 1.9 and 3.3 degrees by 2100,
  // with a central estimate near 2.5."
  const lo = at(run.climate.temp.p05, 2100);
  const mid = at(run.climate.temp.p50, 2100);
  const hi = at(run.climate.temp.p95, 2100);
  const claim = TC.home.blocks.find((b) => b.list)
    .list.find((s) => s.includes("Warming lands between"));
  assert.ok(claim, "the headline warming claim has moved or been reworded");
  assert.match(claim, /1\.9 and 3\.3/, "the stated range is not the one asserted below");
  assert.ok(Math.abs(lo - 1.9) < 0.2, `model p05 is ${lo.toFixed(2)}, prose says about 1.9`);
  assert.ok(Math.abs(hi - 3.3) < 0.25, `model p95 is ${hi.toFixed(2)}, prose says about 3.3`);
  assert.ok(Math.abs(mid - 2.5) < 0.2, `model median is ${mid.toFixed(2)}, prose says near 2.5`);
});

test("PROSE: the policy driver really does span about 1.5 degrees by 2100", () => {
  // TC.cone.reading: "Move the decarbonisation driver from one end to the
  // other and the 2100 temperature moves by about a degree and a half."
  const lo = M.run({ policy: 1 }, { runs: 1200, seed: 777 });
  const hi = M.run({ policy: 0 }, { runs: 1200, seed: 777 });
  const span = at(hi.climate.temp.p50, 2100) - at(lo.climate.temp.p50, 2100);
  assert.ok(span > 1.2 && span < 1.8, `the policy driver spans ${span.toFixed(2)} degC at 2100`);
});

test("PROSE: and almost nothing by 2035", () => {
  // The same reading note: "Move it and watch 2035: almost nothing happens."
  const lo = M.run({ policy: 1 }, { runs: 1200, seed: 777 });
  const hi = M.run({ policy: 0 }, { runs: 1200, seed: 777 });
  const span = at(hi.climate.temp.p50, 2035) - at(lo.climate.temp.p50, 2035);
  assert.ok(span < 0.2, `the policy driver already spans ${span.toFixed(2)} degC by 2035`);
});

test("PROSE: the coupling note describes what the switch actually does", () => {
  // TC.cone.reading claims: warming moves ~0.03 degC, the nuclear hazard
  // ~4 points, and the median conflict rate ~a fifth.
  const seed = 4242, runs = 4000;
  const on = M.run({ coupling: true }, { runs, seed });
  const off = M.run({ coupling: false }, { runs, seed });

  const dT = Math.abs(at(on.climate.temp.p50, 2100) - at(off.climate.temp.p50, 2100));
  assert.ok(dT < 0.09, `coupling moves 2100 warming by ${dT.toFixed(3)} degC; prose says hundredths`);

  const dN = (at(on.peace.pNuke, 2100) - at(off.peace.pNuke, 2100)) * 100;
  assert.ok(dN > 0.5 && dN < 8, `coupling moves the nuclear hazard by ${dN.toFixed(1)} points`);

  const rel = at(on.peace.per100k.p50, 2100) / at(off.peace.per100k.p50, 2100) - 1;
  assert.ok(rel > 0.06 && rel < 0.45,
    `coupling moves the median conflict rate by ${(rel * 100).toFixed(0)}%; prose says about a fifth`);
});

test("PROSE: the 2040 automation band holds roughly the stated confidence", () => {
  // The forecast claims 3%-40% at 60%. Check the model's quartiles sit
  // inside it, which is the weaker claim the prose actually makes.
  const f = TC.forecasts.find((x) => x.claim.includes("employment-weighted work hours"));
  assert.ok(f, "the 2040 automation forecast has been renamed");
  const lo = at(run.ai.auto.p25, 2040), hi = at(run.ai.auto.p75, 2040);
  const med = at(run.ai.auto.p50, 2040);
  assert.match(f.claim, /3% and 40%/, "the stated band has changed without this test being updated");
  assert.ok(lo >= 2 && hi <= 42,
    `model quartiles at 2040 are ${lo.toFixed(1)}%-${hi.toFixed(1)}%, outside the stated band`);
  assert.match(f.why, /about 15%/);
  assert.ok(Math.abs(med - 15) < 4, `model median at 2040 is ${med.toFixed(1)}%, prose says about 15%`);
});

test("PROSE: the nuclear forecasts track the model, and say so when they do not", () => {
  const byYear = Object.fromEntries(
    TC.forecasts.filter((f) => f.claim.includes("No nuclear weapon")).map((f) => [f.by, f]));
  // Stated as probability of NO use; the model reports probability of use.
  for (const [year, f] of Object.entries(byYear)) {
    const modelUse = at(run.peace.pNuke, Number(year)) * 100;
    const statedUse = 100 - f.p;
    const gap = Math.abs(modelUse - statedUse);
    if (gap > 3) {
      assert.match(f.why, /model/i,
        `the ${year} nuclear forecast differs from the model by ${gap.toFixed(1)} points ` +
        "without the divergence being disclosed in its reasoning");
    }
    assert.ok(gap < 12,
      `the ${year} nuclear forecast is ${statedUse}% against the model's ${modelUse.toFixed(1)}%`);
  }
});

test("PROSE: the wartime nuclear multiplier is the one described", () => {
  // app.js tells the reader the hazard is "multiplied roughly eightfold
  // while a great-power war is being fought".
  assert.equal(M.K.NUKE_WAR_MULT, 8, "the multiplier changed but the readout copy did not");
  assert.match(appSrc, /roughly eightfold/);
});

test("PROSE: the conflict cone's observed marker is battle deaths, not all violence", () => {
  // 244,600 was all organised violence; battle deaths were ~150,000.
  // Drawing the wider figure on this chart put the marker ~60% too high.
  const m = appSrc.match(/refs:\s*\[\{\s*v:\s*([\d.]+),\s*l:\s*"2025 observed"/);
  assert.ok(m, "the peace reference line has moved");
  const marker = Number(m[1]);
  assert.ok(marker > 1.5 && marker < 2.2,
    `the 2025 marker is at ${marker}/100k; battle deaths over 8.2bn people is about 1.8`);
});

test("PROSE: the method section's account of the conditioning step is accurate", () => {
  const claim = TC.method.blocks.find((b) => b.list)
    .list.find((s) => s.includes("conditioned on the observed record"));
  assert.ok(claim, "the conditioning bullet has been reworded");
  assert.match(claim, /0\.38–0\.59/, "the stated posterior range has changed");
  assert.ok(!/without having been told/.test(claim),
    "the circular 'rediscovers AR6' claim has come back");
});

test("no forecast figure is hard-coded in the prose where the model should supply it", () => {
  // The design rule at the top of content.js. Percentages in prose are
  // allowed only where they are observations, scenario weights, stated
  // credences, or explicitly flagged as model output.
  const suspicious = [];
  const scan = (obj, path) => {
    if (typeof obj === "string") {
      // A bare "NN% chance" in narrative prose is the shape of a stale
      // hard-coded forecast.
      const m = obj.match(/\b\d{2}% chance\b/);
      if (m) suspicious.push(`${path}: "${m[0]}"`);
    } else if (obj && typeof obj === "object") {
      for (const k of Object.keys(obj)) scan(obj[k], `${path}.${k}`);
    }
  };
  scan(TC, "TC");
  assert.deepEqual(suspicious, [],
    "hard-coded forecast percentages found; these drift out of step with the model");
});
