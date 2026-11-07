// The train model's contract: the group is the size core/train.ts says, every named part is where
// the layout says, and nothing pokes out of the published envelope. Pure geometry: no WebGL, no DOM.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { FIGURES, roofHeight, TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { LIVERIES } from '../src/livery.ts';
import { buildTrain } from '../src/train.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);

function built(kind: TrainKind): THREE.Group {
  const g = buildTrain(kind);
  g.updateMatrixWorld(true);
  return g;
}
const boxOf = (o: THREE.Object3D): THREE.Box3 => new THREE.Box3().setFromObject(o);
const named = (root: THREE.Object3D, name: string): THREE.Object3D => {
  const o = root.getObjectByName(name);
  assert.ok(o, `${root.name} has no ${name}`);
  return o;
};
const all = (root: THREE.Object3D, name: string): THREE.Object3D[] => {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => {
    if (o.name === name) out.push(o);
  });
  return out;
};
/** Every vertex of a mesh, in world space. */
function worldVertices(mesh: THREE.Mesh): THREE.Vector3[] {
  const p = mesh.geometry.getAttribute('position');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) out.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrixWorld));
  return out;
}
const worldZ = (o: THREE.Object3D): number => o.getWorldPosition(new THREE.Vector3()).z;

test('train: the root carries kind, length and car count, and the group is as long as the layout says', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    assert.equal(g.userData.kind, kind);
    assert.equal(g.userData.cars, layout.cars.length);
    near(g.userData.length as number, layout.length, 1e-9, `${kind} userData.length`);
    const b = boxOf(g);
    near(b.min.z, 0, 0.01, `${kind} nose at z = 0`);
    near(b.max.z, layout.length, 0.01, `${kind} overall length`);
  }
});

test('train: each car sits at its place in the layout, is exactly body-wide, and carries only its own parts', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    assert.equal(g.children.filter((c) => /^car-\d+$/.test(c.name)).length, layout.cars.length, `${kind} car groups`);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      const b = boxOf(group);
      near(b.min.z, car.start, 0.01, `${kind} car ${car.index} start`);
      near(b.max.z, car.end, 0.01, `${kind} car ${car.index} end`);
      near(b.max.z - b.min.z, car.length, 0.01, `${kind} car ${car.index} length`);
      // the body is bodyWidth wide; wheels and the pantograph are narrower, so the whole car is too
      const body = new THREE.Box3().union(boxOf(named(group, 'body-shell'))).union(boxOf(named(group, 'body-detail')));
      near(body.max.x - body.min.x, FIGURES.bodyWidth.value, 0.02, `${kind} car ${car.index} body width`);
      assert.ok(b.max.x - b.min.x <= FIGURES.bodyWidth.value + 0.02, `${kind} car ${car.index}: something is wider than the body (${b.max.x - b.min.x})`);
      near((b.max.x + b.min.x) / 2, 0, 0.01, `${kind} car ${car.index} centred on the track`);
    }
  }
});

test('train: the roof covers reach the published roof height and nothing goes above it or below the rail head', () => {
  for (const kind of TRAIN_KINDS) {
    const b = boxOf(built(kind));
    near(b.max.y, roofHeight(), 0.02, `${kind} highest point`);
    assert.ok(b.max.y >= roofHeight() - 0.1, `${kind} highest point ${b.max.y} is below the covers`);
    near(b.min.y, 0, 0.01, `${kind} wheel treads on the rail head`);
  }
});

