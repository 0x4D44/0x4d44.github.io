// INTERIORS (A3, round 5): a hanging rail is never bare (R4-211, R2e-004), hung clothes have a cut of their own, and what lies about the barrio is mostly shirts, shorts and leggings,
// not socks and underwear (R4-211: 62% of the clothes were socks and underwear), and neighbouring lockers and cupboards do not hold the same things (R2e-002).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-rails.test.mjs        A2's real plans
import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshBuilder } from '../js/core/mesh.js';
import { Pen } from '../js/interiors/standins.js';
import { ITEMS } from '../js/interiors/props.js';
import { PITCH, railSpots, makeContents, drawContent, eyesFor, crosses, GUARD_PAD, glints } from '../js/interiors/contents.js';
import { FINDS } from '../js/interiors/finds.js';
import { buildInterior } from '../js/interiors/build.js';
import { furnishedBatch } from './interiors-lib.mjs';

const stub = new Map();
const matStub = (key) => { let m = stub.get(key); if (!m) stub.set(key, m = { name: key, isMaterial: true, userData: {}, dispose() {} }); return m; };
const w = await furnishedBatch({ real: true });
w.ctx.mat = matStub;
for (const bp of w.bps) buildInterior(w.ctx, bp);
const C = w.ctx.containers;
const problems = (list, what) => assert.equal(list.length, 0, `${list.length} ${what}:\n  ` + list.slice(0, 12).join('\n  '));

test('railSpots: the middle of the rail first, then both sides, a hand apart, inside the rail; a rail too short has none', () => {
  const r = { x0: -0.702, x1: 0.211 }, s = railSpots(r), span = r.x1 - r.x0 - 0.09;
  assert.ok(Math.abs(s[0] - (r.x0 + r.x1) / 2) < 1e-9, 'the first hanger is in the middle');
  assert.ok(s.every((x) => x >= r.x0 + 0.045 - 1e-9 && x <= r.x1 - 0.045 + 1e-9), 'a hanger beyond the rail');
  const sorted = [...s].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) assert.ok(Math.abs(sorted[i] - sorted[i - 1] - PITCH) < 1e-9, 'not a hand apart');
  assert.ok(Math.abs(s.length - span / PITCH) <= 2, `${s.length} places on ${span.toFixed(2)} m`);
  assert.ok(new Set(s).size === s.length, 'a place twice');
  for (let n = 1; n < s.length; n++) assert.ok(Math.abs(s[n] - s[0]) >= Math.abs(s[n - 1] - s[0]) - 1e-9, 'a place nearer the middle comes after a place further from it');
  assert.deepEqual(railSpots({ x0: 0, x1: 0.05 }), []);
});

test('every hanging rail of the barrio carries clothes (R4-211, R2e-004: 10 of 175 opened to a bare rail, and what hung at the ends was behind the door): from the middle out, no two on one hanger, more than one kind on a long rail', () => {
  const bad = []; let rails = 0, hung = 0, long = 0, varied = 0;
  for (const bp of w.bps) {
    C.activate(bp.id);
    for (const S of C.byBuilding.get(bp.id) ?? []) {
      const rail = S.slot.rail; if (!rail) continue;
      rails++;
      const objs = makeContents(w.ctx, S), hangs = objs.filter((o) => o.sh === 'hang'), spots = railSpots(rail), tag = `${bp.id} ${S.rec.name}#${S.slot.i}`;
      hung += hangs.length;
      if (spots.length >= 2 && hangs.length < 2) bad.push(`${tag}: ${hangs.length} hung of ${spots.length} places`);
      if (hangs.length > spots.length) bad.push(`${tag}: ${hangs.length} hung on ${spots.length} places`);
      const xs = hangs.map((o) => o.x).sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < PITCH - 1e-6) bad.push(`${tag}: two garments ${((xs[i] - xs[i - 1]) * 100).toFixed(1)} cm apart`);
      if (hangs.some((o) => o.x < rail.x0 || o.x > rail.x1)) bad.push(`${tag}: a garment off the rail`);
      const mid = (rail.x0 + rail.x1) / 2, reach = Math.max(...hangs.map((o) => Math.abs(o.x - mid)), 0);
      if (hangs.length >= 4 && reach > (hangs.length / 2) * PITCH + 1e-6) bad.push(`${tag}: ${hangs.length} garments reach ${reach.toFixed(2)} m from the middle (a gap)`);
      if (hangs.length >= 6) { long++; if (new Set(hangs.map((o) => o.item)).size >= 3) varied++; }
    }
    C.deactivate(bp.id);
  }
  assert.ok(rails >= 100, `${rails} rails`);
  console.log(`# rails: ${rails} rails, ${hung} hung garments (${(hung / rails).toFixed(1)} each), ${varied} of ${long} long rails hang three kinds or more`);
  problems(bad, 'rail problems');
  assert.ok(long > 0 && varied >= 0.8 * long, `${varied} of ${long} long rails hang three kinds or more`);
  assert.ok(hung / rails >= 4.5, `only ${(hung / rails).toFixed(1)} garments a rail`);
});

