// The Scottish scene's street lamps (round seven, night lighting). core/streetlights.ts puts them along the OSM roads of web/src/data/waverley-lamp-roads.json (tools/build-waverley-lamp-roads.ts makes it
// from the W3 city element's waverley-roads.json: the classes the lamps stand along, in a fifth of the bytes), web/src/streetlights.ts draws them as London's are drawn, and station-weather.ts brings
// them on with the sky's own lamp level. This file is a lazy chunk of its own: London's page never loads the roads, the footprints or this code.
//
// What is read from the night photographs (gfx-rubrics/refs/night/): night-f-waverley-north-bridge-elevated-2011-curtis.jpg shows North Bridge's row of sodium lamps along both kerbs of the deck, and the
// streets round it (Market Street, Cockburn Street, the Royal Mile) lit orange; the kinds, the heights and the spacings are core/streetlights.ts's. Not in any photograph, so ASSUMED: every lamp's place
// (the road lines are the OSM ways' and the carriageway the ground is painted with, W3's), the deck heights of the bridges (the frontage's own rule, below), the classes that are lit (the lean file's).
import type { Height, RoadClass } from '../../core/city.ts';
import { hash01, SegmentGrid } from '../../core/city.ts';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';
import { decodeLampRoads, lampSpots } from '../../core/streetlights.ts';
import type { LampRoad, LampRoadsFile, LampRun, LampSpot } from '../../core/streetlights.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import { createStreetLights } from './streetlights.ts';
import type { StreetLights } from './streetlights.ts';

/**
 * The carriageway the Scottish ground is painted with, metres across, by class (tools/build-waverley-city-landuse.ts `ROAD_WIDTH`, the W3 city element's: ASSUMED typical Edinburgh city-centre widths, no
 * survey; web/src/waverley-city-ground.ts strokes the roads at these widths): a lamp stands at the kerb of the road the ground shows, half of this and a kerb's width from the OSM line.
 */
export const WAVERLEY_ROAD_WIDTH: Readonly<Record<RoadClass, number>> = { trunk: 11, primary: 11, secondary: 10, tertiary: 8.5, minor: 7, service: 4.5, pedestrian: 5, path: 2.5, cycleway: 2.5 };

/** A building's outline for the lamps to stand clear of: its ring, the courtyards inside it, and the box round it. */
export interface Footprint {
  box: readonly [number, number, number, number];
  outer: readonly Pt[];
  holes: readonly (readonly Pt[])[];
}

export function footprintsOf(areas: readonly { outer: readonly Pt[]; holes: readonly (readonly Pt[])[] }[]): Footprint[] {
  return areas.map((area) => {
    const xs = area.outer.map((p) => p[0]);
    const zs = area.outer.map((p) => p[1]);
    return { box: [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)], outer: area.outer, holes: area.holes };
  });
}

const lengthOf = (line: readonly Pt[]): number => line.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - (line[i] as Pt)[0], p[1] - (line[i] as Pt)[1]), 0);
/** A point as a key to the half metre: the lean file's own resolution, so the ends of two decks that share an OSM node share a key. */
const keyOf = (p: Pt): string => `${Math.round(p[0] * 2)},${Math.round(p[1] * 2)}`;

/**
 * The height of each bridge's deck along its line. Decks that meet end to end are one deck (Waverley Bridge is three OSM ways, a minor road and two pedestrian ones), and a deck rises or falls straight
 * from the ground at one end to the ground at the other: the rule the Scottish frontage draws its own decks by (waverley-frontage.ts: "ends at the unwarped DTM, linear between"), so a lamp stands on the
 * deck the page draws. `context` is that DTM, the ground without the railway's flattening (the drawn ground is flattened to the rail datum under both bridges). A node where three decks meet ends a
 * chain and does not join them. The functions are of metres along the deck's own line, and a deck whose line runs against its chain is read from the other end.
 */
export function deckHeights(decks: readonly LampRoad[], context: (x: number, z: number) => number): Height[] {
  const at = new Map<string, number[]>();
  decks.forEach((deck, i) => {
    for (const p of [deck.line[0] as Pt, deck.line[deck.line.length - 1] as Pt]) at.set(keyOf(p), [...(at.get(keyOf(p)) ?? []), i]);
  });
  const others = (i: number, k: string): number[] => (at.get(k) ?? []).filter((j) => j !== i);
  const used = new Set<number>();
  const out: Height[] = [];
  const chain = (first: number, reversed: boolean): void => {
    const members: { deck: number; reversed: boolean; from: number }[] = [];
    let [deck, back, total] = [first, reversed, 0];
    for (;;) {
      used.add(deck);
      members.push({ deck, reversed: back, from: total });
      total += lengthOf((decks[deck] as LampRoad).line);
      const line = (decks[deck] as LampRoad).line;
      const far = keyOf((back ? line[0] : line[line.length - 1]) as Pt);
      const next = others(deck, far);
      const [following] = next;
      if (next.length !== 1 || following === undefined || used.has(following)) break;
      const nextLine = (decks[following] as LampRoad).line;
      [deck, back] = [following, keyOf(nextLine[0] as Pt) !== far];
    }
    const head = (decks[first] as LampRoad).line;
    const last = members[members.length - 1] as (typeof members)[number];
    const tail = (decks[last.deck] as LampRoad).line;
    const [start, end] = [(reversed ? head[head.length - 1] : head[0]) as Pt, (last.reversed ? tail[0] : tail[tail.length - 1]) as Pt];
    const [h0, h1] = [context(start[0], start[1]), context(end[0], end[1])];
    for (const m of members) {
      const length = lengthOf((decks[m.deck] as LampRoad).line);
      out[m.deck] = (_x, _z, s) => h0 + (h1 - h0) * Math.min(1, Math.max(0, (m.from + (m.reversed ? length - s : s)) / (total || 1)));
    }
  };
  // from a chain's end (a node no other deck, or several, meets), so a chain is walked whole; what is left (a ring of decks) from where it stands
  for (const pass of [true, false]) {
    decks.forEach((deck, i) => {
      if (used.has(i)) return;
      const [a, b] = [keyOf(deck.line[0] as Pt), keyOf(deck.line[deck.line.length - 1] as Pt)];
      const free = (k: string): boolean => others(i, k).length !== 1;
      if (free(a)) chain(i, false);
      else if (free(b)) chain(i, true);
      else if (!pass) chain(i, false);
    });
  }
  return out;
}

