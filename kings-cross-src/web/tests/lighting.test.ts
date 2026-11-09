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
import { addRoofShade, createAdditionsWatch, createSunShadow, createUngradedScan, grade, leaveOutOfGrade, lightAxes, ROOF_SHADE, ROOF_SHADE_GLSL, roofShadeUniforms, SHADOW_CASTERS, SHADOW_MAP_SIZE, SHADOW_STEPS, SHADOW_TAPS, shadowFit } from '../src/lighting.ts';
import { material } from '../src/materials.ts';
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

test('leaveOutOfGrade: lines, points and sprites are authored in display colours and skip the tone map; lit surfaces and the dome keep their own setting', () => {
  const line = new THREE.LineBasicMaterial(), points = new THREE.PointsMaterial(), sprite = new THREE.SpriteMaterial();
  const lambert = new THREE.MeshLambertMaterial(), basic = new THREE.MeshBasicMaterial();
  assert.deepEqual([line, points, sprite, lambert, basic].map((m) => leaveOutOfGrade(m)), [true, true, true, false, false], 'it says which it changed');
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
});

test('shadowFit: the focus is held to the map\'s texels in the light\'s plane, so moving the camera never makes the edges crawl', () => {
  const { x, y } = lightAxes(noon);
  assert.ok(Math.abs(dot(x, y)) < 1e-12 && Math.abs(dot(x, noon)) < 1e-12 && Math.abs(dot(y, noon)) < 1e-12, 'the light\'s frame is square');
  assert.ok(y[1] > 0.4, 'and its y is the more upright axis');
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
  assert.equal(shadow.tag(), true, 'casters found');
  assert.equal(sun.castShadow, true);
  assert.deepEqual([sun.shadow.mapSize.x, sun.shadow.mapSize.y], [2048, 2048]);
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
  assert.deepEqual([depth.image.width, depth.image.height], [SHADOW_MAP_SIZE, SHADOW_MAP_SIZE]);
  assert.equal(depth.format, THREE.DepthFormat);
  assert.equal(depth.type, THREE.UnsignedIntType);
  // what three sets for PCFShadowMap: a hardware comparison (sampler2DShadow) with a linear filter, which is what softens the edge
  assert.equal(depth.compareFunction, THREE.LessEqualCompare);
  assert.deepEqual([depth.minFilter, depth.magFilter], [THREE.LinearFilter, THREE.LinearFilter]);
  const bytes = SHADOW_MAP_SIZE * SHADOW_MAP_SIZE * (1 + 4);
  assert.ok(bytes < 22e6, `${(bytes / 1e6).toFixed(1)} MB: the colour attachment is a byte a texel and the depth four`);
  shadow.dispose();
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
  assert.equal(cam.far, fit.far);
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
  const order = ['float coverGroundAt(', '#include <lights_lambert_pars_fragment>', 'vec4 roofShade(', '#include <lights_fragment_end>', 'vec4 roofK = roofShade( cameraPosition - vViewPosition * mat3( viewMatrix ), uRoofShade );',
    'reflectedLight.indirectDiffuse *= roofK.rgb;', 'reflectedLight.directDiffuse *= roofK.a;', '#include <opaque_fragment>'].map((needle) => f.indexOf(needle));
  assert.ok(order.every((i) => i >= 0), `every piece is there: ${order}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'declared above where it is used; applied after the lights, before the output');
  assert.ok(f.indexOf('uniform vec4 uRoofShade;') < f.indexOf('vec4 roofShade('), 'the uniform is declared first');
  for (const name of ['uCoverMap', 'uCoverSoft', 'uCoverRect', 'uCoverScale'] as const) assert.ok(shader.uniforms[name] === coverUniforms[name], `${name} is the shared one`);
  assert.ok(shader.uniforms.uRoofShade === roofShadeUniforms.uRoofShade, 'one shade for every surface, which grade() switches');
  // twice does nothing wrong to a plain material either
  const plain = new THREE.MeshLambertMaterial();
  addRoofShade(plain);
  assert.equal(plain.customProgramCacheKey().endsWith('+roofShade'), true);
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
