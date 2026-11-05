// How much bare skin shows through the garments, the way the GAME draws the people. The pixel-level companion of js/sim/skincheck.mjs (which counts rest-pose
// samples in plain Node): this one renders, so it sees what the player sees - skinning, the runtime fits in js/sim/bodyfit.js, the pose.
//   node tools/people_holes.mjs [--glb PATH] [--lod-glb PATH] [--lod] [--poses stand:0,walk:0.3,walk:0.8] [--azs 0,45,90,...] [--only a,b] [--json out.json] [--base URL]
//     --glb / --lod-glb  the models to measure: a path under the repo root, or any local file (served to the page as it is). Defaults: the committed models.
//     --lod              measure the LOD models (people_lod.glb, what a moving person is in the game) instead of the full ones (people.glb, standing people)
//     --poses            state:fraction pairs - 'walk:0.3' is the walk clip frozen 30% through. 'sit' is left out of the default set: a hand resting on a lap is
//                        legitimate skin-in-front-of-cloth and would be counted as a hole. 'gait:3.2' is the person walked 3.2 s at 1.2 m/s by the game's own steering and gait
//                        (a stride is ~1.05 s: several times a few tenths apart cover it) - the walk as the player sees it, not a clip frozen mid-stride.
//     --speed V          with 'gait:T' poses: the walking speed, m/s (default 1.2)
//     --var JSON         with 'gait:T' poses: a variation put on the person's gait, e.g. '{"step":0.8}' (see gaitParams)
//     --gait clip        with 'gait:T' poses: pose the old clip walk instead (the procedural gait layer off), to compare the two
//     --azs              the camera azimuths, degrees (default eight, every 45)
// Per person, pose and azimuth: depth of the skin meshes alone and of the garment meshes alone (float target, depth material), at 320x512 from 3.6 m. A pixel where
// both exist and the skin is nearer by more than 0.5 mm is "skin in front of cloth"; when it is in front by less than 3 cm it is a HOLE - skin poking out through
// the garment's surface (a hand hanging in front of the body is in front by more, and is not counted). Output: the mean hole area in cm^2 per view, per person and
// pose; compare two runs with the same poses (--json keeps the detail). Serves the repo root with python3 -m http.server unless --base is given. Needs Playwright.
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
const flag = (k) => process.argv.includes(k);
const POSES = arg('--poses', 'stand:0,walk:0.3,walk:0.8').split(',').map((s) => { const [state, frac] = s.split(':'); return { state, frac: +(frac || 0) }; });
const AZS = arg('--azs', '0,45,90,135,180,225,270,315').split(',').map(Number);
const ONLY = arg('--only', null), SPEED = +arg('--speed', 1.2), VAR = JSON.parse(arg('--var', 'null'));
let BASE = arg('--base', null), server = null;
if (!BASE) { const port = 8280 + Math.floor(Math.random() * 50); server = spawn('python3', ['-m', 'http.server', String(port), '--directory', root], { stdio: 'ignore' }); BASE = `http://localhost:${port}`; await new Promise((r) => setTimeout(r, 1200)); }

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
  const page = await browser.newPage({ viewport: { width: 400, height: 640 } });
  page.on('pageerror', (e) => console.log('pageerror', String(e).slice(0, 300)));
  for (const [url, file] of Object.entries(routes)) await page.route('**' + url, (route) => route.fulfill({ path: file, contentType: 'model/gltf-binary' }));
  const q = new URLSearchParams({ glb: GLB, lod: LODGLB, tint: '0', forcelod: flag('--lod') ? '1' : '0', gait: arg('--gait', 'default') });
  await page.goto(`${BASE}/glasgow-subway/tools/people_view.html?${q}`);
  await page.waitForFunction('window.__ready', null, { timeout: 300000 });
  const err = await page.evaluate('window.__err'); if (err) throw new Error('load: ' + err);
  const out = {};
  for (const pose of POSES) {
    const res = await page.evaluate(({ azs, pose, only, speed, vr }) => {
      const THREE = window.__THREE, r = window.__renderer, scene = window.__scene, cam = window.__cam;
      r.setAnimationLoop(null);
      const W = 320, H = 512, D = 3.6, TY = 0.95, FOV = 35, N = 0.02, F = 100;
      r.setPixelRatio(1); r.setSize(W, H, false); scene.background = null;
      cam.aspect = W / H; cam.fov = FOV; cam.near = N; cam.far = F; cam.updateProjectionMatrix();
      const rt = new THREE.WebGLRenderTarget(W, H, { type: THREE.FloatType, format: THREE.RGBAFormat, depthBuffer: true });
      const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking }), buf = new Float32Array(W * H * 4);
      const skinRe = /^skin_/, clothRe = /^(cloth_|hose_|belt|sporran)/, tanH = Math.tan(FOV * Math.PI / 360), lin = (z01) => (N * F) / (F - z01 * (F - N));
      const grab = (meshes, kind, which) => {   // depth (metres from the camera, NaN = nothing) of the meshes of one kind
        meshes.forEach((m, i) => { m.visible = kind[i] === which; });
        scene.overrideMaterial = depthMat; r.setRenderTarget(rt); r.setClearColor(0x000000, 0); r.clear(); r.render(scene, cam); r.setRenderTarget(null); scene.overrideMaterial = null;
        r.readRenderTargetPixels(rt, 0, 0, W, H, buf);
        const d = new Float32Array(W * H); for (let i = 0; i < W * H; i++) d[i] = buf[i * 4 + 3] > 0.5 ? lin(1 - buf[i * 4]) : NaN;
        return d;
      };
      const res = {};
      for (const id of (only ? only.split(',') : window.__ids)) {
        if (pose.state === 'gait') window.__walk(id, speed, pose.frac, 0, vr); else window.__spawn(id, pose.state, pose.frac, 0); const o = window.__crowd.people[0].obj, meshes = []; o.traverse((m) => { if (m.isSkinnedMesh) meshes.push(m); });
        const kind = meshes.map((m) => { const nm = (Array.isArray(m.material) ? m.material.map((x) => x.name).join('|') : m.material.name) || ''; return skinRe.test(nm) ? 'skin' : clothRe.test(nm) ? 'cloth' : 'other'; });
        const per = [];
        for (const az of azs) {
          const a = az * Math.PI / 180; cam.position.set(Math.sin(a) * D, TY, Math.cos(a) * D); cam.lookAt(0, TY, 0); cam.updateMatrixWorld(true);
          const dS = grab(meshes, kind, 'skin'), dC = grab(meshes, kind, 'cloth'); meshes.forEach((m) => { m.visible = true; });
          let front = 0, hole = 0, harea = 0; const hb = new Array(12).fill(0);   // hb: hole pixels per 0.2 m height band from the floor
          for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            const i = y * W + x, s = dS[i], c = dC[i];
            if (Number.isNaN(s) || Number.isNaN(c) || !(s < c - 0.0005)) continue;
            front++;
            if (c - s < 0.03) { const px = (2 * tanH * s) / H; hole++; harea += px * px * 1e4; const wy = TY + (1 - 2 * (H - 1 - y + 0.5) / H) * tanH * s; hb[Math.max(0, Math.min(11, Math.floor(wy / 0.2)))]++; }
          }
          per.push({ az, front, hole, harea: +harea.toFixed(2), hb });
        }
        res[id] = per;
      }
      return res;
    }, { azs: AZS, pose, only: ONLY, speed: SPEED, vr: VAR });
    out[`${pose.state}:${pose.frac}`] = res;
  }
  // report: mean hole cm^2 per view, per person and pose
  const keys = Object.keys(out), ids = Object.keys(out[keys[0]]).sort(), mean = (per) => per.reduce((s, v) => s + v.harea, 0) / per.length;
  console.log(`${GLB}${flag('--lod') ? ' (LOD)' : ''}  hole area, cm2 per view (mean over ${AZS.length} azimuths)`);
  console.log('person'.padEnd(20) + keys.map((k) => k.padStart(11)).join('') + 'mean'.padStart(9));
  const tot = keys.map(() => 0);
  for (const id of ids) { const row = keys.map((k) => mean(out[k][id])); row.forEach((v, j) => { tot[j] += v; }); console.log(id.padEnd(20) + row.map((v) => v.toFixed(1).padStart(11)).join('') + (row.reduce((a, b) => a + b, 0) / row.length).toFixed(1).padStart(9)); }
  console.log('TOTAL'.padEnd(20) + tot.map((v) => v.toFixed(1).padStart(11)).join('') + (tot.reduce((a, b) => a + b, 0) / tot.length).toFixed(1).padStart(9));
  const j = arg('--json', null); if (j) { fs.writeFileSync(j, JSON.stringify({ glb: GLB, lod: flag('--lod'), poses: POSES, azs: AZS, out })); console.log('wrote', j); }
} catch (e) { console.error(e); exit = 1; }
finally { await browser.close(); if (server) server.kill(); }
process.exit(exit);
