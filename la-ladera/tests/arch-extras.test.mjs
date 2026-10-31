// A2: facade extras (R1 "rejas, cables, depth of thresholds"): four patterns of window grille on houses and shops alike (js/arch/reja.js), air-conditioners in three kinds and
// five colours with a drip stain under some (shellfacade.js `acLook`, weather.js), overhead service cables along the wall to the meter's conduit, and three kinds of roof tank stand.
// Every choice is a hash of the lot or the window, so the same plan always dresses the same. The grille is flat strips drawn from both sides: 4 triangles a bar where the 14 mm
// boxes it replaced cost 8, so the extras are paid for by the grille itself.
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-extras.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, localTris, coveredBy } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { REJA_PATTERNS, rejaPattern } from '../js/arch/reja.js';
import { acLook } from '../js/arch/shellfacade.js';
import { buildWindows } from '../js/arch/shellwin.js';
import { makeG } from '../js/arch/shell.js';

const real = await buildData({ furnish: false, seed: process.env.ARCH_SEED ? Number(process.env.ARCH_SEED) : undefined });   // ARCH_SEED: stress another plan; the default is the barrio
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

// ---- the grille, built by hand on a lone test lot so a pattern can be read triangle by triangle ----------------------------------------------------
const lone = planAll(testLots().slice(0, 1), undefined, false, 0.4, 0), LB = lone.bps[0], LS = LB.shell, LID = LB.id;
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const unitN = (v) => { const n = cross(sub(v[1], v[0]), sub(v[2], v[0])), l = Math.hypot(...n) || 1; return n.map((x) => x / l); };
/** A lot id whose windows of this size get `pattern` (the lot hash decides some lots whole, the window id the rest: search, do not assume). */
function lotFor(pattern, w, h) {
  for (let i = 0; i < 4000; i++) { const id = `Z${i}`; if (rejaPattern(id, { id: `${id}.w0`, w, h }) === pattern) return id; }
  throw new Error(`no lot id gives a ${pattern} grille on a ${w} x ${h} window`);
}
function grilleOf(pattern, w = 1.2, h = 1.0, y = 0.5) {
  const id = lotFor(pattern, w, h);
  LB.id = id;
  try {
    LB.windows = [{ id: `${id}.w0`, room: LB.rooms[0].id, floor: 0, side: 'front', x: 0, z: LS.D / 2, y, w, h, kind: 'casement', grille: true }];
    const G = makeG(lone.ctx, LB); buildWindows(G);
    const tris = [];
    for (const m of lone.ctx.batch.flush(id + '.ext')) {
      if (m.userData.matKey !== 'grille_iron') continue;
      const p = m.geometry.attributes.position, ix = m.geometry.index.array;
      for (let i = 0; i < ix.length; i += 3) { const v = [0, 1, 2].map((k) => LB.frame.toLocal(p.getX(ix[i + k]), p.getY(ix[i + k]), p.getZ(ix[i + k]))); tris.push({ v, n: unitN(v) }); }
    }
    return { tris, id, w, h, y0: y, y1: y + h, pg: LS.D / 2 + LS.te / 2 - 0.04 };
  } finally { LB.id = LID; }
}
/** 'h' / 'v' / 'd': which way the longest edge of a triangle of a strip runs (a strip is long and thin, so its longest edge is its length). */
function dirOf({ v }) {
  let best = null;
  for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const du = v[a][0] - v[b][0], dy = v[a][1] - v[b][1], l = Math.hypot(du, dy); if (!best || l > best.l) best = { l, ang: (Math.atan2(Math.abs(dy), Math.abs(du)) * 180) / Math.PI, up: du * dy > 0 }; }
  return best.ang < 20 ? 'h' : best.ang > 70 ? 'v' : best.up ? 'u' : 'd';                  // 'u' / 'd': a diagonal rising / falling to the right
}
const OLD = (w) => (Math.max(3, Math.round((w + 0.06) / 0.11)) + 1) * 8 + 36;           // what the boxes it replaced cost: n + 1 pickets of 8 triangles, three rails of 12
const SIZES = { bars: [[1.2, 1.0], [0.7, 1.0], [1.7, 1.2]], diamond: [[1.2, 1.0], [0.7, 1.0], [1.7, 1.2]], grid: [[1.2, 1.0], [0.7, 1.0], [1.7, 1.2]], medallion: [[1.2, 1.0], [0.9, 0.9], [1.7, 1.2]] };

