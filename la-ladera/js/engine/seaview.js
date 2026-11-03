// THE SEA FOR THOSE WHO DO NOT DRAW IT (A1, round 7: the beach's engine side). The swimmer, the camera under the surface, the splashes, the footsteps in the shallows and the surf ask `seaOf(ctx)`;
// none of them reads `ctx.sea` itself. Why: on the shipped (lazy) road `ctx.sea` does NOT exist at the milestone (the `sea` unit builds the water about 375 ms after it, measured on a real lazy page)
// and under `?skip=coast` it never exists, yet a player may already stand in the shallows, and every one of those consumers must have an answer from the first frame.
//   seaOf(ctx)    ctx.sea once engine/water.js has built the water (it is read again at every call, so a sea built late is picked up and one that was disposed is let go), else a stand-in for the
//                 context: the same members ({ state, time, level, slope, depth, under, submerged }, core/sea.js makeSea; the camera is ctx.camera) over the PURE sea (core/sea.js with seaState(ctx.hour)) and plan.coast.heightAt, with a
//                 swell that stands still (time 0) until the water exists: a few hundred ms of a page's life, and never moving under `?skip=coast`, where the gate is shut and nobody reaches the water.
//   seaBuilt(ctx) is the real water there?
// The stand-in is made once per context (a WeakMap) and answers without allocating. With no plan (a bare test context) the ground is far above the datum and every depth is negative: dry land.
// tests/engine-seaview.test.mjs holds it, and scans the sources: a file that reads `ctx.sea` without being on its list of reasons fails there, so a new consumer goes through here.
import { SEA } from '../world/coast.js';
import { CALM, seaState, makeSea } from '../core/sea.js';

const standIns = new WeakMap();
const DRY = 1e3;                                                             // the ground's height where there is no coast: nowhere is under water

function standIn(ctx) {
  const state = { wind: CALM.wind, amp: [1, 1, 1, 1] };
  return makeSea({ state, clock: () => 0, still: SEA, ground: (x, z) => ctx?.plan?.coast?.heightAt(x, z) ?? DRY, refresh: () => seaState(ctx?.hour ?? 15, state), eye: () => ctx?.camera?.position });
}

/** The sea as the controller, the camera and the audio read it: `ctx.sea` when the water is built, the stand-in over the pure sea when it is not. Never null. */
export function seaOf(ctx) {
  const real = ctx?.sea;
  if (real) return real;
  if (ctx === null || typeof ctx !== 'object') return standIn(null);        // (no context at all: a throwaway, nothing to key it by)
  let s = standIns.get(ctx);
  if (!s) standIns.set(ctx, s = standIn(ctx));
  return s;
}

/** Has engine/water.js built the water (ctx.sea exists)? */
export const seaBuilt = (ctx) => !!ctx?.sea;
