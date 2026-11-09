// Offline evidence only: recordings and all derived reports stay in worktree .scratch.
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, open, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_A_TRAIN } from '../core/anchors.ts';
import type { AnchorMap, BerthAnchor } from '../core/anchors.ts';
import { analyseSteps, buildAnchors } from '../core/berths.ts';
import { buildGraph } from '../core/graph.ts';
import type { Edge, Graph } from '../core/graph.ts';
import { createMotion, DEFAULT_BUFFER_CLEARANCE_M, overlapM } from '../core/motion.ts';
import type { TrainView } from '../core/motion.ts';
import type { KxData } from '../core/osm.ts';
import { matchService, validDate } from '../core/schedule.ts';
import type { ScheduleCall } from '../core/schedule.ts';
import { createTrainKinds } from '../web/src/trains-live.ts';
import type { FormationChoice } from '../web/src/trains-live.ts';
import { createTimeline, parseRecording, ukDate } from '../web/src/feed.ts';
import type { RecordedEvent, SnapshotEvent } from '../web/src/feed.ts';

/** Locate the stopping cab independently of the replayed train, along its platform rail. */
export function platformStoppingPoint(graph: Graph, anchor: BerthAnchor): { edge: Edge; t: number } | undefined {
  const first = graph.edges.find((e) => e.a === anchor.from && e.b === anchor.to || e.a === anchor.to && e.b === anchor.from);
  if (!first || !(anchor.t >= 0 && anchor.t <= 1)) return;
  let edge: Edge = first;
  let t = edge.a === anchor.from ? anchor.t : 1 - anchor.t;
  if (anchor.platform === undefined) return { edge, t };
  let direction = edge.a === anchor.from ? -1 : 1, left = DEFAULT_BUFFER_CLEARANCE_M;
  const seen = new Set<Edge>();
  while (edge.length > 0 && !seen.has(edge)) {
    seen.add(edge);
    const available = (direction > 0 ? 1 - t : t) * edge.length;
    if (left <= available + 1e-8) return { edge, t: t + direction * Math.min(left, available) / edge.length };
    left -= available;
    const node: number = direction > 0 ? edge.b : edge.a;
    const p = graph.pos.get(node)!, previous = graph.pos.get(direction > 0 ? edge.a : edge.b)!;
    const score = (next: Edge): number => {
      const q = graph.pos.get(next.a === node ? next.b : next.a)!;
      return ((p[0] - previous[0]) * (q[0] - p[0]) + (p[1] - previous[1]) * (q[1] - p[1])) / next.length;
    };
    // A short terminal edge may end before the clearance. Keep following the same
    // rail alignment rather than adding a world-coordinate offset across the track.
    const next: Edge | undefined = (graph.adj.get(node) ?? []).filter((e) => e.length > 0 && !seen.has(e) && score(e) >= -1e-8)
      .sort((a, b) => score(b) - score(a) || a.wayId - b.wayId || a.a - b.a || a.b - b.b)[0];
    if (!next) return;
    edge = next; t = edge.a === node ? 0 : 1; direction = edge.a === node ? 1 : -1;
  }
}

export function berthInventory(rows: readonly RecordedEvent[], map: AnchorMap) {
  const seen = new Map<string, number>();
  let placeholders = 0;
  for (const { e } of rows) {
    if (e.area !== map.area) continue;
    const berths = e.kind === 'snapshot' ? Object.keys((e as SnapshotEvent).berths) :
      e.kind === 'step' ? [e.from, e.to] : e.kind === 'interpose' ? [e.to] : e.kind === 'cancel' ? [e.from] : [];
    for (const berth of new Set(berths)) if (berth) seen.set(berth, (seen.get(berth) ?? 0) + 1);
    if (e.descr === NOT_A_TRAIN) placeholders++;
    if (e.kind === 'snapshot') placeholders += Object.values((e as SnapshotEvent).berths).filter((d) => d === NOT_A_TRAIN).length;
  }
  const violations: string[] = [];
  // Duplicates are invalid even when not observed in this recording.
  const classified = [...map.anchors, ...map.unmapped];
  const counts = new Map<string, number>();
  for (const a of classified) counts.set(a.berth, (counts.get(a.berth) ?? 0) + 1);
  for (const [berth, count] of counts) if (count !== 1) violations.push(`duplicate berth classification: ${berth} (${count})`);
  const inventory = [...seen].sort(([a], [b]) => a.localeCompare(b)).map(([berth, observations]) => {
    const a = map.anchors.find((a) => a.berth === berth), u = map.unmapped.find((u) => u.berth === berth);
    if (!counts.has(berth)) violations.push(`missing berth classification: ${berth}`);
    if (u && (!['outside-network', 'no-evidence', 'conflict'].includes(u.reason) || !u.detail?.trim())) violations.push(`unmapped berth lacks reason/detail: ${berth}`);
    return { berth, observations, classification: a ? 'anchored' : u ? 'unmapped' : 'missing', reason: u?.reason, detail: u?.detail };
  });
  return { inventory, placeholders, violations };
}

