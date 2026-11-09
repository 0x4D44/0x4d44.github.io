import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ADELANTE, ALL_KINDS, carLength, DESIRO_700, DESIRO_CITY, DRIVING, ELECTROSTAR, EMU_FIGURES, EMU_KINDS, FIGURES, GC_KINDS, roofHeight, TL_KINDS, TRAIN_KINDS, TRAIN_SPECS, trainLayout } from '../train.ts';
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

test('train: the AT300 roof remains an assumption after the primary-source review', () => {
  assert.equal(FIGURES.roofEdgeHeight.basis, 'assumed');
  near(roofHeight(), 3.62, 1e-9, 'retained roof-cover envelope');
  assert.match(FIGURES.roofEdgeHeight.source, /No verified primary.*height/);
  assert.match(FIGURES.roofEdgeHeight.source, /r2014_10_105\.pdf/);
  assert.match(FIGURES.roofEdgeHeight.source, /tts-redacted\.pdf/);
  assert.doesNotMatch(FIGURES.roofEdgeHeight.source, /Hitachi's 3\.62/);
});

test('train: Hull cab transfer distinguishes the GWR owner figure from Hull verification', () => {
  assert.match(TRAIN_SPECS.hull5.source, /eversholtrail\.co\.uk\/fleet\/class-802/);
  assert.match(TRAIN_SPECS.hull5.source, /GWR.*25\.7/);
  assert.match(TRAIN_SPECS.hull5.source, /ASSUMED/);
  assert.match(TRAIN_SPECS.hull5.source, /coupl/);
  near(trainLayout('hull5').length, 129.7, 1e-9, 'unchanged pending a Hull-specific dimension');
});

test('train: Lumo bodyshell evidence does not turn transferred dimensions into published numbers', () => {
  assert.match(TRAIN_SPECS.lumo5.source, /lumo-train-now-available-from-hornby/);
  assert.match(TRAIN_SPECS.lumo5.source, /beaconrail\.com\/en\/fleet-item\/cl-803/);
  assert.match(TRAIN_SPECS.lumo5.source, /ASSUMED.*25\.85.*26.*2\.7.*3\.62/);
  near(trainLayout('lumo5').length, 129.7, 1e-9, 'unchanged transferred dimensions');
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
  assert.deepEqual([...ALL_KINDS].sort(), [...TRAIN_KINDS, ...EMU_KINDS, ...GC_KINDS, ...TL_KINDS].sort());
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
    // the Grand Central 180: Wikipedia and Angel Trains for the car lengths and the width; nothing else of it is printed in a page read
    'adelante.bodyWidth', 'adelante.carLength', 'adelante.drivingCarLength',
    'desiro.bodyWidth', 'desiro.doorWidth', 'desiro.floorHeight', 'desiro.wheelDiameter', 'desiro.wheelbaseMotor', 'desiro.wheelbaseTrailer',
    // the Thameslink 700: the Siemens datasheet and Wikipedia; its car lengths are worked out from two published unit lengths, so ASSUMED
    'desiro700.bodyWidth', 'desiro700.floorHeight', 'desiro700.wheelDiameter', 'desiro700.wheelbaseMotor', 'desiro700.wheelbaseTrailer',
    'electrostar.bodyWidth', 'electrostar.carLength', 'electrostar.height',
  ]);
  for (const kind of EMU_KINDS) assert.ok(TRAIN_SPECS[kind].source.length > 20, `${kind} formation is cited`);
  assert.deepEqual([ELECTROSTAR.carLength.value, ELECTROSTAR.bodyWidth.value, ELECTROSTAR.height.value], [20.39, 2.8, 3.77]);
  assert.deepEqual([DESIRO_CITY.bodyWidth.value, DESIRO_CITY.floorHeight.value, DESIRO_CITY.wheelDiameter.value, DESIRO_CITY.wheelbaseMotor.value, DESIRO_CITY.wheelbaseTrailer.value, DESIRO_CITY.doorWidth.value], [2.8, 1.1, 0.82, 2.2, 2.1, 1.5]);
});

test('train: carLength agrees with the commuter figures, and driving cars are exactly the cabs', () => {
  for (const t of ['DMSO', 'MSO', 'PTSO'] as const) assert.equal(carLength(t), ELECTROSTAR.carLength.value);
  for (const t of ['DMOS', 'TOS', 'TOSLW', 'MOS', 'PTOS'] as const) assert.equal(carLength(t), DESIRO_CITY.carLength.value);
  // the Class 700 and the Class 180 add DMCO and DMSL, the cab cars of their formations
  assert.deepEqual([...DRIVING].sort(), ['DMCO', 'DMOS', 'DMSL', 'DMSO', 'DPTF', 'DPTS']);
  assert.deepEqual(trainLayout('gn387x8'), trainLayout('gn387x8'));
});

// --- the Thameslink Class 700 and Grand Central's Class 180 -----------------------------------------------------

