// Automated rubric metrics (RUBRIC section 6: M1-M4, M7-M9, M11) in one headless-Chrome session. Lead tool.
//
//   node la-ladera/tests/metrics.mjs [--w 1920] [--h 1080] [--soak 60] [--views 40] [--json out.json] [--shots dir] [--query "hour=17.2"]
//
//   1. boot (real render loop): boot seconds, console errors / warnings, 404s, stage timings, unknown materials
//   2. benchmark viewpoints derived from the plan (spawn, ridge, valley, plazas, landmarks, streets, doors, interiors):
//      per view the rAF frame time (median / p95 / max), the UNCAPPED cost of one render (gl.finish), draw calls, triangles
//   3. soak (manual stepping, deterministic): --soak simulated seconds of walking between nav nodes with sprint/jump/crouch,
//      door use, periodic rendering; counts errors, stuck events, NaN positions, falls below the world
//   4. counts: buildings with an entrance, NPCs, discoveries, anchors, lights
// Exit code 1 when a target is missed (errors, 404s, boot > 25 s, median > 16.7 ms, draw calls > 1800, triangles > 2.5 M).
import { writeFileSync } from 'node:fs';
import { launch } from './chrome.mjs';

const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i < 0 ? d : argv[i + 1]; };
const W = +opt('w', 1920), H = +opt('h', 1080), SOAK = +opt('soak', 60), MAXV = +opt('views', 40), SHOTS = opt('shots', null);
const QUERY = opt('query', '');
const fmt = (v, d = 1) => (Number.isFinite(v) ? +v.toFixed(d) : v);

// Runs inside the page: viewpoints from plan + buildings. yaw 0 looks toward -z; forward = (-sin yaw, -cos yaw).
const VIEWS_JS = `(() => {
  const ctx = __ladera.ctx, plan = ctx.plan, out = [];
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  const add = (id, x, z, yaw, extra = {}) => out.push({ id, x, z, yaw, ...extra });
  const nodes = plan.nav?.nodes ?? [], s = plan.spawn;
  add('spawn', s.x, s.z, s.yaw ?? 0);
  if (nodes.length) {
    const hi = nodes.reduce((a, b) => (b.y > a.y ? b : a)), lo = nodes.reduce((a, b) => (b.y < a.y ? b : a));
    add('ridge-looking-south', hi.x, hi.z, Math.PI); add('valley-looking-north', lo.x, lo.z, 0);
    const step = Math.max(1, Math.floor(nodes.length / 8));
    for (let i = 0; i < nodes.length && out.length < 14; i += step) {
      const n = nodes[i], e = (plan.nav.edges ?? []).find((e) => e[0] === n.id), m = e && nodes.find((q) => q.id === e[1]);
      add('street-' + n.id, n.x, n.z, m ? yawTo(m.x - n.x, m.z - n.z) : 0);
    }
  }
  for (const p of (plan.plazas ?? []).slice(0, 3)) {
    const c = p.poly.reduce((a, q) => [a[0] + q[0] / p.poly.length, a[1] + q[1] / p.poly.length], [0, 0]);
    add('plaza-' + p.id, c[0], c[1], yawTo(-c[0], -c[1]));
  }
  for (const l of (plan.landmarks ?? []).slice(0, 4)) { const d = Math.hypot(l.x, l.z) || 1; add('landmark-' + l.id, l.x - (l.x / d) * 6, l.z - (l.z / d) * 6, yawTo(l.x, l.z)); }
  const bs = __ladera.buildings(), seen = new Set(), pick = [];
  for (const b of bs) if (!seen.has(b.kind)) { seen.add(b.kind); pick.push(b); }
  for (const b of bs) if (pick.length < 14 && !pick.includes(b)) pick.push(b);
  for (const b of pick.slice(0, 8)) { const e = b.entrances?.[0]; if (e) add('door-' + b.id, e.outside[0], e.outside[2], e.yawIn ?? 0, { y: e.outside[1] }); }
  for (const b of pick) out.push({ id: 'interior-' + b.id + '-' + b.kind, building: b.id });
  return out;
})()`;

const MEASURE_JS = `(async () => {
  const n = 90, ts = [];
  await new Promise((res) => { let c = 0, last = performance.now(); const f = (t) => { ts.push(t - last); last = t; if (++c < n) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  ts.shift(); ts.sort((a, b) => a - b);
  const ctx = __ladera.ctx, gl = ctx.renderer.getContext(); ctx.render(); gl.finish();
  const t0 = performance.now(); for (let i = 0; i < 30; i++) ctx.render(); gl.finish();
  const cost = (performance.now() - t0) / 30, st = __ladera.state();
  return { median: ts[ts.length >> 1], p95: ts[Math.floor(ts.length * 0.95)], max: ts[ts.length - 1], cost, calls: st.drawCalls, tris: st.triangles, geoms: st.geometries, tex: st.textures, building: st.building };
})()`;

