// P3 round 15 (C3, the Tay): the river mirrors its banks. Round 14's score left C3 the floor at 7.0: a flat, matte grey-blue sheet
// meeting tan bank bands, where R-pt3-b (46028) shows "a clean sheet with crisp, dark, vegetated banks". Rounds 10-13 worked the shore
// paint and the sheet's edge (a feather that cost Bridgend its near channel). This works the water itself: each fragment of the Tay's
// sheet follows its reflected ray away from the eye over a height map of what is drawn round the river (the drape, the town's blocks,
// the trees, the viaduct and the road bridges) and, where the ray meets one of them before it clears them all, takes on that thing's
// tone, by the water's Fresnel reflectance. So the far bank, Moncreiffe's trees, the town and the viaduct's piers stand on their own
// mirrored images, as the eye sees them from a low bank. No triangles, no draws: two RGBA data textures under 2048 px a side.
import * as THREE from 'three';

/** The mirror (ASSUMED values unless sourced):
 *  - `texel` m: the height map's cell; `margin` m: the map covers the river's mapped water plus this much land round it;
 *  - `unit` m: the height step stored in a byte (0.25 m, so 63.75 m over the datum; anything taller is clamped there and still hit);
 *  - the march: from `first` m out, each step `grow` of the distance gone, at least `step` m, at most `steps` steps and `reach` m;
 *  - `f0`: water's reflectance at normal incidence ((1.33 - 1) / (1.33 + 1))^2 = 0.02 (Schlick); the reflected tone's weight is
 *    `strength` times the Fresnel term over its value at `fRef` (a ray 3 deg over the water), capped at 1: wind ripples on a running
 *    river break the mirror up, so even a grazing ray shows the bank only `strength` strong;
 *  - `fade` [from, to] m from the eye: the mirror fades out with distance, as ripples finer than a pixel blur it into the sky's tone (so
 *    the summit panorama, 1.4 km and more over the river, and the landing view keep the sheet as it was);
 *  - the ripple: wavelets tilt the water, so a fragment mirrors a fan of rays, not one; its slopes run `ripple` of the mean slope either
 *    side of it, and the share of that fan that meets a thing is the share of the thing's tone (a soft, vertically blurred image, as
 *    on moving water); the fan's middle wanders `jitter` of itself over value noise `grain` m along the eye's line and `stretch` times
 *    that across it, so the image breaks into horizontal streaks. A thing whose foot is within `stand` m of the ground stops the fan
 *    from below, as the ground does; one standing clear of it (a girder, a roof over its walls) only takes its own slice of it;
 *  - `tones` (sRGB): what each class of thing looks like in the water, by eye from the model's own render of it at the Tay views, a
 *    little darker (the reflection loses the light that the water takes in). */
export const TAY_MIRROR = {
  texel: 2, margin: 320, unit: .25, first: 1, step: 1.5, grow: .03, steps: 120, reach: 700, stand: 1,
  f0: .02, fRef: .053, strength: .7, fade: [380, 900] as const,
  ripple: .22, jitter: .1, grain: 4, stretch: 6,
  tones: {bank: '#4c5a34', tree: '#33432a', stone: '#837b6c', masonry: '#5f5045', roof: '#4e5358', paint: '#a7acab'},
} as const;
/** The classes, by their code in the map's alpha (0: nothing over the ground). Bank is the drape itself, read from the red channel. */
export const MIRROR_CLASSES = ['none', 'bank', 'tree', 'stone', 'roof', 'paint', 'masonry'] as const;
export type MirrorClass = typeof MIRROR_CLASSES[number];
/** The meshes the map is drawn from, by name: the ground, and the things standing on it with their class. */
export const MIRROR_GROUND = ['waverley-ground-cover', 'perth-east-ground'] as const;
export const MIRROR_THINGS: Readonly<Record<string, Exclude<MirrorClass, 'none' | 'bank'>>> = {
  'perth-city-walls': 'stone', 'perth-city-ashlar': 'stone', 'perth-city-shops': 'stone', 'perth-city-masonry': 'masonry', 'perth-kirk-spire': 'roof',
  'perth-city-roofs': 'roof', 'perth-bridge-roads': 'roof', 'perth-viaduct-iron': 'paint',
  'waverley-tree-crowns': 'tree', 'waverley-wood-crowns': 'tree', 'waverley-tree-trunks': 'tree', 'perth-island-trees': 'tree', 'perth-island-trunks': 'tree',
  'perth-kinnoull-canopy': 'tree', 'perth-east-bank-trees': 'tree',
};
/** Where two classes stand clear of the ground in one cell, the one kept (the viaduct's paint over a road bridge's deck, ...). */
export const MIRROR_PRIORITY: readonly MirrorClass[] = ['paint', 'masonry', 'stone', 'tree', 'roof'];

