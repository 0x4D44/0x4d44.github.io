// web/src/night.ts `createDialLights`: the clock dials of a scene, lit white after dark (round seven, the E4 scorer: "the King's Cross clock dials do not glow; they are the same grey face", where the photographs
// show both bright white). A glow is a second disc over each dial face that the sun and the sky light (a Lambert disc at a declared dial: the King's Cross tower's; the Midland's is unlit already and the
// Balmoral's is flooded). Held here: which discs get one, where it stands and what it is made of, how it follows the lamps' level, that the face's own material is never touched, and its wiring in atmosphere.ts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import type { KxData } from '../../core/osm.ts';
import { concourseCanopy, shedLayout, stationBuilding } from '../../core/station.ts';
import { createAtmosphere } from '../src/atmosphere.ts';
import { HANDS } from '../src/clocks.ts';
import type { ClockDial } from '../src/clocks.ts';
import { furniturePlan } from '../src/furniture.ts';
import { windowNight } from '../src/materials.ts';
import { createDialLights, DIAL_GLOW, DIAL_LIFT, nightLightSites } from '../src/night.ts';
import type { NightLightSites } from '../src/night.ts';
import { buildShed } from '../src/shed.ts';
import { trainNight } from '../src/train-geom.ts';
import { CLEAR_STATE } from '../src/weather.ts';
import { addWorld } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const layout = shedLayout(data);
const SITES: NightLightSites = nightLightSites({ lamps: furniturePlan(data, layout).lamps, layout, canopy: concourseCanopy(data), footprint: stationBuilding(data)!.pts });
const NOON = '2026-06-21T12:00:00Z';
const MIDNIGHT = '2026-12-21T00:00:00Z';

const map = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
const GLOW = 'clock-dial-glow';
const glowsOf = (root: THREE.Object3D): THREE.Mesh[] => root.getObjectsByProperty('name', GLOW) as THREE.Mesh[];
const glowMaterial = (glow: THREE.Mesh): THREE.MeshBasicMaterial => glow.material as THREE.MeshBasicMaterial;
const near = (a: THREE.Vector3, b: THREE.Vector3, what: string): void => assert.ok(a.distanceTo(b) < 1e-9, `${what}: ${a.toArray()} against ${b.toArray()}`);
const white = (scale = 1): THREE.Vector3 => new THREE.Vector3(...DIAL_GLOW).multiplyScalar(scale);

test.afterEach(() => { trainNight.value = 0; windowNight.value = 0; });

/**
 * A tower of its own, moved and turned in the world, as shed.ts builds the King's Cross one: two dials declared on the owner (one south, one east), a Lambert disc at each (the second a little larger), and
 * a stone ring a centimetre behind each, which stands at the dial's centre too.
 */
function tower() {
  const owner = new THREE.Group();
  owner.position.set(5, 0, -3);
  owner.rotation.y = 0.7;
  const dials: ClockDial[] = [
    { centre: [0, 10, 2], normal: [0, 0, 1], up: [0, 1, 0], radius: 1.7 },
    { centre: [2, 10, 0], normal: [1, 0, 0], up: [0, 1, 0], radius: 1.7 },
  ];
  owner.userData.clockDials = dials;
  const faces = new THREE.Group();
  const cream = new THREE.MeshLambertMaterial({ map });
  const stone = new THREE.MeshLambertMaterial({ color: 0x998877 });
  const disc = new THREE.CircleGeometry(1.7, 40);
  const ringGeometry = new THREE.RingGeometry(1.7, 2.15, 40);
  const discs = dials.map((d, i) => {
    const face = new THREE.Mesh(disc, cream);
    face.position.set(...d.centre);
    face.rotation.y = Math.atan2(d.normal[0], d.normal[2]);
    if (i === 1) face.scale.set(1.1, 1.1, 1);
    const ring = new THREE.Mesh(ringGeometry, stone);
    ring.position.copy(face.position).addScaledVector(new THREE.Vector3(...d.normal), -0.01);
    ring.rotation.copy(face.rotation);
    faces.add(ring, face);
    return face;
  });
  owner.add(faces);
  return { owner, faces, dials, discs, cream, stone };
}

