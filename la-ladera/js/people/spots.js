// Where things can happen: the registry of places an inhabitant can stand and do something (outdoor POIs of the plan, indoor anchors of the interiors,
// building entrances), with claims so two people never take the same bench. PURE (no THREE, no DOM): runs under Node for the scheduling tests.
//
//   const spots = new Spots({ plan, anchors: ctx.anchors, buildings: ctx.buildings });
//   const s = spots.nearest('sweep', x, z, { maxD: 60, tag: 'doorstep' }); spots.claim(s, npc); ... spots.release(npc);
//   spots.entrance('L02')        -> { id, lot, doorId, outside:{x,y,z}, inside:{x,y,z}, ry, yawIn, kind }
//
// Capacity: a bench seats one, a chat spot two, a play spot (a patch of the court) six; everything else one.
const CAPACITY = { chat: 2, play: 6, bench: 1, sweep: 1, lean: 1, vend: 1, greet: 1, stand: 2, phone: 1, counter: 1, customer: 1, cook: 1, sit: 1, work: 1, pray: 3, sleep: 1 };
/** The outdoor spots people stand on in the open, and the radius of free ground each needs (a chat pair stands 0.4 m either side of the spot, a body is 0.2 m across): `Spots.fit` moves these off solids. */
export const FIT = { chat: 0.65, stand: 0.5, greet: 0.3, phone: 0.3 };
export const FIT_REACH = 1.6;         // metres: how far a spot may move off a tree trunk or a lamp post to find free ground

export class Spots {
  constructor({ plan = null, anchors = [], buildings = new Map() } = {}) {
    this.byKind = new Map(); this.all = []; this.claims = new Map(); this.buildings = buildings; this.lots = new Map((plan?.lots ?? []).map((l) => [l.id, l]));
    for (const p of plan?.pois ?? []) this._add({ id: p.id, src: 'poi', kind: p.kind, x: p.x, y: p.y ?? 0, z: p.z, ry: p.ry ?? 0, tags: p.tags ?? [], building: p.building ?? null });
    for (const a of anchors ?? []) this._add({ id: a.id, src: 'anchor', kind: a.kind, x: a.x, y: a.y ?? 0, z: a.z, ry: a.ry ?? 0, tags: a.tags ?? [], building: a.building ?? null, room: a.room ?? null, seatH: a.seatH });
    this._ent = new Map();
  }

  _add(s) {
    s.cap = CAPACITY[s.kind] ?? 1; s.occ = []; s.tagSet = new Set(s.tags);
    this.all.push(s); let l = this.byKind.get(s.kind); if (!l) this.byKind.set(s.kind, l = []); l.push(s);
  }

  /**
   * Move the outdoor spots people stand on in the open off whatever solid the world has put on them (a tree trunk, a lamp post, a planter: the plan places its corners before the props do; the
   * almond tree of the Plazoleta de los Almendros stood 0.23 m from a chat corner, so two women talked inside its trunk). Each spot of a kind in `FIT` that `clear(x, z, spot, radius)` refuses goes to
   * the nearest point of a widening ring (every 0.3 m, up to `reach`) that it accepts; a spot with no such point stays where it is. Returns the spots moved (the old place is kept as x0, z0).
   */
  fit(clear, reach = FIT_REACH) {
    const moved = [];
    for (const s of this.all) {
      const R = FIT[s.kind];
      if (!R || s.src !== 'poi' || clear(s.x, s.z, s, R)) continue;
      let p = null;
      for (let r = 0.3; r <= reach + 1e-9 && !p; r += 0.3) {
        const n = Math.max(8, Math.round(r * 20));
        for (let i = 0; i < n && !p; i++) { const a = (i / n) * Math.PI * 2, x = s.x + Math.sin(a) * r, z = s.z + Math.cos(a) * r; if (clear(x, z, s, R)) p = { x, z }; }
      }
      if (p) { s.x0 = s.x; s.z0 = s.z; s.x = p.x; s.z = p.z; moved.push(s); }
    }
    return moved;
  }

  /**
   * Cut the outdoor places nobody can walk to: `reach(spot)` is false when the way in is shut. A walker goes over the street graph to the node nearest the place and then straight to it
   * (brain.js goPoint), so a place the world put on the far side of a wall from every node sent each taker into the wall, stuck for seconds: the benches at the ends of the court stand outside
   * its chain-link fence, which has gaps only where the graph crosses it, and they were 106 of the 159 snags of a six-hour soak. `pick` and `nearest` skip a cut place. Returns the places cut.
   */
  screen(reach) {
    const cut = [];
    for (const s of this.all) if (s.src === 'poi' && !s.cut && reach(s) === false) { s.cut = true; cut.push(s); }
    return cut;
  }

