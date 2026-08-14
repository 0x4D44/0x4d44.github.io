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
  CAR_DETACHABLE, textureCacheSize, LETTERED_PROTOTYPES, PROP_BANNERS, __primitives,
} from "../meshes.js";
import { carSpec } from "../physics.js";
import { SURFACE, surfaceProps } from "../surfaces.js";
// Which way a sign faces is an invariant across two modules: meshes.js decides
// which face carries the lettering, stage.js decides how the prop is turned. The
// only honest check builds a real stage and puts the two together.
import { generateStage, STAGE_BOOK } from "../stage.js";

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

// ---- orientation ---------------------------------------------------------
// Everything below this line exists because 23 green tests once hid a road you
// could not see: the suite measured distances, counts and colours and never once
// asked which way a face was pointing.

// Every triangle as {n, area, centroid, verts}. The normal is the geometric one
// the winding implies, not the stored attribute — those two disagreeing is the
// defect being hunted.
function facesOf(geometry) {
  const p = geometry.getAttribute("position").array;
  const uv = geometry.getAttribute("uv");
  const ia = geometry.getIndex().array;
  const out = [];
  for (let t = 0; t < ia.length; t += 3) {
    const a = ia[t], b = ia[t + 1], c = ia[t + 2];
    const ux = p[b * 3] - p[a * 3], uy = p[b * 3 + 1] - p[a * 3 + 1], uz = p[b * 3 + 2] - p[a * 3 + 2];
    const vx = p[c * 3] - p[a * 3], vy = p[c * 3 + 1] - p[a * 3 + 1], vz = p[c * 3 + 2] - p[a * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    out.push({
      idx: [a, b, c],
      n: [nx / l, ny / l, nz / l],
      area: l * 0.5,
      centroid: [
        (p[a * 3] + p[b * 3] + p[c * 3]) / 3,
        (p[a * 3 + 1] + p[b * 3 + 1] + p[c * 3 + 1]) / 3,
        (p[a * 3 + 2] + p[b * 3 + 2] + p[c * 3 + 2]) / 3,
      ],
      xyz: (k) => [p[k * 3], p[k * 3 + 1], p[k * 3 + 2]],
      uvAt: (k) => (uv ? [uv.array[k * 2], uv.array[k * 2 + 1]] : null),
    });
  }
  return out;
}

test("primitives: every face of every primitive winds outward", () => {
  const W = [1, 1, 1];
  const P = __primitives;
  const cases = [
    ["pushBox", (b) => P.pushBox(b, 0, 0, 0, 2, 1.4, 3, W)],
    ["pushTaper", (b) => P.pushTaper(b, 0, 0, 0, 2, 2, 1, 1.4, -1, 1, W)],
    ["pushTaper(shifted)", (b) => P.pushTaper(b, 0, 0, 0, 2, 2, 1.2, 0.6, -0.8, 0.9, W, 0.25)],
    ["pushCylinder(y)", (b) => P.pushCylinder(b, 0, 0, 0, 0.6, 0.4, 2, 10, "y", W)],
    ["pushCylinder(z)", (b) => P.pushCylinder(b, 0, 0, 0, 0.5, 0.5, 1.6, 8, "z", W)],
    ["pushCone", (b) => P.pushCone(b, 0, 0, 0, 0.8, 2, 9, W)],
    ["pushBlob", (b) => P.pushBlob(b, 0, 0, 0, 1, 0.7, 1.2, W, 1, 5, 0)],
    ["pushTube", (b) => P.pushTube(b, [[0, 0, -1], [0, 0, 0], [0, 0, 1]], 0.3, 7, W, true)],
    ["pushLoft", (b) => P.pushLoft(b, [
      [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1]],
      [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
    ], W, true, true)],
  ];
  for (const [label, build] of cases) {
    const b = P.mkBuilder();
    build(b);
    const g = P.finish(THREE, b, {});
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const ref = [(bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, (bb.min.z + bb.max.z) / 2];
    let inward = 0;
    for (const f of facesOf(g)) {
      const d = (f.centroid[0] - ref[0]) * f.n[0]
        + (f.centroid[1] - ref[1]) * f.n[1]
        + (f.centroid[2] - ref[2]) * f.n[2];
      if (d <= 0) inward += 1;
    }
    assert.equal(inward, 0, `${label}: ${inward} faces wind inward, so a FrontSide material culls them`);
    g.dispose();
  }
});

test("road: the running surface faces the sky, and agrees with the terrain beside it", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  const terrain = buildTerrainMesh(THREE, st, TEX);
  assert.equal(road.material.side, THREE.FrontSide,
    "this test only means anything while the road is single-sided");

  for (const chunk of road.chunks) {
    let sum = 0, n = 0, worst = 1;
    for (const f of facesOf(chunk.geometry)) { sum += f.n[1]; n += 1; worst = Math.min(worst, f.n[1]); }
    assert.ok(sum / n > 0.9,
      `road chunk ${chunk.index}: mean winding normal Y is ${(sum / n).toFixed(3)}, so the ribbon is back-face culled from above`);
    assert.ok(worst > 0, `road chunk ${chunk.index}: a face winds downward (Y ${worst.toFixed(3)})`);
  }
  // The stored normals must agree with the winding, or the ribbon draws but
  // lights inside out.
  for (const chunk of road.chunks) {
    const nor = chunk.geometry.getAttribute("normal").array;
    for (let i = 0; i < nor.length; i += 3) {
      assert.ok(nor[i + 1] > 0.5, `road stored normal ${i / 3} points at the ground (${nor[i + 1]})`);
    }
  }
  let terrainUp = 0, terrainN = 0;
  for (const f of facesOf(terrain.chunks[0].geometry)) { terrainUp += f.n[1]; terrainN += 1; }
  assert.ok(terrainUp / terrainN > 0, "the terrain reference itself does not face up");
  road.dispose();
  terrain.dispose();
});

test("road: the cross-section is the right way up and camber banks down to the left", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  const slot = (kind, from = 0) => ROAD_SECTION.findIndex((s2, i) => i >= from && s2.kind === kind);
  const leftDitch = slot("ditch");
  const leftShoulder = slot("shoulder");
  const leftEdge = ROAD_EDGE_SLOTS[0], rightEdge = ROAD_EDGE_SLOTS[1];
  const leftRut = slot("rut");
  const leftCrown = slot("crown");

  let cambered = 0;
  let rutSum = 0, rutN = 0;
  // Per-slot surface noise is +-12 mm, so a single station can wobble by 24 mm
  // between two slots without meaning anything. A sign error is 60 mm the other
  // way, which is why the mean is asserted as well as each station.
  const NOISE = 0.025;
  for (const chunk of road.chunks) {
    const p = chunk.geometry.getAttribute("position").array;
    for (const station of chunk.stations) {
      // Section height, not world y: the slots sit at different lateral offsets,
      // so on a cambered road their world heights differ for reasons that have
      // nothing to do with the profile.
      const h = (k) => {
        const o = (station.vertexBase + k) * 3;
        return (p[o] - station.centre[0]) * station.up[0]
          + (p[o + 1] - station.centre[1]) * station.up[1]
          + (p[o + 2] - station.centre[2]) * station.up[2];
      };
      const centre = h(ROAD_CENTRE_SLOT);
      // Water drains outward: the crown is the high point and everything the
      // road wears into itself sits below it.
      assert.ok(h(leftRut) < h(leftCrown) + NOISE,
        `rut stands ${(h(leftRut) - h(leftCrown)).toFixed(3)} m proud of the crown`);
      rutSum += h(leftCrown) - h(leftRut); rutN += 1;
      assert.ok(h(leftDitch) < h(leftShoulder) - 0.1,
        `the ditch is ${(h(leftDitch) - h(leftShoulder)).toFixed(3)} m above the shoulder, i.e. a bank`);
      assert.ok(h(leftShoulder) < centre - 0.05, "the shoulder is level with or above the crown");
      const camber = st.camber[station.sampleIndex];
      if (Math.abs(camber) > 0.05) {
        cambered += 1;
        // CONTRACTS.md: positive camber banks the surface DOWN to the left, so
        // the right-hand edge stands higher in the world.
        const o = (k) => p[(station.vertexBase + k) * 3 + 1];
        const tilt = o(rightEdge) - o(leftEdge);
        assert.ok(Math.sign(tilt) === Math.sign(camber),
          `camber ${camber.toFixed(3)} banks the road ${tilt > 0 ? "down to the left" : "down to the right"} (edge delta ${tilt.toFixed(3)}), which is backwards`);
      }
    }
  }
  assert.ok(cambered > 4, `only ${cambered} stations carried enough camber to test`);
  assert.ok(rutSum / rutN > 0.02,
    `the ruts average ${(rutSum / rutN).toFixed(4)} m below the crown, which is not a rut`);
  road.dispose();
});

