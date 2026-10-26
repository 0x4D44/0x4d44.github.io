// Terrain height field (A2). Data: data/terrain.json {minX,maxX,minZ,maxZ,cell,nx,nz,heights[nz][nx]} metres OD, row 0 = minZ.
// World frame: +X east, -Z north (see geo.js). Water carved into the field; the Clyde surface is WATER_Y.
export const WATER_Y = 3.0;
let T = null;
export async function loadTerrain(url = new URL('../../data/terrain.json', import.meta.url).href) {
  const j = await (await fetch(url)).json();
  const nx = j.nx, nz = j.nz, h = new Float32Array(nx * nz);
  for (let r = 0; r < nz; r++) { const row = j.heights[r]; for (let c = 0; c < nx; c++) h[r * nx + c] = row[c]; }
  T = { minX: j.minX, maxX: j.maxX, minZ: j.minZ, maxZ: j.maxZ, cell: j.cell, nx, nz, h };
  return T;
}
export function terrainInfo() { return T; }
// Bilinear ground height at world (x,z); clamps to the grid edge. Returns 0 until loadTerrain() resolves.
export function groundHeight(x, z) {
  if (!T) return 0;
  let u = (x - T.minX) / T.cell, v = (z - T.minZ) / T.cell;
  u = u < 0 ? 0 : u > T.nx - 1.001 ? T.nx - 1.001 : u; v = v < 0 ? 0 : v > T.nz - 1.001 ? T.nz - 1.001 : v;
  const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, k = j * T.nx + i, h = T.h;
  return (h[k] * (1 - fu) + h[k + 1] * fu) * (1 - fv) + (h[k + T.nx] * (1 - fu) + h[k + T.nx + 1] * fu) * fv;
}