const SOAK_JS = (secs) => `(() => {
  const ctx = __ladera.ctx, plan = ctx.plan, L = __ladera;
  const nodes = (plan.nav?.nodes ?? []).filter((n) => n.kind !== 'stair' || true);
  let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const stats = { simSeconds: 0, targets: 0, stuck: [], nan: 0, fell: 0, doorsUsed: 0, renders: 0, maxY: -1e9, minY: 1e9 };
  const st0 = L.state(); let pos = st0.pos;
  while (stats.simSeconds < ${secs}) {
    const t = nodes.length ? nodes[Math.floor(rnd() * nodes.length)] : { x: (rnd() - 0.5) * 160, z: (rnd() - 0.5) * 160 };
    stats.targets++;
    let waited = 0, still = 0, last = L.state().pos;
    while (waited < 25) {
      const p = L.state().pos, dx = t.x - p[0], dz = t.z - p[2];
      if (!p.every(Number.isFinite)) { stats.nan++; break; }
      if (p[1] < -5) { stats.fell++; break; }
      stats.maxY = Math.max(stats.maxY, p[1]); stats.minY = Math.min(stats.minY, p[1]);
      if (Math.hypot(dx, dz) < 1.2) break;
      L.look(Math.atan2(-dx, -dz), -0.05);
      const r = rnd();
      L.walk(1, 0, 0.5, { sprint: r < 0.4, jump: r > 0.97, crouch: r > 0.93 && r <= 0.97 });
      waited += 0.5; stats.simSeconds += 0.5;
      const q = L.state(); if (q.target && q.target.kind === 'door' && rnd() < 0.5) { L.use(); stats.doorsUsed++; L.walk(1, 0, 0.4); stats.simSeconds += 0.4; }
      if (Math.hypot(q.pos[0] - last[0], q.pos[2] - last[2]) < 0.15) { still += 0.5; if (still >= 4) { stats.stuck.push({ at: q.pos.map((v) => +v.toFixed(1)), target: [+t.x.toFixed(1), +t.z.toFixed(1)], building: q.building }); break; } } else { still = 0; last = q.pos; }
      if (Math.floor(stats.simSeconds) % 3 === 0) { L.render(); stats.renders++; }
    }
    if (stats.fell || stats.nan) break;
  }
  return stats;
})()`;

