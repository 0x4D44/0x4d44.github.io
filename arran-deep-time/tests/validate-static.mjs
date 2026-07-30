// Static guards for "Arran: Island of Deep Time".
//
// These are the checks that do not need a browser: the document's own file
// hygiene, and — the part that keeps biting this repo — its wiring into the
// almanac catalogue. A document can be perfect on its own and still be
// invisible or unreachable from the catalog, so those links are asserted here
// rather than left to a reader to notice.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const DOC = resolve(HERE, "..");
const ROOT = resolve(DOC, "..");
const SLUG = "arran-deep-time";

const read = (path) => readFileSync(path, "utf8");
const html = read(join(DOC, "index.html"));
const css = read(join(DOC, "arran.css"));
const app = read(join(DOC, "app.js"));

// data.js is a browser script that assigns onto `window`; give it one.
function loadCatalog() {
  const scope = { window: {} };
  scope.window.window = scope.window;
  new Function("window", read(join(ROOT, "data.js")))(scope.window);
  return scope.window;
}

test("the document loads nothing from an external origin", () => {
  // Outbound <a href> citations in the source notebook are the point of the
  // notebook and are fine. What must not happen is the *page* depending on a
  // third party to render: no CDN script, no remote stylesheet, no hosted font,
  // no map tile provider, no tracker.
  const loaded = [...html.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => /(?:src|href)="(?:https?:)?\/\//i.test(tag));
  assert.deepEqual(loaded, [], `document loads a subresource from an external origin: ${loaded.join(", ")}`);
  assert.ok(!/<script[^>]+type="text\/babel"/.test(html), "no in-browser Babel: this document has no build step and needs none");
});

test("every outbound citation opens safely", () => {
  const outbound = [...html.matchAll(/<a\b[^>]*href="https?:\/\/[^"]*"[^>]*>/gi)].map((m) => m[0]);
  assert.ok(outbound.length > 0, "expected the source notebook to cite external references");
  for (const anchor of outbound) {
    if (!/target="_blank"/.test(anchor)) continue;
    assert.match(anchor, /rel="[^"]*noopener/, `target="_blank" without rel="noopener": ${anchor}`);
  }
});

test("the shared almanac back-button is included", () => {
  // Catalog links open in the same tab, so this pill is the reader's way back.
  // It is defined once at the repo root and every document opts in with this
  // one line — see CLAUDE.md, 'Site navigation'.
  assert.match(html, /<script defer src="\/almanac-back\.js"><\/script>/,
    "missing the shared /almanac-back.js include before </body>");
});

test("nothing interactive sits under the shared back pill", () => {
  // The pill is fixed at the top-left, roughly x max(10px, safe-area-left)
  // .. +102px, y 10..39, at z-index 2147483647 — nothing on the page can be
  // layered above it. A control placed there is not merely obscured, it is
  // untappable: a tap navigates to the catalog instead. ALM-BUG-KILN-00039.
  assert.ok(!/class="home"/.test(html),
    "the document must not ship its own top-left back link: it duplicates the shared pill and sits under it");
  assert.match(css, /\.skip\{[^}]*left:calc\(max\(10px,env\(safe-area-inset-left\)\) \+ 112px\)/,
    "the skip link must be offset clear of the shared pill");
  assert.match(css, /\.field-position\{[^}]*margin-left:auto/,
    "the topbar readout must be pushed right, away from the pill");
});

test("the document is reachable from the catalogue", () => {
  const { ESSAYS, COLLECTIONS, TAG_GROUPS } = loadCatalog();

  const entry = ESSAYS.find((e) => e.slug === SLUG);
  assert.ok(entry, `no window.ESSAYS entry for "${SLUG}" — the document would not appear in the catalog at all`);

  assert.equal(entry.url, `https://0x4d44.github.io/${SLUG}/`, "entry url must match the slug");
  assert.equal(entry.real, true);
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, "use a full timestamp so same-day entries sort");
  assert.ok(Number.isInteger(entry.year), "year is the subject's year, not the publish date");

  // `readingMin` is what the card shows; the repo's other entries sit around
  // 220 words a minute. A `words` figure that disagrees with it makes one of
  // the two numbers on the card a lie.
  const wpm = entry.words / entry.readingMin;
  assert.ok(wpm > 180 && wpm < 260,
    `words/readingMin = ${wpm.toFixed(0)} wpm, outside the catalog's ~220 wpm norm (words=${entry.words}, readingMin=${entry.readingMin})`);

  // A tag not listed in TAG_GROUPS gets no filter chip, so the document
  // silently drops out of that filter.
  const vocabulary = new Set(TAG_GROUPS.flatMap((g) => g.tags));
  const tags = entry.tags ?? [entry.tag];
  for (const tag of tags) {
    assert.ok(vocabulary.has(tag), `tag "${tag}" is not in window.TAG_GROUPS, so it renders no filter chip`);
  }

  // The shelf view is the landing page. Anything on no shelf falls into a
  // trailing "Unshelved" group.
  const shelves = COLLECTIONS.filter((c) => c.slugs.includes(SLUG)).map((c) => c.id);
  assert.ok(shelves.length > 0, `"${SLUG}" is on no shelf in window.COLLECTIONS`);

  // The illustration id must exist in the sprite at the bottom of index.html,
  // or app.js silently falls back to ill-diesel and the card shows a locomotive.
  const sprite = read(join(ROOT, "index.html"));
  assert.ok(sprite.includes(`id="${entry.illustration}"`),
    `illustration "${entry.illustration}" is not a <symbol> in the root index.html sprite`);
});

test("every in-page anchor and chapter rail target resolves", () => {
  const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
  assert.ok(targets.length > 0, "expected in-page chapter links");
  for (const target of targets) {
    assert.ok(ids.has(target), `href="#${target}" points at no element in the document`);
  }
});

test("no duplicate element ids", () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  const seen = new Set();
  const duplicates = ids.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual([...new Set(duplicates)], [], "duplicate ids make getElementById and label targeting ambiguous");
});

test("reduced motion is honoured, not just deferred to the off-screen pause", () => {
  // A canvas that only stops when scrolled out of view still animates for a
  // reader who asked for no motion.
  assert.match(app, /prefers-reduced-motion/, "app.js must consult the reduced-motion preference");
});

test("the glacier readout reports non-zero work below the first threshold", () => {
  // Regression: the readout claimed "0% glacial work" for every non-zero value
  // under 18, so early slider movement looked like a dead control.
  assert.ok(!/Math\.floor\([^)]*\/\s*18\s*\)/.test(app),
    "a floor division by the first threshold is what produced the 0% readout");
});
