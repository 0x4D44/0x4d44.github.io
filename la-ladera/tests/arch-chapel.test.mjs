// A2: the chapel nave as a place of worship (js/arch/chapel_interior.js, review R1-D06; the plan is layouts.js layoutChapel, the furniture is A3's chapel() through the
// `chapelFurnish` hook). Checked on the barrio's own chapel (L48, furnished and built the way the page does it) and on the arch tests' chapel lot (T23, the same 11 x 14 lot):
//  * the nave is a tall room with a sanctuary one step up at the head, a centre aisle at least 0.9 m clear, a side aisle at least 0.8 m, pews in rows facing the altar;
//  * the fourteen Stations of the Cross: numerals I to XIV each once, a plate of its own colours and figures, drawn on the side walls from the altar to the door and back,
//    the numeral drawn stroke by stroke inside its cartouche, clear of the windows, the niches and the door end;
//  * the retablo is centred on the altar, the two niches (the Virgin with a halo of small lights, San Jose) and the checker aisle runner are really drawn;
//  * one `.int` group that never casts a shadow, only the seven declared materials (all defined), nothing outside the nave's volume, a triangle count that is the real one;
//  * the nave can be walked: from the street door to the altar step, up the centre aisle and along both side aisles to every Station.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-chapel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, explore, reached, openAllDoors } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { furnishBuilding } from '../js/interiors/index.js';
import { lin } from '../js/arch/mb.js';
import { ALL_DEFS } from '../js/core/matlib.js';
import { ROMAN, STATIONS, numeralStrokes, MATERIALS, AISLE } from '../js/arch/chapel_interior.js';

// the page's own stage order: plan, furnish, colliders, build
const real = await buildData({ lots: ['L48'] });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots().filter((l) => l.kind === 'chapel'), undefined, false, 0.4, 0);
for (const bp of synth.bps) furnishBuilding(synth.ctx, bp);
for (const bp of synth.bps) synth.ctx.physics.add(bp.colliders ?? {});
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const chapels = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]].flatMap(([label, ctx, bps]) => bps.filter((bp) => bp.shell.chapel).map((bp) => ({ tag: `${label} ${bp.id}`, ctx, bp })));
assert.equal(chapels.length, 2, 'the barrio\'s chapel and the test lot\'s');

const GROUP = (bp) => bp.id + '.chapel.int';
const naveOf = (bp) => bp.rooms.find((r) => r.id === bp.shell.chapel.room);
const f3 = (v) => +v.toFixed(3);
const close = (a, b, e = 1e-3) => a.every((v, i) => Math.abs(v - b[i]) < e);
/** The vertices of one material of the chapel group, in building-local coordinates, with their colours. */
function verts(ctx, bp, matKey) {
  const out = [];
  for (const m of ctx.batch.groups.get(GROUP(bp)).meshes) if (m.userData.matKey === matKey) {
    const P = m.geometry.attributes.position, C = m.geometry.attributes.color;
    for (let i = 0; i < P.count; i++) out.push({ p: bp.frame.toLocal(P.getX(i), P.getY(i), P.getZ(i)), c: [C.getX(i), C.getY(i), C.getZ(i)] });
  }
  return out;
}
const bounds = (vs) => ({ x0: Math.min(...vs.map((v) => v.p[0])), x1: Math.max(...vs.map((v) => v.p[0])), y0: Math.min(...vs.map((v) => v.p[1])), y1: Math.max(...vs.map((v) => v.p[1])), z0: Math.min(...vs.map((v) => v.p[2])), z1: Math.max(...vs.map((v) => v.p[2])) });
/** Height of the walkable floor at a building-local point, relative to the building's own floor. */
const floorAt = (ctx, bp, lx, lz) => { const [x, y0, z] = bp.frame.toWorld(lx, 0, lz); return ctx.physics.groundAt(x, z, y0 + 1.0) - y0; };
const toRoman = (n) => [['X', 10], ['IX', 9], ['V', 5], ['IV', 4], ['I', 1]].reduce((s, [r, v]) => { while (n >= v) { s += r; n -= v; } return s; }, '');
const GOLD = lin(0xd9a73a), DARK = lin(0x2a2420), PANEL_BLUE = lin(0x1d3a6b);
const CARTOUCHE_Y = 1.5 + 0.35 + 0.1, SCALE = 0.07;                      // where a numeral sits (chapel_interior.js station()): the cell's centre height and the metres of one glyph unit

