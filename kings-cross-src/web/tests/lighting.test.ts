// web/src/lighting.ts: how the light lands on the model. Held here: the grade (a filmic tone map for the London scene only), the sun's shadow
// (one 2048 map, a few dozen casters, a box that follows the camera in steps and texels, redrawn only when something moved), and the shade
// under roofs (the page's own GLSL, run by the interpreter in glsl.ts on the real roofs of the real station, as cover-shaders.test.ts does).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { sunDirection } from '../../core/solar.ts';
import { concourseCanopy, SHED_SPAN_WIDTH, shedLayout, shedToWorld, stationBuilding } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { addCity } from '../src/city.ts';
import { buildConcourse } from '../src/concourse.ts';
import { groundCoverAt } from '../src/cover.ts';
import type { CoverMap } from '../src/cover.ts';
import { COVER_GLSL, coverUniforms } from '../src/cover.ts';
import { buildFurniture } from '../src/furniture.ts';
import { addKxCentral } from '../src/kxcentral.ts';
import { addLandmarks } from '../src/landmarks.ts';
import { addRoofShade, createAdditionsWatch, createSunShadow, createUngradedScan, FOOT_SHADE, GLOW_BELOW, GLOW_BELOW_GAIN, grade, INTERIOR, interiorFillFor, leaveOutOfGrade, lightAxes, MOTTLE, ROOF_SHADE, ROOF_SHADE_GLSL, ROOM_REACH, roofShadeUniforms, SHADOW_CASTERS, SHADOW_MAP_SIZE, SHADOW_STEPS, SHADOW_TAPS, shadowFit } from '../src/lighting.ts';
import { cityMaterial, material } from '../src/materials.ts';
import { buildShed, buildTower, buildWesternRange } from '../src/shed.ts';
import { addWorld, DAYLIGHT } from '../src/world.ts';
import { Glsl, toValue } from './glsl.ts';
import type { Env, Sampler, Value } from './glsl.ts';

type V3 = readonly [number, number, number];

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const cityData: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const R = SHED_SPAN_WIDTH / 2;
const at = (u: number, v: number, y: number): [number, number, number] => { const [x, z] = shedToWorld(layout, u, v); return [x, y, z]; };

// ---- the grade ---------------------------------------------------------------------------------------------------------------------------------

const fakeRenderer = (): THREE.WebGLRenderer => ({ toneMapping: THREE.NoToneMapping, toneMappingExposure: 1 }) as unknown as THREE.WebGLRenderer;

test('grade: a scene with a climate (London\'s, Edinburgh\'s own) is drawn through the filmic tone map at its sky\'s exposure with the roof shade on; one without, through neither', () => {
  const renderer = fakeRenderer();
  grade(renderer, true, 1.4);
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 1.4);
  assert.deepEqual(roofShadeUniforms.uRoofShade.value.toArray(), [...ROOF_SHADE.ambient, ROOF_SHADE.direct]);
  grade(renderer, false, 1.4);
  assert.equal(renderer.toneMapping, THREE.NoToneMapping, 'the fixed ?bare=1 rig and the placeholder were tuned to no tone map');
  assert.equal(renderer.toneMappingExposure, 1);
  assert.deepEqual(roofShadeUniforms.uRoofShade.value.toArray(), [0, 0, 0, 0], 'a scene with no climate has no cover map of its own, and the shared steel, ballast and asphalt must not be shaded by another scene\'s');
  grade(renderer, true, 0.9);
  assert.equal(renderer.toneMapping, THREE.ACESFilmicToneMapping);
  assert.equal(renderer.toneMappingExposure, 0.9, 'a second scene\'s own exposure');
  assert.deepEqual(roofShadeUniforms.uRoofShade.value.toArray(), [...ROOF_SHADE.ambient, ROOF_SHADE.direct], 'and back again');
});

test('grade: the concourse\'s fill is set from the sky\'s hemisphere and its cloud for a scene with a climate, and is none for one without (Waverley has no concourse) or before there is a sky', () => {
  const renderer = fakeRenderer();
  const fill = (): number[] => roofShadeUniforms.uInteriorFill.value.toArray();
  grade(renderer, true, 1.25, 1.02, 0);
  assert.deepEqual(fill(), interiorFillFor(1.02, 0).toArray(), 'a clear sky');
  assert.ok(fill().every((c) => c > 0), 'and it is something');
  grade(renderer, true, 1.25, 1.02, 1);
  assert.deepEqual(fill(), interiorFillFor(1.02, 1).toArray(), 'an overcast one');
  assert.ok((fill()[0] as number) < (interiorFillFor(1.02, 0).x), 'a little less');
  grade(renderer, true, 1.25, 0.5, 0);
  assert.deepEqual(fill(), interiorFillFor(0.5, 0).toArray(), 'it follows the hemisphere\'s intensity (the hour)');
  grade(renderer, false, 1.25, 1.02, 0);
  assert.deepEqual(fill(), [0, 0, 0], 'a scene with no climate has none');
  grade(renderer, true, 1.25, 1.02);
  assert.deepEqual(fill(), interiorFillFor(1.02, 0).toArray(), 'a sky given with no cloud is a clear one');
  grade(renderer, true, 1.25);
  assert.deepEqual(fill(), [0, 0, 0], 'and with no sky yet, none');
});

test('interiorFillFor: the hemisphere\'s intensity times INTERIOR.level, warm, kept less under cloud, none without a hemisphere, divided by the shade\'s blue loss (the shader multiplies by it)', () => {
  const blueLoss = ROOF_SHADE.ambient[2];
  const close = (a: number, b: number, what: string): void => assert.ok(Math.abs(a - b) < 1e-12, `${what}: ${a} against ${b}`);
  const clear = interiorFillFor(1, 0), overcast = interiorFillFor(1, 1);
  for (let k = 0; k < 3; k++) close(clear.getComponent(k) * blueLoss, INTERIOR.level * (INTERIOR.tint[k] as number), `colour ${k} wholly under the dome: the shader's blue loss times this`);
  assert.ok(clear.x > clear.z && clear.x >= clear.y && clear.y >= clear.z, `warm: ${clear.toArray()}`);
  assert.ok(INTERIOR.cloud > 0 && INTERIOR.cloud < 1, 'cloud takes some of it, never all');
  for (let k = 0; k < 3; k++) close(overcast.getComponent(k), clear.getComponent(k) * (1 - INTERIOR.cloud), `colour ${k} under full cloud`);
  for (let k = 0; k < 3; k++) close(interiorFillFor(0.5, 0).getComponent(k) * 2, clear.getComponent(k), `colour ${k}: linear in the hemisphere's intensity`);
  assert.deepEqual(interiorFillFor(0, 0.7).toArray(), [0, 0, 0], 'no hemisphere, no fill');
  const out = new THREE.Vector3();
  assert.ok(interiorFillFor(1, 0, out) === out, 'written into the vector it is given');
});

test('leaveOutOfGrade: lines, points and sprites are authored in display colours and skip the tone map; lit surfaces and the dome keep their own setting', () => {
  const line = new THREE.LineBasicMaterial(), points = new THREE.PointsMaterial(), sprite = new THREE.SpriteMaterial();
  const lambert = new THREE.MeshLambertMaterial(), basic = new THREE.MeshBasicMaterial();
  const all = [line, points, sprite, lambert, basic];
  const before = all.map((m) => m.version);
  assert.deepEqual(all.map((m) => leaveOutOfGrade(m)), [true, true, true, false, false], 'it says which it changed');
  assert.deepEqual(all.map((m, i) => m.version - (before[i] as number)), [1, 1, 1, 0, 0], 'and recompiles those, once (a program is cached with its tone map in it), and only those');
  assert.deepEqual([line, points, sprite].map((m) => m.toneMapped), [false, false, false]);
  assert.deepEqual([lambert, basic].map((m) => m.toneMapped), [true, true]);
  const version = line.version;
  assert.equal(leaveOutOfGrade(line), false);
  assert.equal(line.version, version, 'once: a material already out of the grade is not recompiled');
});

test('createUngradedScan: the unlit things of the scene on show are left out of the grade, on the frame they arrive, and a material is not looked at twice', () => {
  const scan = createUngradedScan();
  const root = new THREE.Group();
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial());
  const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial());
  root.add(line, wall);
  assert.equal(scan(root), 1, 'the line');
  assert.equal(line.material.toneMapped, false);
  assert.equal(wall.material.toneMapped, true, 'the wall keeps the grade');
  assert.equal(scan(root), 0, 'nothing new, nothing done');
  // an object it has seen is not read again: what a frame costs is the new objects, not every material of the scene
  line.material.toneMapped = true;
  assert.equal(scan(root), 0, 'a seen object is not looked at twice');
  assert.equal(line.material.toneMapped, true);
  line.material.toneMapped = false;
  // a label and a train that come in later, deep in a group, are caught the frame they do
  const train = new THREE.Group();
  const label = new THREE.Sprite(new THREE.SpriteMaterial());
  const halo = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial());
  train.add(label, halo);
  root.add(train);
  assert.equal(scan(root), 2);
  assert.deepEqual([label.material.toneMapped, halo.material.toneMapped], [false, false]);
  // two scenes, two scans: each looks at its own objects (London's and Edinburgh's are drawn by turns)
  const other = new THREE.Group();
  other.add(new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial()));
  assert.equal(scan(other), 1);
  assert.equal(createUngradedScan()(root), 0, 'and a fresh scan finds them already out of the grade');
});

