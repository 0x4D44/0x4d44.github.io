// Perth uses the shared instanced street heads/pools and the station's existing
// fixture plan. Positions on OSM streets are inferred; colours, spacing and light
// falloff are the shared night-lighting rules, not a surveyed lighting inventory.
import * as THREE from 'three';
import { hash01, SegmentGrid } from '../../core/city.ts';
import type { RoadClass } from '../../core/city.ts';
import type { Pt } from '../../core/geo.ts';
import { pointInPolygon } from '../../core/station.ts';
import { LAMP_KIND, lampSpots } from '../../core/streetlights.ts';
import type { LampRun, LampSpot } from '../../core/streetlights.ts';
import { Batch } from './materials.ts';
import { createStreetLights } from './streetlights.ts';
import type { StreetLights } from './streetlights.ts';
import { Footprints } from './waverley-city-ground.ts';
import { WAVERLEY_LEVELS } from './waverley-mesh.ts';
import { WAVERLEY_STRUCTURE } from './waverley-station-structure.ts';
import { PERTH_LAMP, PERTH_STATION, toWorld } from './perth-station-structure.ts';
import type { PerthStationPlan } from './perth-station-structure.ts';
import { forecourtLampPosts, FRONTAGE_WINDOW, ROAD_WIDTHS } from './perth-frontage-street.ts';
import type { FrontageFile } from './perth-frontage-street.ts';
import { cutRoadMask } from './perth-frontage-bridge.ts';

export interface LampRoad { width: number; line: readonly Pt[] }
type Ground = (x: number, z: number) => number;
const fixture = (p: Pt, y: number, height: number): LampSpot => ({ x: p[0], y, z: p[1], height, yaw: 0, kind: LAMP_KIND.warm, slope: [0,0] });

/** Sample the surfaces actually drawn over the DTM, including raised cover and
 * bridge decks. A 32 m triangle index is built once; no raycast runs per frame. */
export function perthLampGround(root: THREE.Object3D, fallback: Ground): Ground {
  const names = new Set(['waverley-ground-cover','perth-west-ground-cover','perth-forecourt','perth-forecourt-setts','perth-bridge-roads']);
  const cells = new Map<string, number[][]>(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse(object => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !names.has(mesh.name)) return;
    const p = mesh.geometry.getAttribute('position'), index = mesh.geometry.index;
    for (let i = 0; i < (index?.count ?? p.count); i += 3) {
      a.fromBufferAttribute(p,index?.getX(i) ?? i).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(p,index?.getX(i+1) ?? i+1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(p,index?.getX(i+2) ?? i+2).applyMatrix4(mesh.matrixWorld);
      const det = (b.z-c.z)*(a.x-c.x)+(c.x-b.x)*(a.z-c.z);
      if (Math.abs(det) < 1e-8) continue;
      const t = [a.x,a.y,a.z,b.x,b.y,b.z,c.x,c.y,c.z,det];
      for (let x = Math.floor(Math.min(a.x,b.x,c.x)/32); x <= Math.floor(Math.max(a.x,b.x,c.x)/32); x++) {
        for (let z = Math.floor(Math.min(a.z,b.z,c.z)/32); z <= Math.floor(Math.max(a.z,b.z,c.z)/32); z++) {
          const key = `${x},${z}`, bucket = cells.get(key);
          if (bucket) bucket.push(t); else cells.set(key,[t]);
        }
      }
    }
  });
  return (x,z) => {
    let y = fallback(x,z);
    for (const t of cells.get(`${Math.floor(x/32)},${Math.floor(z/32)}`) ?? []) {
      const u = ((t[5]-t[8])*(x-t[6])+(t[6]-t[3])*(z-t[8]))/t[9];
      const v = ((t[8]-t[2])*(x-t[6])+(t[0]-t[6])*(z-t[8]))/t[9];
      if (u >= -1e-6 && v >= -1e-6 && u+v <= 1+1e-6) y = Math.max(y,u*t[1]+v*t[4]+(1-u-v)*t[7]);
    }
    return y;
  };
}

