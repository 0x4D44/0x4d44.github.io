// The shaders that keep the weather off the covered places, run. Node has no GPU, so the page's own GLSL (the rain and snow vertex shaders, the
// cover read they share, and the wet-ground lines patched into the Lambert shader) is run by the small interpreter in glsl.ts, on the real roofs
// of the real station, with the texture the page uploads. A point under the shed, the concourse or a canopy gets no rain, no snow and no wet; a
// point in the open, or above a roof, gets all of it. (cover.test.ts holds the CPU map to the roofs; the screenshots hold the GPU to this.)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { PLATFORM_HEIGHT } from '../../core/scene.ts';
import { concourseCanopy, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { buildConcourse } from '../src/concourse.ts';
import { buildCoverMap, COVER_GLSL, coverAt, coverUniforms, groundCoverAt, groundOpenShare } from '../src/cover.ts';
import { buildFurniture, furniturePlan } from '../src/furniture.ts';
import { material } from '../src/materials.ts';
import { buildShed, ROOF_SKIN } from '../src/shed.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Env, Sampler, Value } from './glsl.ts';
import type { CoverMap } from '../src/cover.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const canopy = concourseCanopy(data);
const footprint = stationBuilding(data)!.pts;
const plan = furniturePlan(data, layout);
const R = SHED_SPAN_WIDTH / 2;
const W = layout.width, L = layout.length;
const CROWN = layout.crown + ROOF_SKIN;

// the real station, with the page's own atmosphere over it (which draws the cover map from the roofs, and patches the wet-ground materials)
const scene = new THREE.Scene();
scene.add(buildShed(layout));
scene.add(buildConcourse(canopy, footprint, layout, data.buildings.filter((b) => b.id === 46821177).map((b) => b.pts)));
scene.add(buildFurniture(data, layout));
const ground = (['asphalt', 'platformEdge', 'concourseFloor'] as const).map((name) => material(name));
for (const m of ground) scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), m));
const atmosphere = createAtmosphere({ scene, world: addWorld(scene, { grid: false }), sites: null });
const map = atmosphere.cover() as CoverMap;
const rainState = weatherState(forcedObservation('rain'));
const snowState = weatherState(forcedObservation('snow'));
const NIGHT = Date.parse('2026-11-09T19:00:00Z');

const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };
const frac = (v: number): number => v - Math.floor(v);
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => Buffer.compare(a, b) === 0;
const lcg = (seed: number): (() => number) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };

// ---- running the shaders -----------------------------------------------------------------------------------------------------------------

const uniformValues = (uniforms: Record<string, THREE.IUniform>): Record<string, Value> => Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)]));

/**
 * `texture2D` on a DataTexture, answered the way the GPU answers it from the bytes the page uploaded, by the filter the page asked for: the
 * nearest texel for NEAREST; for LINEAR the blend of the four texels round the point (the edge ones held to the edge, as CLAMP_TO_EDGE does).
 */
function texture2D(sampler: Value, uv: Value): Value {
  const texture = (sampler as Sampler).data as THREE.DataTexture;
  const { width, height, data: bytes } = texture.image as { width: number; height: number; data: Uint8Array };
  assert.equal(texture.wrapS, THREE.ClampToEdgeWrapping);
  assert.equal(texture.wrapT, THREE.ClampToEdgeWrapping);
  assert.equal(texture.minFilter, texture.magFilter, 'a texture that is not mipmapped is filtered the same near and far');
  const [u, v] = uv as [number, number];
  const texel = (i: number, j: number): number => (bytes[Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i))] as number) / 255;
  if (texture.magFilter === THREE.LinearFilter) {
    const sx = u * width - 0.5, sy = v * height - 0.5, i = Math.floor(sx), j = Math.floor(sy), fx = sx - i, fy = sy - j;
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    return [lerp(lerp(texel(i, j), texel(i + 1, j), fx), lerp(texel(i, j + 1), texel(i + 1, j + 1), fx), fy), 0, 0, 1];
  }
  assert.equal(texture.magFilter, THREE.NearestFilter);
  return [texel(Math.floor(u * width), Math.floor(v * height)), 0, 0, 1];
}

const camera = (from: THREE.Vector3, look: THREE.Vector3): THREE.PerspectiveCamera => {
  const c = new THREE.PerspectiveCamera(50, 1.6, 0.5, 9000);
  c.position.copy(from);
  c.lookAt(look);
  c.updateMatrixWorld(true);
  return c;
};

interface Seed { position: number[]; aRand: number[] }
interface Drop { alpha: number; locals: Record<string, Value> }

/** A drop vertex shader, read once; bound to a camera it runs one vertex at a time (with the cover map, or as if there were none). */
function dropShader(object: THREE.LineSegments | THREE.Points): (cam: THREE.PerspectiveCamera) => (seed: Seed, cover?: boolean) => Drop {
  const m = object.material as THREE.ShaderMaterial;
  const source = m.vertexShader;
  const glsl = new Glsl(source);
  const main = glsl.snippet(source.slice(source.indexOf('void main() {') + 'void main() {'.length, source.lastIndexOf('}')));
  return (cam) => {
    const vars: Record<string, Value> = {
      ...uniformValues(m.uniforms), viewMatrix: toValue(cam.matrixWorldInverse), projectionMatrix: toValue(cam.projectionMatrix),
      cameraPosition: toValue(cam.position), position: [0, 0, 0], aRand: [0, 0],
    };
    const env: Env = { vars, fns: { texture2D } };
    const rect = vars.uCoverRect as number[];
    return (seed, cover = true) => {
      vars.position = seed.position;
      vars.aRand = seed.aRand;
      vars.uCoverRect = cover ? rect : [0, 0, 0, 0];
      const locals = main(env);
      return { alpha: vars.vAlpha as number, locals };
    };
  };
}
const rainShader = dropShader(atmosphere.precip.rain);
const snowShader = dropShader(atmosphere.precip.snow);

