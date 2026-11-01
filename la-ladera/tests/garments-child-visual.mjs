// Actual child GLB renders through the repository's quiet headless-only browser.
// CHROME_PATH=/path/to/chrome node la-ladera/tests/garments-child-visual.mjs
//   [--out la-ladera/dev/garments/child-evidence] [--gpu auto|swiftshader] [--no-atlas]
import './nice.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i < 0) return fallback; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing --${name} value`); return args[i + 1]; };
const out = resolve(option('out', join(REPO, 'la-ladera/dev/garments/child-evidence')));
const manifestPath = 'la-ladera/assets/models/manifest.garments_child.json';
const models = resolve(REPO, 'la-ladera/assets/models');
const manifestData = JSON.parse(await readFile(resolve(REPO, manifestPath)));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function sourceHashes() {
  const palettePath = resolve(models, manifestData.palette), palette = JSON.parse(await readFile(palettePath));
  const files = new Set([resolve(REPO, manifestPath), palettePath, resolve(dirname(palettePath), palette.atlas.file)]);
  for (const set of manifestData.files) { files.add(resolve(models, set.glb)); for (const asset of Object.values(set.assets)) files.add(resolve(models, asset.lod.glb)); }
  const hashes = {};
  for (const file of [...files].sort()) hashes[relative(REPO, file).replaceAll('\\', '/')] = sha256(await readFile(file));
  return hashes;
}
const initialHashes = await sourceHashes();
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), manifest: manifestPath, sourceHashes: initialHashes,
  previewOnly: true, sharedScaleWithinComparison: true, items: [], lodItems: [], contacts: [], screenshots: [] };
await mkdir(out, { recursive: true });
let browser;
async function saveImage(result, filename) {
  if (!result.dataUrl?.startsWith('data:image/jpeg;base64,')) throw new Error(`Expected rendered JPEG for ${filename}`);
  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  if (bytes.length < 2000) throw new Error(`Empty render ${filename}`);
  await writeFile(join(out, filename), bytes);
  const shot = { file: filename, bytes: bytes.length, sha256: sha256(bytes), width: result.width, height: result.height };
  report.screenshots.push(shot); return shot;
}
try {
  browser = await launch({ width: 1200, height: 900, gpu: option('gpu', 'auto') });
  const query = new URLSearchParams({ manifest: `/${manifestPath}` }); if (args.includes('--no-atlas')) query.set('atlas', '0');
  const page = await browser.open(`la-ladera/dev/garments/child-preview.html?${query}`, { ready: false });
  await page.waitFor('!!window.__childGarments?.ready');
  report.initial = await page.eval('window.__childGarments.ready'); report.renderer = await browser.renderer();
  if (report.initial.revision !== '180') throw new Error(`Expected vendored Three.js r180, got ${report.initial.revision}`);
  for (const state of ['folded', 'hung', 'flat']) {
    const result = await page.fn((state) => window.__childGarments.contact(state), state);
    const shot = await saveImage(result, `contact-${state}.jpg`);
    report.items.push(...result.items); report.contacts.push({ state, count: result.count, screenshot: shot.file });
    console.log(`${state}: ${result.count} paired comparisons / ${result.items.length} high-detail assets`);
    const lodResult = await page.fn((state) => window.__childGarments.contact(state, { lod: true }), state);
    report.lodItems.push(...lodResult.items);
    if (lodResult.items.some((item) => !item.meshes || item.triangles <= 0)) throw new Error(`Empty ${state} LOD render`);
  }
  const comparison = await page.eval("window.__childGarments.contact('flat', { compareLod: true })");
  await saveImage(comparison, 'contact-lod.jpg');
  report.loadedFiles = await page.eval('window.__childGarments.loadedFiles()'); report.browser = page.summary();
  const errors = [...report.browser.errors, ...report.browser.netErrors, ...report.browser.consoleErrors];
  if (errors.length) throw new Error(`Browser errors: ${errors.join('\n')}`);
  const expectedKeys = new Set(report.initial.entries.map((entry) => entry.key));
  for (const [name, items] of [['high', report.items], ['LOD', report.lodItems]]) {
    const actualKeys = new Set(items.map((item) => item.key));
    if (items.length !== expectedKeys.size || actualKeys.size !== expectedKeys.size || [...expectedKeys].some((key) => !actualKeys.has(key))) throw new Error(`Incomplete ${name} render coverage`);
  }
  report.pass = true; report.complete = true;
  console.log(`PASS child visual evidence: ${report.items.length} states, ${report.lodItems.length} LODs, ${report.screenshots.length} contact sheets; no browser errors.`);
} catch (error) {
  report.pass = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser?.close();
  const finalHashes = await sourceHashes().catch(() => null);
  if (!finalHashes || JSON.stringify(finalHashes) !== JSON.stringify(initialHashes)) {
    report.pass = false; report.complete = false; report.error = `${report.error || ''}\nChild sources changed during capture; regenerate evidence.`.trim(); process.exitCode = 1;
  }
  await writeFile(join(out, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');
}
