// web/src/atmosphere.ts: the scene clock and the weather applied to the scene's real lights, dome, fog, lamps and ground. The numbers
// themselves are core/daylight.ts's (tested there); what is held here is that they REACH the scene, smoothly, through the frame loop,
// and that nothing is left pointing at a name or a shader line that does not exist.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { CLEAR_FOG, DAYLIGHT_FLOOR, MOON_INTENSITY, skyRig } from '../../core/daylight.ts';
import type { KxData } from '../../core/osm.ts';
import { solarPosition, sunDirection } from '../../core/solar.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { createAtmosphere, LAMP_SHARE, RAIL_NIGHT, REFERENCE, SURFACES } from '../src/atmosphere.ts';
import { coverUniforms } from '../src/cover.ts';
import { furniturePlan } from '../src/furniture.ts';
import { cityMaterial, material, terrainMaterial } from '../src/materials.ts';
import { nightLightSites } from '../src/night.ts';
import { trainNight } from '../src/train-geom.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import type { WeatherState } from '../src/weather.ts';
import { addWorld, DAYLIGHT, LIGHTS } from '../src/world.ts';
import type { NightLightSites } from '../src/night.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES: NightLightSites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });

const NOON = '2026-06-21T12:00:00Z'; // the sun near its highest (13:00 BST; solar noon at King's Cross is at 12:02 UTC)
const MIDNIGHT = '2026-12-21T00:00:00Z';
const state = (name: string): WeatherState => weatherState(forcedObservation(name));

function setup(sites: NightLightSites | null = null) {
  trainNight.value = 0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x35465e, 1100, 3600);
  scene.background = new THREE.Color(0x35465e);
  const world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites });
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(250, 380, 420);
  const target = new THREE.Vector3(40, 0, -150);
  let wall = 0;
  /** one frame at that instant, a second after the last (so the quarter-second throttle never skips it) */
  const at = (iso: string, weather: WeatherState = CLEAR_STATE): void => {
    wall += 1000;
    atmosphere.update({ timeMs: Date.parse(iso), weather, camera, target, wallMs: wall });
  };
  return { scene, world, atmosphere, camera, target, at, lights: world.lights };
}
const luma = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const lambertShader = () => ({ uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader });
const compile = (m: THREE.Material) => { const s = lambertShader(); m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never); return s; };

test.afterEach(() => { trainNight.value = 0; });

test('the reference rig is the page\'s own DAYLIGHT, so a high sun in a clear sky changes nothing; the fixed LIGHTS stay for the bare page', () => {
  assert.equal(REFERENCE.sun.colour, DAYLIGHT.sun.colour);
  assert.equal(REFERENCE.sun.intensity, DAYLIGHT.sun.intensity);
  assert.deepEqual(REFERENCE.hemisphere, DAYLIGHT.hemisphere);
  assert.deepEqual(REFERENCE.fills, DAYLIGHT.fills.map((f) => ({ colour: f.colour, intensity: f.intensity })));
  // the numbers core/tests/daylight.test.ts spells out
  assert.deepEqual([REFERENCE.sun.intensity, REFERENCE.hemisphere.intensity, ...REFERENCE.fills.map((f) => f.intensity)], [3, 1, 0.6, 0.25]);
  // ?bare=1 and ?sky=ref keep the fixed rig the page always had (no atmosphere, no tone map, no shadow)
  assert.deepEqual([LIGHTS.sun.intensity, LIGHTS.hemisphere.intensity, ...LIGHTS.fills.map((f) => f.intensity)], [1.7, 1.25, 0.8, 0.3]);
});

