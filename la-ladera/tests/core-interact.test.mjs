// Interaction targeting (owner: A1): the old point scoring must not change, and SHAPED items (exact view-ray picking, R4-009), the static grid and the
// groups must behave as documented in js/core/interact.js. Pure node, no browser.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-interact.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Interact, rayBox, raySphere, rayCapsuleY, personHit, PERSON, PERSON_R, PERSON_BELOW, PERSON_ABOVE, CELL, SEAT_BONUS } from '../js/core/interact.js';

const unit =(x, y, z) => { const l = Math.hypot(x, y, z); return { x: x / l, y: y / l, z: z / l }; };
const dirYaw = (yaw, pitch = 0) => ({ x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) });      // yaw 0 looks toward -z (the game's convention)
const toward = (eye, p) => unit(p.x - eye.x, p.y - eye.y, p.z - eye.z);
const mk = (walls = []) => {                                            // a fake world: walls are vertical segments, always solid at every height
  const ctx = { physics: { calls: 0, segmentBlocked(x1, z1, x2, z2) { this.calls++; return walls.some((w) => segCross(x1, z1, x2, z2, w)); } } };
  ctx.interact = new Interact(ctx); return ctx;
};
function segCross(x1, z1, x2, z2, w) {
  const d1x = x2 - x1, d1z = z2 - z1, d2x = w.x2 - w.x1, d2z = w.z2 - w.z1, den = d1x * d2z - d1z * d2x;
  if (Math.abs(den) < 1e-9) return false;
  const s = ((w.x1 - x1) * d2z - (w.z1 - z1) * d2x) / den, u = ((w.x1 - x1) * d1z - (w.z1 - z1) * d1x) / den;
  return s >= 0 && s <= 1 && u >= 0 && u <= 1;
}
const eye0 = { x: 0, y: 1.5, z: 0 };
const east = { x: 1, y: 0, z: 0 };

// ---------------------------------------------------------------- the old targeting, kept exactly
/** The targeting as it was before shapes existed (copied from the old file): the reference the new code must reproduce for point items. */
function legacyPick(ctx, items, eye, dir) {
  let best = null, bs = Infinity;
  for (const it of items) {
    if (it.enabled && it.enabled(ctx, it) === false) continue;
    const dx = it.x - eye.x, dy = (it.y ?? eye.y) - eye.y, dz = it.z - eye.z, d = Math.hypot(dx, dy, dz);
    if (d > it.radius) continue;
    const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
    if (cos < (it.aim ?? 0.72) && d > 0.7) continue;
    const score = d * (2.2 - cos);
    if (score >= bs) continue;
    if (ctx.physics.segmentBlocked(eye.x, eye.z, it.x, it.z, eye.y - 1.4, 1.2, it.ignoreDoor ?? null)) continue;
    bs = score; best = it;
  }
  return best;
}
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

test('point items: 600 random views over 150 random items give exactly the old targeting (with walls and disabled items in the mix)', () => {
  const r = lcg(7), walls = [{ x1: -6, z1: -3, x2: 6, z2: -3 }, { x1: 4, z1: -8, x2: 4, z2: 8 }];
  const ctx = mk(walls), items = [];
  for (let i = 0; i < 150; i++) {
    const it = { id: 'p' + i, kind: 'object', x: (r() - 0.5) * 16, y: 0.4 + r() * 2, z: (r() - 0.5) * 16, radius: 1.5 + r() * 2, aim: r() < 0.5 ? undefined : 0.4 + r() * 0.5, prompt: 'x', use() {} };
    if (i % 11 === 0) it.enabled = () => false;
    items.push(it); ctx.interact.register(it);
  }
  let hits = 0;
  for (let q = 0; q < 600; q++) {
    const eye = { x: (r() - 0.5) * 12, y: 1.4 + r() * 0.4, z: (r() - 0.5) * 12 }, dir = dirYaw(r() * 6.283, (r() - 0.5) * 1.2);
    const want = legacyPick(ctx, items, eye, dir), got = ctx.interact.update(eye, dir);
    assert.equal(got?.id ?? null, want?.id ?? null, `view ${q}`);
    if (got) hits++;
  }
  assert.ok(hits > 100, `the views must actually target things (${hits} of 600)`);
});

test('point items: a nearer off-axis item still beats the aimed one (the old rule), and nothing changes in the API', () => {
  const ctx = mk();
  const a = ctx.interact.register({ id: 'aimed', x: 1.4, y: 1.5, z: 0, radius: 2.6, prompt: 'a' });
  const b = ctx.interact.register({ id: 'near', x: 0.62, y: 1.5, z: -0.42, radius: 2.6, prompt: () => 'b' });       // 0.75 m away, 34 degrees off the ray
  assert.equal(ctx.interact.update(eye0, east), b);
  assert.equal(ctx.interact.prompt(), 'b');
  assert.equal(ctx.interact.aimed, false);
  assert.equal(a.radius, 2.6);
  const c = ctx.interact.register({ x: 9, y: 1, z: 9, prompt: 'c' });
  assert.match(c.id, /^i\d+$/); assert.equal(c.radius, 2.6, 'default reach');
  let used = 0; ctx.interact.register({ id: 'u', x: 0.6, y: 1.5, z: 0, radius: 2, aim: 0.9, prompt: 'u', use: () => used++ });
  ctx.interact.update(eye0, east); assert.equal(ctx.interact.use(), true); assert.equal(used, 1);
  ctx.interact.unregister('u'); assert.equal(ctx.interact.items.has('u'), false);
  ctx.interact.update(eye0, { x: -1, y: 0, z: 0 }); assert.equal(ctx.interact.target, null); assert.equal(ctx.interact.use(), false);
  ctx.interact.register({ id: 'touch', x: 0.3, y: 1.5, z: 0.4, radius: 2, aim: 0.99, prompt: 't' });
  assert.equal(ctx.interact.update(eye0, { x: -1, y: 0, z: 0 })?.id, 'touch', 'the old quirk stays: anything closer than 0.7 m is usable whichever way you face');
});

