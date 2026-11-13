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
 *    `strength` times the Fresnel term over its value at `fRef` (a ray 3 deg over the water), capped at `hold`. Round 16 (C3): the
 *    sheet's blue is the sky it mirrors, so a thing standing in front of that sky takes nearly all of it away, and the image keeps the
 *    thing's own hue (round 15 left the water 30% or more and the piers' brown stone mirrored blue-grey [91, 101, 105]); only near the
 *    eye, where the water looks steeply down and mirrors less, does the sheet's own tone come back through;
 *  - `fade` [from, to] m from the eye: the mirror fades out with distance, as ripples finer than a pixel blur it into the sky's tone (so
 *    the summit panorama, 1.4 km and more over the river, and the landing view keep the sheet as it was);
 *  - the ripple: wavelets tilt the water, so a fragment mirrors a fan of rays, not one; its slopes run `ripple` of the mean slope either
 *    side of it, and the share of that fan that meets a thing is the share of the thing's tone (a soft, vertically blurred image, as
 *    on moving water); the fan's middle wanders `jitter` of itself over value noise `grain` m along the eye's line and `stretch` times
 *    that across it, so the image breaks into horizontal streaks; and where a second such field (offset) passes `glint` [0] to [1],
 *    (on rings round the eye, `glintRing` m apart, and `glintArc` noise cells to the radian round them, so the streaks lie level on
 *    screen) the image gives up to [2] of its weight back to the water: wavelets turned to the sky, so even a dark pier's image
 *    carries a few pale streaks (round 16: nearly opaque, it would read as a painted slab). A thing whose foot is within `stand` m of the ground stops the fan
 *    from below, as the ground does; one standing clear of it (a girder, a roof over its walls, a crown over its trunk) only takes its
 *    own slice of it, and where the fan meets it from below (its underside: a deck's soffit, a crown's shaded underside) its tone at
 *    `under` (linear) of itself;
 *  - the clear things' footprints from a raster `sub` times finer, each mark grown `widen` sub-cells; slender members (`slender`:
 *    faces under [0] m wide in plan, or edge-on faces under [1] m tall: a railing's bars and posts) are left out, as the mirror sees the
 *    sky between them. A trunk is left out for the same reason (round 15: each trunk raised a straight-sided column to its crown's top);
 *  - `tones` (sRGB, as on screen: the mirror is laid over the sheet's finished colour, not lit again): what each class of thing looks
 *    like in the water, from the model's own render of it at the Tay views (round 15's base frames, the median of a box on each: the
 *    piers' sunlit stone [69, 57, 43], the girders' lower band [173, 174, 176], island crowns [63, 93, 34], the far bank [62, 83, 44],
 *    the town's walls [81, 77, 62]), each 0.8 of it in sRGB where the water takes some light in (round 15 score: a reflection 15-25%
 *    darker than the thing, same hue); the roofs' tone is by eye, as before;
 *  - `edge`: a structure's or a clear thing's footprint is where its bilinear cover passes 0.5, softened `edge` either side. */
export const TAY_MIRROR = {
  texel: 2, margin: 320, unit: .25, first: 1, step: 1.5, grow: .03, steps: 120, reach: 700, stand: 1, sub: 4, widen: 1, slender: [.15, .1] as const,
  f0: .02, fRef: .053, strength: 2, hold: .96, under: .5, fade: [380, 900] as const,
  ripple: .12, jitter: .06, grain: 4, stretch: 6, edge: .08, glint: [.6, .9, .25] as const, glintRing: 1, glintArc: 15,
  tones: {bank: '#324223', tree: '#324a1b', stone: '#413e32', masonry: '#2e2014', roof: '#4e5358', paint: '#8a8b8d'},
} as const;
/** The classes, by their code in the map's alpha (0: nothing over the ground). Bank is the drape itself, read from the red channel. */
export const MIRROR_CLASSES = ['none', 'bank', 'tree', 'stone', 'roof', 'paint', 'masonry'] as const;
export type MirrorClass = typeof MIRROR_CLASSES[number];
/** The meshes the map is drawn from, by name: the ground, and the things standing on it with their class. */
export const MIRROR_GROUND = ['waverley-ground-cover', 'perth-east-ground'] as const;
export const MIRROR_THINGS: Readonly<Record<string, Exclude<MirrorClass, 'none' | 'bank'>>> = {
  'perth-city-walls': 'stone', 'perth-city-ashlar': 'stone', 'perth-city-shops': 'stone', 'perth-city-masonry': 'masonry', 'perth-kirk-spire': 'roof',
  'perth-city-roofs': 'roof', 'perth-bridge-roads': 'roof', 'perth-viaduct-iron': 'paint',
  'waverley-tree-crowns': 'tree', 'waverley-wood-crowns': 'tree', 'perth-island-trees': 'tree',
  'perth-kinnoull-canopy': 'tree', 'perth-east-bank-trees': 'tree',
};
/** Where two classes stand clear of the ground in one cell, the one kept (the viaduct's paint over a road bridge's deck, ...). */
export const MIRROR_PRIORITY: readonly MirrorClass[] = ['paint', 'masonry', 'stone', 'tree', 'roof'];

/** The height map, `texel` m cells from (x0, z0), rows along z; heights are `datum` + byte x TAY_MIRROR.unit. Three kinds of thing:
 *  - the soft ground: the drape and the trees on it, whose top is read bilinear, so a bank or a crown rises smoothly, not in 2 m steps;
 *  - structures standing on the ground (a wall, a pier: their foot within TAY_MIRROR.stand m of it): a footprint, read as the half-way
 *    contour of their bilinear cover, so its outline is smooth and it stands straight up to its top, not ramping off over a cell (round
 *    15 review: the piers' images were short grey trapezoids);
 *  - one thing standing clear of the ground per cell (a girder, a roof over its walls): a footprint the same way, between a foot and a top.
 *  `heights` (RGBA, read bilinear): R the soft top, G the share of it that is trees (the tone leans from bank to tree with it), B the
 *  structures' cover, A the clear thing's cover. `classes` (RGBA, read nearest; each spread to the cell's eight neighbours, so the
 *  contour, which lies within half a cell of a covered cell, always finds them): R the structure's class + 8 x the clear thing's class
 *  (MIRROR_CLASSES; 0: none), G the structure's top, B and A the clear thing's foot and top. */
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
function rasterTriangle(map: Pick<MirrorMap, 'x0' | 'z0' | 'texel' | 'cols' | 'rows'>, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, at: (i: number, j: number, lo: number, hi: number) => void, slender = false): void {
  const T = map.texel, area = (b.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b.z - a.z);
  const x0 = Math.min(a.x, b.x, c.x), x1 = Math.max(a.x, b.x, c.x), z0 = Math.min(a.z, b.z, c.z), z1 = Math.max(a.z, b.z, c.z);
  if (x1 < map.x0 || z1 < map.z0 || x0 > map.x0 + map.cols * T || z0 > map.z0 + map.rows * T) return;
  if (Math.abs(area) < 1e-3 * Math.max(1e-6, (x1 - x0 + z1 - z0) ** 2) || Math.abs(area) < 1e-4) {
    // edge-on: the longest plan edge, sampled every half cell, at the face's full height
    const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y), pts = [a, b, c];
    let p = a, q = b, best = -1;
    for (let u = 0; u < 3; u++) for (let v = u + 1; v < 3; v++) { const d = Math.hypot(pts[u]!.x - pts[v]!.x, pts[u]!.z - pts[v]!.z); if (d > best) { best = d; p = pts[u]!; q = pts[v]!; } }
    // a slender member's face (a railing's bar or post) is skipped where asked: the mirror sees the sky between them
    if (slender && (best < TAY_MIRROR.slender[0] || hi - lo < TAY_MIRROR.slender[1])) return;
    const n = Math.max(1, Math.ceil(best / (T / 2)));
    let last = -1;
    for (let s = 0; s <= n; s++) {
      const x = p.x + (q.x - p.x) * s / n, z = p.z + (q.z - p.z) * s / n, i = Math.floor((x - map.x0) / T), j = Math.floor((z - map.z0) / T);
      if (i < 0 || j < 0 || i >= map.cols || j >= map.rows || j * map.cols + i === last) continue;
      last = j * map.cols + i; at(i, j, lo, hi);
    }
    return;
  }
  if (slender) {
    // the same for a face lying flat (a bar's or a post's top): its plan's narrowest width, twice its area over its longest side
    const ab = Math.hypot(b.x - a.x, b.z - a.z), bc = Math.hypot(c.x - b.x, c.z - b.z), ca = Math.hypot(a.x - c.x, a.z - c.z);
    if (Math.abs(area) / Math.max(ab, bc, ca) < TAY_MIRROR.slender[0]) return;
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
      : (i, j, l, h) => { const k = (j * cols + i) * C + rank; if (l < lo[k]!) lo[k] = l; if (h > hi[k]!) hi[k] = h; }, kind !== 'bank'));
  }
  const heights = new Uint8Array(n * 4), classes = new Uint8Array(n * 4), q = (y: number) => Math.max(0, Math.min(255, Math.round((y - datum) / M.unit)));
  const sTop = new Float32Array(n).fill(-Infinity), sCls = new Uint8Array(n), fLo = new Float32Array(n).fill(Infinity), fHi = new Float32Array(n).fill(-Infinity), fCls = new Uint8Array(n);
  const tree = MIRROR_PRIORITY.indexOf('tree'), floor = new Float32Array(n);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i, g = top[k]! > -Infinity ? top[k]! : ground(x0 + (i + .5) * T, z0 + (j + .5) * T);
    floor[k] = g;
    let soft = g, treed = false;
    for (let r = 0; r < C; r++) {
      const l = lo[k * C + r]!, h = hi[k * C + r]!; if (h === -Infinity) continue;
      if (l > g + M.stand) { if (!fCls[k]) { fCls[k] = MIRROR_CLASSES.indexOf(MIRROR_PRIORITY[r]!); fLo[k] = l; fHi[k] = h; } continue; }
      if (r === tree) { if (h > soft) { soft = h; treed = true; } }
      else if (h > sTop[k]!) { sTop[k] = h; sCls[k] = MIRROR_CLASSES.indexOf(MIRROR_PRIORITY[r]!); }
    }
    if (sTop[k]! <= soft) { sTop[k] = -Infinity; sCls[k] = 0; }
    heights[k * 4] = q(soft); heights[k * 4 + 1] = treed ? 255 : 0; heights[k * 4 + 2] = sCls[k] ? 255 : 0;
  }
  // the clear things' cover, from a `sub` x `sub` finer raster of their own faces (the parts standing clear of the ground), each mark
  // grown `widen` sub-cells: a girder 0.35 m thick then fills a strip about 1.5 m wide on its own line, not the 2 m cells its line
  // touches (round 16, C3: the deck's image ran 25-30 rows long under the far piers, its footprint snapped up to two cells toward the eye).
  // Each mark keeps the top of what made it (a byte, as the map's heights; 0: none), and a cell's clear top is the mean of its marks':
  // a cell holding a strip of girder and a run of walkway plate is mostly the plate, not wholly as tall as the girder
  const S = M.sub, sc = cols * S, sr = rows * S, fine = {x0, z0, texel: T / S, cols: sc, rows: sr};
  let grown = new Uint8Array(sc * sr);
  for (const {mesh, kind} of meshes) if (kind !== 'bank') eachTriangle(mesh, (a, b, c) => rasterTriangle(fine, a, b, c, (i, j, l, h) => {
    if (l > floor[Math.floor(j / S) * cols + Math.floor(i / S)]! + M.stand) grown[j * sc + i] = Math.max(grown[j * sc + i]!, 1, q(h));
  }, true));
  for (let g = 0; g < M.widen; g++) {
    const next = new Uint8Array(sc * sr);
    for (let j = 0; j < sr; j++) for (let i = 0; i < sc; i++) { const v = grown[j * sc + i]!; if (v) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < sc && b < sr && next[b * sc + a]! < v) next[b * sc + a] = v;
    } }
    grown = next;
  }
  const subTop = new Float32Array(n);
  for (let j = 0; j < sr; j++) for (let i = 0; i < sc; i++) { const v = grown[j * sc + i]!; if (v) { const k = Math.floor(j / S) * cols + Math.floor(i / S); heights[k * 4 + 3]! += 1; subTop[k]! += v; } }
  for (let k = 0; k < n; k++) { const m = heights[k * 4 + 3]!; if (m) subTop[k] = subTop[k]! / m; heights[k * 4 + 3] = Math.round(255 * m / (S * S)); }
  // each cell takes its neighbours' structure (the tallest) and clear thing (the first by MIRROR_PRIORITY), for the contour round them
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const own = j * cols + i, rank = (m: number) => MIRROR_PRIORITY.indexOf(MIRROR_CLASSES[fCls[m]!]!);
    let s = -1, f = fCls[own] ? own : -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= cols || b >= rows) continue; const m = b * cols + a;
      if (sCls[m] && (s < 0 || sTop[m]! > sTop[s]!)) s = m;
      if (fCls[m] && !fCls[own] && (f < 0 || rank(m) < rank(f))) f = m;
    }
    const k = (j * cols + i) * 4;
    classes[k] = (s >= 0 ? sCls[s]! : 0) + 8 * (f >= 0 ? fCls[f]! : 0);
    if (s >= 0) classes[k + 1] = q(sTop[s]!);
    if (f >= 0) { classes[k + 2] = q(fLo[f]!); classes[k + 3] = Math.max(classes[k + 2]!, subTop[own]! > 0 ? Math.round(subTop[own]!) : q(fHi[f]!)); }
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
export function mirrorAt(map: MirrorMap, p: readonly [number, number, number], eye: readonly [number, number, number], water: {ripple?: number; jitter?: number} = {}): {cover: number; tone: [number, number, number]; kind: MirrorClass; weight: number} {
  const M = TAY_MIRROR, dx = p[0] - eye[0], dz = p[2] - eye[2], D = Math.hypot(dx, dz), none = {cover: 0, tone: [0, 0, 0] as [number, number, number], kind: 'none' as MirrorClass, weight: 0};
  if (D < 1e-3 || eye[1] <= p[1] || D >= M.fade[1]) return none;
  const ux = dx / D, uz = dz / D;
  const along = (p[0] * ux + p[2] * uz) / M.grain, across = (p[0] * -uz + p[2] * ux) / (M.grain * M.stretch);
  const ripple = water.ripple ?? M.ripple, k = (eye[1] - p[1]) / D * (1 + (water.jitter ?? M.jitter) * (2 * mirrorNoise(along, across) - 1)), lowK = k * (1 - ripple), span = Math.max(1e-6, 2 * ripple * k);
  const top = map.datum + 255 * M.unit, tones = MIRROR_TONES_LINEAR, by: number[] = MIRROR_CLASSES.map(() => 0), tone: [number, number, number] = [0, 0, 0];
  const BANK = MIRROR_CLASSES.indexOf('bank'), TREE = MIRROR_CLASSES.indexOf('tree'), edge = (v: number) => smooth(.5 - M.edge, .5 + M.edge, v);
  let t = mirrorFirst(D), s = t - D, acc = 0;
  const take = (cls: number, f: number, shade = 1) => { by[cls]! += f; for (let c = 0; c < 3; c++) tone[c] += f * shade * tones[cls]![c]!; acc += f; };
  let inside = false, mid = -Infinity;
  for (let n = 0; n < M.steps && s <= M.reach && acc < .99; n++) {
    const yl = p[1] + lowK * s, w = span * s; if (yl > top) break;
    const qx = (p[0] + ux * s - map.x0) / map.texel, qz = (p[2] + uz * s - map.z0) / map.texel;
    if (qx >= 0 && qz >= 0 && qx < map.cols && qz < map.rows) {
      const c = (Math.floor(qz) * map.cols + Math.floor(qx)) * 4, cl = map.classes, sc = cl[c]! % 8, fc = cl[c]! >> 3;
      // the soft ground and the structures stop the fan from below, whichever stands taller here
      const fs = Math.max(0, Math.min(1, (mirrorHeights(map, qx, qz) - yl) / w));
      const fh = sc ? edge(mirrorChannel(map, qx, qz, 2)) * Math.max(0, Math.min(1, (map.datum + cl[c + 1]! * M.unit - yl) / w)) : 0;
      const f = Math.max(fs, fh);
      if (f > acc) { if (fh >= fs) take(sc, f - acc); else { const tr = mirrorChannel(map, qx, qz, 1), g = f - acc; take(BANK, g * (1 - tr)); take(TREE, g * tr); } }
      // the thing clear of the ground takes its own slice of the fan, inside its footprint's contour; the slice it shows where the fan
      // (met from below: the fan was already over its footprint, and under its foot, one step back) is its underside, in its own shade
      let now = false;
      if (fc) {
        const lo = map.datum + cl[c + 2]! * M.unit, hi = map.datum + cl[c + 3]! * M.unit, e = edge(mirrorChannel(map, qx, qz, 3)), o = e * Math.max(0, Math.min(1, (Math.min(hi, yl + w) - Math.max(lo, yl)) / w));
        if (o > 0) take(fc, o * (1 - acc), inside && mid < lo ? M.under : 1);
        now = e >= .5;
      }
      inside = now; mid = yl + w / 2;
    } else inside = false;
    t += Math.max(M.step, t * M.grow); s = t - D;
  }
  if (acc <= 0) return none;
  const best = by.indexOf(Math.max(...by));
  const glint = 1 - M.glint[2] * smooth(M.glint[0], M.glint[1], mirrorNoise(D / M.glintRing, M.glintArc * Math.atan2(-dz, -dx)));
  return {cover: Math.min(1, acc), tone: [tone[0] / acc, tone[1] / acc, tone[2] / acc], kind: MIRROR_CLASSES[best]!, weight: Math.min(1, acc) * mirrorWeight(k, D) * glint};
}
/** The soft top (m) at cell coordinates (qx, qz), read bilinear between cell centres and clamped at the edge, as the GPU's linear
 *  filter reads it. */
