import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateCpu, cpuProfileMarkdown } from '../perf.mjs';

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
