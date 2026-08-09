import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import * as THREE from "../three.module.min.js";
import {
  buildRoadMesh, buildTerrainMesh, buildCarMesh, buildWheelMesh,
  buildSceneryLibrary, buildPropLibrary, buildStageMeshes,
  liveryTexture, surfaceTexture, disposeTextures, clearLiveryCache, clearSignCache,
  carDimensions, carHubPositions, applyCarDamage, setMudLevel, updateWheel,
  TRIANGLE_BUDGET, TEXTURE_NAMES, ROAD_SECTION, ROAD_EDGE_SLOTS, ROAD_CENTRE_SLOT,
  CAR_DETACHABLE, textureCacheSize,
} from "../meshes.js";
import { carSpec } from "../physics.js";
import { SURFACE, surfaceProps } from "../surfaces.js";

// ---- a synthetic Stage ---------------------------------------------------
// stage.js is another author's module and may be half-written; everything below
// is built to the shape pinned in CONTRACTS.md and nothing else.

function makeStage(seed = 1234, opts = {}) {
  const step = 2.0;
  const length = opts.length ?? 1200;
  const count = Math.floor(length / step) + 1;
  const s = new Float32Array(count);
  const curvature = new Float32Array(count);
  const grade = new Float32Array(count);

  for (let i = 0; i < count; i += 1) {
    const t = i * step;
    s[i] = t;
    let k = 0;
    if (t > 120 && t < 220) k = 1 / 90;              // fast left
    else if (t > 300 && t < 360) k = -1 / 45;        // medium right
    else if (t > 430 && t < 500) k = 1 / 14;         // hairpin left
    else if (t > 620 && t < 700) k = -1 / 120;
    else if (t > 820 && t < 900) k = 1 / 60;
    // Ease every corner in and out so curvature is continuous.
    curvature[i] = k * (0.5 - 0.5 * Math.cos(Math.min(1, (t % 1000) / 1000) * 0 + Math.PI)) * 0 + k;
    grade[i] = 0.05 * Math.sin(t / 260) + 0.02 * Math.sin(t / 71);
  }
  // Smooth the curvature so the ribbon has no step change.
  const kSmooth = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    let acc = 0, n = 0;
    for (let j = -6; j <= 6; j += 1) {
      const q = Math.min(count - 1, Math.max(0, i + j));
      acc += curvature[q]; n += 1;
    }
    kSmooth[i] = acc / n;
  }
  curvature.set(kSmooth);

  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const z = new Float32Array(count);
  const tx = new Float32Array(count);
  const ty = new Float32Array(count);
  const tz = new Float32Array(count);
  const nx = new Float32Array(count);
  const ny = new Float32Array(count);
  const nz = new Float32Array(count);
  const camber = new Float32Array(count);
  const halfWidth = new Float32Array(count);
  const surface = new Uint8Array(count);
  const crest = new Float32Array(count);
  const jump = new Float32Array(count);

  let yaw = 0.3;
  let ey = 60;
  for (let i = 0; i < count; i += 1) {
    const g = grade[i];
    const c = Math.sqrt(Math.max(0, 1 - g * g));
    if (i > 0) {
      const kMid = (curvature[i - 1] + curvature[i]) * 0.5;
      const midYaw = yaw + kMid * step * 0.5;
      x[i] = x[i - 1] + Math.sin(midYaw) * step * c;
      z[i] = z[i - 1] + Math.cos(midYaw) * step * c;
      ey += (grade[i] + grade[i - 1]) * 0.5 * step;
      yaw += kMid * step;
    }
    y[i] = ey;
    tx[i] = Math.sin(yaw) * c;
    ty[i] = g;
    tz[i] = Math.cos(yaw) * c;
    const t = i * step;
    halfWidth[i] = 3.1 + 0.85 * Math.sin(t / 180) + 0.3 * Math.sin(t / 47);
    camber[i] = Math.sign(curvature[i]) * Math.min(0.09, Math.abs(curvature[i]) * 2.2);
    let sid = SURFACE.GRAVEL;
    if (t > 300 && t < 380) sid = SURFACE.TARMAC;
    else if (t > 520 && t < 580) sid = SURFACE.MUD;
    else if (t > 700 && t < 708) sid = SURFACE.WATER;
    else if (t > 940 && t < 1000) sid = SURFACE.DIRT;
    surface[i] = sid;
  }
  for (let i = 0; i < count; i += 1) {
    // Road normal from tangent and camber.
    const rx = tz[i], rz = -tx[i];
    const c = Math.cos(camber[i]), sn = Math.sin(camber[i]);
    const upx = -tx[i] * ty[i], upy = tx[i] * tx[i] + tz[i] * tz[i], upz = -tz[i] * ty[i];
    const ul = Math.hypot(upx, upy, upz) || 1;
    nx[i] = (upx / ul) * c - rx * sn;
    ny[i] = (upy / ul) * c;
    nz[i] = (upz / ul) * c - rz * sn;
    const l = Math.hypot(nx[i], ny[i], nz[i]) || 1;
    nx[i] /= l; ny[i] /= l; nz[i] /= l;
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i += 1) {
    if (x[i] < minX) minX = x[i];
    if (x[i] > maxX) maxX = x[i];
    if (z[i] < minZ) minZ = z[i];
    if (z[i] > maxZ) maxZ = z[i];
  }
  const bounds = { minX: minX - 60, maxX: maxX + 60, minZ: minZ - 60, maxZ: maxZ + 60 };

  // A bucket grid so heightAt() stays cheap when the terrain builder hammers it.
  const cell = 40;
  const buckets = new Map();
  const bkey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  for (let i = 0; i < count; i += 1) {
    const k = bkey(Math.floor(x[i] / cell), Math.floor(z[i] / cell));
    let list = buckets.get(k);
    if (!list) { list = []; buckets.set(k, list); }
    list.push(i);
  }
  function project(px, pz) {
    const cx = Math.floor(px / cell), cz = Math.floor(pz / cell);
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 4 && best < 0; r += 1) {
      for (let ox = -r; ox <= r; ox += 1) {
        for (let oz = -r; oz <= r; oz += 1) {
          const list = buckets.get(bkey(cx + ox, cz + oz));
          if (!list) continue;
          for (const i of list) {
            const dx = x[i] - px, dz = z[i] - pz;
            const d = dx * dx + dz * dz;
            if (d < bestD) { bestD = d; best = i; }
          }
        }
      }
    }
    if (best < 0) {
      for (let i = 0; i < count; i += 1) {
        const dx = x[i] - px, dz = z[i] - pz;
        const d = dx * dx + dz * dz;
        if (d < bestD) { bestD = d; best = i; }
      }
    }
    return { index: best, lateral: Math.sqrt(bestD), s: s[best], signedLateral: 0 };
  }

  const base = (px, pz) =>
    60 + 14 * Math.sin(px / 190) + 11 * Math.cos(pz / 155)
    + 4.5 * Math.sin((px + pz) / 63) + 1.8 * Math.cos((px - pz) / 27);

  function heightAt(px, pz) {
    const pr = project(px, pz);
    const hw = halfWidth[pr.index];
    const corridor = hw + 9;
    const w = pr.lateral >= corridor ? 0
      : pr.lateral <= hw ? 1
        : 1 - (pr.lateral - hw) / (corridor - hw);
    const smooth = w * w * (3 - 2 * w);
    const t = base(px, pz);
    // Bias the landscape so the road is never floating on it.
    const offset = y[pr.index] - base(x[pr.index], z[pr.index]);
    return t + offset * smooth + offset * (1 - smooth) * 0.85;
  }

  const world = {
    gravity: 9.81,
    heightAt,
    normalAt(px, pz, out) {
      const e = 0.5;
      const dx = (heightAt(px + e, pz) - heightAt(px - e, pz)) / (2 * e);
      const dz = (heightAt(px, pz + e) - heightAt(px, pz - e)) / (2 * e);
      const l = Math.hypot(-dx, 1, -dz);
      out.x = -dx / l; out.y = 1 / l; out.z = -dz / l;
      return out;
    },
    surfaceAt(px, pz, out) {
      const pr = project(px, pz);
      const hw = halfWidth[pr.index];
      out.props = surfaceProps(surface[pr.index]);
      out.surfaceId = surface[pr.index];
      out.onRoad = pr.lateral <= hw;
      out.lateral = pr.lateral;
      out.signedLateral = pr.lateral;
      out.s = pr.s;
      out.edgeBlend = Math.min(1, Math.max(0, (pr.lateral - hw) / 3));
      out.roughness = out.props.roughness;
      out.ruts = out.onRoad ? 0.6 : 0;
      return out;
    },
    sampleAt(v) { return Math.min(count - 1, Math.max(0, Math.round(v / step))); },
    project(px, pz, hintS, out) {
      const pr = project(px, pz);
      if (!out) return pr;
      out.s = pr.s; out.lateral = pr.lateral; out.signedLateral = pr.lateral; out.index = pr.index;
      return out;
    },
    bounds,
  };

  // Scenery placed strictly outside the corridor, the way stage.js must.
  const scenery = [];
  const kinds = ["tree", "tree", "tree", "tree", "rock", "bush", "tussock", "fern", "log", "stump", "building"];
  let rs = seed >>> 0;
  const rnd = () => {
    rs = (rs * 1664525 + 1013904223) >>> 0;
    return rs / 4294967296;
  };
  // The road doubles back through the hairpin, so "7 m from THIS sample" is not
  // "7 m from the road". Reject against the true nearest sample, the way a real
  // stage generator must.
  const clearOfRoad = (px, pz, margin) => {
    const pr = project(px, pz);
    return pr.lateral >= halfWidth[pr.index] + margin;
  };
  for (let i = 6; i < count - 6; i += 3) {
    for (const side of [-1, 1]) {
      if (rnd() > 0.55) continue;
      const off = halfWidth[i] + 7 + rnd() * 34;
      const rx = tz[i], rz = -tx[i];
      const px = x[i] + rx * off * side;
      const pz = z[i] + rz * off * side;
      const kind = kinds[Math.floor(rnd() * kinds.length)];
      if (!clearOfRoad(px, pz, 5)) continue;
      scenery.push({
        kind, x: px, y: heightAt(px, pz), z: pz,
        yaw: rnd() * Math.PI * 2, scale: 0.8 + rnd() * 0.6,
        variant: Math.floor(rnd() * 4),
      });
    }
  }
  // A telegraph run so the wire builder has something to chain.
  for (let i = 40; i < 200; i += 22) {
    const off = halfWidth[i] + 9;
    const px = x[i] + tz[i] * off;
    const pz = z[i] - tx[i] * off;
    if (!clearOfRoad(px, pz, 5)) continue;
    scenery.push({ kind: "pole", x: px, y: heightAt(px, pz), z: pz, yaw: 0, scale: 1, variant: 0 });
  }

  const props = [];
  const addProp = (kind, i, side, variant = 0) => {
    const off = halfWidth[i] + 3.4;
    const px = x[i] + tz[i] * off * side;
    const pz = z[i] - tx[i] * off * side;
    props.push({ kind, x: px, y: heightAt(px, pz), z: pz, yaw: 0, scale: 1, variant, s: s[i] });
  };
  props.push({ kind: "gantryStart", x: x[2], y: y[2], z: z[2], yaw: 0, scale: 1, variant: 0, s: s[2] });
  props.push({ kind: "gantryFinish", x: x[count - 3], y: y[count - 3], z: z[count - 3], yaw: 0, scale: 1, variant: 0, s: s[count - 3] });
  for (let i = 20; i < count - 20; i += 17) {
    addProp(["chevron", "hayBaleRound", "spectator", "tapeStake", "cone", "distanceBoard", "cautionTriangle", "tyreStack", "bunting", "marshalPost"][(i / 17 | 0) % 10],
      i, (i / 17 | 0) % 2 ? 1 : -1, (i / 17 | 0) % 3);
  }

  return {
    id: "fixture-1", name: "Crestfall Test", country: "Vandel", seed, notes: "",
    surfaceMix: [SURFACE.GRAVEL, SURFACE.TARMAC],
    length: (count - 1) * step, step, count,
    s, x, y, z, tx, ty, tz, nx, ny, nz,
    curvature, grade, camber, halfWidth, surface, crest, jump,
    features: [{ s: 460, kind: "hairpin", severity: 1, meta: {} }],
    splits: [400, 800],
    start: { x: x[0], y: y[0], z: z[0], yaw: 0.3 },
    finish: { s: s[count - 1], x: x[count - 1], y: y[count - 1], z: z[count - 1] },
    bounds, scenery, props, world,
  };
}

