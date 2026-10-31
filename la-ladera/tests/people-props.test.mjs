// Props in hand (R3-004 the phones, R3-010 the basket seller): the prop table, the clip -> prop mapping and the clip choices. Pure: no GL, no page.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-props.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PROPS, CLIP_PROP, propFor, phoneClip, sellClip, holdProp } from '../js/people/props.js';

const META = JSON.parse(readFileSync(new URL('../assets/models/people/people_meta.json', import.meta.url), 'utf8'));
const CLIPS = new Set(Object.keys(META.clipFrames));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('props: the table only names clips the built rig has, and every clip-given prop exists', () => {
  assert.ok(CLIPS.has('phone_stand') && CLIPS.has('phone_call') && CLIPS.has('sit_phone') && CLIPS.has('carry_stand'), 'the rig must carry the phone and basket clips');
  for (const [name, s] of Object.entries(PROPS)) {
    assert.equal(typeof s.make, 'function', name + ' has no maker');
    assert.ok(s.bone && Array.isArray(s.pos) && s.pos.length === 3 && s.pos.every(Number.isFinite), name + ' needs a bone and a 3-vector offset');
    assert.ok(s.quat() instanceof THREE.Quaternion, name + ' needs an orientation');
    if (s.pose) assert.ok(CLIPS.has(s.pose.clip), `${name} is authored against clip "${s.pose.clip}", which the rig does not have`);
  }
  for (const [clip, prop] of Object.entries(CLIP_PROP)) {
    assert.ok(CLIPS.has(clip), `CLIP_PROP names clip "${clip}", which the rig does not have`);
    assert.ok(PROPS[prop], `clip "${clip}" asks for prop "${prop}", which is not in the table`);
  }
});

test('props: a phone clip shows a phone, and what the brain hands out wins over it', () => {
  assert.equal(propFor({}, 'phone_stand'), 'phone');
  assert.equal(propFor({}, 'sit_phone'), 'phone');
  assert.equal(propFor({}, 'phone_call'), 'phone_ear');
  for (const clip of ['idle_a', 'walk', 'talk', 'sit_idle', 'sell', 'sweep']) assert.equal(propFor({}, clip), null, clip + ' holds nothing of its own');
  assert.equal(propFor({ prop: 'bundle' }, 'phone_stand'), 'bundle', 'a carried bundle is not swapped for a phone');
  assert.equal(propFor({ prop: 'broom' }, 'sweep'), 'broom');
  assert.equal(propFor({ prop: null }, 'phone_call'), 'phone_ear');
});

test('phoneClip: seated people text; two in five of the standing hold it to the ear, always the same ones', () => {
  for (const j of [0, 0.2, 0.39, 0.5, 0.99]) assert.equal(phoneClip({ jit: [0.5, j, 0.5] }, true), 'sit_phone', 'a seated person never stands to phone (jit ' + j + ')');
  let calls = 0;
  for (let i = 0; i < 100; i++) if (phoneClip({ jit: [0.5, i / 100, 0.5] }, false) === 'phone_call') calls++;
  assert.equal(calls, 40, 'jit[1] < 0.4 means a call: exactly 40 of 100 evenly spread people');
  assert.equal(phoneClip({ jit: [0, 0.39, 0] }, false), 'phone_call');
  assert.equal(phoneClip({ jit: [0, 0.40, 0] }, false), 'phone_stand');
  assert.equal(phoneClip({ jit: [0, 0.1, 0] }, false, false), 'phone_stand', 'a rig without the call clip texts instead');
  assert.equal(phoneClip({}, false), 'phone_stand', 'no personal offsets: texting');
  const p = { jit: [0.3, 0.25, 0.9] };
  assert.equal(phoneClip(p, false), phoneClip(p, false), 'the same person, the same clip');
});

test('sellClip: a seller with a basket stands holding it, the others show an open hand', () => {
  assert.equal(sellClip({ prop: 'basket' }), 'carry_stand');
  assert.equal(sellClip({ prop: 'basket' }, false), 'sell', 'no carry clip: the open hand');
  assert.equal(sellClip({}), 'sell');
  assert.equal(sellClip({ prop: 'bundle' }), 'sell');
  assert.equal(sellClip({ prop: null }), 'sell');
});

const fakeLib = () => { const calls = []; return { calls, detach(inst, tag) { calls.push(['detach', tag]); const p = inst.props.get(tag); if (p) inst.props.delete(tag); }, attachOriented(inst, bone, prop, pos, quat, scale, tag, pose) { calls.push(['attach', bone, pos, scale, tag, pose?.clip ?? null]); inst.props.set(tag, prop); return prop; } }; };
const person = (heightM) => ({ id: 'x', meta: { heightM }, props: new Map(), propName: null });

test('holdProp: a phone follows the person’s height but keeps its own size; a broom does not move with it', () => {
  const at = (name, h) => { const lib = fakeLib(), inst = person(h); const p = holdProp(lib, inst, name); const c = lib.calls.find((x) => x[0] === 'attach'); return { p, c }; };
  const base = PROPS.phone.pos;
  const adult = at('phone', 1.64).c, kid = at('phone', 1.20).c, tall = at('phone', 2.20).c, tiny = at('phone', 0.80).c;
  base.forEach((v, i) => assert.ok(near(adult[2][i], v), 'a 1.64 m person gets the authored offset'));
  base.forEach((v, i) => assert.ok(near(kid[2][i], v * (1.2 / 1.64), 1e-9), 'a 1.20 m child gets the offset scaled to their arms'));
  base.forEach((v, i) => assert.ok(near(tall[2][i], v * 1.12, 1e-9), 'the scale tops out at 1.12'));
  base.forEach((v, i) => assert.ok(near(tiny[2][i], v * 0.7, 1e-9), 'and bottoms out at 0.7'));
  for (const c of [adult, kid, tall, tiny]) assert.equal(c[3], 1, 'the phone itself is never scaled: a child’s phone is as big as an adult’s');
  const broom = at('broom', 1.2).c;
  PROPS.broom.pos.forEach((v, i) => assert.equal(broom[2][i], v, 'the broom’s offset is not height-scaled'));
  assert.equal(adult[5], 'phone_stand', 'the phone is authored against its clip');
  assert.equal(at('phone_ear', 1.64).c[5], 'phone_call');
  const earKid = at('phone_ear', 1.20).c;
  PROPS.phone_ear.pos.forEach((v, i) => assert.ok(near(earKid[2][i], v * (1.2 / 1.64), 1e-9), 'the ear phone follows a child’s arms too'));
  assert.equal(adult[1], 'hand_r');
});

