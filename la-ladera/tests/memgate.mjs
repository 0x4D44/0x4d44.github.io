// Commit-headroom gate for heavy launches (headless Chrome, Blender, Codex, big node jobs).
// This box runs short of commit memory: near 0 GB free, allocations fail for every process, agent sessions included.
//   node la-ladera/tests/memgate.mjs [minGB=6] [maxWaitSec=300]    exit 0 = go; exit 1 = still short after the wait
//   import { memGate, commitFreeGB } from './memgate.mjs'; await memGate(6);
import './nice.mjs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Commit-free memory in GB (Windows `FreeVirtualMemory`); Infinity where it cannot be read. */
export function commitFreeGB() {
  if (process.platform !== 'win32') return Infinity;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory'],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  const kb = Number.parseInt(String(r.stdout).trim(), 10);
  return Number.isFinite(kb) ? kb / 1048576 : Infinity;
}

/** Wait until commit-free >= minGB (polls every 10 s, gives up after maxWaitSec and returns the last reading). */
export async function memGate(minGB = 6, maxWaitSec = 300, log = (m) => console.error(m)) {
  const t0 = Date.now();
  for (;;) {
    let free = commitFreeGB();
    if (free >= minGB) {
      // Several agents can pass the gate in the same instant: jitter, then re-read before committing to the launch.
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 2500));
      free = commitFreeGB();
      if (free >= minGB) return free;
    }
    if ((Date.now() - t0) / 1000 > maxWaitSec) { log(`[memgate] commit-free ${free.toFixed(1)} GB < ${minGB} GB after ${maxWaitSec}s; proceeding anyway`); return free; }
    log(`[memgate] commit-free ${free.toFixed(1)} GB < ${minGB} GB; waiting`);
    await new Promise((r) => setTimeout(r, 10000));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const min = Number(process.argv[2] ?? 6), wait = Number(process.argv[3] ?? 300);
  const free = await memGate(min, wait);
  console.log(`commit-free ${free.toFixed(1)} GB`);
  process.exit(free >= min ? 0 : 1);
}
