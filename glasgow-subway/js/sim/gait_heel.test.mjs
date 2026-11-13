// A high heel raises the hip without lengthening the leg that swings: the stride is sized by the hip height less what the heel adds (gait.js makeBody, HEEL_FLAT).
//   node --test js/sim/gait_heel.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FIXTURE, PEOPLE, G } from './gait_emu.mjs';

const rigOf = (id, lift = 0) => {
  const c = FIXTURE.chars[id], r0 = FIXTURE.parent.indexOf(-1), pos = c.pos.map((p) => p.slice()); pos[r0][1] += lift;   // lift: the whole skeleton stands on a rigid stilt that high
  return { bones: FIXTURE.bones, parent: FIXTURE.parent, pos, quat: c.quat };
};
const foot = (id) => { const f = FIXTURE.chars[id].foot; return { heelBack: f.heelBack, toeFwd: f.toeFwd }; };

test('in flat shoes the stride is sized by the hip height, as it always was (every fixture character)', () => {
  for (const id of PEOPLE) {
    const B = G.makeBody(rigOf(id), foot(id));
    assert.ok(B.leg[0].ankleH / B.legLen < G.HEEL_FLAT, `${id}: ankle ${B.leg[0].ankleH.toFixed(3)} m on a ${B.legLen.toFixed(3)} m leg is a flat shoe`);
    assert.equal(B.Lh, B.hipY, id);
  }
});

test('on a 14 cm heel the hip is 14 cm higher but the steps are no longer: only the height a flat shoe could have is counted', () => {
  const id = PEOPLE[0], flat = G.makeBody(rigOf(id), foot(id)), heel = G.makeBody(rigOf(id, 0.14), foot(id));
  assert.ok(Math.abs(heel.hipY - flat.hipY - 0.14) < 1e-9 && Math.abs(heel.legLen - flat.legLen) < 1e-9, 'the same leg, 14 cm higher');
  assert.ok(Math.abs(heel.Lh - (flat.hipY + G.HEEL_FLAT * flat.legLen - flat.leg[0].ankleH)) < 1e-9, 'Lh = the hip height with the ankle at HEEL_FLAT of the leg');
  assert.ok(heel.Lh < heel.hipY - 0.05 && heel.Lh >= flat.Lh, 'well under the hip height, and never under the flat-shoe one');
  const a = G.gaitParams(flat, 1.2), b = G.gaitParams(heel, 1.2), old = Object.assign({}, heel, { Lh: heel.hipY }), c = G.gaitParams(old, 1.2);
  assert.ok(b.SL < c.SL - 0.02, `steps ${b.SL.toFixed(3)} m, not the ${c.SL.toFixed(3)} m the hip height alone asked for`);
  assert.ok(b.SL - a.SL < 0.02, `and within 2 cm of the same person's in flat shoes (${a.SL.toFixed(3)} m)`);
});

test('the change is continuous: a heel just over the flat-shoe line changes the stride by next to nothing', () => {
  const id = PEOPLE[0], flat = G.makeBody(rigOf(id), foot(id)), edge = G.HEEL_FLAT * flat.legLen - flat.leg[0].ankleH;
  const under = G.makeBody(rigOf(id, edge - 0.001), foot(id)), over = G.makeBody(rigOf(id, edge + 0.001), foot(id));
  assert.equal(under.Lh, under.hipY);
  assert.ok(Math.abs(over.Lh - under.Lh) < 0.0011);
});