/** The height map, `texel` m cells from (x0, z0), rows along z; heights are `datum` + byte x TAY_MIRROR.unit. `heights` (RGBA, read
 *  bilinear, so the images' outlines are smooth, not 2 m steps): R the top of the ground and of whatever stands on it (its foot within
 *  TAY_MIRROR.stand m of the ground: a wall, a pier, a tree). `classes` (RGBA, read nearest): R the class of R's top (MIRROR_CLASSES;
 *  taken from the tallest of the cell and its eight neighbours, so the smooth rise round a pier wears the pier's tone, not the
 *  bank's), G the class of the one thing standing clear of the ground (a girder, a roof over its walls; 0: nothing), B and A its foot
 *  and top. */
export interface MirrorMap {x0: number; z0: number; texel: number; cols: number; rows: number; datum: number; heights: Uint8Array; classes: Uint8Array}

type Box = {x0: number; z0: number; x1: number; z1: number};
/** Every triangle of a mesh (instances expanded) in the Perth frame (the meshes stand in the frame: identity transforms up the tree). */
function eachTriangle(mesh: THREE.Mesh, visit: (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3) => void): void {
  const g = mesh.geometry, pos = g.getAttribute('position'), idx = g.index, n = idx ? idx.count : pos.count;
  const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? mesh as THREE.InstancedMesh : null, m = new THREE.Matrix4();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let k = 0; k < (inst ? inst.count : 1); k++) {
    if (inst) inst.getMatrixAt(k, m); else m.identity();
    m.premultiply(mesh.matrixWorld);
    for (let i = 0; i + 2 < n; i += 3) {
      const ia = idx ? idx.getX(i) : i, ib = idx ? idx.getX(i + 1) : i + 1, ic = idx ? idx.getX(i + 2) : i + 2;
      a.fromBufferAttribute(pos, ia).applyMatrix4(m); b.fromBufferAttribute(pos, ib).applyMatrix4(m); c.fromBufferAttribute(pos, ic).applyMatrix4(m);
      visit(a, b, c);
    }
  }
}

/** Raster a triangle onto the cells: `at(i, j, lo, hi)` for each cell it covers. A face seen edge-on from above (a wall) is drawn as its
 *  plan's line, every cell along it taking the face's whole height; any other face gives each cell centre inside it its height there. */
function rasterTriangle(map: Pick<MirrorMap, 'x0' | 'z0' | 'texel' | 'cols' | 'rows'>, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, at: (i: number, j: number, lo: number, hi: number) => void): void {
  const T = map.texel, area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x), z0 = Math.min(a.z, b.z, c.z), z1 = Math.max(a.z, b.z, c.z);
  if (x1 < map.x0 || z1 < map.z0 || x0 > map.x0 + map.cols * T || z0 > map.z0 + map.rows * T) return;
  if (Math.abs(area) < 1e-3 * Math.max(1e-6, (x1 - x0 + z1 - z0) ** 2) || Math.abs(area) < 1e-4) {
    // edge-on: the longest plan edge, sampled every half cell, at the face's full height
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y), pts = [a, b, c];
    let p = a, q = b, best = -1;
    for (let u = 0; u < 3; u++) for (let v = u + 1; v < 3; v++) { const d = Math.hypot(pts[u]!.x - pts[v]!.x, pts[u]!.z - pts[v]!.z); if (d > best) { best = d; p = pts[u]!; q = pts[v]!; } }
    const n = Math.max(1, Math.ceil(best / (T / 2)));
    let last = -1;
    for (let s = 0; s <= n; s++) {
      const x = p.x + (q.x - p.x) * s / n, z = p.z + (q.z - p.z) * s / n, i = Math.floor((x - map.x0) / T), j = Math.floor((z - map.z0) / T);
      if (i < 0 || j < 0 || i >= map.cols || j >= map.rows || j * map.cols + i === last) continue;
      last = j * map.cols + i; at(i, j, lo, hi);
    }
    return;
  }
  const i0 = Math.max(0, Math.floor((x0 - map.x0) / T)), i1 = Math.min(map.cols - 1, Math.floor((x1 - map.x0) / T));
  const j0 = Math.max(0, Math.floor((z0 - map.z0) / T)), j1 = Math.min(map.rows - 1, Math.floor((z1 - map.z0) / T));
  let hit = false;
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = map.x0 + (i + .5) * T, z = map.z0 + (j + .5) * T;
    const w0 = ((b.x - x) * (c.z - z) - (c.x - x) * (b.z - z)) / area, w1 = ((c.x - x) * (a.z - z) - (a.x - x) * (c.z - z)) / area, w2 = 1 - w0 - w1;
    if (w0 < -1e-6 || w1 < -1e-6 || w2 < -1e-6) continue;
    const y = w0 * a.y + w1 * b.y + w2 * c.y; at(i, j, y, y); hit = true;
  }
  // a face smaller than a cell still marks the cell under its centre (a lobe's facet, a pier's cap)
  if (!hit) { const i = Math.floor(((a.x + b.x + c.x) / 3 - map.x0) / T), j = Math.floor(((a.z + b.z + c.z) / 3 - map.z0) / T); if (i >= 0 && j >= 0 && i < map.cols && j < map.rows) at(i, j, Math.min(a.y, b.y, c.y), Math.max(a.y, b.y, c.y)); }
}

