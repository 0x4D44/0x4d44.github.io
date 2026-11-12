// The light the trains throw (web/src/train-lamp-pool.ts): a pool on the rails ahead of a cab end that shows `head`, and a halo round each lit lens after dark, drawn for every
// train at once in two instanced meshes. The placement is a pure function of the trains; the meshes are given it once a frame.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildGraph } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { TrainView } from '../../core/motion.ts';
import { ALL_KINDS, trainLayout } from '../../core/train.ts';
import type { TrainKind } from '../../core/train.ts';
import { evidenceBuildEdinburgh } from '../src/edinburgh-fleet.ts';
import { carPoses, createLiveTrains } from '../src/trains-live.ts';
import { HALO, LIGHT_CAPACITY, POOL, TrainLampLights, haloFalloff, haloPlacements, haloStrength, haloTexture, lampEnds, poolFalloff, poolPlacements, poolStrength, poolTexture } from '../src/train-lamp-pool.ts';
import { trainNight } from '../src/train-geom.ts';
import { RAIL_TOP } from '../src/track.ts';
import { LENS, buildTrain, setTrainLampState } from '../src/train.ts';
import type { TrainLampMode } from '../src/train.ts';
import { build385 } from '../src/train-385.ts';

const near = (a: number, b: number, tol: number, msg: string): void => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (tolerance ${tol})`);
const lengthOf = (train: THREE.Object3D): number => train.userData.length as number;
const state = (front: TrainLampMode, rear: TrainLampMode) => ({ front, rear });
/** The unit vector a heading (rotation about y from +z) points along, in x and z. */
const along = (heading: number): [number, number] => [Math.sin(heading), Math.cos(heading)];
const pools = (train: THREE.Object3D, front?: TrainLampMode, rear?: TrainLampMode) => {
  if (front && rear) setTrainLampState(train, state(front, rear));
  return poolPlacements([{ group: train }]);
};
/** The far end and the near end (at the lamps) of a pool, along its own axis. */
const ends = (p: { position: [number, number, number]; headingRad: number; length: number }): { near: [number, number]; far: [number, number] } => {
  const [dx, dz] = along(p.headingRad);
  return { near: [p.position[0] - (dx * p.length) / 2, p.position[2] - (dz * p.length) / 2], far: [p.position[0] + (dx * p.length) / 2, p.position[2] + (dz * p.length) / 2] };
};
const withNight = (value: number, run: () => void): void => {
  const had = trainNight.value;
  trainNight.value = value;
  try { run(); } finally { trainNight.value = had; }
};
const triangleCount = (root: THREE.Object3D): number => {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) n += (mesh.geometry.index ? mesh.geometry.index.count : mesh.geometry.getAttribute('position').count) / 3;
  });
  return n;
};

test('a pool lies ahead of a cab end that shows head and of no other: front head, one beyond car 0\'s nose; rear head, one beyond the rear nose; both, two', () => {
  for (const kind of ['lner5', 'gc180x5', 'gn387x4', 'tl700x8'] as const) {
    const train = buildTrain(kind), length = lengthOf(train);
    // built in service state: white lamps at the front, red at the rear
    const front = pools(train);
    assert.equal(front.length, 1, `${kind}: one pool, ahead of the front`);
    const f = front[0]!, [nearEnd, farEnd] = [ends(f).near, ends(f).far];
    assert.equal(f.end, 'front');
    assert.ok(nearEnd[1] >= -0.01 && nearEnd[1] <= 1.2, `${kind}: its lamps' end is at car 0's nose: z ${nearEnd[1].toFixed(3)}`);
    near(farEnd[1], nearEnd[1] - POOL.length, 1e-9, `${kind}: it reaches ${POOL.length} m beyond the nose, in the nose's direction (-z at the front)`);
    near(f.position[0], 0, 1e-9, `${kind}: on the car's axis`);
    near(f.position[1], POOL.y, 1e-12, `${kind}: over the rail head`);
    near(along(f.headingRad)[1], -1, 1e-9, `${kind}: its far end is along -z`);
    // the other way round: the rear shows head
    const rear = pools(train, 'tail', 'head');
    assert.equal(rear.length, 1, `${kind}: one pool, ahead of the rear`);
    const r = rear[0]!;
    assert.equal(r.end, 'rear');
    assert.ok(ends(r).near[1] <= length + 0.01 && ends(r).near[1] >= length - 1.2, `${kind}: its lamps' end is at the rear nose (${length.toFixed(2)}): z ${ends(r).near[1].toFixed(3)}`);
    near(ends(r).far[1], ends(r).near[1] + POOL.length, 1e-9, `${kind}: it reaches ${POOL.length} m beyond the rear nose (+z)`);
    near(along(r.headingRad)[1], 1, 1e-9, `${kind}: its far end is along +z`);
    // both ends lit white: two, one each way
    const both = pools(train, 'head', 'head');
    assert.deepEqual(both.map((p) => p.end).sort(), ['front', 'rear'], `${kind}: a pool at each end`);
    assert.ok(both.some((p) => ends(p).far[1] < -POOL.length + 1) && both.some((p) => ends(p).far[1] > length + POOL.length - 1), `${kind}: reaching out from both noses`);
  }
});