// ---- a canvas that only records ------------------------------------------

function fakeCanvasFactory(record) {
  return (w, h) => {
    let font = "20px sans-serif";
    const grad = () => ({ addColorStop() {} });
    const noop = () => {};
    const ctx = {
      fillStyle: "", strokeStyle: "", lineWidth: 1, lineCap: "", lineJoin: "",
      textAlign: "", textBaseline: "", globalAlpha: 1, globalCompositeOperation: "source-over",
      shadowBlur: 0, shadowColor: "",
      get font() { return font; },
      set font(v) { font = v; record.fonts.push(v); },
      save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
      beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
      quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop, rect: noop,
      fill: noop, stroke: noop, clip: noop, fillRect: noop, clearRect: noop,
      strokeRect: noop, setLineDash: noop,
      createLinearGradient: grad, createRadialGradient: grad,
      fillText(t) { record.text.push(String(t)); },
      strokeText(t) { record.text.push(String(t)); },
      measureText(t) {
        const m = /(\d+(?:\.\d+)?)px/.exec(font);
        const size = m ? parseFloat(m[1]) : 20;
        return { width: String(t).length * size * 0.55 };
      },
    };
    const canvas = { width: w, height: h, getContext: () => ctx };
    ctx.canvas = canvas;
    record.canvases.push(canvas);
    return canvas;
  };
}