/** The mirror's height map over `water` (the river's sheet) and the land `margin` m round it, inside `extent`, from the meshes under
 *  `root` named in MIRROR_GROUND and MIRROR_THINGS; cells no ground mesh covers take `ground(x, z)`. */
export function buildTayMirror(root: THREE.Object3D, water: THREE.Mesh, extent: Box, ground: (x: number, z: number) => number): MirrorMap {
  const M = TAY_MIRROR, T = M.texel;
  root.updateMatrixWorld(true);
  water.geometry.computeBoundingBox();
  const wb = water.geometry.boundingBox!;
  const x0 = Math.max(extent.x0, Math.floor((wb.min.x - M.margin) / T) * T), x1 = Math.min(extent.x1, wb.max.x + M.margin);
  const z0 = Math.max(extent.z0, Math.floor((wb.min.z - M.margin) / T) * T), z1 = Math.min(extent.z1, wb.max.z + M.margin);
  const cols = Math.ceil((x1 - x0) / T), rows = Math.ceil((z1 - z0) / T), datum = Math.floor(wb.min.y) - 1;
  const n = cols * rows, top = new Float32Array(n).fill(-Infinity), C = MIRROR_PRIORITY.length;
  const lo = new Float32Array(n * C).fill(Infinity), hi = new Float32Array(n * C).fill(-Infinity);
  const map = {x0, z0, texel: T, cols, rows};
  const meshes: {mesh: THREE.Mesh; kind: MirrorClass}[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh; if (!m.isMesh) return;
    if ((MIRROR_GROUND as readonly string[]).includes(m.name)) meshes.push({mesh: m, kind: 'bank'});
    else if (MIRROR_THINGS[m.name]) meshes.push({mesh: m, kind: MIRROR_THINGS[m.name]!});
  });
  for (const {mesh, kind} of meshes) {
    const rank = MIRROR_PRIORITY.indexOf(kind);
    eachTriangle(mesh, (a, b, c) => rasterTriangle(map, a, b, c, kind === 'bank'
      ? (i, j, _l, h) => { const k = j * cols + i; if (h > top[k]!) top[k] = h; }
      : (i, j, l, h) => { const k = (j * cols + i) * C + rank; if (l < lo[k]!) lo[k] = l; if (h > hi[k]!) hi[k] = h; }));
  }
  const heights = new Uint8Array(n * 4), classes = new Uint8Array(n * 4), own = new Uint8Array(n), q = (y: number) => Math.max(0, Math.min(255, Math.round((y - datum) / M.unit)));
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, g = top[k]! > -Infinity ? top[k]! : ground(x0 + (i + .5) * T, z0 + (j + .5) * T);
    let stand = g, standCls = MIRROR_CLASSES.indexOf('bank'), clear = -1;
    for (let r = 0; r < C; r++) {
      if (hi[k * C + r]! === -Infinity) continue;
      if (lo[k * C + r]! <= g + M.stand) { if (hi[k * C + r]! > stand) { stand = hi[k * C + r]!; standCls = MIRROR_CLASSES.indexOf(MIRROR_PRIORITY[r]!); } }
      else if (clear < 0) clear = r;
    }
    heights[k * 4] = q(stand); own[k] = standCls;
    if (clear >= 0) { classes[k * 4 + 1] = MIRROR_CLASSES.indexOf(MIRROR_PRIORITY[clear]!); classes[k * 4 + 2] = q(lo[k * C + clear]!); classes[k * 4 + 3] = Math.max(classes[k * 4 + 2]!, q(hi[k * C + clear]!)); }
  }
  // the standing class: the tallest of the cell and its neighbours, whose height the bilinear read spreads over the cell
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    let best = j * cols + i;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
      if (heights[(b * cols + a) * 4]! > heights[best * 4]!) best = b * cols + a;
    }
    classes[(j * cols + i) * 4] = own[best]!;
  }
  return {x0, z0, texel: T, cols, rows, datum, heights, classes};
}