test('createAdditionsWatch: the scans of a scene run on the first look and on the frame after something was added anywhere in it, and on no other', () => {
  const look = createAdditionsWatch();
  const scene = new THREE.Scene();
  const station = new THREE.Group();
  const shed = new THREE.Group();
  station.add(shed);
  scene.add(station);
  assert.equal(look(scene), true, 'the first look at a scene');
  assert.equal(look(scene), false, 'nothing has come in since');
  assert.equal(look(scene), false);
  scene.add(new THREE.Group());
  assert.equal(look(scene), true, 'an object added to the scene itself');
  assert.equal(look(scene), false);
  shed.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial()));
  assert.equal(look(scene), true, 'an object added deep in a group that was there from the start');
  assert.equal(look(scene), false);
  // a train built apart and then brought in: found as one addition, and what it holds already needs no second look
  const train = new THREE.Group();
  const car = new THREE.Group();
  car.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial()));
  train.add(car);
  station.add(train);
  assert.equal(look(scene), true, 'a train arrives');
  assert.equal(look(scene), false);
  car.add(new THREE.Group());
  assert.equal(look(scene), true, 'something added to the car of a train that arrived after the first look');
  assert.equal(look(scene), false);
  // a scene is looked at whole again when it comes back on show (London's and Edinburgh's are drawn by turns)
  const other = new THREE.Scene();
  assert.equal(look(other), true, 'the other scene, the first time');
  assert.equal(look(other), false);
  assert.equal(look(scene), true, 'back to the first: its additions may have come while the other was drawn');
  assert.equal(look(scene), false);
  assert.equal(createAdditionsWatch()(scene), true, 'a fresh watch has not looked at anything');
});

test('createAdditionsWatch: an object is listened to once, however many times the scene is looked at again (each look walks the whole scene, a few thousand objects)', () => {
  const look = createAdditionsWatch();
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  scene.add(group);
  const listened = new Map<THREE.Object3D, number>();
  for (const o of [scene, group]) {
    const add = o.addEventListener.bind(o) as (type: string, listener: () => void) => void;
    (o as unknown as { addEventListener: typeof add }).addEventListener = (type, listener) => { listened.set(o, (listened.get(o) ?? 0) + 1); add(type, listener); };
  }
  assert.equal(look(scene), true);
  group.add(new THREE.Group());
  assert.equal(look(scene), true);
  group.add(new THREE.Group());
  assert.equal(look(scene), true);
  assert.deepEqual([listened.get(scene), listened.get(group)], [1, 1], 'listened to on the first look, and not again on the next two');
});

test('the shadow shader: a face turned from the sun does not ask the map, and the soft edge asks SHADOW_TAPS times, in three\'s own chunks that every lit material compiles', () => {
  const lights = THREE.ShaderChunk.lights_fragment_begin;
  assert.ok(lights.includes('receiveShadow && dot( geometryNormal, directLight.direction ) > 0.0 ) ? getShadow( directionalShadowMap[ i ]'), 'the directional light asks only the faces it lights');
  assert.equal(lights.split('getShadow( directionalShadowMap').length - 1, 1, 'and there is one such ask');
  assert.equal(lights.split('receiveShadow && dot( geometryNormal').length - 1, 1, 'the point, spot and sun lights are left as three has them');
  const pars = THREE.ShaderChunk.shadowmap_pars_fragment;
  const start = pars.indexOf('float getShadow( sampler2DShadow');
  const body = pars.slice(start, pars.indexOf('return mix( 1.0, shadow, shadowIntensity )', start));
  assert.ok(start > 0 && body.length > 200, 'the hardware-comparison soft edge is there');
  assert.equal((body.match(/texture\( shadowMap/g) || []).length, SHADOW_TAPS, `${SHADOW_TAPS} asks of the map for one pixel`);
  assert.equal((body.match(new RegExp(`vogelDiskSample\\( \\d, ${SHADOW_TAPS}, phi \\)`, 'g')) || []).length, SHADOW_TAPS, 'spread over one disk of that many points');
  const taps: number = SHADOW_TAPS; // (widened: three's own five is a setting this may come back to)
  assert.ok(body.includes(taps === 5 ? '* 0.2;' : `* ${(1 / taps).toFixed(8)};`), 'and averaged');
  assert.ok(SHADOW_TAPS >= 3 && SHADOW_TAPS <= 5, 'three asks at the least, or the edge is a hard step with a grain on it');
  // each ask is one point of the disk, turned by the pixel's own angle and spread by the light's radius, at the depth of the fragment, and the asks are summed
  for (let i = 0; i < SHADOW_TAPS; i++) assert.ok(body.includes(`texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ${i}, ${SHADOW_TAPS}, phi ) * radius, shadowCoord.z ) )`), `ask ${i}, spread by the radius`);
  assert.ok(body.includes(`shadow = ( ${Array.from({ length: SHADOW_TAPS }, (_, i) => `texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( ${i}, ${SHADOW_TAPS}, phi ) * radius, shadowCoord.z ) )`).join(' + ')} ) * `), 'summed, not subtracted');
});

/** lighting.ts as a second module (a query makes it a new one), so that its top-level patches run again on three's chunks as they are now. */
const loadAgain = (tag: string): Promise<unknown> => import(`../src/lighting.ts?${tag}`);

test('the patches of three\'s chunks: the module loaded a second time (a dev server reloads it) finds them made and leaves the chunks as they are; a chunk that three has moved on from is an error, not a silent no-op', async () => {
  const chunks = THREE.ShaderChunk as unknown as Record<string, string>;
  const patched = { lights_fragment_begin: chunks.lights_fragment_begin as string, shadowmap_pars_fragment: chunks.shadowmap_pars_fragment as string };
  await assert.doesNotReject(loadAgain('again'), 'a patch that is made is not made twice');
  assert.deepEqual({ lights_fragment_begin: chunks.lights_fragment_begin, shadowmap_pars_fragment: chunks.shadowmap_pars_fragment }, patched, 'and the chunks are as they were');
  for (const name of ['lights_fragment_begin', 'shadowmap_pars_fragment'] as const) {
    chunks[name] = 'void main() { gl_FragColor = vec4( 1.0 ); }';
    try {
      await assert.rejects(loadAgain(`moved-on-${name}`), (error: Error) => error.message === `lighting.ts: three's ${name} chunk has changed`, `${name}: a chunk that no longer reads as expected stops the module loading`);
    } finally {
      chunks[name] = patched[name];
    }
  }
});

// ---- the shadow box ----------------------------------------------------------------------------------------------------------------------------

const noon = sunDirection(59, 151);
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

test('shadowFit: the box is one of a few fixed sizes, so zooming never makes the shadows swim, and no bigger than the 2048 map can hold at about a metre a texel', () => {
  assert.equal(SHADOW_MAP_SIZE, 2048);
  assert.deepEqual(SHADOW_STEPS, [48, 72, 108, 160, 240, 360, 540, 800]);
  const halves = new Set<number>();
  for (let d = 1; d <= 3000; d *= 1.07) {
    const f = shadowFit([40, 0, -150], d, noon);
    halves.add(f.half);
    assert.ok(SHADOW_STEPS.includes(f.half), `${f.half} is a step`);
    assert.ok(f.half >= Math.min(800, Math.max(48, d * 1.6)), `at ${d.toFixed(0)} m the box (${f.half}) reaches 1.6 times the distance`);
    assert.ok(Math.abs(f.texel - (2 * f.half) / SHADOW_MAP_SIZE) < 1e-12);
    assert.ok(f.texel <= 0.79, `${f.texel.toFixed(3)} m a texel is at most the 800 m box's`);
  }
  assert.equal(halves.size, SHADOW_STEPS.length, 'every step is used');
  assert.equal(shadowFit([0, 0, 0], 30, noon).half, 48, 'close in the box is the smallest step');
  assert.equal(shadowFit([0, 0, 0], 30.1, noon).half, 72, 'a hair past 48/1.6 it steps up');
  assert.equal(shadowFit([0, 0, 0], 5000, noon).half, 800, 'far out it is the largest');
  assert.equal(shadowFit([0, 0, 0], 30, noon, 4096).texel, 96 / 4096, 'a texel is the box over the map it is drawn into');
});

test('shadowFit: the focus is held to the map\'s texels in the light\'s plane, so moving the camera never makes the edges crawl', () => {
  const { x, y } = lightAxes(noon);
  assert.ok(Math.abs(dot(x, y)) < 1e-12 && Math.abs(dot(x, noon)) < 1e-12 && Math.abs(dot(y, noon)) < 1e-12, 'the light\'s frame is square');
  assert.ok(y[1] > 0.4, 'and its y is the more upright axis');
  // three unit axes at right angles for every sun, one straight overhead (exactly, where the axis the frame is built from has to change) and one on the horizon too
  const suns: V3[] = [90, 89.9, 75, 59, 30, 10, 3].map((el) => sunDirection(el, 200));
  suns.push([0, 1, 0], [0, -1, 0]);
  for (const sun of suns) {
    const f = lightAxes(sun);
    const length = (v: V3): number => Math.hypot(v[0], v[1], v[2]);
    assert.ok(Math.abs(length(f.dir) - 1) < 1e-12 && Math.abs(length(f.x) - 1) < 1e-12 && Math.abs(length(f.y) - 1) < 1e-12, `sun at ${sun}: three unit axes (${length(f.x)}, ${length(f.y)})`);
    assert.ok(Math.abs(dot(f.x, f.y)) < 1e-12 && Math.abs(dot(f.x, f.dir)) < 1e-12 && Math.abs(dot(f.y, f.dir)) < 1e-12, `sun at ${sun}: at right angles`);
  }
  const rand =((seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; })(7);
  for (let n = 0; n < 200; n++) {
    const focus: V3 = [rand() * 400 - 200, rand() * 30, rand() * 400 - 200];
    const f = shadowFit(focus, 20 + rand() * 600, noon);
    for (const axis of [x, y]) {
      const cells = dot(f.target, axis) / f.texel;
      assert.ok(Math.abs(cells - Math.round(cells)) < 1e-6, `the target is ${cells} texels along an axis`);
      assert.ok(Math.abs(dot(f.target, axis) - dot(focus, axis)) <= f.texel / 2 + 1e-9, 'and within half a texel of the focus');
    }
    const along = dot([f.target[0] - focus[0], f.target[1] - focus[1], f.target[2] - focus[2]], noon);
    assert.ok(Math.abs(along) < 1e-9, 'the snap moves the focus only across the light, never along it');
  }
});

