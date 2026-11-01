// A2: the weathering of the outside of the shell (js/arch/weather.js) and the bills pasted on the wall (signs.js `assignPosters`), review R1-003 "pristine paint
// everywhere, the same posters on every shop". Weathering is decoration, so what must hold is that it is there (every front wears at least three kinds), that it is
// a skin (on its own wall, below the top of it, off every opening and fixture, 8 mm out, facing out, never casting a shadow), that it is cheap (one mesh a building),
// and that its painters cannot take the page down (they run under a recording stand-in for the canvas, a throwing one is reported through ctx.errors).
// The marks are read from `bp.facade` (kind, side, u0..u1 along the wall, y0..y1, out, variant); the quads from the building's `.ext` meshes.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-weather.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { makeRoofModel } from '../js/arch/shellroof.js';
import { PRETIL_H } from '../js/arch/roof.js';
import { WEATHER_KINDS, ITEMS, PAINTERS, DAMP_LEVELS, paintDecalAtlas, ensureDecalAtlas, planWeather, assignDampLevels, patchTint } from '../js/arch/weather.js';
import { assignPosters, posterCount, POSTER_COUNT, paintPoster, paintSignAtlas } from '../js/arch/signs.js';

const real = await buildData({ furnish: false });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

const isWeather = (r) => WEATHER_KINDS.includes(r.kind);
const marksOf = (bp) => bp.facade.filter(isWeather);
const HARD = ['peel', 'patch', 'crack', 'tag', 'efflor'];
const alongWall = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
/** Every window and exterior door on one side as a rect in (u along the wall, y). */
function openings(bp, side) {
  const S = bp.shell, out = [];
  for (const w of bp.windows) if (w.side === side) { const u = alongWall(side, w); out.push({ id: w.id, kind: 'window', u0: u - w.w / 2, u1: u + w.w / 2, y0: w.floor * S.fh + w.y, y1: w.floor * S.fh + w.y + w.h }); }
  for (const d of bp.doors) if (d.ext && d.side === side) { const u = alongWall(side, d); out.push({ id: d.id, kind: 'door', u0: u - d.w / 2, u1: u + d.w / 2, y0: d.floor * S.fh, y1: d.floor * S.fh + d.h }); }
  return out;
}
const hit = (r, o, tol = 0.02) => r.u1 > o.u0 + tol && r.u0 < o.u1 - tol && r.y1 > o.y0 + tol && r.y0 < o.y1 - tol;

test('every front wears at least three kinds of weathering, and no two neighbours wear the same mix', () => {
  const few = [];
  for (const [label, , bps] of SETS) for (const bp of bps) {
    const kinds = new Set(marksOf(bp).filter((r) => r.side === 'front').map((r) => r.kind));
    if (kinds.size < 3) few.push(`${label} ${bp.id} (${bp.lot.kind}): ${[...kinds].join(',') || 'none'}`);
  }
  assert.deepEqual(few, [], 'fronts with fewer than three kinds of weathering');
  const sig = (bp) => marksOf(bp).filter((r) => r.side === 'front').map((r) => `${r.kind}${r.variant}@${r.u0}`).sort().join(' ');
  const L = real.buildings, same = [];
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j];
    if (Math.hypot(a.lot.x - b.lot.x, a.lot.z - b.lot.z) < (a.lot.w + b.lot.w) / 2 + 6 && sig(a) === sig(b)) same.push(`${a.id}~${b.id}`);
  }
  assert.deepEqual(same, [], 'neighbours that are weathered alike');
});

test('every kind of weathering shows up on the real barrio, and the sides of a building wear some too', () => {
  const seen = new Map();
  for (const bp of real.buildings) for (const r of marksOf(bp)) seen.set(r.kind, (seen.get(r.kind) ?? 0) + 1);
  assert.deepEqual(WEATHER_KINDS.filter((k) => !seen.get(k)), [], `kinds that never appear on the ${real.buildings.length} real lots: ${[...seen].map(([k, n]) => k + ':' + n).join(' ')}`);
  const onSides = real.buildings.filter((bp) => marksOf(bp).some((r) => r.side === 'left' || r.side === 'right')).length;
  assert.ok(onSides >= 15, `only ${onSides} of ${real.buildings.length} buildings wear weathering on a side wall`);
});

