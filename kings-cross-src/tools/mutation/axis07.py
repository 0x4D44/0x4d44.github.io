"""Bounded synthetic checks for private scanning and evidence decisions.

python3 -I -u tools/mutation/axis07.py <kings-cross-src> <worktree/.scratch/dir>
No real keychain, Git writes, relay listener, or private recording is used.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be under worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

M = [
    ('keychain asks for password', 'axis07-scan.mjs', "['find-generic-password', '-s', service],", "['find-generic-password', '-s', service, '-w'],"),
    ('missing required keychain item passes', 'axis07-scan.mjs', "ok: items[0].state === 'present' && ['present', 'absent'].includes(items[1].state)", 'ok: true'),
    ('Unicode account survives path redaction', 'axis07-scan.mjs', '.flatMap((value) => [value, value.toLowerCase()])', '.map((value) => value.toLowerCase())'),
    ('UTF-8 matcher drops boundary tail', 'axis07-scan.mjs', "tail = keep > 0 ? combined.slice(-keep) : '';", "tail = '';"),
    ('Git misses last revision batch', 'axis07-scan.mjs', "if (revisions.length) await grep(revisions, 'history');", ''),
    ('account identifier reaches process arguments', 'axis07-scan.mjs', "...revisions, '--'],", "...revisions, input, '--'],"),
    ('Git errors claim a clean scan', 'axis07-scan.mjs', "status: errors.length || trackedMatches || historicalMatches ? 'FAIL' : 'PASS'", "status: trackedMatches || historicalMatches ? 'FAIL' : 'PASS'"),
    ('filesystem scanner follows private symlink', 'axis07-scan.mjs', "error(scope, target, 'symlink not followed'); return;", 'await file(scope, target); return;'),
    ('command timeout is hidden', 'axis07-scan.mjs', 'timedOut = true; kill', 'timedOut = false; kill'),
    ('output escapes scratch', 'axis07-evidence.mjs', "if (!inside(resolve(root, '.scratch'), out)) throw new Error('--out must be beneath the worktree .scratch');", ''),
    ('incomplete suite passes', 'axis07-evidence.mjs', "!run.failed && !run.timedOut && run.code === 0 && result.tests > 0 && result.pass === result.tests && result.fail === 0 && result.cancelled === 0", 'run.code === 0'),
    ('relay suite uses caller working directory', 'axis07-evidence.mjs', 'timeoutMs: 180_000, cwd: pkg', 'timeoutMs: 180_000'),
    ('surviving mutation passes', 'axis07-evidence.mjs', 'caught === total && survivors === 0 && neverFailed === 0', 'caught === total && neverFailed === 0'),
    ('missing identifier does not fail pack', 'axis07-evidence.mjs', "const keychain = { status: loaded.ok && loaded.identifiers.length ? 'PASS' : 'FAIL'", "const keychain = { status: 'PASS'"),
    ('report writes account value', 'axis07-evidence.mjs', "if (typeof value === 'string') return redact(value, patterns);", "if (typeof value === 'string') return value;"),
    ('missing relay logs go unnoticed', 'axis07-evidence.mjs', 'if (!options.logs.length) {', 'if (false) {'),
    ('software renderer accepted', 'axis07-evidence.mjs', "/Metal/i.test(value.renderer) && !/SwiftShader|llvmpipe|software/i.test(value.renderer) &&", ''),
    ('OSM credit missing but browser passes', 'axis07-evidence.mjs', ' && p.attribution?.present?.osm === true', ''),
    ('stale mutation fingerprint accepted', 'axis07-evidence.mjs', '(!value.sourceHash || value.sourceHash === sourceHash)', 'true'),
    ('output follows symlink outside scratch', 'axis07-evidence.mjs', "if (actual !== base && !inside(base, actual)) throw new Error('output symlink escapes .scratch');", ''),
    ('probe response and log artifacts missed', 'axis07-evidence.mjs', 'path: relayProbe.paths.evidenceDir ?? relayProbe.paths.dataDir', 'path: relayProbe.paths.dataDir'),
    ('unavailable NIC probe claims complete coverage', 'axis07-evidence.mjs', "&& !unavailableProbes.length ? 'PASS'", "? 'PASS'"),
    ('combined pack drops browser failure URLs', 'axis07-evidence.mjs', 'failedRequests: p.failedRequests,', ''),
    ('combined pack drops transition diagnostics', 'axis07-evidence.mjs', 'networkDiagnostics: value.networkDiagnostics,', ''),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=10000',
                           'tools/tests/axis07-scan.test.mjs', 'tools/tests/axis07-evidence.test.mjs'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)

def assertions(output):
    failed = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - (.+)', block)
        if name and 'ERR_ASSERTION' in block:
            failed.add(name[1])
    return failed

with tempfile.TemporaryDirectory(prefix='axis07-', dir=scratch) as temporary:
    repo = Path(temporary)
    work = repo / 'kings-cross-src'
    (work / 'tools/tests').mkdir(parents=True)
    (work / 'relay').mkdir()
    (work / 'relay/tests').mkdir()
    (work / 'relay/tests/synthetic.test.mjs').write_text('// synthetic filename; injected runner never executes this file\n')
    for name in ['axis07-scan.mjs', 'axis07-evidence.mjs']:
        shutil.copy2(src / 'tools' / name, work / 'tools' / name)
    for name in ['axis07-scan.test.mjs', 'axis07-evidence.test.mjs']:
        shutil.copy2(src / 'tools/tests' / name, work / 'tools/tests' / name)
    shutil.copy2(src / 'relay/keychain.mjs', work / 'relay/keychain.mjs')
    baseline = run(work)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout + baseline.stderr)
        raise SystemExit('baseline must pass')
    expected = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
    survivors, observed = [], set()
    for label, name, old, new in M:
        target = work / 'tools' / name
        original = (src / 'tools' / name).read_text()
        if old not in original:
            raise SystemExit('missing mutation pattern: ' + label)
        target.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print('[INVALID TIMEOUT] ' + label, flush=True)
            target.write_text(original)
            continue
        target.write_text(original)
        failed = assertions(result.stdout)
        names = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
        total = re.search(r'^# tests (\d+)$', result.stdout, re.M)
        if failed and failed == names and total and int(total[1]) == len(expected) and not result.stderr:
            observed.update(failed)
            print('[CAUGHT] ' + label, flush=True)
        else:
            survivors.append(label)
            print('[SURVIVED/INVALID] ' + label, flush=True)
            print(result.stdout + result.stderr)
    print(f'{len(M) - len(survivors)}/{len(M)} caught; {len(observed & expected)}/{len(expected)} tests observed failing')
    print('Survivors: ' + ', '.join(survivors))
    print('Never red: ' + ', '.join(sorted(expected - observed)))
    raise SystemExit(1 if survivors or expected - observed else 0)
