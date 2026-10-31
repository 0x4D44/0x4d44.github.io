// Runs the plan-to-build regression suites one after another (one Chrome at a time), each in its own node process with its own time limit, and prints a table.
//   node plan-to-build/tests/run.mjs                    order, zfight, paint, jamb, catalog, player, tour
//   node plan-to-build/tests/run.mjs --full             ... and review and export (the independent review's checks and the MP4 export: slower, and export needs ffmpeg)
//   node plan-to-build/tests/run.mjs --mutations        ... and mutations (undo each fix on a copy of the page: every guard must fail)
//   node plan-to-build/tests/run.mjs --only order,jamb  just these suites (names as in the table; --list prints them)
//   --verbose   print every line the suites print (default: only FAIL, WARN and SKIP lines, and the table)
// Exit code 0 when every suite that ran passed (a SKIPPED suite is not a failure), 1 when one failed, timed out or crashed, 2 for a usage error.
// Environment (see the header of each *.test.mjs for the rest):
//   PTB_SITE=<folder>        test another copy of the site (a folder that holds plan-to-build/index.html); default: this repository
//   CHROME_PATH=<binary>     the Chrome or Chromium to drive; PTB_ALLOW_NO_CHROME=1 skips the browser suites on purpose when there is none
//   PTB_TIMEOUT_SCALE=<n>    multiplies every suite's time limit (a slow or busy box)
//   PTB_STRICT_TIMING=1      the review suite's first-draw timing check fails instead of warning
// Works from any folder. Browsers run headless, hidden, at idle priority; nothing draws a window or takes the mouse or keyboard.
import "./lib/lowprio.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TESTS, SITE } from "./lib/site.mjs";
import { killTree } from "./lib/cdp.mjs";
import { chromeLookup } from "./lib/chrome.mjs";

try { process.chdir(tmpdir()); } catch { /* keep the caller's folder */ }

// secs: the time limit for one run of the suite on a busy box (they take a fraction of it on a quiet one)
const SUITES = [
  { name: "order",     group: "default",   secs: 240,  what: "draw order of the plan: rugs, chairs, outlines" },
  { name: "zfight",    group: "default",   secs: 240,  what: "no coplanar faces among the construction solids and the frames" },
  { name: "paint",     group: "default",   secs: 360,  what: "plaster and paint, room by room" },
  { name: "jamb",      group: "default",   secs: 360,  what: "window jambs do not shimmer" },
  { name: "catalog",   group: "default",   secs: 60,   what: "the almanac entry" },
  { name: "player",    group: "default",   secs: 360,  what: "the player, the chapters, determinism" },
  { name: "tour",      group: "default",   secs: 300,  what: "the first-person tour: roof, lamps, front door, camera track, room tags" },
  { name: "review",    group: "full",      secs: 900,  what: "the independent review's checks" },
  { name: "export",    group: "full",      secs: 1800, what: "the MP4 export (needs ffmpeg and ffprobe)" },
  { name: "mutations", group: "mutations", secs: 1800, what: "every guard fails when its fix is undone" },
];

const argv = process.argv.slice(2);
const flag = (f) => argv.includes(f);
const usage = (msg) => { if (msg) console.error(msg + "\n"); console.error("usage: node plan-to-build/tests/run.mjs [--full] [--mutations] [--only a,b] [--verbose] [--list]"); process.exit(msg ? 2 : 0); };
const known = new Set(["--full", "--mutations", "--verbose", "-v", "--list", "--only", "--help", "-h"]);
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === "--only") { i++; continue; }
  if (!known.has(argv[i])) usage(`unknown argument ${argv[i]}`);
}
if (flag("--help") || flag("-h")) usage();
if (flag("--list")) { for (const s of SUITES) console.log(`${s.name.padEnd(10)} ${s.group.padEnd(10)} ${s.what}`); process.exit(0); }
if (Number(process.versions.node.split(".")[0]) < 22) usage(`Node 22 or newer is needed (the tests use its global WebSocket); this is ${process.version}`);

let chosen;
const oi = argv.indexOf("--only");
if (oi >= 0) {
  const names = (argv[oi + 1] || "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!names.length) usage("--only needs a comma-separated list of suite names");
  const bad = names.filter((n) => !SUITES.some((s) => s.name === n));
  if (bad.length) usage(`unknown suite ${bad.join(", ")} (known: ${SUITES.map((s) => s.name).join(", ")})`);
  chosen = SUITES.filter((s) => names.includes(s.name));
} else {
  chosen = SUITES.filter((s) => s.group === "default" || (flag("--full") && s.group === "full") || (flag("--mutations") && s.group === "mutations"));
}
const VERBOSE = flag("--verbose") || flag("-v") || process.env.PTB_VERBOSE === "1";
const SCALE = +(process.env.PTB_TIMEOUT_SCALE || 1) || 1;

let current = null, runTmp = null;
const cleanup = async () => { if (current) killTree(current.pid); if (runTmp) await rm(runTmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); };
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { console.error(`\n${sig}: stopping`); cleanup().finally(() => process.exit(130)); });

