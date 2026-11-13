// Structural adapter for public Waverley geometry; no operational identifiers are embedded.
import type { Pt, LatLon } from './geo.ts';
import type { KxData, RailService } from './osm.ts';
import type { AnchorMap, BerthAnchor } from './anchors.ts';
import type { RecordingEvent, SmartRow } from './berths.ts';
import { buildGraph } from './graph.ts';
import { longAxis, pointInPolygon } from './station.ts';

export interface WaverleyAnchorRail { id: string; path: Pt[]; tags: Record<string, string> }
export interface WaverleyAnchorPlatform extends WaverleyAnchorRail { ref?: string }
export interface WaverleyAnchorScene { origin: LatLon; attribution: string; rails: WaverleyAnchorRail[]; platforms: WaverleyAnchorPlatform[] }

/** Accept the public packed format without depending on an unmerged geometry module. */
export function decodeWaverleyAnchorScene(input: unknown): WaverleyAnchorScene {
  const scene = input as WaverleyAnchorScene & { format?: string; q?: number };
  if (!scene || !Array.isArray(scene.rails) || !Array.isArray(scene.platforms) || !Number.isFinite(scene.origin?.lat) || !Number.isFinite(scene.origin?.lon) || typeof scene.attribution !== 'string') throw new Error('Invalid Waverley geometry');
  if (scene.format !== undefined && (scene.format !== 'waverley-varint-v1' || scene.q !== 0.1)) throw new Error('Unsupported Waverley format');
  const path = (value: unknown): Pt[] => {
    if (!scene.format) {
      if (!Array.isArray(value) || value.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => typeof v !== 'number' || !Number.isFinite(v)))) throw new Error('Invalid Waverley path');
      return value.map(p => [p[0], p[1]]);
    }
    if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error('Invalid packed Waverley path');
    const bytes = atob(value), coordinates: number[] = [];
    let number = 0, place = 1;
    for (const byte of bytes) {
      const n = byte.charCodeAt(0); number += (n & 127) * place;
      if (!Number.isSafeInteger(number) || place > 128 ** 7) throw new Error('Waverley varint overflow');
      if (n & 128) { place *= 128; continue; }
      coordinates.push(number % 2 ? -(number + 1) / 2 : number / 2); number = 0; place = 1;
    }
    if (place !== 1 || coordinates.length % 2) throw new Error('Truncated Waverley path');
    let x = 0, z = 0; const points: Pt[] = [];
    for (let i = 0; i < coordinates.length; i += 2) {
      x += coordinates[i]!; z += coordinates[i + 1]!;
      if (!Number.isSafeInteger(x) || !Number.isSafeInteger(z)) throw new Error('Waverley coordinate overflow');
      points.push([x / 10, z / 10]);
    }
    return points;
  };
  const rail = (r: WaverleyAnchorRail): WaverleyAnchorRail => {
    if (!r || typeof r.id !== 'string' || !r.tags || typeof r.tags !== 'object' || Array.isArray(r.tags) || Object.values(r.tags).some(t => typeof t !== 'string')) throw new Error('Invalid Waverley rail metadata');
    return { id: r.id, tags: { ...r.tags }, path: path(r.path) };
  };
  return { origin: { ...scene.origin }, attribution: scene.attribution, rails: scene.rails.map(rail), platforms: scene.platforms.map(p => ({ ...rail(p), ...(typeof p.ref === 'string' ? { ref: p.ref } : {}) })) };
}

const layer = (r: WaverleyAnchorRail): number => Number.isFinite(Number(r.tags.layer)) ? Number(r.tags.layer) : 0;
const key = (p: Pt, level: number): string => JSON.stringify([p[0], p[1], level]);
const on = (tag: string | undefined): boolean => tag !== undefined && tag !== 'no';

