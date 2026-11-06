// node --test js/sim/gait_sole.test.mjs
// The shoe the gait stands on (gait.footProfile): the rendered sole itself, not the three-point model of it. Measured on the real characters by tools (the lowest rendered shoe
// vertex against the floor, tools/people_motion.mjs); tested here without a browser with shoes whose every vertex is written down, posed through the solved skeleton the way a
// skinned mesh would be, so the check does not share the profile's own arithmetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE, PEOPLE, G } from './gait_emu.mjs';

const rigOf = (id) => { const c = FIXTURE.chars[id]; return { bones: FIXTURE.bones, parent: FIXTURE.parent, pos: c.pos, quat: c.quat }; };
const bodyWith = (id, prof, profR, extra) => G.makeBody(rigOf(id), Object.assign({}, FIXTURE.chars[id].foot, { prof, profR }, extra));
const rng = (seed) => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const D2R = Math.PI / 180;

// ------------------------------------------------------------------------------------------------------------------------ shoes written down vertex by vertex
// A vertex is [x, y, z, wFoot, wToe] in the rest pose with the soles on y = 0 (the fixture's frame).
/** a sprung, chamfered shoe (a rocker): heel chamfered, flat sole to the ball of the foot, toe sprung up `spring` (18 mm) at the tip, a bend blended over the joint, a collar high above */
function rocker(B, { spring = 0.018, chamfer = 0.006, fore = 0 } = {}) {
  const an = B.P0[B.ix.foot_l], ba = B.P0[B.ix.ball_l], x = an[0], bz = ba[2], tip = an[2] - B.toeFwd, V = [], k = spring / 0.018;
  const rear = (z, y) => V.push([x, y, z, 1, 0]), front = (z, y) => V.push([x, y, z, 0, 1]), mix = (z, y, wb) => V.push([x, y, z, 1 - wb, wb]);
  rear(an[2] + B.heelBack, 0.022 + chamfer); rear(an[2] + 0.052, chamfer); rear(an[2] + 0.044, 0); rear(an[2], 0); rear(bz + 0.02, 0);   // heel counter, chamfer, sole to the ball
  rear(an[2] + B.heelBack, 0.07); rear(an[2] - 0.05, 0.09); rear(an[2] + 0.03, 0.095);                                       // the quarter and the collar
  mix(bz + 0.012, 0, 0.25); mix(bz, 0, 0.5); mix(bz - 0.012, 0.001, 0.75);                                                    // the bend
  for (const [f, y] of [[0.25, 0.002], [0.5, 0.005], [0.75, 0.011], [1, 0.018]]) front(bz + f * (tip - bz), y * k);            // the toe spring, to the tip
  front(tip + 0.012, 0.045); front(bz - 0.03, 0.05);                                                                          // the toe cap
  for (const v of V) if (v[2] < an[2] - 0.02) v[1] += fore;                                                                   // `fore`: a forefoot whose sole stands that much higher
  return V;
}
/** the same shoe with nothing but the three points of the gait's own model on its sole: heel, ball of the foot, toe tip (and a few vertices up out of the way) */
function flatThree(B) {
  const an = B.P0[B.ix.foot_l], ba = B.P0[B.ix.ball_l], x = an[0], tip = an[2] - B.toeFwd;
  return [[x, 0, an[2] + B.heelBack, 1, 0], [x, 0, ba[2], 1, 0], [x, 0.08, an[2], 1, 0], [x, 0, tip, 0, 1], [x, 0.04, tip + 0.012, 0, 1], [x, 0.05, ba[2] - 0.03, 0, 1]];
}
const profOf = (B, V) => G.footProfile(B.P0[B.ix.foot_l], B.P0[B.ix.ball_l], V);

