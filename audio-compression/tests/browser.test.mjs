// Real-browser checks for "Throwing Sound Away".
//
// Serves the repository unmodified, drives headless Chrome over CDP, and for
// EVERY page of the study asserts:
//   * the page loads with no uncaught error and no console error;
//   * no subresource 404s;
//   * the shared chapter nav rendered, and the rail's anchors all resolve;
//   * documentElement.scrollWidth - clientWidth <= 1 at 390x844 and 768x1024
//     (tests/responsive.test.mjs only visits <slug>/index.html, so the other
//     thirteen pages would otherwise never be measured);
//   * nothing interactive sits under the fixed "← Almanac" pill;
//   * the DSP kit is numerically sound in the real engine: MDCT/IMDCT
//     overlap-add reconstructs its input, and the toy codec hits a requested
//     bitrate.
//
// Failures name the page and the measurement. The fix is in that page's markup
// or in assets/site.css — never in this file.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { tmpdir } from "node:os";

const HERE = import.meta.dirname;
const DOC = resolve(HERE, "..");
const ROOT = resolve(DOC, "..");

const PAGES = [
  "index.html", "1-sound.html", "2-ear.html", "3-masking.html", "4-transform.html",
  "5-quantize.html", "6-entropy.html", "7-mp3.html", "8-aac.html", "9-opus.html",
  "10-lossless.html", "11-artifacts.html", "12-choosing.html", "lexicon.html",
];
const VIEWPORTS = [
  { label: "phone", width: 390, height: 844, mobile: true },
  { label: "tablet", width: 768, height: 1024, mobile: false },
];

const CHROME = process.env.CHROME_PATH ?? [
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].find((c) => existsSync(c));

if (!CHROME) {
  console.log("audio-compression browser test: no Chrome found; skipping. Set CHROME_PATH to run it.");
  process.exit(0);
}

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".svg": "image/svg+xml", ".json": "application/json",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2",
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const missing = [];