// ---------------------------------------------------------------- shapes
test('rayBox / raySphere: entry distance, misses, the eye inside, parallel rays, the reach limit', () => {
  assert.ok(Math.abs(rayBox(-2, 0, 0, 1, 0, 0, 0.5, 0.5, 0.5) - 1.5) < 1e-9);
  assert.equal(rayBox(-2, 0, 0, 1, 0, 0, 0.5, 0.5, 0.5, 1.0), -1, 'beyond maxT');
  assert.equal(rayBox(-2, 0, 0, -1, 0, 0, 0.5, 0.5, 0.5), -1, 'pointing away');
  assert.equal(rayBox(-2, 0.7, 0, 1, 0, 0, 0.5, 0.5, 0.5), -1, 'parallel and outside');
  assert.equal(rayBox(0.1, 0, 0, 1, 0, 0, 0.5, 0.5, 0.5), 0, 'inside: t = 0');
  assert.ok(Math.abs(raySphere(-3, 0, 0, 1, 0, 0, 1) - 2) < 1e-9);
  assert.equal(raySphere(-3, 1.1, 0, 1, 0, 0, 1), -1);
  assert.equal(raySphere(0.2, 0, 0, 1, 0, 0, 1), 0);
  assert.equal(raySphere(-3, 0, 0, 1, 0, 0, 1, 1.5), -1);
});

test('a shaped item is offered only while the ray really enters its box (reach, miss, pad, enabled)', () => {
  const ctx = mk(), I = ctx.interact;
  const box = I.register({ id: 'box', x: 1.5, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 2, prompt: 'abrir' });
  assert.equal(I.update(eye0, east), box); assert.equal(I.aimed, true); assert.ok(Math.abs(I.targetT - (1.5 - 0.1 - 0.04)) < 1e-6, `t ${I.targetT}`);
  assert.equal(I.update(eye0, unit(1, 0, 0.30)), null, '17 degrees off: a miss (the old cone would have taken it)');
  assert.equal(I.update(eye0, unit(1, 0, 0.095)), box, 'inside the 0.04 m pad (0.129 m off centre at its front, half extent 0.1)');
  assert.equal(I.update(eye0, unit(1, 0, 0.12)), null, 'just outside the pad');
  assert.equal(I.update({ x: -1, y: 1.5, z: 0 }, east), null, 'beyond its radius of 2');
  box.enabled = () => false; assert.equal(I.update(eye0, east), null, 'enabled() still decides'); delete box.enabled;
  I.unregister('box');
  const ball = I.register({ id: 'ball', x: 1.2, y: 1.5, z: 0, r: 0.15, radius: 2, prompt: 'bola' });
  assert.equal(I.update(eye0, east), ball); assert.equal(I.update(eye0, unit(1, 0, 0.4)), null);
  assert.equal(I.update(eye0, unit(1, 0, 0.12)), ball, 'the ray passes 0.14 m from the centre: inside r 0.15 + pad 0.04');
  I.unregister('ball');
  const own = I.register({ id: 'own', x: 0, y: 1.5, z: -1, radius: 2, prompt: 'o', hit: (c, it, e, d) => (d.z < -0.9 ? 0.8 : -1) });
  assert.equal(I.update(eye0, { x: 0, y: 0, z: -1 }), own); assert.equal(I.update(eye0, east), null);
  own.hit = () => NaN; assert.equal(I.update(eye0, { x: 0, y: 0, z: -1 }), null, 'a NaN from a custom test is a miss');
  own.hit = () => 5; assert.equal(I.update(eye0, { x: 0, y: 0, z: -1 }), null, 'a custom hit beyond the radius (2) is out of reach');
  own.hit = () => 1.9; assert.equal(I.update(eye0, { x: 0, y: 0, z: -1 }), own, 'and inside it is fine');
});

test('a box turned by ry is hit where it really is (the sign of the rotation)', () => {
  const ctx = mk(), I = ctx.interact;
  // a long thin board 1.6 x 0.06 m turned 90 degrees about Y (three: local +x -> world -z) lies along z; from the origin looking east we hit its thin side
  const b = I.register({ id: 'b', x: 1.5, y: 1.5, z: 0.7, hx: 0.8, hy: 0.1, hz: 0.03, ry: Math.PI / 2, radius: 3, prompt: 'b' });
  assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.5, z: 1.4 })), b, 'the +z end of the board');
  assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.5, z: -0.1 })), b, 'the -z end of the board');
  assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.5, z: 1.7 })), null, 'past the end');
  const c = I.register({ id: 'c', x: 1.5, y: 1.5, z: -1.8, hx: 0.8, hy: 0.1, hz: 0.03, ry: 0, radius: 4, prompt: 'c' });   // unturned: long along x, thin in z
  assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.5, z: -1.8 })), c);
  assert.equal(I.update(eye0, toward(eye0, { x: 2.3, y: 1.5, z: -1.0 })), null, 'it never reaches z = -1.73 inside its length: a miss');
});

