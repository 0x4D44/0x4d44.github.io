// Back yards (round 6, R1-102 at ground level). The upper rows are cut into the hillside: behind each back wall the ground climbs a metre or two in a steep bank, and on top of it the lawn
// runs on, so every house read as a coloured box set down on grass. A yard is what a household makes of the ground above that bank: a worn earth path along its edge, and then what the family
// keeps there (a water tank and a gas bottle, the washing, tyres with flowers in them, two chairs, the bins, a pile of bricks and sand where the next floor is going up), a zinc fence where the
// neighbour's plot begins, and weeds along the edge.
// Only what the world already has: the library's tanks, tyres, crates, chairs, bins, gas bottles and washing line (instanced, LOD), flora's shrubs and tufts, the path's own material and the boxes
// the rim wall's rubble is made of. It runs after everything else has taken its ground (props.js, after the street clutter): it only reads the occupancy grid and takes the little it needs, so no other
// prop, tree, vehicle or cable moves, and every draw it makes comes from a stream of its own (`props:yard:<lot>`). A pure planner (`planYard`), then `buildBackYards`.
import { OCC } from './occupancy.js';
import { localToWorld } from './kit.js';
import { shrub, tuft } from './flora.js';

/** The lots that have a yard: the upper rows (their pad stands 10 m or more over the plaza), of a kind a household lives in. */
export const YARD = {
  minY: 10,
  kinds: ['house', 'rowhouse', 'unfinished', 'shophouse', 'apartments', 'tenement', 'workshop', 'cornerstore'],
  lane: [0, 1.2],                  // the worn path: from the yard's edge to 1.2 m in
  reach: 4.0,                      // nothing of a yard stands more than this far in from its edge
  within: 3.0,                     // the edge itself is at most this far behind the back wall (a lot whose back is a sheer bank for longer has no yard)
};
/** Never on a street, a plaza, a stair, a building, a doorstep, steep ground or where people walk. */
export const YARD_MASK = OCC.ROAD | OCC.PLAZA | OCC.STAIR | OCC.LOT | OCC.DOOR | OCC.STEEP | OCC.NAV;
const SHEER = OCC.STEEP | OCC.LOT | OCC.ROAD | OCC.STAIR | OCC.PLAZA | OCC.DOOR;
export const SLOPE_MAX = 0.32;

export const KITS = [{ kit: 'cisterna', w: 3 }, { kit: 'tendedero', w: 3 }, { kit: 'llantas', w: 3 }, { kit: 'sentadero', w: 2 }, { kit: 'basura', w: 2 }];
/** The kits are dealt like cards (one pack of 14, shuffled once, then round and round) so that a row of yards is never all water tanks: the weights above are how many of each card the pack holds. */
export const deck = (rng) => rng.shuffle([...KITS.flatMap((k) => Array(k.w).fill(k.kit)), 'none']);
const AWAY = Math.PI, EAST = Math.PI / 2, WEST = -Math.PI / 2;      // which way a thing faces, in the lot's own frame (0 = toward the house, +z local)

export const yardLots = (plan) => plan.lots.filter((l) => l.y >= YARD.minY && YARD.kinds.includes(l.kind));

/**
 * What one lot keeps behind it, in the lot's own frame: u along the back wall from the middle, v in from the yard's EDGE (the top of the bank behind the wall: `buildBackYards` finds it).
 * Pure: the lot and its own stream, nothing else, so a yard never depends on the yards drawn before it. A want is
 *   { t, key, u, v, yaw (local), size [x,y,z] of the thing, r (the disc it takes) }
 * and may find no ground: the builder then drops it. t: 'prop' (a library model standing), 'planter' (a tyre with a plant in it), 'line' (the washing line), 'bricks' | 'blocks' | 'sand' | 'rebar'
 * (a building site's heaps).
 */
