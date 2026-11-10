import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { at300Plan, bodySpec, buildTrain } from '../src/train.ts';
import { cutOpenings, subtractRect } from '../src/train-interior-cut.ts';
import type { Opening } from '../src/train-interior-cut.ts';
import * as at300 from '../src/train-interior-at300.ts';
import { createTrainInteriors, distanceToCar, INSIDE_NEAR, MAX_CARS, REACH } from '../src/train-interior.ts';
import { FIT, fitFor, layoutCar, SEAT_MAPS } from '../src/train-interior-layout.ts';

/** The budget ruling for trains: 40k triangles a car; the interior adds at most this many draws a car. */
const CAR_TRIANGLES = 40_000;
const INTERIOR_DRAWS = 5;

const triangles = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    n += m.geometry.index ? m.geometry.index.count / 3 : m.geometry.getAttribute('position').count / 3;
  });
  return n;
};

/** A point in the middle of a car, at a seated passenger's eye, in the car's own frame. */
function eyeIn(kind: TrainKind, index: number): THREE.Vector3 {
  const car = trainLayout(kind).cars[index]!;
  return new THREE.Vector3(0, FIT.floor + 1.2, (car.start + car.end) / 2);
}

/** Cast rays from `eye` in a ring of directions; answer how many hit a face that faces the eye (the GPU draws only those: FrontSide). */
function frontHits(objects: THREE.Object3D[], eye: THREE.Vector3, dirs: THREE.Vector3[]): number {
  const ray = new THREE.Raycaster();
  let hits = 0;
  for (const d of dirs) {
    ray.set(eye, d.clone().normalize());
    const hit = ray.intersectObjects(objects, true).find((h) => (h.object as THREE.Mesh).isMesh);
    if (hit && hit.face && hit.face.normal.clone().transformDirection(hit.object.matrixWorld).dot(d) < 0) hits++;
  }
  return hits;
}
const ring = (): THREE.Vector3[] => {
  const out: THREE.Vector3[] = [];
  for (let a = 0; a < 16; a++) for (const y of [-0.6, 0.6]) out.push(new THREE.Vector3(Math.cos((a * Math.PI) / 8), y, Math.sin((a * Math.PI) / 8)));
  return out;
};

function scene(kind: TrainKind = 'lner9'): { root: THREE.Scene; group: THREE.Group; camera: THREE.PerspectiveCamera; trains: { kind: TrainKind; group: THREE.Group }[] } {
  const root = new THREE.Scene();
  const group = buildTrain(kind);
  root.add(group);
  group.position.set(10, 0, -40); group.rotation.y = 0.3;
  root.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  return { root, group, camera, trains: [{ kind, group }] };
}
const toWorld = (group: THREE.Object3D, index: number, p: THREE.Vector3): THREE.Vector3 => p.clone().applyMatrix4(group.getObjectByName(`car-${index}`)!.matrixWorld);
const load = async () => at300;

test('the diagnosis: from inside a car, the exterior skin faces away from the eye, so the GPU culls it and the car vanishes', () => {
  const { root, group } = scene();
  const eye = toWorld(group, 3, eyeIn('lner9', 3));
  const car = group.getObjectByName('car-3')!;
  for (const name of ['body-shell', 'livery-decals']) {
    const mesh = car.getObjectByName(name) as THREE.Mesh;
    assert.equal((mesh.material as THREE.Material).side, THREE.FrontSide, `${name} is single-sided`);
  }
  // looking out in 32 directions from the middle of the car: no ray meets a face turned to the eye in the shell
  assert.equal(frontHits([car.getObjectByName('body-shell')!], eye, ring()), 0);
  void root;
});

