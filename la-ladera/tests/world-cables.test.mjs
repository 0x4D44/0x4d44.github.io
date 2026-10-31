// Cables and the buildings (Arthur's playtest of the early draft: "some of the electrical cables slice through buildings").
// Every wire the world strings (ctx.world.cables, written down by poles.js strand: pole to pole spans, service drops, cables across and along the alleys, washing lines, the yard line of hill.js) is tested against
// the buildings two ways. The volume pass (js/world/volumes.js) is the model the generator itself consults: the outline of the shell from the foundation up to the roof, with the parapet and the stair-head
// box of a terrace, the pitch of a corrugated or tile roof and the columns of an open top floor. The wall pass is independent of it: the cable as drawn, every 10 cm, against the physics' exterior wall
// colliders at the height it crosses them. Before the fix the page's world had 49 volume rows and 27 wall rows (spans across a block to a pole of another street, a drop to the far side of a corner house,
// facade cables buried 3 cm in the wall, the brick pretil of an unfinished house). A row names the building and the pole pair (or the lane and the two lots) so the guilty cable can be found.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/world-cables.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildData } from './headless.mjs';
import { cableOffenders } from './world-lib.mjs';
import { buildingVolumes } from '../js/world/volumes.js';
import { strand } from '../js/world/poles.js';
import { CASETA_H } from '../js/arch/roof.js';
import { pointInPoly, segDist } from '../js/world/geom.js';

let built = null;
const page = () => (built ??= buildData({ furnish: false, colliders: true, world: true }));       // the page's stage order, the buildings with their colliders and the props
const dist = (poly, x, z) => { let d = Infinity; for (let i = 0; i < poly.length; i++) d = Math.min(d, segDist(x, z, poly[i], poly[(i + 1) % poly.length])); return d; };
const signed = (poly, x, z) => (pointInPoly(poly, x, z) ? -dist(poly, x, z) : dist(poly, x, z));        // + outside the outline
const rows = (r) => [
  ...r.inside.map((o) => `${o.id}: ${o.label} goes ${o.depth} m into it, at (${o.at.join(', ')})`),
  ...r.walls.map((o) => `${o.id}: ${o.label} crosses its wall ${o.wall}, at (${o.at.join(', ')})`),
].sort();
const cable = (a, c, sag = 0) => ({ kind: 'span', poles: [900, 901], street: 'SX', a, c, sag });
const only = (ctx, cables) => cableOffenders({ buildings: ctx.buildings, physics: ctx.physics, world: { cables } });           // a few cables of our own against the page's buildings
const centre = (v) => [v.poly.reduce((s, p) => s + p[0], 0) / v.poly.length, v.poly.reduce((s, p) => s + p[1], 0) / v.poly.length];
const STYLES = ['terrace', 'corrugated', 'tile', 'unfinished'];
const ofStyle = (vol, style) => vol.list.find((v) => v.rm.style === style && v.poly.length === 4);

/** The cable through the middle of building v along x at height y, long enough to leave it on both sides. */
const across = (v, y, sag = 0) => { const [cx, cz] = centre(v); return cable([cx - 14, y, cz], [cx + 14, y, cz], sag); };
/** The highest the roof of v is along that line (the line leaves the outline on both sides). */
const topAlong = (vol, v) => { const [cx, cz] = centre(v); let top = -Infinity; for (let x = -14; x <= 14; x += 0.25) if (pointInPoly(v.poly, cx + x, cz)) top = Math.max(top, vol.roofTop(v.id, cx + x, cz)); return top; };
const flagged = (r, id) => ({ volume: r.inside.some((o) => o.id === id), wall: r.walls.some((o) => o.id === id) });
/** The highest the roof of v is along the line across its middle: the model's own for a terrace or an open top (the wall colliders and the cases below hold those to account), the roof model that draws the
 *  sheet or the tiles (rm.mono, rm.gable) for a corrugated or a tile roof. */
const highest = (vol, v) => {
  if (!v.rm.mono && !v.rm.gable) return topAlong(vol, v);
  const fr = v.bp.frame, [cx, cz] = centre(v);
  let top = -Infinity;
  for (let x = -14; x <= 14; x += 0.25) {
    if (!pointInPoly(v.poly, cx + x, cz)) continue;
    const [lx, , lz] = fr.toLocal(cx + x, 0, cz);
    top = Math.max(top, fr.toWorld(lx, v.rm.mono ? v.rm.mono.y(v.rm.mono.axis === 'z' ? lz : lx) : v.rm.gable.h(v.rm.gable.ridgeZ ? lx : lz), lz)[1]);
  }
  return top;
};