test('weathering is a skin: inside the span of its wall and under the top of it, off every opening, unit, sign and balcony, and the covering marks never lie on each other', () => {
  const problems = [];
  for (const [label, , bps] of SETS) for (const bp of bps) {
    const S = bp.shell, yF = S.F * S.fh, span = { front: S.W, back: S.W, left: S.D, right: S.D }, tag = `${label} ${bp.id} (${bp.lot.kind})`;
    const rm = makeRoofModel({ S, bp });
    const wallTop = (r) => (r.side === 'front' ? Math.min(...[r.u0, (r.u0 + r.u1) / 2, r.u1].map((u) => rm.wallTop({ dir: 'x', at: S.D / 2 }, u))) : yF);
    const limit = S.openTop ? (S.F - 1) * S.fh + PRETIL_H : Infinity;                                   // the open top deck of an unfinished house has only a low parapet
    const marks = marksOf(bp), fixtures = bp.facade.filter((r) => !isWeather(r) && r.side !== 'roof');
    for (const r of marks) {
      const at = `${tag}: ${r.kind} ${r.side} u${r.u0}..${r.u1} y${r.y0}..${r.y1}`;
      if (r.u0 < -span[r.side] / 2 - 1e-3 || r.u1 > span[r.side] / 2 + 1e-3) problems.push(`${at} outside the ${span[r.side]} m wall`);
      if (r.y0 < -1e-3 || r.y1 > Math.min(wallTop(r), limit) + 1e-3) problems.push(`${at} above the top of the wall (${Math.min(wallTop(r), limit).toFixed(2)})`);
      if (r.u1 - r.u0 < 0.05 || r.y1 - r.y0 < 0.05) problems.push(`${at} degenerate`);
      if (r.out !== 0.008) problems.push(`${at} stands ${r.out} m off the wall, not 0.008`);
      const o = openings(bp, r.side).find((q) => hit(r, q));
      if (o) problems.push(`${at} covers ${o.kind} ${o.id}`);
      const f = fixtures.find((q) => q.side === r.side && hit(r, q));
      if (f) problems.push(`${at} covers the ${f.kind} u${f.u0}..${f.u1} y${f.y0}..${f.y1}`);
    }
    const hard = marks.filter((r) => HARD.includes(r.kind));
    for (let i = 0; i < hard.length; i++) for (let j = i + 1; j < hard.length; j++) if (hard[i].side === hard[j].side && hit(hard[i], hard[j])) problems.push(`${tag}: ${hard[i].kind} and ${hard[j].kind} lie on each other on the ${hard[i].side}`);
  }
  assert.deepEqual(problems, []);
});

test('the marks are real quads: one non-casting wall_decal mesh a building, every vertex 8 mm off the outer wall plane and facing out, one quad for each mark', () => {
  const problems = [];
  for (const [label, ctx, bps] of SETS) for (const bp of bps) {
    const tag = `${label} ${bp.id}`, ms = ctx.batch.groups.get(bp.id + '.ext').meshes.filter((m) => m.userData.matKey === 'wall_decal'), n = marksOf(bp).length;
    if (ms.length !== 1) { problems.push(`${tag}: ${ms.length} decal meshes, want one`); continue; }
    const m = ms[0], pos = m.geometry.attributes.position, nor = m.geometry.attributes.normal, S = bp.shell, c = bp.frame.toWorld(0, 0, 0);
    if (m.castShadow) problems.push(`${tag}: the decals cast shadows (a shadow pass has no alpha: each quad would be a solid rectangle)`);
    if (pos.count !== 4 * n) problems.push(`${tag}: ${pos.count / 4} quads for ${n} marks`);
    for (let i = 0; i < pos.count; i++) {
      const [lx, , lz] = bp.frame.toLocal(pos.getX(i), pos.getY(i), pos.getZ(i));
      const off = Math.min(Math.abs(lz - (S.D / 2 + 0.008)), Math.abs(lx + S.W / 2 + 0.008), Math.abs(lx - S.W / 2 - 0.008));
      if (off > 1e-3) { problems.push(`${tag}: a decal vertex lies ${off.toFixed(3)} m from every wall plane`); break; }
      if ((pos.getX(i) - c[0]) * nor.getX(i) + (pos.getZ(i) - c[2]) * nor.getZ(i) <= 0) { problems.push(`${tag}: a decal faces into the building`); break; }
    }
  }
  assert.deepEqual(problems, []);
});

