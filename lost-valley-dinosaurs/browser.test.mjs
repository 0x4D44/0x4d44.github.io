import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(process.env.ALMANAC_ROOT || import.meta.dirname, process.env.ALMANAC_ROOT ? "." : "..");
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
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
};

let stage = "starting";
let chrome;
let server;
let websocket;
let profile;
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
  console.error(`Lost Valley browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 90_000);
watchdog.unref?.();

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function freePort() {
  const probe = createServer();
  await new Promise((resolveListen) => probe.listen(0, "127.0.0.1", resolveListen));
  const { port } = probe.address();
  await new Promise((resolveClose) => probe.close(resolveClose));
  return port;
}

async function poll(description, probe, timeout = 10_000) {
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
  const appUrl = `${catalogUrl}lost-valley-dinosaurs/`;

  stage = "launching Chrome";
  const debugPort = await freePort();
  profile = await mkdtemp(join(tmpdir(), "lost-valley-browser-"));
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
  websocket.onmessage = (event) => {
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
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      pageErrors.push(message.params.args.map((argument) => argument.description ?? argument.value).join(" "));
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      pageErrors.push(message.params.entry.text);
    }
  };

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
    await poll("the expedition setup", async () => evaluate(
      "document.readyState === 'complete' && !document.querySelector('#setup-screen')?.hidden && Boolean(window.__LV_APP__)"
    ));
  }

  async function layout() {
    return evaluate(`(() => {
      const setup = document.querySelector("#setup-screen").getBoundingClientRect();
      const card = document.querySelector(".setup-card").getBoundingClientRect();
      return {
        innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        setup: { left: setup.left, right: setup.right, width: setup.width },
        card: { left: card.left, right: card.right, width: card.width },
        activeSeats: document.querySelectorAll('.seat-row[aria-disabled="false"]').length,
        backButton: Boolean(document.querySelector("#almanac-back-host")),
      };
    })()`);
  }

  stage = "checking the phone layout";
  await loadAt(390, 844);
  const phone = await layout();
  assert.equal(phone.innerWidth, 390);
  assert.equal(phone.activeSeats, 2);
  assert.ok(phone.documentWidth <= phone.innerWidth + 1, `phone document must not overflow (${phone.documentWidth} > ${phone.innerWidth})`);
  assert.ok(phone.setup.left >= -1 && phone.setup.right <= phone.innerWidth + 1, `phone setup must fit (${JSON.stringify(phone.setup)})`);
  assert.ok(phone.card.left >= -1 && phone.card.right <= phone.innerWidth + 1, `phone setup card must fit (${JSON.stringify(phone.card)})`);
  assert.equal(phone.backButton, true, "shared Almanac navigation must mount");

  stage = "checking the desktop layout";
  await loadAt(1440, 1000);
  const desktop = await layout();
  assert.equal(desktop.innerWidth, 1440);
  assert.ok(desktop.documentWidth <= desktop.innerWidth + 1, `desktop document must not overflow (${desktop.documentWidth} > ${desktop.innerWidth})`);
  assert.ok(desktop.setup.left >= -1 && desktop.setup.right <= desktop.innerWidth + 1, `desktop setup must fit (${JSON.stringify(desktop.setup)})`);

  stage = "starting a four-expedition game";
  const started = await evaluate(`(() => {
    document.querySelector('#player-count [data-count="4"]').click();
    document.querySelector('#seed-input').value = "20260726";
    document.querySelector('#start-game').click();
    const game = window.__LV_APP__.game;
    return {
      setupHidden: document.querySelector('#setup-screen').hidden,
      gameVisible: !document.querySelector('#game-view').hidden,
      phase: game?.state.phase,
      playerCount: game?.state.players.length,
      explorerCount: game?.state.explorers.length,
      dinosaurCount: game?.state.dinosaurs.length,
    };
  })()`);
  assert.equal(started.setupHidden, true);
  assert.equal(started.gameVisible, true);
  assert.equal(started.playerCount, 4);
  assert.equal(started.explorerCount, 16);
  assert.equal(started.dinosaurCount, 6);
  assert.notEqual(started.phase, "game-over");

  stage = "rendering the complete volcano cone";
  const volcano = await evaluate(`(() => {
    const app = window.__LV_APP__;
    app.game.state.lavaTrack = 6;
    app.game.state.lavaPool = 24;
    app.render(true);
    const transforms = [...document.querySelectorAll('.lava-piece')].map((node) => node.getAttribute('transform'));
    return {
      count: transforms.length,
      transforms,
      invalid: transforms.filter((value) => !value || /undefined|NaN/.test(value)),
    };
  })()`);
  assert.equal(volcano.count, 6);
  assert.deepEqual(volcano.invalid, []);

  stage = "playing a seeded expedition to completion";
  await loadAt(1100, 820);
  const playthrough = await evaluate(`(() => {
    document.querySelector('#seed-input').value = "314159";
    document.querySelector('input[name="length"][value="1"]').checked = true;
    document.querySelector('#start-game').click();
    const app = window.__LV_APP__;
    let actions = 0;
    while (app.game.state.phase !== 'game-over' && actions < 1200) {
      app.game.autoStep();
      actions += 1;
      if (actions % 10 === 0) app.render();
    }
    app.render();
    return {
      phase: app.game.state.phase,
      actions,
      turns: app.game.state.turn,
      winners: app.game.state.winners,
      reason: app.game.state.endReason,
      modalOpen: document.querySelector('#gameover-modal').open,
      invalidTransforms: [...document.querySelectorAll('[transform]')]
        .map((node) => node.getAttribute('transform'))
        .filter((value) => /undefined|NaN/.test(value)),
    };
  })()`);
  assert.equal(playthrough.phase, "game-over");
  assert.ok(playthrough.actions > 10 && playthrough.actions < 1200, `unexpected action count ${playthrough.actions}`);
  assert.ok(playthrough.winners.length >= 1);
  assert.ok(playthrough.reason);
  assert.equal(playthrough.modalOpen, true);
  assert.deepEqual(playthrough.invalidTransforms, []);

  stage = "checking the catalog integration";
  await session("Page.navigate", { url: catalogUrl });
  await poll("the Almanac catalog", async () => evaluate(
    "Boolean(window.ESSAYS && window.COLLECTIONS && document.querySelector('#listing'))"
  ));
  const catalog = await evaluate(`(() => {
    const entry = window.ESSAYS.find(({ slug }) => slug === "lost-valley-dinosaurs");
    const shelf = window.COLLECTIONS.find(({ id }) => id === "games");
    return {
      entry,
      onGamesShelf: shelf?.slugs.includes("lost-valley-dinosaurs"),
      illustrationExists: Boolean(document.querySelector("#ill-impact")),
    };
  })()`);
  assert.equal(catalog.entry?.url, "https://0x4d44.github.io/lost-valley-dinosaurs/");
  assert.deepEqual(catalog.entry?.tags, ["games", "history"]);
  assert.equal(catalog.onGamesShelf, true);
  assert.equal(catalog.illustrationExists, true);
  assert.deepEqual(pageErrors, []);

  console.log("✓ phone and desktop setup layouts fit their viewports");
  console.log("✓ shared Almanac navigation mounts");
  console.log("✓ four-player setup creates sixteen explorers and six tyrannosaurs");
  console.log("✓ the six-counter volcano cone renders finite SVG transforms");
  console.log(`✓ seeded browser expedition reached game over in ${playthrough.actions} actions / ${playthrough.turns} turns`);
  console.log("✓ the catalog entry, tags, illustration, and Games Room shelf load");
} finally {
  clearTimeout(watchdog);
  cleanup();
  if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}
