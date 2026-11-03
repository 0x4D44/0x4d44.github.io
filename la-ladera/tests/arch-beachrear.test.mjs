// The south row's back to the promenade (A5, round 7, dev/FEATURE-BEACH.md 1.3). The seven lots whose rear wall stands at the plot's south edge (L11-L15, L50, L51: a workshop, a house, a cornerstore, three
// shophouses and a second cornerstore, all turned with their backs to the sea) used to end in a blank wall at the top of the sea wall's gate. With the beach live they face a promenade: the cafe (L12, L50) and the
// restaurant (L14) get a service door in their storeroom's back wall, with steps down to the deck and a canvas cover over it, and every one of the seven gets a dressed rear (a board, planters, a faded advert on a house).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-beachrear.test.mjs
// What this pins, and the rest of the barrio's promise: NOTHING ELSE MOVES. Every lot of the barrio is planned and built three ways (the old south row: `?skip=coast`; a Node build that did not ask for the coast;
// the live beach: `coast: true`) and hashed (the plan, the facade records, every mesh it drew): the first two are the same for all lots, and the third differs from them in the seven and in no other. The one thing
// left out of the hash is the third colour channel of the lit panes (a room's slot in the global room-look table, `arch/mb.js` roomSlot: numbered in build order, so the storeroom's dropped louvre moves every
// later lot's numbers by one); the test says so, and proves that it is the only thing that differs (every lot after L15 differs in no mesh but a lit pane's slot).
// Every check has a deliberately broken input selected by BR_SABOTAGE=<id>|all, and each must then FAIL:
//   census    an unflagged lot is rebuilt from another seed in the live build     plain     the Node build is made with the coast, not without it       table     the rule's table expects what it should not
//   doorfirst the promenade door is made first (the id of a door the layout makes)  hinge     its hinge is not the given one (it was drawn from a stream)  nosteps   its steps are gone
//   keepclear a window is cut in the back wall at the door                          extra     a door is made on a lot that should have none                unlit     the lit panes' slot is read as geometry (the census must see it)
//   cover     a back window stands under the board                                  steps     a planter stands on the steps                                leak      a front record of a flagged lot moves
//   random    the second build is made from another seed                            wall      a record sticks out of the wall's span
import test from 'node:test';
import assert from 'node:assert/strict';
import { createContext } from '../js/core/ctx.js';
import { generatePlan } from '../js/world/plan.js';
import { planBuilding, buildBuilding } from '../js/arch/index.js';
import { beachSide } from '../js/arch/layouthelp.js';
import { coastLive, Z0 } from '../js/world/coast.js';

const SAB = process.env.BR_SABOTAGE ?? '';
const on = (...ids) => ids.some((id) => SAB === 'all' || SAB === id);
const SEED = 20261029;
const PROMENADE = ['L11', 'L12', 'L13', 'L14', 'L15', 'L50', 'L51'], DOORS = ['L12', 'L14', 'L50'];
const f2 = (v) => +(+v).toFixed(2);
const j = (x) => JSON.stringify(x);

// ---- the three builds -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const fnv = (arr, h = 0x811c9dc5) => { const u = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength); for (let i = 0; i < u.length; i++) { h ^= u[i]; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
/** One mesh as text: its material, its vertex count and a hash of its positions, colours and uvs. A lit pane's third colour channel is a room slot (numbered in build order): `raw` keeps it, the census does not. */
function meshSig(m, raw) {
  const g = m.geometry, p = g.attributes.position, c = g.attributes.color, uv = g.attributes.uv, key = m.userData?.matKey ?? m.material?.name ?? '?';
  let h = fnv(p.array);
  if (c) h = fnv(!raw && !on('unlit') && key === 'window_lit' && c.itemSize === 3 ? Float32Array.from(c.array, (v, i) => (i % 3 === 2 ? 0 : v)) : c.array, h);
  if (uv) h = fnv(uv.array, h);
  return `${key}:${p.count}:${h.toString(16)}`;
}

