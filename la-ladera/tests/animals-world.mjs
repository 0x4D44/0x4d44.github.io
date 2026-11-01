// Quiet integration capture of the real world with the optional animal bank.
// This proves loading/placement; use metrics.mjs for the default rendering budget.
// node la-ladera/tests/animals-world.mjs
import { launch } from './chrome.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'dev/evidence/animals');
const manifestBytes = await readFile(resolve(root, 'assets/models/manifest.animals.json'));
const manifest = JSON.parse(manifestBytes);
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const query = 'autostart&manual&shadows=0&post=0&dpr=1';
const report = { manifestSHA256: sha256(manifestBytes), size: [960, 540], query,
  purpose: 'Real-world animal integration capture; not a default-quality performance result.',
  failures: [] };
await mkdir(out, { recursive: true });
const browser = await launch({ width: 960, height: 540, gpu: 'swiftshader' });
try {
  report.renderer = await browser.renderer();
  const page = await browser.open('la-ladera/index.html?' + query, { ready: false });
  await page.waitFor('!!window.__ladera?.bootDone', 150000, 500);
  report.state = await page.eval('({ boot: __ladera.bootDone, timings: __ladera.ctx.timings, errors: __ladera.ctx.errors, people: __ladera.ctx.people.list().length })');
  report.render = await page.eval('(__ladera.step(2), __ladera.render(), __ladera.state())');
  report.animals = await page.eval('__ladera.ctx.animals?.list() ?? []');
  report.stats = await page.eval('__ladera.ctx.animals?.stats() ?? null');
  await page.canvasShot(resolve(out, 'world-spawn.jpg'), { w: 960 });
  report.screenshot = { file: 'world-spawn.jpg', sha256: sha256(await readFile(resolve(out, 'world-spawn.jpg'))) };
  report.page = page.summary();
  if (!report.state.boot || !report.stats?.count) report.failures.push('Animal integration did not load.');
  if (!Object.keys(manifest.animals).every((key) => report.animals.some((a) => a.species === key))) report.failures.push('A species is absent from the world.');
  if (report.stats?.near > 6 || report.stats?.triangles > report.stats?.triangleCeiling) report.failures.push('Animal LOD budget exceeded.');
  if (report.animals.some((a) => ![a.x, a.y, a.z].every(Number.isFinite))) report.failures.push('An animal has a non-finite position.');
  if (report.state.people < 60) report.failures.push('Existing people did not load.');
  const p = report.page;
  if (p.errors.length || p.consoleErrors.length || p.consoleWarnings.length || p.netErrors.length) report.failures.push('Browser diagnostics are not clean.');
} catch (error) {
  report.failures.push(String(error.stack ?? error));
} finally {
  await browser.close();
}
report.ok = report.failures.length === 0;
await writeFile(resolve(out, 'world-probe.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, manifestSHA256: report.manifestSHA256, stats: report.stats, people: report.state?.people, failures: report.failures }, null, 2));
process.exitCode = report.ok ? 0 : 1;
