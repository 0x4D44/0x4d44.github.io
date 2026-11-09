import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import vm from 'node:vm';
import { sizeReport, hardwareReport, summarizeRuns, collectRuns, BUDGET_BYTES, PERF_PAIR_LIMIT_MS, main, evidenceMarkdown, firstTrainMarkdown, pairPerfArgs, stationSweepMarkdown, statusLine } from '../axis08-evidence.mjs';
import { startupObserver, extractTiming } from '../perf.mjs';
const scratch = path.resolve(import.meta.dirname, '../../../.scratch/axis08-tests');
const timing = (first, full) => ({ navigationStartToSceneRenderedMs: first, navigationStartToFullSceneRenderedMs: full });
const report = () => ({ success: true, startup: { coldFreshProfile: timing(100, 600), warmSecondLoadSameProfile: timing(50, 300) }, cameras: Object.fromEntries(['overview', 'shed'].map(name => [name, { realMetal: true, renderer: 'ANGLE Apple Metal', rAFThrottleDetected: false, fps: { median: 60, p5: 60 }, frameMs: { p95: 16.5, p99: 20 } }])) });

test('every emitted file including geometry and source maps contributes to explicit gzip totals', async () => {
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(path.join(scratch, 'dist-'));
  await mkdir(path.join(dir, 'assets'));
  const bodies = { 'index.html': '<html/>', 'assets/geometry.json': '{"terrain":[1,2,3]}', 'assets/main.js': 'render()', 'assets/main.js.map': '{"sources":[]}' };
  for (const [name, body] of Object.entries(bodies)) await writeFile(path.join(dir, name), body);
  const result = await sizeReport(dir);
  assert.equal(BUDGET_BYTES, 2000000);
  assert.equal(result.files.length, 4);
  assert.equal(result.allEmittedGzipBytes, Object.values(bodies).reduce((sum, body) => sum + gzipSync(body).length, 0));
  assert.equal(result.sourceMapsGzipBytes, gzipSync(bodies['assets/main.js.map']).length);
  assert.equal(result.appPayloadGzipBytes, result.allEmittedGzipBytes - result.sourceMapsGzipBytes);
  assert.equal(result.files.find(row => row.file.endsWith('.map')).classification, 'source-map');
});

test('hardware inventory selects model and GPU without retaining serial identifiers', async () => {
  const hardware = await hardwareReport('darwin', async () => ({ stdout: JSON.stringify({ SPHardwareDataType: [{ machine_model: 'Mac Studio', serial_number: 'PRIVATE' }], SPDisplaysDataType: [{ sppci_model: 'Apple GPU' }] }) }));
  assert.equal(hardware.model, 'Mac Studio');
  assert.deepEqual(hardware.gpu, ['Apple GPU']);
  assert.ok(hardware.cpu && hardware.os.release);
  assert.ok(!JSON.stringify(hardware).includes('PRIVATE'));
});

test('cold/warm summaries distinguish first render and full city readiness and reject missing measurements', () => {
  const result = summarizeRuns([report(), report(), report()]);
  assert.equal(result.samples.cold.length, 3);
  assert.equal(result.aggregates.cold.firstRenderMs.median, 100);
  assert.equal(result.aggregates.cold.sceneReadyMs.median, 600);
  assert.equal(result.aggregates.warm.sceneReadyMs.median, 300);
  assert.throws(() => summarizeRuns([report()]), /two/);
  const invalid = report(); invalid.startup.coldFreshProfile.navigationStartToFullSceneRenderedMs = null;
  assert.throws(() => summarizeRuns([invalid, report()]), /measurement/);
});

test('genuine Metal requires both cameras and rejects software or throttled measurements', () => {
  assert.equal(summarizeRuns([report(), report()]).genuineMetal, true);
  for (const change of [{ realMetal: false }, { renderer: 'SwiftShader Metal' }, { rAFThrottleDetected: true }]) {
    const invalid = report(); Object.assign(invalid.cameras.shed, change);
    assert.equal(summarizeRuns([invalid, report()]).genuineMetal, false);
  }
});

