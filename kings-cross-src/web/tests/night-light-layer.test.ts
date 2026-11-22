import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildLightField, LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE } from '../../core/light-field.ts';
import type { LightField } from '../../core/light-field.ts';
import { lightSourcesFor, registerLights } from '../../core/light-sources.ts';
import { testRoadLight as light } from '../../core/tests/light-field-fixture.ts';
import { skyRig } from '../../core/daylight.ts';
import { solarPosition } from '../../core/solar.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import type { CityData } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { squeezeGlslText } from '../../vite.config.ts';
import { REFERENCE } from '../src/atmosphere.ts';
import { addCity } from '../src/city.ts';
import { addRoofShade } from '../src/lighting.ts';
import { createNightLightLayer, nightLightGLSL } from '../src/night-light-layer.ts';
import { EUSTON_P1_OPTIC, EUSTON_P1_ROW } from '../src/night-lighting-p1.ts';
import { createStreetLights } from '../src/streetlights.ts';
import { CLEAR_STATE, forcedObservation, weatherState } from '../src/weather.ts';
import { Glsl, Sampler } from './glsl.ts';
import type { Value } from './glsl.ts';

const up = [0, 1, 0];
const zero = [0, 0, 0];
function probe(field: LightField, cap = field.spec.cap, roof = 0, level = 1) {
  const program = new Glsl('float coverGroundAt(vec3 p) { return ' + roof.toFixed(3) + '; }\n' + nightLightGLSL(cap));
  const vars: Record<string, Value> = {
    uNightLightLevels: [level, 0],
    uNightLightWeather: [0, 0],
    uNightLightGridRect: [...field.origin, field.columns, field.rows],
    uNightLightCellM: field.spec.cellM,
    uNightLightData: new Sampler(field.data), uNightLightDataWidth: field.dataWidth,
    uNightLightGrid: new Sampler(field.grid), uNightLightGridWidth: field.gridWidth,
  };
  const fns = { texelFetch: (sampler: Value, ij: Value, lod: Value) => {
    assert.equal(lod, 0);
    assert.ok(sampler instanceof Sampler && Array.isArray(ij));
    const data = sampler.data as Float32Array | Uint8Array;
    const stride = data instanceof Float32Array ? field.dataWidth : field.gridWidth;
    const offset = 4 * (ij[1]! * stride + ij[0]!);
    assert.ok(offset >= 0 && offset + 4 <= data.length);
    return [...data.subarray(offset, offset + 4)].map(v => data instanceof Uint8Array ? v / 255 : v);
  } };
  return {
    at: (p: number[], n = up, facade = false) =>
      program.call('nightLightAt', [p, n, facade, [0, 0, 0], false, 0], { vars, fns }) as number[],
    front: (p: number[], n: number[], plane: number[], lowerBrick = 0) =>
      program.call('nightLightAt', [p, n, true, plane, false, lowerBrick], { vars, fns }) as number[],
    midland: (p: number[], n: number[], height: number) => program.evaluate(receiverContribution('landmarks-brickRed'), {
      vars: { ...vars, nightP: p, nightN: n, diffuse: [1, 1, 1], vMidlandHeight: height }, fns,
    }) as number[],
    ground: (p: number[], albedo: number[], state = weatherFrame('clear'), facing = .5, surface = 'city-plaza') => {
      const env = { vars: { ...vars, nightP: p, nightN: up, diffuse: albedo, normal: up,
        vViewPosition: [0, facing, Math.sqrt(1 - facing ** 2)],
        uNightLightLevels: [level, state.weather.snowCover],
        uNightLightWeather: [state.weather.wet, state.rig.fogAmount] }, fns };
      return program.evaluate(receiverContribution(surface), env) as number[];
    },
  };
}

test('P1 road lobe, backward reach, smooth carriageway join, inverse square and cutoff run in GLSL', t => {
  const at = probe(buildLightField([light()], LIGHT_GRID_DESKTOP)).at;
  const peak = at([4, 0, 0]);
  assert.ok(peak[0]! > .75 && peak[0]! < .85 && peak[0]! > peak[1]! && peak[1]! > peak[2]!, JSON.stringify(peak));
  const high = at([2, 5.075, 0])[0]!;
  assert.ok(Math.abs(high / peak[0]! - 4) < .001, 'doubling distance quarters irradiance');
  assert.ok(at([4, 0, 10])[0]! > at([14, 0, 0])[0]!);
  const join = [-2.99, -3, -3.01, -6, -12].map(x => at([x, 0, 0])[0]!);
  assert.ok(join.every(v => v > .05) && Math.abs(join[0]! - join[2]!) < .01, String(join));
  assert.deepEqual(at([4, 0, 35]), zero);
  assert.deepEqual(at([4, 0, 0], [0, -1, 0]), zero);
  t.diagnostic(JSON.stringify({ peak, high, join }));
});

test('open and under-roof lights use complementary cover and daylight has no field contribution', () => {
  for (const cover of ['open', 'under-roof'] as const) {
    const field = buildLightField([{ ...light(), cover }], LIGHT_GRID_DESKTOP);
    const p = [4, 0, 0], bright = probe(field, 16, cover === 'open' ? 0 : 1).at(p)[0]!;
    assert.ok(bright > .75 && bright < .85);
    assert.deepEqual(probe(field, 16, cover === 'open' ? 1 : 0).at(p), zero);
    assert.ok(Math.abs(probe(field, 16, .25).at(p)[0]! / bright - (cover === 'open' ? .75 : .25)) < 1e-8);
    assert.deepEqual(probe(field, 16, 0, 0).at(p), zero);
  }
});