/** Value noise in [0, 1) on a unit lattice (bilinear, smoothstepped): the shader's own (mirrorNoise). */
export function mirrorNoise(u: number, v: number): number {
  const hash = (x: number, y: number) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, su = fu * fu * (3 - 2 * fu), sv = fv * fv * (3 - 2 * fv);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
}

/** What the sheet at `p` mirrors to an eye at `eye` (both Perth frame): the share of its ray fan that meets something (`cover`), the
 *  mean tone of what it meets (linear RGB), the class that gave most of it, and the tone's weight in the water. The shader's own march. */
export function mirrorAt(map: MirrorMap, p: readonly [number, number, number], eye: readonly [number, number, number]): {cover: number; tone: [number, number, number]; kind: MirrorClass; weight: number} {
  const M = TAY_MIRROR, dx = p[0] - eye[0], dz = p[2] - eye[2], D = Math.hypot(dx, dz), none = {cover: 0, tone: [0, 0, 0] as [number, number, number], kind: 'none' as MirrorClass, weight: 0};
  if (D < 1e-3 || eye[1] <= p[1] || D >= M.fade[1]) return none;
  const ux = dx / D, uz = dz / D;
  const along = (p[0] * ux + p[2] * uz) / M.grain, across = (p[0] * -uz + p[2] * ux) / (M.grain * M.stretch);
  const k = (eye[1] - p[1]) / D * (1 + M.jitter * (2 * mirrorNoise(along, across) - 1)), lowK = k * (1 - M.ripple), span = 2 * M.ripple * k;
  const top = map.datum + 255 * M.unit, tones = MIRROR_TONES_LINEAR, by: number[] = MIRROR_CLASSES.map(() => 0), tone: [number, number, number] = [0, 0, 0];
  let t = mirrorFirst(D), s = t - D, acc = 0;
  const take = (cls: number, f: number) => { by[cls]! += f; for (let c = 0; c < 3; c++) tone[c] += f * tones[cls]![c]!; acc += f; };
  for (let n = 0; n < M.steps && s <= M.reach && acc < .99; n++) {
    const yl = p[1] + lowK * s, w = span * s; if (yl > top) break;
    const qx = (p[0] + ux * s - map.x0) / map.texel, qz = (p[2] + uz * s - map.z0) / map.texel;
    if (qx >= 0 && qz >= 0 && qx < map.cols && qz < map.rows) {
      const stand = mirrorHeights(map, qx, qz), c = (Math.floor(qz) * map.cols + Math.floor(qx)) * 4, cl = map.classes;
      // the ground, and what stands on it, stops the fan from below; a thing clear of the ground takes its own slice of it
      const f = Math.max(0, Math.min(1, (stand - yl) / w)); if (f > acc) take(cl[c]!, f - acc);
      if (cl[c + 1]!) { const lo = map.datum + cl[c + 2]! * M.unit, hi = map.datum + cl[c + 3]! * M.unit, o = Math.max(0, Math.min(1, (Math.min(hi, yl + w) - Math.max(lo, yl)) / w)); if (o > 0) take(cl[c + 1]!, o * (1 - acc)); }
    }
    t += Math.max(M.step, t * M.grow); s = t - D;
  }
  if (acc <= 0) return none;
  const best = by.indexOf(Math.max(...by));
  return {cover: Math.min(1, acc), tone: [tone[0] / acc, tone[1] / acc, tone[2] / acc], kind: MIRROR_CLASSES[best]!, weight: Math.min(1, acc) * mirrorWeight(k, D)};
}
/** The standing top (m) at cell coordinates (qx, qz), read bilinear between cell centres and clamped at the edge, as the GPU's linear
 *  filter reads it. */
