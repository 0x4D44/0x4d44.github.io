// Real-light pool (owner: A1). The registry (ctx.lights.list, filled by arch/interiors/world) may hold hundreds of lights; WebGL forward
// shading can afford only a handful of real ones. This keeps N PointLights (constant count: changing it would recompile every shader)
// on the best candidates around the player and fades them in/out so nothing pops. Everything else is emissive geometry.
//
// Registry light: { x,y,z, color, intensity (candela), distance, kind:'ceiling'|'lamp'|'window'|'street'|'candle'|'tv', building?, room?, flicker?, on? }
//  - street / window lights follow the night (ctx.night); ceiling / lamp / candle / tv are on at night and whenever the player is in their building
//  - indoors only that building's lights (plus street/window spill within 12 m) are considered, on the player's floor only (from 0.25 m under the feet to 3.1 m above them,
//    or the room's height + 0.4 in a tall room), so light never leaks through slabs; the lights of the player's own room come first
import * as THREE from 'three';

const NIGHT_KINDS = new Set(['street', 'window']);
const noise = (t) => Math.sin(t * 17.3) * 0.5 + Math.sin(t * 7.1 + 1.3) * 0.3 + Math.sin(t * 31.7 + 4.1) * 0.2;

export class LightPool {
  constructor(ctx, max = 8) {
    this.ctx = ctx; this.max = max; this.active = max; this.slots = []; this.t = 0; this.cool = 0;
    for (let i = 0; i < max; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2); light.name = 'poolLight' + i; light.castShadow = false;
      ctx.scene.add(light);
      light.position.set(0, -1e4, 0); light.distance = 1;           // parked far away: the shader's range test skips an idle light for free
      this.slots.push({ light, src: null, cur: 0, want: 0, base: 0 });
    }
    this.chosen = new Set();
    this.cands = [];
  }

  setActive(n) { this.active = Math.max(0, Math.min(this.max, n)); }

  _onFactor(l, bId) {
    const night = this.ctx.night;
    if (NIGHT_KINDS.has(l.kind)) return night;
    if (l.building && l.building === bId) return 1;
    return night > 0.25 ? night : 0;
  }

  /** Choose the best `active` registry lights for the current player position. */
  _select() {
    const ctx = this.ctx, p = ctx.player, list = ctx.lights.list, out = this.cands; out.length = 0;
    if (!p || !list.length) return out;
    const px = p.s.x, py = p.s.y, pz = p.s.z, bId = p.building, indoors = !!p.indoors, roomId = p.room?.id ?? null;
    // This floor's band, measured up from the feet: every light of the barrio sits 0.8 to 4.6 m above the floor of its own room (ceiling lamps 2.15 and up, a table or floor
    // lamp about 1, a tv 0.8, a candle 1), so a light under the player's floor is on the storey below (its ceiling lamp is 0.5 m under the slab) and one above 3.1 m, or above
    // the room's own ceiling in a tall room, is on the storey above. R4-202: with the old band (-3.2 .. +5.2 m) the lamps of the storey below took six of the eight places,
    // the room's own ceiling lamp got none, and a first-floor room stood in the dark (or in the blue of a television) while the room under it was lit.
    const top = Math.max(3.1, (p.room?.h ?? 0) + 0.4);
    for (let i = 0; i < list.length; i++) {
      const l = list[i];
      if (l.on === false || !(l.intensity > 0)) continue;
      const f = this._onFactor(l, indoors ? bId : null);
      if (f < 0.02) continue;
      const dx = l.x - px, dz = l.z - pz, dy = (l.y ?? py + 2) - py, d = Math.hypot(dx, dz, dy * 1.3);
      let score = d;
      if (indoors) {
        const mine = l.building === bId;
        if (!mine && !(NIGHT_KINDS.has(l.kind) && d < 12)) continue;
        if (mine && (dy < -0.25 || dy > top)) continue;                     // another floor: the slab is between, and the pool has eight places
        if (mine && roomId && l.room === roomId) score -= 6;                // (the player's room is an object: this compared it to an id and never matched)
      } else {
        if (l.building && !NIGHT_KINDS.has(l.kind)) continue;               // house interiors: seen as lit windows, not as real lights
        if (d > (l.distance ?? 9) + 45) continue;
      }
      const slot = this.slots.find((s) => s.src === l); if (slot && slot.want) score -= 1.5;     // hysteresis
      out.push({ l, score, f });
    }
    out.sort((a, b) => a.score - b.score);
    return out;
  }

  /** dt = seconds; snap = jump straight to the target (after a teleport). */
  update(dt, snap = false) {
    this.t += dt;
    this.cool -= dt;
    const slots = this.slots;
    if (this.cool <= 0 || snap) {
      this.cool = 0.12;
      const cands = this._select(), n = Math.min(this.active, cands.length);
      this.chosen.clear();
      for (let i = 0; i < n; i++) this.chosen.add(cands[i].l);
      for (const s of slots) s.want = s.src && this.chosen.has(s.src) ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const l = cands[i].l;
        if (slots.some((s) => s.src === l)) continue;
        // a slot is free when empty or faded out; after a teleport (snap) every slot that lost its light is free at once: they all jump below,
        // otherwise the street lamps of the old place hold the pool for ~0.5 s and the new room stands dark for its first frames.
        // Only the first `active` slots count (the medium / low profiles run 6 / 4 lights): a light put in a switched-off slot would be killed below.
        const live = this.active, free = slots.find((s, k) => k < live && !s.src) ?? slots.find((s, k) => k < live && !s.want && (snap || s.cur < 0.04));
        if (free) { free.src = l; free.cur = 0; free.want = 1; }
      }
    }
    const k = snap ? 1 : 1 - Math.exp(-dt * 7);
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i], L = s.light;
      if (i >= this.active) s.want = 0;
      s.cur += (s.want - s.cur) * k;
      if (s.cur < 0.004 && !s.want) {
        s.cur = 0; s.src = null;
        if (L.intensity !== 0) { L.intensity = 0; L.position.set(0, -1e4, 0); L.distance = 1; }
        continue;
      }
      const l = s.src; if (!l) continue;
      const bId = this.ctx.player?.indoors ? this.ctx.player.building : null;
      const f = this._onFactor(l, bId);
      let I = l.intensity * f * s.cur;
      const fl = l.flicker ?? (l.kind === 'candle' ? 0.25 : l.kind === 'tv' ? 0.35 : 0);
      if (fl) I *= 1 + fl * noise(this.t + (l.x + l.z) * 3);
      L.position.set(l.x, l.y ?? 2.4, l.z);
      L.color.setHex(l.color ?? (l.kind === 'tv' ? 0x9fb8ff : l.kind === 'street' ? 0xffc27a : 0xffd9a0));
      L.distance = l.distance ?? (l.kind === 'street' ? 14 : 8); L.decay = l.decay ?? 2;
      L.intensity = I;
    }
  }

  /** Current pool state for the debug overlay. */
  stats() { return { max: this.max, active: this.active, lit: this.slots.filter((s) => s.light.intensity > 0.01).length }; }
}