test('the GLSL loop caps candidate reads even if the cell header advertises more', () => {
  for (const spec of [LIGHT_GRID_DESKTOP, LIGHT_GRID_MOBILE]) {
    const sources = Array.from({ length: spec.cap + 3 }, (_, i) => light(String(i)));
    const field = buildLightField(sources, { ...spec, cap: sources.length });
    const p = [4, 0, 0];
    const single = probe(buildLightField(sources.slice(0, 1), spec)).at(p)[0]!;
    const capped = probe(field, spec.cap).at(p)[0]!;
    assert.ok(single > .75 && single < .85 && Math.abs(capped / single - spec.cap) < 1e-8, String(capped));
  }
});

test('facade spill stays close to each fitting and winter ground scatter is independent of view angle', t => {
  const a = { ...light('a'), halfSpace: { normal: [1, 0, 0] as const, offset: -8 } };
  const p = probe(buildLightField([a, light('b', [0, 10.15, 32])], LIGHT_GRID_DESKTOP));
  const normal = [1, 0, 0];
  const acrossRoad = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const acrossRoadLit = acrossRoad.at([-25, 6, 0], normal, true)[0]!;
  const acrossRoadDark = acrossRoad.at([-25, 6, 13], normal, true)[0]!;
  assert.ok(acrossRoadLit > .2 && acrossRoadDark === 0, JSON.stringify({ acrossRoadLit, acrossRoadDark }));
  const near = p.at([-7.99, 8, 0], normal, true)[0]!;
  const between = p.at([-7.99, 8, 16], normal, true)[0]!;
  assert.ok(near > .65 && between < near * .15, JSON.stringify({ near, between }));
  assert.deepEqual(p.at([-8.1, 8, 0], normal, true), zero);
  assert.deepEqual(p.at([-7.99, 8, 0], [-1, 0, 0], true), zero);
  const road = [4, 0, 0];
  const ground = [.078, .078, .078];
  const lightAtRoad = p.at(road)[0]!;
  assert.equal(p.ground(road, ground)[0], lightAtRoad * ground[0]!);
  const winter = weatherFrame('snow');
  const snowGrazing = p.ground(road, ground, winter, .015)[0]!;
  const snowOblique = p.ground(road, ground, winter, .5)[0]!;
  const snowLight = .80 * lightAtRoad;
  assert.ok(Math.abs(snowGrazing - snowLight / (1 + snowLight / .22)) < 1e-10 && snowGrazing === snowOblique);
  t.diagnostic(JSON.stringify({ near, between, acrossRoadLit, acrossRoadDark, snowGrazing, snowOblique }));
});

function frame(elevationDeg: number, snowCover = 0) {
  return { timeMs: 0, sun: { ...solarPosition(0), elevationDeg },
    weather: { ...CLEAR_STATE, snowCover },
    rig: { ...skyRig(elevationDeg, 0, CLEAR_STATE, REFERENCE), lampLevel: 1 } };
}
function compile(material: THREE.Material, squeezed = false) {
  const shader = { ...THREE.ShaderLib.lambert, uniforms: {} as Record<string, THREE.IUniform> };
  if (squeezed) shader.fragmentShader = squeezeGlslText(shader.fragmentShader) ?? shader.fragmentShader;
  material.onBeforeCompile(shader as never, undefined as never);
  return shader;
}

// Evaluate the expression installed on the actual ground receiver, supplying
// the linear albedo that the preceding texture and weather stages produce.
const receipts = new Map<string, string>();
function receiverContribution(surface: string): string {
  const cached = receipts.get(surface);
  if (cached) return cached;
  const scene = new THREE.Scene();
  const material = new THREE.MeshLambertMaterial();
  addRoofShade(material);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material);
  mesh.name = surface;
  if (surface === 'landmarks-brickRed') {
    mesh.geometry.setAttribute('midlandNight', new THREE.BufferAttribute(new Float32Array(8), 2));
  }
  scene.add(mesh);
  const street = createStreetLights([]);
  const unregister = registerLights(scene, [light()]);
  const layer = createNightLightLayer(scene, LIGHT_GRID_DESKTOP);
  try {
    layer.register(street, null);
    layer.scan();
    layer.setFrame(scene, frame(-20));
    const shader = compile(mesh.material).fragmentShader;
    const contribution = shader.match(/reflectedLight\.directDiffuse \+= (night\w+\([^;]+);/);
    assert.ok(contribution);
    const receipt = contribution[1]!.replace('material.diffuseColor', 'diffuse');
    receipts.set(surface, receipt);
    return receipt;
  } finally {
    layer.dispose();
    unregister();
    street.dispose();
    material.dispose();
    mesh.geometry.dispose();
  }
}

function weatherFrame(name: string) {
  const weather = weatherState(forcedObservation(name));
  return { ...frame(-20), weather, rig: skyRig(-20, 0, weather, REFERENCE) };
}

function readFixture<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(`../src/data/kx-${name}.json`, import.meta.url), 'utf8')) as T;
}

let cityLights: ReturnType<typeof lightSourcesFor> | undefined;
function kingsCrossLights() {
  if (cityLights) return cityLights;
  const scene = new THREE.Scene();
  const terrain = createTerrain(readFixture<TerrainFile>('terrain'));
  const city = addCity(scene, readFixture<KxData>('track'), readFixture<CityData>('city'), { terrain, nightEffects: true });
  cityLights = lightSourcesFor(scene).filter(source => source.tags.includes('road') || source.tags.includes('mast'));
  city.dispose();
  return cityLights;
}

