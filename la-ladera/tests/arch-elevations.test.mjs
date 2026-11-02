// A2: the back and the side walls (round 6, R1-102 / R4-311: "rear and side walls of the upper district are bare coloured boxes on lawn"). Before, the back wall wore nothing at all (no weather,
// no fitting: `planWeather` skipped it and every fitting was drawn on the front only) and a side wall wore marks but almost no fittings (a poster or a ghost sign now and then). Now (shellfacade.js
// `elevations`, weather.js): every free wall of a finished building carries at least one fitting, from the pieces the front already has: an air-conditioner beside an upper window, a drainpipe at
// a corner, an extractor or an air brick beside the kitchen's and the bathroom's windows, a zinc hood over a window, the service cable going round the corner from the front; and the back wall is
// weathered like the rest. What must hold: no free wall is a bare box, every piece is on its own wall, clear of every opening and of each other, and really in the mesh (read back from the
// triangles, on the right wall: a hood drawn on the wrong side would still be recorded). The pieces are read from `bp.facade` (kind, side, u0..u1 along the wall, y0..y1, out).
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-elevations.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, localTris } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { WEATHER_KINDS } from '../js/arch/weather.js';

const real = await buildData({ furnish: false, seed: process.env.ARCH_SEED ? Number(process.env.ARCH_SEED) : undefined });   // ARCH_SEED: stress another plan; the default is the barrio
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

const WEATHER = new Set(WEATHER_KINDS);
const OTHER = ['back', 'left', 'right'];
const NEW_KINDS = ['ac', 'pipe', 'vent', 'hood', 'drop'];                                 // what the elevation pass puts up (`ac` and `pipe` are the front's pieces on another wall)
const alongWall = (side, o) => (side === 'front' || side === 'back' ? o.x : o.z);
const spanOf = (S, side) => (side === 'front' || side === 'back' ? S.W : S.D);
const finished = (bp) => bp.lot.kind !== 'unfinished' && bp.lot.kind !== 'kiosk';
const freeWalls = (bps) => bps.flatMap((bp) => OTHER.filter((s) => !bp.shell.party[s]).map((side) => ({ bp, side })));
/** Every window and exterior door on one side as a rect in (u along the wall, y). */
function openings(bp, side) {
  const S = bp.shell, out = [];
  for (const w of bp.windows) if (w.side === side) { const u = alongWall(side, w); out.push({ id: w.id, kind: 'window', u0: u - w.w / 2, u1: u + w.w / 2, y0: w.floor * S.fh + w.y, y1: w.floor * S.fh + w.y + w.h }); }
  for (const d of bp.doors) if (d.ext && d.side === side) { const u = alongWall(side, d); out.push({ id: d.id, kind: 'door', u0: u - d.w / 2, u1: u + d.w / 2, y0: d.floor * S.fh, y1: d.floor * S.fh + d.h }); }
  return out;
}
const hit = (r, o, tol = 0.02) => r.u1 > o.u0 + tol && r.u0 < o.u1 - tol && r.y1 > o.y0 + tol && r.y0 < o.y1 - tol;

/** The free walls of a building that are bare boxes: a finished building's with no fitting at all, and (on the real barrio) any with nothing on it, not even a mark. A party wall must carry nothing. */
function bareProblems(bp, label, facade = bp.facade) {
  const out = [];
  for (const side of OTHER) {
    const recs = facade.filter((r) => r.side === side), fix = recs.filter((r) => !WEATHER.has(r.kind));
    if (bp.shell.party[side]) { if (recs.length) out.push(`${label} ${bp.id} ${side}: ${recs.length} pieces on a party wall`); continue; }
    if (finished(bp) ? !fix.length : label === 'real' && !recs.length) out.push(`${label} ${bp.id} (${bp.lot.kind}) ${side}: a bare box (${recs.length} marks and fittings, ${fix.length} fittings)`);
  }
  return out;
}