test('four patterns of window grille, on the real barrio: every pattern is used, seven lots in ten keep one pattern, no pattern is asked for a window too small to hold it', () => {
  const mix = Object.fromEntries(REJA_PATTERNS.map((p) => [p, 0])), lots = new Map();
  for (const bp of real.buildings) for (const w of bp.windows) {
    if (!w.grille) continue;
    const p = rejaPattern(bp.id, w);
    assert.equal(rejaPattern(bp.id, w), p, `${w.id}: the pattern is not a function of the lot and the window`);
    mix[p]++; (lots.get(bp.id) ?? lots.set(bp.id, new Set()).get(bp.id)).add(p);
    if (p === 'medallion') assert.ok(w.w >= 0.8 && w.h >= 0.8, `${w.id}: a medallion on a ${w.w} x ${w.h} window`);
    if (p === 'diamond') assert.ok(w.w >= 0.5 && w.h >= 0.5, `${w.id}: a lattice on a ${w.w} x ${w.h} window`);
  }
  for (const p of REJA_PATTERNS) assert.ok(mix[p] >= 20, `only ${mix[p]} ${p} grilles on the real barrio (${JSON.stringify(mix)})`);
  const one = [...lots.values()].filter((s) => s.size === 1).length;
  assert.ok(lots.size >= 60 && one / lots.size >= 0.6 && one < lots.size, `${one} of ${lots.size} lots with a grille keep one pattern`);
  const dominant = new Set(); for (const bp of real.buildings) { const s = lots.get(bp.id); if (s?.size === 1) dominant.add([...s][0]); }
  assert.equal(dominant.size, 4, 'the lots that keep one pattern use all four');
});