// The field's own terms, without the P1 floor that the pilot-floor tests cover.
function withoutPilotFloor<T extends { tags: readonly string[] }>(sources: readonly T[]): T[] {
  return sources.map(source => ({ ...source, tags: source.tags.filter(tag => tag !== 'euston-p1') }));
}

test('cleared snow carriageways take asphalt light with a soft far-lane shoulder', t => {
  const field = buildLightField(withoutPilotFloor(kingsCrossLights()), LIGHT_GRID_DESKTOP);
  const meter = probe(field);
  const snow = weatherFrame('snow');
  const slush = [.10, .11, .12];
  const foreground = [-67.16, 1.19, 135.33];
  const mid = [-65.86, 1.02, 119.89];
  const asphalt = meter.ground(foreground, slush, snow, .015, 'city-asphalt');
  const paint = meter.ground(foreground, [.8, .8, .8], snow, .015, 'city-paint');
  const pavement = meter.ground(foreground, [.65, .65, .65], snow, .015, 'city-pavement');
  const shoulder = meter.ground(mid, slush, snow, .015, 'city-asphalt');
  t.diagnostic(JSON.stringify({ asphalt, paint, pavement, shoulder }));
  // S2f lifts the pool under the head (main's kerb peak): band moved up by .005.
  assert.ok(asphalt[0]! > .028 && asphalt[0]! < .055, String(asphalt));
  assert.deepEqual(paint, asphalt);
  assert.ok(pavement[0]! > .14);
  // S2f starts the shoulder beyond the beam's end to restore main's dark snow
  // gaps between lamps (.005 -> .002); the far lane keeps a weak shoulder.
  assert.ok(shoulder[0]! > .002 && shoulder[0]! < .35 * asphalt[0]!, String(shoulder));
  assert.deepEqual(meter.ground(foreground, slush, weatherFrame('clear'), .015, 'city-asphalt'),
    meter.ground(foreground, slush, weatherFrame('clear'), .015, 'city-pavement'));
});

test('a sodium pool keeps its amber where a forecourt mast overlaps it, and the mast adds to the P1 floor', t => {
  const sources = kingsCrossLights();
  const mast = sources.find(source => source.id === 'kx/mast/2')!;
  const all = probe(buildLightField(sources, LIGHT_GRID_DESKTOP));
  const lamps = probe(buildLightField(sources.filter(source => !source.tags.includes('mast')), LIGHT_GRID_DESKTOP));
  const spill = probe(buildLightField([mast], LIGHT_GRID_DESKTOP));
  const paving = [.40, .40, .40];
  const luma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  // The back lobe of P1 post 1043 beside and at the foot of mast 2 (south front).
  const points = [[52.3, -.2, 21.5], [54.5, -.15, 18.3]];
  const readings = ['clear', 'rain', 'fog', 'snow'].flatMap(weather => points.map(p => {
    const state = weatherFrame(weather);
    const total = all.ground(p, paving, state);
    return { weather, p, total, amber: (total[0]! - total[2]!) / total[0]!,
      lamps: lamps.ground(p, paving, state), mast: spill.ground(p, paving, state) };
  }));
  t.diagnostic(JSON.stringify(readings));
  for (const r of readings) {
    assert.ok(r.amber > .5, JSON.stringify(r));
    if (r.weather === 'clear') assert.ok(luma(r.total) >= (luma(r.lamps) + luma(r.mast)) * (1 - 1e-6), JSON.stringify(r));
  }
});

test('on lying snow a mast spill overlapping a sodium pool takes the pool’s hue entirely', t => {
  const sources = kingsCrossLights();
  const all = probe(buildLightField(sources, LIGHT_GRID_DESKTOP));
  const lamps = probe(buildLightField(sources.filter(source => !source.tags.includes('mast')), LIGHT_GRID_DESKTOP));
  const white = [.78, .80, .82];
  const snow = weatherFrame('snow');
  // The south-front sodium pool of P1 post 1043, running into mast 2's spill.
  const readings = Array.from({ length: 9 }, (_, i) => [52.3 + .5 * i, -.2, 21.5 - .8 * i]).map(p => {
    const total = all.ground(p, white, snow), pool = lamps.ground(p, white, snow);
    return { p, total, pool, blue: total[2]! / total[0]!, poolBlue: pool[2]! / pool[0]! };
  });
  t.diagnostic(JSON.stringify(readings));
  // Inside the pool, where the sodium light is at least five times the mast's,
  // the mast still adds light but no blue beyond the pool's own.
  const inside = readings.filter(r => r.total[0]! - r.pool[0]! <= .2 * r.pool[0]!);
  assert.ok(inside.some(r => r.total[0]! > r.pool[0]! * 1.05), JSON.stringify(inside));
  for (const r of inside) assert.ok(r.blue <= r.poolBlue * (1 + 1e-6), JSON.stringify(r));
});

test('in rain and ground fog a mast spill overlapping a sodium pool keeps the pool’s amber', t => {
  const sources = kingsCrossLights();
  const all = probe(buildLightField(sources, LIGHT_GRID_DESKTOP));
  const lamps = probe(buildLightField(sources.filter(source => !source.tags.includes('mast')), LIGHT_GRID_DESKTOP));
  const paving = [.40, .40, .40];
  const amber = (c: number[]) => (c[0]! - c[2]!) / c[0]!;
  // The back lobe of P1 post 1043 beside and at the foot of mast 2 (south front).
  const readings = ['rain', 'fog'].flatMap(weather => [[52.3, -.2, 21.5], [54.5, -.15, 18.3]].map(p => {
    const state = weatherFrame(weather);
    const total = all.ground(p, paving, state), pool = lamps.ground(p, paving, state);
    return { weather, p, total, pool, amber: amber(total), poolAmber: amber(pool) };
  }));
  t.diagnostic(JSON.stringify(readings));
  // Inside the pool the overlap keeps the pool's own amber; at the mast's
  // foot, where the mast's spill outweighs the pool, most of it (S2g: .82, .65).
  for (const r of readings) {
    assert.ok(r.total[0]! > r.pool[0]! * 1.05, JSON.stringify(r));
    assert.ok(r.amber >= r.poolAmber * (r.p[0] === 52.3 ? .99 : .75), JSON.stringify(r));
  }
});

