// Doors for people: an NPC that walks through a door asks for it to open (collider + the leaf's swing, js/arch/doors.js `door:request`), keeps it open while
// anybody is passing and closes it a moment later, unless the shop is open (a shutter stays up all day) or somebody is standing in the doorway.
// PURE (no THREE, no DOM): the physics object and the event bus come from ctx.
//
//   const doors = new Doors(sim);  doors.hold(id, npc.id);  ...walk through...  doors.release(id, npc.id);  doors.update();  (once per sim step)
export class Doors {
  constructor(sim) {
    this.w = sim; this.holders = new Map(); this.pending = new Map(); this.kept = new Set(); this.requests = 0; this.known = new Map();
  }

  get ph() { return this.w.ctx.physics; }
  /** Does this door have a leaf / shutter the physics knows (archways have none: nothing to open). */
  has(id) { return !!id && this.ph.doors?.has(id); }
  isOpen(id) { return !this.has(id) || this.ph.doorOpen(id); }

  request(id, open) {
    if (!this.has(id)) return false;
    if (this.ph.doorOpen(id) === open) return true;
    this.ph.setDoor(id, open); this.requests++;
    try { this.w.ctx.events?.emit?.('door:request', { doorId: id, open, by: 'npc' }); } catch { /* no listener yet */ }
    return true;
  }

  /** `who` is about to pass: the door opens now and stays open until every holder released it. */
  hold(id, who) {
    if (!this.has(id)) return;
    let s = this.holders.get(id); if (!s) this.holders.set(id, s = new Set()); s.add(who);
    this.pending.delete(id);
    this.request(id, true);
  }

  release(id, who) {
    if (!this.has(id)) return;
    const s = this.holders.get(id); s?.delete(who);
    if (!s?.size && !this.kept.has(id)) this.pending.set(id, this.w.t + 1.4);
  }

  /** A shop shutter stays open for the whole opening time. */
  keepOpen(id, on) {
    if (!this.has(id)) return;
    if (on) { this.kept.add(id); this.pending.delete(id); this.request(id, true); }
    else { this.kept.delete(id); if (!this.holders.get(id)?.size) this.pending.set(id, this.w.t + 0.6); }
  }

  /** Somebody (the player or a person) stands in the doorway: closing now would shove them. */
  _occupied(id) {
    const c = this.centre(id); if (!c) return false;
    const P = this.w.player; if (Math.hypot(P.x - c.x, P.z - c.z) < 1.5 && Math.abs(P.y - c.y) < 1.8) return true;
    for (const n of this.w.npcs) { if (n.away) continue; if (Math.hypot(n.st.x - c.x, n.st.z - c.z) < 1.1 && Math.abs(n.st.y - c.y) < 1.8) return true; }
    return false;
  }

  /** Door centre from the entrances registered by the spots (midpoint outside/inside). */
  centre(id) { return this.known.get(id) ?? null; }
  know(id, ent) { if (ent && !this.known.has(id)) this.known.set(id, { x: (ent.outside.x + ent.inside.x) / 2, y: ent.outside.y, z: (ent.outside.z + ent.inside.z) / 2 }); }

  update() {
    if (!this.pending.size) return;
    const t = this.w.t;
    for (const [id, at] of this.pending) {
      if (t < at) continue;
      if (this.kept.has(id) || this.holders.get(id)?.size) { this.pending.delete(id); continue; }
      if (this._occupied(id)) { this.pending.set(id, t + 1); continue; }
      this.request(id, false); this.pending.delete(id);
    }
  }
}