test('a box turned by ry follows three\'s rotation.y at an angle where the box is NOT symmetric about the aim: 400 random views against rays marched in the object\'s own frame (a board turned 90 degrees is symmetric about its centre and cannot tell a flipped sign)', () => {
  const r = lcg(11), ry = 0.6, C = { x: 1.5, y: 1.5, z: 0.2 }, H = { x: 0.8, y: 0.1, z: 0.03 }, REACH = 3, GRAZE = 0.004;
  const obj = new THREE.Object3D(); obj.position.set(C.x, C.y, C.z); obj.rotation.y = ry; obj.updateMatrixWorld(true);
  const inv = obj.matrixWorld.clone().invert(), v = new THREE.Vector3();
  const inside = (x, y, z, g) => { v.set(x, y, z).applyMatrix4(inv); return Math.abs(v.x) <= H.x + g && Math.abs(v.y) <= H.y + g && Math.abs(v.z) <= H.z + g; };      // `g` grows the box (shrinks it when negative)
  const march = (eye, dir, g) => { for (let t = 0; t <= REACH; t += 0.002) if (inside(eye.x + dir.x * t, eye.y + dir.y * t, eye.z + dir.z * t, g)) return true; return false; };
  const ctx = mk(), I = ctx.interact;
  const b = I.register({ id: 'b', ...C, hx: H.x, hy: H.y, hz: H.z, ry, pad: 0, radius: REACH, prompt: 'b' });
  let hits = 0, misses = 0;
  for (let q = 0; q < 400; q++) {
    const eye = { x: -0.6 + r() * 1.2, y: 1.2 + r() * 0.6, z: -0.8 + r() * 1.6 };
    const dir = toward(eye, { x: C.x + (r() - 0.5) * 2.6, y: C.y + (r() - 0.5) * 0.5, z: C.z + (r() - 0.5) * 2.0 });
    const sure = march(eye, dir, -GRAZE), maybe = march(eye, dir, GRAZE);
    if (sure !== maybe) continue;                                       // a ray that grazes the edge within 4 mm: the march cannot say
    assert.equal(I.update(eye, dir) === b, sure, `view ${q}: eye (${eye.x.toFixed(2)}, ${eye.y.toFixed(2)}, ${eye.z.toFixed(2)}) dir (${dir.x.toFixed(2)}, ${dir.y.toFixed(2)}, ${dir.z.toFixed(2)})`);
    if (sure) hits++; else misses++;
  }
  assert.ok(hits > 60 && misses > 60, `the views must hit and miss in numbers (${hits} hits, ${misses} misses)`);
  // the board lies along (cos, -sin), not along (cos, +sin) (three turns local +x toward -z for a positive ry)
  const c = Math.cos(ry), s = Math.sin(ry), end = (ex, side) => ({ x: C.x + ex * c, y: C.y, z: C.z - ex * s * side });     // side 1: on the board's axis; side -1: the mirror image of that spot
  for (const ex of [0.7, -0.7]) {
    const p = end(ex, 1), q = { x: p.x + s, y: C.y, z: p.z + c };                                                        // 1 m out from the end along the board's own thin axis (local z)
    assert.equal(I.update(q, toward(q, p)), b, `the board's end at ${ex} m, looked at square on`);
    const m = end(ex, -1), mq = { x: m.x - 1.2 * c, y: C.y, z: m.z + 1.2 * s };                                          // parallel to the true axis, 0.8 m to the side of it: empty air
    assert.equal(I.update(mq, toward(mq, m)), null, `the mirrored spot at ${ex} m: nothing there`);
  }
});

test('R4-009: 20 drawer fronts 0.28 m apart, aimed one by one from 0.8-1.4 m: the aimed one wins every time (the old points lose some)', () => {
  const ctx = mk(), I = ctx.interact, legacy = [], shaped = [];
  const cols = [-0.6, -0.3, 0, 0.3, 0.6], rows = [1.0, 1.25, 1.5, 1.75];
  let n = 0;
  for (const cz of cols) for (const cy of rows) {
    const base = { x: 1.2, y: cy, z: cz };                              // one plane: the front of the chest of drawers
    shaped.push(I.register({ id: 's' + n, ...base, hx: 0.01, hy: 0.1, hz: 0.12, radius: 2, prompt: 's' + n }));
    legacy.push({ id: 'l' + n, ...base, radius: 2, aim: 0.72 });
    n++;
  }
  for (const eyeSet of [{ x: 0, y: 1.5, z: 0 }, { x: 0.25, y: 1.45, z: -0.2 }, { x: -0.1, y: 1.6, z: 0.3 }]) {
    let bad = 0;
    for (const it of shaped) {
      const dir = toward(eyeSet, it), got = I.update(eyeSet, dir);
      if (got !== it) bad++;
    }
    assert.equal(bad, 0, `shaped: ${bad} of 20 aimed fronts lost`);
  }
  let badLegacy = 0; for (let k = 0; k < legacy.length; k++) { const e = { x: 0.25, y: 1.45, z: -0.2 }; if (legacyPick(ctx, legacy, e, toward(e, legacy[k])) !== legacy[k]) badLegacy++; }
  assert.ok(badLegacy >= 2, `the point targeting really does lose aimed drawers here (${badLegacy} of 20): that is the bug this feature fixes`);
  // a drawer pulled out 0.3 m is the nearest thing on the ray to the drawers behind it: it wins where the ray passes through it, and only there
  const out = I.register({ id: 'out', x: 0.9, y: 1.25, z: 0, hx: 0.01, hy: 0.1, hz: 0.12, radius: 2, prompt: 'out' });
  assert.equal(I.update(eye0, toward(eye0, { x: 1.2, y: 1.25, z: 0 })), out, 'the open drawer hides the one behind it');
  assert.equal(I.update(eye0, toward(eye0, { x: 1.2, y: 1.25, z: 0.3 }))?.id, 's' + (3 * 4 + 1), 'beside it the aimed front still wins');
  assert.equal(out.id, 'out');
});

test('shaped hits: the nearest wins, `pri` only breaks ties within 3 cm, and an unblocked far one never beats a near one', () => {
  const ctx = mk(), I = ctx.interact;
  const far = I.register({ id: 'far', x: 1.6, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, pri: 9, prompt: 'far' });
  const near = I.register({ id: 'near', x: 1.0, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, pri: 0, prompt: 'near' });
  assert.equal(I.update(eye0, east), near, 'the front in front of what is behind it, even with a lower pri');
  I.unregister('near');
  const a = I.register({ id: 'a', x: 1.0, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, pri: 1, prompt: 'a' });
  const b = I.register({ id: 'b', x: 1.01, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, pri: 5, prompt: 'b' });   // 1 cm deeper: a tie
  assert.equal(I.update(eye0, east), b, 'within 3 cm the higher pri wins');
  b.pri = 1; assert.equal(I.update(eye0, east), a, 'equal pri: the nearer');
  assert.equal(far.pri, 9);
});

