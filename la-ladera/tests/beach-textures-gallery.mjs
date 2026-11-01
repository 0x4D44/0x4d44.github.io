// Offline beach proof gallery. No game boot, mouse, pointer lock or audio.
// CHROME_PATH=/path/to/chrome node la-ladera/tests/beach-textures-gallery.mjs [--out la-ladera/dev/beach-textures]
import './nice.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { launch } from './chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2), at = argv.indexOf('--out');
const out = resolve(at < 0 ? resolve(ROOT, 'dev/beach-textures') : argv[at + 1]);
const manifestBytes = await readFile(resolve(ROOT, 'assets/textures/manifest.beach.json'));
const manifest = JSON.parse(manifestBytes);
const materialIds = Object.keys(manifest.textures).filter((id) => manifest.textures[id].uv !== 'unit' && !['water_ripple_n', 'foam_noise', 'caustic_tile'].includes(id));
const atlasIds = Object.keys(manifest.textures).filter((id) => manifest.textures[id].uv === 'unit');
const groups = [
  { file: 'eye-height-materials-1.png', title: 'LA LADERA / BEACH MATERIALS 01', ids: materialIds.slice(0, 7) },
  { file: 'eye-height-materials-2.png', title: 'LA LADERA / BEACH MATERIALS 02', ids: materialIds.slice(7) },
  { file: 'eye-height-atlases-1.png', title: 'LA LADERA / BEACH ATLAS PROOFS 01', ids: atlasIds.slice(0, 5) },
  { file: 'eye-height-atlases-2.png', title: 'LA LADERA / BEACH ATLAS PROOFS 02', ids: atlasIds.slice(5) },
  { file: 'eye-height-effects.png', title: 'LA LADERA / BEACH WATER EFFECTS', ids: ['water_ripple_n', 'foam_noise', 'caustic_tile'] },
];
assert.equal(new Set(groups.flatMap((g) => g.ids)).size, 25, 'Gallery covers every requested texture entry');
await mkdir(out, { recursive: true });
const browser = await launch({ width: 1000, height: 740, gpu: 'swiftshader' });
try {
  const page = await browser.open('la-ladera/dev/beach-textures/gallery.html', { ready: false });
  const startup = page.summary();
  assert.deepEqual(startup.errors, [], JSON.stringify(startup));
  assert.deepEqual(startup.netErrors, [], JSON.stringify(startup));
  assert.deepEqual(startup.consoleErrors, [], JSON.stringify(startup));
  await page.waitFor('!!window.__beachReview', 10000);
  const boot = await page.eval('window.__beachReview.ready');
  assert.equal(boot.threeRevision, '180');
  assert.equal(boot.cameraHeightM, 1.6); assert.ok(Math.abs(boot.figureHeightM - 1.8) < 1e-5); assert.ok(Math.abs(boot.figureBaseM) < 1e-5);
  const sheets = [], rows = [];
  for (const g of groups) {
    const result = await page.fn(async (ids, title) => window.__beachReview.sheet(ids, title), g.ids, g.title);
    const bytes = Buffer.from(result.image.split(',')[1], 'base64');
    assert.ok(bytes.length < 8 * 1024 * 1024, `${g.file}: proof PNG stays below the repository single-file cap`);
    await writeFile(resolve(out, g.file), bytes);
    sheets.push({ file: g.file, width: result.width, height: result.height, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), ids: g.ids });
    rows.push(...result.rows);
    console.log(`RENDERED ${g.file}: ${g.ids.length} entries, ${g.ids.length * 2} views, ${bytes.length} bytes`);
  }
  assert.equal(rows.length, 50);
  for (const row of rows) { assert.equal(row.cameraHeightM, 1.6); assert.ok(Math.abs(row.figureHeightM - 1.8) < 1e-5); assert.ok(Math.abs(row.figureBaseM) < 1e-5); }
  const diagnostics = page.summary();
  assert.deepEqual(diagnostics.errors, []); assert.deepEqual(diagnostics.consoleErrors, []); assert.deepEqual(diagnostics.netErrors, []);
  const report = { ok: true, node: process.version, renderer: await browser.renderer(), threeRevision: boot.threeRevision, cameraHeightM: 1.6, figureHeightM: 1.8, figureBaseM: 0, entries: 25, views: rows.length, manifestSha256: createHash('sha256').update(manifestBytes.toString('utf8').replace(/\r\n/g, '\n')).digest('hex'), manifestHashForm: 'UTF-8 LF', sheets, rows, diagnostics, limitations: ['Isolated texture review: no game integration, boot timing, world frame time or target hardware performance measured.', 'Atlas panels are enlarged proof displays; their panel dimensions are not suggested physical dimensions for atlas objects.', 'Generated PBR normals are derived surface detail, not measured photogrammetric geometry.'] };
  await mkdir(resolve(out, 'verification'), { recursive: true });
  await writeFile(resolve(out, 'verification/gallery.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ok: true, entries: report.entries, views: report.views, cameraHeightM: report.cameraHeightM, figureHeightM: report.figureHeightM, renderer: report.renderer, diagnostics }, null, 2));
} finally { await browser.close(); }
