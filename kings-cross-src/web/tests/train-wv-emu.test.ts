import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { WV_EMU_FIGURES, WV_EMU_KINDS, WV_EMU_SPECS, wvEmuLayout } from '../../core/train-wv-emu.ts';
import { EDINBURGH_FLEET } from '../src/edinburgh-fleet.ts';
import { lensLook, SERVICE_LAMPS, setTrainLampState } from '../src/train.ts';
import type { LensRole } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { buildWvEmuTrain, disposeWvEmuTrain, MARKER, SR_DOT, SR_SALTIRE, wvEmuBody, WV_END_GAP, wvEmuFormation, wvEmuPlan } from '../src/train-wv-emu.ts';
import { CAF, CLUSTER_BAND, J_AIR, MOTOR, SPLIT_DEPTH, SPRING_UNIT, splitTri } from '../src/train-wv-emu-parts.ts';
import { WIPER } from '../src/train-face.ts';
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

test('the cab lamps switch with setTrainLampState: white at the front in service, red at the rear, reversed, back, and off', () => {
  for (const kind of WV_EMU_KINDS) {
    const root = buildWvEmuTrain(kind);
    const detailAt = (end: 'front' | 'rear'): THREE.Mesh => meshes(root).find((x) => x.name === 'body-detail' && x.userData.lamps?.end === end) as THREE.Mesh;
    // every vertex of every lens, colour and glow tag: a lens shows one look, or 'mixed'
    const look = (end: 'front' | 'rear'): string[] => {
      const m = detailAt(end);
      const c = m.geometry.getAttribute('color') as THREE.BufferAttribute;
      const g = m.geometry.getAttribute('aGlow') as THREE.BufferAttribute;
      const lenses = m.userData.lamps.lenses as { role: LensRole; v0: number; v1: number }[];
      assert.ok(lenses.length >= 4 && lenses.every((l) => l.v1 > l.v0), `${kind} ${end} has its lenses`);
      return lenses.map((l) => {
        const at = (v: number): string => `${c.getX(v).toFixed(4)},${c.getY(v).toFixed(4)},${c.getZ(v).toFixed(4)}/${g.getX(v)}`;
        const first = at(l.v0);
        for (let v = l.v0; v < l.v1; v++) if (at(v) !== first) return `${l.role}:mixed`;
        return `${l.role}:${first}`;
      });
    };
    const expect = (end: 'front' | 'rear', mode: 'head' | 'tail' | 'off'): string[] =>
      (detailAt(end).userData.lamps.lenses as { role: LensRole }[]).map((l) => {
        const k = lensLook(l.role, mode);
        const c = col(k.hex);
        return `${l.role}:${Math.fround(c.r).toFixed(4)},${Math.fround(c.g).toFixed(4)},${Math.fround(c.b).toFixed(4)}/${k.glow}`;
      });
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'head'), expect('rear', 'tail')], `${kind} in service`);
    setTrainLampState(root, { front: 'tail', rear: 'head' });
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'tail'), expect('rear', 'head')], `${kind} reversed`);
    setTrainLampState(root, SERVICE_LAMPS);
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'head'), expect('rear', 'tail')], `${kind} back in service`);
    setTrainLampState(root, { front: 'off', rear: 'off' });
    assert.deepEqual([look('front'), look('rear')], [expect('front', 'off'), expect('rear', 'off')], `${kind} off`);
    assert.ok(look('front').every((l) => l.endsWith('/0')), `${kind}: nothing glows with the lamps off`);
    assert.notDeepEqual(expect('front', 'head'), expect('front', 'tail'), 'the two states differ');
  }
  // the 397's hood marker over the display is a lens too (it switched in no state before round 3): three white-when-leading lenses a cab, two headlights and it
  const root = buildWvEmuTrain('tpe397x5');
  const lenses = (meshes(root).find((x) => x.name === 'body-detail' && x.userData.lamps?.end === 'front') as THREE.Mesh).userData.lamps.lenses as { role: LensRole }[];
  assert.deepEqual(lenses.map((l) => l.role).sort(), ['head', 'head', 'head', 'marker', 'marker']);
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