test('with the interior, every look from inside meets a lit inner surface, except straight out through a window', async () => {
  const { root, group, camera, trains } = scene();
  const interiors = createTrainInteriors({ scene: root, camera, trains: () => trains, load });
  camera.position.copy(toWorld(group, 3, eyeIn('lner9', 3)));
  interiors.frame(); await interiors.ready(); interiors.frame();
  const inner = root.children.filter((o) => o.name.startsWith('interior-'));
  assert.ok(inner.length >= 1);
  root.updateMatrixWorld(true);
  const car = group.getObjectByName('car-3')!;
  // up, down, along the car and at the walls between the windows: all meet a face turned to the eye
  // (along the car a little off its centre line, past the open doorways in the partitions and the gangway)
  const solid = [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0.3, 0.05, 1), new THREE.Vector3(-0.3, 0.05, -1)]
    .map((d) => d.applyQuaternion(car.getWorldQuaternion(new THREE.Quaternion())));
  assert.equal(frontHits(inner, camera.position, solid), solid.length);
  // a level look at the middle of a window goes out: no opaque interior face and no skin face that faces in, only the glass
  const spec = bodySpec('at300');
  // (the plan's windows are metres from the car's start; car 3 has no cab, so its z is start + s)
  const c3 = trainLayout('lner9').cars[3]!;
  const [w0, w1] = at300Plan(c3).windows[4]!.map((s) => c3.start + s) as [number, number];
  for (const side of [1, -1]) {
    const eye = toWorld(group, 3, new THREE.Vector3(0, (spec.windowY[0] + spec.windowY[1]) / 2, (w0 + w1) / 2));
    const out = toWorld(group, 3, new THREE.Vector3(side * 3, (spec.windowY[0] + spec.windowY[1]) / 2, (w0 + w1) / 2)).sub(eye).normalize();
    const hits = new THREE.Raycaster(eye, out).intersectObjects([...inner, car], true)
      .filter((h) => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(out) < 0);
    assert.ok(hits.length >= 1, 'the glass is there');
    assert.ok(hits.every((h) => ((h.object as THREE.Mesh).material as THREE.Material).transparent), `side ${side}: only glass between the eye and the platform: ${hits.map((h) => h.object.name).join(', ')}`);
  }
  // from the platform, the look in through the same window meets glass and then the inside, not the old opaque pane or the skin
  for (const side of [1, -1]) {
    // (a standing eye 0.85 m off the side, looking down through the window at the far aisle's floor)
    const eye = toWorld(group, 3, new THREE.Vector3(side * 2.2, 2.6, (w0 + w1) / 2));
    const into = toWorld(group, 3, new THREE.Vector3(-side * 0.5, FIT.floor, (w0 + w1) / 2)).sub(eye).normalize();
    const hits = new THREE.Raycaster(eye, into).intersectObjects([...inner, car], true)
      .filter((h) => h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).dot(into) < 0);
    const firstOpaque = hits.find((h) => !((h.object as THREE.Mesh).material as THREE.Material).transparent);
    assert.ok(hits[0] && ((hits[0].object as THREE.Mesh).material as THREE.Material).transparent, `side ${side}: glass first`);
    assert.ok(firstOpaque && firstOpaque.object.name.startsWith('interior-'), `side ${side}: then the inside, not ${firstOpaque?.object.name}`);
  }
  interiors.dispose();
});

test('the interior shows only inside or within reach of a car, for that car and its neighbours, and is disposed when the camera leaves', async () => {
  const { root, group, camera, trains } = scene();
  const interiors = createTrainInteriors({ scene: root, camera, trains: () => trains, load });
  const car3 = group.getObjectByName('car-3')!;
  const shell = car3.getObjectByName('body-shell') as THREE.Mesh;
  const shared = shell.geometry;
  camera.position.set(500, 300, 500);
  interiors.frame(); await interiors.ready(); interiors.frame();
  assert.equal(interiors.stats().cars.length, 0, 'far away: nothing');
  assert.equal(interiors.stats().loaded, false, 'and the builder is not even loaded');
  // beside the car, two metres off its side at window height: within reach, not inside
  camera.position.copy(toWorld(group, 3, new THREE.Vector3(1.35 + 2, 2.3, (trainLayout('lner9').cars[3]!.start + trainLayout('lner9').cars[3]!.end) / 2)));
  interiors.frame(); await interiors.ready(); interiors.frame(); interiors.frame(); interiors.frame();
  assert.deepEqual(interiors.stats().cars.map((c) => c.car).sort(), [2, 3, 4]);
  assert.equal(interiors.stats().inside, null);
  assert.equal(camera.near, 0.5, 'outside, the near plane is the page\'s');
  assert.notEqual(shell.geometry, shared, 'the active car draws its cut copy');
  // inside: the near plane comes in
  camera.position.copy(toWorld(group, 3, eyeIn('lner9', 3)));
  interiors.frame();
  assert.ok(interiors.stats().inside);
  assert.equal(camera.near, INSIDE_NEAR);
  // walk to car 6: 2..4 are released, 5..7 built, one a frame
  const disposed: string[] = [];
  for (const o of root.children) if (o.name.startsWith('interior-')) o.traverse((m) => { if ((m as THREE.Mesh).isMesh) (m as THREE.Mesh).geometry.addEventListener('dispose', () => disposed.push(o.name)); });
  const cut = shell.geometry;
  let cutDisposed = false;
  cut.addEventListener('dispose', () => { cutDisposed = true; });
  camera.position.copy(toWorld(group, 6, eyeIn('lner9', 6)));
  for (let i = 0; i < 4; i++) interiors.frame();
  assert.deepEqual(interiors.stats().cars.map((c) => c.car).sort(), [5, 6, 7]);
  assert.equal(shell.geometry, shared, 'car 3 has its shared skin back');
  assert.ok(cutDisposed, 'and its cut copy is disposed');
  assert.deepEqual([...new Set(disposed)].sort(), ['interior-2', 'interior-3', 'interior-4']);
  assert.equal(root.children.filter((o) => o.name.startsWith('interior-')).length, MAX_CARS);
  // away again: all gone, the near plane restored
  camera.position.set(500, 300, 500);
  interiors.frame();
  assert.equal(interiors.stats().cars.length, 0);
  assert.equal(root.children.filter((o) => o.name.startsWith('interior-')).length, 0);
  assert.equal(camera.near, 0.5);
  // a train without an interior kind is never given one
  const gn = scene('gn387x4');
  const other = createTrainInteriors({ scene: gn.root, camera: gn.camera, trains: () => gn.trains, load });
  gn.camera.position.copy(toWorld(gn.group, 1, new THREE.Vector3(0, 2.2, (trainLayout('gn387x4').cars[1]!.start + trainLayout('gn387x4').cars[1]!.end) / 2)));
  other.frame(); await other.ready(); other.frame();
  assert.equal(other.stats().cars.length, 0);
  interiors.dispose(); other.dispose();
});

