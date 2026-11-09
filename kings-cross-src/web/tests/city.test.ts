// web/src/city.ts and the city block at the end of web/src/materials.ts: the facade textures, the city's
// materials, the tree mesh and addCity (one mesh per material). Node has no canvas, so textures are null here
// and the materials fall back to their average colour; what is tested is the specs (sizes, texel density),
// the painters on a recording context (sizes and places of the windows, a whole number of bricks, repeatable),
// and the scene graph addCity makes.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as THREE from 'three';
import { buildCity, CITY_KEYS, FACADE, FACADE_TEXELS_PER_M, LAYER_LIFT, PAGE_DRAPE } from '../../core/city.ts';
import type { CityData, CityKey, FacadeKey, TreeSpot } from '../../core/city.ts';
import type { KxData } from '../../core/osm.ts';
import { railSegments } from '../../core/scene.ts';
import { tunnelMouths } from '../../core/landmarks.ts';
import { createTerrain, terrainFromFunction } from '../../core/terrain.ts';
import { addCity, geometryOf, treeGeometry, treeMesh } from '../src/city.ts';
import type { CityOptions } from '../src/city.ts';
import { CITY_PAINTERS, CITY_TEXTURES, cityMaterial, cityTexture, material, texelsPerMetre } from '../src/materials.ts';
import type { CityMaterialName, CityTextureName } from '../src/materials.ts';
import { portalHole } from '../src/portals.ts';
import { addTerrain, GROUND_Y } from '../src/world.ts';

