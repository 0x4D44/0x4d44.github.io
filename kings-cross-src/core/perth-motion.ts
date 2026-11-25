import { dist } from './geo.ts';
import type { Pt } from './geo.ts';
import { buildGraph, edgePoint, shortestPath } from './graph.ts';
import type { Edge, Graph } from './graph.ts';
import type { OccupiedTrack, TrainView } from './motion.ts';
import { neutralTrainLayout } from './train-neutral.ts';
import { decodeWaverleyAnchorScene, waverleyPlatformGeometry, waverleyTrackData } from './waverley-anchors.ts';
import type { WaverleyTrackCandidate } from './waverley-anchors.ts';

export type PerthDirection = 'north' | 'east' | 'south';
export interface PerthCall {
  uid: string; headcode: string; platform: string | null;
  arrivalMs: number | null; departureMs: number | null; passMs: number | null;
  from: PerthDirection | null; to: PerthDirection | null;
}
export interface PerthReport {
  headcode: string; eventType: 'ARRIVAL' | 'DEPARTURE' | 'PASS'; platform: string | null;
  plannedMs: number | null; actualMs: number; receivedAtMs: number;
}
interface Leg { spans: OccupiedTrack[]; length: number }
interface Site { incoming?: Leg; outgoing?: Leg; backing?: Leg; reversal: boolean }
export interface PerthTrain {
  key: string; view: TrainView; platform: string | null;
  phase: 'approach' | 'dwell' | 'departure' | 'pass'; source: 'live' | 'scheduled';
}

const routeRefs: Record<PerthDirection, string> = { north: 'HGL1', east: 'SCM5', south: 'SCM4' };
const directions = Object.keys(routeRefs) as PerthDirection[];
const TRAIL_M = neutralTrainLayout().length;
const APPROACH_MPS = 12;
const STOP_WAIT_MS = 90_000;
const DEPARTURE_GRACE_MS = 45_000;
const OPENING_DWELL_MS = 120_000;
const REPORT_MATCH_MS = 20 * 60_000;
const MATCH_TIE_MS = 60_000;
const lengthOf = ({ edge, fromT, toT }: OccupiedTrack) => edge.length * Math.abs(toT - fromT);
const total = (spans: OccupiedTrack[]): Leg => ({ spans, length: spans.reduce((sum, span) => sum + lengthOf(span), 0) });
const reverse = (leg: Leg): Leg => ({ length: leg.length, spans: leg.spans.slice().reverse().map(({ edge, fromT, toT }) => ({ edge, fromT: toT, toT: fromT })) });
const empty = total([]);
const edgeBetween = (graph: Graph, a: number, b: number) => graph.adj.get(a)?.find(edge => edge.a === b || edge.b === b);
const toward = (edge: Edge, node: number) => edge.a === node ? 0 : 1;
const projection = (point: Pt, direction: PerthDirection) => direction === 'east' ? point[0] : direction === 'north' ? -point[1] : point[1];

