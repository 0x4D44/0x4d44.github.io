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

/**
 * Discoveries: tiny rewards for curiosity. { id, name (Spanish), en (English line), x,y,z, radius, kind }
 * Two sorts. The WORLD ones are registered up front and found by walking up to them (`check`); `total` / `count` ("N de M") are about those.
 * A FIND (kind 'hallazgo', alias 'find': the special things in drawers and wardrobes) is found by interaction: `mark(d)` registers it at that moment
 * (so the NPCs never hint at something unfound and nothing proximity-triggers it), it joins `found`, and it is counted by `finds`, not by `total`.
 */
export const isFind = (d) => d?.kind === 'hallazgo' || d?.kind === 'find';

export class Discoveries {
  constructor(ctx) { this.ctx = ctx; this.items = new Map(); this.found = new Set(); }
  register(d) {
    d.radius ??= 3;
    if (this.items.has(d.id)) console.warn('[discover] duplicate id', d.id);
    this.items.set(d.id, d); return d;
  }
  /** Called each frame with the player position; fires 'discover' once per item. Items marked by interaction (`manual`, every find) are never proximity-triggered. */
  check(x, y, z) {
    for (const d of this.items.values()) {
      if (d.manual || this.found.has(d.id) || isFind(d)) continue;
      const dx = x - d.x, dz = z - d.z, dy = (y - (d.y ?? y));
      if (dx * dx + dz * dz < d.radius * d.radius && Math.abs(dy) < (d.dy ?? 3)) {
        this.found.add(d.id); this.ctx.events.emit('discover', d);
      }
    }
  }
  /**
   * Found by interaction. `d` = { id, name, en, kind: 'hallazgo' | 'find' | any, collection?, x, y, z }. A new id is registered (as `manual`, radius 0, a find's kind
   * normalised to 'hallazgo'); an id registered earlier is just marked. Adds it to `found` and emits 'discover'. True when newly found, false when it already was.
   */
  mark(d) {
    if (!d || d.id == null || this.found.has(d.id)) return false;
    let it = this.items.get(d.id);
    if (!it) { it = { ...d, radius: d.radius ?? 0, manual: true }; if (isFind(it)) it.kind = 'hallazgo'; this.items.set(it.id, it); }
    this.found.add(it.id); this.ctx.events.emit('discover', it);
    return true;
  }
  /** The registered world discoveries ("N de M"): finds are not part of it. */
  get total() { let n = 0; for (const d of this.items.values()) if (!isFind(d)) n++; return n; }
  /** How many of those the player has found. */
  get count() { let n = 0; for (const id of this.found) { const d = this.items.get(id); if (d && !isFind(d)) n++; } return n; }
  /** How many finds the player has found. */
  get finds() { let n = 0; for (const id of this.found) if (isFind(this.items.get(id))) n++; return n; }
}