test('clustered side-street lanterns on Pancras Road stay below the Euston Road pools', t => {
  const meter = probe(buildLightField(kingsCrossLights(), LIGHT_GRID_DESKTOP));
  const luma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  // Posts 109, 110 and 983 stand within 8 m of one another about (-60, 0).
  const pancras = Array.from({ length: 21 * 21 }, (_, i) => [-70 + (i % 21), -.25, -10 + Math.floor(i / 21)]);
  // Euston Road: along lamp 1031's pool and across P1 post 1041's.
  const euston = [...Array.from({ length: 31 }, (_, i) => [-67.2, 1.2, 128 + .3 * i]),
    ...Array.from({ length: 31 }, (_, i) => [10 + i, -.2, 50])];
  const peak = (points: number[][]) => Math.max(...points.map(p => luma(meter.at(p))));
  const side = peak(pancras), main = peak(euston);
  t.diagnostic(JSON.stringify({ side, main }));
  assert.ok(main > .5 && side < .95 * main, JSON.stringify({ side, main }));
  assert.ok(side > .3, String(side));
});

test('Pancras Road carriageway fills evenly in sodium amber, below Euston Road, in clear air and rain', t => {
  const meter = probe(buildLightField(kingsCrossLights(), LIGHT_GRID_DESKTOP));
  const luma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  const asphalt = [.18, .18, .17];
  // Posts 109, 110 and 983 stand within 8 m of one another about (-60, 0).
  const pancras = Array.from({ length: 21 * 21 }, (_, i) => [-70 + (i % 21), -.25, -10 + Math.floor(i / 21)]);
  // Euston Road: along lamp 1031's pool and across P1 post 1041's.
  const euston = [...Array.from({ length: 31 }, (_, i) => [-67.2, 1.2, 128 + .3 * i]),
    ...Array.from({ length: 31 }, (_, i) => [10 + i, -.2, 50])];
  const rows = ['clear', 'rain'].map(weather => {
    const state = weatherFrame(weather);
    const road = pancras.map(p => meter.ground(p, asphalt, state, .015, 'city-asphalt'));
    const lit = road.filter(c => luma(c) > 1e-4);
    return { weather, mean: road.reduce((a, c) => a + luma(c), 0) / road.length,
      peak: Math.max(...road.map(luma)), minGreen: Math.min(...lit.map(c => c[1]! / c[0]!)),
      euston: Math.max(...euston.map(p => luma(meter.ground(p, asphalt, state, .015, 'city-asphalt')))) };
  });
  t.diagnostic(JSON.stringify(rows));
  // S2g lit this grid at a mean of .057 with a minimum green/red of .26.
  for (const r of rows) {
    assert.ok(r.mean > .085, JSON.stringify(r));
    assert.ok(r.minGreen > .5, JSON.stringify(r));
    assert.ok(r.peak < r.euston, JSON.stringify(r));
  }
});

test('a side-street lantern stretches its pool down its street', t => {
  const lantern = { ...light('side', [0, 6, 0]), tags: ['road'] };
  const meter = probe(buildLightField([lantern], LIGHT_GRID_DESKTOP));
  const luma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  // The head aims along +x across its street; the street runs along z.
  // Distant streets read as lines of light, not separate pools: 20 m down the
  // street keeps a few percent of the pool's centre (S2g: 1%).
  const row = Array.from({ length: 13 }, (_, i) => luma(meter.at([2, 0, 2 * i])));
  t.diagnostic(JSON.stringify(row));
  assert.ok(row[0]! > .3, String(row));
  assert.ok(row[10]! > .025 * row[0]!, String(row));
});

test('a lantern a few metres from a wall levels off below white there', t => {
  const meter = probe(buildLightField(kingsCrossLights(), LIGHT_GRID_DESKTOP));
  const luma = (c: number[]) => .2126 * c[0]! + .7152 * c[1]! + .0722 * c[2]!;
  // Overview pixels that clipped to white in snow and rain (city-stone, city-panel).
  const walls = [[[141.66, 9.06, -323.57], [1, 0, .007]], [[164.8, 6.89, -240.44], [-.039, 0, .999]]];
  const readings = walls.map(([p, n]) => luma(meter.at(p!, n!, true)));
  t.diagnostic(JSON.stringify(readings));
  // S2g lit them at 3.9 and 2.3.
  for (const l of readings) assert.ok(l > .3 && l < .6, String(readings));
});

