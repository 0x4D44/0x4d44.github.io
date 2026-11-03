// THE SHORE'S LIFE (A5, round 7): twelve gulls, eighteen ghost crabs and three shoals of fourteen fish on the beach. Three layers in one file:
//
//   planShoreLife(ctx | { plan, front, sea, rng }, rng?)   PURE DATA: where everything starts. Deterministic through `ctx.rng.fork('shorelife')` (the plan's seed alone when there is no ctx), so the same seed gives the
//                                                         same shore. Nothing here reads the global clock or the random source: the only time is the `t` and `dt` the caller hands to a step.
//   stepGull / stepCrab / stepShoal(state, dt, t, player, world)   PURE STEPS (no THREE, no DOM): one actor one step, under Node as on the page. `makeShoreLife` makes the states, `stepShoreLife` runs them all.
//   gullCard / crabCard / fishCard                        PURE CARDS: one actor's quad written into plain typed arrays (positions and uvs), the way the page draws it.
//   loadShoreLife(ctx, { hidden })                        PAGE: the three atlases (assets/textures/beach/gull_sprites.png, fish_sprites.png, crab_shells.png) become THREE meshes, ONE draw call each, merged
//                                                         quads rewritten every frame; ONE group `props.shorelife`, ONE system `world.shorelife` (order 41). It is a late unit of the beach (beach.js).
//
// THE ART. Every cell's uv rect and pivot is copied from assets/textures/manifest.beach.json (tests/world-shorelife.test.mjs reads the manifest and compares every number). The sheets are straight alpha
// PNGs (THREE default flipY, sRGB): a manifest uv is [u0, v0, u1, v1] with v counted from the image's TOP, so the texture's v is 1 - v. A pivot is a fraction of the CELL (y from the top): the EYE for the flying,
// the walking and the fish cells (so the frames of a group stay registered while the wings move), the FEET for the standing and the preening gull. The metres per pixel are ours: one for the whole gull sheet
// (the standing gull's 105 px are 0.45 m, so a wing of the flap frames is ~0.55 m and the bird is ~1.1 m wing to wing), one per fish species, one for the crab (its 116 px of legs are its 0.12..0.18 m).
//
// THE CARDS. Every card is ONE quad drawn from both sides: its four vertices are indexed twice (front and back winding), so the material stays single-sided and its normals can all point UP, which lights
// both faces alike (a double-sided standard material would flip the normal on the back and leave one side of a bird black). A hidden card collapses to a point. A gull is a vertical card along its heading
// (it banks a little in a circle) that turns about the vertical axis rather than go edge-on to the eye; a fish is the same card, tilted about its own body axis rather than go edge-on from above; a crab lies flat.
//
// NIGHT. life.js's pigeons have no night rule of their own (they are drawn all night), so there is nothing to copy: the gulls follow the engine's own clock, `ctx.night` (0 day .. 1 night, engine/look.js, the
// sun's elevation), and are not drawn (nor frightened, nor counted as flying) from 0.5 on. The crabs and the fish are not gulls: they stay, and the night lights them.
import { Rng, hashStr } from '../core/rng.js';
import { SEA, DECK_Z, XW, BUOY_Z, PIER, RAFT } from './coast.js';
import { planFront } from './beachfront.js';
import { planSea } from './beachsea.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (k) => k * k * (3 - 2 * k);
const r3 = (v) => Math.round(v * 1000) / 1000;
const hyp = Math.hypot;

export const COUNT = Object.freeze({ gulls: 12, soaring: 5, perched: 5, pier: 2, crabs: 18, shoals: 3, fish: 14 });
/** The numbers the brief fixes (metres, seconds): the tests read them from here. */
export const RULES = Object.freeze({
  scare: 5,                          // a gull on a perch takes off when the player is this close
  circle: Object.freeze([20, 30]),   // a frightened gull circles this many seconds, then lands at a free perch
  eye: 0.4,                          // the standing gull's eye above its feet
  walk: 0.45,                        // m/s a gull on the sand walks
  soarAlt: Object.freeze([6, 14]), soarZ: Object.freeze([120, 175]), soarSpeed: Object.freeze([3, 6]),
  crabWidth: Object.freeze([0.12, 0.18]), fleeAt: 3.5, fleeSpeed: 2.5, fleeMax: 3, sinkAt: 1, sinkFor: 8, wetMax: 0.05, crabBand: 6,
  washAt: 0.03, washFor: 3, look: Object.freeze([0, 0.1, 0.2, 0.3, 0.4]),   // a crab goes under when the sea will pass 3 cm in the next 0.4 s (it needs 0.3 s), and comes up 3 s after the water has gone
  fishTop: 0.4, fishBed: 0.3, fishShow: 45, tail: 0.15, fishDepth: 1.5,
});

// ------------------------------------------------------------------------------------------------------------------------------------ the art (manifest.beach.json)
const GP = Object.freeze([0.7858435922643503, 0.5644010814062683]), WP = Object.freeze([0.7819298135080648, 0.35295772429435485]);
/** The gull sheet: 8 cells of 128 x 256 px. `feet` (walk cells) is where the soles are, as a fraction of the cell from the top: the walking cell hangs from the eye. */
export const GULL = Object.freeze({
  file: 'gull_sprites.png', mpp: 0.45 / 105, cellPx: Object.freeze([128, 256]),
  cells: Object.freeze([
    { id: 'flap_up', uv: [0, 0, 0.125, 1], pivot: GP },
    { id: 'flap_rising', uv: [0.125, 0, 0.25, 1], pivot: GP },
    { id: 'flap_level', uv: [0.25, 0, 0.375, 1], pivot: GP },
    { id: 'flap_down', uv: [0.375, 0, 0.5, 1], pivot: GP },
    { id: 'standing', uv: [0.5, 0, 0.625, 1], pivot: [0.5, 0.703125] },
    { id: 'walk_left', uv: [0.625, 0, 0.75, 1], pivot: WP, feet: 0.66796875 },
    { id: 'walk_right', uv: [0.75, 0, 0.875, 1], pivot: WP, feet: 0.671875 },
    { id: 'cleaning', uv: [0.875, 0, 1, 1], pivot: [0.5, 0.69921875] },
  ]),
});
export const FLAP = Object.freeze([0, 1, 2, 3, 2, 1]), WALK = Object.freeze([5, 6]);   // the manifest's animations: flap at 8 fps, walk at 4 fps
const LEVEL = 2, STAND = 4, CLEAN = 7;
const walkDrop = (c) => (c.feet === undefined ? 0 : (c.feet - c.pivot[1]) * GULL.cellPx[1] * GULL.mpp);

const FP = (a, b) => Object.freeze({ a, b });
/** The fish sheet: three species, two tail poses each. `len` is the body in metres, `body` the same in pixels of the sheet: len / body is the metres per pixel. */
export const FISH = Object.freeze({
  file: 'fish_sprites.png',
  species: Object.freeze({
    jack: { len: 0.30, body: 147, px: [171, 128], pivot: [0.848765311774385, 0.5280228243454318], uv: FP([0, 0, 0.333984375, 0.5], [0, 0.5, 0.333984375, 1]) },
    grunt: { len: 0.26, body: 146, px: [170, 128], pivot: [0.8462679505966086, 0.492716859430605], uv: FP([0.333984375, 0, 0.666015625, 0.5], [0.333984375, 0.5, 0.666015625, 1]) },
    tang: { len: 0.23, body: 145, px: [171, 128], pivot: [0.8280219495430936, 0.4170353143063584], uv: FP([0.666015625, 0, 1, 0.5], [0.666015625, 0.5, 1, 1]) },
  }),
});
/** The ghost crab: a top-down cell of 128 px whose legs span 116 of them. */
export const CRAB = Object.freeze({ file: 'crab_shells.png', px: 128, content: 116, uv: Object.freeze([0, 0, 0.5, 0.5]) });
/** How the fish sheet is drawn: over the sea's layer (engine/water.js has renderOrder -10) at this opacity, so a shoal 1.5 m down can be seen from the pier (see loadShoreLife). */
export const FISH_ORDER = -9, FISH_OPACITY = 0.8;

