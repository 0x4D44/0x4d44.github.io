import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));

const mustExist = ["index.html", "styles.css", "app.js", "engine.js", "content.js", "icon.svg"];
for (const file of mustExist) assert.ok(existsSync(join(appDir, file)), `${file} exists`);

const index = readFileSync(join(appDir, "index.html"), "utf8");
assert.match(index, /<link rel="stylesheet" href="styles\.css" \/>/, "index links stylesheet");
assert.match(index, /<script type="module" src="app\.js"><\/script>/, "index loads module app");
assert.match(index, /<script defer src="\/almanac-back\.js"><\/script>/, "index carries the shared back button");
assert.match(index, /aria-live/, "index has a live region for alarms");
for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith("#")) continue;
  assert.ok(!/^(https?:)?\/\//.test(ref), `no runtime external URL: ${ref}`);
  const target = ref.startsWith("/") ? join(root, ref.slice(1)) : join(appDir, ref);
  assert.ok(existsSync(target), `index reference exists: ${ref}`);
}

// no external runtime URLs, no placeholder language, syntax-clean JS
for (const file of ["index.html", "styles.css", "app.js", "engine.js", "content.js"]) {
  const text = readFileSync(join(appDir, file), "utf8");
  assert.doesNotMatch(text, /https?:\/\//, `${file} has no runtime external URL`);
  assert.doesNotMatch(text, /TODO|FIXME|placeholder|coming soon/i, `${file} has no unfinished placeholder language`);
}
for (const file of ["app.js", "engine.js", "content.js"]) {
  execFileSync(process.execPath, ["--check", join(appDir, file)], { stdio: "pipe" });
}

// the [hidden] display override (lessons_learnt: author display beats UA [hidden])
const css = readFileSync(join(appDir, "styles.css"), "utf8");
assert.match(css, /\[hidden\]\s*\{\s*display:\s*none/, "styles carry the [hidden]{display:none} override");
assert.match(css, /prefers-reduced-motion/, "styles carry a reduced-motion variant for the annunciator flash");

// catalog integration: data.js entry, sprite symbol, shelves, test chain
const data = readFileSync(join(root, "data.js"), "utf8");
assert.match(data, /slug: "chief-engineer"/, "data.js has the catalog entry");
assert.match(data, /"ill-chief"/, "entry uses the ill-chief sprite");
const shelves = data.slice(data.indexOf("window.COLLECTIONS"));
assert.ok((shelves.match(/"chief-engineer"/g) ?? []).length >= 2, "entry sits on at least two shelves");
const rootIndex = readFileSync(join(root, "index.html"), "utf8");
assert.match(rootIndex, /symbol id="ill-chief"/, "root sprite has ill-chief");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
for (const script of ["test", "build"]) {
  assert.ok(pkg.scripts[script].includes("chief-engineer/tests/validate-static.mjs"),
    `root ${script} script runs this validator`);
}
assert.ok(pkg.scripts.test.includes("chief-engineer/tests/playthrough.test.mjs"), "root test runs the playthrough oracle");

console.log("chief-engineer static validation passed");
