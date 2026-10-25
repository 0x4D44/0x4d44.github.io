// Headless-Chromium test for the explorer. Usage: node tools/test_explorer.mjs [outDir]
// Starts a static server at the site root, loads /glasgow-subway/, screenshots several states, asserts no console errors / overflow.
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(here, '../..');
const out = process.argv[2] || path.join(process.env.TMPDIR || '/tmp', 'gsx-shots'); fs.mkdirSync(out, { recursive: true });
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.join(root, decodeURIComponent(req.url.split('?')[0].split('#')[0])); const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p;
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r)); const url = `http://127.0.0.1:${server.address().port}/glasgow-subway/`;
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const problems = []; let fails = 0;
const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++; };

async function run(name, vp, mobile) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1, hasTouch: mobile, isMobile: mobile });
  const page = await ctx.newPage(); const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  await page.goto(url); await page.evaluate(() => window.__explorer.ready).catch((e) => errs.push('ready: ' + e.message));
  await page.waitForFunction(() => window.__explorer?.state?.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.__explorer.whenCityLoaded(Infinity)); await page.waitForTimeout(1500);
  const shot = async (n) => { await page.waitForTimeout(900); await page.screenshot({ path: path.join(out, `${name}-${n}.png`) }); };
  const noOverflow = async (label) => { const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, bw: document.body.scrollWidth })); check(o.sw - o.cw <= 1 && o.bw - o.cw <= 1, `${name} no horizontal overflow (${label}) ${JSON.stringify(o)}`); };
  const topLeft = async () => { const bad = await page.evaluate(() => [...document.querySelectorAll('button,a,input,select,[tabindex]')].filter((e) => { const r = e.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(e).visibility === 'hidden' || e.closest('[hidden]')) return false; return r.left < 109 && r.top < 41 && r.right > 0 && r.bottom > 0; }).map((e) => e.id || e.className)); check(bad.length === 0, `${name} nothing interactive under back pill ${bad}`); };
  const ex = () => page.evaluate(() => window.__explorer);
  await shot('1-default'); await noOverflow('default'); await topLeft();
  const info = await page.evaluate(() => ({ notes: window.__explorer.notes, city: window.__explorer.city.stats(), stations: window.__explorer.app.stations.length }));
  console.log(name, JSON.stringify(info));
  await page.evaluate(() => window.__explorer.setXray(1)); await shot('2-xray');
  await page.evaluate(async () => { const e = window.__explorer; e.app.setExaggeration(1); await e.flyToStation(e.app.stations[7].id, { xray: 1, dur: 0.1 }); }); await shot('3-station-xray');
  await page.evaluate(() => { window.__explorer.setXray(0); window.__explorer.selectStation(window.__explorer.app.stations[0].id, { fly: false }); window.__explorer.app.rig.setView(window.__explorer.app.stationView(window.__explorer.app.stations[0].id)); }); await shot('4-station-surface'); await noOverflow('station');
  await page.evaluate(() => { window.__explorer.setLight('night'); window.__explorer.setXray(0.7); window.__explorer.app.selectStation(null); window.__explorer.setView(window.__explorer.app.heroView); }); await page.waitForTimeout(500); await shot('5-night');
  await page.evaluate(() => { window.__explorer.setLight('day'); window.__explorer.toggleProfile(true); }); await shot('6-profile'); await noOverflow('profile');
  await page.evaluate(() => { window.__explorer.ui.showPane('view'); window.__explorer.ui.showPane('line'); }); await shot('7-line');
  await page.evaluate(() => window.__explorer.startTour()); await page.waitForTimeout(6000); await shot('8-tour'); await page.evaluate(() => window.__explorer.stopTour());
  await noOverflow('end');
  check(errs.length === 0, `${name} no console errors` + (errs.length ? '\n  ' + errs.slice(0, 8).join('\n  ') : ''));
  await ctx.close();
}
try {
  const only = process.env.ONLY;
  if (!only || only === 'desktop') await run('desktop', { width: 1440, height: 900 }, false);
  if (!only || only === 'mobile') await run('mobile', { width: 390, height: 844 }, true);
} catch (e) { console.error(e); fails++; }
await browser.close(); server.close();
console.log(fails ? `FAILED (${fails})` : 'ALL PASSED', 'screens in', out);
process.exit(fails ? 1 : 0);