const b = await launch({ width: W, height: H });
const report = { size: [W, H], renderer: null, boot: {}, views: [], soak: {}, counts: {}, failures: [] };
const fail = (m) => report.failures.push(m);
try {
  report.renderer = await b.renderer();
  // ---- 1. boot + benchmark views with the real loop --------------------------------------------------------
  const t0 = Date.now();
  const p = await b.open(`la-ladera/index.html?autostart${QUERY ? '&' + QUERY : ''}`);
  const bootMs = Date.now() - t0;
  let s = await p.eval('__ladera.state()');
  report.boot = { seconds: fmt(bootMs / 1000), stages: s.timings, errors: s.errors };
  if (bootMs > 25000) fail(`boot ${fmt(bootMs / 1000)} s > 25 s`);

  const views = (await p.eval(VIEWS_JS)).slice(0, MAXV);
  for (const v of views) {
    let state;
    if (v.building) state = await p.eval(`__ladera.enter(${JSON.stringify(v.building)})`);
    else state = await p.eval(`__ladera.teleport(${v.x}, ${v.z}, { yaw: ${v.yaw}, ${v.y != null ? 'y: ' + v.y : ''} })`);
    if (!v.building) await p.eval(`__ladera.look(${v.yaw}, -0.02)`);
    await p.eval('__ladera.step(40)');
    const m = await p.eval(MEASURE_JS, 120000);
    const row = { id: v.id, pos: state?.pos, median: fmt(m.median), p95: fmt(m.p95), max: fmt(m.max), costMs: fmt(m.cost, 2), calls: m.calls, tris: m.tris, geoms: m.geoms, textures: m.tex };
    report.views.push(row);
    if (SHOTS) await p.canvasShot(`${SHOTS}/${v.id}.jpg`, { w: 1280 });
    if (row.median > 16.7) fail(`${v.id}: median frame ${row.median} ms > 16.7`);
    if (row.calls > 1800) fail(`${v.id}: ${row.calls} draw calls > 1800`);
    if (row.tris > 2.5e6) fail(`${v.id}: ${row.tris} triangles > 2.5M`);
  }
  const sum = p.summary();
  report.boot.console = { errors: sum.consoleErrors.length, warnings: sum.consoleWarnings.length, pageErrors: sum.errors.length, net404: sum.netErrors.length };
  report.boot.consoleSample = [...sum.errors, ...sum.consoleErrors, ...sum.consoleWarnings, ...sum.netErrors].slice(0, 12);
  if (sum.errors.length || sum.consoleErrors.length) fail(`console errors: ${sum.errors.length + sum.consoleErrors.length}`);
  if (sum.consoleWarnings.length) fail(`console warnings: ${sum.consoleWarnings.length}`);
  if (sum.netErrors.length) fail(`network errors / 404: ${sum.netErrors.length}`);
  const bad = sum.consoleWarnings.filter((l) => /unknown material|missing asset|missing_asset/i.test(l));
  if (bad.length) fail(`unknown materials / missing assets: ${bad.length}`);

  // ---- 2. soak in deterministic manual mode ---------------------------------------------------------------------
  const p2 = await b.open(`la-ladera/index.html?autostart&manual${QUERY ? '&' + QUERY : ''}`);
  report.soak = await p2.eval(SOAK_JS(SOAK), 20 * 60 * 1000);
  const s2 = p2.summary();
  report.soak.console = { errors: s2.consoleErrors.length + s2.errors.length, warnings: s2.consoleWarnings.length, net404: s2.netErrors.length, sample: [...s2.errors, ...s2.consoleErrors, ...s2.consoleWarnings, ...s2.netErrors].slice(0, 8) };
  if (report.soak.console.errors || report.soak.console.warnings || report.soak.console.net404) fail('soak produced console errors / warnings / 404s');
  if (report.soak.nan) fail('NaN position during soak');
  if (report.soak.fell) fail('player fell below the world during soak');
  if (report.soak.stuck.length) fail(`${report.soak.stuck.length} stuck events during soak`);

  // ---- 3. counts -----------------------------------------------------------------------------------------------------
  const c = await p2.eval(`(() => { const L = __ladera, bs = L.buildings(), n = L.npcs(); return {
    buildings: bs.length, withEntrance: bs.filter((x) => (x.entrances?.length ?? 0) > 0).length, kinds: [...new Set(bs.map((x) => x.kind))].length,
    rooms: bs.reduce((a, x) => a + (x.rooms ?? 0), 0), npcs: n.length, discoveries: L.discoveries().length, anchors: L.anchors().length, lights: L.state().lights,
    npcFields: n[0] ? Object.keys(n[0]).slice(0, 14) : [] }; })()`);
  report.counts = c;
  if (c.buildings < 40) fail(`buildings ${c.buildings} < 40`);
  if (c.withEntrance < c.buildings) fail(`${c.buildings - c.withEntrance} buildings without an entrance`);
  if (c.npcs < 60) fail(`npcs ${c.npcs} < 60`);
  if (c.discoveries < 24) fail(`discoveries ${c.discoveries} < 24`);
} catch (e) { fail('metrics run crashed: ' + String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')); }
await b.close();

// ---- report ---------------------------------------------------------------------------------------------------------------
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
report.summary = {
  boot_s: report.boot.seconds, views: report.views.length,
  frame_ms_median_of_medians: report.views.length ? fmt(med(report.views.map((v) => v.median))) : null,
  worst_median: report.views.length ? Math.max(...report.views.map((v) => v.median)) : null,
  worst_cost_ms: report.views.length ? Math.max(...report.views.map((v) => v.costMs)) : null,
  max_calls: report.views.length ? Math.max(...report.views.map((v) => v.calls)) : null,
  max_tris: report.views.length ? Math.max(...report.views.map((v) => v.tris)) : null,
};
if (opt('json', null)) writeFileSync(opt('json'), JSON.stringify(report, null, 1));
console.log(JSON.stringify({ renderer: report.renderer, summary: report.summary, boot: { seconds: report.boot.seconds, console: report.boot.console, sample: report.boot.consoleSample }, counts: report.counts,
  soak: { ...report.soak, stuck: report.soak.stuck?.slice(0, 5) }, worstViews: [...report.views].sort((a, c) => c.costMs - a.costMs).slice(0, 5), failures: report.failures }, null, 2));
process.exit(report.failures.length ? 1 : 0);
