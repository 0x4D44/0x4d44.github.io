// Run tests at low process priority so they never compete with the person at the desk.
// Imported by tests/harness.mjs (so headless Chrome, started afterwards, inherits it) and usable on any script:
//   node --import file:///<repo>/aotearoa-rally/tests/lowprio.mjs --test tests/foo.test.mjs
// Default is BelowNormal, the fleet's agreed class: Idle starves behind every other agent's BelowNormal work on a busy box and
// produces false timing failures (second-long page stalls). AR_PRIORITY=low picks Idle; AR_PRIORITY=normal opts out.
import os from "node:os";

const CLASSES = { low: "PRIORITY_LOW", idle: "PRIORITY_LOW", belownormal: "PRIORITY_BELOW_NORMAL" };

/** Lower `pid` (default: this process) to the configured class. Returns true if it was changed. */
export function lowerPriority(pid = 0, level = process.env.AR_PRIORITY || "belownormal") {
  const key = CLASSES[String(level).toLowerCase()];
  if (!key) return false;
  try { os.setPriority(pid, os.constants.priority[key]); return true; } catch { return false; }
}

lowerPriority();