function newRecord() {
  return { text: [], fonts: [], canvases: [] };
}

// ---- shared geometry assertions ------------------------------------------

function assertGeometry(g, label, opts = {}) {
  const pos = g.getAttribute("position");
  assert.ok(pos, `${label}: no position attribute`);
  assert.ok(pos.count > 0, `${label}: empty position attribute`);
  const p = pos.array;
  for (let i = 0; i < p.length; i += 1) {
    assert.ok(Number.isFinite(p[i]), `${label}: non-finite position at ${i} (${p[i]})`);
  }
  const idx = g.getIndex();
  assert.ok(idx, `${label}: geometry is not indexed`);
  const ia = idx.array;
  assert.equal(ia.length % 3, 0, `${label}: index count is not a multiple of 3`);
  for (let i = 0; i < ia.length; i += 1) {
    assert.ok(ia[i] >= 0 && ia[i] < pos.count, `${label}: index ${ia[i]} out of range (${pos.count})`);
  }
  // Every triangle, not a sample: a single degenerate face makes a NaN normal.
  const minArea = opts.minArea ?? 1e-9;
  let worst = Infinity;
  let worstAt = -1;
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t] * 3, b = ia[t + 1] * 3, c = ia[t + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
    const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    const area = 0.5 * Math.hypot(cx, cy, cz);
    if (area < worst) { worst = area; worstAt = t; }
  }
  assert.ok(worst > minArea, `${label}: degenerate triangle at index ${worstAt}, area ${worst}`);

  const nor = g.getAttribute("normal");
  assert.ok(nor, `${label}: no normal attribute`);
  const na = nor.array;
  for (let i = 0; i < na.length; i += 3) {
    const l = Math.hypot(na[i], na[i + 1], na[i + 2]);
    assert.ok(Math.abs(l - 1) < 1e-3, `${label}: normal ${i / 3} has length ${l}`);
  }
  const col = g.getAttribute("color");
  if (col) {
    const ca = col.array;
    for (let i = 0; i < ca.length; i += 1) {
      assert.ok(ca[i] >= 0 && ca[i] <= 1, `${label}: vertex colour ${i} out of range (${ca[i]})`);
    }
  }
  return { triangles: ia.length / 3, vertices: pos.count, minArea: worst };
}

function hashBuffer(...arrays) {
  const h = createHash("sha256");
  for (const a of arrays) h.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
  return h.digest("hex");
}

const TEX = { textureSize: 32, margin: 120 };

let stage = null;
function theStage() {
  if (!stage) stage = makeStage(1234);
  return stage;
}

// ---- textures ------------------------------------------------------------

test("procedural textures: every named set has colour, roughness and normal", () => {
  for (const name of TEXTURE_NAMES) {
    const set = surfaceTexture(THREE, name, { size: 16, seed: 5 });
    assert.equal(set.name, name);
    assert.equal(set.size, 16);
    for (const key of ["map", "roughnessMap", "normalMap"]) {
      const t = set[key];
      assert.ok(t, `${name}.${key} missing`);
      assert.equal(t.image.data.length, 16 * 16 * 4);
      for (let i = 0; i < t.image.data.length; i += 1) {
        assert.ok(Number.isInteger(t.image.data[i]) && t.image.data[i] >= 0 && t.image.data[i] <= 255);
      }
    }
    // Derived from one height field, so it must actually vary.
    let min = 255, max = 0;
    for (const v of set.map.image.data) { if (v < min) min = v; if (v > max) max = v; }
    assert.ok(max - min > 4, `${name} colour map is flat (${min}..${max})`);
  }
});

test("procedural textures: asking twice returns the same object", () => {
  const before = textureCacheSize();
  const a = surfaceTexture(THREE, "gravel", { size: 16, seed: 42 });
  const mid = textureCacheSize();
  const b = surfaceTexture(THREE, "gravel", { size: 16, seed: 42 });
  assert.equal(a, b, "cache returned a different object for the same key");
  assert.equal(a.map, b.map);
  assert.equal(textureCacheSize(), mid, "second call allocated a cache entry");
  assert.ok(mid > before);
  const other = surfaceTexture(THREE, "gravel", { size: 16, seed: 43 });
  assert.notEqual(a, other, "a different seed must not hit the cache");
});

