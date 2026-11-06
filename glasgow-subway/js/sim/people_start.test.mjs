// People who walk off from standing: the height of the body while the gait takes their legs over (people.js _enter / _yOffset).
//
// The bug this guards (research/people-motion-rubric.md, round 2 part 7): the body's height is set so that the lowest sole of the clip the person is in sits on the floor. At the
// walk command the clip became the captured walk, whose lowest sole is far lower than any standing pose's, so for the 0.2 s the gait takes to have the legs the body was aimed at
// the height the WALK clip wants, then came back down to where the gait wants it: a hop of 9-25 mm in all 60 start-and-stop recordings (30 people, two levels of detail).
// The height has to go from the standing pose's to the gait's, and never beyond the two.
//
// This is a test of the bookkeeping and the blend only: it builds a crowd without a scene (no models, no browser) and gives it measured poses by hand. That the hop is gone from
// real, skinned, rendered people is measured on the recordings (tools/people_hop.mjs, over the recordings tools/people_motion.mjs --rec keeps).
import test from 'node:test';
import assert from 'node:assert/strict';
import { AnimCrowd } from './people.js';

// poses as AnimCrowd.measure() reports them (only the fields the height reads): the lowest sole of the whole clip, relative to the clone's origin (m)
const POSE = { idle: { minY: -0.0092 }, fidget: { minY: -0.0211 }, walk: { minY: -0.0533 }, sit: { minY: 0.0 }, pole: { minY: -0.004 } };
const CLIP = (name) => ({ name });
const SOLE = 0.0002;   // gb.sole: the lowest shoe point of the rest pose above the clone's origin (m)

function crowd(over = {}) {
  const c = Object.assign(Object.create(AnimCrowd.prototype), { gaitOn: true, phones: false, crossfade: 0.3, rng: () => 0.5 }, over);
  c._play = (p, clip) => { p.curClip = clip; p.m = POSE[clip.name.replace(/^.*__/, '')]; };   // (no mixer: only what the height reads)
  c._holdTo = () => {};
  return c;
}
function person(over = {}) {
  const char = { id: 'x', walkSpeed: 1.2, kid: false, staff: false, gbHi: {}, lodNode: null, pools: { idle: [CLIP('idle')], fidget: [CLIP('fidget')], walk: [CLIP('walk')], sit: [CLIP('sit')], pole: [CLIP('pole')] } };
  return { char, state: 'stand', lod: false, static: false, speed: 1.2, yOff: null, ...over };
}
const ramp = (c, p, f) => { for (let k = 0; k <= 20; k++) { p.gait = { wL: k / 20, gb: { sole: SOLE } }; f(c._yOffset(p), k / 20); } };

test('walking off from a standing pose: the pose that was left is remembered, and the height goes from its to the gait\'s, never beyond them', () => {
  const c = crowd(), p = person();
  c._enter(p, 'stand', 0);
  assert.equal(p.mFrom, null, 'standing is not a walk-off');
  assert.equal(c._yOffset(p), 0.0092, 'standing: the lowest sole of the idle clip on the floor');
  c._enter(p, 'walk');
  assert.equal(p.m, POSE.walk, 'the person is now in the walk clip');
  assert.equal(p.mFrom, POSE.idle, 'the standing pose is what the person walked out of');
  // the first walking frame: the gait is made after the person is placed, but it is going to take the legs, so the height does not go for the walk clip's
  assert.equal(p.gait, undefined);
  assert.equal(c._yOffset(p), 0.0092, 'first walking frame: still the standing height (the old code said 0.0533: a 44 mm hop for this pose)');
  // the gait coming in: a blend of the two, and nothing higher than the higher of them or lower than the lower
  const lo = -SOLE, hi = 0.0092;
  ramp(c, p, (y, w) => {
    assert.ok(Math.abs(y - (hi * (1 - w) - SOLE * w)) < 1e-12, `at weight ${w}: ${y}`);
    assert.ok(y <= hi + 1e-12 && y >= lo - 1e-12, `at weight ${w}: ${y} is outside [${lo}, ${hi}]`);
  });
  p.gait = { wL: 1, gb: { sole: SOLE } };
  assert.equal(c._yOffset(p), -SOLE, 'the gait has the legs: the soles are where the gait puts them');
});

