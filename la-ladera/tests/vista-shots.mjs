// Deterministic three-view evidence with the existing headless/quiet Chrome harness.
// node la-ladera/tests/vista-shots.mjs --out .scratch/vista/after [--root ../baseline] [--w 960] [--h 540] [--panorama]
// Renderer timing gates remain in metrics.mjs; this short probe records actual rendered triangle/call costs.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { launch } from './chrome.mjs';

const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(option('out', '.scratch/vista/shots'));
const width = +option('w', 960), height = +option('h', 540);
const root = option('root', null), query = option('query', '');
await mkdir(out, { recursive: true });
const browser = await launch({ width, height, ...(root ? { root: resolve(root) } : {}),
  gpu: 'swiftshader', args: ['--renderer-process-limit=1', '--num-raster-threads=2'] });
const report = { size: [width, height], manual: true, renderer: null, views: [], failures: [] };
try {
  report.renderer = await browser.renderer();
  console.log('renderer:', report.renderer);
  const page = await browser.open('la-ladera/index.html?autostart&manual&dpr=1' + (query ? '&' + query : ''));
  console.log('booted');
  const views = await page.eval(`(() => {
    const plan = __ladera.ctx.plan, nodes = plan.nav.nodes;
    const hi = nodes.reduce((a, b) => b.y > a.y ? b : a);
    const lo = nodes.reduce((a, b) => b.y < a.y ? b : a);
    const views = [{ id: 'spawn', ...plan.spawn },
      { id: 'ridge-looking-south', x: hi.x, z: hi.z, yaw: Math.PI },
      { id: 'valley-looking-north', x: lo.x, z: lo.z, yaw: 0 }];
    if (${args.includes('--panorama')}) views.push({ id: 'valley-looking-south', x: lo.x, z: lo.z, yaw: Math.PI });
    return views;
  })()`);
  for (const v of views) {
    const counts = await page.eval(`(() => {
      const L = __ladera, c = L.ctx, view = ${JSON.stringify(v)};
      L.teleport(view.x, view.z, { yaw: view.yaw ?? 0 }); L.look(view.yaw ?? 0, -0.02); L.step(40);
      c.world?.vistaController?.update(0, true);
      L.render();
      const s = L.state(), active = c.world?.vista ? { ...c.world.vista } : null;
      let without = null;
      if (c.world?.vistaController) {
        const vista = c.world.vistaController.root;
        const visible = vista.visible;
        try { vista.visible = false; L.render(); const b = L.state(); without = { tris: b.triangles, calls: b.drawCalls }; }
        finally { vista.visible = visible; L.render(); }
      }
      return { pos: s.pos, tris: s.triangles, calls: s.drawCalls, errors: s.errors, vista: active, withoutVista: without,
        vistaTris: without ? s.triangles - without.tris : 0, vistaCalls: without ? s.drawCalls - without.calls : 0 };
    })()`, 240000);
    // Capture the existing drawing buffer via the compositor. The debug shot()
    // path temporarily reallocates post-processing targets, which is costly on
    // a shared software renderer; a page capture keeps the measured buffer intact.
    await page.pageShot(resolve(out, v.id + '.jpg'));
    report.views.push({ id: v.id, ...counts });
    console.log(v.id, JSON.stringify({ tris: counts.tris, calls: counts.calls, vistaTris: counts.vistaTris, vistaCalls: counts.vistaCalls }));
    await writeFile(resolve(out, 'shots.json'), JSON.stringify(report, null, 2) + '\n');
  }
  report.console = page.summary();
  if (Object.values(report.console).some((items) => items.length)) report.failures.push('console or network findings');
  if (report.views.some((v) => v.errors > 0)) report.failures.push('world build errors');
  if (report.views.some((v) => v.tris > 2_500_000 || v.calls > 1800)) report.failures.push('triangle/draw budget exceeded');
} catch (error) { report.failures.push(String(error?.stack ?? error)); }
finally { await browser.close(); }
await writeFile(resolve(out, 'shots.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
