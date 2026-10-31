// A2: the geometry diet of window and door frames (js/arch/shellwin.js), R2a "uncapped render cost over 12 ms": `frame_paint` was the fattest material in both passes
// (199 k triangles in the camera's frustum, 126-180 k in the sun's). A window frame is four boxes against the jambs, the head and the sill, a casing is three boxes 16 mm
// proud of the wall: of a box's six faces at most three are ever seen. What must hold now, on the real barrio and on the test lots:
//  * nothing is drawn that is covered by what it touches (no face against a jamb, a neighbouring bar, the head or the sill);
//  * everything that can be seen is still there (the street and the room face of every bar, the edges that look into the opening, the painted band, both faces of every casing);
//  * so the bill is exact: a plain window 24 triangles, a door casing 12 a face (a window's mullion, transom, louvre slats and painted band are counted on top).
// Measured with the facade dressing off (`ctx.noFacade`: signs, awnings and balconies add frame_paint of their own, they are not under test here).
// node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/arch-diet.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { testLots, planAll, localTris, coveredBy, coveredOn } from './arch-lib.mjs';
import { buildData } from './headless.mjs';
import { buildBuilding } from '../js/arch/index.js';
import { OUT } from '../js/arch/mb.js';
import { archRise, buildWindows } from '../js/arch/shellwin.js';
import { makeG } from '../js/arch/shell.js';

const real = await buildData({ furnish: false, seed: process.env.ARCH_SEED ? Number(process.env.ARCH_SEED) : undefined });   // ARCH_SEED: stress another plan; the default is the barrio
real.ctx.noFacade = true;
for (const bp of real.buildings) buildBuilding(real.ctx, bp);
const synth = planAll(testLots(), undefined, true, 0.4, 0);
synth.ctx.noFacade = true;
for (const bp of synth.bps) buildBuilding(synth.ctx, bp);
const SETS = [['real', real.ctx, real.buildings], ['test', synth.ctx, synth.bps]];

const FRAME = 0.05, DEPTH = 0.07, CW = 0.075, CDEP = 0.016, BW = 0.085, BDEP = 0.014, EPS = 2e-3;
const FP = (tris) => tris.filter((t) => t.k === 'frame_paint');
/** A window as the wall sees it: u along the wall, y up, a across it (planes of the frame, of the outer face and of the painted band). */
function windowOf(bp, w) {
  const S = bp.shell, dir = w.side === 'front' || w.side === 'back' ? 'x' : 'z', s = OUT[w.side], uc = dir === 'x' ? w.x : w.z, at = dir === 'x' ? w.z : w.x, y0 = w.floor * S.fh + w.y;
  return { w, dir, s, uc, ww: w.w, y0, y1: y0 + w.h, pF: at + s * (S.te / 2 - 0.1), pBand: at + s * (S.te / 2 + BDEP) };
}
/** The wall coordinates of a local vertex: [u, y, a]. */
const wall = (dir, q) => (dir === 'x' ? [q[0], q[1], q[2]] : [q[2], q[1], q[0]]);
/** The triangles whose three vertices all lie in the box u0..u1 x y0..y1 x a0..a1 (wall coordinates). */
function within(tris, dir, [u0, u1], [y0, y1], [a0, a1]) {
  const lo = Math.min(a0, a1) - EPS, hi = Math.max(a0, a1) + EPS;
  return tris.filter(({ v }) => v.every((q) => { const [u, y, a] = wall(dir, q); return u >= u0 - EPS && u <= u1 + EPS && y >= y0 - EPS && y <= y1 + EPS && a >= lo && a <= hi; }));
}
/** The unit normal of a triangle in wall coordinates [u, y, a] (taken in local space, where the winding means what it says: u, y, a is a mirror image of x, y, z on a z wall). */
const unit = (dir, { v }) => {
  const e = (p, q) => [q[0] - p[0], q[1] - p[1], q[2] - p[2]], a = e(v[0], v[1]), b = e(v[0], v[2]);
  const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], l = Math.hypot(...n) || 1;
  return wall(dir, n.map((x) => x / l));
};
/** Window openings the budget and visibility tests look at: the round-headed ones have a test of their own (arch-doors). */
function* windows(tag, bp) { for (const w of bp.windows) if (!archRise(w)) yield [`${tag} ${bp.id} ${w.id} (${w.kind})`, windowOf(bp, w)]; }
/** Where a window's own frame_paint lies: from the back of the frame to the front of the painted band, across the whole band round it. */
const windowZone = (tris, o) => within(tris, o.dir, [o.uc - o.ww / 2 - BW, o.uc + o.ww / 2 + BW], [o.y0 - BW, o.y1 + BW], [o.pF - o.s * DEPTH / 2, o.pBand]);