test('orchestration runs independent pairs and marks the later ones, which reuse the first pair\'s peak', async () => {
  const calls = [];
  await collectRuns(3, async (index, laterPair) => { calls.push([index, laterPair]); return report(); });
  assert.deepEqual(calls, [[0, false], [1, true], [2, true]]);
});

test('full scene waits for city completion, actual geometry and a later renderer submission', async () => {
  let resolveCity, now = 10;
  const window = {};
  vm.runInNewContext(`(${startupObserver.toString()})()`, { window, performance: { now: () => now } });
  const renderer = { info: { render: { frame: 0 } }, render() { this.info.render.frame++; } };
  const k = { renderer, cityLoaded: new Promise(resolve => { resolveCity = resolve; }), parts: {}, feed: {}, trains: [] };
  window.__kx = k;
  renderer.render();
  assert.equal(window.__kxStartup.sceneRenderedMs, 10);
  assert.equal(window.__kxStartup.fullSceneRenderedMs, undefined);
  resolveCity(); await Promise.resolve(); now = 20; renderer.render();
  assert.equal(window.__kxStartup.fullSceneRenderedMs, undefined);
  k.parts = { terrain: {}, buildings: {} }; now = 30; renderer.render();
  assert.equal(window.__kxStartup.fullSceneRenderedMs, 30);
  const measured = extractTiming({ observation: { ...window.__kxStartup, replayTrainsRenderedMs: 35, trainDraws: 1 } });
  assert.equal(measured.navigationStartToFullSceneRenderedMs, 30);
});

test('CLI rejects invalid options, too few runs and output outside private scratch', async () => {
  await assert.rejects(main(['--unknown']), /unknown/);
  // Order matters: an unsafe --out stops a bypassed run-count guard here, instead of letting it go on to run a real build and browser.
  await assert.rejects(main(['--runs', '1', '--out', '/private/tmp/outside']), /integer/);
  await assert.rejects(main(['--runs', '1']), /integer/);
  await assert.rejects(main(['--out', '/private/tmp/outside']), /beneath/);
});


test('explicit target verdicts reject low FPS, missing FPS and warm render at three seconds', () => {
  assert.equal(summarizeRuns([report(), report()]).targets.passed, true);
  for (const field of ['median', 'p5']) {
    const low = report(); low.cameras.shed.fps[field] = 59;
    const measured = summarizeRuns([low, report()]);
    assert.equal(measured.targets.fpsAtLeast60, false);
    assert.equal(measured.targets.passed, false);
  }
  const missing = report(); delete missing.cameras.overview.fps;
  assert.equal(summarizeRuns([missing, report()]).targets.passed, false);
  const slow = report(); slow.startup.warmSecondLoadSameProfile = timing(3000, 4000);
  const measured = summarizeRuns([report(), slow]);
  assert.equal(measured.targets.warmFirstRenderWithin3s, false);
  assert.equal(measured.targets.passed, false);
  assert.equal(measured.targets.cameraTargets.overview.p95FrameWithinBudget, true);
  assert.equal(measured.targets.cameraTargets.overview.p99FrameWithinBudget, false);
});

test('the first pair\'s uncapped headroom reaches the summary and the Markdown, and its absence is stated', () => {
  const cameraRow = (uncappedMedianFps, headroom) => ({ cappedMedianFps: 60, cappedP5Fps: 60, uncappedMedianFps, uncappedP5Fps: uncappedMedianFps - 5, uncappedFrameMs: { p50: 2, p95: 3 }, headroom, headroomP5: headroom, frameCostMs: 2, realMetal: true });
  const headroom = { fpsTarget: 60, flags: ['--disable-gpu-vsync', '--disable-frame-rate-limit'], flagsEffective: true, control: { cappedFps: 60, uncappedFps: 1900 }, valid: true, gaps: [], worstHeadroom: 7.3,
    cameras: { overview: cameraRow(438, 7.3), shed: cameraRow(549, 9.15) } };
  const first = { ...report(), headroom };
  const measured = summarizeRuns([first, report(), report()]);
  assert.deepEqual(measured.headroom, headroom, 'the first pair measures the cameras, so its headroom is the summary\'s');
  assert.equal(summarizeRuns([report(), report()]).headroom, null, 'a report from before the headroom run has none');
  assert.equal(summarizeRuns([report(), first]).headroom, null, 'later pairs measure startup only');
  const markdown = (browser) => evidenceMarkdown({ status: 'pass', invocation: ['node'], hardware: { model: 'M', cpu: 'C', logicalCpus: 1, gpu: ['G'], os: { platform: 'darwin', release: '1', version: 'v', arch: 'arm64' } },
    build: { files: [], appPayloadGzipBytes: 1, allEmittedGzipBytes: 1, sourceMapsGzipBytes: 0, budgetBytes: 2000000, appPayloadWithinBudget: true, allEmittedWithinBudget: true, budgetDefinition: 'x' }, browser });
  const text = markdown(measured);
  assert.match(text, /Headroom \(uncapped, --disable-gpu-vsync --disable-frame-rate-limit\): valid\./);
  assert.match(text, /\| overview \| 60 \| 438 \| 433 \| 7\.3 \| 2 \| 3 \|/);
  assert.match(markdown(summarizeRuns([report(), report()])), /Headroom: not measured/);
});