test('midsummer noon: the sun is where the astronomy puts it, bright and clear; no lamps, no stars, the clear-air haze', () => {
  const { atmosphere, lights, world, scene, at } = setup(SITES);
  assert.equal(atmosphere.state(), null, 'nothing computed before the first frame');
  at(NOON);
  const s = atmosphere.state()!;
  const pos = solarPosition(Date.parse(NOON));
  assert.ok(Math.abs(s.sun.elevationDeg - pos.elevationDeg) < 1e-12 && s.sun.elevationDeg > 60);
  const direction = lights.sun.position.clone().normalize();
  const want = sunDirection(pos.elevationDeg, pos.azimuthDeg);
  assert.ok(Math.abs(direction.x - want[0]) + Math.abs(direction.y - want[1]) + Math.abs(direction.z - want[2]) < 1e-9, `the key light shines from the sun: ${direction.toArray()} vs ${want}`);
  assert.ok(Math.abs(lights.sun.position.length() - 700) < 1e-9);
  assert.ok(direction.z > 0 && direction.y > 0.8, 'high in the south');
  assert.ok(lights.sun.intensity >= 3 && lights.sun.intensity <= 3.4, `bright: ${lights.sun.intensity}`);
  assert.ok(lights.sun.color.r > lights.sun.color.b, 'warm');
  assert.ok(lights.hemisphere.intensity >= 1 && lights.hemisphere.intensity <= 1.1);
  assert.equal(trainNight.value, 0, 'the trains\' windows are plain glass by day');
  assert.ok(atmosphere.nightLights!.group.children.every((c) => !c.visible), 'no halos by day');
  assert.equal(world.sky.getObjectByName('stars')!.visible, false);
  assert.equal(world.sky.getObjectByName('sun-disc')!.visible, true);
  const fog = scene.fog as THREE.Fog;
  assert.deepEqual([fog.near, fog.far], [CLEAR_FOG.near, CLEAR_FOG.far]);
  assert.equal(atmosphere.precip.stats().drawCalls, 0, 'dry');
  assert.ok(luma(scene.background as THREE.Color) > 0.4, 'a bright sky');
});

test('midnight: the stylised moon is the key, the ambient is low, the lamps and the trains\' windows are on, the stars are out', () => {
  const { atmosphere, lights, world, scene, at } = setup(SITES);
  at(MIDNIGHT);
  const s = atmosphere.state()!;
  assert.ok(s.sun.elevationDeg < -50);
  assert.equal(lights.sun.intensity, MOON_INTENSITY, 'the moon\'s strength');
  assert.ok(lights.sun.color.b > lights.sun.color.r, 'cool');
  const d = lights.sun.position.clone().normalize();
  assert.ok(d.y > 0.5 && d.x < 0 && d.z > 0, `from the south-west, well up: ${d.toArray()}`);
  assert.ok(lights.hemisphere.intensity < 0.65 * DAYLIGHT.hemisphere.intensity, `${lights.hemisphere.intensity}`);
  // the light of the night is what it was under the old, dimmer reference (hemisphere 0.69, fills 0.14 and 0.054): faint beside daylight's 0.6 and 0.25
  assert.ok(lights.fills.every((f, i) => f.intensity < 0.25 * (DAYLIGHT.fills[i] as { intensity: number }).intensity), 'and the fills are faint');
  assert.equal(trainNight.value, 1);
  for (const child of atmosphere.nightLights!.group.children) assert.equal(child.visible, true);
  assert.equal(world.sky.getObjectByName('stars')!.visible, true);
  assert.equal(world.sky.getObjectByName('sun-disc')!.visible, false, 'the sun is not in the sky');
  assert.ok(luma(scene.background as THREE.Color) < 0.1, 'a dark sky');
});