test('reach: a car is in reach within REACH metres of its body and not beyond', () => {
  const car = { start: 10, end: 36 };
  assert.equal(distanceToCar(new THREE.Vector3(0, 2, 20), car), 0);
  assert.ok(distanceToCar(new THREE.Vector3(1.35 + REACH - 0.01, 2, 20), car) <= REACH);
  assert.ok(distanceToCar(new THREE.Vector3(1.35 + REACH + 0.01, 2, 20), car) > REACH);
  assert.ok(distanceToCar(new THREE.Vector3(0, 2, 36 + REACH + 0.01), car) > REACH);
});

test('every Azuma car type stays within the budget: 40k triangles a car with its interior, five draws more', () => {
  for (const kind of TRAIN_KINDS) {
    const train = buildTrain(kind);
    for (const car of trainLayout(kind).cars) {
      const b = at300.buildInterior(kind, car);
      const exterior = triangles(train.getObjectByName(`car-${car.index}`)!);
      assert.ok(exterior + b.triangles <= CAR_TRIANGLES, `${kind} car ${car.index} (${car.type}): ${exterior} + ${b.triangles} triangles`);
      assert.ok(b.group.children.length <= INTERIOR_DRAWS, `${kind} car ${car.index}: ${b.group.children.length} draws`);
      assert.equal(b.triangles, triangles(b.group));
    }
  }
});

test('the seat count of every car type is the seat map\'s, at a pitch a passenger fits', () => {
  for (const kind of TRAIN_KINDS) {
    const map = SEAT_MAPS[kind];
    assert.ok(map, `${kind} has a seat map`);
    const cars = trainLayout(kind).cars;
    assert.equal(map.cars.length, cars.length);
    let standard = 0, first = 0;
    cars.forEach((car, i) => {
      const lay = layoutCar(kind, car);
      const want = map.cars[i]!;
      const got = { standard: lay.seats.filter((s) => s.cls === 'standard').length, first: lay.seats.filter((s) => s.cls === 'first').length };
      assert.deepEqual(got, { standard: want.standard, first: want.first }, `${kind} car ${i} (${car.type})`);
      standard += got.standard; first += got.first;
      lay.pitch.forEach((p, k) => { if (p > 0) assert.ok(p >= FIT.minPitch && p <= FIT.maxPitch, `${kind} car ${i} saloon ${k}: pitch ${p.toFixed(3)} m`); });
      // every seat stands in a saloon of its class, clear of the vestibules
      for (const s of lay.seats) {
        const z = lay.zones.find((q) => q.kind === 'saloon' && s.s > q.s0 && s.s < q.s1);
        assert.ok(z && z.cls === s.cls, `${kind} car ${i}: a ${s.cls} seat at s ${s.s.toFixed(2)} is in a ${z?.cls ?? 'no'} saloon`);
      }
      // no two seats overlap
      for (let a = 0; a < lay.seats.length; a++) for (let b = a + 1; b < lay.seats.length; b++) {
        const p = lay.seats[a]!, q = lay.seats[b]!;
        assert.ok(Math.abs(p.x - q.x) > 0.4 || Math.abs(p.s - q.s) > 0.5, `${kind} car ${i}: seats ${a} and ${b} overlap`);
      }
    });
    assert.equal(standard, map.standard, `${kind} standard total`);
    assert.equal(first, map.first, `${kind} first total`);
    void fitFor;
  }
});