// ------------------------------------------------------------------------------------------------------------------------ the hull is the whole shoe, as far as height goes
test('a profile gives exactly the lowest vertex of the shoe, for every foot and toe pitch', () => {
  const r = rng(7);
  for (const id of PEOPLE) {
    const B0 = bodyOf(id), an = B0.P0[B0.ix.foot_l], ba = B0.P0[B0.ix.ball_l], V = [];
    for (let i = 0; i < 200; i++) V.push([an[0], 0.09 * r(), an[2] - 0.14 + 0.22 * r(), 1, 0]);                       // rear: anywhere under the foot
    for (let i = 0; i < 120; i++) V.push([an[0], 0.05 * r(), ba[2] - 0.12 * r(), 0, 1]);                              // front: ahead of the joint
    for (let i = 0; i < 40; i++) { const w = 0.05 + 0.9 * r(); V.push([an[0], 0.04 * r(), ba[2] + 0.04 * (r() - 0.5), 1 - w, w]); }   // the bend
    const prof = G.footProfile(an, ba, V), B = bodyWith(id, prof), o = B.leg[0], off = (v, p) => G.sub(v, p);
    assert.ok(prof && prof.rear.length / 2 < 60, 'the rear hull is a short list: ' + (prof && prof.rear.length / 2));
    for (let k = 0; k < 400; k++) {
      const th = (-80 + 110 * r()) * D2R, thb = (th >= 0 ? th : 60 * r() * D2R);
      // brute force, with quaternions: every vertex posed as the skinning poses it (the foot turns about the ankle, the toe bone about the ball joint)
      let m = Infinity;
      for (const v of V) {
        const w = v[4] / (v[3] + v[4]), pa = G.qrot(G.qx(th), off(v, an)), pb = G.add(G.qrot(G.qx(th), off(ba, an)), G.qrot(G.qx(thb), off(v, ba))), h = (1 - w) * pa[1] + w * pb[1];
        if (h < m) m = h;
      }
      assert.ok(Math.abs(G.lowestRel(o, th, thb) - m) < 1e-9, `${id} th ${(th / D2R).toFixed(1)} thb ${(thb / D2R).toFixed(1)}: ${G.lowestRel(o, th, thb)} vs ${m}`);
    }
  }
});

test('a shoe too thin to give a profile gives none, and the body then stands on its three points as before', () => {
  const B = bodyOf(PEOPLE[0]), an = B.P0[B.ix.foot_l], ba = B.P0[B.ix.ball_l];
  assert.equal(G.footProfile(an, ba, []), null);
  assert.equal(G.footProfile(an, ba, [[an[0], 0, an[2], 1, 0], [an[0], 0, an[2] + 0.05, 1, 0], [an[0], 0, an[2] - 0.05, 1, 0]]), null, 'no toe');
  assert.equal(G.footProfile(an, ba, [[an[0], 0, an[2], 0.3, 0], [an[0], 0, an[2] + 0.05, 0.2, 0], [an[0], 0, an[2] - 0.05, 0.3, 0], [an[0], 0, ba[2] - 0.05, 0, 0.1]]), null, 'a collar is not a shoe');
  assert.equal(B.leg[0].prof, null);
});

test('the lowest vertex is reported even when it carries weight on the calf, and a collar vertex that is mostly calf is left out', () => {
  const B = bodyOf(PEOPLE[0]), an = B.P0[B.ix.foot_l], ba = B.P0[B.ix.ball_l], x = an[0], V = rocker(B);
  const p0 = profOf(B, V);
  const heel = [x, 0, an[2] + 0.03, 0.88, 0], collar = [x, 0.06, an[2], 0.4, 0];
  const p1 = G.footProfile(an, ba, V.concat([heel, collar]));
  assert.ok(p1.rear.length > p0.rear.length - 2, 'the heel vertex with 12 % calf is in the rear hull');
  const o0 = bodyWith(PEOPLE[0], p0).leg[0], o1 = bodyWith(PEOPLE[0], p1).leg[0];
  assert.equal(G.lowestRel(o0, 0, 0), G.lowestRel(o1, 0, 0), 'the extra vertices are not lower than the flat sole at rest');
});