/** How far a fish's card reaches above and below its eye (the cell's own extent: the transparent margin counts), in metres, for a fish of this species and size. */
export function fishExtent(species, size) {
  const sp = FISH.species[species], m = (sp.len / sp.body) * size;
  return { above: sp.pivot[1] * sp.px[1] * m, below: (1 - sp.pivot[1]) * sp.px[1] * m, long: sp.len * size };
}

// ------------------------------------------------------------------------------------------------------------------------------------ geometry helpers
/** A node-local point of a placed library piece, in the world: world/clutter.js clutterMatrix is Euler(-pitch, yaw, 0, 'YXZ') after the scale, then the position. */
export function itemPoint(it, lx, ly, lz) {
  const s = it.scale ?? [1, 1, 1], pitch = it.pitch ?? 0, yaw = it.yaw ?? 0;
  const x = lx * s[0], y = ly * s[1], z = lz * s[2];
  const cp = Math.cos(-pitch), sp = Math.sin(-pitch), y1 = y * cp - z * sp, z1 = y * sp + z * cp;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  return [it.x + x * cy + z1 * sy, it.y + y1, it.z - x * sy + z1 * cy];
}

/** A collider as a flat shape: post -> circle, rect -> box (tests/geom2d.mjs' maths), seg and sea walls -> a thick segment. */
function shapeOf(s) {
  if (s.kind === 'post') return { k: 'c', x: s.x, z: s.z, r: s.r };
  if (s.kind === 'rect') return { k: 'r', x: s.x, z: s.z, hw: s.w / 2, hd: s.d / 2, c: Math.cos(s.ry), s: Math.sin(s.ry) };
  return { k: 'w', x1: s.x1, z1: s.z1, x2: s.x2, z2: s.z2, t: s.t };
}
/** How far (x, z) is from a shape's edge (negative inside a circle or a thick segment, 0 inside a box). */
function gap(sh, x, z) {
  if (sh.k === 'c') return hyp(x - sh.x, z - sh.z) - sh.r;
  if (sh.k === 'r') { const dx = x - sh.x, dz = z - sh.z, lx = dx * sh.c - dz * sh.s, lz = dx * sh.s + dz * sh.c; return hyp(Math.max(0, Math.abs(lx) - sh.hw), Math.max(0, Math.abs(lz) - sh.hd)); }
  const dx = sh.x2 - sh.x1, dz = sh.z2 - sh.z1, l2 = dx * dx + dz * dz, u = l2 ? clamp(((x - sh.x1) * dx + (z - sh.z1) * dz) / l2, 0, 1) : 0;
  return hyp(x - (sh.x1 + u * dx), z - (sh.z1 + u * dz)) - sh.t;
}
export const clearOf = (list, x, z, m) => { for (const sh of list) if (gap(sh, x, z) < m) return false; return true; };
const zRange = (sh) => (sh.k === 'c' ? [sh.z - sh.r, sh.z + sh.r] : sh.k === 'r' ? [sh.z - hyp(sh.hw, sh.hd), sh.z + hyp(sh.hw, sh.hd)] : [Math.min(sh.z1, sh.z2) - sh.t, Math.max(sh.z1, sh.z2) + sh.t]);

// ------------------------------------------------------------------------------------------------------------------------------------ zones
/** Where a ghost crab may be: the wet sand, or dry sand within 6 m of the waterline; never water (the still sea here, the swell as well in `crabOK`). */
export function crabBand(coast, x, z) {
  if (Math.abs(x) > XW - 1 || z <= DECK_Z) return false;
  if (coast.depthAt(x, z) > 0.04) return false;
  const s = coast.surfaceAt(x, z);
  return s === 'wetsand' || (s === 'sand' && coast.shoreZ(x) - z <= RULES.crabBand);
}
/** Where a gull may walk or stand on the open sand: dry or damp sand within 11 m of the waterline. */
export function sandBand(coast, x, z) {
  if (Math.abs(x) > XW - 1 || z <= DECK_Z + 2) return false;
  const s = coast.surfaceAt(x, z);
  return (s === 'sand' || s === 'wetsand') && coast.depthAt(x, z) <= -0.02 && coast.shoreZ(x) - z <= 11;
}
/** Where a fish may swim: inside the swim zone (coast.limit, never past the buoy line) and where the water is deep enough for the card to sit clear of both the surface and the bed. */
export function fishZone(coast, x, z) {
  return z < BUOY_Z - 0.3 && !coast.limit(x, z).hard && coast.depthAt(x, z) >= RULES.fishDepth;
}

// ------------------------------------------------------------------------------------------------------------------------------------ the plan
/** Where a gull can stand on a piece of the library, in the piece's own frame (read off the GLB's surface by eye; tests/world-shorelife.test.mjs holds every perch against the library's size table: never above its piece's top, never a metre under it). */
export const TOPS = Object.freeze({
  kiosk: [0, 2.97, 0],                       // the apex of the roof (3.0)
  tower: [0, 3.14, 0],                       // the roof's middle (3.17; the flag mast stands at the back corner)
  boat: [[0.86, 0.79, -0.2], [-0.86, 0.79, 0.35]],   // the gunwale of the four wooden hulls (0.80)
  rock_1: [0, 0.93, 0], rock_2: [0, 1.08, 0], rock_3: [0, 0.78, 0],   // the groyne boulders' flat tops (0.95, 1.10, 0.80), times the boulder's scale
  post: [0, 0.96, 0],                        // the pier's post (0.98)
  lamp: [0, 2.83, 0],                        // the lamp's head (2.85)
});

function planPerches(coast, front, sea, solids, r) {
  const list = [], south = Math.PI / 2;
  const add = (kind, it, p, a) => {
    const [x, y, z] = it ? itemPoint(it, p[0], p[1], p[2]) : p;
    list.push({ i: list.length, kind, item: it?.id ?? null, x: r3(x), y: r3(y), z: r3(z), hx: r3(Math.cos(a)), hz: r3(Math.sin(a)) });
  };
  const towardSea = () => south + r.range(-0.6, 0.6);
  for (const it of front.items.filter((i) => i.group === 'kiosk')) add('kiosk', it, TOPS.kiosk, towardSea());
  for (const it of front.items.filter((i) => i.group === 'lifeguard_tower')) add('tower', it, TOPS.tower, towardSea());
  for (const it of sea.items.filter((i) => i.group === 'boat' && i.name.startsWith('wooden_boat_'))) {
    const axis = south - it.yaw + (r.chance(0.5) ? 0 : Math.PI);          // along the hull: local +z is (sin yaw, cos yaw)
    for (const p of TOPS.boat) add('boat', it, p, axis + (p[0] < 0 ? Math.PI : 0));
  }
  for (const it of front.groynes) {
    const top = TOPS['rock_' + it.name.slice(-1)];
    if (it.y + top[1] * it.scale[1] < SEA + 0.9) continue;                   // a boulder the swell can reach is no perch
    add('groyne', it, top, towardSea());
  }
  for (const it of sea.items.filter((i) => i.group === 'post' && i.z >= 118 && i.z <= 186)) add('post', it, TOPS.post, towardSea());
  for (const it of sea.items.filter((i) => i.group === 'post' && i.z > 187)) add('head', it, TOPS.post, towardSea());
  for (const it of sea.items.filter((i) => i.group === 'lamp')) add('lamp', it, TOPS.lamp, towardSea());
  // the open sand along the waterline: 14 spots 9 m apart in x, each in its own stretch, clear of everything
  for (let k = 0; k < 14; k++) {
    for (let tries = 0; tries < 40; tries++) {
      const x = -78 + k * 12 + r.range(-4, 4), z = coast.shoreZ(x) - r.range(2.5, 8.5);
      if (!sandBand(coast, x, z) || !clearOf(solids, x, z, 1.2) || Math.abs(x - PIER.x) < 5) continue;
      add('sand', null, [x, coast.heightAt(x, z), z], r.range(0, TAU)); break;
    }
  }
  return list;
}

