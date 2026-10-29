// Road ribbon (camber, per-station surface blend, ruts, markings, wet puddles), fords, skid marks.
import { patchCommon, createWaterMaterial, createSkidMaterial } from "./materials.mjs";
import { createSkidBuffer, skidStyle } from "./quality.mjs";

const SEG_STATIONS = 96; // stations per mesh segment (192 m)
const ROAD_TEX = ["road_gravel", "road_dirt", "road_tarmac", "road_mud", "road_snow", "road_pumice"];
const VERGE_W = 3.4;
const NV = 11; // vertices per cross-section

const ROAD_COMMON = /* glsl */ `
uniform sampler2D tR0, tR1, tR2, tR3, tR4, tR5;
uniform sampler2D nR0, nR1, nR2, nR3, nR4, nR5;
uniform float uHasN[6]; uniform float uInvM[6]; uniform vec3 uEdgeCol; uniform vec3 uTint[6]; uniform vec4 uCar;
varying vec2 vRUv; varying vec3 vW0; varying vec3 vW1; varying float vVerge; varying float vLat; varying float vHalfW;
vec3 arRoadTex(int k, vec2 uv, vec2 gx, vec2 gy){
  vec2 q = uv * uInvM[k]; vec2 qx = gx * uInvM[k], qy = gy * uInvM[k];
  if (k == 0) return textureGrad(tR0, q, qx, qy).rgb;
  if (k == 1) return textureGrad(tR1, q, qx, qy).rgb;
  if (k == 2) return textureGrad(tR2, q, qx, qy).rgb;
  if (k == 3) return textureGrad(tR3, q, qx, qy).rgb;
  if (k == 4) return textureGrad(tR4, q, qx, qy).rgb;
  return textureGrad(tR5, q, qx, qy).rgb;
}
vec3 arRoadNrm(int k, vec2 uv, vec2 gx, vec2 gy){
  vec2 q = uv * uInvM[k]; vec2 qx = gx * uInvM[k], qy = gy * uInvM[k];
  vec3 n;
  if (k == 0) n = textureGrad(nR0, q, qx, qy).xyz;
  else if (k == 1) n = textureGrad(nR1, q, qx, qy).xyz;
  else if (k == 2) n = textureGrad(nR2, q, qx, qy).xyz;
  else if (k == 3) n = textureGrad(nR3, q, qx, qy).xyz;
  else if (k == 4) n = textureGrad(nR4, q, qx, qy).xyz;
  else n = textureGrad(nR5, q, qx, qy).xyz;
  return n * 2.0 - 1.0;
}
mat3 arTBN(vec3 N, vec3 p, vec2 uv){
  vec3 dp1 = dFdx(p), dp2 = dFdy(p); vec2 duv1 = dFdx(uv), duv2 = dFdy(uv);
  vec3 dp2perp = cross(dp2, N), dp1perp = cross(N, dp1);
  vec3 T = dp2perp * duv1.x + dp1perp * duv2.x; vec3 B = dp2perp * duv1.y + dp1perp * duv2.y;
  float inv = inversesqrt(max(max(dot(T, T), dot(B, B)), 1e-12));
  return mat3(T * inv, B * inv, N);
}
`;

