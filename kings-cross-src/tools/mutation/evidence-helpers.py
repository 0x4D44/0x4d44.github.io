"""Mutate the helper modules of the evidence and performance tools in private copies; no Chrome, relay or real data required.

python3 -I -u kings-cross-src/tools/mutation/evidence-helpers.py kings-cross-src .scratch/mutation/evidence-helpers [group ...]

Seven groups, each judged by its own tests (a name given after the scratch path runs only the groups it is part of):

  camera-sweep  tools/camera-sweep.mjs  which station cameras the frame-rate sweep runs, and how one pair and several pairs are summarised
  replay-peak   tools/replay-peak.mjs   restarting a recording at an instant, and finding the busiest stretch of a scan
  frame-stats   tools/frame-stats.mjs   the frame-time distribution, its histogram and the steady-at-60 rule
  scene-pin     tools/scene-pin.mjs     the ?time= / ?weather= / ?sky= pin the capture tools put on the page address
  flicker       tools/flicker.mjs       the two-frame flicker metric and its roll-up
  hud           tools/hud.mjs           hiding and restoring the page's overlays; also the page sources whose names its selectors rely on
  evidence      tools/evidence.mjs      the --hud, scoring-view, --views and scene-pin option parts of the pack tool: 13 tests of
                                        tools/tests/evidence.test.mjs, chosen by name (the rest of that file is covered by station-evidence.py
                                        and axis07-browser.py, or by nothing yet)

The tests run in a copy of the package with the real node_modules linked in. The unmodified copy must pass first, and a load or crash error
is an ERROR, not a kill (tools/mutation/lib/kxmut.py).

Two things must hold for the driver to exit 0: every mutation is caught, and every test of the groups run is seen failing BY AN ASSERTION
under at least one mutation (a test that only ever throws, or never fails, is unproven). The report names, for each test, the first mutation
that turned it red. A mutation is a plausible regression of the code under test; each anchor must occur exactly once in its file.

EQUIVALENT, below the tables, holds the one mutation that changes nothing, so no test can catch it. It is not run.
"""
import re
import shutil
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent / 'lib'))
import kxmut

# ---------------------------------------------------------------------------------------------------------------------------------------
# Each mutation is (label, old, new) or (label, old, new, file): `old` becomes `new` once, in the group's own module unless a file (relative
# to the package; '../' is the repository root) is given. The comment above a block says which test it is for.
# ---------------------------------------------------------------------------------------------------------------------------------------

CAMERA_SWEEP = [
    # ---- which cameras are swept, and the lens each is given (tests: "the sweep takes every fixed station camera ...", "--stations: all, none, ...",
    #      "the real station cameras: all 42 are in the sweep ...")
    ('a camera with no lens of its own gets a 55 degree default', 'fov: fov ?? 50', 'fov: fov ?? 55'),
    ('a camera with no lens of its own gets no field of view', 'fov: fov ?? 50', 'fov: fov'),
    ('a camera with no near plane of its own gets 0.2 m', 'near: near ?? .1', 'near: near ?? .2'),
    ('a grid view loses its flag', '...(grid ? { grid: true } : {})', '...({})'),
    ('the long source text reaches the perf report', 'return { name, pos, target, fov: fov ?? 50,', 'return { ...stationCameras[name], name, pos, target, fov: fov ?? 50,'),
    ('the grid cameras are left out of the sweep', 'const names = Object.keys(stationCameras ?? {});', 'const names = Object.keys(stationCameras ?? {}).filter(name => !stationCameras[name].grid);'),
    ('the first camera is left out of the sweep', "const chosen = spec === 'all' ? names :", "const chosen = spec === 'all' ? names.slice(1) :"),
    ('none still sweeps every camera', "if (spec === 'none') return [];", "if (spec === 'none') return sweepCameraList(stationCameras, 'all');"),
    ('a list of names runs in alphabetical order', 'return chosen.map(name => {', 'return [...chosen].sort().map(name => {'),
    ('an unknown camera name is no longer refused', 'const unknown = chosen.filter(name => !names.includes(name));', 'const unknown = [];'),
    ('the unknown names are not listed', "unknown: ${unknown.join(', ') || '(empty name)'}", "unknown: ${'(empty name)'}"),
    ('a camera named twice is swept twice', 'new Set(chosen).size !== chosen.length', 'false'),

    # ---- one pair (test: "one pair: how many cameras held 60 FPS and were measured at the peak, and the worst of each figure")
    ('the slowest camera is the one with the highest median FPS', "worst(camera => camera.fps?.median, 'min')", "worst(camera => camera.fps?.median, 'max')"),
    ('the slowest p99 is the smallest', "worst(camera => camera.frameDistribution?.p99, 'max')", "worst(camera => camera.frameDistribution?.p99, 'min')"),
    ('the most slow frames is read from the p99', "worst(camera => camera.frameDistribution?.slowShare, 'max')", "worst(camera => camera.frameDistribution?.p99, 'max')"),
    ('an empty sweep has a worst figure of zero', '}, null);', '}, { camera: null, value: 0 });'),
    ('the steady count is read from the busy flag', 'steadyAt60: rows.filter(([, camera]) => camera.steady60 === true).length', 'steadyAt60: rows.filter(([, camera]) => camera.busy === true).length'),
    ('the cameras not steady are the steady ones', 'notSteady: rows.filter(([, camera]) => camera.steady60 !== true)', 'notSteady: rows.filter(([, camera]) => camera.steady60 === true)'),
    ('the busy count includes the quiet cameras', 'busy: rows.filter(([, camera]) => camera.busy === true).length', 'busy: rows.filter(([, camera]) => camera.busy !== true).length'),
    ('the quiet cameras are listed as busy', 'notBusy: rows.filter(([, camera]) => camera.busy !== true)', 'notBusy: rows.filter(([, camera]) => camera.busy === true)'),
    ('a throttled page counts as real Metal', 'camera.realMetal === true && camera.rAFThrottleDetected === false', 'camera.realMetal === true'),
    ('software rendering counts as real Metal', 'camera.realMetal === true && camera.rAFThrottleDetected === false', 'camera.rAFThrottleDetected === false'),
    ('an empty sweep is all real Metal', 'rows.length > 0 && rows.every(', 'rows.every('),
    ('a spread starts at its largest value', '{ min: sorted[0], median:', '{ min: sorted.at(-1), median:'),
    ('a spread ends at its smallest value', 'max: sorted.at(-1) } : null;', 'max: sorted[0] } : null;'),
    ('the median of a spread is the mean', 'median: (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2', 'median: sorted.reduce((sum, value) => sum + value, 0) / sorted.length'),
    ('the trains shown spread is of the busiest sample, not the median', 'camera.trainsShown?.median);', 'camera.trainsShown?.max);'),

    # ---- several pairs (tests: "across pairs: per camera, the spread of its median FPS ...", "... a camera missing from a pair ...",
    #      "... reports with no station sweep are ignored, and none at all is null")
    ('a report with an empty sweep counts as a pair', 'report.stationCameras && Object.keys(report.stationCameras).length)', 'report.stationCameras)'),
    ('no sweep at all is an empty sweep', 'if (!swept.length) return null;', 'if (!swept.length) return {};'),
    ('the pair count includes the reports with no sweep', 'pairs: swept.length, cameraCount', 'pairs: reports.length, cameraCount'),
    ('a camera is steady when any pair was', 'steadyEveryPair: everyPair(name) && perPair.every(c => c.steady60 === true)', 'steadyEveryPair: everyPair(name) && perPair.some(c => c.steady60 === true)'),
    ('a camera is busy when any pair was', 'busyEveryPair: everyPair(name) && perPair.every(c => c.busy === true)', 'busyEveryPair: everyPair(name) && perPair.some(c => c.busy === true)'),
    ('a camera missing from a pair is steady in every pair', 'steadyEveryPair: everyPair(name) && perPair', 'steadyEveryPair: perPair'),
    ('a camera missing from a pair is busy in every pair', 'busyEveryPair: everyPair(name) && perPair', 'busyEveryPair: perPair'),
    ('real Metal in every pair reads the throttle flag the wrong way round', 'c.realMetal === true && c.rAFThrottleDetected === false', 'c.realMetal === true && c.rAFThrottleDetected === true'),
    ('one camera in every pair is enough', 'all.every(camera => camera.pairs === swept.length)', 'all.some(camera => camera.pairs === swept.length)'),
    ('one steady camera makes the sweep steady', 'allSteadyAt60: all.every(camera => camera.steadyEveryPair)', 'allSteadyAt60: all.some(camera => camera.steadyEveryPair)'),
    ('the sweep is busy when it is steady', 'allBusy: all.every(camera => camera.busyEveryPair)', 'allBusy: all.every(camera => camera.steadyEveryPair)'),
    ('the sweep is real Metal when it is steady', 'allRealMetal: all.every(camera => camera.realMetalEveryPair)', 'allRealMetal: all.every(camera => camera.steadyEveryPair)'),
    ('the steady cameras are listed as not steady', 'notSteady: names.filter(name => !cameras[name].steadyEveryPair)', 'notSteady: names.filter(name => cameras[name].steadyEveryPair)'),
    ('the busy cameras are listed as not busy', 'notBusy: names.filter(name => !cameras[name].busyEveryPair)', 'notBusy: names.filter(name => cameras[name].busyEveryPair)'),
    ('the worst median FPS is the best', 'worstMedianFps: Math.min(', 'worstMedianFps: Math.max('),
    ('the slowest p99 is the fastest', 'slowestP99FrameMs: Math.max(', 'slowestP99FrameMs: Math.min('),
    ('the replay peak is lost', 'peak: swept[0].replayPeak ?? null', 'peak: null'),
    ('the p99 spread is read from the slow share', 'p99FrameMs: spread(perPair.map(c => c.frameDistribution?.p99))', 'p99FrameMs: spread(perPair.map(c => c.frameDistribution?.slowShare))'),
    ('the slow share spread is read from the p99', 'slowShare: spread(perPair.map(c => c.frameDistribution?.slowShare))', 'slowShare: spread(perPair.map(c => c.frameDistribution?.p99))'),
    ('the trains-shown spread is read from the FPS', 'trainsShownMedian: spread(perPair.map(c => c.trainsShown?.median))', 'trainsShownMedian: spread(perPair.map(c => c.fps?.median))'),
    ('the trains-shown spread is of the quietest sample, not the median', 'trainsShownMedian: spread(perPair.map(c => c.trainsShown?.median))', 'trainsShownMedian: spread(perPair.map(c => c.trainsShown?.min))'),
    ('the median FPS spread is read from the p5', 'medianFps: spread(perPair.map(c => c.fps?.median))', 'medianFps: spread(perPair.map(c => c.fps?.p5))'),
    ('the p5 FPS spread is read from the median', 'p5Fps: spread(perPair.map(c => c.fps?.p5))', 'p5Fps: spread(perPair.map(c => c.fps?.median))'),
    ('the missed slots spread is read from the p99', 'missedSlots: spread(perPair.map(c => c.frameDistribution?.missedSlots))', 'missedSlots: spread(perPair.map(c => c.frameDistribution?.p99))'),
]

