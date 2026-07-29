// Real-browser checks for Game of Dracula.
//
// The delivered package could only exercise an inlined Chromium fixture, so it
// explicitly did not claim a result for a genuine served navigation. This test
// closes that gap: it serves the unmodified production files over HTTP and
// drives real Chrome over CDP.
//
// It also enforces two things this repo has been bitten by before:
//   * every element hidden via the `hidden` attribute must actually compute to
//     display:none (an author `display:` rule beats the UA [hidden] rule, and a
//     transparent full-viewport layer then eats every tap — see lessons_learnt);
//   * the control the player is meant to press must be what
//     document.elementFromPoint() actually returns, which synthetic .click()
//     can never prove.
//
// Modelled on lost-valley-dinosaurs/browser.test.mjs.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
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
  ".png": "image/png",
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
  // Only ever kill our own spawned pid tree: a dev box routinely has dozens of
  // the user's real Chrome processes.
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
  console.error(`Game of Dracula browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 120_000);
watchdog.unref?.();

const delay = (milliseconds) => new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));

async function freePort() {
  // Ask the OS for a port. A derived/guessed debug port can attach to a stale
  // browser and make results non-deterministic.
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
  const appUrl = `${catalogUrl}game-of-dracula/`;

  stage = "launching Chrome";
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "game-of-dracula-browser-"));
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
  let pageErrors = [];
  let failedRequests = [];
  // The repo has no /favicon.ico, so every page 404s it — identically on a
  // pristine main checkout. Track failures by URL so that known, pre-existing
  // noise can be excluded by name instead of blanket-ignoring load failures,
  // which would hide a genuinely missing asset.
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
      return;
    }
    if (message.method === "Network.loadingFailed") {
      failedRequests.push({ status: "failed", url: message.params.requestId });
      return;
    }
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((argument) => argument.description ?? argument.value).join(" ");
      // Covered with far better fidelity by the Network tracking above.
      if (!isGenericLoadFailure(text)) pageErrors.push(text);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      if (!isGenericLoadFailure(message.params.entry.text)) pageErrors.push(message.params.entry.text);
    }
  };

  const unexpectedMissing = () => failedRequests.filter((r) => !BENIGN_MISSING.some((pattern) => pattern.test(r.url)));

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

  async function loadAt(url, width, height, readyExpression) {
    await session("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: width < 700,
    });
    pageErrors = [];
    failedRequests = [];
    await session("Page.navigate", { url });
    await poll(`${url} to become ready at ${width}x${height}`, async () => evaluate(readyExpression));
  }

  const APP_READY = "document.readyState === 'complete' && !document.querySelector('#setup-screen')?.hidden";

  // ---------------------------------------------------------------- the game

  stage = "loading the game on a phone viewport";
  await loadAt(appUrl, 390, 844, APP_READY);

  // Every `hidden` element must genuinely be display:none. A transparent
  // full-viewport layer that survives `hidden` silently eats every tap.
  const hiddenLayers = await evaluate(`(() => {
    const offenders = [];
    for (const el of document.querySelectorAll("[hidden]")) {
      const display = getComputedStyle(el).display;
      if (display !== "none") {
        offenders.push({ id: el.id || el.className || el.tagName, display });
      }
    }
    return offenders;
  })()`);
  assert.deepEqual(hiddenLayers, [], `every [hidden] element must compute display:none, got ${JSON.stringify(hiddenLayers)}`);

  // Hit-testing: the button the player is told to press must be the element
  // actually at its own centre point. Scroll each control into view first —
  // elementFromPoint is viewport-relative, so an off-screen control returns null
  // and would otherwise read as "blocked" when nothing is covering it at all.
  const hitTest = await evaluate(`(async () => {
    const probe = async (selector) => {
      const el = document.querySelector(selector);
      if (!el) return { selector, missing: true };
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return { selector, zeroSized: true };
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      if (cy < 0 || cy > innerHeight) return { selector, offScreen: true, centreY: Math.round(cy) };
      const at = document.elementFromPoint(cx, cy);
      return { selector, reached: Boolean(at && (el === at || el.contains(at))), blocker: at ? (at.id || at.className || at.tagName) : null };
    };
    const out = [];
    for (const selector of ["#start-game", "#player-count", "#seed-input"]) out.push(await probe(selector));
    return out;
  })()`);
  for (const probe of hitTest) {
    assert.ok(!probe.missing, `${probe.selector} must exist`);
    assert.ok(!probe.zeroSized, `${probe.selector} must be visible`);
    assert.ok(!probe.offScreen, `${probe.selector} must scroll into view (centre ${probe.centreY})`);
    assert.ok(probe.reached, `${probe.selector} must be reachable by a real tap, blocked by ${probe.blocker}`);
  }

  const phone = await evaluate(`(() => ({
    innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    backButton: Boolean(document.querySelector("#almanac-back-host")),
    gameHidden: document.querySelector("#game-screen").hidden,
  }))()`);
  assert.equal(phone.innerWidth, 390);
  assert.ok(phone.documentWidth <= phone.innerWidth + 1, `phone must not scroll sideways (${phone.documentWidth} > ${phone.innerWidth})`);
  assert.equal(phone.backButton, true, "shared Almanac back button must mount");
  assert.equal(phone.gameHidden, true, "the table starts hidden behind setup");

  stage = "checking the narrow phone viewport";
  await loadAt(appUrl, 360, 640, APP_READY);
  const narrow = await evaluate("({ innerWidth, documentWidth: document.documentElement.scrollWidth })");
  assert.ok(narrow.documentWidth <= narrow.innerWidth + 1, `360px must not scroll sideways (${narrow.documentWidth} > ${narrow.innerWidth})`);

  stage = "playing a real game on the desktop viewport";
  await loadAt(appUrl, 1440, 1000, APP_READY);

  // Start a deterministic game through real DOM interaction, then confirm the
  // table actually opens and the spinner advances play.
  const opened = await evaluate(`(async () => {
    const seed = document.querySelector("#seed-input");
    seed.value = "1977";
    seed.dispatchEvent(new Event("input", { bubbles: true }));
    document.querySelector("#start-game").click();
    await new Promise((r) => setTimeout(r, 400));
    const game = document.querySelector("#game-screen");
    return {
      tableOpen: !game.hidden && getComputedStyle(game).display !== "none",
      setupHidden: document.querySelector("#setup-screen").hidden,
    };
  })()`);
  assert.equal(opened.tableOpen, true, "the table must open after starting a game");
  assert.equal(opened.setupHidden, true, "setup must retire once the game starts");

  // Whatever the live control is (spinner or hand-off gate), it must be a real
  // reachable target rather than sitting under an invisible layer.
  const liveControl = await evaluate(`(async () => {
    for (const selector of ["#handoff-ready", "#spinner-button", "#primary-action"]) {
      const el = document.querySelector(selector);
      if (!el || el.hidden || el.disabled) continue;
      el.scrollIntoView({ block: "center", behavior: "instant" });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) continue;
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      if (cy < 0 || cy > innerHeight) continue;
      const at = document.elementFromPoint(cx, cy);
      return { selector, reached: Boolean(at && (el === at || el.contains(at))), blocker: at ? (at.id || at.className || at.tagName) : null };
    }
    return null;
  })()`);
  assert.ok(liveControl, "the table must expose a live control to press");
  assert.ok(liveControl.reached, `${liveControl.selector} must be reachable by a real tap, blocked by ${liveControl.blocker}`);

  // Drive real play. The spinner animates and the automata take their turns, so
  // the next control appears asynchronously — poll for it rather than sampling
  // once, or the drive gives up mid-animation and reads as a stall.
  const advanced = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const liveControl = () => ["#handoff-ready", "#spinner-button", "#primary-action", "#resolve-for-me"]
      .map((selector) => document.querySelector(selector))
      .find((el) => el && !el.hidden && !el.disabled && el.getBoundingClientRect().width > 0);
    const firstChoice = () => document.querySelector("#destination-list button:not([disabled])");
    const logSize = () => document.querySelector("#log-list")?.children.length ?? 0;

    const before = logSize();
    const pressed = [];
    for (let step = 0; step < 40; step += 1) {
      let target = null;
      // Wait up to 6s for the interface to offer something to press.
      for (let wait = 0; wait < 120; wait += 1) {
        target = liveControl() || firstChoice();
        if (target) break;
        await sleep(50);
      }
      if (!target) break;
      pressed.push(target.id || target.textContent.trim().slice(0, 24));
      target.click();
      await sleep(120);
      if (logSize() > before && pressed.length >= 3) break;
    }
    return {
      logGrew: logSize() > before,
      logBefore: before,
      logAfter: logSize(),
      pressed,
      round: document.querySelector("#round-value")?.textContent?.trim() ?? null,
      victoryShown: !document.querySelector("#victory-modal")?.hidden,
    };
  })()`);
  assert.equal(advanced.logGrew, true,
    `pressing the live control must advance play and write to the log (log ${advanced.logBefore} -> ${advanced.logAfter}, pressed ${JSON.stringify(advanced.pressed)})`);

  assert.deepEqual(pageErrors, [], `the game must load and play with no console or page errors, got ${JSON.stringify(pageErrors)}`);
  // Every asset the document asks for must resolve under its own subpath.
  assert.deepEqual(unexpectedMissing(), [], `the game must not request any missing asset, got ${JSON.stringify(unexpectedMissing())}`);

  // ------------------------------------------------------------- the catalog

  stage = "checking the almanac catalog wiring";
  await loadAt(catalogUrl, 1440, 1000, "document.readyState === 'complete' && Boolean(window.ESSAYS) && Boolean(document.querySelector('#listing'))");

  const catalog = await evaluate(`(() => {
    const entry = window.ESSAYS.find((e) => e.slug === "game-of-dracula");
    const shelves = window.COLLECTIONS.filter((c) => c.slugs.includes("game-of-dracula")).map((c) => c.id);
    const symbol = entry ? Boolean(document.getElementById(entry.illustration)) : false;
    const tagNames = new Set((window.TAG_GROUPS || []).flatMap((g) => g.tags.map((t) => (typeof t === "string" ? t : t.id))));
    const declared = entry ? (entry.tags ?? [entry.tag]) : [];
    return {
      present: Boolean(entry),
      url: entry?.url ?? null,
      year: entry?.year ?? null,
      illustration: entry?.illustration ?? null,
      symbolExists: symbol,
      shelves,
      unknownTags: declared.filter((t) => !tagNames.has(t)),
      shelfCount: window.COLLECTIONS.length,
    };
  })()`);

  assert.equal(catalog.present, true, "game-of-dracula must be in window.ESSAYS");
  assert.equal(catalog.url, "https://0x4d44.github.io/game-of-dracula/", "catalog url must be the absolute Pages url");
  assert.equal(catalog.year, 1977, "year must be the subject's year, not the publish year");
  assert.equal(catalog.symbolExists, true, `illustration ${catalog.illustration} must exist as a <symbol> in the sprite, or app.js silently falls back to ill-diesel`);
  assert.deepEqual(catalog.unknownTags, [], `every tag must appear in window.TAG_GROUPS or it gets no filter chip, got ${JSON.stringify(catalog.unknownTags)}`);
  assert.ok(catalog.shelves.includes("games"), `the slug must sit on The Games Room shelf, got ${JSON.stringify(catalog.shelves)}`);

  // The landing is the shelf view, so the document's card only exists once a
  // shelf is opened. Walk the real reader's route in: open The Games Room and
  // confirm the card is there, linking out in the same tab.
  const shelfWalk = await evaluate(`(async () => {
    const tiles = [...document.querySelectorAll("#listing .tile")];
    const games = tiles.find((tile) => /Games Room/i.test(tile.querySelector(".tile-name")?.textContent ?? ""));
    if (!games) return { shelfOpened: false, shelfNames: tiles.map((t) => t.querySelector(".tile-name")?.textContent?.trim()) };
    games.click();
    await new Promise((r) => setTimeout(r, 400));
    const anchor = [...document.querySelectorAll("#listing a")]
      .find((a) => a.getAttribute("href") === "https://0x4d44.github.io/game-of-dracula/");
    return {
      shelfOpened: true,
      cardRendered: Boolean(anchor),
      // No target attribute: the catalog opens documents in the same tab so the
      // shared back button is the reader's single way home.
      opensInSameTab: anchor ? !anchor.getAttribute("target") : null,
      illustrationRendered: document.querySelector("#listing").innerHTML.includes("#ill-eye"),
      titleShown: anchor ? /Game of Dracula/.test(anchor.textContent) : false,
    };
  })()`);
  assert.equal(shelfWalk.shelfOpened, true, `The Games Room shelf must be present, got ${JSON.stringify(shelfWalk.shelfNames)}`);
  assert.equal(shelfWalk.cardRendered, true, "opening The Games Room must render the document's card");
  assert.equal(shelfWalk.titleShown, true, "the card must show the document title");
  assert.equal(shelfWalk.opensInSameTab, true, "catalog links must open in the same tab");
  assert.equal(shelfWalk.illustrationRendered, true, "the card must render its ill-eye illustration");

  // app.js warns in the console for anything left off every shelf.
  const unshelved = pageErrors.filter((text) => /unshelved/i.test(text));
  assert.deepEqual(unshelved, [], `the catalog must not report unshelved documents, got ${JSON.stringify(unshelved)}`);
  assert.deepEqual(pageErrors, [], `the catalog must load with no console or page errors, got ${JSON.stringify(pageErrors)}`);
  assert.deepEqual(unexpectedMissing(), [], `the catalog must not request any missing asset, got ${JSON.stringify(unexpectedMissing())}`);

  console.log("Game of Dracula browser checks passed (game, phone layouts, hit-testing, catalog wiring).");
} finally {
  clearTimeout(watchdog);
  cleanup();
}
