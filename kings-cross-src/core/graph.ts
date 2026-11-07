// Track graph built from the compact OSM model: nodes are OSM nodes, edges are the
// straight segments between consecutive nodes of a rail way. Pure functions, no I/O.
import { dist } from './geo.ts';
import type { Pt } from './geo.ts';
import type { KxData, RailService } from './osm.ts';

export interface Edge {
  wayId: number;
  a: number;
  b: number;
  length: number;
  service: RailService;
  tunnel: boolean;
}

export interface Graph {
  pos: Map<number, Pt>;
  adj: Map<number, Edge[]>;
  edges: Edge[];
}

export function buildGraph(data: Pick<KxData, 'nodes' | 'rails'>): Graph {
  const pos = new Map<number, Pt>();
  for (const [id, x, z] of data.nodes) pos.set(id, [x, z]);
  const adj = new Map<number, Edge[]>();
  const edges: Edge[] = [];
  const link = (from: number, e: Edge): void => {
    const list = adj.get(from);
    if (list) list.push(e);
    else adj.set(from, [e]);
  };
  for (const rail of data.rails) {
    for (let i = 0; i + 1 < rail.nodes.length; i++) {
      const a = rail.nodes[i] as number;
      const b = rail.nodes[i + 1] as number;
      const pa = pos.get(a);
      const pb = pos.get(b);
      if (!pa || !pb || a === b) continue;
      const e: Edge = { wayId: rail.id, a, b, length: dist(pa, pb), service: rail.service, tunnel: rail.tunnel };
      edges.push(e);
      link(a, e);
      link(b, e);
    }
  }
  return { pos, adj, edges };
}

const other = (e: Edge, n: number): number => (e.a === n ? e.b : e.a);

/** Connected components, largest first. Each is a list of node ids. */
export function components(g: Graph): number[][] {
  const seen = new Set<number>();
  const out: number[][] = [];
  for (const start of g.adj.keys()) {
    if (seen.has(start)) continue;
    const comp: number[] = [];
    const stack = [start];
    seen.add(start);
    while (stack.length) {
      const n = stack.pop() as number;
      comp.push(n);
      for (const e of g.adj.get(n) ?? []) {
        const m = other(e, n);
        if (!seen.has(m)) {
          seen.add(m);
          stack.push(m);
        }
      }
    }
    out.push(comp);
  }
  return out.sort((x, y) => y.length - x.length);
}

export interface Route {
  nodes: number[];
  length: number;
}

/** Dijkstra over edge lengths. Returns null when the nodes are not connected. */
export function shortestPath(g: Graph, from: number, to: number): Route | null {
  if (!g.adj.has(from) || !g.adj.has(to)) return null;
  const best = new Map<number, number>([[from, 0]]);
  const prev = new Map<number, number>();
  const open: [number, number][] = [[0, from]]; // [distance, node], kept as a binary min-heap
  const push = (item: [number, number]): void => {
    open.push(item);
    let i = open.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if ((open[p] as [number, number])[0] <= (open[i] as [number, number])[0]) break;
      [open[p], open[i]] = [open[i] as [number, number], open[p] as [number, number]];
      i = p;
    }
  };
  const pop = (): [number, number] => {
    const top = open[0] as [number, number];
    const last = open.pop() as [number, number];
    if (open.length) {
      open[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < open.length && (open[l] as [number, number])[0] < (open[m] as [number, number])[0]) m = l;
        if (r < open.length && (open[r] as [number, number])[0] < (open[m] as [number, number])[0]) m = r;
        if (m === i) break;
        [open[m], open[i]] = [open[i] as [number, number], open[m] as [number, number]];
        i = m;
      }
    }
    return top;
  };
  while (open.length) {
    const [d, n] = pop();
    if (d > (best.get(n) ?? Infinity)) continue;
    if (n === to) {
      const nodes = [to];
      for (let c = to; c !== from; ) {
        c = prev.get(c) as number;
        nodes.push(c);
      }
      return { nodes: nodes.reverse(), length: d };
    }
    for (const e of g.adj.get(n) ?? []) {
      const m = other(e, n);
      const nd = d + e.length;
      if (nd < (best.get(m) ?? Infinity)) {
        best.set(m, nd);
        prev.set(m, n);
        push([nd, m]);
      }
    }
  }
  return null;
}

export interface Snap {
  edge: Edge;
  /** 0..1 along edge from edge.a to edge.b */
  t: number;
  point: Pt;
  distance: number;
}

/** The closest point on any edge to p, optionally restricted to a set of nodes (a component). */
export function snap(g: Graph, p: Pt, within?: Set<number>): Snap | null {
  let best: Snap | null = null;
  for (const e of g.edges) {
    if (within && !within.has(e.a)) continue;
    const a = g.pos.get(e.a) as Pt;
    const b = g.pos.get(e.b) as Pt;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / len2));
    const point: Pt = [a[0] + t * dx, a[1] + t * dz];
    const d = dist(p, point);
    if (!best || d < best.distance) best = { edge: e, t, point, distance: d };
  }
  return best;
}

/** Position `distance` metres along a route. Clamped to the route's ends. */
export function pointAlong(g: Graph, route: Route, distance: number): Pt {
  let left = Math.max(0, Math.min(distance, route.length));
  for (let i = 0; i + 1 < route.nodes.length; i++) {
    const a = g.pos.get(route.nodes[i] as number) as Pt;
    const b = g.pos.get(route.nodes[i + 1] as number) as Pt;
    const len = dist(a, b);
    if (left <= len || i + 2 === route.nodes.length) {
      const t = len === 0 ? 0 : Math.min(1, left / len);
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    left -= len;
  }
  return g.pos.get(route.nodes[0] as number) as Pt;
}