REPLAY_PEAK = [
    # ---- which rows come before the instant (tests: "every row before the instant becomes one snapshot ...", "a row stamped exactly at the instant is after it ...")
    ('a row stamped at the instant counts as before it', 'const before = rows.filter(row => row.t < startMs)', 'const before = rows.filter(row => row.t <= startMs)'),
    ('a row stamped at the instant is dropped', 'after = rows.filter(row => row.t >= startMs)', 'after = rows.filter(row => row.t > startMs)'),
    ('the snapshot is stamped at zero', '({ t: startMs, e: snapshotAt(before, area) })', '({ t: 0, e: snapshotAt(before, area) })'),
    ('the snapshot comes after the later rows', '[...snapshots.map(row => JSON.stringify(row)), ...after.map(row => row.line)]', '[...after.map(row => row.line), ...snapshots.map(row => JSON.stringify(row))]'),
    ('the counts of rows before and after are swapped', 'rowsBefore: before.length, rowsAfter: after.length', 'rowsBefore: after.length, rowsAfter: before.length'),
    ('the berth counts are lost', 'berths: Object.fromEntries(snapshots.map(row => [row.e.area, Object.keys(row.e.berths).length])),', 'berths: {},'),
    ('the snapshot has the wrong kind', "return { kind: 'snapshot', area,", "return { kind: 'snap', area,"),
    ('the snapshot loses its area', "return { kind: 'snapshot', area, berths,", "return { kind: 'snapshot', berths,"),

    # ---- the berth picture (tests: "every row before the instant ...", "a row stamped exactly at the instant ... the berth picture follows the page's own rule for cancels",
    #      "a window before the first row changes nothing; one after the last row leaves only the snapshot")
    ('a step does not empty its origin berth', "if (e.kind === 'step' && e.from) berths.delete(e.from);", ''),
    ('a step does not fill its destination', "(e.kind === 'step' || e.kind === 'interpose') && e.to", "e.kind === 'interpose' && e.to"),
    ('an interpose does not fill a berth', "(e.kind === 'step' || e.kind === 'interpose') && e.to", "e.kind === 'step' && e.to"),
    ('a cancel naming another origin still empties the berth', 'owner === e.descr && (!e.from || e.from === berth)', 'owner === e.descr'),
    ('a cancel naming no origin empties nothing', '(!e.from || e.from === berth)', '(e.from === berth)'),
    # (test: "rows out of order are sorted as the page sorts them, and a second TD area gets its own snapshot")
    ('the berth picture of one TD area takes in the other areas', 'if (e.area !== area) continue;', ''),

    # ---- the signal bytes (test: "the signal bytes at the instant ride in the snapshot ...")
    ('signal bytes are written without padding', ".padStart(2, '0')", ".padStart(1, '0')"),
    ('signal bytes are written in decimal', 'value.toString(16)', 'value.toString(10)'),
    ('a snapshot always claims a signal table', '...(addresses ? { sclass: { addresses, data } } : {})', '...({ sclass: { addresses, data } })'),
    ('the signal address count is off by one', 'sclass: { addresses, data }', 'sclass: { addresses: addresses + 1, data }'),

    # ---- the text and the areas (tests: "rows out of order are sorted as the page sorts them ...", "a window before the first row ...")
    ('the recording is not sorted by time', 'return rows.sort((a, b) => a.t - b.t);', 'return rows;'),
    ('the areas are listed in the order they appear', "typeof area === 'string'))].sort();", "typeof area === 'string'))];"),
    ('the text loses its final newline', r"? `${lines.join('\n')}\n` : ''", r"? `${lines.join('\n')}` : ''"),
    ('an empty recording becomes a lone newline', r": '', startMs, areas, rowsBefore", r": '\n', startMs, areas, rowsBefore"),

    # ---- input that is not a recording (test: "input that is not a recording is refused, with the line number")
    ('a row with no numeric time is accepted', '!Number.isFinite(row.t) || ', ''),
    ('a row with no event is accepted', "|| !row.e || typeof row.e !== 'object') throw", ') throw'),
    ('the line number of a bad row is off by one', 'recording line ${index + 1} is not JSON', 'recording line ${index} is not JSON'),
    ('the line number of a row with no time is off by one', 'recording line ${index + 1} has no time and event', 'recording line ${index} has no time and event'),
    ('a window start of NaN is accepted', "if (!Number.isFinite(startMs)) throw new Error('the window start must be a finite replay clock time');", ''),

    # ---- the busiest window (tests: "the busy window is the one that stays busy ...", "a dip inside a window disqualifies it ...",
    #      "a window never runs past the last sample, and the earliest of equal windows wins", "a recording shorter than the window is used whole")
    ('a lone spike beats a plateau', 'const quietest = shown[0], median = lowerQuantile(shown, .5);', 'const quietest = shown.at(-1), median = lowerQuantile(shown, .5);'),
    ('the median decides, not the quietest sample', 'const quietest = shown[0], median', 'const quietest = shown[Math.floor(shown.length / 2)], median'),
    ('the quieter window wins', 'quietest < best.minShown ||', 'quietest > best.minShown ||'),
    ('a window runs past the last sample', 'if (startMs + span > last) break;', ''),
    ('the latest of equal windows wins', 'median <= best.medianShown', 'median < best.medianShown'),
    ('a window leaves out its last sample', 's.clockMs <= startMs + span', 's.clockMs < startMs + span'),
    ('a window leaves out its first sample', 's.clockMs >= startMs && ', 's.clockMs > startMs && '),
    ('the window reports the length asked for', 'windowMs: span, samples: shown.length', 'windowMs, samples: shown.length'),
    ('the window ends where the asked length ends', 'endMs: startMs + span, windowMs', 'endMs: startMs + windowMs, windowMs'),
    # (test: "a recording shorter than the window is used whole": min, lower quartile, median, mean and max of its four samples)
    ('the lower quartile is read from the median', 'p25Shown: lowerQuantile(shown, .25)', 'p25Shown: lowerQuantile(shown, .5)'),
    ('the mean is left at zero', 'meanShown: Number((shown.reduce((sum, value) => sum + value, 0) / shown.length).toFixed(2)),', 'meanShown: 0,'),
    ('the median of an even number of samples is the upper one', 'Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))', 'Math.min(sorted.length - 1, Math.ceil((sorted.length - 1) * p))'),

    # ---- samples that are not measurements (test: "unsorted and non-finite samples are handled, and nothing to measure is null")
    ('nothing to measure is an empty window', 'if (!samples.length) return null;', 'if (!samples.length) return { startMs: 0, endMs: 0, windowMs: 0, samples: 0, busyFloor: 1 };'),
    ('a sample with no clock time is kept', 'Number.isFinite(s?.clockMs) && ', ''),

    # ---- the busy floor and the scan speed (test: "the busy floor is three quarters of the window median, never below one")
    ('the busy floor is half the median', 'export const BUSY_FLOOR_SHARE = .75;', 'export const BUSY_FLOOR_SHARE = .5;'),
    ('the busy floor can be zero', 'Math.max(1, Math.floor(', 'Math.max(0, Math.floor('),
    ('the busy floor ignores the share given', 'Math.floor(floorShare * best.medianShown)', 'Math.floor(BUSY_FLOOR_SHARE * best.medianShown)'),
    ('the scan is no faster than the replay', 'export const SCAN_SPEED = 120;', 'export const SCAN_SPEED = 8;'),
]

