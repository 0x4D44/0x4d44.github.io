// The Western Concourse: a glazed steel diagrid roof on a single funnel column, 20 m at the column
// falling to 5 m at the rim (published heights, core/station.ts), clipped to the OSM station
// footprint and kept clear of the train shed and the Western Range.
//
// What is drawn: a triangulated lattice of white tubular steel (every triangle edge is a member,
// 0.3 m square: ASSUMED), a glass or panel infill in every triangle (glass inside 55 % of the radius,
// pale solid panels outside it: ASSUMED, the brief wants glazing "near the apex"), a trumpet-shaped
// column that flares into the roof, a floor, and a glazed wall round the rim. The roof surface is
// the same shallow parabola as before (concourseHeight in core/station.ts); the lattice nodes sit on
// it in rings about 4.3 m apart, with more nodes on the outer rings so the triangles stay about the
// same size (about 4.5 m edges: ASSUMED; the real roof's diagrid is much finer detail).
import * as THREE from 'three';
import { concourseHeight, pointInPolygon, worldToShed } from '../../core/station.ts';
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
  nodes: { x: number; z: number; r: number; ring: number }[];
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
export function diagrid(radius: number, centre: Pt): Diagrid {
  const rings = Math.max(2, Math.round((radius - FUNNEL_RADIUS) / EDGE));
  const dr = (radius - FUNNEL_RADIUS) / rings;
  const counts: number[] = [];
  const nodes: Diagrid['nodes'] = [];
  const first: number[] = [];
  for (let k = 0; k <= rings; k++) {
    const r = FUNNEL_RADIUS + k * dr;
    const n = Math.max(12, 6 * Math.round((2 * Math.PI * r) / (6 * EDGE)));
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

/** The lathe profile of the trumpet column: [radius, height] pairs from the floor to the funnel rim. */
export function columnProfile(apex: number): [number, number][] {
  const top = apex - 0.1;
  return [[2.2, 0], [1.5, 0.35], [1.3, 1.2], [1.25, 7], [1.5, 9.5], [2.2, 12.5], [3.4, 15.8], [4.6, top - 1.6], [FUNNEL_RADIUS, top]];
}

export function buildConcourse(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout): THREE.Group {
  const [cx, cz] = canopy.centre;
  const d = diagrid(canopy.radius, canopy.centre);
  const kept = keepTriangles(d, footprint, shed);
  const height = (n: Diagrid['nodes'][number]): number => concourseHeight(canopy, n.r);
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
