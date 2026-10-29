// Interaction targeting: doors, NPCs, switches, anything the player can press E on.
//
//   ctx.interact.register({
//     id?, kind:'door'|'npc'|'object'|'sit'|..., x, y, z,              // world point (eye-height-ish for doors/NPC heads)
//     radius: 2.4,                                                      // max distance from the eye
//     prompt: 'Abrir puerta'  |  (ctx, it) => string,                  // shown as "E  <prompt>"
//     use(ctx, it) {...},                                              // E pressed while targeted
//     enabled?(ctx, it), aim?: 0.72 (min cos to view dir), ignoreDoor?: doorId (see through own leaf), building? })
//   Items can move: mutate it.x/it.y/it.z every frame (NPCs do).
export class Interact {
  constructor(ctx) { this.ctx = ctx; this.items = new Map(); this.target = null; this.seq = 0; this.reach = 2.6; }

  register(it) { it.id ??= 'i' + (++this.seq); it.radius ??= this.reach; this.items.set(it.id, it); return it; }
  unregister(x) { this.items.delete(typeof x === 'string' ? x : x.id); }

  /** Pick the best target for an eye position and unit view direction. Returns the item or null. */
  update(eye, dir) {
    let best = null, bs = Infinity;
    const phys = this.ctx.physics;
    for (const it of this.items.values()) {
      if (it.enabled && it.enabled(this.ctx, it) === false) continue;
      const dx = it.x - eye.x, dy = (it.y ?? eye.y) - eye.y, dz = it.z - eye.z, d = Math.hypot(dx, dy, dz);
      if (d > it.radius) continue;
      const cos = (dx * dir.x + dy * dir.y + dz * dir.z) / (d || 1);
      if (cos < (it.aim ?? 0.72) && d > 0.7) continue;
      const score = d * (2.2 - cos);
      if (score >= bs) continue;
      if (phys.segmentBlocked(eye.x, eye.z, it.x, it.z, eye.y - 1.4, 1.2, it.ignoreDoor ?? null)) continue;
      bs = score; best = it;
    }
    this.target = best;
    return best;
  }

  prompt() {
    const t = this.target; if (!t) return null;
    return typeof t.prompt === 'function' ? t.prompt(this.ctx, t) : t.prompt;
  }

  use() { const t = this.target; if (t?.use) t.use(this.ctx, t); return !!t; }
}