const data: KxData = JSON.parse(readFileSync(new URL('../src/data/kx-track.json', import.meta.url), 'utf8'));
const city: CityData = JSON.parse(readFileSync(new URL('../src/data/kx-city.json', import.meta.url), 'utf8'));
const close = (a: number, b: number, eps: number, what = ''): void => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} != ${b} (within ${eps})`);
const textureNames = Object.keys(CITY_TEXTURES) as CityTextureName[];
const facadeKeys = Object.keys(FACADE) as FacadeKey[];
const emptyCity: CityData = { attribution: '', origin: city.origin, extract: '', roads: [], canals: [], areas: [], trees: [] };
const rect = (x0: number, z0: number, x1: number, z1: number): [number, number][] => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];

// =============================================================================================
// 1. the textures

test('every city texture draws at a real-world scale: facades at 100 texels per metre both ways, grass and water in their ranges', () => {
  assert.deepEqual(textureNames.slice().sort(), ['glass', 'grass', 'panel', 'red', 'shop', 'stock', 'stone', 'water']);
  // The facades come first, so a wrong scale is reported as the facade's own ("stock up: 120 != 100"): their band (95 to 105
  // texels per metre) is the generic band's below, which would otherwise fire first and leave these lines unreachable. Every
  // other check compares a texture with FACADE_TEXELS_PER_M and would follow a changed constant, so pin the 100 itself.
  assert.equal(FACADE_TEXELS_PER_M, 100, `facades are drawn at 100 texels per metre, FACADE_TEXELS_PER_M is ${FACADE_TEXELS_PER_M}`);
  for (const key of facadeKeys) {
    const spec = CITY_TEXTURES[key];
    const [tx, ty] = texelsPerMetre(spec);
    close(tx, FACADE_TEXELS_PER_M, FACADE_TEXELS_PER_M * 0.05, `${key} across`);
    close(ty, FACADE_TEXELS_PER_M, FACADE_TEXELS_PER_M * 0.05, `${key} up`);
    assert.ok(Number.isInteger(spec.px[0]) && Number.isInteger(spec.px[1]), `${key}: whole pixels`);
    assert.match(spec.source, /ASSUMED/, `${key}: its sizes are marked ASSUMED, none is a survey`);
  }
  for (const name of textureNames) {
    const spec = CITY_TEXTURES[name];
    const [tx, ty] = texelsPerMetre(spec);
    assert.ok(tx >= spec.density[0] && tx <= spec.density[1], `${name}: ${tx.toFixed(1)} texels/m across, allowed ${spec.density}`);
    assert.ok(ty >= spec.density[0] && ty <= spec.density[1], `${name}: ${ty.toFixed(1)} texels/m along, allowed ${spec.density}`);
    assert.ok(Math.abs(tx / ty - 1) <= 0.06, `${name}: texels are ${tx.toFixed(1)} x ${ty.toFixed(1)} per metre, not square`);
    assert.ok(spec.px[0] * spec.px[1] <= 1_100_000, `${name}: ${spec.px} px is more than a megapixel`);
    assert.ok(spec.source.length > 10, `${name}: says where its size comes from`);
    assert.equal(spec.repeat, true, `${name} tiles`);
  }
});

test('a facade texture tile is the core\'s tile (one window bay by one storey), so the rules that fit windows to walls and the drawing cannot drift apart', () => {
  for (const key of facadeKeys) {
    assert.deepEqual(CITY_TEXTURES[key].tile, FACADE[key].tile, key);
    assert.deepEqual(CITY_TEXTURES[key].px, [Math.round(FACADE[key].tile[0] * FACADE_TEXELS_PER_M), Math.round(FACADE[key].tile[1] * FACADE_TEXELS_PER_M)], key);
  }
  assert.equal(FACADE_TEXELS_PER_M, 100);
});

test('the painters and the specs name the same textures', () => {
  assert.deepEqual(Object.keys(CITY_PAINTERS).sort(), textureNames.slice().sort());
});

// A canvas context that records what is drawn instead of drawing it.
interface Call {
  op: string;
  args: unknown[];
  fillStyle: unknown;
}
interface GradientStub {
  gradient: true;
  stops: [number, string][];
}
function recorder(): { g: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, globalAlpha: 1 };
  const g = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop in state) return state[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return (): GradientStub => ({ gradient: true, stops: [], addColorStop(offset: number, color: string) { this.stops.push([offset, color]); } } as GradientStub);
      }
      return (...args: unknown[]): void => {
        calls.push({ op: prop, args, fillStyle: state.fillStyle });
      };
    },
    set(_t, prop: string, value: unknown) {
      state[prop] = value;
      return true;
    },
  });
  return { g: g as unknown as CanvasRenderingContext2D, calls };
}
function paint(name: CityTextureName): Call[] {
  const r = recorder();
  const [w, h] = CITY_TEXTURES[name].px;
  CITY_PAINTERS[name](r.g, w, h);
  return r.calls;
}
const isGradient = (v: unknown): v is GradientStub => typeof v === 'object' && v !== null && 'gradient' in v;

test('every painter runs, starts with an opaque fill of the whole tile and draws the same picture every time', () => {
  for (const name of textureNames) {
    const [w, h] = CITY_TEXTURES[name].px;
    const calls = paint(name);
    assert.ok(calls.length >= 8, `${name}: ${calls.length} drawing calls`);
    const first = calls[0] as Call;
    assert.equal(first.op, 'fillRect', `${name} starts with a fill`);
    assert.deepEqual(first.args, [0, 0, w, h], `${name}: the whole tile, so there are no holes in it`);
    assert.equal(JSON.stringify(paint(name)), JSON.stringify(calls), `${name}: repeatable, so screenshots compare`);
  }
  // the ground textures are the colour they are named for: grass is green and water blue-green, near the spec's average
  for (const name of ['grass', 'water'] as const) {
    const base = (paint(name)[0] as Call).fillStyle as string;
    const got = [1, 3, 5].map((i) => Number.parseInt(base.slice(i, i + 2), 16));
    const avg = [16, 8, 0].map((shift) => (CITY_TEXTURES[name].average >> shift) & 255);
    got.forEach((c, k) => assert.ok(Math.abs(c - (avg[k] as number)) <= 12, `${name}: base colour ${base} against the average ${CITY_TEXTURES[name].average.toString(16)}`));
  }
});

test('the painted windows are the sizes the specs say, in the middle of the bay and standing on a sill, with room for a lintel', () => {
  const rect = (name: CityTextureName): { x: number; y: number; w: number; h: number } => {
    const glass = paint(name).filter((c) => c.op === 'fillRect' && isGradient(c.fillStyle));
    assert.ok(glass.length >= 1, `${name}: has a pane of glass`);
    // the largest gradient-filled rectangle is the pane
    const best = glass.reduce((a, b) => ((a.args[2] as number) * (a.args[3] as number) >= (b.args[2] as number) * (b.args[3] as number) ? a : b));
    const [x, y, w, h] = best.args as number[];
    return { x: x as number, y: y as number, w: w as number, h: h as number };
  };
  // [width, height, sill] in metres, from the `source` text of each spec
  const want: Partial<Record<CityTextureName, [number, number, number]>> = {
    stock: [1.05, 1.75, 0.85],
    stone: [1.1, 2.3, 0.9],
    panel: [1.9, 1.45, 0.85],
  };
  for (const [name, [ww, wh, sill]] of Object.entries(want) as [CityTextureName, [number, number, number]][]) {
    const [tw, th] = CITY_TEXTURES[name].px;
    const r = rect(name);
    close(r.w / 100, ww, 0.011, `${name} window width`);
    close(r.h / 100, wh, 0.011, `${name} window height`);
    close((th - (r.y + r.h)) / 100, sill, 0.011, `${name} sill height`);
    close(r.x + r.w / 2, tw / 2, 0.51, `${name} window is centred in its bay`);
    assert.ok(th - r.y > 0 && r.y >= 0.2 * 100, `${name}: room above the window for a lintel`);
    // a real storey: sill 0.85 to 0.9 m, head under the next floor
    assert.ok(sill >= 0.8 && sill <= 0.95);
    assert.ok(sill + wh <= CITY_TEXTURES[name].tile[1] - 0.3, `${name}: window head ${sill + wh} m in a ${CITY_TEXTURES[name].tile[1]} m storey`);
  }
  // curtain wall: vision glass over a 0.9 m spandrel (the spec's words), within a 3.9 m floor
  const [gw, gh] = CITY_TEXTURES.glass.px;
  const glass = rect('glass');
  close((gh - (glass.y + glass.h)) / 100, 0.9, 0.011, 'spandrel height');
  assert.ok(glass.x >= 0 && glass.x + glass.w <= gw, 'vision glass inside the module');
  // shopfront: stall riser 0.55 m, plate glass up to about 3.1 m
  const [, sh] = CITY_TEXTURES.shop.px;
  const shop = rect('shop');
  close((sh - (shop.y + shop.h)) / 100, 0.55, 0.011, 'stall riser');
  close((sh - shop.y) / 100, 3.1, 0.06, 'plate glass top');
  // round-headed windows: the arch is 1.2 m wide
  const arch = paint('red').filter((c) => c.op === 'fillRect' && isGradient(c.fillStyle));
  assert.ok(arch.length >= 1);
  close((arch[0] as Call).args[2] as number, 120, 0.1, 'red-brick arch width in px');
  // ... 2.15 m tall to the crown, standing on a 0.9 m sill, in the middle of its bay, with room for a lintel (the spec's words).
  // The glass is clipped to an arch path, so read the opening the glass fills: moveTo its bottom left corner, lineTo the
  // springing line, a quadratic curve to the right springing point. The crown of the arch is the middle of that curve.
  const [redW, redH] = CITY_TEXTURES.red.px;
  const redCalls = paint('red');
  const pane = rect('red');
  const at = redCalls.findIndex((c, i) => c.op === 'moveTo' && Math.abs((c.args[0] as number) - pane.x) < 0.5 && redCalls[i + 2]?.op === 'quadraticCurveTo');
  assert.ok(at >= 0, 'red: the glass is clipped to an arch that starts at its bottom left corner');
  const foot = (redCalls[at] as Call).args[1] as number;
  const springing = (redCalls[at + 1] as Call).args[1] as number;
  const [, controlY, , endY] = (redCalls[at + 2] as Call).args as number[];
  const crown = 0.25 * springing + 0.5 * controlY + 0.25 * endY;
  close((redH - foot) / 100, 0.9, 0.011, 'red arch window sill height');
  close((foot - crown) / 100, 2.15, 0.011, 'red arch window height to the crown');
  close(pane.x + pane.w / 2, redW / 2, 0.51, 'red arch window is centred in its bay');
  assert.ok(crown >= 0.2 * 100, `red: the crown of the arch is ${crown.toFixed(1)} px from the top of the tile, no room for a lintel`);
  assert.ok((redH - crown) / 100 <= CITY_TEXTURES.red.tile[1] - 0.3, `red: window head ${((redH - crown) / 100).toFixed(2)} m in a ${CITY_TEXTURES.red.tile[1]} m storey`);
});

test('brick is metric: courses of 75 mm and a whole number of 225 mm bricks across, so the tile repeats without a seam', () => {
  for (const name of ['stock', 'red'] as const) {
    const [w, h] = CITY_TEXTURES[name].px;
    const rows = new Set<number>();
    const firstRow = new Set<number>();
    const spans = new Map<number, [number, number]>();
    for (const c of paint(name)) {
      if (c.op !== 'fillRect') continue;
      const [x, y, bw, bh] = c.args as number[];
      // a brick: a small filled rectangle, 'rgb(' colour, a few pixels tall
      if (typeof c.fillStyle === 'string' && c.fillStyle.startsWith('rgb(') && (bh as number) < 8 && (bw as number) > 15 && (bw as number) < 30) {
        rows.add(Math.round((y as number) * 100) / 100);
        if ((y as number) < 3) firstRow.add(Math.round((x as number) * 100) / 100);
        const courseY = Math.round((y as number) * 100) / 100;
        const [lo, hi] = spans.get(courseY) ?? [Infinity, -Infinity];
        spans.set(courseY, [Math.min(lo, x as number), Math.max(hi, (x as number) + (bw as number))]);
      }
    }
    const course = h / rows.size;
    close(course / 100, 0.075, 0.075 * 0.03, `${name}: course height in m`);
    assert.equal(rows.size, Math.round(h / 7.5), `${name}: a whole number of courses in the tile`);
    const brick = w / Math.round(w / 22.5);
    close(brick / 100, 0.225, 0.225 * 0.04, `${name}: brick length in m`);
    assert.ok(firstRow.size >= Math.round(w / 22.5), `${name}: bricks across the first course`);
    // The pitch the bricks are really laid at, from the painted first course (its wrap bricks included): 225 mm within 4%,
    // and a whole number of them across the tile, so the pattern meets itself at the edge.
    const xs = [...firstRow].sort((a, b) => a - b);
    const pitch = ((xs[xs.length - 1] as number) - (xs[0] as number)) / (xs.length - 1);
    assert.ok(Math.abs(pitch / 100 - 0.225) <= 0.225 * 0.04, `${name}: the painted bricks are laid ${(pitch * 10).toFixed(0)} mm apart (${xs.length} bricks from ${xs[0]} to ${xs[xs.length - 1]} px), not 225 mm +/- 4%`);
    assert.ok(Math.abs(w / pitch - Math.round(w / pitch)) < 0.01, `${name}: ${(w / pitch).toFixed(3)} bricks of ${pitch.toFixed(2)} px across a ${w} px tile is not a whole number, so the pattern has a seam`);
    // ... and every course, the half-brick offset ones included, runs out past both edges of the tile
    for (const [y, [lo, hi]] of spans) assert.ok(lo <= 1.5 && hi >= w - 1.5, `${name}: the course at y = ${y} spans ${lo.toFixed(1)} to ${hi.toFixed(1)} of a ${w} px tile, leaving a seam`);
  }
});

// =============================================================================================
// 2. the materials

test('there is no document in Node: textures are null and every city material falls back to its average colour, with vertex colours on', () => {
  for (const name of textureNames) assert.equal(cityTexture(name), null, name);
  for (const name of ['stock', 'red', 'stone', 'panel', 'shop', 'grass'] as const) {
    const m = cityMaterial(name) as THREE.MeshLambertMaterial;
    assert.ok(m instanceof THREE.MeshLambertMaterial, `${name} is Lambert`);
    assert.equal(m.map, null, name);
    assert.equal(m.color.getHex(), CITY_TEXTURES[name].average, `${name}: the texture's average colour`);
    assert.equal(m.vertexColors, true, `${name}: the per-building tint is a vertex colour`);
  }
  for (const name of ['glass', 'water'] as const) {
    const m = cityMaterial(name) as THREE.MeshPhongMaterial;
    assert.ok(m instanceof THREE.MeshPhongMaterial, `${name} has a sheen`);
    assert.equal(m.vertexColors, true);
    assert.equal(m.color.getHex(), CITY_TEXTURES[name].average);
  }
  for (const name of ['roof', 'paint'] as const) {
    const m = cityMaterial(name) as THREE.MeshLambertMaterial;
    assert.equal(m.color.getHex(), 0xffffff, name);
    assert.equal(m.vertexColors, true, name);
  }
});

