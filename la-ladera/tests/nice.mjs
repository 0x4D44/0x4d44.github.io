// Side-effect import: run THIS process, and every child it starts (Chrome with its GPU/renderer processes, Python, Blender, Codex),
// at low priority, so the person using the box never feels the tests. On Windows a child inherits BELOW_NORMAL / IDLE from its creator
// (CreateProcess), on Unix the nice value is inherited, so one call at the top of an entry script is enough.
//
//   import './nice.mjs';                  // below-normal (default)
//   LADERA_PRIO=idle   node ...           // idle class: long batch work (renders, texture post-processing, big probes)
//   LADERA_PRIO=normal node ...           // opt out: leave whatever priority the parent gave (only for a timing run the lead asks for)
//
// A priority that something else already lowered is never raised again. Failure to set it is silent (not permitted -> carry on).
import os from 'node:os';

const LEVELS = () => { const c = os.constants.priority; return { idle: c.PRIORITY_LOW, below: c.PRIORITY_BELOW_NORMAL }; };

/** Lower this process' priority to `level` ('below' | 'idle'; anything else, e.g. 'normal', leaves it alone). Returns the resulting priority or null. */
export function lowPriority(level = process.env.LADERA_PRIO ?? 'below') {
  const want = LEVELS()[String(level).toLowerCase()];
  try {
    // Larger number = lower priority. Never climb back up.
    if (want !== undefined && os.getPriority() < want) os.setPriority(want);
    return os.getPriority();
  } catch { return null; }
}

lowPriority();
