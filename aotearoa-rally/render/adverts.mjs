// Roadside adverts for other pieces in the almanac: plank-and-post hoardings and two-post banners beside the road.
// planAdverts() is pure (no THREE) and deterministic per stage; createAdverts() turns the plan into merged static
// meshes (a panel mesh sharing ONE atlas texture plus a wood mesh per 600 m of stage) so the cost is a few draw calls and nothing per frame.
import { makeRng, hashString } from "../core/rng.mjs";

export const ADVERT_WINDOW = 400; // one to two boards per window
export const ADVERT_CLEAR = 7; // metres from the road edge (half width) to the board's nearest post
export const HOUSE_SHARE = 0.25; // the "0x4d44 software" ad is about one in four
export const TYPES = {
  hoarding: { w: 5.2, h: 2.6, clear: 1.3 },
  banner: { w: 6.4, h: 3.2, clear: 0.55 },
};

/** Deterministic placements for a built stage. `meta.ads.length` = number of atlas panels (slot 0 is the house ad).
 *  Each item: { s, x, y, z, yaw, type, ad, rank, lat, w, h, clear } where rank is 0..1: a tier with density d shows rank < d. */
export function planAdverts(stage, meta, opts = {}) {
  const nAds = meta?.ads?.length ?? 14;
  const rng = makeRng(hashString("adverts:" + stage.id) ^ (stage.seed ?? stage.defaultSeed ?? 0));
  const L = stage.lengthM;
  const out = [];
  const tmp = {}, t0 = {}, t1 = {};
  const bad = (stage.hazards ?? []).map((h) => h.s);
  const water = stage.water ?? [];
  let prev1 = -1, prev2 = -1, side0 = 0;
  for (let w0 = 80; w0 < L - 80; w0 += ADVERT_WINDOW) {
    const want = 1 + (rng.next() < 0.6 ? 1 : 0);
    for (let k = 0; k < want; k++) {
      let best = null;
      for (let tries = 0; tries < 36; tries++) {
        const s = w0 + rng.next() * Math.min(ADVERT_WINDOW, L - 80 - w0);
        if (s < 80 || s > L - 80) continue;
        if (bad.some((b) => Math.abs(b - s) < 45)) continue;
        const a = stage.sample(s, tmp);
        const tx = a.tx, tz = a.tz, nx = -tz, nz = tx; // nx,nz = left of travel direction in x,z
        const p0 = stage.sample(Math.max(0, s - 12), t0), p1 = stage.sample(Math.min(L, s + 12), t1);
        const turn = p0.tx * p1.tz - p0.tz * p1.tx; // > 0: bends toward +n; the outside is the other side
        const absTurn = Math.abs(turn);
        // the outside of a bend first; on a straight alternate sides so both banks get boards
        const side = absTurn > 0.03 ? (turn > 0 ? -1 : 1) : (side0 = -side0 || 1);
        const half = a.width / 2;
        const lat = half + ADVERT_CLEAR + rng.next() * 7;
        const type = rng.next() < 0.65 ? "hoarding" : "banner";
        const T = TYPES[type];
        // the board sits at lat; its nearest post is lat - w/2 * |sin| from the road, so keep the whole board clear
        const x = a.x + nx * side * lat, z = a.z + nz * side * lat;
        const inX = -nx * side, inZ = -nz * side; // toward the road
        let fx = -tx * 0.93 + inX * 0.37, fz = -tz * 0.93 + inZ * 0.37; // faces the oncoming driver, turned a little to the road
        const fl = Math.hypot(fx, fz); fx /= fl; fz /= fl;
        // post positions (board runs along the right-hand vector of the facing normal)
        const rx = fz, rz = -fx;
        const hw = T.w / 2 - 0.5;
        const pa = { x: x + rx * hw, z: z + rz * hw }, pb = { x: x - rx * hw, z: z - rz * hw };
        // every part of the board must stay >= ADVERT_CLEAR - 1 from the road edge and the road must not wind back beside it
        let ok = true;
        for (const q of [pa, pb, { x, z }, { x: x + rx * T.w / 2, z: z + rz * T.w / 2 }, { x: x - rx * T.w / 2, z: z - rz * T.w / 2 }]) {
          const pr = stage.project(q.x, q.z, s, {});
          const e = stage.sample(pr.s, {});
          if (pr.dist < e.width / 2 + ADVERT_CLEAR - 1) { ok = false; break; }
          if (stage.surfaceAt && stage.surfaceAt(q.x, q.z) === 12) { ok = false; break; }
          if (stage.obstaclesNear(q.x, q.z, 3.2).length) { ok = false; break; }
          for (const wv of water) if (Math.hypot(q.x - wv.x, q.z - wv.z) < wv.halfLen + wv.reach + 6) { ok = false; break; }
          if (!ok) break;
        }
        if (!ok) continue;
        const ya = stage.heightAt(pa.x, pa.z), yb = stage.heightAt(pb.x, pb.z), ym = stage.heightAt(x, z);
        if (Math.abs(ya - yb) > 1.4) continue;
        const score = absTurn + rng.next() * 0.02;
        if (!best || score > best.score) best = { score, s, x, y: Math.max(ya, yb, ym), z, yaw: Math.atan2(fx, fz), type, lat, w: T.w, h: T.h, clear: T.clear, ya, yb };
        if (absTurn > 0.12) break;
      }
      if (!best) continue;
      let ad = rng.next() < HOUSE_SHARE ? 0 : 1 + Math.floor(rng.next() * (nAds - 1));
      for (let g = 0; g < 6 && (ad === prev1 || ad === prev2) && ad !== 0; g++) ad = 1 + Math.floor(rng.next() * (nAds - 1));
      prev2 = prev1; prev1 = ad;
      delete best.score;
      out.push({ ...best, ad, rank: rng.next() });
    }
  }
  out.sort((a, b) => a.s - b.s);
  // rank is spread so the first ceil(d*n) boards stay for any density d: evenly interleave low ranks along the stage
  out.forEach((it, i) => { it.rank = ((i * 0.6180339887) % 1); });
  return out;
}

