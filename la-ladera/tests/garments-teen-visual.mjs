// Complete real-GLB contact sheets and same-scale size pairs. Uses headless-only project Chrome.
// CHROME_PATH=/path/to/chrome node la-ladera/tests/garments-teen-visual.mjs
//   [--out la-ladera/dev/garments/teen-evidence] [--models /absolute/isolated/models] [--gpu swiftshader]
//   [--quick | --only garment_key,garment_key]
import './nice.mjs';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`); if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`Missing --${name} value`);
  return args[i + 1];
};
const out = resolve(option('out', 'la-ladera/dev/garments/teen-evidence'));
const quick = args.includes('--quick');
const only = option('only', '').split(',').filter(Boolean), partial = quick || only.length > 0;
if (quick && only.length) throw new Error('--quick and --only are alternatives');
const modelsOverride = option('models', null);
const modelsDir = modelsOverride ? resolve(modelsOverride) : resolve(REPO, 'la-ladera/assets/models');
const manifestFile = join(modelsDir, 'manifest.garments_teen.json');
const manifestPath = relative(REPO, manifestFile).replaceAll('\\', '/');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const manifestBytes = await readFile(manifestFile), manifest = JSON.parse(manifestBytes);
const paletteFile = resolve(modelsDir, manifest.palette), palette = JSON.parse(await readFile(paletteFile));
const catalogueFile = resolve(REPO, 'la-ladera/tools/blender/garments_teen.catalog.json');
const catalogue = JSON.parse(await readFile(catalogueFile));
const sourceFiles = new Set([manifestFile, paletteFile, resolve(dirname(paletteFile), palette.atlas.file), catalogueFile]);
for (const set of manifest.files) {
  sourceFiles.add(resolve(modelsDir, set.glb));
  for (const asset of Object.values(set.assets)) sourceFiles.add(resolve(modelsDir, asset.lod.glb));
}
async function sourceHashes() {
  const result = {};
  for (const path of [...sourceFiles].sort()) result[relative(REPO, path).replaceAll('\\', '/')] = sha256(await readFile(path));
  return result;
}
const initialHashes = await sourceHashes();
await mkdir(join(out, 'items'), { recursive: true });
const report = { schemaVersion: 1, generatedAt: new Date().toISOString(), manifest: manifestPath,
  manifestSha256: sha256(manifestBytes), sourceHashes: initialHashes, previewOnly: true,
  quick, only, items: [], lod: [], sizePairs: [], contacts: [], screenshots: [] };
let linkDirectory;
let servedManifestPath = manifestPath;
if (modelsOverride) {
  linkDirectory = await mkdtemp(resolve(REPO, 'la-ladera/dev/garments/.teen-preview-'));
  await symlink(modelsDir, join(linkDirectory, 'models'), process.platform === 'win32' ? 'junction' : 'dir');
  servedManifestPath = relative(REPO, join(linkDirectory, 'models/manifest.garments_teen.json')).replaceAll('\\', '/');
}
let browser;

async function saveImage(result, name) {
  if (!result.dataUrl?.startsWith('data:image/jpeg;base64,')) throw new Error(`Expected actual rendered JPEG: ${name}`);
  const bytes = Buffer.from(result.dataUrl.split(',')[1], 'base64');
  if (bytes.length < 2000) throw new Error(`Suspiciously empty render: ${name}`);
  await writeFile(join(out, name), bytes);
  const shot = { file: name, bytes: bytes.length, sha256: sha256(bytes) }; report.screenshots.push(shot); return shot;
}
function review(result, key) {
  const failed = result.report.geometryChecks?.filter((check) => !check.pass) || [];
  if (failed.length) throw new Error(`${key} failed geometry review: ${failed.map((check) => check.name).join(', ')}`);
  if (!result.report.visibleMeshes || !result.report.triangles) throw new Error(`${key} did not render`);
}

try {
  browser = await launch({ width: 1024, height: 800, gpu: option('gpu', 'swiftshader') });
  const query = new URLSearchParams({ manifest: `/${servedManifestPath}` });
  const page = await browser.open(`la-ladera/dev/garments/teen-preview.html?${query}`, { ready: false });
  await page.waitFor('!!window.__teenGarments?.ready');
  const ready = await page.eval('window.__teenGarments.ready'); report.initial = ready;
  report.renderer = await browser.renderer();
  if (ready.revision !== '180') throw new Error(`Expected Three.js r180, got ${ready.revision}`);
  if (!ready.atlasLoaded) throw new Error('New teen fabric atlas failed to load');
  const quickIDs = ['tshirt_sun', 'hoodie', 'denim_jeans', 'dress_maxi', 'school_shoes_pair', 'sandals_pair'];
  for (const key of only) if (!ready.entries.some((entry) => entry.key === key)) throw new Error(`Unknown --only key ${key}`);
  const selected = ready.entries.filter((entry) => only.length ? only.includes(entry.key) : !quick || quickIDs.includes(entry.garment) && entry.sizeClass === 'big' && entry.state === 'flat');
  const expectedKeys = manifest.files.flatMap((set) => Object.keys(set.assets));
  if (new Set(ready.entries.map((entry) => entry.key)).size !== expectedKeys.length || expectedKeys.some((key) => !ready.entries.some((entry) => entry.key === key))) throw new Error('Preview does not cover every manifest key');
  for (const entry of selected) {
    const result = await page.fn((key) => window.__teenGarments.capture(key), entry.key); review(result, entry.key);
    const shot = await saveImage(result, `items/${entry.key}.jpg`); report.items.push({ ...result.report, screenshot: shot.file });
    console.log(`${entry.key}: ${result.report.triangles} tri, ${result.report.size.join(' × ')} m`);
  }
  if (!partial) {
    const foldedShowcase = ['tshirt_cream', 'socks_pair'];
    const overviewKeys = catalogue.garments.map((garment) => `garment_${garment.id}_big_${foldedShowcase.includes(garment.id) ? 'folded' : 'flat'}`);
    const overview = await page.fn((keys) => window.__teenGarments.contact(keys, 'La Ladera · teen wardrobe · 29 styles', {
      columns: 6, subtitle: 'Every style in the larger size · flat silhouettes, plus folded T-shirt and socks · actual exported GLB renders',
    }), overviewKeys);
    const shot = await saveImage(overview, 'contact-overview.jpg'); report.overview = { count: overviewKeys.length, keys: overviewKeys, screenshot: shot.file };
  }
  for (const state of ['folded', 'hung', 'flat']) {
    const keys = catalogue.garments.flatMap((garment) => ['small', 'big'].map((size) => `garment_${garment.id}_${size}_${state}`)).filter((key) => selected.some((entry) => entry.key === key));
    if (!keys.length) continue;
    const result = await page.fn((keys, title) => window.__teenGarments.contact(keys, title, { columns: 6, subtitle: 'Each style: small then big · individual framing for shape review · size pairs use a shared camera on separate sheets' }), keys, `La Ladera · teen ${state} garments`);
    const shot = await saveImage(result, `contact-${state}.jpg`); report.contacts.push({ state, count: keys.length, screenshot: shot.file });
  }
  // Every low-detail state is loaded and rendered, not merely counted in JSON.
  const representatives = [];
  for (const garment of catalogue.garments) {
    if (!selected.some((entry) => entry.garment === garment.id)) continue;
    const state = garment.states.includes('hung') ? 'hung' : 'flat';
    const key = `garment_${garment.id}_big_${state}`;
    if (selected.some((entry) => entry.key === key)) representatives.push(key);
  }
  if (partial) representatives.push(...selected.map((entry) => entry.key).filter((key) => !representatives.includes(key)));
  for (const entry of selected) {
    const result = await page.fn((key) => window.__teenGarments.capture(key, { lod: true }), entry.key); review(result, `${entry.key}_lod`);
    let screenshot;
    if (representatives.includes(entry.key)) screenshot = (await saveImage(result, `items/${entry.key}_lod.jpg`)).file;
    report.lod.push({ ...result.report, ...(screenshot ? { screenshot } : {}) });
  }
  const lodPairs = representatives.flatMap((key) => [{ key, lod: false }, { key, lod: true }]);
  const lodSheet = await page.fn((keys) => window.__teenGarments.contact(keys, 'Teen garments · high detail / LOD pairs', { columns: 6 }), lodPairs);
  await saveImage(lodSheet, 'contact-lod.jpg');
  if (!partial) for (const state of ['folded', 'hung', 'flat']) {
    const stateKeys = selected.filter((entry) => entry.state === state && entry.sizeClass === 'big').map((entry) => entry.key);
    const comparisons = stateKeys.flatMap((key) => [{ key, lod: false }, { key, lod: true }]);
    if (!comparisons.length) continue;
    const sheet = await page.fn((keys, title) => window.__teenGarments.contact(keys, title, { columns: 6,
      subtitle: 'Each style: high detail on left / LOD on right · larger size · actual exported geometry',
    }), comparisons, `Teen ${state} garments · high detail / LOD`);
    const shot = await saveImage(sheet, `contact-lod-${state}.jpg`);
    report.contacts.push({ state, compareLod: true, count: stateKeys.length, screenshot: shot.file });
  }
  const pairsByState = new Map();
  for (const garment of catalogue.garments) {
    if (!selected.some((entry) => entry.garment === garment.id)) continue;
    for (const state of garment.states) {
      if (!selected.some((entry) => entry.garment === garment.id && entry.state === state)) continue;
      const pair = await page.fn((id, state) => window.__teenGarments.compareSizes(id, state), garment.id, state);
      if (!pair.report.sameWorldScale || Math.abs(pair.report.measuredSmallBigRatio - 7 / 9) > .005) throw new Error(`Bad size comparison for ${garment.id}/${state}`);
      report.sizePairs.push(pair.report);
      if (!pairsByState.has(state)) pairsByState.set(state, []);
      pairsByState.get(state).push({ cacheKey: pair.cacheKey });
    }
  }
  for (const [state, pairs] of pairsByState) {
    const result = await page.fn((pairs, title) => window.__teenGarments.contact(pairs, title, { columns: 3, cellW: 350, cellH: 238, subtitle: 'SMALL on left / BIG on right · one physical scale and camera per pair · translated only' }), pairs, `Teen size comparison · ${state}`);
    const shot = await saveImage(result, `contact-sizes-${state}.jpg`); report.contacts.push({ state, sizePairs: pairs.length, screenshot: shot.file });
  }
  await saveImage(await page.eval('window.__teenGarments.swatches()'), 'fabric-swatches.jpg');
  report.loadedFiles = await page.eval('window.__teenGarments.loadedFiles()'); report.browser = page.summary();
  const problems = [...report.browser.errors, ...report.browser.netErrors, ...report.browser.consoleErrors];
  if (problems.length) throw new Error(`Browser errors: ${problems.join('\n')}`);
  if (!partial && (report.items.length !== ready.entries.length || report.lod.length !== ready.entries.length)) throw new Error('Incomplete high/LOD capture coverage');
  if (!partial && report.sizePairs.length * 2 !== ready.entries.length) throw new Error('Incomplete paired-size capture coverage');
  report.pass = true; report.complete = !partial;
  console.log(`PASS: ${report.items.length} high-detail renders, ${report.lod.length} LOD renders, ${report.sizePairs.length} same-scale size pairs, ${report.screenshots.length} image files.`);
} catch (error) {
  report.pass = false; report.complete = false; report.error = error.stack || String(error); process.exitCode = 1; console.error(report.error);
} finally {
  await browser?.close();
  if (linkDirectory) await rm(linkDirectory, { recursive: true, force: true });
  const finalHashes = await sourceHashes().catch(() => null);
  if (!finalHashes || JSON.stringify(finalHashes) !== JSON.stringify(initialHashes)) {
    report.pass = false; report.complete = false; report.error = `${report.error || ''}\nGarment sources changed during capture; rerun the visual harness.`.trim(); process.exitCode = 1;
  }
  await writeFile(join(out, 'visual-report.json'), JSON.stringify(report, null, 2) + '\n');
}
