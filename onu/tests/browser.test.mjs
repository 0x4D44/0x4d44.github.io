import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const ROOT = resolve(import.meta.dirname, "../..");
const VIEWPORTS = [[360, 640], [390, 844]];
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
  ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png",
};

let fixtureSequence = 0;
function testCard(color, symbol) {
  fixtureSequence += 1;
  return { id: `browser-${fixtureSequence}`, faces: { classic: { color, symbol, points: /^\d+$/.test(symbol) ? Number(symbol) : 20 } } };
}

function testGame({ mode = "classic", hands, top, drawPile = [], turn = 0, lastPlayer = null, catchPlayer = null }) {
  return {
    mode, side: "light",
    players: hands.map((hand, index) => ({
      name: index === 0 ? "You" : ["Adder", "Cobra", "Python"][index - 1],
      human: index === 0,
      profile: index === 0 ? undefined : ["adder", "cobra", "python"][index - 1],
      hand, saidOnu: false,
    })),
    drawPile, discardPile: [top], turn, direction: 1, currentColor: top.faces.classic.color,
    dealer: 3, pendingStack: null, pendingRequest: null,
    catchPlayer, catchQueue: [], jumpWindow: null, winner: null, roundVoid: false,
    noProgressTurns: 0, lastPlayer,
  };
}

let stage = "starting";
let chrome;
let server;
let ws;
let cleaned = false;

function trace(message) {
  stage = message;
  process.stderr.write(`[onu-browser] ${message}\n`);
}

function killChrome() {
  if (!chrome?.pid) return;
  try {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore" });
    } else {
      process.kill(-chrome.pid, "SIGKILL");
    }
  } catch { /* The process tree already exited. */ }
}

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  try { ws?.close(); } catch { /* already closed */ }
  killChrome();
  try { server?.closeAllConnections?.(); } catch { /* already closed */ }
  try { server?.close(); } catch { /* already closed */ }
}