export function mirrorHeights(map: MirrorMap, qx: number, qz: number): number {
  const u = Math.max(0, Math.min(map.cols - 1, qx - .5)), v = Math.max(0, Math.min(map.rows - 1, qz - .5));
  const i = Math.min(map.cols - 2, Math.floor(u)), j = Math.min(map.rows - 2, Math.floor(v)), fu = u - i, fv = v - j, d = map.heights;
  const a = d[(j * map.cols + i) * 4]!, b = d[(j * map.cols + i + 1) * 4]!, c = d[((j + 1) * map.cols + i) * 4]!, e = d[((j + 1) * map.cols + i + 1) * 4]!;
  return map.datum + ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv) * TAY_MIRROR.unit;
}
/** The first sample's distance from the eye for a fragment `d` m off: the first point of the march's lattice (every TAY_MIRROR.step m
 *  out to step / grow m, then growing by `grow` each step) at least `first` m beyond the fragment. The lattice is the eye's, not the
 *  fragment's, so neighbouring fragments on one line of sight sample the same ground: no stepped edges. */
export function mirrorFirst(d: number): number {
  const M = TAY_MIRROR, a = d + M.first, knee = M.step / M.grow;
  return a <= knee ? Math.ceil(a / M.step) * M.step : knee * (1 + M.grow) ** Math.ceil(Math.log(a / knee) / Math.log(1 + M.grow));
}
/** TAY_MIRROR's tones in linear light, by class code (none first). */
export const MIRROR_TONES_LINEAR: readonly (readonly [number, number, number])[] = MIRROR_CLASSES.map(c => {
  const t = c === 'none' ? null : new THREE.Color(TAY_MIRROR.tones[c]); return t ? [t.r, t.g, t.b] as const : [0, 0, 0] as const;
});
/** The reflected tone's weight for a ray `k` (rise per metre) at `d` m from the eye: TAY_MIRROR's strength x Fresnel / Fresnel at fRef, x the fade. */
export function mirrorWeight(k: number, d: number): number {
  const M = TAY_MIRROR, fresnel = (slope: number) => { const c = slope / Math.hypot(1, slope); return M.f0 + (1 - M.f0) * (1 - c) ** 5; };
  const t = Math.max(0, Math.min(1, (d - M.fade[0]) / (M.fade[1] - M.fade[0]))), fade = 1 - t * t * (3 - 2 * t);
  return M.strength * Math.min(1, fresnel(k) / fresnel(M.fRef)) * fade;
}