test('shadowFit: the light stands back along the sun\'s direction and its depth covers the casters and the ground the box slopes across, at any sun above 10 degrees', () => {
  for (const el of [90, 59, 30, 15, 10]) {
    const toSun = sunDirection(el, 180);
    for (const d of [40, 200, 900]) {
      const f = shadowFit([0, 0, 0], d, toSun);
      const back = f.half * 1.2 + 150;
      const dist = Math.hypot(f.position[0] - f.target[0], f.position[1] - f.target[1], f.position[2] - f.target[2]);
      assert.ok(Math.abs(dist - back) < 1e-6, `${el} degrees, ${d} m: the light is ${dist} from its target, not ${back}`);
      const toLight: V3 = [(f.position[0] - f.target[0]) / dist, (f.position[1] - f.target[1]) / dist, (f.position[2] - f.target[2]) / dist];
      assert.ok(dot(toLight, lightAxes(toSun).dir) > 1 - 1e-9, `${el} degrees, ${d} m: the light stands on the sun's side of its target, looking down the sun's rays`);
      assert.equal(f.near, 1);
      assert.ok(f.far >= back + f.half / Math.tan((el * Math.PI) / 180) + 199, `${el} degrees, ${d} m: the far plane ${f.far} reaches the far corner of the ground`);
    }
  }
  // below 10 degrees the depth stays that of 10 degrees: a bounded range, and the shadows stop at the box's far edge
  assert.equal(shadowFit([0, 0, 0], 100, sunDirection(3, 180)).far, shadowFit([0, 0, 0], 100, sunDirection(10, 180)).far);
});

test('shadowFit: the bias is a hair of depth and the normal offset a few texels at most, so a lit wall neither shadows itself nor floats off its shadow', () => {
  for (const d of [20, 100, 400, 3000]) {
    const f = shadowFit([0, 0, 0], d, noon);
    assert.ok(f.bias < 0 && f.bias > -0.001, `depth bias ${f.bias}`);
    assert.ok(f.normalBias >= 0.03 && f.normalBias <= 0.3, `normal bias ${f.normalBias}`);
    assert.ok(f.normalBias <= 4 * f.texel + 0.031, `at most a few texels (${f.normalBias} against a texel of ${f.texel})`);
  }
  // both grow with the texel: a coarser map takes a bigger depth bias (its metres: the bias is in the depth range's own unit) and a bigger offset, until the offset's cap
  const metres = (f: ReturnType<typeof shadowFit>): number => -f.bias * f.far;
  const fits = [20, 100, 400].map((d) => shadowFit([0, 0, 0], d, noon));
  assert.ok(fits.every((f) => metres(f) >= 0.02), `a bias of 2 cm at the least: ${fits.map(metres)}`);
  assert.ok(metres(fits[0] as ReturnType<typeof shadowFit>) < metres(fits[1] as ReturnType<typeof shadowFit>) && metres(fits[1] as ReturnType<typeof shadowFit>) < metres(fits[2] as ReturnType<typeof shadowFit>), `the depth bias grows with the texel: ${fits.map(metres)}`);
  for (const f of fits) if (f.normalBias > 0.03 && f.normalBias < 0.3) assert.ok(f.normalBias >= 0.5 * f.texel && f.normalBias <= f.texel, `between half a texel and a texel, away from its floor and its cap: ${f.normalBias} for a texel of ${f.texel}`);
  assert.equal(shadowFit([0, 0, 0], 20, noon, 8192).normalBias, 0.03, 'a finer map keeps the offset above its floor of 3 cm');
  assert.equal(shadowFit([0, 0, 0], 400, noon, 512).normalBias, 0.3, 'and a coarser one holds it to its cap of 30 cm');
});

// ---- the casters: the real scene's meshes -------------------------------------------------------------------------------------------------------

const scene = new THREE.Scene();
const footprint = stationBuilding(data)!.pts;
scene.add(buildShed(layout), buildTower(60), buildWesternRange());
scene.add(buildConcourse(concourseCanopy(data), footprint, layout, data.buildings.filter((b) => b.id === 46821177).map((b) => b.pts)));
scene.add(buildFurniture(data, layout));
addLandmarks(scene, data);
addKxCentral(scene, data);
addCity(scene, data, cityData, { hidden: new Set(data.buildings.slice(0, 5).map((b) => b.id)), trees: true });
const world = addWorld(scene, { grid: false });
const meshes: THREE.Mesh[] = [];
scene.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.InstancedMesh).isInstancedMesh) meshes.push(o as THREE.Mesh); });
const materialsOf = (m: THREE.Mesh): THREE.Material[] => (Array.isArray(m.material) ? m.material : [m.material]);

test('the casters are named meshes of the real scene: every name is there, and none of the small things, the glass or the rails is one (the trees are, as one instanced draw)', () => {
  const names = new Set(meshes.map((m) => m.name));
  for (const name of SHADOW_CASTERS) assert.ok(names.has(name), `"${name}" is a mesh in the built scene (a renamed mesh would silently stop casting)`);
  assert.ok(SHADOW_CASTERS.size <= 46, `${SHADOW_CASTERS.size} casters keeps the shadow pass to a few dozen draws`);
  // city-glass is the whole wall of a curtain-walled office block (spandrels and mullions as much as glass), the one name with "glass" in it that is a building; city-trees is every
  // tree of the city in one instanced draw of about 30 triangles a tree, the one small thing that casts (round 3's score: the forecourt's trees floated on the ground)
  for (const name of SHADOW_CASTERS) assert.ok(name === 'city-glass' || name === 'city-trees' || !/glass|glaz|window|tree|rail|lamp|sign|bench|train|label/i.test(name), `"${name}" is glazing or a small thing`);
  const trees = meshes.find((m) => m.name === 'city-trees');
  assert.ok(trees && (trees as THREE.InstancedMesh).isInstancedMesh && (trees as THREE.InstancedMesh).count > 500, 'the trees are one instanced mesh of the city, a thousand of them');
  assert.ok(SHADOW_CASTERS.has('city-trees'), 'and they cast: a tree that casts no shadow floats on the ground in the picture');
  for (const m of meshes) {
    if (!SHADOW_CASTERS.has(m.name)) continue;
    for (const mat of materialsOf(m)) assert.ok(!['roofGlass', 'shedGlass', 'glass', 'canopyGlass', 'city-glass-pane'].includes(mat.name), `${m.name}: the sun comes through glass (${mat.name})`);
  }
  assert.ok(meshes.some((m) => SHADOW_CASTERS.has(m.name) && m.name.startsWith('shed-')) && meshes.some((m) => m.name === 'city-stock'), 'the shed and the city are both in this scene');
});

test('createSunShadow: one directional light casts one 2048 map by hand; the casters cast from both faces, every lit surface takes the shadow, and nothing is flagged twice', () => {
  const sun = world.lights.sun;
  const shadow = createSunShadow(scene, sun);
  assert.equal(sun.shadow.needsUpdate, true, 'the first frame draws the map, whether or not update() has run before it');
  assert.equal(shadow.tag(), true, 'casters found');
  assert.equal(sun.castShadow, true);
  assert.deepEqual([sun.shadow.mapSize.x, sun.shadow.mapSize.y], [2048, 2048]);
  assert.ok(sun.shadow.radius > 1 && sun.shadow.radius < 3, `a soft edge, a pixel or two wide (three's own is 1; the soft edge asks the map ${SHADOW_TAPS} times over a disk of this radius): ${sun.shadow.radius}`);
  assert.equal(sun.shadow.autoUpdate, false, 'drawn on demand, not every frame');
  assert.equal((sun.shadow.camera as THREE.OrthographicCamera).isOrthographicCamera, true);
  assert.equal(world.lights.fills.some((f) => f.castShadow) || world.lights.hemisphere.castShadow === true, false, 'one caster: the sun');
  const casting = meshes.filter((m) => m.castShadow);
  assert.deepEqual(new Set(casting.map((m) => m.name)), new Set(meshes.filter((m) => SHADOW_CASTERS.has(m.name)).map((m) => m.name)), 'exactly the named ones');
  assert.ok(casting.length >= 30 && casting.length <= 46, `${casting.length} casters`); // 45 before the trees (one more draw, instanced) joined them
  for (const m of casting) for (const mat of materialsOf(m)) assert.equal(mat.shadowSide, THREE.DoubleSide, `${m.name}: both faces go into the map`);
  for (const m of meshes) {
    const lit = materialsOf(m).some((mat) => (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial || (mat as THREE.MeshPhongMaterial).isMeshPhongMaterial);
    const seeThrough = materialsOf(m).some((mat) => mat.transparent);
    assert.equal(m.receiveShadow, lit && !seeThrough, `${m.name} takes the shadow if it is lit and not glass (a pane is seen through: the look-up is not paid there)`);
  }
  assert.ok(meshes.some((m) => !m.receiveShadow && materialsOf(m).some((mat) => (mat as THREE.MeshLambertMaterial).isMeshLambertMaterial && mat.transparent)), 'the scene has lit glass, and it is the exception');
  assert.equal(shadow.casters().length, casting.length);
  assert.equal(shadow.tag(), false, 'a second pass finds nothing new');
  assert.equal(shadow.casters().length, casting.length, 'and does not list a mesh twice');
  assert.ok(scene.children.includes(sun.target), 'the light\'s target is in the scene');
  shadow.dispose();
  assert.equal(sun.castShadow, false);
  assert.ok(!scene.children.includes(sun.target));
});

test('createSunShadow.tag: only meshes are taken: a group or a line that carries a caster\'s name is not flagged, listed or counted as a find, and a mesh of the same name is', () => {
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'city-stock';
  const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
  line.name = 'city-roof';
  scene.add(group, line);
  const shadow = createSunShadow(scene, new THREE.DirectionalLight());
  assert.equal(shadow.tag(), false, 'nothing here is a mesh');
  assert.deepEqual(shadow.casters(), []);
  assert.deepEqual([group.castShadow, line.castShadow, line.receiveShadow], [false, false, false], 'and nothing is flagged');
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshLambertMaterial());
  mesh.name = 'city-stock';
  scene.add(mesh);
  assert.equal(shadow.tag(), true, 'the mesh is found');
  assert.deepEqual(shadow.casters(), [mesh]);
  assert.equal(shadow.tag(), false, 'once');
  shadow.dispose();
});

