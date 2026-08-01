import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const CHROME = process.env.CHROME_PATH ?? [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync) ?? "chrome";
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".wasm": "application/wasm", ".json": "application/json",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".darwin": "application/octet-stream",
};
const VIEWPORTS = [[1280, 860], [390, 844]];
const VECTORS = JSON.parse(await readFile(join(ROOT, "darwin-machine", "reports", "rng-vectors.json"), "utf8"));
const FIRST_VECTOR = VECTORS.worlds.find((vector) => vector.preset === "first-replicator" && vector.seed === 311991 && vector.updates === 10);
assert.ok(FIRST_VECTOR, "native determinism vector for the browser fixture is missing");
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
let stage = "starting";
let chrome;
let server;
let ws;
let cleaned = false;

function trace(text) { stage = text; process.stderr.write(`[darwin-machine] ${text}\n`); }
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch {}
  if (chrome?.pid) {
    try {
      if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
      else process.kill(-chrome.pid, "SIGKILL");
    } catch {}
  }
  try { server?.closeAllConnections?.(); } catch {}
  try { server?.close(); } catch {}
}
process.on("exit", cleanup);
const watchdog = setTimeout(() => {
  console.error(`Darwin Machine browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 150_000);
watchdog.unref?.();

async function poll(description, probe, timeout = 25_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(70);
  }
  throw new Error(`Timed out waiting for ${description}; last=${JSON.stringify(last)}`);
}
async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

try {
  trace("starting same-origin static server");
  server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    const pathname = decodeURIComponent(url.pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}/`) && !path.startsWith(`${ROOT}\\`)) {
      response.writeHead(403).end("forbidden"); return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream", "cache-control": "no-cache" });
      response.end(body);
    } catch {
      response.writeHead(404, { "content-type": "text/plain" }).end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const port = server.address().port;

  trace("launching headless Chrome");
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "darwin-machine-"));
  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--disable-component-update", "--disable-sync", "--disable-features=Translate",
    "about:blank",
  ], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"] });

  const wsUrl = await poll("Chrome debug endpoint", async () => {
    try { return (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { return null; }
  }, 40_000);
  ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = () => rejectOpen(new Error("CDP websocket failed")); });

  let id = 0;
  const pending = new Map();
  let pageErrors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { ok, fail } = pending.get(message.id); pending.delete(message.id);
      if (message.error) fail(new Error(JSON.stringify(message.error))); else ok(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const d = message.params.exceptionDetails;
      pageErrors.push(`exception: ${d.exception?.description ?? d.text}`);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      pageErrors.push(`console.error: ${message.params.args.map((arg) => arg.description ?? arg.value).join(" ")}`);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      if (!/favicon\.ico/i.test(`${entry.text} ${entry.url || ""}`)) pageErrors.push(`${entry.source}: ${entry.text}`);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    const commandId = ++id; pending.set(commandId, { ok, fail });
    ws.send(JSON.stringify({ id: commandId, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params = {}) => send(method, params, sessionId);
  await S("Page.enable"); await S("Runtime.enable"); await S("Log.enable"); await S("Network.enable");
  await S("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("darwin.intro.seen", "1"); } catch {}` });

  async function evaluate(expression) {
    const response = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
    return response.result.value;
  }

  for (const [width, height] of VIEWPORTS) {
    trace(`booting Rust/Wasm laboratory at ${width}x${height}`);
    pageErrors = [];
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 500 });
    await S("Page.navigate", { url: `http://127.0.0.1:${port}/darwin-machine/?preset=first-replicator&seed=311991` });
    await poll("Wasm Worker handshake", () => evaluate("window.__darwinReady === true && !!window.__darwinSummary"), 45_000);

    const boot = await evaluate(`(() => ({
      title: document.title,
      population: window.__darwinSummary.population,
      gridLength: window.__darwinGridLength,
      expectedGrid: window.__darwinSummary.width * window.__darwinSummary.height * 8,
      status: document.getElementById("engine-status").textContent,
      introHidden: document.getElementById("intro").hidden,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      canvas: [document.getElementById("dish").width, document.getElementById("dish").height],
    }))()`);
    assert.match(boot.title, /Darwin Machine/);
    assert.equal(boot.population, 1, `${width}: first-replicator must begin with one supplied founder`);
    assert.equal(boot.gridLength, boot.expectedGrid, `${width}: compact snapshot length mismatch`);
    assert.match(boot.status, /ready/);
    assert.equal(boot.introHidden, true, `${width}: persisted intro preference ignored`);
    assert.ok(boot.overflow <= 1, `${width}: page overflows horizontally by ${boot.overflow}px`);
    assert.ok(boot.canvas[0] > 100 && boot.canvas[1] > 100, `${width}: canvas has no rendered size`);

    // Native Rust generated this checksum. Reaching it through the browser
    // Worker and Wasm build proves the authoritative engine is byte-for-byte
    // deterministic across targets rather than merely deterministic in one.
    await evaluate(`window.__darwinTestRun(${FIRST_VECTOR.updates})`);
    const wasmVector = await poll("cross-target checksum vector", () => evaluate(`(() => {
      const s = window.__darwinSummary;
      return s && s.update === ${FIRST_VECTOR.updates} ? { checksum:s.checksum, population:s.population } : null;
    })()`), 12_000);
    assert.equal(wasmVector.checksum, FIRST_VECTOR.checksum, `${width}: native/Wasm checksum divergence`);
    assert.equal(wasmVector.population, FIRST_VECTOR.population, `${width}: native/Wasm population divergence`);
    await evaluate(`document.getElementById("reset").click()`);
    await poll("reset after determinism vector", () => evaluate(`window.__darwinSummary?.update === 0 && window.__darwinSummary?.population === 1`), 8_000);

    const controls = width < 500 ? ["play", "step", "reset", "lab"] : ["play", "step", "reset", "lab", "about", "save"];
    for (const control of controls) {
      const hit = await evaluate(`(() => {
        const el = document.getElementById(${JSON.stringify(control)}); el.scrollIntoView({block:"center"});
        const r = el.getBoundingClientRect();
        const target = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
        return { size:[r.width,r.height], hit: target === el || el.contains(target), covered: target?.id || target?.tagName };
      })()`);
      assert.ok(hit.size[0] >= 30 && hit.size[1] >= 30, `${width}: #${control} is too small`);
      assert.equal(hit.hit, true, `${width}: #${control} is covered by ${hit.covered}`);
    }

    await evaluate(`document.getElementById("play").click()`);
    const evolved = await poll("the supplied ancestor to reproduce", () => evaluate(`(() => {
      const s = window.__darwinSummary;
      return s && s.update >= 12 && s.population > 1 ? {update:s.update,population:s.population,checksum:s.checksum} : null;
    })()`), 35_000);
    assert.ok(evolved.population > 1, `${width}: exact replicator left no child`);
    await evaluate(`document.getElementById("play").click()`);

    const selected = await evaluate(`(() => {
      const canvas = document.getElementById("dish"); canvas.scrollIntoView({block:"center"});
      const r = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new PointerEvent("pointerdown", {clientX:r.left+r.width/2,clientY:r.top+r.height/2,bubbles:true}));
      return true;
    })()`);
    assert.equal(selected, true);
    await poll("organism debugger", () => evaluate(`!document.getElementById("inspector").hidden && /Organism/.test(document.getElementById("inspector-title").textContent)`), 8_000);
    const debug = await evaluate(`(() => ({
      bytes: document.querySelectorAll("#genome-bytes .byte").length,
      current: document.querySelectorAll("#disassembly tr.current").length,
      rows: document.querySelectorAll("#disassembly tr").length,
      meta: document.getElementById("inspector-meta").textContent,
    }))()`);
    assert.ok(debug.bytes >= 16, `${width}: genome bytes not rendered`);
    assert.equal(debug.current, 1, `${width}: disassembly has no unique current instruction`);
    assert.ok(debug.rows >= 16, `${width}: disassembly incomplete`);
    assert.match(debug.meta, /lineage/i);

    await evaluate(`document.getElementById("sandbox").click()`);
    await poll("sandbox trace", () => evaluate(`!/Stepping/.test(document.getElementById("sandbox-output").textContent) && /clone|division/i.test(document.getElementById("sandbox-output").textContent)`), 8_000);

    if (width === VIEWPORTS[0][0]) {
      trace("checking IndexedDB save and offline restart");
      await evaluate(`document.getElementById("save").click(); document.getElementById("save-name").value="Browser acceptance"; document.getElementById("save-confirm").click()`);
      await poll("local checkpoint list", () => evaluate(`/Browser acceptance/.test(document.getElementById("saves").textContent)`), 8_000);
      await evaluate(`navigator.serviceWorker.ready.then(() => true)`);
      await delay(800);
      await S("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
      await S("Page.reload", { ignoreCache: true });
      await poll("offline service-worker boot", () => evaluate("window.__darwinReady === true && !!window.__darwinSummary"), 35_000);
      const offline = await evaluate(`({status:document.getElementById("engine-status").textContent,population:window.__darwinSummary.population})`);
      assert.match(offline.status, /ready/);
      assert.equal(offline.population, 1);
      await S("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    }

    const painted = await evaluate(`(() => {
      const c=document.getElementById("dish"),d=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
      let min=255,max=0; for(let i=0;i<d.length;i+=4){const v=d[i]+d[i+1]+d[i+2];min=Math.min(min,v);max=Math.max(max,v)}
      return {min,max};
    })()`);
    assert.ok(painted.max > painted.min, `${width}: dish appears blank`);
    assert.deepEqual(pageErrors, [], `${width}: browser errors:\n${pageErrors.join("\n")}`);
  }

  console.log("Darwin Machine browser acceptance passed at desktop and phone, including offline Wasm restart.");
} finally {
  clearTimeout(watchdog);
  cleanup();
}