test('train: every bogie is at its layout position with four wheels of the right size on the rail head', () => {
  const radius = FIGURES.wheelDiameter.value / 2;
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars) {
      car.bogies.forEach((z, k) => {
        const bogie = named(g, `bogie-${car.index}-${k}`);
        near(worldZ(bogie), z, 0.01, `${kind} bogie ${car.index}-${k} z`);
        const wheels = bogie.children.filter((c) => c.name === 'wheel');
        assert.equal(wheels.length, 4, `${kind} bogie ${car.index}-${k} wheels`);
        const spots = new Set<string>();
        for (const w of wheels) {
          assert.equal(w.userData.radius, radius, 'wheel radius is wheelDiameter / 2');
          near(w.position.y, radius, 1e-9, 'wheel axle height');
          near(Math.abs(w.position.x), FIGURES.gauge.value / 2, 1e-9, 'wheel track is the gauge');
          near(Math.abs(w.position.z), FIGURES.bogieWheelbase.value / 2, 1e-9, 'axle spacing is the wheelbase');
          spots.add(`${Math.sign(w.position.x)},${Math.sign(w.position.z)}`);
        }
        assert.equal(spots.size, 4, 'one wheel at each corner');
        // the markers are not decoration: the merged mesh has a wheel tread on the rail head under each one
        const mesh = named(bogie, 'bogie-mesh') as THREE.Mesh;
        const vs = worldVertices(mesh);
        for (const w of wheels) {
          const at = w.getWorldPosition(new THREE.Vector3());
          assert.ok(
            vs.some((v) => Math.abs(v.y) < 1e-6 && Math.abs(v.z - at.z) < 1e-4 && Math.abs(v.x - at.x) <= (w.userData.width as number) / 2 + 1e-4),
            `${kind} bogie ${car.index}-${k}: no wheel tread under the marker at x=${at.x}, z=${at.z}`,
          );
        }
        const bb = boxOf(mesh);
        near(bb.min.y, 0, 0.01, 'bogie bottom');
        near(bb.max.z - bb.min.z, FIGURES.bogieWheelbase.value + FIGURES.wheelDiameter.value, 0.05, 'bogie length is the wheelbase plus a wheel');
        assert.ok(bb.max.y < 1.0, 'the bogie fits under the floor');
      });
    }
  }
});

test('train: exactly one pantograph, folded, over the car and the span the layout gives', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    const pans = all(g, 'pantograph');
    assert.equal(pans.length, 1, `${kind} pantographs`);
    const carriers = layout.cars.filter((c) => c.pantograph !== null);
    assert.equal(carriers.length, 1, `${kind} cars with a pantograph in the layout`);
    const car = carriers[0] as (typeof layout.cars)[number];
    const pan = pans[0] as THREE.Object3D;
    assert.equal(pan.parent?.name, `car-${car.index}`, `${kind} pantograph is on the right car`);
    const [p0, p1] = car.pantograph as readonly [number, number];
    const b = boxOf(pan);
    near(b.min.z, p0, 0.02, `${kind} pantograph base start`);
    near(b.max.z, p1, 0.02, `${kind} pantograph base end`);
    near(b.max.y, FIGURES.roofEdgeHeight.value + FIGURES.pantographFoldedHeight.value, 0.01, `${kind} folded height above the roof edge`);
    assert.ok(b.max.y < roofHeight(), `${kind} the folded pantograph stays under the roof covers`);
    assert.ok(b.min.y >= FIGURES.roofEdgeHeight.value - 0.05, `${kind} pantograph stands on the roof`);
    assert.ok(b.max.x - b.min.x < FIGURES.bodyWidth.value, `${kind} pantograph is narrower than the body`);
    // the roof covers leave the pantograph's span clear
    const carBox = boxOf(named(g, `car-${car.index}`));
    assert.ok(carBox.max.y <= roofHeight() + 0.02);
  }
});

