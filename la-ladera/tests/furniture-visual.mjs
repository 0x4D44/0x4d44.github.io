#!/usr/bin/env node
// Labelled contact sheets of the ACTUAL shipped furniture, in a neutral studio.
// One browser and WebGL context render the entire catalogue through buildInterior and MaterialLib.
//   CHROME_PATH=/path/to/chrome node la-ladera/tests/furniture-visual.mjs
//   node la-ladera/tests/furniture-visual.mjs --out .scratch/furniture/visual --only bed_double,stove_gas
// Output: 25 assets per PNG + report.json, all scratch files. LOOK at the PNGs; pixel checks do not judge art quality.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative, join, sep } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(REPO, option('out', '.scratch/furniture/visual'));
const selected = option('only', '').split(',').filter(Boolean);
const config = { width: 1800, height: 1510, cols: 5, rows: 5, pad: 20, gap: 10, header: 90, tileW: 344, tileH: 270, renderH: 218, selected };
const fixtureDir = resolve(REPO, '.scratch/furniture/visual-runtime');
await mkdir(fixtureDir, { recursive: true }); await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('../assets/models/manifest.furniture.json', import.meta.url), 'utf8'));
const expectedFiles = (manifest.files ?? []).map((f) => '/la-ladera/assets/models/' + f.glb);
assert.ok(expectedFiles.length, 'furniture manifest is empty: no models to visually verify');