test('a window frame draws no face that lies against a jamb, a neighbouring bar, the head or the sill', () => {
  let n = 0;
  for (const [tag, ctx, bps] of SETS) for (const bp of bps) {
    const fp = FP(localTris(ctx, bp));
    for (const [at, o] of windows(tag, bp)) {
      n++;
      const L = o.uc - o.ww / 2, R = o.uc + o.ww / 2;
      for (const t of windowZone(fp, o)) {
        const [nu, ny] = unit(o.dir, t), [u, y] = wall(o.dir, t.v[0]), near = (a, b) => Math.abs(a - b) < EPS;
        assert.ok(!(nu < -0.99 && (near(u, L) || near(u, L + FRAME))), `${at}: a face looking -u at u=${u.toFixed(3)} lies against the left jamb or the left post`);
        assert.ok(!(nu > 0.99 && (near(u, R) || near(u, R - FRAME))), `${at}: a face looking +u at u=${u.toFixed(3)} lies against the right jamb or the right post`);
        assert.ok(!(ny > 0.99 && (near(y, o.y1) || near(y, o.y1 - FRAME))), `${at}: a face looking up at y=${y.toFixed(3)} lies against the head or the bottom of the mullion`);
        assert.ok(!(ny < -0.99 && (near(y, o.y0) || near(y, o.y0 + FRAME))), `${at}: a face looking down at y=${y.toFixed(3)} lies against the sill or the foot of the mullion`);
      }
    }
  }
  assert.ok(n >= 1400, `${n} windows checked`);
});

test('everything of a window frame that can be seen is there: both faces of every bar, the edges into the opening, and the painted band all round or not at all', () => {
  let n = 0, bands = 0;
  for (const [tag, ctx, bps] of SETS) for (const bp of bps) {
    const fp = FP(localTris(ctx, bp)), cov = (o, plane, face, u, y) => coveredBy(fp, o.dir, plane, face, ['frame_paint'], u, y);
    for (const [at, o] of windows(tag, bp)) {
      n++;
      const { w, dir, s, uc, ww, y0, y1, pF } = o, ym = (y0 + y1) / 2, L = uc - ww / 2, R = uc + ww / 2;
      for (const [plane, face, name] of [[pF + s * DEPTH / 2, s, 'street'], [pF - s * DEPTH / 2, -s, 'room']]) {
        assert.ok(cov(o, plane, face, L + FRAME / 2, ym), `${at}: no ${name} face on the left post`);
        assert.ok(cov(o, plane, face, R - FRAME / 2, ym), `${at}: no ${name} face on the right post`);
        assert.ok(cov(o, plane, face, uc, y1 - FRAME / 2), `${at}: no ${name} face on the head`);
        assert.ok(cov(o, plane, face, uc, y0 + FRAME / 2), `${at}: no ${name} face on the sill bar`);
      }
      const edge = (u, face, y) => (dir === 'x' ? coveredOn(fp, 0, u, face, ['frame_paint'], y, pF) : coveredOn(fp, 2, u, face, ['frame_paint'], pF, y));      // a plane across the wall: u = const
      const flat = (y, face, u) => (dir === 'x' ? coveredOn(fp, 1, y, face, ['frame_paint'], u, pF) : coveredOn(fp, 1, y, face, ['frame_paint'], pF, u));          // a horizontal plane: y = const
      assert.ok(edge(L + FRAME, 1, ym), `${at}: the left post shows no edge into the opening`);
      assert.ok(edge(R - FRAME, -1, ym), `${at}: the right post shows no edge into the opening`);
      assert.ok(flat(y1 - FRAME, -1, uc), `${at}: the head shows no underside`);
      assert.ok(flat(y0 + FRAME, 1, uc), `${at}: the sill bar shows no top`);
      const band = [[L - BW / 2, ym], [R + BW / 2, ym], [uc, y1 + BW / 2]].map(([u, y]) => cov(o, o.pBand, s, u, y));
      assert.ok(band.every(Boolean) || !band.some(Boolean), `${at}: the painted band is cut short (${band})`);
      if (band[0]) { bands++; assert.notEqual(w.kind, 'fixed', `${at}: a fixed light has no painted band`); }
    }
  }
  assert.ok(n >= 1400 && bands >= 700, `${n} windows, ${bands} with a painted band`);
});