export function planYard(lot, r, o = {}) {
  const w = lot.w, side = r.chance(0.5) ? -1 : 1, items = [];
  const kit = lot.kind === 'unfinished' ? 'obra' : o.kit ?? (r.chance(0.1) ? 'none' : r.weighted(KITS).kit);
  const it = (t, key, u, v, yaw, size, rad, more = {}) => items.push({ t, key, u: +u.toFixed(2), v: +v.toFixed(2), yaw: +yaw.toFixed(3), size, r: rad, ...more });
  const edge = (k) => side * (w / 2 - k);                                         // k metres in from the end of the wall on the chosen side
  if (kit === 'cisterna') {
    const x0 = edge(0.85 + r.range(0, 0.5));
    it('prop', r.chance(0.6) ? 'clutter_tank_blue' : 'clutter_tank_black', x0, 0.7, r.range(0, 6.28), [1.0, 1.12, 1.0], 0.5);
    it('prop', 'clutter_crate_plastic', x0 - side * 0.95, 0.6, r.range(-0.3, 0.3), [0.61, 0.38, 0.43], 0.3);
    if (r.chance(0.6)) it('prop', 'clutter_gas_cylinder', x0 - side * 1.5, 0.5, 0, [0.32, 0.72, 0.32], 0.17);
  } else if (kit === 'tendedero' && !o.noLine) {
    const len = Math.min(4.4, Math.max(2.4, w - 1.3)), c = r.range(-0.4, 0.4), e = r.chance(0.5) ? 1 : -1;
    it('line', 'clutter_washing_line', c, 1.7, 0, [len, 1.96, 0.3], 0.2, { len });
    it('prop', 'clutter_crate_plastic', c + e * (len / 2 - 0.55), 1.2, r.range(-0.4, 0.4), [0.61, 0.38, 0.43], 0.3);
  } else if (kit === 'llantas' || kit === 'tendedero') {                            // (a lot that already has a yard line gets tyres instead)
    const n = r.int(2, 3), x0 = edge(0.8);
    for (let i = 0; i < n; i++) it('planter', 'clutter_tyre', x0 - side * i * 0.95, 0.7 + r.range(-0.15, 0.15), r.range(0, 6.28), [0.72, 0.26, 0.72], 0.36, { flowers: r.chance(0.6), plant: +r.range(0.35, 0.5).toFixed(2) });
  } else if (kit === 'sentadero') {
    const c = r.range(-0.8, 0.8) * Math.min(1, (w - 3) / 3);
    it('prop', 'clutter_chair', c - 0.7, 1.1, EAST, [0.52, 0.86, 0.54], 0.27);
    it('prop', 'clutter_chair', c + 0.7, 1.1, WEST, [0.52, 0.86, 0.54], 0.27);
    it('prop', 'clutter_crate_wood', c, 1.1, r.range(-0.3, 0.3), [0.67, 0.49, 0.48], 0.33);
    if (r.chance(0.5)) it('prop', 'clutter_gas_cylinder', c + side * 1.5, 0.5, 0, [0.32, 0.72, 0.32], 0.17);
  } else if (kit === 'basura') {
    const x0 = edge(0.75);
    it('prop', 'clutter_bin_wheelie', x0, 0.6, AWAY + r.range(-0.3, 0.3), [0.5, 0.98, 0.6], 0.34);
    it('prop', 'clutter_bin_metal', x0 - side * 0.85, 0.6, r.range(0, 6.28), [0.62, 0.8, 0.62], 0.31);
    if (r.chance(0.5)) it('prop', 'clutter_crate_wood', x0 - side * 1.6, 0.55, r.range(-0.3, 0.3), [0.67, 0.49, 0.48], 0.33);
  } else if (kit === 'obra') {
    const x0 = edge(1.1 + r.range(0, 0.4));
    it('bricks', null, x0, 0.9, r.range(-0.2, 0.2), [1.1, 0.5, 0.6], 0.6);
    it('blocks', null, x0 - side * 1.5, 0.85, r.range(-0.3, 0.3), [0.8, 0.4, 0.4], 0.45);
    it('sand', null, x0 - side * 3.0, 1.5, 0, [1.7, 0.55, 1.7], 0.85);
    it('rebar', null, x0 - side * 0.2, 2.3, r.range(-0.15, 0.15), [1.8, 0.12, 0.14], 0.5);
    it('prop', 'clutter_crate_plastic', x0 - side * 2.1, 0.6, r.range(-0.5, 0.5), [0.61, 0.38, 0.43], 0.3);
  }
  // the neighbour's plot begins here: a run of zinc sheets in from the edge, on the side opposite the family's things
  const fence = kit !== 'obra' && r.chance(0.38) ? { u: -side * (w / 2), v0: 0.1, len: Math.round(r.range(2.0, 3.6) * 2) / 2, h: +r.range(1.5, 1.85).toFixed(2), tint: r.int(0, 3) } : null;
  const scrub = Array.from({ length: r.int(2, 4) }, () => ({ u: +r.range(-(w / 2 - 0.4), w / 2 - 0.4).toFixed(2), v: +r.range(-0.1, 0.5).toFixed(2), big: +r.range(1.2, 1.8).toFixed(2) }));
  const bush = r.chance(0.35) ? { u: +(side * (w / 2 + 0.9)).toFixed(2), v: +r.range(0.4, 1.4).toFixed(2), size: +r.range(0.8, 1.1).toFixed(2) } : null;
  return { lot: lot.id, kit, items, fence, scrub, bush };
}

