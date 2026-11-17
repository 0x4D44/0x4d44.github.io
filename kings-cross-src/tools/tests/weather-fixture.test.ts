import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createPrecip } from '../../web/src/precip.ts';
import { pinWeatherPhase, weatherFixtureHonoured } from '../weather-fixture.mjs';

test('comparison precipitation keeps its shader inputs identical across different browser frame timings', () => {
  const precip = createPrecip();
  try {
    assert.throws(() => pinWeatherPhase(precip, NaN));
    pinWeatherPhase(precip, 12);
    const frame = { camera: new THREE.Vector3(10, 20, 50), target: new THREE.Vector3(), distance: 55,
      rain: 1, snow: 1, windMs: 2, daylight: .12, timeS: 3 };
    precip.update(frame);
    const rain = precip.rain.material as THREE.ShaderMaterial, snow = precip.snow.material as THREE.ShaderMaterial;
    assert.equal(rain.uniforms.uTime!.value, 12, 'a pinned sun clock must also pin the precipitation phase for comparisons');
    assert.equal(snow.uniforms.uTime!.value, 12);
    const snapshot = () => JSON.stringify([rain.uniforms, snow.uniforms]);
    const first = snapshot();
    precip.update({ ...frame, timeS: 47.81 });
    assert.equal(snapshot(), first);
    assert.equal(frame.timeS, 3, 'the capture fixture must not mutate caller frames');
    const fixture = { phaseSeconds: 12, rainTime: 12, snowTime: null, synthetic: { animated: false, travelledM: 0 } };
    assert.equal(weatherFixtureHonoured('wv', fixture), true);
    assert.equal(weatherFixtureHonoured('wv', { ...fixture, synthetic: { animated: true, travelledM: 50 } }), false);
    assert.equal(weatherFixtureHonoured('pt', { ...fixture, rainTime: 47.81 }), false);
    assert.equal(weatherFixtureHonoured('pt', null), false);
    assert.equal(weatherFixtureHonoured('kx', null), true);
  } finally { precip.dispose(); }
});
