"""Synthetic board mutations; only named TAP assertion failures count.
Usage: python3 -I -u tools/mutation/board.py <kings-cross-src> <worktree/.scratch>
Copies the board projection, its synthetic tests and the tiny shared graph core.
"""
import os
import re
import signal
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

src = Path(sys.argv[1]).resolve()
scratch = Path(sys.argv[2]).resolve()
F = 'web/src/board.ts'
M = [
    ('reverse-directed stop t ignored', [
        ('const t = s.edge.a === stop.from ? stop.t : 1 - stop.t;', 'const t = stop.t;'),
    ]),
    ('B berth platform fallback omitted', [
        ("const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? '')) ?? namedPlatform(train.lastBerth);",
         "const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? ''));"),
    ]),
    ('moving platform target ignored', [
        ("const target = anchorPlatform(byBerth.get(train.targetBerth ?? '')) ?? namedPlatform(train.targetBerth);",
         'const target = undefined;'),
    ]),
    ('withheld boundary continuation ignored', [
        ("const continuation = /Boundary continuation north from (\\w+):/.exec(u.detail);",
         "const continuation = /Boundary continuation north from NEVER:/.exec(u.detail);"),
    ]),
    ('curved rail distance ignored', [
        ('const path = shortestPath(graph, from!, to!);', 'const path = null;'),
    ]),
    ('departure retention boundary shortened', [
        ('nowMs - r.leftAtMs! <= retentionMs', 'nowMs - r.leftAtMs! < retentionMs'),
    ]),
    ('missing standing train called a departure', [
        ("!train && old.state === 'departing'", '!train'),
    ]),
    ('sample platform rows omitted', [
        ("sample: mode === 'sample'", 'sample: false'),
    ]),
    ('renderer leaves feed values unescaped', [
        ("value.replace(/[&<>\"']/g", 'value.replace(/[&]/g'),
    ]),
    ('simulation rewind retains dwell history', [
        ('options.previous?.mode === mode && options.previous.timeMs <= nowMs ? options.previous : undefined',
         'options.previous?.mode === mode ? options.previous : undefined'),
    ]),
    ('narrow board does not start collapsed', [
        ('let collapsed = narrow.matches, chosen = false, html = \'\';', "let collapsed = false, chosen = false, html = '';"),
    ]),
    ('board top overlaps the page controls', [
        ('.kx-board{position:fixed;top:52px;left:16px;', '.kx-board{position:fixed;top:0px;left:16px;'),
    ]),
    ('timetable enrichment omitted', [
        ('if (!service) return;', 'if (true) return;'),
    ]),
    ('matched departure identity discarded', [
        ('const service = old ? services.find(s => sameCall(s, old)) ?? old', 'const service = false ? services.find(s => sameCall(s, old!)) ?? old'),
    ]),
    ('due window excluded', [
        ('bookedMs <= nowMs + 30 * 60_000', 'bookedMs < nowMs + 30 * 60_000'),
    ]),
    ('sample allowed timetable', [
        ("(mode === 'live' || mode === 'replay') && options.services !== undefined", 'options.services !== undefined'),
    ]),
    ('TRUST identity projection omitted', [
        ("if (!service) return [...services];", 'return [...services];'),
    ]),
    ('TRUST fallback uses actual time', [
        ('matchService(e.headcode, e.plannedMs, candidates)', 'matchService(e.headcode, e.actualMs as number, candidates)'),
    ]),

]

M.extend([('station names keep screaming capitals', [("name.trim().toLocaleLowerCase('en-GB')", 'name.trim()')]),
 ('operator names remain codes', [("GR: 'LNER'", "GR: 'GR'")]),
 ('Due includes excluded train classes',
  [('if (/^[035]/.test(service.headcode)) continue;', 'if (false) continue;')]),
 ('Due includes nonpublic directions', [('if (!publicTime) continue;', 'if (false) continue;')]),
 ('Due state ignores eight call cap', [('due: due.slice(0, 8)', 'due')]),
 ('Due HTML ignores eight call cap', [('rows.due.slice(0, 8).map', 'rows.due.map')]),
 ('booked public time ignored',
  [("(publicTime(service, direction) ?? (direction === 'arrival' ? service.arrival : "
    'service.departure))',
    "(direction === 'arrival' ? service.arrival : service.departure)")]),
 ('empty stock leaks depot name',
  [("stockCall(service, direction) ? 'empty stock'",
    'stockCall(service, direction) ? (service.destinationName || service.destination)')]),
 ('future actual exposed early', [('finite(actual) && actual <= nowMs ?', 'finite(actual) ?')]),
 ('positive variation lacks plus',
  [("rt.variationMinutes > 0 ? '+' : ''", "rt.variationMinutes > 0 ? '' : ''")]),
 ('on time zero variation hidden',
  [("rt.variationMinutes === 0 ? 'on time'", "rt.variationMinutes === 0 ? ''")]),
 ('compact board rows become tall', [('line-height:20px', 'line-height:40px')]),
 ('Due shown before platforms',
  [('<h2>Platforms 0–10</h2>${platformRows}${rows.timetable ? `<h2>Due in next 30 minutes</h2>${due}` : '
    "''}",
    "${rows.timetable ? `<h2>Due in next 30 minutes</h2>${due}` : ''}<h2>Platforms "
    '0–10</h2>${platformRows}')])])

