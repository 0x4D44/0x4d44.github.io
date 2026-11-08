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
export interface AnchorOptions { area?: string; sources?: string[] }
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

function onPath(g: Graph, route: TrackPath, distance: number, berth: string, evidence: string): BerthAnchor | null {
  let remaining = Math.max(0, Math.min(distance, route.length));
  for (const s of route.segments) {
    if (remaining <= s.length + 1e-7) {
      const edge = g.adj.get(s.from)?.find((e) => e.a === s.to || e.b === s.to);
      if (!edge) return null;
      const ratio = remaining / s.length;
      const point: Pt = [s.start[0] + (s.end[0] - s.start[0]) * ratio, s.start[1] + (s.end[1] - s.start[1]) * ratio];
      const ea = g.pos.get(edge.a)!;
      const t = edge.length ? dist(ea, point) / edge.length : 0;
      return anchor(berth, 'inferred', g, edge, t, edge.b === s.to, Math.max(50, route.length / 3), evidence);
    }
    remaining -= s.length;
  }
  return null;
}

/** Only locations explicitly known to be beyond this extract seed outside classification. */
function isOutside(row: SmartRow): boolean {
  return /^(?:FINS|HORN|HRNS|HRGY|HARGY|HARR|FERME|MORGAT|DRAYTON|HIGH&IS|HIGHBY|ESSEX|OLDST)/i.test(text(row, 'STANME')) || text(row, 'STANOX') === '54238';
}

export function buildAnchors(data: KxData, recordings: RecordingEvent[][], smart: SmartRow[], options: AnchorOptions = {}): AnchorMap {
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
    const incident = g.edges.filter((e) => e.a === signal.id || e.b === signal.id);
    // A node's direction tag is relative to its containing OSM way, not geographic north.
    const forward = signal.direction !== 'backward';
    const chosen = incident.find((e) => forward ? e.a === signal.id : e.b === signal.id) ?? incident[0];
    const local: Graph = chosen ? { ...g, edges: [chosen] } : g;
    const snapped = snap(local, [signal.x, signal.z]);
    if (!snapped || snapped.distance > 25) {
      conflicts.set(berth, `YA signal cannot be snapped within 25 m of a rail`);
      continue;
    }
    const a = anchor(berth, 'signal', g, snapped.edge, snapped.t, forward, signal.direction === 'forward' || signal.direction === 'backward' ? 5 : 30,
      `OSM signal ${JSON.stringify(signal.ref)} (node ${signal.id}), snapped ${snapped.distance.toFixed(1)} m; direction ${signal.direction ?? 'missing (way-forward assumed)'}`);
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
    const route = routeBetween(g, a, b);
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
        : 'No unambiguous graph placement: absent signal/platform evidence or branching/incomplete chain; SMART timing offsets are not metric coordinates' });
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

export function analyseSteps(data: KxData, recordings: RecordingEvent[][], map: AnchorMap): StepCheck[] {
  const g = buildGraph(data);
  const anchors = new Map(map.anchors.map((a) => [a.berth, a]));
  const checks: StepCheck[] = [];
  for (const s of observe(recordings, map.area).steps.values()) {
    const a = anchors.get(s.from);
    const b = anchors.get(s.to);
    if (!a || !b) continue;
    const route = routeBetween(g, a, b);
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
    `Outside-network policy: SMART names for Finsbury Park, Hornsey, Harringay, Ferme Park and the Moorgate branch are known outside the King's Cross extract; Finsbury Park STANOX 54238 is also recognised. Other STANOX values are not automatically outside. Reachability stops at known internal and external boundaries. Ambiguous branches remain no-evidence.`,
    `Platform policy: one-to-one east-to-west terminal-track matching against station platform polygons, maximum 40 m from their south ends. Tagged OSM buffers take 5 m error; untagged degree-one terminals take 15 m. The existing KINGS_CROSS rectangle selects platform polygons by centroid; the real buffers of platforms 0–8 lie south of that rectangle. Physical terminal positions are retained; the zone must be widened separately to include them.`,
    `Signals: only YA refs match ${map.area}; NL, AF and WH are excluded. Direction tags follow OSM way order. Missing/both directions assume way-forward with 30 m error. Platform 1004 retains the arrival buffer position and records its namesake starter as separate evidence, not a second anchor. Signal snap tolerance 25 m; conflicting duplicate matches over 75 m remain unmapped.`,
    `Inference: only unique directed, non-branching observed chains bounded by strong anchors, without outside boundaries. Shortest paths use metric graph edges including fractional endpoints. Complete median residence timings weight distance for non-platform chains; platform residence includes dwell and is not travel time, so platform-bounded or incompletely timed chains use equal intervals. Inference error is at least 50 m or one-third of the bounding path.`,
    `Step checks report median matched train/berth residence per recording; unmeasured time stays unknown. Every measured event is checked for speed and zero-time movement, including outliers hidden by the median. A platform permits reversal at its endpoint. Turns over about 96 degrees at a graph node or travel opposing a non-platform anchor are flagged. A shortest-path reversal does not prove every alternative route reverses. Speed flags use 50 m/s; timings and coarse inferred stops can cause false positives. OSM source: ${data.attribution}.`,
  ];
}
