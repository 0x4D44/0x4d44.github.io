import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// tools/mutation/lib/kxmut.py is the one harness every mutation driver shares. These tests run it, from a small
// driver written here, against a throwaway package, because the failures it must never mistake for a kill are
// failures of the harness's own copy: a copy that cannot load what the tests import made every mutant "killed".
const lib = fileURLToPath(new URL('../mutation/lib', import.meta.url));

const driver = String.raw`
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import kxmut

package, scratch, mode = Path(sys.argv[2]), Path(sys.argv[3]), sys.argv[4]
FILE = 'src/value.mjs'
TEST = 'tests/value.test.mjs'
MUTATIONS = [
    ('kill', "n * 2", "n * 3"),
    ('survive', "'ok'", "'okay'"),
    ('parse error', 'export const double', 'export const double ='),
    ('missing dependency', "from 'dep'", "from 'no-such-dependency'"),
    ('throws', 'n * 2 + bonus - 1', 'n.nope.x'),
    ('stale anchor', 'text that is not in the file', 'x'),
    ('hangs', 'n * 2 + bonus - 1', 'new Promise(() => {})'),
]
if 'overcap' in mode:
    # one gigabyte (twenty buffers of fifty megabytes) taken at once and sat on for twenty seconds: the most this mutant
    # can ever hold, and long enough for any watchdog worth the name to see it
    MUTATIONS = [MUTATIONS[0], ('allocates', 'n * 2 + bonus - 1',
                                '(globalThis.held = Array.from({ length: 20 }, () => Buffer.alloc(52428800, 1)), new Promise(() => setTimeout(() => {}, 20000)))')]
tally = kxmut.Tally(timeout_is_caught=('timeouts' in mode))
kxmut.POLL_SECONDS = 0.1
with kxmut.workspace(package, scratch, 'harness') as work:
    suite = kxmut.Suite(work, test_timeout_ms=1500, timeout=60, memory_cap=600 * 1024 * 1024)
    suite.baseline([TEST])
    for label, old, new in MUTATIONS:
        try:
            with kxmut.mutated(work / FILE, [(old, new)]):
                verdict, _run = suite.judge([TEST], strict=mode.startswith('strict'))
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
sys.exit(tally.finish())
`;

const parser = String.raw`
import json
import sys

sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import kxmut

tap = open(sys.argv[2]).read()
results, summary = kxmut.parse_tap(tap)
print(json.dumps({'summary': summary, 'results': [
    {'name': r.name, 'ok': r.ok, 'assertion': r.assertion, 'crash': r.crash, 'skipped': r.skipped, 'aggregate': r.aggregate} for r in results]}))
`;