function planCrabs(coast, solids, r) {
  const crabs = [];
  for (let k = 0; k < 6; k++) {
    const cx = -70 + 28 * k + r.range(-6, 6);
    for (let n = 0; n < 3; n++) {
      for (let tries = 0; tries < 80; tries++) {
        const x = cx + r.range(-2.2, 2.2), z = coast.shoreZ(x) - r.range(0.3, 4.2);
        if (!crabBand(coast, x, z) || !clearOf(solids, x, z, 0.6) || crabs.some((c) => hyp(c.x - x, c.z - z) < 0.6)) continue;
        const a = (r.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) + r.range(-0.35, 0.35);   // facing across the shore, so it scuttles along it
        crabs.push({ id: 'crab.' + crabs.length, x: r3(x), z: r3(z), hx: r3(Math.cos(a)), hz: r3(Math.sin(a)), w: r3(r.range(...RULES.crabWidth)), seed: (r.next() * 4294967296) >>> 0 });
        break;
      }
    }
  }
  return crabs;
}

/** The smallest depth of the still sea on the circles of radius rMin and rMax around (cx, cz), and whether all of them lie in the swim zone. */
function siteDepth(coast, cx, cz, rMin, rMax) {
  let d = Infinity, zone = true;
  for (let i = 0; i < 32; i++) for (const R of [rMin, rMax]) {
    const x = cx + R * Math.cos((i / 32) * TAU), z = cz + R * Math.sin((i / 32) * TAU);
    d = Math.min(d, coast.depthAt(x, z)); if (!fishZone(coast, x, z) || Math.abs(x) > XW - 2) zone = false;
  }
  return { depth: d, zone };
}

function planShoals(coast, sea, r) {
  const sites = [];
  const pier = [182, 178, 174].map((z) => ({ cx: PIER.x, cz: z })).find((s) => { const q = siteDepth(coast, s.cx, s.cz, 1.9, 3.3); return q.zone && q.depth >= RULES.fishDepth; });
  sites.push({ id: 'piles', species: 'grunt', ...(pier ?? { cx: PIER.x, cz: 182 }), rMin: 1.9, rMax: 3.3 });                 // a loose orbit around a pair of piles (they stand 1.2 m either side of the centre)
  const wreck = r.pick(sea.sunken);
  sites.push({ id: 'wreck', species: 'tang', cx: wreck.x, cz: wreck.z, rMin: wreck.id === 'moped' ? 1.2 : 1.7, rMax: wreck.id === 'moped' ? 1.9 : 3.0 });   // round the moped or the anchor
  sites.push({ id: 'raft', species: 'jack', cx: RAFT.x, cz: RAFT.z, rMin: 2.6, rMax: 4.0 });                                   // round the raft (its deck is 3 m square)
  return sites.map((s, n) => {
    const rr = r.fork('shoal' + n), dirS = rr.chance(0.5) ? 1 : -1;
    const fish = Array.from({ length: COUNT.fish }, (_, i) => {
      const ra = rr.range(0.06, 0.2);
      return {
        th0: r3(rr.range(0, TAU)), w: r3((i % 5 === 4 ? -dirS : dirS) * rr.range(0.3, 0.52)), r: r3(rr.range(s.rMin + ra, s.rMax - ra)), ra: r3(ra), rp: r3(rr.range(0, TAU)),
        yf: r3(rr.range(0.1, 0.9)), ya: r3(rr.range(0.04, 0.14)), yp: r3(rr.range(0, TAU)), off: r3(rr.range(0, 0.3)), size: r3(rr.range(0.9, 1.15)),
      };
    });
    return { ...s, fish };
  });
}

/**
 * The whole plan. `arg` is a context (`ctx.plan`, `ctx.world.beachFront`, `ctx.world.beachSea`, `ctx.rng`) or `{ plan, front, sea, rng }` (the layers are made when missing).
 * Returns plain data: { seed, perches, solids, gulls, crabs, shoals, stats }.
 */
export function planShoreLife(arg, rngArg) {
  const isCtx = typeof arg.addSystem === 'function' || arg.world !== undefined;
  const plan = arg.plan, coast = plan.coast;
  const front = (isCtx ? arg.world?.beachFront : arg.front) ?? planFront(coast), sea = (isCtx ? arg.world?.beachSea : arg.sea) ?? planSea(coast);
  const rng = rngArg ?? (arg.rng ? arg.rng.fork('shorelife') : new Rng(((plan.seed ?? 1) ^ hashStr('shorelife')) >>> 0));
  const all = [...(front.solids ?? []).map(shapeOf), ...(sea.walls ?? []).map(shapeOf)];
  const solids = all.filter((sh) => { const [a, b] = zRange(sh); return b >= 126 && a <= 152; });       // what stands near the sand the crabs and the walking gull use (the rest cannot matter)
  const perches = planPerches(coast, front, sea, all, rng.fork('perches'));
  const rg = rng.fork('gulls'), seed = () => (rg.next() * 4294967296) >>> 0;

  const gulls = [];
  for (let k = 0; k < COUNT.soaring; k++) {                                       // five soaring gulls: wide slow circles over the shore, between z 120 and 175
    const R = rg.range(11, 19), cz = rg.range(RULES.soarZ[0] + R + 1, RULES.soarZ[1] - R - 1);
    gulls.push({
      id: 'gull.' + gulls.length, role: 'soar', seed: seed(),
      orbit: { cx: r3(-62 + 31 * k + rg.range(-7, 7)), cz: r3(cz), R: r3(R), dir: k % 2 ? 1 : -1, v: r3(rg.range(3.4, 5.4)), alt: r3(rg.range(7.5, 12.5)), th0: r3(rg.range(0, TAU)), wa: r3(rg.range(0.3, 0.7)), wp: r3(rg.range(0, TAU)), ww: r3(rg.range(0.18, 0.32)) },
    });
  }
  const pick = (kind, ok = () => true) => { const c = perches.filter((p) => p.kind === kind && ok(p)); return c.length ? rg.pick(c) : null; };
  const fallback = () => rg.pick(perches.filter((p) => p.kind === 'post'));
  for (const [role, kind] of [['kiosk', 'kiosk'], ['tower', 'tower'], ['groyne', 'groyne'], ['boat', 'boat'], ['sand', 'sand']]) {
    const p = pick(kind) ?? fallback();
    gulls.push({ id: 'gull.' + gulls.length, role, seed: seed(), perch: p.i, walker: role === 'sand' });
  }
  for (const [role, kind, ok] of [['lamp', 'lamp', (p) => p.z > 186], ['head', 'head', () => true]]) {     // two on the pier's head
    const p = pick(kind, ok) ?? fallback();
    gulls.push({ id: 'gull.' + gulls.length, role, seed: seed(), perch: p.i, walker: false });
  }
  const crabs = planCrabs(coast, solids, rng.fork('crabs'));
  const shoals = planShoals(coast, sea, rng.fork('shoals'));
  const fish = shoals.reduce((n, s) => n + s.fish.length, 0);
  return { seed: plan.seed ?? null, perches, solids, gulls, crabs, shoals, stats: { gulls: gulls.length, crabs: crabs.length, fish, cards: gulls.length + crabs.length + fish, perches: perches.length } };
}

