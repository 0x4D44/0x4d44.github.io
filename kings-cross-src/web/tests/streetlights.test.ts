// web/src/streetlights.ts: the street lamps' drawing (round seven, night lighting): the post of a lamp and of a forecourt mast, the glow at each head, the pool of light on the ground under it,
// and what addCity does with them. Core places the lamps (core/tests/streetlights.test.ts); here is what is drawn, how it comes on with the night's level and what it costs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildCity, PAGE_DRAPE } from '../../core/city.ts';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { railSegments } from '../../core/scene.ts';
import { forecourtMasts, LAMP_KIND, MAST_HEIGHT, MAST_LIFT, POOL_REACH, poolRadius } from '../../core/streetlights.ts';
import type { LampSpot } from '../../core/streetlights.ts';
import { createTerrain } from '../../core/terrain.ts';
import { addCity } from '../src/city.ts';
import type { NightLayer } from '../src/night.ts';
import { createStreetLights, headOf, LAMP_LIGHT, lampGeometry, mastGeometry, MAST_STRIP, poolTexture, POST_HEIGHT, stripPoints } from '../src/streetlights.ts';
import { GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const city: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const spot = (over: Partial<LampSpot> = {}): LampSpot => ({ x: 10, y: 0.07, z: -5, yaw: 0, height: 8, kind: LAMP_KIND.sodium, slope: [0, 0], ...over });
const tris = (g: THREE.BufferGeometry): number => (g.index as THREE.BufferAttribute).count / 3;
const named = <T extends THREE.Object3D>(root: THREE.Object3D, name: string): T => {
  const found = root.getObjectByName(name) as T | undefined;
  assert.ok(found, `${name} is in the group`);
  return found;
};

// This test runs first: the pool's texture is made once, on the first call, and in Node (no document) that call makes none. Here a recording canvas stands in for the page's.
test('poolTexture: a 128 px canvas with a radial gradient, white under the lamp, falling as the cube of the cosine from its foot to nothing at POOL_REACH post heights', () => {
  const stops: [number, string][] = [];
  let made: unknown[] | null = null;
  let rect: number[] | null = null;
  const canvas = {
    width: 0,
    height: 0,
    getContext: (kind: string) => {
      assert.equal(kind, '2d');
      return {
        createRadialGradient: (...a: number[]) => { made = a; return { addColorStop: (o: number, c: string) => stops.push([o, c]) }; },
        fillRect: (...a: number[]) => { rect = a; },
        set fillStyle(_: unknown) {},
      };
    },
  };
  const world = globalThis as unknown as { document?: unknown };
  world.document = { createElement: (tag: string) => { assert.equal(tag, 'canvas'); return canvas; } };
  let texture: THREE.Texture | null;
  try {
    texture = poolTexture();
  } finally {
    delete world.document;
  }
  assert.ok(texture instanceof THREE.CanvasTexture, 'a canvas texture');
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.deepEqual([canvas.width, canvas.height], [128, 128]);
  assert.deepEqual(made, [64, 64, 0, 64, 64, 64], 'from the middle of the canvas to its edge');
  assert.deepEqual(rect, [0, 0, 128, 128], 'filling the whole canvas');
  assert.deepEqual(stops.map(([o]) => o), [0, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1]);
  const alpha = stops.map(([, c]) => Number(/^rgba\(255,255,255,([\d.]+)\)$/.exec(c)?.[1]));
  assert.ok(alpha.every(Number.isFinite), `white with an alpha: ${stops.map(([, c]) => c)}`);
  assert.equal(alpha[0], 1, 'full under the lamp');
  assert.equal(alpha[alpha.length - 1], 0, 'clear at the edge of the square, so no square shows');
  for (const [i, [offset]] of stops.entries()) {
    if (i === stops.length - 1) continue;
    const d = offset * POOL_REACH;
    close(alpha[i] as number, (1 / Math.sqrt(1 + d * d)) ** 3, 0.0006, `the light at ${d.toFixed(2)} post heights`);
    if (i > 0) assert.ok((alpha[i] as number) < (alpha[i - 1] as number), 'falling all the way out');
  }
  assert.ok(poolTexture() === texture, 'made once');
});

test('lampGeometry and mastGeometry: 36 and 24 triangles of flat vertex colour and no UVs; the lamp POST_HEIGHT tall with its arm along +x, the mast MAST_HEIGHT tall with its strip of LEDs near the top', () => {
  const lamp = lampGeometry();
  const mast = mastGeometry();
  assert.equal(tris(lamp), 36);
  assert.equal(tris(mast), 24);
  for (const g of [lamp, mast]) {
    assert.ok(g.getAttribute('color') && g.getAttribute('normal') && g.getAttribute('position'));
    assert.equal(g.getAttribute('uv'), undefined, 'the posts are plain colour');
  }
  lamp.computeBoundingBox();
  mast.computeBoundingBox();
  const [lb, mb] = [lamp.boundingBox as THREE.Box3, mast.boundingBox as THREE.Box3];
  close(lb.min.y, 0, 1e-9, 'the lamp stands on its foot');
  // the post itself (every vertex up to the post's height; the arm and the head lie above it): a ring of six at the foot, 0.22 m across, and one at the top of the post, 0.14 m across
  const lampAt = lamp.getAttribute('position');
  const column: [number, number][] = [];
  for (let i = 0; i < lampAt.count; i++) if (lampAt.getY(i) <= POST_HEIGHT + 1e-6) column.push([lampAt.getY(i), Math.hypot(lampAt.getX(i), lampAt.getZ(i))]);
  const [footRing, topRing] = [column.filter(([y]) => Math.abs(y) < 1e-6), column.filter(([y]) => Math.abs(y - POST_HEIGHT) < 1e-6)];
  assert.equal(column.length, 24, 'six faces of four vertices');
  assert.equal(footRing.length, 12, 'half of them at the foot');
  assert.equal(topRing.length, 12, 'and half at the top of the post, POST_HEIGHT up');
  for (const [, r] of footRing) close(r, 0.11, 1e-6, 'the foot is 0.22 m across');
  for (const [, r] of topRing) close(r, 0.07, 1e-6, 'and the top 0.14 m, so the post tapers');
  assert.ok(lb.max.y > POST_HEIGHT && lb.max.y < POST_HEIGHT + 0.5, `the head is just over the post: ${lb.max.y}`);
  assert.ok(lb.max.x > 1.5 && lb.max.x < 2.5, `the arm reaches out along +x: ${lb.max.x}`);
  assert.ok(lb.min.x > -0.2 && Math.abs(lb.max.z) < 0.35 && Math.abs(lb.min.z) < 0.35, 'and nothing the other way or sideways');
  close(mb.min.y, 0, 1e-9, 'the mast stands on its foot');
  close(mb.max.y, MAST_HEIGHT, 0.01, 'and is as tall as the forecourt\'s masts');
  assert.ok(Math.max(mb.max.x, mb.max.z, -mb.min.x, -mb.min.z) < 0.4, 'a slim column');
  // the strip of LEDs: the pale box between MAST_STRIP's heights, which the glow lights
  const [position, color] = [mast.getAttribute('position'), mast.getAttribute('color')];
  const pale: number[] = [];
  for (let i = 0; i < position.count; i++) if (color.getX(i) > 0.6) pale.push(position.getY(i));
  assert.equal(pale.length, 24, 'a box: 24 vertices');
  close(Math.min(...pale), MAST_STRIP[0], 1e-5, 'the strip starts');
  close(Math.max(...pale), MAST_STRIP[1], 1e-5, 'and ends');
  assert.ok(MAST_STRIP[1] <= MAST_HEIGHT && MAST_STRIP[0] > MAST_HEIGHT / 2, 'near the top');
});

test('headOf: the lamp\'s glow is at the end of its arm and the top of its post, scaled to its height and turned with it; a mast\'s is at its foot (its glow is the strip\'s)', () => {
  const at = spot({ x: 3, y: 1, z: -4 });
  const [hx, hy, hz] = headOf(at);
  const arm = hx - at.x;
  assert.ok(arm > 1.5 && arm < 2, `the arm: ${arm} m at ${POST_HEIGHT} m`);
  close(hz, at.z, 1e-9, 'straight out along x at a yaw of zero');
  assert.ok(hy - at.y > POST_HEIGHT && hy - at.y < POST_HEIGHT + 0.3, `the head: ${hy - at.y} m up`);
  // twice the height, twice the arm and the head twice as high (the instance's scale)
  const [bx, by] = headOf(spot({ x: 3, y: 1, z: -4, height: 16 }));
  close(bx - at.x, 2 * arm, 1e-9, 'the arm scales');
  close(by - at.y, 2 * (hy - at.y), 1e-9, 'the head scales');
  // a turn about y takes +x to (cos yaw, -sin yaw)
  const [tx, , tz] = headOf(spot({ x: 3, y: 1, z: -4, yaw: Math.PI / 2 }));
  close(tx, at.x, 1e-9, 'a quarter turn takes the arm off x');
  close(tz, at.z - arm, 1e-9, 'and along -z');
  const [mx, my, mz] = headOf(spot({ x: 3, y: 1, z: -4, mast: true, height: MAST_HEIGHT }));
  assert.deepEqual([mx, my, mz], [3, 1, -4]);
  // and the strip, bottom to top, 0.6 m apart, over the mast's foot
  const points = stripPoints(spot({ x: 3, y: 1, z: -4, mast: true, height: MAST_HEIGHT }));
  assert.equal(points.length, 7);
  points.forEach((p, i) => {
    close(p[0], 3, 1e-9);
    close(p[2], -4, 1e-9);
    close(p[1], 1 + MAST_STRIP[0] + 0.6 * i, 1e-9, `point ${i}`);
  });
  close(points[6]![1], 1 + MAST_STRIP[1], 1e-6, 'up to the top of the strip');
});

test('createStreetLights: posts there by day, a glow at each head and a pool under it that come on with the level, four draws, no light in the scene', () => {
  const spots = [
    spot(),
    spot({ x: 30, kind: LAMP_KIND.warm, height: 6, yaw: 1 }),
    spot({ x: 50, kind: LAMP_KIND.cool, height: 9, yaw: -2 }),
    spot({ x: 70, z: 20, mast: true, kind: LAMP_KIND.cool, height: MAST_HEIGHT }),
    spot({ x: 90, z: 20, mast: true, kind: LAMP_KIND.cool, height: MAST_HEIGHT }),
  ];
  const lights = createStreetLights(spots);
  const g = lights.group;
  assert.equal(g.name, 'street-lamps');
  assert.deepEqual(g.children.map((c) => c.name), ['street-lamp-posts', 'forecourt-masts', 'street-lamp-halos', 'street-lamp-pools']);
  g.traverse((o) => assert.ok(!(o as THREE.Light).isLight, `${o.name}: no real light is cast`));
  assert.deepEqual(lights.counts(), { lamps: 5, triangles: 3 * 36 + 2 * 24 + 2 * 5, draws: 4 });

  // the posts: instanced, one Lambert material of vertex colours, drawn at every hour
  const posts = named<THREE.InstancedMesh>(g, 'street-lamp-posts');
  const masts = named<THREE.InstancedMesh>(g, 'forecourt-masts');
  assert.ok(posts.isInstancedMesh && masts.isInstancedMesh);
  assert.equal(posts.count, 3);
  assert.equal(masts.count, 2);
  assert.equal(tris(posts.geometry), 36);
  assert.equal(tris(masts.geometry), 24);
  const postMaterial = posts.material as THREE.MeshLambertMaterial;
  assert.ok(postMaterial.isMeshLambertMaterial && postMaterial.vertexColors);
  assert.equal(masts.material, posts.material, 'one material');
  for (const m of [posts, masts]) assert.ok(m.visible && !m.castShadow && !m.frustumCulled, 'drawn by day, casting no shadow, never culled away (the instances span the city)');
  const matrix = new THREE.Matrix4();
  const [position, quaternion, scale] = [new THREE.Vector3(), new THREE.Quaternion(), new THREE.Vector3()];
  const placed = (mesh: THREE.InstancedMesh, i: number): { yaw: number } => {
    mesh.getMatrixAt(i, matrix);
    matrix.decompose(position, quaternion, scale);
    return { yaw: new THREE.Euler().setFromQuaternion(quaternion, 'YXZ').y };
  };
  [0, 1, 2].forEach((i) => {
    const s = spots[i] as LampSpot;
    const { yaw } = placed(posts, i);
    close(position.x, s.x, 1e-5, `lamp ${i} x`);
    close(position.y, s.y, 1e-5, `lamp ${i} y`);
    close(position.z, s.z, 1e-5, `lamp ${i} z`);
    close(scale.x, s.height / POST_HEIGHT, 1e-6, `lamp ${i} is scaled to its height`);
    assert.ok(Math.abs(scale.x - scale.y) < 1e-6 && Math.abs(scale.y - scale.z) < 1e-6, 'uniformly');
    close(Math.cos(yaw), Math.cos(s.yaw), 1e-6, `lamp ${i} turned to its yaw`);
    close(Math.sin(yaw), Math.sin(s.yaw), 1e-6);
  });
  [0, 1].forEach((i) => {
    const s = spots[3 + i] as LampSpot;
    placed(masts, i);
    close(position.x, s.x, 1e-5, `mast ${i} x`);
    close(position.y, s.y, 1e-5, `mast ${i} y`);
    close(position.z, s.z, 1e-5, `mast ${i} z`);
    assert.deepEqual(scale.toArray(), [1, 1, 1], 'a mast is as built');
  });

  // the glow: a point at each head, seven along each mast's strip, a colour each, additive and unfogged
  const halos = named<THREE.Points>(g, 'street-lamp-halos');
  const haloMaterial = halos.material as THREE.PointsMaterial;
  const haloAt = halos.geometry.getAttribute('position');
  const haloColour = halos.geometry.getAttribute('color');
  assert.equal(haloAt.count, 3 + 2 * 7);
  assert.deepEqual([haloAt.getX(0), haloAt.getY(0), haloAt.getZ(0)].map(Math.fround), headOf(spots[0] as LampSpot).map(Math.fround), 'the first glow is the first lamp\'s head');
  const strip = stripPoints(spots[4] as LampSpot);
  strip.forEach((p, i) => assert.deepEqual([haloAt.getX(10 + i), haloAt.getY(10 + i), haloAt.getZ(10 + i)].map(Math.fround), p.map(Math.fround), `the second mast's strip, point ${i}`));
  const want = new THREE.Color();
  [[0, 0], [1, 1], [2, 2], [3, 3], [9, 4], [16, 4]].forEach(([i, s]) => {
    want.setHex(LAMP_LIGHT[(spots[s as number] as LampSpot).kind].halo);
    for (const [k, c] of [[haloColour.getX(i as number), want.r], [haloColour.getY(i as number), want.g], [haloColour.getZ(i as number), want.b]] as const) close(k, c, 1e-6, `glow ${i} takes its kind's colour`);
  });
  assert.equal(haloMaterial.blending, THREE.AdditiveBlending);
  assert.ok(haloMaterial.transparent && !haloMaterial.depthWrite && !haloMaterial.fog && haloMaterial.vertexColors && haloMaterial.sizeAttenuation);

  // the pools: one instance each, the colour its kind's pool colour at its strength, additive, clear of the ground by polygon offset
  const pools = named<THREE.InstancedMesh>(g, 'street-lamp-pools');
  const poolMaterial = pools.material as THREE.MeshBasicMaterial;
  assert.equal(pools.count, 5);
  assert.ok(pools.instanceColor);
  spots.forEach((s, i) => {
    const light = LAMP_LIGHT[s.kind];
    want.setHex(light.pool).multiplyScalar(light.strength);
    const colour = new THREE.Color().fromBufferAttribute(pools.instanceColor as THREE.BufferAttribute, i);
    close(colour.r, want.r, 1e-6, `pool ${i} red`);
    close(colour.g, want.g, 1e-6, `pool ${i} green`);
    close(colour.b, want.b, 1e-6, `pool ${i} blue`);
  });
  assert.equal(poolMaterial.blending, THREE.AdditiveBlending);
  assert.ok(poolMaterial.transparent && !poolMaterial.depthWrite && !poolMaterial.fog && poolMaterial.polygonOffset && poolMaterial.polygonOffsetFactor < 0 && poolMaterial.polygonOffsetUnits < 0);
  assert.ok(halos.renderOrder > pools.renderOrder, 'the glows over the pools');
  assert.ok(!halos.frustumCulled && !pools.frustumCulled, 'neither is culled by its first point or its quad\'s bounds: their instances span the city');

  // by day: nothing glows. With the level: the glow at 0.9 of it, the pool at all of it, a trace of level draws nothing, and the level is held to 0..1
  assert.ok(!halos.visible && !pools.visible);
  assert.equal(haloMaterial.opacity, 0);
  assert.equal(poolMaterial.opacity, 0);
  lights.setLevel(1);
  assert.ok(halos.visible && pools.visible);
  close(haloMaterial.opacity, 0.9, 1e-12);
  close(poolMaterial.opacity, 1, 1e-12);
  lights.setLevel(0.5);
  close(haloMaterial.opacity, 0.45, 1e-12, 'half the level, half the glow');
  close(poolMaterial.opacity, 0.5, 1e-12);
  lights.setLevel(0.005);
  assert.ok(!halos.visible && !pools.visible, 'a trace of level draws nothing');
  lights.setLevel(-3);
  assert.ok(!halos.visible && !pools.visible);
  assert.equal(haloMaterial.opacity, 0);
  lights.setLevel(40);
  assert.ok(halos.visible && pools.visible);
  assert.ok(haloMaterial.opacity <= 0.9 && poolMaterial.opacity <= 1, 'never over full');
  assert.ok(posts.visible && masts.visible, 'the posts stand at every level');

  // everything it made is given back
  const freed: string[] = [];
  const geometries = [posts.geometry, masts.geometry, halos.geometry, pools.geometry];
  const materials = [postMaterial, haloMaterial, poolMaterial];
  const instanced = [posts, masts, pools];
  for (const x of [...geometries, ...materials]) x.addEventListener('dispose', () => freed.push(x.type));
  for (const m of instanced) m.addEventListener('dispose', () => freed.push(m.name));
  lights.dispose();
  assert.equal(freed.length, geometries.length + materials.length + instanced.length, `freed ${freed}`);
  for (const m of instanced) assert.ok(freed.includes(m.name), `${m.name} (its matrices and colours) is freed`);
});

test('createStreetLights: with no lamps it draws nothing and still comes on and goes out; with only masts, only the mast post is drawn', () => {
  const none = createStreetLights([]);
  assert.deepEqual(none.counts(), { lamps: 0, triangles: 0, draws: 2 });
  assert.equal(none.group.getObjectByName('street-lamp-posts'), undefined);
  assert.equal(none.group.getObjectByName('forecourt-masts'), undefined);
  none.setLevel(1);
  none.setLevel(0);
  none.dispose();
  const mastOnly = createStreetLights([spot({ mast: true, height: MAST_HEIGHT })]);
  assert.deepEqual(mastOnly.group.children.map((c) => c.name), ['forecourt-masts', 'street-lamp-halos', 'street-lamp-pools']);
  assert.deepEqual(mastOnly.counts(), { lamps: 1, triangles: 24 + 2, draws: 3 });
  mastOnly.dispose();
});

test('a pool lies in the ground\'s own plane at the foot of the glow, a lamp\'s reach each way: on a slope it neither sinks into the ground nor hangs over it', () => {
  const sloped = spot({ x: 5, y: 2, z: 8, yaw: 0.7, height: 7, slope: [0.1, -0.05] });
  const lights = createStreetLights([sloped]);
  const pools = named<THREE.InstancedMesh>(lights.group, 'street-lamp-pools');
  const matrix = new THREE.Matrix4();
  pools.getMatrixAt(0, matrix);
  const [hx, , hz] = headOf(sloped);
  const r = poolRadius(sloped.height) * 2;
  const lifts: number[] = [];
  for (const [cx, cz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5], [0, 0]] as const) {
    const p = new THREE.Vector3(cx, 0, cz).applyMatrix4(matrix);
    close(p.x, hx + cx * r, 1e-4, 'the pool is centred under the head, its reach each way');
    close(p.z, hz + cz * r, 1e-4);
    lifts.push(p.y - (sloped.y + sloped.slope[0] * (p.x - sloped.x) + sloped.slope[1] * (p.z - sloped.z)));
  }
  for (const lift of lifts) close(lift, lifts[0] as number, 1e-4, 'the same height over the ground\'s plane at every corner');
  assert.ok((lifts[0] as number) > 0.03 && (lifts[0] as number) < 0.15, `a little over the pavement: ${lifts[0]} m`);
  // and the pool's own edge is where its gradient has faded to nothing: POOL_REACH heights from the lamp
  close(r / 2, sloped.height * POOL_REACH, 1e-9);
  lights.dispose();
});

