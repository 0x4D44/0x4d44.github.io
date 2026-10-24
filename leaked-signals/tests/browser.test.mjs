// Real-browser smoke: WebGL page loads, renders points, no console errors, no sideways scroll,
// back pill does not cover controls, panel tabs work, tour seeks deterministically.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { createRequire } from "node:module";

const ROOT = resolve(new URL("../..", import.meta.url).pathname);
const MIME = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4" };
const srv = createServer(async (q, r) => {
  try { let p = decodeURIComponent(q.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
    const b = await readFile(join(ROOT, p)); r.writeHead(200, { "content-type": MIME[extname(p)] || "application/octet-stream" }); r.end(b);
  } catch { r.writeHead(404); r.end(); }
}).listen(0);
const port = srv.address().port;
let chromium;
try { ({ chromium } = createRequire(import.meta.url)("playwright")); } catch { try { ({ chromium } = createRequire("/usr/lib/node_modules/")("playwright")); } catch { console.log("playwright unavailable: skipping browser test"); srv.close(); process.exit(0); } }
const b = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
try {
  for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
    const p = await b.newPage({ viewport: vp }), errs = [];
    p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
    p.on("pageerror", e => errs.push(e.message));
    p.on("response", r => { if (r.status() >= 400) errs.push("HTTP " + r.status() + " " + r.url()); });
    await p.goto(`http://localhost:${port}/leaked-signals/`, { waitUntil: "load" });
    await p.waitForFunction(() => window.__leak && window.__leak.info().n > 1000, null, { timeout: 30000 });
    const info = await p.evaluate(() => window.__leak.info());
    assert.ok(info.glOk && info.n > 100000, "field built " + JSON.stringify(info));
    const sw = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    assert.ok(sw <= 1, `horizontal overflow ${sw}px at ${vp.width}`);
    for (const t of ["listen", "broadcasts", "anatomy", "about", "explore"]) { await p.click(`#tab-${t}`); assert.ok(await p.isVisible(`#body-${t}`), t); }
    await p.evaluate(() => window.__leak.selectStar(window.__leak.stars.names ? +Object.keys(window.__leak.stars.names)[0] : 0, { switchTab: true }));
    assert.ok(await p.isVisible("#stripCv"), "listen charts render");
    await p.evaluate(() => window.__leak.seek(20));
    const a = await p.evaluate(() => window.__leak.state.T), c = await p.evaluate(() => (window.__leak.seek(20), window.__leak.state.T));
    assert.equal(a, c, "seek deterministic");
    if (vp.width > 600) for (let t = 1; t < 64; t += 3) { const n = await p.evaluate(t => { window.__leak.seek(t); return window.__leak.info().n; }, t); assert.ok(n > 500, `tour frame t=${t} is empty (n=${n})`); }
    await p.click("#tab-broadcasts"); await p.evaluate(() => window.__leak.selectBroadcast(document.querySelector("#bList [data-b]:last-child").dataset.b));
    await p.waitForTimeout(600);
    const sc = await p.evaluate(() => [document.querySelector("#panel").scrollTop, document.querySelector(".app").scrollTop, document.scrollingElement.scrollTop]);
    assert.ok(sc[0] === 0 && sc[1] === 0, "panel/app must not be scrolled: " + sc);
    await p.evaluate(() => window.__leak.seek(46));
    await p.waitForTimeout(700);
    const ov = await p.evaluate(() => { const c = document.querySelector("#caption").getBoundingClientRect(), d = document.querySelector("#dock").getBoundingClientRect(); return { c: c.bottom, d: d.top, on: document.querySelector("#caption").classList.contains("on") }; });
    assert.ok(ov.on && ov.c <= ov.d + 2, `caption overlaps dock at ${vp.width}px: ${JSON.stringify(ov)}`);
    for (const f of ["leaked-signals-tour.mp4", "poster.jpg"]) { const r = await p.request.get(`http://localhost:${port}/leaked-signals/${f}`); assert.equal(r.status(), 200, f); }
    assert.deepEqual(errs, [], "console errors / failed requests");
    await p.close();
  }
  console.log("leaked-signals browser test: ok");
} finally { await b.close(); srv.close(); }
