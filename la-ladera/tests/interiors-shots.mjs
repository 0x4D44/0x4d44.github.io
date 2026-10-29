// Room screenshots at eye height (1.64 m) through the real page (headless, quiet box: chrome.mjs only).
//   node la-ladera/tests/interiors-shots.mjs auto [outDir]          one shot per room type / shop type (first rooms with enough furniture)
//   node la-ladera/tests/interiors-shots.mjs spec.json [outDir]     [{ "bid": "L07", "room": "L07.f0.r2", "tag": "papeleria", "view": 0 }]   view = corner 0..3 (default: the best free one)
//   node la-ladera/tests/interiors-shots.mjs list                   print every room (building, kind, shop, type, area, furniture count) and exit
//   node la-ladera/tests/interiors-shots.mjs showcase [outDir] [keys,csv] [perRow]   a studio: the models in rows on a wood floor (all models when no keys), one shot per row
// Env: W, H (default 1280x720). Prints a JSON report (shots, console errors, draw calls). LOOK at the JPEGs: this tool judges nothing by itself.
//      A3_MODELS=<dir>  serve manifest.furniture.json + furniture/*.glb from <dir> (a scratch build of tools/blender/furn_build.py) instead of assets/models
//      showcase: TINT=<palette index>, DIST=<camera distance m>, AT=<height looked at>, DX=<sideways shift m>
import { launch } from './chrome.mjs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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
  // A studio: the world is hidden, the chosen catalogue keys stand in rows on a wood floor in front of a plain wall (real lights, real materials, the real furniture path).
  async showcase(keys, perRow = 5, tintAt = 0, hour = 12) {
    const ctx = __ladera.ctx, { CATALOG, PAL } = await import('/la-ladera/js/interiors/catalog.js');
    const { buildInterior } = await import('/la-ladera/js/interiors/build.js');
    const sp = ctx.plan.spawn, gy = ctx.plan.heightAt(sp.x, sp.z), ox = sp.x, oz = sp.z;
    const rows = [], recs = [];
    let row = null, rowZ = 0;
    for (const k of keys.length ? keys : Object.keys(CATALOG)) {
      const c = CATALOG[k]; if (!c || !ctx.interiorGlb?.has(k)) continue;
      if (!row || row.items.length >= perRow) { row = { items: [], z: -rowZ * 2.6, w: 0 }; rows.push(row); rowZ++; }
      const w = Math.max(c.size[0], 0.7) + 0.5, pal = PAL[c.cols] ?? PAL.none;
      const kind = c.wall ? 'wall' : c.ceil ? 'ceil' : c.top ? 'top' : 'floor';
      const y = kind === 'wall' ? (c.y ?? 1.2) : kind === 'ceil' ? 2.7 : 0;
      row.items.push({ k, w, x: row.w + w / 2 }); row.w += w;
      recs.push({ id: 'show.' + k, name: k, x: row.w - w / 2, y, z: row.z, ry: 0, kind, room: 'SHOW.r0', tint: c.cols === 'none' ? undefined : pal[tintAt % pal.length], flags: { magnets: true }, w: c.size[0], d: c.size[2], h: c.size[1], block: true, _row: rows.length - 1 });
    }
    for (const r of recs) { const row = rows[r._row]; r.x -= row.w / 2; delete r._row; }
    const bp = { id: 'SHOW', lot: { x: ox, y: gy, z: oz, rotY: 0 }, furniture: recs, interior: {}, rooms: [], windows: [], frame: { toWorld: (x, y, z) => [ox + x, gy + y, oz + z] } };
    for (const o of ctx.scene.children) if (!o.isLight && o.name !== 'sky') o.visible = false;
    if (ctx.visibility) ctx.visibility.ints = [];
    __ladera.setHour(hour);
    const set = ctx.batch.group('SHOW.set', { cast: false, receive: true }).builder;
    set.setBasePose(ox, gy, oz, 0);
    const x1 = Math.max(...rows.map((r) => r.w)) / 2 + 3, z0 = -rows.length * 2.6 - 1, z1 = 7;
    set.box('floor_pine', 0, -0.05, (z0 + z1) / 2, x1 * 2, 0.1, z1 - z0, { col: 0xd8cdb8 });
    set.box('wall_paint', 0, 1.6, z0 - 0.1 + 0.2, x1 * 2, 3.2, 0.2, { col: 0xe9e0d0 });
    ctx.batch.flush('SHOW.set'); ctx.batch.group('SHOW.set').obj.visible = true;
    buildInterior(ctx, bp);
    const g = ctx.batch.group('SHOW.int'); g.obj.visible = true;
    window.__a3.rows = rows.map((r) => ({ z: r.z, keys: r.items.map((i) => i.k), w: r.w })); window.__a3.org = [ox, gy, oz];
    return { rows: window.__a3.rows, tris: ctx.batch.groups.get('SHOW.int').meshes.reduce((s, m) => s + m.geometry.index.count / 3, 0), mats: ctx.batch.groups.get('SHOW.int').meshes.map((m) => m.userData.matKey), stats: bp.interior.stats ?? null, errors: __ladera.errors().map((e) => e.stage + ': ' + e.message).slice(0, 6) };
  },
  // Camera for row i of the showcase: back off by 'dist' metres, eye height 'eye', looking at the row's centre at height 'at'.
  look(i, dist = 3.6, at = 0.8, dx = 0) {
    const [ox, gy, oz] = window.__a3.org, r = window.__a3.rows[i], eye = 1.64;
    const cx = ox + dx, cz = oz + r.z + dist, pitch = Math.atan2(at - eye, dist);
    __ladera.teleport(cx, cz, { y: gy, yaw: 0, pitch });
    __ladera.step(20);
    return true;
  },
};
true`;

/** Serve manifest.furniture.json and furniture/*.glb from another models folder (a scratch build) instead of assets/models: nothing in the repo changes. */
async function overlayModels(p, dir) {
  await p.send('Fetch.enable', { patterns: [{ urlPattern: '*/assets/models/manifest.furniture.json*' }, { urlPattern: '*/assets/models/furniture/*' }] });
  const prev = p.b.listeners.get(p.sid);
  p.b.listeners.set(p.sid, (m) => {
    if (m.method !== 'Fetch.requestPaused') return prev(m);
    const rel = new URL(m.params.request.url).pathname.replace(/^.*\/assets\/models\//, ''), id = m.params.requestId;
    readFile(join(dir, rel)).then(
      (buf) => p.send('Fetch.fulfillRequest', { requestId: id, responseCode: 200, body: buf.toString('base64'), responseHeaders: [{ name: 'content-type', value: rel.endsWith('.json') ? 'application/json' : 'model/gltf-binary' }, { name: 'cache-control', value: 'no-store' }] }),
      () => p.send('Fetch.continueRequest', { requestId: id })).catch(() => {});
  });
}

const b = await launch({ width: W, height: H });
const report = { shots: [] };
try {
  if (process.env.A3_MODELS) await overlayModels(b.page, resolve(process.env.A3_MODELS));
  const p = await b.open('la-ladera/index.html?autostart&manual');
  await p.eval(helpers);
  report.errors = await p.eval('__ladera.errors().map(e => e.stage + ": " + e.message).slice(0, 10)');
  const list = await p.eval('__a3.list()');
  if (mode === 'list') { console.log(list.map((r) => `${r.bid} ${r.kind}${r.shop ? '/' + r.shop : ''} f${r.floor} ${r.room} ${r.type} ${r.area}m2 items=${r.n} decals=${r.d}`).join('\n')); await b.close(); process.exit(0); }
  let spec;
  if (mode === 'showcase') {
    const keys = (process.argv[4] ?? '').split(',').filter(Boolean), perRow = +(process.argv[5] ?? 5);
    report.showcase = await p.eval(`__a3.showcase(${JSON.stringify(keys)}, ${perRow}, ${+(process.env.TINT ?? 0)}, ${+(process.env.HOUR ?? 12)})`);
    report.glb = await p.eval('[...(__ladera.ctx.interiorGlb ?? [])].length');
    for (let i = 0; i < report.showcase.rows.length; i++) {
      const r = report.showcase.rows[i];
      await p.eval(`__a3.look(${i}, ${+(process.env.DIST ?? Math.max(2.6, r.w * 0.42))}, ${+(process.env.AT ?? 0.8)}, ${+(process.env.DX ?? 0)})`);
      const file = `${outDir}/show-${i}.jpg`;
      await p.canvasShot(file, { w: W, h: H });
      report.shots.push({ file, keys: r.keys });
    }
    spec = [];
  } else if (mode === 'auto') {
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
