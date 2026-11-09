// The scene's lights (web/src/world.ts LIGHTS): the sun and sky as the page always had them, and the two fills that keep a
// warning yellow yellow on a train front that looks north (the sun is in the south-west, so such a face is lit by the sky alone).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DAY_EXPOSURE } from '../../core/daylight.ts';
import { solarPosition, sunDirection } from '../../core/solar.ts';
import { terrainMaterial } from '../src/materials.ts';
import { addWorld, DAYLIGHT, GROUND_COLOUR, LIGHTS } from '../src/world.ts';
import { acesFilmic, toSrgb } from './aces.ts';

type V3 = readonly [number, number, number];

const unit = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
/** A 0xRRGGBB colour in three's linear working space (what its shaders multiply). */
const linear = (hex: number): V3 => {
  const c = new THREE.Color(hex);
  return [c.r, c.g, c.b];
};
const mix = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Irradiance, linear rgb, on a face with this unit normal, as three's lambert shader gathers it: the hemisphere light mixes its
 * ground colour to its sky colour by 0.5 n.up + 0.5; a directional light adds colour x intensity x max(n.L, 0). `fills` leaves the fills out.
 */
function irradiance(n: V3, fills = true): V3 {
  const h = LIGHTS.hemisphere;
  const hemi = mix(linear(h.ground), linear(h.sky), 0.5 * n[1] + 0.5);
  const e: [number, number, number] = [hemi[0] * h.intensity, hemi[1] * h.intensity, hemi[2] * h.intensity];
  const lights = [LIGHTS.sun, ...(fills ? LIGHTS.fills : [])];
  for (const l of lights) {
    const w = Math.max(0, dot(n, unit(l.position))) * l.intensity;
    const c = linear(l.colour);
    for (let k = 0; k < 3; k++) e[k] = (e[k] as number) + (c[k] as number) * w;
  }
  return e;
}

/** What a lambert surface of albedo `hex` shows under that light: albedo x irradiance / pi, back to sRGB, 0..1 per channel. */
function shown(hex: number, n: V3, fills = true): V3 {
  const a = linear(hex);
  const e = irradiance(n, fills);
  const c = new THREE.Color().setRGB((a[0] * e[0]) / Math.PI, (a[1] * e[1]) / Math.PI, (a[2] * e[2]) / Math.PI, THREE.LinearSRGBColorSpace);
  const out = c.getRGB(new THREE.Color(), THREE.SRGBColorSpace);
  return [out.r, out.g, out.b];
}

/** Hue (degrees) and value (0..1) of an sRGB triple. */
function hueValue([r, g, b]: V3): { hue: number; value: number } {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  const hue = d === 0 ? 0 : max === r ? (((g - b) / d) % 6) * 60 : max === g ? ((b - r) / d + 2) * 60 : ((r - g) / d + 4) * 60;
  return { hue: (hue + 360) % 360, value: max };
}

const YELLOW = 0xf2c100; // web/src/train.ts: the warning panel's shade
const NORTH: V3 = [0, 0, -1]; // a vertical face looking north, a train's front on its way out of King's Cross
const SOUTH: V3 = [0, 0, 1];

