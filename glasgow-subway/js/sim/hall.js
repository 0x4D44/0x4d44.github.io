// Per-station halls (models/station_<id>.glb, A3) - layout maths, loading, and light/portal extraction.
// Hall frame: origin = hall centre on the centre line at rail-head level, tracks along Z at x = trackX[0], trackX[1]
// (outer circle uses the +x track, inner the -x track), platforms z in [-22.5, 22.5], hall shell z in [-27, 27],
// end_walls to z = +-30 (3 m bore stubs).
export const HALL_HALF = 27, HALL_FULL = 33.15, PLAT_HALF = 22.5;

/**
 * Chooses how to orient the hall for a line so the platform side matches the data (S: +1 right of travel).
 * Local frame: x_l right of travel with own track at 0, z_l = -u (travel = -z_l). Hall -> local: x_l = sigma*(x_h - ownX),
 * z_l = sigma*z_h; sigma = -1 means the hall is rotated 180 degrees about Y.
 */
export function layoutFor(info, line, Sdata) {
  const [tl, tr] = info.trackX;
  const ownX = line === 'inner' ? tl : tr, otherX = line === 'inner' ? tr : tl;
  const opts = [];
  for (const flip of [false, true]) {
    const sg = flip ? -1 : 1, loc = (x) => sg * (x - ownX);
    const plats = info.platforms.map(([a, b]) => ({ x0: Math.min(loc(a), loc(b)), x1: Math.max(loc(a), loc(b)) }));
    const adj = [];
    for (const p of plats) {
      if (p.x0 > 1.0 && p.x0 < 1.6) adj.push({ ...p, S: 1, edge: p.x0, far: p.x1 });
      else if (p.x1 < -1.0 && p.x1 > -1.6) adj.push({ ...p, S: -1, edge: p.x1, far: p.x0 });
    }
    opts.push({ flip, sg, plats, adj });
  }
  let pick = opts.find((o) => o.adj.some((a) => a.S === Sdata)) || opts.find((o) => o.adj.length) || opts[0];
  const a = pick.adj.find((x) => x.S === Sdata) || pick.adj[0] || { S: Sdata, edge: Sdata * 1.25, far: Sdata * 4.5, x0: 1.25, x1: 4.5 };
  const sg = pick.sg;
  return {
    flip: pick.flip, sg, ownX, S: a.S, xe: a.edge, xo: a.far, platLocal: pick.plats, adj: a,
    otherTrackX: sg * (otherX - ownX), island: info.type === 'island' || info.type === 'split',
    toLocal: (hx, hz) => [sg * (hx - ownX), sg * hz],
  };
}

export async function loadGLB(THREE, GLTFLoader, url) {
  const g = await new Promise((res, rej) => new GLTFLoader().load(url, res, undefined, rej));
  return g.scene;
}

/** Frees GPU resources of a loaded template (geometries, materials, textures). */
export function disposeTemplate(root) {
  if (!root) return;
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap']) if (m[k] && !m[k].userData.shared) m[k].dispose(); m.dispose(); } }
  });
}

/** light colour / crowd density hints derived from data/station_looks.json */
export function lookHints(look) {
  const h = { light: 0xffe3b0, crowd: 1 };
  if (!look) return h;
  const l = (look.lighting || '').toLowerCase();
  if (/led|downlight|fluorescent/.test(l)) h.light = 0xf2f6ff;
  if (/warm|tungsten|incandescent/.test(l)) h.light = 0xffd9a0;
  const f = ((look.features || []).join(' ') + ' ' + (look.platform && look.platform.note || '')).toLowerCase();
  if (/congested|busy|crowd|interchange|university|stadium/.test(f)) h.crowd = 1.5;
  if (/quiet|small|compact/.test(f)) h.crowd = 0.7;
  return h;
}

/**
 * Wall furniture layout fix (applied once to a loaded hall template, in place; the GLB is pre-built).
 * Name bands sat at 1.9-2.4 m (coved halls 1.45-1.95 m) and the wall posters at ~1.05-2.35 m, so they overlapped. The vertical wall only
 * reaches 2.9 m (coved: 2.3 m, then the vault curves away), so there is no room ABOVE the band: drop the name band onto the dado and
 * stand the posters on top of it, shrunk to fit the free wall (aspect kept).
 * Returns the free-wall rectangle {y0, y1} (hall y, platform = 0.695) that wall panels may use.
 */