test('createSunShadow: the map is made up front as a 24-bit depth texture with a one-channel colour attachment, 21 MB and not the 34 MB three allocates unasked (GPU texture cap +32 MB)', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(new THREE.Scene(), sun);
  const map = sun.shadow.map;
  assert.ok(map, 'three would make its own, with an RGBA colour attachment that nothing reads, on the first draw');
  assert.deepEqual([map.width, map.height], [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]);
  assert.equal(map.texture.format, THREE.RedFormat, 'one channel: the lit shaders sample the depth texture, and three samples the colour one only when it is RG');
  assert.equal(map.texture.type, THREE.UnsignedByteType);
  const depth = map.depthTexture as THREE.DepthTexture;
  assert.ok(depth && depth.isDepthTexture, 'the depth the lit shaders compare against');
  assert.equal(depth.name, 'sun.shadowMap', 'named for the debugger that lists the page\'s textures (three names the maps it makes itself)');
  assert.deepEqual([depth.image.width, depth.image.height], [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]);
  assert.equal(depth.format, THREE.DepthFormat);
  assert.equal(depth.type, THREE.UnsignedIntType);
  // what three sets for PCFShadowMap: a hardware comparison (sampler2DShadow) with a linear filter, which is what softens the edge
  assert.equal(depth.compareFunction, THREE.LessEqualCompare);
  assert.deepEqual([depth.minFilter, depth.magFilter], [THREE.LinearFilter, THREE.LinearFilter]);
  const bytes = SHADOW_MAP_SIZE * SHADOW_MAP_SIZE * (1 + 4);
  assert.ok(bytes < 22e6, `${(bytes / 1e6).toFixed(1)} MB: the colour attachment is a byte a texel and the depth four`);
  let released = 0;
  map.addEventListener('dispose', () => { released++; });
  shadow.dispose();
  assert.equal(released, 1, 'the map goes back with the light: it is 21 MB of the page\'s texture memory');
});

test('createSunShadow.update: the box follows the camera\'s target; the map is flagged for redraw only when the box, the sun or a caster moved', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(scene, sun);
  shadow.tag();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(0, 100, 250);
  const target = new THREE.Vector3(10, 0, 20);
  const toSun = noon;
  assert.equal(shadow.update(camera, target, toSun), true, 'the first fit draws');
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  const fit = shadowFit([10, 0, 20], camera.position.distanceTo(target), toSun);
  target.set(...fit.target); // stand the focus on a texel corner, so a nudge of a fifth of a texel cannot cross into the next one
  shadow.update(camera, target, toSun);
  sun.shadow.needsUpdate = false;
  assert.equal(cam.right, fit.half);
  assert.equal(cam.left, -fit.half);
  assert.equal(cam.top, fit.half, 'the box is square');
  assert.equal(cam.bottom, -fit.half);
  assert.equal(cam.near, fit.near);
  assert.equal(cam.far, fit.far);
  const projection = cam.projectionMatrix.elements;
  assert.ok(Math.abs((projection[0] as number) - 1 / fit.half) < 1e-12 && Math.abs((projection[5] as number) - 1 / fit.half) < 1e-12 && Math.abs((projection[10] as number) + 2 / (fit.far - fit.near)) < 1e-12, 'and the projection is built for it');
  assert.deepEqual([12, 13, 14].map((i) => +(sun.target.matrixWorld.elements[i] as number).toFixed(6)), fit.target.map((n) => +n.toFixed(6)), 'the light\'s target is where it was put, its matrix too: the map can be drawn at once');
  assert.deepEqual(sun.target.position.toArray().map((n) => +n.toFixed(6)), fit.target.map((n) => +n.toFixed(6)));
  assert.deepEqual(sun.position.toArray().map((n) => +n.toFixed(6)), fit.position.map((n) => +n.toFixed(6)));
  assert.equal(sun.shadow.bias, fit.bias);
  assert.equal(sun.shadow.normalBias, fit.normalBias);
  assert.equal(shadow.update(camera, target, toSun), false, 'nothing moved: no redraw');
  assert.equal(sun.shadow.needsUpdate, false);
  target.x += fit.texel * 0.2; // a nudge inside one texel: the snapped focus is the same
  assert.equal(shadow.update(camera, target, toSun), false, 'a shift of a fifth of a texel does not redraw');
  target.x -= fit.texel * 0.2;
  target.add(new THREE.Vector3(...toSun).multiplyScalar(6)); // along the light itself: the same picture, cut at other depths
  assert.equal(shadow.update(camera, target, toSun), false, 'a move along the light\'s own direction does not redraw (a pan toward the sun must not redraw every frame)');
  target.set(...fit.target);
  target.x += 25;
  assert.equal(shadow.update(camera, target, toSun), true, 'a real move does');
  assert.equal(sun.shadow.needsUpdate, true);
  sun.shadow.needsUpdate = false;
  assert.equal(shadow.update(camera, target, sunDirection(58, 152)), true, 'and so does the sun moving');
  assert.equal(cam.far, shadowFit([target.x, target.y, target.z], camera.position.distanceTo(target), sunDirection(58, 152)).far, 'and the depth the box is cut at follows the sun, the size of the box staying as it was');
  sun.shadow.needsUpdate = false;
  const hidden = shadow.casters().find((m) => m.visible) as THREE.Mesh;
  hidden.visible = false;
  assert.equal(shadow.update(camera, target, sunDirection(58, 152)), true, 'and so does a caster being hidden (the roof override)');
  hidden.visible = true;
  assert.equal(shadow.update(camera, target, sunDirection(58, 152)), true, 'or shown again');
  camera.position.set(0, 100, 900);
  assert.equal(shadow.update(camera, target, sunDirection(58, 152)), true, 'a step in the box\'s size');
  shadow.dispose();
});

test('createSunShadow.update: the box is sized from the camera\'s distance to its target wherever they stand, and a step in its size or a move of the sun redraws the map even with the focus at the world origin, where the texel it stands on does not change', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(new THREE.Scene(), sun);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  const camera = new THREE.PerspectiveCamera();
  const origin = new THREE.Vector3();
  camera.position.set(0, 0, 30);
  assert.equal(shadow.update(camera, origin, noon), true);
  assert.equal(cam.right, 48, 'a camera 30 m from its target: the smallest box');
  camera.position.set(0, 0, 100);
  assert.equal(shadow.update(camera, origin, noon), true, 'pulled back to 100 m: the box goes from 48 m to 160 m a side');
  assert.equal(cam.right, 160);
  assert.equal(shadow.update(camera, origin, sunDirection(58, 152)), true, 'and the sun moving');
  assert.equal(shadow.update(camera, origin, sunDirection(58, 152)), false, 'and nothing else moving, nothing');
  // a camera and a target far from the origin and close to each other: the box is the camera's distance to its target (31.6 m), not the camera's distance to the origin (1,414 m)
  const far = new THREE.Vector3(1000, 0, 1030);
  camera.position.set(1000, 10, 1000);
  shadow.update(camera, far, noon);
  assert.equal(cam.right, 72, 'the box of a camera 31.6 m from its target');
  shadow.dispose();
});

test('createSunShadow.update: a pan along either axis of the light\'s plane redraws the map, a camera and a target moving together at the same distance', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(new THREE.Scene(), sun);
  const camera = new THREE.PerspectiveCamera();
  const offset = new THREE.Vector3(0, 100, 250);
  const stand = (focus: THREE.Vector3): boolean => { camera.position.copy(focus).add(offset); return shadow.update(camera, focus, noon); };
  const { x, y } = lightAxes(noon);
  const base = new THREE.Vector3(...shadowFit([10, 0, 20], offset.length(), noon).target);
  assert.equal(stand(base), true, 'the first fit');
  assert.equal(stand(base), false, 'standing still');
  for (const [name, axis] of [['flat', x], ['upright', y]] as const) {
    assert.equal(stand(base.clone().add(new THREE.Vector3(...axis).multiplyScalar(25))), true, `25 m along the light's ${name} axis`);
    assert.equal(stand(base), true, 'and back');
  }
  shadow.dispose();
});

test('createSunShadow.update: the shadow camera\'s projection is rebuilt when the box changes size or the sun changes the depth it is cut at, and not when the box only moves', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(new THREE.Scene(), sun);
  const cam = sun.shadow.camera as THREE.OrthographicCamera;
  let builds = 0;
  const rebuild = cam.updateProjectionMatrix.bind(cam);
  cam.updateProjectionMatrix = () => { builds++; rebuild(); };
  const camera = new THREE.PerspectiveCamera();
  const stand = (distance: number, focus: THREE.Vector3, toSun: V3): void => { camera.position.set(focus.x, focus.y, focus.z + distance); shadow.update(camera, focus, toSun); };
  const morning = sunDirection(58, 152);
  stand(30, new THREE.Vector3(), noon);
  assert.equal(builds, 1, 'the first fit builds it');
  stand(30, new THREE.Vector3(7, 0, 3), noon);
  stand(25, new THREE.Vector3(-20, 0, 40), noon);
  assert.equal(builds, 1, 'a move within the same step of the box builds nothing');
  stand(100, new THREE.Vector3(), noon);
  assert.equal(builds, 2, 'a step in the size builds it');
  stand(100, new THREE.Vector3(5, 0, 0), noon);
  assert.equal(builds, 2);
  stand(100, new THREE.Vector3(), morning);
  assert.equal(builds, 3, 'and a sun at another height, which cuts the same box at another depth');
  stand(100, new THREE.Vector3(), morning);
  assert.equal(builds, 3, 'once');
  shadow.dispose();
});