// ------------------------------------------------------------------------------------------------------------------------------------ the world and the states
/**
 * What the steps look at besides the player: the coast, the plan's perches and footprints, which perch each gull holds, day or night, and the water: `depth(x, z, ahead = 0)` over the ground `ahead` seconds from now
 * and `level(x, z)` the swell's height now (the page passes the live swell; the default is the still sea).
 */
export function shoreWorld(coast, sl, o = {}) {
  return { coast, sl, perches: sl.perches, solids: sl.solids, taken: new Map(), day: true, depth: o.depth ?? ((x, z) => coast.depthAt(x, z)), level: o.level ?? (() => 0) };
}
const baseAt = (w, x, z) => Math.max(w.coast.heightAt(x, z), SEA);              // the ground, or the sea where it is under water: what "above the ground" is measured from

function initGull(rec, w) {
  const g = {
    id: rec.id, role: rec.role, r: new Rng(rec.seed), hidden: false, mode: 'perch', pose: 'stand', cell: STAND, roll: 0, inx: 0, inz: 0, x: 0, y: 0, z: 0, hx: 0, hz: 1,
    perch: -1, pu: 0, wx: 0, wz: 0, tx: 0, tz: 1, ph: 0, k: 0, dur: 1, from: null, to: null, v0: [0, 0], until: Infinity, orbit: null, fl: { glide: false, t0: 0, until: 0 }, walker: !!rec.walker, soar: rec.role === 'soar',
  };
  g.ph = g.r.range(0, 6);
  if (g.soar) {
    const o = rec.orbit;
    g.mode = 'circle'; g.pose = 'fly'; g.orbit = { cx: o.cx, cz: o.cz, R: o.R, w: (o.dir * o.v) / o.R, th: o.th0, alt: o.alt, wa: o.wa, wp: o.wp, ww: o.ww, t0: 0 };
    g.x = o.cx + o.R * Math.cos(o.th0); g.z = o.cz + o.R * Math.sin(o.th0); g.y = baseAt(w, g.x, g.z) + o.alt;
    g.hx = -o.dir * Math.sin(o.th0); g.hz = o.dir * Math.cos(o.th0);
    g.fl = { glide: g.r.chance(0.5), t0: 0, until: g.r.range(2.5, 5) };           // (a glide is never shorter than 2.5 s, the first one included)
  } else {
    const P = w.perches[rec.perch];
    g.perch = P.i; w.taken.set(P.i, g.id); g.x = P.x; g.y = P.y; g.z = P.z; g.hx = g.tx = P.hx; g.hz = g.tz = P.hz; g.pu = g.r.range(1, 6);
  }
  return g;
}

function initCrab(rec) {
  const r = new Rng(rec.seed);
  return { id: rec.id, x: rec.x, z: rec.z, hx: rec.hx, hz: rec.hz, w: rec.w, home: [rec.x, rec.z], r, mode: 'idle', u: r.range(0.5, 3), sink: 0, rem: 0, sx: 0, sz: 0, fz: 0, hid: 0, stuck: false };
}

function initShoal(rec) {
  return {
    id: rec.id, site: rec.id, species: rec.species, cx: rec.cx, cz: rec.cz, rMin: rec.rMin, rMax: rec.rMax,
    fish: rec.fish.map((f) => ({ ...f, ...fishExtent(rec.species, f.size), x: 0, y: 0, z: 0, hx: 1, hz: 0, tail: 0, vis: true, ox: 0, oz: 0 })),
  };
}

/** The states of every actor (and the world they share). `o.depth(x, z)` and `o.level(x, z)` are the water now. */
export function makeShoreLife(coast, sl, o = {}) {
  const w = shoreWorld(coast, sl, o);
  const S = { w, sl, t: 0, gulls: sl.gulls.map((g) => initGull(g, w)), crabs: sl.crabs.map(initCrab), shoals: sl.shoals.map(initShoal) };
  for (const c of S.crabs) if (wetSoon(w, c.x, c.z)) { c.mode = 'hidden'; c.sink = 1; c.hid = RULES.washFor; }      // the sea is over it at the start: it begins under the sand
  for (const s of S.shoals) stepShoal(s, 0, 0, { x: 1e9, y: 0, z: 1e9 }, w);
  return S;
}

/** One step of every actor; `player` is { x, y, z } (the feet). */
export function stepShoreLife(S, dt, player) {
  const t = (S.t += dt);
  for (const g of S.gulls) stepGull(g, dt, t, player, S.w);
  for (const c of S.crabs) stepCrab(c, dt, t, player, S.w);
  for (const s of S.shoals) stepShoal(s, dt, t, player, S.w);
  return S;
}

// ------------------------------------------------------------------------------------------------------------------------------------ gulls
/** Move to (x, y, z) and face the way of travel (smoothed). */
function moveGull(g, x, y, z, dt) {
  const dx = x - g.x, dz = z - g.z, l = hyp(dx, dz);
  if (l > 1e-4) { const k = Math.min(1, 8 * dt), hx = g.hx + (dx / l - g.hx) * k, hz = g.hz + (dz / l - g.hz) * k, n = hyp(hx, hz) || 1; g.hx = hx / n; g.hz = hz / n; }
  g.x = x; g.y = y; g.z = z;
}
const turnTo = (g, tx, tz, dt) => { const k = Math.min(1, 3 * dt), hx = g.hx + (tx - g.hx) * k, hz = g.hz + (tz - g.hz) * k, n = hyp(hx, hz) || 1; g.hx = hx / n; g.hz = hz / n; };

/** The lazy flap of a gull on the wing: bouts of whole cycles of the four flap cells, between glides on flap_level. */
function flapCell(g, t) {
  const f = g.fl;
  if (t >= f.until) {
    if (f.glide) { f.glide = false; f.t0 = t; f.until = t + g.r.int(2, 4) * (FLAP.length / 8); }
    else { f.glide = true; f.until = t + g.r.range(2.5, 6.5); }
  }
  g.cell = f.glide ? LEVEL : FLAP[Math.floor((t - f.t0) * 8) % FLAP.length];
}

/** Where a frightened gull may circle: over the sand and the sea, inside the plot's walls, never over the barrio's roofs (its lots end at z 100, the promenade's edge is z 108.8). */
const FLY = Object.freeze({ x: 90, z0: 108, z1: 198 });

