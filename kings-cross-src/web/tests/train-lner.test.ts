import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { trainLayout } from '../../core/train.ts';
import { buildTrain, POD, setTrainLampState } from '../src/train.ts';
import type { LampRecord } from '../src/train.ts';
import { col } from '../src/train-geom.ts';

const KINDS = ['lner5', 'lner9'] as const;
const models = KINDS.map(kind => [kind, buildTrain(kind)] as const);

function mesh(car: THREE.Object3D, name: string): THREE.Mesh {
  return car.getObjectByName(name) as THREE.Mesh;
}

function colouredBounds(body: THREE.Mesh, hex: number): THREE.Box3 {
  const rgb = col(hex);
  const p = body.geometry.getAttribute('position');
  const c = body.geometry.getAttribute('color');
  const box = new THREE.Box3();
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(c.getX(i) - rgb.r) < 1e-6 && Math.abs(c.getY(i) - rgb.g) < 1e-6 && Math.abs(c.getZ(i) - rgb.b) < 1e-6) {
      box.expandByPoint(new THREE.Vector3().fromBufferAttribute(p, i));
    }
  }
  return box;
}

test('LNER passenger doors sit near through ends, with the cab-side door behind the crew door', () => {
  for (const [kind, train] of models) {
    const layout = trainLayout(kind);
    train.children.forEach((car, i) => {
      const role = layout.cars[i]!;
      const doors = car.children.filter(o => o.name === 'door').map(o => o.position.z).sort((a, b) => a - b);
      assert.equal(doors.length, 4);
      const want = [role.start + (role.cab === 'front' ? 8 : 1.65), role.end - (role.cab === 'rear' ? 8 : 1.65)];
      assert.deepEqual(doors.map(z => +z.toFixed(3)), [want[0], want[0], want[1], want[1]].map(z => +z!.toFixed(3)));
    });
  }
});

test('LNER carries the red waist band across every passenger door leaf', () => {
  for (const [kind, train] of models) {
    const car = train.children[1]!;
    const body = mesh(car, 'body-detail');
    const bounds = colouredBounds(body, 0xc8102e);
    assert.ok(!bounds.isEmpty(), kind);
    assert.ok(bounds.max.x > 1.33 && bounds.min.x < -1.33, kind);
    assert.ok(Math.abs(bounds.min.y - 1.85) < 1e-5 && Math.abs(bounds.max.y - 2.76) < 1e-5, kind);
  }
});

test('LNER has two folded single-arm pantographs on the driving trailers, with four ribbed supports each', () => {
  for (const [kind, train] of models) {
    assert.equal(train.children.filter(car => car.getObjectByName('pantograph')).length, 2, kind);
    for (const cab of [train.children[0]!, train.children.at(-1)!]) {
      const pan = mesh(cab, 'pantograph-mesh');
      const p = pan.geometry.getAttribute('position');
      const c = pan.geometry.getAttribute('color');
      const support = col(0x25272b);
      const supports = new Set<string>();
      for (let i = 0; i < p.count; i++) {
        if (Math.abs(c.getX(i) - support.r) > 1e-6 || Math.abs(c.getY(i) - support.g) > 1e-6 || Math.abs(c.getZ(i) - support.b) > 1e-6) continue;
        assert.ok(Math.abs(p.getX(i)) > 0.35 && Math.abs(p.getZ(i)) > 0.6, kind);
        supports.add(`${Math.sign(p.getX(i))},${Math.sign(p.getZ(i))}`);
      }
      assert.equal(supports.size, 4, kind);
      const box = new THREE.Box3().setFromBufferAttribute(p as THREE.BufferAttribute);
      assert.ok(Math.abs(box.max.y - 0.24) < 1e-5, kind);
    }
  }
});

