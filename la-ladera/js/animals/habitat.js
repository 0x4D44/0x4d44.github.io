// Where the barrio's animals live, and when they are about. Pure placement: it READS the plan, the nav graph and the physics, adds nothing to any of them, and draws only from its own
// seeded stream, so every load puts the same cat on the same doorstep (js/animals/index.js attaches the models and walks them).
import { makeRng } from '../core/rng.js';
import { standClear } from '../people/sim.js';

const STREETS = new Set(['street', 'alley', 'path']);
const SHOPS = new Set(['cornerstore', 'shophouse', 'kiosk']);
const LIVING = new Set(['perro', 'guardian', 'gallinas', 'palomas']);       // js/world/life.js: the dogs, the hen pen and the cable pigeons the barrio already has
const MIN_APART = 4, MIN_FROM_SPAWN = 6, MIN_FROM_LIFE = 6, MIN_FROM_DOOR = 1.0;   // metres
const PARAPET_TOP = 1.4;        // the parapet or brick pretil round a walkable roof (arch/roof.js PARAPET_H and PRETIL_H are 1.2 m) and its coping: a roof animal is seen over this or not at all

/**
 * The ten animals, nearest the arrival first so the first frames are alive. `habitat` is the kind of place it lives in (see `spots` below), `focus` what the distance `r` is measured from
 * (the arrival point, the Virgin's shrine, the chapel's square) and `far` the distance from the arrival when the habitat is missing and the role falls back (a plan without lots, a test grid).
 */
export const ROLES = Object.freeze([
  { key: 'cat', habitat: 'doorstep', focus: 'spawn', r: 16, far: 9 },                // on a doorstep of the arrival street
  { key: 'parrot_caged', habitat: 'shopfront', focus: 'spawn', r: 28, far: 14 },     // hung beside the door of a shop
  { key: 'dog', habitat: 'street', focus: 'spawn', r: 40, far: 19 },                 // a street dog at the kerb (the barrio's sleeping dog of life.js is 7 m from the arrival: not beside it)
  { key: 'pigeon', habitat: 'shrine', focus: 'shrine', r: 3, far: 24 },              // pecking in the square of the Virgin
  { key: 'hen', habitat: 'alley', focus: 'spawn', r: 70, far: 30 },                  // scratching in a lane
  { key: 'mule', habitat: 'site', focus: 'spawn', r: 85, far: 39 },                  // by a building site, where the bricks go up the hill on its back
  { key: 'canary_caged', habitat: 'doorstep', focus: 'spawn', r: 100, far: 48 },     // by a house door
  { key: 'cat', habitat: 'chapel', focus: 'chapel', r: 4, far: 57 },                 // the square of the chapel
  { key: 'dog', habitat: 'roof', focus: 'spawn', r: 30, far: 66 },                   // a dog on a terrace, watching the street
  { key: 'pigeon', habitat: 'plaza', focus: 'spawn', r: 50, far: 75 },               // a square
]);
const FALLBACK = {
  doorstep: ['doorstep', 'street'], shopfront: ['shopfront', 'doorstep', 'street'], street: ['street'], shrine: ['shrine', 'plaza', 'street'], alley: ['alley', 'street'],
  site: ['site', 'street'], chapel: ['chapel', 'plaza', 'street'], roof: ['roof', 'plaza', 'street'], plaza: ['plaza', 'court', 'street'],
};

/** Hours of the day (the world's 24 h clock) when each species is at rest, and whether it then goes out of sight: the dogs sleep at the door, the cats nap through the heat, the pigeons and
 * the hens are in their loft and their coop, the mule is tied up, the cages are covered and still. Nothing else about a species changes with the hour. */
export const HABIT = Object.freeze({
  dog: { rest: [22, 6] }, cat: { rest: [12, 16] }, pigeon: { rest: [19.5, 5.5], roost: true }, hen: { rest: [19, 6], roost: true }, mule: { rest: [18.5, 6] },
  parrot_caged: { rest: [20, 6.5] }, canary_caged: { rest: [20, 6.5] },
});
export function restsAt(key, hour) {
  const r = HABIT[key]?.rest; if (!r || !Number.isFinite(hour)) return false;
  return r[0] <= r[1] ? hour >= r[0] && hour < r[1] : hour >= r[0] || hour < r[1];
}
export const roostsAt = (key, hour) => !!HABIT[key]?.roost && restsAt(key, hour);

