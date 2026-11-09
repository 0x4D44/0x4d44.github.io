// The Western Concourse: a semicircular-ish diagrid against the Western Range, following OSM's
// full roof boundary. Arup Journal 2/2012 pp.12–16 describes a cut shell; fig.6 measures its
// overall north–south extent as 138 m. Twice the fitted arc radius is a different measurement.
// https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=15
//
// What is drawn: a triangulated lattice of white tubular steel (every triangle edge is a member,
// 0.3 m square: ASSUMED), a glass or panel infill in every triangle (glass inside 55 % of the radius,
// pale solid panels outside it: ASSUMED, the brief wants glazing "near the apex"), a trumpet-shaped
// column that flares into the roof, a floor, and a glazed wall round the rim. The roof surface is
// an inferred smooth surface with the existing 20 m/5 m height bounds (concourseHeight in
// core/station.ts). Arup's three-tangent-circle S section has no dimensioned construction here;
// this surface is an approximation, not a reconstruction of its engineering geometry.
import * as THREE from 'three';
import { concourseHeight, pointInPolygon, shedToWorld, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';
import { Batch, material } from './materials.ts';
import type { V3 } from './materials.ts';
import { WESTERN_RANGE } from './shed.ts';

/** Radius of the funnel's top, where the lattice starts, metres (ASSUMED; the real funnel is similar in scale). */
export const FUNNEL_RADIUS = 5.4;
/** Target ring spacing and edge length, metres (ASSUMED). */
export const EDGE = 4.5;
/** Fraction of the radius inside which the infill is glass (ASSUMED). */
export const GLASS_FRACTION = 0.55;
const TUBE = 0.3; // member cross-section, metres: ASSUMED

export interface Diagrid {
  /** node positions in world x, z (metres) with the radius from the column */
  nodes: { x: number; z: number; r: number; ring: number; height?: number }[];
  /** triangles as node indices */
  tris: [number, number, number][];
  rings: number;
}

/**
 * The lattice before clipping: rings of nodes from the funnel (r = FUNNEL_RADIUS) out to the rim
 * (r = canopy.radius), the number of nodes per ring growing with the circumference in steps of six so
 * triangles stay about EDGE metres across, and adjacent rings stitched by a two-pointer sweep so every
 * annulus is closed with no gaps. Odd rings are turned half a step so the lattice staggers.
 */
export function diagrid(radius: number, centre: Pt, spacing = EDGE): Diagrid {
  const rings = Math.max(2, Math.round((radius - FUNNEL_RADIUS) / spacing));
  const dr = (radius - FUNNEL_RADIUS) / rings;
  const counts: number[] = [];
  const nodes: Diagrid['nodes'] = [];
  const first: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const r = FUNNEL_RADIUS + k * dr;
    const n = Math.max(12, 6 * Math.round((2 * Math.PI * r) / (6 * spacing)));
    counts.push(n);
    first.push(nodes.length);
    const turn = (k % 2) * (Math.PI / n);
    for (let i = 0; i < n; i++) {
      const a = turn + (2 * Math.PI * i) / n;
      nodes.push({ x: centre[0] + r * Math.cos(a), z: centre[1] + r * Math.sin(a), r, ring: k });
    }
  }
  const tris: [number, number, number][] = [];
  for (let k = 0; k < rings; k++) {
    const n = counts[k] as number;
    const m = counts[k + 1] as number;
    const turnA = (k % 2) * (Math.PI / n);
    const turnB = ((k + 1) % 2) * (Math.PI / m);
    // Both rings as monotone unwrapped angle sequences, the outer one starting at the node nearest
    // the inner ring's first node. Each step takes the next node (inner or outer) with the smaller angle.
    const j0 = Math.round(((turnA - turnB) * m) / (2 * Math.PI));
    const startB = turnB + (2 * Math.PI * j0) / m;
    const angA = (i: number): number => turnA + (2 * Math.PI * i) / n;
    const angB = (j: number): number => startB + (2 * Math.PI * j) / m;
    const outerNode = (j: number): number => (first[k + 1] as number) + ((((j0 + j) % m) + m) % m);
    let i = 0;
    let j = 0;
    for (let s = 0; s < n + m; s++) {
      const a = (first[k] as number) + (i % n);
      const b = outerNode(j);
      if (angA(i + 1) <= angB(j + 1)) {
        tris.push([a, b, (first[k] as number) + ((i + 1) % n)]);
        i++;
      } else {
        tris.push([a, b, outerNode(j + 1)]);
        j++;
      }
    }
  }
  return { nodes, tris, rings };
}

