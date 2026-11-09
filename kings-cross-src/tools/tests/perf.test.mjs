import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { HEADROOM_FPS_TARGET, UNCAPPED_CONTROL_RATIO, UNCAPPED_FLAGS, aggregateCpu, cpuProfileMarkdown, createRelayRoute, firstTrainVisible, headroomMarkdown, headroomReport, headroomVsBaseline, peakMarkdown, sourceMapPlan, sweepMarkdown } from '../perf.mjs';
import { sweepSummary } from '../camera-sweep.mjs';

const node = { id: 1, callFrame: { url: 'bundle.js', lineNumber: 0, columnNumber: 0, functionName: 'scene' } };
const maps = new Map([['bundle.js', [[{ generatedColumn: 0, source: 'scene.ts', originalLine: 2 }]]]]);

test('missing CPU time deltas leave an explicit gap without estimating self time', () => {
  let cpu;
  assert.doesNotThrow(() => { cpu = aggregateCpu({ nodes: [node], samples: [1, 1] }, maps); });
  assert.equal(cpu.status, 'unavailable');
  assert.equal(cpu.sampledMs, null);
  assert.equal(cpu.sampleCount, 2);
  assert.equal(cpu.timedSampleCount, 0);
  assert.deepEqual(cpu.byOriginalSourceFile, []);
  assert.ok(cpu.gaps.some(gap => gap.code === 'sample-time-unavailable' && gap.count === 2));
  assert.match(cpuProfileMarkdown(cpu).join('\n'), /CPU profile: unavailable/);
  assert.match(cpuProfileMarkdown(cpu).join('\n'), /sample-time-unavailable.*2/);
});

test('partial CPU timing keeps valid samples and labels the missing duration', () => {
  let cpu;
  assert.doesNotThrow(() => { cpu = aggregateCpu({ nodes: [node], samples: [1, 1, 1, 1, 1], timeDeltas: [1000, undefined, -1, NaN, 2000] }, maps); });
  assert.equal(cpu.status, 'partial');
  assert.equal(cpu.sampledMs, 3);
  assert.equal(cpu.mappedSelfMs, 3);
  assert.equal(cpu.timedSampleCount, 2);
  assert.equal(cpu.byOriginalSourceFile[0].selfMs, 3);
  assert.equal(cpu.gaps.find(gap => gap.code === 'sample-time-unavailable').count, 3);
  assert.match(cpuProfileMarkdown(cpu).join('\n'), /2\/5 samples timed/);
});

test('omitted CPU nodes and call frames preserve timed totals in unattributed buckets', () => {
  let cpu;
  assert.doesNotThrow(() => { cpu = aggregateCpu({ nodes: [{ id: 1 }], samples: [1, 99], timeDeltas: [1000, 2000] }, maps); });
  assert.equal(cpu.sampledMs, 3);
  assert.equal(cpu.mappedSelfMs, 0);
  assert.equal(cpu.status, 'partial');
  assert.equal(cpu.byOriginalSourceFile.reduce((sum, row) => sum + row.selfMs, 0), 3);
  assert.ok(cpu.gaps.some(gap => gap.code === 'call-frame-unavailable'));
  assert.ok(cpu.gaps.some(gap => gap.code === 'sample-node-unavailable'));
  assert.doesNotThrow(() => aggregateCpu({ samples: [1], timeDeltas: [500] }, maps));
  assert.doesNotThrow(() => cpuProfileMarkdown(cpu));
});

test('an absent or empty CPU profile reports a gap and always renders Markdown', () => {
  for (const profile of [undefined, null, {}, { nodes: [], samples: [] }]) {
    let cpu;
    assert.doesNotThrow(() => { cpu = aggregateCpu(profile, maps); });
    assert.equal(cpu.status, 'unavailable');
    assert.equal(cpu.sampledMs, null);
    assert.ok(cpu.gaps.some(gap => gap.code === 'samples-unavailable'));
    assert.match(cpuProfileMarkdown(cpu).join('\n'), /CPU profile: unavailable/);
  }
  assert.doesNotThrow(() => cpuProfileMarkdown(undefined));
  assert.doesNotThrow(() => cpuProfileMarkdown({}));
});