test('what a window costs: 24 triangles of frame, 8 for a mullion or a transom, 6 for each louvre slat, 6 for the painted band, and nothing else', () => {
  let n = 0;
  for (const [tag, ctx, bps] of SETS) for (const bp of bps) {
    const fp = FP(localTris(ctx, bp));
    for (const [at, o] of windows(tag, bp)) {
      n++;
      const { w, ww, y0, y1 } = o, h = w.h, got = windowZone(fp, o).length, band = within(fp, o.dir, [o.uc - ww / 2 - BW, o.uc + ww / 2 + BW], [y0 - BW, y1 + BW], [o.pBand, o.pBand]).length;
      let want = 24;
      if (w.kind === 'louvre') want += 6 * Math.max(3, Math.floor(((y1 - FRAME) - (y0 + FRAME)) / 0.075));       // (the same float sums as the builder: the count sits on a knife edge)
      else if (w.kind === 'casement' || w.kind === 'sliding') want += 8 + (h > 1.35 ? 8 : 0);
      else if (ww > 1.7) want += 8;
      assert.ok(band === 0 || band === 6, `${at}: ${band} triangles in the painted band`);
      assert.equal(got, want + band, `${at}: ${got} frame_paint triangles in the window, ${want + band} expected`);
    }
  }
  assert.ok(n >= 1400, `${n} windows`);
});

test('the parts the barrio does not use yet are as lean: a tall casement window has a mullion and a transom (8 triangles each), a wide fixed light a mullion', () => {
  // no window of the data is tall enough for a transom or a wide fixed light, so the planner's windows cannot reach those lines: build two by hand on a test lot
  const { ctx, bps } = planAll(testLots().slice(0, 1), undefined, false, 0.4, 0), bp = bps[0], S = bp.shell;
  const mk = (id, over) => ({ id, room: bp.rooms[0].id, floor: 0, side: 'front', x: 0, z: S.D / 2, y: 0.5, w: 1.2, h: 1.0, kind: 'casement', grille: false, ...over });
  const cost = (w) => {
    bp.windows = [w];
    const G = makeG(ctx, bp);
    buildWindows(G);
    return ctx.batch.flush(bp.id + '.ext').filter((m) => m.userData.matKey === 'frame_paint').reduce((a, m) => a + m.geometry.index.count / 3, 0);
  };
  const band = (c, base) => { assert.ok(c === base || c === base + 6, `${c} frame_paint triangles, ${base} (+6 for the painted band) expected`); };
  band(cost(mk('T.plain', {})), 24 + 8);                                                       // a plain casement: frame + mullion
  band(cost(mk('T.tall', { y: 0.4, h: 1.6 })), 24 + 8 + 8);                                    // taller than 1.35 m: and a transom
  assert.equal(cost(mk('T.wide', { kind: 'fixed', w: 1.9 })), 24 + 8, 'a fixed light wider than 1.7 m: frame + mullion, no painted band');
  assert.equal(cost(mk('T.fixed', { kind: 'fixed', w: 1.2 })), 24, 'a plain fixed light: the frame alone');
});

