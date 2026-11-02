// INTERIORS (A3): what is inside the containers. Three layers, all deterministic (a reload shows the same drawers):
//   1. planContents(ctx)        ONE plan for the whole barrio, made from the lots, their households and (kindsByHousehold) the slots a FURNISHED household has to lay things in: every
//                               building gets 1-2 papers from papers.js (no paper in more than 2 homes), the special finds of finds.js are spread so each type lands between its `min`
//                               and `max`, at most 3 per building, and no household is planned more papers, or more finds, than it has slots of the right kinds to hold (`holds`).
//                               A building that is not furnished when the plan is made is planned without that limit, so make the plan once every building is furnished.
//   2. planBuilding(ctx,bp,list) when a building's interior is built: its share of the plan is pinned to concrete slots (a diary to a nightstand, a coin to a dresser
//                               drawer ...) by the container kinds each paper / find asks for (`where`) and a hash. Whatever has no fitting slot is logged as an orphan.
//   3. makeContents(ctx, S)     on the FIRST OPEN of a slot: its paper and find, plus ordinary things from props.js picked by the slot's pool and the household
//                               (a teenager's wardrobe has a football shirt, an elder's a mantilla), laid out on the shelves of the carcass without overlap.
// The writing (papers.js, finds.js, content.js) is the lead's: read here, never edited.
import { hashStr, makeRng } from '../core/rng.js';
import { PAPERS, paperById } from './papers.js';
import { FINDS, findById } from './finds.js';
import { eligible, resolvePaper, resolveFind, fill, collectionLabel, rarityWeight, CONTAINER_KINDS } from './content.js';
import { householdsOf } from './household.js';
import { CATALOG } from './catalog.js';
import { layoutOf, EYE_Y, EYE_AT } from './carcass.js';
import { standSpots } from './reach.js';
import { ITEMS, whenOk, drawProp, findDims, wrapDims, paperLook, PAPER_PROMPT } from './props.js';
import { modelFor } from './inspect.js';

export { drawProp as drawContent };
export const TOTALS = { papers: PAPERS.length, finds: FINDS.length };
export const PAPER_CAP = 2, FINDS_PER_BUILDING = 3;

/** The container kinds of papers.js / finds.js `where` ARE the `group` of my carcass.js slots (the lead migrated the data to them, 22:41). */
export const kindsOf = (group) => [group];
export const OFFERED_KINDS = CONTAINER_KINDS;

const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const hv = (...p) => hashStr(p.join('|')) / 4294967296;                      // a stable number in [0, 1) per key

/** The lot object papers.js / finds.js filter on: { kind, shop }. */
export const lotOf = (bp) => ({ kind: bp.lot?.kind, shop: bp.interior?.shopType ?? bp.lot?.shop ?? null });

/** Who lives behind a slot. */
export function householdOf(S) {
  const I = S.bp.interior; if (!I) return null;
  const m = (I._hhById ??= new Map(I.hh.map((h) => [h.id, h])));
  return m.get(I.rooms?.[S.rec.room]?.hh) ?? I.hh[0] ?? null;
}

// ------------------------------------------------------------------ 1. the barrio-wide plan
function matchPapers(units, cands) {
  const byB = new Map();
  units.forEach((u, i) => { let b = byB.get(u.bid); if (!b) byB.set(u.bid, b = []); b.push(i); });
  const left = [...byB.entries()].map(([bid, us]) => {
    const edges = new Map();                                                // paper index -> the household of this building that would take it
    for (const ui of us) for (const pi of cands[ui]) if (!edges.has(pi) || hv(bid, PAPERS[pi].id, units[ui].hh.id) < hv(bid, PAPERS[pi].id, units[edges.get(pi)].hh.id)) edges.set(pi, ui);
    return { bid, edges, adj: [...edges.keys()].sort((a, b) => hv(bid, PAPERS[a].id) - hv(bid, PAPERS[b].id)), got: -1 };
  }).sort((a, b) => a.adj.length - b.adj.length || (a.bid < b.bid ? -1 : 1));             // the most constrained building chooses first
  const holders = PAPERS.map(() => []);
  const assign = (li, seen) => {
    for (const pi of left[li].adj) {
      if (seen.has(pi)) continue; seen.add(pi);
      if (holders[pi].length < PAPER_CAP) { holders[pi].push(li); left[li].got = pi; return true; }
      for (const lj of holders[pi]) if (lj !== li && assign(lj, seen)) { holders[pi].splice(holders[pi].indexOf(lj), 1); holders[pi].push(li); left[li].got = pi; return true; }
    }
    return false;
  };
  for (let li = 0; li < left.length; li++) assign(li, new Set());
  return left.filter((l) => l.got >= 0).map((l) => ({ pi: l.got, ui: l.edges.get(l.got) }));
}