test('LIGHTS: the sun and the sky are as they were (the dusk mood is not touched); the fills are weak, low and along the railway', () => {
  assert.deepEqual(LIGHTS.hemisphere, { sky: 0xc4d6ff, ground: 0x3a3f48, intensity: 1.25 });
  assert.equal(LIGHTS.sun.colour, 0xffe8c2);
  assert.equal(LIGHTS.sun.intensity, 1.7);
  assert.deepEqual([...LIGHTS.sun.position], [-320, 520, 260]);
  assert.deepEqual(LIGHTS.fills.map((f) => f.name), ['fill-north', 'fill-south']);
  for (const f of LIGHTS.fills) {
    assert.ok(f.intensity <= 0.5 * LIGHTS.sun.intensity, `${f.name}: ${f.intensity} is not weak beside the sun's ${LIGHTS.sun.intensity}`);
    const [x, y, z] = f.position;
    const elevation = (Math.atan2(y, Math.hypot(x, z)) * 180) / Math.PI;
    assert.ok(elevation >= 5 && elevation <= 20, `${f.name}: ${elevation.toFixed(1)} degrees above the horizon is not low`);
    assert.ok(Math.abs(x) <= Math.tan((15 * Math.PI) / 180) * Math.abs(z), `${f.name}: more than 15 degrees off the railway's axis`);
  }
  const [north, south] = LIGHTS.fills;
  assert.ok((north?.position[2] ?? 0) < 0 && (south?.position[2] ?? 0) > 0, 'one fill shines from the north end of the railway and one from the south');
  // on a roof or the ground the fills add a tenth or less of what the sun and sky give
  const up: V3 = [0, 1, 0];
  const withFills = irradiance(up);
  const without = irradiance(up, false);
  for (let k = 0; k < 3; k++) assert.ok(((withFills[k] as number) - (without[k] as number)) / (withFills[k] as number) <= 0.1, `channel ${k}: the fills are more than a tenth of the light on an up-facing face`);
});

test('a warning yellow reads as yellow on a face looking north or south, not olive and dim', () => {
  for (const [name, n] of [['north', NORTH], ['south', SOUTH]] as const) {
    const { hue, value } = hueValue(shown(YELLOW, n));
    assert.ok(hue >= 44 && hue <= 50, `${name}: hue ${hue.toFixed(1)} is not yellow (the paint itself is ${hueValue([0xf2 / 255, 0xc1 / 255, 0]).hue.toFixed(1)})`);
    assert.ok(value >= 0.55, `${name}: value ${value.toFixed(2)} is dim`);
  }
  // the control: the same north face under the sun and sky alone is the olive the fills exist to cure
  const bare = hueValue(shown(YELLOW, NORTH, false));
  assert.ok(bare.hue > 51 && bare.value < 0.4, `without the fills the north face is olive and dim (hue ${bare.hue.toFixed(1)}, value ${bare.value.toFixed(2)})`);
});

// ---- DAYLIGHT: the rig the page lights the day with (drawn through the filmic tone map of lighting.ts) -----------------------------------------

/** Irradiance, linear rgb, on a face with unit normal `n` under `DAYLIGHT`, the sun in the unit direction `toSun` and the fills where LIGHTS has them. */
function dayIrradiance(n: V3, toSun: V3, opts: { sun?: boolean; fills?: boolean } = {}): V3 {
  const h = DAYLIGHT.hemisphere;
  const hemi = mix(linear(h.ground), linear(h.sky), 0.5 * n[1] + 0.5);
  const e: [number, number, number] = [hemi[0] * h.intensity, hemi[1] * h.intensity, hemi[2] * h.intensity];
  const add = (colour: number, dir: V3, intensity: number): void => {
    const w = Math.max(0, dot(n, unit(dir))) * intensity;
    const c = linear(colour);
    for (let k = 0; k < 3; k++) e[k] = (e[k] as number) + (c[k] as number) * w;
  };
  if (opts.sun !== false) add(DAYLIGHT.sun.colour, toSun, DAYLIGHT.sun.intensity);
  if (opts.fills !== false) DAYLIGHT.fills.forEach((f, i) => add(f.colour, (LIGHTS.fills[i] as { position: V3 }).position, f.intensity));
  return e;
}

/** What the page draws, 0..1 sRGB, for a Lambert surface of albedo `hex` (a colour) under `DAYLIGHT` at the day's exposure. */
function drawn(hex: number, n: V3, toSun: V3, opts: { sun?: boolean; fills?: boolean } = {}): V3 {
  const a = linear(hex);
  const e = dayIrradiance(n, toSun, opts);
  return toSrgb(acesFilmic([(a[0] * e[0]) / Math.PI, (a[1] * e[1]) / Math.PI, (a[2] * e[2]) / Math.PI], DAY_EXPOSURE));
}