/** Point the precipitation box at `look` from `from`, as the page does every frame. */
function frame(from: THREE.Vector3, look: THREE.Vector3): THREE.PerspectiveCamera {
  atmosphere.precip.update({ timeS: 0, target: look, camera: from, distance: from.distanceTo(look), rain: 1, snow: 1, windMs: rainState.windMs, daylight: 0 });
  return camera(from, look);
}
const rainUniforms = (): Record<string, THREE.IUniform> => (atmosphere.precip.rain.material as THREE.ShaderMaterial).uniforms;
const snowUniforms = (): Record<string, THREE.IUniform> => (atmosphere.precip.snow.material as THREE.ShaderMaterial).uniforms;
const box = (u: Record<string, THREE.IUniform>): { box: THREE.Vector3; centre: THREE.Vector3; wind: THREE.Vector2; fall: number } =>
  ({ box: u.uBox!.value as THREE.Vector3, centre: u.uCentre!.value as THREE.Vector3, wind: u.uWind!.value as THREE.Vector2, fall: u.uFall!.value as number });

/** Where in the box (0..1 each way) a streak starts so that, at time 0, its head is at `target`. Undoes the shader's lattice, fall and drift. */
function rainSeedAt(target: number[], jitter = 0.5): Seed {
  const { box: b, wind, fall } = box(rainUniforms());
  const py = target[1]! / b.y;
  const sinceTop = ((1 - py) * b.y) / (fall * (0.85 + 0.3 * jitter));
  return { position: [frac((target[0]! + 0.5 * b.x - wind.x * sinceTop) / b.x), py, frac((target[2]! + 0.5 * b.z - wind.y * sinceTop) / b.z)], aRand: [jitter, 1] };
}
/** The same for a flake, whose sway depends on where it starts, so this settles on it. */
function snowSeedAt(target: number[], jitter: [number, number] = [0.5, 0.5]): Seed {
  const { box: b, wind, fall } = box(snowUniforms());
  const py = target[1]! / b.y;
  const sinceTop = ((1 - py) * b.y) / (fall * (0.7 + 0.6 * jitter[0]));
  let px = 0.5, pz = 0.5;
  for (let k = 0; k < 80; k++) {
    const sway = Math.sin(pz * 40) * 0.02 * b.x; // at time 0
    px = frac((target[0]! + 0.5 * b.x - wind.x * sinceTop - sway) / b.x);
    pz = frac((target[2]! + 0.5 * b.z - wind.y * sinceTop - sway * 0.7) / b.z);
  }
  return { position: [px, py, pz], aRand: jitter };
}
function assertInBox(u: Record<string, THREE.IUniform>, target: number[], label: string): void {
  const { box: b, centre } = box(u);
  assert.ok(Math.abs(target[0]! - centre.x) < 0.45 * b.x && Math.abs(target[2]! - centre.z) < 0.45 * b.z && target[1]! > 0.06 * b.y && target[1]! < 0.9 * b.y,
    `${label}: the box (${b.toArray().map((n) => n.toFixed(0))} about ${centre.toArray().map((n) => n.toFixed(0))}) holds ${target.map((n) => n.toFixed(1))}`);
}

// ---- the places ----------------------------------------------------------------------------------------------------------------------------

const mid = (c: { left: [number, number][]; right: [number, number][] }): [number, number] => {
  const i = Math.floor(c.left.length / 2);
  return [(c.left[i]![0] + c.right[i]![0]) / 2, (c.left[i]![1] + c.right[i]![1]) / 2];
};
const canopyPlan = plan.canopies[0]!;
const [canopyX, canopyZ] = mid(canopyPlan);
/** Places to hold the rain to: `under` says whether a roof is over them. `span` is how far the viewer stands back, which sizes the box of drops. */
const PLACES: { label: string; p: [number, number, number]; under: boolean; span: number }[] = [
  { label: 'on the platform under the shed\'s first vault, at eye height', p: at(layout.aisle + R, 100, PLATFORM_HEIGHT + 1.6), under: true, span: 20 },
  { label: 'high in the shed\'s first vault', p: at(layout.aisle + R, 150, 12), under: true, span: 20 },
  { label: 'in the shed\'s second vault', p: at(layout.aisle + 3 * R, 220, 6), under: true, span: 20 },
  { label: 'under the shed\'s west aisle roof', p: at(layout.aisle / 2, 60, 3.2), under: true, span: 20 },
  { label: 'on the flank of a vault, where the slate is', p: at(layout.aisle + R - 11, 120, 8), under: true, span: 20 },
  { label: 'in the Western Concourse', p: [canopy.centre[0] - canopy.radius * 0.3, 8, canopy.centre[1]], under: true, span: 20 },
  { label: 'on a platform, under its canopy', p: [canopyX, canopyPlan.roofY - 2, canopyZ], under: true, span: 20 },
  { label: 'in the open, beside the shed', p: at(W + 15, 100, 8), under: false, span: 20 },
  { label: 'in the open, past the end of the shed', p: at(W / 2, L + 30, 8), under: false, span: 20 },
  { label: 'in the open, over the shed\'s crown (rain falls on its roof)', p: at(layout.aisle + R, 100, CROWN + 3), under: false, span: 45 },
  { label: 'in the open, over the concourse', p: [canopy.centre[0], 30, canopy.centre[1]], under: false, span: 45 },
  { label: 'in the open, 3 m beside a canopy', p: [canopyX + 14, canopyPlan.roofY - 2, canopyZ + 14], under: false, span: 20 },
];

// ---- tests -----------------------------------------------------------------------------------------------------------------------------------

