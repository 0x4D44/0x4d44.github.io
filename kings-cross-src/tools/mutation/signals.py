"""Synthetic renderer/controller mutations; only named TAP assertion failures count.
Usage: python3 -I -u tools/mutation/signals.py <kings-cross-src> <worktree/.scratch>
Copies the signal renderer, feed/board dependencies, synthetic tests and shared core; links node_modules.
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
F = 'web/src/signals.ts'
B = 'tools/build-signals.ts'
M = [
    ('snapshot picture ignored', [('if (valid) bytes = restored;', 'if (valid) bytes = {};')]),
    ('snapshot stale bytes retained', [('bytes = {};\n        const picture', 'bytes = { ...bytes };\n        const picture')]),
    ('snapshot malformed accepted partially', [('if (valid) bytes = restored;', 'bytes = restored;')]),
    ('snapshot foreign area accepted', [('if (row.e.area !== area) return;', 'if (false) return;')]),
    ('post offset halved', [('side * 2 *', 'side * 1 *')]),
    ('head facing reversed', [('Math.atan2(facing[0], facing[1])', 'Math.atan2(-facing[0], -facing[1])')]),
    ('drawn heads omit resolved facing vector', [('facing: signal.facing ?? [-signal.travel[0], -signal.travel[1]]', 'facing: signal.facing!')]),
    ('unknown lights red', [(' : 0x666666);', ' : 0xff2929);')]),
    ('unknown question hidden', [("questions.get(record)!.visible = record.state === 'unknown';", 'questions.get(record)!.visible = false;')]),
    ('green aspect red', [("? 0x35ff69 :", '? 0xff2929 :')]),
    ('reset retains bytes', [('reset(): void { bytes = {}; refresh(); }', 'reset(): void { refresh(); }')]),
    ('byte updates omitted', [('bytes = updateBytes(bytes, row as TimedTdEvent, area).state;', 'bytes = {};')]),
    ('SG SH ignored', [('bytes = updateBytes(bytes, row as TimedTdEvent, area).state;', "if (row.e.msgType === 'SF') bytes = updateBytes(bytes, row as TimedTdEvent, area).state;")]),
    ('wrong area accepted', [('updateBytes(bytes, row as TimedTdEvent, area)', 'updateBytes(bytes, row as TimedTdEvent, row.e.area)')]),
    ('table area ignored', [('value.area !== area', 'false')]),
    ('new evidence checks ignored', [('return precisionValid && recallValid && legacyConsistent;', 'return true;')]),
    ('unknown evidence rejects whole table', [('return precisionValid && recallValid && legacyConsistent;', "return precisionValid && recallValid && legacyConsistent && v.support >= 3 && typeof v.precision === 'number' && v.precision >= 0.8;")]),
    ('legacy precision mismatch accepted', [('const legacyConsistent = !legacy || (v.unmatchedCycles === v.contradictions &&', 'const legacyConsistent = true || (v.unmatchedCycles === v.contradictions &&')]),
    ('recall mismatch accepted', [('const recallValid = legacy || raw.recall === expectedRecall ||', 'const recallValid = true || raw.recall === expectedRecall ||')]),
    ('held out evidence ignored', [('!evidence(h.heldOut)', 'false'), ('structuredClone(h) as unknown as SignalHypothesis', '({...structuredClone(h), heldOut: h.training}) as unknown as SignalHypothesis')]),
    ('competing candidates picked', [('return result.map((h) => result.some', "return result.filter((h) => h.id !== 'other').map((h) => result.some"), ('other !== h && (', "other.id !== 'other' && other !== h && (")]),
    ('proceed route candidates conflated', [('(other.berth === h.berth && kind(other) === kind(h) && other.to === h.to)', '(other.berth === h.berth)')]),
    ('route hypothesis becomes an aspect', [("const proceed = table.filter((h) => (h.kind ?? 'proceed') === 'proceed');", "const proceed = table.map((h) => ({ ...h, kind: 'proceed' as const }));")]),
    ('foreign refs accepted', [(r'return ref?.match(/^(?:YA\s*)?(\d{4})[A-Z]?$/i)?.[1];', r'return ref?.match(/^(?:[A-Z]{2}\s*)?(\d{4})[A-Z]?$/i)?.[1];')]),
    ('bare and suffix refs ignored', [(r'return ref?.match(/^(?:YA\s*)?(\d{4})[A-Z]?$/i)?.[1];', r'return ref?.match(/^YA\s*(\d{4})$/i)?.[1];')]),
    ('unspecified YA head reuse omitted', [('if (signal.kinds.length === 0 && /^YA', 'if (false && /^YA')]),
    ('explicit non-main YA head promoted', [('if (signal.kinds.length === 0 && /^YA', 'if (true && /^YA'), ("record.signal.kinds.length === 0 && record.mappingSource === 'reference'", "true && record.mappingSource === 'reference'")]),
    ('unspecified bare ref promoted', [(r"/^YA\s*\d{4}[A-Z]?$/i.test(signal.ref ?? '')", "true")]),
    ('unspecified YA decode requirement omitted', [('proceedBerths.has(berth))', 'true)')]),
    ('unspecified duplicate YA refs accepted', [('matches.get(berth) === 1', 'true')]),
    ('unspecified conflicting YA berth accepted', [('(signal.berth === undefined || signal.berth === berth)', 'true')]),
    ('canonical identity requires overlay berth', [('(signal.berth === undefined || signal.berth === osmBerth)', '(signal.berth === osmBerth)')]),
    ('canonical duplicate refs accepted', [('matches.get(osmBerth) === 1', 'true')]),
    ('canonical conflicting berth accepted', [('(signal.berth === undefined || signal.berth === osmBerth)', 'true')]),
    ('undecoded head defaults to danger', [("states[runtimeBerths.get(record) ?? ''] ?? 'unknown'", "states[runtimeBerths.get(record) ?? ''] ?? 'danger'")]),
    ('nearby distance widened', [('Math.hypot(anchor.point[0] - s.edge.point[0], anchor.point[1] - s.edge.point[1]) <= 20', 'Math.hypot(anchor.point[0] - s.edge.point[0], anchor.point[1] - s.edge.point[1]) <= 21')]),
    ('nearby direction omitted', [("(s.direction === 'forward' || s.direction === 'backward')", 'true')]),
    ('nearby heading ignored', [('direction[0] * s.travel[0] + direction[1] * s.travel[1] > .95', 'true')]),
    ('reverse edge order rejected', [('((s.edge.from === anchor.from && s.edge.to === anchor.to) || (s.edge.from === anchor.to && s.edge.to === anchor.from))', '(s.edge.from === anchor.from && s.edge.to === anchor.to)')]),
    ('nearby conflicting berth accepted', [('(s.berth === undefined || s.berth === anchor.berth)', 'true')]),
    ('nearby refs ignored', [('!s.ref || signalRefBerth(s.ref) === anchor.berth', 'true')]),
    ('nearby one-to-many reused', [('proposals.filter(p => p.candidates.includes(candidate!)).length === 1', 'true')]),
    ('mapping source metadata omitted', [('runtimeBerths.set(record, anchor.berth); record.mappingSource = source;', 'runtimeBerths.set(record, anchor.berth); record.mappingSource = undefined;')]),
    ('TD inferred candidates omitted', [('for (const anchor of inferred) {', 'for (const anchor of []) {')]),
    ('TD inferred label omitted', [('position inferred from TD', 'position unavailable')]),
    ('TD inferred post opaque', [('material.opacity = 0.45', 'material.opacity = 1')]),
    ('TD inferred ring omitted', [("ring.name = 'inferred-position'", "ring.name = 'position'" )]),
    ('platform starter left at buffers', [('const starter = platformStarter(anchor, anchorGraph!, ref === undefined ? undefined : platforms.get(ref));', 'const starter = anchor;')]),
    ('missing platform geometry falls back to buffers', [('return starter ? [starter] : [];', 'return starter ? [starter] : [anchor];')]),
    ('platform starter uses south end', [('const north = Math.max(...platform.pts.map(dot));', 'const north = Math.min(...platform.pts.map(dot));')]),
    ('platform starter faces into buffers', [('return { ...anchor, from: behind, to: node, t, point: stop,', 'return { ...anchor, from: node, to: behind, t: 1 - t, point: stop,')]),
    ('platform starter chooses ambiguous fork', [('!onward.length || onward[1] && onward[0]!.alignment - onward[1].alignment < .1', '!onward.length')]),
    ('platform starter accepts underground platform', [('!isSurfacePlatform(platform) || ', '')]),
    ('platform starter rejects long containing edge', [('distance + length * fraction > shape.length + 60', 'distance + length > shape.length + 60')]),
    ('platform starter uses unrelated platform', [('Math.hypot(anchor.point[0] - south[0], anchor.point[1] - south[1]) > 30 || ', '')]),
    ('platform starter ignores lateral divergence', [('lateral < Math.min(...sides) - 10 || lateral > Math.max(...sides) + 10 || ', '')]),
    ('TD route hypotheses create heads', [("const proceedBerths = new Set(table.filter(h => (h.kind ?? 'proceed') === 'proceed' && h.status === 'decoded' &&", "const proceedBerths = new Set(table.filter(h => true && h.status === 'decoded' &&")]),
    ('TD unknown hypotheses create heads', [("h.status === 'decoded' &&\n      qualifiesSignalEvidence(h.training)", "true &&\n      qualifiesSignalEvidence(h.training)")]),
    ('unqualified TD hypotheses create heads', [('qualifiesSignalEvidence(h.training) && qualifiesSignalEvidence(h.heldOut)).map(h => h.berth)', 'true).map(h => h.berth)')]),
    ('duplicate TD anchors create heads', [('privateAnchors!.anchors.filter(other => other?.berth === a.berth).length === 1', 'true')]),
    ('anchor replacement keeps stale head', [('for (const [berth, record] of inferredHeads) if (!inferred.some(a => a.berth === berth)) removeInferred(berth, record);', 'for (const [berth, record] of inferredHeads) if (false) removeInferred(berth, record);')]),
    ('matching TD head is not reused', [('const record = old ?? makeHead(signal, true);', 'const record = makeHead(signal, true);')]),
    ('boards decoded', [("if (signal.kinds.includes('main')", 'if (true'), ("record.state = (record.signal.kinds.includes('main')", 'record.state = (true')]),
    ('topology mapping omitted', [('if (table.length && object(value)', 'if (false && object(value)')]),
    ('far topology mappings accepted', [('m.distanceM <= 40', 'm.distanceM <= 400')]),
    ('ambiguous private mappings accepted', [('mappings.filter((x) => x.signalId === mapping.signalId || x.berth === mapping.berth).length !== 1', 'false')]),
    ('OSM mapping overridden', [('record.signal.ref || record.signal.berth || ', '')]),
    ('404 body accepted', [('response.ok ? await response.json() : null', 'await response.json()')]),
    ('fetch retains stale table', [('const request = ++generation; table = []; reconcilePositions(); refresh();', 'const request = ++generation;')]),
    ('stale request accepted', [('request === generation', 'true')]),
    ('disposed fetch revives state', [('!disposed && request === generation', 'request === generation'), ('if (disposed) return;', 'if (false) return;')]),
    ('groups not detached', [('function removeInferred(berth: string, record: DrawnSignal): void {\n    record.group.removeFromParent();', 'function removeInferred(berth: string, record: DrawnSignal): void {\n    void record.group;')]),
    ('dispose groups not detached', [('for (const record of records) record.group.removeFromParent();', 'for (const record of records) void record.group;')]),
    ('resources not disposed', [('resource.dispose()', 'void resource')]),
    ('builder topology signal anchors omitted', [("if (a.kind !== 'inferred' && !(a.kind === 'signal' && a.evidence.startsWith('Topology'))) return false;", "if (a.kind !== 'inferred') return false;")], B),
    ('builder backward side not flipped', [("(forward ? rawPosition : rawPosition === 'left' ? 'right' : 'left')", 'rawPosition')], B),
    ('builder backward ignored', [("const forward = signal.direction !== 'backward';", 'const forward = true;')], B),
    ('builder side ignored', [("const positionKnown = rawPosition === 'left' || rawPosition === 'right';", 'const positionKnown = false;')], B),
    ('builder foreign refs mapped', [(r'/^YA\s*(\d{4})$/', r'/^[A-Z]+\s*(\d{4})$/')], B),
    ('builder leaks private berth', [('const overlay = { attribution: data.attribution, signals };', "if (options.anchors?.anchors[0]) signals[0]!.berth = options.anchors.anchors[0]!.berth; const overlay = { attribution: data.attribution, signals };")], B),
    ('builder distance widened', [('dist(a.point, s.edge.point) <= 40', 'dist(a.point, s.edge.point) <= 400')], B),
    ('builder one-to-one ignored', [("privateTrials.filter((other) =>\n      other.candidates.some((a) => a.berth === trial.candidates[0]!.berth)).length === 1", 'true')], B),
    ('bridge incorrectly uses a left mast', [("rawPosition === 'bridge' ? 'over-track' :", '')], B),
    ('bridge incorrectly offsets off its rail', [("signal.side === 'over-track' ? 0 :", '')]),
    ('bridge gets an invented mast', [("const post = drawnSignal.side === 'over-track' ? undefined :", 'const post =')]),
    ('uncertain public label hidden', [("? '' : 'uncertain: '", "? '' : ''")]),
    ('uncertain inferred label hidden', [('uncertain position and side', 'position and side')]),
    ('public position review discarded', [('out.positionReview = structuredClone(reviewed);', 'void reviewed;')], B),
    ('stale reviewed point accepted', [('dist(reviewed.point, signal.edge.point) < .01', 'true')], B),
    ('wrong reviewed rail accepted', [('reviewed.wayId === signal.edge.wayId', 'true')], B),
    ('wrong reviewed edge accepted', [('reviewed.from === signal.edge.from', 'true')], B),
    ('reversed reviewed direction accepted', [('reviewed.direction === signal.direction', 'true')], B),
    ('changed raw side keeps review', [('reviewed.rawPosition === rawPosition', 'true')], B),
    ('wrong reviewed side accepted', [('reviewed.side === signal.side', 'true')], B),
    ('bundled public review absent', [('"positionReview":', '"missingReview":')], 'web/src/data/kx-signals.json'),
]

def run(work):
    return subprocess.run(['node', '--test', '--test-reporter=tap', '--test-timeout=20000', 'web/tests/signals.test.ts'], cwd=work,
                          text=True, capture_output=True, stdin=subprocess.DEVNULL, timeout=40)

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


root = Path(tempfile.mkdtemp(prefix='signals-mutation-', dir=scratch))
failed_tests = set()
survivors = []
try:
    shutil.copytree(src / 'core', root / 'core')
    (root / 'web/src').mkdir(parents=True)
    (root / 'web/src/data').mkdir()
    shutil.copy2(src / 'web/src/data/kx-track.json', root / 'web/src/data/kx-track.json')
    for name in ['kx-signals.json', 'kx-signal-review.json']:
        shutil.copy2(src / 'web/src/data' / name, root / 'web/src/data' / name)
    (root / 'web/tests').mkdir(parents=True)
    shutil.copy2(src / 'web/src/board.ts', root / 'web/src/board.ts')
    shutil.copy2(src / 'web/src/feed.ts', root / 'web/src/feed.ts')
    shutil.copy2(src / 'web/tests/signals.test.ts', root / 'web/tests/signals.test.ts')
    (root / 'tools').mkdir()
    shutil.copy2(src / B, root / B)
    shutil.copy2(src / 'package.json', root / 'package.json')
    (root / 'node_modules').symlink_to((src / 'node_modules').resolve(), target_is_directory=True)
    original = (src / F).read_text()
    (root / F).write_text(original)
    baseline = run(root)
    if baseline.returncode or baseline.stderr:
        print(baseline.stdout, baseline.stderr)
        raise SystemExit('Baseline failed')
    expected = set(re.findall(r'^ok \d+ - ([^\n]+)$', baseline.stdout, re.M))
    if not expected or not complete_tests(baseline.stdout, expected):
        raise SystemExit('Baseline TAP output is incomplete; cannot prove every test red')
    for mutation in M:
        label, replacements = mutation[:2]
        target = mutation[2] if len(mutation) > 2 else F
        (root / F).write_text(original)
        (root / B).write_text((src / B).read_text())
        changed = (src / target).read_text()
        for old, new in replacements:
            if old not in changed:
                raise SystemExit(f'Mutation pattern missing: {label}: {old}')
            changed = changed.replace(old, new)
        (root / target).write_text(changed)
        try:
            result = run(root)
            # Every failure must be a named assertion and the entire baseline suite
            # must finish. Mixed runtime/syntax errors and stderr never count as kills.
            assertion_names = assertion_failures(result.stdout)
            named_failures = set(re.findall(r'^not ok \d+ - ([^\n]+)$', result.stdout, re.M))
            if result.returncode and assertion_names and assertion_names == named_failures and complete_tests(result.stdout, expected) and not result.stderr:
                failed_tests.update(assertion_names)
                print(f'[CAUGHT] {label}: {", ".join(sorted(assertion_names))}', flush=True)
            else:
                survivors.append(label)
                print(f'[SURVIVED] {label} (survived or invalid TAP/runtime result)', flush=True)
                if result.returncode: print(result.stdout[-1500:], result.stderr[-1000:])
        except subprocess.TimeoutExpired:
            survivors.append(label)
            print(f'[SURVIVED] {label} (timeout is not a kill)', flush=True)
    print(f'{len(M) - len(survivors)}/{len(M)} mutations caught; {len(failed_tests & expected)}/{len(expected)} tests observed red')
    for label in survivors: print('NOT CAUGHT:', label)
    for name in sorted(expected - failed_tests): print('NEVER RED:', name)
    if survivors or expected - failed_tests: raise SystemExit(1)
finally:
    shutil.rmtree(root)