/** The container kind of every slot each household of a FURNISHED building has (the `group` of its pieces' slots, one entry per slot: two dressers list `dresser` twice): an item is only planned where it
 *  has a place to lie, and a slot holds one paper and one find. null = not furnished yet (no limit is known).
 *  A front nobody can stand in front of is decoration (containers.js registerFronts, R4-118), so it does not count: a nightstand between the bed and the wall is no place for a diary. */
function kindsByHousehold(bp) {
  const I = bp.interior; if (!I?.hh?.length || !bp.furniture) return null;
  const out = new Map(I.hh.map((h) => [h.id, []])), conns = new Map();
  for (const r of bp.furniture) {
    const lay = layoutOf(CATALOG[r.name]); if (!lay) continue;
    const mine = out.get(I.rooms?.[r.room]?.hh) ?? out.get(I.hh[0].id), L = I.layouts?.get(r.room);
    const conn = L && (conns.get(L) ?? conns.set(L, L.connectivity()).get(L));
    for (const s of lay.slots) if (!L || standSpots(bp, r, s, conn).length) mine.push(s.group);
  }
  return out;
}
const fits = (item, u) => !u.kinds || item.where.some((k) => u.kinds.includes(k));
/** Do all of `items` lie in the household's slots at once, each in a slot of a kind it asks for, a slot holding one? (A paper and a find lie side by side in a slot: ask for the papers and for the finds
 *  apart.) Augmenting paths over a handful of items: an item whose slots are taken moves the one in its way on. A household with nothing known (`kinds` null) holds anything. */
function holds(u, items) {
  if (!u.kinds) return true;
  const at = [], seat = (i, seen) => {
    for (let s = 0; s < u.kinds.length; s++) {
      if (seen[s] || !items[i].where.includes(u.kinds[s])) continue;
      seen[s] = true;
      if (at[s] === undefined || seat(at[s], seen)) { at[s] = i; return true; }
    }
    return false;
  };
  return items.every((_, i) => seat(i, []));
}

/** Plan the whole barrio. Cached on ctx; recomputed only when the set of buildings changes. */
export function planContents(ctx) {
  const bps = [...ctx.buildings.values()].sort(byId);
  const sig = `${bps.length}:${ctx.seed >>> 0}:${PAPERS.length}:${FINDS.length}`;
  if (ctx.contentPlan?.sig === sig) return ctx.contentPlan;
  const units = [];
  for (const bp of bps) {
    const kinds = kindsByHousehold(bp);
    for (const hh of bp.interior?.hh ?? householdsOf(ctx, bp)) units.push({ bid: bp.id, hh, lot: lotOf(bp), kinds: kinds?.get(hh.id) ?? null, papers: [], finds: [] });
  }
  const cands = units.map((u) => PAPERS.map((p, i) => (eligible(p, u.hh, u.lot, null) && fits(p, u) ? i : -1)).filter((i) => i >= 0));
  const use = PAPERS.map(() => 0), held = new Map();                         // building id -> Set of paper ids
  const give = (ui, pi) => { const u = units[ui]; u.papers.push(PAPERS[pi].id); use[pi]++; (held.get(u.bid) ?? held.set(u.bid, new Set()).get(u.bid)).add(PAPERS[pi].id); };
  for (const { pi, ui } of matchPapers(units, cands)) give(ui, pi);
  for (const ui of units.map((_, i) => i).sort((a, b) => hv(units[a].hh.id, 'p2') - hv(units[b].hh.id, 'p2'))) {      // a second paper wherever capacity is left
    const u = units[ui], mine = held.get(u.bid);
    if (!mine || u.papers.length >= 2) continue;
    const have = u.papers.map((id) => paperById.get(id));
    let best = -1, bs = Infinity;
    for (const pi of cands[ui]) {
      if (use[pi] >= PAPER_CAP || mine.has(PAPERS[pi].id)) continue;
      const s = use[pi] + hv(u.hh.id, PAPERS[pi].id); if (s < bs && holds(u, [...have, PAPERS[pi]])) { bs = s; best = pi; }                 // and only where it still has a slot of its own
    }
    if (best >= 0) give(ui, best);
  }
  // finds: the most constrained types first (the special lots), each placed `min` times (plus a few extras up to `max`), in the least loaded building that fits
  const loads = new Map();
  const order = FINDS.map((f) => ({ f, el: units.map((u, k) => (eligible(f, u.hh, u.lot, null) && fits(f, u) ? k : -1)).filter((k) => k >= 0) })).sort((a, b) => a.el.length - b.el.length || (a.f.id < b.f.id ? -1 : 1));
  const missing = [];
  for (const { f, el } of order) {
    let n = f.min; for (let k = f.min; k < f.max; k++) if (hv(f.id, 'x', k) < rarityWeight(f) / 20) n++;                // a few extras, the commoner the likelier
    const used = new Set();
    for (let k = 0; k < n; k++) {
      let best = -1, bs = Infinity;
      for (const ui of el) {
        const u = units[ui], l = loads.get(u.bid) ?? 0;
        if (used.has(u.bid) || l >= FINDS_PER_BUILDING) continue;
        const s = l + hv(f.id, u.hh.id, k); if (s < bs && holds(u, [...u.finds.map((id) => findById.get(id)), f])) { bs = s; best = ui; }          // a household has as many finds as slots to hold them, no more
      }
      if (best < 0) { if (k < f.min) missing.push({ id: f.id, wanted: f.min, placed: k }); break; }
      const u = units[best]; u.finds.push(f.id); used.add(u.bid); loads.set(u.bid, (loads.get(u.bid) ?? 0) + 1);
    }
  }
  const byBuilding = new Map(); for (const u of units) (byBuilding.get(u.bid) ?? byBuilding.set(u.bid, []).get(u.bid)).push(u);
  return (ctx.contentPlan = { sig, units, byBuilding, byHh: new Map(units.map((u) => [u.hh.id, u])), missing, use, placed: new Map() });
}

