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
import { decodeLampRoads, lampSpots, LAMP_KIND } from '../../core/streetlights.ts';
import type { LampRoad, LampRoadsFile, LampRun, LampSpot } from '../../core/streetlights.ts';
import { createTerrain } from '../../core/terrain.ts';
import type { TerrainFile } from '../../core/terrain.ts';
import { unpackWaverleyScene } from '../../core/waverley-data.ts';
import type { WaverleyScene } from '../../core/waverley-data.ts';
import type * as THREE from 'three';
import { createLampWetSurface, lampSurfaceAt } from './lamp-wet-surface.ts';
import type { LampWetSurface } from './lamp-wet-surface.ts';
import { urbanLampOptions } from './station-lamps.ts';
import { registerLights } from '../../core/light-sources.ts';
import { roadLight } from './light-source-adapters.ts';
import { createStreetLights, headOf } from './streetlights.ts';
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

/** What no lamp stands in, under or on: the scene's buildings, the roofs over the station and the platforms (the station's own lamps are the station element's). */
export function sceneFootprints(data: Pick<WaverleyScene, 'buildings' | 'roofs' | 'platforms'>): Footprint[] {
  return footprintsOf([...data.buildings, ...data.roofs, ...data.platforms.map((p) => ({ outer: p.path, holes: [] }))]);
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

/** Night-only fittings on the drawn North Bridge kerbs and the station's
 * Market Street approach. OSM plan; pitch/height are assumed from R-nw-f. */
async function approachSpots(root:THREE.Object3D,surface:LampWetSurface,existing:readonly LampSpot[]):Promise<LampSpot[]> {
  const out:LampSpot[]=[];
  const add=(x:number,z:number,yaw:number)=>{
    const nearby=existing.find(s=>Math.hypot(s.x-x,s.z-z)<7);
    if(nearby){
      // A promoted kerb fitting must use sodium in both overlapping batches;
      // leaving its original warm-white core underneath washed the row white.
      nearby.kind=LAMP_KIND.sodium;
      if(!out.includes(nearby))out.push(nearby);return;
    }
    const [y,mask]=lampSurfaceAt(surface,x,z);if(mask<.9)return;
    const dx=lampSurfaceAt(surface,x+1,z)[0]-lampSurfaceAt(surface,x-1,z)[0];
    const dz=lampSurfaceAt(surface,x,z+1)[0]-lampSurfaceAt(surface,x,z-1)[0];
    out.push({x,z,y:y+.025,yaw,height:8,kind:LAMP_KIND.sodium,slope:[dx/2,dz/2]});
  };
  const frame=root.getObjectByName('waverley-frontage')?.userData.frontage?.northBridge.frame as {length:number;at:(s:number,t:number)=>Pt}|undefined;
  if(!frame)return out;
  for(let s=18;s<frame.length-12;s+=30)for(const side of [.07,.93]){
    const p=frame.at(s,side),q=frame.at(s,.5);add(...p,Math.atan2(-(q[1]-p[1]),q[0]-p[0]));
  }
  const roads=await import('./data/waverley-roads.json',{with:{type:'json'}});
  for(const road of roads.default.roads){
    // The west run is the part visible from the frozen North Bridge view.
    // Previously only the east approach was added, behind/off that camera.
    if(road.name!=='Market Street')continue;
    const line=road.path.map(p=>[p[0]!,p[1]!] as Pt);
    const run: LampRun={id:0,cls:'tertiary',line,half:4.25,y:(x,z)=>lampSurfaceAt(surface,x,z)[0],rule:{height:8,spacing:28,sides:'alternate'}};
    for(const spot of lampSpots([run],{rand:hash01,modern:()=>false,blocked:()=>false}))add(spot.x,spot.z,spot.yaw);
  }
  return out;
}

/**
 * Load the Scottish street lamps: the roads, the building outlines (the scene's own OSM data, already loaded by the model) and the context DTM, each a lazy chunk, and the lamps they make. `drawn` is
 * the ground as the scene draws it. Resolves to the lamps' layer (a post to each, a glow at its head and a pool under it: web/src/streetlights.ts), not yet in any scene.
 */
export async function loadWaverleyLamps(drawn: (x: number, z: number) => number, nightEffects = false, surfaceRoot?:THREE.Object3D): Promise<StreetLights> {
  const [roads, scene, terrain] = await Promise.all([
    import('./data/waverley-lamp-roads.json', { with: { type: 'json' } }),
    import('./data/waverley-scene.json', { with: { type: 'json' } }),
    import('./data/waverley-terrain.json', { with: { type: 'json' } }),
  ]);
  const context = createTerrain(terrain.default as unknown as TerrainFile);
  const data = unpackWaverleyScene(scene.default);
  const file=roads.default as unknown as LampRoadsFile;
  const spots=waverleyLampSpots(file, drawn, (x, z) => context.heightAt(x, z), sceneFootprints(data));
  const roadMask=new SegmentGrid();
  // Include the wet footways beside the carriageway. Clipping them out left
  // only a horizontal road-edge sliver of each Princes Street reflection.
  for(const road of decodeLampRoads(file)) for(let i=1;i<road.line.length;i++){
    const a=road.line[i-1]!,b=road.line[i]!;
    // ASSUMED: the broad Princes Street paving/junction north of the hotel
    // extends beyond the lean road centreline's default carriageway width.
    const princes=a[0]>-30&&a[0]<125&&a[1]<-110&&b[1]<-110;
    roadMask.add({a,b,reach:WAVERLEY_ROAD_WIDTH[road.cls]/2+(princes?18:6)});
  }
  const surface=nightEffects&&surfaceRoot?createLampWetSurface(surfaceRoot,new Set(['waverley-ground','waverley-ground-cover','waverley-bridge-decks']),spots,
    (name,x,z)=>name==='waverley-bridge-decks'||roadMask.nearest([x,z],2)<0,true):undefined;
  // Retain all distant head cores/posts; spend the ground geometry on nearby
  // conforming pools/strips rather than almost invisible panorama road pools.
  const rowSpots=surface&&surfaceRoot?await approachSpots(surfaceRoot,surface,spots):[];
  const approachSet=new Set(rowSpots);
  const princesStreet = (s: LampSpot) => s.x>20&&s.x<80&&s.z>-180&&s.z<-140;
  const layer=createStreetLights(spots,nightEffects?{...urbanLampOptions(surface),roughReflections:true,lightFog:true,softFog:true,waverleyStreetFog:true,lowPressureSodium:s=>approachSet.has(s),sourceCoreAt:s=>!approachSet.has(s),fogHaloSpread:18,
    // Princes Street's narrow footway lies almost at eye level in the frozen
    // Balmoral view. A 16 m pool covered the whole road as one horizontal band.
    // Keep a local soft pool under each head, independently of its wet streak.
    poolRadiusAt:s=>princesStreet(s)?3.2:8,poolAt:s=>Math.hypot(s.x,s.z)<250,reflectionAt:s=>Math.hypot(s.x,s.z)<200}:{});
  // The western Market Street receivers project 119–132 m from their heads
  // in the North Bridge camera. Keep these urban runs finite and road-clipped,
  // without discarding their visible wet paving at the generic 96 m limit.
  // The uphill road correction belongs west of Waverley Bridge (x=-60).
  // Applying its 140m road-axis run at the near junction sent a diagonal
  // reflection to the frozen view's left edge, away from its visible head.
  // The junction keeps the ordinary eye/source mirror optics instead.
  const rows=rowSpots.length?createStreetLights(rowSpots,{...urbanLampOptions(surface),roughReflections:true,lightFog:true,softFog:true,waverleyStreetFog:true,reflectionRoad:s=>s.x<-60&&s.z>100&&(s.x>-210||Math.sin(s.yaw)>0),reflectionReach:160,reflectionTail:s=>s.x<0&&s.z>100?64:0,lowPressureSodium:true,fogHaloSpread:20,postAt:s=>!spots.includes(s),coreSize:3.2,haloSize:5.5,poolCeiling:.32}):undefined;
  if(rows){rows.group.name='waverley-approach-lamps';rows.group.visible=false;layer.group.add(rows.group);}
  const streetSet = new Set(spots);
  const sources = spots.map((spot, i) => {
    const promoted = approachSet.has(spot), princes = princesStreet(spot);
    const tags = ['road'];
    if (promoted) tags.push('approach', 'promoted-approach');
    if (princes) tags.push('princes-street');
    return roadLight('wv', `wv/street/${i}`, spot, headOf(spot),
      { tags, spectrum: promoted ? 'lps' : undefined, throwM: princes ? 3.2 : undefined, spreadM: princes ? 3.2 : undefined });
  });
  rowSpots.forEach((spot, i) => {
    if (!streetSet.has(spot)) sources.push(roadLight('wv', `wv/approach/${i}`, spot, headOf(spot), { spectrum: 'lps', tags: ['road', 'approach'] }));
  });
  const unregister = surfaceRoot && registerLights(surfaceRoot, sources);
  return {...layer,
    setLevel(level){layer.setLevel(level);if(rows){rows.setLevel(level);rows.group.visible=level>.01;}},
    counts(){const a=layer.counts(),b=rows?.counts();return b?{lamps:a.lamps+b.lamps,triangles:a.triangles+b.triangles,draws:a.draws+b.draws}:a;},
    dispose(){unregister?.();rows?.group.removeFromParent();rows?.dispose();layer.dispose();surface?.dispose();}};
}