const boxOf = (plaza) => {
  const xs = plaza.poly.map((p) => p[0]), zs = plaza.poly.map((p) => p[1]);
  return { x0: Math.min(...xs) - 0.5, x1: Math.max(...xs) + 0.5, z0: Math.min(...zs) - 0.5, z1: Math.max(...zs) + 0.5 };
};
const inBox = (b, x, z) => !!b && x >= b.x0 && x <= b.x1 && z >= b.z0 && z <= b.z1;

/** The direction the street runs at node `n` (unit x, z): from its first two neighbours, or the one it has. */
function lineOf(nav, n) {
  const nb = (nav.adj[n.i] ?? []).map((j) => nav.nodes[j]);
  let tx = 1, tz = 0;
  if (nb.length > 1) { tx = nb[0].x - nb[1].x; tz = nb[0].z - nb[1].z; } else if (nb.length) { tx = nb[0].x - n.x; tz = nb[0].z - n.z; }
  const l = Math.hypot(tx, tz) || 1; return [tx / l, tz / l];
}

/** How far (x, z) lies from the axis of the plan street `s` (its polyline of points). */
function axisDist(s, x, z) {
  let best = Infinity;
  for (let k = 0; k + 1 < s.pts.length; k++) {
    const [ax, az] = s.pts[k], [bx, bz] = s.pts[k + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz;
    const t = l2 > 1e-9 ? Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - ax - vx * t, z - az - vz * t));
  }
  return best;
}
/** The street (of the plan's `streets`) whose axis passes within 1.5 m of (x, z), or null. */
function streetAt(streets, x, z) {
  let best = null, bd = 1.5;
  for (const s of streets) { const d = axisDist(s, x, z); if (d < bd) { bd = d; best = s; } }
  return best;
}

