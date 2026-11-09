import { NOT_A_TRAIN } from '../../core/anchors.ts';
import type { AnchorMap, BerthAnchor } from '../../core/anchors.ts';
import { shortestPath } from '../../core/graph.ts';
import type { Graph } from '../../core/graph.ts';
import type { TrackPosition, TrainView } from '../../core/motion.ts';
import { matchService } from '../../core/schedule.ts';
import type { ScheduleCall } from '../../core/schedule.ts';

export type BoardMode = 'sample' | 'live' | 'replay' | 'none';
export type BoardTrain = Pick<TrainView, 'id' | 'description'> & Partial<Omit<TrainView, 'id' | 'description'>> & { samplePlatform?: number };
export interface BoardService extends ScheduleCall {
  originName?: string;
  destinationName?: string;
  cancelled?: boolean; // Explicit schedule information, never inferred from a missing TD label.
  realtime?: {
    actualArrivalMs?: number | null; actualDepartureMs?: number | null;
    publicArrivalMs?: number | null; publicDepartureMs?: number | null;
    variationMinutes?: number | null; eventType?: string | null; platform?: string | null;
    trainId?: string | null; matchMethod?: string | null; updatedAtMs?: number | null;
    cancelled?: boolean;
    cancellationUpdatedAtMs?: number | null;
  } | null;
}
export interface BoardDue { service: BoardService; direction: 'arrival' | 'departure'; bookedMs: number }
/** TD placement remains observational; timetable data only enriches its labels. */
export interface BoardRow {
  trainId: number;
  headcode: string;
  service?: BoardService;
  uid?: string;
  operator?: string;
  origin?: string;
  platform?: number;
  platforms?: number[];
  state: 'standing' | 'departing' | 'approaching' | 'leaving';
  sinceMs?: number;
  stoodMs?: number;
  /** Simulation time the train began pulling out. Set on a `departing` platform row and kept when it moves to Departed. */
  leftAtMs?: number;
  distanceM?: number;
  sample?: boolean;
  booked?: string;
  expected?: string;
  destination?: string;
}
export interface BoardRows {
  timetable: boolean;
  due: BoardDue[];
  platforms: { platform: number; trains: BoardRow[] }[];
  approaching: BoardRow[];
  departed: BoardRow[];
  timeMs: number;
  mode: BoardMode;
}
export interface BoardOptions {
  services?: readonly BoardService[];
  nowMs?: number;
  previous?: BoardRows;
  mode?: BoardMode;
  graph?: Graph;
  arrivals?: ReadonlyMap<string, readonly number[]>;
  retentionMs?: number;
  /** Override PLATFORM_CLEAR_M. */
  platformClearM?: number;
  /** Override LEAVING_MAX_MS. */
  leavingMaxMs?: number;
}

/**
 * A departing train keeps its platform row, bracketed, while it is still drawn alongside the platform. It
 * moves to Departed as soon as ANY of these holds:
 *  1. its tail is PLATFORM_CLEAR_M of rail or more from the platform's stop (it no longer occupies the platform
 *     track in the motion model). King's Cross platforms 0-8 are about 300 m, platforms 9 and 10 about 170 m, so a
 *     train on 9 or 10 stays bracketed a few seconds after its tail has cleared;
 *  2. another train is standing on that platform;
 *  3. LEAVING_MAX_MS has passed since it began to leave (the motion model clears 300 m in about 45 s at station
 *     speed, so this only catches a train held by a signal with its tail still alongside);
 *  4. the motion model has dropped it, or has no body or track graph to measure (nothing to draw alongside).
 */
export const PLATFORM_CLEAR_M = 300;
export const LEAVING_MAX_MS = 90_000;

/**
 * Delay classes follow UK station displays. The thresholds are whole minutes behind the booked time, taken from
 * the signed TRUST variation of the report for the event a row shows (TRUST reports whole minutes):
 *   cancelled              red          wins over any variation
 *   5 minutes or more late orange-red   `very-late`; 5 minutes is the National Rail PPM "on time" limit for commuter and regional services
 *   1 to under 5 late      amber        `late`
 *   on time or early (<=0) green        `ontime`
 *   no report              no colour    `unknown`: never guessed, so no label either
 * Colour is never the only signal: each class also prints words and the signed minutes ("Late +6").
 */
export type DelayClass = 'ontime' | 'late' | 'very-late' | 'cancelled' | 'unknown';
export const LATE_FROM_MIN = 1;
export const VERY_LATE_FROM_MIN = 5;
export function delayClass(variationMinutes: number | null | undefined, isCancelled = false): DelayClass {
  if (isCancelled) return 'cancelled';
  if (typeof variationMinutes !== 'number' || !Number.isFinite(variationMinutes)) return 'unknown';
  return variationMinutes >= VERY_LATE_FROM_MIN ? 'very-late' : variationMinutes >= LATE_FROM_MIN ? 'late' : 'ontime';
}