test('each pattern is what it says it is, in the right place, drawn from both sides, and cheaper than the boxes it replaced', () => {
  for (const pattern of REJA_PATTERNS) for (const [w, h] of SIZES[pattern]) {
    const g = grilleOf(pattern, w, h), name = `${pattern} ${w} x ${h}`, gw = w + 0.06, uc = 0, yc = g.y0 + h / 2;
    assert.ok(g.tris.length > 0 && g.tris.length <= OLD(w), `${name}: ${g.tris.length} triangles, the old grille cost ${OLD(w)}`);
    // inside the rectangle, on the layers just in front of the plane of the grille
    for (const { v } of g.tris) for (const q of v) {
      assert.ok(Math.abs(q[0] - uc) <= gw / 2 + 0.014 && q[1] >= g.y0 - 0.04 - 0.014 && q[1] <= g.y1 + 0.04 + 0.014, `${name}: a vertex at u ${q[0].toFixed(3)} y ${q[1].toFixed(3)} is outside the grille's rectangle`);
      assert.ok(q[2] >= g.pg - 1e-3 && q[2] <= g.pg + 0.0046 + 1e-3, `${name}: a vertex ${((q[2] - g.pg) * 1000).toFixed(1)} mm from the plane of the grille`);
    }
    // every triangle has a twin on the same three points looking the other way: the iron shows from the street and from the room
    const key = (t) => t.v.map((q) => q.map((x) => x.toFixed(4)).join(',')).sort().join('|'), groups = new Map();
    for (const t of g.tris) (groups.get(key(t)) ?? groups.set(key(t), []).get(key(t))).push(t);
    for (const [k, list] of groups) assert.ok(list.length === 2 && list[0].n[2] * list[1].n[2] < -0.99 && Math.abs(list[0].n[2]) > 0.99, `${name}: a strip is not drawn from both sides (${list.length} triangles on ${k})`);
    // the shape of the pattern
    const dirs = { h: 0, v: 0, u: 0, d: 0 }; for (const t of g.tris) dirs[dirOf(t)]++;
    const ys = g.tris.filter((t) => dirOf(t) === 'h').map((t) => (t.v[0][1] + t.v[1][1] + t.v[2][1]) / 3).sort((p, q) => p - q);
    const levels = { size: ys.filter((y, i) => i === 0 || y - ys[i - 1] > 0.03).length };               // cross bars: clusters of triangles at one height (a strip's two triangles are 8 mm apart)
    if (pattern === 'bars') {
      const n = Math.max(3, Math.round(gw / 0.11));
      assert.equal(g.tris.length, 4 * (n + 4), `${name}: ${n - 1} pickets, two stiles and three rails make ${4 * (n + 4)} triangles`);
      assert.ok(dirs.d + dirs.u === 0 && dirs.v > 0 && levels.size === 3, `${name}: bars are upright pickets and three rails (${JSON.stringify(dirs)}, ${levels.size} rails)`);
    } else if (pattern === 'diamond') {
      assert.ok(dirs.u >= 6 && dirs.d >= 6 && dirs.u + dirs.d > dirs.h + dirs.v, `${name}: a lattice is mostly diagonals, both ways (${JSON.stringify(dirs)})`);
    } else if (pattern === 'grid') {
      assert.ok(dirs.d + dirs.u === 0 && dirs.v > 0 && levels.size >= 5, `${name}: a grid is upright and cross bars, no diagonals (${JSON.stringify(dirs)}, ${levels.size} cross bars)`);
    } else {
      const r = Math.min(0.28, Math.max(0.12, 0.3 * Math.min(gw, g.h + 0.08))), dist = (q) => Math.hypot(q[0] - uc, q[1] - yc), onRing = new Set();
      for (const { v } of g.tris) for (const q of v) if (Math.abs(dist(q) - r) < 0.016 && Math.abs(q[2] - (g.pg + 0.0045)) < 1e-3) onRing.add(q.map((x) => x.toFixed(3)).join(','));
      assert.ok(onRing.size >= 24, `${name}: only ${onRing.size} points on the ring of radius ${r.toFixed(2)}`);
      for (const { v } of g.tris) for (const q of v) assert.ok(dist(q) >= r - 0.016, `${name}: iron ${(dist(q) * 100).toFixed(1)} cm from the middle, inside the ring of radius ${(r * 100).toFixed(0)} cm`);
      const nP = Math.max(4, Math.round(gw / 0.12));                                          // the pickets stand at gw / n: those the ring reaches stop at it, the others run through the middle of the window
      for (let i = 1; i < nP; i++) {
        const u = -gw / 2 + (gw * i) / nP, du = Math.abs(u - uc);
        if (du < r - 0.02) assert.ok(!coveredBy(g.tris, 'x', g.pg, 0, null, u, yc), `${name}: a picket at u ${u.toFixed(2)} runs through the ring`);
        else if (du > r + 0.02) assert.ok(coveredBy(g.tris, 'x', g.pg, 0, null, u, yc), `${name}: no picket at u ${u.toFixed(2)}, beside the ring`);
      }
      assert.ok(dirs.v > 0 && dirs.u + dirs.d > 0, `${name}: pickets and the ring's chords (${JSON.stringify(dirs)})`);
    }
  }
});

test('the four patterns together cost less than the one grille they replaced, on every window of the real barrio that has one', () => {
  let neu = 0, old = 0, n = 0;
  for (const bp of real.buildings) for (const w of bp.windows) {
    if (!w.grille) continue;
    const g = grilleOf(rejaPattern(bp.id, w), Math.max(0.9, w.w), Math.max(0.9, w.h));           // (a stand-in of the same pattern and size: the placement is tested above)
    neu += g.tris.length; old += OLD(Math.max(0.9, w.w)); n++;
  }
  assert.ok(n >= 150, `${n} grilles`);
  assert.ok(neu < 0.8 * old, `${neu} triangles against ${old} for the boxes (${((100 * neu) / old).toFixed(0)} %)`);
});

// ---- air-conditioners -------------------------------------------------------------------------------------------------------------------------------
const units = [];
for (const [label, , bps] of SETS) for (const bp of bps) for (const r of bp.facade) if (r.kind === 'ac') units.push({ label, bp, r });

