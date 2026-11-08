// Private, streaming timestamp audit. Historical recorder t is append-entry time,
// not a TCP receive, disk flush, SSE-send or browser-apply timestamp.
import { createReadStream } from 'node:fs';
import { stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

function histogram() {
  // Keep memory bounded even for malformed clocks or a recording growing all day.
  const limit = 60000, bins = new Uint32Array(limit * 2 + 1);
  let n = 0, sum = 0, min = Infinity, max = -Infinity, clipped = 0;
  return {
    add(value) {
      if (!Number.isFinite(value)) return;
      n++; sum += value; min = Math.min(min, value); max = Math.max(max, value);
      const rounded = Math.round(value);
      if (Math.abs(rounded) > limit) clipped++;
      bins[Math.max(-limit, Math.min(limit, rounded)) + limit]++;
    },
    result() {
      const q = (fraction) => {
        let total = 0;
        for (let i = 0; i < bins.length; i++) {
          total += bins[i];
          if (total >= Math.ceil(n * fraction)) return i - limit;
        }
        return null;
      };
      return { n, min: n ? min : null, p50: n ? q(0.5) : null, p95: n ? q(0.95) : null,
        p99: n ? q(0.99) : null, max: n ? max : null, mean: n ? sum / n : null,
        quantileResolutionMs: 1, clippedQuantileSamples: clipped, quantileLimitMs: limit };
    },
  };
}

export function distribution(values) {
  const stats = histogram();
  for (const value of values) stats.add(value);
  return stats.result();
}

export async function analyzeRecording(path, { area = 'Y9', afterCapture } = {}) {
  const capturedBytes = (await stat(path)).size;
  await afterCapture?.(); // A test can append after the same fixed-prefix boundary.
  const hash = createHash('sha256'), age = histogram(), phase = histogram();
  const last = new Map(), sourceByDescription = new Map();
  let rows = 0, tdRows = 0, steps = 0, missingSourceTimeSteps = 0, snapshots = 0;
  let invalidRows = 0, ignoredTailBytes = 0, firstMs = null, lastMs = null;
  let receiveRegressions = 0, sourceRegressions = 0, descriptionSourceRegressions = 0;
  let sourceTimes = 0, sourceTimesOnWholeSecond = 0, previousSource, previousReceive;
  let gaps = 0, gapsAfterInterpose = 0, gapsAfterCancel = 0, gapsAcrossReceiveSilence = 0;
  const thresholds = { over1s: 0, over2s: 0, over5s: 0, over10s: 0, negative: 0 };
  const accept = (line) => {
    if (!line.toString('utf8').trim()) return;
    let row;
    try { row = JSON.parse(line.toString('utf8')); } catch { invalidRows++; return; }
    if (!Number.isFinite(row?.t) || !row.e || typeof row.e !== 'object') { invalidRows++; return; }
    rows++;
    firstMs = firstMs === null ? row.t : Math.min(firstMs, row.t);
    lastMs = lastMs === null ? row.t : Math.max(lastMs, row.t);
    if (previousReceive !== undefined && row.t < previousReceive) receiveRegressions++;
    previousReceive = row.t;
    const e = row.e;
    if (e.area !== area) return;
    if (e.kind === 'snapshot') { snapshots++; last.clear(); sourceByDescription.clear(); return; }
    if (!['step', 'interpose', 'cancel', 'signal'].includes(e.kind)) return;
    tdRows++;
    if (Number.isFinite(e.time)) {
      sourceTimes++;
      if (e.time % 1000 === 0) sourceTimesOnWholeSecond++;
      if (previousSource !== undefined && e.time < previousSource) sourceRegressions++;
      previousSource = e.time;
      if (typeof e.descr === 'string') {
        const priorTime = sourceByDescription.get(e.descr);
        if (priorTime !== undefined && e.time < priorTime) descriptionSourceRegressions++;
        sourceByDescription.set(e.descr, e.time);
      }
    }
    if (e.descr === '****' || typeof e.descr !== 'string') return;
    if (e.kind === 'interpose' || e.kind === 'cancel') {
      const prior = last.get(e.descr);
      if (prior) prior.reset = e.kind;
      return;
    }
    if (e.kind !== 'step') return;
    steps++;
    if (!Number.isFinite(e.time)) missingSourceTimeSteps++;
    else {
      const lag = row.t - e.time;
      age.add(lag); phase.add(((row.t % 1000) + 1000) % 1000);
      if (lag > 1000) thresholds.over1s++;
      if (lag > 2000) thresholds.over2s++;
      if (lag > 5000) thresholds.over5s++;
      if (lag > 10000) thresholds.over10s++;
      if (lag < 0) thresholds.negative++;
    }
    const prior = last.get(e.descr);
    if (prior && prior.to !== e.from) {
      gaps++;
      if (prior.reset === 'interpose') gapsAfterInterpose++;
      if (prior.reset === 'cancel') gapsAfterCancel++;
      if (row.t - prior.t > 60000) gapsAcrossReceiveSilence++;
    }
    last.set(e.descr, { to: e.to, t: row.t });
  };
  let pending = Buffer.alloc(0);
  if (capturedBytes) for await (const chunk of createReadStream(path, { start: 0, end: capturedBytes - 1 })) {
    hash.update(chunk);
    pending = Buffer.concat([pending, chunk]);
    let start = 0, end;
    while ((end = pending.indexOf(10, start)) !== -1) {
      if (end - start > 2 * 1024 * 1024) throw new Error('recording row exceeds 2 MiB');
      accept(pending.subarray(start, end)); start = end + 1;
    }
    pending = pending.subarray(start);
    if (pending.length > 2 * 1024 * 1024) throw new Error('recording row exceeds 2 MiB');
  }
  if (pending.length) {
    // An actively appended file may end halfway through a row. Do not invent one.
    try { JSON.parse(pending.toString('utf8')); accept(pending); } catch { ignoredTailBytes = pending.length; }
  }
  return { file: resolve(path), capturedBytes, sha256: hash.digest('hex'), firstMs, lastMs, rows, tdRows, steps,
    invalidRows, ignoredTailBytes, snapshots, missingSourceTimeSteps,
    sourceToRecorderAppendMs: age.result(), thresholds, recorderMillisecondPhase: phase.result(),
    timestampPrecision: { sourceTimes, sourceTimesOnWholeSecond },
    ordering: { receiveRegressions, sourceRegressions, descriptionSourceRegressions },
    chains: { discontinuousDescriptionSteps: gaps, afterInterpose: gapsAfterInterpose, afterCancel: gapsAfterCancel,
      withoutObservedReset: gaps - gapsAfterInterpose - gapsAfterCancel, acrossOver60sBetweenDescriptionSteps: gapsAcrossReceiveSilence },
    limitations: ['t is recorder append entry before asynchronous disk flushing; it is not a separate raw STOMP receipt timestamp.',
      'Source-to-append age includes source timestamp granularity, source/relay clock offset and transport/processing. Those cannot be separated retrospectively.',
      'No historical SSE send or browser apply timestamps exist. Source regressions are not proof of relay reordering.',
      'A description-chain discontinuity is not proof of a dropped message; interpose, cancel, rename, reuse and reconnect also affect chains.',
      'Quantiles use nearest rank and 1 ms bins, clipped at ±60 s; exact min/max/mean are retained.'] };
}

export function markdown(reports) {
  const lines = ['# Recording timestamp age (private)', '',
    '| Recording | Steps | >1 s | p50 ms | p95 ms | p99 ms | Max ms | Chain gaps | CC/CB resets | Unexplained by CC/CB |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|'];
  for (const r of reports) lines.push(`| ${r.file.split('/').at(-1)} | ${r.steps} | ${r.thresholds.over1s} | ${r.sourceToRecorderAppendMs.p50} | ${r.sourceToRecorderAppendMs.p95} | ${r.sourceToRecorderAppendMs.p99} | ${r.sourceToRecorderAppendMs.max} | ${r.chains.discontinuousDescriptionSteps} | ${r.chains.afterInterpose + r.chains.afterCancel} | ${r.chains.withoutObservedReset} |`);
  lines.push('', ...reports[0]?.limitations.map((s) => `- ${s}`) ?? [], '',
    'The JSON includes captured byte counts, SHA-256, time windows, timestamp precision, ordering and tail diagnostics.', '');
  return lines.join('\n');
}

export async function main(args) {
  const files = []; let out, area = 'Y9';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--recording' && args[i + 1]) files.push(resolve(args[++i]));
    else if (args[i] === '--out' && args[i + 1]) out = resolve(args[++i]);
    else if (args[i] === '--area' && args[i + 1]) area = args[++i];
    else throw new Error('usage: --recording PATH [--recording PATH] --out WORKTREE/.scratch/DIR [--area Y9]');
  }
  const scratch = fileURLToPath(new URL('../../.scratch/', import.meta.url));
  const sub = out && relative(scratch, out);
  if (!files.length || !out || sub === '..' || sub?.startsWith('../') || isAbsolute(sub ?? '')) throw new Error('recordings and private .scratch output required');
  const reports = [];
  for (const file of files) reports.push(await analyzeRecording(file, { area }));
  await mkdir(out, { recursive: true });
  await writeFile(resolve(out, 'recording-latency.json'), JSON.stringify(reports, null, 2) + '\n');
  await writeFile(resolve(out, 'recording-latency.md'), markdown(reports));
  console.log(markdown(reports));
  return reports;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(() => { console.error('recording latency audit failed; check input paths and private output directory'); process.exitCode = 1; });
}