test('sight lines: a wall between the eye and a shaped item hides it; `lead` lets something inside furniture through the furniture wall', () => {
  const wall = { x1: 1.0, z1: -2, x2: 1.0, z2: 2 };
  const ctx = mk([wall]), I = ctx.interact;
  const behind = I.register({ id: 'behind', x: 1.5, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, prompt: 'x' });
  assert.equal(I.update(eye0, east), null, 'a room wall is in the way');
  I.unregister('behind');
  // a thin carcass wall 0.05 m in front of the entry point of the contents: default lead 0.08 steps over it, lead 0 does not
  const w2 = mk([{ x1: 1.3, z1: -2, x2: 1.3, z2: 2 }]), J = w2.interact;
  const inside = J.register({ id: 'in', x: 1.5, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, prompt: 'x' });      // entry at 1.5 - 0.1 - 0.04 = 1.36
  assert.equal(J.update(eye0, east), inside, 'the wall at 1.30 is 0.06 before the entry point: inside the default lead');
  inside.lead = 0; assert.equal(J.update(eye0, east), null, 'lead 0: the wall blocks');
  inside.lead = 0.5; assert.equal(J.update(eye0, east), inside);
  assert.ok(w2.physics.calls > 0);
});

test('shaped hit vs point targets: a nearer, almost centred neighbour wins; an off-centre or farther one does not', () => {
  const ctx = mk(), I = ctx.interact;
  const wardrobe = I.register({ id: 'wardrobe', x: 2.0, y: 1.5, z: 0, hx: 0.4, hy: 0.9, hz: 0.3, radius: 3, prompt: 'abrir' });
  const npc = I.register({ id: 'npc', kind: 'npc', x: 1.2, y: 1.5, z: 0, radius: 3.2, aim: 0.6, prompt: 'hablar' });
  assert.equal(I.update(eye0, east), npc, 'a neighbour standing right in front of the wardrobe is what the player is looking at');
  assert.equal(I.aimed, false);
  npc.z = 0.45;                                                               // 20 degrees off the ray (cos 0.94 < 0.97)
  assert.equal(I.update(eye0, east), wardrobe, 'off to the side: the aimed wardrobe wins');
  npc.z = 0; npc.x = 2.6;                                                     // centred but BEHIND the wardrobe
  assert.equal(I.update(eye0, east), wardrobe);
  npc.x = 1.2; npc.exact = 1.01; assert.equal(I.update(eye0, east), wardrobe, '`exact` is the threshold');
  // with no shaped hit the point targeting is untouched, and the missed wardrobe is never offered
  assert.equal(I.update(eye0, unit(1, 0, 0.5)), npc, 'the wardrobe is missed; the old rule picks the neighbour (cos 0.89 >= aim 0.6)');
  assert.equal(I.aimed, false);
});

test('a shaped miss falls back to the point items exactly as before', () => {
  const ctx = mk(), I = ctx.interact;
  I.register({ id: 'shape', x: 2.0, y: 1.5, z: 3.0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 5, prompt: 's' });
  const door = I.register({ id: 'door', kind: 'door', x: 1.5, y: 1.5, z: 0.2, radius: 2.4, aim: 0.5, prompt: 'd' });
  assert.equal(I.update(eye0, east), door);
  assert.equal(I.aimed, false);
});

// ---------------------------------------------------------------- the static grid and groups
test('static items: same answers as the per-frame list, and a query visits only the eye\'s cell', () => {
  const r = lcg(99), dynCtx = mk(), stCtx = mk(), N = 3000;
  const spec = [];
  for (let i = 0; i < N; i++) {
    const s = { id: 'q' + i, x: (r() - 0.5) * 400, y: 0.5 + r() * 1.5, z: (r() - 0.5) * 400, radius: 1.2 + r() * 1.5, pri: i % 3, prompt: 'x' };
    if (i % 2) { s.hx = 0.05 + r() * 0.2; s.hy = 0.05 + r() * 0.2; s.hz = 0.05 + r() * 0.2; s.ry = r() * 6.28; }
    spec.push(s);
  }
  for (const s of spec) { dynCtx.interact.register({ ...s }); stCtx.interact.register({ ...s, static: true }); }
  assert.equal(stCtx.interact.dyn.size, 0, 'every static item went into the grid');
  let agree = 0, targeted = 0, maxVisited = 0;
  for (let q = 0; q < 1500; q++) {
    const near = spec[Math.floor(r() * N)];                                   // stand near an item and look toward it so that many views really target something
    const eye = { x: near.x + (r() - 0.5) * 2.4, y: 1.5, z: near.z + (r() - 0.5) * 2.4 };
    const dir = toward(eye, { x: near.x, y: near.y, z: near.z });
    const a = dynCtx.interact.update(eye, dir), b = stCtx.interact.update(eye, dir);
    assert.equal(b?.id ?? null, a?.id ?? null, `query ${q}`); agree++; if (b) targeted++;
    maxVisited = Math.max(maxVisited, stCtx.interact.visited);
  }
  assert.equal(agree, 1500); assert.ok(targeted > 500, `many of the queries must find a target (${targeted})`);
  assert.ok(maxVisited < 60, `a query visits ${maxVisited} of ${N} static items (the grid is not used)`);
  assert.equal(dynCtx.interact.visited, N, 'the per-frame list visits every item');
});

test('static boxes: reachable from the neighbouring cell through the box\'s own extent (the registration range adds it to the radius)', () => {
  const ctx = mk(), I = ctx.interact;
  // centre x = 5.2 (cell 1), eye x = 3.65 (cell 0), 1.55 m from the centre; the entry point is ~1.0 m from the eye, inside radius 1.2, but the centre is not
  const w = I.register({ id: 'w', x: 5.2, y: 1.5, z: 0, hx: 0.5, hy: 0.9, hz: 0.5, radius: 1.2, static: true, prompt: 'w' });
  assert.equal(I.update({ x: 3.65, y: 1.5, z: 0 }, east), w);
  assert.equal(I.update({ x: 3.65, y: 1.5, z: 0 }, east), w, 'again');
});