const NOON_SUN = solarPosition(Date.parse('2026-06-21T12:00:00+01:00'));
const TO_SUN: V3 = sunDirection(NOON_SUN.elevationDeg, NOON_SUN.azimuthDeg);
const UP: V3 = [0, 1, 0];
const lumaOf = (c: V3): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

test('DAYLIGHT: a bright sun over a softer sky and a warm paving bounce; the fills are the old ones, weaker by the same ratio, and still along the railway', () => {
  assert.deepEqual(DAYLIGHT.hemisphere, { sky: 0xc4d6ff, ground: 0x6e6860, intensity: 1.0 });
  assert.equal(DAYLIGHT.sun.colour, 0xffe8c2);
  assert.equal(DAYLIGHT.sun.intensity, 3.0);
  assert.deepEqual(DAYLIGHT.fills.map((f) => [f.name, f.colour, f.intensity]), [['fill-north', 0xfff0d8, 0.6], ['fill-south', 0xfff0d8, 0.25]]);
  assert.deepEqual(DAYLIGHT.fills.map((f) => f.name), LIGHTS.fills.map((f) => f.name), 'the same two lights, so addWorld\'s positions apply');
  for (const f of DAYLIGHT.fills) assert.ok(f.intensity <= 0.25 * DAYLIGHT.sun.intensity, `${f.name} is weak beside the sun`);
  const ground = linear(DAYLIGHT.hemisphere.ground);
  assert.ok(ground[0] > ground[2], 'the bounce off the paving is warm');
  assert.ok(DAYLIGHT.sun.intensity > 1.7 && DAYLIGHT.sun.intensity / DAYLIGHT.hemisphere.intensity >= 3, 'a sun that stands well above the sky, which is what makes a shadow');
});

test('a shadow is about a quarter to a third as bright as the sunlit ground beside it (R-lighting-materials-a2, -d: the shade is soft, not black)', () => {
  const lit = lumaOf(dayIrradiance(UP, TO_SUN));
  const shade = lumaOf(dayIrradiance(UP, TO_SUN, { sun: false }));
  assert.ok(shade / lit >= 0.2 && shade / lit <= 0.4, `the shade is ${(shade / lit).toFixed(2)} of the light`);
  // on a wall that faces away from the sun the light is the sky and bounce alone, which is the same shade
  const wall = lumaOf(dayIrradiance([-TO_SUN[0], 0, -TO_SUN[2]].map((x) => x / Math.hypot(TO_SUN[0], TO_SUN[2])) as unknown as V3, TO_SUN));
  assert.ok(wall / lit < 0.5 && wall / lit > 0.15, `a wall turned from the sun is ${(wall / lit).toFixed(2)} of the lit ground`);
});

test('the grade keeps the day\'s whites from clipping and the mid-greys where an eye puts them', () => {
  const white = drawn(0xf4f4f0, UP, TO_SUN); // a pale roof panel or a white-painted face, lit by the sun from above
  assert.ok(Math.max(...white) < 0.985, `a sunlit white stays below 251/255: ${white.map((v) => Math.round(v * 255))}`);
  const grey = drawn(0x777777, UP, TO_SUN); // an 18% grey card
  assert.ok(lumaOf(grey) >= 0.5 && lumaOf(grey) <= 0.8, `a mid-grey in the sun reads as mid-grey: ${grey.map((v) => Math.round(v * 255))}`);
  const shadowed = drawn(0x777777, UP, TO_SUN, { sun: false });
  assert.ok(lumaOf(shadowed) > 0.2 && lumaOf(shadowed) < lumaOf(grey), 'and in the shade it is darker but not black');
});