export function replayReport(data: KxData, rows: readonly RecordedEvent[], anchors: AnchorMap,
  options: { schedule?: { date: string; calls: ScheduleCall[] } } = {}) {
  if (!rows.length) throw new Error('recording is empty');
  const graph = buildGraph(data);
  const coverage = berthInventory(rows, anchors), violations = [...coverage.violations];
  const byBerth = new Map(anchors.anchors.map((a) => [a.berth, a]));
  const locate = (berth: string) => {
    const a = byBerth.get(berth);
    if (!a) return undefined;
    const edge = graph.edges.find((e) => e.a === a.from && e.b === a.to || e.a === a.to && e.b === a.from);
    return edge ? { edge, t: edge.a === a.from ? a.t : 1 - a.t } : undefined;
  };
  for (const a of anchors.anchors) {
    const p = locate(a.berth);
    if (!p || !Number.isFinite(a.t) || a.t < 0 || a.t > 1) violations.push(`invalid graph anchor: ${a.berth}`);
  }
  // Independently regenerate only the canonical platform stops from OSM polygons and terminal order.
  const expected = new Map(buildAnchors(data, [], [], { area: anchors.area, calibrate: false }).anchors
    .filter((a) => a.kind === 'platform' && /^10(?:0\d|10)$/.test(a.berth)).map((a) => [a.berth, a]));
  const stops = new Map(anchors.anchors.map((a) => [a.berth, platformStoppingPoint(graph, a)]));
  const expectedStops = new Map([...expected].map(([berth, a]) => [berth, platformStoppingPoint(graph, a)]));
  const noseAtStop = (t: TrainView, stop: ReturnType<typeof platformStoppingPoint>): boolean =>
    Boolean(stop && t.leading.edge === stop.edge && Math.abs(t.leading.t - stop.t) * stop.edge.length < 0.05);
  const bodyAtStop = (t: TrainView, stop: ReturnType<typeof platformStoppingPoint>): boolean => Boolean(stop &&
    (noseAtStop(t, stop) || t.occupied.some((part) => part.edge === stop.edge && stop.t >= Math.min(part.fromT, part.toT) - 1e-8 && stop.t <= Math.max(part.fromT, part.toT) + 1e-8)));
  const platforms = [...new Set(coverage.inventory.map((i) => i.berth).filter((b) => /^10(?:0\d|10)$/.test(b)))].map((berth) => {
    const n = String(Number(berth) - 1000), actual = byBerth.get(berth), correct = expected.get(berth);
    const sameTrack = Boolean(actual && correct && ((actual.from === correct.from && actual.to === correct.to) || (actual.from === correct.to && actual.to === correct.from)));
    if (!actual) violations.push(`platform berth is not anchored: ${berth}`);
    if (actual && (actual.platform !== n || !sameTrack)) violations.push(`wrong platform assignment: ${berth} must use OSM platform ${n} terminal track`);
    return { berth, platform: n, mapped: Boolean(actual), osmTrackAvailable: Boolean(correct), correctTargetTrack: sameTrack,
      reachedSamples: 0, movingSamples: 0, blockedSamples: 0, pendingSamples: 0, actuallyHeldWrongTrackSamples: 0 };
  });
  const formationBasis = new Map<number, 'timetable-matched' | 'assumed-fallback'>();
  const kinds = createTrainKinds((description, time) => matchService(description, time, options.schedule?.calls ?? []));
  const motion = createMotion(graph, anchors, { estimatedMotion: true,
    lengthM: (description, birth) => {
      formationBasis.set(birth.id, matchService(description, birth.timeMs, options.schedule?.calls ?? []) ? 'timetable-matched' : 'assumed-fallback');
      return kinds.lengthM(description, birth);
    },
    wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
  const start = rows[0]!.t, end = rows.at(-1)!.t + 6000, dt = 0.1;
  const timeline = createTimeline(motion, start);
  type SourceEvidence = { eventIndex: number; atMs: number; kind: 'snapshot' | 'cancel'; empty?: boolean;
    physicalDescriptionPresent?: boolean; stepDescriptionPresent?: boolean; targetBerthOwner?: string; from?: string };
  type PlatformStep = { observationKind: 'incoming' | 'same-stop-transfer'; afterDeparture?: boolean;
    sourceEvidence?: SourceEvidence; terminalSourceEvent?: SourceEvidence; disappearedAtMs?: number; routeRefusedReason?: string; eventIndex: number; atMs: number; from?: string; to: string; description: string; physicalId?: number;
    reachedAtMs?: number; lastReachedAtMs?: number; firstObservedAtMs?: number; lastObservedAtMs?: number;
    formation?: FormationChoice; lengthM?: number; formationBasis?: 'timetable-matched' | 'assumed-fallback';
    terminalReason?: string; lastDiagnostic?: { kind: string; reason: string; atMs: number }; blocked: boolean; queued: boolean; routeRefused: boolean; lastSeenState?: string; resolution?: string };
  const platformSteps: PlatformStep[] = [];
  const renameCounts = new Map<number, number>();
  let diagnosticCursor = 0, unattributedRenames = 0;
  const captureRenames = (): void => {
    const issues = motion.diagnostics(), trains = motion.trains();
    for (const issue of issues.slice(diagnosticCursor)) {
      for (const step of platformSteps) {
        const linked = step.physicalId === undefined ? undefined : trains.find(t => t.id === step.physicalId) ?? previous.get(step.physicalId);
        if (issue.description === (linked?.description ?? (step.physicalId === undefined ? step.description : undefined))) step.lastDiagnostic = {kind: issue.kind, reason: issue.reason, atMs: timeline.timeMs()};
      }
      if (issue.kind === 'renamed') {
      const t = trains.find((t) => t.description === issue.description);
      if (t) {
        renameCounts.set(t.id, (renameCounts.get(t.id) ?? 0) + 1);
        if (!physical.has(t.id)) physical.set(t.id, new Set());
        if (issue.previousDescription) physical.get(t.id)!.add(issue.previousDescription);
        physical.get(t.id)!.add(issue.description);
      } else unattributedRenames++;
      }
    }
    diagnosticCursor = issues.length;
  };
  const observePlatformSteps = (trains: TrainView[], atMs: number): void => {
    for (const step of platformSteps) {
      const t = step.physicalId === undefined ? trains.find((t) => t.description === step.description) : trains.find((t) => t.id === step.physicalId);
      if (!t) {
        if (step.physicalId !== undefined && step.lastObservedAtMs !== undefined) step.disappearedAtMs ??= atMs;
        continue;
      }
      if (t.state === 'fading' && step.sourceEvidence) step.terminalSourceEvent ??= step.sourceEvidence;
      step.physicalId = t.id; step.blocked = t.blocked; step.lastSeenState = t.state;
      step.firstObservedAtMs ??= atMs; step.lastObservedAtMs = atMs;
      step.formation = kinds.formationFor(t); step.lengthM = t.lengthM; step.formationBasis = formationBasis.get(t.id);
      if (t.speed === 0 && bodyAtStop(t, expectedStops.get(step.to))) {
        step.reachedAtMs ??= atMs; step.lastReachedAtMs = atMs;
      }
    }
  };
  let cursor = 0, samples = 0, anchoredSeconds = 0, estimatedSeconds = 0, fadingSeconds = 0;
  let starsDrawn = 0, overspeed = 0, backwards = 0, overlaps = 0, peakQueued = 0;
  let previous = new Map<number, TrainView>();
  const estimatedById = new Map<number, boolean>();
  const physical = new Map<number, Set<string>>();
  for (let tick = 0; start + tick * 100 <= end; tick++) {
    const at = start + tick * 100;
    while (cursor < rows.length && rows[cursor]!.t <= at) {
      const row = rows[cursor++]!;
      observePlatformSteps(motion.trains(), timeline.timeMs());
      const beforeIssues = motion.diagnostics().length;
      const beforeTrain = motion.trains().find(t => t.description === row.e.descr);
      if (row.e.area === anchors.area && (row.e.kind === 'snapshot' || row.e.kind === 'cancel')) {
        for (const step of platformSteps) {
          const linked = step.physicalId === undefined ? undefined : motion.trains().find(t => t.id === step.physicalId);
          if (!linked) continue;
          if (row.e.kind === 'snapshot') {
            const owners = Object.values((row.e as SnapshotEvent).berths);
            if (!owners.includes(linked.description)) step.sourceEvidence = {eventIndex: cursor - 1, atMs: row.t, kind: 'snapshot',
              empty: owners.length === 0, physicalDescriptionPresent: false, stepDescriptionPresent: owners.includes(step.description),
              ...((row.e as SnapshotEvent).berths[linked.targetBerth] ?? (row.e as SnapshotEvent).berths[step.to] ?
                {targetBerthOwner: (row.e as SnapshotEvent).berths[linked.targetBerth] ?? (row.e as SnapshotEvent).berths[step.to]} : {})};
          } else if (row.e.descr === linked.description || row.e.descr === step.description) {
            step.sourceEvidence = {eventIndex: cursor - 1, atMs: row.t, kind: 'cancel', from: row.e.from};
          }
        }
      }
      timeline.deliver(row.e, row.t);
      captureRenames();
      if (row.e.area === anchors.area && row.e.kind === 'step' && row.e.descr !== NOT_A_TRAIN && /^10(?:0\d|10)$/.test(row.e.to ?? '')) {
        const emitted = motion.diagnostics().slice(beforeIssues).filter(i => i.description === row.e.descr);
        const fromStop = stops.get(row.e.from ?? ''), toStop = stops.get(row.e.to!);
        const observationKind = fromStop && toStop && fromStop.edge === toStop.edge && Math.abs(fromStop.t - toStop.t) * fromStop.edge.length < 0.05 ? 'same-stop-transfer' : 'incoming';
        platformSteps.push({ observationKind, afterDeparture: beforeTrain !== undefined && beforeTrain.reversals > 0 && beforeTrain.state === 'departing', eventIndex: cursor - 1, atMs: row.t, from: row.e.from, to: row.e.to!, description: row.e.descr!,
          blocked: false, queued: emitted.some((i) => i.kind === 'queued'), routeRefused: emitted.some((i) => i.kind === 'unroutable'),
          routeRefusedReason: emitted.find(i => i.kind === 'unroutable')?.reason,
          lastDiagnostic: emitted.length ? { kind: emitted.at(-1)!.kind, reason: emitted.at(-1)!.reason, atMs: row.t } : undefined });
        observePlatformSteps(motion.trains(), timeline.timeMs());
      }
    }
    timeline.advanceTo(at);
    captureRenames();
    const trains = motion.trains();
    observePlatformSteps(trains, at);
    samples++;
    peakQueued = Math.max(peakQueued, motion.queuedCount());
    for (const t of trains) {
      if (!physical.has(t.id)) physical.set(t.id, new Set());
      physical.get(t.id)!.add(t.description);
      if (t.description === NOT_A_TRAIN) starsDrawn++;
      if (t.state !== 'fading') estimatedById.set(t.id, t.state === 'estimated');
      // Fade retains the last non-fading classification; fading time is also reported separately.
      if (estimatedById.get(t.id)) estimatedSeconds += dt; else anchoredSeconds += dt;
      if (t.state === 'fading') fadingSeconds += dt;
      const old = previous.get(t.id);
      if (old && old.reversals === t.reversals) {
        const dx = t.leading.point[0] - old.leading.point[0], dz = t.leading.point[1] - old.leading.point[1];
        if (Math.hypot(dx, dz) > Math.max(old.speed, t.speed) * dt + 0.05) overspeed++;
        if (dx * Math.sin(old.heading) - dz * Math.cos(old.heading) < -0.05) backwards++;
      }
      for (const p of platforms) if (t.targetBerth === p.berth) {
        const reached = t.speed === 0 && noseAtStop(t, stops.get(p.berth));
        if (reached) {
          p.reachedSamples++;
          const correctStop = expectedStops.get(p.berth);
          if (correctStop && t.leading.edge !== correctStop.edge) p.actuallyHeldWrongTrackSamples++;
        } else if (t.blocked) p.blockedSamples++;
        else if (t.speed > 0) p.movingSamples++;
        else p.pendingSamples++;
      }
    }
    for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) if (overlapM(trains[i]!.occupied, trains[j]!.occupied) > 1e-6) overlaps++;
    previous = new Map(trains.map((t) => [t.id, t]));
  }
  if (starsDrawn) violations.push(`placeholder drawn: ${starsDrawn} samples`);
  if (overspeed) violations.push(`drawn overspeed: ${overspeed} samples`);
  if (backwards) violations.push(`drawn backwards: ${backwards} samples`);
  if (overlaps) violations.push(`drawn overlaps: ${overlaps} pairs at samples`);
  for (const p of platforms) if (p.actuallyHeldWrongTrackSamples) violations.push(`actually held on wrong platform track: ${p.berth}`);
  const issues = motion.diagnostics();
  const physicalSteps = rows.filter(({ e }) => e.area === anchors.area && e.kind === 'step' && e.descr !== NOT_A_TRAIN);
  const stepJumps = analyseSteps(data, [rows.map(({ t, e }) => ({ t, e }))], anchors);
  for (const jump of stepJumps) {
    if (jump.lengthM === null) violations.push(`mapped step disconnected: ${jump.from} -> ${jump.to}`);
    if (jump.reversal) violations.push(`mapped step reversal: ${jump.from} -> ${jump.to}`);
    if (jump.issues.some((issue) => issue.includes('speed above') || issue.includes('zero-time'))) violations.push(`mapped step implied-speed/zero-time violation: ${jump.from} -> ${jump.to}`);
  }
  for (const step of platformSteps) step.resolution = step.observationKind === 'same-stop-transfer' ? 'same-stop-transfer' : step.reachedAtMs !== undefined ? 'reached-correct-track' :
    step.routeRefused ? 'route-refused' : step.blocked ? 'blocked' : step.physicalId !== undefined ? 'pending' : step.queued ? 'queued' : 'no-body';
  for (const step of platformSteps) {
    const reason = step.reachedAtMs !== undefined ? 'observed stopped body on correct platform track' :
      step.disappearedAtMs !== undefined && step.lastSeenState === 'fading' ? 'linked body disappeared after observed fading' :
      `replay ended after six-second drain; ${step.resolution}${step.lastSeenState ? `; last observed state ${step.lastSeenState}` : ''}`;
    step.terminalReason = (step.observationKind === 'same-stop-transfer' ? `same-stop transfer${step.afterDeparture ? ' after departure' : ''}; ` : '') +
      (step.routeRefused ? `route refused: ${step.routeRefusedReason}; ` : '') + reason;
  }
  const platformStepSummary = { total: platformSteps.length, incoming: platformSteps.filter(s => s.observationKind === 'incoming').length, sameStopTransfers: platformSteps.filter(s => s.observationKind === 'same-stop-transfer').length, reachedCorrectTrack: platformSteps.filter((s) => s.resolution === 'reached-correct-track').length,
    unresolved: platformSteps.filter((s) => s.observationKind === 'incoming' && s.resolution !== 'reached-correct-track').length,
    outcomes: Object.fromEntries(['reached-correct-track', 'blocked', 'pending', 'queued', 'route-refused', 'no-body', 'same-stop-transfer'].map((state) => [state, platformSteps.filter((s) => s.resolution === state).length])) };
  const median = (ns: number[]) => { const a = [...ns].sort((a, b) => a - b), i = Math.floor(a.length / 2); return a.length ? a.length % 2 ? a[i]! : (a[i - 1]! + a[i]!) / 2 : 0; };
  const byPhysicalId = [...physical].map(([id, descriptions]) => ({ id, descriptions: [...descriptions], descriptionsCount: descriptions.size, renameCount: renameCounts.get(id) ?? 0 }));
  return { ok: violations.length === 0, violations, events: rows.length, area: anchors.area, samples, stepSeconds: dt,
    durationSeconds: (rows.at(-1)!.t - start) / 1000, drainSeconds: 6,
    coverage: { seen: coverage.inventory.length, anchored: coverage.inventory.filter((i) => i.classification === 'anchored').length,
      unmapped: coverage.inventory.filter((i) => i.classification === 'unmapped').length, placeholderObservations: coverage.placeholders, berths: coverage.inventory },
    timetable: { date: options.schedule?.date ?? ukDate(start), available: Boolean(options.schedule),
      note: options.schedule ? 'Timetable matched at physical birth where available; unmatched services use assumed fallback formation.' :
        'No timetable supplied for this date: assumed fallback formation for every physical birth.' },
    platforms, platformSteps, platformStepSummary, stepJumps, stepSummary: { physicalStepEvents: physicalSteps.length, unmeasuredEndpointEvents: physicalSteps.filter(({ e }) => !byBerth.has(e.from!) || !byBerth.has(e.to!)).length, mappedPairs: stepJumps.length, disconnectedPairs: stepJumps.filter((s) => s.lengthM === null).length,
      reversalPairs: stepJumps.filter((s) => s.reversal).length, impliedSpeedFlagPairs: stepJumps.filter((s) => s.issues.some((i) => i.includes('speed above') || i.includes('zero-time'))).length },
    headcodeChurn: { physicalIds: physical.size, idsWithMultipleDescriptions: [...physical.values()].filter((v) => v.size > 1).length,
      renames: issues.filter((i) => i.kind === 'renamed').length, unattributedRenames,
      maxRenamesPerPhysicalId: Math.max(0, ...byPhysicalId.map((p) => p.renameCount)), medianRenamesPerPhysicalId: median(byPhysicalId.map((p) => p.renameCount)),
      maxDescriptionsPerPhysicalId: Math.max(0, ...byPhysicalId.map((p) => p.descriptionsCount)), medianDescriptionsPerPhysicalId: median(byPhysicalId.map((p) => p.descriptionsCount)), mergedObservations: issues.filter((i) => i.kind === 'merged').length,
      byPhysicalId },
    drawnTime: { anchoredTrainSeconds: anchoredSeconds, estimatedTrainSeconds: estimatedSeconds, fadingTrainSeconds: fadingSeconds,
      basis: 'Post-advance fixed 0.1 s samples, including the initial sample and six-second drain; fades retain their preceding estimated classification and are additionally counted separately.' },
    motion: { starsDrawn, overspeedSamples: overspeed, backwardsSamples: backwards, overlapPairSamples: overlaps,
      peakQueued, queuedAtEnd: motion.queuedCount(), unroutable: issues.filter((i) => i.kind === 'unroutable').length },
    limitations: ['TD steps grant authority; they do not instantaneously place a nose at the target. Pending/blocked targets are not wrong-track arrivals.',
      'Same-stop transfer means co-location in the supplied anchor map, not an independent finding of TD berth semantics; unresolved buffer/platform alias assumptions remain assumptions.',
      'Per-step identities use visible descriptions, then retain the physical id through renames. Deferred names may resolve only when applied; no visible identity is reported as no-body or queued, not a successful arrival.',
      'Platform samples describe visible bodies targeting canonical platform berths; queued observations are not drawn and only aggregate queue size is exposed by motion.',
      'Step implied-speed flags describe TD residence and coarse anchors, not drawn physical speed. Unmapped endpoint pairs have no graph-distance claim.',
      'OSM platform track assignment is regenerated from platform polygons and terminal ordering; this is a geometry check, not an independent survey.',
      'This report does not establish live/replay equivalence; use the separate live-vs-replay audit.'] };
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const inside = (a: string, b: string) => { const r = relative(a, b); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };

type ReplayMetrics = ReturnType<typeof replayReport>;
interface RecordingInput {
  path: string;
  capturedPath: string;
  sha256: string;
  capturedBytes: number;
  sourceBytesAtOpen: number;
  sourceBytesAtReadEnd: number;
  sourceModifiedAtOpen: string;
  sourceModifiedAtReadEnd: string;
  sourceChangedDuringCapture: boolean;
  trailingBytesOmitted: number;
  capturedAt: string;
  events: number;
  capturedBounds: { byteStart: number; byteEndExclusive: number; sourceByteEndExclusive: number; firstEventTimeMs: number | null; lastEventTimeMs: number | null };
}
interface ReplayEntry { input: RecordingInput; metrics: ReplayMetrics }
interface InputFingerprint { path: string; capturedPath: string; bytes: number; sha256: string }
interface ReplayOutput extends ReplayMetrics {
  recordings?: ReplayEntry[];
  unionInventory: { seen: number; anchored: number; unmapped: number; berths: ReplayMetrics['coverage']['berths'] };
  berthsReconciliation?: Record<string, unknown>;
  reproducibility: {
    inputHashes: { recordings: RecordingInput[]; anchors: InputFingerprint; effectiveAnchors?: InputFingerprint; graph: InputFingerprint; smart?: InputFingerprint; schedules?: Array<InputFingerprint & { date: string }> };
    command: { cwd: string; command: string; executable: string; args: string[] };
  };
}

function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

async function readBoundedRecording(path: string): Promise<{ bytes: Buffer; sourceBytesAtOpen: number; sourceBytesAtReadEnd: number;
  sourceModifiedAtOpen: string; sourceModifiedAtReadEnd: string; sourceChangedDuringCapture: boolean }> {
  const handle = await open(path, 'r');
  try {
    const before = await handle.stat();
    if (!before.isFile()) throw new Error(`recording is not a regular file: ${path}`);
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const read = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!read.bytesRead) throw new Error(`recording shrank while capturing its initial ${before.size}-byte bound: ${path}`);
      offset += read.bytesRead;
    }
    const after = await handle.stat();
    return { bytes, sourceBytesAtOpen: before.size, sourceBytesAtReadEnd: after.size,
      sourceModifiedAtOpen: new Date(before.mtimeMs).toISOString(), sourceModifiedAtReadEnd: new Date(after.mtimeMs).toISOString(),
      sourceChangedDuringCapture: before.size !== after.size || before.mtimeMs !== after.mtimeMs };
  } finally { await handle.close(); }
}

