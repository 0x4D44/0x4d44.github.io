// Seated legs (R1-D13: the elder on the bench floated, feet in the air). The sit clips are rotation-only and the same for everybody, so whoever has short legs, or sits on a seat
// higher than the 0.445 m the clips were authored for (the bench is 0.49), has the soles in the air. js/people/legs.js tilts the thighs down (and the shins back, so they stay upright)
// until the soles meet the floor, as far as a person can go without sliding off the seat. Pure: a synthetic skeleton with the real rig's proportions, the meta, the sim. The skinned
// meshes of the built characters are measured in the page (tests/people-seats.mjs).
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-legs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { readAssetJson, buildData } from './headless.mjs';
import { PeopleSim, SEAT_TOP as SIM_SEAT_TOP } from '../js/people/sim.js';
import { LEG, SEAT_TOP, SEAT_HIP, SIT_THIGH, SLOPE_ADULT, SLOPE_CHILD, CHILD_M, FLOAT_OK, maxSlope, minThigh, seatFloatM, plantedFloatM, floatBudget, plantFeet } from '../js/people/legs.js';

const META = await readAssetJson('people/people_meta.json');
const BY = new Map(META.people.map((m) => [m.id, m]));
const near = (a, b, eps) => Math.abs(a - b) <= eps;
/** The seat heights the brain puts people on: the outdoor benches (brain.js sitAt, no seatH on the plan's POIs: 0.49), the chapel pews, the school desks and the teacher's chair. */
const SEATS = { bench: 0.49, pew: 0.45, desk: 0.43, chair: 0.46 };

/** A rig with the proportions of the built characters (measured: thigh 0.4453 x hip height, the sit clips put it 1.52 rad from straight down and the shin upright): hips > thigh > shin > foot, both legs. */
function rig(meta) {
  const hip = meta.hipHeightM, T = LEG.thigh * hip, S = 0.4 * hip, ankle = hip - T - S;
  const root = new THREE.Group(), mk = (name, parent, x, y) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, y, 0); parent.add(b); return b; };
  const hips = mk('hips', root, 0, hip), bones = { hips };
  for (const [s, x] of [['l', -0.0845], ['r', 0.0845]]) {
    const th = mk('thigh_' + s, hips, x, 0), sh = mk('shin_' + s, th, 0, -T), ft = mk('foot_' + s, sh, 0, -S);
    bones['thigh_' + s] = th; bones['shin_' + s] = sh; bones['foot_' + s] = ft;
  }
  const inst = { id: meta.id, root, bones, meta };
  const lib = { restQuat: (id, name) => (name === 'foot_l' ? { p: { y: ankle } } : null) };
  return { inst, lib, ankle, T, S, hip };
}
/** The sit clip's pose (people_build.py sit_base) and the sim's root: the hip joint SEAT_HIP above the floor of a seat `sitH` high. */
function sit(r, sitH) {
  const { inst } = r, b = inst.bones;
  b.hips.rotation.set(0.02, 0, 0);
  for (const [s, y] of [['l', -0.06], ['r', 0.06]]) { b['thigh_' + s].rotation.set(1.50, y, 0); b['shin_' + s].rotation.set(-1.52, 0, 0); b['foot_' + s].rotation.set(0.05, 0, 0); }
  inst.root.position.set(0, (sitH - SEAT_TOP) - (inst.meta.hipHeightM - SEAT_HIP), 0); inst.root.updateMatrixWorld(true);
}
const soleY = (r, s = 'l') => r.inst.bones['foot_' + s].getWorldPosition(new THREE.Vector3()).y - r.ankle;
const worldQ = (b) => b.getWorldQuaternion(new THREE.Quaternion());
const person = (id) => { const m = BY.get(id); assert.ok(m, 'character ' + id); return m; };