test('addCity places the street lamps and the forecourt\'s masts, hands them to the night lights, and gives them back with the city; lamps: false leaves them out', () => {
  const hidden = new Set(data.buildings.slice(0, 5).map((b) => b.id));
  const layers: NightLayer[] = [];
  let detached = 0;
  const night = { attach: (layer: NightLayer): (() => void) => { layers.push(layer); layer.setLevel(0.5); return () => { detached++; }; } };
  const scene = new THREE.Scene();
  const c = addCity(scene, data, city, { hidden, night });
  const lights = c.lights;
  assert.ok(lights, 'there are lamps');
  assert.ok(scene.children.includes(lights.group), 'in the scene, a group of their own');
  assert.ok(!c.group.children.some((child) => child.name.startsWith('street-lamp')), 'not among the city\'s own meshes');
  assert.equal(layers.length, 1);
  assert.ok(layers[0] === lights, 'the night lights are handed the lamps');
  assert.ok((lights.group.getObjectByName('street-lamp-halos') as THREE.Points).visible, 'and the level they had (0.5) is applied at once');
  // what is placed: the city's lamps and the six masts
  const exclude = data.buildings.filter((b) => hidden.has(b.id)).map((b) => b.pts);
  const rails = railSegments(data);
  const built = buildCity(data.buildings, city, { hidden, exclude, groundY: GROUND_Y, rails: [...rails.main, ...rails.siding] });
  const masts = forecourtMasts(data, () => GROUND_Y);
  assert.equal(masts.length, 6);
  assert.equal(c.stats.lamps, built.lamps.length + masts.length);
  assert.equal(lights.counts().lamps, c.stats.lamps);
  assert.equal((lights.group.getObjectByName('street-lamp-posts') as THREE.InstancedMesh).count, built.lamps.length);
  assert.equal((lights.group.getObjectByName('forecourt-masts') as THREE.InstancedMesh).count, masts.length);
  // with no terrain the masts stand on the flat ground and the plaza's lift: -0.2 + 0.15 m, not at zero
  const mastMatrix = new THREE.Matrix4();
  (lights.group.getObjectByName('forecourt-masts') as THREE.InstancedMesh).getMatrixAt(0, mastMatrix);
  close(new THREE.Vector3().setFromMatrixPosition(mastMatrix).y, GROUND_Y + MAST_LIFT, 1e-4, 'a mast stands on the flat ground when there is no terrain');
  // what it costs: four draw calls and a few tens of thousands of triangles, and none of it in the city's own count
  const cost = lights.counts();
  assert.ok(cost.draws <= 4, `${cost.draws} draw calls`);
  assert.ok(cost.triangles > 30_000 && cost.triangles < 60_000, `${cost.triangles} triangles`);
  const without = addCity(new THREE.Scene(), data, city, { hidden, lamps: false });
  assert.ok(without.lights === null, 'lamps: false builds no lamp layer, and not an empty one'); // a plain comparison: a failing assert.equal would print the layer's whole scene graph
  assert.equal(without.stats.lamps, 0);
  assert.equal(without.stats.drawCalls, c.stats.drawCalls, 'the lamps are no part of the city\'s draw calls');
  assert.equal(without.stats.triangles, c.stats.triangles, 'or its triangles');
  without.dispose();
  // disposing the city takes the lamps out of the scene and off the night lights, and gives their meshes back
  let freedPosts = 0;
  (lights.group.getObjectByName('street-lamp-posts') as THREE.InstancedMesh).addEventListener('dispose', () => { freedPosts++; });
  c.dispose();
  assert.equal(detached, 1, 'the night lights let them go');
  assert.ok(!scene.children.includes(lights.group));
  assert.equal(freedPosts, 1, 'and the lamps are freed with the city');
  // without night lights the lamps are drawn and stay dark
  const dark = addCity(new THREE.Scene(), data, city, { hidden });
  assert.ok(dark.lights);
  assert.ok(!(dark.lights.group.getObjectByName('street-lamp-halos') as THREE.Points).visible);
  dark.dispose();
});

