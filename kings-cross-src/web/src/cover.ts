// Roofs keep the weather off. Rain and snow stop at a roof and the ground under it stays dry and bare. The roofs are not described a
// second time here: the map is drawn from the roof meshes themselves (the shed's vaults and aisle roofs, the concourse's glass and
// panels, the platform canopies, the landmarks' roofs), so a change to a roof changes where the weather stops.
//
// The map is a top-down height field of those meshes: one byte per cell, the height of the highest roof over it (0: open sky). The GPU
// reads it with one texture fetch (`coverAt` below) in the drops' vertex shaders; the CPU reads the same bytes the same way (`coverAt` in
// TypeScript), which is what the tests hold the roofs to. A drop is under a roof or it is not, so the drops read the cells as they are.
//
// The ground is read differently. Its wet and its snow must stop at a roof's edge, and a cell is half a metre, so read as they are the
// cells would draw that edge as a row of steps: a saw along every canopy. The ground reads a second texture, the roofed cells blurred
// (`soft`), through the GPU's own bilinear filter, so the edge is a soft line about a metre wide, as straight as the roof's.
import * as THREE from 'three';

/** The drawn roofs, by mesh name: what the cover map is made of. A renamed or missing roof is a roof the rain falls through, so a test holds these to the real builders. */
export const ROOF_MESHES: readonly string[] = [
  'shed-roof-cladding', 'shed-roof-glass', 'shed-aisle-roofs', // web/src/shed.ts: the slate flanks and glazed crown of both vaults, the two flat aisle roofs
  'concourse-glass', 'concourse-panels', // web/src/concourse.ts: the Western Concourse's dome
  'canopy-glass', // web/src/furniture.ts: the canopies over platforms 9 and 10
  'landmarks-roofGlass', 'landmarks-slate', // web/src/landmarks.ts: the Barlow shed's roof (and the hotels' slate, which cover only their own, solid, footprints)
];

/** Metres across one cell of the map. */
export const COVER_CELL = 0.5;
/** Metres of roof height in one step of a cell's byte: roofs up to 38 m are held exactly (the shed's crown is 22 m); a higher one counts as 38 m. */
export const COVER_STEP = 0.15;
/** The most cells a map has; a bigger area gets bigger cells. */
export const COVER_MAX_CELLS = 1_000_000;
/** A drop or a wet patch this far below a roof, or deeper, is wholly under it; it comes out from under it over this last stretch (so a drop fades as it reaches the roof). */
export const COVER_DEEP = 0.6;
export const COVER_SHALLOW = 0.05;
/** The blur that makes the soft map from the roofed cells, one way and then the other (the weights of a binomial; they are over their sum, 16). At 0.5 m a cell it makes an edge about a metre wide. */
export const COVER_BLUR: readonly number[] = [1, 4, 6, 4, 1];

export interface CoverMap {
  /** the map's lowest x and z, metres (world) */
  x0: number;
  z0: number;
  /** metres across one cell, and how many cells across (x) and down (z) */
  cell: number;
  nx: number;
  nz: number;
  /** metres of roof height in one step of a byte */
  step: number;
  /** nz rows of nx bytes, row j at z = z0 + j * cell: the height of the highest roof over the cell, in steps; 0 where there is none */
  heights: Uint8Array;
  /** the same cells: how much of the ground there is roofed over, 255 well under a roof, 0 well clear of one, about 128 at its edge (the roofed cells blurred by `COVER_BLUR`) */
  soft: Uint8Array;
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

/** The roof meshes under `root`, found by name. */
export function findRoofs(root: THREE.Object3D): THREE.Mesh[] {
  const names = new Set(ROOF_MESHES);
  const found: THREE.Mesh[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh && names.has(mesh.name)) found.push(mesh);
  });
  return found;
}