test('the CLI passes the scene pin and the headroom options on to perf and refuses unknown ones', async () => {
  await assert.rejects(main(['--headroom']), /unknown option/);
  await assert.rejects(main(['--runs', '1', '--weather', 'rain']), /integer/, 'the pin options are known; the run count is what is wrong');
});

test('Markdown includes hardware, every file, samples, aggregates, failed targets, limitations and exact command', () => {
  const low = report(); low.cameras.shed.fps.p5 = 40;
  const browser = summarizeRuns([low, report()]);
  const result = evidenceMarkdown({ status: 'fail', invocation: ['node', 'tools/axis08-evidence.mjs', '--runs', '2'],
    hardware: { model: 'Mac Studio', cpu: 'Apple CPU', logicalCpus: 8, gpu: ['Apple GPU'], os: { platform: 'darwin', release: '26', version: 'Darwin', arch: 'arm64' }, gaps: ['synthetic inventory gap'] },
    build: { files: [{ file: 'geometry.js', classification: 'app-payload', bytes: 200, gzipBytes: 100 }, { file: 'main.js.map', classification: 'source-map', bytes: 400, gzipBytes: 200 }], appPayloadGzipBytes: 100, allEmittedGzipBytes: 300, sourceMapsGzipBytes: 200, budgetBytes: 2000000, appPayloadWithinBudget: true, allEmittedWithinBudget: true, budgetDefinition: 'Strict <2 MB' }, browser });
  for (const text of ['Mac Studio', 'Apple CPU', 'Apple GPU', 'darwin', 'geometry.js', 'main.js.map', '| cold | 2 | 100 | 600 |', '| warm | firstRenderMs | 50 | 50 | 50 |', 'Median FPS', '| shed | ANGLE Apple Metal | 60 | 40 |', 'FPS target: FAIL', 'display presentation', 'synthetic inventory gap', "'node' 'tools/axis08-evidence.mjs' '--runs' '2'"]) assert.ok(result.includes(text), text);
});

// ---- The station sweep across the pairs, the first train visible, and each pair's perf arguments ---------------------------------------

const sweepCamera = (overrides = {}) => ({ fps: { median: 60, p5: 60 }, frameDistribution: { p50: 16.7, p95: 16.7, p99: 16.8, max: 16.9, slowShare: 0, missedSlots: 0 },
  trainsShown: { min: 10, median: 12, max: 14 }, realMetal: true, rAFThrottleDetected: false, steady60: true, busy: true, ...overrides });
const PEAK = { mode: 'scan', startISO: '2026-11-07T17:21:00.000Z', startMs: 1794072060000, windowMs: 2_040_000, minShown: 11, medianShown: 12, maxShown: 14, busyFloor: 9,
  scan: { speed: 120, samples: 210, maxShown: 15, maxShownISO: '2026-11-07T17:50:00.000Z', firstISO: '2026-11-07T16:12:15.000Z', lastISO: '2026-11-07T17:56:43.000Z' } };