// ---- lettering -----------------------------------------------------------

// The face of a sign is the only part of it that matters. `approach` is the
// direction, in the prototype's own frame, that the car comes from.
function letteredFaces(geometry) {
  const all = facesOf(geometry).filter((f) => Math.abs(f.n[2]) > 0.99);
  const max = all.reduce((m, f) => Math.max(m, f.area), 0);
  return all.filter((f) => f.area >= max * 0.2);
}

// A driver looking at a face whose normal is n stands along +n and has their
// right hand along (-n) x up, which for these +-Z boards is x = sign(n.z). Text
// reads correctly only when u grows that way and v grows upward.
function readsCorrectly(face) {
  const rightX = Math.sign(face.n[2]);
  let du = 0, dx = 0, dv = 0, dy = 0;
  for (let a = 0; a < 3; a += 1) {
    for (let b = a + 1; b < 3; b += 1) {
      const pi = face.xyz(face.idx[a]), pj = face.xyz(face.idx[b]);
      const ui = face.uvAt(face.idx[a]), uj = face.uvAt(face.idx[b]);
      if (Math.abs(pj[0] - pi[0]) > Math.abs(dx)) { dx = pj[0] - pi[0]; du = uj[0] - ui[0]; }
      if (Math.abs(pj[1] - pi[1]) > Math.abs(dy)) { dy = pj[1] - pi[1]; dv = uj[1] - ui[1]; }
    }
  }
  return { mirrored: Math.sign(du / dx) !== rightX, upsideDown: dv / dy <= 0 };
}