/** createAdverts(THREE, { scene, getCfg, baseUrl }) -> { setStage(stage), refreshQuality(), disposeStage(), stats } */
export function createAdverts(THREE, { scene, getCfg, baseUrl, anisotropy = 4 }) {
  const group = new THREE.Group();
  group.name = "adverts";
  scene.add(group);
  let atlas = null, meta = null, loading = null, stage = null, plan = [];
  const stats = { boards: 0, draws: 0 };
  const base = baseUrl ?? new URL("../assets/tex/", import.meta.url).href;

  const panelMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const woodMat = new THREE.MeshLambertMaterial({ vertexColors: true });

  function loadAtlas() {
    if (atlas) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      try {
        const r = await fetch(base + "adverts.json");
        if (!r.ok) return false;
        meta = await r.json();
        const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = base + meta.file; });
        atlas = new THREE.Texture(img);
        atlas.colorSpace = THREE.SRGBColorSpace;
        atlas.anisotropy = anisotropy;
        atlas.generateMipmaps = true;
        atlas.minFilter = THREE.LinearMipmapLinearFilter;
        atlas.needsUpdate = true;
        panelMat.map = atlas; panelMat.emissiveMap = atlas; panelMat.emissive.setScalar(0.1); panelMat.needsUpdate = true;
        return true;
      } catch { return false; }
    })();
    return loading;
  }

  function clear() {
    for (const m of [...group.children]) { group.remove(m); m.geometry.dispose(); }
    stats.boards = 0; stats.draws = 0;
  }

  const WOOD = [0.42, 0.34, 0.25], WOOD2 = [0.3, 0.25, 0.19];

  function build() {
    clear();
    if (!stage || !atlas || !meta) return;
    const density = getCfg()?.adverts ?? 0;
    if (density <= 0) return;
    const [AW, AH] = meta.size;
    const chunks = new Map();
    for (const it of plan) {
      if (it.rank >= density) continue;
      const key = Math.floor(it.s / 600);
      if (!chunks.has(key)) chunks.set(key, { pos: [], nor: [], uv: [], idx: [], wp: [], wn: [], wc: [], wi: [] });
      const c = chunks.get(key);
      const rect = meta.ads[it.ad].rect;
      const u0 = (rect[0] + 2) / AW, u1 = (rect[2] - 2) / AW, v1 = 1 - (rect[1] + 2) / AH, v0 = 1 - (rect[3] - 2) / AH;
      const sn = Math.sin(it.yaw), cs = Math.cos(it.yaw);
      // local (lx right, ly up, lz out of the face) -> world
      const W = (lx, ly, lz) => [it.x + lx * cs + lz * sn, ly, it.z - lx * sn + lz * cs];
      const bottom = Math.max(it.ya, it.yb, it.y) + it.clear, top = bottom + it.h;
      const hw = it.w / 2;
      // panel (front only)
      {
        const n = c.pos.length / 3;
        const pts = [[-hw, bottom], [hw, bottom], [hw, top], [-hw, top]];
        for (let i = 0; i < 4; i++) { const p = W(pts[i][0], pts[i][1], 0.09); c.pos.push(p[0], p[1], p[2]); c.nor.push(sn, 0, cs); }
        // mirrored text check: panel left (-lx) must be the picture's left when seen from the front: front viewer's left = -right
        c.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
        c.idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
      }
      // wood: a back slab (box), a frame lip, two posts
      const box = (x0, x1, y0, y1, z0, z1, col) => {
        const n = c.wp.length / 3;
        const faces = [ // [normal local], 4 corners
          [[0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]]],
          [[0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]]],
          [[1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]]],
          [[-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]]],
          [[0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]],
        ];
        let k = n;
        for (const [nl, cs4] of faces) {
          for (const q of cs4) { const p = W(q[0], q[1], q[2]); c.wp.push(p[0], p[1], p[2]); const nw = [nl[0] * cs + nl[2] * sn, nl[1], -nl[0] * sn + nl[2] * cs]; c.wn.push(nw[0], nw[1], nw[2]); c.wc.push(col[0], col[1], col[2]); }
          c.wi.push(k, k + 1, k + 2, k, k + 2, k + 3); k += 4;
        }
      };
      box(-hw - 0.12, hw + 0.12, bottom - 0.12, top + 0.12, 0.0, 0.085, WOOD); // slab + frame behind the panel
      box(-hw - 0.12, hw + 0.12, top, top + 0.12, 0.0, 0.2, WOOD2); // top lip
      for (const px of [-(hw - 0.5), hw - 0.5]) box(px - 0.1, px + 0.1, Math.min(it.ya, it.yb) - 0.6, bottom + it.h * 0.55, -0.22, -0.02, WOOD2);
    }
    for (const c of chunks.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(c.pos, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(c.nor, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(c.uv, 2));
      g.setIndex(c.idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, panelMat); m.matrixAutoUpdate = false; m.updateMatrix();
      group.add(m);
      const g2 = new THREE.BufferGeometry();
      g2.setAttribute("position", new THREE.Float32BufferAttribute(c.wp, 3));
      g2.setAttribute("normal", new THREE.Float32BufferAttribute(c.wn, 3));
      g2.setAttribute("color", new THREE.Float32BufferAttribute(c.wc, 3));
      g2.setIndex(c.wi);
      g2.computeBoundingSphere();
      const m2 = new THREE.Mesh(g2, woodMat); m2.matrixAutoUpdate = false; m2.updateMatrix();
      group.add(m2);
      stats.draws += 2;
    }
    stats.boards = plan.filter((p) => p.rank < density).length;
  }

  return {
    group, stats,
    get plan() { return plan; },
    async setStage(st) {
      stage = st; plan = [];
      const ok = await loadAtlas();
      if (!ok || stage !== st) return;
      plan = planAdverts(st, meta);
      build();
    },
    refreshQuality() { build(); },
    disposeStage() { clear(); stage = null; plan = []; },
  };
}
