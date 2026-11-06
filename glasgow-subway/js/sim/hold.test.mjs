// node --test js/sim/hold.test.mjs
// The maths of a person holding a phone (js/sim/hold.js, and the grips phone.js derives from it), tested without a browser or a skeleton: the arm reaches what it is told to reach, the
// bones keep their lengths, the elbow bends the way an elbow does, the phone faces the eyes (or the head), both hands hold it from behind, and nothing turns to NaN on a degenerate input.
import test from 'node:test';
import assert from 'node:assert/strict';
import { PHONE, VIEW, HAND, GRIP, arc, axisAngle, signedAngle, fromBasis, twoBone, phonePose, holdHands, gripInHand, solveArm } from './hold.js';
import { GRIPS } from './phone.js';
import { add, sub, mul, dot, cross, len, nrm, qmul, qinv, qrot } from './gait.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ''} ${a} vs ${b} (tolerance ${tol})`);
const nearV = (a, b, tol, msg) => assert.ok(len(sub(a, b)) <= tol, `${msg || ''} [${a.map((x) => x.toFixed(4))}] vs [${b.map((x) => x.toFixed(4))}] (tolerance ${tol})`);
const finite = (v) => v.every(Number.isFinite);
const unitQ = (q, msg) => { assert.ok(finite(q), `${msg || ''} finite`); near(Math.hypot(q[0], q[1], q[2], q[3]), 1, 1e-9, `${msg || ''} unit length`); };
const rng = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
/** a person in the clone's frame (x right, y up, z back: forward is -z), adult size unless s says otherwise */
const FRAME = (s = 1) => ({ eye: [0, 1.62, 0], ear: [0.075, 1.59, 0.02], f: [0, 0, -1], u: [0, 1, 0], r: [1, 0, 0], s, hf: [0, 0, -1], hu: [0, 1, 0], hr: [1, 0, 0] });
const randQ = (r) => { const q = [r() - 0.5, r() - 0.5, r() - 0.5, r() - 0.5], l = Math.hypot(...q); return q.map((x) => x / l); };
const axes = (q) => ({ X: qrot(q, [1, 0, 0]), Y: qrot(q, [0, 1, 0]), Z: qrot(q, [0, 0, 1]) });

// ------------------------------------------------------------------------------------------------------------------------ the small tools
test('fromBasis: the rotation whose columns are the given frame, on every branch of the conversion', () => {
  for (const q0 of [[0, 0, 0, 1], [1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], axisAngle([1, 0, 0], 2.0), axisAngle([0, 1, 0], 2.5), axisAngle([0, 0, 1], 3.0)]) {
    const a = axes(q0), q = fromBasis(a.X, a.Y, a.Z); unitQ(q, 'fromBasis');
    for (const v of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [0.3, -0.5, 0.8]]) nearV(qrot(q, v), qrot(q0, v), 1e-9, 'maps the same');
  }
  const r = rng(11); for (let i = 0; i < 200; i++) { const q0 = randQ(r), a = axes(q0), q = fromBasis(a.X, a.Y, a.Z); nearV(qrot(q, [0.2, 0.7, -0.4]), qrot(q0, [0.2, 0.7, -0.4]), 1e-9); }
});
test('arc takes one direction onto another, including the opposite one', () => {
  const r = rng(5); for (let i = 0; i < 100; i++) { const a = nrm([r() - 0.5, r() - 0.5, r() - 0.5]), b = nrm([r() - 0.5, r() - 0.5, r() - 0.5]), q = arc(a, b); unitQ(q); nearV(qrot(q, a), b, 1e-9); }
  const a = [0, 1, 0], q = arc(a, [0, -1, 0]); unitQ(q); nearV(qrot(q, a), [0, -1, 0], 1e-9, 'antiparallel');
  const q2 = arc([1, 0, 0], [1, 0, 0]); nearV(qrot(q2, [0.3, 0.4, 0.5]), [0.3, 0.4, 0.5], 1e-9, 'same direction: no turn');
});
test('signedAngle is the angle about the axis, with its sign', () => {
  near(signedAngle([1, 0, 0], [0, 0, -1], [0, 1, 0]), Math.PI / 2, 1e-9); near(signedAngle([1, 0, 0], [0, 0, 1], [0, 1, 0]), -Math.PI / 2, 1e-9);
  near(signedAngle([1, 0.7, 0], [1, -0.3, 0], [0, 1, 0]), 0, 1e-9, 'only the parts across the axis count');
});

