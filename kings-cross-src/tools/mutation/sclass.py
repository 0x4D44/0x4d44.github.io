"""Synthetic S-class semantic mutation proof.

Usage: python3 -I -u tools/mutation/sclass.py <kings-cross-src> <repo/.scratch/dir>
Only core is copied into a run-owned temporary directory below supplied scratch.
An assertion failure kills a mutation; compile errors, crashes and timeouts do not.
"""
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if '.scratch' not in scratch.parts:
    sys.exit('Scratch must be below the repository .scratch directory')
scratch.mkdir(parents=True, exist_ok=True)

MUTATIONS = [
    ('inverse proceed polarity ignored', 'for (const proceedValue of [0, 1] as const)', 'for (const proceedValue of [1] as const)'),
    ('constant initial bits hidden', 'if (from !== to) transitions.push', 'if (from !== to && (from !== null || to !== 0)) transitions.push'),
    ('lookup whole byte used instead of bit', 'bitValue(byte, h!.bit) === h!.proceedValue', 'byte === h!.proceedValue'),
    ('refresh bytes reversed', 'offset * 2, offset * 2 + 2', '(width - 1 - offset) * 2, (width - offset) * 2'),
    ('bits numbered from MSB', '((byte >> bit) & 1)', '((byte >> (7 - bit)) & 1)'),
    ('malformed byte validation disabled', "!(width === 1 ? /^[\\da-f]{2}$/i : /^[\\da-f]{8}$/i).test(e.data ?? '')", 'false'),
    ('address overflow accepted', 'if (first + width - 1 > 0xffff)', 'if (false)'),
    ('foreign byte area accepted', "e.kind !== 'sclass' || e.area !== area ||", "e.kind !== 'sclass' || false ||"),
    ('receipt sorting reversed', '.sort((a, b) => a.t - b.t)', '.sort((a, b) => b.t - a.t)'),
    ('initial observations treated as clearings', 'clear.from !== null && ', ''),
    ('held out oracle bypassed', 'else if (!qualifies(hypothesis.heldOut))', 'else if (false)'),
    ('minimum support reduced', 'const MIN_SUPPORT = 3;', 'const MIN_SUPPORT = 2;'),
    ('precision threshold reduced', 'const MIN_PRECISION = 0.8;', 'const MIN_PRECISION = 0.6;'),
    ('precision exact threshold rejected', 'evidence.precision >= MIN_PRECISION', 'evidence.precision > MIN_PRECISION'),
    ('time split replaced by row-count split', 'splitMs: startMs + (endMs - startMs) / 2', 'splitMs: (rows[Math.floor(rows.length / 2)]?.t ?? startMs)'),
    ('fold guard bands bypassed', 'if (!inFold(row.t - windows.beforeMs, fold) || !inFold(row.t + (windows.routeAfterMs ?? windows.afterMs), fold))', 'if (false)'),
    ('training upper fold edge inclusive', 'end: bounds.splitMs, inclusiveEnd: false', 'end: bounds.splitMs, inclusiveEnd: true'),
    ('clearing may occur outside approach window', 'cycle.clear >= passage.t - windows.beforeMs && ', ''),
    ('danger may return before passage', 'cycle.danger >= passage.t - (windows.earlyMs ?? 0) && ', ''),
    ('danger may return outside window', 'cycle.danger <= passage.t + windows.afterMs', 'true'),
    ('one cycle supports repeated passages', '!used.has(i) &&', 'true &&'),
    ('four-star descriptions count as trains', 'if (e.descr === NOT_A_TRAIN)', 'if (false)'),
    ('duplicate step filter disabled', 'if (seenSteps.has(key))', 'if (false)'),
    ('incomplete step filter disabled', "if (!e.descr || !e.from || !e.to || e.from === e.to)", 'if (false)'),
    ('training bit ambiguity ignored', 'other.berth === hypothesis.berth && other.kind === hypothesis.kind && other.to === hypothesis.to || ', ''),
    ('training berth ambiguity ignored', '(other.address === hypothesis.address && other.bit === hypothesis.bit)', 'false'),
    ('held-out data chooses among training bits', 'other !== hypothesis &&\n      (other.berth', 'other !== hypothesis && qualifies(other.heldOut) && qualifies(hypothesis.heldOut) &&\n      (other.berth'),
    ('lookup missing bytes invented as danger', 'state[h.address] : undefined', '(state[h.address] ?? 0) : undefined'),
    ('lookup ambiguous table uses first entry', 'decoded.length === 1 && !shared', 'decoded.length >= 1'),
    ('lookup unvalidated evidence accepted', 'qualifies(h.training) && qualifies(h.heldOut)', 'true'),
    ('lookup byte range unchecked', 'Number.isInteger(byte) && byte >= 0 && byte <= 255', 'true'),
    ('false clearings omitted from precision', 'support / cycles.length', 'support / passages.length'),
    ('recall silently becomes precision', 'recall: passages.length ? support / passages.length : null', 'recall: cycles.length ? support / cycles.length : null'),
    ('receipt jitter disallowed', 'passage.t - (windows.earlyMs ?? 0)', 'passage.t'),
    ('route release treated as proceed', 'kind === \'proceed\'\n        ?', 'true\n        ?'),
    ('route release may be too late', 'cycle.danger <= passage.t + (windows.routeAfterMs ?? windows.afterMs)', 'true'),
    ('route candidates can light lamps', "(h.kind === undefined || h.kind === 'proceed') && ", ''),
    ('occupancy rising after passage counts as clearing', 'cycle.clear <= passage.t &&', 'true &&'),
    ('recordings use one global fold', 'const sessions = recordings.map(events =>', 'const sessions = [recordings.flat()].map(events =>'),
    ('recording states leak across gaps', 'const traces = sessions.map(rows => trackSclass(rows, anchors.area));', 'const traces = [trackSclass(sessions.flat(), anchors.area)];'),
    ('snapshot byte reset omitted', 'result.state = {};', 'void 0;'),
    ('snapshot resets become changes', 'danger.from !== null && ', ''),
    ('snapshot malformed state accepted', "!/^[\\da-f]{2}$/i.test(value)", 'false'),
    ('window validation disabled', "throw new Error('Signal windows must be positive finite durations')", 'void 0'),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=8000', 'core/tests/sclass.test.ts'],
                          cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30)