/** Undirected edges of a set of triangles, each once, as [lo, hi] node pairs, with how many triangles share each. */
export function edgesOf(tris: [number, number, number][]): Map<string, { a: number; b: number; uses: number }> {
  const out = new Map<string, { a: number; b: number; uses: number }>();
  for (const t of tris) {
    for (let e = 0; e < 3; e++) {
      const p = t[e] as number;
      const q = t[(e + 1) % 3] as number;
      const a = Math.min(p, q);
      const b = Math.max(p, q);
      const key = `${a}:${b}`;
      const found = out.get(key);
      if (found) found.uses++;
      else out.set(key, { a, b, uses: 1 });
    }
  }
  return out;
}

/** Which triangles of the lattice are built: inside the OSM footprint, outside the shed, outside the Western Range. */
export function keepTriangles(d: Diagrid, footprint: Pt[], shed: Pick<ShedLayout, 'origin' | 'heading' | 'width' | 'length'>): [number, number, number][] {
  const { depth, v0, v1 } = WESTERN_RANGE;
  return d.tris.filter((t) => {
    const p = t.map((i) => d.nodes[i] as Diagrid['nodes'][number]);
    const c: Pt = [(p[0]!.x + p[1]!.x + p[2]!.x) / 3, (p[0]!.z + p[1]!.z + p[2]!.z) / 3];
    const { u, v } = worldToShed(shed, c);
    const inShed = u > -1 && u < shed.width + 1 && v > -1 && v < shed.length + 1;
    const inRange = u > -depth - 0.3 && v > v0 - 1 && v < v1 + 1;
    return !inShed && !inRange && pointInPolygon(c, footprint);
  });
}

/**
 * Use the OSM roof boundary, rather than cutting it short at the fitted circle. The station
 * polygon includes the suburban roof to the north; the reviewed Western Range end separates it
 * from this concourse. OSM vertices are rounded to 0.1 m, hence the 0.1 m endpoint allowance.
 *
 * JMP locates the funnel beside, but not touching, the historic façade:
 * https://mcaslan.agencyprojects.com/Kings-Cross-Station
 * Its exact surveyed position is unavailable. ASSUMPTION: centre it along the OSM roof extent
 * and leave 0.3 m between the existing full-round funnel top and the assumed Range façade.
 */
