// THE BEACH'S PROPS, DRAWN (A5, round 7, phase 2a): the Codex beach library (assets/models/beach_props, manifest.beach_props.json: 97 props, each with a low twin) loaded once the page is playable
// and drawn through the town's own instancing (world/clutter.js: one InstancedMesh per prop, part and level, a near and a far model per prop, culled by distance). The plan (beachfront.js) says
// where every one stands; the colliders were made from the first frame (beachfixtures.js), so nothing here changes how the beach walks.
//
//   loadBeachProps(ctx, front)   extend the registry with the library, load its three GLBs, place the plan's items, finalize. Resolves with the Clutter, or null when nothing could be drawn.
//
// The library is NOT in assets/models/manifest.json (the validator keeps it out): the boot neither fetches nor parses it. Whoever calls this is a unit of the staged queue (beach.js), or, in an
// eager boot, the beach's own build. A prop whose files did not arrive is simply not drawn: the beach is as solid, and bare.
import { Clutter } from './clutter.js';
import { BEACH_MANIFESTS } from './beachlib.js';

export const BEACH_TAG = 'beach-prop';          // the manifest tag of the library's near props (their low twins carry 'beach-prop-lod')
export const BEACH_ID = 'beachprops';           // the group, the system and the ctx.world entry

/**
 * io: { read: the manifest reader (Node tests read from disk; the page fetches), load: (glb path) => Promise (the page's ctx.assets.load; Node tests parse from disk),
 *       hidden: leave the group hidden for the caller to show once it is warm (LateWarm), as the sea is }
 */
export async function loadBeachProps(ctx, front, io = {}) {
  const A = ctx.assets, load = io.load ?? ((p) => A.load(p));
  await A.extend(BEACH_MANIFESTS, io.read);
  const paths = [...new Set(A.names(BEACH_TAG).map((n) => A.meta(n).glb))], failed = [];
  await Promise.all(paths.map((p) => Promise.resolve().then(() => load(p)).catch(() => { failed.push(p); })));
  const clutter = new Clutter(ctx, { tag: BEACH_TAG, id: BEACH_ID });
  clutter.loadStatus = { files: paths.length, paths, failed };
  let placed = 0, skipped = 0;
  const all = [...front.items, ...(front.groynes ?? [])];
  for (const it of all) {
    if (clutter.place(it.key, it.x, it.y, it.z, it.yaw, { near: it.lod[0], far: it.lod[1], scale: it.scale, scene: 'beach', source: 'addition' })) placed++; else skipped++;
  }
  if (!placed) return null;
  clutter.group.visible = io.hidden !== true;
  clutter.finalize();
  Object.assign(ctx.world[BEACH_ID], { items: all.length, skipped });          // (finalize made ctx.world.beachprops: the Clutter's stats)
  ctx.beachProps = clutter;
  return clutter;
}
