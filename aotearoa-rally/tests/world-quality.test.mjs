// WORLD lane: quality tiers, governor, chunk/LOD maths, skid ring buffer (pure logic).
import test from "node:test";
import assert from "node:assert/strict";
import {
  QUALITY, QUALITY_LEVELS, createGovernor, guessTier, tierBelow, selectLod, chunkGrid, chunkKey, chunkDistance,
  gridIndices, LOD_QUADS, CHUNK_SIZE, skirtDepth, createSkidBuffer, skidStyle, percentile, normalizeQuality,
} from "../render/quality.mjs";

test("every tier defines the full table and is monotone", () => {
  const keys = Object.keys(QUALITY.high);
  for (const l of QUALITY_LEVELS) assert.deepEqual(Object.keys(QUALITY[l]).sort(), keys.slice().sort(), l);
  for (let i = 1; i < QUALITY_LEVELS.length; i++) {
    const a = QUALITY[QUALITY_LEVELS[i - 1]], b = QUALITY[QUALITY_LEVELS[i]];
    assert.ok(b.shadowMap >= a.shadowMap, "shadowMap");
    assert.ok(b.viewDist >= a.viewDist, "viewDist");
    assert.ok(b.rain >= a.rain && b.snow >= a.snow, "particles");
    assert.ok(b.density.tree >= a.density.tree && b.density.small >= a.density.small, "density");
    assert.ok(b.anisotropy >= a.anisotropy && b.pixelRatioCap >= a.pixelRatioCap, "aniso/pr");
    assert.ok(b.distMul >= a.distMul, "distMul");
  }
  assert.equal(QUALITY.low.post, false, "low has no post");
  assert.equal(QUALITY.low.pixelRatioCap, 1, "low pixel ratio 1");
  assert.equal(QUALITY.high.msaa, 4, "high uses 4x MSAA");
  assert.ok(QUALITY.low.shadowMap <= 1024, "low shadow map is small");
  assert.equal(normalizeQuality("bogus"), "auto");
  assert.equal(normalizeQuality("ultra"), "ultra");
});

test("guessTier and tierBelow", () => {
  assert.equal(guessTier({ gpuHint: "Google SwiftShader" }), "low");
  assert.equal(guessTier({ mobile: true }), "low");
  assert.equal(guessTier({ cores: 12, dpr: 1 }), "high");
  assert.equal(tierBelow("ultra"), "high");
  assert.equal(tierBelow("low"), "low");
});

test("governor lowers resolution under load, never below 0.6, and recovers", () => {
  const g = createGovernor();
  for (let i = 0; i < 600; i++) g.frame(40);
  assert.ok(g.scale < 1, "scale dropped");
  assert.ok(g.scale >= 0.6 - 1e-9, "clamped at min");
  assert.equal(g.scale, 0.6);
  assert.ok(g.tierDownRequested, "asks for a lower tier when scale cannot help");
  const low = g.scale;
  g.reset();
  for (let i = 0; i < 900; i++) g.frame(8);
  assert.ok(g.scale > low, "recovers when fast");
  assert.ok(g.scale <= 1);
  const off = createGovernor();
  off.enabled = false;
  for (let i = 0; i < 200; i++) off.frame(60);
  assert.equal(off.scale, 1, "disabled governor never changes the scale");
});

test("selectLod picks by distance with hysteresis", () => {
  const th = [100, 200, 400];
  assert.equal(selectLod(50, th), 0);
  assert.equal(selectLod(150, th), 1);
  assert.equal(selectLod(250, th), 2);
  assert.equal(selectLod(900, th), 3);
  assert.equal(selectLod(105, th, 0), 0, "stays at LOD0 just past the boundary");
  assert.equal(selectLod(120, th, 0), 1, "switches when clearly past");
  assert.equal(selectLod(95, th, 1), 1, "stays at LOD1 just inside");
  assert.equal(selectLod(70, th, 1), 0, "switches back when clearly inside");
});

