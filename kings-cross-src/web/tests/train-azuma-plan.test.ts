// The Azuma family's windows and doors, car by car (round 6, T3: "count and record openings on both sides for every distinct car role ... windowless bays"). The round-5 score: the model draws
// six evenly spaced windows on every driving car, where lner-801-214-2025 and lner-800-108-offord-cluny-2023 show a driving car with three windows and three windowless bays beside its passenger
// door, and hull-802-paragon-2025 one with four and two; the car with all six (lner-800-doncaster-2026, hull-802-home-2023, LUMO-04-Lumo-803003-at-Edinburgh-Waverley) is the standard-class one.
//
// THE TABLE BELOW is an independent copy of what the photographs show on the RIGHT side of each car, [windows, windowless bays]; it is not read from the code under test:
//   a standard-class driving car (DPTS)    6 windows, no blank bay   lner-800-doncaster-2026, hull-802-home-2023 (802 302), LUMO-04-Lumo-803003 (both Lumo driving cars are standard class)
//   a first-class driving car (DPTF)       LNER 3 + 3 blank (lner-801-214-2025, lner-800-108-offord-cluny-2023), Hull Trains 4 + 2 blank (hull-802-paragon-2025: the car with the "First Class" sign)
//   a through car (MS, MC, TS, MF)         9 windows between its two end doors (lner-801-214-2025: two cars of nine; hull-802-paragon-2025: three cars of nine)
// INFERRED: that the LNER lead cars with the blank bays are the DPTF; ASSUMED: that a blank bay is as wide as a window's pitch, that a TS, MC or MF is a through car like the MS (no photograph
// shows one as such), and that the left side of every car is its right side turned about (no photograph shows a left side).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as THREE from 'three';
import { TRAIN_KINDS, trainLayout } from '../../core/train.ts';
import type { Car, TrainKind } from '../../core/train.ts';
import { ASSUMED, at300Plan, bodySpec, buildTrain, carPlan, FIRST_CLASS_BLANK_BAYS } from '../src/train.ts';
import { col } from '../src/train-geom.ts';
import { layoutCar } from '../src/train-interior-layout.ts';
import { liveryFor } from '../src/train-livery.ts';
import * as at300 from '../src/train-interior-at300.ts';

