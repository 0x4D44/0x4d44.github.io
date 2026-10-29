// Frame clock for the main loop. Pure: no DOM, no performance.now(); the caller passes the timestamps.
//
// requestAnimationFrame can deliver a callback whose timestamp is OLDER than a clock reset: a long main-thread block
// (the shader warm-up behind the loading overlay is one) leaves a frame queued with the time it began, and it runs
// after the block. Such a frame must not move the clock backwards, or the next real frame sees a block-sized step
// (the 4 to 6 s "hitch" that __AR__.perf().worstFrameMs once reported on every stage start).

export function createFrameClock(start = 0) {
  let last = start;
  return {
    /** Seconds since the last accepted frame. A stale or repeated timestamp returns 0 and leaves the clock alone. */
    tick(now) {
      const dt = (now - last) / 1000;
      if (!(dt > 0)) return 0;
      last = now;
      return dt;
    },
    /** Start the clock fresh at `now`, e.g. after a block that must not count as a frame. */
    reset(now) { last = now; },
    get last() { return last; },
  };
}