/** Every lot of the barrio planned and built under `opts`: { plan, facade, geo (without the lit panes' slot), raw (with it) } as text, and the plan itself. `tweak(lot)` runs before a lot is planned. */
function build(opts, { seed = SEED, tweak } = {}) {
  const ctx = createContext({ seed, headless: true, ...opts });
  ctx.plan = generatePlan(ctx);
  const flush = ctx.batch.flush.bind(ctx.batch), geo = new Map(), raw = new Map(); let cur = null;
  ctx.batch.flush = (tag) => { const ms = flush(tag); for (const [mp, raws] of [[geo, false], [raw, true]]) mp.set(cur, [...(mp.get(cur) ?? []), ...ms.map((m) => meshSig(m, raws))].sort()); return ms; };
  const lots = new Map();
  for (const lot of ctx.plan.lots) {
    cur = lot.id; tweak?.(lot);
    const bp = planBuilding(ctx, lot);
    const plan = j({ rooms: bp.rooms, doors: bp.doors, windows: bp.windows, entrances: bp.entrances, steps: bp.shell.steps, colliders: bp.colliders, bounds: bp.bounds, floors: bp.floors, walls: bp.shell.walls });
    buildBuilding(ctx, bp);
    lots.set(lot.id, { bp, plan, facade: j(bp.facade), geo: j(geo.get(lot.id) ?? []), raw: j(raw.get(lot.id) ?? []) });
  }
  return { ctx, lots };
}
const differ = (A, B, keys = ['plan', 'facade', 'geo']) => [...A.lots.keys()].filter((id) => keys.some((k) => A.lots.get(id)[k] !== B.lots.get(id)[k])).sort();

const OLD = { skip: new Set(['coast']) };                                       // ?skip=coast: the south row as it was
const old = build(OLD);
const node = build(on('plain') ? { coast: true } : {});                         // a Node build that did not ask for the coast: the plot's own sweeps are the plot's
const live = build({ coast: true }, { tweak: on('census') ? (lot) => { if (lot.id === 'L30') lot.seed += 1; } : undefined });
const bpOf = (b, id) => b.lots.get(id).bp;

/** The checks' view of a lot of the live build: its plan records, copied, with the broken input the sabotage asks for. */
function view(id) {
  const bp = bpOf(live, id), v = { bp, doors: structuredClone(bp.doors), windows: structuredClone(bp.windows), entrances: structuredClone(bp.entrances), steps: structuredClone(bp.shell.steps), facade: structuredClone(bp.facade) };
  const alley = () => v.doors.find((d) => d.entrance === 'alley');
  if (on('doorfirst') && alley()) alley().id = alley().id.replace(/\d+$/, '2');
  if (on('hinge') && alley()) alley().hinge = 'left';
  if (on('nosteps') && alley()) v.steps = v.steps.filter((s) => s.door !== alley().id);
  if (on('keepclear') && alley()) v.windows.push({ id: 'X.w', side: 'back', floor: 0, x: alley().x + 0.5, w: 0.6, y: 1, h: 1 });
  if (on('extra') && id === 'L13') v.doors.push({ ...v.doors.find((d) => d.ext), id: 'L13.dX', entrance: 'alley', side: 'back' });
  if (on('cover') && id === 'L12') { const s = v.facade.find((r) => r.kind === 'sign' && r.rear); v.windows.push({ id: 'X.w', side: 'back', floor: 0, x: (s.u0 + s.u1) / 2, w: 0.5, y: s.y0 + 0.1, h: 0.4 }); }
  if (on('steps') && id === 'L14') { const s = v.steps.find((q) => q.door === alley()?.id), p = v.facade.find((r) => r.kind === 'planter'); if (s && p) s.rect = { ...s.rect, x0: p.u0, x1: p.u1, z0: -bp.shell.D / 2 - p.out, z1: -bp.shell.D / 2 - p.out + 0.4 }; }
  if (on('leak') && id === 'L15') { const r = v.facade.find((q) => q.side !== 'back'); r.u0 += 0.01; }
  if (on('wall') && id === 'L11') { const r = v.facade.find((q) => q.kind === 'planter'); r.u1 = bp.shell.W; }
  return v;
}