test('scan: a glow over the Lambert disc at each declared dial, in its place, turn and size and DIAL_LIFT out of it, and over nothing else; a second scan adds none', () => {
  const { owner, faces, dials, discs } = tower();
  const stray = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshLambertMaterial({ map }));
  stray.position.set(0, 10, 12); // a Lambert disc a long way from any dial
  const unlit = new THREE.Mesh(new THREE.CircleGeometry(1.7, 40), new THREE.MeshBasicMaterial({ map }));
  unlit.position.set(...(dials[0] as ClockDial).centre); // the Midland's kind of dial: bright already, at a declared dial
  faces.add(stray, unlit);
  const scene = new THREE.Scene();
  scene.add(owner);
  const lights = createDialLights();
  assert.equal(lights.count(), 0);
  assert.equal(lights.scan(scene), 2, 'the two Lambert discs at the dials, not the ring, the stray disc or the unlit one');
  assert.equal(lights.count(), 2);
  assert.equal(glowsOf(scene).length, 2);
  assert.equal(lights.scan(scene), 0, 'a second look adds none');
  assert.equal(lights.count(), 2);
  assert.equal(glowsOf(scene).length, 2);
  const world = (o: THREE.Object3D): THREE.Vector3 => o.getWorldPosition(new THREE.Vector3());
  discs.forEach((face, i) => {
    const glow = glowsOf(scene).find((g) => g.geometry === face.geometry && g.position.distanceTo(face.position) < 0.1 && g.scale.distanceTo(face.scale) < 1e-12 && g.quaternion.angleTo(face.quaternion) < 1e-9);
    assert.ok(glow, `dial ${i} has a glow beside its face, in its own turn and size`);
    assert.ok((glow as THREE.Mesh).parent === faces, `and in its face's frame (dial ${i})`);
    const normal = new THREE.Vector3(...(dials[i] as ClockDial).normal).transformDirection(owner.matrixWorld);
    near(world(glow as THREE.Mesh), world(face).addScaledVector(normal, DIAL_LIFT), `the glow of dial ${i} stands DIAL_LIFT out of its face, in the world`);
  });
});

test('scan reads a dial where it stands in the world: a tower moved and turned after it was built is found, and discs that no building declares as dials are only discs', () => {
  const { owner } = tower();
  const scene = new THREE.Scene();
  scene.add(owner);
  owner.position.set(-40, 7, 120);
  owner.rotation.y = 2.3; // moved after it was built: scan must read the world matrices as they stand
  assert.equal(createDialLights().scan(scene), 2);
  const bare = tower();
  bare.owner.userData.clockDials = undefined;
  const other = new THREE.Scene();
  other.add(bare.owner);
  assert.equal(createDialLights().scan(other), 0);
  assert.equal(glowsOf(other).length, 0);
});

test('the glow: the face\'s own texture, added to the picture, left out of the grade and the fog, over the face and not writing depth; one material for the faces that share a texture, one of its own for another', () => {
  const first = tower();
  const second = tower();
  const otherMap = new THREE.DataTexture(new Uint8Array([200, 200, 200, 255]), 1, 1);
  second.cream.map = otherMap;
  const scene = new THREE.Scene();
  scene.add(first.owner, second.owner);
  assert.equal(createDialLights().scan(scene), 4);
  const mine = glowsOf(first.owner);
  const theirs = glowsOf(second.owner);
  assert.equal(mine.length, 2);
  assert.equal(theirs.length, 2);
  const material = glowMaterial(mine[0] as THREE.Mesh);
  assert.ok(material.isMeshBasicMaterial, 'a Basic material: lit by nothing');
  assert.ok(mine.every((g) => glowMaterial(g) === material), 'both faces share the texture, so the one material');
  assert.ok(material.map === first.cream.map, 'the face\'s own texture: the numerals stay dark');
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.transparent, true);
  assert.equal(material.depthWrite, false);
  assert.equal(material.fog, false, 'a glow added to a fogged picture would add the fog\'s colour');
  assert.equal(material.toneMapped, false, 'authored in display colours, as the halos are');
  assert.ok(theirs.every((g) => glowMaterial(g).map === otherMap), 'a face with a texture of its own');
  assert.ok(glowMaterial(theirs[0] as THREE.Mesh) !== material, 'has a material of its own');
  assert.ok(mine.every((g) => g.geometry === first.discs[0]!.geometry), 'the face\'s own geometry, shared, not copied');
});