function takeoff(g, t, p, w) {
  const r = g.r;
  let ax = g.x - p.x, az = g.z - p.z; const l = hyp(ax, az);
  if (l < 0.05) { ax = g.hx; az = g.hz; } else { ax /= l; az /= l; }
  const R = r.range(9, 15), dir = r.chance(0.5) ? 1 : -1, v = r.range(3.5, 5.2), alt = r.range(5, 9);
  const cx = clamp(g.x + ax * (R + 3), R - FLY.x, FLY.x - R), cz = clamp(g.z + az * (R + 3), FLY.z0 + R, FLY.z1 - R), th = Math.atan2(g.z - cz, g.x - cx) + dir * 1.05;     // a circle ahead of it (away from the player where the shore allows), joined 60 degrees along
  const ex = cx + R * Math.cos(th), ez = cz + R * Math.sin(th);
  g.mode = 'rise'; g.pose = 'fly'; g.k = 0; g.dur = clamp(hyp(ex - g.x, ez - g.z) / 4.5, 2.2, 3.6);
  g.from = [g.x, g.y + RULES.eye, g.z]; g.to = [ex, baseAt(w, ex, ez) + alt, ez];
  g.orbit = { cx, cz, R, w: (dir * v) / R, th, alt, wa: r.range(0.3, 0.7), wp: r.range(0, TAU), ww: r.range(0.18, 0.32), t0: t + g.dur };
  g.fl = { glide: false, t0: t, until: Infinity }; g.y += RULES.eye; g.cell = FLAP[0];             // (the first frame in the air is already a wing, not the standing cell)
  w.taken.delete(g.perch); g.perch = -1;
}

function choosePerch(g, p, w) {
  const list = [];
  for (const P of w.perches) {
    if (w.taken.has(P.i) || hyp(P.x - p.x, P.z - p.z) < 7) continue;
    const d = hyp(P.x - g.x, P.z - g.z); if (d < 10 || d > 100) continue;
    let crowded = false; for (const j of w.taken.keys()) if (hyp(w.perches[j].x - P.x, w.perches[j].z - P.z) < 1.3) { crowded = true; break; }
    if (!crowded) list.push(P);
  }
  return list.length ? g.r.pick(list) : null;
}

function beginLanding(g, t, p, w) {
  const P = choosePerch(g, p, w);
  if (!P) { g.until = t + 4; return; }
  const o = g.orbit, dist = hyp(P.x - g.x, P.z - g.z);
  w.taken.set(P.i, g.id); g.perch = P.i;
  g.mode = 'land'; g.k = 0; g.dur = clamp(dist / 4.2, 5, 16);
  g.from = [g.x, g.y, g.z]; g.to = [P.x, P.y + RULES.eye, P.z];
  const vx = -o.R * o.w * Math.sin(o.th), vz = o.R * o.w * Math.cos(o.th), sp = hyp(vx, vz), keep = sp > 1e-6 ? Math.min(g.dur * sp, 1.2 * dist) / sp : 0;   // leave at the orbit's own velocity (a tangent no longer than the way to go: it never loops)
  g.v0 = [vx * keep, vz * keep];
  g.fl = { glide: false, t0: t, until: Infinity };
}

/** Is (x, z) a place a gull may walk to? */
const sandWalk = (w, x, z) => sandBand(w.coast, x, z) && w.depth(x, z) <= -0.02 && clearOf(w.solids, x, z, 0.6);

function perchStep(g, dt, t, p, w) {
  if (w.day && hyp(p.x - g.x, p.z - g.z) < RULES.scare) return takeoff(g, t, p, w);
  turnTo(g, g.tx, g.tz, dt);
  g.pu -= dt;
  if (g.pose === 'walk') {
    const dx = g.wx - g.x, dz = g.wz - g.z, l = hyp(dx, dz), s = RULES.walk * dt;
    if (l <= s) { g.pose = 'stand'; g.pu = g.r.range(4, 10); g.cell = STAND; return; }
    const nx = g.x + (dx / l) * s, nz = g.z + (dz / l) * s;
    if (!sandWalk(w, nx, nz)) { g.pose = 'stand'; g.pu = g.r.range(3, 7); g.cell = STAND; return; }
    g.x = nx; g.z = nz; g.y = w.coast.heightAt(nx, nz); g.hx = g.tx = dx / l; g.hz = g.tz = dz / l;
    g.cell = WALK[Math.floor(t * 4 + g.ph) % 2];
    return;
  }
  if (g.pu <= 0) {
    if (g.walker && g.pose === 'stand' && w.perches[g.perch]?.kind === 'sand' && g.r.chance(0.6)) {          // (it walks only from the sand: landed on a post or a boat it stands there)
      const home = w.perches[g.perch], wx = home.x + g.r.range(-3.5, 3.5), wz = home.z + g.r.range(-1.5, 1.5);
      if (sandWalk(w, wx, wz)) { g.pose = 'walk'; g.wx = wx; g.wz = wz; return; }
    }
    if (g.pose === 'stand') { g.pose = 'clean'; g.pu = g.r.range(3, 6); }
    else { g.pose = 'stand'; g.pu = g.r.range(5, 12); if (g.r.chance(0.35)) { const a = g.r.range(-1.2, 1.2), c = Math.cos(a), s = Math.sin(a); g.tx = g.hx * c - g.hz * s; g.tz = g.hx * s + g.hz * c; } }
  }
  g.cell = g.pose === 'clean' ? CLEAN : STAND;
}

function riseStep(g, dt, t) {
  g.k = Math.min(1, g.k + dt / g.dur);
  const k = g.k, e = ease(k), up = Math.sin((k * Math.PI) / 2);
  moveGull(g, lerp(g.from[0], g.to[0], e), lerp(g.from[1], g.to[1], up), lerp(g.from[2], g.to[2], e), dt);
  g.cell = FLAP[Math.floor((t - g.fl.t0) * 10 + g.ph) % FLAP.length];
  if (k >= 1) { g.mode = 'circle'; g.until = t + g.r.range(...RULES.circle); g.fl = { glide: false, t0: t, until: t + 3 }; }
}

function circleStep(g, dt, t, p, w) {
  const o = g.orbit;
  o.th += o.w * dt;
  const x = o.cx + o.R * Math.cos(o.th), z = o.cz + o.R * Math.sin(o.th);
  moveGull(g, x, baseAt(w, x, z) + o.alt + o.wa * Math.sin(o.ww * (t - o.t0)), z, dt);
  g.inx = (o.cx - x) / o.R; g.inz = (o.cz - z) / o.R;
  const v = Math.abs(o.w) * o.R;
  g.roll += (Math.atan((v * v) / (o.R * 9.81)) - g.roll) * Math.min(1, 2 * dt);
  flapCell(g, t);
  if (t >= g.until) beginLanding(g, t, p, w);
}

function landStep(g, dt, t, w) {
  g.k = Math.min(1, g.k + dt / g.dur);
  const k = g.k, k2 = k * k, k3 = k2 * k, h00 = 2 * k3 - 3 * k2 + 1, h10 = k3 - 2 * k2 + k, h01 = -2 * k3 + 3 * k2;     // a cubic Hermite in x and z, from the orbit's velocity to rest at the perch
  const x = h00 * g.from[0] + h10 * g.v0[0] + h01 * g.to[0], z = h00 * g.from[2] + h10 * g.v0[1] + h01 * g.to[2];
  g.roll += (0 - g.roll) * Math.min(1, 3 * dt);
  moveGull(g, x, lerp(g.from[1], g.to[1], ease(k)), z, dt);
  g.cell = FLAP[Math.floor((t - g.fl.t0) * (k > 0.8 ? 12 : 8)) % FLAP.length];
  if (k >= 1) {
    const P = w.perches[g.perch];
    g.mode = 'perch'; g.pose = 'stand'; g.cell = STAND; g.x = P.x; g.y = P.y; g.z = P.z; g.roll = 0; g.tx = P.hx; g.tz = P.hz; g.pu = g.r.range(4, 9);
  }
}