test('complete CPU timing keeps source-mapped self time and percentages', () => {
  const cpu = aggregateCpu({ nodes: [node], samples: [1, 1], timeDeltas: [1000, 2000] }, maps);
  assert.equal(cpu.status, 'complete');
  assert.equal(cpu.sampledMs, 3);
  assert.equal(cpu.mappedSelfMs, 3);
  assert.equal(cpu.sampleCount, 2);
  assert.equal(cpu.timedSampleCount, 2);
  assert.deepEqual(cpu.gaps, []);
  assert.deepEqual(cpu.byOriginalSourceFile, [{ source: 'scene.ts', selfMs: 3, percent: 100 }]);
  assert.equal(cpu.byFunction[0].function, 'scene.ts:3 scene');
  assert.match(cpuProfileMarkdown(cpu).join('\n'), /scene.ts \| 3 \| 100/);
});

test('missing source positions never guess a source-map match and unmatched deltas are disclosed', () => {
  const cpu = aggregateCpu({ nodes: [{ id: 1, callFrame: { url: 'bundle.js' } }], samples: [1], timeDeltas: [1000, 3000] }, maps);
  assert.equal(cpu.sampledMs, 1);
  assert.equal(cpu.mappedSelfMs, 0);
  assert.equal(cpu.byOriginalSourceFile[0].source, '[unmapped] bundle.js');
  assert.match(cpu.byFunction[0].function, /:\? \(anonymous\)/);
  assert.ok(cpu.gaps.some(gap => gap.code === 'source-position-unavailable'));
  assert.ok(cpu.gaps.some(gap => gap.code === 'unmatched-time-deltas'));
  assert.equal(cpu.status, 'partial');
  assert.match(cpuProfileMarkdown(cpu).join('\n'), /unmatched-time-deltas/);
  const zero = aggregateCpu({ nodes: [node], samples: [1], timeDeltas: [0] });
  assert.equal(zero.sampledMs, 0, 'a measured zero is distinct from missing timing');
  assert.equal(zero.byOriginalSourceFile[0].percent, 0);
});

// ---- uncapped headroom ----------------------------------------------------------------------------------------------
const camera = (median, p5 = median - 5, { p50 = 1000 / median, p95 = 1500 / median, realMetal = true } = {}) => ({ fps: { median, p5 }, frameMs: { p50, p95 }, realMetal });
const capped = { control: { medianFps: 60 }, cameras: { overview: camera(60, 59, { p50: 16.7, p95: 16.8 }), shed: camera(60, 60, { p50: 16.7, p95: 16.7 }) } };
const uncapped = { control: { medianFps: 1908.5 }, cameras: { overview: camera(438, 436, { p50: 1.9, p95: 3.1 }), shed: camera(549, 543, { p50: 1.5, p95: 2.9 }) } };

test('the headroom run uses exactly the two flags that lift the frame limit', () => {
  assert.deepEqual([...UNCAPPED_FLAGS], ['--disable-gpu-vsync', '--disable-frame-rate-limit']);
  assert.throws(() => UNCAPPED_FLAGS.push('--x'), TypeError, 'the list cannot be edited by accident');
  assert.equal(HEADROOM_FPS_TARGET, 60);
  assert.equal(UNCAPPED_CONTROL_RATIO, 1.5);
});

test('headroom is the uncapped median FPS over the 60 FPS target, beside the capped figure', () => {
  const headroom = headroomReport(capped, uncapped);
  assert.equal(headroom.valid, true);
  assert.equal(headroom.flagsEffective, true);
  assert.deepEqual(headroom.gaps, []);
  assert.deepEqual(headroom.control, { cappedFps: 60, uncappedFps: 1908.5 });
  assert.deepEqual(headroom.cameras.overview, { cappedMedianFps: 60, cappedP5Fps: 59, uncappedMedianFps: 438, uncappedP5Fps: 436, uncappedFrameMs: { p50: 1.9, p95: 3.1 }, headroom: 7.3, headroomP5: 7.27, frameCostMs: 2.283, realMetal: true });
  assert.equal(headroom.cameras.shed.headroom, 9.15);
  assert.equal(headroom.worstHeadroom, 7.3, 'the worst camera sets the headline');
  assert.deepEqual(headroom.flags, ['--disable-gpu-vsync', '--disable-frame-rate-limit']);
  assert.match(headroom.definition, /uncapped median frames per second over the 60 FPS target/);
});

