// The warm-up of what the game adds after the boot (js/engine/warm.js LateWarm, owner A1): an interior made when the player comes near, the crowd and the animals when the barrio is furnished.
// The first frame that draws such a subtree links its programs where it first draws with each (a link is a blocking wait there: 100-800 ms, measured) and uploads its textures. LateWarm does that a
// little at a time, off the frame. These tests drive it with a fake renderer (no GL) and a fake clock and check WHAT it asks the renderer for, and how much per call:
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-latewarm.test.mjs
import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { LateWarm } from '../js/engine/warm.js';

// ---- a fake clock (every compile / texture upload costs a fixed time) and a fake renderer that keys its programs the way the real one does for what matters here
const clock = { t: 0 }, realNow = Object.getOwnPropertyDescriptor(globalThis, 'performance');
beforeEach(() => { clock.t = 0; Object.defineProperty(globalThis, 'performance', { value: { now: () => clock.t }, configurable: true, writable: true }); });
afterEach(() => { Object.defineProperty(globalThis, 'performance', realNow); });

const COMPILE_MS = 5, UPLOAD_MS = 3;
/** The key three gives a program, reduced to the parts the tests vary: the shader, what the material and the object are, the colour attribute (with or without alpha), no fog for a depth pass. */
const keyOf = (o, m, fog) => m.isMeshDepthMaterial
  ? ['depth', m.side, m.map ? 'map' : '-', m.alphaMap ? 'amap' : '-', m.alphaTest > 0 ? 'test' : '-', o.isSkinnedMesh ? 'skin' : '-', o.isInstancedMesh ? (o.instanceColor ? 'icol' : 'inst') : '-', fog ? 'fog' : 'nofog'].join('|')
  : [m.type, m.id, o.isSkinnedMesh ? 'skin' : '-', o.isInstancedMesh ? (o.instanceColor ? 'icol' : 'inst') : '-', o.geometry.attributes.color ? 'c' + o.geometry.attributes.color.itemSize : '-', fog ? 'fog' : 'nofog'].join('|');

function fakeRenderer(opts = {}) {
  const props = new WeakMap(), programs = [], calls = [], uploads = [], r = {
    info: { programs },
    ready: opts.ready ?? true, isReadyPolls: 0, target: 'canvas',
    properties: { get(k) { let p = props.get(k); if (!p) props.set(k, p = {}); return p; } },
    getRenderTarget() { return r.target; }, setRenderTarget(t) { r.target = t; },
    compile(root, camera, scene) {
      const fog = scene?.fog ?? null;
      root.traverse((o) => {
        if (!o.isMesh) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          const key = keyOf(o, m, fog);
          let p = programs.find((q) => q.cacheKey === key);
          if (!p) { p = { id: programs.length, cacheKey: key, isReady: () => { r.isReadyPolls++; return r.ready; } }; programs.push(p); }
          r.properties.get(m).currentProgram = p;
          calls.push({ obj: o, mat: m, key, fog, target: r.target });
        }
      });
      clock.t += COMPILE_MS;
    },
    initTexture(t) { uploads.push(t); r.properties.get(t).__version = t.version; clock.t += UPLOAD_MS; },
    calls, uploads, programs,
  };
  return r;
}
function fakeCtx(r, extra = {}) {
  const systems = [];
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xaaaaaa, 0.001);
  return { renderer: r, scene, camera: new THREE.PerspectiveCamera(), post: null, opts: { manual: true }, errors: [], running: false, systems, addSystem: (name, fn, order) => systems.push({ name, fn, order }), ...extra };
}
const geom = (colour = 0) => {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
  if (colour) g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(3 * colour), colour));
  return g;
};
const std = (name, p = {}) => Object.assign(new THREE.MeshStandardMaterial({ name }), p);
const mesh = (g, m, cast = false) => { const o = new THREE.Mesh(g, m); o.castShadow = cast; return o; };
const tree = (...kids) => { const g = new THREE.Group(); if (kids.length) g.add(...kids); return g; };
const colourCalls = (r) => r.calls.filter((c) => !c.mat.isMeshDepthMaterial);
const depthCalls = (r) => r.calls.filter((c) => c.mat.isMeshDepthMaterial);

