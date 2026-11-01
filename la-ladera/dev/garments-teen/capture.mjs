// Headless real-GLB contact sheets. Uses the project's quiet low-priority browser harness.
// CHROME_PATH=/path/to/chrome LADERA_PRIO=idle node la-ladera/dev/garments-teen/capture.mjs
import '../../tests/nice.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { launch, REPO } from '../../tests/chrome.mjs';

const argv = process.argv.slice(2), outIndex = argv.indexOf('--out');
if (outIndex >= 0 && !argv[outIndex + 1]) throw new Error('--out requires a path');
const out = resolve(outIndex >= 0 ? argv[outIndex + 1] : join(REPO, 'la-ladera/dev/garments-teen/evidence'));
const models = join(REPO, 'la-ladera/assets/models');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifests = ['manifest.garments.json', 'manifest.garments-child.json', 'manifest.garments-teen.json'];
async function sourceHashes() {
  const paths = new Set([
    ...manifests.map((p) => join(models, p)), join(REPO, 'la-ladera/tools/blender/garments_teen.catalog.json'),
    join(REPO, 'la-ladera/dev/garments-teen/preview.js'), join(REPO, 'la-ladera/dev/garments-teen/preview.html'),
    join(REPO, 'la-ladera/dev/garments-teen/capture.mjs'),
  ]);
  for (const path of manifests) {
    const manifest = JSON.parse(await readFile(join(models, path), 'utf8'));
    paths.add(join(models, manifest.palette)); paths.add(join(models, manifest.atlas.file));
    for (const file of manifest.files) {
      paths.add(join(models, file.glb));
      for (const asset of Object.values(file.assets)) paths.add(join(models, asset.lod.glb));
    }
  }
  const result = {};
  for (const path of [...paths].sort()) result[relative(REPO, path).replaceAll('\\', '/')] = hash(await readFile(path));
  return result;
}
const initialHashes = await sourceHashes();
await mkdir(out, { recursive: true });
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), sourceHashes: initialHashes, actualGLBMeshes: true, fixedOrthographicScale: true, previewOnly: true, contacts: [], screenshots: [] };
let browser;
try {
  browser = await launch({ width: 1500, height: 1100, gpu: 'swiftshader' });
  const page = await browser.open('la-ladera/dev/garments-teen/preview.html', { ready: false });
  await page.waitFor('!!window.__teenGarments?.ready');
  const ready = await page.eval('window.__teenGarments.ready');
  assert.equal(ready.revision, '180'); assert.equal(ready.count, 29);
  assert.deepEqual(ready.states, { hung: 26, flat: 29, folded: 26 });
  assert.equal(ready.atlases.length, 2);
  for (const atlas of ready.atlases) { assert.equal(atlas.width, 256); assert.equal(atlas.height, 256); }
  report.initial = ready; report.renderer = await browser.renderer();
  for (const lod of [false, true]) for (const state of ['hung', 'flat', 'folded']) {
    const result = await page.fn((state, lod) => window.__teenGarments.contact(state, lod), state, lod);
    assert.equal(result.report.count, ready.states[state]); assert.equal(result.report.worldWidth, 3.90);
    assert.ok(result.dataUrl?.startsWith('data:image/webp;base64,'));
    const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64'); assert.ok(bytes.length > 5000);
    const name = `contact-${state}${lod ? '-lod' : ''}.webp`;
    await writeFile(join(out, name), bytes);
    report.screenshots.push({ file: name, bytes: bytes.length, sha256: hash(bytes) });
    report.contacts.push({ ...result.report, screenshot: name });
    for (const item of result.report.items) {
      assert.equal(item.models.length, 4); assert.equal(item.drawCalls, 4);
      assert.match(item.models[0].key, /^garment_tshirt_/); assert.match(item.models[1].key, /^garment_child_tshirt_/);
      assert.match(item.models[2].key, /_small_/); assert.match(item.models[3].key, /_big_/);
      for (const model of item.models) { assert.deepEqual(model.rootScale, [1, 1, 1]); assert.ok(model.occupiedPixels >= 20); assert.ok(model.cameraExtent < 0.985); }
      for (const model of item.models.slice(2)) assert.ok(model.triangles <= (lod ? 240 : 800));
      for (let axis = 0; axis < 3; axis++) assert.ok(Math.abs(item.models[2].size[axis] * 9 / 7 - item.models[3].size[axis]) < 0.001, `${item.styleId}: size ratio axis ${axis}`);
    }
    console.log(`${name}: ${result.report.teenObjects} actual teen GLBs, ${result.report.count} adult+child reference pairs; ${result.report.worldWidth.toFixed(2)} m common camera width`);
  }
  report.loadedFiles = await page.eval('window.__teenGarments.loadedFiles()'); report.browser = page.summary();
  assert.deepEqual([...report.browser.errors, ...report.browser.netErrors, ...report.browser.consoleErrors], []);
  const tee = report.contacts[0].items.find((item) => item.styleId === 'tshirt_cream'); assert.ok(tee);
  const adultDrop = tee.models[0].size[1];
  report.teeMeasuredLengthRatios = Object.fromEntries(['adult', 'child', 'small', 'big'].map((name, i) => [name, tee.models[i].size[1] / adultDrop]));
  assert.ok(report.teeMeasuredLengthRatios.child >= 0.55 && report.teeMeasuredLengthRatios.child <= 0.65);
  assert.ok(report.teeMeasuredLengthRatios.small >= 0.65 && report.teeMeasuredLengthRatios.small <= 0.75);
  assert.ok(report.teeMeasuredLengthRatios.big >= 0.85 && report.teeMeasuredLengthRatios.big <= 0.95);
  report.pass = true;
} catch (error) {
  report.pass = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser?.close();
  const after = await sourceHashes().catch(() => null);
  if (!after || JSON.stringify(after) !== JSON.stringify(initialHashes)) { report.pass = false; report.error = `${report.error ?? ''}\nSources changed during capture; rerun evidence.`.trim(); process.exitCode = 1; }
  await writeFile(join(out, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (report.pass) console.log(`PASS: ${report.contacts.reduce((n, c) => n + c.teenObjects, 0)} teen state/LOD renders plus adult/child references; unchanged source hashes; no browser errors.`);
