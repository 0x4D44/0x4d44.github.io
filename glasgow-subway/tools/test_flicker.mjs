// Motion-based flicker (z-fighting / shimmer) test for the explorer.
// Renders fixed viewpoints repeatedly with sub-pixel camera jitter and counts pixels that flip strongly between frames
// inside areas that are NOT edges in the mean image (i.e. speckle inside big coplanar areas = z-fight / specular shimmer).
// Usage: node tools/test_flicker.mjs [--root <siteRoot>] [--out <dir>] [--w 480] [--h 300] [--quality low|med|high] [--quick] [--settle]
//   --root lets you compare against another checkout (git worktree of an older commit): node tools/test_flicker.mjs --root /path/to/old/site
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : (process.argv[i + 1]?.startsWith('--') || i + 1 >= process.argv.length ? true : process.argv[i + 1]); };
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(arg('root', path.resolve(here, '../..')));
const out = arg('out', path.join(process.env.TMPDIR || '/tmp', 'gsx-flicker')); fs.mkdirSync(out, { recursive: true });
const W = +arg('w', 480), H = +arg('h', 300), quality = arg('quality', 'med'), quick = !!arg('quick', false), settle = !!arg('settle', false);
const THRESH = +arg('thresh', 0.25); // max allowed flicker percentage of canvas pixels
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/glasgow-subway/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const page = await ctx.newPage(); const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', (e) => errs.push(e.message));
await page.addInitScript((q) => localStorage.setItem('gsx.quality', JSON.stringify(q)), quality);
await page.goto(url); await page.waitForFunction(() => window.__explorer?.state?.ready, null, { timeout: 180000 });
// hide the UI so only the canvas matters, keep the app running
await page.addStyleTag({ content: '#topbar,.dock,#sheet,#xraybar,#minimap,#labels,#drawer,#gauge,#caption{display:none!important}' });

const mpdLon = 111320 * Math.cos(55.86 * Math.PI / 180), mpdLat = 111132;
const proj = (lat, lon) => ({ x: (lon + 4.27) * mpdLon, z: -(lat - 55.86) * mpdLat });
const sites = await page.evaluate(() => { const a = window.__explorer.app; const s = (id) => a.byId.get(id); const c = a.ug.crossings[0]; return { clyde: c ? { x: c.pos.x, z: c.pos.z } : { x: s('bridge-street').x, z: s('bridge-street').z + 200 }, central: { x: s('st-enoch').x - 75, z: s('st-enoch').z - 280 }, govan: { x: s('govan').x, z: s('govan').z } }; });
const kg = proj(55.8685, -4.2915);
const SITES = { clyde: sites.clyde, central: sites.central, kelvingrove: kg, govan: sites.govan };
const VIEWS = quick ? [[700, 0.85], [2800, 0.9]] : [[250, 1.0], [700, 0.85], [1500, 0.9], [2800, 0.9], [900, 1.25]];

async function measure(name, site, dist, polar) {
  const r = await page.evaluate(async ({ site, dist, polar, N, radPx }) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const a = window.__explorer.app; const V3 = a.rig.target.constructor;
    a.paused = false; const tgt = new V3(site.x, a.ground(site.x, site.z), site.z); a.rig.setView({ target: tgt, dist, polar, azim: 0.3 });
    const t0 = performance.now(); const lim = a.quality.chunkRadius;
    const pending = () => a.city.active > 0 || a.city.chunks.some((c) => c.state === 'idle' && c.dist < Math.min(lim, 2500));
    do { await sleep(250); } while (pending() && performance.now() - t0 < 90000);
    const f0 = a.state.frames; while (a.state.frames < f0 + 3 && performance.now() - t0 < 120000) await sleep(100);
    a.paused = true; await sleep(50);
    const rd = a.env.renderer, gl = rd.getContext(), cam = a.env.camera, sc = a.env.scene; const w = rd.domElement.width, h = rd.domElement.height;
    cam.updateMatrixWorld(true); const right = new V3().setFromMatrixColumn(cam.matrixWorld, 0), up = new V3().setFromMatrixColumn(cam.matrixWorld, 1);
    const wpp = (2 * dist * Math.tan((cam.fov * Math.PI) / 360)) / h; const base = cam.position.clone(); const frames = [];
    for (let k = 0; k < N; k++) {
      const an = (k / N) * Math.PI * 2, dx = Math.cos(an) * radPx * wpp, dy = Math.sin(an) * radPx * wpp;
      cam.position.copy(base).addScaledVector(right, dx).addScaledVector(up, dy); cam.updateMatrixWorld(true);
      rd.render(sc, cam); const buf = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf); frames.push(buf);
    }
    cam.position.copy(base); cam.updateMatrixWorld(true); rd.render(sc, cam);
    const L = (b, i) => (b[i * 4] * 0.3 + b[i * 4 + 1] * 0.59 + b[i * 4 + 2] * 0.11);
    const mean = new Float32Array(w * h), sd = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) { let s = 0, s2 = 0; for (let k = 0; k < N; k++) { const v = L(frames[k], i); s += v; s2 += v * v; } const m = s / N; mean[i] = m; sd[i] = Math.sqrt(Math.max(0, s2 / N - m * m)); }
    const flag = new Uint8Array(w * h); let count = 0, land = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x; let g = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) g = Math.max(g, Math.abs(mean[i + dy * w + dx] - mean[i]));
      const sky = frames[0][i * 4 + 2] > 150 && frames[0][i * 4] < 190 && y > h * 0.5 ? 0 : 1; land += 1;
      if (sd[i] > 12 && g < 22) { flag[i] = 1; count++; }
    }
    // images (flip vertically)
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g2 = c.getContext('2d'); const im = g2.createImageData(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const s = ((h - 1 - y) * w + x), d = (y * w + x) * 4; fn(s, im.data, d); } g2.putImageData(im, 0, 0); return c.toDataURL('image/png'); };
    const img = mk((s, o, d) => { o[d] = frames[0][s * 4]; o[d + 1] = frames[0][s * 4 + 1]; o[d + 2] = frames[0][s * 4 + 2]; o[d + 3] = 255; });
    const map = mk((s, o, d) => { const v = mean[s]; o[d] = flag[s] ? 255 : v * 0.5; o[d + 1] = flag[s] ? 0 : v * 0.5; o[d + 2] = flag[s] ? 0 : v * 0.5; o[d + 3] = 255; });
    a.paused = false; return { count, total: w * h, pct: (count / (w * h)) * 100, img, map, near: cam.near };
  }, { site, dist, polar, N: 8, radPx: 0.3 });
  const save = (suffix, data) => fs.writeFileSync(path.join(out, `${name}-${suffix}.png`), Buffer.from(data.split(',')[1], 'base64'));
  save('img', r.img); save('flicker', r.map); return r;
}