test('flags that did nothing are reported, not mistaken for headroom', () => {
  for (const control of [60, 89, null, undefined, NaN]) {
    const headroom = headroomReport(capped, { ...uncapped, control: { medianFps: control } });
    assert.equal(headroom.valid, false, `uncapped control ${control}`);
    assert.equal(headroom.flagsEffective, false);
    assert.ok(headroom.gaps.some(gap => /did not lift the frame limit/.test(gap)));
    assert.equal(headroom.cameras.overview.headroom, 7.3, 'the numbers are still shown');
  }
  assert.equal(headroomReport(capped, { ...uncapped, control: { medianFps: 90 } }).valid, true, 'exactly 1.5x the capped control is enough');
  assert.equal(headroomReport({ ...capped, control: { medianFps: 0 } }, uncapped).valid, false, 'a dead capped control proves nothing');
});

test('a missing camera, a missing run or a software renderer makes the headroom invalid', () => {
  const missing = headroomReport(capped, { ...uncapped, cameras: { overview: uncapped.cameras.overview } });
  assert.ok(missing.gaps.some(gap => /shed: no uncapped measurement/.test(gap)));
  assert.deepEqual(Object.keys(missing.cameras), ['overview']);
  const software = headroomReport(capped, { ...uncapped, cameras: { ...uncapped.cameras, shed: camera(549, 543, { realMetal: false }) } });
  assert.equal(software.valid, false);
  assert.ok(software.gaps.some(gap => /real Metal/.test(gap)));
  const none = headroomReport(capped, undefined);
  assert.equal(none.valid, false);
  assert.equal(none.worstHeadroom, null);
  assert.ok(none.gaps.some(gap => /No camera was measured uncapped/.test(gap)));
  const unmeasured = headroomReport(capped, { ...uncapped, cameras: { overview: { fps: {}, frameMs: {}, realMetal: true }, shed: uncapped.cameras.shed } });
  assert.equal(unmeasured.valid, false);
  assert.equal(unmeasured.cameras.overview.headroom, null);
});

test('the baseline comparison is the uncapped median now over then, per camera', () => {
  const now = headroomReport(capped, uncapped);
  const then = { cameras: { overview: { uncappedMedianFps: 500 }, shed: { uncappedMedianFps: 549 }, extra: { uncappedMedianFps: 10 } } };
  const against = headroomVsBaseline(now, then);
  assert.deepEqual(against.cameras, { overview: { baselineFps: 500, fps: 438, ratio: 0.876 }, shed: { baselineFps: 549, fps: 549, ratio: 1 } });
  assert.equal(against.worstRatio, 0.876);
  assert.match(against.definition, /below 1 is slower/);
  assert.deepEqual(headroomVsBaseline(now, { cameras: { overview: { uncappedMedianFps: 0 }, shed: {} } }).cameras, {}, 'a zero or absent baseline is skipped, not divided by');
  assert.equal(headroomVsBaseline(now, undefined).worstRatio, null);
  assert.equal(headroomVsBaseline(undefined, then).worstRatio, null);
});

