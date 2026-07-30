import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "..");
const CHROME = process.env.CHROME_PATH
  ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((path) => existsSync(path))
  ?? "chrome";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

let chrome;
let server;
let socket;
let profile;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { socket?.close(); } catch { /* already closed */ }
  if (chrome?.pid) {
    try {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        process.kill(-chrome.pid, "SIGKILL");
      }
    } catch { /* Chrome already exited */ }
  }
  try { server?.closeAllConnections?.(); } catch { /* already closed */ }
  try { server?.close(); } catch { /* already closed */ }
}

process.on("exit", cleanup);
const watchdog = setTimeout(() => {
  console.error("Tidecall browser test timed out.");
  cleanup();
  process.exit(2);
}, 120_000);
watchdog.unref?.();

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function poll(description, probe, timeout = 15_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description} (last: ${JSON.stringify(last)})`);
}

try {
  server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname.endsWith("/") ? `${pathname}index.html` : pathname;
    const path = resolve(ROOT, relative.replace(/^[/\\]+/, ""));
    if (path !== ROOT && !path.startsWith(`${ROOT}/`) && !path.startsWith(`${ROOT}\\`)) {
      response.writeHead(403).end("forbidden");
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const appUrl = `http://127.0.0.1:${server.address().port}/tidecall/`;

  const debugPort = await freePort();
  profile = await mkdtemp(join(tmpdir(), "tidecall-browser-"));
  chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "--no-sandbox",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--mute-audio",
    "about:blank",
  ], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });

  const websocketUrl = await poll("Chrome", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch {
      return null;
    }
  }, 30_000);

  socket = new WebSocket(websocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = () => rejectOpen(new Error("Could not connect to Chrome"));
  });

  let commandId = 0;
  const pending = new Map();
  const pageErrors = [];
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    }
  };

  const send = (method, params = {}, sessionId) => new Promise((resolveCommand, rejectCommand) => {
    const id = ++commandId;
    pending.set(id, { resolveCommand, rejectCommand });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const session = (method, params = {}) => send(method, params, sessionId);
  await session("Page.enable");
  await session("Runtime.enable");

  async function evaluate(expression) {
    const result = await session("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  async function measure(width, height, seed) {
    await session("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await session("Page.navigate", { url: appUrl });
    await poll("Tidecall home", async () => evaluate(
      "document.readyState === 'complete' && Boolean(window.TidecallEngine)"
    ));
    await evaluate(`(() => {
      const E = window.TidecallEngine;
      const game = E.newMatch({ seed: ${seed}, difficulty: "current" });
      localStorage.setItem("tidecall.save.v1", JSON.stringify({ version: E.VERSION, savedAt: Date.now(), game }));
    })()`);
    await session("Page.navigate", { url: appUrl });
    await poll("saved Tidecall voyage", async () => evaluate(
      "document.readyState === 'complete' && !document.querySelector('#continue-button')?.hidden"
    ));
    await evaluate("document.querySelector('#continue-button').click()");
    await poll("Tidecall table", async () => evaluate(
      "!document.querySelector('#game-screen')?.hidden && document.querySelectorAll('#hand .playing-card').length > 0"
    ));
    return evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const scrolling = document.scrollingElement;
      const dock = document.querySelector(".player-dock").getBoundingClientRect();
      scrollTo(0, scrolling.scrollHeight);
      const pageScrollsBy = scrollY;
      scrollTo(0, 0);
      resolve({
        pageScrollsBy,
        scrollHeight: scrolling.scrollHeight,
        innerHeight,
        dockBottom: dock.bottom,
      });
    })))`);
  }

  const tiers = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "phone", width: 390, height: 844 },
  ];
  for (const tier of tiers) {
    for (let seed = 1; seed <= 12; seed += 1) {
      const result = await measure(tier.width, tier.height, seed);
      assert.equal(
        result.pageScrollsBy,
        0,
        `${tier.name} seed ${seed} scrolls by ${result.pageScrollsBy}px: ${JSON.stringify(result)}`,
      );
      assert.ok(
        result.dockBottom <= result.innerHeight + 1,
        `${tier.name} seed ${seed} clips the player dock: ${JSON.stringify(result)}`,
      );
    }
  }
  assert.deepEqual(pageErrors, []);
  console.log("Tidecall board does not scroll or clip across desktop, tablet, and phone deals.");
} finally {
  clearTimeout(watchdog);
  cleanup();
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