/** The layer a vertex joins the graph on. A vertex is its own coordinate+layer identity, with one exception, the
 * structure end: where a tunnel or bridge way ends (a portal, an abutment), OSM splits the way on the shared node and
 * the layer changes there, so the export holds the same coordinate at two layers, both as way ends. Such a vertex joins
 * on its lowest layer, so the track runs through the portal (ALM-BUG-FLU-00018). It joins only when every tunnel or
 * bridge way at the coordinate ends there and every layer present has a way ending there: a bridge or tunnel passing
 * over or under track keeps its own layer even where an interior vertex lands on the same coordinate. */
function structureEnds(rails: WaverleyAnchorRail[]): Map<string, number> {
  const at = new Map<string, { layer: number; end: boolean; structure: boolean }[]>();
  for (const r of rails) r.path.forEach((p, i) => {
    const k = JSON.stringify(p), list = at.get(k) ?? [];
    list.push({ layer: layer(r), end: i === 0 || i === r.path.length - 1, structure: on(r.tags.tunnel) || on(r.tags.bridge) });
    at.set(k, list);
  });
  const joined = new Map<string, number>();
  for (const [k, list] of at) {
    const layers = new Set(list.map(v => v.layer));
    if (layers.size < 2 || !list.some(v => v.structure) || list.some(v => v.structure && !v.end)) continue;
    if ([...layers].every(l => list.some(v => v.layer === l && v.end))) joined.set(k, Math.min(...layers));
  }
  return joined;
}

/** Local node IDs represent exact coordinate+layer identities, never original OSM nodes.
 * No segment intersection, proximity snap or invented switch joins separate paths.
 * Layer changes stay disconnected except at a structure end (structureEnds): source node IDs were removed by the public export. */
export function waverleyTrackData(scene: WaverleyAnchorScene): KxData {
  const ends = structureEnds(scene.rails), level = (p: Pt, r: WaverleyAnchorRail): number => ends.get(JSON.stringify(p)) ?? layer(r);
  // Ids are numbered over every coordinate+layer identity, joined or not, so a join leaves every other node's id as it
  // was (stored berth anchors name nodes by id); a joined vertex keeps its lowest layer's id and the others go unused.
  const coordinates = new Map<string, { point: Pt; layer: number }>();
  for (const rail of scene.rails) for (const p of rail.path) coordinates.set(key(p, layer(rail)), { point: p, layer: layer(rail) });
  const sorted = [...coordinates].sort((a, b) => a[1].point[0] - b[1].point[0] || a[1].point[1] - b[1].point[1] || a[1].layer - b[1].layer);
  const ids = new Map(sorted.map(([k], i) => [k, i + 1]));
  const kept = sorted.map(([, v], i) => [v, i + 1] as const).filter(([{ point, layer: l }]) => (ends.get(JSON.stringify(point)) ?? l) === l);
  const rails = [...scene.rails].sort((a, b) => a.id.localeCompare(b.id));
  if (new Set(rails.map(r => r.id)).size !== rails.length) throw new Error('Duplicate Waverley rail identity');
  return { attribution: scene.attribution, origin: scene.origin, nodes: kept.map(([{ point }, id]) => [id, point[0], point[1]]),
    rails: rails.map((r, i) => ({ id: i + 1, nodes: r.path.map(p => ids.get(key(p, level(p, r)))!), layer: layer(r), tunnel: on(r.tags.tunnel), bridge: on(r.tags.bridge),
      service: (['siding', 'crossover'].includes(r.tags.service ?? '') ? r.tags.service : r.tags.service ? 'other' : 'main') as RailService,
      ...(r.tags.ref ? { ref: r.tags.ref } : {}) })),
    platforms: scene.platforms.map((p, i) => ({ id: i + 1, ref: p.ref, pts: p.path, layer: layer(p) })), buffers: [], switches: [], signals: [], buildings: [] };
}

