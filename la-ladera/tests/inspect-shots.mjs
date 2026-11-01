#!/usr/bin/env node
// Capture every generated inspect object (front, reverse, and LOD) in one quiet
// browser. Reference studio lighting only: the drawer renderer is absent from
// the source baseline. Actual game inspect lighting is not verified here.
//
// CHROME_PATH=/path/to/chrome node --import ./la-ladera/tests/register.mjs \
//   la-ladera/tests/inspect-shots.mjs [--out .scratch/inspect-shots] [--size 720] \
//   [--gpu swiftshader] [--only inspect_gold_coin,inspect_pocket_watch]
import './nice.mjs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  if (args[i + 1] == null || args[i + 1].startsWith('--')) throw new Error(`--${name} requires a value`);
  return args[i + 1];
};
const out = resolve(REPO, option('out', '.scratch/inspect-shots'));
const size = Number(option('size', 720));
if (!Number.isInteger(size) || size < 256 || size > 1600) throw new Error('--size must be an integer from 256 to 1600');
const only = option('only', '').split(',').filter(Boolean);
const base = resolve(REPO, 'la-ladera');
const manifestPath = resolve(base, 'assets/models/manifest.inspect.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const sourcePaths = new Set([
  'assets/models/manifest.inspect.json', 'js/interiors/inspect-bindings.json',
  'assets/textures/manifest.json', 'assets/textures/inspect_paper_atlas.json',
  'labs/inspect/index.html', 'labs/inspect/viewer.js', 'js/interiors/matdefs.js',
  'js/core/assets.js', 'js/core/matlib.js', 'tests/inspect-shots.mjs',
  manifest.atlas?.path ?? 'assets/textures/inspect_paper_atlas.png',
  ...manifest.files.map((file) => `assets/models/${file.glb}`),
]);
const hashes = {};
for (const path of [...sourcePaths].sort()) {
  const bytes = await readFile(resolve(base, path));
  hashes[path] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await mkdir(out, { recursive: true });
const report = {
  version: 1, sourceRevision: manifest.sourceRevision ?? null,
  integrationStatus: manifest.integrationStatus ?? 'unknown',
  actualGameInspectLightingVerified: false,
  scope: 'Generated library in reference inspect studio; no game integration claim.',
  size: { width: size, height: size },
  sourceHashes: hashes, renderer: null, lighting: null, objects: [], shots: [],
};

let browser;
let exitCode = 0;
try {
  browser = await launch({ width: size, height: size, gpu: option('gpu', 'swiftshader') });
  const page = await browser.open('la-ladera/labs/inspect/index.html?capture=1', { ready: false });
  await page.waitFor('window.__inspectReady === true || !!window.__inspectError');
  const bootError = await page.eval('window.__inspectError || null');
  if (bootError) throw new Error(bootError);
  report.renderer = await browser.renderer();
  report.lighting = await page.eval('window.__inspect.lighting');
  const all = await page.eval('window.__inspect.list()');
  for (const key of only) assert.ok(all.some((entry) => entry.key === key), `unknown --only object: ${key}`);
  const objects = only.length ? all.filter((entry) => only.includes(entry.key)) : all;
  assert.ok(objects.length, 'no inspect objects to capture');
  report.objects = objects.map(({ key, label, triangles, lod }) => ({ key, label, triangles, lod }));
  for (const object of objects) {
    for (const variant of [{ view: 'front', lod: false }, { view: 'back', lod: false }, { view: 'front', lod: true }]) {
      const state = await page.fn(async (key, options) => window.__inspect.show(key, options), object.key, variant);
      assert.ok(state && state.triangles > 0 && state.drawCalls > 0, `${object.key}: no visible geometry`);
      assert.equal(state.triangles, state.meshTriangles, `${object.key}: hierarchy or camera dropped mesh primitives`);
      assert.ok(state.triangles <= 3000, `${object.key}: over 3000 rendered triangles`);
      if (!variant.lod && Number.isInteger(object.triangles)) assert.equal(state.meshTriangles, object.triangles, `${object.key}: manifest triangle count mismatch`);
      const filename = `${object.key}-${variant.lod ? 'lod' : variant.view}.png`;
      const destination = resolve(out, filename);
      await page.pageShot(destination);
      const image = await readFile(destination);
      report.shots.push({ file: filename, ...state, bytes: image.length, sha256: createHash('sha256').update(image).digest('hex') });
    }
    console.log(`${object.key}: front, back, LOD captured`);
  }
  Object.assign(report, page.summary());
  assert.deepEqual(report.errors, [], 'page exceptions');
  assert.deepEqual(report.consoleErrors, [], 'browser console errors');
  assert.deepEqual(report.netErrors, [], 'failed asset requests');
  assert.deepEqual(report.consoleWarnings, [], 'browser console warnings');
  // Model, atlas or source edits during a multi-minute run would otherwise
  // leave a report whose hashes describe a mixture of different revisions.
  report.changedSourcesDuringCapture = [];
  for (const [path, expected] of Object.entries(hashes)) {
    const bytes = await readFile(resolve(base, path));
    if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) report.changedSourcesDuringCapture.push(path);
  }
  assert.deepEqual(report.changedSourcesDuringCapture, [], 'source files changed during capture; rerun for consistent evidence');
} catch (error) {
  exitCode = 1;
  report.fatal = String(error.stack ?? error);
  if (browser) Object.assign(report, browser.page.summary());
} finally {
  if (browser) await browser.close();
}
report.complete = exitCode === 0 && only.length === 0;
report.success = exitCode === 0;
await writeFile(resolve(out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ success: report.success, complete: report.complete,
  objects: report.objects.length, shots: report.shots.length,
  report: relative(REPO, resolve(out, 'report.json')), fatal: report.fatal ?? null }, null, 2));
process.exitCode = exitCode;