test('a door casing is a 16 mm band: the three bars as faces and the three edges that look into the opening, 12 triangles a face, on both faces of a room door', () => {
  let n = 0, faces = 0;
  for (const [tag, ctx, bps] of SETS) for (const bp of bps) {
    const fp = FP(localTris(ctx, bp)), S = bp.shell;
    for (const d of bp.doors) {
      if (d.kind === 'arch') continue;
      n++;
      const dir = d.wall.dir, t = d.wall.t, at = d.wall.at, uc = dir === 'x' ? d.x : d.z, yk = d.floor * S.fh, ua = uc - d.w / 2, ub = uc + d.w / 2, yt = yk + d.h;
      for (const sd of d.ext ? [OUT[d.side]] : [1, -1]) {
        faces++;
        const pf = at + sd * (t / 2 + CDEP), pm = at + sd * (t / 2 + CDEP / 2), name = `${tag} ${bp.id} ${d.id} (${d.kind}) face ${sd}`;
        const got = within(fp, dir, [ua - CW, ub + CW], [yk, yt + CW], [at + sd * t / 2, pf]).length;
        assert.equal(got, 12, `${name}: ${got} frame_paint triangles in the casing, 12 expected`);
        const front = (u, y) => coveredBy(fp, dir, pf, sd, ['frame_paint'], u, y);
        assert.ok(front(ua - CW / 2, yk + d.h / 2) && front(ub + CW / 2, yk + d.h / 2), `${name}: a jamb has no face`);
        assert.ok(front(uc, yt + CW / 2), `${name}: the head has no face`);
        const edge = (u, face) => (dir === 'x' ? coveredOn(fp, 0, u, face, ['frame_paint'], yk + d.h / 2, pm) : coveredOn(fp, 2, u, face, ['frame_paint'], pm, yk + d.h / 2));
        assert.ok(edge(ua, 1) && edge(ub, -1), `${name}: a jamb shows no edge into the opening`);
        assert.ok(dir === 'x' ? coveredOn(fp, 1, yt, -1, ['frame_paint'], uc, pm) : coveredOn(fp, 1, yt, -1, ['frame_paint'], pm, uc), `${name}: the head shows no soffit`);
      }
    }
  }
  assert.ok(n >= 1000 && faces > n, `${n} casings, ${faces} faces`);
});

test('a window sill is a five-faced slab: the sixth face lies 25 mm inside the wall and is not built, the other five are', () => {
  let n = 0;
  for (const [tag, ctx, bps] of SETS) for (const bp of bps) {
    const cb = localTris(ctx, bp).filter((t) => t.k === 'concrete_bare'), S = bp.shell;
    for (const w of bp.windows) {
      n++;
      const { dir, s, uc, ww, y0 } = windowOf(bp, w), pOut = (dir === 'x' ? w.z : w.x) + s * S.te / 2, name = `${tag} ${bp.id} ${w.id}`;
      const U = ww / 2 + 0.08, a0 = pOut - s * 0.025, a1 = pOut + s * 0.085, am = (a0 + a1) / 2, yb = y0 - 0.05, ym = y0 - 0.025, M = ['concrete_bare'];
      const zone = within(cb, dir, [uc - U, uc + U], [yb, y0], [a0, a1]);
      assert.equal(zone.length, 10, `${name}: ${zone.length} triangles in the sill, 10 (five faces) expected`);
      assert.ok(zone.every((t) => unit(dir, t)[2] * s > -0.99), `${name}: a face of the sill looks into the wall`);
      assert.ok(coveredBy(cb, dir, a1, s, M, uc, ym), `${name}: the sill has no front`);
      const flat = (y, face) => (dir === 'x' ? coveredOn(cb, 1, y, face, M, uc, am) : coveredOn(cb, 1, y, face, M, am, uc));
      assert.ok(flat(y0, 1), `${name}: the sill has no top`);
      assert.ok(flat(yb, -1), `${name}: the sill has no underside`);
      const end = (u, face) => (dir === 'x' ? coveredOn(cb, 0, u, face, M, ym, am) : coveredOn(cb, 2, u, face, M, am, ym));
      assert.ok(end(uc - U, -1) && end(uc + U, 1), `${name}: a sill end is missing`);
    }
  }
  assert.ok(n >= 1400, `${n} windows`);
});