// ---- the planner alone: the lot's seed ------------------------------------------------------------------------------------------------------------
/** A bare W x D shell for the planner (nothing else on its walls): one ground-floor window, a door or a shutter, two windows a floor, one on each free side wall. */
function stubFacade(id, { W = 6, D = 10, F = 2, shop = false, brick = false, party = {}, edge = false, food = false, narrow = false } = {}) {
  const fh = 2.8, S = { fh, F, W, D, party: { left: false, right: false, back: false, ...party }, openTop: false }, windows = [], doors = [];
  const ex = W / 2 - 0.65;                                                                  // `edge`: every window hugs an end of the wall; `narrow`: the ground one is a 0.6 m louvre right at the end
  windows.push({ id: `${id}.w0`, side: 'front', x: narrow ? -(W / 2 - 0.35) : edge ? -ex : shop ? 2 : -1.6, z: D / 2, y: 0.95, w: narrow ? 0.6 : 1.1, h: 1.3, floor: 0 });
  for (let f = 1; f < F; f++) for (const [k, x] of [[0, edge ? -ex : -W / 4], [1, edge ? ex : W / 4]]) windows.push({ id: `${id}.w${f}${k}`, side: 'front', x, z: D / 2, y: 0.9, w: 1.1, h: 1.3, floor: f });
  for (const side of ['left', 'right']) windows.push({ id: `${id}.s${side}`, side, x: side === 'left' ? -W / 2 : W / 2, z: 0, y: 0.9, w: 1.0, h: 1.2, floor: 1 });
  const door = shop ? { id: `${id}.d0`, ext: true, side: 'front', x: -0.7, z: D / 2, w: 1.8, h: 2.4, floor: 0, kind: 'shutter' } : { id: `${id}.d0`, ext: true, side: 'front', x: 1.3, z: D / 2, w: 1, h: 2.1, floor: 0, kind: 'door' };
  doors.push(door);
  const span = { front: W, back: W, left: D, right: D };
  const G = { S, bp: { id, windows, doors, shell: S, shopfront: shop ? { style: 'steel' } : null }, fs: { brick, m: 'plaster_a', wall: [0.7, 0.6, 0.5] }, recs: [], balc: [], lot: { shop: food ? 'panaderia' : shop ? 'tienda' : undefined }, FR: Object.fromEntries(Object.entries(span).map(([k, v]) => [k, { span: v }])) };
  return { G, kit: { inst: false, kind: brick ? 'unfinished' : 'house', shops: shop || food, shopDoor: shop ? door : null, pilasters: false, limitAt: () => F * fh - 0.08 }, top: F * fh - 0.08 };
}

test('weathering follows the seed of the lot: one id always wears the same marks, two dozen ids wear different ones, and every seed keeps to the rules of the skin', () => {
  const sig = (m) => m.map((q) => `${q.kind}${q.variant}${q.side}@${q.u0.toFixed(2)},${q.y0.toFixed(2)}${q.flip ? 'f' : ''}`).join(' ');
  const problems = [];
  for (const [name, o] of [['house', {}], ['shophouse', { shop: true }], ['brick', { brick: true, F: 3 }], ['terrace', { party: { left: true, right: true }, W: 4.5 }], ['tower', { F: 5, W: 7 }],
    ['edge', { edge: true, F: 3 }], ['bakery-edge', { edge: true, food: true, W: 5 }], ['bakery-louvre', { narrow: true, food: true, W: 5, F: 3 }]]) {
    const sigs = new Set(), counts = new Set();
    for (let i = 0; i < 24; i++) {
      const id = `Z${i}`, { G, kit, top } = stubFacade(id, o), marks = planWeather(G, kit);
      const again = stubFacade(id, o);
      if (sig(planWeather(again.G, again.kit)) !== sig(marks)) problems.push(`${name} ${id}: the same id wears different marks twice`);
      sigs.add(sig(marks)); counts.add(marks.length);
      const kinds = new Set(marks.filter((m) => m.side === 'front').map((m) => m.kind));
      if (kinds.size < 3) problems.push(`${name} ${id}: only ${[...kinds]} on the front`);
      for (const m of marks) {
        const at = `${name} ${id}: ${m.kind} ${m.side} u${m.u0.toFixed(2)}..${m.u1.toFixed(2)} y${m.y0.toFixed(2)}..${m.y1.toFixed(2)}`, half = G.FR[m.side].span / 2;
        if (m.side !== 'front' && G.S.party[m.side]) problems.push(`${at} on a party wall`);
        if (m.u0 < -half || m.u1 > half || m.y0 < 0 || m.y1 > top + 1e-9) problems.push(`${at} off its wall (top ${top.toFixed(2)})`);
        const q = openings(G.bp, m.side).find((x) => hit(m, x));
        if (q) problems.push(`${at} covers ${q.kind} ${q.id}`);
      }
    }
    if (sigs.size < 16) problems.push(`${name}: 24 seeds gave only ${sigs.size} different sets of marks`);
    if (counts.size < 3) problems.push(`${name}: the number of marks never varies (${[...counts]}): every lot is as old as the next`);
  }
  assert.deepEqual(problems, []);
});

