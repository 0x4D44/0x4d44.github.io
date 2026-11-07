/**
 * Station adverts. The hall GLBs bake a low-resolution placeholder atlas into the 'advert_atlas' material, and every
 * hall shows the same eight cells. At hall load this swaps in one shared 2048^2 atlas of 16 portrait posters
 * (models/adverts.jpg, packed by tools/build_adverts.py) and re-points each poster quad at a cell, shuffled per station.
 *
 * Track walls (a wall with a track, not a platform, in front of it) then get cross-track adverts instead of the baked
 * portraits: a flat wall carries a dense framed row (mostly portrait, a landscape every few frames), a coved wall a spaced
 * run of landscape billboards (models/adverts_land.jpg) bent to the measured wall-and-vault profile. Two gaps per track
 * wall are left for the station's "Did you know?" panels (stationview.js looks for free wall the same way).
 */
import { quadGroups, hallPosterZone, hallWallClutter, measureHallWalls } from './hall.js';

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

export const LAND_POSTERS = 16;   // posters in the landscape atlas: all 16 cells are distinct (12 originals + 4 Daily Flange)

/** Deterministic per-station order of n cells (string-seeded Fisher-Yates). */
export function advertOrder(seed, n = ADVERT_CELLS) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const o = [...Array(n).keys()];
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

/** Hall sides (-1 left, +1 right) whose wall has a track in front of it rather than a platform: where cross-track adverts go. */
export function trackWalls(info) {
  const hw = (info && info.hallHalfWidth) || [4.25, 4.25], out = [];
  for (const s of [-1, 1]) {
    const W = s < 0 ? hw[0] : hw[1];
    const platformAtWall = ((info && info.platforms) || []).some(([a, b]) => (s < 0 ? Math.min(a, b) <= -W + 0.5 : Math.max(a, b) >= W - 0.5));
    if (!platformAtWall) out.push(s);
  }
  return out;
}

/**
 * Fills the free wall intervals (sorted [z0, z1]) with frames, cycling through `pattern` (entries {kind, w}); a frame that
 * does not fit falls back to the narrowest kind before the interval is given up. Each interval's run is centred in it.
 * Returns [{kind, z0, z1}].
 */
export function planRow(free, pattern, gap) {
  const out = [], narrow = pattern.reduce((a, b) => (b.w < a.w ? b : a)); let k = 0;
  for (const [a, b] of free) {
    const run = []; let z = a;
    for (;;) {
      let it = pattern[k % pattern.length];
      if (z + it.w > b) { if (z + narrow.w > b) break; it = narrow; }
      run.push({ kind: it.kind, z0: z, z1: z + it.w }); z += it.w + gap; k++;
    }
    if (!run.length) continue;
    const shift = (b - run[run.length - 1].z1) / 2;
    for (const r of run) out.push({ kind: r.kind, z0: r.z0 + shift, z1: r.z1 + shift });
  }
  return out;
}

/** Complement of the merged `taken` intervals inside [lo, hi], keeping `margin` clear of each, dropping pieces under minW. */
export function freeIntervals(taken, lo, hi, margin, minW) {
  const out = []; let a = lo;
  for (const [s0, e0] of [...taken].sort((p, q) => p[0] - q[0])) { if (s0 - margin - a >= minW) out.push([a, s0 - margin]); a = Math.max(a, e0 + margin); }
  if (hi - a >= minW) out.push([a, hi]);
  return out;
}

/**
 * The wall's cross-section on one side, measured on the loaded shell from y0 upward: [{x, y, s}] with x = |wall x| and s
 * the arc length from y0. Stops where the vault leans more than `maxLean` from vertical (a poster would face the floor).
 */
export function wallProfile(tpl, side, y0, rise = 2.4, step = 0.08, maxLean = 0.9) {
  const pts = [];
  for (let y = y0; y <= y0 + rise + 1e-6; y += step) {
    const m = measureHallWalls(tpl, y); if (!m) break;
    const x = side < 0 ? -m.l : m.r, p = pts[pts.length - 1];
    if (p) { const dx = p.x - x, dy = y - p.y; if (Math.atan2(Math.abs(dx), dy) > maxLean) break; pts.push({ x, y, s: p.s + Math.hypot(dx, dy) }); }
    else pts.push({ x, y, s: 0 });
  }
  return pts;
}

