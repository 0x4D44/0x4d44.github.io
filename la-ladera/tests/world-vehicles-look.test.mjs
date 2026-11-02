// R1-103: parked cars wore two fixed liveries (the same white sedan three times, the same rust patches on every body: two "eyes" and a "mouth"). Each car now has its own colour (a tint on the
// atlas cell it was dealt) and its own set of the model's patches. The numbers behind that are measured here against the real atlas and the real library; the picture itself is page-tested in
// world-vehicles-look-page.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';
import { createContext } from '../js/core/ctx.js';
import { PAINT_TILE_MEAN, vehicleTint, vehicleLookCode, lookHash, vehiclePaintTile, LOOK_NO_RUST, LOOK_NO_MUD, LOOK_FLIP } from '../js/world/vehicle-library.js';
import { buildData, loadVehiclesFromDisk, readAssetJson } from './headless.mjs';
import { ROOT } from '../tools/blender/vehicles_validate.mjs';

/** Decode the paint atlas (1024 x 1024, non-interlaced 8-bit RGB/RGBA) to rows of pixels. */
function decodePng(buf) {
  let p = 8, w = 0, h = 0, ctype = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); ctype = data[9]; }
    if (type === 'IDAT') idat.push(data);
    p += 12 + len;
  }
  const bpp = ctype === 6 ? 4 : 3, raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, img = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), out = img.subarray(y * stride, (y + 1) * stride), prev = y ? img.subarray((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v & 255;
    }
  }
  return { w, h, bpp, img, stride };
}

async function loaded() {
  const ctx = createContext({ headless: true });
  await ctx.assets.init(readAssetJson);
  await loadVehiclesFromDisk(ctx);
  return ctx;
}
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

test('the atlas cell means the tint is measured against are the atlas\'s own', () => {
  const manifest = JSON.parse(readFileSync(resolve(ROOT, 'assets/models/manifest.vehicles.json'), 'utf8'));
  const png = decodePng(readFileSync(resolve(ROOT, 'assets/textures/vehicles/paint.png'))), names = Object.keys(manifest.atlas.tiles);
  assert.equal(names.length, PAINT_TILE_MEAN.length, 'one mean per catalogue cell');
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  names.forEach((name, n) => {
    const [u0, v0, u1, v1] = manifest.atlas.tiles[name];                  // catalogue uvs: v counts from the bottom of the file (the engine loads the atlas with flipY)
    const inset = 0.06 * (u1 - u0), x0 = Math.round((u0 + inset) * png.w), x1 = Math.round((u1 - inset) * png.w), y0 = Math.round((1 - v1 + inset) * png.h), y1 = Math.round((1 - v0 - inset) * png.h);
    let r = 0, g = 0, b = 0, k = 0;
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * png.stride + x * png.bpp; r += lin(png.img[i]); g += lin(png.img[i + 1]); b += lin(png.img[i + 2]); k++; }
    const want = new THREE.Color(PAINT_TILE_MEAN[n]), got = [r / k, g / k, b / k];
    for (const [c, ch] of [[want.r, got[0]], [want.g, got[1]], [want.b, got[2]]]) assert.ok(Math.abs(c - ch) < 0.012 + 0.03 * ch, `${name} (${n}): the mean in the code is ${c.toFixed(4)}, the atlas measures ${ch.toFixed(4)}`);
  });
});

