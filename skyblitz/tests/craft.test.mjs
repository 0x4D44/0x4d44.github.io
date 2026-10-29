// Craft tests (Node, no DOM/WebGL): aircraft budgets and rig, control-surface animation, particle pools and ribbons.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRCRAFT } from '../src/craft/roster.js';
import { buildAircraft, updateAircraft } from '../src/craft/aircraft.js';
import { SpriteSystem, RibbonSystem } from '../src/craft/fx-core.js';

const fakeRacer = (o = {}) => ({ controls: { roll: 0, pitch: 0, yaw: 0, boost: false, ...(o.controls || {}) }, flight: { throttle: 0.8, boost: { active: false, meter: 10 }, ...(o.flight || {}) }, tumble: o.tumble || 0 });

test('every aircraft x livery builds within budget with a full userData contract', () => {
  for (const spec of AIRCRAFT) for (let li = 0; li < 3; li++) {
    const m = buildAircraft(spec, li, null);
    const u = m.userData;
    assert.ok(u.tris > 500 && u.tris <= 25000, `${spec.id} tris ${u.tris}`);
    assert.ok(u.draws >= 3 && u.draws <= 12, `${spec.id} draws ${u.draws}`);
    assert.equal(u.wingTips.length, 2); assert.ok(u.wingTips[0].x < 0 && u.wingTips[1].x > 0);
    assert.ok(u.exhausts.length >= 1 && u.radius > 3);
    assert.ok(u.parts.list.length >= 3, 'needs control surfaces');
    m.traverse((o) => { if (o.isMesh) { const p = o.geometry.attributes.position.array; for (let i = 0; i < p.length; i += 97) assert.ok(Number.isFinite(p[i])); } });
    const bb = new THREE.Box3().setFromObject(m), sz = bb.getSize(new THREE.Vector3());
    assert.ok(Math.abs(sz.x - spec.visual.wingspan) < spec.visual.wingspan * 0.35, `${spec.id} span ${sz.x}`);
    assert.ok(sz.z > spec.visual.length * 0.7 && sz.z < spec.visual.length * 1.45, `${spec.id} length ${sz.z}`);
  }
});

test('control surfaces follow the controls with the right sign', () => {
  const m = buildAircraft(AIRCRAFT[0], 0, null);
  const ail = m.userData.rig.list.filter((p) => p.kind === 'ail'), el = m.userData.rig.list.find((p) => p.kind === 'elev');
  const r = fakeRacer({ controls: { roll: 1, pitch: 1 } });
  for (let i = 0; i < 60; i++) updateAircraft(m, r, 1 / 60);
  const angle = (p) => { const q = p.mesh.quaternion; return 2 * Math.atan2(Math.hypot(q.x, q.y, q.z) * Math.sign(q.x * p.axis.x + q.y * p.axis.y + q.z * p.axis.z), q.w); };
  const right = ail.find((p) => p.side > 0), left = ail.find((p) => p.side < 0);
  assert.ok(angle(right) < -0.2, 'right aileron up when banking right');
  assert.ok(angle(left) > 0.2, 'left aileron down when banking right');
  assert.ok(angle(el) < -0.2, 'elevator trailing edge up for pull (pitch +)');
});

test('afterburner and props scale with throttle and boost; nothing goes NaN', () => {
  for (const id of ['falcon', 'bulldog']) {
    const m = buildAircraft(AIRCRAFT.find((a) => a.id === id), 0, null);
    const calm = fakeRacer({ flight: { throttle: 0.3, boost: { active: false } } }), hot = fakeRacer({ flight: { throttle: 1, boost: { active: true } } });
    for (let i = 0; i < 120; i++) updateAircraft(m, calm, 1 / 60);
    const f = m.userData.rig.flames[0];
    const len0 = f ? f.mesh.scale.z : 0;
    for (let i = 0; i < 120; i++) updateAircraft(m, hot, 1 / 60);
    if (f) assert.ok(f.mesh.scale.z > len0 * 1.5, 'flame grows with boost');
    updateAircraft(m, fakeRacer({ tumble: 2 }), 0.016);
    assert.equal(m.userData.damaged, true);
    m.traverse((o) => { assert.ok(Number.isFinite(o.quaternion.x + o.scale.x + o.position.x)); });
  }
});

test('SpriteSystem: emit, age, swap-remove, cap', () => {
  const s = new SpriteSystem(new THREE.Texture(), { cap: 8, additive: true });
  for (let i = 0; i < 12; i++) s.emit(i, 0, 0, 0, 0, 0, 0.5 + i * 0.1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0);
  assert.equal(s.n, 8, 'capped');
  s.update(0.45); assert.equal(s.n, 8);
  s.update(0.1); assert.ok(s.n < 8 && s.n > 0, 'short-lived particles died');
  for (let k = 0; k < 20; k++) s.update(0.2);
  assert.equal(s.n, 0); assert.equal(s.geo.instanceCount, 0);
  s.emit(0, 0, 0, 10, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 16);   // flipbook frame math must stay finite
  s.update(0.5); assert.ok(Number.isFinite(s.aUV.array[0]) && s.aPos.array[0] > 4);
});

test('RibbonSystem: pooled ribbons produce finite strips and release cleanly', () => {
  const r = new RibbonSystem({ ribbons: 3, N: 8 });
  const cam = new THREE.PerspectiveCamera(); cam.position.set(0, 5, 20);
  const a = r.acquire(0.3, 1, 1, 1, 1), b = r.acquire(0.3, 1, 1, 1, 1), c = r.acquire(0.3, 1, 1, 1, 1);
  assert.equal(r.acquire(1, 1, 1, 1, 1), -1, 'pool exhausted');
  for (let i = 0; i < 12; i++) { r.push(a, i, 0, -i * 3, i * 0.05); r.update(i * 0.05, cam); }
  for (const v of r.pos) assert.ok(Number.isFinite(v));
  for (const v of r.col) assert.ok(Number.isFinite(v));
  r.release(a); assert.equal(r.free.length, 1); void b; void c;
  assert.equal(r.acquire(1, 1, 1, 1, 1), a, 'slot reused');
});
