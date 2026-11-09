// St Pancras MML: geometry and station-event associations, with no timing-derived positions.
import type { AnchorMap, BerthAnchor } from './anchors.ts';
import type { RecordingEvent, SmartRow } from './berths.ts';
import { buildGraph } from './graph.ts';
import type { Pt } from './geo.ts';
import type { KxData, Platform } from './osm.ts';
import { longAxis, platformSouthEnd } from './station.ts';

const REFS = ['1', '2', '3', '4'];
const dot = (a: Pt, b: Pt): number => a[0] * b[0] + a[1] * b[1];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const text = (r: SmartRow, k: string): string => String(r[k] ?? '').trim();

/** MML uses OSM layer 1. Duplicate refs are withheld rather than silently overwritten. */
export function stPancrasMmlPlatforms(data: Pick<KxData, 'platforms'>): Map<string, Platform> {
  const out = new Map<string, Platform>();
  for (const ref of REFS) {
    const matches = data.platforms.filter(p => p.ref === ref && p.layer === 1 && !p.tunnel && p.pts.length >= 3);
    if (matches.length === 1) out.set(ref, matches[0]!);
  }
  return out;
}

export interface StPancrasPlatformGeometry {
  platform: string;
  osmId: number;
  candidates: { buffer: number; from: number; to: number; point: Pt; signals: string[] }[];
}

/** ASSUMED screening tolerances below (15/25 m cap window, 3 m adjacency,
 * 0.5 m seam, 40 m probe, 0.8 alignment and 80 m signal-search margin) allow
 * for approximate OSM outlines; they are not survey measurements or berth offsets.
 * Near the south cap, use only exposed long faces; paired island faces share a seam.
 * Buffer tags may be interior graph nodes, so require one north-facing layer-1 edge.
 * Rail centres must lie within 3 m of an exposed face (an explicit adjacency
 * tolerance; more distant parallel tracks do not border that face).
 * Tolerances account for OSM's small platform strips, not a nearest-track assignment. */
export function stPancrasMmlPlatformGeometry(data: KxData): StPancrasPlatformGeometry[] {
  const platforms = stPancrasMmlPlatforms(data), graph = buildGraph(data);
  const allowedWays = new Set(data.rails.filter(r => r.layer === 1 && !r.tunnel).map(r => r.id));
  return [...platforms].map(([ref, p]) => {
    let { axis } = longAxis(p.pts);
    if (axis[1] > 0) axis = [-axis[0], -axis[1]];
    const normal: Pt = [-axis[1], axis[0]], south = platformSouthEnd(p.pts);
    const lateral = p.pts.map(q => dot(sub(q, south), normal));
    const lo = Math.min(...lateral), hi = Math.max(...lateral);
    const shared = (side: number): boolean => {
      const midpoint: Pt = [south[0] + axis[0] * 40 + normal[0] * side, south[1] + axis[1] * 40 + normal[1] * side];
      return [...platforms.values()].some(other => other !== p && other.pts.some((a, i) => {
        const b = other.pts[(i + 1) % other.pts.length]!, v = sub(b, a), q = sub(midpoint, a), ll = dot(v, v);
        const t = dot(q, v) / ll;
        return ll > 100 && t >= 0 && t <= 1 && Math.hypot(q[0] - t * v[0], q[1] - t * v[1]) < 0.5;
      }));
    };
    const candidates: StPancrasPlatformGeometry['candidates'] = [];
    for (const b of data.buffers) {
      const point: Pt = [b.x, b.z], delta = sub(point, south), along = dot(delta, axis), across = dot(delta, normal);
      if (along < -15 || along > 25) continue;
      const side = across < 0 ? lo : hi;
      if (shared(side) || (across < 0 ? lo - across : across - hi) < -1 || Math.abs(across - side) > 3) continue;
      const north = (graph.adj.get(b.id) ?? []).filter(e => allowedWays.has(e.wayId)).map(e => {
        const id = e.a === b.id ? e.b : e.a, q = graph.pos.get(id)!;
        return { id, alignment: dot(sub(q, point), axis) / e.length };
      }).filter(n => n.alignment > 0.8);
      if (north.length !== 1) continue;
      // Corroborating signal refs on the same unbranched platform track; never seed approaches.
      const signals: string[] = [], seen = new Set<number>([b.id]);
      let previous = b.id, node = north[0]!.id, travelled = 0;
      while (!seen.has(node) && travelled < longAxis(p.pts).length + 80) {
        seen.add(node);
        for (const s of data.signals) if (s.id === node && /^WH\s+\S+$/.test(s.ref ?? '')) signals.push(s.ref!);
        const next = (graph.adj.get(node) ?? []).filter(e => allowedWays.has(e.wayId) && e.a !== previous && e.b !== previous);
        if (next.length !== 1) break;
        const edge = next[0]!; travelled += edge.length; previous = node; node = edge.a === node ? edge.b : edge.a;
      }
      candidates.push({ buffer: b.id, from: north[0]!.id, to: b.id, point, signals: [...new Set(signals)].sort() });
    }
    return { platform: ref, osmId: p.id, candidates };
  });
}

