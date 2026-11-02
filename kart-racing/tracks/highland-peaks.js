// Highland Fling - the big hills. Ridged, snow-capped munros on the skyline and the rolling braes in front of them, all procedural:
// each is a heightfield (a few massifs merged with a ridged-noise skin, so crests run down the flanks) coloured by altitude and slope
// (forest foot -> heather and bracken -> scree -> bare rock on the steep faces). Snow is laid on in the shader from a per-vertex "snow
// height" and a per-instance snowline, so only the tallest peaks wear caps (lying on the gentler ground; the sheer faces stay bare) and
// the line can be dropped for a winter season. A handful of variants is shared by many instances (a few draw calls), and the mountains
// get a lighter haze than the rest of the scene so their ridges and snow still read through the glen mist.
import * as THREE from "three";
import { TAU, vnoise, sm } from "./highland-geo.js";

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const mulberry = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// fractal value noise (each octave rotated and scaled by ~2, so no lattice direction shows); both return 0..1
function fbm(x, z, oct, ox, oz) {
  let a = 1, s = 0, tot = 0;
  for (let o = 0; o < oct; o++) { s += a * vnoise(x + ox + o * 17.3, z + oz - o * 9.1); tot += a; const nx = x * 1.62 - z * 1.2, nz = x * 1.2 + z * 1.62; x = nx; z = nz; a *= 0.5; }
  return s / tot;
}
function ridged(x, z, oct, ox, oz) {
  let a = 1, s = 0, tot = 0;
  for (let o = 0; o < oct; o++) { const n = 1 - Math.abs(2 * vnoise(x + ox + o * 13.7, z + oz - o * 7.9) - 1); s += a * n * n; tot += a; const nx = x * 1.62 - z * 1.2, nz = x * 1.2 + z * 1.62; x = nx; z = nz; a *= 0.5; }
  return s / tot;
}

// ---------------------------------------------------------------- palette
const col = (h) => new THREE.Color(h);
const PAL = {
  forest: col(0x3d4d2c), grass: col(0x55683a), bracken: col(0x7b6b3e), heather: col(0x77598c), moor: col(0x6a6047),
  scree: col(0x948e86), rockHi: col(0xa9a6ad), rockLo: col(0x6d6873),
};

// One vertex of a mountain: hn = height / summit height (0..1), sl = how steep (0 flat .. 1 sheer), x,z = unit-disc position.
// Writes the snowless colour into out; snow.t = this vertex's ragged "snow height", snow.k = how readily snow lies on this ground.
function mountainColour(hn, sl, x, z, out, snow) {
  const n1 = vnoise(x * 6 + 3.1, z * 6 - 1.7), n2 = vnoise(x * 15 - 8.2, z * 15 + 4.4), n3 = vnoise(x * 31 + 1.9, z * 31 + 7.3);
  const t = hn + 0.07 * (n1 - 0.5);
  out.copy(PAL.forest).lerp(PAL.grass, sm(0.02, 0.12, t));
  out.lerp(n2 > 0.52 ? PAL.heather : PAL.bracken, sm(0.1, 0.28, t) * (0.6 + 0.4 * n3));
  out.lerp(PAL.moor, sm(0.3, 0.5, t) * 0.7);
  out.lerp(PAL.scree, sm(0.5, 0.8, t));
  out.lerp(n3 > 0.48 ? PAL.rockLo : PAL.rockHi, sm(0.26, 0.6, sl + 0.12 * (n2 - 0.5)) * sm(0.2, 0.5, t) * 0.75);   // bare rock only where it is steep (and not down on the moor)
  out.multiplyScalar(0.88 + 0.24 * n2);
  snow.t = hn + 0.09 * (n3 - 0.5) + 0.06 * (n2 - 0.5);
  snow.k = 1 - 0.85 * sm(0.5, 0.82, sl + 0.1 * (n3 - 0.5));   // snow clings to all but the sheerest faces
}