export function concourseGrid(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout): { centre: Pt; grid: Diagrid } {
  const local = footprint.map(p => worldToShed(shed, p));
  const arc = local.filter(p => p.u < -45 && p.v <= WESTERN_RANGE.v1 + .1);
  if (arc.length < 3) throw new Error('the OSM concourse boundary is needed to build its roof');
  const north = Math.max(...arc.map(p => p.v));
  const westWall = -WESTERN_RANGE.depth - .3;
  const south = Math.min(...local.filter(p => p.u < westWall && p.v <= north).map(p => p.v));
  const centreUV = { u: westWall - FUNNEL_RADIUS, v: (south + north) / 2 };
  const centre = shedToWorld(shed, centreUV.u, centreUV.v);
  // More boundary samples retain the small OSM steps/canopies instead of cutting their corners.
  const grid = diagrid(canopy.radius, centre, EDGE * .6);
  const cross = (ax: number, az: number, bx: number, bz: number): number => ax * bz - az * bx;
  for (const n of grid.nodes) {
    const dx = (n.x - centre[0]) / n.r, dz = (n.z - centre[1]) / n.r;
    const dv = dx * Math.sin(shed.heading) - dz * Math.cos(shed.heading);
    let rim = dv > 0 ? (north - centreUV.v) / dv : Infinity;
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
      const ex = b[0] - a[0], ez = b[1] - a[1], det = cross(dx, dz, ex, ez);
      if (Math.abs(det) < 1e-10) continue;
      const ax = a[0] - centre[0], az = a[1] - centre[1];
      const distance = cross(ax, az, ex, ez) / det, t = cross(ax, az, dx, dz) / det;
      if (distance > 0 && t >= 0 && t <= 1) rim = Math.min(rim, distance);
    }
    // The same topology now runs to the actual boundary in each direction.
    n.r = FUNNEL_RADIUS + (Math.max(FUNNEL_RADIUS, rim) - FUNNEL_RADIUS) * (n.r - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS);
    n.x = centre[0] + dx * n.r;
    n.z = centre[1] + dz * n.r;
  }
  // The façade is a CUT through the shell, not a low outer rim. Clip interpolated roof faces to
  // it after building the surface; squeezing every east-facing ring onto the wall makes folds.
  const triangles: Diagrid['tris'] = [];
  const uAt = (i: number): number => worldToShed(shed, [grid.nodes[i]!.x, grid.nodes[i]!.z]).u;
  const cutNodes = new Map<string, number>();
  for (const tri of grid.tris) {
    const polygon: number[] = [];
    for (let i = 0; i < 3; i++) {
      const a = tri[i]!, b = tri[(i + 1) % 3]!, au = uAt(a), bu = uAt(b);
      if (au <= westWall) polygon.push(a);
      if ((au <= westWall) === (bu <= westWall)) continue;
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      let cut = cutNodes.get(key);
      if (cut === undefined) {
        const t = (westWall - au) / (bu - au), na = grid.nodes[a]!, nb = grid.nodes[b]!;
        const x = na.x + t * (nb.x - na.x), z = na.z + t * (nb.z - na.z);
        cut = grid.nodes.length;
        grid.nodes.push({ x, z, r: Math.hypot(x - centre[0], z - centre[1]), ring: -1 });
        cutNodes.set(key, cut);
      }
      polygon.push(cut);
    }
    for (let i = 1; i + 1 < polygon.length; i++) triangles.push([polygon[0]!, polygon[i]!, polygon[i + 1]!]);
  }
  grid.tris = triangles.filter(t => {
    const a = grid.nodes[t[0]]!, b = grid.nodes[t[1]]!, c = grid.nodes[t[2]]!;
    return Math.abs(cross(b.x - a.x, b.z - a.z, c.x - a.x, c.z - a.z)) > 1e-8;
  });
  for (const n of grid.nodes) {
    // Distance to the OUTER boundary gives a smooth fall to the rim despite the small OSM
    // outline steps. Treating the façade cut as a rim would pinch the high shell down to 5 m.
    let toRim = Math.max(0, north - worldToShed(shed, [n.x, n.z]).v);
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
      const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
      const t = length2 ? Math.max(0, Math.min(1, ((n.x - a[0]) * dx + (n.z - a[1]) * dz) / length2)) : 0;
      toRim = Math.min(toRim, Math.hypot(n.x - a[0] - t * dx, n.z - a[1] - t * dz));
    }
    n.height = concourseHeight(canopy, canopy.radius * n.r / (n.r + toRim));
  }
  return { centre, grid };
}

/** The lathe profile of the trumpet column: [radius, height] pairs from the floor to the funnel rim. */
export function columnProfile(apex: number): [number, number][] {
  const top = apex - 0.1;
  return [[2.2, 0], [1.5, 0.35], [1.3, 1.2], [1.25, 7], [1.5, 9.5], [2.2, 12.5], [3.4, 15.8], [4.6, top - 1.6], [FUNNEL_RADIUS, top]];
}