// This function is serialized into the scratch fixture, not executed under Node.
async function browserMain(settings) {
  const THREE = await import('three');
  const { RoomEnvironment } = await import('three/addons/environments/RoomEnvironment.js');
  const { createContext } = await import('/la-ladera/js/core/ctx.js');
  const { makeFrame } = await import('/la-ladera/js/core/frame.js');
  const { CATALOG, PAL } = await import('/la-ladera/js/interiors/catalog.js');
  const { loadInteriorAssets, glbParts, buildInterior } = await import('/la-ladera/js/interiors/build.js');
  const ctx = createContext({ headless: true });
  await ctx.matlib.init(); await ctx.assets.init(); await loadInteriorAssets(ctx);
  const all = Object.keys(CATALOG), keys = settings.selected.length ? settings.selected : all;
  if (ctx.interiorGlb.size < 120) throw new Error('Only ' + ctx.interiorGlb.size + ' drawable furniture assets; minimum 120');
  for (const key of keys) if (!ctx.interiorGlb.has(key)) throw new Error('Missing GLB for catalogue key ' + key);
  // Request every model material before the first render, then wait for the real local textures.
  for (const key of keys) for (const part of glbParts(ctx, key)) ctx.mat(part.matKey);
  await ctx.matlib.whenReady();
  // A wall-light halo belongs to the room behind a TV, not an isolated product view.
  ctx.matlib.cache.delete('tv_glow');
  if (ctx.errors.length) throw new Error(JSON.stringify(ctx.errors));

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(settings.width, settings.height);
  renderer.setClearColor(0xf4f1eb, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = 'studio'; document.body.prepend(renderer.domElement);
  const scene = ctx.scene; scene.background = new THREE.Color(0xf4f1eb);
  const environment = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(environment, 0.04); scene.environment = env.texture; scene.environmentIntensity = 0.45;
  environment.dispose(); pmrem.dispose();
  scene.add(new THREE.HemisphereLight(0xfffaf2, 0x9b968b, 1.8));
  const sun = new THREE.DirectionalLight(0xfffaf3, 2.5); sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.00015; sun.shadow.normalBias = 0.012;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xe1edff, 0.65); fill.position.set(-3, 2, -2); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xded8cc, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const camera = new THREE.PerspectiveCamera(34, (settings.tileW - 8) / settings.renderH, 0.01, 100);
  const gl = renderer.getContext();
  const pixels = new Uint8Array((settings.tileW - 8) * settings.renderH * 4);
  const report = { totalCatalogue: all.length, loaded: ctx.interiorGlb.size, selected: keys.length, pages: Math.ceil(keys.length / (settings.cols * settings.rows)), glb: 0, standin: 0, failed: 0, items: [] };
  const labels = document.getElementById('labels');

  function renderPage(page) {
    const perPage = settings.cols * settings.rows, list = keys.slice(page * perPage, (page + 1) * perPage);
    if (!list.length) throw new Error('Empty contact-sheet page ' + page);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, settings.width, settings.height); renderer.clear();
    renderer.setScissorTest(true); labels.replaceChildren();
    document.getElementById('range').textContent = `${page * perPage + 1}–${page * perPage + list.length} / ${keys.length} assets · Sheet ${page + 1} / ${report.pages}`;
    const items = [];
    for (let i = 0; i < list.length; i++) {
      const key = list[i], c = CATALOG[key], palette = PAL[c.cols] ?? PAL.none;
      const id = 'contact-' + key, kind = c.ceil ? 'ceil' : c.wall ? 'wall' : c.top === true ? 'top' : 'floor';
      const bp = { id, lot: {}, frame: makeFrame(0, 0, 0), rooms: [], windows: [], interior: {}, furniture: [{
        id: 'contact.' + key, name: key, x: 0, y: kind === 'ceil' ? c.size[1] : 0, z: 0, ry: 0, kind,
        w: c.size[0], h: c.size[1], d: c.size[2], tint: c.cols === 'none' ? undefined : palette[0], flags: { magnets: true },
      }] };
      buildInterior(ctx, bp);
      const group = ctx.batch.groups.get(id + '.int'), stats = bp.interior.stats;
      if (stats.glb !== 1 || stats.standin || stats.failed) throw new Error(key + ': not rendered from its GLB: ' + JSON.stringify(stats));
      group.obj.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      group.obj.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(group.obj), center = box.getCenter(new THREE.Vector3());
      const sphere = box.getBoundingSphere(new THREE.Sphere()), radius = Math.max(0.04, sphere.radius), span = radius * 2;
      const distance = radius / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.12;
      camera.position.copy(center).add(new THREE.Vector3(4, 3, 6).normalize().multiplyScalar(distance));
      camera.near = Math.max(0.002, distance - radius * 2); camera.far = distance + radius * 12 + 2;
      camera.lookAt(center); camera.updateProjectionMatrix();
      sun.position.copy(center).add(new THREE.Vector3(-3, 6, 5).multiplyScalar(radius)); sun.target.position.copy(center);
      const sc = sun.shadow.camera; sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.near = 0.01; sc.far = radius * 20 + 2; sc.updateProjectionMatrix();
      ground.position.set(center.x, box.min.y - Math.min(0.004, radius * 0.01), center.z); ground.scale.set(span * 3, span * 3, 1);
      const x = settings.pad + (i % settings.cols) * (settings.tileW + settings.gap), y = settings.header + Math.floor(i / settings.cols) * (settings.tileH + settings.gap);
      const vx = x + 4, vy = settings.height - (y + 4 + settings.renderH), vw = settings.tileW - 8;
      renderer.setViewport(vx, vy, vw, settings.renderH); renderer.setScissor(vx, vy, vw, settings.renderH);
      // Count non-background pixels with the floor hidden, so a blank tile cannot pass on the studio set alone.
      ground.visible = false; renderer.render(scene, camera);
      gl.readPixels(vx, vy, vw, settings.renderH, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      const background = [pixels[0], pixels[1], pixels[2]]; let visiblePixels = 0;
      for (let j = 0; j < pixels.length; j += 4) {
        if (Math.abs(pixels[j] - background[0]) + Math.abs(pixels[j + 1] - background[1]) + Math.abs(pixels[j + 2] - background[2]) > 25) visiblePixels++;
      }
      if (visiblePixels < 50) throw new Error(key + ': only ' + visiblePixels + ' model pixels; empty or invisible geometry');
      ground.visible = true; renderer.render(scene, camera);
      const tile = document.createElement('div'); tile.className = 'tile';
      Object.assign(tile.style, { left: x + 'px', top: y + 'px', width: settings.tileW + 'px', height: settings.tileH + 'px' });
      const label = document.createElement('div'); label.className = 'label';
      const title = document.createElement('b'); title.textContent = String(page * perPage + i + 1).padStart(3, '0') + '  ' + key;
      const dims = document.createElement('span'); dims.textContent = c.size.map((n) => n.toFixed(2)).join(' × ') + ' m  ·  ' + kind;
      label.append(title, dims); tile.append(label); labels.append(tile);
      const item = { key, size: c.size, kind, visiblePixels, triangles: stats.tris, materials: stats.materials, glb: stats.glb, standin: stats.standin, failed: stats.failed };
      items.push(item); report.items.push(item); report.glb += stats.glb; report.standin += stats.standin; report.failed += stats.failed;
      for (const mesh of group.meshes) mesh.geometry.dispose();
      group.obj.removeFromParent(); ctx.batch.groups.delete(id + '.int');
    }
    if (ctx.errors.length) throw new Error(JSON.stringify(ctx.errors));
    return items;
  }
  window.__furniture = { renderPage, report, errors: () => ctx.errors };
  return { loaded: report.loaded, selected: report.selected, pages: report.pages, totalCatalogue: all.length };
}