test("props: every lettered face is turned towards the car that has to read it", () => {
  const record = newRecord();
  const lib = buildPropLibrary(THREE, { ...TEX, canvasFactory: fakeCanvasFactory(record) });
  const def = STAGE_BOOK[0];
  const st = generateStage(def.seed, def.params || {});

  // No lettering may be mirrored or upside down from either side of the board.
  for (const key of LETTERED_PROTOTYPES) {
    const proto = lib.prototypes.get(key);
    assert.ok(proto, `lettered prototype "${key}" is missing`);
    const faces = letteredFaces(proto.geometry);
    assert.ok(faces.length > 0, `${key}: no lettered face found`);
    for (const f of faces) {
      const r = readsCorrectly(f);
      assert.equal(r.mirrored, false, `${key}: the face pointing (${f.n.map((v) => v.toFixed(2))}) reads mirrored`);
      assert.equal(r.upsideDown, false, `${key}: the face pointing (${f.n.map((v) => v.toFixed(2))}) reads upside down`);
    }
  }

  // Then, against the real stage: the lettered face has to be the one the car
  // meets. `local` undoes the prop's own yaw on the direction back up the road.
  const checked = new Set();
  for (const it of st.props) {
    const kind = lib.aliases[it.kind] || it.kind;
    const key = PROP_BANNERS[kind] || (LETTERED_PROTOTYPES.includes(kind) ? kind : null);
    if (!key) continue;
    const i = Math.min(st.count - 1, Math.max(0, Math.round((it.s || 0) / st.step)));
    const heading = Math.atan2(st.tx[i], st.tz[i]);
    const wx = -Math.sin(heading), wz = -Math.cos(heading);
    const cy = Math.cos(it.yaw), sy = Math.sin(it.yaw);
    const approach = [wx * cy - wz * sy, 0, wx * sy + wz * cy];
    const faces = letteredFaces(lib.prototypes.get(key).geometry);
    const facing = faces.some((f) => f.n[0] * approach[0] + f.n[2] * approach[2] > 0.99);
    assert.ok(facing,
      `${key} at s=${(it.s || 0).toFixed(0)}: the car approaches from local (${approach.map((v) => v.toFixed(2))}) `
      + `but the lettered faces point ${faces.map((f) => `(${f.n.map((v) => v.toFixed(2))})`).join(" ")} — the wordmark reads mirrored`);
    checked.add(key);
  }
  assert.ok(checked.has("startBanner"), "the start gantry banner was never checked against a placement");
  assert.ok(checked.has("finishBanner"), "the finish gantry banner was never checked");
  assert.ok(checked.has("serviceBanner"), "the service banner was never checked");
  assert.ok(checked.has("chevron") && checked.has("distanceBoard"), "no roadside board was checked");

  // stage.js does not place every board yet; the ones it does not must still
  // agree with the ones it does, or they break the day they are placed.
  const anchor = letteredFaces(lib.prototypes.get("chevron").geometry).map((f) => f.n[2].toFixed(2)).sort().join();
  for (const key of ["flyingFinish", "arrowLeft", "arrowRight", "cautionTriangle"]) {
    const got = letteredFaces(lib.prototypes.get(key).geometry).map((f) => f.n[2].toFixed(2)).sort().join();
    assert.equal(got, anchor, `${key} does not face the same way as the boards stage.js actually places`);
  }
  lib.dispose();
  clearSignCache();
});