test('every hung garment has a cut of its own (a plank in a colour read as nothing on a rail): all twelve draw several parts, inside their box, and the cuts differ', () => {
  const hangs = ITEMS.filter((i) => i.sh === 'hang'), sig = new Set();
  assert.equal(hangs.length, 12);
  for (const i of hangs) {
    const rec = { id: 'r1', x: 1.3, y: 0.2, z: -0.7, ry: 0.7, kind: 'floor' }, P = new Pen(new MeshBuilder(), rec, { size: [1, 1, 1] });
    const o = { id: 'o', sh: 'hang', item: i.id, col: 0xc8a070, x: 0.1, y: 0.8, z: 0.02, w: PITCH, h: i.h, d: i.w };
    drawContent(P, o);
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity], cs = Math.cos(rec.ry), sn = Math.sin(rec.ry), zs = new Set();
    for (const [, a] of P.b.accs) for (let k = 0; k < a.pos.length; k += 3) {
      const dx = a.pos[k] - rec.x, dz = a.pos[k + 2] - rec.z, p = [dx * cs - dz * sn, a.pos[k + 1] - rec.y, dx * sn + dz * cs];
      for (let q = 0; q < 3; q++) { lo[q] = Math.min(lo[q], p[q]); hi[q] = Math.max(hi[q], p[q]); }
      zs.add(Math.round((p[2] - o.z) / o.d / 0.05));                               // where the cloth's edges lie across the garment, as a share of its width: the silhouette (shoulders, sleeves, skirt, legs)
    }
    const e = 0.002;
    assert.ok(lo[0] >= o.x - PITCH / 2 - e && hi[0] <= o.x + PITCH / 2 + e, `${i.id}: ${(hi[0] - lo[0]).toFixed(3)} m along the rail, its room is ${PITCH}`);
    assert.ok(lo[2] >= o.z - o.d / 2 - e && hi[2] <= o.z + o.d / 2 + e, `${i.id}: wider than its width`);
    assert.ok(lo[1] >= o.y - e && hi[1] <= o.y + o.h + 0.02 + e, `${i.id}: ${lo[1].toFixed(3)}..${hi[1].toFixed(3)} outside ${o.y}..${(o.y + o.h).toFixed(3)} (+ the hook)`);
    assert.ok(P.n >= 5, `${i.id}: ${P.n} parts, a plank`);
    sig.add([...zs].sort((a, b) => a - b).join(','));
  }
  assert.ok(sig.size >= 5, `only ${sig.size} different cuts among 12 garments`);
});

test('what lies about is mostly shirts, shorts and leggings (R4-211: 62% of the 490 garments were socks and underwear, 26% tops, shorts and leggings)', () => {
  const small = new Set(['sock_single', 'socks_pair', 'underwear', 'briefs', 'boxers', 'panties', 'knickers', 'high_leg_knickers', 'thong', 'bra']);
  const tops = new Set(['tshirt', 'crop_top', 'shorts', 'leggings', 'nightdress']);
  let n = 0, s = 0, t = 0, floorSmall = 0, floorN = 0;
  for (const bp of w.bps) for (const f of bp.furniture) {
    const m = /^garment_(.+)_(flat|folded|hung)$/.exec(f.name); if (!m) continue;
    n++; if (small.has(m[1])) s++; if (tops.has(m[1])) t++;
    if (f.kind === 'floor') { floorN++; if (small.has(m[1])) floorSmall++; }
  }
  console.log(`# clothes: ${n} garments, ${(100 * t / n).toFixed(0)}% tops, shorts and leggings, ${(100 * s / n).toFixed(0)}% socks and underwear (${floorSmall} of ${floorN} on the floor)`);
  assert.ok(n >= 400, `${n} garments`);
  assert.ok(t >= 0.45 * n, `tops, shorts and leggings are ${(100 * t / n).toFixed(0)}% of the clothes`);
  assert.ok(s <= 0.45 * n, `socks and underwear are ${(100 * s / n).toFixed(0)}% of the clothes`);
});