test('city materials are shared, named, distinct from each other and from the station\'s; the roads and paving are clones, not the originals', () => {
  const names: CityMaterialName[] = [...CITY_KEYS];
  const seen = new Set<THREE.Material>();
  for (const name of names) {
    const m = cityMaterial(name);
    assert.equal(cityMaterial(name), m, `${name}: shared`);
    assert.equal(m.name, `city-${name}`);
    assert.ok(!seen.has(m), `${name}: its own material`);
    seen.add(m);
  }
  assert.equal(seen.size, 13);
  for (const [name, from] of [['asphalt', 'asphalt'], ['pavement', 'concourseFloor'], ['plaza', 'concourseFloor']] as const) {
    const m = cityMaterial(name);
    assert.notEqual(m, material(from), `${name} is a clone`);
    assert.equal((material(from) as THREE.MeshLambertMaterial).vertexColors, false, 'and the station\'s own material is untouched');
    assert.equal((m as THREE.MeshLambertMaterial).vertexColors, true);
  }
  assert.equal((cityMaterial('pavement') as THREE.MeshLambertMaterial).color.getHex(), 0xb0aea8);
  // Paving tones are those of R-lighting-materials-d/e under the daylight rig: pale warm-grey stone, about (163, 158, 157) where the sun
  // lies on it, not the near-white (0xf3f0e8) the forecourt was drawn in under the old, dimmer rig. The forecourt is a shade lighter than the pavement.
  const plaza = (cityMaterial('plaza') as THREE.MeshLambertMaterial).color;
  const pavement = (cityMaterial('pavement') as THREE.MeshLambertMaterial).color;
  assert.equal(plaza.getHex(), 0xd8d5ce);
  assert.ok(plaza.r > pavement.r && plaza.g > pavement.g && plaza.b > pavement.b, 'the forecourt is laid in lighter stone than the pavement');
  assert.ok(plaza.r < 0.75, `the forecourt is no longer near-white (linear red ${plaza.r.toFixed(3)})`);
  // the paths read as darker strips across the square (R-lighting-materials-a2, -e), as they did in the first build, whose pavement was 0.86 of its plaza in
  // sRGB: here the pavement's light is 0.55 to 0.75 of the plaza's, a strip you can see from the overview
  const lum = (c: THREE.Color): number => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const strip = lum(pavement) / lum(plaza);
  assert.ok(strip > 0.55 && strip < 0.75, `the pavement is a visible strip across the plaza: ${strip.toFixed(2)} of its light`);
});