test("chunk grid covers bounds; distance and keys behave", () => {
  const b = { minX: -300, maxX: 500, minZ: -1000, maxZ: 120 };
  const g = chunkGrid(b);
  assert.ok(g.x0 * CHUNK_SIZE <= b.minX && (g.x0 + g.nx) * CHUNK_SIZE >= b.maxX);
  assert.ok(g.z0 * CHUNK_SIZE <= b.minZ && (g.z0 + g.nz) * CHUNK_SIZE >= b.maxZ);
  assert.equal(chunkDistance(10, 10, 0, 0), 0);
  assert.equal(chunkDistance(CHUNK_SIZE + 30, 10, 0, 0), 30);
  assert.ok(Math.abs(chunkDistance(CHUNK_SIZE + 30, CHUNK_SIZE + 40, 0, 0) - 50) < 1e-9);
  const keys = new Set();
  for (let x = -5; x < 5; x++) for (let z = -5; z < 5; z++) keys.add(chunkKey(x, z));
  assert.equal(keys.size, 100, "keys are unique");
  assert.ok(skirtDepth(3) > skirtDepth(0));
});

test("gridIndices is a valid triangle list for every LOD", () => {
  for (let lod = 0; lod < LOD_QUADS.length; lod++) {
    const n = LOD_QUADS[lod], w = n + 3;
    const idx = gridIndices(n);
    assert.equal(idx.length, (w - 1) * (w - 1) * 6);
    let max = 0;
    for (const v of idx) if (v > max) max = v;
    assert.equal(max, w * w - 1);
  }
});

test("skid ring buffer: segments, gaps, wrap, lift", () => {
  const b = createSkidBuffer(8, 4);
  assert.equal(b.mark(0, 0, 0, 0, 0, 1, 0, 0, 0), 0, "first contact only plants the pen");
  assert.equal(b.mark(0, 0.05, 0, 0, 0, 1, 0, 0, 0), 0, "too short a step is ignored");
  assert.equal(b.mark(0, 0.5, 0, 0, 0, 1, 0, 0, 0), 1, "a 0.5 m step writes a segment");
  assert.equal(b.count, 1);
  assert.equal(b.alpha[0], 1);
  assert.equal(b.mark(0, 30, 0, 0, 0, 1, 0, 0, 0), 0, "a teleport gap is not joined");
  assert.equal(b.count, 1);
  assert.equal(b.mark(1, 0, 0, 0, 0, 0.01, 0, 0, 0), 0, "faint skid lifts the pen");
  for (let i = 1; i <= 20; i++) b.mark(2, i * 0.5, 0, 0, 0, 0.8, 0, 0, 0);
  assert.equal(b.count, 8, "count caps at capacity");
  assert.equal(b.head, (1 + 19) % 8, "head wraps");
  const v = b.version;
  b.clear();
  assert.equal(b.count, 0);
  assert.ok(b.version > v);
  assert.ok(b.alpha.every((a) => a === 0));
  // geometry: quad is as wide as requested, perpendicular to heading (yaw 0 => lateral = x)
  const c = createSkidBuffer(4, 1);
  c.mark(0, 0, 0, 0, 0, 1, 1, 1, 1, 0.4);
  c.mark(0, 0, 0, -1, 0, 1, 1, 1, 1, 0.4);
  assert.ok(Math.abs(c.pos[3] - c.pos[0] - 0.4) < 1e-6, "width 0.4 across x");
  assert.equal(c.pos[2], 0);
  assert.equal(c.pos[8], -1);
});

test("skid style per surface; water leaves no mark", () => {
  assert.equal(skidStyle(12).width, 0);
  assert.ok(skidStyle(2).r < 0.1, "tarmac marks are dark");
  assert.ok(skidStyle(4).r > 0.4, "snow tracks are light");
});

test("percentile", () => {
  const a = new Float32Array([5, 1, 4, 2, 3]);
  assert.equal(percentile(a, 5, 0.5), 3);
  assert.equal(percentile(a, 5, 1), 5);
  assert.equal(percentile(a, 0, 0.5), 0);
});
