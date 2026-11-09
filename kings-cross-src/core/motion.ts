// TD steps are movement authorities, not positions. All distances are metres and time is
// supplied by the caller. A body is a tail-to-nose trail, so a terminus cab change can
// reverse that trail without moving any of the occupied track.
import { NOT_A_TRAIN } from './anchors.ts';
import type { AnchorMap, BerthAnchor } from './anchors.ts';
import type { Pt } from './geo.ts';
import type { Edge, Graph } from './graph.ts';
import { inZone, KINGS_CROSS } from './zones.ts';

export interface MotionEvent {
  kind: string;
  area: string;
  descr?: string;
  from?: string;
  to?: string;
  time?: number | null;
}
export interface TrackPosition { edge: Edge; t: number; point: Pt }
export interface OccupiedTrack { edge: Edge; fromT: number; toT: number }
export interface TrainView {
  /** Physical identity survives a TD description replacement. */
  id: number;
  description: string;
  leading: TrackPosition;
  /** Radians clockwise from north (-z), as in station.ts. */
  heading: number;
  speed: number;
  lengthM: number;
  occupiedLengthM: number;
  occupied: OccupiedTrack[];
  state: 'moving' | 'held' | 'departing' | 'fading' | 'estimated';
  opacity: number;
  targetBerth: string;
  lastBerth: string;
  unmappedBerth?: string;
  blocked: boolean;
  /** Distance travelled by the body; a stationary cab change does not add 260 m. */
  distanceM: number;
  reversals: number;
  exiting?: boolean;
}
export interface MotionBirth { id: number; timeMs: number }
/** Modelled cab-to-buffer gap; infrastructure anchors remain at the physical stop. */
export const DEFAULT_BUFFER_CLEARANCE_M = 3;
export interface MotionOptions {
  /** Resolve once per physical birth, including queued trains, never on a rename. */
  lengthM?: number | ((description: string, birth: MotionBirth) => number);
  acceleration?: number;
  braking?: number;
  defaultSpeedMps?: number;
  stationSpeedMps?: number;
  gapM?: number;
  /** Modelled nose clearance from a platform's buffer anchor; the tail follows lengthM. */
  bufferClearanceM?: number;
  quietMs?: number;
  fadeSeconds?: number;
  /** Graph strips rail tags. Supply OSM maxspeed strings keyed by rail way id. */
  wayMaxspeed?: ReadonlyMap<number, string>;
  /** Previously observed chains, with optional millisecond times for residence medians.
   * Live learns incrementally; callers must not preload a replay's future events. */
  observedSteps?: readonly Pick<MotionEvent, 'kind' | 'area' | 'from' | 'to' | 'descr' | 'time'>[];
  /** Disable only for comparison with the previous, anchor-only motion policy. */
  estimatedMotion?: boolean;
}
export interface MotionIssue { kind: 'unroutable' | 'reversal' | 'vanished' | 'queued' | 'renamed' | 'exiting' | 'entering' | 'merged'; description: string; berth: string; reason: string; previousDescription?: string }
interface Segment { edge: Edge; fromT: number; toT: number }
interface Train {
  lengthM: number;
  description: string; pos: TrackPosition; dir: number; body: Segment[]; route: Segment[];
  speed: number; target: BerthAnchor; lastBerth: string; lastSeen: number;
  unmapped?: string; pendingTarget?: BerthAnchor; fadeAt?: number;
  departing: boolean; blocked: boolean; distanceM: number; reversals: number;
  authority: number;
  id: number; exiting: boolean; pendingExit: boolean; routeOrigin: string;
  pendingRename?: { description: string; berth: string; kind: string };
  estimated?: boolean; estimateSpeed?: number; awaitingAnchor?: string;
}
interface MergeReservation { edge: Edge; winner: Train; yieldStop: number; releaseAt: number }
interface Meeting { selfAuthority: number; otherAuthority: number; stop: number }
const EPS = 1e-8;
const size = (s: Segment): number => Math.abs(s.toT - s.fromT) * s.edge.length;
const direction = (s: Segment): number => Math.sign(s.toT - s.fromT);
const sameEdge = (a: Edge, b: Edge): boolean => a === b;

/** OSM numbers without a unit mean km/h. Compound/directional tags use their lowest value. */
export function maxspeedMps(tag: string | undefined, fallback = 40 / 3.6): number {
  if (!tag) return fallback;
  const values = tag.split(';').map((s) => {
    const m = /^\s*(\d+(?:\.\d+)?)\s*(mph|km\/h|kph)?\s*$/i.exec(s);
    return m && Number(m[1]) > 0 ? Number(m[1]) * (m[2]?.toLowerCase() === 'mph' ? 0.44704 : 1 / 3.6) : fallback;
  });
  return Math.min(...values);
}

/** Positive shared length on exactly the same graph edge (crossing tracks do not collide). */
export function overlapM(a: OccupiedTrack[], b: OccupiedTrack[]): number {
  let total = 0;
  for (const x of a) for (const y of b) {
    if (!sameEdge(x.edge, y.edge)) continue;
    total += Math.max(0, Math.min(Math.max(x.fromT, x.toT), Math.max(y.fromT, y.toT)) - Math.max(Math.min(x.fromT, x.toT), Math.min(y.fromT, y.toT))) * x.edge.length;
  }
  return total;
}