export interface WaverleyTrackCandidate {
  from: number; to: number; t: number; point: Pt; coverageM: number;
  railIds: string[]; topology: 'terminal-candidate' | 'through-or-unresolved';
}
export interface WaverleyPlatformGeometry {
  ref: string; platformIds: string[]; lengthM: number; candidates: WaverleyTrackCandidate[];
}
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];

/** ASSUMED geometry screening: sample rail segments every <=2 m; an adjacent rail
 * must stay outside the polygon, within 3 m of a >=10 m face, parallel within
 * cosine 0.8, for >=min(40 m, 30% platform length). Competing tracks remain explicit.
 * No terminal buffer is proved by a path endpoint: source has no buffer-node tags. */
export function waverleyPlatformGeometry(scene: WaverleyAnchorScene): WaverleyPlatformGeometry[] {
  const data = waverleyTrackData(scene), graph = buildGraph(data), rails = [...scene.rails].sort((a, b) => a.id.localeCompare(b.id));
  const refs = [...new Set(scene.platforms.map(p => p.ref).filter((r): r is string => !!r))].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  return refs.map(ref => {
    const polygons = scene.platforms.filter(p => p.ref === ref), p = polygons[0]!;
    const result: WaverleyPlatformGeometry = { ref, platformIds: polygons.map(p => p.id).sort(), lengthM: longAxis(p.path).length, candidates: [] };
    if (polygons.length !== 1 || p.path.length < 3 || on(p.tags.tunnel)) return result;
    const minX = Math.min(...p.path.map(q => q[0])) - 3, maxX = Math.max(...p.path.map(q => q[0])) + 3;
    const minZ = Math.min(...p.path.map(q => q[1])) - 3, maxZ = Math.max(...p.path.map(q => q[1])) + 3;
    const selected: { edge: typeof graph.edges[number]; lo: number; hi: number; coverage: number }[] = [];
    for (const edge of graph.edges) {
      const rail = data.rails[edge.wayId - 1]!;
      if (rail.layer !== layer(p) || rail.tunnel || edge.length === 0) continue;
      const a = graph.pos.get(edge.a)!, b = graph.pos.get(edge.b)!, direction = sub(b, a);
      if (Math.max(a[0], b[0]) < minX || Math.min(a[0], b[0]) > maxX || Math.max(a[1], b[1]) < minZ || Math.min(a[1], b[1]) > maxZ) continue;
      const steps = Math.max(1, Math.ceil(edge.length / 2)), valid: number[] = [];
      for (let j = 0; j < steps; j++) {
        const t = (j + 0.5) / steps, q: Pt = [a[0] + direction[0] * t, a[1] + direction[1] * t];
        if (pointInPolygon(q, p.path)) continue;
        let adjacent = false;
        for (let i = 0; i < p.path.length; i++) {
          const c = p.path[i]!, d = p.path[(i + 1) % p.path.length]!, v = sub(d, c), ll = dot(v, v);
          if (ll < 100 || Math.abs(dot(direction, v) / (edge.length * Math.sqrt(ll))) < 0.8) continue;
          const u = dot(sub(q, c), v) / ll;
          if (u < 0 || u > 1) continue;
          if (Math.hypot(q[0] - c[0] - u * v[0], q[1] - c[1] - u * v[1]) <= 3) { adjacent = true; break; }
        }
        if (adjacent) valid.push(j);
      }
      if (valid.some((sample, i) => i > 0 && sample !== valid[i - 1]! + 1)) continue;
      if (valid.length) selected.push({ edge, lo: valid[0]! / steps, hi: (valid.at(-1)! + 1) / steps, coverage: valid.length * edge.length / steps });
    }
    const pending = new Set(selected.map((_, i) => i));
    while (pending.size) {
      const start = pending.values().next().value!, component: typeof selected = [], todo = [start]; pending.delete(start);
      while (todo.length) {
        const item = selected[todo.pop()!]!; component.push(item);
        for (const i of pending) {
          const other = selected[i]!;
          // Join only actual graph endpoints with adjacent intervals reaching that endpoint.
          const joined = (item.lo === 0 && ((other.lo === 0 && item.edge.a === other.edge.a) || (other.hi === 1 && item.edge.a === other.edge.b))) ||
            (item.hi === 1 && ((other.lo === 0 && item.edge.b === other.edge.a) || (other.hi === 1 && item.edge.b === other.edge.b)));
          if (joined) { pending.delete(i); todo.push(i); }
        }
      }
      const coverageM = component.reduce((sum, item) => sum + item.coverage, 0);
      if (coverageM < Math.min(40, result.lengthM * 0.3)) continue;
      const degrees = new Map<number, number>();
      for (const { edge } of component) for (const node of [edge.a, edge.b]) degrees.set(node, (degrees.get(node) ?? 0) + 1);
      // A branching adjacency component does not identify one platform track.
      if ([...degrees.values()].some(degree => degree > 2)) continue;
      // A representative metric point, not a signal or buffer. Choose the covered sample
      // nearest the polygon centre, independent of rail export ordering/direction.
      const centre: Pt = [p.path.reduce((n, q) => n + q[0], 0) / p.path.length, p.path.reduce((n, q) => n + q[1], 0) / p.path.length];
      const choices = component.map(item => {
        const a = graph.pos.get(item.edge.a)!, b = graph.pos.get(item.edge.b)!, v = sub(b, a);
        const t = Math.max(item.lo, Math.min(item.hi, dot(sub(centre, a), v) / dot(v, v)));
        const point: Pt = [a[0] + v[0] * t, a[1] + v[1] * t];
        return { item, t, point, distance: Math.hypot(point[0] - centre[0], point[1] - centre[1]) };
      }).sort((a, b) => a.distance - b.distance || a.point[0] - b.point[0] || a.point[1] - b.point[1]);
      const chosen = choices[0]!, edge = chosen.item.edge;
      const forward = edge.a < edge.b;
      result.candidates.push({ from: forward ? edge.a : edge.b, to: forward ? edge.b : edge.a, t: forward ? chosen.t : 1 - chosen.t, point: chosen.point, coverageM,
        railIds: [...new Set(component.map(item => rails[item.edge.wayId - 1]!.id))].sort(),
        topology: [...degrees.keys()].some(n => graph.adj.get(n)?.length === 1) ? 'terminal-candidate' : 'through-or-unresolved' });
    }
    result.candidates.sort((a, b) => a.point[0] - b.point[0] || a.point[1] - b.point[1]);
    return result;
  });
}