FRAME_STATS = [
    # ---- what is a late frame (tests: "a frame exactly on a bin edge belongs to that bin, and exactly 20 ms is not slow", "late frames are counted by the slots they overran ...")
    ('a frame is late past 25 ms', 'export const SLOW_FRAME_MS = 20;', 'export const SLOW_FRAME_MS = 25;'),
    ('a frame of exactly 20 ms is late', 'if (value > slowMs)', 'if (value >= slowMs)'),
    ('the frame budget is 50 Hz', 'export const FRAME_BUDGET_MS = 1000 / 60;', 'export const FRAME_BUDGET_MS = 1000 / 50;'),
    ('a late frame costs one slot too many', 'Math.round(value / budgetMs) - 1', 'Math.round(value / budgetMs)'),
    ('a late frame can cost no slot', 'Math.max(1, Math.round(value / budgetMs) - 1)', 'Math.max(0, Math.round(value / budgetMs) - 1)'),
    ('a late frame of 2.7 slots costs the slots of the one below it, not the nearest', 'Math.round(value / budgetMs) - 1', 'Math.floor(value / budgetMs) - 1'),

    # ---- the histogram (tests: "a clean 60 Hz run ...", "late frames are counted ... and land in the right bins", "a frame exactly on a bin edge ...")
    ('a frame on a bin edge falls in the next bin', 'edges.findIndex(edge => value <= edge)', 'edges.findIndex(edge => value < edge)'),
    ('the last bin is merged into the one before', 'counts[bin < 0 ? edges.length : bin]++', 'counts[bin < 0 ? edges.length - 1 : bin]++'),
    ('the histogram has no overflow bin', 'Array(edges.length + 1).fill(0)', 'Array(edges.length).fill(0)'),
    ('a bin edge moves', '[17.5, 20, 25, 34, 51, 100]', '[17.5, 20, 25, 33, 51, 100]'),

    # ---- which values are frames (test: "values that are not frames are dropped, and an empty run says so with nulls")
    ('zero and negative frame times are frames', 'Number.isFinite(value) && value > 0)', 'Number.isFinite(value))'),
    ('an infinite frame time is a frame', "typeof value === 'number' && Number.isFinite(value) && value > 0", "typeof value === 'number' && value > 0"),
    ('the frame count is the input length', 'frames: values.length,', 'frames: (frameMs ?? []).length,'),
    ('no frames have a slow share of zero', 'roundTo(slowFrames / values.length, 4) : null', 'roundTo(slowFrames / values.length, 4) : 0'),
    ('the slow share is rounded to two places', 'roundTo(slowFrames / values.length, 4)', 'roundTo(slowFrames / values.length, 2)'),

    # ---- the percentiles (tests: "percentiles follow the sorted frames, whatever order they arrive in", "late frames ...: p99")
    ('frame times are sorted as text', '[...values].sort((a, b) => a - b)', '[...values].sort()'),
    ('the median is read from the 60th percentile', 'p50: roundTo(quantile(sorted, .5), 2)', 'p50: roundTo(quantile(sorted, .6), 2)'),
    ('p90 is read from the median', 'p90: roundTo(quantile(sorted, .9), 2)', 'p90: roundTo(quantile(sorted, .5), 2)'),
    ('p99 is read from the 90th percentile', 'p99: roundTo(quantile(sorted, .99), 2)', 'p99: roundTo(quantile(sorted, .9), 2)'),
    ('a percentile index rounds up', 'Math.floor((sorted.length - 1) * p)', 'Math.ceil((sorted.length - 1) * p)'),
    ('the maximum is the smallest frame', 'max: roundTo(sorted.at(-1) ?? null, 2)', 'max: roundTo(sorted[0] ?? null, 2)'),
    ('p95 is read from the median', 'p95: roundTo(quantile(sorted, .95), 2)', 'p95: roundTo(quantile(sorted, .5), 2)'),
    ('p999 is read from the median', 'p999: roundTo(quantile(sorted, .999), 2)', 'p999: roundTo(quantile(sorted, .5), 2)'),

    # ---- steady at 60 (test: "steady at 60 needs the median second at 60 and at most 1% slow frames")
    ('steady needs a median second of only 59', 'fpsMedian >= 60', 'fpsMedian >= 59'),
    ('steady refuses a median second of exactly 60', 'fpsMedian >= 60', 'fpsMedian > 60'),
    ('exactly 1% slow is not steady', 'distribution.slowShare <= STEADY_SLOW_SHARE', 'distribution.slowShare < STEADY_SLOW_SHARE'),
    ('no frames is steady', 'distribution?.slowShare != null && ', ''),
    ('up to 2% slow is steady', 'export const STEADY_SLOW_SHARE = 0.01;', 'export const STEADY_SLOW_SHARE = 0.02;'),
]

