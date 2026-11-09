import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { neutralTrainLayout } from '../../core/train-neutral.ts';
import { buildNeutralTrain, disposeNeutralTrain } from '../src/train-neutral.ts';

test('neutral train exposes assumed identity and global car offsets for motion poses', () => {
  const layout = neutralTrainLayout(92, 4); const root = buildNeutralTrain(layout);
  assert.deepEqual({ name: root.name, kind: root.userData.kind, allocation: root.userData.allocation, length: root.userData.length, assumed: root.userData.assumptions.includes('ASSUMED'), label: root.userData.label, cars: root.children.map(c => [c.name, c.userData.start, c.userData.end, c.userData.length, c.userData.kind]) }, { name: 'train-neutral', kind: 'neutral', allocation: 'assumed fleet', length: 92, assumed: true, label: 'Unknown train · assumed fleet', cars: layout.cars.map(c => [`car-${c.index}`, c.start, c.end, c.length, 'neutral']) });
});

test('neutral geometry is finite within assumed envelope with two bogies per car', () => {
  assert.deepEqual([neutralTrainLayout(), neutralTrainLayout(92, 4), neutralTrainLayout(12, 2)].map(layout => {
    const root = buildNeutralTrain(layout); const bounds = new THREE.Box3().setFromObject(root);
    let finite = true; let count = 0; let bogies = 0;
    root.traverse(o => {
      if (/^bogie-\d+-\d+$/.test(o.name)) bogies++;
      if (o instanceof THREE.Mesh) { const a = o.geometry.getAttribute('position'); count += a.count; finite &&= Array.from(a.array).every(Number.isFinite); }
    });
    return { finite, nonempty: count > 100, along: bounds.min.z >= 0 && bounds.max.z <= layout.length, width: bounds.max.x - bounds.min.x < 2.8, height: bounds.max.y < 3.71, bogies: bogies === layout.cars.length * 2 };
  }), Array.from({ length: 3 }, () => ({ finite: true, nonempty: true, along: true, width: true, height: true, bogies: true })));
});

test('neutral disposal preserves shared bogie caches and plain train material', () => {
  const root = buildNeutralTrain(); const shared = new Set<THREE.BufferGeometry>();
  let owned = 0; let disposed = 0; let sharedDisposed = 0;
  const listener = (): void => { sharedDisposed++; };
  root.traverse(o => { if (o instanceof THREE.Mesh) {
    if (o.name === 'bogie-mesh') shared.add(o.geometry);
    else { owned++; o.geometry.addEventListener('dispose', () => { disposed++; }); }
  } });
  for (const g of shared) g.addEventListener('dispose', listener);
  const material = (root.getObjectByName('body-shell') as THREE.Mesh).material as THREE.Material;
  material.addEventListener('dispose', listener); disposeNeutralTrain(root);
  for (const g of shared) g.removeEventListener('dispose', listener);
  material.removeEventListener('dispose', listener);
  assert.deepEqual({ owned: owned > 0, allReleased: disposed === owned, sharedDisposed }, { owned: true, allReleased: true, sharedDisposed: 0 });
});
