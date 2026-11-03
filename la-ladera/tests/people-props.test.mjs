// Props in hand (R3-004 the phones, R3-010 the basket seller): the prop table, the clip -> prop mapping and the clip choices. Pure: no GL, no page.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/people-props.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { PROPS, CLIP_PROP, PHONE_GLOW, PHONE_UP, propFor, phoneClip, sellClip, holdProp, showPhone } from '../js/people/props.js';

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

test('phone: the screen glows without blazing (R3-205 saw a large bright white phone in a walker\'s hand at night; it glowed at 0.85)', () => {
  assert.equal(PROPS.phone.make().children[0].material.emissiveIntensity, PHONE_GLOW);
  assert.ok(PHONE_GLOW >= 0.3 && PHONE_GLOW <= 0.6, 'lit, but well under the old 0.85: ' + PHONE_GLOW);
});

test('phone_ear (R3-205): the phone is held in the fist, not on top of it, and leans in to the head', () => {
  // The call clip folds the forearm up to the shoulder, so the hand bone (the wrist) is a few cm below and in front of the ear and the fist closes a hand's breadth beyond it. The grip was 10.5 cm above
  // the wrist and 9.4 cm behind it: the phone stood on top of the fist, 4 cm off the head, "floating beside the ear". The numbers are read off renders of four bodies at the clip's first frame (front, side, three-quarter).
  const [x, y, z] = PROPS.phone_ear.pos, top = new THREE.Vector3(0, 0, -1).applyQuaternion(PROPS.phone_ear.quat());
  assert.ok(y <= 0.09 && z <= 0.075, `the middle of the phone is ${(y * 100).toFixed(1)} cm above and ${(z * 100).toFixed(1)} cm behind the wrist: in the fist`);
  assert.ok(x <= -0.07, `and ${(-x * 100).toFixed(1)} cm in toward the head`);
  assert.ok(top.x < 0 && top.y > 0.9, `the top edge leans in to the head and stays upright: ${top.toArray().map((v) => v.toFixed(2))}`);
});

test('showPhone: the phone of a phone clip shows once that clip is half in; a bundle, a broom, nothing, or another clip is left alone', () => {
  const action = (w, running = true) => ({ isRunning: () => running, getEffectiveWeight: () => w });
  const held = (propName, clip, w, running = true) => ({ propName, props: new Map([['main', { visible: true }]]), actions: new Map([[clip, action(w, running)]]) });
  assert.equal(PHONE_UP, 0.5);
  for (const [clip, prop] of [['phone_call', 'phone_ear'], ['phone_stand', 'phone'], ['sit_phone', 'phone']]) {
    assert.equal(CLIP_PROP[clip], prop);
    const p = held(prop, clip, 0.3);
    assert.equal(showPhone(p, clip), false, clip + ': a third of the way in, the hand is still down'); assert.equal(p.props.get('main').visible, false);
    p.actions.set(clip, action(PHONE_UP)); assert.equal(showPhone(p, clip), true, clip + ': half way'); assert.equal(p.props.get('main').visible, true);
    p.actions.set(clip, action(1)); assert.equal(showPhone(p, clip), true);
    p.actions.set(clip, action(0.4)); assert.equal(showPhone(p, clip), false, 'and it hides again if the clip fades out under it'); assert.equal(p.props.get('main').visible, false);
    assert.equal(showPhone(held(prop, clip, 1, false), clip), false, clip + ': a clip that is not running shows nothing');
  }
  const bundle = held('bundle', 'phone_stand', 0.1); assert.equal(showPhone(bundle, 'phone_stand'), true); assert.equal(bundle.props.get('main').visible, true, 'what the brain hands out is never hidden');
  const walk = held('phone', 'walk', 0.1); assert.equal(showPhone(walk, 'walk'), true); assert.equal(walk.props.get('main').visible, true, 'only a phone clip gates its phone');
  assert.equal(showPhone({ propName: null, props: new Map(), actions: new Map() }, 'phone_call'), true, 'no prop, nothing to gate');
});