/** The places of every habitat, each a lazy list of candidate spots { x, z, y (the level they hang off), node, ry? }; the planner ranks them and checks the first that fit. */
function habitats(ctx, world) {
  const nav = world.nav, plan = ctx.plan ?? {}, lots = plan.lots ?? [], plazas = plan.plazas ?? [], shrine = ctx.world?.shrine ?? null;
  const streets = (plan.streets ?? []).filter((s) => s.pts?.length >= 2 && Number.isFinite(s.width));
  /** The spots beside node `n` at the kerb: on its street's pavement (world/plan.js SIDEWALK: the outer 0.9 m of the width) or the apron behind it, not in the carriageway and not in the mouth
   * of a side street (where the pavement is dropped). A plan with no streets (a test grid) gets a line 1 to 2.3 m off the walked one. */
  const kerbSpots = (n) => {
    const st = streets.length ? streetAt(streets, n.x, n.z) : null; if (!st) return beside(n, [1.0, 1.7, 2.3]);
    const hw = st.width / 2, offs = (st.sidewalk ? [hw - 0.45, hw - 0.2, hw + 0.25] : [hw - 0.5, hw - 0.9]).filter((o) => o >= 0.7);
    return beside(n, offs.length ? offs : [1.0]).filter((p) => !streets.some((s) => s !== st && axisDist(s, p.x, p.z) < s.width / 2 + 0.5));
  };
  const usable = (n) => world.inMain(n.i) && n.kind !== 'stair';
  const plazaById = new Map(plazas.map((p) => [p.id, p]));
  const shrineBox = shrine && plazaById.has(shrine.plaza) ? boxOf(plazaById.get(shrine.plaza)) : null;
  const chapel = lots.find((l) => l.kind === 'chapel'), chapelBox = chapel && plazaById.has(chapel.front) ? boxOf(plazaById.get(chapel.front)) : null;
  const cache = new Map(), memo = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
  /** Beside node `n`: `offs` metres off the walked line, both sides, facing along the street one way or the other. */
  const beside = (n, offs) => {
    const [tx, tz] = lineOf(nav, n), out = [];
    for (const o of offs) for (const side of [1, -1]) out.push({ x: n.x - tz * o * side, z: n.z + tx * o * side, y: n.y, node: n.i, ry: Math.atan2(tx, tz) + (side > 0 ? 0 : Math.PI) });
    return out;
  };
  /** Beside a door: along the facade, `offs` metres either side of it and a step out, facing the street. */
  const doorSpots = (pick, offs) => lots.filter(pick).flatMap((lot) => {
    const o = lot.entrance?.outside; if (!o) return [];
    const i = nav.nearest(o[0], o[2], 2.5, o[1]); if (i < 0 || !world.inMain(i)) return [];
    const d = nav.nodes[i], to = (nav.adj[i] ?? []).map((j) => nav.nodes[j]).sort((a, b) => Math.hypot(a.x - d.x, a.z - d.z) - Math.hypot(b.x - d.x, b.z - d.z))[0]; if (!to) return [];
    const l = Math.hypot(to.x - d.x, to.z - d.z) || 1, ux = (to.x - d.x) / l, uz = (to.z - d.z) / l, out = [];     // (ux, uz): from the door out to the street
    for (const off of offs) for (const side of [1, -1]) out.push({ x: d.x - uz * off * side + ux * 0.25, z: d.z + ux * off * side + uz * 0.25, y: d.y, node: i, ry: Math.atan2(ux, uz), back: [-ux, -uz] });
    return out;
  });
  const squareNodes = (box, kinds = ['plaza', 'court']) => nav.nodes.filter((n) => usable(n) && kinds.includes(n.kind) && inBox(box, n.x, n.z)).map((n) => ({ x: n.x, z: n.z, y: n.y, node: n.i }));
  const roofs = () => lots.flatMap((lot) => {
    const bp = ctx.buildings?.get?.(lot.id), roof = bp?.roof; if (!roof?.walkable || !(roof.poly?.length >= 3)) return [];
    const c = roof.poly.reduce((s, p) => [s[0] + p[0] / roof.poly.length, s[1] + p[1] / roof.poly.length], [0, 0]), out = [];
    const rr = Math.max(...roof.poly.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
    // (a roof with no street at its own height or above it within sight range is never seen over its parapet: no spots, and no lines of sight to try)
    if (!nav.nodes.some((q) => usable(q) && q.kind !== 'door' && q.y >= roof.y - 1.5 && Math.hypot(q.x - c[0], q.z - c[1]) <= 35 + rr)) return [];
    for (let k = 0; k < roof.poly.length; k++) {                                                    // a point on each edge, a step in from the parapet, facing out
      const a = roof.poly[k], b = roof.poly[(k + 1) % roof.poly.length], len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 3) continue;
      for (const t of [0.3, 0.5, 0.7]) {
        const x = a[0] + (b[0] - a[0]) * t, z = a[1] + (b[1] - a[1]) * t, dx = c[0] - x, dz = c[1] - z, dl = Math.hypot(dx, dz) || 1;
        const px = x + (dx / dl) * 1.0, pz = z + (dz / dl) * 1.0, n = nav.nearest(px, pz, 25), below = n >= 0 ? roof.y - nav.nodes[n].y : 99;
        out.push({ x: px, z: pz, y: roof.y, node: n, ry: Math.atan2(-dx, -dz), rise: below, watched: { inset: 1.0, top: roof.y + PARAPET_TOP } });   // `watched`: only where somebody can see it (planAnimals)
      }
    }
    return out;
  });
  return {
    street: () => memo('street', () => nav.nodes.filter((n) => usable(n) && STREETS.has(n.kind)).flatMap(kerbSpots)),
    alley: () => memo('alley', () => nav.nodes.filter((n) => usable(n) && (n.kind === 'alley' || n.kind === 'path')).flatMap((n) => beside(n, [0.4, 0.8]))),
    doorstep: () => memo('doorstep', () => doorSpots((l) => !SHOPS.has(l.kind) && l.kind !== 'chapel' && l.kind !== 'school', [1.3, 1.8, 2.4])),
    shopfront: () => memo('shopfront', () => doorSpots((l) => SHOPS.has(l.kind) || !!l.shop, [1.2, 1.7])),
    site: () => memo('site', () => lots.filter((l) => l.kind === 'unfinished' || l.kind === 'workshop').flatMap((lot) => {
      const o = lot.entrance?.outside, i = o ? nav.nearest(o[0], o[2], 2.5, o[1]) : -1; if (i < 0 || !world.inMain(i)) return [];
      const j = (nav.adj[i] ?? []).find((k) => STREETS.has(nav.nodes[k].kind)), s = nav.nodes[j ?? i];
      const near = (p) => Math.hypot(p.x - o[0], p.z - o[2]);
      return [s, ...(nav.adj[s.i] ?? []).map((k) => nav.nodes[k]).filter((n) => STREETS.has(n.kind))]
        .flatMap((n) => kerbSpots(n).filter((p) => near(p) < near(n)));                                // the street at the site and the stretch either side of it, at the kerb on the site's side
    })),
    shrine: () => memo('shrine', () => (shrineBox ? squareNodes(shrineBox) : [])),
    chapel: () => memo('chapel', () => (chapelBox ? squareNodes(chapelBox) : [])),
    plaza: () => memo('plaza', () => nav.nodes.filter((n) => usable(n) && n.kind === 'plaza' && !inBox(shrineBox, n.x, n.z) && !inBox(chapelBox, n.x, n.z)).map((n) => ({ x: n.x, z: n.z, y: n.y, node: n.i }))),
    court: () => memo('court', () => squareNodes({ x0: -1e9, x1: 1e9, z0: -1e9, z1: 1e9 }, ['court'])),
    roof: () => memo('roof', roofs),
    any: () => memo('any', () => nav.nodes.filter(usable).map((n) => ({ x: n.x, z: n.z, y: n.y, node: n.i }))),
  };
}