// ---- the atlas ------------------------------------------------------------------------------------------------------------------------------------
/** What `createImageData(w, h)` gives (a painter that writes pixels, like the peeling one, fills this and hands it to `putImageData`, which the recording stand-ins log). */
const imageData = (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
/** A recording stand-in for the 2D context: every call is a no-op that is logged, except what `bad(method, args)` says should throw. Returns { g, log }. */
function fakeG(bad = () => false) {
  const log = [];
  const g = new Proxy({}, {
    get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'createImageData' ? imageData : k === 'getTransform' ? () => ({ e: 0, f: 0 })
      : (...a) => { log.push([k, a]); if (bad(k, a)) throw new Error('boom'); }),
    set: () => true,
  });
  return { g, log };
}
const withCanvas = (g, fn) => {
  const canvas = { width: 0, height: 0, getContext: () => g }, heard = [], warn = console.warn, error = console.error;
  globalThis.document = { createElement: () => canvas };
  console.warn = (...a) => heard.push(['warn', ...a]); console.error = (...a) => heard.push(['error', ...a]);
  try { return { out: fn(), heard, canvas }; } finally { console.warn = warn; console.error = error; delete globalThis.document; }
};

test('the decal atlas paints every item (each painter draws something) at its own size, inside a 2048 sheet, with rects that never touch', () => {
  const { g, log } = fakeG();
  const { out: atlas, heard } = withCanvas(g, () => paintDecalAtlas());
  assert.deepEqual(heard, [], 'no console output');
  const want = Object.entries(ITEMS).flatMap(([k, d]) => Array.from({ length: d.n }, (_, i) => `${k}:${i}`));
  assert.deepEqual(Object.keys(atlas.uv).sort(), want.sort(), 'one rect for every variant');
  assert.deepEqual(atlas.failed, []);
  const [W, H] = atlas.size;
  assert.ok(W <= 2048 && H <= 2048, `atlas ${W} x ${H}`);
  const px = (k) => { const [u0, v0, u1, v1] = atlas.uv[k]; return { x0: u0 * W, x1: u1 * W, y0: (1 - v1) * H, y1: (1 - v0) * H }; };
  for (const k of want) {
    const r = px(k), d = ITEMS[k.split(':')[0]];
    assert.ok(r.x0 >= 0 && r.y0 >= 0 && r.x1 <= W + 1e-6 && r.y1 <= H + 1e-6, `${k} outside the sheet`);
    assert.ok(Math.abs(r.x1 - r.x0 - d.w) < 1e-6 && Math.abs(r.y1 - r.y0 - d.h) < 1e-6, `${k} is ${r.x1 - r.x0} x ${r.y1 - r.y0}, not ${d.w} x ${d.h}`);
  }
  for (let i = 0; i < want.length; i++) for (let j = i + 1; j < want.length; j++) {
    const a = px(want[i]), b = px(want[j]);
    assert.ok(a.x1 + 2 <= b.x0 || b.x1 + 2 <= a.x0 || a.y1 + 2 <= b.y0 || b.y1 + 2 <= a.y0, `${want[i]} touches ${want[j]}`);
  }
  // each painter ran inside its own clip and drew: split the log at the clip that the atlas itself sets (`rect` then `clip` then `translate`; a painter may clip to its own shapes)
  const draws = new Set(['fill', 'stroke', 'fillRect', 'fillText', 'strokeText', 'putImageData']), per = [];
  log.forEach(([m], k) => { if (m === 'clip' && log[k - 1]?.[0] === 'rect' && log[k + 1]?.[0] === 'translate') per.push(0); else if (draws.has(m) && per.length) per[per.length - 1]++; });
  assert.equal(per.length, want.length, 'one clip a painter');
  assert.ok(per.every((n) => n > 0), `a painter drew nothing: ${per.map((n, i) => (n ? '' : want.slice().sort((a, b) => ITEMS[b.split(':')[0]].h - ITEMS[a.split(':')[0]].h)[i])).filter(Boolean)}`);
});