test('the page wires the shaders to one map: the atmosphere draws it from the scene\'s roofs and every shader that reads it is given the same texture', () => {
  assert.ok(map, 'the real station has roofs');
  // (identity and byte checks are written with assert.ok: a failed assert.equal or deepEqual on a map prints both, and its diff of 225,000 lines does not finish)
  assert.ok(sameBytes(map.heights, (buildCoverMap(scene) as CoverMap).heights), 'the map is the one drawn from the roofs');
  assert.ok(atmosphere.cover() === map, 'and the one the atmosphere keeps');
  const heights = coverUniforms.uCoverMap.value as THREE.DataTexture, soft = coverUniforms.uCoverSoft.value as THREE.DataTexture;
  assert.ok(heights.image.data === map.heights, 'and it is what the GPU is given');
  assert.ok(soft.image.data === map.soft, 'with the soft map beside it');
  assert.equal(heights.magFilter, THREE.NearestFilter, 'the heights are looked up, not blended');
  assert.equal(soft.magFilter, THREE.LinearFilter, 'the soft map is blended: that is the soft edge');
  assert.ok(sameBytes(map.soft, (buildCoverMap(scene) as CoverMap).soft), 'and it is the one drawn from the roofs');
  for (const [label, u] of [['rain', rainUniforms()], ['snow', snowUniforms()]] as const) {
    for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRect', 'uCoverScale'] as const) assert.ok(u[name] === coverUniforms[name], `${label}: ${name} is the shared one`);
  }
  const patched = new THREE.MeshLambertMaterial();
  patched.name = 'asphalt';
  scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), patched));
  atmosphere.rescan();
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '', fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  patched.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRect', 'uCoverScale'] as const) assert.ok(shader.uniforms[name] === coverUniforms[name], `the wet ground: ${name} is the shared one`);
});

test('coverAt in GLSL, run on the uploaded texture, answers what the CPU map answers: under a roof, in the open, over a roof, in the fade, outside the map', () => {
  const glsl = new Glsl(COVER_GLSL);
  const env: Env = { vars: uniformValues(coverUniforms), fns: { texture2D } };
  const rect = env.vars.uCoverRect as number[];
  const gpu = (x: number, y: number, z: number): number => glsl.call('coverAt', [[x, y, z]], env) as number;
  const rand = lcg(99);
  const roofCells: number[] = [];
  map.heights.forEach((h, i) => { if (h > 0) roofCells.push(i); });
  assert.ok(roofCells.length > 50_000, `${roofCells.length} cells under roofs`);
  const counts = { under: 0, open: 0, fade: 0, outside: 0 };
  const check = (x: number, y: number, z: number): void => {
    const want = coverAt(map, x, y, z), got = gpu(x, y, z);
    assert.ok(Math.abs(got - want) < 1e-9, `at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}: the GPU says ${got}, the map says ${want}`);
    if (x < map.x0 || z < map.z0 || x >= map.x0 + map.nx * map.cell || z >= map.z0 + map.nz * map.cell) counts.outside++;
    else if (want > 0.999) counts.under++;
    else if (want === 0) counts.open++;
    else counts.fade++;
  };
  for (let n = 0; n < 3000; n++) { // over a roof: from the ground to just above it
    const cell = roofCells[Math.floor(rand() * roofCells.length)] as number;
    const x = map.x0 + ((cell % map.nx) + rand()) * map.cell, z = map.z0 + (Math.floor(cell / map.nx) + rand()) * map.cell;
    check(x, -1 + rand() * ((map.heights[cell] as number) * map.step + 3), z);
  }
  for (let n = 0; n < 1000; n++) { // in the stretch where a drop comes out from under a roof
    const cell = roofCells[Math.floor(rand() * roofCells.length)] as number;
    const x = map.x0 + ((cell % map.nx) + rand()) * map.cell, z = map.z0 + (Math.floor(cell / map.nx) + rand()) * map.cell;
    check(x, (map.heights[cell] as number) * map.step - 0.7 + rand() * 0.8, z);
  }
  for (let n = 0; n < 1500; n++) check(map.x0 - 40 + rand() * (map.nx * map.cell + 80), rand() * 40, map.z0 - 40 + rand() * (map.nz * map.cell + 80)); // anywhere around
  assert.ok(counts.under > 1500 && counts.open > 500 && counts.fade > 100 && counts.outside > 50, `every case was tried: ${JSON.stringify(counts)}`);
  // no map: the shader sees no roof, however low the point is
  env.vars.uCoverRect = [0, 0, 0, 0];
  assert.equal(gpu(...at(layout.aisle + R, 100, 1.5)), 0);
  env.vars.uCoverRect = rect;
  assert.equal(gpu(...at(layout.aisle + R, 100, 1.5)), 1);
});

