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

test('LNER passenger and cab-side doors are white and break the red band, at every door of every car on both sides (round B4)', () => {
  // CHANGED (round B4; was "carries the red waist band across every passenger door leaf", e76b7348): lner-801-214-2025, lner-800-doncaster-2026 and lner-800-113-newcastle-2025
  // show white leaves at every door, the band stopping at each. Per door: the faces on the leaf's plane over the band's height (LNER_BAND, 1.85 to 2.76 m) carry the door's white
  // and no red.
  const white = col(0xf2f2ee);
  const red = col(0xc8102e);
  const is = (c: THREE.BufferAttribute, i: number, rgb: THREE.Color): boolean =>
    Math.abs(c.getX(i) - rgb.r) < 1e-6 && Math.abs(c.getY(i) - rgb.g) < 1e-6 && Math.abs(c.getZ(i) - rgb.b) < 1e-6;
  for (const [kind, train] of models) {
    train.children.forEach((car) => {
      const g = mesh(car, 'body-detail').geometry;
      const geo = g.index ? g.toNonIndexed() : g;
      const p = geo.getAttribute('position');
      const c = geo.getAttribute('color') as THREE.BufferAttribute;
      const doors = car.children.filter((o) => o.name === 'door' || o.name === 'crew-door');
      assert.equal(doors.filter((o) => o.name === 'door').length, 4, `${kind} ${car.name}`);
      for (const d of doors) {
        const here = `${kind} ${car.name} ${d.name} ${d.userData.side} at ${d.position.z.toFixed(2)}`;
        const sx = Math.sign(d.position.x);
        const half = Math.abs(d.position.x);
        const w = d.userData.width as number;
        let whites = 0;
        let reds = 0;
        for (let t = 0; t < p.count; t += 3) {
          const k = [t, t + 1, t + 2];
          if (k.some((i) => p.getX(i) * sx < half - 0.0045 || Math.abs(p.getZ(i) - d.position.z) > w / 2 + 1e-4)) continue;
          if (Math.max(...k.map((i) => p.getY(i))) < 1.85 || Math.min(...k.map((i) => p.getY(i))) > 2.76) continue;
          if (is(c, t, white)) whites++;
          if (is(c, t, red)) reds++;
        }
        assert.ok(whites > 0, `${here}: no white leaf over the band's height`);
        assert.equal(reds, 0, `${here}: ${reds} red faces on the leaf`);
      }
    });
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

test('LNER lamp housings are compact: 0.45 to 1.4 m behind the tip (0.95 m long), about 0.18 m across head on, at both cabs; the AT300 default staying 0.28 m (round B4)', () => {
  // CHANGED (round B4; was "read about 0.38 m across head on", e76b7348's housing 0.45 to 2.06 m behind the tip, 1.6 m long): a fresh score saw a 1.5 m black slab across the cheek where
  // lner-801-214-2025 and lner-800-doncaster-2026 show a compact lamp recess at the yellow's upper corners (round 7's BASE: 0.55 to 1.34 m, 0.79 m long)
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
  // how far behind the car's end the housing's window starts and stops
  const along = (car: THREE.Object3D, front: boolean): [number, number] => {
    const body = mesh(car, 'body-detail');
    const rgb = col(POD);
    const p = body.geometry.getAttribute('position');
    const c = body.geometry.getAttribute('color');
    let end = front ? Infinity : -Infinity;
    for (let i = 0; i < p.count; i++) end = front ? Math.min(end, p.getZ(i)) : Math.max(end, p.getZ(i));
    let near = Infinity;
    let far = -Infinity;
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(c.getX(i) - rgb.r) > 1e-6 || Math.abs(c.getY(i) - rgb.g) > 1e-6 || Math.abs(c.getZ(i) - rgb.b) > 1e-6) continue;
      near = Math.min(near, Math.abs(p.getZ(i) - end));
      far = Math.max(far, Math.abs(p.getZ(i) - end));
    }
    return [near, far];
  };
  for (const [kind, train] of models) {
    for (const [cab, front] of [[train.children[0]!, true], [train.children.at(-1)!, false]] as const) {
      const w = across(cab);
      assert.ok(w > 0.16 && w < 0.20, `${kind} ${cab.name}: housing ${w} m across`);
      const [near, far] = along(cab, front);
      assert.ok(near > 0.43 && near < 0.47, `${kind} ${cab.name}: housing starts ${near} m behind the end`);
      assert.ok(far > 1.38 && far < 1.42, `${kind} ${cab.name}: housing ends ${far} m behind the end`);
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

test('LNER lamp housing: its pale rim, the layer that meets the nose, does not lie within 2 mm of and near parallel to the paint under it, the z-fight of round B3\'s ragged white fringe (round B4)', () => {
  // Points over each rim triangle are cast both ways along its normal, 2 mm each way, at the car's body meshes. A hit on a face of another colour within 15 degrees of parallel is
  // a point the depth buffer cannot settle: 4d478b17's 6 cm bevel, drawn across one row of the grid, left 15% of the rim so (404 of 2,688 points at the leading cab of lner5), all along its top and its foot.
  // The steep edge leaves the corners, where two falls meet: under 1% here.
  const rim = col(0xc7ccd3);
  const near = (a: THREE.Color, c: THREE.BufferAttribute, i: number): boolean =>
    Math.abs(c.getX(i) - a.r) < 1e-4 && Math.abs(c.getY(i) - a.g) < 1e-4 && Math.abs(c.getZ(i) - a.b) < 1e-4;
  const ray = new THREE.Raycaster();
  for (const kind of KINDS) {
    const train = buildTrain(kind);
    train.updateMatrixWorld(true);
    for (const car of [train.children[0]!, train.children.at(-1)!]) {
      const bodies: THREE.Mesh[] = [];
      car.traverse((o) => {
        if (o instanceof THREE.Mesh && /body/.test(o.name)) {
          o.material = (o.material as THREE.Material).clone();
          (o.material as THREE.Material).side = THREE.DoubleSide;
          bodies.push(o);
        }
      });
      const g = mesh(car, 'body-detail').geometry;
      const geo = g.index ? g.toNonIndexed() : g;
      const p = geo.getAttribute('position');
      const c = geo.getAttribute('color') as THREE.BufferAttribute;
      let samples = 0;
      let fought = 0;
      for (let t = 0; t < p.count; t += 3) {
        if (!near(rim, c, t)) continue;
        const [a, b, d] = [t, t + 1, t + 2].map((i) => new THREE.Vector3().fromBufferAttribute(p, i)) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(d, a));
        if (n.length() < 1e-12) continue;
        n.normalize();
        for (const [u, v] of [[1 / 3, 1 / 3], [0.1, 0.1], [0.8, 0.1], [0.1, 0.8]] as const) {
          const q = a.clone().multiplyScalar(1 - u - v).addScaledVector(b, u).addScaledVector(d, v);
          samples++;
          const hit = [n, n.clone().negate()].some((dir) => {
            ray.set(q.clone().addScaledVector(dir, -1e-6), dir);
            ray.far = 0.002;
            return ray.intersectObjects(bodies, false).some((h) => {
              const hc = (h.object as THREE.Mesh).geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
              if (hc && near(rim, hc, h.face!.a)) return false;
              return Math.abs(h.face!.normal.clone().transformDirection(h.object.matrixWorld).dot(n)) >= Math.cos((15 * Math.PI) / 180);
            });
          });
          if (hit) fought++;
        }
      }
      assert.ok(samples > 1000, `${kind} ${car.name}: ${samples} points on the rim`);
      assert.ok(fought / samples < 0.01, `${kind} ${car.name}: ${fought} of ${samples} rim points within 2 mm of the paint and near parallel to it`);
    }
  }
});

test('LNER amber line follows the black dome\'s edge: every point of it beyond the upper marker within 3 cm of the dome\'s outline, at both cabs (round B4)', () => {
  // lner-801-214-2025: the orange line runs along the edge of the black cap. Round B3's brow curved forward off the cap and across the white above the cab side window
  // (22 cm off its outline at 0.82 m out in 4d478b17).
  const cap = col(0x1a1c21);
  const amber = col(0xe9a031);
  const is = (a: THREE.Color, c: THREE.BufferAttribute, i: number): boolean =>
    Math.abs(c.getX(i) - a.r) < 1e-4 && Math.abs(c.getY(i) - a.g) < 1e-4 && Math.abs(c.getZ(i) - a.b) < 1e-4;
  for (const [kind, train] of models) {
    for (const car of [train.children[0]!, train.children.at(-1)!]) {
      const g = mesh(car, 'body-detail').geometry;
      const geo = g.index ? g.toNonIndexed() : g;
      const p = geo.getAttribute('position');
      const c = geo.getAttribute('color') as THREE.BufferAttribute;
      const v = (i: number): THREE.Vector3 => new THREE.Vector3().fromBufferAttribute(p, i);
      // the dome's outline: the edges only one of its triangles uses
      const uses = new Map<string, { n: number; a: THREE.Vector3; b: THREE.Vector3 }>();
      const key = (x: THREE.Vector3): string => `${x.x.toFixed(5)},${x.y.toFixed(5)},${x.z.toFixed(5)}`;
      for (let t = 0; t < p.count; t += 3) {
        if (!is(cap, c, t)) continue;
        for (const [i, j] of [[t, t + 1], [t + 1, t + 2], [t + 2, t]] as const) {
          const a = v(i);
          const b = v(j);
          const k = [key(a), key(b)].sort().join('|');
          const u = uses.get(k) ?? { n: 0, a, b };
          u.n++;
          uses.set(k, u);
        }
      }
      const outline = [...uses.values()].filter((u) => u.n === 1).map((u) => new THREE.Line3(u.a, u.b));
      assert.ok(outline.length > 10, `${kind} ${car.name}: the dome's outline`);
      let points = 0;
      for (let i = 0; i < p.count; i++) {
        // (the ring round the upper marker, 0.235 m either side of the middle at most, is the same amber)
        if (!is(amber, c, i) || Math.abs(p.getX(i)) < 0.3) continue;
        points++;
        const q = v(i);
        const off = Math.min(...outline.map((l) => l.closestPointToPoint(q, true, new THREE.Vector3()).distanceTo(q)));
        assert.ok(off < 0.03, `${kind} ${car.name}: the line ${(off * 100).toFixed(1)} cm off the dome's edge at (${q.x.toFixed(2)}, ${q.y.toFixed(2)}, ${q.z.toFixed(2)})`);
      }
      assert.ok(points > 20, `${kind} ${car.name}: ${points} points of the line`);
    }
  }
});
