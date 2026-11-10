import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { HST, INTERCITY_KINDS, intercityLayout, VOYAGER } from '../../core/train-intercity.ts';
import { checkEdinburghRows } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, edinburghFleetRow } from '../src/edinburgh-fleet.ts';
import { buildIntercityTrain, disposeIntercityTrain, intercityFormation, splitPolygon } from '../src/train-intercity.ts';
import { col, plain } from '../src/train-geom.ts';
import { lensLook, setTrainLampState } from '../src/train.ts';

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

test('intercity lamps are wired to setTrainLampState: turning the train round swaps white and red at both cabs, and off darkens them', () => {
  type Lens = { role: 'head' | 'tail' | 'marker'; v0: number; v1: number };
  const shows = (root: THREE.Group, end: 'front' | 'rear', mode: 'head' | 'tail' | 'off'): boolean => {
    let ok = false;
    root.traverse((o) => {
      const lamps = o instanceof THREE.Mesh && o.name === 'body-detail' ? (o.userData.lamps as { end: string; lenses: Lens[] } | undefined) : undefined;
      if (!lamps || lamps.end !== end) return;
      const g = (o as THREE.Mesh).geometry;
      const rgb = g.getAttribute('color');
      const glow = g.getAttribute('aGlow');
      ok = lamps.lenses.every((l) => {
        const look = lensLook(l.role, mode);
        const c = col(look.hex);
        return glow.getX(l.v0) === look.glow && Math.abs(rgb.getX(l.v1 - 1) - c.r) < 1e-6 && Math.abs(rgb.getY(l.v0) - c.g) < 1e-6 && Math.abs(rgb.getZ(l.v0) - c.b) < 1e-6;
      });
    });
    return ok;
  };
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    assert.ok(shows(root, 'front', 'head') && shows(root, 'rear', 'tail'), `${kind} built in service state`);
    setTrainLampState(root, { front: 'tail', rear: 'head' });
    assert.ok(shows(root, 'front', 'tail') && shows(root, 'rear', 'head'), `${kind} turned round`);
    setTrainLampState(root, { front: 'off', rear: 'off' });
    assert.ok(shows(root, 'front', 'off') && shows(root, 'rear', 'off'), `${kind} dark`);
    assert.deepEqual(root.userData.lampState, { front: 'off', rear: 'off' });
  }
});

test('Voyager bogies: inside frames with plain steel rims, each driving only its inner axle (1A\'A1\'); HST couplers are buckeyes, the Voyager\'s Dellners', () => {
  const rust = col(0x9b5b36);
  const motor = col(0x4d5259);
  for (const kind of ['xc220x4', 'xc221x5'] as const) {
    const root = buildIntercityTrain(kind);
    for (const car of intercityLayout(kind).cars) {
      car.bogies.forEach((z, k) => {
        const bogie = root.getObjectByName(`bogie-${car.index}-${k}`) as THREE.Object3D;
        let near: THREE.BufferGeometry | undefined;
        bogie.traverse((o) => { if (o instanceof THREE.Mesh && o.userData.lod === 'near') near = o.geometry; });
        const rgb = near!.getAttribute('color');
        const pos = near!.getAttribute('position');
        let rusty = 0; const motorZ: number[] = [];
        for (let v = 0; v < rgb.count; v++) {
          const is = (c: THREE.Color): boolean => Math.abs(rgb.getX(v) - c.r) < 1e-6 && Math.abs(rgb.getY(v) - c.g) < 1e-6 && Math.abs(rgb.getZ(v) - c.b) < 1e-6;
          if (is(rust)) rusty++;
          if (is(motor)) motorZ.push(pos.getZ(v));
        }
        assert.equal(rusty, 0, `${kind} bogie-${car.index}-${k} rims`);
        assert.ok(motorZ.length > 0, `${kind} bogie-${car.index}-${k} has a motor`);
        const inner = z < (car.start + car.end) / 2 ? 1 : -1;
        assert.ok(motorZ.every((mz) => Math.sign(mz) === inner), `${kind} bogie-${car.index}-${k} drives only its inner axle`);
        // inside frame: nothing of the frame stands outboard of the wheels' outer faces
        const box = new THREE.Box3().setFromBufferAttribute(pos as THREE.BufferAttribute);
        assert.ok(box.max.x < 0.86, `${kind} bogie-${car.index}-${k} inside frame (max x ${box.max.x})`);
      });
    }
  }
  const couplers = (kind: 'xc220x4' | 'srhstx4'): string[] => {
    const names: string[] = [];
    buildIntercityTrain(kind).traverse((o) => { if (o.name === 'coupler') names.push(o.userData.style); });
    return [...new Set(names)];
  };
  assert.deepEqual(couplers('srhstx4'), ['buckeye']);
  assert.deepEqual(couplers('xc220x4'), ['dellner']);
});

test('a loft quad is cut exactly along a paint line, one piece each side, the cut points on the line', () => {
  const v = (s: number, y: number) => ({ p: [1.3, y, s] as [number, number, number], n: [1, 0, 0] as [number, number, number], s });
  const quad = [v(0, 1), v(1, 1), v(1, 2), v(0, 2)];
  const pieces = splitPolygon(quad, (s, y) => s - (y - 1));
  assert.equal(pieces.length, 2);
  assert.deepEqual(pieces.map((p) => p.length).sort(), [3, 3]);
  for (const piece of pieces) for (const w of piece) assert.ok(Math.abs(w.s - (w.p[1] - 1)) < 1e-12 || [0, 1].includes(w.s));
  assert.deepEqual(splitPolygon(quad, (s) => s - 5), [quad]);
  const three = splitPolygon(quad, (s) => s - 0.25);
  assert.deepEqual(three.map((p) => p.map((w) => w.s).sort()), [[0.25, 0.25, 1, 1], [0, 0, 0.25, 0.25]]);
});

test('intercity couplers meet: at every joint the two coupler heads touch within 1 cm, at the cars\' common end', () => {
  // the coupling is the only detail in the gap below the gangway and near the centre line: measure how far into the gap it reaches from each side
  const reach = (car: THREE.Object3D, from: number, toward: 1 | -1): number => {
    const pos = (car.getObjectByName('body-detail') as THREE.Mesh).geometry.getAttribute('position');
    let best = from;
    for (let v = 0; v < pos.count; v++) {
      const z = pos.getZ(v);
      if (Math.abs(pos.getX(v)) > 0.22 || pos.getY(v) < 0.6 || pos.getY(v) > 1.14) continue;
      if ((z - from) * toward < -0.001 || (z - from) * toward > 0.5) continue;
      if ((z - best) * toward > 0) best = z;
    }
    return best;
  };
  for (const kind of INTERCITY_KINDS) {
    const root = buildIntercityTrain(kind);
    const cars = intercityLayout(kind).cars;
    for (let i = 0; i + 1 < cars.length; i++) {
      const a = cars[i]!;
      const b = cars[i + 1]!;
      const headA = reach(root.getObjectByName(`car-${a.index}`)!, a.end - 0.35, 1);
      const headB = reach(root.getObjectByName(`car-${b.index}`)!, b.start + 0.35, -1);
      assert.ok(Math.abs(headA - headB) <= 0.01, `${kind} joint ${i}/${i + 1}: heads at ${headA.toFixed(3)} and ${headB.toFixed(3)}`);
      assert.ok(Math.abs(headA - a.end) <= 0.01, `${kind} joint ${i}/${i + 1}: they meet at the cars' common end ${a.end}, not ${headA.toFixed(3)}`);
    }
  }
});
