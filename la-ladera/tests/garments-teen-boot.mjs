// The real page in headless Chrome, as shipped and with the teen GLB refused: which garment files the clothes load asked for and which keys it loaded. A browser check, not a unit test:
// the Node suite (tests/interiors-garments*.test.mjs) holds the same facts without a browser. Chrome is always headless through chrome.mjs.
//   CHROME_PATH=/path/to/chrome node la-ladera/tests/garments-teen-boot.mjs [--json la-ladera/dev/garments/teen-evidence/browser-boot.json]
import './nice.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { launch } from './chrome.mjs';
import { GARMENTS, STATES } from '../js/interiors/garments_data.js';

const args = process.argv.slice(2), at = args.indexOf('--json');
const jsonPath = at < 0 ? null : resolve(args[at + 1]);
const keysOf = (tag) => Object.values(GARMENTS).filter((g) => g.sizeTag === tag).reduce((n, g) => n + STATES.filter((s) => g[s]).length, 0);
const expected = { teen: keysOf('teen'), child: keysOf('child'), adult: keysOf('adult') };
const TEEN = '/la-ladera/assets/models/garments/garments_teen.glb';

async function boot(label, blocked) {
  const browser = await launch({ width: 800, height: 450 });
  try {
    const page = browser.page;
    if (blocked) await page.send('Network.setBlockedURLs', { urls: blocked });
    const started = Date.now();
    await page.goto(browser.baseUrl + '/la-ladera/index.html?autostart&manual&dpr=1');
    const state = await page.eval('__ladera.state()');
    await page.waitFor('!!(window.__ladera.ctx && window.__ladera.ctx.garmentGlb && window.__ladera.ctx.garmentGlb.size > 0)', 120000);
    const loaded = await page.eval(`(() => { const g = __ladera.ctx.garmentGlb, keys = [...g]; return {
      keys: g.size, teen: keys.filter((k) => /_(small|big)_(flat|folded|hung)$/.test(k)).length, child: keys.filter((k) => k.startsWith('garment_child_')).length,
      adult: keys.filter((k) => !/_(small|big)_(flat|folded|hung)$/.test(k) && !k.startsWith('garment_child_')).length, furnitureKeys: __ladera.ctx.interiorGlb ? __ladera.ctx.interiorGlb.size : null, ctxErrors: (__ladera.ctx.errors || []).length }; })()`);
    const summary = page.summary();
    return { label, seconds: +((Date.now() - started) / 1000).toFixed(1), stateErrors: state.errors, drawCalls: state.drawCalls, triangles: state.triangles, loaded,
      garmentRequests: [...page.reqs.values()].filter((u) => /\/assets\/models\/(garments|manifest\.garments)/.test(u)).map((u) => u.replace(browser.baseUrl, '')).sort(),
      pageErrors: summary.errors, consoleErrors: summary.consoleErrors, networkErrors: summary.netErrors.map((e) => e.replace(/http:\/\/127\.0\.0\.1:\d+/, '')) };
  } finally { await browser.close(); }
}

const failures = [], runs = [];
try {
  const shipped = await boot('as shipped', null), refused = await boot('teen GLB refused', ['*garments_teen.glb']);
  runs.push(shipped, refused);
  const must = (ok, message) => { if (!ok) failures.push(message); };
  for (const r of runs) {
    must(r.stateErrors === 0 && r.loaded.ctxErrors === 0 && !r.pageErrors.length && !r.consoleErrors.length, `${r.label}: the page reported errors`);
    must(r.drawCalls > 0 && r.triangles > 0, `${r.label}: no rendered frame`);
    must(r.garmentRequests.length === 7 && r.garmentRequests.filter((u) => u === TEEN).length === 1, `${r.label}: the clothes load asked for ${r.garmentRequests.length} garment files (expected the six adult/child LODs and the one teen GLB)`);
    must(!r.garmentRequests.some((u) => /manifest\.garments|\/teen\//.test(u)), `${r.label}: a teen manifest, palette or atlas was fetched`);
    must(r.loaded.child === expected.child && r.loaded.adult === expected.adult, `${r.label}: adult ${r.loaded.adult} / child ${r.loaded.child} keys, expected ${expected.adult} / ${expected.child}`);
  }
  must(shipped.loaded.teen === expected.teen && shipped.loaded.keys === expected.teen + expected.child + expected.adult && !shipped.networkErrors.length, `as shipped: ${shipped.loaded.teen} teen keys of ${expected.teen}, network errors ${shipped.networkErrors}`);
  must(refused.loaded.teen === 0 && refused.networkErrors.length === 1 && refused.networkErrors[0].endsWith(TEEN), `teen GLB refused: ${refused.loaded.teen} teen keys, network errors ${refused.networkErrors}`);
  must(shipped.drawCalls === refused.drawCalls && shipped.triangles === refused.triangles, 'the first frame differs with and without the teen GLB (nothing places a teen garment yet)');
} catch (e) { failures.push(e.stack || String(e)); }
const report = { expected, runs, failures, passed: failures.length === 0 };
if (jsonPath) { await mkdir(dirname(jsonPath), { recursive: true }); await writeFile(jsonPath, JSON.stringify(report, null, 2) + '\n'); }
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.passed ? 0 : 1;
