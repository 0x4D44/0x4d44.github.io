// Node observation of the page's actual live/replay feed APIs. Private events and samples
// stay in .scratch. Checkpoint mode aligns the initial worlds; immediate mode also exposes
// stale/incomplete recorder checkpoints, with a separately labelled initialization control.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildGraph } from '../core/graph.ts';
import { createMotion } from '../core/motion.ts';
import type { TrainView } from '../core/motion.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { KxData } from '../core/osm.ts';
import { matchService } from '../core/schedule.ts';
import type { ScheduleCall } from '../core/schedule.ts';
import { createTrainKinds } from '../web/src/trains-live.ts';
import { createLiveFeed, createReplayFeed, parseRecording, ukDate } from '../web/src/feed.ts';
import type { EventStream, RecordedEvent, SnapshotEvent, TrainFeed } from '../web/src/feed.ts';

export interface SampleTrain {
  id: number; description: string; edge: [number, number, number]; t: number; point: [number, number];
}
export interface MotionSample { atMs: number; trains: SampleTrain[] }
/** Live motion uses elapsed milliseconds; replay motion uses recorder epoch milliseconds. */
export function comparisonServiceFor(calls: readonly ScheduleCall[], epochBaseMs = 0) {
  return (description: string, timeMs: number): ScheduleCall | undefined => matchService(description, epochBaseMs + timeMs, calls);
}
const quantile = (values: number[], p: number): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor((sorted.length - 1) * p)]!;
};
export function sampleTrains(trains: TrainView[]): SampleTrain[] {
  return trains.map((t) => ({ id: t.id, description: t.description,
    edge: [t.leading.edge.a, t.leading.edge.b, t.leading.edge.wayId] as [number, number, number],
    t: t.leading.t, point: [...t.leading.point] as [number, number] })).sort((a, b) => a.id - b.id);
}

/** Compare labels as well as physical ids; report id disagreement rather than remapping it. */
export function compareSamples(live: MotionSample[], replay: MotionSample[]) {
  const byTime = new Map(replay.map((s) => [s.atMs, s]));
  let sameTrainSetSeconds = 0, missingSampleSeconds = 0, liveOnly = 0, replayOnly = 0;
  let matched = 0, idsAgree = 0, edgeAgree = 0, descriptionByIdAgree = 0, commonIds = 0;
  const differences: number[] = [];
  const seconds = live.map((a) => {
    const b = byTime.get(a.atMs);
    if (!b) { missingSampleSeconds++; return { atMs: a.atMs, live: a.trains.length, replay: null, sameTrains: false, maxPositionDifferenceM: null }; }
    const la = new Map(a.trains.map((t) => [t.description, t])), rb = new Map(b.trains.map((t) => [t.description, t]));
    const bi = new Map(b.trains.map((t) => [t.id, t]));
    const sameTrains = la.size === rb.size && [...la.keys()].every((d) => rb.has(d));
    if (sameTrains) sameTrainSetSeconds++;
    let max = 0;
    for (const t of a.trains) {
      const id = bi.get(t.id);
      if (id) { commonIds++; if (id.description === t.description) descriptionByIdAgree++; }
      const other = rb.get(t.description);
      if (!other) { liveOnly++; continue; }
      matched++; if (t.id === other.id) idsAgree++;
      if (t.edge.every((v, i) => v === other.edge[i])) edgeAgree++;
      const distance = Math.hypot(t.point[0] - other.point[0], t.point[1] - other.point[1]);
      differences.push(distance); max = Math.max(max, distance);
    }
    for (const t of b.trains) if (!la.has(t.description)) replayOnly++;
    return { atMs: a.atMs, live: a.trains.length, replay: b.trains.length, sameTrains, maxPositionDifferenceM: max };
  });
  const p95 = quantile(differences, 0.95);
  return { samples: live.length, replaySamples: replay.length, sameTrainSetSeconds, missingSampleSeconds,
    liveOnlyTrainSamples: liveOnly, replayOnlyTrainSamples: replayOnly, matchedTrainSamples: matched,
    matchingPhysicalIds: idsAgree, matchingEdges: edgeAgree, commonIdSamples: commonIds, descriptionByIdAgreement: descriptionByIdAgree,
    positionDifferenceM: { median: quantile(differences, 0.5), p95, max: differences.length ? Math.max(...differences) : null },
    passed: live.length > 0 && live.length === replay.length && missingSampleSeconds === 0 && sameTrainSetSeconds === live.length && p95 !== null && p95 < 5,
    seconds };
}