function makeRoadMaterial(THREE, SU, textures, stage, cfg) {
  const U = { uHasN: { value: [] }, uInvM: { value: [] }, uEdgeCol: { value: new THREE.Color(stage.def.palette?.dirtEdge ?? 0x8b7455) }, uTint: { value: [] }, uCar: { value: new THREE.Vector4(0, 0, 0, -1) } };
  ROAD_TEX.forEach((n, k) => {
    U["tR" + k] = { value: textures.get(n) };
    const nt = textures.getNormal(n);
    U["nR" + k] = { value: nt ?? textures.get(n) };
    U.uHasN.value.push(nt ? 1 : 0);
    U.uInvM.value.push(1 / Math.max(0.5, textures.meters(n)));
    U.uTint.value.push(new THREE.Color(1, 1, 1));
  });
  // light recolour only for procedural fallbacks (real photos keep their own colour)
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.93, metalness: 0, transparent: true, envMapIntensity: 0.8,
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  m.onBeforeCompile = (shader) => {
    patchCommon(shader, SU);
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", /* glsl */ `#include <common>
        attribute vec3 aW0; attribute vec3 aW1; attribute float aVerge; attribute float aLat; attribute float aHalfW;
        varying vec2 vRUv; varying vec3 vW0; varying vec3 vW1; varying float vVerge; varying float vLat; varying float vHalfW;`)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRUv = uv; vW0 = aW0; vW1 = aW1; vVerge = aVerge; vLat = aLat; vHalfW = aHalfW;");
    shader.fragmentShader = shader.fragmentShader
      .replace("//AR_END", ROAD_COMMON)
      .replace("#include <map_fragment>", /* glsl */ `
        vec2 gx = dFdx(vRUv), gy = dFdy(vRUv);
        float wts[6]; wts[0] = vW0.x; wts[1] = vW0.y; wts[2] = vW0.z; wts[3] = vW1.x; wts[4] = vW1.y; wts[5] = vW1.z;
        float tot = 0.0; for (int k = 0; k < 6; k++) tot += wts[k];
        vec3 rc = vec3(0.0); float rrough = 0.0; vec3 nTS = vec3(0.0, 0.0, 1.0);
        float aLatM = abs(vLat);
        float nz = fbm3(vWPos.xz * 0.5);
        // antitiling: second sample at a rotated, rescaled uv
        vec2 uv2 = vec2(vRUv.y * 0.71 + vRUv.x * 0.27 + 3.7, vRUv.x * 0.71 - vRUv.y * 0.27 + 1.3);
        for (int k = 0; k < 6; k++) {
          float w = wts[k] / max(tot, 1e-4);
          if (w > 0.02) {
            vec3 c = arRoadTex(k, vRUv, gx, gy);
            #ifdef AR_DETAIL
              vec3 c2 = arRoadTex(k, uv2, gx * 0.9, gy * 0.9);
              c = mix(c, c2, 0.35);
            #endif
            rc += c * w;
            rrough += w * (k == 2 ? 0.88 : k == 4 ? 0.55 : k == 3 ? 0.78 : 0.95);
            if (uHasN[k] > 0.5) nTS += (arRoadNrm(k, vRUv, gx, gy) - vec3(0.0, 0.0, 1.0)) * w;
          }
        }
        float wGravel = (wts[0] + wts[1] + wts[3] + wts[5]) / max(tot, 1e-4);
        float wTar = wts[2] / max(tot, 1e-4);
        // wheel ruts (polished bands) and the loose berm between them / at the edges
        float rut = exp(-pow((aLatM * vHalfW - 0.85) / 0.38, 2.0));
        float berm = exp(-pow(aLatM * vHalfW / 0.45, 2.0));
        float edgeLoose = smoothstep(0.78, 1.0, aLatM);
        rc *= 1.0 - 0.16 * rut * (1.0 - wTar * 0.6) + 0.05 * berm * wGravel + 0.07 * edgeLoose * wGravel;
        nTS.xy *= 1.0 - 0.6 * rut * wGravel;
        rc *= (0.94 + 0.12 * nz) * 1.12;
        // tarmac markings: dashed centre line, solid edge lines
        if (wTar > 0.3) {
          float wear = smoothstep(0.25, 0.7, vnoise(vRUv * vec2(1.7, 0.6) + 5.0));
          float cl = (1.0 - smoothstep(0.06, 0.09, abs(vRUv.x))) * step(0.5, fract(vRUv.y / 9.0 + 0.1));
          float el = smoothstep(0.0, 0.05, aLatM * vHalfW - (vHalfW - 0.42)) * (1.0 - smoothstep(0.1, 0.16, aLatM * vHalfW - (vHalfW - 0.42))) * 1.0;
          float mk = clamp(cl + el, 0.0, 1.0) * wTar * (0.55 + 0.45 * wear) * (1.0 - smoothstep(0.98, 1.0, aLatM));
          rc = mix(rc, vec3(0.62, 0.62, 0.6), mk * 0.85);
          rrough = mix(rrough, 0.6, mk * 0.4);
        }
        // surface character: tonal patches that hide tiling, oil drip strip down the middle, scattered loose stones near the edges
        float patchN = smoothstep(0.52, 0.64, vnoise(vWPos.xz * 0.11 + 11.0));
        rc *= 1.0 - 0.1 * patchN + 0.04 * (vnoise(vWPos.xz * 0.9) - 0.5);
        float lat0 = abs(aLatM * vHalfW);
        float oil = (1.0 - smoothstep(0.08, 0.4, lat0)) * smoothstep(0.5, 0.75, vnoise(vec2(vRUv.y * 0.22, 3.1 + floor(vRUv.y / 40.0))));
        rc *= 1.0 - 0.22 * oil; rrough = mix(rrough, 0.45, oil * 0.5);
        float stones = step(0.93, h21(floor(vWPos.xz * 38.0))) * (0.3 + 0.7 * edgeLoose);
        rc *= 1.0 + 0.28 * stones * wGravel;
        // verge: blend toward the roadside earth colour and dither the outer edge into the terrain
        float vg = vVerge;
        float brk = fbm3(vWPos.xz * 1.7) * 0.5 + vnoise(vWPos.xz * 6.0) * 0.18;
        diffuseColor.a *= 1.0 - smoothstep(0.30, 0.95, vg + (brk - 0.35) * 0.55);
        rc = mix(rc, uEdgeCol * (0.8 + 0.4 * nz), clamp(vg * 1.6, 0.0, 0.9));
        // wet look: darker, puddles in low spots, glossy
        float pud = smoothstep(0.52, 0.66, fbm3(vWPos.xz * 0.28) + 0.18 * rut) * smoothstep(0.35, 0.9, uWet);
        float wetAmt = uWet * (0.6 + 0.4 * (1.0 - wTar * 0.3));
        rc *= 1.0 - 0.34 * wetAmt - 0.25 * pud;
        rrough = mix(rrough, 0.3, wetAmt * 0.7);
        rrough = mix(rrough, 0.035, pud);
        nTS.xy *= 1.0 - pud * 0.9;
        // snow dust on the verge shoulder
        rc = mix(rc, vec3(0.88, 0.92, 0.98), uSnow * 0.35 * smoothstep(0.4, 1.0, aLatM) * (1.0 - wts[4] / max(tot, 1e-4)));
        { vec3 vdW = normalize(cameraPosition - vWPos); float frn = pow(1.0 - clamp(vdW.y, 0.0, 1.0), 3.0); float wr = uWet * (0.55 + 0.45 * pud); diffuseColor.rgb = diffuseColor.rgb * rc + fogColor * frn * wr * 0.5; }
        float arRough = rrough;`)
      .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
        {
          vec2 rel = vWPos.xz - uCar.xy; vec2 fw = uCar.zw; vec2 rt = vec2(-fw.y, fw.x);
          float along = -dot(rel, fw), lat = dot(rel, rt);
          // along is clamped: ahead of the car it is large and negative, and exp(-along * 0.3) overflowed to +Inf there,
          // so Inf * smoothstep(..)=0 gave NaN that bloom then spread over the whole frame once the car had a heading.
          float alongP = clamp(along, 0.0, 60.0);
          float tlw = (abs(lat) - 0.7) / (0.1 + 0.03 * alongP);
          float tl = exp(-tlw * tlw) * smoothstep(1.0, 2.6, along) * exp(-alongP * 0.3) * (0.55 + 0.45 * sin(alongP * 7.0 + lat * 3.0));
          float wetR = smoothstep(0.35, 0.9, uWet);
          totalEmissiveRadiance += vec3(0.75, 0.07, 0.04) * tl * wetR * (0.35 + 0.5 * uNight) * step(0.5, length(fw));
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = arRough;")
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
        {
          mat3 tbn = arTBN(normal, -vViewPosition, vRUv);
          vec3 nt = normalize(vec3(nTS.xy * 1.0, max(nTS.z, 0.2)));
          normal = normalize(tbn * nt);
        }`);
  };
  m.defines = cfg.detailTex ? { AR_DETAIL: 1 } : {};
  m.customProgramCacheKey = () => "ar-road-" + (cfg.detailTex ? 1 : 0);
  m.userData.uniforms = U;
  return m;
}