  list(kind) { return this.byKind.get(kind) ?? []; }
  has(s, tag) { return s.tagSet.has(tag); }
  free(s) { return s.occ.length < s.cap; }

  /** Nearest spot of `kind` to (x,z): { maxD, tag, building, indoor:false|true|null, pairable:'one'|null, free:true, near:(spot)=>bool }. */
  nearest(kind, x, z, o = {}) {
    let best = null, bd = (o.maxD ?? 1e9) ** 2;
    for (const s of this.list(kind)) {
      if (s.cut || ((o.free ?? true) && !this.free(s))) continue;
      if (o.tag && !s.tagSet.has(o.tag)) continue;
      if (o.building && s.building !== o.building) continue;
      if (o.indoor === true && s.src !== 'anchor') continue;
      if (o.indoor === false && s.src !== 'poi') continue;
      if (o.half && s.occ.length !== 1) continue;                 // a chat spot with exactly one person waiting: join them
      if (o.filter && !o.filter(s)) continue;
      const d = (s.x - x) ** 2 + (s.z - z) ** 2;
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** A random free spot of `kind` within maxD of (x,z), nearer ones likelier (rng.next in [0,1)). o.weight(spot) -> (0, 1]: a spot the caller would rather not (a twin beside it) is that much less likely. */
  pick(kind, x, z, rng, o = {}) {
    const cands = [];
    for (const s of this.list(kind)) {
      if (s.cut || !this.free(s)) continue;
      if (o.tag && !s.tagSet.has(o.tag)) continue;
      if (o.building && s.building !== o.building) continue;
      if (o.indoor === true && s.src !== 'anchor') continue;
      if (o.indoor === false && s.src !== 'poi') continue;
      if (o.half && s.occ.length !== 1) continue;
      if (o.filter && !o.filter(s)) continue;
      const d = Math.hypot(s.x - x, s.z - z); if (d > (o.maxD ?? 1e9)) continue;
      cands.push([s, (1 / (6 + d) ** 1.5) * (o.weight ? o.weight(s) : 1)]);
    }
    if (!cands.length) return null;
    let tot = 0; for (const [, w] of cands) tot += w; let r = rng.next() * tot;
    for (const [s, w] of cands) { r -= w; if (r <= 0) return s; }
    return cands[cands.length - 1][0];
  }

  claim(s, npc) { if (!s) return null; this.release(npc); if (!s.occ.includes(npc.id)) s.occ.push(npc.id); this.claims.set(npc.id, s); return s; }
  release(npc) { const s = this.claims.get(npc.id); if (s) { const i = s.occ.indexOf(npc.id); if (i >= 0) s.occ.splice(i, 1); this.claims.delete(npc.id); } }
  claimOf(npc) { return this.claims.get(npc.id) ?? null; }
  /** The other person on a shared spot (a chat pair), or null. */
  partnerOn(s, npc) { for (const id of s.occ) if (id !== npc.id) return id; return null; }

  /**
   * The doors of a lot: prefers the `kind` order given (shops: 'shop' then 'main'); `outside` is the step in front of the door, `inside` a point just
   * behind it. Returns null when the building has no ground-floor entrance.
   */
  entrance(lotId, prefer = ['shop', 'main']) {
    const key = lotId + '|' + prefer.join(',');
    if (this._ent.has(key)) return this._ent.get(key);
    const bp = this.buildings.get?.(lotId), lot = this.lots.get(lotId);
    let list = (bp?.entrances ?? []).filter((e) => e.kind !== 'roof' && e.outside && e.inside);
    let e = null;
    for (const k of prefer) { e = list.find((x) => x.kind === k); if (e) break; }
    e ??= list[0] ?? null;
    let out = null;
    if (e) out = { id: e.id, lot: lotId, doorId: e.doorId, kind: e.kind, outside: { x: e.outside[0], y: e.outside[1], z: e.outside[2] }, inside: { x: e.inside[0], y: e.inside[1], z: e.inside[2] }, ry: e.ry ?? 0, yawIn: e.yawIn ?? 0 };
    else if (lot?.entrance?.outside) {                                    // plan only (no building plan): the step in front of the lot, no door
      const o = lot.entrance.outside; out = { id: lotId + '.e', lot: lotId, doorId: null, kind: 'main', outside: { x: o[0], y: o[1], z: o[2] }, inside: null, ry: 0, yawIn: 0 };
    }
    this._ent.set(key, out); return out;
  }

  /** Indoor anchors of a building: kind -> [spot]. */
  inside(lotId, kind) { return this.list(kind).filter((s) => s.src === 'anchor' && s.building === lotId); }
}
