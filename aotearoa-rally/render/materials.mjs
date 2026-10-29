// Shared shader uniforms, GLSL snippets (noise, height fog, wind sway), the prop texture atlas and
// the prop / water / skid materials. Browser-only (imports THREE through the caller).
import { proceduralCanvas } from "./textures.mjs";

export const GLSL_NOISE = /* glsl */ `
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1.,0.)), u.x), mix(h21(i+vec2(0.,1.)), h21(i+vec2(1.,1.)), u.x), u.y); }
float fbm3(vec2 p){ float s = 0.0, a = 0.5; for(int i=0;i<3;i++){ s += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return s/0.875; }
`;

/** Uniforms shared by every world material (one object per world, injected by reference). */
export function createSharedUniforms(THREE) {
  return {
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2(1, 0) },
    uWindAmp: { value: 0.4 },
    uWet: { value: 0 },
    uSnow: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color(1, 1, 1) },
    uFogBase: { value: 0 },
    uFogFall: { value: 0.02 },
    uFogBoost: { value: 0.4 },
    uFlash: { value: 0 },
  };
}

const SHARED_DECL = /* glsl */ `
uniform float uTime; uniform vec2 uWind; uniform float uWindAmp; uniform float uWet; uniform float uSnow; uniform float uNight;
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uFogBase; uniform float uFogFall; uniform float uFogBoost; uniform float uFlash;
varying vec3 vWPos;
`;

const FOG_FRAG = /* glsl */ `
#ifdef USE_FOG
  float hf = exp(-max(vWPos.y - uFogBase, 0.0) * uFogFall);
  float fd = vFogDepth * (1.0 + uFogBoost * hf);
  float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fd * fd);
  vec3 vdir = normalize(vWPos - cameraPosition);
  float glare = pow(max(dot(vdir, uSunDir), 0.0), 6.0);
  vec3 fogCol = fogColor + uSunCol * glare * 0.22 * (1.0 - uNight);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogCol + uFlash * 0.4, fogFactor);
#endif
`;

const WORLDPOS_VERT = /* glsl */ `
#include <project_vertex>
{
  vec4 wp4 = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wp4 = instanceMatrix * wp4;
  #endif
  vWPos = (modelMatrix * wp4).xyz;
}
`;

/**
 * Patch a Mesh*Material shader: shared uniforms, vWPos, height fog with sun in-scatter.
 * `extra(shader)` may add more. Returns the shader for chaining.
 */
export function patchCommon(shader, SU) {
  Object.assign(shader.uniforms, SU);
  shader.vertexShader = shader.vertexShader
    .replace("#include <common>", "#include <common>\n" + SHARED_DECL)
    .replace("#include <project_vertex>", WORLDPOS_VERT);
  shader.fragmentShader = shader.fragmentShader
    .replace("#include <common>", "#include <common>\n" + SHARED_DECL + GLSL_NOISE + "\n//AR_END\n")
    .replace("#include <fog_fragment>", FOG_FRAG);
  return shader;
}

// ------------------------------------------------------------------ prop atlas

export const ATLAS_CELLS = [
  "bark_redwood", "bark_beech", "bark_pine", "gnd_schist",
  "gnd_limestone", "gnd_moss_rock", "foliage_fern", "foliage_pine",
  "foliage_broadleaf", "foliage_flax", "foliage_grass", "white",
  "fabric", "planks", "metal", "gnd_leaf",
];
const ATLAS_PAD = 0.012;

/** UV rectangle for a named atlas cell: [u0, v0, u1, v1] (v up). */
export function atlasCell(name) {
  const i = Math.max(0, ATLAS_CELLS.indexOf(name));
  const col = i % 4, row = Math.floor(i / 4);
  return [col / 4 + ATLAS_PAD, 1 - (row + 1) / 4 + ATLAS_PAD, (col + 1) / 4 - ATLAS_PAD, 1 - row / 4 - ATLAS_PAD];
}

