"""Bounded synthetic checks for private scanning and evidence decisions.

python3 -I -u tools/mutation/axis07.py <kings-cross-src> <worktree/.scratch/dir>
No real keychain, Git writes, relay listener, or private recording is used: the tests inject everything, and
run in a copy of the package (real node_modules linked in, so tools/axis07-evidence.mjs can load
tools/axis07-browser.mjs and the core and web modules it imports). The unmodified copy must pass first.
Every failing test in a mutant run must fail by assertion (tools/mutation/lib/kxmut.py), and every test must
be seen failing by at least one mutation.
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

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
    ('software renderer accepted', 'axis07-evidence.mjs', " && hardwareRenderer(value.renderer) && finalizeStatus(value) === 'PASS'", " && finalizeStatus(value) === 'PASS'"),
    ('OSM credit missing but browser passes', 'axis07-browser.mjs', 'Number.isSafeInteger(phase.trainCount) && phase.attribution?.present?.osm === true &&', 'Number.isSafeInteger(phase.trainCount) &&'),
    ('stale mutation fingerprint accepted', 'axis07-evidence.mjs', '(!value.sourceHash || value.sourceHash === sourceHash)', 'true'),
    ('output follows symlink outside scratch', 'axis07-evidence.mjs', "if (actual !== base && !inside(base, actual)) throw new Error('output symlink escapes .scratch');", ''),
    ('probe response and log artifacts missed', 'axis07-evidence.mjs', 'path: relayProbe.paths.evidenceDir ?? relayProbe.paths.dataDir', 'path: relayProbe.paths.dataDir'),
    ('unavailable NIC probe claims complete coverage', 'axis07-evidence.mjs', "&& !unavailableProbes.length ? 'PASS'", "? 'PASS'"),
    ('combined pack drops browser failure URLs', 'axis07-evidence.mjs', 'failedRequests: p.failedRequests,', ''),
    ('combined pack drops transition diagnostics', 'axis07-evidence.mjs', 'networkDiagnostics: value.networkDiagnostics,', ''),
]

TESTS = ['tools/tests/axis07-scan.test.mjs', 'tools/tests/axis07-evidence.test.mjs']

tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'axis07') as work:
    suite = kxmut.Suite(work, test_timeout_ms=10000, timeout=60)
    baseline = suite.baseline(TESTS)
    for label, name, old, new in M:
        try:
            with kxmut.mutated(work / 'tools' / name, [(old, new)]):
                verdict, run = suite.judge(TESTS, strict=True)
                if verdict.kind == kxmut.SURVIVED or verdict.kind == kxmut.KILLED:
                    if run.stderr:  # a clean run and a clean kill both leave stderr empty
                        verdict = kxmut.Verdict(kxmut.ERROR, 'unexpected stderr: ' + run.stderr.strip()[:200])
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unseen = baseline.passed - tally.red
print(f'{len(tally.red & baseline.passed)}/{len(baseline.passed)} tests observed failing')
for name in sorted(unseen):
    print('  NEVER FAILED:', name)
sys.exit(1 if status or unseen else 0)