test('addCity on the real ground: the posts and the masts stand on the terrain and the pools lie in its plane', () => {
  const terrain = createTerrain(JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8')));
  const hidden = new Set(data.buildings.slice(0, 5).map((b) => b.id));
  const c = addCity(new THREE.Scene(), data, city, { hidden, terrain });
  const lights = c.lights as NonNullable<typeof c.lights>;
  const exclude = data.buildings.filter((b) => hidden.has(b.id)).map((b) => b.pts);
  const rails = railSegments(data);
  const built = buildCity(data.buildings, city, { hidden, exclude, groundY: GROUND_Y, rails: [...rails.main, ...rails.siding], terrain, drape: PAGE_DRAPE });
  const masts = forecourtMasts(data, (x, z) => terrain.heightAt(x, z));
  assert.equal(c.stats.lamps, built.lamps.length + masts.length);
  const posts = named<THREE.InstancedMesh>(lights.group, 'street-lamp-posts');
  const matrix = new THREE.Matrix4();
  const p = new THREE.Vector3();
  let steepest = 0;
  built.lamps.forEach((l, i) => {
    posts.getMatrixAt(i, matrix);
    p.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(p.x - l.x) < 1e-3 && Math.abs(p.y - l.y) < 1e-3 && Math.abs(p.z - l.z) < 1e-3, `lamp ${i} stands where the core put it`);
    assert.ok(Math.abs(l.y - terrain.heightAt(l.x, l.z)) < 6, `lamp ${i} is on the ground (or the bridge over the railway): ${l.y} against ${terrain.heightAt(l.x, l.z)}`);
    steepest = Math.max(steepest, Math.hypot(...l.slope));
  });
  assert.ok(steepest > 0.02, `the real ground slopes under some lamps: ${steepest}`);
  const mastPosts = named<THREE.InstancedMesh>(lights.group, 'forecourt-masts');
  masts.forEach((m, i) => {
    mastPosts.getMatrixAt(i, matrix);
    p.setFromMatrixPosition(matrix);
    assert.ok(Math.abs(p.y - (terrain.heightAt(m.x, m.z) + 0.15)) < 1e-3, `mast ${i} stands on the plaza: ${p.y}`);
  });
  c.dispose();
});