/** The street-clutter library (js/world/clutter.js) sets crates, chairs, bins and the like into the barrio as instanced meshes with no collider of their own, so the physics cannot say an animal is standing in one.
 * The low pieces count (their box is their footprint, turned by their yaw); a pole's cross-arm or an umbrella's canopy is overhead, and what is solid of them is a physics post already. */
const LOW_CLUTTER = 1.6;     // metres: a piece taller than this is not a thing an animal could be standing on
function lowClutter(ctx) {
  const C = ctx.clutter; if (!C?.records?.length) return [];
  return C.records.flatMap((r) => {
    const size = C.size?.(r.key), [sx, sy, sz] = r.scale ?? [1, 1, 1]; if (!size || size[1] * sy > LOW_CLUTTER) return [];
    return [{ x: r.x, y: r.y, z: r.z, c: Math.cos(r.yaw ?? 0), s: Math.sin(r.yaw ?? 0), hw: size[0] * sx / 2, hd: size[2] * sz / 2 }];
  });
}
const onClutter = (boxes, x, z, y, margin) => boxes.some((b) => {
  if (Math.abs(b.y - y) > 1.2) return false;                         // another storey
  const dx = x - b.x, dz = z - b.z;
  return Math.abs(b.c * dx - b.s * dz) < b.hw + margin && Math.abs(b.s * dx + b.c * dz) < b.hd + margin;
});

/**
 * One placement per role: the habitat's spots ranked by how near the role's distance they lie (plus a little seeded jitter), the first that fits wins. A spot fits when
 *   - it is clear of every other animal, of the arrival point, of every doorway and of the barrio's own living props (life.js);
 *   - it is solid ground at its level (no drop beside it, nothing of the world within the animal's width, nothing over its back, no low piece of street clutter): a wall or a prop is never somewhere an animal is put;
 *   - an animal that walks has a clear line to the graph (no fence or wall between it and the nearest node), and a roof animal is seen over its parapet from a street (`watched`).
 * Nothing here adds to the plan, the nav graph or the physics.
 */