const ZINC = [[0.64, 0.42, 0.32], [0.42, 0.5, 0.6], [0.78, 0.8, 0.8], [0.62, 0.3, 0.28]];       // rust, faded blue, galvanised, old red
const EARTH = { edge: [0.42, 0.4, 0.3], mid: [0.7, 0.62, 0.48] };                                 // the path's worn middle and its dark edges (the rim path's tones)

export function buildBackYards(K) {
  const { ctx, plan, occ, H } = K, C = ctx.clutter, world = (ctx.world ??= {});
  const stats = { lots: 0, items: 0, props: 0, planters: 0, lines: 0, heaps: 0, fences: 0, scrub: 0, bushes: 0, laneM: 0, dropped: 0, noEdge: 0, byKit: {}, byKey: {} }, records = [];
  const hasLine = new Set((world.cables ?? []).filter((c) => c.kind === 'yard').map((c) => c.lot));
  const ok = (x, z, rad) => Math.max(Math.abs(x), Math.abs(z)) <= 96 && occ.clear(x, z, rad, YARD_MASK) && !occ.overlaps(x, z, rad) && occ.navDist(x, z) >= rad + 0.62 && occ.slope(x, z) <= SLOPE_MAX;
  const low = (x, z, rad) => Math.min(H(x, z), H(x + rad, z), H(x - rad, z), H(x, z + rad), H(x, z - rad)), lift = (x, z, rad) => low(x, z, rad) + 0.02;     // a thing rests on the low side: the high side sinks into the turf

  const cards = deck(K.rng('yard:deck'));
  let dealt = 0;
  for (const lot of yardLots(plan)) {
    const at = localToWorld(lot.x, lot.z, lot.rotY), behind = (u, v) => at(u, -lot.d / 2 - v);
    // the yard's edge: the first line behind the wall from which the ground (to half a metre further) is not a bank, a wall, a street or a neighbour
    const n = Math.max(3, Math.round(lot.w / 0.5)), share = (v) => {
      let k = 0; for (let i = 0; i <= n; i++) { const [x, z] = behind(-lot.w / 2 + (lot.w * i) / n, v); if (!(occ.at(x, z) & SHEER) && occ.slope(x, z) <= SLOPE_MAX) k++; }
      return k / (n + 1);
    };
    let vy = null; for (let v = 0.5; v <= YARD.within + 1e-6; v += 0.25) if (share(v) >= 0.8 && share(v + 0.5) >= 0.8) { vy = v; break; }
    if (vy == null) { stats.noEdge++; continue; }
    const back = (u, v) => behind(u, vy + v), R = K.rng('yard:' + lot.id), P = planYard(lot, R.fork('plan'), { kit: cards[dealt++ % cards.length], noLine: hasLine.has(lot.id) });
    const yaw = (local) => lot.rotY + local;
    const rec = (kit, t, key, x, y, z, ang, rad, more = {}) => { records.push({ lot: lot.id, kit, t, key, x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3), yaw: +ang.toFixed(3), r: rad, ...more }); stats.items++; stats.byKey[key ?? t] = (stats.byKey[key ?? t] ?? 0) + 1; };
    // a small search round the wanted spot: a neighbour's tree or a retaining wall may be in the way
    const site = (u, v, rad, test = (x, z) => ok(x, z, rad)) => {
      for (const [du, dv] of [[0, 0], [0, 0.25], [0.3, 0], [-0.3, 0], [0, 0.5], [0.3, 0.25], [-0.3, 0.25], [0, 0.75], [0.6, 0.25], [-0.6, 0.25]]) {
        if (v + dv > YARD.reach || Math.abs(u + du) > lot.w / 2 + 0.6) continue;
        const [x, z] = back(u + du, v + dv);
        if (test(x, z, u + du, v + dv)) return { x, z, u: u + du, v: v + dv };
      }
      return null;
    };
    let placed = 0;
    // ---- the worn path along the edge (cells of a metre, skipped where it would touch a street, a stair, a wall or steep ground)
    {
      const [v0, v1] = YARD.lane, vm = (v0 + v1) / 2, cells = Math.max(2, Math.round(lot.w)), du = lot.w / cells, g = R.fork('lane'), b = K.b('yards', lot.x, lot.z, { cast: false });
      const solid = (x, z) => occ.clear(x, z, 0, SHEER) && occ.slope(x, z) < 0.45;
      for (let i = 0; i < cells; i++) {
        const u0 = -lot.w / 2 + i * du, u1 = u0 + du, V = (u, v, dy) => { const [x, z] = back(u, v); return [x, H(x, z) + dy, z]; };
        if (![[u0, v0], [u1, v0], [u0, vm], [u1, vm], [u0, v1], [u1, v1]].every(([u, v]) => { const [x, z] = back(u, v); return solid(x, z); })) continue;
        const k = g.range(0.9, 1.08), e = EARTH.edge.map((c) => c * k), m = EARTH.mid.map((c) => c * k);
        b.quad('dirt_path', V(u0, v0, 0.03), V(u1, v0, 0.03), V(u1, vm, 0.055), V(u0, vm, 0.055), { cols: [e, e, m, m] });
        b.quad('dirt_path', V(u0, vm, 0.055), V(u1, vm, 0.055), V(u1, v1, 0.03), V(u0, v1, 0.03), { cols: [m, m, e, e] });
        stats.laneM += du;
      }
    }
    // ---- what the family keeps there
    for (const w of P.items) {
      const ang = yaw(w.yaw);
      if (w.t === 'prop' || w.t === 'planter') {
        if (!C?.has(w.key)) { stats.dropped++; continue; }
        const s = site(w.u, w.v, w.r); if (!s) { stats.dropped++; continue; }
        const y = lift(s.x, s.z, w.r);
        if (!C.fit(w.key, s.x, y, s.z, ang, w.size, { source: 'addition', scene: 'yard' })) { stats.dropped++; continue; }
        occ.take(s.x, s.z, w.r);
        if (w.r >= 0.45) K.post(s.x, s.z, w.r * 0.9, Math.min(w.size[1], 1.3), y); else K.rect(s.x, s.z, w.size[0], w.size[2], ang, Math.min(w.size[1], 1.2), y, 0.025);
        if (w.t === 'planter') {
          shrub(K, s.x, s.z, { rng: R.fork('plant' + placed), size: w.plant, flowers: w.flowers, dy: w.size[1] * 0.7, cards: 4 });
          stats.planters++;
        } else stats.props++;
        rec(P.kit, w.t, w.key, s.x, y, s.z, ang, w.r); placed++;
      } else if (w.t === 'line') {
        if (!C?.has(w.key)) { stats.dropped++; continue; }
        const s = site(w.u, w.v, 0.3, (x, z, u, v) => {                                    // the wanted spot is the middle of the line: both ends and every half metre between must be free, and the ground level along it
          for (let t = -w.len / 2; t <= w.len / 2 + 1e-6; t += 0.5) { const [px, pz] = back(u + t, v); if (!ok(px, pz, 0.15)) return false; }
          const [ax, az] = back(u - w.len / 2, v), [bx, bz] = back(u + w.len / 2, v);
          return Math.abs(H(ax, az) - H(bx, bz)) <= 0.35;
        });
        if (!s) { stats.dropped++; continue; }
        const [ax, az] = back(s.u - w.len / 2, s.v), [bx, bz] = back(s.u + w.len / 2, s.v), y = Math.min(H(ax, az), H(bx, bz), H(s.x, s.z)) + 0.02;
        if (!C.fit(w.key, s.x, y, s.z, ang, w.size, { source: 'addition', scene: 'yard' })) { stats.dropped++; continue; }
        for (const e of [-1, 1]) { const [px, pz] = back(s.u + e * w.len / 2, s.v); occ.take(px, pz, 0.15); K.post(px, pz, 0.06, 2.0, H(px, pz)); }
        rec(P.kit, 'line', w.key, s.x, y, s.z, ang, w.r, { len: w.len }); stats.lines++; placed++;
      } else {                                                                              // a building site's heaps: plain boxes in the materials of the rim wall's rubble
        const s = site(w.u, w.v, w.r); if (!s) { stats.dropped++; continue; }
        const gy = low(s.x, s.z, Math.max(w.size[0], w.size[2]) / 2) - 0.02, b = K.b('yards', s.x, s.z, { cast: false }), g = R.fork('heap' + placed);
        if (w.t === 'bricks') {
          for (let k = 0; k < 2; k++) b.box('brick_red_solid', s.x, gy + 0.2 + 0.2 * k, s.z, w.size[0] - 0.1 * k, 0.4, w.size[2] - 0.1 * k, { ry: ang + g.range(-0.05, 0.05), col: [0.68, 0.34, 0.26], skip: k ? [] : ['ny'] });
          b.box('wood_pine', s.x, gy + 0.05, s.z, w.size[0] + 0.1, 0.1, w.size[2] + 0.1, { ry: ang, col: [0.5, 0.42, 0.3] });
        } else if (w.t === 'blocks') {
          for (let k = 0; k < 3; k++) b.box('concrete_bare', s.x + g.range(-0.12, 0.12), gy + 0.1 + 0.2 * Math.floor(k / 2), s.z + (k % 2 ? 0.2 : -0.2), 0.42, 0.2, 0.2, { ry: ang + g.range(-0.4, 0.4), col: [0.62, 0.6, 0.56], skip: ['ny'] });
        } else if (w.t === 'sand') {
          b.cyl('concrete_bare', s.x, gy - 0.02, s.z, w.size[0] / 2, w.size[1], 12, { r1: 0.14, col: [1.0, 0.86, 0.55] });
        } else if (w.t === 'rebar') {
          for (const e of [-0.6, 0.6]) b.box('wood_pine', s.x + Math.cos(ang) * e, gy + 0.05, s.z - Math.sin(ang) * e, 0.12, 0.1, 0.3, { ry: ang, col: [0.5, 0.42, 0.3] });
          for (let k = 0; k < 4; k++) b.box('rusty_iron', s.x - Math.sin(ang) * (k - 1.5) * 0.04, gy + 0.16 + (k % 2) * 0.04, s.z - Math.cos(ang) * (k - 1.5) * 0.04, w.size[0], 0.025, 0.025, { ry: ang, col: [0.62, 0.36, 0.2] });
        }
        occ.take(s.x, s.z, w.r);
        if (w.t === 'sand') K.post(s.x, s.z, 0.7, 0.5, gy); else if (w.t !== 'rebar') K.rect(s.x, s.z, w.size[0], w.size[2], ang, w.size[1], gy, 0.025);
        rec(P.kit, w.t, w.t, s.x, gy, s.z, ang, w.r); stats.heaps++; placed++;
      }
    }
    // ---- the zinc fence between this plot and the next
    if (P.fence) {
      const f = P.fence, pts = [], tint = ZINC[f.tint];
      for (let v = f.v0; v <= f.v0 + f.len + 1e-6; v += 0.5) pts.push(back(f.u, v));
      if (pts.every(([x, z]) => occ.clear(x, z, 0.2, YARD_MASK) && !occ.overlaps(x, z, 0.2) && occ.slope(x, z) <= 0.35)) {
        const b = K.b('yards', pts[0][0], pts[0][1], { cast: false }), g = R.fork('fence'), m = Math.round(f.len / 1.0), A = pts[0], Z = pts[pts.length - 1];
        for (let i = 0; i < m; i++) {
          const [x, z] = back(f.u, f.v0 + (i + 0.5) * (f.len / m)), h = f.h * g.range(0.92, 1.04), gy = Math.max(H(x, z), H(...back(f.u, f.v0 + i * (f.len / m))));
          b.box('corrugated_zinc', x, gy + h / 2 - 0.05, z, 0.035, h, f.len / m + 0.02, { ry: lot.rotY, col: tint.map((c) => c * g.range(0.9, 1.08)) });
        }
        for (let i = 0; i <= m; i++) { const [x, z] = back(f.u, f.v0 + i * (f.len / m)), gy = H(x, z); b.box('wood_pine', x, gy + f.h / 2 + 0.05, z, 0.09, f.h + 0.1, 0.09, { col: [0.5, 0.42, 0.3] }); }
        K.seg(A[0], A[1], Z[0], Z[1], 1.6, 0.05, Math.min(H(A[0], A[1]), H(Z[0], Z[1])));
        for (const [x, z] of pts) occ.take(x, z, 0.2);
        rec(P.kit, 'fence', 'fence', A[0], H(A[0], A[1]), A[1], lot.rotY, 0.2); stats.fences++;
      }
    }
    // ---- weeds along the edge, and a bush where the yard ends
    const wr = R.fork('weeds');
    for (const s of P.scrub) { const [x, z] = back(s.u, s.v); if (occ.clear(x, z, 0.3, SHEER) && !occ.overlaps(x, z, 0.3)) { tuft(K, x, z, wr, s.big); stats.scrub++; } }
    if (P.bush) { const [x, z] = back(P.bush.u, P.bush.v); if (ok(x, z, 0.5)) { shrub(K, x, z, { rng: R.fork('bush'), size: P.bush.size, flowers: false }); occ.take(x, z, 0.5); stats.bushes++; } }
    if (placed || P.fence) { stats.lots++; stats.byKit[P.kit] = (stats.byKit[P.kit] ?? 0) + 1; }
  }
  stats.laneM = +stats.laneM.toFixed(1);
  world.backYards = { ...stats, records };
  return stats;
}
