// Offline motion audit. Real TD input and all derived output stay outside published files.
// node kings-cross-src/tools/motion-check.ts --anchors <json> --recording <ndjson>
//   --out .scratch/motion-real [--speed 1] [--graph <compact OSM json>]
import { readFile, mkdir, writeFile, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGraph } from '../core/graph.ts';
import { createMotion, overlapM } from '../core/motion.ts';
import type { MotionEvent, TrainView } from '../core/motion.ts';
import type { AnchorMap } from '../core/anchors.ts';
import type { KxData } from '../core/osm.ts';
import { trainLayout } from '../core/train.ts';
import { createEventReconciler, parseEvent } from '../web/src/feed.ts';
import type { SnapshotEvent } from '../web/src/feed.ts';

const args = process.argv.slice(2);
const values = new Map<string, string>();
for (let i = 0; i < args.length; i += 2) {
  const key = args[i]!, value = args[i + 1];
  if (!['--anchors', '--recording', '--speed', '--out', '--graph'].includes(key) || value === undefined || value.startsWith('--') || values.has(key)) throw new Error('usage: motion-check.ts --anchors <json> --recording <ndjson> [--speed 1] --out <.scratch/dir> [--graph <compact OSM json>]');
  values.set(key, value);
}
for (const key of ['--anchors', '--recording', '--out']) if (!values.has(key)) throw new Error(`missing ${key}`);
const speed = Number(values.get('--speed') ?? 1);
if (!Number.isFinite(speed) || speed <= 0) throw new Error('--speed must be finite and positive');
const root = fileURLToPath(new URL('../../', import.meta.url));
const scratch = resolve(root, '.scratch');
const out = resolve(values.get('--out')!);
const inside = (parent: string, child: string): boolean => { const r = relative(parent, child); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
if (!inside(scratch, out)) throw new Error('--out must be a directory beneath this worktree\'s .scratch');
// Check the nearest existing ancestor before creating anything: a symlink must not send
// licensed recording-derived reports outside scratch.
await mkdir(scratch, { recursive: true });
let ancestor = out;
for (;;) {
  try { const real = await realpath(ancestor); if (real !== await realpath(scratch) && !inside(await realpath(scratch), real)) throw new Error('output symlink escapes .scratch'); break; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; ancestor = dirname(ancestor); }
}
const anchors = JSON.parse(await readFile(resolve(values.get('--anchors')!), 'utf8')) as AnchorMap;
if (!anchors || typeof anchors.area !== 'string' || !Array.isArray(anchors.anchors) || !Array.isArray(anchors.unmapped)) throw new Error('expected an AnchorMap JSON object');
const data = JSON.parse(await readFile(values.get('--graph') ? resolve(values.get('--graph')!) : new URL('../web/src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
const graph = buildGraph(data);
const recording = (await readFile(resolve(values.get('--recording')!), 'utf8')).split(/\r?\n/).filter((s) => s.trim()).map((line, index) => {
  const row = JSON.parse(line) as { t: number | string; e: MotionEvent };
  const at = typeof row.t === 'number' ? row.t : Date.parse(row.t);
  if (!Number.isFinite(at) || !row.e || typeof row.e.kind !== 'string') throw new Error(`invalid recording row ${index + 1}`);
  return { at, event: parseEvent(row.e), index };
}).sort((a, b) => a.at - b.at || a.index - b.index);
if (!recording.length) throw new Error('recording is empty');
const lengths = { long: trainLayout('lner9').length, short: trainLayout('lner5').length };
const motionOptions = { lengthM: (d: string) => d[0] === '1' ? lengths.long : lengths.short,
  wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) };
// No future observedSteps are supplied: both policies learn only from events already replayed.
const motion = createMotion(graph, anchors, { ...motionOptions, estimatedMotion: true });
const baselineMotion = createMotion(graph, anchors, { ...motionOptions, estimatedMotion: false });
const reconcile = createEventReconciler((event, atMs) => motion.apply(event, atMs));
const reconcileBaseline = createEventReconciler((event, atMs) => baselineMotion.apply(event, atMs));
const snapshots = recording.filter((row) => row.event.kind === 'snapshot').length;
const dt = 0.1, start = recording[0]!.at, end = recording.at(-1)!.at;
let cursor = 0, ticks = 0, maxJump = 0, maxSpeed = 0, maxAccel = 0, maxDecel = 0;
let interposeFailures = 0, snapshotPlacementFailures = 0;
let maxPointJump = 0, pointOverspeed = 0, pointBackward = 0;
let baselineMaxPointJump = 0, baselinePointOverspeed = 0, baselinePointBackward = 0;
const backwardExamples: unknown[] = [];
const doubleHeldExamples: unknown[] = [];
let overlapTicks = 0, maxOverlap = 0, maxTrains = 0, maxQueued = 0, unexplainedDisappearances = 0, cabChanges = 0;
let previous = new Map<string | number, TrainView>();
let baselinePrevious = new Map<number, TrainView>();
let baselineOverlapTicks = 0, baselineMaxOverlap = 0;
const observed = new Set<string>();
const anchorByBerth = new Map(anchors.anchors.map((a) => [a.berth, a]));
const locatedAnchors = anchors.anchors.flatMap((a) => {
  const edge = graph.edges.find((e) => e.a === a.from && e.b === a.to || e.a === a.to && e.b === a.from);
  if (!edge) return [];
  const t = edge.a === a.from ? a.t : 1 - a.t;
  const from = graph.pos.get(edge.a)!, to = graph.pos.get(edge.b)!;
  const point: TrainView['leading']['point'] = [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  return [{ anchor: a, edge, t, point }];
});
const platformStops = locatedAnchors.filter((a) => a.anchor.platform !== undefined).map(({ edge, t }) => ({ edge, t }));
// AnchorMap supplies stops, not platform polygons. A held train occupies a platform
// when its body includes a platform stop (also true after a stationary cab change).
const holdsAtPlatform = (t: TrainView): boolean => platformStops.some((p) =>
  t.leading.edge === p.edge && Math.abs(t.leading.t - p.t) * p.edge.length < 0.05 ||
  t.occupied.some((s) => s.edge === p.edge && p.t >= Math.min(s.fromT, s.toT) - 1e-8 && p.t <= Math.max(s.fromT, s.toT) + 1e-8));
const atAnchor = (t: TrainView, berth: string): boolean => {
  const stop = locatedAnchors.find((a) => a.anchor.berth === berth);
  return Boolean(stop && t.leading.edge === stop.edge && Math.abs(t.leading.t - stop.t) * stop.edge.length < 0.05);
};
const heldAtAnchor = (t: TrainView): boolean => t.speed === 0 && t.state !== 'fading' && t.targetBerth === t.lastBerth &&
  (t.state === 'held' || t.state === 'estimated') && atAnchor(t, t.lastBerth);
const heldForPartnerPair = (t: TrainView): boolean => t.state === 'held' || t.state === 'estimated' && heldAtAnchor(t);
type BirthLocation = 'externalLeaf' | 'nearAnchor' | 'other';
interface MinuteMotionStats {
  uniqueIds: Set<number>;
  estimatedIds: Set<number>;
  concurrentTotal: number;
  estimatedConcurrentTotal: number;
  samples: number;
}
interface ReplayMotionStats {
  minutes: Map<number, MinuteMotionStats>;
  seenIds: Set<number>;
  estimatedIds: Set<number>;
  estimatedStateById: Map<number, boolean>;
  firstAppearanceByDescription: Map<string, number>;
  births: Record<BirthLocation, number>;
  estimatedBirths: Record<BirthLocation, number>;
}
const platformAnchorPoints = locatedAnchors.filter((a) => a.anchor.platform !== undefined).map((a) => a.point);
// A degree-one node by a buffer stop is a platform end, not an outside boundary.
const externalLeaves = [...graph.adj.entries()].filter(([id, edges]) => edges.length === 1 && !platformAnchorPoints.some((p) => {
  const node = graph.pos.get(id)!;
  return Math.hypot(node[0] - p[0], node[1] - p[1]) < 15;
})).map(([id]) => id);
const birthLocation = (train: TrainView): BirthLocation => {
  const nearLeaf = externalLeaves.some((id) => {
    const fromA = train.leading.edge.a === id ? train.leading.t * train.leading.edge.length : Infinity;
    const fromB = train.leading.edge.b === id ? (1 - train.leading.t) * train.leading.edge.length : Infinity;
    return Math.min(fromA, fromB) <= 1;
  });
  if (nearLeaf) return 'externalLeaf';
  if (locatedAnchors.some((a) => Math.hypot(train.leading.point[0] - a.point[0], train.leading.point[1] - a.point[1]) <= Math.max(15, a.anchor.errorM) ||
    train.occupied.some((s) => s.edge === a.edge && a.t >= Math.min(s.fromT, s.toT) - 1e-8 && a.t <= Math.max(s.fromT, s.toT) + 1e-8))) return 'nearAnchor';
  return 'other';
};
const motionStats = (): ReplayMotionStats => ({ minutes: new Map(), seenIds: new Set(), estimatedIds: new Set(), estimatedStateById: new Map(), firstAppearanceByDescription: new Map(),
  births: { externalLeaf: 0, nearAnchor: 0, other: 0 }, estimatedBirths: { externalLeaf: 0, nearAnchor: 0, other: 0 } });
const enabledStats = motionStats(), baselineStats = motionStats();
const isEstimated = (stats: ReplayMotionStats, train: TrainView): boolean => {
  // Fading hides the state; carry the last non-fading estimate flag through its fade.
  if (train.state === 'estimated') stats.estimatedStateById.set(train.id, true);
  else if (train.state !== 'fading') stats.estimatedStateById.set(train.id, false);
  return stats.estimatedStateById.get(train.id) ?? false;
};
const minuteStats = (stats: ReplayMotionStats, elapsedSeconds: number): MinuteMotionStats => {
  const minute = Math.floor(elapsedSeconds / 60);
  let value = stats.minutes.get(minute);
  if (!value) {
    value = { uniqueIds: new Set(), estimatedIds: new Set(), concurrentTotal: 0, estimatedConcurrentTotal: 0, samples: 0 };
    stats.minutes.set(minute, value);
  }
  return value;
};
const observeDrawn = (stats: ReplayMotionStats, trains: TrainView[], elapsedSeconds: number): void => {
  const minute = minuteStats(stats, elapsedSeconds);
  for (const train of trains) {
    const estimated = isEstimated(stats, train);
    if (!stats.firstAppearanceByDescription.has(train.description)) stats.firstAppearanceByDescription.set(train.description, elapsedSeconds);
    minute.uniqueIds.add(train.id);
    if (estimated) {
      minute.estimatedIds.add(train.id);
      stats.estimatedIds.add(train.id);
    }
    if (!stats.seenIds.has(train.id)) {
      stats.seenIds.add(train.id);
      const location = birthLocation(train);
      stats.births[location]++;
      if (estimated) stats.estimatedBirths[location]++;
    }
  }
};
const sampleConcurrent = (stats: ReplayMotionStats, trains: TrainView[], elapsedSeconds: number): void => {
  observeDrawn(stats, trains, elapsedSeconds);
  const minute = minuteStats(stats, elapsedSeconds);
  const estimatedCount = trains.filter((train) => isEstimated(stats, train)).length;
  minute.concurrentTotal += trains.length;
  minute.estimatedConcurrentTotal += estimatedCount;
  minute.samples++;
};
const summarizeMotion = (stats: ReplayMotionStats) => {
  const perMinute = [...stats.minutes].sort(([a], [b]) => a - b).map(([minute, value]) => ({
    minute,
    uniquePhysicalTrainsDrawn: value.uniqueIds.size,
    meanConcurrentTrains: value.samples ? value.concurrentTotal / value.samples : 0,
    estimatedPhysicalTrainsDrawn: value.estimatedIds.size,
    meanEstimatedConcurrentTrains: value.samples ? value.estimatedConcurrentTotal / value.samples : 0,
    samples: value.samples,
  }));
  const mean = (values: number[]): number => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  return {
    perMinute,
    aggregate: {
      minutes: perMinute.length,
      meanUniquePhysicalTrainsDrawnPerMinute: mean(perMinute.map((row) => row.uniquePhysicalTrainsDrawn)),
      meanConcurrentTrainsPerMinute: mean(perMinute.map((row) => row.meanConcurrentTrains)),
      estimatedPhysicalTrainsDrawn: stats.estimatedIds.size,
      meanEstimatedPhysicalTrainsDrawnPerMinute: mean(perMinute.map((row) => row.estimatedPhysicalTrainsDrawn)),
      meanEstimatedConcurrentTrainsPerMinute: mean(perMinute.map((row) => row.meanEstimatedConcurrentTrains)),
      firstAppearances: stats.births,
      firstAppearancesInitiallyEstimated: stats.estimatedBirths,
    },
  };
};
const outside = new Set(anchors.unmapped.filter((a) => a.reason === 'outside-network').map((a) => a.berth));
const berthOwner = new Map<string, string>();
const placements = { standingInterposeCandidates: 0, standingStepCandidates: 0, wireSameBerthInterposes: 0, wireSameBerthSteps: 0,
  partnerBerthPlacements: 0, heldPartnerTrainPairs: 0, coexistingDescriptions: 0, unresolvedReplacement: 0, wireReplacements: 0 };
const heldPartnerPairs = new Map<string, { descriptions: string[]; berths: string[]; firstHeldAtSeconds: number }>();
let doubleHeldBerthTicks = 0;
const stoppedSince = new Map<string | number, number>();
const longHolds = new Map<string | number, { description: string; berth: string; target: string; seconds: number; blocked: boolean;
  leadingPoint: TrainView['leading']['point']; companions: { description: string; berth: string }[]; explanation: string }>();
const failedSteps = new Map<number, { from: string; to: string; reason: string }>();
const failedInterposes = new Set<number>();
const lastStep = new Map<string, { event: MotionEvent; index: number }>();
let issueCursor = 0, unattributedRoutingIssues = 0;
const consumeIssues = (context?: { event: MotionEvent; index: number }): void => {
  const all = motion.diagnostics();
  for (const i of all.slice(issueCursor)) {
    if (i.kind === 'renamed' && i.previousDescription && !lastStep.has(i.description)) {
      const step = lastStep.get(i.previousDescription); if (step) lastStep.set(i.description, step);
    }
    if (i.kind !== 'unroutable') continue;
    const source = context ?? lastStep.get(i.description);
    if (!source) { unattributedRoutingIssues++; continue; }
    if (source.event.kind === 'snapshot') snapshotPlacementFailures++;
    if (source.event.kind === 'interpose') failedInterposes.add(source.index);
    if (source.event.kind === 'step') failedSteps.set(source.index, { from: source.event.from ?? '', to: source.event.to ?? '', reason: i.reason });
  }
  issueCursor = all.length;
};
// --speed is the renderer's playback rate. The audit is unpaced and always uses 0.1 s
// of simulation time; changing replay rate must not change train physics or results.
for (let time = 0; time <= (end - start) / 1000 + 6 + 1e-7; time = ++ticks * dt) {
  while (cursor < recording.length && recording[cursor]!.at <= start + time * 1000 + 1e-4) {
    const event = recording[cursor]!.event;
    if (event.kind === 'snapshot' && event.area === anchors.area) {
      berthOwner.clear();
      for (const [berth, description] of Object.entries((event as SnapshotEvent).berths)) berthOwner.set(berth, description);
    }
    const views = motion.trains();
    if (event.area === anchors.area && event.descr && event.descr !== '****') {
      if ((event.kind === 'interpose' || event.kind === 'step') && event.to) {
        const oldName = berthOwner.get(event.to);
        const at = anchorByBerth.get(event.to);
        const standing = views.find((t) => t.description !== event.descr && t.lastBerth === event.to && heldAtAnchor(t) && atAnchor(t, event.to!));
        if (standing && !views.some((t) => t.description === event.descr)) placements[event.kind === 'interpose' ? 'standingInterposeCandidates' : 'standingStepCandidates']++;
        else if (oldName && oldName !== event.descr) {
          if (views.some((t) => t.description === oldName) && views.some((t) => t.description === event.descr)) placements.coexistingDescriptions++;
          else placements.unresolvedReplacement++;
        }
        if (oldName && oldName !== event.descr) {
          placements.wireReplacements++;
          if (at) placements[event.kind === 'interpose' ? 'wireSameBerthInterposes' : 'wireSameBerthSteps']++;
        }
        if (at?.platform !== undefined && oldName !== event.descr) {
          const partners = [...berthOwner].filter(([b, d]) => b !== event.to && d !== event.descr && anchorByBerth.get(b)?.platform === at.platform);
          if (partners.length) placements.partnerBerthPlacements++;
        }
        if (event.kind === 'step' && berthOwner.get(event.from ?? '') === event.descr) berthOwner.delete(event.from!);
        berthOwner.set(event.to, event.descr);
      } else if (event.kind === 'cancel' && berthOwner.get(event.from ?? '') === event.descr) berthOwner.delete(event.from!);
    }
    if (event.kind === 'step' && event.descr) lastStep.set(event.descr, { event, index: cursor });
    reconcile(event, start + time * 1000);
    consumeIssues({ event, index: cursor });
    reconcileBaseline(event, start + time * 1000);
    // Count bodies that become drawn directly on an event as well as after the tick.
    observeDrawn(enabledStats, motion.trains(), time);
    observeDrawn(baselineStats, baselineMotion.trains(), time);
    cursor++;
  }
  motion.advance(dt);
  baselineMotion.advance(dt);
  consumeIssues();
  const trains = motion.trains();
  const baselineTrains = baselineMotion.trains();
  sampleConcurrent(enabledStats, trains, time + dt);
  sampleConcurrent(baselineStats, baselineTrains, time + dt);
  const current = new Map(trains.map((t) => [t.id ?? t.description, t]));
  const heldBerths = new Set<string>();
  let doubleHeld = false;
  for (const t of trains) {
    if (t.speed === 0 && t.state !== 'fading') {
      if (heldBerths.has(t.lastBerth)) doubleHeld = true;
      heldBerths.add(t.lastBerth);
    }
    const id = (t as TrainView & { id?: number }).id ?? t.description;
    if (t.speed === 0 && t.state !== 'fading' && !holdsAtPlatform(t)) {
      if (!stoppedSince.has(id)) stoppedSince.set(id, time);
      const seconds = time - stoppedSince.get(id)!;
      if (seconds > 600 && seconds > (longHolds.get(id)?.seconds ?? 0)) {
        const platform = anchorByBerth.get(t.targetBerth)?.platform;
        const companions = platform === undefined ? [] : trains.filter((other) => other !== t && holdsAtPlatform(other) &&
          anchorByBerth.get(other.targetBerth)?.platform === platform).map((other) => ({ description: other.description, berth: other.lastBerth }));
        const partner = companions.some((other) => other.berth !== t.lastBerth);
        longHolds.set(id, { description: t.description, berth: t.lastBerth, target: t.targetBerth, seconds, blocked: t.blocked,
          leadingPoint: t.leading.point, companions, explanation: t.blocked && partner ? 'A distinct partner berth occupies this platform stop; preserve both trains and their collision separation.' :
            t.blocked && companions.length ? 'Another description holds the same platform berth; investigate a missed rename.' : 'No platform stop occupied by this train; inspect routing and available authority.' });
      }
    } else stoppedSince.delete(id);
  }
  if (doubleHeld) {
    doubleHeldBerthTicks++;
    if (doubleHeldExamples.length < 10) doubleHeldExamples.push({ time, trains: trains.filter((t) => t.speed === 0).map((t) => ({ description: t.description, berth: t.lastBerth, target: t.targetBerth, x: t.leading.point[0], z: t.leading.point[1] })) });
  }
  for (let i = 0; i < trains.length; i++) for (const b of trains.slice(i + 1)) {
    const a = trains[i]!, platform = anchorByBerth.get(a.lastBerth)?.platform;
    if (platform !== undefined && a.lastBerth !== b.lastBerth && platform === anchorByBerth.get(b.lastBerth)?.platform &&
      heldForPartnerPair(a) && heldForPartnerPair(b)) {
      const key = [String(a.id ?? a.description), String(b.id ?? b.description)].sort().join(':');
      if (!heldPartnerPairs.has(key)) heldPartnerPairs.set(key, { descriptions: [a.description, b.description], berths: [a.lastBerth, b.lastBerth], firstHeldAtSeconds: time });
    }
  }
  maxTrains = Math.max(maxTrains, trains.length); maxQueued = Math.max(maxQueued, motion.queuedCount());
  for (const t of trains) {
    observed.add(t.description); maxSpeed = Math.max(maxSpeed, t.speed);
    const old = previous.get(t.id ?? t.description);
    if (!old) continue;
    maxJump = Math.max(maxJump, t.distanceM - old.distanceM);
    // Independent of the core's odometer: where the leading end is drawn. A cab change
    // swaps the leading end by a train length, so those ticks are excluded.
    if (t.reversals === old.reversals) {
      const dx = t.leading.point[0] - old.leading.point[0];
      const dz = t.leading.point[1] - old.leading.point[1];
      const moved = Math.hypot(dx, dz);
      maxPointJump = Math.max(maxPointJump, moved);
      if (moved > Math.max(t.speed, old.speed) * dt + 0.05) pointOverspeed++;
      // heading is clockwise from north (-z): forward is (sin h, -cos h)
      const along = dx * Math.sin(old.heading) - dz * Math.cos(old.heading);
      if (along < -0.05) {
        pointBackward++;
        if (backwardExamples.length < 30) backwardExamples.push({ time, description: t.description, old: old.leading, next: t.leading, heading: old.heading });
      }
    }
    maxAccel = Math.max(maxAccel, (t.speed - old.speed) / dt);
    maxDecel = Math.max(maxDecel, (old.speed - t.speed) / dt);
    cabChanges += t.reversals - old.reversals;
  }
  for (const old of previous.values()) if (!current.has(old.id ?? old.description) && old.state !== 'fading') unexplainedDisappearances++;
  for (const t of baselineTrains) {
    const old = baselinePrevious.get(t.id);
    if (!old) continue;
    if (t.reversals === old.reversals) {
      const dx = t.leading.point[0] - old.leading.point[0];
      const dz = t.leading.point[1] - old.leading.point[1];
      const moved = Math.hypot(dx, dz);
      baselineMaxPointJump = Math.max(baselineMaxPointJump, moved);
      if (moved > Math.max(t.speed, old.speed) * dt + 0.05) baselinePointOverspeed++;
      const along = dx * Math.sin(old.heading) - dz * Math.cos(old.heading);
      if (along < -0.05) baselinePointBackward++;
    }
  }
  baselinePrevious = new Map(baselineTrains.map((t) => [t.id, t]));
  let tickOverlap = false;
  for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) {
    const overlap = overlapM(trains[i]!.occupied, trains[j]!.occupied);
    maxOverlap = Math.max(maxOverlap, overlap);
    if (overlap > 1e-6) tickOverlap = true;
  }
  if (tickOverlap) overlapTicks++;
  let baselineTickOverlap = false;
  for (let i = 0; i < baselineTrains.length; i++) for (let j = i + 1; j < baselineTrains.length; j++) {
    const overlap = overlapM(baselineTrains[i]!.occupied, baselineTrains[j]!.occupied);
    baselineMaxOverlap = Math.max(baselineMaxOverlap, overlap);
    if (overlap > 1e-6) baselineTickOverlap = true;
  }
  if (baselineTickOverlap) baselineOverlapTicks++;
  previous = current;
}
const issues = motion.diagnostics();
placements.heldPartnerTrainPairs = heldPartnerPairs.size;
const unroutable = issues.filter((i) => i.kind === 'unroutable');
const reversalsOutsidePlatform = issues.filter((i) => i.kind === 'reversal' && !anchors.anchors.some((a) => a.berth === i.berth && a.platform !== undefined));
const vanished = issues.filter((i) => i.kind === 'vanished');
const renames = issues.filter((i) => i.kind === 'renamed');
const appliedRenames = { interpose: renames.filter((i) => i.reason === 'interpose').length, step: renames.filter((i) => i.reason === 'step').length,
  mergedObservations: issues.filter((i) => i.kind === 'merged').length };

interposeFailures = failedInterposes.size;
const outsideSteps = [...failedSteps.values()].filter((s) => outside.has(s.from) && outside.has(s.to));
const insideSteps = [...failedSteps.values()].filter((s) => !outside.has(s.from) || !outside.has(s.to));
const insideRoutingReasons = new Map<string, number>();
for (const s of insideSteps) insideRoutingReasons.set(s.reason, (insideRoutingReasons.get(s.reason) ?? 0) + 1);
const pairs = new Map<string, number>();
for (const s of insideSteps) { const pair = `${s.from} -> ${s.to}`; pairs.set(pair, (pairs.get(pair) ?? 0) + 1); }
const topInsidePairs = [...pairs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([pair, count]) => ({ pair, count }));
const enabledMotionSummary = summarizeMotion(enabledStats);
const baselineMotionSummary = summarizeMotion(baselineStats);
const matchingFirstAppearanceDelays = [...enabledStats.firstAppearanceByDescription].flatMap(([description, enabledAt]) => {
  const baselineAt = baselineStats.firstAppearanceByDescription.get(description);
  return baselineAt !== undefined && enabledAt < baselineAt ? [baselineAt - enabledAt] : [];
}).sort((a, b) => a - b);
const median = (values: number[]): number => values.length % 2 ? values[Math.floor(values.length / 2)]! :
  values.length ? (values[values.length / 2 - 1]! + values[values.length / 2]!) / 2 : 0;
const matchingDescriptions = [...enabledStats.firstAppearanceByDescription.keys()].filter((description) => baselineStats.firstAppearanceByDescription.has(description)).length;
const report = {
  anchorSources: anchors.sources, anchorCount: anchors.anchors.length, unmappedCount: anchors.unmapped.length,
  events: recording.length, snapshots, snapshotPlacementFailures, durationSeconds: (end - start) / 1000, stepSeconds: dt, playbackSpeed: speed,
  ticks, trainsObserved: observed.size, peakTrains: maxTrains, peakQueued: maxQueued,
  maxPerTickJumpM: maxJump, maxPointJumpM: maxPointJump, pointOverspeedTicks: pointOverspeed, pointBackwardTicks: pointBackward, maxSpeedMps: maxSpeed, maxSpeedKmh: maxSpeed * 3.6,
  maxAccelerationMps2: maxAccel, maxDecelerationMps2: maxDecel,
  overlapTicks, maxOverlapM: maxOverlap, cabChanges, reversalsOutsidePlatform: reversalsOutsidePlatform.length,
  stepsCouldNotRoute: failedSteps.size, interposesCouldNotPlace: interposeFailures,
  trainsVanishedAfterFade: vanished.length, unexplainedDisappearances,
  remainingTrains: motion.trains().length, remainingQueued: motion.queuedCount(),
  routingIssues: unroutable, invalidReversals: reversalsOutsidePlatform, vanishedTrains: vanished,
  placements, heldPartnerPairs: [...heldPartnerPairs.values()], appliedRenames, unattributedRoutingIssues, insideRoutingReasons: Object.fromEntries(insideRoutingReasons), doubleHeldBerthTicks, heldOutsidePlatformOverTenMinutes: longHolds.size,
  longHolds: [...longHolds.values()], unroutableOutsideNetworkSteps: outsideSteps.length,
  unroutableInsideNetworkSteps: insideSteps.length, topInsidePairs,
  motionComparison: {
    perMinuteBasis: 'elapsed replay minutes; unique IDs are physical train ids visible at any point; concurrent means sample post-advance at each 0.1 s tick',
    firstAppearanceClassification: { externalLeafDistanceM: 1, nearAnchorDistanceM: 'max(15, anchor errorM)', occupiedBodyCoversLocatedAnchorStop: true, excludedPlatformBufferLeafDistanceM: 15 },
    matchingDescriptionFirstAppearanceTiming: { matchingDescriptions, enabledEarlierCount: matchingFirstAppearanceDelays.length,
      medianSecondsEarlier: median(matchingFirstAppearanceDelays), maxSecondsEarlier: matchingFirstAppearanceDelays.at(-1) ?? 0 },
    estimatedMotionDisabled: { ...baselineMotionSummary, maxPointJumpM: baselineMaxPointJump, pointOverspeedTicks: baselinePointOverspeed,
      pointBackwardTicks: baselinePointBackward, overlapTicks: baselineOverlapTicks, maxOverlapM: baselineMaxOverlap },
    estimatedMotionEnabled: { ...enabledMotionSummary, maxPointJumpM: maxPointJump, pointOverspeedTicks: pointOverspeed,
      pointBackwardTicks: pointBackward, overlapTicks, maxOverlapM: maxOverlap },
  },
  backwardExamples, doubleHeldExamples,
};
const f = (n: number): string => n.toFixed(6);
const markdown = `# Motion replay report

${anchors.anchors.length} anchors; ${recording.length} events over ${f(report.durationSeconds)} s; ${ticks} fixed 0.1 s ticks.

| Measure | Observed |
| --- | ---: |
| Trains observed / peak visible / peak queued | ${observed.size} / ${maxTrains} / ${maxQueued} |
| Recorded snapshots / snapshot placement failures | ${snapshots} / ${snapshotPlacementFailures} |
| Maximum body movement per tick (m) | ${f(maxJump)} |
| Drawn leading end: max per-tick move (m); ticks faster than speed allows; ticks moving backward | ${f(maxPointJump)}; ${pointOverspeed}; ${pointBackward} |
| Maximum speed (m/s; km/h) | ${f(maxSpeed)}; ${f(maxSpeed * 3.6)} |
| Maximum acceleration / deceleration (m/s²) | ${f(maxAccel)} / ${f(maxDecel)} |
| Overlap ticks / maximum overlap (m) | ${overlapTicks} / ${f(maxOverlap)} |
| Platform cab changes / reversals outside platforms | ${cabChanges} / ${reversalsOutsidePlatform.length} |
| Unroutable steps / unplaceable interposes | ${report.stepsCouldNotRoute} / ${interposeFailures} |
| Completed fades / unexplained disappearances | ${vanished.length} / ${unexplainedDisappearances} |
| Still visible / queued | ${report.remainingTrains} / ${report.remainingQueued} |
| Wire replacements in mapped berths: interpose / step; separate partner-berth placements | ${placements.wireSameBerthInterposes} / ${placements.wireSameBerthSteps}; ${placements.partnerBerthPlacements} |
| Standing rename candidates: interpose / step; modelled held partner-berth pairs | ${placements.standingInterposeCandidates} / ${placements.standingStepCandidates}; ${placements.heldPartnerTrainPairs} |
| Applied renames: interpose / step; independently born observations merged | ${appliedRenames.interpose} / ${appliedRenames.step}; ${appliedRenames.mergedObservations} |
| Ticks with two stopped trains assigned the same berth | ${doubleHeldBerthTicks} |
| Trains stopped over 10 minutes without occupying a platform stop | ${longHolds.size} |
| Unroutable steps: both outside / inside or uncertain | ${outsideSteps.length} / ${insideSteps.length} |

## Estimated motion comparison

Both runs consume events at the same 0.1 s boundaries, with no preloaded future step history. Per-minute unique counts use physical train ids visible at any point in that elapsed minute; concurrent means average the post-advance train count at each tick. A first appearance is an external leaf when it is within 1 m of a non-platform degree-one graph node, near-anchor when its nose is within max(15 m, anchor error) or its occupied body covers a located anchor stop, otherwise other. Platform buffer leaves within 15 m of a located platform anchor are excluded from the external-leaf class. Immediate first-step cab changes are classified by the occupied body, so swapping the nose does not hide the anchor birth.

| Measure | Estimated motion disabled | Estimated motion enabled |
| --- | ---: | ---: |
| Mean unique physical trains drawn per minute | ${f(baselineMotionSummary.aggregate.meanUniquePhysicalTrainsDrawnPerMinute)} | ${f(enabledMotionSummary.aggregate.meanUniquePhysicalTrainsDrawnPerMinute)} |
| Mean concurrent trains per minute | ${f(baselineMotionSummary.aggregate.meanConcurrentTrainsPerMinute)} | ${f(enabledMotionSummary.aggregate.meanConcurrentTrainsPerMinute)} |
| Estimated physical trains drawn (unique ids) | ${baselineMotionSummary.aggregate.estimatedPhysicalTrainsDrawn} | ${enabledMotionSummary.aggregate.estimatedPhysicalTrainsDrawn} |
| Mean estimated unique trains drawn per minute | ${f(baselineMotionSummary.aggregate.meanEstimatedPhysicalTrainsDrawnPerMinute)} | ${f(enabledMotionSummary.aggregate.meanEstimatedPhysicalTrainsDrawnPerMinute)} |
| Mean concurrent estimated trains per minute | ${f(baselineMotionSummary.aggregate.meanEstimatedConcurrentTrainsPerMinute)} | ${f(enabledMotionSummary.aggregate.meanEstimatedConcurrentTrainsPerMinute)} |
| First appearances: external leaf / near anchor / other | ${baselineMotionSummary.aggregate.firstAppearances.externalLeaf} / ${baselineMotionSummary.aggregate.firstAppearances.nearAnchor} / ${baselineMotionSummary.aggregate.firstAppearances.other} | ${enabledMotionSummary.aggregate.firstAppearances.externalLeaf} / ${enabledMotionSummary.aggregate.firstAppearances.nearAnchor} / ${enabledMotionSummary.aggregate.firstAppearances.other} |
| First appearances initially estimated: external leaf / near anchor / other | ${baselineMotionSummary.aggregate.firstAppearancesInitiallyEstimated.externalLeaf} / ${baselineMotionSummary.aggregate.firstAppearancesInitiallyEstimated.nearAnchor} / ${baselineMotionSummary.aggregate.firstAppearancesInitiallyEstimated.other} | ${enabledMotionSummary.aggregate.firstAppearancesInitiallyEstimated.externalLeaf} / ${enabledMotionSummary.aggregate.firstAppearancesInitiallyEstimated.nearAnchor} / ${enabledMotionSummary.aggregate.firstAppearancesInitiallyEstimated.other} |
| Matching descriptions first visible earlier with estimated motion; median / max lead (s) | — | ${matchingFirstAppearanceDelays.length}; ${f(median(matchingFirstAppearanceDelays))} / ${f(matchingFirstAppearanceDelays.at(-1) ?? 0)} |
| Leading end max point jump (m) | ${f(baselineMaxPointJump)} | ${f(maxPointJump)} |
| Point overspeed / backward ticks | ${baselinePointOverspeed} / ${baselinePointBackward} | ${pointOverspeed} / ${pointBackward} |
| Overlap ticks / max overlap (m) | ${baselineOverlapTicks} / ${f(baselineMaxOverlap)} | ${overlapTicks} / ${f(maxOverlap)} |

Per-minute physical-id counts and concurrent/estimated means are in the motionComparison object in the JSON report.

Top inside-network unroutable pairs: ${topInsidePairs.map((p) => `${p.pair} (${p.count})`).join('; ') || 'none'}.

Long holds: ${[...longHolds.values()].map((h) => `${h.description} at ${h.berth}, target ${h.target}, ${h.seconds.toFixed(1)} s, blocked=${h.blocked}; companions: ${h.companions.map((c) => `${c.description} in ${c.berth}`).join(', ') || 'none'}. ${h.explanation}`).join('; ') || 'none'}.

Wire replacements count a new description replacing the recorded owner of a mapped berth. Standing candidates additionally require the previous body stopped at that exact anchor. Applied renames include deferred renames after an animated arrival. Independently born observations joined by a later same-berth placement retain the standing body; the extra observation fades at its existing position. Separate partner-berth placements can represent two physical trains. Held partner-berth pairs counts distinct pairs of modelled bodies simultaneously held in different partner berths, including a rear train stopped short by occupancy; TD alone cannot establish rolling-stock identity. Coexisting descriptions alone do not prove a second physical train. Partner berths remain separate. Outside-network failures require both ends explicitly classified outside-network; unknown endpoints count as inside/uncertain. Long holds include blocked departing trains with zero speed. AnchorMap has no platform polygons: platform occupancy means the leading point or occupied body includes any mapped platform stop; a platform target alone does not exempt a train stopped in the throat. Failed steps are distinct input events, including failures deferred until arrival; a step producing several diagnostics counts once. Unattributed routing diagnostics: ${unattributedRoutingIssues}. Inside/uncertain routing reasons: ${JSON.stringify(Object.fromEntries(insideRoutingReasons))}.

Body movement uses travelled distance: a stationary platform cab change moves the *leading-end label* to the other end without moving the train. Collision checks compare occupied graph intervals, including coaches across junctions. New overlapping observations are queued rather than drawn. Unroutable steps include first sightings without mapped origins, and individual reasons are in the JSON report. Completed fades include cancels and 20-minute quiet timeouts.

Assumptions: the page's real layouts (${lengths.long} m for headcodes starting 1, ${lengths.short} m otherwise), acceleration 0.7 m/s², service braking 0.6 m/s², 40 km/h on untagged ways, at most 25 km/h inside KINGS_CROSS and over the last 400 m of a platform approach, and 5 m separation. OSM maxspeed is supplied by way id. Unmapped departures without a known anchored successor follow historical junction turns where available, otherwise the straightest forward continuation to an external graph leaf, then fade. Platform buffers are excluded as external leaves. Shared approach evidence warms up from the replay: every link needs at least two distinct train descriptions, all branches must resolve to one non-platform anchor, and outside-network branches prevent an estimate. Until enough evidence exists, cold arrivals wait for mapped steps; learned arrivals enter from the graph boundary and can be held max(25 m, anchor error) short of the anchor until their own mapped step confirms it. Matching step residence times are capped at their per-link median when available; otherwise the OSM way maxspeed or default speed limit applies. Platform dwell does not set a departure running-time estimate. Targets behind the train or inside its service braking distance are refused. First sightings may have a clipped body at the network boundary. There is no signalling/interlocking model; graph routing and train occupancy determine movement authority. Cancelled trains remain solid during their five-second fade.

Playback speed ${speed} is metadata for an unpaced audit; fixed simulation steps keep physics identical at every playback rate. Events are applied at the next tick (at most 0.1 s late). The audit drains six seconds past the final event so final cancels can fade.

Snapshots use the same area-scoped reconciliation as live reconnects and replay: absent descriptions fade and current descriptions are interposed without relocating retained bodies. ${snapshots === 0 ? 'This legacy recording contains no snapshots. Missing events across relay restarts cannot be recovered; these results preserve the legacy empty-world replay.' : 'Snapshot placement failures count missing anchors in checkpoint pictures separately from original TD steps and interposes.'}

Anchor sources: ${anchors.sources.map((s) => JSON.stringify(s)).join(', ')}. A hand-made anchor map only validates those anchors, not the real berth geography.

When the anchor worker writes .scratch/<run>/anchors.json, run from the repository root:

\`\`\`sh
node kings-cross-src/tools/motion-check.ts --anchors .scratch/<run>/anchors.json --recording /Users/md/kx-data/recordings/td-Y9-20261107.ndjson --speed 1 --out .scratch/motion-real
\`\`\`
`;
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'motion-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(out, 'motion-report.md'), markdown);
console.log(JSON.stringify({ ...report, anchorSources: undefined, routingIssues: undefined, invalidReversals: undefined, vanishedTrains: undefined, backwardExamples: undefined, doubleHeldExamples: undefined,
  motionComparison: { ...report.motionComparison,
    estimatedMotionDisabled: { ...report.motionComparison.estimatedMotionDisabled, perMinute: undefined },
    estimatedMotionEnabled: { ...report.motionComparison.estimatedMotionEnabled, perMinute: undefined } } }, null, 2));