// One vertex of a rolling hill: grass / heather / bracken, dark forest patches low down, bare rock where it is steep and high
function hillColour(hn, sl, x, z, out, snow) {
  const n1 = vnoise(x * 5 + 7.7, z * 5 + 1.3), n2 = vnoise(x * 13 - 2.2, z * 13 + 9.1), n3 = vnoise(x * 27 + 4.4, z * 27 - 6.6);
  out.copy(PAL.grass).lerp(n1 > 0.5 ? PAL.heather : PAL.bracken, sm(0.3, 0.62, n1) * (0.55 + 0.45 * sm(0.05, 0.5, hn)));
  out.lerp(PAL.forest, sm(0.62, 0.78, n2) * (1 - sm(0.3, 0.6, hn)) * 0.85);
  out.lerp(PAL.moor, sm(0.45, 0.8, hn) * 0.5);
  out.lerp(n3 > 0.5 ? PAL.rockLo : PAL.rockHi, sm(0.16, 0.38, sl + 0.1 * (n2 - 0.5)) * sm(0.2, 0.55, hn) * 0.7);
  out.multiplyScalar(0.9 + 0.22 * n3);
  snow.t = hn + 0.12 * (n3 - 0.5) + 0.08 * (n2 - 0.5);
  snow.k = 1 - 0.7 * sm(0.3, 0.6, sl + 0.1 * (n3 - 0.5));
}

// ---------------------------------------------------------------- the grid mesh
// hfn(x, z) -> height >= 0 over the unit disc; the mesh spans x,z in [-1,1] and y in [0, aspect]; colourFn(hn, slope, x, z, out, snow)
function heightfieldGeo(N, aspect, hfn, colourFn) {
  const n1 = N + 1, hs = new Float32Array(n1 * n1);
  let hmax = 1e-6;
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) { const h = Math.max(0, hfn(-1 + (2 * i) / N, -1 + (2 * j) / N)); hs[j * n1 + i] = h; if (h > hmax) hmax = h; }
  const pos = new Float32Array(n1 * n1 * 3), idx = [];
  for (let j = 0; j < n1; j++) for (let i = 0; i < n1; i++) { const k = j * n1 + i; pos[k * 3] = -1 + (2 * i) / N; pos[k * 3 + 1] = (hs[k] / hmax) * aspect; pos[k * 3 + 2] = -1 + (2 * j) / N; }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * n1 + i, c = a + 1, d = a + n1, e = d + 1;
    if (hs[a] + hs[c] + hs[d] + hs[e] < 1e-5) continue;   // outside the footprint
    idx.push(a, d, c, c, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
  const nrm = g.attributes.normal, cl = new Float32Array(n1 * n1 * 3), sT = new Float32Array(n1 * n1), sK = new Float32Array(n1 * n1), c = new THREE.Color(), snow = { t: 0, k: 0 };
  for (let k = 0; k < n1 * n1; k++) {
    colourFn(hs[k] / hmax, 1 - clamp(nrm.getY(k), 0, 1), pos[k * 3], pos[k * 3 + 2], c, snow);
    cl[k * 3] = c.r; cl[k * 3 + 1] = c.g; cl[k * 3 + 2] = c.b; sT[k] = snow.t; sK[k] = snow.k;
  }
  g.setAttribute("color", new THREE.BufferAttribute(cl, 3));
  g.setAttribute("snowT", new THREE.BufferAttribute(sT, 1)); g.setAttribute("snowK", new THREE.BufferAttribute(sK, 1));
  return g;
}

