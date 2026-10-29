// buildStage(): compiles an authored design into a Stage (centreline, terrain, props, pace notes).
// Pure and deterministic: no THREE, no DOM, no Math.random.  See ../CONTRACTS.md section 2.

import { clamp, lerp, smoothstep, TAU } from "./mathx.mjs";
import { hash2 } from "./rng.mjs";
import { SURFACE as SF, SURFACE_INFO } from "./surfaces.mjs";
import { STAGE_DEFS, STAGE_IDS, STAGE_DESIGNS, DEFAULT_SEEDS, getStageDef } from "./stagedefs.mjs";
import { compileDesign, createRoadIndex, noise1, DS } from "./spline.mjs";
import { createTerrain, noise2, BIOME_TERRAIN } from "./terrain.mjs";
import { buildPacenotes } from "./pacenotes.mjs";
import { parFor } from "./rivals.mjs";

export { STAGE_DEFS, STAGE_IDS, getStageDef };

export const PROP_KINDS = Object.freeze([
  "pine", "macrocarpa", "redwood", "beech", "pohutukawa", "kauri", "tree_fern", "cabbage_tree", "flax", "toetoe",
  "tussock", "grass_tuft", "fern", "shrub", "boulder", "limestone", "schist", "log", "stump", "fence_post",
  "fence_wire", "power_pole", "sign_chevron", "sign_warning", "marker_post", "tape_barrier", "haybale", "marshal",
  "spectator", "spectator_group", "car_parked", "hut", "farm_shed", "bridge_deck", "bridge_rail", "culvert", "sheep",
  "cow", "steam_vent", "waterfall", "cattlegrid", "guardrail", "tyre_stack", "flag", "tent", "banner_arch",
]);

/** Kinds allowed inside the drivable corridor (|lat| < width/2 + 1.2). */
export const CORRIDOR_KINDS = Object.freeze(["banner_arch", "bridge_deck", "bridge_rail", "cattlegrid", "culvert"]);

// footprint radius r (m, at scale 1), height h (m), hardness 0..1, collidable by default
const PK = {
  pine: { r: 0.35, h: 18, hard: 0.9, c: 1 }, macrocarpa: { r: 0.6, h: 14, hard: 0.9, c: 1 },
  redwood: { r: 1.1, h: 45, hard: 1, c: 1 }, beech: { r: 0.5, h: 22, hard: 0.9, c: 1 },
  pohutukawa: { r: 0.6, h: 9, hard: 0.9, c: 1 }, kauri: { r: 1.2, h: 30, hard: 1, c: 1 },
  tree_fern: { r: 0.25, h: 5, hard: 0.5, c: 0 }, cabbage_tree: { r: 0.3, h: 7, hard: 0.6, c: 0 },
  flax: { r: 0.5, h: 1.8, hard: 0.1, c: 0 }, toetoe: { r: 0.4, h: 2.2, hard: 0.1, c: 0 },
  tussock: { r: 0.4, h: 0.9, hard: 0.1, c: 0 }, grass_tuft: { r: 0.2, h: 0.5, hard: 0.05, c: 0 },
  fern: { r: 0.4, h: 0.9, hard: 0.1, c: 0 }, shrub: { r: 0.5, h: 1.4, hard: 0.2, c: 0 },
  boulder: { r: 1.0, h: 1.6, hard: 0.9, c: 1 }, limestone: { r: 1.6, h: 5, hard: 1, c: 1 },
  schist: { r: 2.0, h: 4.5, hard: 1, c: 1 }, log: { r: 0.5, h: 0.9, hard: 0.5, c: 1 },
  stump: { r: 0.5, h: 0.8, hard: 0.6, c: 1 }, fence_post: { r: 0.08, h: 1.2, hard: 0.1, c: 0 },
  fence_wire: { r: 0.05, h: 1.1, hard: 0.05, c: 0 }, power_pole: { r: 0.2, h: 9, hard: 0.8, c: 1 },
  sign_chevron: { r: 0.12, h: 1.8, hard: 0.25, c: 1 }, sign_warning: { r: 0.12, h: 2.2, hard: 0.25, c: 1 },
  marker_post: { r: 0.1, h: 1.2, hard: 0.2, c: 1 }, tape_barrier: { r: 0.05, h: 1.0, hard: 0.05, c: 0 },
  haybale: { r: 0.8, h: 1.0, hard: 0.35, c: 1 }, marshal: { r: 0.3, h: 1.8, hard: 0.3, c: 0 },
  spectator: { r: 0.3, h: 1.8, hard: 0.3, c: 0 }, spectator_group: { r: 1.5, h: 1.8, hard: 0.3, c: 0 },
  car_parked: { r: 1.4, h: 1.5, hard: 0.6, c: 1 }, hut: { r: 3.2, h: 4, hard: 1, c: 1 },
  farm_shed: { r: 5, h: 5, hard: 1, c: 1 }, bridge_deck: { r: 0, h: 0.4, hard: 0, c: 0 },
  bridge_rail: { r: 0.45, h: 1.1, hard: 0.8, c: 1 }, culvert: { r: 0.5, h: 0.3, hard: 0, c: 0 },
  sheep: { r: 0.4, h: 0.8, hard: 0.2, c: 0 }, cow: { r: 0.7, h: 1.4, hard: 0.3, c: 0 },
  steam_vent: { r: 1.0, h: 3, hard: 0, c: 0 }, waterfall: { r: 0, h: 30, hard: 0, c: 0 },
  cattlegrid: { r: 0, h: 0.1, hard: 0, c: 0 }, guardrail: { r: 0.3, h: 0.8, hard: 0.5, c: 0 },
  tyre_stack: { r: 0.55, h: 1.0, hard: 0.3, c: 1 }, flag: { r: 0.05, h: 4, hard: 0.1, c: 0 },
  tent: { r: 2.2, h: 2.8, hard: 0.3, c: 1 }, banner_arch: { r: 0, h: 6, hard: 0, c: 0 },
};
export const PROP_INFO = PK;

const OBS_CELL = 12;