// ---- the Stations as data -----------------------------------------------------------------------------------------------------------------------
test('the fourteen Stations are numbered I to XIV, each with a plate of its own colours and its own figures: no two alike', () => {
  assert.deepEqual(ROMAN, Array.from({ length: 14 }, (_, i) => toRoman(i + 1)), 'the numerals are the Roman numerals of 1 to 14');
  assert.equal(STATIONS.length, 14);
  assert.equal(new Set(STATIONS.map((s) => JSON.stringify(s))).size, 14, 'no two Stations are the same scene');
  assert.equal(new Set(STATIONS.map((s) => s.sky)).size, 14, 'fourteen different skies');
  assert.equal(new Set(STATIONS.map((s) => s.gr)).size, 14, 'and fourteen different grounds');
  for (const s of STATIONS) assert.ok(s.f.length >= 1 && s.f.length <= 3, 'one to three figures on a plate');
  assert.ok(STATIONS.some((s) => s.f.some((f) => f[1] === 'k')) && STATIONS.some((s) => s.f.some((f) => f[1] === 'l')) && STATIONS.some((s) => s.f.some((f) => f[1] === 's')), 'standing, kneeling and lying figures');
});

test('a numeral is drawn from strokes in a unit cell: I a bar, V two strokes meeting at the foot, X two that cross, the glyphs in reading order with a gap, the widest narrow enough for its cartouche', () => {
  const cells = ROMAN.map((rom) => ({ rom, st: numeralStrokes(rom) }));
  const per = { I: 1, V: 2, X: 2 };
  for (const { rom, st } of cells) {
    assert.equal(st.length, [...rom].reduce((n, c) => n + per[c], 0), `${rom}: the strokes of its glyphs`);
    for (const [h0, y0, h1, y1] of st) assert.ok(y0 >= 0 && y0 <= 1 && y1 >= 0 && y1 <= 1 && Math.hypot(h1 - h0, y1 - y0) > 0.9, `${rom}: a stroke inside the unit cell and as long as the glyph is high`);
    const hs = st.flatMap(([h0, , h1]) => [h0, h1]);
    assert.ok(Math.abs(Math.min(...hs) + Math.max(...hs)) <= 0.16, `${rom}: centred on the cell (the glyphs are spaced by their boxes, so an I beside a V sits 5 mm off by ink: 0.15 of a unit at most)`);
  }
  assert.equal(new Set(cells.map(({ st }) => JSON.stringify(st))).size, 14, 'fourteen numerals, fourteen drawings');
  const bar = numeralStrokes('I');
  assert.ok(bar.length === 1 && bar[0][0] === bar[0][2] && Math.abs(bar[0][0]) < 1e-9 && bar[0][1] === 0 && bar[0][3] === 1, 'I is one upright bar through the cell\'s centre');
  const [v1, v2] = numeralStrokes('V');
  assert.ok(v1[3] === 0 && v2[3] === 0 && v1[2] === v2[2] && v1[0] < v1[2] && v2[0] > v2[2] && v1[1] === 1 && v2[1] === 1, 'V: two strokes from the top corners to one point at the foot');
  const [x1, x2] = numeralStrokes('X');
  assert.ok(x1[0] === x2[0] && x1[2] === x2[2] && x1[1] === 1 && x1[3] === 0 && x2[1] === 0 && x2[3] === 1, 'X: one stroke down to the right, one up to the right, over the same width');
  const [i1, i2] = numeralStrokes('II');
  assert.ok(i2[0] - i1[0] >= 0.45, 'two bars are apart (a glyph and a gap)');
  const widest = Math.max(...cells.map(({ st }) => Math.max(...st.flatMap(([h0, , h1]) => [h0, h1])) * 2)) * SCALE;
  assert.ok(widest <= 0.26, `the widest numeral is ${f3(widest)} m wide: it fits the 0.3 m cartouche`);
});