test('dusk and dawn through the frame loop are smooth: nothing the scene shows jumps from one minute to the next', () => {
  const { atmosphere, lights, scene, at } = setup(SITES);
  const sample = (): number[] => [lights.sun.intensity, lights.hemisphere.intensity, ...lights.fills.map((f) => f.intensity), luma(scene.background as THREE.Color),
    luma(lights.sun.color), luma(lights.hemisphere.color), trainNight.value, (atmosphere.nightLights!.group.children[0] as THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>).material.opacity];
  const LAMPS = 7, HALO = 8; // the indices of those last two in a sample
  const run = (from: string, minutes: number): number[][] => {
    const rows: number[][] = [];
    for (let m = 0; m <= minutes; m++) {
      at(new Date(Date.parse(from) + m * 60_000).toISOString());
      rows.push(sample());
    }
    return rows;
  };
  const dusk = run('2026-12-21T15:00:00Z', 180);
  const dawn = run('2026-12-21T06:00:00Z', 180);
  for (const [name, rows] of [['dusk', dusk], ['dawn', dawn]] as const) {
    rows.forEach((row, i) => {
      if (i === 0) return;
      row.forEach((v, k) => assert.ok(Math.abs(v - (rows[i - 1] as number[])[k]!) < 0.04, `${name}, minute ${i}: number ${k} went ${(rows[i - 1] as number[])[k]} to ${v}`));
    });
  }
  const night = (rows: number[][]): number[] => rows.map((r) => r[LAMPS] as number);
  assert.equal(night(dusk)[0], 0, 'lamps off at three in the afternoon');
  assert.equal(night(dusk).at(-1), 1, 'on by six');
  assert.deepEqual(night(dusk), [...night(dusk)].sort((a, b) => a - b), 'they come up and never flicker back');
  assert.equal(night(dawn)[0], 1, 'on before dawn');
  assert.equal(night(dawn).at(-1), 0, 'off by nine');
  assert.deepEqual(night(dawn), [...night(dawn)].sort((a, b) => b - a));
  // the halo opacity is the same ramp as the trains' lamp level
  assert.ok(dusk.every((r) => Math.abs((r[HALO] as number) - (r[LAMPS] as number) * 0.95) < 1e-9), 'the platform halos follow the lamp level');
});

test('under cloud and rain the light drops but the scene stays readable; in fog the world closes in; snow lights the ground', () => {
  const { lights, scene, at, camera } = setup();
  at(NOON);
  const clear = { sun: lights.sun.intensity, hemi: lights.hemisphere.intensity, sky: luma(scene.background as THREE.Color) };
  at(NOON, state('rain'));
  assert.ok(lights.sun.intensity < 0.25 * clear.sun, `rain: sun ${lights.sun.intensity} against ${clear.sun}`);
  assert.ok(lights.hemisphere.intensity > 0.8 * clear.hemi, 'and the sky light carries on');
  assert.ok(luma(scene.background as THREE.Color) < clear.sky, 'a duller horizon');
  at(NOON, state('heavy-rain'));
  assert.ok(trainNight.value > 0 && trainNight.value < 0.6, `the gloom brings the lamps up a little: ${trainNight.value}`);

  camera.position.set(0, 5, 0);
  at(NOON, state('fog'));
  const fog = scene.fog as THREE.Fog;
  assert.ok(fog.far < 450 && fog.near < fog.far, `fog from the ground: ${fog.near} to ${fog.far}`);
  camera.position.set(0, 380, 0);
  at(NOON, state('fog'));
  assert.ok(fog.far > 700, `the same fog from 380 m up is thinner: ${fog.far}`);
  at(NOON, CLEAR_STATE);
  assert.deepEqual([fog.near, fog.far], [CLEAR_FOG.near, CLEAR_FOG.far], 'and the clear air gives the haze back');
  const horizon = new THREE.Color().copy(scene.background as THREE.Color);
  at(NOON, state('fog'));
  assert.ok(Math.abs(fog.color.r - (scene.background as THREE.Color).r) < 0.03 && Math.abs(fog.color.b - (scene.background as THREE.Color).b) < 0.03, 'the fog and the horizon are one colour');
  assert.notDeepEqual((scene.background as THREE.Color).toArray(), horizon.toArray());
});

