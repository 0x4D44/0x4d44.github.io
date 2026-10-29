// Run ANY command at low priority with no console window and no focus stealing. Use it for every Blender, Codex, Python and long Node job:
//
//   node la-ladera/tools/nice.mjs [--below | --idle] [--] <command> [args...]
//   node la-ladera/tools/nice.mjs --idle "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python x.py
//   node la-ladera/tools/nice.mjs --idle deltic timeout 900 --stdin prompt.txt codex exec ...        (nice goes OUTERMOST: children inherit it)
//   node la-ladera/tools/nice.mjs python la-ladera/tools/textures/post.py ...
//
// Default is --below (below-normal). Use --idle for batch work nobody waits on. The child gets `windowsHide: true` plus piped stdio, which makes
// libuv create it with CREATE_NO_WINDOW (no console window even if this wrapper has no console), output/stdin are forwarded, and the exit code is
// forwarded. Never starts a shell unless the target is a .cmd/.bat shim.
import { spawn } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { delimiter, extname, join } from 'node:path';
import { lowPriority } from '../tests/nice.mjs';

const argv = process.argv.slice(2);
let level = process.env.LADERA_PRIO && process.env.LADERA_PRIO !== 'normal' ? process.env.LADERA_PRIO : 'below';
while (argv[0] === '--below' || argv[0] === '--idle') level = argv.shift().slice(2);
if (argv[0] === '--') argv.shift();
if (!argv.length) { console.error('usage: node la-ladera/tools/nice.mjs [--below|--idle] [--] <command> [args...]'); process.exit(2); }
lowPriority(level);

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
/** Resolve a command name the way cmd.exe would (PATH x PATHEXT, .exe before shims); returns null if not found. */
function resolveCommand(cmd) {
  if (process.platform !== 'win32') return cmd;
  const exts = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD').toLowerCase().split(';').filter(Boolean);
  const order = ['.exe', '.com', ...exts.filter((e) => !['.exe', '.com'].includes(e))];
  const hasPath = /[\\/]/.test(cmd);
  const dirs = hasPath ? [''] : (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const d of dirs) {
    const base = hasPath ? cmd : join(d, cmd);
    if (extname(base) && isFile(base)) return base;
    for (const e of order) if (isFile(base + e)) return base + e;
  }
  return existsSync(cmd) ? cmd : null;
}

let [cmd, ...args] = argv;
const target = resolveCommand(cmd);
if (!target) { console.error(`nice: cannot find "${cmd}"`); process.exit(127); }

// Pipes, not 'inherit': libuv only passes CREATE_NO_WINDOW when no stdio handle is inherited, and a console program started without it opens
// a visible console window whenever this wrapper itself has no console (e.g. it was started detached). Output and stdin are forwarded.
const opts = { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true };
let child;
if (process.platform === 'win32' && /\.(cmd|bat)$/i.test(target)) {
  // npm shims (codex.cmd ...) need cmd.exe; quote like cross-spawn does.
  const q = (a) => (/[\s"&|<>^%()]/.test(a) ? `"${a.replace(/"/g, '""')}"` : a);
  child = spawn(process.env.ComSpec ?? 'cmd.exe', ['/d', '/s', '/c', `"${[target, ...args].map(q).join(' ')}"`], { ...opts, windowsVerbatimArguments: true });
} else {
  child = spawn(target, args, opts);
}
child.stdout.pipe(process.stdout);
child.stderr.pipe(process.stderr);
process.stdin.pipe(child.stdin);
child.stdin.on('error', () => { /* child closed its stdin first */ });
child.on('error', (e) => { console.error('nice: ' + e.message); process.exit(126); });
child.on('close', (code, sig) => process.exit(code ?? (sig ? 1 : 0)));
for (const s of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(s, () => { try { child.kill(); } catch { /* gone */ } });
