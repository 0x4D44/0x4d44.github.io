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
    ('inverse proceed polarity ignored', 'for (const proceedValue of [0, 1] as const) {\n      const trainCycles', 'for (const proceedValue of [1] as const) {\n      const trainCycles'),
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
    ('time split replaced by row-count split', ': startMs + (endMs - startMs) / 2 };', ': (rows[Math.floor(rows.length / 2)]?.t ?? startMs) };'),
    ('fold guard bands bypassed', 'if (!inFold(row.t - windows.beforeMs, fold) || !inFold(row.t + (windows.routeAfterMs ?? windows.afterMs), fold)) {\n      steps.excludedAtEdges', 'if (false) {\n      steps.excludedAtEdges'),
    ('training upper fold edge inclusive', 'end: bounds.splitMs, inclusiveEnd: false', 'end: bounds.splitMs, inclusiveEnd: true'),
    ('clearing may occur outside approach window', 'cycle.clear >= passage.t - windows.beforeMs && ', ''),
    ('danger may return before passage', 'cycle.danger >= passage.t - (windows.earlyMs ?? 0) && ', ''),
    ('danger may return outside window', 'cycle.danger <= passage.t + windows.afterMs', 'true'),
    ('one cycle supports repeated passages', '!used.has(i) &&', 'true &&'),
    ('four-star descriptions count as trains', "if (e.kind !== 'step') continue;\n    if (e.descr === NOT_A_TRAIN) {", "if (e.kind !== 'step') continue;\n    if (false) {"),
    ('duplicate step filter disabled', 'if (seenSteps.has(key)) {', 'if (false) {'),
    ('incomplete step filter disabled', "steps.ignoredNotATrain += 1; continue; }\n    if (!e.descr || !e.from || !e.to || e.from === e.to) {", "steps.ignoredNotATrain += 1; continue; }\n    if (false) {"),
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
    ('whole day validation silently uses halves', "const validation = options.validation ?? 'halves';", "const validation = 'halves';"),
    ('whole day input chronology ignored', 'sessions.sort((a, b) => a[0]!.t - b[0]!.t);', ''),
    ('whole day overlap validation omitted', "if (sessions.some((rows, i) => i > 0 && sessions[i - 1]!.at(-1)!.t >= rows[0]!.t))", 'if (false)'),
    ('unknown validation scheme accepted', "if (validation !== 'halves' && validation !== 'last-recording')", 'if (false)'),
    ('held out day introduces candidates', 'const train = to === undefined ? passages.training : passages.training.filter(p => p.to === to);', 'const train = to === undefined ? [...passages.training, ...passages.heldOut] : passages.training.filter(p => p.to === to);'),
    ('unchanged checkpoint becomes a new bit observation', 'previous[change.address] === undefined ||', 'true ||'),
    ('checkpoint corrections keep stale cycle history', 'bitValue(previous[change.address]!, change.bit) !== change.to', 'false'),
    ('default clearing window truncates a long approach', 'beforeMs: 240_000', 'beforeMs: 180_000'),
    ('default clearing window admits unbounded history', 'beforeMs: 240_000', 'beforeMs: 600_000'),
    ('revalidation changes incumbent status from held out evidence', 'return { ...hypothesis, training: { ...hypothesis.training }, heldOut };', "return { ...hypothesis, training: { ...hypothesis.training }, heldOut, status: 'unknown' };"),
    ('revalidation ignores incumbent polarity', 'cyclesFor(changes, hypothesis.proceedValue, fold)', 'cyclesFor(changes, hypothesis.proceedValue === 1 ? 0 : 1, fold)'),
    ('revalidation treats route hypotheses as proceed', "const kind = hypothesis.kind === 'route' ? 'route' : 'proceed';", "const kind = 'proceed';"),
    ('revalidation ignores fixed route destination', 'passage.to === hypothesis.to));', 'true));'),
    ('revalidation accepts four-star descriptions', 'if (e.descr === NOT_A_TRAIN) continue;', 'if (false) continue;'),
    ('revalidation admits duplicate steps', 'if (seenSteps.has(key)) continue;', 'if (false) continue;'),
    ('revalidation admits incomplete steps', 'if (!e.descr || !e.from || !e.to || e.from === e.to) continue;', 'if (false) continue;'),
    ('revalidation admits steps on held out fold edges', 'if (!inFold(row.t - windows.beforeMs, fold) || !inFold(row.t + (windows.routeAfterMs ?? windows.afterMs), fold)) continue;', 'if (false) continue;'),
    # The leave-one-recording-out analysis repeats the step filters and the polarity loop of the halves analysis.
    ('leave-one-out inverse proceed polarity ignored', 'for (const proceedValue of [0, 1] as const) {\n        const cycles = train.flatMap', 'for (const proceedValue of [1] as const) {\n        const cycles = train.flatMap'),
    ('leave-one-out fold guard bands bypassed', 'if (!inFold(row.t - windows.beforeMs, fold) || !inFold(row.t + (windows.routeAfterMs ?? windows.afterMs), fold)) { steps.excludedAtEdges', 'if (false) { steps.excludedAtEdges'),
    ('leave-one-out four-star descriptions count as trains', "if (e.kind !== 'step') continue;\n      if (e.descr === NOT_A_TRAIN) {", "if (e.kind !== 'step') continue;\n      if (false) {"),
    ('leave-one-out incomplete step filter disabled', "steps.ignoredNotATrain += 1; continue; }\n      if (!e.descr || !e.from || !e.to || e.from === e.to) {", "steps.ignoredNotATrain += 1; continue; }\n      if (false) {"),
    ('leave-one-out duplicate step filter disabled', 'if (seen.has(key)) { steps.duplicates += 1; continue; }', 'if (false) { steps.duplicates += 1; continue; }'),
    # Leave-one-recording-out admission, session splitting and restart checkpoints.
    ('every held-out session passes its own recall and precision', 'return (e.trials < MIN_SUPPORT || (e.recall ?? 0) >= MIN_PRECISION) &&\n    (e.support + e.unmatchedCycles < MIN_SUPPORT || (e.precision ?? 0) >= MIN_PRECISION);', 'return true;'),
    ('held-out session recall is not required', 'return (e.trials < MIN_SUPPORT || (e.recall ?? 0) >= MIN_PRECISION) &&\n    (e.support', 'return (e.support'),
    ('held-out session precision is not required', '(e.support + e.unmatchedCycles < MIN_SUPPORT || (e.precision ?? 0) >= MIN_PRECISION);', 'true;'),
    ('fold selection forced true', 'selected: candidates(pool.filter(o => o !== s)).get(c.key)?.unique === true,', 'selected: true,'),
    ('nested admission sees the session it scores', 'const inner = admit(everyone.filter(s => s !== r));', 'const inner = admit(everyone);'),
    ('restart continuity forced false', 'const continuous = lastReceipt !== undefined && row.t - lastReceipt <= SESSION_GAP_MS;', 'const continuous = false;'),
    ('restart continuity forced true', 'const continuous = lastReceipt !== undefined && row.t - lastReceipt <= SESSION_GAP_MS;', 'const continuous = true;'),
    ('malformed snapshot wipes byte history', 'if (picture === undefined) result.state = {}; else result.rejectedMessages += 1;', '{ result.state = {}; if (picture !== undefined) result.rejectedMessages += 1; }'),
    ('recording sessions ignore receipt gaps', 'if (previous === undefined || row.t - previous > gapMs) sessions.push([]);', 'if (previous === undefined) sessions.push([]);'),
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
