// Coming back to the almanac by the "← Almanac" pill restores the view the
// reader left: the open shelf, the search text and the scroll position.
// A fresh visit still lands at the top, on the shelf tiles.
//
// The pill (almanac-back.js) sets a sessionStorage flag on click; app.js saves
// its view on pagehide and restores it when that flag is set. This drives both
// halves in a real headless Chrome, at phone size so a shelf is long enough to
// scroll. Set CHROME_PATH if Chrome is not in a standard place.

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import os, { tmpdir } from "node:os";

try { os.setPriority(0, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch { /* best effort */ }

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOC = "higher-graphic-communication/"; // any document page that carries the pill
const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
};
const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser",
].filter(Boolean);
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let chromeBin = null;
for (const c of CHROME_CANDIDATES) {
  try { await readFile(c); chromeBin = c; break; } catch { /* try next */ }
}
if (!chromeBin) { console.log("Almanac return test: no Chrome found; skipping. Set CHROME_PATH to run it."); process.exit(0); }

const server = createServer(async (req, res) => {
  const p = decodeURIComponent(new URL(req.url, "http://local").pathname);
  const path = resolve(ROOT, (p.endsWith("/") ? `${p}index.html` : p).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  let body;
  try { body = await readFile(path); } catch { res.writeHead(404).end(); return; }
  res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" }).end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));

const profile = await mkdtemp(join(tmpdir(), "almanac-return-"));
const chrome = spawn(chromeBin, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-background-networking", "--force-prefers-reduced-motion", "about:blank",
], { detached: process.platform !== "win32", stdio: "ignore", windowsHide: true });

const cleanup = async () => {
  if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(chrome.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
  else try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* already gone */ }
  server.close();
  await rm(profile, { recursive: true, force: true }).catch(() => {});
};

let wsUrl;
for (let i = 0; i < 300; i++) {
  try { wsUrl = (await (await fetch(`http://127.0.0.1:${port}/json/version`)).json()).webSocketDebuggerUrl; break; }
  catch { await delay(100); }
}
if (!wsUrl) { await cleanup(); throw new Error("Chrome did not expose a debugging endpoint"); }

const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let msgId = 0;
const pending = new Map();
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (!m.id || !pending.has(m.id)) return;
  const { res, rej } = pending.get(m.id);
  pending.delete(m.id);
  m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
};
const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { res, rej });
  sock.send(JSON.stringify({ id, method, params, sessionId }));
});

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (method, params) => send(method, params, sessionId);
await S("Page.enable");
await S("Runtime.enable");
await S("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

const evaluate = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`page threw: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result.value;
};
const safeEval = (expr) => evaluate(expr).catch(() => null);
async function waitFor(expr, what, ms = 10000) {
  for (let t = 0; t < ms; t += 100) {
    if (await safeEval(expr)) return;
    await delay(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}
const onAlmanac = `location.pathname === "/" && document.readyState === "complete" && document.querySelector("#listing") && document.querySelector("#listing").children.length > 0`;
async function openAlmanac() {
  await S("Page.navigate", { url: `${base}/` });
  await waitFor(onAlmanac, "the almanac to render");
  await delay(400);
}
// Leave for a document, then come back by clicking its "← Almanac" pill.
async function roundTrip() {
  await S("Page.navigate", { url: `${base}/${DOC}` });
  await waitFor(`location.pathname === "/${DOC}" && document.readyState === "complete" && !!document.getElementById("almanac-back-host")`, "the document and its pill");
  await evaluate(`document.getElementById("almanac-back-host").shadowRoot.querySelector("a").click()`);
  await waitFor(onAlmanac, "the almanac after the pill click");
  await delay(600); // past the load / fonts re-apply
}
const view = () => evaluate(`({
  y: Math.round(window.scrollY),
  shelf: (document.querySelector(".shelf-bar-name") || {}).textContent || null,
  tiles: !!document.querySelector(".tiles"),
  query: (document.getElementById("search-input") || {}).value || "",
})`);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

try {
  // 1. An open shelf, scrolled well down, comes back as it was left.
  await openAlmanac();
  const shelfName = await evaluate(`(() => {
    const tiles = [...document.querySelectorAll(".tile")];
    const count = (t) => parseInt(t.querySelector(".tile-count").textContent, 10) || 0;
    const big = tiles.sort((a, b) => count(b) - count(a))[0];
    const name = big.querySelector(".tile-name").textContent;
    big.click();
    return name;
  })()`);
  await delay(300);
  const target = await evaluate(`(() => {
    document.documentElement.style.scrollBehavior = "auto";
    const y = Math.round((document.documentElement.scrollHeight - innerHeight) * 0.6);
    window.scrollTo(0, y);
    return Math.round(window.scrollY);
  })()`);
  check(target > 800, `the biggest shelf should scroll well past 800px at 390px wide, got ${target}px`);
  await roundTrip();
  let v = await view();
  check(v.shelf === shelfName, `pill return: expected shelf "${shelfName}" open, got ${JSON.stringify(v.shelf)}`);
  check(Math.abs(v.y - target) <= 2, `pill return: expected scroll ${target}px, got ${v.y}px`);

  // 2. A fresh visit is not a return: top of the page, on the tiles.
  await openAlmanac();
  v = await view();
  check(v.tiles && v.shelf === null, `fresh visit: expected the shelf tiles, got shelf ${JSON.stringify(v.shelf)}`);
  check(v.y === 0, `fresh visit: expected scroll 0, got ${v.y}px`);

  // 3. A live search comes back with its text and its results.
  await evaluate(`(() => {
    const box = document.getElementById("search-input");
    box.value = "rail";
    box.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(300);
  const searchY = await evaluate(`(() => {
    document.documentElement.style.scrollBehavior = "auto";
    window.scrollTo(0, 600);
    return Math.round(window.scrollY);
  })()`);
  await roundTrip();
  v = await view();
  check(v.query === "rail", `search return: expected the box to hold "rail", got ${JSON.stringify(v.query)}`);
  check(!v.tiles, "search return: expected search results, got the shelf tiles");
  check(Math.abs(v.y - searchY) <= 2, `search return: expected scroll ${searchY}px, got ${v.y}px`);
} finally {
  await cleanup();
}

if (failures.length) {
  console.error(`\nAlmanac return test: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log("Almanac return test: the pill brings back the open shelf, the search and the scroll position; a fresh visit lands on the tiles at the top.");