test('the page world strings its cables and writes them down', async () => {
  const { ctx } = await page();
  const cables = ctx.world.cables ?? [], kinds = {};
  for (const c of cables) {
    kinds[c.kind] = (kinds[c.kind] ?? 0) + 1;
    assert.ok([...c.a, ...c.c, c.sag].every(Number.isFinite), `${c.kind} cable has numbers for ends and sag`);
  }
  for (const k of ['span', 'drop', 'alley', 'facade']) assert.ok(kinds[k] > 0, `the world strings ${k} cables (${JSON.stringify(kinds)})`);
  assert.ok(cables.length >= 250, `${cables.length} cables strung (the barrio is not stripped bare to keep clear of the houses)`);
  const spans = ctx.world.cableSpans ?? [];
  assert.ok(spans.length >= 8, `${spans.length} spans for the pigeons to sit on`);
  for (const s of spans) assert.ok(cables.some((c) => c.kind === 'span' && c.a === s.a && c.c === s.c), 'a pigeon span is a wire that hangs (not one that was left out)');
  assert.ok(ctx.world.poles.refused >= 10, `${ctx.world.poles.refused} cables left out for the houses in their way`);
});

test('no cable goes through a building or its roof', async () => {
  const { ctx } = await page();
  const r = cableOffenders(ctx), bad = rows(r);
  assert.ok(r.cables > 0, 'there are cables to check');
  assert.equal(bad.length, 0, `${bad.length} cable(s) go through a building:\n  ${bad.join('\n  ')}`);
});

test('every cable end meets the face of its building: not buried in the wall, not hanging off it', async () => {
  const { ctx } = await page();
  const bad = [];
  for (const c of ctx.world.cables) {
    const ends = c.kind === 'drop' ? [[c.c, c.lot]] : ['alley', 'laundry', 'facade'].includes(c.kind) ? [[c.a, c.lots[0]], [c.c, c.lots[1]]] : [];
    for (const [p, id] of ends) {
      const d = signed(ctx.buildings.get(id).footprint, p[0], p[2]);
      if (d < 0.04 || d > 0.2) bad.push(`${c.kind} ${c.street ?? 'pole' + c.poles[0]} -> ${id}: ${d.toFixed(2)} m off the outline at (${p.map((n) => n.toFixed(2)).join(', ')})`);
    }
  }
  assert.equal(bad.length, 0, `${bad.length} end(s) off the face (want 0.04 .. 0.2 m outside):\n  ${bad.slice(0, 25).join('\n  ')}`);
});

test('the volume model stands as tall as every exterior wall collider, and over every wall', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), byId = new Map(vol.list.map((v) => [v.id, v])), ext = new Set(), bad = [];
  for (const bp of ctx.buildings.values()) for (const w of bp.shell?.walls ?? []) if (w.ext) ext.add(w.id);
  let n = 0;
  for (const w of ctx.physics.walls) {
    if (!ext.has(w.id)) continue;
    const id = w.id.split('.')[0], v = byId.get(id); n++;
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      const x = w.x1 + (w.x2 - w.x1) * t, z = w.z1 + (w.z2 - w.z1) * t, top = vol.roofTop(id, x, z);
      if (w.y1 > top + 0.005) { bad.push(`${w.id} (${v.rm.style}) reaches y ${w.y1.toFixed(2)}, the model only ${top.toFixed(2)}`); break; }
      if (signed(v.poly, x, z) > 0.005) { bad.push(`${w.id} (${v.rm.style}) lies ${signed(v.poly, x, z).toFixed(2)} m outside the outline`); break; }
    }
  }
  assert.ok(n > 500, `${n} exterior wall colliders checked`);
  assert.equal(bad.length, 0, `${bad.length} wall(s) the model does not cover:\n  ${bad.slice(0, 20).join('\n  ')}`);
});

test('TEETH: a cable through the middle of a house is flagged by both passes, in every kind of roof; the same cable over the roof is not', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx);
  for (const style of STYLES) {
    const v = ofStyle(vol, style);
    assert.ok(v, `the world has a ${style} house`);
    const mid = (v.bp.bounds.y0 + v.bp.roof.y) / 2, through = flagged(only(ctx, [across(v, mid)]), v.id);
    assert.deepEqual(through, { volume: true, wall: true }, `${style} ${v.id}: a cable at y ${mid.toFixed(2)} through the middle`);
    const top = highest(vol, v), over = flagged(only(ctx, [across(v, top + 0.4)]), v.id);
    assert.deepEqual(over, { volume: false, wall: false }, `${style} ${v.id}: a cable 0.4 m over the highest of its roof`);
    assert.ok(flagged(only(ctx, [across(v, top - 0.1)]), v.id).volume, `${style} ${v.id}: a cable 0.1 m under the highest of its roof is inside`);
  }
});

