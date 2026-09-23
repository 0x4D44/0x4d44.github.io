// Browser checks for "Inside Formula One Grand Prix": every page at phone and
// tablet width must not scroll sideways, must keep controls clear of the
// "← Almanac" pill, and must build its contents rail and pager from
// chapters.js. The Chrome harness is the Almanac's own (tests/responsive.test.mjs).
// Set F1GP_SHOTS=<dir> to also save a screenshot of each page and width.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VIEWPORTS = [
  { label: "phone", width: 390, height: 844, mobile: true },
  { label: "tablet", width: 768, height: 1024, mobile: false },
];


const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  process.env.CHROME_PATH,
].filter(Boolean);

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".jsx": "text/babel", ".css": "text/css", ".svg": "image/svg+xml",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf",
  ".txt": "text/plain", ".wasm": "application/wasm", ".zip": "application/zip",
  ".pdf": "application/pdf", ".mp3": "audio/mpeg", ".wav": "audio/wav",
};

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let chromeBin = null;
for (const c of CHROME_CANDIDATES) {
  try { await readFile(c); chromeBin = c; break; } catch { /* try next */ }
}
if (!chromeBin) {
  console.log("f1gp-internals browser test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

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

// Ask the OS for a free port, then hand it to Chrome.
const probe = createServer();
await new Promise((r) => probe.listen(0, "127.0.0.1", r));
const port = probe.address().port;
await new Promise((r) => probe.close(r));

const profile = await mkdtemp(join(tmpdir(), "f1gp-internals-browser-"));
const chrome = spawn(chromeBin, [
  "--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  "--no-sandbox", "--no-first-run", "--no-default-browser-check", "--mute-audio",
  "--disable-background-networking", "--force-prefers-reduced-motion", "about:blank",
], { detached: true, stdio: "ignore" });

const cleanup = async () => {
  try { process.kill(-chrome.pid, "SIGKILL"); } catch { /* already gone */ }
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
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++msgId;
    pending.set(id, { res, rej });
    sock.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
const S = (method, params) => send(method, params, sessionId);
await S("Page.enable");
await S("Runtime.enable");

const evaluate = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return null;
  return r.result.value;
};

const OVERFLOW = "document.documentElement.scrollWidth - document.documentElement.clientWidth";

// ...and nothing tappable may sit under the fixed "← Almanac" pill.
// /almanac-back.js pins it to the viewport's top-left with a z-index no
// document can beat, so a control underneath is not merely obscured -- it is
// unreachable, and the tap navigates to the catalog instead
// (ALM-BUG-KILN-00039). A masthead wordmark lands there naturally.
//
// Deliberately narrow, to stay an invariant rather than a nag:
//   * only interactive elements (a link half-hidden is a bug; a decorative
//     rule crossing the corner is not);
//   * measured at scroll-top, because ordinary body copy passing under the
//     pill as you scroll is inherent to a fixed overlay, not a document bug;
//   * a 6px overlap in BOTH axes, so a 2px sliver off a centred container
//     does not fail the suite.
// The remedy is an inset on the header so its first content starts at
// x >= 112px — see instruments/piano.css or any of the 16 fixed in this repo.
const UNDER_PILL = `(() => {
  const de = document.documentElement;
  de.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  const host = [...de.querySelectorAll("*")].find(e => e.shadowRoot && e.shadowRoot.querySelector("a"));
  if (!host) return [];                       // catalog index, or pill not mounted
  const b = host.getBoundingClientRect();
  if (!(b.width > 10 && b.width < 220)) return [];
  const out = [];
  for (const el of document.querySelectorAll("a, button, input, select, textarea, [role=button]")) {
    if (host.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    const ow = Math.min(r.right, b.right) - Math.max(r.left, b.left);
    const oh = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
    if (ow < 6 || oh < 6) continue;
    out.push({ tag: el.tagName.toLowerCase(), text: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40) });
    if (out.length >= 3) break;
  }
  return out;
})()`;


// Every page of the site, not just its index: the Almanac-wide responsive test
// only loads <slug>/index.html, so the eleven chapter pages need their own run.
const nav = await readFile(join(ROOT, "f1gp-internals", "chapters.js"), "utf8");
const pages = ["index.html", ...[...nav.matchAll(/\["(\d\d-[a-z-]+\.html)"/g)].map((m) => m[1])];
if (pages.length !== 13) { await cleanup(); throw new Error(`expected 13 pages, found ${pages.length}`); }

// The navigation is built by chapters.js at load; a script error leaves an
// empty rail and no pager, which the static test cannot see.
const NAV = `(() => ({
  toc: document.querySelectorAll("nav.toc a").length,
  pager: document.querySelectorAll("nav.pager a").length,
  current: document.querySelectorAll('nav.toc a[aria-current="page"]').length,
}))()`;

const shots = process.env.F1GP_SHOTS;
const failures = [];
for (const page of pages) {
  for (const vp of VIEWPORTS) {
    await S("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await S("Page.navigate", { url: `${base}/f1gp-internals/${page}` });
    for (let i = 0; i < 80; i++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await delay(100);
    }
    await delay(450);
    const label = `${page} @ ${vp.label} (${vp.width}px)`;
    const over = await evaluate(OVERFLOW);
    if (over === null) { failures.push(`${label}: page threw while measuring`); continue; }
    if (over > 1) failures.push(`${label}: scrolls sideways by ${over}px`);
    const buried = await evaluate(UNDER_PILL);
    for (const b of buried || []) failures.push(`${label}: <${b.tag}> ${JSON.stringify(b.text)} is under the back pill`);
    const n = await evaluate(NAV);
    if (!n || n.toc < 13) failures.push(`${label}: contents rail has ${n?.toc ?? 0} links`);
    if (!n || n.current !== 1) failures.push(`${label}: ${n?.current ?? 0} contents links marked current`);
    if (!n || n.pager < 1) failures.push(`${label}: no chapter pager`);
    if (shots) {
      const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
      await writeFile(join(shots, `${page.replace(".html", "")}-${vp.width}.png`), Buffer.from(data, "base64"));
    }
  }
}

await cleanup();

if (failures.length) {
  console.error(`\nf1gp-internals browser test: ${failures.length} failure(s)\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`f1gp-internals browser test: ${pages.length} pages, navigation built, no horizontal overflow and nothing under the back pill, at 390px and 768px.`);