// ------------------------------------------------------------------ 2. a building's share, pinned to its slots
/** `list` = the slot objects of the building (containers.js). Sets `S.plan = { paper, find }` (ids or null); returns { papers, finds, orphans }. */
export function planBuilding(ctx, bp, list) {
  const plan = planContents(ctx), out = { papers: 0, finds: 0, orphans: [] };
  for (const S of list) { S.kinds = kindsOf(S.slot.group); S.plan = { paper: null, find: null }; S.hh = householdOf(S); }
  const load = new Map();
  for (const u of plan.byBuilding.get(bp.id) ?? []) {
    const mine = list.filter((S) => S.hh?.id === u.hh.id);
    const put = (item, field, bag) => {
      const byItem = field === 'paper' ? paperById : findById;
      const seat = (it, seen) => {                                                                 // the best free slot it fits; none free: a slot whose holder can move on to another (augmenting path)
        const c = mine.filter((S) => !seen.has(S) && S.kinds.some((k) => it.where.includes(k)));
        c.sort((a, b) => (!!a.plan[field]) - (!!b.plan[field])                                      // a free slot first: a holder is only moved to make room
          || (a.reachable === false) - (b.reachable === false)                                      // a slot nobody can stand in front of comes last
          || (!showsFloor(a.slot)) - (!showsFloor(b.slot))                                            // and so does a drawer too high to look into
          || (load.get(a.rec.id) ?? 0) * 2 + hv(it.id, a.id) - ((load.get(b.rec.id) ?? 0) * 2 + hv(it.id, b.id)));
        for (const S of c) {
          seen.add(S); const held = S.plan[field];
          if (held && !seat(byItem.get(held), seen)) continue;
          S.plan[field] = it.id; if (!held) load.set(S.rec.id, (load.get(S.rec.id) ?? 0) + 1);      // a move on leaves this slot as full as it was
          return true;
        }
        return false;
      };
      if (seat(item, new Set())) out[bag]++; else out.orphans.push({ id: item.id, what: field, hh: u.hh.id });
    };
    for (const id of u.papers) put(paperById.get(id), 'paper', 'papers');
    for (const id of u.finds) put(findById.get(id), 'find', 'finds');
  }
  plan.placed.set(bp.id, out);
  return out;
}

// ------------------------------------------------------------------ 3. the things in one slot
const FALLBACK_HH = { id: 'none', kind: 'family', income: 0, kids: 0, babies: false, teen: false, elder: false, religious: 0, altar: false, pets: [], hobby: 'cooking', team: { a: 0xc8302a, b: 0xf2f2ee, n: 'rojiblancos' }, crochet: false, names: { woman: 'Rosalba', man: 'Hernán', sur: 'Restrepo', kid: 'Sofía', kid2: 'Mateo' }, seed: 1 };

/** A person who opens a drawer stands about 0.75 m from the carcass with eyes at 1.6 m, looking down over its front (carcass.js EYE_AT, EYE_Y): the drawer's own front hides a strip behind it as deep
 *  as the front stands over the thing times `cot` (the run of the sight line per metre of drop). A thing lies behind that strip or it is not in the drawer, as far as anybody can tell (R4-101). */
export const hiddenBehind = (sf, it) => (sf.panel === undefined ? 0 : Math.max(0, sf.panel - it.h) * sf.cot);
/** Does a sheet of paper (0.2 m deep, flat) lying on this slot's floor show over the front of its drawer from where a person stands? The top drawer of a tall filing cabinet hides its whole floor
 *  behind its own front: a paper or a find planned into it would lie where nobody can see it, so the plan gives such a slot last. Shelves and wardrobes always show. */
export const showsFloor = (slot) => { const sf = slot.surf?.[0]; return !sf || sf.panel === undefined || sf.z0 + 0.35 * 0.2 <= sf.z1 - hiddenBehind(sf, { h: 0.01 }); };

/** How deep behind the front plane of a closed cabinet a thing's middle can lie and still show to a person standing 0.75 m in front, eyes at 1.6 m: the sight line has to pass UNDER the roof of
 *  the compartment (the divider, the drawer, the shelf over it), so the lower and lower the floor the less of it shows (a nightstand's door cabinet under its drawer: the front 15 cm). `elev` = how
 *  high the piece's base hangs over the floor. Infinity when the eye is not above the roof (a tall wardrobe, a wall cupboard at head height) or the surface has no roof (a lid, glass shelves). */