// ---- the nave --------------------------------------------------------------------------------------------------------------------------------------
test('the nave is a tall room with a sanctuary one step up at the head, a centre aisle at least 0.9 m clear, a side aisle at least 0.8 m, and pews in rows facing the altar', () => {
  for (const { tag, ctx, bp } of chapels) {
    const C = bp.shell.chapel, nave = naveOf(bp), r = nave.rect, W = r.x1 - r.x0, D = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, d = C.dais;
    assert.ok(nave.h >= 4.5 && nave.h <= 5.2, `${tag}: a nave ${nave.h} m under its beams, not a box`);
    assert.ok(W >= 8 && D >= 9, `${tag}: nave ${f3(W)} x ${f3(D)}`);
    assert.ok(Math.abs(d.z0 - r.z0) < 0.02 && d.z1 - d.z0 >= 2.2 && d.z1 - d.z0 <= 3.2, `${tag}: the sanctuary runs from the back wall and is deep enough for the altar, the lamp and the candlesticks: ${f3(d.z1 - d.z0)} m`);
    assert.ok(Math.abs(d.x0 + d.x1 - 2 * cx) < 0.02 && d.x0 >= r.x0 + 0.9 && d.x1 <= r.x1 - 0.9, `${tag}: centred, with room to pass on both sides`);
    const step = floorAt(ctx, bp, cx, (d.z0 + d.z1) / 2) - floorAt(ctx, bp, cx, d.z1 + 0.8);
    assert.ok(step > 0.1 && step < 0.22, `${tag}: the sanctuary is one step up, ${f3(step)} m`);
    const altar = bp.furniture.find((q) => q.flags?.altar);
    assert.ok(altar && altar.x - altar.w / 2 >= d.x0 && altar.x + altar.w / 2 <= d.x1 && altar.z - altar.d / 2 >= d.z0 - 0.01 && altar.z + altar.d / 2 <= d.z1, `${tag}: the altar stands on the sanctuary`);
    const pews = bp.furniture.filter((q) => q.flags?.pew);
    assert.ok(pews.length >= 12, `${tag}: ${pews.length} pews`);
    for (const p of pews) {
      assert.ok(Math.abs(Math.cos(p.ry) + 1) < 1e-6, `${tag}: ${p.id} faces the altar (ry ${f3(p.ry)})`);
      assert.ok(p.z - p.d / 2 >= d.z1 + 0.6, `${tag}: ${p.id} is clear of the step`);
      assert.ok(p.z + p.d / 2 <= r.z1 - 1.2, `${tag}: ${p.id} leaves the door end free`);
    }
    const centre = 2 * Math.min(...pews.map((p) => Math.abs(p.x - cx) - p.w / 2)), side = Math.min(...pews.map((p) => W / 2 - Math.abs(p.x - cx) - p.w / 2));
    assert.ok(centre >= 0.9 && centre >= AISLE - 0.01, `${tag}: centre aisle ${f3(centre)} m clear`);
    assert.ok(side >= 0.8, `${tag}: side aisle ${f3(side)} m`);
    const rows = [...new Set(pews.map((p) => Math.round(p.z * 1000) / 1000))].sort((a, b) => a - b);
    assert.ok(rows.length >= 3 && rows.every((z, i) => i === 0 || z - rows[i - 1] >= 1.2), `${tag}: ${rows.length} rows, at least 1.2 m apart: ${rows.map(f3)}`);
    assert.ok([...rows].every((z) => pews.filter((p) => Math.abs(p.z - z) < 1e-3 && p.x < cx).length === pews.filter((p) => Math.abs(p.z - z) < 1e-3 && p.x > cx).length), `${tag}: the same pews each side of the aisle`);
  }
});