test('TEETH: a cable droops: one that is clear when taut dips into the roof under its own sag', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), taut = (q) => across(q, vol.roofTop(q.id, ...centre(q)) + 0.4);
  const v = vol.list.find((q) => q.rm.style === 'terrace' && q.poly.length === 4 && !flagged(only(ctx, [taut(q)]), q.id).volume);       // a terrace with nothing standing on the line
  assert.ok(v, 'a terrace house with a clear line across its middle');
  const sagging = { ...taut(v), sag: 1.0 };
  assert.ok(flagged(only(ctx, [sagging]), v.id).volume, `${v.id}: 1 m of droop in the middle of the span puts the cable into the roof`);
});

test('TEETH: the stair-head box on a terrace roof is part of the house', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), v = vol.list.find((q) => q.rm.style === 'terrace' && q.bp.shell.roofLayer?.caseta);
  assert.ok(v, 'a terrace house with a caseta');
  const q = v.bp.shell.roofLayer.caseta.outer, [cx, , cz] = v.bp.frame.toWorld((q.x0 + q.x1) / 2, 0, (q.z0 + q.z1) / 2);
  const line = (y) => cable([cx - 10, y, cz], [cx + 10, y, cz]);
  assert.ok(flagged(only(ctx, [line(v.bp.roof.y + CASETA_H - 0.3)]), v.id).volume, `${v.id}: a cable through the box over the stairs`);
  assert.ok(!flagged(only(ctx, [line(v.bp.roof.y + CASETA_H + 0.6)]), v.id).volume, `${v.id}: and one over it`);
});

test('TEETH: a cable that only clips the corner of a house is caught (its chord through the corner is 60 cm)', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), v = ofStyle(vol, 'terrace'), [p, q, , s] = v.poly;                 // the corner p and its two neighbours
  const unit = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const e1 = unit(p, q), e2 = unit(p, s), bl = Math.hypot(e1[0] + e2[0], e1[1] + e2[1]), b = [(e1[0] + e2[0]) / bl, (e1[1] + e2[1]) / bl], perp = [-b[1], b[0]];
  const C = [p[0] + b[0] * 0.3, p[1] + b[1] * 0.3], y = (v.bp.bounds.y0 + v.bp.roof.y) / 2;           // 30 cm in along the bisector, across it
  const clip = cable([C[0] - perp[0] * 7, y, C[1] - perp[1] * 7], [C[0] + perp[0] * 9, y, C[1] + perp[1] * 9]);
  assert.deepEqual(flagged(only(ctx, [clip]), v.id), { volume: true, wall: true }, `${v.id}: a 16 m cable that clips its corner`);
});

test('TEETH: the open top floor of an unfinished house (brick pretil, columns, beam) is part of the house', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), open = vol.list.filter((v) => v.rm.style === 'unfinished' && v.bp.shell.openTop);
  assert.ok(open.length >= 6, `${open.length} unfinished houses with an open top floor`);
  for (const v of open) {
    const deck = v.bp.roof.y;
    for (const [dy, name] of [[0.6, 'through the pretil'], [1.9, 'between the pretil and the beam']]) {
      const r = flagged(only(ctx, [across(v, deck + dy)]), v.id);
      assert.ok(r.volume, `${v.id}: a cable ${name} (${dy} m over the deck) is inside the house`);
      if (dy < 1.2) assert.ok(r.wall, `${v.id}: and it crosses the pretil's wall`);
    }
    assert.deepEqual(flagged(only(ctx, [across(v, deck + 2.9)]), v.id), { volume: false, wall: false }, `${v.id}: 2.9 m over the deck clears the columns and the beam`);
  }
});

