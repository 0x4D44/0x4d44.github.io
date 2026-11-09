import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { buildGraph, snap } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import { createMotion, DEFAULT_BUFFER_CLEARANCE_M, overlapM } from '../../core/motion.ts';
import type { MotionBirth, TrainView } from '../../core/motion.ts';
import { ALL_KINDS, TRAIN_SPECS, trainLayout } from '../../core/train.ts';
import { KINGS_CROSS_PLATFORM_LENGTHS_M } from '../../core/station.ts';
import { buildTrain } from '../src/train.ts';
import { carPoses, COUPLING_CLEARANCE, createLiveTrains, createTrainKinds, kindForDescription, kindForService, lengthForDescription, sampleOccupied } from '../src/trains-live.ts';
import type { FormationView } from '../src/trains-live.ts';

function fixture(curved = true, kind: (typeof ALL_KINDS)[number] = 'lner9'): { graph: Graph; train: TrainView } {
  const nodes: [number, number, number][] = [];
  for (let i = 0; i <= 60; i++) {
    const s = i * 5, a = s / 180;
    nodes.push([i + 1, curved ? 180 * (1 - Math.cos(a)) : 0, curved ? 180 * Math.sin(a) : s]);
  }
  const graph = buildGraph({ nodes, rails: [{ id: 1, nodes: nodes.map(([id]) => id), service: 'main', tunnel: false, bridge: false, layer: 0 }] });
  const length = trainLayout(kind).length;
  const occupied = [];
  let left = length;
  for (const edge of graph.edges) {
    const take = Math.min(left, edge.length);
    occupied.push({ edge, fromT: take / edge.length, toT: 0 }); left -= take;
    if (left <= 1e-8) break;
  }
  occupied.reverse();
  const train: TrainView = { id: 1, description: '1SYN', leading: { edge: graph.edges[0]!, t: 0, point: [0, 0] }, heading: Math.PI, speed: 5, lengthM: length, occupiedLengthM: length, occupied,
    state: 'moving', opacity: 1, targetBerth: 'SYNTHETIC', lastBerth: 'SYNTHETIC', blocked: false, distanceM: 0, reversals: 0 };
  return { graph, train };
}
const close = (a: number, b: number, tolerance = 1e-7): void => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
const world = (node: THREE.Object3D): THREE.Vector3 => node.getWorldPosition(new THREE.Vector3());
const materialsOf = (root: THREE.Object3D): Set<THREE.Material> => {
  const materials = new Set<THREE.Material>();
  root.traverse((node) => {
    if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  return materials;
};
const sameMembers = <T>(a: Set<T>, b: Set<T>): boolean => a.size === b.size && [...a].every((value) => b.has(value));
const sharedCount = <T>(a: Set<T>, b: Set<T>): number => [...a].filter((value) => b.has(value)).length;
const assertMaterialOpacity = (root: THREE.Object3D, opacity: number): void => {
  for (const material of materialsOf(root)) {
    close(material.opacity, opacity, 0);
    assert.equal(material.transparent, opacity < 1);
    assert.equal(material.depthWrite, opacity >= 1);
  }
};

test('live car bogie centres stay on a curved track and retain their distances behind the leading end', () => {
  const { graph, train } = fixture();
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update([train]); scene.updateMatrixWorld(true);
  const group = layer.trains()[0]!.group;
  const layout = trainLayout('lner9');
  const angles = [];
  for (const car of layout.cars) {
    const node = group.getObjectByName(`car-${car.index}`)!;
    assert.equal(node.visible, true); angles.push(node.rotation.y);
    for (const k of [0, 1]) {
      const p = world(node.getObjectByName(`bogie-${car.index}-${k}`)!);
      const snapped = snap(graph, [p.x, p.z])!;
      assert.ok(snapped.distance < 0.05);
      const before = graph.edges.slice(0, graph.edges.indexOf(snapped.edge)).reduce((sum, e) => sum + e.length, 0);
      close(before + snapped.t * snapped.edge.length, car.bogies[k]!, 0.05);
      const expected = sampleOccupied(graph, train, car.bogies[k]!)!;
      close(p.x, expected.point[0]); close(p.z, expected.point[1]);
    }
  }
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.8, 'cars must bend independently');
  layer.dispose();
});

function overlap(a: THREE.Vector2[], b: THREE.Vector2[]): boolean {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const edge = polygon[(i + 1) % polygon.length]!.clone().sub(polygon[i]!);
    const n = new THREE.Vector2(-edge.y, edge.x).normalize();
    const pa = a.map((p) => p.dot(n)), pb = b.map((p) => p.dot(n));
    if (Math.max(...pa) <= Math.min(...pb) + 1e-8 || Math.max(...pb) <= Math.min(...pa) + 1e-8) return false;
  }
  return true;
}

