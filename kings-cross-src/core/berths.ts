// Evidence-led TD berth placement. Missing evidence stays visible instead of becoming a guess.
import { NOT_A_TRAIN } from './anchors.ts';
import type { AnchorMap, BerthAnchor, UnmappedBerth } from './anchors.ts';
import { dist } from './geo.ts';
import type { Pt } from './geo.ts';
import { buildGraph, shortestPath, snap } from './graph.ts';
import type { Graph, Edge } from './graph.ts';
import type { KxData } from './osm.ts';
import { platformSouthEnd, stationPlatforms } from './station.ts';

export interface RecordingEvent {
  t: number;
  e: { kind: string; area: string; descr?: string; from?: string; to?: string; time?: number | null };
}
export interface SmartRow { [key: string]: unknown }
export interface AnchorOptions { area?: string; sources?: string[]; nominalSpeedMps?: number; calibrate?: boolean }
export interface SignalTrial {
  berth: string; signalId: number; role: 'berth' | 'starter'; placed: boolean;
  distanceM: number | null; directionOk: boolean; trusted: boolean; detail: string;
  method: 'topology' | 'chain' | 'boundary' | 'starter';
}
export interface StepCheck {
  from: string; to: string; count: number; timed: number;
  seconds: number | null; lengthM: number | null; speedMps: number | null;
  reversal: boolean; issues: string[];
}
interface Step { from: string; to: string; count: number; seconds: number[] }
interface Observations { seen: Map<string, number>; steps: Map<string, Step>; ignored: number }
const key = (a: string, b: string): string => `${a}\0${b}`;
const median = (ns: number[]): number => {
  const s = [...ns].sort((a, b) => a - b);
  const i = Math.floor(s.length / 2);
  return s.length % 2 ? s[i]! : (s[i - 1]! + s[i]!) / 2;
};
const text = (row: SmartRow, k: string): string => String(row[k] ?? '').trim();

/** Times measure entry into A to the step A->B, never the gap between unrelated trains. */
function observe(recordings: RecordingEvent[][], area: string): Observations {
  const seen = new Map<string, number>();
  const steps = new Map<string, Step>();
  let ignored = 0;
  for (const recording of recordings) {
    const occupancy = new Map<string, { descr: string; time: number }>();
    for (const { t, e } of recording) {
      if (e.area !== area || !['step', 'interpose', 'cancel'].includes(e.kind)) continue;
      const berths = e.kind === 'step' ? [e.from, e.to] : [e.kind === 'cancel' ? e.from : e.to];
      for (const b of new Set(berths)) if (b) seen.set(b, (seen.get(b) ?? 0) + (e.kind === 'step' ? 1 : 0));
      // Inventory placeholders too; their transitions are not track or timing evidence.
      if (e.descr === NOT_A_TRAIN) {
        ignored++;
        for (const b of berths) if (b) occupancy.delete(b);
        continue;
      }
      if (!e.descr) {
        for (const b of berths) if (b) occupancy.delete(b);
        continue;
      }
      const time = e.kind === 'step' && Number.isFinite(e.time) ? e.time! : t;
      if (e.kind === 'step' && e.from && e.to) {
        const k = key(e.from, e.to);
        const s = steps.get(k) ?? { from: e.from, to: e.to, count: 0, seconds: [] };
        s.count++;
        const entry = occupancy.get(e.from);
        if (entry?.descr === e.descr && Number.isFinite(time) && time >= entry.time) s.seconds.push((time - entry.time) / 1000);
        steps.set(k, s);
        occupancy.delete(e.from);
        occupancy.set(e.to, { descr: e.descr, time });
      } else if (e.kind === 'interpose' && e.to) occupancy.set(e.to, { descr: e.descr, time });
      else if (e.kind === 'cancel' && e.from) occupancy.delete(e.from);
    }
  }
  return { seen, steps, ignored };
}

function anchor(berth: string, kind: BerthAnchor['kind'], g: Graph, edge: Edge, t: number, forward: boolean, errorM: number, evidence: string): BerthAnchor {
  const a = g.pos.get(edge.a)!;
  const b = g.pos.get(edge.b)!;
  return {
    berth, kind, from: forward ? edge.a : edge.b, to: forward ? edge.b : edge.a,
    t: forward ? t : 1 - t,
    point: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], errorM, evidence,
  };
}

/** Match terminal tracks one-to-one in platform order; nearest independently reuses island tracks. */
function platformAnchors(data: KxData, g: Graph): Map<string, BerthAnchor> {
  const platforms = [...stationPlatforms(data)].filter(([r]) => /^(?:[0-9]|10)$/.test(r)).sort((a, b) => Number(a[0]) - Number(b[0]));
  const tagged = new Set(data.buffers.map((b) => b.id));
  const ends = [...g.adj].filter(([id, edges]) => edges.length === 1 && !edges[0]!.tunnel && platforms.some(([, p]) => dist(g.pos.get(id)!, platformSouthEnd(p.pts)) < 40))
    .map(([id]) => id).sort((a, b) => g.pos.get(b)![0] - g.pos.get(a)![0]);
  // Dynamic programming allows unrelated terminal tracks to be skipped without shifting all platforms.
  const solve = (i: number, j: number): { cost: number; ids: (number | null)[] } => {
    const k = `${i}:${j}`;
    const cached = memo.get(k);
    if (cached) return cached;
    if (i === platforms.length) return { cost: 0, ids: [] };
    if (j === ends.length) return { cost: 1000 * (platforms.length - i), ids: platforms.slice(i).map(() => null) };
    const skipped = solve(i, j + 1);
    const tail = solve(i + 1, j + 1);
    const d = dist(platformSouthEnd(platforms[i]![1].pts), g.pos.get(ends[j]!)!);
    const chosen = { cost: d > 40 ? Infinity : d + tail.cost, ids: [ends[j]!, ...tail.ids] };
    const missingTail = solve(i + 1, j);
    const missing = { cost: 1000 + missingTail.cost, ids: [null, ...missingTail.ids] };
    const bestMatch = chosen.cost <= skipped.cost ? chosen : skipped;
    const result = missing.cost < bestMatch.cost ? missing : bestMatch;
    memo.set(k, result);
    return result;
  };
  const memo = new Map<string, { cost: number; ids: (number | null)[] }>();
  const result = solve(0, 0);
  const out = new Map<string, BerthAnchor>();
  platforms.forEach(([ref], i) => {
    const id = result.ids[i];
    if (id === null || id === undefined) return;
    const edge = g.adj.get(id)![0]!;
    const a = anchor(String(1000 + Number(ref)), 'platform', g, edge, edge.a === id ? 0 : 1, edge.b === id, tagged.has(id) ? 5 : 15,
      `Platform ${ref}: ordered terminal-track match to OSM ${tagged.has(id) ? 'buffer stop' : 'degree-one track end (buffer tag absent)'} ${id}; heading toward terminal`);
    a.platform = ref;
    out.set(a.berth, a);
  });
  return out;
}

interface Segment { from: number; to: number; start: Pt; end: Pt; length: number }
interface TrackPath { segments: Segment[]; length: number }
const fraction = (g: Graph, a: BerthAnchor, node: number): Segment => ({
  from: a.from, to: node, start: a.point, end: g.pos.get(node)!, length: dist(a.point, g.pos.get(node)!),
});