/** The mirror's GLSL: the march and weight above, over the map in `perthMirror`. */
export function mirrorGlsl(map: MirrorMap): string {
  const M = TAY_MIRROR, f = (v: number) => v.toFixed(5), tone = (hex: string) => { const c = new THREE.Color(hex); return `vec3(${f(c.r)}, ${f(c.g)}, ${f(c.b)})`; };
  return `
uniform sampler2D perthMirror;
uniform sampler2D perthMirrorClass;
varying vec3 vMirrorPos;
varying vec3 vMirrorEye;
float mirrorHash(vec2 q) { return fract(sin(q.x * 127.1 + q.y * 311.7) * 43758.5453); }
float mirrorNoise(vec2 q) {
  vec2 i = floor(q), u = fract(q), s = u * u * (3.0 - 2.0 * u);
  float a = mirrorHash(i), b = mirrorHash(i + vec2(1.0, 0.0)), c = mirrorHash(i + vec2(0.0, 1.0)), d = mirrorHash(i + vec2(1.0, 1.0));
  return a + (b - a) * s.x + (c - a) * s.y + (a - b - c + d) * s.x * s.y;
}
float mirrorFresnel(float k) { float c = k / sqrt(1.0 + k * k); return ${f(M.f0)} + ${f(1 - M.f0)} * pow(1.0 - c, 5.0); }
vec3 perthMirrorTone(float c) {
  return c < 1.5 ? ${tone(M.tones.bank)} : c < 2.5 ? ${tone(M.tones.tree)} : c < 3.5 ? ${tone(M.tones.stone)} : c < 4.5 ? ${tone(M.tones.roof)} : c < 5.5 ? ${tone(M.tones.paint)} : ${tone(M.tones.masonry)};
}
// the mean tone the ray fan meets (rgb) and its weight in the water (a)
vec4 perthMirrorAt(vec3 p, vec3 eye) {
  vec2 d = p.xz - eye.xz; float D = length(d);
  if (D < 0.001 || eye.y <= p.y || D >= ${f(M.fade[1])}) return vec4(0.0);
  vec2 u = d / D;
  float along = dot(p.xz, u) / ${f(M.grain)}, across = dot(p.xz, vec2(-u.y, u.x)) / ${f(M.grain * M.stretch)};
  float k = (eye.y - p.y) / D * (1.0 + ${f(M.jitter)} * (2.0 * mirrorNoise(vec2(along, across)) - 1.0));
  float lowK = k * ${f(1 - M.ripple)}, span = ${f(2 * M.ripple)} * k;
  // the samples sit on one lattice of distances from the eye (every step m, then grow), not from the fragment: so every fragment
  // under one line of sight tries the same points, and a mirrored edge stays one straight line down the water, not a staircase
  float a = D + ${f(M.first)}, t = a <= ${f(M.step / M.grow)} ? ceil(a / ${f(M.step)}) * ${f(M.step)} : ${f(M.step / M.grow)} * pow(${f(1 + M.grow)}, ceil(log(a / ${f(M.step / M.grow)}) / ${f(Math.log(1 + M.grow))}));
  float s = t - D, acc = 0.0; vec3 tone = vec3(0.0);
  for (int n = 0; n < ${M.steps}; n++) {
    if (s > ${f(M.reach)} || acc >= 0.99) break;
    float yl = p.y + lowK * s, w = span * s; if (yl > ${f(map.datum + 255 * M.unit)}) break;
    vec2 q = (p.xz + u * s - vec2(${f(map.x0)}, ${f(map.z0)})) / ${f(map.texel)};
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < ${f(map.cols)} && q.y < ${f(map.rows)}) {
      float stand = ${f(map.datum)} + texture2D(perthMirror, q / vec2(${f(map.cols)}, ${f(map.rows)})).r * ${f(255 * M.unit)};
      vec4 c = floor(texture2D(perthMirrorClass, (floor(q) + 0.5) / vec2(${f(map.cols)}, ${f(map.rows)})) * 255.0 + 0.5);
      float f = clamp((stand - yl) / w, 0.0, 1.0);
      if (f > acc) { tone += (f - acc) * perthMirrorTone(c.r); acc = f; }
      if (c.g > 0.5) {
        float lo = ${f(map.datum)} + c.b * ${f(M.unit)}, hi = ${f(map.datum)} + c.a * ${f(M.unit)};
        float o = clamp((min(hi, yl + w) - max(lo, yl)) / w, 0.0, 1.0); if (o > 0.0) { tone += o * (1.0 - acc) * perthMirrorTone(c.g); acc += o * (1.0 - acc); }
      }
    }
    t += max(${f(M.step)}, t * ${f(M.grow)}); s = t - D;
  }
  if (acc <= 0.0) return vec4(0.0);
  float fade = 1.0 - smoothstep(${f(M.fade[0])}, ${f(M.fade[1])}, D);
  return vec4(tone / acc, min(1.0, acc) * ${f(M.strength)} * min(1.0, mirrorFresnel(k) / mirrorFresnel(${f(M.fRef)})) * fade);
}`;
}

/** Put the mirror on the Tay's (graded) Phong material: after its colour and grade, its diffuse colour leans to the mirrored tone. */
export function mirrorWater(m: THREE.MeshPhongMaterial, map: MirrorMap): THREE.DataTexture[] {
  const texture = (bytes: Uint8Array, filter: THREE.MagnificationTextureFilter) => {
    const t = new THREE.DataTexture(bytes, map.cols, map.rows, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = t.minFilter = filter; t.generateMipmaps = false; t.needsUpdate = true; return t;
  };
  const tex = texture(map.heights, THREE.LinearFilter), more = texture(map.classes, THREE.NearestFilter);
  const before = m.onBeforeCompile, key = m.customProgramCacheKey, glsl = mirrorGlsl(map);
  m.onBeforeCompile = (shader, r) => {
    before.call(m, shader, r);
    shader.uniforms.perthMirror = {value: tex}; shader.uniforms.perthMirrorClass = {value: more};
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vMirrorPos;\nvarying vec3 vMirrorEye;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n  vMirrorPos = transformed;\n  vMirrorEye = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${glsl}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  { vec4 mirrored = perthMirrorAt(vMirrorPos, vMirrorEye); diffuseColor.rgb = mix(diffuseColor.rgb, mirrored.rgb, mirrored.a); }`);
  };
  m.customProgramCacheKey = () => `${key.call(m)}-mirror-${map.cols}x${map.rows}-${JSON.stringify(TAY_MIRROR)}`;
  return [tex, more];
}
