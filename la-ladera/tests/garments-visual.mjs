// Real GLB visual evidence, always through the project's quiet, headless-only Chrome driver.
// CHROME_PATH=/path/to/chrome node la-ladera/tools/nice.mjs node la-ladera/tests/garments-visual.mjs
//   [--out la-ladera/dev/garments/evidence] [--quick] [--only key,key] [--fixtures-only] [--manifest repo-relative.json] [--no-atlas]
import './nice.mjs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join, resolve, relative, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(`--${name}`); if (i < 0) return fallback; if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing --${name} value`); return args[i + 1]; };
const out = resolve(option('out', 'la-ladera/dev/garments/evidence'));
const quick = args.includes('--quick'), only = option('only', '').split(',').filter(Boolean), fixturesOnly = args.includes('--fixtures-only');
if (fixturesOnly && (quick || only.length)) throw new Error('--fixtures-only cannot be combined with --quick or --only');
let manifestPath = option('manifest', 'la-ladera/assets/models/manifest.garments.json');
if (isAbsolute(manifestPath)) manifestPath = relative(REPO, manifestPath);
if (manifestPath.startsWith('..')) throw new Error('Manifest must be inside the repository served by chrome.mjs');
const query = new URLSearchParams({ manifest: `/${manifestPath.replaceAll('\\', '/')}` });
if (args.includes('--no-atlas')) query.set('atlas', '0');
await mkdir(join(out, 'items'), { recursive: true });
await mkdir(join(out, 'fixtures'), { recursive: true });
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(resolve(REPO, manifestPath)), manifestSHA = sha256(manifestBytes), manifestData = JSON.parse(manifestBytes);
async function sourceHashes() {
  const models = dirname(resolve(REPO, manifestPath));
  const paletteFile = resolve(models, typeof manifestData.palette === 'string' ? manifestData.palette : 'garments/palette.json');
  const palette = JSON.parse(await readFile(paletteFile));
  const files = new Set([resolve(REPO, manifestPath), paletteFile, resolve(dirname(paletteFile), palette.atlas.file), resolve(models, 'garments/assortments.json'), resolve(models, '../../tools/blender/garments.catalog.json')]);
  for (const set of manifestData.files) {
    files.add(resolve(models, set.glb));
    for (const asset of Object.values(set.assets)) files.add(resolve(models, asset.lod.glb));
  }
  const hashes = {};
  for (const path of [...files].sort()) hashes[relative(REPO, path).replaceAll('\\', '/')] = sha256(await readFile(path));
  return hashes;
}
const initialHashes = await sourceHashes();
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), manifest: manifestPath, manifestSha256: manifestSHA, sourceHashes: initialHashes, previewOnly: true, quick, only, fixturesOnly, items: [], fixtures: [], contacts: [], lod: [], backViews: [], screenshots: [] };
if (fixturesOnly) {
  const previous = JSON.parse(await readFile(join(out, 'visual-report.json')));
  if (previous.manifestSha256 !== manifestSHA) throw new Error('Cannot reuse object screenshots: manifest SHA changed. Run the full visual harness.');
  if (previous.sourceHashes && JSON.stringify(previous.sourceHashes) !== JSON.stringify(initialHashes)) throw new Error('Cannot reuse object screenshots: a model, atlas or source data file changed.');
  const expected = manifestData.files.reduce((count, set) => count + Object.keys(set.assets).length, 0);
  if (previous.items?.length !== expected || previous.items.some((item) => !item.visibleMeshes || item.geometryChecks?.some((check) => !check.pass))) throw new Error('Cannot reuse an incomplete or failed object capture.');
  // Older reports already bind high-detail GLBs through hashes in the identical manifest; verify those bytes as well.
  for (const set of manifestData.files) if (set.sha256 && initialHashes[relative(REPO, resolve(dirname(resolve(REPO, manifestPath)), set.glb)).replaceAll('\\', '/')] !== set.sha256) throw new Error(`Manifest GLB hash mismatch: ${set.glb}`);
  const saved = previous.screenshots.filter((shot) => !shot.file.startsWith('fixtures/') && !shot.file.includes('_back.jpg') && shot.file !== 'contact-back.jpg');
  for (const shot of saved) if (sha256(await readFile(join(out, shot.file))) !== shot.sha256) throw new Error(`Cannot reuse altered screenshot: ${shot.file}`);
  report.items = previous.items; report.contacts = previous.contacts; report.lod = previous.lod; report.screenshots = saved;
  report.reusedCapture = { generatedAt: previous.generatedAt, manifestSha256: previous.manifestSha256, stateImages: previous.items.length, screenshotHashesVerified: saved.length };
}
const browser = await launch({ width: 1024, height: 800, gpu: option('gpu', 'auto') });

