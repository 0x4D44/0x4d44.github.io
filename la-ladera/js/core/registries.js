// Small shared registries. Producers (arch/interiors/world) ADD to them during their stage;
// consumers (engine light pool, people spawner, journal UI) read them afterwards.

/**
 * Lights: { x,y,z, color:0xffd9a0, intensity, distance, decay?:2, kind:'ceiling'|'lamp'|'window'|'street'|'candle'|'tv',
 *           building?, room?, flicker? }. The engine keeps a small pool of real PointLights on the ones nearest
 * the player; everything else is just emissive geometry. Intensity is in three.js candela (a ceiling bulb ~ 6-10).
 */
export class LightRegistry {
  constructor() { this.list = []; }
  add(l) { l.id ??= 'L' + this.list.length; this.list.push(l); return l; }
}

/**
 * Anchors: places an NPC can stand/sit/work. { id?, kind, x,y,z (feet position), ry (facing, radians about Y),
 *   building?, room?, tags?:[], seatH? , capacity?:1, owner? }
 * kinds: stand sit sleep cook counter customer tv sweep laundry chat lean bench read phone work pray play wash
 *        carry vend greet.  (People animations cover exactly this list; add a kind => tell the people agent.)
 */
export const ANCHOR_KINDS = ['stand', 'sit', 'sleep', 'cook', 'counter', 'customer', 'tv', 'sweep', 'laundry', 'chat', 'lean', 'bench', 'read', 'phone', 'work', 'pray', 'play', 'wash', 'carry', 'vend', 'greet'];

/** Discoveries: tiny rewards for curiosity. { id, name (Spanish), en (English line), x,y,z, radius, kind } */
export class Discoveries {
  constructor(ctx) { this.ctx = ctx; this.items = new Map(); this.found = new Set(); }
  register(d) {
    d.radius ??= 3;
    if (this.items.has(d.id)) console.warn('[discover] duplicate id', d.id);
    this.items.set(d.id, d); return d;
  }
  /** Called each frame with the player position; fires 'discover' once per item. */
  check(x, y, z) {
    for (const d of this.items.values()) {
      if (this.found.has(d.id)) continue;
      const dx = x - d.x, dz = z - d.z, dy = (y - (d.y ?? y));
      if (dx * dx + dz * dz < d.radius * d.radius && Math.abs(dy) < (d.dy ?? 3)) {
        this.found.add(d.id); this.ctx.events.emit('discover', d);
      }
    }
  }
  get total() { return this.items.size; }
}