test('flat layers get a polygon offset in the order of their lift, so they never z-fight; facades get none', () => {
  const flat = ['grass', 'water', 'plaza', 'pavement', 'asphalt', 'paint'] as const;
  const byLift = flat.slice().sort((a, b) => LAYER_LIFT[a] - LAYER_LIFT[b]);
  assert.deepEqual(byLift, [...flat], 'the lifts are in the order grass, water, plaza, pavement, asphalt, paint');
  let last = 0;
  for (const name of byLift) {
    const m = cityMaterial(name);
    assert.equal(m.polygonOffset, true, name);
    assert.ok(m.polygonOffsetFactor < last, `${name}: ${m.polygonOffsetFactor} is nearer the camera than the layer under it (${last})`);
    assert.ok(m.polygonOffsetUnits < 0);
    last = m.polygonOffsetFactor;
  }
  for (const name of [...facadeKeys, 'roof'] as const) assert.equal(cityMaterial(name).polygonOffset, false, name);
});

test('the core\'s ground height is the page\'s ground height', () => {
  assert.equal(GROUND_Y, -0.2);
  // buildCity with no groundY puts the lowest layer at the default: the ground of web/src/world.ts
  const out = buildCity([], { ...emptyCity, areas: [{ id: 1, kind: 'grass', pts: rect(0, 0, 10, 10) }] });
  const y = out.meshes.grass.positions[1] as number;
  close(y, GROUND_Y + LAYER_LIFT.grass, 1e-12);
});

// =============================================================================================
// 3. geometry and trees

