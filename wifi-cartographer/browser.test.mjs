// Real-browser checks for the Wi-Fi Cartographer discovery page.
//
// Two things here are invisible to tests/validate-static.mjs, because both are
// facts about layout that only a browser computes:
//
//   * horizontal overflow. This page scrolled sideways by 655px at every width
//     at or below 840px, because the @media override used a bare `1fr` where
//     the desktop rule uses `minmax(0,1fr)` — and `1fr` means `minmax(auto,1fr)`,
//     whose `auto` floor is the item's MIN-CONTENT width. The unbreakable
//     1320px CSV sample in the exports panel set that floor.
//
//   * the shared /almanac-back.js pill being genuinely tappable. The pill is
//     fixed at the top-left at a z-index nothing on the page can beat, so
//     anything of ours placed there is not merely obscured, it steals the tap
//     (ALM-BUG-KILN-00039). Only document.elementFromPoint proves this; a
//     synthetic .click() bypasses hit-testing entirely.
//
// Modelled on game-of-dracula/browser.test.mjs.

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
  ".png": "image/png",
};

// 900 and 1440 sit above the 840px breakpoint (two columns); the rest below it
// (one column). 841 is the first width the override applies to at all — the
// regression lived entirely on that side of the boundary.
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844 },
  { name: "phone-landscape", width: 600, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "breakpoint", width: 840, height: 1000 },
  { name: "small-desktop", width: 900, height: 1000 },
  { name: "desktop", width: 1440, height: 1000 },
];

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
  console.error(`Wi-Fi Cartographer browser test timed out while ${stage}.`);
  cleanup();
  process.exit(2);
}, 180_000);
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
    let body;
    try {
      body = await readFile(path);
    } catch {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    response.end(body);
  });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  const appUrl = `http://127.0.0.1:${server.address().port}/wifi-cartographer/`;

  stage = "launching Chrome";
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "wifi-cartographer-browser-"));
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
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((argument) => argument.description ?? argument.value).join(" ");
      if (!isGenericLoadFailure(text)) pageErrors.push(text);
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

  async function evaluate(expression) {
    const result = await session("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }

  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };

  for (const viewport of VIEWPORTS) {
    stage = `loading at ${viewport.name}`;
    await session("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: viewport.width < 700,
    });
    pageErrors = [];
    await session("Page.navigate", { url: appUrl });
    await poll(`the page to mount the almanac pill at ${viewport.name}`, async () =>
      evaluate(`Boolean(document.getElementById("almanac-back-host"))`));
    await delay(200);
    const at = (message) => `[${viewport.name} ${viewport.width}px] ${message}`;

    // --- no sideways scroll, at any width -------------------------------
    const layout = await evaluate(`(() => {
      const de = document.documentElement;
      const over = de.scrollWidth - de.clientWidth;
      const widest = [...document.querySelectorAll("body *")]
        .map(el => ({ el, r: el.getBoundingClientRect() }))
        .filter(x => x.r.right > de.clientWidth + 1 && x.r.width > 0)
        .sort((a, b) => b.r.right - a.r.right)[0];
      return {
        over,
        tracks: getComputedStyle(document.querySelector(".grid.two")).gridTemplateColumns,
        widest: widest ? widest.el.tagName + (widest.el.id ? "#" + widest.el.id : "") + " w=" + Math.round(widest.r.width) : null,
        // The long CSV sample is meant to scroll inside its own <pre>, never to
        // widen the page.
        preContainsItsOwnOverflow: [...document.querySelectorAll("pre")]
          .every(pre => pre.getBoundingClientRect().width <= de.clientWidth + 1),
      };
    })()`);
    check(layout.over <= 1, at(`page scrolls sideways by ${layout.over}px (grid tracks "${layout.tracks}", widest ${layout.widest})`));
    check(layout.preContainsItsOwnOverflow, at("a <pre> is wider than the viewport instead of scrolling internally"));

    // --- the shared back pill is real and reachable ----------------------
    const pill = await evaluate(`(() => {
      const host = document.getElementById("almanac-back-host");
      const link = host.shadowRoot && host.shadowRoot.querySelector("a");
      const b = link.getBoundingClientRect();
      const under = [...document.querySelectorAll("a,button,input,select,textarea,[tabindex]")]
        .filter(el => { const r = el.getBoundingClientRect();
          return r.width && r.height && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top; })
        .map(el => el.tagName + (el.id ? "#" + el.id : ""));
      return {
        href: link.getAttribute("href"),
        clickable: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === host,
        under,
        ownBackLinks: document.querySelectorAll('a[href="../"]').length,
      };
    })()`);
    check(pill.href === "/", at(`the pill links to ${pill.href} rather than the catalog root`));
    check(pill.clickable, at("something covers the shared almanac pill"));
    check(pill.under.length === 0, at(`interactive elements sit under the pill and will steal its taps: ${pill.under.join(", ")}`));
    check(pill.ownBackLinks === 0, at("the document reintroduced its own back link, which duplicates the pill and sits under it"));

    check(pageErrors.length === 0, at(`console/page errors: ${pageErrors.join(" | ")}`));
  }

  if (failures.length) {
    console.error(`\nWi-Fi Cartographer browser test: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    throw new assert.AssertionError({ message: `${failures.length} browser check(s) failed` });
  }

  console.log(`Wi-Fi Cartographer browser test: all checks passed at ${VIEWPORTS.map((v) => `${v.width}px`).join(", ")}.`);
  clearTimeout(watchdog);
  cleanup();
  process.exit(0);
} catch (error) {
  console.error(`Wi-Fi Cartographer browser test failed while ${stage}:`);
  console.error(error?.message ?? error);
  cleanup();
  process.exit(1);
}