test('consecutive car bodies leave coupling clearance and the leading car remains at the leading end', () => {
  const { graph, train } = fixture();
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update([train]); scene.updateMatrixWorld(true);
  const group = layer.trains()[0]!.group, layout = trainLayout('lner9');
  const polygons = layout.cars.map((car) => {
    const node = group.getObjectByName(`car-${car.index}`)!;
    const front = car.start + (car.index ? COUPLING_CLEARANCE : 0);
    const rear = car.end - (car.index === layout.cars.length - 1 ? 0 : COUPLING_CLEARANCE);
    return [[-1.35, front], [1.35, front], [1.35, rear], [-1.35, rear]].map(([x, z]) => {
      const p = new THREE.Vector3(x, 0, z).applyMatrix4(node.matrixWorld); return new THREE.Vector2(p.x, p.z);
    });
  });
  for (let i = 0; i + 1 < polygons.length; i++) assert.equal(overlap(polygons[i]!, polygons[i + 1]!), false, `cars ${i} and ${i + 1} overlap`);
  const first = world(group.getObjectByName('bogie-0-0')!);
  const last = world(group.getObjectByName('bogie-8-1')!);
  assert.ok(first.length() < 5); assert.ok(last.length() > 150);
  assert.deepEqual(layer.trains()[0]!.noseWorld, [0, 0, 0]);
  layer.dispose();
});

test('straight car placement preserves the layout length and leading nose without reversing the cars', () => {
  const { graph, train } = fixture(false);
  const poses = carPoses(graph, train);
  assert.equal(poses.length, 9);
  for (const pose of poses) { close(pose.position[0], 0); close(pose.position[1], 0); close(pose.rotationY, 0); close(pose.scaleZ, 1); }
  close(sampleOccupied(graph, train, train.lengthM)!.point[1], train.lengthM);
  assert.equal(sampleOccupied(graph, train, train.lengthM + 1), null);
  assert.equal(sampleOccupied(graph, train, -1), null);
});

test('the headcode supplies the initial motion length before a physical train is born', () => {
  assert.equal(kindForDescription('1SYN'), 'lner9');
  assert.equal(kindForDescription('2SYN'), 'lner5');
  close(lengthForDescription('1SYN'), 233.7); close(lengthForDescription('2SYN'), 129.7);
});

const service = (operator: string, origin = 'KNGX', destination = 'KNGX') => ({ operator, origin, destination });
const nearestKind = (kinds: readonly (typeof ALL_KINDS)[number][], lengthM: number) => kinds.reduce((best, kind) =>
  Math.abs(trainLayout(kind).length - lengthM) < Math.abs(trainLayout(best).length - lengthM) ? kind : best);

test('platform-capped births select the nearest fitting formation within the operator fleet', () => {
  const limits = new Map([['1', 200], ['2', 90], ['3', 300]]);
  for (const [operator, platform, expected] of [
    ['GN', '1', 'gn387x8'], ['GN', '2', 'gn387x4'], ['GR', '1', 'lner5'], ['TL', '1', 'tl700x8'], ['ZZ', '1', 'lner5'],
  ] as const) {
    const kinds = createTrainKinds(() => ({ ...service(operator), platform }), { platformLimitsM: limits });
    const length = kinds.lengthM('1SYN', { id: 1, timeMs: 0 });
    assert.equal(length, trainLayout(expected).length);
    const choice = kinds.formationFor({ id: 1 });
    assert.equal(choice?.kind, expected);
    assert.equal(choice?.platform, platform);
    assert.equal(choice?.capped, true);
    assert.equal(choice?.doesNotFit, false);
    assert.match(choice?.note ?? '', /capped to platform length/);
    assert.ok(length <= limits.get(platform)!);
  }
  const uncapped = createTrainKinds(() => ({ ...service('GN'), platform: '3' }), { platformLimitsM: limits });
  assert.equal(uncapped.lengthM('2SYN', { id: 1, timeMs: 0 }), trainLayout('gn387x8').length);
  assert.equal(uncapped.formationFor({ id: 1 })?.note, undefined, 'nearest choice remains when several kinds fit');
});