export interface WaverleyPlatformAssociation { berth: string; platform: string; event: string; selectedEndpoint: 'FROMBERTH' | 'TOBERTH' }
export interface WaverleyAnchorMap extends AnchorMap {
  platformAssociations: WaverleyPlatformAssociation[];
  provisionalHeadings: string[];
}
export interface WaverleyAnchorOptions {
  /** Explicit display assumption only; never equates OSM path direction with Up/Down. */
  allowProvisionalHeading?: boolean;
}
const text = (row: SmartRow, k: string): string => String(row[k] ?? '').trim();

export function buildWaverleyAnchors(scene: WaverleyAnchorScene, smartRows: SmartRow[], observedRecords: RecordingEvent[] | RecordingEvent[][] = [], options: WaverleyAnchorOptions = {}): WaverleyAnchorMap {
  const map: WaverleyAnchorMap = { area: 'EB', sources: [scene.attribution, 'Exact TD EB / STANME EDINBURGH associations: arrivals A/C TOBERTH; departures B/D FROMBERTH', 'Coordinate graph uses exact coordinate+layer identities; source node IDs unavailable; no proximity joins; layer changes disconnected except at tunnel/bridge way ends', 'ASSUMED geometry adjacency screening, representative platform point and full platform length uncertainty; no buffer or approach placements'], anchors: [], unmapped: [], platformAssociations: [], provisionalHeadings: [] };
  const inventory = new Map<string, number>();
  for (const { e } of observedRecords.flat() as RecordingEvent[]) {
    if (e.area !== 'EB') continue;
    for (const b of new Set([e.from, e.to, ...Object.keys(e.berths ?? {})])) if (b) inventory.set(b, (inventory.get(b) ?? 0) + (e.kind === 'step' ? 1 : 0));
  }
  const associations = new Map<string, WaverleyPlatformAssociation[]>();
  for (const row of smartRows) {
    if (text(row, 'TD') !== 'EB' || text(row, 'STANME') !== 'EDINBURGH') continue;
    for (const k of ['FROMBERTH', 'TOBERTH']) { const b = text(row, k); if (b && !inventory.has(b)) inventory.set(b, 0); }
    const platform = text(row, 'PLATFORM'), event = text(row, 'EVENT');
    if (!platform || !['A', 'B', 'C', 'D'].includes(event)) continue;
    const selectedEndpoint = event === 'A' || event === 'C' ? 'TOBERTH' : 'FROMBERTH', berth = text(row, selectedEndpoint);
    if (!berth) continue;
    const association: WaverleyPlatformAssociation = { berth, platform, event, selectedEndpoint };
    const list = associations.get(berth) ?? []; if (!list.some(a => a.platform === platform && a.event === event)) list.push(association); associations.set(berth, list);
  }
  const geometry = waverleyPlatformGeometry(scene), byRef = new Map(geometry.map(g => [g.ref, g]));
  for (const [berth, seen] of [...inventory].sort((a, b) => a[0].localeCompare(b[0]))) {
    const list = associations.get(berth) ?? [], refs = [...new Set(list.map(a => a.platform))].sort();
    map.platformAssociations.push(...list);
    let detail: string, conflict = false;
    if (refs.length > 1) { conflict = true; detail = `Competing SMART platform associations: ${refs.join(', ')}; observed presence alone does not resolve alternatives`; }
    else if (refs.length === 0) detail = 'No platform-event association or independently established metric point; offsets, durations and step chains do not place approaches';
    else {
      const ref = refs[0]!, split = geometry.filter(g => g.ref === `${ref}e` || g.ref === `${ref}w`);
      const g = byRef.get(ref);
      if (!g && split.length) { conflict = true; detail = `Platform ${ref} has split public faces ${split.map(g => g.ref).join(', ')}; exact subplatform unresolved`; }
      else if (!g || g.platformIds.length !== 1 || g.candidates.length !== 1) { conflict = !!g; detail = `Platform ${ref}: ${g?.candidates.length ?? 0} defensible adjacent track candidates; metric location unresolved`; }
      else if (!options.allowProvisionalHeading) detail = `Platform ${ref} has unique adjacent track, but train heading lacks independently reviewed direction evidence; Up/Down is not mapped to east/west`;
      else {
        const c = g.candidates[0]!;
        const anchor: BerthAnchor = { berth, kind: 'smart', from: c.from, to: c.to, t: c.t, point: c.point, errorM: Math.max(50, g.lengthM),
          evidence: `SMART EB EDINBURGH platform ${ref}, ${list.map(a => `${a.event} ${a.selectedEndpoint}`).join(', ')}; public polygons ${g.platformIds.join(', ')}, adjacent rails ${c.railIds.join(', ')}; ASSUMED representative platform point, not a signal/buffer stop; full-platform uncertainty; ASSUMED provisional heading toward increasing coordinate identity, not Up/Down; ${c.topology}, no proven buffer semantics; BERTHOFFSET supplies no metric position` };
        // No anchor.platform: existing motion interprets that property as a terminal buffer.
        map.anchors.push(anchor); map.provisionalHeadings.push(berth); continue;
      }
    }
    map.unmapped.push({ berth, seen, reason: conflict ? 'conflict' : 'no-evidence', detail });
  }
  return map;
}