// ---- the census -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('with the beach live, the seven lots on the promenade change and no other lot of the barrio does: plan, facade records and every mesh are byte-identical to the old south row (lit-pane slot aside)', () => {
  assert.ok(old.lots.size >= 100 && old.lots.size === live.lots.size, `${old.lots.size} + ${live.lots.size} lots`);
  assert.deepEqual(differ(old, live), PROMENADE);
  for (const id of PROMENADE.filter((x) => !DOORS.includes(x))) assert.equal(old.lots.get(id).plan, live.lots.get(id).plan, `${id}: a lot with no door must keep its whole plan (rooms, doors, windows, entrances, steps, colliders, walls)`);
  assert.deepEqual(DOORS.filter((id) => old.lots.get(id).plan === live.lots.get(id).plan), [], 'a lot with a service door has a new plan');
  assert.deepEqual([...live.ctx.errors, ...old.ctx.errors].filter((e) => e.stage === 'arch'), [], 'arch errors');
});

test('the lit panes\' slot is the ONLY thing that moves in the lots after the south row: every mesh of every other lot is the same, bar the colour channel that numbers a lit room in build order', () => {
  const bad = [];
  for (const [id, a] of old.lots) {
    if (PROMENADE.includes(id) || a.raw === live.lots.get(id).raw) continue;
    const x = JSON.parse(a.raw), y = JSON.parse(live.lots.get(id).raw), only = (p, q) => p.filter((s) => !q.includes(s));
    for (const s of [...only(x, y), ...only(y, x)]) if (!s.startsWith('window_lit:')) bad.push(`${id}: ${s}`);
  }
  assert.deepEqual(bad, [], 'a mesh other than a lit pane differs');
});

test('a Node build that did not ask for the coast is the old south row, lot for lot: the gate is shut there, so no door opens onto it', () => {
  assert.deepEqual(differ(old, node), []);
  assert.deepEqual(differ(old, node, ['raw']), []);
});

test('the building the live beach builds twice is the same building', () => {
  const again = build({ coast: true }, { seed: on('random') ? SEED + 1 : SEED });
  assert.deepEqual(differ(live, again, ['plan', 'facade', 'raw']), []);
});

