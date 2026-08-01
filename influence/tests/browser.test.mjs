// Real-browser checks for "Click, Whirr".
//
// Serves the unmodified production files over HTTP and drives real Chrome over
// CDP. Three things cannot be proved any other way:
//
//   * every hash route actually renders — this is a client-side router, so a
//     typo in a view is a blank page, not a build error;
//   * the shared /almanac-back.js pill mounts and is genuinely clickable,
//     asserted with document.elementFromPoint rather than a synthetic click,
//     because hit-testing is exactly what a fixed overlay breaks
//     (ALM-BUG-KILN-00039);
//   * the document's own top-left controls never land under that pill.
//
// It also drives each interactive (lab, quiz, chart, bench, contrast) and
// fails on any console error, page exception, unexpected 404, or horizontal
// overflow at any viewport.
//
// Modelled on arran-deep-time/browser.test.mjs.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH
  ?? [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/opt/pw-browsers/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => existsSync(p));

if (!CHROME) {
  console.log("browser.test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon",
};

const ROUTES = [
  "#/", "#/click-whirr", "#/principles", "#/pre-suasion", "#/lab",
  "#/machines", "#/defence", "#/ledger", "#/quiz", "#/glossary", "#/sources",
  "#/principle/reciprocity", "#/principle/commitment", "#/principle/social-proof",
  "#/principle/liking", "#/principle/authority", "#/principle/scarcity",
  "#/principle/unity",
];

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000, mobile: false },
  { name: "tablet", width: 768, height: 1024, mobile: false },
  { name: "mobile", width: 390, height: 844, mobile: true },
];

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const missing = [];

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://local").pathname);
  const path = resolve(ROOT, (p.endsWith("/") ? `${p}index.html` : p).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
  } catch {
    missing.push(p);
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));

const profile = await mkdtemp(join(tmpdir(), "influence-"));
const chrome = spawn(CHROME, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-background-networking", "--force-prefers-reduced-motion", "about:blank",
], { detached: true, stdio: "ignore" });

let failed = null;
const cleanup = async () => {
  try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* already gone */ }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
};
const die = async (msg) => { failed = msg; await cleanup(); console.error(`FAIL: ${msg}`); process.exit(1); };

let wsUrl;
for (let i = 0; i < 300; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; }
  catch { await delay(100); }
}
if (!wsUrl) await die("Chrome did not expose a debugging endpoint");

const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let msgId = 0;
const pending = new Map();
const problems = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    problems.push("console.error: " + m.params.args.map((a) => a.value ?? a.description ?? "?").join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    problems.push("exception: " + (d.exception?.description ?? d.text));
  }
  if (!m.id || !pending.has(m.id)) return;
  const { res, rej } = pending.get(m.id);
  pending.delete(m.id);
  m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
};
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => { const id = ++msgId; pending.set(id, { res, rej }); sock.send(JSON.stringify({ id, method, params, sessionId })); });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable");
await S("Runtime.enable");

const evaluate = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
};

const settle = async () => {
  for (let i = 0; i < 80; i++) {
    if (await evaluate('document.readyState === "complete"')) break;
    await delay(100);
  }
  await delay(220);
};

const OVERFLOW = "document.documentElement.scrollWidth - document.documentElement.clientWidth";

// Nothing tappable may sit under the fixed "← Almanac" pill.
const UNDER_PILL = `(() => {
  const de = document.documentElement;
  de.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  const host = [...de.querySelectorAll("*")].find(e => e.shadowRoot && e.shadowRoot.querySelector("a"));
  if (!host) return ["pill did not mount"];
  const b = host.getBoundingClientRect();
  const out = [];
  for (const el of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
    if (host.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const ow = Math.min(r.right, b.right) - Math.max(r.left, b.left);
    const oh = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    if (ow < 6 || oh < 6) continue;
    out.push(el.tagName.toLowerCase() + ": " + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40));
  }
  return out;
})()`;

// ---- 1. every route renders at every viewport, without overflow ----

for (const vp of VIEWPORTS) {
  await S("Emulation.setDeviceMetricsOverride", {
    width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
  });
  for (const route of ROUTES) {
    await S("Page.navigate", { url: `${base}/influence/${route}` });
    await settle();

    const info = await evaluate(`(() => {
      const m = document.getElementById("main");
      return { len: m ? m.textContent.trim().length : -1, h1: !!m?.querySelector("h1"), title: document.title };
    })()`);
    if (info.len < 300) await die(`${route} @ ${vp.name}: rendered only ${info.len} characters of text`);
    if (!info.h1) await die(`${route} @ ${vp.name}: no <h1>`);
    if (!/Click, Whirr/.test(info.title)) await die(`${route}: document.title not set (${info.title})`);

    const over = await evaluate(OVERFLOW);
    if (over > 1) await die(`${route} @ ${vp.name}: scrolls sideways by ${over}px`);
  }
}

// ---- 2. the back pill mounts, is clickable, and covers nothing ----

await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
for (const route of ["#/", "#/lab", "#/machines", "#/principle/unity"]) {
  await S("Page.navigate", { url: `${base}/influence/${route}` });
  await settle();
  const covered = await evaluate(UNDER_PILL);
  if (covered.length) await die(`${route}: under the almanac pill → ${covered.join(" | ")}`);

  const hit = await evaluate(`(() => {
    const host = document.getElementById("almanac-back-host");
    if (!host) return "no pill";
    const b = host.getBoundingClientRect();
    const el = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    return el === host ? "ok" : "blocked by " + (el ? el.tagName : "nothing");
  })()`);
  if (hit !== "ok") await die(`${route}: the almanac pill is not clickable — ${hit}`);
}

// ---- 3. the interactives actually work ----

