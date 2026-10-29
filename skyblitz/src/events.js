// Tiny synchronous event bus. Gameplay modules EMIT; presentation modules (fx, audio, ui) LISTEN.
// The authoritative event catalogue (names + payloads) lives in the design contract. Owner: lead.
export class EventBus {
  constructor() { this.map = new Map(); this.log = null; }
  /** Subscribe. Returns an unsubscribe function. type '*' receives (type, payload) for every event. */
  on(type, fn) {
    let set = this.map.get(type);
    if (!set) this.map.set(type, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }
  once(type, fn) { const off = this.on(type, (p) => { off(); fn(p); }); return off; }
  off(type, fn) { this.map.get(type)?.delete(fn); }
  emit(type, payload) {
    if (this.log) this.log.push({ type, payload });
    const set = this.map.get(type);
    if (set) for (const fn of [...set]) { try { fn(payload); } catch (e) { console.error(`[event ${type}]`, e); } }
    const any = this.map.get('*');
    if (any) for (const fn of [...any]) { try { fn(type, payload); } catch (e) { console.error('[event *]', e); } }
  }
}
