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

  stage = "checking notched-device safe areas";
  await session("Emulation.setSafeAreaInsetsOverride", {
    insets: {
      top: 47, topMax: 47,
      left: 18, leftMax: 18,
      bottom: 34, bottomMax: 34,
      right: 18, rightMax: 18,
    },
  });
  await loadAt(appUrl, 390, 844, APP_READY);
  const safeArea = await evaluate(`(() => {
    const box = (selector) => {
      const style = getComputedStyle(document.querySelector(selector));
      return {
        top: parseFloat(style.paddingTop),
        right: parseFloat(style.paddingRight),
        bottom: parseFloat(style.paddingBottom),
        left: parseFloat(style.paddingLeft),
      };
    };
    return {
      topbar: box(".topbar"),
      setup: box(".setup-screen"),
      gameLayout: box(".game-layout"),
    };
  })()`);
  assert.ok(safeArea.topbar.top >= 55,
    `the phone topbar must clear the 47px status area plus its base padding, got ${JSON.stringify(safeArea.topbar)}`);
  assert.ok(safeArea.topbar.left >= 28 && safeArea.topbar.right >= 28,
    `the phone topbar controls must clear both 18px side insets, got ${JSON.stringify(safeArea.topbar)}`);
  assert.ok(safeArea.setup.top >= 61 && safeArea.setup.left >= 30 && safeArea.setup.right >= 30,
    `the setup controls must clear the notched viewport, got ${JSON.stringify(safeArea.setup)}`);
  assert.ok(safeArea.gameLayout.left >= 25 && safeArea.gameLayout.right >= 25 && safeArea.gameLayout.bottom >= 50,
    `the board must clear side and home-indicator insets, got ${JSON.stringify(safeArea.gameLayout)}`);
  await session("Emulation.setSafeAreaInsetsOverride", {
    insets: {
      top: 0, topMax: 0,
      left: 0, leftMax: 0,
      bottom: 0, bottomMax: 0,
      right: 0, rightMax: 0,
    },
  });

  stage = "checking the Almanac pill clears the game controls";
  await loadAt(appUrl, 360, 640, APP_READY);
  const almanacClearance = await evaluate(`(async () => {
    document.querySelector("#start-game").click();
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const pill = document.querySelector("#almanac-back-host")?.shadowRoot?.querySelector("a");
    const brand = document.querySelector("#brand-button");
    const skip = document.querySelector(".skip-link");
    const rect = (element) => {
      const box = element.getBoundingClientRect();
      return { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height };
    };
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const pillRect = rect(pill);
    const brandRect = rect(brand);
    const brandPoint = document.elementFromPoint(brandRect.left + 5, brandRect.top + brandRect.height / 2);
    skip.focus();
    await new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const skipRect = rect(skip);
    const skipPoint = document.elementFromPoint(skipRect.left + 5, skipRect.top + skipRect.height / 2);
    return {
      pill: pillRect,
      brand: brandRect,
      skip: skipRect,
      brandOverlap: overlaps(pillRect, brandRect),
      skipOverlap: overlaps(pillRect, skipRect),
      brandReached: Boolean(brandPoint && (brandPoint === brand || brand.contains(brandPoint))),
      skipReached: Boolean(skipPoint && (skipPoint === skip || skip.contains(skipPoint))),
    };
  })()`);
  assert.equal(almanacClearance.brandOverlap, false,
    `the Almanac pill must not cover the game brand, got ${JSON.stringify(almanacClearance)}`);
  assert.equal(almanacClearance.brandReached, true,
    `the brand's leading edge must receive its own tap, got ${JSON.stringify(almanacClearance)}`);
  assert.equal(almanacClearance.skipOverlap, false,
    `the Almanac pill must not cover the focused skip link, got ${JSON.stringify(almanacClearance)}`);
  assert.equal(almanacClearance.skipReached, true,
    `the skip link's leading edge must receive its own tap, got ${JSON.stringify(almanacClearance)}`);

  stage = "checking the narrow phone viewport";
  await loadAt(appUrl, 360, 640, APP_READY);
  const narrow = await evaluate("({ innerWidth, documentWidth: document.documentElement.scrollWidth })");
  assert.ok(narrow.documentWidth <= narrow.innerWidth + 1, `360px must not scroll sideways (${narrow.documentWidth} > ${narrow.innerWidth})`);

  stage = "checking an abandoned animation cannot resume into a new game";
  await loadAt(appUrl, 1440, 1000, APP_READY);
  await evaluate(`(() => {
    const players = Array.from({ length: 4 }, (_, id) => ({
      name: "Old player " + (id + 1),
      human: true,
    }));
    const fixture = new DraculaEngine.Game({ playerCount: 4, players, hints: true }, 1);
    fixture.state.draculaIndex = 6;
    localStorage.setItem("0x4d44.game-of-dracula.save.v1", fixture.serialize());
    location.reload();
  })()`);
  await poll("the saved four-player game", async () => evaluate(
    "document.readyState === 'complete' && !document.querySelector('#resume-game')?.hidden"
  ));
  const errorsBeforeAbandon = pageErrors.length;
  const abandonFixture = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    const waitFor = async (probe, timeout = 8_000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (probe()) return true;
        await sleep(25);
      }
      return false;
    };

    document.querySelector("#resume-game").click();
    if (!await waitFor(() => !document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: false };
    }
    document.querySelector("#handoff-ready").click();
    if (!await waitFor(() => document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: true, initialGateClosed: false };
    }

    // Seed 1 spins red 2/4. Starting Dracula at track index 6 lands him in
    // the north room and emits a first-bite event for old player 4.
    document.querySelector("#spinner-button").click();
    window.confirm = () => true;
    document.querySelector("#brand-button").click();

    document.querySelector("[data-count='2']").click();
    document.querySelectorAll("#seat-list .seat-row")[1]
      .querySelector("[data-human='true']").click();
    document.querySelector("#seed-input").value = "7";
    document.querySelector("#start-game").click();
    return {
      initialHandoff: true,
      initialGateClosed: true,
      newGameStarted: document.querySelector("#setup-screen").hidden,
    };
  })()`);
  assert.equal(abandonFixture.initialHandoff, true, "the saved four-player game must start at a privacy hand-off");
  assert.equal(abandonFixture.initialGateClosed, true, "the old player must be able to accept the privacy hand-off");
  assert.equal(abandonFixture.newGameStarted, true, "the replacement two-player game must start before the old animation resumes");
  await delay(1_800);
  const abandonedResolution = await evaluate(`({
    newGameOpen: !document.querySelector("#game-screen").hidden,
    curseOpen: !document.querySelector("#curse-overlay").hidden,
    handoffOpen: !document.querySelector("#handoff-overlay").hidden,
  })`);
  assert.equal(abandonedResolution.newGameOpen, true, "the replacement game must remain open");
  assert.equal(abandonedResolution.curseOpen, false, "the abandoned game's bite must not open a curse cinematic in the replacement game");
  assert.equal(abandonedResolution.handoffOpen, true, "the replacement game's privacy hand-off must remain intact");
  assert.deepEqual(pageErrors.slice(errorsBeforeAbandon), [],
    `abandoning mid-animation must not resume against the replacement game, got ${JSON.stringify(pageErrors.slice(errorsBeforeAbandon))}`);

  stage = "checking the spin shortcut cannot advance play behind a modal";
  await loadAt(appUrl, 1440, 1000, APP_READY);
  const modalShortcutSetup = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    const waitFor = async (probe, timeout = 8_000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (probe()) return true;
        await sleep(25);
      }
      return false;
    };

    document.querySelectorAll("#seat-list .seat-row")[1]
      .querySelector("[data-human='true']").click();
    document.querySelector("#seed-input").value = "7";
    document.querySelector("#start-game").click();
    if (!await waitFor(() => !document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: false };
    }
    document.querySelector("#handoff-ready").click();
    if (!await waitFor(() => document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: true, initialGateClosed: false };
    }

    document.querySelector("#rules-open").click();
    window.__modalShortcutEvents = [];
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "r") {
        window.__modalShortcutEvents.push({ prevented: event.defaultPrevented });
      }
    });
    return {
      initialHandoff: true,
      initialGateClosed: true,
      rulesOpen: document.querySelector("#rules-modal").open,
      spinnerDisabled: document.querySelector("#spinner-button").disabled,
      logSize: document.querySelector("#log-list").children.length,
    };
  })()`);
  assert.equal(modalShortcutSetup.initialHandoff, true, "the modal-shortcut fixture must start at a privacy hand-off");
  assert.equal(modalShortcutSetup.initialGateClosed, true, "the first player must be able to accept the privacy hand-off");
  assert.equal(modalShortcutSetup.rulesOpen, true, "the Rules dialog must own the top layer before the shortcut");
  await session("Input.dispatchKeyEvent", { type: "keyDown", key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
  await session("Input.dispatchKeyEvent", { type: "keyUp", key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
  await delay(100);
  const modalShortcutResult = await evaluate(`({
    events: window.__modalShortcutEvents,
    rulesOpen: document.querySelector("#rules-modal").open,
    handoffOpen: !document.querySelector("#handoff-overlay").hidden,
    spinnerDisabled: document.querySelector("#spinner-button").disabled,
    logSize: document.querySelector("#log-list").children.length,
  })`);
  assert.deepEqual(modalShortcutResult.events, [{ prevented: false }],
    `a modal-owned "r" key must not be consumed by the game shortcut, got ${JSON.stringify(modalShortcutResult.events)}`);
  assert.equal(modalShortcutResult.rulesOpen, true, "the Rules dialog must remain open after its own key event");
  assert.equal(modalShortcutResult.handoffOpen, false, "a modal-owned key must not advance to the next player's hand-off");
  assert.equal(modalShortcutResult.spinnerDisabled, modalShortcutSetup.spinnerDisabled,
    "a modal-owned key must not start the spinner");
  assert.equal(modalShortcutResult.logSize, modalShortcutSetup.logSize,
    "a modal-owned key must not write a hidden game event");

  stage = "checking the spin shortcut can be disabled";
  const disabledShortcutSetup = await evaluate(`(() => {
    document.querySelector("#rules-modal").close();
    document.querySelector("#settings-open").click();
    const toggle = document.querySelector("#setting-keyboard-shortcuts");
    if (!toggle) return { togglePresent: false };
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#settings-modal").close();
    window.__disabledShortcutEvents = [];
    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() === "r") {
        window.__disabledShortcutEvents.push({ prevented: event.defaultPrevented });
      }
    });
    return {
      togglePresent: true,
      spinnerDisabled: document.querySelector("#spinner-button").disabled,
      logSize: document.querySelector("#log-list").children.length,
    };
  })()`);
  assert.equal(disabledShortcutSetup.togglePresent, true,
    "settings must provide a control for disabling single-character shortcuts");
  await session("Input.dispatchKeyEvent", { type: "keyDown", key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
  await session("Input.dispatchKeyEvent", { type: "keyUp", key: "r", code: "KeyR", windowsVirtualKeyCode: 82 });
  await delay(100);
  const disabledShortcutResult = await evaluate(`({
    events: window.__disabledShortcutEvents,
    spinnerDisabled: document.querySelector("#spinner-button").disabled,
    logSize: document.querySelector("#log-list").children.length,
    saved: JSON.parse(localStorage.getItem("0x4d44.game-of-dracula.settings.v1")),
  })`);
  assert.deepEqual(disabledShortcutResult.events, [{ prevented: false }],
    `a disabled "r" shortcut must not consume the key, got ${JSON.stringify(disabledShortcutResult.events)}`);
  assert.equal(disabledShortcutResult.spinnerDisabled, disabledShortcutSetup.spinnerDisabled,
    "a disabled shortcut must not start the spinner");
  assert.equal(disabledShortcutResult.logSize, disabledShortcutSetup.logSize,
    "a disabled shortcut must not write a game event");
  assert.equal(disabledShortcutResult.saved.keyboardShortcuts, false,
    "the disabled shortcut preference must persist");
  await loadAt(appUrl, 1440, 1000, APP_READY);
  assert.equal(await evaluate(`document.querySelector("#setting-keyboard-shortcuts")?.checked`), false,
    "the disabled shortcut preference must survive a reload");

  stage = "checking the hand-off gate cannot trap an open modal";
  await loadAt(appUrl, 1440, 1000, APP_READY);
  const handoffModalRace = await evaluate(`(async () => {
    const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
    const waitFor = async (probe, timeout = 8_000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) {
        if (probe()) return true;
        await sleep(25);
      }
      return false;
    };

    // Seed 7 opens on seat one and produces a vampire flight, so the spin
    // completes the turn without requiring a destination choice.
    document.querySelectorAll("#seat-list .seat-row")[1]
      .querySelector("[data-human='true']").click();
    document.querySelector("#seed-input").value = "7";
    document.querySelector("#start-game").click();
    if (!await waitFor(() => !document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: false };
    }
    document.querySelector("#handoff-ready").click();
    if (!await waitFor(() => document.querySelector("#handoff-overlay").hidden)) {
      return { initialHandoff: true, initialGateClosed: false };
    }

    document.querySelector("#spinner-button").click();
    document.querySelector("#rules-open").click();
    const turnFinished = await waitFor(() => !document.querySelector("#handoff-overlay").hidden);
    await new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame)));
    const rules = document.querySelector("#rules-modal");
    const ready = document.querySelector("#handoff-ready");
    return {
      initialHandoff: true,
      initialGateClosed: true,
      turnFinished,
      rulesOpen: rules.open,
      handoffOpen: !document.querySelector("#handoff-overlay").hidden,
      focusOnHandoff: document.activeElement === ready,
      focusInRules: rules.contains(document.activeElement),
    };
  })()`);
  assert.equal(handoffModalRace.initialHandoff, true, "a two-human game must begin with the privacy hand-off");
  assert.equal(handoffModalRace.initialGateClosed, true, "the first player must be able to accept the privacy hand-off");
  assert.equal(handoffModalRace.turnFinished, true, "the deterministic vampire spin must advance to the next player's hand-off");
  assert.equal(handoffModalRace.rulesOpen, false,
    `the rules dialog must retire before the hand-off gate opens, got ${JSON.stringify(handoffModalRace)}`);
  assert.equal(handoffModalRace.handoffOpen, true, "the next player's privacy hand-off must remain visible");
  assert.equal(handoffModalRace.focusOnHandoff, true,
    `the hand-off action must receive keyboard focus, got ${JSON.stringify(handoffModalRace)}`);

  const dialogOverHandoff = await evaluate(`(() => {
    const rules = document.querySelector("#rules-modal");
    rules.showModal();
    window.__handoffKeyEvents = [];
    window.addEventListener("keydown", (event) => {
      window.__handoffKeyEvents.push({ key: event.key, prevented: event.defaultPrevented });
    });
    return {
      rulesOpen: rules.open,
      focusInRules: rules.contains(document.activeElement),
    };
  })()`);
  assert.equal(dialogOverHandoff.rulesOpen, true, "the defensive key-scope check requires an open native dialog");
  assert.equal(dialogOverHandoff.focusInRules, true, "the native dialog must own focus for the defensive key-scope check");
  await session("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
  await session("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await session("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await delay(100);
  const dialogKeys = await evaluate(`({
    rulesOpen: document.querySelector("#rules-modal").open,
    events: window.__handoffKeyEvents,
  })`);
  assert.deepEqual(dialogKeys.events.map((event) => event.prevented), [false, false],
    `the hand-off trap must not cancel keys owned by a native dialog, got ${JSON.stringify(dialogKeys.events)}`);
  assert.equal(dialogKeys.rulesOpen, false, "Escape must dismiss a native dialog opened over the hand-off gate");

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