// ---- the Stations as geometry ------------------------------------------------------------------------------------------------------------------
test('every Station is drawn on its wall: the plate in its own colours, its own numeral stroke by stroke inside the gilt cartouche, the order from the altar to the door and back, clear of windows, niches and the door end', () => {
  let drawn = 0, clearedWindows = 0;
  for (const { tag, ctx, bp } of chapels) {
    const nave = naveOf(bp), r = nave.rect, cx = (r.x0 + r.x1) / 2, S = bp.shell.chapelStats, fp = verts(ctx, bp, 'frame_paint');
    assert.equal(S.stations.length, 14, `${tag}: fourteen Stations`);
    assert.deepEqual(S.stations.map((s) => s.n).sort(), [...ROMAN].sort(), `${tag}: each numeral once`);
    const west = S.stations.filter((s) => s.wall === 'west'), east = S.stations.filter((s) => s.wall === 'east');
    assert.deepEqual(west.map((s) => s.n), ROMAN.slice(0, 7), `${tag}: I to VII on the west wall`);
    assert.deepEqual(east.map((s) => s.n), ROMAN.slice(7), `${tag}: VIII to XIV back up the east wall (VIII by the door, XIV facing I)`);
    for (const wall of [west, east]) for (let i = 1; i < wall.length; i++) assert.ok(Math.abs(wall[i].along - wall[i - 1].along) >= 0.9, `${tag}: the plates are at least 0.9 m apart`);
    assert.ok(west[0].along < west[6].along && east[0].along > east[6].along, `${tag}: the west wall runs from the altar to the door, the east wall back`);
    for (const k of [0, 1, 2, 3, 4, 5, 6]) assert.ok(Math.abs(west[k].along - east[6 - k].along) < 1e-6, `${tag}: facing pairs`);
    const niches = fp.filter((v) => close(v.c, PANEL_BLUE, 1e-4) && v.p[1] > 0.9 && v.p[1] < 3.3 && (v.p[0] < r.x0 + 0.2 || v.p[0] > r.x1 - 0.2));
    const nicheEnd = Math.max(...niches.map((v) => v.p[2]));
    for (const st of S.stations) {
      const k = ROMAN.indexOf(st.n), sg = st.wall === 'west' ? 1 : -1, wallX = st.wall === 'west' ? r.x0 : r.x1;
      // the plate: one box in the Station's own sky colour
      const sky = fp.filter((v) => close(v.c, lin(STATIONS[k].sky), 1e-4)), ground = fp.filter((v) => close(v.c, lin(STATIONS[k].gr), 1e-4));
      assert.equal(sky.length, 24, `${tag} ${st.n}: one sky plate`);
      assert.equal(ground.length, 24, `${tag} ${st.n}: one ground strip`);
      const pb = bounds(sky);
      assert.ok(Math.abs((pb.z0 + pb.z1) / 2 - st.along) < 0.01 && pb.z1 - pb.z0 > 0.35 && pb.z1 - pb.z0 < 0.6, `${tag} ${st.n}: plate at ${f3((pb.z0 + pb.z1) / 2)} on the wall, ${f3(pb.z1 - pb.z0)} wide`);
      assert.ok(Math.abs(pb.x0 - wallX) < 0.1 || Math.abs(pb.x1 - wallX) < 0.1, `${tag} ${st.n}: on the ${st.wall} wall`);
      assert.ok(pb.y0 >= 1.3 && pb.y1 <= 1.9 && (pb.y0 + pb.y1) / 2 >= 1.45 && (pb.y0 + pb.y1) / 2 <= 1.75, `${tag} ${st.n}: at eye height ${f3(pb.y0)}..${f3(pb.y1)}`);
      // the cartouche and the numeral
      const gold = fp.filter((v) => close(v.c, GOLD, 1e-4) && Math.abs(v.p[0] - wallX) < 0.1 && Math.abs(v.p[2] - st.along) < 0.25 && v.p[1] > 1.8 && v.p[1] < 2.2);
      assert.ok(gold.length >= 24, `${tag} ${st.n}: a gilt cartouche`);
      const gb = bounds(gold), top = gb.y1;
      const dark = fp.filter((v) => close(v.c, DARK, 1e-4) && Math.abs(v.p[0] - wallX) < 0.1 && Math.abs(v.p[2] - st.along) < 0.3 && v.p[1] > 1.8 && v.p[1] < 2.2);
      assert.equal(dark.length % 4, 0, `${tag} ${st.n}: whole strokes`);
      const strokes = [];
      for (let i = 0; i < dark.length; i += 4) {
        const q = dark.slice(i, i + 4).map((v) => [sg * (st.along - v.p[2]), v.p[1]]);            // the reader's frame: h to the reader's right, y up
        const cxy = [q.reduce((s, p) => s + p[0], 0) / 4, q.reduce((s, p) => s + p[1], 0) / 4];
        const len = Math.max(...q.map((p, j) => Math.hypot(p[0] - q[(j + 1) % 4][0], p[1] - q[(j + 1) % 4][1])));
        strokes.push({ h: cxy[0], y: cxy[1], len });
        for (const [h, y] of q) assert.ok(y >= gb.y0 - 1e-3 && y <= gb.y1 + 1e-3 && Math.abs(h) <= (gb.z1 - gb.z0) / 2 + 1e-3, `${tag} ${st.n}: the numeral stays inside its cartouche (h ${f3(h)}, y ${f3(y)})`);
      }
      const want = numeralStrokes(st.n).map(([h0, y0, h1, y1]) => ({ h: ((h0 + h1) / 2) * SCALE, y: CARTOUCHE_Y + ((y0 + y1) / 2 - 0.5) * SCALE, len: Math.hypot((h1 - h0) * SCALE, (y1 - y0) * SCALE) }));
      const order = (a, b) => a.h - b.h || a.y - b.y;
      strokes.sort(order); want.sort(order);
      assert.equal(strokes.length, want.length, `${tag} ${st.n}: ${strokes.length} strokes drawn, ${want.length} in the numeral`);
      strokes.forEach((s, i) => assert.ok(Math.abs(s.h - want[i].h) < 2e-3 && Math.abs(s.y - want[i].y) < 2e-3 && Math.abs(s.len - want[i].len) < 2e-3, `${tag} ${st.n}: stroke ${i} is ${JSON.stringify(s)}, the numeral wants ${JSON.stringify(want[i])}`));
      // clear of the niches (the sanctuary end), the door end and every window of the wall
      assert.ok(pb.z0 >= nicheEnd + 0.4, `${tag} ${st.n}: ${f3(pb.z0 - nicheEnd)} m beyond the niche`);
      assert.ok(pb.z1 <= r.z1 - 1.0, `${tag} ${st.n}: ${f3(r.z1 - pb.z1)} m short of the door wall`);
      for (const w of bp.windows.filter((q) => q.room === nave.id && q.side === (st.wall === 'west' ? 'left' : 'right'))) {
        if (Math.abs(w.z - st.along) < w.w / 2 + 0.3) { clearedWindows++; assert.ok(w.y >= top + 0.1, `${tag} ${st.n}: window ${w.id} sill ${w.y} over the cartouche top ${f3(top)}`); }
      }
      drawn++;
    }
  }
  assert.equal(drawn, 28, 'fourteen Stations in each of the two chapels');
  assert.ok(clearedWindows >= 10, `${clearedWindows} Station-and-window pairs checked`);
});

