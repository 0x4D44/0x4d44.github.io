"""Mutation checks for motion, including proof that every motion test failed once.

usage: python3 -I -u kings-cross-src/tools/mutation/motion.py kings-cross-src .scratch/motion-mutations
Only temporary copies inside the supplied scratch directory are changed. The tests run in a copy of the package
with the real node_modules linked in; the unmodified copy must pass each command first, every failing test must
fail by assertion, and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py).
"""
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)

# Each mutation is valid TypeScript and changes an observable motion rule.
M = [
    ('cancel expiry follows render phase instead of observation time', 'else if (t && t.fadeAt === undefined) t.fadeAt = observedAtMs;', 'else if (t && t.fadeAt === undefined) t.fadeAt = now;'),
    ('future observation overbrightens fading body', 'Math.min(1, Math.max(0, 1 - (now - t.fadeAt) / (fadeSeconds * 1000)))', 'Math.max(0, 1 - (now - t.fadeAt) / (fadeSeconds * 1000))'),
    ('future opposing authorities ignored', 'const opposing = opposingClearance(t.route, other);', 'const opposing = Infinity;'),
    ('unsafe late opposing authority accepted', 'opposingClearance(route, other) + EPS < (t.speed * t.speed + other.speed * other.speed) / (2 * braking)', 'false'),
    ('merge reservation ignored', 'if (merge && merge.winner !== t &&', 'if (false && merge && merge.winner !== t &&'),
    ('unsafe late merge authority accepted', "if (reservation === null) { issue(t, a.berth, 'merge conflict is inside service braking distance'); return false; }", 'if (false) return false;'),
    ('withdrawn merge reservation retained', 'for (const pairs of merges.values()) pairs.delete(t);', 'for (const pairs of merges.values()) void pairs;'),
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
    ('cancel pops immediately', 'else if (t && t.fadeAt === undefined) t.fadeAt = observedAtMs;', 'else if (t) active.delete(description);'),
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
    ('audit ignores distance under reported speed', 'if (!cabReversal && odometerDelta < minimumTravelM)', 'if (false)'),
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

MOTION_TEST = 'core/tests/motion.test.ts'
AUDIT_TEST = 'tools/tests/motion-audit.test.mjs'

cases = [('core/motion.ts', label, old, new) for label, old, new in M] + [('tools/motion-audit.ts', label, old, new) for label, old, new in A]
tally = kxmut.Tally()
with kxmut.workspace(src, scratch, 'motion') as work:
    suite = kxmut.Suite(work, test_timeout_ms=15000, timeout=30)
    test_names = suite.baseline([MOTION_TEST]).passed | suite.baseline([AUDIT_TEST]).passed
    for file, label, old, new in cases:
        test = AUDIT_TEST if file.startswith('tools/') else MOTION_TEST
        try:
            with kxmut.mutated(work / file, [(old, new)]):
                verdict, _run = suite.judge([test], strict=True)
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
status = tally.finish()
unproven = test_names - tally.red
print(f'{len(test_names) - len(unproven)}/{len(test_names)} tests observed failing at least once')
for name in sorted(unproven):
    print('  NEVER FAILED: ' + name)
(scratch / 'round9-mutation-report.txt').write_text(
    f'{len(tally.caught)}/{len(cases)} mutations caught by assertions\n'
    + ''.join(f'  NOT CAUGHT: {label}\n' for label in tally.survived)
    + ''.join(f'  ERROR: {label}: {why}\n' for label, why in tally.errors)
    + ''.join(f'  NEVER FAILED: {name}\n' for name in sorted(unproven)))
sys.exit(1 if status or unproven else 0)
