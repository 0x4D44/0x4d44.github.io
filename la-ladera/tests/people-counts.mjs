#!/usr/bin/env node
// Supplemental geometry gate for software-GPU environments. This is NOT a replacement for tests/metrics.mjs or a frame-time pass.
// Uses the exact metrics gate's viewpoint program, at its default 1920 x 1080 size, but submits only one frame per view in manual mode.
// renderer.info counts are synchronous. No gl.finish or timing measurement: a software GPU must not turn geometry inspection into a render benchmark.
//   node la-ladera/tools/nice.mjs node la-ladera/tests/people-counts.mjs --json .scratch/people-counts.json
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2), option = (name, fallback) => { const i = argv.indexOf('--' + name); return i < 0 ? fallback : argv[i + 1]; };
const dest = resolve(option('json', '.scratch/people-counts.json'));
await mkdir(dirname(dest), { recursive: true });
const source = await readFile(new URL('./metrics.mjs', import.meta.url), 'utf8');
const viewProgram = /const VIEWS_JS = `([\s\S]*?)`;/.exec(source)?.[1];
if (!viewProgram || viewProgram.includes('${')) throw new Error('metrics.mjs viewpoint program changed; update the supplemental harness explicitly');
async function assetHashes() {
  const hashes = {};
  for (const name of ['people.glb', 'people_lod.glb', 'people_meta.json']) {
    const bytes = await readFile(new URL('../assets/models/people/' + name, import.meta.url));
    hashes[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
  }
  return hashes;
}
const report = { purpose: 'Geometry/draw-call counts only; no frame-time certification', checkedAt: new Date().toISOString(), size: [1920, 1080], manual: true, assets: await assetHashes(), views: [], failures: [] };
const b = await launch({ width: 1920, height: 1080 });
try {
  report.renderer = await b.renderer();
  const p = await b.open('la-ladera/index.html?autostart&manual');
  const views = (await p.eval(viewProgram)).slice(0, Number(option('views', 40)));
  for (const v of views) {
    if (v.building) await p.eval(`__ladera.enter(${JSON.stringify(v.building)})`);
    else {
      await p.eval(`__ladera.teleport(${v.x}, ${v.z}, ${JSON.stringify({ yaw: v.yaw, ...(v.y != null ? { y: v.y } : {}) })})`);
      await p.eval(`__ladera.look(${v.yaw}, -0.02)`);
    }
    const row = await p.eval(`(() => {
      __ladera.step(40); __ladera.ctx.render(); const s = __ladera.state();
      return { pos: s.pos, calls: s.drawCalls, tris: s.triangles, quality: s.quality, npcs: s.npcs, errors: s.errors };
    })()`, 60000);
    report.views.push({ id: v.id, ...row });
    console.log(`${v.id}: ${row.calls} calls, ${row.tris} triangles`);
    if (!Number.isInteger(row.calls) || row.calls <= 0 || !Number.isInteger(row.tris) || row.tris <= 0) report.failures.push(`${v.id}: invalid or empty rendered geometry counts`);
    if (row.calls > 1800) report.failures.push(`${v.id}: ${row.calls} draw calls > 1800`);
    if (row.tris > 2.5e6) report.failures.push(`${v.id}: ${row.tris} triangles > 2.5M`);
    if (row.errors) report.failures.push(`${v.id}: ${row.errors} game errors`);
  }
  report.diagnostics = structuredClone(p.summary());
  if (report.diagnostics.errors.length || report.diagnostics.consoleErrors.length || report.diagnostics.consoleWarnings.length || report.diagnostics.netErrors.length) report.failures.push('Unexpected page/console/network diagnostics');
  report.summary = { views: report.views.length, maxCalls: Math.max(...report.views.map(v => v.calls)), maxTriangles: Math.max(...report.views.map(v => v.tris)) };
  if (JSON.stringify(await assetHashes()) !== JSON.stringify(report.assets)) report.failures.push('Asset files changed during geometry verification; rerun on one complete build');
} catch (e) { report.failures.push(String(e?.stack ?? e)); }
finally { await b.close(); }
report.ok = report.failures.length === 0;
await writeFile(dest, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ ok: report.ok, renderer: report.renderer, summary: report.summary, failures: report.failures }, null, 2));
process.exitCode = report.ok ? 0 : 1;