test('each unit runs on its own bogie with round wheels: the 397 on the CAF inside frame, the 334 on its outside frame', () => {
  const style = (kind: 'sr334x3' | 'tpe397x5'): unknown[] => {
    const root = buildWvEmuTrain(kind);
    const out: unknown[] = [];
    root.traverse((o) => { if (o.name === 'bogie-mesh' && o.userData.lod === 'near') out.push(o.userData.style ?? 'shared'); });
    return [...new Set(out)];
  };
  assert.deepEqual([style('sr334x3'), style('tpe397x5')], [['juniper'], ['caf']]);
  // a wheel's rim is a circle of at least 40 sides (the round-1 bogies' wheels were conspicuous polygons; round 2 left the 334's so)
  for (const [kind, family] of [['tpe397x5', 'civity'], ['sr334x3', 'juniper']] as const) {
    const root = buildWvEmuTrain(kind);
    const mesh = (root.getObjectByName('bogie-0-0') as THREE.Object3D).getObjectByName('bogie-mesh') as THREE.Mesh;
    const pos = mesh.geometry.getAttribute('position');
    const r = WV_EMU_FIGURES[family].wheelDiameter.value / 2;
    const rim = new Set<string>();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) - r;
      const z = pos.getZ(i) - WV_EMU_FIGURES[family].wheelbase.value / 2;
      if (Math.abs(Math.hypot(y, z) - r) < 1e-4 && pos.getX(i) > 0) rim.add(Math.atan2(y, z).toFixed(3));
    }
    assert.ok(rim.size >= 40, `${kind}: ${rim.size} rim directions`);
  }
});

test('the 334 bogie is dark, as scotrail334_07 shows it: no part of its frame or wheels is lighter than a dark grey', () => {
  const root = buildWvEmuTrain('sr334x3');
  const mesh = (root.getObjectByName('bogie-0-0') as THREE.Object3D).getObjectByName('bogie-mesh') as THREE.Mesh;
  const c = mesh.geometry.getAttribute('color');
  // (the damper is the one pale part, a grey rod; everything else is under a fifth of full brightness, linear, after the builder's light gain)
  let light = 0;
  for (let i = 0; i < c.count; i++) if (Math.max(c.getX(i), c.getY(i), c.getZ(i)) > col(0x5a5a5a).r) light++;
  // (built: 3% of vertices, all the damper's; a frame in the round-2 grey-brown slab's light tone puts it near 10%)
  assert.ok(light / c.count < 0.05, `${light} of ${c.count} bogie vertices are lighter than dark grey`);
});

