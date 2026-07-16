// Real-browser smoke test (onu pattern): headless Chrome over CDP, REAL mouse
// events through hit-testing — the class of bug synthetic el.click() cannot
// catch (lessons_learnt 2026-07-11). Verifies boot, responsive layout, the
// mimic's tap targets and overlay dismissal at phone + desktop viewports.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWPORTS = [[360, 640], [390, 844], [1280, 900]];
const CHROME = process.env.CHROME_PATH
  ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((path) => existsSync(path))
  ?? "chrome";
const MIME = {
  ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml",
};

let stage = "starting";
let chrome; let server; let ws; let cleaned = false;
function trace(message) { stage = message; process.stderr.write(`[chief-browser] ${message}\n`); }
function killChrome() {
  if (!chrome?.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-chrome.pid, "SIGKILL");
  } catch { /* already gone */ }
}
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* closed */ }
  killChrome();
  try { server?.closeAllConnections?.(); server?.close(); } catch { /* closed */ }
}
process.on("exit", cleanup);
const watchdog = setTimeout(() => {
  console.error(`chief-engineer browser test timed out while ${stage}.`);
  cleanup(); process.exit(2);
}, 120_000);
watchdog.unref?.();

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function freePort() {
  const probe = createServer();
  await new Promise((r) => probe.listen(0, "127.0.0.1", r));
  const { port } = probe.address();
  await new Promise((r) => probe.close(r));
  return port;
}
async function poll(description, probe, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${description}${last == null ? "" : ` (last ${JSON.stringify(last)})`}`);
}

try {
  trace("starting static server");
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}\\`) && !path.startsWith(`${ROOT}/`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      response.end(body);
    } catch { response.writeHead(404).end("not found"); }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const appUrl = `http://127.0.0.1:${server.address().port}/chief-engineer/`;

  trace("launching Chrome");
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "chief-browser-"));
  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--mute-audio", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "about:blank",
  ], { detached: process.platform !== "win32", stdio: ["ignore", "ignore", "ignore"] });

  trace(`waiting for Chrome on ${debugPort}`);
  const wsUrl = await poll("Chrome debug endpoint", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch { return null; }
  }, 30_000);
  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error("no debug websocket")); });

  let commandId = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { res, rej } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rej(new Error(JSON.stringify(message.error)));
      else res(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const d = message.params.exceptionDetails;
      pageErrors.push(`exception: ${d.exception?.description ?? d.text}`);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      pageErrors.push(`console.error: ${message.params.args.map((a) => a.description ?? a.value).join(" ")}`);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const id = ++commandId;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params = {}) => send(method, params, sessionId);
  await S("Page.enable"); await S("Runtime.enable");
  // auto-accept native dialogs (the discard-saved-voyage confirm)
  const acceptDialogs = (event) => {
    const message = JSON.parse(event.data);
    if (message.method === "Page.javascriptDialogOpening" && message.sessionId === sessionId) {
      send("Page.handleJavaScriptDialog", { accept: true }, sessionId);
    }
  };
  ws.addEventListener("message", acceptDialogs);

  async function evaluate(expression) {
    const r = await S("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }
  async function setViewport(w, h) {
    await S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 700 });
  }
  // real click through hit-testing: verify elementFromPoint hits the target
  // (or a descendant/ancestor of it), then dispatch true mouse events.
  async function realClick(selector) {
    const pt = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return { error: "missing ${selector}" };
      node.scrollIntoView({ block: "center", inline: "center" });
      const r = node.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      const ok = hit && (hit === node || node.contains(hit) || hit.contains(node));
      return { x, y, ok, hit: hit ? (hit.className || hit.tagName) : null };
    })()`);
    assert.ok(!pt.error, pt.error);
    assert.ok(pt.ok, `${selector} must win hit-testing at its own centre (got ${pt.hit})`);
    for (const type of ["mousePressed", "mouseReleased"]) {
      await S("Input.dispatchMouseEvent", { type, x: pt.x, y: pt.y, button: "left", clickCount: 1 });
    }
    await delay(80);
  }
  async function assertNoSidewaysScroll(label) {
    const scroll = await evaluate("({ w: document.documentElement.scrollWidth, i: window.innerWidth })");
    assert.ok(scroll.w <= scroll.i + 1, `${label}: no horizontal scroll (scrollWidth ${scroll.w} vs innerWidth ${scroll.i})`);
  }

  for (const [w, h] of VIEWPORTS) {
    trace(`viewport ${w}x${h}: loading menu`);
    await setViewport(w, h);
    await S("Page.navigate", { url: appUrl });
    await poll("menu render", () => evaluate("!!document.querySelector('.fleet .ship-card')"));
    await assertNoSidewaysScroll(`menu @${w}`);
    assert.equal(await evaluate("document.title.includes('Chief Engineer')"), true, "title set");

    trace(`viewport ${w}x${h}: starting level 1 via real click`);
    await realClick(".fleet .ship-card:not(.resume-card):not([data-locked='true'])");
    await poll("voyage HUD", () => evaluate("!!document.querySelector('.annun .tile') && !!window.__chief.state"));
    await assertNoSidewaysScroll(`voyage @${w}`);
    const tiles = await evaluate("document.querySelectorAll('.annun .tile').length");
    assert.ok(tiles >= 6 && tiles <= 12, `L1 annunciator is small and calm (got ${tiles} tiles)`);

    trace(`viewport ${w}x${h}: pause control hit-test`);
    await realClick(".speedctl button"); // pause
    assert.equal(await evaluate("window.__chief.speed"), 0, "pause button pauses");

    trace(`viewport ${w}x${h}: DG detail sheet opens and closes`);
    await realClick(".dg");
    await poll("dg sheet", () => evaluate("!!document.querySelector('.overlay .sheet')"));
    // the overlay must be genuinely visible, not a transparent tap-eater
    const disp = await evaluate("getComputedStyle(document.querySelector('.overlay')).display");
    assert.notEqual(disp, "none", "overlay visible while open");
    await realClick(".overlay .sheet .actions button.primary"); // Close panel
    assert.equal(await evaluate("!!document.querySelector('.overlay')"), false, "overlay fully removed after close");

    // start DG2 through the real UI at the phone viewport only (slow path)
    if (w === 390) {
      trace("driving DG2 start via the sheet");
      await realClick(".dg:nth-of-type(2)");
      await poll("dg sheet", () => evaluate("!!document.querySelector('.overlay .sheet')"));
      await realClick(".overlay .sheet .actions button"); // START
      await evaluate("window.__chief.setSpeed(32)");
      await poll("DG2 online-ready", () => evaluate(
        "['ready','online'].includes(window.__chief.state.dgs[1].state)"), 15_000);
      await evaluate("window.__chief.setSpeed(0)");
    }
    await evaluate("localStorage.clear()");
  }

  assert.deepEqual(pageErrors, [], `no page errors: ${pageErrors.join(" | ")}`);
  console.log("chief-engineer browser test passed");
} finally {
  cleanup();
  clearTimeout(watchdog);
}