// ---- the rule -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the rule: a house, shophouse, cornerstore or workshop whose rear wall faces south within 3.2 m of the plot edge has its back to the promenade, and only a cafe or restaurant gets a door; no coast, no rule', () => {
  const lot = (o = {}) => ({ id: 'T', kind: 'house', rotY: Math.PI, z: Z0 - 1.9 - 3.5, d: 7, ...o });
  const PAGE = {}, SKIP = { skip: new Set(['coast']) }, NODE = { headless: true }, NODE_COAST = { headless: true, coast: true };
  const rows = [
    ['a house', lot(), PAGE, 'rear'], ['a workshop', lot({ kind: 'workshop', shop: 'taller' }), PAGE, 'rear'], ['a shophouse with a shop that is no cafe', lot({ kind: 'shophouse', shop: 'tienda' }), PAGE, 'rear'],
    ['a cornerstore cafe', lot({ kind: 'cornerstore', shop: 'cafe' }), PAGE, 'door'], ['a shophouse restaurant', lot({ kind: 'shophouse', shop: 'restaurante' }), PAGE, 'door'],
    ['a workshop that sells coffee: a trade, not a terrace', lot({ kind: 'workshop', shop: 'cafe' }), PAGE, 'rear'],
    ['a school', lot({ kind: 'school' }), PAGE, null], ['a tenement', lot({ kind: 'tenement' }), PAGE, null], ['a kiosk', lot({ kind: 'kiosk' }), PAGE, null], ['a clinic', lot({ kind: 'clinic' }), PAGE, null],
    ['a house facing north', lot({ rotY: 0 }), PAGE, null], ['a house facing east', lot({ rotY: Math.PI / 2 }), PAGE, null], ['a house turned the way L12 is (-3.14159)', lot({ rotY: -3.14159 }), PAGE, 'rear'],
    ['a rear wall 3.3 m short of the plot edge', lot({ z: Z0 - 3.3 - 3.5 }), PAGE, null], ['a rear wall 3.1 m short of it', lot({ z: Z0 - 3.1 - 3.5 }), PAGE, 'rear'], ['a rear wall on the edge', lot({ z: Z0 - 3.5 }), PAGE, 'rear'],
    ['a rear wall over the edge', lot({ z: Z0 + 0.1 - 3.5 }), PAGE, null],
    ['a cafe with ?skip=coast', lot({ kind: 'cornerstore', shop: 'cafe' }), SKIP, null], ['a cafe in a Node build with no coast', lot({ kind: 'cornerstore', shop: 'cafe' }), NODE, null],
    ['a cafe in a Node build with the coast', lot({ kind: 'cornerstore', shop: 'cafe' }), NODE_COAST, 'door'], ['a cafe, the coast asked for and skipped', lot({ kind: 'cornerstore', shop: 'cafe' }), { ...NODE_COAST, ...SKIP }, null],
  ];
  if (on('table')) rows[0][3] = null;
  const bad = rows.filter(([, l, opts, want]) => beachSide(l, { opts }) !== want).map(([what, , , want]) => `${what}: wanted ${want}`);
  assert.deepEqual(bad, []);
  assert.deepEqual([PAGE, SKIP, NODE, NODE_COAST].map(coastLive), [true, false, false, true], 'the one predicate the gate and the doors share');
  // and the barrio's own lots: exactly the seven, the doors on exactly the three
  const real = { opts: { coast: true, headless: true } }, flagged = (b) => [...b.lots.values()].map((x) => x.bp.lot).filter((l) => beachSide(l, real)).map((l) => l.id).sort();
  assert.deepEqual(flagged(live), PROMENADE);
  assert.deepEqual([...live.lots.values()].filter((x) => beachSide(x.bp.lot, real) === 'door').map((x) => x.bp.id).sort(), DOORS);
});