test('geometryOf: a BufferGeometry whose attributes and index are the accumulator\'s', () => {
  const out = buildCity([{ id: 1, kind: 'church', pts: rect(0, 0, 10, 6) }], emptyCity, { groundY: GROUND_Y });
  const acc = out.meshes.stone;
  const g = geometryOf(acc);
  assert.equal(g.getAttribute('position').count, acc.vertexCount);
  assert.equal(g.getAttribute('position').itemSize, 3);
  assert.equal(g.getAttribute('normal').itemSize, 3);
  assert.equal(g.getAttribute('uv').itemSize, 2);
  assert.equal(g.getAttribute('color').itemSize, 3);
  assert.equal(g.getAttribute('uv').count, acc.vertexCount);
  assert.equal((g.index as THREE.BufferAttribute).count, acc.indices.length);
  close(g.getAttribute('position').getY(0), acc.positions[1] as number, 1e-6, 'position y');
  close(g.getAttribute('uv').getX(2), acc.uvs[4] as number, 1e-5, 'uv u');
  g.computeBoundingBox();
  const box = g.boundingBox as THREE.Box3;
  close(box.min.y, GROUND_Y, 1e-6);
  close(box.max.y, GROUND_Y + 10.8, 1e-5);
  g.dispose();
});

test('treeGeometry: one tree 1 m tall, 30 triangles, a brown trunk and a green crown', () => {
  const g = treeGeometry();
  assert.equal(g.getAttribute('position').count, 90, 'thirty triangles, not indexed');
  g.computeBoundingBox();
  const box = g.boundingBox as THREE.Box3;
  assert.ok(box.min.y >= -1e-6 && box.min.y < 0.01, `stands on the ground (${box.min.y})`);
  assert.ok(box.max.y > 1.0 && box.max.y < 1.1, `1 m tall to the top of the crown (${box.max.y})`);
  assert.ok(Math.max(box.max.x, box.max.z, -box.min.x, -box.min.z) <= 0.31, 'a crown 0.6 m across for each metre of height');
  for (const name of ['position', 'normal', 'uv', 'color'] as const) assert.equal(g.getAttribute(name).count, 90, name);
  const color = g.getAttribute('color');
  for (let i = 0; i < 30; i++) assert.ok(color.getX(i) > color.getZ(i) && color.getX(i) > color.getY(i) * 0.9, `trunk vertex ${i} is brown`);
  for (let i = 30; i < 90; i++) assert.ok(color.getY(i) > color.getX(i) && color.getY(i) > color.getZ(i), `crown vertex ${i} is green`);
  const normal = g.getAttribute('normal');
  for (let i = 0; i < 90; i++) close(Math.hypot(normal.getX(i), normal.getY(i), normal.getZ(i)), 1, 1e-4, 'unit normal');
  g.dispose();
});

test('treeMesh: one instanced mesh, a matrix per tree (its place on the ground, its height as a uniform scale) and a tint per tree', () => {
  const spots: TreeSpot[] = [
    { x: 10, z: -20, height: 8, yaw: 0, tone: 0 },
    { x: -5.5, z: 3, height: 11.5, yaw: 1.2, tone: 0.5 },
    { x: 0, z: 0, height: 6, yaw: 6, tone: 0.999 },
  ];
  const mesh = treeMesh(spots);
  assert.ok(mesh instanceof THREE.InstancedMesh);
  assert.equal(mesh.count, 3);
  assert.equal(mesh.name, 'city-trees');
  assert.equal((mesh.material as THREE.MeshLambertMaterial).vertexColors, true);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  spots.forEach((t, i) => {
    mesh.getMatrixAt(i, m);
    m.decompose(p, q, s);
    // the matrices are Float32
    close(p.x, t.x, 1e-6);
    close(p.y, GROUND_Y, 1e-6);
    close(p.z, t.z, 1e-6);
    for (const k of [s.x, s.y, s.z]) close(k, t.height, 1e-6, 'uniform scale is the height in metres');
    const yaw = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    close(Math.cos(yaw), Math.cos(t.yaw), 1e-6, 'yaw');
    close(Math.sin(yaw), Math.sin(t.yaw), 1e-6, 'yaw');
    const c = new THREE.Color();
    (mesh.getColorAt as (i: number, c: THREE.Color) => void)(i, c);
    assert.ok(c.r > 0.8 && c.r < 1.12 && c.g > 0.85 && c.g < 1.16 && c.b > 0.75 && c.b < 1.0, `tint ${c.r},${c.g},${c.b}`);
  });
  assert.equal(treeMesh(spots, 5).count, 3);
  const high = new THREE.Matrix4();
  treeMesh(spots, 5).getMatrixAt(0, high);
  close(new THREE.Vector3().setFromMatrixPosition(high).y, 5, 1e-6, 'an explicit ground height');
  // the tint varies with the tone
  const lo = new THREE.Color();
  const hi = new THREE.Color();
  mesh.getColorAt(0, lo);
  mesh.getColorAt(2, hi);
  assert.ok(hi.r > lo.r && hi.g > lo.g, 'a greener-or-lighter tone gives a different tint');
});

// =============================================================================================
// 4. addCity

const hidden = new Set(data.buildings.slice(0, 5).map((b) => b.id));

