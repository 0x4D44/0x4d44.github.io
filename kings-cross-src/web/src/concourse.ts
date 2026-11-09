// The Western Concourse: a semicircular-ish diagrid against the Western Range, following OSM's
// full roof boundary. Arup Journal 2/2012 pp.12–16 describes a cut shell; fig.6 measures its
// overall north–south extent as 138 m. Twice the fitted arc radius is a different measurement.
// https://www.arup.com/globalassets/downloads/arup-journal/the-arup-journal-2012-issue-2.pdf#page=15
//
// What is drawn: a triangulated lattice with radial box ribs and circular diagrid tubes; between the
// members a SOLID white-soffitted, silver-clad skin, with glass only where the references and the
// published figures put it (see roofZones); a trumpet-shaped open funnel of round tubes whose top ring
// is the roof's first ring; a floor with its fit-out; and a glazed wall round the rim. The roof surface is
// an inferred smooth surface with the existing 20 m/5 m height bounds (concourseHeight in
// core/station.ts). Arup's three-tangent-circle S section has no dimensioned construction here;
// this surface is an approximation, not a reconstruction of its engineering geometry.
//
// REFERENCES (refs/western-concourse/ under the gfx-rubrics pack; SOURCES.md has URL, author, licence):
//   R-a  conc-a-funnel-2012.jpg, conc-ab-funnel-brick-2025.jpg  interior: white solid soffit with deep ribs,
//        glazing only round the funnel and in a perimeter band, round white funnel tubes, grey paving
//   R-b  conc-b-roof-meets-range-2025-08.jpg                    funnel legs against the Range, red ticket machines
//   R-c  conc-c-exterior-square-2016.jpg, conc-c2-dome-aerial-2016.jpg  exterior: silver faceted shallow dome,
//        a few diamond rooflights, a glazed perimeter band under a thin edge fascia
// PUBLISHED: only 15 % of the roof is glazed, 1,012 glazed triangular panels "at the perimeter and towards
// the funnel" (Building / Construction Index, refs/DIMENSIONS.md section 2); the rest is aluminium cladding over
// acoustic panels. Arup Journal 2/2012 pp.13-16: box ribs 150 mm wide, 250-450 mm deep; round diagonals 139-219 mm.
import * as THREE from 'three';
import { concourseHeight, pointInPolygon, shedToWorld, worldToShed } from '../../core/station.ts';
import type { ConcourseCanopy, ShedLayout } from '../../core/station.ts';
import type { Pt } from '../../core/geo.ts';
import { Batch, material, rgb, rng } from './materials.ts';
import type { Rgb, V2, V3 } from './materials.ts';
import { WESTERN_RANGE } from './shed.ts';

/** Radius of the funnel's top, where the lattice starts, metres (ASSUMED; the real funnel is similar in scale). */
export const FUNNEL_RADIUS = 5.4;
/** Target ring spacing and edge length, metres (ASSUMED). */
export const EDGE = 4.5;
/**
 * Nodes on the roof's first ring and on the funnel's top level, which share positions so the funnel tubes run on
 * into the roof (R-a: the diagrid sweeps down out of the funnel with its smallest cells there). A multiple of six.
 */
export const FUNNEL_NODES = 24;
const RIB_WIDTH = 0.15; // Arup pp.13–16: typical fabricated radial ribs are 150 mm wide.
const TUBE_SIDES = 8; // ASSUMED exterior approximation; no unsourced wall thickness/bore.
/**
 * The roof is a build-up above the node plane (the members' centre lines), metres. ASSUMED: R-a (conc-ab) shows the
 * cells recessed between deep ribs, so the soffit sheet sits 0.12 m above the centre lines (the box ribs, 0.25-0.45 m
 * deep, hang 0.13-0.35 m below it) and the outer skin (silver cladding, or glass) 0.45 m above them, which leaves a
 * 0.33 m cavity for the acoustic panels the published description puts under the cladding.
 */
