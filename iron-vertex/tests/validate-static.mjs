// Static acceptance checks for Iron Vertex.
//
// Physics lives in engine.test.mjs and real interaction in browser.test.mjs.
// This file guards the wiring that neither of those would notice: that the
// page is self-contained, that it is joined up to the almanac catalogue,
// and that the controls the browser test drives by id still exist.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));
const htmlPath = join(appDir, "index.html");
const trackPath = join(appDir, "track.js");
const vendorPath = join(appDir, "three.module.min.js");
const licensePath = join(appDir, "THREE-LICENSE.txt");
const dataPath = join(root, "data.js");
const indexPath = join(root, "index.html");

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

check(existsSync(htmlPath), "iron-vertex/index.html exists");
check(existsSync(trackPath), "iron-vertex/track.js exists");
check(existsSync(vendorPath), "three.js is vendored beside the document");
check(existsSync(licensePath), "the vendored three.js keeps its MIT licence alongside it");

const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
const track = existsSync(trackPath) ? readFileSync(trackPath, "utf8") : "";
const data = existsSync(dataPath) ? readFileSync(dataPath, "utf8") : "";
const catalogue = existsSync(indexPath) ? readFileSync(indexPath, "utf8") : "";

// ---- document basics ----
check(/<meta\b[^>]*name=["']viewport["']/i.test(html), "a viewport meta is present");
check(/<title>[^<]*Iron Vertex[^<]*<\/title>/i.test(html), "the title names Iron Vertex");
check(/<meta\b[^>]*name=["']description["']/i.test(html), "a description meta is present");

// ---- the shared back button ----
check(
  /<script\b[^>]*src=["']\/almanac-back\.js["']/i.test(html),
  "the shared \"back to the almanac\" script is included",
);

// ---- self-contained: nothing may be fetched from another origin ----
const externalRefs = [...html.matchAll(/\b(?:src|href)\s*=\s*["'](https?:)?\/\/[^"']+["']/gi)]
  .map((m) => m[0]);
check(
  externalRefs.length === 0,
  `the page loads nothing from another origin (found: ${externalRefs.join(", ")})`,
);
check(
  /from\s+["']\.\/three\.module\.min\.js["']/.test(html),
  "three.js is imported from the vendored copy, not a CDN",
);
check(
  /from\s+["']\.\/track\.js["']/.test(html),
  "the page imports the track engine as a module",
);

// ---- the engine stays free of the browser, so node can test it ----
// Comments are stripped first: prose about "the window in which a loop
// fits" is not a reference to the browser's window object.
const trackCode = track
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
const browserGlobals = ["document", "window", "navigator", "localStorage", "THREE"]
  .filter((name) => new RegExp(`\\b${name}\\s*[.[(]`).test(trackCode));
check(
  browserGlobals.length === 0,
  `track.js touches no browser globals — it must stay testable under node (found: ${browserGlobals.join(", ")})`,
);
for (const name of ["buildTrack", "CoasterSim", "supportColumns"]) {
  check(
    new RegExp(`export\\s+(?:function|class)\\s+${name}\\b`).test(track),
    `track.js exports ${name}`,
  );
}

// ---- the controls the browser test drives ----
for (const id of ["scene", "btn-ride", "btn-new", "btn-cam", "track-name", "notice",
  "stat-speed", "stat-g", "stat-height", "stat-length"]) {
  check(
    new RegExp(`id=["']${id}["']`).test(html),
    `#${id} exists in the page`,
  );
}
for (const id of ["btn-ride", "btn-new", "btn-cam"]) {
  const tag = html.match(new RegExp(`<([a-z]+)\\b(?=[^>]*id=["']${id}["'])[^>]*>`, "i"));
  check(tag?.[1]?.toLowerCase() === "button", `#${id} is a real <button>`);
  check(/aria-label=/.test(tag?.[0] ?? ""), `#${id} carries an accessible name`);
}

// The boot notice covers the whole viewport, so it must be genuinely
// removed rather than merely marked hidden: an author `display` beats the
// user-agent rule for [hidden] and would leave an invisible layer over
// every control.
check(
  /\[hidden\]\s*\{[^}]*display:\s*none\s*!important/.test(html),
  "[hidden] is forced to display:none, so the boot notice cannot swallow taps",
);

// The injected "back to the almanac" pill is fixed at the top-left of
// every document; the control panel must start clear of it.
const controlsTop = html.match(/#controls\s*\{[^}]*top:\s*(\d+)px/);
check(
  controlsTop && Number(controlsTop[1]) >= 44,
  "the control panel clears the injected Almanac button at the top-left",
);

// ---- catalogue wiring ----
check(/slug:\s*["']iron-vertex["']/.test(data), "data.js lists the iron-vertex slug");
check(
  /url:\s*["']https:\/\/0x4d44\.github\.io\/iron-vertex\/["']/.test(data),
  "data.js points at the published URL",
);
const entry = data.match(/\{[^{}]*slug:\s*["']iron-vertex["'][\s\S]{0,900}?\}/);
check(Boolean(entry), "the iron-vertex catalogue entry can be read");
if (entry) {
  const illustration = entry[0].match(/illustration:\s*["']([^"']+)["']/);
  check(Boolean(illustration), "the entry names an illustration symbol");
  if (illustration) {
    check(
      new RegExp(`<symbol\\s+id=["']${illustration[1]}["']`).test(catalogue),
      `the sprite in index.html defines <symbol id="${illustration[1]}">`,
    );
  }
  check(/date:\s*["']\d{4}-\d{2}-\d{2}/.test(entry[0]), "the entry has an ISO date");
  check(/real:\s*true/.test(entry[0]), "the entry is marked published");
  const tagline = entry[0].match(/tagline:\s*["']([^"']+)["']/);
  check(Boolean(tagline), "the entry has a tagline");
  check(
    !tagline || tagline[1].split(/\s+/).length <= 60,
    `the tagline stays short (${tagline ? tagline[1].split(/\s+/).length : 0} words)`,
  );
}
// Anything left off every shelf falls into a trailing "Unshelved" group.
check(
  /COLLECTIONS[\s\S]*["']iron-vertex["']/.test(data),
  "iron-vertex sits on a shelf in window.COLLECTIONS",
);

if (failures.length) {
  console.error(`iron-vertex static checks failed (${failures.length}/${checks}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`iron-vertex static checks passed (${checks})`);