test('addCity: one named group, one mesh per material plus one instanced tree mesh, and the numbers it reports are the meshes\'', () => {
  const scene = new THREE.Scene();
  const c = addCity(scene, data, city, { hidden });
  assert.ok(scene.children.includes(c.group));
  assert.equal(c.group.name, 'city');
  assert.equal(c.group.children.length, c.stats.drawCalls, 'a draw call per child');
  assert.ok(c.stats.drawCalls >= 13 && c.stats.drawCalls <= 14, `${c.stats.drawCalls} draw calls`);
  const built = buildCity(data.buildings, city, { hidden, exclude: data.buildings.filter((b) => hidden.has(b.id)).map((b) => b.pts), groundY: GROUND_Y });
  let triangles = 0;
  const names: string[] = [];
  for (const child of c.group.children) {
    names.push(child.name);
    if (child instanceof THREE.InstancedMesh) {
      assert.equal(child.name, 'city-trees');
      assert.equal(child.count, c.stats.trees);
      triangles += child.count * (child.geometry.getAttribute('position').count / 3);
      continue;
    }
    const mesh = child as THREE.Mesh;
    assert.ok(mesh instanceof THREE.Mesh);
    const key = mesh.name.replace('city-', '') as CityKey;
    assert.ok(CITY_KEYS.includes(key), `${mesh.name} is a city surface`);
    assert.equal(mesh.material, cityMaterial(key), `${mesh.name} uses the shared material`);
    assert.equal((mesh.geometry.index as THREE.BufferAttribute).count / 3, built.meshes[key].triangleCount, `${mesh.name}: the triangles the core built`);
    assert.equal(c.stats.byKey[key]?.vertices, mesh.geometry.getAttribute('position').count);
    triangles += built.meshes[key].triangleCount;
  }
  assert.equal(new Set(names).size, names.length, 'no mesh twice');
  assert.equal(c.stats.triangles, triangles);
  assert.equal(c.stats.trees, built.trees.length);
  assert.equal(c.stats.buildings.buildings, data.buildings.length - hidden.size);
  assert.ok(names.includes('city-trees') && names.includes('city-asphalt') && names.includes('city-glass'));
  c.dispose();
});

test('addCity: trees can be left out, and a hidden building is not drawn', () => {
  const scene = new THREE.Scene();
  const withTrees = addCity(scene, data, city, { hidden });
  const bare = addCity(new THREE.Scene(), data, city, { hidden, trees: false });
  assert.equal(bare.stats.drawCalls, withTrees.stats.drawCalls - 1);
  assert.equal(bare.stats.trees, 0);
  assert.equal(bare.group.children.some((o) => o.name === 'city-trees'), false);
  const more = addCity(new THREE.Scene(), data, city, { hidden: new Set(data.buildings.slice(0, 200).map((b) => b.id)), trees: false });
  assert.equal(more.stats.buildings.buildings, data.buildings.length - 200);
  assert.ok(more.stats.triangles < bare.stats.triangles, 'fewer buildings, fewer triangles');
  withTrees.dispose();
  bare.dispose();
  more.dispose();
});

test('addCity: a street whose middle is inside a hidden building (the station) is not drawn, and one that crosses a rail rides over it', () => {
  const station = { id: 77, kind: 'train_station', pts: rect(0, -30, 100, 30) as [number, number][] };
  const tiny: KxData = {
    ...data,
    nodes: [[1, 150, -50], [2, 150, 50]],
    rails: [{ id: 5, nodes: [1, 2], service: 'main', tunnel: false, bridge: false, layer: 0 }],
    switches: [], buffers: [], signals: [], platforms: [],
    buildings: [station],
  };
  const through = { id: 1, cls: 'minor' as const, pts: [[-40, 0], [140, 0]] as [number, number][] };
  const over = { id: 2, cls: 'minor' as const, pts: [[110, 0], [190, 0]] as [number, number][] };
  const withCity: CityData = { ...emptyCity, roads: [through, over] };
  const shown = addCity(new THREE.Scene(), tiny, withCity, {});
  const hiddenStation = addCity(new THREE.Scene(), tiny, withCity, { hidden: new Set([77]) });
  // street 1 runs 180 m: with the station on show it is drawn through the building; hidden, its stretch inside the station's outline is cut
  assert.ok(shown.stats.byKey.asphalt && hiddenStation.stats.byKey.asphalt);
  assert.ok((hiddenStation.stats.byKey.asphalt?.triangles as number) < (shown.stats.byKey.asphalt?.triangles as number) || (hiddenStation.stats.buildings.roadsSkipped as number) > 0, 'the station is a hole in the street map');
  assert.equal(shown.stats.buildings.buildings, 1);
  assert.equal(hiddenStation.stats.buildings.buildings, 0);
  // street 2 crosses the rail at x = 150: it is lifted
  assert.equal(shown.stats.buildings.liftedRuns, 1);
  assert.equal(hiddenStation.stats.buildings.liftedRuns, 1);
  shown.dispose();
  hiddenStation.dispose();
});

test('addCity.dispose removes the group from the scene and disposes every geometry it made', () => {
  const scene = new THREE.Scene();
  const c = addCity(scene, data, city, { hidden });
  const geometries = new Set<THREE.BufferGeometry>();
  for (const child of c.group.children) geometries.add((child as THREE.Mesh).geometry);
  assert.equal(geometries.size, c.group.children.length, 'a geometry per mesh');
  let disposed = 0;
  for (const g of geometries) g.addEventListener('dispose', () => disposed++);
  c.dispose();
  assert.equal(scene.children.includes(c.group), false);
  assert.equal(disposed, geometries.size);
});

// =============================================================================================
// 5. the city on uneven ground

const terrain = createTerrain(JSON.parse(readFileSync(new URL('../src/data/kx-terrain.json', import.meta.url), 'utf8')));