export const SOFFIT_LIFT = 0.12;
export const SKIN_LIFT = 0.45;
/** Each cladding diamond bulges this far above its plane at the middle (ASSUMED from R-c2, where the diamonds show two tones each). */
export const FACET_RISE = 0.1;
/**
 * Glazed zones. Published: 15 % of the roof is glazed, "at the perimeter and towards the funnel". ASSUMED sizes
 * (R-a, R-c2 show the shapes, not the widths), tuned so the glazed share of the roof (measured 16 % of the roof area,
 * oculus included) lands near that 15 %: cells whose centre is within 11 m of the funnel axis (R-a/conc-ab: bright
 * glazing round the funnel top), and cells within 4.6 m of the roof outline (R-c2: the brim round the dome is a glassy
 * band; Arup puts the tree columns 52.1 m from the funnel, so the brim is the outer part of the roof).
 */
export const FUNNEL_GLAZING_RADIUS = 11;
export const RIM_GLAZING_WIDTH = 4.6;
/** Published glazed share of the roof (Building magazine) and the band the rubric accepts around it. */
export const GLAZED_SHARE = { published: 0.15, tolerance: 0.05 } as const;
/**
 * Diamond rooflights: R-c and R-c2 show a row of five or six rhombic rooflights across the dome's slope on the
 * south-west side, about two thirds of the way out. ASSUMED placement: an arc 34 m from the funnel axis (R-c2: roughly
 * 55 % of the 61.6 m roof radius), every 12 degrees from 18 to 78 degrees south of west; each is two adjoining cells.
 */
export const ROOFLIGHT_RADIUS = 34;
export const ROOFLIGHT_AZIMUTHS = [18, 30, 42, 54, 66, 78] as const;
/**
 * The roof's outer edge (R-c: a thin bright band round the dome): a vertical fascia from the top of the glazed wall (the
 * rim nodes' height) up to the skin, SKIN_LIFT high, standing exactly on the roof outline. It stays on the outline, so the
 * roof's 138 m extent (Arup fig.6) is exactly that of its cells and stays as the evidence pack pins it.
 */
export const FASCIA_BOTTOM = 0;

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

// Arup pp.13–16 gives radial box ribs and axial-load diagrid tubes. ASSUMED layout:
// each inner node's nearest angular link in the next ring is a rib; remaining edges are tubes.
function roofRibs(edges: Map<string, {a:number;b:number;uses:number}>, nodes: Diagrid['nodes'], centre: Pt): Set<string> {
  const nearest = new Map<number, {key:string;delta:number}>();
  const angle = (i:number): number => Math.atan2(nodes[i]!.z-centre[1], nodes[i]!.x-centre[0]);
  for (const {a,b} of edges.values()) {
    const na=nodes[a]!, nb=nodes[b]!;
    if (Math.abs(na.ring-nb.ring)!==1 || na.ring<0 || nb.ring<0) continue;
    const inner=na.ring<nb.ring?a:b, outer=inner===a?b:a;
    const raw=Math.abs(angle(inner)-angle(outer)), delta=Math.min(raw,2*Math.PI-raw), key=`${a}:${b}`;
    if (delta < (nearest.get(inner)?.delta ?? Infinity)) nearest.set(inner,{key,delta});
  }
  return new Set([...nearest.values()].map(v=>v.key));
}