/** Point on the profile at arc length s (below the profile: straight down from its foot; above: clamped). */
function profileAt(pts, s) {
  if (s <= 0) return { x: pts[0].x, y: pts[0].y + s };
  for (let i = 1; i < pts.length; i++) if (pts[i].s >= s) { const a = pts[i - 1], b = pts[i], t = (s - a.s) / (b.s - a.s || 1); return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }
  const l = pts[pts.length - 1]; return { x: l.x, y: l.y };
}

/**
 * Appends one sheet bent to the profile: z0..z1 along the hall, arc length s0..s1 up the wall, `inset` metres in from the
 * wall surface. uvRect = [u0, v0, u1, v1] (v0 = top edge, glTF convention); omit it for an untextured frame. Text reads
 * left-to-right for a viewer facing the wall.
 */
function addSheet(buf, pts, side, z0, z1, s0, s1, inset, uvRect) {
  const ss = [s0, ...pts.map((p) => p.s).filter((s) => s > s0 + 0.01 && s < s1 - 0.01), s1], base = buf.pos.length / 3;
  for (const s of ss) {
    const p = profileAt(pts, s);
    for (const z of [z0, z1]) {
      buf.pos.push(side * (p.x - inset), p.y, z);
      if (uvRect) { const [u0, v0, u1, v1] = uvRect, fu = side > 0 ? (z - z0) / (z1 - z0) : (z1 - z) / (z1 - z0); buf.uv.push(u0 + (u1 - u0) * fu, v1 + (v0 - v1) * ((s - s0) / (s1 - s0))); }
      else buf.uv.push(0, 0);
    }
  }
  for (let r = 0; r < ss.length - 1; r++) { const a = base + r * 2; buf.idx.push(a, a + 1, a + 3, a, a + 3, a + 2); }
}

/** UV rectangle [u0, v0, u1, v1] of an atlas cell, inside its gutter (v0 = top edge) */
export const cellRect = (cell) => { const w = 1 / ADVERT_GRID, u0 = (cell % ADVERT_GRID) * w + CELL_INSET, v0 = Math.floor(cell / ADVERT_GRID) * w + CELL_INSET; return [u0, v0, u0 + w - 2 * CELL_INSET, v0 + w - 2 * CELL_INSET]; };