test('the gangway bellows are closed, ribbed and within the body: no ring stands outside the end\'s outline or above the crown', () => {
  for (const kind of WV_EMU_KINDS) {
    const family = WV_EMU_SPECS[kind].family;
    const f = WV_EMU_FIGURES[family];
    const root = buildWvEmuTrain(kind);
    root.updateMatrixWorld(true);
    const car = root.getObjectByName('car-1') as THREE.Object3D;
    const gw = car.children.find((o) => o.name === 'gangway') as THREE.Object3D;
    const gz = gw.getWorldPosition(new THREE.Vector3()).z;
    const detail = car.getObjectByName('body-detail') as THREE.Mesh;
    const p = detail.geometry.getAttribute('position');
    let maxY = -Infinity;
    let maxX = 0;
    const zs = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      // (the gap only: its ends are the body's end walls, which are the body's own outline)
      if (Math.abs(p.getZ(i) - gz) > WV_END_GAP / 2 - 0.005 || p.getY(i) < 1.2) continue;
      maxY = Math.max(maxY, p.getY(i));
      maxX = Math.max(maxX, Math.abs(p.getX(i)));
      zs.add(p.getZ(i).toFixed(3));
    }
    assert.ok(maxY < f.height.value - 0.12, `${kind}: the bellows' crown ${maxY.toFixed(3)} stands within the roof line`);
    assert.ok(maxX <= f.bodyWidth.value / 2, `${kind}: the bellows' widest ${maxX.toFixed(3)} is within the body`);
    // ribs: many distinct rings along the gap, not the round-2 handful of pleats
    assert.ok(zs.size >= 20, `${kind}: ${zs.size} rings across the gap`);
  }
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

// --- round 4: the 397's upright cap, two-tone bellows, the 334's air spring in view, the roof cluster where the photographs show it ---

/** The triangles of a mesh whose first vertex has colour `hex`: their area-weighted normals summed, and how many. */
const paintedNormal = (m: THREE.Mesh, hex: number): { n: THREE.Vector3; count: number } => {
  const c = col(hex);
  const pos = m.geometry.getAttribute('position');
  const colr = m.geometry.getAttribute('color');
  const idx = m.geometry.index;
  const at = (k: number): number => (idx ? idx.getX(k) : k);
  const n = new THREE.Vector3();
  let count = 0;
  const total = idx ? idx.count : pos.count;
  for (let k = 0; k + 2 < total; k += 3) {
    const v = at(k);
    if (Math.abs(colr.getX(v) - c.r) > 1e-6 || Math.abs(colr.getY(v) - c.g) > 1e-6 || Math.abs(colr.getZ(v) - c.b) > 1e-6) continue;
    const a = new THREE.Vector3().fromBufferAttribute(pos, v);
    const b = new THREE.Vector3().fromBufferAttribute(pos, at(k + 1));
    const d = new THREE.Vector3().fromBufferAttribute(pos, at(k + 2));
    n.add(b.sub(a).cross(d.sub(a)));
    count++;
  }
  return { n, count };
};

test('the 397\'s display and marker stand on an upright cap: their paint faces forward more than up, so they show from the platform', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const shell = (root.getObjectByName('car-0') as THREE.Object3D).getObjectByName('body-shell') as THREE.Mesh;
  // (the leading cab faces -z; the display's lit amber, and the marker surround's pale rim, both painted on the shell)
  for (const [name, hex] of [['display', 0xe39a1c], ['marker surround', MARKER.colour]] as const) {
    const { n, count } = paintedNormal(shell, hex);
    assert.ok(count > 0, `${name} is painted on the cap`);
    const forward = -n.z;
    const up = n.y;
    assert.ok(forward > up, `${name}: its surface leans ${Math.atan2(up, forward).toFixed(2)} rad back from upright, more up than forward`);
  }
});

test('the bellows ribs read from the side: two tones alternating along the gap, deep enough to stand out', () => {
  for (const kind of WV_EMU_KINDS) {
    const b = wvEmuBody(kind);
    const root = buildWvEmuTrain(kind);
    root.updateMatrixWorld(true);
    const car = root.getObjectByName('car-1') as THREE.Object3D;
    const gw = car.children.find((o) => o.name === 'gangway') as THREE.Object3D;
    const gz = gw.getWorldPosition(new THREE.Vector3()).z;
    const detail = car.getObjectByName('body-detail') as THREE.Mesh;
    const p = detail.geometry.getAttribute('position');
    const c = detail.geometry.getAttribute('color');
    // walk the bellows' side at mid height along the gap: at each z, the outermost point's tone and how far out it stands
    const midY = b.gangway.bottom + b.gangway.height / 2;
    const byZ = new Map<string, { x: number; tone: string }>();
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(p.getZ(i) - gz) > WV_END_GAP / 2 - 0.035 || Math.abs(p.getY(i) - midY) > 0.4 || p.getX(i) < 0.5) continue;
      const key = p.getZ(i).toFixed(3);
      const tone = c.getX(i).toFixed(3);
      const was = byZ.get(key);
      if (!was || p.getX(i) > was.x) byZ.set(key, { x: p.getX(i), tone });
    }
    const along = [...byZ.entries()].sort((a, d) => +a[0] - +d[0]).map(([, v]) => v);
    let changes = 0;
    for (let k = 1; k < along.length; k++) if ((along[k] as { tone: string }).tone !== (along[k - 1] as { tone: string }).tone) changes++;
    const xs = along.map((v) => v.x);
    const relief = Math.max(...xs) - Math.min(...xs);
    // (each rib changes tone twice; the window holds most of the ribs of both cars' halves)
    assert.ok(changes >= b.gangway.ribs * 2 - 2, `${kind}: ${changes} changes of tone along the gap`);
    assert.ok(relief >= 0.04, `${kind}: the ribs stand ${relief.toFixed(3)} m proud of the folds`);
  }
});