test('the Markdown says whether the headroom is valid and lists each camera', () => {
  const now = headroomReport(capped, uncapped);
  const valid = headroomMarkdown({ ...now, vsBaseline: headroomVsBaseline(now, { cameras: { overview: { uncappedMedianFps: 438 } } }) }).join('\n');
  assert.match(valid, /Headroom \(uncapped, --disable-gpu-vsync --disable-frame-rate-limit\): valid\./);
  assert.match(valid, /Repainting-page control 60 FPS capped, 1908\.5 FPS uncapped/);
  assert.match(valid, /\| overview \| 60 \| 438 \| 436 \| 7\.3 \| 2\.28 \| 3\.1 \|/);
  assert.match(valid, /\| shed \| 60 \| 549 \| 543 \| 9\.15 \| 1\.82 \| 2\.9 \|/);
  assert.match(valid, /Against the baseline run: overview 438 \/ 438 = 1x/);
  const invalid = headroomMarkdown(headroomReport(capped, { ...uncapped, control: { medianFps: 61 } })).join('\n');
  assert.match(invalid, /NOT VALID/);
  assert.match(invalid, /Headroom gap: The uncapped flags did not lift the frame limit/);
  assert.match(headroomMarkdown(undefined).join('\n'), /not measured/);
  assert.match(headroomMarkdown(now, 'Station camera headroom').join('\n'), /^Station camera headroom \(uncapped/, 'the station table carries its own title');
  assert.match(headroomMarkdown(undefined, 'Station camera headroom').join('\n'), /^Station camera headroom: not measured/);
});

// ---- The replay peak: the relay route, the first train, and the sweep Markdown ----------------------------------------------------------

const SCRIPT = [
  JSON.stringify({ t: 1000, e: { kind: 'interpose', area: 'Y9', descr: '1A01', to: 'B1' } }),
  JSON.stringify({ t: 2000, e: { kind: 'step', area: 'Y9', descr: '1A01', from: 'B1', to: 'B2', time: 2000 } }),
  JSON.stringify({ t: 3000, e: { kind: 'interpose', area: 'Y9', descr: '2B02', to: 'B1' } }),
];
const RECORDING = `${SCRIPT.join('\n')}\n`;

/** A fake relay (recording, a health route, a failing recording for another date) behind the perf tool's /relay route, both on ephemeral ports. */
async function withRelayRoute(replayWindow, run) {
  const relay = createServer((req, res) => {
    const url = new URL(req.url, 'http://relay.invalid');
    if (url.pathname === '/recording' && url.searchParams.get('date') === '20261107') res.writeHead(200, { 'content-type': 'application/x-ndjson', etag: 'upstream' }).end(RECORDING);
    else if (url.pathname === '/recording') res.writeHead(404).end('no such day');
    else if (url.pathname === '/health') res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
    else res.writeHead(404).end();
  });
  await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
  const relayBase = new URL(`http://127.0.0.1:${relay.address().port}`);
  const route = createRelayRoute(relayBase, replayWindow);
  const front = createServer((req, res) => { if (!route(req, res)) res.writeHead(418).end('not the relay'); });
  await new Promise(resolve => front.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${front.address().port}`;
  try { await run(base, relay, relayBase); }
  finally { front.closeAllConnections?.(); relay.closeAllConnections?.(); await new Promise(resolve => front.close(resolve)); await new Promise(resolve => relay.close(resolve)); }
}

test('the relay route forwards everything, and only a window set on it changes the recording', async () => {
  const replayWindow = { startMs: null };
  await withRelayRoute(replayWindow, async (base) => {
    const plain = await fetch(`${base}/relay/recording?date=20261107`);
    assert.equal(plain.status, 200); assert.equal(await plain.text(), RECORDING, 'no window: the recording as the relay sent it');
    assert.equal(plain.headers.get('etag'), 'upstream', 'and its headers');
    assert.equal(await (await fetch(`${base}/relay/health`)).text(), '{"ok":true}');
    assert.equal((await fetch(`${base}/elsewhere`)).status, 418, 'a path outside /relay is not this route\'s');
    replayWindow.startMs = 2500;
    const windowed = await fetch(`${base}/relay/recording?date=20261107`);
    assert.equal(windowed.status, 200);
    assert.match(windowed.headers.get('content-type'), /ndjson/); assert.equal(windowed.headers.get('cache-control'), 'no-store');
    const rows = (await windowed.text()).split('\n').filter(Boolean).map(line => JSON.parse(line));
    assert.deepEqual(rows.map(r => [r.t, r.e.kind]), [[2500, 'snapshot'], [3000, 'interpose']]);
    assert.deepEqual(rows[0].e.berths, { B2: '1A01' });
    assert.equal(windowed.headers.get('content-length'), String(Buffer.byteLength(JSON.stringify(rows[0]) + '\n' + SCRIPT[2] + '\n')), 'the length is the windowed body\'s');
    assert.equal(await (await fetch(`${base}/relay/health`)).text(), '{"ok":true}', 'other routes are untouched while a window is set');
    assert.equal((await fetch(`${base}/relay/recording?date=20260101`)).status, 404, 'a recording the relay does not have is passed through, not windowed');
    replayWindow.startMs = null;
    assert.equal(await (await fetch(`${base}/relay/recording?date=20261107`)).text(), RECORDING, 'clearing the window restores the recording');
  });
});

test('the relay route answers 502 when the relay is down or its recording is not a recording', async () => {
  const replayWindow = { startMs: 2500 };
  const route = createRelayRoute(new URL('http://127.0.0.1:1'), replayWindow);
  const front = createServer((req, res) => { route(req, res); });
  await new Promise(resolve => front.listen(0, '127.0.0.1', resolve));
  try {
    const down = await fetch(`http://127.0.0.1:${front.address().port}/relay/recording?date=20261107`);
    assert.equal(down.status, 502); assert.equal(await down.text(), 'relay unavailable');
  } finally { front.closeAllConnections?.(); await new Promise(resolve => front.close(resolve)); }
  const garbage = createServer((req, res) => res.writeHead(200).end('this is not ndjson\n'));
  await new Promise(resolve => garbage.listen(0, '127.0.0.1', resolve));
  const route2 = createRelayRoute(new URL(`http://127.0.0.1:${garbage.address().port}`), { startMs: 5 });
  const front2 = createServer((req, res) => { route2(req, res); });
  await new Promise(resolve => front2.listen(0, '127.0.0.1', resolve));
  try {
    const bad = await fetch(`http://127.0.0.1:${front2.address().port}/relay/recording?date=20261107`);
    assert.equal(bad.status, 502); assert.match(await bad.text(), /could not be restarted/);
  } finally { front2.closeAllConnections?.(); garbage.closeAllConnections?.(); await new Promise(resolve => front2.close(resolve)); await new Promise(resolve => garbage.close(resolve)); }
});