function roundMember(batch: Batch, p: V3, q: V3, diameter: number): void {
  const dx=q[0]-p[0], dy=q[1]-p[1], dz=q[2]-p[2], len=Math.hypot(dx,dy,dz);
  const ry=Math.atan2(-dz,dx), rz=Math.asin(dy/len), cy=Math.cos(ry), sy=Math.sin(ry), cz=Math.cos(rz), sz=Math.sin(rz);
  const u: V3=[-sz*cy,cz,sz*sy], v: V3=[sy,0,cy], r=diameter/2;
  const at=(end:V3,t:number):V3=>[end[0]+r*(u[0]*Math.cos(t)+v[0]*Math.sin(t)),
    end[1]+r*(u[1]*Math.cos(t)+v[1]*Math.sin(t)),end[2]+r*(u[2]*Math.cos(t)+v[2]*Math.sin(t))];
  // ASSUMED 0.1 m joint overlap, retained from the box members: 0.05 m at each end.
  const p0:V3=[p[0]-dx*.05/len,p[1]-dy*.05/len,p[2]-dz*.05/len], q0:V3=[q[0]+dx*.05/len,q[1]+dy*.05/len,q[2]+dz*.05/len];
  for(let i=0;i<TUBE_SIDES;i++) {
    const a=i*2*Math.PI/TUBE_SIDES,b=(i+1)*2*Math.PI/TUBE_SIDES;
    const normal=(t:number):V3=>[u[0]*Math.cos(t)+v[0]*Math.sin(t),u[1]*Math.cos(t)+v[1]*Math.sin(t),u[2]*Math.cos(t)+v[2]*Math.sin(t)];
    batch.poly([at(p0,a),at(p0,b),at(q0,b),at(q0,a)],undefined,{normals:[normal(a),normal(b),normal(b),normal(a)]});
  }
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

// Conservative horizontal reach of a radial box: half maximum depth + half width +
// its existing 50 mm joint extension. Tube radius is smaller. Keeping whole cells avoids
// creating unsupported sliver infills along the neighbouring building's surveyed boundary.
const MEMBER_REACH = 0.45 / 2 + RIB_WIDTH / 2 + 0.05;
function cellMeetsBuilding(triangle: Pt[], polygon: Pt[]): boolean {
  if (triangle.some(p => pointInPolygon(p, polygon)) || polygon.some(p => pointInPolygon(p, triangle))) return true;
  const cross = (a: Pt,b: Pt,p: Pt): number => (b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
  const distance = (p: Pt,a: Pt,b: Pt): number => {
    const dx=b[0]-a[0],dz=b[1]-a[1],l=dx*dx+dz*dz;
    const t=l?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/l)):0;
    return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
  };
  for(let i=0;i<triangle.length;i++) for(let j=0;j<polygon.length;j++) {
    const a=triangle[i]!,b=triangle[(i+1)%triangle.length]!,c=polygon[j]!,d=polygon[(j+1)%polygon.length]!;
    if (cross(a,b,c)*cross(a,b,d)<0 && cross(c,d,a)*cross(c,d,b)<0) return true;
    if (Math.min(distance(a,c,d),distance(b,c,d),distance(c,a,b),distance(d,a,b)) <= MEMBER_REACH) return true;
  }
  return false;
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
/** The northern limit of the concourse in shed v: where the OSM station outline turns into the suburban roof. */
function concourseNorth(footprint: Pt[], shed: Pick<ShedLayout, 'origin' | 'heading'>): number {
  const arc = footprint.map(p => worldToShed(shed, p)).filter(p => p.u < -45 && p.v <= WESTERN_RANGE.v1 + .1);
  if (arc.length < 3) throw new Error('the OSM concourse boundary is needed to build its roof');
  return Math.max(...arc.map(p => p.v));
}

/**
 * Plan distance from (x, z) to the roof's outer limit: the nearer of the OSM outline and the northern concourse limit.
 * The Western Range cut is not a roof edge, so it does not count. The height fall to the rim and the glazed brim both use it.
 */
function rimDistance(shed: Pick<ShedLayout, 'origin' | 'heading'>, footprint: Pt[], north: number, x: number, z: number): number {
  let toRim = Math.max(0, north - worldToShed(shed, [x, z]).v);
  for (let i = 0; i < footprint.length; i++) {
    const a = footprint[i]!, b = footprint[(i + 1) % footprint.length]!;
    const dx = b[0] - a[0], dz = b[1] - a[1], length2 = dx * dx + dz * dz;
    const t = length2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / length2)) : 0;
    toRim = Math.min(toRim, Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz));
  }
  return toRim;
}

export function concourseGrid(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout, exclusions: Pt[][] = []): { centre: Pt; grid: Diagrid } {
  const local = footprint.map(p => worldToShed(shed, p));
  const north = concourseNorth(footprint, shed);
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
    const toRim = rimDistance(shed, footprint, north, n.x, n.z);
    n.height = concourseHeight(canopy, canopy.radius * n.r / (n.r + toRim));
  }
  // OSM buildings are distinct domains even where the coarse station roof outline overlaps.
  // Exclude crossing cells, including member sections, rather than testing cell centroids.
  grid.tris = grid.tris.filter(t => !exclusions.some(polygon =>
    cellMeetsBuilding(t.map(i => [grid.nodes[i]!.x, grid.nodes[i]!.z] as Pt), polygon)));
  return { centre, grid };
}

/** ASSUMED retained trumpet envelope, [radius, height] metres; not a measured member centreline. */
export function columnProfile(apex: number): [number, number][] {
  const top = apex - 0.1;
  return [[2.2, 0], [1.5, 0.35], [1.3, 1.2], [1.25, 7], [1.5, 9.5], [2.2, 12.5], [3.4, 15.8], [4.6, top - 1.6], [FUNNEL_RADIUS, top]];
}

