// The low-priority wrapper and the nice.mjs side-effect import really lower the priority of what they start, forward exit codes, and run
// .cmd shims, without ever opening a window (windowsHide) or raising a priority again.
//   node --test la-ladera/tests/nice.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import os, { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WRAP = resolve(HERE, '..', 'tools', 'nice.mjs');
const NICE = pathToFileURL(resolve(HERE, 'nice.mjs')).href;
const PRINT = 'process.stdout.write(String(require("os").getPriority()))';
const run = (args, env = {}) => spawnSync(process.execPath, args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
// Priority values as Node reports them: 0 normal, 10 below normal, 19 idle (Windows classes map to these).
// Nothing ever raises a priority, so "below normal" means max(10, this process): under an idle parent (the whole suite started through
// `tools/nice.mjs --idle`) it degenerates to inheriting idle, and only a normal or below-normal parent exercises the lowering itself.
const BELOW = String(Math.max(10, os.getPriority()));

test('the wrapper starts its child below normal by default', () => {
  const r = run([WRAP, process.execPath, '-e', PRINT]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, BELOW);
});

test('--idle starts the child at idle priority', () => {
  const r = run([WRAP, '--idle', process.execPath, '-e', PRINT]);
  assert.equal(r.stdout, '19', r.stderr);
});

test('stdout, stderr and stdin pass through the wrapper (it pipes them so the child can never open a console window)', () => {
  const r = run([WRAP, process.execPath, '-e', 'console.log("to-out"); console.error("to-err")']);
  assert.match(r.stdout, /to-out/); assert.match(r.stderr, /to-err/);
  const i = spawnSync(process.execPath, [WRAP, process.execPath, '-e', 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log("got:"+s))'],
    { input: 'hello', encoding: 'utf8', windowsHide: true });
  assert.match(i.stdout, /got:hello/);
});

test('the child exit code is forwarded, and a missing command is 127', () => {
  assert.equal(run([WRAP, process.execPath, '-e', 'process.exit(7)']).status, 7);
  assert.equal(run([WRAP, 'definitely-not-a-command-xyz']).status, 127);
});

test('importing tests/nice.mjs lowers the importing process; LADERA_PRIO=normal opts out; idle sticks', () => {
  const imp = `import(${JSON.stringify(NICE)}).then(() => process.stdout.write(String(require('os').getPriority())))`;
  assert.equal(run(['-e', imp]).stdout, BELOW);
  assert.equal(run(['-e', imp], { LADERA_PRIO: 'idle' }).stdout, '19');
  // the opt-out leaves the priority as inherited from the parent (this test may itself already run below normal under the register.mjs preload)
  assert.equal(run(['-e', imp], { LADERA_PRIO: 'normal' }).stdout, String(os.getPriority()));
  // an idle parent is never raised to below-normal by a child's import
  assert.equal(run([WRAP, '--idle', process.execPath, '-e', imp]).stdout, '19');
});

test('every test/probe started with --import register.mjs runs below normal priority', () => {
  const reg = pathToFileURL(resolve(HERE, 'register.mjs')).href;
  assert.equal(run(['--import', reg, '-e', PRINT]).stdout, BELOW);
  assert.equal(run(['--import', reg, '-e', PRINT], { LADERA_PRIO: 'idle' }).stdout, '19');
});

test('a .cmd shim runs through the wrapper with its arguments intact (Windows)', { skip: process.platform !== 'win32' }, () => {
  const d = mkdtempSync(join(tmpdir(), 'ladera-nice-'));
  try {
    const f = join(d, 'echo args.cmd');
    writeFileSync(f, '@echo off\r\necho [%~1][%~2]\r\n');
    const r = run([WRAP, f, 'a b', 'c']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\[a b\]\[c\]/);
  } finally { rmSync(d, { recursive: true, force: true }); }
});