test('holdProp: holding the same prop again changes nothing, nothing detaches it, a different one replaces it', () => {
  const lib = fakeLib(), inst = person(1.64);
  const a = holdProp(lib, inst, 'phone'); assert.ok(a && inst.propName === 'phone');
  const n0 = lib.calls.length;
  assert.equal(holdProp(lib, inst, 'phone'), a, 'same prop, same object');
  assert.equal(lib.calls.length, n0, 'and no second attach / detach');
  assert.equal(holdProp(lib, inst, null), null); assert.equal(inst.propName, null); assert.equal(inst.props.size, 0);
  assert.equal(holdProp(lib, inst, 'no_such_prop'), null, 'an unknown name holds nothing and does not throw');
  const b = holdProp(lib, inst, 'phone_ear'); assert.ok(b && b !== a && inst.propName === 'phone_ear');
});

test('phone: a real phone size, the screen faces the user in each grip', () => {
  const size = new THREE.Box3().setFromObject(PROPS.phone.make()).getSize(new THREE.Vector3());
  const w = Math.min(size.x, size.z), l = Math.max(size.x, size.z);
  assert.ok(w >= 0.065 && w <= 0.08, 'phone width ' + w.toFixed(3));
  assert.ok(l >= 0.14 && l <= 0.17, 'phone length ' + l.toFixed(3));
  assert.ok(size.y >= 0.006 && size.y <= 0.014, 'phone thickness ' + size.y.toFixed(3));
  const screen = (q) => new THREE.Vector3(0, 1, 0).applyQuaternion(q), top = (q) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
  // character frame: up +Y, forward -Z, right +X. Texting: the screen faces up and back at the face, the top edge points away and up.
  const sT = screen(PROPS.phone.quat()), tT = top(PROPS.phone.quat());
  assert.ok(sT.y > 0.5 && sT.z > 0.3 && Math.abs(sT.x) < 0.05, `texting screen normal ${sT.toArray().map((v) => v.toFixed(2))}`);
  assert.ok(tT.z < -0.5 && tT.y > 0.3, `texting top edge ${tT.toArray().map((v) => v.toFixed(2))}`);
  assert.ok(near(sT.dot(tT), 0, 1e-6), 'screen normal and top edge are at right angles');
  // a call at the right ear: the screen faces the head (-X), the top edge points up
  const sE = screen(PROPS.phone_ear.quat()), tE = top(PROPS.phone_ear.quat());
  assert.ok(sE.x < -0.9, `ear screen normal ${sE.toArray().map((v) => v.toFixed(2))}`);
  assert.ok(tE.y > 0.9, `ear top edge ${tE.toArray().map((v) => v.toFixed(2))}`);
});

test('phone: one mesh (one draw call), and only the +Y face is lit, with a bezel round the screen', () => {
  for (const name of ['phone', 'phone_ear']) {
    const m = PROPS[name].make();
    assert.equal(m.children.length, 1, name + ': one mesh = one draw call per phone');
    assert.ok(m.children[0].isMesh && !Array.isArray(m.children[0].material), name + ': one material');
  }
  const mesh = PROPS.phone.make().children[0], uv = mesh.geometry.attributes.uv, tex = mesh.material.emissiveMap, W = tex.image.width, data = tex.image.data;
  const glow = (u, v) => { const x = Math.min(W - 1, Math.floor(u * W)), y = Math.min(W - 1, Math.floor(v * W)), p = (y * W + x) * 4; return data[p] + data[p + 1] + data[p + 2]; };
  // BoxGeometry builds +x -x +y -y +z -z, four vertices each: the third is the screen, the other five sample the black half of the atlas
  for (let f = 0; f < 6; f++) {
    let cu = 0, cv = 0; for (let k = 0; k < 4; k++) { cu += uv.getX(f * 4 + k) / 4; cv += uv.getY(f * 4 + k) / 4; }       // the middle of the face
    if (f === 2) assert.ok(glow(cu, cv) > 0, 'the +Y face is what glows'); else assert.equal(glow(cu, cv), 0, 'face ' + f + ' stays dark');
  }
  assert.ok(glow(0.75, 0.5) > 0, 'the middle of the screen glows');
  assert.equal(glow(0.52, 0.5), 0, 'a bezel on the left of the screen');
  assert.equal(glow(0.98, 0.5), 0, 'a bezel on the right');
  assert.equal(glow(0.75, 0.01), 0, 'a bezel at the top');
  assert.equal(glow(0.75, 0.99), 0, 'a bezel at the bottom');
  assert.ok(glow(0.55, 0.5) > 0 && glow(0.75, 0.05) > 0, 'and the screen starts right inside it');
  assert.ok(mesh.material.emissiveIntensity > 0 && mesh.material.map, 'a lit, textured material');
});
