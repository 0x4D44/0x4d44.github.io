// Serves the site with one extra getter on window.__tl (the page keeps its internals module-private), for tests that need them.
// The shipped file is untouched: the getter is added to a copy that only the test's own server hands out.
//   const srv = await serveDbg(SITE, "G3, MAT3, paintPlan");   ...   page.eval("const { G3 } = window.__tl._dbg; ...")
// With PTB_MUTANT=<id> the copy is also mutated (lib/mutants.mjs): this is how mutations.test.mjs runs a guard against a page with a fix undone.
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { serve } from "./cdp.mjs";
import { PAGE } from "./site.mjs";
import { applyMutant } from "./mutants.mjs";

// The page text as the tests see it: the file, plus the mutation when PTB_MUTANT asks for one.
export async function pageText(root) {
  const html = await readFile(join(root, PAGE), "utf8");
  return process.env.PTB_MUTANT ? applyMutant(html, process.env.PTB_MUTANT) : html;
}

export const withDbg = (html, names) => {
  const out = html.replace("window.__tl = {", () => `window.__tl = { get _dbg() { return { ${names} }; },`);
  if (out === html) throw new Error("the page has no 'window.__tl = {' to hang the debug getter on (the boot code changed: update lib/dbg.mjs)");
  return out;
};

// names: the module-private identifiers to expose as window.__tl._dbg ("" or undefined: none, the page is served as it is).
// extra: more exact-path routes for the server.
export async function serveDbg(root, names, extra = {}) {
  let html = await pageText(root);
  if (names) html = withDbg(html, names);
  return serve(root, { "/almanac-back.js": "/* stub */", ...extra, [`/${PAGE}`]: html });
}
