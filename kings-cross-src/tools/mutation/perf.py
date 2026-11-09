"""Mutate the pure perf helpers in private copies; no Chrome or real data required.

python3 -I -u kings-cross-src/tools/mutation/perf.py kings-cross-src .scratch/perf-mutations

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first,
and a load or crash error is an ERROR, not a kill (tools/mutation/lib/kxmut.py).

Two things must hold for the driver to exit 0: every mutation is caught, and every test of tools/tests/perf.test.mjs is seen failing
BY AN ASSERTION under at least one of them (a test that only ever throws, or never fails, is unproven). The report names, for each
test, the first mutation that turned it red.
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
TEST = 'tools/tests/perf.test.mjs'
mutations = [
    # ---- the CPU profile aggregation and its Markdown
    ('missing timing becomes fabricated zero', "gap('sample-time-unavailable',", "sampledUs += 1000; gap('sample-time-unavailable',"),
    ('timing gaps silently disappear', "entry.count++; gaps.set(code, entry);", "entry.count++;"),
    ('timed totals lose valid samples', 'sampledUs += us;', 'sampledUs += 0;'),
    ('all samples count as timed', 'timedSampleCount++;', 'timedSampleCount += samples.length;'),
    ('source mapping loses measured cost', 'if (location) mappedUs += us;', 'if (location) mappedUs += 0;'),
    ('missing frame loses its gap', "gap('call-frame-unavailable',", "gap('wrong-code',"),
    ('unknown node loses its gap', "gap('sample-node-unavailable',", "gap('wrong-code',"),
    ('missing source location loses its gap', "gap('source-position-unavailable',", "gap('wrong-code',"),
    ('unmatched deltas silently disappear', "gap('unmatched-time-deltas',", "gap('wrong-code',"),
    ('no samples loses its gap', "gap('samples-unavailable',", "gap('wrong-code',"),
    ('partial profile looks complete', "gaps.size ? 'partial' : 'complete'", "gaps.size ? 'complete' : 'complete'"),
    ('missing timing looks like measured zero', 'sampledMs: timedSampleCount ? sampledUs / 1000 : null', 'sampledMs: timedSampleCount ? sampledUs / 1000 : 0'),
    ('Markdown omits profile gaps', 'cpu.gaps.map(gap =>', '[].map(gap =>'),
    ('Markdown omits source table', '(cpu?.byOriginalSourceFile ?? []).slice(0, 15)', '[].slice(0, 15)'),

    # ---- the headroom run's flags and constants (test: "the headroom run uses exactly the two flags that lift the frame limit")
    ('the headroom run loses the frame-rate-limit flag', "Object.freeze(['--disable-gpu-vsync', '--disable-frame-rate-limit'])", "Object.freeze(['--disable-gpu-vsync'])"),
    ('the flag list can be edited by accident', 'export const UNCAPPED_FLAGS = Object.freeze([', 'export const UNCAPPED_FLAGS = (['),
    ('the headroom target drifts from 60 FPS', 'export const HEADROOM_FPS_TARGET = 60;', 'export const HEADROOM_FPS_TARGET = 30;'),
    ('a control that did not speed up passes as uncapped', 'export const UNCAPPED_CONTROL_RATIO = 1.5;', 'export const UNCAPPED_CONTROL_RATIO = 1;'),

    # ---- were the flags effective? (test: "flags that did nothing are reported, not mistaken for headroom")
    ('exactly the required speed-up is no longer enough', 'controlUncapped >= controlCapped * UNCAPPED_CONTROL_RATIO', 'controlUncapped > controlCapped * UNCAPPED_CONTROL_RATIO'),
    ('a dead capped control counts as proof', 'finiteNumber(controlCapped) && controlCapped > 0 && ', 'finiteNumber(controlCapped) && '),
    ('flags that did nothing leave no gap', 'if (!flagsEffective) gaps.push(', 'if (false) gaps.push('),
    ('the headline ignores whether the flags worked', 'valid: flagsEffective && rows.length > 0 && rows.every(', 'valid: rows.length > 0 && rows.every('),

    # ---- the headroom figures (test: "headroom is the uncapped median FPS over the 60 FPS target, beside the capped figure")
    ('headroom is read from the p5 FPS', 'roundTo(median / HEADROOM_FPS_TARGET, 2)', 'roundTo(p5 / HEADROOM_FPS_TARGET, 2)'),
    ('the frame cost is read from the p5 FPS', 'roundTo(1000 / median, 3)', 'roundTo(1000 / p5, 3)'),
    ('the capped and uncapped controls are swapped', 'control: { cappedFps: controlCapped ?? null, uncappedFps: controlUncapped ?? null }', 'control: { cappedFps: controlUncapped ?? null, uncappedFps: controlCapped ?? null }'),
    ('the best camera sets the headline', 'Math.min(...headrooms)', 'Math.max(...headrooms)'),

    # ---- what makes the headroom invalid (test: "a missing camera, a missing run or a software renderer makes the headroom invalid")
    ('a camera with no uncapped run vanishes without a gap', 'if (!u) { gaps.push(`${name}: no uncapped measurement.`); continue; }', 'if (!u) { continue; }'),
    ('a software renderer counts as valid', 'rows.every(row => row.realMetal && finiteNumber(row.headroom))', 'rows.every(row => finiteNumber(row.headroom))'),
    ('a software renderer is not flagged', 'else if (!rows.every(row => row.realMetal)) gaps.push(', 'else if (false) gaps.push('),
    ('no camera measured leaves no gap', 'if (!rows.length) gaps.push(', 'if (false) gaps.push('),
    ('no measurement looks like zero headroom', 'worstHeadroom: headrooms.length ? Math.min(...headrooms) : null', 'worstHeadroom: headrooms.length ? Math.min(...headrooms) : 0'),
    ('an unmeasured camera has zero headroom', 'roundTo(median / HEADROOM_FPS_TARGET, 2) : null,', 'roundTo(median / HEADROOM_FPS_TARGET, 2) : 0,'),

    # ---- against the baseline run (test: "the baseline comparison is the uncapped median now over then, per camera")
    ('the baseline comparison is then over now', 'roundTo(row.uncappedMedianFps / before, 3)', 'roundTo(before / row.uncappedMedianFps, 3)'),
    ('a zero baseline is divided by', 'before <= 0 || ', 'before < 0 || '),
    ('every camera is compared with the baseline\'s first camera', 'const before = baseline?.cameras?.[name]?.uncappedMedianFps;', 'const before = Object.values(baseline?.cameras ?? {})[0]?.uncappedMedianFps;'),
    ('the best ratio is the worst', 'Math.min(...ratios)', 'Math.max(...ratios)'),
    ('no comparison looks like a ratio of zero', 'worstRatio: ratios.length ? Math.min(...ratios) : null', 'worstRatio: ratios.length ? Math.min(...ratios) : 0'),

    # ---- the headroom Markdown (test: "the Markdown says whether the headroom is valid and lists each camera")
    ('an invalid headroom reads as valid', "headroom.valid ? 'valid' : 'NOT VALID'", "headroom.valid ? 'valid' : 'valid'"),
    ('Markdown omits the headroom gaps', '...headroom.gaps.map(gap =>', '...[].map(gap =>'),
    ('Markdown lists only the first camera', '...Object.entries(headroom.cameras).map(([name, row])', '...Object.entries(headroom.cameras).slice(0, 1).map(([name, row])'),
    ('Markdown omits the baseline comparison', '...(headroom.vsBaseline ? [', '...(false ? ['),
    ('an unmeasured headroom prints nothing', 'if (!headroom) return [`${title}: not measured (uncapped run skipped).`, \'\'];', 'if (!headroom) return [];'),
    ('the station table loses its own title', 'return [`${title} (uncapped,', 'return [`Headroom (uncapped,'),

    # ---- the relay route's forwarding (test: "the relay route forwards everything, and only a window set on it changes the recording")
    ('the route claims paths outside /relay', "if (requestUrl.pathname !== '/relay' && !requestUrl.pathname.startsWith('/relay/')) return false;", ''),
    ('a window set on the route is ignored', '&& replayWindow.startMs != null;', '&& false;'),
    ('the window also rewrites the other relay routes', "requestUrl.pathname === '/relay/recording' &&", "requestUrl.pathname.startsWith('/relay/') &&"),
    ('a recording the relay does not have is windowed', 'if (!windowed || relayResponse.statusCode !== 200) {', 'if (!windowed) {'),
    ('the relay\'s response headers are dropped', 'res.writeHead(relayResponse.statusCode ?? 502, relayResponse.headers);', 'res.writeHead(relayResponse.statusCode ?? 502);'),
    ('the query string is not forwarded', 'target.search = requestUrl.search;', "target.search = '';"),
    ('the windowed recording loses its length', "'cache-control': 'no-store', 'content-length': body.length", "'cache-control': 'no-store'"),
    ('the windowed recording can be cached', "'cache-control': 'no-store', ", ''),

    # ---- the relay route's 502 (test: "the relay route answers 502 when the relay is down or its recording is not a recording")
    ('a relay that is down answers 500', "if (!res.headersSent) res.writeHead(502); res.end('relay unavailable');", "if (!res.headersSent) res.writeHead(500); res.end('relay unavailable');"),
    ('a recording that cannot be restarted answers 200', "res.writeHead(502); res.end('recording could not be restarted at the peak');", "res.writeHead(200); res.end('recording could not be restarted at the peak');"),

    # ---- first train visible (test: "first train visible: cold and warm, from the startup loads, and whether the replay started at its peak")
    ('a given peak does not start at the peak', "peak?.mode === 'scan' || peak?.mode === 'given'", "peak?.mode === 'scan'"),
    ('every replay is said to start at its peak', "startsAtPeak: peak?.mode === 'scan' || peak?.mode === 'given'", 'startsAtPeak: true'),
    ('cold and warm are swapped', 'cold: pick(startup?.coldFreshProfile), warm: pick(startup?.warmSecondLoadSameProfile)', 'cold: pick(startup?.warmSecondLoadSameProfile), warm: pick(startup?.coldFreshProfile)'),
    ('the headline stops at the scene, not at the first train', 'ms: timing.navigationStartToReplayTrainsRenderedMs ?? null,', 'ms: timing.navigationStartToSceneRenderedMs ?? null,'),
    ('a load that was not measured looks measured', 'waitForRecordedTravelMs: timing.phases?.firstTrainContentDelayMs ?? null,\n  } : null;', 'waitForRecordedTravelMs: timing.phases?.firstTrainContentDelayMs ?? null,\n  } : {};'),

    # ---- the peak and sweep Markdown (test: "the peak and sweep Markdown say where the replay started and list every camera ...")
    ('the peak start and its clock are swapped', 'the replay starts at ${peak.startISO} (clock ${peak.startMs})', 'the replay starts at ${peak.startMs} (clock ${peak.startISO})'),
    ('the peak window is in the wrong unit', 'fixed(peak.windowMs / 60000)', 'fixed(peak.windowMs / 1000)'),
    ('the scan summary is omitted', '...(peak.scan ? [', '...(false ? ['),
    ('a replay that starts at the beginning is described as a peak', "if (!peak || peak.mode === 'none') return [", 'if (!peak) return ['),
    ('the sweep header counts the busy cameras as the steady ones', '${summary.steadyAt60} of ${summary.cameras} cameras steady at 60 FPS', '${summary.busy} of ${summary.cameras} cameras steady at 60 FPS'),
    ('the grid views are not labelled', "${c.view?.grid ? ' (grid view)' : ''}", ''),
    ('a camera that is not steady reads as steady', "flag === false ? 'NO'", "flag === false ? 'yes'"),
    ('the steady and at-peak columns are swapped', '${yes(c.steady60)} | ${yes(c.busy)} |', '${yes(c.busy)} | ${yes(c.steady60)} |'),
    ('the p95 column shows the p50', '${fixed(c.frameDistribution.p95)}', '${fixed(c.frameDistribution.p50)}'),
    ('the slow frame share is not a percentage', 'fixed(c.frameDistribution.slowShare * 100, 2)', 'fixed(c.frameDistribution.slowShare, 2)'),
    ('the sweep lists only the first camera', '...rows.map(([name, c]) =>', '...rows.slice(0, 1).map(([name, c]) =>'),
    ('an empty sweep prints nothing', 'if (!rows.length) return [`${title}: not measured.`, \'\'];', 'if (!rows.length) return [];'),

    # ---- the re-export chunk (test: "a re-export chunk Rollup gave no source map is left unmapped; ...")
    ('a build with no source maps is accepted', 'if (!scripts.some((script) => script.mapped)) return {', 'if (false) return {'),
    ('a declared map that is missing is no longer refused', 'missing: scripts.filter((script) => !script.mapped && script.declared)', 'missing: scripts.filter((script) => false)'),
    ('a re-export chunk is refused like a broken build', 'missing: scripts.filter((script) => !script.mapped && script.declared)', 'missing: scripts.filter((script) => !script.mapped)'),
    ('a re-export chunk is not recorded', 'facades: scripts.filter((script) => !script.mapped && !script.declared).map((script) => script.file),', 'facades: [],'),
]

tally = kxmut.Tally()
asserted = {}  # test name -> labels of the mutations that made it fail BY AN ASSERTION, in the order they ran
with kxmut.workspace(src, scratch, 'perf') as work:
    suite = kxmut.Suite(work, test_timeout_ms=20000, timeout=30)
    baseline = suite.baseline([TEST])
    for label, old, new in mutations:
        try:
            # unique: an anchor that matched two places would mutate the first one, which may not be the one the label names
            with kxmut.mutated(work / 'tools/perf.mjs', [(old, new)], unique=True):
                verdict, run = suite.judge([TEST], strict='any')
        except kxmut.StalePattern as error:
            tally.stale(label, error)
            continue
        tally.record(label, verdict)
        if verdict.kind == kxmut.KILLED:
            for failure in run.failures:
                if failure.assertion:
                    asserted.setdefault(failure.name, []).append(label)
status = tally.finish()
unproven = baseline.passed - set(asserted)
lines = []
for name in sorted(baseline.passed):
    labels = asserted.get(name, [])
    lines.append(f'  {"RED  " if labels else "NEVER"} {name}' + (f'\n         first red under: {labels[0]} (and {len(labels) - 1} more)' if labels else ''))
summary = (f'{len(tally.caught)}/{len(mutations)} caught; survivors: {tally.survived + [e[0] for e in tally.errors]}; '
           f'tests seen failing by an assertion: {len(baseline.passed) - len(unproven)}/{len(baseline.passed)}; unproven: {sorted(unproven)}')
print('\n'.join(lines))
print(summary)
(scratch / 'report.txt').write_text('\n'.join(lines) + '\n' + summary + '\n')
sys.exit(1 if status or unproven else 0)