export const seenDepth = (sf, it, elev = 0) => {
  if (sf.roof === undefined) return Infinity;
  const roof = sf.roof - (sf.margin ?? ROOF_MARGIN), drop = EYE_Y - elev - roof; if (drop < 0.05) return Infinity;
  return Math.max(0, roof - sf.y - it.h / 2) * (STAND_AT / drop);
};
/** The nearest a person stands to a closed front (reach.js `standSpots` tries 0.55 m last, because a tight room leaves nothing else): the closer the eye the steeper the sight line, so a thing that
 *  shows from here shows from every spot further out. */
const STAND_AT = 0.55;
/** The sight line to a thing passes the front plane this far UNDER the roof at least: the neighbour's frame (the freezer door over a fridge shelf, the drawer over a nightstand's door cabinet) is a
 *  target with a pad of its own, and a line that only just clears the roof is offered the frame instead of the thing. */
const ROOF_MARGIN = 0.04;

/** The room a hung garment takes along its rail (its hanger and a hand's breadth of cloth: a full wardrobe looks like a wall of cloth from the front). */
export const PITCH = 0.075;
/** Where the hangers go on a rail: the middle first, then alternately to each side. The leaf of an open door hides the end of a rail (an apron hung at the end was behind it, and the rail looked bare: R4-211). */
export function railSpots(r) {
  const lo = r.x0 + 0.045, hi = r.x1 - 0.045; if (!(hi >= lo)) return [];
  const mid = (lo + hi) / 2, out = [mid];
  for (let k = 1; mid + k * PITCH <= hi + 1e-6 || mid - k * PITCH >= lo - 1e-6; k++) {
    if (mid + k * PITCH <= hi + 1e-6) out.push(mid + k * PITCH);
    if (mid - k * PITCH >= lo - 1e-6) out.push(mid - k * PITCH);
  }
  return out;
}

/** The eyes of a person who opens the slot, in the piece's frame (carcass.js EYE_AT, EYE_Y: 0.75 m from the carcass, 1.6 m up; the middle of the slot and a step to each side; a drawer's tray is
 *  `travel` further out, so the eye is that much nearer to its things). `elev` = how high the piece's base hangs over the floor. */
export function eyesFor(slot, elev = 0, spots = []) {
  const ez = (slot.zf ?? 0) + EYE_AT - (slot.kind === 'drawer' ? slot.travel ?? 0 : 0), ey = EYE_Y - elev, ex = (slot.rect.x0 + slot.rect.x1) / 2;
  return [[ex, ey, ez], [ex - 0.25, ey, ez + 0.25], [ex + 0.25, ey, ez + 0.25], ...spots.map(([sx, sz]) => [sx, ey, sz])];
}
/** The first three of the places a person can stand to use the slot (reach.js standSpots, kept by containers.js registerFronts), in the piece's frame: the first of them can be half a metre to a side of the
 *  slot and 0.7 m from its front, where none of the three default eyes is (a rag stood on the line from a spot at the end of a counter to a lottery earring under the sink: R4-208 again). */
function spotEyes(S) {
  const sp = S.spots, rec = S.rec; if (!sp?.length || !rec) return [];
  const cs = Math.cos(rec.ry ?? 0), sn = Math.sin(rec.ry ?? 0);
  return sp.slice(0, 3).map(([x, z]) => { const dx = x - rec.x, dz = z - rec.z; return [dx * cs - dz * sn, dx * sn + dz * cs]; });
}
/** Does the sight line from `e` to `t` (piece-local points) pass through the box { x0, x1, y0, y1, z0, z1 } before it reaches `t`? A slab test along the segment. */
export function crosses(e, t, b) {
  let t0 = 0, t1 = 1;
  for (const [o, d, lo, hi] of [[e[0], t[0] - e[0], b.x0, b.x1], [e[1], t[1] - e[1], b.y0, b.y1], [e[2], t[2] - e[2], b.z0, b.z1]]) {
    if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) return false; continue; }
    let a = (lo - o) / d, c = (hi - o) / d; if (a > c) [a, c] = [c, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return false;
  }
  return true;
}
/** The room round a thing's box that its target takes (containers.js PAD): a thing that only just clears the line to the find still takes the aim from it. */
export const GUARD_PAD = 0.03;
/** Does a find glint (glint.js: a small star over it while its drawer is open)? Every treasure, and every find so small (4 cm or less) that it is a speck from 1.6 m above (R4-206). */
export const glints = (f) => f.kind === 'treasure' || (f.size ?? 0.04) <= 0.04;

