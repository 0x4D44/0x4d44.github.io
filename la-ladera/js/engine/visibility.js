// Visibility budgets (owner: A1).
//  * `<id>.int` groups (furnishings, decor, clutter) are drawn only within INT_RANGE metres of the player, or always for the building the
//    player is standing in. While the player is indoors, other buildings' interiors only show when very close (seen through a window).
//  * Interior meshes never cast into the sun's shadow map (sunlight reaches rooms only through windows; furniture shadows there are not
//    worth a second pass over every sofa).
//  * Hysteresis (show at R, hide at R + 3) so a building does not flicker while the player stands on the threshold.
import * as THREE from 'three';

export const INT_RANGE = 28;
const INDOOR_OTHERS = 14;
const HYST = 3;

export class Visibility {
  constructor(ctx) {
    this.ctx = ctx; this.ints = []; this.acc = 1; this.lx = 1e9; this.lz = 1e9; this.ly = 1e9; this.shown = 0; this.p = new THREE.Vector3();
  }

  /** Scan the batch groups once every stage has flushed (cheap; safe to call again after late additions). */
  collect() {
    const ints = this.ints = [];
    for (const [id, g] of this.ctx.batch.groups) {
      if (!id.endsWith('.int')) continue;
      const box = new THREE.Box3();
      for (const m of g.meshes) {
        const geo = m.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        box.union(geo.boundingBox);                 // batched geometry is authored in world space (identity mesh matrix)
      }
      g.obj.traverse((o) => { if (o.isMesh && !o.userData.keepShadow) o.castShadow = false; });
      if (box.isEmpty()) { box.setFromCenterAndSize(g.obj.position, new THREE.Vector3(1, 1, 1)); }
      ints.push({ id, bid: id.slice(0, -4), obj: g.obj, box, on: true });
    }
    this.acc = 1;
    return ints.length;
  }

  /** dt in seconds; force = evaluate now (after a teleport). */
  update(dt, force = false) {
    const pl = this.ctx.player; if (!pl || !this.ints.length) return;
    this.acc += dt;
    const s = pl.s, moved = Math.abs(s.x - this.lx) + Math.abs(s.z - this.lz) + Math.abs(s.y - this.ly);
    if (!force && this.acc < 0.15 && moved < 1.5) return;
    this.acc = 0; this.lx = s.x; this.lz = s.z; this.ly = s.y;
    const p = this.p.set(s.x, s.y + 1.2, s.z), indoors = !!pl.indoors, mine = pl.building;
    let shown = 0;
    for (const it of this.ints) {
      const d = it.box.distanceToPoint(p);
      const R = indoors ? INDOOR_OTHERS : INT_RANGE;
      const own = mine != null && it.bid === mine && (indoors || d < 6);
      const on = own || d < (it.on ? R + HYST : R);
      if (on !== it.on) { it.on = on; it.obj.visible = on; }
      if (on) shown++;
    }
    this.shown = shown;
  }

  stats() { return { intGroups: this.ints.length, intShown: this.shown }; }
}
