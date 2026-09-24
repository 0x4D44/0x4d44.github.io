import test from 'node:test';
import assert from 'node:assert/strict';
import { DEG, mat4Invert, mat4LookAt, mat4Multiply, mat4Perspective, mat4TransformPoint } from '../src/math.js';
import { MATERIALS, deriveRenderEnvironment } from '../src/renderer.js';
import { surfaceMaterials } from '../src/world.js';

const PALETTE = { sky: '#15241e', terrain: '#536347', road: '#817563', water: '#344e55' };
const finiteTriple = value => Array.isArray(value) && value.length === 3 && value.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 1);

test('matrix inversion round-trips a real camera transform', () => {
  const projection = mat4Perspective(61 * DEG, 16 / 9, 0.12, 730);
  const view = mat4LookAt({ x: 12, y: 3.4, z: -48 }, { x: 14, y: 1.2, z: -20 });
  const viewProjection = mat4Multiply(projection, view);
  const inverse = mat4Invert(viewProjection);
  assert.ok(inverse, 'a camera matrix must be invertible');
  const product = mat4Multiply(viewProjection, inverse);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      const expected = row === column ? 1 : 0;
      assert.ok(Math.abs(product[column * 4 + row] - expected) < 1e-4, `element ${row},${column} = ${product[column * 4 + row]}`);
    }
  }
  assert.equal(mat4Invert(new Float32Array(16)), null, 'a singular matrix has no inverse');
});

test('the sky ray through screen centre points where the camera looks', () => {
  // This is the sky shader's own arithmetic: unproject the far plane, subtract
  // the eye, normalise. If it drifts, the sun and cloud deck stop being
  // world-anchored and slide around with the camera again.
  const eye = { x: 8, y: 2.5, z: -30 };
  const target = { x: 8 + 3, y: 2.1, z: -30 + 9 };
  const projection = mat4Perspective(58 * DEG, 16 / 9, 0.12, 900);
  const inverse = mat4Invert(mat4Multiply(projection, mat4LookAt(eye, target)));
  const far = mat4TransformPoint(inverse, 0, 0, 1);
  const direction = { x: far.x / far.w - eye.x, y: far.y / far.w - eye.y, z: far.z / far.w - eye.z };
  const length = Math.hypot(direction.x, direction.y, direction.z);
  const forward = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
  const forwardLength = Math.hypot(forward.x, forward.y, forward.z);
  const dot = (direction.x * forward.x + direction.y * forward.y + direction.z * forward.z) / (length * forwardLength);
  assert.ok(dot > 0.9999, `centre ray is ${Math.acos(dot) * 180 / Math.PI} degrees off the view direction`);
  // A ray towards the top of the screen must rise above the centre ray.
  const top = mat4TransformPoint(inverse, 0, 0.9, 1);
  assert.ok(top.y / top.w - eye.y > direction.y, 'the top of the screen must look higher than its centre');
});

test('render environment stays inside its bounds for every authored weather', () => {
  const cases = [
    { id: 'clear-noon', precipitation: 'none', roadWetness: 0, wind: .08, timeOfDay: 'day', visibilityM: 2600 },
    { id: 'ridge-mist', precipitation: 'rain', roadWetness: .28, wind: .36, timeOfDay: 'dusk', visibilityM: 850 },
    { id: 'coastal-storm', precipitation: 'storm', roadWetness: .92, wind: .94, timeOfDay: 'dusk', visibilityM: 520 },
    { id: 'night-snow', precipitation: 'snow', roadWetness: .4, wind: .5, timeOfDay: 'night', visibilityM: 700 }
  ];
  for (const weather of cases) {
    const environment = deriveRenderEnvironment(PALETTE, weather);
    for (const key of ['skyTop', 'skyHorizon', 'skyLower', 'fogColor', 'sunColor', 'sunLight', 'skyAmbient', 'groundAmbient', 'cloudColor', 'cloudShade']) {
      assert.ok(finiteTriple(environment[key]), `${weather.id}.${key} = ${JSON.stringify(environment[key])}`);
    }
    assert.ok(environment.exposure >= 0.85 && environment.exposure <= 1.9, `${weather.id} exposure=${environment.exposure}`);
    assert.ok(environment.ambientStrength > 0.2 && environment.ambientStrength < 0.75);
    assert.ok(environment.cloudCover >= 0 && environment.cloudCover <= 0.93);
    assert.ok(environment.sunSize > 0 && environment.sunSize < 0.01);
    assert.ok(environment.fogFar > environment.fogNear);
    assert.ok(Object.isFrozen(environment.sunLight));
    const sunSpread = Math.max(...environment.sunColor) - Math.min(...environment.sunColor);
    const lightSpread = Math.max(...environment.sunLight) - Math.min(...environment.sunLight);
    assert.ok(lightSpread <= sunSpread + 1e-9, `${weather.id} key light is more saturated than the sun disc`);
  }
});