test('createSunShadow.update: the lattice and columns cast while the camera is in the concourse, the ribs while it is in the shed, the trees while it is in neither, and the pass stays under its triangle budget (round 5)', () => {
  const sun = new THREE.DirectionalLight();
  const shadow = createSunShadow(scene, sun);
  shadow.tag();
  scene.updateMatrixWorld(true);
  const centre = (name: string): THREE.Vector3 => new THREE.Box3().setFromObject(meshes.find((m) => m.name === name) as THREE.Mesh).getCenter(new THREE.Vector3());
  const triangles = (m: THREE.Mesh): number => (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3 * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
  const cast = (name: string): boolean => shadow.casters().filter((m) => m.name === name).every((m) => m.castShadow);
  const camera = new THREE.PerspectiveCamera();
  const target = new THREE.Vector3();
  // the casters that belong to no room and are not the trees (the city's walls and roofs, the hotels, the front, the canopies) cast wherever the camera stands
  const roomed = new Set(['concourse-lattice', 'concourse-column', 'shed-ribs', 'city-trees']);
  const stand = (p: THREE.Vector3, y: number): number => {
    camera.position.set(p.x, y, p.z);
    target.set(p.x + 10, 5, p.z);
    shadow.update(camera, target, noon);
    const rest = shadow.casters().filter((m) => !roomed.has(m.name));
    assert.ok(rest.length > 20 && rest.every((m) => m.castShadow), `${rest.length} casters outside the rooms and the trees, all of them casting`);
    return shadow.casters().filter((m) => m.visible && m.castShadow).reduce((s, m) => s + triangles(m), 0);
  };
  const concourse = centre('concourse-lattice'), shed = centre('shed-ribs');
  // The page draws at most 643,505 triangles without the shadow pass (the nine rubric views, round 4's measure) and must stay under 800,000 on the frame that redraws the map too,
  // so the pass has 156,495. The page's own casters, flagged, add up to 155,300 in the concourse (and 147,400 drawn, the box culls the rest); this test scene has a few more
  // buildings (159,191 there), so 165,000 is the alarm here: with the lattice, the columns and the ribs cast from everywhere the pass is 222,000 and 241,000 with the Barlow shed's ribs.
  const BUDGET = 165_000;
  const outside = stand(new THREE.Vector3(concourse.x, 0, concourse.z + 300), 120);
  assert.deepEqual([cast('concourse-lattice'), cast('concourse-column'), cast('shed-ribs'), cast('city-trees')], [false, false, false, true], 'in the open: no lattice, no ribs, the trees');
  assert.equal(shadow.update(camera, target, noon), false, 'and standing still redraws nothing');
  const inConcourse = stand(concourse, 2);
  assert.deepEqual([cast('concourse-lattice'), cast('concourse-column'), cast('shed-ribs'), cast('city-trees')], [true, true, false, false], 'in the concourse: its lattice and columns, not the shed\'s ribs, no trees');
  const inShed = stand(shed, 2.5);
  assert.deepEqual([cast('concourse-lattice'), cast('concourse-column'), cast('shed-ribs'), cast('city-trees')], [false, false, true, false], 'in the shed: its ribs');
  // the camera goes from inside the shed to outside it, the same distance from the same focus: only the casters it holds have changed, and the map has to be drawn again
  const focus = shed.clone().add(new THREE.Vector3(50, 0, 0));
  camera.position.copy(shed).setY(2.5);
  target.copy(focus);
  shadow.update(camera, target, noon);
  assert.equal(cast('shed-ribs'), true);
  camera.position.copy(focus).add(new THREE.Vector3(50, 0, 0)).setY(2.5);
  assert.equal(shadow.update(camera, target, noon), true, 'a camera walking out of a room redraws the map: the casters it holds changed');
  assert.equal(cast('shed-ribs'), false);
  const corner = new THREE.Box3().setFromObject(meshes.find((m) => m.name === 'concourse-lattice') as THREE.Mesh).min.clone().sub(new THREE.Vector3(ROOM_REACH + 3, 0, ROOM_REACH + 3));
  const atCorner = stand(corner, 8);
  assert.deepEqual([cast('concourse-lattice'), cast('city-trees')], [false, true], `${ROOM_REACH + 3} m off the concourse's corner is the open air`);
  for (const [where, n] of [['outside', outside], ['in the concourse', inConcourse], ['in the shed', inShed], ['off the corner', atCorner]] as const) assert.ok(n <= BUDGET, `${where}: ${n} triangles in the shadow pass, over ${BUDGET}`);
  assert.ok(!SHADOW_CASTERS.has('landmarks-rib'), 'the Barlow shed\'s ribs shade a floor under glass nobody frames, at 18,666 triangles a frame');
  shadow.dispose();
});

test('createSunShadow.tag: a room\'s box is taken in world coordinates, before the first render has updated a matrix (the page tags ahead of it)', () => {
  const room = new THREE.Scene();
  const group = new THREE.Group();
  group.position.set(500, 0, -300);
  const ribs = new THREE.Mesh(new THREE.BoxGeometry(10, 10, 100), new THREE.MeshLambertMaterial());
  ribs.name = 'shed-ribs';
  group.add(ribs);
  room.add(group);
  const shadow = createSunShadow(room, new THREE.DirectionalLight());
  shadow.tag();
  const camera = new THREE.PerspectiveCamera();
  const focus = new THREE.Vector3(500, 0, -310);
  camera.position.set(500, 2, -300);
  shadow.update(camera, focus, noon);
  assert.equal(ribs.castShadow, true, 'a camera inside the ribs\' box casts them, 500 m from the origin');
  camera.position.set(0, 2, 0);
  shadow.update(camera, focus, noon);
  assert.equal(ribs.castShadow, false, 'and one at the origin does not');
  shadow.dispose();
});

// ---- the shade under a roof ---------------------------------------------------------------------------------------------------------------------

// the real station's roofs, with the page's own atmosphere over it (which draws the cover map from them)
const roofScene = new THREE.Scene();
roofScene.add(buildShed(layout));
roofScene.add(buildConcourse(concourseCanopy(data), footprint, layout, data.buildings.filter((b) => b.id === 46821177).map((b) => b.pts)));
roofScene.add(buildFurniture(data, layout));
const atmosphere = createAtmosphere({ scene: roofScene, world: addWorld(roofScene, { grid: false }), sites: null });
const map = atmosphere.cover() as CoverMap;

const uniformValues = (uniforms: Record<string, THREE.IUniform>): Record<string, Value> => Object.fromEntries(Object.entries(uniforms).map(([k, u]) => [k, toValue(u.value)]));
/** `texture2D` on a DataTexture, as the GPU answers it from the bytes the page uploaded (cover-shaders.test.ts holds this against the CPU map). */
function texture2D(sampler: Value, uv: Value): Value {
  const texture = (sampler as Sampler).data as THREE.DataTexture;
  const { width, height, data: bytes } = texture.image as { width: number; height: number; data: Uint8Array };
  const [u, v] = uv as [number, number];
  const texel = (i: number, j: number): number => (bytes[Math.min(height - 1, Math.max(0, j)) * width + Math.min(width - 1, Math.max(0, i))] as number) / 255;
  if (texture.magFilter === THREE.LinearFilter) {
    const sx = u * width - 0.5, sy = v * height - 0.5, i = Math.floor(sx), j = Math.floor(sy), fx = sx - i, fy = sy - j;
    const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
    return [lerp(lerp(texel(i, j), texel(i + 1, j), fx), lerp(texel(i, j + 1), texel(i + 1, j + 1), fx), fy), 0, 0, 1];
  }
  return [texel(Math.floor(u * width), Math.floor(v * height)), 0, 0, 1];
}

test('roofShade in GLSL, run on the real roofs: a point wholly under a roof keeps (1 - loss) of its hemisphere light per colour and of its direct light; in the open, all of it', () => {
  const glsl = new Glsl(`${COVER_GLSL}\n${ROOF_SHADE_GLSL}`);
  const env: Env = { vars: uniformValues(coverUniforms), fns: { texture2D } };
  const loss = [...ROOF_SHADE.ambient, ROOF_SHADE.direct];
  const shade = (x: number, y: number, z: number): number[] => glsl.call('roofShade', [[x, y, z], loss], env) as number[];
  const under = shade(...at(layout.aisle + R, 100, 1.5)); // the platform tarmac under the shed's vault
  for (let k = 0; k < 4; k++) assert.ok(Math.abs((under[k] as number) - (1 - (loss[k] as number))) < 1e-9, `channel ${k} under the shed: ${under[k]}`);
  assert.ok((under[0] as number) > (under[1] as number) && (under[1] as number) > (under[2] as number), 'the blue goes first: what is left is warm');
  const open = shade(...at(layout.aisle + R, -400, 1.5)); // well south of the shed, in the open
  assert.deepEqual(open, [1, 1, 1, 1]);
  const over = shade(...at(layout.aisle + R, 100, 60)); // above the shed's crown
  assert.deepEqual(over, [1, 1, 1, 1], 'over a roof is the open sky');
  // everywhere else the GPU's answer is the CPU map's: 1 - loss x the ground's cover
  let seen = 0;
  const rand = ((seed) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; })(11);
  for (let n = 0; n < 600; n++) {
    const x = map.x0 + rand() * map.nx * map.cell, z = map.z0 + rand() * map.nz * map.cell, y = -1 + rand() * 12;
    const cover = groundCoverAt(map, x, y, z);
    const got = shade(x, y, z);
    for (let k = 0; k < 4; k++) assert.ok(Math.abs((got[k] as number) - (1 - (loss[k] as number) * cover)) < 1e-9, `at ${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} channel ${k}`);
    if (cover > 0.99) seen++;
  }
  assert.ok(seen > 20, `${seen} of the sample points were wholly under a roof`);
  // no loss, no shade: Edinburgh's switch
  assert.deepEqual(glsl.call('roofShade', [[...at(layout.aisle + R, 100, 1.5)], [0, 0, 0, 0]], env), [1, 1, 1, 1]);
});