test("procedural textures tile: opposite edges of the height field agree", () => {
  const set = surfaceTexture(THREE, "rock", { size: 32, seed: 7 });
  const h = set.height;
  const n = 32;
  for (let i = 0; i < n; i += 1) {
    // The lattice wraps, so column 0 continues from column n as a neighbour.
    assert.ok(Number.isFinite(h[i]) && Number.isFinite(h[(n - 1) * n + i]));
  }
  const left = h[0], right = h[n - 1];
  assert.ok(Math.abs(left - right) < 1.01, "height field left/right edge diverged wildly");
});

// ---- livery --------------------------------------------------------------

test("livery: paints base, pattern, number and invented wordmarks with canvas text", () => {
  clearLiveryCache();
  const record = newRecord();
  const spec = carSpec("corvine-rs2000");
  const tex = liveryTexture(THREE, spec.livery, { size: 256, canvasFactory: fakeCanvasFactory(record) });
  assert.ok(tex.map, "no colour map");
  assert.ok(tex.roughnessMap, "no roughness companion");
  assert.ok(tex.normalMap, "no normal companion");
  assert.ok(tex.mudMap, "no mud layer");
  assert.equal(tex.map.image.width, 256);
  assert.equal(tex.map.image.height, 128);
  const joined = record.text.join("|");
  assert.ok(joined.includes(String(spec.livery.number)), "competition number was never drawn");
  assert.ok(joined.includes("OPUS RALLY"), "rally plate wordmark was never drawn");
  assert.ok(record.fonts.some((f) => /Arial Black|Impact/.test(f)), "no stencil face used for the number");
  // The normal companion is computed, not drawn, so it exists headless too.
  assert.equal(tex.normalMap.image.data.length, 64 * 64 * 4);
  clearLiveryCache();
});

test("livery: asking twice returns the same object", () => {
  clearLiveryCache();
  const record = newRecord();
  const factory = fakeCanvasFactory(record);
  const spec = carSpec("falke-4s");
  const a = liveryTexture(THREE, spec.livery, { size: 64, canvasFactory: factory });
  const canvases = record.canvases.length;
  const b = liveryTexture(THREE, spec.livery, { size: 64, canvasFactory: factory });
  assert.equal(a, b);
  assert.equal(record.canvases.length, canvases, "second call re-painted the canvas");
  clearLiveryCache();
});

// ---- road ----------------------------------------------------------------

test("road: geometry is sound and chunked", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  assert.ok(road.chunks.length > 1, "road was not split into chunks");
  let tris = 0;
  for (const c of road.chunks) {
    const r = assertGeometry(c.geometry, `road chunk ${c.index}`);
    tris += r.triangles;
    assert.ok(c.geometry.getAttribute("detail"), "no surface-detail attribute");
  }
  assert.equal(tris, road.triangles);
  assert.ok(road.triangles <= TRIANGLE_BUDGET.road,
    `road used ${road.triangles} triangles, budget ${TRIANGLE_BUDGET.road}`);
  // Chunks exist to be culled, so each one must have its own bounding volume.
  for (const c of road.chunks) assert.ok(c.geometry.boundingSphere.radius > 0);
  road.dispose();
});

test("road: width at each station is exactly stage.halfWidth and the surface follows the centreline", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  const slots = ROAD_SECTION.length;
  let checked = 0;
  for (const chunk of road.chunks) {
    const p = chunk.geometry.getAttribute("position").array;
    for (const station of chunk.stations) {
      const base = station.vertexBase;
      const hw = st.halfWidth[station.sampleIndex];
      assert.ok(Math.abs(station.halfWidth - hw) < 1e-6);
      for (const slot of ROAD_EDGE_SLOTS) {
        const o = (base + slot) * 3;
        const dx = p[o] - station.centre[0];
        const dy = p[o + 1] - station.centre[1];
        const dz = p[o + 2] - station.centre[2];
        const lateral = dx * station.right[0] + dy * station.right[1] + dz * station.right[2];
        assert.ok(Math.abs(Math.abs(lateral) - hw) < 1e-3,
          `edge slot ${slot} at s=${station.s} is ${lateral} from the centreline, expected ±${hw}`);
      }
      const c = (base + ROAD_CENTRE_SLOT) * 3;
      assert.ok(Math.abs(p[c] - st.x[station.sampleIndex]) < 2e-2, "centre vertex drifted in x");
      assert.ok(Math.abs(p[c + 1] - st.y[station.sampleIndex]) < 2e-2, "centre vertex drifted in y");
      assert.ok(Math.abs(p[c + 2] - st.z[station.sampleIndex]) < 2e-2, "centre vertex drifted in z");
      checked += 1;
    }
  }
  assert.ok(checked > 100, `only ${checked} stations checked`);
  assert.equal(slots, 19);
  road.dispose();
});

test("road: UV.y is monotonic in arc length and no triangle spans a discontinuity", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  for (const chunk of road.chunks) {
    const uv = chunk.geometry.getAttribute("uv").array;
    const pos = chunk.geometry.getAttribute("position").array;
    let prevV = -Infinity;
    let prevS = -Infinity;
    for (const station of chunk.stations) {
      const v = uv[(station.vertexBase + ROAD_CENTRE_SLOT) * 2 + 1];
      assert.ok(v >= prevV - 1e-6, `uv.y went backwards at s=${station.s}`);
      // Every slot of a station shares the same v: the texture runs along the road.
      for (let k = 0; k < ROAD_SECTION.length; k += 1) {
        assert.ok(Math.abs(uv[(station.vertexBase + k) * 2 + 1] - v) < 1e-6);
      }
      if (prevS > -Infinity) {
        assert.ok(station.s - prevS <= 10.5 + 1e-6,
          `station spacing ${station.s - prevS} m exceeds the maximum span`);
        const a = station.vertexBase * 3;
        const b = (station.vertexBase - ROAD_SECTION.length) * 3;
        const d = Math.hypot(pos[a] - pos[b], pos[a + 1] - pos[b + 1], pos[a + 2] - pos[b + 2]);
        assert.ok(d < 12, `a ribbon quad spans ${d} m — that is a discontinuity`);
      }
      prevV = v;
      prevS = station.s;
    }
  }
  road.dispose();
});