test('a decal painter that throws leaves the atlas standing, writes nothing to the console, and is reported through ctx.errors; without a canvas there is no atlas and no material', () => {
  const { g } = fakeG((m, a) => m === 'strokeText' && a[0] === 'LOBO');                      // the first graffiti tag
  const ctx = { matlib: { cache: new Map() } };
  const { heard } = withCanvas(g, () => ensureDecalAtlas(ctx));
  assert.ok(ctx.decalAtlas, 'the atlas is still painted and published');
  assert.ok(ctx.matlib.cache.has('wall_decal'), 'the shared material is seeded');
  assert.deepEqual(ctx.decalAtlas.failed.map((f) => f.key), ['tag:0'], 'exactly the throwing painter is listed');
  assert.deepEqual(heard, [], 'a console warning or error is a hard cap: report through ctx.errors instead');
  assert.deepEqual((ctx.errors ?? []).map((e) => e.stage + ' ' + e.message), ['arch decal painter tag:0: boom']);
  const node = { matlib: { cache: new Map() } };
  assert.equal(paintDecalAtlas(), null);
  assert.equal(ensureDecalAtlas(node), null);
  assert.equal(node.decalAtlas, null);
  assert.equal(node.matlib.cache.size, 0);
});

// ---- the bills ------------------------------------------------------------------------------------------------------------------------------------
const NEAR = 12;
const near = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) < (a.w + b.w) / 2 + NEAR;

test('bills: sixteen designs, each lot gets as many as it wants (all different), the same on every run whatever order the lots come in', () => {
  assert.ok(POSTER_COUNT >= 16, `${POSTER_COUNT} poster designs`);
  const lots = real.ctx.plan.lots, sets = assignPosters(lots), rev = assignPosters([...lots].reverse());
  for (const l of lots) {
    const s = sets.get(l.id);
    assert.equal(s.length, posterCount(l), `${l.id} (${l.kind}) wants ${posterCount(l)} bills`);
    assert.equal(new Set(s).size, s.length, `${l.id}: the same bill twice ${s}`);
    assert.ok(s.every((p) => Number.isInteger(p) && p >= 0 && p < POSTER_COUNT), `${l.id}: bad index in ${s}`);
    assert.deepEqual(rev.get(l.id), s, `${l.id}: the picks depend on the order of the lots`);
  }
  assert.ok(lots.some((l) => posterCount(l) === 3) && lots.some((l) => posterCount(l) === 0), 'a spread of one to three, some none');
});

test('bills: no two lots in sight of each other share one, no street is taken over by one design, and every design is used', () => {
  const lots = real.ctx.plan.lots, sets = assignPosters(lots), shared = [];
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    if (!near(lots[i], lots[j])) continue;
    const c = sets.get(lots[i].id).filter((p) => sets.get(lots[j].id).includes(p));
    if (c.length) shared.push(`${lots[i].id}~${lots[j].id}: ${c}`);
  }
  assert.deepEqual(shared, [], 'neighbours (footprints within 12 m) pasted with the same bill');
  const streets = new Map(), total = new Array(POSTER_COUNT).fill(0);
  for (const l of lots) for (const p of sets.get(l.id)) { const k = String(l.front), per = streets.get(k) ?? new Array(POSTER_COUNT).fill(0); per[p]++; streets.set(k, per); total[p]++; }
  for (const [k, per] of streets) {
    const n = per.reduce((a, b) => a + b, 0);
    if (n >= 10) assert.ok(Math.max(...per) <= Math.ceil(n / POSTER_COUNT) + 1, `street ${k}: one design on ${Math.max(...per)} of its ${n} bills (sixteen designs: an even spread is ${Math.ceil(n / POSTER_COUNT)})`);
  }
  assert.deepEqual(total.map((n, p) => (n >= 3 ? null : `${p}:${n}`)).filter(Boolean), [], 'a design used fewer than three times on the real barrio');
});

test('bills: the ones on the walls are the ones the lot was given, and most of the assigned bills really get pasted up', () => {
  const sets = assignPosters(real.ctx.plan.lots), problems = [];
  let drawn = 0, assigned = 0;
  for (const bp of real.buildings) {
    const set = sets.get(bp.id) ?? [], posters = bp.facade.filter((r) => r.kind === 'poster');
    assigned += set.length; drawn += posters.length;
    if (posters.length > set.length) problems.push(`${bp.id}: ${posters.length} bills for a set of ${set.length}`);
    for (const r of posters) if (!set.includes(r.index)) problems.push(`${bp.id}: poster ${r.index} is not in its set ${set}`);
  }
  assert.deepEqual(problems, []);
  assert.ok(drawn >= 0.75 * assigned, `only ${drawn} of ${assigned} assigned bills are on a wall (a narrow shopfront is all door and shutter: the rest belong on a side wall)`);
});

