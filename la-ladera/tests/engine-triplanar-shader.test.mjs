// The side-projection patch (js/engine/triplanar.js, owner: A1) against three's REAL standard shader text, with no GPU. A `.replace()` that no longer matches (a three upgrade
// renames a chunk) changes nothing and says nothing: the terrain would silently go back to streaks. The pixel proof is tests/engine-triplanar.test.mjs (headless Chrome);
// this one is the cheap guard that runs in the node suite, plus the bookkeeping: which materials carry the patch and how many programs it costs.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/engine-triplanar-shader.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { MaterialLib } from '../js/core/matlib.js';
import { triplanar, TRI_FRAGMENT } from '../js/engine/triplanar.js';

const count = (s, sub) => s.split(sub).length - 1;
function patched() {
  const map = new THREE.Texture(); map.repeat.set(0.4, 0.25);
  const m = new THREE.MeshStandardMaterial({ map }); triplanar(m);
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  m.onBeforeCompile(shader, null);
  return { m, map, shader };
}

test('the patch lands in three\'s standard vertex and fragment shaders: every anchor is found once and the colour map is read three times', () => {
  const orig = { v: THREE.ShaderLib.standard.vertexShader, f: THREE.ShaderLib.standard.fragmentShader };
  for (const a of ['#include <common>', '#include <begin_vertex>']) assert.equal(count(orig.v, a), 1, `the stock vertex shader has ${a} once`);
  for (const a of ['#include <common>', '#include <map_fragment>']) assert.equal(count(orig.f, a), 1, `the stock fragment shader has ${a} once`);
  const { shader } = patched(), v = shader.vertexShader, f = shader.fragmentShader;
  assert.equal(count(v, 'varying vec3 vLadW;'), 1); assert.equal(count(v, 'varying vec3 vLadN;'), 1);
  assert.equal(count(f, 'varying vec3 vLadW;'), 1); assert.equal(count(f, 'varying vec3 vLadN;'), 1); assert.equal(count(f, 'uniform vec2 ladRep;'), 1);
  assert.equal(count(v, 'vLadW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'), 1, 'the vertex shader writes the world position');
  assert.equal(count(v, 'vLadN = normalize( mat3( modelMatrix ) * objectNormal );'), 1, 'and the world normal');
  assert.ok(v.indexOf('#include <beginnormal_vertex>') < v.indexOf('vLadN ='), 'the object normal exists by then (beginnormal_vertex comes before begin_vertex)');
  assert.ok(v.indexOf('#include <begin_vertex>') < v.indexOf('vLadW ='), 'the position `transformed` exists by then');
  assert.equal(count(f, '#include <map_fragment>'), 0, 'the stock map read is gone');
  assert.equal(count(f, TRI_FRAGMENT), 1, 'and the two-fetch read is in its place');
  assert.equal(count(TRI_FRAGMENT, 'texture2D( map,'), 3, 'three fetches in one pass (top, side along z, side along x), no branch');
  assert.ok(!/ladT|dot\(\s*vLadW/.test(TRI_FRAGMENT), 'no tangent that turns with the normal: it collapses round a curved bank (u = 0 all the way round)');
  assert.ok(!/\bif\s*\(/.test(TRI_FRAGMENT), 'a texture read inside a divergent branch would have undefined derivatives');
});

test('R1-D24: the steepness reads the triangle\'s own normal (screen derivatives of the world position) as well as the smoothed vertex normal, and a degenerate face falls back to the vertex normal', () => {
  assert.equal(count(TRI_FRAGMENT, 'dFdx( vLadW )'), 1, 'the face normal comes from the derivatives of the world position');
  assert.equal(count(TRI_FRAGMENT, 'dFdy( vLadW )'), 1);
  assert.ok(/ladSteep = 1\.0 - smoothstep\( 0\.55, 0\.88, max\( abs\( ladN\.y \), ladFy \) \)/.test(TRI_FRAGMENT), 'a flat face is flat whatever its corners say: the larger of the two |y| decides');
  assert.ok(/max\( length\( ladC \), 1\.0e-9 \)/.test(TRI_FRAGMENT), 'a zero cross product (a sliver) divides by a floor, not by 0: no NaN pixel');
  // TEETH: the old fragment (steepness from the interpolated vertex normal alone) has none of it
  const old = TRI_FRAGMENT.replace(/\tvec3 ladC[^\n]*\n\tfloat ladFy[^\n]*\n/, '').replace('max( abs( ladN.y ), ladFy )', 'abs( ladN.y )');
  assert.ok(old !== TRI_FRAGMENT && !/dFdx/.test(old) && !/ladFy/.test(old), 'TEETH: the first version is the fragment without the face normal');
});

test('the uniform is the map\'s own repeat (a later change to the repeat reaches the shader) and the look uniforms still arrive', () => {
  const { m, map, shader } = patched();
  assert.equal(shader.uniforms.ladRep.value, map.repeat, 'the same Vector2, not a copy');
  map.repeat.set(0.1, 0.1); assert.equal(shader.uniforms.ladRep.value.x, 0.1);
  assert.equal(m.userData.tri, true);
  // the engine installs the shared look uniforms (fog glow) on Material.prototype.onBeforeCompile: the patch must call it first or the glow uniforms are undefined in the program
  const saved = THREE.Material.prototype.onBeforeCompile; let seen = 0;
  THREE.Material.prototype.onBeforeCompile = function (sh) { seen++; sh.uniforms.ladGlowAmt = { value: 1 }; };
  try { const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader }; m.onBeforeCompile(sh, null); assert.equal(seen, 1); assert.ok(sh.uniforms.ladGlowAmt && sh.uniforms.ladRep); }
  finally { THREE.Material.prototype.onBeforeCompile = saved; }
});

test('only the two ground materials carry the patch (also with a tint), and they share one program text', () => {
  const l = new MaterialLib({ night: 0 }); l.manifest = { ground_dirt: { map: 'ground_dirt.jpg', normal: 'ground_dirt_n.jpg' }, grass_patchy: { map: 'grass_patchy.jpg' }, plaster_a: { map: 'plaster_a.jpg' }, stone_wall: { map: 'stone_wall.jpg' } };
  l.loader = { load: () => new THREE.Texture() };
  assert.deepEqual(l.list().filter((d) => d.tri).map((d) => d.name).sort(), ['grass_patchy', 'ground_dirt'], 'the materials that ask for it');
  const dirt = l.get('ground_dirt'), grass = l.get('grass_patchy'), tinted = l.get('ground_dirt#b08060');
  for (const m of [dirt, grass, tinted]) assert.equal(m.userData.tri, true, `${m.name} is patched`);
  for (const k of ['plaster_a', 'stone_wall', 'asphalt']) assert.notEqual(l.get(k).userData.tri, true, `${k} is not`);
  assert.equal(dirt.customProgramCacheKey(), grass.customProgramCacheKey(), 'one extra program for the lot, not one per material');
  assert.equal(dirt.customProgramCacheKey(), tinted.customProgramCacheKey());
  assert.notEqual(dirt.customProgramCacheKey(), l.get('plaster_a').customProgramCacheKey(), 'and it is not the stock program');
  assert.ok(dirt.map.repeat.x > 0 && dirt.map.repeat.x < 1, 'the repeat is the metric tile (a map with repeat 1 would read as a unit uv)');
});
