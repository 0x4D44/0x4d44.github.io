// Turns a raw Overpass extract into the compact model the page loads.
//
// Data: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright).
// The page must credit it. Only this derived file is committed, never the raw extract.
import { ORIGIN, project, round } from './geo.ts';
import type { LatLon, Pt } from './geo.ts';

// ---- raw Overpass shapes (only the parts we read) --------------------------------------

export interface RawElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

// ---- compact model ----------------------------------------------------------------------

export type RailService = 'main' | 'siding' | 'crossover' | 'other';

export interface Rail {
  id: number;
  /** OSM node ids along the way. Shared ids are the junctions. */
  nodes: number[];
  service: RailService;
  tunnel: boolean;
  bridge: boolean;
  layer: number;
  electrified?: string;
  maxspeed?: string;
  ref?: string;
}

export interface Signal {
  id: number;
  x: number;
  z: number;
  ref?: string;
  /** railway:signal:direction, as tagged (forward / backward / both). */
  direction?: string;
  /** The railway:signal:* suffixes present, e.g. ["main", "main:form"]. */
  kinds: string[];
}

export interface Platform {
  id: number;
  ref?: string;
  name?: string;
  pts: Pt[];
  /** OSM layer, kept only when it is not 0. Underground platforms are negative; St Pancras is 1. */
  layer?: number;
  /** Set when the platform is tagged tunnel: an Underground platform, not on the surface. */
  tunnel?: boolean;
}

export interface Building {
  id: number;
  pts: Pt[];
  /** metres, from the height tag if numeric */
  height?: number;
  levels?: number;
  name?: string;
  kind: string;
}

export interface KxData {
  attribution: string;
  origin: LatLon;
  /** [id, x, z] for every node used by a rail way */
  nodes: [id: number, x: number, z: number][];
  rails: Rail[];
  switches: { id: number; x: number; z: number; type?: string }[];
  buffers: { id: number; x: number; z: number }[];
  signals: Signal[];
  platforms: Platform[];
  buildings: Building[];
}

const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

function service(tags: Record<string, string>): RailService {
  const s = tags.service;
  if (s === undefined) return 'main';
  if (s === 'siding' || s === 'crossover') return s;
  return 'other';
}

function ring(geometry: { lat: number; lon: number }[], origin: LatLon): Pt[] {
  const pts = geometry.map((g) => project(g.lat, g.lon, origin)).map(([x, z]): Pt => [round(x), round(z)]);
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (pts.length > 1 && first && last && first[0] === last[0] && first[1] === last[1]) pts.pop();
  return pts;
}

export function compactOsm(elements: RawElement[], origin: LatLon = ORIGIN): KxData {
  const coord = new Map<number, Pt>();
  const remember = (id: number, lat: number, lon: number): void => {
    const [x, z] = project(lat, lon, origin);
    coord.set(id, [round(x), round(z)]);
  };

  for (const e of elements) {
    if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) remember(e.id, e.lat, e.lon);
    if (e.type === 'way' && e.nodes && e.geometry) {
      e.nodes.forEach((nid, i) => {
        const g = e.geometry?.[i];
        if (g) remember(nid, g.lat, g.lon);
      });
    }
  }

  const rails: Rail[] = [];
  const platforms: Platform[] = [];
  const buildings: Building[] = [];
  const signals: Signal[] = [];
  const switches: KxData['switches'] = [];
  const buffers: KxData['buffers'] = [];
  const usedNodes = new Set<number>();

  for (const e of elements) {
    const tags = e.tags ?? {};
    if (e.type === 'way') {
      if (tags.railway === 'rail' && e.nodes && e.nodes.length >= 2 && e.nodes.every((n) => coord.has(n))) {
        const rail: Rail = {
          id: e.id,
          nodes: e.nodes,
          service: service(tags),
          tunnel: tags.tunnel !== undefined && tags.tunnel !== 'no',
          bridge: tags.bridge !== undefined && tags.bridge !== 'no',
          layer: num(tags.layer) ?? 0,
        };
        if (tags.electrified) rail.electrified = tags.electrified;
        if (tags.maxspeed) rail.maxspeed = tags.maxspeed;
        if (tags.ref) rail.ref = tags.ref;
        rails.push(rail);
        for (const n of e.nodes) usedNodes.add(n);
      } else if (tags.railway === 'platform' && e.geometry) {
        const p: Platform = { id: e.id, pts: ring(e.geometry, origin) };
        if (tags.ref) p.ref = tags.ref;
        if (tags.name) p.name = tags.name;
        const layer = num(tags.layer);
        if (layer !== undefined && layer !== 0) p.layer = layer;
        if (tags.tunnel !== undefined && tags.tunnel !== 'no') p.tunnel = true;
        platforms.push(p);
      } else if (tags.building !== undefined && e.geometry && e.geometry.length >= 4) {
        const b: Building = { id: e.id, pts: ring(e.geometry, origin), kind: tags.building };
        const height = num(tags.height);
        const levels = num(tags['building:levels']);
        if (height !== undefined) b.height = height;
        if (levels !== undefined) b.levels = levels;
        if (tags.name) b.name = tags.name;
        buildings.push(b);
      }
    } else if (e.type === 'node' && e.lat !== undefined && e.lon !== undefined) {
      const c = coord.get(e.id);
      if (!c) continue;
      if (tags.railway === 'signal') {
        const s: Signal = {
          id: e.id,
          x: c[0],
          z: c[1],
          kinds: Object.keys(tags)
            .filter((k) => k.startsWith('railway:signal:') && k !== 'railway:signal:direction')
            .map((k) => k.slice('railway:signal:'.length))
            .sort(),
        };
        if (tags.ref) s.ref = tags.ref;
        if (tags['railway:signal:direction']) s.direction = tags['railway:signal:direction'];
        signals.push(s);
      } else if (tags.railway === 'switch') {
        const sw: KxData['switches'][number] = { id: e.id, x: c[0], z: c[1] };
        if (tags['railway:switch']) sw.type = tags['railway:switch'];
        switches.push(sw);
      } else if (tags.railway === 'buffer_stop') {
        buffers.push({ id: e.id, x: c[0], z: c[1] });
      }
    }
  }

  const nodes: KxData['nodes'] = [...usedNodes]
    .sort((a, b) => a - b)
    .map((id) => {
      const c = coord.get(id) as Pt;
      return [id, c[0], c[1]];
    });

  return { attribution: ATTRIBUTION, origin, nodes, rails, switches, buffers, signals, platforms, buildings };
}