test('bills: no blank poster anywhere: every design is printed with lettering or art, the sign atlas paints and has a rect for every one, and every bill a lot was given is one of them', () => {
  const problems = [], printed = [];
  for (let i = 0; i < POSTER_COUNT; i++) {
    const L = recG(); paintPoster(L.g, 128, 180, i);
    const inks = new Set(L.sets.filter(([k, v]) => k === 'fillStyle' && typeof v === 'string').map(([, v]) => v));
    const texts = L.log.filter(([m]) => m === 'fillText').length, shapes = L.log.filter(([m]) => m === 'fill' || m === 'fillRect' || m === 'stroke').length;
    printed.push(inks.size >= 3 && (texts >= 2 || shapes >= 8));
    if (inks.size < 3) problems.push(`poster ${i} is printed in only ${inks.size} colours: a blank sheet`);
    if (texts < 2 && shapes < 8) problems.push(`poster ${i} has ${texts} lines of lettering and ${shapes} shapes: a blank sheet`);
  }
  const lots = real.ctx.plan.lots, { g } = recG();
  const { out: atlas, heard } = withCanvas(g, () => paintSignAtlas(lots));
  assert.deepEqual(heard, [], 'no console output');
  assert.deepEqual(atlas.failed, [], 'a sign or poster painter threw: its board stays blank');
  for (let i = 0; i < POSTER_COUNT; i++) if (!atlas.uv[`poster:${i}`]) problems.push(`the sign atlas has no rect for poster ${i}`);
  const sets = assignPosters(lots);
  for (const l of lots) for (const p of sets.get(l.id)) if (!printed[p]) problems.push(`${l.id} is given poster ${p}, which is not a printed design`);
  for (const bp of real.buildings) for (const r of bp.facade.filter((q) => q.kind === 'poster')) if (!printed[r.index] || !atlas.uv[`poster:${r.index}`]) problems.push(`${bp.id}: the poster on its ${r.side} wall (${r.index}) is blank or has no atlas rect`);
  assert.deepEqual(problems, []);
});

// ---- not stickers (review R1-D05): rising damp, peeling, mends ---------------------------------------------------------------------------------------
/** The same recording stand-in as `fakeG`, but it also keeps what was assigned to the properties and every gradient colour stop: { g, log: [method, args][], sets: [property, value][], stops: [colour][] }. */
function recG() {
  const log = [], sets = [], stops = [];
  const g = new Proxy({}, {
    get: (_, k) => (k === 'measureText' ? () => ({ width: 100 }) : k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop: (_o, c) => stops.push(c) }) : k === 'createImageData' ? imageData : k === 'getTransform' ? () => ({ e: 0, f: 0 }) : (...a) => { log.push([k, a]); }),
    set: (_, k, v) => { sets.push([k, v]); return true; },
  });
  return { g, log, sets, stops };
}
const lcg = (s) => () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const rgbaOf = (s) => { const m = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(String(s)); return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null; };
const runPainter = (kind, i) => { const L = recG(); PAINTERS[kind](L.g, ITEMS[kind].w, ITEMS[kind].h, i, lcg(777 + 31 * i)); return L; };
const pale = (c) => c && c.r >= 200 && c.g >= 200 && c.b >= 200;

test('no stickers: damp is only ever darkening (no pale line or speck anywhere in it), nothing is outlined in white, a mend is never turned on the wall, and zinc and boards carry nails and a shadow', () => {
  const problems = [];
  for (let i = 0; i < ITEMS.damp.n; i++) {                                            // rising damp: every colour it uses is dark (a pale stroke above the wet was the tide line of the stickers)
    const L = runPainter('damp', i);
    for (const c of [...L.stops, ...L.sets.filter(([k, v]) => (k === 'fillStyle' || k === 'strokeStyle') && typeof v === 'string').map(([, v]) => v)]) {
      const q = rgbaOf(c);
      if (!q) problems.push(`damp:${i} uses a colour that is not rgba(): ${c}`); else if (Math.max(q.r, q.g, q.b) > 120) problems.push(`damp:${i} paints with a light colour ${c}`);
    }
  }
  for (const kind of ['damp', 'peel', 'patch', 'efflor']) for (let i = 0; i < ITEMS[kind].n; i++) {
    const L = runPainter(kind, i);
    for (const [k, v] of L.sets) if (k === 'strokeStyle' && pale(rgbaOf(v)) && rgbaOf(v).a >= 0.2) problems.push(`${kind}:${i} strokes a pale line ${v}`);
    if (kind === 'patch' && L.log.some(([m]) => m === 'rotate')) problems.push(`patch:${i} is drawn turned: a strip floating on the wall`);
  }
  for (const i of [2, 3]) {                                                            // the mends that stand off the wall: a contact shadow and nails
    const L = runPainter('patch', i), blur = Math.max(0, ...L.sets.filter(([k]) => k === 'shadowBlur').map(([, v]) => v)), nails = L.log.filter(([m]) => m === 'arc').length;
    if (blur < 3) problems.push(`patch:${i} casts no shadow (blur ${blur})`);
    if (nails < 4) problems.push(`patch:${i} shows ${nails} nails`);
  }
  assert.deepEqual(problems, []);
});