test('coverGroundAt in GLSL, run on the uploaded textures, answers what the CPU map answers: under a roof, in the open, over a roof, across a roof\'s edge, outside the map', () => {
  const glsl = new Glsl(COVER_GLSL);
  const env: Env = { vars: uniformValues(coverUniforms), fns: { texture2D } };
  const rect = env.vars.uCoverRect as number[];
  const gpu = (x: number, y: number, z: number): number => glsl.call('coverGroundAt', [[x, y, z]], env) as number;
  const rand = lcg(31);
  const roofCells: number[] = [], edgeCells: number[] = [];
  for (let j = 1; j < map.nz - 1; j++) {
    for (let i = 1; i < map.nx - 1; i++) {
      const k = j * map.nx + i;
      if (!map.heights[k]) continue;
      roofCells.push(k);
      if (!map.heights[k - 1] || !map.heights[k + 1] || !map.heights[k - map.nx] || !map.heights[k + map.nx]) edgeCells.push(k);
    }
  }
  assert.ok(roofCells.length > 50_000 && edgeCells.length > 1000, `${roofCells.length} roofed cells, ${edgeCells.length} at an edge`);
  const counts = { under: 0, open: 0, ramp: 0, over: 0, outside: 0 };
  const check = (x: number, y: number, z: number): void => {
    const want = groundCoverAt(map, x, y, z), got = gpu(x, y, z);
    assert.ok(Math.abs(got - want) < 1e-9, `at ${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}: the GPU says ${got}, the map says ${want}`);
    const u = (x - map.x0) / map.cell, v = (z - map.z0) / map.cell;
    if (u < 0 || v < 0 || u >= map.nx || v >= map.nz) counts.outside++;
    else if (want > 0.999) counts.under++;
    else if (want === 0) (coverAt(map, x, y, z) === 0 && map.heights[Math.floor(v) * map.nx + Math.floor(u)] ? counts.over++ : counts.open++);
    else counts.ramp++;
  };
  for (let n = 0; n < 2500; n++) { // across an edge: within a metre and a half of one, from the ground to a little above the low roofs
    const cell = edgeCells[Math.floor(rand() * edgeCells.length)] as number;
    const x = map.x0 + ((cell % map.nx) + 0.5) * map.cell + (rand() - 0.5) * 3, z = map.z0 + (Math.floor(cell / map.nx) + 0.5) * map.cell + (rand() - 0.5) * 3;
    check(x, rand() * 4, z);
  }
  for (let n = 0; n < 1500; n++) { // over a roof, from the ground to above it
    const cell = roofCells[Math.floor(rand() * roofCells.length)] as number;
    const x = map.x0 + ((cell % map.nx) + rand()) * map.cell, z = map.z0 + (Math.floor(cell / map.nx) + rand()) * map.cell;
    check(x, -1 + rand() * ((map.heights[cell] as number) * map.step + 3), z);
  }
  for (let n = 0; n < 1000; n++) check(map.x0 - 40 + rand() * (map.nx * map.cell + 80), rand() * 40, map.z0 - 40 + rand() * (map.nz * map.cell + 80)); // anywhere around
  assert.ok(counts.under > 500 && counts.open > 200 && counts.ramp > 800 && counts.over > 50 && counts.outside > 20, `every case was tried: ${JSON.stringify(counts)}`);
  env.vars.uCoverRect = [0, 0, 0, 0];
  assert.equal(gpu(...at(layout.aisle + R, 100, 1.5)), 0, 'no map, no roof');
  env.vars.uCoverRect = rect;
  assert.equal(gpu(...at(layout.aisle + R, 100, 1.5)), 1, 'the ground under the shed is under it');
  assert.equal(gpu(...at(layout.aisle + R, 100, CROWN + 1)), 0, 'and a surface above the crown is in the rain');
});

test('the edge of a roof is a soft line, as straight as the roof: along the shed\'s eaves the ground goes from dry to wet over about a metre, the same everywhere, with no saw', () => {
  const glsl = new Glsl(COVER_GLSL);
  const env: Env = { vars: uniformValues(coverUniforms), fns: { texture2D } };
  const gpu = (x: number, y: number, z: number): number => glsl.call('coverGroundAt', [[x, y, z]], env) as number;
  for (const [label, uEdge, outward] of [['west eave', 0, -1], ['east eave', W, 1]] as const) {
    const crossings: number[] = [], ramps: number[] = [];
    let steps = 0;
    for (let v = 40; v <= L - 40; v += 0.61) {
      let prev = 1, half: number | null = null, tenth: number | null = null, ninety: number | null = null;
      for (let d = -2; d <= 2; d += 0.02) { // d: metres outward from the roof's edge, on the ground
        const [x, , z] = at(uEdge + outward * d, v, 0);
        const c = gpu(x, 0.3, z);
        if (c > prev + 1e-9) steps++;
        if (d === -2) assert.ok(Math.abs(c - 1) < 1e-9, `${label}: two metres in under the roof it is dry (${c})`);
        if (ninety === null && c < 0.9) ninety = d;
        if (half === null && c < 0.5) half = d;
        if (tenth === null && c < 0.1) tenth = d;
        prev = c;
      }
      assert.ok(Math.abs(prev) < 1e-9, `${label}: two metres out it is wet (${prev})`);
      crossings.push(half as number);
      ramps.push((tenth as number) - (ninety as number));
    }
    const lo = Math.min(...crossings), hi = Math.max(...crossings);
    assert.equal(steps, 0, `${label}: it never goes wet and dry again across the edge`);
    assert.ok(lo > -0.3 && hi < 0.3, `${label}: the half-wet line lies within 0.3 m of the roof's edge all along it: ${lo.toFixed(2)}..${hi.toFixed(2)}`);
    assert.ok(Math.min(...ramps) > 0.9 && Math.max(...ramps) < 1.8, `${label}: it takes about a metre and a half to go from nine tenths to a tenth: ${Math.min(...ramps).toFixed(2)}..${Math.max(...ramps).toFixed(2)}`);
  }
});

test('rain: a streak that is under the shed, the concourse or a canopy has no alpha at either end; in the open, or over a roof, it keeps all of it', () => {
  for (const place of PLACES) {
    const from = new THREE.Vector3(place.p[0] - place.span, 1.7, place.p[2]), look = new THREE.Vector3(place.p[0] + place.span, 1.7, place.p[2]);
    const cam = frame(from, look);
    assertInBox(rainUniforms(), place.p, place.label);
    const run = rainShader(cam);
    for (const end of [0, 1]) { // the tail and the head
      const seed = { ...rainSeedAt(place.p), aRand: [0.5, end] };
      const without = run(seed, false), withCover = run(seed);
      const head = withCover.locals.p as number[];
      assert.ok(Math.hypot(head[0]! - place.p[0], head[1]! - place.p[1], head[2]! - place.p[2]) < 1e-6, `${place.label}: the streak is where it was put: ${head}`);
      assert.ok(without.alpha > 0.02, `${place.label}: with no roof it would be drawn: ${without.alpha}`);
      if (place.under) assert.equal(withCover.alpha, 0, `${place.label}: no rain (${end ? 'head' : 'tail'})`);
      else assert.equal(withCover.alpha, without.alpha, `${place.label}: all the rain (${end ? 'head' : 'tail'})`);
    }
  }
});