test('static items: a big reach spans several cells and is found from every one of them; an absurd reach stays on the per-frame list', () => {
  const ctx = mk(), I = ctx.interact;
  const big = I.register({ id: 'big', x: 0, y: 1.5, z: 0, radius: 6, aim: 0, static: true, prompt: 'big' });
  assert.ok(big._cells.length >= 4, `${big._cells.length} cells`);
  for (const [x, z] of [[5.5, 0], [-5.5, 0], [0, 5.5], [0, -5.5], [3.9, 3.9], [-3.9, -3.9]]) assert.equal(I.update({ x, y: 1.5, z }, unit(-x || 1, 0, -z || 1)) === big || Math.hypot(x, z) > 6, true, `from ${x},${z}`);
  const huge = I.register({ id: 'huge', x: 0, y: 1.5, z: 0, radius: 400, static: true, prompt: 'huge' });
  assert.equal(I.dyn.has(huge), true); assert.ok(!huge._cells);
  I.unregister('big'); I.unregister('huge'); assert.equal(I.grid.size, 0, 'no empty cells are left behind'); assert.equal(I.items.size, 0);
  assert.equal(CELL, 4);
});

test('groups: unregisterGroup drops all of them, clears the target, and a re-registered id replaces the old item everywhere', () => {
  const ctx = mk(), I = ctx.interact; let used = 0;
  for (let i = 0; i < 6; i++) I.register({ id: 'g' + i, x: 1.5 + i * 0.01, y: 1.5, z: i * 0.001, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, static: i % 2 === 0, group: 'room1', prompt: 'g', use: () => used++ });
  I.register({ id: 'other', x: 0, y: 1.5, z: -1, radius: 2, group: 'room2', prompt: 'o' });
  assert.ok(I.update(eye0, east)?.id.startsWith('g'));
  assert.equal(I.unregisterGroup('room1'), 6);
  assert.equal(I.target, null, 'the removed target is gone at once');
  assert.equal(I.use(), false); assert.equal(used, 0);
  assert.equal(I.unregisterGroup('room1'), 0);
  assert.equal(I.items.size, 1); assert.equal(I.grid.size, 0); assert.equal(I.groups.size, 1);
  const a = I.register({ id: 'k', x: 1.5, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, static: true, group: 'x', prompt: 'old' });
  const b = I.register({ id: 'k', x: 1.5, y: 1.5, z: 0, hx: 0.1, hy: 0.1, hz: 0.1, radius: 3, group: 'y', prompt: 'new' });     // same id, now per-frame and in another group
  assert.equal(I.items.get('k'), b); assert.equal(I.update(eye0, east), b); assert.equal(I.prompt(), 'new');
  assert.equal(I.grid.size, 0, 'the old static copy left the grid'); assert.equal(I.groups.has('x'), false); assert.equal(I.unregisterGroup('x'), 0);
  assert.equal(a._cells, null);
  I.unregister(b); assert.equal(I.items.size, 1);
});

test('use() never fires a target that was removed after the last update', () => {
  const ctx = mk(), I = ctx.interact; let used = 0;
  const it = I.register({ id: 'u', x: 1, y: 1.5, z: 0, radius: 2, aim: 0.5, prompt: 'u', use: () => used++ });
  assert.equal(I.update(eye0, east), it); I.unregister('u');
  assert.equal(I.use(), false); assert.equal(used, 0);
});

// ---------------------------------------------------------------- people (R3-003): the crosshair on a face must give E to the person, not to the counter beside them
/** A fake world whose walls have a top: `segmentBlocked` honours `tall` like physics.segmentBlocked (a wall counts when its top is at least y + tall; y is passed as eye - 1.4). */
const mkTall = (walls = []) => {
  const ctx = { physics: { segmentBlocked(x1, z1, x2, z2, y, h, ignoreDoor, tall = 0) { return walls.some((w) => segCross(x1, z1, x2, z2, w) && (!tall || w.top >= y + tall)); } } };
  ctx.interact = new Interact(ctx); return ctx;
};
const person = (I, o = {}) => I.register({ ...PERSON, id: 'p', kind: 'npc', x: 1.5, y: 1.45, z: 0, radius: 3.2, aim: 0.6, prompt: 'hablar', ...o });   // the item people/world.js registers
const face = { x: 1.5, y: 1.6, z: 0 };                                                                                                              // the crosshair on the face, 1.5 m away
const box = (id, xc, o = {}) => ({ id, kind: 'object', x: xc, y: 1.55, z: 0, hx: 0.1, hy: 0.2, hz: 0.2, radius: 2.6, prompt: id, ...o });
const doorItem = (x, z = 0.05) => ({ id: 'door', kind: 'door', x, y: 1.5, z, radius: 2.4, aim: 0.5, prompt: 'Abrir puerta' });

