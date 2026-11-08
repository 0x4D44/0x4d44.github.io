import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ALL_KINDS, carLength, DESIRO_CITY, DRIVING, ELECTROSTAR, EMU_FIGURES, EMU_KINDS, FIGURES, roofHeight, TRAIN_KINDS, TRAIN_SPECS, trainLayout } from '../train.ts';
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
  assert.equal(FIGURES.roofEdgeHeight.value, 3.35);
  near(roofHeight(), 3.62, 1e-9, 'roof covers on top of the roof edge');
  assert.equal(FIGURES.gauge.value, 1.435);
});

test('train: the highest point is a believable height for a UK train, well under 3.9 m and over 3.4 m', () => {
  // Sanity bounds, not sourced figures. The first version stacked the 0.27 m roof covers on a
  // 3.725 m roof edge and stood 3.995 m tall, nearly 4 m; Arthur flagged it as too tall.
  assert.ok(roofHeight() < 3.9, `highest point ${roofHeight()} m is as tall as the tallest UK stock`);
  assert.ok(roofHeight() > 3.4, `highest point ${roofHeight()} m is too low for a 2.7 m wide express`);
  assert.equal(FIGURES.roofEdgeHeight.basis, 'assumed', 'no printed height exists, so the roof edge must say it is assumed');
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

// --- the Great Northern commuter units (Class 387 Electrostar, Class 717 Desiro City) ----------------------

test('train: the Great Northern units are the published lengths: 81.56 m a Class 387 (four cars), 121.674 m a Class 717', () => {
  // loco-info.com (Class 387 data): unit length 81.56 m; Siemens datasheet (Class 717): "Unit length 121,674 mm"
  near(trainLayout('gn387x4').length, 81.56, 1e-9, '387, one unit');
  near(trainLayout('gn387x8').length, 163.12, 1e-9, '387, two units coupled');
  near(trainLayout('gn387x12').length, 244.68, 1e-9, '387, three units coupled');
  near(trainLayout('gn717x6').length, 121.674, 1e-9, '717');
  for (const car of trainLayout('gn387x12').cars) assert.equal(car.length, 20.39, `387 car ${car.index} (Wikipedia: car length 20.39 m)`);
  for (const car of trainLayout('gn717x6').cars) near(car.length, 121.674 / 6, 1e-9, `717 car ${car.index} (the unit length over six: an assumption)`);
});

test('train: the Great Northern formations are as published', () => {
  const codes = (k: TrainKind): string => TRAIN_SPECS[k].cars.join('-');
  assert.equal(codes('gn387x4'), 'DMSO-MSO-PTSO-DMSO');
  assert.equal(codes('gn387x8'), 'DMSO-MSO-PTSO-DMSO-DMSO-MSO-PTSO-DMSO');
  assert.equal(codes('gn387x12'), 'DMSO-MSO-PTSO-DMSO-DMSO-MSO-PTSO-DMSO-DMSO-MSO-PTSO-DMSO');
  assert.equal(codes('gn717x6'), 'DMOS-TOS-TOSLW-MOS-PTOS-DMOS');
  assert.deepEqual(EMU_KINDS.map((k) => TRAIN_SPECS[k].cars.length), [4, 8, 12, 6]);
  assert.deepEqual(EMU_KINDS.map((k) => TRAIN_SPECS[k].livery), ['greatnorthern', 'greatnorthern', 'greatnorthern', 'greatnorthern']);
  // the kind lists: the Azuma kinds are unchanged, and ALL_KINDS is every kind once
  assert.deepEqual(TRAIN_KINDS, ['lner5', 'lner9', 'hull5', 'lumo5']);
  assert.deepEqual([...ALL_KINDS].sort(), [...TRAIN_KINDS, ...EMU_KINDS].sort());
});

test('train: cabs are at the ends of each unit, so coupled 387s have two noses meeting, and the 717 has cabs at its two ends only', () => {
  const cabs = (k: TrainKind): (string | null)[] => trainLayout(k).cars.map((c) => c.cab);
  assert.deepEqual(cabs('gn387x4'), ['front', null, null, 'rear']);
  assert.deepEqual(cabs('gn387x8'), ['front', null, null, 'rear', 'front', null, null, 'rear']);
  assert.deepEqual(cabs('gn387x12'), ['front', null, null, 'rear', 'front', null, null, 'rear', 'front', null, null, 'rear']);
  assert.deepEqual(cabs('gn717x6'), ['front', null, null, null, null, 'rear']);
  for (const kind of EMU_KINDS) for (const car of trainLayout(kind).cars) assert.equal(car.cab !== null, DRIVING.has(car.type), `${kind} car ${car.index} ${car.type}`);
});

test('train: Great Northern cars abut, and each has two bogies the published or assumed distance in from its ends', () => {
  for (const kind of EMU_KINDS) {
    const { cars, length, spec } = trainLayout(kind);
    const fig = EMU_FIGURES[spec.family as 'electrostar' | 'desiro'];
    assert.equal(cars[0]?.start, 0);
    for (let i = 1; i < cars.length; i++) near((cars[i] as { start: number }).start, (cars[i - 1] as { end: number }).end, 1e-9, `${kind} join ${i}`);
    near((cars[cars.length - 1] as { end: number }).end, length, 1e-9, `${kind} length`);
    for (const car of cars) {
      near(car.bogies[0] - car.start, fig.bogieFromEnd.value, 1e-9, `${kind} car ${car.index} first bogie from its start`);
      near(car.end - car.bogies[1], fig.bogieFromEnd.value, 1e-9, `${kind} car ${car.index} second bogie from its end`);
    }
  }
  assert.equal(ELECTROSTAR.bogieFromEnd.value, 3.15);
  assert.equal(DESIRO_CITY.bogieFromEnd.value, 3.1);
});

test('train: a Great Northern pantograph is on each PTSO / PTOS (pantograph trailer) and nowhere else, centred, 2.0 m long', () => {
  const at = (k: TrainKind): number[] => trainLayout(k).cars.filter((c) => c.pantograph).map((c) => c.index);
  assert.deepEqual(at('gn387x4'), [2]);
  assert.deepEqual(at('gn387x8'), [2, 6]);
  assert.deepEqual(at('gn387x12'), [2, 6, 10]);
  assert.deepEqual(at('gn717x6'), [4]);
  for (const kind of EMU_KINDS) {
    for (const car of trainLayout(kind).cars) {
      assert.equal(car.pantograph !== null, car.type === 'PTSO' || car.type === 'PTOS', `${kind} car ${car.index} ${car.type}`);
      if (!car.pantograph) continue;
      near(car.pantograph[1] - car.pantograph[0], 2.0, 1e-9, 'base length');
      near((car.pantograph[0] + car.pantograph[1]) / 2, (car.start + car.end) / 2, 1e-9, 'centred on its car');
    }
  }
});

test('train: traction motors follow the published wheel arrangements (387: 2-B + 2-B + 2-2 + B-2; 717: Bo-Bo + 2-2 + 2-2 + Bo-Bo + 2-2 + Bo-Bo)', () => {
  const m = (k: TrainKind): string => trainLayout(k).cars.map((c) => c.motor.map((x) => (x ? 'M' : 'T')).join('')).join(' ');
  assert.equal(m('gn387x4'), 'TM TM TT MT');
  assert.equal(m('gn387x8'), 'TM TM TT MT TM TM TT MT');
  assert.equal(m('gn717x6'), 'MM TT TT MM TT MM');
  // the Azuma model has motors on every bogie (an assumption, stated in the Car type)
  for (const car of trainLayout('lner9').cars) assert.deepEqual(car.motor, [true, true]);
});

test('train: every commuter-EMU figure has a source; the published ones are pinned, and a guess says so', () => {
  const published: string[] = [];
  for (const [family, figures] of Object.entries(EMU_FIGURES)) {
    for (const [name, f] of Object.entries(figures)) {
      assert.ok(f.source.length > 20, `${family}.${name} has a real source`);
      assert.ok(['published', 'drawn', 'assumed'].includes(f.basis), `${family}.${name} has a basis`);
      assert.ok(Number.isFinite(f.value) && f.value > 0, `${family}.${name} is a positive number`);
      if (f.basis === 'published') published.push(`${family}.${name}`);
      if (f.basis === 'assumed') assert.match(f.source, /not published|assumed|to be replaced/i, `${family}.${name} says it is a guess`);
    }
  }
  // adding a figure to this list needs a manufacturer or reference-work citation
  assert.deepEqual(published.sort(), [
    'desiro.bodyWidth', 'desiro.doorWidth', 'desiro.floorHeight', 'desiro.wheelDiameter', 'desiro.wheelbaseMotor', 'desiro.wheelbaseTrailer',
    'electrostar.bodyWidth', 'electrostar.carLength', 'electrostar.height',
  ]);
  for (const kind of EMU_KINDS) assert.ok(TRAIN_SPECS[kind].source.length > 20, `${kind} formation is cited`);
  assert.deepEqual([ELECTROSTAR.carLength.value, ELECTROSTAR.bodyWidth.value, ELECTROSTAR.height.value], [20.39, 2.8, 3.77]);
  assert.deepEqual([DESIRO_CITY.bodyWidth.value, DESIRO_CITY.floorHeight.value, DESIRO_CITY.wheelDiameter.value, DESIRO_CITY.wheelbaseMotor.value, DESIRO_CITY.wheelbaseTrailer.value, DESIRO_CITY.doorWidth.value], [2.8, 1.1, 0.82, 2.2, 2.1, 1.5]);
});

test('train: carLength agrees with the commuter figures, and driving cars are exactly the cabs', () => {
  for (const t of ['DMSO', 'MSO', 'PTSO'] as const) assert.equal(carLength(t), ELECTROSTAR.carLength.value);
  for (const t of ['DMOS', 'TOS', 'TOSLW', 'MOS', 'PTOS'] as const) assert.equal(carLength(t), DESIRO_CITY.carLength.value);
  assert.deepEqual([...DRIVING].sort(), ['DMOS', 'DMSO', 'DPTF', 'DPTS']);
  assert.deepEqual(trainLayout('gn387x8'), trainLayout('gn387x8'));
});
