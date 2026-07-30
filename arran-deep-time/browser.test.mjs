// Real-browser checks for "Arran: Island of Deep Time".
//
// Serves the unmodified production files over HTTP and drives real Chrome over
// CDP. Two things here cannot be proved any other way:
//
//   * the shared /almanac-back.js pill genuinely mounts and is genuinely
//     clickable on this page — asserted with document.elementFromPoint, not a
//     synthetic .click(), because hit-testing is exactly what a fixed overlay
//     breaks (lessons_learnt; ALM-BUG-KILN-00039);
//   * the document's own top-left controls (the skip link) do not land under
//     that pill at any viewport.
//
// It also walks every interactive control group at three viewports and fails on
// any console error, page exception, unexpected 404, or horizontal overflow.
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
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1000 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
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
  console.error(`Arran browser test timed out while ${stage}.`);
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
  const appUrl = `${catalogUrl}arran-deep-time/`;

  stage = "launching Chrome";
  const debugPort = await freePort();
  const profile = await mkdtemp(join(tmpdir(), "arran-browser-"));
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
  // The repo has no /favicon.ico; this document supplies a data: URI icon, so
  // nothing here should 404 at all — but keep the same named-exclusion shape
  // the other documents use rather than blanket-ignoring load failures.
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
    if (message.method === "Runtime.exceptionThrown") {
      const detail = message.params.exceptionDetails;
      pageErrors.push(detail.exception?.description ?? detail.text);
    } else if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
      const text = message.params.args.map((argument) => argument.description ?? argument.value).join(" ");
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

  const ATLAS_READY = `Boolean(document.getElementById("timeCanvas") && document.getElementById("almanac-back-host"))`;
  const CATALOG_READY = `Boolean(document.querySelector("#listing a[href]"))`;

  async function loadAt(url, width, height, readyExpression = ATLAS_READY) {
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
    // Let the injected pill settle and the first scroll pass run.
    await delay(150);
  }

  const failures = [];
  const check = (ok, message) => { if (!ok) failures.push(message); };

  for (const viewport of VIEWPORTS) {
    stage = `loading the atlas at ${viewport.name}`;
    await loadAt(appUrl, viewport.width, viewport.height);
    const at = (message) => `[${viewport.name} ${viewport.width}x${viewport.height}] ${message}`;

    // --- the shared back pill actually works here -------------------------
    stage = `checking the almanac pill at ${viewport.name}`;
    const pill = await evaluate(`(() => {
      const host = document.getElementById("almanac-back-host");
      if (!host) return { mounted: false };
      const link = host.shadowRoot && host.shadowRoot.querySelector("a");
      const box = (link || host).getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        mounted: true,
        href: link ? link.getAttribute("href") : null,
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        // The pill lives in a shadow root, so the topmost element the document
        // sees at that point must be the host itself. Anything else means some
        // other layer is eating the tap.
        hitIsPill: hit === host,
        hitTag: hit ? (hit.id || hit.className || hit.tagName) : null,
      };
    })()`);
    check(pill.mounted, at("the shared /almanac-back.js pill did not mount"));
    check(pill.href === "/", at(`the pill links to ${pill.href} rather than the catalog root`));
    check(pill.hitIsPill, at(`something covers the pill: elementFromPoint returned ${pill.hitTag}`));

    // --- the document's own top-left control is not buried under it -------
    stage = `checking the skip link at ${viewport.name}`;
    const skip = await evaluate(`(() => {
      const link = document.querySelector("a.skip");
      link.focus();
      const box = link.getBoundingClientRect();
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const hit = document.elementFromPoint(cx, cy);
      return {
        focused: document.activeElement === link,
        visible: box.top >= 0,
        box: { left: box.left, top: box.top, right: box.right, bottom: box.bottom },
        hitIsSkip: hit === link,
        hitTag: hit ? (hit.id || hit.className || hit.tagName) : null,
        target: link.getAttribute("href"),
      };
    })()`);
    check(skip.focused && skip.visible, at("the skip link does not reveal itself on focus"));
    check(skip.hitIsSkip, at(`the skip link is covered by ${skip.hitTag}`));
    const overlaps = skip.box.left < pill.box.right && skip.box.right > pill.box.left
      && skip.box.top < pill.box.bottom && skip.box.bottom > pill.box.top;
    check(!overlaps, at(`the focused skip link overlaps the pill (skip ${JSON.stringify(skip.box)} vs pill ${JSON.stringify(pill.box)})`));

    // --- no sideways scroll ----------------------------------------------
    stage = `checking overflow at ${viewport.name}`;
    const overflow = await evaluate(`(() => {
      const wide = [...document.querySelectorAll("body *")]
        .filter(el => el.getBoundingClientRect().right > innerWidth + 1)
        .filter(el => getComputedStyle(el).overflowX !== "auto" && getComputedStyle(el).overflowX !== "scroll")
        .slice(0, 4)
        .map(el => el.tagName + (el.id ? "#" + el.id : "") + (el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""));
      return { scrollWidth: document.documentElement.scrollWidth, innerWidth, wide };
    })()`);
    check(overflow.scrollWidth <= overflow.innerWidth + 1,
      at(`horizontal overflow: scrollWidth ${overflow.scrollWidth} > ${overflow.innerWidth}; widest: ${overflow.wide.join(", ")}`));

    // --- the selected route pin keeps its number --------------------------
    // A CSS transform on an SVG shape resolves transform-origin against the
    // whole SVG viewport by default (transform-box: view-box), not the shape.
    // .route-pin.on circle{transform:scale(1.15)} therefore flung the selected
    // pin's disc ~49px away from its own number — further than the pin's own
    // radius, so the number ended up outside the disc entirely. Only a real
    // browser lays this out, so only a real browser can catch it.
    stage = `checking route-pin geometry at ${viewport.name}`;
    const pins = await evaluate(`[...document.querySelectorAll('[data-route]')].map(pin => {
      const c = pin.querySelector('circle').getBoundingClientRect();
      const t = pin.querySelector('text').getBoundingClientRect();
      return {
        route: pin.dataset.route,
        on: pin.classList.contains('on'),
        offset: Math.hypot((c.left + c.right) / 2 - (t.left + t.right) / 2,
                           (c.top + c.bottom) / 2 - (t.top + t.bottom) / 2),
        radius: c.width / 2,
      };
    })`);
    check(pins.length === 6, at(`expected six route pins, found ${pins.length}`));
    for (const pin of pins) {
      check(pin.offset < 2,
        at(`route pin ${pin.route}${pin.on ? " (selected)" : ""} has its number ${pin.offset.toFixed(1)}px off the disc centre`));
    }
    check(pins.some((p) => p.on && p.radius > pins.find((q) => !q.on).radius),
      at("the selected route pin no longer reads as larger than the others"));

    // --- every interactive group cycles -----------------------------------
    stage = `driving the controls at ${viewport.name}`;
    const drive = await evaluate(`(async () => {
      const $$ = (s) => [...document.querySelectorAll(s)];
      const out = {};
      // SVG elements have no HTMLElement.click(), so dispatch a bubbling click
      // rather than special-casing the two markup families.
      const tap = (node) => node.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      const cycle = (selector, key) => {
        const nodes = $$(selector);
        out[key] = { count: nodes.length, clicked: 0 };
        for (const node of nodes) { tap(node); out[key].clicked++; }
      };
      cycle('[data-layer]', 'mapLayers');
      cycle('[data-unit]', 'geoUnits');
      cycle('.h-step', 'huttonSteps');
      cycle('[data-route]', 'routePins');
      cycle('#routeTabs button', 'routeTabs');
      cycle('#rockList button', 'specimens');
      cycle('#eraButtons button', 'peopleEras');

      // Range inputs: sweep both, reading the live readouts back.
      const sweep = (id, values) => {
        const input = document.getElementById(id);
        if (!input) return null;
        const seen = [];
        for (const value of values) {
          input.value = String(value);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          seen.push(value);
        }
        return seen.length;
      };
      out.timeActs = sweep('timeRange', [0,1,2,3,4,5,6,7]);
      out.peopleSweep = sweep('peopleRange', [0,1,2,3,4]);

      // The glacier readout regression: every non-zero slider position must
      // report non-zero work, and the readout must actually change.
      const ice = document.getElementById('iceRange');
      const readout = document.getElementById('iceReadout');
      const readouts = [];
      for (const value of [0, 5, 10, 17, 18, 40, 80, 100]) {
        ice.value = String(value);
        ice.dispatchEvent(new Event('input', { bubbles: true }));
        readouts.push({ value, text: (readout.textContent || '').trim() });
      }
      out.iceReadouts = readouts;
      out.distinctIceReadouts = new Set(readouts.map(r => r.text)).size;
      return out;
    })()`);

    for (const [group, result] of Object.entries(drive)) {
      if (result && typeof result === "object" && "count" in result) {
        check(result.count > 0, at(`no controls matched for "${group}"`));
        check(result.clicked === result.count, at(`only ${result.clicked}/${result.count} "${group}" controls accepted a click`));
      }
    }
    check(drive.timeActs === 8, at(`the deep-time machine did not accept all 8 acts (got ${drive.timeActs})`));
    const zeroClaims = drive.iceReadouts.filter((r) => r.value > 0 && /(^|\D)0\s*%/.test(r.text));
    check(zeroClaims.length === 0,
      at(`the glacier readout still claims zero work at non-zero settings: ${JSON.stringify(zeroClaims)}`));
    check(drive.distinctIceReadouts >= 4, at(`the glacier readout barely changes across its range (${drive.distinctIceReadouts} distinct values)`));

    // --- aria-pressed is maintained on the selection controls -------------
    const aria = await evaluate(`(() => {
      const groups = ['[data-layer]', '[data-unit]', '.h-step', '[data-route]', '#rockList button', '#routeTabs button'];
      const bad = [];
      for (const selector of groups) {
        const nodes = [...document.querySelectorAll(selector)];
        const on = nodes.filter(n => n.getAttribute('aria-pressed') === 'true').length;
        const missing = nodes.filter(n => n.getAttribute('aria-pressed') === null).length;
        if (nodes.length && (missing || on !== 1)) bad.push({ selector, total: nodes.length, on, missing });
      }
      return bad;
    })()`);
    check(aria.length === 0, at(`selection state is not exposed as exactly one aria-pressed="true": ${JSON.stringify(aria)}`));

    // --- reduced motion renders a real static scene -----------------------
    stage = `checking reduced motion at ${viewport.name}`;
    await session("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-motion", value: "reduce" }] });
    await loadAt(appUrl, viewport.width, viewport.height);
    const still = await evaluate(`(() => {
      const canvas = document.getElementById('timeCanvas');
      canvas.scrollIntoView();
      const context = canvas.getContext('2d');
      const painted = context.getImageData(0, 0, canvas.width, canvas.height).data.some(v => v !== 0);
      return { painted, width: canvas.width, height: canvas.height };
    })()`);
    check(still.painted, at("under prefers-reduced-motion the deep-time canvas renders nothing at all"));
    await session("Emulation.setEmulatedMedia", { features: [] });

    check(pageErrors.length === 0, at(`console/page errors: ${pageErrors.join(" | ")}`));
    check(unexpectedMissing().length === 0, at(`unexpected failed requests: ${JSON.stringify(unexpectedMissing())}`));
  }

  // --- the catalog links to it, in the same tab, and renders its card ------
  stage = "checking the catalog card";
  // The landing is the shelf-tile view, which shows no document links until a
  // shelf is opened. Seed the persisted UI state to the flat list so the card
  // is on screen deterministically.
  await loadAt(catalogUrl, 1440, 1000, `Boolean(document.getElementById("listing"))`);
  await evaluate(`localStorage.setItem("0x4d44.listing.v1", JSON.stringify({ group: "flat", layout: "table", sort: "recent", filter: "all" })), true`);
  await loadAt(catalogUrl, 1440, 1000, CATALOG_READY);
  const card = await evaluate(`(() => {
    const link = [...document.querySelectorAll('#listing a[href]')]
      .find(a => a.getAttribute('href').includes('arran-deep-time'));
    if (!link) return { found: false, hrefs: [...document.querySelectorAll('#listing a[href]')].length };
    const use = link.querySelector('use, svg use');
    return {
      found: true,
      target: link.getAttribute('target'),
      symbol: use ? (use.getAttribute('href') || use.getAttribute('xlink:href')) : null,
      text: link.textContent.replace(/\\s+/g, ' ').trim().slice(0, 80),
      pill: Boolean(document.getElementById('almanac-back-host')),
    };
  })()`);
  check(card.found, `the catalog listing has no link to arran-deep-time (listing has ${card.hrefs} links)`);
  check(card.target !== "_blank", "catalog links must open in the same tab");
  check(card.symbol !== "#ill-diesel", `the card fell back to the default locomotive icon (${card.symbol})`);
  check(card.pill === false, "the back pill must never inject on the almanac index itself");

  if (failures.length) {
    console.error(`\nArran browser test: ${failures.length} failure(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    throw new assert.AssertionError({ message: `${failures.length} browser check(s) failed` });
  }

  console.log(`Arran browser test: all checks passed at ${VIEWPORTS.map((v) => v.name).join(", ")}.`);
  clearTimeout(watchdog);
  cleanup();
  process.exit(0);
} catch (error) {
  console.error(`Arran browser test failed while ${stage}:`);
  console.error(error?.message ?? error);
  cleanup();
  process.exit(1);
}
