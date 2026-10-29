// Where things can happen: the registry of places an inhabitant can stand and do something (outdoor POIs of the plan, indoor anchors of the interiors,
// building entrances), with claims so two people never take the same bench. PURE (no THREE, no DOM): runs under Node for the scheduling tests.
//
//   const spots = new Spots({ plan, anchors: ctx.anchors, buildings: ctx.buildings });
//   const s = spots.nearest('sweep', x, z, { maxD: 60, tag: 'doorstep' }); spots.claim(s, npc); ... spots.release(npc);
//   spots.entrance('L02')        -> { id, doorId, outside:{x,y,z}, inside:{x,y,z}, ry, yawIn, kind }
//
// Capacity: a bench seats one, a chat spot two, a play spot (a patch of the court) six; everything else one.
const CAPACITY = { chat: 2, play: 6, bench: 1, sweep: 1, lean: 1, vend: 1, greet: 1, stand: 2, phone: 1, counter: 1, customer: 1, cook: 1, sit: 1, work: 1, pray: 3, sleep: 1 };

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

  list(kind) { return this.byKind.get(kind) ?? []; }
  has(s, tag) { return s.tagSet.has(tag); }
  free(s) { return s.occ.length < s.cap; }

  /** Nearest spot of `kind` to (x,z): { maxD, tag, building, indoor:false|true|null, pairable:'one'|null, free:true, near:(spot)=>bool }. */
  nearest(kind, x, z, o = {}) {
    let best = null, bd = (o.maxD ?? 1e9) ** 2;
    for (const s of this.list(kind)) {
      if ((o.free ?? true) && !this.free(s)) continue;
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

  /** A random free spot of `kind` within maxD of (x,z), nearer ones likelier (rng.next in [0,1)). */
  pick(kind, x, z, rng, o = {}) {
    const cands = [];
    for (const s of this.list(kind)) {
      if (!this.free(s)) continue;
      if (o.tag && !s.tagSet.has(o.tag)) continue;
      if (o.building && s.building !== o.building) continue;
      if (o.indoor === true && s.src !== 'anchor') continue;
      if (o.indoor === false && s.src !== 'poi') continue;
      if (o.half && s.occ.length !== 1) continue;
      if (o.filter && !o.filter(s)) continue;
      const d = Math.hypot(s.x - x, s.z - z); if (d > (o.maxD ?? 1e9)) continue;
      cands.push([s, 1 / (8 + d)]);
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
    if (e) out = { id: e.id, doorId: e.doorId, kind: e.kind, outside: { x: e.outside[0], y: e.outside[1], z: e.outside[2] }, inside: { x: e.inside[0], y: e.inside[1], z: e.inside[2] }, ry: e.ry ?? 0, yawIn: e.yawIn ?? 0 };
    else if (lot?.entrance?.outside) {                                    // plan only (no building plan): the step in front of the lot, no door
      const o = lot.entrance.outside; out = { id: lotId + '.e', doorId: null, kind: 'main', outside: { x: o[0], y: o[1], z: o[2] }, inside: null, ry: 0, yawIn: 0 };
    }
    this._ent.set(key, out); return out;
  }

  /** Indoor anchors of a building: kind -> [spot]. */
  inside(lotId, kind) { return this.list(kind).filter((s) => s.src === 'anchor' && s.building === lotId); }
}