test('platform-capped births choose and flag the shortest operator formation when none fits', () => {
  const kinds = createTrainKinds(() => ({ ...service('TL'), platform: '1' }), { platformLimitsM: new Map([['1', 100]]) });
  assert.equal(kinds.lengthM('1SYN', { id: 1, timeMs: 0 }), trainLayout('tl700x8').length);
  const choice = kinds.formationFor({ id: 1 });
  assert.equal(choice?.doesNotFit, true);
  assert.equal(choice?.capped, false);
  assert.equal(choice?.limitM, 100);
  assert.match(choice?.note ?? '', /shortest available.*exceeds platform length/);
  assert.equal(kindForService({ ...service('TL'), platform: '1' }, trainLayout('tl700x12').length, 100), 'tl700x8');
});

test('platform-capped defaults read OSM and published lengths while missing platform evidence preserves birth choice', () => {
  const gn9 = createTrainKinds(() => ({ ...service('GN'), platform: '9' }));
  const gn10 = createTrainKinds(() => ({ ...service('GN'), platform: '10' }));
  assert.equal(gn9.lengthM('1SYN', { id: 1, timeMs: 0 }), trainLayout('gn387x8').length);
  assert.equal(gn10.lengthM('1SYN', { id: 1, timeMs: 0 }), trainLayout('gn387x8').length);
  for (const platform of [undefined, null, '99']) {
    const kinds = createTrainKinds(() => ({ ...service('GN'), platform }));
    assert.equal(kinds.lengthM('1SYN', { id: 1, timeMs: 0 }), trainLayout('gn387x12').length);
    assert.equal(kinds.formationFor({ id: 1 })?.note, undefined);
  }
});

test('platform-capped suburban births admit eight cars and exclude twelve using published length', () => {
  for (const platform of ['9', '10']) for (const [operator, eight, twelve] of [
    ['GN', 'gn387x8', 'gn387x12'], ['TL', 'tl700x8', 'tl700x12'],
  ] as const) {
    const limit = KINGS_CROSS_PLATFORM_LENGTHS_M[platform]! - DEFAULT_BUFFER_CLEARANCE_M;
    const kinds = createTrainKinds(() => ({ ...service(operator), platform }));
    const birth = { id: 1, timeMs: 0 };
    const length = kinds.lengthM('1SYN', birth);
    assert.equal(length, trainLayout(eight).length);
    assert.ok(length <= limit);
    assert.ok(trainLayout(twelve).length > limit);
    const choice = kinds.formationFor(birth)!;
    assert.equal(choice.limitM, limit);
    assert.equal(choice.doesNotFit, false);
    assert.equal(choice.capped, true);
    assert.match(choice.note ?? '', /capped to platform length/);
  }
});

test('platform-capped birth choices and reasons stay fixed through late platforms and renames', () => {
  let platform: string | undefined;
  let reads = 0;
  const kinds = createTrainKinds(() => { reads++; return { ...service('GN'), platform }; }, { platformLimitsM: new Map([['9', 100]]) });
  const birth = { id: 1, timeMs: 0 };
  const first = kinds.lengthM('1SYN', birth);
  platform = '9';
  assert.equal(kinds.lengthM('2RENAMED', birth), first);
  assert.equal(kinds.formationFor(birth)?.platform, undefined);
  assert.equal(reads, 1);
  const next = { id: 2, timeMs: 1000 };
  assert.equal(kinds.lengthM('1SYN', next), trainLayout('gn387x4').length);
  const reason = kinds.formationFor(next);
  platform = undefined;
  assert.equal(kinds.lengthM('1NEWNAME', next), trainLayout('gn387x4').length);
  assert.deepEqual(kinds.formationFor(next), reason);
  assert.equal(reads, 2);
});

