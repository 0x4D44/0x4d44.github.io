// The scene's lights (web/src/world.ts LIGHTS): the sun and sky as the page always had them, and the two fills that keep a
// warning yellow yellow on a train front that looks north (the sun is in the south-west, so such a face is lit by the sky alone).
import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { addWorld, LIGHTS } from '../src/world.ts';

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