/** Vertex-index lists of the geometry's connected pieces (each wall poster is its own quad inside one merged mesh). */
export function quadGroups(geo) {
  const idx = geo.index, n = geo.attributes.position.count, parent = new Int32Array(n).map((_, i) => i);
  const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
  const tri = idx ? idx.count / 3 : n / 3;
  for (let t = 0; t < tri; t++) { const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; parent[find(b)] = find(a); parent[find(c)] = find(a); }
  const groups = new Map(); for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); }
  return [...groups.values()];
}
export const MURAL_LIFT = 0.008;   // m
export function hallPosterZone(info) { return info && info.coved ? { y0: 1.35, y1: 2.25 } : { y0: 1.55, y1: 2.75 }; }
export function fixHallSigns(tpl, info) {
  if (!tpl || tpl.userData.signsFixed) return; tpl.userData.signsFixed = true;
  const coved = !!(info && info.coved), dy = coved ? -0.7 : -0.95, zone = hallPosterZone(info), H = zone.y1 - zone.y0;
  tpl.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.material) return;
    const mn = m.material.name || '', pos = m.geometry.attributes.position; if (!pos) return;
    if (/^bandmat_/.test(mn)) { for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + dy); pos.needsUpdate = true; }
    else if (/^art_/.test(mn)) {   // the mural was built in the very plane of its own backing plate's face (and 2 mm off the name band): it flickered through both.
      // Stand it 8 mm clear of the plate, towards the middle of the hall, and let it win any tie in depth that is left.
      let cx = 0; for (let i = 0; i < pos.count; i++) cx += pos.getX(i); const s = Math.sign(cx) || 1;
      for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) - s * MURAL_LIFT); pos.needsUpdate = true;
      m.material.polygonOffset = true; m.material.polygonOffsetFactor = -2; m.material.polygonOffsetUnits = -8; m.material.needsUpdate = true;
    }
    else if (mn === 'advert_atlas') {   // each poster is a separate quad: find them as connected vertex groups, stand each one in the poster zone
      for (const vs of quadGroups(m.geometry)) {
        let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9; for (const i of vs) { const y = pos.getY(i), z = pos.getZ(i); y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        // the quad runs along the hall (z) and up the wall (y); the long hall axis here is z
        const h = y1 - y0; if (h < 0.5) continue; const k = Math.min(1, H / h), zc = (z0 + z1) / 2;
        for (const i of vs) { pos.setY(i, zone.y0 + (pos.getY(i) - y0) * k); pos.setZ(i, zc + (pos.getZ(i) - zc) * k); }
      }
      pos.needsUpdate = true;
    }
    else return;
    m.geometry.computeBoundingBox(); m.geometry.computeBoundingSphere();
  });
}

/**
 * Where the hall's side walls really are (hall-frame x), measured on the loaded shell. info.hallHalfWidth is the nominal half-width (island halls
 * 4.25) but the walls are built further out (5.02), which left the wall posters hanging ~0.8 m in front of the wall. Casts a ray along +-x at height y
 * for several z and takes the outermost shell surface hit (median over z). Returns { l, r } (l < 0 < r) or null.
 */