/** Four endpoint choices plus the direct same-edge route retain the fractional anchor positions. */
function routeBetween(g: Graph, a: BerthAnchor, b: BerthAnchor): TrackPath | null {
  let best: TrackPath | null = null;
  const take = (segments: Segment[]): void => {
    const useful = segments.filter((s) => s.length > 1e-7);
    const length = useful.reduce((n, s) => n + s.length, 0);
    if (!best || length < best.length) best = { segments: useful, length };
  };
  if ((a.from === b.from && a.to === b.to) || (a.from === b.to && a.to === b.from)) {
    const forward = b.t * (a.from === b.from ? 1 : -1) + (a.from === b.from ? 0 : 1) >= a.t;
    take([{ from: forward ? a.from : a.to, to: forward ? a.to : a.from, start: a.point, end: b.point, length: dist(a.point, b.point) }]);
  }
  for (const x of [a.from, a.to]) for (const y of [b.from, b.to]) {
    const middle = shortestPath(g, x, y);
    if (!middle) continue;
    const first = fraction(g, a, x);
    first.from = x === a.from ? a.to : a.from;
    const segments = [first];
    for (let i = 1; i < middle.nodes.length; i++) {
      const from = middle.nodes[i - 1]!;
      const to = middle.nodes[i]!;
      segments.push({ from, to, start: g.pos.get(from)!, end: g.pos.get(to)!, length: dist(g.pos.get(from)!, g.pos.get(to)!) });
    }
    segments.push({ from: y, to: y === b.from ? b.to : b.from, start: g.pos.get(y)!, end: b.point, length: dist(g.pos.get(y)!, b.point) });
    take(segments);
  }
  return best;
}

/** Dijkstra on incoming edges: a junction cannot reset the train's heading. */
function directedRoute(g: Graph, a: BerthAnchor, b: BerthAnchor): TrackPath | null {
  const direct = routeBetween(g, a, b);
  if (!direct || !routeReverses(g, direct, a, b)) return direct;
  type State = { node: number; incoming: Pt; distance: number; segments: Segment[]; id: string };
  const open: State[] = [];
  const best = new Map<string, number>();
  const push = (s: State): void => {
    if ((best.get(s.id) ?? Infinity) <= s.distance) return;
    best.set(s.id, s.distance); open.push(s);
    let i = open.length - 1;
    while (i > 0) { const p = (i - 1) >> 1; if (open[p]!.distance <= s.distance) break; open[i] = open[p]!; i = p; }
    open[i] = s;
  };
  const pop = (): State => {
    const top = open[0]!; const last = open.pop()!;
    if (open.length) {
      let i = 0;
      for (;;) { let c = i * 2 + 1; if (c >= open.length) break; if (c + 1 < open.length && open[c + 1]!.distance < open[c]!.distance) c++;
        if (last.distance <= open[c]!.distance) break; open[i] = open[c]!; i = c; }
      open[i] = last;
    }
    return top;
  };
  const heading = vector(g.pos.get(a.from)!, g.pos.get(a.to)!);
  for (const node of [a.from, a.to]) {
    const end = g.pos.get(node)!; const v = vector(a.point, end); const length = dist(a.point, end);
    if (length > 1e-7 && a.kind !== 'platform' && opposed(heading, v)) continue;
    const s = fraction(g, a, node); s.from = node === a.from ? a.to : a.from;
    push({ node, incoming: length ? v : heading, distance: length, segments: length ? [s] : [], id: `start:${node}` });
  }
  let result: TrackPath | null = null;
  while (open.length) {
    const s = pop();
    if (s.distance > (best.get(s.id) ?? Infinity)) continue;
    if (result && s.distance >= result.length) break;
    if (s.node === b.from || s.node === b.to) {
      const v = vector(g.pos.get(s.node)!, b.point); const length = dist(g.pos.get(s.node)!, b.point);
      const finalHeading = length ? v : s.incoming;
      if ((!length || !opposed(s.incoming, v)) && (b.kind === 'platform' || !opposed(finalHeading, vector(g.pos.get(b.from)!, g.pos.get(b.to)!)))) {
        const last: Segment = { from: s.node, to: s.node === b.from ? b.to : b.from, start: g.pos.get(s.node)!, end: b.point, length };
        const candidate = { length: s.distance + length, segments: length ? [...s.segments, last] : s.segments };
        if (!result || candidate.length < result.length) result = candidate;
      }
    }
    for (const e of g.adj.get(s.node) ?? []) {
      const to = e.a === s.node ? e.b : e.a; const v = vector(g.pos.get(s.node)!, g.pos.get(to)!);
      if (opposed(s.incoming, v)) continue;
      push({ node: to, incoming: v, distance: s.distance + e.length, id: key(String(s.node), String(to)),
        segments: [...s.segments, { from: s.node, to, start: g.pos.get(s.node)!, end: g.pos.get(to)!, length: e.length }] });
    }
  }
  return result;
}

/** Northward routes form a DAG here; keep every feasible branch instead of one remote-root tree. */
function northReach(g: Graph, start: number): Map<number, { distance: number; nodes: number[] }> {
  const out = new Map<number, { distance: number; nodes: number[] }>([[start, { distance: 0, nodes: [start] }]]);
  const nodes = [...g.pos.keys()].sort((a, b) => g.pos.get(b)![1] - g.pos.get(a)![1]);
  for (const node of nodes) {
    const current = out.get(node); if (!current) continue;
    for (const edge of g.adj.get(node) ?? []) {
      const to = edge.a === node ? edge.b : edge.a;
      if (g.pos.get(to)![1] >= g.pos.get(node)![1] - 1e-5) continue;
      const distance = current.distance + edge.length;
      if (distance < (out.get(to)?.distance ?? Infinity)) out.set(to, { distance, nodes: [...current.nodes, to] });
    }
  }
  return out;
}

function pathNodes(g: Graph, nodes: number[]): TrackPath {
  const segments = nodes.slice(1).map((to, i): Segment => ({ from: nodes[i]!, to, start: g.pos.get(nodes[i]!)!, end: g.pos.get(to)!, length: dist(g.pos.get(nodes[i]!)!, g.pos.get(to)!) }));
  return { segments, length: segments.reduce((sum, s) => sum + s.length, 0) };
}

function reversePath(path: TrackPath): TrackPath {
  return { length: path.length, segments: [...path.segments].reverse().map((s) => ({ ...s, from: s.to, to: s.from, start: s.end, end: s.start })) };
}

function onPath(g: Graph, route: TrackPath, distance: number, berth: string, evidence: string): BerthAnchor | null {
  let remaining = Math.max(0, Math.min(distance, route.length));
  for (const s of route.segments) {
    if (remaining <= s.length + 1e-7) {
      const edge = g.adj.get(s.from)?.find((e) => e.a === s.to || e.b === s.to);
      if (!edge) return null;
      const ratio = Math.min(1, remaining / s.length);
      const point: Pt = [s.start[0] + (s.end[0] - s.start[0]) * ratio, s.start[1] + (s.end[1] - s.start[1]) * ratio];
      const ea = g.pos.get(edge.a)!;
      const t = edge.length ? Math.min(1, dist(ea, point) / edge.length) : 0;
      return anchor(berth, 'inferred', g, edge, t, edge.b === s.to, Math.max(50, route.length / 3), evidence);
    }
    remaining -= s.length;
  }
  return null;
}

