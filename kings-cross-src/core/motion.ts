// TD steps are movement authorities, not positions. All distances are metres and time is
// supplied by the caller. A body is a tail-to-nose trail, so a terminus cab change can
// reverse that trail without moving any of the occupied track.
import { NOT_A_TRAIN } from './anchors.ts';
import type { AnchorMap, BerthAnchor } from './anchors.ts';
import type { Pt } from './geo.ts';
import { shortestPath } from './graph.ts';
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
  description: string;
  leading: TrackPosition;
  /** Radians clockwise from north (-z), as in station.ts. */
  heading: number;
  speed: number;
  lengthM: number;
  occupiedLengthM: number;
  occupied: OccupiedTrack[];
  state: 'moving' | 'held' | 'departing' | 'fading';
  opacity: number;
  targetBerth: string;
  lastBerth: string;
  unmappedBerth?: string;
  blocked: boolean;
  /** Distance travelled by the body; a stationary cab change does not add 260 m. */
  distanceM: number;
  reversals: number;
}
export interface MotionOptions {
  lengthM?: number;
  acceleration?: number;
  braking?: number;
  defaultSpeedMps?: number;
  stationSpeedMps?: number;
  gapM?: number;
  quietMs?: number;
  fadeSeconds?: number;
  /** Graph strips rail tags. Supply OSM maxspeed strings keyed by rail way id. */
  wayMaxspeed?: ReadonlyMap<number, string>;
}
export interface MotionIssue { kind: 'unroutable' | 'reversal' | 'vanished' | 'queued'; description: string; berth: string; reason: string }
interface Segment { edge: Edge; fromT: number; toT: number }
interface Train {
  description: string; pos: TrackPosition; dir: number; body: Segment[]; route: Segment[];
  speed: number; target: BerthAnchor; lastBerth: string; lastSeen: number;
  unmapped?: string; pendingTarget?: BerthAnchor; fadeAt?: number;
  departing: boolean; blocked: boolean; distanceM: number; reversals: number;
  authority: number;
}
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
  const lengthM = opts.lengthM ?? 260;
  const acceleration = opts.acceleration ?? 0.7;
  const braking = opts.braking ?? 0.6;
  const defaultSpeed = opts.defaultSpeedMps ?? 40 / 3.6;
  const stationSpeed = opts.stationSpeedMps ?? 25 / 3.6;
  const gap = opts.gapM ?? 5;
  const quietMs = opts.quietMs ?? 20 * 60_000;
  const fadeSeconds = opts.fadeSeconds ?? 5;
  for (const n of [lengthM, acceleration, braking, defaultSpeed, stationSpeed, quietMs, fadeSeconds]) {
    if (!Number.isFinite(n) || n <= 0) throw new Error('motion options must be finite and positive');
  }
  if (!Number.isFinite(gap) || gap < 0) throw new Error('motion gap must be finite and nonnegative');
  let now = 0;
  let started = false;
  const active = new Map<string, Train>();
  const queued = new Map<string, Train>();
  const issues: MotionIssue[] = [];
  const meetings = new Map<Train, Map<Train, Meeting>>();
  const anchorMap = new Map(anchors.anchors.map((a) => [a.berth, a]));
  const point = (edge: Edge, t: number): TrackPosition => {
    const a = graph.pos.get(edge.a)!;
    const b = graph.pos.get(edge.b)!;
    return { edge, t, point: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t] };
  };
  const locate = (a: BerthAnchor): TrackPosition | undefined => {
    const e = graph.edges.find((e) => (e.a === a.from && e.b === a.to) || (e.b === a.from && e.a === a.to));
    return e && a.t >= 0 && a.t <= 1 && e.length > 0 ? point(e, e.a === a.from ? a.t : 1 - a.t) : undefined;
  };
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
  const initialBody = (pos: TrackPosition, dir: number): Segment[] => {
    const backwards: Segment[] = [];
    let edge = pos.edge, at = pos.t, d = -dir, left = lengthM;
    const used = new Set<Edge>();
    while (left > EPS && !used.has(edge)) {
      used.add(edge);
      const end = d > 0 ? 1 : 0;
      const take = Math.min(left, Math.abs(end - at) * edge.length);
      const to = at + d * take / edge.length;
      append(backwards, { edge, fromT: at, toT: to });
      left -= take;
      if (left <= EPS || Math.abs(to - end) > EPS) break;
      const node = d > 0 ? edge.b : edge.a;
      const p = graph.pos.get(node)!;
      const prev = graph.pos.get(d > 0 ? edge.a : edge.b)!;
      const next = (graph.adj.get(node) ?? []).filter((e) => !used.has(e) && e.length > 0).sort((x, y) => {
        const score = (e: Edge): number => {
          const q = graph.pos.get(e.a === node ? e.b : e.a)!;
          return ((p[0] - prev[0]) * (q[0] - p[0]) + (p[1] - prev[1]) * (q[1] - p[1])) / e.length;
        };
        return score(y) - score(x) || x.wayId - y.wayId || x.a - y.a || x.b - y.b;
      })[0];
      if (!next) break;
      edge = next; d = edge.a === node ? 1 : -1; at = d > 0 ? 0 : 1;
    }
    return backwards.reverse().map((s) => ({ edge: s.edge, fromT: s.toT, toT: s.fromT }));
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
    const adj = new Map<number, Edge[]>();
    for (const [n, edges] of graph.adj) adj.set(n, edges.filter((e) => !excluded.has(e) && e.length > EPS));
    const filtered: Graph = { ...graph, adj };
    let best: Segment[] | null = null;
    let bestLength = Infinity;
    for (const end of [target.edge.a, target.edge.b]) {
      const path = shortestPath(filtered, endNode, end);
      if (!path) continue;
      const segments: Segment[] = [];
      append(segments, { edge: start.edge, fromT: start.t, toT: endT });
      for (let i = 0; i + 1 < path.nodes.length; i++) {
        const u = path.nodes[i]!, v = path.nodes[i + 1]!;
        const e = (adj.get(u) ?? []).filter((e) => (e.a === u ? e.b : e.a) === v).sort((x, y) => x.length - y.length || x.wayId - y.wayId)[0]!;
        append(segments, { edge: e, fromT: e.a === u ? 0 : 1, toT: e.a === u ? 1 : 0 });
      }
      const last = { edge: target.edge, fromT: target.edge.a === end ? 0 : 1, toT: target.t };
      const prior = segments.at(-1);
      if (size(last) > EPS && (excluded.has(last.edge) || (prior?.edge === last.edge && direction(prior) !== direction(last)))) continue;
      append(segments, last);
      const len = segments.reduce((sum, s) => sum + size(s), 0);
      if (len < bestLength) { best = segments; bestLength = len; }
    }
    return best;
  };
  const setTarget = (t: Train, a: BerthAnchor): boolean => {
    const route = routeTo(t, a);
    if (!route) { issue(t, a.berth, 'no forward graph path'); return false; }
    if (route.reduce((sum, s) => sum + size(s), 0) + EPS < t.speed * t.speed / (2 * braking)) {
      issue(t, a.berth, 'target is inside service braking distance'); return false;
    }
    t.route = route; t.target = a; t.authority++; delete t.unmapped;
    return true;
  };
  const reverseAtPlatform = (t: Train, a: BerthAnchor): void => {
    const platformBerth = t.target.berth;
    const oldBody = t.body;
    const oldPos = t.pos, oldDir = t.dir;
    t.body = oldBody.slice().reverse().map((s) => ({ edge: s.edge, fromT: s.toT, toT: s.fromT }));
    const nose = t.body.at(-1);
    if (nose) { t.pos = point(nose.edge, nose.toT); t.dir = direction(nose); }
    else t.dir = -t.dir;
    if (setTarget(t, a)) {
      t.departing = true; t.reversals++;
      issues.push({ kind: 'reversal', description: t.description, berth: platformBerth, reason: 'stationary platform cab change' });
    } else { t.body = oldBody; t.pos = oldPos; t.dir = oldDir; }
  };
  const requestTarget = (t: Train, a: BerthAnchor): void => {
    const target = locate(a), platform = locate(t.target);
    const sameStop = target && platform && target.edge === platform.edge && Math.abs(target.t - platform.t) < EPS;
    if (t.target.platform !== undefined && !sameStop) {
      if (t.route.length) t.pendingTarget = a; // TD can report departure before the rendered arrival.
      else reverseAtPlatform(t, a);
    } else if (sameStop && t.target.platform !== undefined) {
      if (a.platform !== undefined) t.target = a; // Keep platform evidence for unlabelled aliases.
    } else setTarget(t, a);
  };
  // Distance to the first occupied interval in the remaining route.
  const clearance = (t: Train, other: Train): number => {
    let along = 0;
    for (const s of t.route) {
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
    const pos = locate(a);
    if (!pos) { issues.push({ kind: 'unroutable', description, berth: a.berth, reason: 'anchor has no valid graph edge' }); return; }
    const dir = a.from === pos.edge.a ? 1 : -1;
    const t: Train = { description, pos, dir, body: initialBody(pos, dir), route: [], speed: 0, target: a, lastBerth: a.berth, lastSeen: now, departing: false, blocked: false, distanceM: 0, reversals: 0, authority: 0 };
    if (canSpawn(t)) active.set(description, t);
    else {
      queued.set(description, t);
      issues.push({ kind: 'queued', description, berth: a.berth, reason: 'initial body or braking envelope occupied' });
    }
    return t;
  };
  const apply = (event: MotionEvent, nowMs: number): void => {
    if (!Number.isFinite(nowMs)) throw new Error('motion time must be finite');
    if (!started) { now = nowMs; started = true; } else now = Math.max(now, nowMs);
    if (event.area !== anchors.area || !event.descr || event.descr === NOT_A_TRAIN) return;
    const description = event.descr;
    let t = active.get(description) ?? queued.get(description);
    if (event.kind === 'cancel') {
      if (queued.has(description)) queued.delete(description);
      else if (t && t.fadeAt === undefined) t.fadeAt = now;
      return;
    }
    if (event.kind !== 'step' && event.kind !== 'interpose') return;
    const berth = event.kind === 'step' ? event.from : event.to;
    if (!t) {
      const a = berth ? anchorMap.get(berth) : undefined;
      if (!a) { issues.push({ kind: 'unroutable', description, berth: berth ?? '', reason: 'first observation has no mapped origin' }); return; }
      t = spawn(description, a);
      if (!t) return;
    }
    t.lastSeen = now;
    delete t.fadeAt;
    if (event.kind === 'step') {
      t.lastBerth = event.to ?? '';
      const a = anchorMap.get(event.to ?? '');
      if (a) requestTarget(t, a);
      else { t.unmapped = event.to ?? ''; issue(t, t.unmapped, 'unmapped destination; retaining last target'); }
    }
    // Repeated interposes refresh liveness. They never relocate an existing train.
  };

  const speedOn = (edge: Edge, t: number): number => {
    const cap = maxspeedMps(opts.wayMaxspeed?.get(edge.wayId), defaultSpeed);
    return inZone(KINGS_CROSS, point(edge, t).point) ? Math.min(cap, stationSpeed) : cap;
  };
  const limits = (t: Train, available: number): { cap: number; stop: number } => {
    let stop = available, along = 0, cap = defaultSpeed;
    let first = true;
    const approachStart = t.target.platform === undefined ? Infinity : Math.max(0, t.route.reduce((sum, s) => sum + size(s), 0) - 400);
    for (const s of t.route) {
      const a = graph.pos.get(s.edge.a)!, b = graph.pos.get(s.edge.b)!;
      const cuts = [s.fromT, s.toT];
      if (approachStart > along && approachStart < along + size(s)) cuts.push(s.fromT + direction(s) * (approachStart - along) / s.edge.length);
      for (const [axis, bounds] of [[0, [KINGS_CROSS.minX, KINGS_CROSS.maxX]], [1, [KINGS_CROSS.minZ, KINGS_CROSS.maxZ]]] as const) {
        for (const bound of bounds) {
          const q = (bound - a[axis]) / (b[axis] - a[axis]);
          if (q > Math.min(s.fromT, s.toT) && q < Math.max(s.fromT, s.toT)) cuts.push(q);
        }
      }
      cuts.sort((x, y) => direction(s) * (x - y));
      for (let i = 0; i + 1 < cuts.length; i++) {
        const c = Math.min(speedOn(s.edge, (cuts[i]! + cuts[i + 1]!) / 2), along >= approachStart - EPS ? stationSpeed : Infinity);
        if (first) { cap = c; first = false; }
        if (along > EPS && c < cap) stop = Math.min(stop, along + c * c / (2 * braking));
        along += Math.abs(cuts[i + 1]! - cuts[i]!) * s.edge.length;
      }
    }
    return { cap, stop };
  };
  const moveBody = (t: Train, distance: number): void => {
    let left = distance;
    while (left > EPS && t.route.length) {
      const s = t.route[0]!;
      const take = Math.min(left, size(s));
      const to = s.fromT + direction(s) * take / s.edge.length;
      append(t.body, { edge: s.edge, fromT: s.fromT, toT: to });
      t.dir = direction(s); t.pos = point(s.edge, to); s.fromT = to;
      t.distanceM += take; left -= take;
      if (size(s) < EPS) { t.pos = point(s.edge, s.toT); t.route.shift(); }
    }
    let excess = t.body.reduce((sum, s) => sum + size(s), 0) - lengthM;
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
      let clear = clearance(t, other);
      if (Number.isFinite(clear) && other.route.length && t.route.some((s) => other.body.some((b) => b.edge === s.edge && direction(b) !== direction(s)))) {
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
      if (t.pendingTarget) { const a = t.pendingTarget; delete t.pendingTarget; reverseAtPlatform(t, a); }
    }
  };
  const advance = (dtSeconds: number): void => {
    if (!Number.isFinite(dtSeconds) || dtSeconds < 0) throw new Error('motion dt must be finite and nonnegative');
    // Substeps bound movement and collision reservations even when a renderer misses frames.
    let left = dtSeconds;
    while (left > EPS) {
      const h = Math.min(0.1, left);
      now += h * 1000; started = true; left -= h;
      for (const t of active.values()) {
        if (t.fadeAt === undefined && now - t.lastSeen >= quietMs) t.fadeAt = t.lastSeen + quietMs;
        tick(t, h);
        if (t.fadeAt !== undefined && now - t.fadeAt >= fadeSeconds * 1000) {
          active.delete(t.description);
          meetings.delete(t);
          for (const m of meetings.values()) m.delete(t);
          issues.push({ kind: 'vanished', description: t.description, berth: t.lastBerth, reason: 'completed fade' });
        }
      }
      for (const [id, t] of queued) {
        if (now - t.lastSeen >= quietMs) queued.delete(id);
        else if (canSpawn(t)) { queued.delete(id); active.set(id, t); }
      }
    }
  };
  const trains = (): TrainView[] => [...active.values()].map((t) => ({
    description: t.description, leading: { ...t.pos, point: [...t.pos.point] as Pt },
    heading: (() => { const a = graph.pos.get(t.pos.edge.a)!, b = graph.pos.get(t.pos.edge.b)!; return Math.atan2((b[0] - a[0]) * t.dir, -(b[1] - a[1]) * t.dir); })(),
    speed: t.speed, lengthM, occupiedLengthM: t.body.reduce((sum, s) => sum + size(s), 0),
    occupied: t.body.map((s) => ({ ...s })),
    state: t.fadeAt !== undefined ? 'fading' : t.departing ? 'departing' : t.speed === 0 ? 'held' : 'moving',
    opacity: t.fadeAt === undefined ? 1 : Math.max(0, 1 - (now - t.fadeAt) / (fadeSeconds * 1000)),
    targetBerth: t.target.berth, lastBerth: t.lastBerth,
    ...(t.unmapped !== undefined ? { unmappedBerth: t.unmapped } : {}),
    blocked: t.blocked, distanceM: t.distanceM, reversals: t.reversals,
  }));
  return { apply, advance, trains, diagnostics: (): MotionIssue[] => issues.map((i) => ({ ...i })), queuedCount: (): number => queued.size };
}
