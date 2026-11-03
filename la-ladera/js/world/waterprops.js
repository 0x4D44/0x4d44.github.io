// THE SEA'S SET PIECES, DRAWN (A5, round 7, phase 2b): the Codex watersports library (the pier kit, the raft, the buoys, the boats; waterlib.js names it) loaded once the page
// is playable and drawn through the town's own instancing (world/clutter.js), as beachprops.js draws the beach's. The plan (beachsea.js) says where every piece stands and its colliders were made from the first
// frame (beach.js seaColliders), so nothing here changes how the sea walks.
//
//   loadWaterProps(ctx, sea, io)   extend the registry with the library, load the files the plan needs (the pier's and the boats'; the boards' stay on disk), place the pieces, finalize.
//                                  Two Clutters: the FIXED pieces (the pier's kit, the boats on the sand, the gear, the seabed's) and the FLOATERS (buoys, the rope of floats, the raft, the moored boats), which a
//                                  system (order 9, after the sea's own update) poses on the swell every frame (beachfloat.js). Three mooring lines are drawn from the pier's cleats to the boats' rings and follow them.
//                                  The pier's lamps get their light (ctx.lights, kind 'street') and their glow. Resolves with { fixed, floating, ropes, floaters } or null when nothing could be drawn.
//
// The library is NOT in assets/models/manifest.json: the boot neither fetches nor parses it. Whoever calls this is a unit of the staged queue (beach.js), or, in an eager boot, the beach's own build. A piece
// whose file did not arrive is simply not drawn: the sea is as solid, and bare.
import * as THREE from 'three';
import { Clutter } from './clutter.js';
import { WATER_MANIFESTS, WATER_TAG, WATER_ID, FLOAT_ID, sizeOf } from './waterlib.js';
import { floatPose, poseMatrix } from './beachfloat.js';

export const ROPES_ID = 'searopes';
const LAMP = { color: 0xffc480, intensity: 12, distance: 11, halo: 2.6 };          // the pier's lamps: a warm light a lamp-post's worth (the promenade's globes: 22 over 16 m; these are 2.85 m tall)

/**
 * io: { read: the manifest reader (Node tests read from disk; the page fetches), load: (glb path) => Promise (the page's ctx.assets.load; Node tests parse from disk),
 *       hidden: leave the groups hidden for the caller to show once they are warm (LateWarm), as the sea is }
 */
export async function loadWaterProps(ctx, sea, io = {}) {
  const A = ctx.assets, load = io.load ?? ((p) => A.load(p));
  await A.extend(WATER_MANIFESTS, io.read);
  const paths = [...new Set(sea.items.map((i) => A.meta(i.key)?.glb).filter(Boolean))], failed = [];
  await Promise.all(paths.map((p) => Promise.resolve().then(() => load(p)).catch(() => { failed.push(p); })));
  const fixedItems = sea.items.filter((i) => !i.float), floatItems = sea.items.filter((i) => i.float);
  const fixed = new Clutter(ctx, { tag: WATER_TAG, id: WATER_ID, only: fixedItems.map((i) => i.key) });
  const floating = new Clutter(ctx, { tag: WATER_TAG, id: FLOAT_ID, only: floatItems.map((i) => i.key) });
  fixed.loadStatus = floating.loadStatus = { files: paths.length, paths, failed };
  let placed = 0, skipped = 0;
  const put = (C, it) => (C.place(it.key, it.x, it.y, it.z, it.yaw, { near: it.lod[0], far: it.lod[1], scale: it.scale, pitch: it.pitch, scene: 'beach', source: 'addition' }) ? placed++ : skipped++);
  for (const it of fixedItems) put(fixed, it);
  const floaters = [];
  for (const it of floatItems) {
    const before = floating.records.length;
    put(floating, it);
    if (floating.records.length > before) floaters.push({ it, rec: floating.records.at(-1), half: sizeOf(it.name)[1] / 2 });
  }
  if (!placed) return null;
  const shown = io.hidden !== true;
  for (const C of [fixed, floating]) { C.group.visible = shown; C.finalize(); }

  // the mooring lines: a thin cylinder from a cleat to a boat's ring, laid every frame
  const ropes = new THREE.Group(); ropes.name = 'props.' + ROPES_ID; ropes.userData.noMerge = true; ropes.visible = shown;
  const geo = new THREE.CylinderGeometry(0.022, 0.022, 1, 5, 1, true); geo.translate(0, 0.5, 0);
  const lines = sea.ropes.flatMap((r) => {
    const boat = floaters.find((f) => f.it.id === r.item);
    if (!boat) return [];
    const mesh = new THREE.Mesh(geo, ctx.mat('sea_rope')); mesh.name = r.id; mesh.matrixAutoUpdate = false; mesh.castShadow = false; mesh.frustumCulled = true;
    ropes.add(mesh); return [{ r, boat, mesh }];
  });
  ctx.scene.add(ropes);

  // the pier's lamps: a light each (the pool reads the registry every frame, so a late light is a light) and a halo for the night
  for (const l of sea.lamps) {
    ctx.lights?.add({ x: l.light.x, y: l.light.y, z: l.light.z, color: LAMP.color, intensity: LAMP.intensity, distance: LAMP.distance, kind: 'street' });
    ctx.glow?.add({ x: l.light.x, y: l.light.y, z: l.light.z, color: LAMP.color, size: LAMP.halo, intensity: 1.1 });
  }

  // the swell: every frame, after the water's own update (order 5) and the instancing's (8)
  const pose = { y: 0, pitch: 0, roll: 0 }, a = new THREE.Vector3(), b = new THREE.Vector3(), dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion(), scale = new THREE.Vector3();
  const tick = () => {
    const w = ctx.sea;                                                          // (no sea yet: the pieces lie at rest, as placed)
    if (w && floating.stats.near + floating.stats.far > 0) {
      const t = w.time;
      for (const f of floaters) { floatPose(f.it, w.level, t, pose); poseMatrix(f.it, pose, f.rec.matrix); f.rec.center.set(0, f.half, 0).applyMatrix4(f.rec.matrix); }
      floating.update(true);
    }
    for (const { r, boat, mesh } of lines) {
      a.set(r.a[0], r.a[1], r.a[2]); b.set(r.anchor[0], r.anchor[1], r.anchor[2]).applyMatrix4(boat.rec.matrix);
      dir.subVectors(b, a); const len = dir.length() || 1e-6;
      q.setFromUnitVectors(up, dir.divideScalar(len)); scale.set(1, len, 1);
      mesh.matrix.compose(a, q, scale); mesh.matrixWorldNeedsUpdate = true;
    }
  };
  tick();
  ctx.addSystem('seafloat-pose', tick, 9);
  Object.assign(ctx.world ??= {}, { waterprops: { placed, skipped, floaters: floaters.length, lamps: sea.lamps.length, ropes: lines.length, files: paths.length, failed } });
  const result = { fixed, floating, ropes, lines, floaters, tick, groups: [fixed.group, floating.group, ropes] };
  ctx.waterProps = result;
  return result;
}