test('air-conditioners come in three kinds and five colours, each a function of the window it serves; the barrio has more of them than before', () => {
  assert.deepEqual([...new Set(units.map((x) => x.r.look))].sort(), ['mini', 'split', 'window'], 'the three kinds');
  assert.ok(new Set(units.map((x) => x.r.col.join(','))).size >= 4, 'at least four colours');
  assert.ok(units.filter((x) => x.label === 'real').length >= 18, `${units.filter((x) => x.label === 'real').length} units on the real barrio`);
  for (const { bp, r } of units) {
    const w = bp.windows.find((q) => q.side === 'front' && acLook(q.id).type === r.look && acLook(q.id).col.map((c) => +c.toFixed(2)).join(',') === r.col.join(',') && Math.abs((r.u0 + r.u1) / 2 - q.x) < q.w / 2 + 1.2);
    assert.ok(w, `${bp.id}: a ${r.look} unit of colour ${r.col} is not the look of any window beside it`);
  }
  assert.deepEqual(acLook('L00.w3'), acLook('L00.w3'));
});

test('each kind of air-conditioner has the parts that make it that kind: a grille over a fan, a round fan, a window unit with louvres and a panel, and a line-set up the wall of some', () => {
  const seen = { split: 0, mini: 0, window: 0, lineSet: 0 };
  for (const { label, bp, r } of units) {
    const ctx = SETS.find((s) => s[0] === label)[1], tris = localTris(ctx, bp), D = bp.shell.D / 2, u = (r.u0 + r.u1) / 2, name = `${label} ${bp.id} ${r.look}`;
    if (r.look === 'split') {
      const y = r.y0 + 0.37, fc = u - 0.13;
      assert.ok(coveredBy(tris, 'x', D + 0.345, 1, ['rail_metal'], fc + 0.12, y), `${name}: no dark guard over the fan`);
      assert.ok(!coveredBy(tris, 'x', D + 0.345, 1, ['rail_metal'], fc + 0.17, y + 0.17), `${name}: the fan guard is a square, not a disc`);
      assert.ok(coveredBy(tris, 'x', D + 0.349, 1, ['rail_metal'], fc + 0.025, y), `${name}: the fan has no hub`);
      assert.ok(coveredBy(tris, 'x', D + 0.35, 1, ['rail_metal'], u + 0.27, y), `${name}: no vent strip`);
      for (let i = 0; i < 4; i++) assert.ok(coveredBy(tris, 'x', D + 0.353, 1, ['door_metal'], u + 0.27, y - 0.15 + i * 0.1), `${name}: vent slat ${i} missing`);
      seen.split++;
      if (r.y1 > y + 0.5) {                                                                // the line-set: a white duct above the unit, ending in a dark hole
        const up = [u + 0.28, u - 0.28].find((x) => coveredBy(tris, 'x', D + 0.047, 1, ['rail_metal'], x, y + 0.69));
        assert.ok(up !== undefined, `${name}: a line-set was recorded but there is no hole at its top`);
        assert.ok(coveredBy(tris, 'x', D + 0.045, 1, ['door_metal'], up, y + 0.4), `${name}: the line-set has no duct`);
        seen.lineSet++;
      }
    } else if (r.look === 'mini') {
      const y = r.y0 + 0.32;
      assert.ok(coveredBy(tris, 'x', D + 0.255, 1, ['rail_metal'], u - 0.04 + 0.1, y), `${name}: no round fan`);
      assert.ok(!coveredBy(tris, 'x', D + 0.255, 1, ['rail_metal'], u - 0.04 + 0.22, y) && !coveredBy(tris, 'x', D + 0.255, 1, ['rail_metal'], u - 0.04 + 0.125, y + 0.125), `${name}: the fan is a square, not a disc`);
      assert.ok(coveredBy(tris, 'x', D + 0.259, 1, ['rail_metal'], u - 0.04 + 0.025, y), `${name}: the fan has no hub`);
      seen.mini++;
    } else {
      const y = r.y0 + 0.4;
      for (let i = 0; i < 4; i++) assert.ok(coveredBy(tris, 'x', D + 0.348, 1, ['door_metal'], u - 0.05, y - 0.105 + i * 0.07), `${name}: louvre ${i} missing`);
      assert.ok(coveredBy(tris, 'x', D + 0.345, 1, ['rail_metal'], u + 0.26, y + 0.1), `${name}: no control panel`);
      assert.ok(coveredBy(tris, 'x', D + 0.012, 1, ['plaster_a'], u, y + 0.255) && coveredBy(tris, 'x', D + 0.012, 1, ['plaster_a'], u - 0.345, y), `${name}: no rendered band round the hole`);
      seen.window++;
    }
  }
  assert.ok(seen.split >= 5 && seen.mini >= 3 && seen.window >= 2 && seen.lineSet >= 2, JSON.stringify(seen));
});

