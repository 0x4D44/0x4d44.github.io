import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WV_EMU_FIGURES, WV_EMU_KINDS, WV_EMU_SPECS, wvEmuLayout } from '../../core/train-wv-emu.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { lensLook, setTrainLampState } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { buildWvEmuTrain, disposeWvEmuTrain, wvEmuFormation } from '../src/train-wv-emu.ts';

const meshes = (o: THREE.Object3D): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  o.traverse((m) => { if (m instanceof THREE.Mesh) out.push(m); });
  return out;
};
const triangles = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;

test('the builder names its cars car-<index> and their bogies bogie-<index>-<k>, in the layout\'s places', () => {
  assert.deepEqual(WV_EMU_KINDS.map((kind) => {
    const root = buildWvEmuTrain(kind);
    const l = wvEmuLayout(kind);
    return {
      name: root.name,
      cars: root.children.map((c) => c.name),
      bogies: l.cars.map((c) => c.bogies.map((z, k) => +((root.getObjectByName(`bogie-${c.index}-${k}`) as THREE.Object3D).position.z - z).toFixed(6))),
      pantographs: l.cars.map((c) => (root.getObjectByName(`car-${c.index}`) as THREE.Object3D).children.filter((o) => o.name === 'pantograph').length),
      glass: root.children.map((c) => c.children.filter((o) => o.name === 'cab-glass').length),
    };
  }), [
    { name: 'train-sr334x3', cars: ['car-0', 'car-1', 'car-2'], bogies: [[0, 0], [0, 0], [0, 0]], pantographs: [0, 1, 0], glass: [1, 0, 1] },
    { name: 'train-tpe397x5', cars: ['car-0', 'car-1', 'car-2', 'car-3', 'car-4'], bogies: [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]], pantographs: [0, 1, 0, 1, 0], glass: [1, 0, 0, 0, 1] },
  ]);
});

test('the geometry is finite and inside each car\'s span, as wide and as high as the figures (which are ASSUMED)', () => {
  for (const kind of WV_EMU_KINDS) {
    const root = buildWvEmuTrain(kind);
    const f = WV_EMU_FIGURES[WV_EMU_SPECS[kind].family];
    for (const car of wvEmuLayout(kind).cars) {
      const g = root.getObjectByName(`car-${car.index}`) as THREE.Object3D;
      assert.ok(meshes(g).every((m) => Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite)), `${kind} car ${car.index} finite`);
      const box = new THREE.Box3().setFromObject(g);
      assert.ok(box.min.z >= car.start - 1e-3 && box.max.z <= car.end + 1e-3, `${kind} car ${car.index} in [${car.start}, ${car.end}]: ${box.min.z}..${box.max.z}`);
      assert.ok(Math.abs(box.max.x - box.min.x - f.bodyWidth.value) < 0.02, `${kind} car ${car.index} width ${box.max.x - box.min.x}`);
      // the roof equipment's top (pantograph folded) is the height figure; the folded head may stand a few centimetres over it
      assert.ok(box.max.y <= f.height.value + 0.05 && box.max.y > f.height.value - 0.1, `${kind} car ${car.index} top ${box.max.y}`);
    }
  }
});

test('each car stays inside the round-5 budget: 40,000 triangles, and a fixed handful of draws', () => {
  for (const kind of WV_EMU_KINDS) {
    const root = buildWvEmuTrain(kind);
    for (const g of root.children) {
      const ms = meshes(g);
      const tris = ms.reduce((a, m) => a + triangles(m), 0);
      assert.ok(tris <= 40_000, `${kind} ${g.name}: ${tris} triangles`);
      assert.ok(ms.length <= 8, `${kind} ${g.name}: ${ms.length} meshes`);
    }
  }
});

