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
const data = readFileSync(join(root, "data.js"), "utf8");
const catalogue = readFileSync(join(root, "index.html"), "utf8");

check(existsSync(htmlPath), "opus-rally/index.html exists");
for (const module of MODULES) {
  check(existsSync(join(appDir, module)), `opus-rally/${module} exists`);
}
check(existsSync(join(appDir, "three.module.min.js")), "three.js is vendored beside the document");
check(existsSync(join(appDir, "THREE-LICENSE.txt")), "the vendored three.js keeps its MIT licence");

check(/<meta\b[^>]*name=["']viewport["']/i.test(html), "a viewport meta is present");
check(/<title>[^<]*OpusRally[^<]*<\/title>/i.test(html), "the title names OpusRally");
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

// The catalogue has to know about it, or nobody finds it.
check(/slug:\s*["']opus-rally["']/.test(data), "data.js carries an opus-rally entry");
check(
  /url:\s*["']https:\/\/0x4d44\.github\.io\/opus-rally\/["']/.test(data),
  "the catalogue entry points at the published URL",
);
const illustration = data.match(/slug:\s*["']opus-rally["'][\s\S]{0,600}?illustration:\s*["']([^"']+)["']/);
check(!!illustration, "the catalogue entry names an illustration");
if (illustration) {
  check(
    new RegExp(`<symbol[^>]*id=["']${illustration[1]}["']`).test(catalogue),
    `the sprite in index.html defines <symbol id="${illustration[1]}">`,
  );
}
check(
  /"opus-rally"/.test(data.slice(data.indexOf("window.COLLECTIONS"))),
  "opus-rally sits on a shelf in COLLECTIONS",
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

// Every button in the menu is an action string that ui.js hands to emit(), and
// emit() drops an action with no host hook SILENTLY — no error, no state change.
// That is how the entire main menu came to be dead except "How to drive": the
// shell offered quickStage, newSeason, timeTrial, garage and settings, game.js
// supplied none of them, and 435 assertions stayed green over a game no human
// could start. Every automated check reaches a stage through
// window.__opusRally.drive(), so nothing ever pressed a button.
//
// This is the general form of that bug, checked here rather than left to a
// browser test that can only cover the paths someone thought to click.
{
  const uiSrc = readFileSync(join(appDir, "ui.js"), "utf8");
  const gameSrc = readFileSync(join(appDir, "game.js"), "utf8");

  // Actions the shell resolves itself, straight out of its own LOCAL_ACTIONS set.
  const localBlock = uiSrc.match(/const LOCAL_ACTIONS = new Set\(\[([\s\S]*?)\]\)/);
  check(!!localBlock, "ui.js still declares LOCAL_ACTIONS as a literal set");
  const local = new Set(
    (localBlock ? localBlock[1].match(/"([a-zA-Z]+)"/g) || [] : []).map((q) => q.slice(1, -1)));

  // …and the alias table that maps an action onto a differently-named hook.
  const aliasBlock = uiSrc.match(/const ACTION_ALIAS = Object\.freeze\(\{([\s\S]*?)\}\)/);
  check(!!aliasBlock, "ui.js still declares ACTION_ALIAS as a literal object");
  const alias = new Map();
  for (const m of (aliasBlock ? aliasBlock[1].matchAll(/([a-zA-Z]+):\s*"(on[A-Za-z]+)"/g) : [])) {
    alias.set(m[1], m[2]);
  }

  const hookFor = (action) =>
    alias.get(action) || ("on" + action.charAt(0).toUpperCase() + action.slice(1));

  // Actions the screens actually emit: btn(id, label, "action") and the
  // `action: "…"` fields on list, tab and grid items.
  const emitted = new Set();
  for (const m of uiSrc.matchAll(/\bbtn\(\s*"[^"]*"\s*,\s*(?:"[^"]*"|[^,]+?)\s*,\s*"([a-zA-Z]+)"/g)) {
    emitted.add(m[1]);
  }
  for (const m of uiSrc.matchAll(/\baction:\s*"([a-zA-Z]+)"/g)) emitted.add(m[1]);
  // The ternary form the title screen uses for its primary button.
  for (const m of uiSrc.matchAll(/\?\s*"([a-zA-Z]+)"\s*:\s*"([a-zA-Z]+)"\s*,\s*\{\s*primary/g)) {
    emitted.add(m[1]); emitted.add(m[2]);
  }
  check(emitted.size > 8, `found ${emitted.size} menu actions in ui.js — the scan has stopped matching`);

  // Hooks game.js hands to createUi. Anything it does not supply and the shell
  // does not resolve itself is a button that does nothing when pressed.
  const hooks = new Set();
  for (const m of gameSrc.matchAll(/\b(on[A-Z][A-Za-z]*)\s*:/g)) hooks.add(m[1]);

  const dead = [...emitted]
    .filter((a) => !local.has(a))
    .filter((a) => !hooks.has(hookFor(a)))
    .sort();
  check(dead.length === 0,
    "every menu action is either resolved by ui.js or hooked by game.js "
    + `(dead: ${dead.map((a) => `${a} -> ${hookFor(a)}`).join(", ")})`);
}

if (failures.length) {
  console.error(`opus-rally: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`opus-rally: ${checks} static checks passed`);