test('one compile per distinct (material, kind of object, vertex layout): the same material on twenty meshes is built once, a different layout or kind is built again', async () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx), wood = std('wood'), cloth = std('cloth');
  const c3 = geom(3), c4 = geom(4), plain = geom(0);
  const skinned = new THREE.SkinnedMesh(c3, wood), inst = new THREE.InstancedMesh(c3, wood, 2), instc = new THREE.InstancedMesh(c3, wood, 2); instc.setColorAt(0, new THREE.Color());
  const kids = [];
  for (let i = 0; i < 20; i++) kids.push(mesh(c3, wood));                       // twenty of one: one compile
  kids.push(mesh(c4, wood), mesh(plain, wood), skinned, inst, instc, mesh(c3, cloth), mesh(c3, cloth));
  const p = lw.warm(tree(...kids));
  lw.drain();
  assert.equal(colourCalls(r).length, 7, 'wood on c3 | c4 | none | skinned | instanced | instanced with colours, and cloth on c3: seven distinct programs, 27 meshes');
  assert.equal(new Set(colourCalls(r).map((c) => c.key)).size, 7, 'and none of them twice');
  assert.equal(lw.stats.meshes, 7); assert.equal(lw.stats.issued, 7);
  assert.equal(typeof await p, 'number', 'the promise resolves, with the milliseconds it took, once the subtree is warm');
});

test('a mesh is compiled with the scene pass\'s render target bound and the target is put back (a program is keyed on the colour space it will draw into)', () => {
  const r = fakeRenderer(), rt = { name: 'scene-pass' }, ctx = fakeCtx(r, { post: { composer: { renderTarget1: {} }, scenePass: { rt } } }), lw = new LateWarm(ctx);
  lw.warm(tree(mesh(geom(3), std('a')))); lw.drain();
  assert.equal(r.calls[0].target, rt);
  assert.equal(r.target, 'canvas', 'the target the page had is back');
});

test('a caster gets the depth program of the sun\'s shadow pass too, from a stand-in keyed as three keys it: the side flipped, the map copied whether or not it is alpha-tested, no fog', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  const front = std('front', { side: THREE.FrontSide, map: new THREE.Texture({}) }), back = std('back', { side: THREE.BackSide }), dbl = std('dbl', { side: THREE.DoubleSide, map: new THREE.Texture({}), alphaTest: 0.5 });
  lw.warm(tree(mesh(geom(3), front, true), mesh(geom(3), back, true), mesh(geom(3), dbl, true), mesh(geom(3), std('nocast'), false))); lw.drain();
  const keys = depthCalls(r).map((c) => c.key);
  assert.deepEqual(keys.sort(), [
    `depth|${THREE.BackSide}|map|-|-|-|-|nofog`,                                // front-sided with a map, no alpha test: three draws it back-sided WITH USE_MAP
    `depth|${THREE.FrontSide}|-|-|-|-|-|nofog`,                                 // back-sided, untextured: drawn front-sided
    `depth|${THREE.DoubleSide}|map|-|test|-|-|nofog`,                           // double-sided, alpha-tested map: both, and the test
  ].sort());
  assert.equal(ctx.scene.fog?.isFogExp2, true, 'the scene\'s fog is back after each stand-in');
  assert.ok(colourCalls(r).every((c) => c.fog), 'the colour programs were keyed WITH the fog the scene has');
  assert.ok(depthCalls(r).every((c) => c.fog === null), 'the depth stand-ins were compiled against no fog: the pass draws against an empty scene');
  assert.equal(lw.stats.issued, 4 + 3, 'four colour programs (the one that casts no shadow too) and three depth programs');
});