const startupTiming = (overrides = {}) => ({
  navigationStartToSceneRenderedMs: 1100, navigationStartToReplayTrainsRenderedMs: 1500, replayTrainDrawsAtFirstRender: 14,
  phases: { sceneToFirstTrainMs: 400, firstTrainContentDelayMs: 30 }, ...overrides,
});

test('first train visible: cold and warm, from the startup loads, and whether the replay started at its peak', () => {
  const atPeak = firstTrainVisible({ coldFreshProfile: startupTiming({ navigationStartToReplayTrainsRenderedMs: 2400 }), warmSecondLoadSameProfile: startupTiming() }, { mode: 'scan' });
  assert.equal(atPeak.startsAtPeak, true);
  assert.deepEqual(atPeak.warm, { ms: 1500, sceneRenderedMs: 1100, afterSceneMs: 400, trainDrawsAtFirstRender: 14, waitForRecordedTravelMs: 30 });
  assert.equal(atPeak.cold.ms, 2400);
  assert.equal(firstTrainVisible({ warmSecondLoadSameProfile: startupTiming() }, { mode: 'given' }).startsAtPeak, true);
  const fromStart = firstTrainVisible({ warmSecondLoadSameProfile: startupTiming() }, { mode: 'none' });
  assert.equal(fromStart.startsAtPeak, false, 'a replay that starts empty includes the wait for the first train');
  assert.equal(fromStart.cold, null);
  assert.match(atPeak.definition, /warm/); assert.match(atPeak.definition, /first draw of a train mesh/);
  assert.equal(firstTrainVisible({}, undefined).warm, null);
});

