// A2: the facade dressing (js/arch/shellfacade.js + signs.js). It is decoration, so what must hold is geometric politeness: it builds without a fault,
// every piece stays on its own wall and within reach of it, nothing hides a window or a door, balconies keep clear of the lettering and of each other,
// and rooftop rooms stay behind the front parapet. The pieces are read from `bp.facade` (one record per element: kind, side, u0..u1 along the wall,
// y0..y1, out = how far it stands off the wall).
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-facade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { makeRoofModel } from '../js/arch/shellroof.js';
import { signText, signColours, paintSignAtlas, ensureSignAtlas, GHOST_COUNT, POSTER_COUNT } from '../js/arch/signs.js';

const real = await buildData({ furnish: false });
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

const alongWall = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
/** Every window and exterior door on one side as a rect in (u along the wall, y). */
function openings(bp, side) {
  const S = bp.shell, out = [];
  for (const w of bp.windows) if (w.side === side) { const u = alongWall(side, w); out.push({ id: w.id, kind: 'window', u0: u - w.w / 2, u1: u + w.w / 2, y0: w.floor * S.fh + w.y, y1: w.floor * S.fh + w.y + w.h }); }
  for (const d of bp.doors) if (d.ext && d.side === side) { const u = alongWall(side, d); out.push({ id: d.id, kind: 'door', u0: u - d.w / 2, u1: u + d.w / 2, y0: d.floor * S.fh, y1: d.floor * S.fh + d.h }); }
  return out;
}
const hit = (r, o, tol = 0.02) => r.u1 > o.u0 + tol && r.u0 < o.u1 - tol && r.y1 > o.y0 + tol && r.y0 < o.y1 - tol;
const each = (fn) => { for (const [label, , bps] of SETS) for (const bp of bps) fn(bp, `${label} ${bp.id} (${bp.lot.kind})`); };
const REQUIRED = ['sign', 'balcony', 'mirador', 'ac', 'pipe', 'meter', 'ghost', 'awning', 'blade', 'poster', 'canopy', 'roofroom'];

test('the facade is dressed without a fault, and every kind of dressing really shows up on the real barrio', () => {
  for (const [label, ctx] of SETS) assert.deepEqual((ctx.errors ?? []).filter((e) => e.stage === 'arch'), [], `${label}: arch errors`);
  const seen = new Map();
  for (const bp of real.buildings) for (const r of bp.facade ?? []) seen.set(r.kind, (seen.get(r.kind) ?? 0) + 1);
  assert.deepEqual(REQUIRED.filter((k) => !seen.get(k)), [], `kinds that never appear on the 49 real lots: ${[...seen].map(([k, n]) => k + ':' + n).join(' ')}`);
  for (const bp of real.buildings) assert.ok(Array.isArray(bp.facade), `${bp.id}: bp.facade missing`);
});

test('nothing is stuck over a window or a door: units, pipes, meters, bills, ghost signs, fascias and blade signs keep clear of every opening', () => {
  const problems = [];
  each((bp, tag) => {
    for (const r of bp.facade) {
      if (!['ac', 'pipe', 'meter', 'poster', 'ghost', 'sign', 'blade'].includes(r.kind)) continue;
      const o = openings(bp, r.side).find((q) => hit(r, q));
      if (o) problems.push(`${tag}: ${r.kind} u${r.u0}..${r.u1} y${r.y0}..${r.y1} covers ${o.kind} ${o.id} u${o.u0.toFixed(2)}..${o.u1.toFixed(2)} y${o.y0.toFixed(2)}..${o.y1.toFixed(2)}`);
    }
  });
  assert.deepEqual(problems, []);
});

test('awnings and door canopies hang over their door but never over a window', () => {
  const problems = [];
  each((bp, tag) => {
    for (const r of bp.facade) {
      if (r.kind !== 'awning' && r.kind !== 'canopy') continue;
      const o = openings(bp, r.side).find((q) => q.kind === 'window' && hit(r, q, 0.12));
      if (o) problems.push(`${tag}: ${r.kind} u${r.u0}..${r.u1} y${r.y0}..${r.y1} covers window ${o.id}`);
    }
  });
  assert.deepEqual(problems, []);
});

test('balconies and miradores belong to a front window, stay clear of each other and of the shop fascia, and fit under the next slab', () => {
  const problems = [];
  each((bp, tag) => {
    const S = bp.shell, bal = bp.facade.filter((r) => r.kind === 'balcony' || r.kind === 'mirador'), sign = bp.facade.find((r) => r.kind === 'sign');
    for (const r of bal) {
      const w = bp.windows.find((q) => q.id === r.window);
      if (!w || w.side !== 'front' || w.floor < 1) { problems.push(`${tag}: ${r.kind} has no upper front window (${r.window})`); continue; }
      if (r.u0 > w.x - w.w / 2 + 0.01 || r.u1 < w.x + w.w / 2 - 0.01) problems.push(`${tag}: ${r.kind} u${r.u0}..${r.u1} does not span its window ${w.id}`);
      if (r.out > 1.3) problems.push(`${tag}: ${r.kind} stands ${r.out} m off the wall`);
      if (w.floor < S.F - 1 && r.y1 > (w.floor + 1) * S.fh - S.slab) problems.push(`${tag}: ${r.kind} top ${r.y1} reaches the slab above`);
      if (sign && hit(r, sign, 0.02)) problems.push(`${tag}: ${r.kind} on ${w.id} hides the fascia`);
      for (const q of bal) if (q !== r && q.window < r.window && hit(r, q, 0.01)) problems.push(`${tag}: ${r.kind} ${r.window} overlaps ${q.kind} ${q.window}`);
    }
  });
  assert.deepEqual(problems, []);
});