/** The picture a painter handed to `putImageData` (one is expected): { width, height, data } or null. */
const pictureOf = (L) => { const put = L.log.filter(([m]) => m === 'putImageData'); return put.length === 1 ? put[0][1][0] : null; };

test('no stickers (R1-D22): peeling is torn out of noise, never drawn: no outline, no colour of its own, no pale fleck, the wall comes through the old coat, and the edge is ragged, not round', () => {
  const problems = [];
  for (let i = 0; i < ITEMS.peel.n; i++) {
    const L = runPainter('peel', i), pic = pictureOf(L);
    if (!pic) { problems.push(`peel:${i} does not write one picture`); continue; }
    const strokes = L.sets.filter(([k, v]) => k === 'strokeStyle' && typeof v === 'string').length;
    if (strokes) problems.push(`peel:${i} strokes ${strokes} coloured lines: an outline (only the runs of water, which are gradients, may be stroked)`);
    const { width: w, height: h, data } = pic, mask = new Uint8Array(w * h);
    let firm = 0, thin = 0, solid = 0, tinted = 0, pale = 0;
    for (let k = 0; k < w * h; k++) {
      const a = data[4 * k + 3] / 255, r = data[4 * k], g = data[4 * k + 1], b = data[4 * k + 2];
      if (a < 0.2) continue;
      mask[k] = 1; firm++;
      if (a <= 0.75) thin++;
      if (a >= 0.9) solid++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 60) tinted++;                       // a colour of its own: yellow, green, blue, pink (a sticker on any wall that is not that colour)
      if (a >= 0.3 && Math.min(r, g, b) >= 200) pale++;                               // a pale rim or fleck
    }
    if (firm < 0.1 * w * h) problems.push(`peel:${i} marks only ${firm} of its ${w * h} pixels`);
    if (tinted) problems.push(`peel:${i}: ${tinted} pixels with a colour of their own`);
    if (pale) problems.push(`peel:${i}: ${pale} pale pixels`);
    if (thin < 0.4 * firm) problems.push(`peel:${i}: only ${(100 * thin / firm).toFixed(0)}% of it lets the wall through (an old coat a third to a half as strong as paint is most of it)`);
    if (solid > 0.3 * firm) problems.push(`peel:${i}: ${(100 * solid / firm).toFixed(0)}% of it is opaque`);
    let edges = 0;                                                                     // unit edges between the marked and the unmarked, over the circumference of a circle of the same area: a clean disc scores 1.3, a torn patch 2.2 and more
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (mask[y * w + x]) edges += (x === 0 || !mask[y * w + x - 1]) + (x === w - 1 || !mask[y * w + x + 1]) + (y === 0 || !mask[(y - 1) * w + x]) + (y === h - 1 || !mask[(y + 1) * w + x]);
    const torn = edges / (2 * Math.sqrt(Math.PI * firm));
    if (torn < 2.2) problems.push(`peel:${i}: an edge scoring ${torn.toFixed(2)}, want a torn one (2.2 and more; a clean disc scores 1.3)`);
  }
  assert.deepEqual(problems, []);
});