export function buildStage(id, opts = {}) {
  const def = getStageDef(id);
  const design = STAGE_DESIGNS[id];
  const defaultSeed = DEFAULT_SEEDS[id];
  const seed = opts.seed ?? defaultSeed;
  const detail = opts.detail === "low" ? "low" : "high";
  const dens = detail === "low" ? 0.35 : 1;

  // ---------- road
  const c = compileDesign(design, defaultSeed);
  const { N, ds, lengthM, px, py, pz, tx, tz, slope, width, curv, bank, surf, verge } = c;
  const idx = createRoadIndex(c);
  const rs = (v) => {
    if (typeof v === "number") return v;
    if (v === "end") return lengthM;
    if (v === "start") return 0;
    const m = /^(\w+)([+-]\d+)?$/.exec(v);
    const base = m[1] === "end" ? lengthM : m[1] === "start" ? 0 : c.marks[m[1]];
    if (base === undefined) throw new Error("unknown mark " + v);
    return base + (m[2] ? Number(m[2]) : 0);
  };
  const shapes = (design.shape || []).map((r) => ({ ...r, s0: rs(r.s0), s1: rs(r.s1) }));

  // streams: fords and bridges carve a channel through the verge
  const streams = [];
  const water = [];
  for (const f of c.feats) {
    if (f.type === "ford") {
      const y0 = py[f.i] + 0.22;
      streams.push({ s0: f.s - f.len / 2 - 3, s1: f.s + f.len / 2 + 3, reach: 14, depth: 0.9 + 0.5, y: y0, kind: "ford" });
      // the plane spans the full road width plus 6 m a side; `depth` = water over the road bed (shallow)
      let wmax = 0;
      for (let q = Math.max(0, f.i - Math.round(f.len / 2 / ds)); q <= Math.min(N - 1, f.i + Math.round(f.len / 2 / ds)); q++) wmax = Math.max(wmax, width[q]);
      water.push({ kind: "ford", s: f.s, x: px[f.i], z: pz[f.i], y: y0, halfLen: f.len / 2 + 3, reach: 18,
        halfWidth: wmax / 2 + 6, depth: 0.22, yaw: Math.atan2(tx[f.i], -tz[f.i]) });
    } else if (f.type === "bridge") {
      const bi = clamp(Math.round((f.s + f.len / 2) / ds), 0, N - 1);
      streams.push({ s0: f.s - 2, s1: f.s + f.len + 2, reach: 18, depth: 4.5, y: py[bi] - 2.6, kind: "bridge" });
      water.push({ kind: "river", s: f.s + f.len / 2, x: px[bi], z: pz[bi], y: py[bi] - 2.6, halfLen: f.len / 2 + 2, reach: 24 });
    }
  }
  const terrain = createTerrain(c, idx, def.biome, shapes, streams, 77 + defaultSeed % 1000);
  const { heightAt, normalAt, surfaceAt } = terrain;
  const P = BIOME_TERRAIN[def.biome];

  // ---------- soft walls
  const bl = new Float32Array(N), br = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const s = i * ds, hw = width[i] / 2;
    const base = P.bound * (0.85 + 0.3 * (noise1(s / 70, 91) + 1) / 2);
    let L = hw + base, Rr = hw + base;
    for (const r of shapes) {
      if (s <= r.s0 || s >= r.s1) continue;
      const win = smoothstep(r.s0, r.s0 + r.fade, s) * (1 - smoothstep(r.s1 - r.fade, r.s1, s));
      const lim = hw + Math.max(2.2, r.start - 0.3);
      if (r.side > 0) Rr = lerp(Rr, Math.min(Rr, lim), win); else L = lerp(L, Math.min(L, lim), win);
    }
    for (const f of c.feats) {
      if (f.type === "bridge" && s >= f.s - 2 && s <= f.s + f.len + 2) { L = Math.min(L, hw + 0.5); Rr = Math.min(Rr, hw + 0.5); }
    }
    // S7 (cut policing): on the inside of a bend the wall closes to hw + 2.5 m (fully by R <= 55 m), easing back out
    // along the straights, so a corner cannot be cut across the verge.  Outside walls stay soft.
    {
      let ks = 0, kn = 0;
      for (let q = Math.max(0, i - 12); q <= Math.min(N - 1, i + 12); q++) { ks += curv[q]; kn++; }
      ks /= kn;
      const f = smoothstep(1 / 1000, 1 / 150, Math.abs(ks));
      if (f > 0) {
        const m = hw + lerp(1.9, 1.2, smoothstep(1 / 45, 1 / 18, Math.abs(ks))); // hairpins close tighter still
        if (ks > 0) Rr = Math.min(Rr, lerp(Rr, m, f)); else L = Math.min(L, lerp(L, m, f));
      }
    }
    bl[i] = L; br[i] = Rr;
  }
  const boundaryAt = (s, out) => {
    out = out || { left: 0, right: 0 };
    let f = s / ds;
    f = f < 0 ? 0 : f > N - 1.001 ? N - 1.001 : f;
    const i = f | 0, t = f - i;
    out.left = bl[i] + (bl[i + 1] - bl[i]) * t;
    out.right = br[i] + (br[i + 1] - br[i]) * t;
    return out;
  };

  // ---------- sample / project
  const sample = (s, out) => {
    out = out || {};
    s = s < 0 ? 0 : s > lengthM ? lengthM : s;
    const f = s / ds;
    let i = f | 0;
    if (i > N - 2) i = N - 2;
    const t = f - i;
    out.s = s;
    out.x = px[i] + (px[i + 1] - px[i]) * t;
    out.y = py[i] + (py[i + 1] - py[i]) * t;
    out.z = pz[i] + (pz[i + 1] - pz[i]) * t;
    let a = tx[i] + (tx[i + 1] - tx[i]) * t, b = tz[i] + (tz[i + 1] - tz[i]) * t;
    const l = Math.sqrt(a * a + b * b) || 1;
    a /= l; b /= l;
    out.tx = a; out.tz = b; out.nx = -b; out.nz = a;
    out.width = width[i] + (width[i + 1] - width[i]) * t;
    out.curv = curv[i] + (curv[i + 1] - curv[i]) * t;
    out.bank = bank[i] + (bank[i + 1] - bank[i]) * t;
    out.slope = slope[i] + (slope[i + 1] - slope[i]) * t;
    const near = (f + 0.5) | 0;
    out.surf = surf[near > N - 1 ? N - 1 : near];
    out.verge = verge[near > N - 1 ? N - 1 : near];
    out.heading = Math.atan2(-a, -b);
    return out;
  };
  const project = (x, z, hintS, out) => idx.project(x, z, hintS, out);

  // ---------- pace notes (also drive sign placement)
  const pacenotes = buildPacenotes(c, { surfaceNames: SURFACE_INFO });

  // ---------- props
  const props = [];
  const obstacles = [];
  const tmpN = {};
  const S0 = {};
  let seedMix = (seed * 2654435761) >>> 0;
  const hf = (i, j, k) => hash2(i, j, (seedMix ^ Math.imul(k + 1, 0x9e3779b1)) | 0);
  const cl = (x, z, scale, off) => 0.5 + 0.5 * noise2(x / scale, z / scale, (seed + off * 101) | 0);

  // pose on the road at s with lateral offset (signed, + = right): writes PX, PZ, PHW, PTX, PTZ
  let PX = 0, PZ = 0, PHW = 0, PTX = 0, PTZ = 0;
  function pos(s, lat) {
    sample(s, S0);
    PHW = S0.width / 2; PTX = S0.tx; PTZ = S0.tz;
    PX = S0.x + S0.nx * lat; PZ = S0.z + S0.nz * lat;
  }
  const hwAt = (s) => terrain.halfWAt(s);
  // is (x,z) outside the corridor and not in a stream? returns true when it's fine to put scenery there
  function clear(x, z, minEdge) {
    if (!idx.nearest(x, z, tmpN)) return true;
    const edge = Math.abs(tmpN.lat) - hwAt(tmpN.s);
    if (edge < minEdge) return false;
    for (let k = 0; k < streams.length; k++) {
      const st = streams[k];
      if (tmpN.s >= st.s0 - 2 && tmpN.s <= st.s1 + 2 && edge < st.reach + 2) return false;
    }
    return true;
  }
  // S1: keep big props (visual radius >= 1.2 m) >= 1 m clear of the road edge (6 m on a hairpin's inside),
  // and every collidable obstacle >= 0.3 m clear of it.  Exact distance to the nearest centreline point.
  const CORR = new Set(CORRIDOR_KINDS);
  const tmpA = {}, S1 = {};
  function placeOk(kind, x, z, r, collide) {
    if (CORR.has(kind)) return true;
    const big = r >= 1.2;
    if (!big && !collide) return true;
    if (!idx.nearest(x, z, tmpA)) return true;
    sample(tmpA.s, S1);
    const edge = Math.abs(tmpA.lat) - r - S1.width / 2;
    if (collide && edge < 0.3) return false;
    if (!big) return true;
    if (edge < 1.0) return false;
    if (edge < 6) {
      // inside of a tight bend: nothing big within 6 m of the edge
      const i0 = Math.round(tmpA.s / ds);
      let kmax = 0;
      for (let q = Math.max(0, i0 - 10); q <= Math.min(N - 1, i0 + 10); q++) if (Math.abs(curv[q]) > Math.abs(kmax)) kmax = curv[q];
      if (Math.abs(kmax) > 1 / 32 && tmpA.lat * kmax > 0) return false;
    }
    return true;
  }
  function add(kind, x, z, o) {
    o = o || {};
    const info = PK[kind];
    const sc = o.scale ?? 1;
    if (!placeOk(kind, x, z, info.r * sc, o.collide ?? !!info.c)) return null;
    const y = o.y ?? heightAt(x, z);
    const collide = o.collide ?? !!info.c;
    const p = {
      kind, x, y: y + (o.dy || 0), z,
      rot: o.rot ?? hash2(Math.round(x * 10), Math.round(z * 10), seed + 5) * TAU,
      scale: sc,
      variant: o.variant ?? Math.floor(hash2(Math.round(x * 7), Math.round(z * 7), seed + 9) * 4),
      collide, r: info.r * sc,
    };
    if (o.w !== undefined) p.w = o.w;
    if (o.len !== undefined) p.len = o.len;
    if (o.h !== undefined) p.h = o.h;
    props.push(p);
    if (collide) {
      obstacles.push({ x, z, r: p.r, kind, hardness: info.hard, y0: p.y, y1: p.y + info.h * sc });
    }
    return p;
  }

  /**
   * Jittered-grid scatter along the road. cfg: id, kinds [[kind, weight, smin, smax]], sp, a (edge m or fn(s, side)),
   * b, p(s, edge, x, z, side) -> 0..1, side (0 both | 1 | -1), cluster [n, radius], minEdge, noDens (ignore detail)
   */
  function layer(cfg) {
    const sp = cfg.sp;
    const nS = Math.floor(lengthM / sp);
    const sides = cfg.side ? [cfg.side] : [-1, 1];
    const kinds = cfg.kinds;
    let wsum = 0;
    for (const k of kinds) wsum += k[1];
    const dd = cfg.noDens ? 1 : dens;
    for (let si = 0; si <= nS; si++) {
      for (const side of sides) {
        const sk = side > 0 ? 1 : 0;
        const a0 = typeof cfg.a === "function" ? cfg.a(si * sp, side) : cfg.a;
        const b0 = typeof cfg.b === "function" ? cfg.b(si * sp, side) : cfg.b;
        const nE = Math.max(1, Math.round((b0 - a0) / sp));
        for (let ei = 0; ei < nE; ei++) {
          const key = ei * 2 + sk;
          const j1 = hf(si, key, cfg.id * 5 + 1), j2 = hf(si, key, cfg.id * 5 + 2);
          const s = (si + j1) * sp;
          if (s > lengthM) continue;
          const edge = a0 + (ei + j2) * ((b0 - a0) / nE);
          pos(s, side * (hwAt(s) + edge));
          const p = cfg.p(s, edge, PX, PZ, side);
          if (p <= 0) continue;
          const u = hf(si, key, cfg.id * 5);
          if (u >= p * dd) continue;
          // choose kind
          let pick = hf(si, key, cfg.id * 5 + 3) * wsum, kd = kinds[0];
          for (const k of kinds) { pick -= k[1]; if (pick <= 0) { kd = k; break; } }
          const x0 = PX, z0 = PZ;
          const n = cfg.cluster ? 1 + Math.floor(hf(si, key, cfg.id * 5 + 4) * cfg.cluster[0]) : 1;
          for (let q = 0; q < n; q++) {
            let x = x0, z = z0;
            if (q > 0) {
              const ang = hf(si * 7 + q, key, cfg.id * 5 + 6) * TAU, rad = Math.sqrt(hf(si * 7 + q, key, cfg.id * 5 + 7)) * cfg.cluster[1];
              x += Math.cos(ang) * rad; z += Math.sin(ang) * rad;
            }
            if (!clear(x, z, cfg.minEdge ?? 1.5)) continue;
            const kk = n > 1 && cfg.kinds.length > 1 ? kd : kd;
            const scl = kk[2] + (kk[3] - kk[2]) * hf(si * 7 + q, key, cfg.id * 5 + 8);
            add(kk[0], x, z, { scale: scl });
          }
        }
      }
    }
  }
  // line of objects along the road at a fixed edge distance
  function line(kind, step, edge, side, gate, o) {
    for (let s = (o && o.from) || 0; s <= ((o && o.to) ?? lengthM); s += step) {
      if (gate && !gate(s)) continue;
      pos(s, side * (hwAt(s) + edge));
      if (!clear(PX, PZ, edge - 0.2)) continue;
      const yaw = Math.atan2(-PTX, -PTZ);
      add(kind, PX, PZ, { rot: yaw, len: step, ...(o && o.props) });
    }
  }
  const bEdge = (s, side) => {
    boundaryAt(s, tmpB);
    return Math.max(2.4, (side > 0 ? tmpB.right : tmpB.left) - hwAt(s) - 1.2);
  };
  const tmpB = { left: 0, right: 0 };
  const seaSideAt = (s) => {
    for (const r of shapes) {
      if ((r.kind === "sea" || r.kind === "drop" || (r.kind === "edge" && r.guard)) && s > r.s0 && s < r.s1) {
        const win = smoothstep(r.s0, r.s0 + r.fade, s) * (1 - smoothstep(r.s1 - r.fade, r.s1, s));
        if (win > 0.3) return r.side;
      }
    }
    return 0;
  };
  const noStream = (s) => {
    for (const st of streams) if (s > st.s0 - 8 && s < st.s1 + 8) return false;
    return true;
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const th = (v, t, k = 4) => clamp01((v - t) * k);

  // ----- ceremonies: start, finish, hairpins
  function ceremony(s0, dir) {
    sample(s0, S0);
    const yawRoad = S0.heading;
    add("banner_arch", S0.x, S0.z, { rot: yawRoad, w: S0.width + 2.4, collide: false, y: S0.y });
    for (const side of [-1, 1]) {
      for (let k = 0; k < 14; k++) {
        const s = s0 + dir * (4 + k * 6);
        if (s < 0 || s > lengthM) continue;
        pos(s, side * (hwAt(s) + 1.8));
        add("tape_barrier", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), len: 6 });
      }
      for (let k = 0; k < 5; k++) {
        const s = s0 + dir * (6 + k * 9 + (side > 0 ? 3 : 0));
        pos(s, side * (hwAt(s) + 4.5 + hf(k, side + 2, 77) * 4));
        add("spectator_group", PX, PZ, { scale: 1 + hf(k, side + 2, 78) * 0.7, variant: k });
        pos(s + dir * 3, side * (hwAt(s) + 3.2));
        add("spectator", PX, PZ, { variant: k });
      }
      pos(s0 + dir * 12, side * (hwAt(s0) + 2.6));
      add("marshal", PX, PZ, {});
      pos(s0 + dir * 30, side * (hwAt(s0) + 3.0));
      add("marshal", PX, PZ, {});
      pos(s0 + dir * 8, side * (hwAt(s0) + 2.4));
      add("flag", PX, PZ, { scale: 1 });
      pos(s0 + dir * 18, side * (hwAt(s0) + 16));
      add("tent", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) });
      pos(s0 + dir * (20 + 8 * side), side * (hwAt(s0) + 10 + 4 * (side > 0 ? 1 : 0)));
      add("car_parked", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) + (side > 0 ? 0.3 : -0.3) });
      pos(s0 + dir * 3, side * (hwAt(s0) + 1.9));
      add("haybale", PX, PZ, {});
      pos(s0 + dir * 5, side * (hwAt(s0) + 1.9));
      add("haybale", PX, PZ, {});
    }
  }
  ceremony(0, 1);
  ceremony(lengthM, -1);

  // ----- corners: chevrons (outside edge), hairpin crowds, haybales on chicanes
  for (let n = 0; n < pacenotes.length; n++) {
    const pn = pacenotes[n];
    if (pn.kind !== "corner" && pn.kind !== "hairpin") continue;
    const outside = pn.dir === "right" ? -1 : 1;
    const count = pn.severity <= 1 ? 6 : pn.severity <= 3 ? 4 : pn.severity === 4 ? 3 : pn.severity === 5 ? 2 : 0;
    for (let q = 0; q < count; q++) {
      const s = pn.s + pn.length * ((q + 0.5) / count);
      pos(s, outside * (hwAt(s) + 1.55));
      if (!clear(PX, PZ, 1.3)) continue;
      add("sign_chevron", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) + outside * Math.PI / 2 + Math.PI });
    }
    if (pn.kind === "hairpin") {
      for (let q = 0; q < 2; q++) {
        const s = pn.s + pn.length * (0.35 + 0.3 * q);
        pos(s, outside * (hwAt(s) + 5.5 + q * 3));
        if (clear(PX, PZ, 3)) add("spectator_group", PX, PZ, { scale: 1.1, variant: q });
        pos(s, outside * (hwAt(s) + 2.2));
        if (clear(PX, PZ, 1.6)) add("tape_barrier", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), len: 6 });
      }
      pos(pn.s + pn.length * 0.5, outside * (hwAt(pn.s) + 3.6));
      if (clear(PX, PZ, 2.5)) add("marshal", PX, PZ, {});
      for (let q = 0; q < 3; q++) {
        pos(pn.s + pn.length * (0.4 + 0.1 * q), outside * (hwAt(pn.s) + 1.9));
        if (clear(PX, PZ, 1.4)) add("tyre_stack", PX, PZ, { variant: q });
      }
    }
    // chicane: next note opposite and close
    const nx = pacenotes[n + 1];
    if (nx && (nx.kind === "corner" || nx.kind === "hairpin") && nx.dir !== pn.dir && nx.s - (pn.s + pn.length) < 70 && pn.severity <= 3 && nx.severity <= 3) {
      for (let q = 0; q < 3; q++) {
        const s = pn.s + pn.length * (0.2 + 0.3 * q);
        pos(s, outside * (hwAt(s) + 1.9));
        if (clear(PX, PZ, 1.4)) add("haybale", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) });
      }
    }
  }
  // marker posts every 100 m, alternating sides
  for (let s = 100, k = 0; s < lengthM - 30; s += 100, k++) {
    const side = k % 2 ? 1 : -1;
    pos(s, side * (hwAt(s) + 1.45));
    if (clear(PX, PZ, 1.25)) add("marker_post", PX, PZ, { variant: k % 4 });
  }
  // feature furniture
  const hazards = [];
  const setPieceList = [];
  for (const f of c.feats) {
    const fx = px[f.i], fz = pz[f.i];
    if (f.type === "jump" || f.type === "crest" || f.type === "ford" || f.type === "cattlegrid") {
      hazards.push({ s: f.s, kind: f.type === "jump" ? "jump" : f.type === "crest" ? "crest" : f.type === "ford" ? "ford" : "cattlegrid", x: fx, z: fz });
    }
    if (f.type === "jump" || f.type === "ford" || f.type === "bridge" || f.type === "cattlegrid") {
      pos(Math.max(10, f.s - 80), hwAt(f.s) + 1.6);
      if (clear(PX, PZ, 1.3)) add("sign_warning", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) + Math.PI, variant: f.type === "jump" ? 0 : f.type === "ford" ? 1 : f.type === "bridge" ? 2 : 3 });
    }
    if (f.type === "bridge") {
      hazards.push({ s: f.s, kind: "bridge", x: fx, z: fz });
      const mid = f.s + f.len / 2;
      sample(mid, S0);
      add("bridge_deck", S0.x, S0.z, { rot: S0.heading, len: f.len + 4, w: S0.width + 1.4, y: S0.y, collide: false });
      for (const side of [-1, 1]) {
        for (let s = f.s - 1; s <= f.s + f.len + 1.01; s += 3) {
          pos(s, side * (hwAt(s) + 0.2));
          add("bridge_rail", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), len: 3, collide: true });
        }
      }
    }
    if (f.type === "cattlegrid") {
      sample(f.s, S0);
      add("cattlegrid", S0.x, S0.z, { rot: S0.heading, w: S0.width, len: 4.5, y: S0.y, collide: false });
      for (const side of [-1, 1]) {
        pos(f.s - 3, side * (hwAt(f.s) + 1.5)); add("fence_post", PX, PZ, { rot: S0.heading });
        pos(f.s + 3, side * (hwAt(f.s) + 1.5)); add("fence_post", PX, PZ, { rot: S0.heading });
      }
    }
    if (f.type === "tunnel") {
      // cave mouth: limestone portal pillars at both ends, close trees along both sides in between
      setPieceList.push({ id: "cave_tunnel", kind: "tunnel", s0: f.s, s1: f.s + f.len, note: "cave mouth pillars at both ends, close trees either side" });
      for (const e of [f.s, f.s + f.len]) for (const side of [-1, 1]) {
        pos(e, side * (hwAt(e) + 5.2));
        add("limestone", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), scale: 2.3 + 0.3 * hf(Math.round(e), side + 2, 61) });
      }
      for (let s = f.s + 6; s < f.s + f.len - 3; s += 4.5) for (const side of [-1, 1]) {
        const k = Math.floor(s / 4.5);
        pos(s + hf(k, side + 2, 62) * 2, side * (hwAt(s) + 1.7 + hf(k, side + 4, 62) * 1.6));
        add(hf(k, side + 6, 62) > 0.4 ? "macrocarpa" : "pine", PX, PZ, { scale: 1.2 + 0.5 * hf(k, side + 8, 62) });
      }
    }
    if (f.type === "culvert") {
      sample(f.s, S0);
      add("culvert", S0.x, S0.z, { rot: S0.heading, w: S0.width + 2, y: S0.y - 0.2, collide: false });
    }
    if (f.type === "waterfall") {
      const side = f.side;
      const lat = side * (hwAt(f.s) + 24 + 6 * hf(f.i, 1, 31));
      pos(f.s, lat);
      add("waterfall", PX, PZ, { rot: Math.atan2(PTX, PTZ) + (side > 0 ? Math.PI / 2 : -Math.PI / 2), scale: 1, h: f.h, w: f.w, collide: false });
      hazards.push({ s: f.s, kind: "waterfall", x: PX, z: PZ });
    }
  }
  for (const pn of pacenotes) if (pn.kind === "hairpin") {
    sample(pn.s + pn.length / 2, S0);
    hazards.push({ s: pn.s, kind: "hairpin", x: S0.x, z: S0.z });
  }
  hazards.sort((a, b) => a.s - b.s);
  for (const h of hazards) {
    if (h.kind !== "jump") continue;
    const hp = hazards.find((q) => q.kind === "hairpin" && q.s > h.s && q.s - h.s < 220);
    if (hp) setPieceList.push({ id: "jump_hairpin", kind: "jump_hairpin", s0: h.s, s1: hp.s, note: "crest jump landing short of a hairpin" });
  }
  if (c.marks.descent !== undefined) {
    const fd = hazards.find((q) => q.kind === "ford" && q.s > c.marks.descent);
    if (fd) setPieceList.push({ id: "ford_descent", kind: "ford_descent", s0: c.marks.descent, s1: fd.s, note: "long gravel descent ending in a ford" });
  }

  const decor = (opts && opts.noScenery) ? () => {} : buildScenery;
  decor();

  function buildScenery() {
    const biome = def.biome;
    if (biome === "pasture") {
      for (const side of [-1, 1]) {
        const g = (s) => noise1(s / 160, 13 + side) > -0.45 && noStream(s);
        line("fence_post", 5, 3.2, side, g);
        line("fence_wire", 5, 3.2, side, g);
      }
      line("power_pole", 70, 9.5, 1, (s) => noStream(s) && s > 120, { from: 100 });
      layer({ id: 1, sp: 14, a: 7, b: 90, kinds: [["macrocarpa", 3, 0.9, 1.5], ["pine", 1, 0.9, 1.3]], p: (s, e, x, z) => 0.75 * th(cl(x, z, 240, 1), 0.5, 5) });
      layer({ id: 2, sp: 4, a: 8, b: 11.5, kinds: [["pine", 2, 1, 1.5], ["macrocarpa", 1, 1, 1.4]], p: (s, e, x, z) => th(cl(x, z, 700, 3), 0.62, 6) });
      layer({ id: 3, sp: 22, a: 6, b: 150, kinds: [["limestone", 3, 0.7, 2.2], ["boulder", 1, 1, 2]], cluster: [4, 14], p: (s, e, x, z) => 0.8 * th(cl(x, z, 380, 4), 0.58, 6), noDens: false });
      layer({ id: 4, sp: 16, a: 2.5, b: 22, kinds: [["boulder", 1, 0.5, 1.3]], p: () => 0.14 });
      layer({ id: 5, sp: 36, a: 6, b: 110, kinds: [["sheep", 5, 0.9, 1.1], ["cow", 1, 0.9, 1.1]], cluster: [6, 8], p: (s, e, x, z) => 0.7 * th(cl(x, z, 300, 5), 0.52, 5) });
      layer({ id: 6, sp: 3, a: 1.4, b: 16, kinds: [["grass_tuft", 1, 0.8, 1.4]], p: (s, e, x, z) => 0.4 * (0.5 + 0.5 * cl(x, z, 60, 6)) });
      layer({ id: 7, sp: 9, a: 1.6, b: 12, kinds: [["toetoe", 2, 0.8, 1.3], ["flax", 1, 0.8, 1.3], ["shrub", 1, 0.8, 1.2]], p: (s, e, x, z) => 0.45 * th(cl(x, z, 90, 7), 0.4, 3) });
      layer({ id: 8, sp: 24, a: 30, b: 110, kinds: [["farm_shed", 1, 1, 1.2], ["hut", 2, 1, 1.1]], p: () => 0.008 });
    } else if (biome === "redwood") {
      const ba = (s, side) => bEdge(s, side);
      layer({ id: 1, sp: 6.5, a: ba, b: 110, kinds: [["redwood", 8, 0.8, 1.7], ["pine", 1, 0.8, 1.2], ["kauri", 0.5, 0.8, 1.1]], p: (s, e, x, z) => 0.7 * (0.55 + 0.45 * cl(x, z, 150, 1)) });
      layer({ id: 2, sp: 3.6, a: 1.8, b: 48, kinds: [["tree_fern", 1, 0.7, 1.4]], p: (s, e, x, z) => 0.5 * (0.2 + 0.8 * cl(x, z, 130, 2)) });
      layer({ id: 3, sp: 2.4, a: 1.4, b: 26, kinds: [["fern", 3, 0.7, 1.4], ["shrub", 1, 0.7, 1.3]], p: (s, e, x, z) => 0.62 * (0.35 + 0.65 * cl(x, z, 70, 3)) });
      layer({ id: 4, sp: 20, a: 2.6, b: 45, kinds: [["log", 2, 0.8, 1.6], ["stump", 1, 0.8, 1.5]], p: () => 0.4 });
      layer({ id: 5, sp: 36, a: 6, b: 70, kinds: [["steam_vent", 1, 0.8, 1.6]], cluster: [3, 7], p: (s, e, x, z) => 0.9 * th(cl(x, z, 520, 9), 0.58, 6) });
      layer({ id: 6, sp: 24, a: 2.2, b: 40, kinds: [["boulder", 1, 0.5, 1.4]], p: () => 0.28 });
      layer({ id: 7, sp: 4.5, a: 1.4, b: 9, kinds: [["grass_tuft", 1, 0.7, 1.2]], p: () => 0.35 });
    } else if (biome === "coast") {
      const landSide = (s, side) => seaSideAt(s) !== side;
      layer({ id: 1, sp: 9, a: 3, b: 80, kinds: [["pohutukawa", 4, 0.9, 1.7], ["macrocarpa", 1, 1, 1.4]], p: (s, e, x, z, side) => (landSide(s, side) ? 0.65 * th(cl(x, z, 230, 1), 0.45, 4) : 0.1 * th(cl(x, z, 100, 11), 0.5, 3)) });
      layer({ id: 2, sp: 5, a: 1.5, b: 18, kinds: [["flax", 3, 0.8, 1.4], ["toetoe", 1, 0.8, 1.2], ["shrub", 1, 0.7, 1.3], ["cabbage_tree", 0.6, 0.8, 1.3]], p: (s, e, x, z) => 0.5 * th(cl(x, z, 110, 2), 0.35, 3) });
      layer({ id: 3, sp: 3, a: 1.4, b: 16, kinds: [["grass_tuft", 1, 0.8, 1.4]], p: () => 0.35 });
      layer({ id: 4, sp: 12, a: 1.8, b: 9, kinds: [["boulder", 1, 0.6, 1.8]], p: (s) => (seaSideAt(s) ? 0.4 : 0.1) });
      layer({ id: 5, sp: 40, a: 8, b: 90, kinds: [["sheep", 3, 0.9, 1.1], ["cow", 1, 0.9, 1.1]], cluster: [5, 8], p: (s, e, x, z, side) => (landSide(s, side) ? 0.4 * th(cl(x, z, 280, 5), 0.55, 5) : 0) });
      layer({ id: 6, sp: 30, a: 25, b: 90, kinds: [["hut", 1, 1, 1.2]], p: (s, e, x, z, side) => (landSide(s, side) ? 0.012 : 0) });
      const bs = c.marks.beach ?? lengthM;
      layer({ id: 7, sp: 10, a: 2.5, b: 40, kinds: [["log", 2, 0.8, 1.6], ["boulder", 2, 0.6, 1.4], ["flag", 0.4, 1, 1]], p: (s) => (s > bs ? 0.35 : 0) });
      line("fence_post", 6, 3.4, -1, (s) => seaSideAt(s) !== -1 && noStream(s) && s < (c.marks.hp0 ?? 0) && noise1(s / 140, 4) > -0.3);
      line("fence_wire", 6, 3.4, -1, (s) => seaSideAt(s) !== -1 && noStream(s) && s < (c.marks.hp0 ?? 0) && noise1(s / 140, 4) > -0.3);
      // guardrail on the cliff side through the bends
      for (let s = 20; s < lengthM - 20; s += 6) {
        const side = seaSideAt(s);
        if (!side) continue;
        sample(s, S0);
        if (Math.abs(S0.curv) < 0.004 && hf(Math.floor(s / 6), 3, 90) > 0.35) continue;
        pos(s, side * (hwAt(s) + 1.45));
        add("guardrail", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), len: 6 });
      }
    } else if (biome === "tussock") {
      layer({ id: 1, sp: 2.6, a: 1.4, b: 36, kinds: [["tussock", 1, 0.8, 1.7]], p: (s, e, x, z) => 0.5 * (0.35 + 0.65 * cl(x, z, 90, 1)) });
      layer({ id: 2, sp: 3.2, a: 1.3, b: 20, kinds: [["grass_tuft", 1, 0.8, 1.5]], p: () => 0.35 });
      layer({ id: 3, sp: 26, a: 8, b: 220, kinds: [["schist", 3, 0.7, 2.4], ["boulder", 2, 1, 2.2]], cluster: [5, 15], p: (s, e, x, z) => 0.9 * th(cl(x, z, 420, 5), 0.56, 6) });
      layer({ id: 4, sp: 14, a: 2, b: 45, kinds: [["boulder", 1, 0.5, 1.5]], p: () => 0.18 });
      layer({ id: 5, sp: 10, a: 1.6, b: 22, kinds: [["toetoe", 1, 0.8, 1.4], ["shrub", 2, 0.7, 1.4]], p: (s, e, x, z) => 0.3 * th(cl(x, z, 100, 7), 0.4, 3) });
      layer({ id: 6, sp: 30, a: 20, b: 140, kinds: [["sheep", 1, 0.9, 1.1]], cluster: [5, 9], p: (s, e, x, z) => 0.3 * th(cl(x, z, 400, 8), 0.6, 4) });
      for (const side of [-1, 1]) {
        const g = (s) => noise1(s / 400, 21 + side) > 0.05 && noStream(s);
        line("fence_post", 5, 3.4, side, g);
        line("fence_wire", 5, 3.4, side, g);
      }
      line("power_pole", 75, 10, -1, (s) => noStream(s), { from: 140 });
    } else if (biome === "alpine") {
      layer({ id: 1, sp: 5, a: 1.8, b: 50, kinds: [["boulder", 4, 0.7, 2.4], ["schist", 1, 0.8, 1.8]], p: (s, e, x, z) => 0.38 * (0.4 + 0.6 * cl(x, z, 120, 1)) * (e < 12 ? 1 : 0.7) });
      layer({ id: 2, sp: 18, a: 4, b: 90, kinds: [["schist", 1, 0.9, 2.6]], cluster: [3, 10], p: (s, e, x, z) => 0.55 * th(cl(x, z, 260, 2), 0.5, 4) });
      layer({ id: 3, sp: 4, a: 1.4, b: 22, kinds: [["tussock", 3, 0.6, 1.2], ["shrub", 1, 0.6, 1.1], ["grass_tuft", 2, 0.7, 1.2]], p: (s, e, x, z) => 0.3 * cl(x, z, 90, 3) });
      for (const side of [-1, 1]) {
        for (let s = 16; s < lengthM - 16; s += 8) {
          if (seaSideAt(s) !== side) continue;
          pos(s, side * (hwAt(s) + 1.5));
          if (!clear(PX, PZ, 1.3)) continue;
          sample(s, S0);
          if (Math.abs(S0.curv) > 0.006) add("guardrail", PX, PZ, { rot: Math.atan2(-PTX, -PTZ), len: 8 });
          else add("marker_post", PX, PZ, { scale: 1.6, variant: 2 });
        }
      }
      const sm = c.marks.summit ?? lengthM - 400;
      pos(sm + 40, hwAt(sm) + 12);
      if (clear(PX, PZ, 6)) add("hut", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) });
    } else if (biome === "rainforest") {
      const ba = (s, side) => bEdge(s, side);
      layer({ id: 1, sp: 5.2, a: ba, b: 90, kinds: [["beech", 9, 0.8, 1.7], ["kauri", 0.4, 0.8, 1.1], ["cabbage_tree", 0.6, 0.8, 1.2]], p: (s, e, x, z) => 0.66 * (0.5 + 0.5 * cl(x, z, 140, 1)) });
      layer({ id: 2, sp: 3.2, a: 1.5, b: 40, kinds: [["tree_fern", 1, 0.7, 1.5]], p: (s, e, x, z) => 0.55 * (0.25 + 0.75 * cl(x, z, 110, 2)) });
      layer({ id: 3, sp: 2.5, a: 1.3, b: 24, kinds: [["fern", 4, 0.7, 1.5], ["shrub", 1, 0.7, 1.3]], p: (s, e, x, z) => 0.62 * (0.3 + 0.7 * cl(x, z, 60, 3)) });
      layer({ id: 4, sp: 15, a: 2.4, b: 32, kinds: [["log", 3, 0.8, 1.7], ["stump", 1, 0.8, 1.5]], p: () => 0.5 });
      layer({ id: 5, sp: 12, a: 2, b: 36, kinds: [["boulder", 1, 0.6, 1.8]], p: () => 0.3 });
      layer({ id: 6, sp: 14, a: 1.5, b: 10, kinds: [["flax", 1, 0.8, 1.3], ["toetoe", 1, 0.7, 1.1]], p: (s, e, x, z) => 0.4 * th(cl(x, z, 100, 6), 0.4, 3) });
      layer({ id: 7, sp: 4.5, a: 1.4, b: 8, kinds: [["grass_tuft", 1, 0.7, 1.2]], p: () => 0.3 });
    }
    setPieces(biome);
    // huts at design markers
    for (const f of c.feats) {
      if (f.type === "hut") {
        pos(f.s, f.side * (hwAt(f.s) + 14));
        if (clear(PX, PZ, 8)) add("hut", PX, PZ, { rot: Math.atan2(-PTX, -PTZ) });
      }
    }
  }

  // Landmark set pieces and the raised-bar terrain dressing (existing PROP_KINDS only).  `at(s, lat)` places relative
  // to the road; every add() still goes through the corridor rules.
  function setPieces(biome) {
    const yawAt = () => Math.atan2(-PTX, -PTZ);
    const put = (kind, s, lat, o) => { pos(s, lat); return add(kind, PX, PZ, { rot: yawAt(), ...o }); };
    const seaMark = (s) => seaSideAt(s);
    if (biome === "pasture") {
      // limestone bluffs: a stepped wall of pale rock along one side, and a cave mouth (twin pillars + lintel)
      const s0 = (c.marks.mid1 ?? lengthM * 0.4) + 60;
      for (let k = 0; k < 30; k++) {
        const s = s0 + k * 6, tier = k % 3;
        put("limestone", s + hf(k, 1, 40) * 4, hwAt(s) + 5 + tier * 3.6 + hf(k, 2, 40) * 2, { scale: 2.0 + tier * 0.6 + hf(k, 3, 40) * 0.6 });
      }
      const sc = s0 + 220;
      for (const side of [-1, 1]) {
        put("limestone", sc, side * (hwAt(sc) + 4.5), { scale: 2.6 });
        put("limestone", sc + 5, side * (hwAt(sc) + 8.5), { scale: 3.2 });
      }
      put("limestone", sc + 2.5, hwAt(sc) + 6, { scale: 3.4, dy: 0.5 });
      put("limestone", sc + 2.5, -(hwAt(sc) + 6), { scale: 3.4, dy: 0.5 });
      put("limestone", sc + 14, 0 - (hwAt(sc) + 14), { scale: 3.8 });
    } else if (biome === "redwood") {
      // steaming geothermal pool: a ring of vents and boulders beside the mud corner
      const sm = (c.marks.mud ?? lengthM * 0.4) + 40;
      const side = 1, lat0 = hwAt(sm) + 15;
      pos(sm, side * lat0);
      const cx = PX, cz = PZ;
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * TAU;
        add("steam_vent", cx + Math.cos(a) * 5, cz + Math.sin(a) * 5, { scale: 1.1 + 0.8 * hf(k, 5, 41) });
        add("boulder", cx + Math.cos(a + 0.3) * 8, cz + Math.sin(a + 0.3) * 8, { scale: 0.8 + hf(k, 6, 41) });
      }
      add("steam_vent", cx, cz, { scale: 2.6 });
    } else if (biome === "coast") {
      // clifftop lip on the sea side, a wharf and boat shed on the beach
      for (let s = 30; s < lengthM - 30; s += 9) {
        const side = seaMark(s);
        if (!side) continue;
        put(hf(Math.floor(s / 9), 8, 42) > 0.55 ? "boulder" : "flax", s, side * (hwAt(s) + 3.4 + hf(Math.floor(s / 9), 9, 42) * 2), { scale: 1.1 + hf(Math.floor(s / 9), 10, 42) * 0.9 });
      }
      const sb = (c.marks.beach ?? lengthM * 0.75) + 160, sd = seaMark(sb) || 1;
      put("farm_shed", sb, sd * (hwAt(sb) + 24), { scale: 0.9 });
      put("tyre_stack", sb + 8, sd * (hwAt(sb) + 16), {});
      put("log", sb - 10, sd * (hwAt(sb) + 14), { scale: 1.5 });
      pos(sb + 20, sd * (hwAt(sb) + 12));
      const wx = PX, wz = PZ, nx = S0.nx * sd, nz = S0.nz * sd;
      add("bridge_deck", wx + nx * 12, wz + nz * 12, { rot: Math.atan2(-nx, -nz), len: 26, w: 3, y: S0.y - 0.3, collide: false });
      for (let k = 0; k <= 8; k++) for (const e of [-1.4, 1.4]) add("bridge_rail", wx + nx * (k * 3 - 1) - nz * e * sd, wz + nz * (k * 3 - 1) + nx * e * sd, { len: 3, collide: false, y: S0.y - 0.3 });
    } else if (biome === "tussock") {
      // sheep station: woolshed, yards and a mob, well back from the road
      const ss = lengthM * 0.28, sd = -1;
      put("farm_shed", ss, sd * (hwAt(ss) + 34), { scale: 1.35 });
      put("hut", ss + 26, sd * (hwAt(ss) + 30), {});
      put("farm_shed", ss - 28, sd * (hwAt(ss) + 40), { scale: 0.8 });
      for (let k = 0; k < 14; k++) put("fence_post", ss - 20 + k * 3, sd * (hwAt(ss) + 18), { rot: 0 });
      for (let k = 0; k < 18; k++) put("sheep", ss - 25 + hf(k, 11, 43) * 50, sd * (hwAt(ss) + 14 + hf(k, 12, 43) * 14), { scale: 1 });
      put("power_pole", ss + 60, sd * (hwAt(ss) + 12), {});
    } else if (biome === "alpine") {
      // carved rock walls (stepped schist faces), scree and overhanging blocks on the uphill side of each leg, snow poles
      for (let k = 2; k <= 9; k++) {
        const west = k % 2 === 0, side = west ? 1 : -1;
        const a = c.marks[`L${k}`], b = k < 9 ? c.marks[`L${k + 1}`] : c.marks.summit;
        if (a === undefined || b === undefined) continue;
        for (let s = a + 24; s < b - 44; s += 7) {
          const h = hf(Math.floor(s / 7), k, 44);
          const hwv = hwAt(s);
          put("schist", s + h * 3, side * (hwv + 3.2 + h * 1.0), { scale: 2.0 + h * 0.8 });
          put("schist", s + 3 + h * 2, side * (hwv + 7 + h * 1.5), { scale: 3.0 + h * 1.0 });
          if (h > 0.45) put("schist", s + 1, side * (hwv + 11.5), { scale: 3.8 + h });
          for (let q = 0; q < 3; q++) put("boulder", s + q * 2.2, side * (hwv + 1.7 + hf(Math.floor(s / 7), q + 20, 44) * 5), { scale: 0.35 + hf(Math.floor(s / 7), q + 30, 44) * 0.5, collide: false });
        }
      }
      const sl = c.marks.snowline ?? lengthM * 0.4;
      for (let s = sl; s < lengthM - 40; s += 24) for (const side of [-1, 1]) put("marker_post", s, side * (hwAt(s) + 1.6), { scale: 2.4, variant: 2 });
    } else if (biome === "rainforest") {
      // swing bridge across a gully beside the road
      const sb = (c.marks.mud ?? lengthM * 0.4) + 200, sd = 1;
      pos(sb, sd * (hwAt(sb) + 20));
      const bx = PX, bz = PZ, tx0 = PTX, tz0 = PTZ, by = heightAt(bx, bz) + 2.5;
      add("bridge_deck", bx, bz, { rot: Math.atan2(-tx0, -tz0), len: 26, w: 1.5, y: by, collide: false });
      for (let k = 0; k <= 8; k++) for (const e of [-0.8, 0.8]) add("bridge_rail", bx + tx0 * (k * 3 - 12) - tz0 * e, bz + tz0 * (k * 3 - 12) + tx0 * e, { len: 3, collide: false, y: by });
      put("kauri", sb + 40, sd * (hwAt(sb) + 30), { scale: 1.2 });
    }
  }

  // ---------- obstacle spatial hash
  let oMinX = Infinity, oMinZ = Infinity, oMaxX = -Infinity, oMaxZ = -Infinity;
  for (const o of obstacles) {
    if (o.x < oMinX) oMinX = o.x; if (o.x > oMaxX) oMaxX = o.x;
    if (o.z < oMinZ) oMinZ = o.z; if (o.z > oMaxZ) oMaxZ = o.z;
  }
  if (!obstacles.length) { oMinX = oMinZ = 0; oMaxX = oMaxZ = 1; }
  const oX0 = oMinX - 20, oZ0 = oMinZ - 20;
  const oW = Math.ceil((oMaxX - oX0 + 20) / OBS_CELL) + 1, oH = Math.ceil((oMaxZ - oZ0 + 20) / OBS_CELL) + 1;
  const oHead = new Int32Array(oW * oH).fill(-1);
  const oNext = new Int32Array(obstacles.length);
  for (let i = 0; i < obstacles.length; i++) {
    const o = obstacles[i];
    const ci = Math.floor((o.z - oZ0) / OBS_CELL) * oW + Math.floor((o.x - oX0) / OBS_CELL);
    oNext[i] = oHead[ci];
    oHead[ci] = i;
  }
  const obstaclesNear = (x, z, r, out) => {
    out = out || [];
    out.length = 0;
    const maxR = 12; // largest obstacle radius we ever store (rock-wall schist at scale 4.8)
    const x0 = Math.floor((x - r - maxR - oX0) / OBS_CELL), x1 = Math.floor((x + r + maxR - oX0) / OBS_CELL);
    const z0 = Math.floor((z - r - maxR - oZ0) / OBS_CELL), z1 = Math.floor((z + r + maxR - oZ0) / OBS_CELL);
    for (let cz = z0 < 0 ? 0 : z0; cz <= z1 && cz < oH; cz++) {
      for (let cx = x0 < 0 ? 0 : x0; cx <= x1 && cx < oW; cx++) {
        for (let i = oHead[cz * oW + cx]; i >= 0; i = oNext[i]) {
          const o = obstacles[i];
          const dx = o.x - x, dz = o.z - z, rr = o.r + r;
          if (dx * dx + dz * dz <= rr * rr) out.push(o);
        }
      }
    }
    return out;
  };

  // ---------- checkpoints, start pose, minimap, bounds, par
  const nSplit = Math.max(2, Math.round(lengthM / 1000));
  const checkpoints = [{ s: 0, name: "Start" }];
  for (let k = 1; k < nSplit; k++) checkpoints.push({ s: Math.round((lengthM * k) / nSplit / ds) * ds, name: `Split ${k}` });
  checkpoints.push({ s: lengthM, name: "Finish" });

  const sp0 = sample(1, {});
  const startPose = { x: sp0.x, y: sp0.y, z: sp0.z, yaw: sp0.heading };

  const mmN = 200;
  const minimap = new Float32Array(mmN * 2);
  for (let k = 0; k < mmN; k++) {
    const i = Math.round((k * (N - 1)) / (mmN - 1));
    minimap[k * 2] = px[i]; minimap[k * 2 + 1] = pz[i];
  }

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, minY = Infinity, maxY = -Infinity;
  let maxB = 0;
  for (let i = 0; i < N; i++) {
    if (px[i] < minX) minX = px[i]; if (px[i] > maxX) maxX = px[i];
    if (pz[i] < minZ) minZ = pz[i]; if (pz[i] > maxZ) maxZ = pz[i];
    if (bl[i] > maxB) maxB = bl[i]; if (br[i] > maxB) maxB = br[i];
  }
  const margin = maxB + 270;
  minX -= margin; maxX += margin; minZ -= margin; maxZ += margin;
  for (let z = minZ; z <= maxZ; z += 120) {
    for (let x = minX; x <= maxX; x += 120) {
      const h = heightAt(x, z);
      if (h < minY) minY = h; if (h > maxY) maxY = h;
    }
  }
  for (let i = 0; i < N; i += 4) { if (py[i] < minY) minY = py[i]; if (py[i] > maxY) maxY = py[i]; }

  const stage = {
    id, def, lengthM, ds, N, seed, detail, defaultSeed,
    px, py, pz, tx, tz, slope, width, curv, bank, surf, verge,
    sample, project, heightAt, normalAt, surfaceAt, boundaryAt, obstaclesNear,
    props, checkpoints, hazards, startPose, pacenotes, minimap,
    bounds: { minX, maxX, minZ, maxZ, minY: minY - 5, maxY: maxY + 5 },
    parTime: 0,
    // contract amendments (see CONTRACTS.md "Amendments")
    seaLevel: 0, water, marks: c.marks, bankArr: bank, boundaryLeft: bl, boundaryRight: br,
    obstacleCount: obstacles.length, camberRanges: c.camberRanges, maxGrade: design.maxSlope ?? 0.145, setPieces: setPieceList,
  };
  stage.speedProfile = speedProfile(stage);
  // S4: a jump is called at the speed the stage is driven there (m/s), so it must launch a car at that speed
  for (const h of hazards) if (h.kind === "jump") h.speed = Math.round(clamp(stage.speedProfile.v[clamp(Math.round((h.s - 20) / ds), 0, N - 1)], 18, 30) * 10) / 10;
  // par = the huia's calibrated bot lap x 1.08 (core/rivals.mjs parFor); our speed-profile estimate when no table exists
  stage.parTime = parFor(id, "huia") ?? stage.speedProfile.time;
  return stage;
}

