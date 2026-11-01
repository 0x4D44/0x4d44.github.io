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
    if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { for (const k of ['map', 'normalMap', 'roughnessMap', 'emissiveMap', 'aoMap']) if (m[k]) m[k].dispose(); m.dispose(); } }
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
export function hallPosterZone(info) { return info && info.coved ? { y0: 1.35, y1: 2.25 } : { y0: 1.55, y1: 2.75 }; }
export function fixHallSigns(tpl, info) {
  if (!tpl || tpl.userData.signsFixed) return; tpl.userData.signsFixed = true;
  const coved = !!(info && info.coved), dy = coved ? -0.7 : -0.95, zone = hallPosterZone(info), H = zone.y1 - zone.y0;
  tpl.traverse((m) => {
    if (!m.isMesh || !m.geometry || !m.material) return;
    const mn = m.material.name || '', pos = m.geometry.attributes.position; if (!pos) return;
    if (/^bandmat_/.test(mn)) { for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + dy); pos.needsUpdate = true; }
    else if (mn === 'advert_atlas') {   // each poster is a separate quad: find them as connected vertex groups, stand each one in the poster zone
      const idx = m.geometry.index, n = pos.count, parent = new Int32Array(n).map((_, i) => i);
      const find = (a) => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a]; } return a; };
      const tri = idx ? idx.count / 3 : n / 3;
      for (let t = 0; t < tri; t++) { const a = idx ? idx.getX(t * 3) : t * 3, b = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, c = idx ? idx.getX(t * 3 + 2) : t * 3 + 2; parent[find(b)] = find(a); parent[find(c)] = find(a); }
      const groups = new Map(); for (let i = 0; i < n; i++) { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(i); }
      for (const vs of groups.values()) {
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
