// INTERIORS (A3): the generic close-up of a find (R2b-004: "44 of 64 find types have no close-up model: a fancy watch, 8 of 9 jewels, two of the knickers, the banknote nearest spawn"). js/interiors/generic.js
// draws, in code and in the library's own materials, every find the inspect library has no model for, and holdup.js holds it up. Here: the builders (every find of finds.js, to the library's contract, each
// its own picture) and the hold-up (all 64 finds: the library's model where it has loaded, the generic one where not, and nothing leaked). The E key into the hold-up is
// tests/interiors-inspect-wiring.test.mjs; the page is tests/interiors-page.test.mjs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/interiors-generic.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createContext } from '../js/core/ctx.js';
import { MaterialLib, ALL_DEFS } from '../js/core/matlib.js';
import { FINDS, FIND_SHAPES, findById } from '../js/interiors/finds.js';
import { INSPECT, BINDINGS, inspectParts, loadInspectAssets } from '../js/interiors/inspect.js';
import { HOLD, holdScale, createHoldUp } from '../js/interiors/holdup.js';
import { GENERIC_SHAPES, GENERIC_FINDS, genericKind, genericModel } from '../js/interiors/generic.js';
import { readAssetJson } from './headless.mjs';

const near = (a, b, eps, what) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b} (±${eps})`);
/** What containers.js `useObject` hands the hold-up for a find: its own record, as the close-up asks for it. */
const ask = (f) => ({ id: f.id, shape: f.shape, tint: f.tint, size: f.size });
const trisOf = (m) => m.parts.reduce((n, p) => n + (p.geometry.index?.count ?? p.geometry.attributes.position.count) / 3, 0);
/** A picture's fingerprint: each part's material, its vertex count and a hash of its vertices to a hundredth of a millimetre (at size 1). */
function print(m) {
  return m.parts.map(({ geometry, matKey }) => {
    let h = 2166136261; for (const v of geometry.attributes.position.array) h = Math.imul(h ^ Math.round(v * 1e5), 16777619) >>> 0;
    return `${matKey}/${geometry.attributes.position.count}/${h}`;
  }).sort().join(' ');
}
/** The same picture of a find whatever its own tint and size are: only the builder shows. */
const bare = (f) => genericModel({ id: f.id, shape: f.shape, tint: 0x808080, size: 1 });

// ------------------------------------------------------------------------------------------------ the builders
test('the tables: a family for every shape word of finds.js, a builder of its own only for a real find, and every find has a close-up from one or the other', () => {
  assert.deepEqual([...GENERIC_SHAPES].sort(), [...FIND_SHAPES].sort(), 'one family per shape word: a word without one would leave its finds with nothing to hold');
  assert.equal(new Set(GENERIC_FINDS).size, GENERIC_FINDS.length);
  for (const id of GENERIC_FINDS) assert.ok(findById.has(id), `${id} is not a find of finds.js: a stale builder`);
  for (const f of FINDS) { const k = genericKind(ask(f)); assert.ok(k === `find:${f.id}` || k === `shape:${f.shape}`, `${f.id}: drawn by ${k}`); }
  assert.equal(genericKind({ id: 'no_such_find', shape: 'teapot' }), null, 'a find of no known shape and no builder has no close-up');
  assert.equal(genericModel({ id: 'no_such_find', shape: 'teapot', size: 0.1 }), null);
  assert.equal(genericModel(), null); assert.equal(genericModel({}), null);
});

test('every find of finds.js has a close-up to the library\'s contract: sound geometry in the library\'s own materials, white vertex colour, centred, its longest side the find\'s size, under 6000 triangles', () => {
  const lib = new MaterialLib({});
  for (const f of FINDS) {
    const m = genericModel(ask(f)); assert.ok(m, `${f.id}: no close-up`);
    assert.ok(m.parts.length >= 1 && m.parts.length <= 12, `${f.id}: ${m.parts.length} parts`);
    const box = new THREE.Box3();
    for (const { geometry: g, matKey } of m.parts) {
      const pos = g.attributes.position, col = g.attributes.color, nor = g.attributes.normal;
      assert.ok(g.isBufferGeometry && pos && pos.itemSize === 3 && pos.count >= 3, `${f.id}: a part has no positions`);
      assert.ok(pos.array.every(Number.isFinite), `${f.id}: a vertex is not a number`);
      if (g.index) { let top = -1; for (let i = 0; i < g.index.count; i++) top = Math.max(top, g.index.getX(i)); assert.ok(top < pos.count, `${f.id}: an index past the last vertex`); }
      assert.ok(col && col.itemSize === 3 && col.count === pos.count && col.array.every((v) => v === 1), `${f.id}: no white vertex colour (the library's materials are vertex-coloured: a part without it is drawn black)`);
      assert.ok(nor && nor.itemSize === 3 && nor.count === pos.count && nor.array.every(Number.isFinite), `${f.id}: no normals`);
      const [name, tint] = matKey.split('#');
      assert.ok(/^inspect_[a-z]+(#[0-9a-f]{6})?$/.test(matKey), `${f.id}: ${matKey} is not a material of the inspect library`);
      assert.ok(ALL_DEFS[name] && ALL_DEFS[name].tex === false && ALL_DEFS[name].vertexColors !== false, `${f.id}: ${name} is not a flat, vertex-coloured material of matdefs.js`);
      const mat = lib.get(matKey); assert.ok(mat.isMeshStandardMaterial && mat.vertexColors === true && mat.name === matKey, `${f.id}: ${matKey} does not resolve`);
      if (tint) assert.equal(mat.color.getHex(), parseInt(tint, 16), `${f.id}: ${matKey} is tinted`);
      g.computeBoundingBox(); box.union(g.boundingBox);
    }
    const dim = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
    near(Math.max(dim.x, dim.y, dim.z), f.size, 1e-6, `${f.id}: its longest side is the find's size`);
    near(dim.x, m.size[0], 1e-6, `${f.id}: size[0]`); near(dim.y, m.size[1], 1e-6, `${f.id}: size[1]`); near(dim.z, m.size[2], 1e-6, `${f.id}: size[2]`);
    near(c.length(), 0, 1e-6, `${f.id}: centred on its box`);
    assert.ok(trisOf(m) <= 6000, `${f.id}: ${trisOf(m)} triangles (a held thing is drawn at full detail: a sphere's worth is plenty)`);
  }
  assert.deepEqual([...lib.missing], [], 'a name the material library does not define');
});