test('platform-capped rendering keeps core length and puts the frozen reason on each tooltip view', () => {
  const kinds = createTrainKinds(() => ({ ...service('GN'), platform: '1' }), { platformLimitsM: new Map([['1', 100]]) });
  const length = kinds.lengthM('1SYN', { id: 1, timeMs: 0 });
  const { graph, train } = fixture(false, 'gn387x4');
  const layer = createLiveTrains(graph, new THREE.Scene(), kinds.kindFor);
  const first: FormationView = { ...train, description: '1SYN', lengthM: length };
  layer.update([first]);
  assert.equal(layer.trains()[0]!.layout.length, length);
  assert.match(first.formationNote ?? '', /capped to platform length/);
  const later: FormationView = { ...train, description: 'RENAMED', lengthM: length };
  layer.update([later]);
  assert.equal(later.formationNote, first.formationNote, 'the tooltip reads fresh motion views each frame');
  const unknown: FormationView = { ...train, id: 2, formationNote: 'stale reason' };
  layer.update([unknown]);
  assert.equal(unknown.formationNote, undefined, 'unresolved physical ids never inherit another train\'s reason');
  layer.dispose();
});

test('service kind matching separates operator fleets before comparing consist lengths', () => {
  const lner = ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'LNER');
  const gn387 = ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'Great Northern' && /387/.test(TRAIN_SPECS[kind].classes));
  assert.equal(kindForService(service('GR'), trainLayout('lner5').length), 'lner5');
  assert.equal(kindForService(service('GR'), trainLayout('lner9').length), 'lner9');
  assert.equal(kindForService(service('HT'), trainLayout('lner5').length), 'hull5');
  assert.equal(kindForService(service('LD'), trainLayout('lner5').length), 'lumo5');
  assert.equal(kindForService(service('GN'), trainLayout('lner5').length), nearestKind(gn387, trainLayout('lner5').length));
  assert.notEqual(kindForService(service('GN'), trainLayout('lner5').length), 'lner5');
  assert.equal(kindForService(service('XX'), trainLayout('lner5').length), undefined);
  assert.equal(kindForService(undefined, trainLayout('lner5').length), undefined);
  assert.ok(lner.includes('lner5') && lner.includes('lner9'));
});

test('Great Northern formation matching uses its nearest 387 size and Moorgate endpoints select 717', () => {
  const gn387 = ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'Great Northern' && /387/.test(TRAIN_SPECS[kind].classes));
  const gn717 = ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'Great Northern' && /717/.test(TRAIN_SPECS[kind].classes));
  assert.ok(gn387.length > 0, 'the model catalogue needs at least one 387 kind');
  assert.equal(gn717.length, 1, 'the model catalogue needs one 717 kind');
  for (const kind of gn387) assert.equal(kindForService(service('GN'), trainLayout(kind).length), kind);
  assert.equal(kindForService(service('GN', 'MORGATE', 'KNGX'), trainLayout('lner5').length), gn717[0]);
  assert.equal(kindForService(service('GN', 'KNGX', 'MOORGATE'), trainLayout('lner5').length), gn717[0]);
  assert.notEqual(gn717[0], kindForService(service('GR'), trainLayout('lner5').length));
});

test('Thameslink and Grand Central match classes advertised by ALL_KINDS', () => {
  const cases = [
    ['TL', ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'Thameslink' && /700/.test(TRAIN_SPECS[kind].classes))],
    ['GC', ALL_KINDS.filter((kind) => TRAIN_SPECS[kind].operator === 'Grand Central' && /180/.test(TRAIN_SPECS[kind].classes))],
  ] as const;
  for (const [operator, kinds] of cases) {
    if (!kinds.length) assert.equal(kindForService(service(operator), 100), undefined);
    else for (const kind of kinds) assert.equal(kindForService(service(operator), trainLayout(kind).length), kind);
  }
});

test('unknown service evidence leaves kind unresolved and length uses the legacy headcode', () => {
  const resolver = createTrainKinds(() => undefined);
  const birth: MotionBirth = { id: 71, timeMs: 1234 };
  const length = resolver.lengthM('1UNKNOWN', birth);
  assert.equal(kindForService(service('ZZ'), length), undefined);
  assert.equal(length, lengthForDescription('1UNKNOWN'));
  const train = { ...fixture().train, id: birth.id, description: '1UNKNOWN', lengthM: length };
  assert.equal(resolver.kindFor(train), 'lner9');
  assert.equal(resolver.lengthM('2UNKNOWN', { id: 72, timeMs: 1234 }), lengthForDescription('2UNKNOWN'));
});