async function scratch(t) {
  const dir = await mkdtemp(join(tmpdir(), 'kx-mutation-harness-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** A package whose source imports a bare specifier that only its own node_modules can satisfy. */
async function fixture(root, { baselineFails = false } = {}) {
  const pkg = join(root, 'pkg');
  for (const dir of ['src', 'tests', 'node_modules/dep']) await mkdir(join(pkg, dir), { recursive: true });
  await writeFile(join(pkg, 'package.json'), JSON.stringify({ type: 'module' }));
  await writeFile(join(pkg, 'node_modules/dep/package.json'), JSON.stringify({ name: 'dep', type: 'module', exports: './index.js' }));
  await writeFile(join(pkg, 'node_modules/dep/index.js'), 'export const bonus = 1;\n');
  await writeFile(join(pkg, 'src/value.mjs'),
    "import { bonus } from 'dep';\nexport const double = (n) => n * 2 + bonus - 1;\nexport const label = 'ok';\n");
  await writeFile(join(pkg, 'tests/value.test.mjs'), [
    "import assert from 'node:assert/strict';", "import test from 'node:test';", "import { double } from '../src/value.mjs';",
    `test('double doubles', async () => assert.equal(await double(2), ${baselineFails ? 5 : 4}));`,
    "test('double of zero', async () => assert.equal(await double(0), 0));", ''].join('\n'));
  return pkg;
}

function python(root, name, source, args) {
  const script = join(root, name);
  return writeFile(script, source).then(() => {
    const run = spawnSync('python3', ['-I', '-u', script, lib, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 150_000 });
    assert.equal(run.error, undefined, `python3 is required to run the mutation drivers: ${run.error}`);
    return run;
  });
}

const line = (output, label) => output.split('\n').find((text) => text.includes(label)) ?? '';

test('mutation harness: a kill is a failing test; load errors, parse errors and stale anchors are errors, never kills', async (t) => {
  const root = await scratch(t), pkg = await fixture(root);
  const run = await python(root, 'driver.py', driver, [pkg, join(root, 'work'), 'strict']);
  // The copy had to resolve `dep` from the real node_modules for the baseline to pass at all.
  assert.doesNotMatch(run.stdout + run.stderr, /BASELINE NOT GREEN/, run.stdout + run.stderr);
  assert.match(line(run.stdout, 'kill'), /^\[KILLED {2}\] kill <- double doubles/);
  assert.match(line(run.stdout, 'survive'), /^\[SURVIVED\] survive/);
  assert.match(line(run.stdout, '] parse error'), /^\[ERROR {3}\] parse error/, 'a mutant that no longer parses is not killed');
  assert.match(line(run.stdout, '] missing dependency'), /^\[ERROR {3}\] missing dependency/, 'a module that cannot be resolved is not killed');
  assert.match(line(run.stdout, '] throws'), /^\[ERROR {3}\] throws: .*not by an assertion/, 'strict kills need an assertion');
  assert.match(line(run.stdout, '] stale anchor'), /^\[ERROR {3}\] stale anchor: mutation pattern is stale/);
  assert.match(line(run.stdout, '] hangs'), /^\[TIMEOUT \] hangs/, 'a hang is not a kill');
  assert.match(run.stdout, /^1\/7 mutations caught$/m);
  assert.match(run.stdout, /^ {2}NOT CAUGHT: survive$/m);
  assert.equal(run.status, 1, 'errors and survivors fail the driver');
});

test('mutation harness: a test that throws counts as a kill only when the driver does not insist on assertions', async (t) => {
  const root = await scratch(t), pkg = await fixture(root);
  const run = await python(root, 'driver.py', driver, [pkg, join(root, 'work'), 'loose']);
  assert.match(line(run.stdout, '] throws'), /^\[KILLED {2}\] throws <- .*threw TypeError, not an assertion/);
  assert.match(line(run.stdout, '] parse error'), /^\[ERROR/, 'a parse error is an error in loose mode too');
  assert.match(line(run.stdout, '] missing dependency'), /^\[ERROR/, 'so is a missing dependency');
  assert.match(run.stdout, /^2\/7 mutations caught$/m);
  assert.doesNotMatch(run.stdout, /caught with timeout/);
});

test('mutation harness: a driver that has always counted a hang as caught can keep doing so, and says how many', async (t) => {
  const root = await scratch(t), pkg = await fixture(root);
  const run = await python(root, 'driver.py', driver, [pkg, join(root, 'work'), 'loose+timeouts']);
  assert.match(line(run.stdout, '] hangs'), /^\[CAUGHT WITH TIMEOUT\] hangs/);
  assert.match(run.stdout, /^3\/7 mutations caught$/m);
  assert.match(run.stdout, /^1 caught with timeout$/m);
});

test('mutation harness: the unmodified copy must pass, otherwise the driver stops before mutating anything', async (t) => {
  const root = await scratch(t), pkg = await fixture(root, { baselineFails: true });
  const run = await python(root, 'driver.py', driver, [pkg, join(root, 'work'), 'strict']);
  assert.notEqual(run.status, 0);
  assert.match(run.stdout + run.stderr, /BASELINE NOT GREEN/);
  assert.match(run.stdout + run.stderr, /double doubles/, 'the failing baseline test is named');
  assert.doesNotMatch(run.stdout, /\[(?:KILLED|SURVIVED|ERROR)/, 'nothing was mutated');
  assert.doesNotMatch(run.stdout, /mutations caught/);
});

test('mutation harness: TAP parsing separates assertion failures, a failing named test, a dead test file and skipped tests', async (t) => {
  const root = await scratch(t), file = join(root, 'sample.tap');
  await writeFile(file, [
    'TAP version 13',
    'not ok 1 - asserts', '  ---', "  failureType: 'testCodeFailure'", "  code: 'ERR_ASSERTION'", "  name: 'AssertionError'", '  ...',
    'ok 2 - sits out # SKIP', '  ---', '  ...',
    'not ok 3 - leaks an exception', '  ---', "  failureType: 'uncaughtException'", "  code: 'EISDIR'", '  ...',
    'not ok 4 - tests/dead.test.mjs', '  ---', "  failureType: 'testCodeFailure'", '  exitCode: 1', '  signal: ~', "  code: 'ERR_TEST_FAILURE'", '  ...',
    'not ok 5 - parent', '  ---', "  failureType: 'subtestsFailed'", '  ...',
    '1..5', '# tests 5', '# pass 1', '# fail 4', '# cancelled 0', ''].join('\n'));
  const run = await python(root, 'parser.py', parser, [file]);
  assert.equal(run.status, 0, run.stderr);
  const { summary, results } = JSON.parse(run.stdout);
  assert.deepEqual(summary, { tests: 5, pass: 1, fail: 4, cancelled: 0 });
  const by = Object.fromEntries(results.map((r) => [r.name, r]));
  assert.equal(by.asserts.assertion, true);
  assert.equal(by['sits out'].skipped, true);
  assert.equal(by['leaks an exception'].crash, false, 'an exception that escapes during a named test is that test failing');
  assert.equal(by['tests/dead.test.mjs'].crash, true, 'a dead test file has no test to blame');
  assert.equal(by.parent.aggregate, true, 'a parent that failed only because a child did is not evidence of its own');
});

// ---- limits: a mutant that hangs, allocates or prints without end costs one bounded run, never the machine ------------------
//
// This is what once left orphaned `node --test` workers holding hundreds of gigabytes between them: a driver that killed only the
// top process of a timed-out run, and a mutant that allocated until nothing was left. Every throwaway script below has its own
// ceiling (a gigabyte of memory, a hundred megabytes of output, a minute of life), so a harness that fails these tests costs a
// few seconds and a gigabyte, not the machine.

const MB = 1024 * 1024;

const scripts = {
  // the leader of a tree: one helper in its process group, one in a session of its own (a daemon), then what `mode` says
  'tree.mjs': `
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
const [pidfile, mode] = process.argv.slice(2);
const MB = 1024 * 1024;
const helpers = [spawn(process.execPath, ['hold.mjs'], { stdio: 'ignore' }), spawn(process.execPath, ['hold.mjs'], { stdio: 'ignore', detached: true })];
writeFileSync(pidfile, [process.pid, ...helpers.map((h) => h.pid)].join(' '));
if (mode === 'exit') setTimeout(() => process.exit(0), 600);
else if (mode === 'allocate') {
  const keep = [];
  let held = 0;
  const grab = () => {
    if (held >= 1000 * MB) { console.log('CEILING'); process.exit(3); }
    keep.push(Buffer.alloc(50 * MB, 1));
    held += 50 * MB;
    setTimeout(grab, 100);
  };
  grab();
} else setTimeout(() => process.exit(0), 60_000);
`,
  'hold.mjs': 'setTimeout(() => process.exit(0), 60_000);\n',
  'chatter.mjs': `
let written = 0;
const line = 'x'.repeat(1024 * 1024);
const next = () => { if (written >= 100 * 1024 * 1024) { console.log('CEILING'); process.exit(3); } process.stdout.write(line); written += line.length; setTimeout(next, 20); };
next(); // a megabyte every 20 ms: well past the 4 MB cap within the first poll, and two seconds from its own ceiling
`,
  'heap.mjs': `
const keep = [];
for (;;) { keep.push(new Array(1e6).fill(Math.random())); if (keep.length > 300) { console.log('CEILING'); process.exit(3); } }
`,
};

const limits = String.raw`
import json
import os
import subprocess
import sys
import time
from pathlib import Path

for name in [n for n in os.environ if n.startswith('KXMUT_') or n == 'NODE_OPTIONS']:
    del os.environ[name]  # the defaults are what is under test, whatever environment this test file runs in (a nested run has NODE_OPTIONS set)
sys.dont_write_bytecode = True
sys.path.insert(0, sys.argv[1])
import kxmut

work, mode = Path(sys.argv[2]), sys.argv[3]
kxmut.POLL_SECONDS = 0.1
MB = 1024 * 1024
pidfile = work / 'pids.txt'


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    command = subprocess.run(['ps', '-o', 'command=', '-p', str(pid)], capture_output=True, text=True).stdout
    return 'tree.mjs' in command or 'hold.mjs' in command  # a pid that has been given to something else is not ours


def left_alive():
    pids = [int(p) for p in pidfile.read_text().split()] if pidfile.exists() else []
    deadline = time.monotonic() + 5
    left = []
    while True:
        left = [p for p in pids if alive(p)]
        if not left or time.monotonic() > deadline:
            return {'started': len(pids), 'alive': left}
        time.sleep(0.1)


def describe(run):
    return {'expired': run.expired, 'reason': run.reason, 'overcap': run.overcap, 'returncode': run.returncode, 'peak': run.peak, 'seconds': run.seconds,
            'survivors': run.survivors, 'stdout': len(run.stdout), 'out': run.stdout[:60], 'note': run.limit_note(),
            'oom': 'heap out of memory' in run.stderr.lower(), 'verdict': kxmut.judge(kxmut.TestRun(run)).kind}


report = {}
tree = ['node', 'tree.mjs', str(pidfile)]
clean = dict(os.environ)
if mode == 'memory':
    report = describe(kxmut.run_command(work, [*tree, 'allocate'], timeout=30, memory_cap=300 * MB))
elif mode == 'time':
    report = describe(kxmut.run_command(work, [*tree, 'hang'], timeout=3))
elif mode == 'leftovers':
    report = describe(kxmut.run_command(work, [*tree, 'exit'], timeout=30))
elif mode == 'output':
    report = describe(kxmut.run_command(work, ['node', 'chatter.mjs'], timeout=30, output_cap=4 * MB))
elif mode == 'heap':
    report = describe(kxmut.run_command(work, ['node', 'heap.mjs'], timeout=60, heap_mb=64))
elif mode == 'defaults':
    report = {'heap': kxmut.HEAP_MB, 'memory': kxmut.MEMORY_CAP, 'output': kxmut.OUTPUT_CAP}
    report.update(describe(kxmut.run_command(work, ['node', '-e', 'console.log(process.env.NODE_OPTIONS)'], env=clean)))
elif mode == 'options':
    def options(value):
        return kxmut.run_command(work, ['node', '-e', 'console.log(process.env.NODE_OPTIONS)'], env={**clean, 'NODE_OPTIONS': value}).stdout.strip()
    report = {'lower': options('--max-old-space-size=123'), 'higher': options('--max-old-space-size=99999 --no-warnings'),
              'underscored': options('--max_old_space_size=77777')}
elif mode == 'sigterm':
    kxmut.run_command(work, [*tree, 'hang'], timeout=60)  # does not return: the test ends this driver with SIGTERM while the run is in flight
elif mode == 'process':
    caught = {}
    for name, argv, kwargs in (('hang', [*tree, 'hang'], {'timeout': 3}), ('memory', [*tree, 'allocate'], {'timeout': 30, 'memory_cap': 300 * MB})):
        try:
            kxmut.run_process(argv, cwd=work, **kwargs)
            caught[name] = 'returned'
        except subprocess.TimeoutExpired as error:
            caught[name] = {'type': type(error).__name__, 'overcap': isinstance(error, kxmut.OverCap), 'message': str(error)[-120:]}
        caught[name + 'Left'] = left_alive()
    done = kxmut.run_process(['node', '-e', 'console.log(6 * 7); console.error("e")'], cwd=work, timeout=20)
    report = {**caught, 'ok': [done.returncode, done.stdout.strip(), done.stderr.strip()]}
if mode in ('memory', 'time', 'leftovers'):
    report['tree'] = left_alive()
print(json.dumps(report))
`;

async function limited(t, mode) {
  const root = await scratch(t);
  await mkdir(join(root, 'work'));
  for (const [name, source] of Object.entries(scripts)) await writeFile(join(root, 'work', name), source);
  const run = await python(root, 'limits.py', limits, [join(root, 'work'), mode]);
  assert.equal(run.status, 0, `${run.stdout}${run.stderr}`);
  return JSON.parse(run.stdout);
}

test('mutation harness limits: a mutant that allocates without bound is killed at the memory cap, long before its own ceiling, and nothing of its tree survives', async (t) => {
  const r = await limited(t, 'memory');
  assert.equal(r.expired, true, JSON.stringify(r));
  assert.equal(r.reason, 'memory');
  assert.equal(r.overcap, true);
  assert.ok(r.peak > 300 * MB, `the cap was crossed: ${r.peak / MB} MB`);
  assert.ok(r.peak < 900 * MB, `and the tree was killed soon after, not at the script's ceiling of a gigabyte: ${r.peak / MB} MB`);
  assert.ok(r.seconds < 20, `${r.seconds} s`);
  assert.doesNotMatch(r.out, /CEILING/);
  assert.equal(r.verdict, 'OVERCAP', 'an over-cap run is reported as one, not as a kill or as an ordinary timeout');
  assert.match(r.note, /held \d+ MB against a cap of 300 MB/);
  assert.deepEqual(r.survivors, []);
  assert.equal(r.tree.started, 3, 'the leader and its two helpers');
  assert.deepEqual(r.tree.alive, [], 'no process of the tree is left, the helper that left the process group included');
});

test('mutation harness limits: a timeout takes the whole tree down, not only the top process', async (t) => {
  const r = await limited(t, 'time');
  assert.equal(r.expired, true);
  assert.equal(r.reason, 'time');
  assert.equal(r.overcap, false);
  assert.ok(r.seconds >= 3 && r.seconds < 20, `${r.seconds} s`);
  assert.equal(r.verdict, 'TIMEOUT');
  assert.equal(r.note, 'timed out after 3 s');
  assert.deepEqual(r.survivors, []);
  assert.equal(r.tree.started, 3);
  assert.deepEqual(r.tree.alive, [], 'the leader and both helpers are gone');
});

test('mutation harness limits: a tree whose leader finishes by itself does not leave its helpers behind', async (t) => {
  const r = await limited(t, 'leftovers');
  assert.equal(r.expired, false);
  assert.equal(r.returncode, 0);
  assert.equal(r.reason, null);
  assert.equal(r.tree.started, 3);
  assert.deepEqual(r.tree.alive, [], 'the helpers outlived the leader, and the run took them with it');
});

test('mutation harness limits: output that never ends is cut at the output cap and never held whole', async (t) => {
  const r = await limited(t, 'output');
  assert.equal(r.reason, 'output');
  assert.equal(r.verdict, 'OVERCAP');
  assert.ok(r.seconds < 20, `${r.seconds} s`);
  assert.ok(r.stdout < 3 * MB, `only the first and last megabyte are kept: ${r.stdout} bytes`);
  assert.doesNotMatch(r.out, /CEILING/);
  assert.match(r.note, /wrote more than 4 MB of output/);
});

test('mutation harness limits: every node a run starts gets a heap cap, so a script that fills its heap aborts instead of growing', async (t) => {
  const r = await limited(t, 'heap');
  assert.equal(r.expired, false, 'the heap cap ended it, not the watchdog');
  assert.notEqual(r.returncode, 0);
  assert.equal(r.oom, true, 'V8 reported that it ran out of heap');
  assert.doesNotMatch(r.out, /CEILING/);
  const d = await limited(t, 'defaults');
  assert.equal(d.heap, 4096);
  assert.equal(d.memory, 4 * 1024 * MB, 'a gigabyte below the 6 GB at which the fleet guard kills a node --test process, for a fast allocator to overshoot into');
  assert.equal(d.output, 64 * MB);
  assert.match(d.out, /--max-old-space-size=4096/, 'the default reaches the node the run starts');
  const o = await limited(t, 'options');
  assert.equal(o.lower, '--max-old-space-size=123', 'a heap cap the caller chose that is stricter than ours stays');
  assert.equal(o.higher, '--max-old-space-size=4096 --no-warnings', 'one that is looser is lowered to ours, and the other options are left alone');
  assert.equal(o.underscored, '--max-old-space-size=4096', 'whichever way the option is spelled');
});

test('mutation harness limits: a driver that is terminated while a run is in flight takes the run with it', async (t) => {
  const root = await scratch(t), work = join(root, 'work'), pidfile = join(work, 'pids.txt');
  await mkdir(work);
  for (const [name, source] of Object.entries(scripts)) await writeFile(join(work, name), source);
  await writeFile(join(root, 'limits.py'), limits);
  const driverProcess = spawn('python3', ['-I', '-u', join(root, 'limits.py'), lib, work, 'sigterm'], { stdio: 'ignore' });
  t.after(() => driverProcess.kill('SIGKILL'));
  const ended = new Promise((resolve) => driverProcess.once('exit', (code, signal) => resolve({ code, signal })));
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  let pids = [];
  for (let attempt = 0; attempt < 100 && pids.length < 3; attempt++) {
    await pause(100);
    pids = (await readFile(pidfile, 'utf8').catch(() => '')).split(/\s+/).filter(Boolean).map(Number);
  }
  t.after(() => pids.forEach((pid) => { try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ } }));
  assert.equal(pids.length, 3, 'the run started its leader and two helpers');
  assert.ok(pids.every(alive), 'and they are running');
  driverProcess.kill('SIGTERM');
  const { code } = await ended;
  assert.equal(code, 143, 'the driver ends with the status of a SIGTERM, through its finally blocks, not killed outright');
  let left = pids;
  for (let attempt = 0; attempt < 50 && left.length; attempt++) {
    await pause(100);
    left = left.filter(alive);
  }
  assert.deepEqual(left, [], 'the leader and both helpers died with the driver; each run is a session of its own, so the signal never reached them');
});

test('mutation harness limits: run_process is a drop-in for subprocess.run that raises TimeoutExpired and leaves nothing running', async (t) => {
  const r = await limited(t, 'process');
  assert.equal(r.hang.type, 'TimeoutExpired');
  assert.equal(r.hang.overcap, false);
  assert.deepEqual(r.hangLeft.alive, [], 'a timed-out run leaves no process of its tree (subprocess.run alone leaves its test workers)');
  assert.equal(r.memory.type, 'OverCap');
  assert.equal(r.memory.overcap, true);
  assert.match(r.memory.message, /held \d+ MB against a cap of 300 MB/);
  assert.deepEqual(r.memoryLeft.alive, []);
  assert.deepEqual(r.ok, [0, '42', 'e'], 'a run that finishes returns what subprocess.run returns');
});

test('mutation harness limits: a driver reports a mutant killed for its memory as OVERCAP, never as a kill, and counts it as caught only where a hang is', async (t) => {
  const root = await scratch(t), pkg = await fixture(root);
  const strict = await python(root, 'driver.py', driver, [pkg, join(root, 'work'), 'strict+overcap']);
  assert.doesNotMatch(strict.stdout + strict.stderr, /BASELINE NOT GREEN/, strict.stdout + strict.stderr);
  assert.match(line(strict.stdout, '] allocates'), /^\[OVERCAP \] allocates: the process tree held [\d.]+ [MG]B against a cap of 600 MB after [\d.]+ s and was killed$/);
  assert.match(strict.stdout, /^1\/2 mutations caught$/m);
  assert.match(strict.stdout, /^ {2}ERROR: allocates: OVERCAP: /m);
  assert.equal(strict.status, 1);
  const counted = await python(root, 'driver.py', driver, [pkg, join(root, 'work2'), 'loose+timeouts+overcap']);
  assert.match(line(counted.stdout, '] allocates'), /^\[CAUGHT WITH TIMEOUT\] allocates: OVERCAP: /);
  assert.match(counted.stdout, /^2\/2 mutations caught$/m);
  assert.match(counted.stdout, /^1 caught with timeout$/m);
  assert.equal(counted.status, 0);
});
