// Actual child GLBs beside a fixed adult tee. Always quiet/headless through the project's Chrome harness.
// CHROME_PATH=/path/to/chrome LADERA_PRIO=idle node la-ladera/tests/garments-child-visual.mjs
import './nice.mjs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { launch, REPO } from './chrome.mjs';

const argv = process.argv.slice(2), oi = argv.indexOf('--out');
if (oi >= 0 && !argv[oi + 1]) throw new Error('--out requires a path');
const out = resolve(oi >= 0 ? argv[oi + 1] : join(REPO, 'la-ladera/dev/garments-child/evidence'));
const models = join(REPO, 'la-ladera/assets/models');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifests = ['manifest.garments.json', 'manifest.garments-child.json'];
async function sourceHashes() {
  const paths = new Set([
    ...manifests.map((p) => join(models, p)), join(models, 'garments/palette.json'), join(models, 'garments/prints.png'),
    join(REPO, 'la-ladera/tools/blender/garments-child.catalog.json'),
    join(REPO, 'la-ladera/dev/garments-child/preview.js'), join(REPO, 'la-ladera/dev/garments-child/preview.html'),
  ]);
  for (const path of manifests) {
    const man = JSON.parse(await readFile(join(models, path), 'utf8'));
    for (const f of man.files) {
      paths.add(join(models, f.glb));
      for (const a of Object.values(f.assets)) paths.add(join(models, a.lod.glb));
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
  const page = await browser.open('la-ladera/dev/garments-child/preview.html', { ready: false });
  await page.waitFor('!!window.__childGarments?.ready');
  const ready = await page.eval('window.__childGarments.ready');
  assert.equal(ready.revision, '180'); assert.ok(ready.count >= 15 && ready.count <= 25);
  assert.deepEqual(ready.atlas, { width: 256, height: 256 });
  report.initial = ready; report.renderer = await browser.renderer();
  for (const [state, lod] of [['hung', false], ['flat', false], ['folded', false], ['hung', true]]) {
    const result = await page.fn((state, lod) => window.__childGarments.contact(state, lod), state, lod);
    assert.equal(result.report.count, ready.states[state]);
    assert.ok(result.dataUrl?.startsWith('data:image/jpeg;base64,'));
    const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64'); assert.ok(bytes.length > 5000);
    const name = `contact-${state}${lod ? '-lod' : ''}.jpg`;
    await writeFile(join(out, name), bytes);
    report.screenshots.push({ file: name, bytes: bytes.length, sha256: hash(bytes) });
    report.contacts.push({ ...result.report, screenshot: name });
    for (const item of result.report.items) {
      assert.deepEqual(item.modelScale, [1, 1, 1]); assert.deepEqual(item.referenceScale, [1, 1, 1]);
      assert.ok(item.occupiedPixels >= 20); assert.ok(item.triangles <= (lod ? 240 : 900));
    }
    console.log(`${name}: ${result.report.count} actual GLBs, ${result.report.worldWidth} m common camera width`);
  }
  report.loadedFiles = await page.eval('window.__childGarments.loadedFiles()'); report.browser = page.summary();
  assert.deepEqual([...report.browser.errors, ...report.browser.netErrors, ...report.browser.consoleErrors], []);
  const tee = report.contacts[0].items.find((i) => i.key === 'garment_child_tshirt_hung');
  assert.ok(tee, 'Missing child T-shirt scale comparator');
  const ratio = tee.size[1] / tee.referenceSize[1];
  assert.ok(ratio >= 0.55 && ratio <= 0.65, `Child/adult tee measured ratio ${ratio}`);
  report.teeMeasuredLengthRatio = ratio; report.pass = true;
} catch (error) {
  report.pass = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser?.close();
  const after = await sourceHashes().catch(() => null);
  if (!after || JSON.stringify(after) !== JSON.stringify(initialHashes)) { report.pass = false; report.error = `${report.error ?? ''}\nSources changed during capture; rerun evidence.`.trim(); process.exitCode = 1; }
  await writeFile(join(out, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');
}
if (report.pass) console.log(`PASS: ${report.contacts.reduce((n, c) => n + c.count, 0)} state renders; measured child/adult tee ratio ${report.teeMeasuredLengthRatio.toFixed(3)}; no browser errors.`);
