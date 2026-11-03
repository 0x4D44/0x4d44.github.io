// Matched, frozen street/courtyard/vista evidence; always uses the existing quiet headless driver.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2), opt = (name, d) => { const i = args.indexOf('--' + name); return i < 0 ? d : args[i + 1]; };
const out = resolve(opt('out', '.scratch/vegetation/views')), width = +opt('w', 1280), height = +opt('h', 720);
await mkdir(out, { recursive: true });
const query = 'autostart&manual&hour=17.2&timescale=0&quality=high&dpr=1' + (args.includes('--fallback') ? '&vegetation=procedural' : '');
const report = { viewport: [width, height], query, renderer: null, views: [] };
const b = await launch({ width, height, root: opt('root') ? resolve(opt('root')) : undefined });
try {
  report.renderer = await b.renderer();
  const p = await b.open('la-ladera/index.html?' + query);
  const poses = await p.eval(`(() => {
    const plazas = __ladera.ctx.plan.plazas, court = plazas.find(p => p.id === 'P2'), vista = plazas.find(p => p.id === 'P5');
    return [
      { id: 'main-street', x: 30, z: 70.1, yaw: 1.33, pitch: 0.05 },
      { id: 'courtyard', x: court.cx - 7.5, z: court.cz + 4.3, yaw: -0.8, pitch: 0.08, label: 'Public courtyard, Plazoleta de los Almendros' },
      { id: 'vista', x: vista.cx, z: vista.cz + 1.3, yaw: Math.PI, pitch: -0.13 }
    ];
  })()`);
  const only = opt('only')?.split(',');
  for (const pose of poses.filter(v => !only || only.includes(v.id))) {
    await p.fn(v => { __ladera.teleport(v.x, v.z, { yaw: v.yaw, pitch: v.pitch }); __ladera.step(3); __ladera.render(); }, pose);
    const sample = await p.eval(`(() => {
      const L = __ladera, C = L.ctx, gl = C.renderer.getContext(), lib = C.vegetation;
      const counts = () => ({ triangles: C.renderer.info.render.triangles, calls: C.renderer.info.render.calls });
      gl.finish(); const total = counts(); let incremental = null;
      if (lib) {
        lib.group.visible = false; C.render(); gl.finish(); const hidden = counts();
        lib.group.visible = true; C.render(); gl.finish(); const restored = counts();
        incremental = { triangles: total.triangles - hidden.triangles, calls: total.calls - hidden.calls };
        if (incremental.triangles < 0 || incremental.calls < 0 || restored.triangles !== total.triangles || restored.calls !== total.calls) throw new Error('Frozen-frame vegetation cost is inconsistent');
      }
      return { total, incremental, library: lib?.stats() ?? null, pos: L.state().pos, building: L.state().building, errors: C.errors };
    })()`);
    await p.canvasShot(resolve(out, pose.id + '.jpg'), { w: width, h: height });
    report.views.push({ ...pose, ...sample, screenshot: pose.id + '.jpg' });
    if (sample.errors.length) throw new Error(pose.id + ': scene errors');
    if (sample.total.triangles > 2500000 || sample.total.calls > 1800) throw new Error(pose.id + ': scene budget exceeded');
    if (args.includes('--require-library') && (!sample.library || sample.library.loadedSpecies.length !== 14 || sample.library.failed.length || !sample.library.instances)) throw new Error(pose.id + ': incomplete vegetation integration');
    console.log(JSON.stringify({ id: pose.id, total: sample.total, incremental: sample.incremental }));
  }
  report.dressing = await p.eval('__ladera.ctx.world.vegetationDressing ?? null');
  report.console = p.summary();
  report.driverWarnings = report.console.consoleWarnings.filter(w => /GPU stall due to ReadPixels/.test(w));
  if (report.console.errors.length || report.console.netErrors.length || report.console.consoleErrors.length || report.console.consoleWarnings.some(w => !/GPU stall due to ReadPixels/.test(w))) process.exitCode = 1;
} catch (e) { report.fatal = String(e?.stack ?? e); process.exitCode = 1; }
finally { await b.close(); }
await writeFile(resolve(out, 'views.json'), JSON.stringify(report, null, 2) + '\n');
if (report.fatal) console.error(report.fatal);
