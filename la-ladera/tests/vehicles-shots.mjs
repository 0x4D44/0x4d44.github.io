// Three distinct streets, matched fixed cameras, real loaded vehicle GLBs and actual render counts.
// node la-ladera/tools/nice.mjs node la-ladera/tests/vehicles-shots.mjs --out .scratch/vehicles/after
//   [--poses la-ladera/dev/vehicles/poses.json] [--root CHECKOUT] [--allow-fallback] [--query vehicles=0]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = (key, fallback) => { const at = args.indexOf('--' + key); return at < 0 ? fallback : args[at + 1]; };
const output = resolve(opt('out', '.scratch/vehicles/after'));
await mkdir(output, { recursive: true });
const report = { viewport: [1280, 720], renderer: null, views: [], failures: [],
  query: 'autostart&manual&hour=17.2&quality=high&audio=0' + (opt('query', '') ? '&' + opt('query', '') : '') };
const browser = await launch({ root: resolve(opt('root', REPO)), width: 1280, height: 720 });
try {
  const page = await browser.open('la-ladera/index.html?' + report.query, { timeout: 600000 });
  report.renderer = await browser.renderer();
  const file = opt('poses', null);
  const poses = file ? JSON.parse(await readFile(file, 'utf8')) : await page.fn(async () => {
    const { pointAt, project } = await import('./js/world/geom.js');
    const ctx = __ladera.ctx, out = [];
    const specs = [
      { id: 'calle-del-sol', street: 'S1', target: [45.69, 74.64], distance: 7.8 },
      { id: 'calle-del-comercio', street: 'S2', target: [3.32, 89.56], distance: 4.4 },
      { id: 'calle-de-los-almendros', street: 'S5', target: [4, 41.7], distance: 4.8 },
    ];
    for (const spec of specs) {
      const street = ctx.plan.streets.find((s) => s.id === spec.street);
      const recs = ctx.vehicleLibrary?.records ?? ctx.world.vehicleList;
      const nearby = recs.filter((r) => project(street._d.pts, street._d.cum, r.x, r.z).d < street.width / 2 + .4);
      nearby.sort((a, b) => Math.hypot(a.x - spec.target[0], a.z - spec.target[1]) - Math.hypot(b.x - spec.target[0], b.z - spec.target[1]));
      const target = nearby[0]; if (!target) throw new Error('No parked target on ' + spec.id);
      const at = project(street._d.pts, street._d.cum, target.x, target.z);
      let pose;
      for (const direction of [-1, 1]) {
        const p = pointAt(street._d.pts, street._d.cum, Math.max(3, Math.min(street.len - 3, at.s + direction * spec.distance)));
        const x = p.x + p.tz * at.side * street.width * .16, z = p.z - p.tx * at.side * street.width * .16;
        const y = ctx.plan.heightAt(x, z);
        if (ctx.physics._overlaps(x, z, y + .05, .24, 1.64)) continue;
        const targetY = ctx.plan.heightAt(target.x, target.z) + (spec.street === 'S1' ? 1.5 : .85);
        pose = { id: spec.id, street: street.id, streetName: street.name, x, y, z,
          yaw: Math.atan2(target.x === x ? 0 : x - target.x, z - target.z),
          pitch: Math.atan2(targetY - y - 1.64, Math.hypot(target.x - x, target.z - z)),
          target: { key: target.key ?? target.kind, x: target.x, z: target.z } };
        break;
      }
      if (!pose) throw new Error('No clear street camera for ' + spec.id);
      out.push(pose);
    }
    return out;
  });
  if (poses.length !== 3 || new Set(poses.map((p) => p.street)).size !== 3) throw new Error('Three different street cameras are required');
  await writeFile(resolve(output, 'poses.json'), JSON.stringify(poses, null, 2) + '\n');
  for (const pose of poses) {
    if (!/^[a-z0-9-]+$/.test(pose.id) || ![pose.x, pose.y, pose.z, pose.yaw, pose.pitch].every(Number.isFinite)) throw new Error('Invalid camera pose');
    const row = await page.fn((v) => {
      const L = __ladera, ctx = L.ctx;
      L.teleport(v.x, v.z, { y: v.y, yaw: v.yaw, pitch: v.pitch });
      L.step(1, 0); ctx.clutter?.update(true); ctx.vehicleLibrary?.update(true); L.render();
      const state = L.state(), vehicles = ctx.vehicleLibrary;
      let libraryTriangles = null, libraryCalls = null;
      if (vehicles) {
        vehicles.group.visible = false; L.render();
        const without = L.state();
        libraryTriangles = state.triangles - without.triangles; libraryCalls = state.drawCalls - without.drawCalls;
        vehicles.group.visible = true; L.render();
      }
      return { id: v.id, street: v.streetName, camera: ctx.camera.position.toArray(), triangles: state.triangles,
        drawCalls: state.drawCalls, libraryTriangles, libraryCalls, quality: state.quality,
        vehicles: vehicles ? { ...vehicles.stats } : null };
    }, pose);
    await page.canvasShot(resolve(output, pose.id + '.jpg'), { w: 1280, h: 720, q: .92 });
    row.image = pose.id + '.jpg'; report.views.push(row);
    if (row.triangles > 2500000) report.failures.push(pose.id + ': exceeds 2,500,000 triangles');
    if (row.drawCalls > 1800) report.failures.push(pose.id + ': exceeds 1,800 draw calls');
    console.log(JSON.stringify(row));
  }
  report.loaded = await page.eval('__ladera.ctx.world.vehicleLoad ?? null');
  report.placements = await page.eval('(__ladera.ctx.vehicleLibrary?.records ?? []).map(({key,x,y,z,yaw,pitch,footprint,street,paint,source})=>({key,x,y,z,yaw,pitch,footprint,street,paint,source}))');
  report.console = page.summary(); report.buildErrors = await page.eval('__ladera.errors()');
  report.captureWarnings = report.console.consoleWarnings.filter((s) => /GL Driver Message.*GPU stall due to ReadPixels/.test(s));
  const appWarnings = report.console.consoleWarnings.filter((s) => !report.captureWarnings.includes(s));
  if (report.console.errors.length || report.console.consoleErrors.length || report.console.netErrors.length || report.buildErrors.length || appWarnings.length) report.failures.push('Application or network diagnostics are not clean');
  if (!args.includes('--allow-fallback') && (report.loaded?.assets !== 10 || new Set(report.placements.map((p) => p.key)).size !== 10 || report.loaded.failed.length)) report.failures.push('Complete vehicle library is not actually integrated');
} catch (error) {
  report.failures.push(String(error.stack ?? error));
} finally { await browser.close(); }
await writeFile(resolve(output, 'views.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ renderer: report.renderer, views: report.views.length, failures: report.failures }, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
