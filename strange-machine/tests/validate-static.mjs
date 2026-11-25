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
check(/<section\b[^>]*\bid=["']round-r1["']/.test(html), "the page has a Round r1 section");

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

const r1 = data?.rounds?.r1;
const r1Envelopes = Array.isArray(r1?.envelopes) ? r1.envelopes : [];
check(isDate(r1?.date) && r1.seed === "r1" && r1.judges === 3, "rounds.r1 has a date, seed and three judges");
check(r1Envelopes.length === 3 && new Set(r1Envelopes).size === 3 &&
  r1Envelopes.every((name) => typeof name === "string" && name.trim()), "rounds.r1 has three distinct envelope names");
check(Array.isArray(r1?.caps_min) && r1.caps_min.length === 3 &&
  r1.caps_min.every((minutes) => Number.isInteger(minutes) && minutes > 0), "rounds.r1 has three stage caps in minutes");

const runs = Array.isArray(data?.runs) ? data.runs : [];
check(runs.length > 0, "the export has scored runs");
for (const [index, run] of runs.entries()) {
  const label = `Run ${index + 1}`;
  check([run?.run, run?.seat].every((value) => typeof value === "string" && value.trim()), `${label} has a name and seat`);
  check((run?.phase === "pilot" && run.round === null) ||
    (run?.phase === "round r1" && run.round === "r1"), `${label} has a matching phase and round`);
  const envelope = run?.envelope;
  check(isWidth(envelope?.data_bits) && isWidth(envelope?.word_bits) && typeof envelope?.two_ended === "boolean", `${label} has both envelope widths and a two-ended flag`);
  check([run?.overall, run?.judged, run?.machine, run?.programs].every(isScore) && typeof run?.nonconforming === "boolean", `${label} has scores and a conformance verdict`);
  check(Number.isInteger(run?.questions) && run.questions >= 0 && Number.isFinite(run?.cost_usd) && run.cost_usd >= 0, `${label} has a question count and USD cost`);
  check(Array.isArray(run?.wall_s) && run.wall_s.length > 0 && run.wall_s.every((value) => Number.isFinite(value) && value >= 0), `${label} has stage timings in seconds`);
}

const roundRuns = runs.filter((run) => run?.phase === "round r1" && run.round === "r1");
const roundSeats = ["opus-5.5-medium", "sonnet-5.5-high", "haiku-5.5-high", "sol-6.2-xhigh"];
check(roundRuns.length === 12 && r1Envelopes.length === 3 && roundSeats.every((seat) =>
  r1Envelopes.every((name) => roundRuns.filter((run) => run.seat === seat && run.envelope?.name === name).length === 1)),
  "round r1 has one run per seat and drawn envelope");
check(runs.some((run) => run?.phase === "pilot"), "the export has pilot runs");
for (const run of roundRuns) {
  const { passed, cases } = run.programs_passed ?? {};
  check(run.judges === r1?.judges, `${run.run} has the round's judge count`);
  check(Number.isInteger(cases) && cases > 0 && Number.isInteger(passed) && passed >= 0 && passed <= cases,
    `${run.run} has valid program case counts`);
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
