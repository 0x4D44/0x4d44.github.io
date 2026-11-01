// Material library texture loading (js/core/matlib.js, owner: A1). A visitor on a slow link draws frames while the textures are still downloading.
// three logs the console WARNING "Texture marked for update but no image data found" (hard cap C1) for every texture that has `version > 0` and
// no image, and `Texture.clone()` ends with `needsUpdate = true`, so a tiled variant cloned from a base whose image has not arrived used to start
// at version 1. These tests drive the library with a loader that answers late, like a slow network.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/core-matlib.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MaterialLib } from '../js/core/matlib.js';

/** TextureLoader stand-in: `load` returns the (empty) texture at once, exactly as three's does; `arrive()` fills it in later and calls back. */
function slowLoader() {
  const waiting = [];
  return {
    waiting,
    load(url, onLoad, _progress, onError) { const t = new THREE.Texture(); waiting.push({ url, t, onLoad, onError }); return t; },
    arrive(match = () => true) {
      for (const w of waiting.filter((x) => match(x.url))) {
        waiting.splice(waiting.indexOf(w), 1);
        w.t.image = { width: 4, height: 4, data: new Uint8Array(64) }; w.t.needsUpdate = true;            // what three's ImageLoader callback does
        w.onLoad?.(w.t);
      }
    },
    fail(match = () => true) { for (const w of waiting.filter((x) => match(x.url))) { waiting.splice(waiting.indexOf(w), 1); w.onError?.(new Error('404')); } },
  };
}
const MANIFEST = { plaster_a: { map: 'plaster_a.jpg', normal: 'plaster_a_n.jpg' }, brick_red_solid: { map: 'brick_red_solid.jpg' } };
function lib() {
  const l = new MaterialLib({ night: 0 }); l.manifest = MANIFEST; l.loader = slowLoader();
  return l;
}
const slots = (m) => ['map', 'normalMap', 'roughnessMap'].filter((s) => m[s]).map((s) => [s, m[s]]);
/** Every texture the library handed out (bases and tiled variants) that three would complain about: marked for upload, but no image. */
function premature(l) {
  const bad = [];
  for (const [k, m] of l.cache) for (const [s, t] of slots(m)) if (t.version > 0 && !t.image) bad.push(`${k}.${s}`);
  for (const [k, t] of l.tex) if (t.version > 0 && !t.image) bad.push(`base ${k}`);
  for (const [k, t] of l.vcache) if (t.version > 0 && !t.image) bad.push(`variant ${k}`);
  return bad;
}

test('a tiled variant whose image has not arrived is not marked for update', () => {
  const l = lib(), m = l.get('plaster_a');
  assert.ok(m.map !== l.tex.get('plaster_a.jpg:s'), 'plaster_a is tiled (2.5 m), so its map is a variant of the base texture, not the base itself');
  for (const [s, t] of slots(m)) { assert.equal(t.image ?? null, null, `${s}: the image is still on the way`); assert.equal(t.version, 0, `${s}: version before the image arrives`); }
  assert.deepEqual(premature(l), []);
});

test('the variants upload once the image arrives (version > 0, image present, shared with the base)', () => {
  const l = lib(), m = l.get('plaster_a');
  l.loader.arrive();
  for (const [s, t] of slots(m)) { assert.ok(t.image, `${s}: image arrived`); assert.ok(t.version > 0, `${s}: marked for upload after the callback`); }
  assert.equal(m.map.source, l.tex.get('plaster_a.jpg:s').source, 'one image, however many tile sizes use it');
  assert.deepEqual(premature(l), []);
});

test('images arriving one at a time never leave a texture marked without its image', () => {
  const l = lib(), m = l.get('plaster_a'); l.get('brick_red_solid');
  l.loader.arrive((u) => u.endsWith('plaster_a.jpg'));
  assert.ok(m.map.version > 0 && m.map.image, 'the map is ready');
  assert.equal(m.normalMap.version, 0, 'the normal map is still on the way');
  assert.deepEqual(premature(l), []);
  l.loader.arrive((u) => u.endsWith('plaster_a_n.jpg'));
  assert.deepEqual(premature(l), []);
  l.loader.arrive();
  assert.deepEqual(premature(l), []);
});

test('a variant made after its image arrived is uploaded straight away', () => {
  const l = lib(); l.get('plaster_a'); l.loader.arrive();
  const base = l.tex.get('plaster_a.jpg:s'), v = l._variant(base, 0.37, false);
  assert.ok(v.image && v.version > 0, 'a late variant of a loaded image has data and is marked');
  assert.equal(v.repeat.x, 0.37);
});

test('whenReady() waits for every requested image and resolves when a download fails', async () => {
  const l = lib(), warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    l.get('plaster_a'); l.get('brick_red_solid');
    let done = false; l.whenReady().then(() => { done = true; });
    await Promise.resolve(); assert.equal(done, false, 'nothing has arrived');
    l.loader.arrive((u) => u.endsWith('plaster_a.jpg')); await Promise.resolve(); assert.equal(done, false, 'two of three are missing');
    l.loader.arrive((u) => u.endsWith('plaster_a_n.jpg')); await Promise.resolve(); assert.equal(done, false, 'one is missing');
    l.loader.fail(); await Promise.resolve(); await Promise.resolve();
    assert.equal(done, true, 'a failed download counts as finished');
    assert.equal(warned, 1, 'and is reported once');
    assert.equal(l.pending, 0);
    assert.deepEqual(premature(l), []);
  } finally { console.warn = warn; }
});