class Packer {
  constructor(slot, elev = 0) {
    this.slot = slot; this.elev = elev; this.guard = null; this.rail = slot.rail ? { ...slot.rail, next: 0, spots: railSpots(slot.rail) } : null;
    this.surfs = slot.surf.map((sf) => {
      const dz = sf.z1 - sf.z0, two = dz > (sf.panel === undefined ? 0.34 : 0.2), ld = two ? Math.min(0.22, dz / 2 - 0.02) : Math.max(0.04, dz - 0.04);
      const rear = sf.zr ?? sf.z0;                                                              // a drawer: the back wall of the tray (the part of it still inside the carcass is no place for a thing, but a deep one may reach back into it)
      return { sf, two, ld, lanes: two
        ? [{ zc: sf.z1 - 0.02 - ld / 2, lo: sf.z1 - 0.02 - ld, hi: sf.z1 - 0.02, x: sf.x0 + 0.02 }, { zc: sf.z0 + 0.02 + ld / 2, lo: rear, hi: sf.z0 + 0.02 + ld, x: sf.x0 + 0.02 }]
        : [{ zc: (sf.z0 + sf.z1) / 2, lo: rear, hi: sf.z1, x: sf.x0 + 0.02 }] };
    });
  }
  /** The z of a thing's centre in a lane: the lane's own, but far enough back to show over the front of a drawer, and with most of it (85% of its depth) in the part of the tray that came out; null when it cannot.
   *  A drawer so high that the eye barely looks into it hides everything: the thing lies at the back of the part that came out, and a step closer shows it. */
  zIn(s, ln, it) {
    const sf = s.sf;
    if (sf.panel === undefined) {
      if (sf.roof === undefined) return ln.zc - it.d / 2 >= ln.lo - 1e-6 ? ln.zc : null;
      const zc = Math.max(ln.zc, sf.z1 - seenDepth(sf, it, this.elev));                      // a closed cabinet: forward as far as it takes to show under the roof, but still inside its own lane
      return zc - it.d / 2 >= ln.lo - 1e-6 && zc + it.d / 2 <= ln.hi + 1e-6 ? zc : null;
    }
    const zc = Math.max(Math.min(ln.zc, sf.z1 - hiddenBehind(sf, it) - it.d / 2), sf.z0 + 0.35 * it.d);
    return zc - it.d / 2 >= ln.lo - 1e-6 && zc + it.d / 2 <= ln.hi + 1e-6 ? zc : null;
  }
  /** (R4-206) A treasure nobody can see is none: once the find is down, `guard` = { eyes, t } (the eyes of a person in front of the slot, and the middle of the find) and nothing that goes down after it
   *  may stand on a sight line to it. Would a thing `it` standing at (cx, y, cz) hide the find from any of the eyes? */
  hides(cx, y, cz, it) {
    const g = this.guard; if (!g) return false;
    const b = { x0: cx - it.w / 2 - GUARD_PAD, x1: cx + it.w / 2 + GUARD_PAD, y0: y - 0.015, y1: y + it.h + GUARD_PAD, z0: cz - it.d / 2 - GUARD_PAD, z1: cz + it.d / 2 + GUARD_PAD };
    return g.eyes.some((e) => crosses(e, g.t, b));
  }
  /** Where `it` ({ w, h, d, hang }) goes, or null when it does not fit anywhere. `start` varies the shelf it tries first. */
  put(it, start = 0) {
    if (it.hang) {
      const r = this.rail, sf = this.slot.surf[0]; if (!r) return null;
      const d = Math.min(it.w, (sf.z1 - sf.z0) - 0.05), y = r.y - it.h - 0.018, zc = (sf.z0 + sf.z1) / 2;
      while (r.next < r.spots.length && this.hides(r.spots[r.next], y, zc, { w: PITCH, h: it.h, d })) r.next++;      // (a find on the shelf under the clothes is not hung over)
      const x = r.spots[r.next];
      if (x === undefined || y < sf.y - 0.001) return null;
      r.next++;
      return { x, y, z: zc, w: PITCH, h: it.h, d };
    }
    const n = this.surfs.length;
    for (let t = 0; t < n; t++) {
      const si = (start + t) % n, s = this.surfs[si], { sf } = s;
      if (sf.h < it.h + 0.004 || it.w > sf.x1 - sf.x0 - 0.03 || it.d > sf.z1 - (sf.zr ?? sf.z0) - 0.02) continue;
      if (it.avoidRail && this.rail && sf.y + 0.05 < this.rail.y && sf.x1 > this.rail.x0 && sf.x0 < this.rail.x1) continue;      // (a find on the floor of the clothes' own space is hidden by what hangs over it)
      if (s.two && it.d > s.ld + 0.01) {                                                   // too deep for one lane: it takes both
        let x = Math.max(s.lanes[0].x, s.lanes[1].x); const z = this.zIn(s, { zc: (sf.z0 + sf.z1) / 2, lo: sf.zr ?? sf.z0, hi: sf.z1 }, it);
        if (z === null) continue;
        while (x + it.w <= sf.x1 - 0.01 && this.hides(x + it.w / 2, sf.y, z, it)) x += 0.02;                // (not in the way of the find)
        if (x + it.w > sf.x1 - 0.01) continue;
        s.lanes[0].x = s.lanes[1].x = x + it.w + 0.015;
        return { x: x + it.w / 2, y: sf.y, z, w: it.w, h: it.h, d: it.d, row: `${si}:both` };
      }
      for (const [li, ln] of s.lanes.entries()) {
        const z = this.zIn(s, ln, it);
        if (z === null) continue;
        let x = ln.x;
        while (x + it.w <= sf.x1 - 0.01 && this.hides(x + it.w / 2, sf.y, z, it)) x += 0.02;                // (not in the way of the find)
        if (x + it.w > sf.x1 - 0.01) continue;
        ln.x = x + it.w + 0.015;
        return { x: x + it.w / 2, y: sf.y, z, w: it.w, h: it.h, d: it.d, row: `${si}:${li}` };
      }
    }
    return null;
  }
}