const SETBACK_M = 25;
const SIGNAL_TOLERANCE_M = 40;

function signalPoint(data: KxData, g: Graph, signal: KxData['signals'][number], berth: string): BerthAnchor | null {
  const forward = signal.direction !== 'backward';
  const incident = g.edges.filter((e) => e.a === signal.id || e.b === signal.id);
  const chosen = incident.find((e) => forward ? e.a === signal.id : e.b === signal.id) ?? incident[0];
  const snapped = snap(chosen ? { ...g, edges: [chosen] } : g, [signal.x, signal.z]);
  if (!snapped || snapped.distance > 25) return null;
  return anchor(berth, 'signal', g, snapped.edge, snapped.t, forward,
    signal.direction === 'forward' || signal.direction === 'backward' ? 5 : 30,
    `OSM signal ${JSON.stringify(signal.ref ?? 'unreferenced')} (node ${signal.id}), snapped ${snapped.distance.toFixed(1)} m; direction ${signal.direction ?? 'missing (way-forward assumed)'}`);
}

function northBoundaries(data: KxData, g: Graph, platforms: BerthAnchor[]): number[] {
  const ecml = new Set(data.rails.filter((r) => r.ref === 'ECM1').flatMap((r) => r.nodes));
  const reachable = new Set<number>();
  for (const p of platforms) for (const n of northReach(g, p.to).keys()) reachable.add(n);
  const candidates = [...g.adj].filter(([n, edges]) => edges.length === 1 && reachable.has(n) && (!ecml.size || ecml.has(n)) &&
    platforms.some((p) => g.pos.get(n)![1] < p.point[1] - 100)).map(([n]) => n);
  if (!candidates.length) return [];
  const north = Math.min(...candidates.map((n) => g.pos.get(n)![1]));
  return candidates.filter((n) => g.pos.get(n)![1] <= north + 100);
}

function northPath(g: Graph, a: BerthAnchor, boundaries: number[]): TrackPath | null {
  const node = g.pos.get(a.from)![1] < g.pos.get(a.to)![1] ? a.from : a.to;
  const first: Segment = { from: node === a.from ? a.to : a.from, to: node, start: a.point, end: g.pos.get(node)!, length: dist(a.point, g.pos.get(node)!) };
  const reach = northReach(g, node);
  let best: TrackPath | null = null;
  for (const boundary of boundaries) {
    const r = reach.get(boundary); if (!r) continue;
    const tail = pathNodes(g, r.nodes);
    const route = { length: first.length + tail.length, segments: first.length > 1e-7 ? [first, ...tail.segments] : tail.segments };
    const heading = vector(g.pos.get(a.from)!, g.pos.get(a.to)!);
    const northHeading: Pt = heading[1] > 0 ? [-heading[0], -heading[1]] : heading;
    if (!route.segments.length || (a.kind !== 'platform' && opposed(northHeading, vector(route.segments[0]!.start, route.segments[0]!.end))) ||
      route.segments.slice(1).some((s, i) => opposed(vector(route.segments[i]!.start, route.segments[i]!.end), vector(s.start, s.end)))) continue;
    if (!best || route.length < best.length) best = route;
  }
  return best;
}

/** Find the nearest common northern junction, retaining alternate paths to each platform. */
function fanAnchor(data: KxData, g: Graph, berth: string, targets: BerthAnchor[], arrival: boolean, boundaries: number[]): BerthAnchor | null {
  const unique = [...new Map(targets.map((a) => [a.platform ?? a.berth, a])).values()];
  if (!unique.length) return null;
  const trees = unique.map((a) => northReach(g, a.to));
  const platformMap = stationPlatforms(data);
  const northLimit = Math.min(...unique.map((a) => a.platform ? Math.min(...platformMap.get(a.platform)!.pts.map((p) => p[1])) : a.point[1]));
  const candidates: { node: number; score: number }[] = [];
  for (const [node, edges] of g.adj) {
    if (edges.length < 3 || g.pos.get(node)![1] >= northLimit - 1) continue;
    const paths = trees.map((tree) => tree.get(node));
    if (paths.some((r) => !r)) continue;
    candidates.push({ node, score: Math.max(...paths.map((r, i) => r!.distance - dist(unique[i]!.point, g.pos.get(unique[i]!.to)!))) });
  }
  candidates.sort((a, b) => a.score - b.score || a.node - b.node);
  for (const { node } of candidates) {
    const south = trees[0]!.get(node)!.nodes.at(-2); if (south === undefined) continue;
    const edge = g.adj.get(node)!.find((e) => e.a === south || e.b === south)!;
    const start = anchor(berth, 'inferred', g, edge, edge.a === node ? 0 : 1, edge.a === node, 75, '');
    const north = northPath(g, start, boundaries); if (!north || north.length < SETBACK_M) continue;
    let placed = onPath(g, north, SETBACK_M, berth, `Topology ${unique.every((a) => a.kind === 'platform') ? 'platform' : 'junction'} ${arrival ? 'fan-out to' : 'fan-in from'} ${unique.map((a) => a.berth).join(', ')}; nearest shared northern junction ${node}; ${SETBACK_M} m set-back on its shared track (signal clearance assumption)`);
    if (!placed) continue;
    if (arrival) placed = { ...placed, from: placed.to, to: placed.from, t: 1 - placed.t };
    placed.errorM = 75;
    if (!unique.every((target) => directedRoute(g, arrival ? placed! : target, arrival ? target : placed!) !== null)) continue;
    const matches: { a: BerthAnchor; distance: number }[] = [];
    for (const signal of data.signals) {
      // Protection/speed boards are not stop signals, even though OSM calls them railway=signal.
      if (signal.ref || !['forward', 'backward'].includes(signal.direction ?? '') || !signal.kinds.includes('main')) continue;
      const a = signalPoint(data, g, signal, berth); if (!a) continue;
      const onSharedTrack = north.segments.some((s) => (s.from === a.from && s.to === a.to) || (s.to === a.from && s.from === a.to));
      if (!onSharedTrack || opposed(vector(g.pos.get(placed.from)!, g.pos.get(placed.to)!), vector(g.pos.get(a.from)!, g.pos.get(a.to)!))) continue;
      const distance = routeBetween(g, placed, a)?.length ?? Infinity;
      if (distance <= SIGNAL_TOLERANCE_M && unique.every((target) => directedRoute(g, arrival ? a : target, arrival ? target : a) !== null)) matches.push({ a, distance });
    }
    matches.sort((a, b) => a.distance - b.distance);
    if (matches.length && (matches.length === 1 || matches[1]!.distance - matches[0]!.distance > 5)) {
      const match = matches[0]!;
      return { ...match.a, errorM: 15, evidence: `${placed.evidence}; matched unreferenced main signal within ${match.distance.toFixed(1)} m: ${match.a.evidence}; identity inferred from topology` };
    }
    return placed;
  }
  return null;
}