test('weather drives the sky, the clouds and the night', () => {
  const clear = deriveRenderEnvironment(PALETTE, { precipitation: 'none', timeOfDay: 'day', visibilityM: 2600 });
  const storm = deriveRenderEnvironment(PALETTE, { precipitation: 'storm', roadWetness: .9, wind: .9, timeOfDay: 'day', visibilityM: 520 });
  const night = deriveRenderEnvironment(PALETTE, { precipitation: 'none', timeOfDay: 'night', visibilityM: 1400 });
  assert.ok(storm.cloudCover > clear.cloudCover * 2, `${storm.cloudCover} vs ${clear.cloudCover}`);
  assert.ok(storm.ambientStrength > clear.ambientStrength, 'an overcast sky is mostly ambient light');
  assert.ok(storm.sunStrength < clear.sunStrength);
  assert.equal(clear.nightFactor, 0);
  assert.ok(night.nightFactor > 0, 'night must light the star field');
  assert.ok(night.exposure > clear.exposure, 'a night stage needs to be exposed up to stay readable');
  // The horizon is where the fog meets the sky; they must not read as two
  // different colours or the backdrop cuts a hard line across the view.
  for (const environment of [clear, storm, night]) {
    const distance = Math.hypot(...environment.fogColor.map((channel, index) => channel - environment.skyHorizon[index]));
    assert.ok(distance < 0.2, `fog and horizon drifted apart by ${distance}`);
  }
});

test('a wet road answers the light differently from a dry one', () => {
  const dry = surfaceMaterials({ roadWetness: 0, precipitation: 'none' });
  const wet = surfaceMaterials({ roadWetness: .9, precipitation: 'storm' });
  assert.ok(wet.ground.specular > dry.ground.specular * 3, `${wet.ground.specular} vs ${dry.ground.specular}`);
  assert.ok(wet.ground.shininess > dry.ground.shininess);
  assert.ok(wet.ground.fresnel > dry.ground.fresnel);
  assert.ok(wet.shadowStrength < dry.shadowStrength, 'a dull wet day casts a softer shadow');
  for (const material of [dry.ground, dry.body, dry.glass, dry.wheel, wet.ground]) {
    assert.ok(material.specular >= 0 && material.specular <= 1);
    assert.ok(material.shininess >= 1);
  }
  assert.ok(MATERIALS.glass.specular > MATERIALS.rubber.specular, 'glass must be shinier than a tyre');
  assert.ok(Object.isFrozen(MATERIALS.bodywork));
});

test('baked ground shadows fall away from the sun and lengthen as it drops', async () => {
  const { groundShadowCast } = await import('../src/world.js');
  const noon = groundShadowCast([.1, .98, .1]);
  const dusk = groundShadowCast([.6, .25, .5]);
  assert.ok(dusk.reach > noon.reach * 3, `${dusk.reach} vs ${noon.reach}`);
  assert.ok(dusk.stretch > noon.stretch);
  // The shadow points opposite the sun's horizontal direction.
  assert.ok(dusk.dx < 0 && dusk.dz < 0, JSON.stringify(dusk));
  const flat = groundShadowCast([1, 0, 0]);
  assert.ok(Number.isFinite(flat.reach) && flat.reach <= 2.4, 'a horizon sun must not throw an infinite shadow');
  assert.ok(Number.isFinite(groundShadowCast(null).heading));
});