/** Existing pendants, Dundee canopy fittings and pole-top lantern lenses. */
export function perthStationLampSpots(plan: PerthStationPlan): LampSpot[] {
  const deck = WAVERLEY_LEVELS.platform;
  const spots = plan.structure.lamps.map(l => fixture(toWorld([l.x,l.z]), deck, WAVERLEY_STRUCTURE.lampRim - .02));
  for (const p of plan.canopyColumns) spots.push(fixture(toWorld(p), deck, PERTH_STATION.canopy.top - .8 - deck));
  for (const { at, arm, double } of plan.furniture.lamps) {
    const L = PERTH_LAMP, H = L.lantern;
    for (const [sign, drop] of double ? [[1,0],[-1,-H.drop]] : [[1,0]]) {
      const reach = L.radius + H.reach + Math.cos(H.tilt) * .6 * H.length + Math.sin(H.tilt) * (H.depth / 2 + .005);
      const p = toWorld([at[0] + arm[0] * sign * reach, at[1] + arm[1] * sign * reach]);
      const height = L.height - .08 + drop + Math.sin(H.tilt) * .6 * H.length - Math.cos(H.tilt) * (H.depth / 2 + .005);
      spots.push(fixture(p, deck, height));
    }
  }
  return spots;
}

/** Shared core placement on the same carriageway widths the Perth cover paints. */
export function perthTownLampSpots(roads: readonly LampRoad[], ground: Ground, footprints: readonly (readonly Pt[])[],
  keep: (p: Pt) => boolean = () => true): LampSpot[] {
  const cls = (w: number): RoadClass => w >= 11 ? 'primary' : w >= 10 ? 'secondary' : w >= 8.5 ? 'tertiary' : w >= 6 ? 'minor' : w >= 5 ? 'pedestrian' : 'service';
  const runs: LampRun[] = roads.map((r, id) => ({ id, cls: cls(r.width), half: r.width / 2, line: r.line, y: (x,z) => ground(x,z) }));
  const walls = new Footprints(footprints), carriageways = new SegmentGrid();
  for (const r of roads) for (let i = 1; i < r.line.length; i++) carriageways.add({ a: r.line[i-1]!, b: r.line[i]!, reach: r.width / 2 });
  return lampSpots(runs, { rand: hash01, modern: () => false,
    blocked: p => !keep(p) || walls.clearance(p[0],p[1],1) < .3 || carriageways.nearest(p,6) < .3 });
}

/** The existing forecourt lanterns, sharing their position rule with the builder. */
export function perthForecourtLampSpots(file: FrontageFile, ground: Ground, footprints: readonly (readonly Pt[])[]): LampSpot[] {
  const W = FRONTAGE_WINDOW, cut = cutRoadMask(), spots: LampSpot[] = [];
  for (const r of file.roads.filter(r => r.service === 'parking_aisle')) {
    for (const { at, dir } of forecourtLampPosts(r.path as Pt[], (ROAD_WIDTHS.parking_aisle ?? 6) / 2)) {
      if (at[0] < W.x0 || at[0] > W.x1 || at[1] < W.z0 || at[1] > W.z1 || cut(at) || footprints.some(ring => pointInPolygon(at, ring as Pt[]))) continue;
      for (const sign of [-1,1]) spots.push(fixture([at[0] + sign * dir[0] * 1.1, at[1] + sign * dir[1] * 1.1], ground(...at), 6.12));
    }
  }
  return spots;
}

/** Five instanced/points draws, plus one merged draw for the Dundee fittings. */
export function createPerthLights(plan: PerthStationPlan, town: readonly LampSpot[], forecourt: readonly LampSpot[]): StreetLights {
  const group = new THREE.Group(); group.name = 'perth-night-lamps';
  const street = createStreetLights(town, { fog: true });
  const existing = createStreetLights([...perthStationLampSpots(plan), ...forecourt], {
    posts: false, headAt: s => [s.x,s.y+s.height,s.z], fog: true,
  });
  existing.group.name = 'perth-station-lamps';
  group.add(street.group, existing.group);
  // The Dundee canopy has columns and soffits but no pendant geometry. Mount
  // slim warm-white fittings below it; every other lamp uses its existing body.
  const fittings = new Batch();
  for (const p of plan.canopyColumns) {
    const [x,z] = toWorld(p), y = PERTH_STATION.canopy.top - .8;
    fittings.box([x,y+.03,z], [1.2,.08,.22]);
  }
  const geometry = fittings.build(), material = new THREE.MeshLambertMaterial({ color: 0xe8e5da });
  const mesh = new THREE.Mesh(geometry,material); mesh.name = 'perth-canopy-light-fittings';
  if (plan.canopyColumns.length) group.add(mesh);
  return { group,
    setLevel(level) { street.setLevel(level); existing.setLevel(level); },
    counts() {
      const a = street.counts(), b = existing.counts();
      return { lamps: a.lamps + b.lamps, triangles: a.triangles + b.triangles + fittings.triangles, draws: a.draws + b.draws + Number(plan.canopyColumns.length > 0) };
    },
    dispose() { street.dispose(); existing.dispose(); geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
}