test('the 334\'s air spring shows: it stands outside the underframe\'s width, under the body', () => {
  const root = buildWvEmuTrain('sr334x3');
  const mesh = (root.getObjectByName('bogie-0-0') as THREE.Object3D).getObjectByName('bogie-mesh') as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position');
  const c = mesh.geometry.getAttribute('color');
  const air = col(J_AIR);
  let outside = 0;
  for (let i = 0; i < pos.count; i++) {
    if (Math.abs(c.getX(i) - air.r) > 1e-6 || Math.abs(c.getY(i) - air.g) > 1e-6) continue;
    // (the underframe's slab is 0.95 m each side of the middle, from 0.18 m under the floor up)
    if (Math.abs(pos.getX(i)) > 0.95 && pos.getY(i) < wvEmuBody('sr334x3').floor - 0.18) outside++;
  }
  assert.ok(outside >= 16, `${outside} air-spring vertices stand clear of the underframe`);
});

test('the 397\'s roof cluster stands only where the photographs show it: at the pantograph end of each pantograph car', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const band = col(CLUSTER_BAND);
  const ends = wvEmuLayout('tpe397x5').cars.map((car): [string[], string | null] => {
    const m = (root.getObjectByName(`car-${car.index}`) as THREE.Object3D).getObjectByName('body-detail') as THREE.Mesh;
    const p = m.geometry.getAttribute('position');
    const c = m.geometry.getAttribute('color');
    const at = new Set<string>();
    for (let i = 0; i < p.count; i++) {
      if (Math.abs(c.getX(i) - band.r) > 1e-6 || Math.abs(c.getY(i) - band.g) > 1e-6 || Math.abs(c.getZ(i) - band.b) > 1e-6) continue;
      at.add(p.getZ(i) < (car.start + car.end) / 2 ? 'start' : 'end');
    }
    const pan = car.pantograph ? ((car.pantograph[0] + car.pantograph[1]) / 2 < (car.start + car.end) / 2 ? 'start' : 'end') : null;
    return [[...at].sort(), pan];
  });
  assert.deepEqual(ends.map(([at]) => at), ends.map(([, pan]) => (pan ? [pan] : [])));
  assert.deepEqual(ends.map(([, pan]) => pan !== null), [false, true, false, true, false]);
});

/** a mesh's vertices in one colour, in the mesh's own space */
const inColour = (m: THREE.Mesh, hex: number): THREE.Vector3[] => {
  const c = col(hex);
  const p = m.geometry.getAttribute('position');
  const k = m.geometry.getAttribute('color');
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(k.getX(i) - c.r) < 1e-6 && Math.abs(k.getY(i) - c.g) < 1e-6 && Math.abs(k.getZ(i) - c.b) < 1e-6) out.push(new THREE.Vector3().fromBufferAttribute(p, i));
  }
  return out;
};
const nearBogie = (root: THREE.Object3D, name: string): THREE.Mesh => (root.getObjectByName(name) as THREE.Object3D).getObjectByName('bogie-mesh') as THREE.Mesh;

test('the 397\'s motor bogies differ from its trailer bogies at a glance: a motor shows between the arms, under the damper', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const layout = wvEmuLayout('tpe397x5');
  for (const car of layout.cars) {
    for (const k of [0, 1] as const) {
      // (the motor's end, low in the bogie's middle where its side is open: under 0.62 m and between the arms' pivots)
      const shown = inColour(nearBogie(root, `bogie-${car.index}-${k}`), MOTOR).filter((v) => v.y < 0.62 && Math.abs(v.z) < 0.7 && Math.abs(v.x) > 0.55);
      if (car.motor[k]) assert.ok(shown.length >= 28, `car ${car.index} bogie ${k} is a motor bogie, but only ${shown.length} motor vertices show`);
      else assert.equal(shown.length, 0, `car ${car.index} bogie ${k} is a trailer bogie`);
    }
  }
});

test('the 397\'s primary spring shows in each cast arm, outside the wheel\'s face, on both sides of every bogie', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const spring = inColour(nearBogie(root, 'bogie-1-0'), SPRING_UNIT);
  // (the wheel's face is 0.79 m out; four arms, each with its spring unit's face and sides)
  for (const sx of [-1, 1]) for (const zs of [-1, 1]) {
    const here = spring.filter((v) => v.x * sx > 0.85 && v.z * zs > 0);
    assert.ok(here.length >= 8, `the arm at x ${sx}, z ${zs} shows ${here.length} spring vertices`);
  }
});

