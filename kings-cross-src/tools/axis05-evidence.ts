// Local-only Axis 05 evidence. Never commit captured TD inputs or generated reports.
import { readFile, writeFile, realpath, mkdir, open, lstat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { matchService, validDate } from '../core/schedule.ts';
import type { ScheduleCall } from '../core/schedule.ts';
import { createTrainKinds } from '../web/src/trains-live.ts';
import { auditRecording, renderMotionAuditMarkdown } from './motion-audit.ts';
import type { MotionAuditSample } from './motion-audit.ts';
import { runReplayReport } from './replay-report.ts';
import { parseRecording } from '../web/src/feed.ts';
import type { RecordedEvent } from '../web/src/feed.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { KxData } from '../core/osm.ts';

export interface CaptureCandidate {
  recordingIndex: number; trainId: number; description: string; platform: string;
  direction: 'arrival' | 'departure'; startMs: number; endMs: number; transitionMs: number;
  movedM: number; headingRadians: number;
  kind?: string; frames?: ReturnType<typeof frame>[];
}
const frame = (s: MotionAuditSample) => ({ timeMs: s.atMs, point: s.train.leading.point, speedMps: s.train.speed, state: s.train.state,
  heading: s.train.heading, distanceM: s.train.distanceM, reversals: s.train.reversals, lengthM: s.train.lengthM,
  occupied: s.train.occupied.map((p) => ({ a: p.edge.a, b: p.edge.b, fromT: p.fromT, toT: p.toT })) });
const selectFrames = (samples: MotionAuditSample[], start: number, end: number) => {
  const targets = Array.from({ length: 5 }, (_, i) => start + (end - start) * i / 4);
  return targets.map((at) => frame(samples.reduce((best, sample) => Math.abs(sample.atMs - at) < Math.abs(best.atMs - at) ? sample : best)));
};
const distribution = () => {
  const bins = new Map<number, number>(); let samples = 0, sum = 0, max = 0;
  return {
    add(value: number) { const bin = Math.round(value * 100); bins.set(bin, (bins.get(bin) ?? 0) + 1); samples++; sum += value; max = Math.max(max, value); },
    result() {
      const ordered = [...bins].sort((a, b) => a[0] - b[0]);
      const quantile = (p: number) => { let count = 0; for (const [bin, n] of ordered) { count += n; if (count >= Math.ceil(samples * p)) return bin / 100; } return null; };
      return { samples, mean: samples ? sum / samples : null, p50: quantile(0.5), p95: quantile(0.95), p99: quantile(0.99), max,
        quantileResolution: 0.01 };
    },
  };
};
export function evidenceCollector(recordingIndex: number) {
  const zones = new Map<string, { speed: ReturnType<typeof distribution>; acceleration: ReturnType<typeof distribution>; deceleration: ReturnType<typeof distribution>; limit: ReturnType<typeof distribution>; speedViolations: number }>();
  type History = { samples: MotionAuditSample[]; pending?: CaptureCandidate; heldSince?: number; lastHeld?: MotionAuditSample; wasHeld: boolean };
  const histories = new Map<number, History>(), captureCandidates: CaptureCandidate[] = [];
  // Canonical occupied-interval coordinates do not change when a stationary train swaps cabs.
  // Retain order through a coincident-center tick, but reset if either body leaves the edge.
  let tickMs: number | undefined, previousTickMs: number | undefined;
  const tickSamples = new Map<number, MotionAuditSample>();
  let previousOrders = new Map<string, number>();
  const exchanges: { atMs: number; edge: [number, number]; trainIds: [number, number] }[] = [];
  const exchangedPairs = new Set<string>();
  const flushTick = () => {
    if (!tickSamples.size) return;
    if (previousTickMs !== undefined && tickMs! - previousTickMs > 100.0001) previousOrders.clear();
    previousTickMs = tickMs;
    const edges = new Map<string, { edge: [number, number]; trains: Map<number, { min: number; max: number }> }>();
    for (const sample of tickSamples.values()) for (const occupied of sample.train.occupied) {
      const a = Math.min(occupied.edge.a, occupied.edge.b), b = Math.max(occupied.edge.a, occupied.edge.b);
      const from = occupied.edge.a === a ? occupied.fromT : 1 - occupied.fromT;
      const to = occupied.edge.a === a ? occupied.toT : 1 - occupied.toT;
      if (Math.abs(to - from) <= 1e-9) continue;
      const key = `${a}:${b}`;
      let entry = edges.get(key);
      if (!entry) { entry = { edge: [a, b], trains: new Map() }; edges.set(key, entry); }
      const prior = entry.trains.get(sample.train.id);
      entry.trains.set(sample.train.id, { min: Math.min(from, to, prior?.min ?? Infinity), max: Math.max(from, to, prior?.max ?? -Infinity) });
    }
    const currentOrders = new Map<string, number>();
    for (const [edgeKey, entry] of edges) {
      const trains = [...entry.trains].sort((a, b) => a[0] - b[0]);
      for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) {
        const [idA, a] = trains[i]!, [idB, b] = trains[j]!;
        const delta = (a.min + a.max - b.min - b.max) / 2;
        const order = Math.abs(delta) <= 1e-9 ? 0 : Math.sign(delta);
        const pair = `${idA}:${idB}`, key = `${edgeKey}:${pair}`, previous = previousOrders.get(key);
        if (order !== 0 && previous !== undefined && previous !== 0 && order !== previous) {
          exchanges.push({ atMs: tickMs!, edge: entry.edge, trainIds: [idA, idB] });
          exchangedPairs.add(pair);
        }
        currentOrders.set(key, order || previous || 0);
      }
    }
    previousOrders = currentOrders;
    tickSamples.clear();
  };
  const onSample = (s: MotionAuditSample) => {
    if (tickMs !== undefined && s.atMs !== tickMs) flushTick();
    tickMs = s.atMs;
    tickSamples.set(s.train.id, s);
    let z = zones.get(s.zone);
    if (!z) { z = { speed: distribution(), acceleration: distribution(), deceleration: distribution(), limit: distribution(), speedViolations: 0 }; zones.set(s.zone, z); }
    z.speed.add(s.train.speed); z.acceleration.add(s.accelerationMps2); z.deceleration.add(s.decelerationMps2); z.limit.add(s.speedLimitMps);
    if (s.train.speed > s.speedLimitMps + 0.05) z.speedViolations++;
    let h = histories.get(s.train.id);
    if (!h) { h = { samples: [], wasHeld: false }; histories.set(s.train.id, h); }
    const held = s.heldPlatform !== undefined && s.train.speed <= 0.05 && s.train.state === 'held';
    if (held && !h.wasHeld) {
      h.heldSince = s.atMs;
      const moving = h.samples.find((p) => p.train.speed > 0.05 && s.train.distanceM - p.train.distanceM >= 1);
      if (moving) h.pending = { recordingIndex, trainId: s.train.id, description: s.train.description, platform: s.heldPlatform!, direction: 'arrival',
        startMs: Math.max(moving.atMs, s.atMs - 25000), endMs: s.atMs + 2000, transitionMs: s.atMs,
        movedM: s.train.distanceM - moving.train.distanceM, headingRadians: s.train.heading };
    }
    if (held) {
      if (h.pending?.direction === 'arrival' && s.atMs >= h.pending.endMs) { h.pending.frames = selectFrames([...h.samples, s], h.pending.startMs, h.pending.endMs); captureCandidates.push(h.pending); h.pending = undefined; }
      h.lastHeld = s;
    } else {
      if (h.pending?.direction === 'arrival') h.pending = undefined;
      if (h.wasHeld && h.lastHeld && h.heldSince !== undefined && h.lastHeld.atMs - h.heldSince >= 2000 && s.train.speed > 0.05) {
        h.pending = { recordingIndex, trainId: s.train.id, description: s.train.description, platform: h.lastHeld.heldPlatform!, direction: 'departure',
          startMs: Math.max(h.heldSince, s.atMs - 2000), endMs: s.atMs + 15000, transitionMs: s.atMs,
          movedM: 0, headingRadians: s.train.heading };
      }
      if (h.pending?.direction === 'departure' && h.lastHeld) {
        h.pending.movedM = s.train.distanceM - h.lastHeld.train.distanceM;
        if (s.atMs >= h.pending.endMs) {
          if (h.pending.movedM >= 1 && s.train.speed > 0.05) { h.pending.frames = selectFrames([...h.samples, s], h.pending.startMs, h.pending.endMs); captureCandidates.push(h.pending); }
          h.pending = undefined;
        }
      }
    }
    h.wasHeld = held;
    h.samples.push(s);
    while (h.samples.length && h.samples[0]!.atMs < s.atMs - 30000) h.samples.shift();
  };
  return { onSample, result: () => { flushTick(); return ({ captureCandidates,
    passThrough: { sameEdgeOrderExchangeSamples: exchanges.length, distinctPairs: exchangedPairs.size, exchanges,
      method: 'Compare occupied-interval centers for each pair on the same canonical graph edge at consecutive occupied sample ticks; retain the previous order through equal-center samples. A stationary cab swap leaves the occupied interval unchanged and cannot reverse this order. These are sampled order-exchange candidates, not proof of continuous physical collision; initial placement/reconciliation and partial-body entry can affect interval centers.' },
    distributionsByZone: Object.fromEntries([...zones].map(([zone, z]) => [zone,
    { speedMps: z.speed.result(), accelerationMps2: z.acceleration.result(), decelerationMps2: z.deceleration.result(), applicableSpeedLimitMps: z.limit.result(), speedViolationSamples: z.speedViolations }])) }); } };
}
export function handlingEvidence(rows: readonly RecordedEvent[], anchors: AnchorMap) {
  const mapped = new Set(anchors.anchors.map((a) => a.berth));
  let lateSourceSteps = 0, missingSourceTimeSteps = 0, missingMappedEndpointSteps = 0, discontinuousDescriptionSteps = 0, snapshots = 0, steps = 0;
  let maxSourceLagMs = 0;
  const last = new Map<string, string>();
  for (const { t, e } of rows) {
    if (e.area !== anchors.area) continue;
    if (e.kind === 'snapshot') { snapshots++; last.clear(); }
    if (e.kind !== 'step' || e.descr === '****') continue;
    steps++;
    if (e.time == null) missingSourceTimeSteps++;
    else { const lag = t - e.time; maxSourceLagMs = Math.max(maxSourceLagMs, lag); if (lag > 1000) lateSourceSteps++; }
    if (!mapped.has(e.from!) || !mapped.has(e.to!)) missingMappedEndpointSteps++;
    const prior = last.get(e.descr!);
    if (prior !== undefined && prior !== e.from) discontinuousDescriptionSteps++;
    last.set(e.descr!, e.to!);
  }
  return { steps, lateSourceSteps, lateThresholdMs: 1000, maxSourceLagMs, missingSourceTimeSteps, missingMappedEndpointSteps, discontinuousDescriptionSteps, snapshots,
    meaning: 'Lag compares recorder t with TD source time. Description discontinuity is an observed chain gap, not proof of a dropped message; rename/reconnect can also cause it. Missing endpoints mean no mapped anchor. Unknown missing wire steps cannot be counted. Playback reconciles checkpoints, applies late observations at delivery, and never preloads future chains.' };
}
/** Explicit per-day caches only. Never borrow a neighbouring day's repeated headcodes. */
export function axis05SchedulePolicy(documents: readonly unknown[]) {
  const schedules = new Map<string, readonly ScheduleCall[]>();
  for (const document of documents) {
    const doc = document as { date?: unknown; dates?: unknown; calls?: unknown } | null;
    if (!doc || typeof doc.date !== 'string' || !validDate(doc.date) || doc.dates !== undefined || !Array.isArray(doc.calls)) {
      throw new Error('--schedule must contain one valid date and calls array (not dates)');
    }
    if (schedules.has(doc.date)) throw new Error(`duplicate schedule date: ${doc.date}`);
    for (const call of doc.calls) {
      if (!call || typeof call !== 'object' || call.date !== doc.date || typeof call.headcode !== 'string' ||
          typeof call.operator !== 'string' || typeof call.origin !== 'string' || typeof call.destination !== 'string' ||
          typeof call.uid !== 'string' || typeof call.serviceDate !== 'string' ||
          ![call.arrivalMs, call.departureMs].every((value) => value === null || typeof value === 'number' && Number.isFinite(value))) {
        throw new Error(`invalid schedule call for ${doc.date}`);
      }
    }
    schedules.set(doc.date, doc.calls as ScheduleCall[]);
  }
  return {
    dates: [...schedules.keys()].sort(),
    serviceFor(description: string, atMs: number) {
      const calls = schedules.get(new Date(atMs).toISOString().slice(0, 10));
      return calls ? matchService(description, atMs, calls) : undefined;
    },
  };
}