export function createRoad(THREE, { SU, textures, getCfg }) {
  const group = new THREE.Group();
  group.name = "road";
  let stage = null, mat = null, waterMat = null;
  const meshes = [];
  const waters = [];
  const skid = createSkidBuffer(3072, 4);
  let skidMesh = null, skidGeo = null, skidMat = null, skidVersion = -1;

  function buildSegments() {
    const st = stage, N = st.N, ds = st.ds;
    // per-station surface weights (smoothed over +-3 stations)
    const w = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) {
      let id = st.surf[i];
      if (id === 12 || id > 5) id = id === 12 ? 3 : 0;
      for (let d = -3; d <= 3; d++) {
        const j = Math.min(N - 1, Math.max(0, i + d));
        let sj = st.surf[j];
        if (sj > 5) sj = sj === 12 ? 3 : 0;
        const wt = 1 - Math.abs(d) / 4.5;
        w[i * 6 + sj] += wt;
      }
    }
    for (let i = 0; i < N; i++) {
      let sum = 0;
      for (let k = 0; k < 6; k++) sum += w[i * 6 + k];
      for (let k = 0; k < 6; k++) w[i * 6 + k] /= sum || 1;
    }
    const cfg = getCfg();
    for (let a = 0; a < N - 1; a += SEG_STATIONS) {
      const b = Math.min(N - 1, a + SEG_STATIONS);
      const rows = b - a + 1;
      const nv = rows * NV;
      const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      const aW0 = new Float32Array(nv * 3), aW1 = new Float32Array(nv * 3), aV = new Float32Array(nv), aL = new Float32Array(nv), aH = new Float32Array(nv);
      for (let r = 0; r < rows; r++) {
        const i = a + r;
        const hw = Math.max(1.5, st.width[i] * 0.5);
        const nx = -st.tz[i], nzv = st.tx[i]; // right normal
        const tanB = Math.tan(st.bank[i]);
        const lats = [-hw - VERGE_W, -hw - VERGE_W * 0.45, -hw, -hw * 0.62, -hw * 0.3, 0, hw * 0.3, hw * 0.62, hw, hw + VERGE_W * 0.45, hw + VERGE_W];
        for (let c = 0; c < NV; c++) {
          const lat = lats[c];
          const x = st.px[i] + nx * lat, z = st.pz[i] + nzv * lat;
          const crown = -0.02 * Math.min(1, (lat / hw) * (lat / hw));
          let y = st.py[i] - tanB * lat + crown + 0.012;
          const out = Math.max(0, Math.abs(lat) - hw);
          let vg = 0;
          if (out > 0) {
            const t = out / VERGE_W;
            vg = t;
            const ty = st.heightAt(x, z);
            const k = t < 0.5 ? t * 0.8 : 0.4 + (t - 0.5) * 1.2; // 0..1 toward terrain
            y = y + (ty - y) * Math.min(1, k) - (t > 0.9 ? 0.04 : 0);
          }
          const v = r * NV + c;
          pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
          uv[v * 2] = lat; uv[v * 2 + 1] = i * ds;
          for (let k = 0; k < 3; k++) { aW0[v * 3 + k] = w[i * 6 + k]; aW1[v * 3 + k] = w[i * 6 + 3 + k]; }
          aV[v] = vg; aL[v] = Math.max(-1.6, Math.min(1.6, lat / hw)); aH[v] = hw;
        }
      }
      // indices + normals
      const idx = new Uint32Array((rows - 1) * (NV - 1) * 6);
      let k = 0;
      for (let r = 0; r < rows - 1; r++) {
        for (let c = 0; c < NV - 1; c++) {
          const p0 = r * NV + c, p1 = p0 + 1, p2 = p0 + NV, p3 = p2 + 1;
          idx[k++] = p0; idx[k++] = p1; idx[k++] = p2; idx[k++] = p1; idx[k++] = p3; idx[k++] = p2;
        }
      }
      for (let r = 0; r < rows; r++) {
        const r0 = Math.max(0, r - 1), r1 = Math.min(rows - 1, r + 1);
        for (let c = 0; c < NV; c++) {
          const c0 = Math.max(0, c - 1), c1 = Math.min(NV - 1, c + 1);
          const A = (r1 * NV + c) * 3, B = (r0 * NV + c) * 3, C = (r * NV + c1) * 3, D = (r * NV + c0) * 3;
          const ax = pos[A] - pos[B], ay = pos[A + 1] - pos[B + 1], az = pos[A + 2] - pos[B + 2];
          const bx = pos[C] - pos[D], by = pos[C + 1] - pos[D + 1], bz = pos[C + 2] - pos[D + 2];
          // along x across -> up (stations advance toward +s)
          let ux = by * az - bz * ay, uy = bz * ax - bx * az, uz = bx * ay - by * ax;
          if (uy < 0) { ux = -ux; uy = -uy; uz = -uz; }
          const il = 1 / Math.hypot(ux, uy, uz);
          const v = (r * NV + c) * 3;
          nor[v] = ux * il; nor[v + 1] = uy * il; nor[v + 2] = uz * il;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setAttribute("aW0", new THREE.BufferAttribute(aW0, 3));
      g.setAttribute("aW1", new THREE.BufferAttribute(aW1, 3));
      g.setAttribute("aVerge", new THREE.BufferAttribute(aV, 1));
      g.setAttribute("aLat", new THREE.BufferAttribute(aL, 1));
      g.setAttribute("aHalfW", new THREE.BufferAttribute(aH, 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mesh = new THREE.Mesh(g, mat);
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      mesh.renderOrder = 1;
      group.add(mesh);
      meshes.push(mesh);
    }
  }

  function buildFords() {
    const st = stage, ds = st.ds, N = st.N;
    // contiguous runs of water stations, plus declared ford hazards
    const runs = [];
    let a = -1;
    for (let i = 0; i < N; i++) {
      if (st.surf[i] === 12) { if (a < 0) a = i; } else if (a >= 0) { runs.push([a, i - 1]); a = -1; }
    }
    if (a >= 0) runs.push([a, N - 1]);
    for (const h of st.hazards ?? []) {
      if (h.kind !== "ford") continue;
      const i = Math.round(h.s / ds);
      if (!runs.some(([x, y]) => i >= x - 3 && i <= y + 3)) runs.push([Math.max(0, i - 4), Math.min(N - 1, i + 4)]);
    }
    const waterY = new Map();
    if (st.water?.length) { // the stage declares its water surfaces: use them (y = surface height)
      runs.length = 0;
      for (const w of st.water) {
        const r = [Math.max(0, Math.round((w.s - w.halfLen) / ds)), Math.min(N - 1, Math.round((w.s + w.halfLen) / ds)), Math.max(8, w.reach)];
        waterY.set(r, w.kind === "ford" ? null : w.y + 0.03);
        runs.push(r);
      }
    }
    for (const run of runs) {
      const [r0, r1, reach] = run;
      const fixedY = waterY.get(run), declared = waterY.has(run);
      const i0 = !declared ? Math.max(0, r0 - 4) : r0, i1 = !declared ? Math.min(N - 1, r1 + 4) : r1;
      const rows = i1 - i0 + 1, cols = 9;
      const pos = new Float32Array(rows * cols * 3), edge = new Float32Array(rows * cols);
      const idx = new Uint32Array((rows - 1) * (cols - 1) * 6);
      for (let r = 0; r < rows; r++) {
        const i = i0 + r;
        const hw = !declared ? Math.max(5.5, st.width[i] * 0.5 + 6) : Math.max(8, reach);
        const nx = -st.tz[i], nzv = st.tx[i];
        const endFade = Math.min(1, Math.min(r, rows - 1 - r) / 3);
        for (let c = 0; c < cols; c++) {
          const t = c / (cols - 1) * 2 - 1;
          const lat = t * hw;
          const v = r * cols + c;
          pos[v * 3] = st.px[i] + nx * lat; pos[v * 3 + 1] = fixedY ?? (st.py[i] + 0.075); pos[v * 3 + 2] = st.pz[i] + nzv * lat;
          edge[v] = Math.min(endFade, (1 - Math.abs(t)) * 3.2);
        }
      }
      let k = 0;
      for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
        const p0 = r * cols + c, p1 = p0 + 1, p2 = p0 + cols, p3 = p2 + 1;
        idx[k++] = p0; idx[k++] = p1; idx[k++] = p2; idx[k++] = p1; idx[k++] = p3; idx[k++] = p2;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      const nor = new Float32Array(rows * cols * 3); for (let v = 0; v < rows * cols; v++) nor[v * 3 + 1] = 1;
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, waterMat);
      m.renderOrder = 3;
      m.receiveShadow = true;
      group.add(m);
      waters.push(m);
    }
  }

  function buildSkid() {
    const cap = skid.capacity;
    skidGeo = new THREE.BufferGeometry();
    const pa = new THREE.BufferAttribute(skid.pos, 3); pa.setUsage(THREE.DynamicDrawUsage);
    const aa = new THREE.BufferAttribute(skid.alpha, 1); aa.setUsage(THREE.DynamicDrawUsage);
    const ta = new THREE.BufferAttribute(skid.tint, 3); ta.setUsage(THREE.DynamicDrawUsage);
    skidGeo.setAttribute("position", pa);
    skidGeo.setAttribute("aA", aa);
    skidGeo.setAttribute("aTint", ta);
    const idx = new Uint32Array(cap * 6);
    for (let s = 0; s < cap; s++) {
      const v = s * 4, i = s * 6;
      idx[i] = v; idx[i + 1] = v + 2; idx[i + 2] = v + 1; idx[i + 3] = v + 1; idx[i + 4] = v + 2; idx[i + 5] = v + 3;
    }
    skidGeo.setIndex(new THREE.BufferAttribute(idx, 1));
    skidGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    skidMat = createSkidMaterial(THREE);
    skidMesh = new THREE.Mesh(skidGeo, skidMat);
    skidMesh.frustumCulled = false;
    skidMesh.renderOrder = 2;
    group.add(skidMesh);
  }

  const api = {
    group, skid,
    setStage(st) {
      api.disposeStage();
      stage = st;
      const cfg = getCfg();
      mat = makeRoadMaterial(THREE, SU, textures, stage, cfg);
      waterMat = createWaterMaterial(THREE, SU, { detail: cfg.waterDetail, color: stage.def.biome === "rainforest" ? 0x3a4f48 : 0x4d6a68 });
      buildSegments();
      buildFords();
      buildSkid();
    },
    refreshQuality() {
      if (!stage) return;
      const old = mat;
      mat = makeRoadMaterial(THREE, SU, textures, stage, getCfg());
      for (const m of meshes) m.material = mat;
      old?.dispose();
    },
    markSkid(wheel, contact, yaw, intensity, surfaceId) {
      const sty = skidStyle(surfaceId);
      if (sty.width <= 0) { skid.lift(wheel & 3); return; }
      skid.mark(wheel & 3, contact.x, contact.y, contact.z, yaw, intensity, sty.r, sty.g, sty.b, sty.width);
    },
    setCar(x, z, fx, fz) { mat?.userData.uniforms.uCar.value.set(x, z, fx, fz); },
    update(wet) {
      if (skidMesh && skid.version !== skidVersion) {
        skidVersion = skid.version;
        skidGeo.attributes.position.needsUpdate = true;
        skidGeo.attributes.aA.needsUpdate = true;
        skidGeo.attributes.aTint.needsUpdate = true;
      }
      if (skidMat) skidMat.uniforms.uWet.value = wet ?? 0;
    },
    clearSkids() { skid.clear(); skidVersion = -1; },
    disposeStage() {
      for (const m of [...meshes, ...waters]) { group.remove(m); m.geometry.dispose(); }
      meshes.length = 0; waters.length = 0;
      if (skidMesh) { group.remove(skidMesh); skidGeo.dispose(); skidMat.dispose(); skidMesh = null; }
      mat?.dispose(); waterMat?.dispose(); mat = null; waterMat = null; stage = null;
      skid.clear();
    },
    dispose() { api.disposeStage(); },
    stats() { return { segments: meshes.length, fords: waters.length }; },
  };
  return api;
}
