// INTERIORS (A3): what is inside the containers. Three layers, all deterministic (a reload shows the same drawers):
//   1. planContents(ctx)        ONE plan for the whole barrio, made from the lots and their households alone (householdsOf replays furnishing's rng, so it does not
//                               matter which buildings are furnished yet): every building gets 1-2 papers from papers.js (no paper in more than 2 homes), the special
//                               finds of finds.js are spread so each type lands between its `min` and `max`, at most 3 per building.
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
import { layoutOf, EYE_Y } from './carcass.js';
import { standSpots } from './reach.js';
import { ITEMS, whenOk, drawProp, findDims, paperLook, PAPER_PROMPT } from './props.js';

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

/** The container kinds each household of a FURNISHED building has (the `group` of its pieces' slots): an item is only planned where it has a place to lie. null = not furnished yet.
 *  A front nobody can stand in front of is decoration (containers.js registerFronts, R4-118), so it does not count: a nightstand between the bed and the wall is no place for a diary. */
function kindsByHousehold(bp) {
  const I = bp.interior; if (!I?.hh?.length || !bp.furniture) return null;
  const out = new Map(I.hh.map((h) => [h.id, new Set()])), conns = new Map();
  for (const r of bp.furniture) {
    const lay = layoutOf(CATALOG[r.name]); if (!lay) continue;
    const set = out.get(I.rooms?.[r.room]?.hh) ?? out.get(I.hh[0].id), L = I.layouts?.get(r.room);
    const conn = L && (conns.get(L) ?? conns.set(L, L.connectivity()).get(L));
    for (const s of lay.slots) if (!L || standSpots(bp, r, s, conn).length) set.add(s.group);
  }
  return out;
}
const fits = (item, u) => !u.kinds || item.where.some((k) => u.kinds.has(k));

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
    let best = -1, bs = Infinity;
    for (const pi of cands[ui]) { if (use[pi] >= PAPER_CAP || mine.has(PAPERS[pi].id)) continue; const s = use[pi] + hv(u.hh.id, PAPERS[pi].id); if (s < bs) { bs = s; best = pi; } }
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
        const s = l + hv(f.id, u.hh.id, k); if (s < bs) { bs = s; best = ui; }
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
      const c = mine.filter((S) => !S.plan[field] && S.kinds.some((k) => item.where.includes(k)));
      if (!c.length) { out.orphans.push({ id: item.id, what: field, hh: u.hh.id }); return; }
      c.sort((a, b) => (a.reachable === false) - (b.reachable === false)                          // a slot nobody can stand in front of comes last
        || (!showsFloor(a.slot)) - (!showsFloor(b.slot))                                            // and so does a drawer too high to look into
        || (load.get(a.rec.id) ?? 0) * 2 + hv(item.id, a.id) - ((load.get(b.rec.id) ?? 0) * 2 + hv(item.id, b.id)));
      const S = c[0]; S.plan[field] = item.id; load.set(S.rec.id, (load.get(S.rec.id) ?? 0) + 1); out[bag]++;
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