test('rain: a streak goes as a whole. Its head decides, so a streak whose tail is out in the open above the roof is not left drawn', () => {
  const from = new THREE.Vector3(...at(layout.aisle + R, 70, 8)), look = new THREE.Vector3(...at(layout.aisle + R, 130, 8));
  const cam = frame(from, look);
  const run = rainShader(cam);
  const roofY = CROWN;
  const slice = (below: number): { head: Drop; tail: Drop; plain: Drop[] } => {
    const target = at(layout.aisle + R, 100, roofY - below);
    assertInBox(rainUniforms(), target, `${below} m under the crown`);
    const seed = rainSeedAt(target);
    return { head: run({ ...seed, aRand: [0.5, 1] }), tail: run({ ...seed, aRand: [0.5, 0] }), plain: [run({ ...seed, aRand: [0.5, 1] }, false), run({ ...seed, aRand: [0.5, 0] }, false)] };
  };
  // 0.3 m under the crown the head is in the fade; the tail, a streak-length higher, is above the roof and would be wholly in the open
  const part = slice(0.3);
  const tailWorld = part.tail.locals.world as number[], headWorld = part.head.locals.world as number[];
  assert.ok(tailWorld[1]! > roofY + 0.5, `the tail is above the roof: ${tailWorld[1]} against ${roofY}`);
  assert.ok(headWorld[1]! < roofY - 0.2, `and the head is below it: ${headWorld[1]}`);
  const share = coverAt(map, headWorld[0]!, headWorld[1]!, headWorld[2]!);
  assert.ok(share > 0.05 && share < 0.95, `the head is part way out: ${share}`);
  const ratio = (d: Drop, plain: Drop): number => d.alpha / plain.alpha;
  assert.ok(Math.abs(ratio(part.head, part.plain[1]!) - (1 - share)) < 1e-9, 'the head lets through the share of a drop at its place');
  assert.ok(Math.abs(ratio(part.tail, part.plain[0]!) - (1 - share)) < 1e-9, 'and the tail goes with it, though the tail itself is in the open');
  const deep = slice(2);
  assert.equal(deep.head.alpha, 0);
  assert.equal(deep.tail.alpha, 0, 'a streak whose head is well under the roof is gone, tail and all');
  const above = slice(-1);
  assert.equal(above.head.alpha, above.plain[1]!.alpha, 'a streak above the roof is rain on the roof, drawn');
  assert.ok(above.head.alpha > 0.02);
});

test('snow: a flake under a roof has no alpha; in the open, or over a roof, it keeps all of it', () => {
  for (const place of PLACES) {
    const from = new THREE.Vector3(place.p[0] - place.span, 1.7, place.p[2]), look = new THREE.Vector3(place.p[0] + place.span, 1.7, place.p[2]);
    const cam = frame(from, look);
    assertInBox(snowUniforms(), place.p, place.label);
    const run = snowShader(cam);
    const seed = snowSeedAt(place.p);
    const without = run(seed, false), withCover = run(seed);
    const flake = withCover.locals.world as number[];
    assert.ok(Math.hypot(flake[0]! - place.p[0], flake[1]! - place.p[1], flake[2]! - place.p[2]) < 1e-6, `${place.label}: the flake is where it was put: ${flake}`);
    assert.ok(without.alpha > 0.02, `${place.label}: with no roof it would be drawn: ${without.alpha}`);
    if (place.under) assert.equal(withCover.alpha, 0, `${place.label}: no snow`);
    else assert.equal(withCover.alpha, without.alpha, `${place.label}: all the snow`);
  }
});

test('drops everywhere in a view: each is held back by exactly the share the roofs give its place, whatever the view, the wind or the clock', () => {
  const VIEWS: [string, THREE.Vector3, THREE.Vector3][] = [
    ['platform eye, down the shed', new THREE.Vector3(...at(layout.aisle + R, 40, PLATFORM_HEIGHT + 1.6)), new THREE.Vector3(...at(layout.aisle + R, 140, PLATFORM_HEIGHT + 1.6))],
    ['inside the shed, across it', new THREE.Vector3(...at(3, 120, 4)), new THREE.Vector3(...at(W - 3, 130, 6))],
    ['the Western Concourse', new THREE.Vector3(canopy.centre[0] - 30, 1.7, canopy.centre[1]), new THREE.Vector3(canopy.centre[0] + 10, 3, canopy.centre[1] + 5)],
    ['a canopy over a platform', new THREE.Vector3(canopyX - 12, 2.6, canopyZ - 12), new THREE.Vector3(canopyX + 12, 2.6, canopyZ + 12)],
    ['above the station, looking down the shed', new THREE.Vector3(...at(W / 2, -90, 160)), new THREE.Vector3(...at(W / 2, 140, 0))],
    ['out in the throat, past the shed', new THREE.Vector3(...at(W / 2, L + 10, 4)), new THREE.Vector3(...at(W / 2, L + 60, 2))],
  ];
  const totals = { rain: { under: 0, open: 0, fade: 0 }, snow: { under: 0, open: 0, fade: 0 } };
  for (const [label, from, look] of VIEWS) {
    const cam = frame(from, look);
    const rand = lcg(label.length * 7919);
    for (const [kind, shader, where] of [['rain', rainShader, 'p'], ['snow', snowShader, 'world']] as const) {
      const run = shader(cam);
      for (let n = 0; n < 700; n++) {
        const seed: Seed = { position: [rand(), rand(), rand()], aRand: [rand(), kind === 'rain' ? 1 : rand()] };
        const without = run(seed, false), withCover = run(seed);
        const place = withCover.locals[where] as number[];
        const share = coverAt(map, place[0]!, place[1]!, place[2]!);
        assert.ok(Math.abs(withCover.alpha - without.alpha * (1 - share)) < 1e-9, `${label}, ${kind} at ${place.map((v) => v.toFixed(1))}: alpha ${withCover.alpha} against ${without.alpha} * (1 - ${share})`);
        if (without.alpha > 0.005) totals[kind][share > 0.999 ? 'under' : share === 0 ? 'open' : 'fade']++;
      }
    }
  }
  for (const kind of ['rain', 'snow'] as const) {
    assert.ok(totals[kind].under > 150 && totals[kind].open > 300 && totals[kind].fade > 3, `${kind}: the views gave drops in every case: ${JSON.stringify(totals[kind])}`);
  }
});