const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, "http://local").pathname);
  const path = resolve(ROOT, (pathname.endsWith("/") ? `${pathname}index.html` : pathname).replace(/^[/\\]+/, ""));
  if (!path.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  try {
    const body = await readFile(path);
    res.writeHead(200, { "content-type": MIME[extname(path)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    if (pathname !== "/favicon.ico") missing.push(pathname);
    res.writeHead(404).end("not found");
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/audio-compression/`;

const profile = await mkdtemp(join(tmpdir(), "audio-compression-chrome-"));
const chrome = spawn(CHROME, [
  "--headless=new", "--remote-debugging-port=0", "--no-sandbox",
  "--disable-gpu", "--disable-dev-shm-usage", "--no-first-run", "--mute-audio",
  "--disable-background-networking", "--force-prefers-reduced-motion",
  `--user-data-dir=${profile}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

let wsUrl = "";
await new Promise((res, rej) => {
  const timeout = setTimeout(() => rej(new Error("Chrome did not start")), 30_000);
  chrome.stderr.on("data", (chunk) => {
    const m = /ws:\/\/[^\s]+/.exec(chunk.toString());
    if (m && !wsUrl) { wsUrl = m[0]; clearTimeout(timeout); res(); }
  });
  chrome.once("exit", (code) => {
    if (!wsUrl) { clearTimeout(timeout); rej(new Error(`Chrome exited before CDP was ready (${code})`)); }
  });
});

const sock = new WebSocket(wsUrl);
await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
let msgId = 0;
const pending = new Map();
const events = [];
sock.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.method) { events.push(m); return; }
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
const S = (m, p) => send(m, p, sessionId);
await S("Page.enable");
await S("Runtime.enable");
await S("Log.enable");

const evaluate = async (expression) => {
  const r = await S("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails));
  }
  return r.result.value;
};

const UNDER_PILL = `(() => {
  const de = document.documentElement;
  de.style.scrollBehavior = "auto";
  window.scrollTo(0, 0);
  const host = [...de.querySelectorAll("*")].find(e => e.shadowRoot && e.shadowRoot.querySelector("a"));
  if (!host) return ["no pill mounted"];
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
    out.push(el.tagName.toLowerCase() + ":" + (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 40));
    if (out.length >= 3) break;
  }
  return out;
})()`;

// Scroll the whole page once, so every figure that defers its first draw to an
// IntersectionObserver has actually mounted before we look at it.
const SCROLL_THROUGH = `(() => {
  const de = document.documentElement;
  const step = Math.max(200, window.innerHeight * 0.8);
  for (let y = 0; y < de.scrollHeight; y += step) window.scrollTo(0, y);
  window.scrollTo(0, 0);
  return de.scrollHeight;
})()`;

// A canvas that was sized but never drawn on is a figure that silently failed.
// It passes every other check here — no console error, no overflow, the right
// number of elements — and it is exactly how a broken figure reaches a reader.
// A single uniform colour across the whole bitmap means nothing was drawn;
// figures that wait for a button still paint their axes and a prompt.
const BLANK_CANVASES = `(() => {
  const out = [];
  for (const c of document.querySelectorAll("canvas")) {
    const id = c.id || "(unnamed)";
    if (!c.width || !c.height) { out.push(id + ": zero-sized"); continue; }
    let d;
    try { d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; }
    catch (e) { continue; }                      // WebGL or tainted: not our business
    const r0 = d[0], g0 = d[1], b0 = d[2], a0 = d[3];
    let varied = false;
    for (let i = 4; i < d.length; i += 4 * 101) {
      if (d[i] !== r0 || d[i+1] !== g0 || d[i+2] !== b0 || d[i+3] !== a0) { varied = true; break; }
    }
    if (!varied) out.push(id + ": nothing was ever drawn on it");
  }
  return out;
})()`;

const STRUCTURE = `(() => {
  const nav = document.querySelector(".chapnav a");
  const rail = [...document.querySelectorAll('.rail a[href^="#"]')];
  const dangling = rail.map(a => a.getAttribute("href").slice(1))
                       .filter(id => !document.getElementById(id));
  const pager = document.querySelector(".pager a");
  const pill = document.querySelector('script[src="/almanac-back.js"]');
  return {
    nav: !!nav,
    railCount: rail.length,
    dangling,
    pager: !!pager,
    pill: !!pill,
    figures: document.querySelectorAll("figure.figure").length,
    canvases: document.querySelectorAll("canvas").length,
    words: (document.body.innerText || "").trim().split(/\\s+/).length,
    blank: [...document.querySelectorAll("canvas")].filter(c => c.width === 0 || c.height === 0).length,
  };
})()`;

const failures = [];
const report = [];

for (const page of PAGES) {
  if (!existsSync(join(DOC, page))) { failures.push(`${page}: file does not exist`); continue; }
  for (const vp of VIEWPORTS) {
    events.length = 0;
    await S("Emulation.setDeviceMetricsOverride", {
      width: vp.width, height: vp.height, deviceScaleFactor: 1, mobile: vp.mobile,
    });
    await S("Page.navigate", { url: base + page });
    for (let i = 0; i < 100; i++) {
      if (await evaluate('document.readyState === "complete"')) break;
      await delay(100);
    }
    await delay(700);   // let deferred figures mount and draw

    const errs = events
      .filter((e) => e.method === "Log.entryAdded" && e.params.entry.level === "error")
      .map((e) => e.params.entry.text)
      .filter((t) => !/favicon/i.test(t));
    const thrown = events
      .filter((e) => e.method === "Runtime.exceptionThrown")
      .map((e) => e.params.exceptionDetails.exception?.description ?? "exception");
    if (errs.length) failures.push(`${page} [${vp.label}]: console error — ${errs[0]}`);
    if (thrown.length) failures.push(`${page} [${vp.label}]: uncaught — ${thrown[0]}`);

    const overflow = await evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth");
    if (overflow > 1) failures.push(`${page} [${vp.label}]: scrolls sideways by ${overflow}px`);

    const covered = await evaluate(UNDER_PILL);
    if (covered.length) failures.push(`${page} [${vp.label}]: under the Almanac pill — ${covered.join(", ")}`);

    if (vp.label === "phone") {
      await evaluate(SCROLL_THROUGH);
      await delay(1800);                 // let deferred figures mount and paint
      const blanks = await evaluate(BLANK_CANVASES);
      for (const b of blanks) failures.push(`${page}: canvas ${b}`);

      const s = await evaluate(STRUCTURE);
      if (!s.nav) failures.push(`${page}: the chapter nav did not render (is assets/site.js included?)`);
      if (!s.pill) failures.push(`${page}: missing <script defer src="/almanac-back.js">`);
      if (!s.pager) failures.push(`${page}: missing the prev/next pager`);
      if (s.dangling.length) failures.push(`${page}: rail links to missing sections — ${s.dangling.join(", ")}`);
      if (s.blank) failures.push(`${page}: ${s.blank} canvas element(s) never got a size`);
      if (page !== "lexicon.html" && s.railCount < 4) failures.push(`${page}: only ${s.railCount} rail entries`);
      if (s.words < 1200) failures.push(`${page}: only ${s.words} words of rendered text`);
      report.push(`${page.padEnd(18)} ${String(s.words).padStart(5)} words  ${s.figures} figures  ${s.canvases} canvases  ${s.railCount} sections`);
    }
  }
}

// ---- the DSP kit, exercised in the real engine
await S("Emulation.setDeviceMetricsOverride", { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
await S("Page.navigate", { url: base + "index.html" });
for (let i = 0; i < 100; i++) {
  if (await evaluate('document.readyState === "complete"')) break;
  await delay(100);
}
const numerics = await evaluate(`(() => {
  const D = window.DSP, A = window.AUD, sr = 48000;
  const L = 2048, N = 64, x = new Float64Array(L);
  for (let i = 0; i < L; i++) x[i] = Math.sin(i * 0.037) * 0.6 + Math.sin(i * 0.31) * 0.3;
  const out = {};
  for (const w of ["sine", "kbd"]) {
    const y = D.mdctRoundTrip(x, N, null, w);
    let e = 0;
    for (let i = 2 * N; i < L - 2 * N; i++) e = Math.max(e, Math.abs(y[i] - x[i]));
    out["tdac_" + w] = e;
  }
  const sig = A.src.music(1.0, { sr });
  const an = A.analyze(sig, { sr, N: 512, masking: true });
  const r = A.codec(sig, { analysis: an, bitrate: 96 });
  out.kbps = r.kbps;
  out.snr = r.snrDb;
  out.finite = Array.from(r.out).every(Number.isFinite);
  out.ath1k = D.ath(1000);
  out.bark1k = D.hzToBark(1000);
  out.quantSnr16 = D.quantSnrDb(16);
  out.huff = D.huffman([{sym:"a",w:45},{sym:"b",w:13},{sym:"c",w:12},{sym:"d",w:16},{sym:"e",w:9},{sym:"f",w:5}]).avg;
  out.pvq = D.pvqV(8, 4);
  return out;
})()`);

assert.ok(numerics.tdac_sine < 1e-6, `MDCT/IMDCT overlap-add does not reconstruct (sine window): ${numerics.tdac_sine}`);
assert.ok(numerics.tdac_kbd < 1e-6, `MDCT/IMDCT overlap-add does not reconstruct (KBD window): ${numerics.tdac_kbd}`);
assert.ok(Math.abs(numerics.kbps - 96) < 3, `the rate loop missed its budget: ${numerics.kbps} kbit/s`);
assert.ok(numerics.finite, "the codec produced a non-finite sample");
assert.ok(Math.abs(numerics.ath1k - 3.37) < 0.5, `ATH(1 kHz) = ${numerics.ath1k}, expected about 3.4 dB SPL`);
assert.ok(Math.abs(numerics.bark1k - 8.5) < 0.2, `Bark(1 kHz) = ${numerics.bark1k}, expected about 8.5`);
assert.ok(Math.abs(numerics.quantSnr16 - 98.08) < 0.05, "6.02N + 1.76 is wrong");
assert.ok(numerics.huff > 2.2 && numerics.huff < 2.3, `Huffman average length ${numerics.huff}, expected 2.24`);
assert.equal(numerics.pvq, 2816, "V(8,4) must be 2816");

await S("Target.closeTarget", { targetId }).catch(() => {});
sock.close();
try { chrome.kill("SIGKILL"); } catch { /* already gone */ }
server.close();
await rm(profile, { recursive: true, force: true }).catch(() => {});

const missed = [...new Set(missing)].filter((p) => !/favicon/.test(p));
if (missed.length) failures.push(`missing subresources: ${missed.join(", ")}`);

console.log(report.join("\n"));
if (failures.length) {
  console.error("\n" + failures.map((f) => "  FAIL " + f).join("\n"));
  process.exit(1);
}
console.log("\naudio-compression browser checks: ok");