const TABLE: Readonly<Record<string, readonly (readonly [number, number])[]>> = {
  lner5: [[6, 0], [9, 0], [9, 0], [9, 0], [3, 3]],
  lner9: [[6, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [9, 0], [3, 3]],
  hull5: [[6, 0], [9, 0], [9, 0], [9, 0], [4, 2]],
  lumo5: [[6, 0], [9, 0], [9, 0], [9, 0], [6, 0]],
};
const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
/** Where a plan's span [s0, s1] (metres from the cab end of a cab car, else from the car's start) lies along the train. */
const zSpan = (car: Car, [s0, s1]: readonly [number, number]): [number, number] => (car.cab === 'rear' ? [car.end - s1, car.end - s0] : [car.start + s0, car.start + s1]);

test('the Azuma family: each car has the windows and windowless bays the photographs show for its role, two doors and (a cab car) a crew door', () => {
  for (const kind of TRAIN_KINDS) {
    const want = TABLE[kind] as readonly (readonly [number, number])[];
    const cars = trainLayout(kind).cars;
    assert.equal(cars.length, want.length, `${kind}: the table has a row per car`);
    cars.forEach((car, i) => {
      const plan = carPlan(car, 'at300', kind);
      const here = `${kind} car ${i} ${car.type}`;
      assert.equal(plan.windows.length, want[i]![0], `${here}: windows`);
      assert.equal((plan.blanks ?? []).length, want[i]![1], `${here}: windowless bays`);
      assert.equal(plan.doors.length, 2, `${here}: passenger doors a side`);
      assert.equal((plan.crewDoors ?? []).length, car.cab ? 1 : 0, `${here}: crew doors a side`);
    });
  }
  // asked with no kind, the plan is the family's own: every bay has its window (the first-class driving car's blank bays belong to a train of an operator)
  for (const car of trainLayout('lner5').cars) {
    assert.deepEqual(at300Plan(car).blanks, [], `car ${car.index}: no blank bay without a kind`);
    assert.equal(at300Plan(car).windows.length, car.cab ? 6 : 9, `car ${car.index}: every bay glazed without a kind`);
  }
  // the blank bays are a property of the first-class driving car of an operator that has one: nothing else carries any
  assert.deepEqual({ ...FIRST_CLASS_BLANK_BAYS }, { lner5: 3, lner9: 3, hull5: 2 });
});

test('the Azuma family: the windows and the blank bays tile the saloon between the doors at one pitch, the blank bays beside the cab car\'s passenger door', () => {
  for (const kind of TRAIN_KINDS) {
    for (const car of trainLayout(kind).cars) {
      const plan = carPlan(car, 'at300', kind);
      const here = `${kind} car ${car.index} ${car.type}`;
      const bays = [...plan.windows.map((w) => ({ w, blank: false })), ...(plan.blanks ?? []).map((w) => ({ w, blank: true }))].sort((a, b) => a.w[0] - b.w[0]);
      const width = bays[0]!.w[1] - bays[0]!.w[0];
      near(width, 1.6, 0.2, `${here}: a bay is a window's width`);
      for (let k = 1; k < bays.length; k++) {
        near(bays[k]!.w[1] - bays[k]!.w[0], width, 1e-9, `${here}: bay ${k} is the size of the first`);
        near(bays[k]!.w[0] - bays[k - 1]!.w[0], bays[1]!.w[0] - bays[0]!.w[0], 1e-9, `${here}: one pitch between bays`);
      }
      const [d0, d1] = plan.doors as [number, number];
      assert.ok(bays[0]!.w[0] > d0 + ASSUMED.doorWidth / 2, `${here}: the first bay clears the first door`);
      assert.ok(bays[bays.length - 1]!.w[1] < d1 - ASSUMED.doorWidth / 2, `${here}: the last bay clears the last door`);
      // a first-class driving car's blank bays are the ones next to the door beside the cab, so every one of them comes before every window
      const lastBlank = Math.max(-Infinity, ...(plan.blanks ?? []).map((b) => b[1]));
      for (const w of plan.windows) assert.ok(w[0] > lastBlank, `${here}: a window at ${w[0]} is before a blank bay ending at ${lastBlank}`);
      for (const [a, b] of plan.blanks ?? []) assert.ok(car.cab && b < (plan.windows[0] as [number, number])[0] && a > d0, `${here}: blank bays only on a cab car, between its door and its first window`);
    }
  }
});

/** The glass panes drawn on a car's side, read out of the built mesh: the spans along the train [zMin, zMax] of each pane (the triangles of the window colour standing in the plane of the glass, 12 mm in from the skin). */
function panesOf(group: THREE.Object3D, car: Car, kind: TrainKind, side: 1 | -1): [number, number][] {
  const mesh = group.getObjectByName(`car-${car.index}`)!.getObjectByName('body-detail') as THREE.Mesh;
  const pos = mesh.geometry.getAttribute('position');
  const colour = mesh.geometry.getAttribute('color');
  const want = col(liveryFor(kind).window);
  const plane = side * (bodySpec('at300').half - 0.012);
  const spans: [number, number][] = [];
  for (let i = 0; i + 2 < pos.count; i += 3) {
    const onPlane = [0, 1, 2].every((k) => Math.abs(pos.getX(i + k) - plane) < 1e-4 && Math.abs(colour.getX(i + k) - want.r) < 1e-5 && Math.abs(colour.getY(i + k) - want.g) < 1e-5 && Math.abs(colour.getZ(i + k) - want.b) < 1e-5);
    if (!onPlane) continue;
    const zs = [0, 1, 2].map((k) => pos.getZ(i + k));
    spans.push([Math.min(...zs), Math.max(...zs)]);
  }
  // one pane is a fan of triangles that overlap along z: merge them
  spans.sort((a, b) => a[0] - b[0]);
  const panes: [number, number][] = [];
  for (const s of spans) {
    const last = panes[panes.length - 1];
    if (last && s[0] <= last[1] + 1e-4) last[1] = Math.max(last[1], s[1]);
    else panes.push([s[0], s[1]]);
  }
  return panes;
}

test('the Azuma family: the built body draws a pane where the plan has a window, on both sides, and none in a windowless bay', () => {
  for (const kind of TRAIN_KINDS) {
    const group = buildTrain(kind);
    group.updateMatrixWorld(true);
    for (const car of trainLayout(kind).cars) {
      const plan = carPlan(car, 'at300', kind);
      const want = plan.windows.map((w) => zSpan(car, w)).sort((a, b) => a[0] - b[0]);
      for (const side of [1, -1] as const) {
        const here = `${kind} car ${car.index} ${car.type} side ${side}`;
        const panes = panesOf(group, car, kind, side);
        assert.equal(panes.length, want.length, `${here}: panes drawn`);
        panes.forEach((p, k) => {
          near(p[0], want[k]![0], 2e-4, `${here}: pane ${k} start`);
          near(p[1], want[k]![1], 2e-4, `${here}: pane ${k} end`);
        });
        for (const b of plan.blanks ?? []) {
          const [z0, z1] = zSpan(car, b);
          assert.ok(panes.every((p) => p[1] <= z0 + 2e-4 || p[0] >= z1 - 2e-4), `${here}: a pane stands in the blank bay ${z0.toFixed(2)}..${z1.toFixed(2)}`);
        }
      }
    }
  }
});

test('the Azuma family: the inside of a car is cut with the same windows as its outside, a first-class driving car\'s blank bays left whole', () => {
  for (const kind of ['lner5', 'hull5', 'lumo5'] as TrainKind[]) {
    const layout = trainLayout(kind);
    for (const car of [layout.cars[0]!, layout.cars[layout.cars.length - 1]!, layout.cars[1]!]) {
      const plan = carPlan(car, 'at300', kind);
      const here = `${kind} car ${car.index} ${car.type}`;
      assert.deepEqual(layoutCar(kind, car).windows, plan.windows, `${here}: the layout holds the plan's windows`);
      const [wy0, wy1] = bodySpec('at300').windowY;
      const cuts = at300.buildInterior(kind, car).openings.filter((o) => Math.abs(o.y0 - wy0) < 1e-9 && Math.abs(o.y1 - wy1) < 1e-9);
      for (const side of [1, -1]) assert.equal(cuts.filter((o) => o.side === side).length, plan.windows.length, `${here}: window openings cut in side ${side}`);
    }
  }
});
