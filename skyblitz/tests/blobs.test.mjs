// V-4: the ground-shadow blob is the altitude cue, so over water it must sit on the water SURFACE. course.groundHeight() is the sea floor
// (sunrise: -60 m); a craft skimming 6 m over the sea used to get its shadow 60 m down on the floor, i.e. no cue at all.
// Pure logic: buildBlobs() builds its InstancedMesh without a renderer, so the placement is read straight from the instance matrix.
// Run: node --import ./skyblitz/tests/register.mjs --test skyblitz/tests/blobs.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createFakeGame, loadCourseHeadless } from './helpers/fake-game.mjs';
import { buildBlobs } from '../src/world/blobs.js';

/** Build the course's blobs, put one racer at pos(x, y, z) and return { y: blob height, alpha, floor, water }. */
async function blobAt(id, pick) {
  const game = createFakeGame(); const course = await loadCourseHeadless(game, id);
  const pos = pick(course);
  const part = buildBlobs(course, game);
  game.race = { racers: [{ isPlayer: true, spec: { radius: 5 }, render: { pos, quat: new THREE.Quaternion() } }] };
  part.update(1 / 60, game);
  const mesh = part.group, m = new THREE.Matrix4(); mesh.getMatrixAt(0, m);
  return { count: mesh.count, y: m.elements[13], alpha: mesh.geometry.attributes.aAlpha.array[0], floor: course.groundHeight(pos.x, pos.z), water: course.def.waterLevel };
}
const frameAt = (course, s, dy) => { const f = course.frameAt(s, {}); return new THREE.Vector3(f.pos.x, dy, f.pos.z); };

test('sunrise s=2855: 5.8 m over the sea, the blob lies on the water surface (the reviewer repro)', async () => {
  const r = await blobAt('sunrise', (c) => frameAt(c, 2855, 5.8));
  assert.equal(r.count, 1);
  assert.ok(r.floor < -30, `sea floor ${r.floor}`);
  assert.ok(Math.abs(r.y - r.water) < 0.5, `blob at ${r.y.toFixed(2)} m, water surface at ${r.water} m (floor ${r.floor})`);
  assert.ok(r.alpha > 0.7, `5.8 m up is a strong shadow (alpha ${r.alpha.toFixed(2)}): altitude is measured from the surface, not the floor`);
});

test('redrock: over the river the blob lies on the river surface (18 m), not the bed', async () => {
  const r = await blobAt('redrock', (c) => { for (let s = 0; s < c.length; s += 5) { const f = c.frameAt(s, {}); if (c.groundHeight(f.pos.x, f.pos.z) < c.def.waterLevel - 4) return new THREE.Vector3(f.pos.x, c.def.waterLevel + 6, f.pos.z); } throw new Error('no river under the path'); });
  assert.ok(r.floor < r.water - 4, `bed ${r.floor}`);
  assert.ok(Math.abs(r.y - r.water) < 0.5, `blob at ${r.y.toFixed(2)}, river surface ${r.water}`);
});

test('over dry land the blob still sits on the terrain (sunrise island, redrock bank, frost, neon)', async () => {
  for (const id of ['sunrise', 'redrock', 'frost', 'neon']) {
    const r = await blobAt(id, (c) => {
      const wl = c.def.waterLevel ?? -1e9;
      for (let s = 0; s < c.length; s += 3) { const f = c.frameAt(s, {}), g = c.groundHeight(f.pos.x, f.pos.z); if (g > wl + 3 && f.pos.y > g + 15) return new THREE.Vector3(f.pos.x, g + 10, f.pos.z); }
      throw new Error(id + ': no dry ground under the path');
    });
    assert.ok(Math.abs(r.y - (r.floor + 0.25)) < 0.01, `${id}: blob ${r.y.toFixed(2)} vs terrain ${r.floor.toFixed(2)} + 0.25`);
  }
});