export function createPerthTrack(geometry: unknown) {
  const scene = decodeWaverleyAnchorScene(geometry), data = waverleyTrackData(scene), graph = buildGraph(data);
  const exits = new Map<PerthDirection, { inbound: number; outbound: number }>();
  for (const direction of directions) {
    const ends = [...graph.adj].filter(([, edges]) => edges.length === 1 && edges[0]!.service === 'main' && data.rails[edges[0]!.wayId - 1]?.ref === routeRefs[direction])
      .sort(([a], [b]) => projection(graph.pos.get(b)!, direction) - projection(graph.pos.get(a)!, direction));
    if (!ends.length) continue;
    const [outer, [edge]] = ends[0]!;
    const point = graph.pos.get(outer)!, inside = graph.pos.get(edge!.a === outer ? edge!.b : edge!.a)!;
    const left: Pt = [inside[1] - point[1], point[0] - inside[0]];
    const lateral = (node: number) => graph.pos.get(node)![0] * left[0] + graph.pos.get(node)![1] * left[1];
    // Outer parallel tracks are paired only where they reach the same model boundary.
    const pair = ends.filter(([id]) => dist(point, graph.pos.get(id)!) <= 40).map(([id]) => id).sort((a, b) => lateral(b) - lateral(a));
    exits.set(direction, { inbound: pair[0]!, outbound: pair.at(-1)! });
  }

  const platforms = new Map<string, WaverleyTrackCandidate>();
  const geometryByRef = waverleyPlatformGeometry(scene);
  for (const platform of geometryByRef) {
    const candidates = platform.candidates;
    if (platform.platformIds.length !== 1 || !candidates.length) continue;
    // Clipped pieces of one OSM way can describe one continuous platform track.
    const oneWay = candidates.every(c => c.railIds.length === 1 && c.railIds[0] === candidates[0]!.railIds[0]);
    if (candidates.length === 1 || oneWay) platforms.set(platform.ref, candidates.reduce((a, b) => a.coverageM >= b.coverageM ? a : b));
  }
  const candidates = geometryByRef.flatMap(p => p.candidates);
  const legCache = new Map<WaverleyTrackCandidate, Map<number, Leg | undefined>>();
  function toStop(stop: WaverleyTrackCandidate, start: number | undefined): Leg | undefined {
    if (start === undefined) return undefined;
    const cache = legCache.get(stop) ?? new Map<number, Leg | undefined>();
    legCache.set(stop, cache);
    if (cache.has(start)) return cache.get(start);
    const edge = edgeBetween(graph, stop.from, stop.to);
    if (!edge) return undefined;
    const adj = new Map(graph.adj);
    for (const n of [edge.a, edge.b]) adj.set(n, graph.adj.get(n)!.filter(e => e.a !== edge.a || e.b !== edge.b));
    const fraction = edge.a === stop.from ? stop.t : 1 - stop.t;
    const legs = [stop.from, stop.to].flatMap(end => {
      const route = end === start ? { nodes: [start], length: 0 } : shortestPath({ ...graph, adj }, start, end);
      if (!route) return [];
      const spans = route.nodes.slice(1).map((b, i) => {
        const a = route.nodes[i]!, e = edgeBetween(graph, a, b)!;
        return { edge: e, fromT: toward(e, a), toT: toward(e, b) };
      });
      spans.push({ edge, fromT: toward(edge, end), toT: fraction });
      return [total(spans.filter(s => lengthOf(s) > 1e-8))];
    });
    const leg = legs.sort((a, b) => a.length - b.length)[0];
    cache.set(start, leg);
    return leg;
  }
  const routeCache = new Map<string, { site: Site; platform: string | null } | undefined>();
  function route(from: PerthDirection | null, to: PerthDirection | null, platform: string | null, pass: boolean) {
    const key = JSON.stringify([from, to, platform, pass]);
    if (routeCache.has(key)) return routeCache.get(key);
    const fromExit = from ? exits.get(from)?.inbound : undefined, toExit = to ? exits.get(to)?.outbound : undefined;
    const preferred = platform ? platforms.get(platform) : undefined;
    function at(stop: WaverleyTrackCandidate): Site | undefined {
      const incoming = toStop(stop, fromExit), returning = toStop(stop, toExit), outgoing = returning && reverse(returning);
      if ((!incoming && !outgoing) || (from && !incoming) || (to && !outgoing) || (pass && (!incoming || !outgoing))) return undefined;
      const first = incoming?.spans.at(-1), next = outgoing?.spans[0];
      const reversal = !!first && !!next && first.edge === next.edge && Math.sign(first.toT - first.fromT) !== Math.sign(next.toT - next.fromT);
      if (pass && reversal) return undefined;
      let backing: Leg | undefined;
      if (!incoming && returning) {
        // An originating set's tail goes behind its departure direction when the graph supports it.
        const sign = Math.sign(next!.toT - next!.fromT);
        backing = directions.map(d => toStop(stop, exits.get(d)?.inbound)).find(leg => {
          const span = leg?.spans.at(-1);
          return span && Math.sign(span.toT - span.fromT) === sign;
        });
      }
      return { incoming, outgoing, backing, reversal: reversal || (!incoming && !backing) };
    }
    const placed = preferred && at(preferred);
    const alternatives = placed ? [] : candidates.flatMap(stop => {
      const site = at(stop);
      if (!site) return [];
      // Prefer a routing through the station centre and avoid a reversal when a direct line exists.
      const score = (site.incoming?.length ?? 0) + (site.outgoing?.length ?? 0) + dist(stop.point, [0, 0]) + (site.reversal ? 1000 : 0);
      return [{ site, score }];
    });
    const fallback = alternatives.sort((a, b) => a.score - b.score)[0];
    const result = placed ? { site: placed, platform } : fallback ? { site: fallback.site, platform: null } : undefined;
    routeCache.set(key, result);
    return result;
  }
  return { graph, platforms, route };
}