// ------------------------------------------------------------------------------------------------------------------------ the two-bone arm
test('twoBone: the bones keep their lengths, the wrist is where it was asked, the elbow is on the pole side', () => {
  const r = rng(21), S = [0.19, 1.43, 0], L1 = 0.29, L2 = 0.26;
  for (let i = 0; i < 300; i++) {
    const W = add(S, mul(nrm([r() - 0.5, r() - 0.5, r() - 0.5]), 0.1 + 0.4 * r())), pole = nrm([r() - 0.5, r() - 0.5, r() - 0.5]), t = twoBone(S, L1, L2, W, pole);
    near(len(sub(t.E, S)), L1, 1e-9, 'upper arm'); near(len(sub(t.W, t.E)), L2, 1e-9, 'forearm'); nearV(t.W, W, 1e-9, 'reached');
    const u = nrm(sub(W, S)), mid = add(S, mul(u, dot(sub(t.E, S), u))), off = sub(t.E, mid);   // the elbow's offset from the line shoulder-wrist
    if (len(sub(pole, mul(u, dot(pole, u)))) > 0.2) assert.ok(dot(off, pole) > 0, 'the elbow bows toward the pole');
    near(t.reach, len(sub(W, S)) / (L1 + L2), 1e-9, 'reach');
  }
});
test('twoBone: a target out of reach is pulled in to what the arm spans (bones still the right length), a target too near is pushed out', () => {
  const S = [0, 1.4, 0], L1 = 0.29, L2 = 0.26, far = twoBone(S, L1, L2, [0, 1.4, -2], [0, -1, 0]);
  near(len(sub(far.W, S)), L1 + L2, 2e-3, 'fully stretched'); near(len(sub(far.E, S)), L1, 1e-9); near(len(sub(far.W, far.E)), L2, 1e-9); assert.ok(far.reach > 3, 'reach says how far out of reach it was');
  const near0 = twoBone(S, L1, L2, S, [0, -1, 0]); assert.ok(finite(near0.E) && finite(near0.W), 'a wrist on the shoulder'); near(len(sub(near0.E, S)), L1, 1e-9);
});
test('twoBone: degenerate poles (zero, along the axis) and a target straight above or below do not give NaN', () => {
  const S = [0, 1.4, 0], L1 = 0.29, L2 = 0.26;
  for (const [W, pole] of [[[0, 1.4, -0.4], [0, 0, 0]], [[0, 1.4, -0.4], [0, 0, -1]], [[0, 1.0, 0], [0, -1, 0]], [[0, 1.8, 0], [0, 1, 0]], [[0, 1.4, -0.4], [0, 0, 1]]]) {
    const t = twoBone(S, L1, L2, W, pole); assert.ok(finite(t.E) && finite(t.W) && Number.isFinite(t.reach), JSON.stringify([W, pole])); near(len(sub(t.E, S)), L1, 1e-9);
  }
});