/** What is wrong with one piece on a back or side wall, if anything: off its wall, out of the wall's height, too far out, over an opening, on another piece. */
function pieceProblems(bp, r) {
  const S = bp.shell, yF = S.F * S.fh, sp = spanOf(S, r.side), at = `${bp.id} ${r.side} ${r.kind} u${r.u0}..${r.u1} y${r.y0}..${r.y1}`, out = [];
  if (r.u0 < -sp / 2 - 1e-3 || r.u1 > sp / 2 + 1e-3) out.push(`${at}: off the ${sp} m wall`);
  if (r.y0 < -0.01 || r.y1 > yF + 0.01) out.push(`${at}: outside 0..${yF.toFixed(2)}`);
  if (!(r.out > 0 && r.out <= 1.3)) out.push(`${at}: stands ${r.out} m out`);
  const o = openings(bp, r.side).find((q) => hit(r, q));
  if (o) out.push(`${at}: covers ${o.kind} ${o.id}`);
  for (const q of bp.facade) if (q !== r && q.side === r.side && !WEATHER.has(q.kind) && hit(r, q, 0.01)) out.push(`${at}: lies on the ${q.kind} u${q.u0}..${q.u1} y${q.y0}..${q.y1}`);
  return out;
}

/** A vertex of the building in the frame of one of its walls: u along it, and `out` m off its plane. */
function wallCoords(S, side, v) {
  return side === 'front' ? { u: v[0], out: v[2] - S.D / 2 } : side === 'back' ? { u: v[0], out: -v[2] - S.D / 2 } : side === 'left' ? { u: v[2], out: -v[0] - S.W / 2 } : { u: v[2], out: v[0] - S.W / 2 };
}
/** Is there a vertex of material `mats` within `tol` of the point (u along the wall, y, out m off it)? (The mesh is read back in building coordinates, so the wall is told apart by its own plane.) */
const drawnAt = (tris, S, side, mats, u, y, out, tol = 0.02) => tris.some(({ k, v }) => mats.includes(k) && v.some((q) => { const c = wallCoords(S, side, q); return Math.abs(c.u - u) <= tol && Math.abs(q[1] - y) <= tol && Math.abs(c.out - out) <= tol; }));

const pieces = [];                                                                          // every new piece of the free back and side walls, with the means to read its mesh
for (const [label, ctx, bps] of SETS) for (const bp of bps) {
  const tris = localTris(ctx, bp);
  for (const r of bp.facade) if (OTHER.includes(r.side) && NEW_KINDS.includes(r.kind)) pieces.push({ label, bp, r, tris });
}
const ofKind = (k, label = 'real') => pieces.filter((p) => p.r.kind === k && p.label === label);

test('no free back or side wall is a bare box: a finished building carries a fitting on each, every wall of the real barrio carries something, a party wall carries nothing, and most wear three kinds of mark or fitting', () => {
  const problems = [];
  for (const [label, , bps] of SETS) for (const bp of bps) problems.push(...bareProblems(bp, label));
  assert.deepEqual(problems, []);
  const kinds = freeWalls(real.buildings).map(({ bp, side }) => new Set(bp.facade.filter((r) => r.side === side).map((r) => r.kind)).size);
  const rich = kinds.filter((n) => n >= 3).length;
  assert.ok(kinds.length > 150 && rich >= 0.85 * kinds.length, `${rich} of ${kinds.length} free walls of the real barrio wear three kinds or more`);
  const back = real.buildings.filter((bp) => !bp.shell.party.back);
  assert.ok(back.length > 80 && back.every((bp) => bp.facade.some((r) => r.side === 'back' && WEATHER.has(r.kind))), 'every free back wall of the real barrio is weathered');
});

