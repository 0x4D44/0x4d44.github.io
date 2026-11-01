// INTERIORS (A3): the hold-up view of a find (R4-206: "treasures are hard to read from a standing view ... there is no close-up inspect view") and the glint over it. The pure parts (scale, pose, which
// find glints), the object in front of a camera with the library's real models, and the panel it rides (ui/flow.js `addPanel`). The page itself is tests/interiors-page.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-holdup.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createContext } from '../js/core/ctx.js';
import { FINDS } from '../js/interiors/finds.js';
import { glints } from '../js/interiors/contents.js';
import { INSPECT, INSPECT_KEYS, BINDINGS, loadInspectAssets } from '../js/interiors/inspect.js';
import { HOLD, holdScale, holdPose, createHoldUp } from '../js/interiors/holdup.js';
import { GLINT, twinkle } from '../js/interiors/glint.js';
import { readAssetJson } from './headless.mjs';

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b} (±${eps})`);

/** A context whose asset loader parses the checked-in GLBs with the vendored GLTFLoader, as the page does. */
async function loaded() {
  const ctx = createContext({ headless: true }), parser = new GLTFLoader();
  await ctx.assets.init(readAssetJson);
  ctx.assets.loader.loadAsync = async (path) => {
    const bytes = await readFile(new URL('../' + path.replace(/^\.\//, ''), import.meta.url));
    const g = await parser.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    g.scene.updateMatrixWorld(true);
    return g;
  };
  await loadInspectAssets(ctx);
  return ctx;
}
/** The panel layer the hold-up asks for: ui/flow.js addPanel / openPanel / closePanel / current, recorded. */
function flowStub() {
  const f = { panels: {}, current: null, log: [], addPanel(n, def) { if (!f.panels[n]) f.panels[n] = def; }, openPanel(n) { f.current = n; f.log.push('open ' + n); }, closePanel() { const d = f.panels[f.current]; f.current = null; f.log.push('close'); d?.close?.(); } };
  return f;
}
async function world() {
  const ctx = await loaded(), cache = new Map(), events = [];
  ctx.scene = new THREE.Scene(); ctx.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 500); ctx.camera.position.set(3, 1.6, -2); ctx.camera.rotation.set(-0.5, 0.8, 0, 'YXZ'); ctx.camera.updateMatrixWorld(true);
  ctx.mat = (key) => cache.get(key) ?? cache.set(key, new THREE.MeshStandardMaterial({ name: key, metalness: 0.8 })).get(key);
  ctx.flow = flowStub(); ctx.events = { emit: (n, p) => events.push([n, p]) };
  return { ctx, events, hold: createHoldUp(ctx) };
}
const find = (id, model) => ({ id, name: { es: 'Una moneda', en: 'A coin' }, tag: ['Hallazgo · Monedas', 'Find · Coins'], react: { es: 'Pesada.', en: 'Heavy.' }, model: model === undefined ? { key: BINDINGS[id] } : model });
/** The thing's longest side in metres as it is held: the model's own longest side (the library's numbers) times the scale it is held at. */
const longest = (g, key) => g.scale.x * Math.max(...INSPECT[key].s);
/** How big the thing is to the eye, whatever way it is turned: the longest side of the box of its real vertices in the world (`precise`: the loose box of a turned model's box would grow by up to the square root of two). */
const boxLongest = (g) => { const s = new THREE.Box3().setFromObject(g, true).getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); };

test('holdScale: a thing is held at one size whatever it is (a coin 3 cm across grows, a pair of knickers 32 cm shrinks a little), inside limits', () => {
  assert.equal(holdScale(HOLD.SIZE), 1);
  near(holdScale(0.0342), HOLD.SIZE / 0.0342, 1e-9, 'a coin');
  assert.equal(holdScale(0.3211), HOLD.MIN_SCALE, 'a thing too big is shrunk only so far');
  assert.equal(holdScale(0.001), HOLD.MAX_SCALE, 'a thing too small is grown only so far');
  assert.equal(holdScale(0), HOLD.MAX_SCALE); assert.equal(holdScale(-1), HOLD.MAX_SCALE);
  for (const k of INSPECT_KEYS) {                                                                            // every model of the library, held, is between 14 and 23 cm long
    const L = Math.max(...INSPECT[k].s) * holdScale(Math.max(...INSPECT[k].s));
    assert.ok(L >= 0.14 && L <= 0.23, `${k}: held ${L.toFixed(3)} m long`);
  }
});

test('holdPose: it starts facing the eyes, turns whole turns (eased), ends facing them and rests; the lean wavers while it turns and settles', () => {
  const p0 = holdPose(0);
  assert.equal(p0.spin, 0); near(p0.tilt, HOLD.LEAN, 1e-9, 'the lean at the start');
  let prev = -1;
  for (let t = 0; t <= HOLD.SECONDS + 3; t += 0.1) { const s = holdPose(t).spin; assert.ok(s >= prev - 1e-12, `the spin goes back at ${t}`); prev = s; }
  near(holdPose(HOLD.SECONDS).spin, HOLD.TURNS * 2 * Math.PI, 1e-9, 'whole turns by the end');
  assert.ok(holdPose(HOLD.SECONDS * 0.1).spin < HOLD.TURNS * 2 * Math.PI * 0.05, 'it starts slowly (eased in)');
  assert.ok(holdPose(HOLD.SECONDS * 0.9).spin > HOLD.TURNS * 2 * Math.PI * 0.95, 'and slows to a stop (eased out)');
  assert.equal(holdPose(HOLD.SECONDS + 9).spin, holdPose(HOLD.SECONDS).spin, 'it rests');
  near(holdPose(HOLD.SECONDS + 9).tilt, HOLD.LEAN, 1e-9, 'the lean at rest');
  assert.ok(Math.abs(holdPose(1.0).tilt - HOLD.LEAN) > 0.01, 'the lean wavers on the way');
  assert.ok(holdPose(HOLD.SECONDS / 2).spin > 2 * Math.PI * 0.9 && holdPose(HOLD.SECONDS / 2).spin < 2 * Math.PI * 1.1, 'half way = half the turns');
});

test('which finds glint: every treasure and everything 4 cm or less; the big funny and tender things do not', () => {
  const by = (id) => FINDS.find((f) => f.id === id);
  for (const f of FINDS) assert.equal(glints(f), f.kind === 'treasure' || (f.size ?? 0.04) <= 0.04, f.id);
  for (const id of ['oro_centenario', 'reloj_dorado', 'anillo_compromiso', 'pepita_oro', 'canica_azul', 'diente_leche']) assert.ok(glints(by(id)), id);
  for (const id of ['calzones_rosados', 'osito', 'camiseta_firmada', 'peluca', 'foto_boda']) assert.ok(!glints(by(id)), id);
  assert.ok(FINDS.filter(glints).length >= 25 && FINDS.filter(glints).length < FINDS.length, `${FINDS.filter(glints).length} of ${FINDS.length} finds glint`);
});

test('twinkle: the star pulses, sharply, and never goes out', () => {
  let lo = 9, hi = -9;
  for (let t = 0; t < GLINT.PERIOD * 2; t += 0.01) { const k = twinkle(t, 0.3); lo = Math.min(lo, k); hi = Math.max(hi, k); }
  near(lo, GLINT.FLOOR, 1e-6, 'the dimmest'); near(hi, 1, 1e-3, 'the brightest');
  assert.notEqual(twinkle(0.2, 0), twinkle(0.2, 0.5), 'the phase of a find');
  near(twinkle(0.3, 0), twinkle(0.3 + GLINT.PERIOD, 0), 1e-9, 'one twinkle per PERIOD');
});

test('the hold-up: a library model hangs a hand and a half from the eyes at 20 cm, front to the eyes, in the scene; closing takes it out and the panel with it', async () => {
  const { ctx, events, hold } = await world();
  const open = hold.open(find('oro_libra'));
  assert.equal(open, true); assert.equal(ctx.flow.current, 'holdup'); assert.ok(ctx.flow.panels.holdup, 'the panel is handed to the flow');
  assert.equal(ctx.flow.panels.holdup.modal, true, 'M, J and H do nothing meanwhile');
  const g = hold.group; assert.ok(g && ctx.scene.children.includes(g), 'the thing is in the scene'); assert.equal(hold.isOpen, true);
  near(longest(g, 'inspect_gold_coin'), HOLD.SIZE, 0.001, 'the coin is held 20 cm across');
  const cam = ctx.camera, fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion), to = g.position.clone().sub(cam.position);
  near(to.dot(fwd), HOLD.DIST, 0.02, 'it hangs in front of the eyes'); assert.ok(to.length() < 0.5 && to.length() > 0.3, `${to.length()} m away`);
  for (const t of [0, 1.7, 3.3, HOLD.SECONDS, 20]) {
    hold.update(t);
    const L = boxLongest(g); assert.ok(L > 0.15 && L < 0.205, `${L.toFixed(3)} m long to the eye at t=${t} (a disc turned about its width is 0.82 to 1.0 of its diameter)`);
    near(g.position.clone().sub(cam.position).dot(fwd), HOLD.DIST, 0.02, `in front at t=${t}`);
  }
  hold.update(HOLD.SECONDS);
  const front = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
  assert.ok(front.dot(fwd) < -0.9, `at rest the front of the coin faces the eyes (${front.dot(fwd).toFixed(2)})`);
  hold.update(HOLD.SECONDS / 2 / 2);
  const mid = new THREE.Vector3(0, 0, 1).applyQuaternion(g.quaternion);
  assert.ok(Math.abs(mid.dot(fwd)) < 0.9, 'a quarter of the way in it is turned away');
  assert.ok(events.some(([n, p]) => n === 'holdup:open' && p.id === 'oro_libra'));
  hold.close();
  assert.equal(ctx.flow.current, null); assert.equal(hold.isOpen, false); assert.equal(hold.group, null); assert.ok(!ctx.scene.children.some((c) => c.name === 'holdup'), 'the thing is out of the scene');
  assert.ok(events.some(([n, p]) => n === 'holdup:close' && p.id === 'oro_libra'));
  assert.equal(hold.update(1), false, 'nothing to pose once it is put back');
});

test('the hold-up: its own copy of the materials (the drawer keeps its look), the geometry of the library untouched, one thing at a time, E and Space put it back, other keys do not', async () => {
  const { ctx, hold } = await world();
  assert.equal(hold.open(find('oro_libra')), true);
  const g = hold.group, srcMat = ctx.mat('inspect_gold');
  const meshes = []; g.traverse((o) => { if (o.isMesh) meshes.push(o); });
  assert.ok(meshes.length >= 2, `${meshes.length} meshes`);
  for (const m of meshes) assert.notEqual(m.material, ctx.mat(m.material.name), 'a clone, not the drawer\'s own material');
  assert.equal(srcMat.onBeforeCompile === meshes.find((m) => m.material.name === 'inspect_gold')?.material.onBeforeCompile, false, 'the lift is on the copy only');
  const geos = meshes.map((m) => m.geometry), disposed = [];
  for (const geo of geos) geo.addEventListener('dispose', () => disposed.push(geo));
  assert.equal(hold.open(find('reloj_bolsillo')), true, 'a second one replaces the first');
  assert.ok(!ctx.scene.children.includes(g), 'the first is out of the scene'); assert.equal(ctx.scene.children.filter((c) => c.name === 'holdup').length, 1);
  assert.deepEqual(disposed, [], 'the geometry belongs to the asset cache: closing a hold-up never disposes it');
  const panel = ctx.flow.panels.holdup;
  assert.equal(panel.key({ code: 'KeyW' }), false); assert.equal(panel.key({ code: 'KeyM' }), false); assert.equal(hold.isOpen, true);
  assert.equal(panel.key({ code: 'Space', target: { tagName: 'BUTTON' } }), false, 'a focused button takes Space itself'); assert.equal(hold.isOpen, true);
  let stopped = 0; const ev = (code, target) => ({ code, target, stopImmediatePropagation() { stopped++; } });
  assert.equal(panel.key(ev('KeyW')), false); assert.equal(panel.key(ev('Escape')), false, 'Esc is the flow\'s own'); assert.equal(stopped, 0, 'a key that does nothing is passed on');
  assert.equal(panel.key(ev('KeyE')), true); assert.equal(hold.isOpen, false);
  assert.equal(stopped, 1, 'the E that puts it back is not passed on to the player, which would pick it up again in the same keydown');
  assert.equal(hold.open(find('oro_libra')), true); assert.equal(panel.key(ev('Space', { tagName: 'CANVAS' })), true); assert.equal(hold.isOpen, false);
  assert.equal(stopped, 2, 'nor is the Space (a jump)');
  assert.equal(panel.key(ev('KeyE')), false, 'nothing held: no key is taken'); assert.equal(stopped, 2);
  assert.equal(hold.open(find('oro_libra')), true); assert.equal(panel.key({ code: 'KeyE' }), true, 'a bare event without stopImmediatePropagation (a test, an old page) still closes'); assert.equal(hold.isOpen, false);
});

test('the hold-up: no model, no hold-up (a find with only its stand-in shape is not held up as a pale polygon), and no panel layer, no hold-up', async () => {
  const { ctx, hold, events } = await world();
  assert.equal(hold.open(find('aretes_perlas', null)), false, 'no model bound');
  assert.equal(hold.open(find('x', { key: 'inspect_no_such_model' })), false, 'a model that is not in the library');
  const keep = ctx.inspectGlb; ctx.inspectGlb = new Set();
  assert.equal(hold.open(find('oro_libra')), false, 'the model has not loaded: the stand-in stays in the drawer'); ctx.inspectGlb = keep;
  assert.equal(hold.open(null), false);
  assert.deepEqual(ctx.flow.log, [], 'the panel was never asked for'); assert.ok(!ctx.scene.children.some((c) => c.name === 'holdup')); assert.deepEqual(events, []);
  const w2 = await world(); w2.ctx.flow = { openPanel() {}, closePanel() {} };
  assert.equal(createHoldUp(w2.ctx).open(find('oro_libra')), false, 'a flow without addPanel (an old page): nothing happens');
  assert.ok(!w2.ctx.scene.children.some((c) => c.name === 'holdup'));
});

test('every gold coin of finds.js, and the watches whose text the library\'s watch does not contradict, are bound to their model (R4-206)', () => {
  for (const f of FINDS.filter((x) => x.gold)) assert.equal(BINDINGS[f.id], 'inspect_gold_coin', f.id);
  for (const id of ['reloj_bolsillo', 'reloj_brillantes', 'reloj_dedicatoria']) assert.ok(BINDINGS[id], id);
  assert.equal(BINDINGS.reloj_dorado, undefined, 'the library\'s watch is silver: a gold-toned watch is not bound to it');
  assert.equal(BINDINGS.loteria_pendiente, undefined, 'its text gives a number the library\'s ticket does not carry');
  assert.equal(BINDINGS.moneda_chocolate, undefined, 'its text says it has a bite out of it');
});