const tint = (it, hh) => (it.col === 'team' ? hh.team?.a ?? 0xc8302a : it.col);
const vary = (c, id) => { const k = 0.9 + 0.2 * hv(id, 'tone'); const f = (s) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k))); return (f(16) << 16) | (f(8) << 8) | f(0); };
/** The colours a household's everyday clothes come in (soft, a little faded). The uniform, the white coat, the team's shirt, the overalls, the suit and the coat keep the colour that makes them what they are. */
const CLOTHES = [0xdfe6ee, 0x8fb3a0, 0xc59ab0, 0x7a4a2e, 0x9a4a3a, 0xe8d8b8, 0x4b8981, 0xa89cb8, 0xc87870, 0x344760, 0x6f7a52, 0x5a4a6a, 0xb59a5a];
const OWN_COLOUR = new Set(['uniforme', 'bata_blanca', 'camiseta_equipo', 'overol', 'abrigo', 'traje']);
const hangColour = (i, hh, key) => (OWN_COLOUR.has(i.id) || hv(key, 'pal') < 0.35 ? vary(tint(i, hh), key) : vary(CLOTHES[Math.floor(hv(key, 'col') * CLOTHES.length)], key));

/** The objects of one slot, in the piece's frame: [{ id, k, sh, x, y, z, w, h, d, col, line, who, paper?, cover?, find?, fd? }]. */
export function makeContents(ctx, S) {
  const hh = S.hh ?? householdOf(S) ?? FALLBACK_HH, slot = S.slot, rng = makeRng(hashStr(`${S.id}|${hh.seed ?? 0}`));
  const room = S.bp?.rooms?.find((r) => r.id === S.rec?.room), elev = Math.max(0, (S.loc?.y0 ?? 0) - (room?.y ?? 0));      // how high the piece hangs over the floor of its room (a wall cupboard)
  let pk = new Packer(slot, elev);
  const out = [], [cmin, cmax] = slot.cap ?? [3, 5];
  // the school's one household is its caretaker (an elder), but its lockers and desks are the pupils': what a child carries (a rucksack, exercise books, boots, the team shirt) belongs in them (R2e-002)
  const who = S.bp?.lot?.kind === 'school' ? { ...hh, kind: 'students', kids: Math.max(hh.kids ?? 0, 30), teen: true } : hh;
  let k = 0;
  const add = (o, pos) => out.push({ ...o, ...pos, k: k++, id: `${S.id}:${k}`, who: o.who ?? slot.who });
  const start = Math.floor(rng.next() * 7);
  // the paper and the find come first: they get the best spot and are never squeezed out
  const pid = S.plan?.paper, fid = S.plan?.find;
  // A thing that inspect-bindings.json binds takes its library model's footprint first (inspect.js `modelFor`: from the manifest's numbers, so the packing never depends on what has loaded),
  // then, if that does not fit at three sizes, the footprint of its old stand-in, as before: nothing is ever squeezed out for being a model.
  // (each puts its thing down in the packer `q` and returns { o, pos } for `add`, or null when it is not planned or does not fit)
  const putPaper = (q) => {
    if (!(pid && paperById.has(pid))) return null;
    const p = paperById.get(pid), base = paperLook(p.cover, `${S.id}|${pid}`), tries = [];
    for (const sc of [1, 0.8, 0.6]) { const m = modelFor(pid, null, sc); if (m) tries.push({ it: { ...base, w: m.w, h: m.h, d: m.d }, model: m }); }
    for (const sc of [1, 0.75, 0.55]) tries.push({ it: { ...base, w: base.w * sc, d: base.d * sc } });
    for (const { it, model } of tries) {
      const pos = q.put(it, start); if (!pos) continue;
      return { o: { ...it, cover: p.cover, ...(model ? { model } : {}), paper: { id: pid, kind: p.kind, prompt: PAPER_PROMPT[p.kind] ?? 'Leer' }, line: ['Un papel doblado.', 'A folded paper.'] }, pos };
    }
    return null;
  };
  const putFind = (q) => {
    if (!(fid && findById.has(fid))) return null;
    const f = findById.get(fid), size = f.size ?? 0.04, own = f.in ?? 'loose', tries = [];
    for (const [wrap, sc] of [[own, 1], ['loose', 1], ['loose', 0.75], ['loose', 0.55]]) { const m = modelFor(fid, size, sc); if (m) tries.push({ wrap, sc, m }); }
    for (const [wrap, sc] of [[own, 1], ['loose', 1], ['loose', 0.7], ['loose', 0.45]]) tries.push({ wrap, sc });
    // every size is tried off the floor of the clothes' own space first (a smaller find on a shelf is seen, a full-size one under the hanging clothes is not: a signed shirt lay there in a
    // metal wardrobe whose shelves are 0.37 m wide), and only when none fits anywhere else does the find lie there
    for (const avoidRail of [true, false]) for (const { wrap, sc, m } of tries) {
      let d;
      if (m) { const b = wrapDims(wrap); d = { w: Math.max(b ? b.w + 0.01 : 0, m.w), d: Math.max(b ? b.d + 0.01 : 0, m.d), h: (b?.h ?? 0) + m.h }; }          // the model rests on its base
      else d = findDims(f.shape, size * sc, wrap);
      const pos = q.put({ w: d.w, h: d.h, d: d.d, ...(avoidRail ? { avoidRail } : {}) }, start + 3);
      if (!pos) continue;
      q.guard = { eyes: eyesFor(slot, elev, spotEyes(S)), t: [pos.x, pos.y + pos.h / 2, pos.z] };      // nothing that is put down after the find may stand on a sight line to its middle
      return { o: { sh: 'box', col: f.tint ?? 0xe3b53b, fd: { shape: f.shape, size: size * sc, tint: f.tint ?? 0xe3b53b, wrap }, ...(m ? { model: m } : {}), find: fid, who: 'Hallazgo', line: ['', ''], ...(glints(f) ? { glint: true } : {}) }, pos };
    }
    return null;
  };
  let keys = [putPaper(pk), putFind(pk)];
  // (R4-206) the paper goes down first, so nothing kept it off the sight line to the find: a nightstand drawer's letter lay beside the coin and its padded edge stood on the line from the eye a step to the side.
  // When the paper hides the find, the find goes down first and the paper after it, under the guard; where the paper then does not fit, the first order stands
  if (keys[0] && keys[1] && pk.hides(keys[0].pos.x, keys[0].pos.y, keys[0].pos.z, keys[0].pos)) {
    const q = new Packer(slot, elev), f2 = putFind(q), p2 = f2 && putPaper(q);
    if (f2 && p2) { pk = q; keys = [p2, f2]; }
  }
  for (const key of keys) if (key) add(key.o, key.pos);
  // the ordinary things (a wide drawer holds more than a nightstand's: about one thing per 0.03 m2 of the tray that came out)
  const area = slot.surf.reduce((a, sf) => a + (sf.panel === undefined ? 0 : (sf.x1 - sf.x0) * (sf.z1 - sf.z0)), 0), more = Math.max(0, Math.min(3, Math.round(area / 0.03) - cmax));
  const want = Math.max(cmin + more - out.length, 1) + rng.int(0, Math.max(0, cmax - cmin));
  // (R2e-002) the neighbours of one pool in one room (three lockers, two nightstands, a row of cupboards) lean toward different shares of the pool: the things of the pool are dealt out among
  // the n slots in an order the room fixes, a slot takes its own share three times as readily and the others' at a third, so no two of them hold the same lunchbox, bottle and coat
  const sib = S.sib?.n > 1 ? S.sib : null, home = new Map();
  if (sib) ITEMS.filter((i) => i.pools.has(slot.pool)).map((i) => ({ i, h: hv(sib.key, i.id, 'home') })).sort((a, b) => a.h - b.h).forEach(({ i }, r) => home.set(i.id, r % sib.n));
  const lean = (i) => (sib ? (home.get(i.id) === sib.k ? 3 : 0.3) : 1);
  const cands = ITEMS.filter((i) => i.pools.has(slot.pool) && whenOk(i.when, who))
    .map((i) => ({ i, k: -Math.log(1e-9 + rng.next()) / (i.pools.get(slot.pool) * (i.when ? 2 : 1) * lean(i)) })).sort((a, b) => a.k - b.k);
  // a hanging rail is never bare (R4-211, R2e-004: a third of the wardrobes opened to an empty rail): the clothes hang first, from half to nine tenths of the rail, the middle first,
  // and a kind that already hangs there is much less likely to come again; the things of the shelves are picked as before. The clothes of everyone who sleeps in the room hang on its rail:
  // a tenth of the rail more for each sleeper beyond the first, up to a full rail (the beds follow the household, R4-303, so a wardrobe of 0.46 m of rail serves four or five people)
  if (slot.rail && pk.rail.spots.length) {
    const hangs = ITEMS.filter((i) => i.sh === 'hang' && i.pools.has(slot.pool) && whenOk(i.when, who)), room = pk.rail.spots.length, used = new Map();
    if (hangs.length) {
      const sleepers = Math.max(1, S.bp?.interior?.layouts?.get(S.rec?.room)?.sleeps ?? 1);
      const n = Math.max(Math.min(2, room), Math.round(room * Math.min(1, 0.5 + 0.4 * rng.next() + 0.1 * (sleepers - 1))));
      for (let h = 0; h < n; h++) {
        const i = rng.weighted(hangs, (g) => (g.pools.get(slot.pool) * (g.when ? 2 : 1) * lean(g)) / (1 + 3 * (used.get(g.id) ?? 0)));
        const pos = pk.put({ w: i.w, h: i.h, d: i.d, hang: true }, 0); if (!pos) continue;
        used.set(i.id, (used.get(i.id) ?? 0) + 1);
        add({ sh: 'hang', col: hangColour(i, hh, `${S.id}|${i.id}|${h}`), line: i.line, item: i.id }, pos);
      }
    }
  }
  let got = 0;
  for (const { i } of cands) {
    if (got >= want) break;
    if (i.sh === 'hang') continue;                                                                   // (the rail is dressed above; a hanger has no other place)
    const m = i.sh === 'hang' ? null : modelFor(i.id), at = m ? pk.put({ w: m.w, h: m.h, d: m.d }, start + got) : null;            // a bound thing: its model's footprint, else its own
    const pos = at ?? pk.put({ w: i.w, h: i.h, d: i.d, hang: i.sh === 'hang' }, start + got);
    if (!pos) continue;
    add({ sh: i.sh, col: vary(tint(i, hh), `${S.id}|${i.id}`), line: i.line, item: i.id, ...(at ? { model: m } : {}) }, pos); got++;
  }
  // a drawer wider than what lies in it does not keep everything in one corner: each row of things slides along the free width by a random share of it. The row with the find stays where the
  // packer put it, and a slide that would put a thing on a sight line to the find is halved until it does not (R4-206: two finds of 164 were hidden by the slide, not by the packing)
  if (slot.kind === 'drawer' && !out.some((o) => o.row?.endsWith(':both'))) {
    const rows = new Map(), sf = slot.surf[0];
    for (const o of out) if (o.row) (rows.get(o.row) ?? rows.set(o.row, []).get(o.row)).push(o);
    for (const row of rows.values()) {
      const free = sf.x1 - 0.01 - Math.max(...row.map((o) => o.x + o.w / 2));
      if (!(free > 0.02)) continue;
      let dx = rng.next() * free;
      if (row.some((o) => o.find)) dx = 0;
      while (dx > 0.005 && row.some((o) => pk.hides(o.x + dx, o.y, o.z, o))) dx /= 2;
      for (const o of row) o.x += dx > 0.005 ? dx : 0;
    }
  }
  for (const o of out) delete o.row;
  return out;
}