test('a tail, an off and a coupled unit\'s inner cab end cast no pool', () => {
  const train = buildTrain('lner5');
  for (const [front, rear] of [['tail', 'tail'], ['off', 'off'], ['tail', 'off'], ['off', 'tail']] as const) {
    assert.deepEqual(pools(train, front, rear), [], `front ${front}, rear ${rear}: no pool`);
  }
  // the 387x8 is two units coupled: it has four cab ends and only its two outer ones can light
  const eight = buildTrain('gn387x8');
  assert.equal(lampEnds(eight).length, 2, 'two outer cab ends of four');
  assert.equal(pools(eight, 'head', 'head').length, 2, 'both outer ends white: two pools, not four');
  // so is a coupled pair of 385s, whose inner ends buildEdinburghTrain marks dark after the units are built
  const pair = evidenceBuildEdinburgh('sr385x3+sr385x4')!;
  assert.equal(pools(pair, 'head', 'head').length, 2, 'a coupled pair of 385s: two pools');
  const inner: THREE.Mesh[] = [];
  pair.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name === 'body-detail' && (m.userData.lamps as { interior?: boolean } | undefined)?.interior === true) inner.push(m); });
  assert.equal(inner.length, 2, 'two inner cab ends in the pair, which are the ones left out');
});

test('the pool follows setTrainLampState: it moves to the end that shows head, goes when nothing does, and comes back', () => {
  const train = buildTrain('hull5');
  assert.deepEqual(pools(train).map((p) => p.end), ['front']);
  assert.deepEqual(pools(train, 'tail', 'head').map((p) => p.end), ['rear']);
  assert.deepEqual(pools(train, 'off', 'off'), []);
  assert.deepEqual(pools(train, 'head', 'off').map((p) => p.end), ['front']);
  assert.deepEqual(pools(train, 'head', 'head').map((p) => p.end).sort(), ['front', 'rear']);
  assert.deepEqual(pools(train, 'tail', 'tail'), []);
  assert.deepEqual(train.userData.lampState, state('tail', 'tail'), 'it reads what setTrainLampState left on the train');
  assert.deepEqual(lampEnds(train).map((e) => [e.end, e.mode]), [['front', 'tail'], ['rear', 'tail']], 'and each end shows what that says');
});

