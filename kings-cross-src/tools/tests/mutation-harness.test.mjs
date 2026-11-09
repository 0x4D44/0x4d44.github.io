import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
tally = kxmut.Tally(timeout_is_caught=('timeouts' in mode))
with kxmut.workspace(package, scratch, 'harness') as work:
    suite = kxmut.Suite(work, test_timeout_ms=1500, timeout=60)
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