test('the sky maths run four times a second, not every frame (a new weather runs them at once); the fog and the rain follow every frame', () => {
  const { atmosphere, scene, camera, target } = setup();
  const frame = (wallMs: number, iso: string, weather = CLEAR_STATE) => atmosphere.update({ timeMs: Date.parse(iso), weather, camera, target, wallMs });
  frame(0, NOON);
  const first = atmosphere.state()!;
  frame(100, '2026-06-21T18:00:00Z');
  frame(249, '2026-06-21T19:00:00Z');
  assert.equal(atmosphere.state(), first, 'no new sky inside a quarter of a second');
  frame(250, '2026-06-21T18:00:00Z');
  assert.notEqual(atmosphere.state(), first);
  assert.equal(atmosphere.state()!.timeMs, Date.parse('2026-06-21T18:00:00Z'));
  const second = atmosphere.state()!;
  frame(260, '2026-06-21T18:00:00Z');
  assert.equal(atmosphere.state(), second, 'and again nothing for a quarter of a second');

  const fogWeather = state('fog');
  camera.position.set(0, 380, 0);
  frame(270, NOON, fogWeather);
  assert.notEqual(atmosphere.state(), second, 'a new weather is applied at once, not up to a quarter of a second later');
  assert.equal(atmosphere.state()!.weather, fogWeather);
  const computed = atmosphere.state()!;
  const high = (scene.fog as THREE.Fog).far;
  camera.position.set(0, 5, 0);
  frame(280, NOON, fogWeather);
  assert.equal(atmosphere.state(), computed, 'the same weather and time: no new sky');
  assert.ok((scene.fog as THREE.Fog).far < high, 'but the fog follows the camera every frame');
  camera.position.set(0, 3, 0);
  target.set(40, 0, 30);
  frame(290, NOON, state('rain'));
  const centre = ((atmosphere.precip.rain.material as THREE.ShaderMaterial).uniforms.uCentre as { value: THREE.Vector3 }).value;
  assert.deepEqual(centre.toArray(), [20, 0, 15], 'and so does the rain: its box lies halfway between the camera and what it looks at');
  const rain = atmosphere.state()!.weather;
  target.set(-20, 0, 40);
  frame(300, NOON, rain);
  assert.deepEqual(centre.toArray(), [-10, 0, 20], 'and moves with them on every frame');
});

test('the dome is repainted from the rig: its horizon and its zenith are the rig\'s colours, and the sunset glow is on the side of the sun', () => {
  const { world, atmosphere, at } = setup();
  const attr = world.sky.geometry.getAttribute('color') as THREE.BufferAttribute;
  const pos = world.sky.geometry.getAttribute('position');
  let lowest = 0, highest = 0;
  for (let i = 1; i < pos.count; i++) {
    if (pos.getY(i) < pos.getY(lowest)) lowest = i;
    if (pos.getY(i) > pos.getY(highest)) highest = i;
  }
  const colourAt = (i: number): THREE.Color => new THREE.Color().setRGB(attr.getX(i), attr.getY(i), attr.getZ(i), THREE.LinearSRGBColorSpace);
  const srgb = (rgb: readonly number[]): THREE.Color => new THREE.Color().setRGB(rgb[0] as number, rgb[1] as number, rgb[2] as number, THREE.SRGBColorSpace);
  const close = (a: THREE.Color, b: THREE.Color, what: string): void => assert.ok(Math.abs(a.r - b.r) + Math.abs(a.g - b.g) + Math.abs(a.b - b.b) < 1e-6, `${what}: ${a.toArray()} vs ${b.toArray()}`);
  at(MIDNIGHT);
  const rig = atmosphere.state()!.rig;
  close(colourAt(lowest), srgb(rig.dome.horizon), 'midnight horizon');
  close(colourAt(highest), srgb(rig.dome.zenith), 'midnight zenith');
  const night = colourAt(highest).clone();
  at(NOON);
  close(colourAt(highest), srgb(atmosphere.state()!.rig.dome.zenith), 'noon zenith');
  assert.ok(luma(colourAt(highest)) > 3 * luma(night), 'and a day sky is brighter than a night one');
  // winter sunset: the sun is low in the south-west, so the horizon beneath it is brighter than the opposite horizon
  at('2026-12-21T15:30:00Z');
  const s = atmosphere.state()!;
  const toSun = new THREE.Vector3(...sunDirection(s.sun.elevationDeg, s.sun.azimuthDeg));
  let near = -1, far = -1, nearDot = -2, farDot = 2;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) / 5200 > 0.08 || pos.getY(i) < 0) continue;
    const d = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).normalize().dot(toSun);
    if (d > nearDot) { nearDot = d; near = i; }
    if (d < farDot) { farDot = d; far = i; }
  }
  assert.ok(luma(colourAt(near)) > 1.15 * luma(colourAt(far)), `the sunset side of the horizon glows: ${luma(colourAt(near))} against ${luma(colourAt(far))}`);
  // and an unchanged sky is not repainted
  const before = attr.version;
  at('2026-12-21T15:30:00Z');
  assert.equal(attr.version, before, 'the same sky leaves the dome\'s colours alone');
});

