import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { loadWaverleyScene, waverleyView } from '../src/waverley.ts';
import type { WaverleyAnchorScene } from '../../core/waverley-anchors.ts';

const geometry: WaverleyAnchorScene = { origin: { lat: 0, lon: 0 }, attribution: 'synthetic', rails: [],
  platforms: [{ id: 'synthetic', ref: '1', tags: {}, path: [[-150, -20], [150, -20], [150, 20], [-150, 20]] }] };

test('Waverley keeps an honest empty placeholder when either optional chunk is absent or fails', async () => {
  for (const options of [{ modelLoader: null }, { modelLoader: async () => ({ buildWaverleyScene: () => { throw new Error('must not build without geometry'); } }), geometryLoader: null },
    { modelLoader: async () => { throw new Error('chunk network failure'); }, geometryLoader: async () => ({ default: geometry }) }]) {
    const view = await loadWaverleyScene(options);
    assert.equal(view.placeholder, true); assert.equal(view.scene.children.length, 0);
    assert.match(view.message, /Live trains not enabled/); assert.ok(view.error); view.dispose();
    if (options.geometryLoader) assert.match(view.message, /model unavailable.*chunk network failure/);
  }
});

test('installed Waverley chunks build a real separate model and dispose its owner and live layer once', async () => {
  const group = new THREE.Group(), geometryMesh = new THREE.BoxGeometry(), sharedMaterial = new THREE.MeshBasicMaterial();
  group.add(new THREE.Mesh(geometryMesh, sharedMaterial));
  let loads = 0, modelDisposals = 0, liveDisposals = 0, sharedDisposals = 0;
  sharedMaterial.addEventListener('dispose', () => ++sharedDisposals);
  const view = await loadWaverleyScene({ modelLoader: async () => { ++loads; return { buildWaverleyScene: () => ({ group, dispose: () => { ++modelDisposals; geometryMesh.dispose(); group.removeFromParent(); } }) }; },
    geometryLoader: async () => ({ default: geometry }) });
  assert.equal(loads, 1); assert.equal(view.placeholder, false); assert.equal(view.scene.children[0], group);
  assert.deepEqual(view.geometry, geometry); assert.match(view.message, /EB live trains unavailable/);
  view.live = { group: new THREE.Group(), frame() {}, dispose: () => { ++liveDisposals; }, status: () => '', timeMs: () => 0, load: async () => {}, state: () => ({}) };
  view.dispose(); view.dispose();
  assert.equal(modelDisposals, 1); assert.equal(liveDisposals, 1); assert.equal(sharedDisposals, 0); assert.equal(view.scene.children.length, 0);
});

test('Waverley endpoint camera fits actual platform corners at desktop and phone aspect', () => {
  for (const aspect of [1.44, 390 / 844]) {
    const view = waverleyView(geometry, aspect), camera = new THREE.PerspectiveCamera(50, aspect, .5, 9000);
    camera.position.fromArray(view.eye); camera.lookAt(...view.target); camera.updateMatrixWorld();
    for (const p of geometry.platforms[0]!.path) {
      const screen = new THREE.Vector3(p[0], .915, p[1]).project(camera);
      assert.ok(Math.abs(screen.x) < .9 && Math.abs(screen.y) < .8 && Math.abs(screen.z) < 1, `platform corner clipped at ${aspect}`);
    }
  }
  assert.throws(() => waverleyView({ ...geometry, platforms: [] }, 1), /platforms/);
});