test('a physical birth freezes its schedule kind through late tables and renames while a new birth resolves it', () => {
  const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 2000, -1000]], rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
  const anchor = (berth: string, x: number) => ({ berth, kind: 'signal' as const, from: 1, to: 2, t: x / 2000, point: [x, -1000] as [number, number], errorM: 1, evidence: 'synthetic' });
  const anchors = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [anchor('NEW', 400), anchor('OLD', 1500)] };
  const table = new Map<string, ReturnType<typeof service>>();
  const tableReads: { description: string; atTime: number }[] = [];
  const kinds = createTrainKinds((description, atTime) => {
    tableReads.push({ description, atTime });
    return table.get(description);
  });
  const motionBirths: { description: string; birth: MotionBirth }[] = [];
  const motion = createMotion(graph, anchors, { lengthM: (description, birth) => {
    motionBirths.push({ description, birth: { ...birth } });
    return kinds.lengthM(description, birth);
  } });

  motion.apply({ kind: 'interpose', area: 'TEST', descr: '2OLD', to: 'OLD' }, 1234);
  const first = motion.trains()[0]!;
  assert.equal(first.id, 1); assert.equal(first.lengthM, trainLayout('lner5').length);
  assert.equal(kinds.kindFor(first), 'lner5');
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene, kinds.kindFor);
  layer.update([first]);
  const originalDrawn = layer.trains()[0]!;
  assert.equal(originalDrawn.kind, 'lner5');
  close(first.lengthM, originalDrawn.layout.length);

  table.set('2OLD', service('GN', 'MORGATE', 'KNGX'));
  table.set('1RENAMED', service('GR'));
  motion.apply({ kind: 'interpose', area: 'TEST', descr: '1RENAMED', to: 'OLD' }, 9876);
  const renamed = motion.trains()[0]!;
  assert.equal(renamed.id, first.id); assert.equal(renamed.description, '1RENAMED');
  assert.equal(renamed.lengthM, first.lengthM); assert.equal(kinds.kindFor(renamed), 'lner5');
  layer.update([renamed]);
  const afterRename = layer.trains()[0]!;
  assert.ok(afterRename.group === originalDrawn.group, 'a rename must retain the original render group');
  assert.equal(afterRename.kind, 'lner5');
  assert.ok(afterRename.layout === originalDrawn.layout, 'a rename must retain the original layout');
  close(renamed.lengthM, afterRename.layout.length);

  table.set('1NEW', service('GN', 'KNGX', 'MOORGATE'));
  motion.apply({ kind: 'interpose', area: 'TEST', descr: '1NEW', to: 'NEW' }, 10_500);
  const views = motion.trains(), newcomer = views.find((view) => view.description === '1NEW')!;
  const gn717 = ALL_KINDS.find((kind) => TRAIN_SPECS[kind].operator === 'Great Northern' && /717/.test(TRAIN_SPECS[kind].classes));
  assert.ok(gn717);
  assert.equal(newcomer.id, 2); assert.equal(newcomer.lengthM, trainLayout(gn717).length);
  assert.equal(kinds.kindFor(newcomer), gn717);
  layer.update(views);
  const drawnNewcomer = layer.trains().find((record) => record.id === newcomer.id)!;
  assert.equal(drawnNewcomer.kind, gn717); assert.equal(drawnNewcomer.layout.spec.kind, gn717);
  close(newcomer.lengthM, drawnNewcomer.layout.length);
  assert.deepEqual(motionBirths, [
    { description: '2OLD', birth: { id: 1, timeMs: 1234 } },
    { description: '1NEW', birth: { id: 2, timeMs: 10_500 } },
  ]);
  assert.deepEqual(tableReads, [
    { description: '2OLD', atTime: 1234 },
    { description: '1NEW', atTime: 10_500 },
  ]);
  layer.dispose();
});

test('fading one train leaves another opaque and disappearing trains release their groups', () => {
  const { graph, train } = fixture(false);
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update([{ ...train, opacity: 0.25 }, { ...train, id: 2, description: '1OTHER' }]);
  const [faded, solid] = layer.trains();
  for (const [record, opacity] of [[faded!, 0.25], [solid!, 1]] as const) record.group.traverse((o) => {
    if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) close(m.opacity, opacity);
  });
  layer.update([{ ...train, id: 2, description: '1OTHER' }]);
  assert.equal(layer.trains().length, 1); assert.equal(scene.children.length, 1);
  layer.dispose(); assert.equal(scene.children.length, 0);
});