const sweptReport = (names = ['south-front', 'tower-close'], overrides = {}) => ({ ...report(), replayPeak: PEAK, firstTrainVisible: { startsAtPeak: true },
  stationCameras: Object.fromEntries(names.map(name => [name, sweepCamera(overrides[name])])) });
const renderMarkdown = browser => evidenceMarkdown({ status: 'pass', invocation: ['node'], hardware: { model: 'M', cpu: 'C', logicalCpus: 1, gpu: ['G'], os: { platform: 'darwin', release: '1', version: 'v', arch: 'arm64' } },
  build: { files: [], appPayloadGzipBytes: 1, allEmittedGzipBytes: 1, sourceMapsGzipBytes: 0, budgetBytes: 2000000, appPayloadWithinBudget: true, allEmittedWithinBudget: true, budgetDefinition: 'x' }, browser });

test('the station sweep joins the verdict: every camera, in every pair, steady at 60 FPS and measured at the replay peak', () => {
  const ok = summarizeRuns([sweptReport(), sweptReport(), sweptReport()]);
  assert.equal(ok.targets.stationFpsAtLeast60, true); assert.equal(ok.targets.peakWasBusy, true); assert.equal(ok.targets.passed, true);
  assert.equal(ok.stationSweep.pairs, 3); assert.equal(ok.stationSweep.cameraCount, 2);
  assert.deepEqual(ok.replayPeak, PEAK, 'the first pair\'s peak is the summary\'s');
  const dip = summarizeRuns([sweptReport(), sweptReport(undefined, { 'tower-close': { steady60: false, fps: { median: 52, p5: 40 } } }), sweptReport()]);
  assert.equal(dip.targets.stationFpsAtLeast60, false, 'one camera below 60 in one pair'); assert.equal(dip.targets.passed, false);
  assert.deepEqual(dip.stationSweep.notSteady, ['tower-close']);
  const quiet = summarizeRuns([sweptReport(), sweptReport(undefined, { 'south-front': { busy: false } }), sweptReport()]);
  assert.equal(quiet.targets.peakWasBusy, false); assert.equal(quiet.targets.passed, false, 'a replay that was not busy is not peak evidence');
  assert.ok(quiet.gaps.some(gap => /Not measured at the replay peak.*south-front/.test(gap)));
  const partial = summarizeRuns([sweptReport(), report(), sweptReport()]);
  assert.equal(partial.targets.stationFpsAtLeast60, false, 'a pair that did not sweep'); assert.equal(partial.targets.passed, false);
  assert.ok(partial.gaps.some(gap => /2 of 3 pairs/.test(gap)));
  const missing = summarizeRuns([sweptReport(), sweptReport(['south-front']), sweptReport()]);
  assert.equal(missing.targets.passed, false, 'a camera absent from a pair'); assert.ok(missing.gaps.some(gap => /not every camera/.test(gap)));
  assert.equal(summarizeRuns([sweptReport(), sweptReport(undefined, { 'tower-close': { realMetal: false } }), sweptReport()]).targets.passed, false, 'a software renderer on a station camera');
  assert.equal(summarizeRuns([sweptReport(), sweptReport(undefined, { 'tower-close': { rAFThrottleDetected: true } }), sweptReport()]).targets.passed, false, 'a throttled page');
  const none = summarizeRuns([report(), report()]);
  assert.equal(none.stationSweep, null); assert.equal(none.targets.stationFpsAtLeast60, null); assert.equal(none.targets.peakWasBusy, null);
  assert.equal(none.targets.passed, true, 'a report without the sweep keeps its old verdict');
  const lowAxis = report(); lowAxis.cameras.shed.fps.p5 = 40;
  assert.equal(summarizeRuns([{ ...sweptReport(), cameras: lowAxis.cameras }, sweptReport(), sweptReport()]).targets.passed, false, 'the axis cameras still count');
});

