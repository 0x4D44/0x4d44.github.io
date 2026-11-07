import assert from 'node:assert/strict';
import { test } from 'node:test';
import { carLength, DRIVING, FIGURES, roofHeight, TRAIN_KINDS, TRAIN_SPECS, trainLayout } from '../train.ts';
import type { CarType, TrainKind } from '../train.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('train: the published unit lengths are the sum of the published car lengths (129.7 m and 233.7 m)', () => {
  near(trainLayout('lner5').length, 129.7, 1e-9, '5-car 800/2, 801/1');
  near(trainLayout('lner9').length, 233.7, 1e-9, '9-car 800/1, 801/2');
  // Hull Trains and Lumo run 5-car sets of the same cars
  near(trainLayout('hull5').length, 129.7, 1e-9, '5-car 802/3');
  near(trainLayout('lumo5').length, 129.7, 1e-9, '5-car 803');
});

test('train: car counts and formations are as published', () => {
  const codes = (k: TrainKind): string => TRAIN_SPECS[k].cars.join('-');
  assert.equal(codes('lner5'), 'DPTS-MS-MS-MC-DPTF');
  assert.equal(codes('lner9'), 'DPTS-MS-MS-TS-MS-TS-MC-MF-DPTF');
  assert.equal(codes('hull5'), 'DPTS-MS-MS-MC-DPTF');
  assert.equal(codes('lumo5'), 'DPTS-MS-MS-MS-DPTS');
  assert.deepEqual(TRAIN_KINDS.map((k) => TRAIN_SPECS[k].cars.length), [5, 9, 5, 5]);
});

test('train: per car, length 25.85 m for the cab cars and 26.00 m for the rest, width 2.7 m, height as drawn', () => {
  for (const kind of TRAIN_KINDS) {
    for (const car of trainLayout(kind).cars) {
      assert.equal(car.length, DRIVING.has(car.type) ? 25.85 : 26.0, `${kind} car ${car.index} ${car.type}`);
      near(car.end - car.start, car.length, 1e-9, `${kind} car ${car.index} span`);
    }
  }
  assert.equal(FIGURES.bodyWidth.value, 2.7);
  assert.equal(FIGURES.roofEdgeHeight.value, 3.725);
  near(roofHeight(), 3.995, 1e-9, 'roof covers on top of the roof edge');
  assert.equal(FIGURES.gauge.value, 1.435);
});

test('train: cars abut from the front nose at 0 to the rear, with no gap and no overlap', () => {
  for (const kind of TRAIN_KINDS) {
    const { cars, length } = trainLayout(kind);
    assert.equal(cars[0]?.start, 0);
    for (let i = 1; i < cars.length; i++) near((cars[i] as { start: number }).start, (cars[i - 1] as { end: number }).end, 1e-9, `${kind} join ${i}`);
    near((cars[cars.length - 1] as { end: number }).end, length, 1e-9, `${kind} length`);
  }
});

test('train: each car has two bogies inside its body, spaced as drawn, and only the end cars have cabs', () => {
  for (const kind of TRAIN_KINDS) {
    const { cars } = trainLayout(kind);
    for (const car of cars) {
      const [a, b] = car.bogies;
      assert.ok(a > car.start && b < car.end && a < b, `${kind} car ${car.index} bogies inside the body`);
      const span = b - a;
      if (car.index === 0 || car.index === cars.length - 1) near(span, FIGURES.innerBogieFromNose.value - FIGURES.cabBogieFromNose.value, 1e-9, `${kind} cab car span`);
      else near(span, FIGURES.intermediateBogieSpan.value, 1e-9, `${kind} intermediate span`);
      // a bogie must not be closer to the body end than a wheel's reach: an axle has to be under the body
      assert.ok(a - FIGURES.bogieWheelbase.value / 2 > car.start && b + FIGURES.bogieWheelbase.value / 2 < car.end, `${kind} car ${car.index} axles under the body`);
    }
    const cabs = cars.map((c) => c.cab);
    assert.equal(cabs[0], 'front');
    assert.equal(cabs[cabs.length - 1], 'rear');
    assert.ok(cabs.slice(1, -1).every((c) => c === null), `${kind}: no cab in the middle`);
  }
  // the cab bogie sits 4.455 m behind the nose, at either end of the train
  const l = trainLayout('lner5');
  near((l.cars[0] as { bogies: readonly [number, number] }).bogies[0], 4.455, 1e-9, 'front cab bogie');
  near(l.length - (l.cars[4] as { bogies: readonly [number, number] }).bogies[1], 4.455, 1e-9, 'rear cab bogie');
});