FM = [
    ('missing TRUST receive time ignores the replay clock', [("receivedAtMs: options.mode === 'replay' ? atMs : now()", 'receivedAtMs: 0')]),
    ('live TRUST SSE listener omitted', [("current.addEventListener('trust', (event) => {", "current.addEventListener('ignored-trust', (event) => {")]),
    ('London schedule date uses UTC', [("timeZone: 'Europe/London'", "timeZone: 'UTC'")]),
    ('replay imports live actuals', [("doc.calls.map(call => ({ ...call, realtime: null }))", 'doc.calls')]),
    ('buffered TRUST replay omitted', [('for (const row of observed) calls = applyBoardTrust(calls, row.event);', 'for (const row of []) calls = calls;')]),
    ('missing timetable retry too slow', [('calls ? 60_000 : Math.min(5_000 * 2 ** Math.max(0, misses - 1), 300_000)', '60_000')]),
    ('schedule host gate omitted', [('disposed || !relayReachable(options.hostname)', 'disposed')]),
    ('schedule dispose leaves timer', [('dispose(): void { disposed = true; abort.abort(); if (timer !== undefined) unschedule(timer); }', 'dispose(): void { disposed = true; abort.abort(); }')]),
]
M.append(('stale TRUST overwrites newer fact', [('e.receivedAtMs < s.realtime.updatedAtMs', 'false')]))
M.extend([
    ('operator column truncates names', [('max-width:92px', 'max-width:60px')]),
    ('approach uses platform row renderer', [('rows.approaching.map(approachHtml)', "rows.approaching.map(r => trainHtml(r, '', rows.timeMs))")]),
    ('approach distance rounds to whole kilometres', [('(distanceM / 1000).toFixed(1)', '(distanceM / 1000).toFixed(0)')]),
    ('approach origin becomes destination', [('stationName(row.service.originName || row.service.origin)', 'stationName(row.service.destinationName || row.service.destination)')]),
    ('approach fabricates unknown platform', [("if (!sorted.length) return 'P?';", "if (!sorted.length) return 'P0';")]),
    ('approach stock exposes depot', [("stockCall(row.service, 'arrival') ? 'empty stock'", "stockCall(row.service, 'arrival') ? row.service.originName || row.service.origin")]),
    ('approach route tooltip unescaped', [('<div class="kx-board-approach" title="${escape(title)}">', '<div class="kx-board-approach" title="${title}">')]),
    ('approach facts lose fixed columns', [('grid-template-columns:32px 12px 56px 56px minmax(0,1fr)', 'grid-template-columns:32px 12px minmax(0,1fr)')]),
    ('approach platform candidates overflow cell', [('full.length > 10', 'full.length > 100')]),
    ('approach tooltip hides full platform candidates', [('platformTooltip = platformRangeLabel(candidates)', 'platformTooltip = platformLabel(candidates)')]),
    ('approach direction arrow omitted', [('<span class="kx-board-arrow">→</span>', '<span class="kx-board-arrow"></span>')]),
    ('departure uses platform row renderer', [('departureHtml(r, rows.timeMs)', "trainHtml(r, '', rows.timeMs)")]),
    ('departure facts lose fixed columns', [('grid-template-columns:32px 28px 12px 42px minmax(0,1fr)', 'grid-template-columns:32px 28px minmax(0,1fr)')]),
    ('departure clock creeps with current time', [('validClock(row.leftAtMs) ? clock(row.leftAtMs)', 'validClock(row.leftAtMs) ? clock(nowMs)')]),
    ('departure exposes future actual', [('validClock(actual) && actual <= nowMs ?', 'validClock(actual) ?')]),
])
MUTATIONS = [(F, label, changes) for label, changes in M] + [('web/src/feed.ts', label, changes) for label, changes in FM]


