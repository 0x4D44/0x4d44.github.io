// Import this FIRST in every plan-to-build test (lib/cdp.mjs does it for the ones that use the harness).
//  1. This process runs at the lowest CPU priority (Windows IDLE_PRIORITY_CLASS, shown as "Low" in Task Manager; nice 10+ elsewhere).
//     Children inherit the class, so Chrome, ffmpeg and ffprobe start low too; cdp.mjs also sweeps every Chrome process it can see.
//  2. Every child process this process starts gets windowsHide:true, so no console window can ever appear on the desktop.
// Nothing here ever draws a window, moves the mouse or takes focus; the browsers are headless and driven over CDP only.
import os from "node:os";
import cp from "node:child_process";
import { syncBuiltinESMExports } from "node:module";

export const LOW = os.constants.priority.PRIORITY_LOW;
export function lower(pid) { try { os.setPriority(pid, LOW); return true; } catch { return false; } }
lower(process.pid);

const dbg = (name, cmd, o) => { if (process.env.LOWPRIO_DEBUG) console.error(`[lowprio] ${name}(${String(cmd).slice(0, 40)}) windowsHide=${o && o.windowsHide}`); };
// spawn / spawnSync / execFileSync: (command[, args][, options])
const wrapArgs = (name) => {
  const orig = cp[name];
  return function (cmd, a, b, ...rest) {
    let args = [], o = {};
    if (Array.isArray(a)) { args = a; o = b && typeof b === "object" ? b : {}; if (typeof b === "function") rest.unshift(b); }
    else if (a && typeof a === "object") o = a;
    const opts = { ...o, windowsHide: true };
    dbg(name, cmd, opts);
    return orig.call(this, cmd, args, opts, ...rest);
  };
};
// execSync: (command[, options])
const wrapShell = (name) => {
  const orig = cp[name];
  return function (cmd, a, ...rest) {
    const opts = { ...(a && typeof a === "object" ? a : {}), windowsHide: true };
    dbg(name, cmd, opts);
    return orig.call(this, cmd, opts, ...rest);
  };
};
for (const n of ["spawn", "spawnSync", "execFileSync"]) cp[n] = wrapArgs(n);
cp.execSync = wrapShell("execSync");
syncBuiltinESMExports();
