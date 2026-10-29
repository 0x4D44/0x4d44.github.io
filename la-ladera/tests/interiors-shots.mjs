// Room screenshots at eye height (1.64 m) through the real page (headless, quiet box: chrome.mjs only).
//   node la-ladera/tests/interiors-shots.mjs auto [outDir]          one shot per room type / shop type (first rooms with enough furniture)
//   node la-ladera/tests/interiors-shots.mjs spec.json [outDir]     [{ "bid": "L07", "room": "L07.f0.r2", "tag": "papeleria", "view": 0 }]   view = corner 0..3 (default: the best free one)
//   node la-ladera/tests/interiors-shots.mjs list                   print every room (building, kind, shop, type, area, furniture count) and exit
// Env: W, H (default 1280x720). Prints a JSON report (shots, console errors, draw calls). LOOK at the JPEGs: this tool judges nothing by itself.
import { launch } from './chrome.mjs';
import { readFile } from 'node:fs/promises';

const [mode = 'auto', outDir = '.scratch/a3/shots'] = process.argv.slice(2);
const W = +(process.env.W || 1280), H = +(process.env.H || 720);
const helpers = `
window.__a3 = {
  list() {
    const out = [];
    for (const bp of __ladera.ctx.buildings.values()) {
      for (const r of bp.rooms ?? []) {
        const n = (bp.furniture ?? []).filter((f) => f.room === r.id && !f.decal).length;
        const d = (bp.furniture ?? []).filter((f) => f.room === r.id && f.decal).length;
        out.push({ bid: bp.id, kind: bp.lot?.kind, shop: bp.interior?.shopType ?? null, floor: r.floor, room: r.id, type: r.type, area: +((r.rect.x1 - r.rect.x0) * (r.rect.z1 - r.rect.z0)).toFixed(1), n, d, role: bp.interior?.rooms?.[r.id]?.role ?? null });
      }
    }
    return out;
  },
  view(bid, rid, k) {
    const ctx = __ladera.ctx, bp = ctx.buildings.get(bid), r = bp.rooms.find((x) => x.id === rid);
    const { x0, x1, z0, z1 } = r.rect, inset = 0.5, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const recs = (bp.furniture ?? []).filter((f) => f.room === rid && f.kind === 'floor' && f.block);
    const free = (x, z) => !recs.some((f) => { const c = Math.cos(f.ry), s = Math.sin(f.ry), dx = x - f.x, dz = z - f.z; const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < f.w / 2 + 0.3 && Math.abs(lz) < f.d / 2 + 0.3; });
    const cands = [[x0 + inset, z0 + inset], [x1 - inset, z0 + inset], [x1 - inset, z1 - inset], [x0 + inset, z1 - inset]].map(([x, z], i) => ({ x, z, i, ok: free(x, z), d: Math.hypot(x - cx, z - cz) }));
    const pick = k != null ? cands[k] : cands.filter((c) => c.ok).sort((a, b) => b.d - a.d)[0] ?? cands[0];
    const fy = (bp.lot.y ?? 0) + (r.y ?? 0);
    const [wx, , wz] = bp.frame.toWorld(pick.x, 0, pick.z), [tx, , tz] = bp.frame.toWorld(cx, 0, cz);
    const yaw = Math.atan2(-(tx - wx), -(tz - wz));
    __ladera.teleport(wx, wz, { y: fy, yaw, pitch: -0.1 });
    __ladera.step(45);                                   // 0.75 s: the light pool fades in (about 10% per frame) and visibility settles
    return { corner: pick.i, ok: pick.ok, pos: [wx, fy, wz], yaw };
  },
};
true`;

const b = await launch({ width: W, height: H });
const report = { shots: [] };
try {
  const p = await b.open('la-ladera/index.html?autostart&manual');
  await p.eval(helpers);
  report.errors = await p.eval('__ladera.errors().map(e => e.stage + ": " + e.message).slice(0, 10)');
  const list = await p.eval('__a3.list()');
  if (mode === 'list') { console.log(list.map((r) => `${r.bid} ${r.kind}${r.shop ? '/' + r.shop : ''} f${r.floor} ${r.room} ${r.type} ${r.area}m2 items=${r.n} decals=${r.d}`).join('\n')); await b.close(); process.exit(0); }
  let spec;
  if (mode === 'auto') {
    spec = []; const seen = new Set();
    const want = (r) => {
      if (r.n < 5) return null;
      if (r.shop && (r.type === 'shop' || r.role === 'shop')) return 'shop-' + r.shop;
      if (r.kind === 'chapel' && r.type !== 'bathroom') return 'chapel';
      if (r.kind === 'school' && r.type === 'classroom') return 'classroom';
      if (r.kind === 'clinic' && r.n >= 6) return 'clinic-' + r.type;
      if (['kitchen', 'bedroom', 'living', 'bathroom', 'dining', 'laundry', 'terrace', 'patio', 'office', 'workshop', 'garage', 'backroom'].includes(r.type)) return r.type;
      return null;
    };
    for (const r of list) { const t = want(r); if (t && !seen.has(t)) { seen.add(t); spec.push({ ...r, tag: t }); } }
  } else spec = JSON.parse(await readFile(mode, 'utf8'));
  for (const s of spec) {
    const bid = s.bid, rid = s.room;
    try {
      const v = await p.eval(`__a3.view(${JSON.stringify(bid)}, ${JSON.stringify(rid)}, ${s.view ?? 'null'})`);
      const file = `${outDir}/${s.tag ?? rid}-${bid}.jpg`.replace(/[:\s]/g, '_');
      await p.canvasShot(file, { w: W, h: H });
      report.shots.push({ file, bid, room: rid, type: s.type, n: s.n, kind: s.kind, shop: s.shop, corner: v.corner, ok: v.ok });
    } catch (e) { report.shots.push({ bid, room: rid, error: String(e?.message ?? e).slice(0, 200) }); }
  }
  report.state = await p.eval('(() => { const s = __ladera.state(); return { drawCalls: s.drawCalls, triangles: s.triangles, errors: s.errors, fps: s.fps }; })()');
  report.page = p.summary();
} catch (e) { report.fatal = String(e?.stack ?? e); }
await b.close();
console.log(JSON.stringify(report, null, 1));
process.exit(report.fatal ? 1 : 0);