export function createMotion(graph: Graph, anchors: AnchorMap, opts: MotionOptions = {}) {
  // Modelling defaults, not a timetable inference: 9-car length, restrained approach speed,
  // and service rather than emergency braking. Short consists can pass lengthM: 130.
  const lengthOption = opts.lengthM ?? 260;
  const lengthFor = (description: string, birth: MotionBirth): number => {
    const length = typeof lengthOption === 'function' ? lengthOption(description, birth) : lengthOption;
    if (!Number.isFinite(length) || length <= 0) throw new Error('motion train length must be finite and positive');
    return length;
  };
  const acceleration = opts.acceleration ?? 0.7;
  const braking = opts.braking ?? 0.6;
  const defaultSpeed = opts.defaultSpeedMps ?? 40 / 3.6;
  const stationSpeed = opts.stationSpeedMps ?? 25 / 3.6;
  const gap = opts.gapM ?? 5;
  const bufferClearance = opts.bufferClearanceM ?? DEFAULT_BUFFER_CLEARANCE_M;
  const quietMs = opts.quietMs ?? 20 * 60_000;
  const fadeSeconds = opts.fadeSeconds ?? 5;
  const estimates = opts.estimatedMotion !== false;
  for (const n of [typeof lengthOption === 'function' ? 260 : lengthOption, acceleration, braking, defaultSpeed, stationSpeed, quietMs, fadeSeconds]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error('motion options must be finite and positive');
  }
  if (!Number.isFinite(gap) || gap < 0) throw new Error('motion gap must be finite and nonnegative');
  if (!Number.isFinite(bufferClearance) || bufferClearance < 0) throw new Error('motion buffer clearance must be finite and nonnegative');
  let now = 0;
  let started = false;
  let lastAreaActivity = -Infinity;
  const berthOwners = new Map<string, string>();
  // A quiet description can still be standing at a red signal or boarding. Only an
  // idle area (or loss of its recorded berth) makes the quiet timeout stale evidence.
  const replacementObserved = (t: Train): boolean => Boolean(t.pendingRename &&
    berthOwners.get(t.pendingRename.berth) === t.pendingRename.description);
  const observedAtTarget = (t: Train): boolean => anchorMap.has(t.target.berth) &&
    berthOwners.get(t.target.berth) === t.description;
  const quietExpired = (t: Train): boolean => now - t.lastSeen >= quietMs &&
    !(now - lastAreaActivity < quietMs && ([...berthOwners.values()].includes(t.description) || replacementObserved(t)));
  const active = new Map<string, Train>();
  const queued = new Map<string, Train>();
  const pendingNames = new Map<string, Train>();
  const issues: MotionIssue[] = [];
  const meetings = new Map<Train, Map<Train, Meeting>>();
  const merges = new Map<Train, Map<Train, MergeReservation>>();
  const anchorMap = new Map(anchors.anchors.map((a) => [a.berth, a]));
  let nextId = 1;
  const chains = new Map<string, Map<string, Set<string>>>();
  const witnesses = new Map<string, Map<string, Set<string>>>();
  const residences = new Map<string, number[]>();
  const lastObservation = new Map<string, { berth: string; at: number }>();
  const outside = new Set(anchors.unmapped.filter((u) => u.reason === 'outside-network').map((u) => u.berth));
  const turns = new Map<string, Map<Edge, number>>();
  const rememberStep = (event: Pick<MotionEvent, 'kind' | 'area' | 'from' | 'to' | 'descr' | 'time'>, at = event.time): void => {
    if (event.kind !== 'step' || event.area !== anchors.area || event.descr === NOT_A_TRAIN || !event.from || !event.to) return;
    const name = event.descr ?? '';
    if (!chains.has(name)) chains.set(name, new Map());
    const chain = chains.get(name)!;
    if (!chain.has(event.from)) chain.set(event.from, new Set());
    chain.get(event.from)!.add(event.to);
    if (!witnesses.has(event.from)) witnesses.set(event.from, new Map());
    const pairs = witnesses.get(event.from)!;
    if (!pairs.has(event.to)) pairs.set(event.to, new Set());
    if (name) pairs.get(event.to)!.add(name);
    const previous = lastObservation.get(name);
    if (name && at !== undefined && at !== null && Number.isFinite(at)) {
      if (previous?.berth === event.from && at > previous.at && at - previous.at <= 600_000) {
        const key = `${event.from}\0${event.to}`;
        if (!residences.has(key)) residences.set(key, []);
        residences.get(key)!.push((at - previous.at) / 1000);
      }
      lastObservation.set(name, { berth: event.to, at });
    }
  };
  for (const event of opts.observedSteps ?? []) rememberStep(event);
  const anchoredAhead = (berth: string, description: string): BerthAnchor | undefined => {
    const queue = [berth], seen = new Set(queue);
    const found = new Map<string, BerthAnchor>();
    for (let i = 0; i < queue.length; i++) for (const next of [...chains.get(description)?.get(queue[i]!) ?? [], ...chains.get('')?.get(queue[i]!) ?? []]) {
      const a = anchorMap.get(next);
      if (a) found.set(a.berth, a);
      else if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
    // A shared approach may lead to several platforms. An arbitrary first result would
    // commit an unseen arrival to the wrong track before its own next anchor is known.
    if (found.size) return found.size === 1 ? found.values().next().value : undefined;
    if (!estimates || outside.has(berth)) return;
    // Other trains establish a common running line, never a particular platform. Require
    // two descriptions on every link and refuse unresolved branches, including dead ends.
    const shared = [berth], visited = new Set(shared), candidates = new Map<string, BerthAnchor>();
    for (let i = 0; i < shared.length; i++) {
      const links = witnesses.get(shared[i]!);
      if (!links?.size || [...links.values()].some((names) => names.size < 2)) return;
      for (const next of links.keys()) {
        if (outside.has(next)) return;
        const a = anchorMap.get(next);
        if (a) { if (a.platform !== undefined) return; candidates.set(next, a); }
        else if (!visited.has(next)) { visited.add(next); shared.push(next); }
      }
    }
    return candidates.size === 1 ? candidates.values().next().value : undefined;
  };
  const typicalSeconds = (berth: string, target: string): number | undefined => {
    const queue = [{ berth, seconds: 0 }], seen = new Set([berth]);
    for (let i = 0; i < queue.length; i++) {
      const here = queue[i]!;
      if (here.berth === target) return here.seconds > 0 ? here.seconds : undefined;
      for (const next of witnesses.get(here.berth)?.keys() ?? []) {
        const samples = residences.get(`${here.berth}\0${next}`);
        if (!samples?.length || seen.has(next)) continue;
        const sorted = [...samples].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
        const median = sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
        seen.add(next); queue.push({ berth: next, seconds: here.seconds + median });
      }
    }
  };
  const point = (edge: Edge, t: number): TrackPosition => {
    const a = graph.pos.get(edge.a)!;
    const b = graph.pos.get(edge.b)!;
    return { edge, t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
  };
  const anchorPlacement = (a: BerthAnchor): { pos: TrackPosition; dir: number } | undefined => {
    const e = graph.edges.find((e) => (e.a === a.from && e.b === a.to) || (e.b === a.from && e.a === a.to));
    if (!e || !(a.t >= 0 && a.t <= 1) || e.length <= 0) return;
    const pos = point(e, e.a === a.from ? a.t : 1 - a.t), dir = e.a === a.from ? 1 : -1;
    if (a.platform === undefined || bufferClearance === 0) return { pos, dir };
    // Buffer anchors locate the infrastructure, not the driver's stopping point.
    // Walk back on rail: a short terminal edge may end before the full clearance.
    const trail = continuation(pos, -dir, bufferClearance), last = trail.at(-1);
    return last ? { pos: point(last.edge, last.toT), dir: -direction(last) } : { pos, dir };
  };
  const locate = (a: BerthAnchor): TrackPosition | undefined => anchorPlacement(a)?.pos;
  const issue = (t: Train, berth: string, reason: string): void => {
    issues.push({ kind: 'unroutable', description: t.description, berth, reason });
  };
  const append = (list: Segment[], s: Segment): void => {
    if (size(s) <= EPS) return;
    const last = list.at(-1);
    if (last && sameEdge(last.edge, s.edge) && Math.abs(last.toT - s.fromT) < EPS && direction(last) === direction(s)) last.toT = s.toT;
    else list.push({ ...s });
  };
  // Choose the straightest continuation behind a newly observed train. The TD feed has
  // no tail location. Clip at a graph boundary rather than inventing off-track coaches.
  const continuation = (pos: TrackPosition, dir: number, lengthM = Infinity, origin = '', excluded: Set<Edge> = new Set()): Segment[] => {
    const used = new Set(excluded); used.delete(pos.edge);
    const walk = (edge: Edge, at: number, d: number, left: number): Segment[] | null => {
      if (used.has(edge)) return null;
      used.add(edge);
      const end = d > 0 ? 1 : 0;
      const take = Math.min(left, Math.abs(end - at) * edge.length);
      const to = at + d * take / edge.length;
      const prefix: Segment[] = []; append(prefix, { edge, fromT: at, toT: to });
      if (left - take <= EPS) { used.delete(edge); return prefix; }
      const node = d > 0 ? edge.b : edge.a;
      const p = graph.pos.get(node)!;
      const prev = graph.pos.get(d > 0 ? edge.a : edge.b)!;
      const score = (e: Edge): number => {
        const q = graph.pos.get(e.a === node ? e.b : e.a)!;
        return ((p[0] - prev[0]) * (q[0] - p[0]) + (p[1] - prev[1]) * (q[1] - p[1])) / e.length;
      };
      const onward = (graph.adj.get(node) ?? []).filter((e) => e !== edge && e.length > 0);
      const candidates = onward.filter((e) => !used.has(e) && score(e) >= -EPS).sort((x, y) => {
        const history = turns.get(`${origin}:${node}:${edge.a}:${edge.b}`);
        return (history?.get(y) ?? 0) - (history?.get(x) ?? 0) || score(y) - score(x) || x.wayId - y.wayId || x.a - y.a || x.b - y.b;
      });
      // A buffer in the station is not an external entry/exit. Backtrack to the next
      // straightest branch if a preferred continuation ends at a stub or a hairpin.
      const stationBuffer = !Number.isFinite(lengthM) && anchors.anchors.some((a) => a.platform !== undefined && Math.hypot(p[0] - a.point[0], p[1] - a.point[1]) < 15);
      if (!onward.length && !stationBuffer) { used.delete(edge); return prefix; }
      for (const next of candidates) {
        const result = walk(next, next.a === node ? 0 : 1, next.a === node ? 1 : -1, left - take);
        if (result) { used.delete(edge); return [...prefix, ...result]; }
      }
      used.delete(edge);
      return Number.isFinite(lengthM) ? prefix : null;
    };
    return walk(pos.edge, pos.t, dir, lengthM) ?? [];
  };
  const initialBody = (pos: TrackPosition, dir: number, lengthM: number): Segment[] => continuation(pos, -dir, lengthM).reverse().map((s) => ({ edge: s.edge, fromT: s.toT, toT: s.fromT }));
  const edgeIds = new Map(graph.edges.map((e, i) => [e, i]));
  const forwardTurn = (incoming: Edge, inDir: number, outgoing: Edge, outDir: number): boolean => {
    const a = graph.pos.get(incoming.a)!, b = graph.pos.get(incoming.b)!;
    const c = graph.pos.get(outgoing.a)!, d = graph.pos.get(outgoing.b)!;
    return ((b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1])) * inDir * outDir >= -EPS;
  };
  const routeTo = (t: Train, a: BerthAnchor): Segment[] | null => {
    const target = locate(a);
    if (!target) return null;
    const start = t.pos;
    if (sameEdge(start.edge, target.edge) && (target.t - start.t) * t.dir >= -EPS) {
      return Math.abs(target.t - start.t) < EPS ? [] : [{ edge: start.edge, fromT: start.t, toT: target.t }];
    }
    const endT = t.dir > 0 ? 1 : 0;
    const endNode = t.dir > 0 ? start.edge.b : start.edge.a;
    // A route cannot double back through its own coaches, including immediately returning
    // along the starting edge. All subsequent TD targets still start at the actual nose.
    const excluded = new Set(t.body.map((s) => s.edge));
    excluded.add(start.edge);
    let best: Segment[] | null = null;
    let bestLength = Infinity;
    const initial: Segment = { edge: start.edge, fromT: start.t, toT: endT };
    const open = [{ node: endNode, via: start.edge, dir: t.dir, route: size(initial) > EPS ? [initial] : [], distance: size(initial) }];
    const seen = new Map<string, number>();
    // Direction is part of the search state. Node-only shortest paths can turn 180 degrees
    // through a crossover, which is a reversal even though they use different graph edges.
    while (open.length) {
      open.sort((a, b) => b.distance - a.distance || b.node - a.node || edgeIds.get(b.via)! - edgeIds.get(a.via)!);
      const item = open.pop()!;
      const key = `${item.node}:${edgeIds.get(item.via)}`;
      if (item.distance >= (seen.get(key) ?? Infinity) || item.distance >= bestLength) continue;
      seen.set(key, item.distance);
      if (item.node === target.edge.a || item.node === target.edge.b) {
        const last: Segment = { edge: target.edge, fromT: item.node === target.edge.a ? 0 : 1, toT: target.t };
        if (size(last) < EPS || (!excluded.has(last.edge) && forwardTurn(item.via, item.dir, last.edge, direction(last)))) {
          const segments = item.route.map((s) => ({ ...s })); append(segments, last);
          const len = item.distance + size(last);
          if (len < bestLength) { best = segments; bestLength = len; }
        }
      }
      for (const e of graph.adj.get(item.node) ?? []) {
        const dir = e.a === item.node ? 1 : -1;
        if (excluded.has(e) || e === item.via || e.length <= EPS || !forwardTurn(item.via, item.dir, e, dir)) continue;
        open.push({ node: dir > 0 ? e.b : e.a, via: e, dir, route: [...item.route, { edge: e, fromT: dir > 0 ? 0 : 1, toT: dir > 0 ? 1 : 0 }], distance: item.distance + e.length });
      }
    }
    return best;
  };
  // Opposing authorities can end inside a short common edge while both bodies are
  // still on different approaches. Distances to any common reference add to the
  // nose-to-nose separation, so the existing fixed meeting can reserve braking early.
  const opposingClearance = (route: Segment[], other: Train): number => {
    let ownAlong = 0;
    for (const s of route) {
      let otherAlong = 0;
      for (const b of other.route) {
        const lo = Math.max(Math.min(s.fromT, s.toT), Math.min(b.fromT, b.toT));
        const hi = Math.min(Math.max(s.fromT, s.toT), Math.max(b.fromT, b.toT));
        if (s.edge === b.edge && direction(s) !== direction(b) && hi - lo > EPS) {
          const reference = (lo + hi) / 2;
          return Math.max(0, ownAlong + otherAlong +
            (Math.abs(reference - s.fromT) + Math.abs(reference - b.fromT)) * s.edge.length - gap);
        }
        otherAlong += size(b);
      }
      ownAlong += size(s);
    }
    return Infinity;
  };
  // Reserve a future convergence before either nose reaches the shared edge. Body-only
  // clearance sees the conflict too late to service brake on separate incoming lines.
  const mergePlan = (t: Train, route: Segment[], other: Train): MergeReservation | null | undefined => {
    let ownAlong = 0;
    for (let i = 0; i < route.length; i++) {
      const s = route[i]!;
      let otherAlong = 0;
      for (let j = 0; j < other.route.length; j++) {
        const b = other.route[j]!;
        if (s.edge === b.edge && direction(s) === direction(b) &&
          Math.min(Math.max(s.fromT, s.toT), Math.max(b.fromT, b.toT)) -
          Math.max(Math.min(s.fromT, s.toT), Math.min(b.fromT, b.toT)) > EPS) {
          // Both noses already on this line, or a shared incoming edge: ordinary following.
          if ((i === 0 && j === 0) || (i > 0 && j > 0 && route[i - 1]!.edge === other.route[j - 1]!.edge)) return;
          const entry = direction(s) > 0 ? 0 : 1;
          const ownEntry = ownAlong - Math.abs(s.fromT - entry) * s.edge.length;
          const otherEntry = otherAlong - Math.abs(b.fromT - entry) * b.edge.length;
          const ownCanStop = ownEntry - gap + EPS >= t.speed * t.speed / (2 * braking);
          const otherCanStop = otherEntry - gap + EPS >= other.speed * other.speed / (2 * braking);
          const previous = merges.get(t)?.get(other);
          let winner: Train;
          if (i === 0) winner = t;
          else if (j === 0) winner = other;
          else if (previous?.edge === s.edge) winner = previous.winner;
          else if (!ownCanStop && !otherCanStop) return null;
          else if (!ownCanStop) winner = t;
          else if (!otherCanStop) winner = other;
          else winner = t.description < other.description ? t : other;
          const loser = winner === t ? other : t;
          const yieldStop = loser.distanceM + (winner === t ? otherEntry : ownEntry) - gap;
          const releaseAt = winner.distanceM + (winner === t ? ownEntry : otherEntry) + winner.lengthM + gap;
          if (winner.distanceM < releaseAt - EPS && yieldStop - loser.distanceM + EPS < loser.speed * loser.speed / (2 * braking)) return null;
          return { edge: s.edge, winner, yieldStop, releaseAt };
        }
        otherAlong += size(b);
      }
      ownAlong += size(s);
    }
  };
  const reserveMerge = (t: Train, other: Train, reservation: MergeReservation): void => {
    if (!merges.has(t)) merges.set(t, new Map());
    if (!merges.has(other)) merges.set(other, new Map());
    merges.get(t)!.set(other, reservation); merges.get(other)!.set(t, reservation);
  };
  const setTarget = (t: Train, a: BerthAnchor, route = routeTo(t, a)): boolean => {
    if (!route) { issue(t, a.berth, 'no forward graph path'); return false; }
    if (route.reduce((sum, s) => sum + size(s), 0) + EPS < t.speed * t.speed / (2 * braking)) {
      issue(t, a.berth, 'target is inside service braking distance'); return false;
    }
    const reservations: [Train, MergeReservation][] = [];
    for (const other of active.values()) if (other !== t) {
      if (clearance(t, other, route) + EPS < t.speed * t.speed / (2 * braking)) {
        issue(t, a.berth, 'occupied route is inside service braking distance'); return false;
      }
      if (opposingClearance(route, other) + EPS < (t.speed * t.speed + other.speed * other.speed) / (2 * braking)) {
        issue(t, a.berth, 'opposing authority is inside service braking distance'); return false;
      }
      const reservation = mergePlan(t, route, other);
      if (reservation === null) { issue(t, a.berth, 'merge conflict is inside service braking distance'); return false; }
      if (reservation) reservations.push([other, reservation]);
    }
    // A changed authority can withdraw from a merge. Retain only reservations on its
    // accepted route; queued bodies reserve nothing until they become visible.
    merges.delete(t);
    for (const pairs of merges.values()) pairs.delete(t);
    if (active.get(t.description) === t) for (const [other, reservation] of reservations) reserveMerge(t, other, reservation);
    t.route = route; t.target = a; t.authority++; t.exiting = false; t.pendingExit = false; delete t.unmapped;
    return true;
  };
  const reverseAtPlatform = (t: Train, a: BerthAnchor, route?: Segment[]): void => {
    const platformBerth = t.target.berth;
    const oldBody = t.body;
    const oldPos = t.pos, oldDir = t.dir;
    t.body = oldBody.slice().reverse().map((s) => ({ edge: s.edge, fromT: s.toT, toT: s.fromT }));
    const nose = t.body.at(-1);
    if (nose) { t.pos = point(nose.edge, nose.toT); t.dir = direction(nose); }
    else t.dir = -t.dir;
    if (setTarget(t, a, route)) {
      t.departing = true; t.reversals++;
      issues.push({ kind: 'reversal', description: t.description, berth: platformBerth, reason: 'stationary platform cab change' });
    } else { t.body = oldBody; t.pos = oldPos; t.dir = oldDir; }
  };
  const requestTarget = (t: Train, a: BerthAnchor): void => {
    t.pendingExit = false;
    const target = locate(a), platform = locate(t.target);
    const sameStop = target && platform && target.edge === platform.edge && Math.abs(target.t - platform.t) < EPS;
    if (t.target.platform !== undefined && !sameStop) {
      if (t.route.length) t.pendingTarget = a; // TD can report departure before the rendered arrival.
      else reverseAtPlatform(t, a);
    } else if (sameStop && t.target.platform !== undefined) {
      if (a.platform !== undefined) t.target = a; // Keep platform evidence for unlabelled aliases.
    } else if (setTarget(t, a)) { delete t.awaitingAnchor; delete t.estimateSpeed; }
  };
  const estimateToward = (t: Train, a: BerthAnchor, berth: string): void => {
    // A late unplaced step must not shorten authority already granted by this train's
    // earlier mapped step. Finish that arrival continuously, as with a deferred departure.
    if (!t.awaitingAnchor && t.target.berth === a.berth) return;
    const route = routeTo(t, a);
    if (!route?.length) return;
    const distance = route.reduce((n, s) => n + size(s), 0);
    // This is movement on a known route, not a new berth placement. Keep at least 25 m
    // (or the anchor's own error) in reserve until this train actually steps to the anchor.
    const reserve = Math.max(25, a.errorM);
    if (distance <= reserve) return;
    let left = distance - reserve;
    const shortened: Segment[] = [];
    for (const s of route) {
      const take = Math.min(left, size(s));
      append(shortened, { ...s, toT: s.fromT + direction(s) * take / s.edge.length });
      left -= take; if (left <= EPS) break;
    }
    const end = shortened.at(-1);
    // At the reserve, roundoff can leave a positive sub-EPS remainder that append
    // deliberately drops. No usable extension means retain the current authority/pose.
    if (!end) return;
    const dir = direction(end), pos = point(end.edge, end.toT);
    const stop: BerthAnchor = { ...a, platform: undefined, kind: 'inferred', from: dir > 0 ? end.edge.a : end.edge.b, to: dir > 0 ? end.edge.b : end.edge.a,
      t: dir > 0 ? pos.t : 1 - pos.t, point: pos.point, evidence: 'estimated approach: held short pending this train’s mapped step' };
    if (!setTarget(t, stop, shortened)) return; t.estimated = true; t.awaitingAnchor = a.berth; t.unmapped = berth;
    const seconds = typicalSeconds(berth, a.berth);
    if (seconds) t.estimateSpeed = distance / seconds;
  };
  const requestExit = (t: Train): void => {
    if (t.exiting || t.pendingExit) return;
    if (t.target.platform !== undefined && t.route.length) { t.pendingExit = true; return; }
    const platform = t.target.platform !== undefined;
    const tail = t.body[0];
    const prefix = platform ? [] : t.route.map((s) => ({ ...s }));
    const authorityEnd = prefix.at(-1);
    const start = authorityEnd ? point(authorityEnd.edge, authorityEnd.toT) : platform && tail ? point(tail.edge, tail.fromT) : t.pos;
    const dir = authorityEnd ? direction(authorityEnd) : platform ? tail ? -direction(tail) : -t.dir : t.dir;
    // TD can step beyond the last anchor while the animation is still approaching it.
    // Finish that established route before choosing a continuation at its far end.
    const onward = continuation(start, dir, Infinity, t.routeOrigin || t.target.berth, new Set([...t.body, ...prefix].map((s) => s.edge)));
    const route = prefix;
    for (const s of onward) append(route, s);
    const last = route.at(-1);
    if (!onward.length && !(Math.abs(start.t - (dir > 0 ? 1 : 0)) < EPS && (graph.adj.get(dir > 0 ? start.edge.b : start.edge.a)?.length ?? 0) === 1 && !platform)) {
      issue(t, t.unmapped ?? t.lastBerth, 'no forward external graph boundary'); return;
    }
    const end = last ? point(last.edge, last.toT) : start;
    const endDir = last ? direction(last) : dir;
    const stop: BerthAnchor = { berth: t.unmapped ?? t.lastBerth, kind: 'inferred', from: endDir > 0 ? end.edge.a : end.edge.b, to: endDir > 0 ? end.edge.b : end.edge.a,
      t: endDir > 0 ? end.t : 1 - end.t, point: end.point, errorM: 0, evidence: 'unmapped chain: continue to graph boundary' };
    const missing = t.unmapped;
    if (platform) reverseAtPlatform(t, stop, route);
    else if (!setTarget(t, stop, route)) return;
    if (t.target === stop) {
      // Keep the chosen continuation, rather than taking a different shortest branch.
      t.route = route; t.exiting = true; t.departing = true; t.unmapped = missing;
      if (estimates) {
        t.estimated = true; delete t.awaitingAnchor;
        // Platform residence is boarding time, not evidence of departure speed.
        const seconds = anchorMap.get(t.routeOrigin)?.platform === undefined ? typicalSeconds(t.routeOrigin, t.lastBerth) : undefined;
        if (seconds) t.estimateSpeed = route.reduce((n, s) => n + size(s), 0) / seconds;
      }
      issues.push({ kind: 'exiting', description: t.description, berth: t.lastBerth, reason: 'no anchored successor on observed chain' });
    }
  };
  // Distance to the first occupied interval in the remaining route.
  const clearance = (t: Train, other: Train, route = t.route): number => {
    let along = 0;
    for (const s of route) {
      const lo = Math.min(s.fromT, s.toT), hi = Math.max(s.fromT, s.toT), dir = direction(s);
      for (const b of other.body) {
        if (b.edge !== s.edge) continue;
        const blo = Math.min(b.fromT, b.toT), bhi = Math.max(b.fromT, b.toT);
        if (bhi < lo - EPS || blo > hi + EPS) continue;
        const hit = dir > 0 ? Math.max(lo, blo) : Math.min(hi, bhi);
        return Math.max(0, along + Math.abs(hit - s.fromT) * s.edge.length - gap);
      }
      along += size(s);
    }
    return Infinity;
  };
  const canSpawn = (t: Train): boolean => {
    for (const other of active.values()) {
      if (overlapM(t.body, other.body) > EPS) return false;
      // Do not insert a stationary obstacle inside a visible train's braking envelope.
      if (clearance(other, t) < other.speed * other.speed / (2 * braking) + other.speed * 0.1 + EPS) return false;
    }
    return true;
  };
  const spawn = (description: string, a: BerthAnchor): Train | undefined => {
    const placement = anchorPlacement(a), pos = placement?.pos;
    if (!pos) { issues.push({ kind: 'unroutable', description, berth: a.berth, reason: 'anchor has no valid graph edge' }); return; }
    const dir = placement!.dir;
    const id = nextId++;
    const lengthM = lengthFor(description, { id, timeMs: now });
    const t: Train = { description, lengthM, pos, dir, body: initialBody(pos, dir, lengthM), route: [], speed: 0, target: a, lastBerth: a.berth, lastSeen: now, departing: false, blocked: false, distanceM: 0, reversals: 0, authority: 0,
      id, exiting: false, pendingExit: false, routeOrigin: a.berth };
    if (canSpawn(t)) active.set(description, t);
    else {
      queued.set(description, t);
      issues.push({ kind: 'queued', description, berth: a.berth, reason: 'initial body or braking envelope occupied' });
    }
    return t;
  };
  const rename = (t: Train, description: string, berth: string, kind: string): void => {
    const oldName = t.description;
    const duplicate = active.get(description);
    if (t.pendingRename) pendingNames.delete(t.pendingRename.description);
    active.delete(oldName); queued.delete(description); pendingNames.delete(description);
    if (duplicate && duplicate !== t) {
      // A departure can be interposed before its arrival even enters the model. Once TD
      // joins those observations in one berth, keep the standing body. Retire the extra
      // observation with a fade, preserving its id and position throughout the fade.
      if (duplicate.pendingRename) pendingNames.delete(duplicate.pendingRename.description);
      delete duplicate.pendingRename; delete duplicate.pendingTarget; duplicate.pendingExit = false;
      duplicate.description = oldName; duplicate.fadeAt = now;
      active.set(oldName, duplicate);
      issues.push({ kind: 'merged', description, previousDescription: oldName, berth, reason: 'previously separate observations joined in one occupied berth' });
    }
    t.description = description; t.lastSeen = now; delete t.pendingRename;
    active.set(description, t);
    issues.push({ kind: 'renamed', description, previousDescription: oldName, berth, reason: kind });
  };
  const apply = (event: MotionEvent, nowMs: number, observedAtMs = nowMs): void => {
    if (!Number.isFinite(observedAtMs)) throw new Error('observation time must be finite');
    if (!Number.isFinite(nowMs)) throw new Error('motion time must be finite');
    if (!started) { now = nowMs; started = true; } else now = Math.max(now, nowMs);
    if (event.area === anchors.area && ['snapshot', 'sclass', 'step', 'interpose', 'cancel', 'heartbeat'].includes(event.kind)) {
      lastAreaActivity = now;
      // The shared feed validates complete snapshots before motion receives them.
      const picture = (event as MotionEvent & { berths?: Readonly<Record<string, string>> }).berths;
      if (event.kind === 'snapshot' && picture) {
        berthOwners.clear();
        for (const [berth, owner] of Object.entries(picture)) berthOwners.set(berth, owner);
      }
      if (event.kind === 'step' && event.from) berthOwners.delete(event.from);
      if ((event.kind === 'step' || event.kind === 'interpose') && event.to && event.descr) berthOwners.set(event.to, event.descr);
      if (event.kind === 'cancel' && event.descr) for (const [berth, owner] of berthOwners) {
        // CB removes one berth, not every mirrored observation of that headcode.
        // An empty origin is the reconciler's authoritative whole-picture removal.
        if (owner === event.descr && (!event.from || event.from === berth)) berthOwners.delete(berth);
      }
    }
    if (event.area !== anchors.area || !event.descr || event.descr === NOT_A_TRAIN) return;
    const description = event.descr;
    let t = active.get(description) ?? queued.get(description) ?? pendingNames.get(description);
    if (event.kind === 'cancel') {
      // A reconnect can remove the arrival name while its evidenced replacement
      // is waiting for the animated body to reach the platform. That is still
      // one physical train. A removed mirror likewise cannot cancel its main berth.
      const replacementPresent = t && replacementObserved(t);
      const cancelledAnchor = anchorMap.get(event.from ?? '');
      const cancelledStop = cancelledAnchor && locate(cancelledAnchor), targetStop = t && locate(t.target);
      const samePhysicalStop = cancelledStop && targetStop && cancelledStop.edge === targetStop.edge &&
        Math.abs(cancelledStop.t - targetStop.t) < EPS;
      if (t && ((!samePhysicalStop && observedAtTarget(t)) || replacementPresent)) {
        if (t.pendingRename?.description === description && !replacementPresent) {
          pendingNames.delete(description); delete t.pendingRename;
        }
        return;
      }
      lastObservation.delete(description);
      if (queued.has(description)) queued.delete(description);
      // A feed observation can precede the latest rendered frame. Its five-second
      // cancellation fade is timed from that observation, without rewinding the body.
      else if (t && t.fadeAt === undefined) t.fadeAt = observedAtMs;
      return;
    }
    if (event.kind !== 'step' && event.kind !== 'interpose') return;
    rememberStep(event, now);
    const destination = anchorMap.get(event.to ?? '');
    const destinationPos = destination ? locate(destination) : undefined;
    const standing = [...active.values()].find((old) => old !== t && old.description !== description && old.lastBerth === event.to && old.speed === 0 && old.route.length === 0 && old.fadeAt === undefined && destinationPos &&
      Math.hypot(old.pos.point[0] - destinationPos.point[0], old.pos.point[1] - destinationPos.point[1]) < 0.05);
    if (standing) {
      rename(standing, description, event.to!, event.kind); t = standing;
    } else if (!t && destinationPos) {
      // TD arrival is often ahead of the animation. Delay the identity replacement until
      // that same train actually reaches the berth; never spawn a second body at its target.
      const approaching = [...active.values()].find((old) => old.lastBerth === event.to && old.target.berth === event.to && old.route.length > 0 && old.fadeAt === undefined);
      if (approaching) {
        if (approaching.pendingRename) pendingNames.delete(approaching.pendingRename.description);
        approaching.pendingRename = { description, berth: event.to!, kind: event.kind };
        pendingNames.set(description, approaching); t = approaching;
      }
    }
    const berth = event.kind === 'step' ? event.from : event.to;
    if (!t) {
      const a = berth ? anchorMap.get(berth) : undefined;
      if (!a && (event.kind === 'step' || estimates)) {
        const arrival = destination ?? anchoredAhead(event.to ?? '', description);
        const placement = arrival ? anchorPlacement(arrival) : undefined, stop = placement?.pos;
        if (arrival && stop) {
          const arrivalDir = placement!.dir;
          const trail = continuation(stop, -arrivalDir);
          const first = trail.at(-1);
          const at = first ? point(first.edge, first.toT) : undefined;
          if (!at) { issues.push({ kind: 'unroutable', description, berth: berth ?? '', reason: 'no forward entry from an external graph boundary' }); return; }
          const dir = first ? -direction(first) : arrivalDir;
          const boundary: BerthAnchor = { ...arrival, berth: berth ?? '', kind: 'inferred', platform: undefined, from: dir > 0 ? at.edge.a : at.edge.b, to: dir > 0 ? at.edge.b : at.edge.a,
            t: dir > 0 ? at.t : 1 - at.t, point: at.point, evidence: 'first observation: enter from graph boundary' };
          t = spawn(description, boundary);
          if (t) {
            if (estimates) t.estimated = true;
            if (estimates && !destination) estimateToward(t, arrival, event.to ?? '');
            else setTarget(t, arrival);
            issues.push({ kind: 'entering', description, berth: event.to ?? '', reason: 'unmapped origin with anchored successor' });
          }
        }
      }
      if (!a && !t) { issues.push({ kind: 'unroutable', description, berth: berth ?? '', reason: 'first observation has no mapped origin' }); return; }
      if (!t) t = spawn(description, a!);
      if (!t) return;
    }
    t.lastSeen = now;
    if (event.kind === 'interpose' && estimates && !destination) { t.lastBerth = event.to ?? ''; t.unmapped = event.to ?? ''; }
    delete t.fadeAt;
    if (event.kind === 'step') {
      t.routeOrigin = event.from ?? t.target.berth;
      t.lastBerth = event.to ?? '';
      const a = anchorMap.get(event.to ?? '');
      if (a) requestTarget(t, a);
      else {
        t.unmapped = event.to ?? '';
        const ahead = anchoredAhead(t.unmapped, description);
        if (ahead) {
          const missing = t.unmapped;
          if (estimates) estimateToward(t, ahead, missing);
          else requestTarget(t, ahead);
          t.unmapped = missing;
        } else if (!t.awaitingAnchor) requestExit(t);
      }
    }
    // Repeated interposes refresh liveness. They never relocate an existing train.
  };

  const speedOn = (edge: Edge, t: number): number => {
    const cap = maxspeedMps(opts.wayMaxspeed?.get(edge.wayId), defaultSpeed);
    return inZone(KINGS_CROSS, point(edge, t).point) ? Math.min(cap, stationSpeed) : cap;
  };
  const zoneCuts = (s: Segment): number[] => {
    const a = graph.pos.get(s.edge.a)!, b = graph.pos.get(s.edge.b)!;
    const cuts = [s.fromT, s.toT];
    for (const [axis, bounds] of [[0, [KINGS_CROSS.minX, KINGS_CROSS.maxX]], [1, [KINGS_CROSS.minZ, KINGS_CROSS.maxZ]]] as const) {
      for (const bound of bounds) {
        const q = (bound - a[axis]) / (b[axis] - a[axis]);
        if (q > Math.min(s.fromT, s.toT) && q < Math.max(s.fromT, s.toT)) cuts.push(q);
      }
    }
    return cuts.sort((x, y) => direction(s) * (x - y));
  };
  const limits = (t: Train, available: number): { cap: number; stop: number } => {
    let stop = available, along = 0, cap = defaultSpeed;
    let bodyCap = Infinity;
    // A restriction ends when the last coach clears it, not when the cab does.
    for (const s of t.body) {
      const cuts = zoneCuts(s);
      for (let i = 0; i + 1 < cuts.length; i++) bodyCap = Math.min(bodyCap, speedOn(s.edge, (cuts[i]! + cuts[i + 1]!) / 2));
    }
    let first = true;
    const approachStart = t.target.platform === undefined ? Infinity : Math.max(0, t.route.reduce((sum, s) => sum + size(s), 0) - 400);
    for (const s of t.route) {
      const cuts = zoneCuts(s);
      if (approachStart > along && approachStart < along + size(s)) cuts.push(s.fromT + direction(s) * (approachStart - along) / s.edge.length);
      cuts.sort((x, y) => direction(s) * (x - y));
      for (let i = 0; i + 1 < cuts.length; i++) {
        const c = Math.min(speedOn(s.edge, (cuts[i]! + cuts[i + 1]!) / 2), along >= approachStart - EPS ? stationSpeed : Infinity);
        if (first) { cap = c; first = false; }
        if (along > EPS && c < cap) stop = Math.min(stop, along + c * c / (2 * braking));
        along += Math.abs(cuts[i + 1]! - cuts[i]!) * s.edge.length;
      }
    }
    return { cap: Math.min(cap, bodyCap, t.estimateSpeed ?? Infinity), stop };
  };
  const moveBody = (t: Train, distance: number): void => {
    let left = distance;
    while (left > EPS && t.route.length) {
      const s = t.route[0]!;
      if (s.edge !== t.pos.edge && !t.exiting) {
        const node = s.fromT === 0 ? s.edge.a : s.edge.b;
        const key = `${t.routeOrigin}:${node}:${t.pos.edge.a}:${t.pos.edge.b}`;
        if (!turns.has(key)) turns.set(key, new Map());
        turns.get(key)!.set(s.edge, (turns.get(key)!.get(s.edge) ?? 0) + 1);
      }
      const take = Math.min(left, size(s));
      const to = s.fromT + direction(s) * take / s.edge.length;
      append(t.body, { edge: s.edge, fromT: s.fromT, toT: to });
      t.dir = direction(s); t.pos = point(s.edge, to); s.fromT = to;
      t.distanceM += take; left -= take;
      if (size(s) < EPS) { t.pos = point(s.edge, s.toT); t.route.shift(); }
    }
    let excess = t.body.reduce((sum, s) => sum + size(s), 0) - t.lengthM;
    while (excess > EPS && t.body.length) {
      const s = t.body[0]!, take = Math.min(excess, size(s));
      s.fromT += direction(s) * take / s.edge.length; excess -= take;
      if (size(s) < EPS) t.body.shift();
    }
  };
  const tick = (t: Train, h: number): void => {
    if (!t.route.length) { t.speed = 0; return; }
    let available = t.route.reduce((sum, s) => sum + size(s), 0);
    t.blocked = false;
    for (const other of active.values()) if (other !== t) {
      const opposing = opposingClearance(t.route, other);
      let clear = Math.min(clearance(t, other), opposing);
      const reservation = mergePlan(t, t.route, other);
      if (reservation) reserveMerge(t, other, reservation);
      const merge = merges.get(t)?.get(other);
      if (merge && merge.winner !== t && merge.winner.distanceM < merge.releaseAt - EPS) {
        clear = Math.min(clear, Math.max(0, merge.yieldStop - t.distanceM));
      }
      if (Number.isFinite(clear) && other.route.length && (Number.isFinite(opposing) || t.route.some((s) => other.body.some((b) => b.edge === s.edge && direction(b) !== direction(s))))) {
        // Opposing trains share a fixed meeting boundary until either authority changes.
        // Recomputing a moving midpoint every tick lets one train consume the other's
        // braking room. Reserve each stopping distance first, then share the free space.
        let meeting = meetings.get(t)?.get(other);
        if (!meeting || meeting.selfAuthority !== t.authority || meeting.otherAuthority !== other.authority) {
          const ownStop = t.speed * t.speed / (2 * braking), otherStop = other.speed * other.speed / (2 * braking);
          const free = Math.max(0, clear - ownStop - otherStop) / 2;
          meeting = { selfAuthority: t.authority, otherAuthority: other.authority, stop: t.distanceM + ownStop + free };
          if (!meetings.has(t)) meetings.set(t, new Map());
          if (!meetings.has(other)) meetings.set(other, new Map());
          meetings.get(t)!.set(other, meeting);
          meetings.get(other)!.set(t, { selfAuthority: other.authority, otherAuthority: t.authority, stop: other.distanceM + otherStop + free });
        }
        clear = Math.min(clear, Math.max(0, meeting.stop - t.distanceM));
      }
      if (clear < available) { available = clear; t.blocked = true; }
    }
    const { cap, stop } = limits(t, available);
    let remaining = stop, time = h, distance = 0, v = t.speed;
    // Integrate the accelerate/cruise/brake phases analytically, including a switch inside
    // a tick. Euler snapping at the anchor would break the service-deceleration limit.
    for (let i = 0; i < 8 && time > EPS; i++) {
      if (remaining <= EPS && v <= EPS) break;
      let a: number, duration: number;
      if (remaining <= v * v / (2 * braking) + EPS || v > cap + EPS) {
        a = -braking; duration = Math.min(time, v / braking);
      } else if (v < cap - EPS) {
        const peak = Math.sqrt(Math.max(0, (2 * acceleration * braking * remaining + braking * v * v) / (acceleration + braking)));
        a = acceleration; duration = Math.min(time, (Math.min(cap, peak) - v) / acceleration);
      } else {
        a = 0; duration = Math.min(time, (remaining - v * v / (2 * braking)) / v);
      }
      if (duration < EPS) break;
      const d = Math.max(0, v * duration + a * duration * duration / 2);
      distance += d; remaining -= d; v = Math.max(0, v + a * duration); time -= duration;
    }
    // A spawn is held back until safe; a new target inside the braking envelope is refused.
    // This last clamp only absorbs floating-point error, never a normal stopping manoeuvre.
    moveBody(t, Math.min(distance, available));
    t.speed = v < EPS ? 0 : v;
    if (!t.route.length) {
      t.speed = 0; t.departing = false;
      if (!t.awaitingAnchor && !t.exiting) { t.estimated = false; delete t.estimateSpeed; }
      if (t.pendingRename) { const pending = t.pendingRename; rename(t, pending.description, pending.berth, pending.kind); }
      if (t.pendingTarget) {
        const a = t.pendingTarget, exitAfterAnchor = t.pendingExit;
        delete t.pendingTarget; reverseAtPlatform(t, a);
        t.pendingExit = exitAfterAnchor;
      }
      else if (t.pendingExit) { t.pendingExit = false; requestExit(t); }
      else if (t.exiting && t.fadeAt === undefined) t.fadeAt = now;
    }
  };
  const advance = (dtSeconds: number): void => {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('motion dt must be finite and nonnegative');
    // Substeps bound movement and collision reservations even when a renderer misses frames.
    let left = dtSeconds;
    while (left > EPS) {
      const h = Math.min(0.1, left);
      now += h * 1000; started = true; left -= h;
      for (const t of [...active.values()]) {
        if (t.exiting && !t.route.length && t.fadeAt === undefined) t.fadeAt = now;
        if (t.fadeAt === undefined && quietExpired(t)) t.fadeAt = now;
        tick(t, h);
        if (t.fadeAt !== undefined && now - t.fadeAt >= fadeSeconds * 1000) {
          active.delete(t.description);
          if (t.pendingRename) pendingNames.delete(t.pendingRename.description);
          meetings.delete(t); merges.delete(t);
          for (const m of merges.values()) m.delete(t);
          for (const m of meetings.values()) m.delete(t);
          issues.push({ kind: 'vanished', description: t.description, berth: t.lastBerth, reason: 'completed fade' });
        }
      }
      for (const [id, t] of queued) {
        if (quietExpired(t)) queued.delete(id);
        else if (canSpawn(t)) { queued.delete(id); active.set(id, t); }
      }
    }
  };
  const trains = (): TrainView[] => [...active.values()].map((t) => ({
    id: t.id, exiting: t.exiting, description: t.description, leading: { ...t.pos, point: [...t.pos.point] as Pt },
    heading: (() => { const a = graph.pos.get(t.pos.edge.a)!, b = graph.pos.get(t.pos.edge.b)!; return Math.atan2((b[0] - a[0]) * t.dir, -(b[1] - a[1]) * t.dir); })(),
    speed: t.speed, lengthM: t.lengthM, occupiedLengthM: t.body.reduce((sum, s) => sum + size(s), 0),
    occupied: t.body.map((s) => ({ ...s })),
    state: t.fadeAt !== undefined ? 'fading' : t.estimated ? 'estimated' : t.departing ? 'departing' : t.speed === 0 ? 'held' : 'moving',
    opacity: (t.estimated ? 0.55 : 1) * (t.fadeAt === undefined ? 1 : Math.min(1, Math.max(0, 1 - (now - t.fadeAt) / (fadeSeconds * 1000)))),
    targetBerth: t.target.berth, lastBerth: t.lastBerth,
    ...(t.unmapped !== undefined ? { unmappedBerth: t.unmapped } : {}),
    blocked: t.blocked, distanceM: t.distanceM, reversals: t.reversals,
  }));
  return { apply, advance, trains, diagnostics: (): MotionIssue[] => issues.map((i) => ({ ...i })), queuedCount: (): number => queued.size };
}