test('a Euston Road pool outside P1 ends across the far lanes and keeps its peak by the post in fog', t => {
  const meter = probe(buildLightField(kingsCrossLights(), LIGHT_GRID_DESKTOP));
  const slush = [.10, .11, .12];
  // Street lamp 1031 (z 135.1) throws south across the road; the Midland camera looks along this line.
  const line = Array.from({ length: 47 }, (_, i) => 127.9 + .2 * i);
  const rows = ['clear', 'fog'].map(weather => {
    const row = line.map(z => meter.ground([-67.2, 1.2, z], slush, weatherFrame(weather), .015, 'city-asphalt')[0]!);
    const peak = Math.max(...row);
    // z 129.4 is the far lanes (main's y640), 6 m in front of the post.
    return { weather, peakZ: line[row.indexOf(peak)]!, peak, far: row[line.indexOf(129.5)]! / peak };
  });
  t.diagnostic(JSON.stringify(rows));
  for (const r of rows) assert.ok(r.peakZ > 134.0 && r.peakZ < 136.0, JSON.stringify(r));
  assert.ok(rows[0]!.far < .15 && rows[0]!.peak > .06, JSON.stringify(rows));
});

test('cleared snow on Euston Road keeps dark gaps between lamps and a tan pool beside the head', t => {
  const meter = probe(buildLightField(kingsCrossLights(), LIGHT_GRID_DESKTOP));
  const slush = [.10, .11, .12];
  const at = (p: number[], weather: string) => meter.ground(p, slush, weatherFrame(weather), .015, 'city-asphalt');
  // Street lamp 1031 stands at z 135.1; the Midland camera looks along this line.
  const line = Array.from({ length: 34 }, (_, i) => 130.7 + .2 * i);
  const peaks = ['clear', 'snow'].map(weather => {
    const row = line.map(z => at([-67.2, 1.2, z], weather)[0]!);
    return { weather, z: line[row.indexOf(Math.max(...row))]!, peak: Math.max(...row) };
  });
  const pool = at([-67.2, 1.2, 135.3], 'snow');
  // Between 1031 and 1032 (x -82) on the same cleared lane.
  const gap = Math.max(...[[-73, 1.3, 138], [-75, 1.3, 136.5], [-71.5, 1.3, 139.3]].map(p => at(p, 'snow')[0]!));
  t.diagnostic(JSON.stringify({ peaks, pool, gap }));
  for (const { z } of peaks) assert.ok(z > 134.3 && z < 136.0, JSON.stringify(peaks));
  assert.ok(peaks[0]!.peak > .105, JSON.stringify(peaks));
  assert.ok(pool[0]! > 4 * gap, JSON.stringify({ pool, gap }));
  assert.ok(pool[2]! > .30 * pool[0]!, String(pool));
});

test('forecourt masts keep a bright core and leave a dark gap between adjacent columns', t => {
  const masts = kingsCrossLights().filter(source => source.tags.includes('mast'));
  const [a, b] = masts.slice(1);
  assert.ok(a && b);
  const meter = probe(buildLightField(masts, LIGHT_GRID_DESKTOP));
  const foot = (source: typeof a) => [source.pos[0], source.footY, source.pos[2]];
  const first = foot(a), second = foot(b);
  const midpoint = first.map((v,i) => (v + second[i]!) * .5);
  const at = (p: number[]) => meter.ground(p, [.4, .4, .4]);
  const centre = at(first), gap = at(midpoint);
  t.diagnostic(JSON.stringify({ first, second, centre, gap }));
  assert.ok(centre[0]! > .085 && centre[0]! < .105);
  assert.ok(gap[0]! > .05 * centre[0]! && gap[0]! < .13 * centre[0]!, String(gap));
  assert.ok(centre[0]! > centre[2]! && centre[0]! < 1.20 * centre[2]!);
});

test('upward masonry caps in a mixed façade batch reject below-head light', t => {
  const source = kingsCrossLights().find(s => s.tags.includes('mast'))!;
  const meter = probe(buildLightField([source], LIGHT_GRID_DESKTOP));
  const [x, , z] = source.pos;
  const point = [x + 1, source.footY + 2, z];
  const cap = meter.at(point, up, true);
  const wall = meter.at(point, [-1, 0, 0], true);
  t.diagnostic(JSON.stringify({ cap, wall }));
  assert.deepEqual(cap, zero);
  assert.ok(wall[0]! > .01);
});

test('the Midland’s lower brick picks up a local sodium shoulder above the arcade only', t => {
  const source = light();
  const meter = probe(buildLightField([source], LIGHT_GRID_DESKTOP));
  const plate = [1, 0, 0], local = [-28, 3, 15], distant = [-28, 3, 29], upper = [-28, 7, 0];
  const sample = (p: number[]) => meter.midland(p, plate, p[1]!);
  const lower = sample(local), gap = sample(distant), high = meter.midland(upper, plate, 12);
  t.diagnostic(JSON.stringify({ lower, gap, high }));
  assert.ok(lower[0]! > .09 && lower[0]! < .24 && lower[1]! > .045);
  assert.deepEqual(gap, zero);
  assert.ok(high[0]! > .2);
  assert.deepEqual(high, meter.at(upper, plate, true));
});

// Main's P1 pilot for one post, exactly as night-lighting-p1.ts evaluates it.
const pilotProgram = new Glsl('float coverGroundAt(vec3 p) { return 0.0; }\n' + EUSTON_P1_OPTIC);
function pilotAt(source: ReturnType<typeof light>, p: number[], n: number[], wall: number[], facade: boolean) {
  return pilotProgram.call('eustonP1One', [p, n, [...source.pos], [Math.cos(source.yaw), -Math.sin(source.yaw)], wall, facade],
    { vars: {} }) as number[];
}
// Float32 packing of the lamp record moves the field by a few parts in 1e8.
const atLeast = (field: number[], pilot: number[]) => field.every((v, i) => v >= pilot[i]! * (1 - 1e-6) - 1e-12);