/** Removes the triangles of the given vertex groups from an indexed geometry. */
function dropQuads(THREE, geo, groups) {
  if (!groups.length || !geo.index) return;
  const gone = new Set(groups.flat()), idx = geo.index, keep = [];
  for (let t = 0; t < idx.count; t += 3) { const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2); if (!gone.has(a)) keep.push(a, b, c); }
  geo.setIndex(new THREE.BufferAttribute(geo.attributes.position.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  geo.computeBoundingBox(); geo.computeBoundingSphere();
}

export const INFO_GAPS = [-7, 7], INFO_GAP_W = 3.0, ROW_HALF = 20.5;

/**
 * Cross-track adverts for a loaded hall template (in place, once). Drops the baked portrait quads standing on a track wall
 * or over a mural, then builds the new frames under 'hall_signs' so the info-panel placement sees them as taken wall.
 * atlases = { portrait, landscape } (either may be null). Returns { walls, frames, dropped }.
 */
export function trackWallAdverts(THREE, tpl, info, atlases, stationId) {
  const res = { walls: 0, frames: 0, dropped: 0 };
  if (!tpl || !info || !atlases || tpl.userData.trackAdverts) return res; tpl.userData.trackAdverts = true;
  const signs = tpl.getObjectByName('hall_signs'), wallX = tpl.userData.wallX; if (!signs || !wallX) return res;
  tpl.updateMatrixWorld(true);
  const sides = trackWalls(info), zone = hallPosterZone(info), coved = !!info.coved;
  // 1. baked portrait quads: drop those on a track wall, and those overlapping a mural on a platform wall (ALM-BUG-FLU-00010)
  const art = { [-1]: hallWallClutter(tpl, -1, -wallX.l, zone.y0, zone.y1, 0.35, ['hall_art']), [1]: hallWallClutter(tpl, 1, wallX.r, zone.y0, zone.y1, 0.35, ['hall_art']) };
  let bakedMat = null;
  signs.traverse((m) => {
    if (!m.isMesh || !m.material || m.material.name !== 'advert_atlas') return; bakedMat = m.material;
    const pos = m.geometry.attributes.position, e = m.matrixWorld.elements, drop = [];
    for (const vs of quadGroups(m.geometry)) {
      let x = 0, z0 = 1e9, z1 = -1e9; for (const i of vs) { const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i), wx = e[0] * px + e[4] * py + e[8] * pz + e[12], wz = e[2] * px + e[6] * py + e[10] * pz + e[14]; x += wx; z0 = Math.min(z0, wz); z1 = Math.max(z1, wz); }
      const side = x < 0 ? -1 : 1;
      if (sides.includes(side) || art[side].some(([a, b]) => z0 < b && z1 > a)) drop.push(vs);
    }
    dropQuads(THREE, m.geometry, drop); res.dropped += drop.length;
  });
  if (!sides.length) return res;
  // 2. the new frames
  const pMap = atlases.portrait, lMap = atlases.landscape; if (!pMap && !lMap) return res;
  const pOrder = advertOrder(stationId + '/track'), lOrder = advertOrder(stationId + '/land', LAND_POSTERS); let pk = 0, lk = 0;
  const buf = () => ({ pos: [], uv: [], idx: [] }), B = { portrait: buf(), landscape: buf(), frame: buf() };
  for (const side of sides) {
    const pts = wallProfile(tpl, side, zone.y0); if (pts.length < 3) continue;
    const avail = pts[pts.length - 1].s - 0.06;
    const hp = Math.min(1.5, avail), hl = Math.min(coved ? 1.75 : 1.5, avail);
    const pattern = coved || !pMap ? [{ kind: 'landscape', w: hl * 1.5 }] : !lMap ? [{ kind: 'portrait', w: hp * 2 / 3 }]
      : [{ kind: 'portrait', w: hp * 2 / 3 }, { kind: 'portrait', w: hp * 2 / 3 }, { kind: 'portrait', w: hp * 2 / 3 }, { kind: 'landscape', w: hl * 1.5 }];
    if (coved && !lMap) continue;
    const taken = [...hallWallClutter(tpl, side, side < 0 ? -wallX.l : wallX.r, zone.y0 - 0.02, zone.y0 + Math.max(hp, hl) + 0.02), ...INFO_GAPS.map((z) => [z - INFO_GAP_W / 2, z + INFO_GAP_W / 2])];
    const row = planRow(freeIntervals(taken, -ROW_HALF, ROW_HALF, 0.25, Math.min(...pattern.map((p) => p.w))), pattern, coved ? 1.4 : 0.3);
    for (const f of row) {
      const land = f.kind === 'landscape', h = land ? hl : hp;
      const cell = land ? lOrder[lk++ % LAND_POSTERS] : pOrder[pk++ % ADVERT_CELLS];
      addSheet(B[f.kind], pts, side, f.z0, f.z1, 0, h, 0.02, cellRect(cell));
      addSheet(B.frame, pts, side, f.z0 - 0.04, f.z1 + 0.04, -0.04, h + 0.04, 0.012);
      res.frames++;
    }
    res.walls++;
  }
  // 3. meshes, in hall_signs' own frame
  const inv = new THREE.Matrix4().copy(signs.matrixWorld).invert();
  const glow = (map) => new THREE.MeshStandardMaterial({ name: 'advert_track', map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: bakedMat && bakedMat.emissiveIntensity != null ? bakedMat.emissiveIntensity : 0.25, roughness: 0.35, metalness: 0, side: THREE.DoubleSide });
  const mats = { portrait: pMap && glow(pMap), landscape: lMap && glow(lMap), frame: new THREE.MeshStandardMaterial({ name: 'advert_frame', color: 0xc9cdd2, metalness: 0.75, roughness: 0.32, side: THREE.DoubleSide }) };
  for (const k of ['frame', 'portrait', 'landscape']) {
    const b = B[k]; if (!b.idx.length || !mats[k]) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); g.setIndex(b.idx);
    g.applyMatrix4(inv); g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, mats[k]); mesh.name = 'track_adverts_' + k; mesh.receiveShadow = true; signs.add(mesh);
  }
  return res;
}