test('the depth stand-in is built once per kind, ever: skinned, instanced, with colours, and the same kind in a later subtree are not built again', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx), m = std('m'), n = std('n'), g = geom(3);
  const skin = new THREE.SkinnedMesh(g, m); skin.castShadow = true;
  const inst = new THREE.InstancedMesh(g, m, 2); inst.castShadow = true;
  const instc = new THREE.InstancedMesh(g, m, 2); instc.castShadow = true; instc.setColorAt(0, new THREE.Color());
  lw.warm(tree(mesh(g, m, true), mesh(g, n, true), skin, inst, instc)); lw.drain();
  assert.equal(depthCalls(r).length, 4, 'static (m and n are one kind), skinned, instanced, instanced with colours');
  const before = depthCalls(r).length;
  lw.warm(tree(mesh(geom(3), std('later'), true), new THREE.SkinnedMesh(g, std('later2')))); lw.drain();
  assert.equal(depthCalls(r).length, before, 'a later subtree of the same kinds asks for no stand-in');
  assert.equal(new Set(depthCalls(r).map((c) => c.key)).size, 4);
});

test('the whole subtree is walked, hidden meshes too (they are shown later), and warming the same subtree again builds nothing new', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx), m = std('m'), hidden = mesh(geom(3), std('hidden')); hidden.visible = false;
  const root = tree(mesh(geom(3), m), tree(tree(hidden)));
  lw.warm(root); lw.drain();
  assert.ok(colourCalls(r).some((c) => c.mat === hidden.material), 'a hidden mesh is warmed');
  assert.equal(r.programs.length, 2);
  lw.warm(root); lw.drain();
  assert.equal(r.programs.length, 2, 'the second pass finds every program built: nothing new');
});

test('step(ms) does about ms of work and stops: one compile is the indivisible piece, so a frame never carries more than one over its share', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  const kids = []; for (let i = 0; i < 12; i++) kids.push(mesh(geom(3), std('m' + i)));
  lw.warm(tree(...kids));
  const per = []; let guard = 0;
  while (lw.jobs.length && guard++ < 200) { const n0 = colourCalls(r).length; lw.step(6); per.push(colourCalls(r).length - n0); }
  assert.ok(Math.max(...per) <= 2, `a 6 ms step made at most two 5 ms compiles: ${per.join(',')}`);
  assert.ok(per.filter((n) => n > 0).length >= 6, 'twelve compiles took many frames, not one');
  assert.equal(colourCalls(r).length, 12);
  assert.ok(lw.stats.maxStepMs <= 2 * COMPILE_MS + 1, `the slowest step was ${lw.stats.maxStepMs} ms`);
});

test('the queue shares the frame\'s budget between subtrees too: five subtrees with a program each take three calls, not one', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  for (let i = 0; i < 5; i++) lw.warm(tree(mesh(geom(3), std('job' + i))));
  const per = []; let guard = 0;
  while (lw.jobs.length && guard++ < 200) { const n0 = colourCalls(r).length; lw.step(6); per.push(colourCalls(r).length - n0); }
  assert.ok(Math.max(...per) <= 2, `a 6 ms step finished at most two of the five subtrees: ${per.join(',')}`);
  assert.ok(per.length >= 3, `five subtrees took ${per.length} calls`);
  assert.equal(colourCalls(r).length, 5);
});