test('the 397\'s bracket hangs from the body: its top meets the underframe right over it, and it is a large one', () => {
  const root = buildWvEmuTrain('tpe397x5');
  root.updateMatrixWorld(true);
  const car = root.getObjectByName('car-1') as THREE.Object3D;
  const body = ['body-shell', 'body-detail'].map((n) => car.getObjectByName(n) as THREE.Mesh);
  const bogie = root.getObjectByName('bogie-1-0') as THREE.Object3D;
  const B = CAF.bracket;
  assert.ok(B.y1 - B.y0 >= 0.25 && B.z1 - B.z0 >= 0.3, `the bracket is ${(B.y1 - B.y0).toFixed(2)} m deep and ${(B.z1 - B.z0).toFixed(2)} m wide`);
  for (const sx of [-1, 1]) {
    const top = bogie.localToWorld(new THREE.Vector3(sx * 0.79, B.y1 - 0.005, (B.z0 + B.z1) / 2));
    const hits = new THREE.Raycaster(top, new THREE.Vector3(0, 1, 0), 0, 2).intersectObjects(body, false);
    assert.ok(hits.length > 0 && (hits[0] as THREE.Intersection).distance < 0.04, `side ${sx}: the body is ${hits[0]?.distance.toFixed(3) ?? 'nowhere'} m over the bracket's top`);
  }
});

test('the 397\'s cap: a near-full-width display, an unbroken orange line, a wiper that follows the screen, and the marker housing widest at its foot', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const car = root.getObjectByName('car-0') as THREE.Object3D;
  const shell = car.getObjectByName('body-shell') as THREE.Mesh;
  const detail = car.getObjectByName('body-detail') as THREE.Mesh;
  // the display (tpe397-01) runs nearly the screen's width: its dark field out past 0.85 m each side of the middle
  const display = inColour(shell, 0x111317);
  assert.ok(Math.min(...[-1, 1].map((sx) => Math.max(...display.map((v) => v.x * sx)))) > 0.85, 'the display reaches 0.85 m each side');
  // the orange line along the screen's top: a strip out to more than a metre each side, no gap wider than one of its pieces
  const xs = inColour(detail, 0xd0603a).map((v) => v.x).sort((a, b) => a - b);
  assert.ok(xs.length > 0 && (xs[0] as number) < -1 && (xs[xs.length - 1] as number) > 1, 'the orange line runs out past a metre each side');
  for (let i = 1; i < xs.length; i++) assert.ok((xs[i] as number) - (xs[i - 1] as number) < 0.05, `a ${((xs[i] as number) - (xs[i - 1] as number)).toFixed(3)} m gap in the orange line at x ${(xs[i] as number).toFixed(2)}`);
  // the wiper is laid in short pieces, each on the face where it lies, so it bends with the screen: no edge of it longer than a piece
  const p = detail.geometry.getAttribute('position');
  const k = detail.geometry.getAttribute('color');
  const w = col(WIPER);
  const idx = detail.geometry.index;
  const at = (j: number): number => (idx ? idx.getX(j) : j);
  let pieces = 0;
  for (let t = 0; t + 2 < (idx ? idx.count : p.count); t += 3) {
    const i = at(t);
    if (Math.abs(k.getX(i) - w.r) > 1e-6 || Math.abs(k.getY(i) - w.g) > 1e-6 || Math.abs(k.getZ(i) - w.b) > 1e-6) continue;
    pieces++;
    const v = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(p, at(t + j)));
    for (const [a, b] of [[0, 1], [1, 2], [2, 0]] as const) assert.ok((v[a] as THREE.Vector3).distanceTo(v[b] as THREE.Vector3) < 0.1, 'a wiper edge longer than a piece');
  }
  assert.ok(pieces >= 20, `${pieces} wiper triangles`);
  // the marker's housing (tpe397-01): its pale rim widest where it stands on the display, narrowing to its top
  const rim = inColour(shell, MARKER.colour);
  const width = (y: number): number => Math.max(...rim.filter((v) => Math.abs(v.y - y) < 0.02).map((v) => Math.abs(v.x)));
  assert.ok(width(MARKER.foot + 0.01) > width(MARKER.top - 0.01) + 0.08, `the housing is ${width(MARKER.foot + 0.01).toFixed(2)} m at its foot, ${width(MARKER.top - 0.01).toFixed(2)} m at its top`);
});