test('a tint takes a cell most of the way to the car\'s own colour; no hex is no tint', () => {
  const cases = [[0xf4f4f0, 'white'], [0x1c1c20, 'black'], [0xb8222a, 'red'], [0x2b4f7e, 'blue'], [0x3d6b4a, 'green'], [0xd9cfa8, 'cream'], [0x9aa0a6, 'grey'], [0xf2c21b, 'taxi yellow']];
  for (const [hex, name] of cases) {
    const tile = vehiclePaintTile(hex, 1), t = vehicleTint(hex, tile, 0), mean = new THREE.Color(PAINT_TILE_MEAN[tile]), want = new THREE.Color(hex);
    assert.ok(t.every((v) => Number.isFinite(v) && v >= 0.05 && v <= 2.2), `${name}: ${t}`);
    const got = new THREE.Color(mean.r * t[0], mean.g * t[1], mean.b * t[2]);
    assert.ok(lum(got) > lum(want) / 1.5 && lum(got) < lum(want) * 1.5 + 0.004, `${name}: the cell, tinted, is as light as the car (${lum(got).toFixed(3)} against ${lum(want).toFixed(3)})`);
    if (name === 'red') assert.ok(got.r > 2 * got.g && got.r > 2 * got.b, 'red stays red');
    if (name === 'blue') assert.ok(got.b > got.r * 1.5, 'blue stays blue');
    if (name === 'taxi yellow') assert.ok(got.r > 3 * got.b && got.g > 3 * got.b, 'a taxi is yellow');
  }
  assert.deepEqual(vehicleTint(undefined, 6), [1, 1, 1]);
  assert.deepEqual(vehicleTint(NaN, 6, 77), [1, 1, 1]);
  assert.notDeepEqual(vehicleTint(0xf4f4f0, 6, lookHash(1, 2, 3)), vehicleTint(0xf4f4f0, 6, lookHash(40, 2, 3)), 'two cars of one colour differ by a few per cent');
});

test('a design\'s cars take different patch codes, and the original look (both patches) is dealt last', () => {
  const used = new Set(), order = [];
  for (let i = 0; i < 8; i++) { const c = vehicleLookCode(lookHash(i * 7.3, i * 3.1, i), used); assert.ok(c >= 0 && c < 8 && Number.isInteger(c)); assert.ok(!used.has(c), `code ${c} dealt twice`); used.add(c); order.push(c); }
  assert.equal(used.size, 8, 'all eight combinations of the three bits are dealt before one repeats');
  assert.deepEqual(order.slice(6), [4, 0], 'the two codes that show both patches come last');
  assert.ok(order.slice(0, 6).every((c) => (c & (LOOK_NO_RUST | LOOK_NO_MUD)) !== 0), 'the first six hide at least one patch');
  assert.equal(vehicleLookCode(lookHash(1, 1, 1), used) >= 0, true, 'a ninth car still gets a code');
  assert.equal(lookHash(3.5, -2.25, 4), lookHash(3.5, -2.25, 4), 'a hash, not a random stream');
  assert.ok([LOOK_NO_RUST, LOOK_NO_MUD, LOOK_FLIP].every((b, i) => b === 1 << i));
});

test('the library gives four white hatchbacks four different looks, keeps what a caller forces, and binds the look to the instances', async () => {
  const ctx = await loaded(), C = ctx.vehicleLibrary, key = 'vehicle_hatchback_b';
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 1.6, 6);
  for (let i = 0; i < 4; i++) assert.ok(C.place(key, i * 2.5, 0, 0, 0, 0, { hex: 0xf4f4f0 }));
  const recs = C.records.filter((r) => r.key === key);
  assert.equal(new Set(recs.map((r) => r.look.code)).size, 4, 'no two of them wear the same patches');
  assert.equal(new Set(recs.map((r) => r.look.tint.map((v) => v.toFixed(3)).join())).size, 4, 'nor the same white');
  assert.ok(recs.every((r) => r.hex === 0xf4f4f0 && r.look.tint.every(Number.isFinite)));
  assert.ok(C.place(key, 10, 0, 0, 0, 0, { hex: 0xb8222a, look: { tint: [0.5, 0.6, 0.7], code: 5 } }));
  const forced = C.records.at(-1);
  assert.deepEqual(forced.look, { tint: [0.5, 0.6, 0.7], code: 5 });
  C.finalize();
  const type = C.types.get(key), mesh = type.meshes[0].find((m) => m.geometry.attributes.vehicleLook), a = mesh.geometry.attributes.vehicleLook;
  assert.equal(a.itemSize, 4); assert.equal(a.count, 5); assert.ok(a.usage === THREE.DynamicDrawUsage);
  const want = C.records.filter((r) => r.key === key).flatMap((r) => [...r.look.tint, r.look.code]);
  assert.deepEqual([...a.array].map((v) => +v.toFixed(5)), want.map((v) => +Math.fround(v).toFixed(5)), 'the visible instances, in order, carry their own tint and bits');
  assert.ok(type.meshes[1].every((m) => !m.geometry.attributes.vehicleLook || m.geometry.attributes.vehicleLook.count === 5), 'the far LOD carries the same look');
  assert.deepEqual([...mesh.geometry.attributes.vehiclePaintTile.array].slice(0, 5), recs.map((r) => r.paint).concat(forced.paint), 'the paint tile attribute is untouched');
});

