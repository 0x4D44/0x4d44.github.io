// tools/scene-pin.mjs: the ?time= / ?weather= / ?sky= pin the capture tools put on the page address.
import assert from 'node:assert/strict';
import test from 'node:test';
import { PIN_TIME, PIN_WEATHER, WEATHER_NAMES, pinHonoured, pinParameters, scenePinFrom, withPin } from '../scene-pin.mjs';

test('the default pin is midsummer noon in London with a clear sky', () => {
  assert.equal(PIN_TIME, '2026-06-21T12:00:00+01:00');
  assert.equal(PIN_WEATHER, 'clear');
  assert.deepEqual(scenePinFrom(), { mode: 'pinned', time: PIN_TIME, weather: PIN_WEATHER });
  assert.deepEqual(scenePinFrom({}), { mode: 'pinned', time: PIN_TIME, weather: PIN_WEATHER });
  assert.deepEqual(scenePinFrom({ weather: 'rain' }), { mode: 'pinned', time: PIN_TIME, weather: 'rain' });
  assert.deepEqual(scenePinFrom({ time: '2026-11-09T16:25:00Z' }), { mode: 'pinned', time: '2026-11-09T16:25:00Z', weather: 'clear' });
});

test('the weather names are the ones the page documents', () => {
  assert.deepEqual([...WEATHER_NAMES], ['clear', 'cloudy', 'overcast', 'drizzle', 'rain', 'heavy-rain', 'thunder', 'mist', 'fog', 'snow', 'off', '0']);
  for (const name of WEATHER_NAMES) assert.equal(scenePinFrom({ weather: name }).weather, name);
});

test('a time the page could not read is refused here instead of silently showing the live clock', () => {
  for (const time of ['2026-11-09T16:25:00Z', '2026-11-09T16:25Z', '2026-11-09T16:25:30.250Z', '2026-06-21T13:00:00+01:00', '2026-06-21T07:00:00-05:00', '1782000000000']) {
    assert.equal(scenePinFrom({ time }).time, time, time);
  }
  for (const time of ['2026-11-09T16:25:00', '2026-11-09', '16:25', '1782000000', '17820000000000', 'noon', '', '2026-13-45T00:00:00Z', '2026-06-21 12:00:00Z', '2026-06-21T12:00:00+0100']) {
    assert.throws(() => scenePinFrom({ time }), /--time must be an ISO 8601 instant with a zone/, `time ${JSON.stringify(time)}`);
  }
});

test('a weather the page does not know is refused', () => {
  for (const weather of ['rainy', 'Clear', '', '__proto__', 'constructor', 'clear,rain', 'clear&sky=ref']) {
    assert.throws(() => scenePinFrom({ weather }), /--weather must be one of/, `weather ${JSON.stringify(weather)}`);
  }
});

test('--sky ref is the old fixed look and excludes a time or a weather', () => {
  assert.deepEqual(scenePinFrom({ sky: 'ref' }), { mode: 'ref' });
  assert.throws(() => scenePinFrom({ sky: 'day' }), /--sky must be ref/);
  assert.throws(() => scenePinFrom({ sky: 'ref', time: PIN_TIME }), /cannot be combined/);
  assert.throws(() => scenePinFrom({ sky: 'ref', weather: 'clear' }), /cannot be combined/);
});

test('the zone offset reaches the page as %2B: a bare + would read back as a space and the time would be ignored', () => {
  const query = pinParameters(scenePinFrom());
  assert.equal(query, 'time=2026-06-21T12%3A00%3A00%2B01%3A00&weather=clear');
  assert.ok(!query.includes('+'));
  const read = new URLSearchParams(`?${query}`);
  assert.equal(read.get('time'), PIN_TIME, 'URLSearchParams, as the page reads it, gives the time back unchanged');
  assert.equal(read.get('weather'), 'clear');
  assert.equal(new URLSearchParams('?time=2026-06-21T12:00:00+01:00').get('time'), '2026-06-21T12:00:00 01:00', 'the unencoded form is what would break');
  assert.equal(pinParameters({ mode: 'ref' }), 'sky=ref');
  assert.equal(pinParameters(scenePinFrom({ time: '1782000000000', weather: 'heavy-rain' })), 'time=1782000000000&weather=heavy-rain');
});

test('withPin adds the pin to a query, and leaves a page with a look of its own alone', () => {
  const pin = scenePinFrom();
  const parameters = pinParameters(pin);
  assert.equal(withPin('', pin), `?${parameters}`);
  assert.equal(withPin('?trains=none&board=0', pin), `?trains=none&board=0&${parameters}`);
  assert.equal(withPin('?trains=replay&date=20261107&speed=8', pin), `?trains=replay&date=20261107&speed=8&${parameters}`);
  assert.equal(withPin('?trains=none&bare=1&grid=1&board=0', pin), '?trains=none&bare=1&grid=1&board=0', 'bare is already the fixed look, with no clock or weather');
  assert.equal(withPin('?sky=ref', pin), '?sky=ref');
  assert.equal(withPin('?time=1782000000000', pin), '?time=1782000000000');
  assert.equal(withPin('?trains=none&weather=snow', pin), '?trains=none&weather=snow');
  assert.equal(withPin('?trains=none', { mode: 'ref' }), '?trains=none&sky=ref');
  assert.equal(withPin('', { mode: 'ref' }), '?sky=ref');
  assert.equal(withPin('?barefoot=1&dateline=2', pin), `?barefoot=1&dateline=2&${parameters}`, 'only whole parameter names count');
});

test('the pin counts as applied only when the page built a sky of its own', () => {
  const pinned = scenePinFrom(), ref = scenePinFrom({ sky: 'ref' });
  assert.equal(pinHonoured(pinned, { sunElevationDeg: 61.2 }), true);
  assert.equal(pinHonoured(pinned, { sunElevationDeg: null }), true);
  assert.equal(pinHonoured(pinned, 'absent'), false, 'a build from before the sky and weather work ignores the pin');
  assert.equal(pinHonoured(pinned, 'fixed'), false);
  assert.equal(pinHonoured(pinned, null), false);
  assert.equal(pinHonoured(ref, 'absent'), true, 'the old look is what such a build always shows');
  assert.equal(pinHonoured(ref, 'fixed'), true);
  assert.equal(pinHonoured(ref, { sunElevationDeg: 61.2 }), false, 'a live sky is not the old look');
});
