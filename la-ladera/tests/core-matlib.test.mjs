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

test('an untextured material and a tint of a textured one never touch the loader twice', () => {
  const l = lib(); l.get('plaster_a'); const n = l.loader.waiting.length;
  l.get('plaster_a#d9a441'); l.get('plaster_a');
  assert.equal(l.loader.waiting.length, n, 'one request per file, however many tints and lookups');
  const flat = l.get('asphalt'); assert.equal(flat.map ?? null, null, 'no manifest entry: flat colour');
});