test("props: a lettered face maps its canvas exactly once, and boards that differ get different textures", () => {
  const record = newRecord();
  const lib = buildPropLibrary(THREE, { ...TEX, canvasFactory: fakeCanvasFactory(record) });
  // The sign canvas is clamped, so any UV outside 0..1 is a smeared edge column.
  for (const key of LETTERED_PROTOTYPES) {
    const g = lib.prototypes.get(key).geometry;
    const uv = g.getAttribute("uv").array;
    for (const f of letteredFaces(g)) {
      let uLo = 9, uHi = -9, vLo = 9, vHi = -9;
      for (const k of f.idx) {
        uLo = Math.min(uLo, uv[k * 2]); uHi = Math.max(uHi, uv[k * 2]);
        vLo = Math.min(vLo, uv[k * 2 + 1]); vHi = Math.max(vHi, uv[k * 2 + 1]);
      }
      assert.ok(uLo >= -1e-6 && uHi <= 1 + 1e-6, `${key}: lettered face u runs ${uLo}..${uHi}, outside the canvas`);
      assert.ok(vLo >= -1e-6 && vHi <= 1 + 1e-6, `${key}: lettered face v runs ${vLo}..${vHi}, outside the canvas`);
    }
    const span = letteredFaces(g).reduce((m, f) => {
      for (const k of f.idx) m = Math.max(m, uv[k * 2]);
      return m;
    }, 0);
    assert.ok(span > 0.99, `${key}: the lettered face only reaches u=${span.toFixed(2)}, so the sign is cropped`);
  }
  // The cache is keyed on what changes a pixel: a left arrow that shares the
  // right arrow's texture points the driver into the ditch.
  const mapOf = (k) => lib.prototypes.get(k).material.map;
  assert.ok(mapOf("chevron"), "the sign canvas never produced a texture, so this proves nothing");
  assert.notEqual(mapOf("arrowLeft"), mapOf("arrowRight"), "arrowLeft and arrowRight share one texture");
  assert.notEqual(mapOf("arrowLeft"), mapOf("chevron"), "arrowLeft and chevron share one texture");
  assert.notEqual(mapOf("startBanner"), mapOf("finishBanner"), "the start and finish banners share one texture");
  assert.notEqual(mapOf("distanceBoard"), mapOf("flyingFinish"), "two text boards share one texture");
  // arrowRight IS the chevron — identical spec, so the cache must still fold it.
  assert.equal(mapOf("chevron"), mapOf("arrowRight"), "the sign cache stopped folding two identical boards");
  lib.dispose();
  clearSignCache();
});

// ---- shading -------------------------------------------------------------