// ---- the wet ground ---------------------------------------------------------------------------------------------------------------------------

/** The wet-ground lines of the patched Lambert fragment shader, cut out of the shader itself, with the uniforms the material is given. */
function wetGround(m: THREE.Material): { uniforms: Record<string, THREE.IUniform>; shade: (world: number[], cam: THREE.PerspectiveCamera, reads?: { n: number }) => { colour: number[]; light: number[]; coverOpen: number; wetHere: number } } {
  const s = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(s as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = s.fragmentShader;
  const declarations = f.slice(f.indexOf('uniform float uWet;'), f.indexOf('\n#include', f.indexOf('float coverAt(')));
  const colour = f.slice(f.indexOf('float coverOpen'), f.indexOf(');', f.indexOf('diffuseColor.rgb = mix(')) + 2);
  const sheen = f.slice(f.indexOf('{\n  float wetFresnel'), f.indexOf('#include <opaque_fragment>', f.indexOf('{\n  float wetFresnel')));
  assert.ok(declarations.includes('float coverGroundAt(') && colour.startsWith('float coverOpen') && sheen.includes('outgoingLight +='), 'the patch is where it was cut out from');
  assert.ok(colour.includes('coverGroundAt(') && !colour.includes('coverAt('), 'the ground reads the soft edge, not the cells');
  const glsl = new Glsl(declarations);
  const lines = glsl.snippet(`${colour}\n${sheen}`);
  return {
    uniforms: s.uniforms,
    shade(world, cam, reads) {
      // what the Lambert vertex shader hands the fragment shader: vViewPosition = -(view-space position)
      const v = new THREE.Vector3(...(world as [number, number, number])).applyMatrix4(cam.matrixWorldInverse).negate();
      const vars: Record<string, Value> = {
        ...uniformValues(s.uniforms), viewMatrix: toValue(cam.matrixWorldInverse), cameraPosition: toValue(cam.position), vViewPosition: [v.x, v.y, v.z],
        normal: [0, 1, 0], diffuseColor: [0.5, 0.45, 0.4, 1], outgoingLight: [0.2, 0.25, 0.3],
      };
      const fetch = (sampler: Value, uv: Value): Value => { if (reads) reads.n++; return texture2D(sampler, uv); };
      const locals = lines({ vars, fns: { texture2D: fetch } });
      return { colour: vars.diffuseColor as number[], light: vars.outgoingLight as number[], coverOpen: locals.coverOpen as number, wetHere: locals.wetHere as number };
    },
  };
}

const GROUND: { label: string; p: [number, number, number]; under: boolean }[] = [
  { label: 'a platform inside the shed', p: at(layout.aisle + R, 100, PLATFORM_HEIGHT), under: true },
  { label: 'the track bed in the shed\'s second vault', p: at(layout.aisle + 3 * R, 200, 0.05), under: true },
  { label: 'the floor of the shed\'s west aisle', p: at(layout.aisle / 2, 50, 0.05), under: true },
  { label: 'the Western Concourse floor', p: [canopy.centre[0] - canopy.radius * 0.3, 0.05, canopy.centre[1]], under: true },
  { label: 'a platform under its canopy', p: [canopyX, PLATFORM_HEIGHT, canopyZ], under: true },
  { label: 'the ground beside the shed', p: at(W + 15, 100, 0.05), under: false },
  { label: 'the track past the shed\'s end', p: at(W / 2, L + 30, 0.05), under: false },
  { label: 'the ground 3 m beside a canopy', p: [canopyX + 14, 0.05, canopyZ + 14], under: false },
];
/** The same place seen from several cameras: close and low, from the side, from high above looking down at a slant. */
const camerasFor = (p: number[]): THREE.PerspectiveCamera[] => [
  camera(new THREE.Vector3(p[0]! - 6, p[1]! + 1.7, p[2]! + 2), new THREE.Vector3(p[0]!, p[1]!, p[2]!)),
  camera(new THREE.Vector3(p[0]! + 3, p[1]! + 2, p[2]! - 40), new THREE.Vector3(p[0]! + 5, p[1]!, p[2]!)),
  camera(new THREE.Vector3(p[0]! + 120, p[1]! + 300, p[2]! - 90), new THREE.Vector3(p[0]!, p[1]!, p[2]!)),
  camera(new THREE.Vector3(p[0]!, p[1]! + 1.5, p[2]! + 55), new THREE.Vector3(p[0]! - 30, p[1]! + 10, p[2]!)),
];

test('wet ground: where a roof is overhead the surface is not darkened, glossed or whitened; in the open it is, from whichever camera sees it', () => {
  const surface = wetGround(ground[0] as THREE.Material);
  const dark = surface.uniforms.uDark!.value as number, snowK = surface.uniforms.uSnowK!.value as number, sheenK = surface.uniforms.uSheenK!.value as number;
  assert.ok(dark > 0.3 && snowK > 0.9 && sheenK > 0.9, 'asphalt takes it all');
  const cam = camera(new THREE.Vector3(0, 30, 30), new THREE.Vector3(0, 0, 0));
  const base = { colour: [0.5, 0.45, 0.4], light: [0.2, 0.25, 0.3] };

  atmosphere.update({ timeMs: NIGHT, weather: rainState, camera: cam, target: new THREE.Vector3(), wallMs: 1000 });
  const wet = surface.uniforms.uWet!.value as number;
  assert.ok(wet > 0.5 && (surface.uniforms.uSnowCover!.value as number) === 0, `rain: wet ${wet}`);
  for (const g of GROUND) {
    for (const [k, cam2] of camerasFor(g.p).entries()) {
      const r = surface.shade(g.p, cam2);
      if (g.under) {
        assert.equal(r.coverOpen, 0, `${g.label}, camera ${k}: under a roof`);
        assert.equal(r.wetHere, 0);
        assert.deepEqual(r.colour, [...base.colour, 1], `${g.label}, camera ${k}: dry and its own colour`);
        assert.deepEqual(r.light, base.light, `${g.label}, camera ${k}: no sheen`);
      } else {
        assert.equal(r.coverOpen, 1, `${g.label}, camera ${k}: in the open`);
        assert.equal(r.wetHere, wet);
        base.colour.forEach((c, i) => assert.ok(Math.abs((r.colour[i] as number) - c * (1 - dark * wet)) < 1e-12, `${g.label}, camera ${k}: darkened by ${dark} x ${wet}`));
        assert.ok(r.light.every((c, i) => c > (base.light[i] as number)), `${g.label}, camera ${k}: with the sky in it`);
      }
    }
  }

  atmosphere.update({ timeMs: NIGHT, weather: snowState, camera: cam, target: new THREE.Vector3(), wallMs: 2000 });
  const cover = surface.uniforms.uSnowCover!.value as number, snowColour = (surface.uniforms.uSnowColour!.value as THREE.Color).toArray();
  const slush = surface.uniforms.uWet!.value as number; // snow comes with a little wet
  assert.ok(cover > 0.5 && slush > 0 && slush < wet, `snow: cover ${cover}, wet ${slush}`);
  for (const g of GROUND) {
    for (const [k, cam2] of camerasFor(g.p).entries()) {
      const r = surface.shade(g.p, cam2);
      if (g.under) {
        assert.deepEqual(r.colour, [...base.colour, 1], `${g.label}, camera ${k}: no snow lies under a roof`);
        assert.deepEqual(r.light, base.light);
      } else {
        base.colour.forEach((c, i) => {
          const damp = c * (1 - dark * slush);
          assert.ok(Math.abs((r.colour[i] as number) - (damp + (snowColour[i]! - damp) * 0.85 * cover * snowK)) < 1e-12, `${g.label}, camera ${k}: whitened by ${cover}`);
        });
        assert.ok(r.light.every((c, i) => c > (base.light[i] as number)), `${g.label}, camera ${k}: and a little glossy, for the wet in it`);
      }
    }
  }
});

test('wet ground: across a roof\'s edge the surface goes from dry to wet by the soft edge, in the page\'s own fragment lines, whether it is rain or snow', () => {
  const surface = wetGround(ground[0] as THREE.Material);
  const dark = surface.uniforms.uDark!.value as number, snowK = surface.uniforms.uSnowK!.value as number;
  const cam = camera(new THREE.Vector3(0, 30, 30), new THREE.Vector3(0, 0, 0));
  const base = [0.5, 0.45, 0.4];
  for (const [label, state, wallMs] of [['rain', rainState, 6000], ['snow', snowState, 7000]] as const) {
    atmosphere.update({ timeMs: NIGHT, weather: state, camera: cam, target: new THREE.Vector3(), wallMs });
    const wet = surface.uniforms.uWet!.value as number, cover = surface.uniforms.uSnowCover!.value as number, snowColour = (surface.uniforms.uSnowColour!.value as THREE.Color).toArray();
    let last = -1, between = 0, dry = 0, soaked = 0, mid = 0;
    for (let d = -2.4; d <= 2.4; d += 0.04) { // metres out from the shed's west eave, along the ground: the edge is 2.5 m across at its widest, so each side is reached
      const [x, , z] = at(-d, 100, 0);
      const p: [number, number, number] = [x, 0.05, z];
      const r = surface.shade(p, camera(new THREE.Vector3(x - 4, 1.7, z + 2), new THREE.Vector3(x, 0.05, z)));
      const open = groundOpenShare(map, ...p);
      assert.ok(Math.abs(r.coverOpen - open) < 1e-9, `${label}, ${d.toFixed(2)} m out: the surface's share is the map's: ${r.coverOpen} against ${open}`);
      assert.ok(Math.abs(r.wetHere - wet * open) < 1e-9);
      base.forEach((c, i) => {
        const damp = c * (1 - dark * wet * open);
        assert.ok(Math.abs((r.colour[i] as number) - (damp + (snowColour[i]! - damp) * 0.85 * cover * open * snowK)) < 1e-9, `${label}, ${d.toFixed(2)} m out: its colour is the damp and the white it gets`);
      });
      assert.ok(r.coverOpen >= last - 1e-9, `${label}: it only ever gets wetter on the way out (${r.coverOpen} after ${last})`);
      last = r.coverOpen;
      if (r.coverOpen < 1e-9) dry++;
      else if (r.coverOpen > 1 - 1e-9) soaked++;
      else between++;
      if (r.coverOpen >= 0.1 && r.coverOpen <= 0.9) mid++;
    }
    assert.ok(dry > 8 && soaked > 8 && between > 40, `${label}: under the roof, out in the open, and the edge between: ${dry}, ${soaked}, ${between}`);
    assert.ok(mid > 25 && mid < 45, `${label}: from a tenth wet to nine tenths in about a metre and a third (0.04 m a step): ${mid} steps`);
  }
});

test('wet ground: in dry weather the cover map is never read, and nothing changes anywhere', () => {
  const surface = wetGround(ground[1] as THREE.Material);
  const cam = camera(new THREE.Vector3(0, 30, 30), new THREE.Vector3(0, 0, 0));
  atmosphere.update({ timeMs: NIGHT, weather: CLEAR_STATE, camera: cam, target: new THREE.Vector3(), wallMs: 3000 });
  assert.equal(surface.uniforms.uWet!.value, 0);
  assert.equal(surface.uniforms.uSnowCover!.value, 0);
  const reads = { n: 0 };
  for (const g of GROUND) {
    const r = surface.shade(g.p, cam, reads);
    assert.deepEqual(r.colour, [0.5, 0.45, 0.4, 1], g.label);
    assert.deepEqual(r.light, [0.2, 0.25, 0.3]);
    assert.equal(r.coverOpen, 1);
  }
  assert.equal(reads.n, 0, 'a dry surface costs no texture read');
  atmosphere.update({ timeMs: NIGHT, weather: rainState, camera: cam, target: new THREE.Vector3(), wallMs: 4000 });
  surface.shade(GROUND[0]!.p, cam, reads);
  assert.equal(reads.n, 2, 'a wet one costs two: the roof over it, and how much of it is under the roof');
});

test('the concourse floor is kept dry under the dome, and where it is rained on it darkens by its own strength, which is less than asphalt\'s', () => {
  const cam = camera(new THREE.Vector3(0, 30, 30), new THREE.Vector3(0, 0, 0));
  atmosphere.update({ timeMs: NIGHT, weather: rainState, camera: cam, target: new THREE.Vector3(), wallMs: 5000 });
  const floor = wetGround(ground[2] as THREE.Material), asphalt = wetGround(ground[0] as THREE.Material);
  const wet = floor.uniforms.uWet!.value as number;
  const inside = [canopy.centre[0] - canopy.radius * 0.3, 0.05, canopy.centre[1]], outside = at(W + 15, 100, 0.05);
  assert.deepEqual(floor.shade(inside, cam).colour, [0.5, 0.45, 0.4, 1], 'dry under the dome');
  const open = floor.shade(outside, cam);
  assert.ok(Math.abs(open.colour[0]! - 0.5 * (1 - (floor.uniforms.uDark!.value as number) * wet)) < 1e-12, 'and darkened by its own strength where it is rained on');
  assert.ok(open.colour[0]! > asphalt.shade(outside, cam).colour[0]!, 'less than asphalt is');
});

test('the roofs follow the scene: a roof added is covered after a rescan and not before, an unchanged scene is not drawn again, a removed roof uncovers', () => {
  const before = atmosphere.cover() as CoverMap;
  const spot = at(W + 40, 100, 0);
  assert.equal(coverAt(before, spot[0], 2, spot[2]), 0, 'open ground');
  const roof = new THREE.Mesh(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([spot[0] - 5, 6, spot[2] - 5, spot[0] - 5, 6, spot[2] + 5, spot[0] + 5, 6, spot[2] + 5, spot[0] + 5, 6, spot[2] - 5], 3)).setIndex([0, 1, 2, 0, 2, 3]),
    new THREE.MeshBasicMaterial());
  roof.name = 'canopy-glass';
  scene.add(roof);
  assert.ok(atmosphere.cover() === before, 'nothing is drawn until the scene is looked at again');
  atmosphere.rescan();
  const after = atmosphere.cover() as CoverMap;
  assert.ok(after !== before, 'a new roof, a new map');
  assert.equal(coverAt(after, spot[0], 2, spot[2]), 1, 'under the new roof');
  assert.equal(coverAt(after, spot[0], 9, spot[2]), 0, 'and over it');
  assert.equal(coverAt(after, ...at(layout.aisle + R, 100, 1.5)), 1, 'the shed is still covered');
  assert.ok((coverUniforms.uCoverMap.value as THREE.DataTexture).image.data === after.heights, 'the shaders have the new map');
  assert.ok((coverUniforms.uCoverSoft.value as THREE.DataTexture).image.data === after.soft, 'and its soft edge');
  assert.equal(coverUniforms.uCoverRect.value.x, after.x0);
  atmosphere.rescan();
  assert.ok(atmosphere.cover() === after, 'an unchanged scene keeps its map');
  const gpu = new Glsl(COVER_GLSL).call('coverAt', [[spot[0], 2, spot[2]]], { vars: uniformValues(coverUniforms), fns: { texture2D } });
  assert.equal(gpu, 1, 'and the GLSL sees the new roof');
  const swapped = roof.clone(); // a different roof in its place, so there are as many roofs as before
  swapped.position.set(30, 0, 0);
  scene.remove(roof);
  scene.add(swapped);
  atmosphere.rescan();
  assert.equal(coverAt(atmosphere.cover(), spot[0], 2, spot[2]), 0, 'a roof swapped for another is noticed though there are as many roofs');
  assert.equal(coverAt(atmosphere.cover(), spot[0] + 30, 2, spot[2]), 1, 'and the other is covered');
  scene.remove(swapped);
  atmosphere.rescan();
  assert.equal(coverAt(atmosphere.cover(), spot[0] + 30, 2, spot[2]), 0, 'a roof taken away lets the weather back in');
  assert.ok(sameBytes((atmosphere.cover() as CoverMap).heights, before.heights) && sameBytes((atmosphere.cover() as CoverMap).soft, before.soft), 'to the map it was, soft edge and all');
  assert.ok((coverUniforms.uCoverSoft.value as THREE.DataTexture).image.data === (atmosphere.cover() as CoverMap).soft, 'and the shaders have its soft edge back');
});

