import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SR385_DOORS, SR385_FIGURES, SR385_KINDS, SR385_SPECS, bodySpan, sr385Layout } from '../train-385.ts';

const near = (a: number, b: number, eps = 1e-9): boolean => Math.abs(a - b) <= eps;

test('every 385 figure names its source, and every guess says ASSUMED', () => {
  for (const [name, f] of Object.entries({ ...SR385_FIGURES, ...SR385_DOORS })) {
    assert.ok(f.source.length > 40, `${name} has a source`);
    assert.ok(['published', 'drawn', 'assumed'].includes(f.basis), `${name} basis`);
    if (f.basis === 'assumed') assert.match(f.source, /ASSUMED/, `${name} says ASSUMED`);
  }
  // the published pitches are the drawing's body plus the interval, and agree with the infobox to a millimetre
  assert.ok(near(SR385_FIGURES.drivingCarPitch.value, 23.1785 + 0.92 / 2));
  assert.ok(near(SR385_FIGURES.intermediateCarPitch.value, 22.08 + 0.92));
  assert.ok(Math.abs(SR385_FIGURES.drivingCarPitch.value - 23.639) < 0.001);
  assert.deepEqual(['bodyWidth', 'crown', 'wheelbase', 'bogieFromInnerEnd'].map(k => SR385_FIGURES[k as keyof typeof SR385_FIGURES].basis), ['assumed', 'assumed', 'assumed', 'assumed']);
});

test('the 3-car and 4-car units have the published formations, lengths, traction bogies and one pantograph on the PTS', () => {
  const x3 = sr385Layout('sr385x3'), x4 = sr385Layout('sr385x4');
  assert.deepEqual(SR385_KINDS, ['sr385x3', 'sr385x4']);
  assert.deepEqual([x3.cars.map(c => c.type), x4.cars.map(c => c.type)], [['DMSL', 'PTS', 'DMSL'], ['DMCL', 'PTS', 'TS', 'DMSL']]);
  assert.ok(near(x3.length, 70.277, 1e-6) && near(x4.length, 93.277, 1e-6), `${x3.length} ${x4.length}`);
  // Bo'Bo'+2'2'+Bo'2' and Bo'Bo'+2'2'+2'2'+Bo'Bo'
  assert.deepEqual(x3.cars.map(c => c.motor), [[true, true], [false, false], [true, false]]);
  assert.deepEqual(x4.cars.map(c => c.motor), [[true, true], [false, false], [false, false], [true, true]]);
  assert.deepEqual([x3, x4].map(l => l.cars.filter(c => c.pantograph).map(c => c.type)), [['PTS'], ['PTS']]);
  assert.deepEqual([x3, x4].map(l => l.cars.map(c => c.cab)), [['front', null, 'rear'], ['front', null, null, 'rear']]);
  assert.deepEqual(SR385_SPECS.sr385x3.classes, '385/0');
});

test('cars abut, bogies and doors lie inside their bodies, and the two cab ends mirror each other', () => {
  for (const kind of SR385_KINDS) {
    const l = sr385Layout(kind);
    l.cars.forEach((c, i) => {
      assert.ok(near(c.start, l.cars[i - 1]?.end ?? 0) && near(c.end - c.start, c.length), `${kind} car ${i} abuts`);
      const [b0, b1] = bodySpan(c);
      assert.ok(b0 >= c.start && b1 <= c.end && b1 - b0 > 22, `${kind} car ${i} body inside its pitch`);
      for (const z of [...c.bogies, ...c.doors]) assert.ok(z > b0 + 1 && z < b1 - 1, `${kind} car ${i}: ${z} inside ${b0}-${b1}`);
      assert.equal(c.doors.length, 2);
      assert.ok(c.bogies[0] < c.bogies[1]);
    });
    const f = l.cars[0]!, r = l.cars.at(-1)!;
    assert.ok(near(f.bogies[0] - f.start, r.end - r.bogies[1]), `${kind}: cab bogies mirror`);
    assert.ok(near(f.crewDoor! - f.start, r.end - r.crewDoor!), `${kind}: crew doors mirror`);
    assert.ok(near(f.doors[0]! - f.start, f.type === 'DMCL' ? SR385_DOORS.DMCL.value : SR385_DOORS.DMSL.value));
    assert.ok(near(r.end - r.doors[1]!, SR385_DOORS.DMSL.value));
  }
});