SCENE_PIN = [
    # ---- the defaults (tests: "the default pin is midsummer noon in London with a clear sky", "the weather names are the ones the page documents")
    ('the default time is an hour late', "export const PIN_TIME = '2026-06-21T12:00:00+01:00';", "export const PIN_TIME = '2026-06-21T13:00:00+01:00';"),
    ('the default weather is cloudy', "export const PIN_WEATHER = 'clear';", "export const PIN_WEATHER = 'cloudy';"),
    ('a weather name is missing from the list', "'mist', 'fog', 'snow'", "'mist', 'snow'"),
    ('the weather list can be edited', 'export const WEATHER_NAMES = Object.freeze([', 'export const WEATHER_NAMES = (['),

    # ---- what a time may be (test: "a time the page could not read is refused here instead of silently showing the live clock")
    ('an empty time takes the default', 'const t = time ?? PIN_TIME, w = weather ?? PIN_WEATHER;', 'const t = time || PIN_TIME, w = weather ?? PIN_WEATHER;'),
    ('a time needs no zone', r'(Z|[+-]\d{2}:\d{2})$/;', r'(Z|[+-]\d{2}:\d{2})?$/;'),
    ('a ten-digit epoch time is accepted', r'const EPOCH_MS = /^\d{13}$/;', r'const EPOCH_MS = /^\d{10,13}$/;'),
    ('an impossible date is accepted', 'ISO_INSTANT.test(t) && Number.isFinite(Date.parse(t))', 'ISO_INSTANT.test(t)'),
    ('the time error loses its explanation', '--time must be an ISO 8601 instant with a zone', '--time is wrong'),

    # ---- what a weather may be (test: "a weather the page does not know is refused")
    ('an empty weather takes the default', 'const t = time ?? PIN_TIME, w = weather ?? PIN_WEATHER;', 'const t = time ?? PIN_TIME, w = weather || PIN_WEATHER;'),
    ('an unknown weather is accepted', 'if (!WEATHER_NAMES.includes(w)) throw new Error(', 'if (false) throw new Error('),
    ('the weather error loses its list', "--weather must be one of ${WEATHER_NAMES.join(', ')}", '--weather is wrong'),

    # ---- the old look (test: "--sky ref is the old fixed look and excludes a time or a weather")
    ('another sky is accepted', "if (sky !== 'ref') throw new Error(", 'if (false) throw new Error('),
    ('a sky and a time can be combined', 'if (time !== undefined || weather !== undefined) throw', 'if (weather !== undefined) throw'),
    ('a sky and a weather can be combined', 'if (time !== undefined || weather !== undefined) throw', 'if (time !== undefined) throw'),

    # ---- the query (tests: "the zone offset reaches the page as %2B ...", "withPin adds the pin to a query, and leaves a page with a look of its own alone")
    ('the zone offset is sent unencoded', 'time=${encodeURIComponent(pin.time)}', 'time=${pin.time}'),
    ('the old look is sent as another parameter', "'sky=ref' :", "'sky=fixed' :"),
    ('a query that has a question mark gets another one', "query.includes('?') ? '&' : '?'", "query.includes('?') ? '?' : '&'"),
    ('a page with bare=1 gets a pin', '(?:bare|sky|time|weather)=', '(?:sky|time|weather)='),
    ('a page with sky= gets a pin', '(?:bare|sky|time|weather)=', '(?:bare|time|weather)='),
    ('a page with time= gets a pin', '(?:bare|sky|time|weather)=', '(?:bare|sky|weather)='),
    ('a page with weather= gets a pin', '(?:bare|sky|time|weather)=', '(?:bare|sky|time)='),
    ('a parameter that only starts like a look is taken for it', '/[?&](?:bare|sky|time|weather)=/', '/[?&](?:bare|sky|time|weather)/'),
    ('a parameter that only ends like a look (xtime=) is taken for one', '/[?&](?:bare|sky|time|weather)=/', '/(?:bare|sky|time|weather)=/'),

    # ---- was the pin applied (test: "the pin counts as applied only when the page built a sky of its own")
    ('a pinned page is honoured by a page with a fixed sky', "return typeof atmosphere === 'object' && atmosphere !== null;", "return atmosphere !== 'absent';"),
    ('a pinned page is honoured by a null sky', "return typeof atmosphere === 'object' && atmosphere !== null;", "return typeof atmosphere === 'object';"),
    ('the old look is honoured only by an absent sky', "atmosphere === 'absent' || atmosphere === 'fixed'", "atmosphere === 'absent'"),
    ('the old look is honoured by a live sky', "atmosphere === 'absent' || atmosphere === 'fixed'", "atmosphere === 'absent' || atmosphere === 'fixed' || typeof atmosphere === 'object'"),
]

