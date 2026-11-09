"""Mutation check for the UTC sclass relearn scheduler; usage: sclass-job.py <kings-cross-src> <.scratch/output>.

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
every failing test must fail by assertion, and a load or crash error is an ERROR, not a kill
(tools/mutation/lib/kxmut.py)."""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

if len(sys.argv) != 3:
    raise SystemExit(__doc__)

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
TEST = 'relay/tests/sclass-job.test.mjs'

MUTATIONS = [
    ('startup catch-up omitted', "if (!stopped) trigger(utcDate(now()));\n      }, startupDelay(at));", "if (!stopped) {}\n      }, startupDelay(at));"),
    ('startup settle crosses UTC midnight', "return utcDate(due) === utcDate(at) ? settleMs : nextUtcMidnight(at) + settleMs - at;", "return settleMs;"),
    ('UTC rollover runs previous date', "trigger(utcDate(now()));\n      armRollover();", "trigger(utcDate(now() - 24 * 60 * 60_000));\n      armRollover();"),
    ('overlapping relearns allowed', "if (activePromise) {", "if (false) {"),
    ('stop leaves rollover timer armed', "if (rolloverArmed) cancel(rolloverTimer);", "if (false && rolloverArmed) cancel(rolloverTimer);"),
    ('failure summary leaks child error text', "safeErrorSummary(error)} for ${date}", "String(error.message)} for ${date}"),
    ('refusal is logged as publication', "result.published ? 'published' : 'refused'", "'published'"),
    ('omitted candidate prevents refusal summary', 'if (value === null || value === undefined) return null;', 'if (value === null) return null;'),
    ('unset anchor path is still passed to child', "if (anchorsPath !== undefined) args.push('--anchors', anchorsPath);", "args.push('--anchors', anchorsPath);"),
    ('optional table path is ignored', "if (tablePath !== undefined) args.push('--table', tablePath);", "if (false && tablePath !== undefined) args.push('--table', tablePath);"),
    ('shared recordings directory is omitted', "if (recordingsDir !== undefined) args.push('--recordings-dir', recordingsDir);", "if (false && recordingsDir !== undefined) args.push('--recordings-dir', recordingsDir);"),
    ('child execution timeout omitted', 'timeout: timeoutMs,', 'timeout: 0,'),
    ('stubborn child is not force-killed', "try { child.kill('SIGKILL'); } catch", "try { void child; } catch"),
    ('same-owner stale lock is not reclaimed', 'if ((error || signal?.aborted) && exited) await removeOwnedLock(dataDir, child.pid, lockFs);', 'if (false) await removeOwnedLock(dataDir, child.pid, lockFs);'),
    ('foreign-owner lock is deleted', 'if (lock?.pid !== pid) return false;', 'if (false) return false;'),
    ('lock is reclaimed before child exit', 'const exited = child && (child.exitCode !== null && child.exitCode !== undefined\n            || child.signalCode !== null && child.signalCode !== undefined);', 'const exited = child && true;'),
    ('failed spawn without PID may reclaim lock', 'if (!Number.isInteger(pid) || pid <= 0) return false;', "if (!Number.isInteger(pid) || pid <= 0) return lockFs.unlink(path.join(dataDir, '.sclass-relearn.lock')).then(() => true, () => false);"),
]

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'sclass-job') as work:
    suite = kxmut.Suite(work, test_timeout_ms=4000, timeout=12)
    baseline = suite.baseline([TEST])
    expected = {n for n in baseline.passed if n.startswith('sclass job: ')}
    if expected != baseline.names:
        raise SystemExit('baseline TAP was incomplete or did not contain only the expected scheduler tests')
    for label, old, new in MUTATIONS:
        try:
            with kxmut.mutated(work / 'relay/sclass-job.mjs', [(old, new)], unique=True):
                verdict, run = suite.judge([TEST], strict=True)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        if verdict.kind == kxmut.KILLED and run.stderr:
            verdict = kxmut.Verdict(kxmut.ERROR, 'unexpected stderr: ' + run.stderr.strip()[:200])
        tally.record(label, verdict)
status = tally.finish()
unseen = expected - tally.red
print(f'{len(expected) - len(unseen)}/{len(expected)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
