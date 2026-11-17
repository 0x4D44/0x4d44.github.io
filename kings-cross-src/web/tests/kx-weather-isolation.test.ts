import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { remoteWeatherSnapshot } from './weather-isolation-snapshot.ts';

test('Waverley and Perth weather/day-clear shaders and uniforms retain the pre-KX-option receipt, including after KX activation', () => {
  const expected = JSON.parse(readFileSync(new URL('./fixtures/remote-weather-322a72a3.json', import.meta.url), 'utf8'));
  for (const station of ['wv', 'pt'] as const) for (const weather of ['rain', 'fog', 'snow', 'clear']) {
    const plain = remoteWeatherSnapshot(station, weather, false), afterKx = remoteWeatherSnapshot(station, weather, true);
    // assert.ok avoids dumping a large scene/shader receipt on a regression.
    assert.ok(JSON.stringify(afterKx) === JSON.stringify(plain), `${station}/${weather}: KX activation leaked into the remote climate`);
    const digest = createHash('sha256').update(JSON.stringify(plain)).digest('hex');
    assert.equal(digest, expected[station + '/' + weather], `${station}/${weather}: changed pre-round-5 shader sources, uniforms, defines or weather objects`);
  }
});