function starterAnchor(data: KxData, g: Graph, platform: BerthAnchor): BerthAnchor | null {
  const polygon = stationPlatforms(data).get(platform.platform ?? '');
  if (!polygon) return null;
  const boundary = Math.min(...polygon.pts.map((p) => p[1]));
  const north = northPath(g, platform, northBoundaries(data, g, [platform]));
  if (!north) return null;
  let distance = 0;
  for (const segment of north.segments) {
    if (segment.end[1] <= boundary && segment.start[1] >= boundary) {
      distance += segment.length * (segment.start[1] - boundary) / (segment.start[1] - segment.end[1]);
      const a = onPath(g, north, distance + 10, platform.berth, 'Starter estimate: 10 m north of platform polygon end, on the terminal track; not the arrival buffer anchor');
      if (a) a.errorM = 40;
      return a;
    }
    distance += segment.length;
  }
  return null;
}

/** Only locations explicitly known to be beyond this extract seed outside classification. */
function isOutside(row: SmartRow): boolean {
  return /^(?:FINS|HORN|HRNS|HRGY|HARGY|HARR|FERME|MORGAT|DRAYTON|HIGH&IS|HIGHBY|ESSEX|OLDST)/i.test(text(row, 'STANME')) || text(row, 'STANOX') === '54238';
}

