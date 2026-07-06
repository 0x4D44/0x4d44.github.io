import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { EXERCISES, FORM_REMINDERS, MILESTONES, NAG_MESSAGES, NUTRITION_NUDGES } from "../content.js";

const here = dirname(fileURLToPath(import.meta.url));
const appDir = normalize(join(here, ".."));
const root = normalize(join(appDir, ".."));
const mustExist = [
  "index.html",
  "styles.css",
  "content.js",
  "engine.js",
  "storage.js",
  "app.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon.svg"
];

for (const file of mustExist) assert.ok(existsSync(join(appDir, file)), `${file} exists`);

const index = readFileSync(join(appDir, "index.html"), "utf8");
assert.match(index, /<link rel="stylesheet" href="styles\.css"\s*\/>/, "index links stylesheet");
assert.match(index, /<script type="module" src="app\.js"><\/script>/, "index loads module app");
assert.match(index, /<link rel="manifest" href="manifest\.webmanifest"\s*\/>/, "index links manifest");
for (const match of index.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const ref = match[1];
  if (ref.startsWith("#") || ref === "../") continue;
  assert.ok(!/^(https?:)?\/\//.test(ref), `no runtime external URL: ${ref}`);
  assert.ok(existsSync(join(appDir, ref)), `index reference exists: ${ref}`);
}

const manifest = JSON.parse(readFileSync(join(appDir, "manifest.webmanifest"), "utf8"));
assert.equal(manifest.start_url, "./", "manifest starts at app root");
assert.equal(manifest.scope, "./", "manifest scope is local");
assert.ok(manifest.icons?.length, "manifest has icons");
for (const icon of manifest.icons) assert.ok(existsSync(join(appDir, icon.src)), `manifest icon exists: ${icon.src}`);

const sw = readFileSync(join(appDir, "sw.js"), "utf8");
for (const file of mustExist.filter((file) => file !== "sw.js")) {
  assert.ok(sw.includes(`"${file}"`) || (file === "index.html" && sw.includes('"./"')), `service worker precaches ${file}`);
}
assert.match(sw, /startsWith\(CACHE_PREFIX\)/, "service worker cleans only this app's caches");
assert.match(sw, /notificationclick/, "service worker handles notification clicks");

for (const file of mustExist.filter((file) => !file.endsWith(".webmanifest") && !file.endsWith(".svg"))) {
  const text = readFileSync(join(appDir, file), "utf8");
  assert.doesNotMatch(text, /https?:\/\//, `${file} has no runtime external URL`);
  assert.doesNotMatch(text, /TODO|placeholder|coming soon|future enhancement/i, `${file} has no unfinished placeholder language`);
}

for (const file of ["content.js", "engine.js", "storage.js", "app.js", "sw.js"]) {
  execFileSync(process.execPath, ["--check", join(appDir, file)], { stdio: "pipe" });
}

assert.ok(EXERCISES.length >= 10, "exercise library has at least ten exercises");
assert.ok(EXERCISES.filter((exercise) => exercise.locationModes.includes("home")).length >= 6, "home exercise set has at least six entries");
assert.ok(EXERCISES.filter((exercise) => exercise.locationModes.includes("hotel_gym")).length >= 6, "hotel exercise set has at least six entries");
for (const exercise of EXERCISES) {
  for (const field of ["id", "name", "category", "purpose", "longevityWhy", "beginnerVersion", "progression", "loggingType", "diagramType"]) {
    assert.ok(exercise[field], `${exercise.id} has ${field}`);
  }
  for (const field of ["equipment", "locationModes", "instructions", "commonMistakes", "safetyNotes"]) {
    assert.ok(Array.isArray(exercise[field]) && exercise[field].length, `${exercise.id} has ${field}`);
  }
}
assert.ok(NUTRITION_NUDGES.length >= 12, "at least twelve nutrition nudges");
assert.ok(NAG_MESSAGES.length >= 20, "at least twenty nag messages");
assert.ok(MILESTONES.length >= 12, "at least twelve milestone messages");
assert.ok(FORM_REMINDERS.length >= 5, "at least five form reminders");

const app = readFileSync(join(appDir, "app.js"), "utf8");
assert.match(app, /navigator\.serviceWorker\.register\("\.\/sw\.js"\)/, "app registers service worker");
assert.match(app, /Notification\.requestPermission/, "app has notification permission flow");
assert.match(app, /indexedDB|createBrowserStorage/, "app uses local browser storage layer");
assert.match(app, /Export JSON backup/, "settings include export flow");
assert.match(app, /Import JSON backup/, "settings include import flow");
assert.match(app, /Reset local data/, "settings include reset flow");

const dataPath = join(root, "data.js");
if (existsSync(dataPath)) {
  const data = readFileSync(dataPath, "utf8");
  assert.match(data, /slug: "shipshape"/, "almanac data contains shipshape slug");
  assert.match(data, /url: "https:\/\/0x4d44\.github\.io\/shipshape\/"/, "almanac URL is absolute");
}

console.log("shipshape static validation passed");