test('a close-up is deterministic, new every time (the caller disposes it) and takes its tint and its size from the find', () => {
  for (const f of FINDS) {
    const a = genericModel(ask(f)), b = genericModel(ask(f));
    assert.equal(print(a), print(b), `${f.id}: two builds differ (it must look the same every time it is held)`);
    for (let i = 0; i < a.parts.length; i++) assert.notEqual(a.parts[i].geometry, b.parts[i].geometry, `${f.id}: two builds share geometry: putting one back would break the other`);
  }
  const at = (shape, size) => genericModel({ shape, tint: 0xc8c0b0, size });
  const p5 = at('box', 0.05), p10 = at('box', 0.1);
  for (let i = 0; i < p5.parts.length; i++) { const a = p5.parts[i].geometry.attributes.position.array, b = p10.parts[i].geometry.attributes.position.array; for (let j = 0; j < a.length; j++) near(b[j], a[j] * 2, 1e-6, 'twice the size, twice the vertices'); }
  near(Math.max(...genericModel({ shape: 'key', tint: 0xc8c0b0 }).size), 0.05, 1e-9, 'no size: five centimetres');
  assert.ok(genericModel({ shape: 'coin', size: 0.03 }), 'no tint: a default one');
  assert.ok(genericModel({ shape: 'shirt', tint: 0x336699, size: 0.3 }).parts.some((p) => p.matKey.endsWith('#336699')), 'a shirt is cut from cloth of the find\'s colour');
  assert.deepEqual(genericModel({ shape: 'coin', tint: 0x336699, size: 0.03 }).parts.map((p) => p.matKey), ['inspect_brass#336699'], 'a coin of another colour is brass of it');
  assert.deepEqual(genericModel({ shape: 'coin', tint: 0xe3b53b, size: 0.03 }).parts.map((p) => p.matKey), ['inspect_gold'], 'a yellow one is the library\'s gold');
});