// ------------------------------------------------------------------------------------------------------------------------ a profile that IS the three points changes nothing
const gait = (B, v, secs, onFrame) => {
  const g = G.newGait(B, { armOut: [6, 6] }), dt = 1 / 60; let z = 0, pv = 0; const n = Math.round(secs / dt);
  for (let k = 0; k < n; k++) {
    const want = k < n * 0.75 ? v : 0; pv += (want - pv) * Math.min(1, dt * 12); z -= pv * dt;   // walks, then stops (the last quarter: the feet are brought together)
    G.gaitUpdate(g, dt, { x: 0, z, yaw: 0, v: pv, walking: k < n * 0.75 });
    onFrame(k, g);
  }
};
test('a shoe that is just the gait\'s own three points (heel, ball of the foot, toe tip) lands the ankles exactly where the three-point sole does (the pivot model: roll off)', () => {
  for (const id of PEOPLE) for (const v of [0.6, 1.2, 1.7]) {
    const B0 = bodyOf(id), B1 = bodyWith(id, profOf(B0, flatThree(B0)), undefined, { roll: false }), rec = [];
    assert.ok(B1.leg[0].prof);
    gait(B0, v, 7, (k, g) => rec.push(g.feet.map((f) => f.cur.A.concat(f.cur.th, f.cur.thb))));
    let k = 0, worst = 0;
    gait(B1, v, 7, (_, g) => { g.feet.forEach((f, s) => { const a = f.cur.A.concat(f.cur.th, f.cur.thb); for (let i = 0; i < 5; i++) worst = Math.max(worst, Math.abs(a[i] - rec[k][s][i])); }); k++; });
    // not 1e-9: the three-point model itself leaves a landmark up to 0.2 micron off the floor in a few frames of terminal stance (measured: 0.19 micron at most, over every person and speed here),
    // and the profile - which puts the lowest of the same three points exactly on it - removes that, and the swing that follows carries the difference. A micron is far below anything drawn.
    assert.ok(worst < 1e-6, `${id} @ ${v}: the ankles differ by ${worst}`);
  }
});

// ------------------------------------------------------------------------------------------------------------------------ the rocker stands on the floor
/** pose a shoe written down vertex by vertex through the solved skeleton, as skinning would, and return the lowest vertex of each foot (m above the floor) */
function lowestPosed(B, V0, sol, VR) {
  const fk = G.gaitFK(B, sol), ix = B.ix, out = [];
  for (const s of ['l', 'r']) {
    const fb = ix['foot_' + s], bb = ix['ball_' + s], mir = s === 'r' ? -1 : 1, V = s === 'r' && VR ? VR : V0;
    const carry = (bi, wp) => G.add(fk.P[bi], G.qrot(fk.Q[bi], G.qrot(G.qinv(B.Q0[bi]), G.sub(wp, B.P0[bi]))));
    let m = Infinity;
    for (const v of V) {
      const wp = [v[0] * mir, v[1], v[2]], w = v[4] / (v[3] + v[4]), pf = carry(fb, wp), pb = carry(bb, wp), y = (1 - w) * pf[1] + w * pb[1];
      if (y < m) m = y;
    }
    out.push(m);
  }
  return out;
}
function rockerWalk(id, v, withProfile) {
  const B0 = bodyOf(id), V = rocker(B0), B = withProfile ? bodyWith(id, profOf(B0, V)) : B0, st = { frames: 0, stand: [], sink: 0, hover: 0, swingLow: 0 };
  gait(B, v, 9, (k, g) => {
    if (k < 180 || k > 440) return;   // steady: from three seconds in, before the stop
    const T = G.gaitTargets(g), sol = G.gaitSolve(g, T), low = lowestPosed(B, V, sol);
    st.frames++; st.sink = Math.max(st.sink, -Math.min(...low)); st.hover = Math.max(st.hover, Math.min(...low));
    g.feet.forEach((f, s) => { if (f.mode === 'stance') st.stand.push(low[s]); });
  });
  return st;
}
test('a walker on rocker soles keeps the lowest point of the shoe on the floor through the whole stride: no hovering heel strike, no dipping push-off', () => {
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) {
    const p = rockerWalk(id, v, true), mm = (x) => (x * 1000).toFixed(2);
    assert.ok(p.frames > 200);
    assert.ok(p.sink < 0.0015, `${id} @ ${v}: the shoe dips ${mm(p.sink)} mm into the floor`);
    assert.ok(p.hover < 0.0015, `${id} @ ${v}: neither shoe is on the floor, the lower one is ${mm(p.hover)} mm above it`);
    assert.ok(Math.max(...p.stand.map(Math.abs)) < 0.0035, `${id} @ ${v}: a planted shoe is ${mm(Math.max(...p.stand.map(Math.abs)))} mm off the floor`);
  }
});
test('the same walk on the three-point sole does not (control: the test can see the error the profile removes)', () => {
  let worst = 0;
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) { const p = rockerWalk(id, v, false); worst = Math.max(worst, p.hover, p.sink); }
  assert.ok(worst > 0.004, `the three-point sole should hover or dip by more than 4 mm on a rocker: ${(worst * 1000).toFixed(2)} mm`);
});
function bodyOf(id) { return G.makeBody(rigOf(id), FIXTURE.chars[id].foot); }

