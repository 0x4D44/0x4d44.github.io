// Chunked LOD terrain with a splat shader (biome ground textures blended by slope/height/noise,
// road-edge blend, macro variation, bump-from-albedo detail, wetness and snow).
import { patchCommon } from "./materials.mjs";
import {
  CHUNK_SIZE, LOD_QUADS, chunkGrid, chunkKey, selectLod, skirtDepth, chunkDistance, gridIndices,
} from "./quality.mjs";

const BIOME_TEX = {
  pasture: { A: "gnd_grass", B: "gnd_grass", rock: "gnd_limestone", spec: "road_dirt", mode: 3 },
  redwood: { A: "gnd_leaf", B: "gnd_fern", rock: "gnd_moss_rock", spec: "road_pumice", mode: 3 },
  coast: { A: "gnd_grass", B: "gnd_tussock", rock: "gnd_schist", spec: "gnd_sand", mode: 2 },
  tussock: { A: "gnd_tussock", B: "gnd_tussock", rock: "gnd_schist", spec: "road_dirt", mode: 3 },
  alpine: { A: "gnd_tussock", B: "gnd_moss_rock", rock: "gnd_schist", spec: "gnd_snow", mode: 1 },
  rainforest: { A: "gnd_fern", B: "gnd_leaf", rock: "gnd_moss_rock", spec: "gnd_moss_rock", mode: 0 },
};

const TERRAIN_FRAG_MAP = /* glsl */ `
vec3 arSplat(sampler2D t, vec2 uv, float nz){
  vec3 a = texture2D(t, uv).rgb;
  #ifdef AR_DETAIL
    vec3 b = texture2D(t, uv * 0.173 + vec2(0.37, 0.61)).rgb;
    a = mix(a, b, nz * 0.55);
  #endif
  return a;
}
vec3 arTint(vec3 c, vec3 pal, float k){ float l = dot(c, vec3(0.299, 0.587, 0.114)); return mix(c, vec3(l) * pal * 2.3, k); }

vec3 arAlbedo(out float rockOut){
  vec3 wn = normalize(vWN);
  float slope = 1.0 - wn.y;
  vec2 p = vWPos.xz;
  float nLo = fbm3(p * 0.006);
  float nMid = fbm3(p * 0.031 + 7.0);
  float nHi = vnoise(p * 0.45);
  float distNear = clamp(1.0 - length(vWPos - cameraPosition) / 120.0, 0.0, 1.0);

  vec3 cA = arTint(arSplat(tA, p * uScale.x, nMid), uColA, 0.5);
  vec3 cB = arTint(arSplat(tB, p * uScale.y, nMid), uColB, 0.5);
  float wB = smoothstep(0.38, 0.62, nLo + (nMid - 0.5) * 0.35);
  vec3 col = mix(cA, cB, wB);

  // special layer
  float ws = 0.0;
  if (uSpec.x > 2.5) ws = smoothstep(0.62, 0.78, nMid + (nHi - 0.5) * 0.2) * 0.85 + smoothstep(0.1, 0.22, slope) * 0.5;
  else if (uSpec.x > 1.5) ws = 1.0 - smoothstep(uSpec.y, uSpec.z, vWPos.y + (nMid - 0.5) * 3.0);
  else if (uSpec.x > 0.5) ws = smoothstep(uSpec.y, uSpec.z, vWPos.y + (nMid - 0.5) * 60.0) * (1.0 - smoothstep(0.25, 0.5, slope));
  ws = clamp(ws, 0.0, 1.0);
  {
    vec3 cs = arSplat(tSpec, p * uScale.w, nMid);
    cs = uSpec.x > 0.5 && uSpec.x < 1.5 ? cs : arTint(cs, uColSpec, 0.4);
    col = mix(col, cs, ws);
  }

  // rock on steep ground (triplanar, 3 taps only where visible)
  float rockW = smoothstep(uRockStart, uRockStart + 0.2, slope + (nMid - 0.5) * 0.16);
  rockOut = rockW;
  {
    vec3 bw = pow(abs(wn), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
    vec3 r = texture2D(tRock, vWPos.zy * uScale.z).rgb * bw.x + texture2D(tRock, vWPos.xy * uScale.z).rgb * bw.z + texture2D(tRock, vWPos.xz * uScale.z).rgb * bw.y;
    r = arTint(r, uColRock, 0.35) * (0.85 + 0.3 * nLo);
    col = mix(col, r, rockW);
  }

  // road-edge blend: bare dirt / gravel strip, a little darker grass next to the road
  float edge = 1.0 - smoothstep(0.0, 2.6, vRoad);
  edge *= 0.35 + 0.65 * smoothstep(0.35, 0.65, nHi + nMid * 0.4);
  col = mix(col, uColEdge * (0.75 + 0.5 * nHi), edge * (1.0 - rockW * 0.8) * 0.55);

  // macro variation to break tiling
  col *= 0.82 + 0.36 * nLo;
  col *= 0.92 + 0.16 * nMid;
  return col;
}
`;

