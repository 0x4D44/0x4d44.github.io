// The lamp-bearing roads of the Scottish scene, lean (round seven, night lighting). Run from kings-cross-src:
//   node tools/build-waverley-lamp-roads.ts
// reads web/src/data/waverley-roads.json (the W3 city element's: every OSM highway line of the scene, 100 kB, 23 kB gzipped) and writes web/src/data/waverley-lamp-roads.json, read by web/src/waverley-lamps.ts:
// only the classes the street lamps stand along (LAMP_CLASSES), only their lines (no ids, names or tags), each as whole half-metre steps from the last point (core/streetlights.ts `LampRoadsFile`). The scene's
// street lamps are loaded with the Scottish scene and count toward the app's payload, and the OSM lines were four times what the lamps need. OpenStreetMap, ODbL 1.0: the file keeps its source's attribution and licence.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ROAD_CLASS } from '../core/city.ts';
import type { RoadClass } from '../core/city.ts';
import type { Pt } from '../core/geo.ts';
import { encodeLampRoads } from '../core/streetlights.ts';
import type { LampRoad, LampRoadsFile } from '../core/streetlights.ts';

/**
 * The classes of road the Scottish scene's lamps stand along, in the order the file holds them. Service roads are left out (ASSUMED, a call on bytes: 394 of the 887 OSM lines, 14 km of closes, car parks and yards,
 * which the lamps' own rules would light one side in forty metres, and 3.8 kB of the payload); so are footways, paths and steps, which the lamp rules do not light either. The bridges' decks stay (North Bridge,
 * Waverley Bridge, South Bridge, George IV Bridge: night-f-waverley-north-bridge-elevated-2011-curtis.jpg shows North Bridge's row of lamps).
 */
export const LAMP_CLASSES: readonly RoadClass[] = ['primary', 'secondary', 'tertiary', 'minor', 'pedestrian'];
/** Metres to a step: the resolution of the source (0.5 m rounding). */
export const STEP = 0.5;

export interface RoadsSource {
  attribution: string;
  licence: string;
  frame: string;
  extent: LampRoadsFile['extent'];
  roads: { id: string; highway: string; bridge?: boolean; path: Pt[] }[];
}

export function leanRoads(source: RoadsSource): LampRoadsFile {
  const roads: LampRoad[] = [];
  for (const way of source.roads) {
    const cls = ROAD_CLASS[way.highway];
    if (!cls || !LAMP_CLASSES.includes(cls) || way.path.length < 2) continue;
    roads.push({ cls, bridge: way.bridge === true, line: way.path });
  }
  const packed = encodeLampRoads(roads, STEP);
  // the classes in a fixed order, so the file does not change with the order the source met them in
  const inOrder = (group: LampRoadsFile['ways']): LampRoadsFile['ways'] => Object.fromEntries(LAMP_CLASSES.filter((cls) => group[cls]).map((cls) => [cls, group[cls]]));
  return {
    attribution: source.attribution,
    licence: source.licence,
    source: 'web/src/data/waverley-roads.json (tools/build-waverley-city-landuse.ts: the OSM map API snapshot of tools/build-waverley.ts): the primary, secondary, tertiary, unclassified, residential and pedestrian '
      + 'ways and the decks of bridges among them, by tools/build-waverley-lamp-roads.ts; service roads, footways and steps left out',
    frame: source.frame,
    extent: source.extent,
    unit: STEP,
    ways: inOrder(packed.ways),
    bridges: inOrder(packed.bridges),
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const source = JSON.parse(readFileSync('web/src/data/waverley-roads.json', 'utf8')) as RoadsSource;
  const lean = leanRoads(source);
  const text = `${JSON.stringify(lean)}\n`;
  writeFileSync('web/src/data/waverley-lamp-roads.json', text);
  const count = (group: LampRoadsFile['ways']): number => Object.values(group).reduce((n, lines) => n + (lines?.length ?? 0), 0);
  console.log(`Wrote ${count(lean.ways)} ways and ${count(lean.bridges)} bridge decks of ${source.roads.length} OSM lines, ${text.length} bytes`);
}