test("materials: the colour map and the vertex colours do not both carry an albedo", () => {
  const st = theStage();
  const bundle = buildStageMeshes(THREE, st, TEX);
  // A generated map already decodes to a physical albedo. Where the mesh carries
  // one in its vertex colours too, the material colour has to divide the map's
  // out, or the two multiply and the surface goes black.
  const check = (label, material, texName, seed) => {
    const set = surfaceTexture(THREE, texName, { size: TEX.textureSize, seed });
    const c = material.color;
    for (const [k, ch] of [[0, "r"], [1, "g"], [2, "b"]]) {
      const product = c[ch] * set.albedoMean[k];
      assert.ok(Math.abs(product - 1) < 0.02,
        `${label}: the map contributes ${product.toFixed(3)} of an albedo on top of the vertex colour (want 1.0)`);
    }
  };
  check("road", bundle.road.material, "gravel", st.seed ?? 0);
  check("terrain", bundle.terrain.material, "grass", (st.seed ?? 0) + 3);
  check("scenery foliage", bundle.scenery.materials.tree, "foliage", st.seed ?? 0);
  check("scenery rock", bundle.scenery.materials.rock, "rock", st.seed ?? 0);
  check("props", bundle.propLibrary.materials.plain, "concrete", 11);

  // And the number that matters: a conifer canopy has to land in the band a real
  // one occupies, not at the 0.007 that photographed as a black cut-out.
  const canopy = bundle.scenery.prototypes.get("tree:0");
  const col = canopy.geometry.getAttribute("color").array;
  const mc = canopy.material.color;
  const set = surfaceTexture(THREE, "foliage", { size: TEX.textureSize, seed: st.seed ?? 0 });
  let brightest = 0;
  for (let i = 0; i < col.length; i += 3) {
    const g = col[i + 1] * mc.g * set.albedoMean[1];
    if (g > brightest) brightest = g;
  }
  assert.ok(brightest > 0.03 && brightest < 0.40,
    `the brightest conifer albedo is ${brightest.toFixed(4)}; real foliage sits between 0.03 and 0.30`);
  bundle.dispose();
});

test("textures: ground maps are filtered for the grazing angle they are read at", () => {
  const set = surfaceTexture(THREE, "grass", { size: 16, seed: 4 });
  for (const map of [set.map, set.normalMap, set.roughnessMap]) {
    assert.ok(map.anisotropy > 1,
      "a ground texture at anisotropy 1 blurs to a flat colour a couple of hundred metres out");
    assert.equal(map.wrapS, THREE.RepeatWrapping);
    assert.equal(map.generateMipmaps, true);
  }
  disposeTextures();
});

// ---- terrain LOD ---------------------------------------------------------

test("terrain: neighbours are never more than one LOD apart, and no crack escapes the skirt", () => {
  const st = theStage();
  // Squeezed LOD bands so the fixture actually produces adjacent chunks that
  // want to be two steps apart. At the shipping bands this stage happens not to,
  // and a test that never reaches the case it is written for proves nothing.
  const terrain = buildTerrainMesh(THREE, st, { ...TEX, lodRanges: [40, 80, 140] });
  const byKey = new Map();
  for (const c of terrain.chunks) byKey.set(`${c.cx},${c.cz}`, c);

  for (const c of terrain.chunks) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const nb = byKey.get(`${c.cx + dx},${c.cz + dz}`);
      if (!nb) continue;
      assert.ok(Math.abs(nb.lod - c.lod) <= 1,
        `chunks ${c.cx},${c.cz} (lod ${c.lod}) and ${nb.cx},${nb.cz} (lod ${nb.lod}) meet with a two-step T-junction`);
    }
  }

  // The real seam is the T-junction: a fine chunk puts vertices where the coarse
  // neighbour has only a straight chord. The skirt is what hides it, so measure
  // the fine chunk's edge against the coarse chunk's actual skirt geometry —
  // every fine vertex has to fall between the chord and the skirt's bottom edge.
  let boundaries = 0, worst = 0, worstUncovered = -Infinity;
  for (const c of terrain.chunks) {
    for (const [dx, dz] of [[1, 0], [0, 1]]) {
      const nb = byKey.get(`${c.cx + dx},${c.cz + dz}`);
      if (!nb || nb.lod === c.lod) continue;
      const fine = c.lod < nb.lod ? c : nb;
      const coarse = c.lod < nb.lod ? nb : c;
      const axis = dx ? 0 : 2;          // the coordinate that is fixed on the seam
      const run = dx ? 2 : 0;           // the coordinate that runs along it
      const at = c[dx ? "x0" : "z0"] + c.size;
      // [along, y] pairs on the seam plane, surface vertices then skirt vertices.
      const edgeOf = (chunk, skirt) => {
        const p = chunk.geometry.getAttribute("position").array;
        const from = skirt ? chunk.surfaceVertexCount : 0;
        const to = skirt ? p.length / 3 : chunk.surfaceVertexCount;
        const out = [];
        for (let i = from; i < to; i += 1) {
          if (Math.abs(p[i * 3 + axis] - at) < 1e-3) out.push([p[i * 3 + run], p[i * 3 + 1]]);
        }
        return out.sort((a, b) => a[0] - b[0]);
      };
      const fe = edgeOf(fine, false);
      const ce = edgeOf(coarse, false);
      const cs = edgeOf(coarse, true);
      if (fe.length < 2 || ce.length < 2 || cs.length < 2) continue;
      const interp = (pairs, t) => {
        let j = 0;
        while (j + 2 < pairs.length && pairs[j + 1][0] < t) j += 1;
        const [a0, b0] = pairs[j], [a1, b1] = pairs[j + 1];
        if (t < a0 - 1e-3 || t > a1 + 1e-3) return null;
        return b0 + (b1 - b0) * ((t - a0) / ((a1 - a0) || 1));
      };
      for (const [t, y] of fe) {
        const chord = interp(ce, t);
        const bottom = interp(cs, t);
        if (chord === null || bottom === null) continue;
        boundaries += 1;
        worst = Math.max(worst, Math.abs(y - chord));
        // Positive means the fine surface dropped below where the coarse chunk's
        // skirt ends: a hole the player can see the sky through.
        worstUncovered = Math.max(worstUncovered, bottom - y);
      }
    }
  }
  assert.ok(boundaries > 20, `only ${boundaries} inter-LOD boundary vertices were compared`);
  assert.ok(worstUncovered < 0,
    `the worst inter-LOD gap is ${worst.toFixed(2)} m and the skirt stops ${worstUncovered.toFixed(2)} m short of covering it`);
  terrain.dispose();
});