test('the glow is under the hands and over the face: DIAL_LIFT is above zero and below the nearer of the hands\' lifts', () => {
  assert.ok(DIAL_LIFT > 0, 'a face and its glow at one depth would fight');
  assert.ok(DIAL_LIFT < Math.min(HANDS.hour.lift, HANDS.minute.lift), 'the hands stand over the glow, so they stay dark on it');
});

test('setLevel: the glow is hidden by day and a hair above it, and from 0.01 on is the dial\'s white times the level; the level is held to 0..1', () => {
  const { owner } = tower();
  const scene = new THREE.Scene();
  scene.add(owner);
  const lights = createDialLights();
  lights.scan(scene);
  const glows = glowsOf(scene);
  const material = glowMaterial(glows[0] as THREE.Mesh);
  const shown = (): boolean[] => glows.map((g) => g.visible);
  const colour = (): THREE.Vector3 => new THREE.Vector3(...material.color.toArray());
  assert.deepEqual(shown(), [false, false], 'hidden before any level: a scan at noon draws nothing');
  lights.setLevel(1);
  assert.deepEqual(shown(), [true, true]);
  near(colour(), white(), 'the white, at the full level');
  lights.setLevel(0.5);
  assert.deepEqual(shown(), [true, true]);
  near(colour(), white(0.5), 'half the white at half the level');
  lights.setLevel(0.005);
  assert.deepEqual(shown(), [false, false], 'not drawn at a hair above 0');
  lights.setLevel(0);
  assert.deepEqual(shown(), [false, false]);
  near(colour(), white(0), 'no colour at 0');
  lights.setLevel(7);
  assert.deepEqual(shown(), [true, true]);
  near(colour(), white(), 'held to 1');
  lights.setLevel(-3);
  assert.deepEqual(shown(), [false, false]);
  near(colour(), white(0), 'and to 0');
});

test('a dial found after dark comes on at once at the level the night has, and one found by day stays out', () => {
  const night = tower();
  const nightScene = new THREE.Scene();
  nightScene.add(night.owner);
  const lights = createDialLights();
  lights.setLevel(1);
  lights.scan(nightScene);
  assert.ok(glowsOf(nightScene).every((g) => g.visible), 'found at night: lit');
  near(new THREE.Vector3(...glowMaterial(glowsOf(nightScene)[0] as THREE.Mesh).color.toArray()), white(), 'in the white');
  const day = tower();
  const dayScene = new THREE.Scene();
  dayScene.add(day.owner);
  const sun = createDialLights();
  sun.setLevel(0);
  sun.scan(dayScene);
  assert.ok(glowsOf(dayScene).every((g) => !g.visible), 'found by day: out');
});

test('the face\'s own material is never touched: no emissive, no map, no new program, whatever the level (so the sun and the atmosphere\'s stand-ins see the face as they always did)', () => {
  const { owner, cream, stone } = tower();
  const scene = new THREE.Scene();
  scene.add(owner);
  const [creamVersion, stoneVersion] = [cream.version, stone.version];
  const lights = createDialLights();
  lights.scan(scene);
  for (const level of [0, 0.3, 1, 0]) {
    lights.setLevel(level);
    assert.equal(cream.emissive.getHex(), 0);
    assert.equal(cream.emissiveMap, null);
    assert.equal(cream.version, creamVersion);
    assert.equal(stone.emissive.getHex(), 0);
    assert.equal(stone.version, stoneVersion);
  }
});

test('dispose: the glows leave the scene, their materials are given back, and none is counted', () => {
  const { owner, faces } = tower();
  const scene = new THREE.Scene();
  scene.add(owner);
  const lights = createDialLights();
  lights.scan(scene);
  const materials = new Set(glowsOf(scene).map((g) => g.material as THREE.Material));
  let freed = 0;
  for (const m of materials) m.addEventListener('dispose', () => { freed++; });
  const before = faces.children.length;
  lights.dispose();
  assert.equal(glowsOf(scene).length, 0, 'out of the scene');
  assert.equal(faces.children.length, before - 2);
  assert.equal(freed, materials.size, 'every glow material is disposed');
  assert.equal(lights.count(), 0);
  assert.equal(lights.scan(scene), 2, 'and a scan after it starts afresh');
});

