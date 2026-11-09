// Offline motion audit. Recordings and reports belong under the worktree's .scratch.
// node kings-cross-src/tools/motion-audit.ts --anchors .scratch/.../anchors.json \
//   --recording .scratch/.../td.ndjson --out .scratch/motion-audit \
//   [--motion-module .scratch/.../motion.ts] [--data path/to/kx-track.json]
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { buildGraph } from '../core/graph.ts';
import { createMotion, maxspeedMps, overlapM } from '../core/motion.ts';
import type { MotionEvent, MotionOptions, TrainView } from '../core/motion.ts';
import type { AnchorMap, BerthAnchor } from '../core/anchors.ts';
import type { Edge, Graph } from '../core/graph.ts';
import type { KxData, Platform } from '../core/osm.ts';
import { trainLayout } from '../core/train.ts';
import { platformDrawingOutline, stationPlatforms } from '../core/station.ts';
import { tunnelMouths } from '../core/landmarks.ts';
import { matchService } from '../core/schedule.ts';
import type { ScheduleCall } from '../core/schedule.ts';
import { KINGS_CROSS, inZone } from '../core/zones.ts';
import { createEventReconciler, parseEvent, ukDate } from '../web/src/feed.ts';
import type { RecordedEvent } from '../web/src/feed.ts';
import { createTrainKinds } from '../web/src/trains-live.ts';

export interface MotionAuditOptions {
  /** An alternate policy module's createMotion export (e.g. a frozen baseline). */
  createMotion?: MotionFactory;
  onSample?: (sample: MotionAuditSample) => void;
  lengthM?: MotionOptions['lengthM'];
  lengthPolicy?: string;
  dtSeconds?: number;
  maxAccelerationMps2?: number;
  maxDecelerationMps2?: number;
  maxHeldOutsideAnchorSeconds?: number;
  minimumBufferClearanceM?: number;
  platformEndToleranceM?: number;
  maxProfileSamplesPerTrain?: number;
}

export interface MotionAuditSample {
  atMs: number;
  train: TrainView;
  zone: 'platform' | 'throat' | 'approach';
  speedLimitMps: number;
  accelerationMps2: number;
  decelerationMps2: number;
  heldPlatform?: string;
}

export interface MotionAuditMotion {
  apply(event: MotionEvent, nowMs: number): void;
  advance(seconds: number): void;
  trains(): TrainView[];
}
export type MotionFactory = (graph: Graph, anchors: AnchorMap, options?: MotionOptions) => MotionAuditMotion;

const DEFAULTS = {
  dtSeconds: 0.1,
  accelerationMps2: 0.7,
  decelerationMps2: 0.7,
  heldSeconds: 120,
  bufferClearanceM: 3,
  platformEndToleranceM: 2,
  profileSamplesPerTrain: 3600,
  profileEverySeconds: 1,
  speedToleranceMps: 0.05,
  pointToleranceM: 0.05,
  teleportToleranceM: 0.5,
  platformGeometryMarginM: 5,
} as const;

type ZoneName = 'platform' | 'throat' | 'approach';
interface LocatedAnchor { anchor: BerthAnchor; edge: Edge; t: number; point: [number, number] }
interface PlatformShape { platform: Platform; minX: number; maxX: number; minZ: number; maxZ: number; axis: [number, number]; minAlong: number; maxAlong: number }
interface MetricCounts {
  ticks: number;
  maxSpeedMps: number;
  maxAccelerationMps2: number;
  maxDecelerationMps2: number;
  maxPointJumpM: number;
  pointOverspeedTicks: number;
  teleportTicks: number;
  distanceUnderSpeedTicks: number;
  backwardTicks: number;
  sameTrackOverlapTicks: number;
  maxSameTrackOverlapM: number;
  speedLimitViolationTicks: number;
  accelerationViolationTicks: number;
  decelerationViolationTicks: number;
  heldOutsideAnchorViolations: number;
  platformBufferClearanceViolations: number;
  platformBodyContainmentViolations: number;
  stationaryCabReversals: number;
  reversalsOutsidePlatform: number;
}
interface TrainProfile {
  id: number;
  description: string;
  lengthM: number;
  firstSeenSeconds: number;
  lastSeenSeconds: number;
  maxSpeedMps: number;
  maxAccelerationMps2: number;
  maxDecelerationMps2: number;
  maxPointJumpM: number;
  pointOverspeedTicks: number;
  teleportTicks: number;
  distanceUnderSpeedTicks: number;
  backwardTicks: number;
  accelerationViolationTicks: number;
  decelerationViolationTicks: number;
  speedLimitViolationTicks: number;
  maxSameTrackOverlapM: number;
  maxHeldOutsideAnchorsSeconds: number;
  platformStops: PlatformStopAudit[];
  profile: { seconds: number; speedMps: number; accelerationMps2: number; decelerationMps2: number; zone: ZoneName; state: TrainView['state']; targetBerth: string }[];
  profileTruncated: boolean;
}
interface PlatformStopAudit {
  targetBerth: string;
  platform: string;
  minimumBufferClearanceM?: number;
  maximumBodyOutsidePlatformM?: number;
  heldSamples: number;
  bufferClearanceViolation: boolean;
  bodyContainmentViolation: boolean;
}
interface Violation {
  kind: string;
  trainId?: number;
  description?: string;
  seconds?: number;
  details: Record<string, unknown>;
}