test('under DAYLIGHT and the grade a warning yellow still reads as yellow on a face looking north or south, not olive and dim', () => {
  for (const [name, n] of [['north', NORTH], ['south', SOUTH]] as const) {
    const { hue, value } = hueValue(drawn(YELLOW, n, TO_SUN));
    assert.ok(hue >= 38 && hue <= 52, `${name}: hue ${hue.toFixed(1)} is not yellow`);
    assert.ok(value >= 0.5, `${name}: value ${value.toFixed(2)} is dim`);
  }
});

test('the sky dome is authored in display colours and is not tone mapped; the lit world is', () => {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  assert.equal((world.sky.material as THREE.MeshBasicMaterial).toneMapped, false, 'the dome');
  const ground = scene.children.find((o) => (o as THREE.Mesh).isMesh && o !== world.sky && ((o as THREE.Mesh).material as THREE.Material).type === 'MeshLambertMaterial') as THREE.Mesh | undefined;
  assert.ok(ground, 'a lit ground is in the scene');
  assert.equal((ground!.material as THREE.Material).toneMapped, true, 'the lit ground takes the grade');
});

test('the open ground is a neutral mid grey, never navy, and the terrain mesh that replaces it is the same grey (R-lighting-materials-d, -e)', () => {
  const scene = new THREE.Scene();
  const world = addWorld(scene, { grid: false });
  const ground = scene.children.find((o) => (o as THREE.Mesh).isMesh && o !== world.sky && ((o as THREE.Mesh).material as THREE.Material).type === 'MeshLambertMaterial') as THREE.Mesh | undefined;
  assert.ok(ground, 'a lit ground is in the scene');
  const c = (ground!.material as THREE.MeshLambertMaterial).color;
  const sRgb = [c.getHex() >> 16 & 255, c.getHex() >> 8 & 255, c.getHex() & 255];
  assert.ok(Math.max(...sRgb) - Math.min(...sRgb) <= 6, `neutral, not blue: ${sRgb.join(', ')}`);
  const luminance = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  assert.ok(luminance > 0.09 && luminance < 0.16, `worn tarmac or concrete, about 0.12 reflective: ${luminance.toFixed(3)}`);
  assert.equal(GROUND_COLOUR, c.getHex(), 'the exported colour is the one drawn');
  assert.equal((terrainMaterial('ground') as THREE.MeshLambertMaterial).color.getHex(), GROUND_COLOUR, 'the terrain draws the same grey');
});

test('addWorld: the sky, the sun and the fills are in the scene with the numbers of LIGHTS, and nothing else shines', () => {
  const scene = new THREE.Scene();
  addWorld(scene, { grid: false });
  const hemisphere = scene.children.filter((o): o is THREE.HemisphereLight => o instanceof THREE.HemisphereLight);
  assert.equal(hemisphere.length, 1);
  assert.equal((hemisphere[0] as THREE.HemisphereLight).intensity, LIGHTS.hemisphere.intensity);
  assert.equal((hemisphere[0] as THREE.HemisphereLight).color.getHex(), LIGHTS.hemisphere.sky);
  assert.equal((hemisphere[0] as THREE.HemisphereLight).groundColor.getHex(), LIGHTS.hemisphere.ground);
  const directional = scene.children.filter((o): o is THREE.DirectionalLight => o instanceof THREE.DirectionalLight);
  assert.equal(directional.length, 1 + LIGHTS.fills.length, 'the sun and the fills');
  assert.equal(scene.children.filter((o) => (o as THREE.Light).isLight).length, 1 + directional.length, 'no other light');
  const expected = [{ name: '', ...LIGHTS.sun }, ...LIGHTS.fills];
  for (const want of expected) {
    const got = directional.find((l) => l.name === want.name);
    assert.ok(got, `a light named "${want.name}"`);
    assert.equal(got.intensity, want.intensity, `${want.name} intensity`);
    assert.equal(got.color.getHex(), want.colour, `${want.name} colour`);
    assert.deepEqual(got.position.toArray(), [...want.position], `${want.name} position`);
    assert.equal(got.castShadow, false, `${want.name} casts no shadow`);
  }
});
