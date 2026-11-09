import assert from 'node:assert/strict';
import test from 'node:test';
import { HEADROOM_FPS_TARGET, UNCAPPED_CONTROL_RATIO, UNCAPPED_FLAGS, aggregateCpu, cpuProfileMarkdown, headroomMarkdown, headroomReport, headroomVsBaseline } from '../perf.mjs';

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
});