function buildMap(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], options: AnchorOptions = {}, keepRejected = false, proposals?: Map<string, BerthAnchor[]>): AnchorMap {
  const area = options.area ?? 'Y9';
  const g = buildGraph(data);
  const observed = observe(recordings, area);
  const anchors = platformAnchors(data, g);
  const conflicts = new Map<string, string>();
  const inside = new Set<string>();
  const outside = new Map<string, Set<string>>();
  const rows = smart.filter((r) => text(r, 'TD') === area);
  for (const r of rows) {
    const berths = [text(r, 'FROMBERTH'), text(r, 'TOBERTH')].filter(Boolean);
    if (text(r, 'STANOX') === '54311') for (const b of berths) inside.add(b);
    if (isOutside(r)) for (const b of berths) {
      const reasons = outside.get(b) ?? new Set<string>();
      reasons.add(`${text(r, 'STANME')} (STANOX ${text(r, 'STANOX')})`);
      outside.set(b, reasons);
    }
    // SMART associates these alternate descriptions with a platform, not a separate metric point.
    const ref = text(r, 'PLATFORM');
    const base = anchors.get(String(1000 + Number(ref)));
    if (text(r, 'STANOX') === '54311' && ref !== '' && base) for (const b of berths) {
      if (b === `B${ref.padStart(3, '0')}` && observed.seen.has(b)) anchors.set(b, { ...base, berth: b, errorM: 100,
        evidence: `${base.evidence}; SMART platform association; co-location with numbered berth is an assumption, alternate berth role unresolved` });
    }
  }
  // The partner naming convention is supplied independently of observed placeholder transitions.
  for (const [b] of observed.seen) {
    const match = /^B(\d{3})$/.exec(b);
    const base = match ? anchors.get(String(1000 + Number(match[1]))) : undefined;
    if (base && !anchors.has(b)) anchors.set(b, { ...base, berth: b, errorM: 150,
      evidence: `${base.evidence}; partner naming convention; co-location assumed, no separate stopping position established` });
  }
  for (const signal of data.signals) {
    const match = /^YA\s*(\d{4})$/i.exec(signal.ref ?? '');
    const berth = match?.[1];
    if (!berth || !observed.seen.has(berth)) continue;
    const platform = anchors.get(berth);
    if (platform?.kind === 'platform') {
      platform.evidence += `; also OSM starter ${JSON.stringify(signal.ref)} (node ${signal.id}), not a second berth or the arrival stop`;
      continue;
    }
    const a = signalPoint(data, g, signal, berth);
    if (!a) { conflicts.set(berth, 'YA signal cannot be snapped within 25 m of a rail'); continue; }
    const previous = anchors.get(berth);
    if (previous && dist(previous.point, a.point) > 75) conflicts.set(berth, 'YA signal matches disagree by more than 75 m');
    else anchors.set(berth, a);
  }
  for (const b of conflicts.keys()) anchors.delete(b);
  for (const b of inside) outside.delete(b);
  for (const b of anchors.keys()) outside.delete(b);

  const next = new Map<string, Set<string>>();
  const prev = new Map<string, Set<string>>();
  const neighbours = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, a: string, b: string): void => { const set = map.get(a) ?? new Set<string>(); set.add(b); map.set(a, set); };
  for (const s of observed.steps.values()) {
    if (s.from === s.to) continue;
    add(next, s.from, s.to); add(prev, s.to, s.from);
    add(neighbours, s.from, s.to); add(neighbours, s.to, s.from);
  }
  const details = new Map<string, string>();
  const boundaries = northBoundaries(data, g, [...anchors.values()].filter((a) => a.kind === 'platform' && !a.berth.startsWith('B')));
  // Build the throat outward: a new junction can bound the next fan farther north.
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const berth of observed.seen.keys()) {
      if (anchors.has(berth) || outside.has(berth) || conflicts.has(berth)) continue;
      const successors = [...(next.get(berth) ?? [])];
      const predecessors = [...(prev.get(berth) ?? [])];
      const groups: { ids: string[]; arrival: boolean }[] = [{ ids: successors, arrival: true }, { ids: predecessors, arrival: false }];
      for (const { ids, arrival } of groups) {
        if (!ids.length || !ids.every((b) => anchors.has(b))) continue;
        const targets = ids.map((b) => anchors.get(b)!);
        if (targets.some((a) => a.kind !== 'platform' && (g.pos.get(a.to)![1] > g.pos.get(a.from)![1]) !== arrival)) continue;
        // One platform still constrains its track's first northern junction; a lone signal does not.
        if (targets.length < 2 && targets[0]!.kind !== 'platform') continue;
        // A merge of already-running lines does not imply the next stop signal is right at it.
        if (!arrival && targets.some((a) => a.kind !== 'platform')) continue;
        const candidate = fanAnchor(data, g, berth, targets, arrival, boundaries);
        if (candidate) { anchors.set(berth, candidate); changed = true; break; }
        details.set(berth, `No shared directed northern junction for ${arrival ? 'successors' : 'predecessors'} ${ids.join(', ')} with a ${SETBACK_M} m shared-track set-back`);
      }
    }
    if (!changed) break;
  }
  // Do not infer through a junction of competing berth chains or beyond an outside boundary.
  const fixed = new Map(anchors);
  for (const [start, a] of fixed) for (const first of next.get(start) ?? []) {
    const chain = [start];
    let at = first;
    const visited = new Set(chain);
    while (!fixed.has(at) && !outside.has(at) && !conflicts.has(at) && !visited.has(at) && prev.get(at)?.size === 1 && next.get(at)?.size === 1) {
      visited.add(at); chain.push(at); at = [...next.get(at)!][0]!;
    }
    const b = fixed.get(at);
    if (!b || at === start || chain.length < 2) continue;
    chain.push(at);
    const route = directedRoute(g, a, b);
    if (!route || routeReverses(g, route, a, b)) {
      for (const berth of chain.slice(1, -1)) conflicts.set(berth,
        `Observed chain ${chain.join(' -> ')} has ${route ? 'incompatible anchor headings on its shortest path' : 'disconnected graph anchors'}; no defensible interpolated position`);
      continue;
    }
    if (route.length < 1) continue;
    const durations = chain.slice(1).map((to, i) => observed.steps.get(key(chain[i]!, to))!.seconds);
    // Platform residence includes the station dwell: it cannot be converted into distance.
    const platformBounded = a.kind === 'platform' || b.kind === 'platform';
    const timed = !platformBounded && durations.every((s) => s.length > 0 && median(s) > 0);
    const weights = durations.map((s) => timed ? median(s) : 1);
    const total = weights.reduce((n, w) => n + w, 0);
    let accumulated = 0;
    for (let i = 1; i + 1 < chain.length; i++) {
      accumulated += weights[i - 1]!;
      const berth = chain[i]!;
      const inferred = onPath(g, route, route.length * accumulated / total, berth,
        `Unique observed chain ${chain.join(' -> ')}; graph shortest path ${route.length.toFixed(1)} m; ${timed ? 'median residence-time ratio' : platformBounded ? 'equal intervals (platform dwell is not travel time)' : 'equal intervals (incomplete timings)'}; no straight-line interpolation`);
      if (inferred) anchors.set(berth, inferred);
    }
  }
  // Branches are usable when every branch is bounded and its directed position agrees.
  const bounds = (start: string, links: Map<string, Set<string>>, reverse: boolean): string[][] | null => {
    const found: string[][] = [];
    const visit = (at: string, chain: string[]): boolean => {
      if (chain.includes(at) || chain.length > 8 || outside.has(at) || conflicts.has(at)) return false;
      const path = [...chain, at];
      if (anchors.has(at)) { found.push(reverse ? path.reverse() : path); return true; }
      const adjacent = [...(links.get(at) ?? [])];
      return adjacent.length > 0 && adjacent.every((b) => visit(b, path));
    };
    const adjacent = [...(links.get(start) ?? [])];
    return adjacent.length && adjacent.every((b) => visit(b, [start])) ? found : null;
  };
  for (const berth of observed.seen.keys()) {
    if (anchors.has(berth) || outside.has(berth) || conflicts.has(berth)) continue;
    const before = bounds(berth, prev, true); const after = bounds(berth, next, false);
    if (!before || !after) continue;
    const candidates: BerthAnchor[] = [];
    let invalid = false;
    for (const left of before) for (const right of after) {
      const a = anchors.get(left[0]!)!; const b = anchors.get(right.at(-1)!)!;
      const route = directedRoute(g, a, b);
      if (!route || route.length < 1) { invalid = true; continue; }
      const chain = [...left, ...right.slice(1)];
      const times = chain.slice(1).map((to, i) => observed.steps.get(key(chain[i]!, to))?.seconds ?? []);
      const timed = a.kind !== 'platform' && b.kind !== 'platform' && times.every((t) => t.length && median(t) > 0);
      const weights = times.map((t) => timed ? median(t) : 1);
      const ratio = weights.slice(0, left.length - 1).reduce((n, w) => n + w, 0) / weights.reduce((n, w) => n + w, 0);
      const candidate = onPath(g, route, route.length * ratio, berth,
        `Branching chain ${chain.join(' -> ')}; heading-compatible graph route; ${timed ? 'median residence-time ratio' : 'equal intervals (platform dwell or incomplete timings)'}`);
      if (candidate) candidates.push(candidate);
    }
    proposals?.set(berth, candidates);
    const disagree = invalid || candidates.some((a) => candidates.some((b) => (routeBetween(g, a, b)?.length ?? Infinity) > 75 || opposed(vector(g.pos.get(a.from)!, g.pos.get(a.to)!), vector(g.pos.get(b.from)!, g.pos.get(b.to)!))));
    if (candidates.length && !disagree) {
      candidates.sort((a, b) => a.errorM - b.errorM);
      anchors.set(berth, { ...candidates[0]!, evidence: `${candidates[0]!.evidence}; ${candidates.length} bounding route estimates agree within 75 m along graph` });
    } else if (candidates.length || invalid) conflicts.set(berth, `Directed branch estimates for ${berth} disagree by more than 75 m, or one bounding route is disconnected/reversing`);
  }
  const nominalSpeed = options.nominalSpeedMps ?? 15;
  if (!(nominalSpeed > 0 && nominalSpeed <= 50)) throw new Error('nominalSpeedMps must be in (0, 50]');
  // Only continue a station-connected line north. External SMART seeds remain barriers.
  for (let pass = 0; pass < 12; pass++) {
    let changed = false;
    for (const step of observed.steps.values()) {
      for (const backwards of [false, true]) {
        const source = backwards ? step.to : step.from; const berth = backwards ? step.from : step.to;
        const a = anchors.get(source);
        if (!a || a.kind === 'platform' || anchors.has(berth) || outside.has(berth) || conflicts.has(berth)) continue;
        const southbound = g.pos.get(a.to)![1] > g.pos.get(a.from)![1];
        if (southbound !== backwards) continue;
        if (!step.seconds.length || median(step.seconds) <= 0) { details.set(berth, `Northward continuation from ${source} has no positive matched residence timing; cannot space it on a line`); continue; }
        const path = northPath(g, a, boundaries);
        if (!path) { details.set(berth, `No heading-compatible northern boundary continuation from ${source}`); continue; }
        const seconds = median(step.seconds); const distance = nominalSpeed * seconds;
        const error = Math.max(100, a.errorM + distance * .4);
        if (distance > path.length) {
          const terminal = path.segments.at(-1)!.to;
          if (distance - error > path.length) {
            outside.set(berth, new Set([`north boundary node ${terminal}; ${source} has ${path.length.toFixed(1)} m remaining, ${seconds.toFixed(1)} s at nominal ${nominalSpeed} m/s needs ${distance.toFixed(1)} +/- ${error.toFixed(1)} m`]));
          } else details.set(berth, `Nominal continuation from ${source}: ${distance.toFixed(1)} +/- ${error.toFixed(1)} m straddles north extract boundary ${path.length.toFixed(1)} m away; cannot decide inside versus outside`);
          continue;
        }
        let candidate = onPath(g, path, distance, berth,
          `Boundary continuation north from ${source}: median ${seconds.toFixed(1)} s at nominal ${nominalSpeed} m/s, ${distance.toFixed(1)} m on the graph; boundary node ${path.segments.at(-1)!.to} at ${path.length.toFixed(1)} m; speed/residence assumption`);
        if (!candidate) continue;
        if (backwards) candidate = { ...candidate, from: candidate.to, to: candidate.from, t: 1 - candidate.t };
        candidate.errorM = error;
        anchors.set(berth, candidate); changed = true;
      }
    }
    if (!changed) break;
  }
  // Never retain a generated anchor when an observed neighbouring step has no directed route.
  for (let pass = 0; !keepRejected && pass < anchors.size; pass++) {
    let changed = false;
    for (const step of observed.steps.values()) {
      const a = anchors.get(step.from); const b = anchors.get(step.to);
      if (!a || !b || directedRoute(g, a, b)) continue;
      const generated = [a, b].filter((a) => a.kind === 'inferred' || a.evidence.startsWith('Topology')).sort((a, b) => b.errorM - a.errorM);
      if (!generated.length) continue;
      const removed = generated[0]!;
      anchors.delete(removed.berth);
      conflicts.set(removed.berth, `Step ${step.from} -> ${step.to} has no graph route respecting both headings without reversal; rejected candidate: ${removed.evidence}`);
      changed = true;
    }
    if (!changed) break;
  }
  const unmapped = new Map<string, UnmappedBerth>();
  for (const [berth, seen] of observed.seen) {
    if (anchors.has(berth)) continue;
    if (conflicts.has(berth)) { unmapped.set(berth, { berth, seen, reason: 'conflict', detail: conflicts.get(berth)! }); continue; }
    // Reachability stops at known external or internal locations; never flood through an anchor.
    const visited = new Set<string>();
    const stack = [berth];
    const locations = new Set<string>();
    let reachesInside = false;
    while (stack.length) {
      const b = stack.pop()!;
      if (visited.has(b)) continue;
      visited.add(b);
      if (anchors.has(b) || inside.has(b)) { reachesInside = true; continue; }
      const external = outside.get(b);
      if (external) { for (const loc of external) locations.add(loc); continue; }
      for (const n of neighbours.get(b) ?? []) stack.push(n);
    }
    const external = locations.size > 0 && !reachesInside;
    unmapped.set(berth, { berth, seen, reason: external ? 'outside-network' : 'no-evidence',
      detail: external ? `Observed chains reach only known locations outside the extract, stopping at ${[...locations].sort().join(', ')}; no route to an internal anchor without crossing that boundary`
        : `Berth ${berth}: predecessors [${[...(prev.get(berth) ?? [])].join(', ')}], successors [${[...(next.get(berth) ?? [])].join(', ')}]. ${details.get(berth) ?? 'No bounded, agreeing directed route or common northern junction; no positive timed continuation from an anchored station line'}. SMART offsets supply no metric point` });
  }
  const order = <T extends { berth: string }>(items: T[]): T[] => items.sort((a, b) => a.berth.localeCompare(b.berth));
  return { area, sources: options.sources ?? [data.attribution], anchors: order([...anchors.values()]), unmapped: order([...unmapped.values()]) };
}