/** A mesh's triangles in world coordinates: `xyz` triples and the corner indices of each triangle. */
function worldTriangles(mesh: THREE.Mesh): { xyz: Float64Array; corners: ArrayLike<number> } | null {
  const position = mesh.geometry.getAttribute('position');
  if (!position) return null;
  const m = mesh.matrixWorld.elements;
  const xyz = new Float64Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    xyz[3 * i] = m[0]! * x + m[4]! * y + m[8]! * z + m[12]!;
    xyz[3 * i + 1] = m[1]! * x + m[5]! * y + m[9]! * z + m[13]!;
    xyz[3 * i + 2] = m[2]! * x + m[6]! * y + m[10]! * z + m[14]!;
  }
  const index = mesh.geometry.getIndex();
  const corners = index ? index.array : Uint32Array.from({ length: position.count }, (_, i) => i);
  return { xyz, corners };
}

/**
 * Draw the cover map of `roofs` (default: the roofs found under `root`). Null when there are none. Walls count for nothing (a
 * triangle that stands on edge has no area in plan); where roofs overlap the highest wins.
 */
export function buildCoverMap(root: THREE.Object3D, roofs: readonly THREE.Mesh[] = findRoofs(root)): CoverMap | null {
  root.updateMatrixWorld(true);
  const meshes = roofs.map(worldTriangles).filter((t): t is NonNullable<typeof t> => t !== null && t.corners.length >= 3);
  if (meshes.length === 0) return null;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const { xyz } of meshes) {
    for (let i = 0; i < xyz.length; i += 3) {
      const x = xyz[i] as number, z = xyz[i + 2] as number;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minZ)) return null;
  let cell = COVER_CELL;
  const cells = (c: number): number => Math.ceil((maxX - minX + 2) / c) * Math.ceil((maxZ - minZ + 2) / c);
  while (cells(cell) > COVER_MAX_CELLS) cell += COVER_CELL / 2;
  const x0 = minX - 1, z0 = minZ - 1;
  const nx = Math.ceil((maxX - minX + 2) / cell), nz = Math.ceil((maxZ - minZ + 2) / cell);
  const heights = new Uint8Array(nx * nz);
  const step = COVER_STEP;

  const fill = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): void => {
    const det = (bx - ax) * (cz - az) - (cx - ax) * (bz - az);
    if (Math.abs(det) < 1e-9) return;
    const dydx = ((by - ay) * (cz - az) - (cy - ay) * (bz - az)) / det;
    const dydz = ((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / det;
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - z0) / cell - 0.5));
    const j1 = Math.min(nz - 1, Math.floor((Math.max(az, bz, cz) - z0) / cell - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = z0 + (j + 0.5) * cell;
      let lo = Infinity, hi = -Infinity;
      const edge = (px: number, pz: number, qx: number, qz: number): void => {
        if (pz === qz || (z < Math.min(pz, qz)) || (z > Math.max(pz, qz))) return;
        const x = px + ((z - pz) / (qz - pz)) * (qx - px);
        if (x < lo) lo = x;
        if (x > hi) hi = x;
      };
      edge(ax, az, bx, bz);
      edge(bx, bz, cx, cz);
      edge(cx, cz, ax, az);
      if (hi < lo) continue;
      const i0 = Math.max(0, Math.ceil((lo - x0) / cell - 0.5 - 1e-9));
      const i1 = Math.min(nx - 1, Math.floor((hi - x0) / cell - 0.5 + 1e-9));
      for (let i = i0; i <= i1; i++) {
        const y = ay + dydx * (x0 + (i + 0.5) * cell - ax) + dydz * (z - az);
        const h = Math.min(255, Math.round(y / step));
        if (h > (heights[j * nx + i] as number)) heights[j * nx + i] = h;
      }
    }
  };
  for (const { xyz, corners } of meshes) {
    const at = (c: number): [number, number, number] => [xyz[3 * c] as number, xyz[3 * c + 1] as number, xyz[3 * c + 2] as number];
    for (let t = 0; t + 2 < corners.length; t += 3) {
      const a = at(corners[t] as number), b = at(corners[t + 1] as number), c = at(corners[t + 2] as number);
      fill(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    }
  }
  return { x0, z0, cell, nx, nz, step, heights, soft: blurRoofed(heights, nx, nz) };
}