// JMP built photograph (brickwork visible through the stalk):
// https://mcaslan.agencyprojects.com/storage/app/uploads/public/69a/2c2/318/69a2c23185a88699376861.jpg
// Arup Journal 2/2012 pp.13–16 describes the funnel/diagrid, not a solid skin.
// ASSUMED member layout: the retained envelope's levels carry 12→36 nodes,
// alternating half-pitch rotations; each upper node branches to its two nearest
// lower neighbours. This is an open visual approximation, not fabricated-steel setting out.
const COLUMN_MEMBER = .18; // ASSUMED square white member width, metres
export function columnMembers(apex: number): {nodes: V3[]; edges: [number, number][]} {
  const nodes: V3[] = [], edges: [number, number][] = [];
  const counts = [12, 12, 12, 12, 12, 18, 24, 30, 36]; // ASSUMED circumferential densities
  let previous: number[] = [];
  for (const [level, [radius, y]] of columnProfile(apex).entries()) {
    const count = counts[level]!;
    const current: number[] = [];
    for (let i = 0; i < count; i++) {
      const angle = (i + (level % 2) * .5) * 2 * Math.PI / count; // ASSUMED angular phase
      // Inset the square section's half diagonal to retain the existing outer envelope.
      const r = radius - COLUMN_MEMBER / Math.sqrt(2);
      current.push(nodes.length);
      nodes.push([r * Math.cos(angle), y, r * Math.sin(angle)]);
      if (previous.length) {
        const nearest = [...previous].sort((a,b) => {
          const distance = (n: number): number => Math.hypot(nodes[n]![0]-nodes.at(-1)![0], nodes[n]![2]-nodes.at(-1)![2]);
          return distance(a)-distance(b);
        });
        for (const a of nearest.slice(0, 2)) edges.push([a, nodes.length-1]);
      }
    }
    previous = current;
  }
  return {nodes, edges};
}

function columnGeometry(apex: number): THREE.BufferGeometry {
  const batch = new Batch(), {nodes, edges} = columnMembers(apex);
  // ASSUMED horizontal square sections at each joint, joined by four planar faces.
  // No shell, infill or end caps: shared joints meet, and foot/top ends meet floor/roof.
  const h = COLUMN_MEMBER / 2;
  const corners = [[-h,-h],[-h,h],[h,h],[h,-h]] as const;
  for (const [a,b] of edges) {
    const p=nodes[a]!, q=nodes[b]!;
    for (let i=0;i<4;i++) {
      const c=corners[i]!, d=corners[(i+1)%4]!;
      batch.poly([[p[0]+c[0],p[1],p[2]+c[1]], [p[0]+d[0],p[1],p[2]+d[1]],
        [q[0]+d[0],q[1],q[2]+d[1]], [q[0]+c[0],q[1],q[2]+c[1]]]);
    }
  }
  return batch.build();
}

// ---------------------------------------------------------------------------------------------
// Roof materials. Local to this module, the pattern landmarks.ts and kxcentral.ts use: the shared set in
// materials.ts has no soffit, no cladding and no daylit glazing, and the lighting iterator owns that file.

/**
 * One roof cell drawn in UVs that run 0 to 1 across the cell, whatever its size or shape. A 'triangle' cell has its three
 * corners at (0,0), (1,0), (0,1) (barycentric); a 'diamond' (two cells either side of a rib) has its corners at (0,0),
 * (1,0), (1,1), (0,1) in order round it. Full brightness in the middle, falling toward the cell's edges to `edge` (the
 * share of the middle's LIGHT, in linear terms, that is left at the edge), where the ribs and the cell's own curvature
 * shade it (R-a/conc-ab: each soffit cell reads as a shallow pillow between deep white ribs; R-c, R-c2: the cladding's
 * diamonds show faint seams). Null where there is no document (Node): the vertex colours then carry the tone. 64 px,
 * well inside the pack's 1,024 px limit.
 */