async function captureInput(out: string, scratchReal: string, name: string, bytes: Buffer, sourcePath: string): Promise<InputFingerprint> {
  const directory = resolve(out, 'inputs');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const actualDirectory = await realpath(directory);
  if (!inside(scratchReal, actualDirectory)) throw new Error('captured input directory escapes .scratch');
  const digest = sha256(bytes), suffix = extname(name), stem = basename(name, suffix);
  const capturedPath = resolve(directory, `${stem}-${digest.slice(0, 12)}${suffix}`);
  try {
    const prior = await open(capturedPath, 'wx', 0o600);
    try { await prior.writeFile(bytes); } finally { await prior.close(); }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    const info = await lstat(capturedPath);
    if (!info.isFile() || info.isSymbolicLink() || sha256(await readFile(capturedPath)) !== digest) {
      throw new Error(`captured input path already exists with different content: ${capturedPath}`);
    }
  }
  const actualFile = await realpath(capturedPath);
  if (!inside(scratchReal, actualFile)) throw new Error('captured input symlink escapes .scratch');
  return { path: sourcePath, capturedPath, bytes: bytes.length, sha256: digest };
}

function sumField(reports: readonly ReplayMetrics[], group: keyof ReplayMetrics, field: string): number {
  return reports.reduce((sum, report) => sum + Number((report[group] as Record<string, unknown>)[field] ?? 0), 0);
}

