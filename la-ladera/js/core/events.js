// Minimal event bus. Well-known events (payload):
//   player:enter {buildingId, floor}   player:exit {buildingId}   player:floor {buildingId, floor}
//   door:toggle {doorId, open}         npc:talk {npcId}           npc:line {npcId, es, en}
//   discover {id, name}                time:change {hour}         stage {name, ms, error?}
export class Events {
  constructor() { this.m = new Map(); }
  on(ev, fn) { (this.m.get(ev) ?? this.m.set(ev, []).get(ev)).push(fn); return () => this.off(ev, fn); }
  once(ev, fn) { const off = this.on(ev, (p) => { off(); fn(p); }); return off; }
  off(ev, fn) { const a = this.m.get(ev); if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); } }
  emit(ev, payload) { const a = this.m.get(ev); if (a) for (const fn of a.slice()) { try { fn(payload); } catch (e) { console.error('[events]', ev, e); } } }
}
