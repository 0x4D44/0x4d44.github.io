// Geometry-only companion to metrics.mjs: the SAME first 40 viewpoints, one explicit render after step(40), high quality.
// It checks the unchanged 2.5M triangle / 1800 draw-call limits, including shadows and post passes in renderer.info.
// This is NOT a frame-time benchmark and cannot satisfy or relax metrics.mjs's 12ms uncapped timing gate.
//
// node la-ladera/tests/goods-budget.mjs [--root /path/to/unchanged/repo] [--out .scratch/goods/budget.json] [--w 1920] [--h 1080]
// Always uses the project's quiet, headless-only browser harness; one browser for all views and closed in finally.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { launch, REPO } from './chrome.mjs';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const root = resolve(opt('root', REPO)), out = resolve(opt('out', '.scratch/goods/budget.json'));
const width = +opt('w', 1920), height = +opt('h', 1080);
if (![width, height].every((n) => Number.isInteger(n) && n > 0)) throw new Error('--w and --h must be positive integers');
const LIMITS = { views: 40, triangles: 2_500_000, calls: 1800 };

// Deliberately extract the existing benchmark expression rather than maintaining a second viewpoint list. Fail closed if its
// declaration changes, and identify the exact source in the JSON so an A/B report can prove matching viewpoint construction.
const metricsPath = join(root, 'la-ladera/tests/metrics.mjs'), metricsSource = await readFile(metricsPath, 'utf8');
const viewMatch = /const VIEWS_JS = `([^`]+)`;/.exec(metricsSource);
const defaultMatch = /MAXV\s*=\s*\+opt\('views',\s*(\d+)\)/.exec(metricsSource);
if (!viewMatch || viewMatch[1].includes('${') || viewMatch[1].includes('\\') || +defaultMatch?.[1] !== LIMITS.views) {
  throw new Error('metrics.mjs viewpoint declaration changed; review goods-budget.mjs extraction before running');
}
const VIEWS_JS = viewMatch[1];
const report = {
  mode: 'manual geometry only', root, size: [width, height], quality: 'high', limits: LIMITS,
  timing: { assessed: false, requiredUncappedMs: 12, note: 'Run tests/metrics.mjs on the target GPU for timing acceptance.' },
  viewpointSource: { file: metricsPath, expression: 'VIEWS_JS', sha256: createHash('sha256').update(VIEWS_JS).digest('hex'), selection: 'slice(0, 40)' },
  renderer: null, boot: {}, views: [], failures: [],
};
const fail = (message) => report.failures.push(message);

// Observe only goods submissions; no render behavior changes. The hooks preserve the previous callback and are installed once.
// Unlike .visible alone, onBeforeRender proves that the selected LOD mesh actually reached a camera render, after frustum culling.
function instrumentGoods() {
  const ctx = __ladera.ctx, probe = window.__goodsBudgetProbe = { draws: [], restores: [] };
  ctx.scene.traverse((mesh) => {
    if (!mesh.isMesh || mesh.userData.goods !== true) return;
    let lod = mesh.parent;
    while (lod && !(lod.isLOD && lod.userData.goods)) lod = lod.parent;
    if (!lod) return;
    const original = mesh.onBeforeRender;
    const level = lod.levels.findIndex((entry) => entry.object === mesh.parent);
    mesh.onBeforeRender = function (...callbackArgs) {
      original?.apply(this, callbackArgs);
      probe.draws.push({ lod: lod.name, mesh: mesh.name, level, triangles: (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3 });
    };
    probe.restores.push([mesh, original]);
  });
  return { hookedMeshes: probe.restores.length, assets: ctx.goodsAssets ?? null };
}

function measureView(view) {
  const L = __ladera, ctx = L.ctx;
  if (view.building) L.enter(view.building);
  else {
    L.teleport(view.x, view.z, { yaw: view.yaw, ...(view.y != null ? { y: view.y } : {}) });
    L.look(view.yaw, -0.02);
  }
  L.step(40);
  window.__goodsBudgetProbe.draws.length = 0;
  L.render();
  const gl = ctx.renderer.getContext(); gl.finish();
  const state = L.state(), draws = window.__goodsBudgetProbe.draws, lods = [];
  const visibleThroughParents = (object) => { for (let o = object; o; o = o.parent) if (!o.visible) return false; return true; };
  ctx.scene.traverse((lod) => {
    if (!lod.isLOD || !lod.userData.goods) return;
    const submitted = draws.filter((d) => d.lod === lod.name), visible = visibleThroughParents(lod);
    const level = lod.getCurrentLevel(), selected = lod.levels[level];
    lods.push({ name: lod.name, room: lod.userData.goods.room, records: lod.userData.goods.records,
      parentVisible: visible, selectedLevel: visible ? ['near', 'far', 'culled'][level] ?? String(level) : 'parent-hidden',
      levelIndex: level, distance: selected?.distance ?? null, submittedMeshes: submitted.length,
      submittedTriangles: submitted.reduce((sum, d) => sum + d.triangles, 0) });
  });
  return {
    id: view.id, pos: state.pos, building: state.building, quality: state.quality, qualityMode: state.qualityMode,
    calls: state.drawCalls, tris: state.triangles, geometries: state.geometries, textures: state.textures,
    contextLost: gl.isContextLost(), errors: L.errors(),
    goods: {
      submittedRooms: lods.filter((l) => l.submittedMeshes).length,
      submittedRecords: lods.filter((l) => l.submittedMeshes).reduce((sum, l) => sum + l.records, 0),
      submittedMeshes: draws.length, submittedTriangles: draws.reduce((sum, d) => sum + d.triangles, 0),
      nearRooms: lods.filter((l) => l.submittedMeshes && l.selectedLevel === 'near').length,
      farRooms: lods.filter((l) => l.submittedMeshes && l.selectedLevel === 'far').length,
      culledRooms: lods.filter((l) => l.selectedLevel === 'culled').length,
      parentHiddenRooms: lods.filter((l) => !l.parentVisible).length,
      lods,
    },
  };
}

let browser;
try {
  browser = await launch({ root, width, height });
  report.renderer = await browser.renderer();
  const start = Date.now();
  const page = await browser.open('la-ladera/index.html?autostart&manual&quality=high&dpr=1');
  report.boot.seconds = +((Date.now() - start) / 1000).toFixed(2);
  report.boot.state = await page.eval('__ladera.state()');
  report.boot.errors = await page.eval('__ladera.errors()');
  if (report.boot.errors.length) fail('Boot produced ' + report.boot.errors.length + ' stage errors');
  if (report.boot.state.quality !== 'high' || report.boot.state.qualityMode !== 'high') fail('High quality was not pinned');
  report.goods = await page.fn(instrumentGoods);
  const viewpoints = (await page.eval(VIEWS_JS)).slice(0, LIMITS.views);
  report.viewpointIds = viewpoints.map((v) => v.id);
  if (viewpoints.length !== LIMITS.views) fail('Expected exactly 40 metrics viewpoints, got ' + viewpoints.length);
  for (const [i, viewpoint] of viewpoints.entries()) {
    const row = await page.fn(measureView, viewpoint);
    report.views.push(row);
    if (!Number.isFinite(row.tris) || row.tris <= 0 || row.tris > LIMITS.triangles) fail(`${row.id}: ${row.tris} triangles (limit ${LIMITS.triangles})`);
    if (!Number.isFinite(row.calls) || row.calls <= 0 || row.calls > LIMITS.calls) fail(`${row.id}: ${row.calls} draw calls (limit ${LIMITS.calls})`);
    if (row.quality !== 'high' || row.qualityMode !== 'high') fail(row.id + ': quality changed from high');
    if (row.contextLost) fail(row.id + ': WebGL context lost');
    if (row.errors.length) fail(row.id + ': stage/system errors present');
    console.log(`[goods-budget ${String(i + 1).padStart(2, '0')}/40] ${row.id}: ${row.tris} tris, ${row.calls} calls; goods ${row.goods.submittedRecords} (${row.goods.nearRooms} near/${row.goods.farRooms} far rooms)`);
  }
  report.unknownMaterials = await page.eval('[...(__ladera.ctx.matlib?.missing ?? [])]');
  if (report.unknownMaterials.length) fail('Unknown library materials: ' + report.unknownMaterials.join(', '));
} catch (error) {
  fail(String(error?.stack ?? error).split('\n').slice(0, 4).join(' | '));
} finally {
  if (browser) {
    report.browser = browser.page.summary();
    const events = report.browser;
    if (events.errors.length || events.consoleErrors.length) fail(`Browser errors: ${events.errors.length} exceptions, ${events.consoleErrors.length} console errors`);
    if (events.netErrors.length) fail('Failed network requests: ' + events.netErrors.length);
    const unknown = events.consoleWarnings.filter((message) => /unknown material|missing asset|missing_asset|node .+ not found/i.test(message));
    if (unknown.length) fail('Unknown/missing asset warnings: ' + unknown.length);
    try { await browser.close(); } catch (error) { fail('Browser cleanup: ' + String(error)); }
  }
  report.summary = {
    views: report.views.length,
    maxTriangles: report.views.length ? Math.max(...report.views.map((v) => v.tris)) : null,
    maxCalls: report.views.length ? Math.max(...report.views.map((v) => v.calls)) : null,
    maxSubmittedGoodsTriangles: report.views.length ? Math.max(...report.views.map((v) => v.goods.submittedTriangles)) : null,
    viewsWithNearGoods: report.views.filter((v) => v.goods.nearRooms > 0).length,
    viewsWithFarGoods: report.views.filter((v) => v.goods.farRooms > 0).length,
    geometryPassed: report.failures.length === 0 && report.views.length === LIMITS.views,
    timingAssessed: false,
  };
  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ summary: report.summary, failures: report.failures, out }, null, 2));
process.exitCode = report.failures.length ? 1 : 0;