test('LNER axle-box cable leads hang outboard of every AT300 bogie frame, inside the 1.15 m envelope; Hull Trains and Lumo have none', () => {
  const near = (train: THREE.Object3D, i: number, k: number): THREE.Mesh => mesh(train.children[i]!, `bogie-${i}-${k}`)
    .getObjectByName('bogie-lod')!.children[0] as THREE.Mesh;
  for (const [kind, train] of models) {
    // car 0 runs on trailer bogies, car 1 on motor bogies: the one photographed bogie is drawn on both
    for (const i of [0, 1]) {
      const b = colouredBounds(near(train, i, 0), 0x45423d);
      assert.ok(b.min.x < -1.08 && b.max.x > 1.08, `${kind} car ${i}`);
      assert.ok(b.min.x >= -1.15 && b.max.x <= 1.15, `${kind} car ${i}`);
      assert.ok(b.min.y > 0.32 && b.min.y < 0.45 && b.max.y > 0.77 && b.max.y < 0.95, `${kind} car ${i}`);
    }
  }
  for (const kind of ['hull5', 'lumo5'] as const) assert.ok(colouredBounds(near(buildTrain(kind), 0, 0), 0x45423d).isEmpty(), kind);
});

test('LNER lamp housings read about 0.38 m across head on at both cabs, the AT300 default staying 0.28 m', () => {
  // the right-hand housing's span in x: from its inboard edge to its outboard edge, as the head-on camera sees it
  const across = (car: THREE.Object3D): number => {
    const body = mesh(car, 'body-detail');
    const rgb = col(POD);
    const p = body.geometry.getAttribute('position');
    const c = body.geometry.getAttribute('color');
    let inner = Infinity;
    let outer = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (p.getX(i) <= 0 || Math.abs(c.getX(i) - rgb.r) > 1e-6 || Math.abs(c.getY(i) - rgb.g) > 1e-6 || Math.abs(c.getZ(i) - rgb.b) > 1e-6) continue;
      inner = Math.min(inner, p.getX(i));
      outer = Math.max(outer, p.getX(i));
    }
    return outer - inner;
  };
  for (const [kind, train] of models) {
    for (const cab of [train.children[0]!, train.children.at(-1)!]) {
      const w = across(cab);
      assert.ok(w > 0.36 && w < 0.40, `${kind} ${cab.name}: housing ${w} m across`);
    }
  }
  const lumo = across(buildTrain('lumo5').children[0]!);
  assert.ok(lumo > 0.26 && lumo < 0.30, `lumo5 housing ${lumo} m across`);
});

test('LNER upper marker has its own lens at each cab, white leading and dark trailing', () => {
  for (const [kind] of models) {
    const train = buildTrain(kind);
    const cabs = [train.children[0]!, train.children.at(-1)!];
    for (const [front, rear] of [['head', 'tail'], ['tail', 'head'], ['off', 'off']] as const) {
      setTrainLampState(train, { front, rear });
      cabs.forEach((cab, i) => {
        const body = mesh(cab, 'body-detail');
        const record = body.userData.lamps as LampRecord;
        const p = body.geometry.getAttribute('position');
        const marker = record.lenses.filter(l => p.getY(l.v0) > 3);
        assert.equal(marker.length, 1, `${kind} ${cab.name}: one upper lamp`);
        const { v0, v1 } = marker[0]!;
        let minX = Infinity;
        let maxX = -Infinity;
        for (let v = v0; v < v1; v++) {
          minX = Math.min(minX, p.getX(v));
          maxX = Math.max(maxX, p.getX(v));
          assert.equal(body.geometry.getAttribute('aGlow').getX(v), (i === 0 ? front : rear) === 'head' ? 2 : 0);
        }
        assert.ok(Math.abs(minX + maxX) < 1e-5 && maxX > 0.14 && maxX < 0.18, kind);
      });
    }
  }
});

test('LNER triangle and draw budgets hold with either bogie LOD', () => {
  for (const [kind, train] of models) {
    for (const level of [0, 1]) {
      train.traverse(o => {
        if (o instanceof THREE.LOD) o.levels.forEach((entry, i) => { entry.object.visible = i === level; });
      });
      let trainTriangles = 0;
      let trainDraws = 0;
      train.children.forEach(car => {
        let triangles = 0;
        let draws = 0;
        car.traverseVisible(o => {
          if (!(o instanceof THREE.Mesh)) return;
          triangles += (o.geometry.index?.count ?? o.geometry.getAttribute('position').count) / 3;
          draws++;
        });
        assert.ok(triangles <= 40_000, `${kind} ${car.name}: ${triangles} triangles`);
        assert.ok(draws <= 7, `${kind} ${car.name}: ${draws} draws`);
        trainTriangles += triangles;
        trainDraws += draws;
      });
      assert.ok(trainTriangles <= 2_000_000 && trainDraws <= 1_000, kind);
    }
  }
});
