#!/usr/bin/env node
// Exact exported garment contact sheets, using the real runtime API. Headless, muted,
// low priority through chrome.mjs. No visible browser or autonomous render loop.
// CHROME_PATH=... node la-ladera/tests/people-wear-shots.mjs --out la-ladera/dev/wear
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {launch} from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : fallback; };
const out = resolve(option('out', 'la-ladera/dev/wear'));
await mkdir(out, {recursive:true});
const manifestURL = new URL('../assets/models/manifest.people-wear.json', import.meta.url);
async function hashes() {
  const manifestBytes = await readFile(manifestURL), manifest = JSON.parse(manifestBytes);
  const paths = new Set(['manifest.people-wear.json','people/people.glb','people/people_lod.glb','people/people_meta.json']);
  for (const file of manifest.files) paths.add(file.path ?? file.file ?? file.url);
  const result = {};
  for (const path of [...paths].sort()) {
    const bytes = await readFile(new URL(path, manifestURL));
    result[path] = {bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  }
  return result;
}
const report = {checkedAt:new Date().toISOString(),assetHashes:await hashes(),renderer:null,runtime:null,sheets:[],failures:[]};
const browser = await launch({width:2160,height:2926,gpu:option('gpu','swiftshader')});
try {
  report.renderer = await browser.renderer();
  const page = await browser.open('la-ladera/tests/people-wear-gallery.html', {ready:false});
  await page.waitFor('!!window.__wearCheck?.ready'); await page.eval('__wearCheck.ready');
  report.runtime = await page.eval('__wearCheck.validateRuntime()',240000);
  report.gpuSharing = await page.eval('__wearCheck.validateGpuSharing()',240000);
  for (const spec of [{name:'contact-near',lod:0,clip:'idle_a',phase:0.27},{name:'contact-far',lod:1,clip:'idle_a',phase:0.27},{name:'contact-walk',lod:0,clip:'walk',phase:0.19},{name:'contact-seated',lod:0,clip:'sit_idle',phase:0.25}]) {
    const sheet = await page.eval(`__wearCheck.render(${JSON.stringify(spec)})`,240000);
    await page.viewport(sheet.width,sheet.height);
    // Resizing a WebGL drawing buffer clears it on some drivers; render once after
    // the viewport settles so captured pixels always belong to this exact request.
    await page.eval(`__wearCheck.render(${JSON.stringify(spec)})`,240000);
    const file = spec.name + '.jpg'; await page.pageShot(resolve(out,file));
    report.sheets.push({...sheet,file});
  }
  report.disposal = await page.eval('__wearCheck.validateDisposal()',240000);
  report.diagnostics = structuredClone(page.summary());
  const diagnostics = report.diagnostics;
  if (diagnostics.errors.length || diagnostics.netErrors.length || diagnostics.consoleErrors.length || diagnostics.consoleWarnings.some(text => !/GL Driver Message .*ReadPixels/.test(text))) throw new Error('wardrobe gallery produced browser diagnostics: '+JSON.stringify(diagnostics));
  if (JSON.stringify(await hashes()) !== JSON.stringify(report.assetHashes)) throw new Error('assets changed during contact-sheet verification');
} catch (error) { report.failures.push(String(error?.stack ?? error)); }
finally { await browser.close(); }
report.ok = report.failures.length === 0;
await writeFile(resolve(out,'people-wear-shots.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({ok:report.ok,renderer:report.renderer,runtime:report.runtime,gpuSharing:report.gpuSharing,disposal:report.disposal,sheets:report.sheets.map(sheet=>sheet.file),failures:report.failures},null,2));
process.exitCode = report.ok ? 0 : 1;
