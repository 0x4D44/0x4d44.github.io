// A2: the variety of the street dressing (R1-003): hand-painted shop names, and the stock a shop hangs out beside its shutter.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-dressing.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { signText, handPainted, paintSignAtlas } from '../js/arch/signs.js';

const real = await buildData({ furnish: false });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const ALL = [...real.buildings, ...synth.bps];
const alongWall = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
const hit = (r, o, tol = 0.02) => r.u1 > o.u0 + tol && r.u0 < o.u1 - tol && r.y1 > o.y0 + tol && r.y0 < o.y1 - tol;

test('about four in ten shop names are painted by hand on the plaster (on a thin whitewashed panel, no metal frame); institutions and houses never are; the choice is a function of the lot id', () => {
  let shops = 0, hand = 0; const problems = [];
  for (const bp of real.buildings) {
    const rec = bp.facade.find((r) => r.kind === 'sign');
    if (!rec) continue;
    const kind = bp.lot.kind, inst = ['school', 'clinic', 'hall', 'chapel'].includes(kind);
    if (inst) { if (rec.hand || handPainted(bp.lot)) problems.push(`${bp.id} (${kind}) is an institution but its board is hand-painted`); continue; }
    shops++;
    if (!!rec.hand !== handPainted(bp.lot)) problems.push(`${bp.id}: record says hand=${!!rec.hand}, the lot says ${handPainted(bp.lot)}`);
    if (rec.hand) { hand++; if (rec.out > 0.065) problems.push(`${bp.id}: a hand-painted name stands ${rec.out} m off the wall (a thin whitewashed panel, not a framed board)`); }
    else if (rec.out < 0.07) problems.push(`${bp.id}: a framed board only ${rec.out} m off the wall`);
  }
  assert.ok(shops >= 25, `only ${shops} lettered shops on the real barrio`);
  assert.ok(hand >= shops * 0.2 && hand <= shops * 0.6, `${hand} of ${shops} lettered shops are hand-painted`);
  assert.equal(handPainted({ id: 'X1', kind: 'house', name: 'Casa Pérez' }), false, 'a private house has no name board at all');
  for (const kind of ['school', 'clinic', 'hall', 'chapel']) for (let i = 0; i < 200; i++) assert.equal(handPainted({ id: `Q${i}`, kind, name: 'Nombre' }), false, `${kind} Q${i}: an institution keeps its official board`);
  for (const id of ['L02', 'L11', 'L30', 'T07']) assert.equal(handPainted({ id, kind: 'shophouse', shop: 'tienda', name: 'Tienda' }), handPainted({ id: `${id}`, kind: 'shophouse', shop: 'tienda', name: 'Otra' }), 'the same id gives the same answer whatever the name');
  assert.deepEqual(problems, []);
});