test('the status line names what passed, or exactly which targets failed', () => {
  const build = { appPayloadWithinBudget: true };
  const ok = summarizeRuns([sweptReport(), sweptReport(), sweptReport()]);
  assert.equal(statusLine(ok, build), 'pass: genuine Metal, >=60 median/p5 FPS, every station camera steady at 60 FPS at the replay peak, warm first render <3 s and app payload budget');
  assert.equal(statusLine(summarizeRuns([report(), report()]), build), 'pass: genuine Metal, >=60 median/p5 FPS, warm first render <3 s and app payload budget', 'without the sweep the status is the old one');
  const dip = summarizeRuns([sweptReport(), sweptReport(undefined, { 'tower-close': { steady60: false } }), sweptReport()]);
  assert.equal(statusLine(dip, build), 'fail: every station camera steady at 60 FPS in every pair');
  const quiet = summarizeRuns([sweptReport(undefined, { 'south-front': { busy: false } }), sweptReport(), sweptReport()]);
  assert.equal(statusLine(quiet, build), 'fail: every station camera measured at a busy replay peak');
  const soft = summarizeRuns([sweptReport(undefined, { 'south-front': { realMetal: false } }), sweptReport(), sweptReport()]);
  assert.equal(statusLine(soft, build), 'fail: genuine unthrottled Metal on every station camera');
  const slow = report(); slow.cameras.shed.fps.p5 = 40;
  assert.equal(statusLine(summarizeRuns([{ ...sweptReport(), cameras: slow.cameras }, sweptReport(), sweptReport()]), { appPayloadWithinBudget: false }), 'fail: >=60 median/p5 FPS on the axis cameras; app payload budget');
});

const trainTiming = (first, full, train, draws) => ({ ...timing(first, full), navigationStartToReplayTrainsRenderedMs: train, replayTrainDrawsAtFirstRender: draws });
const withTrains = (warm, cold, draws = 12, startsAtPeak = true) => ({ ...report(), firstTrainVisible: { startsAtPeak },
  startup: { coldFreshProfile: trainTiming(100, 600, cold, draws), warmSecondLoadSameProfile: trainTiming(50, 300, warm, draws) } });

test('the warm-start first train visible metric is summarised over the pairs, with the draws in that frame and whether the replay began at its peak', () => {
  const result = summarizeRuns([withTrains(900, 2000), withTrains(1100, 2200), withTrains(1000, 2100, 14)]);
  assert.deepEqual(result.firstTrainVisible.warmMs, { min: 900, median: 1000, max: 1100 });
  assert.deepEqual(result.firstTrainVisible.coldMs, { min: 2000, median: 2100, max: 2200 });
  assert.deepEqual(result.firstTrainVisible.warmTrainDraws, [12, 12, 14]);
  assert.equal(result.firstTrainVisible.startsAtPeak, true);
  assert.deepEqual(result.aggregates.warm.firstTrainMs, { min: 900, median: 1000, max: 1100 });
  assert.deepEqual(result.samples.warm[0], { firstRenderMs: 50, sceneReadyMs: 300, firstTrainMs: 900, firstTrainDraws: 12 });
  const old = summarizeRuns([report(), report()]);
  assert.equal(old.firstTrainVisible, null, 'reports from before the metric have none');
  assert.equal(old.aggregates.warm.firstTrainMs, undefined);
  assert.deepEqual(old.samples.warm[0], { firstRenderMs: 50, sceneReadyMs: 300 });
  assert.equal(summarizeRuns([withTrains(1, 2), withTrains(1, 2, 12, false)]).firstTrainVisible.startsAtPeak, false, 'one pair that began at the recording\'s start is not a peak figure');
  assert.equal(summarizeRuns([withTrains(1, 2), report()]).firstTrainVisible, null, 'every warm load must have measured it');
});