/** One step of one gull. A gull is `hidden` at night (it is not drawn, and a hidden one is not frightened). */
export function stepGull(g, dt, t, p, w) {
  g.hidden = !w.day;
  if (g.mode === 'perch') perchStep(g, dt, t, p, w);
  else if (g.mode === 'rise') riseStep(g, dt, t);
  else if (g.mode === 'circle') circleStep(g, dt, t, p, w);
  else landStep(g, dt, t, w);
}

// ------------------------------------------------------------------------------------------------------------------------------------ crabs
const FLEE_V = RULES.fleeSpeed - 0.1;           // a hair under the limit, so no rounding crosses it
/** Is the sea over (x, z) now, or will it be within 0.4 s? Water deeper than 3 cm counts: that leaves 2 cm of the 5 cm limit for what happens between two samples (a crest is a few mm higher than its samples). */
export function wetSoon(w, x, z) { for (const a of RULES.look) if (w.depth(x, z, a) > RULES.washAt) return true; return false; }
/** May a crab be at (x, z) now: in its band, out of the water (the swell counts, and what it is about to bring), and clear of every footprint. */
export const crabOK = (w, x, z) => crabBand(w.coast, x, z) && !wetSoon(w, x, z) && clearOf(w.solids, x, z, 0.25);

function freeRun(w, c, dx, dz, max) {
  let n = 0;
  for (let s = 0.1; s <= max + 1e-9; s += 0.1) { if (!crabOK(w, c.x + dx * s, c.z + dz * s)) break; n = s; }
  return n;
}
/** Run sideways, away from the player, for as far as the band is free (3 m at most). False when neither way is free for 0.4 m: the crab cannot run. */
function startFlee(c, p, w) {
  const hl = hyp(c.hx, c.hz) || 1, rx = -c.hz / hl, rz = c.hx / hl, best = (c.x - p.x) * rx + (c.z - p.z) * rz >= 0 ? 1 : -1;          // (a unit side axis: the plan's heading is rounded to 3 decimals)
  for (const s of [best, -best]) {
    const L = freeRun(w, c, rx * s, rz * s, RULES.fleeMax);
    if (L >= 0.4) { c.mode = 'flee'; c.rem = L; c.sx = rx * s; c.sz = rz * s; c.stuck = false; return true; }
  }
  c.stuck = true; return false;
}
function advance(c, dt, v, w) {
  const m = Math.min(c.rem, v * dt), nx = c.x + c.sx * m, nz = c.z + c.sz * m;
  if (!crabOK(w, nx, nz)) { c.rem = 0; return; }
  c.x = nx; c.z = nz; c.rem -= m;
}
const bury = (c, secs = RULES.sinkFor) => { c.mode = 'sink'; c.hid = secs; };

/** One step of one crab. Modes: idle, step (a small step sideways), flee, freeze, sink / hidden / rise (buried for 8 s from the player, for 3 s from the sea). */
export function stepCrab(c, dt, t, p, w) {
  const d = hyp(p.x - c.x, p.z - c.z);
  if (c.mode === 'sink') { c.hid -= dt; c.sink = Math.min(1, c.sink + dt / 0.3); if (c.sink >= 1) c.mode = 'hidden'; return; }
  if (c.mode === 'hidden') { c.hid -= dt; if (c.hid <= 0 && crabOK(w, c.x, c.z)) c.mode = 'rise'; return; }
  if (wetSoon(w, c.x, c.z)) return bury(c, RULES.washFor);                // the sea is coming over it (or coming back over it as it rises): it goes under until the water has gone
  if (c.mode === 'rise') { c.sink = Math.max(0, c.sink - dt / 0.5); if (c.sink <= 0) { c.mode = 'freeze'; c.fz = t; } return; }
  if (c.mode === 'flee') { advance(c, dt, FLEE_V, w); if (c.rem <= 0) { c.mode = 'freeze'; c.fz = t; } return; }
  if (c.mode === 'freeze') {
    if (d < RULES.sinkAt) { if (!startFlee(c, p, w)) bury(c); }
    else if (d > 6 || t - c.fz > 12) { c.mode = 'idle'; c.u = c.r.range(1.5, 4); }
    return;
  }
  if (d < RULES.fleeAt) {
    if (!startFlee(c, p, w)) { if (d < RULES.sinkAt) bury(c); else { c.mode = 'freeze'; c.fz = t; } }
    return;
  }
  if (c.mode === 'step') { advance(c, dt, 0.3, w); if (c.rem <= 0) { c.mode = 'idle'; c.u = c.r.range(1.2, 4.5); } return; }
  c.u -= dt;
  if (c.u > 0) return;
  const hl = hyp(c.hx, c.hz) || 1, rx = -c.hz / hl, rz = c.hx / hl, away = (c.home[0] - c.x) * rx + (c.home[1] - c.z) * rz;       // a short step sideways, back toward home when it has strayed
  const s = Math.abs(away) > 1.6 ? Math.sign(away) : c.r.chance(0.5) ? 1 : -1, len = c.r.range(0.04, 0.12);
  if (crabOK(w, c.x + rx * s * len, c.z + rz * s * len)) { c.mode = 'step'; c.rem = len; c.sx = rx * s; c.sz = rz * s; }
  else c.u = c.r.range(1, 3);
}

// ------------------------------------------------------------------------------------------------------------------------------------ fish
/** One step of one shoal: the fish circle their site on loose orbits (analytic in t), a swimmer pushes the ones near him aside, and each is held clear of the surface (the swell counts) and of the seabed. */
export function stepShoal(s, dt, t, p, w) {
  for (const f of s.fish) {
    const th = f.th0 + f.w * t, rr = f.r + f.ra * Math.sin(f.rp + 0.37 * t), c = Math.cos(th), sn = Math.sin(th);
    const dr = f.ra * 0.37 * Math.cos(f.rp + 0.37 * t), vx = dr * c - rr * f.w * sn, vz = dr * sn + rr * f.w * c, vl = hyp(vx, vz) || 1;
    const bx = s.cx + rr * c, bz = s.cz + rr * sn, dx = bx + f.ox - p.x, dz = bz + f.oz - p.z, d = hyp(dx, dz);
    if (d < 2.2 && Math.abs(p.y + 0.9 - f.y) < 2.5) { const push = (2.2 - d) * 1.5 * dt / (d || 1); f.ox += dx * push; f.oz += dz * push; }
    else { const k = Math.exp(-dt / 1.2); f.ox *= k; f.oz *= k; }
    const o = hyp(f.ox, f.oz); if (o > 0.4) { f.ox *= 0.4 / o; f.oz *= 0.4 / o; }
    let x = bx + f.ox, z = bz + f.oz;
    if (!fishZone(w.coast, x, z)) { f.ox = f.oz = 0; x = bx; z = bz; }
    const bed = w.coast.heightAt(x, z), hi = SEA + w.level(x, z) - RULES.fishTop - f.above, lo = bed + RULES.fishBed + f.below;
    const y0 = lerp(lo, SEA - RULES.fishTop - f.above, f.yf) + f.ya * Math.sin(f.yp + 0.6 * t);
    f.x = x; f.z = z; f.y = hi >= lo ? clamp(y0, lo, hi) : (lo + hi) / 2;
    f.hx = vx / vl; f.hz = vz / vl; f.tail = Math.floor((t + f.off) / RULES.tail) & 1;
  }
}