function makeTerrainMaterial(THREE, SU, textures, stage, cfg) {
  const biome = stage.def.biome in BIOME_TEX ? stage.def.biome : "pasture";
  const bt = BIOME_TEX[biome];
  const pal = stage.def.palette ?? {};
  const col = (hex, d) => new THREE.Color(hex ?? d);
  const tex = (n) => textures.get(n);
  const mtr = (n) => 1 / Math.max(0.5, textures.meters(n));
  const b = stage.bounds;
  const range = Math.max(10, b.maxY - b.minY);
  let spec = new THREE.Vector4(0, 0, 0, 0);
  if (bt.mode === 1) spec.set(1, b.minY + range * 0.5, b.minY + range * 0.72, 0);
  else if (bt.mode === 2) spec.set(2, b.minY + range * 0.04, b.minY + range * 0.14, 0);
  else spec.set(bt.mode, 0, 1, 0);
  const U = {
    tA: { value: tex(bt.A) }, tB: { value: tex(bt.B) }, tRock: { value: tex(bt.rock) }, tSpec: { value: tex(bt.spec) },
    uScale: { value: new THREE.Vector4(mtr(bt.A), mtr(bt.B), mtr(bt.rock) * 0.8, mtr(bt.spec)) },
    uColA: { value: col(pal.grass, 0x6b8a3a) }, uColB: { value: col(pal.grass2, 0x8d9a4a) },
    uColRock: { value: col(pal.rock, 0x8a8a80) }, uColSpec: { value: col(pal.dirtEdge, 0x8b7455) },
    uColEdge: { value: col(pal.dirtEdge, 0x8b7455) },
    uSpec: { value: spec }, uRockStart: { value: biome === "pasture" || biome === "coast" ? 0.34 : biome === "redwood" ? 0.3 : 0.2 },
  };
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, metalness: 0, envMapIntensity: 0.7 });
  m.defines = cfg.detailTex ? { AR_DETAIL: 1 } : {};
  m.onBeforeCompile = (shader) => {
    patchCommon(shader, SU);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aRoad; varying float vRoad; varying vec3 vWN;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRoad = aRoad; vWN = normal;");
    shader.fragmentShader = shader.fragmentShader
      .replace("//AR_END", /* glsl */ `
        varying float vRoad; varying vec3 vWN;
        uniform sampler2D tA, tB, tRock, tSpec; uniform vec4 uScale, uSpec;
        uniform vec3 uColA, uColB, uColRock, uColSpec, uColEdge; uniform float uRockStart;
        ${TERRAIN_FRAG_MAP}`)
      .replace("#include <map_fragment>", /* glsl */ `
        float arRock = 0.0;
        vec3 arCol = arAlbedo(arRock);
        float arWetN = uWet * (0.55 + 0.45 * fbm3(vWPos.xz * 0.11));
        arCol *= 1.0 - 0.5 * arWetN;
        float arFlat = smoothstep(0.55, 0.9, normalize(vWN).y);
        float arSnow = uSnow * arFlat * smoothstep(0.35, 0.65, fbm3(vWPos.xz * 0.05) + 0.25);
        arCol = mix(arCol, vec3(0.9, 0.94, 1.0), arSnow);
        diffuseColor.rgb *= arCol;
        float arLuma = dot(arCol, vec3(0.299, 0.587, 0.114));`)
      .replace("#include <roughnessmap_fragment>", /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(roughnessFactor, 0.55, arWetN * 0.8);
        roughnessFactor = mix(roughnessFactor, 0.55, arSnow);`)
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
        {
          float dN = length(vViewPosition);
          float bk = 1.0 / (1.0 + dN * 0.03);
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 sX = normalize(sx), sY = normalize(sy);
          vec3 R1 = cross(sY, normal), R2 = cross(normal, sX);
          float fDet = dot(sX, R1);
          vec2 dH = vec2(dFdx(arLuma), dFdy(arLuma)) * 3.2 * bk * (1.0 - arSnow * 0.7);
          vec3 vGrad = sign(fDet) * (dH.x * R1 + dH.y * R2);
          normal = normalize(abs(fDet) * normal - vGrad);
        }`);
  };
  m.customProgramCacheKey = () => "ar-terrain-" + (cfg.detailTex ? 1 : 0);
  m.userData.uniforms = U;
  return m;
}

