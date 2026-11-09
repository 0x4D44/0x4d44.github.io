"""Run isolated synthetic CLI/report mutations; only named assertion failures count.
Usage: python3 -I -u tools/mutation/sclass-cli.py <kings-cross-src> <worktree/.scratch>
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
scratch.mkdir(parents=True, exist_ok=True)
MUTATIONS = [
    ('false cycles omitted from micro precision', 'n + h.heldOut.support + h.heldOut.unmatchedCycles', 'n + h.heldOut.support'),
    ('micro recall becomes precision', 'recall: trials ? support / trials : null', 'recall: cycles ? support / cycles : null'),
    ('decoded kind filter ignored', "(!kind || h.kind === kind)", 'true'),
    ('unknown hypotheses included in totals', "h.status === 'decoded' && (!kind || h.kind === kind)", '(!kind || h.kind === kind)'),
    ('route evidence passed to renderer as proceed', 'layer.setTable(analysis);', "layer.setTable({ ...analysis, hypotheses: analysis.hypotheses.map(h => ({ ...h, kind: 'proceed' })) });"),
    ('missing renderer bytes invented', 'Object.entries(bytes).map', "Object.entries({ '10': 0, ...bytes }).map"),
    ('final available picture ignored', 'layer.apply({ t: 0,', 'if (false) layer.apply({ t: 0,'),
    ('validation option bypassed', 'analyseSclassRecordings(events, anchors, { validation: args.validation })', 'analyseSclassRecordings(events, anchors)'),
    ('baseline comparison omitted', 'const before = baseline ? metrics(baseline, countHeads(baseline, anchors, overlay, track, analysis.trace.state)) : null;', 'const before = null;'),
    ('provenance digest fabricated', "createHash('sha256').update(bytes).digest('hex')", "'0'.repeat(64)"),
    ('provenance byte length wrong', 'bytes: bytes.length, sha256:', 'bytes: bytes.length + 1, sha256:'),
    ('runtime hypotheses omitted', 'const runtime = { ...analysis, currentStates: states, comparison, provenance };', 'const runtime = { ...analysis, hypotheses: undefined, currentStates: states, comparison, provenance };'),
    ('publication always refused', 'publish: reasons.length === 0', 'publish: false'),
    ('precision regression allowed', 'after.precision < before.precision', 'false'),
    ('decoded head regression allowed', 'if (headsAfter < headsBefore)', 'if (false)'),
    ('supported mapping loss allowed', 'if (dropped.some(h => h.goodHeldOut))', 'if (false)'),
    ('loss explanation omitted', "replacement?.reason || 'No unique qualifying training association in the expanded training span'", "replacement?.reason || ''"),
    ('unsupported mapping falsely retained', 'goodHeldOut: good', 'goodHeldOut: true'),
    ('weak held-out candidate allowed', '!qualifiesSignalEvidence(h.heldOut)', 'false'),
    ('route gains hide proceed precision regression', 'if (oldProceed !== null && (newProceed === null || newProceed < oldProceed))', 'if (false)'),
    ('open current day used', 'date >= today', 'date > today'),
    ('shared recordings directory ignored', "options.recordingsDir ?? path.join(dataDir, 'recordings')", "path.join(dataDir, 'recordings')"),
    ('non-Y9 analysis silently uses KX overlay', "if (area !== 'Y9') throw new Error(`area-specific overlay and track are required for ${area}`);", "if (false) throw new Error(`area-specific overlay and track are required for ${area}`);"),
    ('KX anchors override leaks to non-Y9 relearn', 'isY9 ? process.env.KX_ANCHORS : undefined', 'process.env.KX_ANCHORS'),
    ('KX table override leaks to non-Y9 relearn', 'isY9 ? process.env.KX_SCLASS : undefined', 'process.env.KX_SCLASS'),
    ('closed files unsorted', '}).sort();', '});'),
    ('foreign area selected', '!name.startsWith(prefix)', 'false'),
    ('invalid calendar day selected', "return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10).replaceAll('-', '') === date;", 'return true;'),
    ('latest complete day wrongly named', "const validationDay = names.at(-1)?.slice(`td-${area}-`.length, -7) ?? null;", "const validationDay = names[0]?.slice(`td-${area}-`.length, -7) ?? null;"),
    ('relearn skips publication', 'if (decision?.publish && candidate)', 'if (false)'),
    ('baseline kept with stale stored held-out score', 'hypotheses: revalidateSignalHypotheses(validationRows, current.hypotheses,\n        { area, windows: candidate.windows })', 'hypotheses: current.hypotheses'),
    ('backup stores candidate instead of incumbent', 'await copyFile(file, backup, constants.COPYFILE_EXCL);', 'await atomicJson(backup, candidate);'),
    ('history forgets decoded bits', "bits: active?.hypotheses.filter(h => h.status === 'decoded').length ?? 0", 'bits: 0'),
    ('history forgets decoded heads', 'heads: report.published ? decision!.headsAfter : decision?.headsBefore ?? (report.incumbent as { heads: number } | undefined)?.heads ?? null', 'heads: 0'),
    ('history marks publication as refused', 'published: report.published, reasons: report.reasons', 'published: false, reasons: report.reasons'),
    ('insufficient completed day refusal omitted', "report.reasons = ['Need at least two completed UTC recordings: earlier days for learning and latest completed day for validation'];", 'report.reasons = [];'),
    ('lock refusal unexplained', "throw new Error('S-class relearn already locked; inspect .sclass-relearn.lock before retrying')", "throw new Error('failed')"),
    ('failed daily candidate published anyway', 'if (decision?.publish && candidate)', 'if (candidate)'),
    ('events outside closed UTC filename accepted', "if (rows.some(row => new Date(row.t).toISOString().slice(0, 10).replaceAll('-', '') !== day))", 'if (false)'),
    ('on demand dispatch bypassed', "if (process.argv[2] === '--relearn')", 'if (false)'),
]


def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=15000', 'tools/tests/sclass.test.mjs'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=40)


def completed(output, expected):
    names = re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


survivors = []
observed = set()
killed = 0
with tempfile.TemporaryDirectory(prefix='sclass-cli-mutation-', dir=scratch) as temporary:
    # Preserve the production package-under-repository layout used by the CLI guard and tests.
    work = Path(temporary) / 'kings-cross-src'
    work.mkdir()
    for directory in ['core', 'web', 'tools']:
        shutil.copytree(src / directory, work / directory)
    for name in ['package.json', 'package-lock.json']:
        shutil.copy2(src / name, work / name)
    (work / 'node_modules').symlink_to(src / 'node_modules', target_is_directory=True)
    target = work / 'tools/sclass.ts'
    original = target.read_text()
    baseline = run(work)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout + baseline.stderr)
        sys.exit('Baseline must pass before mutation testing')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not completed(baseline.stdout, expected):
        sys.exit('Incomplete or duplicate baseline TAP')
    print(f'Baseline: {len(expected)} tests passed', flush=True)
    for label, old, new in MUTATIONS:
        expected_count = 2 if label in ['provenance digest fabricated', 'provenance byte length wrong'] else 1
        if original.count(old) != expected_count:
            survivors.append(label)
            print(f'[INVALID] {label}: source pattern count {original.count(old)}', flush=True)
            continue
        target.write_text(original.replace(old, new))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[INVALID] {label}: timeout', flush=True)
            continue
        failed = assertion_failures(result.stdout)
        named = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
        runtime_error = re.search(r'SyntaxError|TypeError|ReferenceError|ERR_MODULE_NOT_FOUND|ERR_TEST_TIMEOUT|ETIMEDOUT', result.stdout + result.stderr)
        if result.returncode and failed and failed == named and completed(result.stdout, expected) and not result.stderr and not runtime_error:
            killed += 1
            observed.update(failed)
            print(f'[KILLED] {label}', flush=True)
            for name in sorted(failed):
                print(f'  {name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label}\n{result.stdout}{result.stderr}', flush=True)

print(f'{killed}/{len(MUTATIONS)} mutations caught; {len(observed & expected)}/{len(expected)} tests observed fail', flush=True)
for name in sorted(expected - observed):
    print(f'NEVER RED: {name}')
for label in survivors:
    print(f'NOT CAUGHT: {label}')
sys.exit(1 if survivors or expected - observed else 0)
