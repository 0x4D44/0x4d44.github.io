"""Bounded, synthetic evidence-runner mutations; no browser, relay or keychain is opened.

The test runs in a copy of the package (with the frozen rubric beside it, as in the repository) with the real
node_modules linked in. The unmodified copy must pass first, and a load or crash error is an ERROR, not a kill
(tools/mutation/lib/kxmut.py)."""
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

PACKAGE = Path(__file__).resolve().parents[2]
ROOT = PACKAGE.parent
SCRATCH = ROOT / '.scratch' / 'mutation' / 'evidence-pack'
RUBRIC = 'wrk_docs/2026.11.07 - KXLIVE - Scoring rubric and loop rules.md'
TEST = 'kings-cross-src/tools/tests/evidence-pack.test.mjs'

MUTATIONS = [
    ('accept axis ten', '0?([1-9])$', '0?([0-9]+)$'),
    ('write output during dry run', 'if (options.dryRun) { const result', 'if (options.dryRun) { await mkdir(options.out, { recursive: true }); const result'),
    ('keep the partial recording tail', 'await output.truncate(lastNewline + 1)', 'await output.truncate(offset)'),
    ('ignore recording date order', ".filter(n => /^td-Y9-\\d{8}\\.ndjson$/.test(n)).sort()", ".filter(n => /^td-Y9-\\d{8}\\.ndjson$/.test(n)).sort().reverse()"),
    ('reuse an existing pack', "if (current === options.out) throw new Error('output must be fresh; directory already exists')", "if (false) throw new Error('output must be fresh; directory already exists')"),
    ('precreate child-owned output directories', 'for (const output of step.outputs) await safeArtifactAncestors(options.root, output.path);', 'for (const output of step.outputs) { await safeArtifactAncestors(options.root, output.path); await mkdir(path.dirname(output.path), { recursive: true, mode: 0o700 }); }'),
    ('omit source maps', "'--', '--sourcemap', '--outDir'", "'--', '--outDir'"),
    ('omit raw OSM geometry reference', "['--graph', input('graph'), '--raw', input('raw-osm'), '--out', legacy]", "['--graph', input('graph'), '--out', legacy]"),
    ('omit raw OSM geometry dependency', "inputs: ['graph', 'raw-osm'], outputs:", "inputs: ['graph'], outputs:"),
    ('run GPU tools without opt-in', "step.needs.includes('GPU') && !options.gpu", 'false'),
    ('required failures do not fail the pack', 'report.exitCode = report.steps.some', 'report.exitCode = false && report.steps.some'),
    ('omit the frozen evidence requirement', "'', a.evidence, ''", "'', '', ''"),
    ('invoke the manual keychain step', 'if (step.manual) { result.status', 'if (false) { result.status'),
    ('lose the loopback adapter result', "process.exitCode=r.status==='PASS'?0:1", "process.exitCode=r.status==='FAIL'?0:1"),
    ('ignore child timeout status', "timedOut = true; kill('SIGTERM')", "timedOut = false; kill('SIGTERM')"),
    ('allow symlink export from the legacy CLI', "if ((await lstat(current)).isSymbolicLink()) throw new Error('command output ancestor is a symlink')", "if (false) throw new Error('command output ancestor is a symlink')"),
    ('accept source edits during collection', 'if (!report.build.sourcesUnchanged) {', 'if (false) {'),
    ('allow equivalent exceptions for every driver', "name === 'station' ? names.filter", 'true ? names.filter'),
    ('trust zero-exit mutation survivors', 'if (value.truncated || !result.mutations.passed)', 'if (false)'),
    ('omit performance evidence', "if (selected.has('08')) node", 'if (false) node'),
    ('omit cached motion schedules', '...recArgs, ...motionScheduleArgs,', '...recArgs,'),
    ('motion schedule omitted from provenance', "'smart', ...motionSchedules.map(i => i.role)", "'smart'"),
    ('missing motion schedule becomes required', "i.role.startsWith('schedule:') && i.presentAtPlanning", "i.role.startsWith('schedule:')"),
    ('omit axis 05 portal capture', "if (selected.has('05')) node('05-portal-capture'", "if (false) node('05-portal-capture'"),
    ('silently skip undocumented mutation drivers', "options.only.includes('09') && undocumented.length", 'false'),
]

tally = kxmut.Tally()
with kxmut.workspace(PACKAGE, SCRATCH, 'evidence-pack') as work:
    repository = work.parent
    (repository / RUBRIC).parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / RUBRIC, repository / RUBRIC)
    suite = kxmut.Suite(work, cwd=repository, test_timeout_ms=10000, timeout=30)
    baseline = suite.baseline([TEST])
    for label, old, new in MUTATIONS:
        try:
            with kxmut.mutated(work / 'tools/evidence-pack.mjs', [(old, new)]):
                verdict, _run = suite.judge([TEST], strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unproven = baseline.passed - tally.red
print(f'{len(tally.red & baseline.passed)}/{len(baseline.passed)} tests seen failing; unproven: {sorted(unproven)}')
sys.exit(1 if status or unproven else 0)