const pointOn = (graph: Graph, edge: Edge, t: number): [number, number] => {
  const a = graph.pos.get(edge.a)!, b = graph.pos.get(edge.b)!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
};
const locateAnchor = (graph: Graph, anchor: BerthAnchor): LocatedAnchor | undefined => {
  const edge = graph.edges.find((e) => e.a === anchor.from && e.b === anchor.to || e.a === anchor.to && e.b === anchor.from);
  if (!edge || !Number.isFinite(anchor.t) || anchor.t < 0 || anchor.t > 1) return undefined;
  const t = edge.a === anchor.from ? anchor.t : 1 - anchor.t;
  return { anchor, edge, t, point: pointOn(graph, edge, t) };
};
const pointSegmentDistance = (p: [number, number], a: [number, number], b: [number, number]): number => {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dz);
};
const inPolygon = (p: [number, number], pts: readonly [number, number][]): boolean => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!, b = pts[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const polygonDistance = (p: [number, number], pts: readonly [number, number][]): number => {
  if (pts.length < 3) return Infinity;
  if (inPolygon(p, pts)) return 0;
  let distance = Infinity;
  for (let i = 0; i < pts.length; i++) distance = Math.min(distance, pointSegmentDistance(p, pts[i]!, pts[(i + 1) % pts.length]!));
  return distance;
};
const projectAlong = (p: [number, number], axis: [number, number]): number => p[0] * axis[0] + p[1] * axis[1];
const convexHull = (points: readonly [number, number][]): [number, number][] => {
  const sorted = [...new Map(points.map((p) => [`${p[0]}:${p[1]}`, p])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (sorted.length < 3) return sorted;
  const cross = (o: [number, number], a: [number, number], b: [number, number]): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: [number, number][] = [], upper: [number, number][] = [];
  for (const p of sorted) { while (lower.length >= 2 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...sorted].reverse()) { while (upper.length >= 2 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop(); upper.push(p); }
  lower.pop(); upper.pop(); return [...lower, ...upper];
};
const platformShape = (platform: Platform): PlatformShape | undefined => {
  if (platform.pts.length < 3) return undefined;
  const pts = platform.pts as [number, number][];
  let meanX = 0, meanZ = 0;
  for (const p of pts) { meanX += p[0]; meanZ += p[1]; }
  meanX /= pts.length; meanZ /= pts.length;
  let xx = 0, zz = 0, xz = 0;
  for (const p of pts) { const x = p[0] - meanX, z = p[1] - meanZ; xx += x * x; zz += z * z; xz += x * z; }
  const theta = 0.5 * Math.atan2(2 * xz, xx - zz), axis: [number, number] = [Math.cos(theta), Math.sin(theta)];
  const along = pts.map((p) => projectAlong(p, axis));
  return { platform, minX: Math.min(...pts.map((p) => p[0])), maxX: Math.max(...pts.map((p) => p[0])),
    minZ: Math.min(...pts.map((p) => p[1])), maxZ: Math.max(...pts.map((p) => p[1])), axis,
    minAlong: Math.min(...along), maxAlong: Math.max(...along) };
};
const edgeIntersectsZone = (graph: Graph, edge: Edge, fromT: number, toT: number): boolean => {
  const a = pointOn(graph, edge, fromT), b = pointOn(graph, edge, toT);
  // Liang-Barsky clip against the station's axis-aligned rectangle.
  const dx = b[0] - a[0], dz = b[1] - a[1];
  let lo = 0, hi = 1;
  for (const [p, q] of [[-dx, a[0] - KINGS_CROSS.minX], [dx, KINGS_CROSS.maxX - a[0]], [-dz, a[1] - KINGS_CROSS.minZ], [dz, KINGS_CROSS.maxZ - a[1]]] as const) {
    if (Math.abs(p) < 1e-12) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) lo = Math.max(lo, r); else hi = Math.min(hi, r);
    if (lo > hi) return false;
  }
  return true;
};
const occupiedPoints = (graph: Graph, train: TrainView): [number, number][] => train.occupied.flatMap((s) => {
  const length = Math.abs(s.toT - s.fromT) * s.edge.length, count = Math.max(1, Math.ceil(length / 5));
  return Array.from({ length: count + 1 }, (_, i) => pointOn(graph, s.edge, s.fromT + (s.toT - s.fromT) * i / count));
});
const trainTouchesPlatform = (graph: Graph, train: TrainView, shapes: readonly PlatformShape[], platformAnchors: readonly LocatedAnchor[], margin: number): boolean => {
  if (platformAnchors.some((a) => train.occupied.some((s) => s.edge === a.edge && a.t >= Math.min(s.fromT, s.toT) - 1e-7 && a.t <= Math.max(s.fromT, s.toT) + 1e-7))) return true;
  return occupiedPoints(graph, train).some((p) => shapes.some((s) => p[0] >= s.minX - margin && p[0] <= s.maxX + margin && p[1] >= s.minZ - margin && p[1] <= s.maxZ + margin && polygonDistance(p, s.platform.pts as [number, number][]) <= margin));
};
const nearAnchor = (train: TrainView, anchors: readonly LocatedAnchor[]): boolean => anchors.some((a) =>
  Math.hypot(train.leading.point[0] - a.point[0], train.leading.point[1] - a.point[1]) <= Math.max(5, a.anchor.errorM) ||
  train.occupied.some((s) => s.edge === a.edge && a.t >= Math.min(s.fromT, s.toT) - 1e-7 && a.t <= Math.max(s.fromT, s.toT) + 1e-7));
const sameOccupiedBody = (a: TrainView, b: TrainView, movedM = 0.05): boolean => Math.abs(a.occupiedLengthM - b.occupiedLengthM) <= movedM + 0.05 &&
  overlapM(a.occupied, b.occupied) >= Math.min(a.occupiedLengthM, b.occupiedLengthM) - movedM - 0.05;
const speedLimitFor = (graph: Graph, railSpeed: ReadonlyMap<number, string>, train: TrainView): number => {
  let limit = Infinity;
  for (const occupied of train.occupied) {
    const cap = maxspeedMps(railSpeed.get(occupied.edge.wayId));
    const station = edgeIntersectsZone(graph, occupied.edge, occupied.fromT, occupied.toT);
    const segmentCap = station ? Math.min(cap, 25 / 3.6) : cap;
    limit = Math.min(limit, segmentCap);
  }
  if (!train.occupied.length) {
    const cap = maxspeedMps(railSpeed.get(train.leading.edge.wayId));
    return inZone(KINGS_CROSS, train.leading.point) ? Math.min(cap, 25 / 3.6) : cap;
  }
  return Number.isFinite(limit) ? limit : 40 / 3.6;
};
const classifyZone = (graph: Graph, train: TrainView, shapes: readonly PlatformShape[], platformAnchors: readonly LocatedAnchor[], throatHull: readonly [number, number][]): ZoneName => {
  if (trainTouchesPlatform(graph, train, shapes, platformAnchors, DEFAULTS.platformGeometryMarginM)) return 'platform';
  const inThroat = (p: [number, number]): boolean => throatHull.length >= 3 && polygonDistance(p, throatHull) <= 12;
  if (inThroat(train.leading.point) || occupiedPoints(graph, train).some(inThroat)) return 'throat';
  return 'approach';
};
const bodyOutsidePlatformM = (graph: Graph, train: TrainView, shape: PlatformShape): number => {
  if (!train.occupied.length) return 0;
  const values = train.occupied.flatMap((s) => [projectAlong(pointOn(graph, s.edge, s.fromT), shape.axis), projectAlong(pointOn(graph, s.edge, s.toT), shape.axis)]);
  return Math.max(0, shape.minAlong - Math.min(...values), Math.max(...values) - shape.maxAlong);
};
const getPlatformShape = (anchor: LocatedAnchor, shapes: readonly PlatformShape[]): PlatformShape | undefined => {
  const same = shapes.filter((s) => s.platform.ref === anchor.anchor.platform || s.platform.ref !== undefined && Number(s.platform.ref) === Number(anchor.anchor.platform));
  return same.sort((a, b) => polygonDistance(anchor.point, a.platform.pts as [number, number][]) - polygonDistance(anchor.point, b.platform.pts as [number, number][]))[0];
};

/** Replay one recording from a fresh motion state; no learned future events are preloaded. */
export function auditRecording(rows: readonly RecordedEvent[], data: KxData, anchors: AnchorMap, options: MotionAuditOptions = {}) {
  if (!rows.length) throw new Error('recording is empty');
  const dtSeconds = options.dtSeconds ?? DEFAULTS.dtSeconds;
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0 || dtSeconds > 0.1) throw new Error('dtSeconds must be finite and in (0, 0.1]');
  const accelBound = options.maxAccelerationMps2 ?? DEFAULTS.accelerationMps2;
  const decelBound = options.maxDecelerationMps2 ?? DEFAULTS.decelerationMps2;
  const heldBound = options.maxHeldOutsideAnchorSeconds ?? DEFAULTS.heldSeconds;
  const bufferBound = options.minimumBufferClearanceM ?? DEFAULTS.bufferClearanceM;
  const bodyTolerance = options.platformEndToleranceM ?? DEFAULTS.platformEndToleranceM;
  const profileCap = options.maxProfileSamplesPerTrain ?? DEFAULTS.profileSamplesPerTrain;
  for (const [name, n] of Object.entries({ accelBound, decelBound, heldBound, bufferBound, bodyTolerance, profileCap })) {
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be finite and positive`);
  }
  const normalized = rows.map((row, index) => {
    if (!Number.isFinite(row.t) || row.t < 0) throw new Error(`invalid recording timestamp at row ${index + 1}`);
    return { t: row.t, e: parseEvent(row.e), index };
  }).sort((a, b) => a.t - b.t || a.index - b.index);
  const graph = buildGraph(data);
  const located = anchors.anchors.flatMap((a) => { const p = locateAnchor(graph, a); return p ? [p] : []; });
  const locatedByBerth = new Map(located.map((a) => [a.anchor.berth, a]));
  const platformAnchors = located.filter((a) => a.anchor.platform !== undefined);
  const shapes = [...stationPlatforms(data).values()].flatMap((p) => { const shape = platformShape({ ...p, pts: platformDrawingOutline(p, data) }); return shape ? [shape] : []; });
  const gasworksSouth = tunnelMouths(data).find((m) => m.id === 'gasworks-south');
  const throatHull = convexHull([...shapes.flatMap((s) => s.platform.pts as [number, number][]), ...(gasworksSouth?.bores.flatMap((b) => b.tracks.map((t) => [t.x, t.z] as [number, number])) ?? [])]);
  const lengths = { long: trainLayout('lner9').length, short: trainLayout('lner5').length };
  const motionOptions: MotionOptions = {
    lengthM: options.lengthM ?? ((description) => description[0] === '1' ? lengths.long : lengths.short),
    wayMaxspeed: new Map(data.rails.filter((r) => r.maxspeed !== undefined).map((r) => [r.id, r.maxspeed!])),
    estimatedMotion: true,
  };
  const railSpeed = motionOptions.wayMaxspeed!;
  const motion = (options.createMotion ?? createMotion)(graph, anchors, motionOptions);
  const reconcile = createEventReconciler((event, atMs) => motion.apply(event, atMs));
  const startMs = normalized[0]!.t, endMs = normalized.at(-1)!.t;
  const dtMs = dtSeconds * 1000;
  let cursor = 0, nextTick = startMs, tickIndex = 0;
  let previous = new Map<number, TrainView>();
  const profiles = new Map<number, TrainProfile>();
  const heldOutside = new Map<number, number>();
  const heldOutsideMax = new Map<number, number>();
  const violations: Violation[] = [];
  const speedZones: Record<ZoneName, { maxMps: number; samples: number; maxTrainId?: number; maxSeconds?: number }> = {
    platform: { maxMps: 0, samples: 0 }, throat: { maxMps: 0, samples: 0 }, approach: { maxMps: 0, samples: 0 },
  };
  const overlapPairs = new Map<string, { trainIds: [number, number]; descriptions: [string, string]; maxOverlapM: number; ticks: number }>();
  const platformStops = new Map<string, PlatformStopAudit & { trainId: number; description: string }>();
  const counts: MetricCounts = { ticks: 0, maxSpeedMps: 0, maxAccelerationMps2: 0, maxDecelerationMps2: 0, maxPointJumpM: 0,
    pointOverspeedTicks: 0, teleportTicks: 0, distanceUnderSpeedTicks: 0, backwardTicks: 0, sameTrackOverlapTicks: 0, maxSameTrackOverlapM: 0,
    speedLimitViolationTicks: 0, accelerationViolationTicks: 0, decelerationViolationTicks: 0, heldOutsideAnchorViolations: 0,
    platformBufferClearanceViolations: 0, platformBodyContainmentViolations: 0, stationaryCabReversals: 0, reversalsOutsidePlatform: 0 };
  const sample = (atMs: number): void => {
    const elapsed = (atMs - startMs) / 1000, trains = motion.trains();
    const current = new Map(trains.map((t) => [t.id, t]));
    const zoneFor = new Map<number, ZoneName>();
    const observations: MotionAuditSample[] = [];
    const heldPlatforms = new Map<number, string>();
    for (const train of trains) {
      const zone = classifyZone(graph, train, shapes, platformAnchors, throatHull);
      zoneFor.set(train.id, zone);
      const zoneMetric = speedZones[zone];
      zoneMetric.samples++;
      if (train.speed > zoneMetric.maxMps) Object.assign(zoneMetric, { maxMps: train.speed, maxTrainId: train.id, maxSeconds: elapsed });
      counts.maxSpeedMps = Math.max(counts.maxSpeedMps, train.speed);
      let profile = profiles.get(train.id);
      if (!profile) {
        profile = { id: train.id, description: train.description, lengthM: train.lengthM, firstSeenSeconds: elapsed, lastSeenSeconds: elapsed,
          maxSpeedMps: train.speed, maxAccelerationMps2: 0, maxDecelerationMps2: 0, maxPointJumpM: 0, pointOverspeedTicks: 0,
          teleportTicks: 0, distanceUnderSpeedTicks: 0, backwardTicks: 0, accelerationViolationTicks: 0, decelerationViolationTicks: 0,
          speedLimitViolationTicks: 0, maxSameTrackOverlapM: 0, maxHeldOutsideAnchorsSeconds: 0, platformStops: [], profile: [], profileTruncated: false };
        profiles.set(train.id, profile);
      }
      profile.description = train.description;
      profile.lastSeenSeconds = elapsed;
      profile.maxSpeedMps = Math.max(profile.maxSpeedMps, train.speed);

      const old = previous.get(train.id);
      let acceleration = 0, deceleration = 0;
      if (old) {
        const reversal = train.reversals > old.reversals;
        const odometerDelta = Math.max(0, train.distanceM - old.distanceM);
        const possibleTravel = Math.max(old.speed, train.speed) * dtSeconds + DEFAULTS.pointToleranceM;
        const platformBody = trainTouchesPlatform(graph, train, shapes, platformAnchors, DEFAULTS.platformGeometryMarginM);
        const cabReversal = reversal && platformBody && odometerDelta <= possibleTravel && sameOccupiedBody(old, train, odometerDelta);
        if (cabReversal) counts.stationaryCabReversals++;
        else if (reversal) {
          counts.reversalsOutsidePlatform++;
          violations.push({ kind: 'reversal-outside-platform', trainId: train.id, description: train.description, seconds: elapsed,
            details: { berth: train.lastBerth, reversals: train.reversals, odometerDeltaM: odometerDelta, platformBody } });
        }
        // A bounded-speed trajectory cannot cover less than this route distance,
        // even if it slows and accelerates between the two sampled endpoints.
        const minimumTravelM = Math.max(0, Math.min(old.speed, train.speed) * dtSeconds -
          Math.max(accelBound, decelBound) * dtSeconds * dtSeconds / 2 - DEFAULTS.pointToleranceM);
        if (!cabReversal && odometerDelta < minimumTravelM) {
          counts.distanceUnderSpeedTicks++; profile.distanceUnderSpeedTicks++;
          if (!violations.some((v) => v.kind === 'distance-under-reported-speed' && v.trainId === train.id)) {
            violations.push({ kind: 'distance-under-reported-speed', trainId: train.id, description: train.description, seconds: elapsed,
              details: { odometerDeltaM: odometerDelta, minimumTravelM, previousSpeedMps: old.speed, speedMps: train.speed,
                dtSeconds, assumedRateBoundMps2: Math.max(accelBound, decelBound), toleranceM: DEFAULTS.pointToleranceM } });
          }
        }
        const deltaV = (train.speed - old.speed) / dtSeconds;
        if (!cabReversal && deltaV > 0) {
          acceleration = deltaV; profile.maxAccelerationMps2 = Math.max(profile.maxAccelerationMps2, deltaV);
          counts.maxAccelerationMps2 = Math.max(counts.maxAccelerationMps2, deltaV);
          if (deltaV > accelBound + DEFAULTS.speedToleranceMps) { counts.accelerationViolationTicks++; profile.accelerationViolationTicks++; }
        } else if (!cabReversal && deltaV < 0) {
          deceleration = -deltaV; profile.maxDecelerationMps2 = Math.max(profile.maxDecelerationMps2, -deltaV);
          counts.maxDecelerationMps2 = Math.max(counts.maxDecelerationMps2, -deltaV);
          if (-deltaV > decelBound + DEFAULTS.speedToleranceMps) { counts.decelerationViolationTicks++; profile.decelerationViolationTicks++; }
        }
        const moved = Math.hypot(train.leading.point[0] - old.leading.point[0], train.leading.point[1] - old.leading.point[1]);
        if (!cabReversal) {
          counts.maxPointJumpM = Math.max(counts.maxPointJumpM, moved); profile.maxPointJumpM = Math.max(profile.maxPointJumpM, moved);
          if (moved > Math.max(train.speed, old.speed) * dtSeconds + DEFAULTS.pointToleranceM) { counts.pointOverspeedTicks++; profile.pointOverspeedTicks++; }
          if (moved > odometerDelta + DEFAULTS.teleportToleranceM) { counts.teleportTicks++; profile.teleportTicks++; }
          const forwardX = Math.sin(old.heading), forwardZ = -Math.cos(old.heading);
          const along = (train.leading.point[0] - old.leading.point[0]) * forwardX + (train.leading.point[1] - old.leading.point[1]) * forwardZ;
          if (moved > 0.2 && along < -0.05) { counts.backwardTicks++; profile.backwardTicks++; }
        }
      }
      const limit = speedLimitFor(graph, railSpeed, train);
      observations.push({ atMs, train, zone, speedLimitMps: limit, accelerationMps2: acceleration, decelerationMps2: deceleration });
      if (train.speed > limit + DEFAULTS.speedToleranceMps) {
        counts.speedLimitViolationTicks++; profile.speedLimitViolationTicks++;
      }
      if (Math.abs(elapsed / DEFAULTS.profileEverySeconds - Math.round(elapsed / DEFAULTS.profileEverySeconds)) < 1e-7) {
        if (profile.profile.length < profileCap) profile.profile.push({ seconds: Number(elapsed.toFixed(3)), speedMps: train.speed,
          accelerationMps2: acceleration, decelerationMps2: deceleration, zone, state: train.state, targetBerth: train.targetBerth });
        else profile.profileTruncated = true;
      }

      if (train.speed <= 0.05 && train.state !== 'fading') {
        if (nearAnchor(train, located)) {
          heldOutside.delete(train.id);
        } else {
          if (!heldOutside.has(train.id)) heldOutside.set(train.id, elapsed);
          const duration = elapsed - heldOutside.get(train.id)!;
          heldOutsideMax.set(train.id, Math.max(heldOutsideMax.get(train.id) ?? 0, duration));
          profile.maxHeldOutsideAnchorsSeconds = heldOutsideMax.get(train.id)!;
          if (duration > heldBound && !violations.some((v) => v.kind === 'held-too-long-outside-anchor' && v.trainId === train.id)) {
            counts.heldOutsideAnchorViolations++;
            violations.push({ kind: 'held-too-long-outside-anchor', trainId: train.id, description: train.description, seconds: elapsed,
              details: { heldSeconds: duration, thresholdSeconds: heldBound, nearestAnchorDistanceM: Math.min(...located.map((a) => Math.hypot(train.leading.point[0] - a.point[0], train.leading.point[1] - a.point[1]))),
                lastBerth: train.lastBerth, targetBerth: train.targetBerth, blocked: train.blocked,
                leadingEdge: [train.leading.edge.a, train.leading.edge.b, train.leading.edge.wayId], leadingT: train.leading.t, leadingPointM: train.leading.point } });
          }
        }
      } else heldOutside.delete(train.id);

      const target = locatedByBerth.get(train.targetBerth);
      if (train.speed <= 0.05 && target?.anchor.platform !== undefined) {
        const key = `${train.id}:${target.anchor.berth}`;
        const shape = getPlatformShape(target, shapes);
        const nearestBuffer = data.buffers.map((b) => ({ point: [b.x, b.z] as [number, number], distance: Math.hypot(b.x - target.point[0], b.z - target.point[1]) }))
          .sort((a, b) => a.distance - b.distance)[0];
        const hasNearbyBuffer = nearestBuffer && nearestBuffer.distance <= 15;
        const bufferClearance = hasNearbyBuffer ? Math.hypot(train.leading.point[0] - nearestBuffer.point[0], train.leading.point[1] - nearestBuffer.point[1]) : undefined;
        const bodyOutside = shape ? bodyOutsidePlatformM(graph, train, shape) : undefined;
        const bodyInPlatform = Boolean(shape && occupiedPoints(graph, train).some((p) => p[0] >= shape.minX - DEFAULTS.platformGeometryMarginM && p[0] <= shape.maxX + DEFAULTS.platformGeometryMarginM &&
          p[1] >= shape.minZ - DEFAULTS.platformGeometryMarginM && p[1] <= shape.maxZ + DEFAULTS.platformGeometryMarginM &&
          polygonDistance(p, shape.platform.pts as [number, number][]) <= DEFAULTS.platformGeometryMarginM));
        const atBuffer = bufferClearance !== undefined && bufferClearance <= 5;
        if (!atBuffer && !bodyInPlatform) continue;
        let stop = platformStops.get(key);
        if (!stop) {
          stop = { trainId: train.id, description: train.description, targetBerth: target.anchor.berth, platform: target.anchor.platform,
            heldSamples: 0, bufferClearanceViolation: false, bodyContainmentViolation: false };
          platformStops.set(key, stop);
        }
        stop.heldSamples++;
        if (train.state === 'held') heldPlatforms.set(train.id, stop.platform);
        if (atBuffer && bufferClearance !== undefined) stop.minimumBufferClearanceM = Math.min(stop.minimumBufferClearanceM ?? Infinity, bufferClearance);
        if (bodyInPlatform && bodyOutside !== undefined) stop.maximumBodyOutsidePlatformM = Math.max(stop.maximumBodyOutsidePlatformM ?? 0, bodyOutside);
        if (atBuffer && bufferClearance !== undefined && bufferClearance + 0.01 < bufferBound) stop.bufferClearanceViolation = true;
        if (bodyInPlatform && bodyOutside !== undefined && bodyOutside > bodyTolerance) stop.bodyContainmentViolation = true;
      }
    }
    for (const stop of platformStops.values()) {
      if (stop.heldSamples === 0) continue;
      const profile = profiles.get(stop.trainId)!;
      const item = profile.platformStops.find((p) => p.targetBerth === stop.targetBerth);
      if (!item) profile.platformStops.push({ targetBerth: stop.targetBerth, platform: stop.platform, heldSamples: stop.heldSamples,
        bufferClearanceViolation: stop.bufferClearanceViolation, bodyContainmentViolation: stop.bodyContainmentViolation,
        ...(stop.minimumBufferClearanceM !== undefined ? { minimumBufferClearanceM: stop.minimumBufferClearanceM } : {}),
        ...(stop.maximumBodyOutsidePlatformM !== undefined ? { maximumBodyOutsidePlatformM: stop.maximumBodyOutsidePlatformM } : {}) });
      else {
        item.heldSamples = stop.heldSamples; item.bufferClearanceViolation ||= stop.bufferClearanceViolation; item.bodyContainmentViolation ||= stop.bodyContainmentViolation;
        if (stop.minimumBufferClearanceM !== undefined) item.minimumBufferClearanceM = Math.min(item.minimumBufferClearanceM ?? Infinity, stop.minimumBufferClearanceM);
        if (stop.maximumBodyOutsidePlatformM !== undefined) item.maximumBodyOutsidePlatformM = Math.max(item.maximumBodyOutsidePlatformM ?? 0, stop.maximumBodyOutsidePlatformM);
      }
    }
    for (let i = 0; i < trains.length; i++) for (let j = i + 1; j < trains.length; j++) {
      const a = trains[i]!, b = trains[j]!, amount = overlapM(a.occupied, b.occupied);
      if (amount <= 0.01) continue;
      counts.sameTrackOverlapTicks++; counts.maxSameTrackOverlapM = Math.max(counts.maxSameTrackOverlapM, amount);
      profiles.get(a.id)!.maxSameTrackOverlapM = Math.max(profiles.get(a.id)!.maxSameTrackOverlapM, amount);
      profiles.get(b.id)!.maxSameTrackOverlapM = Math.max(profiles.get(b.id)!.maxSameTrackOverlapM, amount);
      const ids: [number, number] = [Math.min(a.id, b.id), Math.max(a.id, b.id)], key = `${ids[0]}:${ids[1]}`;
      const prior = overlapPairs.get(key);
      overlapPairs.set(key, { trainIds: ids, descriptions: [a.id <= b.id ? a.description : b.description, a.id <= b.id ? b.description : a.description],
        maxOverlapM: Math.max(prior?.maxOverlapM ?? 0, amount), ticks: (prior?.ticks ?? 0) + 1 });
    }
    for (const stop of platformStops.values()) {
      if (stop.heldSamples === 0) continue;
      if (stop.bufferClearanceViolation && !violations.some((v) => v.kind === 'platform-buffer-clearance' && v.trainId === stop.trainId && v.details.targetBerth === stop.targetBerth)) {
        counts.platformBufferClearanceViolations++;
        violations.push({ kind: 'platform-buffer-clearance', trainId: stop.trainId, description: stop.description,
          details: { targetBerth: stop.targetBerth, platform: stop.platform, minimumBufferClearanceM: stop.minimumBufferClearanceM, minimumM: bufferBound } });
      }
      if (stop.bodyContainmentViolation && !violations.some((v) => v.kind === 'platform-body-outside-polygon' && v.trainId === stop.trainId && v.details.targetBerth === stop.targetBerth)) {
        counts.platformBodyContainmentViolations++;
        violations.push({ kind: 'platform-body-outside-polygon', trainId: stop.trainId, description: stop.description,
          details: { targetBerth: stop.targetBerth, platform: stop.platform, maximumOutsideM: stop.maximumBodyOutsidePlatformM, toleranceM: bodyTolerance } });
      }
    }
    for (const observation of observations) options.onSample?.({ ...observation, heldPlatform: heldPlatforms.get(observation.train.id) });
    previous = current;
    counts.ticks++;
  };

  // The page's timeline delivers every event at its recorded timestamp, advancing motion
  // exactly to that time. Samples are taken at the fixed 100 ms grid between events.
  const timeline = {
    time: startMs,
    advanceTo(nextMs: number) {
      const next = Math.max(this.time, nextMs);
      if (next > this.time) motion.advance((next - this.time) / 1000);
      this.time = next;
    },
    deliver(event: MotionEvent, atMs: number) {
      this.advanceTo(atMs);
      reconcile(event, this.time);
    },
  };
  while (cursor < normalized.length || nextTick <= endMs + 1e-6) {
    const row = normalized[cursor];
    if (row && row.t <= nextTick + 1e-6) {
      timeline.deliver(row.e, row.t);
      cursor++;
      continue;
    }
    if (nextTick > endMs + 1e-6) break;
    timeline.advanceTo(nextTick);
    sample(nextTick);
    nextTick = startMs + (++tickIndex) * dtMs;
  }
  if (timeline.time < endMs) timeline.advanceTo(endMs);

  for (const stop of platformStops.values()) {
    if (stop.bufferClearanceViolation && !violations.some((v) => v.kind === 'platform-buffer-clearance' && v.trainId === stop.trainId && v.details.targetBerth === stop.targetBerth)) {
      counts.platformBufferClearanceViolations++;
      violations.push({ kind: 'platform-buffer-clearance', trainId: stop.trainId, description: stop.description,
        details: { targetBerth: stop.targetBerth, platform: stop.platform, minimumBufferClearanceM: stop.minimumBufferClearanceM, minimumM: bufferBound } });
    }
    if (stop.bodyContainmentViolation && !violations.some((v) => v.kind === 'platform-body-outside-polygon' && v.trainId === stop.trainId && v.details.targetBerth === stop.targetBerth)) {
      counts.platformBodyContainmentViolations++;
      violations.push({ kind: 'platform-body-outside-polygon', trainId: stop.trainId, description: stop.description,
        details: { targetBerth: stop.targetBerth, platform: stop.platform, maximumOutsideM: stop.maximumBodyOutsidePlatformM, toleranceM: bodyTolerance } });
    }
  }
  const profilesSorted = [...profiles.values()].sort((a, b) => a.id - b.id);
  const maxHeldOutsideAnchorSeconds = Math.max(0, ...heldOutsideMax.values());
  const countsFinal = { ...counts };
  return {
    policy: options.createMotion ? 'injected' : 'default',
    durationSeconds: (endMs - startMs) / 1000,
    thresholds: { dtSeconds, accelerationMps2: accelBound, decelerationMps2: decelBound, heldOutsideAnchorSeconds: heldBound,
      minimumBufferClearanceM: bufferBound, platformEndToleranceM: bodyTolerance, profileEverySeconds: DEFAULTS.profileEverySeconds,
      maxProfileSamplesPerTrain: profileCap, speedFallbackKmh: 40, stationKmh: 25, platformApproachRouteM: 400 },
    method: {
      noFutureLearnedChains: true,
      zoneDefinitions: { platform: 'occupied track is within 5 m of a surface platform drawing outline selected by stationPlatforms()/platformDrawingOutline() or includes a mapped platform anchor stop',
        throat: 'occupied track or leading point is within 12 m of the convex hull joining those platform polygons to the OSM Gasworks south portal tracks; coarse audit envelope only',
        approach: 'all other on-model track outside the platform and throat envelope' },
      speedLimit: 'minimum OSM way maxspeed (40 km/h fallback) over every occupied track section, capped at 25 km/h where occupied track intersects KINGS_CROSS; the core also has a route-distance 400 m platform approach cap, not independently checked because routes are not exposed',
      platformStop: 'stationary trains targeting a mapped platform berth are checked only when the leading end is within 5 m of its mapped physical buffer or the occupied body intersects that selected surface platform drawing outline; buffer clearance is checked only at a buffer stop',
      bodyContainment: 'occupied body projected along the selected platform drawing outline long axis; 2 m endpoint tolerance; geometry only, not a safety certification',
      heldClassification: 'continuous interval at speed <= 0.05 m/s beyond max(anchor.errorM, 5 m) from every located anchor; ordinary dwell at an anchor is informational and is not a violation',
      cabReversal: 'a reversal counter increase on occupied surface-platform track with occupied-body overlap consistent with odometer distance is treated as a legal cab label reversal; its nose-label jump is excluded from point-speed, teleport and backward metrics; reversals elsewhere are reported',
      trainLengths: options.lengthPolicy ?? `Fallback LNER IET shape assumption: descriptions starting with 1 use ${lengths.long} m (9-car); other descriptions use ${lengths.short} m (5-car)`,
      distanceConsistency: 'route odometer advance must be at least min(endpoint speeds) * dt - max(audit acceleration/deceleration bounds) * dt² / 2 - 0.05 m; assumes those rate bounds between samples, excludes recognized cab swaps, and does not independently prove continuous body trajectory',
      limits: '0.7 m/s² accel/decel thresholds are modeling audit bounds; core currently models 0.7 accel and 0.6 service braking',
      references: [
        'Hitachi Class 800 series lists maximum acceleration of 0.75 m/s²: https://www.hitachirail.com/products-and-solutions/rolling-stock/intercity-trains/class-800-series-800-810/',
        'Department for Transport IEP TTS, Annex B p.72 models braking at 6% g (about 0.589 m/s²): https://assets.publishing.service.gov.uk/media/5a79b82e40f0b63d72fc7f58/tts-redacted.pdf',
      ],
    },
    counts: countsFinal,
    maxHeldOutsideAnchorSeconds,
    maxSpeedByZone: speedZones,
    sameTrackOverlapPairs: [...overlapPairs.values()].sort((a, b) => b.maxOverlapM - a.maxOverlapM),
    violations,
    trains: profilesSorted,
  };
}

export function renderMotionAuditMarkdown(report: ReturnType<typeof auditRecording>): string {
  const c = report.counts;
  const f = (n: number): string => Number.isFinite(n) ? n.toFixed(2) : '—';
  const rows = Object.entries(report.maxSpeedByZone).map(([zone, metric]) => `| ${zone} | ${f(metric.maxMps)} | ${f(metric.maxMps * 3.6)} | ${metric.samples} |`).join('\n');
  const violationRows = report.violations.length ? report.violations.slice(0, 30).map((v) => `| ${v.kind} | ${v.description ?? `train ${v.trainId ?? '?'}`} | ${JSON.stringify(v.details)} |`).join('\n') : '| none | — | — |';
  const trainRows = report.trains.map((t) => `| ${t.id} | ${t.description} | ${f(t.maxSpeedMps * 3.6)} | ${f(t.maxAccelerationMps2)} | ${f(t.maxDecelerationMps2)} | ${t.profile.length}${t.profileTruncated ? '+' : ''} |`).join('\n');
  return `# Motion audit\n\n` +
    `Duration: ${f(report.durationSeconds)} s. Simulation step: ${report.thresholds.dtSeconds} s. Trains: ${report.trains.length}.\n\n` +
    `## Counts\n\n` +
    `| Measure | Value |\n|---|---:|\n` +
    `| Max speed | ${f(c.maxSpeedMps)} m/s (${f(c.maxSpeedMps * 3.6)} km/h) |\n` +
    `| Max acceleration / deceleration | ${f(c.maxAccelerationMps2)} / ${f(c.maxDecelerationMps2)} m/s² |\n` +
    `| Accel / decel bound ticks (> ${report.thresholds.accelerationMps2} / ${report.thresholds.decelerationMps2} m/s²) | ${c.accelerationViolationTicks} / ${c.decelerationViolationTicks} |\n` +
    `| Speed-limit violation ticks | ${c.speedLimitViolationTicks} |\n` +
    `| Drawn point overspeed / teleport / backward ticks | ${c.pointOverspeedTicks} / ${c.teleportTicks} / ${c.backwardTicks} |\n` +
    `| Route distance below reported speed ticks | ${c.distanceUnderSpeedTicks} |\n` +
    `| Same-track overlap ticks / max overlap | ${c.sameTrackOverlapTicks} / ${f(c.maxSameTrackOverlapM)} m |\n` +
    `| Held > ${report.thresholds.heldOutsideAnchorSeconds}s outside all anchors | ${c.heldOutsideAnchorViolations} |\n` +
    `| Platform buffer / body containment violations | ${c.platformBufferClearanceViolations} / ${c.platformBodyContainmentViolations} |\n` +
    `| Stationary cab reversals recognized / outside-platform reversals | ${c.stationaryCabReversals} / ${c.reversalsOutsidePlatform} |\n\n` +
    `## Maximum speed by zone\n\n| Zone | m/s | km/h | train-ticks |\n|---|---:|---:|---:|\n${rows}\n\n` +
    `## Violations\n\n| Kind | Train | Details |\n|---|---|---|\n${violationRows}\n\n` +
    `## Per-train extrema\n\n| ID | Description | max km/h | max accel m/s² | max decel m/s² | profile samples |\n|---:|---|---:|---:|---:|---:|\n${trainRows}\n\n` +
    `Profiles retain one sample per second up to ${report.thresholds.maxProfileSamplesPerTrain} samples per physical train; extrema are calculated every simulation tick. Holds at any mapped berth anchor are excluded from the >120 s held-outside-anchor finding, so an ordinary dwell at a berth is not a motion defect. The 0.7 m/s² acceleration and deceleration limits are audit bounds: Hitachi lists 0.75 m/s² maximum acceleration for Class 800 ([source](https://www.hitachirail.com/products-and-solutions/rolling-stock/intercity-trains/class-800-series-800-810/)); the Department for Transport IEP model uses 6% g, about 0.589 m/s², for braking ([Annex B, p. 72](https://assets.publishing.service.gov.uk/media/5a79b82e40f0b63d72fc7f58/tts-redacted.pdf)). The core's 400 m platform approach cap is route-based and is not independently checked because the route is not exposed to the audit.\n`;
}

function parseArgs(args: string[]): Map<string, string[]> {
  const allowed = new Set(['--anchors', '--recording', '--out', '--data', '--motion-module', '--schedule']);
  const values = new Map<string, string[]>();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]!, value = args[i + 1];
    if (!allowed.has(key) || value === undefined || value.startsWith('--') || (key !== '--recording' && values.has(key))) throw new Error('usage: motion-audit.ts --anchors <json> --recording <ndjson> [--recording <ndjson> ...] --out <.scratch/dir> [--data <json>] [--schedule <json>] [--motion-module <ts>].');
    values.set(key, [...(values.get(key) ?? []), value]);
  }
  for (const key of ['--anchors', '--recording', '--out']) if (!values.has(key)) throw new Error(`missing ${key}`);
  return values;
}
const inside = (parent: string, child: string): boolean => { const r = relative(parent, child); return r !== '' && !r.startsWith('..') && !isAbsolute(r); };
const readRecording = async (file: string): Promise<RecordedEvent[]> => (await readFile(file, 'utf8')).split(/\r?\n/).flatMap((line, index) => {
  if (!line.trim()) return [];
  try {
    const row = JSON.parse(line) as { t: number | string; e: unknown };
    const t = typeof row.t === 'number' ? row.t : Date.parse(row.t);
    if (!Number.isFinite(t) || !row.e) throw new Error('bad row');
    return [{ t, e: parseEvent(row.e) }];
  } catch { throw new Error(`invalid recording row ${index + 1} in ${basename(file)}`); }
});

async function main(): Promise<void> {
  const values = parseArgs(process.argv.slice(2));
  const repo = fileURLToPath(new URL('../../', import.meta.url));
  const scratch = resolve(repo, '.scratch');
  const out = resolve(repo, values.get('--out')![0]!);
  if (!inside(scratch, out)) throw new Error('--out must be beneath this worktree .scratch');
  await mkdir(scratch, { recursive: true });
  let ancestor = out;
  for (;;) {
    try {
      const real = await realpath(ancestor), scratchReal = await realpath(scratch);
      if (real !== scratchReal && !inside(scratchReal, real)) throw new Error('output symlink escapes .scratch');
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      ancestor = dirname(ancestor);
    }
  }
  await mkdir(out, { recursive: true });
  const anchorsPath = resolve(repo, values.get('--anchors')![0]!);
  const dataPath = resolve(repo, values.get('--data')?.[0] ?? 'kings-cross-src/web/src/data/kx-track.json');
  const [anchors, data] = await Promise.all([
    readFile(anchorsPath, 'utf8').then((s) => JSON.parse(s) as AnchorMap),
    readFile(dataPath, 'utf8').then((s) => JSON.parse(s) as KxData),
  ]);
  const schedulePath = values.get('--schedule')?.[0];
  const schedule = schedulePath ? await readFile(resolve(repo, schedulePath), 'utf8').then((s) => JSON.parse(s) as { date: string; calls: ScheduleCall[] }) : undefined;
  if (schedule && (!/^\d{4}-\d{2}-\d{2}$/.test(schedule.date) || !Array.isArray(schedule.calls))) throw new Error('--schedule must contain date and calls');
  let factory: MotionFactory | undefined;
  const modulePath = values.get('--motion-module')?.[0];
  if (modulePath) {
    const imported = await import(pathToFileURL(resolve(repo, modulePath)).href) as { createMotion?: MotionFactory };
    if (typeof imported.createMotion !== 'function') throw new Error('--motion-module must export createMotion');
    factory = imported.createMotion;
  }
  const summaries: { recording: string; json: string; markdown: string; trains: number; violations: number; maxKmh: number }[] = [];
  for (const [index, recordingPath] of values.get('--recording')!.entries()) {
    const rows = await readRecording(resolve(repo, recordingPath));
    const recordingDate = rows.length ? ukDate(rows[0]!.t) : '';
    const daySchedule = schedule?.date === recordingDate ? schedule : undefined;
    const trainKinds = daySchedule ? createTrainKinds((description, atMs) => matchService(description, atMs, daySchedule.calls)) : undefined;
    const auditOptions: MotionAuditOptions = {
      ...(factory ? { createMotion: factory } : {}),
      ...(trainKinds ? { lengthM: trainKinds.lengthM, lengthPolicy: `Schedule ${daySchedule!.date}: page service-to-formation resolver at physical birth; unmatched services use the page's headcode fallback` } : {}),
    };
    const report = auditRecording(rows, data, anchors, auditOptions);
    const stem = `${String(index + 1).padStart(2, '0')}-${basename(recordingPath).replace(/\.[^.]+$/, '')}`.replace(/[^A-Za-z0-9._-]/g, '_');
    const jsonPath = resolve(out, `${stem}.motion-audit.json`), markdownPath = resolve(out, `${stem}.motion-audit.md`);
    await Promise.all([
      writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 }),
      writeFile(markdownPath, renderMotionAuditMarkdown(report), { mode: 0o600 }),
    ]);
    summaries.push({ recording: basename(recordingPath), json: relative(repo, jsonPath), markdown: relative(repo, markdownPath), trains: report.trains.length,
      violations: report.violations.length, maxKmh: report.counts.maxSpeedMps * 3.6 });
  }
  console.log(JSON.stringify({ reports: summaries }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
}
