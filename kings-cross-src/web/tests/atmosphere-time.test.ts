// web/src/atmosphere.ts, the time-of-day and weather half: that what core/solar.ts and core/daylight.ts work out REACHES the scene, in the same words:
// the scene's lights are the rig's, the sun disc and the stars are where and how bright the rig says, the dome is repainted when the sun has moved or
// the sky has changed, the rain is driven by the frame and the weather, and nothing the atmosphere made outlives it. (atmosphere.test.ts holds the
// larger shape: noon, midnight, dusk, the wet ground, the throttle. The numbers themselves are tested where they are worked out, in core/tests.)
// Nothing here pins a colour or a lamp share: the lights are held to the rig's own colours, whatever they are tuned to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { fogAmount, skyRig } from '../../core/daylight.ts';
import type { KxData } from '../../core/osm.ts';
import { solarPosition, sunDirection } from '../../core/solar.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { createAtmosphere, REFERENCE } from '../src/atmosphere.ts';
import { furniturePlan } from '../src/furniture.ts';
import { nightLightSites } from '../src/night.ts';
import { trainNight } from '../src/train-geom.ts';
import { CLEAR_STATE } from '../src/weather.ts';
import type { WeatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import type { NightLightSites } from '../src/night.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES: NightLightSites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });

const NOON = '2026-06-21T12:00:00Z';
const MIDNIGHT = '2026-12-21T00:00:00Z';
const weather = (over: Partial<WeatherState>): WeatherState => ({ ...CLEAR_STATE, ...over });

function setup(sites: NightLightSites | null = null, location?: { lat: number; lon: number }) {
  trainNight.value = 0;
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites, ...(location ? { location } : {}) });
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(250, 380, 420);
  const target = new THREE.Vector3(40, 0, -150);
  let wall = 0;
  /** one frame at that instant, a second after the last (so the quarter-second throttle never skips it) */
  const at = (when: string | number, w: WeatherState = CLEAR_STATE): void => {
    wall += 1000;
    atmosphere.update({ timeMs: typeof when === 'number' ? when : Date.parse(when), weather: w, camera, target, wallMs: wall });
  };
  return { scene, world, atmosphere, camera, target, at, lights: world.lights };
}
test.afterEach(() => { trainNight.value = 0; });

const srgb = (c: readonly number[]): number[] => new THREE.Color().setRGB(c[0] as number, c[1] as number, c[2] as number, THREE.SRGBColorSpace).toArray();
const disc = (world: { sky: THREE.Mesh }): THREE.Sprite => world.sky.getObjectByName('sun-disc') as THREE.Sprite;
const stars = (world: { sky: THREE.Mesh }): THREE.Points => world.sky.getObjectByName('stars') as THREE.Points;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const MINUTE = 60_000;
/** The first instant, minute by minute from `from`, at which the sun (at `place`) is at or above `deg`. */
function sunReaches(deg: number, from: string, place?: { lat: number; lon: number }): number {
  for (let t = Date.parse(from); t < Date.parse(from) + 24 * 60 * MINUTE; t += MINUTE) if (solarPosition(t, place?.lat, place?.lon).elevationDeg >= deg) return t;
  throw new Error(`the sun never reaches ${deg} degrees after ${from}`);
}

test('the scene\'s lights are the rig\'s: the sky light and the ground light, the fills and the key, colour and strength, by day, at night, in rain and in fog', () => {
  const { atmosphere, lights, at } = setup();
  for (const [when, w] of [[MIDNIGHT, CLEAR_STATE], [NOON, weather({ rain: 0.8, cloud: 1, wet: 0.9 })], ['2026-12-21T15:40:00Z', CLEAR_STATE], [NOON, weather({ visibilityM: 300 })]] as const) {
    at(when, w);
    const rig = atmosphere.state()!.rig, key = rig.moon.intensity > rig.sun.intensity ? rig.moon : rig.sun;
    const where = `${when}, cloud ${w.cloud}, visibility ${w.visibilityM}`;
    assert.deepEqual(lights.hemisphere.color.toArray(), srgb(rig.hemisphere.sky), `${where}: the sky light's colour`);
    assert.deepEqual(lights.hemisphere.groundColor.toArray(), srgb(rig.hemisphere.ground), `${where}: the ground light's colour`);
    assert.equal(lights.hemisphere.intensity, rig.hemisphere.intensity, `${where}: the sky light's strength`);
    assert.equal(lights.fills.length, rig.fills.length);
    rig.fills.forEach((f, i) => {
      assert.deepEqual((lights.fills[i] as THREE.DirectionalLight).color.toArray(), srgb(f.colour), `${where}: fill ${i}'s colour`);
      assert.equal((lights.fills[i] as THREE.DirectionalLight).intensity, f.intensity, `${where}: fill ${i}'s strength`);
    });
    assert.deepEqual(lights.sun.color.toArray(), srgb(key.colour), `${where}: the key light's colour`);
    assert.equal(lights.sun.intensity, key.intensity, `${where}: the key light's strength`);
    assert.ok(Math.abs(lights.sun.position.length() - 700) < 1e-9, `${where}: the key light is 700 m off`);
  }
});