test('a train posed in the world (a live train\'s car nodes are moved) puts each end\'s pool ahead of that end, along that car\'s own axis', () => {
  const train = buildTrain('lner5');
  setTrainLampState(train, state('head', 'head'));
  const first = train.getObjectByName('car-0')!, last = train.getObjectByName('car-4')!;
  first.position.set(100, 0, 50); first.rotation.y = 0.7; first.scale.set(1, 1, 1.02);
  last.position.set(-30, 0, 80); last.rotation.y = -1.1; last.scale.set(1, 1, 0.99);
  const [front, rear] = [pools(train).find((p) => p.end === 'front')!, pools(train).find((p) => p.end === 'rear')!];
  const ends4 = lampEnds(train);
  const lamp = (e: (typeof ends4)[number]): THREE.Vector3 => new THREE.Vector3(0, 0, e.z).applyMatrix4(e.car.matrixWorld);
  for (const [name, p, e, sign, yaw] of [['front', front, ends4.find((e) => e.end === 'front')!, -1, 0.7], ['rear', rear, ends4.find((e) => e.end === 'rear')!, 1, -1.1]] as const) {
    const at = lamp(e), ahead: [number, number] = [sign * Math.sin(yaw), sign * Math.cos(yaw)];
    near(ends(p).near[0], at.x, 1e-6, `${name}: the pool starts at the lamps (x)`);
    near(ends(p).near[1], at.z, 1e-6, `${name}: the pool starts at the lamps (z)`);
    near(along(p.headingRad)[0], ahead[0], 1e-9, `${name}: it runs along its car's axis, ahead of the end (x)`);
    near(along(p.headingRad)[1], ahead[1], 1e-9, `${name}: and (z)`);
    near(ends(p).far[0], at.x + ahead[0] * POOL.length, 1e-6, `${name}: its far end (x)`);
  }
  // the lamps are where the car's node put them: scaled along z with the node
  near(lamp(ends4.find((e) => e.end === 'front')!).distanceTo(new THREE.Vector3(100, 0, 50)), ends4.find((e) => e.end === 'front')!.z * 1.02, 1e-9, 'the lamps stand z (scaled) from the node');
});

test('a car that is not drawn, a train that is not shown and a train fully faded cast none', () => {
  const train = buildTrain('lner5');
  setTrainLampState(train, state('head', 'head'));
  assert.equal(pools(train).length, 2);
  const first = train.getObjectByName('car-0')!;
  first.visible = false;
  assert.deepEqual(pools(train).map((p) => p.end), ['rear'], 'a car trains-live has not posed (no track under it) casts none');
  first.visible = true;
  train.visible = false;
  assert.deepEqual(pools(train), [], 'a hidden train casts none');
  train.visible = true;
  assert.deepEqual(poolPlacements([{ group: train, opacity: 0 }]), [], 'a faded-out train casts none');
  const half = poolPlacements([{ group: train, opacity: 0.4 }]);
  assert.deepEqual(half.map((p) => p.opacity), [0.4, 0.4], 'a train half faded passes its opacity on to its pools');
});

test('the strength is a faint floor by day, rising to full with trainNight', () => {
  assert.ok(POOL.day > 0 && POOL.day < 0.1, `by day the pool is faint but there: ${POOL.day}`);
  assert.ok(POOL.night > 4 * POOL.day, `and after dark it is several times that: ${POOL.night}`);
  assert.equal(poolStrength(0), POOL.day);
  assert.equal(poolStrength(1), POOL.night);
  assert.equal(poolStrength(-3), POOL.day, 'not under the floor');
  assert.equal(poolStrength(7), POOL.night, 'not over full');
  let last = 0;
  for (const night of [0, 0.1, 0.3, 0.5, 0.8, 1]) {
    assert.ok(poolStrength(night) >= last, `the pool does not fall as night comes: ${night}`);
    last = poolStrength(night);
  }
  assert.equal(haloStrength(0), 0, 'the halo is for the dark only');
  assert.equal(haloStrength(1), HALO.night);
  const lights = new TrainLampLights();
  const train = buildTrain('lumo5');
  for (const [night, pool, halo] of [[0, POOL.day, 0], [0.5, poolStrength(0.5), HALO.night * 0.5], [1, POOL.night, HALO.night]] as const) {
    withNight(night, () => {
      lights.update([{ group: train }]);
      near(lights.pool.material.opacity, pool, 1e-12, `the pool's opacity at night ${night}`);
      near(lights.halo.material.opacity, halo, 1e-12, `the halo's opacity at night ${night}`);
      assert.equal(lights.pool.visible, true, `the pool is drawn at night ${night}, faint by day`);
      assert.equal(lights.halo.visible, night > 0, `the halo is drawn only after dark (night ${night})`);
    });
  }
  // a night level set after the commit, in the same frame, still reaches the draw
  lights.update([{ group: train }]);
  withNight(1, () => { lights.pool.onBeforeRender({} as never, {} as never, {} as never, {} as never, {} as never, {} as never); near(lights.pool.material.opacity, POOL.night, 1e-12, 'read again as the mesh is drawn'); });
  lights.dispose();
});

