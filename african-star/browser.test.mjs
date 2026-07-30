import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "..");
const CHROME = process.env.CHROME_PATH
  ?? [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((path) => existsSync(path))
  ?? "chrome";
const MIME = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
};

let stage = "starting";
let chrome;
let server;
let websocket;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { websocket?.close(); } catch { /* already closed */ }
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
  console.error(`African Star browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 60_000);
watchdog.unref?.();

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function poll(description, probe, timeout = 8_000) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    last = await probe();
    if (last) return last;
    await delay(50);
  }
  throw new Error(`Timed out waiting for ${description}${last == null ? "" : ` (last: ${JSON.stringify(last)})`}`);
}

try {
  stage = "starting the static server";
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
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const catalogUrl = `http://127.0.0.1:${server.address().port}/`;
  const appUrl = `${catalogUrl}african-star/`;

  stage = "launching Chrome";
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "african-star-browser-"));
  chrome = spawn(CHROME, [
    "--headless=new",
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    "--mute-audio",
    "about:blank",
  ], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });

  stage = "waiting for Chrome";
  const websocketUrl = await poll("Chrome's debug endpoint", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch {
      return null;
    }
  }, 30_000);

  websocket = new WebSocket(websocketUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    websocket.onopen = resolveOpen;
    websocket.onerror = () => rejectOpen(new Error("Could not connect to Chrome"));
  });

  let commandId = 0;
  const pending = new Map();
  const pageErrors = [];
  const failedRequests = [];
  const BENIGN_MISSING = [/\/favicon\.ico$/];
  const isGenericLoadFailure = (text) => /Failed to load resource/i.test(text);
  websocket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolveCommand, rejectCommand } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) rejectCommand(new Error(JSON.stringify(message.error)));
      else resolveCommand(message.result);
      return;
    }
    if (message.method === "Network.responseReceived") {
      const { status, url } = message.params.response;
      if (status >= 400) failedRequests.push({ status, url });
    } else if (message.method === "Network.loadingFailed") {
      failedRequests.push({ status: "failed", url: message.params.requestId });
    } else if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((argument) => argument.description ?? argument.value).join(" ");
      if (!isGenericLoadFailure(text)) pageErrors.push(text);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      if (!isGenericLoadFailure(message.params.entry.text)) pageErrors.push(message.params.entry.text);
    }
  };

  const unexpectedMissing = () => failedRequests
    .filter(({ url }) => !BENIGN_MISSING.some((pattern) => pattern.test(url)));

  const send = (method, params = {}, sessionId) => new Promise((resolveCommand, rejectCommand) => {
    const id = ++commandId;
    pending.set(id, { resolveCommand, rejectCommand });
    websocket.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const session = (method, params = {}) => send(method, params, sessionId);

  await session("Page.enable");
  await session("Runtime.enable");
  await session("Log.enable");
  await session("Network.enable");

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

  async function loadAt(width, height) {
    await session("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    await session("Page.navigate", { url: appUrl });
    await poll("the setup screen", async () => evaluate(
      "document.readyState === 'complete' && document.querySelector('#setupDialog')?.open"
    ));
  }

  async function layout() {
    return evaluate(`(() => {
      const dialog = document.querySelector("#setupDialog").getBoundingClientRect();
      const form = document.querySelector("#setupForm");
      return {
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        dialog: { left: dialog.left, right: dialog.right, width: dialog.width },
        formWidth: form.clientWidth,
        formScrollWidth: form.scrollWidth,
        playerCount: document.querySelectorAll(".setup-player-row").length,
        backButton: Boolean(document.querySelector("#almanac-back-host")),
      };
    })()`);
  }

  stage = "checking the phone layout";
  await loadAt(390, 844);
  const phone = await layout();
  assert.equal(phone.innerWidth, 390);
  assert.equal(phone.playerCount, 4);
  assert.ok(phone.documentWidth <= phone.innerWidth + 1, `phone document must not overflow (${phone.documentWidth} > ${phone.innerWidth})`);
  assert.ok(phone.dialog.left >= 0 && phone.dialog.right <= phone.innerWidth + 1, `phone dialog must fit (${JSON.stringify(phone.dialog)})`);
  assert.ok(phone.formScrollWidth <= phone.formWidth + 1, `phone setup form must not clip (${phone.formScrollWidth} > ${phone.formWidth})`);
  assert.equal(phone.backButton, true, "shared Almanac back control must mount");

  stage = "checking the desktop layout";
  await loadAt(1440, 1000);
  const desktop = await layout();
  assert.equal(desktop.innerWidth, 1440);
  assert.ok(desktop.documentWidth <= desktop.innerWidth + 1, `desktop document must not overflow (${desktop.documentWidth} > ${desktop.innerWidth})`);
  assert.ok(desktop.dialog.left >= 0 && desktop.dialog.right <= desktop.innerWidth + 1, `desktop dialog must fit (${JSON.stringify(desktop.dialog)})`);

  stage = "starting a game";
  const started = await evaluate(`(() => {
    document.querySelector("#startButton").click();
    return {
      setupOpen: document.querySelector("#setupDialog").open,
      phase: document.querySelector("#app").dataset.phase,
      playerCount: window.AfricanStarGame.getState()?.players.length,
    };
  })()`);
  assert.equal(started.setupOpen, false);
  assert.equal(started.playerCount, 4);
  assert.notEqual(started.phase, "boot");

  stage = "checking the catalog integration";
  await session("Page.navigate", { url: catalogUrl });
  await poll("the Almanac catalog", async () => evaluate(
    "Boolean(window.ESSAYS && window.COLLECTIONS && document.querySelector('#listing'))"
  ));
  const catalog = await evaluate(`(() => {
    const entry = window.ESSAYS.find(({ slug }) => slug === "african-star");
    const shelf = window.COLLECTIONS.find(({ id }) => id === "games");
    return {
      entry,
      onGamesShelf: shelf?.slugs.includes("african-star"),
      illustrationExists: Boolean(document.querySelector("#ill-map")),
    };
  })()`);
  assert.equal(catalog.entry?.url, "https://0x4d44.github.io/african-star/");
  assert.deepEqual(catalog.entry?.tags, ["games", "history"]);
  assert.equal(catalog.onGamesShelf, true);
  assert.equal(catalog.illustrationExists, true);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(unexpectedMissing(), [],
    `the game and catalog must not request missing assets, got ${JSON.stringify(unexpectedMissing())}`);

  console.log("✓ phone and desktop setup layouts fit their viewports");
  console.log("✓ shared Almanac navigation mounts");
  console.log("✓ a four-expedition game starts without browser errors");
  console.log("✓ the catalog entry, tags, illustration, and Games Room shelf load");
} finally {
  clearTimeout(watchdog);
  cleanup();
}