// ------------------------------------------------------------------------------------------------------------------------ the arm's bones
test('solveArm: forward kinematics of the rotations it returns lands the elbow and the wrist where it says, and the hand has the frame it was asked for', () => {
  const r = rng(33), L1 = 0.29, L2 = 0.26;
  for (let i = 0; i < 300; i++) {
    const S = [0.19 * (r() < 0.5 ? 1 : -1), 1.43, r() * 0.1], hq = randQ(r), h = axes(hq), O = add(S, mul(nrm([r() - 0.5, r() - 0.8, r() - 0.9]), 0.12 + 0.38 * r()));
    const hand = { O, X: h.X, Y: h.Y, Z: h.Z }, sol = solveArm(S, L1, L2, hand, nrm([r() - 0.5, -1, r() - 0.5]), 0.6);
    for (const q of [sol.qu, sol.ql, sol.qh]) unitQ(q, 'arm quaternion');
    const E = add(S, qrot(sol.qu, [0, L1, 0])), W = add(E, qrot(sol.ql, [0, L2, 0]));
    nearV(E, sol.E, 1e-9, 'elbow by FK'); nearV(W, sol.W, 1e-9, 'wrist by FK'); nearV(sol.W, O, 1e-9, 'the wrist is on its target');
    const hh = axes(sol.qh); nearV(hh.X, h.X, 1e-9, 'hand X'); nearV(hh.Y, h.Y, 1e-9, 'hand Y (the fingers)'); nearV(hh.Z, h.Z, 1e-9, 'hand Z (out of the palm)');
  }
});
test('solveArm: the elbow bends forward - a positive turn about the forearm bone\'s own X - never backward, and by the angle between the bones', () => {
  const r = rng(77), L1 = 0.29, L2 = 0.26;
  for (let i = 0; i < 300; i++) {
    const S = [0.19, 1.43, 0], hq = randQ(r), h = axes(hq), O = add(S, mul(nrm([r() - 0.2, r() - 0.9, r() - 0.9]), 0.2 + 0.25 * r())), hand = { O, X: h.X, Y: h.Y, Z: h.Z };
    const sol = solveArm(S, L1, L2, hand, [0.2, -1, -0.3], 0.6), Yu = qrot(sol.qu, [0, 1, 0]), Yl = qrot(sol.ql, [0, 1, 0]), flex = Math.acos(Math.max(-1, Math.min(1, dot(Yu, Yl))));
    let rel = qmul(qinv(sol.qu), sol.ql); if (rel[3] < 0) rel = rel.map((v) => -v);   // the forearm in the upper arm's frame: the hinge (about X) and the forearm's share of the twist (about Y); q and -q are one rotation, so take the w >= 0 one
    if (flex > 0.05 && flex < 3.0) assert.ok(rel[0] > 0, `the hinge turns forward (rel.x ${rel[0].toFixed(3)}, flex ${(flex * 180 / Math.PI).toFixed(0)} deg)`);
    // the hinge angle itself: the swing of the relative rotation with the twist taken out is the angle between the bones
    const tw = 2 * Math.atan2(rel[1], rel[3]), sw = qmul(rel, [0, -Math.sin(tw / 2), 0, Math.cos(tw / 2)]);   // rel = swing * twist
    near(2 * Math.atan2(len([sw[0], sw[1], sw[2]]), sw[3]), flex, 1e-6, 'the swing is the elbow angle');
  }
});
test('solveArm: a straight arm and a hand turned along the forearm (every singular case) stay finite', () => {
  const S = [0.19, 1.43, 0], L1 = 0.29, L2 = 0.26, fr = { X: [1, 0, 0], Y: [0, -1, 0], Z: [0, 0, 1] };
  fr.X = nrm(cross(fr.Y, fr.Z));
  for (const O of [add(S, [0, -(L1 + L2), 0]), add(S, [0, -(L1 + L2) - 0.3, 0]), add(S, [0, -0.0005, 0]), S, add(S, [0.1, -0.2, -0.2])]) {
    const sol = solveArm(S, L1, L2, { O, ...fr }, [0, 0, -1], 0.6);
    for (const q of [sol.qu, sol.ql, sol.qh]) unitQ(q, 'singular arm'); assert.ok(finite(sol.E) && finite(sol.W));
  }
  // the hand's Y along the forearm: the twist is whatever it is, but it is a number
  const E = twoBone(S, L1, L2, add(S, [0, -0.4, -0.2]), [0, 0, -1]), Yl = nrm(sub(E.W, E.E)), sol = solveArm(S, L1, L2, { O: E.W, X: nrm(cross(Yl, [0, 0, 1])), Y: Yl, Z: nrm(cross(nrm(cross(Yl, [0, 0, 1])), Yl)) }, [0, 0, -1], 0.6);
  for (const q of [sol.qu, sol.ql, sol.qh]) unitQ(q, 'hand along the forearm');
});