test('legs: the constants are the rig\'s (seat top, hip joint, every person\'s root drop) and the sim agrees', () => {
  assert.equal(SEAT_TOP, SIM_SEAT_TOP, 'legs.js and sim.js author the sit clips for the same seat');
  assert.equal(SEAT_TOP, META.seatTopM); assert.equal(SEAT_HIP, META.seatHipM);
  for (const m of META.people) assert.ok(near(m.hipHeightM - m.seatRootDropM, SEAT_HIP, 0.002), `${m.id}: root drop ${m.seatRootDropM} puts the hip joint at ${(m.hipHeightM - m.seatRootDropM).toFixed(3)}, not ${SEAT_HIP}`);
  assert.ok(near(Math.cos(SIT_THIGH), LEG.cosThigh, 1e-9) && near(SIT_THIGH, 1.52, 0.005), 'the sit clips put the thigh 1.52 rad from straight down (thigh 1.50 + hips 0.02)');
  assert.equal(maxSlope(CHILD_M - 0.01), SLOPE_CHILD); assert.equal(maxSlope(CHILD_M), SLOPE_ADULT);
  assert.equal(floatBudget({ heightM: 1.7 }), 0.05, 'an adult\'s soles are within 5 cm of the floor'); assert.equal(floatBudget({ heightM: 1.3 }), 0.10, 'a child\'s legs may dangle 10 cm');
  assert.ok(near(SLOPE_ADULT, 0.45, 1e-9) && near(SLOPE_CHILD, 0.80, 1e-9) && CHILD_M === 1.40 && FLOAT_OK === 0.002);
  assert.ok(minThigh(1.2) < minThigh(1.7) && minThigh(1.7) > 0.9, 'a child may tilt further than an adult, and nobody sits with the thighs more than 30 degrees down');
});

test('the defect: on the 0.49 m bench the elder\'s soles were 14 cm in the air (they were 0 cm for nobody), and the children\'s 25 cm', () => {
  const f = (id, h) => seatFloatM(person(id), h);
  assert.ok(near(f('w_elder', SEATS.bench), 0.143, 0.005), 'w_elder on the bench ' + f('w_elder', SEATS.bench).toFixed(3));
  assert.ok(near(f('w_beata', SEATS.bench), 0.155, 0.005) && near(f('g_girl', SEATS.bench), 0.256, 0.005));
  assert.ok(near(f('m_afro', SEATS.desk), -0.004, 0.005), 'the tallest man on a school chair: the soles are just about on the floor');
  let floating = 0; for (const m of META.people) if (seatFloatM(m, SEATS.bench) > floatBudget(m)) floating++;
  assert.ok(floating >= 25, `without planting ${floating} of ${META.people.length} characters float more than their budget on the bench`);
});

test('plantedFloatM: every character on every seat the brain uses has the soles on the floor (adults 5 cm, children 10 cm)', () => {
  for (const [kind, h] of Object.entries(SEATS)) for (const m of META.people) {
    const left = plantedFloatM(m, h);
    assert.ok(left <= floatBudget(m), `${m.id} (${m.heightM} m) on the ${kind} (${h}) floats ${(left * 100).toFixed(1)} cm, over ${floatBudget(m) * 100} cm`);
    assert.ok(left >= -0.02, `${m.id} on the ${kind} sinks ${(-left * 100).toFixed(1)} cm into the floor`);
  }
  assert.ok(plantedFloatM(person('w_elder'), 0.49) < FLOAT_OK, 'the elder reaches the floor on the bench');
  assert.ok(plantedFloatM(person('g_girl'), 0.49) > 0.05, 'a six-year-old on an adult bench cannot reach: her legs dangle (the model says so, it does not hide it)');
});