export function measureHallWalls(tpl, y = 1.8, zs = [-17, -9, 3.3, 9, 17]) {
  const shell = tpl && tpl.getObjectByName('hall_shell'); if (!shell) return null;
  tpl.updateMatrixWorld(true);
  const outL = zs.map(() => 0), outR = zs.map(() => 0), P = new Array(9);
  shell.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
    const pos = m.geometry.attributes.position, idx = m.geometry.index, e = m.matrixWorld.elements, nT = idx ? idx.count / 3 : pos.count / 3;
    for (let t = 0; t < nT; t++) {
      for (let k = 0; k < 3; k++) {
        const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k, px = pos.getX(vi), py = pos.getY(vi), pz = pos.getZ(vi);
        P[k * 3] = e[0] * px + e[4] * py + e[8] * pz + e[12]; P[k * 3 + 1] = e[1] * px + e[5] * py + e[9] * pz + e[13]; P[k * 3 + 2] = e[2] * px + e[6] * py + e[10] * pz + e[14];
      }
      if (y < Math.min(P[1], P[4], P[7]) || y > Math.max(P[1], P[4], P[7])) continue;
      const zlo = Math.min(P[2], P[5], P[8]), zhi = Math.max(P[2], P[5], P[8]);
      const d1y = P[4] - P[1], d1z = P[5] - P[2], d2y = P[7] - P[1], d2z = P[8] - P[2], det = d1y * d2z - d2y * d1z; if (Math.abs(det) < 1e-9) continue;
      for (let j = 0; j < zs.length; j++) {
        const z = zs[j]; if (z < zlo || z > zhi) continue;
        const ry = y - P[1], rz = z - P[2], s = (ry * d2z - d2y * rz) / det, u = (d1y * rz - ry * d1z) / det;     // barycentric in the (y, z) plane
        if (s < -1e-6 || u < -1e-6 || s + u > 1 + 1e-6) continue;
        const x = P[0] + s * (P[3] - P[0]) + u * (P[6] - P[0]);
        if (x < 0) { if (x < outL[j]) outL[j] = x; } else if (x > outR[j]) outR[j] = x;
      }
    }
  });
  const med = (a) => { a = a.filter((v) => v !== 0).sort((p, q) => Math.abs(p) - Math.abs(q)); return a.length ? a[a.length >> 1] : 0; };
  const l = med(outL), r = med(outR);
  return l < -1 && r > 1 ? { l, r } : null;
}

/**
 * z-intervals (hall frame) of the wall already taken inside the height band [y0, y1]: adverts, murals, route strips, wall clocks and boxes.
 * side -1 = the hall's left wall, +1 = the right wall; wallX = that wall's |x|. Anything within `reach` of the wall surface counts. Merged, ascending.
 */
export function hallWallClutter(tpl, side, wallX, y0, y1, reach = 0.35, nodes = ['hall_signs', 'hall_art', 'hall_furniture']) {
  const out = []; if (!tpl) return out; tpl.updateMatrixWorld(true);
  for (const nm of nodes) {
    const node = tpl.getObjectByName(nm); if (!node) continue;
    node.traverse((m) => {
      if (!m.isMesh || !m.geometry || !m.geometry.attributes.position) return;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, e = m.matrixWorld.elements, nT = idx ? idx.count / 3 : pos.count / 3;
      for (let t = 0; t < nT; t++) {
        let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9, zmin = 1e9, zmax = -1e9;
        for (let k = 0; k < 3; k++) {
          const vi = idx ? idx.getX(t * 3 + k) : t * 3 + k, px = pos.getX(vi), py = pos.getY(vi), pz = pos.getZ(vi);
          const x = side * (e[0] * px + e[4] * py + e[8] * pz + e[12]), yy = e[1] * px + e[5] * py + e[9] * pz + e[13], z = e[2] * px + e[6] * py + e[10] * pz + e[14];
          xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy); zmin = Math.min(zmin, z); zmax = Math.max(zmax, z);
        }
        if (xmin < wallX - reach || xmax > wallX + 0.05 || ymax < y0 || ymin > y1) continue;
        out.push([zmin, zmax]);
      }
    });
  }
  out.sort((a, b) => a[0] - b[0]);
  const merged = []; for (const [a, b] of out) { const l = merged[merged.length - 1]; if (l && a <= l[1] + 0.02) l[1] = Math.max(l[1], b); else merged.push([a, b]); }
  return merged;
}

/**
 * Island platforms are only 3.2 m wide, so they get no benches or bins (a seat plus a bin leaves ~1.2 m to walk past). The hall GLB bakes all its
 * furniture into one mesh: drop the triangles of the seats (timber + orange frame) and bins (dark steel) standing on the deck of an island platform
 * (a platform with a track on both sides). Wall clocks, speaker boxes and the glass screens are untouched. Applied once to the loaded template.
 * Returns the number of triangles removed.
 */