async function saveImage(result, path) {
  if (!result.dataUrl?.startsWith('data:image/jpeg;base64,')) throw new Error(`Expected actual rendered JPEG for ${path}`);
  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  if (bytes.length < 2000) throw new Error(`Suspiciously empty screenshot ${path}`);
  await mkdir(dirname(path), { recursive: true }); await writeFile(path, bytes);
  const shot = { file: relative(out, path).replaceAll('\\', '/'), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  report.screenshots.push(shot); return shot;
}

try {
  const page = await browser.open(`la-ladera/dev/garments/preview.html?${query}`, { ready: false });
  await page.waitFor('!!window.__garments?.ready');
  const ready = await page.eval('window.__garments.ready');
  report.initial = ready;
  report.renderer = await browser.renderer();
  if (ready.revision !== '180') throw new Error(`Expected vendored Three.js r180, got ${ready.revision}`);
  let selected = ready.entries;
  if (fixturesOnly) selected = [];
  else if (only.length) {
    for (const key of only) if (!selected.some((entry) => entry.key === key)) throw new Error(`Unknown --only key ${key}`);
    selected = selected.filter((entry) => only.includes(entry.key));
  } else if (quick) {
    const preferred = ['garment_tshirt_flat', 'garment_tshirt_folded', 'garment_knickers_hung', 'garment_swimsuit_onepiece_flat', 'garment_socks_pair_hung', 'garment_straw_hat_flat'];
    const wanted = [...preferred.filter((key) => selected.some((entry) => entry.key === key)), ...selected.map((entry) => entry.key)];
    const quickKeys = [...new Set(wanted)].slice(0, 6);
    selected = quickKeys.map((key) => selected.find((entry) => entry.key === key));
  }
  for (const entry of selected) {
    const result = await page.fn((key) => window.__garments.capture(key), entry.key);
    const shot = await saveImage(result, join(out, 'items', `${entry.key}.jpg`));
    report.items.push({ ...result.report, screenshot: shot.file });
    console.log(`${entry.key}: ${result.report.triangles} triangles; visible ${(result.report.occupancy * 100).toFixed(1)}%; ${shot.file}`);
    const failed = result.report.geometryChecks?.filter((check) => !check.pass) || [];
    if (failed.length) throw new Error(`${entry.key} failed geometry review: ${failed.map((check) => check.name).join(', ')}`);
  }
  for (const state of ['folded', 'hung', 'flat']) {
    const keys = selected.filter((entry) => entry.state === state).map((entry) => entry.key);
    if (!keys.length) continue;
    const result = await page.fn((keys, title) => window.__garments.contact(keys, title), keys, `La Ladera · ${state} garment objects`);
    const shot = await saveImage(result, join(out, `contact-${state}.jpg`)); report.contacts.push({ state, count: result.count, screenshot: shot.file });
  }
  if (!fixturesOnly) {
    const swatches = await page.eval('window.__garments.swatches()');
    await saveImage(swatches, join(out, 'palette.jpg'));
  }
  if (!quick && !only.length) {
    if (!fixturesOnly) {
      const representatives = ['garment_tshirt_hung', 'garment_swimsuit_onepiece_flat', 'garment_leggings_folded', 'garment_straw_hat_flat', 'garment_knickers_hung', 'garment_socks_pair_flat'].filter((key) => ready.entries.some((entry) => entry.key === key));
      for (const key of representatives) {
        const result = await page.fn((key) => window.__garments.capture(key, { lod: true }), key);
        const shot = await saveImage(result, join(out, 'items', `${key}_lod.jpg`)); report.lod.push({ ...result.report, screenshot: shot.file });
        const failed = result.report.geometryChecks?.filter((check) => !check.pass) || [];
        if (failed.length) throw new Error(`${key} LOD failed geometry review: ${failed.map((check) => check.name).join(', ')}`);
      }
      const pairs = representatives.flatMap((key) => [{ key, lod: false }, { key, lod: true }]);
      const comparison = await page.fn((pairs) => window.__garments.contact(pairs, 'High detail / LOD comparison', { columns: 4 }), pairs);
      await saveImage(comparison, join(out, 'contact-lod.jpg'));
    }
    const backKeys = ['garment_thong_hung', 'garment_bra_hung', 'garment_bikini_top_hung'];
    for (const key of backKeys) {
      const result = await page.fn((key) => window.__garments.capture(key, { view: 'back' }), key);
      const shot = await saveImage(result, join(out, 'items', `${key}_back.jpg`)); report.backViews.push({ ...result.report, screenshot: shot.file });
    }
    const backContact = await page.fn((keys) => window.__garments.contact(keys.map((key) => ({ key, view: 'back' })), 'Back views · empty garment construction', { columns: 3 }), backKeys);
    await saveImage(backContact, join(out, 'contact-back.jpg'));
    for (const kind of ['drawer', 'wardrobe', 'washing_line', 'shop_shelf']) {
      const result = await page.fn((kind) => window.__garments.fixture(kind), kind);
      const shot = await saveImage(result, join(out, 'fixtures', `${kind}.jpg`)); report.fixtures.push({ ...result.report, screenshot: shot.file });
      console.log(`${kind}: ${result.report.garmentInstances} actual garment instances; ${result.report.garmentTriangles} garment triangles`);
    }
  }
  report.loadedFiles = await page.eval('window.__garments.loadedFiles()');
  report.browser = page.summary();
  const problems = [...report.browser.errors, ...report.browser.netErrors, ...report.browser.consoleErrors];
  if (problems.length) throw new Error(`Visual review browser errors: ${problems.join('\n')}`);
  if (!quick && !only.length && report.items.length !== ready.entries.length) throw new Error('Incomplete garment screenshot coverage');
  if (!quick && !only.length && report.fixtures.length !== 4) throw new Error('Missing requested fixture screenshot');
  report.pass = true;
  report.complete = !quick && !only.length;
  console.log(`PASS: ${report.items.length} state screenshots, ${report.lod.length} LOD renders, ${report.backViews.length} back views, ${report.fixtures.length} fixtures, ${report.screenshots.length} image files.`);
} catch (error) {
  report.pass = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser.close();
  // A generator must not replace any source halfway through the screenshot run.
  const finalHashes = await sourceHashes().catch(() => null);
  if (!finalHashes || JSON.stringify(finalHashes) !== JSON.stringify(initialHashes)) {
    report.pass = false; report.complete = false; report.error = `${report.error || ''}\nGarment sources changed during the capture; regenerate evidence.`.trim(); process.exitCode = 1;
  }
  await writeFile(join(out, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');
}