test('the blend is the same from every standing pose, a pole and a fidget included; a seat is not one', () => {
  for (const [was, pose, kid, r] of [['idle', POSE.idle, false, 0.5], ['fidget', POSE.fidget, true, 0.1], ['pole', POSE.pole, false, 0.5]]) {   // (only children fidget)
    const c = crowd({ rng: () => r }), p = person({ state: was === 'pole' ? 'pole' : 'stand' });
    p.char.kid = kid;
    c._enter(p, p.state, 0);
    assert.equal(p.cat, was);
    c._enter(p, 'walk');
    assert.equal(p.mFrom, pose, was);
    assert.equal(c._yOffset(p), -pose.minY, was);
  }
  const c = crowd(), p = person({ state: 'sit' });
  c._enter(p, 'sit', 0);
  c._enter(p, 'walk');
  assert.equal(p.mFrom, null, 'getting up from a seat is not a walk-off from a standing pose (the seat has its own height, _sitOff)');
  assert.equal(c._yOffset(p), 0.0533, 'unchanged: the walk clip\'s');
});

test('the memory is for the walk-off only: stopping clears it, a walk variant in mid-walk keeps it, a person spawned walking has none', () => {
  const c = crowd(), p = person();
  c._enter(p, 'stand', 0); c._enter(p, 'walk');
  assert.equal(p.mFrom, POSE.idle);
  c._enter(p, 'go', 0.2);   // (steer-driven 'go' is the same walk; re-entering it must not make the walk clip the pose that was left)
  assert.equal(p.mFrom, POSE.idle, 'walk -> go keeps the pose the person set off from');
  c._enter(p, 'stand');
  assert.equal(p.mFrom, null, 'stopped: nothing to remember');
  const q = person();
  c._enter(q, 'walk', 0);
  assert.equal(q.mFrom, null, 'spawned walking: there is no pose that was left');
  assert.equal(c._yOffset(q), 0.0533, 'unchanged for them: the walk clip\'s');
});

test('where the gait does not drive the legs the height is the clip\'s, as it was', () => {
  const walkOff = (over, charOver) => { const c = crowd(over), p = person(); Object.assign(p.char, charOver); c._enter(p, 'stand', 0); c._enter(p, 'walk'); return c._yOffset(p); };
  assert.equal(walkOff({ gaitOn: false }), 0.0533, 'gait off (the captured clip walk the game had before)');
  assert.equal(walkOff({}, { gbHi: null }), 0.0533, 'a rig the gait cannot drive (never retried): walks by clip');
  const c = crowd(), p = person({ static: true }); c._enter(p, 'stand', 0); c._enter(p, 'walk');
  assert.equal(c._yOffset(p), 0.0533, 'a static person is never given a gait');
  const d = crowd(), q = person({ lod: true }); q.char.lodNode = {}; q.char.gbLo = null; d._enter(q, 'stand', 0); d._enter(q, 'walk');
  assert.equal(d._yOffset(q), 0.0533, 'the simplified model\'s rig is the one that counts at that level of detail');
});

test('the gait fading out (a person sits down, takes a pole) still ends at the clip they go to', () => {
  const c = crowd(), p = person({ state: 'pole' });
  c._enter(p, 'stand', 0); c._enter(p, 'walk'); c._enter(p, 'pole');   // walked, then took a pole: the pole clip is the destination
  assert.equal(p.mFrom, null);
  p.gait = { wL: 0.25, gb: { sole: SOLE } };
  assert.ok(Math.abs(c._yOffset(p) - (0.004 * 0.75 - SOLE * 0.25)) < 1e-12);
  p.gait.wL = 0;
  assert.equal(c._yOffset(p), 0.004);
});