test('one instanced draw for the pools and one for the halos however many trains: no mesh per train, no THREE.Light, no triangle on a car', () => {
  const scene = new THREE.Scene();
  const trains = [...ALL_KINDS.map((kind) => buildTrain(kind as TrainKind)), build385('sr385x3'), build385('sr385x4')];
  assert.ok(trains.length >= 13);
  const cars = trains.map((t) => triangleCount(t));
  const lights = new TrainLampLights();
  scene.add(lights.group);
  for (const t of trains) scene.add(t);
  const instanced = (): THREE.InstancedMesh[] => { const found: THREE.InstancedMesh[] = []; scene.traverse((o) => { if ((o as THREE.InstancedMesh).isInstancedMesh) found.push(o as THREE.InstancedMesh); }); return found; };
  const lightsIn = (): THREE.Light[] => { const found: THREE.Light[] = []; scene.traverse((o) => { if ((o as THREE.Light).isLight) found.push(o as THREE.Light); }); return found; };
  withNight(1, () => {
    lights.update(trains.map((group) => ({ group })));
    assert.equal(instanced().length, 2, 'two instanced meshes in the scene: the pools, the halos');
    assert.deepEqual(instanced().map((m) => m.name).sort(), ['lamp-glow', 'lamp-pool']);
    assert.equal(lights.pool.count, trains.length, 'a pool for each train, drawn as one');
    assert.ok(lights.halo.count > trains.length, `${lights.halo.count} halos, drawn as one`);
    assert.equal(lights.dropped, 0);
    // three times the trains, the same two meshes
    const more = [...trains, ...trains, ...trains];
    lights.update(more.map((group) => ({ group })));
    assert.equal(instanced().length, 2, 'still two instanced meshes');
    assert.equal(lights.pool.count, 3 * trains.length, 'a pool each');
    assert.equal(lightsIn().length, 0, 'no THREE.Light anywhere in the scene');
    // the next frame starts clean
    lights.update(trains.slice(0, 2).map((group) => ({ group })));
    assert.equal(lights.pool.count, 2);
  });
  assert.deepEqual(trains.map((t) => triangleCount(t)), cars, 'the lights add no triangle to any car');
  const source = readFileSync(new URL('../src/train-lamp-pool.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(Point|Spot|Directional|RectArea|Hemisphere|Ambient)Light\b/, 'the module makes no light of any kind');
  assert.doesNotMatch(source, /new THREE\.(Mesh|Sprite)\(/, 'and no mesh of its own beyond the two instanced ones');
  lights.dispose();
});

test('the two meshes draw as additive decals: no depth write, a polygon offset, no fog, no tone map, never culled or picked', () => {
  const lights = new TrainLampLights();
  for (const mesh of [lights.pool, lights.halo]) {
    const m = mesh.material;
    assert.equal(m.blending, THREE.AdditiveBlending, `${mesh.name} adds`);
    assert.equal(m.transparent, true);
    assert.equal(m.depthWrite, false, `${mesh.name} writes no depth`);
    assert.equal(m.depthTest, true, `${mesh.name} is hidden by what stands in front of it`);
    assert.equal(m.polygonOffset, true, `${mesh.name} has a polygon offset`);
    assert.ok(m.polygonOffsetFactor < 0 && m.polygonOffsetUnits < 0, `${mesh.name} is pulled toward the eye`);
    assert.equal(m.fog, false, 'additive light is not given the fog\'s colour');
    assert.equal(m.toneMapped, false);
    assert.ok(m.map, `${mesh.name} has a falloff texture`);
    assert.equal(mesh.frustumCulled, false, `${mesh.name}'s instances move about the scene: its bounds are not the geometry's`);
    const hits: THREE.Intersection[] = [];
    mesh.raycast(new THREE.Raycaster(new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -1, 0)), hits);
    assert.equal(hits.length, 0, `${mesh.name} is not pickable`);
    assert.ok(mesh.instanceColor, `${mesh.name} has its colour buffer from the first draw (so the program never changes)`);
  }
  assert.ok(POOL.y > RAIL_TOP && POOL.y < 0.1, `the pool lies just over the rail head: ${POOL.y}`);
  lights.dispose();
});

test('the pool\'s instance lies flat, runs its far end along the nose\'s direction and is as wide and long as the placement says', () => {
  const lights = new TrainLampLights();
  const train = buildTrain('lner9');
  setTrainLampState(train, state('tail', 'head'));
  train.getObjectByName('car-8')!.position.set(5, 0, -7); train.getObjectByName('car-8')!.rotation.y = 0.4;
  lights.update([{ group: train }]);
  assert.equal(lights.pool.count, 1);
  const m = new THREE.Matrix4();
  lights.pool.getMatrixAt(0, m);
  const [p] = poolPlacements([{ group: train }]);
  const position = new THREE.Vector3(), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  m.decompose(position, q, scale);
  near(position.x, p!.position[0], 1e-5, 'x'); near(position.y, POOL.y, 1e-6, 'y'); near(position.z, p!.position[2], 1e-5, 'z');
  near(scale.x, POOL.width, 1e-6, 'its width across the track'); near(scale.z, POOL.length, 1e-6, 'its length along it'); near(scale.y, 1, 1e-9, 'flat');
  // the quad lies in the xz plane, facing up, and its local +z (the far end) is the nose's direction
  const geometry = lights.pool.geometry;
  const normal = geometry.getAttribute('normal');
  assert.ok(normal.getY(0) > 0.999, 'the quad faces up');
  const far = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  near(far.x, Math.sin(0.4), 1e-6, 'its far end is along the rear car\'s axis (x)'); near(far.z, Math.cos(0.4), 1e-6, 'and (z)');
  // the pool's tint is the headlamp's colour, at its train's opacity
  const colour = new THREE.Color();
  lights.pool.getColorAt(0, colour);
  const lamp = new THREE.Color(POOL.hex);
  near(colour.r, lamp.r, 1e-6, 'tint r'); near(colour.b, lamp.b, 1e-6, 'tint b');
  lights.update([{ group: train, opacity: 0.5 }]);
  lights.pool.getColorAt(0, colour);
  near(colour.r, lamp.r * 0.5, 1e-6, 'a half-faded train gives half the light');
  lights.dispose();
});

test('the pool\'s falloff: dark at the lamps, its edges and its far end, brightest a few metres out, widening with distance, and the texture is that', () => {
  for (const u of [-1, -0.5, 0, 0.5, 1]) {
    near(poolFalloff(u, 0), 0, 1e-12, `at the lamps' feet (u ${u})`);
    near(poolFalloff(u, 1), 0, 1e-12, `at the far end (u ${u})`);
  }
  for (const t of [0.05, 0.2, 0.5, 0.9]) {
    near(poolFalloff(1, t), 0, 1e-12, `at the edge (t ${t})`);
    near(poolFalloff(-0.4, t), poolFalloff(0.4, t), 1e-12, `symmetric (t ${t})`);
    assert.ok(poolFalloff(0, t) > poolFalloff(0.6, t), `brightest on the axis (t ${t})`);
  }
  let best = 0, at = 0;
  for (let t = 0; t <= 1; t += 0.01) if (poolFalloff(0, t) > best) { best = poolFalloff(0, t); at = t; }
  assert.ok(best > 0.95 && at > 0.08 && at < 0.35, `brightest ${best.toFixed(2)} at ${(at * POOL.length).toFixed(1)} m: a few metres out`);
  // a wedge: where the light has fallen to half its axis value across the pool, that is twice as far from the axis far out as it is near the lamps
  const half = (t: number): number => { let r = 0; for (let u = 0; u <= 1; u += 0.005) if (poolFalloff(u, t) > 0.5 * poolFalloff(0, t)) r = u; return r; };
  assert.ok(half(0.8) > 1.8 * half(0.15), `wider far out (${half(0.8).toFixed(2)}) than near the lamps (${half(0.15).toFixed(2)})`);
  // the texture: 32 across, 64 along, its top row the lamps' end and its bottom row the far end
  const texture = poolTexture(), data = texture.image.data as Uint8Array, w = texture.image.width, h = texture.image.height;
  assert.deepEqual([w, h], [32, 64]);
  const at2 = (i: number, j: number): number => data[4 * (j * w + i)]!;
  const centre = (j: number): number => Math.max(at2(w / 2 - 1, j), at2(w / 2, j));
  assert.ok(centre(h - 1 - 12) > 240, 'bright on the axis a few metres out');
  assert.ok(centre(0) < 8 && centre(h - 1) < 8, 'dark at both ends');
  for (let j = 0; j < h; j++) assert.ok(at2(0, j) < 8 && at2(w - 1, j) < 8, `dark at both edges (row ${j})`);
  assert.equal(data[3], 255, 'opaque: the additive blend is by the opacity and the colour');
  texture.dispose();
  const halo = haloTexture(), hd = halo.image.data as Uint8Array;
  assert.deepEqual([halo.image.width, halo.image.height], [64, 64]);
  assert.ok(hd[4 * (32 * 64 + 32)]! < 40, 'the halo is dark in its middle: the lens keeps its own colour');
  assert.ok(hd[4 * (32 * 64 + 32 + 11)]! > 230, 'brightest a third of the way out');
  for (const [i, j] of [[63, 32], [0, 32], [32, 0], [32, 63]] as const) assert.ok(hd[4 * (j * 64 + i)]! < 8, `and nothing at its edge (${i}, ${j})`);
  near(haloFalloff(1), 0, 1e-12, 'nothing at the rim'); near(haloFalloff(0), 0, 1e-12, 'nothing in the middle');
  halo.dispose();
});

test('a halo stands at each lit lens group, in the lens\'s colour, facing the way the lens does, and only after the lamps are lit', () => {
  const train = buildTrain('lner5');
  // front white, rear red: the AT300 has a headlamp and a marker array each side: 4 white at the front; the markers go red at the rear: 2 red
  const lit = haloPlacements([{ group: train }]);
  assert.equal(lit.filter((h) => h.end === 'front').length, 4, 'the front: a headlamp and a marker array on each side');
  assert.equal(lit.filter((h) => h.end === 'rear').length, 2, 'the rear: a marker array on each side, red; the headlamps are dark');
  for (const h of lit.filter((h) => h.end === 'rear')) assert.equal(h.hex, LENS.tailOn, 'a tail halo is red');
  for (const h of lit.filter((h) => h.end === 'front')) assert.ok(h.hex === LENS.headOn || h.hex === LENS.markerOn, 'a head halo is white');
  for (const h of lit) {
    const e = lampEnds(train).find((x) => x.end === h.end)!;
    const site = e.sites.filter((s) => s.role === h.role).sort((a, b) => a.centre.distanceTo(new THREE.Vector3(...h.position)) - b.centre.distanceTo(new THREE.Vector3(...h.position)))[0]!;
    near(site.centre.distanceTo(new THREE.Vector3(...h.position)), HALO.lift, 1e-3, `${h.end} ${h.role} halo stands ${HALO.lift} m off its lens group`);
    const facing = new THREE.Vector3(0, 0, 1).applyQuaternion(new THREE.Quaternion(...h.quaternion));
    assert.ok(facing.dot(site.normal) > 0.999, `${h.end} ${h.role} halo faces the way its lenses do`);
    assert.ok(facing.z * e.dir > 0.3, `and out from the nose: ${facing.z.toFixed(2)}`);
    assert.ok(h.radius >= HALO.min - 1e-9 && h.radius <= HALO.max + 1e-9, `its radius is within bounds: ${h.radius}`);
  }
  // a halo follows the lamp state: none for an end that is off, red for a tail, white for a head
  assert.deepEqual(haloPlacements([{ group: (setTrainLampState(train, state('off', 'off')), train) }]), []);
  setTrainLampState(train, state('head', 'off'));
  assert.deepEqual([...new Set(haloPlacements([{ group: train }]).map((h) => h.end))], ['front']);
  setTrainLampState(train, state('tail', 'head'));
  const turned = haloPlacements([{ group: train }]);
  assert.ok(turned.filter((h) => h.end === 'front').every((h) => h.hex === LENS.tailOn) && turned.filter((h) => h.end === 'rear').every((h) => h.hex !== LENS.tailOn));
  // a fully faded train gives none
  assert.deepEqual(haloPlacements([{ group: train, opacity: 0 }]), []);
});

test('a cab with its own lamp-halo children (the ScotRail 385\'s) keeps them and gets no second halo, but still casts a pool', () => {
  const train = build385('sr385x3');
  const own = (index: number): THREE.Object3D[] => train.getObjectByName(`car-${index}`)!.getObjectByName('body-detail')!.children.filter((c) => c.name === 'lamp-halo');
  assert.equal(own(0).length, 2, 'the 385 has its own halos');
  assert.deepEqual(haloPlacements([{ group: train }]), [], 'the instanced halos leave them be');
  assert.equal(poolPlacements([{ group: train }]).length, 1, 'its headlamps still throw a pool');
  const before = [...own(0), ...own(2)].map((c) => c.visible);
  const lights = new TrainLampLights();
  lights.update([{ group: train }]);
  assert.deepEqual([...own(0), ...own(2)].map((c) => c.visible), before, 'the lights leave the train\'s own halos as setTrainLampState set them');
  assert.equal(lights.halo.count, 0);
  lights.dispose();
});

test('placements past a mesh\'s capacity are dropped and counted, never drawn wrongly', () => {
  const lights = new TrainLampLights({ pool: 2, halo: 3 });
  const trains = Array.from({ length: 5 }, () => buildTrain('lner5'));
  lights.update(trains.map((group) => ({ group })));
  assert.equal(lights.pool.count, 2);
  assert.equal(lights.halo.count, 3);
  assert.ok(lights.dropped >= 3 + 6, `dropped ${lights.dropped}`);
  lights.update([]);
  assert.equal(lights.dropped, 0, 'the next frame\'s count is its own');
  assert.equal(lights.pool.count, 0);
  assert.ok(LIGHT_CAPACITY.pool >= 48 && LIGHT_CAPACITY.halo >= LIGHT_CAPACITY.pool);
  lights.dispose();
});

test('begin, add and commit are the frame: nothing is drawn from a frame until it is committed, and a new begin forgets the last', () => {
  const lights = new TrainLampLights();
  const a = buildTrain('lner5'), b = buildTrain('hull5');
  lights.begin(); lights.add(a); lights.add(b, 0.5);
  assert.equal(lights.pool.count, 0, 'nothing yet');
  lights.commit();
  assert.equal(lights.pool.count, 2);
  const c = new THREE.Color();
  lights.pool.getColorAt(1, c);
  near(c.r, new THREE.Color(POOL.hex).r * 0.5, 1e-6, 'the second train was added at half opacity');
  lights.begin(); lights.commit();
  assert.equal(lights.pool.count, 0, 'an empty frame draws nothing');
  assert.equal(lights.pool.visible, false);
  const scene = new THREE.Scene();
  scene.add(lights.group);
  lights.dispose();
  assert.equal(scene.children.length, 0, 'dispose takes the lights out of the scene');
});

/** A train on the 180 m radius curve trains-live.test.ts uses (a trimmed copy of its fixture), drawn at `opacity`. */
function curvedTrain(opacity: number, kind: TrainKind): { graph: Graph; train: TrainView } {
  const nodes: [number, number, number][] = [];
  for (let i = 0; i <= 60; i++) { const s = i * 5, a = s / 180; nodes.push([i + 1, 180 * (1 - Math.cos(a)), 180 * Math.sin(a)]); }
  const graph = buildGraph({ nodes, rails: [{ id: 1, nodes: nodes.map(([id]) => id), service: 'main', tunnel: false, bridge: false, layer: 0 }] });
  const length = trainLayout(kind).length, occupied = [];
  let left = length;
  for (const edge of graph.edges) {
    const take = Math.min(left, edge.length);
    occupied.push({ edge, fromT: take / edge.length, toT: 0 }); left -= take;
    if (left <= 1e-8) break;
  }
  occupied.reverse();
  return { graph, train: { id: 1, description: '1SYN', leading: { edge: graph.edges[0]!, t: 0, point: [0, 0] }, heading: 0, speed: 5, lengthM: length, occupiedLengthM: length, occupied,
    state: 'moving', opacity, targetBerth: 'SYNTHETIC', lastBerth: 'SYNTHETIC', blocked: false, distanceM: 0, reversals: 0 } };
}

test('a live London train: the pool follows the pose the live layer gives car 0 on a curve, and a train drawn at half opacity gives its pool half a tint', () => {
  const { graph, train } = curvedTrain(0.5, 'lner9');
  const scene = new THREE.Scene(), layer = createLiveTrains(graph, scene), lamps = new TrainLampLights();
  layer.update([train]); scene.updateMatrixWorld(true);
  const drawn = layer.trains()[0]!;
  assert.equal(drawn.opacity, 0.5, 'the live layer hands on the view\'s opacity');
  lamps.update(layer.trains());
  assert.equal(lamps.pool.count, 1, 'one lit end, one pool');
  // car 0's node is posed on the curve: where its nose lamps are is the pose's position along the pose's own axis (scaled along it), the pool starts there and runs ahead of the nose
  const pose = carPoses(graph, train, trainLayout('lner9'))[0]!, lamp = lampEnds(drawn.group).find((e) => e.end === 'front')!;
  assert.ok(Math.abs(pose.rotationY) > 0.02, `a curve, not a straight: car 0 turned ${pose.rotationY.toFixed(3)} rad`);
  const [sin, cos] = [Math.sin(pose.rotationY), Math.cos(pose.rotationY)];
  const lampAt = [pose.position[0] + sin * lamp.z * pose.scaleZ, pose.position[1] + cos * lamp.z * pose.scaleZ];
  const m = new THREE.Matrix4(), at = new THREE.Vector3(), q = new THREE.Quaternion(), size = new THREE.Vector3();
  lamps.pool.getMatrixAt(0, m); m.decompose(at, q, size);
  const far = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  near(far.x, -sin, 1e-6, 'its far end runs the way car 0\'s nose points (x)');
  near(far.z, -cos, 1e-6, 'its far end runs the way car 0\'s nose points (z)');
  near(at.x, lampAt[0]! - sin * POOL.length / 2, 1e-6, 'from the lamps, half its length ahead (x)');
  near(at.z, lampAt[1]! - cos * POOL.length / 2, 1e-6, 'from the lamps, half its length ahead (z)');
  const tint = new THREE.Color();
  lamps.pool.getColorAt(0, tint);
  near(tint.r, new THREE.Color(POOL.hex).r * 0.5, 1e-6, 'half a tint');
  // faded right out: no pool at all
  layer.update([{ ...train, opacity: 0 }]); scene.updateMatrixWorld(true);
  lamps.update(layer.trains());
  assert.equal(lamps.pool.count, 0, 'a train drawn at no opacity casts nothing');
  lamps.dispose(); layer.dispose();
});

test('the page wires London\'s train lights: one set in the London scene, fed the scene\'s trains once a frame (none while another scene is shown), disposed with the page, and on window.__kx (source pins: main.ts needs a browser)', () => {
  const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
  assert.match(main, /import \{ TrainLampLights \} from '\.\/train-lamp-pool\.ts';/, 'imported');
  assert.equal(main.match(/new TrainLampLights\(\)/g)?.length, 1, 'one set of lights for the London scene');
  assert.match(main, /scene\.add\(lampLights\.group\);/, 'in the London scene');
  assert.equal(main.match(/lampLights\.update\(/g)?.length, 1, 'fed once a frame');
  assert.match(main, /lampLights\.update\(stations\.activeScene\(\) === scene \? trains : \[\]\);/, 'the scene\'s trains, and none while another scene is shown');
  assert.match(main, /lampLights\.dispose\(\);/, 'disposed with the page');
  assert.match(main, /Object\.assign\(kx, \{[^}]*\blampLights\b[^}]*\}\);/, 'on window.__kx beside the other hooks');
  assert.match(main, /liveTrains\.update\(kx\.motionState\); trains\.splice\(0, trains\.length, \.\.\.liveTrains\.trains\(\)\); \}\n(?:[^\n]*\n)*?[^\n]*lampLights\.update\(/, 'after the live trains are posed, so the lights are given the poses of this frame');
});