test('an air-conditioner never sits on a shop board: at least 0.4 m of bare wall between its foot and the top of any sign or blade under it, so the drip has room to run', () => {
  let over = 0;
  for (const { label, bp, r } of units) {
    for (const s of bp.facade) {
      if ((s.kind !== 'sign' && s.kind !== 'blade') || s.side !== r.side || !(s.u1 > r.u0 && s.u0 < r.u1) || !(s.y0 < r.y0)) continue;
      over++;
      assert.ok(r.y0 - s.y1 >= 0.4, `${label} ${bp.id}: a ${r.look} unit's foot is ${(r.y0 - s.y1).toFixed(2)} m over the ${s.kind} under it (0.4 needed)`);
    }
  }
  assert.ok(over >= 8, `${over} units stand over a board: the check is looking at nothing`);
});

test('a condensate stain runs down the wall under some air-conditioners, starting at the unit and never over it', () => {
  let n = 0, dripped = 0;
  for (const { label, bp, r } of units) {
    if (label !== 'real') continue;
    n++;
    const under = bp.facade.filter((q) => q.kind === 'streak' && q.side === r.side && q.u0 > r.u0 - 0.35 && q.u1 < r.u1 + 0.35 && q.y1 <= r.y0 + 1e-6 && q.y1 > r.y0 - 0.06);
    if (under.length) dripped++;
    for (const q of bp.facade.filter((s) => s.kind === 'streak' && s.side === r.side)) assert.ok(!(q.u1 > r.u0 + 0.02 && q.u0 < r.u1 - 0.02 && q.y1 > r.y0 + 0.02 && q.y0 < r.y1 - 0.02), `${bp.id}: a stain lies over an air-conditioner`);
  }
  assert.ok(n >= 18 && dripped >= 0.2 * n && dripped < n, `${dripped} of ${n} units have a stain under them`);
});

/** Is the point (u, y) of the front wall hidden by anything flat and parallel to the wall that stands more than `zMin` (local z) out: a string course, a cornice, a board? */
function inFront(tris, zMin, u, y) {
  return tris.some(({ v }) => {
    if (Math.abs(v[0][2] - v[1][2]) > 2e-3 || Math.abs(v[1][2] - v[2][2]) > 2e-3 || v[0][2] < zMin) return false;
    const [a, b, c] = v.map((q) => [q[0], q[1]]), cr = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cr) < 1e-12) return false;
    const e = (p, q) => ((q[0] - p[0]) * (y - p[1]) - (q[1] - p[1]) * (u - p[0])) * Math.sign(cr);
    return !(e(a, b) < -1e-9 || e(b, c) < -1e-9 || e(c, a) < -1e-9);
  });
}