test('disposing the atmosphere takes the roofs away from the shaders: they see no map, and read nothing', () => {
  atmosphere.dispose();
  assert.equal(coverUniforms.uCoverRect.value.z, 0);
  const glsl = new Glsl(COVER_GLSL);
  assert.equal(glsl.call('coverAt', [[...at(layout.aisle + R, 100, 1.5)]], { vars: uniformValues(coverUniforms), fns: { texture2D } }), 0);
  assert.equal(glsl.call('coverGroundAt', [[...at(layout.aisle + R, 100, 1.5)]], { vars: uniformValues(coverUniforms), fns: { texture2D } }), 0, 'for the ground too');
  assert.equal((coverUniforms.uCoverSoft.value as THREE.DataTexture).image.width, 1, 'and the soft map is the empty one');
  let reads = 0; // with no map the shaders do not fetch a texel at all, for the drops or for the ground
  const counting: Env = { vars: uniformValues(coverUniforms), fns: { texture2D: (sampler: Value, uv: Value): Value => { reads++; return texture2D(sampler, uv); } } };
  glsl.call('coverAt', [[...at(layout.aisle + R, 100, 1.5)]], counting);
  glsl.call('coverGroundAt', [[...at(layout.aisle + R, 100, 1.5)]], counting);
  assert.equal(reads, 0, 'and read nothing');
});
