// No document may scroll sideways on a phone or a tablet.
//
// Loads every <slug>/index.html in a real headless Chrome and asserts
//   documentElement.scrollWidth - documentElement.clientWidth <= 1
// at 390x844 and 768x1024.
//
// Two things about the measurement are load-bearing:
//
//   * clientWidth, not window.innerWidth. Under Chrome's mobile emulation
//     innerWidth reports the scaled VISUAL viewport, which hides the overflow
//     completely -- a page 1020px too wide measures as 0.
//   * the border box of an element is not the whole story. A <pre> with
//     white-space:pre and overflow visible measures as fitting while its text
//     hangs outside, and a decorative ::before with a negative inset has no
//     element to measure at all. scrollWidth catches both; a DOM scan does not.
//
// When this fails, the fix is in the named document's CSS, not here. The usual
// causes, in rough order of frequency: a collapsed grid track written as a bare
// 1fr (which means minmax(auto, 1fr), and that auto floor is the item's
// min-content width -- use minmax(0, 1fr)); a code block or data table that
// should scroll inside its own box; a nav row that should wrap; a fixed-size
// illustration that needs a max-width; a full-bleed 100vw decoration (100vw
// counts the scrollbar gutter).

import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const VIEWPORTS = [
  { label: "phone", width: 390, height: 844, mobile: true },
  { label: "tablet", width: 768, height: 1024, mobile: false },
];

// Directories that are repo-meta or asset stores, not catalog documents.
const SKIP = new Set(["node_modules", "tests", "wrk_journals", "wrk_docs", "bugs", "reqs", "issues"]);

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
  console.log("Responsive test: no Chrome found; skipping. Set CHROME_PATH to run it.");
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

const profile = await mkdtemp(join(tmpdir(), "responsive-"));
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

const slugs = [];
for (const entry of await readdir(ROOT, { withFileTypes: true })) {
  if (!entry.isDirectory() || entry.name.startsWith(".") || SKIP.has(entry.name)) continue;
  try { await readFile(join(ROOT, entry.name, "index.html")); slugs.push(entry.name); }
  catch { /* not a document */ }
}
slugs.sort();
if (slugs.length < 100) { await cleanup(); throw new Error(`only found ${slugs.length} documents — is the walk right?`); }

const failures = [];
for (const slug of slugs) {
  for (const vp of VIEWPORTS) {
    await S("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    // Re-navigate per viewport rather than resizing in place: several documents
    // lay themselves out once from JS on load and never recompute on resize.
    await S("Page.navigate", { url: `${base}/${slug}/` });
    for (let i = 0; i < 80; i++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await delay(100);
    }
    await delay(450);
    const over = await evaluate(OVERFLOW);
    if (over === null) { failures.push(`${slug} @ ${vp.label}: page threw while measuring`); continue; }
    if (over > 1) failures.push(`${slug} @ ${vp.label} (${vp.width}px): scrolls sideways by ${over}px`);
  }
}

await cleanup();

if (failures.length) {
  console.error(`\nResponsive test: ${failures.length} failure(s) across ${slugs.length} documents\n`);
  for (const f of failures) console.error(`  ${f}`);
  console.error("\nA document must not scroll sideways. Fix it in that document's CSS —");
  console.error("see the notes at the top of tests/responsive.test.mjs for the usual causes.\n");
  process.exit(1);
}
console.log(`Responsive test: ${slugs.length} documents, no horizontal overflow at 390px or 768px.`);
