// Real-browser behavioural regression checks for The Long Instruction.
// Serves the unmodified production files, drives Chrome over CDP, exercises
// every instrument, and checks both wide and phone layouts.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH ?? [
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((candidate) => existsSync(candidate));

if (!CHROME) {
  console.log("x86 browser test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon",
};
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
const missing = [];

const server = createServer(async (request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://local").pathname);
  const path = resolve(ROOT, (pathname.endsWith("/") ? `${pathname}index.html` : pathname).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { response.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  } catch {
    // Browsers may request a favicon; the application itself must not miss.
    if (pathname !== "/favicon.ico") missing.push(pathname);
    response.writeHead(404).end("not found");
  }
});
await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
const base = `http://127.0.0.1:${server.address().port}/x86-evolution/`;

const profile = await mkdtemp(join(tmpdir(), "x86-evolution-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run",
  "--disable-background-networking", "--force-prefers-reduced-motion",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let wsUrl = "";
await new Promise((resolveStart, rejectStart) => {
  const timeout = setTimeout(() => rejectStart(new Error("Chrome did not start")), 30_000);
  chrome.stderr.on("data", (chunk) => {
    const match = /ws:\/\/[^\s]+/.exec(chunk.toString());
    if (match && !wsUrl) { wsUrl = match[0]; clearTimeout(timeout); resolveStart(); }
  });
  chrome.once("exit", (code) => {
    if (!wsUrl) { clearTimeout(timeout); rejectStart(new Error(`Chrome exited before CDP was ready (${code})`)); }
  });
});

const socket = new WebSocket(wsUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener("open", resolveOpen, { once: true });
  socket.addEventListener("error", rejectOpen, { once: true });
});

let messageId = 0;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
socket.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    const { resolveMessage, rejectMessage } = pending.get(message.id);
    pending.delete(message.id);
    message.error ? rejectMessage(new Error(JSON.stringify(message.error))) : resolveMessage(message.result);
    return;
  }
  if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
    consoleErrors.push(message.params.args.map((arg) => arg.value ?? arg.description ?? "").join(" "));
  }
  if (message.method === "Runtime.exceptionThrown") {
    pageErrors.push(message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text);
  }
});