export function buildConcourse(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout): THREE.Group {
  const { centre, grid: d } = concourseGrid(canopy, footprint, shed);
  const [cx, cz] = centre;
  const kept = keepTriangles(d, footprint, shed);
  const height = (n: Diagrid['nodes'][number]): number => n.height ?? concourseHeight(canopy, n.r);
  const at = (i: number): V3 => {
    const n = d.nodes[i] as Diagrid['nodes'][number];
    return [n.x, height(n), n.z];
  };

  const members = new Batch();
  const glass = new Batch();
  const panels = new Batch();
  const floor = new Batch();
  const wall = new Batch();
  const mullions = new Batch();
  const edges = edgesOf(kept);
  for (const { a, b } of edges.values()) {
    const p = at(a);
    const q = at(b);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const dz = q[2] - p[2];
    const len = Math.hypot(dx, dy, dz);
    members.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [len + 0.1, TUBE, TUBE], { rotZ: Math.asin(dy / len), rotY: Math.atan2(-dz, dx), skip: ['+x', '-x'] });
  }
  for (const t of kept) {
    let [a, b, c] = [at(t[0]), at(t[1]), at(t[2])];
    // wind each panel so it faces up (out of the roof)
    const nY = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
    if (nY < 0) [b, c] = [c, b];
    const rMid = ((d.nodes[t[0]] as Diagrid['nodes'][number]).r + (d.nodes[t[1]] as Diagrid['nodes'][number]).r + (d.nodes[t[2]] as Diagrid['nodes'][number]).r) / 3;
    (rMid < GLASS_FRACTION * canopy.radius ? glass : panels).poly([a, b, c], [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
    // the floor under it, facing up like the roof
    const f = (p: V3): V3 => [p[0], 0.02, p[2]];
    floor.poly([f(a), f(b), f(c)], [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]);
  }
  // a glazed wall round the rim: every edge used by one kept triangle on the ring at the rim, from the floor to the roof edge
  const post = new Set<number>();
  for (const e of edges.values()) {
    if (e.uses !== 1) continue;
    const na = d.nodes[e.a] as Diagrid['nodes'][number];
    const nb = d.nodes[e.b] as Diagrid['nodes'][number];
    if (na.ring !== d.rings || nb.ring !== d.rings) continue;
    const p = at(e.a);
    const q = at(e.b);
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
    // the quad faces the right of its direction of travel (see wallQuad): travel the way that points it away from the column
    const nx = -(q[2] - p[2]);
    const nz = q[0] - p[0];
    const out = nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[2] + q[2]) / 2 - cz) > 0;
    const [s, t] = out ? [p, q] : [q, p];
    wall.quad([s[0], 0, s[2]], [t[0], 0, t[2]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], [0, 0], [len, 0], [len, t[1]], [0, s[1]]);
    for (const i of [e.a, e.b]) {
      if (post.has(i)) continue;
      post.add(i);
      const n = at(i);
      mullions.box([n[0], n[1] / 2, n[2]], [0.18, n[1], 0.18]);
    }
  }

  const group = new THREE.Group();
  group.name = 'western-concourse';
  const add = (b: Batch, m: THREE.Material, name: string, order = 0): void => {
    if (b.count === 0) return;
    const mesh = new THREE.Mesh(b.build(), m);
    mesh.name = name;
    mesh.renderOrder = order;
    group.add(mesh);
  };
  add(members, material('whiteSteel'), 'concourse-lattice');
  add(glass, material('glass'), 'concourse-glass', 3);
  add(panels, material('panel'), 'concourse-panels', 3);
  add(wall, material('glass'), 'concourse-wall', 3);
  add(mullions, material('whiteSteel'), 'concourse-mullions');
  add(floor, material('concourseFloor'), 'concourse-floor');
  // the trumpet column
  const lathe = new THREE.LatheGeometry(columnProfile(canopy.apex).map(([r, y]) => new THREE.Vector2(r, y)), 40);
  const column = new THREE.Mesh(lathe, material('whiteSteel'));
  column.name = 'concourse-column';
  column.position.set(cx, 0, cz);
  group.add(column);
  return group;
}
