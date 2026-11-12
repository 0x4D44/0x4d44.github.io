// A colour-light signal's aspect inferred from where the trains are: the track ahead of a head, cut into sections by
// the next heads that face the same way, and the trains' occupied track. Pure functions, no I/O, no private data.
//   red (danger)           the first section ahead is occupied;
//   single yellow (caution) the second is;
//   double yellow (preliminary) the third is, on a four-aspect head;
//   green (proceed)         none of those is;
//   unknown                 no occupancy is known, or the first section leaves the modelled track.
// The route a head will clear is not known, so at a facing junction every onward route is followed and the head
// shows the most restrictive of them. A later section that leaves the modelled track counts as occupied there: an
// inference never shows a more permissive aspect than its evidence supports.
import type { Graph } from './graph.ts';
import type { SignalState } from './sclass.ts';

export type Aspect = SignalState | 'caution' | 'preliminary';
/** A head on the track: on the edge from-to at t (0 at from), facing trains that travel toward `to` when forward. */
export interface AspectHead { id: number; from: number; to: number; t: number; forward: boolean; fourAspect: boolean }
/** Track a train covers: the part of the edge a-b between fromT and toT (0 at a), in either order (core/motion.ts OccupiedTrack). */
export interface OccupiedSpan { a: number; b: number; fromT: number; toT: number }

/** Most restrictive first. Red dominates; an unknown route hides any permissive answer from the others. */
const RANK: Readonly<Record<Aspect, number>> = { danger: 0, unknown: 1, caution: 2, preliminary: 3, proceed: 4 };
const BY_SECTION: readonly Aspect[] = ['danger', 'caution', 'preliminary'];
export const moreRestrictive = (a: Aspect, b: Aspect): Aspect => RANK[a] <= RANK[b] ? a : b;

/** The aspect of a head whose first `clear` sections are clear and whose next is occupied (or may be). */
function aspectAfter(clear: number, fourAspect: boolean): Aspect {
  const sections = fourAspect ? 3 : 2;
  return clear >= sections ? 'proceed' : BY_SECTION[clear]!;
}

const key = (a: number, b: number): string => a < b ? `${a}-${b}` : `${b}-${a}`;
/** A position on an edge as the fraction from its lower-numbered node. */
const canonical = (a: number, b: number, t: number): number => a < b ? t : 1 - t;

export interface AspectOptions {
  /** Walk no further than this along any one route (metres). */
  maxDistanceM?: number;
  /** An onward edge must leave a node within this angle of the arriving direction (cosine). */
  minAlignment?: number;
  /** Follow at most this many edges for one head, over all its routes; beyond, the walk is treated as off the track. */
  maxEdges?: number;
}

/**
 * Each head's inferred aspect. `occupied` undefined: no occupancy is known, every head is unknown. Empty: the track is
 * known to be clear. Heads not in `heads` (shunt, distant, unbound) bound no section.
 */