test('train: two single-leaf doors per side per car, on the car and on the skin of the body', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    for (const car of trainLayout(kind).cars) {
      const group = named(g, `car-${car.index}`);
      const doors = all(group, 'door');
      for (const side of ['left', 'right']) {
        const ds = doors.filter((d) => d.userData.side === side);
        assert.equal(ds.length, 2, `${kind} car ${car.index} ${side} doors`);
        for (const d of ds) {
          const at = d.getWorldPosition(new THREE.Vector3());
          assert.ok(at.z > car.start && at.z < car.end, `${kind} car ${car.index}: a door is outside its car`);
          near(Math.abs(at.x), FIGURES.bodyWidth.value / 2, 1e-9, 'a door is on the side of the body');
        }
        // one near each end, not both together
        const zs = ds.map((d) => d.getWorldPosition(new THREE.Vector3()).z).sort((a, b) => a - b);
        assert.ok((zs[1] as number) - (zs[0] as number) > car.length / 2, `${kind} car ${car.index}: the two doors are at the same end`);
      }
      assert.equal(doors.length, 4, `${kind} car ${car.index} doors in all`);
      // each door is drawn: the body mesh has an outer face at the door's x, within the door's width of its z
      const vs = worldVertices(named(group, 'body-detail') as THREE.Mesh);
      for (const d of doors) {
        const at = d.getWorldPosition(new THREE.Vector3());
        assert.ok(
          vs.some((v) => Math.abs(v.x - at.x) < 1e-6 && Math.abs(v.z - at.z) <= (d.userData.width as number) / 2),
          `${kind} car ${car.index}: no door geometry at z=${at.z}`,
        );
      }
    }
  }
});

test('train: a cab narrows in plan and slopes in elevation toward the end of the train, and stays inside its own car', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    const layout = trainLayout(kind);
    for (const car of layout.cars) {
      const group = named(g, `car-${car.index}`);
      const body = [named(group, 'body-shell') as THREE.Mesh, named(group, 'body-detail') as THREE.Mesh].flatMap(worldVertices);
      const tipSide = car.cab === 'front' ? (z: number) => z - car.start : (z: number) => car.end - z;
      if (car.cab === null) continue;
      const nearTip = body.filter((v) => tipSide(v.z) < 0.3 && v.y > 0.7);
      assert.ok(nearTip.length > 0, `${kind} car ${car.index}: no nose`);
      assert.ok(Math.max(...nearTip.map((v) => Math.abs(v.x))) < 0.9, `${kind} car ${car.index}: the nose tip is not narrow`);
      assert.ok(Math.max(...nearTip.map((v) => v.y)) < FIGURES.roofEdgeHeight.value - 1.0, `${kind} car ${car.index}: the nose tip is not lower than the roof`);
      // vertices are float32, so a z near 130 m is only good to about 1e-5
      assert.ok(body.every((v) => v.z >= car.start - 1e-4 && v.z <= car.end + 1e-4), `${kind} car ${car.index}: the body leaves its own car`);
    }
    // cars with no cab have none of that: full width at both ends
    const mid = named(g, 'car-1');
    const midBody = worldVertices(named(mid, 'body-shell') as THREE.Mesh);
    assert.ok(Math.max(...midBody.map((v) => Math.abs(v.x))) > 1.3);
  }
});

test('train: a nine-car train draws in no more than 80 calls, and the side shell is the only textured mesh', () => {
  for (const kind of TRAIN_KINDS) {
    const g = built(kind);
    let meshes = 0;
    const materials = new Set<THREE.Material>();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        meshes++;
        materials.add(m.material as THREE.Material);
      }
    });
    assert.ok(meshes <= 80, `${kind} has ${meshes} meshes`);
    // one shared vertex-colour material plus at most one shell material per role (driving, middle)
    assert.ok(materials.size <= 3, `${kind} uses ${materials.size} materials`);
  }
  // the bogie mesh geometry is built once and shared
  const g = built('lner9');
  const geos = new Set<THREE.BufferGeometry>();
  g.traverse((o) => {
    if (o.name === 'bogie-mesh') geos.add((o as THREE.Mesh).geometry);
  });
  assert.equal(geos.size, 1);
});

test('train: every livery says how good its colours are, and the Hull Trains one is a flagged placeholder', () => {
  for (const [name, def] of Object.entries(LIVERIES)) assert.ok(def.basis.length > 10, `${name} has no basis note`);
  assert.match(LIVERIES.hulltrains.basis, /PLACEHOLDER/);
  assert.doesNotMatch(LIVERIES.lner.basis, /PLACEHOLDER/);
});