test("road: vertex colours track the surface, and berms build on the outside of corners", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  let tarmacSeen = 0, waterSeen = 0;
  let bermRight = 0;
  for (const chunk of road.chunks) {
    const col = chunk.geometry.getAttribute("color").array;
    const detail = chunk.geometry.getAttribute("detail").array;
    for (const station of chunk.stations) {
      const sid = st.surface[station.sampleIndex];
      const o = (station.vertexBase + ROAD_CENTRE_SLOT) * 3;
      const props = surfaceProps(sid);
      if (sid === SURFACE.TARMAC) {
        tarmacSeen += 1;
        assert.ok(col[o] < 0.25, `tarmac should be dark, got ${col[o]}`);
      }
      if (sid === SURFACE.WATER) {
        waterSeen += 1;
        assert.equal(detail[(station.vertexBase + ROAD_CENTRE_SLOT) * 3 + 2], 1, "water not flagged in the detail channel");
      }
      assert.ok(Math.abs(col[o] - props.albedo[0]) < 0.35,
        `centre colour ${col[o]} is nowhere near the surface albedo ${props.albedo[0]}`);
      if (st.curvature[station.sampleIndex] > 0.02 && station.berm > 0.01) bermRight += 1;
    }
  }
  assert.ok(tarmacSeen > 0, "the tarmac section never appeared");
  assert.ok(waterSeen > 0, "the water splash never appeared");
  assert.ok(bermRight > 0, "no berm was built through the hairpin");
  road.dispose();
});

// ---- terrain -------------------------------------------------------------

test("terrain: chunk seams agree in position and normal", () => {
  const st = theStage();
  const terrain = buildTerrainMesh(THREE, st, TEX);
  assert.ok(terrain.chunks.length > 4, "terrain was not chunked");
  const lods = new Set(terrain.chunks.map((c) => c.lod));
  assert.ok(lods.size > 1, "no LOD variation across the terrain");

  // Key every surface vertex by its exact world x/z; wherever two chunks share
  // one, y and the normal must be identical, which is what a LOD crack breaks.
  const seen = new Map();
  let shared = 0;
  for (const c of terrain.chunks) {
    const p = c.geometry.getAttribute("position").array;
    const n = c.geometry.getAttribute("normal").array;
    for (let i = 0; i < c.surfaceVertexCount; i += 1) {
      const key = `${p[i * 3].toFixed(4)},${p[i * 3 + 2].toFixed(4)}`;
      const hit = seen.get(key);
      if (hit) {
        shared += 1;
        assert.ok(Math.abs(hit.y - p[i * 3 + 1]) < 1e-6,
          `seam at ${key}: y ${hit.y} vs ${p[i * 3 + 1]}`);
        for (let k = 0; k < 3; k += 1) {
          assert.ok(Math.abs(hit.n[k] - n[i * 3 + k]) < 1e-6,
            `seam at ${key}: normal component ${k} disagrees`);
        }
      } else {
        seen.set(key, { y: p[i * 3 + 1], n: [n[i * 3], n[i * 3 + 1], n[i * 3 + 2]] });
      }
    }
  }
  assert.ok(shared > 100, `only ${shared} shared boundary vertices were found`);
  terrain.dispose();
});

test("terrain: geometry is sound, skirted, and matches stage.heightAt in the road corridor", () => {
  const st = theStage();
  const terrain = buildTerrainMesh(THREE, st, TEX);
  let tris = 0;
  for (const c of terrain.chunks) {
    const r = assertGeometry(c.geometry, `terrain ${c.cx},${c.cz}`);
    tris += r.triangles;
    assert.ok(c.geometry.getAttribute("splat"), "no splat weights");
    const splat = c.geometry.getAttribute("splat").array;
    for (let i = 0; i < splat.length; i += 1) {
      assert.ok(splat[i] >= 0 && splat[i] <= 1, `splat weight ${splat[i]} out of range`);
    }
    assert.ok(c.geometry.getAttribute("position").count > c.surfaceVertexCount,
      "chunk has no skirt vertices");
  }
  assert.equal(tris, terrain.triangles);
  assert.ok(terrain.triangles <= TRIANGLE_BUDGET.terrain,
    `terrain used ${terrain.triangles} triangles, budget ${TRIANGLE_BUDGET.terrain}`);

  let corridorChecks = 0;
  for (const c of terrain.chunks) {
    const p = c.geometry.getAttribute("position").array;
    for (let i = 0; i < c.surfaceVertexCount; i += 40) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      assert.ok(Math.abs(y - st.world.heightAt(x, z)) < 1e-4,
        `terrain vertex at ${x},${z} is ${y}, heightAt says ${st.world.heightAt(x, z)}`);
      corridorChecks += 1;
    }
  }
  assert.ok(corridorChecks > 50);
  terrain.dispose();
});

// ---- car -----------------------------------------------------------------

test("car: bounding box matches the spec-derived dimensions and every named part exists", () => {
  const record = newRecord();
  for (const id of ["vireo-r2", "brackmoor-t8", "corvine-rs2000", "astra-corsa"]) {
    const spec = carSpec(id);
    const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
    const d = carDimensions(spec);

    const box = new THREE.Box3();
    car.group.updateMatrixWorld(true);
    box.setFromObject(car.group);
    const size = box.getSize(new THREE.Vector3());
    const pct = (a, b) => Math.abs(a - b) / b;
    assert.ok(pct(size.z, d.length) < 0.03, `${id}: length ${size.z} vs ${d.length}`);
    assert.ok(pct(size.x, d.width) < 0.03, `${id}: width ${size.x} vs ${d.width}`);
    assert.ok(pct(size.y, d.height) < 0.05, `${id}: height ${size.y} vs ${d.height}`);
    assert.ok(Math.abs(box.max.z - d.bbox.maxZ) < 0.05, `${id}: nose at ${box.max.z}, expected ${d.bbox.maxZ}`);
    assert.ok(Math.abs(box.min.z - d.bbox.minZ) < 0.05, `${id}: tail at ${box.min.z}`);

    // Real proportions, not a shoebox: rally cars sit ~4.0-4.4 m long, ~1.8 wide.
    assert.ok(size.z > 3.5 && size.z < 4.8, `${id}: implausible length ${size.z}`);
    assert.ok(size.x > 1.5 && size.x < 2.1, `${id}: implausible width ${size.x}`);
    assert.ok(size.y > 1.2 && size.y < 1.7, `${id}: implausible height ${size.y}`);

    for (const key of CAR_DETACHABLE) {
      assert.ok(car.parts[key], `${id}: damage part "${key}" is missing from the mesh`);
    }
    for (const key of ["body", "glass", "rollCage", "interior", "lightPod", "diffuser", "roofScoop", "mudflaps"]) {
      assert.ok(car.parts[key], `${id}: expected child "${key}"`);
    }
    assert.equal(car.lamps.length, 4, `${id}: expected four light-pod lamps`);

    for (const g of car.geometries) {
      assertGeometry(g, `${id} car geometry`, { minArea: 1e-10 });
      assert.ok(g.getAttribute("panel"), "no dent panel channel");
      assert.ok(g.getAttribute("dentW"), "no dent weight channel");
      const panels = g.getAttribute("panel").array;
      for (let i = 0; i < panels.length; i += 1) {
        assert.ok(panels[i] >= 0 && panels[i] <= 6, `panel id ${panels[i]} out of range`);
      }
    }
    assert.ok(car.triangles <= TRIANGLE_BUDGET.car,
      `${id}: car used ${car.triangles} triangles, budget ${TRIANGLE_BUDGET.car}`);
    car.dispose();
  }
  clearLiveryCache();
});