test('what glowed like sky-lit day (shed lining, glazing, ribs) dims after dark and picks up the lamps\' warmth', () => {
  const { scene, atmosphere, at } = setup();
  const m = new THREE.MeshLambertMaterial({ color: 0xdddddd, emissive: 0x808080 });
  const plain = new THREE.MeshLambertMaterial({ color: 0xdddddd });
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m), new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), plain));
  atmosphere.rescan();
  const base = m.emissive.clone();
  at(NOON);
  assert.deepEqual(m.emissive.toArray(), base.toArray(), 'by day it is as it was built');
  at(MIDNIGHT);
  assert.ok(m.emissive.r < 0.4 * base.r && m.emissive.r > 0.2 * base.r, `dimmer: ${m.emissive.r} of ${base.r}`);
  assert.ok(Math.abs(m.emissive.r / base.r - (DAYLIGHT_FLOOR + LAMP_SHARE)) < 1e-9, 'at night what is left is the stand-ins\' floor and the lamps\' share, the share warmest in the red');
  assert.ok(Math.abs(m.emissive.b / base.b - (DAYLIGHT_FLOOR + LAMP_SHARE * 0.52)) < 1e-9);
  assert.ok(m.emissive.r > m.emissive.g && m.emissive.g > m.emissive.b, 'and warm: the lamps\' share is more red than blue');
  assert.equal(plain.emissive.getHex(), 0, 'a material with no emissive is left alone');
  at(NOON);
  assert.deepEqual(m.emissive.toArray(), base.toArray(), 'and the day brings it back exactly');
});

test('the far rails, which are unlit lines, dim after dark so they do not glow white against the night city', () => {
  const { scene, atmosphere, at } = setup();
  const track = new THREE.Group();
  track.name = 'track';
  const rails = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true }));
  const elsewhere = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffffff }));
  track.add(rails);
  scene.add(track, elsewhere);
  atmosphere.rescan();
  const colour = (l: THREE.LineSegments): THREE.Color => (l.material as THREE.LineBasicMaterial).color;
  at(NOON);
  assert.equal(colour(rails).r, 1, 'by day as built');
  at(MIDNIGHT);
  const daylight = atmosphere.state()!.rig.daylight;
  assert.ok(Math.abs(colour(rails).r - (RAIL_NIGHT + (1 - RAIL_NIGHT) * daylight)) < 1e-9 && colour(rails).r < 0.5, `dimmed: ${colour(rails).r}`);
  assert.equal(colour(elsewhere).r, 1, 'lines that are not the track (a signal\'s) are left alone');
  at(NOON);
  assert.equal(colour(rails).r, 1, 'and the day brings them back exactly');
});