await S("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

// lab: lock in a prediction and get a reveal
await S("Page.navigate", { url: `${base}/influence/#/lab` });
await settle();
const lab = await evaluate(`(() => {
  const card = document.querySelector("[data-lab]");
  const range = card.querySelector("input[type=range]");
  range.value = 20;
  range.dispatchEvent(new Event("input", { bubbles: true }));
  const shown = card.querySelector(".guess-val").textContent;
  card.querySelector("[data-commit]").click();
  const out = card.querySelector(".lab-result");
  return { shown, revealed: !out.hidden, hasVerdict: !!out.querySelector(".verdict"), bars: out.querySelectorAll(".bar-fill").length };
})()`);
if (lab.shown !== "20%") await die(`lab: slider readout did not track the input (${lab.shown})`);
if (!lab.revealed || !lab.hasVerdict) await die("lab: locking in a prediction did not reveal the result");
if (lab.bars !== 3) await die(`lab: expected baseline/guess/actual bars, got ${lab.bars}`);

// the prediction persists across a reload
await S("Page.navigate", { url: `${base}/influence/#/lab` });
await S("Page.reload");
await settle();
const persisted = await evaluate(`!document.querySelector("[data-lab] .lab-result").hidden`);
if (!persisted) await die("lab: a locked-in prediction did not survive a reload");

// quiz: a right answer scores and advances
await S("Page.navigate", { url: `${base}/influence/#/quiz` });
await settle();
const quiz = await evaluate(`(() => {
  const want = window.QUIZ[0].answer;
  document.querySelector('[data-pick="' + want + '"]').click();
  const why = document.querySelector(".qwhy");
  const right = document.querySelector(".qopt.right");
  document.querySelector("[data-next]").click();
  return { explained: !why.hidden, marked: !!right, progressed: document.querySelector(".qprog").textContent };
})()`);
if (!quiz.explained || !quiz.marked) await die("quiz: a correct answer was not marked or explained");
if (!/2 \/ /.test(quiz.progressed) || !/SCORE 1/.test(quiz.progressed)) {
  await die(`quiz: did not score and advance (${quiz.progressed})`);
}

// machines: the chart toggles between rounds, and the bench swaps framing
await S("Page.navigate", { url: `${base}/influence/#/machines` });
await settle();
const chart = await evaluate(`(() => {
  const rows2025 = document.querySelectorAll("#ai-chart-rows .chart-row").length;
  const first = document.querySelector("#ai-chart-rows .chart-fill.trt").getAttribute("data-w");
  document.querySelector('[data-round="2026"]').click();
  const after = document.querySelector("#ai-chart-rows .chart-fill.trt").getAttribute("data-w");
  return { rows2025, first, after };
})()`);
if (chart.rows2025 !== 7) await die(`machines: expected seven chart rows, got ${chart.rows2025}`);
if (chart.first === chart.after) await die("machines: switching study round did not change the data");

const bench = await evaluate(`(() => {
  const before = document.getElementById("bench-shape").textContent;
  document.querySelector('[data-frame="authority"]').click();
  const after = document.getElementById("bench-shape").textContent;
  return { changed: before !== after, hasPlaceholder: /\\[request\\]/.test(after), read: document.getElementById("bench-read").textContent };
})()`);
if (!bench.changed) await die("machines: the framing bench did not change on selection");
if (!bench.hasPlaceholder) await die("machines: a framing skeleton lost its [request] placeholder");
// The readout must carry this principle's own published pair, not a stale one:
// authority ran 32% control → 72% treatment in the 2025 round.
if (!bench.read.includes("72") || !bench.read.includes("32")) {
  await die(`machines: the bench readout does not show authority's 2025 pair (72% vs 32%) — got "${bench.read.slice(0, 120)}"`);
}

// click-whirr: the contrast demo responds
await S("Page.navigate", { url: `${base}/influence/#/click-whirr` });
await settle();
const contrast = await evaluate(`(() => {
  const bar = document.getElementById("contrast-bar");
  const before = bar.style.width;
  document.querySelector('[data-anchor="600"]').click();
  return { before, after: bar.style.width, word: document.getElementById("contrast-word").textContent };
})()`);
if (contrast.before === contrast.after) await die("click-whirr: the contrast demo did not respond");

// defence: the audit checkbox persists
await S("Page.navigate", { url: `${base}/influence/#/defence` });
await settle();
await evaluate(`document.querySelector("[data-audit]").click()`);
await S("Page.reload");
await settle();
const audited = await evaluate(`document.querySelector("[data-audit]").checked`);
if (!audited) await die("defence: the self-audit did not persist across a reload");

// ---- 4. navigating repeatedly must not stack listeners ----

await S("Page.navigate", { url: `${base}/influence/#/` });
await settle();
const doubleFire = await evaluate(`(async () => {
  localStorage.removeItem("influence.lab.v1");
  const go = (h) => new Promise(r => { location.hash = h; setTimeout(r, 180); });
  for (let i = 0; i < 3; i++) { await go("#/lab"); await go("#/"); }
  await go("#/lab");
  const card = document.querySelector("[data-lab]");
  card.querySelector("input[type=range]").value = 30;
  card.querySelector("[data-commit]").click();
  return document.querySelectorAll("[data-lab] .lab-result:not([hidden])").length;
})()`);
if (doubleFire !== 1) await die(`router: revisiting the lab stacked handlers (${doubleFire} results opened by one click)`);

// ---- 5. nothing went wrong along the way ----

if (missing.length) await die(`requests for files that do not exist: ${[...new Set(missing)].join(", ")}`);
if (problems.length) await die(`console problems:\n  ${[...new Set(problems)].join("\n  ")}`);

await cleanup();
if (!failed) console.log(`browser.test: ok — ${ROUTES.length} routes × ${VIEWPORTS.length} viewports, interactives and pill verified`);