// ------------------------------------------------------------------------------------------------------------------------ the phone
test('the phone typed on: 34-35 cm from the eyes (measured range 17.5-58 cm), below them, facing them, top leaning away, an orthonormal right-handed frame', () => {
  const F = FRAME(), ph = phonePose('text', F), d = len(sub(ph.C, F.eye));
  assert.ok(d > 0.32 && d < 0.37, `distance ${d.toFixed(3)} m`); near(F.eye[1] - ph.C[1], VIEW.text.drop, 1e-9, 'below the eyes'); near(dot(sub(ph.C, F.eye), F.f), VIEW.text.fwd, 1e-9, 'in front of the eyes'); near(ph.C[0], 0, 1e-9, 'in the middle');
  near(dot(ph.z, nrm(sub(F.eye, ph.C))), 1, 1e-9, 'the screen faces the eyes'); assert.ok(dot(ph.y, F.f) > 0.5 && dot(ph.y, F.u) > 0.3, 'the top leans away from the reader');
  for (const v of [ph.x, ph.y, ph.z]) near(len(v), 1, 1e-9, 'unit axis'); near(dot(ph.x, ph.y), 0, 1e-9); near(dot(ph.y, ph.z), 0, 1e-9); near(dot(ph.x, ph.z), 0, 1e-9); nearV(cross(ph.x, ph.y), ph.z, 1e-9, 'right-handed');
  near(ph.x[1], 0, 1e-9, 'the phone is not rolled'); nearV(ph.x, [1, 0, 0], 1e-9, 'its width runs across the person');
});
test('the phone scales with the person (a child holds it nearer), and a seated reader holds it lower and a little closer', () => {
  const big = phonePose('text', FRAME(1)), small = phonePose('text', FRAME(0.8));
  near(len(sub(small.C, FRAME(0.8).eye)) / len(sub(big.C, FRAME(1).eye)), 0.8, 1e-9);
  const sit = phonePose('sit', FRAME()); assert.ok(sit.C[1] < big.C[1], 'lower'); assert.ok(len(sub(sit.C, FRAME().eye)) > 0.3 && len(sub(sit.C, FRAME().eye)) < 0.4);
  const walk = phonePose('walk', FRAME()); assert.ok(finite(walk.C)); near(dot(walk.z, nrm(sub(FRAME().eye, walk.C))), 1, 1e-9, 'walking: the screen faces the eyes'); assert.ok(walk.C[1] > sit.C[1], 'higher than a seated reader holds it');
});
test('the phone at the ear: against the side of the head, the screen toward it, the top at the ear leaning back a little, and it follows a tilted head', () => {
  const F = FRAME(), ph = phonePose('call', F);
  assert.ok(len(sub(ph.C, F.ear)) < 0.06, `centre ${(len(sub(ph.C, F.ear)) * 100).toFixed(1)} cm from the ear`); assert.ok(dot(sub(ph.C, F.ear), F.r) > 0, 'outside the ear');
  nearV(ph.z, [-1, 0, 0], 1e-9, 'the screen faces the head'); assert.ok(dot(ph.y, F.u) > 0.9, 'the top is up'); assert.ok(dot(ph.y, F.f) < 0, 'and leans back');
  nearV(cross(ph.x, ph.y), ph.z, 1e-9, 'right-handed');
  const a = 20 * Math.PI / 180, q = axisAngle([0, 0, -1], a), G = { ...F, hu: qrot(q, F.hu), hr: qrot(q, F.hr), hf: F.hf, ear: F.ear }, tilted = phonePose('call', G);   // the head rolled about the forward axis
  near(dot(tilted.y, G.hu), dot(ph.y, F.hu), 1e-9, 'the phone keeps its place against the head'); nearV(tilted.z, mul(G.hr, -1), 1e-9, 'screen against the tilted head');
});