test('eight same-kind trains at the same opacity share one material palette', () => {
  const { graph, train } = fixture(false);
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update(Array.from({ length: 8 }, (_, index) => ({ ...train, id: index + 1 })));
  const groups = layer.trains().map((record) => record.group);
  const templateMaterials = materialsOf(buildTrain('lner9'));
  const palette = materialsOf(groups[0]!);
  assert.equal(groups.length, 8);
  assert.equal(palette.size, templateMaterials.size, 'one palette copy per original template material');
  for (const group of groups.slice(1)) assert.ok(sameMembers(palette, materialsOf(group)), 'every same-kind train must use the same material objects');
  assertMaterialOpacity(groups[0]!, 1);
  layer.dispose();
});

test('exact fading opacity stays isolated through palette splits and simultaneous swaps', () => {
  const { graph, train } = fixture(false);
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  const first = { ...train, id: 1, opacity: 0.5500000003 };
  const second = { ...train, id: 2, opacity: 0.5500000003 };
  const steady = { ...train, id: 3, opacity: 1 };
  layer.update([first, second, steady]);
  let [a, b, c] = layer.trains();
  assert.ok(sameMembers(materialsOf(a!.group), materialsOf(b!.group)), 'same kind and exact opacity share their palette');
  assertMaterialOpacity(a!.group, first.opacity);
  assertMaterialOpacity(c!.group, 1);

  const splitA = { ...first, opacity: 0.287654321 };
  const splitB = { ...second, opacity: 0.413579246 };
  layer.update([splitA, splitB, steady]);
  [a, b, c] = layer.trains();
  assert.equal(sharedCount(materialsOf(a!.group), materialsOf(b!.group)), 0, 'different opacities must not share mutable material objects');
  assert.ok(!sameMembers(materialsOf(a!.group), materialsOf(b!.group)), 'different opacity palettes must use distinct material objects');
  assertMaterialOpacity(a!.group, splitA.opacity);
  assertMaterialOpacity(b!.group, splitB.opacity);
  assertMaterialOpacity(c!.group, 1);

  const swapA = { ...splitA, opacity: splitB.opacity };
  const swapB = { ...splitB, opacity: splitA.opacity };
  layer.update([swapA, swapB, steady]);
  [a, b, c] = layer.trains();
  assert.ok(sameMembers(materialsOf(a!.group), materialsOf(b!.group)) === false, 'swapped opacity palettes stay separate');
  assertMaterialOpacity(a!.group, swapA.opacity);
  assertMaterialOpacity(b!.group, swapB.opacity);
  assertMaterialOpacity(c!.group, 1);
  layer.dispose();
});

test('a unique fading palette reuses its materials across frames and releases them after its last user', () => {
  const { graph, train } = fixture(false);
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  const first = { ...train, id: 1, state: 'fading' as const, opacity: 0.1234567 };
  const second = { ...train, id: 2, state: 'fading' as const, opacity: 0.1234567 };
  layer.update([first, second]);
  const [a, b] = layer.trains();
  const palette = materialsOf(a!.group);
  const disposed = new Set<THREE.Material>();
  for (const material of palette) material.addEventListener('dispose', () => disposed.add(material));
  assert.ok(sameMembers(palette, materialsOf(b!.group)));
  assertMaterialOpacity(a!.group, first.opacity);

  let currentOpacity = first.opacity;
  for (let frame = 1; frame <= 12; frame++) {
    currentOpacity = 0.543210987 - frame * 0.031234567;
    const fadingA = { ...first, opacity: currentOpacity };
    const fadingB = { ...second, opacity: currentOpacity };
    layer.update([fadingA, fadingB]);
    const [nextA, nextB] = layer.trains();
    assert.ok(sameMembers(palette, materialsOf(nextA!.group)), `fade frame ${frame} reuses the palette materials`);
    assert.ok(sameMembers(palette, materialsOf(nextB!.group)));
    assertMaterialOpacity(nextA!.group, currentOpacity);
    assert.equal(disposed.size, 0);
  }

  const lastA = { ...first, opacity: currentOpacity };
  layer.update([lastA]);
  assert.equal(disposed.size, 0, 'one remaining train keeps the shared palette alive');
  layer.update([]);
  assert.equal(disposed.size, palette.size, 'an empty update disposes the palette after its last user leaves');
  assert.equal(layer.trains().length, 0);
  layer.dispose();
});