test('plantFeet: the elder\'s soles come down onto the floor of the bench; the pelvis, the shins and the feet keep their place and orientation', () => {
  const r = rig(person('w_elder')); sit(r, SEATS.bench);
  const before = soleY(r), hipsP = r.inst.bones.hips.getWorldPosition(new THREE.Vector3()), shinQ = worldQ(r.inst.bones.shin_l), footQ = worldQ(r.inst.bones.foot_r), kneeY = r.inst.bones.shin_l.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(near(before, seatFloatM(r.inst.meta, SEATS.bench), 0.003), `the model says ${seatFloatM(r.inst.meta, SEATS.bench).toFixed(3)}, the skeleton ${before.toFixed(3)}`);
  assert.ok(before > 0.13, 'red first: the soles of the elder on the bench are ' + before.toFixed(3) + ' m up');
  const left = plantFeet(r.lib, r.inst, 0);
  for (const s of ['l', 'r']) assert.ok(near(soleY(r, s), 0, 0.001), `${s} sole ${soleY(r, s).toFixed(4)}`);
  assert.ok(left <= FLOAT_OK, 'plantFeet reports what is left: ' + left);
  assert.ok(r.inst.bones.hips.getWorldPosition(new THREE.Vector3()).distanceTo(hipsP) < 1e-9, 'the pelvis stays on the seat');
  assert.ok(worldQ(r.inst.bones.shin_l).angleTo(shinQ) < 1e-6, 'the shin stays upright (its world orientation is unchanged)');
  assert.ok(worldQ(r.inst.bones.foot_r).angleTo(footQ) < 1e-6, 'the foot stays flat');
  const kneeNow = r.inst.bones.shin_l.getWorldPosition(new THREE.Vector3()).y;
  assert.ok(kneeNow < kneeY - 0.10, 'it is the knee that went down (' + (kneeY - kneeNow).toFixed(3) + ' m): the thigh slopes');
  // a few centimetres of float are planted too (the pew is 0.45, a school chair 0.43), not left as "close enough"
  for (const [id, h] of [['m_tendero', 0.45], ['m_don', 0.49], ['t_girl', 0.43], ['w_afro', 0.45], ['m_vendedor', 0.46]]) {
    const q = rig(person(id)); sit(q, h); const f0 = soleY(q); assert.ok(f0 > 0.02, `${id} on ${h}: ${f0.toFixed(3)} m up before`);
    plantFeet(q.lib, q.inst, 0); assert.ok(near(soleY(q), 0, 0.001) && near(soleY(q, 'r'), 0, 0.001), `${id} on ${h}: soles ${soleY(q).toFixed(4)} / ${soleY(q, 'r').toFixed(4)} after`);
  }
});

test('plantFeet is idempotent: planting a planted person, or twice, moves nothing; a person already on the floor is left alone', () => {
  const r = rig(person('w_vecina')); sit(r, SEATS.bench); plantFeet(r.lib, r.inst, 0);
  const q = ['thigh_l', 'shin_l', 'thigh_r', 'shin_r'].map((n) => r.inst.bones[n].quaternion.clone());
  plantFeet(r.lib, r.inst, 0); plantFeet(r.lib, r.inst, 0);
  ['thigh_l', 'shin_l', 'thigh_r', 'shin_r'].forEach((n, i) => assert.ok(r.inst.bones[n].quaternion.angleTo(q[i]) < 1e-6, n + ' moved on the second pass'));
  const tall = rig(person('m_afro')); sit(tall, SEATS.desk);
  const q0 = tall.inst.bones.thigh_l.quaternion.clone(); assert.ok(soleY(tall) < FLOAT_OK);
  assert.ok(plantFeet(tall.lib, tall.inst, 0) < FLOAT_OK && tall.inst.bones.thigh_l.quaternion.angleTo(q0) === 0, 'the tallest man on a school chair is not touched');
});

test('plantFeet: a seat too high for the legs (a child on the bench) tilts the thigh to the limit and no further, and leaves the rest dangling', () => {
  const r = rig(person('g_girl')); sit(r, SEATS.bench);
  const left = plantFeet(r.lib, r.inst, 0);
  const th = r.inst.bones.thigh_l, d = r.inst.bones.shin_l.getWorldPosition(new THREE.Vector3()).sub(th.getWorldPosition(new THREE.Vector3()));
  const A = Math.acos(-d.y / d.length());
  assert.ok(near(A, minThigh(1.209), 1e-4), `the thigh stops at ${A.toFixed(3)} rad from down, the limit is ${minThigh(1.209).toFixed(3)}`);
  assert.ok(near(left, plantedFloatM(person('g_girl'), SEATS.bench), 0.002) && left > 0.05 && left <= 0.10, `the dangle ${left.toFixed(3)} m`);
  plantFeet(r.lib, r.inst, 0);
  assert.ok(near(Math.acos(-r.inst.bones.shin_l.getWorldPosition(new THREE.Vector3()).sub(th.getWorldPosition(new THREE.Vector3())).y / d.length()), A, 1e-6), 'the second pass does not tilt it again');
});