test('rayCapsuleY: 600 random rays against random capsules agree with marching the ray (entry distance within 1 mm, same hit/miss, the eye inside = 0)', () => {
  const r = lcg(5), dt = 2e-4, maxT = 6; let hits = 0, inside = 0, skipped = 0;
  for (let k = 0; k < 600; k++) {
    const y0 = r() * 0.6, y1 = y0 + 0.3 + r() * 1.3, rad = 0.2 + r() * 0.3;
    const o = [(r() - 0.5) * 5, r() * 2.6, (r() - 0.5) * 5], aim = [(r() - 0.5) * 1.2, y0 + r() * (y1 - y0), (r() - 0.5) * 1.2];
    const v = unit(aim[0] - o[0] + (r() - 0.5) * 0.4, aim[1] - o[1] + (r() - 0.5) * 0.4, aim[2] - o[2] + (r() - 0.5) * 0.4);
    const oo = k % 7 === 0 ? [(r() - 0.5) * 0.3, y0 + 0.2, (r() - 0.5) * 0.3] : o;                                              // every 7th ray starts inside (or at the rim of) the capsule
    let bf = -1, dmin = Infinity;
    for (let t = 0; t <= maxT; t += dt) {
      const x = oo[0] + v.x * t, y = oo[1] + v.y * t, z = oo[2] + v.z * t, cy = Math.min(y1, Math.max(y0, y)), d = Math.hypot(x, y - cy, z);
      if (d < dmin) dmin = d;
      if (d <= rad) { bf = t; break; }
    }
    if (bf < 0 && Math.abs(dmin - rad) < 3e-3) { skipped++; continue; }                                                           // grazing: marching cannot tell
    const got = rayCapsuleY(oo[0], oo[1], oo[2], v.x, v.y, v.z, y0, y1, rad, maxT);
    if (bf < 0) { assert.equal(got, -1, `ray ${k}: marching misses (closest ${dmin.toFixed(4)} vs r ${rad.toFixed(4)})`); continue; }
    hits++; if (bf === 0) inside++;
    assert.ok(got >= 0 && Math.abs(got - bf) < 1e-3, `ray ${k}: entry ${got} vs marched ${bf}`);
  }
  assert.ok(hits > 150 && hits < 550, `a mix of hits and misses (${hits} hits of 600)`); assert.ok(inside >= 20, `rays from inside (${inside})`); assert.ok(skipped < 10, `grazing rays skipped ${skipped}`);
  assert.equal(rayCapsuleY(0, 5, 0, 0, 1, 0, 0, 1, 0.3), -1, 'straight up from above: nothing');
  assert.ok(Math.abs(rayCapsuleY(0, 3, 0, 0, -1, 0, 0, 1, 0.3) - (3 - 1.3)) < 1e-9, 'straight down onto the top cap');
  assert.ok(Math.abs(rayCapsuleY(0, -3, 0, 0, 1, 0, 0, 1, 0.3) - (3 - 0.3)) < 1e-9, 'straight up into the bottom cap');
  assert.equal(rayCapsuleY(-3, 0.5, 0, 1, 0, 0, 0, 1, 0.3, 2.0), -1, 'beyond maxT');
});

test('personHit: a body 0.34 m round an axis from 1.05 m under the item\'s point to 0.24 m over it (the feet to a hand above the head); reach is the item radius', () => {
  const it = { x: 1.5, y: 1.45, z: 0, radius: 3.2 }, e = { x: 0, y: 1.5, z: 0 };   // y 1.45 = the chest of a person standing on y 0
  assert.ok(Math.abs(personHit(null, it, e, east) - (1.5 - PERSON_R)) < 1e-9, 'chest height, dead centre: the front of the body');
  const at = (y, z = 0) => personHit(null, it, e, toward(e, { x: 1.5, y, z }));
  assert.deepEqual([PERSON_R, PERSON_BELOW, PERSON_ABOVE], [0.34, 1.05, 0.24], 'the body of a 1.7 m person: shoulders 0.34 m out, feet at 0.06 m, a hand above the head at 2.03 m');
  assert.ok(at(1.95) > 0, 'the top of a tall person\'s head'); assert.equal(at(2.3), -1, 'well over the head');
  assert.ok(at(0.0) > 0, 'the feet are part of the person'); assert.equal(at(-0.3), -1, 'the ground well in front of the feet is not');
  assert.ok(at(1.5, 0.30) > 0, '0.30 m beside the axis: the shoulder'); assert.equal(at(1.5, 0.45), -1, '0.45 m beside the axis: past the body');
  assert.equal(personHit(null, { ...it, radius: 1.0 }, e, east), -1, 'out of reach');
  assert.equal(personHit(null, it, { x: 1.4, y: 1.5, z: 0.1 }, east), 0, 'the eye inside the body');
  assert.deepEqual([PERSON.soft, PERSON.firm, PERSON.bonus, PERSON.tall, PERSON.hit === personHit], [true, true, 0.3, 1.5, true]);
});

test('R3-003 people: the person wins over the door beside them and over a till or a bread box close in front; an object clearly in front still wins', () => {
  for (const order of ['person first', 'person last']) {
    const ctx = mkTall(), I = ctx.interact, reg = (o) => I.register({ ...o });
    let p; if (order === 'person first') p = person(I);
    reg(doorItem(0.9));                                                                                  // the door 0.6 m in front of the person, dead centre: the old point rule gave it the aim
    reg(box('till', 1.2));                                                                                 // its front enters the ray at 1.06 m, 10 cm before the body at 1.16 m
    if (order === 'person last') p = person(I);
    assert.equal(I.update(eye0, toward(eye0, face)), p, `${order}: the face is what the crosshair is on`);
    assert.equal(I.aimed, true);
    assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.35, z: 0.1 })), p, `${order}: the chest, a hand off the middle`);
    reg(box('bread', 0.8));                                                                                // its front enters at 0.66 m: half a metre before the person, in front of the face
    assert.equal(I.update(eye0, toward(eye0, face))?.id, 'bread', `${order}: the ray enters the bread box first, clearly in front of the person`);
    I.unregister('bread');
    assert.equal(I.update(eye0, toward(eye0, face)), p, `${order}: and with it gone the person again`);
  }
});

test('R3-003 people: the bonus is 0.3 m (the object must be nearer by more than that), and `firm` keeps a nearer door from taking the aim', () => {
  const ctx = mkTall(), I = ctx.interact, p = person(I);
  const b = I.register(box('b', 1.2)), d = toward(eye0, face);
  const tp = personHit(ctx, p, eye0, d);
  const place = (gap) => { b.x = tp - gap + 0.1 + 0.04; };                                              // the box front enters `gap` metres before the body
  place(0.2); assert.equal(I.update(eye0, d), p, 'a drawer front 20 cm in front of the baker does not take the aim');
  place(0.26); assert.equal(I.update(eye0, d), p, '26 cm');
  place(0.40); assert.equal(I.update(eye0, d)?.id, 'b', '40 cm in front: the object');
  I.unregister('b');
  const door = I.register(doorItem(0.9));
  assert.equal(I.update(eye0, d), p, 'a centred door nearer than the person does not take the aim from a body hit');
  p.firm = false; assert.equal(I.update(eye0, d), door, 'without `firm` the old rule gives the centred, nearer door the aim');
  p.firm = true;
  door.x = 0.9; door.z = 0.9;                                                                           // the door 45 degrees to the side, the person off the crosshair altogether
  assert.equal(I.update(eye0, unit(door.x, 0, door.z)), door, 'looking at the door, not the person: the door');
  assert.equal(I.aimed, false);
});

