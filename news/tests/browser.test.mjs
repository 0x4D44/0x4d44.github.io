// Real-browser mobile navigation check. This exercises the menu through Chrome
// hit-testing and a wheel gesture, not only DOM string assertions.
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
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((path) => existsSync(path)) ?? "chrome";
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const delay = (ms) => new Promise((resolveDelay) => setTimeout(resolveDelay, ms));

let chrome;
let server;
let ws;
let cleaned = false;
function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* already closed */ }
  if (chrome?.pid) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-chrome.pid, "SIGKILL");
      }
    } catch { /* Chrome already exited */ }
  }
  try { server?.closeAllConnections?.(); server?.close(); } catch { /* already closed */ }
}
process.on("exit", cleanup);

async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const port = probe.address().port;
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}
async function poll(description, probe, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await probe();
    if (result) return result;
    await delay(60);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

try {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}\\`) && !path.startsWith(`${ROOT}/`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      response.end(await readFile(path));
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const appUrl = `http://127.0.0.1:${server.address().port}/news/index.html`;
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "daily-flange-nav-"));
  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--mute-audio", "about:blank",
  ], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });
  const wsUrl = await poll("Chrome debug endpoint", async () => {
    try { return (await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json()).webSocketDebuggerUrl; }
    catch { return null; }
  }, 30_000);
  ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, rejectOpen) => { ws.onopen = resolveOpen; ws.onerror = rejectOpen; });

  let commandId = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolveCommand, rejectCommand } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) rejectCommand(new Error(JSON.stringify(message.error)));
    else resolveCommand(message.result);
  };
  const send = (method, params = {}, sessionId) => new Promise((resolveCommand, rejectCommand) => {
    const id = ++commandId;
    pending.set(id, { resolveCommand, rejectCommand });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (method, params = {}) => send(method, params, sessionId);
  await S("Page.enable");
  await S("Runtime.enable");
  async function evaluate(expression) {
    const result = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true, userGesture: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  }
  async function setViewport(width, height) {
    await S("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 700 });
  }
  async function realClick(selector) {
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return { error: "missing" };
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, ok: hit === node || node.contains(hit) };
    })()`);
    assert.equal(point.error, undefined, `${selector} should exist`);
    assert.equal(point.ok, true, `${selector} should win hit-testing`);
    await S("Input.dispatchMouseEvent", { type: "mousePressed", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await S("Input.dispatchMouseEvent", { type: "mouseReleased", x: point.x, y: point.y, button: "left", clickCount: 1 });
    await delay(100);
  }
  async function realTap(selector) {
    const point = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return { error: "missing" };
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2, y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, ok: hit === node || node.contains(hit) };
    })()`);
    assert.equal(point.error, undefined, `${selector} should exist`);
    assert.equal(point.ok, true, `${selector} should win touch hit-testing`);
    const touchPoint = { x: point.x, y: point.y, radiusX: 1, radiusY: 1, force: 1, id: 1 };
    await S("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [touchPoint], modifiers: 0 });
    await S("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [], modifiers: 0 });
    await delay(100);
  }

  await setViewport(390, 844);
  await S("Page.navigate", { url: appUrl });
  await poll("mobile navigation", () => evaluate("!!document.querySelector('.catnav-more-btn')"));
  const before = await evaluate("({ label: document.querySelector('.catnav-more-label').textContent, hidden: document.querySelector('.catnav-more').hidden, horizontal: document.documentElement.scrollWidth - window.innerWidth })");
  assert.equal(before.label, "Menu");
  assert.equal(before.hidden, false);
  assert.ok(before.horizontal <= 1, `mobile nav should not create horizontal overflow (${before.horizontal}px)`);
  await realTap(".catnav-more-btn");
  const open = await evaluate("(() => { const m = document.querySelector('.catnav-more-menu'); const r = m.getBoundingClientRect(); return { open: m.classList.contains('open'), overflowY: getComputedStyle(m).overflowY, scrollHeight: m.scrollHeight, clientHeight: m.clientHeight, bottom: r.bottom, viewport: innerHeight, links: m.querySelectorAll('a').length }; })()");
  assert.equal(open.open, true, JSON.stringify(open));
  assert.equal(open.overflowY, "auto");
  assert.ok(open.scrollHeight > open.clientHeight, "mobile section sheet should have its own scrollable overflow");
  assert.ok(open.bottom <= open.viewport + 1, "mobile section sheet should stay within the viewport");
  assert.ok(open.links >= 20, "mobile section sheet should retain the full section list");
  await evaluate("document.querySelector('.catnav-more-menu').scrollTop = 300");
  assert.equal(await evaluate("document.querySelector('.catnav-more-menu').scrollTop > 0"), true);

  await setViewport(1280, 900);
  await S("Page.navigate", { url: appUrl });
  await poll("desktop navigation", () => evaluate("!!document.querySelector('.catnav-more-btn')"));
  assert.equal(await evaluate("document.querySelector('.catnav-more-label').textContent"), "More");
  console.log("Daily Flange mobile navigation browser check passed");
} finally {
  cleanup();
}