/**
 * The lamps of the Scottish scene. `ground` is the ground as drawn (metres up at x, z) and `context` the DTM a bridge's deck is drawn from (`deckHeights`). A lamp stands clear of every building, and a
 * lamp on the ground clear of the carriageway of every other road on the ground (a lamp on a deck of the carriageways of the other decks: the road under a bridge is not its business). ASSUMED: every
 * lamp's place; see the head of the file.
 */
export function waverleyLampSpots(file: LampRoadsFile, ground: (x: number, z: number) => number, context: (x: number, z: number) => number, footprints: readonly Footprint[]): LampSpot[] {
  const roads = decodeLampRoads(file);
  const decks = roads.flatMap((road, i) => (road.bridge ? [i] : []));
  const heights = deckHeights(decks.map((i) => roads[i] as LampRoad), context);
  const deckOf = new Map(decks.map((road, k) => [road, heights[k] as Height]));
  const runs: LampRun[] = roads.map((road, id) => ({ id, cls: road.cls, half: (WAVERLEY_ROAD_WIDTH[road.cls] as number) / 2, line: road.line, y: deckOf.get(id) ?? ((x, z) => ground(x, z)) }));
  const carriageways = { ground: new SegmentGrid(), deck: new SegmentGrid() };
  for (const road of roads) {
    const grid = road.bridge ? carriageways.deck : carriageways.ground;
    for (let i = 0; i + 1 < road.line.length; i++) grid.add({ a: road.line[i] as Pt, b: road.line[i + 1] as Pt, reach: (WAVERLEY_ROAD_WIDTH[road.cls] as number) / 2 });
  }
  const inBuilding = (p: Pt): boolean => footprints.some((f) => p[0] >= f.box[0] && p[0] <= f.box[1] && p[1] >= f.box[2] && p[1] <= f.box[3] && pointInPolygon(p, f.outer as Pt[]) && !f.holes.some((h) => pointInPolygon(p, h as Pt[])));
  // a road runs to the terrain's edge and a lamp stands a few metres off its line: not outside the terrain, where the ground is not the terrain's
  const { x0, z0, x1, z1 } = file.extent;
  const outside = (p: Pt): boolean => p[0] < x0 || p[0] > x1 || p[1] < z0 || p[1] > z1;
  return lampSpots(runs, {
    rand: hash01,
    modern: () => false,
    blocked: (p, id) => outside(p) || ((roads[id] as LampRoad).bridge ? carriageways.deck.nearest(p, 6) < 0.3 : inBuilding(p) || carriageways.ground.nearest(p, 6) < 0.3),
  });
}

/**
 * Load the Scottish street lamps: the roads, the building outlines (the scene's own OSM data, already loaded by the model) and the context DTM, each a lazy chunk, and the lamps they make. `drawn` is
 * the ground as the scene draws it. Resolves to the lamps' layer (a post to each, a glow at its head and a pool under it: web/src/streetlights.ts), not yet in any scene.
 */
export async function loadWaverleyLamps(drawn: (x: number, z: number) => number): Promise<StreetLights> {
  const [roads, scene, terrain] = await Promise.all([
    import('./data/waverley-lamp-roads.json', { with: { type: 'json' } }),
    import('./data/waverley-scene.json', { with: { type: 'json' } }),
    import('./data/waverley-terrain.json', { with: { type: 'json' } }),
  ]);
  const context = createTerrain(terrain.default as unknown as TerrainFile);
  const data = unpackWaverleyScene(scene.default);
  // no lamp stands in a building, under the station's roof or on a platform (the station's own lamps are the station element's)
  const footprints = footprintsOf([...data.buildings, ...data.roofs, ...data.platforms.map((p) => ({ outer: p.path, holes: [] }))]);
  return createStreetLights(waverleyLampSpots(roads.default as unknown as LampRoadsFile, drawn, (x, z) => context.heightAt(x, z), footprints));
}
