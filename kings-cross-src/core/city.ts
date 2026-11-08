// The streets and buildings around the station, as numbers: pure functions with no three.js, so the
// rules (heights, facade bays, road widths, polygon triangles) are tested without a browser.
//
// Data: © OpenStreetMap contributors, ODbL (https://www.openstreetmap.org/copyright). The page credits
// it. Only the compact file derived here (web/src/data/kx-city.json) is committed, never the raw extract.
//
// Frame: x east, z south, y up, metres (core/geo.ts). The ground is at `groundY` (the page passes
// web/src/world.ts GROUND_Y, -0.2: core cannot import web code, a web test pins the two together).
//
// Every figure here is either read from an OSM tag, or ASSUMED. The ASSUMED ones are typical
// inner-London values, chosen so a street reads as a street; none is a survey.
import { ORIGIN, project, round } from './geo.ts';
import type { LatLon, Pt } from './geo.ts';
import type { Building } from './osm.ts';
import { pointInPolygon } from './station.ts';

// ---------------------------------------------------------------------------------------------
// 1. the compact model of streets, water and open space

export type RoadClass = 'trunk' | 'primary' | 'secondary' | 'tertiary' | 'minor' | 'service' | 'pedestrian' | 'path' | 'cycleway';

export interface CityRoad {
  id: number;
  cls: RoadClass;
  name?: string;
  /** the OSM width tag, metres */
  width?: number;
  lanes?: number;
  oneway?: boolean;
  /** on a bridge (layer 1 or more); a stretch that crosses the railway rides over it (BRIDGE_LIFT) */
  bridge?: boolean;
  pts: Pt[];
}

export interface CityWater {
  id: number;
  name?: string;
  width?: number;
  pts: Pt[];
}

export type AreaKind = 'water' | 'grass' | 'wood' | 'paved' | 'pitch';

export interface CityArea {
  id: number;
  kind: AreaKind;
  name?: string;
  /** outer ring, no repeated closing point. Holes are not kept: the layers above hide them. */
  pts: Pt[];
}

export interface CityData {
  attribution: string;
  origin: LatLon;
  /** timestamp of the Overpass extract the file was built from (osm3s.timestamp_osm_base) */
  extract: string;
  roads: CityRoad[];
  /** canal centre lines (the water between is drawn at WATER_WIDTH) */
  canals: CityWater[];
  areas: CityArea[];
  trees: Pt[];
}

export interface RawCityMember {
  type: string;
  ref: number;
  role: string;
  geometry?: { lat: number; lon: number }[];
}

export interface RawCityElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  geometry?: { lat: number; lon: number }[];
  members?: RawCityMember[];
  tags?: Record<string, string>;
}

const ATTRIBUTION = '© OpenStreetMap contributors (ODbL)';

/** OSM highway value -> our class. Anything missing (steps, corridors, platforms) is not drawn. */
export const ROAD_CLASS: Readonly<Record<string, RoadClass>> = {
  motorway: 'trunk', motorway_link: 'trunk', trunk: 'trunk', trunk_link: 'trunk',
  primary: 'primary', primary_link: 'primary',
  secondary: 'secondary', secondary_link: 'secondary',
  tertiary: 'tertiary', tertiary_link: 'tertiary',
  unclassified: 'minor', residential: 'minor', living_street: 'minor', road: 'minor',
  service: 'service',
  pedestrian: 'pedestrian',
  footway: 'path', path: 'path', bridleway: 'path', track: 'path',
  cycleway: 'cycleway',
};

const num = (v: string | undefined): number | undefined => {
  if (v === undefined) return undefined;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : undefined;
};