// ---- the door -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the service door of a promenade cafe or restaurant: made last, an alley entrance in the storeroom\'s back wall with its hinge given and a flight of steps down to the deck; every other door, entrance and step of the lot is as it was', () => {
  const seq = (d) => +d.id.split('.d')[1], strip = (d) => (d.roof ? { ...d, id: '*' } : d);
  for (const id of DOORS) {
    const a = bpOf(old, id), v = view(id), b = v.bp, alley = v.doors.filter((d) => d.entrance === 'alley');
    assert.equal(a.doors.filter((d) => d.entrance === 'alley').length, 0, `${id}: no alley door before`);
    assert.equal(alley.length, 1, `${id}: one promenade door`);
    const [d] = alley, rooms = d.rooms.filter(Boolean).map((r) => b.rooms.find((q) => q.id === r));
    assert.ok(d.ext && d.side === 'back' && d.floor === 0 && !d.roof && d.w === 1 && d.h === 2.1, `${id}: a 1.0 x 2.1 outside door in the back wall of the ground floor (${j({ ext: d.ext, side: d.side, floor: d.floor, w: d.w, h: d.h })})`);
    assert.equal(d.hinge, 'right', `${id}: the hinge is given, not drawn (a stream drawn here would move every window after it)`);
    assert.ok(rooms.some((r) => r.type === 'backroom'), `${id}: it is the storeroom's (${rooms.map((r) => r.type)})`);
    assert.ok(seq(d) > Math.max(...v.doors.filter((q) => q !== d && !q.roof).map(seq)), `${id}: made after every other door the layout makes (${d.id})`);
    assert.deepEqual(v.doors.filter((q) => q !== d).map(strip), a.doors.map(strip), `${id}: every other door of the lot is as it was (a roof door only moves along one id)`);
    // the entrances: the shop's and the main door's are the ones the people sim uses, and they keep their ids; the alley one comes after them
    const ents = v.entrances, ea = ents.find((e) => e.kind === 'alley');
    assert.deepEqual(ents.slice(0, 2), a.entrances.slice(0, 2), `${id}: the shop's and the main entrance are as they were`);
    assert.ok(ea && ea.doorId === d.id && ents.indexOf(ea) === 2 && ents.length === a.entrances.length + 1, `${id}: the alley entrance is the third of ${ents.length}`);
    const rear = b.lot.z + b.lot.d / 2;
    assert.ok(ea.outside[2] > rear && ea.outside[2] < Z0 + 0.5 && ea.inside[2] < rear, `${id}: it leads out to the promenade (outside z ${f2(ea.outside[2])}, the wall at ${f2(rear)}, the plot edge at ${Z0})`);
    assert.ok(ea.outside[1] < ea.inside[1] - 0.3 && ea.outside[1] > -0.5, `${id}: down to the deck, not a drop (${f2(ea.inside[1])} -> ${f2(ea.outside[1])})`);
    // the steps down to the deck: treads that step down the way the entrance faces and reach it
    const st = v.steps.filter((s) => s.door === d.id);
    assert.ok(st.length >= 2, `${id}: ${st.length} treads`);
    for (let i = 1; i < st.length; i++) assert.ok(st[i].y1 < st[i - 1].y1, `${id}: tread ${i} is not lower than the one before it`);
    assert.deepEqual(v.steps.filter((s) => s.door !== d.id), a.shell.steps, `${id}: the lot's other steps are as they were`);
    // no window within the door's keep-clear: a window beside a door is a hole in the wall's reveal (genWindows keeps 0.3 m clear of an outside door)
    const near = v.windows.filter((w) => w.side === 'back' && w.floor === 0 && Math.abs(w.x - d.x) < d.w / 2 + w.w / 2 + 0.3 - 1e-6);
    assert.deepEqual(near.map((w) => w.id), [], `${id}: a window in the door's keep-clear`);
    assert.ok(v.windows.length >= a.windows.length - 1 && v.windows.length <= a.windows.length, `${id}: windows ${a.windows.length} -> ${v.windows.length}: the storeroom's louvre goes where the door is, and no more`);
  }
  assert.deepEqual(PROMENADE.filter((id) => view(id).doors.some((d) => d.entrance === 'alley')), DOORS, 'a door on a lot that is only dressed, or none on a cafe');
});

