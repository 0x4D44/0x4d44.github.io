// The reporter every plan-to-build test file uses, so every file prints the same lines and ends the same way:
//   PASS name   detail            a check that held
//   FAIL name   detail            a check that did not (exit code 1)
//   WARN name   detail            a report-only check that did not hold (does not fail the run)
//   INFO text                     context (not counted)
//   SKIP suite: why               the whole file was skipped on purpose (not counted as a pass)
//   ALL 20 PASS | FAILURES (3 of 20) | SKIPPED (why)
//   RESULT {json}                 one machine-readable line, for run.mjs
import "./lowprio.mjs";                                    // first: idle priority and windowsHide for this process and everything it starts
import { tmpdir } from "node:os";
import { allowNoChrome, chromeLookup } from "./chrome.mjs";

// Run from the temp folder: a test never pins the folder it was started from (a worktree that has to be removed later).
try { process.chdir(tmpdir()); } catch { /* keep the caller's folder */ }

export function suite(name) {
  const st = { total: 0, pass: 0, fail: 0, warn: 0, skip: 0 };
  let skipReason = "";
  const line = (tag, text, detail) => console.log(`${tag} ${text}${detail ? "   " + detail : ""}`);
  const S = {
    name, st,
    check(text, ok, detail = "") {
      st.total++; ok ? st.pass++ : st.fail++;
      line(ok ? "PASS" : "FAIL", text, detail);
      return !!ok;
    },
    // A check that only reports unless `strict`: a WARN line when it does not hold (it still counts in the total).
    soft(text, ok, detail = "", strict = false) {
      st.total++;
      if (ok) { st.pass++; line("PASS", text, detail); }
      else if (strict) { st.fail++; line("FAIL", text, detail); }
      else { st.warn++; line("WARN", text, `${detail}   (report only; PTB_STRICT_TIMING=1 makes it fail)`); }
      return !!ok;
    },
    // An advisory line outside the checks: it is not counted in the total and does not fail the run.
    warn(text, detail = "") { st.warn++; line("WARN", text, detail); },
    info(text) { console.log(`INFO ${text}`); },
    heading(text) { console.log(`--- ${text}`); },
    skip(reason) { st.skip++; skipReason = reason; console.log(`SKIP ${name}: ${reason}`); },
    // true when a Chrome is there. Otherwise this is a FAILURE (a guard that silently skips is a guard that is off), unless PTB_ALLOW_NO_CHROME=1.
    needChrome() {
      const r = chromeLookup();
      if (r.path) return true;
      if (allowNoChrome()) { S.skip(`${r.why}; skipped on purpose (PTB_ALLOW_NO_CHROME=1)`); return false; }
      S.check("a Chrome or Chromium is installed", false, `${r.why}. Install Chrome, or set CHROME_PATH=<binary>, or set PTB_ALLOW_NO_CHROME=1 to skip the browser tests on purpose`);
      return false;
    },
    finish() {
      if (st.skip && !st.total) console.log(`\nSKIPPED (${skipReason})`);
      else if (st.fail) console.log(`\nFAILURES (${st.fail} of ${st.total})`);
      else console.log(`\nALL ${st.pass} PASS${st.warn ? `, ${st.warn} WARN (report only)` : ""}`);
      console.log("RESULT " + JSON.stringify({ suite: name, total: st.total, pass: st.pass, fail: st.fail, warn: st.warn, skip: st.skip, skipReason }));
      process.exitCode = st.fail ? 1 : 0;
      setTimeout(() => process.exit(process.exitCode), 5000).unref();          // a handle left open must not hang the run
      return process.exitCode;
    },
    // Runs fn(S); an exception is a failed check (not a stack trace and no summary), and the summary always prints.
    async run(fn) {
      try { await fn(S); }
      catch (e) { S.check("the checks ran to the end", false, String((e && e.message) || e).replace(/\s+/g, " ").slice(0, 400)); }
      return S.finish();
    },
  };
  return S;
}

// console messages that count as a problem: errors, exceptions, warnings; `ignore` is a RegExp for the known noise
export const problems = (page, ignore = /$^/) => page.logs.filter((l) => l.type !== "log" && l.type !== "info" && l.type !== "debug" && !ignore.test(l.text || ""));
// the harder subset: exceptions, console errors and failed requests
export const hardLogs = (page) => page.logs.filter((l) => l.type === "exception" || l.type === "error" || l.type === "assert" || l.type === "netfail" || /^log\.error/.test(l.type));
export const until = async (fn, ms = 30000, step = 100) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn().catch(() => false);
    if (v) return v;
    if (Date.now() - t0 > ms) return false;
    await new Promise((r) => setTimeout(r, step));
  }
};