const validPlatform = (n: number): boolean => Number.isInteger(n) && n >= 0 && n <= 10;
const namedPlatform = (berth = ''): number | undefined => {
  const n = /^10\d{2}$/.test(berth) ? Number(berth) - 1000 : /^B\d{3}$/.test(berth) ? Number(berth.slice(1)) : NaN;
  return validPlatform(n) ? n : undefined;
};
const anchorPlatform = (anchor: BerthAnchor | undefined): number | undefined => {
  const n = anchor?.platform === undefined ? NaN : Number(anchor.platform);
  return validPlatform(n) ? n : undefined;
};

/** Read private runtime evidence, never bake observed berth chains into the public bundle. */
export function approachPlatforms(anchors: AnchorMap): ReadonlyMap<string, readonly number[]> {
  const direct = new Map<string, number>();
  const next = new Map<string, string[]>();
  for (const a of anchors.anchors) {
    const platform = anchorPlatform(a) ?? namedPlatform(a.berth);
    if (platform !== undefined) direct.set(a.berth, platform);
    const match = /fan-out to ([\w, -]+);/.exec(a.evidence);
    if (match) next.set(a.berth, match[1]!.split(',').map((b) => b.trim()));
    else {
      const continuation = /Boundary continuation north from (\w+):/.exec(a.evidence);
      if (continuation) next.set(a.berth, [continuation[1]!]);
    }
  }
  for (const u of anchors.unmapped) {
    const match = /successors \[([^\]]+)\]/.exec(u.detail) ?? /fan-out to ([\w, -]+);/.exec(u.detail);
    if (match) next.set(u.berth, match[1]!.split(',').map((b) => b.trim()));
    else {
      const continuation = /Boundary continuation north from (\w+):/.exec(u.detail);
      if (continuation) next.set(u.berth, [continuation[1]!]);
    }
  }
  const result = new Map<string, readonly number[]>();
  const visit = (berth: string, seen: Set<string>): number[] => {
    const platform = direct.get(berth) ?? namedPlatform(berth);
    if (platform !== undefined) return [platform];
    if (seen.has(berth)) return [];
    const onward = next.get(berth);
    if (!onward?.length) return [];
    const path = new Set(seen).add(berth);
    const sets = onward.map((b) => visit(b, path));
    // A partially known fan-out is not proof of a smaller platform set.
    return sets.some((s) => !s.length) ? [] : [...new Set(sets.flat())].sort((a, b) => a - b);
  };
  for (const berth of next.keys()) {
    const platforms = visit(berth, new Set());
    if (platforms.length) result.set(berth, platforms);
  }
  return result;
}

function coversStop(train: BoardTrain, stop: BerthAnchor): boolean {
  return (train.occupied ?? []).some((s) => {
    if (!((s.edge.a === stop.from && s.edge.b === stop.to) || (s.edge.b === stop.from && s.edge.a === stop.to))) return false;
    const t = s.edge.a === stop.from ? stop.t : 1 - stop.t;
    // The rendered nose stops just short of a buffer; do not require exact float equality.
    const clearance = 2 / s.edge.length;
    return t >= Math.min(s.fromT, s.toT) - clearance && t <= Math.max(s.fromT, s.toT) + clearance;
  });
}

/** Shortest rail distance, including fractional end edges; never a straight-line estimate. `start` is the nose unless given. */
function distanceToStop(train: BoardTrain, stop: BerthAnchor, graph?: Graph, start: Pick<TrackPosition, 'edge' | 't'> | undefined = train.leading): number | undefined {
  if (!graph || !start) return undefined;
  const edge = graph.edges.find((e) => (e.a === stop.from && e.b === stop.to) || (e.b === stop.from && e.a === stop.to));
  if (!edge) return undefined;
  const t = edge.a === stop.from ? stop.t : 1 - stop.t;
  let best = start.edge.a === edge.a && start.edge.b === edge.b ? Math.abs(start.t - t) * edge.length : Infinity;
  for (const [from, head] of [[start.edge.a, start.t * start.edge.length], [start.edge.b, (1 - start.t) * start.edge.length]]) {
    for (const [to, tail] of [[edge.a, t * edge.length], [edge.b, (1 - t) * edge.length]]) {
      const path = shortestPath(graph, from!, to!);
      if (path) best = Math.min(best, head! + path.length + tail!);
    }
  }
  return Number.isFinite(best) ? best : undefined;
}

/** A body is a tail-to-nose trail, so the first occupied interval starts at the tail. */
function tailWithin(train: BoardTrain, platform: number, stops: readonly BerthAnchor[], graph: Graph | undefined, clearM: number): boolean {
  const tail = train.occupied?.[0];
  if (!graph || !tail) return false;
  return stops.some((stop) => anchorPlatform(stop) === platform
    && (distanceToStop(train, stop, graph, { edge: tail.edge, t: tail.fromT }) ?? Infinity) < clearM);
}

