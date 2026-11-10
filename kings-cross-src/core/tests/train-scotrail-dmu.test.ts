import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SCOTRAIL_DMU_END_GAP, SCOTRAIL_DMU_FIGURES, SCOTRAIL_DMU_KINDS, SCOTRAIL_DMU_SPECS, scotrailDmuLayout } from '../train-scotrail-dmu.ts';
import { ALL_KINDS } from '../train.ts';

test('ScotRail DMU kinds: unit lengths from the owner sheets, cars abut, two bogies a car inside it, no pantograph', () => {
  assert.deepEqual(SCOTRAIL_DMU_KINDS.map((kind) => {
    const l = scotrailDmuLayout(kind);
    return {
      kind, cars: l.cars.map((c) => c.type), lengthMm: Math.round(l.length * 1000),
      abut: l.cars.every((c, i) => i === 0 ? c.start === 0 : Math.abs(c.start - l.cars[i - 1]!.end) < 1e-9),
      cabs: l.cars.map((c) => c.cab),
      bogiesInside: l.cars.every((c) => c.bogies[0] > c.start && c.bogies[1] < c.end && c.bogies[0] < c.bogies[1]),
      pantographs: l.cars.filter((c) => c.pantograph !== null).length,
      drivenBogies: l.cars.map((c) => c.motor.filter(Boolean).length),
    };
  }), [
    { kind: 'sr170x3', cars: ['DMCL', 'MS', 'DMSL'], lengthMm: 70850, abut: true, cabs: ['front', null, 'rear'], bogiesInside: true, pantographs: 0, drivenBogies: [1, 1, 1] },
    { kind: 'sr158x2', cars: ['DMSLA', 'DMSLB'], lengthMm: 45140, abut: true, cabs: ['front', 'rear'], bogiesInside: true, pantographs: 0, drivenBogies: [1, 1] },
  ]);
});

test('ScotRail DMU figures: published lengths and widths as printed, every other figure labelled ASSUMED with a source', () => {
  const t = SCOTRAIL_DMU_FIGURES.turbostar;
  const s = SCOTRAIL_DMU_FIGURES.sprinter158;
  assert.deepEqual(
    [t.drivingLength.value, t.intermediateLength.value, t.width.value, t.height.value, s.drivingLength.value, s.width.value],
    [23.62, 23.61, 2.69, 3.77, 22.57, 2.70],
  );
  assert.deepEqual([t.width.basis, t.height.basis, s.width.basis, s.height.basis, s.bogieInset.basis, t.bogieInset.basis, SCOTRAIL_DMU_END_GAP.basis], ['published', 'published', 'published', 'assumed', 'assumed', 'assumed', 'assumed']);
  for (const fam of [t, s]) for (const [name, fig] of Object.entries(fam)) {
    assert.ok(fig.source.length > 20, `${name} has a source`);
    if (fig.basis === 'assumed') assert.match(fig.source, /ASSUMED/, `${name} says ASSUMED`);
  }
});

test('ScotRail DMU kinds stay out of the King\'s Cross kind list, and carry the Edinburgh operator code', () => {
  for (const kind of SCOTRAIL_DMU_KINDS) assert.equal((ALL_KINDS as readonly string[]).includes(kind), false);
  assert.deepEqual(SCOTRAIL_DMU_KINDS.map((k) => [SCOTRAIL_DMU_SPECS[k].operator, SCOTRAIL_DMU_SPECS[k].classes, SCOTRAIL_DMU_SPECS[k].cars.length]), [['SR', '170/4', 3], ['SR', '158', 2]]);
});