def run(work):
    command = ['node', '--test', '--test-reporter=tap', '--test-timeout=5000', 'web/tests/board.test.ts']
    proc = subprocess.Popen(command, cwd=work, text=True, stdin=subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    expired = False
    try:
        out, err = proc.communicate(timeout=12)
    except subprocess.TimeoutExpired:
        expired = True
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        out, err = proc.communicate(timeout=3)
    return subprocess.CompletedProcess(command, proc.returncode, out, err), expired or 'testTimeoutFailure' in out


def assertion_failures(output):
    failures = set()
    for block in re.split(r'(?=^not ok \d+ - )', output, flags=re.M)[1:]:
        block = re.split(r'^(?:ok \d+ - |# Subtest:|1\.\.)', block, maxsplit=1, flags=re.M)[0]
        name = re.match(r'not ok \d+ - ([^\n]+)', block)
        if name and re.search(r"^\s+code: ['\"]?ERR_ASSERTION(?:['\"]|$)", block, re.M):
            failures.add(name[1])
    return failures


def complete_tests(output, expected):
    names = re.findall(r'^(?:ok|not ok) \d+ - ([^\n]+)$', output, re.M)
    total = re.search(r'^# tests (\d+)$', output, re.M)
    return total is not None and int(total[1]) == len(expected) and len(names) == len(expected) and set(names) == expected


if not scratch.is_relative_to(src.parent / '.scratch'):
    raise SystemExit('mutation output must be beneath the worktree .scratch')
scratch.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='board-mutation-', dir=scratch))
survivors = []
timeouts = []
failed_tests = set()
try:
    for directory in ['core', 'web/src', 'web/tests']:
        (root / directory).mkdir(parents=True, exist_ok=True)
    for name in ['anchors.ts', 'graph.ts', 'geo.ts', 'schedule.ts']:
        shutil.copy2(src / 'core' / name, root / 'core' / name)
    shutil.copy2(src / F, root / F)
    shutil.copy2(src / 'web/src/feed.ts', root / 'web/src/feed.ts')
    shutil.copy2(src / 'web/tests/board.test.ts', root / 'web/tests/board.test.ts')
    shutil.copy2(src / 'package.json', root / 'package.json')
    (root / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
    originals = {name: (src / name).read_text() for name in [F, 'web/src/feed.ts']}
    baseline, expired = run(root)
    if baseline.returncode or baseline.stderr or expired:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('Baseline failed')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not complete_tests(baseline.stdout, expected):
        raise SystemExit('Baseline TAP output is incomplete; cannot prove every test fails once')
    for filename, label, replacements in MUTATIONS:
        for name, original in originals.items():
            (root / name).write_text(original)
        changed = originals[filename]
        for old, new in replacements:
            if old not in changed:
                raise SystemExit(f'Mutation pattern missing: {label}: {old}')
            changed = changed.replace(old, new, 1)
        (root / filename).write_text(changed)
        try:
            result, expired = run(root)
            assertion_names = assertion_failures(result.stdout)
            named_failures = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
            if expired:
                timeouts.append(label)
                print(f'[TIMEOUT] {label}', flush=True)
            elif result.returncode and assertion_names and assertion_names == named_failures and complete_tests(result.stdout, expected) and not result.stderr:
                failed_tests.update(assertion_names)
                print(f'[CAUGHT] {label}: {", ".join(sorted(assertion_names))}', flush=True)
            else:
                survivors.append(label)
                print(f'[SURVIVED] {label} (survived or invalid TAP/runtime result)', flush=True)
                if result.returncode:
                    print(result.stdout[-1500:], result.stderr[-1000:])
        except subprocess.TimeoutExpired:
            timeouts.append(label)
            print(f'[TIMEOUT] {label} (timeout is not a kill)', flush=True)
    print(f'{len(MUTATIONS) - len(survivors) - len(timeouts)}/{len(MUTATIONS)} mutations caught; {len(timeouts)} timeouts; {len(failed_tests & expected)}/{len(expected)} tests observed red')
    for label in survivors:
        print('NOT CAUGHT:', label)
    for name in sorted(expected - failed_tests):
        print('NEVER RED:', name)
    if survivors or timeouts or expected - failed_tests:
        raise SystemExit(1)
finally:
    shutil.rmtree(root)
