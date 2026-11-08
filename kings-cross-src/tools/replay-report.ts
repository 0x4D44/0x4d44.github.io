// Offline evidence only: recordings and all derived reports stay in worktree .scratch.
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOT_A_TRAIN } from '../core/anchors.ts';
import type { AnchorMap, BerthAnchor } from '../core/anchors.ts';
import { analyseSteps, buildAnchors } from '../core/berths.ts';
import { buildGraph } from '../core/graph.ts';
import type { Edge, Graph } from '../core/graph.ts';
import { createMotion, DEFAULT_BUFFER_CLEARANCE_M, overlapM } from '../core/motion.ts';
import type { TrainView } from '../core/motion.ts';
import type { KxData } from '../core/osm.ts';
import { trainLayout } from '../core/train.ts';
import { createTimeline, parseRecording } from '../web/src/feed.ts';
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

export function replayReport(data: KxData, rows: readonly RecordedEvent[], anchors: AnchorMap) {
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
  const motion = createMotion(graph, anchors, { estimatedMotion: true,
    lengthM: (d) => trainLayout(d[0] === '1' ? 'lner9' : 'lner5').length,
    wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
  const start = rows[0]!.t, end = rows.at(-1)!.t + 6000, dt = 0.1;
  const timeline = createTimeline(motion, start);
  type PlatformStep = { eventIndex: number; atMs: number; from?: string; to: string; description: string; physicalId?: number;
    reachedAtMs?: number; blocked: boolean; queued: boolean; routeRefused: boolean; lastSeenState?: string; resolution?: string };
  const platformSteps: PlatformStep[] = [];
  const renameCounts = new Map<number, number>();
  let diagnosticCursor = 0, unattributedRenames = 0;
  const captureRenames = (): void => {
    const issues = motion.diagnostics(), trains = motion.trains();
    for (const issue of issues.slice(diagnosticCursor)) if (issue.kind === 'renamed') {
      const t = trains.find((t) => t.description === issue.description);
      if (t) {
        renameCounts.set(t.id, (renameCounts.get(t.id) ?? 0) + 1);
        if (!physical.has(t.id)) physical.set(t.id, new Set());
        if (issue.previousDescription) physical.get(t.id)!.add(issue.previousDescription);
        physical.get(t.id)!.add(issue.description);
      } else unattributedRenames++;
    }
    diagnosticCursor = issues.length;
  };
  const observePlatformSteps = (trains: TrainView[], atMs: number): void => {
    for (const step of platformSteps) {
      if (step.reachedAtMs !== undefined) continue;
      const t = step.physicalId === undefined ? trains.find((t) => t.description === step.description) : trains.find((t) => t.id === step.physicalId);
      if (!t) continue;
      step.physicalId = t.id; step.blocked = t.blocked; step.lastSeenState = t.state;
      if (t.speed === 0 && bodyAtStop(t, expectedStops.get(step.to))) step.reachedAtMs = atMs;
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
      timeline.deliver(row.e, row.t);
      captureRenames();
      if (row.e.area === anchors.area && row.e.kind === 'step' && row.e.descr !== NOT_A_TRAIN && /^10(?:0\d|10)$/.test(row.e.to ?? '')) {
        const emitted = motion.diagnostics().slice(beforeIssues);
        platformSteps.push({ eventIndex: cursor - 1, atMs: row.t, from: row.e.from, to: row.e.to!, description: row.e.descr!,
          blocked: false, queued: emitted.some((i) => i.kind === 'queued'), routeRefused: emitted.some((i) => i.kind === 'unroutable') });
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
  for (const step of platformSteps) step.resolution = step.reachedAtMs !== undefined ? 'reached-correct-track' :
    step.routeRefused ? 'route-refused' : step.blocked ? 'blocked' : step.physicalId !== undefined ? 'pending' : step.queued ? 'queued' : 'no-body';
  const platformStepSummary = { total: platformSteps.length, reachedCorrectTrack: platformSteps.filter((s) => s.resolution === 'reached-correct-track').length,
    unresolved: platformSteps.filter((s) => s.resolution !== 'reached-correct-track').length,
    outcomes: Object.fromEntries(['reached-correct-track', 'blocked', 'pending', 'queued', 'route-refused', 'no-body'].map((state) => [state, platformSteps.filter((s) => s.resolution === state).length])) };
  const median = (ns: number[]) => { const a = [...ns].sort((a, b) => a - b), i = Math.floor(a.length / 2); return a.length ? a.length % 2 ? a[i]! : (a[i - 1]! + a[i]!) / 2 : 0; };
  const byPhysicalId = [...physical].map(([id, descriptions]) => ({ id, descriptions: [...descriptions], descriptionsCount: descriptions.size, renameCount: renameCounts.get(id) ?? 0 }));
  return { ok: violations.length === 0, violations, events: rows.length, area: anchors.area, samples, stepSeconds: dt,
    durationSeconds: (rows.at(-1)!.t - start) / 1000, drainSeconds: 6,
    coverage: { seen: coverage.inventory.length, anchored: coverage.inventory.filter((i) => i.classification === 'anchored').length,
      unmapped: coverage.inventory.filter((i) => i.classification === 'unmapped').length, placeholderObservations: coverage.placeholders, berths: coverage.inventory },
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
      'Per-step identities use visible descriptions, then retain the physical id through renames. Deferred names may resolve only when applied; no visible identity is reported as no-body or queued, not a successful arrival.',
      'Platform samples describe visible bodies targeting canonical platform berths; queued observations are not drawn and only aggregate queue size is exposed by motion.',
      'Step implied-speed flags describe TD residence and coarse anchors, not drawn physical speed. Unmapped endpoint pairs have no graph-distance claim.',
      'OSM platform track assignment is regenerated from platform polygons and terminal ordering; this is a geometry check, not an independent survey.',
      'This report does not establish live/replay equivalence; use the separate live-vs-replay audit.'] };
}

const root = fileURLToPath(new URL('../../', import.meta.url));
const inside = (a: string, b: string) => { const r = relative(a, b); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
export async function runReplayReport(args: string[]) {
  const values = new Map<string, string>();
  for (let i = 0; i < args.length; i += 2) {
    const k = args[i]!, v = args[i + 1];
    if (!['--recording', '--anchors', '--out', '--graph'].includes(k) || !v || v.startsWith('--') || values.has(k)) throw new Error('usage: replay-report.ts --recording <ndjson> --anchors <json> --out <.scratch/directory> [--graph <json>]');
    values.set(k, v);
  }
  for (const k of ['--recording', '--anchors', '--out']) if (!values.has(k)) throw new Error(`missing ${k}`);
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
  const anchors = JSON.parse(await readFile(resolve(values.get('--anchors')!), 'utf8')) as AnchorMap;
  if (!anchors || typeof anchors.area !== 'string' || !Array.isArray(anchors.anchors) || !Array.isArray(anchors.unmapped)) throw new Error('invalid anchor map');
  const data = JSON.parse(await readFile(values.has('--graph') ? resolve(values.get('--graph')!) : new URL('../web/src/data/kx-track.json', import.meta.url), 'utf8')) as KxData;
  const report = replayReport(data, parseRecording(await readFile(resolve(values.get('--recording')!), 'utf8')), anchors);
  const md = `# Replay evidence report\n\n${report.ok ? 'PASS' : 'FAIL'}: ${report.coverage.seen} seen berths; ${report.coverage.anchored} anchored, ${report.coverage.unmapped} unmapped. ${report.events} events, ${report.durationSeconds} seconds.\n\n${report.violations.map((v) => `- ${v}`).join('\n')}\n\n${report.headcodeChurn.physicalIds} physical ids; ${report.headcodeChurn.renames} renames; ${report.headcodeChurn.idsWithMultipleDescriptions} ids with multiple descriptions.\n\nDrawn train-seconds: ${report.drawnTime.anchoredTrainSeconds.toFixed(1)} anchored, ${report.drawnTime.estimatedTrainSeconds.toFixed(1)} estimated; ${report.drawnTime.fadingTrainSeconds.toFixed(1)} fading (also included).\n\n${report.platformStepSummary.total} incoming platform steps: ${report.platformStepSummary.reachedCorrectTrack} reached the correct track, ${report.platformStepSummary.unresolved} unresolved. Outcomes: ${JSON.stringify(report.platformStepSummary.outcomes)}.\n\n${report.motion.unroutable} unroutable motion diagnostics; peak queued ${report.motion.peakQueued}. These are limitations, not wrong-track arrivals.\n\n${report.stepSummary.physicalStepEvents} physical step events; ${report.stepSummary.unmeasuredEndpointEvents} have an unmapped endpoint. ${report.stepSummary.mappedPairs} mapped step pairs; ${report.stepSummary.disconnectedPairs} disconnected; ${report.stepSummary.impliedSpeedFlagPairs} implied-speed flags.\n\n${report.limitations.join('\n\n')}\n\n${report.drawnTime.basis}\n\nFull berth inventory, platform arrival states, step paths and physical-id descriptions are in replay-report.json.\n`;
  await writeFile(resolve(out, 'replay-report.json'), JSON.stringify(report, null, 2) + '\n');
  await writeFile(resolve(out, 'replay-report.md'), md);
  return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runReplayReport(process.argv.slice(2)).then((r) => { console.log(JSON.stringify({ ok: r.ok, seen: r.coverage.seen, violations: r.violations.length })); process.exitCode = r.ok ? 0 : 1; })
    .catch((e: Error) => { console.error(e.message); process.exitCode = 1; });
}