test('every kind of fitting the elevations add shows up on the real barrio, on the back wall and on the sides', () => {
  const n = (k, sides = OTHER) => ofKind(k).filter((p) => sides.includes(p.r.side)).length;
  assert.ok(n('hood') >= 30, `${n('hood')} zinc hoods`);
  assert.ok(n('vent') >= 50, `${n('vent')} extractors and air bricks`);
  assert.ok(n('drop') >= 2, `${n('drop')} service cables round a corner`);
  assert.ok(n('ac') >= 20, `${n('ac')} air-conditioners on the back and the sides`);
  assert.ok(n('pipe', ['back']) >= 25 && n('pipe', ['left', 'right']) >= 5, `${n('pipe', ['back'])} drainpipes on the back walls, ${n('pipe', ['left', 'right'])} on the sides`);
  for (const side of OTHER) for (const k of ['hood', 'vent', 'ac', 'pipe']) assert.ok(n(k, [side]) >= 3, `${n(k, [side])} ${k} on the ${side} walls`);
  assert.deepEqual([...new Set(ofKind('vent').map((p) => p.r.look))].sort(), ['airbrick', 'extractor'], 'both looks of a vent');
});

test('every piece is on its own wall, inside its span and the height of the building, no more than 1.3 m out, clear of every window and door and of every other fitting', () => {
  const problems = pieces.flatMap((p) => pieceProblems(p.bp, p.r));
  assert.ok(pieces.length > 300, `${pieces.length} pieces looked at`);
  assert.deepEqual(problems, []);
});

test('the pieces keep their own rules: no air-conditioner on a ground floor, a hood sits just over its window, a drainpipe stands at a corner that is not a party wall, a cable goes round the corner the front one ended at', () => {
  const problems = [], seen = (k) => pieces.filter((p) => p.r.kind === k).length;
  assert.ok(seen('ac') >= 20 && seen('hood') >= 30 && seen('pipe') >= 30 && seen('drop') >= 2, `pieces looked at: ${['ac', 'hood', 'pipe', 'drop'].map((k) => k + ' ' + seen(k)).join(', ')}`);
  for (const { label, bp, r } of pieces) {
    const S = bp.shell, sp = spanOf(S, r.side), at = `${label} ${bp.id} ${r.side} ${r.kind}`, uc = (r.u0 + r.u1) / 2;
    if (r.kind === 'ac' && r.y0 < S.fh) problems.push(`${at}: a unit on the ground floor (foot at ${r.y0})`);
    if (r.kind === 'hood') {
      const w = bp.windows.find((q) => q.id === r.window && q.side === r.side);
      if (!w) { problems.push(`${at}: hangs from no window of this wall (${r.window})`); continue; }
      const head = w.floor * S.fh + w.y + w.h, u = alongWall(r.side, w);
      if (Math.abs(r.y0 - head) > 0.01 || r.y1 - head > 0.3 || r.u0 > u - w.w / 2 || r.u1 < u + w.w / 2) problems.push(`${at}: not just over its window ${w.id} (head ${head.toFixed(2)}, hood y${r.y0}..${r.y1}, u${r.u0}..${r.u1})`);
    }
    if (r.kind === 'pipe' && r.side !== 'front') {
      if (Math.abs(r.y0 - 0.12) > 0.002 || Math.abs(r.y1 - (S.F * S.fh - 0.05)) > 0.002) problems.push(`${at}: runs y${r.y0}..${r.y1}, not from the ground to the roof edge`);
      const end = Math.abs(Math.abs(uc) - (sp / 2 - 0.1)) < 0.01;
      if (!end) problems.push(`${at}: stands at u ${uc.toFixed(2)}, not at a corner of its ${sp} m wall`);
      if (r.side === 'back' && S.party[uc < 0 ? 'left' : 'right']) problems.push(`${at}: at a corner next to a party wall`);
      if (r.side !== 'back' && uc > 0) problems.push(`${at}: on the front end of a side wall (the back end is its own)`);
    }
    if (r.kind === 'drop') {
      const cab = bp.facade.find((q) => q.kind === 'cable' && q.side === 'front');
      if (!cab) { problems.push(`${at}: a cable round the corner, but the front has none`); continue; }
      const corner = Math.abs(cab.u0) > Math.abs(cab.u1) ? Math.sign(cab.u0) : Math.sign(cab.u1), len = r.u1 - r.u0;
      if (r.side !== (corner < 0 ? 'left' : 'right')) problems.push(`${at}: the front cable ends on the ${corner < 0 ? 'left' : 'right'}`);
      if (Math.abs(r.y0 - cab.y0) > 0.002 || Math.abs(r.u1 - (sp / 2 - 0.08)) > 0.01) problems.push(`${at}: not at the height of the front run (${cab.y0}) or not starting at the corner (u1 ${r.u1})`);
      if (len < 0.7 - 1e-6 || r.clips !== Math.max(2, Math.floor(len / 0.7))) problems.push(`${at}: ${len.toFixed(2)} m with ${r.clips} clips`);
    }
  }
  assert.deepEqual(problems, []);
});

