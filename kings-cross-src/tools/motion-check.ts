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
  return { at, event: row.e, index };
}).sort((a, b) => a.at - b.at || a.index - b.index);
if (!recording.length) throw new Error('recording is empty');
const lengths = { long: trainLayout('lner9').length, short: trainLayout('lner5').length };
const motion = createMotion(graph, anchors, { lengthM: (d) => d[0] === '1' ? lengths.long : lengths.short, wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
const dt = 0.1, start = recording[0]!.at, end = recording.at(-1)!.at;
let cursor = 0, ticks = 0, maxJump = 0, maxSpeed = 0, maxAccel = 0, maxDecel = 0;
let interposeFailures = 0;
let maxPointJump = 0, pointOverspeed = 0, pointBackward = 0;
const backwardExamples: unknown[] = [];
const doubleHeldExamples: unknown[] = [];
let overlapTicks = 0, maxOverlap = 0, maxTrains = 0, maxQueued = 0, unexplainedDisappearances = 0, cabChanges = 0;
let previous = new Map<string | number, TrainView>();
const observed = new Set<string>();
const anchorByBerth = new Map(anchors.anchors.map((a) => [a.berth, a]));
const platformStops = anchors.anchors.filter((a) => a.platform !== undefined).flatMap((a) => {
  const edge = graph.edges.find((e) => e.a === a.from && e.b === a.to || e.a === a.to && e.b === a.from);
  return edge ? [{ edge, t: edge.a === a.from ? a.t : 1 - a.t }] : [];
});
// AnchorMap supplies stops, not platform polygons. A held train occupies a platform
// when its body includes a platform stop (also true after a stationary cab change).
const holdsAtPlatform = (t: TrainView): boolean => platformStops.some((p) =>
  t.leading.edge === p.edge && Math.abs(t.leading.t - p.t) * p.edge.length < 0.05 ||
  t.occupied.some((s) => s.edge === p.edge && p.t >= Math.min(s.fromT, s.toT) - 1e-8 && p.t <= Math.max(s.fromT, s.toT) + 1e-8));
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
    const views = motion.trains();
    if (event.area === anchors.area && event.descr && event.descr !== '****') {
      if ((event.kind === 'interpose' || event.kind === 'step') && event.to) {
        const oldName = berthOwner.get(event.to);
        const at = anchorByBerth.get(event.to);
        const standing = views.find((t) => t.description !== event.descr && t.lastBerth === event.to && t.speed === 0 && t.state === 'held' && at && Math.hypot(t.leading.point[0] - at.point[0], t.leading.point[1] - at.point[1]) < 0.05);
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
    motion.apply(event, start + time * 1000);
    consumeIssues({ event, index: cursor });
    cursor++;
  }
  motion.advance(dt);
  consumeIssues();
  const trains = motion.trains();
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
      a.state === 'held' && b.state === 'held') {
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
  let tickOverlap = false;
  for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) {
    const overlap = overlapM(trains[i]!.occupied, trains[j]!.occupied);
    maxOverlap = Math.max(maxOverlap, overlap);
    if (overlap > 1e-6) tickOverlap = true;
  }
  if (tickOverlap) overlapTicks++;
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
const report = {
  anchorSources: anchors.sources, anchorCount: anchors.anchors.length, unmappedCount: anchors.unmapped.length,
  events: recording.length, durationSeconds: (end - start) / 1000, stepSeconds: dt, playbackSpeed: speed,
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
  backwardExamples, doubleHeldExamples,
};
const f = (n: number): string => n.toFixed(6);
const markdown = `# Motion replay report

${anchors.anchors.length} anchors; ${recording.length} events over ${f(report.durationSeconds)} s; ${ticks} fixed 0.1 s ticks.

| Measure | Observed |
| --- | ---: |
| Trains observed / peak visible / peak queued | ${observed.size} / ${maxTrains} / ${maxQueued} |
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

Top inside-network unroutable pairs: ${topInsidePairs.map((p) => `${p.pair} (${p.count})`).join('; ') || 'none'}.

Long holds: ${[...longHolds.values()].map((h) => `${h.description} at ${h.berth}, target ${h.target}, ${h.seconds.toFixed(1)} s, blocked=${h.blocked}; companions: ${h.companions.map((c) => `${c.description} in ${c.berth}`).join(', ') || 'none'}. ${h.explanation}`).join('; ') || 'none'}.

Wire replacements count a new description replacing the recorded owner of a mapped berth. Standing candidates additionally require the previous body stopped at that exact anchor. Applied renames include deferred renames after an animated arrival. Independently born observations joined by a later same-berth placement retain the standing body; the extra observation fades at its existing position. Separate partner-berth placements can represent two physical trains. Held partner-berth pairs counts distinct pairs of modelled bodies simultaneously held in different partner berths, including a rear train stopped short by occupancy; TD alone cannot establish rolling-stock identity. Coexisting descriptions alone do not prove a second physical train. Partner berths remain separate. Outside-network failures require both ends explicitly classified outside-network; unknown endpoints count as inside/uncertain. Long holds include blocked departing trains with zero speed. AnchorMap has no platform polygons: platform occupancy means the leading point or occupied body includes any mapped platform stop; a platform target alone does not exempt a train stopped in the throat. Failed steps are distinct input events, including failures deferred until arrival; a step producing several diagnostics counts once. Unattributed routing diagnostics: ${unattributedRoutingIssues}. Inside/uncertain routing reasons: ${JSON.stringify(Object.fromEntries(insideRoutingReasons))}.

Body movement uses travelled distance: a stationary platform cab change moves the *leading-end label* to the other end without moving the train. Collision checks compare occupied graph intervals, including coaches across junctions. New overlapping observations are queued rather than drawn. Unroutable steps include first sightings without mapped origins, and individual reasons are in the JSON report. Completed fades include cancels and 20-minute quiet timeouts.

Assumptions: the page's real layouts (${lengths.long} m for headcodes starting 1, ${lengths.short} m otherwise), acceleration 0.7 m/s², service braking 0.6 m/s², 40 km/h on untagged ways, at most 25 km/h inside KINGS_CROSS and over the last 400 m of a platform approach, and 5 m separation. OSM maxspeed is supplied by way id. Unmapped departures without a known anchored successor follow historical junction turns where available, otherwise the straightest forward continuation to an external graph leaf, then fade. Platform buffers are excluded as external leaves. Only the same description's chain (or explicit caller-supplied chains without descriptions) supplies successor authority; ambiguous successors wait for an actual mapped step. Outside arrivals enter from an external boundary once their next anchor is known. Targets behind the train or inside its service braking distance are refused. First sightings may have a clipped body at the network boundary. There is no signalling/interlocking model; graph routing and train occupancy determine movement authority. Cancelled trains remain solid during their five-second fade.

Playback speed ${speed} is metadata for an unpaced audit; fixed simulation steps keep physics identical at every playback rate. Events are applied at the next tick (at most 0.1 s late). The audit drains six seconds past the final event so final cancels can fade.

Anchor sources: ${anchors.sources.map((s) => JSON.stringify(s)).join(', ')}. A hand-made anchor map only validates those anchors, not the real berth geography.

When the anchor worker writes .scratch/<run>/anchors.json, run from the repository root:

\`\`\`sh
node kings-cross-src/tools/motion-check.ts --anchors .scratch/<run>/anchors.json --recording /Users/md/kx-data/recordings/td-Y9-20261107.ndjson --speed 1 --out .scratch/motion-real
\`\`\`
`;
await mkdir(out, { recursive: true });
await writeFile(resolve(out, 'motion-report.json'), JSON.stringify(report, null, 2) + '\n');
await writeFile(resolve(out, 'motion-report.md'), markdown);
console.log(JSON.stringify({ ...report, anchorSources: undefined, routingIssues: undefined, invalidReversals: undefined, vanishedTrains: undefined, backwardExamples: undefined, doubleHeldExamples: undefined }, null, 2));