/** Pure snapshot projection. Pass the previous result to retain dwell and recent departures. */
export function boardRows(trains: readonly BoardTrain[], anchors: AnchorMap, options: BoardOptions = {}): BoardRows {
  const nowMs = options.nowMs ?? 0;
  const mode = options.mode ?? 'live';
  const previous = options.previous?.mode === mode && options.previous.timeMs <= nowMs ? options.previous : undefined;
  const platforms = Array.from({ length: 11 }, (_, platform) => ({ platform, trains: [] as BoardRow[] }));
  const byBerth = new Map(anchors.anchors.map((a) => [a.berth, a]));
  const stops = anchors.anchors.filter((a) => anchorPlatform(a) !== undefined);
  const prior = previous?.platforms.flatMap((p) => p.trains) ?? [];
  const active = trains.filter((t) => t.description !== NOT_A_TRAIN && (t.opacity ?? 1) > 0 && t.state !== 'fading');
  const atPlatform = new Set<number>();
  const approaching: BoardRow[] = [];
  const arrivals = options.arrivals ?? approachPlatforms(anchors);
  for (const train of active) {
    const old = prior.find((r) => r.trainId === train.id);
    const physical = stops.find((a) => coversStop(train, a));
    const lastPlatform = anchorPlatform(byBerth.get(train.lastBerth ?? '')) ?? namedPlatform(train.lastBerth);
    let platform = mode === 'sample' && validPlatform(train.samplePlatform ?? NaN) ? train.samplePlatform
      : physical ? anchorPlatform(physical)
        : (train.speed ?? 0) <= 0.1 && train.state !== 'moving' && train.state !== 'departing' ? lastPlatform : undefined;
    const leaving = train.state === 'departing' || train.exiting === true;
    // Once a train has begun to pull out, the first snapshot's time stands as when it left.
    const leftAt = old?.state === 'departing' ? old.leftAtMs ?? nowMs : nowMs;
    // The body has moved off the stop, but the train is still pulling out alongside its platform (see PLATFORM_CLEAR_M).
    const carried = platform === undefined && old?.platform !== undefined && (leaving || old.state === 'departing')
      && nowMs - leftAt <= (options.leavingMaxMs ?? LEAVING_MAX_MS)
      && tailWithin(train, old.platform, stops, options.graph, options.platformClearM ?? PLATFORM_CLEAR_M);
    if (carried) platform = old!.platform;
    if (platform !== undefined) {
      const departing = leaving || carried;
      const sinceMs = old?.platform === platform ? old.sinceMs ?? nowMs : nowMs;
      const stoodMs = departing && old ? old.stoodMs ?? 0 : Math.max(0, nowMs - sinceMs);
      platforms[platform]!.trains.push({ trainId: train.id, headcode: train.description, platform,
        state: departing ? 'departing' : 'standing', sinceMs, stoodMs, sample: mode === 'sample',
        ...(departing ? { leftAtMs: leftAt } : {}) });
      atPlatform.add(train.id);
      continue;
    }
    if (train.state === 'departing' || train.exiting) continue;
    const target = anchorPlatform(byBerth.get(train.targetBerth ?? '')) ?? namedPlatform(train.targetBerth);
    const candidates = target === undefined ? arrivals.get(train.lastBerth ?? '') : [target];
    if (!candidates?.length) continue;
    const distances = stops.filter((a) => candidates.includes(anchorPlatform(a)!)).map((a) => distanceToStop(train, a, options.graph)).filter((n): n is number => n !== undefined);
    approaching.push({ trainId: train.id, headcode: train.description, state: 'approaching', platforms: [...candidates],
      distanceM: distances.length ? Math.min(...distances) : undefined });
  }
  approaching.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity) || a.trainId - b.trainId);
  // Another train standing on a platform releases any train still pulling out of it.
  for (const p of platforms) {
    if (!p.trains.some((r) => r.state === 'standing')) continue;
    p.trains = p.trains.filter((r) => {
      if (r.state !== 'departing') return true;
      atPlatform.delete(r.trainId);
      return false;
    });
  }
  const departed = new Map((previous?.departed ?? []).map((r) => [r.trainId, { ...r }]));
  for (const old of prior) {
    if (atPlatform.has(old.trainId)) continue;
    const train = active.find((t) => t.id === old.trainId);
    // A cancel/fade is not evidence of departure. A moving body leaving its stop is, and so is a train already pulling out.
    if (train && ((train.speed ?? 0) > 0.1 || train.state === 'departing' || train.exiting) || old.state === 'departing') {
      departed.set(old.trainId, { ...old, headcode: train?.description ?? old.headcode, state: 'leaving',
        leftAtMs: old.state === 'departing' ? old.leftAtMs ?? nowMs : nowMs });
    }
  }
  const retentionMs = options.retentionMs ?? 180_000;
  const leaving = [...departed.values()].filter((r) => !atPlatform.has(r.trainId) && nowMs - r.leftAtMs! <= retentionMs)
    .sort((a, b) => b.leftAtMs! - a.leftAtMs! || a.trainId - b.trainId);
  const timetable = (mode === 'live' || mode === 'replay') && options.services !== undefined;
  const services = timetable ? options.services! : [];
  const priorRows = [...prior, ...(previous?.approaching ?? []), ...(previous?.departed ?? [])];
  const enrich = (row: BoardRow): void => {
    if (!timetable) { row.service = undefined; row.uid = undefined; row.operator = undefined; row.origin = undefined; row.destination = undefined; return; }
    const old = priorRows.find(r => r.trainId === row.trainId && r.headcode === row.headcode)?.service;
    // Once associated, retain this call's identity even when a repeated headcode is closer later.
    const service = old ? services.find(s => sameCall(s, old)) ?? old
      : matchService(row.headcode, nowMs, services) as BoardService | undefined;
    if (!service) return;
    row.service = service; row.uid = service.uid; row.operator = service.operator;
    row.origin = service.originName || service.origin; row.destination = service.destinationName || service.destination;
  };
  for (const row of [...platforms.flatMap(p => p.trains), ...approaching, ...leaving]) enrich(row);
  const due: BoardDue[] = [];
  for (const service of services) {
    if (/^[035]/.test(service.headcode)) continue;
    for (const direction of ['arrival', 'departure'] as const) {
      const publicTime = direction === 'arrival' ? service.publicArrival : service.publicDeparture;
      if (!publicTime) continue;
      const bookedMs = direction === 'arrival' ? service.publicArrivalMs ?? service.arrivalMs : service.publicDepartureMs ?? service.departureMs;
      if (bookedMs !== null && bookedMs >= nowMs && bookedMs <= nowMs + 30 * 60_000) due.push({ service, direction, bookedMs });
    }
  }
  due.sort((a, b) => a.bookedMs - b.bookedMs || a.service.uid.localeCompare(b.service.uid) || a.direction.localeCompare(b.direction));
  return { platforms, approaching, departed: leaving, due: due.slice(0, 8), timetable, timeMs: nowMs, mode };
}