test('ROOF_SHADE: the hemisphere light loses most of its blue and little of its red, the direct light a little; the amounts are what the shed\'s platforms show (R-lighting-materials-b)', () => {
  const [r, g, b] = ROOF_SHADE.ambient;
  assert.ok(r < g && g < b && b < 0.7, `loses ${r}, ${g}, ${b}`);
  assert.ok(ROOF_SHADE.direct > 0 && ROOF_SHADE.direct <= r, `the direct light loses ${ROOF_SHADE.direct}`);
  // an up-facing surface under the daylight rig keeps a neutral to warm shade (never the blue of the sky): red at least blue, about 0.4 to 0.5 of the sky's light
  const sky = new THREE.Color(DAYLIGHT.hemisphere.sky);
  const kept = [sky.r * (1 - r), sky.g * (1 - g), sky.b * (1 - b)];
  assert.ok((kept[0] as number) >= (kept[2] as number) * 1.05, `the shade's red ${(kept[0] as number).toFixed(3)} beats its blue ${(kept[2] as number).toFixed(3)}: warm, not the sky's blue`);
  const share = (0.2126 * (kept[0] as number) + 0.7152 * (kept[1] as number) + 0.0722 * (kept[2] as number)) / (0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b);
  assert.ok(share > 0.4 && share < 0.7, `the shade keeps ${share.toFixed(2)} of the sky's light`);
});

