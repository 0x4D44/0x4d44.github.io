// Geometry audit: how far apart (vertically) are the draped layers of the city GLBs? Coplanar layers (|dy| < 2 cm) z-fight.
// Raycasts straight down at random points through each layer of the loaded chunks and the coarse overview underlay.
// Usage: node tools/test_layers.mjs [--root <siteRoot>] [--n 600]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
let chromium; try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node-tools/node_modules/playwright')); }
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i < 0 ? d : process.argv[i + 1]; };
const here = path.dirname(fileURLToPath(import.meta.url)); const root = path.resolve(arg('root', path.resolve(here, '../..'))); const N = +arg('n', 600);
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.glb': 'model/gltf-binary', '.wasm': 'application/wasm' };
const server = http.createServer((req, res) => { const p = path.join(root, decodeURIComponent(req.url.split('?')[0])); const f = fs.existsSync(p) && fs.statSync(p).isDirectory() ? path.join(p, 'index.html') : p; if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 400, height: 300 } })).newPage();
await page.addInitScript(() => localStorage.setItem('gsx.quality', '"high"'));
await page.goto(`http://127.0.0.1:${server.address().port}/glasgow-subway/`); await page.waitForFunction(() => window.__explorer?.state?.ready, null, { timeout: 180000 });
await page.evaluate(() => { window.__explorer.app.paused = true; }); // no rendering needed
const res = await page.evaluate(async (N) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms)); const a = window.__explorer.app, city = a.city; const t0 = performance.now();
  a.paused = false; while ((city.active > 0 || city.chunks.some((c) => c.state === 'idle')) && performance.now() - t0 < 150000) await sleep(300); a.paused = true;
  const Ray = a.ray.constructor, V3 = a.rig.target.constructor; const rc = new Ray(); rc.ray.direction.set(0, -1, 0);
  city.root.updateMatrixWorld(true);
  const byChunk = new Map(); // chunk -> layer -> meshes
  for (const r of city.recs) { if (!r.obj.isMesh || /tree/i.test(r.obj.name) || r.obj.isInstancedMesh) continue; const k = r.chunk; if (!byChunk.has(k)) byChunk.set(k, {}); (byChunk.get(k)[r.layer] ||= []).push(r.obj); }
  const chunks = [...byChunk.keys()]; const cs = chunks.filter((c) => !c.overview); const ov = chunks.find((c) => c.overview);
  const topY = (meshes, x, z) => { if (!meshes) return null; rc.ray.origin.set(x, 500, z); const h = rc.intersectObjects(meshes, false); return h.length ? h[0].point.y : null; };
  const pairs = {}; const add = (name, d) => { (pairs[name] ||= []).push(d); };
  let seed = 12345; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cx = a.centre.x, cz = a.centre.z;
  for (let i = 0; i < N; i++) {
    const x = cx + (rnd() - 0.5) * 4000, z = cz + (rnd() - 0.5) * 3200; const ch = cs.find((c) => x >= c.minX && x < c.maxX && z >= c.minZ && z < c.maxZ); if (!ch) continue;
    const L = byChunk.get(ch); const H = {}; for (const k of ['terrain', 'green', 'water', 'roads', 'rail']) H[k] = topY(L[k], x, z);
    if (H.terrain != null) for (const k of ['green', 'water', 'roads', 'rail']) if (H[k] != null) add(k + ' - terrain', H[k] - H.terrain);
    if (H.roads != null && H.green != null) add('roads - green', H.roads - H.green); if (H.roads != null && H.water != null) add('roads - water', H.roads - H.water);
    if (H.rail != null && H.roads != null) add('rail - roads', H.rail - H.roads); if (H.green != null && H.water != null) add('green - water', H.green - H.water);
    if (ov) { const O = byChunk.get(ov); for (const k of ['terrain', 'water', 'green', 'roads']) { const oy = topY(O[k], x, z); if (oy != null && H[k] != null) add(`overview ${k} - chunk ${k}`, oy - H[k]); } }
  }
  const bins = (arr) => { const b = { 'below -0.5': 0, '-0.5..-0.02': 0, 'coplanar +-0.02': 0, '0.02..0.1': 0, '0.1..0.5': 0, 'above 0.5': 0 }; for (const d of arr) { if (d < -0.5) b['below -0.5']++; else if (d < -0.02) b['-0.5..-0.02']++; else if (d <= 0.02) b['coplanar +-0.02']++; else if (d <= 0.1) b['0.02..0.1']++; else if (d <= 0.5) b['0.1..0.5']++; else b['above 0.5']++; } return { n: arr.length, ...b }; };
  const out = {}; for (const [k, v] of Object.entries(pairs)) out[k] = bins(v); return { out, chunks: cs.length, hasOverview: !!ov };
}, N);
console.log('chunks', res.chunks, 'overview', res.hasOverview); for (const [k, v] of Object.entries(res.out)) console.log(k.padEnd(34), JSON.stringify(v));
await browser.close(); server.close();