test('the job waits, without blocking, for the driver to finish the links (isReady), and not for ever', () => {
  const r = fakeRenderer({ ready: false }), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  let done = false; lw.warm(tree(mesh(geom(3), std('slow')))).then(() => { done = true; });
  for (let i = 0; i < 50; i++) lw.step(5);
  assert.equal(done, false, 'the program is not ready: the subtree is not released');
  assert.ok(r.isReadyPolls >= 40, 'it polled instead of blocking: ' + r.isReadyPolls);
  r.ready = true; lw.step(5); lw.step(5);
  assert.equal(lw.jobs.length, 0, 'the link finished: the job is done');
  // a link that never reports done is not waited for for ever
  const r2 = fakeRenderer({ ready: false }), lw2 = new LateWarm(fakeCtx(r2)); lw2.warm(tree(mesh(geom(3), std('stuck'))));
  let steps = 0; while (lw2.jobs.length && steps < 5000) { lw2.step(5); steps++; }
  assert.equal(lw2.jobs.length, 0); assert.ok(steps >= 899 && steps < 1000, `released after about 900 frames of waiting: ${steps}`);
});

test('the textures of the subtree go to the GPU one call at a time, after the programs, and only those that have not been uploaded', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  const tex = (n) => { const t = new THREE.Texture({ width: 1, height: 1 }); t.name = n; return t; };
  const a = tex('a'), b = tex('b'), c = tex('c'), up = tex('up'); r.properties.get(up).__version = up.version;
  const m = std('m', { map: a, normalMap: b, roughnessMap: up, emissiveMap: c });
  lw.warm(tree(mesh(geom(3), m)));
  const log = []; let guard = 0;
  while (lw.jobs.length && guard++ < 50) { const u0 = r.uploads.length; lw.step(1); log.push(r.uploads.length - u0); }
  assert.deepEqual(r.uploads.map((t) => t.name), ['a', 'b', 'c'], 'every texture that was not up, in slot order; the one already up is left alone');
  assert.ok(Math.max(...log) <= 1, 'a 1 ms step uploads one: ' + log.join(','));
  assert.equal(lw.stats.textures, 3);
  assert.ok(r.calls.length === 1, 'and the program was built once, before them');
});

test('a texture whose file has not come down yet is waited for (landed or failed), then uploaded; one that never settles is not waited for for ever', async () => {
  const r = fakeRenderer(), waits = new Map(), gate = (t) => { let go; waits.set(t, new Promise((res) => { go = res; })); return go; };
  const ctx = fakeCtx(r, { matlib: { whenLoaded: (t) => waits.get(t) ?? Promise.resolve() } }), lw = new LateWarm(ctx);
  const late = new THREE.Texture(), broken = new THREE.Texture(), ready = new THREE.Texture({ width: 1, height: 1 });
  late.name = 'late'; broken.name = 'broken'; ready.name = 'ready';
  const openLate = gate(late), openBroken = gate(broken);
  let done = false; lw.warm(tree(mesh(geom(3), std('m', { map: late, normalMap: broken, roughnessMap: ready })))).then(() => { done = true; });
  for (let i = 0; i < 30; i++) lw.step(5);
  assert.equal(done, false, 'two of the three textures have no image yet: the subtree is not released');
  assert.equal(r.uploads.length, 0, 'and nothing is uploaded until they have settled');
  openBroken(); await Promise.resolve(); await Promise.resolve(); lw.step(5);
  assert.equal(done, false, 'a failed file settles it, but the other one is still on its way');
  late.image = { width: 1, height: 1 }; openLate(); await Promise.resolve(); await Promise.resolve();
  for (let i = 0; i < 5; i++) lw.step(5);
  await Promise.resolve();
  assert.equal(done, true, 'every file has landed or failed: released');
  assert.deepEqual(r.uploads.map((t) => t.name).sort(), ['late', 'ready'], 'the textures that have an image are uploaded; the one that failed is left to three');
  // never settles: released after the bound
  const r2 = fakeRenderer(), never = new THREE.Texture(), ctx2 = fakeCtx(r2, { matlib: { whenLoaded: () => new Promise(() => {}) } }), lw2 = new LateWarm(ctx2);
  lw2.warm(tree(mesh(geom(3), std('x', { map: never }))));
  let steps = 0; while (lw2.jobs.length && steps < 5000) { lw2.step(5); steps++; }
  assert.equal(lw2.jobs.length, 0); assert.ok(steps >= 1799 && steps < 2000, `released after about 1800 calls of waiting: ${steps}`);
});