test('addRoofShade: after the lights are summed and before the output; any patch the material already had runs first and stays in its program key', () => {
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  let priorRan = 0;
  m.onBeforeCompile = (shader) => { priorRan++; shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', '// prior patch\n#include <opaque_fragment>'); };
  m.customProgramCacheKey = () => 'prior';
  const version = m.version;
  addRoofShade(m);
  assert.equal(m.version, version + 1, 'recompiled once');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  assert.equal(priorRan, 1);
  assert.ok(f.includes('// prior patch'), 'the prior patch is in');
  assert.equal(m.customProgramCacheKey(), 'prior+roofShade', 'its key is kept in the program\'s, so a surface that is also wet-patched is its own program');
  assert.notEqual(new THREE.MeshLambertMaterial().customProgramCacheKey(), m.customProgramCacheKey());
  assert.equal(f.split('float coverGroundAt(').length - 1, 1, 'the cover read is in once');
  const fill = `if ( roofK.b < 1.0 ) reflectedLight.indirectDiffuse += uInteriorFill * ( ( 1.0 - roofK.b ) * coverRoomAt( cameraPosition - vViewPosition * mat3( viewMatrix ) + 0.6 * inverseTransformDirection( normal, viewMatrix ) ) * ( 1.0 - ${INTERIOR.down.toFixed(2)} * looksDown ) * ( 1.0 - ${INTERIOR.pale.toFixed(2)} * material.diffuseColor.g * material.diffuseColor.g ) ) * material.diffuseColor * RECIPROCAL_PI;`;
  const order = ['float coverGroundAt(', 'float coverRoomAt(', '#include <lights_lambert_pars_fragment>', 'uniform vec3 uInteriorFill;', 'vec4 roofShade(', '#include <lights_fragment_end>',
    'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );', 'float looksDown = max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 );', 'reflectedLight.indirectDiffuse *= roofK.rgb;', 'reflectedLight.directDiffuse *= roofK.a;', fill, '#include <opaque_fragment>'].map((needle) => f.indexOf(needle));
  assert.ok(order.every((i) => i >= 0), `every piece is there: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'declared above where it is used; applied after the lights, before the output');
  assert.ok(f.includes('uniform vec4 uRoofShade;') && f.indexOf('uniform vec4 uRoofShade;') < f.indexOf('vec4 roofShade('), 'the uniform is declared first');
  assert.equal(f.split('*= roofK').length - 1, 2, 'the hemisphere term and the direct term are scaled once each: the fill, added after, is the shade\'s to leave alone');
  for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRooms', 'uCoverRect', 'uCoverScale'] as const) assert.ok(shader.uniforms[name] === coverUniforms[name], `${name} is the shared one`);
  assert.ok(shader.uniforms.uRoofShade === roofShadeUniforms.uRoofShade, 'one shade for every surface, which grade() switches');
  assert.ok(shader.uniforms.uInteriorFill === roofShadeUniforms.uInteriorFill, 'and one fill, which grade() sets');
  assert.equal(f.split('coverRoomAt(').length - 1, 2, 'the room read is declared once and used once: the fill is the hemisphere term\'s, added after the shade has scaled it, so the shade does not take it away');
  // twice does nothing wrong to a plain material either
  const plain = new THREE.MeshLambertMaterial();
  addRoofShade(plain);
  assert.equal(plain.customProgramCacheKey().endsWith('+roofShade'), true);
  // a material whose own patch has put the cover read in (the weather's wet ground does) is not given a second one: a program with two cannot compile
  const wet = new THREE.MeshLambertMaterial();
  wet.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <common>', `#include <common>\n${COVER_GLSL}`); };
  addRoofShade(wet);
  const wetShader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  wet.onBeforeCompile(wetShader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.equal(wetShader.fragmentShader.split('float coverGroundAt(').length - 1, 1, 'the cover read an earlier patch added is not added again');
  assert.ok(wetShader.fragmentShader.includes('vec4 roofK = roofShade('), 'and the shade is there');
});

test('addRoofShade: the concourse\'s fill is weighted by how far down the face looks and by how pale the surface is, so white steel keeps its modelling and the Range\'s brick and the floor keep their fill (round five, the funnel legs)', () => {
  // The finding (the concourse worker's, on main 8f4e358a): the fill added alike in every direction to every Lambert surface under the roof put about +0.44 (linear) on white steel, which the
  // tone map's shoulder (from 0.45 up at the noon rig's exposure of 1.25) squeezed into 225 to 235 whatever way a face turned, tinted warm: the funnel legs' luminance spread (p90 less p10 at
  // concourse-funnel-up) fell from 39 to 4, and under cloud the roof and the legs dissolved into the sky.
  assert.ok(INTERIOR.down > 0 && INTERIOR.down < 1, `a face looking straight down keeps some of the fill, not none and not all: ${INTERIOR.down}`);
  assert.ok(INTERIOR.pale > 0 && INTERIOR.pale < 1, `the palest surface keeps some of it: ${INTERIOR.pale}`);
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  assert.equal(f.split('float looksDown').length - 1, 1, 'how far down the face seen looks is worked out once, for the fill and for the glow below');
  // the two weights as the shader has them, run: the green of the surface's own colour in place of the shader's `material.diffuseColor.g`
  const line = f.split('\n').find((l) => l.includes('uInteriorFill *')) ?? '';
  const part = (re: RegExp): string => re.exec(line)?.[0] ?? '';
  const direction = part(/\( 1\.0 - [0-9.]+ \* looksDown \)/);
  const colour = part(/\( 1\.0 - [0-9.]+ \* material\.diffuseColor\.g \* material\.diffuseColor\.g \)/).replaceAll('material.diffuseColor.g', 'g');
  assert.ok(direction !== '' && colour !== '', `both weights are in the fill: ${line}`);
  const glsl = new Glsl('');
  const weight = (looksDown: number, g: number): number => (glsl.evaluate(direction, { vars: {} }, { looksDown }) as number) * (glsl.evaluate(colour, { vars: {} }, { g }) as number);
  const close = (a: number, b: number, what: string): void => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} against ${b}`);
  close(weight(0, 0), 1, 'a dark face turned up or sideways keeps all of it');
  close(weight(1, 0), 1 - INTERIOR.down, 'a dark face looking straight down keeps 1 less `down` of it: an underside is lit by what the floor throws back, not by the room');
  close(weight(0, 1), 1 - INTERIOR.pale, 'a white face turned up or sideways keeps 1 less `pale` of it');
  close(weight(1, 1), (1 - INTERIOR.down) * (1 - INTERIOR.pale), 'a white underside, both');
  assert.ok(weight(0.6, 0.9) < weight(0.2, 0.9) && weight(0.2, 0.9) < weight(0, 0.9), 'the further down a face looks, the less it keeps');
  assert.ok(weight(0, 0.9) < weight(0, 0.6) && weight(0, 0.6) < weight(0, 0.25), 'the paler the surface, the less it keeps');
  // the scene's own colours: the steel of the diagrid and the funnel keeps half of it or less, the Range's brick (the stock brick: its texture's average colour in Node) and the floor nearly all
  const named = meshes.flatMap(materialsOf);
  const green = (name: string): number => {
    const found = named.find((x) => x.name === name) as THREE.MeshLambertMaterial | undefined;
    assert.ok(found, `${name} is in the scene`);
    return found.color.g;
  };
  // the funnel's legs were a material of their own, 'concourse-funnel', until the concourse's round 7 gave them the members' (shaded round in their vertex colours): the members are always
  // held to it, the funnel's material while the scene has one
  const steels = ['concourse-member', 'concourse-funnel'].filter((name, i) => i === 0 || named.some((x) => x.name === name));
  for (const steel of steels) assert.ok(weight(0, green(steel)) < 0.55, `${steel}: ${weight(0, green(steel))}`);
  assert.ok(weight(0, (material('brick') as THREE.MeshLambertMaterial).color.g) > 0.95, 'the Range\'s brick keeps its fill: it is held at (110, 94, 71) by it');
  assert.ok(weight(0, (material('concourseFloor') as THREE.MeshLambertMaterial).color.g) > 0.9, 'and the floor, a mid grey');
});

test('addRoofShade: a material with the GLOW_BELOW define has its glow multiplied by how far down the face seen looks, before the emissive is summed; one without compiles the line away (round five, D5)', () => {
  assert.equal(GLOW_BELOW, 'GLOW_BELOW');
  // round five (the historic D5 scorer): from inside the Barlow shed the glazed crown was the darkest band of the vault, where hist-d and hist-d2 show it the brightest. The glow gain of 30
  // draws the crown at L 77 over the boarding's 61 to 63 at the noon rig (17 drew 74 over 71, and past 40 the tone map's shoulder gives nothing more)
  assert.ok(GLOW_BELOW_GAIN >= 20 && GLOW_BELOW_GAIN <= 40, `the gain is the one the crown was fitted to: ${GLOW_BELOW_GAIN}`);
  const m = new THREE.MeshLambertMaterial({ color: 0x808080, emissive: 0x3b3531 });
  addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  // `looksDown` is declared once in the shade's block, for this hook and the concourse's fill to share: how far down the face seen looks
  const hook = `totalEmissiveRadiance *= 1.0 + ${GLOW_BELOW_GAIN.toFixed(1)} * looksDown;`;
  // (the `#endif` is the one that closes this hook: the contact shade's block, above it, has its own)
  const order = ['#include <lights_fragment_end>', 'float looksDown = max( -dot( normal, viewMatrix[ 1 ].xyz ), 0.0 );', 'reflectedLight.directDiffuse *= roofK.a;', `#ifdef ${GLOW_BELOW}`, hook].map((needle) => f.indexOf(needle));
  order.push(f.indexOf('#endif', f.indexOf(hook)), f.indexOf('vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;'));
  assert.ok(order.every((i) => i >= 0), `every piece is there: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the shade\'s block, after the lights are summed and before the emissive joins the output, and only under the define');
  assert.equal(f.split(hook).length - 1, 1, 'once');
  // the face "seen" is the one that looks at the camera: `normal` is the view-space normal, flipped for a back face, and viewMatrix[ 1 ] (a column) is the world's up in view space, so
  // -dot( normal, viewMatrix[ 1 ].xyz ) is how far down that face looks, whichever way the quad winds and wherever the camera turns
  const camera = new THREE.PerspectiveCamera(50, 1.6, 0.1, 500);
  const down = new THREE.Vector3(0, -1, 0);
  const poses: ReadonlyArray<readonly [V3, V3]> = [[[10, 1, 5], [0, 12, 0]], [[-30, 2, 40], [5, 18, -8]], [[0, 0.5, 60], [0, 25, 0]]];
  for (const [from, to] of poses) {
    camera.position.set(...from);
    camera.lookAt(...to);
    camera.updateMatrixWorld();
    const view = camera.matrixWorldInverse;
    const up = new THREE.Vector3().setFromMatrixColumn(view, 1); // GLSL's viewMatrix[ 1 ].xyz: the matrix is column-major in both
    const seen = (worldNormal: THREE.Vector3): number => Math.max(-new THREE.Vector3().copy(worldNormal).transformDirection(view).dot(up), 0);
    assert.ok(Math.abs(seen(down) - 1) < 1e-9, 'a face straight down, seen from below: all of the gain');
    assert.equal(seen(new THREE.Vector3(0, 1, 0)), 0, 'a face turned up (the roof from the air, the back of a quad seen from below once the normal is flipped): none');
    assert.ok(Math.abs(seen(new THREE.Vector3(1, 0, 0).normalize())) < 1e-9 && Math.abs(seen(new THREE.Vector3(0, 0, 1))) < 1e-9, 'a vertical face: none');
    assert.ok(Math.abs(seen(new THREE.Vector3(0, -1, 1).normalize()) - Math.SQRT1_2) < 1e-9, 'a face tilted 45 degrees down: 0.71 of it');
  }
});

test('addRoofShade: a material with the FOOT_SHADE define has the light it reflects scaled by a contact shade of its height up the wall, after the roof\'s shade and before the concourse\'s fill; one without compiles it away (round five, E2)', () => {
  assert.equal(FOOT_SHADE, 'FOOT_SHADE');
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  const open = f.indexOf(`#ifdef ${FOOT_SHADE}`);
  const close = f.indexOf('#endif', open);
  assert.ok(open > 0 && close > open, 'the block is there, under its define');
  const block = f.slice(open, close);
  const fill = f.indexOf('if ( roofK.b < 1.0 )');
  assert.ok(f.indexOf('reflectedLight.directDiffuse *= roofK.a;') < open && close < fill && fill < f.indexOf('#include <opaque_fragment>'), 'after the roof\'s shade, before the fill (the fill is the concourse\'s, indoors: no wall there has a foot) and the output');
  assert.equal(block.split('reflectedLight.directDiffuse *= foot;').length - 1, 1, 'the sun\'s light is scaled');
  assert.equal(block.split('reflectedLight.indirectDiffuse *= foot;').length - 1, 1, 'and the sky\'s');
  assert.equal(f.split('vMapUv.y').length - 1, 1, 'the height is the wall texture\'s own v, read once, in the block');
  // the number as the shader has it, run: h is the height up the wall in tiles of its texture (the brick's and the stone's are 0.6 m high, and a wall's v is metres up from its foot)
  const hExpression = /float h = (.*);/.exec(block)?.[1] ?? '';
  const footExpression = /float foot = (.*);/.exec(block)?.[1] ?? '';
  assert.ok(hExpression !== '' && footExpression !== '', `both lines are in the block: ${block}`);
  const glsl = new Glsl('');
  const footAt = (v: number, depth = 0.08): number => glsl.evaluate(footExpression, { vars: {} }, { h: glsl.evaluate(hExpression, { vars: {} }, { vMapUv: [0, v] }), [FOOT_SHADE]: depth }) as number;
  const tile = 0.6;
  assert.ok(footAt(0) > 0.4 && footAt(0) < 0.7, `a dark line where the wall meets the ground: ${footAt(0)}`);
  assert.equal(footAt(-1), footAt(0), 'a part whose v starts below the foot (a reveal\'s front edge, a plinth sunk in the ground) is no darker than the foot: the sum does not go through zero');
  let last = 0;
  for (let v = 0; v <= 40; v += 0.25) {
    const k = footAt(v);
    assert.ok(k > last && k < 1, `rising to one and never reaching it: ${k} at ${v} tiles`);
    last = k;
  }
  assert.ok(footAt(0.3 / tile) < 0.85 && footAt(0.6 / tile) > 0.85 && footAt(0.6 / tile) < 0.95, `most of it is in the first half metre: ${footAt(0.3 / tile)}, ${footAt(0.6 / tile)}`);
  assert.ok(footAt(2.4 / tile) > 0.95 && footAt(12 / tile) > 0.99, 'and what is left is long and slight');
  // a ground floor's mean (5 m, 8 tiles): the hotel's stone is held to a colour measured in a photograph (E3), and a long, deep fall-off (1 - 0.25 exp( -0.16 h ) - 0.2 exp( -1.25 h ), a mean of
  // 0.855 over 8 tiles) took 4 L off it where this takes 1.2
  let mean = 0;
  for (let i = 0; i < 80; i++) mean += footAt((i + 0.5) / 10) / 80;
  assert.ok(mean > 0.93, `the ground floor keeps its colour: ${mean}`);
  // the define's value is the long term's depth (round six, E2: "the south-front foot shade is barely visible"): the King's Cross front's 0.32 takes 0.82 of the light at 1.2 m and 0.93 at 3 m, the landmarks'
  // 0.08 keeps 0.95 and 0.98; the thin line at the foot is the same, and every depth still rises to one and never reaches it
  assert.ok(footExpression.includes(FOOT_SHADE), 'the long term\'s depth is the define');
  assert.equal(footAt(0, 0.32), 1 - 0.32 - 0.4, 'the foot itself: the depth and the thin line');
  assert.ok(Math.abs(footAt(1.2 / tile, 0.32) - 0.82) < 0.01 && Math.abs(footAt(3 / tile, 0.32) - 0.93) < 0.01, `the front's long fall-off: ${footAt(1.2 / tile, 0.32)}, ${footAt(3 / tile, 0.32)}`);
  assert.ok(footAt(1.2 / tile, 0.32) < footAt(1.2 / tile) - 0.1 && footAt(0, 0.32) < footAt(0), 'deeper than the landmarks\' at the same height');
  for (let v = 0; v <= 40; v += 0.25) assert.ok(footAt(v, 0.32) < 1 && footAt(v, 0.32) < footAt(v + 0.25, 0.32), `the front's too rises to one: ${v}`);
  // one without the define: it is a preprocessor line, compiled away, and no other line reads `foot`
  assert.ok(!block.includes('looksDown') && f.split('foot').length - 1 === block.split('foot').length - 1, 'nothing outside the define reads the shade');
});

test('addRoofShade: a material with the MOTTLE define has its colour scaled by the tone of the slab it lies on, 0.8 to 1.2, one number to a slab, faded to none as a slab shrinks to a couple of pixels; one without compiles it away (round six, E5)', () => {
  assert.equal(MOTTLE, 'MOTTLE');
  const m = new THREE.MeshLambertMaterial({ color: 0x808080 });
  addRoofShade(m);
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: THREE.ShaderLib.lambert.vertexShader, fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  m.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  const open = f.indexOf(`#ifdef ${MOTTLE}`);
  const close = f.indexOf('#endif', open);
  assert.ok(open > 0 && close > open, 'the block is there, under its define');
  const block = f.slice(open, close);
  assert.ok(f.indexOf('#include <color_fragment>') < open && close < f.indexOf('#include <lights_lambert_fragment>'), 'right after the texture and the vertex colour, before the light is summed');
  assert.equal(block.split('diffuseColor.rgb *= ').length - 1, 1, 'the colour is scaled, once');
  assert.ok(!block.includes('reflectedLight'), 'and not the light: the weather\'s snow mixes toward white after this, and a slab of lying snow has no tone of its own');
  assert.equal(f.split('slab').length - 1, block.split('slab').length - 1, 'nothing outside the define reads the slab');
  // the number as the shader has it, run. The paving's texture repeats every 2.4 m (two slabs of 1.2 m to a side), and the flat polygons' UVs are metres over that repeat
  const slabExpression = /vec2 slab = (.*);/.exec(block)?.[1] ?? '';
  const mottleExpression = /diffuseColor\.rgb \*= (.*);/.exec(block)?.[1] ?? '';
  assert.ok(slabExpression !== '' && mottleExpression !== '', `both lines are in the block: ${block}`);
  const glsl = new Glsl('');
  // the number at (x, z) metres on the paving, `pixel` slabs wide to a pixel (what fwidth( slab ) would answer on the screen). The fragment is always at one point of the screen:
  // a slab is the paving's own, and a tone that came from where on the screen it is drawn would be the same for every slab here
  const toneAt = (x: number, z: number, pixel = 0): number => {
    const slab = glsl.evaluate(slabExpression, { vars: {} }, { vMapUv: [x / 2.4, z / 2.4], gl_FragCoord: [640.5, 360.5, 0.5, 1] });
    return glsl.evaluate(mottleExpression, { vars: {}, fns: { fwidth: () => [pixel, pixel] } }, { slab }) as number;
  };
  const tones: number[] = [];
  for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) tones.push(toneAt(1.2 * i + 0.6, 1.2 * j + 0.6));
  const mean = tones.reduce((s, x) => s + x, 0) / tones.length;
  const spread = Math.sqrt(tones.reduce((s, x) => s + (x - mean) ** 2, 0) / tones.length);
  assert.ok(Math.min(...tones) >= 0.8 && Math.max(...tones) <= 1.2, `from 0.8 to 1.2 of the colour: ${Math.min(...tones)} to ${Math.max(...tones)}`);
  assert.ok(Math.abs(mean - 1) < 0.02, `a paving as bright as it was, on the whole: ${mean}`);
  assert.ok(spread > 0.1 && spread < 0.13, `a slab's tone is its own, a hash spread evenly over the 0.4 (0.115 for an even one): ${spread}`);
  // one number to a slab: every point of a slab, its corners and its middle, has the same
  for (const [i, j] of [[0, 0], [3, 5], [17, 9], [-4, 12]] as const) {
    const own = toneAt(1.2 * i + 0.6, 1.2 * j + 0.6);
    for (const [dx, dz] of [[0.01, 0.01], [1.19, 0.01], [0.01, 1.19], [1.19, 1.19], [0.3, 0.9]] as const) assert.equal(toneAt(1.2 * i + dx, 1.2 * j + dz), own, `slab (${i}, ${j}) at (${dx}, ${dz})`);
  }
  // and the next slab is its own: of 1,500 neighbours across, nearly all differ by more than a hundredth
  let apart = 0;
  for (let i = 0; i < 39; i++) for (let j = 0; j < 39; j++) apart += Number(Math.abs(toneAt(1.2 * i + 0.6, 1.2 * j + 0.6) - toneAt(1.2 * (i + 1) + 0.6, 1.2 * j + 0.6)) > 0.01);
  assert.ok(apart > 0.9 * 39 * 39, `neighbouring slabs differ: ${apart} of ${39 * 39}`);
  // the fade: a slab eight pixels across (an eighth of a slab to a pixel) has all of its number, two pixels across (half) none, and in between a share of it
  for (const [i, j] of [[0, 0], [3, 5], [17, 9]] as const) {
    const [x, z] = [1.2 * i + 0.6, 1.2 * j + 0.6];
    const full = toneAt(x, z);
    assert.ok(Math.abs(full - 1) > 0.02, `(a slab that is not within a fiftieth of one, to see the fade by: ${full})`);
    assert.equal(toneAt(x, z, 0.1 / Math.SQRT2), full, 'ten pixels across: all of it');
    assert.ok(Math.abs(toneAt(x, z, 0.125 / Math.SQRT2) - full) < 1e-9, 'eight across: all of it');
    assert.ok(Math.abs(toneAt(x, z, 0.5 / Math.SQRT2) - 1) < 1e-9, 'two across: none');
    assert.ok(Math.abs(toneAt(x, z, 1) - 1) < 1e-9, 'a pixel to a slab: none (it is noise there, and shimmers)');
    let last = full;
    for (let p = 0.14; p < 0.5; p += 0.02) {
      const k = toneAt(x, z, p / Math.SQRT2);
      assert.ok(Math.abs(k - 1) <= Math.abs(last - 1) + 1e-12, `it fades toward 1 and never away: ${k} at ${p}`);
      last = k;
    }
    assert.ok(Math.abs(toneAt(x, z, 0.3 / Math.SQRT2) - 1) < Math.abs(full - 1) * 0.6 && Math.abs(toneAt(x, z, 0.3 / Math.SQRT2) - 1) > 0, 'part way, part of it');
  }
});

test('the city\'s paving, wet-patched by the atmosphere and roof-shaded, has the slab\'s tone in before the snow is mixed in and the wet darkens it (round six, E5)', () => {
  const s = new THREE.Scene();
  const w = addWorld(s, { grid: false });
  const plaza = cityMaterial('plaza') as THREE.MeshLambertMaterial;
  s.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), plaza));
  createAtmosphere({ scene: s, world: w, sites: null });
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '', fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  plaza.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  const f = shader.fragmentShader;
  const [tone, wet, snow] = [f.indexOf('diffuseColor.rgb *= mix( 0.8'), f.indexOf('diffuseColor.rgb *= 1.0 - uDark * wetHere'), f.indexOf('diffuseColor.rgb = mix( diffuseColor.rgb, uSnowColour')];
  assert.ok(tone > 0 && wet > 0 && snow > 0, `all three are in the plaza's program: ${tone}, ${wet}, ${snow}`);
  assert.ok(tone < wet && tone < snow, `the tone comes first: snow lies over it, 0.85 of the colour, and the wet darkens what is there: ${tone} < ${wet}, ${snow}`);
  assert.ok(f.includes(`#ifdef ${MOTTLE}`) && (plaza.defines ?? {})[MOTTLE] === '', 'and it is the plaza\'s own define');
});