/** Is this piece really in the mesh, on its own wall? Reads the triangles back at the places the piece's own geometry has vertices. */
function drawnProblems({ bp, r, tris }, side = r.side) {
  const S = bp.shell, uc = (r.u0 + r.u1) / 2, yc = (r.y0 + r.y1) / 2, at = (mats, u, y, out, tol) => drawnAt(tris, S, side, mats, u, y, out, tol), out = [];
  if (r.kind === 'hood') {                                                                  // the slope: its top edge on the wall and its low edge 0.5 m out and 0.2 m down; the lip under it
    const low = r.y1 - 0.2;
    for (const u of [r.u0, r.u1]) {
      if (!at(['door_metal'], u, r.y1, 0.01, 0.01)) out.push(`no slope edge on the wall at u ${u}`);
      if (!at(['door_metal'], u, low, r.out, 0.01)) out.push(`no slope edge ${r.out} m out at u ${u}`);
    }
    if (!at(['rail_metal'], r.u0 + 0.04, low - 0.03, r.out, 0.04)) out.push('no lip or arm under the low edge');
  } else if (r.kind === 'vent') {
    if (r.look === 'extractor') {
      for (const sg of [-1, 1]) if (!at(['rail_metal'], uc + sg * 0.11, yc, 0.105, 0.01)) out.push(`no fan disc edge at u ${(uc + sg * 0.11).toFixed(2)}`);
      if (!at(['door_metal'], uc + 0.16, yc + 0.16, 0.1, 0.01)) out.push('no casing');
    } else {
      if (!at(['rail_metal'], uc + 0.13, yc + 0.13, 0.032, 0.01) || !at(['rail_metal'], uc - 0.13, yc - 0.13, 0.032, 0.01)) out.push('no dark opening');
      if (!at(['door_metal'], uc + 0.16, yc + 0.16, 0.03, 0.01)) out.push('no frame');
    }
  } else if (r.kind === 'drop') {                                                           // the black bundle: a box 0.03 high, 0.026 deep, 14 mm off the wall
    const yE = r.y0 + 0.1;
    for (const u of [r.u0, r.u1]) if (!at(['rail_metal'], u, yE + 0.015, 0.027, 0.01)) out.push(`no bundle end at u ${u}`);
  } else if (r.kind === 'pipe') {                                                           // the pipe: a six-sided column 0.032 m round, its axis 0.06 m off the wall
    if (!at(['tank_plastic'], uc, r.y1, 0.06, 0.04) || !at(['tank_plastic'], uc, r.y0, 0.06, 0.04)) out.push('no pipe at its ends');
  }
  return out.map((m) => `${bp.id} ${r.side} ${r.kind}${r.look ? ' ' + r.look : ''} u${r.u0}..${r.u1} y${r.y0}..${r.y1}: ${m}`);
}