test('neighbouring slots of one pool hold different things (R2e-002: three school lockers held the same lunchbox, bottle and coat): each leans toward its own share of the pool, and a school locker holds what a pupil carries', () => {
  const PUPIL = new Set(['morral', 'cuadernos', 'uniforme', 'camiseta_equipo', 'tenis', 'guayos', 'balon']);
  const measure = (lean) => {
    let sum = 0, pairs = 0, lSum = 0, lPairs = 0, school = 0, pupils = 0; const same = [];
    for (const bp of w.bps) {
      C.activate(bp.id);
      const groups = new Map();
      for (const S of C.byBuilding.get(bp.id) ?? []) { const key = `${S.rec.room}|${S.slot.pool}`; (groups.get(key) ?? groups.set(key, []).get(key)).push(S); }
      for (const [key, g] of groups) {
        const pool = key.split('|')[1], keep = g.map((S) => S.sib);
        if (!lean) for (const S of g) S.sib = null;
        const sets = g.map((S) => new Set(makeContents(w.ctx, S).filter((o) => o.item).map((o) => o.item)));
        g.forEach((S, i) => { S.sib = keep[i]; });
        if (pool === 'locker' && bp.lot?.kind === 'school') for (const s of sets) { school++; if ([...s].some((x) => PUPIL.has(x))) pupils++; }
        for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
          const both = [...sets[i]].filter((x) => sets[j].has(x)).length, share = both / (Math.min(sets[i].size, sets[j].size) || 1);
          sum += share; pairs++;
          if (pool === 'locker') { lSum += share; lPairs++; if (share > 0.7) same.push(`${bp.id} ${key}: ${[...sets[i]].join(',')} | ${[...sets[j]].join(',')}`); }
        }
      }
      C.deactivate(bp.id);
    }
    return { mean: sum / pairs, pairs, locker: lSum / lPairs, lPairs, school, pupils, same };
  };
  const on = measure(true), off = measure(false);
  console.log(`# neighbours: ${on.pairs} pairs of slots share ${(100 * on.mean).toFixed(0)}% of their kinds (${(100 * off.mean).toFixed(0)}% without the lean); ${on.lPairs} pairs of lockers share ${(100 * on.locker).toFixed(0)}%; ${on.pupils} of ${on.school} school lockers hold what a pupil carries`);
  assert.ok(on.pairs >= 500 && on.lPairs >= 3, `${on.pairs} pairs, ${on.lPairs} locker pairs`);
  assert.ok(on.mean <= 0.8 * off.mean, `neighbours share ${(100 * on.mean).toFixed(0)}% of their kinds, ${(100 * off.mean).toFixed(0)}% without the lean: it does nothing`);
  assert.ok(on.locker <= 0.4, `neighbouring lockers share ${(100 * on.locker).toFixed(0)}% of their kinds`);
  problems(on.same, 'pairs of lockers that hold nearly the same things');
  assert.ok(on.school >= 6 && on.pupils >= 0.75 * on.school, `${on.pupils} of ${on.school} school lockers hold anything a pupil carries`);
});

test('a find lies where it can be seen (R4-208, R4-206: of 162 finds 40 were not under the crosshair from the first front spot and 16 from none): nothing stands on a sight line to it from the eyes of whoever opens the slot, and none lies on the floor under the hanging clothes', () => {
  let finds = 0, underClothes = 0, withRail = 0; const bad = [];
  for (const bp of w.bps) {
    C.activate(bp.id);
    for (const S of C.byBuilding.get(bp.id) ?? []) {
      if (!S.plan?.find) continue;
      const objs = makeContents(w.ctx, S), f = objs.find((o) => o.find);
      if (!f) { bad.push(`${S.id}: the planned find ${S.plan.find} is not inside`); continue; }
      finds++;
      const room = S.bp.rooms.find((r) => r.id === S.rec.room), elev = Math.max(0, (S.loc.y0 ?? 0) - (room?.y ?? 0)), eyes = eyesFor(S.slot, elev), t = [f.x, f.y + f.h / 2, f.z], rail = S.slot.rail;
      for (const o of objs) {
        if (o === f) continue;
        const b = { x0: o.x - o.w / 2 - GUARD_PAD, x1: o.x + o.w / 2 + GUARD_PAD, y0: o.y - 0.015, y1: o.y + o.h + GUARD_PAD, z0: o.z - o.d / 2 - GUARD_PAD, z1: o.z + o.d / 2 + GUARD_PAD };
        if (eyes.some((e) => crosses(e, t, b))) bad.push(`${S.id} ${S.rec.name}: ${o.item ?? o.sh} stands on a sight line to ${f.find}`);
      }
      if (rail) { withRail++; if (f.y + 0.05 < rail.y && f.x > rail.x0 && f.x < rail.x1) underClothes++; }
    }
    C.deactivate(bp.id);
  }
  console.log(`# finds: ${finds} in the barrio, ${withRail} in a slot with a hanging rail, ${underClothes} of them under the clothes`);
  assert.ok(finds >= 120, `${finds} finds`);
  problems(bad, 'finds that cannot be seen');
  assert.equal(underClothes, 0, `${underClothes} finds lie on the floor under the hanging clothes`);
});

