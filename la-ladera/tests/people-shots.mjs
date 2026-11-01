#!/usr/bin/env node
// Headless-only GLB contact sheets + runtime compatibility checks (no npm / build step).
//   node la-ladera/tools/nice.mjs node la-ladera/tests/people-shots.mjs --out .scratch/people-review
//   ... --base ../../.scratch/people-before/ --baseline --skip-boot   # explicitly labelled pre-change evidence
// CHROME_PATH may select Chrome/Chromium; chrome.mjs always runs headless, muted and at low priority.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2), option = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv[i + 1]; };
const out = resolve(option('out', '.scratch/people-review'));
await mkdir(out, { recursive: true });
const report = { baseline: argv.includes('--baseline'), checkedAt: new Date().toISOString(), renderer: null, assets: null, sheets: [], boot: [], failures: [] };
// Bind the saved screenshots/report to the exact binaries, metadata and any external atlas images that the page will load.
const assetBase = option('base') ? new URL(option('base'), new URL('./people-gallery.html', import.meta.url)) : new URL('../assets/models/people/', import.meta.url);
async function assetHashes() {
  const names = new Set(['people.glb', 'people_lod.glb', 'people_meta.json']), result = {};
  for (const name of ['people.glb', 'people_lod.glb']) {
    const bytes = await readFile(new URL(name, assetBase)), gltf = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)));
    for (const image of gltf.images ?? []) if (image.uri && !image.uri.startsWith('data:')) names.add(image.uri);
  }
  for (const name of [...names].sort()) {
    const bytes = await readFile(new URL(name, assetBase));
    result[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return result;
}
report.assetHashes = await assetHashes();
const b = await launch({ width: 1920, height: 1696, gpu: option('gpu', 'auto') });
const check = (ok, message) => { if (!ok) throw new Error(message); };

async function bootCase(missing = null) {
  const p = b.page;
  await p.viewport(1280, 720); // boot/fallback correctness; the separate metrics gate retains its 1920 x 1080 benchmark viewport
  await p.send('Network.setBlockedURLs', { urls: missing ? ['*' + missing] : [] });
  await b.open('la-ladera/index.html?autostart&manual');
  const value = await p.eval(`(() => {
    __ladera.step(3); __ladera.render(); const s = __ladera.state();
    return { state: s, errors: __ladera.ctx.errors, people: __ladera.npcs().length,
      fatalHidden: document.getElementById('fatal')?.classList.contains('hidden'),
      active: __ladera.ctx.stage === 'start', quiet: !!window.__quiet };
  })()`);
  // chrome.mjs reuses and clears its diagnostic arrays on navigation. Persist a per-case value, not references to later cases.
  const summary = structuredClone(p.summary());
  check(value.quiet, 'quiet-box page hooks were not installed');
  check(value.fatalHidden && value.active, `${missing ?? 'normal'}: the game did not finish booting`);
  check(value.state.pos.every(Number.isFinite) && value.state.triangles > 0, `${missing ?? 'normal'}: game frame is invalid`);
  if (missing === 'people.glb') {
    // origin/main has no runtime procedural-figure fallback. Its isolated people stage fails, while the world remains explorable.
    // Record that fact rather than claiming a nonexistent NPC fallback passed. The old Blender generator remains an offline fallback.
    check(value.errors.length === 1 && value.errors[0].stage === 'people', 'missing near GLB should report only the isolated people-stage failure');
    check(value.people === 0, 'missing near GLB unexpectedly created NPCs; update this baseline-specific expectation if a runtime fallback is introduced');
    check(!summary.errors.length, 'missing near GLB caused an unhandled page exception');
  } else {
    check(value.errors.length === 0 && summary.errors.length === 0, `${missing ?? 'normal'}: unexpected game error`);
    check(value.people >= 60, `${missing ?? 'normal'}: expected populated barrio, found ${value.people} NPCs`);
  }
  if (!missing) check(!summary.netErrors.length && !summary.consoleErrors.length && !summary.consoleWarnings.length, 'normal boot produced network/console diagnostics');
  else {
    check(summary.netErrors.length > 0 && summary.netErrors.every(s => s.includes(missing)), `${missing}: the requested failure was not isolated to that GLB`);
    check(summary.consoleErrors.every(s => s.includes(missing) || (missing === 'people.glb' && s.includes('[stage people]'))), `${missing}: unrelated console error`);
    check(summary.consoleWarnings.every(s => missing === 'people_lod.glb' && s.includes('[people] LOD file not loaded:')), `${missing}: unrelated console warning`);
  }
  const row = { missing, ...value, diagnostics: summary };
  await p.pageShot(resolve(out, missing ? `boot-missing-${missing}.png` : 'boot.png'));
  report.boot.push(row);
}

try {
  report.renderer = await b.renderer();
  const params = new URLSearchParams();
  if (option('base')) params.set('base', option('base'));
  if (report.baseline) params.set('baseline', '1');
  const p = await b.open(`la-ladera/tests/people-gallery.html?${params}`, { ready: false });
  await p.waitFor('!!window.__peopleCheck?.ready');
  await p.eval('__peopleCheck.ready');
  report.assets = await p.eval('__peopleCheck.validate()', 240000);
  for (const lod of [0, 1]) {
    const sheet = await p.eval(`__peopleCheck.render(${lod})`);
    sheet.pixels = await p.eval('__peopleCheck.pixels()');
    sheet.path = `people-${lod ? 'far' : 'near'}.png`;
    await p.pageShot(resolve(out, sheet.path)); report.sheets.push(sheet);
  }
  // Posed near sheets make obvious deformation / clipping mistakes reviewable, in addition to the numeric sweep of all clips above.
  for (const clip of ['walk', 'sit_idle']) {
    await p.eval(`__peopleCheck.render(0, ${JSON.stringify(clip)}, 0.19)`);
    await p.pageShot(resolve(out, `people-${clip}.png`));
  }
  await p.eval('__peopleCheck.render(0, "idle_a", 0.27, true)');
  await p.pageShot(resolve(out, 'people-portraits.png'));
  const summary = structuredClone(p.summary()); report.galleryDiagnostics = summary;
  // Pixel readback is intentional in this test. SwiftShader warns about that synchronous operation, not about the assets or their shader.
  report.readbackWarnings = summary.consoleWarnings.filter(s => /GL Driver Message .*GPU stall due to ReadPixels/.test(s));
  const unexpectedWarnings = summary.consoleWarnings.filter(s => !report.readbackWarnings.includes(s));
  check(!summary.errors.length && !summary.consoleErrors.length && !unexpectedWarnings.length && !summary.netErrors.length,
    'gallery produced page, animation binding, shader, material, or network diagnostics');
  if (!argv.includes('--skip-boot')) {
    await bootCase();
    await bootCase('people_lod.glb');
    await bootCase('people.glb');
    await b.page.send('Network.setBlockedURLs', { urls: [] });
  }
  check(JSON.stringify(await assetHashes()) === JSON.stringify(report.assetHashes), 'Asset files changed during verification; rerun on one complete build');
} catch (e) { report.failures.push(String(e?.stack ?? e)); }
finally { await b.close(); }
report.ok = report.failures.length === 0;
await writeFile(resolve(out, 'people-shots.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, baseline: report.baseline, renderer: report.renderer, ids: report.assets?.ids.length,
  clips: report.assets?.clips.length, posedVertexChecks: report.assets?.posedVertexChecks, sheets: report.sheets.map(s => s.path),
  boot: report.boot.map(b => ({ missing: b.missing, people: b.people, active: b.active, errors: b.errors })), failures: report.failures }, null, 2));
process.exitCode = report.ok ? 0 : 1;
