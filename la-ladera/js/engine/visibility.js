// Visibility budgets (owner: A1).
//  * `<id>.int` groups (furnishings, decor, clutter) are drawn only within INT_RANGE metres of the player, or always for the building the
//    player is standing in. While the player is indoors, other buildings' interiors only show when very close (seen through a window).
//  * Interior meshes never cast into the sun's shadow map (sunlight reaches rooms only through windows; furniture shadows there are not
//    worth a second pass over every sofa).
//  * Hysteresis (show at R, hide at R + 3) so a building does not flicker while the player stands on the threshold.
//  * Hidden subtrees keep their matrices: three draws nothing under a hidden object, yet Object3D.updateMatrixWorld still walks every object below it,
//    every frame. The interiors alone are 6000 objects of the 10000 in the scene, and the people hide whoever is out of sight. See skipHidden().
import * as THREE from 'three';

export const INT_RANGE = 28;
const INDOOR_OTHERS = 14;
const HYST = 3;
const BIG_GROUP = 16, BIG_FAMILY = 8;                   // a top-level group with >= 16 children of >= 8 objects each is a crowd (people): its hidden children are skipped too
const OBJ_UMW = THREE.Object3D.prototype.updateMatrixWorld;

/**
 * Make `parent` pass over its hidden children when it updates world matrices. three never draws (or shadows) anything below an object with visible = false, but
 * Object3D.updateMatrixWorld recurses into it regardless; a child skipped here is remembered and gets ONE forced update (its whole subtree) on the first frame it
 * is visible again, so the picture cannot differ. The only observable change: matrixWorld of an object inside a hidden subtree is the one it had when it was last
 * drawn (nothing in the game reads it: door, container and NPC code move local transforms, and getWorldPosition & co. refresh the parent chain themselves).
 * Idempotent. `parent.userData.skipHidden` = { on, stale, skipped }; switch `on` off through setSkipHidden() so nothing stays stale.
 */
function skipHidden(parent) {
  if (parent.userData.skipHidden) return parent.userData.skipHidden;
  const st = parent.userData.skipHidden = { on: true, stale: new Set(), skipped: 0, parent };
  const run = [], revive = [];
  parent.updateMatrixWorld = function (force) {
    if (!st.on) return OBJ_UMW.call(this, force);
    const all = this.children, stale = st.stale; run.length = revive.length = 0;
    for (let i = 0; i < all.length; i++) {
      const c = all[i];
      if (!c.visible) stale.add(c);
      else if (stale.size > 0 && stale.delete(c)) revive.push(c);
      else run.push(c);
    }
    if (stale.size > all.length) for (const c of stale) if (c.parent !== this) stale.delete(c);          // a removed child must not be kept alive here
    st.skipped = stale.size;
    this.children = run;
    try { OBJ_UMW.call(this, force); } finally { this.children = all; }
    for (let i = 0; i < revive.length; i++) revive[i].updateMatrixWorld(true);
    run.length = revive.length = 0;
  };
  return st;
}
/** Turn the hidden-subtree skip of one parent on or off; off first brings every skipped child up to date. */
function setSkipHidden(st, on) {
  if (st.on === on) return;
  if (!on) { st.on = false; for (const c of st.stale) if (c.parent === st.parent) c.updateMatrixWorld(true); st.stale.clear(); st.skipped = 0; } else st.on = true;
}

export class Visibility {
  constructor(ctx) {
    this.ctx = ctx; this.ints = []; this.acc = 1; this.lx = 1e9; this.lz = 1e9; this.ly = 1e9; this.shown = 0; this.p = new THREE.Vector3(); this.skips = [];
  }

  /** Hidden-subtree matrix skip on the scene and on every crowd-like top-level group. `on` = false turns them all off (the A/B switch of the tests and ?skiphidden=0). */
  skipHiddenMatrices(on = true) {
    const scene = this.ctx.scene;
    if (!this.skips.length) { scene.updateMatrixWorld(true); }            // one complete pass: every matrix is valid before hidden subtrees stop being walked
    const sts = [skipHidden(scene)];
    for (const c of scene.children) {
      let st = c.userData.skipHidden;
      if (!st) {
        const kids = c.children.length; if (kids < BIG_GROUP) continue;
        let total = 0; c.traverse(() => { total++; });
        if (total < BIG_FAMILY * kids) continue;                          // a crowd's children carry whole skeletons; a building's carry a mesh or two
        st = skipHidden(c);
      }
      sts.push(st);
    }
    this.skips = sts;
    for (const st of sts) setSkipHidden(st, on);
    return sts.length;
  }
  /** Objects whose matrices are being skipped right now (hidden children of the scene and of the crowds). */
  skippedNow() { let n = 0; for (const st of this.skips) n += st.skipped; return n; }

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
    this.skipHiddenMatrices(this.ctx.opts.skipHidden !== false);
    return ints.length;
  }

  /**
   * One interior made after `collect()` (interiors/lazy.js, `?lazy=1`): it joins the budget with the same box and shadow policy `collect()` gives every group, and takes the visibility it would have from
   * where the player stands now (not the `visible = true` of a new group: a building 60 m away must not be drawn for the frame before the next scan). False when the building has no interior group.
   */
  addInterior(bid, { now = false } = {}) {
    const id = bid + '.int', g = this.ctx.batch.groups.get(id); if (!g) return null;
    const box = new THREE.Box3();
    for (const m of g.meshes) { const geo = m.geometry; if (!geo.boundingBox) geo.computeBoundingBox(); box.union(geo.boundingBox); }
    g.obj.traverse((o) => { if (o.isMesh && !o.userData.keepShadow) o.castShadow = false; });
    if (box.isEmpty()) box.setFromCenterAndSize(g.obj.position, new THREE.Vector3(1, 1, 1));
    // not drawn until warm: its programs are built and its textures are up (engine/warm.js LateWarm), or the player is already at it (`now`: show what there is, as an eager boot would)
    const lw = this.ctx.lateWarm, wait = !now && !!lw;
    const rec = { id, bid, obj: g.obj, box, on: false, ready: !wait };
    g.obj.visible = false;
    const at = this.ints.findIndex((it) => it.id === id);
    if (at >= 0) this.ints[at] = rec; else this.ints.push(rec);
    this.acc = 1;
    const shown = () => { rec.ready = true; this.acc = 1; if (this.ctx.player) this.update(0, true); };
    if (!wait) { this.update(0, true); return Promise.resolve(rec); }
    return lw.warm(g.obj).then(() => { shown(); return rec; });
  }
  /** The player is at this interior: it is shown now, warm or not (the programs it still needs compile in the frame, as they did before the warm-up existed). */
  releaseInterior(bid) {
    const it = this.ints.find((x) => x.bid === bid); if (!it || it.ready !== false) return false;
    it.ready = true; this.acc = 1; if (this.ctx.player) this.update(0, true);
    return true;
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
      if (it.ready === false) continue;                                   // made after the boot and not warm yet (addInterior): stays hidden
      const d = it.box.distanceToPoint(p);
      const R = indoors ? INDOOR_OTHERS : INT_RANGE;
      const own = mine != null && it.bid === mine && (indoors || d < 6);
      const on = own || d < (it.on ? R + HYST : R);
      if (on !== it.on) { it.on = on; it.obj.visible = on; }
      if (on) shown++;
    }
    this.shown = shown;
  }

  stats() { return { intGroups: this.ints.length, intShown: this.shown, matrixSkipped: this.skippedNow() }; }
}