const sameCall = (a: ScheduleCall, b: ScheduleCall): boolean => a.uid === b.uid && a.serviceDate === b.serviceDate && a.date === b.date;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
/** Project explicit TRUST facts; a TD cancel does not cancel a passenger service. */
export function applyBoardTrust(services: readonly BoardService[], event: unknown): BoardService[] {
  const object = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const envelope = object(event), e = object(envelope.e ?? event);
  const cancellation = e.type === 'cancellation' && typeof e.cancelled === 'boolean';
  if (e.kind !== 'trust' || !cancellation && (e.type !== 'movement' || !['ARRIVAL', 'DEPARTURE'].includes(String(e.eventType)))) return [...services];
  let service: BoardService | undefined;
  if (typeof e.uid === 'string' && e.uid) {
    const matches = services.filter(s => s.uid === e.uid && (!e.serviceDate || s.serviceDate === e.serviceDate) && (!e.date || s.date === e.date));
    if (matches.length === 1) service = matches[0];
  } else if (typeof e.headcode === 'string' && finite(e.plannedMs)) {
    const candidates = services.filter(s => (!e.serviceDate || s.serviceDate === e.serviceDate) && (!e.date || s.date === e.date));
    service = matchService(e.headcode, e.plannedMs, candidates) as BoardService | undefined;
  }
  if (!service) return [...services];
  return services.map(s => {
    if (s !== service) return s;
    if (cancellation) {
      const previous = s.realtime?.cancellationUpdatedAtMs ?? (typeof s.realtime?.cancelled === 'boolean' ? s.realtime.updatedAtMs : undefined);
      if (finite(e.receivedAtMs) && finite(previous) && e.receivedAtMs < previous) return s;
      return { ...s, realtime: { ...s.realtime, cancelled: e.cancelled as boolean,
        ...(finite(e.receivedAtMs) ? { cancellationUpdatedAtMs: e.receivedAtMs,
          updatedAtMs: Math.max(s.realtime?.updatedAtMs ?? 0, e.receivedAtMs) } : {}) } };
    }
    if (finite(e.receivedAtMs) && finite(s.realtime?.updatedAtMs) && e.receivedAtMs < s.realtime.updatedAtMs) return s;
    const realtime = { ...s.realtime, eventType: String(e.eventType) };
    if (finite(e.actualMs)) {
      if (e.eventType === 'ARRIVAL') realtime.actualArrivalMs = e.actualMs;
      else realtime.actualDepartureMs = e.actualMs;
    }
    if (finite(e.variationMinutes)) realtime.variationMinutes = e.variationMinutes;
    if (typeof e.platform === 'string' && /^(?:[0-9]|10)$/.test(e.platform)) realtime.platform = e.platform;
    if (typeof e.trainId === 'string') realtime.trainId = e.trainId;
    if (typeof e.matchMethod === 'string') realtime.matchMethod = e.matchMethod;
    if (finite(e.receivedAtMs)) realtime.updatedAtMs = e.receivedAtMs;
    return { ...s, realtime };
  });
}