const isInside = (root: string, path: string) => { const r = relative(root, path); return !!r && !r.startsWith('..') && !isAbsolute(r); };
async function freezeAxisInput(out: string, scratch: string, name: string, path: string, bytes: Buffer) {
  const directory = resolve(out, 'inputs');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (!isInside(scratch, await realpath(directory))) throw new Error('captured input directory escapes .scratch');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const capturedPath = resolve(directory, `${name}-${sha256.slice(0, 12)}.json`);
  try {
    const handle = await open(capturedPath, 'wx', 0o600);
    try { await handle.writeFile(bytes); } finally { await handle.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(capturedPath);
    if (!info.isFile() || info.isSymbolicLink() || createHash('sha256').update(await readFile(capturedPath)).digest('hex') !== sha256) {
      throw new Error(`captured input path already exists with different content: ${capturedPath}`);
    }
  }
  if (!isInside(scratch, await realpath(capturedPath))) throw new Error('captured input symlink escapes .scratch');
  return { path, capturedPath, bytes: bytes.length, sha256 };
}

export async function runAxis05(args: string[]) {
  // Replay CLI owns bounded capture, partial growing-tail handling, hashes and output containment.
  const replayArgs: string[] = [], schedulePaths: string[] = [];
  let sclassPath: string | undefined;
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if (key === '--schedule' || key === '--sclass') {
      if (!value || value.startsWith('--') || key === '--sclass' && sclassPath !== undefined) throw new Error(`invalid or repeated ${key}`);
      if (key === '--schedule') schedulePaths.push(resolve(value)); else sclassPath = resolve(value);
    } else replayArgs.push(key, value!);
  }
  const scheduleBytes = await Promise.all(schedulePaths.map((path) => readFile(path)));
  const policy = axis05SchedulePolicy(scheduleBytes.map((bytes) => JSON.parse(bytes.toString('utf8'))));
  const sclassBytes = sclassPath ? await readFile(sclassPath) : undefined;
  if (sclassBytes) {
    const doc = JSON.parse(sclassBytes.toString('utf8'));
    if (!doc || typeof doc.area !== 'string' || !Array.isArray(doc.hypotheses)) throw new Error('--sclass must be a relay hypothesis document');
  }
  const frozen = await runReplayReport(replayArgs);
  const repro = frozen.reproducibility!;
  const inputs = repro.inputHashes;
  const outIndex = args.indexOf('--out'), out = resolve(args[outIndex + 1]!);
  const data = JSON.parse(await readFile(inputs.graph.capturedPath, 'utf8')) as KxData;
  const anchors = JSON.parse(await readFile(inputs.anchors.capturedPath, 'utf8')) as AnchorMap;
  const scratch = await realpath(fileURLToPath(new URL('../../.scratch', import.meta.url)));
  const schedules = [];
  for (const [index, path] of schedulePaths.entries()) {
    const date = JSON.parse(scheduleBytes[index]!.toString()).date as string;
    schedules.push({ ...await freezeAxisInput(out, scratch, `schedule-${date}`, path, scheduleBytes[index]!), date });
  }
  const sclass = sclassBytes ? await freezeAxisInput(out, scratch, 'sclass', sclassPath!, sclassBytes) : undefined;
  const lengthPolicy = schedules.length
    ? `Page createTrainKinds/matchService at physical birth using UTC-day schedule caches (${policy.dates.join(', ')}); missing days and unmatched services explicitly use the page headcode fallback.`
    : 'No schedule supplied; GPU schedule endpoint must return 404.';
  const recordings = [];
  for (const [index, input] of inputs.recordings.entries()) {
    const rows = parseRecording(await readFile(input.capturedPath, 'utf8'));
    const collector = evidenceCollector(index);
    const kinds = createTrainKinds(policy.serviceFor);
    const audit = auditRecording(rows, data, anchors, { onSample: collector.onSample, lengthM: kinds.lengthM,
      lengthPolicy });
    const trains = audit.trains.map((t) => ({ ...t, kind: kinds.formationFor(t)?.kind }));
    const measured = collector.result();
    for (const candidate of measured.captureCandidates) candidate.kind = kinds.formationFor({ id: candidate.trainId })?.kind;
    const replay = frozen.recordings?.[index]?.metrics ?? frozen;
    const observedDates = [...new Set(rows.map((row) => new Date(row.t).toISOString().slice(0, 10)))].sort();
    const scheduleCoverage = { observedDates, scheduledDates: observedDates.filter((date) => policy.dates.includes(date)),
      fallbackDates: observedDates.filter((date) => !policy.dates.includes(date)) };
    recordings.push({ index, input, scheduleCoverage, audit: { ...audit, trains }, handling: { ...handlingEvidence(rows, anchors),
      replayOutcomes: { lengthPolicy: 'Independent replay-report fallback lengths; scheduled drawn-motion metrics are in audit/distributions above.',
        motion: replay.motion, stepSummary: replay.stepSummary, platformStepSummary: replay.platformStepSummary } }, ...measured });
  }
  const report = { schemaVersion: 1, recordings, captureCandidates: recordings.flatMap((r) => r.captureCandidates),
    lengthPolicy, schedulePolicy: { dates: policy.dates, missingDays: 'page headcode fallback', selection: 'UTC date at physical birth' },
    sclassPolicy: 'Provenance only; does not affect motion or signal thresholds.', reproducibility: { ...repro,
      inputHashes: { ...inputs, ...(schedules.length ? { schedules } : {}), ...(sclass ? { sclass } : {}) },
      command: { ...repro.command, args: [fileURLToPath(import.meta.url), ...repro.command.args.slice(1), ...schedules.flatMap((input) => ['--schedule', input.capturedPath]), ...(sclass ? ['--sclass', sclass.capturedPath] : [])] } }, references: recordings[0]!.audit.method.references,
    limitations: ['All distributions sample the drawn model at 100 ms, including stationary trains; quantiles round to 0.01 units. These are simulation measurements, not telemetry of actual railway speed.',
      'Route-distance consistency compares the motion odometer with a conservative lower bound from endpoint speeds, assuming the audit acceleration/deceleration bounds between samples and allowing 0.05 m tolerance. It detects reported motion without sufficient route travel; it is not independent proof of continuous body trajectory.',
      'Speed limits use OSM way tags and existing model caps; 0.7 m/s², 3 m buffer clearance and 2 m platform tolerance are modeling audit bounds, not independently certified infrastructure rules.',
      lengthPolicy,
      'Overlap counts test occupied-track intersection each tick. Separate same-edge occupied-center order exchanges detect sampled pass-through candidates. Zero sampled findings do not prove continuous-time absence of overlap/pass-through between samples.',
      'Capture candidates require measured body travel of at least 1 m, two seconds of platform hold, and full recording-relative timestamps. Direction is the arrival/departure transition; headingRadians is the drawn departure/arrival cab orientation.'] };
  // Guard report filenames too: a preexisting output file could itself be an escaping symlink.
  for (const name of ['axis05-evidence.json', 'axis05-evidence.md']) {
    try { const r = relative(scratch, await realpath(resolve(out, name))); if (!r || r.startsWith('..') || isAbsolute(r)) throw new Error('report symlink escapes .scratch'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  await writeFile(resolve(out, 'axis05-evidence.json'), JSON.stringify(report, null, 2) + '\n');
  const md = '# Axis 05 motion evidence\n\n' + report.limitations.map((s) => `- ${s}`).join('\n') + '\n\n' + recordings.map((r) =>
    `## Recording ${r.index}: ${r.input.sha256}\n\n${renderMotionAuditMarkdown(r.audit)}\n\nHandling: ${JSON.stringify(r.handling)}\n\nPass-through: ${JSON.stringify(r.passThrough)}\n\nDistributions: ${JSON.stringify(r.distributionsByZone)}\n`).join('\n') +
    '\n## GPU capture candidates\n\n```json\n' + JSON.stringify(report.captureCandidates, null, 2) + '\n```\n';
  await writeFile(resolve(out, 'axis05-evidence.md'), md);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) runAxis05(process.argv.slice(2))
  .then((r) => console.log(JSON.stringify({ recordings: r.recordings.length, candidates: r.captureCandidates.length, counts: r.recordings.map((x) => x.audit.counts) })))
  .catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