// ------------------------------------------------------------------------------------------------------------------------ the hands
test('holdHands (typing): two hands, mirror images about the phone\'s middle, the palms on its back, the fingers across it toward each other, right-handed frames', () => {
  const ph = phonePose('text', FRAME()), H = holdHands('text', ph);
  assert.ok(H.r && H.l);
  for (const k of ['r', 'l']) { const h = H[k]; for (const v of [h.X, h.Y, h.Z]) near(len(v), 1, 1e-9, 'unit'); nearV(cross(h.X, h.Y), h.Z, 1e-9, 'right-handed'); nearV(h.Z, ph.z, 1e-9, 'the palm faces the phone (its normal is the screen normal)'); }
  // the middle of each palm, on the back of the phone and a grip's width to its side
  const palm = (h) => add(add(h.O, mul(h.Y, HAND.palm)), mul(h.Z, HAND.surface));
  const pr = sub(palm(H.r), ph.C), pl = sub(palm(H.l), ph.C);
  near(dot(pr, ph.z), -(PHONE.t / 2 + 0.002), 1e-9, 'right palm on the back'); near(dot(pl, ph.z), -(PHONE.t / 2 + 0.002), 1e-9, 'left palm on the back');
  near(dot(pr, ph.x), GRIP.side, 1e-9, 'right palm to the right'); near(dot(pl, ph.x), -GRIP.side, 1e-9, 'left palm to the left'); near(dot(pr, ph.y), 0, 1e-9); near(dot(pl, ph.y), 0, 1e-9);
  assert.ok(dot(H.r.Y, ph.x) < -0.9 && dot(H.l.Y, ph.x) > 0.9, 'the fingers go toward the other hand'); assert.ok(dot(H.r.Y, ph.y) > 0.2 && dot(H.l.Y, ph.y) > 0.2, 'and a little up');
  near(dot(H.r.Y, ph.y), dot(H.l.Y, ph.y), 1e-9, 'mirror: the same tilt'); near(dot(H.r.O, [1, 0, 0]) + dot(H.l.O, [1, 0, 0]), 2 * ph.C[0], 1e-9, 'mirror: wrists either side of the middle'); near(H.r.O[1], H.l.O[1], 1e-9); near(H.r.O[2], H.l.O[2], 1e-9);
});
test('holdHands (a call): the right hand alone, behind the phone, fingers up its back leaning toward the back of the head, palm toward the head', () => {
  const F = FRAME(), ph = phonePose('call', F), H = holdHands('call', ph);
  assert.ok(H.r && H.l === null); const h = H.r; nearV(cross(h.X, h.Y), h.Z, 1e-9, 'right-handed'); nearV(h.Z, ph.z, 1e-9, 'the palm toward the head');
  assert.ok(dot(h.Y, ph.y) > 0.6 && dot(h.Y, ph.x) > 0.6, 'fingers up the back, leaning along the phone\'s width'); assert.ok(dot(h.Y, F.f) < 0.0, 'the fingertips lean toward the back of the head');
  const palm = add(add(h.O, mul(h.Y, HAND.palm)), mul(h.Z, HAND.surface)); near(dot(sub(palm, ph.C), ph.z), -(PHONE.t / 2 + 0.002), 1e-9, 'the palm is on the phone\'s back'); near(dot(sub(palm, ph.C), ph.y), -GRIP.callLow, 1e-9, 'on its lower half');
  assert.ok(h.O[1] < ph.C[1], 'the wrist is below the phone (at the jaw), which is what lets the elbow hang');
});

