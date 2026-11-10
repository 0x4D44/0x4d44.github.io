import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { createEdinburghKinds } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, buildEdinburghTrain, disposeEdinburghTrain } from '../src/edinburgh-fleet.ts';

const zSpan = (o: THREE.Object3D): [number, number] => {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3();
  o.traverse(m => { if (m instanceof THREE.Mesh && m.name !== 'bogie-mesh') box.expandByObject(m); });
  return [box.min.z, box.max.z];
};

test('a coupled 3+4 is built as two real 385s end to end: cars and bogies renamed along the train, each in its own pitch', () => {
  const kinds = createEdinburghKinds(() => ({ operator: 'SR', units: [{ class: '385', cars: 3 }, { class: '385', cars: 4 }], orderAssumed: true, basis: 'booked diagram' }), { rows: EDINBURGH_FLEET });
  kinds.lengthM('2Y10', { id: 1, timeMs: 0 });
  const choice = kinds.formationFor({ id: 1 })!;
  assert.equal(choice.kind, 'sr385x3+sr385x4');
  const train = buildEdinburghTrain(choice)!;
  assert.deepEqual(train.children.map(c => c.name), choice.layout.cars.map(c => `car-${c.index}`));
  for (const car of choice.layout.cars) {
    const group = train.getObjectByName(`car-${car.index}`)!;
    for (const k of [0, 1]) assert.ok(group.getObjectByName(`bogie-${car.index}-${k}`), `bogie-${car.index}-${k}`);
    const [z0, z1] = zSpan(group);
    // the car's model sits within its own pitch (allowing the coupler and gangway that reach into the gap)
    assert.ok(z0 > car.start - 0.8 && z1 < car.end + 0.8, `car-${car.index} spans ${z0.toFixed(2)}..${z1.toFixed(2)}, pitch ${car.start.toFixed(2)}..${car.end.toFixed(2)}`);
  }
  // both units keep their cabs: the joint is nose to nose, with a cab on each side of it
  const joint = choice.units[1]!.offset;
  assert.deepEqual([choice.layout.cars[2]!.cab, choice.layout.cars[3]!.cab, choice.layout.cars[2]!.end], ['rear', 'front', joint]);
  const names: string[] = []; train.traverse(o => { if (/^bogie-\d+-\d$/.test(o.name)) names.push(o.name); });
  assert.equal(new Set(names).size, names.length, 'bogie names are unique');
  disposeEdinburghTrain(train);
});

test('a single unit and an unknown kind build as before', () => {
  assert.equal(buildEdinburghTrain({ kind: 'sr385x3', units: [{ kind: 'sr385x3', offset: 0, cars: 3 }] })!.children.length, 3);
  assert.equal(buildEdinburghTrain({ kind: 'neutral', units: [] }), undefined);
  assert.equal(buildEdinburghTrain({ kind: 'a+b', units: [{ kind: 'sr385x3', offset: 0, cars: 3 }, { kind: 'nope', offset: 70, cars: 2 }] }), undefined);
});