function combineReplayReports(entries: ReplayEntry[]): ReplayMetrics {
  const reports = entries.map((entry) => entry.metrics), berthMap = new Map<string, ReplayMetrics['coverage']['berths'][number]>();
  for (const report of reports) for (const berth of report.coverage.berths) {
    const prior = berthMap.get(berth.berth);
    if (prior) prior.observations += berth.observations;
    else berthMap.set(berth.berth, { ...berth });
  }
  const berths = [...berthMap.values()].sort((a, b) => a.berth.localeCompare(b.berth));
  const platformMap = new Map<string, ReplayMetrics['platforms'][number]>();
  for (const report of reports) for (const platform of report.platforms) {
    const prior = platformMap.get(platform.berth);
    if (!prior) platformMap.set(platform.berth, { ...platform });
    else {
      prior.reachedSamples += platform.reachedSamples; prior.movingSamples += platform.movingSamples;
      prior.blockedSamples += platform.blockedSamples; prior.pendingSamples += platform.pendingSamples;
      prior.actuallyHeldWrongTrackSamples += platform.actuallyHeldWrongTrackSamples;
    }
  }
  const platformSteps = entries.flatMap(({ input, metrics }) => metrics.platformSteps.map((step) => ({ ...step, recording: input.path })));
  const stepJumps = entries.flatMap(({ input, metrics }) => metrics.stepJumps.map((jump) => ({ ...jump, recording: input.path })));
  const byPhysicalId = entries.flatMap(({ input, metrics }) => metrics.headcodeChurn.byPhysicalId.map((item) => ({ ...item, recording: input.path })));
  const outcomes = Object.fromEntries(['reached-correct-track', 'blocked', 'pending', 'queued', 'route-refused', 'no-body', 'same-stop-transfer']
    .map((state) => [state, reports.reduce((n, report) => n + report.platformStepSummary.outcomes[state as keyof typeof report.platformStepSummary.outcomes], 0)]));
  const violations = entries.flatMap(({ input, metrics }) => metrics.violations.map((violation) => `${input.path}: ${violation}`));
  const med = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b), mid = Math.floor(sorted.length / 2);
    return sorted.length ? sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2 : 0;
  };
  const durationSeconds = reports.reduce((n, report) => n + report.durationSeconds, 0);
  const headcodeChurn = {
    physicalIds: sumField(reports, 'headcodeChurn', 'physicalIds'),
    idsWithMultipleDescriptions: sumField(reports, 'headcodeChurn', 'idsWithMultipleDescriptions'),
    renames: sumField(reports, 'headcodeChurn', 'renames'),
    unattributedRenames: sumField(reports, 'headcodeChurn', 'unattributedRenames'),
    maxRenamesPerPhysicalId: Math.max(0, ...byPhysicalId.map((item) => item.renameCount)),
    medianRenamesPerPhysicalId: med(byPhysicalId.map((item) => item.renameCount)),
    maxDescriptionsPerPhysicalId: Math.max(0, ...byPhysicalId.map((item) => item.descriptionsCount)),
    medianDescriptionsPerPhysicalId: med(byPhysicalId.map((item) => item.descriptionsCount)),
    mergedObservations: sumField(reports, 'headcodeChurn', 'mergedObservations'), byPhysicalId,
    aggregation: 'Counts sum independent recordings; physical ids are recording-local and do not carry across files.',
  };
  return {
    ok: reports.every((report) => report.ok), violations, events: reports.reduce((n, report) => n + report.events, 0), area: reports[0]!.area,
    samples: reports.reduce((n, report) => n + report.samples, 0), stepSeconds: reports[0]!.stepSeconds,
    durationSeconds, drainSeconds: reports.reduce((n, report) => n + report.drainSeconds, 0),
    coverage: { seen: berths.length, anchored: berths.filter((b) => b.classification === 'anchored').length,
      unmapped: berths.filter((b) => b.classification === 'unmapped').length,
      placeholderObservations: reports.reduce((n, report) => n + report.coverage.placeholderObservations, 0), berths },
    timetable: {date: 'multiple recording dates', available: reports.every(r => r.timetable.available), note: 'See per-recording timetable status; missing dates use assumed fallback formation.'},
    platforms: [...platformMap.values()].sort((a, b) => a.berth.localeCompare(b.berth)), platformSteps,
    platformStepSummary: { total: platformSteps.length, incoming: platformSteps.filter(s => s.observationKind === 'incoming').length, sameStopTransfers: platformSteps.filter(s => s.observationKind === 'same-stop-transfer').length, reachedCorrectTrack: outcomes['reached-correct-track'],
      unresolved: platformSteps.length - outcomes['same-stop-transfer'] - outcomes['reached-correct-track'], outcomes },
    stepJumps,
    stepSummary: { physicalStepEvents: sumField(reports, 'stepSummary', 'physicalStepEvents'),
      unmeasuredEndpointEvents: sumField(reports, 'stepSummary', 'unmeasuredEndpointEvents'),
      mappedPairs: sumField(reports, 'stepSummary', 'mappedPairs'), disconnectedPairs: sumField(reports, 'stepSummary', 'disconnectedPairs'),
      reversalPairs: sumField(reports, 'stepSummary', 'reversalPairs'), impliedSpeedFlagPairs: sumField(reports, 'stepSummary', 'impliedSpeedFlagPairs') },
    headcodeChurn,
    drawnTime: { anchoredTrainSeconds: sumField(reports, 'drawnTime', 'anchoredTrainSeconds'),
      estimatedTrainSeconds: sumField(reports, 'drawnTime', 'estimatedTrainSeconds'), fadingTrainSeconds: sumField(reports, 'drawnTime', 'fadingTrainSeconds'),
      basis: 'Per-recording post-advance fixed 0.1 s samples, including each initial sample and six-second drain; fades retain their preceding estimated classification and are additionally counted separately.' },
    motion: { starsDrawn: sumField(reports, 'motion', 'starsDrawn'), overspeedSamples: sumField(reports, 'motion', 'overspeedSamples'),
      backwardsSamples: sumField(reports, 'motion', 'backwardsSamples'), overlapPairSamples: sumField(reports, 'motion', 'overlapPairSamples'),
      peakQueued: Math.max(0, ...reports.map((report) => report.motion.peakQueued)),
      queuedAtEnd: Math.max(0, ...reports.map((report) => report.motion.queuedAtEnd)),
      unroutable: sumField(reports, 'motion', 'unroutable') },
    limitations: [...new Set(reports.flatMap((report) => report.limitations))],
  } as ReplayMetrics;
}