// ------------------------------------------------------------------------------------------------------------------------------------ cards (pure: typed arrays in, typed arrays out)
/** n cards: 4 vertices each (positions, uvs, normals all up) and 12 indices (both windings). */
export function makeCards(n) {
  const nor = new Float32Array(n * 12), idx = new Uint16Array(n * 12);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) nor[i * 12 + k * 3 + 1] = 1;
    const b = i * 4; idx.set([b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2], i * 12);
  }
  return { n, pos: new Float32Array(n * 12), uv: new Float32Array(n * 8), nor, idx, uvDirty: false };
}
const hide = (cd, i, x, y, z) => { const p = cd.pos, o = i * 12; for (let k = 0; k < 4; k++) { p[o + k * 3] = x; p[o + k * 3 + 1] = y; p[o + k * 3 + 2] = z; } };
/** The texture's uvs of a cell (manifest uv [u0, v0, u1, v1], v from the image's top): bottom-left, bottom-right, top-right, top-left. */
function putUV(cd, i, uv) {
  const a = cd.uv, o = i * 8, u0 = uv[0], u1 = uv[2], vt = 1 - uv[1], vb = 1 - uv[3];
  if (a[o] !== u0 || a[o + 1] !== vb || a[o + 2] !== u1 || a[o + 5] !== vt) cd.uvDirty = true;
  a[o] = u0; a[o + 1] = vb; a[o + 2] = u1; a[o + 3] = vb; a[o + 4] = u1; a[o + 5] = vt; a[o + 6] = u0; a[o + 7] = vt;
}
/** The quad of a card standing on its pivot A: `r` the way the sprite faces (its +x), `u` its up, `left`, `right`, `up`, `down` the metres from the pivot to the four edges. */
function putQuad(cd, i, ax, ay, az, rx, ry, rz, ux, uy, uz, left, right, up, down) {
  const p = cd.pos, o = i * 12;
  p[o] = ax - rx * left - ux * down; p[o + 1] = ay - ry * left - uy * down; p[o + 2] = az - rz * left - uz * down;
  p[o + 3] = ax + rx * right - ux * down; p[o + 4] = ay + ry * right - uy * down; p[o + 5] = az + rz * right - uz * down;
  p[o + 6] = ax + rx * right + ux * up; p[o + 7] = ay + ry * right + uy * up; p[o + 8] = az + rz * right + uz * up;
  p[o + 9] = ax - rx * left + ux * up; p[o + 10] = ay - ry * left + uy * up; p[o + 11] = az - rz * left + uz * up;
}

/** Keep a card's right axis (rx, rz) from going edge-on to the eye at `cam`: turn it about the vertical axis until at least `min` of the card shows. Returns [rx, rz]. `g.sgn` remembers which way it turned. */
function turnFromEye(g, rx, rz, ax, ay, az, cam, min) {
  const vx = cam.x - ax, vz = cam.z - az, vl = hyp(vx, vz), v = hyp(vl, cam.y - ay);
  if (vl < 1e-6 || v < 1e-6) return [rx, rz];
  const cosE = vl / v, need = min / cosE;                       // the card shows cosE x sin(angle between its axis and the line of sight)
  if (need >= 1) return [rx, rz];
  const ux = vx / vl, uz = vz / vl, cr = rx * uz - rz * ux, dot = rx * ux + rz * uz, ang = Math.atan2(Math.abs(cr), dot), a0 = Math.asin(need);
  if (Math.abs(cr) > 0.05) g.sgn = cr > 0 ? -1 : 1; else if (!g.sgn) g.sgn = 1;      // the side of the line of sight the heading is on (an angle's sign: r = v turned by theta gives cr = -sin theta); kept while it is near the line
  if (ang >= a0 && ang <= Math.PI - a0) return [rx, rz];
  const a = ang < a0 ? a0 : Math.PI - a0, th = Math.atan2(uz, ux) + g.sgn * a;
  return [Math.cos(th), Math.sin(th)];
}

/** Write a gull's card (index i). `cam` is the eye { x, y, z } (or null: the card then keeps its heading). */
export function gullCard(cd, i, g, cam) {
  if (g.hidden) return hide(cd, i, g.x, g.y, g.z);
  const c = GULL.cells[g.cell], m = GULL.mpp, W = GULL.cellPx[0] * m, H = GULL.cellPx[1] * m, air = g.mode !== 'perch';
  const ay = air ? g.y : g.y + walkDrop(c), ax = g.x, az = g.z;
  let rx = g.hx, rz = g.hz; const n = hyp(rx, rz) || 1; rx /= n; rz /= n;
  if (cam) [rx, rz] = turnFromEye(g, rx, rz, ax, ay, az, cam, 0.55);
  let ux = 0, uy = 1, uz = 0;
  if (air && g.roll > 0.001) { const s = Math.sin(g.roll); ux = s * g.inx; uy = Math.cos(g.roll); uz = s * g.inz; const d = ux * rx + uz * rz; ux -= d * rx; uz -= d * rz; const l = hyp(ux, uy, uz); ux /= l; uy /= l; uz /= l; }
  putQuad(cd, i, ax, ay, az, rx, 0, rz, ux, uy, uz, c.pivot[0] * W, (1 - c.pivot[0]) * W, c.pivot[1] * H, (1 - c.pivot[1]) * H);
  putUV(cd, i, c.uv);
}

/** Write a fish's card. `sp` is its species' name, `cam` the eye (or null: the card is vertical, along its heading). Beyond RULES.fishShow metres from the eye it is not drawn. */
export function fishCard(cd, i, f, species, cam) {
  const sp = FISH.species[species], ax = f.x, ay = f.y, az = f.z;
  if (!f.vis || (cam && hyp(cam.x - ax, cam.y - ay, cam.z - az) > RULES.fishShow)) return hide(cd, i, ax, ay, az);
  const m = (sp.len / sp.body) * f.size, W = sp.px[0] * m, H = sp.px[1] * m;
  let rx = f.hx, rz = f.hz; const n = hyp(rx, rz) || 1; rx /= n; rz /= n;
  let ux = 0, uy = 1, uz = 0;
  if (cam) {                                                    // tilt the card about the body axis so that at least 45 % of it shows from the eye
    const vx = cam.x - ax, vy = cam.y - ay, vz = cam.z - az, v = hyp(vx, vy, vz) || 1, a = (-rz * vx + rx * vz) / v, b = -vy / v, R = hyp(a, b), min = 0.45;
    if (Math.abs(a) < min && R > 1e-6) {
      const phi = Math.atan2(b, a); let beta = phi;
      if (R > min) { const gm = Math.acos(min / R); beta = Infinity; for (const k of [-1, 0, 1]) for (const s of [-1, 1]) { const q = phi + s * gm + k * Math.PI; if (Math.abs(q) < Math.abs(beta)) beta = q; } }
      ux = Math.sin(beta) * -rz; uy = Math.cos(beta); uz = Math.sin(beta) * rx;
    }
  }
  const uv = f.tail ? sp.uv.b : sp.uv.a;
  putQuad(cd, i, ax, ay, az, rx, 0, rz, ux, uy, uz, sp.pivot[0] * W, (1 - sp.pivot[0]) * W, sp.pivot[1] * H, (1 - sp.pivot[1]) * H);
  putUV(cd, i, uv);
}