test('the cab lamps switch with setTrainLampState: white at the front in service, red at the rear, and back', () => {
  for (const kind of WV_EMU_KINDS) {
    const root = buildWvEmuTrain(kind);
    const look = (end: 'front' | 'rear'): string[] => {
      const m = meshes(root).find((x) => x.name === 'body-detail' && x.userData.lamps?.end === end) as THREE.Mesh;
      const c = m.geometry.getAttribute('color') as THREE.BufferAttribute;
      const lenses = m.userData.lamps.lenses as { role: 'head' | 'tail'; v0: number; v1: number }[];
      assert.ok(lenses.length >= 4 && lenses.every((l) => l.v1 > l.v0), `${kind} ${end} has its lenses`);
      return lenses.map((l) => `${l.role}:${c.getX(l.v0).toFixed(4)},${c.getY(l.v0).toFixed(4)},${c.getZ(l.v0).toFixed(4)}`);
    };
    const expect = (end: 'front' | 'rear', mode: 'head' | 'tail' | 'off'): string[] => {
      const m = meshes(root).find((x) => x.name === 'body-detail' && x.userData.lamps?.end === end) as THREE.Mesh;
      return (m.userData.lamps.lenses as { role: 'head' | 'tail' }[]).map((l) => {
        const c = col(lensLook(l.role, mode).hex);
        return `${l.role}:${Math.fround(c.r).toFixed(4)},${Math.fround(c.g).toFixed(4)},${Math.fround(c.b).toFixed(4)}`;
      });
    };
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'head'), expect('rear', 'tail')], `${kind} in service`);
    setTrainLampState(root, { front: 'tail', rear: 'head' });
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'tail'), expect('rear', 'head')], `${kind} reversed`);
    assert.notDeepEqual(expect('front', 'head'), expect('front', 'tail'), 'the two states differ');
  }
});

test('disposal frees the builder\'s geometry and leaves the shared bogie geometry alone', () => {
  const root = buildWvEmuTrain('tpe397x5');
  let owned = 0; let freed = 0; let shared = 0;
  for (const m of meshes(root)) {
    if (m.name === 'bogie-mesh') m.geometry.addEventListener('dispose', () => { shared++; });
    else { owned++; m.geometry.addEventListener('dispose', () => { freed++; }); }
  }
  disposeWvEmuTrain(root);
  assert.ok(owned > 0);
  assert.equal(shared, 0);
  // geometries can be shared between meshes of one train (the pantograph's), so every owned mesh's geometry is freed at least once
  assert.ok(freed > 0 && freed <= owned);
  assert.ok(meshes(root).filter((m) => m.name !== 'bogie-mesh').every((m) => m.geometry.getAttribute('position') !== undefined));
});

test('the Waverley fleet rows: one per kind, the published codes, and a capture formation that agrees with the layout', () => {
  assert.deepEqual(WV_EMU_KINDS.map((kind) => {
    const row = EDINBURGH_FLEET.find((r) => r.kind === kind);
    const f = wvEmuFormation(kind);
    const l = wvEmuLayout(kind);
    return {
      row: row ? [row.operator, row.classes.join(), row.cars, row.layout().length === l.length, typeof row.formation] : null,
      cars: f.cars.map((c) => [c.index, c.start, c.end, c.cab]),
      doorsInside: f.cars.every((c) => c.doors.length >= 2 && c.doors.every((d) => d > c.start && d < c.end)),
      bases: [f.dimensions.lengthM.basis, f.dimensions.widthM.basis, f.dimensions.roofTopM.basis],
      roofTop: +f.roofTop.toFixed(3),
    };
  }), [
    { row: ['SR', '334', 3, true, 'function'], cars: wvEmuLayout('sr334x3').cars.map((c) => [c.index, c.start, c.end, c.cab]), doorsInside: true, bases: ['published', 'assumed', 'assumed'], roofTop: 3.77 },
    { row: ['TP', '397', 5, true, 'function'], cars: wvEmuLayout('tpe397x5').cars.map((c) => [c.index, c.start, c.end, c.cab]), doorsInside: true, bases: ['published', 'assumed', 'assumed'], roofTop: 3.8 },
  ]);
  // a rear cab's doors are measured from its own nose: the last car's first door is nearer the train's rear than its second
  const last = wvEmuFormation('sr334x3').cars[2] as { doors: readonly number[] };
  assert.ok((last.doors[0] as number) > (last.doors[1] as number));
});