test('each find the library does not draw has a picture of its own, and a builder of its own is not its family in disguise', () => {
  const SAME = [];                                                                               // pairs of finds that may share a picture (none today: two finds of one shape word each have a builder of their own)
  const unbound = FINDS.filter((x) => !BINDINGS[x.id]), by = new Map();
  for (const f of unbound) { const p = print(bare(f)); by.set(p, [...(by.get(p) ?? []), f.id]); }
  const clashes = [...by.values()].filter((ids) => ids.length > 1).map((ids) => ids.sort().join('+')).sort();
  assert.deepEqual(clashes, SAME, 'finds held up as the same picture: give the new one a builder of its own in generic.js (VARIANT), or name the pair here');
  assert.ok(unbound.length >= 40 && by.size === unbound.length, `${by.size} pictures for ${unbound.length} finds`);
  for (const id of GENERIC_FINDS) {
    const f = findById.get(id);
    assert.notEqual(print(bare(f)), print(genericModel({ shape: f.shape, tint: 0x808080, size: 1 })), `${id}: drawn exactly as its family word (${f.shape}): its builder is dead weight`);
  }
});

// ------------------------------------------------------------------------------------------------ the hold-up
/** A context whose asset loader parses the checked-in GLBs with the vendored GLTFLoader, as the page does (the library's real materials: nothing stubbed but the loader). */
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
  const ctx = await loaded(), events = [];
  ctx.scene = new THREE.Scene(); ctx.camera = new THREE.PerspectiveCamera(70, 16 / 9, 0.05, 500); ctx.camera.position.set(3, 1.6, -2); ctx.camera.updateMatrixWorld(true);   // (looking down -Z: the world's axes are the eye's)
  ctx.flow = flowStub(); ctx.events = { emit: (n, p) => events.push([n, p]) };
  return { ctx, events, hold: createHoldUp(ctx) };
}
/** What the E key asks for (containers.js `useObject`): the find's text, the library's model when it is bound, and its own record for the close-up. */
const asked = (f, model, generic = ask(f)) => ({ id: f.id, name: f.name, tag: ['Hallazgo', 'Find'], react: f.react, model, generic });
const meshesOf = (g) => { const l = []; g.traverse((o) => { if (o.isMesh) l.push(o); }); return l; };
const boxLongest = (g) => { const s = new THREE.Box3().setFromObject(g, true).getSize(new THREE.Vector3()); return Math.max(s.x, s.y, s.z); };

test('the hold-up opens for every find of finds.js: the library\'s model where it has one, the generic close-up where not, at the held size; putting it back disposes what the close-up made and never the library\'s', async () => {
  const { ctx, events, hold } = await world();
  let lib = 0, gen = 0;
  for (const f of FINDS) {
    const key = BINDINGS[f.id], libGeos = new Set((key ? inspectParts(ctx, key) : []).map((p) => p.geometry));
    assert.equal(hold.open(asked(f, key ? { key } : null)), true, `${f.id} was not held up`);
    const g = hold.group, meshes = meshesOf(g), disposed = new Set();
    assert.ok(g && ctx.scene.children.includes(g) && meshes.length > 0, `${f.id}: nothing in the scene`);
    for (const m of meshes) m.geometry.addEventListener('dispose', () => disposed.add(m.geometry));
    const mine = meshes.filter((m) => !libGeos.has(m.geometry));
    if (key) { assert.equal(mine.length, 0, `${f.id}: the library's model has loaded, so it is the one held`); lib++; }
    else { assert.equal(mine.length, meshes.length, `${f.id}: no library model, so the generic close-up is held`); gen++; }
    const longest = key ? Math.max(...INSPECT[key].s) : f.size;
    near(g.scale.x, holdScale(longest), 1e-9, `${f.id}: held at the size every find is held at`);
    hold.update(HOLD.SECONDS);                                                                   // at rest: facing the eyes, leaning its top toward them (about X) by HOLD.LEAN
    const [w, h, d] = key ? INSPECT[key].s : genericModel(ask(f)).size, c = Math.cos(HOLD.LEAN), s = Math.sin(HOLD.LEAN), sc = g.scale.x;
    const L = boxLongest(g), lo = longest * sc * 0.9, hi = sc * Math.max(w, h * c + d * s, h * s + d * c) * 1.001;   // (hi: the leaned box of the model's own box, no vertex is outside it; lo: the lean costs a ring or a watch two or three per cent)
    assert.ok(L >= lo && L <= hi, `${f.id}: ${L.toFixed(4)} m to the eye, between ${lo.toFixed(4)} and ${hi.toFixed(4)} expected (the longest side held at ${(longest * sc).toFixed(4)})`);
    hold.close();
    assert.ok(!ctx.scene.children.includes(g) && !hold.isOpen, `${f.id}: not put back`);
    for (const m of meshes) assert.equal(disposed.has(m.geometry), !libGeos.has(m.geometry), `${f.id}: ${libGeos.has(m.geometry) ? 'the library\'s geometry was disposed (it belongs to the asset cache)' : 'the close-up\'s own geometry was not disposed'}`);
  }
  assert.ok(lib >= 15 && gen >= 40 && lib + gen === FINDS.length, `${lib} from the library, ${gen} generic`);
  assert.equal(events.filter(([n]) => n === 'holdup:open').length, FINDS.length); assert.equal(events.filter(([n]) => n === 'holdup:close').length, FINDS.length);
  assert.deepEqual([...ctx.matlib.missing], [], 'every material it asked the library for is defined');
});