test('a paper never hides the find beside it (R4-206: the letter went down first, and its padded edge stood on the line from one eye to the coin in a nightstand drawer of the real barrio): the find goes down first when the paper would hide it', () => {
  // the drawer of a nightstand_a (the one of L21.f1.r1, the household's letter and coin as planned), cut from A2's real barrio
  const slot = {
    i: 0, kind: 'drawer', group: 'nightstand', rect: { x0: -0.208, x1: 0.208, y0: 0.372, y1: 0.518 }, zf: 0.19, travel: 0.285, pool: 'nightstand_drawer', cap: [3, 5], who: 'El cajón de la mesita',
    surf: [{ x0: -0.176, x1: 0.176, z0: -0.085, z1: 0.154, y: 0.384, h: 0.13, panel: 0.134, cot: 0.43, zr: -0.156 }],
  };
  const S = { id: 'L21.f1.r1.i2bx#0', slot, plan: { paper: 'carta_abuela', find: 'moneda_antigua' }, hh: w.bps.find((bp) => bp.interior?.hh?.length).interior.hh[0] };
  const objs = makeContents(w.ctx, S), f = objs.find((o) => o.find), p = objs.find((o) => o.paper);
  assert.ok(f && p, `the coin and the letter are both in the drawer (${objs.map((o) => o.item ?? o.paper?.id ?? o.find ?? o.sh).join(', ')})`);
  const eyes = eyesFor(slot, 0), t = [f.x, f.y + f.h / 2, f.z], hiding = [];
  for (const o of objs) {
    if (o === f) continue;
    const b = { x0: o.x - o.w / 2 - GUARD_PAD, x1: o.x + o.w / 2 + GUARD_PAD, y0: o.y - 0.015, y1: o.y + o.h + GUARD_PAD, z0: o.z - o.d / 2 - GUARD_PAD, z1: o.z + o.d / 2 + GUARD_PAD };
    if (eyes.some((e) => crosses(e, t, b))) hiding.push(o.item ?? o.paper?.id ?? o.sh);
  }
  assert.deepEqual(hiding, [], `${hiding.join(', ')} stand on a sight line to the coin`);
  assert.deepEqual(objs.map((o) => o.k), objs.map((_, i) => i), 'the objects keep their order (k counts from 0)');
  assert.ok(objs[0].paper && objs[1].find, 'the letter comes first and the coin second, whichever went down first');
});

test('every treasure and every small find in the barrio carries the flag the glint layer draws a star over (R4-206: a speck in a drawer reads as nothing); the big funny and tender things do not', () => {
  let finds = 0, glinting = 0; const bad = [];
  for (const bp of w.bps) {
    C.activate(bp.id);
    for (const S of C.byBuilding.get(bp.id) ?? []) {
      if (!S.plan?.find) continue;
      const f = makeContents(w.ctx, S).find((o) => o.find);
      if (!f) continue;
      finds++;
      const want = glints(FINDS.find((r) => r.id === f.find));
      if (!!f.glint !== want) bad.push(`${S.id}: ${f.find} has glint=${!!f.glint}, the rule says ${want}`);
      if (f.glint) glinting++;
    }
    C.deactivate(bp.id);
  }
  console.log(`# glints: ${glinting} of ${finds} finds`);
  problems(bad, 'finds whose glint flag disagrees with the rule');
  assert.ok(glinting >= 60 && glinting < finds, `${glinting} of ${finds} finds glint`);
});