function drawMisc(g, name, S) {
  if (name === "white") { g.fillStyle = "#ffffff"; g.fillRect(0, 0, S, S); return; }
  if (name === "planks") {
    for (let i = 0; i < 6; i++) {
      const k = 150 + ((i * 53) % 40);
      g.fillStyle = `rgb(${k},${k - 30},${k - 70})`; g.fillRect(0, (i * S) / 6, S, S / 6 - 2);
      g.fillStyle = "rgba(60,40,20,0.18)";
      for (let j = 0; j < 14; j++) g.fillRect(((j * 97 + i * 31) % S), (i * S) / 6, 1 + (j % 2), S / 6);
    }
    return;
  }
  if (name === "metal") {
    g.fillStyle = "#c9ccd0"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S; i += 4) { g.fillStyle = `rgba(0,0,0,${0.03 + ((i * 7) % 5) * 0.012})`; g.fillRect(0, i, S, 2); }
    return;
  }
  // fabric / wool noise
  g.fillStyle = "#e8e8e8"; g.fillRect(0, 0, S, S);
  for (let i = 0; i < S * 6; i++) {
    const x = (i * 7919) % S, y = (i * 104729) % S, k = 190 + ((i * 31) % 60);
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, y, 2, 2);
  }
}

/** Build the shared 4x4 prop atlas (canvas texture) from the texture set. */
export function buildPropAtlas(THREE, textures, { cell = 256, anisotropy = 4 } = {}) {
  const S = cell * 4;
  const canvas = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(S, S) : Object.assign(document.createElement("canvas"), { width: S, height: S });
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, S, S);
  ATLAS_CELLS.forEach((name, i) => {
    const cx = (i % 4) * cell, cy = Math.floor(i / 4) * cell;
    g.save();
    g.beginPath(); g.rect(cx, cy, cell, cell); g.clip();
    if (["white", "fabric", "planks", "metal"].includes(name)) {
      g.translate(cx, cy); drawMisc(g, name, cell);
    } else {
      const src = textures.source(name);
      const bark = name.startsWith("bark_");
      const rock = name.startsWith("gnd_");
      if (bark || rock) { // 2x2 tiling inside the cell so surfaces are not stretched
        const h = cell / 2;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) g.drawImage(src, cx + a * h, cy + b * h, h, h);
      } else {
        g.drawImage(src, cx, cy, cell, cell);
      }
    }
    g.restore();
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = anisotropy;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------ prop material

const SWAY_VERT = /* glsl */ `
#include <begin_vertex>
{
  vec3 ip = vec3(0.0);
  #ifdef USE_INSTANCING
    ip = instanceMatrix[3].xyz;
  #endif
  float ph = ip.x * 0.11 + ip.z * 0.17;
  float g1 = sin(uTime * 1.3 + ph) + 0.55 * sin(uTime * 2.9 + ph * 2.1) + 0.25 * sin(uTime * 5.3 + ph * 3.7);
  float amp = aSway * uWindAmp * (0.55 + 0.45 * g1);
  vec3 wl = vec3(uWind.x, 0.0, uWind.y);
  #ifdef USE_INSTANCING
    wl = transpose(mat3(instanceMatrix)) * wl;
  #endif
  wl = normalize(wl + vec3(1e-4));
  transformed += wl * amp * 0.5 * aSway;
  float fl = aSway * uWindAmp * 0.035;
  transformed.x += sin(uTime * 4.1 + position.y * 2.3 + ph * 5.0) * fl;
  transformed.z += cos(uTime * 3.7 + position.x * 2.1 + ph * 4.0) * fl;
}
`;

const NORMAL_NOFLIP = "#include <normal_fragment_begin>";

/** Single shared material for all atlas-textured, vertex-coloured instanced props. */
export function createPropMaterial(THREE, atlas, SU, { alphaToCoverage = false } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map: atlas, vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide,
    alphaTest: 0.42, envMapIntensity: 0.9,
  });
  m.alphaToCoverage = alphaToCoverage;
  m.onBeforeCompile = (shader) => {
    patchCommon(shader, SU);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aSway;")
      .replace("#include <begin_vertex>", SWAY_VERT);
    // keep authored (outward) tree normals on back faces: no flip for double-sided cards
    shader.fragmentShader = shader.fragmentShader
      .replace(NORMAL_NOFLIP, THREE.ShaderChunk.normal_fragment_begin.replace("gl_FrontFacing ? 1.0 : - 1.0", "1.0"))
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
        {
          vec3 wn = inverseTransformDirection(normal, viewMatrix);
          diffuseColor.rgb *= 1.0 - 0.28 * uWet;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.94, 1.0), uSnow * smoothstep(0.3, 0.75, wn.y));
        }`)
      .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= 1.0 - 0.45 * uWet;");
  };
  m.customProgramCacheKey = () => "ar-prop-" + (alphaToCoverage ? 1 : 0);
  return m;
}

// ------------------------------------------------------------------ water (fords, streams)

export function createWaterMaterial(THREE, SU, { color = 0x3f5d58, detail = true } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color, roughness: 0.06, metalness: 0.0, transparent: true, opacity: 0.82, envMapIntensity: 1.6, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6,
    depthWrite: false,
  });
  m.onBeforeCompile = (shader) => {
    patchCommon(shader, SU);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float aEdge; varying float vEdge;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEdge = aEdge;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vEdge;")
      .replace("#include <normal_fragment_maps>", /* glsl */ `#include <normal_fragment_maps>
        {
          vec2 p = vWPos.xz * 0.9;
          float e = 0.08;
          vec2 f1 = vec2(uTime * 0.9, uTime * 0.35), f2 = vec2(-uTime * 0.55, uTime * 0.8);
          float l0 = vnoise(p + f1), h0 = 0.6 * vnoise(p * 2.7 + f2);
          vec2 lg = vec2(vnoise(p + f1 + vec2(e, 0.)) - l0, vnoise(p + f1 + vec2(0., e)) - l0) / e;
          vec2 hg = 0.6 * vec2(vnoise(p * 2.7 + f2 + vec2(e * 2.7, 0.)) - vnoise(p * 2.7 + f2), vnoise(p * 2.7 + f2 + vec2(0., e * 2.7)) - vnoise(p * 2.7 + f2)) / e;
          // band-limit the ripple normals with distance (they alias into glitter on a far sea otherwise)
          float wd = length(vWPos.xz - cameraPosition.xz);
          float fa = 1.0 / (1.0 + wd * 0.012), fb = 1.0 / (1.0 + wd * wd * 0.0016);
          vec2 sl = (lg * fa + hg * fb) * 0.22;
          vec3 wn = normalize(vec3(-sl.x, 1.0, -sl.y));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
          diffuseColor.a = mix(diffuseColor.a, 1.0, smoothstep(40.0, 160.0, wd)); // distant water is opaque: no seabed walls showing through
          diffuseColor.a *= smoothstep(0.0, 0.35, vEdge);
          diffuseColor.rgb += vec3(0.05) * smoothstep(0.62, 0.8, l0 + h0) * fb * (1.0 - uNight);
        }`);
  };
  m.customProgramCacheKey = () => "ar-water";
  return m;
}

// ------------------------------------------------------------------ skid marks

export function createSkidMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    vertexColors: false, fog: false,
    vertexShader: /* glsl */ `attribute float aA; attribute vec3 aTint; varying float vA; varying vec3 vT;
      void main(){ vA = aA; vT = aTint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */ `varying float vA; varying vec3 vT; uniform float uWet;
      void main(){ gl_FragColor = vec4(vT * (1.0 - 0.3 * uWet), vA * 0.62); }`,
    uniforms: { uWet: { value: 0 } },
  });
}

export function disposeDeep(obj) {
  obj.traverse?.((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) m.dispose();
  });
}

export { proceduralCanvas };