export function inferAspects(graph: Pick<Graph, 'pos' | 'adj'>, heads: readonly AspectHead[],
  occupied: readonly OccupiedSpan[] | undefined, options: AspectOptions = {}): Map<number, Aspect> {
  const result = new Map<number, Aspect>();
  if (!occupied) { for (const h of heads) result.set(h.id, 'unknown'); return result; }
  const maxDistance = options.maxDistanceM ?? 3000, minAlignment = options.minAlignment ?? 0.5, maxEdges = options.maxEdges ?? 4000;
  // per edge (keyed by its node pair): the heads on it and the occupied intervals, both in the canonical fraction
  const headsOn = new Map<string, { u: number; up: boolean; id: number }[]>();
  for (const h of heads) {
    if (!graph.pos.has(h.from) || !graph.pos.has(h.to) || !Number.isFinite(h.t)) continue;
    const list = headsOn.get(key(h.from, h.to)) ?? [];
    // up: trains it faces travel toward the higher-numbered node
    list.push({ u: canonical(h.from, h.to, h.t), up: (h.from < h.to) === h.forward, id: h.id });
    headsOn.set(key(h.from, h.to), list);
  }
  const spansOn = new Map<string, [number, number][]>();
  for (const s of occupied) {
    if (![s.fromT, s.toT].every(Number.isFinite)) continue;
    const u0 = canonical(s.a, s.b, s.fromT), u1 = canonical(s.a, s.b, s.toT);
    const list = spansOn.get(key(s.a, s.b)) ?? [];
    list.push([Math.max(0, Math.min(u0, u1)), Math.min(1, Math.max(u0, u1))]);
    spansOn.set(key(s.a, s.b), list);
  }
  const length = (a: number, b: number): number => {
    const p = graph.pos.get(a)!, q = graph.pos.get(b)!;
    return Math.hypot(q[0] - p[0], q[1] - p[1]);
  };
  for (const head of heads) {
    if (!graph.pos.has(head.from) || !graph.pos.has(head.to) || !Number.isFinite(head.t)) { result.set(head.id, 'unknown'); continue; }
    const sections = head.fourAspect ? 3 : 2;
    let budget = maxEdges;
    // Walk from (prev -> node) at fraction `start` along it, having passed `clear` boundaries, `walked` metres so far.
    // `start` is exclusive on the head's own edge and inclusive on every later one: a head at a node is met on arrival.
    const walk = (prev: number, node: number, start: number, clear: number, walked: number, seen: Set<string>): Aspect => {
      const first = walked === 0 && seen.size === 1;
      const k = key(prev, node), up = prev < node, edgeLength = length(prev, node);
      // position along the direction of travel: 0 at prev, 1 at node
      const along = (u: number): number => up ? u : 1 - u;
      const events: { at: number; kind: 'train' | 'head' }[] = [];
      for (const [lo, hi] of spansOn.get(k) ?? []) {
        const a = along(lo), b = along(hi), near = Math.min(a, b), far = Math.max(a, b);
        if (far >= start) events.push({ at: Math.max(near, start), kind: 'train' });
      }
      for (const h of headsOn.get(k) ?? []) {
        if (h.id === head.id || h.up !== up) continue;
        const at = along(h.u);
        if (first ? at > start : at >= start) events.push({ at, kind: 'head' });
      }
      // a train standing on a head is in the section the head protects: trains first at the same point
      events.sort((x, y) => x.at - y.at || (x.kind === 'train' ? -1 : 1));
      for (const e of events) {
        if (e.kind === 'train') return aspectAfter(clear, head.fourAspect);
        if (++clear >= sections) return 'proceed';
      }
      const distance = walked + edgeLength * (1 - start);
      const from = graph.pos.get(prev)!, at = graph.pos.get(node)!;
      const inward: [number, number] = [at[0] - from[0], at[1] - from[1]], inwardLength = Math.hypot(...inward);
      const onward = (graph.adj.get(node) ?? []).flatMap(e => {
        const other = e.a === node ? e.b : e.a, target = graph.pos.get(other);
        if (other === prev || !target || seen.has(key(node, other))) return [];
        const dx = target[0] - at[0], dz = target[1] - at[1], l = Math.hypot(dx, dz);
        return l > 0 && inwardLength > 0 && (inward[0] * dx + inward[1] * dz) / (inwardLength * l) >= minAlignment ? [other] : [];
      });
      // off the modelled track (or too far to follow): the first section unknown, a later one possibly occupied
      budget -= 1;
      if (!onward.length || distance > maxDistance || budget <= 0) return clear === 0 ? 'unknown' : aspectAfter(clear, head.fourAspect);
      let answer: Aspect = 'proceed';
      for (const next of new Set(onward)) {
        answer = moreRestrictive(answer, walk(node, next, 0, clear, distance, new Set([...seen, key(node, next)])));
        if (answer === 'danger') break;
      }
      return answer;
    };
    const [prev, node] = head.forward ? [head.from, head.to] : [head.to, head.from];
    const start = head.forward ? head.t : 1 - head.t;
    result.set(head.id, walk(prev, node, start, 0, 0, new Set([key(prev, node)])));
  }
  return result;
}

/**
 * The live feed's red/not-red and the inference together. Red from the feed always shows red. A feed that says the head
 * is off red caps the inference at single yellow, the most restrictive aspect that is not red. No feed: the inference.
 */
export function combineAspect(feed: SignalState, inferred: Aspect): Aspect {
  if (feed === 'danger') return 'danger';
  if (feed === 'proceed') return inferred === 'danger' || inferred === 'unknown' ? 'caution' : inferred;
  return inferred;
}