test('the sky is worked out from all of the weather: cloud, rain, snow and visibility each reach the rig', () => {
  const { atmosphere, at } = setup();
  const when = Date.parse(NOON);
  for (const w of [weather({ cloud: 0.7 }), weather({ rain: 0.8 }), weather({ snow: 0.8 }), weather({ visibilityM: 800 }), weather({ cloud: 0.4, rain: 0.3, snow: 0.2, visibilityM: 3000 })]) {
    at(when, w);
    const s = atmosphere.state()!;
    const want = skyRig(s.sun.elevationDeg, s.sun.azimuthDeg, { cloud: w.cloud, rain: w.rain, snow: w.snow, visibilityM: w.visibilityM }, REFERENCE);
    assert.deepEqual(s.rig, want, `cloud ${w.cloud}, rain ${w.rain}, snow ${w.snow}, visibility ${w.visibilityM}`);
  }
});

test('the sun disc sits on the sun\'s side of the sky, at the dome\'s distance, and rises through the horizon over about two degrees', () => {
  const { world, atmosphere, at } = setup();
  at(NOON);
  const s = atmosphere.state()!;
  const sprite = disc(world);
  assert.ok(Math.abs(sprite.position.length() - 4800) < 1e-6, `${sprite.position.length()} m out: inside the dome, which is 5200 m`);
  const want = sunDirection(s.sun.elevationDeg, s.sun.azimuthDeg);
  const got = sprite.position.clone().normalize().toArray();
  assert.ok(Math.abs(got[0]! - want[0]) + Math.abs(got[1]! - want[1]) + Math.abs(got[2]! - want[2]) < 1e-9, `towards the sun, not away: ${got} against ${want}`);
  assert.equal((sprite.material as THREE.SpriteMaterial).opacity, 1);
  // through sunrise: nothing two and a half degrees under, a faint disc at half a degree under, the whole of it a degree above
  for (const [under, label] of [[-2.5, 'two and a half degrees under'], [-1.4, 'one and a half degrees under'], [-0.5, 'half a degree under'], [0.5, 'half a degree over'], [3, 'three degrees over']] as const) {
    const t = sunReaches(under, '2026-12-21T06:00:00Z');
    at(t);
    const e = atmosphere.state()!.sun.elevationDeg;
    const opacity = clamp01((e + 1.5) / 2);
    assert.equal(sprite.visible, opacity > 0.01, `${label} (${e.toFixed(2)}): shown or not`);
    assert.ok(Math.abs((sprite.material as THREE.SpriteMaterial).opacity - opacity) < 1e-9, `${label} (${e.toFixed(2)}): opacity ${(sprite.material as THREE.SpriteMaterial).opacity} against ${opacity}`);
  }
});

test('cloud dims the sun disc but a thick overcast leaves a faint one, and fog dims it by the share of the fog', () => {
  const { world, at } = setup();
  const opacity = (): number => (disc(world).material as THREE.SpriteMaterial).opacity;
  at(NOON);
  assert.equal(opacity(), 1);
  at(NOON, weather({ cloud: 0.5 }));
  const half = opacity();
  assert.ok(half > 0.3 && half < 0.7, `half cloud: ${half}`);
  at(NOON, weather({ cloud: 1 }));
  assert.ok(opacity() > 0 && opacity() < 0.1, `overcast: a faint disc, ${opacity()}`);
  assert.equal(disc(world).visible, true, 'still drawn');
  assert.ok(opacity() < half);
  at(NOON, weather({ visibilityM: 1000 }));
  assert.ok(Math.abs(opacity() - (1 - fogAmount(1000))) < 1e-9, `in 1 km of visibility the disc keeps ${1 - fogAmount(1000)}: ${opacity()}`);
  assert.equal(disc(world).visible, true, 'though it is under half strength');
  at(NOON, weather({ visibilityM: 200 }));
  assert.equal(disc(world).visible, false, 'and in dense fog it is gone');
});