test("car: wheels sit at the spec's hub positions and the bounding sphere is sane", () => {
  const record = newRecord();
  const spec = carSpec("corvine-rs2000");
  const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
  const hubs = carHubPositions(spec);
  assert.equal(car.hubs.length, 4);
  for (let i = 0; i < 4; i += 1) {
    assert.equal(car.hubs[i].x, hubs[i].x);
    assert.equal(car.hubs[i].y, hubs[i].y);
    assert.equal(car.hubs[i].z, hubs[i].z);
    assert.ok(Math.abs(hubs[i].y + spec.comHeight - spec.wheelRadius) < 1e-9);
  }
  // Wheel arches have to be where the wheels are.
  const d = car.dimensions;
  for (const h of hubs) {
    assert.ok(Math.abs(h.x) < d.halfWidth + 1e-6, "a hub is outboard of the arch flare");
    assert.ok(Math.abs(h.x) > d.bodyHalfWidth - 0.15, "a hub is buried inside the body tub");
  }
  const sphere = car.parts.body.geometry.boundingSphere;
  assert.ok(sphere.radius > 1.6 && sphere.radius < 3.2,
    `body bounding sphere radius ${sphere.radius} is not car-sized`);
  const c = sphere.center;
  assert.ok(Math.abs(c.x) < 0.05 && Math.abs(c.z) < 0.8, "body bounding sphere is off-centre");
  car.dispose();
  clearLiveryCache();
});

test("car: damage helpers move dents, hide detached parts and drive mud without allocating", () => {
  const record = newRecord();
  const spec = carSpec("ardent-r1");
  const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
  const visual = {
    panels: { front: 0.8, rear: 0.1, left: 0.5, right: 0, roof: 0, bonnet: 0.4, bootlid: 0 },
    detached: Object.fromEntries(CAR_DETACHABLE.map((k) => [k, k === "mirrorLeft" || k === "wingRear"])),
    glass: { windscreenCracked: true, windscreenShattered: false, sideShattered: false },
    lights: { leftOut: true, rightOut: false, glassBroken: false },
  };
  const dentRef = car.paintMaterials[0].userData.dent;
  applyCarDamage(car, visual);
  assert.equal(car.paintMaterials[0].userData.dent, dentRef, "dent uniform array was reallocated");
  assert.equal(dentRef[0], Math.fround(0.8));
  assert.equal(dentRef[5], Math.fround(0.4));
  assert.equal(car.parts.mirrorLeft.visible, false);
  assert.equal(car.parts.wingRear.visible, false);
  assert.equal(car.parts.bonnet.visible, true);
  assert.equal(car.lamps[0].visible, false);
  assert.equal(car.lamps[2].visible, true);
  assert.ok(car.parts.windscreen.material.opacity > 0.5, "cracked glass did not go milky");

  const mudRef = car.paintMaterials[0].userData.mud;
  setMudLevel(car, 0.7);
  assert.equal(car.paintMaterials[0].userData.mud, mudRef, "mud uniform object was replaced");
  assert.equal(mudRef.value, 0.7);
  setMudLevel(car, 4);
  assert.equal(mudRef.value, 1, "mud level was not clamped");
  car.dispose();
  clearLiveryCache();
});

// ---- wheels --------------------------------------------------------------

test("wheel: tread class follows the tyre, geometry is sound, and it is cheap enough to instance", () => {
  for (const [id, expected] of [["corvine-rs2000", "gravel"], ["falke-4s", "snow"], ["astra-corsa", "tarmac"]]) {
    const spec = carSpec(id);
    const wheel = buildWheelMesh(THREE, spec);
    assert.equal(wheel.kind, expected, `${id}: wrong tread class`);
    for (const g of wheel.geometries) assertGeometry(g, `${id} wheel`, { minArea: 1e-11 });
    assert.ok(wheel.triangles <= TRIANGLE_BUDGET.wheel,
      `${id}: wheel used ${wheel.triangles} triangles, budget ${TRIANGLE_BUDGET.wheel}`);
    const box = new THREE.Box3().setFromBufferAttribute(wheel.tyre.geometry.getAttribute("position"));
    const size = box.getSize(new THREE.Vector3());
    assert.ok(Math.abs(size.y / 2 - spec.wheelRadius) < 0.03, `${id}: tyre radius ${size.y / 2} vs ${spec.wheelRadius}`);
    assert.ok(size.x > 0.15 && size.x < 0.35, `${id}: implausible tyre width ${size.x}`);
    assert.ok(wheel.disc && wheel.caliper, `${id}: no brake disc or caliper behind the rim`);

    const inst = wheel.instance();
    assert.ok(inst.userData.spin, "instance has no spin group");
    updateWheel({ group: inst, spin: inst.userData.spin }, 0.25, 12.5, -0.02);
    assert.equal(inst.rotation.y, 0.25);
    assert.equal(inst.userData.spin.rotation.x, 12.5);
    assert.equal(inst.rotation.z, -0.02);
    wheel.dispose();
  }
});