test('treeMesh: a spot with a height of its own stands there, the others on the ground height given (the page\'s by default)', () => {
  const spots: TreeSpot[] = [
    { x: 10, z: -20, y: 7.25, height: 8, yaw: 0, tone: 0 },
    { x: -5.5, z: 3, height: 11.5, yaw: 1.2, tone: 0.5 },
    { x: 0, z: 0, y: -3, height: 6, yaw: 6, tone: 0.999 },
  ];
  const m = new THREE.Matrix4();
  const heightOf = (mesh: THREE.InstancedMesh, i: number): number => {
    mesh.getMatrixAt(i, m);
    return new THREE.Vector3().setFromMatrixPosition(m).y;
  };
  const mesh = treeMesh(spots);
  close(heightOf(mesh, 0), 7.25, 1e-6, 'its own height');
  close(heightOf(mesh, 1), GROUND_Y, 1e-6, 'no height of its own: the page\'s ground');
  close(heightOf(mesh, 2), -3, 1e-6, 'below the flat ground is allowed');
  const high = treeMesh(spots, 5);
  close(heightOf(high, 0), 7.25, 1e-6, 'an explicit ground height does not move a spot that has its own');
  close(heightOf(high, 1), 5, 1e-6, 'but is the ground of one that has none');
});

test('addCity with a terrain: the same draw calls, buildings and trees, on the real ground, for not many more triangles', () => {
  const exclude = data.buildings.filter((b) => hidden.has(b.id)).map((b) => b.pts);
  const rails = railSegments(data); // a street over the railway is a deck on a terrain, so the rails matter to the count
  const flat = addCity(new THREE.Scene(), data, city, { hidden });
  const hilly = addCity(new THREE.Scene(), data, city, { hidden, terrain });
  const built = buildCity(data.buildings, city, { hidden, exclude, groundY: GROUND_Y, rails: [...rails.main, ...rails.siding], terrain, drape: PAGE_DRAPE });
  assert.equal(hilly.stats.drawCalls, flat.stats.drawCalls, 'a terrain adds no draw call');
  assert.ok(hilly.stats.drawCalls >= 13 && hilly.stats.drawCalls <= 14, `${hilly.stats.drawCalls} draw calls`);
  assert.deepEqual(hilly.stats.buildings, flat.stats.buildings, 'the same buildings, streets and areas');
  assert.equal(hilly.stats.trees, flat.stats.trees);
  const ratio = hilly.stats.triangles / flat.stats.triangles;
  // x1.58 with the page's drape (PAGE_DRAPE: polygons cut at 8 m where the ground bulges), x1.37 with the core's defaults
  assert.ok(ratio > 1.05 && ratio < 1.65, `${hilly.stats.triangles} triangles against ${flat.stats.triangles}: x${ratio.toFixed(3)}`);
  // what the page draws is what the core built on that terrain
  for (const child of hilly.group.children) {
    if (child instanceof THREE.InstancedMesh) continue;
    const mesh = child as THREE.Mesh;
    const key = mesh.name.replace('city-', '') as CityKey;
    assert.equal((mesh.geometry.index as THREE.BufferAttribute).count / 3, built.meshes[key].triangleCount, `${mesh.name}: the triangles the core built on the terrain`);
  }
  const bounds = (c: ReturnType<typeof addCity>, name: string): THREE.Box3 => {
    const g = (c.group.getObjectByName(name) as THREE.Mesh).geometry;
    g.computeBoundingBox();
    return g.boundingBox as THREE.Box3;
  };
  const low = built.meshes.roof.positions.filter((_, i) => i % 3 === 1).reduce((a, v) => Math.min(a, v), Infinity);
  close(bounds(hilly, 'city-roof').min.y, low, 1e-3, 'the roofs are where the core put them');
  const lowestWall = (c: ReturnType<typeof addCity>): number => Math.min(...facadeKeys.map((k) => bounds(c, `city-${k}`).min.y));
  close(lowestWall(flat), GROUND_Y, 1e-3, 'on the flat plane every wall starts at the ground');
  assert.ok(lowestWall(hilly) < GROUND_Y - 5, `a building in the low ground (the lowest is ${lowestWall(hilly).toFixed(2)} m) starts well below the flat plane`);
  // the trees stand on the ground, one matrix each
  const trees = hilly.group.getObjectByName('city-trees') as THREE.InstancedMesh;
  assert.equal(trees.count, built.trees.length);
  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  built.trees.forEach((t, i) => {
    if (i % 7) return;
    trees.getMatrixAt(i, m);
    p.setFromMatrixPosition(m);
    close(p.y, terrain.heightAt(t.x, t.z), 1e-3, `tree ${i} stands on the terrain`);
  });
  // the draping options reach the core: a street cut every 4 m is more triangles than one cut where the ground bends
  const capped = addCity(new THREE.Scene(), data, city, { hidden, terrain, drape: { maxSpacing: 4 } });
  assert.ok(capped.stats.triangles > hilly.stats.triangles * 1.3, `${capped.stats.triangles} against ${hilly.stats.triangles}`);
  for (const c of [flat, hilly, capped]) c.dispose();
});

/** The heights of every vertex of a city layer, to a tenth of a millimetre. */
function layerHeights(c: ReturnType<typeof addCity>, key: CityKey): number[] {
  const p = (c.group.getObjectByName(`city-${key}`) as THREE.Mesh).geometry.getAttribute('position') as THREE.BufferAttribute;
  const out = new Set<number>();
  for (let i = 0; i < p.count; i++) out.add(Math.round(p.getY(i) * 1e4) / 1e4);
  return [...out].sort((a, b) => a - b);
}

