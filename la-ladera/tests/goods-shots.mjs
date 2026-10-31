// Five real shop interiors, at human eye height, through the project's quiet headless wrapper.
// node la-ladera/tests/goods-shots.mjs [--out .scratch/goods/shots] [--baseline-root /path/to/base/repo]
// --baseline-root captures the same fixture views without requiring goods assets (for comparison).
import { launch } from './chrome.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const opt = (name, fallback) => { const i = args.indexOf('--' + name); return i < 0 ? fallback : args[i + 1]; };
const out = resolve(opt('out', '.scratch/goods/shots'));
const baseline = opt('baseline-root', null);
const width = +opt('w', 1280), height = +opt('h', 720);
const shops = ['tienda', 'panaderia', 'fruver', 'ferreteria', 'drogueria'];

// Operates only through the debug API on the real scene. No geometry, materials, NPCs or lighting are replaced for a shot.
function frameShop(type) {
  const L = window.__ladera, ctx = L.ctx;
  const preferred = {
    tienda: ['shelf_tienda'], panaderia: ['bread_rack', 'bread_case_glass', 'shelf_cafe'],
    fruver: ['fruit_stand', 'crate_stack_mango', 'crate_stack_veg'],
    ferreteria: ['shelf_ferre'], drogueria: ['shelf_pharma'],
  }[type];
  const candidates = [];
  for (const bp of ctx.buildings.values()) {
    if (bp.interior?.shopType !== type && bp.lot?.shop !== type) continue;
    for (const fixture of bp.furniture ?? []) {
      const rank = preferred.indexOf(fixture.name);
      if (rank < 0) continue;
      const room = bp.rooms.find((r) => r.id === fixture.room);
      if (!room) continue;
      const { x0, x1, z0, z1 } = room.rect, a = fixture.ry ?? 0, cs = Math.cos(a), sn = Math.sin(a);
      const floor = (bp.lot.y ?? 0) + (room.y ?? 0);
      const floorItems = (bp.furniture ?? []).filter((r) => r.room === room.id && r.kind === 'floor' && r.block);
      for (const distance of [1.8, 2.2, 2.6, 3.0, 1.4]) for (const side of [0, -0.6, 0.6, -1, 1]) {
        const x = fixture.x + sn * distance + cs * side, z = fixture.z + cs * distance - sn * side;
        if (x < x0 + 0.3 || x > x1 - 0.3 || z < z0 + 0.3 || z > z1 - 0.3) continue;
        const collision = floorItems.some((r) => {
          const c = Math.cos(r.ry ?? 0), s = Math.sin(r.ry ?? 0), dx = x - r.x, dz = z - r.z;
          return Math.abs(dx * c - dz * s) < r.w / 2 + 0.27 && Math.abs(dx * s + dz * c) < r.d / 2 + 0.27;
        });
        if (collision) continue;
        const [wx, , wz] = bp.frame.toWorld(x, room.y ?? 0, z);
        const targetHeight = Math.min(fixture.h * 0.65, 1.3);
        const target = bp.frame.toWorld(fixture.x, fixture.y + targetHeight, fixture.z);
        candidates.push({ bp, room, fixture, position: [wx, floor, wz], target,
          score: rank * 10 + Math.abs(distance - 2.2) + Math.abs(side) * 0.7 });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score || a.fixture.id.localeCompare(b.fixture.id));
  const c = candidates[0];
  if (!c) throw new Error('No unobstructed customer viewpoint for ' + type);
  L.teleport(c.position[0], c.position[2], { y: c.position[1] });
  L.lookAt(...c.target);
  L.step(45);
  L.render();
  const state = L.state();
  return {
    shop: type, building: c.bp.id, room: c.room.id, fixture: c.fixture.name, fixtureId: c.fixture.id,
    position: c.position, target: c.target, eyeHeight: 1.64,
    goodsInRoom: (c.bp.goods ?? []).filter((g) => g.room === c.room.id).length,
    goodsOnFixture: (c.bp.goods ?? []).filter((g) => g.parent === c.fixture.id).length,
    goodsStats: c.bp.interior?.stats?.goods ?? null,
    drawCalls: state.drawCalls, triangles: state.triangles, quality: state.quality,
  };
}

await mkdir(out, { recursive: true });
const b = await launch({ width, height, ...(baseline ? { root: resolve(baseline) } : {}) });
const report = { baseline: !!baseline, renderer: null, size: [width, height], shots: [] };
try {
  report.renderer = await b.renderer();
  const p = await b.open('la-ladera/index.html?autostart&manual&dpr=1');
  report.bootErrors = await p.eval('__ladera.errors()');
  assert.equal(report.bootErrors.length, 0, 'The world must boot without stage errors');
  report.assets = await p.eval(`(() => {
    const ctx = __ladera.ctx, assets = ctx.goodsAssets;
    return { catalogueKeys: ctx.assets.names('goods').length, ...(assets ?? {}) };
  })()`);
  if (!baseline) {
    assert(report.assets.catalogueKeys > 0, 'Goods manifest must contain catalogue keys');
    assert.equal(report.assets.atlasReady, true, 'The shared label atlas must have loaded');
    assert.equal(report.assets.keys?.length, report.assets.catalogueKeys, 'Every near and far model must be usable');
    assert.equal(report.assets.missing?.length, 0, 'No goods model may fall back during the integration capture');
  }
  for (const type of shops) {
    const row = await p.fn(frameShop, type);
    if (!baseline) {
      assert(row.goodsOnFixture > 0, type + ' needs planned goods on the photographed fixture');
      assert(row.goodsStats?.drawn > 0, type + ' needs actual rendered goods');
    }
    assert(row.drawCalls <= 1800, type + ' exceeds the draw-call budget');
    assert(row.triangles <= 2.5e6, type + ' exceeds the triangle budget');
    row.file = type + '.jpg';
    await p.canvasShot(join(out, row.file), { w: width, h: height, q: 0.92 });
    report.shots.push(row);
    console.log(JSON.stringify(row));
  }
  report.browser = p.summary();
  assert.equal(report.browser.errors.length, 0, 'No JavaScript exceptions');
  assert.equal(report.browser.consoleErrors.length, 0, 'No console errors');
  assert.equal(report.browser.netErrors.length, 0, 'No failed asset requests');
} finally {
  await writeFile(join(out, 'shots.json'), JSON.stringify(report, null, 2) + '\n');
  await b.close();
}
console.log('Five shop screenshots verified: ' + out);