/** The roofed cells (any height above 0) as 0 or 1, blurred by `COVER_BLUR` along each row and then down each column, scaled to a byte. Past the map's edge there is no roof. */
function blurRoofed(heights: Uint8Array, nx: number, nz: number): Uint8Array {
  const r = (COVER_BLUR.length - 1) / 2, total = COVER_BLUR.reduce((a, b) => a + b, 0);
  const across = new Uint8Array(nx * nz); // each row blurred: 0..total
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) if (i + d >= 0 && i + d < nx && heights[j * nx + i + d]) sum += COVER_BLUR[d + r] as number;
      across[j * nx + i] = sum;
    }
  }
  const soft = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      let sum = 0;
      for (let d = -r; d <= r; d++) if (j + d >= 0 && j + d < nz) sum += (COVER_BLUR[d + r] as number) * (across[(j + d) * nx + i] as number);
      soft[j * nx + i] = Math.round((sum * 255) / (total * total));
    }
  }
  return soft;
}

/** The height of the roof over the point (x, z), metres; 0 where the sky is open. The cell the point is in, as the GPU's nearest-texel read finds it. */
export function coverHeightAt(map: CoverMap, x: number, z: number): number {
  const i = Math.floor((x - map.x0) / map.cell);
  const j = Math.floor((z - map.z0) / map.cell);
  if (i < 0 || j < 0 || i >= map.nx || j >= map.nz) return 0;
  return (map.heights[j * map.nx + i] as number) * map.step;
}

/** How far under a roof the point (x, y, z) is: 1 wholly under it, 0 in the open or above the roof it is over (rain falls on that). */
export function coverAt(map: CoverMap | null, x: number, y: number, z: number): number {
  if (!map) return 0;
  const roof = coverHeightAt(map, x, z);
  return roof > 0 ? 1 - smoothstep(roof - COVER_DEEP, roof - COVER_SHALLOW, y) : 0;
}

/** The share of rain and snow that reaches the point: all of it in the open, none under a roof. What the drops' shaders multiply by. */
export const openShare = (map: CoverMap | null, x: number, y: number, z: number): number => 1 - coverAt(map, x, y, z);

/** The soft map at the point (x, z), 0 to 1, read as the GPU's bilinear filter reads it: between the centres of the four cells round the point, the edge cells held to the edge. 0 outside the map. */
export function coverSoftAt(map: CoverMap | null, x: number, z: number): number {
  if (!map) return 0;
  const u = (x - map.x0) / map.cell, v = (z - map.z0) / map.cell;
  if (u < 0 || v < 0 || u >= map.nx || v >= map.nz) return 0;
  const sx = u - 0.5, sz = v - 0.5, i = Math.floor(sx), j = Math.floor(sz), fx = sx - i, fz = sz - j;
  const cell = (ci: number, cj: number): number => (map.soft[Math.min(map.nz - 1, Math.max(0, cj)) * map.nx + Math.min(map.nx - 1, Math.max(0, ci))] as number) / 255;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t; // exact where the cells agree
  return lerp(lerp(cell(i, j), cell(i + 1, j), fx), lerp(cell(i, j + 1), cell(i + 1, j + 1), fx), fz);
}

/**
 * How far under a roof the ground at the point (x, y, z) is: the soft map, so the edge of a roof is a soft line and not a row of steps. 0 where a
 * surface is above the roof it is over (a surface on a roof is in the rain), whatever the map says of the ground below.
 */
export function groundCoverAt(map: CoverMap | null, x: number, y: number, z: number): number {
  if (!map) return 0;
  const i = Math.floor((x - map.x0) / map.cell), j = Math.floor((z - map.z0) / map.cell);
  if (i < 0 || j < 0 || i >= map.nx || j >= map.nz) return 0;
  const roof = (map.heights[j * map.nx + i] as number) * map.step;
  const over = roof > 0 ? smoothstep(roof - COVER_DEEP, roof - COVER_SHALLOW, y) : 0;
  return coverSoftAt(map, x, z) * (1 - over);
}

/** The share of wetness and lying snow that reaches the ground at the point: all of it in the open, none well under a roof, and a share between across a roof's edge. What the wet ground's shader multiplies by. */
export const groundOpenShare = (map: CoverMap | null, x: number, y: number, z: number): number => 1 - groundCoverAt(map, x, y, z);