test('addCity with a terrain draws PAGE_DRAPE (layers clear of the ground) and what is given is laid over it; without a terrain nothing is lifted', () => {
  // flat at 3 m, well past the edge of the city: every polygon is one plane, so each layer is one height
  const level = terrainFromFunction(() => 3, { x0: -8000, z0: -8000, x1: 8000, z1: 8000 }, 1000);
  const heightsOf = (opts: Parameters<typeof addCity>[3]): Record<'grass' | 'plaza' | 'water', number[]> => {
    const c = addCity(new THREE.Scene(), data, city, { hidden, ...opts });
    const out = { grass: layerHeights(c, 'grass'), plaza: layerHeights(c, 'plaza'), water: layerHeights(c, 'water') };
    c.dispose();
    return out;
  };
  const lift = PAGE_DRAPE.lift;
  assert.ok(lift > 0.05 && lift < 0.2, `the page's lift is ${lift} m`);
  const r4 = (v: number): number => Math.round(v * 1e4) / 1e4;
  /** what each layer's height is on ground at `ground` with `extra` on top of its own lift */
  const expected = (ground: number, extra: number) => ({ grass: [r4(ground + LAYER_LIFT.grass + extra)], plaza: [r4(ground + LAYER_LIFT.plaza + extra)], water: [r4(ground + LAYER_LIFT.water + extra)] });
  assert.deepEqual(heightsOf({ terrain: level }), expected(3, lift), 'the default');
  assert.deepEqual(heightsOf({ terrain: level, drape: { lift: 0 } }), expected(3, 0), 'a lift of 0 given');
  assert.deepEqual(heightsOf({ terrain: level, drape: { lift: 0.3 } }), expected(3, 0.3), 'another lift given');
  assert.deepEqual(heightsOf({ terrain: level, drape: { maxSpacing: 4 } }), expected(3, lift), 'an option that is not the lift leaves it alone');
  assert.deepEqual(heightsOf({}), expected(GROUND_Y, 0), 'no terrain: the flat plane, as ever');
});

/** The share of a flat layer's area, seen from above, that lies under the ground: seven samples in each triangle, weighted by its area. */
function buriedShare(mesh: THREE.Mesh, ground: { heightAt(x: number, z: number): number }): number {
  const p = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
  const index = mesh.geometry.index as THREE.BufferAttribute;
  const samples = [[1 / 3, 1 / 3, 1 / 3], [0.5, 0.5, 0], [0, 0.5, 0.5], [0.5, 0, 0.5], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]] as const;
  let area = 0;
  let under = 0;
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    const b = index.getX(i + 1);
    const c = index.getX(i + 2);
    const plan = Math.abs((p.getX(b) - p.getX(a)) * (p.getZ(c) - p.getZ(a)) - (p.getX(c) - p.getX(a)) * (p.getZ(b) - p.getZ(a))) / 2;
    for (const [u, v, w] of samples) {
      const x = p.getX(a) * u + p.getX(b) * v + p.getX(c) * w;
      const z = p.getZ(a) * u + p.getZ(b) * v + p.getZ(c) * w;
      const y = p.getY(a) * u + p.getY(b) * v + p.getY(c) * w;
      area += plan / samples.length;
      if (y - ground.heightAt(x, z) < 0.004) under += plan / samples.length;
    }
  }
  return under / area;
}

test('on the ground the page draws, the city\'s flat layers are almost never under it: the lawns and squares do not show it through, the canal follows its channel', () => {
  // the ground exactly as main.ts builds it (an adaptive mesh, coarse far from the rails, the portal strips left out), and the city draped on that
  const rails = railSegments(data);
  const drawn = addTerrain(new THREE.Scene(), terrain, { exclude: portalHole(tunnelMouths(data)), rails });
  const onIt = (drape?: CityOptions['drape']): ReturnType<typeof addCity> => addCity(new THREE.Scene(), data, city, { hidden, terrain: drawn.ground, drape });
  const page = onIt();
  // the most each layer may lie under the ground, percent (measured 3.8 grass, 1.6 plaza, 3.3 water, 0.7 pavement, 1.5 asphalt, 1.9 paint; the core's defaults 31, 13, 43, 2.8, 4.3, 5.3)
  const limit: Record<string, number> = { grass: 6, plaza: 3, water: 6, pavement: 1.5, asphalt: 3, paint: 4 };
  for (const [key, most] of Object.entries(limit)) {
    const share = (100 * buriedShare(page.group.getObjectByName(`city-${key}`) as THREE.Mesh, drawn.ground));
    assert.ok(share <= most, `${key}: ${share.toFixed(1)}% of it is under the ground, at most ${most}% allowed`);
  }
  // the same city with the core's own drape: far more of the lawns and squares are under the ground, so the measure sees what it is for
  const plain = onIt({ lift: 0, maxEdge: 16, planar: 0.02 });
  const grassPlain = 100 * buriedShare(plain.group.getObjectByName('city-grass') as THREE.Mesh, drawn.ground);
  const plazaPlain = 100 * buriedShare(plain.group.getObjectByName('city-plaza') as THREE.Mesh, drawn.ground);
  assert.ok(grassPlain > 15 && plazaPlain > 6, `without the lift ${grassPlain.toFixed(1)}% of the grass and ${plazaPlain.toFixed(1)}% of the squares are under the ground`);
  for (const c of [page, plain]) c.dispose();
  drawn.dispose();
});
