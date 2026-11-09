"""Bounded, synthetic evidence-runner mutations; no browser, relay or keychain is opened."""
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

PACKAGE = Path(__file__).resolve().parents[2]
ROOT = PACKAGE.parent
SCRATCH = ROOT / '.scratch' / 'mutation' / 'evidence-pack'
RUBRIC = 'wrk_docs/2026.11.07 - KXLIVE - Scoring rubric and loop rules.md'
SCRATCH.mkdir(parents=True, exist_ok=True)

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


def run(root):
    return subprocess.run(
        ['node', '--test', '--test-reporter=tap', '--test-timeout=10000',
         'kings-cross-src/tools/tests/evidence-pack.test.mjs'],
        cwd=root, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=30)


baseline = run(ROOT)
if baseline.returncode:
    raise SystemExit('baseline failed\n' + baseline.stdout + baseline.stderr)
names = set(re.findall(r'^ok \d+ - (.+)$', baseline.stdout, re.M))
seen, survivors, timeouts = set(), [], []
source = (PACKAGE / 'tools/evidence-pack.mjs').read_text()
for number, (label, old, new) in enumerate(MUTATIONS, 1):
    if old not in source:
        raise SystemExit(f'stale mutation: {label}')
    with tempfile.TemporaryDirectory(prefix='case-', dir=SCRATCH) as temporary:
        work = Path(temporary)
        for relative in [RUBRIC, 'kings-cross-src/tools/mutation/README.md',
                         'kings-cross-src/tools/tests/evidence-pack.test.mjs']:
            target = work / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / relative, target)
        (work / 'kings-cross-src/tools/evidence-pack.mjs').write_text(source.replace(old, new, 1))
        try:
            result = run(work)
            failures = set(re.findall(r'^not ok \d+ - (.+)$', result.stdout, re.M))
            killed = result.returncode != 0 and failures and 'ERR_ASSERTION' in result.stdout
            if killed:
                seen.update(failures)
                print(f'KILLED: {label}', flush=True)
            else:
                survivors.append(label)
                (SCRATCH / f'{number:02d}.log').write_text(result.stdout + result.stderr)
                print(f'SURVIVED: {label}', flush=True)
        except subprocess.TimeoutExpired:
            timeouts.append(label)
            print(f'CAUGHT WITH TIMEOUT: {label}', flush=True)
print(f'{len(MUTATIONS) - len(survivors)}/{len(MUTATIONS)} mutations caught; {len(timeouts)} caught with timeout')
print(f'{len(seen & names)}/{len(names)} tests seen failing; unproven: {sorted(names - seen)}')
for label in survivors:
    print(f'NOT CAUGHT: {label}')
raise SystemExit(1 if survivors or names - seen else 0)