/**
 * GLSL for the same reads: the uniforms (shared by every shader that needs them, see `coverUniforms`), `coverAt(p)` for a drop, 0 in the open to
 * 1 under a roof, and `coverGroundAt(p)` for the ground, the same with a soft edge.
 */
export const COVER_GLSL = /* glsl */`
uniform sampler2D uCoverMap; // nearest: the height of the highest roof over each cell, in steps (0: open sky)
uniform sampler2D uCoverSoft; // linear: the same cells, how much of the ground there is roofed over
uniform vec4 uCoverRect; // the map's lowest x and z, and one over its width and depth in metres; zero when there is no map
uniform float uCoverScale; // metres of roof height in one step of a byte
float coverAt(vec3 p) {
  if (uCoverRect.z <= 0.0) return 0.0;
  vec2 uv = (p.xz - uCoverRect.xy) * uCoverRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  float roof = texture2D(uCoverMap, uv).r * 255.0 * uCoverScale;
  return roof > 0.0 ? 1.0 - smoothstep(roof - ${COVER_DEEP.toFixed(2)}, roof - ${COVER_SHALLOW.toFixed(2)}, p.y) : 0.0;
}
float coverGroundAt(vec3 p) {
  if (uCoverRect.z <= 0.0) return 0.0;
  vec2 uv = (p.xz - uCoverRect.xy) * uCoverRect.zw;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x >= 1.0 || uv.y >= 1.0) return 0.0;
  float roof = texture2D(uCoverMap, uv).r * 255.0 * uCoverScale;
  float over = roof > 0.0 ? smoothstep(roof - ${COVER_DEEP.toFixed(2)}, roof - ${COVER_SHALLOW.toFixed(2)}, p.y) : 0.0;
  return texture2D(uCoverSoft, uv).r * (1.0 - over);
}
`;

function byteTexture(data: Uint8Array, width: number, height: number, filter: THREE.MagnificationTextureFilter): THREE.DataTexture {
  const texture = new THREE.DataTexture(data, width, height, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = filter;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1; // a row of bytes is as wide as the map, not a multiple of four
  texture.needsUpdate = true;
  return texture;
}

const emptyHeights = byteTexture(new Uint8Array(1), 1, 1, THREE.NearestFilter);
const emptySoft = byteTexture(new Uint8Array(1), 1, 1, THREE.LinearFilter);

/** What every shader that reads the cover shares: one map, so one set of uniform objects. With no map `uCoverRect.z` is 0 and the reads are 0 everywhere. */
export const coverUniforms = {
  uCoverMap: { value: emptyHeights as THREE.Texture },
  uCoverSoft: { value: emptySoft as THREE.Texture },
  uCoverRect: { value: new THREE.Vector4(0, 0, 0, 0) },
  uCoverScale: { value: COVER_STEP },
};

/** Show the shaders this map (or none): the roofs they stop the weather at. */
export function applyCover(map: CoverMap | null): void {
  const before = [coverUniforms.uCoverMap.value, coverUniforms.uCoverSoft.value];
  if (map) {
    coverUniforms.uCoverMap.value = byteTexture(map.heights, map.nx, map.nz, THREE.NearestFilter); // heights are looked up, never blended
    coverUniforms.uCoverSoft.value = byteTexture(map.soft, map.nx, map.nz, THREE.LinearFilter); // the ground's edge is blended: that is what the soft map is for
    coverUniforms.uCoverRect.value.set(map.x0, map.z0, 1 / (map.nx * map.cell), 1 / (map.nz * map.cell));
    coverUniforms.uCoverScale.value = map.step;
  } else {
    coverUniforms.uCoverMap.value = emptyHeights;
    coverUniforms.uCoverSoft.value = emptySoft;
    coverUniforms.uCoverRect.value.set(0, 0, 0, 0);
    coverUniforms.uCoverScale.value = COVER_STEP;
  }
  for (const texture of before) if (texture !== emptyHeights && texture !== emptySoft) texture.dispose();
}