// One suite in its own node process. Returns { out, code, timedOut, seconds }.
function runSuite(s, tmp) {
  return new Promise((done) => {
    const t0 = Date.now();
    let out = "", buf = "", timedOut = false, spawnErr = null;
    const emit = (chunk) => {
      out += chunk;
      if (!VERBOSE) return;
      buf += chunk;
      const lines = buf.split(/\r?\n/); buf = lines.pop();
      for (const l of lines) console.log(l);
    };
    const child = spawn(process.execPath, [join(TESTS, `${s.name}.test.mjs`)], {
      env: { ...process.env, PTB_TMP: tmp }, cwd: tmp, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32",
    });
    current = child;
    child.stdout.on("data", (d) => emit(String(d)));
    child.stderr.on("data", (d) => emit(String(d)));
    child.on("error", (e) => { spawnErr = e; });
    const limit = s.secs * SCALE;
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); try { child.kill("SIGKILL"); } catch { /* already gone */ } }, limit * 1000);
    child.on("close", (code) => {
      clearTimeout(timer);
      killTree(child.pid);                                         // whatever the suite left behind (a Chrome) goes with it
      current = null;
      if (VERBOSE && buf) console.log(buf);
      done({ out: spawnErr ? `could not start ${process.execPath}: ${spawnErr.message}` : out, code: spawnErr ? -1 : code, timedOut, limit, seconds: (Date.now() - t0) / 1000 });
    });
  });
}

const rows = [];
const t0 = Date.now();
const chrome = chromeLookup();
console.log(`plan-to-build tests: site ${SITE}`);
console.log(`Chrome: ${chrome.path || chrome.why}   node ${process.version}   suites: ${chosen.map((s) => s.name).join(", ")}`);
runTmp = await mkdtemp(join(tmpdir(), "ptb-run-"));
try {
  for (const s of chosen) {
    const tmp = await mkdtemp(join(runTmp, `${s.name}-`));
    console.log(`\n== ${s.name}: ${s.what}`);
    const r = await runSuite(s, tmp);
    await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {});
    const lines = r.out.split(/\r?\n/);
    const resLine = [...lines].reverse().find((l) => l.startsWith("RESULT "));
    let res = null;
    try { res = resLine ? JSON.parse(resLine.slice(7)) : null; } catch { res = null; }
    let status;
    if (r.timedOut) status = "TIMEOUT";
    else if (!res) status = "CRASH";
    else if (res.skip && !res.total) status = r.code === 0 ? "SKIPPED" : "FAIL";
    else status = r.code === 0 && !res.fail ? "ok" : "FAIL";
    if (!VERBOSE) for (const l of lines) if (/^(FAIL|WARN|SKIP) /.test(l)) console.log("  " + l.slice(0, 600));
    if (status === "TIMEOUT") console.log(`  TIMEOUT: killed after ${r.limit} s (PTB_TIMEOUT_SCALE=${SCALE}). Last lines:\n` + lines.filter(Boolean).slice(-6).map((l) => "    " + l.slice(0, 300)).join("\n"));
    else if (status === "CRASH") console.log(`  CRASH: exit code ${r.code} and no RESULT line. Last lines:\n` + lines.filter(Boolean).slice(-12).map((l) => "    " + l.slice(0, 300)).join("\n"));
    console.log(`   ${status === "ok" ? "ok" : status}: ${res ? `${res.pass} passed, ${res.fail} failed${res.warn ? `, ${res.warn} warn` : ""}${res.skip ? `, skipped: ${res.skipReason}` : ""}` : "no result"} in ${r.seconds.toFixed(1)} s`);
    rows.push({ name: s.name, res, status, seconds: r.seconds });
  }
} finally { await cleanup(); }

const W = Math.max(...rows.map((r) => r.name.length), 5);
const num = (v, w) => String(v ?? "-").padStart(w);
console.log(`\n${"suite".padEnd(W)}  ${"passed".padStart(6)}  ${"failed".padStart(6)}  ${"warn".padStart(4)}  ${"seconds".padStart(7)}  result`);
let bad = 0, p = 0, f = 0, w = 0;
for (const r of rows) {
  const pass = r.res ? r.res.pass : null, fail = r.res ? r.res.fail : null, warn = r.res ? r.res.warn : null;
  console.log(`${r.name.padEnd(W)}  ${num(pass, 6)}  ${num(fail, 6)}  ${num(warn, 4)}  ${r.seconds.toFixed(1).padStart(7)}  ${r.status}`);
  if (r.status !== "ok" && r.status !== "SKIPPED") bad++;
  p += pass || 0; f += fail || 0; w += warn || 0;
}
console.log(`${"total".padEnd(W)}  ${num(p, 6)}  ${num(f, 6)}  ${num(w, 4)}  ${((Date.now() - t0) / 1000).toFixed(1).padStart(7)}  ${bad ? `${bad} suite(s) FAILED` : "all passed"}`);
process.exitCode = bad ? 1 : 0;
