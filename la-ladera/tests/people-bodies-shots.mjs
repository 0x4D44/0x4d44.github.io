#!/usr/bin/env node
// Reproducible body-review contact sheets, always headless / muted / low priority.
// Before (copy all six source assets before a rebuild):
//   LADERA_PRIO=idle CHROME_PATH=/path/to/chrome node la-ladera/tests/people-bodies-shots.mjs \
//     --base ../dev/people-bodies-v2/.work/before-assets/ --label before --out la-ladera/dev/people-bodies-v2/before
// After:
//   LADERA_PRIO=idle CHROME_PATH=/path/to/chrome node la-ladera/tests/people-bodies-shots.mjs \
//     --label after --out la-ladera/dev/people-bodies-v2/after
// Full-body framing is fixed: 1.600 m horizontal camera-to-root distance,
// 1.000 m camera height, aim point [0,0.900,0], 74° vertical FOV. This is
// deliberately documented as distance, not as a 1.6 m eye height. Head/neck
// supplement retains 1.6 m distance with a labelled 21° detail lens.
// Torso/hand supplement uses a 36° lens, with camera/target height fixed at
// 1.23 * hipHeightM from the preserved rig metadata; head/feet are cropped.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2);
const option = (name, fallback) => { const i = argv.indexOf('--' + name); if (i < 0) return fallback; if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for --${name}`); return argv[i + 1]; };
const label = option('label', 'after'), out = resolve(option('out', `la-ladera/dev/people-bodies-v2/${label}`));
const assetBase = option('base') ? new URL(option('base'), new URL('./people-bodies-gallery.html', import.meta.url)) : new URL('../assets/models/people/', import.meta.url);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const check = (ok, message) => { if (!ok) throw new Error(message); };
function jpegDimensions(bytes) {
  let p = 2;
  while (p < bytes.length) {
    if (bytes[p] !== 0xff) { p++; continue; }
    const marker = bytes[p + 1];
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return [bytes.readUInt16BE(p + 7), bytes.readUInt16BE(p + 5)];
    p += 2 + bytes.readUInt16BE(p + 2);
  }
  throw new Error('Cannot read JPEG dimensions');
}
async function assetHashes() {
  const names = new Set(['people.glb', 'people_lod.glb', 'people_meta.json']), rows = {};
  for (const name of ['people.glb', 'people_lod.glb']) {
    const bytes = await readFile(new URL(name, assetBase));
    check(bytes.readUInt32LE(0) === 0x46546c67 && bytes.readUInt32LE(8) === bytes.length, `${name}: invalid GLB`);
    const g = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    for (const image of g.images ?? []) if (image.uri && !image.uri.startsWith('data:')) names.add(image.uri);
  }
  for (const name of [...names].sort()) {
    const bytes = await readFile(new URL(name, assetBase));
    rows[name] = { bytes: bytes.length, sha256: hash(bytes) };
    if (/\.jpe?g$/i.test(name)) { const [width, height] = jpegDimensions(bytes); Object.assign(rows[name], { width, height, estimatedGpuBytesWithMipmaps: width * height * 4 * 4 / 3 }); }
  }
  return rows;
}

await mkdir(out, { recursive: true });
const report = { label, checkedAt: new Date().toISOString(), cameraDefinition: 'Horizontal camera-to-character-root distance is 1.600 m. Full-body camera height 1.000 m, aim [0,0.900,0], vertical FOV 74 degrees. Identical framing, lighting, metre scale and animation phase before/after; no automatic fitting.', assetHashes: await assetHashes(), renderer: null, assets: null, sheets: [], failures: [] };
let browser;
try {
  browser = await launch({ width: 1920, height: 1660, gpu: option('gpu', 'swiftshader'), minFreeGB: 2 });
  report.renderer = await browser.renderer();
  const params = new URLSearchParams({ label }); if (option('base')) params.set('base', option('base'));
  const page = await browser.open(`la-ladera/tests/people-bodies-gallery.html?${params}`, { ready: false });
  await page.waitFor('!!window.__bodiesReview?.ready'); report.assets = await page.eval('__bodiesReview.ready');
  check(report.assets.quiet, 'Quiet input/audio hooks are absent');
  const shots = [
    ['near-front.png', {}],
    ['near-threequarter.png', { yaw: 28 }],
    ['near-back.png', { yaw: 180 }],
    ['near-walk.png', { clip: 'walk', phase: 0.19 }],
    ['far-front.png', { lod: 1 }],
    ['torso-hands.png', { torso: true, yaw: 8 }],
    ['head-neck.png', { portrait: true, yaw: 12 }],
  ];
  for (const [name, options] of shots) {
    const sheet = await page.eval(`__bodiesReview.render(${JSON.stringify(options)})`, 180000);
    check(sheet.rows.length === 8 && sheet.rows.every(p => Math.abs(p.camera.horizontalDistanceM - 1.6) < 1e-10), `${name}: camera distance or resident count changed`);
    // WebGL readback is synchronous; DOM labels still need a compositor frame.
    // Wait for their paint so the first screenshot is as complete as later ones.
    await page.eval('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    await page.pageShot(resolve(out, name));
    const bytes = await readFile(resolve(out, name));
    report.sheets.push({ path: name, bytes: bytes.length, sha256: hash(bytes), ...sheet });
    console.log(`${label} ${name}: 8 residents, 1.600 m, ${sheet.portrait || sheet.torso ? 'labelled detail crop' : '0 clipped vertices; nonblank silhouettes'}`);
  }
  report.diagnostics = structuredClone(page.summary());
  report.readbackWarnings = report.diagnostics.consoleWarnings.filter(s => /GL Driver Message .*GPU stall due to ReadPixels/.test(s));
  const warnings = report.diagnostics.consoleWarnings.filter(s => !report.readbackWarnings.includes(s));
  check(!report.diagnostics.errors.length && !report.diagnostics.netErrors.length && !report.diagnostics.consoleErrors.length && !warnings.length, 'Page, network, shader, material or animation diagnostics were emitted');
  check(JSON.stringify(await assetHashes()) === JSON.stringify(report.assetHashes), 'Assets changed during capture; rerun on one complete build');
} catch (e) { report.failures.push(String(e?.stack ?? e)); }
finally { if (browser) await browser.close(); }
report.ok = !report.failures.length;
await writeFile(resolve(out, 'body-shots.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, label, renderer: report.renderer, residents: report.assets?.ids, clips: report.assets?.clipNames.length, sheets: report.sheets.map(s => s.path), failures: report.failures }, null, 2));
process.exitCode = report.ok ? 0 : 1;