// --- round 5: the 334's windows and doors as the photographs count them ---

test('the 334\'s sides as scotrail334_01, _02 and _06 count them: a driving car glazes narrow and wide, five, two; the PTOS none, five, two', () => {
  for (const car of wvEmuLayout('sr334x3').cars) {
    const plan = wvEmuPlan('sr334x3', car);
    const [d1, d2] = plan.doors as [number, number];
    const before = plan.windows.filter(([, w1]) => w1 < d1);
    const between = plan.windows.filter(([w0, w1]) => w0 > d1 && w1 < d2);
    const beyond = plan.windows.filter(([w0]) => w0 > d2);
    assert.equal(between.length, 5, `${car.type}: five windows between the doors`);
    assert.equal(beyond.length, 2, `${car.type}: two windows beyond the second door`);
    if (car.cab) {
      assert.equal(before.length, 2, `${car.type}: two windows before the first door`);
      const [narrow, wide] = before as [[number, number], [number, number]];
      assert.ok(narrow[1] - narrow[0] < 0.7 && wide[1] - wide[0] > 1.0, `${car.type}: the narrow window, then the wide one`);
      // (the projective fit puts the first door 6.0 to 6.5 m behind the face, the second 4.6 to 4.9 m from the inner end)
      assert.ok(d1 > 5.9 && d1 < 6.7 && car.length - d2 > 4.5 && car.length - d2 < 5.0, `${car.type}: doors at ${d1}, ${d2}`);
    } else {
      assert.equal(before.length, 0, 'the PTOS: blanked panels, not windows, before its first door');
      assert.ok(d1 > 5.3 && d1 < 5.9 && car.length - d2 > 4.3 && car.length - d2 < 4.8, `PTOS: doors at ${d1}, ${d2}`);
    }
  }
});

test('the 334\'s dot bands and Saltire stop at the glass: no dot or bar is laid over a window', () => {
  const root = buildWvEmuTrain('sr334x3');
  const b = wvEmuBody('sr334x3');
  for (const car of wvEmuLayout('sr334x3').cars) {
    const plan = wvEmuPlan('sr334x3', car);
    const dir = car.cab === 'rear' ? -1 : 1;
    const base = car.cab === 'rear' ? car.end : car.start;
    const detail = (root.getObjectByName(`car-${car.index}`) as THREE.Object3D).getObjectByName('body-detail') as THREE.Mesh;
    for (const hex of [SR_DOT, SR_SALTIRE]) {
      // (points across each triangle, not only its corners: a Saltire bar's corners are above and below the window band)
      const pos = detail.geometry.getAttribute('position');
      const colr = detail.geometry.getAttribute('color');
      const idx = detail.geometry.index;
      const at = (j: number): number => (idx ? idx.getX(j) : j);
      const c = col(hex);
      const points: THREE.Vector3[] = [];
      for (let t = 0; t + 2 < (idx ? idx.count : pos.count); t += 3) {
        const i = at(t);
        if (Math.abs(colr.getX(i) - c.r) > 1e-6 || Math.abs(colr.getY(i) - c.g) > 1e-6 || Math.abs(colr.getZ(i) - c.b) > 1e-6) continue;
        const [p0, p1, p2] = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, at(t + j))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
        for (let u = 0; u <= 8; u++) for (let w = 0; w + u <= 8; w++) points.push(p0.clone().multiplyScalar((8 - u - w) / 8).addScaledVector(p1, u / 8).addScaledVector(p2, w / 8));
      }
      const over = points.filter((v) => {
        const sAt = (v.z - base) * dir;
        return Math.abs(v.x) > 1.2 && v.y > b.windowY[0] + 0.01 && v.y < b.windowY[1] - 0.01 && plan.windows.some(([w0, w1]) => sAt > w0 + 0.01 && sAt < w1 - 0.01);
      });
      assert.equal(over.length, 0, `car ${car.index}: ${over.length} ${hex === SR_DOT ? 'dot' : 'Saltire'} vertices over a window`);
    }
  }
});

