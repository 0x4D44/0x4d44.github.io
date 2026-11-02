// The frame's share for STREAMING work (owner: A1; `?lazy=1`, dev/FEATURE-LAZY.md): the interiors made on demand (interiors/lazy.js), the programs and textures warmed for what the boot did not draw
// (engine/warm.js LateWarm), whatever a later sector registers on ctx.staged. They share ONE budget per frame, so a frame never carries more than `cap` ms of them whoever is asking:
//   * in play: STREAM_MS (a frame is 16.7 ms and the renderer alone takes most of it on a busy scene);
//   * while nobody plays (the title card, a pause, a panel): IDLE_STREAM_MS, the card is the place to get ahead.
// engine/index.js clears the account at the end of every frame and keeps the last frame's spend: the adaptive-quality check must not read the cost of this work as a slow machine.
export const STREAM_MS = 4;
export const IDLE_STREAM_MS = 12;

/** The most streaming work a frame may carry right now. */
export const streamCap = (ctx) => (ctx.running ? STREAM_MS : IDLE_STREAM_MS);

/** Milliseconds of the frame's streaming budget that nobody has spent yet. A context with no frame loop of its own (`?manual`, the unit tests that call update() themselves) has all of it. */
export function streamLeft(ctx, cap = streamCap(ctx)) {
  if (ctx.opts?.manual || !ctx.loopOn) return cap;
  return Math.max(0, cap - (ctx.streamMs ?? 0));
}

/** Record `ms` of streaming work done in this frame. */
export function streamSpend(ctx, ms) { ctx.streamMs = (ctx.streamMs ?? 0) + Math.max(0, ms); }