test('the King\'s Cross tower: each of its four dials gets a glow DIAL_LIFT out of the face along the dial\'s normal and as wide as the dial, and none on the stone rings', () => {
  const shed = buildShed(layout);
  const owners: THREE.Object3D[] = [];
  shed.traverse((o) => { if (o.userData.clockDials) owners.push(o); });
  assert.equal(owners.length, 1, 'the shed carries the tower\'s dials');
  const kx = owners[0] as THREE.Object3D;
  const dials = kx.userData.clockDials as ClockDial[];
  assert.equal(dials.length, 4);
  const scene = new THREE.Scene();
  scene.add(shed);
  const lights = createDialLights();
  assert.equal(lights.scan(scene), 4, 'four faces: the rings are not discs');
  const glows = glowsOf(scene);
  assert.equal(glows.length, 4);
  for (const dial of dials) {
    const centre = kx.localToWorld(new THREE.Vector3(...dial.centre));
    const normal = new THREE.Vector3(...dial.normal).transformDirection(kx.matrixWorld);
    const want = centre.addScaledVector(normal, DIAL_LIFT);
    const glow = glows.find((g) => g.getWorldPosition(new THREE.Vector3()).distanceTo(want) < 1e-6);
    assert.ok(glow, `a glow ${DIAL_LIFT} m out of the dial at ${dial.centre}`);
    assert.equal(((glow as THREE.Mesh).geometry as THREE.CircleGeometry).parameters.radius, dial.radius, 'as wide as the dial');
  }
  assert.equal(lights.scan(scene), 0);
});

function stage(sites: NightLightSites | null, withTower = true) {
  trainNight.value = 0;
  windowNight.value = 0;
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x35465e, 1100, 3600);
  scene.background = new THREE.Color(0x35465e);
  const world = addWorld(scene, { grid: false });
  const built = tower();
  if (withTower) scene.add(built.owner);
  const atmosphere = createAtmosphere({ scene, world, sites });
  const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 9000);
  camera.position.set(250, 380, 420);
  const target = new THREE.Vector3(40, 0, -150);
  let wall = 0;
  const at = (iso: string): void => {
    wall += 1000;
    atmosphere.update({ timeMs: Date.parse(iso), weather: CLEAR_STATE, camera, target, wallMs: wall });
  };
  return { scene, atmosphere, at, built };
}

test('atmosphere: the dials of the scene are found when it is made and glow with the lamps\' level (out at noon, white at midnight, out again at noon)', () => {
  const { scene, at, built } = stage(SITES);
  assert.equal(glowsOf(scene).length, 2, 'found by the first scan');
  at(NOON);
  assert.ok(glowsOf(scene).every((g) => !g.visible), 'no glow by day');
  at(MIDNIGHT);
  assert.ok(glowsOf(scene).every((g) => g.visible), 'every dial lit at midnight');
  near(new THREE.Vector3(...glowMaterial(glowsOf(scene)[0] as THREE.Mesh).color.toArray()), white(), 'in the dial\'s white');
  at(NOON);
  assert.ok(glowsOf(scene).every((g) => !g.visible), 'out again');
  assert.equal(built.cream.emissive.getHex(), 0, 'the face\'s own material is not the atmosphere\'s stand-in, by night or day');
});

test('atmosphere: a dial that arrives after the first frame is found by `rescan` and comes on at the level the night has', () => {
  const { scene, atmosphere, at } = stage(SITES, false);
  at(MIDNIGHT);
  assert.equal(glowsOf(scene).length, 0, 'no dial yet');
  const late = tower();
  scene.add(late.owner);
  atmosphere.rescan();
  assert.equal(glowsOf(scene).length, 2, 'found by the rescan');
  assert.ok(glowsOf(scene).every((g) => g.visible), 'lit at once: it is night');
  atmosphere.rescan();
  assert.equal(glowsOf(scene).length, 2, 'a rescan does not add a second glow');
});

test('atmosphere: a scene with no night lights (the Scottish one: its Balmoral dials are flooded) gets no glow, and a finished atmosphere takes its glows out', () => {
  const { scene, atmosphere, at } = stage(null);
  at(MIDNIGHT);
  atmosphere.rescan();
  assert.equal(glowsOf(scene).length, 0);
  const lit = stage(SITES);
  assert.equal(glowsOf(lit.scene).length, 2);
  lit.atmosphere.dispose();
  assert.equal(glowsOf(lit.scene).length, 0, 'out of the scene with the atmosphere');
});