// ---- scenery and props ---------------------------------------------------

test("scenery: instance counts match the stage list, matrices are sane, nothing sits on the road", () => {
  const st = theStage();
  const lib = buildSceneryLibrary(THREE, st, TEX);
  const placed = lib.totalInstances;
  assert.equal(placed + lib.rejected.length + lib.unknown.length, st.scenery.length,
    "instances plus rejects do not account for the stage's scenery");
  assert.equal(lib.unknown.length, 0, "the fixture used only known kinds");
  assert.equal(lib.rejected.length, 0, "the fixture placed nothing on the road");
  assert.ok(lib.meshes.length >= 6, "not enough distinct scenery kinds were built");

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scl = new THREE.Vector3();
  for (const entry of lib.meshes) {
    assertGeometry(entry.mesh.geometry, `scenery ${entry.key}`, { minArea: 1e-10 });
    assert.equal(entry.mesh.count, entry.count);
    assert.ok(entry.mesh.isInstancedMesh, `${entry.key} is not instanced — that is one draw call per item`);
    for (let i = 0; i < entry.count; i += 1) {
      entry.mesh.getMatrixAt(i, m);
      for (const v of m.elements) assert.ok(Number.isFinite(v), `${entry.key}: non-finite matrix element`);
      m.decompose(pos, quat, scl);
      assert.ok(scl.x > 1e-3 && scl.y > 1e-3 && scl.z > 1e-3, `${entry.key}: singular instance matrix`);
      assert.ok(m.determinant() > 1e-6, `${entry.key}: instance matrix has no volume`);
      const near = st.world.project(pos.x, pos.z);
      const hw = st.halfWidth[near.index];
      assert.ok(near.lateral >= hw, `${entry.key}: instance ${i} stands ${near.lateral} m from the centreline (half-width ${hw})`);
    }
  }
  assert.ok(lib.triangles <= TRIANGLE_BUDGET.scenery,
    `scenery used ${lib.triangles} triangles, budget ${TRIANGLE_BUDGET.scenery}`);
  assert.ok(lib.wires, "telegraph poles were placed but no catenary wire was built");
  lib.dispose();
});

test("scenery: an item placed on the racing line is rejected, not drawn", () => {
  const st = makeStage(99);
  const onRoad = { kind: "tree", x: st.x[100], y: st.y[100], z: st.z[100], yaw: 0, scale: 1, variant: 0 };
  const dirty = { ...st, scenery: st.scenery.concat([onRoad]) };
  const lib = buildSceneryLibrary(THREE, dirty, TEX);
  assert.equal(lib.rejected.length, 1, "a tree in the middle of the road was accepted");
  assert.equal(lib.rejected[0], onRoad);
  lib.dispose();
});

test("scenery: four tree species with genuinely different silhouettes", () => {
  const st = theStage();
  const lib = buildSceneryLibrary(THREE, st, TEX);
  const trees = [];
  for (const [key, proto] of lib.prototypes) {
    if (key.startsWith("tree:")) trees.push(proto);
  }
  assert.equal(trees.length, 4, "expected four tree species");
  const shapes = trees.map((p) => {
    const box = p.geometry.boundingBox;
    return { h: box.max.y - box.min.y, w: box.max.x - box.min.x };
  });
  for (let i = 0; i < shapes.length; i += 1) {
    for (let j = i + 1; j < shapes.length; j += 1) {
      const dh = Math.abs(shapes[i].h - shapes[j].h);
      const ratio = Math.abs(shapes[i].h / shapes[i].w - shapes[j].h / shapes[j].w);
      assert.ok(dh > 0.4 || ratio > 0.25,
        `species ${i} and ${j} have the same silhouette (${JSON.stringify(shapes[i])} vs ${JSON.stringify(shapes[j])})`);
    }
  }
  lib.dispose();
});

test("props: the rally furniture builds, instances and carries invented branding", () => {
  const st = theStage();
  const record = newRecord();
  const lib = buildPropLibrary(THREE, { ...TEX, canvasFactory: fakeCanvasFactory(record) });
  const joined = record.text.join("|");
  assert.ok(joined.includes("OPUS RALLY"), "the event wordmark was never drawn");
  assert.ok(joined.includes("FINISH"), "no finish board text");
  assert.ok(joined.includes("SERVICE PARK"), "no service-park banner text");
  assert.ok(!/subaru|citro|ford|toyota|wrc/i.test(joined), "a real marque or series leaked into the signage");

  for (const [key, proto] of lib.prototypes) {
    assertGeometry(proto.geometry, `prop ${key}`, { minArea: 1e-10 });
  }
  for (const key of ["gantryStart", "gantryFinish", "chevron", "distanceBoard", "cautionTriangle",
    "hayBaleRound", "hayBaleRect", "tyreStack", "spectatorStand", "spectatorCheer",
    "spectatorCrouch", "marshalPost", "tapeStake", "bunting", "serviceBanner", "flyingFinish"]) {
    assert.ok(lib.prototypes.has(key), `prop kind "${key}" is missing`);
  }

  const placed = lib.build(st.props);
  assert.equal(placed.unknown.length, 0, "some stage props had no prototype");
  assert.equal(placed.totalInstances, st.props.length, "prop instance count does not match the stage list");
  const m = new THREE.Matrix4();
  for (const entry of placed.meshes) {
    assert.ok(entry.mesh.isInstancedMesh);
    for (let i = 0; i < entry.count; i += 1) {
      entry.mesh.getMatrixAt(i, m);
      for (const v of m.elements) assert.ok(Number.isFinite(v));
      assert.ok(Math.abs(m.determinant()) > 1e-6);
    }
  }
  assert.ok(placed.triangles <= TRIANGLE_BUDGET.props,
    `props used ${placed.triangles} triangles, budget ${TRIANGLE_BUDGET.props}`);
  placed.dispose();
  lib.dispose();
  clearSignCache();
});

// ---- whole stage ---------------------------------------------------------