test('the stars come out with the rig\'s strength: shown when there is any, fainter when it is faint, and never brighter than the strength itself; none close to the horizon, and plenty', () => {
  const { world, atmosphere, at } = setup();
  at(MIDNIGHT);
  const full = atmosphere.state()!.rig.stars;
  const opacity = (): number => (stars(world).material as THREE.PointsMaterial).opacity;
  assert.equal(full, 1);
  assert.equal(stars(world).visible, true);
  assert.ok(opacity() > 0 && opacity() <= full + 1e-9, `a clear night: drawn, and not brighter than the strength: ${opacity()}`);
  const clear = opacity();
  at(MIDNIGHT, weather({ cloud: 0.5 }));
  const faint = atmosphere.state()!.rig.stars;
  assert.ok(faint > 0.05 && faint < 0.5, `a thin cloud leaves the stars a part of their strength: ${faint}`);
  assert.equal(stars(world).visible, true, 'a faint star is still drawn');
  assert.ok(opacity() > 0 && opacity() <= faint + 1e-9, `drawn at no more than the strength, ${opacity()} against ${faint}`);
  assert.ok(opacity() < clear, 'and fainter than on a clear night');
  assert.ok(Math.abs(opacity() / faint - clear / full) < 1e-9, 'in proportion to the strength');
  at(MIDNIGHT, weather({ cloud: 1 }));
  assert.equal(stars(world).visible, false, 'none under thick cloud');
  at(NOON);
  assert.equal(stars(world).visible, false, 'none by day');
  // the scatter itself: a sky of stars, all of them above the horizon
  const position = stars(world).geometry.getAttribute('position');
  assert.ok(position.count >= 500 && position.count <= 2000, `${position.count} stars`);
  let lowest = Infinity;
  for (let i = 0; i < position.count; i++) lowest = Math.min(lowest, position.getY(i) / Math.hypot(position.getX(i), position.getY(i), position.getZ(i)));
  assert.ok(lowest >= 0.05, `the lowest star is ${(Math.asin(lowest) * 180 / Math.PI).toFixed(1)} degrees up`);
});

test('the dome is repainted when the sun has moved enough to move its glow, and when its colours have changed a little, but not otherwise', () => {
  const colours = (world: { sky: THREE.Mesh }): THREE.BufferAttribute => world.sky.geometry.getAttribute('color') as THREE.BufferAttribute;
  // 1. the sun moving across the sky (here round midday, where its height is steady and its bearing is not) with the colours steady
  {
    const { world, at } = setup();
    let pair: [number, number] | null = null;
    for (let t = Date.parse('2026-06-21T11:30:00Z'); t < Date.parse('2026-06-21T12:40:00Z') && !pair; t += MINUTE) {
      const a = solarPosition(t), b = solarPosition(t + 4 * MINUTE);
      if (Math.round(a.elevationDeg * 4) === Math.round(b.elevationDeg * 4) && Math.round(a.azimuthDeg * 2) !== Math.round(b.azimuthDeg * 2)) pair = [t, t + 4 * MINUTE];
    }
    assert.ok(pair, 'there are minutes at noon when the sun has moved in bearing and not in height');
    at(pair![0]);
    const before = colours(world).version;
    at(pair![1]);
    assert.ok(colours(world).version > before, 'the sun has moved across the sky: the dome is painted for its new place');
  }
  // 2. the sun's height changing at a steady bearing (the equator at the equinox, mid-morning) with the colours steady
  {
    const equator = { lat: 0, lon: 0 };
    const { world, at } = setup(null, equator);
    let pair: [number, number] | null = null;
    for (let t = Date.parse('2026-03-20T08:30:00Z'); t < Date.parse('2026-03-20T10:30:00Z') && !pair; t += MINUTE) {
      const a = solarPosition(t, 0, 0), b = solarPosition(t + 4 * MINUTE, 0, 0);
      if (Math.round(a.azimuthDeg * 2) === Math.round(b.azimuthDeg * 2) && Math.round(a.elevationDeg * 4) !== Math.round(b.elevationDeg * 4)) pair = [t, t + 4 * MINUTE];
    }
    assert.ok(pair, 'there are minutes in the equatorial morning when the sun has risen and not turned');
    at(pair![0]);
    const before = colours(world).version;
    at(pair![1]);
    assert.ok(colours(world).version > before, 'the sun has risen: the dome is painted for its new height');
  }
  // 3. deep in the night the sun moves and the colours do not; the dome is still repainted for the sun's place
  {
    const { world, at } = setup();
    at('2026-12-21T00:00:00Z');
    const before = colours(world).version;
    at('2026-12-21T00:30:00Z');
    assert.ok(colours(world).version > before, 'the sun has moved under the ground: the dome is repainted for it');
  }
  // 4. a small change of weather in the same minute: the colours change, a little (found by searching for the thinnest bit more cloud that is seen,
  //    so that the test does not depend on how the sky is coloured)
  {
    const { world, at } = setup();
    const sun = solarPosition(Date.parse(NOON));
    const rigAt = (cloud: number) => skyRig(sun.elevationDeg, sun.azimuthDeg, { cloud, rain: 0, snow: 0, visibilityM: CLEAR_STATE.visibilityM }, REFERENCE);
    const movedBy = (a: ReturnType<typeof rigAt>, b: ReturnType<typeof rigAt>): number => Math.max(Math.abs(a.glow.strength - b.glow.strength), ...[0, 1, 2].flatMap((i) => [Math.abs(a.dome.zenith[i]! - b.dome.zenith[i]!), Math.abs(a.dome.horizon[i]! - b.dome.horizon[i]!)]));
    let more = 0.1, moved = 0;
    for (let cloud = 0.12; cloud <= 1 && moved <= 0.02; cloud += 0.02) { more = cloud; moved = movedBy(rigAt(0.1), rigAt(cloud)); }
    assert.ok(moved > 0.02 && moved < 0.39, `a little more cloud moves the colours of the dome by a little: ${moved} at ${more}`);
    at(NOON, weather({ cloud: 0.1 }));
    const before = colours(world).version;
    at(NOON, weather({ cloud: more }));
    assert.ok(colours(world).version > before, 'and the dome is painted for it');
    const settled = colours(world).version;
    at(NOON, weather({ cloud: more }));
    assert.equal(colours(world).version, settled, 'and then left alone while nothing changes');
  }
});