const vector = (a: Pt, b: Pt): Pt => [b[0] - a[0], b[1] - a[1]];
const opposed = (a: Pt, b: Pt): boolean => a[0] * b[0] + a[1] * b[1] < -0.1 * Math.hypot(...a) * Math.hypot(...b);

function routeReverses(g: Graph, route: TrackPath, a: BerthAnchor, b: BerthAnchor): boolean {
  if (!route.segments.length) return false;
  const vectors = route.segments.map((x) => vector(x.start, x.end));
  const wrongStart = a.kind !== 'platform' && opposed(vector(g.pos.get(a.from)!, g.pos.get(a.to)!), vectors[0]!);
  const wrongEnd = b.kind !== 'platform' && opposed(vector(g.pos.get(b.from)!, g.pos.get(b.to)!), vectors.at(-1)!);
  return wrongStart || wrongEnd || vectors.slice(1).some((v, i) => opposed(vectors[i]!, v));
}

function inferenceMethod(a: BerthAnchor): SignalTrial['method'] {
  return a.evidence.startsWith('Topology platform') ? 'topology' : a.evidence.startsWith('Boundary') ? 'boundary' : 'chain';
}

/** A held-out signal is removed entirely, not merely stripped of its ref. */
export function leaveOneOut(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], options: AnchorOptions = {}): SignalTrial[] {
  const area = options.area ?? 'Y9';
  const observed = observe(recordings, area);
  const g = buildGraph(data);
  const trials: SignalTrial[] = [];
  for (const signal of data.signals) {
    const berth = /^YA\s*(\d{4})$/i.exec(signal.ref ?? '')?.[1];
    if (!berth || !observed.seen.has(berth)) continue;
    const expected = signalPoint(data, g, signal, berth); if (!expected) continue;
    const hidden = { ...data, signals: data.signals.filter((s) => s.id !== signal.id) };
    const proposals = new Map<string, BerthAnchor[]>();
    const map = buildMap(hidden, recordings, smart, options, true, proposals);
    let actual = map.anchors.find((a) => a.berth === berth);
    const starter = actual?.kind === 'platform';
    if (starter) actual = starterAnchor(hidden, g, actual!) ?? undefined;
    const path = actual ? routeBetween(g, actual, expected) : null;
    const distanceM = path?.length ?? null;
    const actualHeading = actual ? vector(g.pos.get(actual.from)!, g.pos.get(actual.to)!) : [0, 0] as Pt;
    const expectedHeading = vector(g.pos.get(expected.from)!, g.pos.get(expected.to)!);
    const directionOk = !!actual && actualHeading[0] * expectedHeading[0] + actualHeading[1] * expectedHeading[1] > .5 * Math.hypot(...actualHeading) * Math.hypot(...expectedHeading);
    const trusted = distanceM !== null && distanceM <= 60 && directionOk;
    const rejectedErrors = (proposals.get(berth) ?? []).map((a) => routeBetween(g, a, expected)?.length).filter((n): n is number => n !== undefined);
    const rejection = map.unmapped.find((u) => u.berth === berth)?.detail ?? 'No prediction with the signal removed';
    const platformIds = new Set(map.anchors.filter((a) => a.kind === 'platform').map((a) => a.berth));
    const platformFan = [...observed.steps.values()].some((s) => (s.to === berth && platformIds.has(s.from)) || (s.from === berth && platformIds.has(s.to)));
    const missingMethod = platformFan ? 'topology' : rejection.includes('Boundary continuation') ? 'boundary' : 'chain';
    trials.push({ berth, signalId: signal.id, role: starter ? 'starter' : 'berth', placed: !!actual,
      distanceM, directionOk, trusted, method: starter ? 'starter' : actual ? inferenceMethod(actual) : missingMethod,
      detail: actual ? `${actual.evidence}; ${trusted ? 'within' : 'fails'} 60 m validation tolerance` : `${rejection}${rejectedErrors.length ? `; rejected candidate graph errors: ${rejectedErrors.map((n) => n.toFixed(1)).join(', ')} m` : ''}` });
  }
  return trials;
}

/**
 * An entire observed component can be external even when some of its berths have
 * no SMART row (or only a station event association, which is not a coordinate).
 * Run after calibration so this cannot change a placement or its leave-one-out oracle.
 */