FLICKER = [
    # ---- the documented limits (test: "the documented limits: 8 levels of 255, half a thousandth of the frame")
    ('the pixel threshold is 10 levels', 'export const FLICKER_PIXEL_THRESHOLD = 8;', 'export const FLICKER_PIXEL_THRESHOLD = 10;'),
    ('the fraction limit is a thousandth', 'export const FLICKER_FRACTION_LIMIT = 0.0005;', 'export const FLICKER_FRACTION_LIMIT = 0.001;'),
    ('the gap between the two shots is 100 ms', 'export const FLICKER_GAP_MS = 150;', 'export const FLICKER_GAP_MS = 100;'),

    # ---- a still scene (test: "two identical frames do not flicker")
    ('a still scene reports a difference', 'let differing = 0, maxDelta = 0,', 'let differing = 0, maxDelta = 1,'),
    ('a still scene has a box', 'bbox: differing ? [left, top, right, bottom] : null', 'bbox: [left, top, right, bottom]'),

    # ---- counting and boxing the pixels that moved (test: "changed pixels are counted, boxed and held to the limit")
    ('the colour channels are added', 'delta = Math.max(delta, Math.abs(a.pixels[i + c] - b.pixels[i + c]));', 'delta += Math.abs(a.pixels[i + c] - b.pixels[i + c]);'),
    ('the largest difference is never recorded', 'if (delta > maxDelta) maxDelta = delta;', ''),
    ('the fraction is over the width alone', 'differing / (width * height)', 'differing / width'),
    ('a fraction equal to the limit fails', 'pass: fraction <= limit', 'pass: fraction < limit'),
    ('the box left edge is the rightmost pixel', 'if (x < left) left = x;', 'if (x > left) left = x;'),
    ('the box right edge is the leftmost pixel', 'if (x > right) right = x;', 'if (x < right) right = x;'),
    ('the box top edge is the lowest pixel', 'if (y < top) top = y;', 'if (y > top) top = y;'),
    ('the box bottom edge is the highest pixel', 'if (y > bottom) bottom = y;', 'if (y < bottom) bottom = y;'),

    # ---- the threshold (test: "a change of exactly the threshold is noise, one level more is a difference")
    ('exactly the threshold counts as a difference', 'if (delta <= threshold) continue;', 'if (delta < threshold) continue;'),
    ('the threshold given is ignored', 'if (delta <= threshold) continue;', 'if (delta <= FLICKER_PIXEL_THRESHOLD) continue;'),
    ('the limit given is ignored', 'pass: fraction <= limit', 'pass: fraction <= FLICKER_FRACTION_LIMIT'),
    ('a brighter pixel is not a difference', 'Math.abs(a.pixels[i + c] - b.pixels[i + c])', '(a.pixels[i + c] - b.pixels[i + c])'),

    # ---- the channels (test: "every colour channel counts, the alpha channel does not")
    ('the blue channel is not compared', 'for (let c = 0; c < 3; c++)', 'for (let c = 0; c < 2; c++)'),
    ('the red channel is not compared', 'for (let c = 0; c < 3; c++)', 'for (let c = 1; c < 3; c++)'),
    ('the alpha channel is compared', 'for (let c = 0; c < 3; c++)', 'for (let c = 0; c < 4; c++)'),

    # ---- frames that cannot be compared (test: "frames of different sizes or formats cannot be compared, and bad limits are refused")
    ('frames of different widths are compared', 'a.width !== b.width || ', ''),
    ('frames of different heights are compared', 'a.height !== b.height || ', ''),
    ('frames of different formats are compared', ' || a.channels !== b.channels', ''),
    ('a threshold above 255 is accepted', ' || threshold > 255', ''),
    ('a negative threshold is accepted', ' || threshold < 0', ''),
    ('a fractional threshold is accepted', '!Number.isInteger(threshold) || ', ''),
    ('a limit above 1 is accepted', '!(limit >= 0 && limit <= 1)', '!(limit >= 0)'),
    ('a limit of NaN is accepted', '!(limit >= 0 && limit <= 1)', '(limit < 0 || limit > 1)'),

    # ---- the roll-up (test: "the summary names the cameras that flickered and the worst fraction")
    ('the summary counts the shots it did not check', 'checked: checked.length,', 'checked: records.length,'),
    ('the passing shots are listed as failed', 'checked.filter(r => !r.flicker.pass)', 'checked.filter(r => r.flicker.pass)'),
    ('a failed shot is named by its axis', 'camera: r.file, axis: r.axis,', 'camera: r.axis, axis: r.axis,'),
    ('the worst fraction is the least', 'Math.max(worst, r.flicker.fraction)', 'Math.min(worst, r.flicker.fraction)'),
    ('the summary passes with a failure in it', 'pass: failed.length === 0', 'pass: failed.length >= 0'),
    ('the definition understates the limit', '${FLICKER_FRACTION_LIMIT * 100}%', '${FLICKER_FRACTION_LIMIT * 10}%'),
    ('the summary swaps its threshold and limit', 'threshold: FLICKER_PIXEL_THRESHOLD, limit: FLICKER_FRACTION_LIMIT, checked:', 'threshold: FLICKER_FRACTION_LIMIT, limit: FLICKER_PIXEL_THRESHOLD, checked:'),
]