test('train: bogie, wheel and pantograph figures are pinned in metres, so changing one is a deliberate edit with its source', () => {
  const f = FIGURES;
  assert.deepEqual(
    [f.bogieWheelbase.value, f.cabBogieFromNose.value, f.innerBogieFromNose.value, f.intermediateBogieSpan.value, f.wheelDiameter.value, f.pantographFromNose.value, f.pantographLength.value, f.pantographFoldedHeight.value],
    [2.6, 4.455, 21.45, 16.7, 0.86, 20.88, 2.02, 0.24],
  );
  // and the positions they give on the 5-car LNER set, measured from the front nose
  const cars = trainLayout('lner5').cars;
  const at = (i: number): readonly [number, number] => (cars[i] as { bogies: readonly [number, number] }).bogies;
  for (const [got, want] of [[at(0), [4.455, 21.45]], [at(1), [30.5, 47.2]], [at(2), [56.5, 73.2]], [at(3), [82.5, 99.2]], [at(4), [108.25, 125.245]]] as const) {
    near(got[0], want[0], 1e-9, 'bogie a');
    near(got[1], want[1], 1e-9, 'bogie b');
  }
  const pan = (i: number): readonly [number, number] => (cars[i] as { pantograph: readonly [number, number] | null }).pantograph as readonly [number, number];
  near(pan(4)[0], 129.7 - 20.88 - 1.01, 1e-9, 'rear pantograph base, front end');
  near(pan(4)[1], 129.7 - 20.88 + 1.01, 1e-9, 'rear pantograph base, rear end');
  near(pan(0)[0], 20.88 - 1.01, 1e-9, 'front pantograph base, front end');
  near(pan(0)[1], 20.88 + 1.01, 1e-9, 'front pantograph base, rear end');
});

test('train: a bogie is symmetric about the middle of its intermediate car, and the train is the same front to back for the cab cars', () => {
  const l = trainLayout('lner9');
  for (const car of l.cars.slice(1, -1)) near((car.bogies[0] + car.bogies[1]) / 2, (car.start + car.end) / 2, 1e-9, `car ${car.index}`);
  const front = l.cars[0] as { bogies: readonly [number, number]; start: number };
  const rear = l.cars[l.cars.length - 1] as { bogies: readonly [number, number]; end: number };
  near(front.bogies[0] - front.start, rear.end - rear.bogies[1], 1e-9, 'cab bogie from nose, both ends');
  near(front.bogies[1] - front.start, rear.end - rear.bogies[0], 1e-9, 'inner bogie from nose, both ends');
});

test('train: every driving car, and only those, carries a pantograph near its inner end, 20.88 m from its own nose', () => {
  for (const kind of TRAIN_KINDS) {
    const { cars } = trainLayout(kind);
    const withPan = cars.filter((c) => c.pantograph);
    // the codes are DPTS and DPTF, Driving Pantograph Trailer: one on each cab car, two a train
    assert.deepEqual(withPan.map((c) => c.index), [0, cars.length - 1], `${kind}: a pantograph on the two cab cars`);
    for (const car of cars) assert.equal(car.pantograph !== null, DRIVING.has(car.type), `${kind} car ${car.index} ${car.type}`);
    for (const car of withPan) {
      const [p0, p1] = car.pantograph as readonly [number, number];
      near(p1 - p0, FIGURES.pantographLength.value, 1e-9, 'base length');
      const fromNose = car.cab === 'front' ? (p0 + p1) / 2 - car.start : car.end - (p0 + p1) / 2;
      near(fromNose, FIGURES.pantographFromNose.value, 1e-9, `${kind} car ${car.index}: centre measured from its own nose`);
      assert.ok(p0 > car.start && p1 < car.end, 'on the roof of that car');
      // inner end: the base sits nearer the car's inner end than its nose
      const middle = (car.start + car.end) / 2;
      assert.ok(car.cab === 'front' ? p0 > middle : p1 < middle, `${kind} car ${car.index}: toward the inner end`);
    }
  }
});

test('train: every figure has a source, and only the manufacturer-printed ones are called published', () => {
  const published: string[] = [];
  for (const [name, f] of Object.entries(FIGURES)) {
    assert.ok(f.source.length > 20, `${name} has a real source`);
    assert.ok(['published', 'drawn', 'assumed'].includes(f.basis), `${name} has a basis`);
    assert.ok(Number.isFinite(f.value) && f.value > 0, `${name} is a positive number`);
    if (f.basis === 'published') published.push(name);
    if (f.basis === 'assumed') assert.match(f.source, /not published|assumed|to be replaced/i, `${name} says it is a guess`);
  }
  // adding a figure to this list needs a manufacturer or reference-work citation
  assert.deepEqual(published.sort(), ['bodyWidth', 'drivingCarLength', 'gauge', 'intermediateCarLength']);
  for (const kind of TRAIN_KINDS) assert.ok(TRAIN_SPECS[kind].source.length > 20, `${kind} formation is cited`);
});

test('train: carLength agrees with the figures, and the layout is deterministic', () => {
  for (const t of ['DPTS', 'DPTF'] as const) assert.equal(carLength(t), FIGURES.drivingCarLength.value);
  for (const t of ['MS', 'MC', 'TS', 'MF'] as const) assert.equal(carLength(t), FIGURES.intermediateCarLength.value);
  assert.deepEqual(trainLayout('lner9'), trainLayout('lner9'));
});