test('cutting a hole keeps the rest of a face exactly as drawn: the same area less the hole, the same uv at the same place', () => {
  // one quad of skin on the right side, x = 1.33, z 0..10, y 1..3, uv = (z / 10, (y - 1) / 2)
  const g = new THREE.BufferGeometry();
  const P = [[1.33, 1, 0], [1.33, 3, 0], [1.33, 3, 10], [1.33, 1, 0], [1.33, 3, 10], [1.33, 1, 10]];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P.flat(), 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(P.flatMap(() => [1, 0, 0]), 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(P.flatMap(([, y, z]) => [z! / 10, (y! - 1) / 2]), 2));
  const hole: Opening = { side: 1, z0: 2, z1: 4, y0: 1.5, y1: 2.5 };
  const cut = cutOpenings(g, [hole, { side: -1, z0: 5, z1: 9, y0: 1, y1: 3 }], 1.3);
  const pos = cut.getAttribute('position'), uv = cut.getAttribute('uv');
  let area = 0;
  for (let i = 0; i < pos.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(pos, i), b = new THREE.Vector3().fromBufferAttribute(pos, i + 1), c = new THREE.Vector3().fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    area += n.length() / 2;
    assert.ok(n.x > 0, 'every piece still faces out');
    for (let k = 0; k < 3; k++) {
      const z = pos.getZ(i + k), y = pos.getY(i + k);
      assert.ok(Math.abs(uv.getX(i + k) - z / 10) < 1e-6 && Math.abs(uv.getY(i + k) - (y - 1) / 2) < 1e-6, 'uv follows the place');
      const m = new THREE.Vector3().addVectors(a, b).add(c).divideScalar(3);
      assert.ok(!(m.z > 2 && m.z < 4 && m.y > 1.5 && m.y < 2.5), 'nothing is left in the hole');
    }
  }
  assert.ok(Math.abs(area - (20 - 2)) < 1e-6, `area ${area}`);
  // the left side's opening does not touch a right-side face; a face that does not lie on the side is copied as it is
  const none = cutOpenings(g, [], 1.3);
  assert.deepEqual([...none.getAttribute('position').array], [...g.getAttribute('position').array]);
  assert.equal(subtractRect([[0, 0, 0], [0, 1, 0], [0, 1, 1]], { z0: 5, z1: 6, y0: 5, y1: 6 }).length, 1);
});

test('the exterior is untouched: the cut copy keeps every triangle that is not on a window, and nothing changes until a car is in reach', () => {
  const train = buildTrain('lner9');
  const car = trainLayout('lner9').cars[3]!;
  const b = at300.buildInterior('lner9', car);
  const detail = train.getObjectByName('car-3')!.getObjectByName('body-detail') as THREE.Mesh;
  const before = [...detail.geometry.getAttribute('position').array];
  const cut = cutOpenings(detail.geometry, b.openings, at300.SKIN - 0.03);
  assert.deepEqual([...detail.geometry.getAttribute('position').array], before, 'the shared geometry is not changed');
  // the triangles off the car's side (roof, skirts, ends, bogies) are copied in order, bit for bit
  const key = (g: THREE.BufferGeometry, i: number): string => [0, 1, 2].map((k) => [...new THREE.Vector3().fromBufferAttribute(g.getAttribute('position'), i + k).toArray()].join(',')).join('|');
  const keep = new Set<string>();
  for (let i = 0; i < cut.getAttribute('position').count; i += 3) keep.add(key(cut, i));
  let off = 0, kept = 0;
  const pos = detail.geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i += 3) {
    const xs = [0, 1, 2].map((k) => Math.abs(pos.getX(i + k)));
    if (Math.min(...xs) < at300.SKIN - 0.03) { off++; if (keep.has(key(detail.geometry, i))) kept++; }
  }
  assert.ok(off > 500);
  assert.equal(kept, off);
});