test('the rain follows the frame: its clock is the wall clock in seconds, its box is as deep as the view, the wind leans it, and the night dims it', () => {
  const { atmosphere, camera, target } = setup();
  const uniform =(name: string): { value: unknown } => (atmosphere.precip.rain.material as THREE.ShaderMaterial).uniforms[name] as { value: unknown };
  camera.position.set(0, 3, 0);
  target.set(0, 0, 4);
  const frame = (iso: string, wallMs: number, w: WeatherState): void => atmosphere.update({ timeMs: Date.parse(iso), weather: w, camera, target, wallMs });
  const rain = weather({ rain: 1, windMs: 4 });
  frame(NOON, 12_345, rain);
  assert.equal(uniform('uTime').value, 12.345, 'seconds on the wall clock');
  assert.deepEqual((uniform('uBox').value as THREE.Vector3).toArray(), [16, 12.8, 16], 'five metres from what it looks at: the smallest box');
  const wind = (uniform('uWind').value as THREE.Vector2).toArray();
  assert.ok(Math.abs(wind[0]! - 2) < 1e-12 && Math.abs(wind[1]! - 1.2) < 1e-12, `4 m/s of wind leans the streaks: ${wind}`);
  const dayOpacity = uniform('uOpacity').value as number;
  camera.position.set(0, 3, -300);
  frame(NOON, 13_345, rain);
  assert.ok(Math.abs((uniform('uBox').value as THREE.Vector3).x - camera.position.distanceTo(target) * 1.2) < 1e-9, 'three hundred metres from it: a box a fifth wider than that');
  frame(MIDNIGHT, 14_345, rain);
  assert.ok((uniform('uOpacity').value as number) < dayOpacity, `rain is dimmer at night: ${uniform('uOpacity').value} against ${dayOpacity}`);
});

test('disposal frees everything the atmosphere made: the rain and snow, the night lights, the sun disc and the stars', () => {
  const { atmosphere, world } = setup(SITES);
  const freed: string[] = [];
  const watch = (name: string, thing: { addEventListener(type: 'dispose', listener: () => void): void }): void => thing.addEventListener('dispose', () => freed.push(name));
  const expected: string[] = [];
  const track = (name: string, thing: { addEventListener(type: 'dispose', listener: () => void): void }): void => { watch(name, thing); expected.push(name); };
  for (const o of [atmosphere.precip.rain, atmosphere.precip.snow]) {
    track(`${o.name} geometry`, o.geometry);
    track(`${o.name} material`, o.material as THREE.Material);
  }
  atmosphere.nightLights!.group.children.forEach((child, i) => {
    const points = child as THREE.Points;
    track(`night lights ${i} geometry`, points.geometry);
    track(`night lights ${i} material`, points.material as THREE.Material);
  });
  track('sun disc material', disc(world).material as THREE.Material);
  track('star geometry', stars(world).geometry);
  track('star material', stars(world).material as THREE.Material);
  assert.ok(expected.length >= 10, `${expected.length} things to be freed`);
  atmosphere.dispose();
  assert.deepEqual([...freed].sort(), [...expected].sort(), 'each freed once');
});
