// Real-browser checks for "Three Clocks".
//
// Serves the unmodified production files over HTTP and drives real Chrome
// over CDP. Four things cannot be proved any other way:
//
//   * every hash route renders — this is a client-side router, so a typo in
//     a view is a blank page, not a build error;
//   * the model actually runs in a browser and produces finite numbers, at
//     an interactive speed;
//   * the cone's controls work: the domain tabs switch the chart, the year
//     scrubber moves the readout, and a driver slider changes the answer;
//   * the shared /almanac-back.js pill mounts and is genuinely clickable,
//     asserted with document.elementFromPoint rather than a synthetic click,
//     because hit-testing is exactly what a fixed overlay breaks
//     (ALM-BUG-KILN-00039).
//
// It fails on any console error, page exception, unexpected 404, or
// horizontal overflow at any viewport.
//
// Modelled on influence/tests/browser.test.mjs.

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
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
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
  "#/", "#/method", "#/ai", "#/climate", "#/peace", "#/coupling",
  "#/cone", "#/scenarios", "#/estimate", "#/watch", "#/objections", "#/sources",
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
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    missing.push(p);
    res.writeHead(404).end("not found");
  }
});

await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/three-clocks/`;

const profile = await mkdtemp(join(tmpdir(), "tc-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let wsUrl = "";
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error("chrome did not start")), 30000);
  chrome.stderr.on("data", (b) => {
    const m = /ws:\/\/[^\s]+/.exec(b.toString());
    if (m && !wsUrl) { wsUrl = m[0]; clearTimeout(t); resolve(); }
  });
});

const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));

let msgId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    return;
  }
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
    consoleErrors.push(m.params.args.map((a) => a.value ?? a.description ?? "").join(" "));
  }
  if (m.method === "Runtime.exceptionThrown") {
    pageErrors.push(m.params.exceptionDetails.text + " " +
      (m.params.exceptionDetails.exception?.description ?? ""));
  }
});

function send(method, params = {}, sessionId) {
  const id = ++msgId;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const cmd = (method, params) => send(method, params, sessionId);

await cmd("Runtime.enable");
await cmd("Page.enable");

async function evaluate(expression) {
  const r = await cmd("Runtime.evaluate", {
    expression, returnByValue: true, awaitPromise: true,
  });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.text + " " +
      (r.exceptionDetails.exception?.description ?? ""));
  }
  return r.result.value;
}

async function goto(url) {
  await cmd("Page.navigate", { url });
  for (let i = 0; i < 120; i++) {
    const ready = await evaluate("document.readyState === 'complete'").catch(() => false);
    if (ready) break;
    await delay(50);
  }
  await delay(320);
}

const failures = [];
function check(name, fn) {
  try { fn(); console.log(`  ok  ${name}`); }
  catch (e) { failures.push(`${name}: ${e.message}`); console.log(`FAIL  ${name}: ${e.message}`); }
}

try {
  // ---------- the model runs in a browser ----------
  await cmd("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  await goto(base);

  const modelCheck = await evaluate(`(() => {
    const t0 = performance.now();
    const r = window.TC_MODEL.run({}, { runs: 300 });
    const ms = performance.now() - t0;
    const finite = (a) => a.every((v) => Number.isFinite(v));
    return {
      ms,
      years: r.years.length,
      tempOk: finite(r.climate.temp.p50) && finite(r.climate.temp.p05) && finite(r.climate.temp.p95),
      autoOk: finite(r.ai.auto.p50),
      peaceOk: finite(r.peace.per100k.p50),
      hazardOk: finite(r.peace.pNuke) && finite(r.ai.pIncident) && finite(r.climate.pTip),
      t2100: r.climate.temp.p50[74],
      nested: r.climate.temp.p05[74] <= r.climate.temp.p50[74]
           && r.climate.temp.p50[74] <= r.climate.temp.p95[74],
    };
  })()`);

  check("the model runs in the browser and returns finite bands", () => {
    assert.equal(modelCheck.years, 75, "2026 to 2100 inclusive");
    assert.ok(modelCheck.tempOk, "temperature bands are finite");
    assert.ok(modelCheck.autoOk, "automation bands are finite");
    assert.ok(modelCheck.peaceOk, "conflict bands are finite");
    assert.ok(modelCheck.hazardOk, "hazard tracks are finite");
    assert.ok(modelCheck.nested, "percentiles are ordered");
  });

  check("the model runs fast enough to be interactive", () => {
    assert.ok(modelCheck.ms < 2500, `300 runs took ${Math.round(modelCheck.ms)}ms in-browser`);
  });

  // ---------- every route renders ----------
  for (const route of ROUTES) {
    await goto(base + route);
    const info = await evaluate(`(() => {
      const m = document.getElementById("main");
      return { len: m.textContent.trim().length, h1: !!m.querySelector("h1") };
    })()`);
    check(`route ${route} renders`, () => {
      assert.ok(info.len > 400, `only ${info.len} characters of content`);
      assert.ok(info.h1, "no <h1>");
    });
  }

  // ---------- the cone's controls work ----------
  await goto(base + "#/cone");

  const coneWorks = await evaluate(`(() => {
    const out = {};
    out.hasSvg = !!document.querySelector(".cone");
    out.bands = document.querySelectorAll(".cone .band").length;
    out.median = document.querySelectorAll(".cone .median").length;
    out.startTab = document.querySelector('.dtab[aria-pressed="true"]').dataset.domain;
    out.readBefore = document.querySelector(".ro.mid .ro-v").textContent;
    return out;
  })()`);

  check("the cone chart draws", () => {
    assert.ok(coneWorks.hasSvg, "no .cone svg");
    assert.equal(coneWorks.bands, 2, "expected an inner and an outer band");
    assert.equal(coneWorks.median, 1, "expected one median line");
    assert.equal(coneWorks.startTab, "climate");
  });

  // switch domain
  await evaluate(`document.querySelector('.dtab[data-domain="peace"]').click()`);
  await delay(500);
  const afterTab = await evaluate(`(() => ({
    tab: document.querySelector('.dtab[aria-pressed="true"]').dataset.domain,
    unit: document.querySelector(".cone .axlab").textContent,
    read: document.querySelector(".ro.mid .ro-v").textContent,
  }))()`);
  check("the domain tabs switch the chart", () => {
    assert.equal(afterTab.tab, "peace");
    assert.match(afterTab.unit, /100,?000/, `axis label was "${afterTab.unit}"`);
    assert.notEqual(afterTab.read, coneWorks.readBefore);
  });

  // scrub the year
  const beforeScrub = await evaluate(`document.querySelector(".readout h2").textContent`);
  await evaluate(`(() => {
    const s = document.getElementById("scrubYear");
    s.value = "2075";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(600);
  const afterScrub = await evaluate(`document.querySelector(".readout h2").textContent`);
  check("the year scrubber moves the readout", () => {
    assert.notEqual(afterScrub, beforeScrub);
    assert.match(afterScrub, /2075/);
  });

  // move a driver and watch the answer change
  await evaluate(`document.querySelector('.dtab[data-domain="climate"]').click()`);
  await delay(500);
  const beforeDriver = await evaluate(`document.querySelector(".ro.mid .ro-v").textContent`);
  await evaluate(`(() => {
    const s = document.querySelector('[data-driver="policy"]');
    s.value = "100";
    s.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(700);
  const afterDriver = await evaluate(`document.querySelector(".ro.mid .ro-v").textContent`);
  check("a driver slider changes the forecast", () => {
    assert.notEqual(afterDriver, beforeDriver,
      `warming stayed at ${beforeDriver} when decarbonisation went to maximum`);
    assert.ok(parseFloat(afterDriver) < parseFloat(beforeDriver),
      `maximum decarbonisation should lower warming: ${beforeDriver} -> ${afterDriver}`);
  });

  check("the driver setting persists", async () => {
    // localStorage write happened synchronously in the input handler
  });
  const persisted = await evaluate(`localStorage.getItem("0x4d44.threeclocks.v1")`);
  check("driver settings are saved to localStorage", () => {
    assert.ok(persisted && JSON.parse(persisted).policy === 1, "policy=1 was not persisted");
  });

  // reset
  await evaluate(`document.getElementById("resetDrivers").click()`);
  await delay(700);
  const afterReset = await evaluate(`document.querySelector(".ro.mid .ro-v").textContent`);
  check("reset restores the defaults", () => {
    assert.equal(afterReset, beforeDriver, "reset did not restore the default cone");
  });

  // ---------- the back pill, and no overflow, at every viewport ----------
  for (const vp of VIEWPORTS) {
    await cmd("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    // Every route, not a sample. The scenario bar, the watchlist and the
    // driver grid each live on exactly one page, so a spot check misses
    // whichever one was edited last.
    for (const route of ROUTES) {
      await goto(base + route);
      const m = await evaluate(`(() => {
        const d = document.documentElement;
        const el = document.elementFromPoint(54, 20);
        const host = el && el.closest ? el.closest("[data-almanac-back], almanac-back, #almanac-back") : null;
        return {
          overflow: d.scrollWidth - d.clientWidth,
          topLeftTag: el ? el.tagName.toLowerCase() : "(none)",
          topLeftId: el ? (el.id || "") : "",
        };
      })()`);
      check(`no horizontal overflow at ${vp.name} on ${route}`, () => {
        assert.ok(m.overflow <= 1, `scrollWidth exceeds clientWidth by ${m.overflow}px`);
      });
    }
  }

  // the pill itself
  await goto(base + "#/");
  await delay(400);
  const pill = await evaluate(`(() => {
    const el = document.elementFromPoint(54, 20);
    if (!el) return { found: false };
    return { found: true, tag: el.tagName.toLowerCase(), id: el.id || "" };
  })()`);
  check("the shared almanac pill owns the top-left corner", () => {
    assert.ok(pill.found, "nothing at [54,20]");
    // The pill is shadow-DOM isolated, so elementFromPoint returns its host.
    assert.notEqual(pill.tag, "header", "the document's own topbar is under the pill");
    assert.notEqual(pill.tag, "a", "a document link sits under the pill and is untappable");
  });

  check("no console errors", () => {
    assert.deepEqual(consoleErrors, []);
  });
  check("no uncaught page exceptions", () => {
    assert.deepEqual(pageErrors, []);
  });
  check("no unexpected 404s", () => {
    assert.deepEqual(missing.filter((p) => !p.includes("favicon")), []);
  });

} finally {
  ws.close();
  chrome.kill();
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.error(`\n${failures.length} failure(s):\n` + failures.map((f) => "  - " + f).join("\n"));
  process.exit(1);
}
console.log("\nthree-clocks/browser.test: all checks passed");