// a massif: a main summit with a few satellites and elongated shoulders, merged softly (saddles between them), skinned with ridged noise
function mountainField(seed) {
  const rnd = mulberry(seed), ox = rnd() * 90, oz = rnd() * 90;
  const peaks = [{ x: 0, z: 0, h: 1, r: 0.74, el: 1.0 + rnd() * 0.6, a: rnd() * TAU }];
  const nSat = 2 + Math.floor(rnd() * 3);
  for (let i = 0; i < nSat; i++) { const a = rnd() * TAU, d = 0.26 + rnd() * 0.32; peaks.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 0.5 + rnd() * 0.34, r: 0.34 + rnd() * 0.26, el: 1.0 + rnd() * 0.9, a: rnd() * TAU }); }
  for (const p of peaks) { p.c = Math.cos(p.a); p.s = Math.sin(p.a); }
  return (x, z) => {
    const wx = x + 0.24 * (fbm(x * 1.7, z * 1.7, 3, ox, oz) - 0.5), wz = z + 0.24 * (fbm(x * 1.7, z * 1.7, 3, ox + 40, oz + 40) - 0.5);   // a wobbly footprint
    let s = 0;
    for (const p of peaks) {
      const dx = wx - p.x, dz = wz - p.z, u = dx * p.c + dz * p.s, v = (-dx * p.s + dz * p.c) * p.el, d = Math.hypot(u, v) / p.r;
      if (d < 1) s += Math.pow(p.h * (0.45 * Math.pow(1 - d, 1.1) + 0.55 * Math.pow(1 - d * d, 1.25)), 2.6);   // half cone, half dome: crags on a rounded top, not a spire
    }
    const base = Math.pow(s, 1 / 2.6) * sm(1.0, 0.68, Math.hypot(wx, wz));
    const rg = ridged(wx * 2.3, wz * 2.3, 4, ox, oz), bump = fbm(wx * 8, wz * 8, 3, ox + 7, oz - 3);
    return base * (0.55 + 0.95 * rg) + base * 0.07 * (bump - 0.5);   // crests run down the flanks; the detail grows with height
  };
}

// a low rolling brae: two or three broad swells and a little noise, no sharp ridges
function hillField(seed) {
  const rnd = mulberry(seed), ox = rnd() * 90, oz = rnd() * 90;
  const swells = [{ x: 0, z: 0, h: 1, r: 0.82 }];
  for (let i = 0, n = 1 + Math.floor(rnd() * 2); i < n; i++) { const a = rnd() * TAU, d = 0.25 + rnd() * 0.3; swells.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, h: 0.55 + rnd() * 0.3, r: 0.4 + rnd() * 0.25 }); }
  return (x, z) => {
    const wx = x + 0.2 * (fbm(x * 1.5, z * 1.5, 3, ox, oz) - 0.5), wz = z + 0.2 * (fbm(x * 1.5, z * 1.5, 3, ox + 31, oz + 17) - 0.5);
    let s = 0;
    for (const p of swells) { const d = Math.hypot(wx - p.x, wz - p.z) / p.r; if (d < 1) s += Math.pow(p.h * Math.pow(1 - d * d, 1.3), 3); }
    const base = Math.pow(s, 1 / 3) * sm(1.0, 0.6, Math.hypot(wx, wz));
    return base * (0.8 + 0.4 * fbm(wx * 3.5, wz * 3.5, 4, ox + 5, oz + 9)) + 0.05 * base * ridged(wx * 4, wz * 4, 2, ox, oz);
  };
}

// Lambert material + (1) snow, from the per-vertex snow height against the per-instance snowline, and (2) a lighter haze (k < 1 stretches the fog range)
function peakMaterial(K, k) {
  const m = K.lam({ vertexColors: true });
  m.onBeforeCompile = (sh) => {
    const decl = "varying float vSnowT;\nvarying float vSnowK;\nvarying float vSnowL;\n";
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float snowT;\nattribute float snowK;\nattribute float snowLine;\n" + decl)
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvSnowT = snowT; vSnowK = snowK; vSnowL = snowLine;");
    const fog = THREE.ShaderChunk.fog_fragment.replace("smoothstep( fogNear, fogFar, vFogDepth )", `smoothstep( fogNear, fogFar, vFogDepth * ${k.toFixed(3)} )`);
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\n" + decl)
      .replace("#include <color_fragment>", "#include <color_fragment>\n{ float sn = smoothstep(vSnowL, vSnowL + 0.06, vSnowT) * vSnowK; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.93, 0.98), sn); }")
      .replace("#include <fog_fragment>", fog);
  };
  m.customProgramCacheKey = () => "peaks" + k.toFixed(3);
  return m;
}