test('R3-003 people: only a room wall or a shut door hides a person; the counter they stand behind does not, and a blocked hit is not offered through the point test', () => {
  const counter = { x1: 0.6, z1: -2, x2: 0.6, z2: 2, top: 1.0 }, roomWall = { x1: 0.6, z1: -2, x2: 0.6, z2: 2, top: 2.6 };
  const c = mkTall([counter]), p1 = person(c.interact); assert.equal(c.interact.update(eye0, toward(eye0, face)), p1, 'a counter 1.0 m high is no obstacle to a face');
  c.interact.update(eye0, toward(eye0, { x: 1.5, y: 1.45, z: 0.55 })); assert.equal(c.interact.target, p1, '... nor to the point fallback, with the crosshair beside them');
  const w = mkTall([roomWall]); person(w.interact); assert.equal(w.interact.update(eye0, toward(eye0, face)), null, 'a wall 2.6 m high hides them');
  w.interact.update(eye0, toward(eye0, { x: 1.5, y: 1.45, z: 0.55 })); assert.equal(w.interact.target, null, '... also for the point fallback');
  const heights = []; const spy = mkTall([]); spy.physics.segmentBlocked = (x1, z1, x2, z2, y, h, ig, tall) => { heights.push(tall); return false; };
  person(spy.interact); spy.interact.update(eye0, toward(eye0, face)); spy.interact.update(eye0, toward(eye0, { x: 1.5, y: 1.45, z: 0.55 }));
  assert.deepEqual(heights, [1.5, 1.5], 'both sight-line tests (the body hit, the point fallback) pass `tall`');
  // a wall piece that crosses the line to where the ray enters the body, but not the line to the middle of the person: the hit is blocked and that is the answer
  const edge = { x1: 1.0, z1: 0.1, x2: 1.0, z2: 0.4, top: 2.6 }, e = mkTall([edge]), p3 = person(e.interact);
  const aim = toward(eye0, { x: 1.5, y: 1.6, z: 0.25 });
  assert.ok(personHit(e, p3, eye0, aim) > 0, 'the ray does hit the body');
  assert.equal(e.interact.update(eye0, aim), null, 'but the wall piece is in the way: no fallback to the point test (which would see the middle of the person)');
  assert.equal(e.physics.segmentBlocked(0, 0, 1.5, 0, 0.1, 1.2, null, 1.5), false, '(the line to the middle is clear)');
});

test('R3-003 people: the nearest body on the ray wins, ties go to `pri` then to the first registered; a miss is still a point target (soft); disabled people are ignored', () => {
  const ctx = mkTall(), I = ctx.interact;
  const far = person(I, { id: 'far', x: 2.4 }), near = person(I, { id: 'near', x: 1.5 });
  assert.equal(I.update(eye0, toward(eye0, face)), near, 'two people in a line: the near one, whatever the order of registration');
  I.unregister('near'); person(I, { id: 'near', x: 1.5 }); assert.equal(I.update(eye0, toward(eye0, face))?.id, 'near');
  I.unregister('far'); I.unregister('near'); person(I, { id: 'near', x: 1.5 }); person(I, { id: 'far', x: 2.4 });
  assert.equal(I.update(eye0, toward(eye0, face))?.id, 'near', 'and with the near one registered first');
  const twin = person(I, { id: 'twin', x: 1.5 }); assert.equal(I.update(eye0, toward(eye0, face))?.id, 'near', 'two people standing in the same place: the first registered');
  twin.pri = 2; assert.equal(I.update(eye0, toward(eye0, face))?.id, 'twin', '`pri` breaks the tie');
  I.unregister('twin'); I.unregister('near'); I.unregister('far');
  const side = person(I, { id: 'side', z: 0.55 });                                                       // 0.55 m beside the crosshair: the body is missed, the point test (cos 0.94) offers them
  assert.equal(I.update(eye0, east), side); assert.equal(I.aimed, false, 'not an aimed hit: a neighbour');
  side.soft = false; assert.equal(I.update(eye0, east), null, 'without `soft` a miss is a miss');
  side.soft = true; side.enabled = () => false; assert.equal(I.update(eye0, toward(eye0, { x: 1.5, y: 1.6, z: 0.55 })), null, 'a disabled person (talking, indoors) takes nothing');
  const door = I.register(doorItem(1.0)); assert.equal(I.update(eye0, east), door, 'and the door beside them is there for the player');
});

// ---------------------------------------------------------------- seats and doors (R2a-004 / -005, round 3)
// The review's sweep: 59 seats, 43 000 looks with the crosshair on a seat; 360 of them offered a DOOR instead (and more offered the table pad or the price board in front).
// 298 of the 360: the seat is across a table, its sight line is blocked, nothing shaped is offered, and the point test hands the aim to a door at the elbow (the 0.7 m
// exemption lets a door through whatever way you look). Now a shaped item the crosshair is ON (box entered within reach, offered or not) keeps the out-of-cone
// points away; and a seat ranks 0.3 m nearer than it is, so the board or the pad a hand in front of it does not take it.
const seatItem = (id, xc, o = {}) => ({ id, kind: 'sit', x: xc, y: 1.4, z: 0, hx: 0.25, hy: 0.4, hz: 0.25, radius: 2.2, lead: 0.5, prompt: 'Sentarse', ...o });      // an armchair, hit box 0.5 m wide, the ray at 1.5 m crosses it
const board = (id, xc, o = {}) => ({ id, kind: 'object', x: xc, y: 1.55, z: 0, hx: 0.1, hy: 0.2, hz: 0.2, radius: 2.6, prompt: id, ...o });                         // a price board / a table pad: entry at xc - 0.14
const elbow = (o = {}) => ({ id: 'door', kind: 'door', x: 0, y: 1.5, z: 0.6, radius: 2.4, aim: 0.5, prompt: 'Abrir puerta', ...o });                                 // 0.6 m to the side: cos 0 against a ray to the east, inside the 0.7 m exemption
const tablePad = { x1: 0.9, z1: -0.2, x2: 0.9, z2: 0.2 };                                                                                                              // across the line to the seat (entry 1.61, lead 0.5: the line ends at 1.11), clear of the door's

