import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { SR385_FIGURES, SR385_KINDS, sr385Layout } from '../../core/train-385.ts';
import { createEdinburghKinds } from '../../core/train-neutral.ts';
import { EDINBURGH_FLEET, edinburghFleetRow, evidenceBuildEdinburgh } from '../src/edinburgh-fleet.ts';
import { SR385_COLOURS, build385, dispose385, formation385 } from '../src/train-385.ts';
import { col } from '../src/train-geom.ts';
import { FLANGE_HEIGHT } from '../src/train-parts.ts';

const meshes = (o: THREE.Object3D): THREE.Mesh[] => { const out: THREE.Mesh[] = []; o.traverse(m => { if (m instanceof THREE.Mesh && m.visible) out.push(m); }); return out; };
const triangles = (o: THREE.Object3D): number => meshes(o).filter(m => m.name !== 'bogie-mesh' || m.userData.lod === 'near').reduce((n, m) => n + (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3, 0);

test('each 385 car is a named group with its two named bogies, and the geometry is finite and inside the train envelope', () => {
  for (const kind of SR385_KINDS) {
    const root = build385(kind), layout = sr385Layout(kind);
    assert.deepEqual(root.children.map(c => c.name), layout.cars.map(c => `car-${c.index}`));
    for (const car of layout.cars) for (const k of [0, 1]) assert.ok(root.getObjectByName(`bogie-${car.index}-${k}`), `${kind} bogie ${car.index}-${k}`);
    const box = new THREE.Box3().setFromObject(root);
    let finite = true;
    for (const m of meshes(root)) finite &&= Array.from(m.geometry.getAttribute('position').array).every(Number.isFinite);
    assert.ok(finite, `${kind} finite`);
    assert.ok(box.min.z >= -0.001 && box.max.z <= layout.length + 0.001, `${kind} within its length: ${box.min.z}..${box.max.z}`);
    assert.ok(box.max.x - box.min.x < SR385_FIGURES.bodyWidth.value + 0.1, `${kind} width ${box.max.x - box.min.x}`);
    assert.ok(box.max.y <= SR385_FIGURES.crown.value + 0.45 && box.min.y >= -FLANGE_HEIGHT - 0.001, `${kind} height (the wheel flanges reach below the rail head) ${box.min.y}..${box.max.y}`);
    dispose385(root);
  }
});

test('every 385 car stays inside the 40,000-triangle budget', () => {
  for (const kind of SR385_KINDS) {
    const root = build385(kind);
    for (const car of root.children) assert.ok(triangles(car) <= 40_000, `${kind} ${car.name}: ${triangles(car)}`);
    dispose385(root);
  }
});

test('the 385 cab front carries the hood, two screens, lamps that differ front and rear, a coupler at the drawing zero and the livery colours', () => {
  const root = build385('sr385x3');
  const front = root.getObjectByName('car-0')!, rear = root.getObjectByName('car-2')!;
  const names = (o: THREE.Object3D): string[] => { const n: string[] = []; o.traverse(c => n.push(c.name)); return n; };
  for (const car of [front, rear]) for (const name of ['gangway-hood', 'windscreen-frame', 'cab-glass', 'headlight', 'tail-lamp', 'coupler']) assert.ok(names(car).includes(name), `${car.name} has ${name}`);
  assert.equal(front.getObjectByName('coupler')!.position.z, 0, 'the coupler face is the front of the pitch');
  assert.ok(Math.abs(rear.getObjectByName('coupler')!.position.z - sr385Layout('sr385x3').length) < 1e-9);
  const tails = (car: THREE.Object3D): boolean[] => { const t: boolean[] = []; car.traverse(o => { if (o.name === 'tail-lamp') t.push(o.userData.rear); }); return t; };
  assert.deepEqual([tails(front), tails(rear)], [[false, false], [true, true]]);
  const colours = new Set<string>();
  const key3 = (r: number, g: number, b: number): string => [r, g, b].map(v => v.toFixed(4)).join(',');
  for (const m of meshes(front)) { const c = m.geometry.getAttribute('color'); if (!c) continue; for (let i = 0; i < c.count; i++) colours.add(key3(c.getX(i), c.getY(i), c.getZ(i))); }
  for (const key of ['body', 'yellow', 'hood', 'door', 'saltireDot', 'lowerDot', 'cantrail', 'glass'] as const) {
    const want = col(SR385_COLOURS[key]);
    assert.ok(colours.has(key3(want.r, want.g, want.b)), `front car shows ${key}`);
  }
  // only the PTS has a pantograph
  assert.deepEqual(root.children.map(c => !!c.getObjectByName('pantograph')), [false, true, false]);
  dispose385(root);
});

test('the Waverley table draws a 385 only for ScotRail class 385 with 3 or 4 vehicles, and the page hook builds it', () => {
  const kinds = (evidence: object | undefined): string => {
    const k = createEdinburghKinds(() => evidence as never, { rows: EDINBURGH_FLEET });
    k.lengthM('2Y10', { id: 1, timeMs: 0 });
    return k.kindFor({ id: 1 });
  };
  assert.deepEqual([
    { operator: 'SR', class: '385', cars: 3, basis: 'booked diagram' }, { operator: 'SR', class: '385', cars: 4 },
    { operator: 'SR', class: '385', cars: 6 }, { operator: 'SR', class: '380', cars: 3 }, { operator: 'GR', class: '385', cars: 3 }, undefined,
  ].map(kinds), ['sr385x3', 'sr385x4', 'neutral', 'neutral', 'neutral', 'neutral']);
  const built = evidenceBuildEdinburgh('sr385x4')!;
  assert.equal(built.name, 'train-sr385x4');
  edinburghFleetRow('sr385x4')!.dispose(built);
  assert.equal(evidenceBuildEdinburgh('no-such-kind'), undefined);
  assert.equal(formation385('sr385x3').cars.length, 3);
});

test('385 windows by span (scotrail385-04, -05): two small at each intermediate-car end, one between crew door and first door, large between the doors', () => {
  const root = build385('sr385x4');
  // the window widths along one side of a car, in order from its front pitch start
  const along = (index: number): number[] => {
    const car = root.getObjectByName(`car-${index}`)!, out: { z: number; w: number }[] = [];
    car.traverse(o => { if (o.name === 'window' && o.userData.side === 'left') out.push({ z: o.position.z, w: o.userData.width }); });
    return out.sort((a, b) => a.z - b.z).map(o => o.w);
  };
  for (const index of [1, 2]) assert.deepEqual(along(index), [0.85, 0.85, 1.85, 1.85, 1.85, 1.85, 0.85, 0.85], `car-${index}`);
  assert.deepEqual(along(0), [1.3, 1.85, 1.85, 1.85, 1.85, 0.85, 0.85]);
  assert.deepEqual(along(3), [0.85, 0.85, 1.85, 1.85, 1.85, 1.85, 1.3], 'the rear cab car, front to rear');
  dispose385(root);
});
