// How much hair and eyebrow the LOD people have left, the way the GAME draws them. The companion of tools/people_holes.mjs (skin through garments) for the other
// thing the LOD export (tools/assets_people_mpfb.py) damages: it decimates the thin open shell of some hairstyles to a few wedges (a bald head with a ponytail) and
// the eyebrows of everybody to heavy black wedges. tools/people_lodhair.py repairs them; this measures it, and is how its list of people and its brow lift were chosen.
//   node tools/people_hair.mjs [--glb PATH] [--lod-glb PATH] [--only a,b] [--json out.json] [--base URL]
//     --glb / --lod-glb  the models to compare: a path under the repo root, or any local file (served to the page as it is). Defaults: the committed models.
// Per person, twice (the full people.glb and the LOD people_lod.glb, both built by the game's own AnimCrowd, bodyfit.js fits included; the phone in the hand is hidden):
//   HAIR   every other material is hidden and the head is rendered from eight sides and from above on a magenta ground: the pixels that are not ground are the area the hair
//          COVERS. The same views with and without the hair, compared, give the area the hair CHANGES in the picture (what is SEEN of it; the far side of a head is not).
//   BROWS  the same two counts in three close views of the face - covered, and seen (a brow the skin or the fringe hides changes nothing).
// Output per person: LOD / full for each. A decimated hair that is still a closed shell covers MORE than the original (its triangles are bigger and its shell thicker:
// 1.06-1.27 for 26 of the 30 people); under about 0.9 means the cap is missing (the four ponytail people were 0.79-0.84 before tools/people_lodhair.py, 1.10-1.12 after).
// Brows: ~1 means the LOD shows what the full model shows; the unrepaired LOD export shows 4.9 times as much (covered 2.4-45 times per person). The counts say how much, not
// whether it looks right: they cannot resolve specks of scalp, and a brow's visibility depends on the lift (see tools/people_lodhair.py, which says how it was chosen).
// Serves the repo root with python3 -m http.server unless --base is given (it then picks a port that nothing answers on, and prints the base it used). Needs Playwright.
import { createRequire } from 'module';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const ONLY = arg('--only', null);
let BASE = arg('--base', null), server = null;
if (!BASE) {
  // a port that nothing answers on (a leftover server there would be measured instead of this tree - it has happened), then our own server on it, checked to be ours
  for (let tries = 0; tries < 20 && !BASE; tries++) {
    const port = 8330 + Math.floor(Math.random() * 600);
    if (await fetch(`http://localhost:${port}/`, { signal: AbortSignal.timeout(1500) }).then(() => true, () => false)) continue;
    const child = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 1000));
    if (child.exitCode === null) { server = child; BASE = `http://localhost:${port}`; } else child.kill();
  }
  if (!BASE) throw new Error('no free port for the file server (pass --base URL of one that serves the repo root)');
}