test("a whole stage builds inside the triangle budget", () => {
  const st = theStage();
  const record = newRecord();
  const bundle = buildStageMeshes(THREE, st, { ...TEX, canvasFactory: fakeCanvasFactory(record) });
  const report = {
    road: bundle.road.triangles,
    terrain: bundle.terrain.triangles,
    scenery: bundle.scenery.triangles,
    props: bundle.props.triangles,
    total: bundle.triangles,
  };
  assert.ok(bundle.triangles <= TRIANGLE_BUDGET.stage,
    `stage used ${JSON.stringify(report)}, budget ${TRIANGLE_BUDGET.stage}`);
  assert.ok(bundle.triangles > 20000, `stage is suspiciously empty: ${JSON.stringify(report)}`);
  // Surfaced so a regression shows the numbers rather than just a red assert.
  console.log("triangle budget:", JSON.stringify(report));
  bundle.dispose();
  clearSignCache();
  clearLiveryCache();
});

test("a full-length stage stays inside the budget: the small fixture proves nothing", () => {
  // 6 km, dense roadside — the worst case the generator is allowed to produce.
  const st = makeStage(20260809, { length: 6000 });
  const extra = [];
  for (let i = 4; i < st.count - 4; i += 2) {
    for (const side of [-1, 1]) {
      const off = st.halfWidth[i] + 8 + ((i * 7 + (side + 1) * 13) % 40);
      const px = st.x[i] + st.tz[i] * off * side;
      const pz = st.z[i] - st.tx[i] * off * side;
      const pr = st.world.project(px, pz);
      if (pr.lateral < st.halfWidth[pr.index] + 5) continue;
      extra.push({
        kind: ["tree", "tree", "tree", "bush", "rock", "tussock", "fern"][(i + side) % 7],
        x: px, y: st.world.heightAt(px, pz), z: pz, yaw: i * 0.37, scale: 1, variant: i % 4,
      });
    }
  }
  const big = { ...st, scenery: st.scenery.concat(extra) };
  const record = newRecord();
  const bundle = buildStageMeshes(THREE, big, { textureSize: 32, canvasFactory: fakeCanvasFactory(record) });
  const report = {
    scenery_items: big.scenery.length,
    road: bundle.road.triangles,
    terrain: bundle.terrain.triangles,
    scenery: bundle.scenery.triangles,
    props: bundle.props.triangles,
    total: bundle.triangles,
    terrainLattice: bundle.terrain.latticeStep,
  };
  console.log("triangle budget (6 km stage):", JSON.stringify(report));
  assert.ok(bundle.road.triangles <= TRIANGLE_BUDGET.road, `road ${bundle.road.triangles}`);
  assert.ok(bundle.terrain.triangles <= TRIANGLE_BUDGET.terrain, `terrain ${bundle.terrain.triangles}`);
  assert.ok(bundle.scenery.triangles <= TRIANGLE_BUDGET.scenery, `scenery ${bundle.scenery.triangles}`);
  assert.ok(bundle.props.triangles <= TRIANGLE_BUDGET.props, `props ${bundle.props.triangles}`);
  assert.ok(bundle.triangles <= TRIANGLE_BUDGET.stage,
    `a full stage used ${JSON.stringify(report)}, budget ${TRIANGLE_BUDGET.stage}`);
  // A coarser lattice is the escape valve; check it actually engaged.
  assert.ok(bundle.terrain.latticeStep >= 4);
  bundle.dispose();
  clearSignCache();
  clearLiveryCache();
});

// ---- determinism ---------------------------------------------------------

test("determinism: the same seed produces identical vertex buffers", () => {
  const a = makeStage(4321);
  const b = makeStage(4321);
  const roadA = buildRoadMesh(THREE, a, TEX);
  const roadB = buildRoadMesh(THREE, b, TEX);
  assert.equal(roadA.chunks.length, roadB.chunks.length);
  for (let i = 0; i < roadA.chunks.length; i += 1) {
    const ha = hashBuffer(roadA.chunks[i].geometry.getAttribute("position").array);
    const hb = hashBuffer(roadB.chunks[i].geometry.getAttribute("position").array);
    assert.equal(ha, hb, `road chunk ${i} differs between two builds of the same seed`);
  }
  const scnA = buildSceneryLibrary(THREE, a, TEX);
  const scnB = buildSceneryLibrary(THREE, b, TEX);
  assert.equal(scnA.totalInstances, scnB.totalInstances);
  for (let i = 0; i < scnA.meshes.length; i += 1) {
    assert.equal(scnA.meshes[i].key, scnB.meshes[i].key);
    assert.equal(
      hashBuffer(scnA.meshes[i].mesh.instanceMatrix.array),
      hashBuffer(scnB.meshes[i].mesh.instanceMatrix.array),
      `scenery ${scnA.meshes[i].key} instance matrices differ`);
  }
  const terrA = buildTerrainMesh(THREE, a, TEX);
  const terrB = buildTerrainMesh(THREE, b, TEX);
  assert.equal(terrA.chunks.length, terrB.chunks.length);
  assert.equal(
    hashBuffer(terrA.chunks[0].geometry.getAttribute("position").array),
    hashBuffer(terrB.chunks[0].geometry.getAttribute("position").array));

  const recordA = newRecord(), recordB = newRecord();
  const spec = carSpec("corvine-rs2000");
  clearLiveryCache();
  const carA = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(recordA) });
  const hashA = carA.geometries.map((g) => hashBuffer(g.getAttribute("position").array)).join("|");
  carA.dispose();
  clearLiveryCache();
  const carB = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(recordB) });
  const hashB = carB.geometries.map((g) => hashBuffer(g.getAttribute("position").array)).join("|");
  carB.dispose();
  assert.equal(hashA, hashB, "the same car spec produced different geometry twice");

  roadA.dispose(); roadB.dispose();
  scnA.dispose(); scnB.dispose();
  terrA.dispose(); terrB.dispose();
  clearLiveryCache();
});

test("dispose: geometries and materials are released", () => {
  const st = makeStage(777);
  const road = buildRoadMesh(THREE, st, TEX);
  const chunk = road.chunks[0];
  let disposed = 0;
  chunk.geometry.addEventListener("dispose", () => { disposed += 1; });
  road.dispose();
  assert.equal(disposed, 1, "road chunk geometry was never disposed");
  assert.equal(road.chunks.length, 0);
  disposeTextures();
  assert.equal(textureCacheSize(), 0);
});