/** SMART endpoints identify platform events, not measured stopping points. Both roles are
 * provisionally co-located at the OSM buffer with a platform-length uncertainty allowance. */
export function buildStPancrasAnchors(data: KxData, smartRows: SmartRow[], observedRecords: RecordingEvent[] | RecordingEvent[][] = []): AnchorMap {
  const map: AnchorMap = { area: 'WH', sources: [data.attribution, 'SMART: exact TD WH / STPANCRAS rows; A/C TOBERTH, B/D FROMBERTH', 'OSM layer-1 platforms and buffer nodes; station-event co-location is an assumption'], anchors: [], unmapped: [] };
  const seen = new Map<string, number>(), proposals = new Map<string, BerthAnchor[]>(), conflicts = new Map<string, string>();
  const records = observedRecords.flat() as RecordingEvent[];
  for (const { e } of records) {
    if (e.area !== 'WH') continue;
    for (const berth of new Set([e.from, e.to, ...Object.keys(e.berths ?? {})])) if (berth) seen.set(berth, (seen.get(berth) ?? 0) + (e.kind === 'step' ? 1 : 0));
  }
  const geometry = new Map(stPancrasMmlPlatformGeometry(data).map(g => [g.platform, g]));
  for (const row of smartRows) {
    if (text(row, 'TD') !== 'WH' || text(row, 'STANME') !== 'STPANCRAS') continue;
    for (const key of ['FROMBERTH', 'TOBERTH']) { const b = text(row, key); if (b && !seen.has(b)) seen.set(b, 0); }
    const ref = text(row, 'PLATFORM'), event = text(row, 'EVENT');
    if (!REFS.includes(ref) || !['A', 'B', 'C', 'D'].includes(event)) continue;
    const berth = text(row, event === 'A' || event === 'C' ? 'TOBERTH' : 'FROMBERTH');
    if (!berth) continue;
    const g = geometry.get(ref);
    if (!g || g.candidates.length !== 1) {
      conflicts.set(berth, `Platform ${ref}: ${g?.candidates.length ?? 0} defensible exposed-face buffer candidates; platform/track identity unresolved`); continue;
    }
    const c = g.candidates[0]!, platform = stPancrasMmlPlatforms(data).get(ref)!;
    const anchor: BerthAnchor = { berth, kind: 'platform', platform: ref, from: c.from, to: c.to, t: 1, point: c.point,
      errorM: Math.max(100, longAxis(platform.pts).length),
      evidence: `SMART WH STPANCRAS platform ${ref}, event ${event}, selected ${event === 'A' || event === 'C' ? 'TOBERTH' : 'FROMBERTH'}; OSM platform way ${g.osmId}, buffer node ${c.buffer}, unique exposed-face layer-1 track; ${c.signals.length ? `same unbranched track signals ${c.signals.join(', ')}` : 'no WH signal topology corroboration'}; ASSUMPTION: station-event berth co-located at buffer, role and exact stop unverified; uncertainty spans platform; BERTHOFFSET supplies no metric position` };
    const list = proposals.get(berth) ?? []; list.push(anchor); proposals.set(berth, list);
  }
  for (const [berth, list] of proposals) {
    if (new Set(list.map(a => `${a.platform}:${a.to}`)).size !== 1) conflicts.set(berth, 'SMART associates berth with competing platform tracks');
    if (!conflicts.has(berth)) map.anchors.push(list[0]!);
  }
  const placed = new Set(map.anchors.map(a => a.berth));
  for (const [berth, count] of seen) if (!placed.has(berth)) map.unmapped.push({ berth, seen: count, reason: conflicts.has(berth) ? 'conflict' : 'no-evidence', detail: conflicts.get(berth) ?? 'Observed or SMART station-event endpoint has no independently established metric placement; timings, offsets and chains do not place approaches' });
  map.anchors.sort((a, b) => a.berth.localeCompare(b.berth)); map.unmapped.sort((a, b) => a.berth.localeCompare(b.berth));
  return map;
}