const sweepCamera = (overrides = {}) => ({
  fps: { median: 60, p5: 60 }, frameDistribution: { p50: 16.7, p95: 16.7, p99: 16.8, max: 33.3, slowShare: 0.0033, missedSlots: 1 },
  trainsShown: { min: 10, median: 12, max: 14 }, steady60: true, busy: true, view: {}, ...overrides,
});

test('the peak and sweep Markdown say where the replay started and list every camera with its frame-time figures', () => {
  const peak = { mode: 'scan', startISO: '2026-11-07T17:21:00.000Z', startMs: 1794072060000, windowMs: 2_040_000, minShown: 11, medianShown: 12, maxShown: 14, busyFloor: 9,
    scan: { speed: 120, samples: 210, maxShown: 15, maxShownISO: '2026-11-07T17:50:00.000Z', firstISO: '2026-11-07T16:12:15.000Z', lastISO: '2026-11-07T17:56:43.000Z' } };
  const text = peakMarkdown(peak).join('\n');
  assert.match(text, /scanned at 120x/); assert.match(text, /starts at 2026-11-07T17:21:00\.000Z/); assert.match(text, /34 minutes/);
  assert.match(text, /min 11, median 12, max 14; a camera counts as busy at a median of 9 or more/);
  assert.match(text, /at most 15 trains drawn, at 2026-11-07T17:50:00\.000Z, over 210 samples/);
  assert.match(peakMarkdown({ mode: 'given', from: 'baseline.json', startISO: 'x', startMs: 5, windowMs: 60000, busyFloor: 4 }).join('\n'), /given by baseline\.json/);
  assert.match(peakMarkdown({ mode: 'none' }).join('\n'), /not used/); assert.match(peakMarkdown(undefined).join('\n'), /not used/);
  const cameras = { 'south-front': sweepCamera(), top: sweepCamera({ view: { grid: true }, steady60: false, busy: false, fps: { median: 41, p5: 38 }, frameDistribution: { p50: 16.7, p95: 33.3, p99: 50, max: 66.7, slowShare: .31, missedSlots: 90 } }) };
  const md = sweepMarkdown(cameras, sweepSummary(cameras)).join('\n');
  assert.match(md, /1 of 2 cameras steady at 60 FPS/); assert.match(md, /1 of 2 measured at the peak/);
  assert.match(md, /\| south-front \| 10\/12\/14 \| 60 \| 60 \| 16\.7 \| 16\.7 \| 16\.8 \| 33\.3 \| 0\.33 \| 1 \| yes \| yes \|/);
  assert.match(md, /\| top \(grid view\) \| 10\/12\/14 \| 41 \| 38 \| 16\.7 \| 33\.3 \| 50 \| 66\.7 \| 31 \| 90 \| NO \| NO \|/);
  assert.match(sweepMarkdown({}, sweepSummary({})).join('\n'), /not measured/);
});

test('a re-export chunk Rollup gave no source map is left unmapped; a declared map that is missing, or a build with no maps, is still refused', () => {
  const script = (file, mapped, declared = mapped) => ({ file, mapped, declared });
  // The multi-station split: an 87 byte landmarks-*.js that only re-exports has no map and no sourceMappingURL comment.
  const split = sourceMapPlan([script('assets/index-a.js', true), script('assets/landmarks-b.js', false), script('assets/landmarks-c.js', true)]);
  assert.deepEqual(split.missing, []);
  assert.deepEqual(split.facades, ['assets/landmarks-b.js']);
  // A chunk that names a map the build does not have is a broken build.
  assert.deepEqual(sourceMapPlan([script('assets/index-a.js', true), script('assets/station-b.js', false, true)]), { missing: ['assets/station-b.js'], facades: [] });
  // A build made without --sourcemap has no map on any script, declared or not.
  assert.deepEqual(sourceMapPlan([script('assets/index-a.js', false), script('assets/landmarks-b.js', false)]).missing, ['assets/index-a.js', 'assets/landmarks-b.js']);
  assert.deepEqual(sourceMapPlan([script('assets/index-a.js', true), script('assets/landmarks-b.js', true)]), { missing: [], facades: [] });
});
