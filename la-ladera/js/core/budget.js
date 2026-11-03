// The frame's share for STREAMING work (owner: A1; dev/FEATURE-LAZY.md): the interiors made on demand (interiors/lazy.js), the cast brought into the barrio (people/world.js), the programs and textures warmed for
// what the boot did not draw (engine/warm.js LateWarm), whatever a later sector registers on ctx.staged. They share ONE budget per frame, so a frame never carries more than `cap` ms of them whoever is asking:
//   * in play: STREAM_MS at the least (a frame is 16.7 ms and the renderer alone takes most of it on a busy scene), and up to STREAM_MAX_MS while the frames have the time to spare (`streamAdapt`);
//   * while nobody plays (the title card, a pause, a panel): IDLE_STREAM_MS, the card is the place to get ahead.
// engine/index.js clears the account at the end of every frame and keeps the last frame's spend: the adaptive-quality check must not read the cost of this work as a slow machine.
export const STREAM_MS = 4;
export const STREAM_MAX_MS = 6;
export const IDLE_STREAM_MS = 12;

/** The most streaming work a frame may carry right now. */
export const streamCap = (ctx) => (ctx.running ? Math.max(STREAM_MS, Math.min(STREAM_MAX_MS, ctx.streamCap ?? STREAM_MS)) : IDLE_STREAM_MS);

/** Milliseconds of the frame's streaming budget that nobody has spent yet. A context with no frame loop of its own (`?manual`, the unit tests that call update() themselves) has all of it. */
export function streamLeft(ctx, cap = streamCap(ctx)) {
  if (ctx.opts?.manual || !ctx.loopOn) return cap;
  return Math.max(0, cap - (ctx.streamMs ?? 0));
}

/** Record `ms` of streaming work done in this frame. */
export function streamSpend(ctx, ms) { ctx.streamMs = (ctx.streamMs ?? 0) + Math.max(0, ms); }

/**
 * The cap in play follows what the machine has to spare. Once per frame (engine/index.js), `work` is what the frame itself cost the main thread, the streaming left out, and `dt` the time since the last
 * frame. A frame is as long as the display makes it (`ctx.streamRefresh` is the shortest recent interval, 16.7 ms at 60 Hz), so what is spare is that less the (smoothed) work, and the cap takes
 * 70 % of it less a millisecond: a machine that draws a frame in 5 ms streams at the ceiling, one that needs 10 ms stays at the floor, and a 120 Hz display (8.3 ms) never has the time to spare.
 */
export function streamAdapt(ctx, work, dt) {
  if (!(dt > 0) || !(work >= 0)) return;
  const w = ctx.streamWork = ctx.streamWork == null ? work : ctx.streamWork + (work - ctx.streamWork) * 0.1;
  const frame = Math.max(dt, 4);                                                        // (two animation frames in one tick are not a 250 Hz display)
  const refresh = ctx.streamRefresh = ctx.streamRefresh == null ? frame : Math.min(frame, ctx.streamRefresh * 1.01);
  ctx.streamCap = Math.min(STREAM_MAX_MS, Math.max(STREAM_MS, 0.7 * (refresh - w) - 1));
}