// ---- the sanctuary, the niches, the floor ------------------------------------------------------------------------------------------------------------
test('the retablo is centred on the altar, the Virgin has her halo of small lights on the west wall and San Jose his niche on the east wall, the aisle has its checker runner and the sanctuary its checker floor', () => {
  for (const { tag, ctx, bp } of chapels) {
    const C = bp.shell.chapel, nave = naveOf(bp), r = nave.rect, cx = (r.x0 + r.x1) / 2, d = C.dais, S = bp.shell.chapelStats, fp = verts(ctx, bp, 'frame_paint');
    const altar = bp.furniture.find((q) => q.flags?.altar);
    const panel = bounds(fp.filter((v) => close(v.c, PANEL_BLUE, 1e-4) && Math.abs(v.p[2] - r.z0) < 0.1 && v.p[1] > 1.0));
    assert.ok(Math.abs((panel.x0 + panel.x1) / 2 - altar.x) < 0.02, `${tag}: the retablo panel is centred on the altar (${f3((panel.x0 + panel.x1) / 2)} against ${f3(altar.x)})`);
    assert.ok(panel.x1 - panel.x0 >= altar.w + 1.0 && panel.y0 >= 1.2 && panel.y1 >= 3.8, `${tag}: a retablo wider than the altar and rising behind the crucifix`);
    assert.deepEqual(S.niches, ['virgin', 'jose']);
    for (const [wallName, wall] of [['west', (v) => v.p[0] < r.x0 + 0.2], ['east', (v) => v.p[0] > r.x1 - 0.2]]) {
      const pb = bounds(fp.filter((v) => close(v.c, PANEL_BLUE, 1e-4) && wall(v) && v.p[1] > 0.9 && v.p[1] < 3.3));
      assert.ok(Math.abs((pb.z0 + pb.z1) / 2 - (r.z0 + 1.55)) < 0.02 && pb.y1 - pb.y0 > 2.0, `${tag}: a niche panel on the ${wallName} wall by the sanctuary (z ${f3((pb.z0 + pb.z1) / 2)})`);
    }
    const halo = (wall) => verts(ctx, bp, 'bulb_glow').filter((v) => wall(v) && Math.abs(v.p[2] - (r.z0 + 1.55)) < 0.3 && v.p[1] > 1.7 && v.p[1] < 2.5).length / 24;
    assert.ok(halo((v) => v.p[0] < r.x0 + 0.25) >= 8, `${tag}: a halo of small lights round the Virgin`);
    assert.equal(halo((v) => v.p[0] > r.x1 - 0.25), 0, `${tag}: and none round San Jose`);
    // the floor pattern: the runner from the door to the step, the checker on the sanctuary
    const ck = verts(ctx, bp, 'floor_tile_checker'), runner = bounds(ck.filter((v) => v.p[1] < 0.05)), top = bounds(ck.filter((v) => v.p[1] >= 0.05));
    assert.ok(ck.length === 8 && Math.abs(runner.x1 - runner.x0 - 1.2) < 0.01 && Math.abs((runner.x0 + runner.x1) / 2 - cx) < 0.01 && Math.abs(runner.z0 - d.z1) < 0.01 && Math.abs(runner.z1 - r.z1) < 0.01, `${tag}: a 1.2 m runner from the step to the door: ${JSON.stringify(runner)}`);
    assert.ok(Math.abs(top.x0 - d.x0) < 0.01 && Math.abs(top.x1 - d.x1) < 0.01 && Math.abs(top.z0 - d.z0) < 0.01 && Math.abs(top.z1 - d.z1) < 0.01 && top.y0 > 0.1 && top.y0 < 0.2, `${tag}: the checker floor fills the sanctuary at the step's height`);
    assert.ok(S.lamps >= 4 && S.flames >= 6 && S.beams >= 6, `${tag}: ${S.lamps} lamps, ${S.flames} flames, ${S.beams} beams`);
  }
});

