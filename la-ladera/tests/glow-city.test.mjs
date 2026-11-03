// The far city of the night (owner: A1): farCityLights() is the pure generator behind the lights on the distant hillsides (engine/glow.js).
// Under node, on the real plan: deterministic, never inside the plot, always above the ground, where the land is built up, in a sane number,
// in a mix of colours that switch on one by one through the dusk.
//   node --import ./la-ladera/tests/register.mjs --test la-ladera/tests/glow-city.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { farCityLights } from '../js/engine/glow.js';
import { makeFarHeight, urbanDensity } from '../js/world/periphery.js';
import { makePlan } from './world-lib.mjs';
import { SEA } from '../js/world/coast.js';

const { plan } = makePlan();
const far = makeFarHeight(plan), density = (x, z) => urbanDensity(plan, x, z);
const real = farCityLights({ far, density, seed: plan.seed });
const flat = () => 0, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

test('the city is deterministic for a seed and changes with the seed', () => {
  assert.deepEqual(farCityLights({ far, density, seed: plan.seed }), real);
  const other = farCityLights({ far, density, seed: plan.seed + 1 });
  assert.notDeepEqual(other.slice(0, 20), real.slice(0, 20));
  assert.ok(Math.abs(other.length - real.length) < real.length * 0.35, `another seed gives a similar size (${other.length} vs ${real.length})`);       // 0.2 of the valley city's 2,700 lights, 0.35 of the few hundred on the flanks and the headland: one patch of the "quarter" noise is a larger share now
  // the seed decides WHICH cells are lit, not only where inside a cell the light stands: two seeds share well under half of their lit 12 m cells
  const cells = (list) => new Set(list.map((p) => `${Math.floor(p.x / 12)},${Math.floor(p.z / 12)}`));
  const a = cells(real), b = cells(other), both = [...a].filter((k) => b.has(k)).length, jaccard = both / (a.size + b.size - both);
  assert.ok(jaccard < 0.45, `lit cells shared between two seeds: ${(jaccard * 100).toFixed(0)}% (an unseeded selection shares ~60%, a seeded one ~30%)`);
});

test('the plot stays free of far lights whatever the density says, and the lights start right outside it', () => {
  const all = farCityLights({ far, density: () => 1, seed: 3, max: 1e6 });
  assert.ok(all.length > 5000, `${all.length} lights on a fully built-up land`);
  const inside = all.filter((p) => Math.abs(p.x) < 108 && Math.abs(p.z) < 108);
  assert.equal(inside.length, 0, `${inside.length} lights inside the plot (the plot has its own lamps)`);
  const edge = Math.min(...all.map((p) => Math.max(Math.abs(p.x), Math.abs(p.z))));
  assert.ok(edge < 125, `the first light stands ${edge.toFixed(0)} m from the plot centre: the free zone must not grow past the wall`);
});

test('a few thousand lights, none in the plot, every one above the ground and inside the camera range', (t) => {
  t.diagnostic(`${real.length} far-city lights`);
  assert.ok(real.length > 300 && real.length <= 9000, `${real.length} lights`);                            // the valley city is gone (round 7, the bay): the lights climb the flanks and the headland village, a few hundred
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

test('the lights sit where the land is built up: nothing on bare land or in the sea, many more around the bay and on the flanks than behind the hill', () => {
  assert.deepEqual(farCityLights({ far, density: flat, seed: plan.seed }), [], 'no density, no city');
  const dens = real.map((p) => density(p.x, p.z));
  assert.ok(mean(dens) > 0.25, `mean density under the lights ${mean(dens).toFixed(2)}`);
  assert.ok(dens.filter((d) => d <= 0.02).length < real.length * 0.02, 'lights on land that urbanDensity calls empty (a jittered edge cell or two is fine)');
  const bay = real.filter((p) => p.z > -135).length, north = real.filter((p) => p.z < -135).length;
  assert.ok(bay > north * 3, `bay and flanks ${bay} vs hill ${north}: the city lies round the bay (the valley city is gone, round 7)`);
  assert.ok(farCityLights({ far, density: () => 1, seed: 3, max: 1e6 }).some((p) => far(p.x, p.z) <= SEA), 'TEETH: a map built up everywhere does put lights in the sea, so the check below can fail');
  assert.ok(real.every((p) => far(p.x, p.z) > SEA), 'no light stands in the sea');
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