test('plantFeet: the floor is where the person stands, not y = 0; a standing leg and a crossfade with nothing to plant are never kicked', () => {
  const r = rig(person('m_tendero')); sit(r, SEATS.bench); r.inst.root.position.y += 6.5; r.inst.root.updateMatrixWorld(true);
  assert.ok(plantFeet(r.lib, r.inst, 6.5) <= FLOAT_OK && near(soleY(r) - 6.5, 0, 0.001), 'a bench at y = 6.5: the soles come down to 6.5 (8 cm up), not to 0 (6.58 m)');
  const st = rig(person('m_tendero')); st.inst.root.updateMatrixWorld(true);
  const q = st.inst.bones.thigh_l.quaternion.clone();
  assert.ok(plantFeet(st.lib, st.inst, 0) <= FLOAT_OK && st.inst.bones.thigh_l.quaternion.angleTo(q) === 0, 'a standing person has nothing to plant');
  const air = rig(person('m_tendero')); sit(air, SEATS.bench); for (const s of ['l', 'r']) { air.inst.bones['thigh_' + s].rotation.x = 0.2; air.inst.bones['shin_' + s].rotation.x = 0; } air.inst.root.position.y = 0.5; air.inst.root.updateMatrixWorld(true);
  const q2 = air.inst.bones.thigh_l.quaternion.clone(); plantFeet(air.lib, air.inst, 0);
  assert.equal(air.inst.bones.thigh_l.quaternion.angleTo(q2), 0, 'a leg that hangs (thigh 11 degrees from down) is not a sitting leg: never tilted, wherever the feet are');
  assert.equal(plantFeet(r.lib, { ...r.inst, bones: {} }, 0), null, 'a rig without legs: null, no throw');
});

test('the sim: nobody seated in a day of the barrio would float more than their budget (benches, pews, school desks as the brain seats them)', async () => {
  const { ctx, plan } = await buildData({ furnish: true, colliders: true });
  const METAS = new Map(META.people.map((m) => [m.id, m]));
  ctx.hour = 9; ctx.errors = [];
  const sim = new PeopleSim(ctx); assert.ok(sim.build(METAS));
  const sp = plan.spawn; sim.setPlayer(sp.x, sp.y ?? 0, sp.z, 0);
  const seen = new Map();                                                                  // sitH -> Set of characters seen on it
  for (const hour of [9, 12, 16, 19]) {
    ctx.hour = hour;
    for (let t = 0; t < 300; t += 0.1) {
      sim.step(0.1);
      if (Math.round(t * 10) % 50 !== 0) continue;
      for (const n of sim.npcs) if (n.sitH != null) { const k = +n.sitH.toFixed(3); (seen.get(k) ?? seen.set(k, new Set()).get(k)).add(n.charId); }
    }
  }
  assert.ok(seen.size >= 1, 'the barrio sat somebody down in four hours (benches, pews, desks)');
  // and the seats the soak may not reach: the pews, the school desks and the teacher's chair, at the heights the brain gives them (brain.js do_pray 0.45, classroom.js seat 0.43)
  const { chapel, school } = sim.lots;
  const registry = [
    ...sim.spots.inside(chapel, 'sit').map((s) => ['pew', s.seatH ?? 0.45]),
    ...sim.spots.inside(school, 'work').filter((s) => s.tagSet.has('school')).map((s) => ['school desk', s.seatH ?? 0.43]),
    ...sim.spots.inside(school, 'sit').filter((s) => s.tagSet.has('chair_wood')).map((s) => ['teacher chair', s.seatH ?? 0.43]),
    ...sim.spots.list('bench').map((s) => ['bench', s.seatH ?? 0.49]),
  ];
  for (const k of ['pew', 'school desk', 'teacher chair', 'bench']) assert.ok(registry.some((r) => r[0] === k), `no ${k} in the barrio`);
  for (const [kind, h] of registry) assert.ok(h >= 0.40 && h <= 0.50, `a ${kind} ${h} m high: the legs cannot be fitted to that`);
  for (const [h, chars] of seen) {
    assert.ok(h >= 0.40 && h <= 0.50, `somebody sat on a seat ${h} m high: the legs cannot be fitted to that (bunks and beds are not seats)`);
    for (const c of chars) { const m = BY.get(c); if (!m) continue; assert.ok(plantedFloatM(m, h) <= floatBudget(m), `${c} on a ${h} m seat floats ${(plantedFloatM(m, h) * 100).toFixed(1)} cm`); }
  }
});