test('materials that tile one image the same way share one texture object; another tile size makes another', () => {
  const l = lib(), a = l.get('plaster_a'), tinted = l.get('plaster_a#d9a441');
  assert.equal(tinted.map, a.map, 'a tint of a textured material reuses the tiled map (one GPU texture, not one per material)');
  assert.equal(tinted.normalMap, a.normalMap);
  const base = l.tex.get('plaster_a.jpg:s'), v1 = l._variant(base, 0.37, false), v2 = l._variant(base, 0.37, false), v3 = l._variant(base, 0.5, false), c1 = l._variant(base, 0.37, true);
  assert.equal(v1, v2, 'same image, same repeat: the same object');
  assert.notEqual(v1, v3, 'another repeat: another object');
  assert.notEqual(v1, c1, 'clamped (a decal) and repeating are different textures');
  assert.equal(l.variants.get(base).length, new Set(l.variants.get(base)).size, 'no variant is registered twice');
});

test('an untextured material and a tint of a textured one never touch the loader twice', () => {
  const l = lib(); l.get('plaster_a'); const n = l.loader.waiting.length;
  l.get('plaster_a#d9a441'); l.get('plaster_a');
  assert.equal(l.loader.waiting.length, n, 'one request per file, however many tints and lookups');
  const flat = l.get('asphalt'); assert.equal(flat.map ?? null, null, 'no manifest entry: flat colour');
});

// ---- the boot's connection (R2e-001): hold() / release() and whenLoaded() -------------------------------------------------------------------------
test('held: a texture is made and counted but not requested until release(); then the image lands in the texture the material already holds', () => {
  const l = lib(); l.hold();
  const m = l.get('plaster_a'), map = m.map, normal = m.normalMap;
  assert.equal(l.loader.waiting.length, 0, 'nothing has been requested while held');
  assert.equal(l.holding, 2, 'the map and the normal map wait for the release');
  assert.equal(l.pending, 2, 'and they count as pending (whenReady waits for them)');
  for (const [s, t] of slots(m)) { assert.equal(t.image ?? null, null, `${s}: no image yet`); assert.equal(t.version, 0, `${s}: not marked for upload`); }
  assert.deepEqual(premature(l), []);
  l.release();
  assert.equal(l.loader.waiting.length, 2, 'both requests go out at the release');
  assert.equal(l.holding, 0);
  l.loader.arrive();
  assert.equal(m.map, map, 'the material keeps its texture object'); assert.equal(m.normalMap, normal);
  for (const [s, t] of slots(m)) { assert.ok(t.image, `${s}: the image arrived`); assert.ok(t.version > 0, `${s}: marked for upload`); }
  assert.equal(m.map.source, l.tex.get('plaster_a.jpg:s').source, 'the tiled variant shares the base image');
  assert.equal(l.pending, 0);
  assert.deepEqual(premature(l), []);
});

test('held: whenReady() waits for the release and then for the images; a texture asked for after the release goes straight out; hold() twice and release() twice are harmless', async () => {
  const l = lib(); l.hold(); l.hold();
  l.get('brick_red_solid');
  let done = false; l.whenReady().then(() => { done = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.equal(done, false, 'held: not ready');
  l.release(); l.release();
  assert.equal(l.loader.waiting.length, 1, 'one request, however often release() is called');
  l.get('plaster_a');
  assert.equal(l.loader.waiting.length, 3, 'after the release a new texture is requested at once');
  l.loader.arrive(); await Promise.resolve(); await Promise.resolve();
  assert.equal(done, true);
  assert.equal(l.pending, 0);
});

test('held: a download that fails after the release still counts as finished and is reported once', async () => {
  const l = lib(), warn = console.warn; let warned = 0; console.warn = () => { warned++; };
  try {
    l.hold(); l.get('brick_red_solid'); l.release(); l.loader.fail();
    await l.whenReady();
    assert.equal(warned, 1); assert.equal(l.pending, 0);
    assert.deepEqual(premature(l), []);
  } finally { console.warn = warn; }
});

test('whenLoaded(texture) settles when that one file is in, however much else is still on its way (the goods atlas must not wait for the whole boot)', async () => {
  const l = lib(), plaster = l.get('plaster_a'), brick = l.get('brick_red_solid');
  let atlas = false, other = false;
  l.whenLoaded(brick.map).then(() => { atlas = true; }); l.whenLoaded(plaster.map).then(() => { other = true; });
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual([atlas, other], [false, false]);
  l.loader.arrive((u) => u.endsWith('brick_red_solid.jpg')); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual([atlas, other], [true, false], 'the one that landed is done, the other is not');
  assert.ok(l.pending > 0, 'and the queue as a whole is not empty');
  let late = false; l.whenLoaded(brick.map).then(() => { late = true; }); await Promise.resolve(); await Promise.resolve();
  assert.equal(late, true, 'asking after it landed resolves at once');
  await l.whenLoaded(null); await l.whenLoaded({ source: {} });                      // not made by the library: nothing to wait for
});

test('whenLoaded() works through a tiled variant and through a held texture', async () => {
  const l = lib(); l.hold();
  const m = l.get('plaster_a');
  assert.notEqual(m.map, l.tex.get('plaster_a.jpg:s'), 'the map is a tiled variant');
  let got = false; l.whenLoaded(m.map).then(() => { got = true; });
  await Promise.resolve(); await Promise.resolve(); assert.equal(got, false, 'held');
  l.release(); l.loader.arrive((u) => u.endsWith('plaster_a.jpg')); await Promise.resolve(); await Promise.resolve();
  assert.equal(got, true, 'the variant waits on the base file and settles with it');
});