test('no stickers: a render patch and a roller patch take the wall\'s own colour a shade off, never a second palette; zinc and boards carry their own; the planner uses all four', () => {
  const problems = [], dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  for (const w of [[0.7, 0.6, 0.5], [0.05, 0.12, 0.45], [0.8, 0.1, 0.2], [0.02, 0.4, 0.3], [0.9, 0.85, 0.7]]) {
    for (const v of [0, 1]) {                                                          // a shade off: visibly not the wall (8%) and nowhere near another colour (60% of its size)
      const t = patchTint(v, w), rel = dist(t, w) / Math.hypot(...w);
      if (!(rel > 0.08 && rel < 0.6)) problems.push(`patch ${v} on ${w}: tint ${t.map((x) => x.toFixed(2))} is ${(100 * rel).toFixed(0)}% of the wall's colour away from it`);
    }
    for (const v of [2, 3]) if (patchTint(v, w) !== null) problems.push(`patch ${v} should carry its own colours`);
  }
  const seen = new Set();
  for (let n = 0; n < 60; n++) {
    const { G, kit } = stubFacade(`M${n}`, { F: 3, W: 7 });
    for (const m of planWeather(G, kit)) if (m.kind === 'patch') {
      seen.add(m.variant);
      const want = patchTint(m.variant, G.fs.wall);
      if (want === null ? m.tint !== null : !m.tint || dist(m.tint, want) > 1e-9) problems.push(`M${n}: patch ${m.variant} is tinted ${m.tint}, want ${want}`);
      if (m.flip) problems.push(`M${n}: a patch is mirrored (its shadow would fall the wrong way)`);
    }
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3], 'sixty seeds use every kind of mend');
  assert.deepEqual(problems, []);
});

// ---- rising damp climbs to its own height on every wall ---------------------------------------------------------------------------------------------
const clearOf = (a, b) => Math.hypot(a.x - b.x, a.z - b.z) - (a.w + b.w) / 2;                          // the clear distance between two footprints (as assignDampLevels measures it)
const wetTop = (bp, side = 'front') => { const d = marksOf(bp).filter((r) => r.side === side && (r.kind === 'damp' || r.kind === 'efflor')); return d.length ? Math.max(...d.map((r) => r.y1)) : null; };

test('rising damp: every lot has a level (the same whatever order the lots come in), no two neighbours share one, and the whole range is used', () => {
  const lots = real.ctx.plan.lots, lv = assignDampLevels(lots), rev = assignDampLevels([...lots].reverse()), problems = [];
  for (const l of lots) {
    if (!DAMP_LEVELS.includes(lv.get(l.id))) problems.push(`${l.id}: level ${lv.get(l.id)} is not one of ${DAMP_LEVELS}`);
    if (rev.get(l.id) !== lv.get(l.id)) problems.push(`${l.id}: the level depends on the order of the lots`);
  }
  let pairs = 0;
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) if (clearOf(lots[i], lots[j]) < 1.5) {
    pairs++;
    const d = Math.abs(lv.get(lots[i].id) - lv.get(lots[j].id));
    if (d < 0.1) problems.push(`${lots[i].id}~${lots[j].id} (side by side) wear levels ${lv.get(lots[i].id)} and ${lv.get(lots[j].id)}`);
  }
  assert.ok(pairs >= 40, `${pairs} pairs of neighbours: the plan changed, the test no longer looks at a street`);
  assert.ok(new Set([...lv.values()]).size >= 7, `only ${new Set([...lv.values()]).size} of ${DAMP_LEVELS.length} levels used`);
  assert.deepEqual(problems, []);
});

test('rising damp, on the walls: no two fronts side by side wet to the same height, the heights are many, and a side wall climbs to another height than the front', () => {
  const lots = real.ctx.plan.lots, byId = new Map(real.buildings.map((b) => [b.id, b])), problems = [];
  let compared = 0;
  for (let i = 0; i < lots.length; i++) for (let j = i + 1; j < lots.length; j++) {
    if (clearOf(lots[i], lots[j]) >= 1.5) continue;
    const a = wetTop(byId.get(lots[i].id)), b = wetTop(byId.get(lots[j].id));
    if (a === null || b === null) continue;
    compared++;
    if (Math.abs(a - b) < 0.08) problems.push(`${lots[i].id}~${lots[j].id}: the damp stops at ${a.toFixed(2)} and ${b.toFixed(2)}`);
  }
  assert.ok(compared >= 15, `${compared} neighbouring fronts that both have damp or salts: too few to test`);
  const tops = real.buildings.map((b) => wetTop(b)).filter((v) => v !== null);
  assert.ok(new Set(tops.map((v) => Math.round(v / 0.03))).size >= 12, `${tops.length} wet fronts reach only ${new Set(tops.map((v) => Math.round(v / 0.03))).size} different heights (to 3 cm)`);
  let sides = 0, other = 0;
  for (const b of real.buildings) for (const s of ['left', 'right']) { const f = wetTop(b), t = wetTop(b, s); if (f !== null && t !== null) { sides++; if (Math.abs(f - t) >= 0.05) other++; } }
  assert.ok(sides >= 20 && other >= 0.8 * sides, `${other} of ${sides} side walls with damp climb to a different height than the front (want 80%)`);
  assert.deepEqual(problems, []);
});