test('a find the library draws is held as its generic close-up when its model has not loaded (R2b-004), and that close-up is put back like any other', async () => {
  const { ctx, hold } = await world();
  const cached = new Set(Object.values(BINDINGS).flatMap((k) => ctx.assets.parts(k).map((p) => p.geometry)));
  ctx.inspectGlb = new Set();
  let n = 0;
  for (const f of FINDS.filter((x) => BINDINGS[x.id])) {
    assert.equal(hold.open(asked(f, { key: BINDINGS[f.id] })), true, `${f.id}: its model has not loaded and it was not held`);
    const meshes = meshesOf(hold.group), disposed = new Set();
    for (const m of meshes) { assert.ok(!cached.has(m.geometry), `${f.id}: the library's geometry is held although the library says it has not loaded`); m.geometry.addEventListener('dispose', () => disposed.add(m.geometry)); }
    hold.close();
    assert.equal(disposed.size, meshes.length, `${f.id}: the close-up was not disposed`); n++;
  }
  assert.ok(n >= 15, `${n} finds with a library model`);
});

test('nothing to hold: a find with no model and no close-up (or a shape that has none) is declined without a trace; a close-up the materials cannot draw is disposed', async () => {
  const { ctx, hold, events } = await world();
  const f = findById.get('aretes_perlas');
  assert.equal(hold.open(asked(f, null, null)), false, 'no model, no close-up');
  assert.equal(hold.open(asked(f, null, { id: 'x', shape: 'teapot', tint: 0x808080, size: 0.1 })), false, 'a shape with no family');
  assert.equal(hold.open(asked(f, { key: 'inspect_no_such_model' }, null)), false, 'a model that is not in the library and no close-up');
  assert.equal(hold.open(null), false);
  assert.deepEqual(ctx.flow.log, [], 'the panel was never asked for'); assert.ok(!ctx.scene.children.some((c) => c.name === 'holdup')); assert.deepEqual(events, []);
  const real = ctx.mat, was = THREE.BufferGeometry.prototype.dispose; let made = 0;
  ctx.mat = () => null;                                                                          // the library hands out nothing: the close-up exists but cannot be drawn
  THREE.BufferGeometry.prototype.dispose = function dispose() { made++; return was.call(this); };
  try { assert.equal(hold.open(asked(f, null)), false, 'nothing to draw it with'); } finally { THREE.BufferGeometry.prototype.dispose = was; ctx.mat = real; }
  assert.ok(made >= 1, 'the geometry it built was disposed, not left behind'); assert.deepEqual(ctx.flow.log, []); assert.ok(!ctx.scene.children.some((c) => c.name === 'holdup'));
  const next = createHoldUp(ctx);                                                                // (a hold-up remembers the materials it was handed: this one is fresh)
  assert.equal(next.open(asked(f, null)), true, 'and the next hold-up opens as ever'); next.close();
});

test('one thing at a time: holding a second find puts the first back, disposing its close-up', async () => {
  const { ctx, events, hold } = await world();
  assert.equal(hold.open(asked(findById.get('peluca'), null)), true);
  const first = hold.group, geos = meshesOf(first).map((m) => m.geometry), disposed = [];
  for (const geo of geos) geo.addEventListener('dispose', () => disposed.push(geo));
  assert.equal(hold.open(asked(findById.get('diente_oro'), null)), true);
  assert.ok(!ctx.scene.children.includes(first) && ctx.scene.children.filter((c) => c.name === 'holdup').length === 1, 'the first is out of the scene');
  assert.equal(disposed.length, geos.length, 'and its close-up is disposed');
  assert.deepEqual(events.map(([n, p]) => `${n} ${p.id}`), ['holdup:open peluca', 'holdup:close peluca', 'holdup:open diente_oro']);
  hold.close();
});