// ---- the group -----------------------------------------------------------------------------------------------------------------------------------------
test('the chapel interior is one `.int` group that never casts a shadow, with the seven declared materials (all defined), nothing outside the nave, an honest triangle count and no build error', () => {
  for (const { tag, ctx, bp } of chapels) {
    const r = naveOf(bp).rect, g = ctx.batch.groups.get(GROUP(bp)), S = bp.shell.chapelStats;
    assert.ok(g && GROUP(bp).endsWith('.int'), `${tag}: the group is gated with the other interiors`);
    assert.equal(g.cast, false, `${tag}: the group does not cast`);
    assert.ok(g.meshes.length >= 1 && g.meshes.every((m) => m.castShadow === false), `${tag}: no mesh casts a shadow`);
    assert.deepEqual([...new Set(g.meshes.map((m) => m.userData.matKey))].sort(), [...MATERIALS].sort(), `${tag}: the seven materials and no other`);
    assert.equal(MATERIALS.length, 7);
    for (const k of MATERIALS) assert.ok(ALL_DEFS[k], `${tag}: material ${k} is defined`);
    let tris = 0, y0 = Infinity, y1 = -Infinity, off = 0;
    for (const m of g.meshes) {
      tris += m.geometry.index.count / 3;
      const P = m.geometry.attributes.position;
      for (let i = 0; i < P.count; i++) {
        const [x, y, z] = bp.frame.toLocal(P.getX(i), P.getY(i), P.getZ(i));
        y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        if (x < r.x0 - 0.05 || x > r.x1 + 0.05 || z < r.z0 - 0.05 || z > r.z1 + 0.05) off++;      // (the base of a statue or of the tabernacle's dome is buried up to 4 cm in the wall behind it: unseen)
      }
    }
    assert.equal(tris, S.tris, `${tag}: the stats count the triangles that were drawn`);
    assert.ok(tris >= 2500 && tris <= 6000, `${tag}: ${tris} triangles for a nave`);
    assert.ok(y0 >= -0.02 && y1 <= naveOf(bp).h + 0.02, `${tag}: from ${f3(y0)} to ${f3(y1)} m, inside the nave's ${naveOf(bp).h} m`);
    assert.equal(off, 0, `${tag}: ${off} vertices outside the nave's walls`);
    assert.deepEqual((ctx.errors ?? []).filter((e) => e.building === bp.id), [], `${tag}: no build error`);
  }
  const [a, b] = chapels.map(({ bp }) => bp.shell.chapelStats);
  assert.deepEqual({ ...a, id: 0 }, { ...b, id: 0 }, 'the same nave gets the same decoration');
});

// ---- walking it ------------------------------------------------------------------------------------------------------------------------------------
test('the nave can be walked: from the street door to the altar step, up the centre aisle and along both side aisles to the front of every Station', () => {
  for (const { tag, ctx, bp } of chapels) {
    openAllDoors(ctx, bp);
    const { visited } = explore(ctx, bp), nave = naveOf(bp), r = nave.rect, cx = (r.x0 + r.x1) / 2, altar = bp.furniture.find((q) => q.flags?.altar);
    assert.ok(reached(bp, visited, altar.x, altar.z + altar.d / 2 + 0.7, 0.16, 0.45), `${tag}: the front of the altar`);
    assert.ok(reached(bp, visited, cx, r.z0 + 6.0, 0, 0.45), `${tag}: the centre aisle by the door`);
    for (const st of bp.shell.chapelStats.stations) {
      const x = st.wall === 'west' ? r.x0 + 0.5 : r.x1 - 0.5;
      assert.ok(reached(bp, visited, x, st.along, 0, 0.45), `${tag}: the front of Station ${st.n}`);
    }
  }
});