def assertion_failures(output):
    # Require a named failed test whose diagnostics explicitly identify a strict
    # assertion, not merely a test runner failure caused by a parser/runtime error.
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - (sclass: rule[^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION", block, re.M):
            failures.add(name[1])
    return failures

killed = 0
observed = set()
survivors = []
with tempfile.TemporaryDirectory(prefix='sclass-mutations-', dir=scratch) as temporary:
    work = Path(temporary)
    shutil.copytree(src / 'core', work / 'core')
    path = work / 'core/sclass.ts'
    original = path.read_text()
    baseline = run(work)
    if baseline.returncode:
        print(baseline.stdout + baseline.stderr)
        sys.exit('Baseline must pass before mutation testing')
    expected = set(re.findall(r'^ok \d+ - (sclass: rule.+)$', baseline.stdout, re.M))
    total = re.search(r'^# tests (\d+)$', baseline.stdout, re.M)
    if total is None or len(expected) != int(total[1]):
        sys.exit('Baseline TAP incomplete or duplicate test names; cannot prove every test red')
    print(f'Baseline: {len(expected)} tests passed', flush=True)
    for label, old, new in MUTATIONS:
        if original.count(old) != 1:
            survivors.append(label)
            print(f'[INVALID] {label}: expected exactly one source pattern, found {original.count(old)}', flush=True)
            continue
        path.write_text(original.replace(old, new, 1))
        try:
            result = run(work)
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[INVALID] {label}: timeout', flush=True)
            continue
        failed = assertion_failures(result.stdout)
        complete = re.search(r'^# tests (\d+)$', result.stdout, re.M)
        named_failures = set(re.findall(r'^not ok \d+ - (sclass: rule.+)$', result.stdout, re.M))
        if failed and failed == named_failures and complete and int(complete[1]) == len(expected) and not result.stderr:
            killed += 1
            observed.update(failed)
            print(f'[KILLED] {label}', flush=True)
            for name in sorted(failed):
                print(f'  {name}', flush=True)
        else:
            survivors.append(label)
            print(f'[SURVIVED/INVALID] {label}', flush=True)
            if result.returncode:
                print(result.stdout + result.stderr, flush=True)

print(f'\n{killed}/{len(MUTATIONS)} mutations caught; {len(observed & expected)}/{len(expected)} tests observed fail')
for name in sorted(expected - observed):
    print(f'NEVER RED: {name}')
for label in survivors:
    print(f'NOT CAUGHT: {label}')
sys.exit(1 if survivors or expected - observed else 0)