export function mirrorHeights(map: MirrorMap, qx: number, qz: number): number {
  return map.datum + mirrorChannel(map, qx, qz, 0) * 255 * TAY_MIRROR.unit;
}
/** Channel `ch` of the heights texture at cell coordinates (qx, qz), 0 to 1, read as the GPU's linear filter reads it. */
export function mirrorChannel(map: MirrorMap, qx: number, qz: number, ch: number): number {
  const u = Math.max(0, Math.min(map.cols - 1, qx - .5)), v = Math.max(0, Math.min(map.rows - 1, qz - .5));
  const i = Math.min(map.cols - 2, Math.floor(u)), j = Math.min(map.rows - 2, Math.floor(v)), fu = u - i, fv = v - j, d = map.heights;
  const a = d[(j * map.cols + i) * 4 + ch]!, b = d[(j * map.cols + i + 1) * 4 + ch]!, c = d[((j + 1) * map.cols + i) * 4 + ch]!, e = d[((j + 1) * map.cols + i + 1) * 4 + ch]!;
  return ((a * (1 - fu) + b * fu) * (1 - fv) + (c * (1 - fu) + e * fu) * fv) / 255;
}
const smooth = (a: number, b: number, v: number) => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
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
  return Math.min(M.hold, M.strength * fresnel(k) / fresnel(M.fRef)) * fade;
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
  float s = t - D, acc = 0.0, mid = -1e9; vec3 tone = vec3(0.0); bool inside = false;
  for (int n = 0; n < ${M.steps}; n++) {
    if (s > ${f(M.reach)} || acc >= 0.99) break;
    float yl = p.y + lowK * s, w = span * s; if (yl > ${f(map.datum + 255 * M.unit)}) break;
    vec2 q = (p.xz + u * s - vec2(${f(map.x0)}, ${f(map.z0)})) / ${f(map.texel)};
    if (q.x >= 0.0 && q.y >= 0.0 && q.x < ${f(map.cols)} && q.y < ${f(map.rows)}) {
      vec4 h = texture2D(perthMirror, q / vec2(${f(map.cols)}, ${f(map.rows)}));
      vec4 c = floor(texture2D(perthMirrorClass, (floor(q) + 0.5) / vec2(${f(map.cols)}, ${f(map.rows)})) * 255.0 + 0.5);
      float sc = mod(c.r, 8.0), fc = floor(c.r / 8.0);
      // the soft ground and the structures stop the fan from below, whichever stands taller here
      float fs = clamp((${f(map.datum)} + h.r * ${f(255 * M.unit)} - yl) / w, 0.0, 1.0);
      float fh = sc > 0.5 ? smoothstep(${f(.5 - M.edge)}, ${f(.5 + M.edge)}, h.b) * clamp((${f(map.datum)} + c.g * ${f(M.unit)} - yl) / w, 0.0, 1.0) : 0.0;
      float fm = max(fs, fh);
      if (fm > acc) { tone += (fm - acc) * (fh >= fs ? perthMirrorTone(sc) : mix(perthMirrorTone(1.0), perthMirrorTone(2.0), h.g)); acc = fm; }
      // the thing clear of the ground takes its own slice of the fan, inside its footprint's contour; the slice it shows where the fan
      // (met from below: over its footprint and under its foot one step back) is its underside, in its own shade
      bool now = false;
      if (fc > 0.5) {
        float lo = ${f(map.datum)} + c.b * ${f(M.unit)}, hi = ${f(map.datum)} + c.a * ${f(M.unit)};
        float e = smoothstep(${f(.5 - M.edge)}, ${f(.5 + M.edge)}, h.a), o = e * clamp((min(hi, yl + w) - max(lo, yl)) / w, 0.0, 1.0);
        if (o > 0.0) { tone += o * (1.0 - acc) * perthMirrorTone(fc) * (inside && mid < lo ? ${f(M.under)} : 1.0); acc += o * (1.0 - acc); }
        now = e >= 0.5;
      }
      inside = now; mid = yl + w * 0.5;
    } else inside = false;
    t += max(${f(M.step)}, t * ${f(M.grow)}); s = t - D;
  }
  if (acc <= 0.0) return vec4(0.0);
  float fade = 1.0 - smoothstep(${f(M.fade[0])}, ${f(M.fade[1])}, D);
  float glint = 1.0 - ${f(M.glint[2])} * smoothstep(${f(M.glint[0])}, ${f(M.glint[1])}, mirrorNoise(vec2(${f(1 / M.glintRing)} * D, ${f(M.glintArc)} * atan(-d.y, -d.x))));
  return vec4(tone / acc, min(1.0, acc) * min(${f(M.hold)}, ${f(M.strength)} * mirrorFresnel(k) / mirrorFresnel(${f(M.fRef)})) * fade * glint);
}`;
}

/** Put the mirror on the Tay's (graded) Phong material: its finished colour (lit and tone-mapped, before the output encoding and the fog) leans to the mirrored tone. */
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
    // the mirrored tone is what the thing looks like on screen (linear, after the tone map), so it is laid over the sheet's own finished
    // colour, not lit again as the sheet's paint (round 15 review: the deck's paint, lit a second time, read as a white mass)
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${glsl}`)
      .replace('#include <colorspace_fragment>', `{ vec4 mirrored = perthMirrorAt(vMirrorPos, vMirrorEye); gl_FragColor.rgb = mix(gl_FragColor.rgb, mirrored.rgb, mirrored.a); }
  #include <colorspace_fragment>`);
  };
  m.customProgramCacheKey = () => `${key.call(m)}-mirror-${map.cols}x${map.rows}-${JSON.stringify(TAY_MIRROR)}`;
  return [tex, more];
}