test('the pieces are really in the mesh, on the wall they are recorded on: slope, fan, opening, bundle, pipe', () => {
  const todo = pieces.filter((p) => ['hood', 'vent', 'drop', 'pipe'].includes(p.r.kind) && !(p.r.kind === 'pipe' && p.r.side === 'front'));
  assert.ok(todo.length > 150, `${todo.length} pieces read back`);
  assert.deepEqual(todo.flatMap((p) => drawnProblems(p)), []);
});

test('TEETH: the checks above bite: a bare wall, a piece over a window, a piece on another piece, one off its wall, one drawn on the wrong wall are each found', () => {
  // a bare box: a real finished wall stripped of its fittings
  const bp = real.buildings.find((b) => finished(b) && !b.shell.party.back);
  assert.deepEqual(bareProblems(bp, 'real'), []);
  assert.equal(bareProblems(bp, 'real', bp.facade.filter((r) => r.side !== 'back' || WEATHER.has(r.kind))).length, 1, 'a finished back wall with marks but no fitting');
  assert.equal(bareProblems(bp, 'real', bp.facade.filter((r) => r.side !== 'back')).length, 1, 'a back wall with nothing');
  assert.equal(bareProblems(bp, 'real', [...bp.facade, { kind: 'pipe', side: 'left', u0: 0, u1: 0.1, y0: 0, y1: 1, out: 0.1 }]).length, bp.shell.party.left ? 1 : 0, 'a piece on a party wall');
  // a piece over a window, on another piece, off the wall
  const hood = ofKind('hood')[0], w = hood.bp.windows.find((q) => q.id === hood.r.window), u = alongWall(hood.r.side, w);
  assert.deepEqual(pieceProblems(hood.bp, hood.r), []);
  const over = { ...hood.r, y0: w.floor * hood.bp.shell.fh + w.y, y1: w.floor * hood.bp.shell.fh + w.y + w.h, u0: u - 0.2, u1: u + 0.2 };
  assert.ok(pieceProblems(hood.bp, over).some((m) => m.includes('covers window')), 'a hood over its own window passes');
  const dup = { ...hood.r }, bpDup = { ...hood.bp, facade: [...hood.bp.facade, dup] };
  assert.ok(pieceProblems(bpDup, hood.r).some((m) => m.includes('lies on the hood')), 'two hoods on one spot pass');
  assert.ok(pieceProblems(hood.bp, { ...hood.r, u1: spanOf(hood.bp.shell, hood.r.side) / 2 + 0.5 }).some((m) => m.includes('off the')), 'a hood past the end of its wall passes');
  assert.ok(pieceProblems(hood.bp, { ...hood.r, out: 1.6 }).some((m) => m.includes('out')), 'a hood 1.6 m out passes');
  // a piece drawn on the wrong wall: the mesh read back for another wall has none of its vertices
  for (const k of ['hood', 'vent', 'drop', 'pipe']) {
    const p = pieces.find((q) => q.label === 'real' && q.r.kind === k && q.r.side !== 'front' && q.bp.shell.W !== q.bp.shell.D);
    assert.deepEqual(drawnProblems(p), [], `a real ${k} reads back`);
    const other = OTHER.find((s) => s !== p.r.side && !p.bp.shell.party[s]) ?? 'front';
    assert.ok(drawnProblems(p, other).length > 0, `a ${k} on the ${p.r.side} wall reads back as drawn on the ${other}`);
  }
  const vent = ofKind('vent').find((p) => p.r.look === 'extractor'), airbrick = ofKind('vent').find((p) => p.r.look === 'airbrick');
  assert.ok(drawnProblems({ ...vent, r: { ...vent.r, look: 'airbrick' } }).length > 0, 'an extractor read back as an air brick');
  assert.ok(drawnProblems({ ...airbrick, r: { ...airbrick.r, look: 'extractor' } }).length > 0, 'an air brick read back as an extractor');
});