export function planAnimals(ctx, world, bank) {
  const nav = world.nav, ph = world.physics, sp = ctx.plan?.spawn ?? { x: 0, z: 0 };
  if (!nav?.nodes?.some((n) => world.inMain(n.i) && n.kind !== 'stair')) return [];
  const H = habitats(ctx, world), life = (ctx.world?.extra ?? []).filter((e) => LIVING.has(e.id)), clutter = lowClutter(ctx);
  const doors = (ctx.plan?.lots ?? []).map((l) => l.entrance?.outside).filter((o) => Array.isArray(o));     // the step outside every door: nobody is put in a doorway, whatever the habitat
  const shrine = ctx.world?.shrine, chapel = (ctx.plan?.lots ?? []).find((l) => l.kind === 'chapel'), plaza = (ctx.plan?.plazas ?? []).find((p) => p.id === chapel?.front);
  const focus = { spawn: sp, shrine: shrine ? { x: shrine.front?.[0] ?? shrine.x, z: shrine.front?.[1] ?? shrine.z } : null, chapel: plaza ? { x: plaza.cx, z: plaza.cz } : null };
  const rng = makeRng(ctx.seed ?? 1).fork('animals'), used = [], out = [];
  for (const [index, role] of ROLES.entries()) {
    const meta = bank.get(role.key).meta, r = rng.fork(role.key + ':' + index), radius = meta.radius ?? 0.25, height = meta.height ?? 1;
    // solid ground at the level the spot hangs off, a body's width of room, no drop beside it, nothing over its back: the height of the ground there, or null
    const ground = (x, z, y0) => {
      const y = ph.groundAt(x, z, y0 + 0.6);
      return Number.isFinite(y) && Math.abs(y - y0) <= 0.35 && standClear(ph, x, z, y, radius + 0.1) && !ph._overlaps?.(x, z, y, radius + 0.08, height) && !onClutter(clutter, x, z, y, radius + 0.1) ? y : null;
    };
    // clear of every other animal, of the arrival point, of every doorway and of the barrio's own dog, hens and pigeons (life.js)
    const clear = (x, z) => !used.some((p) => Math.hypot(p.x - x, p.z - z) < MIN_APART) && Math.hypot(x - sp.x, z - sp.z) >= MIN_FROM_SPAWN && !life.some((e) => Math.hypot(e.x - x, e.z - z) < MIN_FROM_LIFE)
      && !doors.some((o) => Math.hypot(o[0] - x, o[2] - z) < MIN_FROM_DOOR);
    // an animal that walks must be able to walk to the graph: no fence, wall or planter between it and the nearest node (a dog inside the futsal court's fence, a hen behind a garden wall)
    const reaches = (x, z, y) => { const n = nav.nodes[nav.nearest(x, z, 6, y)]; return !!n && !ph.segmentBlocked(x, z, n.x, n.z, y, 0.8, null); };
    const fits = (s) => { if (!clear(s.x, s.z)) return null; const y = ground(s.x, s.z, s.y); return y !== null && (meta.caged || s.watched || reaches(s.x, s.z, y)) ? y : null; };
    // a terrace's parapet hides what stands on it from anybody level with it or below: it is seen from a street 7 to 35 m away that looks down over the parapet (the line from the eye
    // to the animal's head clears its top `w.top` at the animal's inset from the edge) along a line no wall crosses (tested in 3 m pieces through the physics' walls, as the
    // interaction code tests a line of sight; the parapet and the pretil are not all colliders, hence the first rule)
    const watched = (x, z, y, w) => {
      const head = y + height;
      return nav.nodes.some((n) => {
        if (!world.inMain(n.i) || n.kind === 'door' || n.kind === 'stair' || n.y < y - 1.5) return false;
        const d = Math.hypot(x - n.x, z - n.z); if (d < 7 || d > 35) return false;
        const eye = n.y + 1.6, pieces = Math.max(1, Math.ceil(d / 3));
        if (head + (eye - head) * (w.inset / d) < w.top) return false;
        for (let k = 0; k < pieces; k++) {
          const t0 = k / pieces, t1 = (k + 1) / pieces, h = eye + (head - eye) * (t0 + t1) / 2;
          if (ph.segmentBlocked(n.x + (x - n.x) * t0, n.z + (z - n.z) * t0, n.x + (x - n.x) * t1, n.z + (z - n.z) * t1, h - 0.2, 0.5, null)) return false;
        }
        return true;
      });
    };
    /** A cage on its stand hugs the facade beside the door: back along the line from the street to the door, as far as there is room (the first step that is not free ends it). */
    const snug = (s, y) => {
      const at = { x: s.x, y, z: s.z };
      for (let t = 0.2; s.back && t <= 2.0; t += 0.2) {
        const x = s.x + s.back[0] * t, z = s.z + s.back[1] * t, h = ground(x, z, s.y);
        if (h === null || !clear(x, z)) break;
        at.x = x; at.z = z; at.y = h;
      }
      return at;
    };
    for (const habitat of [...FALLBACK[role.habitat], 'any']) {
      const own = habitat === role.habitat && focus[role.focus], at = own || sp, want = own ? role.r : role.far;
      const ranked = (H[habitat]?.() ?? []).map((s) => ({ s, score: Math.abs(Math.hypot(s.x - at.x, s.z - at.z) - want) + (s.rise > 9 ? (s.rise - 9) * 2 : 0) + r.next() * 4 })).sort((a, b) => a.score - b.score);
      let placed = null, looks = 0;                                                                  // (at most 120 lines of sight are tried for a role: a barrio with no terrace in view costs a glance)
      for (const { s } of ranked) {
        const y = fits(s); if (y === null || (s.watched && (looks++ >= 120 || !watched(s.x, s.z, y, s.watched)))) continue;
        const p = meta.caged ? snug(s, y) : { x: s.x, y, z: s.z };
        placed = { ...p, ry: Number.isFinite(s.ry) ? s.ry + r.range(-0.35, 0.35) : r.range(-Math.PI, Math.PI) }; break;
      }
      if (!placed) continue;
      used.push(placed);
      out.push({ id: 'animal:' + role.key + ':' + index, key: role.key, meta, habitat, position: placed, node: nav.nearest(placed.x, placed.z, 12, placed.y), rng: r, fixed: !!meta.caged || habitat === 'roof' });
      break;
    }
  }
  return out;
}