test("terrain: every chunk's LOD comes from its true distance to the road", () => {
  const st = theStage();
  const terrain = buildTerrainMesh(THREE, st, TEX);
  const ranges = [95, 280, 720];
  // Brute force: the hash grid the module uses may only search a few rings, and
  // stopping at the first ring that yields anything returns a sample that is not
  // the nearest, which then picks the wrong LOD.
  const nearest = (px, pz) => {
    let best = Infinity;
    for (let i = 0; i < st.count; i += 1) {
      const dx = st.x[i] - px, dz = st.z[i] - pz;
      const d = dx * dx + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  };
  for (const c of terrain.chunks) {
    const d = nearest(c.x0 + c.size * 0.5, c.z0 + c.size * 0.5);
    let want = 3;
    if (d < ranges[0]) want = 0;
    else if (d < ranges[1]) want = 1;
    else if (d < ranges[2]) want = 2;
    // The one-step restriction only ever refines a chunk, never coarsens it.
    assert.ok(c.lod <= want,
      `chunk ${c.cx},${c.cz} is ${d.toFixed(0)} m from the road and should be at most lod ${want}, but got ${c.lod}`);
  }
  terrain.dispose();
});

// ---- shared caches -------------------------------------------------------

test("livery: two cars on one livery share a texture set that survives the first dispose", () => {
  const record = newRecord();
  const opts = { size: 64, canvasFactory: fakeCanvasFactory(record) };
  const spec = carSpec("vireo-r2");
  const a = buildCarMesh(THREE, spec, spec.livery, opts);
  const b = buildCarMesh(THREE, spec, spec.livery, opts);
  assert.equal(a.livery, b.livery, "the livery cache stopped sharing, so this test proves nothing");
  let disposals = 0;
  a.livery.map.addEventListener("dispose", () => { disposals += 1; });
  a.dispose();
  assert.equal(disposals, 0, "disposing one car freed the texture the other car is still drawing with");
  b.dispose();
  assert.equal(disposals, 1, "the last holder did not free the shared texture");
  clearLiveryCache();
});

// The allocation itself is not observable from here — V8 scalar-replaces a
// one-element array — so this pins the behaviour of the branch that replaced it
// rather than claiming to measure the heap.
test("setMudLevel writes straight through a bare material", () => {
  const record = newRecord();
  const spec = carSpec("vireo-r2");
  const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
  const material = car.paintMaterials[0];
  const ref = material.userData.mud;
  setMudLevel(material, 0.42);
  assert.equal(material.userData.mud, ref, "the mud uniform object was replaced");
  assert.equal(ref.value, 0.42);
  setMudLevel(material, 9);
  assert.equal(ref.value, 1, "mud level was not clamped on the bare-material path");
  setMudLevel(null, 0.5);
  setMudLevel({}, 0.5);
  car.dispose();
  clearLiveryCache();
});
