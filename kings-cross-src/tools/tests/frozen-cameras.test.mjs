// The station cameras are frozen: each is a literal equal to the value the graphical-fidelity baseline holds, and none depends on the model.
// tools/tests/frozen-station-cameras.json is the "station" section of gfx-rubrics/baseline/cameras.json (42 cameras; sha256 of the whole
// file 67828e1b9126847e4893f44c945183078d8dfb9671d59fc338cae8b0ba029140), the views every later capture is compared against: the scorers'
// camera check compares pos, target and fov with it and voids a view that moved. The cameras used to be computed on every run from the OSM
// station frame, the landmark plans and the terrain, so setting the Midland Grand clock tower to 73 m (Bradley 2007, the rubric's figure)
// from 76 m would have moved midland-clock-tower's aim and lens (66.5 degrees to 63.8) and voided its view.
// To change a camera on purpose, change it in tools/evidence.mjs (FROZEN_STATION_CAMERAS) and in the JSON beside this file together, and
// re-freeze the baseline with it.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { stationCameras } from '../evidence.mjs';
import { stationData } from '../station-scene.mjs';

const frozen = JSON.parse(await readFile(new URL('./frozen-station-cameras.json', import.meta.url), 'utf8'));
const { data } = stationData();

/** Where `cameras` differs from `expected`, one line per camera field (or per camera that is missing or extra), with both values. */
function differences(cameras, expected) {
  const found = [];
  for (const name of new Set([...Object.keys(expected), ...Object.keys(cameras)])) {
    const have = cameras[name], want = expected[name];
    if (!have || !want) { found.push(`${name} ${have ? 'is not in the frozen baseline' : 'is missing'}`); continue; }
    for (const field of new Set([...Object.keys(want), ...Object.keys(have)])) {
      if (!isDeepStrictEqual(have[field], want[field])) found.push(`${name}.${field} is ${JSON.stringify(have[field])}, frozen ${JSON.stringify(want[field])}`);
    }
  }
  return found;
}

test('every station camera is its frozen baseline value, field for field, and no camera is unfrozen', () => {
  const cameras = stationCameras(data);
  assert.deepEqual(differences(cameras, frozen), []);
  assert.deepEqual(Object.keys(cameras), Object.keys(frozen), 'the same names in the same order, so a capture pack lists the views as the baseline does');
});

test('a frozen camera does not depend on the model: stationCameras reads no station data', () => {
  assert.deepEqual(differences(stationCameras({}), frozen), [], 'with no station data in it');
  assert.deepEqual(differences(stationCameras(), frozen), [], 'with no argument');
});

test('every call returns fresh cameras, so editing what one call returned changes nothing for the next', () => {
  const first = stationCameras(data);
  first.overview.pos[0] += 100;
  first['midland-clock-tower'].fov = 1;
  first['midland-clock-tower'].source = 'edited';
  delete first.top;
  first.extra = { pos: [0, 0, 0], target: [0, 0, 1], source: 'extra' };
  assert.deepEqual(differences(stationCameras(data), frozen), []);
});
