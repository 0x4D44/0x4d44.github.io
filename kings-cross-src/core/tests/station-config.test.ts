import test from 'node:test';
import assert from 'node:assert/strict';
import { STATIONS, areaIdentity } from '../station-config.ts';

test('station selection owns explicit TD areas independently of map extent', () => {
  assert.deepEqual(STATIONS['kings-cross'].tdAreas, ['Y9']);
  assert.deepEqual(STATIONS['st-pancras'].tdAreas, ['WH', 'X0', 'CT']);
  assert.deepEqual(STATIONS['edinburgh-waverley'].tdAreas, ['EB']);
  assert.deepEqual(STATIONS['st-pancras'].platformRefs, ['A', 'B', ...Array.from({ length: 13 }, (_, n) => String(n + 1))]);
  assert.deepEqual(STATIONS['kings-cross'].tiplocs, ['KNGX']);
  assert.deepEqual(STATIONS['kings-cross'].stanox, ['54311']);
  assert.deepEqual(STATIONS['kings-cross'].platformRefs, Array.from({ length: 11 }, (_, n) => String(n)));
  assert.deepEqual(STATIONS['edinburgh-waverley'].platformRefs, Array.from({ length: 20 }, (_, n) => String(n + 1)));
  // only King's Cross has a schedule, and the legacy LNER fallback belongs to it alone
  assert.equal(STATIONS['kings-cross'].schedule, 'available');
  assert.equal(STATIONS['kings-cross'].legacyLnerFallback, true);
  assert.deepEqual(Object.keys(STATIONS), ['kings-cross', 'st-pancras', 'edinburgh-waverley']);
  for (const [id, station] of Object.entries(STATIONS)) assert.equal(station.id, id, 'each entry carries its own key as its id');
  for (const id of ['st-pancras', 'edinburgh-waverley'] as const) {
    assert.equal(STATIONS[id].schedule, 'unavailable');
    assert.equal(STATIONS[id].legacyLnerFallback, false);
    assert.deepEqual(STATIONS[id].tiplocs, []);
    assert.deepEqual(STATIONS[id].stanox, []);
  }
});
test('area identities preserve local type and cannot collide through separators', () => {
  assert.notEqual(areaIdentity('AA', 'A'), areaIdentity('BB', 'A'));
  assert.notEqual(areaIdentity('AA', 1), areaIdentity('AA', '1'));
  assert.notEqual(areaIdentity('A:B', 'C'), areaIdentity('A', 'B:C'));
});
