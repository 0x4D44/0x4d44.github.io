import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { releaseSceneGpu } from '../src/station-resources.ts';
import { createWaverleyPlaceholderScene, WAVERLEY_PLACEHOLDER_LABEL } from '../src/waverley.ts';

test('releases shared geometry, materials and textures once, including scene background and environment', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const sharedTexture = new THREE.Texture();
  const environmentTexture = new THREE.Texture();
  const material = new THREE.MeshBasicMaterial({ map: sharedTexture });
  const meshA = new THREE.Mesh(geometry, material);
  const meshB = new THREE.Mesh(geometry, material);
  scene.add(meshA, meshB);
  scene.background = sharedTexture;
  scene.environment = environmentTexture;

  const disposed = { geometry: 0, material: 0, sharedTexture: 0, environmentTexture: 0 };
  geometry.addEventListener('dispose', () => disposed.geometry++);
  material.addEventListener('dispose', () => disposed.material++);
  sharedTexture.addEventListener('dispose', () => disposed.sharedTexture++);
  environmentTexture.addEventListener('dispose', () => disposed.environmentTexture++);

  releaseSceneGpu(scene);

  assert.deepEqual(disposed, { geometry: 1, material: 1, sharedTexture: 1, environmentTexture: 1 });
  assert.deepEqual(scene.children, [meshA, meshB], 'the scene graph stays available for a later render');
  assert.equal(meshA.geometry, geometry);
  assert.equal(meshB.material, material);
});

test('a station graph can be activated again after repeated switches release its GPU resources', () => {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry(1, 2, 3);
  const material = new THREE.MeshBasicMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  let resident = false;
  let uploads = 0;
  let releases = 0;
  geometry.addEventListener('dispose', () => {
    resident = false;
    releases++;
  });
  const activate = (): void => {
    assert.equal(scene.children[0], mesh);
    assert.equal(mesh.geometry.getAttribute('position').count, 24);
    if (!resident) {
      resident = true;
      uploads++;
    }
  };

  activate();
  releaseSceneGpu(scene);
  activate();
  releaseSceneGpu(scene);
  activate();

  assert.equal(uploads, 3, 'each return can upload the retained CPU geometry again');
  assert.equal(releases, 2, 'each switch releases the currently resident geometry once');
  assert.equal(scene.children.length, 1);
});

test('the Waverley placeholder is an empty, honestly labelled scene with a solid background and disposal hook', () => {
  const placeholder = createWaverleyPlaceholderScene();
  assert.equal(placeholder.scene.children.length, 0, 'the placeholder has no invented station geometry');
  assert.ok(placeholder.scene.background instanceof THREE.Color, 'the background is a solid colour');
  assert.match(WAVERLEY_PLACEHOLDER_LABEL, /Waverley/i);
  assert.match(WAVERLEY_PLACEHOLDER_LABEL, /not yet available/i);

  const environmentTexture = new THREE.Texture();
  let disposed = 0;
  environmentTexture.addEventListener('dispose', () => disposed++);
  placeholder.scene.environment = environmentTexture;
  placeholder.dispose();
  assert.equal(disposed, 1, 'the returned disposer releases resources later added to the scene');
  assert.equal(placeholder.scene.children.length, 0);
});