test('P1 posts light the Midland front at least as the pilot did on main, between posts too', t => {
  const post = { ...light(), tags: ['road', 'euston-road', 'euston-p1'] };
  const meter = probe(buildLightField([post], LIGHT_GRID_DESKTOP));
  // A front facing the post 8 m behind it: the register() uniform carries the
  // facet offset less 0.025 m, P1 subtracts the same margin itself.
  const plane = [1, 0, -8.025], wall = [1, 0, -8];
  const rows = [0, 8, 16, 24].flatMap(z => [2, 5].map(y => {
    const p = [-7.99, y, z], n = [1, 0, 0];
    return { p, field: meter.front(p, n, plane), brick: meter.front(p, n, plane, 1), pilot: pilotAt(post, p, n, wall, true) };
  }));
  const cap = [-6, 4, 10];
  const capField = meter.front(cap, up, plane), capPilot = pilotAt(post, cap, up, wall, true);
  t.diagnostic(JSON.stringify({ rows, capField, capPilot }));
  for (const { field, brick, pilot } of rows) assert.ok(atLeast(field, pilot) && atLeast(brick, pilot), JSON.stringify({ field, brick, pilot }));
  // Between posts (16 m along the front) the old taper left nothing.
  assert.ok(rows.filter(r => r.p[2] === 16).every(r => r.pilot[0]! > .01));
  // Upward caps: P1's façade lobe needs a street-facing normal, so the gate undercuts nothing.
  assert.deepEqual([capField, capPilot], [zero, zero]);
  // Other posts keep the tapered field and no floor.
  const plain = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  assert.deepEqual(plain.front([-7.99, 2, 16], [1, 0, 0], plane), zero);
});

test('P1 posts light the ground at least as the pilot did on main in every weather', t => {
  const post = { ...light(), tags: ['road', 'euston-road', 'euston-p1'] };
  const meter = probe(buildLightField([post], LIGHT_GRID_DESKTOP));
  const albedo = [.078, .078, .078];
  // Pool centre, the back lobe on the paving, the pool's flank and a gap along the road.
  const points = [[4, 0, 0], [-6, 0, 0], [8, 0, 6], [4, 0, 14]];
  const readings = ['clear', 'rain', 'fog', 'snow'].flatMap(weather => points.flatMap(p =>
    ['city-asphalt', 'city-pavement'].map(surface => {
      const pilot = pilotAt(post, p, up, [0, 0, 0], false).map((v, i) => v * albedo[i]!);
      return { weather, p, surface, pilot, field: meter.ground(p, albedo, weatherFrame(weather), .5, surface) };
    })));
  t.diagnostic(JSON.stringify(readings));
  for (const r of readings) assert.ok(atLeast(r.field, r.pilot), JSON.stringify(r));
  // The halved field alone fell to about half of P1 in the pool's centre.
  assert.ok(readings.filter(r => r.weather === 'clear' && r.p === points[0]).every(r => r.field[0]! >= r.pilot[0]! && r.pilot[0]! > .1));
});

test('fresh snow lights up under a mast and a street lamp and rolls off at overlapping peaks', t => {
  const sources = kingsCrossLights();
  const mast = sources.find(source => source.tags.includes('mast'))!;
  const post = EUSTON_P1_ROW[0];
  const lamp = withoutPilotFloor(sources).find(source => source.id === post.id)!;
  const snow = weatherFrame('snow');
  const white = [.78, .80, .82];
  const ground = [
    { source: mast, point: [mast.pos[0], mast.footY, mast.pos[2]], clear: [.40, .40, .40], min: .085 },
    { source: lamp, point: [post.x, lamp.footY, post.z], clear: [.078, .078, .078], min: .145 },
  ];
  const readings = ground.map(({ source, point, clear, min }) => {
    const field = buildLightField([source], LIGHT_GRID_DESKTOP);
    const meter = probe(field);
    const weak = probe(field, field.spec.cap, 0, .04);
    return { id: source.id, min, clear: meter.ground(point, clear), snow: meter.ground(point, white, snow),
      weakReflectance: weak.ground(point, white, snow)[0]! / weak.at(point)[0]! };
  });
  const overlap = probe(buildLightField(Array.from({ length: 8 }, (_, i) => light(String(i))), LIGHT_GRID_DESKTOP))
    .ground([4, 0, 0], white, snow);
  t.diagnostic(JSON.stringify({ readings, overlap }));
  for (const entry of readings) {
    assert.ok(entry.snow[0]! > entry.min && entry.snow[0]! > entry.clear[0]!, JSON.stringify(entry));
    assert.ok(entry.weakReflectance > .70 && entry.weakReflectance < .80, JSON.stringify(entry));
  }
  assert.ok(Math.max(...overlap) > .18 && Math.max(...overlap) < .22, String(overlap));
});

test('forecourt masts light the foot softly and equally in every horizontal direction', t => {
  const mast = kingsCrossLights().find(source => source.tags.includes('mast'))!;
  const meter = probe(buildLightField([mast], LIGHT_GRID_DESKTOP));
  const [x, , z] = mast.pos, y = mast.footY;
  const samples = [[x, y, z], [x + 3, y, z], [x - 3, y, z], [x, y, z + 3], [x, y, z - 3]];
  const paving = [['clear', .40], ['rain', .27], ['fog', .36], ['snow', .66]] as const;
  const byWeather = Object.fromEntries(paving.map(([weather, albedo]) => [weather, samples.map(p =>
    meter.ground(p, [albedo, albedo, albedo], weatherFrame(weather))[0]!)]));
  const clearPeak = meter.ground(samples[0]!, [.40, .40, .40]);
  t.diagnostic(JSON.stringify({ mast: mast.pos, clearPeak, byWeather }));
  assert.ok(clearPeak[0]! > .085 && clearPeak[0]! < .105, String(clearPeak));
  assert.ok(Math.abs(clearPeak[1]! / clearPeak[0]! - .96) < 1e-7 &&
    Math.abs(clearPeak[2]! / clearPeak[0]! - .85) < 1e-7, String(clearPeak));
  for (const readings of Object.values(byWeather)) {
    const [foot, ...around] = readings;
    assert.ok(foot! > .001 && foot! < .11, String(readings));
    assert.ok(around.every(v => v > .75 * foot! && v < foot! && Math.abs(v - around[0]!) < 1e-5), String(readings));
  }
});