const html = `<!doctype html><html><head><meta charset="utf-8"><base href="/la-ladera/">
<link rel="icon" href="data:,"><title>La Ladera furniture contact sheets</title>
<script type="importmap">{"imports":{"three":"./vendor/three/build/three.module.min.js","three/addons/":"./vendor/three/examples/jsm/"}}</script>
<style>
*{box-sizing:border-box}body{margin:0;width:${config.width}px;height:${config.height}px;overflow:hidden;background:#f4f1eb;color:#272a29;font-family:Arial,sans-serif}
#studio{position:absolute;inset:0;z-index:0}#labels{inset:0}header,#labels,footer{position:absolute;z-index:1}header{left:24px;right:24px;top:18px}h1{font-size:27px;letter-spacing:.03em;margin:0 0 8px}header p{font-size:14px;margin:0;color:#5d625d}#range{position:absolute;right:0;top:9px;font-size:17px;color:#454c45}
.tile{position:absolute;border:1px solid #d6d3cb;border-radius:7px;overflow:hidden}.label{position:absolute;bottom:0;left:0;right:0;padding:6px 10px 8px;background:#eeebe4;border-top:1px solid #dedbd3}.label b{display:block;font:600 14px monospace;white-space:nowrap}.label span{display:block;font-size:12px;color:#5e645d;margin-top:4px}
footer{bottom:8px;left:24px;right:24px;font-size:12px;color:#5f655e}
</style></head><body><header><h1>LA LADERA · FURNITURE LIBRARY</h1><p>Actual Blender GLBs · Shared in-game materials · Neutral studio light · Views individually fitted</p><div id="range"></div></header><div id="labels"></div><footer>Dimensions: width × height × depth in metres. Front faces +Z; models stand on Y = 0. Ceiling and wall items are shown unmounted for inspection.</footer>
<script type="module">window.__furnitureReady = (${browserMain.toString()})(${JSON.stringify(config)});</script></body></html>`;
const fixture = join(fixtureDir, 'contact.html'); await writeFile(fixture, html);
const report = { fixture: relative(REPO, fixture), output: relative(REPO, out), sheets: [] };
let browser;
try {
  browser = await launch({ width: config.width, height: config.height, gpu: 'swiftshader' });
  const p = browser.page, responses = new Map(), listener = p.b.listeners.get(p.sid);
  p.b.listeners.set(p.sid, (message) => {
    if (message.method === 'Network.responseReceived') {
      const response = message.params.response, path = new URL(response.url).pathname;
      if (path.includes('/assets/models/furniture/')) responses.set(path, response.status);
    }
    listener(message);
  });
  await browser.open(relative(REPO, fixture).split(sep).join('/'), { ready: false });
  await p.waitFor('!!window.__furnitureReady');
  report.library = await p.eval('window.__furnitureReady');
  for (let i = 0; i < report.library.pages; i++) {
    const items = await p.eval(`window.__furniture.renderPage(${i})`);
    await p.eval('new Promise(resolve => requestAnimationFrame(() => resolve(true)))');
    const file = join(out, `furniture-${String(i + 1).padStart(2, '0')}.png`);
    await p.pageShot(file);
    report.sheets.push({ file: relative(REPO, file), keys: items.map((x) => x.key) });
    console.log(`sheet ${i + 1}/${report.library.pages}: ${items.length} actual GLB assets -> ${relative(REPO, file)}`);
  }
  report.render = await p.eval('window.__furniture.report'); report.page = p.summary();
  report.glbResponses = Object.fromEntries(responses);
  assert.equal(report.render.glb, report.library.selected); assert.equal(report.render.standin, 0); assert.equal(report.render.failed, 0);
  if (!selected.length) assert.equal(report.render.glb, report.library.totalCatalogue, 'whole catalogue must appear');
  for (const file of expectedFiles) assert.equal(responses.get(file), 200, `missing or unsuccessful GLB request: ${file}`);
  for (const [kind, findings] of Object.entries(report.page)) assert.deepEqual(findings, [], kind);
} catch (e) { report.fatal = String(e?.stack ?? e); if (browser) report.page = browser.page.summary(); }
finally { if (browser) await browser.close(); }
await writeFile(join(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
if (report.fatal) { console.error(report.fatal); process.exitCode = 1; }
else console.log(`PASS: ${report.render.glb} GLB models; ${report.sheets.length} contact sheets; no stand-ins, failed records, browser errors, warnings or failed model requests.`);