process.on("exit", cleanup);
const watchdog = setTimeout(() => {
  console.error(`Onu browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 90_000);
watchdog.unref?.();

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

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
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const appUrl = `http://127.0.0.1:${server.address().port}/onu/`;

  trace("launching Chrome");
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "onu-browser-"));
  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${debugPort}`, `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
    "about:blank",
  ], {
    detached: process.platform !== "win32",
    stdio: ["ignore", "ignore", "ignore"],
  });

  trace(`waiting for Chrome on port ${debugPort}`);
  const wsUrl = await poll("Chrome's debug endpoint", async () => {
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/version`);
      return (await response.json()).webSocketDebuggerUrl;
    } catch { return null; }
  }, 30_000);

  ws = new WebSocket(wsUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    ws.onopen = resolveOpen;
    ws.onerror = () => rejectOpen(new Error("Could not connect to Chrome's debug websocket"));
  });

  let commandId = 0;
  const pending = new Map();
  const pageErrors = [];
  ws.onmessage = (event) => {
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
      pageErrors.push(`exception: ${detail.exception?.description ?? detail.text} @ ${detail.url || "?"}:${detail.lineNumber ?? "?"}`);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((arg) => arg.description ?? arg.value ?? JSON.stringify(arg.preview ?? "")).join(" ");
      pageErrors.push(`console.error: ${text}`);
    } else if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
      const entry = message.params.entry;
      pageErrors.push(`${entry.source}: ${entry.text} @ ${entry.url || "?"}`);
    }
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
  await S("Log.enable");
  await S("Page.bringToFront");

  async function evaluate(expression) {
    const response = await S("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      const detail = response.exceptionDetails;
      throw new Error(detail.exception?.description ?? detail.text ?? "Page evaluation failed");
    }
    return response.result.value;
  }

  async function loadFixture(state, options = {}) {
    await evaluate(`window.__onu._loadFixture(${JSON.stringify(state)}, ${JSON.stringify(options)})`);
  }

  async function key(key, code = key) {
    const virtualKey = key === "Enter" ? 13 : key === "Tab" ? 9 : 32;
    const params = { key, code, windowsVirtualKeyCode: virtualKey, nativeVirtualKeyCode: virtualKey };
    await S("Input.dispatchKeyEvent", { type: "rawKeyDown", ...params });
    await S("Input.dispatchKeyEvent", { type: "keyUp", ...params });
  }

  async function focusAndKey(selector, keyName = "Enter", code = keyName) {
    const focused = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return false;
      window.__onuTestInput = [];
      if (!window.__onuTestInputInstalled) {
        window.__onuTestInputInstalled = true;
        for (const type of ["keydown", "keyup", "click"]) document.addEventListener(type, (event) => {
          window.__onuTestInput.push({ type, key: event.key ?? null, target: event.target?.id || event.target?.dataset?.mode || event.target?.className || event.target?.tagName });
        }, true);
      }
      node.scrollIntoView({ block: "center", inline: "center" });
      node.focus();
      return document.activeElement === node;
    })()`);
    assert.equal(focused, true, `${selector} should accept focus`);
    await key(keyName, code);
    await delay(100);
    const events = await evaluate("window.__onuTestInput");
    assert.ok(events.some((event) => event.type === "keydown" && event.key === keyName), `${selector} should receive ${JSON.stringify(keyName)} keydown; got ${JSON.stringify(events)}`);
    assert.ok(events.some((event) => event.type === "click"), `${selector} should activate from ${JSON.stringify(keyName)}; got ${JSON.stringify(events)}`);
  }

  async function assertHitTest(selector) {
    const target = await evaluate(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return { error: "missing" };
      node.scrollIntoView({ block: "center", inline: "center" });
      const rect = node.getBoundingClientRect();
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      const hit = document.elementFromPoint(x, y);
      return {
        x, y, width: rect.width, height: rect.height,
        hit: Boolean(hit && (hit === node || node.contains(hit))),
        hitTag: hit?.tagName ?? null,
        hitId: hit?.id ?? null,
        hitClass: hit?.className ?? null,
        disabled: Boolean(node.disabled),
      };
    })()`);
    assert.equal(target.error, undefined, `${selector} should exist`);
    assert.ok(target.width > 0 && target.height > 0, `${selector} should have a visible box`);
    assert.equal(target.disabled, false, `${selector} should be enabled`);
    assert.equal(target.hit, true, `${selector} should win hit-testing at its centre: ${JSON.stringify(target)}`);
    return target;
  }

  async function pointerClick(selector) {
    const target = await assertHitTest(selector);
    await S("Input.dispatchMouseEvent", { type: "mousePressed", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await S("Input.dispatchMouseEvent", { type: "mouseReleased", x: target.x, y: target.y, button: "left", clickCount: 1 });
    await delay(50);
  }

  async function waitForBoot() {
    try {
      return await poll("window.__onu and the rendered Onu shell", async () => evaluate(`(() => {
        const shell = document.querySelector("#app");
        const chooser = document.querySelector("#modeChooser");
        return Boolean(window.__onu && shell && chooser && shell.getBoundingClientRect().height > 0 && document.querySelectorAll("[data-mode]").length === 3);
      })()`), 15_000);
    } catch (error) {
      const diagnostic = await evaluate(`JSON.stringify({
        readyState: document.readyState,
        hook: typeof window.__onu,
        app: Boolean(document.querySelector("#app")),
        chooser: Boolean(document.querySelector("#modeChooser")),
        module: document.querySelector('script[type="module"]')?.src ?? null,
        resources: performance.getEntriesByType("resource").map((entry) => entry.name),
        bodyText: document.body?.innerText?.slice(0, 180) ?? "",
      })`);
      throw new Error(`${error.message}\nBoot diagnostic: ${diagnostic}`);
    }
  }

  async function assertNoOverflow(width, label) {
    const layout = await evaluate(`(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    }))()`);
    assert.equal(layout.clientWidth, width, `${label}: CDP should apply a true ${width}px layout viewport`);
    assert.ok(layout.scrollWidth <= layout.clientWidth + 1, `${label}: document is ${layout.scrollWidth - layout.clientWidth}px wider than its viewport`);
  }

  for (const [width, height] of VIEWPORTS) {
    const label = `${width}x${height}`;
    trace(`testing ${label}`);
    pageErrors.length = 0;
    await S("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 2, mobile: true,
      screenOrientation: { angle: 0, type: "portraitPrimary" },
    });
    await S("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });

    const loaded = new Promise((resolveLoaded) => {
      const listener = (event) => {
        const message = JSON.parse(event.data);
        if (message.method !== "Page.loadEventFired" || message.sessionId !== sessionId) return;
        ws.removeEventListener("message", listener);
        resolveLoaded();
      };
      ws.addEventListener("message", listener);
      setTimeout(resolveLoaded, 10_000);
    });
    await S("Page.navigate", { url: `${appUrl}?viewport=${width}` });
    await loaded;
    await S("Page.bringToFront");
    await waitForBoot();
    assert.deepEqual(pageErrors, [], `${label}: Onu should boot without page or console errors`);
    await assertNoOverflow(width, `${label} splash`);

    const modeCount = await evaluate("document.querySelectorAll('[data-mode]').length");
    assert.equal(modeCount, 3, `${label}: chooser should expose exactly three modes`);
    for (const mode of ["classic", "flip", "chaos"]) await assertHitTest(`[data-mode="${mode}"]`);
    await pointerClick('[data-mode="flip"]');
    assert.equal(await evaluate(`document.querySelector('[data-mode="flip"]').getAttribute("aria-pressed")`), "true", `${label}: pointer should select Flip`);
    await focusAndKey('[data-mode="chaos"]');
    assert.equal(await evaluate(`document.querySelector('[data-mode="chaos"]').getAttribute("aria-pressed")`), "true", `${label}: Enter should select Chaos`);
    await focusAndKey('[data-mode="classic"]', " ", "Space");
    assert.equal(await evaluate(`document.querySelector('[data-mode="classic"]').getAttribute("aria-pressed")`), "true", `${label}: Space should select Classic`);

    trace(`starting seeded Classic at ${label}`);
    await evaluate(`window.__onu.fast(true); window.__onu.startMode("classic", ${width})`);
    await poll("a seeded Classic hand", async () => evaluate(`Boolean(window.__onu.state?.mode === "classic" && document.querySelectorAll("#hand .card").length)`));
    const classic = await evaluate(`(() => ({
      mode: window.__onu.state.mode,
      players: window.__onu.state.players.length,
      handState: window.__onu.state.players[0].hand.length,
      handDom: document.querySelectorAll("#hand .card").length,
      handNamed: [...document.querySelectorAll("#hand .card")].every((card) => card.tagName === "BUTTON" && card.getAttribute("aria-label")),
      personalities: [...document.querySelectorAll(".personalityBtn")].map((button) => ({
        label: button.getAttribute("aria-label"), expanded: button.getAttribute("aria-expanded"), epithet: button.querySelector(".epithet")?.textContent,
      })),
      table: document.querySelector("#tableInfo")?.textContent,
      statusRole: document.querySelector("#status")?.getAttribute("role"),
    }))()`);
    assert.equal(classic.mode, "classic", `${label}: seeded match should be Classic`);
    assert.equal(classic.players, 4, `${label}: match should contain the human and three snakes`);
    assert.equal(classic.handDom, classic.handState, `${label}: rendered hand should reflect authoritative state`);
    assert.ok(classic.handDom > 0 && classic.handNamed, `${label}: hand cards should be named native buttons`);
    assert.equal(classic.personalities.length, 3, `${label}: every snake should have a personality disclosure`);
    assert.ok(classic.personalities.every((item) => item.label && item.epithet && item.expanded === "false"), `${label}: personality controls should disclose their epithets and collapsed state`);
    assert.match(classic.table, /CLASSIC ONU|ONU CLASSIC/i, `${label}: table should identify Classic Onu`);
    assert.equal(classic.statusRole, "status", `${label}: turn status should remain a live status region`);

    await evaluate("window.__onu.cancel()");
    await focusAndKey(".personalityBtn");
    const disclosure = await evaluate(`(() => ({
      expanded: document.querySelector(".personalityBtn").getAttribute("aria-expanded"),
      tell: document.querySelector(".opp .tell")?.textContent,
    }))()`);
    assert.equal(disclosure.expanded, "true", `${label}: keyboard should expand a snake personality`);
    assert.ok(disclosure.tell, `${label}: an expanded personality should reveal its playing-style tell`);
    await assertNoOverflow(width, `${label} Classic table`);

    const beforeKeep = await evaluate("JSON.stringify({ state: window.__onu.snapshot(), scores: window.__onu.scores })");
    await focusAndKey("#newBtn");
    await poll("the new-match dialog", async () => evaluate("Boolean(document.querySelector('#modalWrap[role=dialog]'))"));
    const newDialog = await evaluate(`(() => {
      const dialog = document.querySelector('#modalWrap[role="dialog"]');
      return {
        modal: dialog.getAttribute("aria-modal"),
        labelledBy: dialog.getAttribute("aria-labelledby"),
        title: document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
        buttons: [...dialog.querySelectorAll("button")].map((button) => button.textContent),
        focus: document.activeElement?.textContent,
      };
    })()`);
    assert.equal(newDialog.modal, "true", `${label}: new-match prompt should be modal`);
    assert.match(newDialog.title, /New match/i, `${label}: new-match dialog should have an accessible title`);
    assert.deepEqual(newDialog.buttons, ["Keep playing", "Rematch", "Change mode"], `${label}: new-match choices should be complete`);
    assert.equal(newDialog.focus, "Keep playing", `${label}: safe Keep playing action should receive focus`);
    await key("Enter");
    await poll("new-match dialog to close", async () => evaluate("!document.querySelector('#modalWrap')"));
    assert.equal(await evaluate("document.activeElement === document.querySelector('#newBtn')"), true, `${label}: closing new-match should restore focus`);
    assert.equal(await evaluate("JSON.stringify({ state: window.__onu.snapshot(), scores: window.__onu.scores })"), beforeKeep, `${label}: Keep playing should not reset state or scores`);

    await focusAndKey("#rulesBtn");
    await poll("the rules dialog", async () => evaluate("Boolean(document.querySelector('#modalWrap[role=dialog]'))"));
    const rules = await evaluate(`(() => {
      const dialog = document.querySelector('#modalWrap[role="dialog"]');
      return {
        modal: dialog.getAttribute("aria-modal"),
        label: document.getElementById(dialog.getAttribute("aria-labelledby"))?.textContent,
        copy: dialog.textContent,
        focus: document.activeElement?.textContent,
      };
    })()`);
    assert.equal(rules.modal, "true", `${label}: rules should use dialog semantics`);
    assert.match(rules.label, /Classic Onu rules/i, `${label}: rules heading should name the active mode`);
    assert.match(rules.copy, /Wild Draw Four/i, `${label}: Classic rules should render mode-specific copy`);
    assert.equal(rules.focus, "Understood", `${label}: rules safe action should receive focus`);
    await key("Enter");
    await poll("rules dialog to close", async () => evaluate("!document.querySelector('#modalWrap')"));
    assert.equal(await evaluate("document.activeElement === document.querySelector('#rulesBtn')"), true, `${label}: closing rules should restore focus`);

    trace(`driving required controls at ${label}`);
    await evaluate("window.__onu.fast(false)");
    const drawTop = testCard("R", "5");
    const drawn = testCard("B", "2");
    const drawState = testGame({
      hands: [[testCard("G", "1")], [testCard("Y", "2")], [testCard("G", "3")], [testCard("B", "4")]],
      top: drawTop, drawPile: [drawn],
    });
    await loadFixture(drawState);
    await poll("a human draw fixture", async () => evaluate("window.__onu.phase === 'human'"));
    await pointerClick("#drawPile");
    await poll("the draw control to mutate the hand", async () => evaluate("window.__onu.state.players[0].hand.length === 2"));
    await focusAndKey("#newBtn");
    await poll("new-match during draw sequencing", async () => evaluate("Boolean(document.querySelector('#modalWrap'))"));
    await focusAndKey("#modalWrap .btnrow button:nth-child(3)");
    await poll("draw cancellation to return to the chooser", async () => evaluate("window.__onu.state === null && window.__onu.phase === 'splash'"));
    const cancelledDraw = await evaluate("JSON.stringify({ state: window.__onu.snapshot(), phase: window.__onu.phase })");
    await delay(350);
    assert.equal(await evaluate("JSON.stringify({ state: window.__onu.snapshot(), phase: window.__onu.phase })"), cancelledDraw, `${label}: cancelling during draw sequencing should stop stale mutations`);

    await evaluate("window.__onu.fast(false)");
    const wild = testCard("W", "wild");
    const colorState = testGame({
      hands: [[wild, testCard("Y", "2")], [testCard("G", "1")], [testCard("B", "1")], [testCard("Y", "1")]],
      top: testCard("R", "5"), drawPile: [testCard("B", "7")],
    });
    await loadFixture(colorState);
    await poll("a colour-choice fixture", async () => evaluate("window.__onu.phase === 'human'"));
    await focusAndKey("#onuBtn");
    await pointerClick(`[data-card-id="${wild.id}"]`);
    await poll("the colour prompt", async () => evaluate("document.querySelector('#modalTitle')?.textContent === 'Pick a colour'"));
    await focusAndKey("#modalWrap .btnrow button:first-child");
    await poll("the colour choice to resolve", async () => evaluate(`window.__onu.state.discardPile.at(-1).id === ${JSON.stringify(wild.id)} && window.__onu.state.currentColor === "R"`));

    const seven = testCard("R", "7");
    const targetState = testGame({
      mode: "chaos",
      hands: [[seven, testCard("Y", "2")], [testCard("G", "3"), testCard("G", "4")], [testCard("B", "3")], [testCard("Y", "3")]],
      top: testCard("R", "5"), drawPile: [testCard("B", "8")],
    });
    await loadFixture(targetState);
    await poll("a target-choice fixture", async () => evaluate("window.__onu.phase === 'human'"));
    await focusAndKey("#onuBtn");
    await pointerClick(`[data-card-id="${seven.id}"]`);
    await poll("the swap-target prompt", async () => evaluate("document.querySelector('#modalTitle')?.textContent === 'Swap hands with whom?'"));
    await focusAndKey("#modalWrap .btnrow button:first-child");
    await poll("the target choice to resolve", async () => evaluate(`window.__onu.state.discardPile.at(-1).id === ${JSON.stringify(seven.id)}`));

    const caughtCard = testCard("G", "6");
    const catchState = testGame({
      mode: "chaos", catchPlayer: 1,
      hands: [[testCard("R", "1")], [caughtCard], [testCard("B", "2")], [testCard("Y", "2")]],
      top: testCard("R", "4"), drawPile: [testCard("B", "8"), testCard("G", "8")], lastPlayer: 1,
    });
    await loadFixture(catchState, { request: { type: "catch", playerIndex: 1 }, seed: 1 });
    await poll("the Catch control", async () => evaluate("!document.querySelector('#gotchaBtn').classList.contains('hidden')"));
    await pointerClick("#gotchaBtn");
    await poll("the catch penalty", async () => evaluate("window.__onu.state.players[1].hand.length === 3"));

    const humanMate = testCard("R", "5");
    const humanJumpState = testGame({
      mode: "chaos", lastPlayer: 1, turn: 2,
      hands: [[humanMate, testCard("Y", "1"), testCard("G", "1")], [testCard("B", "1")], [testCard("B", "2")], [testCard("Y", "2")]],
      top: testCard("R", "5"), drawPile: [testCard("G", "9")],
    });
    await loadFixture(humanJumpState, { request: { type: "jump", candidates: [{ playerIndex: 0, cardIndex: 0, cardId: humanMate.id }] } });
    await poll("the human Jump-In control", async () => evaluate("!document.querySelector('#jumpBtn').classList.contains('hidden')"));
    await assertHitTest("#jumpBtn");
    await key("J", "KeyJ");
    await poll("the J shortcut to play the exact match", async () => evaluate("window.__onu.state.lastPlayer === 0"));

    const aiMate = testCard("R", "6");
    const aiJumpState = testGame({
      mode: "chaos", lastPlayer: 0, turn: 2,
      hands: [[testCard("Y", "1")], [aiMate, testCard("B", "2"), testCard("G", "2")], [testCard("B", "3")], [testCard("Y", "3")]],
      top: testCard("R", "6"), drawPile: [testCard("G", "9")],
    });
    await evaluate("window.__onu.fast(false)");
    await loadFixture(aiJumpState, { request: { type: "jump", candidates: [{ playerIndex: 1, cardIndex: 0, cardId: aiMate.id }] }, seed: 1 });
    await poll("the AI Jump-In reaction lock", async () => evaluate("document.querySelector('#newBtn').disabled"));
    assert.equal(await evaluate("document.querySelector('#newBtn').click(); Boolean(document.querySelector('#modalWrap'))"), false, `${label}: new-match must not open during an AI reaction`);
    await poll("the AI Jump-In to resolve", async () => evaluate("window.__onu.state.lastPlayer === 1"), 3_000);
    await assertNoOverflow(width, `${label} required controls`);
    await evaluate("window.__onu.cancel()");

    trace(`checking seeded Flip boot at ${label}`);
    await evaluate(`window.__onu.fast(true); window.__onu.startMode("flip", ${width + 500})`);
    await poll("a seeded Flip match", async () => evaluate("window.__onu.state?.mode === 'flip'"));
    const flip = await evaluate(`(() => ({
      table: document.querySelector("#tableInfo").textContent,
      side: window.__onu.state.side,
      paired: [...window.__onu.state.drawPile, ...window.__onu.state.discardPile, ...window.__onu.state.players.flatMap((player) => player.hand)]
        .every((card) => card.faces.light && card.faces.dark),
    }))()`);
    assert.match(flip.table, /ONU FLIP/i, `${label}: hook should boot Onu Flip`);
    assert.ok(["light", "dark"].includes(flip.side) && flip.paired, `${label}: Flip should render a paired two-sided deck`);
    await evaluate("window.__onu.cancel()");

    trace(`checking seeded Chaos cancellation at ${label}`);
    await evaluate(`window.__onu.fast(false); window.__onu.startMode("chaos", ${width + 1000})`);
    await poll("a seeded Chaos match", async () => evaluate("window.__onu.state?.mode === 'chaos'"));
    assert.match(await evaluate("document.querySelector('#tableInfo').textContent"), /ONU CHAOS/i, `${label}: hook should boot Chaos`);
    await evaluate("window.__onu.cancel()");
    const cancelled = await evaluate("JSON.stringify({ state: window.__onu.snapshot(), phase: window.__onu.phase, scores: window.__onu.scores })");
    await delay(1_600);
    assert.equal(await evaluate("JSON.stringify({ state: window.__onu.snapshot(), phase: window.__onu.phase, scores: window.__onu.scores })"), cancelled, `${label}: cancellation should stop old AI/timer mutations`);
    assert.deepEqual(pageErrors, [], `${label}: interactions should produce no page or console errors`);
    await assertNoOverflow(width, `${label} Chaos table`);
  }

  console.log(`Onu browser acceptance passed at ${VIEWPORTS.map(([width, height]) => `${width}x${height}`).join(" and ")}.`);
} catch (error) {
  console.error(`Onu browser acceptance failed while ${stage}:\n${error.stack ?? error}`);
  process.exitCode = 1;
} finally {
  clearTimeout(watchdog);
  cleanup();
}