test('TEETH: along a facade a cable may stand 5 cm off the wall, not 1 cm, and not in it', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), v = ofStyle(vol, 'terrace'), [cx, cz] = centre(v);
  let edge = null;                                                                                    // a facade nothing else stands against
  for (let i = 0; i < v.poly.length && !edge; i++) {
    const p = v.poly[i], q = v.poly[(i + 1) % v.poly.length], len = Math.hypot(q[0] - p[0], q[1] - p[1]), ex = (q[0] - p[0]) / len, ez = (q[1] - p[1]) / len;
    let nx = -ez, nz = ex; if ((p[0] - cx) * nx + (p[1] - cz) * nz < 0) { nx = -nx; nz = -nz; }
    const mx = (p[0] + q[0]) / 2, mz = (p[1] + q[1]) / 2;
    if (len > 3 && !vol.list.some((o) => o !== v && pointInPoly(o.poly, mx + nx * 0.4, mz + nz * 0.4))) edge = { mx, mz, ex, ez, nx, nz };
  }
  assert.ok(edge, `${v.id} has a free facade`);
  const along = (off) => cable([edge.mx - edge.ex + edge.nx * off, v.bp.bounds.y0 + 2.2, edge.mz - edge.ez + edge.nz * off], [edge.mx + edge.ex + edge.nx * off, v.bp.bounds.y0 + 2.2, edge.mz + edge.ez + edge.nz * off]);
  for (const [off, want] of [[0.05, false], [0.01, true], [-0.03, true], [-0.4, true]]) {
    assert.equal(flagged(only(ctx, [along(off)]), v.id).volume, want, `${v.id}: a cable ${off} m off the facade (+ outside)`);
  }
  assert.equal(flagged(only(ctx, [along(0.05)]), v.id).wall, false, 'and 5 cm off the facade it crosses no wall');
});

test('strand: a cable through a building is not strung, one in the clear is', async () => {
  const { ctx } = await page();
  const vol = buildingVolumes(ctx), v = ofStyle(vol, 'terrace'), probe = () => ({ buildings: ctx.buildings, world: { cables: [] } });
  const spy = () => { const b = { n: 0, quad() { b.n++; } }; return b; };
  const through = across(v, (v.bp.bounds.y0 + v.bp.roof.y) / 2, 0.1), p1 = probe(), b1 = spy();
  assert.equal(strand(p1, 'span', { poles: [1, 2], street: 'S1' }, b1, through.a, through.c, 0.1, 0.03), false, 'refused');
  assert.equal(b1.n, 0, 'nothing drawn');
  assert.equal(p1.world.cables.length, 0, 'nothing written down');
  const clear = across(v, topAlong(vol, v) + 0.4, 0.1), p2 = probe(), b2 = spy();
  assert.equal(strand(p2, 'span', { poles: [1, 2], street: 'S1' }, b2, clear.a, clear.c, 0.1, 0.03), true, 'strung');
  assert.ok(b2.n > 0, 'drawn');
  assert.equal(p2.world.cables.length, 1, 'written down');
  assert.deepEqual({ kind: p2.world.cables[0].kind, poles: p2.world.cables[0].poles }, { kind: 'span', poles: [1, 2] }, 'with its tag');
  const p3 = { world: { cables: [] } }, b3 = spy();                                                   // a world without buildings (the plan-only tests) strings anything
  assert.equal(strand(p3, 'span', { poles: [1, 2] }, b3, through.a, through.c, 0.1, 0.03), true);
});

test('the fix keeps the barrio wired: its poles stay joined and its houses stay fed', async () => {
  const { ctx } = await page();
  const cables = ctx.world.cables, pairs = new Set(cables.filter((c) => c.kind === 'span').map((c) => c.poles.join('-')));
  const joined = new Set([...pairs].flatMap((p) => p.split('-').map(Number))), poles = ctx.world.poleList.length;
  const lone = Array.from({ length: poles }, (_, i) => i).filter((i) => !joined.has(i));
  assert.ok(pairs.size >= 26, `${pairs.size} pole pairs are strung (${[...pairs].join(' ')})`);
  assert.ok(lone.length <= 3, `${lone.length} of ${poles} poles carry no span: ${lone.join(', ')}`);
  const drops = cables.filter((c) => c.kind === 'drop'), fed = new Set(drops.map((c) => c.lot));
  assert.ok(drops.length >= 56 && fed.size >= 48, `${fed.size} houses are fed from a pole (${drops.length} drops; 61 before the fix, a drop that would cross a house goes to the next house instead)`);
  for (let k = 0; k < poles; k++) {
    const own = drops.filter((c) => c.poles[0] === k);
    assert.ok(own.length <= 3, `pole ${k} has ${own.length} drops (1 to 3 houses)`);
    assert.equal(new Set(own.map((c) => c.lot)).size, own.length, `pole ${k} feeds each house once`);
  }
  assert.ok(cables.filter((c) => c.kind === 'alley' || c.kind === 'laundry').length >= 10, 'cables and washing lines cross the lanes');
  assert.ok(cables.filter((c) => c.kind === 'facade').length >= 25, 'cable bundles run along the facades');
});