function trainAt(graph: Graph, leg: Leg, distance: number, id: number, description: string, held: boolean, reversed: boolean): TrainView | undefined {
  if (distance < 0 || distance > leg.length || !leg.spans.length) return undefined;
  const occupied: OccupiedTrack[] = [];
  let start = 0, leading: TrainView['leading'] | undefined, heading = 0;
  for (const span of leg.spans) {
    const length = lengthOf(span), end = start + length;
    if (end > distance - TRAIL_M && start < distance) {
      const fraction = (d: number) => span.fromT + (span.toT - span.fromT) * d / length;
      const fromT = fraction(Math.max(0, distance - TRAIL_M - start)), toT = fraction(Math.min(length, distance - start));
      occupied.push({ edge: span.edge, fromT, toT });
      if (distance <= end + 1e-7) {
        const { point, dir } = edgePoint(graph, span.edge, toT), sign = Math.sign(span.toT - span.fromT);
        leading = { edge: span.edge, point, t: toT };
        heading = Math.atan2(dir[0] * sign, -dir[1] * sign);
        break;
      }
    }
    start = end;
  }
  if (!leading || occupied.length === 0) return undefined;
  return { id, description, leading, heading, occupied, lengthM: TRAIL_M, occupiedLengthM: Math.min(TRAIL_M, distance),
    state: held ? 'held' : 'moving', speed: held ? 0 : APPROACH_MPS, opacity: 1, targetBerth: '', lastBerth: '',
    distanceM: distance, blocked: false, reversals: reversed ? 1 : 0 };
}

function bookedTime(call: PerthCall, type: PerthReport['eventType']) {
  return type === 'PASS' ? call.passMs : type === 'ARRIVAL' ? call.arrivalMs : call.departureMs;
}

