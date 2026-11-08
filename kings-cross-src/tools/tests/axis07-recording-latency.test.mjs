import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { analyzeRecording, distribution, markdown, main } from '../axis07-recording-latency.mjs';

async function fixture(t, lines) {
  const base = fileURLToPath(new URL('../../../.scratch/', import.meta.url));
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(resolve(base, 'recording-latency-test-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = resolve(dir, 'synthetic.ndjson');
  await writeFile(path, lines.map((r) => typeof r === 'string' ? r : JSON.stringify(r)).join('\n') + '\n');
  return { path, dir };
}
const row = (t, kind, fields = {}) => ({ t, e: { area: 'ZZ', kind, ...fields } });
const step = (t, time, from = 'A', to = 'B', descr = 'SYN1') => row(t, 'step', { time, from, to, descr });

test('recording latency: nearest rank quantiles retain exact extrema and bound clock outliers', () => {
  assert.deepEqual(distribution([1, 2, 3, 4, 5, NaN]).p50, 3);
  const d = distribution([-1000000, 10, 1000000]);
  assert.equal(d.n, 3); assert.equal(d.min, -1000000); assert.equal(d.max, 1000000);
  assert.equal(d.p99, 60000); assert.equal(d.clippedQuantileSamples, 2);
  assert.equal(distribution([]).p50, null);
});

test('recording latency: source age uses append time and counts only real steps in the selected area', async (t) => {
  const { path } = await fixture(t, [step(2250, 1000), step(4500, 3000, 'B', 'C'), step(2000, 2100, 'C', 'D'),
    step(5000, null, 'D', 'E'), step(6000, 1000, 'E', 'F', '****'),
    { ...step(7000, 1000), e: { ...step(7000, 1000).e, area: 'YY' } }, row(8000, 'trust', { time: 0 })]);
  const r = await analyzeRecording(path, { area: 'ZZ' });
  assert.equal(r.steps, 4); assert.equal(r.missingSourceTimeSteps, 1);
  assert.equal(r.sourceToRecorderAppendMs.n, 3); assert.equal(r.sourceToRecorderAppendMs.p50, 1250);
  assert.equal(r.sourceToRecorderAppendMs.max, 1500); assert.equal(r.thresholds.over1s, 2);
  assert.equal(r.thresholds.negative, 1); assert.equal(r.timestampPrecision.sourceTimes, 4);
  assert.equal(r.timestampPrecision.sourceTimesOnWholeSecond, 3);
  assert.equal(r.recorderMillisecondPhase.p50, 250);
});

test('recording latency: snapshot resets chains and CC or CB explains only its own subsequent gap', async (t) => {
  const { path } = await fixture(t, [step(1000, 1000), row(1100, 'interpose', { descr: 'SYN1', to: 'X' }),
    step(2000, 2000, 'X', 'Y'), row(2100, 'cancel', { descr: 'SYN1', from: 'Y' }),
    step(3000, 3000, 'M', 'N'), step(4000, 4000, 'J', 'K'),
    row(4500, 'snapshot', { berths: {} }), step(5000, 5000, 'Q', 'R')]);
  const r = await analyzeRecording(path, { area: 'ZZ' });
  assert.equal(r.snapshots, 1);
  assert.deepEqual(r.chains, { discontinuousDescriptionSteps: 3, afterInterpose: 1, afterCancel: 1,
    withoutObservedReset: 1, acrossOver60sBetweenDescriptionSteps: 0 });
});

test('recording latency: freezes a growing prefix and hashes its bytes without counting an incomplete tail', async (t) => {
  const { path } = await fixture(t, [step(1000, 1000)]);
  await appendFile(path, '{"t":');
  const { readFile } = await import('node:fs/promises');
  const frozen = await readFile(path);
  const r = await analyzeRecording(path, { area: 'ZZ', afterCapture: () => appendFile(path, '2000,"e":{}}\n') });
  assert.equal(r.rows, 1); assert.equal(r.ignoredTailBytes, 5); assert.equal(r.capturedBytes, frozen.length);
  assert.equal(r.sha256, createHash('sha256').update(frozen).digest('hex'));
});

test('recording latency: reports source regressions and invalid rows without sorting away wire order', async (t) => {
  const { path } = await fixture(t, [step(3000, 2000), step(2000, 1000, 'B', 'C'), '{bad}',
    row('bad', 'step'), step(65001, 65000, 'X', 'Y')]);
  const r = await analyzeRecording(path, { area: 'ZZ' });
  assert.equal(r.invalidRows, 2);
  assert.deepEqual(r.ordering, { receiveRegressions: 1, sourceRegressions: 1, descriptionSourceRegressions: 1 });
  assert.equal(r.chains.acrossOver60sBetweenDescriptionSteps, 1);
  assert.match(markdown([r]), /not a separate raw STOMP receipt/);
  assert.match(markdown([r]), /No historical SSE send/);
});

test('recording latency: refuses an overlarge row and output outside private scratch', async (t) => {
  const { path, dir } = await fixture(t, []);
  await writeFile(path, ' '.repeat(2 * 1024 * 1024 + 1));
  await assert.rejects(analyzeRecording(path), /exceeds 2 MiB/);
  await assert.rejects(main(['--recording', path, '--out', resolve(dir, '../../../public-output')]), /private .scratch/);
});