test('drain() runs everything now (a probe wants the barrio as it will be), links that are not ready included', () => {
  const r = fakeRenderer({ ready: false }), ctx = fakeCtx(r), lw = new LateWarm(ctx);
  let n = 0; lw.warm(tree(mesh(geom(3), std('a')))).then(() => n++); lw.warm(tree(mesh(geom(4), std('b')))).then(() => n++);
  lw.drain();
  assert.equal(lw.jobs.length, 0);
  return Promise.resolve().then(() => assert.equal(n, 2));
});

test('with no renderer (a lost context, ?skip, a test page) nothing is held back: every job resolves at once', async () => {
  const ctx = fakeCtx(null), lw = new LateWarm(ctx); let n = 0;
  const p = Promise.all([lw.warm(tree(mesh(geom(3), std('a')))).then(() => n++), lw.warm(tree()).then(() => n++)]);
  lw.step(5); await p;
  assert.equal(n, 2); assert.equal(lw.jobs.length, 0);
  const lost = fakeCtx(fakeRenderer(), { contextLost: true }), lw2 = new LateWarm(lost);
  const q = lw2.warm(tree(mesh(geom(3), std('b')))); lw2.step(5); await q; assert.equal(lw2.jobs.length, 0);
});

test('an error in one job is reported, not thrown: the job is released and the next one still runs', async () => {
  const r = fakeRenderer(), ctx = fakeCtx(r), lw = new LateWarm(ctx), good = tree(mesh(geom(3), std('good')));
  const bad = tree(mesh(geom(3), std('bad'))); const compile = r.compile; let n = 0;
  r.compile = function (root, ...rest) { if (root.material?.name === 'bad') throw new Error('driver said no'); n++; return compile.call(this, root, ...rest); };
  const pa = lw.warm(bad), pb = lw.warm(good); lw.drain(); await Promise.all([pa, pb]);
  assert.equal(ctx.errors.length, 1); assert.match(ctx.errors[0].message, /late warm: driver said no/); assert.equal(ctx.errors[0].stage, 'warm');
  assert.equal(n, 1, 'the good job was built');
});

test('attach() registers the warm-up as a system BEFORE the interiors\' (an interior is shown once it is warm, so the warm-up is what the rest waits for) and it takes only the frame\'s spare budget', () => {
  const r = fakeRenderer(), ctx = fakeCtx(r, { loopOn: true, running: true, opts: {} }), lw = new LateWarm(ctx).attach();
  assert.equal(ctx.lateWarm, lw);
  const sys = ctx.systems.find((s) => s.name === 'latewarm'); assert.ok(sys, 'a system named latewarm'); assert.ok(sys.order < 8, 'it runs before the interiors (order 8): ' + sys.order);
  const kids = []; for (let i = 0; i < 6; i++) kids.push(mesh(geom(3), std('m' + i)));
  lw.jobs.push({ root: tree(...kids), resolve() {}, phase: 0, list: null, i: 0, mats: new Set(), seen: new Set(), tex: null, k: 0, t0: 0, frames: 0 });
  sys.fn();                                                                      // a frame of play: the budget is 4 ms, a compile is 5 ms: one compile, then nothing more this frame
  assert.equal(colourCalls(r).length, 1, 'one compile in a 4 ms frame');
  assert.ok(ctx.streamMs >= COMPILE_MS, 'what it spent is on the frame\'s account (core/budget.js): ' + ctx.streamMs);
  sys.fn();                                                                      // the same frame, asked again (by anyone): the share is spent, the system does nothing
  assert.equal(colourCalls(r).length, 1, 'a frame whose share is spent gets no more work');
  ctx.streamMs = 0; sys.fn();                                                    // the next frame (engine/index.js clears the account): one more
  assert.equal(colourCalls(r).length, 2);
});
