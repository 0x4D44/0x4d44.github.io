// Matched clutter review views. Quiet, headless-only, using the same fixed cameras and high quality in both checkouts.
// node la-ladera/tools/nice.mjs node la-ladera/tests/clutter-shots.mjs --poses la-ladera/dev/clutter-review/poses.json
//      --root <repository-or-baseline-root> --out <directory> [--query clutter=0]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = (key, fallback) => { const at = args.indexOf('--' + key); return at < 0 ? fallback : args[at + 1]; };
const out = resolve(opt('out', 'la-ladera/dev/clutter-review/after'));
const poses = JSON.parse(await readFile(opt('poses', 'la-ladera/dev/clutter-review/poses.json'), 'utf8'));
if (!Array.isArray(poses) || poses.length < 3 || poses.some((v) => !/^[a-z0-9-]+$/.test(v.id)
  || ![v.x, v.y, v.z, v.yaw, v.pitch].every(Number.isFinite))) throw new Error('Expected at least three finite named camera poses');
await mkdir(out, { recursive: true });
const browser = await launch({ root: resolve(opt('root', REPO)), width: 1280, height: 720 });
const report = { viewport: [1280, 720], query: 'autostart&manual&hour=17.2&quality=high&audio=0', renderer: null, views: [], failures: [] };
const query = opt('query', '');
if (query) report.query += '&' + query;
try {
  const page = await browser.open('la-ladera/index.html?' + report.query);
  report.renderer = await browser.renderer();
  for (const pose of poses) {
    const state = await page.fn((v) => {
      const L = window.__ladera;
      L.teleport(v.x, v.z, { y: v.y, yaw: v.yaw, pitch: v.pitch });
      L.step(1, 0); // refresh camera/visibility without gravity, time, or NPC motion
      L.ctx.clutter?.update(true);
      L.render();
      return { state: L.state(), clutter: L.ctx.world?.clutter ?? null, camera: L.ctx.camera.position.toArray() };
    }, pose);
    await page.canvasShot(resolve(out, pose.id + '.jpg'), { w: 1280, h: 720, q: 0.91 });
    const row = { id: pose.id, pose, camera: state.camera, triangles: state.state.triangles, drawCalls: state.state.drawCalls,
      quality: state.state.quality, clutter: state.clutter, image: pose.id + '.jpg' };
    if (row.triangles > 2500000) report.failures.push(pose.id + ': triangle budget exceeded');
    if (row.drawCalls > 1800) report.failures.push(pose.id + ': draw-call budget exceeded');
    report.views.push(row);
    console.log(JSON.stringify(row));
  }
  report.console = page.summary();
  report.buildErrors = await page.eval('__ladera.errors()');
  report.loadedClutter = await page.eval('__ladera.ctx.world?.clutterLoad ?? null');
  // SwiftShader reports the deliberate canvas readback as a GPU stall. Preserve it as capture evidence; it is not an
  // application console warning. Every other warning, exception, failed request and build diagnostic still fails.
  report.captureWarnings = report.console.consoleWarnings.filter((m) => /GL Driver Message.*GPU stall due to ReadPixels/.test(m));
  const appWarnings = report.console.consoleWarnings.filter((m) => !report.captureWarnings.includes(m));
  if (report.console.errors.length || report.console.consoleErrors.length || appWarnings.length
    || report.console.netErrors.length || report.buildErrors.length) report.failures.push('Browser or build diagnostics are not clean');
} catch (error) {
  report.failures.push(String(error.stack ?? error));
} finally {
  await browser.close();
}
await writeFile(resolve(out, 'views.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ renderer: report.renderer, views: report.views.length, failures: report.failures }, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