test('the 397\'s roof cluster\'s cables run on to the pantograph\'s base, and no further', () => {
  const root = buildWvEmuTrain('tpe397x5');
  const crown = wvEmuBody('tpe397x5').crown;
  for (const car of wvEmuLayout('tpe397x5').cars) {
    if (!car.pantograph) continue;
    const nearStart = (car.pantograph[0] + car.pantograph[1]) / 2 < (car.start + car.end) / 2;
    const baseZ = nearStart ? car.pantograph[0] : car.pantograph[1];
    const endZ = nearStart ? car.start : car.end;
    const detail = (root.getObjectByName(`car-${car.index}`) as THREE.Object3D).getObjectByName('body-detail') as THREE.Mesh;
    // (the cables: the cluster's dark rods low on the crown, between the car's end and the pantograph)
    const cable = inColour(detail, 0x1c1d21).filter((v) => v.y > crown - 0.05 && v.y < crown + 0.1 && Math.abs(v.x) < 0.3 && (v.z - endZ) * (baseZ - endZ) > 0);
    const reach = Math.max(...cable.map((v) => Math.abs(v.z - endZ)));
    const toBase = Math.abs(baseZ - endZ);
    assert.ok(Math.abs(reach - toBase) < 0.03, `car ${car.index}: the cables reach ${reach.toFixed(2)} m from the end, the pantograph's base is at ${toBase.toFixed(2)} m`);
  }
});

test('the 334 driving car\'s roof as scotrail334_02 shows it from above: plain but for a low unit behind the cab and one louvred unit over the first door', () => {
  const root = buildWvEmuTrain('sr334x3');
  const b = wvEmuBody('sr334x3');
  for (const car of wvEmuLayout('sr334x3').cars.filter((c) => c.cab)) {
    const detail = (root.getObjectByName(`car-${car.index}`) as THREE.Object3D).getObjectByName('body-detail') as THREE.Mesh;
    // (points across each cover triangle: a unit's corners alone leave gaps along it)
    const pos = detail.geometry.getAttribute('position');
    const colr = detail.geometry.getAttribute('color');
    const idx = detail.geometry.index;
    const at = (j: number): number => (idx ? idx.getX(j) : j);
    const c = col(b.cover);
    const zs: number[] = [];
    for (let t = 0; t + 2 < (idx ? idx.count : pos.count); t += 3) {
      const i = at(t);
      if (Math.abs(colr.getX(i) - c.r) > 1e-6 || Math.abs(colr.getY(i) - c.g) > 1e-6 || Math.abs(colr.getZ(i) - c.b) > 1e-6) continue;
      const [p0, p1, p2] = [0, 1, 2].map((j) => new THREE.Vector3().fromBufferAttribute(pos, at(t + j))) as [THREE.Vector3, THREE.Vector3, THREE.Vector3];
      for (let u = 0; u <= 8; u++) for (let w = 0; w + u <= 8; w++) {
        const q = p0.clone().multiplyScalar((8 - u - w) / 8).addScaledVector(p1, u / 8).addScaledVector(p2, w / 8);
        if (q.y > b.crown - 0.05) zs.push(q.z);
      }
    }
    zs.sort((p, q) => p - q);
    // (the units, as runs of cover vertices along the car with more than half a metre between them)
    const units: [number, number][] = [];
    for (const z of zs) {
      const last = units[units.length - 1];
      if (last && z - last[1] < 0.5) last[1] = z;
      else units.push([z, z]);
    }
    assert.equal(units.length, 2, `car ${car.index}: ${units.length} roof units: ${units.map(([a, c]) => `${a.toFixed(2)}..${c.toFixed(2)}`).join(" ")}`);
    const dir = car.cab === 'rear' ? -1 : 1;
    const base = car.cab === 'rear' ? car.end : car.start;
    const door = base + dir * (wvEmuPlan('sr334x3', car).doors[0] as number);
    assert.ok(units.some(([z0, z1]) => z0 <= door && door <= z1 && z1 - z0 > 2), `car ${car.index}: the louvred unit stands over the first door`);
  }
});