// ---- the dressing -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('the rear walls are dressed and nothing the dressing puts up covers an opening, hangs below the ground it stands on or leaves the wall: a cover over the door, a board on each, planters, a faded advert on the house', () => {
  const MARK = new Set(['damp', 'streak', 'stain', 'peel', 'patch', 'crack', 'tag']);              // the weather's marks keep clear of what is put up first (and are put up after the dressing)
  const rect = (r) => ({ a: r.u0, b: r.u1, c: r.y0, d: r.y1 }), hit = (p, q, m = 0) => p.a < q.b + m && p.b > q.a - m && p.c < q.d + m && p.d > q.c - m;
  for (const id of PROMENADE) {
    const v = view(id), S = v.bp.shell, back = v.facade.filter((r) => r.side === 'back'), mine = back.filter((r) => r.rear);
    const door = v.doors.find((d) => d.entrance === 'alley'), kinds = (k) => mine.filter((r) => r.kind === k);
    assert.ok(kinds('planter').length >= 2, `${id}: ${kinds('planter').length} planters`);
    assert.ok(kinds('sign').length + kinds('ghost').length >= 1, `${id}: nothing on the wall (a board, or an advert on a house)`);
    assert.equal(kinds('terrace').length, door ? 1 : 0, `${id}: ${kinds('terrace').length} covers`);
    for (const r of mine) {
      assert.ok(r.y0 >= -0.01 && r.u0 >= -S.W / 2 - 1e-6 && r.u1 <= S.W / 2 + 1e-6 && r.y1 <= S.F * S.fh + 1e-6 && r.out <= 1.3, `${id} ${r.kind}: out of the wall's span (${j(rect(r))}, out ${r.out})`);
      for (const w of v.windows.filter((q) => q.side === 'back')) if (hit(rect(r), { a: w.x - w.w / 2, b: w.x + w.w / 2, c: w.floor * S.fh + w.y, d: w.floor * S.fh + w.y + w.h })) assert.fail(`${id}: ${r.kind} covers window ${w.id}`);
      if (door && r.kind !== 'terrace' && hit(rect(r), { a: door.x - door.w / 2, b: door.x + door.w / 2, c: 0, d: door.h })) assert.fail(`${id}: ${r.kind} covers the promenade door`);
      for (const q of back) if (q !== r && !MARK.has(q.kind) && hit(rect(r), rect(q), -0.01)) assert.fail(`${id}: ${r.kind} overlaps a ${q.kind}`);
    }
    if (door) {
      const c = kinds('terrace')[0], s = kinds('sign')[0];
      assert.ok(c.u0 <= door.x - door.w / 2 && c.u1 >= door.x + door.w / 2, `${id}: the cover is over the door`);
      assert.ok(c.y0 >= 1.9 && c.out >= 0.8, `${id}: the cover hangs ${f2(c.y0)} m up and ${c.out} out: over a walker's head and a real cover`);
      assert.ok(s.u0 < door.x && s.u1 > door.x && s.y0 >= c.y1 - 0.05, `${id}: the board is over the cover, on the door's line`);
      for (const t of v.steps.filter((q) => q.door === door.id)) for (const p of kinds('planter')) {            // a planter is `out` from the wall at its far face, 0.4 deep; a tread spans the z of its rect (the back wall is at -D/2)
        if (p.u0 < t.rect.x1 && p.u1 > t.rect.x0 && p.out > -S.D / 2 - t.rect.z1 && p.out - 0.4 < -S.D / 2 - t.rect.z0) assert.fail(`${id}: a planter stands on the steps`);
      }
    }
  }
  assert.deepEqual([...live.lots.values()].filter((x) => x.bp.facade.some((r) => r.rear)).map((x) => x.bp.id).sort(), PROMENADE, 'only the seven have a rear dressing');
  assert.deepEqual([...old.lots.values()].filter((x) => x.bp.facade.some((r) => r.rear)).map((x) => x.bp.id), [], 'and with no beach none has');
});

test('the rest of a promenade lot is as it was: wherever its windows are as they were, everything on its front and its sides is too (the dressing is on the back wall alone; the weather\'s marks on the other walls do not move)', () => {
  // L12 and L50 are the two lots whose storeroom louvre the door replaces: genWindows draws one value for a candidate a door's keep-clear drops (not the four of a window it places), so the windows
  // after it are drawn afresh (a few centimetres, a kind) and their front records move with them. That is a plain consequence of the door, not of the dressing, and it stays inside those two lots.
  // (The cover over the door is recorded as a `terrace`, not an `awning`: weather.js:574 looks for the shop door's awning among the records of EVERY side, and with the cover recorded as an awning
  // this test failed on L14, whose front rust mark hung from the cover's valance on the other wall. The facade draws from no stream, it is a hash of the building id.)
  const ra = (id) => bpOf(old, id), same = PROMENADE.filter((id) => j(ra(id).windows) === j(view(id).windows));
  assert.ok(same.length >= 5, `the lots whose windows are as they were: ${same}`);
  for (const id of same) {
    const a = ra(id).facade.filter((r) => r.side !== 'back');
    assert.ok(a.length >= 5, `${id}: there is something on the front to compare`);
    assert.deepEqual(view(id).facade.filter((r) => r.side !== 'back'), a, `${id}: the front and the sides are as they were`);
  }
});