test('different train kinds keep separate palettes and layer disposal preserves cached sample materials and textures', () => {
  const sample = buildTrain('lner9');
  const originals = materialsOf(sample);
  const textureOriginal = [...originals].find((material): material is THREE.MeshStandardMaterial => material instanceof THREE.MeshStandardMaterial);
  assert.ok(textureOriginal, 'the sample train has a standard material for the shared texture check');
  const previousMap = textureOriginal.map;
  const sharedTexture = new THREE.Texture();
  textureOriginal.map = sharedTexture;
  const snapshots = new Map([...originals].map((material) => [material, {
    opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite,
    map: material instanceof THREE.MeshStandardMaterial ? material.map : undefined,
    envMap: material instanceof THREE.MeshStandardMaterial ? material.envMap : undefined,
  }]));
  const disposedOriginals = new Set<THREE.Material>();
  let textureDisposed = false;
  sharedTexture.addEventListener('dispose', () => { textureDisposed = true; });
  for (const material of originals) material.addEventListener('dispose', () => disposedOriginals.add(material));

  try {
    const { graph, train } = fixture(false);
    const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
    layer.update([train, { ...fixture(false, 'lner5').train, id: 2, opacity: 1 }]);
    const [long, short] = layer.trains();
    const longMaterials = materialsOf(long!.group), shortMaterials = materialsOf(short!.group);
    assert.equal(sharedCount(longMaterials, shortMaterials), 0, 'palette material copies are scoped by train kind');
    assert.ok([...longMaterials].some((material) => material instanceof THREE.MeshStandardMaterial && material.map === sharedTexture), 'palette copies retain the shared texture object');
    assert.ok([...shortMaterials].every((material) => !originals.has(material)), 'live groups must not bind the cached template materials');
    layer.dispose();

    assert.equal(disposedOriginals.size, 0, 'disposing the live layer must not dispose template or sample materials');
    for (const [material, before] of snapshots) {
      assert.equal(material.opacity, before.opacity);
      assert.equal(material.transparent, before.transparent);
      assert.equal(material.depthWrite, before.depthWrite);
      if (material instanceof THREE.MeshStandardMaterial) {
        assert.equal(material.map, before.map);
        assert.equal(material.envMap, before.envMap);
      }
    }
    assert.equal(textureDisposed, false, 'disposing a material palette must not dispose its shared texture');
  } finally {
    textureOriginal.map = previousMap;
    sharedTexture.dispose();
  }
});

test('cars whose track is outside the observed occupied trail stay hidden rather than extrapolating', () => {
  const { graph, train } = fixture(false);
  const clipped = { ...train, occupiedLengthM: 40 };
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update([clipped]);
  const group = layer.trains()[0]!.group;
  assert.equal(group.getObjectByName('car-0')!.visible, true);
  assert.equal(group.getObjectByName('car-1')!.visible, false);
  layer.dispose();
});


test('mixed train lengths share one collision core and a short train swaps its actual trailing end', () => {
  const graph = buildGraph({ nodes: [[1, 0, -1000], [2, 2000, -1000]], rails: [{ id: 1, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }] });
  const makeAnchor = (berth: string, t: number, platform?: string) => ({ berth, kind: 'signal' as const, from: 1, to: 2, t, point: [t * 2000, -1000] as [number, number], errorM: 1, evidence: 'synthetic', ...(platform === undefined ? {} : { platform }) });
  const anchors = { area: 'TEST', sources: ['synthetic'], unmapped: [], anchors: [makeAnchor('A', 0.2), makeAnchor('P', 0.75, '1'), makeAnchor('OUT', 0.35)] };
  const motion = createMotion(graph, anchors, { lengthM: lengthForDescription });
  motion.apply({ kind: 'interpose', area: 'TEST', descr: '1SYN', to: 'A' }, 0);
  motion.apply({ kind: 'interpose', area: 'TEST', descr: '2SYN', to: 'P' }, 0);
  close(motion.trains()[0]!.occupiedLengthM, 233.7);
  close(motion.trains()[1]!.occupiedLengthM, 129.7);
  const arrived = motion.trains()[1]!;
  close(arrived.leading.point[0], anchors.anchors[1]!.point[0] - DEFAULT_BUFFER_CLEARANCE_M);
  motion.apply({ kind: 'step', area: 'TEST', descr: '2SYN', from: 'P', to: 'OUT' }, 0);
  close(motion.trains()[1]!.leading.point[0], anchors.anchors[1]!.point[0] - DEFAULT_BUFFER_CLEARANCE_M - arrived.lengthM);
  close(overlapM(arrived.occupied, motion.trains()[1]!.occupied), arrived.lengthM);
  for (let i = 0; i < 2000; i++) {
    motion.advance(0.1);
    const [long, short] = motion.trains();
    close(long!.lengthM, 233.7); close(short!.lengthM, 129.7);
    close(overlapM(long!.occupied, short!.occupied), 0);
  }
});

