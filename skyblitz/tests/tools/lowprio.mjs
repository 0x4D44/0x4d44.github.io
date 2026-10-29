// Testing must never compete with the person at the desk: import this first and the process (and every child it spawns, headless
// Chrome included) runs at BELOW-NORMAL priority. Windows hands IDLE / BELOW_NORMAL on to children at CreateProcess; POSIX nice is inherited.
//   node --import ./skyblitz/tests/tools/lowprio.mjs <script>      (or `import "./lowprio.mjs"` at the top of a tool)
// Env: SKY_PRIORITY=idle for the lowest class, =normal to opt out (never do that on a shared box).
import os from "node:os";

const LEVELS = { idle: os.constants.priority.PRIORITY_LOW, below: os.constants.priority.PRIORITY_BELOW_NORMAL };

/** Lowers `pid` (default: this process) to the house level; never raises a process that is already lower. */
export function lowerPriority(pid = 0) {
  const want = (process.env.SKY_PRIORITY || "below").toLowerCase();
  if (want === "normal") return false;
  const level = LEVELS[want] ?? LEVELS.below;
  try { if (os.getPriority(pid) < level) os.setPriority(pid, level); return true; } catch { return false; }
}

lowerPriority();