function markdownCell(value: unknown): string { return String(value ?? '—').replaceAll('|', '\\|').replace(/[\r\n]+/g, ' '); }

function incomingMarkdown(report: ReplayOutput): string {
  const lines = ['## TD platform events (incoming and same-stop transfers)', '', '| Input | Event index | Time (UTC) | From → to | Description | Body id | Formation / metres | Basis | First / last observed (UTC) | First / last reached (UTC) | Kind | Outcome | Reason | Source evidence |',
    '| --- | ---: | --- | --- | --- | ---: | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const time = (value?: number) => value === undefined ? '—' : new Date(value).toISOString();
  for (const step of report.platformSteps) {
    const recording = (step as typeof step & {recording?: string}).recording;
    lines.push(`| ${markdownCell(recording)} | ${step.eventIndex} | ${time(step.atMs)} | ${markdownCell(step.from)} → ${step.to} | ${markdownCell(step.description)} | ${step.physicalId ?? '—'} | ${step.formation?.kind ?? 'unlinked'} / ${step.lengthM ?? '—'} | ${markdownCell(step.formationBasis ?? 'unlinked; formation not observed')} | ${time(step.firstObservedAtMs)} / ${time(step.lastObservedAtMs)} | ${time(step.reachedAtMs)} / ${time(step.lastReachedAtMs)} | ${step.observationKind} | ${step.resolution} | ${markdownCell(step.terminalReason)} | ${markdownCell(step.terminalSourceEvent ?? step.sourceEvidence ? JSON.stringify(step.terminalSourceEvent ?? step.sourceEvidence) : undefined)} |`);
  }
  return lines.join('\n') + '\n';
}

function replayMarkdown(report: ReplayOutput): string {
  const entries = report.recordings ?? [];
  if (entries.length <= 1) {
    return `# Replay evidence report\n\n${report.ok ? 'PASS' : 'FAIL'}: ${report.coverage.seen} seen berths; ${report.coverage.anchored} anchored, ${report.coverage.unmapped} unmapped. ${report.events} events, ${report.durationSeconds} seconds.\n\n${report.violations.map((v) => `- ${v}`).join('\n')}\n\n${report.headcodeChurn.physicalIds} physical ids; ${report.headcodeChurn.renames} renames; ${report.headcodeChurn.idsWithMultipleDescriptions} ids with multiple descriptions.\n\nDrawn train-seconds: ${report.drawnTime.anchoredTrainSeconds.toFixed(1)} anchored, ${report.drawnTime.estimatedTrainSeconds.toFixed(1)} estimated; ${report.drawnTime.fadingTrainSeconds.toFixed(1)} fading (also included).\n\n${report.platformStepSummary.total} TD platform observations (${report.platformStepSummary.incoming} incoming, ${report.platformStepSummary.sameStopTransfers} same-stop transfers): ${report.platformStepSummary.reachedCorrectTrack} reached the correct track, ${report.platformStepSummary.unresolved} unresolved. Outcomes: ${JSON.stringify(report.platformStepSummary.outcomes)}.\n\n${report.motion.unroutable} unroutable motion diagnostics; peak queued ${report.motion.peakQueued}. These are limitations, not wrong-track arrivals.\n\n${report.stepSummary.physicalStepEvents} physical step events; ${report.stepSummary.unmeasuredEndpointEvents} have an unmapped endpoint. ${report.stepSummary.mappedPairs} mapped step pairs; ${report.stepSummary.disconnectedPairs} disconnected; ${report.stepSummary.impliedSpeedFlagPairs} implied-speed flags.\n\nPlaceholder draw check: ${report.motion.starsDrawn === 0 ? 'PASS' : 'FAIL'} — ${report.motion.starsDrawn} **** samples drawn.\n\n${report.limitations.join('\n\n')}\n\n${report.drawnTime.basis}\n\nFull berth inventory, platform arrival states, step paths and physical-id descriptions are in replay-report.json.\n`;
  }
  const lines = ['# Replay evidence report — multi-recording', '',
    `${report.ok ? '**PASS**' : '**FAIL**'} across ${entries.length} recordings: ${report.events} events over ${report.durationSeconds} recording-seconds; ${report.coverage.seen} unique seen berths (${report.coverage.anchored} anchored, ${report.coverage.unmapped} unmapped).`,
    '', `**Placeholder draw check:** ${report.motion.starsDrawn === 0 ? 'PASS' : 'FAIL'} — ${report.motion.starsDrawn} **** samples drawn across all recordings.`, '',
    '## Captured recording inputs', '', '| Input | Events | Captured bytes | SHA-256 | Captured event-time bounds (ms) | Grew / tail omitted |',
    '| --- | ---: | ---: | --- | --- | --- |'];
  for (const { input } of entries) lines.push(`| ${markdownCell(input.path)} | ${input.events} | ${input.capturedBytes} | ${input.sha256} | ${input.capturedBounds.firstEventTimeMs ?? '—'} to ${input.capturedBounds.lastEventTimeMs ?? '—'} | ${input.sourceChangedDuringCapture ? 'yes' : 'no'} / ${input.trailingBytesOmitted} bytes |`);
  lines.push('', 'The captured byte bounds are `[0, byteEndExclusive)` from the file size observed at open, with a visibly incomplete final JSON line omitted only when the source changed during capture. Exact captured bytes, anchors and graph are retained under `inputs/` and fingerprinted in the JSON report.', '',
    '## Union berth inventory', '', '| Berth | Observations | Classification | Reason | Detail |', '| --- | ---: | --- | --- | --- |');
  for (const berth of report.coverage.berths) lines.push(`| ${markdownCell(berth.berth)} | ${berth.observations} | ${berth.classification} | ${markdownCell(berth.reason)} | ${markdownCell(berth.detail)} |`);
  lines.push('', '## Per-recording measures', '', '| Input | Step pairs / unmapped endpoints | Physical ids / renames | Incoming platform steps / reached | `****` drawn |', '| --- | ---: | ---: | ---: | ---: |');
  for (const { input, metrics } of entries) lines.push(`| ${markdownCell(input.path)} | ${metrics.stepSummary.mappedPairs} / ${metrics.stepSummary.unmeasuredEndpointEvents} | ${metrics.headcodeChurn.physicalIds} / ${metrics.headcodeChurn.renames} | ${metrics.platformStepSummary.total} / ${metrics.platformStepSummary.reachedCorrectTrack} | ${metrics.motion.starsDrawn} |`);
  lines.push('', 'Headcode churn counts sum independent recording-local physical ids; ids do not carry across recording files.', '',
    '## Platform assignment and arrivals', '', '| Berth | Platform N | Correct OSM target track | Reached samples | Wrong-track held samples |', '| --- | ---: | --- | ---: | ---: |');
  for (const platform of report.platforms) lines.push(`| ${platform.berth} | ${platform.platform} | ${platform.correctTargetTrack ? 'yes' : 'no'} | ${platform.reachedSamples} | ${platform.actuallyHeldWrongTrackSamples} |`);
  lines.push('', '## Step jumps', '', '| Input | From → to | Count | Median seconds | Graph metres | Implied m/s | Issues |', '| --- | --- | ---: | ---: | ---: | ---: | --- |');
  for (const jump of report.stepJumps) lines.push(`| ${markdownCell((jump as typeof report.stepJumps[number] & { recording: string }).recording)} | ${jump.from} → ${jump.to} | ${jump.count} | ${jump.seconds ?? '—'} | ${jump.lengthM ?? 'unmapped'} | ${jump.speedMps?.toFixed(1) ?? '—'} | ${markdownCell(jump.issues.join('; '))} |`);
  if (report.violations.length) lines.push('', '## Violations', '', ...report.violations.map((violation) => `- ${violation}`));
  lines.push('', 'Exact recording byte snapshots, anchors and graph are retained beneath `inputs/`; hashes and reproduction argv are in `replay-report.json`.', '', ...report.limitations.map((limitation) => limitation), '');
  return `${lines.join('\n')}\n`;
}

function hasIncompleteJsonPrefix(text: string): boolean {
  const stack: string[] = [];
  let inString = false, escape = false;
  for (const char of text) {
    if (inString) {
      if (escape) escape = false;
      else if (char === '\\') escape = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') stack.push(char);
    else if (char === '}' || char === ']') {
      const expected = char === '}' ? '{' : '[';
      if (stack.pop() !== expected) return false;
    }
  }
  return inString || escape || stack.length > 0;
}

/** Drop only a visibly incomplete, unterminated tail when the source grew during capture. */
export function completeRecordingPrefix(bytes: Buffer, sourceChangedDuringCapture: boolean): { bytes: Buffer; trailingBytesOmitted: number } {
  if (!sourceChangedDuringCapture) return { bytes, trailingBytesOmitted: 0 };
  const boundary = bytes.lastIndexOf(0x0a) + 1, tail = bytes.subarray(boundary).toString('utf8');
  if (!tail.trim()) return { bytes, trailingBytesOmitted: 0 };
  try { JSON.parse(tail); return { bytes, trailingBytesOmitted: 0 }; }
  catch {
    if (!hasIncompleteJsonPrefix(tail)) return { bytes, trailingBytesOmitted: 0 };
    return { bytes: bytes.subarray(0, boundary), trailingBytesOmitted: bytes.length - boundary };
  }
}

export async function runReplayReport(args: string[]) {
  const values = new Map<string, string>(), recordingPaths: string[] = [], schedulePaths: string[] = [];
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]!, v = args[i + 1];
    if (!['--recording', '--anchors', '--out', '--graph', '--smart', '--schedule'].includes(k) || !v || v.startsWith('--') || (!['--recording','--schedule'].includes(k) && values.has(k))) {
      throw new Error('usage: replay-report.ts --recording <ndjson> [--recording <ndjson> ...] --anchors <json> --out <.scratch/directory> [--graph <json>] [--smart <smart.json.gz>] [--schedule <date-cache.json> ...]');
    }
    if (k === '--recording') recordingPaths.push(v); else if (k === '--schedule') schedulePaths.push(v); else values.set(k, v);
  }
  if (!recordingPaths.length) throw new Error('missing --recording');
  for (const k of ['--anchors', '--out']) if (!values.has(k)) throw new Error(`missing ${k}`);
  const scratch = resolve(root, '.scratch'), out = resolve(values.get('--out')!);
  if (!inside(scratch, out)) throw new Error('--out must be beneath worktree .scratch');
  await mkdir(scratch, { recursive: true });
  const scratchReal = await realpath(scratch);
  let ancestor = out;
  for (;;) {
    try { const actual = await realpath(ancestor); if (actual !== scratchReal && !inside(scratchReal, actual)) throw new Error('output symlink escapes .scratch'); break; }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; ancestor = dirname(ancestor); }
  }
  await mkdir(out, { recursive: true });
  // Existing filenames can themselves be symlinks, independently of their parent directory.
  for (const name of ['replay-report.json', 'replay-report.md']) {
    try { if (!inside(scratchReal, await realpath(resolve(out, name)))) throw new Error('report symlink escapes .scratch'); }
    catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  }
  const anchorPath = resolve(values.get('--anchors')!), anchorBytes = await readFile(anchorPath);
  const anchors = JSON.parse(anchorBytes.toString('utf8')) as AnchorMap;
  if (!anchors || typeof anchors.area !== 'string' || !Array.isArray(anchors.anchors) || !Array.isArray(anchors.unmapped)) throw new Error('invalid anchor map');
  const graphPath = values.has('--graph') ? resolve(values.get('--graph')!) : fileURLToPath(new URL('../web/src/data/kx-track.json', import.meta.url));
  const graphBytes = await readFile(graphPath), data = JSON.parse(graphBytes.toString('utf8')) as KxData;
  const anchorFingerprint = await captureInput(out, scratchReal, 'anchors.json', anchorBytes, anchorPath);
  const graphFingerprint = await captureInput(out, scratchReal, 'graph.json', graphBytes, graphPath);
  let smartFingerprint: InputFingerprint | undefined;
  if (values.has('--smart')) {
    const smartPath = resolve(values.get('--smart')!), smartBytes = await readFile(smartPath);
    smartFingerprint = await captureInput(out, scratchReal, 'smart.json.gz', smartBytes, smartPath);
  }
  const schedules = new Map<string, {date: string; calls: ScheduleCall[]}>();
  const scheduleFingerprints: Array<InputFingerprint & {date: string}> = [];
  for (const scheduleSource of schedulePaths) {
    const path = resolve(scheduleSource), bytes = await readFile(path), doc = JSON.parse(bytes.toString('utf8'));
    if (!doc || !validDate(doc.date) || !Array.isArray(doc.calls) || doc.calls.some((call: ScheduleCall) => call.date !== doc.date || typeof call.headcode !== 'string' || typeof call.operator !== 'string' || typeof call.origin !== 'string' || typeof call.destination !== 'string' ||
      ![call.arrivalMs, call.departureMs].every(t => t === null || typeof t === 'number' && Number.isFinite(t)))) throw new Error(`invalid schedule cache: ${path}`);
    if (schedules.has(doc.date)) throw new Error(`duplicate schedule date: ${doc.date}`);
    schedules.set(doc.date, doc);
    scheduleFingerprints.push({...await captureInput(out, scratchReal, `schedule-${doc.date}.json`, bytes, path), date: doc.date});
  }
  const capturedRecordings: Array<{ input: RecordingInput; rows: ReturnType<typeof parseRecording> }> = [];
  for (let index = 0; index < recordingPaths.length; index++) {
    const sourcePath = resolve(recordingPaths[index]!);
    const bounded = await readBoundedRecording(sourcePath);
    const complete = completeRecordingPrefix(bounded.bytes, bounded.sourceChangedDuringCapture);
    const captured = { ...bounded, bytes: complete.bytes }, rows = parseRecording(captured.bytes.toString('utf8'));
    if (!rows.length) throw new Error(`recording is empty: ${sourcePath}`);
    const capturedPath = await captureInput(out, scratchReal, `recording-${String(index + 1).padStart(2, '0')}.ndjson`, captured.bytes, sourcePath);
    const input: RecordingInput = { path: sourcePath, capturedPath: capturedPath.capturedPath, sha256: capturedPath.sha256, capturedBytes: captured.bytes.length,
      sourceBytesAtOpen: captured.sourceBytesAtOpen, sourceBytesAtReadEnd: captured.sourceBytesAtReadEnd,
      sourceModifiedAtOpen: captured.sourceModifiedAtOpen, sourceModifiedAtReadEnd: captured.sourceModifiedAtReadEnd,
      sourceChangedDuringCapture: captured.sourceChangedDuringCapture, trailingBytesOmitted: complete.trailingBytesOmitted,
      capturedAt: new Date().toISOString(), events: rows.length,
      capturedBounds: { byteStart: 0, byteEndExclusive: captured.bytes.length, sourceByteEndExclusive: bounded.bytes.length,
        firstEventTimeMs: rows[0]!.t, lastEventTimeMs: rows.at(-1)!.t } };
    capturedRecordings.push({ input, rows });
  }
  const berthsOut = resolve(out, 'berths-reconciliation');
  let berthsReconciliation: Record<string, unknown> | undefined, effectiveAnchors = anchors;
  let effectiveAnchorFingerprint: InputFingerprint | undefined;
  if (smartFingerprint) {
    const berthsTool = fileURLToPath(new URL('./berths.ts', import.meta.url));
    const berthsArgs = [...capturedRecordings.flatMap(({ input }) => ['--recording', input.capturedPath]), '--smart', smartFingerprint.capturedPath,
      '--previous', anchorFingerprint.capturedPath, '--preserve-positions', '--graph', graphFingerprint.capturedPath, '--out', berthsOut];
    const child = spawnSync(process.execPath, [berthsTool, ...berthsArgs], { cwd: root, encoding: 'utf8', timeout: 600_000,
      maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    const readArtifact = async (name: string) => {
      const path = resolve(berthsOut, name);
      try { const bytes = await readFile(path); return { path, sha256: sha256(bytes), bytes: bytes.length }; }
      catch { return null; }
    };
    const artifacts = {
      report: await readArtifact('berths-report.json'), positionDiff: await readArtifact('drawn-position-diff.json'),
      candidateAnchors: await readArtifact('anchors-candidate.json'), preservedAnchors: await readArtifact('anchors.json'),
    };
    let details: Record<string, unknown> = {};
    if (artifacts.report) {
      try { details = JSON.parse(await readFile(artifacts.report.path, 'utf8')) as Record<string, unknown>; } catch { /* artifact path remains available */ }
    }
    const status = child.error ? 'ERROR' : child.status === 0 && artifacts.report && artifacts.positionDiff && artifacts.candidateAnchors && artifacts.preservedAnchors ? 'COMPLETE' : 'ERROR';
    const summaryDetails = details.summary && typeof details.summary === 'object' && !Array.isArray(details.summary)
      ? details.summary as Record<string, unknown> : {};
    berthsReconciliation = { status, mode: 'preserve-positions', summary: details.summary ?? null,
      candidatePlacement: details.candidatePlacement ?? summaryDetails.candidatePlacement ?? null, artifacts,
      command: { cwd: root, command: process.execPath, executable: process.execPath, args: [berthsTool, ...berthsArgs] },
      ...(status === 'ERROR' ? { error: child.error?.message ?? child.stderr?.trim() ?? `berths.ts exited ${child.status}` } : {}) };
    if (status === 'COMPLETE' && artifacts.preservedAnchors) {
      try {
        const bytes = await readFile(artifacts.preservedAnchors.path), parsed = JSON.parse(bytes.toString('utf8')) as AnchorMap;
        if (parsed && typeof parsed.area === 'string' && Array.isArray(parsed.anchors) && Array.isArray(parsed.unmapped)) {
          effectiveAnchors = parsed;
          effectiveAnchorFingerprint = { path: artifacts.preservedAnchors.path, capturedPath: artifacts.preservedAnchors.path,
            bytes: bytes.length, sha256: sha256(bytes) };
        } else throw new Error('preserved anchor output is invalid');
      } catch (error) {
        berthsReconciliation.status = 'ERROR';
        berthsReconciliation.error = error instanceof Error ? error.message : String(error);
      }
    }
  }
  const entries: ReplayEntry[] = capturedRecordings.map(({ input, rows }) => ({ input, metrics: replayReport(data, rows, effectiveAnchors, {schedule: schedules.get(ukDate(rows[0]!.t))}) }));
  const union = combineReplayReports(entries), unionInventory = { seen: union.coverage.seen, anchored: union.coverage.anchored,
    unmapped: union.coverage.unmapped, berths: union.coverage.berths };
  const rerunOut = resolve(scratch, `${out.split(/[\\/]/).at(-1) ?? 'replay-report'}-reproduced-${process.pid}`);
  const reproduceArgs = [fileURLToPath(import.meta.url), ...entries.flatMap(({ input }) => ['--recording', input.capturedPath]),
    '--anchors', anchorFingerprint.capturedPath, '--graph', graphFingerprint.capturedPath, '--out', rerunOut];
  if (smartFingerprint) reproduceArgs.push('--smart', smartFingerprint.capturedPath);
  for (const schedule of scheduleFingerprints) reproduceArgs.push('--schedule', schedule.capturedPath);
  const reproducibility = { inputHashes: { recordings: entries.map(({ input }) => input), anchors: anchorFingerprint,
      ...(effectiveAnchorFingerprint ? { effectiveAnchors: effectiveAnchorFingerprint } : {}), graph: graphFingerprint,
      ...(smartFingerprint ? { smart: smartFingerprint } : {}), ...(scheduleFingerprints.length ? { schedules: scheduleFingerprints } : {}) },
    command: { cwd: root, command: process.execPath, executable: process.execPath, args: reproduceArgs } };
  const report = (entries.length === 1
    ? { ...entries[0]!.metrics, recordingInput: entries[0]!.input, coverage: union.coverage }
    : { ...union, recordings: entries }) as ReplayOutput;
  report.unionInventory = unionInventory;
  report.reproducibility = reproducibility;
  if (berthsReconciliation) {
    report.berthsReconciliation = berthsReconciliation;
    if (berthsReconciliation.status === 'ERROR') {
      report.ok = false;
      report.violations.push(`position-preserving berth reconciliation failed: ${String(berthsReconciliation.error)}`);
    }
  }
  const md = replayMarkdown(report) + '\n' + report.timetable.note + '\n\n' + incomingMarkdown(report);
  await writeFile(resolve(out, 'replay-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'replay-report.md'), md);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReplayReport(process.argv.slice(2)).then((r) => { console.log(JSON.stringify({ ok: r.ok, seen: r.coverage.seen, violations: r.violations.length })); process.exitCode = r.ok ? 0 : 1; })
    .catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
}
