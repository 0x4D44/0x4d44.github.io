// Per-station halls (models/station_<id>.glb, A3) - layout maths, loading, and light/portal extraction.
// Hall frame: origin = hall centre on the centre line at rail-head level, tracks along Z at x = trackX[0], trackX[1]
// (outer circle uses the +x track, inner the -x track), platforms z in [-22.5, 22.5], hall shell z in [-27, 27],
// end_walls to z = +-30 (3 m bore stubs).
export const HALL_HALF = 27, HALL_FULL = 30.05, PLAT_HALF = 22.5;

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