test('every surface the weather wets or whitens exists under that name in the real scene, as a Lambert material', () => {
  const { scene } = setup();
  const flat = (() => { let found: THREE.Material | null = null; scene.traverse((o) => { const mm = (o as THREE.Mesh).material as THREE.Material | undefined; if (mm?.name === 'ground-flat') found = mm; }); return found; })();
  const real = new Map<string, THREE.Material>([
    ...(['asphalt', 'platformEdge', 'platformEdgeStrip', 'ballast', 'concourseFloor'] as const).map((n): [string, THREE.Material] => [material(n).name, material(n)]),
    ...(['asphalt', 'pavement', 'plaza', 'grass'] as const).map((n): [string, THREE.Material] => [cityMaterial(n).name, cityMaterial(n)]),
    ...(['ground', 'bank'] as const).map((n): [string, THREE.Material] => [terrainMaterial(n).name, terrainMaterial(n)]),
    ...(flat ? [['ground-flat', flat] as [string, THREE.Material]] : []),
  ]);
  for (const name of SURFACES.keys()) {
    const m = real.get(name);
    assert.ok(m, `no material is named "${name}" in the page`);
    assert.ok((m as THREE.MeshLambertMaterial).isMeshLambertMaterial, `"${name}" is not a Lambert material, so the shader patch does not apply`);
  }
  assert.equal(SURFACES.size, 12);
});