test('Euston Road has bounded warm pools and a dark gap on the actual lamp row', t => {
  const sources = withoutPilotFloor(kingsCrossLights());
  const desktop = buildLightField(sources, LIGHT_GRID_DESKTOP);
  const mobile = buildLightField(sources, LIGHT_GRID_MOBILE);
  const meter = probe(desktop);
  const [post, nextPost] = EUSTON_P1_ROW;
  const a = sources.find(source => source.id === post.id)!;
  const b = sources.find(source => source.id === nextPost.id)!;
  const at = (x: number, z: number, y: number) => meter.ground([x, y, z], [.078, .078, .078]);
  const inRoad = (source: typeof a) => [source.pos[0] + Math.cos(source.yaw) * 4, source.pos[2] - Math.sin(source.yaw) * 4];
  const [ax, az] = inRoad(a), [bx, bz] = inRoad(b);
  const foot = at(post.x, post.z, a.footY);
  const underHead = at(a.pos[0], a.pos[2], a.footY);
  const pool = at(ax!, az!, a.footY);
  const gap = at((ax! + bx!) / 2, (az! + bz!) / 2, (a.footY + b.footY) / 2);
  const surrounding = sources.filter(source => Math.hypot(source.pos[0] - (ax! + bx!) / 2, source.pos[2] - (az! + bz!) / 2) < 32);
  const contributions = surrounding.map(source => ({ id: source.id, pos: source.pos, yaw: source.yaw, optic: source.optic, gap:
    probe(buildLightField([source], LIGHT_GRID_DESKTOP)).ground([(ax! + bx!) / 2, (a.footY + b.footY) / 2, (az! + bz!) / 2], [.078, .078, .078])[0] }));
  const grids = [desktop, mobile].map(f => ({ width: f.gridWidth, height: f.gridHeight, peak: f.maxCandidates, overflow: f.overflowingCells }));
  const gapRatio = gap[0]! / pool[0]!;
  const greenRatio = pool[1]! / pool[0]!;
  t.diagnostic(JSON.stringify({ foot, underHead, pool, gap, gapRatio, greenRatio, contributions, grids }));
  assert.ok(pool[0]! > .04 && pool[0]! < .12 && foot[0]! < .12);
  assert.ok(gapRatio < .10, String(gapRatio));
  assert.ok(pool[0]! > pool[1]! && pool[1]! > pool[2]! && pool[2]! > .14 * pool[0]!);
  assert.ok(greenRatio > .53 && greenRatio < .58, String(greenRatio));
});

test('wet weather darkens the ground field only through the receiving albedo, for street lamps and masts', t => {
  const mast = kingsCrossLights().find(source => source.tags.includes('mast'))!;
  const wet = weatherFrame('rain');
  const cases = [
    { meter: probe(buildLightField([light()], LIGHT_GRID_DESKTOP)), p: [4, 0, 0], surface: 'city-asphalt', albedo: [.078, .078, .078] },
    { meter: probe(buildLightField([light()], LIGHT_GRID_DESKTOP)), p: [4, 0, 0], surface: 'city-plaza', albedo: [.078, .078, .078] },
    { meter: probe(buildLightField([mast], LIGHT_GRID_DESKTOP)), p: [mast.pos[0] + 2, mast.footY, mast.pos[2]], surface: 'city-plaza', albedo: [.27, .27, .27] },
  ];
  const readings = cases.map(({ meter, p, surface, albedo }) => ({ surface,
    dry: meter.ground(p, albedo, weatherFrame('clear'), .5, surface), wet: meter.ground(p, albedo, wet, .5, surface) }));
  t.diagnostic(JSON.stringify({ wetness: wet.weather.wet, readings }));
  assert.ok(wet.weather.wet > .5);
  for (const { dry, wet: rain } of readings) {
    assert.ok(dry[0]! > .005, String(dry));
    assert.deepEqual(rain, dry);
  }
});

test('ground fog softens the pool shoulder and keeps its centre strength before camera fog', t => {
  const meter = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const asphalt = [.078, .078, .078];
  const fog = weatherFrame('fog');
  // Hold wetness constant to isolate the optical footprint from damp paving.
  fog.weather = { ...fog.weather, wet: 0 };
  // S2g moves the fog core from the lobe's peak 4 m out to the pool's peak
  // beside the post (main's fog maximum), so the centre is probed 1 m out.
  const points = [[1, 0, 0], [4, 0, 9.2], [4, 0, 18]];
  const dry = points.map(p => meter.ground(p, asphalt)[0]!);
  const misted = points.map(p => meter.ground(p, asphalt, fog)[0]!);
  t.diagnostic(JSON.stringify({ fogAmount: fog.rig.fogAmount, dry, misted }));
  assert.ok(Math.abs(misted[0]! / dry[0]! - 1) < .02, JSON.stringify({ dry, misted }));
  assert.ok(misted[1]! > dry[1]! * 1.10 && misted[1]! < .5 * misted[0]!);
  assert.equal(misted[2], 0);
});

