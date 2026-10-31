// The catalogue entry for plan-to-build against the rules in the repo's CLAUDE.md ("Adding a document"). data.js is evaluated in a bare context and checked:
// unique slug, url shape, ISO date, tags exist in TAG_GROUPS (one from each axis), illustration symbol exists in index.html, tagline length, shelf
// membership, and that every shelf slug still names an entry.
// No browser needed.
//   usage: node catalog.test.mjs        (PTB_SITE=<site root> checks another copy of the site: it needs data.js, index.html and plan-to-build/index.html)
import { suite } from "./lib/suite.mjs";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { SITE } from "./lib/site.mjs";
import { CATALOG } from "./expect.mjs";

const S = suite("catalog");
await S.run(async () => {
  const root = SITE, SLUG = CATALOG.slug;
  const src = fs.readFileSync(path.join(root, "data.js"), "utf8");
  const win = {};
  vm.runInNewContext(src, { window: win, console });
  const E = win.ESSAYS, C = win.COLLECTIONS, G = win.TAG_GROUPS;
  const idx = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const e = E.find((x) => x.slug === SLUG);
  S.check("entry exists", !!e);
  if (!e) return;
  S.check("slug unique", E.filter((x) => x.slug === SLUG).length === 1);
  S.check("url", e.url === `https://0x4d44.github.io/${SLUG}/`, e.url);
  S.check("directory has index.html", fs.existsSync(path.join(root, SLUG, "index.html")));
  S.check("date is a full ISO timestamp", /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(e.date), e.date);
  const all = new Set(G.flatMap((g) => g.tags));
  S.check("every tag is in TAG_GROUPS", (e.tags || []).every((t) => all.has(t)), JSON.stringify(e.tags));
  S.check("one tag from each axis", G.every((g) => (e.tags || []).some((t) => g.tags.includes(t))));
  S.check("illustration symbol exists", new RegExp(`<symbol id="${e.illustration}"`).test(idx), e.illustration);
  const wc = e.tagline.trim().split(/\s+/).length;
  S.check("tagline <= 55 words", wc <= 55, wc + " words");
  S.check("real: true", e.real === true);
  S.check("on a shelf", C.some((c) => c.slugs.includes(SLUG)), C.filter((c) => c.slugs.includes(SLUG)).map((c) => c.id).join(","));
  const have = new Set(E.map((x) => x.slug));
  const orphans = C.flatMap((c) => c.slugs.filter((s) => !have.has(s)));
  S.check("every shelf slug names an entry", orphans.length === 0, orphans.join(","));
  S.check("no duplicate slugs in the catalogue", have.size === E.length);
  const counts = {}; for (const c of C) for (const s of c.slugs) counts[s] = 1;
  const unshelved = E.filter((x) => !counts[x.slug]).map((x) => x.slug);
  S.check("nothing unshelved", unshelved.length === 0, unshelved.join(","));
});