test('a hand-painted name is lettered one wobbling letter at a time with a brush hand under it; a framed board is one line of type', () => {
  const lots = []; for (let i = 0; i < 60 && lots.length < 2; i++) { const lot = { id: `Q${i}`, kind: 'shophouse', shop: 'tienda', name: 'Tienda Doña Rosa' }; if (handPainted(lot) === (lots.length === 0)) lots.push(lot); }
  assert.equal(lots.length, 2, 'one hand-painted and one framed lot id found');
  const run = (lot) => {
    const log = [], g = new Proxy({}, { get: (_, k) => (k === 'measureText' ? (s) => ({ width: 10 * String(s).length }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : (...a) => { log.push([k, ...a]); }), set: (_, k, v) => { if (k === 'font') log.push(['font', v]); return true; } });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => g }) };
    try { paintSignAtlas([lot]); } finally { delete globalThis.document; }
    return log;
  };
  const name = signText(lots[0]).main;                                                // 'TIENDA DOÑA ROSA'
  const handLog = run(lots[0]), framed = run(lots[1]);
  const typed = (log) => log.filter((c) => c[0] === 'fillText').map((c) => c[1]);
  for (const ch of new Set([...name.replace(/ /g, '')])) assert.ok(typed(handLog).includes(ch), `the hand-painted board draws the letter ${ch} on its own`);
  assert.ok(!typed(handLog).includes(name) && !typed(handLog).some((s) => s.length > 1 && name.includes(s) && s.length > 8), 'it never sets the whole name as one line of type');
  assert.ok(handLog.filter((c) => c[0] === 'rotate').length >= name.replace(/ /g, '').length, 'every letter leans a little (rotate)');
  const lastRotate = handLog.map((c) => c[0]).lastIndexOf('rotate');                // the board is painted after the bills and ghost signs, so the last rotate is its last letter
  const tail = handLog.slice(lastRotate), afterLetters = tail.slice(tail.findIndex((c) => c[0] === 'restore'));      // past the last letter's save / restore pair
  const firstText = afterLetters.findIndex((c) => c[0] === 'fillText'), fontSet = afterLetters.slice(0, firstText).filter((c) => c[0] === 'font').at(-1);      // the font in force when the line under the name is drawn
  assert.ok(firstText > 0, 'a line is drawn under the name');
  assert.match(fontSet?.[1] ?? '', /Segoe Print/, 'the line under the name is in the brush hand');
  const lines = typed(framed), l1 = signText(lots[1]).main;
  assert.ok(lines.includes(l1) || lines.some((s) => s.length > 8 && l1.includes(s)), 'the framed board sets its name as type');
});

test('the stock of a shop hangs on a rail beside the shutter: only shop types that have stock, on a side with room, clear of every opening, bill and fitting, and a third of the shops do it', () => {
  const kinds = ['tienda', 'zapateria', 'modista', 'fruver', 'carniceria', 'ferreteria', 'papeleria'], problems = []; let withGoods = 0, eligible = 0;
  for (const bp of ALL) {
    const shop = bp.lot.shop, S = bp.shell, goods = bp.facade.filter((r) => r.kind === 'goods');
    if (goods.length > 1) problems.push(`${bp.id}: ${goods.length} rails`);
    const door = bp.doors.find((d) => d.ext && d.floor === 0 && d.side === 'front' && d.kind === 'shutter');
    if (door && kinds.includes(shop)) eligible++;
    for (const r of goods) {
      withGoods++;
      if (!door || !kinds.includes(shop)) { problems.push(`${bp.id}: goods on a lot with no shutter or no stock type (${shop})`); continue; }
      if (r.u1 - r.u0 > 0.75 || r.u1 - r.u0 < 0.39) problems.push(`${bp.id}: rail ${(r.u1 - r.u0).toFixed(2)} m wide`);
      if (r.y0 < 1.3 || r.y1 > 2.2) problems.push(`${bp.id}: goods at y ${r.y0}..${r.y1} are not at hand height`);
      const dd = alongWall('front', door);
      if (r.u1 > dd - door.w / 2 - 0.2 && r.u0 < dd + door.w / 2 + 0.2) problems.push(`${bp.id}: goods hang within 0.2 m of the shutter opening (u ${r.u0}..${r.u1}, door ${(dd - door.w / 2).toFixed(2)}..${(dd + door.w / 2).toFixed(2)})`);
      for (const o of bp.facade) if (o !== r && ['poster', 'meter', 'ac', 'pipe', 'sign', 'blade', 'ghost'].includes(o.kind) && o.side === 'front' && hit(r, o, 0.01)) problems.push(`${bp.id}: goods overlap the ${o.kind}`);
      for (const w of bp.windows) if (w.side === 'front' && hit(r, { u0: w.x - w.w / 2, u1: w.x + w.w / 2, y0: w.floor * S.fh + w.y, y1: w.floor * S.fh + w.y + w.h })) problems.push(`${bp.id}: goods cover window ${w.id}`);
    }
  }
  assert.ok(eligible >= 12, `only ${eligible} shutter shops of a stocked type in the real and the test lots`);
  assert.ok(withGoods >= eligible * 0.15 && withGoods <= eligible * 0.45, `${withGoods} of ${eligible} eligible shops hang goods (5 of 18 when written; every shop that has room for a rail would make it 10)`);
  assert.deepEqual(problems, []);
});

