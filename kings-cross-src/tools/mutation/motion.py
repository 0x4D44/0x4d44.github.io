"""Mutation checks for motion, including proof that every motion test failed once.

usage: python3 -I -u kings-cross-src/tools/mutation/motion.py kings-cross-src .scratch/motion-mutations
Only temporary copies inside the supplied scratch directory are changed.
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
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

# Each mutation is valid TypeScript and changes an observable motion rule.
M = [
    ('terminating trains touch the buffers', 'opts.bufferClearanceM ?? DEFAULT_BUFFER_CLEARANCE_M', 'opts.bufferClearanceM ?? 0'),
    ('buffer clearance walks toward the buffers', 'continuation(pos, -dir, bufferClearance)', 'continuation(pos, dir, bufferClearance)'),
    ('short buffer edge loses the arrival facing', 'dir: -direction(last)', 'dir: direction(last)'),
    ('tail speed restriction is ignored', 'Math.min(cap, bodyCap, t.estimateSpeed ?? Infinity)', 'Math.min(cap, t.estimateSpeed ?? Infinity)'),
    ('tail restriction ignores zone boundaries inside a long edge', 'const cuts = zoneCuts(s);', 'const cuts = [s.fromT, s.toT];'),
    ('invalid buffer clearance accepted', '!Number.isFinite(bufferClearance) || bufferClearance < 0', 'false'),
    ('acceleration doubled', 'opts.acceleration ?? 0.7', 'opts.acceleration ?? 1.4'),
    ('braking doubled', 'opts.braking ?? 0.6', 'opts.braking ?? 1.2'),
    ('OSM limits ignored', 'maxspeedMps(opts.wayMaxspeed?.get(edge.wayId), defaultSpeed)', 'defaultSpeed'),
    ('held train creeps', 'if (!t.route.length) { t.speed = 0; return; }', 'if (!t.route.length) { t.speed = 0; t.pos = point(t.pos.edge, t.pos.t + 0.00001); return; }'),
    ('cab change moves the wrong end', 't.pos = point(nose.edge, nose.toT);', 't.pos = oldPos;'),
    ('early departure authority dropped', 'if (t.route.length) t.pendingTarget = a;', 'if (t.route.length) delete t.pendingTarget;'),
    ('partner berth reverses early', 'if (t.target.platform !== undefined && !sameStop)', 'if (t.target.platform !== undefined)'),
    ('steps teleport to their target', 'if (a) requestTarget(t, a);', 'if (a) { t.pos = locate(a)!; requestTarget(t, a); }'),
    ('unmapped flag dropped', "t.unmapped = event.to ?? '';", "t.unmapped = '';"),
    ('collision authority ignored', 'if (clear < available)', 'if (false && clear < available)'),
    ('opposing meeting boundary ignored', 'clear = Math.min(clear, Math.max(0, meeting.stop - t.distanceM));', 'clear = clear;'),
    ('overlapping births allowed', 'if (overlapM(t.body, other.body) > EPS) return false;', 'if (false) return false;'),
    ('stars become trains', "event.area !== anchors.area || !event.descr || event.descr === NOT_A_TRAIN", "event.area !== anchors.area || !event.descr || event.descr === 'IMPOSSIBLE'"),
    ('cancel pops immediately', 'else if (t && t.fadeAt === undefined) t.fadeAt = now;', 'else if (t) active.delete(description);'),
    ('quiet timeout disabled', 'now - t.lastSeen >= quietMs', 'false'),
    ('reverse routes accepted on the current edge', '(target.t - start.t) * t.dir >= -EPS', 'true'),
    ('close target bypasses service braking check', 'route.reduce((sum, s) => sum + size(s), 0) + EPS < t.speed * t.speed / (2 * braking)', 'false'),
    ('longer paths preferred', 'len < bestLength', 'len > bestLength'),
    ('station zone cap removed', 'Math.min(cap, stationSpeed) : cap', 'cap : cap'),
    ('platform approach cap removed', 't.target.platform === undefined ? Infinity :', 'true ? Infinity :'),
    ('mph treated as kmh', '? 0.44704 : 1 / 3.6', '? 1 / 3.6 : 1 / 3.6'),
    ('wall clock noise breaks determinism', 'return Math.atan2((b[0] - a[0]) * t.dir, -(b[1] - a[1]) * t.dir);', 'return Math.random();'),
    ('dt validation removed', '!Number.isFinite(dtSeconds) || dtSeconds < 0', 'false'),
    ('reported occupied length wrong', 'occupiedLengthM: t.body.reduce((sum, s) => sum + size(s), 0)', 'occupiedLengthM: 1'),
    ('standing descriptions never renamed', 'if (standing) {', 'if (false && standing) {'),
    ('early interpose creates a second body', 'if (approaching) {', 'if (false && approaching) {'),
    ('existing descriptions cannot join a standing body', 'if (standing) {', 'if (standing && (!t || queued.has(description))) {'),
    ('unknown departures never leave', 'else if (!t.awaitingAnchor) requestExit(t);', 'else if (!t.awaitingAnchor) {}'),
    ('mapped steps cannot interrupt an exit', 't.exiting = false; t.pendingExit = false;', 't.exiting = true; t.pendingExit = false;'),
    ('early exit lost at the last mapped departure anchor', 't.pendingExit = exitAfterAnchor;', 't.pendingExit = false;'),
    ('outside arrivals pop up at their anchor', 'const at = first ? point(first.edge, first.toT) : undefined;', 'const at = stop;'),
    ('known successor history ignored', 'for (const event of opts.observedSteps ?? []) rememberStep(event);', 'for (const event of []) rememberStep(event);'),
    ('other descriptions choose an arrivals route', "const name = event.descr ?? '';", "const name = '';"),
    ('ambiguous successors choose the first platform', 'found.size === 1 ?', 'found.size > 0 ?'),
    ('previously travelled junction turns ignored', '(history?.get(y) ?? 0) - (history?.get(x) ?? 0)', '0'),
    ('different edges permit a hairpin reversal', '!forwardTurn(item.via, item.dir, e, dir)', 'false'),
    ('station buffers count as external boundaries', '!onward.length && !stationBuffer', '!onward.length'),
    ('failed exits fade at internal stops', 'if (!onward.length && !(', 'if (false && !onward.length && !('),
    ('unmapped exits drop the established route to their last anchor', 'const prefix = platform ? [] : t.route.map((s) => ({ ...s }));', 'const prefix: Segment[] = [];'),
    ('estimated approach skips its anchor margin', 'const reserve = Math.max(25, a.errorM);', 'const reserve = 0;'),
    ('unknown interposes cannot enter from a known chain', "if (!a && (event.kind === 'step' || estimates))", "if (!a && event.kind === 'step')"),
    ('estimated arrivals lose their confidence opacity', '(t.estimated ? 0.55 : 1) *', '1 *'),
    ('estimated arrivals are reported as ordinary motion', "t.estimated ? 'estimated' :", "false ? 'estimated' :"),
    ('unmapped departures are not marked estimated', 't.estimated = true; delete t.awaitingAnchor;', 't.estimated = false; delete t.awaitingAnchor;'),
    ('legacy option still performs shared inference', 'const estimates = opts.estimatedMotion !== false;', 'const estimates = true;'),
    ('estimated approaches clear before their mapped authority', 'if (!t.awaitingAnchor && !t.exiting) { t.estimated = false;', 'if (!t.exiting) { t.estimated = false;'),
    ('estimated speed ignores observed median timing', 't.estimateSpeed ?? Infinity', 'Infinity'),
    ('residence samples do not require successive berths', 'previous?.berth === event.from && at > previous.at && at - previous.at <= 600_000', 'previous !== undefined && at > previous.at && at - previous.at <= 600_000'),
    ('outside-network chain authorizes shared inference', 'if (outside.has(next)) return;', 'if (false && outside.has(next)) return;'),
    ('shared inference accepts one witness description', 'names.size < 2', 'names.size < 1'),
    ('shared inference chooses the first ambiguous signal', 'return candidates.size === 1 ? candidates.values().next().value : undefined;', 'return candidates.size > 0 ? candidates.values().next().value : undefined;'),
    ('shared inference chooses a platform endpoint', 'if (a.platform !== undefined) return;', 'if (false && a.platform !== undefined) return;'),
]

# Audit mutations check that bad output is detected, independently of the motion policy.
A = [
    ('audit uses raw platform instead of drawn outline', 'pts: platformDrawingOutline(p, data)', 'pts: p.pts'),
    ('audit loses maximum speed', 'counts.maxSpeedMps = Math.max(counts.maxSpeedMps, train.speed);', 'counts.maxSpeedMps = 0;'),
    ('audit ignores acceleration violations', 'counts.accelerationViolationTicks++;', 'counts.accelerationViolationTicks += 0;'),
    ('audit ignores deceleration violations', 'counts.decelerationViolationTicks++;', 'counts.decelerationViolationTicks += 0;'),
    ('audit ignores occupied-track speed limits', 'if (train.speed > limit + DEFAULTS.speedToleranceMps)', 'if (false)'),
    ('audit ignores drawn-point overspeed', 'counts.pointOverspeedTicks++;', 'counts.pointOverspeedTicks += 0;'),
    ('audit ignores teleports', 'counts.teleportTicks++;', 'counts.teleportTicks += 0;'),
    ('audit ignores backwards movement', 'counts.backwardTicks++;', 'counts.backwardTicks += 0;'),
    ('audit ignores shared track occupancy', 'if (amount <= 0.01) continue;', 'if (true) continue;'),
    ('audit drops alternate profile seconds', 'profileEverySeconds: 1,', 'profileEverySeconds: 2,'),
    ('audit counts a platform cab change as a teleport', 'const cabReversal = reversal &&', 'const cabReversal = false &&'),
    ('audit ignores reversals away from a platform', 'counts.reversalsOutsidePlatform++;', 'counts.reversalsOutsidePlatform += 0;'),
    ('audit suppresses long unexplained holds', 'if (duration > heldBound &&', 'if (false && duration > heldBound &&'),
    ('audit suppresses buffer contact', 'bufferClearance + 0.01 < bufferBound', 'false'),
    ('audit suppresses platform overhang', 'bodyOutside > bodyTolerance', 'false'),
]

def run(work, audit=False):
    return subprocess.run(
        ['node', '--test', '--test-reporter=tap', '--test-timeout=15000',
         'tools/tests/motion-audit.test.mjs' if audit else 'core/tests/motion.test.ts'],
        cwd=work, capture_output=True, text=True, stdin=subprocess.DEVNULL, timeout=30,
    )

def tap_result(result):
    """Return (names, failures, assertion_only) only for a complete TAP run."""
    output = result.stdout
    plan = re.search(r'^1\.\.([0-9]+)$', output, re.M)
    counts = {name: re.search(rf'^# {name} ([0-9]+)$', output, re.M) for name in ('tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo')}
    if not plan or any(value is None for value in counts.values()):
        return None
    numbers = {name: int(value.group(1)) for name, value in counts.items() if value}
    statuses = re.findall(r'^(ok|not ok) ([0-9]+) - (.+)$', output, re.M)
    names = {name for status, _, name in statuses if status == 'ok'}
    failures = {name for status, _, name in statuses if status == 'not ok'}
    if int(plan.group(1)) != numbers['tests'] or len(statuses) != numbers['tests']:
        return None
    if len(names) != numbers['pass'] or len(failures) != numbers['fail']:
        return None
    if numbers['tests'] != numbers['pass'] + numbers['fail'] + numbers['cancelled'] + numbers['skipped'] + numbers['todo']:
        return None
    assertion_only = True
    failed_headers = list(re.finditer(r'^not ok [0-9]+ - .+$', output, re.M))
    for index, header in enumerate(failed_headers):
        end = failed_headers[index + 1].start() if index + 1 < len(failed_headers) else output.find('\n1..', header.end())
        block = output[header.start():end if end >= 0 else len(output)]
        if "code: 'ERR_ASSERTION'" not in block and 'code: ERR_ASSERTION' not in block:
            assertion_only = False
    return names, failures, assertion_only

baseline = run(src)
baseline_tap = tap_result(baseline)
if baseline.returncode or baseline_tap is None or baseline_tap[1]:
    print(baseline.stdout, baseline.stderr)
    raise SystemExit('baseline must pass with complete TAP before mutation')
test_names = baseline_tap[0]
audit_baseline = run(src, True)
audit_tap = tap_result(audit_baseline)
if audit_baseline.returncode or audit_tap is None or audit_tap[1]:
    print(audit_baseline.stdout, audit_baseline.stderr)
    raise SystemExit('audit baseline must pass with complete TAP before mutation')
test_names |= audit_tap[0]
seen_failing = set()
survivors = []
killed = []
invalid_runs = []
originals = {file: (src / file).read_text() for file in ('core/motion.ts', 'tools/motion-audit.ts')}
report = []
def note(message):
    report.append(message)
    print(message, flush=True)

cases = [('core/motion.ts', label, old, new) for label, old, new in M] + [('tools/motion-audit.ts', label, old, new) for label, old, new in A]
for file, label, old, new in cases:
    original = originals[file]
    if old not in original:
        raise SystemExit(f'mutation pattern missing: {label}')
    with tempfile.TemporaryDirectory(prefix='motion-', dir=scratch) as tmp:
        work = Path(tmp)
        audit = file.startswith('tools/')
        if audit:
            # The audit alone is mutated. Reuse read-only dependencies, including Three's
            # package resolution through the real web directory's node_modules ancestor.
            (work / 'core').symlink_to(src / 'core', target_is_directory=True)
            (work / 'web').symlink_to(src / 'web', target_is_directory=True)
            (work / 'tools/tests').mkdir(parents=True)
            shutil.copy2(src / 'tools/tests/motion-audit.test.mjs', work / 'tools/tests/motion-audit.test.mjs')
        else:
            shutil.copytree(src / 'core', work / 'core')
        shutil.copy2(src / 'package.json', work / 'package.json')
        (work / file).write_text(original.replace(old, new, 1))
        try:
            result = run(work, audit)
        except subprocess.TimeoutExpired:
            invalid_runs.append(f'{label}: timeout')
            note(f'[INVALID ] {label} (timeout; not counted as a kill)')
            continue
        parsed = tap_result(result)
        if parsed is None:
            invalid_runs.append(f'{label}: incomplete TAP or syntax/runtime failure')
            note(f'[INVALID ] {label} (incomplete TAP or syntax/runtime failure)')
            continue
        _, failed, assertion_only = parsed
        if result.returncode and failed and assertion_only:
            killed.append(label)
            seen_failing.update(failed)
            note(f'[KILLED ] {label} <- {sorted(failed)[0]}')
        elif result.returncode or failed:
            invalid_runs.append(f'{label}: test failure was not an assertion')
            note(f'[INVALID ] {label} (failure was not an assertion; not counted as a kill)')
        else:
            survivors.append(label)
            note(f'[SURVIVED] {label}')

unproven = test_names - seen_failing
note(f'\n{len(killed)}/{len(cases)} mutations caught by assertions')
note(f'{len(test_names) - len(unproven)}/{len(test_names)} tests observed failing at least once')
for label in survivors:
    note('  NOT CAUGHT: ' + label)
for item in invalid_runs:
    note('  INVALID RUN: ' + item)
for name in sorted(unproven):
    note('  NEVER FAILED: ' + name)
(scratch / 'round9-mutation-report.txt').write_text('\n'.join(report) + '\n')
raise SystemExit(1 if survivors or invalid_runs or unproven else 0)