/** A width tag in metres: "7", "7.5", "7 m"; feet ("12'") and nonsense give undefined. */
export function parseMetres(v: string | undefined): number | undefined {
  if (v === undefined || /['"]|ft/i.test(v)) return undefined;
  const n = num(v);
  return n !== undefined && n > 0 && n <= 60 ? n : undefined;
}

const isSet = (v: string | undefined): boolean => v !== undefined && v !== 'no';

function pts(geometry: { lat: number; lon: number }[], origin: LatLon): Pt[] {
  const out: Pt[] = [];
  for (const g of geometry) {
    const [x, z] = project(g.lat, g.lon, origin);
    const p: Pt = [round(x), round(z)];
    const last = out[out.length - 1];
    if (!last || last[0] !== p[0] || last[1] !== p[1]) out.push(p);
  }
  return out;
}

/**
 * Douglas-Peucker: drop vertices that lie within `tol` metres of the line through their neighbours. The
 * ends stay. Keeps the committed file small without moving any street by more than `tol`.
 */
export function simplify(line: readonly Pt[], tol: number): Pt[] {
  if (line.length < 3) return line.slice();
  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;
  const stack: [number, number][] = [[0, line.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop() as [number, number];
    const a = line[i0] as Pt;
    const b = line[i1] as Pt;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const l = Math.hypot(dx, dz);
    let far = -1;
    let farD = tol;
    for (let i = i0 + 1; i < i1; i++) {
      const p = line[i] as Pt;
      const d = l === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dz * (p[0] - a[0]) - dx * (p[1] - a[1])) / l;
      if (d > farD) {
        farD = d;
        far = i;
      }
    }
    if (far >= 0) {
      keep[far] = true;
      stack.push([i0, far], [far, i1]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

const polylineLength = (line: readonly Pt[]): number => {
  let s = 0;
  for (let i = 1; i < line.length; i++) s += Math.hypot((line[i] as Pt)[0] - (line[i - 1] as Pt)[0], (line[i] as Pt)[1] - (line[i - 1] as Pt)[1]);
  return s;
};

/** Streets and paths are simplified to this, metres: below what any screenshot can show. */
export const SIMPLIFY_TOLERANCE = 0.25;
/** A path or cycleway shorter than this is a crossing link or a kerb ramp, not a place to walk; dropped. */
export const MIN_PATH_LENGTH = 8;

function closedRing(geometry: { lat: number; lon: number }[] | undefined): boolean {
  const a = geometry?.[0];
  const b = geometry?.[geometry.length - 1];
  return !!geometry && geometry.length >= 4 && !!a && !!b && a.lat === b.lat && a.lon === b.lon;
}

/** Why a highway way is not drawn as a ribbon, or undefined when it is. */
export function roadSkipReason(tags: Record<string, string>): string | undefined {
  if (!ROAD_CLASS[tags.highway ?? '']) return 'class';
  if (tags.area === 'yes') return 'area';
  if (isSet(tags.tunnel)) return 'tunnel';
  if (isSet(tags.indoor)) return 'indoor';
  if ((num(tags.layer) ?? 0) < 0) return 'underground';
  if (tags.highway === 'service' && ['parking_aisle', 'driveway', 'emergency_access'].includes(tags.service ?? '')) return 'service way';
  if (tags.highway === 'footway' && ['sidewalk', 'crossing', 'traffic_island'].includes(tags.footway ?? '')) return 'footway kind';
  return undefined;
}

/** The surface kind of a closed way (or relation outer ring), or undefined when it is not drawn. */
export function areaKind(tags: Record<string, string>): AreaKind | undefined {
  if (tags.natural === 'water') return 'water';
  if (tags.highway === 'pedestrian' && tags.area === 'yes') return 'paved';
  if (tags['area:highway'] !== undefined) return ['pedestrian', 'footway', 'cycleway'].includes(tags['area:highway']) ? 'paved' : undefined;
  if (tags.highway === 'footway' && tags.area === 'yes') return 'paved';
  if (tags.natural === 'wood' || tags.landuse === 'forest') return 'wood';
  if (tags.place === 'square') return tags.leisure === 'park' || tags.surface === 'grass' ? 'grass' : 'paved';
  if (['park', 'garden', 'common', 'nature_reserve'].includes(tags.leisure ?? '')) return 'grass';
  if (['grass', 'recreation_ground', 'village_green', 'meadow', 'flowerbed', 'allotments', 'cemetery'].includes(tags.landuse ?? '')) return 'grass';
  if (['grassland', 'heath', 'scrub'].includes(tags.natural ?? '')) return 'grass';
  if (tags.leisure === 'pitch') return tags.surface === 'grass' ? 'grass' : 'pitch';
  if (tags.leisure === 'playground') return 'pitch';
  return undefined;
}

/** Turn a raw Overpass extract (the query in tools/build-city.ts) into the compact model. */
export function compactCity(elements: readonly RawCityElement[], origin: LatLon = ORIGIN, extract = ''): CityData {
  const roads: CityRoad[] = [];
  const canals: CityWater[] = [];
  const areas: CityArea[] = [];
  const trees: Pt[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const key = `${e.type}:${e.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tags = e.tags ?? {};
    if (e.type === 'node') {
      if (tags.natural === 'tree' && e.lat !== undefined && e.lon !== undefined) {
        const [x, z] = project(e.lat, e.lon, origin);
        trees.push([round(x), round(z)]);
      }
    } else if (e.type === 'way' && e.geometry) {
      if (tags.highway !== undefined && roadSkipReason(tags) === undefined) {
        const line = simplify(pts(e.geometry, origin), SIMPLIFY_TOLERANCE);
        if (line.length < 2) continue;
        const cls = ROAD_CLASS[tags.highway] as RoadClass;
        if ((cls === 'path' || cls === 'cycleway') && polylineLength(line) < MIN_PATH_LENGTH) continue;
        const road: CityRoad = { id: e.id, cls, pts: line };
        if (tags.name) road.name = tags.name;
        const width = parseMetres(tags.width);
        if (width !== undefined) road.width = width;
        const lanes = num(tags.lanes);
        if (lanes !== undefined && lanes >= 1 && lanes <= 8) road.lanes = lanes;
        if (tags.oneway === 'yes') road.oneway = true;
        if (isSet(tags.bridge) && (num(tags.layer) ?? 0) >= 1) road.bridge = true;
        roads.push(road);
      } else if (tags.waterway === 'canal' && !isSet(tags.tunnel)) {
        const line = simplify(pts(e.geometry, origin), SIMPLIFY_TOLERANCE);
        if (line.length < 2) continue;
        const canal: CityWater = { id: e.id, pts: line };
        if (tags.name) canal.name = tags.name;
        const width = parseMetres(tags.width);
        if (width !== undefined) canal.width = width;
        canals.push(canal);
      } else if (closedRing(e.geometry)) {
        const kind = areaKind(tags);
        if (!kind) continue;
        const ring = simplify(pts(e.geometry, origin), SIMPLIFY_TOLERANCE);
        if (ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]) ring.pop();
        if (ring.length < 3) continue;
        const area: CityArea = { id: e.id, kind, pts: ring };
        if (tags.name) area.name = tags.name;
        areas.push(area);
      }
    } else if (e.type === 'relation' && e.members) {
      // A multipolygon: keep each outer member that is itself a closed ring (the extract has no relation
      // whose outer ring is split over several ways; if one appears it is skipped, not guessed).
      const kind = areaKind(tags);
      if (!kind) continue;
      for (const m of e.members) {
        if (m.role !== 'outer' || !closedRing(m.geometry)) continue;
        const ring = simplify(pts(m.geometry as { lat: number; lon: number }[], origin), SIMPLIFY_TOLERANCE);
        if (ring.length > 1 && ring[0]?.[0] === ring[ring.length - 1]?.[0] && ring[0]?.[1] === ring[ring.length - 1]?.[1]) ring.pop();
        if (ring.length < 3) continue;
        const area: CityArea = { id: m.ref, kind, pts: ring };
        if (tags.name) area.name = tags.name;
        areas.push(area);
      }
    }
  }
  roads.sort((a, b) => a.id - b.id);
  canals.sort((a, b) => a.id - b.id);
  areas.sort((a, b) => a.id - b.id);
  return { attribution: ATTRIBUTION, origin, extract, roads, canals, areas, trees };
}

// ---------------------------------------------------------------------------------------------
// 2. road, pavement and canal widths

export interface RoadStyle {
  /** carriageway width when neither a width nor a lanes tag says, metres */
  width: number;
  /** one lane, metres, when the lanes tag is there */
  lane: number;
  /** pavement each side, metres (0 for roads that are themselves a paved path) */
  pavement: number;
  /** the ribbon is asphalt (a road) or paving (a path) */
  surface: 'asphalt' | 'paving';
}

// ASSUMED. Orders of magnitude from UK practice: a 3.65 m standard lane on trunk and primary roads
// (DMRB CD 127), 2.0 m as the usual minimum footway and about 5.5 m for a two-way residential street
// (DfT Manual for Streets, 2007). Narrower than the standards on purpose where London's real streets are.
export const ROAD_STYLE: Readonly<Record<RoadClass, RoadStyle>> = {
  trunk: { width: 7.0, lane: 3.3, pavement: 3.0, surface: 'asphalt' },
  primary: { width: 7.0, lane: 3.1, pavement: 2.5, surface: 'asphalt' },
  secondary: { width: 6.5, lane: 3.0, pavement: 2.5, surface: 'asphalt' },
  tertiary: { width: 6.0, lane: 3.0, pavement: 2.2, surface: 'asphalt' },
  minor: { width: 5.5, lane: 2.8, pavement: 2.0, surface: 'asphalt' },
  service: { width: 3.5, lane: 3.0, pavement: 0, surface: 'asphalt' },
  pedestrian: { width: 6.0, lane: 3.0, pavement: 0, surface: 'paving' },
  path: { width: 2.0, lane: 2.0, pavement: 0, surface: 'paving' },
  cycleway: { width: 2.5, lane: 2.5, pavement: 0, surface: 'paving' },
};

export interface RoadWidth {
  width: number;
  basis: 'tag' | 'lanes' | 'class';
}

/** The drawn width of a ribbon: the OSM width tag, else lanes x lane width, else the class default. */
export function roadWidth(r: Pick<CityRoad, 'cls' | 'width' | 'lanes'>): RoadWidth {
  const style = ROAD_STYLE[r.cls];
  if (r.width !== undefined) return { width: Math.min(40, Math.max(1, r.width)), basis: 'tag' };
  if (r.lanes !== undefined && style.surface === 'asphalt') return { width: Math.max(style.width * 0.6, r.lanes * style.lane), basis: 'lanes' };
  return { width: style.width, basis: 'class' };
}

/**
 * The Regent's Canal between King's Cross and Camden, drawn this wide. ASSUMED: the channel of a
 * narrow-boat canal with towpath walls is about 9 m between the banks (no OSM width tag).
 */
export const CANAL_WIDTH = 9;

// ---------------------------------------------------------------------------------------------
// 3. buildings: height, style and facade rules

export type FacadeKey = 'stock' | 'red' | 'stone' | 'panel' | 'glass' | 'shop';

export interface FacadeSpec {
  /** one texture tile = one window bay wide, one storey tall, metres */
  tile: [number, number];
  /** how the tile is drawn in the browser, in words (for the tests and the report) */
  what: string;
}

/** The texture is drawn at this many texels per metre, whatever the tile (tests/city.test.ts holds it). */
export const FACADE_TEXELS_PER_M = 100;

// ASSUMED tile sizes. A London stock brick terrace house is two windows wide at about 5.4 m (18 ft is
// the classic Georgian frontage), so a bay is 2.7 m = twelve 225 mm brick lengths; 3.3 m is the storey
// height the brief asks for. The others follow typical bay and floor-to-floor heights of their kind.
export const FACADE: Readonly<Record<FacadeKey, FacadeSpec>> = {
  stock: { tile: [2.7, 3.3], what: 'London stock brick, a sash window with stone cill and lintel' },
  red: { tile: [3.0, 3.6], what: 'red brick, segmental-arched windows, a stone string course' },
  stone: { tile: [3.0, 3.6], what: 'stone or stucco, tall windows with surrounds' },
  panel: { tile: [3.0, 3.0], what: 'pale cladding panels, a wide casement with dark frame' },
  glass: { tile: [1.5, 3.9], what: 'curtain wall: spandrel band and glazing between mullions' },
  shop: { tile: [3.0, 4.0], what: 'shopfront: stall riser, plate glass, fascia and cornice' },
};

/** The parapet above the last storey, metres. ASSUMED (London parapets run 0.3 to 1.0 m). */
export const PARAPET = 0.45;
/** Fewest and most metres a storey may be after fitting the OSM height to whole storeys. */
export const STOREY_RANGE: [number, number] = [2.5, 4.8];
export const MIN_BUILDING = 3;
export const MAX_BUILDING = 120;

/**
 * `building=roof` is a roof with no walls: a bus shelter, a forecourt or a platform canopy. It is drawn as a
 * slab on posts, not a block. ASSUMED: 3.6 m clear underneath (a bus shelter is about 2.5 m, a canopy over a
 * forecourt 4 to 5 m), a slab 0.3 m thick, a 0.3 m post at every corner of the outline.
 */
export const CANOPY_CLEARANCE = 3.6;
export const CANOPY_SLAB = 0.3;
export const CANOPY_POST = 0.3;

/**
 * ASSUMED. King's Cross Central, the 2008-2020 redevelopment north of the station (Pancras Square,
 * Granary Square, Kings Place, the Google and Meta buildings): its new blocks are modern, the rest of
 * the map is mostly Georgian and Victorian terraces. A box in the local frame, not a survey line.
 */
export const KXC_BOX = { minX: -350, maxX: 290, minZ: -950, maxZ: -140 } as const;

export const inKxCentral = (c: Pt): boolean => c[0] >= KXC_BOX.minX && c[0] <= KXC_BOX.maxX && c[1] >= KXC_BOX.minZ && c[1] <= KXC_BOX.maxZ;

/** A repeatable pseudo-random number in [0, 1) from an id and a salt (so a building looks the same every load). */
export function hash01(n: number, salt = 0): number {
  let t = (Math.trunc(n) ^ Math.imul(salt + 1, 0x9e3779b9)) >>> 0;
  t = Math.imul(t ^ (t >>> 16), 0x85ebca6b);
  t = Math.imul(t ^ (t >>> 13), 0xc2b2ae35);
  t ^= t >>> 16;
  return (t >>> 0) / 4294967296;
}

/** Signed shoelace sum in (x, z): positive when the ring runs clockwise on a north-up map. */
export function area2(ring: readonly Pt[]): number {
  let s = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt;
    const b = ring[(i + 1) % ring.length] as Pt;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s;
}

export const ringArea = (ring: readonly Pt[]): number => Math.abs(area2(ring)) / 2;

export function ringCentroid(ring: readonly Pt[]): Pt {
  let x = 0;
  let z = 0;
  for (const p of ring) {
    x += p[0];
    z += p[1];
  }
  return [x / ring.length, z / ring.length];
}

/** Floor-to-floor height by facade key, metres: the tile's own storey, so a default building is never stretched. */
export const storeyOf = (key: FacadeKey): number => FACADE[key].tile[1];

// ASSUMED storeys when the OSM building has neither a height nor a levels tag. Sources: none; typical
// for inner-London stock (a Victorian terrace is three or four storeys with a basement, a 1960s estate
// block six to ten, a modern office six or more).
const DEFAULT_STOREYS: Readonly<Record<string, number>> = {
  house: 3, terrace: 4, residential: 4, apartments: 5, yes: 3, retail: 2, commercial: 4, office: 6, hotel: 5,
  school: 3, church: 3, university: 4, warehouse: 2, industrial: 2, sports_hall: 1, service: 1, kiosk: 1,
  gatehouse: 2, silo: 5, civic: 4, dormitory: 6, construction: 3, disused_station: 2, train_station: 2,
  air_shaft: 1, roof: 1,
};

export interface BuildingFacts {
  id: number;
  kind: string;
  height?: number;
  levels?: number;
  name?: string;
  pts: Pt[];
}

const SHOP_WORDS = /\b(cafe|caf[eé]|coffee|bar|pub|restaurant|pizza|burger|thai|kebab|barber|beauty|salon|pharmacy|supermarket|deli|bakery|shop|store|market|express|tesco|spar|clinic|laser|bistro|grill|tavern|arms|inn)\b/i;
const OLD_BRICK_WORDS = /coal drops|granary|fish and coal|canal museum|lighterman|cruising club|lock cottage|goods|station|pump|gasholder|depot/i;

export interface BuildingPlan {
  id: number;
  /** the outline, wound so that every wall's outward normal is (dz, -dx) of its direction (see wallsOf) */
  ring: Pt[];
  style: FacadeKey;
  /** a shopfront on the ground storey of walls facing a street */
  shop: boolean;
  /** metres from the ground to the top of the parapet */
  height: number;
  basis: 'height' | 'levels' | 'assumed';
  /** whole storeys under the parapet, and the metres of each one after fitting */
  storeys: number;
  storeyHeight: number;
  area: number;
  canopy: boolean;
}

/** Which facade a building gets. Rules in order; the first that matches wins. All ASSUMED, from kind, size and place. */
export function facadeStyle(b: BuildingFacts, area = ringArea(b.pts), centre = ringCentroid(b.pts)): FacadeKey {
  const levels = b.levels ?? 0;
  const roll = hash01(b.id, 3);
  const name = b.name ?? '';
  if (OLD_BRICK_WORDS.test(name)) return 'red';
  switch (b.kind) {
    case 'office': return levels >= 5 || area > 1500 ? 'glass' : 'panel';
    case 'commercial': return levels >= 5 || area > 2500 ? (inKxCentral(centre) ? 'glass' : 'panel') : levels <= 4 && area < 600 ? 'stock' : 'panel';
    case 'church': case 'hotel': return 'stone';
    case 'school': case 'warehouse': case 'industrial': case 'silo': case 'service': case 'gatehouse': case 'disused_station': return 'red';
    case 'university': return 'red';
    case 'civic': case 'dormitory': case 'construction': case 'train_station': return 'panel';
    case 'sports_hall': return 'stock';
    case 'apartments': return levels >= 6 || area > 1800 || inKxCentral(centre) ? 'panel' : roll < 0.45 ? 'red' : 'stock';
    default: break;
  }
  // house, terrace, residential, retail, yes and the rest: the Georgian and Victorian street
  if (levels >= 7) return 'panel';
  if (inKxCentral(centre) && (area > 450 || levels >= 5)) return 'panel';
  if (roll < 0.14) return 'stone'; // some stuccoed terraces
  if (roll < 0.30 && b.kind !== 'terrace') return 'red';
  return 'stock';
}

/** Does the ground storey carry a shopfront on the street side? */
export function hasShop(b: BuildingFacts, area = ringArea(b.pts)): boolean {
  if (b.kind === 'retail') return true;
  if (['house', 'terrace', 'church', 'school', 'warehouse', 'industrial', 'service', 'kiosk', 'gatehouse', 'university', 'civic'].includes(b.kind)) return false;
  if (area > 3000) return false;
  const name = b.name ?? '';
  if (SHOP_WORDS.test(name)) return true;
  return (b.kind === 'commercial' || b.kind === 'hotel') && (b.levels ?? 3) <= 5 && area < 1500;
}

/**
 * Height, and the whole storeys that fit under the parapet. A `height` tag wins, then `levels`
 * times the facade's storey height, then ASSUMED storeys by kind. The storeys are then fitted so the
 * windows stand on whole floors: n storeys of height s, with n x s + PARAPET = height. A building
 * whose tags would force a storey outside STOREY_RANGE is refitted to the tile's own storey.
 */
export function planHeight(b: BuildingFacts, style: FacadeKey, area = ringArea(b.pts)): Pick<BuildingPlan, 'height' | 'basis' | 'storeys' | 'storeyHeight'> {
  const tile = storeyOf(style);
  let basis: BuildingPlan['basis'];
  let raw: number;
  let n = b.levels !== undefined && b.levels >= 1 ? Math.round(b.levels) : 0;
  if (b.height !== undefined) {
    basis = 'height';
    raw = b.height;
  } else if (n > 0) {
    basis = 'levels';
    raw = n * tile + PARAPET;
  } else {
    basis = 'assumed';
    const storeys = DEFAULT_STOREYS[b.kind] ?? 3;
    // a shed or kiosk is one low storey; a small unlabelled block is not a town house
    raw = (area < 25 ? 1 : area < 60 ? Math.min(2, storeys) : storeys) * tile + PARAPET;
  }
  const height = Math.min(MAX_BUILDING, Math.max(MIN_BUILDING, raw));
  const usable = height - PARAPET;
  if (n < 1 || usable / n < STOREY_RANGE[0] || usable / n > STOREY_RANGE[1]) n = Math.max(1, Math.round(usable / tile));
  return { height, basis, storeys: n, storeyHeight: usable / n };
}

/** The outline wound so that walking it keeps the outside on the LEFT-hand normal (dz, -dx): positive shoelace. */
export function windOutward(ring: readonly Pt[]): Pt[] {
  return area2(ring) < 0 ? ring.slice().reverse() : ring.slice();
}

export function planBuilding(b: BuildingFacts): BuildingPlan {
  const area = ringArea(b.pts);
  const centre = ringCentroid(b.pts);
  if (b.kind === 'roof') {
    // the top of the slab is the OSM height when it has one, else clearance plus slab
    const height = Math.min(MAX_BUILDING, Math.max(2.4 + CANOPY_SLAB, b.height ?? CANOPY_CLEARANCE + CANOPY_SLAB));
    return {
      id: b.id, ring: windOutward(b.pts), style: 'stock', shop: false, area, canopy: true,
      height, basis: b.height !== undefined ? 'height' : 'assumed', storeys: 1, storeyHeight: height - CANOPY_SLAB,
    };
  }
  const style = facadeStyle(b, area, centre);
  const h = planHeight(b, style, area);
  return { id: b.id, ring: windOutward(b.pts), style, shop: hasShop(b, area) && h.storeys >= 1, area, canopy: false, ...h };
}

// ---------------------------------------------------------------------------------------------
// 4. facade layout: how a wall of a given length takes the texture

export interface BayLayout {
  /** whole bays on the wall; 0 means a blank wall (too short for a window) */
  bays: number;
  /** wall metres per texture metre along the wall: the bay is stretched to fit a whole number of them */
  stretch: number;
}

/** Widest a window may be stretched, narrowest it may be squeezed (the wall's bay over the tile's bay). */
export const BAY_STRETCH: [number, number] = [0.8, 1.45];

/**
 * Fit whole bays to a wall `length` metres long, `bay` metres being the texture's own bay. Windows are never
 * cut off by a corner: n = round(length / bay), and a wall too short for even one squeezed bay is blank.
 */
export function bayLayout(length: number, bay: number): BayLayout {
  const n = Math.max(1, Math.round(length / bay));
  const stretch = length / (n * bay);
  if (stretch < BAY_STRETCH[0] || stretch > BAY_STRETCH[1]) return { bays: 0, stretch: 1 };
  return { bays: n, stretch };
}

/** One wall of a building ring. */
export interface Wall {
  i: number;
  a: Pt;
  b: Pt;
  length: number;
  /** unit outward normal */
  normal: Pt;
  mid: Pt;
}

/** The walls of a ring wound by windOutward: the outward normal of a -> b is (dz, -dx) / length. */
export function wallsOf(ring: readonly Pt[]): Wall[] {
  const out: Wall[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i] as Pt;
    const b = ring[(i + 1) % ring.length] as Pt;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 0.05) continue;
    out.push({ i, a, b, length, normal: [dz / length, -dx / length], mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// 5. a tiny mesh accumulator (positions, normals, UVs in metres, colours) and the shapes built with it

export type V3 = [number, number, number];
export type V2 = [number, number];

export class MeshAcc {
  readonly positions: number[] = [];
  readonly normals: number[] = [];
  readonly uvs: number[] = [];
  /** per-vertex tint 0..1 in sRGB terms; the page converts to linear when it builds the geometry */
  readonly colors: number[] = [];
  readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  get triangleCount(): number {
    return this.indices.length / 3;
  }

  /** One flat triangle; the winding is flipped if needed so its face looks along `facing`. */
  tri(a: V3, b: V3, c: V3, ua: V2, ub: V2, uc: V2, color: V3, facing: V3): void {
    const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2: V3 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) return; // a sliver with no area
    n = [n[0] / l, n[1] / l, n[2] / l];
    let p = [a, b, c];
    let uv = [ua, ub, uc];
    if (n[0] * facing[0] + n[1] * facing[1] + n[2] * facing[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      p = [a, c, b];
      uv = [ua, uc, ub];
    }
    const base = this.vertexCount;
    for (let k = 0; k < 3; k++) {
      const v = p[k] as V3;
      const t = uv[k] as V2;
      this.positions.push(v[0], v[1], v[2]);
      this.normals.push(n[0], n[1], n[2]);
      this.uvs.push(t[0], t[1]);
      this.colors.push(color[0], color[1], color[2]);
    }
    this.indices.push(base, base + 1, base + 2);
  }

  quad(a: V3, b: V3, c: V3, d: V3, ua: V2, ub: V2, uc: V2, ud: V2, color: V3, facing: V3): void {
    this.tri(a, b, c, ua, ub, uc, color, facing);
    this.tri(a, c, d, ua, uc, ud, color, facing);
  }
}

export const UP: V3 = [0, 1, 0];

/**
 * Triangulate a simple polygon by ear clipping. Returns index triples into `ring`. Either winding.
 * Holes are not supported. A ring that stalls (a self-intersection in the data) is finished with
 * a fan, so it always ends.
 */
export function triangulate(ring: readonly Pt[]): number[] {
  const n = ring.length;
  if (n < 3) return [];
  const order = Array.from({ length: n }, (_, i) => i);
  if (area2(ring) < 0) order.reverse();
  const cross = (a: Pt, b: Pt, c: Pt): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const inside = (p: Pt, a: Pt, b: Pt, c: Pt): boolean => cross(a, b, p) >= 0 && cross(b, c, p) >= 0 && cross(c, a, p) >= 0;
  const out: number[] = [];
  let guard = 0;
  while (order.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let k = 0; k < order.length; k++) {
      const ia = order[(k + order.length - 1) % order.length] as number;
      const ib = order[k] as number;
      const ic = order[(k + 1) % order.length] as number;
      const a = ring[ia] as Pt;
      const b = ring[ib] as Pt;
      const c = ring[ic] as Pt;
      if (cross(a, b, c) <= 1e-9) continue; // reflex or flat
      let ear = true;
      for (const j of order) {
        if (j === ia || j === ib || j === ic) continue;
        const p = ring[j] as Pt;
        if ((p[0] === a[0] && p[1] === a[1]) || (p[0] === b[0] && p[1] === b[1]) || (p[0] === c[0] && p[1] === c[1])) continue;
        if (inside(p, a, b, c)) {
          ear = false;
          break;
        }
      }
      if (!ear) continue;
      out.push(ia, ib, ic);
      order.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) {
      // a degenerate ring: drop the flattest corner so the loop always ends
      let flat = 0;
      let best = Infinity;
      for (let k = 0; k < order.length; k++) {
        const v = Math.abs(cross(ring[order[(k + order.length - 1) % order.length] as number] as Pt, ring[order[k] as number] as Pt, ring[order[(k + 1) % order.length] as number] as Pt));
        if (v < best) {
          best = v;
          flat = k;
        }
      }
      order.splice(flat, 1);
    }
  }
  if (order.length === 3) out.push(order[0] as number, order[1] as number, order[2] as number);
  return out;
}

export const DOWN: V3 = [0, -1, 0];

/** A polygon lying flat at height y, facing up (or `facing`, e.g. DOWN for an underside). UVs are metres in the ground plane, so a texture keeps its scale. */
export function flatPolygon(acc: MeshAcc, ring: readonly Pt[], y: number, color: V3, facing: V3 = UP): void {
  const t = triangulate(ring);
  const uv = (p: Pt): V2 => [p[0], p[1]];
  for (let i = 0; i < t.length; i += 3) {
    const a = ring[t[i] as number] as Pt;
    const b = ring[t[i + 1] as number] as Pt;
    const c = ring[t[i + 2] as number] as Pt;
    acc.tri([a[0], y, a[1]], [b[0], y, b[1]], [c[0], y, c[1]], uv(a), uv(b), uv(c), color, facing);
  }
}

/**
 * The polyline moved `d` metres to its left (left of the direction of travel on a north-up map), with mitred
 * corners. The mitre is cut off at `limit` times d so a hairpin cannot throw a spike across the map.
 */
export function offsetLine(line: readonly Pt[], d: number, limit = 2.5): Pt[] {
  const n = line.length;
  const normals: Pt[] = [];
  for (let i = 0; i + 1 < n; i++) {
    const a = line[i] as Pt;
    const b = line[i + 1] as Pt;
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    normals.push([(b[1] - a[1]) / l, -(b[0] - a[0]) / l]);
  }
  return line.map((p, i) => {
    const prev = normals[i - 1];
    const next = normals[i];
    const m: Pt = prev && next ? [prev[0] + next[0], prev[1] + next[1]] : (prev ?? next ?? [0, 0]);
    const ml = Math.hypot(m[0], m[1]) || 1;
    const u: Pt = [m[0] / ml, m[1] / ml];
    const ref = prev ?? next ?? u;
    const cos = Math.max(1 / limit, u[0] * ref[0] + u[1] * ref[1]);
    return [p[0] + (u[0] * d) / cos, p[1] + (u[1] * d) / cos];
  });
}

/** Cumulative distance along a polyline at each vertex. */
export function chainage(line: readonly Pt[]): number[] {
  const out = [0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1] as Pt;
    const b = line[i] as Pt;
    out.push((out[i - 1] as number) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return out;
}

/**
 * A flat strip along a polyline between lateral offsets `from` and `to` (metres, left positive), at height y.
 * u runs along the line in metres, v across it in metres from `from`.
 */
export function strip(acc: MeshAcc, line: readonly Pt[], from: number, to: number, y: number, color: V3): void {
  if (line.length < 2 || from === to) return;
  const a = offsetLine(line, from);
  const b = offsetLine(line, to);
  const s = chainage(line);
  const w = Math.abs(to - from);
  for (let i = 0; i + 1 < line.length; i++) {
    const a0 = a[i] as Pt;
    const a1 = a[i + 1] as Pt;
    const b0 = b[i] as Pt;
    const b1 = b[i + 1] as Pt;
    acc.quad([a0[0], y, a0[1]], [b0[0], y, b0[1]], [b1[0], y, b1[1]], [a1[0], y, a1[1]], [s[i] as number, 0], [s[i] as number, w], [s[i + 1] as number, w], [s[i + 1] as number, 0], color, UP);
  }
}

/** The part of a polyline between chainage s0 and s1, as a polyline. */
export function subLine(line: readonly Pt[], s0: number, s1: number): Pt[] {
  const s = chainage(line);
  const at = (d: number): Pt => {
    for (let i = 1; i < line.length; i++) {
      if (d <= (s[i] as number) || i === line.length - 1) {
        const a = line[i - 1] as Pt;
        const b = line[i] as Pt;
        const len = (s[i] as number) - (s[i - 1] as number) || 1;
        const t = Math.min(1, Math.max(0, (d - (s[i - 1] as number)) / len));
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    return line[line.length - 1] as Pt;
  };
  const out: Pt[] = [at(s0)];
  for (let i = 1; i < line.length - 1; i++) if ((s[i] as number) > s0 && (s[i] as number) < s1) out.push(line[i] as Pt);
  out.push(at(s1));
  return out;
}

/** Length of a polyline. */
export const lineLength = (line: readonly Pt[]): number => (chainage(line).pop() as number) || 0;

// ---------------------------------------------------------------------------------------------
// 6. nearest-road index (so a shopfront goes on the wall that faces a street)

export interface RoadSeg {
  a: Pt;
  b: Pt;
  /** half the drawn width plus the pavement: where the pedestrian space ends */
  reach: number;
}

/** Do the open segments a-b and c-d cross each other (a proper crossing, not a touch)? */
export function segmentsCross(a: Pt, b: Pt, c: Pt, d: Pt): boolean {
  const cross = (o: Pt, p: Pt, q: Pt): number => (p[0] - o[0]) * (q[1] - o[1]) - (p[1] - o[1]) * (q[0] - o[0]);
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}

export class SegmentGrid {
  private readonly cells = new Map<string, RoadSeg[]>();
  private readonly cell: number;

  constructor(cell = 40) {
    this.cell = cell;
  }

  add(seg: RoadSeg): void {
    const x0 = Math.floor(Math.min(seg.a[0], seg.b[0]) / this.cell);
    const x1 = Math.floor(Math.max(seg.a[0], seg.b[0]) / this.cell);
    const z0 = Math.floor(Math.min(seg.a[1], seg.b[1]) / this.cell);
    const z1 = Math.floor(Math.max(seg.a[1], seg.b[1]) / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        const key = `${x},${z}`;
        const list = this.cells.get(key);
        if (list) list.push(seg);
        else this.cells.set(key, [seg]);
      }
    }
  }

  /** Does the segment a-b cross any segment in the grid? */
  crosses(a: Pt, b: Pt): boolean {
    const x0 = Math.floor(Math.min(a[0], b[0]) / this.cell);
    const x1 = Math.floor(Math.max(a[0], b[0]) / this.cell);
    const z0 = Math.floor(Math.min(a[1], b[1]) / this.cell);
    const z1 = Math.floor(Math.max(a[1], b[1]) / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (const s of this.cells.get(`${x},${z}`) ?? []) if (segmentsCross(a, b, s.a, s.b)) return true;
      }
    }
    return false;
  }

  /** Distance from `p` to the nearest segment within `radius`, or Infinity. */
  nearest(p: Pt, radius: number): number {
    let best = Infinity;
    const x0 = Math.floor((p[0] - radius) / this.cell);
    const x1 = Math.floor((p[0] + radius) / this.cell);
    const z0 = Math.floor((p[1] - radius) / this.cell);
    const z1 = Math.floor((p[1] + radius) / this.cell);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        for (const s of this.cells.get(`${x},${z}`) ?? []) {
          const dx = s.b[0] - s.a[0];
          const dz = s.b[1] - s.a[1];
          const l2 = dx * dx + dz * dz || 1;
          const t = Math.min(1, Math.max(0, ((p[0] - s.a[0]) * dx + (p[1] - s.a[1]) * dz) / l2));
          const d = Math.hypot(p[0] - (s.a[0] + dx * t), p[1] - (s.a[1] + dz * t)) - s.reach;
          if (d < best) best = d;
        }
      }
    }
    return best;
  }
}

/** Does this wall face a street: a road lies within `within` metres in front of it, and nearer than behind it. */
export function wallFacesStreet(w: Pick<Wall, 'mid' | 'normal'>, grid: SegmentGrid, within = 18): boolean {
  const front = grid.nearest([w.mid[0] + w.normal[0] * 4, w.mid[1] + w.normal[1] * 4], within);
  const behind = grid.nearest([w.mid[0] - w.normal[0] * 4, w.mid[1] - w.normal[1] * 4], within);
  return front <= within && front < behind;
}

// ---------------------------------------------------------------------------------------------
// 7. the whole city, as meshes per material

export type CityKey = FacadeKey | 'roof' | 'asphalt' | 'pavement' | 'paint' | 'plaza' | 'grass' | 'water';

export const CITY_KEYS: readonly CityKey[] = ['stock', 'red', 'stone', 'panel', 'glass', 'shop', 'roof', 'asphalt', 'pavement', 'paint', 'plaza', 'grass', 'water'];

/**
 * Height above the ground of each flat layer, metres, lowest first. They are a centimetre or two apart,
 * and the page also gives each material a polygon offset in this order, so none of them z-fights at any
 * distance the camera can reach.
 */
/**
 * A street that crosses the railway rides this many metres above its usual layer, so the track passes beneath
 * it (the deck covers the rails, as a bridge does from above) instead of the rails showing through the road.
 * ASSUMED: a deck at rail head height, not a real clearance; there are no ramps.
 */
export const BRIDGE_LIFT = 0.5;

export const LAYER_LIFT: Readonly<Record<'grass' | 'water' | 'plaza' | 'pavement' | 'asphalt' | 'paint', number>> = {
  grass: 0.02, water: 0.03, plaza: 0.05, pavement: 0.07, asphalt: 0.09, paint: 0.1,
};

export interface CityBuildOptions {
  /** ids of buildings that are drawn some other way */
  hidden?: ReadonlySet<number>;
  /** polygons (the station, the landmarks): no street, path, square or tree centred inside one is drawn */
  exclude?: readonly (readonly Pt[])[];
  /** ground height, metres (web/src/world.ts GROUND_Y) */
  groundY?: number;
  /** also build the tree list */
  trees?: boolean;
  /** flat xyz segment pairs of the surface railway (scene.ts railSegments main + siding): a street that crosses one rides over it */
  rails?: readonly number[];
}

export interface TreeSpot {
  x: number;
  z: number;
  /** height in metres */
  height: number;
  yaw: number;
  /** 0..1, a green variation */
  tone: number;
}

export interface CityMeshes {
  meshes: Record<CityKey, MeshAcc>;
  trees: TreeSpot[];
  stats: {
    buildings: number;
    /** of those, open-sided `building=roof` canopies (no facade) */
    canopies: number;
    walls: number;
    shopWalls: number;
    blankWalls: number;
    roads: number;
    roadsSkipped: number;
    liftedRuns: number;
    canals: number;
    areas: number;
    byBasis: Record<BuildingPlan['basis'], number>;
    byStyle: Record<FacadeKey, number>;
  };
}

/** sRGB 0..1 to linear light, which is what a vertex colour is read as. */
export const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** A 0xRRGGBB colour as a vertex colour (linear). Tints that only scale a texture are plain multipliers and skip this. */
export const rgb = (hex: number): V3 => [srgbToLinear(((hex >> 16) & 255) / 255), srgbToLinear(((hex >> 8) & 255) / 255), srgbToLinear((hex & 255) / 255)];
const mul = (c: V3, k: number): V3 => [Math.min(1, c[0] * k), Math.min(1, c[1] * k), Math.min(1, c[2] * k)];

/** The tint a building's facade is multiplied by: a few per cent of brightness and warmth, the same every load. */
export function facadeTint(id: number): V3 {
  const k = 0.84 + hash01(id, 1) * 0.3;
  const warm = hash01(id, 2) * 2 - 1;
  return [Math.min(1.1, k * (1 + 0.05 * warm)), k, Math.min(1.1, k * (1 - 0.07 * warm))];
}

/** Roof and coping colours: mostly dark bitumen, some slate, light gravel and clay tile. ASSUMED mix. */
export function roofTint(id: number): V3 {
  const roll = hash01(id, 5);
  const base = roll < 0.55 ? 0x565a60 : roll < 0.75 ? 0x4c5764 : roll < 0.88 ? 0x7f7f7b : 0x7a4b3a;
  return mul(rgb(base), 0.85 + hash01(id, 4) * 0.35);
}

export interface WallPart {
  key: FacadeKey;
  y0: number;
  y1: number;
  /** storeys in this part (v runs 0 .. storeys x tile height) */
  storeys: number;
}

/** Split one wall into its parts bottom to top: a shopfront ground storey, then the storeys above. */
export function wallParts(plan: Pick<BuildingPlan, 'style' | 'storeys' | 'storeyHeight' | 'shop'>, shopWall: boolean, groundY: number): WallPart[] {
  const top = groundY + plan.storeys * plan.storeyHeight;
  if (!shopWall) return [{ key: plan.style, y0: groundY, y1: top, storeys: plan.storeys }];
  if (plan.storeys === 1) return [{ key: 'shop', y0: groundY, y1: top, storeys: 1 }];
  // the shopfront is one 4 m storey; the rest share what is left
  const g = FACADE.shop.tile[1];
  const rest = top - groundY - g;
  const n = plan.storeys - 1;
  if (rest / n < STOREY_RANGE[0]) return [{ key: plan.style, y0: groundY, y1: top, storeys: plan.storeys }];
  return [{ key: 'shop', y0: groundY, y1: groundY + g, storeys: 1 }, { key: plan.style, y0: groundY + g, y1: top, storeys: n }];
}

/** A square post of side `s` centred on (x, z), from y0 to y1: four faces, no top or bottom (both are hidden). */
export function post(acc: MeshAcc, x: number, z: number, y0: number, y1: number, s: number, color: V3): void {
  const h = s / 2;
  const c: Pt[] = [[x - h, z - h], [x + h, z - h], [x + h, z + h], [x - h, z + h]];
  for (let i = 0; i < 4; i++) {
    const a = c[i] as Pt;
    const b = c[(i + 1) % 4] as Pt;
    const n: V3 = [Math.sign((a[0] + b[0]) / 2 - x), 0, Math.sign((a[1] + b[1]) / 2 - z)];
    acc.quad([a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], [0, 0], [1, 0], [1, 1], [0, 1], color, n);
  }
}

/** An open-sided canopy: a slab on posts, everything in the roof mesh (a dark underside, a lighter fascia). */
function addCanopy(acc: Record<CityKey, MeshAcc>, plan: BuildingPlan, groundY: number): void {
  const roof = roofTint(plan.id);
  const top = groundY + plan.height;
  const under = top - CANOPY_SLAB;
  for (const w of wallsOf(plan.ring)) {
    const out: V3 = [w.normal[0], 0, w.normal[1]];
    acc.roof.quad([w.a[0], under, w.a[1]], [w.b[0], under, w.b[1]], [w.b[0], top, w.b[1]], [w.a[0], top, w.a[1]], [0, 0], [1, 0], [1, 1], [0, 1], mul(roof, 1.45), out);
  }
  flatPolygon(acc.roof, plan.ring, top, roof);
  flatPolygon(acc.roof, plan.ring, under, mul(roof, 0.5), DOWN);
  for (const p of plan.ring) post(acc.roof, p[0], p[1], groundY, under, CANOPY_POST, mul(roof, 0.8));
}

function addWalls(acc: Record<CityKey, MeshAcc>, plan: BuildingPlan, grid: SegmentGrid, groundY: number, stats: CityMeshes['stats']): void {
  if (plan.canopy) {
    addCanopy(acc, plan, groundY);
    return;
  }
  const tint = facadeTint(plan.id);
  const roof = roofTint(plan.id);
  const coping = mul(roof, 1.45);
  const top = groundY + plan.storeys * plan.storeyHeight;
  const roofY = top;
  const crest = top + PARAPET;
  for (const w of wallsOf(plan.ring)) {
    stats.walls++;
    const shopWall = plan.shop && wallFacesStreet(w, grid);
    if (shopWall) stats.shopWalls++;
    const out: V3 = [w.normal[0], 0, w.normal[1]];
    const inward: V3 = [-w.normal[0], 0, -w.normal[1]];
    for (const part of wallParts(plan, shopWall, groundY)) {
      const spec = FACADE[part.key];
      const lay = bayLayout(w.length, spec.tile[0]);
      if (lay.bays === 0) stats.blankWalls++;
      // u in tile metres: whole bays across a wall that has them, else one fixed blank column of the tile
      const u1 = lay.bays === 0 ? 0.05 * spec.tile[0] : lay.bays * spec.tile[0];
      const u0 = lay.bays === 0 ? 0.05 * spec.tile[0] : 0;
      const v1 = part.storeys * spec.tile[1];
      acc[part.key].quad([w.a[0], part.y0, w.a[1]], [w.b[0], part.y0, w.b[1]], [w.b[0], part.y1, w.b[1]], [w.a[0], part.y1, w.a[1]], [u0, 0], [u1, 0], [u1, v1], [u0, v1], tint, out);
    }
    // coping band on the outside and the parapet's inner face, both in the roof colour
    acc.roof.quad([w.a[0], roofY, w.a[1]], [w.b[0], roofY, w.b[1]], [w.b[0], crest, w.b[1]], [w.a[0], crest, w.a[1]], [0, 0], [1, 0], [1, 1], [0, 1], coping, out);
    acc.roof.quad([w.a[0], roofY, w.a[1]], [w.b[0], roofY, w.b[1]], [w.b[0], crest, w.b[1]], [w.a[0], crest, w.a[1]], [0, 0], [1, 0], [1, 1], [0, 1], roof, inward);
  }
  flatPolygon(acc.roof, plan.ring, roofY, roof);
}

const emptyAcc = (): Record<CityKey, MeshAcc> => Object.fromEntries(CITY_KEYS.map((k) => [k, new MeshAcc()])) as Record<CityKey, MeshAcc>;

const pavementTint: V3 = [0.78, 0.78, 0.76];
const kerbTint: V3 = [1.0, 1.0, 0.96];
const dashTint: V3 = [0.86, 0.86, 0.8];

/** Is the point's anchor inside any excluded polygon? */
export function inAny(p: Pt, polys: readonly (readonly Pt[])[]): boolean {
  return polys.some((poly) => pointInPolygon(p, poly as Pt[]));
}

export interface RoadRun {
  line: Pt[];
  lifted: boolean;
}

/**
 * Cut a street into runs of segments that are drawn the same way. A segment whose middle `skip` says is not
 * drawn at all (it ends the run); a segment `lifted` says is a bridge over the railway starts a lifted run.
 */
export function roadRuns(line: readonly Pt[], skip: (mid: Pt) => boolean, lifted: (a: Pt, b: Pt) => boolean): RoadRun[] {
  const runs: RoadRun[] = [];
  let cur: RoadRun | null = null;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Pt;
    const b = line[i + 1] as Pt;
    if (skip([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) {
      cur = null;
      continue;
    }
    const up = lifted(a, b);
    if (cur && cur.lifted === up) cur.line.push(b);
    else {
      cur = { line: [a, b], lifted: up };
      runs.push(cur);
    }
  }
  return runs;
}

/** Everything the city draws, as one mesh accumulator per material. */
export function buildCity(buildings: readonly Building[], city: CityData, opts: CityBuildOptions = {}): CityMeshes {
  const groundY = opts.groundY ?? -0.2;
  const hidden = opts.hidden ?? new Set<number>();
  const exclude = opts.exclude ?? [];
  const acc = emptyAcc();
  const stats: CityMeshes['stats'] = {
    buildings: 0, canopies: 0, walls: 0, shopWalls: 0, blankWalls: 0, roads: 0, roadsSkipped: 0, liftedRuns: 0, canals: 0, areas: 0,
    byBasis: { height: 0, levels: 0, assumed: 0 },
    byStyle: { stock: 0, red: 0, stone: 0, panel: 0, glass: 0, shop: 0 },
  };

  // the streets first: their reach lets a building tell which wall faces one
  const grid = new SegmentGrid();
  const streets = city.roads.filter((r) => ['trunk', 'primary', 'secondary', 'tertiary', 'minor', 'pedestrian'].includes(r.cls));
  for (const r of streets) {
    const reach = roadWidth(r).width / 2 + ROAD_STYLE[r.cls].pavement;
    for (let i = 0; i + 1 < r.pts.length; i++) grid.add({ a: r.pts[i] as Pt, b: r.pts[i + 1] as Pt, reach });
  }

  for (const b of buildings) {
    if (hidden.has(b.id) || b.pts.length < 3) continue;
    const plan = planBuilding(b);
    stats.buildings++;
    stats.byBasis[plan.basis]++;
    if (plan.canopy) stats.canopies++;
    else stats.byStyle[plan.style]++;
    addWalls(acc, plan, grid, groundY, stats);
  }

  // open ground, lowest layer first
  const ground = (kind: AreaKind): { key: CityKey; color: V3 } =>
    kind === 'water' ? { key: 'water', color: [1, 1, 1] }
      : kind === 'paved' ? { key: 'plaza', color: [1, 1, 1] }
        : kind === 'pitch' ? { key: 'grass', color: [0.62, 0.78, 0.7] }
          : kind === 'wood' ? { key: 'grass', color: [0.62, 0.78, 0.55] }
            : { key: 'grass', color: [1, 1, 1] };
  for (const a of city.areas) {
    if (inAny(ringCentroid(a.pts), exclude)) continue;
    const g = ground(a.kind);
    flatPolygon(acc[g.key], a.pts, groundY + LAYER_LIFT[g.key as 'grass' | 'water' | 'plaza'], g.color);
    stats.areas++;
  }
  for (const c of city.canals) {
    strip(acc.water, c.pts, -(c.width ?? CANAL_WIDTH) / 2, (c.width ?? CANAL_WIDTH) / 2, groundY + LAYER_LIFT.water, [1, 1, 1]);
    stats.canals++;
  }

  // streets, widest class last so a side road's end does not cut across the main road. Each street is cut into runs:
  // a stretch whose middle is inside an excluded polygon (the station) is not drawn, and a stretch that crosses the
  // railway rides BRIDGE_LIFT higher so the track passes under it.
  const railGrid = new SegmentGrid();
  const rails = opts.rails ?? [];
  for (let i = 0; i + 5 < rails.length; i += 6) railGrid.add({ a: [rails[i] as number, rails[i + 2] as number], b: [rails[i + 3] as number, rails[i + 5] as number], reach: 0 });
  const order: RoadClass[] = ['path', 'cycleway', 'pedestrian', 'service', 'minor', 'tertiary', 'secondary', 'primary', 'trunk'];
  const roads = city.roads.slice().sort((p, q) => order.indexOf(p.cls) - order.indexOf(q.cls));
  for (const r of roads) {
    const runs = roadRuns(r.pts, (mid) => inAny(mid, exclude), (a, b) => railGrid.crosses(a, b));
    if (runs.length === 0) {
      stats.roadsSkipped++;
      continue;
    }
    const style = ROAD_STYLE[r.cls];
    const { width } = roadWidth(r);
    const half = width / 2;
    for (const run of runs) {
      const lift = run.lifted ? BRIDGE_LIFT : 0;
      if (run.lifted) stats.liftedRuns++;
      const line = run.line;
      if (style.surface === 'paving') {
        strip(acc.pavement, line, -half, half, groundY + LAYER_LIFT.pavement + lift, kerbTint);
      } else {
        strip(acc.asphalt, line, -half, half, groundY + LAYER_LIFT.asphalt + lift, [1, 1, 1]);
        if (style.pavement > 0) {
          strip(acc.pavement, line, half, half + style.pavement, groundY + LAYER_LIFT.pavement + lift, pavementTint);
          strip(acc.pavement, line, -half - style.pavement, -half, groundY + LAYER_LIFT.pavement + lift, pavementTint);
          strip(acc.pavement, line, half, half + 0.18, groundY + LAYER_LIFT.pavement + lift + 0.002, kerbTint);
          strip(acc.pavement, line, -half - 0.18, -half, groundY + LAYER_LIFT.pavement + lift + 0.002, kerbTint);
        }
        // a dashed centre line on a two-way road wide enough for two lanes
        if (!r.oneway && width >= 5.4 && style.pavement > 0) {
          const len = lineLength(line);
          for (let d = 1; d + 3 < len; d += 9) strip(acc.paint, subLine(line, d, d + 3), -0.08, 0.08, groundY + LAYER_LIFT.paint + lift, dashTint);
        }
      }
    }
    stats.roads++;
  }

  // trees: where OSM puts them, outside the excluded polygons and outside every building, with a repeatable size
  const trees: TreeSpot[] = [];
  if (opts.trees !== false) {
    const boxes = buildings.map((b) => {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of b.pts) {
        if (p[0] < minX) minX = p[0];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] < minZ) minZ = p[1];
        if (p[1] > maxZ) maxZ = p[1];
      }
      return { minX, maxX, minZ, maxZ };
    });
    const inBuilding = (t: Pt): boolean => buildings.some((b, i) => {
      const box = boxes[i] as (typeof boxes)[number];
      return t[0] >= box.minX && t[0] <= box.maxX && t[1] >= box.minZ && t[1] <= box.maxZ && pointInPolygon(t, b.pts);
    });
    city.trees.forEach((t, i) => {
      if (inAny(t, exclude) || inBuilding(t)) return;
      trees.push({ x: t[0], z: t[1], height: 6 + hash01(i, 7) * 6, yaw: hash01(i, 8) * Math.PI * 2, tone: hash01(i, 9) });
    });
  }
  return { meshes: acc, trees, stats };
}