test('winter field light crosses the tyre, kerb and pavement without copying their hard albedo bands', t => {
  const meter = probe(buildLightField([light()], LIGHT_GRID_DESKTOP));
  const snow = weatherFrame('snow');
  const p = [4, 0, 0];
  // Approximate the range after the road's skinny tyre and kerb snow masks
  // and the pavement's much higher snow retention. Hold geometry constant.
  const bands = [.06, .09, .23, .65];
  const grazing = bands.map(a => meter.ground(p, [a, a, a], snow, .015)[0]!);
  const overview = bands.map(a => meter.ground(p, [a, a, a], snow, .5)[0]!);
  t.diagnostic(JSON.stringify({ cover: snow.weather.snowCover, grazing, overview }));
  assert.ok(Math.max(...grazing, ...overview) / Math.min(...grazing, ...overview) < 1.10);
  assert.ok(grazing[0]! > .145 && overview[3]! < .18);
});

test('night receivers preserve prior hooks and the squeezed anchors, hide all decals and restore original programs in daylight and Perth', () => {
  const scene = new THREE.Scene(), perth = new THREE.Scene();
  const original = new THREE.MeshLambertMaterial();
  original.customProgramCacheKey = () => 'fixture';
  addRoofShade(original);
  const ground = ['city-asphalt', 'city-pavement', 'city-plaza', 'terrain-ground'].map(name => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), original);
    mesh.name = name;
    scene.add(mesh);
    return mesh;
  });
  const sharedInPerth = new THREE.Mesh(ground[0]!.geometry, original);
  perth.add(sharedInPerth);
  const cityRoof = new THREE.Mesh(ground[0]!.geometry, original);
  cityRoof.name = 'city-roof';
  scene.add(cityRoof);
  const street = createStreetLights([{ x: 0, y: 0, z: 0, height: 10, yaw: 0, kind: 0, slope: [0, 0] },
    { x: 10, y: 0, z: 0, height: 10, yaw: 0, kind: 0, slope: [0, 0] }], { poolSegments: 12, receiverPoolAt: () => true });
  const pools = street.group.getObjectByName('street-lamp-pools') as THREE.InstancedMesh;
  const unregister = registerLights(scene, [light('kx/street/0'), light('kx/euston-north/0', [10, 10.15, 0])]);
  const layer = createNightLightLayer(scene, LIGHT_GRID_DESKTOP);
  try {
    layer.register(street, null);
    layer.scan();
    const source = compile(original), sourceKey = original.customProgramCacheKey();
    street.setLevel(1);
    const total = street.counts();
    layer.setFrame(scene, frame(20, 1));
    assert.ok(ground.every(m => m.material === original) && pools.visible, 'gloom or snow by day uses the original path');
    layer.setFrame(scene, frame(-20, 1));
    assert.ok(ground.every(m => m.material !== original));
    assert.equal(sharedInPerth.material, original);
    assert.equal(cityRoof.material, original);
    const night = ground[0]!.material;
    const raw = compile(night), squeezed = compile(night, true);
    for (const shader of [raw, squeezed]) {
      assert.ok(shader.fragmentShader.indexOf('float coverGroundAt') < shader.fragmentShader.indexOf('vec3 nightLightAt'));
      assert.match(shader.fragmentShader, /reflectedLight\.directDiffuse \+= nightGroundDiffuse\(nightLightAt\(nightP, nightN, false, vec3\(0\.0\), true, 0\.0\), material\.diffuseColor, true\);/);
      assert.ok(shader.fragmentShader.indexOf('reflectedLight.directDiffuse *= roofK.a') <
        shader.fragmentShader.indexOf('reflectedLight.directDiffuse += nightGroundDiffuse'));
      assert.doesNotMatch(shader.fragmentShader, /uEustonP1/);
      assert.ok(shader.uniforms.uNightLightGrid && shader.uniforms.uNightLightData);
      assert.deepEqual([...shader.fragmentShader.matchAll(/uniform sampler2D (u\w+);/g)].map(m => m[1]),
        ['uCoverMap', 'uCoverSoft', 'uCoverRooms', 'uNightLightData', 'uNightLightGrid']);
    }
    assert.ok(night.customProgramCacheKey().startsWith(sourceKey) && night.customProgramCacheKey() !== sourceKey);
    const fog = weatherFrame('fog');
    layer.setFrame(scene, fog);
    assert.equal(ground[0]!.material, night);
    assert.deepEqual(raw.uniforms.uNightLightWeather!.value.toArray(), [fog.weather.wet, fog.rig.fogAmount]);
    assert.equal(pools.visible, false);
    assert.deepEqual(street.counts(), { lamps: 2, draws: total.draws - 1, triangles: total.triangles - 2 * 288 });
    layer.setFrame(perth, frame(-20));
    assert.ok(ground.every(m => m.material === original) && pools.visible);
    assert.deepEqual(raw.uniforms.uNightLightLevels!.value.toArray(), [0, 0]);
    assert.deepEqual(raw.uniforms.uNightLightWeather!.value.toArray(), [0, 0]);
    assert.equal(raw.uniforms.uNightLightGrid!.value, null);
    layer.setFrame(scene, frame(-20));
    assert.equal(ground[0]!.material, night);
    assert.ok(raw.uniforms.uNightLightGrid!.value);
    layer.setFrame(scene, frame(20, 1));
    assert.ok(ground.every(m => m.material === original) && pools.visible);
    assert.deepEqual(compile(original), source);
    assert.equal(original.customProgramCacheKey(), sourceKey);
  } finally {
    layer.dispose();
    unregister();
    street.dispose();
  }
});