test('everything stands within reach of its wall and below the parapet line; rooftop rooms sit inside the roof, set back from the street', () => {
  const problems = [];
  each((bp, tag) => {
    const S = bp.shell, yF = S.F * S.fh, span = { front: S.W, back: S.W, left: S.D, right: S.D };
    const rm = makeRoofModel({ S, bp });                                                               // nothing on the wall may rise past the top of the wall itself
    const wallTop = (r) => (r.side === 'front' ? Math.min(...[r.u0, (r.u0 + r.u1) / 2, r.u1].map((u) => rm.wallTop({ dir: 'x', at: S.D / 2 }, u))) : yF);
    for (const r of bp.facade) {
      if (r.kind === 'roofroom') {
        const I = S.inner;
        if (r.u0 < I.x0 || r.u1 > I.x1 || r.z0 < I.z0 || r.z1 > I.z1) problems.push(`${tag}: roof room outside the roof`);
        if (I.z1 - r.z1 < 1.4) problems.push(`${tag}: roof room only ${(I.z1 - r.z1).toFixed(2)} m behind the front parapet`);
        if (r.y1 - yF < 2.2 || r.y1 - yF > 3.0) problems.push(`${tag}: roof room ${(r.y1 - yF).toFixed(2)} m tall`);
        if (S.roofLayer?.caseta || S.roofWalkable) problems.push(`${tag}: roof room on a roof the player can reach`);
        continue;
      }
      if (r.out > 1.3 || r.out < 0) problems.push(`${tag}: ${r.kind} out ${r.out}`);
      if (r.u0 < -span[r.side] / 2 - 0.3 || r.u1 > span[r.side] / 2 + 0.3) problems.push(`${tag}: ${r.kind} u${r.u0}..${r.u1} off the ${r.side} wall (${span[r.side]} m)`);
      if (r.y0 < -0.01 || r.y1 > wallTop(r) + 0.01) problems.push(`${tag}: ${r.kind} y${r.y0}..${r.y1} outside 0..${wallTop(r).toFixed(2)} (the top of the wall)`);
      if (r.u1 - r.u0 < 0.05 || r.y1 - r.y0 < 0.05) problems.push(`${tag}: ${r.kind} degenerate`);
    }
  });
  assert.deepEqual(problems, []);
});

test('every lot that is named like a shop or an institution gets lettering over its door, and lettering is deterministic', () => {
  const missing = [];
  for (const bp of real.buildings) {
    const t = signText(bp.lot), has = bp.facade.some((r) => r.kind === 'sign');
    if (t && !has) missing.push(`${bp.id} (${bp.lot.kind} '${bp.lot.name}')`);
    if (!t && has) missing.push(`${bp.id} has a sign but no text`);
    if (t) {
      assert.equal(t.main, t.main.toUpperCase(), `${bp.id}: board text not upper case`);
      assert.deepEqual(signColours(bp.lot), signColours({ ...bp.lot }), `${bp.id}: colours not deterministic`);
    }
  }
  assert.deepEqual(missing, []);
  assert.equal(signText({ id: 'X', kind: 'house', name: 'Casa Pérez' }), null, 'a private house carries no fascia');
  assert.ok(signText({ id: 'X', kind: 'shophouse', shop: 'panaderia', name: 'Panadería La Esperanza' }).sub.includes('PAN'), 'the line under the name follows the shop type');
});

test('the same lots dress identically twice (no Math.random, no state leaking between builds)', () => {
  const again = planAll(testLots(), undefined, true, 0.4, 0);
  for (const bp of again.bps) buildBuilding(again.ctx, bp);
  for (let i = 0; i < again.bps.length; i++) assert.deepEqual(again.bps[i].facade, synth.bps[i].facade, `${again.bps[i].id}: facade differs between two builds`);
});

test('without a canvas (Node) the atlas is absent and the signs fall back to flat boards: no crash, no atlas material', () => {
  assert.equal(paintSignAtlas([{ id: 'L1', kind: 'shophouse', shop: 'tienda', name: 'Tienda' }]), null);
  const ctx = { matlib: { cache: new Map() } };
  assert.equal(ensureSignAtlas(ctx), null);
  assert.equal(ctx.signAtlas, null);
  assert.equal(ctx.matlib.cache.size, 0);
  assert.ok(GHOST_COUNT >= 6 && POSTER_COUNT >= 6, 'enough painted variety');
});
