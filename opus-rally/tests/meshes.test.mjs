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
  materialAlbedoScale, roadTextureName,
  clampPaint, PAINT_CEILING, DECAL_CEILING,
} from "../meshes.js";
import { CARS, carSpec, createCar } from "../physics.js";
import { SURFACE, surfaceProps } from "../surfaces.js";
// Which way a sign faces is an invariant across two modules: meshes.js decides
// which face carries the lettering, stage.js decides how the prop is turned. The
// only honest check builds a real stage and puts the two together.
import { generateStage, STAGE_BOOK, stageFromBook } from "../stage.js";

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
      transform: noop, resetTransform: noop,
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

// A seam is not a big number in the abstract — it is a step across the wrap that
// the field never takes anywhere inside itself. Comparing the two per axis is
// what catches an anisotropic field wrapped to the wrong period, which tiles one
// way and rules a line across the hillside the other.
test("procedural textures tile: no wrap edge steps harder than the field does inside itself", () => {
  const S = 64;
  for (const name of TEXTURE_NAMES) {
    const h = surfaceTexture(THREE, name, { size: S, seed: 11 }).height;
    const at = (x, y) => h[y * S + x];
    let seamX = 0, seamY = 0, innerX = 0, innerY = 0;
    for (let i = 0; i < S; i += 1) {
      seamX += Math.abs(at(0, i) - at(S - 1, i));
      seamY += Math.abs(at(i, 0) - at(i, S - 1));
      for (let k = 0; k + 1 < S; k += 1) {
        innerX += Math.abs(at(k + 1, i) - at(k, i));
        innerY += Math.abs(at(i, k + 1) - at(i, k));
      }
    }
    const meanInnerX = innerX / (S * (S - 1)), meanInnerY = innerY / (S * (S - 1));
    assert.ok(seamX / S <= meanInnerX * 2.2 + 1e-4,
      `${name}: the x wrap steps ${(seamX / S).toFixed(4)} against ${meanInnerX.toFixed(4)} inside — that is a seam`);
    assert.ok(seamY / S <= meanInnerY * 2.2 + 1e-4,
      `${name}: the y wrap steps ${(seamY / S).toFixed(4)} against ${meanInnerY.toFixed(4)} inside — that is a seam`);
  }
  disposeTextures();
});