test('the paint shader is patched at all three places, and says so when a three.js chunk moves', async () => {
  const ctx = await loaded(), C = ctx.vehicleLibrary, key = 'vehicle_hatchback_a';
  ctx.camera = new THREE.PerspectiveCamera(); ctx.camera.position.set(0, 1.6, 6);
  assert.ok(C.place(key, 0, 0, 0, 0, 0, { hex: 0xb8222a })); C.finalize();
  const mesh = C.types.get(key).meshes[0].find((m) => m.geometry.attributes.vehicleLook), shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  mesh.material.onBeforeCompile(shader);
  const count = (s, t) => s.split(t).length - 1;
  assert.equal(count(shader.vertexShader, 'attribute vec4 vehicleLook;'), 1);
  assert.equal(count(shader.vertexShader, 'varying vec3 vPaintTint;'), 1);
  assert.ok(shader.vertexShader.includes('float paintHide = 0.0;') && shader.vertexShader.includes('vMapUv = paintAt * 0.25 + paintCell * 0.25;'), 'the uv stage remaps the main coat and marks the patches this car leaves off');
  assert.ok(shader.vertexShader.includes('if (paintHide > 0.5) gl_Position = vec4(0.0, 0.0, 2.0, 1.0);'), 'the clip stage throws a hidden patch away');
  assert.equal(count(shader.fragmentShader, 'varying vec3 vPaintTint;'), 1);
  assert.ok(shader.fragmentShader.includes('diffuseColor.rgb *= vPaintTint;'), 'the fragment stage applies the tint');
  assert.ok(mesh.material.customProgramCacheKey().endsWith('-v2'), 'a new program, not the first version\'s cached one');
});

test('the real world\'s parked cars are different cars: no colour dealt twice, no two bodies wearing the same patches', async () => {
  const { ctx } = await buildData({ world: true, furnish: false }), lib = ctx.vehicleLibrary;
  const cars = lib.records.filter((r) => /^vehicle_hatchback_/.test(r.key));
  assert.ok(cars.length >= 5, `${cars.length} hatchbacks parked`);
  const taxis = cars.filter((r) => r.hex === 0xf2c21b), others = cars.filter((r) => r.hex !== 0xf2c21b);
  assert.ok(others.every((r) => Number.isFinite(r.hex)), 'every car carries the colour it was dealt');
  assert.equal(new Set(others.map((r) => r.hex)).size, others.length, `colours dealt: ${others.map((r) => r.hex.toString(16)).join(' ')}`);
  for (const key of ['vehicle_hatchback_a', 'vehicle_hatchback_b']) {
    const mine = cars.filter((r) => r.key === key), codes = mine.map((r) => r.look.code);
    assert.equal(new Set(codes).size, codes.length, `${key}: the codes ${codes}`);
    assert.ok(mine.filter((r) => r.look.code === 0 || r.look.code === 4).length <= 1, `${key}: at most one wears the original eyes and mouth`);
  }
  assert.ok(new Set(cars.map((r) => `${r.hex}:${r.look.code}`)).size === cars.length);
  assert.equal(taxis.length, cars.filter((r) => r.paint === 2).length, 'taxis keep the ochre cell');
  assert.deepEqual(ctx.errors, []);
});