/** Last complete checkpoint before the requested wall clock; no fabricated initial state. */
export function snapshotWindow(rows: RecordedEvent[], startMs: number, endMs: number): RecordedEvent[] {
  let index = -1;
  for (let i = 0; i < rows.length && rows[i]!.t <= startMs; i++) if (rows[i]!.e.kind === 'snapshot') index = i;
  if (index < 0) throw new Error('no recorded snapshot at or before the live window');
  return rows.slice(index).filter((r) => r.t <= endMs);
}

/** Reconstruct the TD picture independently of motion, to distinguish missing input
 * from different physical histories. Placeholder descriptions remain legitimate TD state. */
export function recordedPictureAt(rows: readonly RecordedEvent[], atMs: number, area: string): Record<string, string> {
  let picture: Record<string, string> = {};
  for (const { t, e } of rows) {
    if (t > atMs) break;
    if (e.area !== area) continue;
    if (e.kind === 'snapshot') picture = { ...(e as SnapshotEvent).berths };
    else if (e.kind === 'step') { if (e.from) delete picture[e.from]; if (e.to && e.descr) picture[e.to] = e.descr; }
    else if (e.kind === 'interpose' && e.to && e.descr) picture[e.to] = e.descr;
    else if (e.kind === 'cancel' && e.from) delete picture[e.from];
  }
  return picture;
}

