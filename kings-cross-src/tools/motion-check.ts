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
const motion = createMotion(graph, anchors, { wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])) });
const dt = 0.1, start = recording[0]!.at, end = recording.at(-1)!.at;
let cursor = 0, ticks = 0, maxJump = 0, maxSpeed = 0, maxAccel = 0, maxDecel = 0;
let interposeFailures = 0;
let maxPointJump = 0, pointOverspeed = 0, pointBackward = 0;
let overlapTicks = 0, maxOverlap = 0, maxTrains = 0, maxQueued = 0, unexplainedDisappearances = 0, cabChanges = 0;
let previous = new Map<string, TrainView>();
const observed = new Set<string>();
// --speed is the renderer's playback rate. The audit is unpaced and always uses 0.1 s
// of simulation time; changing replay rate must not change train physics or results.
for (let time = 0; time <= (end - start) / 1000 + 6 + 1e-7; time = ++ticks * dt) {
  while (cursor < recording.length && recording[cursor]!.at <= start + time * 1000 + 1e-4) {
    const event = recording[cursor]!.event;
    const before = event.kind === 'interpose' ? motion.diagnostics().length : 0;
    motion.apply(event, start + time * 1000);
    if (event.kind === 'interpose') interposeFailures += motion.diagnostics().slice(before).filter((i) => i.kind === 'unroutable').length;
    cursor++;
  }
  motion.advance(dt);
  const trains = motion.trains();
  const current = new Map(trains.map((t) => [t.description, t]));
  maxTrains = Math.max(maxTrains, trains.length); maxQueued = Math.max(maxQueued, motion.queuedCount());
  for (const t of trains) {
    observed.add(t.description); maxSpeed = Math.max(maxSpeed, t.speed);
    const old = previous.get(t.description);
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
      if (along < -0.05) pointBackward++;
    }
    maxAccel = Math.max(maxAccel, (t.speed - old.speed) / dt);
    maxDecel = Math.max(maxDecel, (old.speed - t.speed) / dt);
    cabChanges += t.reversals - old.reversals;
  }
  for (const old of previous.values()) if (!current.has(old.description) && old.state !== 'fading') unexplainedDisappearances++;
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
const unroutable = issues.filter((i) => i.kind === 'unroutable');
const reversalsOutsidePlatform = issues.filter((i) => i.kind === 'reversal' && !anchors.anchors.some((a) => a.berth === i.berth && a.platform !== undefined));
const vanished = issues.filter((i) => i.kind === 'vanished');
const report = {
  anchorSources: anchors.sources, anchorCount: anchors.anchors.length, unmappedCount: anchors.unmapped.length,
  events: recording.length, durationSeconds: (end - start) / 1000, stepSeconds: dt, playbackSpeed: speed,
  ticks, trainsObserved: observed.size, peakTrains: maxTrains, peakQueued: maxQueued,
  maxPerTickJumpM: maxJump, maxPointJumpM: maxPointJump, pointOverspeedTicks: pointOverspeed, pointBackwardTicks: pointBackward, maxSpeedMps: maxSpeed, maxSpeedKmh: maxSpeed * 3.6,
  maxAccelerationMps2: maxAccel, maxDecelerationMps2: maxDecel,
  overlapTicks, maxOverlapM: maxOverlap, cabChanges, reversalsOutsidePlatform: reversalsOutsidePlatform.length,
  stepsCouldNotRoute: unroutable.length - interposeFailures, interposesCouldNotPlace: interposeFailures,
  trainsVanishedAfterFade: vanished.length, unexplainedDisappearances,
  remainingTrains: motion.trains().length, remainingQueued: motion.queuedCount(),
  routingIssues: unroutable, invalidReversals: reversalsOutsidePlatform, vanishedTrains: vanished,
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

Body movement uses travelled distance: a stationary platform cab change moves the *leading-end label* to the other end without moving the train. Collision checks compare occupied graph intervals, including coaches across junctions. New overlapping observations are queued rather than drawn. Unroutable steps include first sightings without mapped origins, and individual reasons are in the JSON report. Completed fades include cancels and 20-minute quiet timeouts.

Assumptions: default 260 m trains (pass lengthM: 130 for short consists), acceleration 0.7 m/s², service braking 0.6 m/s², 40 km/h on untagged ways, at most 25 km/h inside KINGS_CROSS and over the last 400 m of a platform approach, and 5 m separation. OSM maxspeed is supplied by way id. Unmapped destinations retain the last authority. Targets behind the train or inside its service braking distance are refused. First sightings may have a clipped body at the network boundary. There is no signalling/interlocking model; graph routing and train occupancy determine movement authority. Cancelled trains remain solid during their five-second fade.

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
console.log(JSON.stringify({ ...report, anchorSources: undefined, routingIssues: undefined, invalidReversals: undefined, vanishedTrains: undefined }, null, 2));