test('the walls that stand on the ground have the contact shade, and the Range\'s, held to its measured brick, and the rest of the stock\'s do not (round five, E2)', () => {
  const find = (name: string): THREE.Material => {
    const mesh = meshes.find((x) => x.name === name);
    assert.ok(mesh, `${name} is a mesh of the scene`);
    return materialsOf(mesh)[0] as THREE.Material;
  };
  for (const name of ['shed-front', 'shed-brick', 'shed-stone', 'tower-brick', 'tower-stone']) {
    assert.deepEqual(find(name).defines, { [FOOT_SHADE]: '0.32' }, `${name}: a wall of the front, on the ground, with the deeper shade (round six, E2)`);
  }
  for (const name of ['landmarks-brick', 'landmarks-brickRed', 'landmarks-brickDeep', 'landmarks-stone']) {
    assert.deepEqual(find(name).defines, { [FOOT_SHADE]: '0.08' }, `${name}: a wall on the ground, with the slight one the hotel's measured stone was fitted to`);
  }
  // not the Range: its brick is held at (110, 94, 71) by the concourse's fill and the sun, and not the stock the whole city shares (the city's facades have their own, in their shader)
  for (const name of ['range-brick', 'range-stone', 'landmarks-slate', 'shed-aisle-roofs', 'kxcentral-brick', 'city-stock', 'city-red']) {
    assert.equal(find(name).defines?.[FOOT_SHADE], undefined, `${name}: no contact shade of this kind`);
  }
  assert.equal((material('brick') as THREE.MeshLambertMaterial).defines?.[FOOT_SHADE], undefined, 'the shared brick is the plain one, for the Range and the rest');
  assert.equal((material('stone') as THREE.MeshLambertMaterial).defines?.[FOOT_SHADE], undefined, 'and the shared stone');
});

test('the real scene holds the concourse\'s soffit as an unlit material named concourse-soffit, the one atmosphere.ts scales against the exposure (round five, E6)', () => {
  const found = meshes.flatMap(materialsOf).filter((m) => m.name === 'concourse-soffit');
  assert.ok(found.length >= 1, 'a material of that name is in the scene');
  assert.ok(found.every((m) => (m as THREE.MeshBasicMaterial).isMeshBasicMaterial), 'unlit: the exposure multiplies its colour outright, so a cloudy sky\'s exposure of 2.4 took it to white (mean 239, p99 254) until it was divided back');
});

test('the atmosphere gives every Lambert surface in the scene the roof shade, once, however often it scans', () => {
  const s = new THREE.Scene();
  const w = addWorld(s, { grid: false });
  const steel = material('steel') as THREE.MeshLambertMaterial;
  s.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), steel));
  const a = createAtmosphere({ scene: s, world: w, sites: null });
  const key = steel.customProgramCacheKey();
  assert.ok(key.endsWith('+roofShade'), `the shared steel is roof-shaded: ${key}`);
  a.rescan();
  a.rescan();
  assert.equal(steel.customProgramCacheKey(), key, 'a scan does not stack a second patch');
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: '', fragmentShader: THREE.ShaderLib.lambert.fragmentShader };
  steel.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as never);
  assert.equal(shader.fragmentShader.split('reflectedLight.directDiffuse *= roofK.a;').length - 1, 1, 'one scale of the direct light in the shader');
});