// The whole ground argument in one number. Ground is read at a grazing angle, so
// a screen pixel out at fifty metres covers three or four texels even with
// anisotropic filtering: mip two. Detail finer than that is not detail, it is a
// shimmer that averages to the map's mean colour and leaves the terrain looking
// like flat paint — which is exactly what the grass map, 70% of whose contrast
// sat in sub-texel noise, did.
test("textures: ground maps still carry contrast at the mip the ground is read at", () => {
  const S = 64;
  const box = (src, n) => {
    const out = new Float32Array((n >> 1) * (n >> 1));
    const m = n >> 1;
    for (let y = 0; y < m; y += 1) {
      for (let x = 0; x < m; x += 1) {
        out[y * m + x] = (src[(y * 2) * n + x * 2] + src[(y * 2) * n + x * 2 + 1]
          + src[(y * 2 + 1) * n + x * 2] + src[(y * 2 + 1) * n + x * 2 + 1]) * 0.25;
      }
    }
    return out;
  };
  const sd = (a) => {
    let m = 0;
    for (const v of a) m += v;
    m /= a.length;
    let s = 0;
    for (const v of a) s += (v - m) * (v - m);
    return Math.sqrt(s / a.length);
  };
  for (const name of ["grass", "gravel", "rock", "dirt"]) {
    const h = surfaceTexture(THREE, name, { size: S, seed: 13 }).height;
    const mip2 = box(box(h, S), S >> 1);
    assert.ok(sd(mip2) > 0.055,
      `${name}: standard deviation is ${sd(mip2).toFixed(4)} two mips down; at fifty metres it is flat colour`);
    assert.ok(sd(mip2) > sd(h) * 0.45,
      `${name}: ${(100 * (1 - sd(mip2) / sd(h))).toFixed(0)}% of its contrast is gone by mip 2, so it lives below the texel`);
  }
  disposeTextures();
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

// The dazzle, measured. Every paint part used to lay its UVs down in its own
// local space, so a roof made of sixteen quads showed the whole livery sixteen
// times: a graphic whose pitch is the panel's, which at chase-camera distance is
// the pixel's, and the car shimmered in every frame. A part that carries paint
// has to sample a continuous piece of the atlas, and the way to say that is that
// no one triangle may span a slab of it.
test("livery: no painted triangle swallows a slab of the atlas, which is what dazzles", () => {
  clearLiveryCache();
  for (const id of ["vireo-r2", "corvine-rs2000", "astra-corsa"]) {
    const spec = carSpec(id);
    const car = buildCarMesh(THREE, spec, spec.livery);
    const paint = car.materials[0];
    let painted = 0;
    for (const [name, mesh] of Object.entries(car.parts)) {
      if (mesh.material !== paint) continue;
      painted += 1;
      const uv = mesh.geometry.getAttribute("uv").array;
      const idx = mesh.geometry.getIndex().array;
      let worst = 0, worstAt = -1;
      for (let t = 0; t < idx.length; t += 3) {
        const u = [uv[idx[t] * 2], uv[idx[t + 1] * 2], uv[idx[t + 2] * 2]];
        const v = [uv[idx[t] * 2 + 1], uv[idx[t + 1] * 2 + 1], uv[idx[t + 2] * 2 + 1]];
        const area = Math.abs((u[1] - u[0]) * (v[2] - v[0]) - (u[2] - u[0]) * (v[1] - v[0])) * 0.5;
        if (area > worst) { worst = area; worstAt = t; }
      }
      assert.ok(worst <= 0.04,
        `${id} ${name}: a triangle at index ${worstAt} covers ${(worst * 100).toFixed(1)}% of the livery `
        + "atlas, so the whole design repeats inside one panel");
    }
    assert.ok(painted >= 6, `${id}: only ${painted} parts wear paint, so this sweep proves little`);
    // Pinning every part to one texel would satisfy the bound above and leave an
    // unpainted car, so the shell has to genuinely walk the atlas.
    const shell = car.parts.body.geometry.getAttribute("uv").array;
    let lo = 1, hi = 0;
    for (let i = 0; i < shell.length; i += 2) { lo = Math.min(lo, shell[i]); hi = Math.max(hi, shell[i]); }
    assert.ok(hi - lo > 0.85, `${id}: the shell only reaches ${(hi - lo).toFixed(2)} of the atlas along the car`);
    car.dispose();
  }
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
    const detailAttr = chunk.geometry.getAttribute("detail");
    const detail = detailAttr.array;
    // Read the stride off the attribute: a hard-coded 3 kept "reading" the
    // wetness channel after it moved, and agreed with itself while doing it.
    const dw = detailAttr.itemSize;
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
        assert.equal(detail[(station.vertexBase + ROAD_CENTRE_SLOT) * dw + 2], 1, "water not flagged in the detail channel");
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

// Both critics said the same two things about the ribbon: it has no edge, and it
// carries no line information. Both are cross-section decisions, so both can be
// held here — as ratios against the road's own centre, which is what the eye
// compares them to.
test("road: the shoulder, the windrow and the racing line each read against the running surface", () => {
  const st = theStage();
  const road = buildRoadMesh(THREE, st, TEX);
  const slotOf = (kind) => ROAD_SECTION.findIndex((s) => s.kind === kind);
  const rut = slotOf("rut"), lip = slotOf("rutLip"), shoulder = slotOf("shoulder");
  const edge = ROAD_EDGE_SLOTS[0], verge = slotOf("verge");
  let checked = 0;
  for (const chunk of road.chunks) {
    const col = chunk.geometry.getAttribute("color").array;
    const detailAttr = chunk.geometry.getAttribute("detail");
    const dw = detailAttr.itemSize;
    const detail = detailAttr.array;
    for (const station of chunk.stations) {
      if (station.surfaceId !== SURFACE.GRAVEL) continue;
      const lum = (k) => {
        const o = (station.vertexBase + k) * 3;
        return 0.2126 * col[o] + 0.7152 * col[o + 1] + 0.0722 * col[o + 2];
      };
      const centre = lum(ROAD_CENTRE_SLOT);
      assert.ok(lum(rut) < centre * 0.80,
        `the polished line shades ${lum(rut).toFixed(3)} against a centre of ${centre.toFixed(3)}: no racing line`);
      assert.ok(lum(lip) > lum(rut) * 1.25,
        "the rut has no lip of thrown-out material, so it fades into the road instead of reading as a rut");
      assert.ok(lum(shoulder) < centre * 0.62,
        `the shoulder shades ${lum(shoulder).toFixed(3)} against a centre of ${centre.toFixed(3)}: the road has no edge`);
      assert.ok(lum(edge) > centre * 1.05,
        "the windrow at the edge is no brighter than the running surface");
      // The verge channel is what fades the road's own grain into the ground's.
      // A step from road to grass in one vertex is the hard line the critics saw.
      const v = (k) => detail[(station.vertexBase + k) * dw + 3];
      assert.equal(v(ROAD_CENTRE_SLOT), 0, "the running surface is being blended toward the verge");
      assert.ok(v(verge) > 0.9, "the verge does not reach the roadside grain at all");
      assert.ok(v(shoulder) > 0.02 && v(shoulder) < v(verge) * 0.7,
        `the shoulder blends ${v(shoulder).toFixed(3)}: the road grain stops in one step, which is the hard edge`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, `only ${checked} gravel stations checked`);
  road.dispose();
});

// The complaint this one holds is a playability failure rather than a matter of
// taste: a critic's frame put the road at luminance 151.6, the ground just off
// it at 139.1 and the ground beyond that at 163.4 — one lower, one HIGHER — with
// the same hue ratios to within 5%, so nothing in the picture said where the
// road ended. It is measured here in linear albedo rather than in pixels because
// a hillside tilted into the sun is what turned the value cue the wrong way
// round in that frame; albedo is the part of the cue the ground keeps whatever
// the sun is doing.
//
// Two faults, in two different places. The terrain painted its apron of churned
// earth out to 26 m from the CENTRELINE, so twenty metres of ground either side
// carried the running surface's own brown — and that is the band a driver reads
// the edge against at 20 to 80 m. And the ribbon's own outer verge climbed back
// to clean pasture a metre past the ditch, which left the dark band one ditch
// wide. Book stages, not the fixture: the fixture's terrain is one flat olive
// and would agree with anything.
test("road: the ground the edge is read against keeps neither the running surface's value nor its hue", () => {
  for (const id of ["kloft-bjornhalt", "northmarch-kestrel"]) {
    const st = stageFromBook(id);
    const road = buildRoadMesh(THREE, st, { textureSize: 16 });
    const terrain = buildTerrainMesh(THREE, st, { textureSize: 16, margin: 120 });

    // Loose-surface stations only. This is a claim about a gravel road; a tarmac
    // one is darker than its own verge and reads the other way round by design.
    const slotAlbedo = (slot) => {
      let r = 0, g = 0, b = 0, n = 0;
      for (const chunk of road.chunks) {
        const col = chunk.geometry.getAttribute("color").array;
        for (const station of chunk.stations) {
          if (station.surfaceId !== SURFACE.GRAVEL && station.surfaceId !== SURFACE.DIRT) continue;
          const scale = materialAlbedoScale(road.surfaceMaterials.get(station.surfaceId));
          const o = (station.vertexBase + slot) * 3;
          r += col[o] * scale[0]; g += col[o + 1] * scale[1]; b += col[o + 2] * scale[2];
          n += 1;
        }
      }
      assert.ok(n > 200, `${id}: only ${n} loose-surface stations to average`);
      return { r: r / n, g: g / n, b: b / n, L: luminance(r / n, g / n, b / n) };
    };
    const surface = slotAlbedo(ROAD_CENTRE_SLOT);
    const verge = slotAlbedo(ROAD_SECTION.findIndex((s) => s.kind === "verge"));
    assert.ok(verge.L <= surface.L * 0.65,
      `${id}: the ribbon's outer verge shades ${(verge.L / surface.L).toFixed(3)} of the running `
      + "surface, so the dark band that marks the edge is one ditch wide");

    // Terrain vertices binned by how far past the road EDGE they sit, brute
    // force against the whole centreline. A bucketed index here would have to
    // agree with the one meshes.js builds, and then this would be measuring that
    // agreement rather than the ground.
    const scale = materialAlbedoScale(terrain.material);
    const bin = (lo, hi) => ({ lo, hi, n: 0, L: 0, r: 0, g: 0 });
    const dies = bin(0, 4);      // where the ribbon dies into the ground
    const reads = bin(4, 14);    // what fills the frame beside the road at 20-80 m
    for (const c of terrain.chunks) {
      const pos = c.geometry.getAttribute("position").array;
      const col = c.geometry.getAttribute("color").array;
      for (let v = 0; v < c.surfaceVertexCount; v += 9) {
        const x = pos[v * 3], z = pos[v * 3 + 2];
        let best = Infinity, bi = -1;
        for (let i = 0; i < st.count; i += 1) {
          const dx = st.x[i] - x, dz = st.z[i] - z;
          const d = dx * dx + dz * dz;
          if (d < best) { best = d; bi = i; }
        }
        const off = Math.sqrt(best) - st.halfWidth[bi];
        const into = off >= dies.lo && off < dies.hi ? dies
          : off >= reads.lo && off < reads.hi ? reads : null;
        if (!into) continue;
        const r = col[v * 3] * scale[0], g = col[v * 3 + 1] * scale[1], b = col[v * 3 + 2] * scale[2];
        into.n += 1; into.L += luminance(r, g, b); into.r += r; into.g += g;
      }
    }
    assert.ok(dies.n > 40 && reads.n > 100,
      `${id}: only ${dies.n}/${reads.n} roadside terrain vertices were found`);
    assert.ok(dies.L / dies.n <= surface.L * 0.50,
      `${id}: the ground the ribbon dies into shades ${((dies.L / dies.n) / surface.L).toFixed(3)} of `
      + "the running surface, which makes the verge a second road");
    const hue = (reads.r / reads.g) / (surface.r / surface.g);
    assert.ok(Math.abs(hue - 1) >= 0.15,
      `${id}: the ground 4-14 m past the edge is within ${(Math.abs(hue - 1) * 100).toFixed(1)}% of the `
      + "road's own hue, and hue is the cue that survives a slope lit from the side");

    road.dispose();
    terrain.dispose();
  }
});

// A snow stage was one white sheet. The ribbon and the ground beside it were
// painted with the same white, so the only thing marking the road was the pair
// of ruts, and the ruts are gone by forty metres. Snow a rally car has run over
// is compacted and gritted; snow on the verge beside it is not. Read off the
// compiled shader, because the two colours only meet there — it is a string
// check, but what it asserts is the relationship between them, which is the part
// that was missing.
test("road: lying snow is compacted on the running surface and clean on the verge", () => {
  const st = theStage();
  const bundle = buildStageMeshes(THREE, st, TEX);
  const compile = (material) => {
    const shader = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    return shader.fragmentShader;
  };
  const colours = (line) => [...line.matchAll(/vec3\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/g)]
    .map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
  const lineWith = (src, needle) => src.split("\n").find((l) => l.includes(needle));

  const roadLine = lineWith(compile(bundle.road.surfaceMaterials.get(SURFACE.GRAVEL)), "vec3 lying");
  assert.ok(roadLine,
    "the ribbon has no lying-snow mix, so the road and the verge take the same white and a snow stage has no edge");
  const ends = colours(roadLine);
  assert.equal(ends.length, 2,
    `the lying-snow mix has ${ends.length} endpoints; it wants one for the running surface and one for the verge`);
  const packed = luminance(ends[0][0], ends[0][1], ends[0][2]);
  const clean = luminance(ends[1][0], ends[1][1], ends[1][2]);
  assert.ok(packed <= clean * 0.72,
    `snow on the running surface shades ${packed.toFixed(3)} against ${clean.toFixed(3)} on the verge: `
    + "a driven road is duller than the field beside it, and without that a blizzard has no road in it");

  // The ground has to lie the same white the ribbon's verge does, or the two
  // meet at a seam brighter or duller than either of them.
  const groundLine = lineWith(compile(bundle.terrain.material), "diffuseColor.rgb = mix( diffuseColor.rgb, vec3(");
  assert.ok(groundLine, "the ground has no lying-snow mix");
  const ground = colours(groundLine);
  assert.equal(ground.length, 1);
  for (let k = 0; k < 3; k += 1) {
    assert.ok(Math.abs(ground[0][k] - ends[1][k]) < 0.02,
      `the ground lies [${ground[0]}] of snow where the ribbon's verge lies [${ends[1]}]`);
  }
  bundle.dispose();
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

  // A vertex used to be asserted equal to heightAt to a tenth of a millimetre,
  // which is exactly the assumption that let the skin bury the road: heightAt is
  // right at the vertices and says nothing about the flat chord strung between
  // them. What is actually required is weaker in one direction and stronger in
  // the other — the skin may sit *under* the field where a cell spans the road,
  // and may never sit above it — plus the proof that the drop is a conform and
  // not a global sink: away from the road every vertex is still the field to the
  // tenth of a millimetre it always was.
  let corridorChecks = 0, offRoadChecks = 0, deepest = 0;
  const reach = st.halfWidth[0] + 4 + 2 * terrain.latticeStep;
  for (const c of terrain.chunks) {
    const p = c.geometry.getAttribute("position").array;
    for (let i = 0; i < c.surfaceVertexCount; i += 7) {
      const x = p[i * 3], y = p[i * 3 + 1], z = p[i * 3 + 2];
      const field = st.world.heightAt(x, z);
      assert.ok(y - field < 1e-4,
        `terrain vertex at ${x},${z} stands ${(y - field).toFixed(3)} m above heightAt`);
      corridorChecks += 1;
      if (field - y > deepest) deepest = field - y;
      if (st.world.project(x, z, undefined, {}).lateral > reach) {
        assert.ok(Math.abs(y - field) < 1e-4,
          `terrain vertex at ${x},${z} is ${y} with the road ${reach.toFixed(0)} m away, `
          + `heightAt says ${field}: the conform has become a global sink`);
        offRoadChecks += 1;
      }
    }
  }
  assert.ok(corridorChecks > 50);
  assert.ok(offRoadChecks > 500, `only ${offRoadChecks} vertices were checked clear of the road`);
  assert.ok(deepest > 0.05, "nothing was conformed at all; the corridor pass is not running");
  terrain.dispose();
});

// The terrain skin at a world point: the chunk that owns it, the cell inside
// that chunk, and the triangle of that cell the point lands in. Nothing here
// reads heightAt — the question is what the mesh draws, not what the field says.
function terrainSkinAt(terrain) {
  const size = terrain.chunkSize;
  const byChunk = new Map();
  for (const c of terrain.chunks) {
    const p = c.geometry.getAttribute("position").array;
    const rows = [];
    for (let jz = 0; jz <= c.cells; jz += 1) {
      const row = new Float64Array(c.cells + 1);
      for (let ix = 0; ix <= c.cells; ix += 1) row[ix] = p[(jz * (c.cells + 1) + ix) * 3 + 1];
      rows.push(row);
    }
    byChunk.set(`${c.cx},${c.cz}`, { c, rows, cellW: size / c.cells });
  }
  return (x, z) => {
    const hit = byChunk.get(`${Math.floor((x - terrain.originX) / size)},`
      + `${Math.floor((z - terrain.originZ) / size)}`);
    if (!hit) return null;
    const { c, rows, cellW } = hit;
    let ix = Math.floor((x - c.x0) / cellW);
    let jz = Math.floor((z - c.z0) / cellW);
    if (ix < 0) ix = 0; else if (ix >= c.cells) ix = c.cells - 1;
    if (jz < 0) jz = 0; else if (jz >= c.cells) jz = c.cells - 1;
    const u = (x - c.x0) / cellW - ix;
    const v = (z - c.z0) / cellW - jz;
    const h00 = rows[jz][ix], h10 = rows[jz][ix + 1];
    const h01 = rows[jz + 1][ix], h11 = rows[jz + 1][ix + 1];
    // The builder alternates the cell diagonal on (ix + jz).
    if ((ix + jz) & 1) {
      return u >= v ? h00 + u * (h10 - h00) + v * (h11 - h10)
        : h00 + v * (h01 - h00) + u * (h11 - h01);
    }
    return u + v <= 1 ? h00 + u * (h10 - h00) + v * (h01 - h00)
      : h11 + (1 - u) * (h01 - h11) + (1 - v) * (h10 - h11);
  };
}

// How far the terrain skin stands above the road ribbon, measured at the
// ribbon's own vertices — the verge slot excepted, which is the one slot that is
// placed on the ground rather than on the road.
function worstBurial(road, terrain) {
  const skin = terrainSkinAt(terrain);
  let worst = -Infinity, at = null, checked = 0;
  for (const c of road.chunks) {
    const p = c.geometry.getAttribute("position").array;
    for (const station of c.stations) {
      for (let k = 0; k < ROAD_SECTION.length; k += 1) {
        if (ROAD_SECTION[k].kind === "verge") continue;
        const v = station.vertexBase + k;
        const y = skin(p[v * 3], p[v * 3 + 2]);
        if (y === null) continue;
        checked += 1;
        const d = y - p[v * 3 + 1];
        if (d > worst) { worst = d; at = [p[v * 3], p[v * 3 + 2], ROAD_SECTION[k].kind]; }
      }
    }
  }
  return { worst, at, checked };
}

test("terrain: the skin never buries the road, on every stage in the book", () => {
  // Measured at the ribbon's own vertices, because a chord is only wrong where
  // there is a road under it, and the fixture stage has no cuttings deep enough
  // to show this: the book does. The numbers before the corridor conform ran
  // from 0.68 m on vardhal-havnvik to 2.69 m on tamarosa-rioseca.
  const rows = [];
  for (const entry of STAGE_BOOK) {
    const st = stageFromBook(entry.id);
    const road = buildRoadMesh(THREE, st, { textureSize: 16 });
    const terrain = buildTerrainMesh(THREE, st, { textureSize: 16, margin: 120 });
    const r = worstBurial(road, terrain);
    rows.push({ id: entry.id, lattice: terrain.latticeStep, buried: +r.worst.toFixed(3), checked: r.checked });
    assert.ok(r.checked > 8000, `${entry.id}: only ${r.checked} ribbon vertices were reachable`);
    assert.ok(r.worst < 0.02,
      `${entry.id}: the skin buries the ribbon by ${r.worst.toFixed(3)} m at ${JSON.stringify(r.at)}`);
    road.dispose();
    terrain.dispose();
  }
  console.log("skin over ribbon (m):", JSON.stringify(rows));
});

test("terrain: the burial assertion still fails against the skin that had no conform", () => {
  // The test above passes the moment it is written, which proves nothing on its
  // own. `conform: false` builds the old skin; the same measurement has to come
  // back over the limit, and by the margin the defect was reported at.
  for (const id of ["tamarosa-rioseca", "northmarch-harrowfen", "vardhal-havnvik"]) {
    const st = stageFromBook(id);
    const road = buildRoadMesh(THREE, st, { textureSize: 16 });
    const terrain = buildTerrainMesh(THREE, st, { textureSize: 16, margin: 120, conform: false });
    assert.equal(terrain.conformedPoints, 0, "conform: false still conformed something");
    const r = worstBurial(road, terrain);
    assert.ok(r.worst > 0.5,
      `${id}: unconformed skin only buries the ribbon by ${r.worst.toFixed(3)} m, `
      + "so the assertion above is not measuring the defect it was written for");
    road.dispose();
    terrain.dispose();
  }
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
    for (const key of ["body", "glass", "rollCage", "interior", "lightPod", "diffuser", "roofScoop", "mudflaps", "scuttle"]) {
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

// The two tests above run on a fixture this file wrote, which is exactly why
// they were green while the shipping stages were 76k triangles over: a fixture
// cannot fail for a stage it does not contain. This one builds the book.
test("every stage in the book fits every triangle budget", () => {
  const rows = [];
  for (const entry of STAGE_BOOK) {
    const st = stageFromBook(entry.id);
    const bundle = buildStageMeshes(THREE, st, { textureSize: 16, margin: 120 });
    const row = {
      id: entry.id,
      road: bundle.road.triangles,
      terrain: bundle.terrain.triangles,
      scenery: bundle.scenery.triangles,
      props: bundle.props.triangles,
      total: bundle.triangles,
      thinned: bundle.scenery.thinned.length,
    };
    rows.push(row);
    for (const part of ["road", "terrain", "scenery", "props"]) {
      assert.ok(row[part] <= TRIANGLE_BUDGET[part],
        `${entry.id}: ${part} used ${row[part]} triangles, budget ${TRIANGLE_BUDGET[part]}`);
    }
    assert.ok(row.total <= TRIANGLE_BUDGET.stage,
      `${entry.id}: ${row.total} triangles, budget ${TRIANGLE_BUDGET.stage}`);
    assert.equal(bundle.scenery.overBudget, false,
      `${entry.id}: scenery could not be thinned into its budget`);
    // A stage that built almost nothing would pass every line above.
    assert.ok(row.total > 120000, `${entry.id}: suspiciously empty at ${row.total} triangles`);
    bundle.dispose();
    clearSignCache();
  }
  console.log("book triangle budgets:", JSON.stringify(rows));
});

test("scenery: a stage that brings more roadside than the budget is thinned, not truncated", () => {
  // northmarch-kestrel is the worst case in the book: 4,909 items, 316k
  // triangles against a 240k ceiling.
  const st = stageFromBook("northmarch-kestrel");
  const lib = buildSceneryLibrary(THREE, st, { textureSize: 16 });
  assert.ok(lib.thinned.length > 0, "kestrel needs thinning and none happened");
  assert.ok(lib.triangles <= TRIANGLE_BUDGET.scenery,
    `scenery used ${lib.triangles} triangles, budget ${TRIANGLE_BUDGET.scenery}`);
  assert.equal(lib.overBudget, false);
  // Thinning to nothing would also fit the budget. It has to still be a forest.
  assert.ok(lib.triangles > TRIANGLE_BUDGET.scenery * 0.9,
    `thinned all the way down to ${lib.triangles}; the budget is there to be spent`);

  const kindOf = (it) => (it.kind === "conifer" || it.kind === "birch" || it.kind === "forest"
    || it.kind === "pine" || it.kind === "spruce" || it.kind === "deciduous" ? "tree" : it.kind);
  const tally = (items) => {
    const m = new Map();
    for (const it of items) m.set(kindOf(it), (m.get(kindOf(it)) || 0) + 1);
    return m;
  };
  const had = tally(st.scenery);
  const lost = tally(lib.thinned);
  const rate = (k) => (had.get(k) ? (lost.get(k) || 0) / had.get(k) : 0);

  assert.equal(lost.get("pole") || 0, 0, "a pole was thinned; its wires now hang off nothing");
  assert.equal(lost.get("building") || 0, 0, "a building went before the planting did");
  // Species priority: the understorey thins faster than the canopy, which thins
  // faster than the rocks. And no layer is wiped out to save another.
  assert.ok(rate("bush") > rate("tree"), `bush ${rate("bush")} vs tree ${rate("tree")}`);
  assert.ok(rate("tree") > rate("rock"), `tree ${rate("tree")} vs rock ${rate("rock")}`);
  assert.ok(rate("bush") < 0.85, `${(100 * rate("bush")).toFixed(0)}% of the understorey went`);

  // Distance: what frames the road is the last thing to go. Measured as the drop
  // rate for trees inside 30 m of the centreline against those beyond 60 m.
  const near = { had: 0, lost: 0 };
  const far = { had: 0, lost: 0 };
  const dropped = new Set(lib.thinned);
  for (const it of st.scenery) {
    if (kindOf(it) !== "tree") continue;
    const p = st.world.project(it.x, it.z, undefined, {});
    const bin = p.lateral < 30 ? near : p.lateral > 60 ? far : null;
    if (!bin) continue;
    bin.had += 1;
    if (dropped.has(it)) bin.lost += 1;
  }
  assert.ok(near.had > 200 && far.had > 200, `not enough trees to compare: ${near.had}/${far.had}`);
  assert.ok(far.lost / far.had > near.lost / near.had * 1.2,
    `trees thin at ${(near.lost / near.had).toFixed(2)} beside the road and `
    + `${(far.lost / far.had).toFixed(2)} out beyond 60 m; the bias is not doing any work`);
  lib.dispose();
});

// ---- road surfaces -------------------------------------------------------

test("road: each running surface is drawn with its own texture set, not gravel everywhere", () => {
  const st = theStage();     // tarmac 300-380 m, mud 520-580, a water splash at 700, dirt 940-1000
  const road = buildRoadMesh(THREE, st, TEX);
  const want = [SURFACE.GRAVEL, SURFACE.TARMAC, SURFACE.MUD, SURFACE.WATER, SURFACE.DIRT];
  for (const sid of want) {
    const mat = road.surfaceMaterials.get(sid);
    assert.ok(mat, `${surfaceProps(sid).name} never got a material of its own`);
    const set = surfaceTexture(THREE, roadTextureName(sid), { size: TEX.textureSize, seed: st.seed ?? 0 });
    assert.equal(mat.map, set.map,
      `${surfaceProps(sid).name} is mapped with something other than its own ${roadTextureName(sid)} set`);
    assert.equal(mat.normalMap, set.normalMap);
  }
  // The point of the exercise: tarmac must not be sampling the gravel map.
  assert.notEqual(road.surfaceMaterials.get(SURFACE.TARMAC).map,
    road.surfaceMaterials.get(SURFACE.GRAVEL).map);
  // A ford reflects the sky and gravel does not, so their roughness must differ.
  assert.ok(road.surfaceMaterials.get(SURFACE.WATER).roughness
    < road.surfaceMaterials.get(SURFACE.GRAVEL).roughness * 0.6,
    "the water splash is as matt as the gravel either side of it");

  // Every triangle belongs to exactly one group, and the groups follow the
  // stations: span k carries the surface station k starts on.
  const perSpan = (ROAD_SECTION.length - 1) * 6;
  let checkedRuns = 0;
  for (const chunk of road.chunks) {
    const groups = chunk.geometry.groups;
    assert.ok(groups.length > 0, "a road chunk has no material groups at all");
    let cursor = 0;
    let g = 0;
    for (let k = 0; k + 1 < chunk.stations.length;) {
      const sid = chunk.stations[k].surfaceId;
      let run = 0;
      while (k + run + 1 < chunk.stations.length && chunk.stations[k + run].surfaceId === sid) run += 1;
      const group = chunk.groups[g];
      assert.ok(group, `chunk ${chunk.index}: ran out of groups at station ${k}`);
      assert.equal(group.surfaceId, sid,
        `chunk ${chunk.index}: span at station ${k} is ${surfaceProps(sid).name} `
        + `but its group says ${surfaceProps(group.surfaceId).name}`);
      assert.equal(group.start, cursor);
      assert.equal(group.count, run * perSpan);
      assert.equal(groups[g].materialIndex, road.materials.indexOf(road.surfaceMaterials.get(sid)));
      cursor += group.count;
      k += run;
      g += 1;
      checkedRuns += 1;
    }
    assert.equal(g, chunk.groups.length, `chunk ${chunk.index}: ${chunk.groups.length - g} groups left over`);
    assert.equal(cursor, chunk.geometry.getIndex().count, "the groups do not cover the whole index buffer");
  }
  assert.ok(checkedRuns > road.chunks.length,
    "no chunk in the fixture actually changed surface, so this proved nothing");
  road.dispose();
  disposeTextures();
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
  check("road", bundle.road.surfaceMaterials.get(SURFACE.GRAVEL), "gravel", st.seed ?? 0);
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

// The rest of the shading section is the test that stops the double-albedo
// coming back anywhere. It measures what the renderer will actually shade —
// map mean x material colour x vertex colour — and holds it against the band the
// real material occupies. Bands are broadband visible reflectance, the numbers a
// radiometry table gives; each row states which material it is claiming to be.

function luminance(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Effective linear albedo of every vertex of `geometry` shaded with `material`.
// Null where the albedo is painted into a canvas this process cannot read back.
function albedoRange(geometry, material) {
  const scale = materialAlbedoScale(material);
  if (!scale) return null;
  const col = geometry.getAttribute("color");
  if (!col || !material.vertexColors) return null;
  const a = col.array;
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  for (let i = 0; i + 2 < a.length; i += 3) {
    const v = luminance(a[i] * scale[0], a[i + 1] * scale[1], a[i + 2] * scale[2]);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    sum += v; n += 1;
  }
  return n ? { lo, hi, mean: sum / n } : null;
}

function assertBand(label, range, band) {
  assert.ok(range, `${label}: nothing measurable to check`);
  assert.ok(range.lo >= band.lo && range.hi <= band.hi,
    `${label}: shades ${range.lo.toFixed(4)}..${range.hi.toFixed(4)} linear; `
    + `${band.is} reflects ${band.lo}..${band.hi}`);
}

test("materials: every material is one of the three albedo shapes, and nothing else", () => {
  const st = theStage();
  const bundle = buildStageMeshes(THREE, st, TEX);
  const spec = carSpec("corvine-rs2000");
  const car = buildCarMesh(THREE, spec, spec.livery);
  const wheel = buildWheelMesh(THREE, spec);

  const all = [];
  const add = (label, m) => { if (m) all.push([label, m]); };
  bundle.road.materials.forEach((m, i) => add(`road[${i}]`, m));
  add("terrain", bundle.terrain.material);
  for (const k of Object.keys(bundle.scenery.materials)) add(`scenery.${k}`, bundle.scenery.materials[k]);
  for (const k of Object.keys(bundle.propLibrary.materials)) add(`props.${k}`, bundle.propLibrary.materials[k]);
  bundle.propLibrary.signMaterials.forEach((m, i) => add(`sign[${i}]`, m));
  car.materials.forEach((m, i) => add(`car[${i}]`, m));
  wheel.materials.forEach((m, i) => add(`wheel[${i}]`, m));
  assert.ok(all.length > 20, `only ${all.length} materials found; the sweep is not reaching them`);

  for (const [label, m] of all) {
    const mean = m.userData.opusMapMean;
    assert.notEqual(mean, undefined,
      `${label}: went out without declaring where its albedo lives (see the one albedo rule)`);
    if (mean === null) {
      // Painted: the canvas or the flat colour is the albedo, so nothing else may be.
      assert.equal(m.vertexColors, false,
        `${label}: a painted albedo multiplied by vertex colours is the double all over again`);
      continue;
    }
    const unit = mean[0] === 1 && mean[1] === 1 && mean[2] === 1;
    if (unit) {
      assert.equal(m.map, null, `${label}: claims no colour map but carries one`);
      assert.ok(m.color.r === 1 && m.color.g === 1 && m.color.b === 1,
        `${label}: no map, so the vertex colour is the albedo and color must stay white`);
    } else {
      assert.ok(m.map, `${label}: declares a map mean but has no map`);
      for (const [k, ch] of [[0, "r"], [1, "g"], [2, "b"]]) {
        const product = m.color[ch] * mean[k];
        assert.ok(Math.abs(product - 1) < 0.02,
          `${label}: the map contributes ${product.toFixed(3)} of an albedo on top of the vertex colour (want 1.0)`);
      }
    }
  }
  car.dispose();
  wheel.dispose();
  bundle.dispose();
  clearLiveryCache();
});

test("materials: the effective linear albedo of every part lands in its real band", () => {
  const st = theStage();
  const bundle = buildStageMeshes(THREE, st, TEX);
  const spec = carSpec("corvine-rs2000");
  const car = buildCarMesh(THREE, spec, spec.livery);
  const wheel = buildWheelMesh(THREE, spec);

  // Scenery and prop prototypes, by the prototype key the library files them under.
  const sceneryBands = {
    "tree:0": { is: "a conifer canopy over bark", lo: 0.03, hi: 0.30 },
    "tree:1": { is: "a broadleaf canopy over bark", lo: 0.03, hi: 0.30 },
    "tree:2": { is: "bare winter branches", lo: 0.03, hi: 0.30 },
    "tree:3": { is: "scrub over bark", lo: 0.03, hi: 0.30 },
    "rock:0": { is: "weathered granite", lo: 0.10, hi: 0.45 },
    "rock:1": { is: "weathered granite", lo: 0.10, hi: 0.45 },
    "rock:2": { is: "weathered granite", lo: 0.10, hi: 0.45 },
    "bush:0": { is: "a dense evergreen shrub", lo: 0.03, hi: 0.35 },
    "tussock:0": { is: "dry moor grass", lo: 0.03, hi: 0.35 },
    "fern:0": { is: "bracken", lo: 0.03, hi: 0.35 },
    "log:0": { is: "a fallen trunk", lo: 0.05, hi: 0.35 },
    "stump:0": { is: "cut timber", lo: 0.05, hi: 0.35 },
    "building:0": { is: "a rendered barn — walls, slate, window reveals", lo: 0.02, hi: 0.55 },
    "building:1": { is: "a farmhouse", lo: 0.02, hi: 0.55 },
    "building:2": { is: "a shed", lo: 0.02, hi: 0.55 },
    "pole:0": { is: "a creosoted pole with glass insulators", lo: 0.05, hi: 0.35 },
    "wall:0": { is: "a drystone wall", lo: 0.15, hi: 0.45 },
    "fence:0": { is: "weathered fence timber", lo: 0.05, hi: 0.35 },
    "bridge:0": { is: "a stone parapet", lo: 0.15, hi: 0.45 },
  };
  const propBands = {
    gantryStart: { is: "a galvanised truss on rubber feet", lo: 0.15, hi: 0.70 },
    gantryFinish: { is: "a galvanised truss on rubber feet", lo: 0.15, hi: 0.70 },
    hayBaleRound: { is: "baled straw", lo: 0.12, hi: 0.60 },
    hayBaleRect: { is: "baled straw and its twine", lo: 0.12, hi: 0.60 },
    tyreStack: { is: "stacked tyres", lo: 0.02, hi: 0.08 },
    cone: { is: "an orange traffic cone on a black base", lo: 0.08, hi: 0.55 },
    marshalPost: { is: "a post, an orange flag and a steel foot", lo: 0.05, hi: 0.60 },
    tapeStake: { is: "a stake and red-and-white tape", lo: 0.10, hi: 0.90 },
    bunting: { is: "printed cotton bunting", lo: 0.03, hi: 0.85 },
    spectatorStand: { is: "a person: skin, coat, trousers", lo: 0.10, hi: 0.60 },
    spectatorCheer: { is: "a person: skin, coat, trousers", lo: 0.10, hi: 0.60 },
    spectatorCrouch: { is: "a person: skin, coat, trousers", lo: 0.10, hi: 0.60 },
  };
  // Car and wheel, by the part the material dresses.
  const carBands = [
    ["bumperFront", { is: "moulded bumper plastic", lo: 0.015, hi: 0.10 }],
    ["bumperRear", { is: "moulded bumper plastic", lo: 0.015, hi: 0.10 }],
    // A cage painted near-white at metalness 0.55 was the brightest thing in the
    // frame after the sky, and it is three fat tubes across the cockpit view.
    // Painted steel in a mid grey, under gravel's 0.314 and clear of the trim.
    ["rollCage", { is: "a cage in painted grey", lo: 0.16, hi: 0.34 }],
    ["exhaustTail", { is: "a stainless tailpipe", lo: 0.25, hi: 0.75 }],
    ["sumpGuard", { is: "an alloy sump guard", lo: 0.25, hi: 0.75 }],
    ["glass", { is: "tinted glass", lo: 0.02, hi: 0.15 }],
    ["lamp0", { is: "a lamp lens", lo: 0.55, hi: 1.00 }],
    ["lightPod", { is: "a black lamp pod", lo: 0.02, hi: 0.20 }],
    ["diffuser", { is: "a black diffuser", lo: 0.02, hi: 0.20 }],
    ["mudflaps", { is: "black mudflaps", lo: 0.02, hi: 0.20 }],
    ["interior", { is: "a stripped interior: dash, seats, wheel rim", lo: 0.02, hi: 0.20 }],
    ["scuttle", { is: "a matte anti-glare cowl", lo: 0.015, hi: 0.09 }],
    ["spare", { is: "a spare wheel on a pale rim", lo: 0.02, hi: 0.50 }],
  ];
  const wheelBands = [
    ["tyre", { is: "carbon-black tyre rubber", lo: 0.02, hi: 0.07 }],
    ["rim", { is: "a machined alloy rim", lo: 0.20, hi: 0.70 }],
    ["disc", { is: "a cast-iron brake disc", lo: 0.08, hi: 0.30 }],
    ["caliper", { is: "a red-painted caliper", lo: 0.05, hi: 0.45 }],
  ];

  for (const [key, band] of Object.entries(sceneryBands)) {
    const proto = bundle.scenery.prototypes.get(key);
    assert.ok(proto, `scenery prototype ${key} is missing`);
    assertBand(`scenery ${key}`, albedoRange(proto.geometry, proto.material), band);
  }
  for (const [key, band] of Object.entries(propBands)) {
    const proto = bundle.propLibrary.prototypes.get(key);
    assert.ok(proto, `prop prototype ${key} is missing`);
    assertBand(`prop ${key}`, albedoRange(proto.geometry, proto.material), band);
  }
  for (const [part, band] of carBands) {
    const mesh = car.parts[part];
    assert.ok(mesh, `car part ${part} is missing`);
    assertBand(`car ${part}`, albedoRange(mesh.geometry, mesh.material), band);
  }
  for (const [part, band] of wheelBands) {
    assertBand(`wheel ${part}`, albedoRange(wheel[part].geometry, wheel[part].material), band);
  }

  // The ground, per running surface. The road's centre slot is the surface's own
  // albedo barely darkened, so this is exact rather than a band: it is also what
  // proves the tarmac group is shaded by the tarmac material and not the gravel one.
  const centreOf = (chunk, stationIdx) => {
    const col = chunk.geometry.getAttribute("color").array;
    const v = (chunk.stations[stationIdx].vertexBase + ROAD_CENTRE_SLOT) * 3;
    return [col[v], col[v + 1], col[v + 2]];
  };
  const seen = new Set();
  for (const chunk of bundle.road.chunks) {
    for (let k = 0; k < chunk.stations.length; k += 1) {
      const sid = chunk.stations[k].surfaceId;
      const mat = bundle.road.surfaceMaterials.get(sid);
      assert.ok(mat, `no road material for surface ${sid}`);
      const scale = materialAlbedoScale(mat);
      const col = centreOf(chunk, k);
      const want = surfaceProps(sid).albedo;
      for (let c = 0; c < 3; c += 1) {
        const got = col[c] * scale[c];
        assert.ok(Math.abs(got - want[c] * 0.98) < 0.02,
          `road ${surfaceProps(sid).name}: centre shades ${got.toFixed(3)} against an albedo of ${want[c]}`);
      }
      seen.add(sid);
    }
  }
  assert.ok(seen.size >= 4, `the fixture only exercised ${seen.size} running surfaces`);

  // Terrain carries a blend of the palette plus a darkened skirt, so it is a band.
  for (const chunk of bundle.terrain.chunks.slice(0, 8)) {
    assertBand("terrain", albedoRange(chunk.geometry, bundle.terrain.material),
      { is: "hill grass through scree to snow, and a skirt below it", lo: 0.04, hi: 0.90 });
  }

  car.dispose();
  wheel.dispose();
  bundle.dispose();
  clearLiveryCache();
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

// The ground shaders are string surgery on three's own chunks, and a chunk that
// quietly changes name or wording between releases makes every replace a no-op.
// Nothing goes wrong loudly when that happens: the terrain draws, and draws the
// grass map over rock and scree alike, which is the flat-paint look this was
// written to end. So the surgery is run against the real shader sources and the
// result checked for what it was supposed to change.
test("ground shaders: the splat and detail injections actually land in three's shader", () => {
  const st = theStage();
  const bundle = buildStageMeshes(THREE, st, TEX);
  const src = THREE.ShaderLib.physical;
  const cases = [
    ["terrain", bundle.terrain.material, "uRockMap", "vSplat"],
    ["road", bundle.road.surfaceMaterials.get(SURFACE.GRAVEL), "uVergeMap", "vDetail"],
  ];
  for (const [label, material, sampler, varying] of cases) {
    assert.equal(typeof material.onBeforeCompile, "function", `${label}: no shader injection at all`);
    const shader = {
      uniforms: {},
      vertexShader: src.vertexShader,
      fragmentShader: src.fragmentShader,
    };
    material.onBeforeCompile(shader, null);
    assert.ok(shader.vertexShader.includes(varying),
      `${label}: the vertex shader never declares ${varying}, so the attribute never reaches the fragment stage`);
    assert.ok(shader.fragmentShader.includes(sampler),
      `${label}: ${sampler} never reached the fragment shader`);
    assert.ok(shader.uniforms[sampler] && shader.uniforms[sampler].value,
      `${label}: ${sampler} was declared but bound to nothing`);
    // The map fragment has to be replaced, not appended to: leaving three's own
    // `diffuseColor *= sampledDiffuseColor` in place multiplies the blend twice.
    assert.ok(!shader.fragmentShader.includes("#include <map_fragment>"),
      `${label}: three's map_fragment survived, so the blend is applied on top of it`);
    assert.ok(!shader.fragmentShader.includes("mapN.xy *= normalScale;"),
      `${label}: the normal-map strength line was not the one three emits any more`);
    assert.ok(shader.fragmentShader.includes(`${varying}.x`) || shader.fragmentShader.includes(`${varying}.y`),
      `${label}: ${varying} is declared and never read`);
  }
  bundle.dispose();
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

// ---- what the eye actually catches ---------------------------------------
// Four defects three critics found in real frames. Each test below measures the
// thing the critic saw, not the code that produced it.

function linearOf(css) {
  const h = /^#([0-9a-f]{6})$/i.exec(String(css).trim());
  assert.ok(h, `not a hex colour: ${css}`);
  const chan = (i) => {
    const c = parseInt(h[1].slice(i * 2, i * 2 + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return [chan(0), chan(1), chan(2)];
}

// A canvas that keeps every colour anything asked it to paint with, one list per
// canvas: liveryTexture paints three, and only the colour one carries an albedo.
function paintRecordingFactory(canvases) {
  return (w, h) => {
    const seen = [];
    canvases.push(seen);
    let fill = "", stroke = "", font = "20px sans-serif";
    const grad = () => ({ addColorStop(_o, c) { seen.push(c); } });
    const noop = () => {};
    const ctx = {
      lineWidth: 1, lineCap: "", lineJoin: "", textAlign: "", textBaseline: "",
      globalAlpha: 1, globalCompositeOperation: "source-over", shadowBlur: 0, shadowColor: "",
      get font() { return font; }, set font(v) { font = v; },
      get fillStyle() { return fill; },
      set fillStyle(v) { fill = v; if (typeof v === "string") seen.push(v); },
      get strokeStyle() { return stroke; },
      set strokeStyle(v) { stroke = v; if (typeof v === "string") seen.push(v); },
      save: noop, restore: noop, translate: noop, rotate: noop, scale: noop, setTransform: noop,
      transform: noop, resetTransform: noop, beginPath: noop, closePath: noop, moveTo: noop,
      lineTo: noop, quadraticCurveTo: noop, bezierCurveTo: noop, arc: noop, rect: noop,
      fill: noop, stroke: noop, clip: noop, fillRect: noop, clearRect: noop, strokeRect: noop,
      setLineDash: noop, createLinearGradient: grad, createRadialGradient: grad,
      fillText: noop, strokeText: noop,
      measureText: (t) => ({ width: String(t).length * 11 }),
    };
    const canvas = { width: w, height: h, getContext: () => ctx };
    ctx.canvas = canvas;
    return canvas;
  };
}

test("paint: nothing on the car carries an albedo it cannot survive being lit at", () => {
  // A canvas byte of 255 is an albedo of 1.0, which has nowhere to go once the
  // sun and the tone curve are applied: the roof, the rear panel and the plate
  // came out at a flat 255 with no shading gradient anywhere on them, and the car
  // read as cut paper. The whitest real paint reflects about three quarters.
  assert.ok(PAINT_CEILING > 0.6 && PAINT_CEILING < 0.85, "the paint ceiling is not a paint number");
  assert.ok(DECAL_CEILING < PAINT_CEILING, "pigmented plastic must sit below paint");

  // One 8-bit sRGB step is worth about 0.007 of linear light up here, so that is
  // the tolerance. Anything looser would let a genuinely unclamped white past.
  const STEP = 0.008;
  const white = clampPaint("#ffffff");
  assert.notEqual(white, "#ffffff", "pure white came back unclamped");
  for (const v of linearOf(white)) {
    assert.ok(v <= PAINT_CEILING + STEP, `clamped white still reflects ${v}`);
  }
  // Hue survives the clamp: a saturated yellow must not turn grey.
  const yellow = linearOf(clampPaint("#ffd400"));
  assert.ok(Math.abs(Math.max(...yellow) - PAINT_CEILING) < STEP, "the clamp did not reach the ceiling");
  assert.ok(yellow[2] < 0.01 && yellow[0] > yellow[1] * 1.3, `hue was not preserved: ${yellow}`);
  // Anything already dark enough is left exactly as it was.
  assert.equal(clampPaint("#0e2a5c"), "#0e2a5c");
  assert.equal(clampPaint("nonsense"), "nonsense");

  // And the rule reaches the canvas, for every car in the book — the clamp is
  // useless if a drawing helper picks its own literal white behind its back.
  for (const id of ["corvine-rs2000", "ardent-r1", "vireo-r2", "falke-4s", "astra-corsa", "delta-b640"]) {
    const spec = carSpec(id);
    const canvases = [];
    const tex = liveryTexture(THREE, spec.livery, { size: 64, canvasFactory: paintRecordingFactory(canvases) });
    // The colour pass is the one that laid the car's own base colour down; the
    // roughness and mud companions carry masks, where a white pixel means "all
    // of it" rather than an albedo.
    const wantBase = clampPaint(spec.livery.base).toLowerCase();
    const colourPass = canvases.filter((c) => c.some((v) => String(v).toLowerCase() === wantBase));
    assert.equal(colourPass.length, 1, `${id}: found ${colourPass.length} colour passes, expected exactly one`);
    const seen = colourPass[0];
    assert.ok(seen.length > 8, `${id}: only ${seen.length} colours reached the canvas`);
    let worst = 0, worstCss = "";
    for (const css of seen) {
      if (!/^#[0-9a-f]{6}$/i.test(css)) continue;
      const peak = Math.max(...linearOf(css));
      if (peak > worst) { worst = peak; worstCss = css; }
    }
    assert.ok(worst <= PAINT_CEILING + STEP,
      `${id}: ${worstCss} reaches ${worst.toFixed(3)} linear, above the ${PAINT_CEILING} paint ceiling`);
    tex.dispose(true);
  }
  clearLiveryCache();
});

test("car: the headlight emissive reaches the lamp lenses and nothing else", () => {
  // render.js drives the headlight level into the FIRST part whose name reads as
  // a lamp and writes an emissive of up to 1.6 into that material every frame.
  // The pod bar matched first and shared one trim material with the mudflaps, the
  // diffuser, the spare, the number plate and the entire cabin — so switching the
  // headlights on turned four black rubber flaps into white slabs in the rain.
  const LAMP = /lamp|headlight|pod|spot/i;
  const spec = carSpec("corvine-rs2000");
  const record = newRecord();
  const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });

  let first = null;
  for (const child of car.group.children) {
    if (child.isMesh && LAMP.test(child.name)) { first = child; break; }
  }
  assert.ok(first, "no part of the car reads as a lamp; render.js will find nothing to light");

  // Sharing is fine between the four lenses — they light together. Sharing with
  // anything that is not a lamp is the defect.
  const users = car.group.children.filter((c) => c.isMesh && c.material === first.material).map((c) => c.name);
  const strays = users.filter((n) => !/^lamp\d+$/.test(n));
  assert.deepEqual(strays, [],
    `the headlight material is shared with ${strays.join(", ")}: an emissive written into it lights them too`);

  // And the part it does land on has to be a lens, not the black bar behind them.
  const lit = albedoRange(first.geometry, first.material);
  assert.ok(lit && lit.mean > 0.5,
    `${first.name} shades at ${lit ? lit.mean.toFixed(3) : "?"}; a headlight emissive belongs on a lens`);

  // Every rubber, plastic and trim part must be clear of it.
  for (const key of ["mudflaps", "diffuser", "spare", "interior", "cabinTrim", "tailDetail", "lightPod"]) {
    assert.notEqual(car.parts[key].material, first.material,
      `${key} shares the material the headlight level is written into`);
  }
  car.dispose();
  clearLiveryCache();
});

test("car: the roll cage lives inside the glasshouse, not over the roof", () => {
  // The cage was drawn 12 cm outside the roof panel on each side and 2 cm above
  // it, with the rear stays standing proud of the boot lid: white tubes over the
  // roof and down the rear quarters, which reads as an external cage with the
  // wing bolted to it. The envelope below is measured off the car's own glass,
  // so it restates none of the cabin's numbers.
  for (const id of ["corvine-rs2000", "delta-b640", "astra-corsa"]) {
    const spec = carSpec(id);
    const record = newRecord();
    const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
    const glass = car.parts.glass.geometry.getAttribute("position").array;

    let beltY = Infinity, roofTop = -Infinity;
    for (let i = 1; i < glass.length; i += 3) {
      if (glass[i] < beltY) beltY = glass[i];
      if (glass[i] > roofTop) roofTop = glass[i];
    }
    // The glasshouse narrows with height; sample its widest reach at each end.
    const span = roofTop - beltY;
    const halfAt = (lo, hi) => {
      let w = 0;
      for (let i = 0; i < glass.length; i += 3) {
        if (glass[i + 1] >= lo && glass[i + 1] <= hi) w = Math.max(w, Math.abs(glass[i]));
      }
      return w;
    };
    const beltHalf = halfAt(beltY - 1e-4, beltY + span * 0.05);
    const roofHalf = halfAt(roofTop - span * 0.05, roofTop + 1e-4);
    assert.ok(beltHalf > roofHalf, `${id}: the glasshouse does not taper (${beltHalf} vs ${roofHalf})`);
    const envelope = (y) => {
      const t = Math.min(1, Math.max(0, (y - beltY) / span));
      return beltHalf + (roofHalf - beltHalf) * t;
    };

    const cage = car.parts.rollCage.geometry.getAttribute("position").array;
    let aboveRoof = 0, widest = 0, widestY = 0;
    for (let i = 0; i < cage.length; i += 3) {
      const x = Math.abs(cage[i]), y = cage[i + 1];
      if (y - roofTop > aboveRoof) aboveRoof = y - roofTop;
      if (y >= beltY && x - envelope(y) > widest - envelope(widestY)) { widest = x; widestY = y; }
    }
    assert.ok(aboveRoof <= 0,
      `${id}: a cage tube stands ${aboveRoof.toFixed(3)} m above the roof line`);
    assert.ok(widest <= envelope(widestY),
      `${id}: a cage tube reaches x=${widest.toFixed(3)} at y=${widestY.toFixed(3)}, where the `
      + `glasshouse is only ${envelope(widestY).toFixed(3)} wide`);

    // It still has to BE a cage: a hoop, stays and door bars spanning the cabin.
    const box = car.parts.rollCage.geometry.boundingBox;
    assert.ok(box.max.y - box.min.y > 0.9, `${id}: the cage is too short to be one`);
    assert.ok(box.max.z - box.min.z > 1.8, `${id}: the cage has no fore-and-aft bracing`);
    car.dispose();
  }
  clearLiveryCache();
});

test("wheel: both faces of the wheel are closed, and the tread has contrast", () => {
  // All four corners share one geometry, unmirrored, so a rim dished to -X showed
  // spokes on the left of the car and the open back of the barrel on the right:
  // a hole with the stage visible through it. And the tread blocks carried the
  // same albedo as the grooves they stand in, so 42 pads of relief shaded as one
  // black cylinder.
  for (const id of ["corvine-rs2000", "astra-corsa"]) {
    const spec = carSpec(id);
    const wheel = buildWheelMesh(THREE, spec);
    const rimR = spec.wheelRadius * (wheel.kind === "tarmac" ? 0.72 : 0.62);
    const rim = wheel.rim.geometry.getAttribute("position").array;
    // Vertices in the spoke band — inboard of the bead, outboard of the bore.
    let neg = 0, pos = 0;
    for (let i = 0; i < rim.length; i += 3) {
      const r = Math.hypot(rim[i + 1], rim[i + 2]);
      if (r < rimR * 0.2 || r > rimR * 0.95) continue;
      if (rim[i] < -wheel.width * 0.12) neg += 1;
      if (rim[i] > wheel.width * 0.12) pos += 1;
    }
    assert.ok(neg > 20 && pos > 20,
      `${id}: the rim face exists on one side only (${neg} vertices at -X, ${pos} at +X); `
      + "the wheels on the other side of the car are see-through");

    const disc = wheel.disc.geometry.boundingBox;
    assert.ok(disc.min.x < 0 && disc.max.x > 0,
      `${id}: the brake disc sits entirely at x[${disc.min.x},${disc.max.x}] and backs only one face`);
    const cal = wheel.caliper.geometry.boundingBox;
    assert.ok(cal.min.x < 0 && cal.max.x > 0,
      `${id}: the caliper does not straddle its disc (x[${cal.min.x},${cal.max.x}])`);

    // Tread contrast, both ends still inside the band carbon black occupies.
    const scale = materialAlbedoScale(wheel.tyre.material);
    const col = wheel.tyre.geometry.getAttribute("color").array;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i + 2 < col.length; i += 3) {
      const v = 0.2126 * col[i] * scale[0] + 0.7152 * col[i + 1] * scale[1] + 0.0722 * col[i + 2] * scale[2];
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    assert.ok(hi > lo * 1.4, `${id}: the tyre shades ${lo.toFixed(4)}..${hi.toFixed(4)} — no tread contrast`);
    assert.ok(lo >= 0.02 && hi <= 0.07, `${id}: ${lo.toFixed(4)}..${hi.toFixed(4)} is outside carbon-black rubber`);
    wheel.dispose();
  }
});

test("scenery: the conifer silhouette is broken, not a solid cone", () => {
  // Three critics independently called the trees cardboard. A conifer drawn as
  // stacked cones has a perfect unbroken triangular outline and no sky through
  // the canopy, and that is most of what makes a forest read — no texture painted
  // on a cone fixes it. Measured here as: at a given height the canopy's radius
  // must vary round the compass, with real gaps between the branches.
  const st = theStage();
  const lib = buildSceneryLibrary(THREE, st, TEX);
  const proto = lib.prototypes.get("tree:0");
  const pos = proto.geometry.getAttribute("position").array;
  const idx = proto.geometry.getIndex().array;
  const box = proto.geometry.boundingBox;

  // The section of the canopy at one height, taken by cutting every triangle
  // with that plane — vertices alone would not do, because a cone has three of
  // them between its base and its apex and a surface everywhere in between.
  const SECT = 16;
  const sectionAt = (yCut) => {
    const reach = new Float64Array(SECT);
    const hit = (x, z) => {
      const s = Math.floor(((Math.atan2(z, x) + Math.PI) / (2 * Math.PI)) * SECT) % SECT;
      const r = Math.hypot(x, z);
      if (r > reach[s]) reach[s] = r;
    };
    const cross = [];
    for (let t = 0; t < idx.length; t += 3) {
      cross.length = 0;
      for (let e = 0; e < 3; e += 1) {
        const a = idx[t + e] * 3, b2 = idx[t + (e + 1) % 3] * 3;
        const ya = pos[a + 1], yb = pos[b2 + 1];
        if ((ya < yCut && yb < yCut) || (ya > yCut && yb > yCut)) continue;
        if (Math.abs(yb - ya) < 1e-9) { cross.push([pos[a], pos[a + 2]], [pos[b2], pos[b2 + 2]]); continue; }
        const k = (yCut - ya) / (yb - ya);
        cross.push([pos[a] + (pos[b2] - pos[a]) * k, pos[a + 2] + (pos[b2 + 2] - pos[a + 2]) * k]);
      }
      // A triangle meets the plane in a SEGMENT, and the whole segment is
      // surface. Sampling only the endpoints leaves a cone reading as eight
      // isolated points with empty sectors between them, which would score a
      // solid cone as ragged.
      if (cross.length < 2) continue;
      for (let k = 0; k <= 12; k += 1) {
        const u = k / 12;
        hit(cross[0][0] + (cross[1][0] - cross[0][0]) * u, cross[0][1] + (cross[1][1] - cross[0][1]) * u);
      }
    }
    return reach;
  };

  const BANDS = 5;
  let notched = 0;
  const ratios = [];
  for (let bd = 0; bd < BANDS; bd += 1) {
    const yCut = box.min.y + (box.max.y - box.min.y) * (0.22 + (bd / (BANDS - 1)) * 0.55);
    const reach = sectionAt(yCut);
    let mx = 0, mn = Infinity;
    for (const r of reach) { if (r > mx) mx = r; if (r < mn) mn = r; }
    assert.ok(mx > 0.05, `nothing at all in the canopy at y=${yCut.toFixed(2)}`);
    ratios.push(mn / mx);
    // A cone's section is a circle: every sector reaches the same radius, and
    // the stacked cones scored 0.98 at every height. A canopy with branch tips
    // and sky between them cannot — this one runs 0.26 to 0.59.
    if (mn < mx * 0.68) notched += 1;
  }
  assert.ok(notched >= 4,
    `only ${notched} of ${BANDS} sections have a broken outline (min/max radius per section: `
    + `${ratios.map((r) => r.toFixed(2)).join(", ")}) — this is a cone`);

  // Cards have two sides. FrontSide would delete half of every canopy depending
  // on which way the camera was pointing.
  assert.equal(lib.materials.tree.side, THREE.DoubleSide, "foliage cards are single-sided");
  assert.ok(proto.triangles < 80, `a conifer costs ${proto.triangles} triangles; the forest is instanced`);
  lib.dispose();
});

// ---- the cabin -----------------------------------------------------------

test("car: the cabin is open, trimmed, and the driver can see an instrument", async () => {
  // buildBodyShell used to loft a CLOSED hull whose deck ran through the cabin at
  // belt height. That single fact is why the cockpit camera photographed
  // bodywork, why the dash and the wheel were modelled and never rendered, and
  // why the inside of the roof carried the exterior livery. Every number below is
  // measured off the car's own geometry and render.js's own cockpit mount, so it
  // restates neither module's constants.
  const {
    cameraParams, makeCarSample, sampleCar, mountLocalX, mountLocalZ, CAMERA_DESIGN_ASPECT,
  } = await import("../render.js");
  const p = cameraParams("cockpit");
  const sample = makeCarSample();

  for (const spec of CARS) {
    const id = spec.id;
    const record = newRecord();
    const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
    const d = car.dimensions;
    // parts.windscreen is an alias for parts.glass, so the same mesh is in there
    // twice; the Set is what stops every ray reporting the screen as two hits.
    const parts = [...new Set(Object.values(car.parts))];
    const paint = car.parts.body.material;
    const nameOf = new Map();
    for (const [name, mesh] of Object.entries(car.parts)) if (!nameOf.has(mesh)) nameOf.set(mesh, name);

    // The eye is placed by render.js from a real physics car, so this is the seat
    // the player gets rather than a copy of its numbers.
    sampleCar(sample, createCar(id), null);
    assert.equal(sample.halfWidth, d.bodyHalfWidth, `${id}: render.js and meshes.js disagree about the body half width`);
    assert.equal(sample.frontAxle, d.frontAxle, `${id}: render.js and meshes.js disagree about the front axle`);
    assert.equal(-sample.comHeight, d.ground, `${id}: render.js and meshes.js disagree about the ground plane`);
    const eye = new THREE.Vector3(mountLocalX(sample, p), p.mountY - sample.comHeight, mountLocalZ(sample, p));
    const cam = new THREE.PerspectiveCamera(p.fovBase, CAMERA_DESIGN_ASPECT, p.near, 100);
    cam.position.copy(eye);
    cam.lookAt(eye.x, eye.y + p.lookHeight, eye.z + p.lookAhead);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const shoot = (dir, far) => new THREE.Raycaster(eye.clone(), dir.clone().normalize(), 0.02, far)
      .intersectObjects(parts, false)
      .filter((h) => h.object !== car.parts.glass);

    // The cabin volume, taken off the glass rather than off cabinFrame(): the two
    // panes that straddle the centreline are the screen and the backlight, and
    // the driver sits between them.
    const gp = car.parts.glass.geometry.getAttribute("position");
    const panes = [];
    for (let i = 0; i + 3 < gp.count; i += 4) {
      const v = [];
      for (let k = 0; k < 4; k += 1) v.push(new THREE.Vector3().fromBufferAttribute(gp, i + k));
      const xs = v.map((q) => q.x);
      if (Math.min(...xs) < -1e-6 && Math.max(...xs) > 1e-6) {
        panes.push({ v, meanZ: (v[0].z + v[1].z + v[2].z + v[3].z) / 4 });
      }
    }
    assert.equal(panes.length, 2, `${id}: expected a windscreen and a backlight across the centreline`);
    panes.sort((a, b) => b.meanZ - a.meanZ);
    const planeOf = (q) => {
      const pl = new THREE.Plane().setFromCoplanarPoints(q.v[0], q.v[1], q.v[2]);
      if (pl.distanceToPoint(eye) < 0) pl.negate();          // + is the cabin side
      return pl;
    };
    const screenPlane = planeOf(panes[0]);
    const backPlane = planeOf(panes[1]);
    let glassTop = -Infinity, glassBelt = Infinity;
    for (let i = 0; i < gp.count; i += 1) {
      const y = gp.getY(i);
      if (y > glassTop) glassTop = y;
      if (y < glassBelt) glassBelt = y;
    }
    const inCabin = (q) => screenPlane.distanceToPoint(q) > 0.01 && backPlane.distanceToPoint(q) > 0.01
      && q.y < glassTop + 0.05 && q.y > glassBelt - 0.40;

    // 1. The roof is trimmed: straight up from the driver's head the first
    // surface is the headliner, not the painted skin the outside of the car wears.
    const above = shoot(new THREE.Vector3(0, 1, 0), 3);
    assert.ok(above.length, `${id}: nothing at all above the driver's head`);
    assert.notEqual(above[0].object.material, paint,
      `${id}: the first surface above the driver is ${nameOf.get(above[0].object)} on the paint `
      + `material, ${above[0].distance.toFixed(3)} m up — the hull is closed over the cabin`);

    // 2. Cast the cockpit frustum and look at what the eye lands on. The pillars
    // are painted body colour, which is ONE flat swatch of the livery atlas;
    // anything else on the paint material inside the cabin is the exterior seen
    // from within, which is what a deck or an untrimmed roof looks like.
    const N = 25;
    const inv = cam.projectionMatrixInverse, world = cam.matrixWorld;
    const scratch = new THREE.Vector3();
    const swatches = new Set();
    let cabinPaint = 0, lowerCabin = 0, lowerRays = 0, upperBlocked = 0, upperRays = 0;
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const u = (i / (N - 1)) * 1.9 - 0.95, v = (j / (N - 1)) * 1.9 - 0.95;
        scratch.set(u, v, 0.5).applyMatrix4(inv).applyMatrix4(world);
        const hits = shoot(scratch.sub(eye), 40);
        if (v < 0) lowerRays += 1; else upperRays += 1;
        if (!hits.length) continue;
        const hit = hits[0];
        const name = nameOf.get(hit.object);
        if (v < 0 && (name === "interior" || name === "cabinTrim")) lowerCabin += 1;
        if (v >= 0) upperBlocked += 1;
        if (hit.object.material === paint && inCabin(hit.point)) {
          cabinPaint += 1;
          const uv = hit.object.geometry.getAttribute("uv"), f = hit.face;
          const cu = (uv.getX(f.a) + uv.getX(f.b) + uv.getX(f.c)) / 3;
          const cv = (uv.getY(f.a) + uv.getY(f.b) + uv.getY(f.c)) / 3;
          swatches.add(`${cu.toFixed(4)},${cv.toFixed(4)}`);
        }
      }
    }
    assert.ok(swatches.size <= 1,
      `${id}: the driver's eye lands on the livery at ${cabinPaint} points across ${swatches.size} `
      + `different places in the atlas (${[...swatches].slice(0, 4).join(" ")}); the inside of a `
      + "cabin is trim, and one flat swatch on the painted pillars");
    // The dash and the wheel are IN the picture. Under the closed hull's deck
    // this halved, because the lower frame was filled with the deck instead.
    assert.ok(lowerCabin >= 110,
      `${id}: only ${lowerCabin} of ${lowerRays} rays across the lower half of the cockpit frame `
      + "land on the cabin; the dash and the wheel are not in shot");
    // And there is a glasshouse to look out of.
    assert.ok(upperBlocked <= 170,
      `${id}: ${upperBlocked} of ${upperRays} rays across the upper half of the frame are stopped `
      + "by the car; the driver cannot see out");

    // 3. An instrument face is in the frame with nothing in front of it. The
    // brightest colour in the cabin is the dial face; on the old fascia-mounted
    // cluster every one of them projected to clip y -1.33 — modelled, never drawn.
    const geo = car.parts.interior.geometry;
    const col = geo.getAttribute("color"), pos = geo.getAttribute("position"), idx = geo.getIndex();
    const lum = (k) => 0.2126 * col.getX(k) + 0.7152 * col.getY(k) + 0.0722 * col.getZ(k);
    let brightest = 0;
    for (let k = 0; k < col.count; k += 1) brightest = Math.max(brightest, lum(k));
    let dialFaces = 0, inFrame = 0, visible = 0, highest = -Infinity;
    const centre = new THREE.Vector3(), corner = new THREE.Vector3();
    for (let k = 0; k < idx.count; k += 3) {
      const a = idx.getX(k), b = idx.getX(k + 1), c = idx.getX(k + 2);
      if (lum(a) < brightest - 1e-6 || lum(b) < brightest - 1e-6 || lum(c) < brightest - 1e-6) continue;
      dialFaces += 1;
      centre.set(0, 0, 0);
      for (const t of [a, b, c]) centre.add(corner.fromBufferAttribute(pos, t));
      centre.multiplyScalar(1 / 3);
      const ndc = centre.clone().project(cam);
      if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue;
      inFrame += 1;
      if (shoot(centre.clone().sub(eye), centre.distanceTo(eye) - 0.004).length) continue;
      visible += 1;
      if (ndc.y > highest) highest = ndc.y;
    }
    assert.ok(dialFaces > 0, `${id}: the cabin has no instrument faces at all`);
    assert.ok(visible >= 40,
      `${id}: ${inFrame} of the ${dialFaces} instrument faces reach the cockpit frame and ${visible} `
      + "of those are unobstructed; the driver has no dial he can read");
    assert.ok(highest > -0.95,
      `${id}: the highest visible instrument sits at clip y ${highest.toFixed(3)}, on the very `
      + "bottom edge of the frame");

    // 4. The glasshouse has depth: the side glass is set in from the shoulder and
    // every pane sits below the roof skin rather than flush with it.
    const bp = car.parts.body.geometry.getAttribute("position");
    let shoulder = 0, roofSkin = -Infinity;
    const bv = new THREE.Vector3();
    for (let i = 0; i < bp.count; i += 1) {
      bv.fromBufferAttribute(bp, i);
      if (bv.y > roofSkin) roofSkin = bv.y;
      if (!inCabin(bv)) continue;
      if (Math.abs(bv.y - glassBelt) <= 0.02 && Math.abs(bv.x) > shoulder) shoulder = Math.abs(bv.x);
    }
    let sideReach = 0;
    for (let i = 0; i < gp.count; i += 1) {
      if (Math.abs(gp.getY(i) - glassBelt) > 0.02) continue;
      sideReach = Math.max(sideReach, Math.abs(gp.getX(i)));
    }
    assert.ok(shoulder - sideReach > 0.020,
      `${id}: the side glass reaches x=${sideReach.toFixed(3)} against a shoulder at `
      + `${shoulder.toFixed(3)}; it is flush with the flank rather than set into it`);
    assert.ok(roofSkin - glassTop > 0.020,
      `${id}: the glass tops out at y=${glassTop.toFixed(3)} under a roof skin at `
      + `${roofSkin.toFixed(3)}; the glasshouse has no depth at the header`);

    // 5. The instrument pod stands proud of the fascia, and the heritage cars
    // rake their screen hardest, so its clearance to the glass is what decides
    // how tall a pod may be. cabinTrim is excluded: its header rail is built on
    // the screen's own top edge and touches the glass by design.
    let clear = Infinity, worst = null;
    for (const key of ["interior"]) {
      const q = car.parts[key].geometry.getAttribute("position");
      for (let i = 0; i < q.count; i += 1) {
        bv.fromBufferAttribute(q, i);
        if (bv.y <= glassBelt + 1e-4) continue;             // only what stands above the fascia
        if (backPlane.distanceToPoint(bv) < 0) continue;    // and only forward of the backlight
        const gap = screenPlane.distanceToPoint(bv);
        if (gap < clear) { clear = gap; worst = key; }
      }
    }
    assert.ok(clear > 0.005,
      `${id}: ${worst} comes within ${clear.toFixed(4)} m of the windscreen plane; the cabin is `
      + "poking out through the glass");

    car.dispose();
  }
  clearLiveryCache();
});

test("car: no livery graphic reaches the driver's eye, and the bonnet skins the deck", async () => {
  // The cockpit camera photographed a horizontal band of the car's own livery —
  // white, blue and orange stripes with a specular sheen — running across the
  // forward view between the wheel and the road, day and night. It was the
  // SHELL'S DECK. buildBodyShell lofted a crown that stood 19 to 79 mm proud of
  // the bonnet that is supposed to skin it, so the deck was the visible surface
  // over the whole engine bay; and it ran along the driver's sight line carrying
  // the atlas's deck-stripe band. Measured on ardent-r1 before the fix, the eye
  // reached the deck at z=0.96 and z=1.57, the bonnet's vents between 1.12 and
  // 1.27, and the light pod at the nose — all inside one 70 px strip.
  //
  // Neither assertion below restates a constant of meshes.js. The atlas is
  // sampled from single FLAT swatches for the parts that are painted but carry
  // no graphic — the pillars, the mirrors, the wing — so those faces map all
  // three corners to one texel, while anything carrying a graphic maps an area.
  // So: every painted face the cockpit eye reaches has to be one texel. And
  // whatever panel skins the car has to stand above the deck under it.
  const {
    cameraParams, makeCarSample, sampleCar, mountLocalX, mountLocalZ, CAMERA_DESIGN_ASPECT,
  } = await import("../render.js");
  const p = cameraParams("cockpit");
  const sample = makeCarSample();

  for (const spec of CARS) {
    const id = spec.id;
    const record = newRecord();
    const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
    const d = car.dimensions;
    const parts = [...new Set(Object.values(car.parts))];
    const paint = car.parts.body.material;
    const nameOf = new Map();
    for (const [name, mesh] of Object.entries(car.parts)) if (!nameOf.has(mesh)) nameOf.set(mesh, name);

    sampleCar(sample, createCar(id), null);
    const eye = new THREE.Vector3(mountLocalX(sample, p), p.mountY - sample.comHeight, mountLocalZ(sample, p));
    const cam = new THREE.PerspectiveCamera(p.fovBase, CAMERA_DESIGN_ASPECT, p.near, 100);
    cam.position.copy(eye);
    cam.lookAt(eye.x, eye.y + p.lookHeight, eye.z + p.lookAhead);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();

    const inv = cam.projectionMatrixInverse, world = cam.matrixWorld;
    const scratch = new THREE.Vector3();
    const N = 45;
    const graphic = [];
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const u = (i / (N - 1)) * 1.98 - 0.99, v = (j / (N - 1)) * 1.98 - 0.99;
        scratch.set(u, v, 0.5).applyMatrix4(inv).applyMatrix4(world);
        const hits = new THREE.Raycaster(eye.clone(), scratch.clone().sub(eye).normalize(), 0.02, 60)
          .intersectObjects(parts, false)
          .filter((h) => h.object !== car.parts.glass);
        if (!hits.length || hits[0].object.material !== paint) continue;
        const hit = hits[0];
        const uv = hit.object.geometry.getAttribute("uv"), f = hit.face;
        const du = Math.max(Math.abs(uv.getX(f.a) - uv.getX(f.b)), Math.abs(uv.getX(f.a) - uv.getX(f.c)));
        const dv = Math.max(Math.abs(uv.getY(f.a) - uv.getY(f.b)), Math.abs(uv.getY(f.a) - uv.getY(f.c)));
        if (du > 1e-6 || dv > 1e-6) {
          graphic.push(`${nameOf.get(hit.object)} at (${hit.point.x.toFixed(2)}, `
            + `${hit.point.y.toFixed(3)}, ${hit.point.z.toFixed(3)}) frame (${u.toFixed(2)}, ${v.toFixed(2)}) `
            + `spans ${du.toFixed(3)}x${dv.toFixed(3)} of the atlas`);
        }
      }
    }
    assert.deepEqual(graphic.slice(0, 4), [],
      `${id}: the driver's eye lands on ${graphic.length} points of the car's own livery graphic; `
      + "the first few are above. Everything painted forward of the screen belongs under the cowl");

    // The bonnet and the cowl are the skin; the deck is what they cover. A down
    // ray registers only upward-facing surfaces, so the first hit on each part is
    // the outermost one it presents — which is exactly what decides whether a
    // viewer above the car sees the panel or the structure under it.
    const boxOf = (mesh) => new THREE.Box3().setFromBufferAttribute(mesh.geometry.getAttribute("position"));
    const bonnetBox = boxOf(car.parts.bonnet), cowlBox = boxOf(car.parts.scuttle);
    assert.ok(Math.abs(cowlBox.max.z - bonnetBox.min.z) < 1e-3,
      `${id}: the cowl ends at z=${cowlBox.max.z.toFixed(3)} and the bonnet starts at `
      + `${bonnetBox.min.z.toFixed(3)}; the deck between them is open to the sky`);
    const down = new THREE.Vector3(0, -1, 0);
    const cast = (mesh, x, z) => {
      const h = new THREE.Raycaster(new THREE.Vector3(x, 6, z), down, 0.01, 12).intersectObject(mesh, false);
      return h.length ? h[0].point.y : null;
    };
    let proud = -Infinity, at = null;
    for (let k = 0; k <= 48; k += 1) {
      const z = cowlBox.min.z + 0.01 + (bonnetBox.max.z - cowlBox.min.z - 0.02) * (k / 48);
      // Inside the deck's own crown. Outboard of that the shoulder takes over,
      // and the shoulder is the belt line — the top of the wing, which is
      // supposed to be visible and is not what carried the stripe.
      for (const frac of [-0.4, -0.25, -0.12, 0, 0.12, 0.25, 0.4]) {
        const x = frac * d.bodyHalfWidth;
        const deck = cast(car.parts.body, x, z);
        const skin = Math.max(cast(car.parts.bonnet, x, z) ?? -Infinity,
          cast(car.parts.scuttle, x, z) ?? -Infinity);
        if (deck === null || skin === -Infinity) continue;
        if (deck - skin > proud) { proud = deck - skin; at = `x=${x.toFixed(2)} z=${z.toFixed(3)}`; }
      }
    }
    assert.ok(proud < -0.004,
      `${id}: the shell's deck stands ${(proud * 1000).toFixed(0)} mm proud of the panel that skins `
      + `it at ${at}; the deck is inner structure and it is what the driver was looking at`);

    car.dispose();
  }
  clearLiveryCache();
});

test("car: the cowl's lip hides the whole bonnet from the driver's eye", async () => {
  // The cowl is walked forward by scuttleFrame until the bonnet drops out of the
  // cockpit sight line. The walk tests a SAMPLED envelope, and it once sampled
  // the one end of a raised block that never binds: the bonnet's scoop stood 10
  // to 11 mm over the line on all eight cars, top face and side walls in the
  // driver's forward view. Nothing caught it. The neighbouring "no livery
  // graphic" test cannot: the scoop is painted from the flat LIVERY_TRIM_UV
  // swatch, and that test only flags faces whose UVs span an AREA.
  //
  // The oracle here is exact rather than sampled, because the thing it guards is
  // a 0.6 mm margin. Take the cowl's lip ring off the BUILT panel, back-project
  // every bonnet vertex down the sight line onto the lip's plane, and compare it
  // with the lip's own upper outline there. Exact for whole triangles, not only
  // for vertices: the outline is concave, so the region under it is convex, and
  // a perspective projection takes a triangle to a triangle — a face can only
  // break the line if one of its corners does.
  //
  // Measured with this: pre-fix 6 bonnet vertices per car sit over the lip,
  // worst 10.39 mm on six cars and 11.40 mm on brackmoor-t8 and delta-b640;
  // post-fix none, with 1.64 mm and 0.64 mm of clearance left. Everything below
  // comes off the built meshes and render.js's own cockpit mount, so it restates
  // no constant of meshes.js bar the eye the solver is hard-coded to.
  const {
    cameraParams, makeCarSample, sampleCar, mountLocalX, mountLocalZ, CAMERA_DESIGN_ASPECT,
  } = await import("../render.js");
  const p = cameraParams("cockpit");
  const sample = makeCarSample();

  for (const spec of CARS) {
    const id = spec.id;
    const record = newRecord();
    const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
    const d = car.dimensions;
    const parts = [...new Set(Object.values(car.parts))];
    const nameOf = new Map();
    for (const [name, mesh] of Object.entries(car.parts)) if (!nameOf.has(mesh)) nameOf.set(mesh, name);

    sampleCar(sample, createCar(id), null);
    const eye = new THREE.Vector3(mountLocalX(sample, p), p.mountY - sample.comHeight, mountLocalZ(sample, p));
    // scuttleFrame solves the walk against its own copy of the eye — 1.16 m over
    // the road, 1.24 m behind the front axle. If render.js moves the camera and
    // that copy does not follow, the cowl is solved for a seat nobody sits in
    // and every margin below is measured against the wrong line. This is the
    // pinning the scuttleFrame comment says lives here.
    assert.ok(Math.abs(eye.y - (d.ground + 1.16)) < 1e-9,
      `${id}: render.js seats the driver ${(eye.y - d.ground).toFixed(4)} m over the road; `
      + "scuttleFrame solves the cowl for 1.16 m");
    assert.ok(Math.abs(eye.z - (d.frontAxle - 1.24)) < 1e-9,
      `${id}: render.js seats the driver ${(d.frontAxle - eye.z).toFixed(4)} m behind the front `
      + "axle; scuttleFrame solves the cowl for 1.24 m");

    // The lip: the cowl's forwardmost ring, read off the built panel. An
    // existing test already pins the bonnet's trailing edge to this same z, so
    // this is the shut line the two panels meet on.
    const sp = car.parts.scuttle.geometry.getAttribute("position");
    let zLip = -Infinity;
    for (let i = 0; i < sp.count; i += 1) zLip = Math.max(zLip, sp.getZ(i));
    assert.ok(zLip > eye.z + 0.05,
      `${id}: the cowl's lip is at z=${zLip.toFixed(3)}, not forward of the eye at ${eye.z.toFixed(3)}`);

    // Its upper outline: the highest cowl vertex at each x in that plane. The
    // shut-line step and the wall down to the wing put lower vertices at the same
    // x, and it is the highest one that decides what the eye can see past.
    const tops = new Map();
    for (let i = 0; i < sp.count; i += 1) {
      if (Math.abs(sp.getZ(i) - zLip) > 1e-6) continue;
      const x = sp.getX(i), key = x.toFixed(6), prev = tops.get(key);
      if (!prev || sp.getY(i) > prev[1]) tops.set(key, [x, sp.getY(i)]);
    }
    const env = [...tops.values()].sort((a, b) => a[0] - b[0]);
    assert.ok(env.length >= 3,
      `${id}: the cowl's lip is ${env.length} points wide; there is no outline to hide behind`);
    for (let k = 1; k + 1 < env.length; k += 1) {
      const span = env[k + 1][0] - env[k - 1][0];
      if (span < 1e-9) continue;
      const t = (env[k][0] - env[k - 1][0]) / span;
      const chord = env[k - 1][1] + t * (env[k + 1][1] - env[k - 1][1]);
      assert.ok(env[k][1] >= chord - 1e-9,
        `${id}: the cowl's lip dips ${((chord - env[k][1]) * 1000).toFixed(2)} mm below its own `
        + `chord at x=${env[k][0].toFixed(3)}; the outline is not concave, so testing corners is `
        + "no longer enough to clear a whole triangle");
    }
    const envAt = (x) => {
      if (x <= env[0][0]) return env[0][1];
      const last = env[env.length - 1];
      if (x >= last[0]) return last[1];
      let k = 0;
      while (k + 1 < env.length && env[k + 1][0] < x) k += 1;
      const t = (x - env[k][0]) / (env[k + 1][0] - env[k][0]);
      return env[k][1] + t * (env[k + 1][1] - env[k][1]);
    };

    // Nothing on the bonnet may reach the eye over that outline. The bonnet's own
    // trailing edge sits IN the lip plane and is wider than the lip there, which
    // is why the lateral check is taken forward of the plane: the outline has to
    // span everything the eye could look over, or a corner could escape past its
    // end unseen by the test.
    const bp = car.parts.bonnet.geometry.getAttribute("position");
    let outboard = 0, widest = 0, over = 0, worstRise = -Infinity, worstAt = null;
    const v = new THREE.Vector3();
    for (let i = 0; i < bp.count; i += 1) {
      v.fromBufferAttribute(bp, i);
      if (v.z > zLip + 1e-6) {
        widest = Math.max(widest, Math.abs(v.x));
        if (v.x < env[0][0] - 1e-9 || v.x > env[env.length - 1][0] + 1e-9) outboard += 1;
      }
      const s = (zLip - eye.z) / (v.z - eye.z);           // down the sight line to the lip plane
      const rise = (eye.y + s * (v.y - eye.y)) - envAt(eye.x + s * (v.x - eye.x));
      if (rise > 0) over += 1;
      if (rise > worstRise) { worstRise = rise; worstAt = v.clone(); }
    }
    assert.equal(outboard, 0,
      `${id}: ${outboard} bonnet vertices forward of the lip reach x=${widest.toFixed(3)}, outside `
      + `the lip's own ${env[0][0].toFixed(3)}..${env[env.length - 1][0].toFixed(3)}; the outline no `
      + "longer spans the panel it is supposed to hide");
    assert.equal(over, 0,
      `${id}: ${over} bonnet vertices stand over the cowl's lip in the driver's sight line, the `
      + `worst by ${(worstRise * 1000).toFixed(2)} mm — it is at (${worstAt.x.toFixed(3)}, `
      + `${worstAt.y.toFixed(3)}, ${worstAt.z.toFixed(3)}), and the cowl's lip is y=`
      + `${envAt(worstAt.x).toFixed(3)} at z=${zLip.toFixed(3)}. The cowl is the anti-glare panel; `
      + "everything on the bonnet belongs under it");

    // And the same thing said end to end, by casting the real cockpit frustum:
    // no ray may find the bonnet first. This is the coarse check — at 45x45 it
    // saw the fault above on only brackmoor-t8 (2 rays) and delta-b640 (1), and
    // it takes 32k rays a car to see it on the rest, so it is confirmation and
    // not the guard. What it adds is the part the outline cannot see: a bonnet
    // that became visible round the ends of the lip, or through the cowl.
    const cam = new THREE.PerspectiveCamera(p.fovBase, CAMERA_DESIGN_ASPECT, p.near, 100);
    cam.position.copy(eye);
    cam.lookAt(eye.x, eye.y + p.lookHeight, eye.z + p.lookAhead);
    cam.updateMatrixWorld(true);
    cam.updateProjectionMatrix();
    const inv = cam.projectionMatrixInverse, world = cam.matrixWorld;
    const scratch = new THREE.Vector3();
    const N = 45;
    const seen = [];
    for (let i = 0; i < N; i += 1) {
      for (let j = 0; j < N; j += 1) {
        const u = (i / (N - 1)) * 1.98 - 0.99, w = (j / (N - 1)) * 1.98 - 0.99;
        scratch.set(u, w, 0.5).applyMatrix4(inv).applyMatrix4(world);
        const hits = new THREE.Raycaster(eye.clone(), scratch.clone().sub(eye).normalize(), 0.02, 60)
          .intersectObjects(parts, false)
          .filter((h) => h.object !== car.parts.glass);
        if (!hits.length || hits[0].object !== car.parts.bonnet) continue;
        seen.push(`frame (${u.toFixed(2)}, ${w.toFixed(2)}) at (${hits[0].point.x.toFixed(3)}, `
          + `${hits[0].point.y.toFixed(3)}, ${hits[0].point.z.toFixed(3)})`);
      }
    }
    assert.deepEqual(seen.slice(0, 4), [],
      `${id}: ${seen.length} of ${N * N} cockpit rays land on the bonnet before anything else; `
      + "the first few are above");

    // The light pod is the one thing forward of the screen that IS still in the
    // driver's view, and it is furniture rather than paintwork: its own matte
    // material, vertex-coloured, with no livery map on it. The scuttleFrame
    // comment says so, and this is what makes that true.
    const pod = car.parts.lightPod;
    assert.ok(pod, `${id}: the car has no light pod`);
    assert.notEqual(pod.material, car.parts.body.material,
      `${id}: the light pod is on the paint material; it stands in the sight line over the cowl`);
    assert.equal(pod.material.map, null,
      `${id}: the light pod's material carries a texture; over the cowl that is livery in the eye`);
    assert.equal(nameOf.get(pod), "lightPod", `${id}: the light pod is not its own part`);

    car.dispose();
  }
  clearLiveryCache();
});

test("car: an instrument face is a disc, not a dodecagon", () => {
  // The dials were twelve-sided, which at the 173 px the main gauge's face covers
  // on a 1600 wide cockpit frame is a visible polygon — 0.104 m of face seen from
  // 0.61 m of depth through a 48 degree vertical fov at 16:9; the two flanking it
  // are 101 px. Measured off the silhouette rather
  // than off a segment count: take every flat disc in the cabin — a group of
  // same-coloured vertices in one thin z slab, all at one radius from their own
  // centre — and check the angular step round its rim.
  const record = newRecord();
  const spec = carSpec("ardent-r1");
  const car = buildCarMesh(THREE, spec, spec.livery, { size: 64, canvasFactory: fakeCanvasFactory(record) });
  const geo = car.parts.interior.geometry;
  const pos = geo.getAttribute("position");

  // Connected components of the index buffer, so the grouping is the mesh's own
  // topology and cannot drift with how far apart the vertices happen to sit —
  // a distance threshold tuned on a 30-sided dial stops linking a 12-sided one,
  // which would hide the very fault this is looking for.
  const idx = geo.getIndex();
  const parent = new Int32Array(pos.count).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let k = 0; k < idx.count; k += 3) {
    union(idx.getX(k), idx.getX(k + 1));
    union(idx.getX(k), idx.getX(k + 2));
  }
  const comps = new Map();
  for (let i = 0; i < pos.count; i += 1) {
    const root = find(i);
    if (!comps.has(root)) comps.set(root, []);
    comps.get(root).push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
  }
  const discs = [];
  for (const pts of comps.values()) {
    if (pts.length < 20) continue;
    const zs = pts.map((q) => q[2]);
    if (Math.max(...zs) - Math.min(...zs) > 0.020) continue;        // a flat face, not a tube
    let cx = 0, cy = 0;
    for (const q of pts) { cx += q[0]; cy += q[1]; }
    cx /= pts.length; cy /= pts.length;
    const r = pts.map((q) => Math.hypot(q[0] - cx, q[1] - cy));
    const rMax = Math.max(...r);
    if (rMax < 0.025) continue;
    const rim = pts.filter((q, k) => r[k] > rMax * 0.99);           // a true rim, not box corners
    if (rim.length < 20) continue;
    const ang = [...new Set(rim.map((q) => Math.round(Math.atan2(q[1] - cy, q[0] - cx) * 1e4)))]
      .map((a) => a / 1e4).sort((a, b) => a - b);
    let gap = ang[0] + Math.PI * 2 - ang[ang.length - 1];
    for (let k = 1; k < ang.length; k += 1) gap = Math.max(gap, ang[k] - ang[k - 1]);
    discs.push({ rMax, sides: ang.length, gap });
  }
  assert.ok(discs.length >= 3,
    `the cabin has ${discs.length} flat discs in it; three gauge faces were expected`);
  for (const disc of discs) {
    assert.ok(disc.gap <= (Math.PI * 2) / 24 + 1e-6,
      `a ${(disc.rMax * 2000).toFixed(0)} mm instrument face turns through `
      + `${(disc.gap * 180 / Math.PI).toFixed(1)} degrees between rim points (${disc.sides} sides); `
      + "at cockpit range that reads as a polygon, not a dial");
  }
  car.dispose();
  clearLiveryCache();
});
