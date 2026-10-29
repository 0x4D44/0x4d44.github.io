// Terrain extras for the valley courses (frost, redrock), kept out of terrain.js so the island courses are untouched. Owner: world agent.
//   patchTerrain(mat, cfg)   extends a createTerrainMaterial() material with large-scale tone variation, strata colour banding on the steep
//                            faces, a sun-side rim glow and an alpenglow on high ground (GLSL only for the features that are enabled)
//   buildTerrainTiles(opts)  the LOD tile grid + far backdrop, with the distant tiles merged into a few big meshes to save draw calls
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPatch } from './terrain.js';

export const NOISE_GLSL = `
float tfHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float tfNoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(tfHash(i), tfHash(i + vec2(1.0, 0.0)), f.x), mix(tfHash(i + vec2(0.0, 1.0)), tfHash(i + vec2(1.0, 1.0)), f.x), f.y); }
`;
/**
 * Sandstone strata: horizontal bands that wander with the rock. prm = (bands per metre, warp, strength); A..D are albedo colours (A/B blended, C cream
 * 32%, D maroon 10%). Also returns the relief slope rs (d offset / d y for a one metre step): hard bands (cream, ochre) stand proud of the soft ones, and
 * the face is steep in a thin zone at the foot of each band. The caller scales it by the ledge height and tilts the shading normal with it (gRS).
 */
export const STRATA_GLSL = `
float gRS = 0.0;
vec3 tfStrata(vec3 wp, vec3 prm, vec3 A, vec3 B, vec3 C, vec3 D, out float k){
  float w = tfNoise(wp.xz / 170.0) * prm.y + tfNoise(wp.xz / 37.0) * prm.y * 0.3;
  float by = wp.y * prm.x + w, bi = floor(by), bf = fract(by);
  float h1 = tfHash(vec2(bi, 3.0)), h2 = tfHash(vec2(bi, 11.0)), h3 = tfHash(vec2(bi, 23.0));
  vec3 bc = mix(mix(A, B, h1), C, step(0.68, h2));
  bc = mix(bc, D, step(0.9, h3));
  float edge = smoothstep(0.0, 0.14, bf) * (1.0 - smoothstep(0.86, 1.0, bf));
  k = prm.z * (0.55 + 0.45 * edge);
  float hd = 0.35 * h1 + 0.65 * step(0.68, h2), hp = 0.35 * tfHash(vec2(bi - 1.0, 3.0)) + 0.65 * step(0.68, tfHash(vec2(bi - 1.0, 11.0)));
  float x = clamp(bf / 0.14, 0.0, 1.0);
  gRS = (hd - hp) * 6.0 * x * (1.0 - x) / 0.14 * prm.x;
  return bc;
}
`;
/** Fragment snippet (after normal_fragment_maps): tilts the view-space `normal` by the strata relief; `amp` is the ledge height in metres, `w` the weight. */
export const STRATA_NORMAL_GLSL = (amp, w) => `
  normal = normalize(normal + (viewMatrix * vec4(0.0, -gRS * ${amp.toFixed(2)} * (${w}), 0.0, 0.0)).xyz);`;
const col = (c) => new THREE.Color(c);

/**
 * cfg: sun (Vector3, to the sun)
 *   tone   { a, b, scaleA?, scaleB? }                     multiplicative colour blotches (about 1.0) at ~900 m / ~260 m
 *   bands  { scale, warp, strength, colors: [c0, c1, c2] } strata: horizontal bands of tinted albedo, strongest on cliffs. The colours multiply the
 *          albedo (a tint of about 1.0); with `abs: true` and colors [rust, ochre, cream, maroon] they are absolute albedo colours blended in
 *          (keeping the texture's own light and dark), so a red rock texture can still show cream and tan layers
 *   rim    { color, power }                                emissive fresnel rim on the sun-facing side
 *   twilight { color, y0, y1 }                             emissive alpenglow on sun-facing ground above y0 (full at y1)
 *   floor  { color, scale?, cover?, strength? }            tints the low (valley floor) layer in blotches: `color` multiplies the albedo where
 *                                                          the noise (feature size `scale` m) passes `cover` (0..1; higher = fewer blotches)
 *   shore  { color, y0, y1 }                               tints the ground between heights y0 (full) and y1 (none): wet banks
 *   fill   { color, dir }                                  a second, albedo-tinted light from direction `dir` (to the light), power 2 across the faces:
 *                                                          lifts the faces turned away from the sun so a night wall keeps its relief and its texture
 *   veins  { color, scale?, cover?, y0?, y1? }             thin luminous seams that wander over the cliff faces (cracks of glowing ice); `scale` multiplies the
 *                                                          frequency, `cover` (0..1; higher = fewer seams) thins them out, they fade out between y0 and y1
 */