function send(method, params = {}, sessionId) {
  const id = ++messageId;
  return new Promise((resolveMessage, rejectMessage) => {
    pending.set(id, { resolveMessage, rejectMessage });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const command = (method, params) => send(method, params, sessionId);
await command("Runtime.enable");
await command("Page.enable");

async function evaluate(expression) {
  const result = await command("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result.value;
}

async function navigate(url) {
  await command("Page.navigate", { url });
  for (let index = 0; index < 150; index += 1) {
    const ready = await evaluate("document.readyState === 'complete' && document.documentElement.dataset.appReady === 'true'").catch(() => false);
    if (ready) break;
    await delay(40);
  }
  await delay(180);
}

const failures = [];
function check(name, callback) {
  try { callback(); console.log(`  ok  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`FAIL  ${name}: ${error.message}`); }
}

try {
  for (const viewport of [
    { name: "desktop", width: 1440, height: 1000, mobile: false },
    { name: "mobile", width: 390, height: 844, mobile: true },
  ]) {
    await command("Emulation.setDeviceMetricsOverride", {
      width: viewport.width, height: viewport.height, deviceScaleFactor: 1, mobile: viewport.mobile,
    });
    await navigate(`${base}?selftest=1`);

    const boot = await evaluate(`(() => {
      const host = [...document.documentElement.querySelectorAll("*")].find((node) => node.shadowRoot?.querySelector("a"));
      const buried = [];
      if (host) {
        const back = host.getBoundingClientRect();
        for (const control of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
          const rect = control.getBoundingClientRect();
          if (rect.width <= 0 || rect.height <= 0) continue;
          const overlapWidth = Math.min(rect.right, back.right) - Math.max(rect.left, back.left);
          const overlapHeight = Math.min(rect.bottom, back.bottom) - Math.max(rect.top, back.top);
          if (overlapWidth >= 6 && overlapHeight >= 6) buried.push((control.textContent || control.id || control.tagName).trim().slice(0, 40));
        }
      }
      return {
        selftest: document.documentElement.dataset.selftest,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        host: !!host,
        buried,
        sourceCount: document.querySelectorAll("#source-list li").length,
      };
    })()`);
    check(`${viewport.name}: application self-test passes`, () => assert.equal(boot.selftest, "pass"));
    check(`${viewport.name}: no page-level horizontal overflow`, () => assert.ok(boot.overflow <= 1, `${boot.overflow}px`));
    check(`${viewport.name}: shared Almanac control mounts`, () => assert.equal(boot.host, true));
    check(`${viewport.name}: no control is buried under the Almanac pill`, () => assert.deepEqual(boot.buried, []));
    check(`${viewport.name}: source ledger renders`, () => assert.ok(boot.sourceCount >= 10));

    const panelResults = await evaluate(`(() => {
      const out = [];
      for (const button of document.querySelectorAll("[data-tab]")) {
        button.click();
        const panel = document.getElementById("panel-" + button.dataset.tab);
        out.push({ name: button.dataset.tab, hidden: panel.hidden, text: panel.textContent.trim().length });
      }
      return out;
    })()`);
    for (const panel of panelResults) {
      check(`${viewport.name}: ${panel.name} panel renders`, () => {
        assert.equal(panel.hidden, false);
        assert.ok(panel.text > 350, `${panel.text} characters`);
      });
    }
  }

  await command("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await navigate(base);

  const keyboardTabs = await evaluate(`(() => {
    const first = document.querySelector('[data-tab="lineage"]');
    first.click();
    first.focus();
    first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    const selected = document.querySelector('[data-tab][aria-selected="true"]');
    return {
      selected: selected?.dataset.tab,
      focused: document.activeElement?.dataset?.tab,
      panelVisible: !document.getElementById("panel-decode").hidden,
      hash: location.hash,
    };
  })()`);
  check("tab strip follows the ARIA keyboard pattern", () => {
    assert.deepEqual(keyboardTabs, { selected: "decode", focused: "decode", panelVisible: true, hash: "#decode" });
  });

  const decoderCorpus = await evaluate(`(() => {
    const select = document.getElementById("decode-preset");
    return window.X86_DATA.decodePresets.map((preset) => {
      select.value = preset.id;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        id: preset.id,
        expected: preset.expected,
        actual: document.getElementById("decoded-assembly").textContent,
        bytes: document.querySelectorAll("#byte-ribbon .byte-token").length,
      };
    });
  })()`);
  check("decoder corpus recognises every published byte sequence", () => {
    const wrong = decoderCorpus.filter((item) => item.actual !== item.expected || item.bytes < 2);
    assert.deepEqual(wrong, []);
  });

  const decoder = await evaluate(`(() => {
    const select = document.getElementById("decode-preset");
    select.value = "sse2";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return {
      assembly: document.getElementById("decoded-assembly").textContent,
      fields: document.querySelectorAll("#byte-ribbon .byte-token").length,
      sibMuted: document.getElementById("sib-diagram").classList.contains("is-muted"),
    };
  })()`);
  check("decoder recognises an SSE2 mandatory-prefix opcode", () => {
    assert.equal(decoder.assembly, "ADDPD XMM0, XMM1");
    assert.equal(decoder.fields, 4);
    assert.equal(decoder.sibMuted, true);
  });

  const scheduler = await evaluate(`(() => {
    document.querySelector('[data-scheduler-model="p6"]').click();
    const select = document.getElementById("scheduler-program");
    select.value = "mixed";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const items = window.__X86_APP__.getState().schedulerResult.items;
    return items.map(({ issue, complete, deps }) => ({ issue, complete, deps }));
  })()`);
  check("P6 model preserves true RAW dependencies", () => {
    assert.ok(scheduler[1].issue >= scheduler[0].complete, JSON.stringify(scheduler));
    assert.ok(scheduler[2].issue >= scheduler[1].complete, JSON.stringify(scheduler));
  });
  check("P6 model lets independent younger work pass", () => {
    assert.ok(scheduler[5].issue < scheduler[1].issue, JSON.stringify(scheduler));
  });

  const renamed = await evaluate(`(() => {
    const select = document.getElementById("scheduler-program");
    select.value = "falseDeps";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return window.__X86_APP__.getState().schedulerResult.items.map(({ issue, complete, deps }) => ({ issue, complete, deps }));
  })()`);
  check("P6 renaming removes false WAR and WAW dependencies", () => {
    assert.ok(renamed[2].issue < renamed[1].issue, JSON.stringify(renamed));
    assert.ok(renamed[4].issue < renamed[1].issue, JSON.stringify(renamed));
    assert.deepEqual(renamed[2].deps, []);
    assert.deepEqual(renamed[4].deps, []);
  });
  check("renaming still binds each reader to the right producer", () => {
    assert.deepEqual(renamed[1].deps, [0]);
    assert.deepEqual(renamed[3].deps, [2]);
    assert.ok(renamed[1].issue >= renamed[0].complete, JSON.stringify(renamed));
    assert.ok(renamed[3].issue >= renamed[2].complete, JSON.stringify(renamed));
  });

  const branch = await evaluate(`(() => {
    document.getElementById("branch-reset").click();
    document.getElementById("branch-run").click();
    return {
      count: Number(document.getElementById("branch-count").textContent),
      beads: document.querySelectorAll("#branch-stream .branch-bead").length,
      accuracy: document.getElementById("branch-accuracy").textContent,
    };
  })()`);
  check("branch predictor resolves a 32-branch run", () => {
    assert.equal(branch.count, 32);
    assert.equal(branch.beads, 32);
    assert.match(branch.accuracy, /^\d+%$/);
  });

  const cache = await evaluate(`(() => {
    const pattern = document.getElementById("cache-pattern");
    pattern.value = "conflict"; pattern.dispatchEvent(new Event("change", { bubbles: true }));
    const conflict = Number(document.getElementById("cache-hits").textContent);
    pattern.value = "working"; pattern.dispatchEvent(new Event("change", { bubbles: true }));
    const working = Number(document.getElementById("cache-hits").textContent);
    return { conflict, working, columns: document.querySelectorAll("#cache-map .cache-set-column").length };
  })()`);
  check("cache model distinguishes conflict and working-set locality", () => {
    assert.ok(cache.working > cache.conflict, JSON.stringify(cache));
    assert.ok(cache.columns >= 12);
  });

  const pipeline = await evaluate(`(() => {
    document.getElementById("pipeline-cpu").value = "p4";
    document.getElementById("pipeline-program").value = "branch";
    document.getElementById("pipeline-mispredict").checked = true;
    document.getElementById("pipeline-cpu").dispatchEvent(new Event("change", { bubbles: true }));
    const state = window.__X86_APP__.getState().pipelineState;
    return { cycles: state.schedule.maxCycle, recovery: state.schedule.rows.some(r => r.recovery), cols: getComputedStyle(document.getElementById("pipeline-grid")).getPropertyValue("--cols") };
  })()`);
  check("deep-pipeline model shows wrong-path recovery", () => {
    assert.ok(pipeline.cycles >= 40, JSON.stringify(pipeline));
    assert.equal(pipeline.recovery, true);
  });

  const workload = await evaluate(`(() => {
    const slider = document.getElementById("workload-mispredicts");
    slider.value = "0"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    const low = Number(document.getElementById("workload-cycles").textContent.replace(/,/g, ""));
    slider.value = "50"; slider.dispatchEvent(new Event("input", { bubbles: true }));
    const high = Number(document.getElementById("workload-cycles").textContent.replace(/,/g, ""));
    return { low, high };
  })()`);
  check("workload model responds to branch quality", () => assert.ok(workload.high > workload.low, JSON.stringify(workload)));

  const backHit = await evaluate(`(() => {
    window.scrollTo(0, 0);
    const host = document.getElementById("almanac-back-host");
    const rect = host.getBoundingClientRect();
    return document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2) === host;
  })()`);
  check("the fixed Almanac pill wins real hit-testing", () => assert.equal(backHit, true));

  check("no application resource is missing", () => assert.deepEqual(missing, []));
  check("no console errors", () => assert.deepEqual(consoleErrors, []));
  check("no page exceptions", () => assert.deepEqual(pageErrors, []));
} finally {
  try { socket.close(); } catch { /* already closed */ }
  try { chrome.kill("SIGKILL"); } catch { /* already closed */ }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
}

if (failures.length) {
  console.error(`\nx86 browser test: ${failures.length} failure(s)`);
  failures.forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}
console.log("x86 browser test: all instruments and layouts passed.");
