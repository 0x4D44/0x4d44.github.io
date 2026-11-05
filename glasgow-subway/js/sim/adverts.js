/**
 * Platform-wall adverts. The hall GLBs bake a low-resolution placeholder atlas into the 'advert_atlas' material, and every
 * hall shows the same eight cells. At hall load this swaps in one shared 2048^2 atlas of 16 posters (models/adverts.jpg,
 * packed by tools/build_adverts.py) and re-points each poster quad at a cell, shuffled per station: a hall's dozen
 * posters never repeat, and the next station shows a different mix.
 */
import { quadGroups } from './hall.js';

export const ADVERT_GRID = 4;
export const ADVERT_CELLS = ADVERT_GRID * ADVERT_GRID;
const CELL_INSET = 8 / 2048;   // the atlas keeps an 8 px gutter round each poster (tools/build_adverts.py:GUTTER)

/** Loads the shared atlas (glTF UV convention: origin top-left, no flip). Never disposed with a hall (userData.shared). */
export function loadAdvertAtlas(THREE, url) {
  return new THREE.TextureLoader().loadAsync(url).then((t) => {
    t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.userData.shared = true;
    return t;
  });
}

/** Deterministic per-station order of the 16 cells (string-seeded Fisher-Yates). */
export function advertOrder(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const o = [...Array(ADVERT_CELLS).keys()];
  for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; }
  return o;
}

/**
 * Re-points one geometry's poster quads at atlas cells: the k-th quad (sorted by wall side, then along the hall) gets
 * order[k % 16]. Each quad's own UV orientation is kept (the generator reverses U on these signs). Returns quads mapped.
 */
export function mapAdvertQuads(geo, order) {
  const pos = geo.attributes.position, uv = geo.attributes.uv; if (!pos || !uv) return 0;
  const quads = quadGroups(geo).map((vs) => {
    let x = 0, z = 0; for (const i of vs) { x += pos.getX(i); z += pos.getZ(i); }
    return { vs, side: Math.sign(x), z: z / vs.length };
  }).sort((a, b) => a.side - b.side || a.z - b.z);
  const w = 1 / ADVERT_GRID;
  quads.forEach((q, k) => {
    const cell = order[k % order.length], u0 = (cell % ADVERT_GRID) * w + CELL_INSET, v0 = Math.floor(cell / ADVERT_GRID) * w + CELL_INSET, span = w - 2 * CELL_INSET;
    let umin = 1e9, umax = -1e9, vmin = 1e9, vmax = -1e9;
    for (const i of q.vs) { const u = uv.getX(i), v = uv.getY(i); umin = Math.min(umin, u); umax = Math.max(umax, u); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
    const du = umax - umin || 1, dv = vmax - vmin || 1;
    for (const i of q.vs) uv.setXY(i, u0 + (uv.getX(i) - umin) / du * span, v0 + (uv.getY(i) - vmin) / dv * span);
  });
  uv.needsUpdate = true;
  return quads.length;
}

/** Swaps the shared atlas into a loaded hall template and gives its posters this station's mix. Returns quads mapped. */
export function applyAdverts(tpl, atlas, stationId) {
  if (!tpl || !atlas || tpl.userData.advertsApplied) return 0; tpl.userData.advertsApplied = true;
  const order = advertOrder(String(stationId)); let n = 0;
  tpl.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.material || Array.isArray(m.material) || m.material.name !== 'advert_atlas') return;
    const mat = m.material;
    for (const k of ['map', 'emissiveMap']) {   // the posters glow a little with their own texture (assets_lib.py PALETTE['advert_atlas'] em='tex'): swap both or the old art ghosts through
      if (!mat[k] || mat[k] === atlas) continue; mat[k].dispose(); mat[k] = atlas; mat.needsUpdate = true;
    }
    n += mapAdvertQuads(m.geometry, order);
  });
  return n;
}
