import assert from 'node:assert/strict';
import { test } from 'node:test';
import type * as THREE from 'three';
import { buildEdinburghTrain, disposeEdinburghTrain } from '../src/edinburgh-fleet.ts';
import { build385, dispose385 } from '../src/train-385.ts';
import { LENS, setTrainLampState } from '../src/train.ts';
import { col } from '../src/train-geom.ts';

type Lamps = { end: 'front' | 'rear'; interior: boolean; lenses: { role: 'head' | 'tail'; v0: number; v1: number }[] };
const cab = (train: THREE.Object3D, index: number): { lamps: Lamps; mesh: THREE.Mesh } => {
  const mesh = train.getObjectByName(`car-${index}`)!.getObjectByName('body-detail') as THREE.Mesh;
  return { lamps: mesh.userData.lamps as Lamps, mesh };
};
/** What each lens of a cab shows, by role: the LENS shade its first vertex carries (or '?'), and whether it glows. */
const shows = (train: THREE.Object3D, index: number): string[] => {
  const { lamps, mesh } = cab(train, index);
  const colour = mesh.geometry.getAttribute('color'), glow = mesh.geometry.getAttribute('aGlow');
  return lamps.lenses.map(l => {
    const name = Object.entries(LENS).find(([, hex]) => { const c = col(hex); return [c.r, c.g, c.b].every((v, k) => Math.abs(v - [colour.getX(l.v0), colour.getY(l.v0), colour.getZ(l.v0)][k]!) < 1e-6); })?.[0] ?? '?';
    return `${l.role}:${name}${glow.getX(l.v0) ? '*' : ''}`;
  });
};

/** Which of a cab's lens halos are shown (the glow round a lit lens after dark), by role. */
const halos = (train: THREE.Object3D, index: number): string[] =>
  cab(train, index).mesh.children.filter(c => c.name === 'lamp-halo' && c.visible).map(c => c.userData.role as string);

test('a 385 halo is a ring round its lens: clear of the lens (no wash over it), out to at most twice its radius, inside the housing', () => {
  const train = build385('sr385x3');
  for (const index of [0, 2]) {
    const car = train.getObjectByName(`car-${index}`)!, { mesh } = cab(train, index);
    const lenses: { role: string; c: THREE.Vector3 }[] = [];
    car.traverse(o => { if (o.name === 'headlight' || o.name === 'tail-lamp') lenses.push({ role: o.name === 'headlight' ? 'head' : 'tail', c: o.position }); });
    const radius = { head: 0.085, tail: 0.075 } as Record<string, number>; // LAMP.head.r, LAMP.tail.r
    for (const halo of mesh.children.filter(c => c.name === 'lamp-halo')) {
      const pos = (halo as THREE.Mesh).geometry.getAttribute('position'), role = halo.userData.role as string;
      for (let i = 0; i < pos.count; i++) {
        const [x, y] = [pos.getX(i), pos.getY(i)];
        const d = Math.min(...lenses.filter(l => l.role === role).map(l => Math.hypot(x - l.c.x, y - l.c.y)));
        assert.ok(d >= radius[role]! - 1e-6 && d <= 2 * radius[role]! + 1e-6, `car ${index} ${role} halo vertex ${d.toFixed(3)} m from its lens`);
        assert.ok(y >= 1.18 && y <= 1.98, `car ${index} ${role} halo inside the housing's height: ${y.toFixed(3)}`); // LAMP.y0..y1
      }
    }
  }
  dispose385(train);
});

test('a 385 is built in service (white ahead, red behind) and setTrainLampState switches both ends', () => {
  const train = build385('sr385x3');
  assert.deepEqual([cab(train, 0).lamps.end, cab(train, 2).lamps.end, cab(train, 0).lamps.lenses.length], ['front', 'rear', 4]);
  assert.equal(train.getObjectByName('car-1')!.getObjectByName('body-detail')!.userData.lamps, undefined, 'the PTS has no cab');
  assert.deepEqual(shows(train, 0), ['head:headOn*', 'tail:tailOff', 'head:headOn*', 'tail:tailOff']);
  assert.deepEqual(shows(train, 2), ['head:headOff', 'tail:tailOn*', 'head:headOff', 'tail:tailOn*']);
  assert.deepEqual([halos(train, 0), halos(train, 2)], [['head'], ['tail']], 'only the lit lenses carry a halo');
  setTrainLampState(train, { front: 'tail', rear: 'head' });
  assert.deepEqual(shows(train, 0), ['head:headOff', 'tail:tailOn*', 'head:headOff', 'tail:tailOn*']);
  assert.deepEqual(shows(train, 2), ['head:headOn*', 'tail:tailOff', 'head:headOn*', 'tail:tailOff']);
  assert.deepEqual([halos(train, 0), halos(train, 2)], [['tail'], ['head']]);
  setTrainLampState(train, { front: 'off', rear: 'off' });
  assert.deepEqual(shows(train, 2), ['head:headOff', 'tail:tailOff', 'head:headOff', 'tail:tailOff']);
  assert.deepEqual([halos(train, 0), halos(train, 2)], [[], []]);
  dispose385(train);
});

test('coupled 385s: the cabs that meet are dark and stay dark; the outer cabs switch', () => {
  const train = buildEdinburghTrain({ kind: 'sr385x3+sr385x4', units: [{ kind: 'sr385x3', offset: 0, cars: 3 }, { kind: 'sr385x4', offset: 70.277, cars: 4 }] })!;
  const dark = ['head:headOff', 'tail:tailOff', 'head:headOff', 'tail:tailOff'];
  assert.deepEqual([0, 2, 3, 6].map(i => cab(train, i).lamps.interior), [false, true, true, false]);
  assert.deepEqual([shows(train, 2), shows(train, 3)], [dark, dark]);
  setTrainLampState(train, { front: 'tail', rear: 'head' });
  assert.deepEqual([shows(train, 0)[1], shows(train, 6)[0], shows(train, 2), shows(train, 3)], ['tail:tailOn*', 'head:headOn*', dark, dark]);
  assert.deepEqual([0, 2, 3, 6].map(i => halos(train, i)), [['tail'], [], [], ['head']], 'the cabs that meet show no halo');
  disposeEdinburghTrain(train);
});