const escape = (value: string): string => value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const duration = (ms: number): string => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const platformRangeLabel = (values: number[]): string => {
  const sorted = [...new Set(values.filter(validPlatform))].sort((a, b) => a - b);
  if (!sorted.length) return 'TBC';
  const labels: string[] = [];
  let first = sorted[0]!, last = first;
  for (const value of sorted.slice(1)) {
    if (value === last + 1) { last = value; continue; }
    labels.push(first === last ? `P${first}` : `P${first}–P${last}`);
    first = last = value;
  }
  labels.push(first === last ? `P${first}` : `P${first}–P${last}`);
  return labels.join(', ');
};
const platformLabel = (values: number[]): string => {
  const sorted = [...new Set(values.filter(validPlatform))].sort((a, b) => a - b);
  // A fan-out identifies possible routes, not an assigned passenger platform.
  return sorted.length === 1 ? `P${sorted[0]}` : 'TBC';
};
const distanceLabel = (distanceM?: number): string => typeof distanceM === 'number' && Number.isFinite(distanceM) && distanceM >= 0
  ? `${(distanceM / 1000).toFixed(1)} km` : '—';
export function stationName(name: string): string {
  return name.trim().toLocaleLowerCase('en-GB')
    .replace(/(^|[\s(\-/])([a-z])/g, (_match, before: string, letter: string) => before + letter.toUpperCase())
    .replace(/\b([OD])(['’])([a-z])/g, (_match, before: string, apostrophe: string, letter: string) => before + apostrophe + letter.toUpperCase());
}
export function operatorName(code: string): string {
  return ({ GR: 'LNER', GN: 'Great Northern', HT: 'Hull Trains', LD: 'Lumo', GC: 'Grand Central', TL: 'Thameslink' } as Record<string, string>)[code] ?? (code || 'unknown');
}
type Direction = 'arrival' | 'departure';
const clock = (ms: number): string => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);
const rowDirection = (row: BoardRow): Direction => row.service?.departure && (row.state === 'departing' || row.state === 'leaving' || !row.service.arrival) ? 'departure' : 'arrival';
const publicTime = (service: BoardService, direction: Direction): string | null => direction === 'arrival' ? service.publicArrival : service.publicDeparture;
const bookedTime = (service: BoardService, direction: Direction): string =>
  (publicTime(service, direction) ?? (direction === 'arrival' ? service.arrival : service.departure))?.slice(0, 5) ?? '';
const stockCall = (service: BoardService, direction: Direction): boolean => /^[035]/.test(service.headcode) || !publicTime(service, direction);
const stockLabel = 'Not in service (empty stock)';
const cancelled = (service?: BoardService): boolean => !!service && (service.stp === 'C' || (service.realtime?.cancelled ?? service.cancelled) === true);
const placeFor = (service: BoardService, direction: Direction): string => stockCall(service, direction) ? stockLabel
  : direction === 'arrival' ? `from ${stationName(service.originName || service.origin)}` : stationName(service.destinationName || service.destination);
const approachPlace = (row: BoardRow): string => row.service
  ? stockCall(row.service, 'arrival') ? stockLabel : stationName(row.service.originName || row.service.origin) || '—'
  : /^[035]/.test(row.headcode) ? stockLabel : stationName(row.origin ?? '') || '—';
const departurePlace = (row: BoardRow): string => row.service
  ? stockCall(row.service, 'departure') ? stockLabel : stationName(row.service.destinationName || row.service.destination) || '—'
  : /^[035]/.test(row.headcode) ? stockLabel : stationName(row.destination ?? '') || '—';
/** The latest TRUST report's signed variation for this call and direction, once its actual time has been reached. */
const reportedVariation = (service: BoardService, direction: Direction, nowMs: number): number | undefined => {
  const rt = service.realtime;
  const actual = direction === 'arrival' ? rt?.actualArrivalMs : rt?.actualDepartureMs;
  return rt && (!finite(actual) || actual <= nowMs) && (!rt.eventType || rt.eventType === direction.toUpperCase()) && finite(rt.variationMinutes)
    ? rt.variationMinutes : undefined;
};
const actualFact = (service: BoardService, direction: Direction, nowMs: number): string => {
  const actual = direction === 'arrival' ? service.realtime?.actualArrivalMs : service.realtime?.actualDepartureMs;
  return finite(actual) && actual <= nowMs ? `actual ${clock(actual)}` : '';
};
const timeFact = (service: BoardService, direction: Direction, nowMs: number): string => {
  if (cancelled(service)) return `${bookedTime(service, direction)} Cancelled`.trim();
  const minutes = reportedVariation(service, direction, nowMs);
  const variation = minutes === undefined ? '' : minutes === 0 ? 'on time' : `(${minutes > 0 ? '+' : ''}${minutes})`;
  return [bookedTime(service, direction), variation, actualFact(service, direction, nowMs)].filter(Boolean).join(' ');
};
/** The delay label beside a row: words and signed minutes, coloured by class. Cancelled rows colour their own "Cancelled" text instead. */
const delayChip = (service: BoardService | undefined, direction: Direction, nowMs: number): string => {
  const minutes = service && !cancelled(service) ? reportedVariation(service, direction, nowMs) : undefined;
  if (minutes === undefined) return '';
  const cls = delayClass(minutes);
  const text = cls === 'ontime' ? minutes < 0 ? `Early ${minutes}` : 'On time' : `Late +${minutes}`;
  return `<span class="kx-board-delay kx-delay-${cls}">${escape(text)}</span>`;
};
const cancelledClass = (service?: BoardService): string => cancelled(service) ? ' kx-delay-cancelled' : '';
const trainHtml = (row: BoardRow, detail: string, nowMs: number): string => {
  const direction = rowDirection(row), service = row.service;
  const description = service ? `${placeFor(service, direction)} · ${direction === 'arrival' ? 'arr' : 'dep'} ${timeFact(service, direction, nowMs)}`
    : /^[035]/.test(row.headcode) ? stockLabel : [row.booked && `booked ${row.booked}`, row.expected && `expected ${row.expected}`, row.destination].filter(Boolean).join(' · ');
  const operator = service ? operatorName(service.operator) : '';
  const title = [row.headcode, description, operator, detail].filter(Boolean).join(' · ');
  // A train pulling out keeps its platform row in brackets, dimmed; the closing bracket is its own item so a long name cannot hide it.
  const leaving = row.state === 'departing';
  return `<div class="kx-board-train${leaving ? ' kx-board-leaving' : ''}${cancelledClass(service)}" title="${escape(title)}"><strong>${leaving ? '(' : ''}${escape(row.headcode)}</strong>${leaving ? ' ' : ''}<span class="kx-board-description">${escape(description)}</span>${leaving ? '<span class="kx-board-close">)</span>' : ''}${delayChip(service, direction, nowMs)}<span class="kx-board-operator">${escape(operator)}</span><span class="kx-board-state">${escape(cancelled(service) ? 'Cancelled' : detail)}</span></div>`;
};
const approachHtml = (row: BoardRow): string => {
  const candidates = row.platforms ?? [], platform = platformLabel(candidates);
  const platformTooltip = platform === 'TBC' && candidates.length ? `TBC (possible ${platformRangeLabel(candidates)})` : platform;
  const distance = distanceLabel(row.distanceM), place = `${cancelled(row.service) ? 'Cancelled · ' : ''}${approachPlace(row)}`;
  const legacy = row.service ? [] : [row.booked && `booked ${row.booked}`, row.expected && `expected ${row.expected}`, row.destination];
  const title = [`${row.headcode} → ${platformTooltip}`, distance, place, ...legacy].filter(Boolean).join(' · ');
  return `<div class="kx-board-approach${cancelledClass(row.service)}" title="${escape(title)}"><strong>${escape(row.headcode)}</strong><span class="kx-board-arrow">→</span><span>${escape(platform)}</span><span>${escape(distance)}</span><span class="kx-board-route">${escape(place)}</span></div>`;
};
const validClock = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 8.64e15;
const departureClock = (row: BoardRow, nowMs: number): { value: string; source: string } => {
  const actual = row.service?.realtime?.actualDepartureMs;
  return validClock(actual) && actual <= nowMs ? { value: clock(actual), source: 'TRUST actual' }
    : { value: validClock(row.leftAtMs) ? clock(row.leftAtMs) : '—', source: 'Observed' };
};
const departureHtml = (row: BoardRow, nowMs: number): string => {
  const platform = platformLabel(row.platform === undefined ? [] : [row.platform]), time = departureClock(row, nowMs);
  const place = `${cancelled(row.service) ? 'Cancelled · ' : ''}${departurePlace(row)}`;
  const title = [`${row.headcode} ${platform} →`, `${time.source} ${time.value}`, place].join(' · ');
  const chip = delayChip(row.service, 'departure', nowMs);
  return `<div class="kx-board-departure${cancelledClass(row.service)}" title="${escape(title)}"><strong>${escape(row.headcode)}</strong><span>${escape(platform)}</span><span class="kx-board-arrow">→</span><span>${escape(time.value)}</span><span class="kx-board-route">${chip ? `${chip} ` : ''}${escape(place)}</span></div>`;
};

/** Also usable by a later schedule adapter; all feed strings are escaped before insertion. */
export function boardHtml(rows: BoardRows): string {
  const platformRows = rows.platforms.map((p) => `<div class="kx-board-platform"><b>${p.platform}</b><div>${p.trains.length
    ? p.trains.map((r) => trainHtml(r, `${r.state} ${duration(r.stoodMs ?? 0)}${r.sample ? ' · sample' : ''}`, rows.timeMs)).join('') : '<span class="kx-board-empty">empty</span>'}</div></div>`).join('');
  const approaching = rows.approaching.map(approachHtml).join('') || '<p class="kx-board-empty">None observed</p>';
  const departed = rows.departed.map((r) => departureHtml(r, rows.timeMs)).join('') || '<p class="kx-board-empty">None observed in the last 3 minutes</p>';
  const due = rows.due.slice(0, 8).map(({ service, direction }) => {
    const arrival = direction === 'arrival';
    const place = placeFor(service, direction), operator = operatorName(service.operator), time = bookedTime(service, direction);
    const platform = platformLabel(service.platform != null && /^(?:[0-9]|10)$/.test(service.platform.trim()) ? [Number(service.platform)] : []);
    const facts = timeFact(service, direction, rows.timeMs).slice(time.length);
    const actual = actualFact(service, direction, rows.timeMs), chip = delayChip(service, direction, rows.timeMs);
    // A delay label shares its cell with the destination in a flex row, so a long name is cut before the label or its minutes are.
    const flexed = chip !== '';
    const description = cancelled(service) ? escape(`Cancelled · ${place}`)
      : flexed ? [`<span class="kx-board-place">${escape(place)}</span>`, chip, actual && `<span class="kx-board-actual">${escape(actual)}</span>`].filter(Boolean).join(' ')
        : [escape(place), escape(actual)].filter(Boolean).join(' ');
    const title = `${time} ${arrival ? 'arr' : 'dep'} ${service.headcode} ${place}${facts} ${platform} ${operator}`;
    return `<div class="kx-board-due${cancelledClass(service)}" title="${escape(title)}"><span>${escape(time)}</span><span>${arrival ? 'arr' : 'dep'}</span><strong>${escape(service.headcode)}</strong><span class="kx-board-description${flexed ? ' kx-board-with-delay' : ''}">${description}</span><span>${escape(platform)}</span><span class="kx-board-operator">${escape(operator)}</span></div>`;
  }).join('') || '<p class="kx-board-empty">None booked in the next 30 minutes</p>';
  return `<p class="kx-board-note">${rows.mode === 'sample' ? 'Sample, not live · no timetable' : rows.mode === 'none' ? 'Trains hidden · no timetable' : `${rows.mode === 'replay' ? 'Replay' : 'Live'} TD observations · ${rows.timetable ? 'timetable available' : 'no timetable'}`}<br>Dwell measured since observed · simulation time</p><h2>Platforms 0–10</h2>${platformRows}${rows.timetable ? `<h2>Due in next 30 minutes</h2>${due}` : ''}<h2>Approaching</h2>${approaching}<h2>Departed / leaving</h2>${departed}`;
}

/** Fixed overlays share one viewport: reserve the whole HUD, including its attribution. */
export function boardLayout(width: number, height: number, footerTop = height - 88) {
  const top = 52, left = 16;
  const bottom = Math.max(24, height - footerTop + 12);
  return { top, left, width: Math.max(0, Math.min(350, width - 32)), maxHeight: Math.max(0, height - top - bottom), bottom };
}

export function createBoard(parent: HTMLElement, status?: HTMLElement) {
  const doc = parent.ownerDocument, view = doc.defaultView!;
  const root = doc.createElement('aside');
  root.className = 'kx-board'; root.setAttribute('aria-label', 'Station board');
  const style = doc.createElement('style');
  // Eleven single-line platform entries take 275 px; long names retain their full tooltip.
  style.textContent = `.kx-board{position:fixed;top:52px;left:16px;width:350px;max-width:calc(100vw - 32px);max-height:var(--board-height,calc(100dvh - 52px - var(--board-bottom,100px)));min-height:0;overflow:hidden;box-sizing:border-box;display:flex;flex-direction:column;z-index:10;background:var(--panel);color:var(--fg);border:1px solid var(--line);border-radius:6px;font:12px/20px system-ui,sans-serif;backdrop-filter:blur(8px)}
.kx-board button{display:flex;flex-shrink:0;justify-content:space-between;align-items:center;gap:12px;width:100%;border:0;border-radius:6px;background:transparent;color:inherit;padding:9px 12px;font:600 13px/1.4 system-ui,sans-serif;text-align:left;cursor:pointer}.kx-board button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
.kx-board-body{flex:1 1 auto;overflow:auto;overscroll-behavior:contain;min-height:0;min-width:0;box-sizing:border-box;padding:0 12px 10px;line-height:20px}.kx-board-body[hidden]{display:none}.kx-board h2{font-size:12px;margin:8px 0 4px;color:var(--fg)}.kx-board-note,.kx-board-empty{color:var(--muted);margin:2px 0}
.kx-board-platform{display:grid;grid-template-columns:24px minmax(0,1fr);gap:8px;border-top:1px solid var(--line);padding:2px 0;min-height:20px}.kx-board-platform>div{min-width:0}
.kx-board-train{display:flex;align-items:baseline;gap:4px;min-width:0;line-height:20px;font-size:11px;white-space:nowrap}.kx-board-train strong{flex:0 0 32px;font-size:12px;font-variant-numeric:tabular-nums}.kx-board-train span{color:var(--muted)}.kx-board-description{flex:1;min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.kx-board-operator{flex:0 0 auto;max-width:92px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}.kx-board-state{flex:0 1 auto;max-width:84px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.kx-board-approach,.kx-board-departure{display:grid;align-items:baseline;gap:4px;min-width:0;line-height:20px;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}.kx-board-approach{grid-template-columns:32px 12px 56px 56px minmax(0,1fr)}.kx-board-departure{grid-template-columns:32px 28px 12px 42px minmax(0,1fr)}.kx-board-approach strong,.kx-board-departure strong{font-size:12px}.kx-board-approach>span,.kx-board-departure>span{color:var(--muted)}.kx-board-approach .kx-board-arrow,.kx-board-departure .kx-board-arrow{color:var(--fg)}.kx-board-route{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.kx-board-due{display:grid;grid-template-columns:34px 20px 32px minmax(0,1fr) 22px auto;gap:4px;line-height:20px;font-size:11px;white-space:nowrap;font-variant-numeric:tabular-nums}.kx-board-due>span{color:var(--muted)}.kx-board-due strong{font-size:12px}
.kx-board{--kx-ontime:#5fd38d;--kx-late:#f2b84b;--kx-very-late:#ff9955;--kx-cancelled:#ff8080}:root[data-theme="light"] .kx-board{--kx-ontime:#0a5c32;--kx-late:#6f4700;--kx-very-late:#962500;--kx-cancelled:#a8001f}
.kx-board .kx-board-delay{flex:0 0 auto;font-weight:600;white-space:nowrap}.kx-board .kx-delay-ontime{color:var(--kx-ontime)}.kx-board .kx-delay-late{color:var(--kx-late)}.kx-board .kx-delay-very-late{color:var(--kx-very-late);font-weight:700}
.kx-board .kx-delay-cancelled .kx-board-description,.kx-board .kx-delay-cancelled .kx-board-route,.kx-board .kx-delay-cancelled .kx-board-state{color:var(--kx-cancelled)}
.kx-board .kx-board-leaving{font-style:italic}.kx-board .kx-board-leaving strong{flex-basis:38px;font-weight:400;color:var(--muted)}.kx-board .kx-board-leaving .kx-board-close{flex:0 0 auto;margin-left:-3px;color:var(--muted)}.kx-board .kx-board-leaving .kx-board-state{font-style:normal}
.kx-board .kx-board-train:has(.kx-board-delay) .kx-board-operator{max-width:48px}
.kx-board .kx-board-with-delay{display:flex;align-items:baseline;gap:4px}.kx-board .kx-board-with-delay .kx-board-place{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}.kx-board .kx-board-with-delay .kx-board-delay{flex:0 0 auto}.kx-board .kx-board-with-delay .kx-board-actual{flex:0 100 auto;min-width:0;overflow:hidden;text-overflow:ellipsis}`;
  const toggle = doc.createElement('button'); toggle.type = 'button';
  toggle.setAttribute('aria-controls', 'kx-board-content');
  const body = doc.createElement('div'); body.className = 'kx-board-body'; body.id = 'kx-board-content';
  const narrow = view.matchMedia('(max-width: 600px)');
  let collapsed = narrow.matches, chosen = false, html = '', disposed = false;
  const paintToggle = (): void => {
    body.hidden = collapsed;
    toggle.setAttribute('aria-expanded', String(!collapsed));
    toggle.textContent = `Station board ${collapsed ? '▸' : '▾'}`;
  };
  const onToggle = (): void => { chosen = true; collapsed = !collapsed; paintToggle(); };
  const onWidth = (): void => { if (!chosen) { collapsed = narrow.matches; paintToggle(); } };
  const hud = status?.closest('.hud') ?? status ?? doc.querySelector('.hud');
  const resize = (): void => {
    if (disposed) return;
    const viewport = view.visualViewport;
    const bounds = boardLayout(Math.min(view.innerWidth, viewport?.width ?? Infinity),
      Math.min(view.innerHeight, viewport?.height ?? Infinity), hud?.getBoundingClientRect().top);
    root.style.setProperty('--board-bottom', `${bounds.bottom}px`);
    root.style.setProperty('--board-height', `${bounds.maxHeight}px`);
    root.style.setProperty('max-width', `${bounds.width}px`);
  };
  // HUD wrapping and mobile browser chrome can change without a window resize.
  const observer = view.ResizeObserver ? new view.ResizeObserver(resize) : undefined;
  if (hud) observer?.observe(hud);
  toggle.addEventListener('click', onToggle); narrow.addEventListener('change', onWidth);
  root.append(style, toggle, body); parent.append(root); paintToggle(); resize();
  view.addEventListener('resize', resize);
  view.visualViewport?.addEventListener('resize', resize);
  return {
    update(rows: BoardRows): void { const connection = /(?:relay connected|reconnecting|connecting|invalid relay|invalid TRUST)[^·]*/.exec(status?.textContent ?? '')?.[0]?.trim() ?? ''; const next = boardHtml(rows) + (connection ? `<p class="kx-board-note kx-board-connection">${escape(connection)}</p>` : ''); if (next !== html) { body.innerHTML = next; html = next; } resize(); },
    dispose(): void { disposed = true; observer?.disconnect(); toggle.removeEventListener('click', onToggle); narrow.removeEventListener('change', onWidth); view.removeEventListener('resize', resize); view.visualViewport?.removeEventListener('resize', resize); root.remove(); },
  };
}
