// The far city of the night (owner: A1): farCityLights() is the pure generator behind the lights on the distant hillsides (engine/glow.js).
// Under node, on the real plan: deterministic, never inside the plot, always above the ground, where the land is built up, in a sane number,
// in a mix of colours that switch on one by one through the dusk.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/glow-city.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farCityLights } from '../js/engine/glow.js';
import { makeFarHeight, urbanDensity } from '../js/world/periphery.js';
import { makePlan } from './world-lib.mjs';

const { plan } = makePlan();
const far = makeFarHeight(plan), density = (x, z) => urbanDensity(plan, x, z);
const real = farCityLights({ far, density, seed: plan.seed });
const flat = () => 0, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('the city is deterministic for a seed and changes with the seed', () => {
  assert.deepEqual(farCityLights({ far, density, seed: plan.seed }), real);
  const other = farCityLights({ far, density, seed: plan.seed + 1 });
  assert.notDeepEqual(other.slice(0, 20), real.slice(0, 20));
  assert.ok(Math.abs(other.length - real.length) < real.length * 0.2, `another seed gives a similar size (${other.length} vs ${real.length})`);
});

test('a few thousand lights, none in the plot, every one above the ground and inside the camera range', (t) => {
  t.diagnostic(`${real.length} far-city lights`);
  assert.ok(real.length > 1500 && real.length <= 9000, `${real.length} lights`);
  for (const p of real) {
    assert.ok(!(Math.abs(p.x) < 108 && Math.abs(p.z) < 108), `light inside the plot at ${p.x.toFixed(0)}, ${p.z.toFixed(0)}`);
    assert.ok(p.y >= far(p.x, p.z) + 2.3 && p.y <= far(p.x, p.z) + 8.5, `height above ground ${(p.y - far(p.x, p.z)).toFixed(2)} m`);
    assert.ok(Math.hypot(p.x, p.z) < 900, `${Math.hypot(p.x, p.z).toFixed(0)} m away: beyond the far plane`);
  }
});

test('lights are scattered, not laid out on a lattice, and stand at different heights (street lamps, windows, roofs)', () => {
  const sd = (a) => Math.sqrt(mean(a.map((v) => (v - mean(a)) ** 2)));
  const fx = real.map((p) => ((p.x / 12) % 1 + 1) % 1), fz = real.map((p) => ((p.z / 12) % 1 + 1) % 1);
  assert.ok(sd(fx) > 0.2 && sd(fz) > 0.2, `position inside its cell: sd ${sd(fx).toFixed(2)}, ${sd(fz).toFixed(2)} (a lattice scores 0)`);
  const up = real.map((p) => p.y - far(p.x, p.z));
  assert.ok(Math.max(...up) - Math.min(...up) > 3, `heights above ground span ${Math.min(...up).toFixed(1)} to ${Math.max(...up).toFixed(1)} m`);
});

test('the lights sit where the land is built up: nothing on bare land, many more over the valley district than behind the hill', () => {
  assert.deepEqual(farCityLights({ far, density: flat, seed: plan.seed }), [], 'no density, no city');
  const dens = real.map((p) => density(p.x, p.z));
  assert.ok(mean(dens) > 0.25, `mean density under the lights ${mean(dens).toFixed(2)}`);
  assert.ok(dens.filter((d) => d <= 0.02).length < real.length * 0.01, 'lights on land that urbanDensity calls empty (a jittered edge cell or two is fine)');
  const south = real.filter((p) => p.z > 135).length, north = real.filter((p) => p.z < -135).length;
  assert.ok(south > north * 3, `valley ${south} vs hill ${north}: the city lies down the valley`);
  const half = farCityLights({ far, density: (x, z) => density(x, z) * 0.5, seed: plan.seed });
  assert.ok(half.length < real.length * 0.75 && half.length > real.length * 0.2, `half the density keeps ${half.length} of ${real.length}`);
});

test('colours and switch-on times are mixed: sodium orange, warm white, cool white, and a dusk that takes a while', () => {
  const kind = (rgb) => (rgb[2] < rgb[0] * 0.3 ? 'orange' : rgb[2] < rgb[0] * 0.75 ? 'warm' : rgb[2] < rgb[0] * 1.5 ? 'cool' : 'blue');
  const seen = new Set(real.map((p) => kind(p.rgb)));
  assert.ok(seen.has('orange') && seen.has('warm') && seen.has('cool'), `colours: ${[...seen]}`);
  const on = real.map((p) => p.on), sd = Math.sqrt(mean(on.map((v) => (v - mean(on)) ** 2)));
  assert.ok(Math.min(...on) >= 0 && Math.max(...on) <= 1 && sd > 0.2, `switch-on times 0..1 spread (sd ${sd.toFixed(2)})`);
  const sizes = real.map((p) => p.size);
  assert.ok(Math.min(...sizes) >= 2.4 && Math.max(...sizes) <= 4.8 && Math.max(...sizes) - Math.min(...sizes) > 1.5, 'halo sizes 2.4 to 4.8 m, varied');
  for (const p of real) assert.ok(p.rgb.every((v) => v > 0.2 && v < 3), `rgb ${p.rgb}`);
});

test('the cap holds: a city that would be larger is cut, not made slow', () => {
  const capped = farCityLights({ far, density: () => 1, seed: 1, max: 500 });
  assert.equal(capped.length, 500);
});
