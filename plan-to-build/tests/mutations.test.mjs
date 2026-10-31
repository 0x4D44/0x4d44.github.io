// Do the guards bite? Each mutant in lib/mutants.mjs undoes ONE fix on an in-memory copy of the page (a plain string replacement; the shipped file is
// never touched). The test file written to guard that fix is then run against the copy through PTB_MUTANT, and it must FAIL, with a FAIL line that names
// the thing the fix was for (a crash or a "page ready" failure does not count as a catch).
//   1. every anchor is found exactly once in the page; if the page was refactored the message says which anchor to update in lib/mutants.mjs
//   2. for every guard of every mutant: exit code 1 and at least one FAIL line that matches the mutant's pattern
//   usage: node mutations.test.mjs [mutant-id ...]        env: PTB_MUTANT_TIMEOUT=<seconds per guard run, default 420>   PTB_SITE=<site root>
import { suite } from "./lib/suite.mjs";
import { MUTANTS, checkAnchor } from "./lib/mutants.mjs";
import { SITE, PAGE, TESTS } from "./lib/site.mjs";
import { killTree, scratchRoot } from "./lib/cdp.mjs";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";

const M = suite("mutations");
const LIMIT = 1000 * +(process.env.PTB_MUTANT_TIMEOUT || 420);
const only = process.argv.slice(2);

// Runs one guard file against one mutant: { code, out, timedOut, seconds }. Its Chrome profile folders go under a folder this function makes and removes.
async function runGuard(file, id) {
  const tmp = await mkdtemp(join(scratchRoot(), "ptb-mut-"));
  const t0 = Date.now();
  try {
    return await new Promise((done) => {
      let out = "", timedOut = false, spawnErr = null;
      const env = { ...process.env, PTB_MUTANT: id, PTB_TMP: tmp };
      const child = spawn(process.execPath, [join(TESTS, file)], { env, cwd: tmp, stdio: ["ignore", "pipe", "pipe"], windowsHide: true, detached: process.platform !== "win32" });
      child.stdout.on("data", (d) => { out += d; });
      child.stderr.on("data", (d) => { out += d; });
      child.on("error", (e) => { spawnErr = e; });
      const timer = setTimeout(() => { timedOut = true; killTree(child.pid); try { child.kill("SIGKILL"); } catch { /* already gone */ } }, LIMIT);
      child.on("close", (code) => {
        clearTimeout(timer);
        killTree(child.pid);                                       // anything the guard left behind (its Chrome) goes with it
        done({ code: spawnErr ? -1 : code, out: spawnErr ? String(spawnErr.message) : out, timedOut, seconds: (Date.now() - t0) / 1000 });
      });
    });
  } finally { await rm(tmp, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 }).catch(() => {}); }
}

await M.run(async () => {
  if (!M.needChrome()) return;
  const html = await readFile(join(SITE, PAGE), "utf8");
  const list = only.length ? MUTANTS.filter((m) => only.includes(m.id)) : MUTANTS;
  if (only.length && list.length !== only.length) throw new Error(`unknown mutant id in ${JSON.stringify(only)} (known: ${MUTANTS.map((m) => m.id).join(", ")})`);

  M.heading("anchors");
  const ok = new Set();
  for (const m of list) {
    const bad = checkAnchor(html, m) || (m.replace === m.anchor ? "the replacement is the anchor: the mutant changes nothing" : null);
    if (M.check(`${m.id}: the anchor is in the page exactly once and the mutant changes it`, !bad, bad || "")) ok.add(m.id);
  }

  for (const m of list) {
    M.heading(`${m.id}: ${m.what}`);
    if (!ok.has(m.id)) { M.info(`not run: its anchor is wrong (see above)`); continue; }
    for (const g of m.guards) {
      const r = await runGuard(g.file, m.id);
      const fails = r.out.split(/\r?\n/).filter((l) => /^FAIL /.test(l));
      const hit = fails.find((l) => g.fails.test(l));
      const secs = `${r.seconds.toFixed(1)} s`;
      let detail;
      if (r.timedOut) detail = `the guard run timed out after ${LIMIT / 1000} s (PTB_MUTANT_TIMEOUT) and was killed`;
      else if (hit) detail = `exit ${r.code}, ${fails.length} FAIL line(s), ${secs}. Caught by: ${hit.slice(5, 200).replace(/\s+/g, " ")}`;
      else if (r.code === 0) detail = `the guard PASSED on the mutant (${secs}): it does not notice "${m.id}" being undone`;
      else detail = `exit ${r.code}, ${secs}, but no FAIL line matches ${g.fails}; the guard failed for some other reason. FAIL lines: ${JSON.stringify(fails.slice(0, 3).map((l) => l.slice(0, 140)))}` +
        (fails.length ? "" : `; output tail: ${JSON.stringify(r.out.trim().split(/\r?\n/).slice(-3).join(" | ").slice(0, 300))}`);
      M.check(`${m.id}: ${g.file} fails on the mutant`, !r.timedOut && r.code === 1 && !!hit, detail);
    }
  }
});