export function planPerthTrains(track: ReturnType<typeof createPerthTrack>, calls: readonly PerthCall[], reports: readonly PerthReport[]) {
  const byHeadcode = new Map<string, PerthCall[]>();
  const assigned = new Map<PerthCall, Map<PerthReport['eventType'], PerthReport>>();
  for (const call of calls) {
    const bucket = byHeadcode.get(call.headcode) ?? [];
    bucket.push(call); byHeadcode.set(call.headcode, bucket);
  }
  let unmatchedReports = 0;
  for (const report of reports) {
    const at = report.plannedMs ?? report.actualMs;
    const candidates = (byHeadcode.get(report.headcode) ?? []).flatMap(call => {
      const booked = bookedTime(call, report.eventType);
      return booked === null ? [] : [{ call, delta: Math.abs(booked - at) }];
    }).filter(c => c.delta <= (report.plannedMs === null ? REPORT_MATCH_MS / 2 : REPORT_MATCH_MS)).sort((a, b) => a.delta - b.delta);
    const best = candidates[0];
    if (!best || (best.delta !== 0 && candidates[1] && candidates[1].delta - best.delta < MATCH_TIE_MS) || candidates[1]?.delta === best.delta) {
      unmatchedReports++; continue;
    }
    const times = assigned.get(best.call) ?? new Map<PerthReport['eventType'], PerthReport>();
    if ((times.get(report.eventType)?.receivedAtMs ?? -Infinity) <= report.receivedAtMs) times.set(report.eventType, report);
    assigned.set(best.call, times);
  }

  const unresolvedPlatforms = new Set<string>();
  let unresolvedRoutes = 0;
  const plans = calls.flatMap((call, id) => {
    const events = assigned.get(call);
    const arrival = events?.get('ARRIVAL'), departure = events?.get('DEPARTURE'), pass = events?.get('PASS');
    const requested = arrival?.platform ?? departure?.platform ?? pass?.platform ?? call.platform;
    const route = track.route(call.from, call.to, requested, call.passMs !== null);
    if (requested && route?.platform !== requested) unresolvedPlatforms.add(requested);
    if (!route || (call.arrivalMs !== null && !call.from) || (call.departureMs !== null && !call.to)) unresolvedRoutes++;
    if (!route) return [];
    const { platform, site } = route;
    const { incoming, outgoing, backing, reversal } = site;
    const dwellLeg = incoming ?? backing ?? (outgoing && reverse(outgoing)) ?? empty;
    const travelLeg = outgoing ? (reversal ? outgoing : total([...(incoming ?? backing ?? empty).spans, ...outgoing.spans])) : empty;
    const leaveOffset = reversal ? TRAIL_M : dwellLeg.length;
    const routeInMs = (incoming?.length ?? 0) / APPROACH_MPS * 1000;
    const routeOutMs = (outgoing ? Math.max(0, travelLeg.length - leaveOffset) : 0) / APPROACH_MPS * 1000;
    const passAt = pass?.actualMs ?? call.passMs;
    const arriveAt = arrival?.actualMs ?? (call.arrivalMs === null ? null : Math.min(call.arrivalMs, departure?.actualMs ?? Infinity));
    const arrivalDelay = arrival && call.arrivalMs !== null ? Math.max(0, arrival.actualMs - call.arrivalMs) : 0;
    const projectedLeave = call.departureMs === null ? null : call.departureMs + arrivalDelay + (arrival ? DEPARTURE_GRACE_MS : 0);
    const reportedLeave = departure && (arriveAt === null || departure.actualMs >= arriveAt) ? departure : undefined;
    const leaveAt = reportedLeave?.actualMs ?? (projectedLeave === null ? null : Math.max(projectedLeave, arriveAt ?? -Infinity));
    const begin = (passAt ?? arriveAt ?? leaveAt ?? Infinity) - (passAt !== null || arriveAt !== null ? routeInMs : OPENING_DWELL_MS);
    const end = (passAt ?? leaveAt ?? (arriveAt === null ? -Infinity : arriveAt + STOP_WAIT_MS)) + routeOutMs + (outgoing && passAt === null ? 5000 : 0);
    const key = `${call.uid}/${call.arrivalMs ?? call.departureMs ?? call.passMs}`;
    const make = (view: TrainView | undefined, phase: PerthTrain['phase'], reported: boolean): PerthTrain[] => view ? [{
      key, view, platform, phase, source: reported ? 'live' : 'scheduled',
    }] : [];
    const frame = (at: number): PerthTrain[] => {
      if (at < begin || at > end) return [];
      const pose = (leg: Leg, along: number, held = false, reversed = false) => trainAt(track.graph, leg, along, id, call.headcode, held, reversed);
      if (passAt !== null) return make(pose(travelLeg, dwellLeg.length + (at - passAt) / 1000 * APPROACH_MPS), 'pass', !!pass);
      if (arriveAt !== null && at < arriveAt) {
        if (!incoming) return [];
        const rest = (arriveAt - at) / routeInMs;
        return make(pose(incoming, incoming.length * (1 - rest * rest)), 'approach', !!arrival);
      }
      if (leaveAt === null || at < leaveAt) return make(pose(dwellLeg, dwellLeg.length, true), 'dwell', !!arrival);
      const elapsed = (at - leaveAt) / 1000;
      const progress = APPROACH_MPS * (elapsed < 10 ? elapsed * elapsed / 20 : elapsed - 5);
      return make(pose(travelLeg, leaveOffset + progress, false, reversal), 'departure', !!reportedLeave);
    };
    return [frame];
  });
  return { unresolvedPlatforms: [...unresolvedPlatforms].sort(), unresolvedRoutes, unmatchedReports, trainsAt: (at: number) => plans.flatMap(frame => frame(at)) };
}