/** Write a crab's card: flat on the sand, its claws forward (the cell's top), sunk by `c.sink` of 6 cm. `y` is the sand's height here. */
export function crabCard(cd, i, c, y, cam) {
  if (c.sink >= 0.98 || (cam && hyp(cam.x - c.x, cam.z - c.z) > 60)) return hide(cd, i, c.x, y - 0.1, c.z);
  const h = (c.w * CRAB.px) / CRAB.content / 2, fx = c.hx * h, fz = c.hz * h, rx = -c.hz * h, rz = c.hx * h, cy = y + 0.012 - 0.06 * c.sink, p = cd.pos, o = i * 12;
  p[o] = c.x - rx - fx; p[o + 1] = cy; p[o + 2] = c.z - rz - fz;           // bottom-left
  p[o + 3] = c.x + rx - fx; p[o + 4] = cy; p[o + 5] = c.z + rz - fz;       // bottom-right
  p[o + 6] = c.x + rx + fx; p[o + 7] = cy; p[o + 8] = c.z + rz + fz;       // top-right
  p[o + 9] = c.x - rx + fx; p[o + 10] = cy; p[o + 11] = c.z - rz + fz;     // top-left
  putUV(cd, i, CRAB.uv);
}

// ------------------------------------------------------------------------------------------------------------------------------------ the page
const textureLoader = (THREE) => (file) => new Promise((resolve, reject) => {
  new THREE.TextureLoader().load(new URL(file, new URL('../../assets/textures/beach/', import.meta.url)).href, resolve, undefined, () => reject(new Error('shorelife: cannot load ' + file)));
});

/**
 * The page's part: plan, states, three meshes (the gull sheet, the fish sheet, the crab sheet: one draw call each), ONE group `props.shorelife` and ONE system `world.shorelife` (order 41).
 * io: { hidden: leave the group hidden for the caller to show once it is warm (LateWarm), load: (file) => Promise<texture> (Node tests pass a stand-in; the page reads the PNGs) }.
 * A sheet that does not arrive is reported in ctx.errors and left out; the rest still draws. Resolves with { groups, stats, ... }, or null when there is no coast.
 */
export async function loadShoreLife(ctx, io = {}) {
  const THREE = ctx.THREE, coast = ctx.plan?.coast;
  if (!THREE || !coast) return null;
  // The water the actors see is the sea's own (engine/water.js `ctx.sea`: depth(x, z, t) and level(x, z)), now and `ahead` seconds on; without it (a Node test) the still sea.
  const swell = ctx.sea ? { depth: (x, z, ahead = 0) => (ahead ? ctx.sea.depth(x, z, ctx.sea.time + ahead) : ctx.sea.depth(x, z)), level: (x, z) => ctx.sea.level(x, z) } : {};
  const sl = planShoreLife(ctx), S = makeShoreLife(coast, sl, swell), w = S.w;
  const load = io.load ?? textureLoader(THREE), errors = (ctx.errors ??= []), tex = {};
  await Promise.all([['gull', GULL.file], ['fish', FISH.file], ['crab', CRAB.file]].map(async ([key, file]) => {
    try {
      const t = await load(file);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ctx.matlib?.anisotropy ?? ctx.renderer?.capabilities?.getMaxAnisotropy?.() ?? 4;
      tex[key] = t;
    } catch (e) { errors.push({ stage: 'shorelife', item: file, message: String(e?.message ?? e) }); }
  }));
  const nG = S.gulls.length, nC = S.crabs.length, fishes = S.shoals.flatMap((s) => s.fish.map((f) => ({ f, species: s.species })));
  // The ghost crab is the colour of the sand it lives on: a tint a little darker and warmer than the sheet keeps it from vanishing into the sunlit beach (and the offset keeps its flat card clear of the sand).
  // The fish are drawn just AFTER the sea's own layer (engine/water.js asks whatever lies under the sea to be drawn before it, renderOrder < -10, to be blended by it): the sea is 73 to 96 % opaque over the
  // 1.5 m and more of water a fish needs, so a fish blended by it is 4 to 27 % of itself and cannot be seen from the pier at all. Drawn over the layer at 80 % it is a small, clear fish under a clear sea.
  const parts = [['gull', nG, 'shore.gulls', {}, 0], ['fish', fishes.length, 'shore.fish', { transparent: true, opacity: FISH_OPACITY, depthWrite: true }, FISH_ORDER],
    ['crab', nC, 'shore.crabs', { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, color: new THREE.Color(0.62, 0.57, 0.5) }, 0]];
  const group = new THREE.Group(); group.name = 'props.shorelife'; group.userData.noMerge = true; group.visible = io.hidden !== true;
  const cards = {}, meshes = [], keys = [];
  for (const [key, n, name, extra, order] of parts) {
    if (!tex[key]) continue;
    const cd = makeCards(n), geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(cd.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(cd.nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(cd.uv, 2).setUsage(THREE.DynamicDrawUsage));
    geo.setIndex(new THREE.BufferAttribute(cd.idx, 1));
    const mat = new THREE.MeshStandardMaterial({ map: tex[key], alphaTest: 0.4, roughness: 1, metalness: 0, envMapIntensity: 0.45, ...extra });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = name; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false; mesh.matrixAutoUpdate = false; mesh.updateMatrix(); mesh.userData.noMerge = true; mesh.renderOrder = order;
    group.add(mesh); cards[key] = cd; meshes.push(mesh); keys.push(key);
  }
  const write = () => {
    const cam = ctx.camera?.position ?? null;
    if (cards.gull) S.gulls.forEach((g, i) => gullCard(cards.gull, i, g, cam));
    if (cards.fish) fishes.forEach(({ f, species }, i) => fishCard(cards.fish, i, f, species, cam));
    if (cards.crab) S.crabs.forEach((c, i) => crabCard(cards.crab, i, c, coast.heightAt(c.x, c.z), cam));
    meshes.forEach((mesh, n) => {
      const cd = cards[keys[n]], g = mesh.geometry;
      g.attributes.position.needsUpdate = true; if (cd.uvDirty) { g.attributes.uv.needsUpdate = true; cd.uvDirty = false; }
    });
  };
  let broken = false;
  const tick = (dt) => {
    if (broken) return;
    try {
      const p = ctx.player?.s; if (!p) return;                  // an eager boot has no player yet
      w.day = (ctx.night ?? 0) < 0.5;
      stepShoreLife(S, clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1), p);
      write();
    } catch (e) {
      broken = true;
      errors.push({ stage: 'shorelife', item: 'world.shorelife', message: String(e?.message ?? e), stack: e?.stack });
    }
  };
  if (!meshes.length) { const stats = { gulls: 0, crabs: 0, fish: 0, tris: 0, calls: 0 }; (ctx.world ??= {}).shorelife = stats; return { groups: [], stats, plan: sl, state: S, tick, meshes }; }
  try { stepShoreLife(S, 0, { x: 1e9, y: 0, z: 1e9 }); write(); } catch (e) { errors.push({ stage: 'shorelife', item: 'first pose', message: String(e?.message ?? e), stack: e?.stack }); }
  ctx.scene.add(group);
  ctx.addSystem('world.shorelife', tick, 41);
  const count = (key, n) => (cards[key] ? n : 0), cardsN = count('gull', nG) + count('fish', fishes.length) + count('crab', nC);
  const stats = { gulls: count('gull', nG), crabs: count('crab', nC), fish: count('fish', fishes.length), tris: cardsN * 4, calls: meshes.length };
  (ctx.world ??= {}).shorelife = stats;
  const result = { groups: [group], stats, plan: sl, state: S, world: w, tick, meshes, cards };
  ctx.shoreLife = result;
  return result;
}