export function stripIslandFurniture(THREE, tpl, info) {
  if (!tpl || !info || tpl.userData.islandStripped) return 0; tpl.userData.islandStripped = true;
  const tx = info.trackX; if (!tx || tx.length < 2) return 0;
  const isl = (info.platforms || []).map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).filter(([a, b]) => a > tx[0] + 0.5 && b < tx[1] - 0.5);
  const node = tpl.getObjectByName('hall_furniture'); if (!isl.length || !node) return 0;
  tpl.updateMatrixWorld(true);
  const py = info.platformTopY != null ? info.platformTopY : 0.695, y0 = py - 0.03, y1 = py + 1.8; let dropped = 0;
  node.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.geometry.index || !m.material || !/^(wood_bench|sign_orange|steel_dark)/.test(m.material.name || '')) return;
    const g = m.geometry, pos = g.attributes.position, idx = g.index, e = m.matrixWorld.elements, nT = idx.count / 3, keep = [];
    for (let t = 0; t < nT; t++) {
      const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2); let xmin = 1e9, xmax = -1e9, ymin = 1e9, ymax = -1e9;
      for (const vi of [a, b, c]) {
        const px = pos.getX(vi), pyy = pos.getY(vi), pz = pos.getZ(vi), x = e[0] * px + e[4] * pyy + e[8] * pz + e[12], yy = e[1] * px + e[5] * pyy + e[9] * pz + e[13];
        xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); ymin = Math.min(ymin, yy); ymax = Math.max(ymax, yy);
      }
      if (ymin >= y0 && ymax <= y1 && isl.some(([pa, pb]) => xmin >= pa - 0.03 && xmax <= pb + 0.03)) dropped++; else keep.push(a, b, c);
    }
    if (keep.length === idx.count) return;
    g.setIndex(new THREE.BufferAttribute(pos.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  });
  return dropped;
}

/**
 * Logos and lettering are baked as ONE quad on a double-sided material, so walking round behind a sign (entrance pylon roundel, fascia boards,
 * wall bands, train-side roundels) showed the texture mirror-imaged. Draw only the face that reads correctly (the generator reverses U, so that is
 * the quad's BACK face, i.e. THREE.BackSide): the sign is simply absent from behind instead of mirrored. (Verified per triangle across every shipped GLB:
 * the quads are all wound the same way, texture reading correctly from the back.)
 */
const SIGN_MAT = /^(sign_roundel|sign_name_board|board_|bandmat_|dirsign_|route_map_panel|advert_atlas|art_|ent_mural)/;
export function frontFaceSigns(root, skip = null) {
  if (!root) return 0; let n = 0; const seen = new Set();
  root.traverse((m) => {
    if (!m.isMesh || !m.material) return;
    for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
      if (seen.has(mat) || !SIGN_MAT.test(mat.name || '') || (skip && skip.test(mat.name))) continue; seen.add(mat);
      if (mat.side !== 1) { mat.side = 1; mat.needsUpdate = true; n++; }   // THREE.BackSide: these quads read correctly from their BACK face (U is reversed in the generator), so the front face is the mirrored one
    }
  });
  return n;
}

/** Ceiling height (hall frame, rail head = 0) above hall-frame x: mirrors ceil_z() in tools/assets_station.py */
export function ceilingAtHallX(info, x) {
  const soffit = info.ceilingY, hw = info.hallHalfWidth || [8, 8], hl = hw[0], hr = hw[1];
  if (info.coved) {
    const ax = Math.abs(x); if (ax <= 1.6 || (info.type === 'split' && x > 0)) return soffit;
    const HWs = x < 0 ? hl : hr, u = Math.min(1, (ax - 1.6) / Math.max(0.01, HWs - 1.6)); return 2.3 + (soffit - 2.3) * Math.sqrt(Math.max(0, 1 - u * u));
  }
  const cxx = (hr - hl) / 2, aa = (hl + hr) / 2; return 2.9 + (soffit - 2.9) * Math.sqrt(Math.max(0, 1 - ((x - cxx) / aa) ** 2));
}