HUD = [
    # ---- the list, the rule and the note (test: "the overlays are the four things the page draws over the canvas, and the style hides each of them")
    ('the Almanac pill is not hidden', "'body > h1', '#almanac-back-host'])", "'body > h1'])"),
    ('the selector list can be edited', 'export const HUD_SELECTORS = Object.freeze([', 'export const HUD_SELECTORS = (['),
    ('the hiding rule is not important', '{ display: none !important; }', '{ display: none; }'),
    ('the hiding rule joins its selectors with no space', "${selectors.join(', ')} {", "${selectors.join(',')} {"),
    ('the note forgets the labelled overview', 'overview-hud-on and the axis-01 grid views keep them', 'the overview and the axis-01 grid views keep them'),
    ('the note forgets the grid views', 'and the axis-01 grid views keep them', 'and the grid views keep them'),

    # ---- --hud (test: "--hud is on or off, off when not given")
    ('the default mode is on', "if (value === undefined) return 'off';", "if (value === undefined) return 'on';"),
    ('any value is a mode', "if (value === 'on' || value === 'off') return value;", 'if (value) return value;'),
    ('a bad value is taken for off', "throw new Error('--hud must be on or off');", "return 'off';"),

    # ---- the check (test: "hudCheck: off wants every overlay found hidden, on wants every one drawn, and either wants at least one found")
    ('a page with none of the overlays passes the check', 'if (!found.length) problems.push(', 'if (false) problems.push('),
    ('one overlay still drawn is not a problem', "mode === 'off' && row.visible > 0", "mode === 'off' && row.visible > 1"),
    ('an overlay that is fully drawn is a problem', 'row.visible < row.found', 'row.visible <= row.found'),
    ('a still-drawn overlay is reported in other words', '${row.visible} of ${row.found} still drawn', '${row.visible} of ${row.found} remain'),
    ('the hidden list names the drawn overlays', 'hidden: found.filter(row => row.visible === 0)', 'hidden: found.filter(row => row.visible > 0)'),
    ('the shown list names the hidden overlays', 'shown: found.filter(row => row.visible === row.found)', 'shown: found.filter(row => row.visible === 0)'),
    ('the absent list names the found overlays', 'absent: rows.filter(row => row.found === 0)', 'absent: rows.filter(row => row.found > 0)'),
    ('the check is ok with problems', 'ok: problems.length === 0,', 'ok: true,'),

    # ---- hiding, showing and restoring (tests: "a pack capture hides every overlay and puts every one back; --hud on leaves the page alone",
    #      "hiding twice adds one style and showing twice is harmless", "an overlay the style cannot hide fails the capture and puts the page back",
    #      "an overlay the page itself hides fails --hud on, and one that does not come back fails the restore")
    ('the page is not given a frame to draw after the overlays change', "      await settle();\n      const check = hudCheck(mode, rows);", "      const check = hudCheck(mode, rows);"),
    ('the page is not given a frame to draw after the overlays come back', "      await settle();\n      const check = hudCheck('on', rows);", "      const check = hudCheck('on', rows);"),
    ('hiding only looks', "run(mode === 'off' ? 'hide' : 'probe')", "run('probe')"),
    ('a failed check leaves the overlays hidden', "if (!check.ok) { await run('show'); throw new Error(`overlays", "if (!check.ok) { throw new Error(`overlays"),
    ('a failed check says less', 'overlays ${mode} check failed for ${name}', 'overlays ${mode} failed for ${name}'),
    ('the result of hiding lists the shown overlays', "...(mode === 'off' ? { hidden: check.hidden } : { shown: check.shown })", "...(mode === 'off' ? { shown: check.shown } : { hidden: check.hidden })"),
    ('the result claims the page was restored', 'otherOverlays: others, restored: null', 'otherOverlays: others, restored: true'),
    ('restoring overlays that were never hidden does work', "if (mode !== 'off') return true;", ''),
    ('overlays that did not come back go unnoticed', "if (!check.ok) throw new Error(`the page's overlays did not come back", "if (false) throw new Error(`the page's overlays did not come back"),
    ('hiding twice adds a second style', "if (action === 'hide' && !existing) {", "if (action === 'hide') {"),
    ('showing does not remove the style', "else if (action === 'show' && existing) existing.remove();", "else if (action === 'show' && existing) existing;"),
    ('everything counts as drawn', "return element.getClientRects().length > 0 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0;", 'return true;'),
    # (test: "an overlay that is invisible or transparent is not drawn, though it keeps its box")
    ('a transparent overlay counts as drawn', ' && Number(style.opacity) > 0;', ';'),
    ('an invisible overlay counts as drawn', " && style.visibility !== 'hidden'", ''),

    # ---- the other overlays (tests: "a pack capture hides every overlay ...", "a page with none of the overlays cannot be checked, and an overlay the list does not name is reported")
    ('the canvas holder counts as an overlay', "element.id !== 'app' && ", ''),
    ('scripts count as overlays', "!['SCRIPT', 'STYLE'].includes(element.tagName) && ", ''),
    ('the named overlays count among the others', '!selectors.some(selector => element.matches(selector)) && ', ''),
    ('another overlay is named with spaces', ".join('.')}`", ".join(' ')}`"),

    # ---- the page the selectors name (test: "every selector names something the page draws: the switcher, the hud panels and the title in the
    #      page sources, the pill in the shared script")
    ('the station switcher is renamed', "nav.className = 'station-switcher';", "nav.className = 'station-picker';", 'web/src/stations.ts'),
    ('the station switcher is no longer fixed', '.station-switcher{position:fixed;', '.station-switcher{position:absolute;', 'web/src/stations.ts'),
    ('the title is wrapped in another element', "<h1>King's Cross</h1>", "<header><h1>King's Cross</h1></header>", 'web/index.html'),
    ('the status panels are renamed', '<div class="hud">', '<div class="panels">', 'web/index.html'),
    ('the status panels are no longer fixed', 'position: fixed; left: 16px; right: 16px; bottom: 12px;', 'position: absolute; left: 16px; right: 16px; bottom: 12px;', 'web/index.html'),
    ('the Almanac pill is renamed', 'host.id = "almanac-back-host";', 'host.id = "almanac-pill";', '../almanac-back.js'),
    ('the Almanac pill script is injected in the head', "injectTo: 'body'", "injectTo: 'head'", 'vite.config.ts'),
]

# The 13 tests of tools/tests/evidence.test.mjs this group is judged by, by exact name: the --views and scene-pin options, the views of each
# element, the HUD, and the scoring parts of the views. The driver stops if one is renamed, rather than run a smaller set.
EVIDENCE_TESTS = [
    '--views, --time, --weather and --sky are validated before any browser starts',
    'every element names only fixed views that exist, and holds the cameras its rubric adds',
    'resolveViews turns elements, view names and station into the set of views to shoot',
    'runStationEvidenceShots shoots every fixed view twice for flicker, or only the selected ones',
    '--hud is off by default, takes on or off, and is refused otherwise',
    'the usage text documents --hud',
    'with the overlays off every station view is shot with them hidden, plus an overview with them shown and labelled',
    'the labelled overview is added only when the overview is selected and the overlays are off',
    "concourse-exterior-west is western-concourse's official C6 view and concourse-exterior-square is labelled context",
    "a record carries a view's part in scoring, and a view with none carries nothing",
    'only the two exterior views of the western concourse are shot with a scoring part, official and context',
    'the pack index says which view each criterion is scored from, and which are context',
    'the usage text names the official and the context view',
]