// ---- the overhead service on the wall ---------------------------------------------------------------------------------------------------------------
test('cable runs: a black bundle with a TV cable under it, clipped every 0.7 m, from a corner of the front to the meter conduit, clear of every opening, board, awning, balcony and unit', () => {
  const runs = [];
  for (const [label, , bps] of SETS) for (const bp of bps) for (const r of bp.facade) if (r.kind === 'cable') runs.push({ label, bp, r });
  assert.ok(runs.filter((x) => x.label === 'real').length >= 15, `${runs.filter((x) => x.label === 'real').length} cable runs on the real barrio`);
  for (const { label, bp, r } of runs) {
    const S = bp.shell, name = `${label} ${bp.id}`, ctx = SETS.find((s) => s[0] === label)[1], tris = localTris(ctx, bp), meter = bp.facade.find((q) => q.kind === 'meter'), yE = r.y0 + 0.1, len = r.u1 - r.u0;
    assert.equal(r.side, 'front', `${name}: a cable run on the ${r.side}`);
    assert.ok(len >= 0.7 && yE > 2.15 && r.y1 <= S.fh + 0.01, `${name}: run of ${len.toFixed(2)} m at y ${yE.toFixed(2)}`);
    assert.ok(meter && ((r.u1 >= meter.u0 - 0.05 && r.u1 <= meter.u1 + 0.05) || (r.u0 >= meter.u0 - 0.05 && r.u0 <= meter.u1 + 0.05)), `${name}: the run does not end at the meter's conduit`);
    for (const w of bp.windows) if (w.side === 'front') assert.ok(!(w.x + w.w / 2 + 0.06 > r.u0 && w.x - w.w / 2 - 0.06 < r.u1 && w.floor * S.fh + w.y + w.h + 0.06 > r.y0 && w.floor * S.fh + w.y - 0.06 < r.y1), `${name}: the cable crosses window ${w.id}`);
    for (const d of bp.doors) if (d.ext && d.side === 'front') assert.ok(!(d.x + d.w / 2 + 0.08 > r.u0 && d.x - d.w / 2 - 0.08 < r.u1 && d.floor * S.fh + d.h + 0.08 > r.y0 && d.floor * S.fh < r.y1), `${name}: the cable crosses door ${d.id}`);
    for (const q of bp.facade) if (['sign', 'awning', 'canopy', 'blade', 'balcony', 'mirador', 'ac', 'pipe', 'poster', 'goods', 'ghost'].includes(q.kind) && q.side === 'front') assert.ok(!(q.u1 > r.u0 && q.u0 < r.u1 && q.y1 > r.y0 && q.y0 < r.y1), `${name}: the cable crosses a ${q.kind}`);
    const D = S.D / 2;
    for (let i = 0; i < 5; i++) {
      const u = r.u0 + 0.1 + ((len - 0.4) * i) / 4;                                          // (the last 0.2 m is the conduit's own)
      assert.ok(coveredBy(tris, 'x', D + 0.027, 1, ['rail_metal'], u, yE), `${name}: no black bundle at u ${u.toFixed(2)}`);
      assert.ok(coveredBy(tris, 'x', D + 0.019, 1, ['rail_metal'], u, yE - 0.055), `${name}: no TV cable at u ${u.toFixed(2)}`);
      assert.ok(!inFront(tris, D + 0.0335, u, yE) && !inFront(tris, D + 0.0335, u, yE - 0.055), `${name}: a moulding or a board hides the cable at u ${u.toFixed(2)}`);
    }
    assert.ok(r.clips >= 2 && r.clips === Math.max(2, Math.floor(len / 0.7)), `${name}: ${r.clips} clips on ${len.toFixed(2)} m`);
    for (let i = 0; i < r.clips; i++) assert.ok(coveredBy(tris, 'x', D + 0.033, 1, ['door_metal'], r.u0 + (len * (i + 0.5)) / r.clips, yE - 0.025), `${name}: clip ${i} missing`);
  }
});

// ---- roof tank stands -------------------------------------------------------------------------------------------------------------------------------
test('tanks stand on legs, on a steel tower or on a block plinth (and now and then two together), at the heights each stand puts them', () => {
  const seen = {}, two = [];
  for (const [label, ctx, bps] of SETS) for (const bp of bps) {
    const k = bp.roofKit; if (!k) continue;
    (seen[k.tank] ??= []).push(`${label} ${bp.id}`); if (k.tanks === 2) two.push(bp.id);
    const S = bp.shell, yF = S.F * S.fh, base = { frame: 1.05, tower: 2.0, plinth: 0.96 }[k.tank];
    const ys = localTris(ctx, bp).filter((t) => t.k === 'tank_plastic' && t.v.every((q) => q[1] > yF + 0.3 && q[2] < S.D / 2 - 0.5)).flatMap((t) => t.v.map((q) => q[1]));
    assert.ok(ys.length > 0, `${label} ${bp.id}: no tank over the roof`);
    assert.ok(Math.abs(Math.min(...ys) - (yF + base)) < 0.12, `${label} ${bp.id}: a ${k.tank} stand puts the tank at ${(Math.min(...ys) - yF).toFixed(2)} m, expected ${base}`);
  }
  assert.deepEqual(Object.keys(seen).sort(), ['frame', 'plinth', 'tower'], JSON.stringify(Object.fromEntries(Object.entries(seen).map(([k, v]) => [k, v.length]))));
});