test('electricity meters: a house has one box (a pair now and then), a block of flats a bank of two to four side by side, always on the wall beside the door and clear of it', () => {
  const flats = [], houses = [], problems = [];
  for (const bp of ALL) {
    const rec = bp.facade.find((r) => r.kind === 'meter'); if (!rec) continue;
    const S = bp.shell, isFlats = ['apartments', 'tenement'].includes(bp.lot.kind), n = rec.boxes, door = bp.doors.find((d) => d.ext && d.floor === 0 && d.side === 'front' && d.entrance === 'main' && d.kind !== 'shutter');
    (isFlats ? flats : houses).push(n);
    if (!(n >= 1 && n <= 4)) problems.push(`${bp.id}: ${n} boxes`);
    if (isFlats && n < 2 && S.W > 5) problems.push(`${bp.id}: a block of flats on a ${S.W} m front has a single meter`);
    if (Math.abs(rec.u1 - rec.u0 - (0.3 + 0.34 * (n - 1))) > 0.011) problems.push(`${bp.id}: ${n} boxes span ${(rec.u1 - rec.u0).toFixed(2)} m, not ${(0.3 + 0.34 * (n - 1)).toFixed(2)}`);
    if (rec.u0 < -S.W / 2 + 0.1 || rec.u1 > S.W / 2 - 0.1) problems.push(`${bp.id}: the bank u${rec.u0}..${rec.u1} runs off the wall (${S.W} m)`);
    if (door && rec.u1 > door.x - door.w / 2 && rec.u0 < door.x + door.w / 2) problems.push(`${bp.id}: the meters hang over the door`);
  }
  assert.ok(flats.length >= 3, `only ${flats.length} blocks of flats with a meter`);
  assert.ok(flats.some((n) => n >= 3), `no bank of three or more on any block of flats (${flats})`);
  assert.ok(houses.includes(1) && houses.includes(2), `houses should show both a single box and a pair (${[...new Set(houses)]})`);
  assert.deepEqual(problems, []);
});

test('shop awnings are striped cloth or a zinc lean-to: both show up on the real barrio, and a lean-to covers its door, stays under the board and never drops below a man\'s head', () => {
  let tin = 0, cloth = 0; const problems = [];
  for (const bp of ALL) {
    const rec = bp.facade.find((r) => r.kind === 'awning'); if (!rec) continue;
    const door = bp.doors.find((d) => d.ext && d.floor === 0 && d.side === 'front' && d.kind === 'shutter'), sign = bp.facade.find((r) => r.kind === 'sign');
    if (rec.style !== 'tin') { if (bp.shell && real.buildings.includes(bp)) cloth++; continue; }
    if (real.buildings.includes(bp)) tin++;
    if (!door) { problems.push(`${bp.id}: a lean-to without a shutter shop under it`); continue; }
    if (rec.u0 > door.x - door.w / 2 + 0.01 || rec.u1 < door.x + door.w / 2 - 0.01) problems.push(`${bp.id}: the lean-to u${rec.u0}..${rec.u1} does not cover the door (${(door.x - door.w / 2).toFixed(2)}..${(door.x + door.w / 2).toFixed(2)})`);
    if (sign && rec.y1 > sign.y0 + 0.06) problems.push(`${bp.id}: the lean-to top ${rec.y1} reaches into the board (${sign.y0})`);
    if (rec.y0 < 1.95) problems.push(`${bp.id}: the lean-to edge at ${rec.y0} m hangs lower than the 1.78 m player's head plus a hand`);
  }
  assert.ok(tin >= 2, `only ${tin} zinc lean-tos on the real barrio`);
  assert.ok(cloth >= 4, `only ${cloth} cloth awnings on the real barrio`);
  assert.deepEqual(problems, []);
});
