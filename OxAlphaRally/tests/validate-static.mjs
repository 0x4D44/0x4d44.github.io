// Wiring checks: the things neither the unit tests nor the browser test would
// notice, because they are about how the document sits in the site rather than
// about whether the game works.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));

const MODULES = [
  "mathx.js", "rng.js", "surfaces.js", "input.js", "game.js",
  "physics.js", "stage.js", "pacenotes.js", "damage.js", "career.js", "replay.js",
  "weather.js", "audio.js", "meshes.js", "render.js", "hud.js", "ui.js",
];

const failures = [];
let checks = 0;

function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const htmlPath = join(appDir, "index.html");
const html = existsSync(htmlPath) ? readFileSync(htmlPath, "utf8") : "";
const uiSource = readFileSync(join(appDir, "ui.js"), "utf8");
const data = readFileSync(join(root, "data.js"), "utf8");
const catalogue = readFileSync(join(root, "index.html"), "utf8");

check(existsSync(htmlPath), "OxAlphaRally/index.html exists");
for (const module of MODULES) {
  check(existsSync(join(appDir, module)), `OxAlphaRally/${module} exists`);
}
check(existsSync(join(appDir, "three.module.min.js")), "three.js is vendored beside the document");
check(existsSync(join(appDir, "THREE-LICENSE.txt")), "the vendored three.js keeps its MIT licence");

check(/<meta\b[^>]*name=["']viewport["']/i.test(html), "a viewport meta is present");
check(/<title>[^<]*OxAlphaRally[^<]*<\/title>/i.test(html), "the title names OxAlphaRally");
check(/<text\b[^>]*>OxAlphaRally<\/text>/.test(html), "the visible boot mark spells OxAlphaRally consistently");
check(!/>OXALPHA<\/text>[\s\S]{0,300}>RALLY<\/text>/.test(html), "the boot mark does not split the product into an all-caps alias");
check(/opts\.text\s*\?\?\s*["']OXALPHA["']/.test(uiSource), "the menu wordmark uses the OxAlphaRally identity");
check(!/opts\.text\s*\?\?\s*["']OPUS["']/.test(uiSource), "the menu has no legacy OPUS product wordmark");
check(/<meta\b[^>]*name=["']description["']/i.test(html), "a description meta is present");
check(/<noscript>/i.test(html), "there is a noscript fallback");

check(
  /<script\b[^>]*src=["']\/almanac-back\.js["']/.test(html),
  "the shared almanac back button is included",
);

// The game is one WebGL surface; a document that can scroll sideways would let a
// stray drag pull the page out from under the canvas.
check(/overflow:\s*hidden/.test(html), "the document does not scroll");
check(/touch-action:\s*none/.test(html), "the canvas swallows touch gestures rather than panning");

// Every asset must be local: this page has to work from a Pages subdirectory
// with no network beyond the origin.
const remote = [...html.matchAll(/(?:src|href)=["'](https?:)?\/\/[^"']+/gi)].map((m) => m[0]);
check(remote.length === 0, `no remote assets are referenced (found: ${remote.join(", ")})`);

// Comments legitimately discuss the things the checks below forbid — this file's
// own prose names Math.random twice — so every scan runs on code, not prose.
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

for (const file of MODULES) {
  const path = join(appDir, file);
  if (!existsSync(path)) continue;
  const code = stripComments(readFileSync(path, "utf8"));
  // Determinism is load-bearing: a replay, a ghost and a stage are all a seed.
  check(
    !/\bMath\.random\s*\(/.test(code),
    `${file} uses the seeded rng rather than Math.random`,
  );
  check(
    !/from\s+["'](https?:)?\/\/[^"']+["']/.test(code),
    `${file} imports nothing from the network`,
  );
}

// The catalogue has to know about this game specifically. The existing
// opus-rally entry is not evidence that its successor is published.
const entry = data.match(/slug:\s*["']OxAlphaRally["'][\s\S]{0,900}?\n\s*},/);
check(!!entry, "data.js carries an OxAlphaRally entry");
const entryText = entry ? entry[0] : "";
check(
  /url:\s*["']https:\/\/0x4d44\.github\.io\/OxAlphaRally\/["']/.test(entryText),
  "the OxAlphaRally entry points at the case-sensitive published URL",
);
for (const tag of ["games", "simulation", "transport"]) {
  check(new RegExp(`["']${tag}["']`).test(entryText), `the OxAlphaRally entry carries the ${tag} tag`);
}
const illustration = entryText.match(/illustration:\s*["']([^"']+)["']/);
check(!!illustration, "the catalogue entry names an illustration");
if (illustration) {
  check(
    new RegExp(`<symbol[^>]*id=["']${illustration[1]}["']`).test(catalogue),
    `the sprite in index.html defines <symbol id="${illustration[1]}">`,
  );
}
check(
  /["']OxAlphaRally["']/.test(data.slice(data.indexOf("window.COLLECTIONS"))),
  "OxAlphaRally sits on a shelf in COLLECTIONS",
);

// A stray zip or build artefact in the directory means something was copied in
// by hand rather than authored here.
const strays = readdirSync(appDir).filter((f) => /\.(zip|map|tsbuildinfo)$/i.test(f));
check(strays.length === 0, `no build artefacts left in the directory (found: ${strays.join(", ")})`);

// Original branding only. These are the names a well-meaning generator reaches
// for, and every one of them is somebody's trademark.
//
// Deliberately case-sensitive and specific: "ford" is a water crossing and a
// real rally feature, "focus" is an ordinary word, and a checker that cannot
// tell those from a marque gets switched off rather than obeyed.
const BRANDS = new RegExp([
  "Subaru", "Impreza", "Mitsubishi", "Lancer", "Lancia", "Delta Integrale", "Stratos",
  "Toyota", "Celica", "Corolla", "Ford Escort", "Ford Fiesta", "Ford Focus", "Escort Cosworth",
  "Peugeot", "Citro[eë]n", "Skoda", "Fabia", "Hyundai", "Audi Quattro", "Renault",
  "Volkswagen", "Porsche", "Nissan", "Vauxhall", "Astra", "Corsa\\b", "Evo\\b", "EVO\\b",
  "Pirelli", "Michelin", "Castrol", "Martini Racing", "Red Bull", "Monster Energy",
  "WRC\\b", "World Rally Championship", "Colin McRae", "Loeb", "Ogier", "M[äa]kinen",
  "Solberg", "Rovanper[äa]", "DiRT Rally", "Richard Burns Rally",
  "Monte Carlo Rally", "Rally Finland", "Acropolis Rally", "Safari Rally",
].join("|"));
for (const file of [...MODULES, "index.html"]) {
  const path = join(appDir, file);
  if (!existsSync(path)) continue;
  const hit = readFileSync(path, "utf8").match(BRANDS);
  check(!hit, `${file} carries no real-world marque, driver or event name (found "${hit?.[0]}")`);
}

if (failures.length) {
  console.error(`OxAlphaRally: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`OxAlphaRally: ${checks} static checks passed`);