// a model argument is either a URL path under the repo root or a local file; a local file is handed to the page through a route
const routes = {};
const model = (v, fallback, tag) => {
  if (!v) return fallback;
  if (!fs.existsSync(v)) return v;
  routes['/__local/' + tag + '.glb'] = path.resolve(v); return '/__local/' + tag + '.glb';
};
const GLB = model(arg('--glb', null), '../models/people.glb', 'main'), LODGLB = model(arg('--lod-glb', null), '../models/people_lod.glb', 'lod');

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
let exit = 0;
try {
  const out = {};
  for (const lod of [0, 1]) {
    const page = await browser.newPage({ viewport: { width: 256, height: 256 }, deviceScaleFactor: 1 });
    page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
    for (const [url, file] of Object.entries(routes)) await page.route('**' + url, (route) => route.fulfill({ path: file, contentType: 'model/gltf-binary' }));
    await page.goto(`${BASE}/glasgow-subway/tools/people_view.html?${new URLSearchParams({ glb: GLB, lod: LODGLB, tint: '0', forcelod: String(lod), bg: 'ff00ff' })}`);
    await page.waitForFunction('window.__ready', null, { timeout: 300000 });
    const err = await page.evaluate('window.__err'); if (err) throw new Error('load: ' + err);
    let ids = await page.evaluate('window.__ids'); if (ONLY) ids = ids.filter((i) => ONLY.split(',').includes(i));
    for (const id of ids) {
      const res = await page.evaluate(({ id }) => {
        const r = window.__renderer, T = window.__THREE, scene = window.__scene, cam = window.__cam;
        r.setAnimationLoop(null); r.setPixelRatio(1); r.setSize(256, 256, false);
        scene.background = new T.Color(0xff00ff);
        if (!window.__spawn(id, 'stand', 0.3, Math.PI)) return null;
        const top = new T.Box3().setFromObject(window.__crowd.group).max.y;
        const mats = []; window.__crowd.group.traverse((o) => {
          if (o.isSkinnedMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) mats.push(m);
          else if (o.isMesh) o.visible = false;   // the phone in the hand is a plain mesh, and near the face it would be counted as brow
        });
        const show = (re) => { for (const m of mats) m.visible = re.test(m.name || ''); };   // one kind of material at a time
        const cv = document.createElement('canvas'); cv.width = 256; cv.height = 256; const cx = cv.getContext('2d', { willReadFrequently: true });
        const grab = () => { cx.clearRect(0, 0, 256, 256); cx.drawImage(r.domElement, 0, 0); return cx.getImageData(0, 0, 256, 256).data; };
        const count = () => { const d = grab(); let n = 0; for (let i = 0; i < d.length; i += 4) if (!(d[i] > 200 && d[i + 1] < 60 && d[i + 2] > 200)) n++; return n; };
        const changed = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) > 24) n++; return n; };
        const res = { hair: [], hairSeen: [], brows: [], browsSeen: [] };
        cam.aspect = 1; cam.fov = 30; cam.updateProjectionMatrix();
        const hairViews = [];
        for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, d = 1.3, cy = top - 0.12; hairViews.push([Math.sin(a) * d, cy, Math.cos(a) * d, 0, cy, 0]); }
        hairViews.push([0, top + 1.3, 0.02, 0, top - 0.1, 0]);
        for (const [x, y, z, lx, ly, lz] of hairViews) {
          cam.position.set(x, y, z); cam.lookAt(lx, ly, lz);
          show(/^alpha_hair/); r.render(scene, cam); res.hair.push(count());                          // the hair geometry alone
          show(/^(?!alpha_hair)/); r.render(scene, cam); const without = grab();                      // the person without hair,
          show(/^/); r.render(scene, cam); res.hairSeen.push(changed(without, grab()));               // and with: what the hair changes is what is seen of it (a cap partly inside the head shows less)
        }
        for (const a of [0, 0.5, -0.5]) {
          const d = 0.6, cy = top - 0.125; cam.fov = 20; cam.updateProjectionMatrix(); cam.position.set(Math.sin(a) * d, cy, Math.cos(a) * d); cam.lookAt(0, cy, 0);
          show(/^alpha_brows/); r.render(scene, cam); res.brows.push(count());                       // the brow geometry alone
          show(/^(?!alpha_brows)/); r.render(scene, cam); const without = grab();                     // the person without brows,
          show(/^/); r.render(scene, cam); res.browsSeen.push(changed(without, grab()));              // and with: what the brows change is what is seen of them
        }
        return res;
      }, { id });
      (out[id] ||= {})[lod ? 'lod' : 'full'] = res;
    }
    await page.close();
  }
  const sum = (a) => a.reduce((s, x) => s + x, 0), rows = [];
  for (const [id, v] of Object.entries(out)) {
    if (!v.full || !v.lod) continue;
    const hf = sum(v.full.hair), hl = sum(v.lod.hair), bf = sum(v.full.brows), bl = sum(v.lod.brows), sf = sum(v.full.browsSeen), sl = sum(v.lod.browsSeen), hsf = sum(v.full.hairSeen), hsl = sum(v.lod.hairSeen);
    rows.push({ id, hairFull: hf, hairLod: hl, hairRatio: hf ? hl / hf : null, hairSeenFull: hsf, hairSeenLod: hsl, hairSeenRatio: hsf ? hsl / hsf : null,
                hairBuriedFull: hf ? 1 - hsf / hf : null, hairBuriedLod: hl ? 1 - hsl / hl : null,
                browsFull: bf, browsLod: bl, browsRatio: bf ? bl / bf : null, seenFull: sf, seenLod: sl, seenRatio: sf ? sl / sf : null });
  }
  rows.sort((a, b) => (a.hairRatio ?? 9) - (b.hairRatio ?? 9));
  console.log(`${BASE}  ${GLB} vs ${LODGLB}`);
  console.log('hair: pixels covered (8 sides + top) / pixels the hair changes in the picture (so not buried in the head); LOD / full. buried = 1 - seen / covered');
  console.log('brows: pixels covered by the geometry alone / pixels the brows change on the face (3 close views); LOD / full');
  console.log('person'.padEnd(18) + 'hair full'.padStart(10) + 'LOD'.padStart(8) + 'ratio'.padStart(6) + 'seen'.padStart(6) + 'buried f/L'.padStart(12) + '   ' + 'brows full'.padStart(10) + 'LOD'.padStart(7) + 'ratio'.padStart(6) + '   ' + 'seen full'.padStart(9) + 'LOD'.padStart(6) + 'ratio'.padStart(6));
  const f2 = (x, w) => (x ?? NaN).toFixed(2).padStart(w), pc = (x) => (Math.round(100 * (x ?? NaN)) + '%').padStart(4);
  for (const r of rows) console.log(r.id.padEnd(18) + String(r.hairFull).padStart(10) + String(r.hairLod).padStart(8) + f2(r.hairRatio, 6) + f2(r.hairSeenRatio, 6) + (pc(r.hairBuriedFull) + ' /' + pc(r.hairBuriedLod)).padStart(12) + '   ' + String(r.browsFull).padStart(10) + String(r.browsLod).padStart(7) + f2(r.browsRatio, 6) + '   ' + String(r.seenFull).padStart(9) + String(r.seenLod).padStart(6) + f2(r.seenRatio, 6));
  const rng = (k) => { const v = rows.map((r) => r[k]).filter((x) => x != null).sort((a, b) => a - b); return v.length ? `${v[0].toFixed(2)} .. ${v[v.length - 1].toFixed(2)} (median ${v[v.length >> 1].toFixed(2)})` : 'n/a'; };
  const tot = (a, b) => (rows.reduce((t, r) => t + r[a], 0) / rows.reduce((t, r) => t + r[b], 0)).toFixed(2);
  console.log(`ratios over ${rows.length} people - hair covered ${rng('hairRatio')}, hair seen ${rng('hairSeenRatio')}; brow geometry ${rng('browsRatio')}, brows seen ${rng('seenRatio')} (all together ${tot('seenLod', 'seenFull')})`);
  const j = arg('--json', null); if (j) { fs.writeFileSync(j, JSON.stringify({ glb: GLB, lod: LODGLB, rows, out })); console.log('wrote', j); }
} catch (e) { console.error(e); exit = 1; }
finally { await browser.close(); if (server) server.kill(); }
process.exit(exit);