// ------------------------------------------------------------------------------------------------------------------------ the shoe ROLLS: the vertex it stands on stays still
test('on a three-point shoe the rolling foot and the heel pivot are the same thing while the toes are up (the rolling table is integrated the right way round)', () => {
  for (const id of PEOPLE) for (const v of [0.6, 1.2, 1.7]) {
    const B0 = bodyOf(id), Br = bodyWith(id, profOf(B0, flatThree(B0))), Bp = bodyWith(id, profOf(B0, flatThree(B0)), undefined, { roll: false }), rec = [];
    assert.ok(Br.leg[0].roll && !Bp.leg[0].roll);
    gait(Bp, v, 7, (k, g) => rec.push(g.feet.map((f) => ({ A: f.cur.A.slice(), th: f.cur.th }))));
    let k = 0, worst = 0, n = 0;
    gait(Br, v, 7, (_, g) => { g.feet.forEach((f, s) => { const a = f.cur, b = rec[k][s]; if (f.mode === 'stance' && a.th > 0.02 && a.th === b.th) { worst = Math.max(worst, Math.hypot(a.A[0] - b.A[0], a.A[2] - b.A[2])); n++; } }); k++; });
    assert.ok(n > 30, `${id} @ ${v}: only ${n} heel-strike frames`);
    assert.ok(worst < 1e-5, `${id} @ ${v}: the ankle is ${(worst * 1e6).toFixed(1)} micron off the heel pivot at heel strike`);
  }
});
/** pose every vertex of one shoe through the solved skeleton, as skinning would, and return [x, y, z] of each (node frame) */
function poseAll(B, V, sol, s) {
  const fk = G.gaitFK(B, sol), ix = B.ix, fb = ix['foot_' + s], bb = ix['ball_' + s], mir = s === 'r' ? -1 : 1;
  const carry = (bi, wp) => G.add(fk.P[bi], G.qrot(fk.Q[bi], G.qrot(G.qinv(B.Q0[bi]), G.sub(wp, B.P0[bi]))));
  return V.map((v) => { const wp = [v[0] * mir, v[1], v[2]], w = v[4] / (v[3] + v[4]), pf = carry(fb, wp), pb = carry(bb, wp); return [0, 1, 2].map((i) => (1 - w) * pf[i] + w * pb[i]); });
}
/** the way tools/people_motion measures a skating foot: the lowest vertex of each shoe at each frame, its OWN speed (the same vertex one frame either side), taken while it is within 8 mm of the
 *  floor and not lifting (|vy| <= 0.12 m/s). Returns the RMS (cm/s) over the frames that are neither a landing nor a lift-off (no swing frame within one either side of them), and over all of them. */