test('R2a-004/-005 seats: a seat ranks 0.3 m nearer than it is (the pad or the price board in front of it does not take it), `bonus` overrides it, other kinds get none', () => {
  assert.equal(SEAT_BONUS, 0.3);
  const ctx = mk(), I = ctx.interact;
  const seat = I.register(seatItem('seat', 1.9));                           // enters the ray at 1.9 - 0.25 - 0.04 = 1.61
  const pad = I.register(board('pad', 1.55));                               // enters at 1.41: 20 cm in front of the seat
  assert.equal(I.update(eye0, east), seat, '20 cm in front: the seat');
  pad.x = 1.47; assert.equal(I.update(eye0, east), seat, '28 cm in front: the seat');
  pad.x = 1.35; assert.equal(I.update(eye0, east), pad, '40 cm in front: the object, clearly in front');
  pad.x = 1.55; seat.bonus = 0; assert.equal(I.update(eye0, east), pad, '`bonus: 0` is a bonus of nothing, not the default');
  seat.bonus = 0.5; pad.x = 1.35; assert.equal(I.update(eye0, east), seat, '`bonus: 0.5`: 40 cm in front is still the seat');
  delete seat.bonus; seat.kind = 'object'; pad.x = 1.55; assert.equal(I.update(eye0, east), pad, 'the same box registered as a plain object has no bonus');
  seat.kind = 'sit'; assert.equal(I.update(eye0, east), seat, 'and as a seat again');
  // the board that really is the thing looked at (0.65 m in front of the stool, the crosshair through it) still wins
  pad.x = 1.1; assert.equal(I.update(eye0, east), pad, 'a board 65 cm in front of the stool: the board');
});

test('R2a-004/-005 seats: the crosshair on a seat across a table is not handed to the door at your elbow; with no seat on the ray the door is still there', () => {
  const ctx = mk([tablePad]), I = ctx.interact;
  const seat = I.register(seatItem('seat', 1.9)), door = I.register(elbow());
  assert.equal(I.update(eye0, east), null, 'the table pad hides the seat, and the door 0.6 m to the side is not what the crosshair is on');
  assert.equal(I.aimed, false);
  assert.equal(I.update(eye0, unit(-1, 0, 0)), door, 'looking away from the seat the door at the elbow is offered whatever the angle (the 0.7 m exemption is intact)');
  assert.equal(I.update(eye0, unit(1, 0, 0.6)), door, 'the seat missed (the ray passes it by): the door');
  assert.equal(I.update(eye0, east), null, 'and back on the seat: nothing again (no pick is carried over from the last look)');
  // the seat in the clear: the seat, not the door
  const clear = mk(), J = clear.interact; const s2 = J.register(seatItem('seat', 1.9)); J.register(elbow());
  assert.equal(J.update(eye0, east), s2, 'no table: the seat');
  // a door the crosshair is NEAR (inside its own cone, not centred) is still offered while the seat behind the table is blocked
  const near = ctx.interact; near.unregister('door'); const d2 = near.register(elbow({ x: 1.0, z: 0.35 }));      // 1.06 m away, cos 0.94 against the ray: in the 0.5 cone, short of the 0.97 centre
  assert.equal(near.update(eye0, east), d2, 'a door the player is looking at, beside the seat: offered');
  d2.x = 1.0; d2.z = 1.2;                                                     // 1.56 m away, 50 degrees off the ray: cos 0.64, inside this door's own 0.5 cone, outside the 0.72 default
  assert.equal(near.update(eye0, east), d2, 'a door at 50 degrees, inside its own cone: offered');
  d2.aim = 0.8; assert.equal(near.update(eye0, east), null, 'with a narrower cone it is not');
});

test('R2a-004/-005 seats: only a box the ray enters WITHIN REACH and that is switched on holds the point targets back', () => {
  const ctx = mk([tablePad]), I = ctx.interact;
  const seat = I.register(seatItem('seat', 1.9)), door = I.register(elbow());
  assert.equal(I.update(eye0, east), null, 'baseline: the crosshair is on the blocked seat');
  seat.radius = 1.2; assert.equal(I.update(eye0, east), door, 'the seat is out of reach (entry 1.61 > 1.2): the crosshair is on nothing the player can use');
  seat.radius = 2.2; seat.enabled = () => false; assert.equal(I.update(eye0, east), door, 'a switched-off seat (someone is in it) does not count');
  seat.enabled = undefined; assert.equal(I.update(eye0, east), null, 'and counts again');
  assert.equal(I.update(eye0, unit(1, 0.9, 0)), door, 'a ray over the seat (it misses the box): the door');
  // a hit() function (what stories.js gives its seats) returns the entry distance whatever the reach: past the reach it is a miss, and it holds nothing back
  const c4 = mk([tablePad]), M4 = c4.interact, fn = M4.register({ id: 'fnseat', kind: 'sit', x: 1.9, y: 1.4, z: 0, radius: 1.2, hit: () => 1.61, prompt: 'Sentarse' }); M4.register(elbow());
  assert.equal(M4.update(eye0, east)?.id, 'door', 'a hit() at 1.61 m with a reach of 1.2: out of reach, so the door');
  fn.radius = 2.2; assert.equal(M4.update(eye0, east), null, 'in reach (the table pad hides it): nothing, not the door');
  // a box the ray enters that is not a seat counts too (the drawer, the board): the crosshair is on it
  const c2 = mk([tablePad]), K = c2.interact; K.register(board('pad', 1.5, { radius: 2.0 })); K.register(elbow());
  assert.equal(K.update(eye0, east), null, 'a blocked object on the crosshair: not the door at the elbow either');
  const c3 = mk(), L = c3.interact; L.register(board('pad', 1.5)); L.register(elbow());
  assert.equal(L.update(eye0, east)?.id, 'pad', 'unblocked it is offered');
});
