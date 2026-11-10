import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HST, INTERCITY_KINDS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import { checkEdinburghRows } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, edinburghFleetRow } from '../src/edinburgh-fleet.ts';
import { buildIntercityTrain, disposeIntercityTrain, intercityFormation } from '../src/train-intercity.ts';
import { plain } from '../src/train-geom.ts';

const ownedTriangles = (car: THREE.Object3D): number => {
  let n = 0;
  car.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') n += o.geometry.getAttribute('position').count / 3; });
  return n;
};

test('intercity trains: one car-<i> group per layout car, each spanning its own [start, end], with bogie-<i>-<k> at its bogie centres', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const layout = intercityLayout(kind);
    assert.deepEqual(root.children.map((c) => c.name), layout.cars.map((c) => `car-${c.index}`), kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      const box = new THREE.Box3().setFromObject(g);
      assert.ok(box.min.z >= car.start - 0.001 && box.max.z <= car.end + 0.001, `${kind} car ${car.index} within [${car.start}, ${car.end}]: ${box.min.z}..${box.max.z}`);
      assert.ok(box.max.z - box.min.z > car.length - 0.5, `${kind} car ${car.index} fills its span`);
      car.bogies.forEach((z, k) => {
        const b = g.getObjectByName(`bogie-${car.index}-${k}`);
        assert.ok(b && b.parent === g, `${kind} bogie-${car.index}-${k} is a child of its car`);
        assert.equal(b.position.z, z);
      });
    }
  }
});

test('intercity bodies stand at their figures: width, roof under the formation roof top, every vertex finite', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const f = intercityFormation(kind);
    const hst = kind.startsWith('srhst');
    const width = hst ? HST.bodyWidth.value : VOYAGER.bodyWidth.value;
    let finite = true;
    root.traverse((o) => { if (o instanceof THREE.Mesh) finite &&= Array.from(o.geometry.getAttribute('position').array as Float32Array).every(Number.isFinite); });
    const box = new THREE.Box3().setFromObject(root);
    assert.ok(finite, kind);
    assert.ok(Math.abs(box.max.x - box.min.x - width) < 0.02, `${kind} width ${box.max.x - box.min.x}`);
    assert.ok(box.max.y <= f.roofTop + 0.001 && box.max.y > f.crown - 0.05, `${kind} roof ${box.max.y} against ${f.crown}..${f.roofTop}`);
    assert.ok(box.min.y > -0.05, `${kind} nothing under the rail head`);
  }
});

test('intercity cars stay within the 40k-triangle and draw budgets, and a power car has no gangway while every coach end does', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    for (const car of intercityLayout(kind).cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      assert.ok(ownedTriangles(g) < 40000, `${kind} car ${car.index}: ${ownedTriangles(g)} triangles`);
      let draws = 0;
      g.traverse((o) => { if (o instanceof THREE.Mesh && o.name !== 'bogie-mesh') draws++; });
      assert.ok(draws <= 3, `${kind} car ${car.index}: ${draws} owned draws`);
      const gangways = g.children.filter((o) => o.name === 'gangway').length;
      const want = car.body === 'class43' ? 0 : car.cab ? 1 : 2;
      assert.equal(gangways, want, `${kind} car ${car.index} gangways`);
      assert.equal(g.children.filter((o) => o.name === 'cab-glass').length, car.cab ? 1 : 0, `${kind} car ${car.index} cab glass`);
      assert.equal(g.children.filter((o) => o.name === 'nose-coupler').length, car.cab && car.body === 'voyager' ? 1 : 0, `${kind} car ${car.index} nose coupler`);
    }
  }
});

test('intercity cabs record their lamps as train.ts does: head lenses lit at the front, tail at the rear, two headlights each', () => {
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const layout = intercityLayout(kind);
    for (const car of layout.cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Group;
      const lamps = (g.getObjectByName('body-detail') as THREE.Mesh).userData.lamps as { end: string; lenses: { role: string; v0: number; v1: number }[] } | undefined;
      if (!car.cab) { assert.equal(lamps, undefined); continue; }
      assert.ok(lamps, `${kind} car ${car.index} lamps`);
      assert.equal(lamps.end, car.cab);
      assert.deepEqual([...new Set(lamps.lenses.map((l) => l.role))].sort(), ['head', 'marker', 'tail']);
      assert.ok(lamps.lenses.every((l) => l.v1 > l.v0));
      assert.equal(g.children.filter((o) => o.name === 'headlight').length, 2, `${kind} car ${car.index} headlights`);
    }
  }
});

test('the intercity rows: four kinds, their vehicle counts and classes, a formation the planner can trust, and no duplicate (operator, class, cars)', () => {
  const rows = INTERCITY_KINDS.map((k) => edinburghFleetRow(k));
  assert.deepEqual(rows.map((r) => r && [r.kind, r.operator, r.classes, r.cars]), [
    ['xc220x4', 'XC', ['220'], 4], ['xc221x5', 'XC', ['221'], 5], ['srhstx4', 'SR', ['43', 'HST'], 6], ['srhstx5', 'SR', ['43', 'HST'], 7],
  ]);
  checkEdinburghRows(EDINBURGH_FLEET);
  for (const r of rows) {
    const f = r!.formation!();
    const l = r!.layout();
    assert.equal(f.length, l.length);
    assert.equal(f.cars.length, r!.cars);
    assert.ok(f.roofTop >= f.crown && f.half > 1.3 && f.doorWidth > 0.5);
    for (const c of f.cars) for (const d of c.doors) assert.ok(d > c.start && d < c.end, `${r!.kind} car ${c.index} door ${d}`);
  }
  // the Voyager's door centres from the nose, the drawing's; the HST's coach doors at each end
  assert.deepEqual(intercityFormation('xc220x4').cars[0]!.doors.map((d) => Math.round(d * 100) / 100), [7.1, 22.3]);
  assert.deepEqual(intercityFormation('xc220x4').cars[3]!.doors.map((d) => Math.round(d * 100) / 100), [71.4, 86.6]);
  assert.deepEqual(intercityFormation('srhstx4').cars[0]!.doors, []);
});

test('intercity disposal frees the builder geometry and keeps the shared bogie geometry and material', () => {
  const root = buildIntercityTrain('srhstx4');
  let owned = 0; let disposed = 0; let shared = 0;
  const sharedSet = new Set<THREE.BufferGeometry>();
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    if (o.name === 'bogie-mesh') sharedSet.add(o.geometry);
    else { owned++; o.geometry.addEventListener('dispose', () => { disposed++; }); }
  });
  for (const g of sharedSet) g.addEventListener('dispose', () => { shared++; });
  const material = plain();
  material.addEventListener('dispose', () => { shared++; });
  disposeIntercityTrain(root);
  assert.ok(owned > 10);
  assert.equal(disposed, owned);
  assert.equal(shared, 0);
});