let fails = 0; const rows = [];
for (const [sn, site] of Object.entries(SITES)) for (const [d, p] of VIEWS) {
  const nm = `${sn}-d${d}-p${p}`; const r = await measure(nm, site, d, p);
  const ok = r.pct <= THRESH; if (!ok) fails++; rows.push({ view: nm, pct: +r.pct.toFixed(3), near: +r.near.toFixed(1) });
  console.log((ok ? 'PASS ' : 'FAIL ') + `${nm} flicker=${r.pct.toFixed(3)}% (${r.count}px) near=${r.near.toFixed(1)}`);
}
const avg = rows.reduce((s, r) => s + r.pct, 0) / rows.length; console.log(`MEAN flicker ${avg.toFixed(3)}%  max ${Math.max(...rows.map((r) => r.pct)).toFixed(3)}%`);

if (settle) { // after a mouse sweep stops, how long until consecutive frames are identical?
  const res = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const a = window.__explorer.app, rd = a.env.renderer, gl = rd.getContext(); const series = []; let prev = null; const orig = rd.render.bind(rd); let rec = false;
    rd.render = (s, c) => { orig(s, c); if (!rec) return; const w = rd.domElement.width, h = rd.domElement.height; const b = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, b); if (prev) { let n = 0; for (let i = 0; i < b.length; i += 16) if (Math.abs(b[i] - prev[i]) + Math.abs(b[i + 1] - prev[i + 1]) + Math.abs(b[i + 2] - prev[i + 2]) > 36) n++; series.push({ t: Math.round(performance.now()), pct: +(n / (b.length / 16) * 100).toFixed(3) }); } prev = b; };
    const V3 = a.rig.target.constructor; a.paused = false; a.rig.setView({ target: new V3(a.centre.x, a.centre.y, a.centre.z), dist: 900, polar: 0.9, azim: 0 }); await sleep(3000);
    rec = true; const ctl = a.rig.controls; for (let i = 0; i < 6; i++) { ctl.dispatchEvent({ type: 'start' }); a.rig.camera.position.x += 25; a.rig.target.x += 25; await sleep(150); }
    const tStop = performance.now(); await sleep(6000); rec = false; rd.render = orig; return { tStop: Math.round(tStop), series };
  });
  const after = res.series.filter((s) => s.t > res.tStop); const lastBusy = after.filter((s) => s.pct > 0.05).pop();
  console.log('settle: frames after stop', after.length, 'last frame with >0.05% change at', lastBusy ? ((lastBusy.t - res.tStop) / 1000).toFixed(2) + 's' : 'never', JSON.stringify(after.slice(-6).map((s) => s.pct)));
}
console.log(errs.length ? 'console errors: ' + errs.slice(0, 5).join(' | ') : 'no console errors'); if (errs.length) fails++;
await browser.close(); server.close(); console.log(fails ? `FAILED (${fails})` : 'ALL PASSED', 'images in', out); process.exit(fails ? 1 : 0);