function applyOutsideComponents(map: AnchorMap, observed: Observations, smart: SmartRow[]): AnchorMap {
  const links = new Map<string, Set<string>>([...observed.seen.keys()].map((b) => [b, new Set<string>()]));
  for (const step of observed.steps.values()) {
    links.get(step.from)!.add(step.to);
    links.get(step.to)!.add(step.from);
  }
  const seeds = new Map<string, Set<string>>();
  for (const row of smart) {
    if (text(row, 'TD') !== map.area || !isOutside(row)) continue;
    const location = `${text(row, 'STANME') || 'Finsbury Park'} (STANOX ${text(row, 'STANOX')})`;
    for (const berth of [text(row, 'FROMBERTH'), text(row, 'TOBERTH')]) {
      if (!links.has(berth)) continue;
      const locations = seeds.get(berth) ?? new Set<string>();
      locations.add(location); seeds.set(berth, locations);
    }
  }
  const anchored = new Set(map.anchors.map((a) => a.berth));
  const unmapped = new Map(map.unmapped.map((u) => [u.berth, u]));
  const visited = new Set<string>();
  for (const root of links.keys()) {
    if (visited.has(root)) continue;
    const component = [root]; visited.add(root);
    for (let i = 0; i < component.length; i++) for (const next of links.get(component[i]!)!) {
      if (!visited.has(next)) { visited.add(next); component.push(next); }
    }
    // Neither the old SMART-boundary policy nor an anchor-connected piece is widened.
    if (component.some((b) => anchored.has(b))) continue;
    const sources = component.filter((b) => seeds.has(b)).map((berth) => ({ berth, location: [...seeds.get(berth)!].sort()[0]! }))
      .sort((a, b) => a.location.localeCompare(b.location) || a.berth.localeCompare(b.berth));
    if (!sources.length) continue;
    const reached = new Map(sources.map((source) => [source.berth, { ...source, steps: 0 }]));
    const queue = sources.map((s) => s.berth);
    // Multi-source BFS gives the nearest outside location in observed step hops.
    for (let i = 0; i < queue.length; i++) {
      const current = reached.get(queue[i]!)!;
      for (const next of links.get(queue[i]!)!) {
        if (reached.has(next)) continue;
        reached.set(next, { ...current, steps: current.steps + 1 }); queue.push(next);
      }
    }
    for (const berth of component) {
      const item = unmapped.get(berth);
      // A geographic inference must not erase contradictory placement or calibration evidence.
      if (!item || item.reason === 'conflict') continue;
      const source = reached.get(berth)!;
      item.reason = 'outside-network';
      item.detail = `Observed step component has no anchored berth; reaches SMART outside location ${source.location} at berth ${source.berth} in ${source.steps} step hops (shortest undirected path). Station event association alone does not establish a position inside the extract`;
    }
  }
  return map;
}

interface ObservedReach { steps: number; path: string[] }
interface WithheldPlacement { method: SignalTrial['method']; failure: string }

/** Berth transitions are undirected connectivity evidence here, never a directed route claim. */
function observedReach(start: string, observed: Observations): Map<string, ObservedReach> {
  const links = new Map<string, Set<string>>([...observed.seen.keys()].map((berth) => [berth, new Set<string>()]));
  for (const step of observed.steps.values()) {
    links.get(step.from)!.add(step.to);
    links.get(step.to)!.add(step.from);
  }
  const reached = new Map<string, ObservedReach>([[start, { steps: 0, path: [start] }]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const berth = queue[i]!;
    const here = reached.get(berth)!;
    for (const next of [...(links.get(berth) ?? [])].sort()) {
      if (reached.has(next)) continue;
      reached.set(next, { steps: here.steps + 1, path: [...here.path, next] });
      queue.push(next);
    }
  }
  return reached;
}

/** Add observed connectivity facts without changing any berth classification or anchor. */
function addNoEvidenceContext(map: AnchorMap, observed: Observations, smart: SmartRow[], withheld: Map<string, WithheldPlacement>): void {
  const anchors = new Map(map.anchors.map((a) => [a.berth, a]));
  const associations = smart.filter((row) => text(row, 'TD') === map.area).flatMap((row) => {
    const name = text(row, 'STANME');
    const stanox = text(row, 'STANOX');
    if (!name && !stanox) return [];
    return [text(row, 'FROMBERTH'), text(row, 'TOBERTH')].filter(Boolean).map((berth) => ({
      berth, name: name || 'unnamed station', stanox: stanox || 'unknown',
    }));
  });

  for (const item of map.unmapped) {
    if (item.reason !== 'no-evidence') continue;
    const reached = observedReach(item.berth, observed);
    const nearestAnchor = [...anchors.keys()].filter((berth) => reached.has(berth))
      .map((berth) => ({ berth, ...reached.get(berth)! }))
      .sort((a, b) => a.steps - b.steps || a.berth.localeCompare(b.berth))[0];
    const nearestAssociation = associations.filter((association) => reached.has(association.berth))
      .map((association) => ({ ...association, steps: reached.get(association.berth)!.steps }))
      .sort((a, b) => a.steps - b.steps || a.name.localeCompare(b.name) || a.stanox.localeCompare(b.stanox) || a.berth.localeCompare(b.berth))[0];

    const facts = nearestAnchor
      ? [`Shortest observed undirected path to graph anchor ${nearestAnchor.berth}: ${nearestAnchor.path.join(' ↔ ')} (${nearestAnchor.steps} observed steps)`]
      : ['No observed step path reaches a currently anchored graph berth'];
    facts.push(nearestAssociation
      ? `Nearest SMART association: ${nearestAssociation.name} (STANOX ${nearestAssociation.stanox}) at berth ${nearestAssociation.berth} in ${nearestAssociation.steps} observed steps`
      : 'No SMART station association connects in the observed step graph');

    // Mention a withheld method only when its berth lies on the shortest observed path
    // to a surviving anchor. Connectivity remains a fact; calibration does not prove a break.
    if (nearestAnchor) {
      const relevant = [...new Set(nearestAnchor.path.filter((berth) => withheld.has(berth)))];
      for (const berth of relevant) {
        const result = withheld.get(berth)!;
        facts.push(`Leave-one-out calibration withheld the ${result.method} placement at berth ${berth}: ${result.failure}; this does not establish a break in observed connectivity`);
      }
    }
    item.detail = `${facts.join('. ')}. Unplaced: ${item.detail}`;
  }
}

export function buildAnchors(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], options: AnchorOptions = {}): AnchorMap {
  const map = buildMap(data, recordings, smart, options);
  // One or two toy signals cannot calibrate multiple inference families. The real extract has three.
  const observed = observe(recordings, map.area);
  const references = data.signals.filter((s) => {
    const berth = /^YA\s*(\d{4})$/i.exec(s.ref ?? '')?.[1];
    return berth && observed.seen.has(berth) && map.anchors.find((a) => a.berth === berth)?.kind !== 'platform';
  });
  if (options.calibrate === false || references.length < 3) {
    addNoEvidenceContext(map, observed, smart, new Map());
    return applyOutsideComponents(map, observed, smart);
  }
  const failed = leaveOneOut(data, recordings, smart, options).filter((t) => !t.trusted && t.method !== 'starter');
  if (!failed.length) {
    addNoEvidenceContext(map, observed, smart, new Map());
    return applyOutsideComponents(map, observed, smart);
  }
  const failures = new Map<SignalTrial['method'], string>();
  for (const trial of failed) failures.set(trial.method,
    `Leave-one-out ${trial.berth}: ${trial.placed ? `${trial.distanceM?.toFixed(1) ?? 'disconnected'} m graph error, direction ${trial.directionOk ? 'compatible' : 'wrong'}` : 'no defensible prediction'} exceeds the 60 m trust criterion`);
  const withheld = new Map<string, WithheldPlacement>();
  map.anchors = map.anchors.filter((a) => {
    if (a.kind !== 'inferred' && !a.evidence.startsWith('Topology')) return true;
    const method = inferenceMethod(a);
    const failure = failures.get(method); if (!failure) return true;
    withheld.set(a.berth, { method, failure });
    map.unmapped.push({ berth: a.berth, reason: 'conflict', seen: observed.seen.get(a.berth) ?? 0,
      detail: `${failure}; ${method} placement withheld. Candidate evidence: ${a.evidence}` });
    return false;
  });
  if (failures.has('boundary')) for (const u of map.unmapped) if (u.reason === 'outside-network' && u.detail.includes('north boundary node')) {
    u.reason = 'no-evidence'; u.detail = `${failures.get('boundary')}; boundary extrapolation cannot establish outside status. ${u.detail}`;
  }
  map.unmapped.sort((a, b) => a.berth.localeCompare(b.berth));
  addNoEvidenceContext(map, observed, smart, withheld);
  return applyOutsideComponents(map, observed, smart);
}