test('a renamed train keeps its group and birth layout from two to one and back regardless of its headcode', () => {
  for (const kind of ['lner5', 'lner9'] as const) {
    const { graph, train } = fixture(true, kind);
    const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
    layer.update([{ ...train, description: '2SYN' }]);
    const born = layer.trains()[0]!, group = born.group, layout = born.layout;
    const count = kind === 'lner5' ? 5 : 9;
    assert.equal(born.id, train.id); assert.equal(born.kind, kind);
    assert.equal(layout.spec.kind, kind); close(layout.length, train.lengthM);
    for (const description of ['1SYN', '2SYN']) {
      layer.update([{ ...train, description }]);
      const current = layer.trains()[0]!;
      assert.ok(current.group === group, 'a rename must retain the same group');
      assert.ok(current.layout === layout, 'a rename must retain the birth layout'); assert.equal(current.kind, kind);
      assert.equal(current.description, description); assert.equal(group.userData.description, description);
      assert.equal(layer.trains().length, 1); assert.equal(scene.children.length, 1);
      const cars = group.children.filter((node) => /^car-\d+$/.test(node.name));
      assert.equal(cars.length, count); assert.equal(cars.filter((node) => node.visible).length, count);
      assert.equal(carPoses(graph, { ...train, description }).length, count);
    }
    layer.dispose();
  }
});

test('a fresh physical train gets a new group when its description matches a faded train in the same update', () => {
  const { graph, train } = fixture(false);
  const replacement = { ...fixture(false, 'lner5').train, id: 2, description: train.description };
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene);
  layer.update([{ ...train, state: 'fading', opacity: 0.25 }]);
  const faded = layer.trains()[0]!.group;
  const materials = new Set<THREE.Material>(), disposed = new Set<THREE.Material>();
  faded.traverse((node) => {
    if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) materials.add(material);
  });
  for (const material of materials) material.addEventListener('dispose', () => disposed.add(material));
  layer.update([replacement]);
  const fresh = layer.trains()[0]!;
  assert.ok(fresh.group !== faded, 'a fresh physical id must receive a new group');
  assert.ok(faded.parent === null, 'the faded group must be removed from the scene');
  assert.equal(fresh.id, replacement.id); assert.equal(fresh.kind, 'lner5'); assert.equal(fresh.layout.cars.length, 5);
  assert.equal(layer.trains().length, 1); assert.equal(scene.children.length, 1);
  assert.equal(disposed.size, materials.size);
  fresh.group.traverse((node) => {
    if (node instanceof THREE.Mesh) for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      close(material.opacity, 1); assert.equal(material.transparent, false); assert.equal(materials.has(material), false);
    }
  });
  layer.dispose();
});

test('new stations keep unknown operators unresolved and never draw the legacy LNER fallback', () => {
  for (const stationId of ['st-pancras', 'edinburgh-waverley'] as const) {
    const resolver = createTrainKinds(() => service('ZZ'), { stationId });
    const length = resolver.lengthM('1SYN', { id: 99, timeMs: 0 });
    assert.ok(Number.isFinite(length) && length > 0);
    const train = { ...fixture().train, id: 99, description: '1SYN', lengthM: length };
    assert.equal(resolver.kindFor(train), undefined);
    const parent = new THREE.Group();
    const drawn = createLiveTrains(fixture().graph, parent, resolver.kindFor);
    drawn.update([train]);
    assert.equal(parent.children.length, 0);
    drawn.dispose();
  }
});