EVIDENCE = [
    # ---- the scoring parts of the views (tests: "concourse-exterior-west is western-concourse's official C6 view ...",
    #      "a record carries a view's part in scoring ...", "only the two exterior views of the western concourse are shot with a scoring part ...")
    ('the west view is the context view', "'concourse-exterior-west': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'official',", "'concourse-exterior-west': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'context',"),
    ('the square is also official', "'concourse-exterior-square': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'context',", "'concourse-exterior-square': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'official',"),
    ('the criterion is C5', "criterion: 'C6', role: 'official',", "criterion: 'C5', role: 'official',"),
    ('the square belongs to another element', "'concourse-exterior-square': Object.freeze({ element: 'western-concourse',", "'concourse-exterior-square': Object.freeze({ element: 'shed-interior',"),
    ('a scoring entry is not frozen', "'concourse-exterior-west': Object.freeze({", "'concourse-exterior-west': ({"),
    ('the scoring table is not frozen', 'export const VIEW_ROLES = Object.freeze({', 'export const VIEW_ROLES = ({'),
    ('a third view has a scoring part', 'export const VIEW_ROLES = Object.freeze({\n', "export const VIEW_ROLES = Object.freeze({\n  'overview': Object.freeze({ element: 'western-concourse', criterion: 'C6', role: 'context', label: 'x' }),\n"),
    ('the official label forgets it is official', "label: 'Official exterior view for", "label: 'Exterior view for"),
    ('the context label forgets it is context', "label: 'Context for western-concourse criterion C6, not the view it is scored from:", "label: 'View for western-concourse criterion C6:"),
    ('the context label forgets the hotel', 'from which the Great Northern Hotel stands in front of about half of the canopy.', 'from which the hotel stands in front of the canopy.'),
    ('the context label forgets the official view', " C6 is scored from concourse-exterior-west.' }),", "' }),"),
    ('a name inherited from Object has a scoring part', 'if (!Object.hasOwn(VIEW_ROLES, name)) return {};', 'if (!(name in VIEW_ROLES)) return {};'),
    ('the scoring part loses its criterion', 'return { scoring: { element, criterion, role }, label };', 'return { scoring: { element, role }, label };'),
    ('the scoring part loses its label', 'return { scoring: { element, criterion, role }, label };', 'return { scoring: { element, criterion, role } };'),

    # ---- the pack index note (test: "the pack index says which view each criterion is scored from, and which are context")
    ('the index note lists a view without its role', '${record.scoring.criterion}, ${record.scoring.role}: ${record.file}', '${record.scoring.criterion}: ${record.file}'),
    ('the index note lists a view without its label', '${record.file}: ${record.label}`', '${record.file}`'),
    ('the index note has another heading', 'Scoring views: a criterion is scored from its official view;', 'Views: a criterion is scored from its official view;'),
    ('the index note for no scoring views is a heading', r"\n\n` : '';", r"\n\n` : 'Scoring views: none\n';"),
    ('the index note does not end as a paragraph', r"${lines.join('\n')}\n\n`", r"${lines.join('\n')}\n`"),

    # ---- the views of each element, and --views (tests: "every element names only fixed views that exist ...", "resolveViews turns elements, view names and station ...")
    ('the west view is left out of its element', ", 'western-range-full', 'concourse-exterior-west'],", ", 'western-range-full'],"),
    ('an element lists a view twice', "'kx-front': ['south-front', ", "'kx-front': ['south-front', 'south-front', "),
    ('an element lists a grid camera', "'city-surroundings': ['overview', ", "'city-surroundings': ['top', 'overview', "),
    ('an element lists a view that is not a station camera', "'historic-neighbours': ['great-northern-hotel', ", "'historic-neighbours': ['great-northern-hotels', "),
    ('all selects an empty set', "if (spec === undefined || spec === 'all') return null;", "if (spec === undefined || spec === 'all') return new Set();"),
    ('station selects all but one view', "if (token === 'station') for (const view of known) names.add(view);", "if (token === 'station') for (const view of [...known].slice(1)) names.add(view);"),
    ('a name inherited from Object is an element', 'else if (Object.hasOwn(ELEMENT_VIEWS, token)) {', 'else if (token in ELEMENT_VIEWS) {'),
    ('an element is listed backwards', 'for (const view of ELEMENT_VIEWS[token]) {', 'for (const view of [...ELEMENT_VIEWS[token]].reverse()) {'),
    ('an element with a missing view is accepted', 'if (!known.has(view)) throw new Error(`element ${token} lists ${view}, which is not a station camera`);', ''),
    ('an unknown name is ignored', 'else throw new Error(`unknown view or element:', 'else if (false) throw new Error(`unknown view or element:'),
    ('the unknown name message teaches nothing', ". Elements: ${Object.keys(ELEMENT_VIEWS).join(', ')}. Views: ${[...known].join(', ')}", '.'),

    # ---- the options (tests: "--views, --time, --weather and --sky are validated before any browser starts", "--hud is off by default, ...")
    ('the hud option is always off', "const hud = hudMode(values.get('--hud'));", 'const hud = hudMode(undefined);'),
    ('a hud value is not checked', "const hud = hudMode(values.get('--hud'));", "const hud = values.get('--hud') ?? 'off';"),
    ('the pin ignores --time', "time: values.get('--time'), weather: values.get('--weather'), sky: values.get('--sky')", "weather: values.get('--weather'), sky: values.get('--sky')"),
    ('the pin ignores --weather', "time: values.get('--time'), weather: values.get('--weather'), sky: values.get('--sky')", "time: values.get('--time'), sky: values.get('--sky')"),
    ('the pin ignores --sky', "time: values.get('--time'), weather: values.get('--weather'), sky: values.get('--sky')", "time: values.get('--time'), weather: values.get('--weather')"),
    ('the view names are not checked', "if (views !== 'all') {", 'if (false) {'),
    ('upper case view names are accepted', r'if (!/^[a-z0-9]+(?:-[a-z0-9]+)*', r'if (!/^[a-zA-Z0-9]+(?:-[a-z0-9]+)*'),
    ('the replay options are allowed with --views', "'--raw-osm', '--date', '--speed', '--signal-at'].filter", "'--raw-osm', '--date', '--speed'].filter"),
    ('the views error loses its words', "'--views must be all, or element and view names separated by commas'", "'--views is wrong'"),

    # ---- the shots of each view (tests: "runStationEvidenceShots shoots every fixed view twice for flicker, or only the selected ones",
    #      "with the overlays off every station view is shot with them hidden, plus an overview with them shown and labelled",
    #      "the labelled overview is added only when the overview is selected and the overlays are off")
    ('every view is shot whatever is selected', 'const wanted = name => !select || select.has(name);', 'const wanted = name => true;'),
    ('an empty selection shoots every view', 'const wanted = name => !select || select.has(name);', 'const wanted = name => !select?.size || select.has(name);'),
    ('a hud request is sent even when none is made', 'const overlays = hud ? { hud } : {};', 'const overlays = { hud };'),
    ('the grid cameras are shot as station views', '!camera.grid && wanted(name)', 'wanted(name)'),
    ('a station view skips the flicker check', '{ twoFrame: true, ...overlays, ...viewScoring(name),', '{ twoFrame: false, ...overlays, ...viewScoring(name),'),
    ('a station view is shot without a hud request', '{ twoFrame: true, ...overlays, ...viewScoring(name),', '{ twoFrame: true, ...viewScoring(name),'),
    ('a station view carries no scoring part', '...overlays, ...viewScoring(name),', '...overlays,'),
    ('a solid slate view skips the flicker check', '{ twoFrame: true, ...overlays, roofMaterialEvidence: pair.solid', '{ twoFrame: false, ...overlays, roofMaterialEvidence: pair.solid'),
    ('a solid slate view is shot without a hud request', '...overlays, roofMaterialEvidence: pair.solid', 'roofMaterialEvidence: pair.solid'),
    ('the labelled overview is added when the overlays are on too', "if (hud === 'off' && cameras.overview && wanted('overview'))", "if (hud && cameras.overview && wanted('overview'))"),
    ('the labelled overview is added when no request is made', "if (hud === 'off' && cameras.overview && wanted('overview'))", "if (hud !== 'on' && cameras.overview && wanted('overview'))"),
    ('the labelled overview is added when the overview is not selected', "&& wanted('overview'))", ')'),
    ('the labelled overview shows the overlays hidden', "{ twoFrame: true, hud: 'on', label:", "{ twoFrame: true, hud: 'off', label:"),
    ('the labelled overview skips the flicker check', "{ twoFrame: true, hud: 'on', label:", "{ twoFrame: false, hud: 'on', label:"),
    ('the labelled overview is not labelled', 'its overlays are shown (every other station view has them hidden).', 'the overview.'),
    ('the labelled overview is shot from another camera', "shot('02', 'overview-hud-on', cameras.overview,", "shot('02', 'overview-hud-on', cameras.top,"),
    ('the labelled overview is filed under axis 01', "shot('02', 'overview-hud-on'", "shot('01', 'overview-hud-on'"),

    # ---- the usage text (tests: "the usage text documents --hud", "the usage text names the official and the context view")
    ('the usage text forgets what --hud does', '--hud <on|off>   default off: every fixed station view is shot with them hidden', '--hud <on|off>   default on: every fixed station view is shot with them shown'),
    ('the usage text forgets the labelled overview', 'plus overview-hud-on, the', 'plus the'),
    ('the usage text names no scoring views', 'scoring views (VIEW_ROLES):', 'views:'),
    ('the usage text drops the role of a scoring view', "${r.criterion}'s ${r.role} view", "${r.criterion}'s view"),
    ('the usage text separates the scoring views with commas', "${r.role} view`).join('; ')}", "${r.role} view`).join(', ')}"),
]

