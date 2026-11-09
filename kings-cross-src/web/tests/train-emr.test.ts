import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { EMR_FIGURES, EMR_KINDS, emrTrainLayout } from '../../core/train-emr.ts';
import { buildEmrTrain, disposeEmrTrain } from '../src/train-emr.ts';

test('EMR builder exposes runtime car pitches and explicit assumed-fleet metadata', () => {
  assert.deepEqual(EMR_KINDS.map((kind) => {
    const root = buildEmrTrain(kind);
    const layout = emrTrainLayout(kind);
    return {
      kind: root.userData.kind, allocation: root.userData.allocation,
      operator: root.userData.operator, provisional: root.userData.dimensionsProvisional,
      cars: root.children.map((c) => [c.userData.index, c.userData.length, c.userData.start, c.userData.end]),
      sameLength: root.userData.length === layout.length,
      source: typeof root.userData.source === 'string' && root.userData.assumptions.includes('ASSUMED'),
    };
  }), EMR_KINDS.map((kind) => {
    const layout = emrTrainLayout(kind);
    return { kind, allocation: 'assumed fleet', operator: 'East Midlands Railway', provisional: kind === 'emr810x5', cars: layout.cars.map((c) => [c.index, c.length, c.start, c.end]), sameLength: true, source: true };
  }));
});

test('EMR geometry is finite, within its allocated train span and provisional roof envelope', () => {
  assert.deepEqual(EMR_KINDS.map((kind) => {
    const root = buildEmrTrain(kind);
    const layout = emrTrainLayout(kind);
    const box = new THREE.Box3().setFromObject(root);
    let finite = true; let vertices = 0;
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const a = o.geometry.getAttribute('position'); vertices += a.count;
      finite &&= Array.from(a.array).every(Number.isFinite);
    });
    return { finite, populated: vertices > 1000, withinLength: box.min.z >= -0.001 && box.max.z <= layout.length + 0.001, width: Math.abs(box.max.x - box.min.x - EMR_FIGURES[layout.spec.family].width.value) < 0.1, roof: box.max.y <= EMR_FIGURES[layout.spec.family].roof.value + 0.33 };
  }), EMR_KINDS.map(() => ({ finite: true, populated: true, withinLength: true, width: true, roof: true })));
});

test('EMR diesel and electric equipment differ, with two cabs and two bogies per car', () => {
  assert.deepEqual(EMR_KINDS.map((kind) => {
    const root = buildEmrTrain(kind);
    const names: string[] = []; root.traverse((o) => names.push(o.name));
    return [root.children.length, names.filter((n) => n === 'pantograph').length, names.filter((n) => n.startsWith('bogie-') && /^bogie-\d+-\d+$/.test(n)).length, names.filter((n) => n === 'cab-glass').length, names.filter((n) => n === 'door').length];
  }), [[5, 0, 10, 2, 20], [5, 2, 10, 2, 20], [4, 1, 8, 2, 16]]);
});

test('EMR disposal releases owned meshes while preserving shared bogies and train material', () => {
  const root = buildEmrTrain('emr360x4');
  let owned = 0; let disposed = 0; let sharedDisposed = 0;
  const shared = new Set<THREE.BufferGeometry>();
  const onSharedDispose = (): void => { sharedDisposed++; };
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === 'bogie-mesh') shared.add(o.geometry);
    else { owned++; o.geometry.addEventListener('dispose', () => { disposed++; }); }
  });
  for (const geometry of shared) geometry.addEventListener('dispose', onSharedDispose);
  const mesh = root.getObjectByName('body-shell') as THREE.Mesh;
  const material = mesh.material as THREE.Material;
  const onMaterialDispose = (): void => { sharedDisposed++; };
  material.addEventListener('dispose', onMaterialDispose);
  disposeEmrTrain(root);
  for (const geometry of shared) geometry.removeEventListener('dispose', onSharedDispose);
  material.removeEventListener('dispose', onMaterialDispose);
  assert.deepEqual({ allOwned: disposed === owned, ownedPositive: owned > 0, sharedDisposed }, { allOwned: true, ownedPositive: true, sharedDisposed: 0 });
});