/**
 * Expert-pace speed profile (friction circle with curvature, gradient, surface mu, crest limits).
 * Returns { v: Float32Array m/s per station, time }.
 */
export function speedProfile(stage, opts = {}) {
  const { N, ds, curv, slope, surf, bank } = stage;
  const g = 9.81;
  const skill = opts.skill ?? 1.0;
  const v = new Float32Array(N);
  const vTop = opts.vTop ?? 52;
  const vlim = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const info = SURFACE_INFO[surf[i]];
    const mu = info.mu * 1.08 * skill;
    const k = Math.abs(curv[i]);
    // banked: on-camber helps the turn direction
    const bk = bank[i] * Math.sign(curv[i] || 1);
    const aLat = Math.max(2.5, mu * g + g * Math.max(0, bk) * 0.6);
    let vm = k > 1e-5 ? Math.sqrt(aLat / k) : vTop;
    // vertical curvature: do not leave the ground more than a little on crests
    const nearJump = stage.hazards && stage.hazards.some((h) => h.kind === "jump" && Math.abs(h.s - i * ds) < 30);
    if (!nearJump && i > 0 && i < N - 1) {
      const kv = (slope[i + 1] - slope[i - 1]) / (2 * ds);
      if (kv < -0.004) vm = Math.min(vm, Math.sqrt((0.9 * g) / -kv) * 1.25);
    }
    const top = info.id === 2 ? 58 : info.id === 12 ? 22 : info.id === 4 ? 36 : info.id === 3 ? 38 : vTop;
    vlim[i] = Math.min(vm, top);
  }
  vlim[N - 1] = Math.min(vlim[N - 1], 45);
  // forward pass (acceleration)
  v[0] = 0.5;
  for (let i = 1; i < N; i++) {
    const info = SURFACE_INFO[surf[i - 1]];
    const aMax = Math.min(8 * Math.min(1, info.mu / 0.75 + 0.2), 40 / Math.max(v[i - 1], 8)) - g * slope[i - 1];
    const v2 = v[i - 1] * v[i - 1] + 2 * Math.max(0.5, aMax) * ds;
    v[i] = Math.min(vlim[i], Math.sqrt(v2));
  }
  // backward pass (braking)
  for (let i = N - 2; i >= 0; i--) {
    const info = SURFACE_INFO[surf[i]];
    const aB = 0.85 * info.mu * g * 1.05 + g * slope[i];
    const v2 = v[i + 1] * v[i + 1] + 2 * Math.max(2, aB) * ds;
    if (v[i] * v[i] > v2) v[i] = Math.sqrt(v2);
  }
  let t = 0;
  for (let i = 0; i < N - 1; i++) t += ds / Math.max(2, 0.5 * (v[i] + v[i + 1]));
  return { v, time: t + 1.5 };
}