test('train: the Class 180 uses its fleet owner’s 23.02 m intermediate cars and reports the rounded formation total honestly', () => {
  assert.deepEqual(GC_KINDS, ['gc180x5']);
  const spec = TRAIN_SPECS.gc180x5;
  assert.equal(spec.cars.join('-'), 'DMSL-MFL-MSL-MSLRB-DMSL');
  assert.equal(spec.operator, 'Grand Central');
  assert.equal(spec.classes, '180');
  assert.equal(spec.family, 'adelante');
  assert.equal(spec.livery, 'grandcentral');
  const { cars, length } = trainLayout('gc180x5');
  assert.deepEqual(cars.map((c) => c.length), [23.71, 23.02, 23.02, 23.02, 23.71]);
  near(length, 2 * ADELANTE.drivingCarLength.value + 3 * ADELANTE.carLength.value, 1e-9, '180 formation from the chosen primary dimensions');
  near(length, 116.48, 1e-9, '180 summed car length');
  assert.match(ADELANTE.carLength.source, /https:\/\/angeltrains.co.uk\/fleet\/class-180\//);
  // a cab at each end only, and no pantograph anywhere: it is a diesel unit
  assert.deepEqual(cars.map((c) => c.cab), ['front', null, null, null, 'rear']);
  assert.ok(cars.every((c) => c.pantograph === null), 'a diesel unit has no pantograph');
  // one driven bogie a car (Wikipedia: 2'B' + B'2' + B'2' + B'2' + B'2'), the cab-end bogie of a cab car the trailing one
  assert.equal(cars.map((c) => c.motor.map((x) => (x ? 'M' : 'T')).join('')).join(' '), 'TM MT MT MT MT');
  for (const car of cars) {
    near(car.bogies[0] - car.start, ADELANTE.bogieFromEnd.value, 1e-9, `car ${car.index} first bogie`);
    near(car.end - car.bogies[1], ADELANTE.bogieFromEnd.value, 1e-9, `car ${car.index} second bogie`);
  }
  assert.ok(spec.source.includes('Wikipedia') && spec.source.includes('Angel Trains'), 'the formation names its sources');
  assert.deepEqual([ADELANTE.carLength.value, ADELANTE.drivingCarLength.value, ADELANTE.bodyWidth.value], [23.02, 23.71, 2.73]);
  assert.equal(ADELANTE.height.basis, 'assumed', 'no page read gives the 180 a height');
  // the figures the model assumes are pinned too, so changing one is a deliberate edit with its source
  assert.deepEqual([ADELANTE.bogieFromEnd.value, ADELANTE.wheelDiameter.value, ADELANTE.wheelbaseMotor.value, ADELANTE.doorWidth.value, ADELANTE.doorFromEnd.value, ADELANTE.floorHeight.value], [3.5, 0.84, 2.7, 0.9, 3.8, 1.1]);
  assert.ok(!('pantographLength' in ADELANTE), 'no pantograph figure for a diesel unit');
});

test('train: the Thameslink Class 700 is 8 or 12 Desiro City cars: 162.0 m and 242.6 m (the datasheet), with the cars worked out from the two', () => {
  assert.deepEqual(TL_KINDS, ['tl700x8', 'tl700x12']);
  assert.equal(TRAIN_SPECS.tl700x8.cars.join('-'), 'DMCO-PTSO-MSO-TSOW-TSOLW-MSO-PTSO-DMCO');
  assert.equal(TRAIN_SPECS.tl700x12.cars.join('-'), 'DMCO-PTSO-MSO-MSO-TSO-TSOW-TSOLW-TSO-MSO-MSO-PTSO-DMCO');
  for (const kind of TL_KINDS) {
    assert.equal(TRAIN_SPECS[kind].operator, 'Thameslink');
    assert.equal(TRAIN_SPECS[kind].family, 'desiro700');
    assert.equal(TRAIN_SPECS[kind].livery, 'thameslink');
    assert.match(TRAIN_SPECS[kind].classes, /700/);
  }
  assert.equal(TRAIN_SPECS.tl700x8.classes, '700/0');
  assert.equal(TRAIN_SPECS.tl700x12.classes, '700/1');
  // the Siemens datasheet's unit lengths, "162,000 mm" and "242,600 mm", exact to 0.1 m
  near(trainLayout('tl700x8').length, 162.0, 0.05, '8-car unit');
  near(trainLayout('tl700x12').length, 242.6, 0.05, '12-car unit');
  // how the cars were worked out: the 12-car unit is the 8-car unit and four intermediate cars; the end cars share what is left
  near(DESIRO_700.carLength.value, (242.6 - 162.0) / 4, 1e-9, 'intermediate car');
  near(DESIRO_700.drivingCarLength.value, (162.0 - 6 * DESIRO_700.carLength.value) / 2, 1e-9, 'end car');
  assert.deepEqual([DESIRO_700.bodyWidth.value, DESIRO_700.floorHeight.value, DESIRO_700.wheelDiameter.value, DESIRO_700.wheelbaseMotor.value, DESIRO_700.wheelbaseTrailer.value, DESIRO_700.doorWidth.value, DESIRO_700.height.value], [2.8, 1.1, 0.82, 2.2, 2.1, 1.5, 3.77]);
  assert.equal(DESIRO_700.carLength.basis, 'assumed');
  assert.equal(DESIRO_700.drivingCarLength.basis, 'assumed');
  // a check: the same car lengths give the Class 717's published 121.674 m within three centimetres
  near(2 * DESIRO_700.drivingCarLength.value + 4 * DESIRO_700.carLength.value, 121.674, 0.03, 'the 717 from the 700 car lengths');
  for (const kind of TL_KINDS) {
    for (const car of trainLayout(kind).cars) assert.equal(car.length, car.cab ? DESIRO_700.drivingCarLength.value : DESIRO_700.carLength.value, `${kind} car ${car.index}`);
  }
});

test('train: the Class 700 has a cab at each end and a pantograph on each PTSO, and its drive bogies follow the datasheet\'s axle arrangement', () => {
  for (const kind of TL_KINDS) {
    const { cars } = trainLayout(kind);
    const cabs = cars.map((c) => c.cab);
    assert.deepEqual([cabs[0], cabs[cabs.length - 1]], ['front', 'rear']);
    assert.equal(cabs.filter((c) => c !== null).length, 2, `${kind}: cabs at the two ends only`);
    for (const car of cars) {
      assert.equal(car.pantograph !== null, car.type === 'PTSO', `${kind} car ${car.index} ${car.type}`);
      if (car.pantograph) {
        near((car.pantograph[0] + car.pantograph[1]) / 2, (car.start + car.end) / 2, 1e-9, 'centred on its car');
        near(car.pantograph[1] - car.pantograph[0], 2.0, 1e-9, 'base length');
      }
      // the bogies sit the same distance in from each end of a car as the 717's (3.1 m: not published, ASSUMED)
      near(car.bogies[0] - car.start, 3.1, 1e-9, `${kind} car ${car.index} first bogie`);
      near(car.end - car.bogies[1], 3.1, 1e-9, `${kind} car ${car.index} second bogie`);
    }
  }
  const m = (k: TrainKind): string => trainLayout(k).cars.map((c) => c.motor.map((x) => (x ? 'M' : 'T')).join('')).join(' ');
  // Siemens, "Axle arrangement": 8 cars Bo'Bo' + 2'2' + Bo'Bo' + 2'2' + 2'2' + Bo'Bo' + 2'2' + Bo'Bo'; 12 cars ...
  assert.equal(m('tl700x8'), 'MM TT MM TT TT MM TT MM');
  assert.equal(m('tl700x12'), 'MM TT MM MM TT TT TT TT MM MM TT MM');
});

test('train: a PTSO is 20.39 m on a Class 387 and 20.15 m on a Class 700: the car code alone is not enough, so the family is named', () => {
  assert.equal(carLength('PTSO', 'electrostar'), ELECTROSTAR.carLength.value);
  assert.equal(carLength('PTSO', 'desiro700'), DESIRO_700.carLength.value);
  assert.equal(carLength('MSO', 'desiro700'), DESIRO_700.carLength.value);
  assert.equal(carLength('DMCO', 'desiro700'), DESIRO_700.drivingCarLength.value);
  assert.equal(carLength('DMSL', 'adelante'), ADELANTE.drivingCarLength.value);
  assert.equal(carLength('MFL', 'adelante'), ADELANTE.carLength.value);
  // with no family, the one a code first belongs to is used (the 387 for PTSO, as before)
  assert.equal(carLength('PTSO'), ELECTROSTAR.carLength.value);
  assert.equal(carLength('TSOW'), DESIRO_700.carLength.value);
  assert.equal(carLength('MSLRB'), ADELANTE.carLength.value);
  // the 387's train is unchanged by sharing the codes
  near(trainLayout('gn387x4').length, 81.56, 1e-9, '387');
});

test('train: every new unit figure names its source, and the sources are readable references, not bare names', () => {
  for (const [family, figures] of [['adelante', ADELANTE], ['desiro700', DESIRO_700]] as const) {
    for (const [name, f] of Object.entries(figures)) {
      assert.ok(f.source.length > 40, `${family}.${name} cites a real source`);
      if (f.basis === 'published') assert.match(f.source, /Wikipedia|Siemens|Angel|loco-info/, `${family}.${name} names who published it`);
    }
  }
  for (const kind of [...GC_KINDS, ...TL_KINDS]) assert.ok(TRAIN_SPECS[kind].source.length > 40, `${kind} formation is cited`);
});


test('train: AT300 car pitches cite Hitachi’s body lengths and the shared coupling gap', () => {
  assert.equal(FIGURES.drivingCarLength.value, 25.85);
  assert.equal(FIGURES.intermediateCarLength.value, 26);
  assert.match(FIGURES.drivingCarLength.source, /r2014_10_105\.pdf/);
  assert.match(FIGURES.drivingCarLength.source, /25\.350.*0\.500/);
  assert.match(FIGURES.intermediateCarLength.source, /25\.000.*1\.000/);
});
