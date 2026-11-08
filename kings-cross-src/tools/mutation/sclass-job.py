"""Mutation check for the UTC sclass relearn scheduler; usage: sclass-job.py <kings-cross-src> <.scratch/output>."""
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile
from pathlib import Path

if len(sys.argv) != 3:
    raise SystemExit(__doc__)

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

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
    ('child execution timeout omitted', 'timeout: timeoutMs,', 'timeout: 0,'),
    ('stubborn child is not force-killed', "try { child.kill('SIGKILL'); } catch", "try { void child; } catch"),
    ('same-owner stale lock is not reclaimed', 'if ((error || signal?.aborted) && exited) await removeOwnedLock(dataDir, child.pid, lockFs);', 'if (false) await removeOwnedLock(dataDir, child.pid, lockFs);'),
    ('foreign-owner lock is deleted', 'if (lock?.pid !== pid) return false;', 'if (false) return false;'),
    ('lock is reclaimed before child exit', 'const exited = child && (child.exitCode !== null && child.exitCode !== undefined\n            || child.signalCode !== null && child.signalCode !== undefined);', 'const exited = child && true;'),
    ('failed spawn without PID may reclaim lock', 'if (!Number.isInteger(pid) || pid <= 0) return false;', "if (!Number.isInteger(pid) || pid <= 0) return lockFs.unlink(path.join(dataDir, '.sclass-relearn.lock')).then(() => true, () => false);"),
]


def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=4000', 'relay/tests/sclass-job.test.mjs']
    process = subprocess.Popen(command, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               text=True, stdin=subprocess.DEVNULL, start_new_session=True)
    expired = False
    try:
        stdout, stderr = process.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        expired = True
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        stdout, stderr = process.communicate(timeout=3)
    return subprocess.CompletedProcess(command, process.returncode, stdout, stderr), expired


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        name = re.match(r'^not ok \d+ - (sclass job: .+)$', block, re.M)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION", block, re.M):
            failures.add(name[1])
    return failures


for _label, old, _new in MUTATIONS:
    if (src / 'relay/sclass-job.mjs').read_text().count(old) != 1:
        raise SystemExit(f'mutation source pattern must occur exactly once: {_label}')

baseline, expired = run(src)
if expired or baseline.returncode:
    print(baseline.stdout + baseline.stderr)
    raise SystemExit('baseline scheduler tests must pass')
expected = set(re.findall(r'^ok \d+ - (sclass job: .+)$', baseline.stdout, re.M))
count = re.search(r'^# tests (\d+)$', baseline.stdout, re.M)
if count is None or len(expected) != int(count[1]):
    raise SystemExit('baseline TAP was incomplete or did not contain only the expected scheduler tests')

seen, survivors = set(), []
for index, (label, old, new) in enumerate(MUTATIONS):
    with tempfile.TemporaryDirectory(prefix='sclass-job-', dir=scratch) as temporary:
        work = Path(temporary)
        (work / 'relay/tests').mkdir(parents=True)
        shutil.copy2(src / 'relay/tests/sclass-job.test.mjs', work / 'relay/tests/sclass-job.test.mjs')
        original = (src / 'relay/sclass-job.mjs').read_text()
        (work / 'relay/sclass-job.mjs').write_text(original.replace(old, new, 1))
        result, expired = run(work)
        named_failures = set(re.findall(r'^not ok \d+ - (sclass job: .+)$', result.stdout, re.M)) & expected
        failed = assertion_failures(result.stdout) & expected
        if failed and failed == named_failures and not expired and not result.stderr:
            seen.update(failed)
            print(f'[KILLED] {label} <- {sorted(failed)[0]}', flush=True)
        else:
            log = scratch / f'mutation-{index:02d}.log'
            log.write_text(result.stdout + result.stderr)
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label} (exit {result.returncode}; {log})', flush=True)

unseen = expected - seen
print(f'\n{len(MUTATIONS) - len(survivors)}/{len(MUTATIONS)} mutations caught; {len(seen)}/{len(expected)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
for label in survivors:
    print('  NOT CAUGHT:', label)
raise SystemExit(1 if survivors or unseen else 0)