// ------------------------------------------------------------------ reading and examining
/** The paper as the reader shows it: tokens resolved for this household, title as { es, en }. */
export function readDoc(ref, hh, bid) {
  const p = paperById.get(ref?.id ?? ref); if (!p) return null;
  const r = resolvePaper(p, hh ?? FALLBACK_HH);
  return { id: r.id, kind: r.kind, cover: r.cover, themes: r.themes, title: { es: r.title, en: r.en }, who: r.who, pages: r.pages, building: bid };
}
/** A special find resolved for this household, with the journal collection's label. */
export function findInfo(id, hh) {
  const f = findById.get(id), r = resolveFind(f, hh ?? FALLBACK_HH);
  return { id, es: r.name.es, en: r.name.en, name: r.name, kind: f.kind, collectionId: f.collection, collection: collectionLabel(f.collection), collectionEn: collectionLabel(f.collection, 'en'), shape: f.shape, rarity: f.rarity, gold: r.gold, fancy: r.fancy, react: r.react };
}
/** The bilingual line 'Examinar' shows: [es, en]. */
export function examineLine(o, hh) {
  if (o.find) { const f = findInfo(o.find, hh); return [f.react.es, f.react.en]; }
  if (o.paper) { const d = readDoc(o.paper, hh); return d ? [d.title.es, d.title.en] : o.line; }                 // the title, not the first page (the reader shows the pages)
  const h = hh ?? FALLBACK_HH;
  return [fill(o.line[0], h), fill(o.line[1], h)];
}

/** Counts for tests and the debug overlay. */
export function contentStats(ctx) {
  const plan = ctx.contentPlan; if (!plan) return null;
  let papers = 0, finds = 0, orphans = 0, withPaper = 0;
  for (const o of plan.placed.values()) { papers += o.papers; finds += o.finds; orphans += o.orphans.length; if (o.papers > 0) withPaper++; }
  return { buildings: plan.placed.size, papers, finds, orphans, withPaper, planned: { papers: plan.units.reduce((n, u) => n + u.papers.length, 0), finds: plan.units.reduce((n, u) => n + u.finds.length, 0) } };
}
