import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WV_EMU_FIGURES, WV_EMU_KINDS, WV_EMU_SPECS, wvEmuLayout } from '../../core/train-wv-emu.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { lensLook, setTrainLampState } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { buildWvEmuTrain, disposeWvEmuTrain, SR_SALTIRE, wvEmuFormation, wvEmuPlan } from '../src/train-wv-emu.ts';
import { SPLIT_DEPTH, splitTri } from '../src/train-wv-emu-parts.ts';
import type { Look } from '../src/train-wv-emu-parts.ts';
import type { V3 } from '../src/train-geom.ts';

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

// --- round 2: the livery cut along its edges, the CAF bogie, the 334's Saltire, the two 397 cab cars ---

const area = (p: [V3, V3, V3]): number => {
  const u: V3 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]];
  const v: V3 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
};

test('the livery is cut along its edges: every piece lies on one side of a boundary, in that side\'s colour, and the pieces tile the triangle', () => {
  const n: [V3, V3, V3] = [[0, 0, 1], [0, 0, 1], [0, 0, 1]];
  const tri: [V3, V3, V3] = [[0, 0, 0], [1.5, 0, 0], [0, 1, 0]];
  // a straight boundary is cut exactly; a region's corner is found by quartering, so it may leave at most two of the finest pieces straddling it
  const cases: [string, (q: V3) => Look, number][] = [
    ['a slanted line', (q) => (q[1] > 0.3 + 0.2 * q[0] ? 1 : 2), 0],
    ['a thin band across', (q) => (q[1] > 0.42 && q[1] < 0.5 ? 3 : 4), 0],
    ['a corner (a window\'s)', (q) => (q[0] > 0.4 && q[1] > 0.25 ? 'glass' : 5), 2],
  ];
  const leaf = area(tri) / 4 ** SPLIT_DEPTH;
  for (const [name, look, corners] of cases) {
    const out: { p: [V3, V3, V3]; l: Look }[] = [];
    splitTri(tri, n, look, (p, _n, l) => out.push({ p, l }));
    assert.ok(Math.abs(out.reduce((a, t) => a + area(t.p), 0) - area(tri)) < 1e-9, `${name}: the pieces cover the triangle exactly`);
    // each piece's points (pulled 1 mm toward its middle) are all of the piece's colour: no piece straddles an edge by more than a millimetre
    const straddle = out.filter(({ p, l }) => {
      if (area(p) < 1e-7) return false;
      const c: V3 = [(p[0][0] + p[1][0] + p[2][0]) / 3, (p[0][1] + p[1][1] + p[2][1]) / 3, 0];
      return p.some((q) => {
        const d = Math.hypot(c[0] - q[0], c[1] - q[1]);
        const k = Math.min(1, 0.001 / Math.max(d, 1e-9));
        return look([q[0] + (c[0] - q[0]) * k, q[1] + (c[1] - q[1]) * k, 0]) !== l;
      });
    });
    assert.ok(straddle.length <= corners, `${name}: ${straddle.length} of ${out.length} pieces straddle a boundary (${corners} allowed)`);
    assert.ok(straddle.every(({ p }) => area(p) <= leaf + 1e-12), `${name}: a straddling piece is bigger than the finest quarter`);
  }
});

test('the 397 runs on its own CAF bogie with round wheels; the 334 keeps the shared one', () => {
  const style = (kind: 'sr334x3' | 'tpe397x5'): unknown[] => {
    const root = buildWvEmuTrain(kind);
    const out: unknown[] = [];
    root.traverse((o) => { if (o.name === 'bogie-mesh' && o.userData.lod === 'near') out.push(o.userData.style ?? 'shared'); });
    return [...new Set(out)];
  };
  assert.deepEqual([style('sr334x3'), style('tpe397x5')], [['shared'], ['caf']]);
  // a wheel's rim is a circle of at least 40 sides (the round-1 bogie's wheels were conspicuous polygons)
  const root = buildWvEmuTrain('tpe397x5');
  const mesh = (root.getObjectByName('bogie-0-0') as THREE.Object3D).getObjectByName('bogie-mesh') as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position');
  const r = WV_EMU_FIGURES.civity.wheelDiameter.value / 2;
  const rim = new Set<string>();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) - r;
    const z = pos.getZ(i) - WV_EMU_FIGURES.civity.wheelbase.value / 2;
    if (Math.abs(Math.hypot(y, z) - r) < 1e-4 && pos.getX(i) > 0) rim.add(Math.atan2(y, z).toFixed(3));
  }
  assert.ok(rim.size >= 40, `${rim.size} rim directions`);
});

test('every 334 car carries the Saltire X on both sides, and the 397\'s two cab cars are not the same car', () => {
  const pale = col(SR_SALTIRE);
  const root = buildWvEmuTrain('sr334x3');
  assert.deepEqual(root.children.map((car) => {
    const m = car.getObjectByName('body-detail') as THREE.Mesh;
    const c = m.geometry.getAttribute('color');
    const p = m.geometry.getAttribute('position');
    const sides = new Set<number>();
    for (let i = 0; i < c.count; i++) if (Math.abs(c.getX(i) - pale.r) < 1e-6 && Math.abs(c.getY(i) - pale.g) < 1e-6 && Math.abs(c.getZ(i) - pale.b) < 1e-6) sides.add(Math.sign(p.getX(i)));
    return [...sides].sort();
  }), [[-1, 1], [-1, 1], [-1, 1]]);
  const [first, , , , standard] = wvEmuLayout('tpe397x5').cars;
  const a = wvEmuPlan('tpe397x5', first as never);
  const b = wvEmuPlan('tpe397x5', standard as never);
  assert.notEqual(a.windows.length, b.windows.length, 'DMFLW and DMSL glaze differently');
  assert.ok(a.windows.every(([s0, s1]) => s1 - s0 > 1.7) && b.windows.every(([s0, s1]) => s1 - s0 < 1.4), 'first-class windows are the large ones');
});