class ObservedSource implements EventStream {
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  listeners = new Map<string, ((event: MessageEvent<string>) => void)[]>();
  closed = false;
  addEventListener(type: string, fn: (event: MessageEvent<string>) => void): void {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  emit(type: string, data: string): void {
    if (!this.closed) for (const fn of this.listeners.get(type) ?? []) fn({ data } as MessageEvent<string>);
  }
  close(): void { this.closed = true; }
}

async function scratchDirectory(out: string): Promise<void> {
  const scratch = fileURLToPath(new URL('../../.scratch', import.meta.url));
  const inside = (p: string, c: string) => { const r = relative(p, c); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
  if (!inside(scratch, out)) throw new Error('--out must be beneath the worktree .scratch');
  await mkdir(scratch, { recursive: true });
  let ancestor = out;
  for (;;) {
    try { const actual = await realpath(ancestor), base = await realpath(scratch); if (actual !== base && !inside(base, actual)) throw new Error('output symlink escapes .scratch'); break; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = dirname(ancestor); }
  }
  await mkdir(out, { recursive: true });
}

const repoRoot=fileURLToPath(new URL('../../',import.meta.url));
export function comparisonReproduction(directory: string, out: string) {
  return {cwd:repoRoot,command:'node',args:['kings-cross-src/tools/live-vs-replay.ts','--summarize',directory,'--out',out]};
}

/** Re-evaluate captured samples without opening a connection or inventing a live run. */
export async function summarizeCapture(directory: string, out: string) {
  const {safeOutputDirectory,writePrivateFile,within}: {
    safeOutputDirectory(root:string,directory:string):Promise<string>;
    writePrivateFile(file:string,body:string):Promise<void>;
    within(root:string,file:string):boolean;
  }=await import(new URL('./evidence.mjs',import.meta.url).href);
  if(out===resolve(repoRoot,'.scratch')||!within(resolve(repoRoot,'.scratch'),out))throw new Error('--out must be beneath worktree .scratch');
  await safeOutputDirectory(repoRoot,out);
  const filenames=['live-samples.json','replay-samples.json','live-vs-replay.json'];
  const texts=await Promise.all(filenames.map(f=>readFile(resolve(directory,f),'utf8')));
  const [live,replay,original]=texts.map(t=>JSON.parse(t)) as [MotionSample[],MotionSample[],Record<string,unknown>];
  const samplesValid=(rows:MotionSample[])=>Array.isArray(rows)&&rows.every(s=>s&&Number.isFinite(s.atMs)&&Array.isArray(s.trains)&&s.trains.every(t=>t&&Number.isFinite(t.id)&&typeof t.description==='string'&&Array.isArray(t.point)&&t.point.length===2&&t.point.every(Number.isFinite)&&Array.isArray(t.edge)&&t.edge.length===3&&t.edge.every(Number.isFinite)));
  if(!samplesValid(live)||!samplesValid(replay)||!original||typeof original!=='object'||Array.isArray(original))throw new Error('invalid saved comparison');
  const report={...original,...compareSamples(live,replay),
    recomputedFrom:{directory,files:Object.fromEntries(texts.map((s,i)=>[filenames[i]!,createHash('sha256').update(s).digest('hex')]))},
    reproduce:comparisonReproduction(out,resolve(out,'recomputed'))};
  for(const [i,name] of filenames.entries())if(i<2)await writePrivateFile(resolve(out,name),texts[i]!);
  await writePrivateFile(resolve(out,'live-vs-replay.json'),JSON.stringify(report,null,2)+'\n');
  await writePrivateFile(resolve(out,'live-vs-replay.md'),`# Saved live versus replay comparison\n\nPrimary recorded-checkpoint comparison: ${report.passed?'PASS':'FAIL'}.\n\nSame description sets: ${report.sameTrainSetSeconds}/${report.samples} samples. Position difference p95: ${report.positionDifferenceM.p95??'unavailable'} m.\n\nRecomputed from the saved actual live and recorded-replay samples, without a new live connection. The same-initial-snapshot diagnostic, if present, remains diagnostic only. Source hashes and exact reproduction arguments are in live-vs-replay.json.\n`);
  return report as typeof report & Record<string,unknown>;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2), values = new Map<string, string>();
  if(args.includes('--help')) {console.log('node tools/live-vs-replay.ts --out .scratch/dir [--seconds 600] [--start checkpoint|now] [--checkpoint-wait 610] [--relay http://127.0.0.1:8787]\nnode tools/live-vs-replay.ts --summarize <saved-capture-dir> --out <.scratch/dir>');return;}
  if(args.includes('--summarize')) {
    for(let i=0;i<args.length;i+=2) {
      const k=args[i]!,v=args[i+1];if(!['--summarize','--out'].includes(k)||!v||v.startsWith('--')||values.has(k))throw new Error('summary requires --summarize <capture-dir> --out <.scratch/dir>');values.set(k,v);
    }
    if(!values.has('--summarize')||!values.has('--out'))throw new Error('summary requires --summarize and --out');
    const report=await summarizeCapture(resolve(values.get('--summarize')!),resolve(values.get('--out')!));
    console.log(JSON.stringify({passed:report.passed,samples:report.samples,sameTrainSetSeconds:report.sameTrainSetSeconds,positionDifferenceM:report.positionDifferenceM},null,2));
    if(!report.passed)process.exitCode=1;return;
  }
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]!, v = args[i + 1];
    if (!['--out', '--seconds', '--relay', '--start', '--checkpoint-wait'].includes(k) || !v || values.has(k)) throw new Error('usage: live-vs-replay.ts --out .scratch/dir [--seconds 600] [--start checkpoint|now] [--checkpoint-wait 610] [--relay http://127.0.0.1:8787]');
    values.set(k, v);
  }
  const out = resolve(values.get('--out') ?? '.scratch/round10-live');
  const duration = Number(values.get('--seconds') ?? 600), wait = Number(values.get('--checkpoint-wait') ?? 610);
  const startMode = values.get('--start') ?? 'checkpoint';
  if (!Number.isInteger(duration) || duration < 1 || duration > 3600 || !Number.isFinite(wait) || wait < 1 || wait > 900 || !['checkpoint', 'now'].includes(startMode)) throw new Error('invalid duration or start mode');
  const relay = new URL(values.get('--relay') ?? 'http://127.0.0.1:8787');
  if (!['http:', 'https:'].includes(relay.protocol) || relay.username || relay.password) throw new Error('relay must be an HTTP URL without credentials');
  await scratchDirectory(out);
  const anchors = await fetch(new URL('/anchors', relay), { signal: AbortSignal.timeout(10_000) }).then(async (r) => { if (!r.ok) throw new Error(`anchors HTTP ${r.status}`); return await r.json() as AnchorMap; });
  await writeFile(resolve(out, 'anchors-used.json'), JSON.stringify(anchors) + '\n', { mode: 0o600 });
  const data = JSON.parse(await readFile(new URL('../web/src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
  const scheduleDate = ukDate(Date.now());
  const scheduleResponse = await fetch(new URL(`/schedule?date=${scheduleDate}`, relay), { signal: AbortSignal.timeout(10_000) });
  if (!scheduleResponse.ok) throw new Error(`schedule HTTP ${scheduleResponse.status}`);
  const schedule = await scheduleResponse.json() as { date: string; calls: ScheduleCall[] };
  if (schedule.date !== scheduleDate || !Array.isArray(schedule.calls) || schedule.calls.some((call) => !call || typeof call.uid !== 'string' || typeof call.headcode !== 'string')) throw new Error('invalid timetable');
  await writeFile(resolve(out, 'schedule-used.json'), JSON.stringify(schedule) + '\n', { mode: 0o600 });
  const graph = buildGraph(data);
  const wayMaxspeed = new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!]));
  // Each world has its own physical-id cache, using the same immutable timetable cohort.
  const optionsFor = (epochBaseMs = 0) => ({ lengthM: createTrainKinds(comparisonServiceFor(schedule.calls, epochBaseMs)).lengthM, wayMaxspeed });
  const controller = new AbortController();
  const received: { type: string; receivedAtMs: number; elapsedMs: number | null; data: unknown }[] = [];
  const samples: MotionSample[] = [];
  const statuses: { atMs: number; state: string }[] = [];
  let motion: ReturnType<typeof createMotion> | undefined, feed: TrainFeed | undefined, source: ObservedSource | undefined;
  let startWall = 0, startMono = 0, nextSample = 1000, snapshots = 0, pings = 0;
  let initialSnapshot: unknown, completed = false;
  const connectionStartedAt = Date.now();
  let finish!: () => void, fail!: (error: Error) => void;
  const completion = new Promise<void>((res, rej) => { finish = res; fail = rej; });
  const start = (payload: string): void => {
    startWall = Date.now(); startMono = performance.now(); initialSnapshot = JSON.parse(payload);
    motion = createMotion(graph, anchors, optionsFor(startWall));
    feed = createLiveFeed(motion, (state) => { statuses.push({ atMs: Date.now(), state }); }, {
      source: () => { source = new ObservedSource(); return source; }, now: () => performance.now(),
    });
    source!.onopen?.(new Event('open')); source!.emit('snapshot', payload);
    samples.push({ atMs: startWall, trains: sampleTrains(motion.trains()) });
    console.log(JSON.stringify({ state: 'capturing', startMs: startWall, durationSeconds: duration, startMode, pid: process.pid }));
  };
  const frame = (): void => {
    if (!feed || !motion || completed) return;
    const target = Math.min(duration * 1000, performance.now() - startMono);
    while (nextSample <= target) {
      feed.advance((nextSample - feed.timeMs()) / 1000);
      samples.push({ atMs: startWall + nextSample, trains: sampleTrains(motion.trains()) });
      nextSample += 1000;
    }
    feed.advance(Math.max(0, target - feed.timeMs()) / 1000);
    if (target >= duration * 1000) { completed = true; finish(); }
  };
  const timer = setInterval(frame, 1000 / 60);
  const deadline = setTimeout(() => fail(new Error('bounded checkpoint/capture deadline expired')), (wait + duration + 10) * 1000);
  const streamTask = (async () => {
    const response = await fetch(new URL('/events', relay), { signal: controller.signal });
    if (!response.ok || !response.body) throw new Error(`events HTTP ${response.status}`);
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let buffer = '';
    while (!completed) {
      const chunk = await reader.read(); if (chunk.done) throw new Error('live SSE stream ended before the window completed');
      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, '\n');
      let cut: number;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        let type = 'message'; const parts: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) parts.push(line.slice(5).trimStart());
        }
        if (!parts.length) continue;
        const payload = parts.join('\n'), at = Date.now();
        received.push({ type, receivedAtMs: at, elapsedMs: feed?.timeMs() ?? null, data: JSON.parse(payload) });
        if (type === 'ping') pings++;
        if (type === 'snapshot') {
          snapshots++;
          if (!feed && (startMode === 'now' || snapshots > 1)) { start(payload); continue; }
        }
        if (feed) source?.emit(type, payload);
        if (!feed && at - connectionStartedAt > wait * 1000) throw new Error('no periodic recorded checkpoint within the allowed wait');
      }
    }
  })();
  streamTask.catch((error) => { if (!completed) fail(error as Error); });
  try {
    console.log(JSON.stringify({ state: 'connected; awaiting checkpoint', connectionStartedAt, startMode, pid: process.pid }));
    await completion;
  } finally {
    clearInterval(timer); clearTimeout(deadline); controller.abort(); feed?.dispose();
    await streamTask.catch(() => {});
    await writeFile(resolve(out, 'live-events.ndjson'), received.map((r) => JSON.stringify(r)).join('\n') + '\n', { mode: 0o600 });
    await writeFile(resolve(out, 'live-samples.json'), JSON.stringify(samples) + '\n', { mode: 0o600 });
  }
  const endWall = startWall + duration * 1000;
  const days = [...new Set([startWall, endWall].map((ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '')))];
  const rows: RecordedEvent[] = [];
  for (const date of days) {
    const r = await fetch(new URL(`/recording?date=${date}`, relay), { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new Error(`recording HTTP ${r.status}`);
    rows.push(...parseRecording(await r.text()));
  }
  rows.sort((a, b) => a.t - b.t);
  const window = snapshotWindow(rows, startWall, endWall);
  const replayMotion = createMotion(graph, anchors, optionsFor()), replay = createReplayFeed(window, 1, replayMotion, () => {});
  const replaySamples = samples.map(({ atMs }) => {
    replay.advance(Math.max(0, atMs - replay.timeMs()) / 1000);
    return { atMs, trains: sampleTrains(replayMotion.trains()) };
  });
  replay.dispose();
  const comparison = compareSamples(samples, replaySamples);
  // Diagnostic only: the primary comparison above always starts at the real recorded
  // checkpoint. This second run isolates cold-start differences on an older relay that
  // does not record/broadcast periodic checkpoints. Its seed is the actual observed SSE
  // snapshot, explicitly labelled here rather than passed off as a recording row.
  const seed = { ...initialSnapshot as object, kind: 'snapshot' } as RecordedEvent['e'];
  const alignedRows = [{ t: startWall, e: seed }, ...rows.filter((r) => r.t > startWall && r.t <= endWall)];
  const alignedMotion = createMotion(graph, anchors, optionsFor()), alignedFeed = createReplayFeed(alignedRows, 1, alignedMotion, () => {});
  const alignedSamples = samples.map(({ atMs }) => {
    alignedFeed.advance(Math.max(0, atMs - alignedFeed.timeMs()) / 1000);
    return { atMs, trains: sampleTrains(alignedMotion.trains()) };
  });
  alignedFeed.dispose();
  const sameInitialSnapshotControl = compareSamples(samples, alignedSamples);
  const recordedInitial = window[0]!.e as unknown as { berths?: Record<string, string> };
  const liveInitial = initialSnapshot as { berths?: Record<string, string> };
  const sameInitialBerths = JSON.stringify(recordedInitial.berths) === JSON.stringify(liveInitial.berths);
  const reconstructed = recordedPictureAt(window, startWall, anchors.area);
  const initialization = { recordedCheckpointBerths: Object.keys(recordedInitial.berths ?? {}).length,
    liveConnectionBerths: Object.keys(liveInitial.berths ?? {}).length,
    reconstructedBerthsAtWindowStart: Object.keys(reconstructed).length,
    liveBerthsMissingOrDifferentInRecording: Object.entries(liveInitial.berths ?? {}).filter(([b, d]) => reconstructed[b] !== d).length,
    recordedBerthsMissingOrDifferentLive: Object.entries(reconstructed).filter(([b, d]) => liveInitial.berths?.[b] !== d).length,
    emptyRecordedCheckpoint: Object.keys(recordedInitial.berths ?? {}).length === 0 && Object.keys(liveInitial.berths ?? {}).length > 0 };
  const initializationExplanation = initialization.liveBerthsMissingOrDifferentInRecording > 0
    ? `The recorded checkpoint contains ${initialization.recordedCheckpointBerths} berth entries. Applying its subsequent TD events reconstructs ${initialization.reconstructedBerthsAtWindowStart} entries at the live window start, versus ${initialization.liveConnectionBerths} in the actual live snapshot; ${initialization.liveBerthsMissingOrDifferentInRecording} live entries are missing or different. Thus the recorded prefix does not supply the same TD picture. The same-initial-snapshot diagnostic isolates this input difference from motion integration and receipt-time jitter.`
    : !sameInitialBerths ? 'The two initial berth pictures differ because the recorded checkpoint precedes the fresh live connection picture. Inspect the separately labelled same-initial-snapshot diagnostic before attributing disagreement to integration or timing.' : 'The initial berth pictures agree.';
  const jitter = received.filter((r) => r.elapsedMs !== null && (r.type === 'td' || r.type === 'trust')).flatMap((r) => {
    const t = (r.data as { t?: number }).t; return typeof t === 'number' ? [r.receivedAtMs - t] : [];
  });
  const report = { reproduce:comparisonReproduction(out,resolve(out,'recomputed')),
    captureCommand:{cwd:repoRoot,command:'node',args:['kings-cross-src/tools/live-vs-replay.ts','--out',out,'--seconds',String(duration),'--start',startMode,'--checkpoint-wait',String(wait),'--relay',relay.origin]},
    interval: { startMs: startWall, endMs: endWall, durationSeconds: duration, connectionStartedAt, startMode,
    recordedCheckpointMs: window[0]!.t, checkpointToLiveStartMs: startWall - window[0]!.t, sameInitialBerths },
    received: { messages: received.length, snapshots, pings, recordedEventsInReplay: window.length },
    timetable: { date: scheduleDate, calls: schedule.calls.length, policy: 'One timetable fetched before checkpoint wait, fixed for all worlds; independent birth-kind caches. Page refresh timing is not reproduced.' },
    receiptMinusRecordedMs: { median: quantile(jitter, 0.5), p95: quantile(jitter, 0.95), max: jitter.length ? Math.max(...jitter) : null },
    initialization, initializationExplanation, statuses, ...comparison, sameInitialSnapshotControl,
    explanation: 'Both modes use the page feed factories and identical graph, anchors, lengths and speed tags. Live advances on a 60 Hz Node timer and applies SSE messages at the latest frame, as the page does; replay uses recorder timestamps and the real nearest-prior recorded checkpoint. Sampling splits frame advances at exact one-second wall-clock offsets. Acceptance requires identical description sets at every sampled second and position p95 below 5 m; numeric physical ids and edges are reported separately without remapping. Node timer/receipt jitter and recorder-to-SSE timestamp differences remain measurable. The separately labelled sameInitialSnapshotControl uses the actual live connection snapshot plus the recording events after connection; that diagnostic seed is not claimed to be a recorded checkpoint.',
  };
  await writeFile(resolve(out, 'replay-samples.json'), JSON.stringify(replaySamples) + '\n', { mode: 0o600 });
  await writeFile(resolve(out, 'same-initial-snapshot-samples.json'), JSON.stringify(alignedSamples) + '\n', { mode: 0o600 });
  await writeFile(resolve(out, 'live-vs-replay.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const markdown = `# Live versus replay\n\n${duration} seconds; ${samples.length} samples. Start mode: ${startMode}; recorded checkpoint ${startWall - window[0]!.t} ms before live initialization; same initial berth picture: ${sameInitialBerths}.\n\n| Measure | Recorded checkpoint (primary) | Same live snapshot (diagnostic) |\n| --- | ---: | ---: |\n| Seconds with the same trains | ${comparison.sameTrainSetSeconds}/${comparison.samples} | ${sameInitialSnapshotControl.sameTrainSetSeconds}/${comparison.samples} |\n| Live-only / replay-only train samples | ${comparison.liveOnlyTrainSamples} / ${comparison.replayOnlyTrainSamples} | ${sameInitialSnapshotControl.liveOnlyTrainSamples} / ${sameInitialSnapshotControl.replayOnlyTrainSamples} |\n| Matching physical ids / paired descriptions | ${comparison.matchingPhysicalIds} / ${comparison.matchedTrainSamples} | ${sameInitialSnapshotControl.matchingPhysicalIds} / ${sameInitialSnapshotControl.matchedTrainSamples} |\n| Description agreement for common ids | ${comparison.descriptionByIdAgreement}/${comparison.commonIdSamples} | ${sameInitialSnapshotControl.descriptionByIdAgreement}/${sameInitialSnapshotControl.commonIdSamples} |\n| Position difference median / p95 / max (m) | ${comparison.positionDifferenceM.median} / ${comparison.positionDifferenceM.p95} / ${comparison.positionDifferenceM.max} | ${sameInitialSnapshotControl.positionDifferenceM.median} / ${sameInitialSnapshotControl.positionDifferenceM.p95} / ${sameInitialSnapshotControl.positionDifferenceM.max} |\n| Acceptance | ${comparison.passed ? 'PASS' : 'FAIL'} | ${sameInitialSnapshotControl.passed ? 'PASS' : 'FAIL'} |\n\nReceipt minus recorder timestamp median / p95 / max: ${report.receiptMinusRecordedMs.median} / ${report.receiptMinusRecordedMs.p95} / ${report.receiptMinusRecordedMs.max} ms.\n\n${report.explanation}\n`;
  await writeFile(resolve(out, 'live-vs-replay.md'), markdown + `\nTimetable: ${scheduleDate}, ${schedule.calls.length} calls. ${report.timetable.policy}\n\n${initializationExplanation}\n`);
  console.log(JSON.stringify({ ...report, seconds: undefined, statuses: undefined, sameInitialSnapshotControl: { ...sameInitialSnapshotControl, seconds: undefined } }, null, 2));
  if (!comparison.passed) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error((error as Error).stack); process.exitCode = 1; });
}