export function analyseSteps(data: KxData, recordings: RecordingEvent[][], map: AnchorMap): StepCheck[] {
  const g = buildGraph(data);
  const anchors = new Map(map.anchors.map((a) => [a.berth, a]));
  const checks: StepCheck[] = [];
  for (const s of observe(recordings, map.area).steps.values()) {
    const a = anchors.get(s.from);
    const b = anchors.get(s.to);
    if (!a || !b) continue;
    const route = directedRoute(g, a, b) ?? routeBetween(g, a, b);
    const issues: string[] = [];
    let reversal = false;
    if (!route) issues.push('disconnected: no graph path; anchor evidence or OSM connectivity needs review');
    else {
      reversal = routeReverses(g, route, a, b);
      if (reversal) issues.push('reversal required: shortest path opposes an anchor heading or turns back at a junction; berth identity/direction or OSM route needs review');
    }
    const seconds = s.seconds.length ? median(s.seconds) : null;
    const speedMps = route && seconds !== null && seconds > 0 ? route.length / seconds : null;
    const fast = route ? s.seconds.filter((time) => time > 0 && route.length / time > 50) : [];
    if (route && fast.length) issues.push(`speed above 50 m/s in ${fast.length}/${s.seconds.length} timed events (maximum ${(route.length / Math.min(...fast)).toFixed(1)} m/s): TD timing is not a physical position measurement; inspect duplicate steps, coarse anchors and berth residence`);
    if (route && route.length > 1 && s.seconds.some((time) => time === 0)) issues.push('zero-time movement: co-timestamped TD steps cannot establish physical travel speed');
    checks.push({ from: s.from, to: s.to, count: s.count, timed: s.seconds.length, seconds, lengthM: route?.length ?? null, speedMps, reversal, issues });
  }
  return checks.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}

export function describeEvidence(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], map: AnchorMap): string[] {
  const observed = observe(recordings, map.area);
  const rows = smart.filter((r) => text(r, 'TD') === map.area);
  const offsetRows = rows.filter((r) => text(r, 'BERTHOFFSET') !== '');
  const partnerSteps = [...observed.steps.values()].filter((s) => /^B\d{3}$/.test(s.from) || /^B\d{3}$/.test(s.to)).reduce((n, s) => n + s.count, 0);
  return [
    `Inventory: ${observed.seen.size} berths in step/interpose/cancel events, including placeholder-only berths; ${observed.ignored} ${NOT_A_TRAIN} events ignored for all track and timing evidence. Anchors may also include unobserved canonical platforms.`,
    `SMART fact: ${rows.length} ${map.area} rows; ${offsetRows.length} carry BERTHOFFSET. It is an event/route-dependent signed offset, not a coordinate. Assumption: seconds correcting the reporting time toward a station event (large positive arrival offsets and negative departure offsets). No unit or distance conversion is established; no metric SMART anchors are manufactured. STANOX 54311 proves station association only.`,
    `Partner-berth fact: ${partnerSteps} non-placeholder steps touch B-prefixed platform partners. This sample does not establish front/rear or buffer-end semantics. Assumption: co-locate a SMART/naming-associated partner at its platform terminal, with 100–150 m uncertainty; never use placeholder hopping to infer track.`,
    `Outside-network policy: SMART names for Finsbury Park, Hornsey, Harringay, Ferme Park and the Moorgate branch are known outside the King's Cross extract; Finsbury Park STANOX 54238 is also recognised. Other STANOX values are not automatically outside. Existing reachability stops at known internal and external boundaries. Additionally, an entire observed undirected step component with no final anchor and an outside SMART seed is classified outside; details name the nearest seed location and shortest step-hop distance. Placeholder steps never connect components. Components touching an anchor retain their existing classification; components with neither anchors nor outside seeds stay no-evidence, and conflicts are preserved. SMART station event association alone is not a metric inside position.`,
    `Platform policy: one-to-one east-to-west terminal-track matching against station platform polygons, maximum 40 m from their south ends. Tagged OSM buffers take 5 m error; untagged degree-one terminals take 15 m. The existing KINGS_CROSS rectangle selects platform polygons by centroid; the real buffers of platforms 0–8 lie south of that rectangle. Physical terminal positions are retained; the centroid-selection zone is deliberately unchanged; buffer stops need not lie inside it.`,
    `Signals: only YA refs match ${map.area}; NL, AF and WH are excluded. Direction tags follow OSM way order. Missing/both directions assume way-forward with 30 m error. Platform 1004 retains the arrival buffer position and records its namesake starter as separate evidence, not a second anchor. Signal snap tolerance 25 m; conflicting duplicate matches over 75 m remain unmapped.`,
    `Topology: nearest common northern junction over all feasible platform routes, not an intersection of independently chosen shortest paths to a distant root. A 25 m set-back provides assumed signal clearance before arrival splits and after departure merges. An unreferenced main signal must be on the shared track, face the right way and be within 40 m; train-protection/speed-only objects do not count. Topology error 75 m, reduced to 15 m for a unique signal snap.`,
    `Branching inference: every predecessor/successor branch must reach an anchor within eight observed steps; every directed route estimate must agree within 75 m along the graph. Median residence timings weight non-platform chains; platform dwell or incomplete timings use equal intervals. Inference error is at least 50 m or one-third of the bounding path. A merge of running lines alone does not locate their next stop signal.`,
    `North boundary: degree-one northern terminals reachable from station platforms, restricted to OSM ECM1 when refs are available. Continue along the graph at assumed nominal 15 m/s unless overridden, using median residence times; error is max(100 m, inherited error + 40% of distance). Beyond-boundary status requires the whole estimated distance interval to lie past the cut. A straddling interval stays unmapped.`,
    `Validation: leave-one-out removes each signal object entirely, including its position as a signal hint. The graph geometry remains. The platform namesake is evaluated as a starter 10 m north of its polygon's north end, not at the buffer. At least three non-platform YA references activate method-family calibration: any family with an unplaced prediction, graph error over 60 m or wrong direction is withheld from the AnchorMap. Failed predictions are retained only in the private validation report.`,
    `Step checks report median matched train/berth residence per recording; unmeasured time stays unknown. Every measured event is checked for speed and zero-time movement, including outliers hidden by the median. The route search retains incoming-edge direction and finds a compatible alternative when the unconstrained shortest path reverses. A platform permits reversal at its endpoint. Turns over about 96 degrees or opposing anchor headings are rejected. Speed flags use 50 m/s; timings and coarse inferred stops can cause false positives. OSM source: ${data.attribution}.`,
  ];
}
