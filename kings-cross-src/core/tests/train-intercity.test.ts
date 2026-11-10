import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HST, INTERCITY_KINDS, INTERCITY_SPECS, intercityLayout, VOYAGER } from '../train-intercity.ts';

test('intercity formations: car counts, types, lengths and overall lengths from the published and drawn figures', () => {
  assert.deepEqual(INTERCITY_KINDS.map((kind) => {
    const l = intercityLayout(kind);
    return [kind, l.cars.map((c) => c.type), l.cars.map((c) => c.length), Math.round(l.length * 100)];
  }), [
    ['xc220x4', ['DMS', 'MS', 'MSRMB', 'DMF'], [23.85, 23, 23, 23.85], 9370],
    ['xc221x5', ['DMS', 'MS', 'MS', 'MSRMB', 'DMF'], [23.85, 23, 23, 23, 23.85], 11670],
    ['srhstx4', ['PC', 'TF', 'TS', 'TS', 'TGS', 'PC'], [17.79, 23, 23, 23, 23, 17.79], 12758],
    ['srhstx5', ['PC', 'TF', 'TS', 'TS', 'TS', 'TGS', 'PC'], [17.79, 23, 23, 23, 23, 23, 17.79], 15058],
  ]);
});

test('intercity cars are contiguous from the nose, with a cab at each end only and the bodies each car type takes', () => {
  for (const kind of INTERCITY_KINDS) {
    const { cars, length, spec } = intercityLayout(kind);
    assert.equal(cars[0]!.start, 0, kind);
    assert.ok(Math.abs(cars[cars.length - 1]!.end - length) < 1e-9, kind);
    cars.forEach((c, i) => {
      assert.equal(c.index, i);
      if (i > 0) assert.ok(Math.abs(c.start - cars[i - 1]!.end) < 1e-9, `${kind} car ${i} starts where the last ended`);
      assert.ok(Math.abs(c.end - c.start - c.length) < 1e-9);
      assert.equal(c.cab, i === 0 ? 'front' : i === cars.length - 1 ? 'rear' : null, `${kind} car ${i} cab`);
      assert.equal(c.pantograph, null);
      const want = spec.family === 'hst' ? (c.type === 'PC' ? 'class43' : 'mk3') : 'voyager';
      assert.equal(c.body, want, `${kind} car ${i} body`);
    });
  }
});

test('intercity bogies: the figures place them, a rear cab mirrors the front, and only the Mk3 coaches are unpowered', () => {
  const round = (z: number): number => Math.round(z * 100) / 100;
  const xc = intercityLayout('xc220x4').cars;
  assert.deepEqual(xc.map((c) => c.bogies.map(round)), [[4.77, 20.77], [27.35, 43.35], [50.35, 66.35], [72.93, 88.93]]);
  const hst = intercityLayout('srhstx4').cars;
  assert.deepEqual(hst.map((c) => c.bogies.map(round)), [[3.95, 14.2], [21.29, 37.29], [44.29, 60.29], [67.29, 83.29], [90.29, 106.29], [113.38, 123.63]]);
  for (const kind of INTERCITY_KINDS) {
    for (const c of intercityLayout(kind).cars) {
      assert.deepEqual(c.motor, c.body === 'mk3' ? [false, false] : [true, true], `${kind} car ${c.index} motors`);
      const span = c.body === 'voyager' ? VOYAGER.bogieCentres.value : c.body === 'class43' ? HST.powerCarBogieCentres.value : HST.coachBogieCentres.value;
      assert.ok(Math.abs(c.bogies[1]! - c.bogies[0]! - span) < 1e-9, `${kind} car ${c.index} bogie centres`);
      assert.ok(c.bogies[0]! > c.start && c.bogies[1]! < c.end);
    }
  }
});

test('intercity figures carry a basis and a source, and every assumed figure says ASSUMED', () => {
  const figures = [...Object.values(VOYAGER), ...Object.values(HST)];
  assert.deepEqual({
    missing: figures.filter((f) => !f.source || !Number.isFinite(f.value) || f.value <= 0).length,
    unmarked: figures.filter((f) => f.basis === 'assumed' && !f.source.startsWith('ASSUMED')).length,
    marked: figures.filter((f) => f.basis !== 'assumed' && f.source.startsWith('ASSUMED')).length,
    bases: [...new Set(figures.map((f) => f.basis))].sort(),
    published: [VOYAGER.drivingCarLength.basis, VOYAGER.bodyWidth.basis, HST.powerCarLength.basis, HST.coachLength.basis, HST.bodyWidth.basis, HST.height.basis],
  }, { missing: 0, unmarked: 0, marked: 0, bases: ['assumed', 'drawn', 'published'], published: ['published', 'published', 'published', 'published', 'published', 'published'] });
  for (const kind of INTERCITY_KINDS) assert.ok(INTERCITY_SPECS[kind].source.length > 40, `${kind} names its sources`);
});