function pillowTexture(shape: 'triangle' | 'diamond', edge: number): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (!g) return null;
  const image = g.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const u = (x + 0.5) / 64, v = 1 - (y + 0.5) / 64;
      // 0 on an edge of the cell, 1/3 (triangle) or 1/2 (diamond) at its centre
      const nearest = shape === 'triangle' ? Math.min(u, v, 1 - u - v) : Math.min(u, v, 1 - u, 1 - v);
      const t = Math.max(0, Math.min(1, nearest / (shape === 'triangle' ? 0.26 : 0.18)));
      const light = edge + (1 - edge) * t * t * (3 - 2 * t); // linear light; the texture holds sRGB
      const shade = Math.round(255 * Math.pow(light, 1 / 2.2));
      const k = (y * 64 + x) * 4;
      image.data[k] = image.data[k + 1] = image.data[k + 2] = shade;
      image.data[k + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

interface RoofMaterials {
  /** the underside of the roof between the members; also the fascia round the roof's edge */
  soffit: THREE.Material;
  /** the silver cladding on top */
  cladding: THREE.Material;
  /** the glazing seen from below (round the funnel, in the brim, the rooflights): it glows, as daylight does */
  skylight: THREE.Material;
  /** the same glazing seen from above: dark and reflective, as R-c shows the rooflights */
  skylightTop: THREE.Material;
  /** white painted steel: the ribs, the diagonals, the mullions, the funnel */
  member: THREE.Material;
}
let roofMaterials: RoofMaterials | null = null;

function roofMaterial(): RoofMaterials {
  if (roofMaterials) return roofMaterials;
  roofMaterials = {
    // The scene's lights shine from above, so a lit underside would come out black (materials.ts gives the shed's
    // 'lining' an emissive term for the same reason). Unlit instead: R-a shows a pale, even, light grey soffit.
    soffit: new THREE.MeshBasicMaterial({ map: pillowTexture('triangle', 0.5), color: 0xffffff, vertexColors: true, side: THREE.DoubleSide, name: 'concourse-soffit' }),
    // R-c, R-c2: a silver-grey skin of diamonds, each facet catching the sky a little differently, with faint seams.
    cladding: new THREE.MeshPhongMaterial({ map: pillowTexture('diamond', 0.62), color: 0xffffff, vertexColors: true, specular: 0xaab4c0, shininess: 46, name: 'concourse-cladding' }),
    // Glass that glows from below, so the glazing reads as daylight (the same device as materials.ts' shedGlass): R-a and
    // conc-ab show the glazing round the funnel as the brightest part of the picture.
    skylight: new THREE.MeshPhongMaterial({ color: 0xdfeaf6, emissive: 0xbdd2e6, specular: 0xffffff, shininess: 90, transparent: true, opacity: 0.86, side: THREE.BackSide, depthWrite: false, name: 'concourse-skylight' }),
    // From above the same panes read dark and glassy (R-c: the rooflights are dark diamonds in the silver), with the sun's glint.
    skylightTop: new THREE.MeshPhongMaterial({ color: 0x6f8aa5, emissive: 0x16202b, specular: 0xffffff, shininess: 120, transparent: true, opacity: 0.66, side: THREE.FrontSide, depthWrite: false, name: 'concourse-skylight-top' }),
    // Painted white steel seen from below needs the same emissive lift (ribPaint in materials.ts is the shed's version).
    member: new THREE.MeshLambertMaterial({ color: 0xf7f9fb, emissive: 0xbcc1c7, name: 'concourse-member' }),
  };
  return roofMaterials;
}

type Tri = [number, number, number];

/** The cells (indices into `kept`) that use each undirected edge, keyed as in edgesOf: one for a boundary edge, two inside. */
function cellsByEdge(kept: Tri[]): Map<string, number[]> {
  const sharing = new Map<string, number[]>();
  kept.forEach((t, i) => {
    for (let e = 0; e < 3; e++) {
      const p = t[e]!, q = t[(e + 1) % 3]!;
      const key = `${Math.min(p, q)}:${Math.max(p, q)}`;
      sharing.set(key, [...(sharing.get(key) ?? []), i]);
    }
  });
  return sharing;
}

/**
 * Which of the kept cells are glazed (indices into `kept`): the cells round the funnel, the brim round the outline,
 * and the rooflights. Published: 15 % of the roof, 1,012 panels "at the perimeter and towards the funnel" (refs/DIMENSIONS.md
 * section 2); R-a, R-c, R-c2 show where. Everything else is solid.
 */
export function glazedCells(d: Diagrid, kept: Tri[], centre: Pt, shed: Pick<ShedLayout, 'origin' | 'heading'>, rim: (x: number, z: number) => number): Set<number> {
  const mid = kept.map((t): Pt => [(d.nodes[t[0]]!.x + d.nodes[t[1]]!.x + d.nodes[t[2]]!.x) / 3, (d.nodes[t[0]]!.z + d.nodes[t[1]]!.z + d.nodes[t[2]]!.z) / 3]);
  const glazed = new Set<number>();
  mid.forEach(([x, z], i) => {
    if (Math.hypot(x - centre[0], z - centre[1]) < FUNNEL_GLAZING_RADIUS || rim(x, z) < RIM_GLAZING_WIDTH) glazed.add(i);
  });
  const sharing = cellsByEdge(kept);
  const funnel = worldToShed(shed, centre);
  for (const azimuth of ROOFLIGHT_AZIMUTHS) {
    const a = (azimuth * Math.PI) / 180;
    const target = shedToWorld(shed, funnel.u - ROOFLIGHT_RADIUS * Math.cos(a), funnel.v - ROOFLIGHT_RADIUS * Math.sin(a));
    const from = (i: number): number => Math.hypot(mid[i]![0] - target[0], mid[i]![1] - target[1]);
    let first = -1;
    mid.forEach((_, i) => { if (!glazed.has(i) && (first < 0 || from(i) < from(first))) first = i; });
    if (first < 0) continue;
    // The neighbour across one of its edges that sits closest to the target: two triangles make the rhombus.
    let second = -1;
    for (let e = 0; e < 3; e++) {
      const p = kept[first]![e]!, q = kept[first]![(e + 1) % 3]!;
      for (const j of sharing.get(`${Math.min(p, q)}:${Math.max(p, q)}`) ?? []) if (j !== first && !glazed.has(j) && (second < 0 || from(j) < from(second))) second = j;
    }
    glazed.add(first);
    if (second >= 0) glazed.add(second);
  }
  return glazed;
}

export function buildConcourse(canopy: ConcourseCanopy, footprint: Pt[], shed: ShedLayout, exclusions: Pt[][] = []): THREE.Group {
  const { centre, grid: d } = concourseGrid(canopy, footprint, shed, exclusions);
  const [cx, cz] = centre;
  const kept = keepTriangles(d, footprint, shed);
  const height = (n: Diagrid['nodes'][number]): number => n.height ?? concourseHeight(canopy, n.r);
  const at = (i: number): V3 => {
    const n = d.nodes[i] as Diagrid['nodes'][number];
    return [n.x, height(n), n.z];
  };
  const mat = roofMaterial();
  const north = concourseNorth(footprint, shed);

  const members = new Batch();
  const glass = new Batch();
  const soffit = new Batch({ colored: true });
  const cladding = new Batch({ colored: true });
  const floor = new Batch();
  const wall = new Batch();
  const mullions = new Batch();
  const edges = edgesOf(kept);
  const ribs = roofRibs(edges, d.nodes, centre);
  const addRib = ({a,b}: {a:number;b:number}): void => {
    const p = at(a);
    const q = at(b);
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const dz = q[2] - p[2];
    const len = Math.hypot(dx, dy, dz);
    const r = (d.nodes[a]!.r + d.nodes[b]!.r) / 2, t = Math.max(0, Math.min(1, (r - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS)));
    const depth = 0.45 - 0.20 * t; // ASSUMED linear change from 450 mm at the funnel to 250 mm at the rim.
    members.box([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2], [len + 0.1, depth, RIB_WIDTH], { rotZ: Math.asin(dy / len), rotY: Math.atan2(-dz, dx), skip: ['+x', '-x'] });
  };
  const addTube = ({a,b}: {a:number;b:number}): void => {
    const r = (d.nodes[a]!.r + d.nodes[b]!.r) / 2, t = Math.max(0, Math.min(1, (r - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS)));
    roundMember(members, at(a), at(b), 0.219 - 0.080 * t); // ASSUMED linear interpolation within Arup's 139–219 mm range.
  };
  for (const edge of edges.values()) if (ribs.has(`${edge.a}:${edge.b}`)) addRib(edge);
  for (const edge of edges.values()) if (!ribs.has(`${edge.a}:${edge.b}`)) addTube(edge);

  // The roof between the members. Glazed cells are glass. Solid cells have a soffit, one triangle per cell (bright, seen
  // from below), and silver cladding above it: the two cells either side of a rib make one diamond facet (R-c, R-c2: the
  // dome is scaled in diamonds, the lines of the crossing diagonals), bulged into a shallow pyramid so that its halves catch
  // the sky differently. The build-up is vertical offsets of the node surface (SOFFIT_LIFT, SKIN_LIFT, FACET_RISE).
  const rim = (x: number, z: number): number => rimDistance(shed, footprint, north, x, z);
  const glazed = glazedCells(d, kept, centre, shed, rim);
  const sharing = cellsByEdge(kept);
  const tone = rng(0x4b58);
  const SOFFIT_TONE = rgb(0xdadee2), CLADDING_TONE = rgb(0xc6c8cb), UP: V3 = [0, 1, 0]; // CLADDING_TONE: the dome's mean in R-c is about (154, 152, 146)
  const scaled = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];
  const nodeAt = (i: number, by: number): V3 => { const p = at(i); return [p[0], p[1] + by, p[2]]; };
  const barycentric: [V2, V2, V2] = [[0, 0], [1, 0], [0, 1]];
  kept.forEach((t, i) => {
    if (glazed.has(i)) {
      glass.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)], undefined, { facing: UP });
      return;
    }
    const rMid = (d.nodes[t[0]]!.r + d.nodes[t[1]]!.r + d.nodes[t[2]]!.r) / 3;
    const outer = Math.max(0, Math.min(1, (rMid - FUNNEL_RADIUS) / (canopy.radius - FUNNEL_RADIUS)));
    // Each cell a shade of its own (ASSUMED +-4 %), the soffit dimming a little toward the rim as the daylight thins.
    soffit.poly([nodeAt(t[0], SOFFIT_LIFT), nodeAt(t[1], SOFFIT_LIFT), nodeAt(t[2], SOFFIT_LIFT)], barycentric, { facing: UP, color: scaled(SOFFIT_TONE, (0.96 + 0.08 * tone()) * (1 - 0.1 * outer)) });
  });
  const paired = new Set<number>();
  for (const [key, pair] of sharing) {
    if (!ribs.has(key) || pair.length !== 2) continue;
    const [i, j] = pair as [number, number];
    if (glazed.has(i) || glazed.has(j) || paired.has(i) || paired.has(j)) continue;
    paired.add(i);
    paired.add(j);
    const [a, b] = key.split(':').map(Number) as [number, number];
    const third = (k: number): number => kept[k]!.find(n => n !== a && n !== b)!;
    const A = nodeAt(a, SKIN_LIFT), B = nodeAt(b, SKIN_LIFT), C = nodeAt(third(i), SKIN_LIFT), D = nodeAt(third(j), SKIN_LIFT);
    const M: V3 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2 + FACET_RISE, (A[2] + B[2]) / 2];
    const color = scaled(CLADDING_TONE, 0.9 + 0.2 * tone()); // ASSUMED +-10 % from diamond to diamond
    const corners: [V3, V2][] = [[A, [0, 0]], [C, [1, 0]], [B, [1, 1]], [D, [0, 1]]];
    for (let k = 0; k < 4; k++) {
      const [p, up] = corners[k]!, [q, uq] = corners[(k + 1) % 4]!;
      cladding.poly([p, q, M], [up, uq, [0.5, 0.5]], { facing: UP, color });
    }
  }
  kept.forEach((t, i) => { // a solid cell with no partner across its rib (beside the glazing, or at an edge): a flat facet
    if (glazed.has(i) || paired.has(i)) return;
    cladding.poly([nodeAt(t[0], SKIN_LIFT), nodeAt(t[1], SKIN_LIFT), nodeAt(t[2], SKIN_LIFT)], [[0, 0], [1, 0], [1, 1]], { facing: UP, color: scaled(CLADDING_TONE, 0.9 + 0.2 * tone()) });
  });
  // The funnel's oculus: the roof's own centre, glazed, over the open top of the funnel (R-a: bright glass inside the funnel's crown).
  const crown = d.nodes.filter(n => n.ring === 0);
  for (let i = 0; i < crown.length; i++) {
    const p = crown[i]!, q = crown[(i + 1) % crown.length]!;
    glass.poly([[cx, canopy.apex + SKIN_LIFT, cz], [p.x, height(p) + SKIN_LIFT, p.z], [q.x, height(q) + SKIN_LIFT, q.z]], undefined, { facing: UP });
  }

  // The ground meets the surveyed station/hotel boundary independently of the coarse roof
  // cells and their steel clearance. Clip the complete OSM outline at the same façade and
  // northern concourse limits, retaining its small corners instead of bridging them with ribs.
  let groundOutline = footprint;
  for (const value of [(p: Pt): number => -WESTERN_RANGE.depth - .3 - worldToShed(shed,p).u,
    (p: Pt): number => north - worldToShed(shed,p).v]) {
    const clipped: Pt[] = [];
    for(let i=0;i<groundOutline.length;i++) {
      const a=groundOutline[i]!,b=groundOutline[(i+1)%groundOutline.length]!,va=value(a),vb=value(b);
      if(va>=0) clipped.push(a);
      if((va>=0)!==(vb>=0)) { const t=va/(va-vb); clipped.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]); }
    }
    groundOutline=clipped;
  }
  for(const tri of THREE.ShapeUtils.triangulateShape(groundOutline.map(p=>new THREE.Vector2(...p)),[])) {
    let [a,b,c]=tri.map(i=>groundOutline[i]!) as [Pt,Pt,Pt];
    if((b[1]-a[1])*(c[0]-a[0])-(b[0]-a[0])*(c[1]-a[1])<0) [b,c]=[c,b];
    floor.poly([[a[0],.02,a[1]],[b[0],.02,b[1]],[c[0],.02,c[1]]],[a,b,c]);
  }

  // a glazed wall round the rim: every edge used by one kept triangle on the ring at the rim, from the floor to the roof edge
  const post = new Set<number>();
  const rimEdges = [...edges.values()].filter(e => e.uses === 1 && d.nodes[e.a]!.ring === d.rings && d.nodes[e.b]!.ring === d.rings);
  const FASCIA_TONE = rgb(0xdfe3e7);
  for (const e of rimEdges) {
    const p = at(e.a);
    const q = at(e.b);
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
    // the quad faces the right of its direction of travel (see wallQuad): travel the way that points it away from the column
    const nx = -(q[2] - p[2]);
    const nz = q[0] - p[0];
    const out = nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[2] + q[2]) / 2 - cz) > 0;
    const [s, t] = out ? [p, q] : [q, p];
    wall.quad([s[0], 0, s[2]], [t[0], 0, t[2]], [t[0], t[1], t[2]], [s[0], s[1], s[2]], [0, 0], [len, 0], [len, t[1]], [0, s[1]]);
    // The fascia: the roof's edge above the glazed wall (R-c: a thin bright band round the dome), up to the skin. It goes in the
    // soffit mesh, which in this way reaches the whole roof outline although the brim cells themselves are glazed.
    soffit.poly([[s[0], s[1] + FASCIA_BOTTOM, s[2]], [t[0], t[1] + FASCIA_BOTTOM, t[2]], [t[0], t[1] + SKIN_LIFT, t[2]], [s[0], s[1] + SKIN_LIFT, s[2]]],
      [[0.34, 0.34], [0.34, 0.34], [0.34, 0.34], [0.34, 0.34]], { facing: [nx * (out ? 1 : -1), 0, nz * (out ? 1 : -1)], color: FASCIA_TONE });
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
  add(members, mat.member, 'concourse-lattice');
  add(soffit, mat.soffit, 'concourse-panels');
  add(cladding, mat.cladding, 'concourse-cladding');
  if (glass.count > 0) { // one geometry, two looks: bright from below, dark and glinting from above
    const panes = glass.build();
    for (const [m, name] of [[mat.skylight, 'concourse-glass'], [mat.skylightTop, 'concourse-glass-top']] as const) {
      const mesh = new THREE.Mesh(panes, m);
      mesh.name = name;
      mesh.renderOrder = 3;
      group.add(mesh);
    }
  }
  add(wall, material('glass'), 'concourse-wall', 3);
  add(mullions, mat.member, 'concourse-mullions');
  add(floor, material('concourseFloor'), 'concourse-floor');
  // Open branching stalk, batched into one mesh at the retained position.
  const column = new THREE.Mesh(columnGeometry(canopy.apex), mat.member);
  column.name = 'concourse-column';
  column.position.set(cx, 0, cz);
  group.add(column);
  return group;
}