test('the Markdown carries the first train, the replay peak and a row per station camera, and says when they were not measured', () => {
  const swept = summarizeRuns([{ ...sweptReport(), ...withTrains(900, 2000) }, { ...sweptReport(), ...withTrains(1100, 2200) }, { ...sweptReport(), ...withTrains(1000, 2100, 14) }]);
  const text = renderMarkdown(swept);
  assert.match(text, /First train visible \(navigation start to the first train draw\): warm second load 1000 ms \(900-1100 over the pairs\), with 12\/12\/14 train draws in that frame; cold fresh profile 2100 ms \(2000-2200 over the pairs\)\. The replay starts at its peak/);
  assert.match(text, /\| warm \| 1 \| 50 \| 300 \| 900 \|/, 'the sample table has the first train column');
  assert.match(text, /Fixed station cameras at the replay peak, 3 cold\/warm pairs of 2 cameras: 2 steady at 60 FPS in every pair; 2 measured at the peak in every pair\./);
  assert.match(text, /\| south-front \| 12 \(12\) \| 60 \| 60 \| 16\.8 \| 0 \| 0 \| yes \| yes \|/);
  assert.match(text, /Every station camera steady at 60 FPS in every pair: PASS\. Replay peak busy for every camera: PASS\. Station cameras on genuine unthrottled Metal: PASS\./);
  assert.match(text, /Replay peak \(scanned at 120x\): the replay starts at 2026-11-07T17:21:00\.000Z .* a camera counts as busy at a median of 9 or more\./);
  const bad = summarizeRuns([sweptReport(undefined, { 'tower-close': { steady60: false, busy: false, fps: { median: 41, p5: 30 }, frameDistribution: { p50: 16.7, p95: 33.3, p99: 50, max: 66.7, slowShare: .2, missedSlots: 40 } } }), sweptReport(), sweptReport()]);
  const badText = renderMarkdown(bad);
  assert.match(badText, /1 steady at 60 FPS in every pair; 1 measured at the peak in every pair\. Not steady in every pair: tower-close\./);
  assert.match(badText, /\| tower-close \| 12 \(12\) \| 41-60 \| 30 \| 50 \| 20 \| 40 \| NO \| NO \|/);
  assert.match(badText, /Every station camera steady at 60 FPS in every pair: FAIL\. Replay peak busy for every camera: FAIL\./);
  const bare = renderMarkdown(summarizeRuns([report(), report()]));
  assert.match(bare, /Every station camera steady at 60 FPS in every pair: NOT MEASURED\. Replay peak busy for every camera: NOT MEASURED\./);
  assert.match(bare, /First train visible: not measured\./); assert.match(bare, /Fixed station cameras at the replay peak: not measured\./); assert.match(bare, /Replay peak: not used/);
  assert.match(firstTrainMarkdown(null).join('\n'), /not measured/); assert.match(stationSweepMarkdown(null).join('\n'), /not measured/);
});

test('each pair\'s perf arguments: the first scans for the peak and measures the axis cameras, a later one reuses the peak and sweeps', () => {
  const flags = { '--seconds': '60', '--stations': 'all', '--station-seconds': '5', '--time': '2026-06-21T12:00:00+01:00' };
  const flag = name => flags[name];
  const first = pairPerfArgs({ perf: 'perf.mjs', dist: 'D', runOut: 'O1', flag });
  assert.deepEqual(first, ['perf.mjs', '--dist', 'D', '--out', 'O1', '--scene-ready', '--seconds', '60', '--time', '2026-06-21T12:00:00+01:00', '--station-seconds', '5', '--stations', 'all']);
  const later = pairPerfArgs({ perf: 'perf.mjs', dist: 'D', runOut: 'O2', flag, peakFrom: 'O1/perf.json' });
  assert.deepEqual(later, [...first.slice(0, 4), 'O2', ...first.slice(5), '--no-legacy-cameras', '--no-uncapped', '--peak-from', 'O1/perf.json']);
  const noSweep = pairPerfArgs({ perf: 'perf.mjs', dist: 'D', runOut: 'O2', flag: name => ({ '--stations': 'none' })[name], peakFrom: 'O1/perf.json' });
  assert.deepEqual(noSweep.slice(-3), ['--startup-only', '--peak-from', 'O1/perf.json'], 'with --stations none a later pair is startup only, as before the sweep');
  assert.ok(!first.includes('--peak-from') && !first.includes('--no-uncapped'), 'the first pair measures the headroom and scans for the peak');
  assert.ok(PERF_PAIR_LIMIT_MS >= 60 * 60_000, 'a pair\'s perf run takes most of an hour with the sweep');
});

test('the CLI accepts the station sweep options', async () => {
  await assert.rejects(main(['--runs', '1', '--stations', 'all', '--station-seconds', '5']), /integer/, 'the sweep options are known; the run count is what is wrong');
  await assert.rejects(main(['--stationz', '5']), /unknown option/);
});