export function createTerrain(THREE, { SU, textures, getCfg }) {
  const group = new THREE.Group();
  group.name = "terrain";
  const chunks = new Map();
  const idxCache = [];
  let stage = null, grid = null, mat = null, viewDist = 1200, shadowRange = 60;
  let disc = null;
  const hint = { s: 0 };
  const proj = { s: 0, lat: 0, dist: 0 };

  const getIndex = (lod) => {
    if (!idxCache[lod]) idxCache[lod] = new THREE.BufferAttribute(gridIndices(LOD_QUADS[lod]), 1);
    return idxCache[lod];
  };

  function buildGeometry(cx, cz, lod) {
    const n = LOD_QUADS[lod], w = n + 3, h = CHUNK_SIZE / n, x0 = cx * CHUNK_SIZE, z0 = cz * CHUNK_SIZE;
    const H = new Float32Array(w * w);
    const hf = stage.heightAt;
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) H[j * w + i] = hf(x0 + (i - 1) * h, z0 + (j - 1) * h);
    const pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), road = new Float32Array(w * w);
    const skirt = skirtDepth(lod);
    let minY = 1e9, maxY = -1e9;
    const wid = stage.width, ds = stage.ds, N = stage.N;
    const canProject = typeof stage.project === "function";
    hint.s = -1;
    for (let j = 0; j < w; j++) {
      const sj = Math.min(Math.max(j - 1, 0), n), isSkirtJ = j === 0 || j === w - 1;
      for (let i = 0; i < w; i++) {
        const si = Math.min(Math.max(i - 1, 0), n), isSkirt = isSkirtJ || i === 0 || i === w - 1;
        const v = j * w + i;
        const y = H[(sj + 1) * w + (si + 1)];
        pos[v * 3] = x0 + si * h;
        pos[v * 3 + 1] = isSkirt ? y - skirt : y;
        pos[v * 3 + 2] = z0 + sj * h;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        // normal from the heightfield (sample si,sj has index (si+1,sj+1) in H)
        const hl = H[(sj + 1) * w + si], hr = H[(sj + 1) * w + si + 2], hd = H[sj * w + si + 1], hu = H[(sj + 2) * w + si + 1];
        let nx = hl - hr, nz = hd - hu, ny = 2 * h;
        const il = 1 / Math.hypot(nx, ny, nz);
        nor[v * 3] = nx * il; nor[v * 3 + 1] = ny * il; nor[v * 3 + 2] = nz * il;
        if (lod <= 2 && canProject && !isSkirt) {
          const r = stage.project(pos[v * 3], pos[v * 3 + 2], hint.s >= 0 ? hint.s : undefined, proj);
          hint.s = r.s;
          const wi = wid[Math.min(N - 1, Math.max(0, Math.round(r.s / ds)))] * 0.5;
          road[v] = Math.max(0, Math.min(40, r.dist - wi));
        } else road[v] = lod <= 2 && canProject ? 0 : 40;
      }
    }
    // skirt vertices inherit the road value of their border neighbour
    for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
      if (j === 0 || j === w - 1 || i === 0 || i === w - 1) {
        const ci = Math.min(Math.max(i, 1), w - 2), cj = Math.min(Math.max(j, 1), w - 2);
        road[j * w + i] = road[cj * w + ci];
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("aRoad", new THREE.BufferAttribute(road, 1));
    g.setIndex(getIndex(lod));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(x0 + CHUNK_SIZE / 2, (minY + maxY) / 2, z0 + CHUNK_SIZE / 2),
      Math.hypot(CHUNK_SIZE * 0.7072, (maxY - minY) / 2 + skirt) + 1);
    g.boundingBox = new THREE.Box3(new THREE.Vector3(x0, minY - skirt, z0), new THREE.Vector3(x0 + CHUNK_SIZE, maxY, z0 + CHUNK_SIZE));
    return g;
  }

  function ensureChunk(cx, cz, lod, dist) {
    const key = chunkKey(cx, cz);
    let c = chunks.get(key);
    if (!c) {
      c = { cx, cz, key, lod: -1, mesh: null };
      chunks.set(key, c);
    }
    if (c.lod !== lod) {
      const g = buildGeometry(cx, cz, lod);
      if (!c.mesh) {
        c.mesh = new THREE.Mesh(g, mat);
        c.mesh.receiveShadow = true;
        c.mesh.matrixAutoUpdate = false;
        c.mesh.frustumCulled = true;
        group.add(c.mesh);
      } else {
        c.mesh.geometry.dispose();
        c.mesh.geometry = g;
      }
      c.lod = lod;
    }
    c.mesh.castShadow = lod === 0 && dist < shadowRange + 90;
    return c;
  }

  const wantList = [];
  const api = {
    group, chunks,
    get viewDist() { return viewDist; },
    setStage(st) {
      api.disposeStage();
      stage = st;
      const cfg = getCfg();
      grid = chunkGrid(stage.bounds);
      viewDist = Math.min(cfg.viewDist, Math.max(700, (stage.def.environment?.fogFar ?? 900) * 1.35));
      shadowRange = cfg.shadowRange;
      mat = makeTerrainMaterial(THREE, SU, textures, stage, cfg);
      // far ground disc beyond the chunk field so the world never ends in a void
      const b = stage.bounds;
      const geo = new THREE.CircleGeometry(9000, 32);
      geo.rotateX(-Math.PI / 2);
      disc = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(stage.def.palette?.rock ?? 0x6a6a60).multiplyScalar(0.5), fog: true }));
      disc.position.set((b.minX + b.maxX) / 2, b.minY - 12, (b.minZ + b.maxZ) / 2);
      disc.renderOrder = -5;
      group.add(disc);
    },
    /** Reconfigure on quality change (rebuilds the material and chunks lazily). */
    refreshQuality() {
      if (!stage) return;
      const cfg = getCfg();
      viewDist = Math.min(cfg.viewDist, Math.max(700, (stage.def.environment?.fogFar ?? 900) * 1.35));
      shadowRange = cfg.shadowRange;
      const old = mat;
      mat = makeTerrainMaterial(THREE, SU, textures, stage, cfg);
      for (const c of chunks.values()) if (c.mesh) c.mesh.material = mat;
      old?.dispose();
    },
    /** Build the chunks around a point synchronously-in-slices; resolves when done. */
    async prebuild(px, pz, radius = 520, onProgress) {
      const cfg = getCfg();
      const list = api.wanted(px, pz, radius, cfg);
      for (let k = 0; k < list.length; k++) {
        const w = list[k];
        ensureChunk(w.cx, w.cz, w.lod, w.dist);
        if (k % 2 === 1) {
          onProgress?.(k / list.length);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    },
    /** Chunks within `radius` of (px,pz), nearest first, with their wanted LOD. */
    wanted(px, pz, radius, cfg = getCfg()) {
      wantList.length = 0;
      const r = Math.ceil(radius / CHUNK_SIZE) + 1;
      const ccx = Math.floor(px / CHUNK_SIZE), ccz = Math.floor(pz / CHUNK_SIZE);
      for (let dz = -r; dz <= r; dz++) {
        for (let dx = -r; dx <= r; dx++) {
          const cx = ccx + dx, cz = ccz + dz;
          if (cx < grid.x0 || cz < grid.z0 || cx >= grid.x0 + grid.nx || cz >= grid.z0 + grid.nz) continue;
          const d = chunkDistance(px, pz, cx, cz);
          if (d > radius) continue;
          const old = chunks.get(chunkKey(cx, cz));
          wantList.push({ cx, cz, dist: d, lod: selectLod(d, cfg.terrainLod, old ? old.lod : -1) });
        }
      }
      wantList.sort((a, b) => a.dist - b.dist);
      return wantList;
    },
    update(camPos, carPos) {
      if (!stage) return 0;
      const cfg = getCfg();
      const px = camPos.x, pz = camPos.z;
      const list = api.wanted(px, pz, viewDist, cfg);
      let built = 0;
      const t0 = performance.now();
      for (let k = 0; k < list.length; k++) {
        const w = list[k];
        const c = chunks.get(chunkKey(w.cx, w.cz));
        if (c && c.lod === w.lod) { c.mesh.castShadow = w.lod === 0 && w.dist < shadowRange + 90; continue; }
        const urgent = !c && w.dist < 450; // a hole near the camera: never wait
        if (!urgent && (built >= cfg.chunkBuildPerFrame || (built > 0 && performance.now() - t0 > 4))) continue;
        if (urgent && built >= 8) continue;
        ensureChunk(w.cx, w.cz, w.lod, w.dist);
        built++;
      }
      // drop chunks well beyond the view distance
      const drop = viewDist * 1.2 + CHUNK_SIZE;
      for (const [key, c] of chunks) {
        if (chunkDistance(px, pz, c.cx, c.cz) > drop) {
          group.remove(c.mesh);
          c.mesh.geometry.dispose();
          chunks.delete(key);
        }
      }
      if (disc) disc.position.x = camPos.x, disc.position.z = camPos.z;
      return built;
    },
    stats() { let tris = 0; for (const c of chunks.values()) tris += c.mesh ? c.mesh.geometry.index.count / 3 : 0; return { chunks: chunks.size, tris }; },
    disposeStage() {
      for (const c of chunks.values()) if (c.mesh) { group.remove(c.mesh); c.mesh.geometry.dispose(); }
      chunks.clear();
      if (disc) { group.remove(disc); disc.geometry.dispose(); disc.material.dispose(); disc = null; }
      mat?.dispose(); mat = null; stage = null;
    },
    dispose() { api.disposeStage(); },
  };
  return api;
}