test('wet ground: the shader of each named surface is patched once with the shared wetness and snow, after the texture and before the output', () => {
  const { scene, atmosphere, at } = setup();
  const surface = (name: string) => { const m = new THREE.MeshLambertMaterial({ color: 0x808080 }); m.name = name; scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m)); return m; };
  const asphalt = surface('asphalt'), floor = surface('concourseFloor'), brick = surface('brick');
  const versions = [asphalt.version, brick.version];
  atmosphere.rescan();
  atmosphere.rescan();
  // every Lambert surface takes the shade under roofs (lighting.ts) once; the named surfaces also take the wet ground, once
  assert.equal(asphalt.version, versions[0]! + 2, 'patched once for the wet ground and once for the roof shade (needsUpdate each), however often it is scanned');
  assert.equal(brick.version, versions[1]! + 1, 'a material that is not a named surface takes the roof shade only');

  const pristine = lambertShader();
  const roofOnly = compile(brick);
  assert.notEqual(roofOnly.fragmentShader, pristine.fragmentShader);
  assert.ok(roofOnly.fragmentShader.includes('uniform vec4 uRoofShade;') && !roofOnly.fragmentShader.includes('uWet'), 'the roof shade, and none of the wet ground\'s code');
  assert.deepEqual(Object.keys(roofOnly.uniforms).sort(), [...Object.keys(coverUniforms), 'uRoofShade'].sort());

  const s = compile(asphalt);
  const f = s.fragmentShader;
  for (const decl of ['uniform float uWet;', 'uniform float uSnowCover;', 'uniform vec3 uSheen;', 'uniform vec3 uSnowColour;', 'uniform float uDark;', 'uniform float uSheenK;', 'uniform float uSnowK;']) {
    assert.equal(f.split(decl).length - 1, 1, `${decl} once`);
  }
  const order = ['#include <map_fragment>', '#include <color_fragment>', 'float coverOpen = 1.0;', 'float wetHere = uWet * coverOpen;', 'diffuseColor.rgb *= 1.0 - uDark * wetHere;',
    'diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColour', 'outgoingLight += uSheen * uSheenK * wetHere', '#include <opaque_fragment>'].map((needle) => f.indexOf(needle));
  assert.ok(order.every((i) => i >= 0), `every piece is there: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the order: texture, colour, the weather\'s share here, darken, whiten, then the sheen on the lit result, then output');
  assert.ok(f.indexOf('varying vec3 vViewPosition;') < f.indexOf('coverGroundAt( cameraPosition'), 'the view position it reads the world point from is declared above');
  assert.ok(f.indexOf('vViewPosition') < f.indexOf('uSheen * uSheenK'), 'the view vector it uses is declared above');
  assert.ok(f.indexOf('vec3 normal') < f.indexOf('uSheen * uSheenK'), 'and so is the normal');
  assert.ok(f.indexOf('outgoingLight =') < f.indexOf('uSheen * uSheenK'), 'and the lit result');
  // under a roof (cover.ts) the weather does not reach the surface; the cover is read only when there is some weather to keep off
  assert.equal(f.split('float coverGroundAt(').length - 1, 1, 'the ground\'s cover read is in the shader once');
  assert.ok(f.indexOf('float coverGroundAt(') < f.indexOf('coverGroundAt( cameraPosition'), 'and declared above where it is used');
  assert.ok(f.includes('if ( uWet + uSnowCover > 0.001 ) coverOpen = 1.0 - coverGroundAt( cameraPosition - vViewPosition * mat3( viewMatrix ) );'), 'read at the surface\'s own world position, with the soft edge, and not at all in dry weather');
  for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRect', 'uCoverScale'] as const) assert.ok(s.uniforms[name] === coverUniforms[name], `${name} is the shared one, so every surface sees the same roofs`);
  assert.equal(s.uniforms.uDark!.value, SURFACES.get('asphalt')!.dark);
  assert.equal(s.uniforms.uSheenK!.value, SURFACES.get('asphalt')!.sheen);
  assert.equal(s.uniforms.uSnowK!.value, 1);
  assert.equal(compile(floor).uniforms.uSnowK!.value, 0, 'a floor under cover takes no snow');
  assert.equal(compile(floor).uniforms.uDark!.value, SURFACES.get('concourseFloor')!.dark);

  // the uniforms are shared across surfaces and follow the weather
  assert.equal(s.uniforms.uWet, compile(floor).uniforms.uWet, 'one wetness for every surface');
  at(NOON);
  assert.equal(s.uniforms.uWet!.value, 0);
  assert.equal(s.uniforms.uSnowCover!.value, 0);
  at(NOON, state('rain'));
  assert.equal(s.uniforms.uWet!.value, state('rain').wet);
  assert.ok((s.uniforms.uWet!.value as number) > 0.5);
  assert.equal(s.uniforms.uSnowCover!.value, 0);
  at(NOON, state('snow'));
  assert.equal(s.uniforms.uSnowCover!.value, state('snow').snowCover);
  assert.ok((s.uniforms.uSnowCover!.value as number) > 0.5);
  const sheenColour = (s.uniforms.uSheen!.value as THREE.Color).clone();
  at(MIDNIGHT, state('rain'));
  assert.ok(luma(s.uniforms.uSheen!.value as THREE.Color) < luma(sheenColour), 'the wet ground mirrors the sky, so at night it mirrors less');
});

test('two scenes share the station\'s surfaces: the second atmosphere\'s scan leaves the first\'s wet ground and the roof shade both in the shared material', () => {
  // King's Cross and Edinburgh Waverley each have an atmosphere, and the ballast, asphalt and concrete are the one set of materials in both. A second
  // wet patch would replace the first's `onBeforeCompile`, and with it the roof shade lighting.ts layered on it, while the cache key still said it was there.
  const london = setup(), waverley = setup();
  const shared = new THREE.MeshLambertMaterial({ color: 0x808080 }); shared.name = 'ballast';
  const plain = new THREE.MeshLambertMaterial({ color: 0x808080 }); plain.name = 'steel';
  for (const { scene } of [london, waverley]) for (const m of [shared, plain]) scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
  london.atmosphere.rescan();
  const once = [shared.version, plain.version];
  waverley.atmosphere.rescan();
  assert.deepEqual([shared.version, plain.version], once, 'the second scan finds both already done, and does not recompile them');
  for (const m of [shared, plain]) assert.ok(m.customProgramCacheKey().endsWith('+roofShade'), `${m.name}: the cache key says the roof shade is in the shader`);
  const wet = compile(shared).fragmentShader;
  assert.ok(wet.includes('uniform float uWet;') && wet.includes('uniform vec4 uRoofShade;'), 'the ballast has the wet ground and the roof shade, as the key says');
  assert.ok(compile(plain).fragmentShader.includes('uniform vec4 uRoofShade;'), 'the steel has the roof shade');
});

test('rain and snow are drawn when the weather has them, with the scene\'s view, and not otherwise', () => {
  const { atmosphere, at } = setup();
  at(NOON);
  assert.equal(atmosphere.precip.stats().drawCalls, 0);
  at(NOON, state('rain'));
  assert.equal(atmosphere.precip.stats().drawCalls, 1);
  assert.ok(atmosphere.precip.stats().rainVertices > 0);
  at(NOON, state('snow'));
  assert.deepEqual(atmosphere.precip.stats().snowPoints > 0 && atmosphere.precip.stats().rainVertices === 0, true);
  at(NOON, state('fog'));
  assert.equal(atmosphere.precip.stats().drawCalls, 0, 'fog is not rain');
  at(NOON, state('thunder'));
  assert.ok(atmosphere.precip.stats().rainVertices > 0);
});

test('dispose takes the sun disc and the stars off the dome, and the lights and precipitation can be freed', () => {
  const { atmosphere, world, scene } = setup(SITES);
  assert.deepEqual(world.sky.children.map((c) => c.name).sort(), ['stars', 'sun-disc']);
  assert.ok(scene.getObjectByName('night-lights') && scene.getObjectByName('precipitation'));
  atmosphere.dispose();
  assert.equal(world.sky.children.length, 0);
});

test('without the atmosphere the world keeps the page\'s own fixed lights (?sky=ref and ?bare=1 never create one)', () => {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  assert.equal(world.lights.sun.intensity, LIGHTS.sun.intensity);
  assert.deepEqual(world.lights.sun.position.toArray(), [...LIGHTS.sun.position]);
  assert.equal(world.lights.hemisphere.intensity, LIGHTS.hemisphere.intensity);
  assert.equal(world.sky.children.length, 0, 'no sun disc and no stars');
  assert.equal(scene.getObjectByName('night-lights'), undefined);
  assert.equal(scene.getObjectByName('precipitation'), undefined);
});

test('the rig at the daylight reference: skyRig at 25 degrees and no weather is the reference (DAYLIGHT), to the last digit', () => {
  const rig = skyRig(25, 200, { cloud: 0, rain: 0, snow: 0, visibilityM: Infinity }, REFERENCE);
  assert.equal(rig.sun.intensity, DAYLIGHT.sun.intensity);
  assert.equal(rig.hemisphere.intensity, DAYLIGHT.hemisphere.intensity);
  assert.deepEqual(rig.fills.map((f) => f.intensity), DAYLIGHT.fills.map((f) => f.intensity));
});


test('a configured atmosphere computes the sun at Waverley without changing the default London rig', () => {
  const timeMs = Date.parse('2026-11-09T12:00:00Z'), location = { lat: 55.9519018, lon: -3.1904199 };
  const scene = new THREE.Scene(), world = addWorld(scene, { grid: false });
  const atmosphere = createAtmosphere({ scene, world, sites: null, location });
  const camera = new THREE.PerspectiveCamera();
  try {
    atmosphere.update({ timeMs, camera, target: new THREE.Vector3(), wallMs: 1000, weather: CLEAR_STATE });
    const expected = solarPosition(timeMs, location.lat, location.lon), actual = atmosphere.state()!.sun;
    assert.ok(Math.abs(actual.elevationDeg - expected.elevationDeg) < 1e-10, 'solar latitude must be the displayed station');
    assert.ok(Math.abs(actual.azimuthDeg - expected.azimuthDeg) < 1e-10, 'solar longitude must be the displayed station');
    assert.ok(Math.abs(actual.elevationDeg - solarPosition(timeMs).elevationDeg) > 3, 'Waverley must not inherit London sun');
    assert.deepEqual(REFERENCE.sun, { colour: DAYLIGHT.sun.colour, intensity: DAYLIGHT.sun.intensity }, 'the reference rig is the page\'s daylight rig, whatever the location');
  } finally { atmosphere.dispose(); }
});