const MOUNTAIN_VARIANTS = [   // aspect = summit height / footprint radius
  { seed: 11, aspect: 0.55 }, { seed: 23, aspect: 0.68 }, { seed: 37, aspect: 0.8 }, { seed: 41, aspect: 0.92 }, { seed: 59, aspect: 1.05 }, { seed: 73, aspect: 0.74 },
];
const HILL_VARIANTS = [{ seed: 101, aspect: 0.34 }, { seed: 113, aspect: 0.44 }, { seed: 127, aspect: 0.54 }];
const SNOW_MOUNTAIN_M = 135, SNOW_HILL_M = 9999;   // height (m above the foot) where the snow starts: only the taller peaks wear it, the low braes stay bare

// mts / hills: the placements the nature builder worked out ({x,z,y,sx,sy,sz,ry}); sx = footprint radius, sy = summit height
export function buildPeaks(H, mts, hills) {
  const { X, K } = H;
  const rnd = mulberry(20240611);
  const tints = [0xffffff, 0xf4f1f6, 0xe9e9f0, 0xfaf4ee];
  const winter = !!(X.season && X.season.snowy);   // a snowy season drops the line, so the lower hills wear snow too
  const mMat = peakMaterial(K, 0.5), hMat = peakMaterial(K, 0.8);
  const snowAttr = (items, geo, lineM) => {
    const a = new Float32Array(items.length);
    items.forEach((it, i) => { a[i] = clamp((lineM * (0.88 + 0.24 * rnd())) / it.hw, 0.2, 3); });
    geo.setAttribute("snowLine", new THREE.InstancedBufferAttribute(a, 1));
  };

  const mGeos = MOUNTAIN_VARIANTS.map((v) => heightfieldGeo(40, v.aspect, mountainField(v.seed), mountainColour));
  const mItems = MOUNTAIN_VARIANTS.map(() => []);
  let capped = 0;
  mts.forEach((m, k) => {
    const i = (k * 5 + (rnd() < 0.3 ? 1 : 0)) % MOUNTAIN_VARIANTS.length, v = MOUNTAIN_VARIANTS[i];   // stride 5 (coprime with 6): neighbours round the ring get different shapes
    const r = m.sx * 1.3, tall = 0.9 + 0.25 * clamp((m.sy - 150) / 150, 0, 1);   // broad footprints (the low skirts sit under the ground); the old height only nudges the scale
    const hw = r * tall * v.aspect;
    if (hw > SNOW_MOUNTAIN_M * 1.1) capped++;
    mItems[i].push({ x: m.x, z: m.z, y: m.y, ry: rnd() * TAU, sx: r, sz: r * (m.sz / m.sx), sy: r * tall, c: tints[Math.floor(rnd() * tints.length)], hw });
  });
  mItems.forEach((items, i) => {
    if (!items.length) { mGeos[i].dispose(); return; }
    snowAttr(items, mGeos[i], winter ? 40 : SNOW_MOUNTAIN_M);
    K.instanced(mGeos[i], mMat, items, "mountains-" + i);
  });

  const hGeos = HILL_VARIANTS.map((v) => heightfieldGeo(26, v.aspect, hillField(v.seed), hillColour));
  const hItems = HILL_VARIANTS.map(() => []);
  for (const h of hills) {
    const want = clamp(h.sy / h.sx, 0.3, 0.6);
    let best = 0, bd = 1e9;
    HILL_VARIANTS.forEach((v, i) => { const d = Math.abs(v.aspect - want) + rnd() * 0.1; if (d < bd) { bd = d; best = i; } });
    hItems[best].push({ x: h.x, z: h.z, y: h.y, ry: rnd() * TAU, sx: h.sx, sz: h.sz, sy: (h.sx * want) / HILL_VARIANTS[best].aspect, c: tints[Math.floor(rnd() * tints.length)], hw: h.sx * want });
  }
  hItems.forEach((items, i) => {
    if (!items.length) { hGeos[i].dispose(); return; }
    snowAttr(items, hGeos[i], winter ? 12 : SNOW_HILL_M);
    K.instanced(hGeos[i], hMat, items, "hills-" + i);
  });

  H.peaks = { mountains: mts.length, capped, hills: hills.length, mountainTris: mGeos.reduce((a, g) => a + g.index.count / 3, 0), hillTris: hGeos.reduce((a, g) => a + g.index.count / 3, 0) };
}