function rockerSlip(id, v, roll) {
  const B0 = bodyOf(id), V = rocker(B0), B = bodyWith(id, profOf(B0, V), undefined, { roll }), dt = 1 / 60, F = [[], []];
  gait(B, v, 9, (k, g) => {
    if (k < 150 || k > 450) return;
    const sol = G.gaitSolve(g, G.gaitTargets(g));
    ['l', 'r'].forEach((s, si) => { const P = poseAll(B, V, sol, s).map((p) => [p[0] + g.x, p[1], p[2] + g.z]); let m = 0; for (let i = 1; i < P.length; i++) if (P[i][1] < P[m][1]) m = i; F[si].push({ P, m, swing: g.feet[si].mode === 'swing' }); });
  });
  const planted = [], all = [];
  for (let si = 0; si < 2; si++) for (let k = 1; k < F[si].length - 1; k++) {
    const m = F[si][k].m, a = F[si][k - 1].P[m], b = F[si][k + 1].P[m], c = F[si][k].P[m], vy = (b[1] - a[1]) / (2 * dt);
    if (c[1] > 0.008 || Math.abs(vy) > 0.12) continue;
    const w = 100 * Math.hypot(b[0] - a[0], b[2] - a[2]) / (2 * dt); all.push(w);
    if (!F[si][k - 1].swing && !F[si][k].swing && !F[si][k + 1].swing) planted.push(w);
  }
  const r = (a) => Math.sqrt(a.reduce((x, y) => x + y * y, 0) / a.length);
  return { planted: r(planted), all: r(all), n: planted.length };
}
test('a walker on rocker soles does not skate: the vertex the shoe stands on stays still through heel strike, flat foot and push-off', () => {
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) {
    const p = rockerSlip(id, v, true);
    assert.ok(p.n > 200, `${id} @ ${v}: ${p.n} planted frames`);
    assert.ok(p.planted < 0.5, `${id} @ ${v}: the planted shoe slides at ${p.planted.toFixed(2)} cm/s RMS`);
  }
});
test('the same walk pivoting on the heel and then on a point half way up the ball joint skates (control: the test can see the error rolling removes)', () => {
  let worst = 0;
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) worst = Math.max(worst, rockerSlip(id, v, false).planted);
  assert.ok(worst > 1.5, `the pivot model should skate by more than 1.5 cm/s on a rocker: ${worst.toFixed(2)} cm/s`);
});

// ------------------------------------------------------------------------------------------------------------------------ and it does not make the ankle jump
test('taking the ankle\'s height from the shoe does not add a jump: its frame-to-frame step is no worse than the three-point sole\'s, plus a millimetre', () => {
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) {
    const stepOf = (withProfile) => {
      const B0 = bodyOf(id), B = withProfile ? bodyWith(id, profOf(B0, rocker(B0))) : B0; let prev = null, worst = 0;
      gait(B, v, 9, (k, g) => { const y = g.feet.map((f) => f.cur.A[1]); if (prev && k > 120) for (let s = 0; s < 2; s++) worst = Math.max(worst, Math.abs(y[s] - prev[s])); prev = y; });
      return worst;
    };
    const a = stepOf(false), b = stepOf(true);
    assert.ok(b <= a + 0.001, `${id} @ ${v}: the ankle steps ${(b * 1000).toFixed(2)} mm in a frame against ${(a * 1000).toFixed(2)} mm`);
  }
});

// ------------------------------------------------------------------------------------------------------------------------ each foot on its own shoe
test('each foot stands on its own shoe: where the right shoe is not the left one mirrored, the right foot is still on the floor (and is not when it borrows the left one\'s profile)', () => {
  let worstShared = 0;
  for (const id of PEOPLE) for (const v of [0.8, 1.2, 1.6]) {
    const B0 = bodyOf(id), VL = rocker(B0), VR = rocker(B0, { spring: 0.034, chamfer: 0.012, fore: 0.008 });   // a right shoe with a higher toe spring, a bigger chamfer and a forefoot sole 8 mm higher than the left's
    const run = (B) => {
      const st = { sink: 0, hover: 0, planted: 0 };
      gait(B, v, 9, (k, g) => {
        if (k < 180 || k > 440) return;
        const low = lowestPosed(B, VL, G.gaitSolve(g, G.gaitTargets(g)), VR);
        st.sink = Math.max(st.sink, -low[1]); st.hover = Math.max(st.hover, low[1]);   // the right foot
        if (g.feet[1].mode === 'stance') st.planted = Math.max(st.planted, Math.abs(low[1]));
      });
      return st;
    };
    const own = run(bodyWith(id, profOf(B0, VL), profOf(B0, VR))), shared = run(bodyWith(id, profOf(B0, VL))), mm = (x) => (x * 1000).toFixed(2);
    assert.ok(own.sink < 0.0015 && own.planted < 0.0035, `${id} @ ${v}: the right foot on its own profile sinks ${mm(own.sink)} mm, planted ${mm(own.planted)} mm off the floor`);
    worstShared = Math.max(worstShared, shared.sink, shared.planted);
  }
  assert.ok(worstShared > 0.004, `the control: the right foot on the left shoe's profile should be several mm out (it is ${(worstShared * 1000).toFixed(2)} mm at worst)`);
});