// ------------------------------------------------------------------------------------------------------------------------ where the phone sits in the hand
test('gripInHand: the phone\'s place in the hand frame, and back out again', () => {
  for (const kind of ['text', 'call']) {
    const ph = phonePose(kind, FRAME()), h = holdHands(kind, ph).r, g = gripInHand(kind, ph, h);
    const world = (p) => add(h.O, add(add(mul(h.X, p[0]), mul(h.Y, p[1])), mul(h.Z, p[2])));
    nearV(world(g.P), ph.C, 1e-9, kind + ': centre');
    for (const [k, w] of [['x', ph.x], ['y', ph.y], ['z', ph.z]]) nearV(add(mul(h.X, g[k][0]), add(mul(h.Y, g[k][1]), mul(h.Z, g[k][2]))), w, 1e-9, kind + ': axis ' + k);
  }
});
test('the grip is the same wherever the phone is: moving and turning the phone and the hands with it changes nothing in the hand\'s frame', () => {
  const r = rng(91);
  for (const kind of ['text', 'call']) {
    const ph = phonePose(kind, FRAME()), g0 = gripInHand(kind, ph, holdHands(kind, ph).r);
    for (let i = 0; i < 20; i++) {
      const q = randQ(r), t = [r() - 0.5, r() * 2, r() - 0.5], rot = (v) => qrot(q, v), ph2 = { C: add(rot(ph.C), t), x: rot(ph.x), y: rot(ph.y), z: rot(ph.z) }, g = gripInHand(kind, ph2, holdHands(kind, ph2).r);
      nearV(g.P, g0.P, 1e-9, 'P'); nearV(g.x, g0.x, 1e-9, 'x'); nearV(g.y, g0.y, 1e-9, 'y'); nearV(g.z, g0.z, 1e-9, 'z');
    }
  }
});
test('GRIPS (what phone.js hangs on the hand bone): finite, a unit rotation, the phone within a hand\'s width of the wrist; typing and calling differ', () => {
  for (const k of ['text', 'call']) { const g = GRIPS[k]; assert.ok(g && finite(g.p) && finite(g.q), k); unitQ(g.q, k); assert.ok(len(g.p) < 0.2 && len(g.p) > 0.02, `${k}: ${len(g.p).toFixed(3)} m from the wrist`); }
  const dq = 1 - Math.abs(GRIPS.text.q.reduce((t, v, i) => t + v * GRIPS.call.q[i], 0)); assert.ok(len(sub(GRIPS.text.p, GRIPS.call.p)) > 0.005 || dq > 1e-3, 'the two grips are not the same');
});

// ------------------------------------------------------------------------------------------------------------------------ the arm and the phone together
test('an adult\'s arm reaches the phone for every way of holding it, with room to spare, and the elbow stays inside what an elbow can do', () => {
  const S = { r: [0.19, 1.43, 0.08], l: [-0.19, 1.43, 0.08] }, L1 = 0.29, L2 = 0.26, flexOf = (E, W, S0) => Math.acos(dot(nrm(sub(E, S0)), nrm(sub(W, E)))) * 180 / Math.PI;
  for (const kind of ['text', 'sit', 'walk', 'call']) {
    const ph = phonePose(kind, FRAME()), H = holdHands(kind, ph);
    for (const sd of ['r', 'l']) {
      const h = H[sd]; if (!h) continue; const side = sd === 'r' ? 1 : -1, pole = kind === 'call' ? [0.3 * side, -0.7, -0.45] : [0.35 * side, -1, 0.25], sol = solveArm(S[sd], L1, L2, h, pole, 0.6);
      assert.ok(sol.reach < 0.95, `${kind}/${sd}: reach ${sol.reach.toFixed(2)}`); assert.ok(sol.reach > 0.2, `${kind}/${sd}: reach ${sol.reach.toFixed(2)} (not folded up)`); nearV(sol.W, h.O, 1e-9, `${kind}/${sd}: reached`);
      const fx = flexOf(sol.E, sol.W, S[sd]); assert.ok(fx < 150, `${kind}/${sd}: elbow ${fx.toFixed(0)} deg of flexion (an elbow goes to about 145)`);
    }
  }
});