# Mutations that change nothing, so no test can catch them. They are not run; they are kept so that the next reader does not take one for a gap.
# (group, label, old, new[, file]) as in the tables.
EQUIVALENT = [
    # trackSclass (core/sclass.ts:173) skips every row of another TD area itself, so choosing the rows of one area first changes nothing.
    ('replay-peak', 'the signal bytes of one TD area are taken from the rows of every area', 'trackSclass(rowsBefore.filter(row => row.e.area === area), area)', 'trackSclass(rowsBefore, area)'),
]

# name, the module its mutations change, its test file, the tests to run by name (all of the file when empty), the mutations
GROUPS = [
    dict(name='frame-stats', target='tools/frame-stats.mjs', test='tools/tests/frame-stats.test.mjs', mutations=FRAME_STATS),
    dict(name='scene-pin', target='tools/scene-pin.mjs', test='tools/tests/scene-pin.test.mjs', mutations=SCENE_PIN),
    dict(name='flicker', target='tools/flicker.mjs', test='tools/tests/flicker.test.mjs', mutations=FLICKER),
    dict(name='replay-peak', target='tools/replay-peak.mjs', test='tools/tests/replay-peak.test.mjs', mutations=REPLAY_PEAK),
    dict(name='camera-sweep', target='tools/camera-sweep.mjs', test='tools/tests/camera-sweep.test.mjs', mutations=CAMERA_SWEEP),
    dict(name='hud', target='tools/hud.mjs', test='tools/tests/hud.test.mjs', mutations=HUD),
    dict(name='evidence', target='tools/evidence.mjs', test='tools/tests/evidence.test.mjs', only=EVIDENCE_TESTS, mutations=EVIDENCE, timeout=120, test_timeout_ms=30000),
]


def main():
    src = Path(sys.argv[1]).resolve()
    scratch = Path(sys.argv[2]).resolve()
    words = sys.argv[3:]
    if not scratch.is_relative_to(src.parent / '.scratch'):
        raise SystemExit('mutation output must be beneath the worktree .scratch')
    groups = [group for group in GROUPS if not words or any(word in group['name'] for word in words)]
    if not groups:
        raise SystemExit(f'no group matches {words}; the groups are {", ".join(group["name"] for group in GROUPS)}')
    scratch.mkdir(parents=True, exist_ok=True)

    tally = kxmut.Tally()
    asserted = {}  # (group, test) -> labels of the mutations that made it fail BY AN ASSERTION, in the order they ran
    baselines = {}
    with kxmut.workspace(src, scratch, 'evidence-helpers') as work:
        # hud.test.mjs reads the shared back-button script, which sits beside the package in the repository
        shutil.copy2(src.parent / 'almanac-back.js', work.parent / 'almanac-back.js')
        for group in groups:
            name, test = group['name'], group['test']
            patterns = ['^' + re.escape(title) + '$' for title in group.get('only', ())]
            suite = kxmut.Suite(work, test_timeout_ms=group.get('test_timeout_ms', 10000), timeout=group.get('timeout', 60))
            baseline = baselines[name] = suite.baseline([test], patterns)
            missing = sorted(set(group.get('only', ())) - baseline.passed)
            if missing:
                raise SystemExit(f'{name}: tests named by this driver did not run and pass in the unmodified copy (renamed?): {missing}')
            for label, old, new, *rest in group['mutations']:
                target = work / (rest[0] if rest else group['target'])
                try:
                    # unique: an anchor that matched two places would mutate the first one, which may not be the one the label names
                    with kxmut.mutated(target, [(old, new)], unique=True):
                        verdict, run = suite.judge([test], patterns, strict='any')
                except kxmut.StalePattern as error:
                    tally.stale(f'{name}: {label}', error)
                    continue
                tally.record(f'{name}: {label}', verdict)
                if verdict.kind == kxmut.KILLED:
                    for failure in run.failures:
                        if failure.assertion:
                            asserted.setdefault((name, failure.name), []).append(label)

    status = tally.finish()
    total = sum(len(group['mutations']) for group in groups)
    lines, unproven, count = [], [], 0
    for group in groups:
        for title in sorted(baselines[group['name']].passed):
            count += 1
            labels = asserted.get((group['name'], title), [])
            if not labels:
                unproven.append(f'{group["name"]}: {title}')
            lines.append(f'  {"RED  " if labels else "NEVER"} {group["name"]}: {title}'
                         + (f'\n         first red under: {labels[0]} (and {len(labels) - 1} more)' if labels else ''))
    summary = (f'{len(tally.caught)}/{total} caught; survivors: {tally.survived + [error[0] for error in tally.errors]}; '
               f'tests seen failing by an assertion: {count - len(unproven)}/{count}; unproven: {unproven}')
    print('\n'.join(lines))
    print(summary)
    (scratch / 'report.txt').write_text('\n'.join(lines) + '\n' + summary + '\n')
    sys.exit(1 if status or unproven else 0)


if __name__ == '__main__':
    main()