export function patchTerrain(mat, cfg) {
  const base = mat.onBeforeCompile;
  const on = { tone: !!cfg.tone, bands: !!cfg.bands && !cfg.bands.abs, abs: !!cfg.bands?.abs, rim: !!cfg.rim, twi: !!cfg.twilight, floor: !!cfg.floor, shore: !!cfg.shore, fill: !!cfg.fill, veins: !!cfg.veins };
  const vs = (cfg.veins?.scale ?? 1).toFixed(3), vc = (cfg.veins?.cover ?? 0.93).toFixed(3);
  const u = {
    uFillC: { value: col(cfg.fill?.color ?? 0x000000) }, uFillD: { value: (cfg.fill?.dir || new THREE.Vector3(0, 1, 0)).clone().normalize() },
    uVeinC: { value: col(cfg.veins?.color ?? 0x000000) }, uVeinY: { value: new THREE.Vector2(cfg.veins?.y0 ?? 1e5, cfg.veins?.y1 ?? 2e5) },
    uFloorC: { value: col(cfg.floor?.color ?? 0xffffff) }, uFloorP: { value: new THREE.Vector2(cfg.floor?.cover ?? 0.5, cfg.floor?.strength ?? 1) },
    uShoreC: { value: col(cfg.shore?.color ?? 0xffffff) }, uShoreY: { value: new THREE.Vector2(cfg.shore?.y0 ?? 0, cfg.shore?.y1 ?? 1) },
    uSun: { value: (cfg.sun || new THREE.Vector3(0, 1, 0)).clone().normalize() },
    uToneA: { value: col(cfg.tone?.a ?? 0xffffff) }, uToneB: { value: col(cfg.tone?.b ?? 0xffffff) },
    uBand: { value: new THREE.Vector3(cfg.bands?.scale ?? 0.16, cfg.bands?.warp ?? 3, cfg.bands?.strength ?? 0.6) },
    uBandA: { value: col(cfg.bands?.colors?.[0] ?? 0xffffff) }, uBandB: { value: col(cfg.bands?.colors?.[1] ?? 0xffffff) }, uBandC: { value: col(cfg.bands?.colors?.[2] ?? 0xffffff) }, uBandD: { value: col(cfg.bands?.colors?.[3] ?? 0xffffff) },
    uRimC: { value: col(cfg.rim?.color ?? 0x000000) }, uRimP: { value: cfg.rim?.power ?? 3 },
    uTwiC: { value: col(cfg.twilight?.color ?? 0x000000) }, uTwiY: { value: new THREE.Vector2(cfg.twilight?.y0 ?? 0, cfg.twilight?.y1 ?? 1) },
  };
  mat.onBeforeCompile = (sh, renderer) => {
    base.call(mat, sh, renderer);
    Object.assign(sh.uniforms, u);
    let fs = sh.fragmentShader;
    fs = fs.replace('varying vec3 vWPos; varying vec3 vWNrm;', `varying vec3 vWPos; varying vec3 vWNrm;
uniform vec3 uSun, uToneA, uToneB, uBand, uBandA, uBandB, uBandC, uBandD, uRimC, uTwiC, uFloorC, uShoreC, uFillC, uFillD, uVeinC; uniform vec2 uTwiY, uFloorP, uShoreY, uVeinY; uniform float uRimP;
${NOISE_GLSL}${on.abs ? STRATA_GLSL : ''}`);
    let inject = '';
    if (on.floor) inject += `
  {
    float fv = tfNoise(vWPos.xz / ${(cfg.floor.scale ?? 60).toFixed(1)}) * 0.65 + tfNoise(vWPos.xz / ${((cfg.floor.scale ?? 60) * 0.27).toFixed(1)} + 4.0) * 0.35;
    c = mix(c, c * uFloorC, smoothstep(uFloorP.x, uFloorP.x + 0.18, fv) * wLow * (1.0 - wCliff) * uFloorP.y);
  }`;
    if (on.shore) inject += `
  c = mix(c, c * uShoreC, (1.0 - smoothstep(uShoreY.x, uShoreY.y, vWPos.y)) * (1.0 - wCliff * 0.6));`;
    if (on.tone) inject += `
  {
    float n1 = tfNoise(vWPos.xz / ${(cfg.tone.scaleA ?? 900).toFixed(1)}), n2 = tfNoise(vWPos.xz / ${(cfg.tone.scaleB ?? 260).toFixed(1)} + 9.1), n3 = tfNoise(vWPos.xz / 70.0 + 3.7);
    c *= mix(vec3(1.0), uToneA, smoothstep(0.35, 0.7, n1)) * mix(vec3(1.0), uToneB, smoothstep(0.4, 0.75, n2));
    c *= 0.9 + 0.2 * n3;
  }`;
    if (on.abs) inject += `
  {
    float bk; vec3 bc = tfStrata(vWPos, uBand, uBandA, uBandB, uBandC, uBandD, bk);
    float lum = dot(c, vec3(0.3, 0.59, 0.11));
    c = mix(c, bc * (${(cfg.bands.lumBase ?? 0.45).toFixed(2)} + ${(cfg.bands.lumGain ?? 1.5).toFixed(2)} * lum), bk * (wCliff * 0.85 + 0.15));
  }`;
    else if (on.bands) inject += `
  {
    float wp = tfNoise(vWPos.xz / 170.0) * uBand.y + tfNoise(vWPos.xz / 37.0) * uBand.y * 0.3;
    float by = vWPos.y * uBand.x + wp, bi = floor(by), bf = fract(by);
    float h1 = tfHash(vec2(bi, 3.0)), h2 = tfHash(vec2(bi, 11.0));
    vec3 bc = mix(mix(uBandA, uBandB, h1), uBandC, step(0.7, h2));
    float edge = smoothstep(0.0, 0.14, bf) * (1.0 - smoothstep(0.86, 1.0, bf));
    c = mix(c, c * bc, uBand.z * (wCliff * 0.85 + 0.15) * (0.55 + 0.45 * edge));
  }`;
    if (inject) fs = fs.replace('diffuseColor.rgb *= c;', inject + '\n  diffuseColor.rgb *= c;');
    if (on.rim || on.twi || on.fill || on.veins) fs = fs.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  vec3 wn2 = normalize(vWNrm), V2 = normalize(cameraPosition - vWPos);
  float sunF = clamp(dot(wn2, uSun) * 0.5 + 0.5, 0.0, 1.0);
  ${on.rim ? 'totalEmissiveRadiance += uRimC * pow(1.0 - clamp(dot(wn2, V2), 0.0, 1.0), uRimP) * sunF;' : ''}
  ${on.twi ? 'totalEmissiveRadiance += uTwiC * smoothstep(uTwiY.x, uTwiY.y, vWPos.y) * sunF * sunF;' : ''}
  ${on.fill ? 'float fillF = clamp(dot(wn2, uFillD) * 0.5 + 0.5, 0.0, 1.0); totalEmissiveRadiance += uFillC * fillF * fillF * diffuseColor.rgb;' : ''}
  ${on.veins ? `float vCl = smoothstep(uSlope.x, uSlope.y, 1.0 - clamp(wn2.y, 0.0, 1.0));
  if (vCl > 0.02) {                                          // contour lines of two noise fields, one per face direction: the seam follows whichever way the wall runs
    float wx = abs(wn2.x) / (abs(wn2.x) + abs(wn2.z) + 0.001);
    vec2 vq = vec2(mix(vWPos.x, vWPos.z, wx), vWPos.y) * ${vs};
    float vn = tfNoise(vq * vec2(0.03, 0.052) + 7.0) * 0.88 + tfNoise(vq * vec2(0.09, 0.14) + 19.0) * 0.12;
    float vr = 1.0 - abs(vn * 2.0 - 1.0);
    float vseam = smoothstep(${vc} - 0.05, ${vc} + 0.05, vr) * smoothstep(0.5, 0.7, tfNoise(vq * vec2(0.02, 0.03) + 3.3));
    totalEmissiveRadiance += uVeinC * (vseam + 0.10 * smoothstep(${vc} - 0.12, ${vc}, vr)) * vCl * (1.0 - smoothstep(uVeinY.x, uVeinY.y, vWPos.y));
  }` : ''}
}`);
    if (on.abs && (cfg.bands.relief ?? 0) > 0) fs = fs.replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>' + STRATA_NORMAL_GLSL(cfg.bands.relief, 'smoothstep(uSlope.x, uSlope.y, 1.0 - clamp(normalize(vWNrm).y, 0.0, 1.0))'));
    sh.fragmentShader = fs;
  };
  const key = 'sbterrain-fx-' + Object.entries(on).filter(([, v]) => v).map(([k]) => k).join('') + (cfg.tone ? (cfg.tone.scaleA ?? 900) + '/' + (cfg.tone.scaleB ?? 260) : '') + (cfg.floor ? 'f' + (cfg.floor.scale ?? 60) : '') + (cfg.veins ? 'v' + vs + '/' + vc : '') + (cfg.bands?.abs ? 'b' + (cfg.bands.lumBase ?? 0.45) + '/' + (cfg.bands.lumGain ?? 1.5) + '/' + (cfg.bands.relief ?? 0) : '');
  mat.customProgramCacheKey = () => key;
  mat.userData.fx = u;
  return mat;
}

/** Terrain mesh cell size multiplier for a quality preset (V-23): triangles go with 1 / cell^2, so cell x scenery^-0.5 makes the terrain cost follow `scenery`
 *  (Low 0.45 -> cells x1.49, 0.45x the triangles; Med x1.20, 0.7x; High x1; Ultra x0.88, 1.3x). Collision reads the height function, never the mesh. */
export const terrainCellScale = (q) => Math.pow(Math.max(0.3, q?.scenery ?? 1), -0.5);

/**
 * LOD tile grid over `bounds` (+ coarse far strips). cellFor(d) maps the distance to the route (minus half a tile) to a grid cell size (x cellScale).
 * Tiles that are near the route stay individual (they cast shadows and are frustum-culled one by one); the far ones are merged
 * in blocks of `block` x `block` tiles. Returns { group, geos, tiles, meshes }.
 */
export async function buildTerrainTiles({ course, H, mat, bounds, T = 360, cellFor, cellScale = 1, castNear = 200, nearD = 300, block = 3, farR = 7000, progress, yieldFrame }) {
  const samples = [], f = {};
  for (let s = 0; s < course.length; s += 40) { course.frameAt(s, f); samples.push(f.pos.x, f.pos.z); }
  for (const b of course.branches) for (let u = 0; u < b.length; u += 40) { b.frameAt(u, f); samples.push(f.pos.x, f.pos.z); }
  const dMin = (cx, cz) => { let m = 1e9; for (let i = 0; i < samples.length; i += 2) { const d = Math.hypot(samples[i] - cx, samples[i + 1] - cz); if (d < m) m = d; } return m; };
  const group = new THREE.Group(); group.name = 'terrain';
  const geos = [], far = new Map();
  const tilesX = Math.ceil((bounds.maxX - bounds.minX) / T), tilesZ = Math.ceil((bounds.maxZ - bounds.minZ) / T);
  let built = 0, meshes = 0;
  for (let j = 0; j < tilesZ; j++) {
    for (let i = 0; i < tilesX; i++) {
      const x0 = bounds.minX + i * T, z0 = bounds.minZ + j * T, d = dMin(x0 + T / 2, z0 + T / 2) - T * 0.7;
      const g = buildPatch(H, { x0, z0, x1: x0 + T, z1: z0 + T, cell: cellFor(d) * cellScale }, { minH: -1e9, skirt: true, skirtDrop: 60 });
      if (d < nearD) {
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = d < castNear; group.add(m); geos.push(g); meshes++;
      } else {
        const key = Math.floor(i / block) + ',' + Math.floor(j / block);
        if (!far.has(key)) far.set(key, []);
        far.get(key).push(g);
      }
      if (++built % 6 === 0) { progress?.(0.5 * ((j * tilesX + i) / (tilesX * tilesZ)), 'Carving the terrain'); await yieldFrame?.(); }
    }
  }
  for (const list of far.values()) {
    const g = list.length > 1 ? mergeGeometries(list, false) : list[0];
    if (list.length > 1) list.forEach((x) => x.dispose());
    const m = new THREE.Mesh(g, mat); m.receiveShadow = true; group.add(m); geos.push(g); meshes++;
  }
  // far backdrop: four coarse strips around the carved area so the horizon is not empty (one merged mesh)
  const bx0 = bounds.minX, bx1 = bounds.minX + tilesX * T, bz0 = bounds.minZ, bz1 = bounds.minZ + tilesZ * T;
  const strips = [[bx0 - farR, bz0 - farR, bx1 + farR, bz0], [bx0 - farR, bz1, bx1 + farR, bz1 + farR], [bx0 - farR, bz0, bx0, bz1], [bx1, bz0, bx1 + farR, bz1]];
  const sg = strips.map(([x0, z0, x1, z1]) => buildPatch(H, { x0, z0, x1, z1, cell: 200 }, { minH: -1e9, skirt: true, skirtDrop: 100 }));
  const merged = mergeGeometries(sg, false); sg.forEach((x) => x.dispose());
  const sm = new THREE.Mesh(merged, mat); group.add(sm); geos.push(merged); meshes++;
  return { group, geos, tiles: built, meshes };
}
