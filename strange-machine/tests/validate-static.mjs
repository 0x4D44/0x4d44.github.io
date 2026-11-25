import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(appDir, "..");
const failures = [];
let checks = 0;

function check(condition, message) {
  checks++;
  if (!condition) failures.push(message);
}

function readPageFile(name) {
  const path = join(appDir, name);
  const exists = existsSync(path);
  check(exists, `strange-machine/${name} exists`);
  return exists ? readFileSync(path, "utf8") : "";
}

const html = readPageFile("index.html");
const js = readPageFile("ui.js");
const css = readPageFile("style.css");
const json = readPageFile("data.json");
check(/<script\b[^>]*\bsrc=["']\/almanac-back\.js["']/.test(html), "the shared almanac back button is included");
check(/<script\b[^>]*\bsrc=["'](?:\.\/)?ui\.js["']/.test(html), "the page loads ui.js");
check(/fetch\(\s*["'](?:\.\/)?data\.json["']/.test(js), "ui.js fetches the results from data.json");

let data;
try { data = JSON.parse(json); } catch { /* reported below */ }
check(data && typeof data === "object", "data.json parses as an object");
const isScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const isWidth = (value) => Number.isInteger(value) && value > 0;
const isRange = (value) => Array.isArray(value) && value.length === 2 && value.every(isWidth) && value[0] <= value[1];
const isDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
check(isDate(data?.generated), "the export has a generated time");
check(isDate(data?.scoring_rule), "the export has a scoring rule date");

const { judged, machine, programs } = data?.weights ?? {};
check([judged, machine, programs].every(isScore) && judged + machine + programs === 100, "component weights sum to 100");
const references = data?.references;
check(isRange(references?.data_bits) && isRange(references?.word_bits) && isScore(references?.score), "the reference envelopes have width ranges and a score");

const runs = Array.isArray(data?.runs) ? data.runs : [];
check(runs.length > 0, "the export has scored runs");
for (const [index, run] of runs.entries()) {
  const label = `Run ${index + 1}`;
  check([run?.run, run?.seat].every((value) => typeof value === "string" && value.trim()), `${label} has a name and seat`);
  const envelope = run?.envelope;
  check(isWidth(envelope?.data_bits) && isWidth(envelope?.word_bits) && typeof envelope?.two_ended === "boolean", `${label} has both envelope widths and a two-ended flag`);
  check([run?.overall, run?.judged, run?.machine, run?.programs].every(isScore) && typeof run?.nonconforming === "boolean", `${label} has scores and a conformance verdict`);
  check(Number.isInteger(run?.questions) && run.questions >= 0 && Number.isFinite(run?.cost_usd) && run.cost_usd >= 0, `${label} has a question count and USD cost`);
  check(Array.isArray(run?.wall_s) && run.wall_s.length > 0 && run.wall_s.every((value) => Number.isFinite(value) && value >= 0), `${label} has stage timings in seconds`);
}

const catalog = readFileSync(join(root, "data.js"), "utf8");
const sprite = readFileSync(join(root, "index.html"), "utf8");
const entry = catalog.match(/\{[^{}]*\bslug:\s*["']strange-machine["'][^{}]*\}/)?.[0];
check(!!entry, "data.js carries a strange-machine catalog entry");
const illustration = entry?.match(/\billustration:\s*["'](ill-[a-z0-9-]+)["']/)?.[1];
check(illustration && new RegExp(`<symbol\\b[^>]*\\bid=["']${illustration}["']`).test(sprite), "the catalog illustration exists in the root SVG sprite");
const shelves = catalog.split("window.COLLECTIONS =")[1] ?? "";
check(/["']strange-machine["']/.test(shelves), "Strange Machine is on a catalog shelf");

const forbidden = /\b(?:R(?:1[6-9]|2[0-5])|mandel|storm|life|paint|tune|sort|card)\b/;
for (const [name, source] of Object.entries({ "index.html": html, "ui.js": js, "style.css": css, "data.json": json })) {
  check(!forbidden.test(source), `${name} has no forbidden benchmark terms`);
}
check(!/"judged_requirements"\s*:/.test(json), "the public export omits private per-requirement scores");

if (failures.length) {
  console.error(`strange-machine: ${failures.length} of ${checks} checks failed`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`strange-machine: ${checks} static checks passed`);