class Packer {
  constructor(slot, elev = 0) {
    this.slot = slot; this.elev = elev; this.rail = slot.rail ? { ...slot.rail, x: slot.rail.x0 + 0.05 } : null;
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
  /** Where `it` ({ w, h, d, hang }) goes, or null when it does not fit anywhere. `start` varies the shelf it tries first. */
  put(it, start = 0) {
    if (it.hang) {
      const r = this.rail, sf = this.slot.surf[0]; if (!r) return null;
      const d = Math.min(it.w, (sf.z1 - sf.z0) - 0.05), y = r.y - it.h - 0.018, x = r.x;
      if (y < sf.y - 0.001 || x + 0.06 > r.x1) return null;
      r.x += 0.115;
      return { x, y, z: (sf.z0 + sf.z1) / 2, w: 0.11, h: it.h, d };
    }
    const n = this.surfs.length;
    for (let t = 0; t < n; t++) {
      const si = (start + t) % n, s = this.surfs[si], { sf } = s;
      if (sf.h < it.h + 0.004 || it.w > sf.x1 - sf.x0 - 0.03 || it.d > sf.z1 - (sf.zr ?? sf.z0) - 0.02) continue;
      if (s.two && it.d > s.ld + 0.01) {                                                   // too deep for one lane: it takes both
        const x = Math.max(s.lanes[0].x, s.lanes[1].x), z = this.zIn(s, { zc: (sf.z0 + sf.z1) / 2, lo: sf.zr ?? sf.z0, hi: sf.z1 }, it);
        if (x + it.w > sf.x1 - 0.01 || z === null) continue;
        s.lanes[0].x = s.lanes[1].x = x + it.w + 0.015;
        return { x: x + it.w / 2, y: sf.y, z, w: it.w, h: it.h, d: it.d, row: `${si}:both` };
      }
      for (const [li, ln] of s.lanes.entries()) {
        const z = this.zIn(s, ln, it);
        if (ln.x + it.w > sf.x1 - 0.01 || z === null) continue;
        const x = ln.x; ln.x += it.w + 0.015;
        return { x: x + it.w / 2, y: sf.y, z, w: it.w, h: it.h, d: it.d, row: `${si}:${li}` };
      }
    }
    return null;
  }
}

const tint = (it, hh) => (it.col === 'team' ? hh.team?.a ?? 0xc8302a : it.col);
const vary = (c, id) => { const k = 0.9 + 0.2 * hv(id, 'tone'); const f = (s) => Math.max(0, Math.min(255, Math.round(((c >> s) & 255) * k))); return (f(16) << 16) | (f(8) << 8) | f(0); };

/** The objects of one slot, in the piece's frame: [{ id, k, sh, x, y, z, w, h, d, col, line, who, paper?, cover?, find?, fd? }]. */
export function makeContents(ctx, S) {
  const hh = S.hh ?? householdOf(S) ?? FALLBACK_HH, slot = S.slot, rng = makeRng(hashStr(`${S.id}|${hh.seed ?? 0}`));
  const room = S.bp?.rooms?.find((r) => r.id === S.rec?.room), elev = Math.max(0, (S.loc?.y0 ?? 0) - (room?.y ?? 0));      // how high the piece hangs over the floor of its room (a wall cupboard)
  const pk = new Packer(slot, elev), out = [], [cmin, cmax] = slot.cap ?? [3, 5];
  let k = 0;
  const add = (o, pos) => out.push({ ...o, ...pos, k: k++, id: `${S.id}:${k}`, who: o.who ?? slot.who });
  const start = Math.floor(rng.next() * 7);
  // the paper and the find come first: they get the best spot and are never squeezed out
  const pid = S.plan?.paper, fid = S.plan?.find;
  if (pid && paperById.has(pid)) {
    const p = paperById.get(pid), base = paperLook(p.cover, `${S.id}|${pid}`);
    for (const sc of [1, 0.75, 0.55]) {
      const it = { ...base, w: base.w * sc, d: base.d * sc }, pos = pk.put(it, start); if (!pos) continue;
      add({ ...it, cover: p.cover, paper: { id: pid, kind: p.kind, prompt: PAPER_PROMPT[p.kind] ?? 'Leer' }, line: ['Un papel doblado.', 'A folded paper.'] }, pos); break;
    }
  }
  if (fid && findById.has(fid)) {
    const f = findById.get(fid), size = f.size ?? 0.04;
    for (const [wrap, sc] of [[f.in ?? 'loose', 1], ['loose', 1], ['loose', 0.7], ['loose', 0.45]]) {
      const sz = size * sc, d = findDims(f.shape, sz, wrap), pos = pk.put({ w: d.w, h: d.h, d: d.d }, start + 3);
      if (!pos) continue;
      add({ sh: 'box', col: f.tint ?? 0xe3b53b, fd: { shape: f.shape, size: sz, tint: f.tint ?? 0xe3b53b, wrap }, find: fid, who: 'Hallazgo', line: ['', ''] }, pos); break;
    }
  }
  // the ordinary things (a wide drawer holds more than a nightstand's: about one thing per 0.03 m2 of the tray that came out)
  const area = slot.surf.reduce((a, sf) => a + (sf.panel === undefined ? 0 : (sf.x1 - sf.x0) * (sf.z1 - sf.z0)), 0), more = Math.max(0, Math.min(3, Math.round(area / 0.03) - cmax));
  const want = Math.max(cmin + more - out.length, 1) + rng.int(0, Math.max(0, cmax - cmin));
  const cands = ITEMS.filter((i) => i.pools.has(slot.pool) && whenOk(i.when, hh))
    .map((i) => ({ i, k: -Math.log(1e-9 + rng.next()) / (i.pools.get(slot.pool) * (i.when ? 2 : 1)) })).sort((a, b) => a.k - b.k);
  let got = 0;
  for (const { i } of cands) {
    if (got >= want) break;
    const pos = pk.put({ w: i.w, h: i.h, d: i.d, hang: i.sh === 'hang' }, start + got);
    if (!pos) continue;
    add({ sh: i.sh, col: vary(tint(i, hh), `${S.id}|${i.id}`), line: i.line, item: i.id }, pos); got++;
  }
  // a drawer wider than what lies in it does not keep everything in one corner: each row of things slides along the free width by a random share of it
  if (slot.kind === 'drawer' && !out.some((o) => o.row?.endsWith(':both'))) {
    const rows = new Map(), sf = slot.surf[0];
    for (const o of out) if (o.row) (rows.get(o.row) ?? rows.set(o.row, []).get(o.row)).push(o);
    for (const row of rows.values()) { const free = sf.x1 - 0.01 - Math.max(...row.map((o) => o.x + o.w / 2)); if (free > 0.02) { const dx = rng.next() * free; for (const o of row) o.x += dx; } }
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
